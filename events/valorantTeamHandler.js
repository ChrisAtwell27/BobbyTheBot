const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const https = require('https');

// Import functions from the API handler (with persistent storage)
const apiHandler = require('./valorantApiHandler');

// Configuration - Update this with your actual Valorant role ID
const VALORANT_ROLE_ID = '1058201257338228757'; // Replace with actual @Valorant role ID

// Debug function to help find your role ID
function findValorantRole(message) {
    const valorantRoles = message.guild.roles.cache.filter(role => 
        role.name.toLowerCase().includes('valorant')
    );
    
    if (valorantRoles.size > 0) {
        console.log('Found Valorant-related roles:');
        valorantRoles.forEach(role => {
            console.log(`- Role: "${role.name}" | ID: ${role.id}`);
        });
    } else {
        console.log('No Valorant-related roles found');
    }
}

// Store active teams (in production, consider using a database)
const activeTeams = new Map();

// Resend interval in milliseconds (10 minutes)
const RESEND_INTERVAL = 10 * 60 * 1000;

// Function to load image from URL with timeout
async function loadImageFromURL(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, { timeout: 5000 }, (res) => {
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
        });
        
        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Image load timeout'));
        });
        
        request.on('error', reject);
    });
}

// Function to get user rank information (now uses persistent storage)
async function getUserRankInfo(userId) {
    try {
        const registration = apiHandler.getUserRegistration(userId);
        if (!registration) {
            console.log(`No registration found for user ${userId}`);
            return null;
        }

        const rankData = await apiHandler.getUserRankData(userId);
        if (!rankData) {
            console.log(`No rank data found for user ${userId}`);
            return null;
        }

        const rankInfo = apiHandler.RANK_MAPPING[rankData.currenttier] || apiHandler.RANK_MAPPING[0];
        return {
            ...rankInfo,
            tier: rankData.currenttier,
            rr: rankData.ranking_in_tier
        };
    } catch (error) {
        console.error('Error getting user rank info:', error);
        return null;
    }
}

// Enhanced function to create team visualization with ranks (now with persistent storage)
async function createTeamVisualization(team) {
    const canvas = createCanvas(700, 220);
    const ctx = canvas.getContext('2d');
    
    // Enhanced background gradient
    const gradient = ctx.createLinearGradient(0, 0, 700, 220);
    gradient.addColorStop(0, '#0a0e13');
    gradient.addColorStop(0.3, '#1e2328');
    gradient.addColorStop(0.7, '#2c3e50');
    gradient.addColorStop(1, '#0a0e13');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 700, 220);
    
    // Add subtle pattern overlay
    ctx.fillStyle = 'rgba(255, 70, 84, 0.05)';
    for (let i = 0; i < 700; i += 30) {
        for (let j = 0; j < 220; j += 30) {
            if ((i + j) % 60 === 0) {
                ctx.fillRect(i, j, 15, 15);
            }
        }
    }
    
    // Enhanced Valorant-style accent
    const accentGradient = ctx.createLinearGradient(0, 0, 700, 0);
    accentGradient.addColorStop(0, '#ff4654');
    accentGradient.addColorStop(0.5, '#ff6b7a');
    accentGradient.addColorStop(1, '#ff4654');
    ctx.fillStyle = accentGradient;
    ctx.fillRect(0, 0, 700, 6);
    ctx.fillRect(0, 214, 700, 6);
    
    // Enhanced title with glow effect
    ctx.shadowColor = '#ff4654';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎯 VALORANT TEAM BUILDER', 350, 40);
    ctx.shadowBlur = 0;
    
    // Team status
    const totalMembers = getTotalMembers(team);
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = totalMembers >= 5 ? '#00ff88' : '#ffaa00';
    ctx.fillText(`${totalMembers}/5 PLAYERS READY`, 350, 65);
    
    // Team member slots with enhanced styling
    const slotWidth = 120;
    const slotHeight = 120;
    const startX = 40;
    const startY = 75;
    const spacing = 130;
    
    const allMembers = [team.leader, ...team.members];
    
    for (let i = 0; i < 5; i++) {
        const x = startX + (i * spacing);
        const y = startY;
        
        // Enhanced slot background with gradient
        const slotGradient = ctx.createLinearGradient(x, y, x, y + slotHeight);
        if (allMembers[i]) {
            slotGradient.addColorStop(0, 'rgba(255, 70, 84, 0.3)');
            slotGradient.addColorStop(1, 'rgba(255, 70, 84, 0.1)');
        } else {
            slotGradient.addColorStop(0, 'rgba(60, 60, 60, 0.5)');
            slotGradient.addColorStop(1, 'rgba(40, 40, 40, 0.5)');
        }
        ctx.fillStyle = slotGradient;
        ctx.fillRect(x - 2, y - 2, slotWidth + 4, slotHeight + 4);
        
        // Slot border
        ctx.strokeStyle = allMembers[i] ? '#ff4654' : '#666666';
        ctx.lineWidth = allMembers[i] ? 3 : 2;
        ctx.strokeRect(x - 2, y - 2, slotWidth + 4, slotHeight + 4);
        
        if (allMembers[i]) {
            try {
                // Get user avatar
                const avatarURL = allMembers[i].avatarURL || 
                    `https://cdn.discordapp.com/embed/avatars/${allMembers[i].id % 5}.png`;
                
                const avatar = await loadImageFromURL(avatarURL);
                
                // Draw circular avatar with glow for leader
                if (i === 0) {
                    ctx.shadowColor = '#ffd700';
                    ctx.shadowBlur = 15;
                }
                
                ctx.save();
                ctx.beginPath();
                ctx.arc(x + slotWidth/2, y + 40, 30, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(avatar, x + slotWidth/2 - 30, y + 10, 60, 60);
                ctx.restore();
                ctx.shadowBlur = 0;
                
                // Enhanced leader crown
                if (i === 0) {
                    ctx.font = '24px Arial';
                    ctx.fillStyle = '#ffd700';
                    ctx.textAlign = 'center';
                    ctx.shadowColor = '#ffd700';
                    ctx.shadowBlur = 5;
                    ctx.fillText('👑', x + slotWidth/2, y - 5);
                    ctx.shadowBlur = 0;
                }
                
                // Enhanced username display
                ctx.font = 'bold 12px Arial';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                const displayName = allMembers[i].displayName || allMembers[i].username;
                const truncatedName = displayName.length > 12 ? 
                    displayName.substring(0, 12) + '...' : displayName;
                ctx.fillText(truncatedName, x + slotWidth/2, y + 85);
                
                // Get and display rank (now from persistent storage)
                const userRankInfo = await getUserRankInfo(allMembers[i].id);
                if (userRankInfo) {
                    console.log(`Rank info for ${allMembers[i].displayName}:`, userRankInfo.name, userRankInfo.rr);
                    
                    // Try to load rank image
                    const rankImage = await apiHandler.loadRankImage(userRankInfo.tier);
                    if (rankImage) {
                        // Draw rank image in bottom right corner of slot
                        ctx.drawImage(rankImage, x + slotWidth - 35, y + slotHeight - 35, 30, 30);
                    } else {
                        // Use fallback rank icon
                        apiHandler.createFallbackRankIcon(ctx, x + slotWidth - 35, y + slotHeight - 35, 30, userRankInfo);
                    }
                    
                    // Show RR if available
                    if (userRankInfo.rr !== undefined) {
                        ctx.font = 'bold 10px Arial';
                        ctx.fillStyle = userRankInfo.color;
                        ctx.textAlign = 'center';
                        ctx.fillText(`${userRankInfo.rr} RR`, x + slotWidth/2, y + 105);
                    }
                } else {
                    // Show "Not Registered" indicator
                    ctx.font = 'bold 9px Arial';
                    ctx.fillStyle = '#888888';
                    ctx.textAlign = 'center';
                    ctx.fillText('Not Registered', x + slotWidth/2, y + 100);
                    ctx.fillText('!valstats', x + slotWidth/2, y + 112);
                }
                
            } catch (error) {
                console.error('Error loading avatar or rank:', error);
                // Enhanced fallback: draw default avatar
                const avatarGradient = ctx.createRadialGradient(x + slotWidth/2, y + 40, 0, x + slotWidth/2, y + 40, 30);
                avatarGradient.addColorStop(0, '#7289da');
                avatarGradient.addColorStop(1, '#5865f2');
                ctx.fillStyle = avatarGradient;
                ctx.beginPath();
                ctx.arc(x + slotWidth/2, y + 40, 30, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.fillStyle = '#ffffff';
                ctx.font = '30px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('👤', x + slotWidth/2, y + 50);
            }
        } else {
            // Enhanced empty slot
            ctx.fillStyle = '#666666';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('LOOKING', x + slotWidth/2, y + slotHeight/2 - 10);
            ctx.fillText('FOR PLAYER', x + slotWidth/2, y + slotHeight/2 + 10);
            
            // Pulsing effect for empty slots (static representation)
            ctx.strokeStyle = 'rgba(255, 70, 84, 0.5)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(x + 10, y + 10, slotWidth - 20, slotHeight - 20);
            ctx.setLineDash([]);
        }
        
        // Enhanced slot number
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${i + 1}`, x + slotWidth/2, y + slotHeight + 15);
    }
    
    return canvas.toBuffer();
}

// Helper function to get total team members
function getTotalMembers(team) {
    return 1 + team.members.length; // 1 for leader + members
}

// Enhanced helper function to create team embed with visual display (now with persistent storage)
async function createTeamEmbed(team) {
    const totalMembers = getTotalMembers(team);
    
    // Create the enhanced visual team display
    const teamImageBuffer = await createTeamVisualization(team);
    const attachment = new AttachmentBuilder(teamImageBuffer, { name: 'team-display.png' });
    
    // Get team leader rank for display (now from persistent storage)
    const leaderRankInfo = await getUserRankInfo(team.leader.id);
    const leaderRankText = leaderRankInfo ? 
        `${leaderRankInfo.name}${leaderRankInfo.rr !== undefined ? ` (${leaderRankInfo.rr} RR)` : ''}` : 
        'Not Registered - Use !valstats';
    
    const embed = new EmbedBuilder()
        .setColor(totalMembers >= 5 ? '#00ff88' : '#ff4654')
        .setTitle('🎯 Valorant Team Builder')
        .setDescription(`**Team Leader:** ${team.leader.displayName}\n**Leader Rank:** ${leaderRankText}\n**Team Status:** ${totalMembers}/5 Players`)
        .setImage('attachment://team-display.png')
        .addFields({
            name: '📋 Team Composition',
            value: await formatEnhancedTeamMembersList(team),
            inline: false
        })
        .setFooter({ 
            text: totalMembers < 5 ? 
                '🔄 Team updates every 10 minutes • Register with !valstats to show your rank!' : 
                'Team is full! Ready to dominate the competition!'
        })
        .setTimestamp();

    return {
        embed: embed,
        files: [attachment]
    };
}

// Helper function to create team buttons (FIXED - use valorant_ prefix)
function createTeamButtons(teamId, isFull) {
    // Extract just the message ID from the full team ID
    const messageId = teamId.replace('valorant_team_', '');
    
    const joinButton = new ButtonBuilder()
        .setCustomId(`valorant_join_${messageId}`)
        .setLabel('Join Team')
        .setStyle(ButtonStyle.Success)
        .setEmoji('➕')
        .setDisabled(isFull);

    const leaveButton = new ButtonBuilder()
        .setCustomId(`valorant_leave_${messageId}`)
        .setLabel('Leave Team')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('➖');

    const disbandButton = new ButtonBuilder()
        .setCustomId(`valorant_disband_${messageId}`)
        .setLabel('Disband Team')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🗑️');

    return new ActionRowBuilder().addComponents(joinButton, leaveButton, disbandButton);
}

// Enhanced helper function to format team members list with ranks (now with persistent storage)
async function formatEnhancedTeamMembersList(team) {
    const members = [];
    
    // Add leader with rank (now from persistent storage)
    const leaderRankInfo = await getUserRankInfo(team.leader.id);
    const leaderRankText = leaderRankInfo ? 
        `(${leaderRankInfo.name}${leaderRankInfo.rr !== undefined ? ` - ${leaderRankInfo.rr} RR` : ''})` : 
        '(Not registered)';
    members.push(`👑 **${team.leader.displayName}** ${leaderRankText}`);
    
    // Add other members with ranks (now from persistent storage)
    for (let i = 0; i < team.members.length; i++) {
        const member = team.members[i];
        const memberRankInfo = await getUserRankInfo(member.id);
        const memberRankText = memberRankInfo ? 
            `(${memberRankInfo.name}${memberRankInfo.rr !== undefined ? ` - ${memberRankInfo.rr} RR` : ''})` : 
            '(Not registered)';
        members.push(`${i + 2}. **${member.displayName}** ${memberRankText}`);
    }

    // Add empty slots count
    const emptySlots = 5 - getTotalMembers(team);
    if (emptySlots > 0) {
        members.push(`\n*🔍 Looking for ${emptySlots} more player${emptySlots > 1 ? 's' : ''}...*`);
        members.push('*Use `!valstats` to register and show your rank!*');
    }

    return members.join('\n');
}

// Helper function to create disbanded embed
function createDisbandedEmbed() {
    return new EmbedBuilder()
        .setColor('#ff0000')
        .setTitle('❌ Team Disbanded')
        .setDescription('This Valorant team has been disbanded by the leader.')
        .addFields({
            name: '🔄 Want to create a new team?',
            value: 'Mention the @Valorant role or use `!valorantteam` to start fresh!',
            inline: false
        })
        .setTimestamp();
}

module.exports = (client) => {
    // Initialize the API handler first
    apiHandler.init(client);

    // Only add event listeners if not already added for team builder
    if (!client._valorantTeamHandlerInitialized) {
        console.log('Enhanced Valorant Team Builder with Persistent Rank Integration loaded!');
        console.log('Features: Visual team display, persistent rank storage, enhanced UI');
        console.log('Data is now loaded from persistent storage in the data folder');

        // Function to resend team message to keep it at the bottom of chat
        async function resendTeamMessage(teamId) {
            const team = activeTeams.get(teamId);
            if (!team) return; // Team no longer exists
            
            try {
                // Get the channel
                const channel = await client.channels.fetch(team.channelId);
                if (!channel) return;
                
                // Create updated embed and components
                const isFull = getTotalMembers(team) >= 5;
                const updatedEmbed = await createTeamEmbed(team);
                const updatedComponents = createTeamButtons(teamId, isFull);
                
                // Delete the old message if it exists
                try {
                    const oldMessage = await channel.messages.fetch(team.messageId);
                    if (oldMessage) await oldMessage.delete();
                } catch (error) {
                    console.log(`Couldn't delete old team message: ${error.message}`);
                }
                
                // Send a new message
                const newMessage = await channel.send({
                    embeds: [updatedEmbed.embed],
                    files: updatedEmbed.files,
                    components: [updatedComponents]
                });
                
                // Update the team with the new message ID
                team.messageId = newMessage.id;
                
                // Set up the next resend timer if team isn't full
                if (!isFull) {
                    // Clear any existing timer
                    if (team.resendTimer) clearTimeout(team.resendTimer);
                    
                    // Set new timer
                    team.resendTimer = setTimeout(() => resendTeamMessage(teamId), RESEND_INTERVAL);
                }
            } catch (error) {
                console.error(`Error resending team message: ${error}`);
            }
        }

        client.on('messageCreate', async (message) => {
            if (message.author.bot) return;

            // Debug command to find Valorant role ID
            if (message.content === '!findrole') {
                findValorantRole(message);
                return message.reply('Check your console for Valorant role information!');
            }

            // Debug: Log all role mentions in the message
            if (message.mentions.roles.size > 0) {
                console.log('Role mentions detected:');
                message.mentions.roles.forEach(role => {
                    console.log(`- ${role.name} (ID: ${role.id})`);
                });
            }

            // Check if message mentions the Valorant role or uses the !Valorant command
            const valorantRoleMention = `<@&${VALORANT_ROLE_ID}>`;
            const isValorantCommand = message.content.toLowerCase() === '!valorantteam';
            if (message.content.includes(valorantRoleMention) || 
                message.mentions.roles.has(VALORANT_ROLE_ID) || 
                isValorantCommand) {
                console.log('Valorant team creation triggered!');
                // Always use a unique and consistent teamId
                const teamId = `valorant_team_${message.id}`;
                // Create new team with the message author as leader
                const team = {
                    id: teamId,
                    leader: {
                        id: message.author.id,
                        username: message.author.username,
                        displayName: message.author.displayName || message.author.username,
                        avatarURL: message.author.displayAvatarURL({ extension: 'png', size: 128 })
                    },
                    members: [],
                    channelId: message.channel.id,
                    messageId: null,
                    resendTimer: null
                };

                // Create the team embed and buttons
                try {
                    const embed = await createTeamEmbed(team);
                    const components = createTeamButtons(teamId, false);
                    
                    const teamMessage = await message.channel.send({
                        embeds: [embed.embed],
                        files: embed.files,
                        components: [components]
                    });
                    // Store the team with message ID immediately after sending
                    team.messageId = teamMessage.id;
                    activeTeams.set(teamId, team);
                    console.log('Team created successfully:', teamId);
                    // Set up the resend timer to keep message at bottom of chat
                    team.resendTimer = setTimeout(() => resendTeamMessage(teamId), RESEND_INTERVAL);

                    // Delete after 30 minutes if team isn't full
                    setTimeout(() => {
                        const currentTeam = activeTeams.get(teamId);
                        if (currentTeam && getTotalMembers(currentTeam) < 5) {
                            // Clear the resend timer before removing
                            if (currentTeam.resendTimer) {
                                clearTimeout(currentTeam.resendTimer);
                            }
                            
                            activeTeams.delete(teamId);
                            
                            // Attempt to delete the most recent message
                            client.channels.fetch(currentTeam.channelId).then(channel => {
                                channel.messages.fetch(currentTeam.messageId).then(msg => {
                                    msg.delete().catch(() => {});
                                }).catch(() => {});
                            }).catch(() => {});
                        }
                    }, 30 * 60 * 1000); // 30 minutes

                } catch (error) {
                    console.error('Error creating team message:', error);
                    message.reply('❌ There was an error creating the team. Please try again in a moment.');
                }
            }
        });

        // Handle button interactions (FIXED - only handle Valorant team buttons)
        client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton()) return;
            
            // CRITICAL FIX: Only handle Valorant team buttons
            if (!interaction.customId.startsWith('valorant_')) {
                return; // Not a Valorant team button, ignore it
            }
            
            const parts = interaction.customId.split('_');
            const action = parts[1]; // valorant_join, valorant_leave, valorant_disband
            const teamId = parts.slice(2).join('_'); // Reconstruct the team ID
            const fullTeamId = `valorant_team_${teamId}`;
            
            const team = activeTeams.get(fullTeamId);
            
            console.log('Valorant Button interaction:', interaction.customId);
            console.log('Parsed action:', action, 'teamId:', fullTeamId);
            console.log('Looking for team:', fullTeamId);

            if (!team) {
                return interaction.reply({
                    content: '❌ This team is no longer active.',
                    ephemeral: true
                });
            }

            const userId = interaction.user.id;
            const userInfo = {
                id: userId,
                username: interaction.user.username,
                displayName: interaction.user.displayName || interaction.user.username,
                avatarURL: interaction.user.displayAvatarURL({ extension: 'png', size: 128 })
            };

            if (action === 'join') {
                // Check if user is already in team
                if (userId === team.leader.id || team.members.some(member => member.id === userId)) {
                    return interaction.reply({
                        content: '❌ You are already in this team!',
                        ephemeral: true
                    });
                }

                // Check if team is full
                if (getTotalMembers(team) >= 5) {
                    return interaction.reply({
                        content: '❌ This team is already full!',
                        ephemeral: true
                    });
                }

                // Add user to team
                team.members.push(userInfo);

                try {
                    // Update the team display first
                    const isFull = getTotalMembers(team) >= 5;
                    const updatedEmbed = await createTeamEmbed(team);
                    const updatedComponents = createTeamButtons(fullTeamId, isFull);

                    await interaction.update({
                        embeds: [updatedEmbed.embed],
                        files: updatedEmbed.files,
                        components: [updatedComponents]
                    });

                    // If team is full, celebrate!
                    if (isFull) {
                        // Clear the resend timer since team is full
                        if (team.resendTimer) {
                            clearTimeout(team.resendTimer);
                            team.resendTimer = null;
                        }
                        
                        // Enhanced celebration with team average rank (now from persistent storage)
                        const teamRanks = [];
                        for (const member of [team.leader, ...team.members]) {
                            const rankInfo = await getUserRankInfo(member.id);
                            if (rankInfo) teamRanks.push(rankInfo);
                        }
                        
                        let teamRankInfo = '';
                        if (teamRanks.length > 0) {
                            const avgTier = Math.round(teamRanks.reduce((sum, rank) => sum + rank.tier, 0) / teamRanks.length);
                            const avgRank = apiHandler.RANK_MAPPING[avgTier] || apiHandler.RANK_MAPPING[0];
                            teamRankInfo = `\n🏆 **Team Average Rank:** ${avgRank.name} (${teamRanks.length}/5 registered)`;
                        }
                        
                        const celebrationEmbed = new EmbedBuilder()
                            .setColor('#00ff00')
                            .setTitle('🎉 TEAM COMPLETE!')
                            .setDescription(`Your Valorant team is ready to play! Good luck and have fun!${teamRankInfo}`)
                            .addFields(
                                { name: '🎮 Ready to Queue!', value: 'Your 5-stack is complete and ready for competitive play!', inline: false },
                                { name: '📊 Rank Registration', value: 'Unregistered players can use `!valstats` to show their rank in future teams!', inline: false }
                            )
                            .setTimestamp();

                        await interaction.followUp({
                            embeds: [celebrationEmbed]
                        });

                        // Auto-delete team after 5 minutes when full
                        setTimeout(() => {
                            activeTeams.delete(fullTeamId);
                            interaction.message.delete().catch(() => {});
                        }, 5 * 60 * 1000);
                    }
                } catch (error) {
                    console.error('Error updating team:', error);
                    await interaction.reply({
                        content: '❌ There was an error updating the team. Please try again.',
                        ephemeral: true
                    });
                }

            } else if (action === 'leave') {
                // Check if user is the leader
                if (userId === team.leader.id) {
                    return interaction.reply({
                        content: '❌ Team leaders cannot leave their own team! Use the disband button instead.',
                        ephemeral: true
                    });
                }

                // Check if user is in team
                const memberIndex = team.members.findIndex(member => member.id === userId);
                if (memberIndex === -1) {
                    return interaction.reply({
                        content: '❌ You are not in this team!',
                        ephemeral: true
                    });
                }

                // Remove user from team
                team.members.splice(memberIndex, 1);

                try {
                    // Update the team display
                    const isFull = getTotalMembers(team) >= 5;
                    const updatedEmbed = await createTeamEmbed(team);
                    const updatedComponents = createTeamButtons(fullTeamId, isFull);

                    await interaction.update({
                        embeds: [updatedEmbed.embed],
                        files: updatedEmbed.files,
                        components: [updatedComponents]
                    });
                } catch (error) {
                    console.error('Error updating team after leave:', error);
                    await interaction.reply({
                        content: '❌ There was an error updating the team. Please try again.',
                        ephemeral: true
                    });
                }

            } else if (action === 'disband') {
                // Only leader can disband
                if (userId !== team.leader.id) {
                    return interaction.reply({
                        content: '❌ Only the team leader can disband the team!',
                        ephemeral: true
                    });
                }

                // Clear the resend timer before disbanding
                if (team.resendTimer) {
                    clearTimeout(team.resendTimer);
                }

                // Remove team and delete message
                activeTeams.delete(fullTeamId);
                await interaction.update({
                    embeds: [createDisbandedEmbed()],
                    components: []
                });

                // Delete the message after 5 seconds
                setTimeout(() => {
                    interaction.message.delete().catch(() => {});
                }, 5000);

                return;
            }
        });

        // Clear any existing teams from memory on restart
        activeTeams.clear();
        client._valorantTeamHandlerInitialized = true;
    }
};