const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// Import the API handler for rank data
const apiHandler = require('./valorantApiHandler');

// ===============================================
// VALORANT INHOUSE EVENT HANDLER WITH TEAM BALANCING
// ===============================================
// This handler manages automatic biweekly Valorant inhouse events
// Features: Auto-creation, participant tracking, event flow management, TEAM BALANCING
// Commands: !createinhouse (admin), !inhouselist (admin), !cancelinhouse (admin)
// 
// Events are created every 2 weeks on Saturdays at 7PM
// Maximum 10 participants + overflow for fills
// AUTO-CREATES BALANCED TEAMS using Valorant rank data
// ===============================================

// Configuration
const VALORANT_ROLE_ID = '1058201257338228757'; // Replace with actual @Valorant role ID
const ANNOUNCEMENTS_CHANNEL_ID = '701466198851715163'; // Replace with actual channel ID
const EVENT_TIME_HOUR = 19; // 7PM in 24-hour format
const EVENT_TIME_MINUTE = 0;
const FILL_WAIT_TIME = 5 * 60 * 1000; // 5 minutes in milliseconds

// File paths for persistent storage
const DATA_DIR = path.join(__dirname, '..', 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'valorant_inhouse_events.json');
const CONFIG_FILE = path.join(DATA_DIR, 'inhouse_config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('Created data directory:', DATA_DIR);
}

// Store active events and configuration
let activeInhouseEvents = new Map();
let inhouseConfig = {
    lastEventDate: null,
    nextEventDate: null,
    eventCounter: 0
};

// Team balancing algorithm weights
const RANK_WEIGHTS = {
    0: 0,    // Unranked
    3: 3,    // Iron 1
    4: 4,    // Iron 2
    5: 5,    // Iron 3
    6: 6,    // Bronze 1
    7: 7,    // Bronze 2
    8: 8,    // Bronze 3
    9: 9,    // Silver 1
    10: 10,  // Silver 2
    11: 11,  // Silver 3
    12: 12,  // Gold 1
    13: 13,  // Gold 2
    14: 14,  // Gold 3
    15: 15,  // Platinum 1
    16: 16,  // Platinum 2
    17: 17,  // Platinum 3
    18: 18,  // Diamond 1
    19: 19,  // Diamond 2
    20: 20,  // Diamond 3
    21: 21,  // Ascendant 1
    22: 22,  // Ascendant 2
    23: 23,  // Ascendant 3
    24: 24,  // Immortal 1
    25: 25,  // Immortal 2
    26: 26,  // Immortal 3
    27: 27   // Radiant
};

// Load persistent data on startup
function loadInhouseData() {
    try {
        // Load events
        if (fs.existsSync(EVENTS_FILE)) {
            const eventsData = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
            activeInhouseEvents = new Map(Object.entries(eventsData));
            console.log(`Loaded ${activeInhouseEvents.size} active inhouse events`);
        }

        // Load configuration
        if (fs.existsSync(CONFIG_FILE)) {
            const configData = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            inhouseConfig = { ...inhouseConfig, ...configData };
            console.log('Loaded inhouse configuration:', inhouseConfig);
        }
    } catch (error) {
        console.error('Error loading inhouse data:', error);
        activeInhouseEvents = new Map();
    }
}

// Save persistent data
function saveInhouseData() {
    try {
        // Save events
        const eventsObject = Object.fromEntries(activeInhouseEvents);
        fs.writeFileSync(EVENTS_FILE, JSON.stringify(eventsObject, null, 2));
        
        // Save configuration
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(inhouseConfig, null, 2));
        
        console.log('Saved inhouse data to files');
    } catch (error) {
        console.error('Error saving inhouse data:', error);
    }
}

// Get player rank data with fallback
async function getPlayerRankData(userId) {
    try {
        const registration = apiHandler.getUserRegistration(userId);
        if (!registration) {
            return { tier: 0, weight: 0, rankName: 'Unranked', registered: false };
        }

        const rankData = await apiHandler.getUserRankData(userId);
        if (!rankData) {
            return { tier: 0, weight: 0, rankName: 'Unranked', registered: true };
        }

        const rankInfo = apiHandler.RANK_MAPPING[rankData.currenttier] || apiHandler.RANK_MAPPING[0];
        return {
            tier: rankData.currenttier,
            weight: RANK_WEIGHTS[rankData.currenttier] || 0,
            rankName: rankInfo.name,
            rr: rankData.ranking_in_tier,
            registered: true
        };
    } catch (error) {
        console.error('Error getting player rank data:', error);
        return { tier: 0, weight: 0, rankName: 'Unranked', registered: false };
    }
}

// Advanced team balancing algorithm
async function createBalancedTeams(participants) {
    console.log('Creating balanced teams for', participants.length, 'participants');
    
    // Get rank data for all participants
    const playersWithRanks = await Promise.all(
        participants.map(async (player) => {
            const rankData = await getPlayerRankData(player.id);
            return {
                ...player,
                ...rankData
            };
        })
    );

    console.log('Players with ranks:', playersWithRanks.map(p => `${p.displayName}: ${p.rankName} (${p.weight})`));

    // Sort players by rank weight (highest to lowest)
    playersWithRanks.sort((a, b) => b.weight - a.weight);

    // Try different team combinations to find the most balanced
    const bestCombination = findOptimalTeamBalance(playersWithRanks);

    return bestCombination;
}

// Find optimal team balance using a more sophisticated algorithm
function findOptimalTeamBalance(players) {
    let bestTeams = null;
    let smallestDifference = Infinity;
    let attempts = 0;
    const maxAttempts = 1000;

    // Generate multiple random combinations and pick the best
    while (attempts < maxAttempts) {
        const shuffled = [...players].sort(() => Math.random() - 0.5);
        const team1 = shuffled.slice(0, 5);
        const team2 = shuffled.slice(5, 10);

        const team1Weight = team1.reduce((sum, player) => sum + player.weight, 0);
        const team2Weight = team2.reduce((sum, player) => sum + player.weight, 0);
        const difference = Math.abs(team1Weight - team2Weight);

        if (difference < smallestDifference) {
            smallestDifference = difference;
            bestTeams = {
                team1: {
                    players: team1,
                    totalWeight: team1Weight,
                    averageWeight: team1Weight / 5,
                    averageRank: calculateAverageRank(team1)
                },
                team2: {
                    players: team2,
                    totalWeight: team2Weight,
                    averageWeight: team2Weight / 5,
                    averageRank: calculateAverageRank(team2)
                },
                balanceScore: difference
            };
        }

        attempts++;

        // If we find a perfect balance, break early
        if (difference === 0) break;
    }

    console.log(`Found optimal balance after ${attempts} attempts. Balance score: ${smallestDifference}`);
    return bestTeams;
}

// Calculate average rank for a team
function calculateAverageRank(teamPlayers) {
    const totalTier = teamPlayers.reduce((sum, player) => sum + player.tier, 0);
    const averageTier = Math.round(totalTier / teamPlayers.length);
    const rankInfo = apiHandler.RANK_MAPPING[averageTier] || apiHandler.RANK_MAPPING[0];
    return {
        tier: averageTier,
        name: rankInfo.name,
        color: rankInfo.color
    };
}

// Create visual team balance display
async function createTeamBalanceVisualization(balancedTeams) {
    const canvas = createCanvas(900, 600);
    const ctx = canvas.getContext('2d');
    
    // Enhanced background
    const gradient = ctx.createLinearGradient(0, 0, 900, 600);
    gradient.addColorStop(0, '#0a0e13');
    gradient.addColorStop(0.5, '#1e2328');
    gradient.addColorStop(1, '#0a0e13');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 900, 600);
    
    // Valorant-style accents
    const accentGradient = ctx.createLinearGradient(0, 0, 900, 0);
    accentGradient.addColorStop(0, '#ff4654');
    accentGradient.addColorStop(0.5, '#ff6b7a');
    accentGradient.addColorStop(1, '#ff4654');
    ctx.fillStyle = accentGradient;
    ctx.fillRect(0, 0, 900, 6);
    ctx.fillRect(0, 594, 900, 6);
    
    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎯 RECOMMENDED TEAM BALANCE', 450, 45);
    
    // Balance score
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = balancedTeams.balanceScore <= 2 ? '#00ff88' : balancedTeams.balanceScore <= 5 ? '#ffaa00' : '#ff4654';
    ctx.fillText(`Balance Score: ${balancedTeams.balanceScore} (${getBalanceQuality(balancedTeams.balanceScore)})`, 450, 75);
    
    // Team boxes
    const teamBoxWidth = 400;
    const teamBoxHeight = 450;
    const team1X = 50;
    const team2X = 450;
    const teamY = 100;
    
    // Draw team boxes
    await drawTeamBox(ctx, balancedTeams.team1, team1X, teamY, teamBoxWidth, teamBoxHeight, 'TEAM ALPHA', '#4a9eff');
    await drawTeamBox(ctx, balancedTeams.team2, team2X, teamY, teamBoxWidth, teamBoxHeight, 'TEAM BRAVO', '#ff6b4a');
    
    return canvas.toBuffer();
}

// Draw individual team box
async function drawTeamBox(ctx, team, x, y, width, height, teamName, teamColor) {
    // Team box background
    const teamGradient = ctx.createLinearGradient(x, y, x, y + height);
    teamGradient.addColorStop(0, `${teamColor}20`);
    teamGradient.addColorStop(1, `${teamColor}10`);
    ctx.fillStyle = teamGradient;
    ctx.fillRect(x, y, width, height);
    
    // Team box border
    ctx.strokeStyle = teamColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);
    
    // Team name
    ctx.fillStyle = teamColor;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(teamName, x + width/2, y + 30);
    
    // Team average rank
    ctx.fillStyle = team.averageRank.color;
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`Avg Rank: ${team.averageRank.name}`, x + width/2, y + 55);
    
    // Team weight
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.fillText(`Total Weight: ${team.totalWeight}`, x + width/2, y + 75);
    
    // Players
    team.players.forEach(async (player, index) => {
        const playerY = y + 100 + (index * 65);
        
        // Player background
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fillRect(x + 10, playerY - 25, width - 20, 60);
        
        // Player rank color indicator
        const rankInfo = apiHandler.RANK_MAPPING[player.tier] || apiHandler.RANK_MAPPING[0];
        ctx.fillStyle = rankInfo.color;
        ctx.fillRect(x + 15, playerY - 20, 5, 50);
        
        // Player name
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(player.displayName, x + 30, playerY - 5);
        
        // Player rank
        ctx.fillStyle = rankInfo.color;
        ctx.font = '14px Arial';
        ctx.fillText(player.rankName, x + 30, playerY + 15);
        
        // Registration status
        if (!player.registered) {
            ctx.fillStyle = '#888888';
            ctx.font = '12px Arial';
            ctx.fillText('(Not Registered)', x + 30, playerY + 30);
        } else if (player.rr !== undefined) {
            ctx.fillStyle = '#cccccc';
            ctx.font = '12px Arial';
            ctx.fillText(`${player.rr} RR`, x + 200, playerY + 15);
        }
    });
}

// Get balance quality description
function getBalanceQuality(score) {
    if (score <= 2) return 'Excellent';
    if (score <= 5) return 'Good';
    if (score <= 10) return 'Fair';
    return 'Unbalanced';
}

// Calculate next biweekly Saturday at 7PM
function calculateNextEventDate(fromDate = new Date()) {
    const nextDate = new Date(fromDate);
    
    // If we have a last event date, calculate 2 weeks from then
    if (inhouseConfig.lastEventDate) {
        const lastDate = new Date(inhouseConfig.lastEventDate);
        nextDate.setTime(lastDate.getTime() + (14 * 24 * 60 * 60 * 1000)); // Add 14 days
    } else {
        // Find the next Saturday
        const daysUntilSaturday = (6 - nextDate.getDay()) % 7;
        if (daysUntilSaturday === 0 && (nextDate.getHours() >= EVENT_TIME_HOUR)) {
            // If it's Saturday and past event time, go to next Saturday
            nextDate.setDate(nextDate.getDate() + 7);
        } else if (daysUntilSaturday > 0) {
            nextDate.setDate(nextDate.getDate() + daysUntilSaturday);
        }
    }
    
    // Set to 7PM
    nextDate.setHours(EVENT_TIME_HOUR, EVENT_TIME_MINUTE, 0, 0);
    
    return nextDate;
}

// Create Discord scheduled event
async function createDiscordEvent(guild, eventDate, eventName, description) {
    try {
        // Set end time to 3 hours after start time (typical inhouse duration)
        const eventEndDate = new Date(eventDate.getTime() + (3 * 60 * 60 * 1000));
        
        const scheduledEvent = await guild.scheduledEvents.create({
            name: eventName,
            description: description,
            scheduledStartTime: eventDate,
            scheduledEndTime: eventEndDate, // Required for external events
            privacyLevel: 2, // GUILD_ONLY
            entityType: 3, // EXTERNAL
            entityMetadata: {
                location: 'Valorant - In Game'
            }
        });
        
        console.log(`Created Discord scheduled event: ${scheduledEvent.name} (ID: ${scheduledEvent.id})`);
        console.log(`Event duration: ${eventDate.toLocaleTimeString()} - ${eventEndDate.toLocaleTimeString()}`);
        return scheduledEvent;
    } catch (error) {
        console.error('Error creating Discord scheduled event:', error);
        return null;
    }
}

// Create inhouse event data structure
function createInhouseEvent(guildId, discordEventId, scheduledDate, isAutomatic = true) {
    const eventId = `inhouse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const inhouseEvent = {
        id: eventId,
        guildId: guildId,
        discordEventId: discordEventId,
        scheduledDate: scheduledDate.toISOString(),
        createdAt: new Date().toISOString(),
        isAutomatic: isAutomatic,
        status: 'scheduled', // scheduled, active, cancelled, completed
        participants: [], // Array of user objects
        overflow: [], // Array of user objects for fills
        messageId: null,
        channelId: null,
        fillTimer: null,
        balancedTeams: null // Store the balanced teams
    };
    
    activeInhouseEvents.set(eventId, inhouseEvent);
    saveInhouseData();
    
    return inhouseEvent;
}

// Create event announcement embed
function createEventEmbed(inhouseEvent, guild) {
    const eventDate = new Date(inhouseEvent.scheduledDate);
    const participantCount = inhouseEvent.participants.length;
    const overflowCount = inhouseEvent.overflow.length;
    
    const embed = new EmbedBuilder()
        .setTitle('🎯 VALORANT INHOUSE EVENT')
        .setColor('#ff4654')
        .setDescription(`${inhouseEvent.isAutomatic ? '📅 **Biweekly Scheduled Event**' : '⚡ **Admin Created Event**'}`)
        .addFields(
            {
                name: '📅 Event Date & Time',
                value: `**${eventDate.toLocaleDateString()}** at **${eventDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}**`,
                inline: false
            },
            {
                name: '👥 Participants',
                value: `**${participantCount}/10** players registered${overflowCount > 0 ? `\n**+${overflowCount} overflow**` : ''}`,
                inline: true
            },
            {
                name: '🎮 Game Mode',
                value: 'Custom 5v5 Valorant\n**Auto-Balanced Teams**',
                inline: true
            },
            {
                name: '📋 Participant List',
                value: formatParticipantList(inhouseEvent),
                inline: false
            }
        )
        .setFooter({ 
            text: inhouseEvent.status === 'scheduled' ? 
                'Teams will be automatically balanced using rank data! Register with !valstats for accurate balancing.' :
                `Event Status: ${inhouseEvent.status.toUpperCase()}`
        })
        .setTimestamp();

    // Add status-specific information
    if (inhouseEvent.status === 'active') {
        embed.setColor('#00ff88');
        embed.addFields({
            name: '🚨 EVENT STARTING!',
            value: 'Teams have been balanced! Check the team assignments below.',
            inline: false
        });
    } else if (inhouseEvent.status === 'cancelled') {
        embed.setColor('#ff0000');
        embed.addFields({
            name: '❌ EVENT CANCELLED',
            value: 'Not enough participants joined the event.',
            inline: false
        });
    }
    
    return embed;
}

// Format participant list for embed
function formatParticipantList(inhouseEvent) {
    let list = '';
    
    // Main participants
    if (inhouseEvent.participants.length > 0) {
        inhouseEvent.participants.forEach((participant, index) => {
            list += `${index + 1}. **${participant.displayName}**\n`;
        });
    } else {
        list += '*No participants yet...*\n';
    }
    
    // Fill remaining slots
    const remainingSlots = 10 - inhouseEvent.participants.length;
    for (let i = 0; i < remainingSlots; i++) {
        list += `${inhouseEvent.participants.length + i + 1}. *Open Slot*\n`;
    }
    
    // Overflow
    if (inhouseEvent.overflow.length > 0) {
        list += '\n**🔄 Overflow (Fills):**\n';
        inhouseEvent.overflow.forEach((participant, index) => {
            list += `F${index + 1}. **${participant.displayName}**\n`;
        });
    }
    
    return list.length > 1024 ? list.substring(0, 1021) + '...' : list;
}

// Create event buttons
function createEventButtons(eventId, status) {
    const joinButton = new ButtonBuilder()
        .setCustomId(`inhouse_join_${eventId}`)
        .setLabel('Join Event')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
        .setDisabled(status !== 'scheduled');

    const leaveButton = new ButtonBuilder()
        .setCustomId(`inhouse_leave_${eventId}`)
        .setLabel('Leave Event')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
        .setDisabled(status !== 'scheduled');

    const overflowButton = new ButtonBuilder()
        .setCustomId(`inhouse_overflow_${eventId}`)
        .setLabel('Join as Fill')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
        .setDisabled(status !== 'scheduled');

    return new ActionRowBuilder().addComponents(joinButton, leaveButton, overflowButton);
}

// Post event announcement
async function postEventAnnouncement(client, inhouseEvent) {
    try {
        const guild = await client.guilds.fetch(inhouseEvent.guildId);
        const channel = await guild.channels.fetch(ANNOUNCEMENTS_CHANNEL_ID);        
        if (!channel) {
            console.error('Could not find announcements channel');
            return;
        }
        
        const embed = createEventEmbed(inhouseEvent, guild);
        const buttons = createEventButtons(inhouseEvent.id, inhouseEvent.status);
        
        const message = await channel.send({
            content: `<@&${VALORANT_ROLE_ID}> 🎯 **NEW VALORANT INHOUSE EVENT!**`,
            embeds: [embed],
            components: [buttons]
        });
        
        inhouseEvent.messageId = message.id;
        inhouseEvent.channelId = channel.id;
        saveInhouseData();
        
        console.log(`Posted inhouse event announcement in ${channel.name}`);
        return message;
    } catch (error) {
        console.error('Error posting event announcement:', error);
    }
}

// Update existing event message
async function updateEventMessage(client, inhouseEvent) {
    try {
        if (!inhouseEvent.messageId || !inhouseEvent.channelId) return;
        
        const guild = await client.guilds.fetch(inhouseEvent.guildId);
        const channel = await guild.channels.fetch(inhouseEvent.channelId);
        const message = await channel.messages.fetch(inhouseEvent.messageId);
        
        const embed = createEventEmbed(inhouseEvent, guild);
        const buttons = createEventButtons(inhouseEvent.id, inhouseEvent.status);
        
        await message.edit({
            embeds: [embed],
            components: [buttons]
        });
    } catch (error) {
        console.error('Error updating event message:', error);
    }
}

// Start event flow with team balancing
async function startEvent(client, inhouseEvent) {
    try {
        const guild = await client.guilds.fetch(inhouseEvent.guildId);
        
        // Check if we have enough participants
        if (inhouseEvent.participants.length < 10) {
            // Not enough participants, ping for fills
            await requestFills(client, inhouseEvent);
            return;
        }
        
        // Create balanced teams
        console.log('Creating balanced teams for inhouse event...');
        const balancedTeams = await createBalancedTeams(inhouseEvent.participants);
        inhouseEvent.balancedTeams = balancedTeams;
        
        // Enough participants, start the event
        inhouseEvent.status = 'active';
        await updateEventMessage(client, inhouseEvent);
        
        // Create team balance visualization
        const teamBalanceImage = await createTeamBalanceVisualization(balancedTeams);
        const attachment = new AttachmentBuilder(teamBalanceImage, { name: 'team-balance.png' });
        
        // Send start notification with team assignments
        const channel = await guild.channels.fetch(inhouseEvent.channelId);
        
        const startEmbed = new EmbedBuilder()
            .setTitle('🚨 INHOUSE STARTING NOW!')
            .setColor('#00ff88')
            .setDescription('The Valorant inhouse event is beginning with automatically balanced teams!')
            .addFields(
                {
                    name: '⚖️ Team Balance',
                    value: `**Balance Score:** ${balancedTeams.balanceScore} (${getBalanceQuality(balancedTeams.balanceScore)})\n` +
                           `**Team Alpha Avg:** ${balancedTeams.team1.averageRank.name}\n` +
                           `**Team Bravo Avg:** ${balancedTeams.team2.averageRank.name}`,
                    inline: false
                },
                {
                    name: '🔵 TEAM ALPHA',
                    value: balancedTeams.team1.players.map((p, i) => 
                        `${i + 1}. **${p.displayName}** (${p.rankName}${p.rr !== undefined ? ` - ${p.rr} RR` : ''})`
                    ).join('\n'),
                    inline: true
                },
                {
                    name: '🔴 TEAM BRAVO',
                    value: balancedTeams.team2.players.map((p, i) => 
                        `${i + 1}. **${p.displayName}** (${p.rankName}${p.rr !== undefined ? ` - ${p.rr} RR` : ''})`
                    ).join('\n'),
                    inline: true
                },
                {
                    name: '🎮 Instructions',
                    value: '1. Someone from **Team Alpha** create a custom game\n2. Set to Competitive mode\n3. Invite all players according to teams above\n4. Play and have fun!',
                    inline: false
                }
            )
            .setImage('attachment://team-balance.png')
            .setTimestamp();
        
        // Ping all participants
        const participantMentions = inhouseEvent.participants.map(p => `<@${p.id}>`).join(' ');
        
        await channel.send({
            content: `${participantMentions} 🎯 **INHOUSE TIME!**`,
            embeds: [startEmbed],
            files: [attachment]
        });
        
        // Save the balanced teams
        saveInhouseData();
        
        // Mark as completed after 3 hours
        setTimeout(() => {
            inhouseEvent.status = 'completed';
            saveInhouseData();
        }, 3 * 60 * 60 * 1000);
        
    } catch (error) {
        console.error('Error starting event:', error);
    }
}

// Request fills for incomplete event
async function requestFills(client, inhouseEvent) {
    try {
        const guild = await client.guilds.fetch(inhouseEvent.guildId);
        const channel = await guild.channels.fetch(inhouseEvent.channelId);
        
        const needed = 10 - inhouseEvent.participants.length;
        
        const fillEmbed = new EmbedBuilder()
            .setTitle('🔍 NEED FILLS FOR INHOUSE!')
            .setColor('#ffaa00')
            .setDescription(`We need **${needed} more player${needed > 1 ? 's' : ''}** to start the inhouse!`)
            .addFields(
                {
                    name: '⏰ Time Limit',
                    value: 'You have **5 minutes** to join, or the event will be cancelled.',
                    inline: false
                },
                {
                    name: '👥 Current Participants',
                    value: `${inhouseEvent.participants.length}/10 players`,
                    inline: true
                },
                {
                    name: '🔄 Available Fills',
                    value: `${inhouseEvent.overflow.length} players ready`,
                    inline: true
                },
                {
                    name: '⚖️ Team Balancing',
                    value: 'Teams will be automatically balanced using rank data once we have 10 players!',
                    inline: false
                }
            )
            .setTimestamp();
        
        await channel.send({
            content: `<@&${VALORANT_ROLE_ID}> 🚨 **URGENT: NEED FILLS!**`,
            embeds: [fillEmbed]
        });
        
        // Set timeout to cancel if not filled
        inhouseEvent.fillTimer = setTimeout(async () => {
            if (inhouseEvent.participants.length < 10) {
                await cancelEvent(client, inhouseEvent, 'Not enough participants after fill period');
            } else {
                await startEvent(client, inhouseEvent);
            }
        }, FILL_WAIT_TIME);
        
        saveInhouseData();
    } catch (error) {
        console.error('Error requesting fills:', error);
    }
}

// Cancel event
async function cancelEvent(client, inhouseEvent, reason = 'Event cancelled') {
    try {
        // Clear any existing timer
        if (inhouseEvent.fillTimer) {
            clearTimeout(inhouseEvent.fillTimer);
            inhouseEvent.fillTimer = null;
        }
        
        inhouseEvent.status = 'cancelled';
        await updateEventMessage(client, inhouseEvent);
        
        const guild = await client.guilds.fetch(inhouseEvent.guildId);
        const channel = await guild.channels.fetch(inhouseEvent.channelId);
        
        const cancelEmbed = new EmbedBuilder()
            .setTitle('❌ INHOUSE CANCELLED')
            .setColor('#ff0000')
            .setDescription(reason)
            .addFields({
                name: '📊 Final Stats',
                value: `**${inhouseEvent.participants.length}**/10 participants\n**${inhouseEvent.overflow.length}** overflow players`,
                inline: false
            })
            .setTimestamp();
        
        await channel.send({ embeds: [cancelEmbed] });
        
        // Remove from active events after 1 hour
        setTimeout(() => {
            activeInhouseEvents.delete(inhouseEvent.id);
            saveInhouseData();
        }, 60 * 60 * 1000);
        
        console.log(`Cancelled inhouse event: ${inhouseEvent.id} - ${reason}`);
    } catch (error) {
        console.error('Error cancelling event:', error);
    }
}

// Schedule automatic event creation
function scheduleNextEvent(client) {
    const nextEventDate = calculateNextEventDate();
    inhouseConfig.nextEventDate = nextEventDate.toISOString();
    saveInhouseData();
    
    console.log(`Next automatic inhouse scheduled for: ${nextEventDate}`);
    
    // Create the event 1 week before it happens (for Discord scheduled event)
    const createDate = new Date(nextEventDate.getTime() - (7 * 24 * 60 * 60 * 1000));
    const now = new Date();
    
    if (createDate > now) {
        const timeUntilCreate = createDate.getTime() - now.getTime();
        setTimeout(async () => {
            await createAutomaticEvent(client, nextEventDate);
        }, timeUntilCreate);
        
        console.log(`Will create Discord event on: ${createDate}`);
    } else {
        // Create immediately if we're past the create date
        createAutomaticEvent(client, nextEventDate);
    }
}

// Create automatic biweekly event
async function createAutomaticEvent(client, eventDate) {
    try {
        for (const guild of client.guilds.cache.values()) {
            const eventName = `Valorant Inhouse #${inhouseConfig.eventCounter + 1}`;
            const description = `Biweekly Valorant inhouse event! 10 players max. Teams will be automatically balanced using rank data!`;
            
            const discordEvent = await createDiscordEvent(guild, eventDate, eventName, description);
            
            if (discordEvent) {
                const inhouseEvent = createInhouseEvent(guild.id, discordEvent.id, eventDate, true);
                await postEventAnnouncement(client, inhouseEvent);
                
                inhouseConfig.eventCounter++;
                inhouseConfig.lastEventDate = eventDate.toISOString();
                saveInhouseData();
                
                // Schedule the event to start
                const timeUntilEvent = eventDate.getTime() - Date.now();
                if (timeUntilEvent > 0) {
                    setTimeout(async () => {
                        await startEvent(client, inhouseEvent);
                    }, timeUntilEvent);
                }
                
                console.log(`Created automatic inhouse event for ${guild.name}: ${eventName}`);
            }
        }
        
        // Schedule the next event
        scheduleNextEvent(client);
    } catch (error) {
        console.error('Error creating automatic event:', error);
    }
}

// Load inhouse data on startup
loadInhouseData();

// Export the handler
module.exports = (client) => {
    // Initialize the API handler first (required for rank data)
    apiHandler.init(client);
    
    // Only initialize once
    if (!client._valorantInhouseHandlerInitialized) {
        console.log('Valorant Inhouse Event Handler with Team Balancing loaded successfully!');
        console.log('Features: Automatic biweekly events, participant tracking, AUTO TEAM BALANCING');
        console.log(`Next event: ${inhouseConfig.nextEventDate || 'Not scheduled'}`);

        // Start the automatic scheduling system
        setTimeout(() => {
            scheduleNextEvent(client);
        }, 5000); // Wait 5 seconds after bot startup

        // Command handlers
        client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            if (!message.guild) return;

            const args = message.content.split(' ');
            const command = args[0].toLowerCase();

            // Admin command to create immediate inhouse
            if (command === '!createinhouse' && message.member.permissions.has('ADMINISTRATOR')) {
                try {
                    const eventDate = new Date();
                    eventDate.setMinutes(eventDate.getMinutes() + 5); // 5 minutes from now
                    
                    const eventName = `Instant Valorant Inhouse`;
                    const description = `Admin-created Valorant inhouse event starting soon! Teams will be automatically balanced using rank data.`;
                    
                    const discordEvent = await createDiscordEvent(message.guild, eventDate, eventName, description);
                    
                    if (discordEvent) {
                        const inhouseEvent = createInhouseEvent(message.guild.id, discordEvent.id, eventDate, false);
                        await postEventAnnouncement(client, inhouseEvent);
                        
                        // Schedule the event to start
                        setTimeout(async () => {
                            await startEvent(client, inhouseEvent);
                        }, 5 * 60 * 1000); // 5 minutes
                        
                        const successEmbed = new EmbedBuilder()
                            .setTitle('✅ Inhouse Created!')
                            .setColor('#00ff88')
                            .setDescription('Instant inhouse event created and posted!')
                            .addFields(
                                {
                                    name: '📅 Start Time',
                                    value: `${eventDate.toLocaleTimeString()}`,
                                    inline: true
                                },
                                {
                                    name: '⚖️ Team Balancing',
                                    value: 'Teams will be automatically balanced using Valorant rank data',
                                    inline: false
                                }
                            )
                            .setTimestamp();
                        
                        await message.reply({ embeds: [successEmbed] });
                    } else {
                        throw new Error('Failed to create Discord event');
                    }
                } catch (error) {
                    console.error('Error creating instant inhouse:', error);
                    await message.reply('❌ Failed to create inhouse event. Check console for details.');
                }
            }

            // Admin command to list active inhouses
            if (command === '!inhouselist' && message.member.permissions.has('ADMINISTRATOR')) {
                const activeEvents = Array.from(activeInhouseEvents.values());
                
                if (activeEvents.length === 0) {
                    return message.reply('📋 No active inhouse events.');
                }
                
                const embed = new EmbedBuilder()
                    .setTitle('📋 Active Inhouse Events')
                    .setColor('#ff4654')
                    .setDescription(`Total active events: **${activeEvents.length}**`)
                    .setTimestamp();

                activeEvents.forEach((event, index) => {
                    const eventDate = new Date(event.scheduledDate);
                    let balanceInfo = 'Not yet balanced';
                    
                    if (event.balancedTeams) {
                        balanceInfo = `Balance Score: ${event.balancedTeams.balanceScore} (${getBalanceQuality(event.balancedTeams.balanceScore)})`;
                    }
                    
                    embed.addFields({
                        name: `Event ${index + 1} - ${event.status.toUpperCase()}`,
                        value: `**Date:** ${eventDate.toLocaleDateString()} ${eventDate.toLocaleTimeString()}\n` +
                               `**Type:** ${event.isAutomatic ? 'Automatic' : 'Admin Created'}\n` +
                               `**Participants:** ${event.participants.length}/10 (+${event.overflow.length} overflow)\n` +
                               `**Balance:** ${balanceInfo}\n` +
                               `**ID:** \`${event.id}\``,
                        inline: false
                    });
                });

                await message.reply({ embeds: [embed] });
            }

            // Admin command to cancel specific inhouse
            if (command === '!cancelinhouse' && message.member.permissions.has('ADMINISTRATOR')) {
                const eventId = args[1];
                
                if (!eventId) {
                    return message.reply('❌ Please provide an event ID. Use `!inhouselist` to see active events.');
                }
                
                const inhouseEvent = activeInhouseEvents.get(eventId);
                
                if (!inhouseEvent) {
                    return message.reply('❌ Event not found. Use `!inhouselist` to see active events.');
                }
                
                await cancelEvent(client, inhouseEvent, 'Cancelled by administrator');
                await message.reply(`✅ Successfully cancelled inhouse event: \`${eventId}\``);
            }
        });

        // Button interaction handlers
        client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton()) return;
            
            // Only handle inhouse buttons
            if (!interaction.customId.startsWith('inhouse_')) return;
            
            const parts = interaction.customId.split('_');
            const action = parts[1]; // join, leave, overflow
            const eventId = parts.slice(2).join('_'); // Reconstruct event ID
            
            const inhouseEvent = activeInhouseEvents.get(eventId);
            
            if (!inhouseEvent) {
                return interaction.reply({
                    content: '❌ This event is no longer active.',
                    ephemeral: true
                });
            }
            
            if (inhouseEvent.status !== 'scheduled') {
                return interaction.reply({
                    content: '❌ This event is not accepting new participants.',
                    ephemeral: true
                });
            }
            
            const userId = interaction.user.id;
            const userInfo = {
                id: userId,
                username: interaction.user.username,
                displayName: interaction.user.displayName || interaction.user.username,
                tag: interaction.user.tag
            };
            
            if (action === 'join') {
                // Check if already in event
                if (inhouseEvent.participants.some(p => p.id === userId) || 
                    inhouseEvent.overflow.some(p => p.id === userId)) {
                    return interaction.reply({
                        content: '❌ You are already registered for this event!',
                        ephemeral: true
                    });
                }
                
                // Check if main spots are full
                if (inhouseEvent.participants.length >= 10) {
                    return interaction.reply({
                        content: '❌ Main spots are full! Use "Join as Fill" to be added to overflow.',
                        ephemeral: true
                    });
                }
                
                // Add to main participants
                inhouseEvent.participants.push(userInfo);
                await updateEventMessage(client, inhouseEvent);
                saveInhouseData();
                
                await interaction.reply({
                    content: `✅ Successfully joined the inhouse! You are participant #${inhouseEvent.participants.length}.`,
                    ephemeral: true
                });
                
            } else if (action === 'leave') {
                // Remove from participants
                const participantIndex = inhouseEvent.participants.findIndex(p => p.id === userId);
                const overflowIndex = inhouseEvent.overflow.findIndex(p => p.id === userId);
                
                if (participantIndex === -1 && overflowIndex === -1) {
                    return interaction.reply({
                        content: '❌ You are not registered for this event!',
                        ephemeral: true
                    });
                }
                
                if (participantIndex !== -1) {
                    inhouseEvent.participants.splice(participantIndex, 1);
                    
                    // Promote from overflow if available
                    if (inhouseEvent.overflow.length > 0) {
                        const promoted = inhouseEvent.overflow.shift();
                        inhouseEvent.participants.push(promoted);
                    }
                } else {
                    inhouseEvent.overflow.splice(overflowIndex, 1);
                }
                
                await updateEventMessage(client, inhouseEvent);
                saveInhouseData();
                
                await interaction.reply({
                    content: '✅ Successfully left the inhouse event.',
                    ephemeral: true
                });
                
            } else if (action === 'overflow') {
                // Check if already in event
                if (inhouseEvent.participants.some(p => p.id === userId) || 
                    inhouseEvent.overflow.some(p => p.id === userId)) {
                    return interaction.reply({
                        content: '❌ You are already registered for this event!',
                        ephemeral: true
                    });
                }
                
                // Add to overflow
                inhouseEvent.overflow.push(userInfo);
                await updateEventMessage(client, inhouseEvent);
                saveInhouseData();
                
                await interaction.reply({
                    content: `✅ Added to overflow list! You will be promoted if spots open up. Position: #${inhouseEvent.overflow.length}`,
                    ephemeral: true
                });
            }
        });

        client._valorantInhouseHandlerInitialized = true;
    }
};