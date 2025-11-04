const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { getBobbyBucks, updateBobbyBucks } = require('../database/helpers/economyHelpers');
const { getHouseBalance, updateHouse } = require('../database/helpers/serverHelpers');
const { TARGET_GUILD_ID } = require('../config/guildConfig');

// Game constants
const GAME_DURATION = 300000; // 5 minutes in milliseconds
const MIN_BET = 100; // Minimum bet to start/challenge
const HOUSE_CUT = 0.05; // 5% house cut

// Active games storage
const activeKothGames = new Map();

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

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // Only run in target guild
        if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

        // Skip DM messages
        if (!message.guild) return;

        const args = message.content.split(' ');
        const command = args[0].toLowerCase();
        const userId = message.author.id;
        const channelId = message.channel.id;

        // King of the Hill command
        if (command === '!koth') {
            if (args.length !== 2 || isNaN(parseInt(args[1], 10)) || parseInt(args[1], 10) < MIN_BET) {
                return message.channel.send(`Incorrect usage! Correct syntax: !koth [amount] (minimum: ${MIN_BET})`);
            }

            const challengeAmount = parseInt(args[1], 10);
            const balance = await getBobbyBucks(userId);

            if (balance < challengeAmount) {
                return message.channel.send(`Sorry, ${message.author.username}, you don't have enough Honey. Your balance is 🍯{balance}.`);
            }

            // Check if there's an active game in this channel
            if (activeKothGames.has(channelId)) {
                // Challenge existing king
                await handleChallenge(message, userId, challengeAmount, channelId);
            } else {
                // Start new game
                await startNewKothGame(message, userId, challengeAmount, channelId);
            }
        }

        // Show current KOTH status
        if (command === '!kothstatus') {
            if (activeKothGames.has(channelId)) {
                await showGameStatus(message, channelId);
            } else {
                return message.channel.send("No active King of the Hill game in this channel. Start one with `!koth [amount]`!");
            }
        }
    });

    // Start a new King of the Hill game
    async function startNewKothGame(message, userId, amount, channelId) {
        // Deduct the initial bet
        await updateBobbyBucks(userId, -amount);

        const gameData = {
            kingId: userId,
            kingName: message.author.username,
            kingAmount: amount,
            pot: amount,
            startTime: Date.now(),
            endTime: Date.now() + GAME_DURATION,
            channelId: channelId,
            lastActivity: Date.now()
        };

        activeKothGames.set(channelId, gameData);

        // Create visual
        const gameCanvas = await createKothVisual(gameData, message.guild);
        const attachment = new AttachmentBuilder(gameCanvas.toBuffer(), { name: 'koth-game.png' });

        const embed = new EmbedBuilder()
            .setTitle('👑 KING OF THE HILL - NEW REIGN!')
            .setColor('#ffd700')
            .setDescription(`**${message.author.username}** has claimed the throne!`)
            .setImage('attachment://koth-game.png')
            .addFields(
                { name: '👑 Current King', value: message.author.username, inline: true },
                { name: '💰 Current Pot', value: `🍯{amount.toLocaleString()}`, inline: true },
                { name: '⏰ Time Remaining', value: `<t:${Math.floor(gameData.endTime / 1000)}:R>`, inline: true },
                { name: '🎯 How to Challenge', value: `Use \`!koth [amount]\` to challenge the King!`, inline: false },
                { name: '📊 Challenge Formula', value: `50% chance at equal bets, up to 95% max`, inline: false }
            )
            .setFooter({ text: 'Defend your throne or lose it all! 👑' })
            .setTimestamp();

        await message.channel.send({ embeds: [embed], files: [attachment] });

        // Set timer to end game
        setTimeout(() => {
            endKothGame(channelId, client);
        }, GAME_DURATION);
    }

    // Handle challenge to existing king
    async function handleChallenge(message, userId, challengeAmount, channelId) {
        const gameData = activeKothGames.get(channelId);
        
        if (userId === gameData.kingId) {
            return message.channel.send("❌ You can't challenge yourself! You're already the King!");
        }

        // Check if game has expired
        if (Date.now() > gameData.endTime) {
            await endKothGame(channelId, client);
            return message.channel.send("⏰ The previous game has ended! Start a new one with `!koth [amount]`");
        }

        // Deduct challenger's bet
        await updateBobbyBucks(userId, -challengeAmount);

        // Calculate chance to overthrow (50% at equal amounts, capped at 95% max, 5% min)
        const ratio = challengeAmount / gameData.kingAmount;
        const chance = Math.min(0.95, Math.max(0.05, 0.5 * ratio));
        const roll = Math.random();
        const success = roll < chance;

        // Add to pot
        gameData.pot += challengeAmount;
        gameData.lastActivity = Date.now();

        let resultEmbed;
        let gameCanvas;

        if (success) {
            // Challenger becomes new king!
            gameData.kingId = userId;
            gameData.kingName = message.author.username;
            gameData.kingAmount = challengeAmount;
            gameData.endTime = Date.now() + GAME_DURATION; // Reset timer

            gameCanvas = await createKothVisual(gameData, message.guild);
            const attachment = new AttachmentBuilder(gameCanvas.toBuffer(), { name: 'koth-overthrow.png' });

            resultEmbed = new EmbedBuilder()
                .setTitle('👑 KING OF THE HILL - NEW KING!')
                .setColor('#00ff00')
                .setDescription(`🎉 **${message.author.username}** has overthrown the King!`)
                .setImage('attachment://koth-overthrow.png')
                .addFields(
                    { name: '⚔️ Challenge Result', value: `**Success!** (${(chance * 100).toFixed(1)}% chance)`, inline: true },
                    { name: '🎲 Roll', value: `${(roll * 100).toFixed(1)}% (needed <${(chance * 100).toFixed(1)}%)`, inline: true },
                    { name: '👑 New King', value: message.author.username, inline: true },
                    { name: '💰 Current Pot', value: `🍯{gameData.pot.toLocaleString()}`, inline: true },
                    { name: '⏰ Time Reset', value: `<t:${Math.floor(gameData.endTime / 1000)}:R>`, inline: true },
                    { name: '💪 Kings Power', value: `🍯{challengeAmount.toLocaleString()}`, inline: true }
                )
                .setFooter({ text: 'Long live the new King! 👑' })
                .setTimestamp();

            await message.channel.send({ embeds: [resultEmbed], files: [attachment] });

            // Set new timer
            setTimeout(() => {
                endKothGame(channelId, client);
            }, GAME_DURATION);

        } else {
            // Challenge failed
            gameCanvas = await createKothVisual(gameData, message.guild);
            const attachment = new AttachmentBuilder(gameCanvas.toBuffer(), { name: 'koth-failed.png' });

            resultEmbed = new EmbedBuilder()
                .setTitle('👑 KING OF THE HILL - CHALLENGE FAILED!')
                .setColor('#ff0000')
                .setDescription(`💀 **${message.author.username}**'s challenge has failed!`)
                .setImage('attachment://koth-failed.png')
                .addFields(
                    { name: '⚔️ Challenge Result', value: `**Failed!** (${(chance * 100).toFixed(1)}% chance)`, inline: true },
                    { name: '🎲 Roll', value: `${(roll * 100).toFixed(1)}% (needed <${(chance * 100).toFixed(1)}%)`, inline: true },
                    { name: '👑 King Remains', value: gameData.kingName, inline: true },
                    { name: '💰 Pot Increased', value: `🍯{gameData.pot.toLocaleString()} (+🍯{challengeAmount.toLocaleString()})`, inline: true },
                    { name: '⏰ Time Remaining', value: `<t:${Math.floor(gameData.endTime / 1000)}:R>`, inline: true },
                    { name: '💪 Kings Power', value: `🍯{gameData.kingAmount.toLocaleString()}`, inline: true }
                )
                .setFooter({ text: 'The King\'s reign continues! 👑' })
                .setTimestamp();

            await message.channel.send({ embeds: [resultEmbed], files: [attachment] });
        }
    }

    // Show current game status
    async function showGameStatus(message, channelId) {
        const gameData = activeKothGames.get(channelId);
        
        if (Date.now() > gameData.endTime) {
            await endKothGame(channelId, client);
            return;
        }

        const gameCanvas = await createKothVisual(gameData, message.guild);
        const attachment = new AttachmentBuilder(gameCanvas.toBuffer(), { name: 'koth-status.png' });

        const embed = new EmbedBuilder()
            .setTitle('👑 KING OF THE HILL - STATUS')
            .setColor('#ffd700')
            .setDescription(`Current game status in ${message.channel.name}`)
            .setImage('attachment://koth-status.png')
            .addFields(
                { name: '👑 Current King', value: gameData.kingName, inline: true },
                { name: '💰 Current Pot', value: `🍯{gameData.pot.toLocaleString()}`, inline: true },
                { name: '💪 King\'s Power', value: `🍯{gameData.kingAmount.toLocaleString()}`, inline: true },
                { name: '⏰ Time Remaining', value: `<t:${Math.floor(gameData.endTime / 1000)}:R>`, inline: true },
                { name: '🎯 Challenge Info', value: `Equal bet = 50% chance, higher = better odds!`, inline: true },
                { name: '📊 Win Formula', value: `50% at equal bets, max 95% chance`, inline: true }
            )
            .setFooter({ text: 'Use !koth [amount] to challenge!' })
            .setTimestamp();

        await message.channel.send({ embeds: [embed], files: [attachment] });
    }

    // End the King of the Hill game
    async function endKothGame(channelId, client) {
        const gameData = activeKothGames.get(channelId);
        if (!gameData) return;

        // Calculate house cut and winnings
        const houseCut = Math.floor(gameData.pot * HOUSE_CUT);
        const winnings = gameData.pot - houseCut;

        // Pay the king
        await updateBobbyBucks(gameData.kingId, winnings);
        await updateHouse(houseCut);

        // Remove from active games
        activeKothGames.delete(channelId);

        try {
            const channel = client.channels.cache.get(channelId);
            if (channel) {
                const finalCanvas = await createKothEndVisual(gameData, winnings, houseCut);
                const attachment = new AttachmentBuilder(finalCanvas.toBuffer(), { name: 'koth-victory.png' });

                const embed = new EmbedBuilder()
                    .setTitle('👑 KING OF THE HILL - GAME OVER!')
                    .setColor('#ffd700')
                    .setDescription(`🎉 **${gameData.kingName}** has successfully defended the throne!`)
                    .setImage('attachment://koth-victory.png')
                    .addFields(
                        { name: '🏆 Victor', value: gameData.kingName, inline: true },
                        { name: '💰 Total Winnings', value: `🍯{winnings.toLocaleString()}`, inline: true },
                        { name: '🏛️ House Cut', value: `🍯{houseCut.toLocaleString()} (${(HOUSE_CUT * 100)}%)`, inline: true },
                        { name: '📊 Final Pot', value: `🍯{gameData.pot.toLocaleString()}`, inline: true },
                        { name: '⏰ Reign Duration', value: `${Math.floor((Date.now() - gameData.startTime) / 60000)} minutes`, inline: true },
                        { name: '👑 Royal Status', value: 'Unchallenged!', inline: true }
                    )
                    .setFooter({ text: 'The King claims victory! Start a new game with !koth [amount]' })
                    .setTimestamp();

                await channel.send({ embeds: [embed], files: [attachment] });
            }
        } catch (error) {
            console.error('Error ending KOTH game:', error);
        }
    }

    // Create King of the Hill game visualization
    async function createKothVisual(gameData, guild) {
        const canvas = createCanvas(600, 400);
        const ctx = canvas.getContext('2d');

        // Castle background
        const gradient = ctx.createLinearGradient(0, 0, 600, 400);
        gradient.addColorStop(0, '#2c1810');
        gradient.addColorStop(0.5, '#1a0f08');
        gradient.addColorStop(1, '#0f0804');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 400);

        // Castle silhouette
        ctx.fillStyle = '#1a1a1a';
        // Castle base
        ctx.fillRect(150, 250, 300, 150);
        // Castle towers
        ctx.fillRect(120, 200, 60, 200);
        ctx.fillRect(420, 200, 60, 200);
        ctx.fillRect(270, 180, 60, 220);
        
        // Tower tops
        ctx.beginPath();
        ctx.moveTo(150, 200);
        ctx.lineTo(135, 180);
        ctx.lineTo(165, 180);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(450, 200);
        ctx.lineTo(435, 180);
        ctx.lineTo(465, 180);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(300, 180);
        ctx.lineTo(285, 160);
        ctx.lineTo(315, 160);
        ctx.closePath();
        ctx.fill();

        // Castle windows
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(140, 220, 20, 20);
        ctx.fillRect(440, 220, 20, 20);
        ctx.fillRect(290, 200, 20, 20);

        // Main gate
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(280, 320, 40, 80);
        ctx.fillStyle = '#654321';
        ctx.fillRect(285, 325, 30, 70);

        // Crown above castle
        ctx.fillStyle = '#ffd700';
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('👑', 300, 140);

        // King's name banner
        ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
        ctx.fillRect(200, 100, 200, 30);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`KING ${gameData.kingName.toUpperCase()}`, 300, 120);

        // Pot display
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`POT: 🍯${gameData.pot.toLocaleString()}`, 300, 60);

        // Time remaining
        const timeLeft = Math.max(0, gameData.endTime - Date.now());
        const minutesLeft = Math.floor(timeLeft / 60000);
        const secondsLeft = Math.floor((timeLeft % 60000) / 1000);
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Arial';
        ctx.fillText(`Time: ${minutesLeft}:${secondsLeft.toString().padStart(2, '0')}`, 300, 30);

        // King's power
        ctx.fillStyle = '#ff6b6b';
        ctx.font = '16px Arial';
        ctx.fillText(`King's Power: 🍯${gameData.kingAmount.toLocaleString()}`, 300, 380);

        return canvas;
    }

    // Create game end visualization
    async function createKothEndVisual(gameData, winnings, houseCut) {
        const canvas = createCanvas(600, 400);
        const ctx = canvas.getContext('2d');

        // Victory background
        const gradient = ctx.createRadialGradient(300, 200, 0, 300, 200, 300);
        gradient.addColorStop(0, '#ffd700');
        gradient.addColorStop(0.6, '#ff8c00');
        gradient.addColorStop(1, '#ff4500');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 400);

        // Sparkle effects
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 30; i++) {
            const x = Math.random() * 600;
            const y = Math.random() * 400;
            const size = Math.random() * 3 + 1;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Victory crown
        ctx.fillStyle = '#000000';
        ctx.font = '80px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('👑', 300, 120);

        // Victory text
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 36px Arial';
        ctx.fillText('VICTORY!', 300, 180);

        // King's name
        ctx.font = 'bold 28px Arial';
        ctx.fillText(`KING ${gameData.kingName.toUpperCase()}`, 300, 220);

        // Winnings
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`WON 🍯${winnings.toLocaleString()}!`, 300, 260);

        // Additional info
        ctx.font = '18px Arial';
        ctx.fillText(`Total Pot: 🍯${gameData.pot.toLocaleString()}`, 300, 300);
        ctx.fillText(`House Cut: 🍯${houseCut.toLocaleString()}`, 300, 325);

        // Celebration
        ctx.font = '16px Arial';
        ctx.fillText('🎉 THE THRONE IS YOURS! 🎉', 300, 360);

        return canvas;
    }

};
