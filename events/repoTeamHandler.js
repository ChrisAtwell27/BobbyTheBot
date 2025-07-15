const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const https = require('https');

// Configuration - Update this with your actual REPO role ID
const REPO_ROLE_ID = '1349166787526397982'; // Replace with actual @REPO role ID

// Debug function to help find your role ID
function findRepoRole(message) {
    const repoRoles = message.guild.roles.cache.filter(role => 
        role.name.toLowerCase().includes('repo')
    );
    
    if (repoRoles.size > 0) {
        console.log('Found REPO-related roles:');
        repoRoles.forEach(role => {
            console.log(`- Role: "${role.name}" | ID: ${role.id}`);
        });
    } else {
        console.log('No REPO-related roles found');
    }
}

// Store active teams (in production, consider using a database)
const activeTeams = new Map();

// Resend interval in milliseconds (10 minutes)
const RESEND_INTERVAL = 10 * 60 * 1000;

// Change team size to 6
const TEAM_SIZE = 6; // 1 leader + 5 members

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
    
    // Background gradient (dark horror theme)
    const gradient = ctx.createLinearGradient(0, 0, 600, 180);
    gradient.addColorStop(0, '#0a0a0a');
    gradient.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 600, 180);
    
    // Horror-style accent (blood red)
    ctx.fillStyle = '#8b0000';
    ctx.fillRect(0, 0, 600, 4);
    ctx.fillRect(0, 176, 600, 4);
    
    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('👻 REPO SQUAD', 300, 35);
    
    // Team member slots
    const slotWidth = 100;
    const slotHeight = 100;
    const startX = 20;
    const startY = 50;
    const spacing = 110;
    
    const allMembers = [team.leader, ...team.members];
    
    for (let i = 0; i < TEAM_SIZE; i++) {
        const x = startX + (i * spacing);
        const y = startY;
        
        // Slot background
        ctx.fillStyle = allMembers[i] ? '#8b0000' : '#333333';
        ctx.fillRect(x - 2, y - 2, slotWidth + 4, slotHeight + 4);
        
        ctx.fillStyle = allMembers[i] ? '#1a1a1a' : '#2a2a2a';
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
                
                // Leader badge
                if (i === 0) {
                    ctx.font = '20px Arial';
                    ctx.fillStyle = '#ff6b6b';
                    ctx.textAlign = 'center';
                    ctx.fillText('💀', x + slotWidth/2, y - 5);
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
                ctx.fillStyle = '#8b0000';
                ctx.fillRect(x + 5, y + 5, slotWidth - 10, slotWidth - 10);
                ctx.fillStyle = '#ffffff';
                ctx.font = '40px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('👤', x + slotWidth/2, y + slotWidth/2 + 10);
            }
        } else {
            // Empty slot
            ctx.fillStyle = '#666666';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('EMPTY', x + slotWidth/2, y + slotWidth/2 - 10);
            ctx.fillText('SLOT', x + slotWidth/2, y + slotWidth/2 + 10);
        }
        
        // Slot number
        ctx.fillStyle = '#aaaaaa';
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
            const isFull = getTotalMembers(team) >= TEAM_SIZE;
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

        // Debug command to find REPO role ID
        if (message.content === '!findreporole') {
            findRepoRole(message);
            return message.reply('Check your console for REPO role information!');
        }

        // Debug: Log all role mentions in the message
        if (message.mentions.roles.size > 0) {
            console.log('Role mentions detected:');
            message.mentions.roles.forEach(role => {
                console.log(`- ${role.name} (ID: ${role.id})`);
            });
        }

        // Check if message mentions the REPO role or uses the !repo command
        const repoRoleMention = `<@&${REPO_ROLE_ID}>`;
        const isRepoCommand = message.content.toLowerCase() === '!repo';
        if (message.content.includes(repoRoleMention) || 
            message.mentions.roles.has(REPO_ROLE_ID) || 
            isRepoCommand) {
            console.log('REPO team creation triggered!');
            // Always use a unique and consistent teamId
            const teamId = `repo_team_${message.id}`;
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
                console.log('REPO team created successfully:', teamId);
                // Set up the resend timer to keep message at bottom of chat
                team.resendTimer = setTimeout(() => resendTeamMessage(teamId), RESEND_INTERVAL);

                // Delete after 30 minutes if team isn't full
                setTimeout(() => {
                    const currentTeam = activeTeams.get(teamId);
                    if (currentTeam && getTotalMembers(currentTeam) < TEAM_SIZE) {
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
                console.error('Error creating REPO team message:', error);
            }
        }
    });

    // Handle button interactions (only for team builder)
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;
        // Only handle REPO team builder interactions
        const parts = interaction.customId.split('_');
        const action = parts[0];
        // Always reconstruct teamId with repo_team_ prefix
        const teamId = parts.slice(1).join('_');
        const teamActions = ['join', 'leave', 'disband'];
        if (!teamActions.includes(action)) return;
        
        const team = activeTeams.get(teamId);
        
        console.log('Button interaction:', interaction.customId);
        console.log('Parsed action:', action, 'teamId:', teamId);
        console.log('Looking for team:', teamId);
        console.log('Active teams:', Array.from(activeTeams.keys()));

        if (!team) {
            // Team not found, reply with error and do not crash
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ This REPO squad is no longer active or has expired. Please create a new squad!',
                        ephemeral: true
                    });
                } catch (err) {
                    console.error('Error replying to interaction (team missing):', err);
                }
            }
            return;
        }

        const userId = interaction.user.id;
        const userInfo = {
            id: userId,
            username: interaction.user.username,
            displayName: interaction.user.displayName || interaction.user.username,
            avatarURL: interaction.user.displayAvatarURL({ extension: 'png', size: 128 })
        };

        try {
            if (action === 'join') {
                // Check if user is already in team
                if (userId === team.leader.id || team.members.some(member => member.id === userId)) {
                    return await interaction.reply({
                        content: '❌ You are already in this REPO squad!',
                        ephemeral: true
                    });
                }

                // Check if team is full
                if (getTotalMembers(team) >= TEAM_SIZE) {
                    return await interaction.reply({
                        content: '❌ This REPO squad is already full!',
                        ephemeral: true
                    });
                }

                // Add user to team
                team.members.push(userInfo);

                // Update the team display first
                const isFull = getTotalMembers(team) >= TEAM_SIZE;
                const updatedEmbed = await createTeamEmbed(team);
                const updatedComponents = createTeamButtons(teamId, isFull);

                if (!interaction.replied && !interaction.deferred) {
                    await interaction.update({
                        embeds: [updatedEmbed.embed],
                        files: updatedEmbed.files,
                        components: [updatedComponents]
                    });

                    if (isFull) {
                        const celebrationEmbed = new EmbedBuilder()
                            .setColor('#32cd32')
                            .setTitle('🎉 REPO SQUAD COMPLETE!')
                            .setDescription('Your horror squad is ready to face the darkness! Stay together and survive!')
                            .setTimestamp();

                        await interaction.followUp({
                            embeds: [celebrationEmbed]
                        });
                    }
                }

                // If team is full, celebrate!
                if (isFull) {
                    // Clear the resend timer since team is full
                    if (team.resendTimer) {
                        clearTimeout(team.resendTimer);
                        team.resendTimer = null;
                    }
                    
                    const celebrationEmbed = new EmbedBuilder()
                        .setColor('#32cd32')
                        .setTitle('🎉 REPO SQUAD COMPLETE!')
                        .setDescription('Your horror squad is ready to face the darkness! Stay together and survive!')
                        .setTimestamp();

                    await interaction.followUp({
                        embeds: [celebrationEmbed]
                    });

                    // Auto-delete team after 5 minutes when full
                    setTimeout(() => {
                        activeTeams.delete(teamId);
                        interaction.message.delete().catch(() => {});
                    }, 5 * 60 * 1000);
                }

            } else if (action === 'leave') {
                // Check if user is the leader
                if (userId === team.leader.id) {
                    return await interaction.reply({
                        content: '❌ Squad leaders cannot abandon their team! The squad will auto-delete after 30 minutes if not full.',
                        ephemeral: true
                    });
                }

                // Check if user is in team
                const memberIndex = team.members.findIndex(member => member.id === userId);
                if (memberIndex === -1) {
                    return await interaction.reply({
                        content: '❌ You are not in this REPO squad!',
                        ephemeral: true
                    });
                }

                // Remove user from team
                team.members.splice(memberIndex, 1);

                // Update the team display
                const isFull = getTotalMembers(team) >= TEAM_SIZE;
                const updatedEmbed = await createTeamEmbed(team);
                const updatedComponents = createTeamButtons(teamId, isFull);

                await interaction.update({
                    embeds: [updatedEmbed.embed],
                    files: updatedEmbed.files,
                    components: [updatedComponents]
                });

            } else if (action === 'disband') {
                // Only leader can disband
                if (userId !== team.leader.id) {
                    return await interaction.reply({
                        content: '❌ Only the squad leader can disband the team!',
                        ephemeral: true
                    });
                }

                // Clear the resend timer before disbanding
                if (team.resendTimer) {
                    clearTimeout(team.resendTimer);
                }

                // Remove team from active teams first
                activeTeams.delete(teamId);
                
                // Try to update the interaction to show disbanded message
                try {
                    await interaction.update({
                        embeds: [createDisbandedEmbed()],
                        components: []
                    });

                    // Delete the message after 5 seconds
                    setTimeout(() => {
                        interaction.message.delete().catch(() => {});
                    }, 5000);
                } catch (updateError) {
                    console.error('Error updating interaction for disband:', updateError);
                    // If update fails, try to delete the message directly
                    try {
                        await interaction.message.delete();
                    } catch (deleteError) {
                        console.error('Error deleting message after failed update:', deleteError);
                    }
                }

                return;
            }
        } catch (error) {
            console.error('Error handling button interaction:', error);
            
            // Try to respond with an error message if we haven't responded yet
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ An error occurred processing your request. Please try again.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Error sending error reply:', replyError);
            }
        }
    });

    // Helper function to create team embed with visual display
    async function createTeamEmbed(team) {
        const totalMembers = getTotalMembers(team);
        
        // Create the visual team display
        const teamImageBuffer = await createTeamVisualization(team);
        const attachment = new AttachmentBuilder(teamImageBuffer, { name: 'repo-squad-display.png' });
        
        const embed = new EmbedBuilder()
            .setColor(totalMembers >= TEAM_SIZE ? '#32cd32' : '#8b0000')
            .setTitle('👻 REPO Squad Builder')
            .setDescription(`**Squad Leader:** ${team.leader.displayName}\n**Squad Status:** ${totalMembers}/${TEAM_SIZE} Survivors`)
            .setImage('attachment://repo-squad-display.png')
            .addFields({
                name: '🔦 Horror Squad',
                value: formatTeamMembersList(team),
                inline: false
            })
            .setFooter({ 
                text: totalMembers < TEAM_SIZE ? 'Click the buttons below to join or leave the squad!' : 'Squad is ready! Time to face the horrors!'
            })
            .setTimestamp();

        return {
            embed: embed,
            files: [attachment]
        };
    }

    // Helper function to create team buttons
    function createTeamButtons(teamId, isFull) {
        // Always use the full teamId in customId
        const joinButton = new ButtonBuilder()
            .setCustomId(`join_${teamId}`)
            .setLabel('Join Squad')
            .setStyle(ButtonStyle.Success)
            .setEmoji('➕')
            .setDisabled(isFull);

        const leaveButton = new ButtonBuilder()
            .setCustomId(`leave_${teamId}`)
            .setLabel('Leave Squad')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('➖');

        const disbandButton = new ButtonBuilder()
            .setCustomId(`disband_${teamId}`)
            .setLabel('Disband Squad')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🗑️');

        return new ActionRowBuilder().addComponents(joinButton, leaveButton, disbandButton);
    }

    // Helper function to format team members list (simplified for visual display)
    function formatTeamMembersList(team) {
        const members = [];
        
        // Add leader
        members.push(`💀 **${team.leader.displayName}** (Squad Leader)`);
        
        // Add other members
        team.members.forEach((member, index) => {
            members.push(`${index + 2}. **${member.displayName}**`);
        });

        // Add empty slots count
        const emptySlots = TEAM_SIZE - getTotalMembers(team);
        if (emptySlots > 0) {
            members.push(`\n*${emptySlots} survivor slot${emptySlots > 1 ? 's' : ''} available*`);
        }

        return members.join('\n');
    }

    // Helper function to get total team members
    function getTotalMembers(team) {
        return 1 + team.members.length;
    }

    // Helper function to create disbanded embed
    function createDisbandedEmbed() {
        return new EmbedBuilder()
            .setColor('#8b0000')
            .setTitle('❌ REPO Squad Disbanded')
            .setDescription('This horror squad has been disbanded by the squad leader.')
            .setTimestamp();
    }

    // Clean up old teams on startup (optional)
    client.once('ready', () => {
        console.log('REPO Squad Builder with Visual Display loaded!');
        // Clear any existing teams from memory on restart
        activeTeams.clear();
    });
};