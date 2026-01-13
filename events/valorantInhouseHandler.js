const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const { createCanvas, loadImage } = require("canvas");
const https = require("https");

const { CleanupMap, LimitedMap } = require("../utils/memoryUtils");
const { loadImageFromURL } = require("../utils/valorantCanvasUtils");

// Import functions from the API handler (with persistent storage)
const apiHandler = require("./valorantApiHandler");
const { getSetting } = require("../utils/settingsManager");
const {
  checkSubscription,
  createUpgradeEmbed,
  TIERS,
} = require("../utils/subscriptionUtils");

// Configuration - legacy fallback ID
const DEFAULT_VALORANT_ROLE_ID = "1058201257338228757";

// Helper to get Valorant role from settings (for future use)
async function getValorantRoleId(guildId) {
  return await getSetting(guildId, 'roles.valorant_team', DEFAULT_VALORANT_ROLE_ID);
}

// ============ CONSTANTS ============
// Canvas dimensions
const INHOUSE_CANVAS_WIDTH = 1100;
const INHOUSE_CANVAS_HEIGHT = 420;
const PLAYER_SLOT_WIDTH = 100;
const PLAYER_SLOT_HEIGHT = 140;
const SLOT_SPACING = 110;

// Timer intervals (milliseconds)
const RESEND_INTERVAL = 10 * 60 * 1000; // 10 minutes
const INHOUSE_EXPIRY_TIME = 30 * 60 * 1000; // 30 minutes
const INHOUSE_COOLDOWN = 60000; // 1 minute

// Performance thresholds (milliseconds)
const VIZ_PERF_THRESHOLD = 500;
const EMBED_PERF_THRESHOLD = 1000;

// Game settings
const INHOUSE_SIZE = 10;
const TEAM_SIZE = 5;
const MAX_INHOUSES_PER_USER = 1;

// MMR calculations
const MMR_PER_TIER = 100;
// ===================================

// Store active in-houses (auto-cleanup with size limit of 30)
const activeInhouses = new LimitedMap(30);

// Track user cooldowns for in-house creation (auto-cleanup after 2 minutes)
const userCooldowns = new CleanupMap(2 * 60 * 1000, 1 * 60 * 1000);

// Track user active in-houses count (limit to 500 users for larger servers)
const userActiveInhouses = new LimitedMap(500);

// Function to get user rank information
async function getUserRankInfo(guildId, userId) {
  try {
    const registration = await apiHandler.getUserRegistration(guildId, userId);
    if (!registration) {
      console.log(`No registration found for user ${userId}`);
      return null;
    }

    const rankData = await apiHandler.getUserRankData(guildId, userId);
    if (!rankData) {
      console.log(`No rank data found for user ${userId}`);
      return null;
    }

    const rankInfo =
      apiHandler.RANK_MAPPING[rankData.currenttier] ||
      apiHandler.RANK_MAPPING[0];
    return {
      ...rankInfo,
      tier: rankData.currenttier,
      rr: rankData.ranking_in_tier,
    };
  } catch (error) {
    console.error("Error getting user rank info:", error);
    return null;
  }
}

// Function to calculate total MMR value for balancing
function calculatePlayerMMR(rankInfo) {
  if (!rankInfo) return 0;
  // Each rank tier is worth 100 points, RR adds up to 100 more
  return rankInfo.tier * MMR_PER_TIER + (rankInfo.rr || 0);
}

// Team balancing algorithm - creates two balanced teams based on player ranks
async function balanceTeams(guildId, players) {
  // Get rank info for all players
  const playersWithRanks = await Promise.all(
    players.map(async (player) => {
      const rankInfo = await getUserRankInfo(guildId, player.id);
      return {
        ...player,
        rankInfo,
        mmr: calculatePlayerMMR(rankInfo),
      };
    })
  );

  // Sort players by MMR (highest to lowest)
  playersWithRanks.sort((a, b) => b.mmr - a.mmr);

  // Initialize teams
  const team1 = [];
  const team2 = [];
  let team1MMR = 0;
  let team2MMR = 0;

  // Balance teams using a greedy algorithm
  // Assign each player to the team with lower total MMR
  for (const player of playersWithRanks) {
    if (team1MMR <= team2MMR) {
      team1.push(player);
      team1MMR += player.mmr;
    } else {
      team2.push(player);
      team2MMR += player.mmr;
    }
  }

  return {
    team1,
    team2,
    team1MMR,
    team2MMR,
    mmrDifference: Math.abs(team1MMR - team2MMR),
  };
}

// Enhanced function to create in-house visualization
async function createInhouseVisualization(
  inhouse,
  showTeams = false,
  balancedTeams = null
) {
  const vizStartTime = Date.now();
  console.log("[INHOUSE] Creating canvas visualization...");

  const canvas = createCanvas(INHOUSE_CANVAS_WIDTH, INHOUSE_CANVAS_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Enhanced background gradient
  const gradient = ctx.createLinearGradient(0, 0, INHOUSE_CANVAS_WIDTH, INHOUSE_CANVAS_HEIGHT);
  gradient.addColorStop(0, "#0a0e13");
  gradient.addColorStop(0.3, "#1e2328");
  gradient.addColorStop(0.7, "#2c3e50");
  gradient.addColorStop(1, "#0a0e13");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, INHOUSE_CANVAS_WIDTH, INHOUSE_CANVAS_HEIGHT);

  const gradientTime = Date.now() - vizStartTime;
  console.log(`[INHOUSE] Canvas gradient created in ${gradientTime}ms`);

  // Add subtle pattern overlay
  const patternStartTime = Date.now();
  ctx.fillStyle = "rgba(255, 70, 84, 0.05)";
  for (let i = 0; i < INHOUSE_CANVAS_WIDTH; i += 30) {
    for (let j = 0; j < INHOUSE_CANVAS_HEIGHT; j += 30) {
      if ((i + j) % 60 === 0) {
        ctx.fillRect(i, j, 15, 15);
      }
    }
  }
  const patternTime = Date.now() - patternStartTime;
  console.log(`[INHOUSE] Pattern overlay created in ${patternTime}ms`);

  // Enhanced Valorant-style accent
  const accentGradient = ctx.createLinearGradient(0, 0, INHOUSE_CANVAS_WIDTH, 0);
  accentGradient.addColorStop(0, "#ff4654");
  accentGradient.addColorStop(0.5, "#ff6b7a");
  accentGradient.addColorStop(1, "#ff4654");
  ctx.fillStyle = accentGradient;
  ctx.fillRect(0, 0, INHOUSE_CANVAS_WIDTH, 6);
  ctx.fillRect(0, 414, INHOUSE_CANVAS_WIDTH, 6);

  // Enhanced title with glow effect
  ctx.shadowColor = "#ff4654";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "center";
  ctx.fillText("VALORANT IN-HOUSE", 550, 40);
  ctx.shadowBlur = 0;

  // Status based on whether teams are balanced
  const totalMembers = getTotalMembers(inhouse);
  ctx.font = "bold 16px Arial";

  if (showTeams && balancedTeams) {
    ctx.fillStyle = "#00ff88";
    ctx.fillText("TEAMS BALANCED - READY TO PLAY!", 550, 65);
  } else {
    ctx.fillStyle = totalMembers >= INHOUSE_SIZE ? "#00ff88" : "#ffaa00";
    ctx.fillText(`${totalMembers}/${INHOUSE_SIZE} PLAYERS READY`, 550, 65);
  }

  // Player slots
  const slotWidth = PLAYER_SLOT_WIDTH;
  const slotHeight = PLAYER_SLOT_HEIGHT;
  const startY = 85;
  const spacing = SLOT_SPACING;

  let allMembers;

  if (showTeams && balancedTeams) {
    // Show balanced teams
    // Team 1 on top row
    ctx.fillStyle = "#4a90e2";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "left";
    ctx.fillText("TEAM 1", 40, startY - 5);

    // Team 2 on bottom row
    ctx.fillStyle = "#e24a4a";
    ctx.fillText("TEAM 2", 40, startY + slotHeight + 30);

    for (let i = 0; i < TEAM_SIZE; i++) {
      // Draw Team 1 member
      await drawPlayerSlot(
        ctx,
        inhouse.guildId,
        balancedTeams.team1[i],
        40 + i * spacing,
        startY,
        slotWidth,
        slotHeight,
        i + 1,
        "#4a90e2"
      );

      // Draw Team 2 member
      await drawPlayerSlot(
        ctx,
        inhouse.guildId,
        balancedTeams.team2[i],
        40 + i * spacing,
        startY + slotHeight + 35,
        slotWidth,
        slotHeight,
        i + 6,
        "#e24a4a"
      );
    }

    // Show MMR info
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "right";
    ctx.fillText(
      `Avg MMR: ${Math.round(balancedTeams.team1MMR / TEAM_SIZE)}`,
      1060,
      startY + 70
    );
    ctx.fillText(
      `Avg MMR: ${Math.round(balancedTeams.team2MMR / TEAM_SIZE)}`,
      1060,
      startY + slotHeight + 105
    );

    // Show MMR difference
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = balancedTeams.mmrDifference < 200 ? "#00ff88" : "#ffaa00";
    ctx.fillText(
      `MMR Diff: ${Math.round(balancedTeams.mmrDifference)}`,
      550,
      405
    );
  } else {
    // Show all 10 slots in two rows
    allMembers = [inhouse.leader, ...inhouse.members];

    for (let i = 0; i < INHOUSE_SIZE; i++) {
      const row = Math.floor(i / TEAM_SIZE);
      const col = i % TEAM_SIZE;
      const x = 40 + col * spacing;
      const y = startY + row * (slotHeight + 20);

      await drawPlayerSlot(
        ctx,
        inhouse.guildId,
        allMembers[i],
        x,
        y,
        slotWidth,
        slotHeight,
        i + 1
      );
    }
  }

  const totalVizTime = Date.now() - vizStartTime;
  if (totalVizTime > VIZ_PERF_THRESHOLD) {
    console.warn(
      `[INHOUSE] ⚠️ Canvas visualization took ${totalVizTime}ms (>${VIZ_PERF_THRESHOLD}ms threshold)`
    );
  } else {
    console.log(`[INHOUSE] Canvas visualization complete in ${totalVizTime}ms`);
  }

  return canvas.toBuffer();
}

// Helper function to draw a single player slot
async function drawPlayerSlot(
  ctx,
  guildId,
  member,
  x,
  y,
  width,
  height,
  slotNum,
  teamColor = null
) {
  // Enhanced slot background with gradient
  const slotGradient = ctx.createLinearGradient(x, y, x, y + height);
  if (member) {
    if (teamColor) {
      slotGradient.addColorStop(0, teamColor + "55");
      slotGradient.addColorStop(1, teamColor + "22");
    } else {
      slotGradient.addColorStop(0, "rgba(255, 70, 84, 0.3)");
      slotGradient.addColorStop(1, "rgba(255, 70, 84, 0.1)");
    }
  } else {
    slotGradient.addColorStop(0, "rgba(60, 60, 60, 0.5)");
    slotGradient.addColorStop(1, "rgba(40, 40, 40, 0.5)");
  }
  ctx.fillStyle = slotGradient;
  ctx.fillRect(x - 2, y - 2, width + 4, height + 4);

  // Slot border
  ctx.strokeStyle = teamColor || (member ? "#ff4654" : "#666666");
  ctx.lineWidth = member ? 3 : 2;
  ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);

  if (member) {
    try {
      // Get user avatar
      const avatarURL =
        member.avatarURL ||
        `https://cdn.discordapp.com/embed/avatars/${member.id % 5}.png`;

      const avatar = await loadImageFromURL(avatarURL);

      // Validate avatar loaded successfully before drawing
      if (!avatar) {
        console.warn(`[INHOUSE] Failed to load avatar for user ${member.id}, using fallback`);
        throw new Error("Avatar load failed"); // Will be caught by outer try-catch for fallback rendering
      }

      // Draw circular avatar with glow for leader
      if (slotNum === 1) {
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 15;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(x + width / 2, y + 35, 25, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, x + width / 2 - 25, y + 10, 50, 50);
      ctx.restore();
      ctx.shadowBlur = 0;

      // Enhanced leader crown
      if (slotNum === 1) {
        ctx.font = "bold 14px Arial";
        ctx.fillStyle = "#ffd700";
        ctx.textAlign = "center";
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 5;
        ctx.fillText("HOST", x + width / 2, y - 5);
        ctx.shadowBlur = 0;
      }

      // Enhanced username display
      ctx.font = "bold 11px Arial";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      const displayName = member.displayName || member.username;
      const truncatedName =
        displayName.length > 10
          ? displayName.substring(0, 10) + "..."
          : displayName;
      ctx.fillText(truncatedName, x + width / 2, y + 75);

      // Get and display rank
      const userRankInfo =
        member.rankInfo || (await getUserRankInfo(guildId, member.id));
      if (userRankInfo) {
        // Try to load rank image with null validation
        try {
          const rankImage = await apiHandler.loadRankImage(userRankInfo.tier);
          if (rankImage) {
            // Draw rank image in bottom section
            ctx.drawImage(rankImage, x + width / 2 - 15, y + 85, 30, 30);
          } else {
            // Use fallback rank icon when image is null
            console.log(`[INHOUSE] Rank image null for tier ${userRankInfo.tier}, using fallback`);
            apiHandler.createFallbackRankIcon(
              ctx,
              x + width / 2 - 15,
              y + 85,
              30,
              userRankInfo
            );
          }
        } catch (rankError) {
          console.error(`[INHOUSE] Error loading rank image for tier ${userRankInfo.tier}:`, rankError.message);
          // Use fallback rank icon on error
          apiHandler.createFallbackRankIcon(
            ctx,
            x + width / 2 - 15,
            y + 85,
            30,
            userRankInfo
          );
        }

        // Show rank name and RR
        ctx.font = "bold 9px Arial";
        ctx.fillStyle = userRankInfo.color;
        ctx.textAlign = "center";
        ctx.fillText(userRankInfo.name, x + width / 2, y + 125);
        if (userRankInfo.rr !== undefined) {
          ctx.fillText(`${userRankInfo.rr} RR`, x + width / 2, y + 135);
        }
      } else {
        // Show "Not Registered" indicator
        ctx.font = "bold 8px Arial";
        ctx.fillStyle = "#888888";
        ctx.textAlign = "center";
        ctx.fillText("Not Registered", x + width / 2, y + 95);
        ctx.fillText("!valstats", x + width / 2, y + 107);
      }
    } catch (error) {
      console.error("Error loading avatar or rank:", error);
      // Enhanced fallback: draw default avatar
      const avatarGradient = ctx.createRadialGradient(
        x + width / 2,
        y + 35,
        0,
        x + width / 2,
        y + 35,
        25
      );
      avatarGradient.addColorStop(0, "#7289da");
      avatarGradient.addColorStop(1, "#5865f2");
      ctx.fillStyle = avatarGradient;
      ctx.beginPath();
      ctx.arc(x + width / 2, y + 35, 25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "22px Arial";
      ctx.textAlign = "center";
      ctx.fillText("?", x + width / 2, y + 45);
    }
  } else {
    // Enhanced empty slot
    ctx.fillStyle = "#666666";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("LOOKING", x + width / 2, y + height / 2 - 10);
    ctx.fillText("FOR PLAYER", x + width / 2, y + height / 2 + 10);

    // Pulsing effect for empty slots (static representation)
    ctx.strokeStyle = "rgba(255, 70, 84, 0.5)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x + 10, y + 10, width - 20, height - 20);
    ctx.setLineDash([]);
  }

  // Slot number
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`${slotNum}`, x + width / 2, y + height + 12);
}

// Helper function to get total in-house members
function getTotalMembers(inhouse) {
  return 1 + inhouse.members.length; // 1 for leader + members
}

// Function to check if user can create an in-house
function canCreateInhouse(userId) {
  // Check cooldown
  const lastCreated = userCooldowns.get(userId);
  if (lastCreated && Date.now() - lastCreated < INHOUSE_COOLDOWN) {
    const remaining = Math.ceil(
      (INHOUSE_COOLDOWN - (Date.now() - lastCreated)) / 1000
    );
    return { canCreate: false, reason: `cooldown`, remaining };
  }

  // Check active in-houses limit
  const activeCount = userActiveInhouses.get(userId) || 0;
  if (activeCount >= MAX_INHOUSES_PER_USER) {
    return { canCreate: false, reason: `limit`, activeCount };
  }

  return { canCreate: true };
}

// Function to increment user's active in-house count
function incrementUserInhouseCount(userId) {
  const current = userActiveInhouses.get(userId) || 0;
  userActiveInhouses.set(userId, current + 1);
  userCooldowns.set(userId, Date.now());
}

// Function to decrement user's active in-house count
function decrementUserInhouseCount(userId) {
  const current = userActiveInhouses.get(userId) || 0;
  if (current > 0) {
    const newCount = current - 1;
    if (newCount === 0) {
      // Remove entry when count reaches 0 to prevent memory buildup
      userActiveInhouses.delete(userId);
    } else {
      userActiveInhouses.set(userId, newCount);
    }
  }
}

// Enhanced helper function to create in-house embed
async function createInhouseEmbed(
  inhouse,
  showTeams = false,
  balancedTeams = null
) {
  const totalMembers = getTotalMembers(inhouse);

  // Create the enhanced visual in-house display
  const inhouseImageBuffer = await createInhouseVisualization(
    inhouse,
    showTeams,
    balancedTeams
  );
  const attachment = new AttachmentBuilder(inhouseImageBuffer, {
    name: "inhouse-display.png",
  });

  // Get in-house leader rank for display
  const leaderRankInfo = await getUserRankInfo(inhouse.guildId, inhouse.leader.id);
  const leaderRankText = leaderRankInfo
    ? `${leaderRankInfo.name}${leaderRankInfo.rr !== undefined ? ` (${leaderRankInfo.rr} RR)` : ""}`
    : "Not Registered - Use !valstats";

  const embed = new EmbedBuilder()
    .setColor(totalMembers >= INHOUSE_SIZE ? "#00ff88" : "#ff4654")
    .setTitle("🏆 Valorant In-House Match")
    .setDescription(
      `**Match Host:** ${inhouse.leader.displayName}\n**Host Rank:** ${leaderRankText}\n**Status:** ${totalMembers}/10 Players`
    )
    .setImage("attachment://inhouse-display.png");

  if (showTeams && balancedTeams) {
    embed.addFields(
      {
        name: "🔵 TEAM 1",
        value: balancedTeams.team1
          .map((p, i) => {
            const rankText = p.rankInfo
              ? `${p.rankInfo.name} (${p.rankInfo.rr || 0} RR)`
              : "Unranked";
            return `${i + 1}. **${p.displayName}** - ${rankText}`;
          })
          .join("\n"),
        inline: true,
      },
      {
        name: "🔴 TEAM 2",
        value: balancedTeams.team2
          .map((p, i) => {
            const rankText = p.rankInfo
              ? `${p.rankInfo.name} (${p.rankInfo.rr || 0} RR)`
              : "Unranked";
            return `${i + 1}. **${p.displayName}** - ${rankText}`;
          })
          .join("\n"),
        inline: true,
      },
      {
        name: "📊 Balance Info",
        value: `**Team 1 Avg MMR:** ${Math.round(balancedTeams.team1MMR / TEAM_SIZE)}\n**Team 2 Avg MMR:** ${Math.round(balancedTeams.team2MMR / TEAM_SIZE)}\n**MMR Difference:** ${Math.round(balancedTeams.mmrDifference)}`,
        inline: false,
      }
    );
  } else {
    embed.addFields({
      name: "📋 Player List",
      value: await formatInhouseMembersList(inhouse),
      inline: false,
    });
  }

  embed
    .setFooter({
      text:
        totalMembers < INHOUSE_SIZE
          ? "🔄 Match updates every 10 minutes • Register with !valstats to show your rank!"
          : 'All players ready! Click "Create Teams" to balance the match!',
    })
    .setTimestamp();

  return {
    embed: embed,
    files: [attachment],
  };
}

// Helper function to create in-house buttons
function createInhouseButtons(inhouseId, isFull, showCreateTeams = false) {
  // Extract just the message ID from the full in-house ID
  const messageId = inhouseId.replace("valinhouse_", "");

  const buttons = [];

  const joinButton = new ButtonBuilder()
    .setCustomId(`valinhouse_join_${messageId}`)
    .setLabel("Join Match")
    .setStyle(ButtonStyle.Success)
    .setEmoji("➕")
    .setDisabled(isFull);

  const leaveButton = new ButtonBuilder()
    .setCustomId(`valinhouse_leave_${messageId}`)
    .setLabel("Leave Match")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("➖");

  buttons.push(joinButton, leaveButton);

  if (showCreateTeams) {
    const createTeamsButton = new ButtonBuilder()
      .setCustomId(`valinhouse_createteams_${messageId}`)
      .setLabel("Create Teams")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("⚖️");

    buttons.push(createTeamsButton);
  }

  const disbandButton = new ButtonBuilder()
    .setCustomId(`valinhouse_disband_${messageId}`)
    .setLabel("Disband Match")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("🗑️");

  buttons.push(disbandButton);

  return new ActionRowBuilder().addComponents(buttons);
}

// Enhanced helper function to format in-house members list
async function formatInhouseMembersList(inhouse) {
  const members = [];

  // Add leader with rank
  const leaderRankInfo = await getUserRankInfo(inhouse.guildId, inhouse.leader.id);
  const leaderRankText = leaderRankInfo
    ? `(${leaderRankInfo.name}${leaderRankInfo.rr !== undefined ? ` - ${leaderRankInfo.rr} RR` : ""})`
    : "(Not registered)";
  members.push(`👑 **${inhouse.leader.displayName}** ${leaderRankText}`);

  // Add other members with ranks
  for (let i = 0; i < inhouse.members.length; i++) {
    const member = inhouse.members[i];
    const memberRankInfo = await getUserRankInfo(inhouse.guildId, member.id);
    const memberRankText = memberRankInfo
      ? `(${memberRankInfo.name}${memberRankInfo.rr !== undefined ? ` - ${memberRankInfo.rr} RR` : ""})`
      : "(Not registered)";
    members.push(`${i + 2}. **${member.displayName}** ${memberRankText}`);
  }

  // Add empty slots count
  const emptySlots = INHOUSE_SIZE - getTotalMembers(inhouse);
  if (emptySlots > 0) {
    members.push(
      `\n*🔍 Looking for ${emptySlots} more player${emptySlots > 1 ? "s" : ""}...*`
    );
    members.push("*Use `!valstats` to register and show your rank!*");
  }

  return members.join("\n");
}

module.exports = (client) => {
  // API handler is initialized in index.js
  // Only add event listeners if not already added for in-house builder
  if (!client._valorantInhouseHandlerInitialized) {
    console.log("Valorant In-House Match Builder with Team Balancing loaded!");
    console.log(
      "Features: 10-player matches, automatic team balancing, rank-based MMR system"
    );

    /**
     * Update in-house message in place (no delete/recreate)
     * This matches the pattern from working team handlers
     */
    async function updateInhouseMessage(inhouseId) {
      const inhouse = activeInhouses.get(inhouseId);
      if (!inhouse) return;

      try {
        const channel = await client.channels.fetch(inhouse.channelId);
        if (!channel) {
          activeInhouses.delete(inhouseId);
          decrementUserInhouseCount(inhouse.leader.id);
          return;
        }

        const message = await channel.messages
          .fetch(inhouse.messageId)
          .catch(() => null);
        if (!message) {
          activeInhouses.delete(inhouseId);
          decrementUserInhouseCount(inhouse.leader.id);
          return;
        }

        const isFull = getTotalMembers(inhouse) >= INHOUSE_SIZE;
        const updatedEmbed = await createInhouseEmbed(inhouse);
        const updatedComponents = createInhouseButtons(inhouseId, isFull, isFull);

        await message.edit({
          embeds: [updatedEmbed.embed],
          files: updatedEmbed.files,
          components: [updatedComponents],
        });

        // Schedule next update if not full
        if (!isFull) {
          if (inhouse.resendTimer) clearTimeout(inhouse.resendTimer);
          inhouse.resendTimer = setTimeout(
            () => updateInhouseMessage(inhouseId),
            RESEND_INTERVAL
          );
        }
      } catch (error) {
        if (error.code === 10008) {
          // Unknown Message - clean up
          activeInhouses.delete(inhouseId);
          decrementUserInhouseCount(inhouse.leader.id);
        }
      }
    }

    // Store pending in-house creations
    const pendingInhouseCreations = new Map();

    client.on("messageCreate", async (message) => {
      if (message.author.bot) return;

      // Only run in guilds
      if (!message.guild) return;

      // EARLY RETURN: Skip if not a valorant inhouse command
      const content = message.content.toLowerCase();
      if (!content.startsWith("!valinhouse") && !content.startsWith("!inhouse"))
        return;

      // Check subscription tier - PLUS TIER REQUIRED for inhouse
      const subCheck = await checkSubscription(
        message.guild.id,
        TIERS.PLUS,
        message.guild.ownerId
      );
      if (!subCheck.hasAccess) {
        const upgradeEmbed = createUpgradeEmbed(
          "Valorant In-House",
          TIERS.PLUS,
          subCheck.guildTier
        );
        return message.channel.send({ embeds: [upgradeEmbed] });
      }

      // Check if message is the !valinhouse command
      const isInhouseCommand = message.content.toLowerCase() === "!valinhouse" || message.content.toLowerCase() === "!inhouse";

      if (isInhouseCommand) {
        console.log("Valorant in-house creation triggered!");

        // Check if user can create an in-house (cooldown + limit)
        const canCreate = canCreateInhouse(message.author.id);
        if (!canCreate.canCreate) {
          if (canCreate.reason === "cooldown") {
            return message.reply(
              `⏰ Please wait ${canCreate.remaining} seconds before creating another in-house match.`
            );
          } else if (canCreate.reason === "limit") {
            return message.reply(
              `❌ You already have ${canCreate.activeCount} active in-house match(es). Please wait for it to fill or disband it first.`
            );
          }
        }

        // Create confirmation prompt
        const confirmationId = `${message.id}_${Date.now()}`;
        const confirmEmbed = new EmbedBuilder()
          .setTitle("🏆 Create Valorant In-House?")
          .setColor("#ff4654")
          .setDescription(
            `**${message.author.displayName}**, would you like to create a Valorant in-house match?\n\n` +
            `This will create a 10-player match lobby with automatic team balancing.`
          )
          .setFooter({ text: "This prompt will expire in 5 seconds" })
          .setTimestamp();

        const yesButton = new ButtonBuilder()
          .setCustomId(`valinhouse_confirm_yes_${confirmationId}`)
          .setLabel("Yes, Create Match")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✅");

        const noButton = new ButtonBuilder()
          .setCustomId(`valinhouse_confirm_no_${confirmationId}`)
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
        pendingInhouseCreations.set(confirmationId, {
          userId: message.author.id,
          messageId: message.id,
          channelId: message.channel.id,
          guildId: message.guild.id,
          author: message.author,
          confirmMessageId: confirmMessage.id,
        });

        // Auto-delete after 5 seconds
        setTimeout(() => {
          if (pendingInhouseCreations.has(confirmationId)) {
            pendingInhouseCreations.delete(confirmationId);
            confirmMessage.delete().catch(() => {});
          }
        }, 5000); // 5 seconds

        return;
      }
    });

    // Handle button interactions
    client.on("interactionCreate", async (interaction) => {
      if (!interaction.isButton()) return;

      // Handle confirmation buttons first
      if (interaction.customId.startsWith("valinhouse_confirm_yes_")) {
        const confirmationId = interaction.customId.replace("valinhouse_confirm_yes_", "");
        const pending = pendingInhouseCreations.get(confirmationId);

        if (!pending) {
          return interaction.reply({
            content: "❌ This confirmation has expired.",
            ephemeral: true,
          });
        }

        if (interaction.user.id !== pending.userId) {
          return interaction.reply({
            content: "❌ Only the person who triggered this can confirm.",
            ephemeral: true,
          });
        }

        // Delete pending creation
        pendingInhouseCreations.delete(confirmationId);

        // Update confirmation message
        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Creating In-House...")
              .setColor("#00ff00")
              .setDescription("Setting up your Valorant in-house match...")
          ],
          components: [],
        });

        // Create the in-house
        const inhouseId = `valinhouse_${pending.messageId}`;
        const inhouse = {
          id: inhouseId,
          guildId: pending.guildId,
          leader: {
            id: pending.author.id,
            username: pending.author.username,
            displayName: pending.author.displayName || pending.author.username,
            avatarURL: pending.author.displayAvatarURL({
              extension: "png",
              size: 128,
            }),
          },
          members: [],
          channelId: pending.channelId,
          messageId: null,
          resendTimer: null,
          createdAt: new Date().toISOString(),
          teamsBalanced: false,
        };

        try {
          const embed = await createInhouseEmbed(inhouse);
          const components = createInhouseButtons(inhouseId, false, false);

          const inhouseMessage = await interaction.channel.send({
            embeds: [embed.embed],
            files: embed.files,
            components: [components],
          });

          inhouse.messageId = inhouseMessage.id;
          activeInhouses.set(inhouseId, inhouse);

          incrementUserInhouseCount(pending.author.id);

          console.log(`✅ In-house created successfully: ${inhouseId} by ${pending.author.username}`);

          // Set up the update timer
          inhouse.resendTimer = setTimeout(
            () => updateInhouseMessage(inhouseId),
            RESEND_INTERVAL
          );

          // Delete after 30 minutes if not full
          inhouse.expiryTimer = setTimeout(async () => {
            try {
              const currentInhouse = activeInhouses.get(inhouseId);
              if (currentInhouse && getTotalMembers(currentInhouse) < INHOUSE_SIZE) {
                if (currentInhouse.resendTimer) {
                  clearTimeout(currentInhouse.resendTimer);
                }
                decrementUserInhouseCount(currentInhouse.leader.id);
                activeInhouses.delete(inhouseId);

                try {
                  const channel = await client.channels.fetch(currentInhouse.channelId);
                  if (channel) {
                    const msg = await channel.messages.fetch(currentInhouse.messageId).catch(() => null);
                    if (msg) await msg.delete().catch(() => {});
                  }
                } catch {}

                console.log(`⏰ In-house ${inhouseId} expired after 30 minutes`);
              }
            } catch (error) {
              console.error(`[INHOUSE] Error in expiry timer:`, error.message);
            }
          }, INHOUSE_EXPIRY_TIME);

          // Delete confirmation message
          setTimeout(() => {
            interaction.message?.delete().catch(() => {});
          }, 2000);
        } catch (error) {
          console.error("❌ Error creating in-house:", error);
          await interaction.followUp({
            content: `❌ Failed to create in-house: ${error.message}`,
            ephemeral: true,
          });
        }

        return;
      } else if (interaction.customId.startsWith("valinhouse_confirm_no_")) {
        const confirmationId = interaction.customId.replace("valinhouse_confirm_no_", "");
        const pending = pendingInhouseCreations.get(confirmationId);

        if (!pending) {
          return interaction.reply({
            content: "❌ This confirmation has expired.",
            ephemeral: true,
          });
        }

        if (interaction.user.id !== pending.userId) {
          return interaction.reply({
            content: "❌ Only the person who triggered this can cancel.",
            ephemeral: true,
          });
        }

        pendingInhouseCreations.delete(confirmationId);

        // Just delete the message
        await interaction.message?.delete().catch(() => {});

        return;
      }

      // Only handle in-house buttons
      if (!interaction.customId.startsWith("valinhouse_")) {
        return;
      }

      const parts = interaction.customId.split("_");
      const action = parts[1]; // valinhouse_join, valinhouse_leave, valinhouse_disband, valinhouse_createteams
      const inhouseId = parts.slice(2).join("_"); // Reconstruct the in-house ID
      const fullInhouseId = `valinhouse_${inhouseId}`;

      const inhouse = activeInhouses.get(fullInhouseId);

      console.log("In-house Button interaction:", interaction.customId);
      console.log("Parsed action:", action, "inhouseId:", fullInhouseId);

      if (!inhouse) {
        return interaction.reply({
          content: "❌ This in-house match is no longer active.",
          ephemeral: true,
        });
      }

      const userId = interaction.user.id;
      const userInfo = {
        id: userId,
        username: interaction.user.username,
        displayName: interaction.user.displayName || interaction.user.username,
        avatarURL: interaction.user.displayAvatarURL({
          extension: "png",
          size: 128,
        }),
      };

      if (action === "join") {
        // Check if user is already in in-house
        if (
          userId === inhouse.leader.id ||
          inhouse.members.some((member) => member.id === userId)
        ) {
          return interaction.reply({
            content: "❌ You are already in this in-house match!",
            ephemeral: true,
          });
        }

        // Check if in-house is full
        if (getTotalMembers(inhouse) >= INHOUSE_SIZE) {
          return interaction.reply({
            content: "❌ This in-house match is already full!",
            ephemeral: true,
          });
        }

        // Add user to in-house
        inhouse.members.push(userInfo);

        try {
          // Defer the reply to prevent timeout (interactions must respond within 3 seconds)
          await interaction.deferUpdate();

          // Update the in-house display first
          const isFull = getTotalMembers(inhouse) >= 10;
          const updatedEmbed = await createInhouseEmbed(inhouse);
          const updatedComponents = createInhouseButtons(
            fullInhouseId,
            isFull,
            isFull
          );

          await interaction.editReply({
            embeds: [updatedEmbed.embed],
            files: updatedEmbed.files,
            components: [updatedComponents],
          });

          // If in-house is full, show the "Create Teams" button
          if (isFull) {
            // Clear the resend timer since in-house is full
            if (inhouse.resendTimer) {
              clearTimeout(inhouse.resendTimer);
              inhouse.resendTimer = null;
            }

            const readyEmbed = new EmbedBuilder()
              .setColor("#00ff00")
              .setTitle("🎉 IN-HOUSE FULL!")
              .setDescription(
                `All 10 players have joined! The match host can now create balanced teams by clicking the "Create Teams" button.`
              )
              .addFields(
                {
                  name: "⚖️ Team Balancing",
                  value:
                    "Teams will be automatically balanced based on player ranks and MMR to ensure a fair match!",
                  inline: false,
                },
                {
                  name: "📊 Unregistered Players",
                  value:
                    "Unregistered players will be assigned with lower priority. Use `!valstats` to register your rank!",
                  inline: false,
                }
              )
              .setTimestamp();

            try {
              await interaction.followUp({
                embeds: [readyEmbed],
              });
            } catch (followUpError) {
              console.error(
                `[INHOUSE] Failed to send follow-up message for full inhouse ${fullInhouseId}:`,
                followUpError.message
              );
              // Non-critical error - just log it
              if (followUpError.code === 10062) {
                console.error(`[INHOUSE] Interaction expired or unknown`);
              }
            }

            console.log(
              `🎉 In-house ${fullInhouseId} is full and ready for team creation`
            );
          }
        } catch (error) {
          console.error("Error updating in-house:", error);
          // If interaction is already acknowledged, we can't reply again
          if (!interaction.replied && !interaction.deferred) {
            await interaction
              .reply({
                content:
                  "❌ There was an error updating the in-house. Please try again.",
                ephemeral: true,
              })
              .catch(console.error);
          }
        }
      } else if (action === "leave") {
        // Check if user is the leader
        if (userId === inhouse.leader.id) {
          return interaction.reply({
            content:
              "❌ Match hosts cannot leave their own match! Use the disband button instead.",
            ephemeral: true,
          });
        }

        // Check if user is in in-house
        const memberIndex = inhouse.members.findIndex(
          (member) => member.id === userId
        );
        if (memberIndex === -1) {
          return interaction.reply({
            content: "❌ You are not in this in-house match!",
            ephemeral: true,
          });
        }

        // Remove user from in-house
        inhouse.members.splice(memberIndex, 1);

        try {
          // Defer the reply to prevent timeout
          await interaction.deferUpdate();

          // Update the in-house display
          const isFull = getTotalMembers(inhouse) >= 10;
          const updatedEmbed = await createInhouseEmbed(inhouse);
          const updatedComponents = createInhouseButtons(
            fullInhouseId,
            isFull,
            isFull
          );

          await interaction.editReply({
            embeds: [updatedEmbed.embed],
            files: updatedEmbed.files,
            components: [updatedComponents],
          });

          // Restart update timer if needed
          if (!isFull && !inhouse.resendTimer) {
            inhouse.resendTimer = setTimeout(
              () => updateInhouseMessage(fullInhouseId),
              RESEND_INTERVAL
            );
          }
        } catch (error) {
          console.error("Error updating in-house after leave:", error);
          // If interaction is already acknowledged, we can't reply again
          if (!interaction.replied && !interaction.deferred) {
            await interaction
              .reply({
                content:
                  "❌ There was an error updating the in-house. Please try again.",
                ephemeral: true,
              })
              .catch(console.error);
          }
        }
      } else if (action === "createteams") {
        // Only leader can create teams
        if (userId !== inhouse.leader.id) {
          return interaction.reply({
            content: "❌ Only the match host can create teams!",
            ephemeral: true,
          });
        }

        // Check if in-house is full
        if (getTotalMembers(inhouse) < INHOUSE_SIZE) {
          return interaction.reply({
            content: "❌ The match needs 10 players before creating teams!",
            ephemeral: true,
          });
        }

        try {
          // Defer the reply to prevent timeout (team balancing can take time)
          await interaction.deferUpdate();

          // Balance the teams
          const allPlayers = [inhouse.leader, ...inhouse.members];
          const balancedTeams = await balanceTeams(inhouse.guildId, allPlayers);

          // Update in-house state
          inhouse.teamsBalanced = true;
          inhouse.balancedTeams = balancedTeams;

          // Create updated embed with teams
          const teamsEmbed = await createInhouseEmbed(
            inhouse,
            true,
            balancedTeams
          );

          // Remove all buttons since teams are created
          await interaction.editReply({
            embeds: [teamsEmbed.embed],
            files: teamsEmbed.files,
            components: [],
          });

          // Decrement user's active in-house count
          decrementUserInhouseCount(inhouse.leader.id);

          console.log(`⚖️ Teams created for in-house ${fullInhouseId}`);

          // Auto-delete in-house after 10 minutes
          inhouse.deleteTimer = setTimeout(async () => {
            try {
              activeInhouses.delete(fullInhouseId);

              // Check if message exists before deleting
              if (interaction.message) {
                try {
                  await interaction.message.delete();
                  console.log(`[INHOUSE] Auto-deleted completed inhouse message ${fullInhouseId}`);
                } catch (deleteError) {
                  console.log(
                    `[INHOUSE] Could not auto-delete message for ${fullInhouseId}: ${deleteError.message}`
                  );
                  if (deleteError.code === 10008) {
                    console.log(`[INHOUSE] Message already deleted`);
                  }
                }
              } else {
                console.log(`[INHOUSE] No message to delete for ${fullInhouseId}`);
              }
            } catch (error) {
              console.error(`[INHOUSE] Error in delete timer for ${fullInhouseId}:`, error.message);
            }
          }, 10 * 60 * 1000);
        } catch (error) {
          console.error("Error creating teams:", error);
          // If interaction is already acknowledged, we can't reply again
          if (!interaction.replied && !interaction.deferred) {
            await interaction
              .reply({
                content:
                  "❌ There was an error creating teams. Please try again.",
                ephemeral: true,
              })
              .catch(console.error);
          }
        }
      } else if (action === "disband") {
        // Only leader can disband
        if (userId !== inhouse.leader.id) {
          return interaction.reply({
            content: "❌ Only the match host can disband the match!",
            ephemeral: true,
          });
        }

        try {
          // Clear all timers before disbanding to prevent memory leaks
          if (inhouse.resendTimer) {
            clearTimeout(inhouse.resendTimer);
          }
          if (inhouse.expiryTimer) {
            clearTimeout(inhouse.expiryTimer);
          }
          if (inhouse.deleteTimer) {
            clearTimeout(inhouse.deleteTimer);
          }

          // Decrement user's active in-house count
          decrementUserInhouseCount(inhouse.leader.id);

          // Remove in-house from active in-houses
          activeInhouses.delete(fullInhouseId);

          console.log(
            `🗑️ In-house ${fullInhouseId} disbanded by ${interaction.user.username}`
          );

          // Just delete the message
          await interaction.message?.delete().catch(() => {});
        } catch (error) {
          console.error("❌ Error disbanding in-house:", error);
          await interaction
            .reply({
              content: `❌ There was an error disbanding the match: ${error.message}`,
              ephemeral: true,
            })
            .catch(console.error);
        }

        return;
      }
    });

    // Listen for guild cleanup event (bot kicked from server)
    client.on('guildCleanup', (guildId) => {
      let cleanedCount = 0;
      for (const [inhouseId, inhouse] of activeInhouses.entries()) {
        if (inhouse.guildId === guildId) {
          // Clear all timers
          if (inhouse.resendTimer) clearTimeout(inhouse.resendTimer);
          if (inhouse.expiryTimer) clearTimeout(inhouse.expiryTimer);
          if (inhouse.deleteTimer) clearTimeout(inhouse.deleteTimer);

          // Decrement user's active in-house count
          decrementUserInhouseCount(inhouse.leader.id);

          activeInhouses.delete(inhouseId);
          cleanedCount++;
        }
      }
      if (cleanedCount > 0) {
        console.log(`[INHOUSE] 🧹 Cleaned up ${cleanedCount} active inhouse(es) for guild ${guildId}`);
      }
    });

    // Clear any existing in-houses from memory on restart
    activeInhouses.clear();
    client._valorantInhouseHandlerInitialized = true;
  }
};
