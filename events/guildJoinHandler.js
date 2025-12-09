const { EmbedBuilder } = require('discord.js');
const { api } = require('../convex/_generated/api');
const { getConvexClient } = require('../utils/convexClient');

/**
 * Guild Join Handler
 * Registers new guilds when the bot joins
 */

module.exports = (client) => {
    console.log('🎉 Guild Join Handler initialized');

    client.on('guildCreate', async (guild) => {
        try {
            console.log(`[Guild Join] Bot added to guild: ${guild.name} (${guild.id})`);

            const guildId = guild.id;
            const guildName = guild.name;
            const ownerId = guild.ownerId;

            // Get Convex client with error handling
            let convex;
            try {
                convex = getConvexClient();
            } catch (convexError) {
                console.error(`[Guild Join] Failed to get Convex client: ${convexError.message}`);
                console.log(`[Guild Join] Skipping guild registration for ${guildName} - will be created on next verification`);
                return;
            }

            // Check if this guild already has a subscription
            const existingSubscription = await convex.query(api.subscriptions.getSubscription, {
                discordId: ownerId
            });

            if (existingSubscription) {
                // Check if this guild is already in the verified guilds
                const existingGuild = existingSubscription.verifiedGuilds?.find(g => g.guildId === guildId);

                if (!existingGuild) {
                    // Add guild to subscription
                    await convex.mutation(api.subscriptions.addVerifiedGuild, {
                        discordId: ownerId,
                        guildId,
                        guildName
                    });

                    console.log(`[Guild Join] ✅ Registered guild ${guildName} (${guildId})`);

                    // Try to send welcome message to the guild owner or system channel
                    try {
                        const welcomeMessage = `🎉 **Welcome to Bobby The Bot!**\n\n` +
                            `Thanks for adding me to **${guildName}**!\n\n` +
                            `**What you can do:**\n` +
                            `• Casino games: \`!blackjack\`, \`!roulette\`, \`!dice\`\n` +
                            `• PvP challenges: \`!rps\`, \`!gladiator\`\n` +
                            `• Bee Mafia game: \`!createmafia\`\n` +
                            `• Valorant teams: \`!valorant\`\n` +
                            `• Activity tracking: \`!activity\`\n` +
                            `• And much more!\n\n` +
                            `Use \`!help\` to see all commands.\n` +
                            `Use \`!subscription\` to check your subscription status.\n\n` +
                            `Upgrade at https://crackedgames.co/bobby-the-bot/`;

                        // Try to send to system channel first
                        if (guild.systemChannel) {
                            await guild.systemChannel.send(welcomeMessage);
                        } else {
                            // Try to find the first text channel we can send to
                            const channel = guild.channels.cache.find(ch =>
                                ch.type === 0 && // Text channel
                                ch.permissionsFor(guild.members.me).has('SendMessages')
                            );
                            if (channel) {
                                await channel.send(welcomeMessage);
                            }
                        }
                    } catch (msgError) {
                        console.log(`[Guild Join] Could not send welcome message: ${msgError.message}`);
                    }

                    // DM the server owner with setup instructions
                    try {
                        const owner = await guild.fetchOwner();
                        const dmEmbed = new EmbedBuilder()
                            .setColor(0xFFD700)
                            .setTitle('🎉 Thanks for adding Bobby The Bot!')
                            .setDescription(`Bobby has been successfully added to **${guildName}**!`)
                            .addFields(
                                {
                                    name: '⚙️ Quick Setup',
                                    value: 'Run `!setupbobby` in your server to configure Bobby through our web dashboard!',
                                    inline: false
                                },
                                {
                                    name: '🔗 Dashboard',
                                    value: '**[crackedgames.co/bobby-the-bot](https://crackedgames.co/bobby-the-bot)**',
                                    inline: false
                                },
                                {
                                    name: '📋 What You Can Configure',
                                    value: [
                                        '• Set custom bot prefix',
                                        '• Configure moderation settings',
                                        '• Manage feature toggles',
                                        '• Set up role permissions',
                                        '• Configure channel restrictions'
                                    ].join('\n'),
                                    inline: false
                                }
                            )
                            .setFooter({ text: 'Use !help in your server for all commands' })
                            .setTimestamp();

                        await owner.send({ embeds: [dmEmbed] });
                        console.log(`[Guild Join] 📬 Sent setup DM to owner ${owner.user.tag}`);
                    } catch (dmError) {
                        // Owner has DMs disabled or bot can't DM them - that's fine
                        console.log(`[Guild Join] Could not DM owner: ${dmError.message}`);
                    }
                } else {
                    console.log(`[Guild Join] Guild ${guildName} already has subscription data`);
                }
            } else {
                // No subscription record exists - create one
                await convex.mutation(api.subscriptions.upsertSubscription, {
                    discordId: ownerId,
                    tier: 'free',
                    status: 'active',
                    botVerified: true,
                    verifiedGuilds: [],
                });

                // Then add the guild
                await convex.mutation(api.subscriptions.addVerifiedGuild, {
                    discordId: ownerId,
                    guildId,
                    guildName
                });

                console.log(`[Guild Join] ✅ Created new subscription and registered guild ${guildName}`);

                // Send welcome message
                try {
                    const welcomeMessage = `🎉 **Welcome to Bobby The Bot!**\n\n` +
                        `Thanks for adding me to **${guildName}**!\n\n` +
                        `**What you can do:**\n` +
                        `• Casino games: \`!blackjack\`, \`!roulette\`, \`!dice\`\n` +
                        `• PvP challenges: \`!rps\`, \`!gladiator\`\n` +
                        `• Bee Mafia game: \`!createmafia\`\n` +
                        `• Valorant teams: \`!valorant\`\n` +
                        `• Activity tracking: \`!activity\`\n` +
                        `• And much more!\n\n` +
                        `Use \`!help\` to see all commands.\n` +
                        `Use \`!subscription\` to check your subscription status.\n\n` +
                        `Upgrade at https://crackedgames.co/bobby-the-bot/`;

                    if (guild.systemChannel) {
                        await guild.systemChannel.send(welcomeMessage);
                    } else {
                        const channel = guild.channels.cache.find(ch =>
                            ch.type === 0 &&
                            ch.permissionsFor(guild.members.me).has('SendMessages')
                        );
                        if (channel) {
                            await channel.send(welcomeMessage);
                        }
                    }
                } catch (msgError) {
                    console.log(`[Guild Join] Could not send welcome message: ${msgError.message}`);
                }

                // DM the server owner with setup instructions
                try {
                    const owner = await guild.fetchOwner();
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0xFFD700)
                        .setTitle('🎉 Thanks for adding Bobby The Bot!')
                        .setDescription(`Bobby has been successfully added to **${guildName}**!`)
                        .addFields(
                            {
                                name: '⚙️ Quick Setup',
                                value: 'Run `!setupbobby` in your server to configure Bobby through our web dashboard!',
                                inline: false
                            },
                            {
                                name: '🔗 Dashboard',
                                value: '**[crackedgames.co/bobby-the-bot](https://crackedgames.co/bobby-the-bot)**',
                                inline: false
                            },
                            {
                                name: '📋 What You Can Configure',
                                value: [
                                    '• Set custom bot prefix',
                                    '• Configure moderation settings',
                                    '• Manage feature toggles',
                                    '• Set up role permissions',
                                    '• Configure channel restrictions'
                                ].join('\n'),
                                inline: false
                            }
                        )
                        .setFooter({ text: 'Use !help in your server for all commands' })
                        .setTimestamp();

                    await owner.send({ embeds: [dmEmbed] });
                    console.log(`[Guild Join] 📬 Sent setup DM to owner ${owner.user.tag}`);
                } catch (dmError) {
                    // Owner has DMs disabled or bot can't DM them - that's fine
                    console.log(`[Guild Join] Could not DM owner: ${dmError.message}`);
                }
            }

        } catch (error) {
            console.error('[Guild Join] Error handling guild join:', error);
        }
    });

    // Also handle when bot is removed from a guild
    client.on('guildDelete', async (guild) => {
        try {
            const guildId = guild.id;
            const guildName = guild.name || 'Unknown Guild';
            const ownerId = guild.ownerId;

            console.log(`[Guild Leave] Bot removed from guild: ${guildName} (${guildId})`);

            // Remove guild from subscription's verified guilds
            if (ownerId) {
                try {
                    const convex = getConvexClient();
                    await convex.mutation(api.subscriptions.removeVerifiedGuild, {
                        discordId: ownerId,
                        guildId: guildId
                    });
                    console.log(`[Guild Leave] ✅ Removed guild ${guildName} from subscription`);
                } catch (convexError) {
                    // Don't fail silently - log the error but continue cleanup
                    console.error(`[Guild Leave] Failed to remove guild from subscription: ${convexError.message}`);
                }
            }

            // Emit event for other handlers to clean up guild-specific resources
            // This allows valorantTeamHandler, valorantInhouseHandler, etc. to clean up
            client.emit('guildCleanup', guildId);

            console.log(`[Guild Leave] 🧹 Cleanup complete for guild: ${guildName} (${guildId})`);

        } catch (error) {
            console.error('[Guild Leave] Error handling guild leave:', error);
        }
    });
};
