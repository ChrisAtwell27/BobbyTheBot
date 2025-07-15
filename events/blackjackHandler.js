const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

const eggBucksFilePath = path.join(__dirname, '../data/bobby_bucks.txt');
const houseFilePath = path.join(__dirname, '../data/house.txt');

// Card and game visual constants
const CARD_WIDTH = 100;
const CARD_HEIGHT = 140;
const CARD_SPACING = 20;
const CANVAS_PADDING = 30;

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const args = message.content.split(' ');

        // Blackjack game
        if (args[0] === '!blackjack') {
            if (args.length !== 2 || isNaN(parseInt(args[1], 10)) || parseInt(args[1], 10) <= 0) {
                return message.channel.send("Incorrect usage! Correct syntax: !blackjack [positive amount]");
            }

            const betAmount = parseInt(args[1], 10);
            const userId = message.author.id;
            const balance = getEggBucks(userId);

            if (balance < betAmount) {
                return message.channel.send(`Sorry, ${message.author.username}, you don't have enough Egg Bucks. Your balance is E$${balance}.`);
            }

            startBlackjackGame(message, userId, betAmount);
        }
    });

    // Create visual card representation
    function createCardImage(card, isHidden = false) {
        const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
        const ctx = canvas.getContext('2d');

        if (isHidden) {
            // Card back design
            const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
            gradient.addColorStop(0, '#1a1a2e');
            gradient.addColorStop(0.5, '#16213e');
            gradient.addColorStop(1, '#0f0f23');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
            
            // Border
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 3;
            ctx.strokeRect(3, 3, CARD_WIDTH - 6, CARD_HEIGHT - 6);
            
            // Pattern
            ctx.fillStyle = '#ffd700';
            ctx.font = '20px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🎰', CARD_WIDTH / 2, CARD_HEIGHT / 2 + 7);
            
            return canvas;
        }

        // Card face
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        
        // Border
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, CARD_WIDTH - 2, CARD_HEIGHT - 2);
        
        // Card color based on suit
        const isRed = card.suit === 'Hearts' || card.suit === 'Diamonds';
        ctx.fillStyle = isRed ? '#dc143c' : '#000000';
        
        // Suit symbols
        const suitSymbols = {
            'Hearts': '♥',
            'Diamonds': '♦',
            'Clubs': '♣',
            'Spades': '♠'
        };
        
        // Value and suit in corners
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(card.value, 8, 20);
        ctx.font = '14px Arial';
        ctx.fillText(suitSymbols[card.suit], 8, 35);
        
        // Large center symbol
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(suitSymbols[card.suit], CARD_WIDTH / 2, CARD_HEIGHT / 2 + 15);
        
        // Value in center
        ctx.font = 'bold 24px Arial';
        ctx.fillText(card.value, CARD_WIDTH / 2, CARD_HEIGHT / 2 - 10);
        
        // Rotated value and suit in opposite corner
        ctx.save();
        ctx.translate(CARD_WIDTH - 8, CARD_HEIGHT - 8);
        ctx.rotate(Math.PI);
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(card.value, 0, 16);
        ctx.font = '14px Arial';
        ctx.fillText(suitSymbols[card.suit], 0, 31);
        ctx.restore();
        
        return canvas;
    }

    // Create game table visualization
    async function createGameTable(playerHand, dealerHand, playerScore, dealerScore, gameState, playerName, betAmount) {
        const totalWidth = Math.max(
            (playerHand.length * (CARD_WIDTH + CARD_SPACING)) - CARD_SPACING,
            (dealerHand.length * (CARD_WIDTH + CARD_SPACING)) - CARD_SPACING
        ) + (CANVAS_PADDING * 2);
        
        const canvas = createCanvas(Math.max(totalWidth, 600), 400);
        const ctx = canvas.getContext('2d');
        
        // Casino table background
        const gradient = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width / 2);
        gradient.addColorStop(0, '#0f5132');
        gradient.addColorStop(1, '#0a3d2a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Table felt texture
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        for (let i = 0; i < canvas.width; i += 20) {
            for (let j = 0; j < canvas.height; j += 20) {
                ctx.fillRect(i, j, 1, 1);
            }
        }
        
        // Title
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🎰 BLACKJACK TABLE 🎰', canvas.width / 2, 30);
        
        // Dealer section
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('DEALER', 30, 70);
        ctx.fillText(`Total: ${gameState === 'playing' ? '?' : dealerScore}`, 30, 90);
        
        // Draw dealer cards
        const dealerStartX = (canvas.width - (dealerHand.length * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING)) / 2;
        for (let i = 0; i < dealerHand.length; i++) {
            const cardCanvas = createCardImage(dealerHand[i], gameState === 'playing' && i === 1);
            ctx.drawImage(cardCanvas, dealerStartX + i * (CARD_WIDTH + CARD_SPACING), 100);
        }
        
        // Player section
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`${playerName.toUpperCase()}`, 30, 250);
        ctx.fillText(`Total: ${playerScore}`, 30, 270);
        ctx.fillText(`Bet: E$${betAmount}`, 30, 290);
        
        // Draw player cards
        const playerStartX = (canvas.width - (playerHand.length * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING)) / 2;
        for (let i = 0; i < playerHand.length; i++) {
            const cardCanvas = createCardImage(playerHand[i]);
            ctx.drawImage(cardCanvas, playerStartX + i * (CARD_WIDTH + CARD_SPACING), 280);
        }
        
        // Game status
        if (gameState !== 'playing') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 36px Arial';
            ctx.textAlign = 'center';
            
            let statusText = '';
            if (gameState === 'bust') statusText = 'BUST!';
            else if (gameState === 'win') statusText = 'YOU WIN!';
            else if (gameState === 'lose') statusText = 'DEALER WINS!';
            else if (gameState === 'tie') statusText = 'TIE!';
            
            ctx.fillText(statusText, canvas.width / 2, canvas.height / 2);
        }
        
        return canvas;
    }

    async function startBlackjackGame(message, userId, betAmount) {
        // CRITICAL FIX: Deduct the initial bet from player's balance when game starts
        updateEggBucks(userId, -betAmount);
        
        const deck = createDeck();
        shuffle(deck);

        const playerHand = [drawCard(deck), drawCard(deck)];
        const dealerHand = [drawCard(deck), drawCard(deck)];

        let playerScore = calculateHandValue(playerHand);
        let dealerScore = calculateHandValue(dealerHand);

        // Create initial game visualization
        const gameCanvas = await createGameTable(
            playerHand, 
            dealerHand, 
            playerScore, 
            dealerScore, 
            'playing',
            message.author.username,
            betAmount
        );
        
        const attachment = new AttachmentBuilder(gameCanvas.toBuffer(), { name: 'blackjack-table.png' });

        let gameEmbed = new EmbedBuilder()
            .setTitle('🎰 Casino Blackjack')
            .setColor('#0f5132')
            .setDescription(`**${message.author.username}** is playing Blackjack!\n**Bet:** E$${betAmount}`)
            .setImage('attachment://blackjack-table.png')
            .addFields(
                { name: '🎯 Your Hand', value: `${displayHandEmoji(playerHand)}\n**Score:** ${playerScore}`, inline: true },
                { name: '🎭 Dealer\'s Hand', value: `${displayHandEmoji([dealerHand[0]])} 🎴\n**Score:** ${calculateHandValue([dealerHand[0]])} + ?`, inline: true },
                { name: '💰 Game Info', value: `**Your Balance:** E$${getEggBucks(userId)}\n**House Edge:** ${getHouseBalance()}`, inline: true }
            )
            .setFooter({ text: 'Choose your action wisely! 🎲' })
            .setTimestamp();

        // Check for natural blackjack
        if (playerScore === 21) {
            if (dealerScore === 21) {
                // Tie - return the bet
                updateEggBucks(userId, betAmount);
                
                const finalCanvas = await createGameTable(playerHand, dealerHand, playerScore, dealerScore, 'tie', message.author.username, betAmount);
                const finalAttachment = new AttachmentBuilder(finalCanvas.toBuffer(), { name: 'blackjack-result.png' });
                
                gameEmbed = new EmbedBuilder()
                    .setTitle('🎰 Blackjack - Push!')
                    .setColor('#ffaa00')
                    .setDescription(`Both you and the dealer have blackjack! It's a tie!`)
                    .setImage('attachment://blackjack-result.png')
                    .addFields(
                        { name: '🎯 Final Result', value: `**You:** ${playerScore}\n**Dealer:** ${dealerScore}`, inline: true },
                        { name: '💰 Payout', value: `**Returned:** E$${betAmount}`, inline: true }
                    )
                    .setFooter({ text: 'Your bet has been returned!' })
                    .setTimestamp();
                
                return message.channel.send({ embeds: [gameEmbed], files: [finalAttachment] });
            } else {
                // Player blackjack wins - pay 3:2
                const winnings = Math.floor(betAmount * 2.5);
                updateEggBucks(userId, winnings);
                
                const finalCanvas = await createGameTable(playerHand, dealerHand, playerScore, dealerScore, 'win', message.author.username, betAmount);
                const finalAttachment = new AttachmentBuilder(finalCanvas.toBuffer(), { name: 'blackjack-result.png' });
                
                gameEmbed = new EmbedBuilder()
                    .setTitle('🎰 Blackjack - Natural 21!')
                    .setColor('#00ff00')
                    .setDescription(`🎉 BLACKJACK! You got a natural 21!`)
                    .setImage('attachment://blackjack-result.png')
                    .addFields(
                        { name: '🎯 Final Result', value: `**You:** ${playerScore}\n**Dealer:** ${dealerScore}`, inline: true },
                        { name: '💰 Payout', value: `**Won:** E$${winnings}\n**New Balance:** E$${getEggBucks(userId)}`, inline: true }
                    )
                    .setFooter({ text: 'Blackjack pays 3:2!' })
                    .setTimestamp();
                
                return message.channel.send({ embeds: [gameEmbed], files: [finalAttachment] });
            }
        }

        const hitButton = new ButtonBuilder()
            .setCustomId('hit')
            .setLabel('Hit')
            .setStyle('Success')
            .setEmoji('🎯');

        const standButton = new ButtonBuilder()
            .setCustomId('stand')
            .setLabel('Stand')
            .setStyle('Primary')
            .setEmoji('✋');

        const doubleButton = new ButtonBuilder()
            .setCustomId('double')
            .setLabel('Double Down')
            .setStyle('Secondary')
            .setEmoji('⚡')
            .setDisabled(getEggBucks(userId) < betAmount);

        const row = new ActionRowBuilder().addComponents(hitButton, standButton, doubleButton);

        const gameMessage = await message.channel.send({ embeds: [gameEmbed], files: [attachment], components: [row] });

        const filter = (i) => i.user.id === userId;
        const collector = gameMessage.createMessageComponentCollector({ filter, time: 120000 });

        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'hit') {
                playerHand.push(drawCard(deck));
                playerScore = calculateHandValue(playerHand);

                if (playerScore > 21) {
                    // Player busts - house keeps the bet (already deducted)
                    updateHouse(betAmount);
                    
                    const finalCanvas = await createGameTable(playerHand, dealerHand, playerScore, dealerScore, 'bust', message.author.username, betAmount);
                    const finalAttachment = new AttachmentBuilder(finalCanvas.toBuffer(), { name: 'blackjack-result.png' });
                    
                    gameEmbed = new EmbedBuilder()
                        .setTitle('🎰 Blackjack - Bust!')
                        .setColor('#ff0000')
                        .setDescription(`💥 You busted with ${playerScore}!`)
                        .setImage('attachment://blackjack-result.png')
                        .addFields(
                            { name: '🎯 Final Result', value: `**You:** ${playerScore} (BUST)\n**Dealer:** ${calculateHandValue([dealerHand[0]])} + ?`, inline: true },
                            { name: '💰 Loss', value: `**Lost:** E$${betAmount}\n**New Balance:** E$${getEggBucks(userId)}`, inline: true }
                        )
                        .setFooter({ text: 'Better luck next time!' })
                        .setTimestamp();
                    
                    collector.stop();
                    await interaction.update({ embeds: [gameEmbed], files: [finalAttachment], components: [] });
                } else {
                    // Update game state
                    const updatedCanvas = await createGameTable(playerHand, dealerHand, playerScore, dealerScore, 'playing', message.author.username, betAmount);
                    const updatedAttachment = new AttachmentBuilder(updatedCanvas.toBuffer(), { name: 'blackjack-table.png' });
                    
                    gameEmbed = new EmbedBuilder()
                        .setTitle('🎰 Casino Blackjack')
                        .setColor('#0f5132')
                        .setDescription(`**${message.author.username}** is playing Blackjack!\n**Bet:** E$${betAmount}`)
                        .setImage('attachment://blackjack-table.png')
                        .addFields(
                            { name: '🎯 Your Hand', value: `${displayHandEmoji(playerHand)}\n**Score:** ${playerScore}`, inline: true },
                            { name: '🎭 Dealer\'s Hand', value: `${displayHandEmoji([dealerHand[0]])} 🎴\n**Score:** ${calculateHandValue([dealerHand[0]])} + ?`, inline: true },
                            { name: '💰 Game Info', value: `**Your Balance:** E$${getEggBucks(userId)}\n**House Edge:** ${getHouseBalance()}`, inline: true }
                        )
                        .setFooter({ text: 'Choose your action wisely! 🎲' })
                        .setTimestamp();
                    
                    await interaction.update({ embeds: [gameEmbed], files: [updatedAttachment] });
                }
            } else if (interaction.customId === 'stand' || interaction.customId === 'double') {
                let actualBet = betAmount;
                
                if (interaction.customId === 'double') {
                    actualBet = betAmount * 2;
                    updateEggBucks(userId, -betAmount); // Take the extra bet
                    playerHand.push(drawCard(deck));
                    playerScore = calculateHandValue(playerHand);
                    
                    if (playerScore > 21) {
                        // Player busts after doubling - house keeps both bets
                        updateHouse(actualBet);
                        
                        const finalCanvas = await createGameTable(playerHand, dealerHand, playerScore, dealerScore, 'bust', message.author.username, actualBet);
                        const finalAttachment = new AttachmentBuilder(finalCanvas.toBuffer(), { name: 'blackjack-result.png' });
                        
                        gameEmbed = new EmbedBuilder()
                            .setTitle('🎰 Blackjack - Double Down Bust!')
                            .setColor('#ff0000')
                            .setDescription(`💥 You doubled down and busted with ${playerScore}!`)
                            .setImage('attachment://blackjack-result.png')
                            .addFields(
                                { name: '🎯 Final Result', value: `**You:** ${playerScore} (BUST)\n**Dealer:** ${calculateHandValue([dealerHand[0]])} + ?`, inline: true },
                                { name: '💰 Loss', value: `**Lost:** E$${actualBet}\n**New Balance:** E$${getEggBucks(userId)}`, inline: true }
                            )
                            .setFooter({ text: 'Double down gone wrong!' })
                            .setTimestamp();
                        
                        collector.stop();
                        await interaction.update({ embeds: [gameEmbed], files: [finalAttachment], components: [] });
                        return;
                    }
                }

                // Dealer plays
                while (dealerScore < 17) {
                    dealerHand.push(drawCard(deck));
                    dealerScore = calculateHandValue(dealerHand);
                }

                let resultMessage = '';
                let resultColor = '#ffaa00';
                let gameState = 'tie';
                
                if (dealerScore > 21 || playerScore > dealerScore) {
                    // Player wins - pay 2:1 (bet + winnings)
                    const winnings = actualBet * 2;
                    updateEggBucks(userId, winnings);
                    resultMessage = `🎉 You won E$${winnings}!`;
                    resultColor = '#00ff00';
                    gameState = 'win';
                } else if (playerScore === dealerScore) {
                    // Tie - return the bet
                    updateEggBucks(userId, actualBet);
                    resultMessage = `🤝 It's a tie! You get your E$${actualBet} back.`;
                    resultColor = '#ffaa00';
                    gameState = 'tie';
                } else {
                    // Dealer wins - house keeps the bet (already deducted)
                    updateHouse(actualBet);
                    resultMessage = `😢 You lost E$${actualBet}. Better luck next time!`;
                    resultColor = '#ff0000';
                    gameState = 'lose';
                }

                const finalCanvas = await createGameTable(playerHand, dealerHand, playerScore, dealerScore, gameState, message.author.username, actualBet);
                const finalAttachment = new AttachmentBuilder(finalCanvas.toBuffer(), { name: 'blackjack-result.png' });
                
                gameEmbed = new EmbedBuilder()
                    .setTitle('🎰 Blackjack - Game Over!')
                    .setColor(resultColor)
                    .setDescription(resultMessage)
                    .setImage('attachment://blackjack-result.png')
                    .addFields(
                        { name: '🎯 Final Result', value: `**You:** ${playerScore}\n**Dealer:** ${dealerScore}`, inline: true },
                        { name: '💰 Your Stats', value: `**New Balance:** E$${getEggBucks(userId)}\n**House Balance:** E$${getHouseBalance()}`, inline: true }
                    )
                    .setFooter({ text: 'Thanks for playing! 🎲' })
                    .setTimestamp();

                collector.stop();
                await interaction.update({ embeds: [gameEmbed], files: [finalAttachment], components: [] });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                await gameMessage.edit({ 
                    components: [],
                    embeds: [gameEmbed.setFooter({ text: 'Game timed out! ⏰' })]
                });
            }
        });
    }

    function createDeck() {
        const suits = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
        const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        const deck = [];
        for (const suit of suits) {
            for (const value of values) {
                deck.push({ suit, value });
            }
        }
        return deck;
    }

    function shuffle(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }

    function drawCard(deck) {
        return deck.pop();
    }

    function calculateHandValue(hand) {
        let value = 0;
        let aces = 0;
        for (const card of hand) {
            if (['J', 'Q', 'K'].includes(card.value)) {
                value += 10;
            } else if (card.value === 'A') {
                aces += 1;
                value += 11;
            } else {
                value += parseInt(card.value, 10);
            }
        }
        while (value > 21 && aces) {
            value -= 10;
            aces -= 1;
        }
        return value;
    }

    function displayHand(hand) {
        return hand.map(card => `${card.value} of ${card.suit}`).join(', ');
    }

    function displayHandEmoji(hand) {
        const suitEmojis = {
            'Hearts': '♥️',
            'Diamonds': '♦️',
            'Clubs': '♣️',
            'Spades': '♠️'
        };
        return hand.map(card => `${card.value}${suitEmojis[card.suit]}`).join(' ');
    }

    // Functions to handle Egg Bucks
    function getEggBucks(userId) {
        if (!fs.existsSync(eggBucksFilePath)) {
            fs.writeFileSync(eggBucksFilePath, '', 'utf-8');
        }
        const data = fs.readFileSync(eggBucksFilePath, 'utf-8');
        const userRecord = data.split('\n').find(line => line.startsWith(userId));
        return userRecord ? parseInt(userRecord.split(':')[1], 10) : 0;
    }

    function updateEggBucks(userId, amount) {
        let data = fs.readFileSync(eggBucksFilePath, 'utf-8');
        const userRecord = data.split('\n').find(line => line.startsWith(userId));
        if (userRecord) {
            const currentBalance = parseInt(userRecord.split(':')[1], 10);
            const newBalance = currentBalance + amount;
            data = data.replace(userRecord, `${userId}:${newBalance}`);
        } else {
            data += `${userId}:${amount}\n`;
        }
        fs.writeFileSync(eggBucksFilePath, data, 'utf-8');
    }

    // Functions to handle the House
    function getHouseBalance() {
        if (!fs.existsSync(houseFilePath)) {
            fs.writeFileSync(houseFilePath, '0', 'utf-8');
        }
        return parseInt(fs.readFileSync(houseFilePath, 'utf-8'), 10);
    }

    function updateHouse(amount) {
        const houseBalance = getHouseBalance();
        const newBalance = houseBalance + amount;
        fs.writeFileSync(houseFilePath, newBalance.toString(), 'utf-8');
    }
};