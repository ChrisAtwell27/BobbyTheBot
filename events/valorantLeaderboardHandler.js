const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage } = require("canvas");
const path = require("path");
const fs = require("fs");

// Import Valorant modules
const {
  getAllRegisteredUsers,
  getUserRankData,
} = require("../valorantApi/registrationManager");
const { getPlayerMatchStats } = require("../valorantApi/matchStats");
const { RANK_MAPPING, loadRankImage, createFallbackRankIcon } = require("../valorantApi/rankUtils");

// Import subscription utilities
const {
  checkSubscription,
  createUpgradeEmbed,
  TIERS,
} = require("../utils/subscriptionUtils");

// Import memory utilities for caching
const { LimitedMap } = require("../utils/memoryUtils");

// ===============================================
// VALORANT LEADERBOARD HANDLER
// ===============================================
// Provides !valtop command to display server leaderboard
// Based on recent 30 competitive matches stats
// ULTIMATE TIER REQUIRED
// Visual style matches !valstats command
// ===============================================

// Cache for leaderboard data (5 minute TTL)
const leaderboardCache = new LimitedMap(50);
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Canvas dimensions for leaderboard (matching !valstats style)
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 800;
const HEADER_HEIGHT = 100;
const ROW_HEIGHT = 55;
const PADDING = 25;

/**
 * Calculate a performance score based on match stats
 * Does NOT include rank in calculations - purely based on gameplay stats
 * @param {Object} stats - Player match statistics
 * @returns {number} - Performance score
 */
function calculatePerformanceScore(stats) {
  if (!stats || stats.totalMatches === 0) return 0;

  // Weighted scoring formula:
  // - KDA ratio: 35% weight (max 100 points)
  // - Win rate: 30% weight (max 100 points)
  // - Average Combat Score (ACS): 25% weight (max 100 points)
  // - Match count: 10% weight (max 100 points for 30+ matches)

  const kdaScore = Math.min(stats.avgKDA * 25, 100); // KDA of 4.0 = 100 points
  const winRateScore = stats.winRate; // Already 0-100
  const acsScore = Math.min((stats.avgACS / 300) * 100, 100); // ACS of 300+ = 100 points
  const matchCountScore = Math.min((stats.totalMatches / 30) * 100, 100); // 30+ matches = 100 points

  const totalScore =
    kdaScore * 0.35 +
    winRateScore * 0.3 +
    acsScore * 0.25 +
    matchCountScore * 0.1;

  return Math.round(totalScore * 10) / 10; // Round to 1 decimal
}

/**
 * Get rank emoji for display
 * @param {number} position - Leaderboard position (1-based)
 * @returns {string} - Emoji for the position
 */
function getPositionEmoji(position) {
  switch (position) {
    case 1:
      return "🥇";
    case 2:
      return "🥈";
    case 3:
      return "🥉";
    default:
      return `#${position}`;
  }
}

/**
 * Format KDA for display
 * @param {Object} stats - Player stats
 * @returns {string} - Formatted KDA string
 */
function formatKDA(stats) {
  return `${stats.totalKills}/${stats.totalDeaths}/${stats.totalAssists}`;
}

/**
 * Create leaderboard canvas image with !valstats visual style
 * @param {Array} leaderboard - Sorted leaderboard data
 * @param {Object} guild - Discord guild object
 * @returns {Promise<Buffer>} - Canvas buffer
 */
async function createLeaderboardCanvas(leaderboard, guild) {
  const displayCount = Math.min(leaderboard.length, 10);
  const canvasHeight = HEADER_HEIGHT + 60 + displayCount * ROW_HEIGHT + PADDING * 3;

  const canvas = createCanvas(CANVAS_WIDTH, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Enhanced background with pattern (matching !valstats style)
  const gradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, canvasHeight);
  gradient.addColorStop(0, "#0a0e13");
  gradient.addColorStop(0.3, "#1e2328");
  gradient.addColorStop(0.7, "#2c3e50");
  gradient.addColorStop(1, "#0a0e13");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight);

  // Add subtle pattern overlay (matching !valstats)
  ctx.fillStyle = "rgba(255, 70, 84, 0.03)";
  for (let i = 0; i < CANVAS_WIDTH; i += 50) {
    for (let j = 0; j < canvasHeight; j += 50) {
      if ((i + j) % 100 === 0) {
        ctx.fillRect(i, j, 25, 25);
      }
    }
  }

  // Enhanced Valorant-style border accents
  const accentGradient = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, 0);
  accentGradient.addColorStop(0, "#ff4654");
  accentGradient.addColorStop(0.5, "#ff6b7a");
  accentGradient.addColorStop(1, "#ff4654");
  ctx.fillStyle = accentGradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, 8);
  ctx.fillRect(0, canvasHeight - 8, CANVAS_WIDTH, 8);
  ctx.fillRect(0, 0, 8, canvasHeight);
  ctx.fillRect(CANVAS_WIDTH - 8, 0, 8, canvasHeight);

  // Enhanced header section
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "center";
  ctx.fillText("VALORANT SERVER LEADERBOARD", CANVAS_WIDTH / 2, 50);

  // Subtitle with guild name
  ctx.font = "18px Arial";
  ctx.fillStyle = "#cccccc";
  ctx.fillText(`${guild.name} • Top Performers`, CANVAS_WIDTH / 2, 75);

  // Section description
  ctx.font = "14px Arial";
  ctx.fillStyle = "#888888";
  ctx.fillText("Based on last 30 competitive matches • Score = (KDA × 35%) + (Win Rate × 30%) + (ACS × 25%) + (Matches × 10%)", CANVAS_WIDTH / 2, 95);

  // Column headers with styled box
  const headerY = HEADER_HEIGHT + 20;
  const headerBoxGradient = ctx.createLinearGradient(PADDING, headerY, CANVAS_WIDTH - PADDING, headerY + 35);
  headerBoxGradient.addColorStop(0, "rgba(255, 70, 84, 0.2)");
  headerBoxGradient.addColorStop(1, "rgba(255, 107, 122, 0.2)");
  ctx.fillStyle = headerBoxGradient;
  ctx.fillRect(PADDING, headerY, CANVAS_WIDTH - PADDING * 2, 35);

  ctx.font = "bold 14px Arial";
  ctx.fillStyle = "#ff4654";
  ctx.textAlign = "left";
  ctx.fillText("#", PADDING + 15, headerY + 23);
  ctx.fillText("PLAYER", PADDING + 60, headerY + 23);
  ctx.fillText("RANK", PADDING + 280, headerY + 23);
  ctx.fillText("K/D/A", PADDING + 450, headerY + 23);
  ctx.fillText("WIN%", PADDING + 580, headerY + 23);
  ctx.fillText("ACS", PADDING + 700, headerY + 23);
  ctx.fillText("SCORE", PADDING + 820, headerY + 23);

  // Draw rows
  const rowStartY = headerY + 50;
  for (let i = 0; i < displayCount; i++) {
    const player = leaderboard[i];
    const rowY = rowStartY + i * ROW_HEIGHT;

    // Row background with gradient (alternating + top 3 special colors)
    let rowGradient;
    if (i === 0) {
      // Gold for 1st place
      rowGradient = ctx.createLinearGradient(PADDING, rowY, CANVAS_WIDTH - PADDING, rowY + ROW_HEIGHT - 5);
      rowGradient.addColorStop(0, "rgba(255, 215, 0, 0.2)");
      rowGradient.addColorStop(1, "rgba(255, 215, 0, 0.05)");
    } else if (i === 1) {
      // Silver for 2nd place
      rowGradient = ctx.createLinearGradient(PADDING, rowY, CANVAS_WIDTH - PADDING, rowY + ROW_HEIGHT - 5);
      rowGradient.addColorStop(0, "rgba(192, 192, 192, 0.2)");
      rowGradient.addColorStop(1, "rgba(192, 192, 192, 0.05)");
    } else if (i === 2) {
      // Bronze for 3rd place
      rowGradient = ctx.createLinearGradient(PADDING, rowY, CANVAS_WIDTH - PADDING, rowY + ROW_HEIGHT - 5);
      rowGradient.addColorStop(0, "rgba(205, 127, 50, 0.2)");
      rowGradient.addColorStop(1, "rgba(205, 127, 50, 0.05)");
    } else if (i % 2 === 0) {
      // Subtle alternate row
      rowGradient = ctx.createLinearGradient(PADDING, rowY, CANVAS_WIDTH - PADDING, rowY + ROW_HEIGHT - 5);
      rowGradient.addColorStop(0, "rgba(255, 255, 255, 0.05)");
      rowGradient.addColorStop(1, "rgba(255, 255, 255, 0.02)");
    }

    if (rowGradient) {
      ctx.fillStyle = rowGradient;
      ctx.fillRect(PADDING, rowY, CANVAS_WIDTH - PADDING * 2, ROW_HEIGHT - 5);
    }

    // Row border for top 3
    if (i < 3) {
      ctx.strokeStyle = i === 0 ? "#ffd700" : i === 1 ? "#c0c0c0" : "#cd7f32";
      ctx.lineWidth = 2;
      ctx.strokeRect(PADDING, rowY, CANVAS_WIDTH - PADDING * 2, ROW_HEIGHT - 5);
    }

    const textY = rowY + 32;

    // Position with medal emoji/number
    ctx.font = "bold 20px Arial";
    ctx.textAlign = "left";
    if (i < 3) {
      ctx.fillStyle = i === 0 ? "#ffd700" : i === 1 ? "#c0c0c0" : "#cd7f32";
      ctx.fillText(getPositionEmoji(i + 1), PADDING + 12, textY);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`${i + 1}`, PADDING + 15, textY);
    }

    // Player name (valorant name)
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px Arial";
    const displayName =
      player.valorantName.length > 18
        ? player.valorantName.substring(0, 18) + "..."
        : player.valorantName;
    ctx.fillText(displayName, PADDING + 60, textY);

    // Discord name below (smaller)
    ctx.font = "11px Arial";
    ctx.fillStyle = "#888888";
    const discordDisplay =
      player.discordName.length > 20
        ? player.discordName.substring(0, 20) + "..."
        : player.discordName;
    ctx.fillText(discordDisplay, PADDING + 60, textY + 14);

    // Comp rank with icon
    const rankInfo = RANK_MAPPING[player.rankTier] || RANK_MAPPING[0];
    const rankIconSize = 32;
    const rankIconX = PADDING + 275;
    const rankIconY = rowY + (ROW_HEIGHT - rankIconSize) / 2 - 2;

    // Try to load and draw rank image
    const rankImage = await loadRankImage(player.rankTier);
    if (rankImage) {
      ctx.drawImage(rankImage, rankIconX, rankIconY, rankIconSize, rankIconSize);
    } else {
      createFallbackRankIcon(ctx, rankIconX, rankIconY, rankIconSize, rankInfo);
    }

    // Rank name next to icon
    ctx.fillStyle = rankInfo.color;
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "left";
    ctx.fillText(rankInfo.name, rankIconX + rankIconSize + 5, textY + 4);

    // KDA
    ctx.fillStyle = "#ffffff";
    ctx.font = "14px Arial";
    const kdaStr = formatKDA(player.stats);
    ctx.fillText(kdaStr, PADDING + 450, textY - 5);
    // KDA ratio below
    ctx.font = "11px Arial";
    ctx.fillStyle = player.stats.avgKDA >= 1.5 ? "#00ff88" : player.stats.avgKDA >= 1.0 ? "#ffff00" : "#ff8800";
    ctx.fillText(`${player.stats.avgKDA.toFixed(2)} K/D`, PADDING + 450, textY + 10);

    // Win rate with color coding
    const winColor =
      player.stats.winRate >= 55
        ? "#00ff88"
        : player.stats.winRate >= 50
          ? "#4ade80"
          : player.stats.winRate >= 45
            ? "#ffff00"
            : player.stats.winRate >= 40
              ? "#ff8800"
              : "#ff4444";
    ctx.fillStyle = winColor;
    ctx.font = "bold 16px Arial";
    ctx.fillText(`${player.stats.winRate.toFixed(1)}%`, PADDING + 580, textY);

    // ACS with color coding
    const acsColor =
      player.stats.avgACS >= 250
        ? "#00ff88"
        : player.stats.avgACS >= 200
          ? "#ffff00"
          : player.stats.avgACS >= 150
            ? "#ff8800"
            : "#ff4444";
    ctx.fillStyle = acsColor;
    ctx.font = "bold 16px Arial";
    ctx.fillText(Math.round(player.stats.avgACS).toString(), PADDING + 700, textY);

    // Performance score (highlighted)
    ctx.fillStyle = "#ff4654";
    ctx.font = "bold 20px Arial";
    ctx.fillText(player.score.toFixed(1), PADDING + 820, textY);
  }

  // Footer with branding
  ctx.fillStyle = "#666666";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    "Powered by HenrikDev API • Data cached for 10 minutes • Use !valstats to register",
    CANVAS_WIDTH / 2,
    canvasHeight - 20
  );

  return canvas.toBuffer("image/png");
}

/**
 * Fetch and build the leaderboard for a guild
 * @param {string} guildId - Discord guild ID
 * @param {Object} client - Discord client
 * @returns {Promise<Array>} - Sorted leaderboard array
 */
async function buildLeaderboard(guildId, client) {
  // Check cache first
  const cached = leaderboardCache.get(guildId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Valorant Leaderboard] Using cached data for guild ${guildId}`);
    return cached.data;
  }

  console.log(`[Valorant Leaderboard] Building fresh leaderboard for guild ${guildId}`);

  // Get all registered users
  const registeredUsers = await getAllRegisteredUsers(guildId);

  if (registeredUsers.size === 0) {
    return [];
  }

  const leaderboardData = [];
  const guild = await client.guilds.fetch(guildId).catch(() => null);

  // Process each registered user
  for (const [userId, registration] of registeredUsers) {
    if (!registration) continue;

    // Validate registration has required fields
    if (!registration.name || !registration.tag || !registration.region) {
      console.log(
        `[Valorant Leaderboard] Skipping user ${userId} - incomplete registration data (missing name, tag, or region)`
      );
      continue;
    }

    try {
      // Get match stats (last 30 competitive matches)
      const stats = await getPlayerMatchStats(registration);

      // Skip users with no competitive matches
      if (!stats || stats.totalMatches === 0) {
        console.log(
          `[Valorant Leaderboard] Skipping ${registration.name}#${registration.tag} - no competitive matches`
        );
        continue;
      }

      // Get rank data for display (not for scoring)
      const rankData = await getUserRankData(guildId, userId);
      const rankTier = rankData?.tier || rankData?.current_data?.currenttier || 0;

      // Calculate performance score (rank NOT included)
      const score = calculatePerformanceScore(stats);

      // Get Discord member for display name
      let discordName = userId;
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          discordName = member.displayName;
        }
      }

      leaderboardData.push({
        discordId: userId,
        discordName,
        valorantName: `${registration.name}#${registration.tag}`,
        rankTier,
        stats,
        score,
      });

      console.log(
        `[Valorant Leaderboard] Processed ${registration.name}#${registration.tag}: Score ${score}`
      );
    } catch (error) {
      console.error(
        `[Valorant Leaderboard] Error processing user ${userId}:`,
        error.message
      );
    }
  }

  // Sort by performance score (descending)
  leaderboardData.sort((a, b) => b.score - a.score);

  // Cache the result
  leaderboardCache.set(guildId, {
    data: leaderboardData,
    timestamp: Date.now(),
  });

  return leaderboardData;
}

/**
 * Create text-based leaderboard embed (fallback if canvas fails)
 * @param {Array} leaderboard - Sorted leaderboard data
 * @param {Object} guild - Discord guild object
 * @returns {EmbedBuilder} - Discord embed
 */
function createLeaderboardEmbed(leaderboard, guild) {
  const embed = new EmbedBuilder()
    .setColor(0xff4654) // Valorant red
    .setTitle(`🏆 VALORANT SERVER LEADERBOARD`)
    .setDescription(
      `**${guild.name}** • Top Performers\n\n` +
      "*Based on last 30 competitive matches*\n" +
      "*Score = (KDA × 35%) + (Win Rate × 30%) + (ACS × 25%) + (Matches × 10%)*"
    )
    .setTimestamp();

  if (leaderboard.length === 0) {
    embed.addFields({
      name: "No Players Found",
      value:
        "No registered players with competitive match data found.\n\n" +
        "**How to join the leaderboard:**\n" +
        "1. Use `!valstats YourName#TAG` to register\n" +
        "2. Play competitive matches\n" +
        "3. Check back here!",
    });
    return embed;
  }

  const displayCount = Math.min(leaderboard.length, 10);

  let leaderboardText = "";
  for (let i = 0; i < displayCount; i++) {
    const player = leaderboard[i];
    const rankInfo = RANK_MAPPING[player.rankTier] || RANK_MAPPING[0];

    // Medal emoji for top 3
    const positionDisplay = getPositionEmoji(i + 1);

    leaderboardText += `${positionDisplay} **${player.valorantName}**\n`;
    leaderboardText += `┗ ${rankInfo.name} • K/D/A: \`${formatKDA(player.stats)}\` (${player.stats.avgKDA.toFixed(2)})\n`;
    leaderboardText += `   Win: \`${player.stats.winRate.toFixed(1)}%\` • ACS: \`${Math.round(player.stats.avgACS)}\` • **Score: ${player.score.toFixed(1)}**\n\n`;
  }

  embed.addFields({
    name: `📊 Top ${displayCount} Players`,
    value: leaderboardText || "No data available",
  });

  embed.setFooter({
    text: leaderboard.length > 10
      ? `Showing top 10 of ${leaderboard.length} players • Data cached for 10 minutes`
      : `${leaderboard.length} registered players • Data cached for 10 minutes`,
  });

  return embed;
}

// ===============================================
// MAIN HANDLER EXPORT
// ===============================================

module.exports = (client) => {
  console.log("🏆 Valorant Leaderboard Handler initialized");

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const command = message.content.toLowerCase().trim();

    // !valtop command - ULTIMATE TIER REQUIRED
    if (command === "!valtop" || command === "!valleaderboard" || command === "!valtopstats") {
      // Check subscription tier
      const subCheck = await checkSubscription(
        message.guild.id,
        TIERS.ULTIMATE,
        message.guild.ownerId
      );
      if (!subCheck.hasAccess) {
        const upgradeEmbed = createUpgradeEmbed(
          "Valorant Leaderboard",
          TIERS.ULTIMATE,
          subCheck.guildTier
        );
        return message.channel.send({ embeds: [upgradeEmbed] });
      }

      // Send loading message
      const loadingMsg = await message.channel.send(
        "🔄 Building leaderboard... This may take a moment."
      );

      try {
        // Build the leaderboard
        const leaderboard = await buildLeaderboard(message.guild.id, client);

        if (leaderboard.length === 0) {
          await loadingMsg.edit(
            "❌ No registered players with competitive match data found.\nUse `!valstats` to register your Valorant account!"
          );
          return;
        }

        // Try to create canvas image
        try {
          const canvasBuffer = await createLeaderboardCanvas(
            leaderboard,
            message.guild
          );
          const attachment = new AttachmentBuilder(canvasBuffer, {
            name: "leaderboard.png",
          });

          const embed = new EmbedBuilder()
            .setColor(0xff4654) // Valorant red
            .setImage("attachment://leaderboard.png")
            .setFooter({
              text: `${leaderboard.length} registered players • Match stats cached for 10 minutes`,
            })
            .setTimestamp();

          await loadingMsg.delete().catch(() => {});
          await message.channel.send({ embeds: [embed], files: [attachment] });
        } catch (canvasError) {
          console.error(
            "[Valorant Leaderboard] Canvas error, using text fallback:",
            canvasError.message
          );
          // Fallback to text embed
          const embed = createLeaderboardEmbed(leaderboard, message.guild);
          await loadingMsg.delete().catch(() => {});
          await message.channel.send({ embeds: [embed] });
        }
      } catch (error) {
        console.error("[Valorant Leaderboard] Error:", error);
        await loadingMsg.edit(
          "❌ An error occurred while building the leaderboard. Please try again later."
        );
      }
    }
  });
};
