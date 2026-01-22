const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const { createCanvas } = require("canvas");
const { LimitedMap } = require("../utils/memoryUtils");
const {
  loadImageFromURL,
  createValorantBackground,
  createAccentBorder,
  drawGlowText,
  drawPlayerSlotBackground,
  getRankColor,
  getRankAbbreviation,
} = require("../utils/valorantCanvasUtils");

// Import functions from the API handler (with persistent storage)
const apiHandler = require("./valorantApiHandler");
const { saveTeamToHistory } = require("../database/helpers/teamHistoryHelpers");
const { getAgentById, getAgentsByRole, getAllRoles, ROLE_EMOJIS, ROLE_COLORS } = require("../valorantApi/agentUtils");

// Configuration
const RAW_VALORANT_ROLE_ID = "1166209212418904145";
const TEAM_NAME = "RaW Premiere";
const MAX_PLAYERS = 7; // 5 active + 2 bench

// Store active teams (auto-cleanup with size limit of 50)
const activeTeams = new LimitedMap(50);

// Cache for rank data to avoid repeated API calls (TTL: 5 minutes)
const rankCache = new LimitedMap(100);
const RANK_CACHE_TTL = 5 * 60 * 1000;

// Resend interval in milliseconds (10 minutes)
const RESEND_INTERVAL = 10 * 60 * 1000;
const TEAM_LIFETIME = 4 * 60 * 60 * 1000; // 4 hours

// Phase constants
const PHASES = {
  AVAILABILITY: "availability",
  TEAM_BUILDING: "team_building",
  READY: "ready",
};

/**
 * Batch fetch rank info for multiple users with caching
 */
async function batchGetUserRankInfo(guildId, userIds) {
  const results = new Map();
  const now = Date.now();
  const idsToFetch = [];

  // Check cache first
  for (const userId of userIds) {
    const cacheKey = `${guildId}_${userId}`;
    const cached = rankCache.get(cacheKey);
    if (cached && now - cached.timestamp < RANK_CACHE_TTL) {
      results.set(userId, cached.data);
    } else {
      idsToFetch.push(userId);
    }
  }

  // Fetch uncached ranks in parallel
  if (idsToFetch.length > 0) {
    const fetchPromises = idsToFetch.map(async (userId) => {
      try {
        const registration = await apiHandler.getUserRegistration(guildId, userId);
        if (!registration) return { userId, data: null };

        // Always include preferred agents from registration
        const preferredAgents = registration.preferredAgents || [];

        const rankData = await apiHandler.getUserRankData(guildId, userId);
        if (!rankData) {
          // Return data with preferred agents even if rank fetch fails
          return {
            userId,
            data: {
              ...apiHandler.RANK_MAPPING[0], // Unranked default
              tier: 0,
              rr: 0,
              preferredAgents,
            },
          };
        }

        const rankInfo =
          apiHandler.RANK_MAPPING[rankData.tier] || apiHandler.RANK_MAPPING[0];
        const data = {
          ...rankInfo,
          tier: rankData.tier,
          rr: rankData.rr,
          preferredAgents,
        };
        return { userId, data };
      } catch {
        return { userId, data: null };
      }
    });

    const fetchResults = await Promise.all(fetchPromises);
    for (const { userId, data } of fetchResults) {
      results.set(userId, data);
      const cacheKey = `${guildId}_${userId}`;
      rankCache.set(cacheKey, { data, timestamp: now });
    }
  }

  return results;
}

/**
 * Get total available players count
 */
function getTotalAvailable(team) {
  return team.availablePlayers.length;
}

/**
 * Calculate role composition from active roster
 */
function calculateRoleComposition(activeRoster, agentAssignments) {
  const comp = { Controller: 0, Duelist: 0, Initiator: 0, Sentinel: 0 };
  for (const player of activeRoster) {
    const agentId = agentAssignments.get(player.id) || player.preferredAgents?.[0];
    if (agentId) {
      const agent = getAgentById(agentId);
      if (agent) comp[agent.role]++;
    }
  }
  return comp;
}

/**
 * Create optimized team visualization with batch rank loading
 */
async function createTeamVisualization(team) {
  const showBench = team.phase === PHASES.TEAM_BUILDING || team.phase === PHASES.READY;
  const canvasWidth = 800;
  const canvasHeight = showBench ? 420 : 320;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Use shared background utility
  createValorantBackground(ctx, canvasWidth, canvasHeight);
  createAccentBorder(ctx, canvasWidth, canvasHeight, "#ff4654", 6);

  // Phase-specific title
  const phaseTitle = {
    [PHASES.AVAILABILITY]: "AVAILABILITY",
    [PHASES.TEAM_BUILDING]: "TEAM BUILDING",
    [PHASES.READY]: "READY TO PLAY",
  };

  const titleText = `🎯 ${team.name.toUpperCase()} - ${phaseTitle[team.phase]}`;
  drawGlowText(ctx, titleText, canvasWidth / 2, 35, {
    font: "bold 24px Arial",
    glowColor: "#ff4654",
  });

  // Status line
  const totalAvailable = getTotalAvailable(team);
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "center";

  if (team.phase === PHASES.AVAILABILITY) {
    ctx.fillStyle = totalAvailable >= 5 ? "#00ff88" : "#ffaa00";
    ctx.fillText(
      `${totalAvailable}/${MAX_PLAYERS} Available ${totalAvailable >= 5 ? "- Ready to Build!" : "- Need 5+ to Build"}`,
      canvasWidth / 2,
      58
    );
  } else {
    ctx.fillStyle = team.activeRoster.length >= 5 ? "#00ff88" : "#ffaa00";
    ctx.fillText(
      `Active: ${team.activeRoster.length}/5 | Bench: ${team.bench.length}/2`,
      canvasWidth / 2,
      58
    );
  }

  // Layout constants
  const slotWidth = 130;
  const slotHeight = 130;
  const startY = 75;
  const spacing = 145;

  // Get all player IDs for rank fetch
  const allPlayers = team.phase === PHASES.AVAILABILITY
    ? team.availablePlayers
    : [...team.activeRoster, ...team.bench];
  const userIds = allPlayers.map((m) => m.id);
  const rankInfoMap = await batchGetUserRankInfo(team.guildId, userIds);

  // Batch load all avatars in parallel
  const avatarPromises = allPlayers.slice(0, 7).map(async (member) => {
    if (!member) return null;
    const avatarURL =
      member.avatarURL ||
      `https://cdn.discordapp.com/embed/avatars/${parseInt(member.id) % 5}.png`;
    try {
      return await loadImageFromURL(avatarURL);
    } catch {
      return null;
    }
  });
  const avatars = await Promise.all(avatarPromises);

  if (team.phase === PHASES.AVAILABILITY) {
    // Availability phase: Show all available players in a grid
    await drawAvailabilityGrid(ctx, team, rankInfoMap, avatars, canvasWidth, startY);
  } else {
    // Team building / Ready phase: Show active roster + bench
    await drawActiveRoster(ctx, team, rankInfoMap, avatars.slice(0, 5), canvasWidth, startY, slotWidth, slotHeight, spacing);

    // Role composition bar
    const roleY = startY + slotHeight + 50;
    drawRoleCompositionBar(ctx, team.activeRoster, team.agentAssignments, canvasWidth, roleY);

    // Bench section
    if (showBench && team.bench.length > 0) {
      const benchY = roleY + 40;
      await drawBenchSection(ctx, team, rankInfoMap, avatars.slice(5, 7), canvasWidth, benchY);
    }
  }

  return canvas.toBuffer();
}

/**
 * Draw availability grid for Phase 1
 */
async function drawAvailabilityGrid(ctx, team, rankInfoMap, avatars, canvasWidth, startY) {
  const players = team.availablePlayers;
  const slotWidth = 100;
  const slotHeight = 110;
  const slotsPerRow = 4;
  const xSpacing = 180;
  const ySpacing = 125;
  const startX = (canvasWidth - (Math.min(players.length, slotsPerRow) * xSpacing - (xSpacing - slotWidth))) / 2;

  for (let i = 0; i < Math.min(players.length, MAX_PLAYERS); i++) {
    const row = Math.floor(i / slotsPerRow);
    const col = i % slotsPerRow;
    const x = startX + col * xSpacing;
    const y = startY + row * ySpacing;
    const player = players[i];
    const isHost = player.id === team.host.id;

    // Slot background
    drawPlayerSlotBackground(ctx, x, y, slotWidth, slotHeight, true, isHost ? "#ffd700" : "#ff4654");

    // Avatar
    const avatar = avatars[i];
    if (avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + slotWidth / 2, y + 35, 25, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, x + slotWidth / 2 - 25, y + 10, 50, 50);
      ctx.restore();
    } else {
      ctx.fillStyle = "#5865f2";
      ctx.beginPath();
      ctx.arc(x + slotWidth / 2, y + 35, 25, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "24px Arial";
      ctx.textAlign = "center";
      ctx.fillText("👤", x + slotWidth / 2, y + 43);
    }

    // Host crown
    if (isHost) {
      ctx.font = "18px Arial";
      ctx.fillStyle = "#ffd700";
      ctx.shadowColor = "#ffd700";
      ctx.shadowBlur = 5;
      ctx.textAlign = "center";
      ctx.fillText("👑", x + slotWidth / 2, y - 2);
      ctx.shadowBlur = 0;
    }

    // Username
    ctx.font = "bold 11px Arial";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    const displayName = player.displayName || player.username;
    const truncatedName = displayName.length > 14 ? displayName.substring(0, 13) + "…" : displayName;
    ctx.fillText(truncatedName, x + slotWidth / 2, y + 72);

    // Rank info
    const userRankInfo = rankInfoMap.get(player.id);
    if (userRankInfo) {
      const rankColor = userRankInfo.color || getRankColor(userRankInfo.tier);
      ctx.font = "bold 9px Arial";
      ctx.fillStyle = rankColor;
      ctx.fillText(`${userRankInfo.name} (${userRankInfo.rr} RR)`, x + slotWidth / 2, y + 86);

      // Preferred agents
      if (userRankInfo.preferredAgents && userRankInfo.preferredAgents.length > 0) {
        ctx.font = "9px Arial";
        ctx.fillStyle = "#aaaaaa";
        const agentText = userRankInfo.preferredAgents
          .slice(0, 3)
          .map(id => {
            const agent = getAgentById(id);
            return agent ? agent.name.substring(0, 4) : id.substring(0, 4);
          })
          .join("/");
        ctx.fillText(agentText, x + slotWidth / 2, y + 100);
      }
    } else {
      ctx.font = "bold 9px Arial";
      ctx.fillStyle = "#666";
      ctx.fillText("!valstats", x + slotWidth / 2, y + 86);
    }

    // Slot number
    ctx.fillStyle = "#aaa";
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${i + 1}`, x + slotWidth / 2, y + slotHeight + 12);
  }

  // Draw empty slots if < 7 players
  for (let i = players.length; i < MAX_PLAYERS; i++) {
    const row = Math.floor(i / slotsPerRow);
    const col = i % slotsPerRow;
    const x = startX + col * xSpacing;
    const y = startY + row * ySpacing;

    drawPlayerSlotBackground(ctx, x, y, slotWidth, slotHeight, false, "#ff4654");
    ctx.fillStyle = "#555";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("OPEN", x + slotWidth / 2, y + slotHeight / 2 - 5);
    ctx.font = "10px Arial";
    ctx.fillStyle = "#888";
    ctx.fillText("Click Available", x + slotWidth / 2, y + slotHeight / 2 + 10);

    // Dashed border
    ctx.strokeStyle = "rgba(255, 70, 84, 0.4)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x + 5, y + 5, slotWidth - 10, slotHeight - 10);
    ctx.setLineDash([]);
  }
}

/**
 * Draw active roster for Phase 2/3
 */
async function drawActiveRoster(ctx, team, rankInfoMap, avatars, canvasWidth, startY, slotWidth, slotHeight, spacing) {
  const startX = (canvasWidth - (5 * spacing - (spacing - slotWidth))) / 2;

  for (let i = 0; i < 5; i++) {
    const x = startX + i * spacing;
    const y = startY;
    const player = team.activeRoster[i];
    const isFilled = !!player;

    drawPlayerSlotBackground(ctx, x, y, slotWidth, slotHeight, isFilled, "#ff4654");

    if (player) {
      const avatar = avatars[i];
      const isHost = player.id === team.host.id;

      // Host glow
      if (isHost) {
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 15;
      }

      // Avatar
      if (avatar) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + slotWidth / 2, y + 40, 30, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, x + slotWidth / 2 - 30, y + 10, 60, 60);
        ctx.restore();
      } else {
        ctx.fillStyle = "#5865f2";
        ctx.beginPath();
        ctx.arc(x + slotWidth / 2, y + 40, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "30px Arial";
        ctx.textAlign = "center";
        ctx.fillText("👤", x + slotWidth / 2, y + 50);
      }
      ctx.shadowBlur = 0;

      // Host crown
      if (isHost) {
        ctx.font = "20px Arial";
        ctx.fillStyle = "#ffd700";
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 5;
        ctx.textAlign = "center";
        ctx.fillText("👑", x + slotWidth / 2, y - 3);
        ctx.shadowBlur = 0;
      }

      // Username
      ctx.font = "bold 11px Arial";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      const displayName = player.displayName || player.username;
      const truncatedName = displayName.length > 14 ? displayName.substring(0, 13) + "…" : displayName;
      ctx.fillText(truncatedName, x + slotWidth / 2, y + 82);

      // Assigned agent (highlighted) or preferred agent
      const assignedAgent = team.agentAssignments.get(player.id);
      const userRankInfo = rankInfoMap.get(player.id);

      if (assignedAgent) {
        const agent = getAgentById(assignedAgent);
        if (agent) {
          ctx.fillStyle = ROLE_COLORS[agent.role] || "#ffffff";
          ctx.font = "bold 10px Arial";
          ctx.fillText(`${agent.emoji} ${agent.name}`, x + slotWidth / 2, y + 96);
        }
      } else if (userRankInfo && userRankInfo.preferredAgents && userRankInfo.preferredAgents.length > 0) {
        ctx.font = "9px Arial";
        ctx.fillStyle = "#aaaaaa";
        const agentText = userRankInfo.preferredAgents
          .slice(0, 2)
          .map(id => {
            const agent = getAgentById(id);
            return agent ? agent.name.substring(0, 5) : id.substring(0, 5);
          })
          .join("/");
        ctx.fillText(agentText, x + slotWidth / 2, y + 96);
      }

      // Rank indicator
      if (userRankInfo) {
        const rankColor = userRankInfo.color || getRankColor(userRankInfo.tier);
        ctx.fillStyle = rankColor;
        ctx.beginPath();
        ctx.arc(x + slotWidth - 18, y + slotHeight - 18, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "bold 8px Arial";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        const rankAbbr = getRankAbbreviation(userRankInfo.tier);
        ctx.fillText(rankAbbr, x + slotWidth - 18, y + slotHeight - 15);

        // RR display
        ctx.font = "bold 9px Arial";
        ctx.fillStyle = rankColor;
        ctx.fillText(`${userRankInfo.rr} RR`, x + slotWidth / 2, y + 110);
      }
    } else {
      // Empty slot
      ctx.fillStyle = "#555";
      ctx.font = "bold 13px Arial";
      ctx.textAlign = "center";
      ctx.fillText("OPEN", x + slotWidth / 2, y + slotHeight / 2 - 5);
      ctx.font = "11px Arial";
      ctx.fillStyle = "#888";
      ctx.fillText("Select Player", x + slotWidth / 2, y + slotHeight / 2 + 12);

      ctx.strokeStyle = "rgba(255, 70, 84, 0.4)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x + 8, y + 8, slotWidth - 16, slotHeight - 16);
      ctx.setLineDash([]);
    }

    // Slot number
    ctx.fillStyle = "#aaa";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${i + 1}`, x + slotWidth / 2, y + slotHeight + 15);
  }
}

/**
 * Draw role composition bar
 */
function drawRoleCompositionBar(ctx, activeRoster, agentAssignments, canvasWidth, y) {
  const comp = calculateRoleComposition(activeRoster, agentAssignments);
  const roles = getAllRoles();
  const barWidth = 600;
  const startX = (canvasWidth - barWidth) / 2;

  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.fillStyle = "#888";
  ctx.fillText("ROLE COMPOSITION", canvasWidth / 2, y - 5);

  let currentX = startX;
  const segmentWidth = barWidth / 4;

  for (const role of roles) {
    const count = comp[role];
    const color = ROLE_COLORS[role];
    const emoji = ROLE_EMOJIS[role];

    ctx.fillStyle = count > 0 ? color : "#333";
    ctx.fillRect(currentX, y + 5, segmentWidth - 5, 20);

    ctx.fillStyle = count > 0 ? "#fff" : "#666";
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${emoji} ${role.substring(0, 4)}: ${count}`, currentX + (segmentWidth - 5) / 2, y + 19);

    currentX += segmentWidth;
  }
}

/**
 * Draw bench section
 */
async function drawBenchSection(ctx, team, rankInfoMap, avatars, canvasWidth, startY) {
  const benchPlayers = team.bench;
  const slotWidth = 90;
  const slotHeight = 90;
  const spacing = 120;
  const startX = (canvasWidth - (benchPlayers.length * spacing - (spacing - slotWidth))) / 2;

  // Section label
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.fillStyle = "#888";
  ctx.fillText(`BENCH (${benchPlayers.length}/2)`, canvasWidth / 2, startY - 5);

  for (let i = 0; i < benchPlayers.length; i++) {
    const x = startX + i * spacing;
    const y = startY + 5;
    const player = benchPlayers[i];

    // Dimmed slot background
    ctx.globalAlpha = 0.7;
    drawPlayerSlotBackground(ctx, x, y, slotWidth, slotHeight, true, "#666");
    ctx.globalAlpha = 1.0;

    // Avatar (smaller)
    const avatar = avatars[i];
    if (avatar) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + slotWidth / 2, y + 28, 20, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, x + slotWidth / 2 - 20, y + 8, 40, 40);
      ctx.restore();
    } else {
      ctx.fillStyle = "#5865f2";
      ctx.beginPath();
      ctx.arc(x + slotWidth / 2, y + 28, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText("👤", x + slotWidth / 2, y + 35);
    }

    // Username
    ctx.font = "bold 10px Arial";
    ctx.fillStyle = "#cccccc";
    ctx.textAlign = "center";
    const displayName = player.displayName || player.username;
    const truncatedName = displayName.length > 12 ? displayName.substring(0, 11) + "…" : displayName;
    ctx.fillText(truncatedName, x + slotWidth / 2, y + 58);

    // Rank
    const userRankInfo = rankInfoMap.get(player.id);
    if (userRankInfo) {
      ctx.font = "bold 8px Arial";
      ctx.fillStyle = userRankInfo.color || getRankColor(userRankInfo.tier);
      ctx.fillText(`${userRankInfo.name}`, x + slotWidth / 2, y + 72);
    }

    // "BENCH" label
    ctx.font = "bold 8px Arial";
    ctx.fillStyle = "#ff9900";
    ctx.fillText("BENCH", x + slotWidth / 2, y + 85);
  }
}

/**
 * Create team embed with visual display
 */
async function createTeamEmbed(team) {
  const totalAvailable = getTotalAvailable(team);
  const canBuild = totalAvailable >= 5;

  const teamImageBuffer = await createTeamVisualization(team);
  const attachment = new AttachmentBuilder(teamImageBuffer, {
    name: "team.png",
  });

  // Get host rank from cache
  const rankInfoMap = await batchGetUserRankInfo(
    team.guildId,
    team.availablePlayers.map((m) => m.id)
  );
  const hostRankInfo = rankInfoMap.get(team.host.id);
  const hostRankText = hostRankInfo
    ? `${hostRankInfo.name} (${hostRankInfo.rr ?? 0} RR)`
    : "❓ Use !valstats to register";

  let description, footerText;
  let color = "#ff4654";

  if (team.phase === PHASES.AVAILABILITY) {
    description = [
      `**Host:** ${team.host.displayName}`,
      `**Host Rank:** ${hostRankText}`,
      `**Status:** ${totalAvailable}/${MAX_PLAYERS} Players Available`,
      canBuild ? "\n✅ **Ready to build team!** Host can click 'Build Team'" : "",
    ].filter(Boolean).join("\n");

    footerText = canBuild
      ? "Host: Click 'Build Team' to select your roster"
      : `💡 Need ${5 - totalAvailable} more players | Click 'I'm Available' to join`;

    color = canBuild ? "#00ff88" : "#ffaa00";
  } else if (team.phase === PHASES.TEAM_BUILDING) {
    description = [
      `**Host:** ${team.host.displayName}`,
      `**Active Roster:** ${team.activeRoster.length}/5`,
      `**Bench:** ${team.bench.length}/2`,
    ].join("\n");

    footerText = "Host: Select players for roster, then assign agents";
    color = "#3498db";
  } else {
    description = [
      `**Host:** ${team.host.displayName}`,
      `**Status:** Team Ready! 🎮`,
      `**Active:** ${team.activeRoster.length}/5 | **Bench:** ${team.bench.length}/2`,
    ].join("\n");

    footerText = "GLHF! 🎯";
    color = "#00ff88";
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎯 ${team.name}`)
    .setDescription(description)
    .setImage("attachment://team.png")
    .setFooter({ text: footerText })
    .setTimestamp();

  return { embed, files: [attachment] };
}

/**
 * Create team action buttons based on phase
 */
function createTeamButtons(teamId, team) {
  const messageId = teamId.replace("raw_premiere_team_", "");
  const totalAvailable = getTotalAvailable(team);
  const canBuild = totalAvailable >= 5;
  const isFull = totalAvailable >= MAX_PLAYERS;

  if (team.phase === PHASES.AVAILABILITY) {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`raw_premiere_available_${messageId}`)
        .setLabel(isFull ? `Full (${totalAvailable}/${MAX_PLAYERS})` : `I'm Available (${totalAvailable}/${MAX_PLAYERS})`)
        .setStyle(isFull ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setEmoji(isFull ? "✅" : "➕")
        .setDisabled(isFull),
      new ButtonBuilder()
        .setCustomId(`raw_premiere_unavailable_${messageId}`)
        .setLabel("Can't Make It")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🚪"),
      new ButtonBuilder()
        .setCustomId(`raw_premiere_buildteam_${messageId}`)
        .setLabel("Build Team")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔧")
        .setDisabled(!canBuild)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`raw_premiere_disband_${messageId}`)
        .setLabel("Disband")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🗑️")
    );

    return [row1, row2];
  } else if (team.phase === PHASES.TEAM_BUILDING) {
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`raw_premiere_addtoroster_${messageId}`)
        .setLabel("Add to Roster")
        .setStyle(ButtonStyle.Success)
        .setEmoji("➕")
        .setDisabled(team.activeRoster.length >= 5 || team.bench.length === 0),
      new ButtonBuilder()
        .setCustomId(`raw_premiere_movetobench_${messageId}`)
        .setLabel("Move to Bench")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📥")
        .setDisabled(team.bench.length >= 2 || team.activeRoster.length === 0),
      new ButtonBuilder()
        .setCustomId(`raw_premiere_assignagent_${messageId}`)
        .setLabel("Assign Agents")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🎮")
        .setDisabled(team.activeRoster.length === 0)
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`raw_premiere_confirmroster_${messageId}`)
        .setLabel("Confirm & Ready")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅")
        .setDisabled(team.activeRoster.length < 5),
      new ButtonBuilder()
        .setCustomId(`raw_premiere_backtoavail_${messageId}`)
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("↩️")
    );

    return [row1, row2];
  } else {
    // READY phase
    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`raw_premiere_editroster_${messageId}`)
        .setLabel("Edit Roster")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✏️"),
      new ButtonBuilder()
        .setCustomId(`raw_premiere_disband_${messageId}`)
        .setLabel("Disband")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🗑️")
    );

    return [row1];
  }
}

/**
 * Create disbanded team embed
 */
function createDisbandedEmbed() {
  return new EmbedBuilder()
    .setColor("#ff0000")
    .setTitle("❌ RaW Premiere Disbanded")
    .setDescription(
      "This team has been disbanded.\n\n**Create a new team:** `!rawteam` or mention @RaW Valorant"
    )
    .setTimestamp();
}

/**
 * Safe interaction response handler
 */
async function safeInteractionResponse(interaction, type, data) {
  try {
    switch (type) {
      case "reply":
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(data);
        } else {
          await interaction.reply(data);
        }
        break;
      case "update":
        if (interaction.replied) {
          await interaction.editReply(data);
        } else if (interaction.deferred) {
          await interaction.editReply(data);
        } else {
          await interaction.update(data);
        }
        break;
      case "defer":
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferUpdate();
        }
        break;
    }
    return true;
  } catch (error) {
    console.error("[RaW Premiere] Interaction error:", error.message);
    return false;
  }
}

/**
 * Create player select menu for roster management
 */
function createPlayerSelectMenu(teamId, players, placeholder, customIdPrefix) {
  const messageId = teamId.replace("raw_premiere_team_", "");

  if (players.length === 0) {
    return null;
  }

  const options = players.slice(0, 25).map((player, index) => ({
    label: player.displayName || player.username,
    value: player.id,
    description: `Player ${index + 1}`,
    emoji: player.id === players[0]?.id ? "👑" : "👤",
  }));

  return new StringSelectMenuBuilder()
    .setCustomId(`${customIdPrefix}_${messageId}`)
    .setPlaceholder(placeholder)
    .addOptions(options);
}

/**
 * Create agent select menu for a player
 */
function createAgentSelectMenu(teamId, userId, currentAgent = null) {
  const messageId = teamId.replace("raw_premiere_team_", "");
  const options = [];

  // Group by role for better UX
  for (const role of getAllRoles()) {
    const roleAgents = getAgentsByRole(role);
    for (const agent of roleAgents) {
      options.push({
        label: agent.name,
        value: `${userId}_${agent.id}`,
        description: `${role} ${ROLE_EMOJIS[role]}`,
        emoji: agent.emoji,
        default: agent.id === currentAgent,
      });
    }
  }

  return new StringSelectMenuBuilder()
    .setCustomId(`raw_premiere_agentselect_${messageId}`)
    .setPlaceholder("Select agent to assign")
    .addOptions(options.slice(0, 25)); // Discord limit
}

module.exports = (client) => {
  apiHandler.init(client);

  if (client._rawValorantTeamHandlerInitialized) return;

  console.log("[RaW Premiere] Handler initialized");

  /**
   * Update team message in place
   */
  async function updateTeamMessage(teamId) {
    const team = activeTeams.get(teamId);
    if (!team) return;

    try {
      const channel = await client.channels.fetch(team.channelId);
      if (!channel) {
        activeTeams.delete(teamId);
        return;
      }

      const message = await channel.messages
        .fetch(team.messageId)
        .catch(() => null);
      if (!message) {
        activeTeams.delete(teamId);
        return;
      }

      const updatedEmbed = await createTeamEmbed(team);
      const updatedComponents = createTeamButtons(teamId, team);

      await message.edit({
        embeds: [updatedEmbed.embed],
        files: updatedEmbed.files,
        components: updatedComponents,
      });

      // Schedule next update if in availability phase
      if (team.phase === PHASES.AVAILABILITY) {
        if (team.resendTimer) clearTimeout(team.resendTimer);
        team.resendTimer = setTimeout(
          () => updateTeamMessage(teamId),
          RESEND_INTERVAL
        );
      }
    } catch (error) {
      if (error.code === 10008) {
        activeTeams.delete(teamId);
      }
    }
  }

  // Store pending team creations (auto-cleanup after 2 minutes)
  const pendingRawTeamCreations = new Map();

  // Message handler for team creation
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    // Get dynamic RaW Valorant role ID from settings
    const rawValorantRoleId = RAW_VALORANT_ROLE_ID;
    const rawRoleMention = `<@&${rawValorantRoleId}>`;
    const isCommand = message.content.toLowerCase() === "!rawteam";

    if (
      !message.content.includes(rawRoleMention) &&
      !message.mentions.roles.has(rawValorantRoleId) &&
      !isCommand
    )
      return;

    // Check if user has the RaW Valorant role
    const member = await message.guild.members.fetch(message.author.id);
    if (!member.roles.cache.has(rawValorantRoleId)) {
      if (isCommand) {
        message
          .reply("❌ You need the **RaW Valorant** role to create a RaW Premiere team!")
          .catch(() => {});
      }
      return;
    }

    // Create confirmation prompt
    const confirmationId = `${message.id}_${Date.now()}`;
    const confirmEmbed = new EmbedBuilder()
      .setTitle("🎮 Create RaW Premiere Team?")
      .setColor("#ff4654")
      .setDescription(
        `**${message.author.displayName}**, would you like to create a RaW Premiere availability check?\n\n` +
        `• Players can sign up as available (up to ${MAX_PLAYERS})\n` +
        `• At 5+ players, you can build your team\n` +
        `• Assign agents and manage roster/bench`
      )
      .setFooter({ text: "This prompt will expire in 10 seconds" })
      .setTimestamp();

    const yesButton = new ButtonBuilder()
      .setCustomId(`raw_premiere_confirm_yes_${confirmationId}`)
      .setLabel("Yes, Create")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅");

    const noButton = new ButtonBuilder()
      .setCustomId(`raw_premiere_confirm_no_${confirmationId}`)
      .setLabel("No, Cancel")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌");

    const row = new ActionRowBuilder().addComponents(yesButton, noButton);

    // Send confirmation in channel
    const confirmMessage = await message.reply({
      embeds: [confirmEmbed],
      components: [row],
    });

    // Store pending creation data
    pendingRawTeamCreations.set(confirmationId, {
      userId: message.author.id,
      messageId: message.id,
      channelId: message.channel.id,
      guildId: message.guild.id,
      author: message.author,
      confirmMessageId: confirmMessage.id,
    });

    // Auto-delete after 10 seconds
    setTimeout(() => {
      if (pendingRawTeamCreations.has(confirmationId)) {
        pendingRawTeamCreations.delete(confirmationId);
        confirmMessage.delete().catch(() => {});
      }
    }, 10000);
  });

  // Interaction handler
  client.on("interactionCreate", async (interaction) => {
    try {
      // Handle confirmation buttons
      if (interaction.isButton()) {
        if (interaction.customId.startsWith("raw_premiere_confirm_yes_")) {
          const confirmationId = interaction.customId.replace("raw_premiere_confirm_yes_", "");
          const pending = pendingRawTeamCreations.get(confirmationId);

          if (!pending) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ This confirmation has expired.",
              ephemeral: true,
            });
          }

          if (interaction.user.id !== pending.userId) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Only the person who triggered this can confirm.",
              ephemeral: true,
            });
          }

          // Delete pending creation
          pendingRawTeamCreations.delete(confirmationId);

          // Update confirmation message
          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setTitle("✅ Creating RaW Premiere...")
                .setColor("#00ff00")
                .setDescription("Setting up your RaW Premiere availability check...")
            ],
            components: [],
          });

          // Get user's rank info
          const rankInfoMap = await batchGetUserRankInfo(pending.guildId, [pending.author.id]);
          const hostRankInfo = rankInfoMap.get(pending.author.id);

          // Create the team with new structure
          const teamId = `raw_premiere_team_${pending.messageId}`;
          const hostPlayer = {
            id: pending.author.id,
            username: pending.author.username,
            displayName: pending.author.displayName || pending.author.username,
            avatarURL: pending.author.displayAvatarURL({
              extension: "png",
              size: 128,
            }),
            joinedAt: new Date(),
            preferredAgents: hostRankInfo?.preferredAgents || [],
            rank: hostRankInfo ? { tier: hostRankInfo.tier, rr: hostRankInfo.rr, name: hostRankInfo.name } : null,
          };

          const team = {
            id: teamId,
            guildId: pending.guildId,
            host: {
              id: pending.author.id,
              username: pending.author.username,
              displayName: pending.author.displayName || pending.author.username,
              avatarURL: pending.author.displayAvatarURL({
                extension: "png",
                size: 128,
              }),
            },
            channelId: pending.channelId,
            messageId: null,
            name: TEAM_NAME,
            createdAt: new Date(),
            phase: PHASES.AVAILABILITY,
            availablePlayers: [hostPlayer], // Host is automatically available
            activeRoster: [],
            bench: [],
            agentAssignments: new Map(),
            resendTimer: null,
            deleteTimer: null,
          };

          try {
            const embed = await createTeamEmbed(team);
            const components = createTeamButtons(teamId, team);

            const teamMessage = await interaction.channel.send({
              embeds: [embed.embed],
              files: embed.files,
              components,
            });

            team.messageId = teamMessage.id;
            activeTeams.set(teamId, team);

            // Set up periodic refresh
            team.resendTimer = setTimeout(
              () => updateTeamMessage(teamId),
              RESEND_INTERVAL
            );

            // Auto-disband after 4 hours
            team.deleteTimer = setTimeout(async () => {
              const currentTeam = activeTeams.get(teamId);
              if (currentTeam) {
                activeTeams.delete(teamId);
                try {
                  const ch = await client.channels.fetch(currentTeam.channelId);
                  const msg = await ch.messages
                    .fetch(currentTeam.messageId)
                    .catch(() => null);
                  if (msg) await msg.delete().catch(() => {});
                } catch {}
              }
            }, TEAM_LIFETIME);

            // Delete confirmation message after a short delay
            setTimeout(() => {
              interaction.message?.delete().catch(() => {});
            }, 2000);
          } catch (error) {
            console.error("[RaW Premiere] Creation error:", error);
            await interaction.followUp({
              content: "❌ Failed to create team. Try again.",
              ephemeral: true,
            });
          }

          return;
        } else if (interaction.customId.startsWith("raw_premiere_confirm_no_")) {
          const confirmationId = interaction.customId.replace("raw_premiere_confirm_no_", "");
          const pending = pendingRawTeamCreations.get(confirmationId);

          if (!pending) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ This confirmation has expired.",
              ephemeral: true,
            });
          }

          if (interaction.user.id !== pending.userId) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Only the person who triggered this can cancel.",
              ephemeral: true,
            });
          }

          // Delete pending creation
          pendingRawTeamCreations.delete(confirmationId);

          // Just delete the message
          await interaction.message?.delete().catch(() => {});

          return;
        }
      }

      // Handle select menus
      if (interaction.isStringSelectMenu()) {
        // Player selection for roster management
        if (interaction.customId.startsWith("raw_premiere_rosterselect_")) {
          const messageId = interaction.customId.replace("raw_premiere_rosterselect_", "");
          const teamId = `raw_premiere_team_${messageId}`;
          const team = activeTeams.get(teamId);

          if (!team) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Team no longer exists.",
              ephemeral: true,
            });
          }

          if (interaction.user.id !== team.host.id) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Only the host can manage the roster.",
              ephemeral: true,
            });
          }

          const selectedUserId = interaction.values[0];
          const playerIndex = team.bench.findIndex(p => p.id === selectedUserId);

          if (playerIndex === -1) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Player not found on bench.",
              ephemeral: true,
            });
          }

          if (team.activeRoster.length >= 5) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Roster is full. Move someone to bench first.",
              ephemeral: true,
            });
          }

          // Move player from bench to roster
          const [player] = team.bench.splice(playerIndex, 1);
          team.activeRoster.push(player);

          await interaction.deferUpdate().catch(() => {});

          const updatedEmbed = await createTeamEmbed(team);
          const updatedComponents = createTeamButtons(teamId, team);

          await interaction.editReply({
            embeds: [updatedEmbed.embed],
            files: updatedEmbed.files,
            components: updatedComponents,
          });

          return;
        }

        // Bench selection
        if (interaction.customId.startsWith("raw_premiere_benchselect_")) {
          const messageId = interaction.customId.replace("raw_premiere_benchselect_", "");
          const teamId = `raw_premiere_team_${messageId}`;
          const team = activeTeams.get(teamId);

          if (!team) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Team no longer exists.",
              ephemeral: true,
            });
          }

          if (interaction.user.id !== team.host.id) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Only the host can manage the roster.",
              ephemeral: true,
            });
          }

          const selectedUserId = interaction.values[0];
          const playerIndex = team.activeRoster.findIndex(p => p.id === selectedUserId);

          if (playerIndex === -1) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Player not found on roster.",
              ephemeral: true,
            });
          }

          if (team.bench.length >= 2) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Bench is full (max 2).",
              ephemeral: true,
            });
          }

          // Move player from roster to bench
          const [player] = team.activeRoster.splice(playerIndex, 1);
          team.agentAssignments.delete(player.id); // Clear agent assignment
          team.bench.push(player);

          await interaction.deferUpdate().catch(() => {});

          const updatedEmbed = await createTeamEmbed(team);
          const updatedComponents = createTeamButtons(teamId, team);

          await interaction.editReply({
            embeds: [updatedEmbed.embed],
            files: updatedEmbed.files,
            components: updatedComponents,
          });

          return;
        }

        // Agent selection for a player
        if (interaction.customId.startsWith("raw_premiere_agentselect_")) {
          const messageId = interaction.customId.replace("raw_premiere_agentselect_", "");
          const teamId = `raw_premiere_team_${messageId}`;
          const team = activeTeams.get(teamId);

          if (!team) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Team no longer exists.",
              ephemeral: true,
            });
          }

          if (interaction.user.id !== team.host.id) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Only the host can assign agents.",
              ephemeral: true,
            });
          }

          const [userId, agentId] = interaction.values[0].split("_");

          if (!team.activeRoster.some(p => p.id === userId)) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Player not on roster.",
              ephemeral: true,
            });
          }

          // Assign agent
          team.agentAssignments.set(userId, agentId);

          await interaction.deferUpdate().catch(() => {});

          const updatedEmbed = await createTeamEmbed(team);
          const updatedComponents = createTeamButtons(teamId, team);

          await interaction.editReply({
            embeds: [updatedEmbed.embed],
            files: updatedEmbed.files,
            components: updatedComponents,
          });

          return;
        }

        // Player selection for agent assignment
        if (interaction.customId.startsWith("raw_premiere_playerforagent_")) {
          const messageId = interaction.customId.replace("raw_premiere_playerforagent_", "");
          const teamId = `raw_premiere_team_${messageId}`;
          const team = activeTeams.get(teamId);

          if (!team) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Team no longer exists.",
              ephemeral: true,
            });
          }

          if (interaction.user.id !== team.host.id) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Only the host can assign agents.",
              ephemeral: true,
            });
          }

          const selectedUserId = interaction.values[0];
          const player = team.activeRoster.find(p => p.id === selectedUserId);

          if (!player) {
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Player not on roster.",
              ephemeral: true,
            });
          }

          // Show agent select menu for this player
          const currentAgent = team.agentAssignments.get(selectedUserId);
          const agentMenu = createAgentSelectMenu(teamId, selectedUserId, currentAgent);

          return safeInteractionResponse(interaction, "reply", {
            content: `🎮 Select agent for **${player.displayName}**:`,
            components: [new ActionRowBuilder().addComponents(agentMenu)],
            ephemeral: true,
          });
        }
      }

      // Handle button interactions
      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith("raw_premiere_")) return;

      const parts = interaction.customId.split("_");
      const action = parts[2]; // raw_premiere_ACTION_id
      const messageId = parts.slice(3).join("_");
      const teamId = `raw_premiere_team_${messageId}`;

      const team = activeTeams.get(teamId);

      if (!team) {
        return safeInteractionResponse(interaction, "reply", {
          content: "❌ Team no longer exists.",
          ephemeral: true,
        });
      }

      const userId = interaction.user.id;
      const isHost = userId === team.host.id;

      // AVAILABLE - Join availability pool
      if (action === "available") {
        // Check for RaW Role
        const rawValorantRoleId = RAW_VALORANT_ROLE_ID;
        const member = await interaction.guild.members.fetch(userId);
        if (!member.roles.cache.has(rawValorantRoleId)) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ You need the **RaW Valorant** role to join!",
            ephemeral: true,
          });
        }

        // Check if already in pool
        if (team.availablePlayers.some(p => p.id === userId)) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ You're already marked as available!",
            ephemeral: true,
          });
        }

        // Check if full
        if (getTotalAvailable(team) >= MAX_PLAYERS) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Availability pool is full (7/7)!",
            ephemeral: true,
          });
        }

        // Defer immediately to prevent timeout
        await interaction.deferUpdate().catch(() => {});

        // Get user's rank info
        const rankInfoMap = await batchGetUserRankInfo(team.guildId, [userId]);
        const userRankInfo = rankInfoMap.get(userId);

        // Add to available pool
        team.availablePlayers.push({
          id: userId,
          username: interaction.user.username,
          displayName: interaction.user.displayName || interaction.user.username,
          avatarURL: interaction.user.displayAvatarURL({
            extension: "png",
            size: 128,
          }),
          joinedAt: new Date(),
          preferredAgents: userRankInfo?.preferredAgents || [],
          rank: userRankInfo ? { tier: userRankInfo.tier, rr: userRankInfo.rr, name: userRankInfo.name } : null,
        });

        const updatedEmbed = await createTeamEmbed(team);
        const updatedComponents = createTeamButtons(teamId, team);

        await interaction.editReply({
          embeds: [updatedEmbed.embed],
          files: updatedEmbed.files,
          components: updatedComponents,
        });
      }

      // UNAVAILABLE - Leave availability pool
      else if (action === "unavailable") {
        const playerIndex = team.availablePlayers.findIndex(p => p.id === userId);

        if (playerIndex === -1) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ You're not in the availability pool!",
            ephemeral: true,
          });
        }

        // Host cannot leave in availability phase (would disband)
        if (userId === team.host.id) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ As the host, use 'Disband' to cancel the team.",
            ephemeral: true,
          });
        }

        // Defer immediately
        await interaction.deferUpdate().catch(() => {});

        team.availablePlayers.splice(playerIndex, 1);

        const updatedEmbed = await createTeamEmbed(team);
        const updatedComponents = createTeamButtons(teamId, team);

        await interaction.editReply({
          embeds: [updatedEmbed.embed],
          files: updatedEmbed.files,
          components: updatedComponents,
        });
      }

      // BUILD TEAM - Transition to team building phase
      else if (action === "buildteam") {
        if (!isHost) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the host can build the team!",
            ephemeral: true,
          });
        }

        if (getTotalAvailable(team) < 5) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Need at least 5 available players to build a team!",
            ephemeral: true,
          });
        }

        // Defer immediately
        await interaction.deferUpdate().catch(() => {});

        // Transition to team building phase
        team.phase = PHASES.TEAM_BUILDING;

        // Auto-populate roster with first 5 players, rest go to bench
        team.activeRoster = team.availablePlayers.slice(0, 5);
        team.bench = team.availablePlayers.slice(5, 7);

        // Clear availability array (data is now in roster/bench)
        team.availablePlayers = [];

        // Stop periodic updates
        if (team.resendTimer) {
          clearTimeout(team.resendTimer);
          team.resendTimer = null;
        }

        const updatedEmbed = await createTeamEmbed(team);
        const updatedComponents = createTeamButtons(teamId, team);

        await interaction.editReply({
          embeds: [updatedEmbed.embed],
          files: updatedEmbed.files,
          components: updatedComponents,
        });
      }

      // ADD TO ROSTER - Show select menu to add player from bench
      else if (action === "addtoroster") {
        if (!isHost) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the host can manage the roster!",
            ephemeral: true,
          });
        }

        if (team.bench.length === 0) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Bench is empty!",
            ephemeral: true,
          });
        }

        if (team.activeRoster.length >= 5) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Roster is full. Move someone to bench first.",
            ephemeral: true,
          });
        }

        const selectMenu = createPlayerSelectMenu(
          teamId,
          team.bench,
          "Select player to add to roster",
          "raw_premiere_rosterselect"
        );

        return safeInteractionResponse(interaction, "reply", {
          content: "➕ Select a player to add to the active roster:",
          components: [new ActionRowBuilder().addComponents(selectMenu)],
          ephemeral: true,
        });
      }

      // MOVE TO BENCH - Show select menu to move player to bench
      else if (action === "movetobench") {
        if (!isHost) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the host can manage the roster!",
            ephemeral: true,
          });
        }

        if (team.activeRoster.length === 0) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Roster is empty!",
            ephemeral: true,
          });
        }

        if (team.bench.length >= 2) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Bench is full (max 2).",
            ephemeral: true,
          });
        }

        const selectMenu = createPlayerSelectMenu(
          teamId,
          team.activeRoster,
          "Select player to move to bench",
          "raw_premiere_benchselect"
        );

        return safeInteractionResponse(interaction, "reply", {
          content: "📥 Select a player to move to the bench:",
          components: [new ActionRowBuilder().addComponents(selectMenu)],
          ephemeral: true,
        });
      }

      // ASSIGN AGENT - Show player select then agent select
      else if (action === "assignagent") {
        if (!isHost) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the host can assign agents!",
            ephemeral: true,
          });
        }

        if (team.activeRoster.length === 0) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ No players on roster to assign agents to!",
            ephemeral: true,
          });
        }

        const selectMenu = createPlayerSelectMenu(
          teamId,
          team.activeRoster,
          "Select player to assign agent",
          "raw_premiere_playerforagent"
        );

        return safeInteractionResponse(interaction, "reply", {
          content: "🎮 Select a player to assign an agent to:",
          components: [new ActionRowBuilder().addComponents(selectMenu)],
          ephemeral: true,
        });
      }

      // CONFIRM ROSTER - Transition to ready phase
      else if (action === "confirmroster") {
        if (!isHost) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the host can confirm the roster!",
            ephemeral: true,
          });
        }

        if (team.activeRoster.length < 5) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Need 5 players on roster to confirm!",
            ephemeral: true,
          });
        }

        // Defer immediately
        await interaction.deferUpdate().catch(() => {});

        team.phase = PHASES.READY;

        const updatedEmbed = await createTeamEmbed(team);
        const updatedComponents = createTeamButtons(teamId, team);

        await interaction.editReply({
          embeds: [updatedEmbed.embed],
          files: updatedEmbed.files,
          components: updatedComponents,
        });

        // Send celebration message
        const rankInfoMap = await batchGetUserRankInfo(
          team.guildId,
          team.activeRoster.map(p => p.id)
        );

        let roster = "";
        let totalTier = 0;
        let rankedCount = 0;

        for (const player of team.activeRoster) {
          const rank = rankInfoMap.get(player.id);
          const isHostPlayer = player.id === team.host.id;
          const badge = isHostPlayer ? " 👑" : "";
          const assignedAgent = team.agentAssignments.get(player.id);
          const agentText = assignedAgent
            ? getAgentById(assignedAgent)?.name || assignedAgent
            : player.preferredAgents?.[0] ? getAgentById(player.preferredAgents[0])?.name || "?" : "?";

          if (rank) {
            roster += `• **${player.displayName}**${badge} - ${rank.name} (${rank.rr} RR) - ${agentText}\n`;
            totalTier += rank.tier;
            rankedCount++;
          } else {
            roster += `• **${player.displayName}**${badge} - Unranked - ${agentText}\n`;
          }
        }

        const avgRank = rankedCount > 0
          ? apiHandler.RANK_MAPPING[Math.round(totalTier / rankedCount)]?.name || "Unknown"
          : "N/A";

        const roleComp = calculateRoleComposition(team.activeRoster, team.agentAssignments);
        const roleText = Object.entries(roleComp)
          .map(([role, count]) => `${ROLE_EMOJIS[role]} ${role.substring(0, 4)}: ${count}`)
          .join(" | ");

        const celebrationEmbed = new EmbedBuilder()
          .setColor("#00ff88")
          .setTitle("🎉 RaW Premiere Team Ready!")
          .setDescription(
            `Queue up and dominate!\n\n**Average Rank:** ${avgRank}\n**Composition:** ${roleText}`
          )
          .addFields({
            name: "👥 Roster",
            value: roster || "No players",
            inline: false,
          });

        if (team.bench.length > 0) {
          const benchText = team.bench
            .map(p => `• ${p.displayName}`)
            .join("\n");
          celebrationEmbed.addFields({
            name: "📥 Bench",
            value: benchText,
            inline: false,
          });
        }

        celebrationEmbed
          .setFooter({ text: "GLHF!" })
          .setTimestamp();

        try {
          const channel = await client.channels.fetch(team.channelId);
          await channel.send({ embeds: [celebrationEmbed] });
        } catch {}

        // Save to history
        saveTeamToHistory({
          id: team.id,
          guildId: team.guildId,
          leader: team.host,
          members: team.activeRoster.filter(p => p.id !== team.host.id),
          createdAt: team.createdAt,
          status: "completed",
        }).catch(console.error);
      }

      // BACK TO AVAILABILITY - Return to availability phase
      else if (action === "backtoavail") {
        if (!isHost) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the host can change phases!",
            ephemeral: true,
          });
        }

        // Defer immediately
        await interaction.deferUpdate().catch(() => {});

        // Merge roster and bench back to available players
        team.availablePlayers = [...team.activeRoster, ...team.bench];
        team.activeRoster = [];
        team.bench = [];
        team.agentAssignments.clear();
        team.phase = PHASES.AVAILABILITY;

        // Restart periodic updates
        team.resendTimer = setTimeout(
          () => updateTeamMessage(teamId),
          RESEND_INTERVAL
        );

        const updatedEmbed = await createTeamEmbed(team);
        const updatedComponents = createTeamButtons(teamId, team);

        await interaction.editReply({
          embeds: [updatedEmbed.embed],
          files: updatedEmbed.files,
          components: updatedComponents,
        });
      }

      // EDIT ROSTER - Return to team building from ready
      else if (action === "editroster") {
        if (!isHost) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the host can edit the roster!",
            ephemeral: true,
          });
        }

        // Defer immediately
        await interaction.deferUpdate().catch(() => {});

        team.phase = PHASES.TEAM_BUILDING;

        const updatedEmbed = await createTeamEmbed(team);
        const updatedComponents = createTeamButtons(teamId, team);

        await interaction.editReply({
          embeds: [updatedEmbed.embed],
          files: updatedEmbed.files,
          components: updatedComponents,
        });
      }

      // DISBAND
      else if (action === "disband") {
        if (!isHost) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the host can disband the team!",
            ephemeral: true,
          });
        }

        // Clear all timers
        if (team.resendTimer) clearTimeout(team.resendTimer);
        if (team.deleteTimer) clearTimeout(team.deleteTimer);

        activeTeams.delete(teamId);

        // Update message to show disbanded
        await interaction.update({
          embeds: [createDisbandedEmbed()],
          components: [],
          files: [],
        });
      }
    } catch (error) {
      console.error("[RaW Premiere] Handler error:", error);
    }
  });

  activeTeams.clear();
  client._rawValorantTeamHandlerInitialized = true;
};
