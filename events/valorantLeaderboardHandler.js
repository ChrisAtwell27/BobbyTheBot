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
const { RANK_MAPPING } = require("../valorantApi/rankUtils");

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
// ===============================================

// Cache for leaderboard data (5 minute TTL)
const leaderboardCache = new LimitedMap(50);
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Canvas dimensions for leaderboard
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const HEADER_HEIGHT = 80;
const ROW_HEIGHT = 45;
const PADDING = 20;

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
 * Create leaderboard canvas image
 * @param {Array} leaderboard - Sorted leaderboard data
 * @param {Object} guild - Discord guild object
 * @returns {Promise<Buffer>} - Canvas buffer
 */
async function createLeaderboardCanvas(leaderboard, guild) {
  const displayCount = Math.min(leaderboard.length, 10);
  const canvasHeight = HEADER_HEIGHT + displayCount * ROW_HEIGHT + PADDING * 2;

  const canvas = createCanvas(CANVAS_WIDTH, canvasHeight);
  const ctx = canvas.getContext("2d");

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  gradient.addColorStop(0, "#1a1a2e");
  gradient.addColorStop(1, "#16213e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight);

  // Header
  ctx.fillStyle = "#ff4655";
  ctx.fillRect(0, 0, CANVAS_WIDTH, HEADER_HEIGHT);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`${guild.name} - Valorant Leaderboard`, CANVAS_WIDTH / 2, 35);

  ctx.font = "16px Arial";
  ctx.fillStyle = "#cccccc";
  ctx.fillText("Based on last 30 competitive matches", CANVAS_WIDTH / 2, 60);

  // Column headers
  const startY = HEADER_HEIGHT + 15;
  ctx.font = "bold 14px Arial";
  ctx.fillStyle = "#ff4655";
  ctx.textAlign = "left";
  ctx.fillText("RANK", PADDING, startY);
  ctx.fillText("PLAYER", 80, startY);
  ctx.fillText("COMP RANK", 280, startY);
  ctx.fillText("K/D/A", 400, startY);
  ctx.fillText("WIN%", 520, startY);
  ctx.fillText("ACS", 600, startY);
  ctx.fillText("SCORE", 680, startY);

  // Draw separator line
  ctx.strokeStyle = "#ff4655";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PADDING, startY + 10);
  ctx.lineTo(CANVAS_WIDTH - PADDING, startY + 10);
  ctx.stroke();

  // Draw rows
  for (let i = 0; i < displayCount; i++) {
    const player = leaderboard[i];
    const rowY = startY + 35 + i * ROW_HEIGHT;

    // Alternating row backgrounds
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      ctx.fillRect(PADDING, rowY - 15, CANVAS_WIDTH - PADDING * 2, ROW_HEIGHT);
    }

    // Position highlight for top 3
    if (i < 3) {
      ctx.fillStyle = i === 0 ? "#ffd700" : i === 1 ? "#c0c0c0" : "#cd7f32";
    } else {
      ctx.fillStyle = "#ffffff";
    }

    ctx.font = "bold 16px Arial";
    ctx.textAlign = "left";
    ctx.fillText(getPositionEmoji(i + 1), PADDING, rowY);

    // Player name
    ctx.fillStyle = "#ffffff";
    ctx.font = "14px Arial";
    const displayName =
      player.valorantName.length > 15
        ? player.valorantName.substring(0, 15) + "..."
        : player.valorantName;
    ctx.fillText(displayName, 80, rowY);

    // Comp rank (display only, not in score calculation)
    const rankInfo = RANK_MAPPING[player.rankTier] || RANK_MAPPING[0];
    ctx.fillStyle = rankInfo.color;
    ctx.fillText(rankInfo.name, 280, rowY);

    // KDA
    ctx.fillStyle = "#ffffff";
    ctx.fillText(formatKDA(player.stats), 400, rowY);

    // Win rate
    const winColor =
      player.stats.winRate >= 50
        ? "#4ade80"
        : player.stats.winRate >= 40
          ? "#fbbf24"
          : "#f87171";
    ctx.fillStyle = winColor;
    ctx.fillText(`${player.stats.winRate.toFixed(1)}%`, 520, rowY);

    // ACS
    ctx.fillStyle = "#ffffff";
    ctx.fillText(Math.round(player.stats.avgACS).toString(), 600, rowY);

    // Performance score
    ctx.fillStyle = "#ff4655";
    ctx.font = "bold 16px Arial";
    ctx.fillText(player.score.toFixed(1), 680, rowY);
  }

  // Footer
  ctx.fillStyle = "#666666";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  ctx.fillText(
    "Score = (KDA × 35%) + (Win Rate × 30%) + (ACS × 25%) + (Matches × 10%)",
    CANVAS_WIDTH / 2,
    canvasHeight - 10
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
    .setColor(0xff4655)
    .setTitle(`🏆 ${guild.name} - Valorant Leaderboard`)
    .setDescription(
      "Rankings based on last 30 competitive matches\n*Score = (KDA × 35%) + (Win Rate × 30%) + (ACS × 25%) + (Matches × 10%)*"
    )
    .setTimestamp();

  if (leaderboard.length === 0) {
    embed.addFields({
      name: "No Players",
      value:
        "No registered players with competitive match data found.\nUse `!valstats` to register your Valorant account!",
    });
    return embed;
  }

  const displayCount = Math.min(leaderboard.length, 10);

  let leaderboardText = "";
  for (let i = 0; i < displayCount; i++) {
    const player = leaderboard[i];
    const rankInfo = RANK_MAPPING[player.rankTier] || RANK_MAPPING[0];

    leaderboardText += `${getPositionEmoji(i + 1)} **${player.valorantName}**\n`;
    leaderboardText += `   ${rankInfo.name} | K/D/A: ${formatKDA(player.stats)} | `;
    leaderboardText += `Win: ${player.stats.winRate.toFixed(1)}% | ACS: ${Math.round(player.stats.avgACS)} | `;
    leaderboardText += `**Score: ${player.score.toFixed(1)}**\n\n`;
  }

  embed.addFields({
    name: `Top ${displayCount} Players`,
    value: leaderboardText || "No data available",
  });

  if (leaderboard.length > 10) {
    embed.setFooter({
      text: `Showing top 10 of ${leaderboard.length} registered players`,
    });
  }

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
            .setColor(0xff4655)
            .setTitle(`🏆 ${message.guild.name} - Valorant Leaderboard`)
            .setDescription(
              `Showing top ${Math.min(leaderboard.length, 10)} of ${leaderboard.length} registered players\n` +
                `*Rankings based on last 30 competitive matches*`
            )
            .setImage("attachment://leaderboard.png")
            .setFooter({
              text: "Use !valstats to register • Data refreshes every 5 minutes",
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
