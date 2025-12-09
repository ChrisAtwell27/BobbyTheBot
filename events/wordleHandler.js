const { getConvexClient } = require("../database/convexClient");
const { api } = require("../convex/_generated/api");
const { updateBalance } = require("../database/helpers/convexEconomyHelpers");
const { topEggRoleId } = require("../data/config");
const { getSetting } = require("../utils/settingsManager");
// TARGET_GUILD_ID removed
// WORDLE_CHANNEL_ID removed (dynamic)

// Honey rewards based on score
const HONEY_REWARDS = {
  1: 10000,
  2: 5000,
  3: 2500,
  4: 1000,
  5: 500,
  6: 100,
  7: 0, // Failed wordle (X/6)
};

// Add a score for a user and award honey
// skipHoney: if true, don't award honey (for backfill operations)
async function addScore(
  guildId,
  userId,
  score,
  timestamp = null,
  skipHoney = false
) {
  try {
    const client = getConvexClient();
    if (!client)
      return { success: false, error: "Convex client not initialized" };

    const honeyAwarded = skipHoney ? 0 : HONEY_REWARDS[score] || 0;

    // Add score using Convex mutation
    await client.mutation(api.wordle.addScore, {
      guildId: guildId,
      userId,
      score,
      honeyAwarded,
      timestamp: timestamp || Date.now(),
    });

    // Award honey to user's balance (only if not skipping)
    if (!skipHoney && honeyAwarded > 0) {
      await updateBalance(guildId, userId, honeyAwarded);
    }

    return { success: true, honeyAwarded };
  } catch (error) {
    console.error("Error adding Wordle score:", error);
    return { success: false, error };
  }
}

// Helper: trim leading/trailing punctuation or quotes from a token
function cleanToken(token) {
  if (!token) return token;
  // Remove leading/trailing characters that are not letters, numbers, or common name punctuation
  return token.replace(/^[^A-Za-z0-9!._'\-]+|[^A-Za-z0-9!._'\-]+$/g, "");
}

// Helper: normalize a name for fuzzy matching (lowercase and strip spaces and most punctuation except ! . _ ' -)
function normalizeName(name) {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9!._'\-]/g, "");
}

// Parse Wordle bot message and extract scores
function parseWordleMessage(content) {
  const results = [];

  // Match lines like "👑 3/6: @user1 @user2" or "4/6: @user1"
  const lines = content.split("\n");

  for (const line of lines) {
    // Match pattern: optional crown/emoji, score (X/6 or X), colon, then mentions
    const match = line.match(/(?:[^\d\s]*\s*)?(\d+)(?:\/6)?:\s*(.+)/);
    if (match) {
      const score = parseInt(match[1]);
      const usersPart = match[2];

      // Extract real Discord mentions like <@123> or <@!123>
      const idMatches = [...usersPart.matchAll(/<@!?([0-9]+)>/g)];
      if (idMatches.length) {
        idMatches.forEach((m) => results.push({ score, userId: m[1] }));
      }

      // Extract all plain-text @mentions (tokens starting with @ until whitespace or '<')
      const rawMentions = usersPart.match(/@[^\s@<]+/g);
      if (rawMentions) {
        rawMentions.forEach((raw) => {
          // Remove leading @ and clean trailing punctuation like quotes, commas, etc.
          const cleaned = cleanToken(raw.slice(1));
          if (cleaned) {
            results.push({
              score,
              mention: cleaned,
              mentionNorm: normalizeName(cleaned),
            });
          }
        });
      }
    }
  }

  return results;
}

// Get the current month in YYYY-MM format
function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  return `${year}-${month}`;
}

// Get the start and end dates for a specific month (YYYY-MM format)
function getMonthBounds(monthStr = null) {
  const now = new Date();
  let year, month;

  if (monthStr) {
    const parts = monthStr.split("-");
    year = parseInt(parts[0]);
    month = parseInt(parts[1]) - 1; // JavaScript months are 0-indexed
  } else {
    year = now.getFullYear();
    month = now.getMonth();
  }

  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

  return { start, end };
}

// Force end the current month and declare winner
async function forceEndCurrentMonth(channel) {
  try {
    const client = getConvexClient();
    if (!client)
      return { success: false, message: "Convex client not initialized" };

    const currentMonthStr = getCurrentMonth();

    // Check if we've already announced this month's winner
    const existingWinner = await client.query(api.wordle.getMonthlyWinner, {
      guildId: channel.guild.id,
      month: currentMonthStr,
    });

    if (existingWinner && existingWinner.announcedAt) {
      return {
        success: false,
        message: "Current month has already been force-ended.",
      };
    }

    // Calculate stats for current month
    const monthBounds = getMonthBounds(currentMonthStr);
    const stats = await calculateStats(channel.guild.id, monthBounds);

    if (Object.keys(stats).length === 0) {
      return {
        success: false,
        message: "No games played in the current month yet.",
      };
    }

    // Sort users by weighted score (lower is better)
    const sortedUsers = Object.entries(stats).sort(
      (a, b) => a[1].weightedScore - b[1].weightedScore
    );
    const [winnerId, winnerStats] = sortedUsers[0];

    // Get winner's username
    const guild = channel.guild;
    await guild.members.fetch();
    const winnerMember = guild.members.cache.get(winnerId);
    const winnerUsername = winnerMember
      ? winnerMember.user.username
      : `Unknown User (${winnerId})`;

    // Prepare top ten data
    const topTen = sortedUsers.slice(0, 10).map((entry, index) => {
      const [userId, userStats] = entry;
      const member = guild.members.cache.get(userId);
      return {
        userId,
        username: member ? member.user.username : `Unknown User (${userId})`,
        totalGames: userStats.totalGames,
        avgScore: userStats.avgScore,
        bestScore: userStats.bestScore,
        weightedScore: userStats.weightedScore,
        totalHoney: userStats.totalHoney || 0,
        position: index + 1,
      };
    });

    // Save monthly winner
    await client.mutation(api.wordle.saveMonthlyWinner, {
      guildId: channel.guild.id,
      month: currentMonthStr,
      winner: {
        userId: winnerId,
        username: winnerUsername,
        stats: {
          totalGames: winnerStats.totalGames,
          avgScore: winnerStats.avgScore,
          bestScore: winnerStats.bestScore,
          weightedScore: winnerStats.weightedScore,
          totalHoney: winnerStats.totalHoney || 0,
        },
      },
      topTen,
      totalPlayers: Object.keys(stats).length,
      totalGamesPlayed: Object.values(stats).reduce(
        (sum, s) => sum + s.totalGames,
        0
      ),
    });

    // Create announcement embed
    const { EmbedBuilder } = require("discord.js");
    const monthName = new Date(currentMonthStr + "-01").toLocaleDateString(
      "en-US",
      { month: "long", year: "numeric" }
    );

    const embed = new EmbedBuilder()
      .setTitle(`⚡ MONTH FORCE-ENDED: ${monthName} Wordle Champion!`)
      .setColor("#FF6B6B")
      .setDescription(
        `## Congratulations <@${winnerId}>! 👑\n\nThe **${monthName} Wordle Competition** has been manually ended early.\nYou are declared the winner!`
      )
      .addFields(
        {
          name: "📊 Champion Stats",
          value: `Average: **${winnerStats.avgScore.toFixed(2)}**\nGames Played: **${winnerStats.totalGames}**\nBest Score: **${winnerStats.bestScore}/6**`,
          inline: true,
        },
        {
          name: "🏅 Competition",
          value: `Total Players: **${Object.keys(stats).length}**\nTotal Games: **${Object.values(stats).reduce((sum, s) => sum + s.totalGames, 0)}**`,
          inline: true,
        },
        {
          name: "⚠️ Notice",
          value:
            "This month was ended early by an administrator. Scores have been reset for a fresh start!",
          inline: false,
        }
      )
      .setFooter({ text: `A new monthly competition has begun!` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Send top 10 summary
    let summaryText = `**${monthName} Final Rankings (Force-Ended):**\n\n`;
    topTen.forEach((player, index) => {
      const medal =
        index === 0
          ? "🥇"
          : index === 1
            ? "🥈"
            : index === 2
              ? "🥉"
              : `${index + 1}.`;
      summaryText += `${medal} **${player.username}** - Avg: ${player.avgScore.toFixed(2)}, Games: ${player.totalGames}\n`;
    });

    const summaryEmbed = new EmbedBuilder()
      .setTitle("📋 Final Monthly Leaderboard (Force-Ended)")
      .setColor("#FF6B6B")
      .setDescription(summaryText)
      .setTimestamp();

    await channel.send({ embeds: [summaryEmbed] });

    return { success: true, winner: winnerUsername };
  } catch (error) {
    console.error("Error force ending month:", error);
    return {
      success: false,
      message: "An error occurred while force ending the month.",
    };
  }
}

// Check if we need to announce a monthly winner
async function checkAndAnnounceMonthlyWinner(channel) {
  try {
    const client = getConvexClient();
    if (!client) return false;

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${(lastMonth.getMonth() + 1).toString().padStart(2, "0")}`;

    // Check if we've already announced this month's winner
    const existingWinner = await client.query(api.wordle.getMonthlyWinner, {
      guildId: channel.guild.id,
      month: lastMonthStr,
    });

    if (existingWinner && existingWinner.announcedAt) {
      return false; // Already announced
    }

    // Calculate stats for last month
    const monthBounds = getMonthBounds(lastMonthStr);
    const stats = await calculateStats(channel.guild.id, monthBounds);

    if (Object.keys(stats).length === 0) {
      return false; // No games played last month
    }

    // Sort users by weighted score (lower is better)
    const sortedUsers = Object.entries(stats).sort(
      (a, b) => a[1].weightedScore - b[1].weightedScore
    );
    const [winnerId, winnerStats] = sortedUsers[0];

    // Get winner's username
    const guild = channel.guild;
    await guild.members.fetch();
    const winnerMember = guild.members.cache.get(winnerId);
    const winnerUsername = winnerMember
      ? winnerMember.user.username
      : `Unknown User (${winnerId})`;

    // Prepare top ten data
    const topTen = sortedUsers.slice(0, 10).map((entry, index) => {
      const [userId, userStats] = entry;
      const member = guild.members.cache.get(userId);
      return {
        userId,
        username: member ? member.user.username : `Unknown User (${userId})`,
        totalGames: userStats.totalGames,
        avgScore: userStats.avgScore,
        bestScore: userStats.bestScore,
        weightedScore: userStats.weightedScore,
        totalHoney: userStats.totalHoney || 0,
        position: index + 1,
      };
    });

    // Save monthly winner
    await client.mutation(api.wordle.saveMonthlyWinner, {
      guildId: channel.guild.id,
      month: lastMonthStr,
      winner: {
        userId: winnerId,
        username: winnerUsername,
        stats: {
          totalGames: winnerStats.totalGames,
          avgScore: winnerStats.avgScore,
          bestScore: winnerStats.bestScore,
          weightedScore: winnerStats.weightedScore,
          totalHoney: winnerStats.totalHoney || 0,
        },
      },
      topTen,
      totalPlayers: Object.keys(stats).length,
      totalGamesPlayed: Object.values(stats).reduce(
        (sum, s) => sum + s.totalGames,
        0
      ),
    });

    // Create announcement embed
    const { EmbedBuilder } = require("discord.js");
    const monthName = new Date(lastMonth).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${monthName} Wordle Champion!`)
      .setColor("#FFD700")
      .setDescription(
        `## Congratulations <@${winnerId}>! 👑\n\nYou are the **${monthName} Wordle Champion** with an incredible performance!`
      )
      .addFields(
        {
          name: "📊 Champion Stats",
          value: `Average: **${winnerStats.avgScore.toFixed(2)}**\nGames Played: **${winnerStats.totalGames}**\nBest Score: **${winnerStats.bestScore}/6**`,
          inline: true,
        },
        {
          name: "🏅 Competition",
          value: `Total Players: **${Object.keys(stats).length}**\nTotal Games: **${Object.values(stats).reduce((sum, s) => sum + s.totalGames, 0)}**`,
          inline: true,
        }
      )
      .setFooter({
        text: `A new monthly competition has begun for ${new Date().toLocaleDateString("en-US", { month: "long" })}!`,
      })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Send top 10 summary
    let summaryText = `**${monthName} Final Rankings:**\n\n`;
    topTen.forEach((player, index) => {
      const medal =
        index === 0
          ? "🥇"
          : index === 1
            ? "🥈"
            : index === 2
              ? "🥉"
              : `${index + 1}.`;
      summaryText += `${medal} **${player.username}** - Avg: ${player.avgScore.toFixed(2)}, Games: ${player.totalGames}\n`;
    });

    const summaryEmbed = new EmbedBuilder()
      .setTitle("📋 Final Monthly Leaderboard")
      .setColor("#6aaa64")
      .setDescription(summaryText)
      .setTimestamp();

    await channel.send({ embeds: [summaryEmbed] });

    return true;
  } catch (error) {
    console.error("Error checking/announcing monthly winner:", error);
    return false;
  }
}

// Calculate statistics for leaderboard
// timeFilter: optional object with { start: Date, end: Date } to filter by time range
async function calculateStats(guildId, timeFilter = null) {
  try {
    const client = getConvexClient();
    if (!client) return {};

    // Get all user Wordle documents for the guild
    const allUserWordles = await client.query(api.wordle.getAllScores, {
      guildId: guildId,
    });
    const result = {};

    // Debug: Log time filter info
    if (timeFilter) {
      console.log(`[WORDLE DEBUG] Time filter: start=${timeFilter.start.toISOString()}, end=${timeFilter.end.toISOString()}`);
      console.log(`[WORDLE DEBUG] Start ms: ${timeFilter.start.getTime()}, End ms: ${timeFilter.end.getTime()}`);
    }

    allUserWordles.forEach((userWordle) => {
      // Filter scores by time range if specified
      let filteredScores = userWordle.scores;
      if (timeFilter) {
        // Debug: Log first few scores for this user
        if (userWordle.scores.length > 0) {
          console.log(`[WORDLE DEBUG] User ${userWordle.userId} has ${userWordle.scores.length} total scores`);
          const sampleScores = userWordle.scores.slice(0, 3);
          sampleScores.forEach((s, i) => {
            const scoreDate = new Date(s.timestamp);
            console.log(`[WORDLE DEBUG]   Score ${i}: timestamp=${s.timestamp}, date=${scoreDate.toISOString()}, inRange=${scoreDate >= timeFilter.start && scoreDate <= timeFilter.end}`);
          });
        }

        filteredScores = userWordle.scores.filter((s) => {
          const scoreDate = new Date(s.timestamp);
          return scoreDate >= timeFilter.start && scoreDate <= timeFilter.end;
        });

        console.log(`[WORDLE DEBUG] User ${userWordle.userId}: ${filteredScores.length}/${userWordle.scores.length} scores in range`);
      }

      if (filteredScores.length > 0) {
        const scoreValues = filteredScores.map((s) => s.score);
        const totalScore = scoreValues.reduce((sum, s) => sum + s, 0);
        const bestScore = Math.min(...scoreValues);
        const avgScore = totalScore / filteredScores.length;

        // Calculate weighted score that HEAVILY favors volume
        // Lower is better. Exponential penalty for low game counts.
        // Formula: avgScore * (50 / games)^0.7
        // This means more games = exponentially better score
        const volumeMultiplier = Math.pow(50 / filteredScores.length, 0.7);
        const weightedScore = avgScore * volumeMultiplier;

        result[userWordle.userId] = {
          totalGames: filteredScores.length,
          totalScore: totalScore,
          bestScore: bestScore,
          avgScore: avgScore,
          weightedScore: weightedScore,
          scores: scoreValues,
          totalHoney: userWordle.totalHoney,
        };
      }
    });

    return result;
  } catch (error) {
    console.error("Error calculating Wordle stats:", error);
    return {};
  }
}

module.exports = (client) => {
  // Listen for messages from the Wordle bot
  client.on("messageCreate", async (message) => {
    // Only run in guilds
    if (!message.guild) return;

    // Check if this is the correct channel
    const wordleChannelId = await getSetting(
      message.guild.id,
      "channels.wordle"
    );
    if (message.channel.id !== wordleChannelId) return;

    // Ignore messages that say "{user} was playing"
    if (message.content.includes("was playing")) return;
    if (message.content.includes("is playing")) return;

    // Check if this is a Wordle results message
    if (
      message.content.includes("Here are yesterday's results:") ||
      message.content.includes("day streak!")
    ) {
      // Ensure member cache is warmed so name lookups don't miss
      try {
        await message.guild.members.fetch();
      } catch (_) {}
      const parsedResults = parseWordleMessage(message.content);

      console.log(`Parsed ${parsedResults.length} results:`, parsedResults);

      // Save scores for each user and track honey rewards
      const honeyRewards = [];
      for (const result of parsedResults) {
        // Prefer direct mention ID when available
        let member = null;
        if (result.userId) {
          member = message.guild.members.cache.get(result.userId) || null;
        }
        if (!member && result.mention) {
          // Try to find user by username or display name (case-insensitive)
          const mentionLower = result.mention.toLowerCase();
          const mentionNorm =
            result.mentionNorm || normalizeName(result.mention);
          member =
            message.guild.members.cache.find((m) => {
              const u = m.user;
              const cand = [u.username, m.displayName, u.globalName].filter(
                Boolean
              );
              return cand.some((name) => {
                const lower = name.toLowerCase();
                if (lower === mentionLower || lower.includes(mentionLower))
                  return true;
                const norm = normalizeName(name);
                return norm === mentionNorm || norm.includes(mentionNorm);
              });
            }) || null;
        }

        if (member) {
          const scoreResult = await addScore(
            message.guild.id,
            member.id,
            result.score
          );
          if (scoreResult.success) {
            console.log(
              `✓ Saved: ${member.user.username} (${member.displayName}) - ${result.score}/6 | +${scoreResult.honeyAwarded} honey`
            );
            if (scoreResult.honeyAwarded > 0) {
              honeyRewards.push({
                member,
                honey: scoreResult.honeyAwarded,
                score: result.score,
              });
            }
          } else {
            console.log(`✗ Error saving score for ${member.user.username}`);
          }
        } else {
          const label = result.userId
            ? `<@${result.userId}>`
            : result.mention
              ? `@${result.mention}`
              : "(unknown)";
          console.log(`✗ Could not find member for: ${label}`);
        }
      }

      // Send honey rewards notification if any were awarded
      if (honeyRewards.length > 0) {
        const { EmbedBuilder } = require("discord.js");
        let rewardsText = "";
        honeyRewards.forEach(({ member, honey, score }) => {
          rewardsText += `<@${member.id}>: **${score}/6** → **+${honey.toLocaleString()} 🍯**\n`;
        });

        const honeyEmbed = new EmbedBuilder()
          .setTitle("🍯 Wordle Honey Rewards")
          .setColor("#FFA500")
          .setDescription(rewardsText.trim())
          .setFooter({ text: "Lower scores = more honey!" })
          .setTimestamp();

        await message.channel.send({ embeds: [honeyEmbed] });
      }

      // Check if we need to announce monthly winner (first of the month)
      const now = new Date();
      if (now.getDate() === 1) {
        await checkAndAnnounceMonthlyWinner(message.channel);
      }

      // After processing scores, send the MONTHLY leaderboard
      const currentMonthBounds = getMonthBounds();
      const monthlyStats = await calculateStats(
        message.guild.id,
        currentMonthBounds
      );

      if (Object.keys(monthlyStats).length > 0) {
        // Sort users by weighted score (lower is better)
        const sortedUsers = Object.entries(monthlyStats).sort(
          (a, b) => a[1].weightedScore - b[1].weightedScore
        );

        const { EmbedBuilder } = require("discord.js");

        // Build the leaderboard description with proper formatting
        let leaderboardText = "";
        const topTen = sortedUsers.slice(0, 10);

        for (let i = 0; i < topTen.length; i++) {
          const [userId, userStats] = topTen[i];
          const member = message.guild.members.cache.get(userId);
          const username = member
            ? member.user.username
            : `Unknown User (${userId})`;

          let medal;
          if (i === 0) medal = "🥇";
          else if (i === 1) medal = "🥈";
          else if (i === 2) medal = "🥉";
          else medal = `**${i + 1}.**`;

          leaderboardText += `${medal} **${username}**\n`;
          leaderboardText += `└ Avg: **${userStats.avgScore.toFixed(2)}** | Games: **${userStats.totalGames}** | Best: **${userStats.bestScore}/6**\n\n`;
        }

        const currentMonth = new Date().toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        });

        const embed = new EmbedBuilder()
          .setTitle(`🟩 ${currentMonth} Wordle Competition`)
          .setColor("#6aaa64")
          .setDescription(leaderboardText.trim())
          .addFields(
            {
              name: "📊 Monthly Players",
              value: `${Object.keys(monthlyStats).length}`,
              inline: true,
            },
            {
              name: "🎮 Monthly Games",
              value: `${Object.values(monthlyStats).reduce((sum, s) => sum + s.totalGames, 0)}`,
              inline: true,
            },
            {
              name: "⭐ Best Score",
              value: `${Math.min(...Object.values(monthlyStats).map((s) => s.bestScore))}/6`,
              inline: true,
            }
          )
          .setFooter({
            text: `Monthly competition resets on the 1st! Use !wordletop for all-time stats.`,
          })
          .setTimestamp();

        await message.channel.send({ embeds: [embed] });
      }
    }

    // Handle !wordletop command
    if (message.content.toLowerCase() === "!wordletop") {
      const stats = await calculateStats(message.guild.id);

      if (Object.keys(stats).length === 0) {
        return await message.channel.send("No Wordle scores recorded yet!");
      }

      // Sort users by weighted score (lower is better)
      const sortedUsers = Object.entries(stats).sort(
        (a, b) => a[1].weightedScore - b[1].weightedScore
      );

      const { EmbedBuilder } = require("discord.js");

      // Fetch guild members to ensure we have usernames
      try {
        await message.guild.members.fetch();
      } catch (error) {
        console.error("Error fetching guild members:", error);
      }

      // Build the leaderboard description with proper formatting
      let leaderboardText = "";
      const topTen = sortedUsers.slice(0, 10);

      for (let i = 0; i < topTen.length; i++) {
        const [userId, userStats] = topTen[i];
        const member = message.guild.members.cache.get(userId);
        const username = member
          ? member.user.username
          : `Unknown User (${userId})`;

        let medal;
        if (i === 0) medal = "🥇";
        else if (i === 1) medal = "🥈";
        else if (i === 2) medal = "🥉";
        else medal = `**${i + 1}.**`;

        leaderboardText += `${medal} **${username}**\n`;
        leaderboardText += `└ Avg: **${userStats.avgScore.toFixed(2)}** | Games: **${userStats.totalGames}** | Best: **${userStats.bestScore}/6**\n\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle("🟩 Wordle Leaderboard - Top Word Masters")
        .setColor("#6aaa64")
        .setDescription(leaderboardText.trim())
        .addFields(
          {
            name: "📊 Total Players",
            value: `${Object.keys(stats).length}`,
            inline: true,
          },
          {
            name: "🎮 Total Games Played",
            value: `${Object.values(stats).reduce((sum, s) => sum + s.totalGames, 0)}`,
            inline: true,
          },
          {
            name: "⭐ Best Score",
            value: `${Math.min(...Object.values(stats).map((s) => s.bestScore))}/6`,
            inline: true,
          }
        )
        .setFooter({
          text: "Rankings favor consistency and volume. Play more to climb! 🟩",
        })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
    }

    // Handle !wordleweekly command
    if (message.content.toLowerCase() === "!wordleweekly") {
      const now = new Date();
      const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const timeFilter = { start: oneWeekAgo, end: now };
      const stats = await calculateStats(message.guild.id, timeFilter);

      if (Object.keys(stats).length === 0) {
        return await message.channel.send(
          "No Wordle scores recorded in the past week!"
        );
      }

      // Sort users by weighted score (lower is better)
      const sortedUsers = Object.entries(stats).sort(
        (a, b) => a[1].weightedScore - b[1].weightedScore
      );

      const { EmbedBuilder } = require("discord.js");

      // Fetch guild members to ensure we have usernames
      try {
        await message.guild.members.fetch();
      } catch (error) {
        console.error("Error fetching guild members:", error);
      }

      // Build the leaderboard description with proper formatting
      let leaderboardText = "";
      const topTen = sortedUsers.slice(0, 10);

      for (let i = 0; i < topTen.length; i++) {
        const [userId, userStats] = topTen[i];
        const member = message.guild.members.cache.get(userId);
        const username = member
          ? member.user.username
          : `Unknown User (${userId})`;

        let medal;
        if (i === 0) medal = "🥇";
        else if (i === 1) medal = "🥈";
        else if (i === 2) medal = "🥉";
        else medal = `**${i + 1}.**`;

        leaderboardText += `${medal} **${username}**\n`;
        leaderboardText += `└ Avg: **${userStats.avgScore.toFixed(2)}** | Games: **${userStats.totalGames}** | Best: **${userStats.bestScore}/6**\n\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle("📅 Weekly Wordle Leaderboard - Past 7 Days")
        .setColor("#6aaa64")
        .setDescription(leaderboardText.trim())
        .addFields(
          {
            name: "📊 Active Players",
            value: `${Object.keys(stats).length}`,
            inline: true,
          },
          {
            name: "🎮 Games This Week",
            value: `${Object.values(stats).reduce((sum, s) => sum + s.totalGames, 0)}`,
            inline: true,
          },
          {
            name: "⭐ Best Score",
            value: `${Math.min(...Object.values(stats).map((s) => s.bestScore))}/6`,
            inline: true,
          }
        )
        .setFooter({
          text: "Rankings favor consistency and volume. Play more to climb! 🟩",
        })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
    }

    // Handle !wordlemonthly command
    if (message.content.toLowerCase() === "!wordlemonthly") {
      const now = new Date();
      const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const timeFilter = { start: oneMonthAgo, end: now };
      const stats = await calculateStats(message.guild.id, timeFilter);

      if (Object.keys(stats).length === 0) {
        return await message.channel.send(
          "No Wordle scores recorded in the past month!"
        );
      }

      // Sort users by weighted score (lower is better)
      const sortedUsers = Object.entries(stats).sort(
        (a, b) => a[1].weightedScore - b[1].weightedScore
      );

      const { EmbedBuilder } = require("discord.js");

      // Fetch guild members to ensure we have usernames
      try {
        await message.guild.members.fetch();
      } catch (error) {
        console.error("Error fetching guild members:", error);
      }

      // Build the leaderboard description with proper formatting
      let leaderboardText = "";
      const topTen = sortedUsers.slice(0, 10);

      for (let i = 0; i < topTen.length; i++) {
        const [userId, userStats] = topTen[i];
        const member = message.guild.members.cache.get(userId);
        const username = member
          ? member.user.username
          : `Unknown User (${userId})`;

        let medal;
        if (i === 0) medal = "🥇";
        else if (i === 1) medal = "🥈";
        else if (i === 2) medal = "🥉";
        else medal = `**${i + 1}.**`;

        leaderboardText += `${medal} **${username}**\n`;
        leaderboardText += `└ Avg: **${userStats.avgScore.toFixed(2)}** | Games: **${userStats.totalGames}** | Best: **${userStats.bestScore}/6**\n\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle("📅 Monthly Wordle Leaderboard - Past 30 Days")
        .setColor("#6aaa64")
        .setDescription(leaderboardText.trim())
        .addFields(
          {
            name: "📊 Active Players",
            value: `${Object.keys(stats).length}`,
            inline: true,
          },
          {
            name: "🎮 Games This Month",
            value: `${Object.values(stats).reduce((sum, s) => sum + s.totalGames, 0)}`,
            inline: true,
          },
          {
            name: "⭐ Best Score",
            value: `${Math.min(...Object.values(stats).map((s) => s.bestScore))}/6`,
            inline: true,
          }
        )
        .setFooter({
          text: "Rankings favor consistency and volume. Play more to climb! 🟩",
        })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
    }

    // Handle !wordlebackfill command
    if (message.content.toLowerCase() === "!wordlebackfill") {
      await message.channel.send(
        "Starting backfill of historical Wordle scores..."
      );

      try {
        let totalMessages = 0;
        let totalScores = 0;
        let lastMessageId;

        const MAX_MESSAGES_TO_FETCH = 2000; // Safety limit to prevent infinite loops
        const FETCH_TIMEOUT = 30000; // 30 second timeout
        let messagesFetched = 0;
        const startTime = Date.now();

        console.log("[WORDLE] Starting backfill operation...");

        // Warm member cache for better matching during backfill
        try {
          await message.guild.members.fetch();
        } catch (_) {}

        // Fetch messages in batches
        while (true) {
          // Safety check: prevent infinite loops
          if (messagesFetched >= MAX_MESSAGES_TO_FETCH) {
            console.warn(
              `[WORDLE] Reached maximum fetch limit of ${MAX_MESSAGES_TO_FETCH} messages. Stopping backfill.`
            );
            break;
          }

          // Safety check: timeout protection
          if (Date.now() - startTime > FETCH_TIMEOUT) {
            console.warn(
              `[WORDLE] Backfill timeout after ${FETCH_TIMEOUT}ms. Stopping backfill.`
            );
            break;
          }

          const options = { limit: 100 };
          if (lastMessageId) {
            options.before = lastMessageId;
          }

          console.log(
            `[WORDLE] Fetching batch ${Math.floor(messagesFetched / 100) + 1} (${messagesFetched} messages processed so far)...`
          );
          const messages = await message.channel.messages.fetch(options);

          if (messages.size === 0) {
            console.log(
              "[WORDLE] No more messages to fetch. Backfill complete."
            );
            break;
          }

          messagesFetched += messages.size;

          for (const [, msg] of messages) {
            if (
              msg.content.includes("Here are yesterday's results:") ||
              msg.content.includes("day streak!")
            ) {
              totalMessages++;
              const parsedResults = parseWordleMessage(msg.content);

              for (const result of parsedResults) {
                let member = null;
                if (result.userId) {
                  member =
                    message.guild.members.cache.get(result.userId) || null;
                }
                if (!member && result.mention) {
                  const mentionLower = result.mention.toLowerCase();
                  const mentionNorm =
                    result.mentionNorm || normalizeName(result.mention);
                  member =
                    message.guild.members.cache.find((m) => {
                      const u = m.user;
                      const cand = [
                        u.username,
                        m.displayName,
                        u.globalName,
                      ].filter(Boolean);
                      return cand.some((name) => {
                        const lower = name.toLowerCase();
                        if (
                          lower === mentionLower ||
                          lower.includes(mentionLower)
                        )
                          return true;
                        const norm = normalizeName(name);
                        return (
                          norm === mentionNorm || norm.includes(mentionNorm)
                        );
                      });
                    }) || null;
                }

                if (member) {
                  // Add score but SKIP honey award (backfill only)
                  // Use message timestamp for the score
                  const scoreResult = await addScore(
                    message.guild.id,
                    member.id,
                    result.score,
                    msg.createdTimestamp,
                    true
                  );
                  if (scoreResult.success) {
                    totalScores++;
                  }
                }
              }
            }
            lastMessageId = msg.id;
          }
        }

        await message.channel.send(
          `Backfill complete! Processed ${messagesFetched} messages. Found ${totalMessages} result messages and saved ${totalScores} scores.`
        );
        console.log(`[WORDLE] Backfill complete. Saved ${totalScores} scores.`);
      } catch (error) {
        console.error("Error during backfill:", error);
        await message.channel.send("An error occurred during backfill.");
      }
    }
  });

  console.log("[WORDLE] Wordle handler initialized with Convex.");
};
