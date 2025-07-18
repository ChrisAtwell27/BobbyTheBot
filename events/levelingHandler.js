const fs = require('fs');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const https = require('https');

const levelingFilePath = path.join(__dirname, '../data/leveling.txt');
const colorRolesFilePath = path.join(__dirname, '../data/color_roles.txt');

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
    // Configuration
    const config = {
        xpPerMessage: { min: 15, max: 25 }, // Random XP per message
        xpCooldown: 60000, // 1 minute cooldown between XP gains
        levelChannels: [5, 10, 15, 20, 25, 30, 40, 50, 75, 100], // Levels that unlock channels (namecolor unlocks at 10)
        colorRolePrefix: '🎨 ',
        availableColors: {
            'red': '#ff4444',
            'blue': '#4444ff', 
            'green': '#44ff44',
            'purple': '#9932cc',
            'orange': '#ff8800',
            'pink': '#ff69b4',
            'yellow': '#ffdd44',
            'cyan': '#00ffff',
            'lime': '#32cd32',
            'magenta': '#ff00ff',
            'teal': '#008080',
            'indigo': '#4b0082',
            'gold': '#ffd700',
            'crimson': '#dc143c',
            'navy': '#000080'
        }
    };

    const xpCooldowns = new Map(); // Track XP cooldowns

    console.log('📈 Leveling Handler initialized');

    // Award XP for messages
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!message.guild) return;

        const userId = message.author.id;
        const now = Date.now();

        // Check cooldown
        if (xpCooldowns.has(userId)) {
            const expirationTime = xpCooldowns.get(userId) + config.xpCooldown;
            if (now < expirationTime) return;
        }

        // Award random XP
        const xpGained = Math.floor(Math.random() * (config.xpPerMessage.max - config.xpPerMessage.min + 1)) + config.xpPerMessage.min;
        const userData = getUserData(userId);
        const oldLevel = calculateLevel(userData.xp);
        
        userData.xp += xpGained;
        userData.messages++;
        saveUserData(userId, userData);
        
        const newLevel = calculateLevel(userData.xp);
        
        // Set cooldown
        xpCooldowns.set(userId, now);

        // Check for level up
        if (newLevel > oldLevel) {
            await handleLevelUp(message, newLevel, oldLevel);
        }
    });

    // Handle level commands
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!message.guild) return;

        const args = message.content.split(' ');
        const command = args[0].toLowerCase();

        // Level/rank command
        if (command === '!level' || command === '!rank' || command === '!xp') {
            let targetUser = message.author;
            let targetMember = message.member;

            if (args[1]) {
                const mentionedUser = message.mentions.users.first() || 
                    message.guild.members.cache.find(member => member.user.username === args[1])?.user;
                if (mentionedUser) {
                    targetUser = mentionedUser;
                    targetMember = message.guild.members.cache.get(mentionedUser.id);
                }
            }

            const userData = getUserData(targetUser.id);
            const level = calculateLevel(userData.xp);
            const currentLevelXP = getXPForLevel(level);
            const nextLevelXP = getXPForLevel(level + 1);
            const progressXP = userData.xp - currentLevelXP;
            const neededXP = nextLevelXP - currentLevelXP;

            const levelCard = await createLevelCard(targetUser, userData, level, progressXP, neededXP);
            const attachment = new AttachmentBuilder(levelCard.toBuffer(), { name: 'level-card.png' });

            const embed = new EmbedBuilder()
                .setTitle('📈 Level Progress')
                .setColor(getLevelColor(level))
                .setDescription(`**Level ${level}** - ${targetUser.username}`)
                .setImage('attachment://level-card.png')
                .addFields(
                    { name: '💫 Total XP', value: `${userData.xp.toLocaleString()}`, inline: true },
                    { name: '📊 Progress', value: `${progressXP}/${neededXP} XP`, inline: true },
                    { name: '💬 Messages', value: `${userData.messages.toLocaleString()}`, inline: true },
                    { name: '🎯 Next Level', value: `${nextLevelXP - userData.xp} XP needed`, inline: true },
                    { name: '🏆 Server Rank', value: `#${getUserRank(targetUser.id, message.guild)}`, inline: true },
                    { name: '🔓 Unlocked', value: getUnlockedFeatures(level), inline: true }
                )
                .setFooter({ text: 'Keep chatting to gain more XP!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // Leaderboard command
        if (command === '!leveltop' || command === '!leaderboard') {
            const topUsers = await getTopUsers(message.guild, 10);
            
            if (topUsers.length === 0) {
                return message.channel.send('No leveling data found.');
            }

            const leaderboardImage = await createLeaderboard(topUsers, message.guild);
            const attachment = new AttachmentBuilder(leaderboardImage.toBuffer(), { name: 'level-leaderboard.png' });

            const embed = new EmbedBuilder()
                .setTitle('🏆 Level Leaderboard')
                .setColor('#ffd700')
                .setDescription('**Top 10 Most Active Members**')
                .setImage('attachment://level-leaderboard.png')
                .addFields(
                    { name: '📊 Total Users', value: `${topUsers.length} active`, inline: true },
                    { name: '👑 Highest Level', value: `Level ${topUsers[0]?.level || 0}`, inline: true },
                    { name: '💫 Total XP', value: `${getTotalXP().toLocaleString()}`, inline: true }
                )
                .setFooter({ text: 'Rankings update in real-time' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // Name color command (Level 10+ only)
        if (command === '!namecolor' || command === '!colorname') {
            const userData = getUserData(message.author.id);
            const userLevel = calculateLevel(userData.xp);

            if (userLevel < 10) {
                const lockedEmbed = new EmbedBuilder()
                    .setTitle('🔒 Feature Locked')
                    .setColor('#ff4444')
                    .setDescription('**Name colors are unlocked at Level 10!**')
                    .addFields(
                        { name: '📈 Your Level', value: `Level ${userLevel}`, inline: true },
                        { name: '🎯 Required Level', value: 'Level 10', inline: true },
                        { name: '💫 XP Needed', value: `${getXPForLevel(10) - userData.xp} more XP`, inline: true }
                    )
                    .setFooter({ text: 'Keep chatting to reach Level 10!' })
                    .setTimestamp();

                return message.channel.send({ embeds: [lockedEmbed] });
            }

            if (!args[1]) {
                const colorListEmbed = new EmbedBuilder()
                    .setTitle('🎨 Available Name Colors')
                    .setColor('#9932cc')
                    .setDescription('**Choose from these colors for your name!**')
                    .addFields(
                        { name: '🔴 Red Tones', value: '`red`, `crimson`', inline: true },
                        { name: '🔵 Blue Tones', value: '`blue`, `navy`, `cyan`, `teal`', inline: true },
                        { name: '🟢 Green Tones', value: '`green`, `lime`', inline: true },
                        { name: '🟣 Purple Tones', value: '`purple`, `magenta`, `indigo`', inline: true },
                        { name: '🟡 Warm Tones', value: '`yellow`, `orange`, `gold`', inline: true },
                        { name: '🌸 Other', value: '`pink`', inline: true }
                    )
                    .addFields({
                        name: '💡 Usage',
                        value: '`!namecolor <color>`\nExample: `!namecolor purple`',
                        inline: false
                    })
                    .setFooter({ text: 'Level 10+ Perk - Choose your style!' })
                    .setTimestamp();

                return message.channel.send({ embeds: [colorListEmbed] });
            }

            const colorName = args[1].toLowerCase();
            const colorHex = config.availableColors[colorName];

            if (!colorHex) {
                return message.channel.send(`❌ Invalid color! Use \`!namecolor\` to see available colors.`);
            }

            await assignColorRole(message, message.member, colorName, colorHex);
        }

        // Level statistics command
        if (command === '!levelstats') {
            const stats = getLevelingStats(message.guild);
            const statsCard = await createStatsCard(stats);
            const attachment = new AttachmentBuilder(statsCard.toBuffer(), { name: 'level-stats.png' });

            const embed = new EmbedBuilder()
                .setTitle('📊 Server Level Statistics')
                .setColor('#4a90e2')
                .setDescription('**Complete Leveling Overview**')
                .setImage('attachment://level-stats.png')
                .addFields(
                    { name: '👥 Active Users', value: `${stats.totalUsers}`, inline: true },
                    { name: '💫 Total XP', value: `${stats.totalXP.toLocaleString()}`, inline: true },
                    { name: '💬 Total Messages', value: `${stats.totalMessages.toLocaleString()}`, inline: true },
                    { name: '👑 Highest Level', value: `Level ${stats.highestLevel}`, inline: true },
                    { name: '📈 Average Level', value: `Level ${stats.averageLevel}`, inline: true },
                    { name: '🎨 Colored Names', value: `${stats.coloredUsers}`, inline: true }
                )
                .setFooter({ text: 'Statistics update in real-time' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }
    });

    // Check channel access on message
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!message.guild) return;

        // Check if message is in a level-locked channel
        const channelName = message.channel.name;
        if (channelName && channelName.startsWith('level-')) {
            const requiredLevel = parseInt(channelName.split('-')[1]);
            if (!isNaN(requiredLevel)) {
                const userData = getUserData(message.author.id);
                const userLevel = calculateLevel(userData.xp);

                if (userLevel < requiredLevel) {
                    await message.delete().catch(() => {});
                    
                    const warningEmbed = new EmbedBuilder()
                        .setTitle('🔒 Access Denied')
                        .setColor('#ff4444')
                        .setDescription(`You need **Level ${requiredLevel}** to chat in ${message.channel}!`)
                        .addFields(
                            { name: '📈 Your Level', value: `Level ${userLevel}`, inline: true },
                            { name: '💫 XP Needed', value: `${getXPForLevel(requiredLevel) - userData.xp} more XP`, inline: true }
                        )
                        .setFooter({ text: 'Keep chatting in other channels to level up!' });

                    const warning = await message.channel.send({ 
                        content: `${message.author}`,
                        embeds: [warningEmbed] 
                    });
                    
                    setTimeout(() => warning.delete().catch(() => {}), 5000);
                }
            }
        }
    });

    // Handle level up
    async function handleLevelUp(message, newLevel, oldLevel) {
        try {
            const levelUpCard = await createLevelUpCard(message.author, newLevel, oldLevel);
            const attachment = new AttachmentBuilder(levelUpCard.toBuffer(), { name: 'level-up.png' });

            const rewards = [];
            
            // Check for channel unlocks
            if (config.levelChannels.includes(newLevel)) {
                await createLevelChannel(message.guild, newLevel);
                rewards.push(`🔓 Unlocked #level-${newLevel} channel`);
            }

            // Level 10 namecolor unlock
            if (newLevel === 10) {
                rewards.push('🎨 Unlocked !namecolor command');
            }

            // Level milestones
            if (newLevel % 10 === 0) {
                rewards.push('🎉 Milestone reward: 1000 Bobby Bucks!');
                // Award Bobby Bucks if the handler exists
                try {
                    const eggbuckHandler = require('./eggbuckHandler');
                    // This would need to be implemented if Bobby Bucks integration is desired
                } catch (error) {
                    // Bobby Bucks handler not available
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('🎉 LEVEL UP!')
                .setColor(getLevelColor(newLevel))
                .setDescription(`🎊 **${message.author.username}** reached **Level ${newLevel}**! 🎊`)
                .setImage('attachment://level-up.png')
                .addFields(
                    { name: '📈 Level Progress', value: `Level ${oldLevel} → Level ${newLevel}`, inline: true },
                    { name: '🎁 Rewards', value: rewards.length > 0 ? rewards.join('\n') : 'Keep leveling for more rewards!', inline: false }
                )
                .setFooter({ text: 'Congratulations on your progress!' })
                .setTimestamp();

            await message.channel.send({ 
                content: `🎉 ${message.author}`,
                embeds: [embed], 
                files: [attachment] 
            });

            console.log(`🎉 ${message.author.tag} leveled up to Level ${newLevel}`);

        } catch (error) {
            console.error('Error handling level up:', error);
        }
    }

    // Create level channel
    async function createLevelChannel(guild, level) {
        try {
            const channelName = `level-${level}`;
            const existingChannel = guild.channels.cache.find(channel => channel.name === channelName);
            
            if (existingChannel) return existingChannel;

            const channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                topic: `Exclusive chat for Level ${level}+ members! 🎉`,
                reason: `Level ${level} channel unlock`
            });

            // Set permissions - only Level ${level}+ can see/send messages
            await channel.permissionOverwrites.edit(guild.roles.everyone, {
                ViewChannel: false,
                SendMessages: false
            });

            // Position channel appropriately
            const categoryChannel = guild.channels.cache.find(c => 
                c.type === ChannelType.GuildCategory && 
                (c.name.toLowerCase().includes('level') || c.name.toLowerCase().includes('rank'))
            );

            if (categoryChannel) {
                await channel.setParent(categoryChannel);
            }

            console.log(`🔓 Created level channel: #${channelName}`);
            return channel;

        } catch (error) {
            console.error(`Error creating level ${level} channel:`, error);
        }
    }

    // Assign color role
    async function assignColorRole(message, member, colorName, colorHex) {
        try {
            // Remove existing color role
            const existingColorRole = member.roles.cache.find(role => 
                role.name.startsWith(config.colorRolePrefix)
            );

            if (existingColorRole) {
                await member.roles.remove(existingColorRole, 'Changing color role');
                
                // Delete role if nobody else has it
                if (existingColorRole.members.size === 0) {
                    await existingColorRole.delete('No longer in use');
                }
            }

            // Create or find new color role
            const roleName = config.colorRolePrefix + colorName;
            let colorRole = message.guild.roles.cache.find(role => role.name === roleName);

            if (!colorRole) {
                colorRole = await message.guild.roles.create({
                    name: roleName,
                    color: colorHex,
                    reason: `Level 10+ name color: ${colorName}`,
                    permissions: []
                });

                // Position role appropriately
                const colorRolesCategory = message.guild.roles.cache.find(role => 
                    role.name === '-- COLOR ROLES --'
                );
                if (colorRolesCategory) {
                    await colorRole.setPosition(colorRolesCategory.position - 1);
                }
            }

            // Assign role to user
            await member.roles.add(colorRole, 'Level 10+ name color');

            // Save color role data
            saveColorRoleData(member.id, { colorName, colorHex, roleId: colorRole.id });

            const successEmbed = new EmbedBuilder()
                .setTitle('🎨 Name Color Updated!')
                .setColor(colorHex)
                .setDescription(`Your name is now **${colorName}** colored!`)
                .addFields(
                    { name: '🎨 Color', value: colorName.charAt(0).toUpperCase() + colorName.slice(1), inline: true },
                    { name: '🏷️ Role', value: roleName, inline: true },
                    { name: '💡 Pro Tip', value: 'Use `!namecolor` to change colors anytime!', inline: false }
                )
                .setThumbnail(member.user.displayAvatarURL())
                .setFooter({ text: 'Level 10+ Perk Activated' })
                .setTimestamp();

            await message.channel.send({ embeds: [successEmbed] });

            console.log(`🎨 Assigned color role ${colorName} to ${member.user.tag}`);

        } catch (error) {
            console.error('Error assigning color role:', error);
            message.channel.send('❌ Failed to assign color role. Please contact a moderator.');
        }
    }

    // Create level card visualization
    async function createLevelCard(user, userData, level, progressXP, neededXP) {
        const canvas = createCanvas(600, 300);
        const ctx = canvas.getContext('2d');
        
        // Background gradient based on level
        const gradient = ctx.createLinearGradient(0, 0, 600, 300);
        const levelColor = getLevelColor(level);
        gradient.addColorStop(0, levelColor);
        gradient.addColorStop(1, darkenColor(levelColor, 0.3));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 300);
        
        // Level-based decorative effects
        if (level >= 50) {
            // Diamond sparkles for high levels
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            for (let i = 0; i < 30; i++) {
                const x = Math.random() * 600;
                const y = Math.random() * 300;
                const size = Math.random() * 3 + 1;
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (level >= 25) {
            // Star pattern for mid-high levels
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 8; i++) {
                const angle = (i * Math.PI * 2) / 8;
                const centerX = 300;
                const centerY = 150;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(centerX + Math.cos(angle) * 100, centerY + Math.sin(angle) * 60);
                ctx.stroke();
            }
        } else if (level >= 10) {
            // Subtle dots for mid levels
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            for (let x = 40; x < 600; x += 80) {
                for (let y = 40; y < 300; y += 80) {
                    ctx.beginPath();
                    ctx.arc(x, y, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        
        // Border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeRect(8, 8, 584, 284);
        
        try {
            // User avatar
            const avatarURL = user.displayAvatarURL({ extension: 'png', size: 128 });
            const avatar = await loadImageFromURL(avatarURL);
            
            // Avatar with level-based effects
            if (level >= 25) {
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 20;
            }
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(100, 100, 50, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, 50, 50, 100, 100);
            ctx.restore();
            
            ctx.shadowBlur = 0;
            
            // Avatar border
            ctx.strokeStyle = level >= 10 ? '#ffd700' : '#ffffff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(100, 100, 50, 0, Math.PI * 2);
            ctx.stroke();
            
        } catch (error) {
            // Fallback avatar
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(100, 100, 50, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = levelColor;
            ctx.font = '40px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('👤', 100, 115);
        }
        
        // Username
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(user.username, 180, 60);
        
        // Level
        ctx.font = 'bold 48px Arial';
        if (level >= 50) {
            // Rainbow effect for very high levels
            const rainbow = ctx.createLinearGradient(180, 90, 380, 90);
            rainbow.addColorStop(0, '#ff0000');
            rainbow.addColorStop(0.16, '#ff8000');
            rainbow.addColorStop(0.33, '#ffff00');
            rainbow.addColorStop(0.5, '#00ff00');
            rainbow.addColorStop(0.66, '#0000ff');
            rainbow.addColorStop(0.83, '#8000ff');
            rainbow.addColorStop(1, '#ff0080');
            ctx.fillStyle = rainbow;
        } else {
            ctx.fillStyle = '#ffffff';
        }
        ctx.fillText(`LEVEL ${level}`, 180, 110);
        
        // XP Info
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Arial';
        ctx.fillText(`${userData.xp.toLocaleString()} Total XP`, 180, 140);
        ctx.fillText(`${userData.messages.toLocaleString()} Messages`, 180, 165);
        
        // Progress bar
        const barX = 50;
        const barY = 220;
        const barWidth = 500;
        const barHeight = 30;
        const progress = progressXP / neededXP;
        
        // Progress bar background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Progress bar fill
        const progressGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
        progressGradient.addColorStop(0, '#00ff88');
        progressGradient.addColorStop(1, '#00cc66');
        ctx.fillStyle = progressGradient;
        ctx.fillRect(barX, barY, barWidth * progress, barHeight);
        
        // Progress bar border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        
        // Progress text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${progressXP}/${neededXP} XP`, 300, 270);
        
        return canvas;
    }

    // Create level up card
    async function createLevelUpCard(user, newLevel, oldLevel) {
        const canvas = createCanvas(500, 400);
        const ctx = canvas.getContext('2d');
        
        // Celebration background
        const gradient = ctx.createRadialGradient(250, 200, 0, 250, 200, 300);
        gradient.addColorStop(0, '#ffd700');
        gradient.addColorStop(0.5, '#ff8c00');
        gradient.addColorStop(1, '#ff4500');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 500, 400);
        
        // Celebration particles
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 60; i++) {
            const x = Math.random() * 500;
            const y = Math.random() * 400;
            const size = Math.random() * 4 + 1;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Confetti
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * 500;
            const y = Math.random() * 400;
            const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.fillRect(x, y, 8, 8);
        }
        
        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 5;
        ctx.fillText('🎉 LEVEL UP! 🎉', 250, 80);
        ctx.shadowBlur = 0;
        
        try {
            // User avatar
            const avatarURL = user.displayAvatarURL({ extension: 'png', size: 128 });
            const avatar = await loadImageFromURL(avatarURL);
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(250, 170, 60, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, 190, 110, 120, 120);
            ctx.restore();
            
            // Glowing avatar border
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur = 20;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(250, 170, 60, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
            
        } catch (error) {
            // Fallback avatar
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(250, 170, 60, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffd700';
            ctx.font = '50px Arial';
            ctx.fillText('🎊', 250, 185);
        }
        
        // Username
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(user.username, 250, 270);
        
        // Level progression
        ctx.font = 'bold 32px Arial';
        ctx.fillText(`Level ${oldLevel} → Level ${newLevel}`, 250, 320);
        
        // Congratulations
        ctx.font = '18px Arial';
        ctx.fillText('Congratulations on your progress!', 250, 360);
        
        return canvas;
    }

    // Create leaderboard visualization
    async function createLeaderboard(topUsers, guild) {
        const canvas = createCanvas(700, 400 + (topUsers.length * 40));
        const ctx = canvas.getContext('2d');
        
        // Background
        const gradient = ctx.createLinearGradient(0, 0, 700, canvas.height);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 700, canvas.height);
        
        // Header
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🏆 LEVEL LEADERBOARD', 350, 50);
        
        // Server name
        ctx.fillStyle = '#ffffff';
        ctx.font = '20px Arial';
        ctx.fillText(guild.name, 350, 85);
        
        // Header divider
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(50, 100, 600, 3);
        
        // Leaderboard entries
        for (let i = 0; i < topUsers.length; i++) {
            const user = topUsers[i];
            const y = 150 + (i * 40);
            
            // Rank background
            let rankColor = '#4a4a4a';
            if (i === 0) rankColor = '#ffd700'; // Gold
            else if (i === 1) rankColor = '#c0c0c0'; // Silver
            else if (i === 2) rankColor = '#cd7f32'; // Bronze
            
            ctx.fillStyle = rankColor;
            ctx.fillRect(60, y - 25, 50, 35);
            
            // Rank
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'center';
            const rankEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
            ctx.fillText(rankEmoji, 85, y - 5);
            
            // Username
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(user.username, 130, y - 5);
            
            // Level
            ctx.fillStyle = getLevelColor(user.level);
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(`Level ${user.level}`, 480, y - 5);
            
            // XP
            ctx.fillStyle = '#cccccc';
            ctx.font = '16px Arial';
            ctx.fillText(`${user.xp.toLocaleString()} XP`, 620, y - 5);
            
            // Separator line
            if (i < topUsers.length - 1) {
                ctx.strokeStyle = '#444444';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(60, y + 15);
                ctx.lineTo(640, y + 15);
                ctx.stroke();
            }
        }
        
        return canvas;
    }

    // Create statistics card
    async function createStatsCard(stats) {
        const canvas = createCanvas(600, 400);
        const ctx = canvas.getContext('2d');
        
        // Background
        const gradient = ctx.createLinearGradient(0, 0, 600, 400);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(1, '#764ba2');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 400);
        
        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('📊 LEVELING STATISTICS', 300, 40);
        
        // Stats boxes
        const statBoxes = [
            { label: 'Active Users', value: stats.totalUsers.toString(), color: '#3498db' },
            { label: 'Total XP', value: stats.totalXP.toLocaleString(), color: '#e74c3c' },
            { label: 'Messages Sent', value: stats.totalMessages.toLocaleString(), color: '#2ecc71' },
            { label: 'Highest Level', value: `Level ${stats.highestLevel}`, color: '#f39c12' },
            { label: 'Average Level', value: `Level ${stats.averageLevel}`, color: '#9b59b6' },
            { label: 'Colored Names', value: stats.coloredUsers.toString(), color: '#e67e22' }
        ];
        
        statBoxes.forEach((box, index) => {
            const col = index % 3;
            const row = Math.floor(index / 3);
            const x = 50 + col * 170;
            const y = 100 + row * 120;
            
            // Box background
            ctx.fillStyle = box.color;
            ctx.fillRect(x, y, 150, 80);
            
            // Box border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, 150, 80);
            
            // Label
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(box.label, x + 75, y + 25);
            
            // Value
            ctx.font = 'bold 18px Arial';
            ctx.fillText(box.value, x + 75, y + 55);
        });
        
        return canvas;
    }

    // User data functions
    function getUserData(userId) {
        if (!fs.existsSync(levelingFilePath)) {
            fs.writeFileSync(levelingFilePath, '', 'utf-8');
        }
        
        const data = fs.readFileSync(levelingFilePath, 'utf-8');
        const userRecord = data.split('\n').find(line => line.startsWith(userId));
        
        if (userRecord) {
            const [id, xp, messages] = userRecord.split(':');
            return {
                xp: parseInt(xp) || 0,
                messages: parseInt(messages) || 0
            };
        }
        
        return { xp: 0, messages: 0 };
    }

    function saveUserData(userId, userData) {
        if (!fs.existsSync(levelingFilePath)) {
            fs.writeFileSync(levelingFilePath, '', 'utf-8');
        }
        
        let data = fs.readFileSync(levelingFilePath, 'utf-8').trim();
        const newRecord = `${userId}:${userData.xp}:${userData.messages}`;
        
        const lines = data.split('\n').filter(line => line.trim() !== '');
        const existingIndex = lines.findIndex(line => line.startsWith(userId + ':'));
        
        if (existingIndex !== -1) {
            lines[existingIndex] = newRecord;
        } else {
            lines.push(newRecord);
        }
        
        fs.writeFileSync(levelingFilePath, lines.join('\n'), 'utf-8');
    }

    function saveColorRoleData(userId, colorData) {
        if (!fs.existsSync(colorRolesFilePath)) {
            fs.writeFileSync(colorRolesFilePath, '', 'utf-8');
        }
        
        let data = fs.readFileSync(colorRolesFilePath, 'utf-8').trim();
        const newRecord = `${userId}:${colorData.colorName}:${colorData.colorHex}:${colorData.roleId}`;
        
        const lines = data.split('\n').filter(line => line.trim() !== '');
        const existingIndex = lines.findIndex(line => line.startsWith(userId + ':'));
        
        if (existingIndex !== -1) {
            lines[existingIndex] = newRecord;
        } else {
            lines.push(newRecord);
        }

        fs.writeFileSync(colorRolesFilePath, lines.join('\n'), 'utf-8');
    }

    // Level calculation (balanced formula)
    function calculateLevel(xp) {
        return Math.floor(0.1 * Math.sqrt(xp));
    }

    function getXPForLevel(level) {
        return Math.pow(level / 0.1, 2);
    }

    // Get top users for leaderboard
    async function getTopUsers(guild, limit = 10) {
        if (!fs.existsSync(levelingFilePath)) {
            return [];
        }
        
        const data = fs.readFileSync(levelingFilePath, 'utf-8').trim();
        if (!data) return [];
        
        const users = [];
        const lines = data.split('\n').filter(line => line.includes(':'));
        
        for (const line of lines) {
            const [userId, xp, messages] = line.split(':');
            const member = guild.members.cache.get(userId);
            
            if (member && !member.user.bot) {
                users.push({
                    userId,
                    username: member.user.username,
                    xp: parseInt(xp) || 0,
                    messages: parseInt(messages) || 0,
                    level: calculateLevel(parseInt(xp) || 0)
                });
            }
        }
        
        return users.sort((a, b) => b.xp - a.xp).slice(0, limit);
    }

    // Get user rank
    function getUserRank(userId, guild) {
        if (!fs.existsSync(levelingFilePath)) {
            return 1;
        }
        
        const data = fs.readFileSync(levelingFilePath, 'utf-8').trim();
        if (!data) return 1;
        
        const users = [];
        const lines = data.split('\n').filter(line => line.includes(':'));
        
        for (const line of lines) {
            const [uid, xp] = line.split(':');
            const member = guild.members.cache.get(uid);
            
            if (member && !member.user.bot) {
                users.push({ userId: uid, xp: parseInt(xp) || 0 });
            }
        }
        
        users.sort((a, b) => b.xp - a.xp);
        const userIndex = users.findIndex(user => user.userId === userId);
        return userIndex === -1 ? users.length + 1 : userIndex + 1;
    }

    // Get total XP across all users
    function getTotalXP() {
        if (!fs.existsSync(levelingFilePath)) {
            return 0;
        }
        
        const data = fs.readFileSync(levelingFilePath, 'utf-8').trim();
        if (!data) return 0;
        
        const lines = data.split('\n').filter(line => line.includes(':'));
        return lines.reduce((total, line) => {
            const [, xp] = line.split(':');
            return total + (parseInt(xp) || 0);
        }, 0);
    }

    // Get leveling statistics
    function getLevelingStats(guild) {
        if (!fs.existsSync(levelingFilePath)) {
            return {
                totalUsers: 0,
                totalXP: 0,
                totalMessages: 0,
                highestLevel: 0,
                averageLevel: 0,
                coloredUsers: 0
            };
        }
        
        const data = fs.readFileSync(levelingFilePath, 'utf-8').trim();
        if (!data) return {
            totalUsers: 0,
            totalXP: 0,
            totalMessages: 0,
            highestLevel: 0,
            averageLevel: 0,
            coloredUsers: 0
        };
        
        const lines = data.split('\n').filter(line => line.includes(':'));
        let totalXP = 0;
        let totalMessages = 0;
        let totalLevels = 0;
        let highestLevel = 0;
        let validUsers = 0;
        
        for (const line of lines) {
            const [userId, xp, messages] = line.split(':');
            const member = guild.members.cache.get(userId);
            
            if (member && !member.user.bot) {
                const userXP = parseInt(xp) || 0;
                const userMessages = parseInt(messages) || 0;
                const userLevel = calculateLevel(userXP);
                
                totalXP += userXP;
                totalMessages += userMessages;
                totalLevels += userLevel;
                highestLevel = Math.max(highestLevel, userLevel);
                validUsers++;
            }
        }
        
        // Count colored users
        let coloredUsers = 0;
        if (fs.existsSync(colorRolesFilePath)) {
            const colorData = fs.readFileSync(colorRolesFilePath, 'utf-8').trim();
            if (colorData) {
                coloredUsers = colorData.split('\n').filter(line => line.includes(':')).length;
            }
        }
        
        return {
            totalUsers: validUsers,
            totalXP,
            totalMessages,
            highestLevel,
            averageLevel: validUsers > 0 ? Math.floor(totalLevels / validUsers) : 0,
            coloredUsers
        };
    }

    // Get unlocked features for a level
    function getUnlockedFeatures(level) {
        const features = [];
        
        if (level >= 10) features.push('🎨 Name Colors');
        
        for (const channelLevel of config.levelChannels) {
            if (level >= channelLevel) {
                features.push(`🔓 Level ${channelLevel} Chat`);
            }
        }
        
        if (level >= 10) features.push('🏆 Level Prestige');
        if (level >= 25) features.push('⭐ Elite Member');
        if (level >= 50) features.push('💎 Legend Status');
        
        return features.length > 0 ? features.slice(-3).join('\n') : 'Chat to unlock more!';
    }

    // Get level-based color
    function getLevelColor(level) {
        if (level >= 50) return '#ff00ff'; // Magenta for legends
        if (level >= 25) return '#ffd700'; // Gold for elite
        if (level >= 10) return '#00ff00'; // Green for color users/prestige
        if (level >= 5) return '#00ffff'; // Cyan for channel access
        return '#4a90e2'; // Blue for beginners
    }

    // Darken color utility
    function darkenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - Math.floor(255 * amount));
        const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - Math.floor(255 * amount));
        const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - Math.floor(255 * amount));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
};