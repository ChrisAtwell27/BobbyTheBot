const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { updateBobbyBucks } = require('../database/helpers/economyHelpers');
const User = require('../database/models/User');
const { TARGET_GUILD_ID } = require('../config/guildConfig');
const { ROLES } = require('../mafia/roles/mafiaRoles');
const { 
    createGame, 
    getGame, 
    getGameByPlayer, 
    deleteGame, 
    getAllGames, 
    updateActivity 
} = require('../mafia/game/mafiaGameState');
const { 
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
    setActionHandler
} = require('../mafia/core/gameLoop');
const { 
    sendNightActionPrompts, 
    sendDuskActionPrompts, 
    processNightAction, 
    processDuskAction 
} = require('../mafia/core/actionHandler');
const { handleGameChat } = require('../mafia/core/chatHandler');
const { CleanupMap } = require('../utils/memoryUtils');

// Inject action handler into game loop to resolve circular dependency
setActionHandler({ sendNightActionPrompts, sendDuskActionPrompts });

// Constants
const MAFIA_VC_ID = '1434633691455426600';
const MAFIA_TEXT_CHANNEL_ID = '1434636519380881508';
const GAME_INACTIVITY_TIMEOUT = 3600000; // 1 hour

// Store pending game configurations with automatic cleanup after 5 minutes
const pendingGameConfigs = new CleanupMap(5 * 60 * 1000, 1 * 60 * 1000);

// Store CleanupMap for graceful shutdown cleanup
if (!global.mafiaHandlerCleanupMaps) global.mafiaHandlerCleanupMaps = [];
global.mafiaHandlerCleanupMaps.push(pendingGameConfigs);

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
            console.log(`Cleaning up inactive game ${gameId}`);
            // Clear timers
            if (game.phaseTimer) clearTimeout(game.phaseTimer);
            if (game.warningTimer) clearTimeout(game.warningTimer);
            if (game.duskTimer) clearTimeout(game.duskTimer);
            if (game.botAiTimer) clearTimeout(game.botAiTimer);
            if (game.botDuskAiTimer) clearTimeout(game.botDuskAiTimer);

            deleteGame(gameId);
        }
    }

    return gamesToDelete.length;
}

// Initialize
module.exports = {
    init: (client) => {
        // Periodic cleanup of inactive games
        setInterval(() => cleanupInactiveGames(client), 5 * 60 * 1000); // Every 5 minutes

        client.on('messageCreate', async (message) => {
            if (message.author.bot) return;

            // Handle game chat (transformations, etc.)
            await handleGameChat(message, client);

            // Handle DM actions
            if (message.channel.type === 1) { // DM
                const game = getGameByPlayer(message.author.id);
                if (!game) return;

                // Dusk actions
                if (game.phase === 'dusk') {
                    await processDuskAction(message.author.id, message, game, client);
                    return;
                }

                // Night actions
                if (game.phase === 'night') {
                    await processNightAction(message.author.id, message, game, client);
                    return;
                }
            }

            // Commands
            if (!message.content.startsWith('!')) return;

            const args = message.content.slice(1).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            // !createmafia or !createmafiadebug
            if (command === 'createmafia' || command === 'createmafiadebug') {
                if (message.channel.id !== MAFIA_TEXT_CHANNEL_ID && message.channel.id !== TARGET_GUILD_ID) {
                    // Allow in mafia channel or guild root (for testing)
                    // Actually, usually restricted to specific channels
                }
                
                const voiceChannel = message.member.voice.channel;
                if (!voiceChannel || voiceChannel.id !== MAFIA_VC_ID) {
                    return message.reply(`❌ You must be in the **Mafia Voice Channel** (<#${MAFIA_VC_ID}>) to start a game!`);
                }

                const players = [];
                // Add real players from VC
                voiceChannel.members.forEach(member => {
                    if (!member.user.bot) {
                        players.push({
                            id: member.id,
                            displayName: member.displayName,
                            username: member.user.username,
                            avatar: member.user.displayAvatarURL()
                        });
                    }
                });

                // Check for bots/debug flags
                let botCount = 0;
                let debugMode = false;
                let noAI = false;
                let revealRoles = false;
                let randomMode = false;
                let preset = null;
                let specifiedRoles = [];

                // Default settings for debug command
                if (command === 'createmafiadebug') {
                    botCount = 5;
                    debugMode = true;
                }

                // Parse args
                args.forEach(arg => {
                    if (arg.startsWith('bots=')) botCount = parseInt(arg.split('=')[1]) || 0;
                    if (arg === 'debug') debugMode = true;
                    if (arg === 'noai') noAI = true;
                    if (arg === 'reveal') revealRoles = true;
                    if (arg === 'random') randomMode = true;
                    if (arg.startsWith('preset=')) preset = arg.split('=')[1];
                });

                // Add bots
                for (let i = 0; i < botCount; i++) {
                    players.push({
                        id: `bot-${i}`,
                        displayName: `Bot ${i + 1}`,
                        username: `bot${i}`,
                        avatar: client.user.displayAvatarURL()
                    });
                }

                if (players.length < 6 && !debugMode) { // MIN_PLAYERS
                    return message.reply(`❌ Not enough players! Need at least 6. Current: ${players.length}`);
                }

                // Check for existing game
                if (getAllGames().size > 0) {
                    return message.reply('❌ A game is already in progress!');
                }

                // Create config
                const config = {
                    gameId: message.channel.id, // Use channel ID as game ID
                    players,
                    organizerId: message.author.id,
                    randomMode,
                    revealRoles,
                    preset,
                    noAI,
                    specifiedRoles,
                    debugMode
                };

                // Store pending config
                pendingGameConfigs.set(message.author.id, config);

                // Send setup buttons
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`mafia_quickstart_${message.author.id}`)
                            .setLabel('🚀 Quick Start (Default Times)')
                            .setStyle(ButtonStyle.Success),
                        new ButtonBuilder()
                            .setCustomId(`mafia_customize_${message.author.id}`)
                            .setLabel('⚙️ Customize Times')
                            .setStyle(ButtonStyle.Secondary)
                    );

                await message.reply({
                    content: `🎲 **Mafia Game Setup**\n\nPlayers: ${players.length}\nMode: ${randomMode ? 'Random' : 'Normal'}\n\nChoose how to start:`,
                    components: [row]
                });
            }

            // !mafiadebugskip
            if (command === 'mafiadebugskip') {
                const game = getGameByPlayer(message.author.id);
                if (!game || !game.debugMode) return;

                if (game.phase === 'night') {
                    await endNightPhase(game, client);
                    message.reply('Skipped night phase.');
                } else if (game.phase === 'day') {
                    await startVotingPhase(game, client);
                    message.reply('Skipped day phase.');
                } else if (game.phase === 'voting') {
                    await endVotingPhase(game, client);
                    message.reply('Skipped voting phase.');
                } else if (game.phase === 'dusk') {
                    await startNightPhase(game, client); // Skip dusk to night
                    message.reply('Skipped dusk phase.');
                }
            }

            // !mafiadebugend
            if (command === 'mafiadebugend') {
                const game = getGameByPlayer(message.author.id);
                if (!game || !game.debugMode) return;
                await endGame(game, client, 'force_end');
                message.reply('Game force ended.');
            }
            
            // !mafiaroles
            if (command === 'mafiaroles') {
                const game = getGameByPlayer(message.author.id);
                if (!game) return;
                
                // Construct role list
                const roleList = game.players.map(p => {
                    const role = ROLES[p.role];
                    const status = p.alive ? 'Alive' : 'Dead';
                    return `**${p.displayName}**: ${role.name} (${status})`;
                }).join('\n');
                
                message.author.send(`**Current Game Roles:**\n\n${roleList}`).catch(() => {});
                message.reply('Sent you the role list in DMs.');
            }
        });

        client.on('interactionCreate', async (interaction) => {
            // Handle buttons (voting, setup)
            if (interaction.isButton()) {
                if (interaction.customId.startsWith('vote_')) {
                    // Voting logic
                    const gameId = interaction.customId.split('_')[1];
                    const targetId = interaction.customId.split('_')[2];
                    const game = getGame(gameId);
                    
                    if (!game || game.phase !== 'voting') {
                        return interaction.reply({ content: '❌ Voting is not active.', ephemeral: true });
                    }

                    const player = game.players.find(p => p.id === interaction.user.id);
                    if (!player || !player.alive) {
                        return interaction.reply({ content: '❌ You cannot vote.', ephemeral: true });
                    }

                    game.votes[player.id] = targetId;
                    
                    const targetName = targetId === 'skip' ? 'Skip' : game.players.find(p => p.id === targetId).displayName;
                    await interaction.reply({ content: `✅ You voted for **${targetName}**.`, ephemeral: true });
                }
                
                // Setup buttons handled in gameLoop/startMafiaGame logic or here?
                // The setup buttons trigger startMafiaGame.
                if (interaction.customId.startsWith('mafia_quickstart_')) {
                    const userId = interaction.customId.replace('mafia_quickstart_', '');
                    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Not organizer.', ephemeral: true });
                    
                    const config = pendingGameConfigs.get(userId);
                    if (!config) return interaction.reply({ content: '❌ Expired.', ephemeral: true });
                    
                    pendingGameConfigs.delete(userId);
                    await interaction.update({ components: [] });
                    await startMafiaGame(client, config);
                }
                
                if (interaction.customId.startsWith('mafia_customize_')) {
                    // Show modal (same as original)
                    const userId = interaction.customId.replace('mafia_customize_', '');
                    if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Not organizer.', ephemeral: true });
                    
                    const modal = new ModalBuilder()
                        .setCustomId(`mafia_time_modal_${userId}`)
                        .setTitle('Configure Game Time Limits');
                        
                    const setupInput = new TextInputBuilder().setCustomId('setup_time').setLabel('Setup (s)').setStyle(TextInputStyle.Short).setValue('30');
                    const nightInput = new TextInputBuilder().setCustomId('night_time').setLabel('Night (s)').setStyle(TextInputStyle.Short).setValue('60');
                    const dayInput = new TextInputBuilder().setCustomId('day_time').setLabel('Day (s)').setStyle(TextInputStyle.Short).setValue('180');
                    const votingInput = new TextInputBuilder().setCustomId('voting_time').setLabel('Voting (s)').setStyle(TextInputStyle.Short).setValue('120');
                    
                    const rows = [setupInput, nightInput, dayInput, votingInput].map(input => new ActionRowBuilder().addComponents(input));
                    modal.addComponents(rows);
                    
                    await interaction.showModal(modal);
                }
            }
            
            if (interaction.isModalSubmit() && interaction.customId.startsWith('mafia_time_modal_')) {
                const userId = interaction.customId.replace('mafia_time_modal_', '');
                const config = pendingGameConfigs.get(userId);
                if (!config) return interaction.reply({ content: '❌ Expired.', ephemeral: true });
                
                const setup = parseInt(interaction.fields.getTextInputValue('setup_time'));
                const night = parseInt(interaction.fields.getTextInputValue('night_time'));
                const day = parseInt(interaction.fields.getTextInputValue('day_time'));
                const voting = parseInt(interaction.fields.getTextInputValue('voting_time'));
                
                if ([setup, night, day, voting].some(t => isNaN(t) || t < 5 || t > 600)) {
                    return interaction.reply({ content: '❌ Invalid times (5-600s).', ephemeral: true });
                }
                
                config.customDurations = { setup, night, day, voting };
                pendingGameConfigs.delete(userId);
                
                await interaction.reply({ content: '✅ Starting game...', ephemeral: true });
                await startMafiaGame(client, config);
            }
        });
    },
    
    // Export for external access
    getActiveGames: getAllGames
};
