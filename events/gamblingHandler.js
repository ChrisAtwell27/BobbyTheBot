const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const { getBobbyBucks, updateBobbyBucks } = require('../database/helpers/economyHelpers');
const { getHouseBalance, updateHouse } = require('../database/helpers/serverHelpers');
const Challenge = require('../database/models/Challenge');
const { TARGET_GUILD_ID } = require('../config/guildConfig');
const { CleanupMap, LimitedMap } = require('../utils/memoryUtils');
const { checkSubscription, createUpgradeEmbed, TIERS } = require('../utils/subscriptionUtils');

const { insufficientFundsMessage, invalidUsageMessage, processingMessage } = require('../utils/errorMessages');

// Auto-cleanup cooldowns after 5 minutes (way longer than needed)
const cooldowns = new CleanupMap(5 * 60 * 1000, 1 * 60 * 1000);

// Auto-cleanup challenges after timeout period
const challenges = new CleanupMap(5 * 60 * 1000, 1 * 60 * 1000);

// Limited active games to prevent memory leak (max 100 concurrent games)
const activeGames = new LimitedMap(100);

const COOLDOWN_SECONDS = 3; // Cooldown in seconds
const CHALLENGE_TIMEOUT = 5 * 60 * 1000; // 5 minute timeout for challenges

// Load active challenges from database on startup
async function loadActiveChallenges() {
    try {
        const activeChallenges = await Challenge.find({});
        console.log(`[GAMBLING] Loaded ${activeChallenges.length} active challenges from database`);

        for (const challenge of activeChallenges) {
            challenges.set(challenge.challengeId, {
                type: challenge.type,
                creator: challenge.creator,
                creatorName: challenge.creatorName,
                challenged: challenge.challenged,
                challengedName: challenge.challengedName,
                amount: challenge.amount,
                channelId: challenge.channelId,
                gladiatorClass: challenge.gladiatorClass,
                challengerAvatarURL: challenge.challengerAvatarURL,
                challengedAvatarURL: challenge.challengedAvatarURL,
                timestamp: challenge.createdAt.getTime()
            });
        }
    } catch (error) {
        console.error('[GAMBLING] Error loading challenges from database:', error);
    }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// Generic challenge creation function
async function createChallenge(message, args, type, options) {
    if (args.length !== 2 || isNaN(parseInt(args[1], 10)) || parseInt(args[1], 10) <= 0) {
        return message.channel.send(invalidUsageMessage(type, `!${type} [amount]`, `!${type} 100`));
    }

    const betAmount = parseInt(args[1], 10);
    const userId = message.author.id;
    const balance = await getBobbyBucks(userId);

    if (balance < betAmount) {
        return message.channel.send(insufficientFundsMessage(message.author.username, balance, betAmount));
    }

    // Show processing message
    const processingMsg = await message.channel.send(processingMessage('we create your challenge'));

    const challengeId = `${type}_${Date.now()}_${userId}`;
    const challenge = {
        type,
        creator: userId,
        creatorName: message.author.username,
        amount: betAmount,
        channelId: message.channel.id,
        timestamp: Date.now()
    };

    challenges.set(challengeId, challenge);
    await updateBobbyBucks(userId, -betAmount); // Lock the bet

    // Save to database
    try {
        await Challenge.create({
            challengeId,
            type,
            creator: userId,
            creatorName: message.author.username,
            amount: betAmount,
            channelId: message.channel.id
        });
    } catch (dbError) {
        console.error('[GAMBLING] Error saving challenge to database:', dbError);
    }

    // Delete processing message
    await processingMsg.delete().catch(() => { });

    const embed = new EmbedBuilder()
        .setTitle(options.title)
        .setColor(options.color)
        .setDescription(options.description.replace('{user}', message.author.username))
        .addFields(
            { name: '💰 Pot', value: `🍯${betAmount * 2} (minus 5% house cut)`, inline: true },
            { name: '✅ To Accept', value: `Click the button below!`, inline: true },
            { name: '⏳ Expires', value: '<t:' + Math.floor((Date.now() + CHALLENGE_TIMEOUT) / 1000) + ':R>', inline: true }
        );

    if (options.extraFields) {
        embed.addFields(options.extraFields);
    }

    embed.setFooter({ text: options.footer || 'Click to accept!' })
        .setTimestamp();

    const acceptButton = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`accept_${challengeId}`)
                .setLabel(options.buttonLabel || 'Accept Challenge!')
                .setStyle(ButtonStyle.Success)
                .setEmoji(options.buttonEmoji || '✅')
        );

    const challengeMessage = await message.channel.send({ embeds: [embed], components: [acceptButton] });

    // Store only IDs to avoid memory leak
    const messageId = challengeMessage.id;
    const channelId = challengeMessage.channelId;
    const authorUsername = message.author.username;

    // Auto-expire challenge
    challenge.expiryTimer = setTimeout(async () => {
        if (challenges.has(challengeId)) {
            challenges.delete(challengeId);
            await updateBobbyBucks(userId, betAmount); // Refund

            // Delete from database
            try {
                await Challenge.deleteOne({ challengeId });
            } catch (dbError) {
                console.error('[GAMBLING] Error deleting expired challenge from database:', dbError);
            }

            // Disable the button
            const disabledButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('expired')
                        .setLabel('Challenge Expired')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                        .setEmoji('⚠️')
                );

            // Fetch channel and message fresh instead of using stale references
            try {
                const channel = await message.client.channels.fetch(channelId);
                if (channel) {
                    const msg = await channel.messages.fetch(messageId);
                    await msg.edit({ components: [disabledButton] });
                    await channel.send(`⚠️ ${options.title} by **${authorUsername}** has expired and been refunded.`);
                }
            } catch (error) {
                // Message may have been deleted, ignore
            }
        }
    }, CHALLENGE_TIMEOUT);
}

// Handle challenge acceptance
async function handleChallengeAccept(interaction) {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    const challengeId = customId.replace('accept_', '');

    // Try to get from memory first, then from database
    let challenge = challenges.get(challengeId);

    if (!challenge) {
        // Try to load from database
        try {
            const dbChallenge = await Challenge.findOne({ challengeId });
            if (dbChallenge) {
                challenge = {
                    type: dbChallenge.type,
                    creator: dbChallenge.creator,
                    creatorName: dbChallenge.creatorName,
                    amount: dbChallenge.amount,
                    channelId: dbChallenge.channelId,
                    timestamp: dbChallenge.createdAt.getTime()
                };
                challenges.set(challengeId, challenge);
                console.log(`[GAMBLING] Loaded challenge ${challengeId} from database`);
            }
        } catch (dbError) {
            console.error('[GAMBLING] Error loading challenge from database:', dbError);
        }
    }

    if (!challenge) {
        return interaction.reply({
            content: "⚠️ This challenge is no longer active. It may have expired.\n\n💡 **Tip:** Ask the challenger to create a new challenge!",
            ephemeral: true
        }).catch(err => {
            if (err.code !== 10062 && err.code !== 40060) {
                console.error('Error replying to expired challenge interaction:', err);
            }
        });
    }

    if (challenge.creator === userId) {
        return interaction.reply({ content: "⚠️ You can't accept your own challenge!", ephemeral: true });
    }

    const balance = await getBobbyBucks(userId);
    if (balance < challenge.amount) {
        return interaction.reply({ content: `⚠️ You don't have enough Honey. You need 🍯${challenge.amount}. Your balance: 🍯${balance}`, ephemeral: true });
    }

    // Lock opponent's bet
    await updateBobbyBucks(userId, -challenge.amount);

    // Clear expiry timer if exists
    if (challenge.expiryTimer) {
        clearTimeout(challenge.expiryTimer);
    }
    challenges.delete(challengeId);

    // Delete from database
    try {
        await Challenge.deleteOne({ challengeId });
    } catch (dbError) {
        console.error('[GAMBLING] Error deleting challenge from database:', dbError);
    }

    // Start the game
    const gameId = `game_${Date.now()}`;
    const game = {
        type: challenge.type,
        player1: challenge.creator,
        player1Name: challenge.creatorName,
        player2: userId,
        player2Name: interaction.user.username,
        amount: challenge.amount,
        channelId: interaction.channel.id,
        moves: {},
        timestamp: Date.now()
    };

    activeGames.set(gameId, game);

    await interaction.reply({ content: `✅ Challenge accepted! Starting **${challenge.type.toUpperCase()}** game...`, ephemeral: true });

    return { gameId, game, type: challenge.type };
}

// Handle game moves (RPS)
async function handleGameMove(interaction, client) {
    const customId = interaction.customId;
    const userId = interaction.user.id;
    const [, gameId, move] = customId.split('_');

    if (!activeGames.has(gameId)) {
        // Try to find any game this user is part of as a fallback
        let foundGame = null;
        let foundGameId = null;

        for (const [id, game] of activeGames.entries()) {
            if (game.type === 'rps' && (game.player1 === userId || game.player2 === userId)) {
                foundGame = game;
                foundGameId = id;
                break;
            }
        }

        if (!foundGame) {
            return interaction.reply({ content: "⚠️ No active RPS game found for you. The game may have expired.", ephemeral: true });
        }

        // Use the found game
        const game = foundGame;

        if (game.moves[userId]) {
            return interaction.reply({ content: "⚠️ You've already made your move!", ephemeral: true });
        }

        game.moves[userId] = move;
        await interaction.reply({ content: `✅ Your move (${move}) has been recorded! Waiting for your opponent...`, ephemeral: true });

        if (Object.keys(game.moves).length === 2) {
            resolveRPSGame(client, foundGameId, game);
        }
        return;
    }

    const game = activeGames.get(gameId);

    if (userId !== game.player1 && userId !== game.player2) {
        return interaction.reply({ content: "⚠️ You're not part of this game!", ephemeral: true });
    }

    if (game.moves[userId]) {
        return interaction.reply({ content: "⚠️ You've already made your move!", ephemeral: true });
    }

    game.moves[userId] = move;
    await interaction.reply({ content: `✅ Your move (${move}) has been recorded! Waiting for your opponent...`, ephemeral: true });

    if (Object.keys(game.moves).length === 2) {
        resolveRPSGame(client, gameId, game);
    }
}

module.exports = (client) => {
    // Load challenges when the bot starts
    client.once('ready', () => {
        loadActiveChallenges();
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // Only run in target guild
        if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

        const args = message.content.split(' ');
        const command = args[0].toLowerCase();
        const userId = message.author.id;

        // Handle DM messages for game moves
        if (!message.guild) {
            // Check if user is in an active mafia game - if so, don't respond
            const { getGameByPlayer } = require('../mafia/game/mafiaGameState');
            const mafiaGame = getGameByPlayer(userId);
            if (mafiaGame) {
                return; // Let mafia handler deal with this DM
            }

            if (command === '!play' && args.length >= 3) {
                const gameId = args[1];
                const move = args.slice(2).join(' ').toLowerCase();

                if (!activeGames.has(gameId)) {
                    return message.reply("Game not found or has ended!");
                }

                const game = activeGames.get(gameId);

                if (userId !== game.player1 && userId !== game.player2) {
                    return message.reply("You're not part of this game!");
                }

                if (game.moves[userId]) {
                    return message.reply("You've already made your move!");
                }

                if (game.type === 'numberduel') {
                    const guess = parseInt(move);
                    if (isNaN(guess) || guess < 1 || guess > 100) {
                        return message.reply("Invalid guess! Please enter a number between 1-100");
                    }
                    game.moves[userId] = guess;
                    message.reply(`Your guess (${guess}) has been recorded!`);

                    if (Object.keys(game.moves).length === 2) {
                        resolveNumberDuelGame(client, gameId, game);
                    }
                }
            } else if (command === '!help' || command === '!commands') {
                // Help command in DMs
                const helpEmbed = new EmbedBuilder()
                    .setTitle('🎲 Casino Bot DM Commands')
                    .setColor('#3498db')
                    .setDescription('Available commands in Direct Messages:')
                    .addFields(
                        { name: '🎮 Number Duel', value: '`!play [game_id] [number]`\nSubmit your guess (1-100)', inline: false },
                        { name: '📋 Example', value: '`!play game_456 42`', inline: false },
                        { name: '💡 Tip', value: 'All other games use buttons in the main chat now!', inline: false }
                    )
                    .setFooter({ text: 'Go back to the server to start new games!' });

                return message.reply({ embeds: [helpEmbed] });
            } else if (command.startsWith('!')) {
                // Unknown command in DM
                return message.reply("Unknown command! Use `!help` for available DM commands, or go back to the server to use casino games with buttons.");
            } else {
                // Non-command message in DM
                return message.reply("Hi! I'm the Casino Bot 🎰\n\nTo play games, use commands in the server. All games use buttons for easy interaction!\n\nType `!help` for DM commands or go back to the server to start gambling!");
            }
            return; // Exit early for DM messages
        }

        // Handle guild messages
        // EARLY RETURN: Skip if message doesn't start with gambling commands
        const isGamblingCommand = command === '!gamble' || command === '!flip' ||
            command === '!roulette' || command === '!dice' ||
            command === '!rps' || command === '!highercard' ||
            command === '!quickdraw' || command === '!numberduel' ||
            command === '!challenges';

        if (!isGamblingCommand) return;

        // Reset cooldown
        cooldowns.set(userId, Date.now());

        // Command to get a list of all games
        if (command === '!gamble') {
            const balance = await getBobbyBucks(userId);
            const houseBalance = await getHouseBalance();
            const gameList = new EmbedBuilder()
                .setTitle('🎰 CASINO GAMES')
                .setColor('#ffd700')
                .setDescription('**Welcome to the Honey Casino!** 🎲\nChoose your game and test your luck!')
                .addFields(
                    { name: '🏠 **HOUSE GAMES** (Solo Play)', value: '`!dice [amount] [guess (1-6)]` - **6x payout**\n`!flip [amount]` - **2x payout**\n`!roulette [amount] [red/black/number]` - **2x/36x payout**\n`!blackjack [amount]` - Beat the dealer!', inline: false },
                    { name: '⚔️ **PVP GAMES** (Player vs Player)', value: '`!rps [amount]` - Rock Paper Scissors duel\n`!highercard [amount]` - Higher card wins\n`!quickdraw [amount]` - Type random word fastest\n`!numberduel [amount]` - Closest number guess wins', inline: false },
                    { name: '🎯 **CHALLENGE SYSTEM**', value: 'Create challenges with buttons - just click to accept!\nWinner takes the pot! ðŸ†', inline: false }
                )
                .addFields(
                    { name: '💰 Your Stats', value: `**Balance:** 🍯${balance}\n**House:** 🍯${houseBalance}`, inline: true },
                    { name: '🎯 Payouts', value: '**Solo:** Various multipliers\n**PvP:** Winner takes all!\n**House Cut:** 5% of pot', inline: true }
                )
                .setFooter({ text: '🍀 Good luck and gamble responsibly!' })
                .setTimestamp();
            return message.channel.send({ embeds: [gameList] });
        }

        // House games (FREE TIER)
        if (command === '!flip') {
            playFlipGame(message, args);
        } else if (command === '!roulette') {
            playRouletteGame(message, args);
        } else if (command === '!dice') {
            playDiceGame(message, args);
        }
        // PvP games (PLUS TIER REQUIRED)
        else if (command === '!rps') {
            // Check subscription tier for PvP games (guild-based)
            const subCheck = await checkSubscription(message.guild.id, TIERS.PLUS);
            if (!subCheck.hasAccess) {
                const upgradeEmbed = createUpgradeEmbed('PvP Casino Games', TIERS.PLUS, subCheck.guildTier);
                return message.channel.send({ embeds: [upgradeEmbed] });
            }
            createChallenge(message, args, 'rps', {
                title: '⚔️ Rock Paper Scissors Challenge!',
                color: '#ff6b6b',
                description: '**{user}** challenges someone to Rock Paper Scissors!',
                buttonLabel: 'Accept Challenge!',
                buttonEmoji: '⚔️',
                extraFields: [
                    { name: '🎮 Game Play', value: 'Once accepted, both players use buttons in this channel!', inline: false }
                ],
                footer: 'Rock 🪨 | Paper 📄 | Scissors ✂️'
            });
        } else if (command === '!highercard') {
            // Check subscription tier for PvP games (guild-based)
            const subCheck = await checkSubscription(message.guild.id, TIERS.PLUS);
            if (!subCheck.hasAccess) {
                const upgradeEmbed = createUpgradeEmbed('PvP Casino Games', TIERS.PLUS, subCheck.guildTier);
                return message.channel.send({ embeds: [upgradeEmbed] });
            }
            createChallenge(message, args, 'highercard', {
                title: '🃏 Higher Card Challenge!',
                color: '#4ecdc4',
                description: '**{user}** challenges someone to Higher Card!',
                buttonLabel: 'Accept Challenge!',
                buttonEmoji: '🃏',
                extraFields: [
                    { name: '📋 Rules', value: 'Both draw a card - highest wins!', inline: true }
                ],
                footer: 'Ace=1, Jack=11, Queen=12, King=13'
            });
        } else if (command === '!quickdraw') {
            // Check subscription tier for PvP games (guild-based)
            const subCheck = await checkSubscription(message.guild.id, TIERS.PLUS);
            if (!subCheck.hasAccess) {
                const upgradeEmbed = createUpgradeEmbed('PvP Casino Games', TIERS.PLUS, subCheck.guildTier);
                return message.channel.send({ embeds: [upgradeEmbed] });
            }
            createChallenge(message, args, 'quickdraw', {
                title: '⚡ Quick Draw Challenge!',
                color: '#f39c12',
                description: '**{user}** challenges someone to Quick Draw!',
                buttonLabel: 'Accept Challenge!',
                buttonEmoji: '⚡',
                extraFields: [
                    { name: '📋 Rules', value: 'First to type the random word when prompted wins!', inline: true }
                ],
                footer: '⚡ Speed and reflexes matter! Word will be random!'
            });
        } else if (command === '!numberduel') {
            // Check subscription tier for PvP games (guild-based)
            const subCheck = await checkSubscription(message.guild.id, TIERS.PLUS);
            if (!subCheck.hasAccess) {
                const upgradeEmbed = createUpgradeEmbed('PvP Casino Games', TIERS.PLUS, subCheck.guildTier);
                return message.channel.send({ embeds: [upgradeEmbed] });
            }
            createChallenge(message, args, 'numberduel', {
                title: '🎯 Number Duel Challenge!',
                color: '#9b59b6',
                description: '**{user}** challenges someone to Number Duel!',
                buttonLabel: 'Accept Challenge!',
                buttonEmoji: '🎯',
                extraFields: [
                    { name: '📋 Rules', value: 'Guess 1-100, closest to target wins!', inline: true }
                ],
                footer: '🎯 Precision beats luck!'
            });
        } else if (command === '!challenges') {
            listChallenges(message);
        }
    });

    // Handle button interactions
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        const customId = interaction.customId;

        try {
            // Handle challenge acceptance buttons
            if (customId.startsWith('accept_')) {
                const result = await handleChallengeAccept(interaction);
                if (result) {
                    const { gameId, game, type } = result;
                    if (type === 'rps') startRPSGame(interaction, gameId, game);
                    else if (type === 'highercard') startHigherCardGame(interaction, gameId, game);
                    else if (type === 'quickdraw') startQuickDrawGame(interaction, gameId, game);
                    else if (type === 'numberduel') startNumberDuelGame(interaction, gameId, game);
                }
            }
            // Handle RPS move buttons
            else if (customId.startsWith('rps_')) {
                await handleGameMove(interaction, client);
            }
        } catch (error) {
            // Handle interaction errors gracefully
            if (error.code === 10062 || error.code === 40060) {
                // Interaction expired or unknown - this is normal for old buttons
                console.log('Interaction expired or unknown - user clicked an old button');
            } else {
                console.error('Error handling gambling interaction:', error);
            }
        }
    });
};

// ==========================================
// GAME LOGIC FUNCTIONS
// ==========================================

// Start RPS game with main chat buttons
async function startRPSGame(interaction, gameId, game) {
    // Debug: Confirm game is stored
    console.log('Starting RPS game with ID:', gameId);
    console.log('Game stored in activeGames:', activeGames.has(gameId));

    // Create main channel embed with buttons
    const gameEmbed = new EmbedBuilder()
        .setTitle('⚔️ Rock Paper Scissors Battle!')
        .setColor('#ff6b6b')
        .setDescription(`**${game.player1Name}** vs **${game.player2Name}**`)
        .addFields(
            { name: '💰 Total Pot', value: `🍯${game.amount * 2}`, inline: true },
            { name: '🎯 How to Play', value: `Both players click your move below!`, inline: true },
            { name: 'ðŸ”’ Privacy', value: 'Your moves will be hidden until both choose!', inline: false },
            { name: 'ðŸ†” Game ID', value: `\`${gameId}\``, inline: true }
        )
        .setFooter({ text: 'Rock 🪨 beats Scissors ✂️ | Paper 📄 beats Rock 🪨 | Scissors ✂️ beats Paper 📄' })
        .setTimestamp();

    const moveButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`rps_${gameId}_rock`)
                .setLabel('Rock')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🪨'),
            new ButtonBuilder()
                .setCustomId(`rps_${gameId}_paper`)
                .setLabel('Paper')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📄'),
            new ButtonBuilder()
                .setCustomId(`rps_${gameId}_scissors`)
                .setLabel('Scissors')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('✂️')
        );

    // Send to main channel with buttons
    await interaction.channel.send({ embeds: [gameEmbed], components: [moveButtons] });

    console.log('RPS game buttons sent to main channel for game:', gameId);
}

// Start Higher Card game
async function startHigherCardGame(interaction, gameId, game) {
    // Automatically draw cards for both players
    const suits = ['â™ ï¸', 'â™¥ï¸', 'â™¦ï¸', 'â™£ï¸'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

    const card1Index = Math.floor(Math.random() * 13);
    const card2Index = Math.floor(Math.random() * 13);
    const suit1 = suits[Math.floor(Math.random() * 4)];
    const suit2 = suits[Math.floor(Math.random() * 4)];

    const player1Card = { rank: ranks[card1Index], suit: suit1, value: values[card1Index] };
    const player2Card = { rank: ranks[card2Index], suit: suit2, value: values[card2Index] };

    let winner, loser;
    if (player1Card.value > player2Card.value) {
        winner = game.player1;
        loser = game.player2;
    } else if (player2Card.value > player1Card.value) {
        winner = game.player2;
        loser = game.player1;
    } else {
        // Tie - refund both players
        await updateBobbyBucks(game.player1, game.amount);
        await updateBobbyBucks(game.player2, game.amount);
        activeGames.delete(gameId);

        const embed = new EmbedBuilder()
            .setTitle('🃏 Higher Card - TIE!')
            .setColor('#95a5a6')
            .setDescription('Both players drew the same value!')
            .addFields(
                { name: `${game.player1Name}'s Card`, value: `${player1Card.rank}${player1Card.suit} (${player1Card.value})`, inline: true },
                { name: `${game.player2Name}'s Card`, value: `${player2Card.rank}${player2Card.suit} (${player2Card.value})`, inline: true },
                { name: '💰 Result', value: 'Both players refunded!', inline: false }
            );

        return interaction.channel.send({ embeds: [embed] });
    }

    // Pay out winner
    const houseCut = Math.floor(game.amount * 2 * 0.05);
    const winnings = (game.amount * 2) - houseCut;
    await updateBobbyBucks(winner, winnings);
    await updateHouse(houseCut);
    activeGames.delete(gameId);

    const winnerName = winner === game.player1 ? game.player1Name : game.player2Name;
    const embed = new EmbedBuilder()
        .setTitle('🃏 Higher Card Results!')
        .setColor('#2ecc71')
        .setDescription(`**${winnerName}** wins the duel!`)
        .addFields(
            { name: `${game.player1Name}'s Card`, value: `${player1Card.rank}${player1Card.suit} (${player1Card.value})`, inline: true },
            { name: `${game.player2Name}'s Card`, value: `${player2Card.rank}${player2Card.suit} (${player2Card.value})`, inline: true },
            { name: '💰 Winnings', value: `🍯${winnings} (after 5% house cut)`, inline: false }
        )
        .setTimestamp();

    interaction.channel.send({ embeds: [embed] });
}

// Quick Draw word list - mix of simple and tricky words
const quickDrawWords = [
    'BANG', 'FIRE', 'SHOOT', 'QUICK', 'FAST', 'SPEED', 'RUSH', 'DASH', 'BOLT', 'FLASH',
    'THUNDER', 'LIGHTNING', 'STORM', 'BULLET', 'ROCKET', 'LASER', 'NINJA', 'SWORD',
    'STRIKE', 'ATTACK', 'CHARGE', 'BLITZ', 'ZOOM', 'SONIC', 'TURBO', 'NITRO', 'BOOST',
    'POWER', 'ENERGY', 'FORCE', 'IMPACT', 'SHOCK', 'BLAST', 'BURST', 'EXPLODE',
    'VICTORY', 'CHAMPION', 'WINNER', 'GLORY', 'TRIUMPH', 'SUCCESS', 'LEGEND', 'HERO',
    'DRAGON', 'EAGLE', 'FALCON', 'TIGER', 'LION', 'SHARK', 'VIPER', 'PHOENIX'
];

// Start Quick Draw game
async function startQuickDrawGame(interaction, gameId, game) {
    // Pick a random word from the list
    const randomWord = quickDrawWords[Math.floor(Math.random() * quickDrawWords.length)];
    game.targetWord = randomWord; // Store the word in the game object

    const embed = new EmbedBuilder()
        .setTitle('⚡ Quick Draw Duel!')
        .setColor('#f39c12')
        .setDescription(`**${game.player1Name}** vs **${game.player2Name}**`)
        .addFields(
            { name: '💰 Total Pot', value: `🍯${game.amount * 2}`, inline: true },
            { name: '🎯 Get Ready!', value: 'Wait for the signal...', inline: false },
            { name: 'ðŸ“ Instructions', value: 'When prompted, type the **exact word** shown to win!', inline: false }
        )
        .setTimestamp();

    interaction.channel.send({ embeds: [embed] });

    // Random delay between 3-8 seconds
    const delay = Math.random() * 5000 + 3000;

    game.drawTimer = setTimeout(() => {
        const drawEmbed = new EmbedBuilder()
            .setTitle(`⚡ TYPE: ${randomWord}`)
            .setColor('#e74c3c')
            .setDescription(`**First to type "${randomWord}" wins!**`)
            .addFields(
                { name: '🎯 Target Word', value: `**${randomWord}**`, inline: true },
                { name: '⚡ Case Sensitive?', value: 'No - any case works', inline: true }
            )
            .setTimestamp();

        interaction.channel.send({ embeds: [drawEmbed] });

        // Set up listener for first response
        const filter = (msg) => {
            return !msg.author.bot &&
                msg.content.toLowerCase() === randomWord.toLowerCase() &&
                (msg.author.id === game.player1 || msg.author.id === game.player2);
        };

        const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 15000 });

        collector.on('collect', async (msg) => {
            const winner = msg.author.id;
            const winnerName = winner === game.player1 ? game.player1Name : game.player2Name;

            const houseCut = Math.floor(game.amount * 2 * 0.05);
            const winnings = (game.amount * 2) - houseCut;
            await updateBobbyBucks(winner, winnings);
            await updateHouse(houseCut);
            activeGames.delete(gameId);

            const resultEmbed = new EmbedBuilder()
                .setTitle('⚡ Quick Draw Results!')
                .setColor('#2ecc71')
                .setDescription(`**${winnerName}** was fastest on the draw!`)
                .addFields(
                    { name: 'ðŸ† Winner', value: winnerName, inline: true },
                    { name: '🎯 Target Word', value: randomWord, inline: true },
                    { name: '💰 Winnings', value: `🍯${winnings}`, inline: true },
                    { name: '⚡ Victory Message', value: `"${msg.content}" - Lightning fast!`, inline: false }
                )
                .setTimestamp();

            interaction.channel.send({ embeds: [resultEmbed] });
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                // No one responded in time - refund both
                await updateBobbyBucks(game.player1, game.amount);
                await updateBobbyBucks(game.player2, game.amount);
                activeGames.delete(gameId);

                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('â° Quick Draw Timeout!')
                    .setColor('#95a5a6')
                    .setDescription('Nobody typed the word in time!')
                    .addFields(
                        { name: '🎯 Target Word Was', value: randomWord, inline: true },
                        { name: '💰 Result', value: 'Both players refunded', inline: true }
                    )
                    .setTimestamp();

                interaction.channel.send({ embeds: [timeoutEmbed] });
            }
        });
    }, delay);
}

// Start Number Duel game
async function startNumberDuelGame(interaction, gameId, game) {
    const targetNumber = Math.floor(Math.random() * 100) + 1;
    game.targetNumber = targetNumber;

    const embed = new EmbedBuilder()
        .setTitle('🎯 Number Duel Battle!')
        .setColor('#9b59b6')
        .setDescription(`**${game.player1Name}** vs **${game.player2Name}**`)
        .addFields(
            { name: '💰 Total Pot', value: `🍯${game.amount * 2}`, inline: true },
            { name: '🎯 How to Play', value: `**DM the bot your guess:** \`!play ${gameId} [1-100]\``, inline: false },
            { name: '📋 Rules', value: 'Closest to the secret number wins!', inline: false },
            { name: '📩 Important', value: 'Both players must send their guesses via **Direct Message**!', inline: false }
        )
        .setFooter({ text: 'Good luck guessing the secret number!' })
        .setTimestamp();

    interaction.channel.send({ embeds: [embed] });

    // Send DM instructions to both players
    try {
        const player1 = await interaction.client.users.fetch(game.player1);
        const player2 = await interaction.client.users.fetch(game.player2);

        const dmEmbed = new EmbedBuilder()
            .setTitle('🎯 Number Duel - Your Turn!')
            .setColor('#9b59b6')
            .setDescription(`Send your guess: \`!play ${gameId} [number]\``)
            .addFields(
                { name: '🎯 Range', value: '1 to 100', inline: true },
                { name: '💰 Pot', value: `🍯${game.amount * 2}`, inline: true }
            )
            .setFooter({ text: 'Closest to the secret number wins!' });

        await player1.send({ embeds: [dmEmbed] });
        await player2.send({ embeds: [dmEmbed] });
    } catch (error) {
        console.log('Could not send DM to one or both players');
    }
}

// Resolve RPS game
async function resolveRPSGame(client, gameId, game) {
    const move1 = game.moves[game.player1];
    const move2 = game.moves[game.player2];
    const validMoves = ['rock', 'paper', 'scissors'];

    // Validate moves
    if (!validMoves.includes(move1) || !validMoves.includes(move2)) {
        // One or both moves are invalid or missing
        const channel = client.channels.cache.get(game.channelId);
        channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('⚔️ Rock Paper Scissors Error')
                    .setColor('#e74c3c')
                    .setDescription('Game could not be resolved due to invalid or missing moves.')
            ]
        });
        activeGames.delete(gameId);
        return;
    }

    let result;
    if (move1 === move2) {
        result = 'tie';
    } else if (
        (move1 === 'rock' && move2 === 'scissors') ||
        (move1 === 'paper' && move2 === 'rock') ||
        (move1 === 'scissors' && move2 === 'paper')
    ) {
        result = 'player1';
    } else {
        result = 'player2';
    }

    const channel = client.channels.cache.get(game.channelId);
    const moveEmojis = { rock: '🪨', paper: '📄', scissors: '✂️' };

    if (result === 'tie') {
        await updateBobbyBucks(game.player1, game.amount);
        await updateBobbyBucks(game.player2, game.amount);
        const embed = new EmbedBuilder()
            .setTitle('⚔️ Rock Paper Scissors - TIE!')
            .setColor('#95a5a6')
            .setDescription('Both players chose the same move!')
            .addFields(
                { name: game.player1Name, value: `${moveEmojis[move1]} ${move1}`, inline: true },
                { name: game.player2Name, value: `${moveEmojis[move2]} ${move2}`, inline: true },
                { name: '💰 Result', value: 'Both players refunded!', inline: false }
            );
        channel.send({ embeds: [embed] });
    } else {
        const winner = result === 'player1' ? game.player1 : game.player2;
        const winnerName = result === 'player1' ? game.player1Name : game.player2Name;
        const houseCut = Math.floor(game.amount * 2 * 0.05);
        const winnings = (game.amount * 2) - houseCut;

        await updateBobbyBucks(winner, winnings);
        await updateHouse(houseCut);

        const embed = new EmbedBuilder()
            .setTitle('⚔️ Rock Paper Scissors Results!')
            .setColor('#2ecc71')
            .setDescription(`**${winnerName}** wins the battle!`)
            .addFields(
                { name: game.player1Name, value: `${moveEmojis[move1]} ${move1}`, inline: true },
                { name: game.player2Name, value: `${moveEmojis[move2]} ${move2}`, inline: true },
                { name: '💰 Winnings', value: `🍯${winnings} (after 5% house cut)`, inline: false }
            );

        channel.send({ embeds: [embed] });
    }

    activeGames.delete(gameId);
}

// Resolve Number Duel game
async function resolveNumberDuelGame(client, gameId, game) {
    const guess1 = game.moves[game.player1];
    const guess2 = game.moves[game.player2];
    const target = game.targetNumber;

    const diff1 = Math.abs(guess1 - target);
    const diff2 = Math.abs(guess2 - target);

    const channel = client.channels.cache.get(game.channelId);

    if (diff1 === diff2) {
        await updateBobbyBucks(game.player1, game.amount);
        await updateBobbyBucks(game.player2, game.amount);

        const embed = new EmbedBuilder()
            .setTitle('🎯 Number Duel - TIE!')
            .setColor('#95a5a6')
            .setDescription('Both players were equally close!')
            .addFields(
                { name: '🎯 Target Number', value: target.toString(), inline: true },
                { name: game.player1Name, value: `${guess1} (off by ${diff1})`, inline: true },
                { name: game.player2Name, value: `${guess2} (off by ${diff2})`, inline: true },
                { name: '💰 Result', value: 'Both players refunded!', inline: false }
            );

        channel.send({ embeds: [embed] });
    } else {
        const winner = diff1 < diff2 ? game.player1 : game.player2;
        const winnerName = diff1 < diff2 ? game.player1Name : game.player2Name;
        const houseCut = Math.floor(game.amount * 2 * 0.05);
        const winnings = (game.amount * 2) - houseCut;

        await updateBobbyBucks(winner, winnings);
        await updateHouse(houseCut);

        const embed = new EmbedBuilder()
            .setTitle('🎯 Number Duel Results!')
            .setColor('#2ecc71')
            .setDescription(`**${winnerName}** had the closest guess!`)
            .addFields(
                { name: '🎯 Target Number', value: target.toString(), inline: true },
                { name: game.player1Name, value: `${guess1} (off by ${diff1})`, inline: true },
                { name: game.player2Name, value: `${guess2} (off by ${diff2})`, inline: true },
                { name: '💰 Winnings', value: `🍯${winnings} (after 5% house cut)`, inline: false }
            );

        channel.send({ embeds: [embed] });
    }

    activeGames.delete(gameId);
}

// List current challenges
async function listChallenges(message) {
    const currentChallenges = Array.from(challenges.entries());

    if (currentChallenges.length === 0) {
        return message.channel.send("No active challenges right now! Create one with !rps, !highercard, !quickdraw, or !numberduel");
    }

    const embed = new EmbedBuilder()
        .setTitle('🎲 Active Challenges')
        .setColor('#3498db')
        .setDescription('Accept challenges by clicking their buttons!');

    for (const [id, challenge] of currentChallenges) {
        const gameNames = {
            rps: '⚔️ Rock Paper Scissors',
            highercard: '🃏 Higher Card',
            quickdraw: '⚡ Quick Draw',
            numberduel: '🎯 Number Duel'
        };

        embed.addFields({
            name: gameNames[challenge.type],
            value: `**By:** ${challenge.creatorName}\n**Bet:** 🍯${challenge.amount}\n**Status:** Click button to accept`,
            inline: true
        });
    }

    message.channel.send({ embeds: [embed] });
}

// Create animated coin flip visualization
async function createCoinFlipAnimation(result, playerName, betAmount, winnings) {
    const canvas = createCanvas(400, 300);
    const ctx = canvas.getContext('2d');

    // Casino background
    const gradient = ctx.createRadialGradient(200, 150, 0, 200, 150, 200);
    gradient.addColorStop(0, '#2c1810');
    gradient.addColorStop(1, '#1a0f08');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 400, 300);

    // Table felt
    ctx.fillStyle = '#0f5132';
    ctx.fillRect(0, 200, 400, 100);

    // Title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('ðŸª™ COIN FLIP', 200, 30);

    // Player info
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial';
    ctx.fillText(`${playerName} - Bet: 🍯${betAmount}`, 200, 50);

    // Coin
    ctx.save();
    ctx.translate(200, 120);

    // Coin shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(5, 85, 35, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Coin body
    const coinGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 50);
    coinGradient.addColorStop(0, '#ffd700');
    coinGradient.addColorStop(1, '#daa520');
    ctx.fillStyle = coinGradient;
    ctx.beginPath();
    ctx.arc(0, 0, 50, 0, Math.PI * 2);
    ctx.fill();

    // Coin border
    ctx.strokeStyle = '#b8860b';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Coin face
    ctx.fillStyle = '#8b4513';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    if (result === 'heads') {
        ctx.fillText('👑', 0, 8);
        ctx.font = '12px Arial';
        ctx.fillText('HEADS', 0, 25);
    } else {
        ctx.fillText('🏛️', 0, 8);
        ctx.font = '12px Arial';
        ctx.fillText('TAILS', 0, 25);
    }

    ctx.restore();

    // Result text
    const isWin = winnings > 0;
    ctx.fillStyle = isWin ? '#00ff00' : '#ff0000';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(isWin ? `YOU WIN 🍯${winnings}!` : `YOU LOSE 🍯${Math.abs(winnings)}!`, 200, 250);

    return canvas;
}

// Create roulette wheel visualization
async function createRouletteWheel(chosenNumber, chosenColor, userChoice, playerName, betAmount, winnings) {
    const canvas = createCanvas(500, 400);
    const ctx = canvas.getContext('2d');

    // Background
    const gradient = ctx.createRadialGradient(250, 200, 0, 250, 200, 250);
    gradient.addColorStop(0, '#2c1810');
    gradient.addColorStop(1, '#1a0f08');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 500, 400);

    // Title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎰 ROULETTE WHEEL', 250, 30);

    // Player info
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px Arial';
    ctx.fillText(`${playerName} bet 🍯${betAmount} on ${userChoice.toUpperCase()}`, 250, 50);

    // Roulette wheel base
    ctx.save();
    ctx.translate(250, 180);

    // Outer rim
    ctx.fillStyle = '#8b4513';
    ctx.beginPath();
    ctx.arc(0, 0, 120, 0, Math.PI * 2);
    ctx.fill();

    // Inner wheel
    ctx.fillStyle = '#2f2f2f';
    ctx.beginPath();
    ctx.arc(0, 0, 100, 0, Math.PI * 2);
    ctx.fill();

    // Roulette numbers (simplified)
    const numbers = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    for (let i = 0; i < 37; i++) {
        const angle = (i / 37) * Math.PI * 2;
        const isRed = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36].includes(numbers[i]);
        const isWinning = numbers[i] === chosenNumber;

        ctx.save();
        ctx.rotate(angle);

        // Segment
        ctx.fillStyle = numbers[i] === 0 ? '#00ff00' : (isRed ? '#ff0000' : '#000000');
        if (isWinning) {
            ctx.fillStyle = '#ffd700'; // Highlight winning number
        }
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 90, -Math.PI / 37, Math.PI / 37);
        ctx.closePath();
        ctx.fill();

        // Number text
        ctx.fillStyle = isWinning ? '#000000' : '#ffffff';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(numbers[i].toString(), 0, -70);

        ctx.restore();
    }

    // Center hub
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();

    // Ball
    ctx.fillStyle = '#ffffff';
    const ballAngle = (numbers.indexOf(chosenNumber) / 37) * Math.PI * 2;
    const ballX = Math.cos(ballAngle) * 75;
    const ballY = Math.sin(ballAngle) * 75;
    ctx.beginPath();
    ctx.arc(ballX, ballY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Result
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Winning: ${chosenColor.toUpperCase()} ${chosenNumber}`, 250, 320);

    const isWin = winnings > 0;
    ctx.fillStyle = isWin ? '#00ff00' : '#ff0000';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(isWin ? `YOU WIN 🍯${winnings}!` : `YOU LOSE 🍯${Math.abs(winnings)}!`, 250, 350);

    return canvas;
}

// Create dice visualization
async function createDiceRoll(diceResult, userGuess, playerName, betAmount, winnings) {
    const canvas = createCanvas(400, 300);
    const ctx = canvas.getContext('2d');

    // Background
    const gradient = ctx.createRadialGradient(200, 150, 0, 200, 150, 200);
    gradient.addColorStop(0, '#2c1810');
    gradient.addColorStop(1, '#1a0f08');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 400, 300);

    // Table
    ctx.fillStyle = '#0f5132';
    ctx.fillRect(0, 200, 400, 100);

    // Title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎲 DICE ROLL', 200, 30);

    // Player info
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial';
    ctx.fillText(`${playerName} guessed ${userGuess} - Bet: 🍯${betAmount}`, 200, 50);

    // Dice
    ctx.save();
    ctx.translate(200, 120);

    // Dice shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(-25, 75, 50, 10);

    // Dice body
    const diceGradient = ctx.createLinearGradient(-25, -25, 25, 25);
    diceGradient.addColorStop(0, '#ffffff');
    diceGradient.addColorStop(1, '#e0e0e0');
    ctx.fillStyle = diceGradient;
    ctx.fillRect(-25, -25, 50, 50);

    // Dice border
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 2;
    ctx.strokeRect(-25, -25, 50, 50);

    // Dice dots
    ctx.fillStyle = '#000000';
    const dotPositions = {
        1: [[0, 0]],
        2: [[-10, -10], [10, 10]],
        3: [[-10, -10], [0, 0], [10, 10]],
        4: [[-10, -10], [10, -10], [-10, 10], [10, 10]],
        5: [[-10, -10], [10, -10], [0, 0], [-10, 10], [10, 10]],
        6: [[-10, -10], [10, -10], [-10, 0], [10, 0], [-10, 10], [10, 10]]
    };

    dotPositions[diceResult].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.restore();

    // Result
    const isWin = winnings > 0;
    ctx.fillStyle = isWin ? '#00ff00' : '#ff0000';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(isWin ? `YOU WIN 🍯${winnings}!` : `YOU LOSE 🍯${Math.abs(winnings)}!`, 200, 250);

    return canvas;
}

async function playFlipGame(message, args) {
    if (args.length !== 2 || isNaN(parseInt(args[1], 10)) || parseInt(args[1], 10) <= 0) {
        return message.channel.send("Incorrect usage! Correct syntax: !flip [positive amount]");
    }

    const betAmount = parseInt(args[1], 10);
    const userId = message.author.id;
    const balance = await getBobbyBucks(userId);

    if (balance < betAmount) {
        return message.channel.send(`Sorry, ${message.author.username}, you don't have enough Honey. Your balance is 🍯${balance}.`);
    }

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const winnings = result === 'heads' ? betAmount * 2 : 0;
    const netGain = winnings - betAmount;

    await updateBobbyBucks(userId, netGain);
    await updateHouse(-netGain);

    // Create visual
    const coinCanvas = await createCoinFlipAnimation(result, message.author.username, betAmount, netGain);
    const attachment = new AttachmentBuilder(coinCanvas.toBuffer(), { name: 'coin-flip.png' });

    const embed = new EmbedBuilder()
        .setTitle('ðŸª™ Coin Flip Casino')
        .setColor(result === 'heads' ? '#ffd700' : '#ff4500')
        .setDescription(`**${message.author.username}** flipped the coin!`)
        .setImage('attachment://coin-flip.png')
        .addFields(
            { name: '🎯 Result', value: `**${result.toUpperCase()}**`, inline: true },
            { name: '💰 Outcome', value: netGain > 0 ? `Won 🍯${netGain}` : `Lost 🍯${Math.abs(netGain)}`, inline: true },
            { name: 'ðŸ¦ New Balance', value: `🍯${await getBobbyBucks(userId)}`, inline: true }
        )
        .setFooter({ text: result === 'heads' ? '🍀 Lady Luck smiles upon you!' : '😔 Better luck next time!' })
        .setTimestamp();

    return message.channel.send({ embeds: [embed], files: [attachment] });
}

async function playRouletteGame(message, args) {
    if (args.length !== 3 || isNaN(parseInt(args[1], 10)) || (!['red', 'black'].includes(args[2].toLowerCase()) && (isNaN(parseInt(args[2], 10)) || parseInt(args[2], 10) < 0 || parseInt(args[2], 10) > 36)) || parseInt(args[1], 10) <= 0) {
        return message.channel.send("Incorrect usage! Correct syntax: !roulette [positive amount] [red/black/0-36]");
    }

    const betAmount = parseInt(args[1], 10);
    const userId = message.author.id;
    const balance = await getBobbyBucks(userId);

    if (balance < betAmount) {
        return message.channel.send(`Sorry, ${message.author.username}, you don't have enough Honey. Your balance is 🍯${balance}.`);
    }

    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    const chosenNumber = Math.floor(Math.random() * 37); // 0-36
    const chosenColor = chosenNumber === 0 ? 'green' : (redNumbers.includes(chosenNumber) ? 'red' : 'black');
    const userChoice = args[2].toLowerCase();

    let winnings = 0;
    if (userChoice === chosenColor && chosenNumber !== 0) winnings = betAmount * 2;
    if (userChoice === String(chosenNumber)) winnings = betAmount * 36;

    const netGain = winnings - betAmount;
    await updateBobbyBucks(userId, netGain);
    await updateHouse(-netGain);

    // Create visual
    const rouletteCanvas = await createRouletteWheel(chosenNumber, chosenColor, userChoice, message.author.username, betAmount, netGain);
    const attachment = new AttachmentBuilder(rouletteCanvas.toBuffer(), { name: 'roulette-wheel.png' });

    const embed = new EmbedBuilder()
        .setTitle('🎰 Roulette Casino')
        .setColor(chosenColor === 'red' ? '#ff0000' : chosenColor === 'black' ? '#2c2c2c' : '#00ff00')
        .setDescription(`**${message.author.username}** spun the wheel!`)
        .setImage('attachment://roulette-wheel.png')
        .addFields(
            { name: '🎯 Result', value: `**${chosenColor.toUpperCase()} ${chosenNumber}**`, inline: true },
            { name: '🎲 Your Bet', value: `**${userChoice.toUpperCase()}**`, inline: true },
            { name: '💰 Outcome', value: netGain > 0 ? `Won 🍯${netGain}` : `Lost 🍯${Math.abs(netGain)}`, inline: true }
        )
        .addFields(
            { name: 'ðŸ¦ New Balance', value: `🍯${await getBobbyBucks(userId)}`, inline: true },
            { name: '🏛️ House Edge', value: `🍯${await getHouseBalance()}`, inline: true },
            { name: '🎰 Payout Rate', value: userChoice === String(chosenNumber) ? '36:1' : '2:1', inline: true }
        )
        .setFooter({ text: netGain > 0 ? '🎉 The wheel of fortune favors you!' : '🎲 The house always wins... sometimes!' })
        .setTimestamp();

    return message.channel.send({ embeds: [embed], files: [attachment] });
}

async function playDiceGame(message, args) {
    if (args.length !== 3 || isNaN(parseInt(args[1], 10)) || isNaN(parseInt(args[2], 10)) || parseInt(args[2], 10) < 1 || parseInt(args[2], 10) > 6 || parseInt(args[1], 10) <= 0) {
        return message.channel.send("Incorrect usage! Correct syntax: !dice [positive amount] [guess (1-6)]");
    }

    const betAmount = parseInt(args[1], 10);
    const userId = message.author.id;
    const balance = await getBobbyBucks(userId);

    if (balance < betAmount) {
        return message.channel.send(`Sorry, ${message.author.username}, you don't have enough Honey. Your balance is 🍯${balance}.`);
    }

    const diceRoll = Math.ceil(Math.random() * 6);
    const userGuess = parseInt(args[2], 10);
    const winnings = userGuess === diceRoll ? betAmount * 6 : 0;
    const netGain = winnings - betAmount;

    await updateBobbyBucks(userId, netGain);
    await updateHouse(-netGain);

    // Create visual
    const diceCanvas = await createDiceRoll(diceRoll, userGuess, message.author.username, betAmount, netGain);
    const attachment = new AttachmentBuilder(diceCanvas.toBuffer(), { name: 'dice-roll.png' });

    const embed = new EmbedBuilder()
        .setTitle('🎲 Dice Roll Casino')
        .setColor(netGain > 0 ? '#00ff00' : '#ff0000')
        .setDescription(`**${message.author.username}** rolled the dice!`)
        .setImage('attachment://dice-roll.png')
        .addFields(
            { name: '🎯 Roll Result', value: `**${diceRoll}**`, inline: true },
            { name: '🎲 Your Guess', value: `**${userGuess}**`, inline: true },
            { name: '🎰 Match?', value: userGuess === diceRoll ? '✅ **WINNER!**' : '❌ **Miss**', inline: true }
        )
        .addFields(
            { name: '💰 Outcome', value: netGain > 0 ? `Won 🍯${netGain}` : `Lost 🍯${Math.abs(netGain)}`, inline: true },
            { name: 'ðŸ¦ New Balance', value: `🍯${await getBobbyBucks(userId)}`, inline: true },
            { name: '📊 Odds', value: '1 in 6 (16.7%)', inline: true }
        )
        .setFooter({ text: netGain > 0 ? '🎉 Perfect prediction! You nailed it!' : '🎲 Close call! Try again!' })
        .setTimestamp();

    return message.channel.send({ embeds: [embed], files: [attachment] });
}
