const fs = require('fs');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const https = require('https');
const { topEggRoleId } = require('../data/config');

const bobbyBucksFilePath = path.join(__dirname, '../data/bobby_bucks.txt');
const houseFilePath = path.join(__dirname, '../data/house.txt');

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

        // Skip DM messages for this handler since it's for guild-only commands
        if (!message.guild) return;

        const args = message.content.split(' ');
        const userRoles = message.member.roles.cache;

        // Command to check Bobby Bucks balance
        if (args[0] === '!balance') {
            let userId, username, user;
            
            if (args[1]) {
                // Check someone else's balance
                const mentionedUser = message.mentions.users.first() || message.guild.members.cache.find(member => member.user.username === args[1])?.user;
                if (!mentionedUser) {
                    return message.channel.send('User not found.');
                }
                userId = mentionedUser.id;
                username = mentionedUser.username;
                user = mentionedUser;
            } else {
                // Check own balance
                userId = message.author.id;
                username = message.author.username;
                user = message.author;
            }
            
            const balance = getBobbyBucks(userId);
            const balanceCard = await createBalanceCard(user, balance);
            const attachment = new AttachmentBuilder(balanceCard.toBuffer(), { name: 'balance-card.png' });

            const embed = new EmbedBuilder()
                .setTitle('🏦 Bobby Bucks Bank - Account Statement')
                .setColor('#ffd700')
                .setDescription(`**Account Holder:** ${username}`)
                .setImage('attachment://balance-card.png')
                .addFields(
                    { name: '💰 Current Balance', value: `**B${balance.toLocaleString()}**`, inline: true },
                    { name: '🏛️ Account Status', value: balance > 1000 ? '🌟 **Premium**' : '📋 **Standard**', inline: true },
                    { name: '📊 Rank', value: `#${getCachedRank(userId, message.guild)}`, inline: true }
                )
                .setFooter({ text: 'Bobby Bucks Bank - Your trusted financial partner' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // Enhanced leaderboard command
        if (args[0] === '!baltop') {
            const topBalances = await getTopBalances(message.guild, 10);
            
            if (topBalances.length === 0) {
                return message.channel.send('No balances found.');
            }
            
            const leaderboardImage = await createLeaderboard(topBalances, message.guild);
            const attachment = new AttachmentBuilder(leaderboardImage.toBuffer(), { name: 'leaderboard.png' });

            const embed = new EmbedBuilder()
                .setTitle('🏆 Bobby Bucks Leaderboard')
                .setColor('#ffd700')
                .setDescription('**Top 10 Richest Members**')
                .setImage('attachment://leaderboard.png')
                .addFields(
                    { name: '📊 Total Economy', value: `B${getTotalEconomy().toLocaleString()}`, inline: true },
                    { name: '🏛️ House Balance', value: `B${getHouseBalance().toLocaleString()}`, inline: true },
                    { name: '👥 Active Users', value: `${topBalances.length} members`, inline: true }
                )
                .setFooter({ text: 'Rankings updated in real-time' })
                .setTimestamp();
            
            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // Command to award Bobby Bucks
        if (args[0] === '!award' && args[1] && args[2]) {
            if (!userRoles.has(topEggRoleId)) {
                return message.reply("You don't have permission to use this command.");
            }

            const mentionedUser = message.mentions.users.first() || message.guild.members.cache.find(member => member.user.username === args[1])?.user;
            const userId = mentionedUser ? mentionedUser.id : null;
            const amount = parseInt(args[2], 10);

            if (!userId || isNaN(amount) || amount <= 0) {
                return message.channel.send('Invalid user or amount specified.');
            }

            const oldBalance = getBobbyBucks(userId);
            updateBobbyBucks(userId, amount);
            const newBalance = getBobbyBucks(userId);

            const transactionReceipt = await createTransactionReceipt(mentionedUser, amount, oldBalance, newBalance, 'AWARD', message.author);
            const attachment = new AttachmentBuilder(transactionReceipt.toBuffer(), { name: 'transaction-receipt.png' });

            const embed = new EmbedBuilder()
                .setTitle('💰 Bobby Bucks Award - Transaction Complete')
                .setColor('#00ff00')
                .setDescription(`**${mentionedUser.username}** has been awarded Bobby Bucks!`)
                .setImage('attachment://transaction-receipt.png')
                .addFields(
                    { name: '🎁 Amount Awarded', value: `**+B${amount.toLocaleString()}**`, inline: true },
                    { name: '💳 New Balance', value: `**B${newBalance.toLocaleString()}**`, inline: true },
                    { name: '👤 Awarded By', value: `${message.author.username}`, inline: true }
                )
                .setFooter({ text: 'Transaction processed by Bobby Bucks Bank' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // Command to spend Bobby Bucks
        if (args[0] === '!spend' && args[1]) {
            const userId = message.author.id;
            const amount = parseInt(args[1], 10);
            const balance = getBobbyBucks(userId);

            if (isNaN(amount) || amount <= 0) {
                return message.channel.send('Invalid amount specified.');
            }

            if (balance >= amount) {
                const oldBalance = balance;
                updateBobbyBucks(userId, -amount);
                const newBalance = getBobbyBucks(userId);

                const transactionReceipt = await createTransactionReceipt(message.author, amount, oldBalance, newBalance, 'SPEND', message.author);
                const attachment = new AttachmentBuilder(transactionReceipt.toBuffer(), { name: 'spending-receipt.png' });

                const embed = new EmbedBuilder()
                    .setTitle('💸 Bobby Bucks Spending - Transaction Complete')
                    .setColor('#ff6b6b')
                    .setDescription(`**${message.author.username}** made a purchase!`)
                    .setImage('attachment://spending-receipt.png')
                    .addFields(
                        { name: '💸 Amount Spent', value: `**-B${amount.toLocaleString()}**`, inline: true },
                        { name: '💳 Remaining Balance', value: `**B${newBalance.toLocaleString()}**`, inline: true },
                        { name: '📊 Savings Rate', value: `${((newBalance / oldBalance) * 100).toFixed(1)}%`, inline: true }
                    )
                    .setFooter({ text: 'Thank you for your business!' })
                    .setTimestamp();

                return message.channel.send({ embeds: [embed], files: [attachment] });
            } else {
                const insufficientFunds = await createInsufficientFundsCard(message.author, balance, amount);
                const attachment = new AttachmentBuilder(insufficientFunds.toBuffer(), { name: 'insufficient-funds.png' });

                const embed = new EmbedBuilder()
                    .setTitle('❌ Transaction Declined')
                    .setColor('#ff0000')
                    .setDescription('**Insufficient Funds**')
                    .setImage('attachment://insufficient-funds.png')
                    .addFields(
                        { name: '💳 Your Balance', value: `B${balance.toLocaleString()}`, inline: true },
                        { name: '💸 Attempted Purchase', value: `B${amount.toLocaleString()}`, inline: true },
                        { name: '💰 Amount Needed', value: `B${(amount - balance).toLocaleString()}`, inline: true }
                    )
                    .setFooter({ text: 'Consider earning more Bobby Bucks through games!' })
                    .setTimestamp();

                return message.channel.send({ embeds: [embed], files: [attachment] });
            }
        }

        // Command to give all users in the server a specific amount of Bobby Bucks - FIXED
        if (args[0] === '!awardall' && args[1]) {
            if (!userRoles.has(topEggRoleId)) {
                return message.reply("You don't have permission to use this command.");
            }

            const amount = parseInt(args[1], 10);

            if (isNaN(amount) || amount <= 0) {
                return message.channel.send('Invalid amount specified.');
            }

            try {
                // Fetch all members to ensure we have the complete member list
                const allMembers = await message.guild.members.fetch();
                
                let membersAwarded = 0;
                allMembers.forEach(member => {
                    if (!member.user.bot) {
                        updateBobbyBucks(member.id, amount);
                        membersAwarded++;
                    }
                });

                const massAwardImage = await createMassAwardCard(amount, membersAwarded, message.author);
                const attachment = new AttachmentBuilder(massAwardImage.toBuffer(), { name: 'mass-award.png' });

                const embed = new EmbedBuilder()
                    .setTitle('🎉 Server-Wide Award - Economic Stimulus!')
                    .setColor('#00ff00')
                    .setDescription('**Universal Basic Bobby Bucks Distribution**')
                    .setImage('attachment://mass-award.png')
                    .addFields(
                        { name: '💰 Amount Per User', value: `**+B${amount.toLocaleString()}**`, inline: true },
                        { name: '👥 Users Affected', value: `**${membersAwarded} members**`, inline: true },
                        { name: '💳 Total Distributed', value: `**B${(amount * membersAwarded).toLocaleString()}**`, inline: true }
                    )
                    .setFooter({ text: 'Economic stimulus program activated!' })
                    .setTimestamp();

                return message.channel.send({ embeds: [embed], files: [attachment] });
            } catch (error) {
                console.error('Error fetching guild members:', error);
                return message.channel.send('❌ Failed to fetch all server members. Please try again.');
            }
        }

        // Economy stats command
        if (args[0] === '!economy') {
            const stats = getEconomyStats(message.guild);
            const economyChart = await createEconomyChart(stats);
            const attachment = new AttachmentBuilder(economyChart.toBuffer(), { name: 'economy-stats.png' });

            const embed = new EmbedBuilder()
                .setTitle('📊 Server Economy Statistics')
                .setColor('#4a90e2')
                .setDescription('**Complete Economic Overview**')
                .setImage('attachment://economy-stats.png')
                .addFields(
                    { name: '💰 Total Economy', value: `B${stats.totalEconomy.toLocaleString()}`, inline: true },
                    { name: '🏛️ House Balance', value: `B${stats.houseBalance.toLocaleString()}`, inline: true },
                    { name: '👑 Richest User', value: `B${stats.richestBalance.toLocaleString()}`, inline: true },
                    { name: '📈 Average Balance', value: `B${stats.averageBalance.toLocaleString()}`, inline: true },
                    { name: '👥 Active Users', value: `${stats.activeUsers}`, inline: true },
                    { name: '💎 Millionaires', value: `${stats.millionaires}`, inline: true }
                )
                .setFooter({ text: 'Updated in real-time' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }
    });

    // Create balance card visualization
    async function createBalanceCard(user, balance) {
        const canvas = createCanvas(500, 300);
        const ctx = canvas.getContext('2d');
        
        // Card background gradient
        const gradient = ctx.createLinearGradient(0, 0, 500, 300);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(0.5, '#16213e');
        gradient.addColorStop(1, '#0f0f23');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 500, 300);
        
        // Card border
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        ctx.strokeRect(10, 10, 480, 280);
        
        // Bank logo area
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('🏦 BOBBY BUCKS BANK', 30, 45);
        
        try {
            // User avatar
            const avatarURL = user.displayAvatarURL({ extension: 'png', size: 128 });
            const avatar = await loadImageFromURL(avatarURL);
            
            // Circular avatar
            ctx.save();
            ctx.beginPath();
            ctx.arc(420, 80, 40, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, 380, 40, 80, 80);
            ctx.restore();
            
            // Avatar border
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(420, 80, 40, 0, Math.PI * 2);
            ctx.stroke();
        } catch (error) {
            // Fallback avatar
            ctx.fillStyle = '#7289da';
            ctx.beginPath();
            ctx.arc(420, 80, 40, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = '30px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('👤', 420, 90);
        }
        
        // Account holder name
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('ACCOUNT HOLDER', 30, 90);
        ctx.font = '20px Arial';
        ctx.fillText(user.username.toUpperCase(), 30, 115);
        
        // Account number (fake)
        ctx.font = '14px Arial';
        ctx.fillStyle = '#cccccc';
        ctx.fillText(`ACCOUNT: **** **** **** ${user.id.slice(-4)}`, 30, 140);
        
        // Balance
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 18px Arial';
        ctx.fillText('CURRENT BALANCE', 30, 180);
        ctx.font = 'bold 36px Arial';
        ctx.fillText(`B${balance.toLocaleString()}`, 30, 220);
        
        // Card type
        const cardType = balance > 10000 ? 'PLATINUM' : balance > 5000 ? 'GOLD' : balance > 1000 ? 'SILVER' : 'BRONZE';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`${cardType} MEMBER`, 470, 250);
        
        // Valid thru (fake)
        ctx.font = '12px Arial';
        ctx.fillText('VALID THRU 12/99', 470, 270);
        
        return canvas;
    }

    // Create leaderboard visualization
    async function createLeaderboard(topBalances, guild) {
        const canvas = createCanvas(600, 400 + (topBalances.length * 35));
        const ctx = canvas.getContext('2d');
        
        // Background
        const gradient = ctx.createLinearGradient(0, 0, 600, canvas.height);
        gradient.addColorStop(0, '#2c1810');
        gradient.addColorStop(1, '#1a0f08');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, canvas.height);
        
        // Header
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🏆 BOBBY BUCKS LEADERBOARD', 300, 50);
        
        // Server name
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Arial';
        ctx.fillText(guild.name, 300, 80);
        
        // Header bar
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(20, 100, 560, 3);
        
        // Leaderboard entries
        for (let i = 0; i < topBalances.length; i++) {
            const entry = topBalances[i];
            const y = 140 + (i * 35);
            
            // Rank background
            let rankColor = '#4a4a4a';
            if (i === 0) rankColor = '#ffd700'; // Gold
            else if (i === 1) rankColor = '#c0c0c0'; // Silver
            else if (i === 2) rankColor = '#cd7f32'; // Bronze
            
            ctx.fillStyle = rankColor;
            ctx.fillRect(30, y - 20, 40, 30);
            
            // Rank number
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
            ctx.fillText(rankIcon, 50, y - 5);
            
            // Username
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(entry.username, 90, y - 5);
            
            // Balance
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(`B${entry.balance.toLocaleString()}`, 570, y - 5);
            
            // Separator line
            if (i < topBalances.length - 1) {
                ctx.strokeStyle = '#444444';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(30, y + 10);
                ctx.lineTo(570, y + 10);
                ctx.stroke();
            }
        }
        
        return canvas;
    }

    // Create transaction receipt
    async function createTransactionReceipt(user, amount, oldBalance, newBalance, type, admin) {
        const canvas = createCanvas(400, 350);
        const ctx = canvas.getContext('2d');
        
        // Receipt background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 400, 350);
        
        // Receipt header
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🏦 BOBBY BUCKS BANK', 200, 30);
        ctx.font = '16px Arial';
        ctx.fillText('TRANSACTION RECEIPT', 200, 50);
        
        // Dashed line
        ctx.strokeStyle = '#cccccc';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(20, 70);
        ctx.lineTo(380, 70);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Transaction details
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('TRANSACTION DETAILS', 20, 100);
        
        ctx.font = '14px Arial';
        ctx.fillText(`Type: ${type}`, 20, 130);
        ctx.fillText(`User: ${user.username}`, 20, 150);
        ctx.fillText(`Amount: ${type === 'SPEND' ? '-' : '+'}B${amount.toLocaleString()}`, 20, 170);
        ctx.fillText(`Previous Balance: B${oldBalance.toLocaleString()}`, 20, 190);
        ctx.fillText(`New Balance: B${newBalance.toLocaleString()}`, 20, 210);
        if (admin && type === 'AWARD') {
            ctx.fillText(`Authorized by: ${admin.username}`, 20, 230);
        }
        
        // Transaction ID (fake)
        ctx.fillText(`Transaction ID: ${Date.now().toString().slice(-8)}`, 20, 250);
        ctx.fillText(`Date: ${new Date().toLocaleString()}`, 20, 270);
        
        // Footer
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Thank you for banking with Bobby Bucks Bank!', 200, 310);
        ctx.fillText('Questions? Contact support at #help', 200, 330);
        
        return canvas;
    }

    // Create insufficient funds card
    async function createInsufficientFundsCard(user, balance, attemptedAmount) {
        const canvas = createCanvas(400, 250);
        const ctx = canvas.getContext('2d');
        
        // Error background
        const gradient = ctx.createLinearGradient(0, 0, 400, 250);
        gradient.addColorStop(0, '#ff4444');
        gradient.addColorStop(1, '#cc0000');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 400, 250);
        
        // Error icon
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('❌', 200, 70);
        
        // Error message
        ctx.font = 'bold 24px Arial';
        ctx.fillText('INSUFFICIENT FUNDS', 200, 110);
        
        ctx.font = '16px Arial';
        ctx.fillText(`Your balance: B${balance.toLocaleString()}`, 200, 140);
        ctx.fillText(`Attempted: B${attemptedAmount.toLocaleString()}`, 200, 160);
        ctx.fillText(`Needed: B${(attemptedAmount - balance).toLocaleString()}`, 200, 180);
        
        ctx.font = '14px Arial';
        ctx.fillText('Try earning more through casino games!', 200, 210);
        
        return canvas;
    }

    // Create mass award card
    async function createMassAwardCard(amount, membersCount, admin) {
        const canvas = createCanvas(500, 300);
        const ctx = canvas.getContext('2d');
        
        // Celebration background
        const gradient = ctx.createRadialGradient(250, 150, 0, 250, 150, 250);
        gradient.addColorStop(0, '#ffd700');
        gradient.addColorStop(1, '#ff8c00');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 500, 300);
        
        // Celebration effect
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * 500;
            const y = Math.random() * 300;
            ctx.beginPath();
            ctx.arc(x, y, Math.random() * 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Main text
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🎉 ECONOMIC STIMULUS!', 250, 80);
        
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`B${amount.toLocaleString()} per person!`, 250, 120);
        
        ctx.font = '20px Arial';
        ctx.fillText(`${membersCount} members affected`, 250, 150);
        
        ctx.font = '18px Arial';
        ctx.fillText(`Total distributed: B${(amount * membersCount).toLocaleString()}`, 250, 180);
        
        ctx.font = '14px Arial';
        ctx.fillText(`Authorized by: ${admin.username}`, 250, 220);
        
        return canvas;
    }

    // Create economy statistics chart
    async function createEconomyChart(stats) {
        const canvas = createCanvas(600, 400);
        const ctx = canvas.getContext('2d');
        
        // Background
        const gradient = ctx.createLinearGradient(0, 0, 600, 400);
        gradient.addColorStop(0, '#2c3e50');
        gradient.addColorStop(1, '#34495e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 400);
        
        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('📊 SERVER ECONOMY OVERVIEW', 300, 30);
        
        // Stats boxes
        const boxes = [
            { label: 'Total Economy', value: `B${stats.totalEconomy.toLocaleString()}`, color: '#3498db' },
            { label: 'House Balance', value: `B${stats.houseBalance.toLocaleString()}`, color: '#e74c3c' },
            { label: 'Average Balance', value: `B${stats.averageBalance.toLocaleString()}`, color: '#2ecc71' },
            { label: 'Active Users', value: stats.activeUsers.toString(), color: '#f39c12' }
        ];
        
        boxes.forEach((box, index) => {
            const x = 50 + (index % 2) * 250;
            const y = 80 + Math.floor(index / 2) * 120;
            
            // Box background
            ctx.fillStyle = box.color;
            ctx.fillRect(x, y, 200, 80);
            
            // Box border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, 200, 80);
            
            // Label
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(box.label, x + 100, y + 25);
            
            // Value
            ctx.font = 'bold 18px Arial';
            ctx.fillText(box.value, x + 100, y + 50);
        });
        
        // Simple pie chart for wealth distribution
        const centerX = 450;
        const centerY = 320;
        const radius = 60;
        
        // Wealth categories
        const wealthy = stats.millionaires;
        const middle = Math.max(0, stats.activeUsers - wealthy - stats.poorUsers);
        const poor = stats.poorUsers;
        const total = wealthy + middle + poor;
        
        if (total > 0) {
            let currentAngle = 0;
            
            // Wealthy slice
            const wealthyAngle = (wealthy / total) * 2 * Math.PI;
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + wealthyAngle);
            ctx.closePath();
            ctx.fill();
            currentAngle += wealthyAngle;
            
            // Middle class slice
            const middleAngle = (middle / total) * 2 * Math.PI;
            ctx.fillStyle = '#3498db';
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + middleAngle);
            ctx.closePath();
            ctx.fill();
            currentAngle += middleAngle;
            
            // Poor slice
            const poorAngle = (poor / total) * 2 * Math.PI;
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + poorAngle);
            ctx.closePath();
            ctx.fill();
        }
        
        // Chart title
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Wealth Distribution', centerX, centerY + radius + 20);
        
        return canvas;
    }

    // Function to get a user's Bobby Bucks balance
    function getBobbyBucks(userId) {
        if (!fs.existsSync(bobbyBucksFilePath)) {
            fs.writeFileSync(bobbyBucksFilePath, '', 'utf-8');
        }
        const data = fs.readFileSync(bobbyBucksFilePath, 'utf-8');
        const userRecord = data.split('\n').find(line => line.startsWith(userId));
        return userRecord ? parseInt(userRecord.split(':')[1], 10) : 0;
    }

    // Function to update a user's Bobby Bucks balance
    function updateBobbyBucks(userId, amount) {
        if (!fs.existsSync(bobbyBucksFilePath)) {
            fs.writeFileSync(bobbyBucksFilePath, '', 'utf-8');
        }

        let data = fs.readFileSync(bobbyBucksFilePath, 'utf-8').trim();
        const userRecord = data.split('\n').find(line => line.startsWith(userId));
        let newBalance;

        if (userRecord) {
            const currentBalance = parseInt(userRecord.split(':')[1], 10);
            newBalance = currentBalance + amount;
            data = data.replace(userRecord, `${userId}:${newBalance}`);
        } else {
            newBalance = amount;
            data += `\n${userId}:${newBalance}`;
        }

        fs.writeFileSync(bobbyBucksFilePath, data.trim(), 'utf-8');
        return newBalance;
    }

    // Function to set a user's Bobby Bucks balance directly
    function setBobbyBucks(userId, amount) {
        if (!fs.existsSync(bobbyBucksFilePath)) {
            fs.writeFileSync(bobbyBucksFilePath, '', 'utf-8');
        }

        let data = fs.readFileSync(bobbyBucksFilePath, 'utf-8').trim();
        const userRecord = data.split('\n').find(line => line.startsWith(userId));

        if (userRecord) {
            data = data.replace(userRecord, `${userId}:${amount}`);
        } else {
            data += `\n${userId}:${amount}`;
        }

        fs.writeFileSync(bobbyBucksFilePath, data.trim(), 'utf-8');
    }

    // Functions to handle the House balance
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

    // Function to get top balances for leaderboard (fetches usernames for top N)
    async function getTopBalances(guild, limit = 10) {
        if (!fs.existsSync(bobbyBucksFilePath)) {
            return [];
        }
        const data = fs.readFileSync(bobbyBucksFilePath, 'utf-8').trim();
        if (!data) return [];
        const balances = [];
        const lines = data.split('\n').filter(line => line.includes(':'));
        for (const line of lines) {
            const [userId, balance] = line.split(':');
            balances.push({
                userId: userId,
                balance: parseInt(balance, 10)
            });
        }
        // Sort by balance descending
        balances.sort((a, b) => b.balance - a.balance);
        // Fetch usernames for top N
        for (let i = 0; i < Math.min(limit, balances.length); i++) {
            let member = guild.members.cache.get(balances[i].userId);
            if (!member) {
                try {
                    member = await guild.members.fetch(balances[i].userId);
                } catch (e) {
                    member = null;
                }
            }
            balances[i].username = member ? member.user.username : `Unknown (${balances[i].userId})`;
            balances[i].isBot = member ? member.user.bot : false;
        }
        // For others, use cache only
        for (let i = limit; i < balances.length; i++) {
            let member = guild.members.cache.get(balances[i].userId);
            balances[i].username = member ? member.user.username : `Unknown (${balances[i].userId})`;
            balances[i].isBot = member ? member.user.bot : false;
        }
        // Only show non-bots
        return balances.filter(b => !b.isBot).slice(0, limit);
    }

    // Fast rank lookup using cache only
    function getCachedRank(userId, guild) {
        if (!fs.existsSync(bobbyBucksFilePath)) {
            return 1;
        }
        const data = fs.readFileSync(bobbyBucksFilePath, 'utf-8').trim();
        if (!data) return 1;
        const balances = [];
        const lines = data.split('\n').filter(line => line.includes(':'));
        for (const line of lines) {
            const [uid, balance] = line.split(':');
            const member = guild.members.cache.get(uid);
            if (member && !member.user.bot) {
                balances.push({ userId: uid, balance: parseInt(balance, 10) });
            }
        }
        balances.sort((a, b) => b.balance - a.balance);
        const userIndex = balances.findIndex(user => user.userId === userId);
        return userIndex === -1 ? balances.length + 1 : userIndex + 1;
    }

    // Get user rank
    async function getUserRank(userId, guild) {
        const allBalances = await getTopBalances(guild, 1000);
        const userIndex = allBalances.findIndex(user => user.userId === userId);
        return userIndex === -1 ? allBalances.length + 1 : userIndex + 1;
    }

    // Get total economy value
    function getTotalEconomy() {
        if (!fs.existsSync(bobbyBucksFilePath)) {
            return 0;
        }

        const data = fs.readFileSync(bobbyBucksFilePath, 'utf-8').trim();
        if (!data) return 0;

        const lines = data.split('\n').filter(line => line.includes(':'));
        return lines.reduce((total, line) => {
            const [, balance] = line.split(':');
            return total + parseInt(balance, 10);
        }, 0);
    }

    // Get economy statistics
    function getEconomyStats(guild) {
        const balances = getTopBalances(guild, 1000);
        const totalEconomy = getTotalEconomy();
        const houseBalance = getHouseBalance();
        
        return {
            totalEconomy,
            houseBalance,
            activeUsers: balances.length,
            averageBalance: balances.length > 0 ? Math.floor(totalEconomy / balances.length) : 0,
            richestBalance: balances.length > 0 ? balances[0].balance : 0,
            millionaires: balances.filter(b => b.balance >= 1000000).length,
            poorUsers: balances.filter(b => b.balance < 100).length
        };
    }
};