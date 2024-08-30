const { ActionRowBuilder, ButtonBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const eggBucksFilePath = path.join(__dirname, '../data/egg_bucks.txt');
const houseFilePath = path.join(__dirname, '../data/house.txt');

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

    async function startBlackjackGame(message, userId, betAmount) {
        const deck = createDeck();
        shuffle(deck);

        const playerHand = [drawCard(deck), drawCard(deck)];
        const dealerHand = [drawCard(deck), drawCard(deck)];

        let playerScore = calculateHandValue(playerHand);
        let dealerScore = calculateHandValue(dealerHand);

        let gameEmbed = new EmbedBuilder()
            .setTitle('Blackjack')
            .setColor('#228B22')
            .addFields(
                { name: 'Your Hand', value: `${displayHand(playerHand)}\nTotal: ${playerScore}`, inline: true },
                { name: 'Dealer\'s Hand', value: `${displayHand([dealerHand[0]])} [Hidden]`, inline: true }
            )
            .setFooter({ text: 'Do you want to hit or stand?' });

        const hitButton = new ButtonBuilder()
            .setCustomId('hit')
            .setLabel('Hit')
            .setStyle('Success');  // Corrected here

        const standButton = new ButtonBuilder()
            .setCustomId('stand')
            .setLabel('Stand')
            .setStyle('Danger');  // Corrected here

        const row = new ActionRowBuilder().addComponents(hitButton, standButton);

        const gameMessage = await message.channel.send({ embeds: [gameEmbed], components: [row] });

        const filter = (i) => i.user.id === userId;
        const collector = gameMessage.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'hit') {
                playerHand.push(drawCard(deck));
                playerScore = calculateHandValue(playerHand);

                if (playerScore > 21) {
                    updateEggBucks(userId, -betAmount);
                    updateHouse(betAmount);
                    collector.stop('bust');
                } else {
                    await interaction.update({
                        embeds: [
                            gameEmbed
                                .setFields(
                                    { name: 'Your Hand', value: `${displayHand(playerHand)}\nTotal: ${playerScore}`, inline: true },
                                    { name: 'Dealer\'s Hand', value: `${displayHand([dealerHand[0]])} [Hidden]`, inline: true }
                                )
                        ]
                    });
                }
            } else if (interaction.customId === 'stand') {
                while (dealerScore < 17) {
                    dealerHand.push(drawCard(deck));
                    dealerScore = calculateHandValue(dealerHand);
                }

                let resultMessage = '';
                if (dealerScore > 21 || playerScore > dealerScore) {
                    const winnings = betAmount * 2;
                    updateEggBucks(userId, winnings);
                    resultMessage = `Congratulations! You won E$${winnings}.`;
                } else if (playerScore === dealerScore) {
                    resultMessage = `It's a tie! You get your E$${betAmount} back.`;
                } else {
                    updateEggBucks(userId, -betAmount);
                    updateHouse(betAmount);
                    resultMessage = `You lost E$${betAmount}. Better luck next time!`;
                }

                collector.stop();
                await interaction.update({
                    embeds: [
                        gameEmbed
                            .setFields(
                                { name: 'Your Hand', value: `${displayHand(playerHand)}\nTotal: ${playerScore}`, inline: true },
                                { name: 'Dealer\'s Hand', value: `${displayHand(dealerHand)}\nTotal: ${dealerScore}`, inline: true }
                            )
                            .setFooter({ text: resultMessage })
                    ],
                    components: []
                });
            }
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                gameMessage.edit({ components: [] });
                message.channel.send('Time is up! The game has ended.');
            } else if (reason === 'bust') {
                gameMessage.edit({
                    embeds: [
                        gameEmbed
                            .setFields(
                                { name: 'Your Hand', value: `${displayHand(playerHand)}\nTotal: ${playerScore}`, inline: true },
                                { name: 'Dealer\'s Hand', value: `${displayHand(dealerHand)}\nTotal: ${dealerScore}`, inline: true }
                            )
                            .setFooter({ text: `You busted! You lost E$${betAmount}.` })
                    ],
                    components: []
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
