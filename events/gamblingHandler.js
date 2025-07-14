const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const cooldowns = new Map(); // Track cooldowns

const eggBucksFilePath = path.join(__dirname, '../data/bobby_bucks.txt');
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
                .setTitle('🎰 CASINO GAMES')
                .setColor('#ffd700')
                .setDescription('**Welcome to the Egg Bucks Casino!** 🎲\nChoose your game and test your luck!')
                .addFields(
                    { name: '🎲 Dice Game', value: '`!dice [amount] [guess (1-6)]`\nGuess the number! **6x payout** if you win!', inline: false },
                    { name: '🪙 Coin Flip', value: '`!flip [amount]`\nHeads you win, tails you lose! **2x payout**', inline: false },
                    { name: '🎰 Roulette', value: '`!roulette [amount] [red/black/number]`\nBet on colors (**2x**) or numbers (**36x**)!', inline: false },
                    { name: '🃏 Blackjack', value: '`!blackjack [amount]`\nBeat the dealer to **21**! Classic casino game!', inline: false }
                )
                .addFields(
                    { name: '💰 Your Stats', value: `**Balance:** E$${getEggBucks(userId)}\n**House:** E$${getHouseBalance()}`, inline: true },
                    { name: '🎯 Payouts', value: '**Dice:** 6x\n**Flip:** 2x\n**Roulette Color:** 2x\n**Roulette Number:** 36x', inline: true }
                )
                .setFooter({ text: '🍀 Good luck and gamble responsibly!' })
                .setTimestamp();
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
        ctx.fillText('🪙 COIN FLIP', 200, 30);
        
        // Player info
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px Arial';
        ctx.fillText(`${playerName} - Bet: E$${betAmount}`, 200, 50);
        
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
        ctx.fillText(isWin ? `YOU WIN E$${winnings}!` : `YOU LOSE E$${Math.abs(winnings)}!`, 200, 250);
        
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
        ctx.fillText(`${playerName} bet E$${betAmount} on ${userChoice.toUpperCase()}`, 250, 50);
        
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
            ctx.arc(0, 0, 90, -Math.PI/37, Math.PI/37);
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
        ctx.fillText(isWin ? `YOU WIN E$${winnings}!` : `YOU LOSE E$${Math.abs(winnings)}!`, 250, 350);
        
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
        ctx.fillText(`${playerName} guessed ${userGuess} - Bet: E$${betAmount}`, 200, 50);
        
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
        ctx.fillText(isWin ? `YOU WIN E$${winnings}!` : `YOU LOSE E$${Math.abs(winnings)}!`, 200, 250);
        
        return canvas;
    }

    async function playFlipGame(message, args) {
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
        const winnings = result === 'heads' ? betAmount * 2 : 0;
        const netGain = winnings - betAmount;

        updateEggBucks(userId, netGain);
        updateHouse(-netGain);

        // Create visual
        const coinCanvas = await createCoinFlipAnimation(result, message.author.username, betAmount, netGain);
        const attachment = new AttachmentBuilder(coinCanvas.toBuffer(), { name: 'coin-flip.png' });

        const embed = new EmbedBuilder()
            .setTitle('🪙 Coin Flip Casino')
            .setColor(result === 'heads' ? '#ffd700' : '#ff4500')
            .setDescription(`**${message.author.username}** flipped the coin!`)
            .setImage('attachment://coin-flip.png')
            .addFields(
                { name: '🎯 Result', value: `**${result.toUpperCase()}**`, inline: true },
                { name: '💰 Outcome', value: netGain > 0 ? `Won E$${netGain}` : `Lost E$${Math.abs(netGain)}`, inline: true },
                { name: '🏦 New Balance', value: `E$${getEggBucks(userId)}`, inline: true }
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
        const balance = getEggBucks(userId);

        if (balance < betAmount) {
            return message.channel.send(`Sorry, ${message.author.username}, you don't have enough Egg Bucks. Your balance is E$${balance}.`);
        }

        const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        const chosenNumber = Math.floor(Math.random() * 37); // 0-36
        const chosenColor = chosenNumber === 0 ? 'green' : (redNumbers.includes(chosenNumber) ? 'red' : 'black');
        const userChoice = args[2].toLowerCase();

        let winnings = 0;
        if (userChoice === chosenColor && chosenNumber !== 0) winnings = betAmount * 2;
        if (userChoice === String(chosenNumber)) winnings = betAmount * 36;
        
        const netGain = winnings - betAmount;
        updateEggBucks(userId, netGain);
        updateHouse(-netGain);

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
                { name: '💰 Outcome', value: netGain > 0 ? `Won E$${netGain}` : `Lost E$${Math.abs(netGain)}`, inline: true }
            )
            .addFields(
                { name: '🏦 New Balance', value: `E$${getEggBucks(userId)}`, inline: true },
                { name: '🏛️ House Edge', value: `E$${getHouseBalance()}`, inline: true },
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
        const balance = getEggBucks(userId);

        if (balance < betAmount) {
            return message.channel.send(`Sorry, ${message.author.username}, you don't have enough Egg Bucks. Your balance is E$${balance}.`);
        }

        const diceRoll = Math.ceil(Math.random() * 6);
        const userGuess = parseInt(args[2], 10);
        const winnings = userGuess === diceRoll ? betAmount * 6 : 0;
        const netGain = winnings - betAmount;

        updateEggBucks(userId, netGain);
        updateHouse(-netGain);

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
                { name: '💰 Outcome', value: netGain > 0 ? `Won E$${netGain}` : `Lost E$${Math.abs(netGain)}`, inline: true },
                { name: '🏦 New Balance', value: `E$${getEggBucks(userId)}`, inline: true },
                { name: '📊 Odds', value: '1 in 6 (16.7%)', inline: true }
            )
            .setFooter({ text: netGain > 0 ? '🎉 Perfect prediction! You nailed it!' : '🎲 Close call! Try again!' })
            .setTimestamp();

        return message.channel.send({ embeds: [embed], files: [attachment] });
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