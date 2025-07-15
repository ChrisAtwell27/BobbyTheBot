const { Collection, PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = (client) => {
    // Configuration options
    const config = {
        deadRoleName: 'dead.',
        graveyardChannelName: 'the-graveyard', // Channel where dead users can see
        spamThreshold: 2, // Number of channels for spam detection
        timeWindow: 30000, // 30 seconds window
        maxWarnings: 3,
        logChannelId: null // Set this to your log channel ID if you want logging
    };
    
    // Track user messages for spam detection
    const userMessages = new Collection();
    const userWarnings = new Collection();
    
    console.log('🛡️ Moderation Handler initialized');
    
    // Listen for messages
    client.on('messageCreate', async (message) => {
        // Ignore bots and system messages
        if (message.author.bot || message.system) return;
        
        // Ignore DMs
        if (!message.guild) return;
        
        // Ignore commands (messages starting with !)
        if (message.content.startsWith('!')) return;
        
        // Ignore empty messages or messages with only embeds/attachments
        if (!message.content.trim()) return;
        
        try {
            await checkForSpam(message);
        } catch (error) {
            console.error('Error in moderation handler:', error);
        }
    });
    
    // Clean up old message data every 5 minutes
    setInterval(() => {
        cleanupOldData();
    }, 5 * 60 * 1000);
    
    // Function to check for spam
    async function checkForSpam(message) {
        const userId = message.author.id;
        const messageContent = message.content.toLowerCase().trim();
        const currentTime = Date.now();
        
        // Initialize user data if doesn't exist
        if (!userMessages.has(userId)) {
            userMessages.set(userId, []);
        }
        
        const userMessageHistory = userMessages.get(userId);
        
        // Add current message to history
        userMessageHistory.push({
            content: messageContent,
            channelId: message.channel.id,
            messageId: message.id,
            timestamp: currentTime,
            message: message
        });
        
        // Remove old messages outside time window
        const recentMessages = userMessageHistory.filter(
            msg => currentTime - msg.timestamp <= config.timeWindow
        );
        
        userMessages.set(userId, recentMessages);
        
        // Check for spam (same message in multiple channels)
        const duplicateMessages = recentMessages.filter(msg => msg.content === messageContent);
        const uniqueChannels = new Set(duplicateMessages.map(msg => msg.channelId));
        
        if (uniqueChannels.size >= config.spamThreshold) {
            await handleSpamDetection(message, duplicateMessages);
        }
    }
    
    // Function to handle spam detection
    async function handleSpamDetection(triggerMessage, duplicateMessages) {
        const user = triggerMessage.author;
        const guild = triggerMessage.guild;
        
        try {
            // Delete all duplicate messages
            const deletedChannels = new Set();
            for (const msgData of duplicateMessages) {
                try {
                    const channel = guild.channels.cache.get(msgData.channelId);
                    if (channel && msgData.message) {
                        await msgData.message.delete();
                        deletedChannels.add(channel.name);
                    }
                } catch (deleteError) {
                    console.error(`Failed to delete message in channel ${msgData.channelId}:`, deleteError);
                }
            }
            
            // Give user the Dead. role
            await assignDeadRole(guild.members.cache.get(user.id));
            
            // Log the action
            await logModerationAction({
                type: 'SPAM_DETECTION',
                user: user,
                reason: `Sent same message in ${deletedChannels.size} channels: "${duplicateMessages[0].content.substring(0, 100)}..."`,
                channels: Array.from(deletedChannels),
                guild: guild
            });
            
            // Clear user's message history to prevent multiple triggers
            userMessages.delete(user.id);
            
            console.log(`🚨 Spam detected: ${user.tag} sent duplicate messages across ${deletedChannels.size} channels`);
            
        } catch (error) {
            console.error('Error handling spam detection:', error);
        }
    }
    
    // Function to assign Dead. role
    async function assignDeadRole(member) {
        if (!member) return false;
        
        try {
            // Find the Dead. role
            let deadRole = member.guild.roles.cache.find(role => role.name === config.deadRoleName);
            
            // Create the role if it doesn't exist
            if (!deadRole) {
                deadRole = await createDeadRole(member.guild);
            }
            
            // Check if user already has the role
            if (member.roles.cache.has(deadRole.id)) {
                return false;
            }
            
            // Add the role
            await member.roles.add(deadRole, 'Moderation: Spam detection');
            
            // Send notification to graveyard channel
            try {
                const graveyardChannel = member.guild.channels.cache.find(channel => 
                    channel.name === config.graveyardChannelName
                );
                
                if (graveyardChannel && graveyardChannel.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setColor(0xFF6B6B)
                        .setTitle('💀 Welcome to the Graveyard')
                        .setDescription(`**${member.user.tag}** has been given the "${config.deadRoleName}" role for spam behavior.`)
                        .addFields(
                            { name: '⚠️ Reason', value: 'Sending identical messages across multiple channels', inline: false },
                            { name: '📞 Appeal Process', value: 'Contact a moderator if you believe this was a mistake', inline: false },
                            { name: '🔄 Next Steps', value: 'Please review the server rules and wait for a moderator to assist you', inline: false }
                        )
                        .setTimestamp()
                        .setFooter({ text: 'Moderation System' });
                    
                    if (member.user.displayAvatarURL) {
                        embed.setThumbnail(member.user.displayAvatarURL());
                    }
                    
                    await graveyardChannel.send({ 
                        content: `${member.user}`, // Ping the user so they see it
                        embeds: [embed] 
                    });
                } else {
                    console.log(`Could not find graveyard channel: ${config.graveyardChannelName}`);
                }
            } catch (graveyardError) {
                console.error(`Could not send message to graveyard channel:`, graveyardError);
            }
            
            return true;
        } catch (error) {
            console.error('Error assigning dead role:', error);
            return false;
        }
    }
    
    // Function to create Dead. role
    async function createDeadRole(guild) {
        try {
            const deadRole = await guild.roles.create({
                name: config.deadRoleName,
                color: '#2C2C2C', // Dark gray color
                reason: 'Moderation: Auto-created dead role',
                permissions: []
            });
            
            // Update channel permissions to restrict the dead role
            for (const [channelId, channel] of guild.channels.cache) {
                if (channel.isTextBased() && channel.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.ManageChannels)) {
                    try {
                        await channel.permissionOverwrites.create(deadRole, {
                            SendMessages: false,
                            AddReactions: false,
                            CreatePublicThreads: false,
                            CreatePrivateThreads: false,
                            SendMessagesInThreads: false
                        });
                    } catch (permError) {
                        console.error(`Could not update permissions for channel ${channel.name}:`, permError);
                    }
                }
            }
            
            console.log(`✅ Created dead role: ${config.deadRoleName}`);
            return deadRole;
        } catch (error) {
            console.error('Error creating dead role:', error);
            throw error;
        }
    }
    
    // Function to log moderation actions
    async function logModerationAction(data) {
        const { type, user, reason, channels, guild } = data;
        
        // Console log
        console.log(`📋 Moderation Action: ${type} - ${user.tag} - ${reason}`);
        
        // Try to log to specified channel
        if (config.logChannelId) {
            try {
                const logChannel = guild.channels.cache.get(config.logChannelId);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(0xFF6B6B) // Red color
                        .setTitle('🛡️ Moderation Action')
                        .addFields(
                            { name: 'Action', value: type, inline: true },
                            { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                            { name: 'Reason', value: reason, inline: false }
                        )
                        .setTimestamp()
                        .setFooter({ text: 'Moderation Handler' });
                    
                    if (channels && channels.length > 0) {
                        embed.addFields({ name: 'Affected Channels', value: channels.join(', '), inline: false });
                    }
                    
                    await logChannel.send({ embeds: [embed] });
                }
            } catch (logError) {
                console.error('Error sending log message:', logError);
            }
        }
    }
    
    // Function to clean up old data
    function cleanupOldData() {
        const currentTime = Date.now();
        let cleanedUsers = 0;
        
        for (const [userId, messages] of userMessages) {
            const recentMessages = messages.filter(
                msg => currentTime - msg.timestamp <= config.timeWindow
            );
            
            if (recentMessages.length === 0) {
                userMessages.delete(userId);
                cleanedUsers++;
            } else {
                userMessages.set(userId, recentMessages);
            }
        }
        
        if (cleanedUsers > 0) {
            console.log(`🧹 Cleaned up data for ${cleanedUsers} users`);
        }
    }
    
    // Command to manually remove dead role
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!message.guild) return;
        
        const args = message.content.split(' ');
        
        // Command to remove dead role from a user
        if (args[0] === '!undead') {
            // Check if user has permission (admin or manage roles)
            if (!message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                return message.channel.send('❌ You need the "Manage Roles" permission to use this command.');
            }
            
            let targetMember;
            if (args[1]) {
                const mentionedUser = message.mentions.users.first() || message.guild.members.cache.find(member => member.user.username === args[1])?.user;
                if (!mentionedUser) {
                    return message.channel.send('❌ User not found.');
                }
                targetMember = message.guild.members.cache.get(mentionedUser.id);
            } else {
                return message.channel.send('❌ Please mention a user or provide their username.');
            }
            
            if (!targetMember) {
                return message.channel.send('❌ Could not find that member in this server.');
            }
            
            // Remove dead role
            const success = await removeDeadRole(targetMember);
            if (success) {
                message.channel.send(`✅ Removed the "${config.deadRoleName}" role from ${targetMember.user.tag}.`);
                
                // Log the action
                await logModerationAction({
                    type: 'ROLE_REMOVAL',
                    user: targetMember.user,
                    reason: `Dead role manually removed by ${message.author.tag}`,
                    channels: [],
                    guild: message.guild
                });
            } else {
                message.channel.send(`❌ ${targetMember.user.tag} doesn't have the "${config.deadRoleName}" role.`);
            }
        }
        
        // Command to check user stats
        if (args[0] === '!modstats') {
            let targetUser = message.author;
            if (args[1]) {
                const mentionedUser = message.mentions.users.first() || message.guild.members.cache.find(member => member.user.username === args[1])?.user;
                if (mentionedUser) {
                    targetUser = mentionedUser;
                }
            }
            
            const stats = getUserStats(targetUser.id, message.guild);
            const targetMember = message.guild.members.cache.get(targetUser.id);
            
            const embed = new EmbedBuilder()
                .setColor(0x4A90E2)
                .setTitle('📊 Moderation Stats')
                .setDescription(`**User:** ${targetUser.tag}`)
                .addFields(
                    { name: '📝 Recent Messages Tracked', value: `${stats.recentMessages}`, inline: true },
                    { name: '⚠️ Warnings', value: `${stats.warnings}`, inline: true },
                    { name: '💀 Has Dead Role', value: stats.hasDeadRole ? 'Yes' : 'No', inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Moderation Handler' });
            
            if (targetUser.displayAvatarURL) {
                embed.setThumbnail(targetUser.displayAvatarURL());
            }
            
            message.channel.send({ embeds: [embed] });
        }
    });
    
    // Function to remove dead role manually
    async function removeDeadRole(member) {
        try {
            const deadRole = member.guild.roles.cache.find(role => role.name === config.deadRoleName);
            if (deadRole && member.roles.cache.has(deadRole.id)) {
                await member.roles.remove(deadRole, 'Manual moderation: Role removed');
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error removing dead role:', error);
            return false;
        }
    }
    
    // Function to get user stats
    function getUserStats(userId, guild) {
        const messages = userMessages.get(userId) || [];
        const warnings = userWarnings.get(userId) || 0;
        const member = guild.members.cache.get(userId);
        const deadRole = guild.roles.cache.find(role => role.name === config.deadRoleName);
        const hasDeadRole = member && deadRole ? member.roles.cache.has(deadRole.id) : false;
        
        return {
            recentMessages: messages.length,
            warnings: warnings,
            hasDeadRole: hasDeadRole
        };
    }
};