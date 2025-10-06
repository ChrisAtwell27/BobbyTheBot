const fs = require('fs');
const path = require('path');

const wordleScoresFilePath = path.join(__dirname, '../data/wordle_scores.txt');
const WORDLE_CHANNEL_ID = '1382796270036586608';

// Ensure the wordle scores file exists
if (!fs.existsSync(wordleScoresFilePath)) {
    fs.writeFileSync(wordleScoresFilePath, '', 'utf8');
}

// Load user data from file (format: userId|score1:timestamp1|score2:timestamp2...)
// For backward compatibility, also supports old format: userId|score1|score2|score3...
function loadUserData() {
    const data = fs.readFileSync(wordleScoresFilePath, 'utf8');
    const userData = {};

    data.split('\n').forEach(line => {
        if (line.trim()) {
            const parts = line.split('|');
            const userId = parts[0];
            const scores = parts.slice(1).map(s => {
                if (s.includes(':')) {
                    const [score, timestamp] = s.split(':');
                    return { score: parseInt(score), timestamp: parseInt(timestamp) };
                } else {
                    // Legacy format - no timestamp
                    return { score: parseInt(s), timestamp: null };
                }
            });
            userData[userId] = scores;
        }
    });

    return userData;
}

// Save all user data to file
function saveUserData(userData) {
    let content = '';

    Object.entries(userData).forEach(([userId, scores]) => {
        const scoreStrs = scores.map(s => {
            if (typeof s === 'object' && s.timestamp !== null) {
                return `${s.score}:${s.timestamp}`;
            } else if (typeof s === 'object') {
                return `${s.score}`;
            } else {
                return `${s}`;
            }
        });
        let line = userId + '|' + scoreStrs.join('|');
        content += line + '\n';
    });

    fs.writeFileSync(wordleScoresFilePath, content, 'utf8');
}

// Add a score for a user
function addScore(userId, score, timestamp = null) {
    const userData = loadUserData();

    if (!userData[userId]) {
        userData[userId] = [];
    }

    const scoreEntry = {
        score: score,
        timestamp: timestamp || Date.now()
    };
    userData[userId].push(scoreEntry);
    saveUserData(userData);
}



// Helper: trim leading/trailing punctuation or quotes from a token
function cleanToken(token) {
    if (!token) return token;
    // Remove leading/trailing characters that are not letters, numbers, or common name punctuation
    return token.replace(/^[^A-Za-z0-9!._'\-]+|[^A-Za-z0-9!._'\-]+$/g, '');
}

// Helper: normalize a name for fuzzy matching (lowercase and strip spaces and most punctuation except ! . _ ' -)
function normalizeName(name) {
    if (!name) return '';
    return name
        .toLowerCase()
        .normalize('NFKC')
        .replace(/\s+/g, '')
        .replace(/[^A-Za-z0-9!._'\-]/g, '');
}

// Parse Wordle bot message and extract scores
function parseWordleMessage(content) {
    const results = [];

    // Match lines like "👑 3/6: @user1 @user2" or "4/6: @user1"
    const lines = content.split('\n');

    for (const line of lines) {
        // Match pattern: optional crown/emoji, score (X/6 or X), colon, then mentions
        const match = line.match(/(?:[^\d\s]*\s*)?(\d+)(?:\/6)?:\s*(.+)/);
        if (match) {
            const score = parseInt(match[1]);
            const usersPart = match[2];

            // Extract real Discord mentions like <@123> or <@!123>
            const idMatches = [...usersPart.matchAll(/<@!?([0-9]+)>/g)];
            if (idMatches.length) {
                idMatches.forEach(m => results.push({ score, userId: m[1] }));
            }

            // Extract all plain-text @mentions (tokens starting with @ until whitespace or '<')
            const rawMentions = usersPart.match(/@[^\s@<]+/g);
            if (rawMentions) {
                rawMentions.forEach(raw => {
                    // Remove leading @ and clean trailing punctuation like quotes, commas, etc.
                    const cleaned = cleanToken(raw.slice(1));
                    if (cleaned) {
                        results.push({ score, mention: cleaned, mentionNorm: normalizeName(cleaned) });
                    }
                });
            }
        }
    }

    return results;
}

// Calculate statistics for leaderboard
// timeFilter: optional object with { start: timestamp, end: timestamp } to filter by time range
function calculateStats(timeFilter = null) {
    const userData = loadUserData();
    const userStats = {};

    Object.entries(userData).forEach(([userId, scores]) => {
        // Filter scores by time range if specified
        let filteredScores = scores;
        if (timeFilter) {
            filteredScores = scores.filter(s => {
                if (!s.timestamp) return false; // Exclude scores without timestamps
                return s.timestamp >= timeFilter.start && s.timestamp <= timeFilter.end;
            });
        }

        if (filteredScores.length > 0) {
            const scoreValues = filteredScores.map(s => typeof s === 'object' ? s.score : s);
            const totalScore = scoreValues.reduce((sum, s) => sum + s, 0);
            const bestScore = Math.min(...scoreValues);
            const avgScore = totalScore / scoreValues.length;

            // Calculate weighted score that HEAVILY favors volume
            // Lower is better. Exponential penalty for low game counts.
            // Formula: avgScore * (50 / games)^0.7
            // This means more games = exponentially better score
            const volumeMultiplier = Math.pow(50 / filteredScores.length, 0.7);
            const weightedScore = avgScore * volumeMultiplier;

            userStats[userId] = {
                totalGames: filteredScores.length,
                totalScore: totalScore,
                bestScore: bestScore,
                avgScore: avgScore,
                weightedScore: weightedScore,
                scores: filteredScores
            };
        }
    });

    return userStats;
}

module.exports = (client) => {
    // Listen for messages from the Wordle bot
    client.on('messageCreate', async (message) => {
        // Only process messages in the Wordle channel
        if (message.channel.id !== WORDLE_CHANNEL_ID) return;

        // Ignore messages that say "{user} was playing"
        if (message.content.includes('was playing')) return;
        if (message.content.includes('is playing')) return;

        // Check if this is a Wordle results message
        if (message.content.includes('Here are yesterday\'s results:') ||
            message.content.includes('day streak!')) {

            // Ensure member cache is warmed so name lookups don't miss
            try { await message.guild.members.fetch(); } catch (_) {}
            const parsedResults = parseWordleMessage(message.content);

            console.log(`Parsed ${parsedResults.length} results:`, parsedResults);

            // Save scores for each user
            for (const result of parsedResults) {
                // Prefer direct mention ID when available
                let member = null;
                if (result.userId) {
                    member = message.guild.members.cache.get(result.userId) || null;
                }
                if (!member && result.mention) {
                    // Try to find user by username or display name (case-insensitive)
                    const mentionLower = result.mention.toLowerCase();
                    const mentionNorm = result.mentionNorm || normalizeName(result.mention);
                    member = message.guild.members.cache.find(m => {
                        const u = m.user;
                        const cand = [u.username, m.displayName, u.globalName].filter(Boolean);
                        return cand.some(name => {
                            const lower = name.toLowerCase();
                            if (lower === mentionLower || lower.includes(mentionLower)) return true;
                            const norm = normalizeName(name);
                            return norm === mentionNorm || norm.includes(mentionNorm);
                        });
                    }) || null;
                }

                if (member) {
                    addScore(member.id, result.score);
                    console.log(`✓ Saved: ${member.user.username} (${member.displayName}) - ${result.score}/6`);
                } else {
                    const label = result.userId ? `<@${result.userId}>` : (result.mention ? `@${result.mention}` : '(unknown)');
                    console.log(`✗ Could not find member for: ${label}`);
                    // Show available members for debugging
                    console.log(`Available members (first 5):`,
                        message.guild.members.cache.map(m => `${m.user.username} / ${m.displayName}`).slice(0, 5)
                    );
                }
            }

            // After processing scores, send the leaderboard
            const stats = calculateStats();

            if (Object.keys(stats).length > 0) {
                // Sort users by weighted score (lower is better)
                const sortedUsers = Object.entries(stats).sort((a, b) => a[1].weightedScore - b[1].weightedScore);

                const { EmbedBuilder } = require('discord.js');

                // Build the leaderboard description with proper formatting
                let leaderboardText = '';
                const topTen = sortedUsers.slice(0, 10);

                for (let i = 0; i < topTen.length; i++) {
                    const [userId, userStats] = topTen[i];
                    const member = message.guild.members.cache.get(userId);
                    const username = member ? member.user.username : `Unknown User (${userId})`;

                    let medal;
                    if (i === 0) medal = '🥇';
                    else if (i === 1) medal = '🥈';
                    else if (i === 2) medal = '🥉';
                    else medal = `**${i + 1}.**`;

                    leaderboardText += `${medal} **${username}**\n`;
                    leaderboardText += `└ Avg: **${userStats.avgScore.toFixed(2)}** | Games: **${userStats.totalGames}** | Best: **${userStats.bestScore}/6**\n\n`;
                }

                const embed = new EmbedBuilder()
                    .setTitle('🟩 Wordle Leaderboard - Top Word Masters')
                    .setColor('#6aaa64')
                    .setDescription(leaderboardText.trim())
                    .addFields(
                        { name: '📊 Total Players', value: `${Object.keys(stats).length}`, inline: true },
                        { name: '🎮 Total Games Played', value: `${Object.values(stats).reduce((sum, s) => sum + s.totalGames, 0)}`, inline: true },
                        { name: '⭐ Best Score', value: `${Math.min(...Object.values(stats).map(s => s.bestScore))}/6`, inline: true }
                    )
                    .setFooter({ text: 'Rankings favor consistency and volume. Play more to climb! 🟩' })
                    .setTimestamp();

                message.channel.send({ embeds: [embed] });
            }
        }

        // Handle !wordletop command
        if (message.content.toLowerCase() === '!wordletop') {
            const stats = calculateStats();

            if (Object.keys(stats).length === 0) {
                return message.channel.send('No Wordle scores recorded yet!');
            }

            // Sort users by weighted score (lower is better)
            const sortedUsers = Object.entries(stats).sort((a, b) => a[1].weightedScore - b[1].weightedScore);

            const { EmbedBuilder } = require('discord.js');

            // Fetch guild members to ensure we have usernames
            try {
                await message.guild.members.fetch();
            } catch (error) {
                console.error('Error fetching guild members:', error);
            }

            // Build the leaderboard description with proper formatting
            let leaderboardText = '';
            const topTen = sortedUsers.slice(0, 10);

            for (let i = 0; i < topTen.length; i++) {
                const [userId, userStats] = topTen[i];
                const member = message.guild.members.cache.get(userId);
                const username = member ? member.user.username : `Unknown User (${userId})`;

                let medal;
                if (i === 0) medal = '🥇';
                else if (i === 1) medal = '🥈';
                else if (i === 2) medal = '🥉';
                else medal = `**${i + 1}.**`;

                leaderboardText += `${medal} **${username}**\n`;
                leaderboardText += `└ Avg: **${userStats.avgScore.toFixed(2)}** | Games: **${userStats.totalGames}** | Best: **${userStats.bestScore}/6**\n\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle('🟩 Wordle Leaderboard - Top Word Masters')
                .setColor('#6aaa64')
                .setDescription(leaderboardText.trim())
                .addFields(
                    { name: '📊 Total Players', value: `${Object.keys(stats).length}`, inline: true },
                    { name: '🎮 Total Games Played', value: `${Object.values(stats).reduce((sum, s) => sum + s.totalGames, 0)}`, inline: true },
                    { name: '⭐ Best Score', value: `${Math.min(...Object.values(stats).map(s => s.bestScore))}/6`, inline: true }
                )
                .setFooter({ text: 'Rankings favor consistency and volume. Play more to climb! 🟩' })
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
        }

        // Handle !wordleweekly command
        if (message.content.toLowerCase() === '!wordleweekly') {
            const now = Date.now();
            const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
            const timeFilter = { start: oneWeekAgo, end: now };
            const stats = calculateStats(timeFilter);

            if (Object.keys(stats).length === 0) {
                return message.channel.send('No Wordle scores recorded in the past week!');
            }

            // Sort users by weighted score (lower is better)
            const sortedUsers = Object.entries(stats).sort((a, b) => a[1].weightedScore - b[1].weightedScore);

            const { EmbedBuilder } = require('discord.js');

            // Fetch guild members to ensure we have usernames
            try {
                await message.guild.members.fetch();
            } catch (error) {
                console.error('Error fetching guild members:', error);
            }

            // Build the leaderboard description with proper formatting
            let leaderboardText = '';
            const topTen = sortedUsers.slice(0, 10);

            for (let i = 0; i < topTen.length; i++) {
                const [userId, userStats] = topTen[i];
                const member = message.guild.members.cache.get(userId);
                const username = member ? member.user.username : `Unknown User (${userId})`;

                let medal;
                if (i === 0) medal = '🥇';
                else if (i === 1) medal = '🥈';
                else if (i === 2) medal = '🥉';
                else medal = `**${i + 1}.**`;

                leaderboardText += `${medal} **${username}**\n`;
                leaderboardText += `└ Avg: **${userStats.avgScore.toFixed(2)}** | Games: **${userStats.totalGames}** | Best: **${userStats.bestScore}/6**\n\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle('📅 Weekly Wordle Leaderboard - Past 7 Days')
                .setColor('#6aaa64')
                .setDescription(leaderboardText.trim())
                .addFields(
                    { name: '📊 Active Players', value: `${Object.keys(stats).length}`, inline: true },
                    { name: '🎮 Games This Week', value: `${Object.values(stats).reduce((sum, s) => sum + s.totalGames, 0)}`, inline: true },
                    { name: '⭐ Best Score', value: `${Math.min(...Object.values(stats).map(s => s.bestScore))}/6`, inline: true }
                )
                .setFooter({ text: 'Rankings favor consistency and volume. Play more to climb! 🟩' })
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
        }

        // Handle !wordlemonthly command
        if (message.content.toLowerCase() === '!wordlemonthly') {
            const now = Date.now();
            const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);
            const timeFilter = { start: oneMonthAgo, end: now };
            const stats = calculateStats(timeFilter);

            if (Object.keys(stats).length === 0) {
                return message.channel.send('No Wordle scores recorded in the past month!');
            }

            // Sort users by weighted score (lower is better)
            const sortedUsers = Object.entries(stats).sort((a, b) => a[1].weightedScore - b[1].weightedScore);

            const { EmbedBuilder } = require('discord.js');

            // Fetch guild members to ensure we have usernames
            try {
                await message.guild.members.fetch();
            } catch (error) {
                console.error('Error fetching guild members:', error);
            }

            // Build the leaderboard description with proper formatting
            let leaderboardText = '';
            const topTen = sortedUsers.slice(0, 10);

            for (let i = 0; i < topTen.length; i++) {
                const [userId, userStats] = topTen[i];
                const member = message.guild.members.cache.get(userId);
                const username = member ? member.user.username : `Unknown User (${userId})`;

                let medal;
                if (i === 0) medal = '🥇';
                else if (i === 1) medal = '🥈';
                else if (i === 2) medal = '🥉';
                else medal = `**${i + 1}.**`;

                leaderboardText += `${medal} **${username}**\n`;
                leaderboardText += `└ Avg: **${userStats.avgScore.toFixed(2)}** | Games: **${userStats.totalGames}** | Best: **${userStats.bestScore}/6**\n\n`;
            }

            const embed = new EmbedBuilder()
                .setTitle('📅 Monthly Wordle Leaderboard - Past 30 Days')
                .setColor('#6aaa64')
                .setDescription(leaderboardText.trim())
                .addFields(
                    { name: '📊 Active Players', value: `${Object.keys(stats).length}`, inline: true },
                    { name: '🎮 Games This Month', value: `${Object.values(stats).reduce((sum, s) => sum + s.totalGames, 0)}`, inline: true },
                    { name: '⭐ Best Score', value: `${Math.min(...Object.values(stats).map(s => s.bestScore))}/6`, inline: true }
                )
                .setFooter({ text: 'Rankings favor consistency and volume. Play more to climb! 🟩' })
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
        }

        // Handle !wordlebackfill command
        if (message.content.toLowerCase() === '!wordlebackfill') {
              message.channel.send('Starting backfill of historical Wordle scores...');

            try {
                let totalMessages = 0;
                let totalScores = 0;
                let lastMessageId;

                // Warm member cache for better matching during backfill
                try { await message.guild.members.fetch(); } catch (_) {}

                // Fetch messages in batches
                while (true) {
                    const options = { limit: 100 };
                    if (lastMessageId) {
                        options.before = lastMessageId;
                    }

                    const messages = await message.channel.messages.fetch(options);

                    if (messages.size === 0) break;

                    for (const [, msg] of messages) {
                        if (msg.content.includes('Here are yesterday\'s results:') ||
                            msg.content.includes('day streak!')) {

                            totalMessages++;
                            const parsedResults = parseWordleMessage(msg.content);

                            for (const result of parsedResults) {
                                let member = null;
                                if (result.userId) {
                                    member = message.guild.members.cache.get(result.userId) || null;
                                }
                                if (!member && result.mention) {
                                    const mentionLower = result.mention.toLowerCase();
                                    const mentionNorm = result.mentionNorm || normalizeName(result.mention);
                                    member = message.guild.members.cache.find(m => {
                                        const u = m.user;
                                        const cand = [u.username, m.displayName, u.globalName].filter(Boolean);
                                        return cand.some(name => {
                                            const lower = name.toLowerCase();
                                            if (lower === mentionLower || lower.includes(mentionLower)) return true;
                                            const norm = normalizeName(name);
                                            return norm === mentionNorm || norm.includes(mentionNorm);
                                        });
                                    }) || null;
                                }

                                if (member) {
                                    addScore(member.id, result.score);
                                    totalScores++;
                                }
                            }
                        }
                    }

                    lastMessageId = messages.last().id;

                    // Add a small delay to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                message.channel.send(`Backfill complete! Processed ${totalMessages} Wordle result messages and added ${totalScores} new scores.`);
            } catch (error) {
                console.error('Error during backfill:', error);
                message.channel.send('L An error occurred during backfill. Check console for details.');
            }
        }
    });
};
