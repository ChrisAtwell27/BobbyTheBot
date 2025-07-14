const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cooldowns = new Map(); // Track cooldowns

const eggBucksFilePath = path.join(__dirname, '../data/egg_bucks.txt');
const houseFilePath = path.join(__dirname, '../data/house.txt');
const COOLDOWN_SECONDS = 3; // Cooldown in seconds

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const args = message.content.split(' ');
        const command = args[0].toLowerCase();
        const userId = message.author.id;


        // Reset cooldown
        cooldowns.set(userId, Date.now());

        // Command to get a list of all games
        if (command === '!gamble') {
            const gameList = new EmbedBuilder()
                .setTitle('Available Games')
                .setColor('#228B22')
                .setDescription('Choose one of the following games:')
                .addFields(
                    { name: '🎲 Dice', value: 'Roll a dice and bet on the outcome. Syntax: !dice [amount] [guess (1-6)]', inline: false },
                    { name: '🪙 Flip', value: 'Flip a coin and double your bet if you win. Syntax: !flip [amount]', inline: false },
                    { name: '🎰 Roulette', value: 'Bet on red or black, or a specific number. Win big or lose it all! Syntax: !roulette [amount] [red/black/number]', inline: false }
                );
            return message.channel.send({ embeds: [gameList] });
        }

        if (command === '!flip') {
            playFlipGame(message, args);
        } else if (command === '!roulette') {
            playRouletteGame(message, args);
        } else if (command === '!dice') {
            playDiceGame(message, args);
        }
    });

    function playFlipGame(message, args) {
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
        const winnings = result === 'heads' ? betAmount * 2 : -betAmount;

        updateEggBucks(userId, winnings);
        updateHouse(-winnings); // Adjust house balance accordingly

        const embed = new EmbedBuilder()
            .setTitle('Coin Flip')
            .setColor(result === 'heads' ? '#FFD700' : '#FF4500')
            .setDescription(`${message.author.username} flipped a coin...`)
            .addFields(
                { name: 'Result', value: `🪙 **${result.toUpperCase()}**`, inline: true },
                { name: 'Winnings', value: `E$${winnings}`, inline: true },
                { name: 'New Balance', value: `E$${getEggBucks(userId)}`, inline: true }
            );

        return message.channel.send({ embeds: [embed] });
    }

    function playRouletteGame(message, args) {
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
        if (userChoice === chosenColor) winnings = betAmount * 2;
        if (userChoice === String(chosenNumber)) winnings = betAmount * 36;

        updateEggBucks(userId, winnings - betAmount);
        updateHouse(betAmount - winnings);

        const embed = new EmbedBuilder()
            .setTitle('Roulette')
            .setColor(chosenColor === 'red' ? '#FF0000' : '#000000')
            .setDescription(`${message.author.username} placed a bet...`)
            .addFields(
                { name: 'Outcome', value: `🎰 **${outcome.toUpperCase()}**`, inline: true },
                { name: 'Winnings', value: `E$${winnings}`, inline: true },
                { name: 'New Balance', value: `E$${getEggBucks(userId)}`, inline: true }
            );

        return message.channel.send({ embeds: [embed] });
    }

    function playDiceGame(message, args) {
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
        const winnings = userGuess === diceRoll ? betAmount * 6 : -betAmount;

        updateEggBucks(userId, winnings);
        updateHouse(-winnings);

        const embed = new EmbedBuilder()
            .setTitle('Dice Roll')
            .setColor(winnings > 0 ? '#FFD700' : '#FF4500')
            .setDescription(`${message.author.username} rolled the dice...`)
            .addFields(
                { name: 'Roll', value: `🎲 **${diceRoll}**`, inline: true },
                { name: 'Winnings', value: `E$${winnings}`, inline: true },
                { name: 'New Balance', value: `E$${getEggBucks(userId)}`, inline: true }
            );

        return message.channel.send({ embeds: [embed] });
    }

    // Functions to handle Egg Bucks and House balance
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
