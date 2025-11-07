const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const https = require('https');
const { getBobbyBucks, updateBobbyBucks } = require('../database/helpers/economyHelpers');
const { TARGET_GUILD_ID } = require('../config/guildConfig');
const { CleanupMap, LimitedMap } = require('../utils/memoryUtils');

// Store active poker lobbies and games (with auto-cleanup and size limits)
const activeLobbies = new CleanupMap(10 * 60 * 1000, 2 * 60 * 1000); // Auto-cleanup after 10 min
const activeGames = new LimitedMap(30); // Max 30 concurrent poker games

// Configuration
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const LOBBY_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const ACTION_TIMEOUT = 60 * 1000; // 60 seconds per action
const MIN_BUY_IN = 50;
const MAX_BUY_IN = 10000;

// Card definitions
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

// Hand rankings
const HAND_RANKINGS = {
    'HIGH_CARD': 1,
    'PAIR': 2,
    'TWO_PAIR': 3,
    'THREE_KIND': 4,
    'STRAIGHT': 5,
    'FLUSH': 6,
    'FULL_HOUSE': 7,
    'FOUR_KIND': 8,
    'STRAIGHT_FLUSH': 9,
    'ROYAL_FLUSH': 10
};

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

// Deck and card functions
function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ suit, rank });
        }
    }
    return shuffleDeck(deck);
}

function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Simplified hand evaluation
function evaluateHand(cards) {
    if (cards.length < 5) return { ranking: 'HIGH_CARD', value: 0, description: 'Invalid hand' };
    
    const allCombinations = getCombinations(cards, 5);
    let bestHand = { ranking: 'HIGH_CARD', value: 0 };
    
    for (const combination of allCombinations) {
        const handResult = evaluateFiveCards(combination);
        if (handResult.value > bestHand.value) {
            bestHand = handResult;
            bestHand.cards = combination;
        }
    }
    
    return bestHand;
}

function getCombinations(arr, k) {
    if (k === 1) return arr.map(item => [item]);
    const combinations = [];
    for (let i = 0; i < arr.length - k + 1; i++) {
        const head = arr[i];
        const tailCombinations = getCombinations(arr.slice(i + 1), k - 1);
        for (const tail of tailCombinations) {
            combinations.push([head, ...tail]);
        }
    }
    return combinations;
}

function evaluateFiveCards(cards) {
    const ranks = cards.map(card => card.rank);
    const suits = cards.map(card => card.suit);
    const rankCounts = {};
    const rankValues = cards.map(card => RANK_VALUES[card.rank]).sort((a, b) => b - a);
    
    // Count ranks
    ranks.forEach(rank => {
        rankCounts[rank] = (rankCounts[rank] || 0) + 1;
    });
    
    const counts = Object.values(rankCounts).sort((a, b) => b - a);
    const isFlush = suits.every(suit => suit === suits[0]);
    const isStraight = checkStraight(rankValues);
    const isRoyalStraight = rankValues.join(',') === '14,13,12,11,10';
    
    // Royal Flush
    if (isFlush && isRoyalStraight) {
        return { ranking: 'ROYAL_FLUSH', value: HAND_RANKINGS.ROYAL_FLUSH * 1000000, description: 'Royal Flush' };
    }
    
    // Straight Flush
    if (isFlush && isStraight) {
        return { ranking: 'STRAIGHT_FLUSH', value: HAND_RANKINGS.STRAIGHT_FLUSH * 1000000, description: 'Straight Flush' };
    }
    
    // Four of a Kind
    if (counts[0] === 4) {
        const fourKind = Object.keys(rankCounts).find(rank => rankCounts[rank] === 4);
        return { ranking: 'FOUR_KIND', value: HAND_RANKINGS.FOUR_KIND * 1000000, description: `Four ${fourKind}s` };
    }
    
    // Full House
    if (counts[0] === 3 && counts[1] === 2) {
        const threeKind = Object.keys(rankCounts).find(rank => rankCounts[rank] === 3);
        const pair = Object.keys(rankCounts).find(rank => rankCounts[rank] === 2);
        return { ranking: 'FULL_HOUSE', value: HAND_RANKINGS.FULL_HOUSE * 1000000, description: `${threeKind}s full of ${pair}s` };
    }
    
    // Flush
    if (isFlush) {
        return { ranking: 'FLUSH', value: HAND_RANKINGS.FLUSH * 1000000, description: `${suits[0]} Flush` };
    }
    
    // Straight
    if (isStraight) {
        return { ranking: 'STRAIGHT', value: HAND_RANKINGS.STRAIGHT * 1000000, description: 'Straight' };
    }
    
    // Three of a Kind
    if (counts[0] === 3) {
        const threeKind = Object.keys(rankCounts).find(rank => rankCounts[rank] === 3);
        return { ranking: 'THREE_KIND', value: HAND_RANKINGS.THREE_KIND * 1000000, description: `Three ${threeKind}s` };
    }
    
    // Two Pair
    if (counts[0] === 2 && counts[1] === 2) {
        return { ranking: 'TWO_PAIR', value: HAND_RANKINGS.TWO_PAIR * 1000000, description: 'Two Pair' };
    }
    
    // One Pair
    if (counts[0] === 2) {
        const pair = Object.keys(rankCounts).find(rank => rankCounts[rank] === 2);
        return { ranking: 'PAIR', value: HAND_RANKINGS.PAIR * 1000000, description: `Pair of ${pair}s` };
    }
    
    // High Card
    const highCard = Object.keys(RANK_VALUES).find(k => RANK_VALUES[k] === rankValues[0]);
    return { ranking: 'HIGH_CARD', value: HAND_RANKINGS.HIGH_CARD * 1000000, description: `${highCard} High` };
}

function checkStraight(sortedValues) {
    // Check normal straight
    for (let i = 0; i < sortedValues.length - 1; i++) {
        if (sortedValues[i] - sortedValues[i + 1] !== 1) {
            // Check for Ace-low straight (A,5,4,3,2)
            if (sortedValues.join(',') === '14,5,4,3,2') {
                return true;
            }
            return false;
        }
    }
    return true;
}

// Simple poker table visualization
async function createPokerTableVisualization(game) {
    const canvas = createCanvas(700, 500);
    const ctx = canvas.getContext('2d');
    
    // Background
    const gradient = ctx.createRadialGradient(350, 250, 0, 350, 250, 350);
    gradient.addColorStop(0, '#0d4a0d');
    gradient.addColorStop(1, '#062506');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 700, 500);
    
    // Table
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(100, 150, 500, 200);
    ctx.fillStyle = '#0d4a0d';
    ctx.fillRect(120, 170, 460, 160);
    
    // Title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🃏 TEXAS HOLD\'EM 🃏', 350, 40);
    
    // Game info
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(`Pot: ??{game.pot.toLocaleString()} | Round: ${game.bettingRound.toUpperCase()}`, 350, 70);
    
    // Community cards
    const cardWidth = 40;
    const cardHeight = 56;
    const cardSpacing = 50;
    const startX = 350 - (cardSpacing * 2);
    
    for (let i = 0; i < 5; i++) {
        const x = startX + (i * cardSpacing);
        const y = 200;
        
        if (i < game.communityCards.length) {
            drawCard(ctx, game.communityCards[i], x, y, cardWidth, cardHeight);
        } else {
            drawCardBack(ctx, x, y, cardWidth, cardHeight);
        }
    }
    
    // Community cards label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.fillText('COMMUNITY CARDS', 350, 280);
    
    // Players around table
    const positions = [
        { x: 350, y: 400 }, // Bottom
        { x: 500, y: 350 }, // Right
        { x: 500, y: 150 }, // Top right
        { x: 350, y: 100 }, // Top
        { x: 200, y: 150 }, // Top left
        { x: 200, y: 350 }  // Left
    ];
    
    for (let i = 0; i < Math.min(game.players.length, positions.length); i++) {
        const pos = positions[i];
        const player = game.players[i];
        
        if (player) {
            // Player background
            let bgColor = '#4a4a4a';
            if (game.currentPlayerIndex === i) bgColor = '#ffd700';
            else if (player.status === 'folded') bgColor = '#ff4444';
            else if (player.status === 'all-in') bgColor = '#ff8800';
            
            ctx.fillStyle = bgColor;
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 25, 0, Math.PI * 2);
            ctx.fill();
            
            // Player avatar placeholder
            ctx.fillStyle = '#ffffff';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('👤', pos.x, pos.y + 5);
            
            // Player info
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px Arial';
            const displayName = player.displayName || player.username;
            const truncatedName = displayName.length > 8 ? 
                displayName.substring(0, 8) + '...' : displayName;
            ctx.fillText(truncatedName, pos.x, pos.y + 35);
            
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 9px Arial';
            ctx.fillText(`??{player.chips.toLocaleString()}`, pos.x, pos.y + 47);
            
            if (player.currentBet > 0) {
                ctx.fillStyle = '#00ff00';
                ctx.font = 'bold 8px Arial';
                ctx.fillText(`Bet: ??{player.currentBet}`, pos.x, pos.y + 58);
            }
            
            // Dealer button
            if (game.dealerIndex === i) {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(pos.x + 20, pos.y - 15, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000000';
                ctx.font = 'bold 8px Arial';
                ctx.fillText('D', pos.x + 20, pos.y - 11);
            }
        }
    }
    
    // Current action info
    if (game.currentPlayerIndex !== -1 && game.players[game.currentPlayerIndex]) {
        const currentPlayer = game.players[game.currentPlayerIndex];
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${currentPlayer.displayName || currentPlayer.username}'s turn`, 350, 450);
        
        const callAmount = game.currentBet - currentPlayer.currentBet;
        if (callAmount > 0) {
            ctx.fillStyle = '#ffff00';
            ctx.font = '12px Arial';
            ctx.fillText(`To call: ??{callAmount.toLocaleString()}`, 350, 470);
        }
    }
    
    return canvas.toBuffer();
}

function drawCard(ctx, card, x, y, width, height) {
    // Card background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, width, height);
    
    // Card border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
    
    // Card content
    const isRed = card.suit === '♥' || card.suit === '♦';
    ctx.fillStyle = isRed ? '#ff0000' : '#000000';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    
    // Rank
    ctx.fillText(card.rank, x + width/2, y + 12);
    
    // Suit
    ctx.font = '12px Arial';
    ctx.fillText(card.suit, x + width/2, y + height - 8);
}

function drawCardBack(ctx, x, y, width, height) {
    // Card background
    ctx.fillStyle = '#4444aa';
    ctx.fillRect(x, y, width, height);
    
    // Card border
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
    
    // Pattern
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('?', x + width/2, y + height/2 + 5);
}

// Create hand view for ephemeral responses
function createHandView(player, communityCards) {
    let handText = `**Your Hand:**\n${player.holeCards[0].rank}${player.holeCards[0].suit} ${player.holeCards[1].rank}${player.holeCards[1].suit}\n\n`;
    
    if (communityCards.length > 0) {
        handText += `**Community Cards:**\n${communityCards.map(card => `${card.rank}${card.suit}`).join(' ')}\n\n`;
        
        // Evaluate best hand
        const allCards = [...player.holeCards, ...communityCards];
        if (allCards.length >= 5) {
            const bestHand = evaluateHand(allCards);
            handText += `**Best Hand:** ${bestHand.description}`;
        }
    }
    
    return handText;
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // Only run in target guild
        if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

        if (!message.guild) return;

        // EARLY RETURN: Skip if not a poker command
        const content = message.content.toLowerCase();
        if (!content.startsWith('!poker') && !content.startsWith('!holdem')) return;

        const args = message.content.split(' ');
        const command = args[0].toLowerCase();

        // Create poker lobby
        if (command === '!poker' || command === '!holdem') {
            const userId = message.author.id;
            const userBalance = await getBobbyBucks(userId);
            
            // Parse buy-in amount
            let buyIn = parseInt(args[1]) || 100;
            if (buyIn < MIN_BUY_IN) buyIn = MIN_BUY_IN;
            if (buyIn > MAX_BUY_IN) buyIn = MAX_BUY_IN;
            
            // Check if user has enough money
            if (userBalance < buyIn) {
                return message.channel.send({
                    embeds: [new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('❌ Insufficient Funds')
                        .setDescription(`You need at least ??{buyIn.toLocaleString()} to create this poker table!\nYour balance: ??{userBalance.toLocaleString()}`)
                        .setTimestamp()]
                });
            }

            // Check if there's already an active lobby in this channel
            const existingLobby = Array.from(activeLobbies.values())
                .find(lobby => lobby.channelId === message.channel.id);
            
            if (existingLobby) {
                return message.channel.send({
                    embeds: [new EmbedBuilder()
                        .setColor('#ff6b6b')
                        .setTitle('🃏 Poker Table Already Active')
                        .setDescription('There is already a poker table in this channel!')
                        .setTimestamp()]
                });
            }

            // Create new lobby
            const lobbyId = `poker_${Date.now()}_${userId}`;
            const lobby = {
                id: lobbyId,
                channelId: message.channel.id,
                messageId: null,
                ownerId: userId,
                buyIn: buyIn,
                players: [{
                    id: userId,
                    username: message.author.username,
                    displayName: message.author.displayName || message.author.username,
                    chips: buyIn
                }],
                createdAt: Date.now(),
                gameStarted: false
            };

            // Deduct buy-in from creator
            await updateBobbyBucks(userId, -buyIn);

            // Create lobby embed and buttons
            const embed = createLobbyEmbed(lobby);
            const components = createLobbyButtons(lobbyId, false);

            try {
                const lobbyMessage = await message.channel.send({
                    embeds: [embed],
                    components: [components]
                });

                lobby.messageId = lobbyMessage.id;
                activeLobbies.set(lobbyId, lobby);

                // Auto-delete lobby after timeout
                setTimeout(async () => {
                    const currentLobby = activeLobbies.get(lobbyId);
                    if (currentLobby && !currentLobby.gameStarted) {
                        // Refund all players
                        for (const player of currentLobby.players) {
                            await updateBobbyBucks(player.id, currentLobby.buyIn);
                        }

                        activeLobbies.delete(lobbyId);

                        client.channels.fetch(currentLobby.channelId).then(channel => {
                            channel.messages.fetch(currentLobby.messageId).then(msg => {
                                const timeoutEmbed = new EmbedBuilder()
                                    .setColor('#666666')
                                    .setTitle('⏰ Poker Lobby Expired')
                                    .setDescription('The lobby timed out. All buy-ins have been refunded.')
                                    .setTimestamp();

                                msg.edit({
                                    embeds: [timeoutEmbed],
                                    components: []
                                }).catch(() => {});
                            }).catch(() => {});
                        }).catch(() => {});
                    }
                }, LOBBY_TIMEOUT);

            } catch (error) {
                console.error('Error creating poker lobby:', error);
                await updateBobbyBucks(userId, buyIn); // Refund on error
            }
        }
    });

    // Handle button interactions
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        const parts = interaction.customId.split('_');
        const action = parts[0];
        
        // Lobby actions
        const lobbyActions = ['pokerjoin', 'pokerleave', 'pokerstart'];
        // Game actions
        const gameActions = ['pokerfold', 'pokercall', 'pokercheck', 'pokerraise', 'pokerallin', 'pokerview'];
        
        if (lobbyActions.includes(action)) {
            await handleLobbyAction(interaction, action, parts);
        } else if (gameActions.includes(action)) {
            await handleGameAction(interaction, action, parts);
        }
    });

    // Handle lobby actions
    async function handleLobbyAction(interaction, action, parts) {
        const lobbyId = parts.slice(1).join('_');
        const lobby = activeLobbies.get(lobbyId);

        if (!lobby) {
            return interaction.reply({
                content: '❌ This poker lobby is no longer active.',
                ephemeral: true
            });
        }

        const userId = interaction.user.id;
        const userBalance = await getBobbyBucks(userId);

        if (action === 'pokerjoin') {
            if (lobby.players.some(player => player.id === userId)) {
                return interaction.reply({
                    content: '❌ You are already in this poker table!',
                    ephemeral: true
                });
            }

            if (lobby.players.length >= MAX_PLAYERS) {
                return interaction.reply({
                    content: '❌ This poker table is full!',
                    ephemeral: true
                });
            }

            if (userBalance < lobby.buyIn) {
                return interaction.reply({
                    content: `❌ You need ??{lobby.buyIn.toLocaleString()} to join this table!`,
                    ephemeral: true
                });
            }

            // Add player to lobby
            lobby.players.push({
                id: userId,
                username: interaction.user.username,
                displayName: interaction.user.displayName || interaction.user.username,
                chips: lobby.buyIn
            });

            await updateBobbyBucks(userId, -lobby.buyIn);

            const canStart = lobby.players.length >= MIN_PLAYERS;
            const embed = createLobbyEmbed(lobby);
            const components = createLobbyButtons(lobbyId, canStart);

            await interaction.update({
                embeds: [embed],
                components: [components]
            });

        } else if (action === 'pokerleave') {
            const playerIndex = lobby.players.findIndex(player => player.id === userId);
            if (playerIndex === -1) {
                return interaction.reply({
                    content: '❌ You are not in this poker table!',
                    ephemeral: true
                });
            }

            await updateBobbyBucks(userId, lobby.buyIn); // Refund
            lobby.players.splice(playerIndex, 1);

            if (lobby.ownerId === userId && lobby.players.length > 0) {
                lobby.ownerId = lobby.players[0].id;
            }

            if (lobby.players.length === 0) {
                activeLobbies.delete(lobbyId);
                const emptyEmbed = new EmbedBuilder()
                    .setColor('#666666')
                    .setTitle('🃏 Poker Table Closed')
                    .setDescription('All players have left.')
                    .setTimestamp();
                
                return interaction.update({
                    embeds: [emptyEmbed],
                    components: []
                });
            }

            const canStart = lobby.players.length >= MIN_PLAYERS;
            const embed = createLobbyEmbed(lobby);
            const components = createLobbyButtons(lobbyId, canStart);

            await interaction.update({
                embeds: [embed],
                components: [components]
            });

        } else if (action === 'pokerstart') {
            if (lobby.ownerId !== userId) {
                return interaction.reply({
                    content: '❌ Only the table owner can start the game!',
                    ephemeral: true
                });
            }

            if (lobby.players.length < MIN_PLAYERS) {
                return interaction.reply({
                    content: `❌ Need at least ${MIN_PLAYERS} players to start poker!`,
                    ephemeral: true
                });
            }

            await startPokerGame(interaction, lobby);
        }
    }

    // Handle game actions
    async function handleGameAction(interaction, action, parts) {
        const gameId = parts.slice(1).join('_');
        const game = activeGames.get(gameId);

        if (!game) {
            return interaction.reply({
                content: '❌ This poker game is no longer active.',
                ephemeral: true
            });
        }

        const userId = interaction.user.id;
        const playerIndex = game.players.findIndex(p => p && p.id === userId);

        if (playerIndex === -1) {
            return interaction.reply({
                content: '❌ You are not in this poker game!',
                ephemeral: true
            });
        }

        // Handle view hand action (always available)
        if (action === 'pokerview') {
            const player = game.players[playerIndex];
            const handText = createHandView(player, game.communityCards);
            
            const handEmbed = new EmbedBuilder()
                .setColor('#0066cc')
                .setTitle('🃏 Your Hand')
                .setDescription(handText)
                .addFields(
                    { name: '💰 Your Chips', value: `??{player.chips.toLocaleString()}`, inline: true },
                    { name: '🎯 Current Bet', value: `??{player.currentBet.toLocaleString()}`, inline: true },
                    { name: '🏆 Pot', value: `??{game.pot.toLocaleString()}`, inline: true }
                )
                .setTimestamp();

            return interaction.reply({
                embeds: [handEmbed],
                ephemeral: true
            });
        }

        // Other actions require it to be player's turn
        if (game.currentPlayerIndex !== playerIndex) {
            return interaction.reply({
                content: '❌ It\'s not your turn!',
                ephemeral: true
            });
        }

        const player = game.players[playerIndex];
        const callAmount = game.currentBet - player.currentBet;

        if (action === 'pokerfold') {
            player.status = 'folded';
            await nextPlayer(game);
            await updateGameDisplay(interaction, game);

        } else if (action === 'pokercall') {
            if (callAmount > player.chips) {
                return interaction.reply({
                    content: '❌ You don\'t have enough chips to call! Try All-In instead.',
                    ephemeral: true
                });
            }
            
            player.chips -= callAmount;
            player.currentBet += callAmount;
            game.pot += callAmount;
            
            if (player.chips === 0) {
                player.status = 'all-in';
            }
            
            await nextPlayer(game);
            await updateGameDisplay(interaction, game);

        } else if (action === 'pokercheck') {
            if (callAmount > 0) {
                return interaction.reply({
                    content: '❌ You cannot check, you must call or fold!',
                    ephemeral: true
                });
            }
            
            await nextPlayer(game);
            await updateGameDisplay(interaction, game);

        } else if (action === 'pokerraise') {
            const minRaise = Math.max(game.currentBet * 2, game.currentBet + game.bigBlind);
            const raiseAmount = Math.min(minRaise, player.chips + player.currentBet);
            
            if (raiseAmount <= game.currentBet) {
                return interaction.reply({
                    content: '❌ You don\'t have enough chips to raise!',
                    ephemeral: true
                });
            }
            
            const totalToPut = raiseAmount - player.currentBet;
            player.chips -= totalToPut;
            player.currentBet = raiseAmount;
            game.pot += totalToPut;
            game.currentBet = raiseAmount;
            
            if (player.chips === 0) {
                player.status = 'all-in';
            }
            
            game.lastRaiserIndex = playerIndex;
            await nextPlayer(game);
            await updateGameDisplay(interaction, game);

        } else if (action === 'pokerallin') {
            const allInAmount = player.chips + player.currentBet;
            const additionalAmount = player.chips;
            
            player.chips = 0;
            player.currentBet = allInAmount;
            player.status = 'all-in';
            game.pot += additionalAmount;
            
            if (allInAmount > game.currentBet) {
                game.currentBet = allInAmount;
                game.lastRaiserIndex = playerIndex;
            }
            
            await nextPlayer(game);
            await updateGameDisplay(interaction, game);
        }
    }

    // Start poker game
    async function startPokerGame(interaction, lobby) {
        const gameId = lobby.id;
        const game = {
            id: gameId,
            channelId: lobby.channelId,
            messageId: lobby.messageId,
            buyIn: lobby.buyIn,
            players: [...lobby.players],
            deck: createDeck(),
            communityCards: [],
            pot: 0,
            currentBet: 0,
            smallBlind: Math.max(5, Math.floor(lobby.buyIn / 20)),
            bigBlind: Math.max(10, Math.floor(lobby.buyIn / 10)),
            dealerIndex: 0,
            currentPlayerIndex: -1,
            lastRaiserIndex: -1,
            bettingRound: 'preflop',
            handCount: 0
        };

        // Initialize players
        game.players.forEach(player => {
            player.holeCards = [];
            player.currentBet = 0;
            player.status = 'active';
        });

        activeGames.set(gameId, game);
        activeLobbies.delete(lobby.id);

        await startNewHand(game);
        await updateGameDisplay(interaction, game);
    }

    // Start new hand
    async function startNewHand(game) {
        game.handCount++;
        game.deck = createDeck();
        game.communityCards = [];
        game.pot = 0;
        game.currentBet = game.bigBlind;
        game.bettingRound = 'preflop';
        
        // Reset players
        game.players.forEach(player => {
            if (player) {
                player.holeCards = [];
                player.currentBet = 0;
                player.status = player.chips > 0 ? 'active' : 'eliminated';
            }
        });

        // Remove eliminated players
        game.players = game.players.filter(player => player && player.chips > 0);

        if (game.players.length < 2) {
            await endGame(game);
            return;
        }

        // Post blinds
        const smallBlindIndex = (game.dealerIndex + 1) % game.players.length;
        const bigBlindIndex = (game.dealerIndex + 2) % game.players.length;

        const smallBlindPlayer = game.players[smallBlindIndex];
        const bigBlindPlayer = game.players[bigBlindIndex];

        // Small blind
        const smallBlindAmount = Math.min(game.smallBlind, smallBlindPlayer.chips);
        smallBlindPlayer.chips -= smallBlindAmount;
        smallBlindPlayer.currentBet = smallBlindAmount;
        game.pot += smallBlindAmount;

        // Big blind
        const bigBlindAmount = Math.min(game.bigBlind, bigBlindPlayer.chips);
        bigBlindPlayer.chips -= bigBlindAmount;
        bigBlindPlayer.currentBet = bigBlindAmount;
        game.pot += bigBlindAmount;

        // Deal hole cards
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < game.players.length; j++) {
                game.players[j].holeCards.push(game.deck.pop());
            }
        }

        // Set current player
        game.currentPlayerIndex = (bigBlindIndex + 1) % game.players.length;
        game.lastRaiserIndex = bigBlindIndex;

        // Skip non-active players
        while (game.players[game.currentPlayerIndex].status !== 'active') {
            game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
        }
    }

    // Next player logic
    async function nextPlayer(game) {
        const startingPlayer = game.currentPlayerIndex;
        
        do {
            game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
            
            // Check if betting round is complete
            if (game.currentPlayerIndex === (game.lastRaiserIndex + 1) % game.players.length || 
                game.players.filter(p => p.status === 'active').length <= 1) {
                
                await nextBettingRound(game);
                return;
            }
        } while (game.players[game.currentPlayerIndex].status !== 'active' && 
                 game.currentPlayerIndex !== startingPlayer);
    }

    // Next betting round
    async function nextBettingRound(game) {
        // Reset betting
        game.players.forEach(player => {
            if (player) player.currentBet = 0;
        });
        game.currentBet = 0;

        if (game.bettingRound === 'preflop') {
            // Deal flop
            game.deck.pop(); // Burn card
            for (let i = 0; i < 3; i++) {
                game.communityCards.push(game.deck.pop());
            }
            game.bettingRound = 'flop';
        } else if (game.bettingRound === 'flop') {
            // Deal turn
            game.deck.pop(); // Burn card
            game.communityCards.push(game.deck.pop());
            game.bettingRound = 'turn';
        } else if (game.bettingRound === 'turn') {
            // Deal river
            game.deck.pop(); // Burn card
            game.communityCards.push(game.deck.pop());
            game.bettingRound = 'river';
        } else {
            // Showdown
            await showdown(game);
            return;
        }

        // Set current player
        game.currentPlayerIndex = (game.dealerIndex + 1) % game.players.length;
        while (game.players[game.currentPlayerIndex].status !== 'active') {
            game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
        }
        
        game.lastRaiserIndex = -1;
    }

    // Showdown
    async function showdown(game) {
        const activePlayers = game.players.filter(p => p.status !== 'folded' && p.status !== 'eliminated');
        
        if (activePlayers.length === 1) {
            // Only one player left
            const winner = activePlayers[0];
            winner.chips += game.pot;
            
            await displayHandResult(game, [{ player: winner, winnings: game.pot, hand: { description: 'Won by default' } }]);
        } else {
            // Evaluate hands
            const playerHands = activePlayers.map(player => {
                const allCards = [...player.holeCards, ...game.communityCards];
                const hand = evaluateHand(allCards);
                return { player, hand };
            });

            // Sort by hand strength
            playerHands.sort((a, b) => b.hand.value - a.hand.value);

            // Determine winners
            const winners = [];
            const bestValue = playerHands[0].hand.value;
            
            for (const playerHand of playerHands) {
                if (playerHand.hand.value === bestValue) {
                    winners.push(playerHand);
                } else {
                    break;
                }
            }

            // Distribute pot
            const winningsPerPlayer = Math.floor(game.pot / winners.length);
            winners.forEach(winner => {
                winner.player.chips += winningsPerPlayer;
                winner.winnings = winningsPerPlayer;
            });

            await displayHandResult(game, winners);
        }

        // Start next hand after delay
        setTimeout(async () => {
            game.dealerIndex = (game.dealerIndex + 1) % game.players.length;
            await startNewHand(game);
            
            try {
                const channel = await client.channels.fetch(game.channelId);
                const message = await channel.messages.fetch(game.messageId);
                const embed = await createGameEmbed(game);
                const components = createGameButtons(game.id);
                await message.edit({
                    embeds: [embed.embed],
                    files: embed.files,
                    components: components
                });
            } catch (error) {
                console.error('Error starting next hand:', error);
            }
        }, 8000);
    }

    // Display hand result
    async function displayHandResult(game, winners) {
        try {
            const channel = await client.channels.fetch(game.channelId);
            
            const resultEmbed = new EmbedBuilder()
                .setColor('#ffd700')
                .setTitle('🏆 Hand Complete!')
                .setDescription(winners.length === 1 ? 
                    `**${winners[0].player.displayName || winners[0].player.username}** wins ??{winners[0].winnings.toLocaleString()}!` :
                    `**Split pot** between ${winners.length} players!`)
                .addFields(
                    { name: '💰 Pot', value: `??{game.pot.toLocaleString()}`, inline: true },
                    { name: '🃏 Winning Hand', value: winners[0].hand.description, inline: true },
                    { name: '⏰ Next Hand', value: 'Starting in 8 seconds...', inline: true }
                );

            // Show all hands if multiple players
            if (game.players.filter(p => p.status !== 'folded').length > 1) {
                const handsText = game.players
                    .filter(p => p.status !== 'folded')
                    .map(p => {
                        const hand = evaluateHand([...p.holeCards, ...game.communityCards]);
                        return `**${p.displayName || p.username}:** ${p.holeCards[0].rank}${p.holeCards[0].suit} ${p.holeCards[1].rank}${p.holeCards[1].suit} - ${hand.description}`;
                    })
                    .join('\n');
                
                resultEmbed.addFields({ name: '📋 All Hands', value: handsText, inline: false });
            }

            await channel.send({ embeds: [resultEmbed] });
        } catch (error) {
            console.error('Error displaying hand result:', error);
        }
    }

    // End game
    async function endGame(game) {
        try {
            const channel = await client.channels.fetch(game.channelId);
            const message = await channel.messages.fetch(game.messageId);
            
            const winner = game.players.sort((a, b) => b.chips - a.chips)[0];
            
            // Pay out chips as Honey
            for (const player of game.players) {
                if (player.chips > 0) {
                    await updateBobbyBucks(player.id, player.chips);
                }
            }

            const endEmbed = new EmbedBuilder()
                .setColor('#ffd700')
                .setTitle('🏁 Poker Game Complete!')
                .setDescription(`**${winner.displayName || winner.username}** wins the table with ??{winner.chips.toLocaleString()}!`)
                .addFields(
                    { name: '📊 Final Standings', value: game.players
                        .sort((a, b) => b.chips - a.chips)
                        .map((p, i) => `${i + 1}. ${p.displayName || p.username}: ??{p.chips.toLocaleString()}`)
                        .join('\n'), inline: false }
                )
                .setFooter({ text: 'All chips have been converted to Honey' })
                .setTimestamp();

            await message.edit({ 
                embeds: [endEmbed], 
                components: []
            });

        } catch (error) {
            console.error('Error ending game:', error);
        }

        activeGames.delete(game.id);
    }

    // Update game display
    async function updateGameDisplay(interaction, game) {
        const embed = await createGameEmbed(game);
        const components = createGameButtons(game.id);

        await interaction.update({
            embeds: [embed.embed],
            files: embed.files,
            components: components
        });
    }

    // Create lobby embed
    function createLobbyEmbed(lobby) {
        return new EmbedBuilder()
            .setColor('#0066cc')
            .setTitle('🃏 Poker Table Lobby')
            .setDescription(`**Texas Hold'em Poker**\nBuy-in: ??{lobby.buyIn.toLocaleString()}`)
            .addFields(
                { name: '👥 Players', value: `${lobby.players.length}/${MAX_PLAYERS}`, inline: true },
                { name: '📊 Required', value: `${MIN_PLAYERS}-${MAX_PLAYERS} players`, inline: true },
                { name: '🎭 Players at Table', value: lobby.players.length > 0 ? 
                    lobby.players.map((p, i) => `${i + 1}. ${p.displayName || p.username}`).join('\n') : 'None', inline: false }
            )
            .setFooter({ text: lobby.players.length >= MIN_PLAYERS ? 
                'Ready to play! Owner can start.' : `Need ${MIN_PLAYERS - lobby.players.length} more players.` })
            .setTimestamp();
    }

    // Create game embed
    async function createGameEmbed(game) {
        const tableImageBuffer = await createPokerTableVisualization(game);
        const attachment = new AttachmentBuilder(tableImageBuffer, { name: 'poker-table.png' });
        
        const activePlayers = game.players.filter(p => p.status !== 'folded' && p.status !== 'eliminated');
        const currentPlayer = game.currentPlayerIndex !== -1 ? game.players[game.currentPlayerIndex] : null;
        
        const embed = new EmbedBuilder()
            .setColor('#0066cc')
            .setTitle('🃏 Texas Hold\'em Poker')
            .setDescription(`**Hand #${game.handCount}** | **${game.bettingRound.toUpperCase()} Round**`)
            .setImage('attachment://poker-table.png')
            .addFields(
                { name: '💰 Pot', value: `??{game.pot.toLocaleString()}`, inline: true },
                { name: '🎯 Current Bet', value: `??{game.currentBet.toLocaleString()}`, inline: true },
                { name: '👥 Active', value: `${activePlayers.length}`, inline: true }
            );

        if (currentPlayer) {
            const callAmount = game.currentBet - currentPlayer.currentBet;
            embed.addFields({
                name: '⏰ Current Turn',
                value: `${currentPlayer.displayName || currentPlayer.username}\n${callAmount > 0 ? `To call: ??{callAmount}` : 'Can check'}`,
                inline: false
            });
        }

        return { embed, files: [attachment] };
    }

    // Create buttons
    function createLobbyButtons(lobbyId, canStart) {
        const joinButton = new ButtonBuilder()
            .setCustomId(`pokerjoin_${lobbyId}`)
            .setLabel('Join Table')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🪑');

        const leaveButton = new ButtonBuilder()
            .setCustomId(`pokerleave_${lobbyId}`)
            .setLabel('Leave Table')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🚪');

        const startButton = new ButtonBuilder()
            .setCustomId(`pokerstart_${lobbyId}`)
            .setLabel('START GAME')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🃏')
            .setDisabled(!canStart);

        return new ActionRowBuilder().addComponents(joinButton, leaveButton, startButton);
    }

    function createGameButtons(gameId) {
        const viewButton = new ButtonBuilder()
            .setCustomId(`pokerview_${gameId}`)
            .setLabel('View Hand')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('👀');

        const foldButton = new ButtonBuilder()
            .setCustomId(`pokerfold_${gameId}`)
            .setLabel('Fold')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗂️');

        const callButton = new ButtonBuilder()
            .setCustomId(`pokercall_${gameId}`)
            .setLabel('Call/Check')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅');

        const raiseButton = new ButtonBuilder()
            .setCustomId(`pokerraise_${gameId}`)
            .setLabel('Raise')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⬆️');

        const allInButton = new ButtonBuilder()
            .setCustomId(`pokerallin_${gameId}`)
            .setLabel('All-In')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💥');

        return [
            new ActionRowBuilder().addComponents(viewButton, foldButton, callButton),
            new ActionRowBuilder().addComponents(raiseButton, allInButton)
        ];
    }

    client.once('ready', () => {
        console.log('Poker Handler loaded! 🃏');
        activeLobbies.clear();
        activeGames.clear();
    });
};
