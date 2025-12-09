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
} = require("../utils/valorantCanvasUtils");

// Import functions from the API handler (with persistent storage)
const apiHandler = require("./valorantApiHandler");
const { saveTeamToHistory } = require("../database/helpers/teamHistoryHelpers");
const { getSetting } = require("../utils/settingsManager");

// ============ CONSTANTS ============
// Configuration - legacy fallback ID
const DEFAULT_VALORANT_ROLE_ID = "1058201257338228757";

// Canvas dimensions
const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 220;
const SLOT_WIDTH = 120;
const SLOT_HEIGHT = 120;
const SLOT_SPACING = 130;
const CANVAS_START_X = 40;
const CANVAS_START_Y = 75;

// Visual settings
const ACCENT_BORDER_WIDTH = 6;
const AVATAR_RADIUS = 30;
const RANK_BADGE_RADIUS = 12;
const GLOW_BLUR_LEADER = 15;
const AVATAR_FALLBACK_SIZE = 60;

// Team settings
const TEAM_SIZE = 5;
const MAX_WAITLIST_SIZE = 5;
const MIN_CLOSE_TEAM_SIZE = 2;

// Timer intervals (milliseconds)
const RESEND_INTERVAL = 10 * 60 * 1000; // 10 minutes
const AUTO_DISBAND_WARNING = 25 * 60 * 1000; // 25 minutes
const AUTO_DISBAND_FINAL = 30 * 60 * 1000; // 30 minutes (5 minutes after warning)
const AUTO_CLEANUP_DELAY = 10 * 60 * 1000; // 10 minutes
const CLOSE_CLEANUP_DELAY = 5 * 60 * 1000; // 5 minutes
const DISBAND_DELETE_DELAY = 5000; // 5 seconds

// Cache settings
const RANK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const RANK_CACHE_SIZE = 100;
const ACTIVE_TEAMS_CACHE_SIZE = 50;
// ===================================

// Helper to get Valorant role from settings
async function getValorantRoleId(guildId) {
  return await getSetting(guildId, 'roles.valorant_team', DEFAULT_VALORANT_ROLE_ID);
}

// Store active teams (auto-cleanup with size limit)
const activeTeams = new LimitedMap(ACTIVE_TEAMS_CACHE_SIZE);

// Cache for rank data to avoid repeated API calls
const rankCache = new LimitedMap(RANK_CACHE_SIZE);

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
  const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Use shared background utility
  createValorantBackground(ctx, CANVAS_WIDTH, CANVAS_HEIGHT);
  createAccentBorder(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, "#ff4654", ACCENT_BORDER_WIDTH);

  // Title with glow
  const titleText = team.name
    ? `🎯 ${team.name.toUpperCase()}`
    : "🎯 VALORANT TEAM BUILDER";
  drawGlowText(ctx, titleText, 350, 40, {
    font: "bold 28px Arial",
    glowColor: "#ff4654",
  });

  // Team status
  const totalMembers = getTotalMembers(team);
  const isFull = totalMembers >= TEAM_SIZE;
  ctx.font = "bold 16px Arial";
  ctx.fillStyle = isFull ? "#00ff88" : "#ffaa00";
  ctx.textAlign = "center";
  ctx.fillText(
    `${totalMembers}/${TEAM_SIZE} PLAYERS ${isFull ? "READY" : "NEEDED"}`,
    350,
    65
  );

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
  for (let i = 0; i < TEAM_SIZE; i++) {
    const x = CANVAS_START_X + i * SLOT_SPACING;
    const y = CANVAS_START_Y;
    const member = allMembers[i];
    const isFilled = !!member;

    // Draw slot background
    drawPlayerSlotBackground(
      ctx,
      x,
      y,
      SLOT_WIDTH,
      SLOT_HEIGHT,
      isFilled,
      "#ff4654"
    );

    if (member) {
      const avatar = avatars[i];
      const isLeader = i === 0;

      // Leader glow
      if (isLeader) {
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = GLOW_BLUR_LEADER;
      }

      // Draw avatar
      if (avatar) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + SLOT_WIDTH / 2, y + 40, AVATAR_RADIUS, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, x + SLOT_WIDTH / 2 - AVATAR_RADIUS, y + 10, AVATAR_FALLBACK_SIZE, AVATAR_FALLBACK_SIZE);
        ctx.restore();
      } else {
        // Fallback avatar
        ctx.fillStyle = "#5865f2";
        ctx.beginPath();
        ctx.arc(x + SLOT_WIDTH / 2, y + 40, AVATAR_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "30px Arial";
        ctx.textAlign = "center";
        ctx.fillText("👤", x + SLOT_WIDTH / 2, y + 50);
      }
      ctx.shadowBlur = 0;

      // Leader crown
      if (isLeader) {
        ctx.font = "22px Arial";
        ctx.fillStyle = "#ffd700";
        ctx.shadowColor = "#ffd700";
        ctx.shadowBlur = 5;
        ctx.textAlign = "center";
        ctx.fillText("👑", x + SLOT_WIDTH / 2, y - 5);
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
      ctx.fillText(truncatedName, x + SLOT_WIDTH / 2, y + 85);

      // Rank info (from batch fetch)
      const userRankInfo = rankInfoMap.get(member.id);
      if (userRankInfo) {
        // Draw rank indicator
        const rankColor = userRankInfo.color || getRankColor(userRankInfo.tier);
        ctx.fillStyle = rankColor;
        ctx.beginPath();
        ctx.arc(x + SLOT_WIDTH - 20, y + SLOT_HEIGHT - 20, RANK_BADGE_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // Rank text
        ctx.font = "bold 8px Arial";
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        const rankAbbr = userRankInfo.name
          .split(" ")[0]
          .substring(0, 3)
          .toUpperCase();
        ctx.fillText(rankAbbr, x + SLOT_WIDTH - 20, y + SLOT_HEIGHT - 17);

        // RR display
        if (userRankInfo.rr !== undefined) {
          ctx.font = "bold 10px Arial";
          ctx.fillStyle = rankColor;
          ctx.fillText(`${userRankInfo.rr} RR`, x + SLOT_WIDTH / 2, y + 102);
        }
      } else {
        // Not registered indicator
        ctx.font = "bold 9px Arial";
        ctx.fillStyle = "#666";
        ctx.textAlign = "center";
        ctx.fillText("!valstats", x + SLOT_WIDTH / 2, y + 102);
      }
    } else {
      // Empty slot
      ctx.fillStyle = "#555";
      ctx.font = "bold 13px Arial";
      ctx.textAlign = "center";
      ctx.fillText("OPEN", x + SLOT_WIDTH / 2, y + SLOT_HEIGHT / 2 - 5);
      ctx.font = "11px Arial";
      ctx.fillStyle = "#888";
      ctx.fillText("Click Join", x + SLOT_WIDTH / 2, y + SLOT_HEIGHT / 2 + 12);

      // Dashed border for empty
      ctx.strokeStyle = "rgba(255, 70, 84, 0.4)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x + 8, y + 8, SLOT_WIDTH - 16, SLOT_HEIGHT - 16);
      ctx.setLineDash([]);
    }

    // Slot number
    ctx.fillStyle = "#aaa";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${i + 1}`, x + SLOT_WIDTH / 2, y + SLOT_HEIGHT + 15);
  }

  return canvas.toBuffer();
}

/**
 * Create team embed with visual display
 */
async function createTeamEmbed(team) {
  const totalMembers = getTotalMembers(team);
  const isFull = totalMembers >= TEAM_SIZE;

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
    .setTitle(team.name ? `🎯 ${team.name}` : "🎯 Valorant Team Builder")
    .setDescription(
      [
        `**Leader:** ${team.leader.displayName}`,
        `**Rank:** ${leaderRankText}`,
        `**Avg Rank:** ${avgRank}`,
        `**Status:** ${totalMembers}/${TEAM_SIZE} Players`,
        team.targetTime
          ? `**Event Time:** <t:${Math.floor(team.targetTime / 1000)}:R>`
          : "",
        team.waitlist && team.waitlist.length > 0
          ? `**Waitlist:** ${team.waitlist
              .map((u) => u.displayName)
              .join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .setImage("attachment://team.png")
    .setFooter({
      text: isFull
        ? "✅ Team complete! Queue up!"
        : "💡 Click Join to fill the team",
    })
    .setTimestamp();

  return { embed, files: [attachment] };
}

/**
 * Create team action buttons - simplified layout
 */
function createTeamButtons(teamId, isFull, team = null) {
  const messageId = teamId.replace("valorant_team_", "");
  const teamCount = team ? getTotalMembers(team) : "?";

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`valorant_join_${messageId}`)
      .setLabel(isFull ? `Full (${TEAM_SIZE}/${TEAM_SIZE})` : `Join (${teamCount}/${TEAM_SIZE})`)
      .setStyle(isFull ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji(isFull ? "✅" : "➕")
      .setDisabled(
        isFull && team && team.waitlist && team.waitlist.length >= MAX_WAITLIST_SIZE
      ), // Cap waitlist
    new ButtonBuilder()
      .setCustomId(`valorant_leave_${messageId}`)
      .setLabel("Leave")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🚪")
  );

  // Add Waitlist buttons if full
  if (isFull) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`valorant_joinwaitlist_${messageId}`)
        .setLabel(`Join Waitlist (${team.waitlist ? team.waitlist.length : 0})`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⏳"),
      new ButtonBuilder()
        .setCustomId(`valorant_leavewaitlist_${messageId}`)
        .setLabel("Leave Waitlist")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("📤")
    );
  }

  // Add Close button if 2-4 players
  if (teamCount >= MIN_CLOSE_TEAM_SIZE && teamCount < TEAM_SIZE) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`valorant_close_${messageId}`)
        .setLabel("Close Team")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔒")
    );
  }

  // Add Disband button
  row1.addComponents(
    new ButtonBuilder()
      .setCustomId(`valorant_disband_${messageId}`)
      .setLabel("Disband")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🗑️")
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`valorant_reassign_${messageId}`)
      .setLabel("Transfer")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("👑"),
    new ButtonBuilder()
      .setCustomId(`valorant_invite_${messageId}`)
      .setLabel("Invite")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📨"),
    new ButtonBuilder()
      .setCustomId(`valorant_setname_${messageId}`)
      .setLabel("Set Name")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✏️"),
    new ButtonBuilder()
      .setCustomId(`valorant_settimer_${messageId}`)
      .setLabel("Set Timer")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⏱️")
  );

  return [row1, row2];
}

/**
 * Create disbanded team embed
 */
function createDisbandedEmbed() {
  return new EmbedBuilder()
    .setColor("#ff0000")
    .setTitle("❌ Team Disbanded")
    .setDescription(
      "This team has been disbanded.\n\n**Create a new team:** `!valorantteam` or mention @Valorant"
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
    console.error("[Team] Interaction error:", error.message);
    return false;
  }
}

module.exports = (client) => {
  apiHandler.init(client);

  if (client._valorantTeamHandlerInitialized) return;

  console.log("[Valorant Team] Handler initialized");

  /**
   * Update team message in place
   */
  async function updateTeamMessage(teamId) {
    const team = activeTeams.get(teamId);
    if (!team) return;

    try {
      const channel = await client.channels.fetch(team.channelId).catch(() => null);
      if (!channel) {
        console.error("[Team] Channel not found:", team.channelId, "for team:", teamId);
        activeTeams.delete(teamId);
        return;
      }

      const message = await channel.messages
        .fetch(team.messageId)
        .catch(() => null);
      if (!message) {
        console.error("[Team] Message not found:", team.messageId, "for team:", teamId);
        activeTeams.delete(teamId);
        return;
      }

      const isFull = getTotalMembers(team) >= TEAM_SIZE;
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
      console.error("[Team] Failed to update message:", error.message, "for team:", teamId);
      if (error.code === 10008) { // Unknown Message
        console.error("[Team] Message was deleted, cleaning up team:", teamId);
        activeTeams.delete(teamId);
      }
    }
  }

  /**
   * Create a new Valorant team
   * @param {Object} options - Team creation options
   * @param {User} options.leader - The user creating the team
   * @param {TextChannel} options.channel - The channel to create the team in
   * @param {number} [options.timerHours] - Optional timer in hours
   * @param {string} [options.name] - Optional custom team name
   */
  client.createValorantTeam = async ({
    leader,
    channel,
    timerHours = null,
    name = null,
  }) => {
    const teamId = `valorant_team_${Date.now()}_${leader.id}`; // Unique ID
    const team = {
      id: teamId,
      guildId: channel.guild.id,
      leader: {
        id: leader.id,
        username: leader.username,
        displayName: leader.displayName || leader.username,
        avatarURL: leader.displayAvatarURL({ extension: "png", size: 128 }),
      },
      members: [],
      channelId: channel.id,
      messageId: null,
      resendTimer: null,
      name: name,
      createdAt: new Date(),
      targetTime: timerHours ? Date.now() + timerHours * 60 * 60 * 1000 : null,
      waitlist: [],
    };

    try {
      // Send "Creating team..." message for immediate feedback
      const loadingMsg = await channel.send("⏳ Creating team...").catch(() => null);
      if (!loadingMsg) {
        console.error("[Team] Failed to send loading message to channel:", channel.id);
        return false;
      }

      const embed = await createTeamEmbed(team);
      const components = createTeamButtons(teamId, false, team);

      const teamMessage = await channel.send({
        embeds: [embed.embed],
        files: embed.files,
        components,
      }).catch((error) => {
        console.error("[Team] Failed to send team message:", error.message);
        return null;
      });

      if (!teamMessage) {
        console.error("[Team] Team message creation failed for channel:", channel.id);
        // Clean up loading message
        loadingMsg.delete().catch(() => {});
        return false;
      }

      // Delete loading message
      loadingMsg.delete().catch(() => {});

      team.messageId = teamMessage.id;
      activeTeams.set(teamId, team);

      // Set up periodic refresh
      team.resendTimer = setTimeout(
        () => updateTeamMessage(teamId),
        RESEND_INTERVAL
      );

      // Set up event start timer if applicable
      if (team.targetTime) {
        const timeUntil = team.targetTime - Date.now();
        if (timeUntil > 0) {
          team.eventTimer = setTimeout(async () => {
            const currentTeam = activeTeams.get(teamId);
            if (currentTeam) {
              try {
                const ch = await client.channels.fetch(currentTeam.channelId).catch(() => null);
                if (!ch) {
                  console.error("[Team] Channel not found for event timer:", currentTeam.channelId, "team:", teamId);
                  activeTeams.delete(teamId);
                  return;
                }

                const memberPings = [currentTeam.leader, ...currentTeam.members]
                  .map((m) => `<@${m.id}>`)
                  .join(" ");

                await ch.send(
                  `🚨 **EVENT STARTING NOW!** 🚨\n${memberPings}\n\nGood luck! 🎮`
                ).catch((error) => {
                  console.error("[Team] Failed to send event start message:", error.message);
                });

                // Auto-cleanup after event starts
                if (currentTeam.deleteTimer)
                  clearTimeout(currentTeam.deleteTimer);
                currentTeam.deleteTimer = setTimeout(
                  () => {
                    activeTeams.delete(teamId);
                    // Try to fetch message to delete it
                    ch.messages
                      .fetch(currentTeam.messageId)
                      .then((msg) => msg.delete())
                      .catch(() => {});
                  },
                  AUTO_CLEANUP_DELAY
                );
              } catch (err) {
                console.error("[Team] Event timer error:", err.message, "for team:", teamId);
                activeTeams.delete(teamId);
              }
            }
          }, timeUntil);
        }
      }

      // Auto-disband warning (only if no timer set, or if timer is far out)
      if (!team.targetTime) {
        team.warningTimer = setTimeout(
          async () => {
            const currentTeam = activeTeams.get(teamId);
            if (currentTeam && getTotalMembers(currentTeam) < TEAM_SIZE) {
              try {
                const ch = await client.channels.fetch(currentTeam.channelId).catch(() => null);
                if (!ch) {
                  console.error("[Team] Channel not found for warning:", currentTeam.channelId, "team:", teamId);
                  activeTeams.delete(teamId);
                  return;
                }

                await ch.send(
                  `⏰ Team will auto-disband in **5 minutes** if not filled! (${getTotalMembers(
                    currentTeam
                  )}/${TEAM_SIZE})`
                ).catch((error) => {
                  console.error("[Team] Failed to send warning message:", error.message);
                });
              } catch (error) {
                console.error("[Team] Warning timer error:", error.message, "for team:", teamId);
              }
            }
          },
          AUTO_DISBAND_WARNING
        );
      }

      return true;
    } catch (error) {
      console.error("[Team] Creation error:", error);
      return false;
    }
  };

  // Message handler for team creation
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // Check if message is in a guild
    if (!message.guild) return;

    // Get dynamic Valorant role ID from settings
    const valorantRoleId = await getValorantRoleId(message.guild.id);
    const valorantRoleMention = `<@&${valorantRoleId}>`;
    const isCommand = message.content.toLowerCase() === "!valorantteam";

    if (
      !message.content.includes(valorantRoleMention) &&
      !message.mentions.roles.has(valorantRoleId) &&
      !isCommand
    )
      return;

    // Check for timer argument in message content (simple parsing for !valorantteam timer:X)
    let timerHours = null;
    const timerMatch = message.content.match(/timer:(\d+(\.\d+)?)/);
    if (timerMatch) {
      timerHours = parseFloat(timerMatch[1]);
    }

    const success = await client.createValorantTeam({
      leader: message.author,
      channel: message.channel,
      timerHours,
    });

    if (!success) {
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

      // Handle Modal Submits
      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith("valorant_name_modal_")
      ) {
        const teamId = interaction.customId.replace("valorant_name_modal_", "");
        const fullTeamId = `valorant_team_${teamId}`;
        const team = activeTeams.get(fullTeamId);

        if (!team) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Team no longer exists.",
            ephemeral: true,
          });
        }

        const newName = interaction.fields.getTextInputValue("teamNameInput");
        team.name = newName;

        try {
          const isFull = getTotalMembers(team) >= TEAM_SIZE;
          const updatedEmbed = await createTeamEmbed(team);
          const updatedComponents = createTeamButtons(fullTeamId, isFull, team);

          const channel = await client.channels.fetch(team.channelId).catch(() => null);
          if (!channel) {
            console.error("[Team] Channel not found for name modal:", team.channelId, "team:", fullTeamId);
            activeTeams.delete(fullTeamId);
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Team channel not found.",
              ephemeral: true,
            });
          }

          const message = await channel.messages.fetch(team.messageId).catch(() => null);
          if (!message) {
            console.error("[Team] Message not found for name modal:", team.messageId, "team:", fullTeamId);
            activeTeams.delete(fullTeamId);
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Team message not found.",
              ephemeral: true,
            });
          }

          await message.edit({
            embeds: [updatedEmbed.embed],
            files: updatedEmbed.files,
            components: updatedComponents,
          }).catch((error) => {
            console.error("[Team] Failed to edit message for name:", error.message);
            throw error;
          });

          await safeInteractionResponse(interaction, "reply", {
            content: `✅ Team name set to **${newName}**!`,
            ephemeral: true,
          });
        } catch (error) {
          console.error("[Team] Set name error:", error.message, "team:", fullTeamId);
          if (error.code === 10008) { // Unknown Message
            activeTeams.delete(fullTeamId);
          }
          await safeInteractionResponse(interaction, "reply", {
            content: "❌ Failed to update team name.",
            ephemeral: true,
          });
        }
        return;
      }

      // Handle Timer Modal Submit
      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith("valorant_timer_modal_")
      ) {
        const teamId = interaction.customId.replace(
          "valorant_timer_modal_",
          ""
        );
        const fullTeamId = `valorant_team_${teamId}`;
        const team = activeTeams.get(fullTeamId);

        if (!team) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Team no longer exists.",
            ephemeral: true,
          });
        }

        const timerInput = interaction.fields.getTextInputValue("timerInput");
        const hours = parseFloat(timerInput);

        if (isNaN(hours) || hours <= 0) {
          return safeInteractionResponse(interaction, "reply", {
            content:
              "❌ Invalid time. Please enter a positive number of hours (e.g., 0.5 or 2).",
            ephemeral: true,
          });
        }

        // Update team timer
        team.targetTime = Date.now() + hours * 60 * 60 * 1000;

        // Reset event timer
        if (team.eventTimer) clearTimeout(team.eventTimer);

        const timeUntil = team.targetTime - Date.now();
        team.eventTimer = setTimeout(async () => {
          const currentTeam = activeTeams.get(fullTeamId);
          if (currentTeam) {
            try {
              const ch = await client.channels.fetch(currentTeam.channelId).catch(() => null);
              if (!ch) {
                console.error("[Team] Channel not found for timer event:", currentTeam.channelId, "team:", fullTeamId);
                activeTeams.delete(fullTeamId);
                return;
              }

              const memberPings = [currentTeam.leader, ...currentTeam.members]
                .map((m) => `<@${m.id}>`)
                .join(" ");

              await ch.send(
                `🚨 **EVENT STARTING NOW!** 🚨\n${memberPings}\n\nGood luck! 🎮`
              ).catch((error) => {
                console.error("[Team] Failed to send timer event message:", error.message);
              });

              // Auto-cleanup after event starts
              if (currentTeam.deleteTimer)
                clearTimeout(currentTeam.deleteTimer);
              currentTeam.deleteTimer = setTimeout(
                () => {
                  activeTeams.delete(fullTeamId);
                  ch.messages
                    .fetch(currentTeam.messageId)
                    .then((msg) => msg.delete())
                    .catch(() => {});
                },
                AUTO_CLEANUP_DELAY
              );
            } catch (err) {
              console.error("[Team] Event timer error:", err.message, "for team:", fullTeamId);
              activeTeams.delete(fullTeamId);
            }
          }
        }, timeUntil);

        // Clear warning timer if it exists (since we now have a set time)
        if (team.warningTimer) clearTimeout(team.warningTimer);

        try {
          const isFull = getTotalMembers(team) >= TEAM_SIZE;
          const updatedEmbed = await createTeamEmbed(team);
          const updatedComponents = createTeamButtons(fullTeamId, isFull, team);

          const channel = await client.channels.fetch(team.channelId).catch(() => null);
          if (!channel) {
            console.error("[Team] Channel not found for timer modal:", team.channelId, "team:", fullTeamId);
            activeTeams.delete(fullTeamId);
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Team channel not found.",
              ephemeral: true,
            });
          }

          const message = await channel.messages.fetch(team.messageId).catch(() => null);
          if (!message) {
            console.error("[Team] Message not found for timer modal:", team.messageId, "team:", fullTeamId);
            activeTeams.delete(fullTeamId);
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Team message not found.",
              ephemeral: true,
            });
          }

          await message.edit({
            embeds: [updatedEmbed.embed],
            files: updatedEmbed.files,
            components: updatedComponents,
          }).catch((error) => {
            console.error("[Team] Failed to edit message for timer:", error.message);
            throw error;
          });

          await safeInteractionResponse(interaction, "reply", {
            content: `✅ Timer set for **${hours} hours** from now!`,
            ephemeral: true,
          });
        } catch (error) {
          console.error("[Team] Set timer error:", error.message, "team:", fullTeamId);
          if (error.code === 10008) { // Unknown Message
            activeTeams.delete(fullTeamId);
          }
          await safeInteractionResponse(interaction, "reply", {
            content: "❌ Failed to update timer.",
            ephemeral: true,
          });
        }
        return;
      }

      // Handle leader selection menu
      if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith("valorant_selectleader_")
      ) {
        const teamId = interaction.customId.split("_").slice(2).join("_");
        const fullTeamId = `valorant_team_${teamId}`;
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
          const isFull = getTotalMembers(team) >= TEAM_SIZE;
          const updatedEmbed = await createTeamEmbed(team);
          const updatedComponents = createTeamButtons(fullTeamId, isFull, team);

          const channel = await client.channels.fetch(team.channelId).catch(() => null);
          if (!channel) {
            console.error("[Team] Channel not found for leader transfer:", team.channelId, "team:", fullTeamId);
            activeTeams.delete(fullTeamId);
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Team channel not found.",
              ephemeral: true,
            });
          }

          const message = await channel.messages.fetch(team.messageId).catch(() => null);
          if (!message) {
            console.error("[Team] Message not found for leader transfer:", team.messageId, "team:", fullTeamId);
            activeTeams.delete(fullTeamId);
            return safeInteractionResponse(interaction, "reply", {
              content: "❌ Team message not found.",
              ephemeral: true,
            });
          }

          await message.edit({
            embeds: [updatedEmbed.embed],
            files: updatedEmbed.files,
            components: updatedComponents,
          }).catch((error) => {
            console.error("[Team] Failed to edit message for leader transfer:", error.message);
            throw error;
          });

          await safeInteractionResponse(interaction, "reply", {
            content: `✅ ${newLeader.displayName} is now team leader!`,
            ephemeral: true,
          });
        } catch (error) {
          console.error("[Team] Leader transfer error:", error.message, "team:", fullTeamId);
          if (error.code === 10008) { // Unknown Message
            activeTeams.delete(fullTeamId);
          }
          await safeInteractionResponse(interaction, "reply", {
            content: "❌ Failed to transfer leadership.",
            ephemeral: true,
          });
        }
        return;
      }

      // Handle button interactions
      if (!interaction.isButton()) return;
      if (!interaction.customId.startsWith("valorant_")) return;

      const parts = interaction.customId.split("_");
      const action = parts[1];
      const teamId = parts.slice(2).join("_");
      const fullTeamId = `valorant_team_${teamId}`;

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
        if (
          userId === team.leader.id ||
          team.members.some((m) => m.id === userId)
        ) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ You're already in this team!",
            ephemeral: true,
          });
        }

        if (getTotalMembers(team) >= TEAM_SIZE) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Team is full!",
            ephemeral: true,
          });
        }

        // Defer immediately to prevent timeout (canvas generation can take >3s)
        await interaction.deferUpdate().catch(() => {});

        team.members.push(userInfo);

        try {
          const isFull = getTotalMembers(team) >= TEAM_SIZE;
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
              .setTitle("🎉 Team Complete!")
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
              const channel = await client.channels.fetch(team.channelId).catch(() => null);
              if (!channel) {
                console.error("[Team] Channel not found for celebration:", team.channelId, "team:", fullTeamId);
              } else {
                await channel.send({ embeds: [celebrationEmbed] }).catch((error) => {
                  console.error("[Team] Failed to send celebration message:", error.message);
                });
              }
            } catch (error) {
              console.error("[Team] Celebration error:", error.message);
            }

            // Auto-cleanup ONLY if no future event is scheduled
            if (!team.targetTime || team.targetTime < Date.now()) {
              team.deleteTimer = setTimeout(
                () => {
                  activeTeams.delete(fullTeamId);
                  interaction.message?.delete().catch(() => {});
                },
                AUTO_CLEANUP_DELAY
              );
            }

            // Save to history
            saveTeamToHistory({
              ...team,
              guildId: interaction.guildId,
              createdAt: new Date(Date.now() - RESEND_INTERVAL * 0.1), // Approximate creation time
              status: "completed",
            }).catch(console.error);
          }
        } catch (error) {
          console.error("[Team] Join error:", error);
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

        // Auto-promote from waitlist
        let promotedUser = null;
        if (team.waitlist && team.waitlist.length > 0) {
          promotedUser = team.waitlist.shift();
          team.members.push(promotedUser);
        }

        try {
          const isFull = getTotalMembers(team) >= TEAM_SIZE;
          const updatedEmbed = await createTeamEmbed(team);
          const updatedComponents = createTeamButtons(fullTeamId, isFull, team);

          await interaction.editReply({
            embeds: [updatedEmbed.embed],
            files: updatedEmbed.files,
            components: updatedComponents,
          });

          if (promotedUser) {
            try {
              const channel = await client.channels.fetch(team.channelId).catch(() => null);
              if (!channel) {
                console.error("[Team] Channel not found for promotion message:", team.channelId, "team:", fullTeamId);
              } else {
                await channel.send(
                  `🎉 <@${promotedUser.id}> has been promoted from the waitlist!`
                ).catch((error) => {
                  console.error("[Team] Failed to send promotion message:", error.message);
                });
              }
            } catch (error) {
              console.error("[Team] Promotion message error:", error.message);
            }
          }

          // Restart refresh timer if needed
          if (!isFull && !team.resendTimer) {
            team.resendTimer = setTimeout(
              () => updateTeamMessage(fullTeamId),
              RESEND_INTERVAL
            );
          }
        } catch (error) {
          console.error("[Team] Leave error:", error);
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
          .setCustomId(`valorant_selectleader_${teamId}`)
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
          content: `📨 **Invite Players:**\nShare this command: \`!valorantteam\` or tell them to click the **Join** button above!\n\n(Direct invites coming soon)`,
          ephemeral: true,
        });
      }

      // SET NAME
      else if (action === "setname") {
        if (userId !== team.leader.id) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the leader can set the team name!",
            ephemeral: true,
          });
        }

        const modal = new ModalBuilder()
          .setCustomId(`valorant_name_modal_${teamId}`)
          .setTitle("Set Team Name");

        const nameInput = new TextInputBuilder()
          .setCustomId("teamNameInput")
          .setLabel("Enter team name")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g., The Dream Team")
          .setMaxLength(30)
          .setMinLength(2)
          .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(nameInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
      }

      // SET TIMER
      else if (action === "settimer") {
        if (userId !== team.leader.id) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the leader can set the timer!",
            ephemeral: true,
          });
        }

        const modal = new ModalBuilder()
          .setCustomId(`valorant_timer_modal_${teamId}`)
          .setTitle("Set Event Timer");

        const timerInput = new TextInputBuilder()
          .setCustomId("timerInput")
          .setLabel("Hours until event (e.g. 0.5 or 2)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("1.5")
          .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(timerInput);
        modal.addComponents(firstActionRow);

        await interaction.showModal(modal);
      }

      // CLOSE TEAM
      else if (action === "close") {
        if (userId !== team.leader.id) {
          return safeInteractionResponse(interaction, "reply", {
            content: "❌ Only the leader can close the team!",
            ephemeral: true,
          });
        }

        if (getTotalMembers(team) < MIN_CLOSE_TEAM_SIZE) {
          return safeInteractionResponse(interaction, "reply", {
            content: `❌ Need at least ${MIN_CLOSE_TEAM_SIZE} players to close the team!`,
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
          .setTitle(team.name ? `🔒 ${team.name} (Closed)` : "🔒 Team Closed")
          .setDescription(
            `Team closed by leader with ${getTotalMembers(team)} players.`
          )
          .setTimestamp();

        try {
          // Update original message to show closed state
          const channel = await client.channels.fetch(team.channelId).catch(() => null);
          if (!channel) {
            console.error("[Team] Channel not found for close:", team.channelId, "team:", fullTeamId);
            activeTeams.delete(fullTeamId);
            return;
          }

          const message = await channel.messages.fetch(team.messageId).catch(() => null);
          if (!message) {
            console.error("[Team] Message not found for close:", team.messageId, "team:", fullTeamId);
            activeTeams.delete(fullTeamId);
            return;
          }

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
          }).catch((error) => {
            console.error("[Team] Failed to edit message for close:", error.message);
            throw error;
          });

          // Auto-cleanup
          team.deleteTimer = setTimeout(
            () => {
              activeTeams.delete(fullTeamId);
              message.delete().catch(() => {});
            },
            CLOSE_CLEANUP_DELAY
          );

          // Save to history
          saveTeamToHistory({
            ...team,
            guildId: interaction.guildId,
            createdAt: new Date(Date.now() - RESEND_INTERVAL * 0.1), // Approximate
            status: "completed", // Closed teams count as completed for history
          }).catch(console.error);
        } catch (error) {
          console.error("[Team] Close error:", error.message, "team:", fullTeamId);
          if (error.code === 10008) { // Unknown Message
            activeTeams.delete(fullTeamId);
          }
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

        // Delete after short delay
        setTimeout(() => {
          interaction.message?.delete().catch(() => {});
        }, DISBAND_DELETE_DELAY);
      }
    } catch (error) {
      console.error("[Team] Handler error:", error);
    }
  });

  activeTeams.clear();
  client._valorantTeamHandlerInitialized = true;
};
