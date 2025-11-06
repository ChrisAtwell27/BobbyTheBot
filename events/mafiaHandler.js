const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { updateBobbyBucks } = require('../database/helpers/economyHelpers');
const User = require('../database/models/User');
const { TARGET_GUILD_ID } = require('../config/guildConfig');
const { ROLES } = require('../mafia/roles/mafiaRoles');
const { createGame, getGame, getGameByPlayer, deleteGame, getAllGames, addVisit, getVisitors, clearNightData, clearVotes, updateActivity } = require('../mafia/game/mafiaGameState');
const { processNightActions } = require('../mafia/game/mafiaActions');
const { getRoleDistribution, shuffleArray, getTeamCounts, countVotes, determineWinners, checkWinConditions, initializePlayerRole } = require('../mafia/game/mafiaUtils');

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

// Debug mode constants (shorter timers for testing)
const DEBUG_SETUP_DELAY = 5000; // 5 seconds
const DEBUG_NIGHT_DURATION = 20000; // 20 seconds
const DEBUG_DAY_DISCUSSION_DURATION = 30000; // 30 seconds
const DEBUG_VOTING_DURATION = 20000; // 20 seconds

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

// Mute voice channel and lock/unlock text channel
async function muteVoiceAndLockText(game, client, shouldMute) {
    try {
        // Get the voice channel
        const voiceChannel = await client.channels.fetch(MAFIA_VC_ID);

        // Get the text channel
        if (!game.cachedChannel) {
            game.cachedChannel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
        }
        const textChannel = game.cachedChannel;

        if (shouldMute) {
            // NIGHT: Mute all members in voice channel and lock text channel

            // Mute all members currently in the voice channel
            if (voiceChannel && voiceChannel.members) {
                for (const [memberId, member] of voiceChannel.members) {
                    try {
                        await member.voice.setMute(true, 'Night phase - discussion locked');
                    } catch (error) {
                        console.error(`Could not mute ${member.displayName}:`, error);
                    }
                }
            }

            // Lock text channel (deny SEND_MESSAGES for @everyone)
            await textChannel.permissionOverwrites.edit(textChannel.guild.roles.everyone, {
                SendMessages: false
            });

        } else {
            // DAY: Unmute all members and unlock text channel

            // Unmute all members in voice channel
            if (voiceChannel && voiceChannel.members) {
                for (const [memberId, member] of voiceChannel.members) {
                    try {
                        await member.voice.setMute(false, 'Day phase - discussion open');
                    } catch (error) {
                        console.error(`Could not unmute ${member.displayName}:`, error);
                    }
                }
            }

            // Unlock text channel (allow SEND_MESSAGES for @everyone)
            await textChannel.permissionOverwrites.edit(textChannel.guild.roles.everyone, {
                SendMessages: true
            });
        }
    } catch (error) {
        console.error('Error toggling voice/text mute:', error);
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

    // Use cached channel
    if (!game.cachedChannel) {
        game.cachedChannel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
    }
    const channel = game.cachedChannel;

    // Mute voice channel and lock text channel
    await muteVoiceAndLockText(game, client, true);

    const nightEmbed = new EmbedBuilder()
        .setColor('#000080')
        .setTitle('🌙 Night Falls Over the Hive')
        .setDescription('The bees settle in for the night. Those with special abilities should check their DMs!\n\n🔇 Voice chat is now muted and text chat is locked.')
        .setTimestamp();

    await channel.send({ embeds: [nightEmbed] });

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

    // In debug mode, make bots automatically perform night actions after a short delay
    if (game.debugMode) {
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

        await message.reply('Message sent to your fellow Wasps! 🐝');
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

    // Announce results
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

    await channel.send({ embeds: [dawnEmbed] });

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

    // Unmute voice channel and unlock text channel
    await muteVoiceAndLockText(game, client, false);

    const dayEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('☀️ Day Discussion Phase')
        .setDescription(`Discuss amongst yourselves and try to figure out who the Wasps are!\n\n🔊 Voice and text chat are now open!\n\nVoting will begin in ${dayDuration / 1000} seconds.`)
        .setTimestamp();

    await channel.send({ embeds: [dayEmbed] });

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

    const votingEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🗳️ Voting Phase')
        .setDescription(`Vote for who you think is a Wasp! The player with the most votes will be eliminated.\n\n**Alive Players:** ${alivePlayers.length}\n**Time Remaining:** ${votingDuration / 1000} seconds`)
        .setTimestamp();

    // Create voting buttons
    const votingButtons = createVotingButtons(game.id, alivePlayers);

    // Send new voting message with buttons
    await channel.send({
        embeds: [votingEmbed],
        components: votingButtons
    });

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

    // Tally votes with Queen Bee bonus
    const voteCounts = {};
    Object.entries(game.votes).forEach(([voterId, targetId]) => {
        if (targetId !== 'skip') {
            const voter = game.players.find(p => p.id === voterId);
            // Check if voter is a revealed Queen Bee (gets 3 bonus votes for total of 4)
            const voteWeight = (voter && voter.role === 'QUEEN_BEE' && voter.hasRevealed) ? 4 : 1;
            voteCounts[targetId] = (voteCounts[targetId] || 0) + voteWeight;
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
                eliminatedPlayer.alive = false;
                // Send death notification
                await sendDeathNotification(game, client, {
                    victimId: eliminatedPlayer.id,
                    attackType: 'voted'
                });
            }
        }
    }

    // Announce results
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
    if (Object.keys(voteCounts).length > 0) {
        const voteBreakdown = Object.entries(voteCounts)
            .map(([targetId, count]) => {
                const player = game.players.find(p => p.id === targetId);
                return `• ${player?.displayName || 'Unknown'}: ${count} vote${count !== 1 ? 's' : ''}`;
            })
            .join('\n');

        resultsEmbed.addFields({
            name: 'Vote Breakdown',
            value: voteBreakdown,
            inline: false
        });
    }

    await channel.send({ embeds: [resultsEmbed] });

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

                        await channel.send(`👻 **${eliminatedPlayer.displayName}** haunted **${randomTarget.displayName}** from beyond the grave! 💀`);

                        game.pendingHaunt = null;

                        // Check win condition after haunt
                        if (!checkWinCondition(game, client)) {
                            await startNightPhase(game, client);
                        }
                    }
                }, 30000);

                // Announce Jester win
                await channel.send(`🤡 **${eliminatedPlayer.displayName}** was the Clown Beetle (Jester)! They win and will haunt one of their voters!`);

                // End game for Jester (they've won)
                endGame(game, client, 'jester', eliminatedPlayer);
                return;
            } catch (error) {
                console.error('Could not send haunt DM:', error);
                await channel.send(`🤡 **${eliminatedPlayer.displayName}** was the Clown Beetle (Jester)! They win, but could not be contacted to choose a haunt target.`);
                endGame(game, client, 'jester', eliminatedPlayer);
                return;
            }
        } else {
            // No guilty voters (shouldn't happen in normal gameplay)
            await channel.send(`🤡 **${eliminatedPlayer.displayName}** was the Clown Beetle (Jester)! They win!`);
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

    await channel.send({ embeds: [resultsEmbed] });

    // Unmute voice and unlock text channel before ending game
    await muteVoiceAndLockText(game, client, false);

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

            // Parse arguments for role and random mode
            let randomMode = false;
            let specifiedRole = null;

            // Check each argument
            for (let i = 1; i < args.length; i++) {
                const argUpper = args[i].toUpperCase();
                if (argUpper === 'RANDOM') {
                    randomMode = true;
                } else if (ROLES[argUpper]) {
                    specifiedRole = argUpper;
                } else {
                    // Invalid role name
                    const validRoles = Object.keys(ROLES).sort().join(', ');
                    return message.reply(`❌ Invalid role: **${args[i]}**\n\n**Valid roles:**\n${validRoles}\n\n**Usage:** \`!createmafiadebug [role] [random]\`\n**Examples:**\n• \`!createmafiadebug SCOUT_BEE\` - Play as Scout Bee\n• \`!createmafiadebug WASP_QUEEN random\` - Play as Wasp Queen with random mode\n• \`!createmafiadebug random\` - Random role with random mode`);
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

            // Create 5 fake bot players
            const fakePlayers = [
                { id: 'bot1', username: 'TestBot1', displayName: 'Test Bot 1', alive: true, role: null },
                { id: 'bot2', username: 'TestBot2', displayName: 'Test Bot 2', alive: true, role: null },
                { id: 'bot3', username: 'TestBot3', displayName: 'Test Bot 3', alive: true, role: null },
                { id: 'bot4', username: 'TestBot4', displayName: 'Test Bot 4', alive: true, role: null },
                { id: 'bot5', username: 'TestBot5', displayName: 'Test Bot 5', alive: true, role: null }
            ];

            const players = [...realPlayers, ...fakePlayers];

            // Assign roles
            if (specifiedRole) {
                // Assign specified role to the game creator (message author)
                const creator = realPlayers.find(p => p.id === message.author.id);
                if (creator) {
                    initializePlayerRole(creator, specifiedRole);
                }

                // Assign random roles to other players (both real and bots) from distribution
                const roleDistribution = getRoleDistribution(players.length, randomMode);
                const shuffledRoles = shuffleArray(roleDistribution);

                // Skip the first role for the creator, assign the rest to other players
                const otherPlayers = players.filter(p => p.id !== message.author.id);
                for (let i = 0; i < otherPlayers.length; i++) {
                    initializePlayerRole(otherPlayers[i], shuffledRoles[i]);
                }
            } else {
                // All players get random roles (original behavior)
                const roleDistribution = getRoleDistribution(players.length, randomMode);
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

            // Send initial message
            const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
            game.cachedChannel = channel;

            const setupEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(`🐝 Bee Mafia Game Starting! ${randomMode ? '🎲' : ''}${specifiedRole ? '🎯' : ''}🐝 [DEBUG MODE]`)
                .setDescription(`**Debug game** created with **${players.length} players** (${realPlayers.length} real, ${fakePlayers.length} bots)!${randomMode ? '\n\n🎲 **RANDOM MODE** - All roles (except Wasp Queen) are completely randomized!' : ''}${specifiedRole ? `\n\n🎯 **<@${message.author.id}> is playing as:** ${ROLES[specifiedRole].name} ${ROLES[specifiedRole].emoji}` : ''}\n\nRoles are being assigned... Check your DMs!\n\n**Debug Commands:**\n\`!mafiadebugskip\` - Skip to next phase\n\`!mafiadebugend\` - End the game`)
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

            const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
            await channel.send('⏭️ **Debug:** Skipping to next phase...');

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

            const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
            await channel.send('🛑 **Debug game ended by organizer.**');

            // Unmute and unlock
            await muteVoiceAndLockText(game, client, false);

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
                    .setDescription('Eliminate all Wasps and harmful Neutrals to win!')
                    .setTimestamp();

                beeRoles.forEach(([key, role]) => {
                    const nightActionText = role.nightAction ? ' 🌙' : '';
                    const abilities = role.abilities.slice(0, 2).join('\n• '); // First 2 abilities
                    beeEmbed.addFields({
                        name: `${role.emoji} ${role.name}${nightActionText}`,
                        value: `• ${abilities}`,
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
                    .setDescription('Equal or outnumber all other players to win!')
                    .setTimestamp();

                waspRoles.forEach(([key, role]) => {
                    const nightActionText = role.nightAction ? ' 🌙' : '';
                    const abilities = role.abilities.slice(0, 2).join('\n• '); // First 2 abilities
                    waspEmbed.addFields({
                        name: `${role.emoji} ${role.name}${nightActionText}`,
                        value: `• ${abilities}`,
                        inline: false
                    });
                });

                await message.reply({ embeds: [waspEmbed] });
            }

            // NEUTRAL ROLES EMBED
            if (showNeutral) {
                const neutralRoles = Object.entries(ROLES).filter(([key, role]) => role.team === 'neutral');

                // Group by subteam
                const killingRoles = neutralRoles.filter(([key, role]) => role.subteam === 'killing');
                const evilRoles = neutralRoles.filter(([key, role]) => role.subteam === 'evil');
                const benignRoles = neutralRoles.filter(([key, role]) => role.subteam === 'benign');

                const neutralEmbed = new EmbedBuilder()
                    .setColor('#808080')
                    .setTitle('🦋 NEUTRAL ROLES')
                    .setDescription('Each neutral role has unique win conditions!')
                    .setTimestamp();

                // Neutral Killing
                if (killingRoles.length > 0) {
                    neutralEmbed.addFields({
                        name: '💀 Neutral Killing',
                        value: killingRoles.map(([key, role]) => {
                            const nightActionText = role.nightAction ? ' 🌙' : '';
                            return `${role.emoji} **${role.name}${nightActionText}**\n• ${role.abilities[0]}`;
                        }).join('\n\n'),
                        inline: false
                    });
                }

                // Neutral Evil
                if (evilRoles.length > 0) {
                    neutralEmbed.addFields({
                        name: '😈 Neutral Evil',
                        value: evilRoles.map(([key, role]) => {
                            const nightActionText = role.nightAction ? ' 🌙' : '';
                            return `${role.emoji} **${role.name}${nightActionText}**\n• ${role.abilities[0]}`;
                        }).join('\n\n'),
                        inline: false
                    });
                }

                // Neutral Benign
                if (benignRoles.length > 0) {
                    neutralEmbed.addFields({
                        name: '🕊️ Neutral Benign',
                        value: benignRoles.map(([key, role]) => {
                            const nightActionText = role.nightAction ? ' 🌙' : '';
                            return `${role.emoji} **${role.name}${nightActionText}**\n• ${role.abilities[0]}`;
                        }).join('\n\n'),
                        inline: false
                    });
                }

                await message.reply({ embeds: [neutralEmbed] });
            }

            // Footer message
            if (!filter || filter === 'all') {
                await message.channel.send('💡 **Tip:** Use `!mafiaroles [bee|wasp|neutral]` to view specific factions\n🌙 = Has night action');
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

            // Announce in channel
            const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
            const revealEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('👑 ROYAL REVEAL! 👑')
                .setDescription(`**${player.displayName}** has revealed themselves as the **Queen Bee**!\n\nThey now have **3 extra votes** during voting!`)
                .setTimestamp();

            await channel.send({ embeds: [revealEmbed] });
            await message.reply('You have revealed yourself as the Queen Bee! You now have 3 extra votes.');
        }

        // Handle DMs for night actions and haunt selection
        if (message.channel.type === 1) { // DM channel
            const game = getGameByPlayer(message.author.id);
            if (!game) return;

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

                    const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
                    await channel.send(`👻 **${game.players.find(p => p.id === message.author.id).displayName}** haunted **${target.displayName}** from beyond the grave! 💀`);

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
                        await message.reply('📨 Message sent!');
                    } catch (error) {
                        console.error('Could not relay seance message:', error);
                        await message.reply('❌ Failed to send message.');
                    }
                    return;
                }
            }

            // Regular night actions
            if (game.phase !== 'night') return;
            await processNightAction(message.author.id, message, game, client);
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

                // Announce early completion
                const channel = game.cachedChannel || await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
                await channel.send('🗳️ Everyone has voted! Proceeding to results...');

                await endVotingPhase(game, client);
            }
        }
    });
};
