const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const https = require('https');
const { TARGET_GUILD_ID } = require('../config/guildConfig');
const { CleanupMap, LimitedMap } = require('../utils/memoryUtils');
const { loadImageFromURL } = require('../utils/valorantCanvasUtils');

// Import functions from the API handler (with persistent storage)
const apiHandler = require('./valorantApiHandler');

// Configuration
const VALORANT_ROLE_ID = '1058201257338228757'; // Replace with actual @Valorant role ID
const INHOUSE_SIZE = 10; // In-house needs 10 players (2 teams of 5)
const MAX_INHOUSES_PER_USER = 1; // Limit active in-houses per user
const INHOUSE_COOLDOWN = 60000; // 1 minute cooldown between in-house creations

// Store active in-houses (auto-cleanup with size limit of 30)
const activeInhouses = new LimitedMap(30);

// Track user cooldowns for in-house creation (auto-cleanup after 2 minutes)
const userCooldowns = new CleanupMap(2 * 60 * 1000, 1 * 60 * 1000);

// Track user active in-houses count (limit to 200 users)
const userActiveInhouses = new LimitedMap(200);

// Resend interval in milliseconds (10 minutes)
const RESEND_INTERVAL = 10 * 60 * 1000;

// Function to get user rank information
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

// Function to calculate total MMR value for balancing
function calculatePlayerMMR(rankInfo) {
    if (!rankInfo) return 0;
    // Each rank tier is worth 100 points, RR adds up to 100 more
    return (rankInfo.tier * 100) + (rankInfo.rr || 0);
}

// Team balancing algorithm - creates two balanced teams based on player ranks
async function balanceTeams(players) {
    // Get rank info for all players
    const playersWithRanks = await Promise.all(
        players.map(async (player) => {
            const rankInfo = await getUserRankInfo(player.id);
            return {
                ...player,
                rankInfo,
                mmr: calculatePlayerMMR(rankInfo)
            };
        })
    );

    // Sort players by MMR (highest to lowest)
    playersWithRanks.sort((a, b) => b.mmr - a.mmr);

    // Initialize teams
    const team1 = [];
    const team2 = [];
    let team1MMR = 0;
    let team2MMR = 0;

    // Balance teams using a greedy algorithm
    // Assign each player to the team with lower total MMR
    for (const player of playersWithRanks) {
        if (team1MMR <= team2MMR) {
            team1.push(player);
            team1MMR += player.mmr;
        } else {
            team2.push(player);
            team2MMR += player.mmr;
        }
    }

    return {
        team1,
        team2,
        team1MMR,
        team2MMR,
        mmrDifference: Math.abs(team1MMR - team2MMR)
    };
}

// Enhanced function to create in-house visualization
async function createInhouseVisualization(inhouse, showTeams = false, balancedTeams = null) {
    const canvas = createCanvas(1100, 420);
    const ctx = canvas.getContext('2d');
    
    // Enhanced background gradient
    const gradient = ctx.createLinearGradient(0, 0, 1100, 420);
    gradient.addColorStop(0, '#0a0e13');
    gradient.addColorStop(0.3, '#1e2328');
    gradient.addColorStop(0.7, '#2c3e50');
    gradient.addColorStop(1, '#0a0e13');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1100, 420);
    
    // Add subtle pattern overlay
    ctx.fillStyle = 'rgba(255, 70, 84, 0.05)';
    for (let i = 0; i < 1100; i += 30) {
        for (let j = 0; j < 420; j += 30) {
            if ((i + j) % 60 === 0) {
                ctx.fillRect(i, j, 15, 15);
            }
        }
    }
    
    // Enhanced Valorant-style accent
    const accentGradient = ctx.createLinearGradient(0, 0, 1100, 0);
    accentGradient.addColorStop(0, '#ff4654');
    accentGradient.addColorStop(0.5, '#ff6b7a');
    accentGradient.addColorStop(1, '#ff4654');
    ctx.fillStyle = accentGradient;
    ctx.fillRect(0, 0, 1100, 6);
    ctx.fillRect(0, 414, 1100, 6);
    
    // Enhanced title with glow effect
    ctx.shadowColor = '#ff4654';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('VALORANT IN-HOUSE', 550, 40);
    ctx.shadowBlur = 0;
    
    // Status based on whether teams are balanced
    const totalMembers = getTotalMembers(inhouse);
    ctx.font = 'bold 16px Arial';
    
    if (showTeams && balancedTeams) {
        ctx.fillStyle = '#00ff88';
        ctx.fillText('TEAMS BALANCED - READY TO PLAY!', 550, 65);
    } else {
        ctx.fillStyle = totalMembers >= 10 ? '#00ff88' : '#ffaa00';
        ctx.fillText(`${totalMembers}/10 PLAYERS READY`, 550, 65);
    }
    
    // Player slots
    const slotWidth = 100;
    const slotHeight = 140;
    const startY = 85;
    const spacing = 110;
    
    let allMembers;
    
    if (showTeams && balancedTeams) {
        // Show balanced teams
        // Team 1 on top row
        ctx.fillStyle = '#4a90e2';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('TEAM 1', 40, startY - 5);
        
        // Team 2 on bottom row
        ctx.fillStyle = '#e24a4a';
        ctx.fillText('TEAM 2', 40, startY + slotHeight + 30);
        
        for (let i = 0; i < 5; i++) {
            // Draw Team 1 member
            await drawPlayerSlot(ctx, balancedTeams.team1[i], 40 + (i * spacing), startY, slotWidth, slotHeight, i + 1, '#4a90e2');
            
            // Draw Team 2 member
            await drawPlayerSlot(ctx, balancedTeams.team2[i], 40 + (i * spacing), startY + slotHeight + 35, slotWidth, slotHeight, i + 6, '#e24a4a');
        }
        
        // Show MMR info
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`Avg MMR: ${Math.round(balancedTeams.team1MMR / 5)}`, 1060, startY + 70);
        ctx.fillText(`Avg MMR: ${Math.round(balancedTeams.team2MMR / 5)}`, 1060, startY + slotHeight + 105);
        
        // Show MMR difference
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = balancedTeams.mmrDifference < 200 ? '#00ff88' : '#ffaa00';
        ctx.fillText(`MMR Diff: ${Math.round(balancedTeams.mmrDifference)}`, 550, 405);
    } else {
        // Show all 10 slots in two rows
        allMembers = [inhouse.leader, ...inhouse.members];
        
        for (let i = 0; i < 10; i++) {
            const row = Math.floor(i / 5);
            const col = i % 5;
            const x = 40 + (col * spacing);
            const y = startY + (row * (slotHeight + 20));
            
            await drawPlayerSlot(ctx, allMembers[i], x, y, slotWidth, slotHeight, i + 1);
        }
    }
    
    return canvas.toBuffer();
}

// Helper function to draw a single player slot
async function drawPlayerSlot(ctx, member, x, y, width, height, slotNum, teamColor = null) {
    // Enhanced slot background with gradient
    const slotGradient = ctx.createLinearGradient(x, y, x, y + height);
    if (member) {
        if (teamColor) {
            slotGradient.addColorStop(0, teamColor + '55');
            slotGradient.addColorStop(1, teamColor + '22');
        } else {
            slotGradient.addColorStop(0, 'rgba(255, 70, 84, 0.3)');
            slotGradient.addColorStop(1, 'rgba(255, 70, 84, 0.1)');
        }
    } else {
        slotGradient.addColorStop(0, 'rgba(60, 60, 60, 0.5)');
        slotGradient.addColorStop(1, 'rgba(40, 40, 40, 0.5)');
    }
    ctx.fillStyle = slotGradient;
    ctx.fillRect(x - 2, y - 2, width + 4, height + 4);
    
    // Slot border
    ctx.strokeStyle = teamColor || (member ? '#ff4654' : '#666666');
    ctx.lineWidth = member ? 3 : 2;
    ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
    
    if (member) {
        try {
            // Get user avatar
            const avatarURL = member.avatarURL || 
                `https://cdn.discordapp.com/embed/avatars/${member.id % 5}.png`;
            
            const avatar = await loadImageFromURL(avatarURL);
            
            // Draw circular avatar with glow for leader
            if (slotNum === 1) {
                ctx.shadowColor = '#ffd700';
                ctx.shadowBlur = 15;
            }
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(x + width/2, y + 35, 25, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, x + width/2 - 25, y + 10, 50, 50);
            ctx.restore();
            ctx.shadowBlur = 0;
            
            // Enhanced leader crown
            if (slotNum === 1) {
                ctx.font = 'bold 14px Arial';
                ctx.fillStyle = '#ffd700';
                ctx.textAlign = 'center';
                ctx.shadowColor = '#ffd700';
                ctx.shadowBlur = 5;
                ctx.fillText('HOST', x + width/2, y - 5);
                ctx.shadowBlur = 0;
            }
            
            // Enhanced username display
            ctx.font = 'bold 11px Arial';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            const displayName = member.displayName || member.username;
            const truncatedName = displayName.length > 10 ? 
                displayName.substring(0, 10) + '...' : displayName;
            ctx.fillText(truncatedName, x + width/2, y + 75);
            
            // Get and display rank
            const userRankInfo = member.rankInfo || await getUserRankInfo(member.id);
            if (userRankInfo) {
                // Try to load rank image
                const rankImage = await apiHandler.loadRankImage(userRankInfo.tier);
                if (rankImage) {
                    // Draw rank image in bottom section
                    ctx.drawImage(rankImage, x + width/2 - 15, y + 85, 30, 30);
                } else {
                    // Use fallback rank icon
                    apiHandler.createFallbackRankIcon(ctx, x + width/2 - 15, y + 85, 30, userRankInfo);
                }
                
                // Show rank name and RR
                ctx.font = 'bold 9px Arial';
                ctx.fillStyle = userRankInfo.color;
                ctx.textAlign = 'center';
                ctx.fillText(userRankInfo.name, x + width/2, y + 125);
                if (userRankInfo.rr !== undefined) {
                    ctx.fillText(`${userRankInfo.rr} RR`, x + width/2, y + 135);
                }
            } else {
                // Show "Not Registered" indicator
                ctx.font = 'bold 8px Arial';
                ctx.fillStyle = '#888888';
                ctx.textAlign = 'center';
                ctx.fillText('Not Registered', x + width/2, y + 95);
                ctx.fillText('!valstats', x + width/2, y + 107);
            }
            
        } catch (error) {
            console.error('Error loading avatar or rank:', error);
            // Enhanced fallback: draw default avatar
            const avatarGradient = ctx.createRadialGradient(x + width/2, y + 35, 0, x + width/2, y + 35, 25);
            avatarGradient.addColorStop(0, '#7289da');
            avatarGradient.addColorStop(1, '#5865f2');
            ctx.fillStyle = avatarGradient;
            ctx.beginPath();
            ctx.arc(x + width/2, y + 35, 25, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#ffffff';
            ctx.font = '22px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('?', x + width/2, y + 45);
        }
    } else {
        // Enhanced empty slot
        ctx.fillStyle = '#666666';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('LOOKING', x + width/2, y + height/2 - 10);
        ctx.fillText('FOR PLAYER', x + width/2, y + height/2 + 10);
        
        // Pulsing effect for empty slots (static representation)
        ctx.strokeStyle = 'rgba(255, 70, 84, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(x + 10, y + 10, width - 20, height - 20);
        ctx.setLineDash([]);
    }
    
    // Slot number
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${slotNum}`, x + width/2, y + height + 12);
}

// Helper function to get total in-house members
function getTotalMembers(inhouse) {
    return 1 + inhouse.members.length; // 1 for leader + members
}

// Function to check if user can create an in-house
function canCreateInhouse(userId) {
    // Check cooldown
    const lastCreated = userCooldowns.get(userId);
    if (lastCreated && Date.now() - lastCreated < INHOUSE_COOLDOWN) {
        const remaining = Math.ceil((INHOUSE_COOLDOWN - (Date.now() - lastCreated)) / 1000);
        return { canCreate: false, reason: `cooldown`, remaining };
    }

    // Check active in-houses limit
    const activeCount = userActiveInhouses.get(userId) || 0;
    if (activeCount >= MAX_INHOUSES_PER_USER) {
        return { canCreate: false, reason: `limit`, activeCount };
    }

    return { canCreate: true };
}

// Function to increment user's active in-house count
function incrementUserInhouseCount(userId) {
    const current = userActiveInhouses.get(userId) || 0;
    userActiveInhouses.set(userId, current + 1);
    userCooldowns.set(userId, Date.now());
}

// Function to decrement user's active in-house count
function decrementUserInhouseCount(userId) {
    const current = userActiveInhouses.get(userId) || 0;
    if (current > 0) {
        userActiveInhouses.set(userId, current - 1);
    }
}

// Enhanced helper function to create in-house embed
async function createInhouseEmbed(inhouse, showTeams = false, balancedTeams = null) {
    const totalMembers = getTotalMembers(inhouse);
    
    // Create the enhanced visual in-house display
    const inhouseImageBuffer = await createInhouseVisualization(inhouse, showTeams, balancedTeams);
    const attachment = new AttachmentBuilder(inhouseImageBuffer, { name: 'inhouse-display.png' });
    
    // Get in-house leader rank for display
    const leaderRankInfo = await getUserRankInfo(inhouse.leader.id);
    const leaderRankText = leaderRankInfo ? 
        `${leaderRankInfo.name}${leaderRankInfo.rr !== undefined ? ` (${leaderRankInfo.rr} RR)` : ''}` : 
        'Not Registered - Use !valstats';
    
    const embed = new EmbedBuilder()
        .setColor(totalMembers >= 10 ? '#00ff88' : '#ff4654')
        .setTitle('🏆 Valorant In-House Match')
        .setDescription(`**Match Host:** ${inhouse.leader.displayName}\n**Host Rank:** ${leaderRankText}\n**Status:** ${totalMembers}/10 Players`)
        .setImage('attachment://inhouse-display.png');

    if (showTeams && balancedTeams) {
        embed.addFields(
            {
                name: '🔵 TEAM 1',
                value: balancedTeams.team1.map((p, i) => {
                    const rankText = p.rankInfo ? `${p.rankInfo.name} (${p.rankInfo.rr || 0} RR)` : 'Unranked';
                    return `${i + 1}. **${p.displayName}** - ${rankText}`;
                }).join('\n'),
                inline: true
            },
            {
                name: '🔴 TEAM 2',
                value: balancedTeams.team2.map((p, i) => {
                    const rankText = p.rankInfo ? `${p.rankInfo.name} (${p.rankInfo.rr || 0} RR)` : 'Unranked';
                    return `${i + 1}. **${p.displayName}** - ${rankText}`;
                }).join('\n'),
                inline: true
            },
            {
                name: '📊 Balance Info',
                value: `**Team 1 Avg MMR:** ${Math.round(balancedTeams.team1MMR / 5)}\n**Team 2 Avg MMR:** ${Math.round(balancedTeams.team2MMR / 5)}\n**MMR Difference:** ${Math.round(balancedTeams.mmrDifference)}`,
                inline: false
            }
        );
    } else {
        embed.addFields({
            name: '📋 Player List',
            value: await formatInhouseMembersList(inhouse),
            inline: false
        });
    }
    
    embed.setFooter({ 
        text: totalMembers < 10 ? 
            '🔄 Match updates every 10 minutes • Register with !valstats to show your rank!' : 
            'All players ready! Click "Create Teams" to balance the match!'
    })
    .setTimestamp();

    return {
        embed: embed,
        files: [attachment]
    };
}

// Helper function to create in-house buttons
function createInhouseButtons(inhouseId, isFull, showCreateTeams = false) {
    // Extract just the message ID from the full in-house ID
    const messageId = inhouseId.replace('valinhouse_', '');
    
    const buttons = [];
    
    const joinButton = new ButtonBuilder()
        .setCustomId(`valinhouse_join_${messageId}`)
        .setLabel('Join Match')
        .setStyle(ButtonStyle.Success)
        .setEmoji('➕')
        .setDisabled(isFull);

    const leaveButton = new ButtonBuilder()
        .setCustomId(`valinhouse_leave_${messageId}`)
        .setLabel('Leave Match')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('➖');

    buttons.push(joinButton, leaveButton);

    if (showCreateTeams) {
        const createTeamsButton = new ButtonBuilder()
            .setCustomId(`valinhouse_createteams_${messageId}`)
            .setLabel('Create Teams')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⚖️');
        
        buttons.push(createTeamsButton);
    }

    const disbandButton = new ButtonBuilder()
        .setCustomId(`valinhouse_disband_${messageId}`)
        .setLabel('Disband Match')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🗑️');

    buttons.push(disbandButton);

    return new ActionRowBuilder().addComponents(buttons);
}

// Enhanced helper function to format in-house members list
async function formatInhouseMembersList(inhouse) {
    const members = [];
    
    // Add leader with rank
    const leaderRankInfo = await getUserRankInfo(inhouse.leader.id);
    const leaderRankText = leaderRankInfo ? 
        `(${leaderRankInfo.name}${leaderRankInfo.rr !== undefined ? ` - ${leaderRankInfo.rr} RR` : ''})` : 
        '(Not registered)';
    members.push(`👑 **${inhouse.leader.displayName}** ${leaderRankText}`);
    
    // Add other members with ranks
    for (let i = 0; i < inhouse.members.length; i++) {
        const member = inhouse.members[i];
        const memberRankInfo = await getUserRankInfo(member.id);
        const memberRankText = memberRankInfo ? 
            `(${memberRankInfo.name}${memberRankInfo.rr !== undefined ? ` - ${memberRankInfo.rr} RR` : ''})` : 
            '(Not registered)';
        members.push(`${i + 2}. **${member.displayName}** ${memberRankText}`);
    }

    // Add empty slots count
    const emptySlots = 10 - getTotalMembers(inhouse);
    if (emptySlots > 0) {
        members.push(`\n*🔍 Looking for ${emptySlots} more player${emptySlots > 1 ? 's' : ''}...*`);
        members.push('*Use `!valstats` to register and show your rank!*');
    }

    return members.join('\n');
}

module.exports = (client) => {
    // API handler is initialized in index.js
    // Only add event listeners if not already added for in-house builder
    if (!client._valorantInhouseHandlerInitialized) {
        console.log('Valorant In-House Match Builder with Team Balancing loaded!');
        console.log('Features: 10-player matches, automatic team balancing, rank-based MMR system');

        // Function to resend in-house message to keep it at the bottom of chat
        async function resendInhouseMessage(inhouseId) {
            const inhouse = activeInhouses.get(inhouseId);
            if (!inhouse) return; // In-house no longer exists
            
            try {
                // Get the channel
                const channel = await client.channels.fetch(inhouse.channelId);
                if (!channel) return;
                
                // Create updated embed and components
                const isFull = getTotalMembers(inhouse) >= 10;
                const updatedEmbed = await createInhouseEmbed(inhouse);
                const updatedComponents = createInhouseButtons(inhouseId, isFull, isFull);
                
                // Delete the old message if it exists
                try {
                    const oldMessage = await channel.messages.fetch(inhouse.messageId);
                    if (oldMessage) await oldMessage.delete();
                } catch (error) {
                    console.log(`Couldn't delete old in-house message: ${error.message}`);
                }
                
                // Send a new message
                const newMessage = await channel.send({
                    embeds: [updatedEmbed.embed],
                    files: updatedEmbed.files,
                    components: [updatedComponents]
                });
                
                // Update the in-house with the new message ID
                inhouse.messageId = newMessage.id;
                
                // Set up the next resend timer if in-house isn't full
                if (!isFull) {
                    // Clear any existing timer
                    if (inhouse.resendTimer) clearTimeout(inhouse.resendTimer);
                    
                    // Set new timer
                    inhouse.resendTimer = setTimeout(() => resendInhouseMessage(inhouseId), RESEND_INTERVAL);
                }
            } catch (error) {
                console.error(`Error resending in-house message: ${error}`);
            }
        }

        client.on('messageCreate', async (message) => {
            if (message.author.bot) return;

            // Only run in target guild
            if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

            // EARLY RETURN: Skip if not a valorant inhouse command
            const content = message.content.toLowerCase();
            if (!content.startsWith('!valinhouse') && !content.startsWith('!inhouse')) return;

            // Check if message is the !valinhouse command
            const isInhouseCommand = message.content.toLowerCase() === '!valinhouse';
            
            if (isInhouseCommand) {
                console.log('Valorant in-house creation triggered!');

                // Check if user can create an in-house (cooldown + limit)
                const canCreate = canCreateInhouse(message.author.id);
                if (!canCreate.canCreate) {
                    if (canCreate.reason === 'cooldown') {
                        return message.reply(`⏰ Please wait ${canCreate.remaining} seconds before creating another in-house match.`);
                    } else if (canCreate.reason === 'limit') {
                        return message.reply(`❌ You already have ${canCreate.activeCount} active in-house match(es). Please wait for it to fill or disband it first.`);
                    }
                }

                // Always use a unique and consistent inhouseId
                const inhouseId = `valinhouse_${message.id}`;

                // Create new in-house with the message author as leader
                const inhouse = {
                    id: inhouseId,
                    leader: {
                        id: message.author.id,
                        username: message.author.username,
                        displayName: message.author.displayName || message.author.username,
                        avatarURL: message.author.displayAvatarURL({ extension: 'png', size: 128 })
                    },
                    members: [],
                    channelId: message.channel.id,
                    messageId: null,
                    resendTimer: null,
                    createdAt: new Date().toISOString(),
                    teamsBalanced: false
                };

                // Create the in-house embed and buttons
                try {
                    const embed = await createInhouseEmbed(inhouse);
                    const components = createInhouseButtons(inhouseId, false, false);

                    const inhouseMessage = await message.channel.send({
                        embeds: [embed.embed],
                        files: embed.files,
                        components: [components]
                    });

                    // Store the in-house with message ID immediately after sending
                    inhouse.messageId = inhouseMessage.id;
                    activeInhouses.set(inhouseId, inhouse);

                    // Increment user's active in-house count
                    incrementUserInhouseCount(message.author.id);

                    console.log(`✅ In-house created successfully: ${inhouseId} by ${message.author.username}`);

                    // Set up the resend timer to keep message at bottom of chat
                    inhouse.resendTimer = setTimeout(() => resendInhouseMessage(inhouseId), RESEND_INTERVAL);

                    // Delete after 30 minutes if in-house isn't full
                    inhouse.expiryTimer = setTimeout(() => {
                        const currentInhouse = activeInhouses.get(inhouseId);
                        if (currentInhouse && getTotalMembers(currentInhouse) < INHOUSE_SIZE) {
                            // Clear the resend timer before removing
                            if (currentInhouse.resendTimer) {
                                clearTimeout(currentInhouse.resendTimer);
                            }

                            // Decrement user's active in-house count
                            decrementUserInhouseCount(currentInhouse.leader.id);

                            activeInhouses.delete(inhouseId);

                            // Attempt to delete the most recent message
                            client.channels.fetch(currentInhouse.channelId).then(channel => {
                                channel.messages.fetch(currentInhouse.messageId).then(msg => {
                                    msg.delete().catch(() => {});
                                }).catch(() => {});
                            }).catch(() => {});

                            console.log(`⏰ In-house ${inhouseId} expired after 30 minutes`);
                        }
                    }, 30 * 60 * 1000); // 30 minutes

                } catch (error) {
                    console.error('❌ Error creating in-house message:', error);
                    message.reply(`❌ There was an error creating the in-house match: ${error.message}\nPlease try again in a moment.`).catch(console.error);
                }
            }
        });

        // Handle button interactions
        client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton()) return;
            
            // Only handle in-house buttons
            if (!interaction.customId.startsWith('valinhouse_')) {
                return;
            }
            
            const parts = interaction.customId.split('_');
            const action = parts[1]; // valinhouse_join, valinhouse_leave, valinhouse_disband, valinhouse_createteams
            const inhouseId = parts.slice(2).join('_'); // Reconstruct the in-house ID
            const fullInhouseId = `valinhouse_${inhouseId}`;
            
            const inhouse = activeInhouses.get(fullInhouseId);
            
            console.log('In-house Button interaction:', interaction.customId);
            console.log('Parsed action:', action, 'inhouseId:', fullInhouseId);

            if (!inhouse) {
                return interaction.reply({
                    content: '❌ This in-house match is no longer active.',
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
                // Check if user is already in in-house
                if (userId === inhouse.leader.id || inhouse.members.some(member => member.id === userId)) {
                    return interaction.reply({
                        content: '❌ You are already in this in-house match!',
                        ephemeral: true
                    });
                }

                // Check if in-house is full
                if (getTotalMembers(inhouse) >= 10) {
                    return interaction.reply({
                        content: '❌ This in-house match is already full!',
                        ephemeral: true
                    });
                }

                // Add user to in-house
                inhouse.members.push(userInfo);

                try {
                    // Defer the reply to prevent timeout (interactions must respond within 3 seconds)
                    await interaction.deferUpdate();
                    
                    // Update the in-house display first
                    const isFull = getTotalMembers(inhouse) >= 10;
                    const updatedEmbed = await createInhouseEmbed(inhouse);
                    const updatedComponents = createInhouseButtons(fullInhouseId, isFull, isFull);

                    await interaction.editReply({
                        embeds: [updatedEmbed.embed],
                        files: updatedEmbed.files,
                        components: [updatedComponents]
                    });

                    // If in-house is full, show the "Create Teams" button
                    if (isFull) {
                        // Clear the resend timer since in-house is full
                        if (inhouse.resendTimer) {
                            clearTimeout(inhouse.resendTimer);
                            inhouse.resendTimer = null;
                        }

                        const readyEmbed = new EmbedBuilder()
                            .setColor('#00ff00')
                            .setTitle('🎉 IN-HOUSE FULL!')
                            .setDescription(`All 10 players have joined! The match host can now create balanced teams by clicking the "Create Teams" button.`)
                            .addFields(
                                { name: '⚖️ Team Balancing', value: 'Teams will be automatically balanced based on player ranks and MMR to ensure a fair match!', inline: false },
                                { name: '📊 Unregistered Players', value: 'Unregistered players will be assigned with lower priority. Use `!valstats` to register your rank!', inline: false }
                            )
                            .setTimestamp();

                        await interaction.followUp({
                            embeds: [readyEmbed]
                        });

                        console.log(`🎉 In-house ${fullInhouseId} is full and ready for team creation`);
                    }
                } catch (error) {
                    console.error('Error updating in-house:', error);
                    // If interaction is already acknowledged, we can't reply again
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ There was an error updating the in-house. Please try again.',
                            ephemeral: true
                        }).catch(console.error);
                    }
                }

            } else if (action === 'leave') {
                // Check if user is the leader
                if (userId === inhouse.leader.id) {
                    return interaction.reply({
                        content: '❌ Match hosts cannot leave their own match! Use the disband button instead.',
                        ephemeral: true
                    });
                }

                // Check if user is in in-house
                const memberIndex = inhouse.members.findIndex(member => member.id === userId);
                if (memberIndex === -1) {
                    return interaction.reply({
                        content: '❌ You are not in this in-house match!',
                        ephemeral: true
                    });
                }

                // Remove user from in-house
                inhouse.members.splice(memberIndex, 1);

                try {
                    // Defer the reply to prevent timeout
                    await interaction.deferUpdate();
                    
                    // Update the in-house display
                    const isFull = getTotalMembers(inhouse) >= 10;
                    const updatedEmbed = await createInhouseEmbed(inhouse);
                    const updatedComponents = createInhouseButtons(fullInhouseId, isFull, isFull);

                    await interaction.editReply({
                        embeds: [updatedEmbed.embed],
                        files: updatedEmbed.files,
                        components: [updatedComponents]
                    });
                } catch (error) {
                    console.error('Error updating in-house after leave:', error);
                    // If interaction is already acknowledged, we can't reply again
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ There was an error updating the in-house. Please try again.',
                            ephemeral: true
                        }).catch(console.error);
                    }
                }

            } else if (action === 'createteams') {
                // Only leader can create teams
                if (userId !== inhouse.leader.id) {
                    return interaction.reply({
                        content: '❌ Only the match host can create teams!',
                        ephemeral: true
                    });
                }

                // Check if in-house is full
                if (getTotalMembers(inhouse) < 10) {
                    return interaction.reply({
                        content: '❌ The match needs 10 players before creating teams!',
                        ephemeral: true
                    });
                }

                try {
                    // Defer the reply to prevent timeout (team balancing can take time)
                    await interaction.deferUpdate();
                    
                    // Balance the teams
                    const allPlayers = [inhouse.leader, ...inhouse.members];
                    const balancedTeams = await balanceTeams(allPlayers);

                    // Update in-house state
                    inhouse.teamsBalanced = true;
                    inhouse.balancedTeams = balancedTeams;

                    // Create updated embed with teams
                    const teamsEmbed = await createInhouseEmbed(inhouse, true, balancedTeams);

                    // Remove all buttons since teams are created
                    await interaction.editReply({
                        embeds: [teamsEmbed.embed],
                        files: teamsEmbed.files,
                        components: []
                    });

                    // Decrement user's active in-house count
                    decrementUserInhouseCount(inhouse.leader.id);

                    console.log(`⚖️ Teams created for in-house ${fullInhouseId}`);

                    // Auto-delete in-house after 10 minutes
                    inhouse.deleteTimer = setTimeout(() => {
                        activeInhouses.delete(fullInhouseId);
                        interaction.message.delete().catch(() => {});
                    }, 10 * 60 * 1000);

                } catch (error) {
                    console.error('Error creating teams:', error);
                    // If interaction is already acknowledged, we can't reply again
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ There was an error creating teams. Please try again.',
                            ephemeral: true
                        }).catch(console.error);
                    }
                }

            } else if (action === 'disband') {
                // Only leader can disband
                if (userId !== inhouse.leader.id) {
                    return interaction.reply({
                        content: '❌ Only the match host can disband the match!',
                        ephemeral: true
                    });
                }

                try {
                    // Clear the resend timer before disbanding
                    if (inhouse.resendTimer) {
                        clearTimeout(inhouse.resendTimer);
                    }

                    // Decrement user's active in-house count
                    decrementUserInhouseCount(inhouse.leader.id);

                    // Remove in-house from active in-houses
                    activeInhouses.delete(fullInhouseId);

                    const disbandEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Match Disbanded')
                        .setDescription('This in-house match has been disbanded by the host.')
                        .addFields({
                            name: '📊 Match Stats',
                            value: `**Duration:** <t:${Math.floor(new Date(inhouse.createdAt).getTime() / 1000)}:R>\n**Players:** ${getTotalMembers(inhouse)}/${INHOUSE_SIZE}`,
                            inline: false
                        })
                        .setTimestamp();

                    await interaction.update({
                        embeds: [disbandEmbed],
                        components: []
                    });

                    console.log(`🗑️ In-house ${fullInhouseId} disbanded by ${interaction.user.username}`);

                    // Delete the message after 5 seconds
                    setTimeout(() => {
                        interaction.message.delete().catch(() => {});
                    }, 5000);
                } catch (error) {
                    console.error('❌ Error disbanding in-house:', error);
                    await interaction.reply({
                        content: `❌ There was an error disbanding the match: ${error.message}`,
                        ephemeral: true
                    }).catch(console.error);
                }

                return;
            }
        });

        // Clear any existing in-houses from memory on restart
        activeInhouses.clear();
        client._valorantInhouseHandlerInitialized = true;
    }
};
