const fs = require('fs');
const path = require('path');
const eggBucksFilePath = path.join(__dirname, '../data/egg_bucks.txt');
const houseFilePath = path.join(__dirname, '../data/house.txt');
const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const args = message.content.split(' ');

        // List of all gambling games
        const games = {
            flip: "Flip a coin and multiply your bet by 1.5x if you win. Syntax: !flip [amount]",
            roulette: "Bet on red or black, or a specific number. Win big or lose it all! Syntax: !roulette [amount] [red/black/number]",
            dice: "Roll a dice and bet on the outcome. Syntax: !dice [amount] [guess (1-6)]",
            blackjack: "Classic game of blackjack. Dont go above 21!"
        };

        // Command to get a list of all games
        if (args[0] === '!gamble') {
            let gameList = "Available games:\n";
            for (let [game, description] of Object.entries(games)) {
                gameList += `**${game}**: ${description}\n`;
            }
            return message.channel.send(gameList);
        }

        // Coin flip game
        if (args[0] === '!flip') {
            if (args.length !== 2 || isNaN(parseInt(args[1], 10)) || parseInt(args[1], 10) <= 0) {
                return message.channel.send("Incorrect usage! Correct syntax: !flip [positive amount]");
            }

            const betAmount = parseInt(args[1], 10);
            const userId = message.author.id;
            const balance = getEggBucks(userId);

            if (balance < betAmount) {
                return message.channel.send(`Sorry, ${message.author.username}, you don't have enough Egg Bucks. Your balance is E$${balance}.`);
            }

            const result = Math.random() < 0.5 ? 'heads' : 'tails';
            const userChoice = Math.random() < 0.5 ? 'heads' : 'tails';

            if (userChoice === result) {
                const winnings = betAmount * 1.5;
                updateEggBucks(userId, winnings);
                message.channel.send(`Congratulations, ${message.author.username}! The coin landed on ${result}. You won E$${winnings}! Your new balance is E$${balance + winnings}.`);
            } else {
                updateEggBucks(userId, -betAmount);
                updateHouse(betAmount);
                message.channel.send(`Sorry, ${message.author.username}, the coin landed on ${result}. You lost E$${betAmount}. Your new balance is E$${balance - betAmount}.`);
            }
        }

        // Roulette game
        if (args[0] === '!roulette') {
            if (args.length !== 3 || isNaN(parseInt(args[1], 10)) || (!['red', 'black'].includes(args[2].toLowerCase()) && isNaN(parseInt(args[2], 10))) || parseInt(args[1], 10) <= 0) {
                return message.channel.send("Incorrect usage! Correct syntax: !roulette [positive amount] [red/black/number]");
            }

            const betAmount = parseInt(args[1], 10);
            const userId = message.author.id;
            const balance = getEggBucks(userId);

            if (balance < betAmount) {
                return message.channel.send(`Sorry, ${message.author.username}, you don't have enough Egg Bucks. Your balance is E$${balance}.`);
            }

            const colors = ['red', 'black'];
            const numbers = Array.from({ length: 36 }, (_, i) => i + 1);
            const chosenColor = colors[Math.floor(Math.random() * colors.length)];
            const chosenNumber = numbers[Math.floor(Math.random() * numbers.length)];
            const outcome = `${chosenColor} ${chosenNumber}`;
            const userChoice = args[2].toLowerCase();

            let winnings = 0;
            let winMessage = `The ball landed on ${outcome}. You lost E$${betAmount}.`;

            if (userChoice === chosenColor || userChoice === String(chosenNumber)) {
                if (userChoice === chosenColor) {
                    winnings = betAmount * 2;
                }
                if (userChoice === String(chosenNumber)) {
                    winnings = betAmount * 36;
                }
                updateEggBucks(userId, winnings);
                winMessage = `Congratulations, ${message.author.username}! The ball landed on ${outcome}. You won E$${winnings}! Your new balance is E$${balance + winnings}.`;
            } else {
                updateEggBucks(userId, -betAmount);
                updateHouse(betAmount);
            }

            message.channel.send(winMessage);
        }

        // Dice roll game
        if (args[0] === '!dice') {
            if (args.length !== 3 || isNaN(parseInt(args[1], 10)) || isNaN(parseInt(args[2], 10)) || parseInt(args[2], 10) < 1 || parseInt(args[2], 10) > 6 || parseInt(args[1], 10) <= 0) {
                return message.channel.send("Incorrect usage! Correct syntax: !dice [positive amount] [guess (1-6)]");
            }

            const betAmount = parseInt(args[1], 10);
            const userId = message.author.id;
            const balance = getEggBucks(userId);

            if (balance < betAmount) {
                return message.channel.send(`Sorry, ${message.author.username}, you don't have enough Egg Bucks. Your balance is E$${balance}.`);
            }

            const diceRoll = Math.ceil(Math.random() * 6);
            const userGuess = parseInt(args[2], 10);

            if (userGuess === diceRoll) {
                const winnings = betAmount * 6;
                updateEggBucks(userId, winnings);
                message.channel.send(`Congratulations, ${message.author.username}! You rolled a ${diceRoll}. You won E$${winnings}! Your new balance is E$${balance + winnings}.`);
            } else {
                updateEggBucks(userId, -betAmount);
                updateHouse(betAmount);
                message.channel.send(`Sorry, ${message.author.username}, you rolled a ${diceRoll}. You lost E$${betAmount}. Your new balance is E$${balance - betAmount}.`);
            }
        }

        // Command to check the House balance
        if (args[0] === '!house') {
            const houseBalance = getHouseBalance();
            return message.channel.send(`The House currently holds E$${houseBalance}.`);
        }
    });

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
