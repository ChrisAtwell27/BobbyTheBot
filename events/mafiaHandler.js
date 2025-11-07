const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { updateBobbyBucks } = require('../database/helpers/economyHelpers');
const User = require('../database/models/User');
const { TARGET_GUILD_ID } = require('../config/guildConfig');
const { ROLES } = require('../mafia/roles/mafiaRoles');
const { createGame, getGame, getGameByPlayer, deleteGame, getAllGames, addVisit, getVisitors, clearNightData, clearVotes, updateActivity } = require('../mafia/game/mafiaGameState');
const { processNightActions } = require('../mafia/game/mafiaActions');
const { getRoleDistribution, shuffleArray, getTeamCounts, countVotes, determineWinners, checkWinConditions, initializePlayerRole } = require('../mafia/game/mafiaUtils');
const OpenAI = require('openai');

// Constants
const MAFIA_VC_ID = '1434633691455426600';
const MAFIA_TEXT_CHANNEL_ID = '1434636519380881508';
const MIN_PLAYERS = 6;
const SETUP_DELAY = 30000; // 30 seconds
const NIGHT_DURATION = 60000; // 1 minute
const DAY_DISCUSSION_DURATION = 180000; // 3 minutes
const VOTING_DURATION = 120000; // 2 minutes for voting
const WINNER_REWARD = 500; // BobbyBucks
const GAME_INACTIVITY_TIMEOUT = 3600000; // 1 hour - games inactive longer than this will be cleaned up

// Store pending game configurations
const pendingGameConfigs = new Map();

// OpenAI API configuration for Keller Bee emoji translation
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
let openai = null;
if (OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: OPENAI_API_KEY
    });
    console.log('✅ OpenAI API loaded for Keller Bee emoji translation');
} else {
    console.warn('⚠️  OpenAI not configured - Keller Bee emoji translation will use fallback');
}

// Function to translate text to emojis using OpenAI (for Keller Bee)
async function translateToEmojis(text, username) {
    if (!openai) {
        // Fallback: just add some emojis
        return `${text} 🐝💭`;
    }

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are a translator that converts text messages into ONLY emojis. Your goal is to express the meaning using ONLY emojis - no words, no letters, just emojis. Be creative and use combinations of emojis to convey the message. Maximum 15 emojis.'
                },
                {
                    role: 'user',
                    content: `Translate this message to emojis only: "${text}"`
                }
            ],
            max_tokens: 100,
            temperature: 0.8
        });

        const emojiTranslation = completion.choices[0].message.content.trim();
        console.log(`🤐 Mute Bee (${username}): "${text}" -> "${emojiTranslation}"`);
        return emojiTranslation;
    } catch (error) {
        console.error('Error translating to emojis:', error);
        // Fallback
        return `${text} 🐝💭`;
    }
}

// Debug mode constants (shorter timers for testing)
const DEBUG_SETUP_DELAY = 10000; // 10 seconds
const DEBUG_NIGHT_DURATION = 45000; // 45 seconds
const DEBUG_DAY_DISCUSSION_DURATION = 90000; // 90 seconds (1.5 minutes)
const DEBUG_VOTING_DURATION = 60000; // 60 seconds (1 minute)

// Helper to get phase durations based on debug mode and custom settings
function getPhaseDuration(game, phaseType) {
    // Check for custom durations first
    if (game.customDurations && game.customDurations[phaseType]) {
        return game.customDurations[phaseType] * 1000; // Convert seconds to milliseconds
    }

    if (!game.debugMode) {
        switch (phaseType) {
            case 'setup': return SETUP_DELAY;
            case 'night': return NIGHT_DURATION;
            case 'day': return DAY_DISCUSSION_DURATION;
            case 'voting': return VOTING_DURATION;
        }
    } else {
        switch (phaseType) {
            case 'setup': return DEBUG_SETUP_DELAY;
            case 'night': return DEBUG_NIGHT_DURATION;
            case 'day': return DEBUG_DAY_DISCUSSION_DURATION;
            case 'voting': return DEBUG_VOTING_DURATION;
        }
    }
}

// Helper function to start a mafia game after configuration
async function startMafiaGame(client, config) {
    const { gameId, players, organizerId, randomMode, customDurations } = config;

    // Create game using game state module
    const game = createGame(gameId, players, organizerId, MAFIA_TEXT_CHANNEL_ID);

    // Store custom durations if provided
    if (customDurations) {
        game.customDurations = customDurations;
    }

    // Send initial message
    const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
    game.cachedChannel = channel; // Cache the channel for future use

    // Build time configuration display
    let timeConfigText = '';
    if (customDurations) {
        timeConfigText = `\n\n⏱️ **Custom Time Limits:**\n• Setup: ${customDurations.setup}s\n• Night Phase: ${customDurations.night}s\n• Day Phase: ${customDurations.day}s\n• Voting Phase: ${customDurations.voting}s`;
    }

    const setupEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`🐝 Bee Mafia Game Starting! ${randomMode ? '🎲' : ''}🐝`)
        .setDescription(`A game has been created with **${players.length} players**!${randomMode ? '\n\n🎲 **RANDOM MODE** - All roles (except Wasp Queen) are completely randomized!' : ''}${timeConfigText}\n\nRoles are being assigned... Check your DMs!`)
        .addFields({
            name: 'Players',
            value: players.map(p => `• ${p.displayName}`).join('\n'),
            inline: false
        })
        .setTimestamp();

    const gameMessage = await channel.send({ embeds: [setupEmbed] });
    game.messageId = gameMessage.id;

    // Send role DMs
    const { sendRoleDMs, startNightPhase } = require('../mafia/game/mafiaPhases');
    const dmFailures = await sendRoleDMs(game, client);

    // Link Matchmaker Beetle with a random player
    const matchmakers = game.players.filter(p => p.role === 'MATCHMAKER_BEETLE');
    for (const matchmaker of matchmakers) {
        const otherPlayers = game.players.filter(p => p.id !== matchmaker.id);
        const linkedPartner = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];

        matchmaker.hasLinkedPartner = true;
        matchmaker.linkedPartner = linkedPartner.id;

        // Notify Matchmaker
        try {
            const user = await client.users.fetch(matchmaker.id);
            const embed = new EmbedBuilder()
                .setColor('#FF69B4')
                .setTitle('💕 You Are Linked!')
                .setDescription(`You have been linked with **${linkedPartner.displayName}**!\n\nIf they die, you die. If they win, you win. They don't know about this link.\n\nYou must figure out their role and help them achieve victory!`)
                .setTimestamp();
            await user.send({ embeds: [embed] });
        } catch (error) {
            console.error(`Could not notify Matchmaker:`, error);
        }
    }

    // Apply initial mute/deafen for Keller Bee and Deaf Bee
    try {
        const voiceChannel = await client.channels.fetch(MAFIA_VC_ID);
        if (voiceChannel && voiceChannel.members) {
            for (const player of game.players) {
                const member = voiceChannel.members.get(player.id);
                if (member) {
                    // Keller Bee: Mute immediately
                    if (player.role === 'KELLER_BEE') {
                        await member.voice.setMute(true, 'Keller Bee - cannot speak');
                        console.log(`🤐 Muted Keller Bee: ${player.displayName}`);
                    }
                    // Deaf Bee: Deafen immediately
                    if (player.role === 'DEAF_BEE') {
                        await member.voice.setDeaf(true, 'Deaf Bee - cannot hear voice');
                        console.log(`🦻 Deafened Deaf Bee: ${player.displayName}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error applying initial mute/deafen for special roles:', error);
    }

    // Notify organizer if any DMs failed
    if (dmFailures.length > 0) {
        try {
            const organizer = await client.users.fetch(game.organizerId);
            await organizer.send(`⚠️ **Warning:** Could not send role DMs to the following players: ${dmFailures.join(', ')}. They may have DMs disabled. Consider restarting the game or asking them to enable DMs.`);
        } catch (error) {
            console.error('Could not notify organizer about DM failures:', error);
            await channel.send(`⚠️ <@${game.organizerId}> Some players could not receive their role DMs: ${dmFailures.join(', ')}. They may have DMs disabled.`);
        }
    }

    // Wait then start night phase
    const setupDelay = getPhaseDuration(game, 'setup');
    await channel.send(`The night phase will begin in ${setupDelay / 1000} seconds...`);

    setTimeout(async () => {
        await startNightPhase(game, client);
    }, setupDelay);

    return game;
}

// Create game embed
function createGameEmbed(game) {
    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`🐝 Bee Mafia Game 🐝${game.debugMode ? ' [DEBUG MODE]' : ''}`)
        .setTimestamp();

    const alivePlayers = game.players.filter(p => p.alive);
    const deadPlayers = game.players.filter(p => !p.alive);

    if (game.phase === 'setup') {
        embed.setDescription(`**Game Status:** Setting up\n**Players:** ${game.players.length}${game.debugMode ? '\n**Mode:** Debug' : ''}`);
        embed.addFields({
            name: 'Players in Game',
            value: game.players.map(p => `• ${p.displayName}`).join('\n') || 'No players yet',
            inline: false
        });
    } else if (game.phase === 'night') {
        embed.setDescription(`**Phase:** 🌙 Night Time\n**Time Remaining:** ${Math.ceil((game.phaseEndTime - Date.now()) / 1000)}s`);
        embed.addFields({
            name: `Alive Players (${alivePlayers.length})`,
            value: alivePlayers.map(p => `• ${p.displayName}`).join('\n'),
            inline: true
        });
        if (deadPlayers.length > 0) {
            embed.addFields({
                name: `Eliminated (${deadPlayers.length})`,
                value: deadPlayers.map(p => `• ${p.displayName}`).join('\n'),
                inline: true
            });
        }
    } else if (game.phase === 'day') {
        embed.setDescription(`**Phase:** ☀️ Day Discussion\n**Time Remaining:** ${Math.ceil((game.phaseEndTime - Date.now()) / 1000)}s`);
        embed.addFields({
            name: `Alive Players (${alivePlayers.length})`,
            value: alivePlayers.map(p => `• ${p.displayName}`).join('\n'),
            inline: true
        });
        if (deadPlayers.length > 0) {
            embed.addFields({
                name: `Eliminated (${deadPlayers.length})`,
                value: deadPlayers.map(p => `• ${p.displayName}`).join('\n'),
                inline: true
            });
        }
    } else if (game.phase === 'voting') {
        embed.setDescription(`**Phase:** 🗳️ Voting Time\n**Time Remaining:** ${Math.ceil((game.phaseEndTime - Date.now()) / 1000)}s`);
        embed.addFields({
            name: 'Instructions',
            value: 'Vote for a player to eliminate using the buttons below!',
            inline: false
        });

        const voteCounts = countVotes(game.votes || {});

        if (Object.keys(voteCounts).length > 0) {
            const voteStatus = alivePlayers.map(p => {
                const count = voteCounts[p.id] || 0;
                return `• ${p.displayName}: ${count} vote${count !== 1 ? 's' : ''}`;
            }).join('\n');

            embed.addFields({
                name: 'Current Votes',
                value: voteStatus,
                inline: false
            });
        }
    }

    return embed;
}

// Create voting buttons
function createVotingButtons(gameId, alivePlayers) {
    const rows = [];
    const buttonsPerRow = 4;

    for (let i = 0; i < alivePlayers.length; i += buttonsPerRow) {
        const row = new ActionRowBuilder();

        for (let j = 0; j < buttonsPerRow && i + j < alivePlayers.length; j++) {
            const player = alivePlayers[i + j];
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`mafiavote_${gameId}_${player.id}`)
                    .setLabel(player.displayName)
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🗳️')
            );
        }
        rows.push(row);
    }

    // Add skip vote button
    const skipRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`mafiavote_${gameId}_skip`)
            .setLabel('Skip Vote')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏭️')
    );
    rows.push(skipRow);

    return rows;
}

// Send role DMs
async function sendRoleDMs(game, client) {
    const failures = [];

    for (const player of game.players) {
        try {
            const user = await client.users.fetch(player.id);
            const role = ROLES[player.role];

            // Determine color based on team
            let color;
            if (role.team === 'bee') color = '#FFD700';
            else if (role.team === 'wasp') color = '#8B0000';
            else color = '#808080';

            const roleEmbed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`${role.emoji} Your Role: ${role.name}`)
                .setDescription(role.description)
                .addFields(
                    { name: 'Abilities', value: role.abilities.join('\n'), inline: false },
                    { name: 'Win Condition', value: role.winCondition, inline: false }
                )
                .setFooter({ text: '🤫 Keep this secret!' });

            // Add teammate info for Wasps
            if (role.team === 'wasp') {
                const teammates = game.players
                    .filter(p => ROLES[p.role].team === 'wasp' && p.id !== player.id)
                    .map(p => `${p.displayName} (${ROLES[p.role].name})`)
                    .join('\n');

                if (teammates) {
                    roleEmbed.addFields({
                        name: '🐝 Your Fellow Wasps',
                        value: teammates,
                        inline: false
                    });
                }
            }

            // Add Executioner target
            if (player.role === 'BOUNTY_HUNTER' && player.target) {
                const targetPlayer = game.players.find(p => p.id === player.target);
                if (targetPlayer) {
                    roleEmbed.addFields({
                        name: '🎯 Your Target',
                        value: `You must get **${targetPlayer.displayName}** lynched during the day!`,
                        inline: false
                    });
                }
            }

            // Add Mercenary team assignment
            if (player.role === 'MERCENARY' && player.mercenaryTeam) {
                const teamName = player.mercenaryTeam === 'bee' ? 'Bee Team 🐝' : 'Wasp Team 🐝';
                const winCondition = player.mercenaryTeam === 'bee'
                    ? 'Eliminate all Wasps and harmful Neutrals'
                    : 'Eliminate all Bees and harmful Neutrals';
                roleEmbed.addFields({
                    name: '💰 Your Assignment',
                    value: `You have been hired by the **${teamName}**!\n\nYour new win condition: ${winCondition}`,
                    inline: false
                });
            }

            // Add resource counts
            if (player.bullets !== undefined) {
                roleEmbed.addFields({
                    name: '⚔️ Bullets Remaining',
                    value: `${player.bullets} bullets`,
                    inline: true
                });
            }
            if (player.vests !== undefined) {
                roleEmbed.addFields({
                    name: '🛡️ Vests Remaining',
                    value: `${player.vests} vests`,
                    inline: true
                });
            }

            await user.send({ embeds: [roleEmbed] });

            // Send night instructions for Wasps
            if (role.team === 'wasp') {
                await user.send('During night phase, you can send messages to coordinate with your team. Just send me a DM during the night!');
            }
        } catch (error) {
            console.error(`Could not send role DM to ${player.displayName}:`, error);
            failures.push(player.displayName);
        }
    }

    return failures;
}

// Get cause of death message based on attack type
function getCauseOfDeath(game, death) {
    const killer = game.players.find(p => p.id === death.killerId);
    const killerName = killer ? killer.displayName : 'Unknown';
    const killerRole = killer && ROLES[killer.role] ? ROLES[killer.role].name : 'Unknown';

    switch (death.attackType) {
        case 'mafia':
            return `You were killed by the Wasps (${killerName} - ${killerRole})`;
        case 'vigilante':
            return `You were shot by a Vigilante Bee (${killerName})`;
        case 'serial_killer':
            return `You were killed by the Hornet (${killerName})`;
        case 'arson':
            return `You were ignited by the Fire Ant (${killerName})`;
        case 'bodyguard_sacrifice':
            return `You died protecting your target as a Guard Bee`;
        case 'bodyguard_counter':
            return `You were killed by a Guard Bee's counterattack (${killerName})`;
        case 'serial_killer_counter':
            return `You were killed by the Hornet's counterattack (${killerName})`;
        case 'veteran_counter':
            return `You were killed by a Soldier Bee's alert (${killerName})`;
        case 'jail_execute':
            return `You were executed by the Queen Bee (${killerName})`;
        case 'voted':
            return `You were voted out by the hive`;
        case 'jester_haunt':
            return `You were haunted to death by the Clown Beetle`;
        default:
            return `You were eliminated`;
    }
}

// Send death notification DM to killed player
async function sendDeathNotification(game, client, death) {
    try {
        const victim = game.players.find(p => p.id === death.victimId);
        if (!victim) return;

        const user = await client.users.fetch(victim.id);
        const role = ROLES[victim.role];

        const deathEmbed = new EmbedBuilder()
            .setColor('#000000')
            .setTitle('💀 You Have Been Eliminated')
            .setDescription(`You have been killed and are now out of the game.\n\n**Your Role:** ${role.emoji} ${role.name}`)
            .setTimestamp();

        // Add cause of death if in debug mode
        if (game.debugMode) {
            const causeOfDeath = getCauseOfDeath(game, death);
            deathEmbed.addFields({
                name: '🔍 Debug Info: Cause of Death',
                value: causeOfDeath,
                inline: false
            });
        }

        await user.send({ embeds: [deathEmbed] });
    } catch (error) {
        console.error(`Could not send death notification to ${death.victimId}:`, error);
    }
}

// Send an embed to all alive players via DM
async function sendToAllPlayers(game, client, embed, components = []) {
    const alivePlayers = game.players.filter(p => p.alive);

    for (const player of alivePlayers) {
        try {
            const user = await client.users.fetch(player.id);
            await user.send({ embeds: [embed], components });
        } catch (error) {
            console.error(`Could not send message to ${player.displayName}:`, error);
        }
    }
}

// Send an embed to ALL players (including dead) via DM
async function sendToEveryoneInGame(game, client, embed, components = []) {
    for (const player of game.players) {
        try {
            const user = await client.users.fetch(player.id);
            await user.send({ embeds: [embed], components });
        } catch (error) {
            console.error(`Could not send message to ${player.displayName}:`, error);
        }
    }
}

// Update game display
async function updateGameDisplay(game, client) {
    try {
        // Use cached channel if available, otherwise fetch and cache it
        if (!game.cachedChannel) {
            game.cachedChannel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
        }
        const channel = game.cachedChannel;
        const message = await channel.messages.fetch(game.messageId);

        const embed = createGameEmbed(game);
        const components = game.phase === 'voting' ? createVotingButtons(game.id, game.players.filter(p => p.alive)) : [];

        await message.edit({
            embeds: [embed],
            components: components
        });
    } catch (error) {
        console.error('Error updating game display:', error);
    }
}

// Mute/unmute voice channel (text channel no longer used during gameplay)
async function muteVoiceAndLockText(game, client, shouldMute) {
    try {
        // Get the voice channel
        const voiceChannel = await client.channels.fetch(MAFIA_VC_ID);

        if (shouldMute) {
            // NIGHT: Mute all members in voice channel
            if (voiceChannel && voiceChannel.members) {
                for (const [memberId, member] of voiceChannel.members) {
                    try {
                        const player = game.players.find(p => p.id === memberId);
                        await member.voice.setMute(true, 'Night phase - discussion locked');

                        // Deaf Bee: Always deafened
                        if (player && player.role === 'DEAF_BEE') {
                            await member.voice.setDeaf(true, 'Deaf Bee - cannot hear voice');
                        }
                    } catch (error) {
                        console.error(`Could not mute ${member.displayName}:`, error);
                    }
                }
            }
        } else {
            // DAY: Unmute ONLY alive members in voice channel
            if (voiceChannel && voiceChannel.members) {
                for (const [memberId, member] of voiceChannel.members) {
                    try {
                        // Check if player is alive
                        const player = game.players.find(p => p.id === memberId);
                        if (player && player.alive) {
                            // Keller Bee: Always muted (but can be unmuted during day for Deaf Bee)
                            if (player.role === 'KELLER_BEE') {
                                await member.voice.setMute(true, 'Keller Bee - cannot speak');
                            } else {
                                await member.voice.setMute(false, 'Day phase - discussion open');
                            }

                            // Deaf Bee: Always deafened
                            if (player.role === 'DEAF_BEE') {
                                await member.voice.setDeaf(true, 'Deaf Bee - cannot hear voice');
                            }
                        } else {
                            // Keep dead players muted
                            await member.voice.setMute(true, 'Dead - must remain silent');
                        }
                    } catch (error) {
                        console.error(`Could not unmute ${member.displayName}:`, error);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error toggling voice mute:', error);
    }
}

// Start night phase
async function startNightPhase(game, client) {
    game.phase = 'night';
    const nightDuration = getPhaseDuration(game, 'night');
    game.phaseEndTime = Date.now() + nightDuration;
    game.nightActions = {};
    game.nightMessages = [];
    game.lastActivityTime = Date.now();

    // Check for Phantom Moth returning
    const phantomMoths = game.players.filter(p => p.role === 'PHANTOM_MOTH' && p.phantomInvisible && p.alive);
    for (const phantom of phantomMoths) {
        // Return after completing 1 night/day cycle (2 phases)
        if (phantom.phantomReturnPhase && game.phase === 'night') {
            phantom.phantomInvisible = false;
            phantom.phantomReturnPhase = null;

            try {
                const user = await client.users.fetch(phantom.id);
                const embed = new EmbedBuilder()
                    .setColor('#9370DB')
                    .setTitle('👤 You Have Returned!')
                    .setDescription('You are no longer invisible. You are back in the game! Now you must survive to the end to win.')
                    .setTimestamp();
                await user.send({ embeds: [embed] });
            } catch (error) {
                console.error(`Could not notify Phantom Moth return:`, error);
            }
        }
    }

    // Use cached channel
    if (!game.cachedChannel) {
        game.cachedChannel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
    }
    const channel = game.cachedChannel;

    // Mute voice channel (no longer need to lock text channel since we're not using it)
    await muteVoiceAndLockText(game, client, true);

    const nightEmbed = new EmbedBuilder()
        .setColor('#000080')
        .setTitle('🌙 Night Falls Over the Hive')
        .setDescription('The bees settle in for the night. Those with special abilities will receive prompts!\n\n🔇 Voice chat is now muted.')
        .setTimestamp();

    // Send night announcement to all players via DM
    await sendToEveryoneInGame(game, client, nightEmbed);

    // Send night action prompts
    await sendNightActionPrompts(game, client);

    // Update game display
    await updateGameDisplay(game, client);

    // Set warning timer (only if phase is long enough)
    const warningTime = game.debugMode ? 10000 : 30000; // 10s in debug, 30s in normal
    if (nightDuration > warningTime) {
        game.warningTimer = setTimeout(async () => {
            const playersWithActions = game.players.filter(p => {
                if (!p.alive) return false;
                const role = ROLES[p.role];
                return role.nightAction;
            });

            for (const player of playersWithActions) {
                // Only warn if they haven't submitted an action yet
                if (!game.nightActions[player.id]) {
                    try {
                        const user = await client.users.fetch(player.id);
                        const timeLeft = game.debugMode ? '10 seconds' : '30 seconds';
                        await user.send(`⏰ **${timeLeft} remaining** in the night phase! Submit your action now!`);
                    } catch (error) {
                        console.error(`Could not send warning to ${player.displayName}:`, error);
                    }
                }
            }
        }, nightDuration - warningTime);
    }

    // In debug mode, make bots automatically perform night actions after a short delay (unless NoAI is enabled)
    if (game.debugMode && !game.noAI) {
        setTimeout(() => {
            const botPlayers = game.players.filter(p => p.alive && p.id.startsWith('bot'));
            botPlayers.forEach(bot => {
                const role = ROLES[bot.role];
                if (!role.nightAction) return;

                const alivePlayers = game.players.filter(p => p.alive);
                let validTargets = [];
                let target = null;

                switch (role.actionType) {
                    case 'mafia_kill':
                        // Wasps target non-wasps
                        validTargets = alivePlayers.filter(p => ROLES[p.role].team !== 'wasp');
                        break;
                    case 'investigate_suspicious':
                    case 'investigate_exact':
                    case 'consigliere':
                    case 'lookout':
                    case 'seance':
                        // Can target anyone except self
                        validTargets = alivePlayers.filter(p => p.id !== bot.id);
                        break;
                    case 'frame':
                    case 'clean':
                    case 'disguise':
                        // Can target anyone except self and team members
                        validTargets = alivePlayers.filter(p => p.id !== bot.id && ROLES[p.role].team !== 'wasp');
                        break;
                    case 'witch':
                        // Spider needs to control someone and redirect them to a new target
                        validTargets = alivePlayers.filter(p => p.id !== bot.id);
                        if (validTargets.length > 0 && alivePlayers.length > 0) {
                            const controlled = validTargets[Math.floor(Math.random() * validTargets.length)];
                            const newTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
                            game.nightActions[bot.id] = {
                                actionType: 'witch',
                                target: controlled.id,
                                newTarget: newTarget.id
                            };
                            console.log(`[Debug] ${bot.displayName} (Spider) controlling ${controlled.displayName} to target ${newTarget.displayName}`);
                        }
                        return;
                    case 'roleblock':
                        // Can roleblock anyone except self
                        validTargets = alivePlayers.filter(p => p.id !== bot.id);
                        break;
                    case 'shoot':
                        // Soldier - can shoot anyone except self
                        if (bot.bullets && bot.bullets > 0) {
                            validTargets = alivePlayers.filter(p => p.id !== bot.id);
                        }
                        break;
                    case 'serial_kill':
                        // Murder Hornet can target anyone except self
                        validTargets = alivePlayers.filter(p => p.id !== bot.id);
                        break;
                    case 'arsonist':
                        // Fire Ant - decide whether to douse or ignite
                        const dousedCount = game.dousedPlayers ? game.dousedPlayers.size : 0;
                        // 40% chance to ignite if at least 2 players are doused
                        if (dousedCount >= 2 && Math.random() < 0.4) {
                            game.nightActions[bot.id] = { actionType: 'arsonist', ignite: true };
                            console.log(`[Debug] ${bot.displayName} (Fire Ant) is igniting all doused players!`);
                            return;
                        } else {
                            // Otherwise douse someone
                            validTargets = alivePlayers.filter(p => p.id !== bot.id);
                        }
                        break;
                    case 'heal':
                    case 'guard':
                        // Can protect/heal anyone
                        validTargets = alivePlayers;
                        break;
                    case 'jail':
                        // Jailer - can jail anyone except self
                        validTargets = alivePlayers.filter(p => p.id !== bot.id);
                        break;
                    case 'alert':
                        // Veteran - goes on alert (no target needed)
                        if (bot.alerts && bot.alerts > 0) {
                            game.nightActions[bot.id] = { actionType: 'alert' };
                            console.log(`[Debug] ${bot.displayName} went on alert`);
                        }
                        return;
                    case 'vest':
                        // Survivor - puts on vest (no target needed)
                        if (bot.vests && bot.vests > 0) {
                            game.nightActions[bot.id] = { actionType: 'vest' };
                            console.log(`[Debug] ${bot.displayName} put on vest`);
                        }
                        return;
                    case 'remember':
                        // Amnesiac - remember a dead role
                        const deadPlayers = game.players.filter(p => !p.alive);
                        if (deadPlayers.length > 0 && !bot.hasRemembered) {
                            target = deadPlayers[Math.floor(Math.random() * deadPlayers.length)];
                            game.nightActions[bot.id] = { actionType: 'remember', target: target.id };
                            console.log(`[Debug] ${bot.displayName} chose to remember ${target.displayName}'s role`);
                        }
                        return;
                    default:
                        return;
                }

                // Select random target from valid targets
                if (validTargets.length > 0) {
                    target = validTargets[Math.floor(Math.random() * validTargets.length)];

                    // Special handling for Jailer - randomly decide whether to execute
                    if (role.actionType === 'jail' && bot.executions > 0) {
                        const shouldExecute = Math.random() < 0.3; // 30% chance to execute
                        game.nightActions[bot.id] = {
                            actionType: 'jail',
                            target: target.id,
                            execute: shouldExecute
                        };
                        console.log(`[Debug] ${bot.displayName} (${role.name}) jailed ${target.displayName}${shouldExecute ? ' and will execute' : ''}`);
                    } else {
                        game.nightActions[bot.id] = { actionType: role.actionType, target: target.id };
                        console.log(`[Debug] ${bot.displayName} (${role.name}) targeted ${target.displayName}`);
                    }
                }
            });
            game.lastActivityTime = Date.now();
        }, 3000); // Bots act after 3 seconds
    }

    // Set timer for day phase
    game.phaseTimer = setTimeout(async () => {
        await endNightPhase(game, client);
    }, nightDuration);
}

// Send night action prompts
async function sendNightActionPrompts(game, client) {
    const alivePlayers = game.players.filter(p => p.alive);

    for (const player of alivePlayers) {
        try {
            const user = await client.users.fetch(player.id);
            const role = ROLES[player.role];

            // Skip if no night action
            if (!role.nightAction) continue;

            let targets, embed;
            const actionType = role.actionType;

            // Determine color based on team
            let color;
            if (role.team === 'bee') color = '#FFD700';
            else if (role.team === 'wasp') color = '#8B0000';
            else color = '#808080';

            switch (actionType) {
                case 'mafia_kill':
                    // Wasps - can target anyone except other wasps
                    targets = alivePlayers
                        .filter(p => ROLES[p.role].team !== 'wasp')
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Choose Kill Target`)
                        .setDescription(`Vote for who to eliminate tonight. Send me the **number** of your target.\n\n${targets}`)
                        .setFooter({ text: 'Coordinate with your team via DMs!' });
                    break;

                case 'heal':
                    // Nurse Bee - can heal anyone
                    targets = alivePlayers
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Heal Someone`)
                        .setDescription(`Choose a player to heal tonight. Send me the **number** of your target.\n\n${targets}`)
                        .setFooter({ text: player.selfHealsLeft ? `Self-heals remaining: ${player.selfHealsLeft}` : 'Choose wisely!' });
                    break;

                case 'guard':
                    // Guard Bee - protect anyone
                    targets = alivePlayers
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Guard Someone`)
                        .setDescription(`Choose a player to guard tonight. You will die in their place if attacked.\n\n${targets}`)
                        .setFooter({ text: 'Be brave!' });
                    break;

                case 'investigate_suspicious':
                    // Queen's Guard - investigate for suspicious
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Investigate`)
                        .setDescription(`Choose a player to investigate for suspicious activity.\n\n${targets}`)
                        .setFooter({ text: 'Find the Wasps!' });
                    break;

                case 'investigate_exact':
                    // Scout Bee - investigate exact role
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Investigate`)
                        .setDescription(`Choose a player to investigate. You will learn their exact role.\n\n${targets}`)
                        .setFooter({ text: 'Discover the truth!' });
                    break;

                case 'consigliere':
                    // Spy Wasp - investigate exact role
                    targets = alivePlayers
                        .filter(p => p.id !== player.id && ROLES[p.role].team !== 'wasp')
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Spy on Someone`)
                        .setDescription(`Choose a player to investigate. You will learn their exact role.\n\n${targets}`)
                        .setFooter({ text: 'Knowledge is power!' });
                    break;

                case 'lookout':
                    // Lookout Bee - watch someone
                    targets = alivePlayers
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Watch Someone`)
                        .setDescription(`Choose a player to watch. You will see who visits them.\n\n${targets}`)
                        .setFooter({ text: 'Keep your eyes open!' });
                    break;

                case 'shoot':
                    // Soldier Bee - shoot someone
                    if (player.bullets <= 0) {
                        await user.send('You have no bullets remaining!');
                        continue;
                    }

                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Shoot Someone`)
                        .setDescription(`Choose a player to shoot. You have ${player.bullets} bullet${player.bullets !== 1 ? 's' : ''} remaining.\n\n${targets}`)
                        .setFooter({ text: 'Warning: Shooting a Bee will kill you from guilt!' });
                    break;

                case 'serial_kill':
                    // Murder Hornet - kill someone
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Kill Someone`)
                        .setDescription(`Choose your target. You will also kill anyone who visits you!\n\n${targets}`)
                        .setFooter({ text: 'Leave no witnesses!' });
                    break;

                case 'arsonist':
                    // Fire Ant - douse or ignite
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    const dousedCount = game.dousedPlayers ? game.dousedPlayers.size : 0;

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Douse or Ignite`)
                        .setDescription(`Send a **number** to douse that player, or send **"ignite"** to ignite all doused players.\n\nDoused players: ${dousedCount}\n\n${targets}`)
                        .setFooter({ text: 'Burn them all!' });
                    break;

                case 'vest':
                    // Butterfly - use vest
                    if (player.vests <= 0) {
                        await user.send('You have no vests remaining!');
                        continue;
                    }

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Use Vest`)
                        .setDescription(`Send **"vest"** to use a vest tonight (${player.vests} vest${player.vests !== 1 ? 's' : ''} remaining), or **"skip"** to not use one.`)
                        .setFooter({ text: 'Stay alive!' });
                    break;

                case 'witch':
                    // Spider - control someone
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Control Someone`)
                        .setDescription(`Send two numbers separated by a space: **first** is who to control, **second** is their new target.\n\n${targets}`)
                        .setFooter({ text: 'Manipulate their actions!' });
                    break;

                case 'frame':
                    // Deceiver Wasp - frame someone
                    targets = alivePlayers
                        .filter(p => ROLES[p.role].team !== 'wasp')
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Frame Someone`)
                        .setDescription(`Choose a player to frame. They will appear suspicious to investigators.\n\n${targets}`)
                        .setFooter({ text: 'Deceive the Bees!' });
                    break;

                case 'jail':
                    // Jailer Bee - jail and optionally execute
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Jail Someone`)
                        .setDescription(`Choose a player to jail. Send a **number** to jail, or **number exe** to jail and execute.\n\nExecutions remaining: ${player.executions}\n\n${targets}`)
                        .setFooter({ text: 'Justice must be served!' });
                    break;

                case 'roleblock':
                    // Escort/Consort - roleblock someone
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    const isWaspRoleblock = role.team === 'wasp';
                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - ${isWaspRoleblock ? 'Distract' : 'Escort'} Someone`)
                        .setDescription(`Choose a player to roleblock. They will not perform their action tonight.\n\n${targets}`)
                        .setFooter({ text: isWaspRoleblock ? 'Sabotage the Bees!' : 'Protect the hive!' });
                    break;

                case 'seance':
                    // Medium - speak with dead
                    const deadPlayers = game.players.filter(p => !p.alive);
                    if (deadPlayers.length === 0) {
                        await user.send('There are no dead players to speak with yet.');
                        continue;
                    }

                    targets = deadPlayers
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Speak with the Dead`)
                        .setDescription(`Choose a dead player to speak with. You will learn their role.\n\n${targets}`)
                        .setFooter({ text: 'Commune with the spirits...' });
                    break;

                case 'alert':
                    // Veteran - go on alert
                    if (player.alerts <= 0) {
                        await user.send('You have no alerts remaining!');
                        continue;
                    }

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Go on Alert`)
                        .setDescription(`Send **"alert"** to go on alert tonight (${player.alerts} alert${player.alerts !== 1 ? 's' : ''} remaining), or **"skip"** to stay home.\n\n⚠️ You will kill ALL visitors with a powerful attack!`)
                        .setFooter({ text: 'Defend your position!' });
                    break;

                case 'clean':
                    // Janitor - clean a body
                    if (player.cleans <= 0) {
                        await user.send('You have no cleans remaining!');
                        continue;
                    }

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Clean a Body`)
                        .setDescription(`Choose a target. If they die tonight, their role will be hidden (${player.cleans} clean${player.cleans !== 1 ? 's' : ''} remaining).\n\n${alivePlayers.filter(p => ROLES[p.role].team !== 'wasp').map((p, i) => `${i + 1}. ${p.displayName}`).join('\n')}`)
                        .setFooter({ text: 'Clean up the evidence!' });
                    break;

                case 'disguise':
                    // Disguiser - disguise as dead
                    if (player.disguises <= 0) {
                        await user.send('You have no disguises remaining!');
                        continue;
                    }

                    const deadForDisguise = game.players.filter(p => !p.alive);
                    if (deadForDisguise.length === 0) {
                        await user.send('There are no dead players to disguise as yet.');
                        continue;
                    }

                    targets = deadForDisguise
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Disguise`)
                        .setDescription(`Choose a dead player to disguise as (${player.disguises} disguise${player.disguises !== 1 ? 's' : ''} remaining).\n\n${targets}`)
                        .setFooter({ text: 'Assume their identity!' });
                    break;

                case 'remember':
                    // Amnesiac - remember a role
                    if (player.hasRemembered) {
                        continue; // Already remembered
                    }

                    const deadForRemember = game.players.filter(p => !p.alive);
                    if (deadForRemember.length === 0) {
                        await user.send('There are no dead players whose role you can remember yet.');
                        continue;
                    }

                    targets = deadForRemember
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Remember Your Role`)
                        .setDescription(`Choose a dead player. You will become their role and join their team!\n\n${targets}`)
                        .setFooter({ text: 'Choose your destiny!' });
                    break;

                case 'pirate_duel':
                    // Pirate Beetle - challenge someone to a duel
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    const duelsWon = player.duelsWon || 0;
                    const duelsNeeded = player.duelsNeeded || 2;

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Challenge to a Duel`)
                        .setDescription(`Choose someone to duel! Send: **[number] [rock/paper/scissors]**\n\nExample: **1 rock**\n\nDuels Won: ${duelsWon}/${duelsNeeded}\n\n${targets}`)
                        .setFooter({ text: 'Win 2 duels to become a Butterfly!' });
                    break;

                case 'track':
                    // Tracker Bee - follow someone
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Track Someone`)
                        .setDescription(`Choose a player to track. You will see who they visit tonight.\n\n${targets}`)
                        .setFooter({ text: 'Follow their movements!' });
                    break;

                case 'pollinate':
                    // Pollinator Bee - pollinate someone
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Pollinate Someone`)
                        .setDescription(`Choose a player to pollinate. You will receive results in 2 nights showing all visitors and who they visited.\n\n${targets}`)
                        .setFooter({ text: 'Plant your seeds of knowledge!' });
                    break;

                case 'spy':
                    // Spy Bee - automatic spy (no input needed)
                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Spying Automatically`)
                        .setDescription(`You are automatically spying on the Wasps tonight!\n\nYou will see who the Wasps visit and read their communications.\n\n*No action required - results will arrive at dawn.*`)
                        .setFooter({ text: 'Gathering intelligence...' });

                    // Auto-trigger spy action
                    game.nightActions[player.id] = { actionType: 'spy' };
                    break;

                case 'trap':
                    // Trapper Bee - set a trap
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Set a Trap`)
                        .setDescription(`Choose a player's house to set a trap at. Attackers visiting will be roleblocked and revealed to you.\n\n${targets}`)
                        .setFooter({ text: 'Catch the predators!' });
                    break;

                case 'retribution':
                    // Retributionist Bee - revive someone
                    if (player.hasRevived) {
                        await user.send('You have already used your revive!');
                        continue;
                    }

                    const deadBees = game.players.filter(p => !p.alive && ROLES[p.role].team === 'bee');
                    if (deadBees.length === 0) {
                        await user.send('There are no dead Bees to revive yet.');
                        continue;
                    }

                    targets = deadBees
                        .map((p, i) => `${i + 1}. ${p.displayName} (${ROLES[p.role].name})`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Revive a Bee`)
                        .setDescription(`Choose a dead Bee to revive for one night. Send **"skip"** to not revive tonight.\n\n${targets}`)
                        .setFooter({ text: 'Bring them back!' });
                    break;

                case 'beekeeper':
                    // Beekeeper - protect or inspect
                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Choose Your Action`)
                        .setDescription(`Send **"protect"** to learn if Wasps tried to kill tonight${player.hasProtected ? ' (already used)' : ''}\nSend **"inspect"** to learn how many Wasps are alive\nSend **"skip"** to do nothing`)
                        .setFooter({ text: 'Protect the hive!' });
                    break;

                case 'librarian':
                    // Librarian Bee - check for limited abilities
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Investigate Powers`)
                        .setDescription(`Choose a player to investigate. You will learn if they have limited-use abilities (bullets, vests, cleans, etc.).\n\n${targets}`)
                        .setFooter({ text: 'Check the records!' });
                    break;

                case 'coroner':
                    // Coroner Bee - examine dead
                    const deadForCoroner = game.players.filter(p => !p.alive);
                    if (deadForCoroner.length === 0) {
                        await user.send('There are no dead players to examine yet.');
                        continue;
                    }

                    targets = deadForCoroner
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Examine the Dead`)
                        .setDescription(`Choose a dead player to examine. You will learn how they died.\n\n${targets}`)
                        .setFooter({ text: 'Determine the cause of death!' });
                    break;

                case 'transport':
                    // Transporter Bee - swap two players
                    targets = alivePlayers
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Transport Two Players`)
                        .setDescription(`Send two numbers separated by a space: **first second**\n\nAll actions targeting them will be swapped.\n\n${targets}`)
                        .setFooter({ text: 'Cause chaos!' });
                    break;

                case 'psychic':
                    // Psychic Bee - automatic vision (no input needed)
                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Receiving Vision`)
                        .setDescription(`You are automatically receiving a psychic vision tonight!\n\nYou will see 3 players, at least one is Evil.\n\n*No action required - vision will arrive at dawn.*`)
                        .setFooter({ text: 'The spirits are speaking...' });

                    // Auto-trigger psychic action
                    game.nightActions[player.id] = { actionType: 'psychic' };
                    break;

                case 'blackmail':
                    // Blackmailer Wasp - blackmail someone
                    targets = alivePlayers
                        .filter(p => ROLES[p.role].team !== 'wasp')
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Blackmail Someone`)
                        .setDescription(`Choose a player to blackmail. They cannot talk during the next day phase.\n\n${targets}`)
                        .setFooter({ text: 'Silence the Bees!' });
                    break;

                case 'hypnotize':
                    // Hypnotist Wasp - give false feedback
                    targets = alivePlayers
                        .filter(p => ROLES[p.role].team !== 'wasp')
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Hypnotize Someone`)
                        .setDescription(`Choose a player to hypnotize. They will receive false night feedback.\n\n${targets}`)
                        .setFooter({ text: 'Confuse the investigators!' });
                    break;

                case 'poison':
                    // Poisoner Wasp - poison someone
                    targets = alivePlayers
                        .filter(p => ROLES[p.role].team !== 'wasp')
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Poison Someone`)
                        .setDescription(`Choose a player to poison. They will die in 2 nights unless healed.\n\n${targets}`)
                        .setFooter({ text: 'A slow, silent death!' });
                    break;

                case 'sabotage':
                    // Saboteur Wasp - sabotage someone
                    targets = alivePlayers
                        .filter(p => ROLES[p.role].team !== 'wasp')
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Sabotage Someone`)
                        .setDescription(`Choose a player to sabotage. Their action will fail silently (they receive false success feedback).\n\n${targets}`)
                        .setFooter({ text: 'Undermine their efforts!' });
                    break;

                case 'mimic':
                    // Mimic Wasp - disguise as a role
                    if (player.mimics <= 0) {
                        await user.send('You have no mimics remaining!');
                        continue;
                    }

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Mimic a Role`)
                        .setDescription(`Choose a Bee role to mimic (${player.mimics} mimic${player.mimics !== 1 ? 's' : ''} remaining).\n\nSend the role name (e.g., "Scout Bee", "Nurse Bee")\n\nYou will appear as that role if investigated.`)
                        .setFooter({ text: 'Predict the investigators!' });
                    break;

                case 'silencer':
                    // Silencer Wasp - silence results
                    if (player.silences <= 0) {
                        await user.send('You have no silences remaining!');
                        continue;
                    }

                    targets = alivePlayers
                        .filter(p => ROLES[p.role].team !== 'wasp')
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Silence Someone`)
                        .setDescription(`Choose a player to silence (${player.silences} silence${player.silences !== 1 ? 's' : ''} remaining). Their ability results will return nothing.\n\n${targets}`)
                        .setFooter({ text: 'Block their information!' });
                    break;

                case 'mole':
                    // Mole Wasp - automatic intelligence gathering (no input needed)
                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Gathering Intelligence`)
                        .setDescription(`You are automatically infiltrating the hive tonight!\n\nYou will learn the role of one random Bee.\n\n*No action required - intelligence will arrive at dawn.*`)
                        .setFooter({ text: 'Infiltrating...' });

                    // Auto-trigger mole action
                    game.nightActions[player.id] = { actionType: 'mole' };
                    break;

                case 'kidnap':
                    // Kidnapper Wasp - kidnap someone
                    if (player.hasKidnapped) {
                        await user.send('You have already used your kidnap!');
                        continue;
                    }

                    targets = alivePlayers
                        .filter(p => ROLES[p.role].team !== 'wasp')
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Kidnap Someone`)
                        .setDescription(`Choose a player to kidnap for an entire cycle. Send **"skip"** to not kidnap tonight.\n\n${targets}`)
                        .setFooter({ text: 'Take them away!' });
                    break;

                case 'yakuza':
                    // Yakuza Wasp - convert neutral
                    if (player.hasConverted) {
                        await user.send('You have already used your conversion!');
                        continue;
                    }

                    targets = alivePlayers
                        .filter(p => ROLES[p.role].team === 'neutral')
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    if (!targets) {
                        await user.send('There are no neutral players to convert.');
                        continue;
                    }

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Convert a Neutral`)
                        .setDescription(`Choose a neutral player to convert to a Killer Wasp. Send **"skip"** to not convert tonight.\n\n${targets}`)
                        .setFooter({ text: 'Recruit them!' });
                    break;

                case 'guardian':
                    // Guardian Ant - choose target (Night 1 only)
                    if (player.guardianTarget) {
                        continue; // Already has a target
                    }

                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night 1 - Choose Your Ward`)
                        .setDescription(`Choose one player to protect for the entire game. They cannot die at night while you live.\n\n${targets}`)
                        .setFooter({ text: 'Choose wisely - this is permanent!' });
                    break;

                case 'gossip':
                    // Gossip Beetle - send anonymous message
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Spread Gossip`)
                        .setDescription(`Send: **[number] [message]**\n\nExample: **1 You are suspicious!**\n\nThey will receive an anonymous message.\n\n${targets}`)
                        .setFooter({ text: 'Create chaos!' });
                    break;

                case 'gamble':
                    // Gambler Beetle - bet on death
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    const luckyCoins = player.luckyCoins || 0;

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Place Your Bet`)
                        .setDescription(`Bet on who will die tonight. Guess correctly to earn a lucky coin!\n\nLucky Coins: ${luckyCoins}/3\n\n${targets}`)
                        .setFooter({ text: 'Feeling lucky?' });
                    break;

                case 'doppelganger':
                    // Doppelgänger - copy someone (Night 1 only)
                    if (player.hasCopied) {
                        continue; // Already copied
                    }

                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night 1 - Choose Your Target`)
                        .setDescription(`Choose one player to copy. You will become their exact role and team.\n\n${targets}`)
                        .setFooter({ text: 'Become someone else!' });
                    break;

                case 'oracle':
                    // Oracle - automatic hint (no input needed)
                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Receiving Vision`)
                        .setDescription(`You are automatically receiving a cryptic hint tonight!\n\nYou will receive information about the game state.\n\n*No action required - hint will arrive at dawn.*`)
                        .setFooter({ text: 'The spirits whisper secrets...' });

                    // Auto-trigger oracle action
                    game.nightActions[player.id] = { actionType: 'oracle' };
                    break;

                case 'cultist':
                    // Cultist - convert someone
                    targets = alivePlayers
                        .filter(p => p.id !== player.id)
                        .map((p, i) => `${i + 1}. ${p.displayName}`)
                        .join('\n');

                    const conversions = player.conversions || 0;

                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Convert Someone`)
                        .setDescription(`Choose a player to convert to your cult.\n\nConversions: ${conversions}/3\n\n${targets}`)
                        .setFooter({ text: 'Join us!' });
                    break;

                case 'wildcard':
                    // Wildcard - automatic random ability (no input needed)
                    embed = new EmbedBuilder()
                        .setColor(color)
                        .setTitle(`${role.emoji} Night Phase - Rolling the Dice`)
                        .setDescription(`You are automatically receiving a random ability tonight!\n\nYou will receive a random power.\n\n*No action required - ability will activate at dawn.*`)
                        .setFooter({ text: 'Lady Luck is spinning...' });

                    // Auto-trigger wildcard action
                    game.nightActions[player.id] = { actionType: 'wildcard' };
                    break;

                default:
                    // Unknown action type
                    continue;
            }

            if (embed) {
                await user.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error(`Could not send night action prompt to ${player.displayName}:`, error);
        }
    }
}

// Process night action
async function processNightAction(userId, message, game, client) {
    const player = game.players.find(p => p.id === userId);
    if (!player || !player.alive) return;

    updateActivity(game);

    const role = ROLES[player.role];
    const alivePlayers = game.players.filter(p => p.alive);
    const input = message.content.trim().toLowerCase();
    const choice = parseInt(input);

    // Handle Wasp coordination messages (text messages, not numbers)
    if (role.team === 'wasp' && isNaN(choice)) {
        const wasps = game.players.filter(p => ROLES[p.role].team === 'wasp' && p.alive && p.id !== userId);

        for (const wasp of wasps) {
            try {
                const user = await client.users.fetch(wasp.id);
                await user.send(`**${player.displayName}:** ${message.content}`);
            } catch (error) {
                console.error(`Could not relay message to ${wasp.displayName}:`, error);
            }
        }

        return;
    }

    const actionType = role.actionType;
    let validTargets, target;

    switch (actionType) {
        case 'mafia_kill':
            // Wasp kill vote
            validTargets = alivePlayers.filter(p => ROLES[p.role].team !== 'wasp');
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'mafia_kill', target: target.id };
                await message.reply(`You voted to eliminate **${target.displayName}**. 🎯`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'heal':
            // Nurse Bee heal
            if (choice >= 1 && choice <= alivePlayers.length) {
                target = alivePlayers[choice - 1];
                game.nightActions[userId] = { actionType: 'heal', target: target.id };
                await message.reply(`You are healing **${target.displayName}** tonight. ⚕️`);
            } else {
                await sendInvalidChoiceMessage(message, alivePlayers);
            }
            break;

        case 'guard':
            // Guard Bee protect
            if (choice >= 1 && choice <= alivePlayers.length) {
                target = alivePlayers[choice - 1];
                game.nightActions[userId] = { actionType: 'guard', target: target.id };
                await message.reply(`You are guarding **${target.displayName}** tonight. 🛡️`);
            } else {
                await sendInvalidChoiceMessage(message, alivePlayers);
            }
            break;

        case 'investigate_suspicious':
        case 'investigate_exact':
        case 'consigliere':
            // Investigation (results handled in mafiaActions.js)
            validTargets = alivePlayers.filter(p => p.id !== userId);
            if (actionType === 'consigliere') {
                validTargets = validTargets.filter(p => ROLES[p.role].team !== 'wasp');
            }

            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: actionType, target: target.id };
                await message.reply(`You are investigating **${target.displayName}** tonight. 🔍`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'lookout':
            // Lookout watch
            if (choice >= 1 && choice <= alivePlayers.length) {
                target = alivePlayers[choice - 1];
                game.nightActions[userId] = { actionType: 'lookout', target: target.id };
                await message.reply(`You are watching **${target.displayName}** tonight. 👁️`);
            } else {
                await sendInvalidChoiceMessage(message, alivePlayers);
            }
            break;

        case 'shoot':
            // Soldier Bee shoot
            if (player.bullets <= 0) {
                await message.reply('You have no bullets remaining!');
                return;
            }

            validTargets = alivePlayers.filter(p => p.id !== userId);
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'shoot', target: target.id };
                await message.reply(`You are shooting **${target.displayName}** tonight. ⚔️`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'serial_kill':
            // Murder Hornet kill
            validTargets = alivePlayers.filter(p => p.id !== userId);
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'serial_kill', target: target.id };
                await message.reply(`You are killing **${target.displayName}** tonight. 💀`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'arsonist':
            // Fire Ant - douse or ignite
            if (input === 'ignite') {
                game.nightActions[userId] = { actionType: 'arsonist', ignite: true };
                await message.reply('You will ignite all doused players tonight! 🔥');
            } else {
                validTargets = alivePlayers.filter(p => p.id !== userId);
                if (choice >= 1 && choice <= validTargets.length) {
                    target = validTargets[choice - 1];
                    game.nightActions[userId] = { actionType: 'arsonist', target: target.id };
                    await message.reply(`You are dousing **${target.displayName}** tonight. 🔥`);
                } else {
                    await sendInvalidChoiceMessage(message, validTargets, 'Send a number to douse or "ignite" to ignite all doused players.');
                }
            }
            break;

        case 'vest':
            // Butterfly vest
            if (input === 'vest') {
                if (player.vests > 0) {
                    game.nightActions[userId] = { actionType: 'vest' };
                    await message.reply(`You are using a vest tonight. You have ${player.vests - 1} vest${player.vests - 1 !== 1 ? 's' : ''} remaining. 🛡️`);
                } else {
                    await message.reply('You have no vests remaining!');
                }
            } else if (input === 'skip') {
                await message.reply('You will not use a vest tonight.');
            } else {
                await message.reply('Send **"vest"** to use a vest or **"skip"** to not use one.');
            }
            break;

        case 'witch':
            // Spider control
            const numbers = input.split(' ').map(n => parseInt(n)).filter(n => !isNaN(n));
            if (numbers.length === 2) {
                validTargets = alivePlayers.filter(p => p.id !== userId);
                const controlTarget = numbers[0] - 1;
                const newTarget = numbers[1] - 1;

                if (controlTarget >= 0 && controlTarget < validTargets.length &&
                    newTarget >= 0 && newTarget < alivePlayers.length) {
                    const controlled = validTargets[controlTarget];
                    const redirected = alivePlayers[newTarget];
                    game.nightActions[userId] = {
                        actionType: 'witch',
                        target: controlled.id,
                        newTarget: redirected.id
                    };
                    await message.reply(`You are controlling **${controlled.displayName}** to target **${redirected.displayName}** tonight. 🕷️`);
                } else {
                    await sendInvalidChoiceMessage(message, validTargets, 'Send two numbers: first is who to control, second is their new target.');
                }
            } else {
                await sendInvalidChoiceMessage(message, alivePlayers.filter(p => p.id !== userId), 'Send two numbers separated by a space: first is who to control, second is their new target.');
            }
            break;

        case 'frame':
            // Deceiver Wasp frame
            validTargets = alivePlayers.filter(p => ROLES[p.role].team !== 'wasp');
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'frame', target: target.id };

                // Add to framed players set
                if (!game.framedPlayers) {
                    game.framedPlayers = new Set();
                }
                game.framedPlayers.add(target.id);

                await message.reply(`You are framing **${target.displayName}** tonight. 🎭`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'jail':
            // Jailer - jail and optionally execute
            const parts = input.split(' ');
            const jailChoice = parseInt(parts[0]);
            const shouldExecute = parts.length > 1 && parts[1] === 'exe';

            validTargets = alivePlayers.filter(p => p.id !== userId);
            if (jailChoice >= 1 && jailChoice <= validTargets.length) {
                target = validTargets[jailChoice - 1];
                game.nightActions[userId] = {
                    actionType: 'jail',
                    target: target.id,
                    execute: shouldExecute
                };

                if (shouldExecute) {
                    await message.reply(`You are jailing and executing **${target.displayName}** tonight. ⛓️⚡`);
                } else {
                    await message.reply(`You are jailing **${target.displayName}** tonight. ⛓️`);
                }
            } else {
                await sendInvalidChoiceMessage(message, validTargets, 'Send a number to jail, or "number exe" to jail and execute.');
            }
            break;

        case 'roleblock':
            // Escort/Consort - roleblock
            validTargets = alivePlayers.filter(p => p.id !== userId);
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'roleblock', target: target.id };
                await message.reply(`You are roleblocking **${target.displayName}** tonight. 💃`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'seance':
            // Medium - speak with dead
            const deadPlayers = game.players.filter(p => !p.alive);
            if (choice >= 1 && choice <= deadPlayers.length) {
                target = deadPlayers[choice - 1];
                game.nightActions[userId] = { actionType: 'seance', target: target.id };
                await message.reply(`You are speaking with **${target.displayName}** tonight. 👻`);
            } else {
                await sendInvalidChoiceMessage(message, deadPlayers);
            }
            break;

        case 'alert':
            // Veteran - go on alert
            if (input === 'alert') {
                if (player.alerts > 0) {
                    game.nightActions[userId] = { actionType: 'alert' };
                    await message.reply(`You are going on alert tonight. You will kill all visitors! 🎖️`);
                } else {
                    await message.reply('You have no alerts remaining!');
                }
            } else if (input === 'skip') {
                await message.reply('You will stay home tonight.');
            } else {
                await message.reply('Send **"alert"** to go on alert or **"skip"** to stay home.');
            }
            break;

        case 'clean':
            // Janitor - clean a body
            if (player.cleans <= 0) {
                await message.reply('You have no cleans remaining!');
                return;
            }

            validTargets = alivePlayers.filter(p => ROLES[p.role].team !== 'wasp');
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'clean', target: target.id };
                await message.reply(`You will clean **${target.displayName}** if they die tonight. 🧹`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'disguise':
            // Disguiser - disguise as dead
            if (player.disguises <= 0) {
                await message.reply('You have no disguises remaining!');
                return;
            }

            const deadForDisguise = game.players.filter(p => !p.alive);
            if (choice >= 1 && choice <= deadForDisguise.length) {
                target = deadForDisguise[choice - 1];
                game.nightActions[userId] = { actionType: 'disguise', target: target.id };
                await message.reply(`You are disguising as **${target.displayName}** tonight. 🎪`);
            } else {
                await sendInvalidChoiceMessage(message, deadForDisguise);
            }
            break;

        case 'remember':
            // Amnesiac - remember a role
            if (player.hasRemembered) {
                await message.reply('You have already remembered your role!');
                return;
            }

            const deadForRemember = game.players.filter(p => !p.alive);
            if (choice >= 1 && choice <= deadForRemember.length) {
                target = deadForRemember[choice - 1];
                game.nightActions[userId] = { actionType: 'remember', target: target.id };
                await message.reply(`You will remember **${target.displayName}'s** role tonight. 🪲`);
            } else {
                await sendInvalidChoiceMessage(message, deadForRemember);
            }
            break;

        case 'track':
            // Tracker Bee - track who a player visits
            validTargets = alivePlayers.filter(p => p.id !== userId);
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'track', target: target.id };
                await message.reply(`You are tracking **${target.displayName}** tonight. 🗺️`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'pollinate':
            // Pollinator Bee - pollinate a player for delayed results
            validTargets = alivePlayers.filter(p => p.id !== userId);
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'pollinate', target: target.id };
                await message.reply(`You are pollinating **${target.displayName}** tonight. Results will bloom in 2 nights! 🌸`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'blackmail':
            // Blackmailer Wasp - silence a player during next day
            validTargets = alivePlayers.filter(p => ROLES[p.role].team !== 'wasp');
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'blackmail', target: target.id };
                await message.reply(`You are blackmailing **${target.displayName}** tonight. They won't be able to speak tomorrow! 🤐`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'hypnotize':
            // Hypnotist Wasp - give false feedback
            validTargets = alivePlayers.filter(p => ROLES[p.role].team !== 'wasp');
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                // Default fake message - can be customized later
                game.nightActions[userId] = {
                    actionType: 'hypnotize',
                    target: target.id,
                    fakeMessage: 'You were roleblocked!'
                };
                await message.reply(`You are hypnotizing **${target.displayName}** tonight. They will receive false feedback! 🌀`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'pirate_duel':
            // Pirate Beetle - duel a player (rock-paper-scissors)
            const duelParts = input.split(' ');
            const duelChoice = parseInt(duelParts[0]);
            const rpsChoice = duelParts.length > 1 ? duelParts[1].toLowerCase() : null;

            if (!rpsChoice || !['rock', 'paper', 'scissors'].includes(rpsChoice)) {
                await message.reply('Send: **number rock/paper/scissors** (e.g., "1 rock")');
                return;
            }

            validTargets = alivePlayers.filter(p => p.id !== userId);
            if (duelChoice >= 1 && duelChoice <= validTargets.length) {
                target = validTargets[duelChoice - 1];
                game.nightActions[userId] = {
                    actionType: 'pirate_duel',
                    target: target.id,
                    choice: rpsChoice
                };
                await message.reply(`You are challenging **${target.displayName}** to a duel with **${rpsChoice}**! 🏴‍☠️`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets, 'Send: number rock/paper/scissors (e.g., "1 rock")');
            }
            break;

        case 'guardian':
            // Guardian Ant - choose target on night 1, then auto-protect
            if (!player.guardianTarget) {
                // Night 1 - choose target
                validTargets = alivePlayers.filter(p => p.id !== userId);
                if (choice >= 1 && choice <= validTargets.length) {
                    target = validTargets[choice - 1];
                    game.nightActions[userId] = { actionType: 'guardian', target: target.id };
                    await message.reply(`You have chosen to guard **${target.displayName}**! They cannot die at night while you live. 🐜`);
                } else {
                    await sendInvalidChoiceMessage(message, validTargets);
                }
            } else {
                // Already chosen target, auto-protect
                await message.reply(`You are protecting **${game.players.find(p => p.id === player.guardianTarget).displayName}** tonight. 🐜`);
                game.nightActions[userId] = { actionType: 'guardian', target: player.guardianTarget };
            }
            break;

        case 'spy':
            // Spy Bee - automatically set (no input needed, already set in prompt)
            await message.reply('Your spy action has already been set! Results at dawn. 🕵️');
            break;

        case 'trap':
            // Trapper Bee - set trap at player's house
            if (choice >= 1 && choice <= alivePlayers.length) {
                target = alivePlayers[choice - 1];
                game.nightActions[userId] = { actionType: 'trap', target: target.id };
                await message.reply(`You are setting a trap at **${target.displayName}'s** house tonight. 🪤`);
            } else {
                await sendInvalidChoiceMessage(message, alivePlayers);
            }
            break;

        case 'retribution':
            // Retributionist Bee - revive a dead Bee
            if (player.hasRevived) {
                await message.reply('You have already used your revival!');
                return;
            }

            const deadBees = game.players.filter(p => !p.alive && ROLES[p.role].team === 'bee');
            if (deadBees.length === 0) {
                await message.reply('There are no dead Bees to revive!');
                return;
            }

            if (choice >= 1 && choice <= deadBees.length) {
                target = deadBees[choice - 1];
                game.nightActions[userId] = { actionType: 'retribution', target: target.id };
                await message.reply(`You are reviving **${target.displayName}** for one night! ⚰️`);
            } else {
                await sendInvalidChoiceMessage(message, deadBees);
            }
            break;

        case 'poison':
            // Poisoner Wasp - poison a player
            validTargets = alivePlayers.filter(p => ROLES[p.role].team !== 'wasp');
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'poison', target: target.id };
                await message.reply(`You are poisoning **${target.displayName}** tonight. They will die in 2 nights! 🧪`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'gossip':
            // Gossip Beetle - send anonymous message
            // Format: "number message" - first part is the number, rest is the message
            const gossipParts = input.split(' ');
            const gossipChoice = parseInt(gossipParts[0]);
            const gossipMessage = gossipParts.slice(1).join(' ');

            if (!gossipMessage) {
                await message.reply('Send: **number message** (e.g., "1 I saw them acting suspicious...")');
                return;
            }

            validTargets = alivePlayers.filter(p => p.id !== userId);
            if (gossipChoice >= 1 && gossipChoice <= validTargets.length) {
                target = validTargets[gossipChoice - 1];
                game.nightActions[userId] = {
                    actionType: 'gossip',
                    target: target.id,
                    message: gossipMessage
                };
                await message.reply(`You are sending gossip to **${target.displayName}**: "${gossipMessage}" 🗣️`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets, 'Send: number message (e.g., "1 I saw them acting suspicious...")');
            }
            break;

        case 'beekeeper':
            // Beekeeper - protect or inspect
            if (input === 'protect') {
                if (player.hasProtected) {
                    await message.reply('You have already used your protection!');
                    return;
                }
                game.nightActions[userId] = { actionType: 'beekeeper', choice: 'protect' };
                await message.reply('You are protecting the hive tonight. You will learn if Wasps tried to kill! 🍯');
            } else if (input === 'inspect') {
                game.nightActions[userId] = { actionType: 'beekeeper', choice: 'inspect' };
                await message.reply('You are inspecting the honey stores. You will learn how many Wasps are alive! 🍯');
            } else {
                await message.reply('Send **"protect"** to protect the hive (once per game) or **"inspect"** to count Wasps.');
            }
            break;

        case 'sabotage':
            // Saboteur Wasp - sabotage a player's action
            validTargets = alivePlayers.filter(p => ROLES[p.role].team !== 'wasp');
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'sabotage', target: target.id };
                await message.reply(`You are sabotaging **${target.displayName}** tonight. Their action will fail silently! ⚙️`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'mimic':
            // Mimic Wasp - choose a role to appear as
            if (player.mimics <= 0) {
                await message.reply('You have no mimics remaining!');
                return;
            }

            // List of ALL Bee roles to mimic
            const beeRoles = Object.entries(ROLES)
                .filter(([, role]) => role.team === 'bee')
                .map(([key]) => key);
            const roleNames = beeRoles.map((r, i) => `${i + 1}. ${ROLES[r].name} ${ROLES[r].emoji}`).join('\n');

            if (choice >= 1 && choice <= beeRoles.length) {
                const chosenRole = beeRoles[choice - 1];
                game.nightActions[userId] = { actionType: 'mimic', roleChoice: chosenRole };
                await message.reply(`You will appear as **${ROLES[chosenRole].name}** ${ROLES[chosenRole].emoji} if investigated tonight! 🎨 (${player.mimics - 1} mimic${player.mimics - 1 !== 1 ? 's' : ''} remaining)`);
            } else {
                await message.reply(`🎨 Choose a Bee role to mimic (${player.mimics} mimic${player.mimics !== 1 ? 's' : ''} remaining):\n\n${roleNames}\n\nSend a number (1-${beeRoles.length})`);
            }
            break;

        case 'gamble':
            // Gambler Beetle - bet on who dies
            validTargets = alivePlayers.filter(p => p.id !== userId);
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'gamble', target: target.id };
                await message.reply(`You are betting on **${target.displayName}** dying tonight. Good luck! 🎰`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'doppelganger':
            // Doppelgänger - copy a player's role
            if (player.hasCopied) {
                await message.reply('You have already copied a role!');
                return;
            }

            validTargets = alivePlayers.filter(p => p.id !== userId);
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'doppelganger', target: target.id };
                await message.reply(`You are copying **${target.displayName}'s** role! 🎭`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'oracle':
            // Oracle - automatically set (no input needed, already set in prompt)
            await message.reply('Your oracle vision has already been set! Results at dawn. 🔮');
            break;

        case 'librarian':
            // Librarian Bee - investigate for limited-use abilities
            validTargets = alivePlayers.filter(p => p.id !== userId);
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'librarian', target: target.id };
                await message.reply(`You are investigating **${target.displayName}** for limited-use abilities tonight. 📚`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'coroner':
            // Coroner Bee - examine dead player
            const deadForCoroner = game.players.filter(p => !p.alive);
            if (deadForCoroner.length === 0) {
                await message.reply('There are no dead players to examine!');
                return;
            }

            if (choice >= 1 && choice <= deadForCoroner.length) {
                target = deadForCoroner[choice - 1];
                game.nightActions[userId] = { actionType: 'coroner', target: target.id };
                await message.reply(`You are examining **${target.displayName}**'s body tonight. 🔬`);
            } else {
                await sendInvalidChoiceMessage(message, deadForCoroner);
            }
            break;

        case 'transport':
            // Transporter Bee - swap two players
            const transportNumbers = input.split(' ').map(n => parseInt(n)).filter(n => !isNaN(n));
            if (transportNumbers.length === 2) {
                const target1Idx = transportNumbers[0] - 1;
                const target2Idx = transportNumbers[1] - 1;

                if (target1Idx >= 0 && target1Idx < alivePlayers.length &&
                    target2Idx >= 0 && target2Idx < alivePlayers.length &&
                    target1Idx !== target2Idx) {
                    const target1 = alivePlayers[target1Idx];
                    const target2 = alivePlayers[target2Idx];
                    game.nightActions[userId] = {
                        actionType: 'transport',
                        target1: target1.id,
                        target2: target2.id
                    };
                    await message.reply(`You are swapping **${target1.displayName}** and **${target2.displayName}** tonight. 🔄`);
                } else {
                    await sendInvalidChoiceMessage(message, alivePlayers, 'Send two different numbers separated by a space (e.g., "1 3")');
                }
            } else {
                await sendInvalidChoiceMessage(message, alivePlayers, 'Send two numbers separated by a space (e.g., "1 3")');
            }
            break;

        case 'psychic':
            // Psychic Bee - automatically set (no input needed, already set in prompt)
            await message.reply('Your psychic vision has already been set! Results at dawn. 🔮');
            break;

        case 'silencer':
            // Silencer Wasp - silence ability results
            validTargets = alivePlayers.filter(p => ROLES[p.role].team !== 'wasp');
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'silencer', target: target.id };
                await message.reply(`You are silencing **${target.displayName}** tonight. They won't receive ability results! 🔇`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'mole':
            // Mole Wasp - automatically set (no input needed, already set in prompt)
            await message.reply('Your infiltration has already been set! Results at dawn. 🐛');
            break;

        case 'kidnap':
            // Kidnapper Wasp - kidnap a player for a cycle
            validTargets = alivePlayers.filter(p => ROLES[p.role].team !== 'wasp');
            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'kidnap', target: target.id };
                await message.reply(`You are kidnapping **${target.displayName}** tonight. They will be removed for 1 cycle! 🎒`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'yakuza':
            // Yakuza Wasp - convert neutral to Wasp
            if (player.hasConverted) {
                await message.reply('You have already converted someone!');
                return;
            }

            validTargets = alivePlayers.filter(p => {
                const targetRole = ROLES[p.role];
                return targetRole.team === 'neutral' && targetRole.subteam !== 'killing';
            });

            if (validTargets.length === 0) {
                await message.reply('There are no convertible Neutrals alive!');
                return;
            }

            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'yakuza', target: target.id };
                await message.reply(`You are converting **${target.displayName}** to the Wasp team tonight! ⚡`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'cultist':
            // Cultist - convert to cult
            validTargets = alivePlayers.filter(p => {
                const targetRole = ROLES[p.role];
                return p.id !== userId &&
                    !p.convertedToCult &&
                    targetRole.team !== 'wasp' &&
                    !(targetRole.team === 'neutral' && targetRole.subteam === 'killing');
            });

            if (validTargets.length === 0) {
                await message.reply('There are no convertible players left!');
                return;
            }

            if (choice >= 1 && choice <= validTargets.length) {
                target = validTargets[choice - 1];
                game.nightActions[userId] = { actionType: 'cultist', target: target.id };
                await message.reply(`You are converting **${target.displayName}** to your cult tonight! 🕯️`);
            } else {
                await sendInvalidChoiceMessage(message, validTargets);
            }
            break;

        case 'wildcard':
            // Wildcard - automatically set (no input needed, already set in prompt)
            await message.reply('Your wildcard ability has already been set! Results at dawn. 🎲');
            break;

        default:
            // Unknown action type or no night action
            break;
    }
}

// Helper function to send invalid choice messages
async function sendInvalidChoiceMessage(message, validTargets, customMessage = null) {
    const targets = validTargets
        .map((p, i) => `${i + 1}. ${p.displayName}`)
        .join('\n');

    const errorMessage = customMessage || `Invalid choice. Please send a valid number (1-${validTargets.length}):`;
    await message.reply(`${errorMessage}\n\n${targets}`);
}

// End night phase
async function endNightPhase(game, client) {
    if (game.phase !== 'night') return;

    // Clear warning timer if it exists
    if (game.warningTimer) {
        clearTimeout(game.warningTimer);
    }

    // Use cached channel
    if (!game.cachedChannel) {
        game.cachedChannel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
    }
    const channel = game.cachedChannel;

    // Process all night actions using the new system
    const deaths = await processNightActions(game, client);

    // Send death notifications to killed players
    for (const death of deaths) {
        await sendDeathNotification(game, client, death);
    }

    // Announce results to all players via DM
    const dawnEmbed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('☀️ Dawn Breaks Over the Hive')
        .setTimestamp();

    if (deaths.length > 0) {
        const deathMessages = deaths.map(death => {
            const victim = game.players.find(p => p.id === death.victimId);
            return `**${victim.displayName}**`;
        });

        dawnEmbed.setDescription(`The bees wake to find ${deathMessages.join(', ')} ${deaths.length === 1 ? 'has' : 'have'} been eliminated during the night! 💀\n\n*Their role${deaths.length === 1 ? '' : 's'} will be revealed at the end of the game.*`);
    } else {
        dawnEmbed.setDescription('The bees wake to find everyone safe! The night was quiet... 🌙');
    }

    // Send dawn announcement to all players via DM
    await sendToEveryoneInGame(game, client, dawnEmbed);

    // Clear night data after processing
    clearNightData(game);

    // Check win condition
    if (checkWinCondition(game, client)) {
        return;
    }

    // Start day phase
    game.phase = 'day';
    const dayDuration = getPhaseDuration(game, 'day');
    game.phaseEndTime = Date.now() + dayDuration;

    // Unmute voice channel
    await muteVoiceAndLockText(game, client, false);

    const dayEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('☀️ Day Discussion Phase')
        .setDescription(`Discuss amongst yourselves and try to figure out who the Wasps are!\n\n🔊 Voice chat is now open! You can also send messages here and I'll relay them to everyone.\n\nVoting will begin in ${dayDuration / 1000} seconds.`)
        .setTimestamp();

    // Send day announcement to all players via DM
    await sendToEveryoneInGame(game, client, dayEmbed);

    // Send Marshal Bee protection instructions
    const marshals = game.players.filter(p => p.alive && p.role === 'MARSHAL_BEE');
    for (const marshal of marshals) {
        // Reset protection for new day
        marshal.marshalProtectedToday = null;

        try {
            const user = await client.users.fetch(marshal.id);
            const alivePlayers = game.players.filter(p => p.alive);
            const playerList = alivePlayers
                .map((p, i) => `${i + 1}. ${p.displayName}`)
                .join('\n');

            const marshalEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🎖️ Marshal Bee - Protection Available')
                .setDescription(`You can protect one player from being voted out today!\n\nSend me the number of the player you want to protect:\n\n${playerList}\n\nOr send a text message to relay to all players.`)
                .setTimestamp();

            await user.send({ embeds: [marshalEmbed] });
        } catch (error) {
            console.error(`Could not send Marshal instructions to ${marshal.displayName}:`, error);
        }
    }

    await updateGameDisplay(game, client);

    // Set timer for voting phase
    game.phaseTimer = setTimeout(async () => {
        await startVotingPhase(game, client);
    }, dayDuration);
}

// Start voting phase
async function startVotingPhase(game, client) {
    if (game.phase !== 'day') return;

    game.phase = 'voting';
    const votingDuration = getPhaseDuration(game, 'voting');
    game.phaseEndTime = Date.now() + votingDuration;
    game.votes = {};
    game.lastActivityTime = Date.now();

    // Use cached channel
    if (!game.cachedChannel) {
        game.cachedChannel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
    }
    const channel = game.cachedChannel;

    const alivePlayers = game.players.filter(p => p.alive);

    // Create voting buttons
    const votingButtons = createVotingButtons(game.id, alivePlayers);

    // Send voting message with buttons to each alive player's DM
    for (const player of alivePlayers) {
        try {
            const user = await client.users.fetch(player.id);
            let description = `Vote for who you think is a Wasp! The player with the most votes will be eliminated.\n\n**Alive Players:** ${alivePlayers.length}\n**Time Remaining:** ${votingDuration / 1000} seconds`;

            // Add Judge instructions if player is a Judge
            if (player.role === 'JUDGE' && !player.hasUsedRevote) {
                description += '\n\n⚖️ **You are the Judge!** Send **"revote"** in DM to clear all votes and force a revote (once per game).';
            }

            const votingEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🗳️ Voting Phase')
                .setDescription(description)
                .setTimestamp();

            await user.send({
                embeds: [votingEmbed],
                components: votingButtons
            });
        } catch (error) {
            console.error(`Could not send voting buttons to ${player.displayName}:`, error);
        }
    }

    // In debug mode, make bots automatically vote after a short delay
    if (game.debugMode) {
        setTimeout(() => {
            const botPlayers = game.players.filter(p => p.alive && p.id.startsWith('bot'));
            botPlayers.forEach(bot => {
                // Bots vote for random alive players (can vote for each other or the human)
                const votableTargets = alivePlayers.filter(p => p.id !== bot.id);
                if (votableTargets.length > 0) {
                    const randomTarget = votableTargets[Math.floor(Math.random() * votableTargets.length)];
                    game.votes[bot.id] = randomTarget.id;
                    console.log(`[Debug] ${bot.displayName} voted for ${randomTarget.displayName}`);
                }
            });
            game.lastActivityTime = Date.now();
        }, 2000); // Bots vote after 2 seconds
    }

    // Set timer for vote results
    game.phaseTimer = setTimeout(async () => {
        await endVotingPhase(game, client);
    }, votingDuration);
}

// End voting phase
async function endVotingPhase(game, client) {
    if (game.phase !== 'voting') return;

    // Use cached channel
    if (!game.cachedChannel) {
        game.cachedChannel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
    }
    const channel = game.cachedChannel;

    // Check for Marshal Bee protection
    const marshals = game.players.filter(p => p.alive && p.role === 'MARSHAL_BEE');
    const marshalProtectedPlayers = new Set();

    for (const marshal of marshals) {
        // Marshal can protect one player per day (including themselves)
        if (marshal.marshalProtectedToday) {
            marshalProtectedPlayers.add(marshal.marshalProtectedToday);
        }
    }

    // Tally votes with Queen Bee bonus and Marshal protection
    const voteCounts = {};
    const marshalBlockedVotes = {}; // Track votes blocked by Marshal

    Object.entries(game.votes).forEach(([voterId, targetId]) => {
        if (targetId !== 'skip') {
            const voter = game.players.find(p => p.id === voterId);
            // Check if voter is a revealed Queen Bee (gets 3 bonus votes for total of 4)
            const voteWeight = (voter && voter.role === 'QUEEN_BEE' && voter.hasRevealed) ? 4 : 1;

            // Check if target is protected by Marshal
            if (marshalProtectedPlayers.has(targetId)) {
                marshalBlockedVotes[targetId] = (marshalBlockedVotes[targetId] || 0) + voteWeight;
            } else {
                voteCounts[targetId] = (voteCounts[targetId] || 0) + voteWeight;
            }
        }
    });

    let eliminatedPlayer = null;

    if (Object.keys(voteCounts).length > 0) {
        const maxVotes = Math.max(...Object.values(voteCounts));
        const topTargets = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);

        // In debug mode, only 1 vote needed. In normal mode, at least 2 votes needed
        const votesNeeded = game.debugMode ? 1 : 2;
        if (maxVotes >= votesNeeded) {
            const targetId = topTargets[Math.floor(Math.random() * topTargets.length)];
            eliminatedPlayer = game.players.find(p => p.id === targetId);
            if (eliminatedPlayer) {
                // Check if Phantom Moth and hasn't been lynched before
                if (eliminatedPlayer.role === 'PHANTOM_MOTH' && !eliminatedPlayer.hasBeenLynched) {
                    eliminatedPlayer.hasBeenLynched = true;
                    eliminatedPlayer.phantomInvisible = true;
                    eliminatedPlayer.phantomReturnPhase = game.phase; // Return after 1 night/day cycle

                    // Notify Phantom Moth
                    try {
                        const user = await client.users.fetch(eliminatedPlayer.id);
                        const embed = new EmbedBuilder()
                            .setColor('#9370DB')
                            .setTitle('👤 Phantom Form Activated!')
                            .setDescription('You have survived being lynched! You are now invisible and will return after 1 night/day cycle. You must survive to the end to win!')
                            .setTimestamp();
                        await user.send({ embeds: [embed] });
                    } catch (error) {
                        console.error(`Could not notify Phantom Moth:`, error);
                    }

                    // Don't actually eliminate them - they'll appear eliminated but stay "alive"
                    eliminatedPlayer = null; // Clear so announcement says no one was eliminated
                } else {
                    eliminatedPlayer.alive = false;
                    // Send death notification
                    await sendDeathNotification(game, client, {
                        victimId: eliminatedPlayer.id,
                        attackType: 'voted'
                    });
                }
            }
        }
    }

    // Announce results to all players via DM
    const resultsEmbed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('🗳️ Voting Results')
        .setTimestamp();

    if (eliminatedPlayer) {
        resultsEmbed.setDescription(`**${eliminatedPlayer.displayName}** has been voted out by the hive! 💀\n\n*Their role will be revealed at the end of the game.*`);
    } else {
        resultsEmbed.setDescription('No one received enough votes to be eliminated. The hive remains uncertain...');
    }

    // Show vote breakdown
    if (Object.keys(voteCounts).length > 0 || Object.keys(marshalBlockedVotes).length > 0) {
        let voteBreakdown = '';

        if (Object.keys(voteCounts).length > 0) {
            voteBreakdown += Object.entries(voteCounts)
                .map(([targetId, count]) => {
                    const player = game.players.find(p => p.id === targetId);
                    return `• ${player?.displayName || 'Unknown'}: ${count} vote${count !== 1 ? 's' : ''}`;
                })
                .join('\n');
        }

        if (Object.keys(marshalBlockedVotes).length > 0) {
            if (voteBreakdown) voteBreakdown += '\n\n';
            voteBreakdown += '**🎖️ Protected by Marshal:**\n';
            voteBreakdown += Object.entries(marshalBlockedVotes)
                .map(([targetId, count]) => {
                    const player = game.players.find(p => p.id === targetId);
                    return `• ${player?.displayName || 'Unknown'}: ${count} vote${count !== 1 ? 's' : ''} (blocked)`;
                })
                .join('\n');
        }

        resultsEmbed.addFields({
            name: 'Vote Breakdown',
            value: voteBreakdown,
            inline: false
        });
    }

    // Send results to all players via DM
    await sendToEveryoneInGame(game, client, resultsEmbed);

    // Handle Clown Beetle (Jester) haunt if they were lynched
    if (eliminatedPlayer && eliminatedPlayer.role === 'CLOWN_BEETLE') {
        // Get all players who voted for the Clown Beetle
        const guiltyVoters = Object.entries(game.votes)
            .filter(([voterId, targetId]) => targetId === eliminatedPlayer.id)
            .map(([voterId]) => game.players.find(p => p.id === voterId))
            .filter(p => p && p.alive);

        if (guiltyVoters.length > 0) {
            // Send haunt selection DM
            try {
                const user = await client.users.fetch(eliminatedPlayer.id);
                const targets = guiltyVoters
                    .map((p, i) => `${i + 1}. ${p.displayName}`)
                    .join('\n');

                const hauntEmbed = new EmbedBuilder()
                    .setColor('#FF1493')
                    .setTitle('🤡 Clown Beetle Haunt! 🤡')
                    .setDescription(`You were successfully lynched! Now choose one guilty voter to haunt!\n\n${targets}\n\nSend me the **number** of who you want to haunt. They will die with an unstoppable attack!`)
                    .setFooter({ text: 'You have 30 seconds to choose!' });

                await user.send({ embeds: [hauntEmbed] });

                // Store haunt data in game
                game.pendingHaunt = {
                    jesterId: eliminatedPlayer.id,
                    validTargets: guiltyVoters.map(p => p.id),
                    timestamp: Date.now()
                };

                // Set 30 second timeout for haunt selection
                setTimeout(async () => {
                    if (game.pendingHaunt && game.pendingHaunt.jesterId === eliminatedPlayer.id) {
                        // No haunt selected, pick random
                        const randomTarget = guiltyVoters[Math.floor(Math.random() * guiltyVoters.length)];
                        randomTarget.alive = false;

                        // Announce haunt to all players via DM
                        const hauntResultEmbed = new EmbedBuilder()
                            .setColor('#FF1493')
                            .setTitle('👻 Haunted!')
                            .setDescription(`**${eliminatedPlayer.displayName}** haunted **${randomTarget.displayName}** from beyond the grave! 💀`)
                            .setTimestamp();
                        await sendToEveryoneInGame(game, client, hauntResultEmbed);

                        game.pendingHaunt = null;

                        // Check win condition after haunt
                        if (!checkWinCondition(game, client)) {
                            await startNightPhase(game, client);
                        }
                    }
                }, 30000);

                // Announce Jester win to all players via DM
                const jesterWinEmbed = new EmbedBuilder()
                    .setColor('#FF1493')
                    .setTitle('🤡 Clown Beetle Wins!')
                    .setDescription(`**${eliminatedPlayer.displayName}** was the Clown Beetle (Jester)! They win and will haunt one of their voters!`)
                    .setTimestamp();
                await sendToEveryoneInGame(game, client, jesterWinEmbed);

                // End game for Jester (they've won)
                endGame(game, client, 'jester', eliminatedPlayer);
                return;
            } catch (error) {
                console.error('Could not send haunt DM:', error);
                const jesterWinEmbed2 = new EmbedBuilder()
                    .setColor('#FF1493')
                    .setTitle('🤡 Clown Beetle Wins!')
                    .setDescription(`**${eliminatedPlayer.displayName}** was the Clown Beetle (Jester)! They win, but could not be contacted to choose a haunt target.`)
                    .setTimestamp();
                await sendToEveryoneInGame(game, client, jesterWinEmbed2);
                endGame(game, client, 'jester', eliminatedPlayer);
                return;
            }
        } else {
            // No guilty voters (shouldn't happen in normal gameplay)
            const jesterWinEmbed3 = new EmbedBuilder()
                .setColor('#FF1493')
                .setTitle('🤡 Clown Beetle Wins!')
                .setDescription(`**${eliminatedPlayer.displayName}** was the Clown Beetle (Jester)! They win!`)
                .setTimestamp();
            await sendToEveryoneInGame(game, client, jesterWinEmbed3);
            endGame(game, client, 'jester', eliminatedPlayer);
            return;
        }
    }

    // Clear votes after processing to prevent stale data
    clearVotes(game);

    // Check win condition
    if (checkWinCondition(game, client)) {
        return;
    }

    // Start next night phase
    await startNightPhase(game, client);
}

// Check win condition wrapper (uses imported checkWinConditions)
function checkWinCondition(game, client) {
    const winInfo = checkWinConditions(game);

    if (winInfo) {
        endGame(game, client, winInfo.type, winInfo.winner);
        return true;
    }

    return false;
}

// End game
async function endGame(game, client, winnerType, specificWinner = null) {
    // Clear timers
    if (game.phaseTimer) {
        clearTimeout(game.phaseTimer);
    }
    if (game.warningTimer) {
        clearTimeout(game.warningTimer);
    }

    // Use cached channel
    if (!game.cachedChannel) {
        game.cachedChannel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
    }
    const channel = game.cachedChannel;

    // Determine win message
    let title, description, color;
    if (winnerType === 'bees') {
        title = '🐝 Bees Win! 🐝';
        description = 'The Bees have successfully eliminated all threats! The hive is safe!';
        color = '#FFD700';
    } else if (winnerType === 'wasps') {
        title = '🐝 Wasps Win! 🐝';
        description = 'The Wasps have taken over! The hive has fallen!';
        color = '#8B0000';
    } else if (winnerType === 'neutral_killer') {
        title = `💀 ${specificWinner ? ROLES[specificWinner.role].name : 'Neutral'} Wins! 💀`;
        description = 'All opposition has been eliminated! Victory through chaos!';
        color = '#800080';
    } else if (winnerType === 'jester') {
        title = '🤡 Jester Wins! 🤡';
        description = `${specificWinner.displayName} the Clown Beetle fooled you all!`;
        color = '#FF1493';
    } else if (winnerType === 'executioner') {
        title = '🎯 Executioner Wins! 🎯';
        description = `${specificWinner.displayName} successfully eliminated their target!`;
        color = '#A9A9A9';
    }

    // Create results embed
    const resultsEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎮 Game Over - ${title} 🎮`)
        .setDescription(description)
        .setTimestamp();

    // Show all roles grouped by team
    const beeRoles = [];
    const waspRoles = [];
    const neutralRoles = [];

    game.players.forEach(p => {
        const role = ROLES[p.role];
        const roleText = `${role.emoji} ${p.displayName} - **${role.name}** ${p.alive ? '✅' : '💀'}`;
        if (role.team === 'bee') {
            beeRoles.push(roleText);
        } else if (role.team === 'wasp') {
            waspRoles.push(roleText);
        } else {
            neutralRoles.push(roleText);
        }
    });

    if (beeRoles.length > 0) {
        resultsEmbed.addFields({
            name: '🐝 Bee Team',
            value: beeRoles.join('\n'),
            inline: false
        });
    }
    if (waspRoles.length > 0) {
        resultsEmbed.addFields({
            name: '🐝 Wasp Team',
            value: waspRoles.join('\n'),
            inline: false
        });
    }
    if (neutralRoles.length > 0) {
        resultsEmbed.addFields({
            name: '🦋 Neutral Roles',
            value: neutralRoles.join('\n'),
            inline: false
        });
    }

    // Award BobbyBucks to winners
    const winners = determineWinners(game, winnerType, specificWinner);

    for (const player of winners) {
        try {
            await updateBobbyBucks(player.id, WINNER_REWARD);

            // Update stats
            await User.findOneAndUpdate(
                { userId: player.id },
                {
                    $inc: {
                        'mafiaStats.gamesPlayed': 1,
                        'mafiaStats.gamesWon': 1
                    },
                    $addToSet: { 'mafiaStats.rolesPlayed': ROLES[player.role].name }
                },
                { upsert: true }
            );
        } catch (error) {
            console.error(`Error updating stats for ${player.displayName}:`, error);
        }
    }

    // Update stats for losers
    const losers = game.players.filter(p => !winners.includes(p));
    for (const player of losers) {
        try {
            await User.findOneAndUpdate(
                { userId: player.id },
                {
                    $inc: { 'mafiaStats.gamesPlayed': 1 },
                    $addToSet: { 'mafiaStats.rolesPlayed': ROLES[player.role].name }
                },
                { upsert: true }
            );
        } catch (error) {
            console.error(`Error updating stats for ${player.displayName}:`, error);
        }
    }

    resultsEmbed.addFields({
        name: '💰 Rewards',
        value: `${winners.map(p => p.displayName).join(', ')} each received **${WINNER_REWARD} BobbyBucks**!`,
        inline: false
    });

    // Send game results to all players via DM
    await sendToEveryoneInGame(game, client, resultsEmbed);

    // Unmute voice and unlock text channel before ending game
    await muteVoiceAndLockText(game, client, false);

    // Remove mute/deafen from Keller Bee and Deaf Bee players at game end
    try {
        const voiceChannel = await client.channels.fetch(MAFIA_VC_ID);
        if (voiceChannel && voiceChannel.members) {
            for (const player of game.players) {
                const member = voiceChannel.members.get(player.id);
                if (member) {
                    // Unmute Keller Bee
                    if (player.role === 'KELLER_BEE') {
                        await member.voice.setMute(false, 'Game ended');
                        console.log(`🤐 Unmuted Keller Bee: ${player.displayName}`);
                    }
                    // Undeafen Deaf Bee
                    if (player.role === 'DEAF_BEE') {
                        await member.voice.setDeaf(false, 'Game ended');
                        console.log(`🦻 Undeafened Deaf Bee: ${player.displayName}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error removing mute/deafen for special roles at game end:', error);
    }

    // Clean up game
    deleteGame(game.id);
}

// Clean up inactive games
async function cleanupInactiveGames(client) {
    const now = Date.now();
    const gamesToDelete = [];
    const activeGames = getAllGames();

    for (const [gameId, game] of activeGames.entries()) {
        if (now - game.lastActivityTime > GAME_INACTIVITY_TIMEOUT) {
            gamesToDelete.push(gameId);
        }
    }

    for (const gameId of gamesToDelete) {
        const game = getGame(gameId);
        if (game) {
            console.log(`Cleaning up inactive game ${gameId} (inactive for ${Math.floor((now - game.lastActivityTime) / 60000)} minutes)`);

            // Clear timers
            if (game.phaseTimer) {
                clearTimeout(game.phaseTimer);
            }
            if (game.warningTimer) {
                clearTimeout(game.warningTimer);
            }

            // Unmute voice and unlock text channel before cleanup
            try {
                await muteVoiceAndLockText(game, client, false);
            } catch (error) {
                console.error('Error unmuting/unlocking during cleanup:', error);
            }

            // Delete game (also cleans up player mappings)
            deleteGame(gameId);
        }
    }

    return gamesToDelete.length;
}

module.exports = (client) => {
    console.log('🐝 Mafia Handler loaded!');

    // Set up periodic cleanup of inactive games (every 10 minutes)
    setInterval(async () => {
        const cleaned = await cleanupInactiveGames(client);
        if (cleaned > 0) {
            console.log(`🧹 Cleaned up ${cleaned} inactive mafia game(s)`);
        }
    }, 600000); // 10 minutes

    // Handle !createmafia command
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // Only run in target guild
        if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

        const args = message.content.split(' ');
        const command = args[0].toLowerCase();

        if (command === '!createmafia') {
            // Check if already in a game
            if (getGameByPlayer(message.author.id)) {
                return message.reply('You are already in an active game!');
            }

            // Check if user is in voice channel
            const member = message.member;
            if (!member.voice.channel || member.voice.channel.id !== MAFIA_VC_ID) {
                return message.reply(`You must be in the Mafia voice channel (<#${MAFIA_VC_ID}>) to create a game!`);
            }

            // Get all members in voice channel
            const voiceChannel = member.voice.channel;
            const members = Array.from(voiceChannel.members.values());
            const humanMembers = members.filter(m => !m.user.bot);

            if (humanMembers.length < MIN_PLAYERS) {
                return message.reply(`Not enough players! You need at least ${MIN_PLAYERS} players in the voice channel to start a game.`);
            }

            // Check if any players are already in a game
            const playersInGame = humanMembers.filter(m => getGameByPlayer(m.user.id));
            if (playersInGame.length > 0) {
                return message.reply(`Some players are already in an active game: ${playersInGame.map(m => m.displayName).join(', ')}`);
            }

            // Check for random mode
            const randomMode = args[1] && args[1].toLowerCase() === 'random';

            // Create game ID and players
            const gameId = `mafia_${Date.now()}`;
            const players = humanMembers.map(m => ({
                id: m.user.id,
                username: m.user.username,
                displayName: m.displayName || m.user.username,
                alive: true,
                role: null
            }));

            // Assign roles
            const roleDistribution = getRoleDistribution(players.length, randomMode);
            const shuffledRoles = shuffleArray(roleDistribution);

            for (let i = 0; i < players.length; i++) {
                initializePlayerRole(players[i], shuffledRoles[i]);
            }

            // Assign Executioner targets
            players.filter(p => p.role === 'BOUNTY_HUNTER').forEach(exe => {
                const validTargets = players.filter(p =>
                    p.id !== exe.id && ROLES[p.role].team === 'bee' // Target must be a bee
                );
                if (validTargets.length > 0) {
                    exe.target = validTargets[Math.floor(Math.random() * validTargets.length)].id;
                }
            });

            // Store pending game configuration
            pendingGameConfigs.set(message.author.id, {
                gameId,
                players,
                organizerId: message.author.id,
                randomMode
            });

            // Send time configuration prompt
            const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);

            const configEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('⏱️ Game Time Configuration')
                .setDescription(`<@${message.author.id}>, please configure the game time limits.\n\n**Default Times:**\n• Setup: 30 seconds\n• Night Phase: 60 seconds (1 minute)\n• Day Phase: 180 seconds (3 minutes)\n• Voting Phase: 120 seconds (2 minutes)\n\nChoose an option below:`)
                .addFields({
                    name: 'Players',
                    value: players.map(p => `• ${p.displayName}`).join('\n'),
                    inline: false
                })
                .setTimestamp();

            const configRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`mafia_quickstart_${message.author.id}`)
                        .setLabel('⚡ Quick Start (Default Times)')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`mafia_customize_${message.author.id}`)
                        .setLabel('⚙️ Configure Custom Times')
                        .setStyle(ButtonStyle.Primary)
                );

            await channel.send({ embeds: [configEmbed], components: [configRow] });

            // Set timeout to auto-start with defaults after 2 minutes
            setTimeout(() => {
                if (pendingGameConfigs.has(message.author.id)) {
                    const config = pendingGameConfigs.get(message.author.id);
                    pendingGameConfigs.delete(message.author.id);
                    channel.send(`⏱️ Time configuration timed out. Starting game with default times...`);
                    startMafiaGame(client, config);
                }
            }, 120000); // 2 minutes
        }

        // Handle !createmafiadebug command
        if (command === '!createmafiadebug') {
            // Check if already in a game
            if (getGameByPlayer(message.author.id)) {
                return message.reply('You are already in an active game!');
            }

            // Check if user is in voice channel
            const member = message.member;
            if (!member.voice.channel || member.voice.channel.id !== MAFIA_VC_ID) {
                return message.reply(`You must be in the Mafia voice channel (<#${MAFIA_VC_ID}>) to create a debug game!`);
            }

            // Parse arguments for role(s), random mode, and NoAI
            let randomMode = false;
            let noAI = false;
            let specifiedRoles = []; // Array to hold multiple roles

            // Check each argument
            for (let i = 1; i < args.length; i++) {
                const argUpper = args[i].toUpperCase();
                if (argUpper === 'RANDOM') {
                    randomMode = true;
                } else if (argUpper === 'NOAI') {
                    noAI = true;
                } else {
                    // Check if argument contains comma-separated roles
                    const roleList = args[i].split(',').map(r => r.trim().toUpperCase());

                    // Validate all roles in the list
                    for (const roleName of roleList) {
                        if (ROLES[roleName]) {
                            specifiedRoles.push(roleName);
                        } else {
                            // Invalid role name
                            const validRoles = Object.keys(ROLES).sort().join(', ');
                            return message.reply(`❌ Invalid role: **${roleName}**\n\n**Valid roles:**\n${validRoles}\n\n**Usage:** \`!createmafiadebug [ROLE_ONE,ROLE_TWO,...] [random] [NoAI]\`\n**Examples:**\n• \`!createmafiadebug SCOUT_BEE\` - Play as Scout Bee\n• \`!createmafiadebug SCOUT_BEE,WASP_QUEEN\` - Assign Scout Bee to you, Wasp Queen to next person in VC\n• \`!createmafiadebug WASP_QUEEN random\` - Play as Wasp Queen with random mode\n• \`!createmafiadebug PIRATE_BEETLE NoAI\` - Play as Pirate Beetle, bots don't auto-act\n• \`!createmafiadebug random\` - Random role with random mode`);
                        }
                    }
                }
            }

            // Get all members in voice channel
            const voiceChannel = member.voice.channel;
            const members = Array.from(voiceChannel.members.values());
            const humanMembers = members.filter(m => !m.user.bot);

            // Check if any players are already in a game
            const playersInGame = humanMembers.filter(m => getGameByPlayer(m.user.id));
            if (playersInGame.length > 0) {
                return message.reply(`Some players are already in an active game: ${playersInGame.map(m => m.displayName).join(', ')}`);
            }

            // Validate that we don't have more specified roles than real players
            if (specifiedRoles.length > humanMembers.length) {
                return message.reply(`❌ You specified ${specifiedRoles.length} roles but there are only ${humanMembers.length} real players in the voice channel!\n\nRoles will be assigned to players in VC order (you first, then others).`);
            }

            // Create debug game with all VC members + bots
            const gameId = `mafia_debug_${Date.now()}`;

            // Get all real players from voice channel
            const realPlayers = humanMembers.map(m => ({
                id: m.user.id,
                username: m.user.username,
                displayName: m.displayName || m.user.username,
                alive: true,
                role: null
            }));

            // Create 12 fake bot players
            const fakePlayers = [
                { id: 'bot1', username: 'TestBot1', displayName: 'Test Bot 1', alive: true, role: null },
                { id: 'bot2', username: 'TestBot2', displayName: 'Test Bot 2', alive: true, role: null },
                { id: 'bot3', username: 'TestBot3', displayName: 'Test Bot 3', alive: true, role: null },
                { id: 'bot4', username: 'TestBot4', displayName: 'Test Bot 4', alive: true, role: null },
                { id: 'bot5', username: 'TestBot5', displayName: 'Test Bot 5', alive: true, role: null },
                { id: 'bot6', username: 'TestBot6', displayName: 'Test Bot 6', alive: true, role: null },
                { id: 'bot7', username: 'TestBot7', displayName: 'Test Bot 7', alive: true, role: null },
                { id: 'bot8', username: 'TestBot8', displayName: 'Test Bot 8', alive: true, role: null },
                { id: 'bot9', username: 'TestBot9', displayName: 'Test Bot 9', alive: true, role: null },
                { id: 'bot10', username: 'TestBot10', displayName: 'Test Bot 10', alive: true, role: null },
                { id: 'bot11', username: 'TestBot11', displayName: 'Test Bot 11', alive: true, role: null },
                { id: 'bot12', username: 'TestBot12', displayName: 'Test Bot 12', alive: true, role: null }
            ];

            const players = [...realPlayers, ...fakePlayers];

            // Assign roles
            if (specifiedRoles.length > 0) {
                // Assign specified roles to real players in order
                // First role goes to game creator, then other roles to other VC members in order
                for (let i = 0; i < specifiedRoles.length && i < realPlayers.length; i++) {
                    initializePlayerRole(realPlayers[i], specifiedRoles[i]);
                }

                // Get remaining players who need random roles
                const remainingPlayers = players.filter((p, index) => {
                    // Skip real players who got assigned a specified role
                    if (realPlayers.includes(p) && realPlayers.indexOf(p) < specifiedRoles.length) {
                        return false;
                    }
                    return true;
                });

                // Assign random roles to remaining players (both real and bots) from distribution
                const roleDistribution = getRoleDistribution(players.length, randomMode, true); // Pass true for debug mode
                const shuffledRoles = shuffleArray(roleDistribution);

                // Assign the remaining shuffled roles to players who don't have roles yet
                for (let i = 0; i < remainingPlayers.length; i++) {
                    initializePlayerRole(remainingPlayers[i], shuffledRoles[i]);
                }
            } else {
                // All players get random roles (original behavior)
                const roleDistribution = getRoleDistribution(players.length, randomMode, true); // Pass true for debug mode
                const shuffledRoles = shuffleArray(roleDistribution);

                for (let i = 0; i < players.length; i++) {
                    initializePlayerRole(players[i], shuffledRoles[i]);
                }
            }

            // Assign Executioner targets
            players.filter(p => p.role === 'BOUNTY_HUNTER').forEach(exe => {
                const validTargets = players.filter(p =>
                    p.id !== exe.id && ROLES[p.role].team === 'bee'
                );
                if (validTargets.length > 0) {
                    exe.target = validTargets[Math.floor(Math.random() * validTargets.length)].id;
                }
            });

            // Create game using game state module
            const game = createGame(gameId, players, message.author.id, MAFIA_TEXT_CHANNEL_ID);
            game.debugMode = true; // Set debug flag
            game.noAI = noAI; // Set NoAI flag to disable bot auto-actions

            // Send initial message
            const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
            game.cachedChannel = channel;

            // Build assigned roles text for embed
            let assignedRolesText = '';
            if (specifiedRoles.length > 0) {
                assignedRolesText = '\n\n🎯 **Assigned Roles:**';
                for (let i = 0; i < specifiedRoles.length && i < realPlayers.length; i++) {
                    const player = realPlayers[i];
                    const roleName = specifiedRoles[i];
                    assignedRolesText += `\n• <@${player.id}>: ${ROLES[roleName].name} ${ROLES[roleName].emoji}`;
                }
            }

            const setupEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(`🐝 Bee Mafia Game Starting! ${randomMode ? '🎲' : ''}${specifiedRoles.length > 0 ? '🎯' : ''}🐝 [DEBUG MODE]`)
                .setDescription(`**Debug game** created with **${players.length} players** (${realPlayers.length} real, ${fakePlayers.length} bots)!${randomMode ? '\n\n🎲 **RANDOM MODE** - All roles (except Wasp Queen) are completely randomized!' : ''}${assignedRolesText}\n\nRoles are being assigned... Check your DMs!\n\n**Debug Commands:**\n\`!mafiadebugskip\` - Skip to next phase\n\`!mafiadebugend\` - End the game`)
                .addFields({
                    name: 'Players',
                    value: players.map(p => `• ${p.displayName}`).join('\n'),
                    inline: false
                })
                .setTimestamp();

            const gameMessage = await channel.send({ embeds: [setupEmbed] });
            game.messageId = gameMessage.id;

            // Send role DMs to all real players
            const failedDMs = [];
            for (const player of realPlayers) {
                try {
                    const user = await client.users.fetch(player.id);
                    const role = ROLES[player.role];

                    const roleEmbed = new EmbedBuilder()
                        .setColor(role.team === 'bee' ? '#FFD700' : role.team === 'wasp' ? '#8B0000' : '#808080')
                        .setTitle(`${role.emoji} Your Role: ${role.name}`)
                        .setDescription(role.description)
                        .addFields(
                            { name: 'Abilities', value: role.abilities.join('\n'), inline: false },
                            { name: 'Win Condition', value: role.winCondition, inline: false }
                        )
                        .setFooter({ text: 'The game will begin shortly!' })
                        .setTimestamp();

                    await user.send({ embeds: [roleEmbed] });
                } catch (error) {
                    console.error(`Could not send debug role DM to ${player.displayName}:`, error);
                    failedDMs.push(player.id);
                }
            }

            // Notify about failed DMs
            if (failedDMs.length > 0) {
                await channel.send(`⚠️ ${failedDMs.map(id => `<@${id}>`).join(', ')} Could not send you a DM! Please enable DMs from server members.`);
            }

            // Show all bot roles in the channel for debugging
            const botRoles = fakePlayers.map(p => `• ${p.displayName}: ${ROLES[p.role].name} ${ROLES[p.role].emoji}`).join('\n');
            await channel.send(`**Bot Roles (for debugging):**\n${botRoles}`);

            // Wait then start night phase
            const setupDelay = getPhaseDuration(game, 'setup');
            await channel.send(`The night phase will begin in ${setupDelay / 1000} seconds...`);

            setTimeout(async () => {
                await startNightPhase(game, client);
            }, setupDelay);
        }

        // Handle !mafiadebugskip command
        if (command === '!mafiadebugskip') {
            const game = getGameByPlayer(message.author.id);
            if (!game) {
                return message.reply('You are not in an active game!');
            }
            if (!game.debugMode) {
                return message.reply('This command only works in debug mode!');
            }
            if (game.organizerId !== message.author.id) {
                return message.reply('Only the game organizer can skip phases!');
            }

            // Clear existing timers
            if (game.phaseTimer) {
                clearTimeout(game.phaseTimer);
            }
            if (game.warningTimer) {
                clearTimeout(game.warningTimer);
            }

            // Notify all players via DM
            const skipEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⏭️ Debug: Skipping Phase')
                .setDescription('The organizer has skipped to the next phase.')
                .setTimestamp();
            await sendToEveryoneInGame(game, client, skipEmbed);

            // Trigger phase transition
            if (game.phase === 'night') {
                await endNightPhase(game, client);
            } else if (game.phase === 'day') {
                await startVotingPhase(game, client);
            } else if (game.phase === 'voting') {
                await endVotingPhase(game, client);
            }
        }

        // Handle !mafiadebugend command
        if (command === '!mafiadebugend') {
            const game = getGameByPlayer(message.author.id);
            if (!game) {
                return message.reply('You are not in an active game!');
            }
            if (!game.debugMode) {
                return message.reply('This command only works in debug mode!');
            }
            if (game.organizerId !== message.author.id) {
                return message.reply('Only the game organizer can end the game!');
            }

            // Notify all players via DM
            const endEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛑 Game Ended')
                .setDescription('The debug game was ended by the organizer.')
                .setTimestamp();
            await sendToEveryoneInGame(game, client, endEmbed);

            // Unmute and unlock
            await muteVoiceAndLockText(game, client, false);

            // Remove mute/deafen from special roles
            try {
                const voiceChannel = await client.channels.fetch(MAFIA_VC_ID);
                if (voiceChannel && voiceChannel.members) {
                    for (const player of game.players) {
                        const member = voiceChannel.members.get(player.id);
                        if (member) {
                            if (player.role === 'KELLER_BEE') {
                                await member.voice.setMute(false, 'Game ended');
                            }
                            if (player.role === 'DEAF_BEE') {
                                await member.voice.setDeaf(false, 'Game ended');
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error removing mute/deafen in debug end:', error);
            }

            // Clean up
            deleteGame(game.id);
        }

        // Handle !mafiaroles command
        if (command === '!mafiaroles' || command === '!roles') {
            const filter = args[1]?.toLowerCase();

            // Validate filter
            if (filter && !['bee', 'wasp', 'neutral', 'all'].includes(filter)) {
                return message.reply('Invalid filter! Use: `!mafiaroles [bee|wasp|neutral|all]`');
            }

            const showBee = !filter || filter === 'bee' || filter === 'all';
            const showWasp = !filter || filter === 'wasp' || filter === 'all';
            const showNeutral = !filter || filter === 'neutral' || filter === 'all';

            // BEE ROLES EMBED
            if (showBee) {
                const beeRoles = Object.entries(ROLES).filter(([key, role]) => role.team === 'bee');
                const beeEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🐝 BEE ROLES (Town)')
                    .setDescription('**Win Condition:** Eliminate all Wasps and harmful Neutrals\n\n🌙 = Has night action | 🛡️ = Has defense')
                    .setTimestamp();

                beeRoles.forEach(([key, role]) => {
                    const nightActionText = role.nightAction ? ' 🌙' : '';
                    const defenseText = role.defense > 0 ? ' 🛡️' : '';

                    // Create a more detailed description
                    let description = role.description.split('!')[1].trim(); // Get description after "You are a..."

                    // Add key abilities (limit to 3 most important)
                    const keyAbilities = role.abilities.slice(0, 3).map(ability => `• ${ability}`).join('\n');

                    beeEmbed.addFields({
                        name: `${role.emoji} ${role.name}${nightActionText}${defenseText}`,
                        value: `${description}\n\n**Key Abilities:**\n${keyAbilities}`,
                        inline: false
                    });
                });

                await message.reply({ embeds: [beeEmbed] });
            }

            // WASP ROLES EMBED
            if (showWasp) {
                const waspRoles = Object.entries(ROLES).filter(([key, role]) => role.team === 'wasp');
                const waspEmbed = new EmbedBuilder()
                    .setColor('#8B0000')
                    .setTitle('🐝 WASP ROLES (Mafia)')
                    .setDescription('**Win Condition:** Equal or outnumber all other players\n\n🌙 = Has night action | 🛡️ = Has defense | 💬 = Can communicate with Wasps')
                    .setTimestamp();

                waspRoles.forEach(([key, role]) => {
                    const nightActionText = role.nightAction ? ' 🌙' : '';
                    const defenseText = role.defense > 0 ? ' 🛡️' : '';

                    // Create a more detailed description
                    let description = role.description.split('!')[1].trim();

                    // Add key abilities (limit to 3 most important)
                    const keyAbilities = role.abilities.slice(0, 3).map(ability => `• ${ability}`).join('\n');

                    waspEmbed.addFields({
                        name: `${role.emoji} ${role.name}${nightActionText}${defenseText}`,
                        value: `${description}\n\n**Key Abilities:**\n${keyAbilities}`,
                        inline: false
                    });
                });

                await message.reply({ embeds: [waspEmbed] });
            }

            // NEUTRAL ROLES EMBED
            if (showNeutral) {
                const neutralRoles = Object.entries(ROLES).filter(([key, role]) => role.team === 'neutral');

                // Group by subteam
                const killingRoles = neutralRoles.filter(([, role]) => role.subteam === 'killing');
                const evilRoles = neutralRoles.filter(([, role]) => role.subteam === 'evil');
                const benignRoles = neutralRoles.filter(([, role]) => role.subteam === 'benign');
                const chaosRoles = neutralRoles.filter(([, role]) => role.subteam === 'chaos');

                const neutralEmbed = new EmbedBuilder()
                    .setColor('#808080')
                    .setTitle('🦋 NEUTRAL ROLES')
                    .setDescription('Each neutral role has unique win conditions!\n\n🌙 = Has night action | 🛡️ = Has defense')
                    .setTimestamp();

                // Neutral Killing
                if (killingRoles.length > 0) {
                    const killingDesc = killingRoles.map(([, role]) => {
                        const nightActionText = role.nightAction ? ' 🌙' : '';
                        const defenseText = role.defense > 0 ? ' 🛡️' : '';
                        const description = role.description.split('!')[1].trim();
                        return `${role.emoji} **${role.name}${nightActionText}${defenseText}**\n${description}\n**Win:** ${role.winCondition}`;
                    }).join('\n\n');

                    neutralEmbed.addFields({
                        name: '💀 Neutral Killing - Kill everyone!',
                        value: killingDesc,
                        inline: false
                    });
                }

                // Neutral Evil
                if (evilRoles.length > 0) {
                    const evilDesc = evilRoles.map(([, role]) => {
                        const nightActionText = role.nightAction ? ' 🌙' : '';
                        const defenseText = role.defense > 0 ? ' 🛡️' : '';
                        const description = role.description.split('!')[1].trim();
                        return `${role.emoji} **${role.name}${nightActionText}${defenseText}**\n${description}\n**Win:** ${role.winCondition}`;
                    }).join('\n\n');

                    neutralEmbed.addFields({
                        name: '😈 Neutral Evil - Chaos and deception',
                        value: evilDesc,
                        inline: false
                    });
                }

                // Neutral Benign
                if (benignRoles.length > 0) {
                    const benignDesc = benignRoles.map(([, role]) => {
                        const nightActionText = role.nightAction ? ' 🌙' : '';
                        const defenseText = role.defense > 0 ? ' 🛡️' : '';
                        const description = role.description.split('!')[1].trim();
                        return `${role.emoji} **${role.name}${nightActionText}${defenseText}**\n${description}\n**Win:** ${role.winCondition}`;
                    }).join('\n\n');

                    neutralEmbed.addFields({
                        name: '🕊️ Neutral Benign - Just survive',
                        value: benignDesc,
                        inline: false
                    });
                }

                // Neutral Chaos
                if (chaosRoles.length > 0) {
                    const chaosDesc = chaosRoles.map(([, role]) => {
                        const nightActionText = role.nightAction ? ' 🌙' : '';
                        const defenseText = role.defense > 0 ? ' 🛡️' : '';
                        const description = role.description.split('!')[1].trim();
                        return `${role.emoji} **${role.name}${nightActionText}${defenseText}**\n${description}\n**Win:** ${role.winCondition}`;
                    }).join('\n\n');

                    neutralEmbed.addFields({
                        name: '🎲 Neutral Chaos - Unique objectives',
                        value: chaosDesc,
                        inline: false
                    });
                }

                await message.reply({ embeds: [neutralEmbed] });
            }

            // Footer message
            if (!filter || filter === 'all') {
                await message.channel.send('💡 **Tip:** Use `!mafiaroles [bee|wasp|neutral]` to view specific factions\n\n**Role Categories:**\n🐝 **Bees** - Town roles that investigate, protect, and eliminate threats\n🐝 **Wasps** - Mafia roles that work together to eliminate others\n💀 **Neutral Killing** - Solo killers who must eliminate everyone\n😈 **Neutral Evil** - Chaos roles with unique objectives\n🕊️ **Neutral Benign** - Peaceful roles that just want to survive\n🎲 **Neutral Chaos** - Wild cards with unpredictable goals');
            }
        }

        // Handle !reveal command (Queen Bee during day phase)
        if (command === '!reveal') {
            const game = getGameByPlayer(message.author.id);
            if (!game) {
                return message.reply('You are not in an active game!');
            }

            const player = game.players.find(p => p.id === message.author.id);
            if (!player || !player.alive) {
                return message.reply('You must be alive to use this command!');
            }

            if (player.role !== 'QUEEN_BEE') {
                return message.reply('Only the Queen Bee can reveal!');
            }

            if (game.phase !== 'day' && game.phase !== 'voting') {
                return message.reply('You can only reveal during the day or voting phase!');
            }

            if (player.hasRevealed) {
                return message.reply('You have already revealed yourself!');
            }

            // Mark as revealed
            player.hasRevealed = true;

            // Announce to all players via DM
            const revealEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('👑 ROYAL REVEAL! 👑')
                .setDescription(`**${player.displayName}** has revealed themselves as the **Queen Bee**!\n\nThey now have **3 extra votes** during voting!`)
                .setTimestamp();

            await sendToEveryoneInGame(game, client, revealEmbed);
            await message.reply('You have revealed yourself as the Queen Bee! You now have 3 extra votes.');
        }

        // Handle DMs for night actions and haunt selection
        if (message.channel.type === 1) { // DM channel
            const game = getGameByPlayer(message.author.id);
            if (!game) return;

            const player = game.players.find(p => p.id === message.author.id);

            // Handle Mute Bee message interception in DMs (day phase messages)
            if (player && (player.role === 'MUTE_BEE' || player.role === 'KELLER_BEE') &&
                (game.phase === 'day' || game.phase === 'voting') &&
                !message.content.startsWith('!') && player.alive) {

                // Store original message
                const originalMessage = message.content;

                // Translate to emojis using OpenAI
                const emojiMessage = await translateToEmojis(originalMessage, message.author.username);

                if (emojiMessage) {
                    // Send emoji translation to all alive players via DM
                    const alivePlayers = game.players.filter(p => p.alive && p.id !== message.author.id);
                    for (const alivePlayer of alivePlayers) {
                        try {
                            const user = await client.users.fetch(alivePlayer.id);

                            // Deaf Bees get the translation
                            if (alivePlayer.role === 'DEAF_BEE') {
                                const translationEmbed = new EmbedBuilder()
                                    .setColor('#9B59B6')
                                    .setAuthor({
                                        name: `${player.displayName} (Mute Bee) - Translation`,
                                        iconURL: message.author.displayAvatarURL()
                                    })
                                    .setDescription(`**Emojis:** ${emojiMessage}\n\n**Original Message:** ${originalMessage}`)
                                    .setFooter({ text: '🦻 Only you can read this translation as a Deaf Bee' })
                                    .setTimestamp();
                                await user.send({ embeds: [translationEmbed] });
                            } else {
                                // Everyone else just gets emojis
                                await user.send(`💬 **${player.displayName}:** ${emojiMessage}`);
                            }
                        } catch (error) {
                            console.error(`Could not relay Mute Bee message to ${alivePlayer.displayName}:`, error);
                        }
                    }
                }
                return;
            }

            // Check if this is a haunt selection
            if (game.pendingHaunt && game.pendingHaunt.jesterId === message.author.id) {
                const choice = parseInt(message.content.trim());
                const validTargets = game.pendingHaunt.validTargets
                    .map(id => game.players.find(p => p.id === id))
                    .filter(p => p);

                if (choice >= 1 && choice <= validTargets.length) {
                    const target = validTargets[choice - 1];
                    target.alive = false;

                    // Send death notification to haunted player
                    await sendDeathNotification(game, client, {
                        victimId: target.id,
                        killerId: message.author.id,
                        attackType: 'jester_haunt'
                    });

                    await message.reply(`You haunted **${target.displayName}**! 👻`);

                    // Announce haunt to all players via DM
                    const hauntResultEmbed = new EmbedBuilder()
                        .setColor('#FF1493')
                        .setTitle('👻 Haunted!')
                        .setDescription(`**${game.players.find(p => p.id === message.author.id).displayName}** haunted **${target.displayName}** from beyond the grave! 💀`)
                        .setTimestamp();
                    await sendToEveryoneInGame(game, client, hauntResultEmbed);

                    game.pendingHaunt = null;

                    // Check win condition after haunt
                    if (!checkWinCondition(game, client)) {
                        await startNightPhase(game, client);
                    }
                } else {
                    await message.reply(`Invalid choice! Please send a number between 1 and ${validTargets.length}.`);
                }
                return;
            }

            // Check for active seance communication (during night phase)
            if (game.phase === 'night' && game.activeSeances && game.activeSeances.length > 0) {
                const seance = game.activeSeances.find(s =>
                    s.mediumId === message.author.id || s.deadId === message.author.id
                );

                // If in an active seance and message is not a number, treat as seance message
                if (seance && isNaN(message.content.trim())) {
                    const isMedium = seance.mediumId === message.author.id;
                    const targetId = isMedium ? seance.deadId : seance.mediumId;
                    const senderName = isMedium ? seance.mediumName : seance.deadName;

                    try {
                        const targetUser = await client.users.fetch(targetId);
                        const prefix = isMedium ? '👻 **From Medium:**' : '💀 **From the Dead:**';
                        await targetUser.send(`${prefix} ${message.content}`);
                    } catch (error) {
                        console.error('Could not relay seance message:', error);
                    }
                    return;
                }
            }

            // Handle day discussion and Marshal protection
            if (game.phase === 'day' || game.phase === 'voting') {
                const player = game.players.find(p => p.id === message.author.id);
                if (!player || !player.alive) {
                    await message.reply('❌ Only alive players can send messages during the day phase!');
                    return;
                }

                // Check if player is blackmailed
                if (game.blackmailedPlayers && game.blackmailedPlayers.has(player.id)) {
                    await message.reply('🤐 You have been blackmailed! You cannot speak today.');
                    return;
                }

                // Check if Marshal Bee trying to protect someone (day phase only)
                if (game.phase === 'day' && player.role === 'MARSHAL_BEE') {
                    const choice = parseInt(message.content.trim());
                    if (!isNaN(choice)) {
                        const alivePlayers = game.players.filter(p => p.alive);
                        if (choice >= 1 && choice <= alivePlayers.length) {
                            const target = alivePlayers[choice - 1];
                            player.marshalProtectedToday = target.id;
                            await message.reply(`🎖️ You are protecting **${target.displayName}** from being voted out today!`);
                            return;
                        }
                    }
                }

                // Check if Judge trying to force revote (voting phase only)
                if (game.phase === 'voting' && player.role === 'JUDGE' && message.content.trim().toLowerCase() === 'revote') {
                    if (player.hasUsedRevote) {
                        await message.reply('❌ You have already forced a revote this game!');
                        return;
                    }

                    player.hasUsedRevote = true;
                    game.votes = {}; // Clear all votes

                    // Announce revote to all players
                    const revoteEmbed = new EmbedBuilder()
                        .setColor('#FFD700')
                        .setTitle('⚖️ Judge Has Forced a Revote!')
                        .setDescription('All votes have been cleared! Everyone must vote again.')
                        .setTimestamp();
                    await sendToEveryoneInGame(game, client, revoteEmbed);

                    await message.reply('⚖️ You have forced a revote! All votes have been cleared.');
                    return;
                }

                // Relay message to all other players (alive and dead) during day phase
                if (game.phase === 'day') {
                    const otherPlayers = game.players.filter(p => p.id !== message.author.id);
                    for (const otherPlayer of otherPlayers) {
                        try {
                            const user = await client.users.fetch(otherPlayer.id);
                            const prefix = otherPlayer.alive ? '💬' : '👻';
                            await user.send(`${prefix} **${player.displayName}:** ${message.content}`);
                        } catch (error) {
                            console.error(`Could not relay day message to ${otherPlayer.displayName}:`, error);
                        }
                    }
                }
                return;
            }

            // Regular night actions
            if (game.phase !== 'night') return;
            await processNightAction(message.author.id, message, game, client);
        }

        // Handle Mute Bee (Keller Bee) message interception
        // Check if user is in an active mafia game and is a Mute Bee
        const kellerGame = getGameByPlayer(message.author.id);
        if (kellerGame && message.channel.id === MAFIA_TEXT_CHANNEL_ID) {
            const kellerPlayer = kellerGame.players.find(p => p.id === message.author.id);
            // Check for both MUTE_BEE and KELLER_BEE (alias)
            if (kellerPlayer && (kellerPlayer.role === 'MUTE_BEE' || kellerPlayer.role === 'KELLER_BEE') && !message.content.startsWith('!')) {
                // Store original message before deletion
                const originalMessage = message.content;

                // Delete the original message
                try {
                    await message.delete();
                } catch (error) {
                    console.error('Could not delete Mute Bee message:', error);
                }

                // Translate to emojis using OpenAI
                const emojiMessage = await translateToEmojis(originalMessage, message.author.username);

                if (emojiMessage) {
                    // Send emoji translation to channel
                    const kellerEmbed = new EmbedBuilder()
                        .setColor('#9B59B6')
                        .setAuthor({
                            name: `${kellerPlayer.displayName} (Mute Bee)`,
                            iconURL: message.author.displayAvatarURL()
                        })
                        .setDescription(emojiMessage)
                        .setFooter({ text: '🤐 Translated to emojis' })
                        .setTimestamp();

                    await message.channel.send({ embeds: [kellerEmbed] });

                    // Send original message to all Deaf Bee players via DM
                    const deafBeePlayers = kellerGame.players.filter(p => p.role === 'DEAF_BEE' && p.alive);
                    for (const deafBee of deafBeePlayers) {
                        try {
                            const deafBeeUser = await client.users.fetch(deafBee.id);
                            const translationEmbed = new EmbedBuilder()
                                .setColor('#9B59B6')
                                .setAuthor({
                                    name: `${kellerPlayer.displayName} (Mute Bee) - Translation`,
                                    iconURL: message.author.displayAvatarURL()
                                })
                                .setDescription(`**Emojis:** ${emojiMessage}\n\n**Original Message:** ${originalMessage}`)
                                .setFooter({ text: '🦻 Only you can read this translation as a Deaf Bee' })
                                .setTimestamp();

                            await deafBeeUser.send({ embeds: [translationEmbed] });
                        } catch (error) {
                            console.error(`Could not send translation to Deaf Bee ${deafBee.displayName}:`, error);
                        }
                    }
                }
            }
        }
    });

    // Handle button interactions
    client.on('interactionCreate', async (interaction) => {
        // Handle modal submissions for time configuration
        if (interaction.isModalSubmit() && interaction.customId.startsWith('mafia_time_modal_')) {
            const userId = interaction.customId.replace('mafia_time_modal_', '');

            if (!pendingGameConfigs.has(userId)) {
                return interaction.reply({
                    content: '❌ Game configuration expired or not found.',
                    ephemeral: true
                });
            }

            // Parse and validate time inputs
            try {
                const setupTime = parseInt(interaction.fields.getTextInputValue('setup_time'));
                const nightTime = parseInt(interaction.fields.getTextInputValue('night_time'));
                const dayTime = parseInt(interaction.fields.getTextInputValue('day_time'));
                const votingTime = parseInt(interaction.fields.getTextInputValue('voting_time'));

                // Validate times (must be positive numbers between 5 and 600 seconds)
                if ([setupTime, nightTime, dayTime, votingTime].some(t => isNaN(t) || t < 5 || t > 600)) {
                    return interaction.reply({
                        content: '❌ Invalid time values! All times must be between 5 and 600 seconds.',
                        ephemeral: true
                    });
                }

                // Get pending config and add custom durations
                const config = pendingGameConfigs.get(userId);
                config.customDurations = {
                    setup: setupTime,
                    night: nightTime,
                    day: dayTime,
                    voting: votingTime
                };

                // Remove from pending
                pendingGameConfigs.delete(userId);

                // Start the game
                await interaction.reply({
                    content: `✅ Custom times configured! Starting game...`,
                    ephemeral: true
                });

                await startMafiaGame(client, config);

            } catch (error) {
                console.error('Error processing time configuration:', error);
                return interaction.reply({
                    content: '❌ Error processing your configuration. Please try again.',
                    ephemeral: true
                });
            }
            return;
        }

        // Handle time configuration buttons
        if (interaction.isButton() && interaction.customId.startsWith('mafia_quickstart_')) {
            const userId = interaction.customId.replace('mafia_quickstart_', '');

            if (interaction.user.id !== userId) {
                return interaction.reply({
                    content: '❌ Only the game organizer can configure the game!',
                    ephemeral: true
                });
            }

            if (!pendingGameConfigs.has(userId)) {
                return interaction.reply({
                    content: '❌ Game configuration expired or not found.',
                    ephemeral: true
                });
            }

            const config = pendingGameConfigs.get(userId);
            pendingGameConfigs.delete(userId);

            await interaction.reply({
                content: `✅ Starting game with default times!`,
                ephemeral: true
            });

            await interaction.message.edit({ components: [] }); // Disable buttons
            await startMafiaGame(client, config);
            return;
        }

        if (interaction.isButton() && interaction.customId.startsWith('mafia_customize_')) {
            const userId = interaction.customId.replace('mafia_customize_', '');

            if (interaction.user.id !== userId) {
                return interaction.reply({
                    content: '❌ Only the game organizer can configure the game!',
                    ephemeral: true
                });
            }

            if (!pendingGameConfigs.has(userId)) {
                return interaction.reply({
                    content: '❌ Game configuration expired or not found.',
                    ephemeral: true
                });
            }

            // Show modal for time configuration
            const modal = new ModalBuilder()
                .setCustomId(`mafia_time_modal_${userId}`)
                .setTitle('Configure Game Time Limits');

            const setupInput = new TextInputBuilder()
                .setCustomId('setup_time')
                .setLabel('Setup Phase Duration (seconds)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Default: 30')
                .setValue('30')
                .setMinLength(1)
                .setMaxLength(3)
                .setRequired(true);

            const nightInput = new TextInputBuilder()
                .setCustomId('night_time')
                .setLabel('Night Phase Duration (seconds)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Default: 60')
                .setValue('60')
                .setMinLength(1)
                .setMaxLength(3)
                .setRequired(true);

            const dayInput = new TextInputBuilder()
                .setCustomId('day_time')
                .setLabel('Day Phase Duration (seconds)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Default: 180')
                .setValue('180')
                .setMinLength(1)
                .setMaxLength(3)
                .setRequired(true);

            const votingInput = new TextInputBuilder()
                .setCustomId('voting_time')
                .setLabel('Voting Phase Duration (seconds)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Default: 120')
                .setValue('120')
                .setMinLength(1)
                .setMaxLength(3)
                .setRequired(true);

            const row1 = new ActionRowBuilder().addComponents(setupInput);
            const row2 = new ActionRowBuilder().addComponents(nightInput);
            const row3 = new ActionRowBuilder().addComponents(dayInput);
            const row4 = new ActionRowBuilder().addComponents(votingInput);

            modal.addComponents(row1, row2, row3, row4);

            await interaction.showModal(modal);
            return;
        }

        if (!interaction.isButton()) return;

        // Parse customId correctly - gameId contains underscores (e.g., mafia_1234567890)
        const parts = interaction.customId.split('_');
        const action = parts[0]; // e.g., 'mafiavote'

        let gameId, targetId;
        if (action === 'mafiavote') {
            // For mafiavote buttons: mafiavote_mafia_timestamp_targetId
            // targetId is always the last part, gameId is everything in between
            targetId = parts[parts.length - 1];
            gameId = parts.slice(1, -1).join('_');
        }

        if (action === 'mafiavote') {
            const game = getGame(gameId);

            if (!game) {
                return interaction.reply({
                    content: 'This game is no longer active.',
                    ephemeral: true
                });
            }

            if (game.phase !== 'voting') {
                return interaction.reply({
                    content: 'It is not voting time!',
                    ephemeral: true
                });
            }

            const player = game.players.find(p => p.id === interaction.user.id);
            if (!player) {
                return interaction.reply({
                    content: 'You are not in this game!',
                    ephemeral: true
                });
            }

            if (!player.alive) {
                return interaction.reply({
                    content: 'Dead players cannot vote!',
                    ephemeral: true
                });
            }

            // Check if player is changing their vote
            const previousVote = game.votes[interaction.user.id];
            const isChangingVote = previousVote !== undefined;

            // Record vote
            game.votes[interaction.user.id] = targetId;
            game.lastActivityTime = Date.now();

            if (targetId === 'skip') {
                await interaction.reply({
                    content: isChangingVote ? 'You changed your vote to skip elimination.' : 'You voted to skip elimination.',
                    ephemeral: true
                });
            } else {
                const target = game.players.find(p => p.id === targetId);
                await interaction.reply({
                    content: isChangingVote ? `You changed your vote to **${target.displayName}**.` : `You voted for **${target.displayName}**.`,
                    ephemeral: true
                });
            }

            // Update display
            await updateGameDisplay(game, client);

            // Check if all alive players have voted
            const alivePlayers = game.players.filter(p => p.alive);
            const votedPlayers = Object.keys(game.votes).length;

            if (votedPlayers === alivePlayers.length) {
                // Everyone voted, end phase early
                clearTimeout(game.phaseTimer);

                // Announce early completion to all players via DM
                const earlyEndEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🗳️ All Votes Received!')
                    .setDescription('Everyone has voted! Proceeding to results...')
                    .setTimestamp();
                await sendToEveryoneInGame(game, client, earlyEndEmbed);

                await endVotingPhase(game, client);
            }
        }
    });
};
