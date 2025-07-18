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

    // Handle button interactions (only for team builder)
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;
        // Only handle REPO team builder interactions
        const parts = interaction.customId.split('_');
        const action = parts[0];
        // Always reconstruct teamId with repo_team_ prefix
        const teamId = parts.slice(1).join('_');
        const teamActions = ['join', 'leave', 'disband'];
        if (!teamActions.includes(action)) return;
        
        const team = activeTeams.get(teamId);
        
        console.log('Button interaction:', interaction.customId);
        console.log('Parsed action:', action, 'teamId:', teamId);
        console.log('Looking for team:', teamId);
        console.log('Active teams:', Array.from(activeTeams.keys()));

        if (!team) {
            // Team not found, reply with error and do not crash
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ This REPO squad is no longer active or has expired. Please create a new squad!',
                        ephemeral: true
                    });
                } catch (err) {
                    console.error('Error replying to interaction (team missing):', err);
                }
            }
            return;
        }

        const userId = interaction.user.id;
        const userInfo = {
            id: userId,
            username: interaction.user.username,
            displayName: interaction.user.displayName || interaction.user.username,
            avatarURL: interaction.user.displayAvatarURL({ extension: 'png', size: 128 })
        };

        try {
            if (action === 'join') {
                // Check if user is already in team
                if (userId === team.leader.id || team.members.some(member => member.id === userId)) {
                    return await interaction.reply({
                        content: '❌ You are already in this REPO squad!',
                        ephemeral: true
                    });
                }

                // Check if team is full
                if (getTotalMembers(team) >= TEAM_SIZE) {
                    return await interaction.reply({
                        content: '❌ This REPO squad is already full!',
                        ephemeral: true
                    });
                }

                // Add user to team
                team.members.push(userInfo);

                // Update the team display first
                const isFull = getTotalMembers(team) >= TEAM_SIZE;
                const updatedEmbed = await createTeamEmbed(team);
                const updatedComponents = createTeamButtons(teamId, isFull);

                if (!interaction.replied && !interaction.deferred) {
                    await interaction.update({
                        embeds: [updatedEmbed.embed],
                        files: updatedEmbed.files,
                        components: [updatedComponents]
                    });

                    if (isFull) {
                        const celebrationEmbed = new EmbedBuilder()
                            .setColor('#32cd32')
                            .setTitle('🎉 REPO SQUAD COMPLETE!')
                            .setDescription('Your horror squad is ready to face the darkness! Stay together and survive!')
                            .setTimestamp();

                        await interaction.followUp({
                            embeds: [celebrationEmbed]
                        });
                    }
                }

                // If team is full, celebrate!
                if (isFull) {
                    // Clear the resend timer since team is full
                    if (team.resendTimer) {
                        clearTimeout(team.resendTimer);
                        team.resendTimer = null;
                    }
                    
                    const celebrationEmbed = new EmbedBuilder()
                        .setColor('#32cd32')
                        .setTitle('🎉 REPO SQUAD COMPLETE!')
                        .setDescription('Your horror squad is ready to face the darkness! Stay together and survive!')
                        .setTimestamp();

                    await interaction.followUp({
                        embeds: [celebrationEmbed]
                    });

                    // Auto-delete team after 5 minutes when full
                    setTimeout(() => {
                        activeTeams.delete(teamId);
                        interaction.message.delete().catch(() => {});
                    }, 5 * 60 * 1000);
                }

            } else if (action === 'leave') {
                // Check if user is the leader
                if (userId === team.leader.id) {
                    return await interaction.reply({
                        content: '❌ Squad leaders cannot abandon their team! The squad will auto-delete after 30 minutes if not full.',
                        ephemeral: true
                    });
                }

                // Check if user is in team
                const memberIndex = team.members.findIndex(member => member.id === userId);
                if (memberIndex === -1) {
                    return await interaction.reply({
                        content: '❌ You are not in this REPO squad!',
                        ephemeral: true
                    });
                }

                // Remove user from team
                team.members.splice(memberIndex, 1);

                // Update the team display
                const isFull = getTotalMembers(team) >= TEAM_SIZE;
                const updatedEmbed = await createTeamEmbed(team);
                const updatedComponents = createTeamButtons(teamId, isFull);

                await interaction.update({
                    embeds: [updatedEmbed.embed],
                    files: updatedEmbed.files,
                    components: [updatedComponents]
                });

            } else if (action === 'disband') {
                // Only leader can disband
                if (userId !== team.leader.id) {
                    return await interaction.reply({
                        content: '❌ Only the squad leader can disband the team!',
                        ephemeral: true
                    });
                }

                // Clear the resend timer before disbanding
                if (team.resendTimer) {
                    clearTimeout(team.resendTimer);
                }

                // Remove team from active teams first
                activeTeams.delete(teamId);
                
                // Try to update the interaction to show disbanded message
                try {
                    await interaction.update({
                        embeds: [createDisbandedEmbed()],
                        components: []
                    });

                    // Delete the message after 5 seconds
                    setTimeout(() => {
                        interaction.message.delete().catch(() => {});
                    }, 5000);
                } catch (updateError) {
                    console.error('Error updating interaction for disband:', updateError);
                    // If update fails, try to delete the message directly
                    try {
                        await interaction.message.delete();
                    } catch (deleteError) {
                        console.error('Error deleting message after failed update:', deleteError);
                    }
                }

                return;
            }
        } catch (error) {
            console.error('Error handling button interaction:', error);
            
            // Try to respond with an error message if we haven't responded yet
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ An error occurred processing your request. Please try again.',
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error('Error sending error reply:', replyError);
            }
        }
    });

    // Helper function to create team embed with visual display
    async function createTeamEmbed(team) {
        const totalMembers = getTotalMembers(team);
        
        // Create the visual team display
        const teamImageBuffer = await createTeamVisualization(team);
        const attachment = new AttachmentBuilder(teamImageBuffer, { name: 'repo-squad-display.png' });
        
        const embed = new EmbedBuilder()
            .setColor(totalMembers >= TEAM_SIZE ? '#32cd32' : '#8b0000')
            .setTitle('👻 REPO Squad Builder')
            .setDescription(`**Squad Leader:** ${team.leader.displayName}\n**Squad Status:** ${totalMembers}/${TEAM_SIZE} Survivors`)
            .setImage('attachment://repo-squad-display.png')
            .addFields({
                name: '🔦 Horror Squad',
                value: formatTeamMembersList(team),
                inline: false
            })
            .setFooter({ 
                text: totalMembers < TEAM_SIZE ? 'Click the buttons below to join or leave the squad!' : 'Squad is ready! Time to face the horrors!'
            })
            .setTimestamp();

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

    // Helper function to create team buttons
    function createTeamButtons(teamId, isFull) {
        // Always use the full teamId in customId
        const joinButton = new ButtonBuilder()
            .setCustomId(`join_${teamId}`)
            .setLabel('Join Squad')
            .setStyle(ButtonStyle.Success)
            .setEmoji('➕')
            .setDisabled(isFull);

        const leaveButton = new ButtonBuilder()
            .setCustomId(`leave_${teamId}`)
            .setLabel('Leave Squad')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('➖');

        const disbandButton = new ButtonBuilder()
            .setCustomId(`disband_${teamId}`)
            .setLabel('Disband Squad')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🗑️');

        return new ActionRowBuilder().addComponents(joinButton, leaveButton, disbandButton);
    }

    // Helper function to format team members list (simplified for visual display)
    function formatTeamMembersList(team) {
        const members = [];
        
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