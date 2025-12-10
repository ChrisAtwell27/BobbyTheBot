const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const { createCanvas } = require("canvas");
// TARGET_GUILD_ID removed for multi-guild support
const { LimitedMap } = require("../utils/memoryUtils");
const {
  loadImageFromURL,
  createValorantBackground,
  createAccentBorder,
  drawGlowText,
  drawPlayerSlotBackground,
  getRankColor,
} = require("../utils/valorantCanvasUtils");

// Import functions from the API handler (with persistent storage)
const apiHandler = require("./valorantApiHandler");
const { saveTeamToHistory } = require("../database/helpers/teamHistoryHelpers");
const { getSetting } = require("../utils/settingsManager");
const { getAgentById } = require("../valorantApi/agentUtils");

// Configuration - legacy fallback ID
const DEFAULT_RAW_VALORANT_ROLE_ID = "1166209212418904145";
const TEAM_NAME = "RaW Valorant";

// Helper to get RaW Valorant role from settings
async function getRawValorantRoleId(guildId) {
  return await getSetting(guildId, 'roles.valorant_inhouse', DEFAULT_RAW_VALORANT_ROLE_ID);
}

// Store active teams (auto-cleanup with size limit of 50)
const activeTeams = new LimitedMap(50);

// Cache for rank data to avoid repeated API calls (TTL: 5 minutes)
const rankCache = new LimitedMap(100);
const RANK_CACHE_TTL = 5 * 60 * 1000;

// Resend interval in milliseconds (10 minutes)
const RESEND_INTERVAL = 10 * 60 * 1000;
const TEAM_LIFETIME = 4 * 60 * 60 * 1000; // 4 hours

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

        const rankData = await apiHandler.getUserRankData(guildId, userId);
        if (!rankData) return { userId, data: null };

        const rankInfo =
          apiHandler.RANK_MAPPING[rankData.tier] || apiHandler.RANK_MAPPING[0];
        const data = {
          ...rankInfo,
          tier: rankData.tier,
          rr: rankData.rr,
          preferredAgents: registration.preferredAgents || [],
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
 * Get total team members count
 */
function getTotalMembers(team) {
  return 1 + team.members.length;
}

/**
 * Create optimized team visualization with batch rank loading
 */
async function createTeamVisualization(team) {
  const canvas = createCanvas(700, 220);
  const ctx = canvas.getContext("2d");

  // Use shared background utility
  createValorantBackground(ctx, 700, 220);
  createAccentBorder(ctx, 700, 220, "#ff4654", 6);

  // Title with glow
  const titleText = `🎯 ${team.name.toUpperCase()}`;
  drawGlowText(ctx, titleText, 350, 40, {
    font: "bold 28px Arial",
    glowColor: "#ff4654",
  });

  // Team status
  const totalMembers = getTotalMembers(team);
  const isFull = totalMembers >= 5;
  ctx.font = "bold 16px Arial";
  ctx.fillStyle = isFull ? "#00ff88" : "#ffaa00";
  ctx.textAlign = "center";
  ctx.fillText(
    `${totalMembers}/5 PLAYERS ${isFull ? "READY" : "NEEDED"}`,
    350,
    65
  );

  // Layout constants
  const slotWidth = 120;
  const slotHeight = 120;
  const startX = 40;
  const startY = 75;
  const spacing = 130;

  const allMembers = [team.leader, ...team.members];

  // Batch fetch all rank info upfront
  const userIds = allMembers.filter((m) => m).map((m) => m.id);
  const rankInfoMap = await batchGetUserRankInfo(team.guildId, userIds);

  // Batch load all avatars in parallel
  const avatarPromises = allMembers.map(async (member) => {
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

  // Draw all slots
  for (let i = 0; i < 5; i++) {
    const x = startX + i * spacing;
    const y = startY;
    const member = allMembers[i];
    const isFilled = !!member;

    // Draw slot background
    drawPlayerSlotBackground(
      ctx,
      x,
      y,
      slotWidth,
      slotHeight,
      isFilled,
      "#ff4654"
    );

    if (member) {
      const avatar = avatars[i];
      const isLeader = i === 0;

      // Leader glow
      if (isLeader) {
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 15;
      }

      // Draw avatar
      if (avatar) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + slotWidth / 2, y + 40, 30, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, x + slotWidth / 2 - 30, y + 10, 60, 60);
        ctx.restore();
      } else {
        // Fallback avatar
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

      // Leader crown
      if (isLeader) {
        ctx.font = "22px Arial";
        ctx.fillStyle = "#ffd700";
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 5;
        ctx.textAlign = "center";
        ctx.fillText("👑", x + slotWidth / 2, y - 5);
        ctx.shadowBlur = 0;
      }

      // Username
      ctx.font = "bold 12px Arial";
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      const displayName = member.displayName || member.username;
      const truncatedName =
        displayName.length > 12
          ? displayName.substring(0, 11) + "…"
          : displayName;
      ctx.fillText(truncatedName, x + slotWidth / 2, y + 85);

      // Rank info (from batch fetch)
      const userRankInfo = rankInfoMap.get(member.id);
      if (userRankInfo) {
        // Draw rank indicator
        const rankColor = userRankInfo.color || getRankColor(userRankInfo.tier);
        ctx.fillStyle = rankColor;
        ctx.beginPath();
        ctx.arc(x + slotWidth - 20, y + slotHeight - 20, 12, 0, Math.PI * 2);
        ctx.fill();

        // Rank text
        ctx.font = "bold 8px Arial";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        const rankAbbr = userRankInfo.name
          .split(" ")[0]
          .substring(0, 3)
          .toUpperCase();
        ctx.fillText(rankAbbr, x + slotWidth - 20, y + slotHeight - 17);

        // RR display
        if (userRankInfo.rr !== undefined) {
          ctx.font = "bold 10px Arial";
          ctx.fillStyle = rankColor;
          ctx.fillText(`${userRankInfo.rr} RR`, x + slotWidth / 2, y + 102);
        }

        // Preferred agents display (below RR)
        if (userRankInfo.preferredAgents && userRankInfo.preferredAgents.length > 0) {
          ctx.font = "9px Arial";
          ctx.fillStyle = "#aaaaaa";
          ctx.textAlign = "center";
          const agentText = userRankInfo.preferredAgents
            .slice(0, 3)
            .map(id => {
              const agent = getAgentById(id);
              return agent ? agent.name.substring(0, 4) : id.substring(0, 4);
            })
            .join("/");
          ctx.fillText(agentText, x + slotWidth / 2, y + 113);
        }
      } else {
        // Not registered indicator
        ctx.font = "bold 9px Arial";
        ctx.fillStyle = "#666";
        ctx.textAlign = "center";
        ctx.fillText("!valstats", x + slotWidth / 2, y + 102);
      }
    } else {
      // Empty slot
      ctx.fillStyle = "#555";
      ctx.font = "bold 13px Arial";
      ctx.textAlign = "center";
      ctx.fillText("OPEN", x + slotWidth / 2, y + slotHeight / 2 - 5);
      ctx.font = "11px Arial";
      ctx.fillStyle = "#888";
      ctx.fillText("Click Join", x + slotWidth / 2, y + slotHeight / 2 + 12);

      // Dashed border for empty
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

  return canvas.toBuffer();
}

/**
 * Create team embed with visual display
 */
async function createTeamEmbed(team) {
  const totalMembers = getTotalMembers(team);
  const isFull = totalMembers >= 5;

  const teamImageBuffer = await createTeamVisualization(team);
  const attachment = new AttachmentBuilder(teamImageBuffer, {
    name: "team.png",
  });

  // Get leader rank from cache
  const rankInfoMap = await batchGetUserRankInfo(
    team.guildId,
    [team.leader, ...team.members].map((m) => m.id)
  );
  const leaderRankInfo = rankInfoMap.get(team.leader.id);
  const leaderRankText = leaderRankInfo
    ? `${leaderRankInfo.name} (${leaderRankInfo.rr ?? 0} RR)`
    : "❓ Use !valstats to register";

  // Calculate average rank
  let totalTier = 0;
  let rankedCount = 0;
  for (const member of [team.leader, ...team.members]) {
    const rank = rankInfoMap.get(member.id);
    if (rank) {
      totalTier += rank.tier;
      rankedCount++;
    }
  }
  const avgRank =
    rankedCount > 0
      ? apiHandler.RANK_MAPPING[Math.round(totalTier / rankedCount)]?.name ||
        "Unknown"
      : "N/A";

  const embed = new EmbedBuilder()
    .setColor(isFull ? "#00ff88" : "#ff4654")
    .setTitle(`🎯 ${team.name}`)
    .setDescription(
      [
        `**Leader:** ${team.leader.displayName}`,
        `**Rank:** ${leaderRankText}`,
        `**Avg Rank:** ${avgRank}`,
        `**Status:** ${totalMembers}/5 Players`,
      ].join("\n")
    )
    .setImage("attachment://team.png")
    .setFooter({
      text: isFull
        ? "✅ Team complete! Queue up!"
        : "💡 Click Join to fill the team (RaW Role Required)",
    })
    .setTimestamp();

  return { embed, files: [attachment] };
}

/**
 * Create team action buttons - simplified layout
 */
function createTeamButtons(teamId, isFull, team = null) {
  const messageId = teamId.replace("raw_valorant_team_", "");
  const teamCount = team ? getTotalMembers(team) : "?";

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`raw_valorant_join_${messageId}`)
      .setLabel(isFull ? "Full (5/5)" : `Join (${teamCount}/5)`)
      .setStyle(isFull ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji(isFull ? "✅" : "➕")
      .setDisabled(isFull),
    new ButtonBuilder()
      .setCustomId(`raw_valorant_leave_${messageId}`)
      .setLabel("Leave")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🚪")
  );

  // Add Close button if 2-4 players
  if (teamCount >= 2 && teamCount < 5) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`raw_valorant_close_${messageId}`)
        .setLabel("Close Team")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔒")
    );
  }

  // Add Disband button
  row1.addComponents(
    new ButtonBuilder()
      .setCustomId(`raw_valorant_disband_${messageId}`)
      .setLabel("Disband")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🗑️")
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`raw_valorant_reassign_${messageId}`)
      .setLabel("Transfer")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("👑"),
    new ButtonBuilder()
      .setCustomId(`raw_valorant_invite_${messageId}`)
      .setLabel("Invite")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📨")
  );

  return [row1, row2];
}

/**
 * Create disbanded team embed
 */
function createDisbandedEmbed() {
  return new EmbedBuilder()
    .setColor("#ff0000")
    .setTitle("❌ RaW Team Disbanded")
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
    console.error("[RaW Team] Interaction error:", error.message);
    return false;
  }
}

module.exports = (client) => {
  apiHandler.init(client);

  if (client._rawValorantTeamHandlerInitialized) return;

  console.log("[RaW Valorant Team] Handler initialized");

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

      const isFull = getTotalMembers(team) >= 5;
      const updatedEmbed = await createTeamEmbed(team);
      const updatedComponents = createTeamButtons(teamId, isFull, team);

      await message.edit({
        embeds: [updatedEmbed.embed],
        files: updatedEmbed.files,
        components: updatedComponents,
      });

      // Schedule next update if not full
      if (!isFull) {
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

  // Message handler for team creation
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    // Get dynamic RaW Valorant role ID from settings
    const rawValorantRoleId = await getRawValorantRoleId(message.guild.id);
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
          .reply("❌ You need the **RaW Valorant** role to create a RaW team!")
          .catch(() => {});
      }
      return;
    }

    const teamId = `raw_valorant_team_${message.id}`;
    const team = {
      id: teamId,
      guildId: message.guild.id,
      leader: {
        id: message.author.id,
        username: message.author.username,
        displayName: message.author.displayName || message.author.username,
        avatarURL: message.author.displayAvatarURL({
          extension: "png",
          size: 128,
        }),
      },
      members: [],
      channelId: message.channel.id,
      messageId: null,
      resendTimer: null,
      name: TEAM_NAME,
      createdAt: new Date(),
    };

    try {
      // Send "Creating team..." message for immediate feedback
      const loadingMsg = await message.channel.send("⏳ Creating RaW team...");

      const embed = await createTeamEmbed(team);
      const components = createTeamButtons(teamId, false, team);

      const teamMessage = await message.channel.send({
        embeds: [embed.embed],
        files: embed.files,
        components,
      });

      // Delete loading message
      loadingMsg.delete().catch(() => {});

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
    } catch (error) {
      console.error("[RaW Team] Creation error:", error);
      message.reply("❌ Failed to create team. Try again.").catch(() => {});
    }
  });

  // Interaction handler
  client.on("interactionCreate", async (interaction) => {
    try {
      const {
        ModalBuilder,
        TextInputBuilder,
        TextInputStyle,
      } = require("discord.js");

      // Handle leader selection menu
      if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith("raw_valorant_selectleader_")
      ) {
        const teamId = interaction.customId.split("_").slice(3).join("_");
        const fullTeamId = `raw_valorant_team_${teamId}`;
        const team = activeTeams.get(fullTeamId);

        if (!team) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Team no longer exists.",
            ephemeral: true,
          });
        }

        const newLeaderId = interaction.values[0];
        const memberIndex = team.members.findIndex((m) => m.id === newLeaderId);

        if (memberIndex === -1) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Player not found in team.",
            ephemeral: true,
          });
        }

        // Swap leader
        const newLeader = team.members[memberIndex];
        team.members[memberIndex] = team.leader;
        team.leader = newLeader;

        try {
          const isFull = getTotalMembers(team) >= 5;
          const updatedEmbed = await createTeamEmbed(team);
          const updatedComponents = createTeamButtons(fullTeamId, isFull, team);

          const channel = await client.channels.fetch(team.channelId);
          const message = await channel.messages.fetch(team.messageId);
          await message.edit({
            embeds: [updatedEmbed.embed],
            files: updatedEmbed.files,
            components: updatedComponents,
          });

          await safeInteractionResponse(interaction, "reply", {
            content: `✅ ${newLeader.displayName} is now team leader!`,
            ephemeral: true,
          });
        } catch (error) {
          console.error("[RaW Team] Leader transfer error:", error);
          await safeInteractionResponse(interaction, "reply", {
            content: "❌ Failed to transfer leadership.",
            ephemeral: true,
          });
        }
        return;
      }

      // Handle button interactions
      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith("raw_valorant_")) return;

      const parts = interaction.customId.split("_");
      const action = parts[2]; // raw_valorant_ACTION_id
      const teamId = parts.slice(3).join("_");
      const fullTeamId = `raw_valorant_team_${teamId}`;

      const team = activeTeams.get(fullTeamId);

      if (!team) {
        return safeInteractionResponse(interaction, "reply", {
          content: "❌ Team no longer exists.",
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

      // JOIN
      if (action === "join") {
        // Check for RaW Role (dynamically from settings)
        const rawValorantRoleId = await getRawValorantRoleId(interaction.guild.id);
        const member = await interaction.guild.members.fetch(userId);
        if (!member.roles.cache.has(rawValorantRoleId)) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ You need the **RaW Valorant** role to join this team!",
            ephemeral: true,
          });
        }

        if (
          userId === team.leader.id ||
          team.members.some((m) => m.id === userId)
        ) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ You're already in this team!",
            ephemeral: true,
          });
        }

        if (getTotalMembers(team) >= 5) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Team is full!",
            ephemeral: true,
          });
        }

        // Defer immediately to prevent timeout (canvas generation can take >3s)
        await interaction.deferUpdate().catch(() => {});

        team.members.push(userInfo);

        try {
          const isFull = getTotalMembers(team) >= 5;
          const updatedEmbed = await createTeamEmbed(team);
          const updatedComponents = createTeamButtons(fullTeamId, isFull, team);

          await interaction.editReply({
            embeds: [updatedEmbed.embed],
            files: updatedEmbed.files,
            components: updatedComponents,
          });

          // Team complete celebration
          if (isFull) {
            if (team.resendTimer) clearTimeout(team.resendTimer);
            if (team.warningTimer) clearTimeout(team.warningTimer);

            const rankInfoMap = await batchGetUserRankInfo(
              team.guildId,
              [team.leader, ...team.members].map((m) => m.id)
            );

            let roster = "";
            let totalTier = 0;
            let rankedCount = 0;

            for (const member of [team.leader, ...team.members]) {
              const rank = rankInfoMap.get(member.id);
              const isLeader = member.id === team.leader.id;
              const badge = isLeader ? " 👑" : "";

              if (rank) {
                roster += `• **${member.displayName}**${badge} - ${rank.name} (${rank.rr} RR)\n`;
                totalTier += rank.tier;
                rankedCount++;
              } else {
                roster += `• **${member.displayName}**${badge} - Unranked\n`;
              }
            }

            const avgRank =
              rankedCount > 0
                ? apiHandler.RANK_MAPPING[Math.round(totalTier / rankedCount)]
                    ?.name || "Unknown"
                : "N/A";

            const celebrationEmbed = new EmbedBuilder()
              .setColor("#00ff88")
              .setTitle("🎉 RaW Team Complete!")
              .setDescription(
                `Queue up and dominate!\n\n**Average Rank:** ${avgRank}`
              )
              .addFields({
                name: "👥 Roster",
                value: roster || "No players",
                inline: false,
              })
              .setFooter({ text: "GLHF!" })
              .setTimestamp();

            try {
              const channel = await client.channels.fetch(team.channelId);
              await channel.send({ embeds: [celebrationEmbed] });
            } catch {}

            // Save to history
            saveTeamToHistory({
              ...team,
              guildId: interaction.guildId,
              createdAt: new Date(Date.now() - RESEND_INTERVAL * 0.1), // Approximate creation time
              status: "completed",
            }).catch(console.error);
          }
        } catch (error) {
          console.error("[RaW Team] Join error:", error);
        }
      }

      // LEAVE
      else if (action === "leave") {
        if (userId === team.leader.id) {
          return safeInteractionResponse(interaction, "reply", {
            content:
              "❌ Leaders cannot leave. Use Disband or Transfer leadership first.",
            ephemeral: true,
          });
        }

        const memberIndex = team.members.findIndex((m) => m.id === userId);
        if (memberIndex === -1) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ You're not in this team!",
            ephemeral: true,
          });
        }

        // Defer immediately to prevent timeout
        await interaction.deferUpdate().catch(() => {});

        team.members.splice(memberIndex, 1);

        try {
          const isFull = getTotalMembers(team) >= 5;
          const updatedEmbed = await createTeamEmbed(team);
          const updatedComponents = createTeamButtons(fullTeamId, isFull, team);

          await interaction.editReply({
            embeds: [updatedEmbed.embed],
            files: updatedEmbed.files,
            components: updatedComponents,
          });

          // Restart refresh timer if needed
          if (!isFull && !team.resendTimer) {
            team.resendTimer = setTimeout(
              () => updateTeamMessage(fullTeamId),
              RESEND_INTERVAL
            );
          }
        } catch (error) {
          console.error("[RaW Team] Leave error:", error);
        }
      }

      // REASSIGN LEADER
      else if (action === "reassign") {
        if (userId !== team.leader.id) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the leader can transfer leadership!",
            ephemeral: true,
          });
        }

        if (team.members.length === 0) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ No members to transfer to!",
            ephemeral: true,
          });
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`raw_valorant_selectleader_${teamId}`)
          .setPlaceholder("Select new leader")
          .addOptions(
            team.members.map((m) => ({
              label: m.displayName || m.username,
              value: m.id,
            }))
          );

        return safeInteractionResponse(interaction, "reply", {
          content: "👑 Select the new team leader:",
          components: [new ActionRowBuilder().addComponents(selectMenu)],
          ephemeral: true,
        });
      }

      // INVITE
      else if (action === "invite") {
        if (userId !== team.leader.id) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the leader can invite players!",
            ephemeral: true,
          });
        }

        return safeInteractionResponse(interaction, "reply", {
          content: `📨 **Invite Players:**\nShare this command: \`!rawteam\` or tell them to click the **Join** button above!`,
          ephemeral: true,
        });
      }

      // CLOSE TEAM
      else if (action === "close") {
        if (userId !== team.leader.id) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the leader can close the team!",
            ephemeral: true,
          });
        }

        if (getTotalMembers(team) < 2) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Need at least 2 players to close the team!",
            ephemeral: true,
          });
        }

        // Defer update
        await interaction.deferUpdate().catch(() => {});

        // Mark as closed/full effectively
        if (team.resendTimer) clearTimeout(team.resendTimer);
        if (team.warningTimer) clearTimeout(team.warningTimer);

        const closedEmbed = new EmbedBuilder()
          .setColor("#ffaa00")
          .setTitle(`🔒 ${team.name} (Closed)`)
          .setDescription(
            `Team closed by leader with ${getTotalMembers(team)} players.`
          )
          .setTimestamp();

        try {
          // Update original message to show closed state
          const channel = await client.channels.fetch(team.channelId);
          const message = await channel.messages.fetch(team.messageId);

          // Disable all buttons
          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("disabled_1")
              .setLabel("Team Closed")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          );

          await message.edit({
            embeds: [closedEmbed],
            components: [disabledRow],
            files: [], // Remove image to save space/indicate closure
          });

          // Save to history
          saveTeamToHistory({
            ...team,
            guildId: interaction.guildId,
            createdAt: new Date(Date.now() - RESEND_INTERVAL * 0.1), // Approximate
            status: "completed", // Closed teams count as completed for history
          }).catch(console.error);
        } catch (error) {
          console.error("[RaW Team] Close error:", error);
        }
      }

      // DISBAND
      else if (action === "disband") {
        if (userId !== team.leader.id) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the leader can disband the team!",
            ephemeral: true,
          });
        }

        // Clear all timers
        if (team.resendTimer) clearTimeout(team.resendTimer);
        if (team.warningTimer) clearTimeout(team.warningTimer);
        if (team.deleteTimer) clearTimeout(team.deleteTimer);

        activeTeams.delete(fullTeamId);

        await safeInteractionResponse(interaction, "update", {
          embeds: [createDisbandedEmbed()],
          components: [],
          files: [],
        });

        // Delete after 5 seconds
        setTimeout(() => {
          interaction.message?.delete().catch(() => {});
        }, 5000);
      }
    } catch (error) {
      console.error("[RaW Team] Handler error:", error);
    }
  });

  activeTeams.clear();
  client._rawValorantTeamHandlerInitialized = true;
};
