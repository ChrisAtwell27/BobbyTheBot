const { EmbedBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const { ROLES } = require('../roles/mafiaRoles');
const { createGameEmbed } = require('../ui/embeds');
const { createVotingButtons } = require('../ui/buttons');
const {
    sendRoleDMs,
    sendDeathNotification,
    sendToEveryoneInGame,
    updateGameDisplay,
    sendToAllPlayers
} = require('../ui/messaging');
const {
    processNightActions,
    processWaspSuccession
} = require('../game/mafiaActions');
const {
    createGame,
    deleteGame,
    getGame
} = require('../game/mafiaGameState');
const {
    getPlayerTeam,
    shuffleArray,
    checkWinConditions,
    getRoleDistribution,
    initializePlayerRole,
    determineWinners
} = require('../game/mafiaUtils');
const { getSetting } = require('../../utils/settingsManager');

// We'll inject actionHandler later to avoid circular dependency issues during module load
let actionHandler = null;

function setActionHandler(handler) {
    actionHandler = handler;
}

// Legacy fallback IDs (used if no settings configured)
const DEFAULT_MAFIA_TEXT_CHANNEL_ID = '1434636519380881508';
const DEFAULT_MAFIA_VC_ID = '1434636519380881509';

// Helper to get mafia channels from settings
async function getMafiaChannels(guildId) {
    const textChannel = await getSetting(guildId, 'channels.mafia_text', DEFAULT_MAFIA_TEXT_CHANNEL_ID);
    const voiceChannel = await getSetting(guildId, 'channels.mafia_voice', DEFAULT_MAFIA_VC_ID);
    return { textChannel, voiceChannel };
}

// Helper to check if a player is a mute variant
function isMutePlayer(player) {
    if (!player) return false;
    const role = ROLES[player.role];
    return role && role.isMuteBee === true;
}

// Get phase duration
function getPhaseDuration(game, phase) {
    if (game.customDurations && game.customDurations[phase]) {
        return game.customDurations[phase] * 1000;
    }

    const debugDurations = {
        setup: 10000,
        night: 30000,
        day: 30000,
        voting: 30000
    };

    const normalDurations = {
        setup: 30000,
        night: 60000,
        day: 180000,
        voting: 120000
    };

    return game.debugMode ? debugDurations[phase] : normalDurations[phase];
}

// Mute/unmute voice channel
async function muteVoiceAndLockText(game, client, shouldMute) {
    try {
        // Use dynamic VC ID from game state, or fall back to default
        const vcId = game.voiceChannelId || DEFAULT_MAFIA_VC_ID;
        const voiceChannel = await client.channels.fetch(vcId);

        if (shouldMute) {
            // NIGHT: Mute all members
            if (voiceChannel && voiceChannel.members) {
                for (const [memberId, member] of voiceChannel.members) {
                    try {
                        const player = game.players.find(p => p.id === memberId);
                        await member.voice.setMute(true, 'Night phase - discussion locked');

                        if (player && player.role === 'DEAF_BEE') {
                            await member.voice.setDeaf(true, 'Deaf Bee - cannot hear voice');
                        }
                    } catch (error) {
                        console.error(`Could not mute ${member.displayName}:`, error);
                    }
                }
            }
        } else {
            // DAY: Unmute alive members
            if (voiceChannel && voiceChannel.members) {
                for (const [memberId, member] of voiceChannel.members) {
                    try {
                        const player = game.players.find(p => p.id === memberId);
                        if (player && player.alive) {
                            if (isMutePlayer(player)) {
                                await member.voice.setMute(true, 'Mute Bee - cannot speak');
                            } else if (game.blackmailedPlayers && game.blackmailedPlayers.has(player.id)) {
                                await member.voice.setMute(true, 'Blackmailed - cannot speak in voice');
                            } else if (game.deceivedPlayers && game.deceivedPlayers.has(player.id)) {
                                await member.voice.setMute(true, 'Deceived - cannot speak in voice');
                            } else {
                                await member.voice.setMute(false, 'Day phase - discussion open');
                            }

                            if (player.role === 'DEAF_BEE') {
                                await member.voice.setDeaf(true, 'Deaf Bee - cannot hear voice');
                            }
                        } else {
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

// Start Mafia Game
async function startMafiaGame(client, config) {
    const { gameId, guildId, players, organizerId, randomMode, customDurations, revealRoles, preset, noAI, specifiedRoles, debugMode, tier = 'plus' } = config;

    // Get dynamic channel settings
    const { textChannel: mafiaTextChannelId, voiceChannel: mafiaVcId } = await getMafiaChannels(guildId);

    // Filter out invalid players
    const realPlayers = players.filter(p => !p.id.startsWith('bot'));
    const fakePlayers = players.filter(p => p.id.startsWith('bot'));

    // Assign roles
    if (specifiedRoles && specifiedRoles.length > 0) {
        // Use specified roles first
        for (let i = 0; i < specifiedRoles.length && i < realPlayers.length; i++) {
            initializePlayerRole(realPlayers[i], specifiedRoles[i]);
        }

        // Assign random roles to remaining players (including bots)
        const remainingPlayers = [...realPlayers.slice(specifiedRoles.length), ...fakePlayers];
        const roleDistribution = getRoleDistribution(remainingPlayers.length, randomMode, true, tier);
        const shuffledRoles = shuffleArray(roleDistribution);

        for (let i = 0; i < remainingPlayers.length; i++) {
            initializePlayerRole(remainingPlayers[i], shuffledRoles[i]);
        }
    } else {
        // All random
        const roleDistribution = getRoleDistribution(players.length, randomMode, true, tier);
        const shuffledRoles = shuffleArray(roleDistribution);

        for (let i = 0; i < players.length; i++) {
            initializePlayerRole(players[i], shuffledRoles[i]);
        }
    }

    // Assign Executioner targets
    players.filter(p => p.role === 'BOUNTY_HUNTER').forEach(exe => {
        const validTargets = players.filter(p => p.id !== exe.id && ROLES[p.role].team === 'bee');
        if (validTargets.length > 0) {
            exe.target = validTargets[Math.floor(Math.random() * validTargets.length)].id;
        }
    });

    // Create game state with guildId for settings lookup
    const game = createGame(gameId, players, organizerId, mafiaTextChannelId, guildId);
    game.debugMode = debugMode || false;
    game.noAI = noAI;
    game.revealRoles = revealRoles;
    game.voiceChannelId = mafiaVcId; // Store VC ID for voice muting
    game.tier = tier; // Store tier for role availability reference
    if (customDurations) game.customDurations = customDurations;

    // Send initial message
    const channel = await client.channels.fetch(mafiaTextChannelId);
    game.cachedChannel = channel;

    const setupEmbed = createGameEmbed(game); // Use the new embed creator
    // Note: The original code had a very specific setup embed. 
    // For now, we'll use the generic one but we might want to enhance it later to match the original's detail.
    
    const gameMessage = await channel.send({ embeds: [setupEmbed] });
    game.messageId = gameMessage.id;

    // Send role DMs
    await sendRoleDMs(game, client);

    // Wait then start night phase
    const setupDelay = getPhaseDuration(game, 'setup');
    await channel.send(`The night phase will begin in ${setupDelay / 1000} seconds...`);

    setTimeout(async () => {
        await startNightPhase(game, client);
    }, setupDelay);
}

// Start Night Phase
async function startNightPhase(game, client) {
    game.phase = 'night';
    const nightDuration = getPhaseDuration(game, 'night');
    game.phaseEndTime = Date.now() + nightDuration;
    game.nightActions = {};
    game.nightMessages = [];
    game.lastActivityTime = Date.now();
    game.nightNumber = (game.nightNumber || 0) + 1;

    // Phantom Moth return logic
    const phantomMoths = game.players.filter(p => p.role === 'PHANTOM_MOTH' && p.phantomInvisible && p.alive);
    for (const phantom of phantomMoths) {
        if (phantom.phantomReturnPhase && game.phase === 'night') {
            phantom.phantomInvisible = false;
            phantom.phantomReturnPhase = null;
            try {
                if (!phantom.id.startsWith('bot')) {
                    const user = await client.users.fetch(phantom.id);
                    await user.send('You have returned to the game!');
                }
            } catch (e) { console.error(e); }
        }
    }

    await muteVoiceAndLockText(game, client, true);
    await updateGameDisplay(game, client);

    // Send prompts via actionHandler
    if (actionHandler) {
        await actionHandler.sendNightActionPrompts(game, client);
    }

    // Set timer for day phase
    game.phaseTimer = setTimeout(async () => {
        await endNightPhase(game, client);
    }, nightDuration);
}

// End Night Phase
async function endNightPhase(game, client) {
    if (game.phase !== 'night') return;
    if (game.phaseTimer) clearTimeout(game.phaseTimer);

    // Process night actions
    const deaths = await processNightActions(game, client);

    // Send death notifications
    for (const death of deaths) {
        await sendDeathNotification(game, client, death);
    }

    // Check win conditions
    const winResult = checkWinConditions(game);
    if (winResult) {
        await endGame(game, client, winResult.type, winResult.winner);
        return;
    }

    // Start day phase
    await startDayPhase(game, client, deaths);
}

// Start Day Phase
async function startDayPhase(game, client, deaths) {
    game.phase = 'day';
    const dayDuration = getPhaseDuration(game, 'day');
    game.phaseEndTime = Date.now() + dayDuration;

    await muteVoiceAndLockText(game, client, false);
    await updateGameDisplay(game, client);

    // Send day announcement
    const dayEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('☀️ Day Discussion Phase')
        .setDescription(`Discuss amongst yourselves!\nDeaths: ${deaths.length > 0 ? deaths.length : 'None'}`)
        .setTimestamp();
    await sendToEveryoneInGame(game, client, dayEmbed);

    // Set timer for voting phase
    game.phaseTimer = setTimeout(async () => {
        await startVotingPhase(game, client);
    }, dayDuration);
}

// Start Voting Phase
async function startVotingPhase(game, client, durationOverride = null) {
    if (game.phase !== 'day' && !game.isRevote) return;

    game.phase = 'voting';
    const votingDuration = durationOverride ? durationOverride * 1000 : getPhaseDuration(game, 'voting');
    game.phaseEndTime = Date.now() + votingDuration;
    game.votes = {};

    await updateGameDisplay(game, client);

    // Send voting buttons
    const alivePlayers = game.players.filter(p => p.alive);
    const votingButtons = createVotingButtons(game.id, alivePlayers);
    
    for (const player of alivePlayers) {
        if (player.id.startsWith('bot')) continue;
        try {
            const user = await client.users.fetch(player.id);
            await user.send({ content: 'Vote now!', components: votingButtons });
        } catch (e) { console.error(e); }
    }

    // Bot voting logic would go here

    game.phaseTimer = setTimeout(async () => {
        await endVotingPhase(game, client);
    }, votingDuration);
}

// End Voting Phase
async function endVotingPhase(game, client) {
    if (game.phase !== 'voting') return;

    // Tally votes logic (simplified for now)
    const voteCounts = {};
    Object.values(game.votes).forEach(targetId => {
        if (targetId !== 'skip') {
            voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
        }
    });

    // Determine elimination...
    // For now, let's just say if someone has majority, they die.
    // This needs the full logic from the original file.
    
    // ... (Logic for elimination, Marshal Bee, etc.) ...
    
    // If someone died:
    // await sendDeathNotification(game, client, ...);
    
    // Check win conditions
    const winResult = checkWinConditions(game);
    if (winResult) {
        await endGame(game, client, winResult.type, winResult.winner);
        return;
    }

    // If no win, go to Dusk (or Night if Dusk not implemented yet)
    await startDuskPhase(game, client);
}

// Start Dusk Phase
async function startDuskPhase(game, client) {
    game.phase = 'dusk';
    game.duskActions = {}; // Track who has submitted their dusk action or skipped
    const duskDuration = getPhaseDuration(game, 'dusk') || 60000; // Default 60s if not set
    game.phaseEndTime = Date.now() + duskDuration;

    // Clear day phase data (blackmail/deceive effects that lasted through day)
    // We need to import clearDayData or implement it. It's in mafiaGameState.js usually.
    // For now, we'll assume it's handled or we can import it.
    // Actually, let's just clear it manually here if we don't want another import.
    if (game.blackmailedPlayers) game.blackmailedPlayers.clear();
    if (game.deceivedPlayers) game.deceivedPlayers.clear();
    if (game.framedPlayers) game.framedPlayers.clear(); // Framed resets at dusk/night start

    // Find all alive players with dusk actions
    const alivePlayers = game.players.filter(p => p.alive);
    const duskPlayers = alivePlayers.filter(p => {
        const role = ROLES[p.role];
        return role.duskAction;
    });

    // If no players have dusk actions, skip directly to night
    if (duskPlayers.length === 0) {
        await startNightPhase(game, client);
        return;
    }

    await updateGameDisplay(game, client);

    // Send dusk phase announcements
    const duskEmbed = new EmbedBuilder()
        .setColor('#4B0082')
        .setTitle('🌆 Dusk Falls')
        .setDescription('The sun sets... Those with special preparations may act now before night falls.\n\n⏰ **Waiting for players with dusk abilities to act...**')
        .setTimestamp();

    await sendToEveryoneInGame(game, client, duskEmbed);

    // Send dusk action prompts via actionHandler
    if (actionHandler && actionHandler.sendDuskActionPrompts) {
        await actionHandler.sendDuskActionPrompts(game, client, duskPlayers);
    }

    // Set timeout to auto-skip dusk phase
    game.duskTimer = setTimeout(async () => {
        if (game.phase !== 'dusk') return;

        console.log('⏰ Dusk phase timeout - auto-skipping remaining players');

        // Auto-skip any players who haven't acted
        duskPlayers.forEach(p => {
            if (!game.duskActions[p.id]) {
                game.duskActions[p.id] = { actionType: 'skip' };
            }
        });

        // Move to night phase
        await startNightPhase(game, client);
    }, duskDuration);
}

// Check if dusk phase is complete
async function checkDuskComplete(game, client) {
    if (game.phase !== 'dusk') return;

    const alivePlayers = game.players.filter(p => p.alive);
    const duskPlayers = alivePlayers.filter(p => {
        const role = ROLES[p.role];
        return role.duskAction;
    });

    // Check if all dusk players have acted
    const allActed = duskPlayers.every(p => game.duskActions[p.id]);

    if (allActed) {
        // Clear the timeout timer
        if (game.duskTimer) {
            clearTimeout(game.duskTimer);
            game.duskTimer = null;
        }

        // Everyone has acted, move to night
        await startNightPhase(game, client);
    }
}

// End Game
async function endGame(game, client, winType, specificWinner) {
    const winners = determineWinners(game, winType, specificWinner);
    
    const endEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏆 Game Over!')
        .setDescription(`Winners: ${winners.map(p => p.displayName).join(', ')}`)
        .setTimestamp();

    await sendToEveryoneInGame(game, client, endEmbed);
    await muteVoiceAndLockText(game, client, false);
    deleteGame(game.id);
}

// Check if night actions are complete
async function checkNightActionsComplete(game, client) {
    if (game.phase !== 'night') return;

    const alivePlayers = game.players.filter(p => p.alive);
    const playersWithActions = alivePlayers.filter(p => {
        const role = ROLES[p.role];
        return role.nightAction || p.convertedToCult;
    });

    const allActionsSubmitted = playersWithActions.every(p => game.nightActions[p.id] !== undefined);

    if (allActionsSubmitted && playersWithActions.length > 0) {
        await endNightPhase(game, client);
    }
}

module.exports = {
    setActionHandler,
    startMafiaGame,
    startNightPhase,
    endNightPhase,
    startDayPhase,
    startVotingPhase,
    endVotingPhase,
    startDuskPhase,
    endGame,
    checkNightActionsComplete,
    checkDuskComplete,
    getPhaseDuration
};
