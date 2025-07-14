const fs = require('fs');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const https = require('https');

const activityFilePath = path.join(__dirname, '../data/daily_activity.txt');
const bobbyBucksFilePath = path.join(__dirname, '../data/bobby_bucks.txt');

// Function to load image from URL
async function loadImageFromURL(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                try {
                    const buffer = Buffer.concat(chunks);
                    resolve(loadImage(buffer));
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

module.exports = (client) => {
    // Store active voice sessions
    const voiceSessions = new Map();
    
    // Track voice channel activity
    client.on('voiceStateUpdate', (oldState, newState) => {
        const userId = newState.id;
        const currentTime = Date.now();
        
        // User joined a voice channel
        if (!oldState.channelId && newState.channelId) {
            voiceSessions.set(userId, currentTime);
            console.log(`${newState.member.user.username} joined voice channel`);
        }
        
        // User left a voice channel
        if (oldState.channelId && !newState.channelId) {
            const joinTime = voiceSessions.get(userId);
            if (joinTime) {
                const sessionDuration = Math.floor((currentTime - joinTime) / 1000); // in seconds
                updateVoiceActivity(userId, sessionDuration);
                voiceSessions.delete(userId);
                console.log(`${oldState.member.user.username} left voice channel after ${sessionDuration}s`);
            }
        }
        
        // User switched voice channels
        if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
            const joinTime = voiceSessions.get(userId);
            if (joinTime) {
                const sessionDuration = Math.floor((currentTime - joinTime) / 1000);
                updateVoiceActivity(userId, sessionDuration);
                voiceSessions.set(userId, currentTime); // Reset timer for new channel
                console.log(`${newState.member.user.username} switched voice channels after ${sessionDuration}s`);
            }
        }
    });

    // Track message activity
    client.on('messageCreate', (message) => {
        if (message.author.bot) return;
        if (!message.guild) return; // Skip DM messages
        
        updateMessageActivity(message.author.id);
    });

    // Command to check daily activity stats
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!message.guild) return;

        const args = message.content.split(' ');

        // Command to check activity stats
        if (args[0] === '!activity') {
            let userId, user;
            
            if (args[1]) {
                // Check someone else's activity
                const mentionedUser = message.mentions.users.first() || message.guild.members.cache.find(member => member.user.username === args[1])?.user;
                if (!mentionedUser) {
                    return message.channel.send('User not found.');
                }
                userId = mentionedUser.id;
                user = mentionedUser;
            } else {
                // Check own activity
                userId = message.author.id;
                user = message.author;
            }
            
            const activity = getDailyActivity(userId);
            const activityCard = await createActivityCard(user, activity);
            const attachment = new AttachmentBuilder(activityCard.toBuffer(), { name: 'activity-card.png' });

            const embed = new EmbedBuilder()
                .setTitle('📊 Daily Activity Report')
                .setColor('#4a90e2')
                .setDescription(`**User:** ${user.username}`)
                .setImage('attachment://activity-card.png')
                .addFields(
                    { name: '🎤 Voice Time', value: `${Math.floor(activity.voiceTime / 60)}m ${activity.voiceTime % 60}s`, inline: true },
                    { name: '💬 Messages Sent', value: `${activity.messageCount}`, inline: true },
                    { name: '🏆 Activity Score', value: `${calculateActivityScore(activity)}`, inline: true }
                )
                .setFooter({ text: 'Activity resets daily at 12:00 AM' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // Command to check activity leaderboard
        if (args[0] === '!activetop') {
            const topActivity = await getTopActivity(message.guild, 10);
            
            if (topActivity.length === 0) {
                return message.channel.send('No activity data found for today.');
            }
            
            const leaderboardImage = await createActivityLeaderboard(topActivity, message.guild);
            const attachment = new AttachmentBuilder(leaderboardImage.toBuffer(), { name: 'activity-leaderboard.png' });

            const embed = new EmbedBuilder()
                .setTitle('🏆 Daily Activity Leaderboard')
                .setColor('#ff6b6b')
                .setDescription('**Most Active Members Today**')
                .setImage('attachment://activity-leaderboard.png')
                .addFields(
                    { name: '🎁 Daily Prize', value: '5,000 Bobby Bucks', inline: true },
                    { name: '⏰ Reset Time', value: '12:00 AM', inline: true },
                    { name: '👑 Current Leader', value: topActivity[0] ? topActivity[0].username : 'None', inline: true }
                )
                .setFooter({ text: 'Keep being active to win!' })
                .setTimestamp();
            
            return message.channel.send({ embeds: [embed], files: [attachment] });
        }
    });

    // Schedule daily reset at 12:00 AM
    function scheduleNextReset() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0); // Set to 12:00 AM
        
        const timeUntilReset = tomorrow.getTime() - now.getTime();
        
        setTimeout(() => {
            performDailyReset(client);
            scheduleNextReset(); // Schedule the next reset
        }, timeUntilReset);
        
        console.log(`Next activity reset scheduled for: ${tomorrow.toLocaleString()}`);
    }

    // Start the reset scheduler
    scheduleNextReset();

    // Create activity card visualization
    async function createActivityCard(user, activity) {
        const canvas = createCanvas(500, 350);
        const ctx = canvas.getContext('2d');
        
        // Card background gradient
        const gradient = ctx.createLinearGradient(0, 0, 500, 350);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(0.5, '#764ba2');
        gradient.addColorStop(1, '#f093fb');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 500, 350);
        
        // Card border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeRect(10, 10, 480, 330);
        
        // Header
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('📊 DAILY ACTIVITY REPORT', 250, 45);
        
        try {
            // User avatar
            const avatarURL = user.displayAvatarURL({ extension: 'png', size: 128 });
            const avatar = await loadImageFromURL(avatarURL);
            
            // Circular avatar
            ctx.save();
            ctx.beginPath();
            ctx.arc(250, 110, 40, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, 210, 70, 80, 80);
            ctx.restore();
            
            // Avatar border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(250, 110, 40, 0, Math.PI * 2);
            ctx.stroke();
        } catch (error) {
            // Fallback avatar
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(250, 110, 40, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#667eea';
            ctx.font = '30px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('👤', 250, 120);
        }
        
        // Username
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(user.username, 250, 170);
        
        // Voice time
        const voiceMinutes = Math.floor(activity.voiceTime / 60);
        const voiceSeconds = activity.voiceTime % 60;
        ctx.font = 'bold 18px Arial';
        ctx.fillText('🎤 Voice Channel Time', 250, 210);
        ctx.font = '24px Arial';
        ctx.fillText(`${voiceMinutes}m ${voiceSeconds}s`, 250, 235);
        
        // Message count
        ctx.font = 'bold 18px Arial';
        ctx.fillText('💬 Messages Sent', 250, 270);
        ctx.font = '24px Arial';
        ctx.fillText(`${activity.messageCount}`, 250, 295);
        
        // Activity score
        const score = calculateActivityScore(activity);
        ctx.font = 'bold 18px Arial';
        ctx.fillText('🏆 Activity Score', 250, 330);
        ctx.font = '20px Arial';
        ctx.fillText(`${score} points`, 250, 350);
        
        return canvas;
    }

    // Create activity leaderboard
    async function createActivityLeaderboard(topActivity, guild) {
        const canvas = createCanvas(600, 400 + (topActivity.length * 40));
        const ctx = canvas.getContext('2d');
        
        // Background
        const gradient = ctx.createLinearGradient(0, 0, 600, canvas.height);
        gradient.addColorStop(0, '#ff9a9e');
        gradient.addColorStop(0.5, '#fecfef');
        gradient.addColorStop(1, '#fecfef');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, canvas.height);
        
        // Header
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🏆 DAILY ACTIVITY LEADERBOARD', 300, 50);
        
        // Server name
        ctx.font = '18px Arial';
        ctx.fillText(guild.name, 300, 80);
        
        // Prize announcement
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#ff6b6b';
        ctx.fillText('🎁 Winner gets 5,000 Bobby Bucks!', 300, 105);
        
        // Header bar
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(20, 120, 560, 3);
        
        // Leaderboard entries
        for (let i = 0; i < topActivity.length; i++) {
            const entry = topActivity[i];
            const y = 160 + (i * 40);
            
            // Rank background
            let rankColor = '#ff9a9e';
            if (i === 0) rankColor = '#ffd700'; // Gold
            else if (i === 1) rankColor = '#c0c0c0'; // Silver
            else if (i === 2) rankColor = '#cd7f32'; // Bronze
            
            ctx.fillStyle = rankColor;
            ctx.fillRect(30, y - 25, 45, 35);
            
            // Rank number
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
            ctx.fillText(rankIcon, 52, y - 5);
            
            // Username
            ctx.fillStyle = '#333333';
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(entry.username, 90, y - 10);
            
            // Activity details
            ctx.font = '14px Arial';
            ctx.fillStyle = '#666666';
            const voiceMinutes = Math.floor(entry.activity.voiceTime / 60);
            ctx.fillText(`🎤 ${voiceMinutes}m | 💬 ${entry.activity.messageCount} msgs`, 90, y + 8);
            
            // Activity score
            ctx.fillStyle = '#ff6b6b';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(`${entry.score} pts`, 570, y - 5);
            
            // Separator line
            if (i < topActivity.length - 1) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(30, y + 20);
                ctx.lineTo(570, y + 20);
                ctx.stroke();
            }
        }
        
        return canvas;
    }

    // Create winner announcement card
    async function createWinnerCard(user, activity, score, guild) {
        const canvas = createCanvas(600, 400);
        const ctx = canvas.getContext('2d');
        
        // Celebration background
        const gradient = ctx.createRadialGradient(300, 200, 0, 300, 200, 300);
        gradient.addColorStop(0, '#ffd700');
        gradient.addColorStop(0.5, '#ffed4e');
        gradient.addColorStop(1, '#ff6b6b');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 400);
        
        // Celebration particles
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 100; i++) {
            const x = Math.random() * 600;
            const y = Math.random() * 400;
            const size = Math.random() * 4 + 1;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Main announcement
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🎉 DAILY ACTIVITY WINNER! 🎉', 300, 60);
        
        try {
            // Winner avatar
            const avatarURL = user.displayAvatarURL({ extension: 'png', size: 128 });
            const avatar = await loadImageFromURL(avatarURL);
            
            // Large circular avatar
            ctx.save();
            ctx.beginPath();
            ctx.arc(300, 150, 60, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, 240, 90, 120, 120);
            ctx.restore();
            
            // Avatar border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(300, 150, 60, 0, Math.PI * 2);
            ctx.stroke();
        } catch (error) {
            // Fallback avatar
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(300, 150, 60, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffd700';
            ctx.font = '40px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('👑', 300, 165);
        }
        
        // Winner name
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(user.username, 300, 240);
        
        // Prize amount
        ctx.font = 'bold 24px Arial';
        ctx.fillText('Wins 5,000 Bobby Bucks!', 300, 270);
        
        // Activity stats
        ctx.font = '18px Arial';
        const voiceMinutes = Math.floor(activity.voiceTime / 60);
        ctx.fillText(`🎤 ${voiceMinutes}m voice time | 💬 ${activity.messageCount} messages`, 300, 300);
        ctx.fillText(`🏆 ${score} activity points`, 300, 325);
        
        // Server name
        ctx.font = '14px Arial';
        ctx.fillText(`${guild.name} • ${new Date().toLocaleDateString()}`, 300, 370);
        
        return canvas;
    }

    // Function to get daily activity for a user
    function getDailyActivity(userId) {
        if (!fs.existsSync(activityFilePath)) {
            fs.writeFileSync(activityFilePath, '', 'utf-8');
        }
        
        const data = fs.readFileSync(activityFilePath, 'utf-8');
        const today = getCurrentDateString();
        const userRecord = data.split('\n').find(line => line.startsWith(`${userId}:${today}`));
        
        if (userRecord) {
            const parts = userRecord.split(':');
            return {
                voiceTime: parseInt(parts[2], 10) || 0,
                messageCount: parseInt(parts[3], 10) || 0
            };
        }
        
        return { voiceTime: 0, messageCount: 0 };
    }

    // Function to update voice activity
    function updateVoiceActivity(userId, duration) {
        const today = getCurrentDateString();
        const activity = getDailyActivity(userId);
        activity.voiceTime += duration;
        saveActivity(userId, today, activity);
    }

    // Function to update message activity
    function updateMessageActivity(userId) {
        const today = getCurrentDateString();
        const activity = getDailyActivity(userId);
        activity.messageCount += 1;
        saveActivity(userId, today, activity);
    }

    // Function to save activity data
    function saveActivity(userId, date, activity) {
        if (!fs.existsSync(activityFilePath)) {
            fs.writeFileSync(activityFilePath, '', 'utf-8');
        }
        
        let data = fs.readFileSync(activityFilePath, 'utf-8').trim();
        const recordKey = `${userId}:${date}`;
        const newRecord = `${recordKey}:${activity.voiceTime}:${activity.messageCount}`;
        
        const lines = data.split('\n').filter(line => line.trim() !== '');
        const existingIndex = lines.findIndex(line => line.startsWith(recordKey));
        
        if (existingIndex !== -1) {
            lines[existingIndex] = newRecord;
        } else {
            lines.push(newRecord);
        }
        
        fs.writeFileSync(activityFilePath, lines.join('\n'), 'utf-8');
    }

    // Function to get top activity for today
    async function getTopActivity(guild, limit = 10) {
        if (!fs.existsSync(activityFilePath)) {
            return [];
        }
        
        const data = fs.readFileSync(activityFilePath, 'utf-8').trim();
        if (!data) return [];
        
        const today = getCurrentDateString();
        const todayActivities = [];
        
        const lines = data.split('\n').filter(line => line.includes(today));
        
        for (const line of lines) {
            const [userId, date, voiceTime, messageCount] = line.split(':');
            if (date === today) {
                const activity = {
                    voiceTime: parseInt(voiceTime, 10) || 0,
                    messageCount: parseInt(messageCount, 10) || 0
                };
                
                const score = calculateActivityScore(activity);
                
                let member = guild.members.cache.get(userId);
                if (!member) {
                    try {
                        member = await guild.members.fetch(userId);
                    } catch (e) {
                        member = null;
                    }
                }
                
                if (member && !member.user.bot) {
                    todayActivities.push({
                        userId,
                        username: member.user.username,
                        activity,
                        score,
                        user: member.user
                    });
                }
            }
        }
        
        // Sort by activity score (descending)
        todayActivities.sort((a, b) => b.score - a.score);
        
        return todayActivities.slice(0, limit);
    }

    // Function to calculate activity score
    function calculateActivityScore(activity) {
        // Voice time is worth 1 point per minute, messages are worth 10 points each
        const voicePoints = Math.floor(activity.voiceTime / 60);
        const messagePoints = activity.messageCount * 10;
        return voicePoints + messagePoints;
    }

    // Function to get current date string
    function getCurrentDateString() {
        return new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    }

    // Function to update Bobby Bucks (same as in eggbuckHandler)
    function updateBobbyBucks(userId, amount) {
        if (!fs.existsSync(bobbyBucksFilePath)) {
            fs.writeFileSync(bobbyBucksFilePath, '', 'utf-8');
        }

        let data = fs.readFileSync(bobbyBucksFilePath, 'utf-8').trim();
        const userRecord = data.split('\n').find(line => line.startsWith(userId));
        let newBalance;

        if (userRecord) {
            const currentBalance = parseInt(userRecord.split(':')[1], 10);
            newBalance = currentBalance + amount;
            data = data.replace(userRecord, `${userId}:${newBalance}`);
        } else {
            newBalance = amount;
            data += `\n${userId}:${newBalance}`;
        }

        fs.writeFileSync(bobbyBucksFilePath, data.trim(), 'utf-8');
        return newBalance;
    }

    // Function to perform daily reset and award winner
    async function performDailyReset(client) {
        console.log('Performing daily activity reset...');
        
        // Get all guilds the bot is in
        for (const guild of client.guilds.cache.values()) {
            try {
                const topActivity = await getTopActivity(guild, 1);
                
                if (topActivity.length > 0) {
                    const winner = topActivity[0];
                    const awardAmount = 5000;
                    
                    // Award Bobby Bucks to the winner
                    updateBobbyBucks(winner.userId, awardAmount);
                    
                    // Create winner announcement
                    const winnerCard = await createWinnerCard(winner.user, winner.activity, winner.score, guild);
                    const attachment = new AttachmentBuilder(winnerCard.toBuffer(), { name: 'daily-winner.png' });

                    const embed = new EmbedBuilder()
                        .setTitle('🎉 Daily Activity Winner Announcement!')
                        .setColor('#ffd700')
                        .setDescription(`**${winner.username}** was the most active member yesterday!`)
                        .setImage('attachment://daily-winner.png')
                        .addFields(
                            { name: '🏆 Activity Score', value: `${winner.score} points`, inline: true },
                            { name: '💰 Prize Awarded', value: `5,000 Bobby Bucks`, inline: true },
                            { name: '📊 Stats', value: `🎤 ${Math.floor(winner.activity.voiceTime / 60)}m voice\n💬 ${winner.activity.messageCount} messages`, inline: true }
                        )
                        .setFooter({ text: 'New day, new competition! Stay active to win!' })
                        .setTimestamp();
                    
                    // Find a general channel to send the announcement
                    const channel = guild.channels.cache.find(ch => 
                        ch.name.includes('general') || 
                        ch.name.includes('announcement') || 
                        ch.name.includes('main')
                    ) || guild.systemChannel;
                    
                    if (channel && channel.isTextBased()) {
                        await channel.send({ embeds: [embed], files: [attachment] });
                    }
                    
                    console.log(`Daily winner in ${guild.name}: ${winner.username} with ${winner.score} points`);
                } else {
                    console.log(`No activity data found for ${guild.name}`);
                }
            } catch (error) {
                console.error(`Error processing daily reset for guild ${guild.name}:`, error);
            }
        }
        
        // Clear yesterday's activity data
        clearOldActivity();
        
        console.log('Daily activity reset completed!');
    }

    // Function to clear old activity data (keep only last 7 days)
    function clearOldActivity() {
        if (!fs.existsSync(activityFilePath)) {
            return;
        }
        
        const data = fs.readFileSync(activityFilePath, 'utf-8').trim();
        if (!data) return;
        
        const lines = data.split('\n').filter(line => line.trim() !== '');
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7);
        const cutoffString = cutoffDate.toISOString().split('T')[0];
        
        const filteredLines = lines.filter(line => {
            const parts = line.split(':');
            if (parts.length >= 2) {
                const dateString = parts[1];
                return dateString >= cutoffString;
            }
            return false;
        });
        
        fs.writeFileSync(activityFilePath, filteredLines.join('\n'), 'utf-8');
        console.log(`Cleaned up old activity data. Kept ${filteredLines.length} records.`);
    }
};