const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const https = require('https');

// Import functions from the API handler (with persistent storage)
const apiHandler = require('./valorantApiHandler');
const teamHistoryDb = require('../database/helpers/teamHistoryHelpers');

// Configuration
const VALORANT_ROLE_ID = process.env.VALORANT_ROLE_ID || '1058201257338228757';
const TEAM_SIZE = 5; // Valorant team size
const MAX_TEAMS_PER_USER = 1; // Limit active teams per user
const TEAM_COOLDOWN = 60000; // 1 minute cooldown between team creations

// Validate role ID is set
if (!process.env.VALORANT_ROLE_ID) {
    console.warn('[VALORANT TEAM] WARNING: VALORANT_ROLE_ID not set in environment, using default');
}

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

// Store active teams (in-memory for active sessions, persisted to DB when completed)
const activeTeams = new Map();

// Store active timers for cleanup
const activeTimers = new Map();

// Track user cooldowns for team creation
const userCooldowns = new Map();

// Track user active teams count
const userActiveTeams = new Map();

// Resend interval in milliseconds (10 minutes)
const RESEND_INTERVAL = 10 * 60 * 1000;

// Function to cleanup all timers for a team
function cleanupTeamTimers(teamId) {
    const timers = activeTimers.get(teamId);
    if (timers) {
        timers.forEach(timer => clearTimeout(timer));
        activeTimers.delete(teamId);
        console.log(`[VALORANT TEAM] Cleaned up ${timers.length} timers for team ${teamId}`);
    }
}

// Function to delete voice channel
async function deleteVoiceChannel(voiceChannelId, teamId) {
    try {
        const channel = await client.channels.fetch(voiceChannelId);
        if (channel) {
            await channel.delete('Team voice channel cleanup');
            console.log(`[VALORANT TEAM] Deleted voice channel ${voiceChannelId} for team ${teamId}`);
        }
    } catch (error) {
        console.error(`[VALORANT TEAM] Error deleting voice channel ${voiceChannelId}:`, error);
    }
}

// Function to start ready check for full team
async function startReadyCheck(team, channel, teamStats, teamRankInfo) {
    const allMembers = [team.leader, ...team.members];
    const readyStatus = new Map();
    allMembers.forEach(member => readyStatus.set(member.id, false));

    const readyEmbed = new EmbedBuilder()
        .setColor('#ffaa00')
        .setTitle('⏳ READY CHECK')
        .setDescription(`All players must confirm they are ready!\n\n**Ready:** 0/${allMembers.length}${teamRankInfo}`)
        .addFields({
            name: '👥 Team Members',
            value: allMembers.map(m => `⬜ ${m.displayName}`).join('\n'),
            inline: false
        })
        .setFooter({ text: 'Click the button below to mark yourself as ready! • 60 seconds' })
        .setTimestamp();

    const readyButton = new ButtonBuilder()
        .setCustomId(`ready_check_${team.id}`)
        .setLabel('I\'m Ready!')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅');

    const readyRow = new ActionRowBuilder().addComponents(readyButton);

    const readyMessage = await channel.send({
        content: allMembers.map(m => `<@${m.id}>`).join(' '),
        embeds: [readyEmbed],
        components: [readyRow]
    });

    // Store ready check data on team
    team.readyCheck = {
        messageId: readyMessage.id,
        readyStatus: readyStatus,
        startedAt: Date.now()
    };

    // Listen for ready check responses
    const collector = readyMessage.createMessageComponentCollector({
        filter: i => i.customId === `ready_check_${team.id}`,
        time: 60000 // 60 seconds
    });

    collector.on('collect', async (i) => {
        const userId = i.user.id;

        if (!readyStatus.has(userId)) {
            await i.reply({ content: '❌ You are not in this team!', ephemeral: true });
            return;
        }

        if (readyStatus.get(userId)) {
            await i.reply({ content: '✅ You are already marked as ready!', ephemeral: true });
            return;
        }

        readyStatus.set(userId, true);
        const readyCount = Array.from(readyStatus.values()).filter(r => r).length;

        // Update embed
        const updatedEmbed = EmbedBuilder.from(readyEmbed)
            .setDescription(`All players must confirm they are ready!\n\n**Ready:** ${readyCount}/${allMembers.length}${teamRankInfo}`)
            .setFields({
                name: '👥 Team Members',
                value: allMembers.map(m => {
                    const isReady = readyStatus.get(m.id);
                    return `${isReady ? '✅' : '⬜'} ${m.displayName}`;
                }).join('\n'),
                inline: false
            });

        await i.update({ embeds: [updatedEmbed] });

        // Check if all ready
        if (readyCount === allMembers.length) {
            collector.stop('all_ready');
        }
    });

    collector.on('end', async (collected, reason) => {
        if (reason === 'all_ready') {
            const allReadyEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ ALL PLAYERS READY!')
                .setDescription(`The team is ready to play! Good luck!${teamRankInfo}`)
                .addFields({
                    name: '🔊 Voice Channel',
                    value: team.voiceChannelId ? `<#${team.voiceChannelId}>` : 'No voice channel',
                    inline: false
                })
                .setTimestamp();

            await readyMessage.edit({
                content: allMembers.map(m => `<@${m.id}>`).join(' '),
                embeds: [allReadyEmbed],
                components: []
            });
        } else {
            const timeoutEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('⏰ READY CHECK TIMEOUT')
                .setDescription('Not all players confirmed ready in time. The team will remain active.')
                .addFields({
                    name: '👥 Ready Status',
                    value: allMembers.map(m => {
                        const isReady = readyStatus.get(m.id);
                        return `${isReady ? '✅' : '❌'} ${m.displayName}`;
                    }).join('\n'),
                    inline: false
                })
                .setTimestamp();

            await readyMessage.edit({
                content: allMembers.map(m => `<@${m.id}>`).join(' '),
                embeds: [timeoutEmbed],
                components: []
            });
        }
    });
}

// Function to send DM notifications to all team members
async function notifyTeamMembers(team, embed, rankInfo) {
    const allMembers = [team.leader, ...team.members];

    for (const member of allMembers) {
        try {
            const user = await client.users.fetch(member.id);

            const dmEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🎉 Your Valorant Team is Ready!')
                .setDescription(`Your team is full and ready to play!${rankInfo}`)
                .addFields(
                    { name: '👥 Team Members', value: allMembers.map((m, i) => `${i === 0 ? '👑' : `${i + 1}.`} ${m.displayName}`).join('\n'), inline: false },
                    { name: '🔊 Voice Channel', value: team.voiceChannelId ? `<#${team.voiceChannelId}>` : 'No voice channel', inline: false }
                )
                .setFooter({ text: 'Good luck and have fun!' })
                .setTimestamp();

            await user.send({ embeds: [dmEmbed] });
            console.log(`[VALORANT TEAM] Sent DM notification to ${member.displayName}`);
        } catch (error) {
            console.error(`[VALORANT TEAM] Failed to send DM to ${member.displayName}:`, error.message);
            // Continue even if DM fails (user might have DMs disabled)
        }
    }
}

// Function to start AFK monitoring for team
function startAFKMonitoring(team, teamId) {
    const AFK_TIMEOUT = 5 * 60 * 1000; // 5 minutes
    const CHECK_INTERVAL = 60 * 1000; // Check every minute

    team.afkMonitoring = true;

    const intervalId = setInterval(async () => {
        const now = Date.now();

        // Check each member for AFK
        for (let i = team.members.length - 1; i >= 0; i--) {
            const member = team.members[i];
            const inactiveTime = now - (member.lastActivity || now);

            if (inactiveTime >= AFK_TIMEOUT) {
                console.log(`[VALORANT TEAM] Kicking AFK member ${member.displayName} from team ${teamId}`);

                // Remove member
                team.members.splice(i, 1);

                // Try to notify the member
                try {
                    const user = await client.users.fetch(member.id);
                    await user.send(`⏰ You were removed from the Valorant team due to inactivity (5 minutes).`);
                } catch (error) {
                    console.error(`[VALORANT TEAM] Could not DM ${member.displayName}:`, error.message);
                }

                // Update team display
                try {
                    const channel = await client.channels.fetch(team.channelId);
                    const message = await channel.messages.fetch(team.messageId);

                    const totalMembers = getTotalMembers(team);
                    const isFull = totalMembers >= 5;
                    const updatedEmbed = await createTeamEmbed(team);
                    const updatedComponents = createTeamButtons(teamId, isFull, totalMembers);

                    await message.edit({
                        embeds: [updatedEmbed.embed],
                        files: updatedEmbed.files,
                        components: updatedComponents
                    });

                    // Send notification in channel
                    await channel.send(`⏰ **${member.displayName}** was removed from the team due to inactivity.`);
                } catch (error) {
                    console.error('[VALORANT TEAM] Error updating team after AFK kick:', error);
                }
            }
        }

        // Stop monitoring if team is full or disbanded
        const currentTeam = activeTeams.get(teamId);
        if (!currentTeam || getTotalMembers(currentTeam) >= 5) {
            clearInterval(intervalId);
            if (currentTeam) {
                currentTeam.afkMonitoring = false;
            }
        }
    }, CHECK_INTERVAL);

    // Store interval for cleanup
    if (!activeTimers.has(teamId)) {
        activeTimers.set(teamId, []);
    }
    activeTimers.get(teamId).push(intervalId);
}

// Function to monitor voice channel inactivity (1 hour)
function monitorVoiceChannelInactivity(voiceChannelId, teamId) {
    const checkInterval = 5 * 60 * 1000; // Check every 5 minutes
    let lastActivity = Date.now();

    const intervalId = setInterval(async () => {
        try {
            const channel = await client.channels.fetch(voiceChannelId);
            if (!channel) {
                clearInterval(intervalId);
                return;
            }

            // Check if anyone is in the voice channel
            if (channel.members && channel.members.size > 0) {
                lastActivity = Date.now();
            } else {
                // Check if inactive for 1 hour
                const inactiveTime = Date.now() - lastActivity;
                if (inactiveTime >= 60 * 60 * 1000) { // 1 hour
                    console.log(`[VALORANT TEAM] Voice channel ${voiceChannelId} inactive for 1 hour, deleting...`);
                    await deleteVoiceChannel(voiceChannelId, teamId);
                    clearInterval(intervalId);
                }
            }
        } catch (error) {
            console.error(`[VALORANT TEAM] Error monitoring voice channel ${voiceChannelId}:`, error);
            clearInterval(intervalId);
        }
    }, checkInterval);

    // Store interval for cleanup
    if (!activeTimers.has(teamId)) {
        activeTimers.set(teamId, []);
    }
    activeTimers.get(teamId).push(intervalId);
}

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
    ctx.fillText('VALORANT TEAM BUILDER', 350, 40);
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
                    ctx.font = 'bold 16px Arial';
                    ctx.fillStyle = '#ffd700';
                    ctx.textAlign = 'center';
                    ctx.shadowColor = '#ffd700';
                    ctx.shadowBlur = 5;
                    ctx.fillText('LEADER', x + slotWidth/2, y - 5);
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
                ctx.font = '24px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('?', x + slotWidth/2, y + 50);
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

// Function to check if user can create a team
function canCreateTeam(userId) {
    // Check cooldown
    const lastCreated = userCooldowns.get(userId);
    if (lastCreated && Date.now() - lastCreated < TEAM_COOLDOWN) {
        const remaining = Math.ceil((TEAM_COOLDOWN - (Date.now() - lastCreated)) / 1000);
        return { canCreate: false, reason: `cooldown`, remaining };
    }

    // Check active teams limit
    const activeCount = userActiveTeams.get(userId) || 0;
    if (activeCount >= MAX_TEAMS_PER_USER) {
        return { canCreate: false, reason: `limit`, activeCount };
    }

    return { canCreate: true };
}

// Function to increment user's active team count
function incrementUserTeamCount(userId) {
    const current = userActiveTeams.get(userId) || 0;
    userActiveTeams.set(userId, current + 1);
    userCooldowns.set(userId, Date.now());
}

// Function to decrement user's active team count
function decrementUserTeamCount(userId) {
    const current = userActiveTeams.get(userId) || 0;
    if (current > 0) {
        userActiveTeams.set(userId, current - 1);
    }
}

// Function to calculate team statistics
async function calculateTeamStats(team) {
    const allMembers = [team.leader, ...team.members];
    const stats = {
        totalMembers: allMembers.length,
        registeredMembers: 0,
        ranks: [],
        averageRank: null,
        highestRank: null,
        lowestRank: null
    };

    for (const member of allMembers) {
        const rankInfo = await getUserRankInfo(member.id);
        if (rankInfo) {
            stats.registeredMembers++;
            stats.ranks.push({ member: member.displayName, ...rankInfo });
        }
    }

    if (stats.ranks.length > 0) {
        // Calculate average tier
        const avgTier = Math.round(stats.ranks.reduce((sum, r) => sum + r.tier, 0) / stats.ranks.length);
        stats.averageRank = apiHandler.RANK_MAPPING[avgTier] || apiHandler.RANK_MAPPING[0];

        // Find highest and lowest ranks
        const sortedRanks = [...stats.ranks].sort((a, b) => b.tier - a.tier);
        stats.highestRank = apiHandler.RANK_MAPPING[sortedRanks[0].tier];
        stats.lowestRank = apiHandler.RANK_MAPPING[sortedRanks[sortedRanks.length - 1].tier];
    }

    return stats;
}

// Function to save team to database history
async function saveTeamToHistory(team, stats) {
    const teamData = {
        id: team.id,
        leader: team.leader,
        members: team.members,
        guildId: team.guildId,
        channelId: team.channelId,
        createdAt: team.createdAt || new Date(),
        status: 'completed',
        totalJoins: team.totalJoins || team.members.length,
        totalLeaves: team.totalLeaves || 0,
        stats: stats
    };

    try {
        await teamHistoryDb.saveTeamToHistory(teamData);
        console.log(`[VALORANT TEAM] Saved team ${team.id} to database`);
    } catch (error) {
        console.error(`[VALORANT TEAM] Error saving team to database:`, error);
    }
}

// Function to get team statistics summary
async function getTeamStatsSummary(guildId) {
    try {
        // Get recent team history from database
        const recentTeams = await teamHistoryDb.getGuildTeamHistory(guildId, 100);

        if (recentTeams.length === 0) {
            return null;
        }

        const totalTeams = recentTeams.length;
        const teamsWithStats = recentTeams.filter(t => t.stats && t.stats.averageRank);

        let avgRankSum = 0;
        teamsWithStats.forEach(team => {
            if (team.stats.averageRank) {
                avgRankSum += team.stats.averageRank.tier || 0;
            }
        });

        const overallAvgTier = teamsWithStats.length > 0 ? Math.round(avgRankSum / teamsWithStats.length) : 0;

        return {
            totalTeams,
            teamsWithStats: teamsWithStats.length,
            overallAverageRank: apiHandler.RANK_MAPPING[overallAvgTier] || apiHandler.RANK_MAPPING[0],
            activeTeams: activeTeams.size
        };
    } catch (error) {
        console.error('[VALORANT TEAM] Error getting team stats summary:', error);
        return {
            totalTeams: 0,
            teamsWithStats: 0,
            overallAverageRank: apiHandler.RANK_MAPPING[0],
            activeTeams: activeTeams.size
        };
    }
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
    
    // Build voice channel text
    let voiceChannelText = '';
    if (team.voiceChannelId) {
        voiceChannelText = `\n🔊 **Voice Channel:** <#${team.voiceChannelId}>`;
    }

    // Build team name text
    const teamNameText = team.customName ? `\n**Team Name:** ${team.customName}` : '';

    const embed = new EmbedBuilder()
        .setColor(totalMembers >= 5 ? '#00ff88' : '#ff4654')
        .setTitle(team.customName ? `🎯 ${team.customName}` : '🎯 Valorant Team Builder')
        .setDescription(`**Team Leader:** ${team.leader.displayName}\n**Leader Rank:** ${leaderRankText}\n**Team Status:** ${totalMembers}/5 Players${voiceChannelText}${teamNameText}`)
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
function createTeamButtons(teamId, isFull, memberCount = 0) {
    // Extract just the message ID from the full team ID
    const messageId = teamId.replace('valorant_team_', '');

    // Row 1: Main action buttons
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

    const closeButton = new ButtonBuilder()
        .setCustomId(`valorant_close_${messageId}`)
        .setLabel('Close Team')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✅')
        .setDisabled(memberCount < 2); // Must have at least 2 people (leader + 1)

    const disbandButton = new ButtonBuilder()
        .setCustomId(`valorant_disband_${messageId}`)
        .setLabel('Disband')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🗑️');

    const row1 = new ActionRowBuilder().addComponents(joinButton, leaveButton, closeButton, disbandButton);

    // Row 2: Management buttons (Transfer, Invite, Set Name)
    const transferButton = new ButtonBuilder()
        .setCustomId(`valorant_transfer_${messageId}`)
        .setLabel('Transfer Leader')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('👑');

    const inviteButton = new ButtonBuilder()
        .setCustomId(`valorant_invite_${messageId}`)
        .setLabel('Invite Player')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📨')
        .setDisabled(isFull);

    const setNameButton = new ButtonBuilder()
        .setCustomId(`valorant_setname_${messageId}`)
        .setLabel('Set Name')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✏️');

    const row2 = new ActionRowBuilder().addComponents(transferButton, inviteButton, setNameButton);

    return [row1, row2];
}

// Enhanced helper function to format team members list with ranks (now with persistent storage)
async function formatEnhancedTeamMembersList(team) {
    const User = require('../database/models/User');
    const members = [];

    // Add leader with rank and agents
    const leaderRankInfo = await getUserRankInfo(team.leader.id);
    const leaderUser = await User.findOne({ userId: team.leader.id });
    const leaderAgents = leaderUser?.valorant?.preferredAgents || [];

    const leaderRankText = leaderRankInfo ?
        `(${leaderRankInfo.name}${leaderRankInfo.rr !== undefined ? ` - ${leaderRankInfo.rr} RR` : ''})` :
        '(Not registered)';
    const leaderAgentText = leaderAgents.length > 0 ? ` 🎮 ${leaderAgents.join(', ')}` : '';
    members.push(`👑 **${team.leader.displayName}** ${leaderRankText}${leaderAgentText}`);

    // Add other members with ranks and agents
    for (let i = 0; i < team.members.length; i++) {
        const member = team.members[i];
        const memberRankInfo = await getUserRankInfo(member.id);
        const memberUser = await User.findOne({ userId: member.id });
        const memberAgents = memberUser?.valorant?.preferredAgents || [];

        const memberRankText = memberRankInfo ?
            `(${memberRankInfo.name}${memberRankInfo.rr !== undefined ? ` - ${memberRankInfo.rr} RR` : ''})` :
            '(Not registered)';
        const memberAgentText = memberAgents.length > 0 ? ` 🎮 ${memberAgents.join(', ')}` : '';
        members.push(`${i + 2}. **${member.displayName}** ${memberRankText}${memberAgentText}`);
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
// Commands to view team history and stats
async function handleTeamHistoryCommand(message) {
    const history = getUserTeamHistory(message.author.id);

    if (history.length === 0) {
        return message.reply('📋 You haven\'t been part of any completed teams yet! Create a team with `!valorantteam` or mention <@&' + VALORANT_ROLE_ID + '>');
    }

    const recentTeams = history.slice(-10).reverse();

    const embed = new EmbedBuilder()
        .setColor('#ff4654')
        .setTitle(`📊 ${message.author.username}'s Team History`)
        .setDescription(`You've been part of **${history.length}** completed team(s)`)
        .setTimestamp();

    for (const [index, team] of recentTeams.entries()) {
        const wasLeader = team.leaderId === message.author.id;
        const members = wasLeader ? team.memberNames.join(', ') : `${team.leaderName} (leader), ${team.memberNames.join(', ')}`;
        const avgRank = team.stats?.averageRank?.name || 'N/A';

        embed.addFields({
            name: `${index + 1}. ${wasLeader ? '👑' : '👤'} Team - ${new Date(team.completedAt).toLocaleDateString()}`,
            value: `**Members:** ${members}\n**Avg Rank:** ${avgRank}\n**Registered:** ${team.stats?.registeredMembers || 0}/${TEAM_SIZE}`,
            inline: false
        });
    }

    return message.channel.send({ embeds: [embed] });
}

async function handleTeamStatsCommand(message) {
    const summary = await getTeamStatsSummary(message.guild.id);

    if (!summary || summary.totalTeams === 0) {
        return message.reply('📊 No team statistics available yet! Teams must be completed to appear in stats.');
    }

    const embed = new EmbedBuilder()
        .setColor('#ff4654')
        .setTitle('📊 Server Team Statistics')
        .setDescription('Overall Valorant team statistics')
        .addFields(
            { name: '🎮 Total Teams Completed', value: summary.totalTeams.toString(), inline: true },
            { name: '📊 Teams with Rank Data', value: summary.teamsWithStats.toString(), inline: true },
            { name: '⚡ Currently Active', value: summary.activeTeams.toString(), inline: true },
            { name: '🏆 Overall Average Rank', value: summary.overallAverageRank.name, inline: false }
        )
        .setFooter({ text: 'Register with !valstats to contribute to team statistics!' })
        .setTimestamp();

    return message.channel.send({ embeds: [embed] });
}

// Block user command handler
async function handleBlockUserCommand(message) {
    const User = require('../database/models/User');

    // Check if user mentioned someone
    if (message.mentions.users.size === 0) {
        return message.reply('❌ Please mention a user to block. Usage: `!valblock @user`');
    }

    const targetUser = message.mentions.users.first();

    // Can't block yourself
    if (targetUser.id === message.author.id) {
        return message.reply('❌ You cannot block yourself!');
    }

    // Can't block bots
    if (targetUser.bot) {
        return message.reply('❌ You cannot block bots!');
    }

    try {
        const user = await User.findOneAndUpdate(
            { userId: message.author.id },
            {
                $addToSet: { 'valorant.blockedUsers': targetUser.id }
            },
            { upsert: true, new: true }
        );

        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🚫 User Blocked')
            .setDescription(`You have blocked **${targetUser.displayName || targetUser.username}**`)
            .addFields({
                name: 'What this means:',
                value: '• They cannot join your Valorant teams\n• You cannot join their teams\n• Use `!valunblock @user` to unblock them',
                inline: false
            })
            .setTimestamp();

        console.log(`[VALORANT] ${message.author.username} blocked ${targetUser.username}`);
        return message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('[VALORANT] Error blocking user:', error);
        return message.reply('❌ An error occurred while blocking the user. Please try again.');
    }
}

// Unblock user command handler
async function handleUnblockUserCommand(message) {
    const User = require('../database/models/User');

    // Check if user mentioned someone
    if (message.mentions.users.size === 0) {
        return message.reply('❌ Please mention a user to unblock. Usage: `!valunblock @user`');
    }

    const targetUser = message.mentions.users.first();

    try {
        const user = await User.findOneAndUpdate(
            { userId: message.author.id },
            {
                $pull: { 'valorant.blockedUsers': targetUser.id }
            },
            { new: true }
        );

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ User Unblocked')
            .setDescription(`You have unblocked **${targetUser.displayName || targetUser.username}**`)
            .addFields({
                name: 'What this means:',
                value: '• They can now join your Valorant teams\n• You can join their teams',
                inline: false
            })
            .setTimestamp();

        console.log(`[VALORANT] ${message.author.username} unblocked ${targetUser.username}`);
        return message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('[VALORANT] Error unblocking user:', error);
        return message.reply('❌ An error occurred while unblocking the user. Please try again.');
    }
}

// Set preferred agents command handler
async function handleSetAgentsCommand(message) {
    const User = require('../database/models/User');

    const VALID_AGENTS = [
        'Brimstone', 'Phoenix', 'Sage', 'Sova', 'Viper',
        'Cypher', 'Reyna', 'Killjoy', 'Breach', 'Omen',
        'Jett', 'Raze', 'Skye', 'Yoru', 'Astra',
        'KAY/O', 'Chamber', 'Neon', 'Fade', 'Harbor',
        'Gekko', 'Deadlock', 'Iso', 'Clove', 'Vyse',
        'Veto', 'Waylay', 'Tejo'
    ];

    // Parse agents from command
    const input = message.content.slice('!valagents '.length).trim();

    if (!input) {
        return message.reply('❌ Please provide agent names. Usage: `!valagents Jett, Reyna, Phoenix` (max 3)');
    }

    const agents = input.split(',').map(a => a.trim());

    if (agents.length > 3) {
        return message.reply('❌ You can only set up to 3 preferred agents!');
    }

    // Validate agents
    const validatedAgents = [];
    const invalidAgents = [];

    for (const agent of agents) {
        const matchedAgent = VALID_AGENTS.find(a => a.toLowerCase() === agent.toLowerCase());
        if (matchedAgent) {
            validatedAgents.push(matchedAgent);
        } else {
            invalidAgents.push(agent);
        }
    }

    if (invalidAgents.length > 0) {
        return message.reply(`❌ Invalid agent(s): ${invalidAgents.join(', ')}\n\nValid agents: ${VALID_AGENTS.join(', ')}`);
    }

    try {
        await User.findOneAndUpdate(
            { userId: message.author.id },
            {
                $set: { 'valorant.preferredAgents': validatedAgents }
            },
            { upsert: true, new: true }
        );

        const embed = new EmbedBuilder()
            .setColor('#00ff88')
            .setTitle('✅ Preferred Agents Updated')
            .setDescription(`Your preferred agents have been set to:\n${validatedAgents.map(a => `• ${a}`).join('\n')}`)
            .addFields({
                name: 'Where will this show?',
                value: 'Your preferred agents will appear in team displays when you join!',
                inline: false
            })
            .setTimestamp();

        console.log(`[VALORANT] ${message.author.username} set preferred agents: ${validatedAgents.join(', ')}`);
        return message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('[VALORANT] Error setting preferred agents:', error);
        return message.reply('❌ An error occurred while setting your preferred agents. Please try again.');
    }
}

// Match result reporting command handler
async function handleMatchReportCommand(message) {
    const TeamHistory = require('../database/models/TeamHistory');

    // Parse command: !valreport win 13-7 or !valreport loss 5-13
    const args = message.content.slice('!valreport '.length).trim().split(' ');

    if (args.length < 1) {
        return message.reply('❌ Usage: `!valreport win 13-7` or `!valreport loss 5-13`');
    }

    const result = args[0].toLowerCase();
    const score = args[1] || null;

    if (!['win', 'loss'].includes(result)) {
        return message.reply('❌ Result must be either `win` or `loss`');
    }

    try {
        // Find user's most recent team (within last 2 hours)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const recentTeam = await TeamHistory.findOne({
            $or: [
                { leaderId: message.author.id },
                { memberIds: message.author.id }
            ],
            completedAt: { $gte: twoHoursAgo },
            matchResult: { $in: ['pending', null] }
        }).sort({ completedAt: -1 });

        if (!recentTeam) {
            return message.reply('❌ No recent team found to report. You must report within 2 hours of team completion!');
        }

        // Update the team with match result
        recentTeam.matchResult = result;
        recentTeam.matchScore = score;
        recentTeam.reportedBy = message.author.id;
        recentTeam.reportedAt = new Date();
        await recentTeam.save();

        const embed = new EmbedBuilder()
            .setColor(result === 'win' ? '#00ff00' : '#ff0000')
            .setTitle(`${result === 'win' ? '🎉 Victory!' : '😔 Defeat'} Match Result Reported`)
            .setDescription(`Match result has been recorded for your recent team.`)
            .addFields(
                { name: 'Result', value: result.toUpperCase(), inline: true },
                { name: 'Score', value: score || 'Not provided', inline: true },
                { name: 'Team Members', value: `${recentTeam.leaderName} (leader), ${recentTeam.memberNames.join(', ')}`, inline: false }
            )
            .setFooter({ text: 'Use !valmatchhistory to see your match history' })
            .setTimestamp();

        console.log(`[VALORANT] ${message.author.username} reported ${result} for team ${recentTeam.teamId}`);
        return message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('[VALORANT] Error reporting match result:', error);
        return message.reply('❌ An error occurred while reporting the match result. Please try again.');
    }
}

// Match history command handler
async function handleMatchHistoryCommand(message) {
    const TeamHistory = require('../database/models/TeamHistory');

    try {
        const matches = await TeamHistory.find({
            $or: [
                { leaderId: message.author.id },
                { memberIds: message.author.id }
            ],
            matchResult: { $in: ['win', 'loss'] }
        })
        .sort({ completedAt: -1 })
        .limit(10);

        if (matches.length === 0) {
            return message.reply('📊 No match history found! Report your first match with `!valreport win 13-7`');
        }

        const wins = matches.filter(m => m.matchResult === 'win').length;
        const losses = matches.filter(m => m.matchResult === 'loss').length;
        const winRate = ((wins / (wins + losses)) * 100).toFixed(1);

        const embed = new EmbedBuilder()
            .setColor('#ff4654')
            .setTitle('📊 Your Match History')
            .setDescription(`**Record:** ${wins}W - ${losses}L (${winRate}% win rate)`)
            .setFooter({ text: `Showing last ${matches.length} matches` })
            .setTimestamp();

        matches.slice(0, 5).forEach((match, index) => {
            const resultEmoji = match.matchResult === 'win' ? '✅' : '❌';
            const score = match.matchScore || 'N/A';
            const date = new Date(match.completedAt).toLocaleDateString();

            embed.addFields({
                name: `${resultEmoji} ${match.matchResult.toUpperCase()} - ${date}`,
                value: `**Score:** ${score}\n**Team:** ${match.leaderName}, ${match.memberNames.slice(0, 2).join(', ')}${match.memberNames.length > 2 ? '...' : ''}`,
                inline: true
            });
        });

        return message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('[VALORANT] Error fetching match history:', error);
        return message.reply('❌ An error occurred while fetching your match history. Please try again.');
    }
}

// View block list command handler
async function handleBlockListCommand(message) {
    const User = require('../database/models/User');

    try {
        const user = await User.findOne({ userId: message.author.id });

        const blockedUsers = user?.valorant?.blockedUsers || [];

        if (blockedUsers.length === 0) {
            return message.reply('✅ You haven\'t blocked anyone yet. Use `!valblock @user` to block toxic players.');
        }

        // Fetch display names for blocked users
        const blockedUserDetails = await Promise.all(
            blockedUsers.map(async (userId) => {
                try {
                    const blockedUser = await client.users.fetch(userId);
                    return `• ${blockedUser.displayName || blockedUser.username} (<@${userId}>)`;
                } catch (error) {
                    return `• Unknown User (ID: ${userId})`;
                }
            })
        );

        const embed = new EmbedBuilder()
            .setColor('#ff4654')
            .setTitle('🚫 Your Blocked Users')
            .setDescription(blockedUserDetails.join('\n'))
            .addFields({
                name: 'Commands',
                value: '`!valunblock @user` - Unblock a user',
                inline: false
            })
            .setFooter({ text: `${blockedUsers.length} user(s) blocked` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('[VALORANT] Error fetching block list:', error);
        return message.reply('❌ An error occurred while fetching your block list. Please try again.');
    }
}

module.exports = (client) => {
    // API handler is initialized in index.js
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
                const totalMembers = getTotalMembers(team);
                const isFull = totalMembers >= 5;
                const updatedEmbed = await createTeamEmbed(team);
                const updatedComponents = createTeamButtons(teamId, isFull, totalMembers);
                
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
                    components: updatedComponents
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

            // Team history command
            if (message.content.toLowerCase() === '!valteams' || message.content.toLowerCase() === '!teamhistory') {
                return handleTeamHistoryCommand(message);
            }

            // Team statistics command
            if (message.content.toLowerCase() === '!teamstats') {
                return handleTeamStatsCommand(message);
            }

            // Block user command
            if (message.content.toLowerCase().startsWith('!valblock ')) {
                return handleBlockUserCommand(message);
            }

            // Unblock user command
            if (message.content.toLowerCase().startsWith('!valunblock ')) {
                return handleUnblockUserCommand(message);
            }

            // View block list command
            if (message.content.toLowerCase() === '!valblocklist') {
                return handleBlockListCommand(message);
            }

            // Set preferred agents command
            if (message.content.toLowerCase().startsWith('!valagents ')) {
                return handleSetAgentsCommand(message);
            }

            // Report match result command
            if (message.content.toLowerCase().startsWith('!valreport ')) {
                return handleMatchReportCommand(message);
            }

            // View match history command
            if (message.content.toLowerCase() === '!valmatchhistory') {
                return handleMatchHistoryCommand(message);
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

                // Check if user can create a team (cooldown + limit)
                const canCreate = canCreateTeam(message.author.id);
                if (!canCreate.canCreate) {
                    if (canCreate.reason === 'cooldown') {
                        return message.reply(`⏰ Please wait ${canCreate.remaining} seconds before creating another team.`);
                    } else if (canCreate.reason === 'limit') {
                        return message.reply(`❌ You already have ${canCreate.activeCount} active team(s). Please wait for it to fill or disband it first.`);
                    }
                }

                // Always use a unique and consistent teamId
                const teamId = `valorant_team_${message.id}`;

                // Validate team size
                if (TEAM_SIZE < 2 || TEAM_SIZE > 10) {
                    console.error(`Invalid team size: ${TEAM_SIZE}. Must be between 2 and 10.`);
                    return message.reply('❌ Invalid team configuration. Please contact an administrator.');
                }

                // Create new team with the message author as leader
                const team = {
                    id: teamId,
                    guildId: message.guild.id,
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
                    createdAt: new Date(),
                    totalJoins: 0,
                    totalLeaves: 0
                };

                // Create the team embed and buttons
                try {
                    // Create temporary voice channel in Games category
                    let voiceChannel = null;
                    try {
                        const GAMES_CATEGORY_ID = '1001912279559852032';
                        voiceChannel = await message.guild.channels.create({
                            name: `🎮 ${message.author.displayName || message.author.username}'s Team`,
                            type: 2, // Voice channel
                            parent: GAMES_CATEGORY_ID,
                            userLimit: TEAM_SIZE,
                            reason: 'Valorant team voice channel'
                        });

                        team.voiceChannelId = voiceChannel.id;
                        team.voiceChannelCreatedAt = Date.now();
                        console.log(`[VALORANT TEAM] Created voice channel ${voiceChannel.id} for team ${teamId}`);

                        // Start monitoring for inactivity
                        monitorVoiceChannelInactivity(voiceChannel.id, teamId);
                    } catch (voiceError) {
                        console.error('[VALORANT TEAM] Failed to create voice channel:', voiceError);
                        // Continue without voice channel
                    }

                    const embed = await createTeamEmbed(team);
                    const components = createTeamButtons(teamId, false, 1); // Just leader initially

                    const teamMessage = await message.channel.send({
                        embeds: [embed.embed],
                        files: embed.files,
                        components: components
                    });

                    // Store the team with message ID immediately after sending
                    team.messageId = teamMessage.id;
                    activeTeams.set(teamId, team);

                    // Increment user's active team count
                    incrementUserTeamCount(message.author.id);

                    console.log(`✅ Team created successfully: ${teamId} by ${message.author.username}`);

                    // Set up the resend timer to keep message at bottom of chat
                    const resendTimer = setTimeout(() => resendTeamMessage(teamId), RESEND_INTERVAL);
                    team.resendTimer = resendTimer;

                    // Store timer for cleanup
                    if (!activeTimers.has(teamId)) {
                        activeTimers.set(teamId, []);
                    }
                    activeTimers.get(teamId).push(resendTimer);

                    // Delete after 30 minutes if team isn't full
                    const expiryTimer = setTimeout(() => {
                        const currentTeam = activeTeams.get(teamId);
                        if (currentTeam && getTotalMembers(currentTeam) < TEAM_SIZE) {
                            // Clear all timers for this team
                            cleanupTeamTimers(teamId);

                            // Decrement user's active team count
                            decrementUserTeamCount(currentTeam.leader.id);

                            activeTeams.delete(teamId);

                            // Attempt to delete the most recent message
                            client.channels.fetch(currentTeam.channelId).then(channel => {
                                channel.messages.fetch(currentTeam.messageId).then(msg => {
                                    msg.delete().catch(() => {});
                                }).catch(() => {});
                            }).catch(() => {});

                            console.log(`⏰ Team ${teamId} expired after 2 hours`);
                        }
                    }, 2 * 60 * 60 * 1000); // 2 hours

                    // Store expiry timer for cleanup
                    activeTimers.get(teamId).push(expiryTimer);

                } catch (error) {
                    console.error('❌ Error creating team message:', error);
                    message.reply(`❌ There was an error creating the team: ${error.message}\nPlease try again in a moment.`).catch(console.error);
                }
            }
        });

        // Handle modal submissions for team name
        client.on('interactionCreate', async (interaction) => {
            if (interaction.isModalSubmit() && interaction.customId.startsWith('valorant_namemodal_')) {
                const teamId = interaction.customId.replace('valorant_namemodal_', '');
                const fullTeamId = `valorant_team_${teamId}`;
                const team = activeTeams.get(fullTeamId);

                if (!team) {
                    return interaction.reply({
                        content: '❌ This team is no longer active.',
                        ephemeral: true
                    });
                }

                const newName = interaction.fields.getTextInputValue('teamName');

                // Validate name (no profanity check for now, but you could add one)
                if (newName.length < 2) {
                    return interaction.reply({
                        content: '❌ Team name must be at least 2 characters!',
                        ephemeral: true
                    });
                }

                team.customName = newName;

                try {
                    await interaction.deferUpdate();

                    // Update the team display
                    const totalMembers = getTotalMembers(team);
                    const isFull = totalMembers >= 5;
                    const updatedEmbed = await createTeamEmbed(team);
                    const updatedComponents = createTeamButtons(fullTeamId, isFull, totalMembers);

                    await interaction.message.edit({
                        embeds: [updatedEmbed.embed],
                        files: updatedEmbed.files,
                        components: updatedComponents
                    });

                    await interaction.followUp({
                        content: `✏️ Team name set to: **${newName}**`,
                        ephemeral: false
                    });

                    console.log(`[VALORANT TEAM] Team ${fullTeamId} renamed to "${newName}"`);
                } catch (error) {
                    console.error('[VALORANT TEAM] Error setting team name:', error);
                    await interaction.followUp({
                        content: `❌ Error setting team name: ${error.message}`,
                        ephemeral: true
                    }).catch(console.error);
                }

                return;
            }
        });

        // Handle button and select menu interactions (FIXED - only handle Valorant team buttons/menus)
        client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

            // CRITICAL FIX: Only handle Valorant team interactions
            if (!interaction.customId.startsWith('valorant_')) {
                return; // Not a Valorant team interaction, ignore it
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

                // Check if leader has blocked this user or vice versa
                const User = require('../database/models/User');
                try {
                    const leaderData = await User.findOne({ userId: team.leader.id });
                    const joinerData = await User.findOne({ userId: userId });

                    const leaderBlockedJoiner = leaderData?.valorant?.blockedUsers?.includes(userId);
                    const joinerBlockedLeader = joinerData?.valorant?.blockedUsers?.includes(team.leader.id);

                    if (leaderBlockedJoiner) {
                        return interaction.reply({
                            content: '❌ You have been blocked by the team leader and cannot join this team.',
                            ephemeral: true
                        });
                    }

                    if (joinerBlockedLeader) {
                        return interaction.reply({
                            content: '❌ You have blocked the team leader. Please unblock them to join this team.',
                            ephemeral: true
                        });
                    }

                    // Check if any team member has blocked this user
                    for (const member of team.members) {
                        const memberData = await User.findOne({ userId: member.id });
                        if (memberData?.valorant?.blockedUsers?.includes(userId)) {
                            return interaction.reply({
                                content: `❌ You have been blocked by **${member.displayName}** and cannot join this team.`,
                                ephemeral: true
                            });
                        }
                        if (joinerData?.valorant?.blockedUsers?.includes(member.id)) {
                            return interaction.reply({
                                content: `❌ You have blocked **${member.displayName}**. Please unblock them to join this team.`,
                                ephemeral: true
                            });
                        }
                    }
                } catch (error) {
                    console.error('[VALORANT] Error checking block list:', error);
                    // Continue anyway - don't block on error
                }

                // Add user to team with activity tracking
                team.members.push({
                    ...userInfo,
                    lastActivity: Date.now()
                });

                // Update leader activity as well
                if (!team.leader.lastActivity) {
                    team.leader.lastActivity = Date.now();
                }

                // Start AFK monitoring if not already started
                if (!team.afkMonitoring) {
                    startAFKMonitoring(team, fullTeamId);
                }

                try{
                    // Defer the reply to prevent timeout (interactions must respond within 3 seconds)
                    await interaction.deferUpdate();
                    
                    // Update the team display first
                    const totalMembers = getTotalMembers(team);
                    const isFull = totalMembers >= 5;
                    const updatedEmbed = await createTeamEmbed(team);
                    const updatedComponents = createTeamButtons(fullTeamId, isFull, totalMembers);

                    await interaction.editReply({
                        embeds: [updatedEmbed.embed],
                        files: updatedEmbed.files,
                        components: updatedComponents
                    });

                    // If team is full, celebrate!
                    if (isFull) {
                        // Clear the resend timer since team is full
                        if (team.resendTimer) {
                            clearTimeout(team.resendTimer);
                            team.resendTimer = null;
                        }

                        // Calculate team statistics
                        const teamStats = await calculateTeamStats(team);

                        // Save team to history
                        saveTeamToHistory(team, teamStats);

                        // Decrement user's active team count
                        decrementUserTeamCount(team.leader.id);

                        // Build team rank info
                        let teamRankInfo = '';
                        if (teamStats.averageRank) {
                            teamRankInfo = `\n🏆 **Team Average Rank:** ${teamStats.averageRank.name} (${teamStats.registeredMembers}/${TEAM_SIZE} registered)`;

                            if (teamStats.highestRank && teamStats.lowestRank) {
                                teamRankInfo += `\n📊 **Rank Range:** ${teamStats.lowestRank.name} - ${teamStats.highestRank.name}`;
                            }
                        }

                        const celebrationEmbed = new EmbedBuilder()
                            .setColor('#00ff00')
                            .setTitle('🎉 TEAM COMPLETE!')
                            .setDescription(`Your Valorant team is ready to play! Good luck and have fun!${teamRankInfo}`)
                            .addFields(
                                { name: '🎮 Ready to Queue!', value: 'Your 5-stack is complete and ready for competitive play!', inline: false },
                                { name: '📊 Team Stats', value: `**Registered:** ${teamStats.registeredMembers}/${TEAM_SIZE}\n**Created:** <t:${Math.floor(new Date(team.createdAt).getTime() / 1000)}:R>`, inline: true },
                                { name: '💡 Tip', value: 'Unregistered players can use `!valstats` to show their rank in future teams!', inline: true }
                            )
                            .setTimestamp();

                        // Send initial completion message
                        await interaction.followUp({
                            embeds: [celebrationEmbed]
                        });

                        console.log(`🎉 Team ${fullTeamId} completed with stats:`, teamStats);

                        // Send DM notifications to all team members
                        await notifyTeamMembers(team, celebrationEmbed, teamRankInfo);

                        // Start ready check
                        await startReadyCheck(team, interaction.channel, teamStats, teamRankInfo);

                        // Cleanup timers since team is now complete
                        cleanupTeamTimers(fullTeamId);

                        // Keep voice channel for full teams (they're about to play)
                        // It will auto-delete after 1 hour of inactivity

                        // Auto-delete team after 5 minutes when full
                        const completionTimer = setTimeout(() => {
                            activeTeams.delete(fullTeamId);
                            interaction.message.delete().catch(() => {});
                        }, 5 * 60 * 1000);

                        // Store completion timer
                        if (!activeTimers.has(fullTeamId)) {
                            activeTimers.set(fullTeamId, []);
                        }
                        activeTimers.get(fullTeamId).push(completionTimer);
                    }
                } catch (error) {
                    console.error('Error updating team:', error);
                    // If interaction is already acknowledged, we can't reply again
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ There was an error updating the team. Please try again.',
                            ephemeral: true
                        }).catch(console.error);
                    }
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
                    // Defer the reply to prevent timeout
                    await interaction.deferUpdate();
                    
                    // Update the team display
                    const totalMembers = getTotalMembers(team);
                    const isFull = totalMembers >= 5;
                    const updatedEmbed = await createTeamEmbed(team);
                    const updatedComponents = createTeamButtons(fullTeamId, isFull, totalMembers);

                    await interaction.editReply({
                        embeds: [updatedEmbed.embed],
                        files: updatedEmbed.files,
                        components: updatedComponents
                    });
                } catch (error) {
                    console.error('Error updating team after leave:', error);
                    // If interaction is already acknowledged, we can't reply again
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: '❌ There was an error updating the team. Please try again.',
                            ephemeral: true
                        }).catch(console.error);
                    }
                }

            } else if (action === 'disband') {
                // Only leader can disband
                if (userId !== team.leader.id) {
                    return interaction.reply({
                        content: '❌ Only the team leader can disband the team!',
                        ephemeral: true
                    });
                }

                try {
                    // Cleanup all timers for this team
                    cleanupTeamTimers(fullTeamId);

                    // Delete voice channel if it exists
                    if (team.voiceChannelId) {
                        await deleteVoiceChannel(team.voiceChannelId, fullTeamId);
                    }

                    // Decrement user's active team count
                    decrementUserTeamCount(team.leader.id);

                    // Remove team from active teams
                    activeTeams.delete(fullTeamId);

                    const disbandEmbed = new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Team Disbanded')
                        .setDescription('This team has been disbanded by the leader.')
                        .addFields({
                            name: '📊 Team Stats',
                            value: `**Duration:** <t:${Math.floor(new Date(team.createdAt).getTime() / 1000)}:R>\n**Members:** ${getTotalMembers(team)}/${TEAM_SIZE}`,
                            inline: false
                        })
                        .setTimestamp();

                    await interaction.update({
                        embeds: [disbandEmbed],
                        components: []
                    });

                    console.log(`🗑️ Team ${fullTeamId} disbanded by ${interaction.user.username}`);

                    // Delete the message after 5 seconds
                    setTimeout(() => {
                        interaction.message.delete().catch(() => {});
                    }, 5000);
                } catch (error) {
                    console.error('❌ Error disbanding team:', error);
                    await interaction.reply({
                        content: `❌ There was an error disbanding the team: ${error.message}`,
                        ephemeral: true
                    }).catch(console.error);
                }

                return;

            } else if (action === 'close') {
                // Only leader can close the team
                if (userId !== team.leader.id) {
                    return interaction.reply({
                        content: '❌ Only the team leader can close the team!',
                        ephemeral: true
                    });
                }

                // Must have at least 2 people (leader + 1)
                const totalMembers = getTotalMembers(team);
                if (totalMembers < 2) {
                    return interaction.reply({
                        content: '❌ You need at least 2 people to close a team!',
                        ephemeral: true
                    });
                }

                try {
                    await interaction.deferUpdate();

                    // Cleanup all timers for this team
                    cleanupTeamTimers(fullTeamId);

                    // Keep voice channel for closed teams (they might still be playing)
                    // It will auto-delete after 1 hour of inactivity

                    // Calculate team statistics
                    const teamStats = await calculateTeamStats(team);

                    // Save team to history
                    await saveTeamToHistory(team, teamStats);

                    // Decrement user's active team count
                    decrementUserTeamCount(team.leader.id);

                    // Build team rank info
                    let teamRankInfo = '';
                    if (teamStats.averageRank) {
                        teamRankInfo = `\n🏆 **Team Average Rank:** ${teamStats.averageRank.name} (${teamStats.registeredMembers}/${totalMembers} registered)`;

                        if (teamStats.highestRank && teamStats.lowestRank) {
                            teamRankInfo += `\n📊 **Rank Range:** ${teamStats.lowestRank.name} - ${teamStats.highestRank.name}`;
                        }
                    }

                    const closeEmbed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('✅ TEAM CLOSED')
                        .setDescription(`Your Valorant team is ready to play with ${totalMembers} members! Good luck and have fun!${teamRankInfo}`)
                        .addFields({
                            name: '👥 Team Members',
                            value: await formatEnhancedTeamMembersList(team),
                            inline: false
                        })
                        .setTimestamp();

                    await interaction.editReply({
                        embeds: [closeEmbed],
                        components: []
                    });

                    console.log(`✅ Team ${fullTeamId} closed by ${interaction.user.username} with ${totalMembers} members`);

                    // Auto-delete team after 5 minutes
                    const completionTimer = setTimeout(() => {
                        activeTeams.delete(fullTeamId);
                        interaction.message.delete().catch(() => {});
                    }, 5 * 60 * 1000);

                    // Store completion timer
                    if (!activeTimers.has(fullTeamId)) {
                        activeTimers.set(fullTeamId, []);
                    }
                    activeTimers.get(fullTeamId).push(completionTimer);

                } catch (error) {
                    console.error('❌ Error closing team:', error);
                    await interaction.followUp({
                        content: `❌ There was an error closing the team: ${error.message}`,
                        ephemeral: true
                    }).catch(console.error);
                }

                return;

            } else if (action === 'transfer') {
                // Only leader can transfer leadership
                if (userId !== team.leader.id) {
                    return interaction.reply({
                        content: '❌ Only the team leader can transfer leadership!',
                        ephemeral: true
                    });
                }

                // Must have at least 1 member to transfer to
                if (team.members.length === 0) {
                    return interaction.reply({
                        content: '❌ There must be at least one team member to transfer leadership to!',
                        ephemeral: true
                    });
                }

                // Create select menu with team members
                const SelectMenuBuilder = require('discord.js').StringSelectMenuBuilder;
                const selectMenu = new SelectMenuBuilder()
                    .setCustomId(`valorant_selecttransfer_${teamId}`)
                    .setPlaceholder('Select new team leader')
                    .addOptions(team.members.map(member => ({
                        label: member.displayName,
                        value: member.id,
                        description: `Transfer leadership to ${member.displayName}`
                    })));

                const selectRow = new ActionRowBuilder().addComponents(selectMenu);

                await interaction.reply({
                    content: '👑 Select a team member to transfer leadership to:',
                    components: [selectRow],
                    ephemeral: true
                });

                return;

            } else if (action === 'invite') {
                // Only leader can invite
                if (userId !== team.leader.id) {
                    return interaction.reply({
                        content: '❌ Only the team leader can invite players!',
                        ephemeral: true
                    });
                }

                // Check if team is full
                if (getTotalMembers(team) >= 5) {
                    return interaction.reply({
                        content: '❌ Team is already full!',
                        ephemeral: true
                    });
                }

                await interaction.reply({
                    content: '📨 To invite a player, mention them in chat with the command:\n`@username join my team!`\n\nThey can also click the "Join Team" button on the team display.',
                    ephemeral: true
                });

                return;

            } else if (action === 'setname') {
                // Only leader can set team name
                if (userId !== team.leader.id) {
                    return interaction.reply({
                        content: '❌ Only the team leader can set the team name!',
                        ephemeral: true
                    });
                }

                // Show modal for team name input
                const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

                const modal = new ModalBuilder()
                    .setCustomId(`valorant_namemodal_${teamId}`)
                    .setTitle('Set Team Name');

                const nameInput = new TextInputBuilder()
                    .setCustomId('teamName')
                    .setLabel('Team Name (max 30 characters)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Enter your team name...')
                    .setRequired(true)
                    .setMaxLength(30)
                    .setValue(team.customName || '');

                const actionRow = new ActionRowBuilder().addComponents(nameInput);
                modal.addComponents(actionRow);

                await interaction.showModal(modal);

                return;

            } else if (action === 'selecttransfer') {
                // This handles the select menu from transfer
                if (!interaction.isStringSelectMenu()) return;

                const newLeaderId = interaction.values[0];
                const newLeader = team.members.find(m => m.id === newLeaderId);

                if (!newLeader) {
                    return interaction.reply({
                        content: '❌ Selected member not found in team!',
                        ephemeral: true
                    });
                }

                try {
                    // Move current leader to members
                    team.members = team.members.filter(m => m.id !== newLeaderId);
                    team.members.push(team.leader);

                    // Set new leader
                    team.leader = newLeader;

                    await interaction.deferUpdate();

                    // Update the team display
                    const totalMembers = getTotalMembers(team);
                    const isFull = totalMembers >= 5;
                    const updatedEmbed = await createTeamEmbed(team);
                    const updatedComponents = createTeamButtons(fullTeamId, isFull, totalMembers);

                    await interaction.message.edit({
                        embeds: [updatedEmbed.embed],
                        files: updatedEmbed.files,
                        components: updatedComponents
                    });

                    // Notify in channel
                    await interaction.followUp({
                        content: `👑 Leadership transferred to ${newLeader.displayName}!`,
                        ephemeral: false
                    });

                    console.log(`[VALORANT TEAM] Leadership transferred from ${interaction.user.username} to ${newLeader.displayName}`);
                } catch (error) {
                    console.error('[VALORANT TEAM] Error transferring leadership:', error);
                    await interaction.followUp({
                        content: `❌ Error transferring leadership: ${error.message}`,
                        ephemeral: true
                    }).catch(console.error);
                }

                return;
            }
        });

        // Clear any existing teams from memory on restart
        activeTeams.clear();
        client._valorantTeamHandlerInitialized = true;
    }
};