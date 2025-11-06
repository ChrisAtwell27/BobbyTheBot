const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const Bounty = require('../database/models/Bounty');
const { getBobbyBucks, updateBobbyBucks } = require('../database/helpers/economyHelpers');
const { TARGET_GUILD_ID } = require('../config/guildConfig');
const { insufficientFundsMessage, invalidUsageMessage, permissionDeniedMessage } = require('../utils/errorMessages');

// Configuration
const MIN_BOUNTY = 50;
const MAX_BOUNTY = 10000;
const BOUNTY_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

// Generate unique bounty ID
function generateBountyId() {
    return `bounty_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Format bounty embed
function formatBountyEmbed(bounty, detailed = false) {
    const statusEmojis = {
        active: '🟢',
        claimed: '🟡',
        expired: '⚫',
        cancelled: '🔴'
    };

    const timeLeft = bounty.expiresAt - Date.now();
    const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

    let timeString;
    if (timeLeft <= 0) {
        timeString = 'Expired';
    } else if (hoursLeft > 0) {
        timeString = `${hoursLeft}h ${minutesLeft}m`;
    } else {
        timeString = `${minutesLeft}m`;
    }

    const embed = new EmbedBuilder()
        .setTitle(`${statusEmojis[bounty.status]} Bounty #${bounty.bountyId.split('_')[1].substr(0, 6)}`)
        .setColor(bounty.status === 'active' ? '#00ff00' : bounty.status === 'claimed' ? '#ffa500' : '#888888')
        .setDescription(`**${bounty.description}**`)
        .addFields(
            { name: '💰 Reward', value: `🍯${bounty.reward.toLocaleString()}`, inline: true },
            { name: '👤 Creator', value: bounty.creatorName, inline: true },
            { name: '⏰ Time Left', value: timeString, inline: true }
        )
        .setFooter({ text: `Posted ${new Date(bounty.createdAt).toLocaleString()}` })
        .setTimestamp();

    if (detailed) {
        embed.addFields({ name: '📋 Status', value: bounty.status.toUpperCase(), inline: true });

        if (bounty.claimedBy) {
            embed.addFields(
                { name: '🎯 Claimed By', value: bounty.claimedByName || 'Unknown', inline: true }
            );
        }

        if (bounty.proofUrl) {
            embed.addFields({ name: '🔗 Proof', value: bounty.proofUrl, inline: false });
        }
    }

    return embed;
}

// Post a new bounty
async function postBounty(message, args) {
    try {
        // Parse command: !postbounty <amount> <description>
        if (args.length < 2) {
            return message.reply(invalidUsageMessage('postbounty', '!postbounty <amount> <description>', '!postbounty 500 First person to get a pentakill in Valorant'));
        }

        const amount = parseInt(args[0], 10);
        const description = args.slice(1).join(' ');

        // Validate amount
        if (isNaN(amount) || amount < MIN_BOUNTY || amount > MAX_BOUNTY) {
            return message.reply(`❌ **Invalid Amount**\n\nBounty must be between 🍯${MIN_BOUNTY} and 🍯${MAX_BOUNTY}.`);
        }

        // Validate description length
        if (description.length < 10) {
            return message.reply('❌ **Description Too Short**\n\nBounty description must be at least 10 characters. Be specific!');
        }

        if (description.length > 500) {
            return message.reply('❌ **Description Too Long**\n\nBounty description must be under 500 characters.');
        }

        // Check user balance
        const balance = await getBobbyBucks(message.author.id);
        if (balance < amount) {
            return message.reply(insufficientFundsMessage(message.author.username, balance, amount));
        }

        // Deduct honey (escrow)
        await updateBobbyBucks(message.author.id, -amount);

        // Create bounty
        const bountyId = generateBountyId();
        const expiresAt = new Date(Date.now() + BOUNTY_DURATION);

        const bounty = await Bounty.create({
            bountyId,
            creatorId: message.author.id,
            creatorName: message.author.username,
            description,
            reward: amount,
            status: 'active',
            channelId: message.channel.id,
            guildId: message.guild.id,
            expiresAt
        });

        // Send bounty announcement
        const embed = formatBountyEmbed(bounty);
        embed.setDescription(`**${description}**\n\n✅ Bounty posted! First person to complete this and provide proof wins **🍯${amount.toLocaleString()}**!`);

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`claim_bounty_${bountyId}`)
                .setLabel('Claim Bounty')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎯')
        );

        const announcementMsg = await message.channel.send({
            content: '🎯 **NEW BOUNTY POSTED!**',
            embeds: [embed],
            components: [buttons]
        });

        // Save message ID for future updates
        bounty.messageId = announcementMsg.id;
        await bounty.save();

        console.log(`[BOUNTY] Created bounty ${bountyId} by ${message.author.username} for ${amount} honey`);

    } catch (error) {
        console.error('[BOUNTY] Error posting bounty:', error);
        message.reply('❌ Failed to post bounty. Please try again.');
    }
}

// List active bounties
async function listBounties(message) {
    try {
        const bounties = await Bounty.find({
            guildId: message.guild.id,
            status: 'active',
            expiresAt: { $gt: new Date() }
        }).sort({ createdAt: -1 }).limit(10);

        if (bounties.length === 0) {
            return message.reply('📋 **No Active Bounties**\n\nThere are no active bounties right now. Be the first to post one with `!postbounty`!');
        }

        const embed = new EmbedBuilder()
            .setTitle('🎯 Active Bounties')
            .setColor('#00ff00')
            .setDescription('Complete any of these challenges to earn honey!')
            .setFooter({ text: `Showing ${bounties.length} active bounties` })
            .setTimestamp();

        for (const bounty of bounties) {
            const timeLeft = bounty.expiresAt - Date.now();
            const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));

            const shortId = bounty.bountyId.split('_')[1].substr(0, 6);

            embed.addFields({
                name: `#${shortId} - 🍯${bounty.reward.toLocaleString()}`,
                value: `${bounty.description.substring(0, 100)}${bounty.description.length > 100 ? '...' : ''}\n⏰ ${hoursLeft}h left • 👤 ${bounty.creatorName}`,
                inline: false
            });
        }

        message.reply({ embeds: [embed] });

    } catch (error) {
        console.error('[BOUNTY] Error listing bounties:', error);
        message.reply('❌ Failed to load bounties. Please try again.');
    }
}

// View specific bounty
async function viewBounty(message, bountyId) {
    try {
        // Find by partial ID match
        const bounty = await Bounty.findOne({
            bountyId: { $regex: bountyId },
            guildId: message.guild.id
        });

        if (!bounty) {
            return message.reply('❌ **Bounty Not Found**\n\nCouldn\'t find a bounty with that ID. Use `!bounties` to see active bounties.');
        }

        const embed = formatBountyEmbed(bounty, true);

        const buttons = new ActionRowBuilder();

        if (bounty.status === 'active') {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`claim_bounty_${bounty.bountyId}`)
                    .setLabel('Claim Bounty')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎯')
            );
        }

        if (bounty.creatorId === message.author.id && bounty.status === 'active') {
            buttons.addComponents(
                new ButtonBuilder()
                    .setCustomId(`cancel_bounty_${bounty.bountyId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );
        }

        await message.reply({
            embeds: [embed],
            components: buttons.components.length > 0 ? [buttons] : []
        });

    } catch (error) {
        console.error('[BOUNTY] Error viewing bounty:', error);
        message.reply('❌ Failed to load bounty details.');
    }
}

// Cancel bounty (creator only)
async function cancelBounty(message, bountyId) {
    try {
        const bounty = await Bounty.findOne({
            bountyId: { $regex: bountyId },
            guildId: message.guild.id
        });

        if (!bounty) {
            return message.reply('❌ **Bounty Not Found**');
        }

        if (bounty.creatorId !== message.author.id) {
            return message.reply('❌ **Permission Denied**\n\nYou can only cancel your own bounties.');
        }

        if (bounty.status !== 'active') {
            return message.reply(`❌ **Cannot Cancel**\n\nThis bounty is already ${bounty.status}.`);
        }

        // Refund honey
        await updateBobbyBucks(bounty.creatorId, bounty.reward);

        // Update status
        bounty.status = 'cancelled';
        await bounty.save();

        message.reply(`✅ **Bounty Cancelled**\n\n🍯${bounty.reward.toLocaleString()} has been refunded to your account.`);

        console.log(`[BOUNTY] Cancelled bounty ${bounty.bountyId} by ${message.author.username}`);

    } catch (error) {
        console.error('[BOUNTY] Error cancelling bounty:', error);
        message.reply('❌ Failed to cancel bounty.');
    }
}

// Auto-expire bounties
async function cleanupExpiredBounties(client) {
    try {
        const expiredBounties = await Bounty.find({
            status: 'active',
            expiresAt: { $lt: new Date() }
        });

        for (const bounty of expiredBounties) {
            // Refund creator
            await updateBobbyBucks(bounty.creatorId, bounty.reward);

            // Update status
            bounty.status = 'expired';
            await bounty.save();

            // Notify in channel
            try {
                const channel = await client.channels.fetch(bounty.channelId);
                if (channel) {
                    await channel.send(`⏱️ **Bounty Expired** - Bounty "${bounty.description.substring(0, 50)}..." has expired. 🍯${bounty.reward.toLocaleString()} refunded to <@${bounty.creatorId}>.`);
                }
            } catch (channelError) {
                console.error('[BOUNTY] Could not notify about expired bounty:', channelError.message);
            }

            console.log(`[BOUNTY] Expired bounty ${bounty.bountyId}, refunded ${bounty.reward} to ${bounty.creatorId}`);
        }

        if (expiredBounties.length > 0) {
            console.log(`[BOUNTY] Cleaned up ${expiredBounties.length} expired bounties`);
        }

    } catch (error) {
        console.error('[BOUNTY] Error cleaning up expired bounties:', error);
    }
}

module.exports = (client) => {
    // Start cleanup interval
    setInterval(() => cleanupExpiredBounties(client), CLEANUP_INTERVAL);
    console.log('[BOUNTY] Auto-cleanup system initialized (checks every 5 minutes)');

    // Message commands
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // !postbounty <amount> <description>
        if (command === 'postbounty') {
            await postBounty(message, args);
        }

        // !bounties - list all active
        if (command === 'bounties') {
            await listBounties(message);
        }

        // !bounty <id> - view specific
        if (command === 'bounty' && args.length > 0) {
            await viewBounty(message, args[0]);
        }

        // !cancelbounty <id>
        if (command === 'cancelbounty' && args.length > 0) {
            await cancelBounty(message, args[0]);
        }

        // Admin command: !clearbounties
        if (command === 'clearbounties') {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return message.reply(permissionDeniedMessage());
            }

            try {
                const result = await Bounty.deleteMany({ guildId: message.guild.id });
                message.reply(`✅ Cleared ${result.deletedCount} bounties.`);
            } catch (error) {
                console.error('[BOUNTY] Error clearing bounties:', error);
                message.reply('❌ Failed to clear bounties.');
            }
        }
    });

    // Button interactions
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;
        if (interaction.guild && interaction.guild.id !== TARGET_GUILD_ID) return;

        const customId = interaction.customId;

        // Claim bounty button
        if (customId.startsWith('claim_bounty_')) {
            try {
                const bountyId = customId.replace('claim_bounty_', '');
                const bounty = await Bounty.findOne({ bountyId });

                if (!bounty) {
                    return interaction.reply({ content: '❌ Bounty not found.', ephemeral: true });
                }

                if (bounty.status !== 'active') {
                    return interaction.reply({ content: `❌ This bounty is ${bounty.status}.`, ephemeral: true });
                }

                if (bounty.creatorId === interaction.user.id) {
                    return interaction.reply({ content: '❌ You cannot claim your own bounty!', ephemeral: true });
                }

                // Ask for proof
                const proofEmbed = new EmbedBuilder()
                    .setTitle('🎯 Claim Bounty')
                    .setColor('#ffa500')
                    .setDescription(`**Bounty:** ${bounty.description}\n**Reward:** 🍯${bounty.reward.toLocaleString()}\n\nTo claim this bounty, reply to this message with a link to your proof (screenshot, clip, etc.).\n\n⏰ You have 2 minutes to provide proof.`)
                    .setFooter({ text: 'Send proof link in next message' });

                await interaction.reply({ embeds: [proofEmbed], ephemeral: true });

                // Wait for proof
                const filter = m => m.author.id === interaction.user.id;
                const collector = interaction.channel.createMessageCollector({
                    filter,
                    time: 120000,
                    max: 1
                });

                collector.on('collect', async (msg) => {
                    const proofUrl = msg.content;

                    // Update bounty with claim
                    bounty.status = 'claimed';
                    bounty.claimedBy = interaction.user.id;
                    bounty.claimedByName = interaction.user.username;
                    bounty.proofUrl = proofUrl;
                    bounty.completedAt = new Date();
                    await bounty.save();

                    // Award honey
                    await updateBobbyBucks(interaction.user.id, bounty.reward);

                    // Announce completion
                    const completionEmbed = new EmbedBuilder()
                        .setTitle('🎉 Bounty Claimed!')
                        .setColor('#00ff00')
                        .setDescription(`**${bounty.description}**\n\n🎯 **Claimed by:** ${interaction.user.username}\n💰 **Reward:** 🍯${bounty.reward.toLocaleString()}\n🔗 **Proof:** ${proofUrl}`)
                        .setFooter({ text: `Created by ${bounty.creatorName}` })
                        .setTimestamp();

                    await interaction.channel.send({
                        content: `🎉 <@${interaction.user.id}> completed a bounty!`,
                        embeds: [completionEmbed]
                    });

                    // Update original bounty message
                    try {
                        if (bounty.messageId) {
                            const originalMsg = await interaction.channel.messages.fetch(bounty.messageId);
                            await originalMsg.edit({
                                embeds: [formatBountyEmbed(bounty, true)],
                                components: [] // Remove buttons
                            });
                        }
                    } catch (updateError) {
                        console.error('[BOUNTY] Could not update original message:', updateError.message);
                    }

                    await msg.react('✅');

                    console.log(`[BOUNTY] Bounty ${bountyId} claimed by ${interaction.user.username} for ${bounty.reward} honey`);
                });

                collector.on('end', collected => {
                    if (collected.size === 0) {
                        interaction.followUp({ content: '⏱️ Claim timed out. Try again when you have proof ready.', ephemeral: true });
                    }
                });

            } catch (error) {
                console.error('[BOUNTY] Error claiming bounty:', error);
                interaction.reply({ content: '❌ Failed to claim bounty.', ephemeral: true });
            }
        }

        // Cancel bounty button
        if (customId.startsWith('cancel_bounty_')) {
            try {
                const bountyId = customId.replace('cancel_bounty_', '');
                const bounty = await Bounty.findOne({ bountyId });

                if (!bounty) {
                    return interaction.reply({ content: '❌ Bounty not found.', ephemeral: true });
                }

                if (bounty.creatorId !== interaction.user.id) {
                    return interaction.reply({ content: '❌ Only the creator can cancel this bounty.', ephemeral: true });
                }

                if (bounty.status !== 'active') {
                    return interaction.reply({ content: `❌ This bounty is already ${bounty.status}.`, ephemeral: true });
                }

                // Refund honey
                await updateBobbyBucks(bounty.creatorId, bounty.reward);

                // Update status
                bounty.status = 'cancelled';
                await bounty.save();

                await interaction.reply({
                    content: `✅ Bounty cancelled. 🍯${bounty.reward.toLocaleString()} refunded.`,
                    ephemeral: true
                });

                // Update original message
                try {
                    if (bounty.messageId) {
                        const originalMsg = await interaction.channel.messages.fetch(bounty.messageId);
                        const updatedEmbed = formatBountyEmbed(bounty, true);
                        await originalMsg.edit({ embeds: [updatedEmbed], components: [] });
                    }
                } catch (updateError) {
                    console.error('[BOUNTY] Could not update original message:', updateError.message);
                }

                console.log(`[BOUNTY] Cancelled bounty ${bountyId} by ${interaction.user.username}`);

            } catch (error) {
                console.error('[BOUNTY] Error cancelling bounty:', error);
                interaction.reply({ content: '❌ Failed to cancel bounty.', ephemeral: true });
            }
        }
    });
};
