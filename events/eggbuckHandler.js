const fs = require('fs');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

        // Command to pay another user Bobby Bucks
        if (args[0] === '!pay' && args[1] && args[2]) {
            const senderId = message.author.id;
            const mentionedUser = message.mentions.users.first() || message.guild.members.cache.find(member => member.user.username === args[1])?.user;
            const amount = parseInt(args[2], 10);

            if (!mentionedUser) {
                return message.channel.send('❌ User not found. Please mention a valid user.');
            }

            if (mentionedUser.bot) {
                return message.channel.send('❌ You cannot pay bots!');
            }

            if (mentionedUser.id === senderId) {
                return message.channel.send('❌ You cannot pay yourself!');
            }

            if (isNaN(amount) || amount <= 0) {
                return message.channel.send('❌ Invalid amount specified. Amount must be a positive number.');
            }

            const senderBalance = getBobbyBucks(senderId);

            if (senderBalance < amount) {
                const insufficientFunds = await createInsufficientFundsCard(message.author, senderBalance, amount);
                const attachment = new AttachmentBuilder(insufficientFunds.toBuffer(), { name: 'insufficient-funds.png' });

                const embed = new EmbedBuilder()
                    .setTitle('❌ Payment Failed - Insufficient Funds')
                    .setColor('#ff0000')
                    .setDescription('**You don\'t have enough Bobby Bucks for this transfer**')
                    .setImage('attachment://insufficient-funds.png')
                    .addFields(
                        { name: '💳 Your Balance', value: `B${senderBalance.toLocaleString()}`, inline: true },
                        { name: '💸 Attempted Transfer', value: `B${amount.toLocaleString()}`, inline: true },
                        { name: '💰 Amount Needed', value: `B${(amount - senderBalance).toLocaleString()}`, inline: true }
                    )
                    .setFooter({ text: 'Earn more Bobby Bucks through games and activities!' })
                    .setTimestamp();

                return message.channel.send({ embeds: [embed], files: [attachment] });
            }

            // Process the transfer
            const senderOldBalance = senderBalance;
            const recipientOldBalance = getBobbyBucks(mentionedUser.id);
            
            updateBobbyBucks(senderId, -amount); // Deduct from sender
            updateBobbyBucks(mentionedUser.id, amount); // Add to recipient
            
            const senderNewBalance = getBobbyBucks(senderId);
            const recipientNewBalance = getBobbyBucks(mentionedUser.id);

            // Create payment receipt
            const paymentReceipt = await createPaymentReceipt(message.author, mentionedUser, amount, senderOldBalance, senderNewBalance, recipientOldBalance, recipientNewBalance);
            const attachment = new AttachmentBuilder(paymentReceipt.toBuffer(), { name: 'payment-receipt.png' });

            const embed = new EmbedBuilder()
                .setTitle('💸 Payment Successful - Transfer Complete')
                .setColor('#00ff00')
                .setDescription(`**${message.author.username}** paid **${mentionedUser.username}**`)
                .setImage('attachment://payment-receipt.png')
                .addFields(
                    { name: '💰 Amount Transferred', value: `**B${amount.toLocaleString()}**`, inline: true },
                    { name: '💳 Sender Balance', value: `B${senderNewBalance.toLocaleString()}`, inline: true },
                    { name: '💳 Recipient Balance', value: `B${recipientNewBalance.toLocaleString()}`, inline: true }
                )
                .setFooter({ text: 'Transaction processed by Bobby Bucks Bank' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // Command to beg for Bobby Bucks with interactive tip jar
        if (args[0] === '!beg') {
            const userId = message.author.id;
            const balance = getBobbyBucks(userId);
            
            // Create tip jar visualization
            const tipJarImage = await createTipJarCard(message.author, balance);
            const attachment = new AttachmentBuilder(tipJarImage.toBuffer(), { name: 'tip-jar.png' });

            // Create donate button
            const donateButton = new ButtonBuilder()
                .setCustomId(`donate_${userId}_${message.id}`)
                .setLabel('💰 Donate (1-10 BB)')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🪙');

            const row = new ActionRowBuilder().addComponents(donateButton);

            const embed = new EmbedBuilder()
                .setTitle('🥺 Please Help - Tip Jar')
                .setColor('#ff9500')
                .setDescription(`**${message.author.username}** is asking for your kindness!`)
                .setImage('attachment://tip-jar.png')
                .addFields(
                    { name: '💳 Current Balance', value: `B${balance.toLocaleString()}`, inline: true },
                    { name: '🎲 Donation Range', value: '1-10 Bobby Bucks', inline: true },
                    { name: '🕐 Status', value: 'Accepting donations', inline: true }
                )
                .setFooter({ text: 'Click the button below to make a random donation!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment], components: [row] });
        }

        // Economy stats command
        if (args[0] === '!economy') {
            const stats = await getEconomyStats(message.guild);
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

    // Handle button interactions for donations
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        // Handle donation button clicks
        if (interaction.customId.startsWith('donate_')) {
            const parts = interaction.customId.split('_');
            const beggarId = parts[1];
            const messageId = parts[2];
            const donorId = interaction.user.id;

            // Prevent self-donation
            if (donorId === beggarId) {
                return interaction.reply({
                    content: '❌ You cannot donate to yourself!',
                    ephemeral: true
                });
            }

            // Check if donor has enough money (at least 1 Bobby Buck)
            const donorBalance = getBobbyBucks(donorId);
            if (donorBalance < 1) {
                return interaction.reply({
                    content: '❌ You need at least 1 Bobby Buck to donate!',
                    ephemeral: true
                });
            }

            // Generate random donation amount (1-10)
            const donationAmount = Math.floor(Math.random() * 10) + 1;
            
            // Check if donor has enough for the random amount
            const actualDonation = Math.min(donationAmount, donorBalance);
            
            // Process the donation
            const donorOldBalance = donorBalance;
            const beggarOldBalance = getBobbyBucks(beggarId);
            
            updateBobbyBucks(donorId, -actualDonation);
            updateBobbyBucks(beggarId, actualDonation);
            
            const donorNewBalance = getBobbyBucks(donorId);
            const beggarNewBalance = getBobbyBucks(beggarId);

            // Get user objects
            const beggar = await interaction.guild.members.fetch(beggarId);
            const donor = interaction.user;

            // Create donation receipt
            const donationReceipt = await createDonationReceipt(donor, beggar.user, actualDonation, donorOldBalance, donorNewBalance, beggarOldBalance, beggarNewBalance);
            const attachment = new AttachmentBuilder(donationReceipt.toBuffer(), { name: 'donation-receipt.png' });

            const embed = new EmbedBuilder()
                .setTitle('💝 Donation Successful - Good Karma!')
                .setColor('#00ff00')
                .setDescription(`**${donor.username}** donated to **${beggar.user.username}**!`)
                .setImage('attachment://donation-receipt.png')
                .addFields(
                    { name: '💰 Amount Donated', value: `**B${actualDonation.toLocaleString()}**`, inline: true },
                    { name: '💳 Your Balance', value: `B${donorNewBalance.toLocaleString()}`, inline: true },
                    { name: '🎯 Random Roll', value: `Rolled: ${donationAmount}`, inline: true }
                )
                .setFooter({ text: 'Thank you for your generosity! ❤️' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], files: [attachment] });

            // Update the original tip jar message to show latest donation
            try {
                const originalMessage = await interaction.channel.messages.fetch(messageId);
                const updatedTipJar = await createTipJarCard(beggar.user, beggarNewBalance, donor.username, actualDonation);
                const updatedAttachment = new AttachmentBuilder(updatedTipJar.toBuffer(), { name: 'tip-jar-updated.png' });

                const updatedEmbed = new EmbedBuilder()
                    .setTitle('🥺 Please Help - Tip Jar')
                    .setColor('#ff9500')
                    .setDescription(`**${beggar.user.username}** is asking for your kindness!`)
                    .setImage('attachment://tip-jar-updated.png')
                    .addFields(
                        { name: '💳 Current Balance', value: `B${beggarNewBalance.toLocaleString()}`, inline: true },
                        { name: '🎲 Donation Range', value: '1-10 Bobby Bucks', inline: true },
                        { name: '🕐 Status', value: 'Accepting donations', inline: true }
                    )
                    .setFooter({ text: `Latest: ${donor.username} donated B${actualDonation}!` })
                    .setTimestamp();

                await originalMessage.edit({ embeds: [updatedEmbed], files: [updatedAttachment] });
            } catch (error) {
                console.error('Error updating tip jar:', error);
            }
        }
    });

    // Create balance card visualization
    async function createBalanceCard(user, balance) {
        const canvas = createCanvas(500, 300);
        const ctx = canvas.getContext('2d');
        
        // Determine card tier
        const cardTier = balance > 10000 ? 'PLATINUM' : balance > 5000 ? 'GOLD' : balance > 1000 ? 'SILVER' : 'BRONZE';
        
        // Card background gradient with tier-specific colors
        const gradient = ctx.createLinearGradient(0, 0, 500, 300);
        if (cardTier === 'PLATINUM') {
            gradient.addColorStop(0, '#e8e8e8');
            gradient.addColorStop(0.5, '#c0c0c0');
            gradient.addColorStop(1, '#a8a8a8');
        } else if (cardTier === 'GOLD') {
            gradient.addColorStop(0, '#ffd700');
            gradient.addColorStop(0.5, '#ffb347');
            gradient.addColorStop(1, '#ff8c00');
        } else if (cardTier === 'SILVER') {
            gradient.addColorStop(0, '#c0c0c0');
            gradient.addColorStop(0.5, '#a0a0a0');
            gradient.addColorStop(1, '#808080');
        } else {
            gradient.addColorStop(0, '#cd7f32');
            gradient.addColorStop(0.5, '#a0522d');
            gradient.addColorStop(1, '#8b4513');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 500, 300);
        
        // Add special patterns based on tier
        if (cardTier === 'PLATINUM') {
            // Diamond pattern for Platinum
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            for (let x = 0; x < 500; x += 40) {
                for (let y = 0; y < 300; y += 40) {
                    ctx.save();
                    ctx.translate(x + 20, y + 20);
                    ctx.rotate(Math.PI / 4);
                    ctx.fillRect(-8, -8, 16, 16);
                    ctx.restore();
                }
            }
            
            // Sparkle effect
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            for (let i = 0; i < 20; i++) {
                const x = Math.random() * 500;
                const y = Math.random() * 300;
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (cardTier === 'GOLD') {
            // Radial burst pattern for Gold
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
            ctx.lineWidth = 2;
            const centerX = 250;
            const centerY = 150;
            for (let i = 0; i < 12; i++) {
                const angle = (i * Math.PI * 2) / 12;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(centerX + Math.cos(angle) * 120, centerY + Math.sin(angle) * 80);
                ctx.stroke();
            }
            
            // Golden particles
            ctx.fillStyle = 'rgba(255, 215, 0, 0.6)';
            for (let i = 0; i < 15; i++) {
                const x = Math.random() * 500;
                const y = Math.random() * 300;
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (cardTier === 'SILVER') {
            // Crosshatch pattern for Silver
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            for (let i = 0; i < 500; i += 30) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i + 150, 300);
                ctx.stroke();
                
                ctx.beginPath();
                ctx.moveTo(i, 300);
                ctx.lineTo(i + 150, 0);
                ctx.stroke();
            }
        } else {
            // Simple dots pattern for Bronze
            ctx.fillStyle = 'rgba(139, 69, 19, 0.3)';
            for (let x = 20; x < 500; x += 60) {
                for (let y = 20; y < 300; y += 60) {
                    ctx.beginPath();
                    ctx.arc(x, y, 5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        
        // Card border with tier-specific styling
        let borderColor, borderWidth;
        if (cardTier === 'PLATINUM') {
            borderColor = '#e5e5e5';
            borderWidth = 4;
            // Double border for platinum
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(8, 8, 484, 284);
        } else if (cardTier === 'GOLD') {
            borderColor = '#ffd700';
            borderWidth = 4;
        } else if (cardTier === 'SILVER') {
            borderColor = '#c0c0c0';
            borderWidth = 3;
        } else {
            borderColor = '#8b4513';
            borderWidth = 2;
        }
        
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;
        ctx.strokeRect(10, 10, 480, 280);
        
        // Bank logo area with tier-specific colors
        const logoColor = cardTier === 'PLATINUM' ? '#333333' : 
                         cardTier === 'GOLD' ? '#8b4513' : 
                         cardTier === 'SILVER' ? '#2c2c2c' : '#ffffff';
        ctx.fillStyle = logoColor;
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('🏦 BOBBY BUCKS BANK', 30, 45);
        
        // Tier indicator with special styling
        if (cardTier === 'PLATINUM') {
            ctx.fillStyle = '#333333';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('💎 PLATINUM ELITE 💎', 30, 65);
        } else if (cardTier === 'GOLD') {
            ctx.fillStyle = '#8b4513';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('⭐ GOLD PREMIUM ⭐', 30, 65);
        }
        
        try {
            // User avatar with tier-specific border effects
            const avatarURL = user.displayAvatarURL({ extension: 'png', size: 128 });
            const avatar = await loadImageFromURL(avatarURL);
            
            // Special avatar effects for higher tiers
            if (cardTier === 'PLATINUM') {
                // Glowing effect for platinum
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 20;
            } else if (cardTier === 'GOLD') {
                // Golden glow
                ctx.shadowColor = '#ffd700';
                ctx.shadowBlur = 15;
            }
            
            // Circular avatar
            ctx.save();
            ctx.beginPath();
            ctx.arc(420, 80, 40, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, 380, 40, 80, 80);
            ctx.restore();
            
            // Reset shadow
            ctx.shadowBlur = 0;
            
            // Avatar border with tier styling
            if (cardTier === 'PLATINUM') {
                // Triple border for platinum
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(420, 80, 42, 0, Math.PI * 2);
                ctx.stroke();
                
                ctx.strokeStyle = '#e5e5e5';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(420, 80, 38, 0, Math.PI * 2);
                ctx.stroke();
            } else {
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(420, 80, 40, 0, Math.PI * 2);
                ctx.stroke();
            }
        } catch (error) {
            // Fallback avatar with tier colors
            const avatarColor = cardTier === 'PLATINUM' ? '#e5e5e5' :
                              cardTier === 'GOLD' ? '#ffd700' :
                              cardTier === 'SILVER' ? '#c0c0c0' : '#7289da';
            ctx.fillStyle = avatarColor;
            ctx.beginPath();
            ctx.arc(420, 80, 40, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = '30px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('👤', 420, 90);
        }
        
        // Account holder name with tier-appropriate colors
        const textColor = cardTier === 'PLATINUM' ? '#333333' :
                         cardTier === 'GOLD' ? '#8b4513' :
                         cardTier === 'SILVER' ? '#2c2c2c' : '#ffffff';
        ctx.fillStyle = textColor;
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('ACCOUNT HOLDER', 30, 90);
        ctx.font = '20px Arial';
        ctx.fillText(user.username.toUpperCase(), 30, 115);
        
        // Account number (fake) with appropriate contrast
        ctx.font = '14px Arial';
        ctx.fillStyle = cardTier === 'BRONZE' ? '#cccccc' : 'rgba(0,0,0,0.6)';
        ctx.fillText(`ACCOUNT: **** **** **** ${user.id.slice(-4)}`, 30, 140);
        
        // Balance with tier-specific styling
        const balanceColor = cardTier === 'PLATINUM' ? '#333333' :
                           cardTier === 'GOLD' ? '#8b4513' :
                           cardTier === 'SILVER' ? '#2c2c2c' : '#ffd700';
        ctx.fillStyle = balanceColor;
        ctx.font = 'bold 18px Arial';
        ctx.fillText('CURRENT BALANCE', 30, 180);
        
        // Special balance display for Platinum
        if (cardTier === 'PLATINUM') {
            ctx.font = 'bold 40px Arial';
            ctx.fillStyle = '#333333';
            ctx.fillText(`B${balance.toLocaleString()}`, 30, 220);
            // Add subtle glow effect
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 5;
            ctx.fillText(`B${balance.toLocaleString()}`, 30, 220);
            ctx.shadowBlur = 0;
        } else {
            ctx.font = 'bold 36px Arial';
            ctx.fillText(`B${balance.toLocaleString()}`, 30, 220);
        }
        
        // Card type with special symbols
        const tierSymbols = {
            'PLATINUM': '💎',
            'GOLD': '⭐',
            'SILVER': '🥈',
            'BRONZE': '🥉'
        };
        
        ctx.fillStyle = textColor;
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`${tierSymbols[cardTier]} ${cardTier} MEMBER`, 470, 250);
        
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
    async function getEconomyStats(guild) {
        const balances = await getTopBalances(guild, 1000);
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

    // Create tip jar visualization
    async function createTipJarCard(user, balance, lastDonor = null, lastAmount = null) {
        const canvas = createCanvas(500, 400);
        const ctx = canvas.getContext('2d');
        
        // Background gradient
        const gradient = ctx.createLinearGradient(0, 0, 500, 400);
        gradient.addColorStop(0, '#2c3e50');
        gradient.addColorStop(1, '#34495e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 500, 400);
        
        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🥺 TIP JAR 🥺', 250, 40);
        
        try {
            // User avatar (larger for tip jar)
            const avatarURL = user.displayAvatarURL({ extension: 'png', size: 256 });
            const avatar = await loadImageFromURL(avatarURL);
            
            // Draw circular avatar
            ctx.save();
            ctx.beginPath();
            ctx.arc(150, 120, 60, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, 90, 60, 120, 120);
            ctx.restore();
            
            // Avatar border
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(150, 120, 60, 0, Math.PI * 2);
            ctx.stroke();
        } catch (error) {
            // Fallback avatar
            ctx.fillStyle = '#7289da';
            ctx.beginPath();
            ctx.arc(150, 120, 60, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = '40px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('👤', 150, 135);
        }
        
        // Tip jar (simple jar shape)
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(300, 80, 120, 140);
        ctx.fillStyle = '#a0522d';
        ctx.fillRect(310, 90, 100, 120);
        
        // Jar label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('TIPS', 360, 130);
        ctx.font = '12px Arial';
        ctx.fillText('💰', 360, 150);
        
        // Coins in jar (visual representation of balance)
        const coinCount = Math.min(Math.floor(balance / 100), 10);
        ctx.fillStyle = '#ffd700';
        for (let i = 0; i < coinCount; i++) {
            const x = 320 + (i % 4) * 20;
            const y = 200 - Math.floor(i / 4) * 15;
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // User info
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(user.username, 50, 250);
        
        ctx.font = '16px Arial';
        ctx.fillText(`Current Balance: B${balance.toLocaleString()}`, 50, 280);
        
        // Pleading message
        ctx.font = 'italic 14px Arial';
        ctx.fillText('Please spare some Bobby Bucks... 🥺', 50, 310);
        
        // Last donation info (if any)
        if (lastDonor && lastAmount) {
            ctx.fillStyle = '#00ff00';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(`💚 ${lastDonor} just donated B${lastAmount}!`, 50, 340);
        }
        
        // Instructions
        ctx.fillStyle = '#cccccc';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Click the donate button to give 1-10 Bobby Bucks!', 250, 380);
        
        return canvas;
    }

    // Create donation receipt
    async function createDonationReceipt(donor, beggar, amount, donorOldBalance, donorNewBalance, beggarOldBalance, beggarNewBalance) {
        const canvas = createCanvas(450, 400);
        const ctx = canvas.getContext('2d');
        
        // Receipt background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 450, 400);
        
        // Header
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('💝 DONATION RECEIPT', 225, 30);
        ctx.font = '16px Arial';
        ctx.fillText('Bobby Bucks Charity Foundation', 225, 55);
        
        // Dashed line
        ctx.strokeStyle = '#cccccc';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(20, 75);
        ctx.lineTo(430, 75);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Donation details
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('DONATION DETAILS', 20, 105);
        
        ctx.font = '14px Arial';
        ctx.fillText(`Donor: ${donor.username}`, 20, 130);
        ctx.fillText(`Recipient: ${beggar.username}`, 20, 150);
        ctx.fillText(`Amount: B${amount.toLocaleString()}`, 20, 170);
        ctx.fillText(`Type: Random Charity Donation`, 20, 190);
        
        // Balance changes
        ctx.font = 'bold 16px Arial';
        ctx.fillText('BALANCE CHANGES', 20, 220);
        
        ctx.font = '14px Arial';
        ctx.fillText(`${donor.username}'s Balance:`, 20, 245);
        ctx.fillText(`  Before: B${donorOldBalance.toLocaleString()}`, 30, 265);
        ctx.fillText(`  After: B${donorNewBalance.toLocaleString()}`, 30, 285);
        
        ctx.fillText(`${beggar.username}'s Balance:`, 20, 315);
        ctx.fillText(`  Before: B${beggarOldBalance.toLocaleString()}`, 30, 335);
        ctx.fillText(`  After: B${beggarNewBalance.toLocaleString()}`, 30, 355);
        
        // Footer
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Thank you for your generous donation! ❤️', 225, 385);
        
        return canvas;
    }

    // Create payment receipt
    async function createPaymentReceipt(sender, recipient, amount, senderOldBalance, senderNewBalance, recipientOldBalance, recipientNewBalance) {
        const canvas = createCanvas(450, 300);
        const ctx = canvas.getContext('2d');
        
        // Receipt background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 450, 300);
        
        // Header
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('💸 PAYMENT RECEIPT', 225, 30);
        ctx.font = '16px Arial';
        ctx.fillText('Bobby Bucks Transaction', 225, 55);
        
        // Dashed line
        ctx.strokeStyle = '#cccccc';
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(20, 75);
        ctx.lineTo(430, 75);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Payment details
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('PAYMENT DETAILS', 20, 105);
        
        ctx.font = '14px Arial';
        ctx.fillText(`Sender: ${sender.username}`, 20, 130);
        ctx.fillText(`Recipient: ${recipient.username}`, 20, 150);
        ctx.fillText(`Amount: B${amount.toLocaleString()}`, 20, 170);
        ctx.fillText(`Type: Direct Transfer`, 20, 190);
        
        // Balance changes
        ctx.font = 'bold 16px Arial';
        ctx.fillText('BALANCE CHANGES', 20, 220);
        
        ctx.font = '14px Arial';
        ctx.fillText(`${sender.username}'s Balance:`, 20, 245);
        ctx.fillText(`  Before: B${senderOldBalance.toLocaleString()}`, 30, 265);
        ctx.fillText(`  After: B${senderNewBalance.toLocaleString()}`, 30, 285);
        
        ctx.fillText(`${recipient.username}'s Balance:`, 20, 315);
        ctx.fillText(`  Before: B${recipientOldBalance.toLocaleString()}`, 30, 335);
        ctx.fillText(`  After: B${recipientNewBalance.toLocaleString()}`, 30, 355);
        
        // Footer
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Thank you for using Bobby Bucks Bank!', 225, 385);
        
        return canvas;
    }
};