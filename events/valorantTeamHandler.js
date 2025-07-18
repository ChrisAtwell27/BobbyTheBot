const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const https = require('https');

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

// Function to create team visualization
async function createTeamVisualization(team) {
    const canvas = createCanvas(600, 180);
    const ctx = canvas.getContext('2d');
    
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 600, 180);
    gradient.addColorStop(0, '#0f1419');
    gradient.addColorStop(1, '#1e2328');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 600, 180);
    
    // Valorant-style accent
    ctx.fillStyle = '#ff4654';
    ctx.fillRect(0, 0, 600, 4);
    ctx.fillRect(0, 176, 600, 4);
    
    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎯 VALORANT TEAM', 300, 35);
    
    // Team member slots
    const slotWidth = 100;
    const slotHeight = 100;
    const startX = 50;
    const startY = 50;
    const spacing = 110;
    
    const allMembers = [team.leader, ...team.members];
    
    for (let i = 0; i < 5; i++) {
        const x = startX + (i * spacing);
        const y = startY;
        
        // Slot background
        ctx.fillStyle = allMembers[i] ? '#ff4654' : '#2c3e50';
        ctx.fillRect(x - 2, y - 2, slotWidth + 4, slotHeight + 4);
        
        ctx.fillStyle = allMembers[i] ? '#1e2328' : '#34495e';
        ctx.fillRect(x, y, slotWidth, slotHeight);
        
        if (allMembers[i]) {
            try {
                // Get user avatar
                const avatarURL = allMembers[i].avatarURL || 
                    `https://cdn.discordapp.com/embed/avatars/${allMembers[i].id % 5}.png`;
                
                const avatar = await loadImageFromURL(avatarURL);
                
                // Draw circular avatar
                ctx.save();
                ctx.beginPath();
                ctx.arc(x + slotWidth/2, y + slotWidth/2, (slotWidth-10)/2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(avatar, x + 5, y + 5, slotWidth - 10, slotWidth - 10);
                ctx.restore();
                
                // Leader crown
                if (i === 0) {
                    ctx.font = '20px Arial';
                    ctx.fillStyle = '#ffd700';
                    ctx.textAlign = 'center';
                    ctx.fillText('👑', x + slotWidth/2, y - 5);
                }
                
                // Username
                ctx.font = '12px Arial';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                const displayName = allMembers[i].displayName || allMembers[i].username;
                const truncatedName = displayName.length > 10 ? 
                    displayName.substring(0, 10) + '...' : displayName;
                ctx.fillText(truncatedName, x + slotWidth/2, y + slotHeight + 15);
                
            } catch (error) {
                console.error('Error loading avatar:', error);
                // Fallback: draw default avatar
                ctx.fillStyle = '#7289da';
                ctx.fillRect(x + 5, y + 5, slotWidth - 10, slotWidth - 10);
                ctx.fillStyle = '#ffffff';
                ctx.font = '40px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('👤', x + slotWidth/2, y + slotWidth/2 + 10);
            }
        } else {
            // Empty slot
            ctx.fillStyle = '#7f8c8d';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('EMPTY', x + slotWidth/2, y + slotWidth/2 - 10);
            ctx.fillText('SLOT', x + slotWidth/2, y + slotWidth/2 + 10);
        }
        
        // Slot number
        ctx.fillStyle = '#bdc3c7';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${i + 1}`, x + slotWidth/2, y + slotHeight + 30);
    }
    
    return canvas.toBuffer();
}

module.exports = (client) => {
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
        const isValorantCommand = message.content.toLowerCase() === '!valorant';
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
            const embed = await createTeamEmbed(team);
            const components = createTeamButtons(teamId, false);
            try {
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
        console.log('Active teams:', Array.from(activeTeams.keys()));

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
                
                const celebrationEmbed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('🎉 TEAM COMPLETE!')
                    .setDescription('Your Valorant team is ready to play! Good luck and have fun!')
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

        } else if (action === 'leave') {
            // Check if user is the leader
            if (userId === team.leader.id) {
                return interaction.reply({
                    content: '❌ Team leaders cannot leave their own team! The team will auto-delete after 30 minutes if not full.',
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

            // Update the team display
            const isFull = getTotalMembers(team) >= 5;
            const updatedEmbed = await createTeamEmbed(team);
            const updatedComponents = createTeamButtons(fullTeamId, isFull);

            await interaction.update({
                embeds: [updatedEmbed.embed],
                files: updatedEmbed.files,
                components: [updatedComponents]
            });

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

    // Helper function to create team embed with visual display
    async function createTeamEmbed(team) {
        const totalMembers = getTotalMembers(team);
        
        // Create the visual team display
        const teamImageBuffer = await createTeamVisualization(team);
        const attachment = new AttachmentBuilder(teamImageBuffer, { name: 'team-display.png' });
        
        const embed = new EmbedBuilder()
            .setColor(totalMembers >= 5 ? '#00ff00' : '#ff4654')
            .setTitle('🎯 Valorant Team Builder')
            .setDescription(`**Team Leader:** ${team.leader.displayName}\n**Team Status:** ${totalMembers}/5 Players`)
            .setImage('attachment://team-display.png')
            .addFields({
                name: '📋 Team Members',
                value: formatTeamMembersList(team),
                inline: false
            })
            .setFooter({ 
                text: totalMembers < 5 ? 'Click the buttons below to join or leave the team!' : 'Team is full! Ready to play!'
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

    // Helper function to format team members list (simplified for visual display)
    function formatTeamMembersList(team) {
        const members = [];
        
        // Add leader
        members.push(`👑 **${team.leader.displayName}** (Leader)`);
        
        // Add other members
        team.members.forEach((member, index) => {
            members.push(`${index + 2}. **${member.displayName}**`);
        });

        // Add empty slots count
        const emptySlots = 5 - getTotalMembers(team);
        if (emptySlots > 0) {
            members.push(`\n*${emptySlots} empty slot${emptySlots > 1 ? 's' : ''} remaining*`);
        }

        return members.join('\n');
    }

    // Helper function to get total team members
    function getTotalMembers(team) {
        return 1 + team.members.length; // 1 for leader + members
    }

    // Helper function to create disbanded embed
    function createDisbandedEmbed() {
        return new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Team Disbanded')
            .setDescription('This Valorant team has been disbanded by the leader.')
            .setTimestamp();
    }

    // Clean up old teams on startup (optional)
    client.once('ready', () => {
        console.log('Valorant Team Builder with Visual Display loaded!');
        // Clear any existing teams from memory on restart
        activeTeams.clear();
    });
};