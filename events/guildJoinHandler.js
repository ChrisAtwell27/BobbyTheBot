const { fetchQuery, fetchMutation } = require('convex/nextjs');
const { api } = require('../convex/_generated/api');
const { getConvexClient } = require('../utils/convexClient');

/**
 * Guild Join Handler
 * Automatically starts a 7-day trial when the bot joins a new guild
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
                console.log(`[Guild Join] Skipping trial creation for ${guildName} - will be created on next verification`);
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
                    // Add guild with automatic 7-day trial
                    await convex.mutation(api.subscriptions.addVerifiedGuild, {
                        discordId: ownerId,
                        guildId,
                        guildName,
                        startTrial: true // Start 7-day trial
                    });

                    console.log(`[Guild Join] ✅ Started 7-day trial for guild ${guildName} (${guildId})`);

                    // Try to send welcome message to the guild owner or system channel
                    try {
                        const welcomeMessage = `🎉 **Welcome to Bobby The Bot!**\n\n` +
                            `Thanks for adding me to **${guildName}**!\n\n` +
                            `✨ **You now have a 7-day trial** with access to all premium features!\n\n` +
                            `**What you can try:**\n` +
                            `• Casino games: \`!blackjack\`, \`!roulette\`, \`!dice\`\n` +
                            `• PvP challenges: \`!rps\`, \`!gladiator\`\n` +
                            `• Bee Mafia game: \`!createmafia\`\n` +
                            `• Valorant teams: \`!valorant\`\n` +
                            `• Activity tracking: \`!activity\`\n` +
                            `• And much more!\n\n` +
                            `Use \`!help\` to see all commands.\n` +
                            `Use \`!subscription\` to check your trial status.\n\n` +
                            `After 7 days, you can upgrade at https://crackedgames.co/bobby-the-bot/`;

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
                } else {
                    console.log(`[Guild Join] Guild ${guildName} already has subscription data`);
                }
            } else {
                // No subscription record exists - create one with trial
                await convex.mutation(api.subscriptions.upsertSubscription, {
                    discordId: ownerId,
                    tier: 'free',
                    status: 'active',
                    botVerified: true,
                    verifiedGuilds: [],
                });

                // Then add the guild with trial
                await convex.mutation(api.subscriptions.addVerifiedGuild, {
                    discordId: ownerId,
                    guildId,
                    guildName,
                    startTrial: true
                });

                console.log(`[Guild Join] ✅ Created new subscription and started 7-day trial for ${guildName}`);

                // Send welcome message
                try {
                    const welcomeMessage = `🎉 **Welcome to Bobby The Bot!**\n\n` +
                        `Thanks for adding me to **${guildName}**!\n\n` +
                        `✨ **You now have a 7-day trial** with access to all premium features!\n\n` +
                        `**What you can try:**\n` +
                        `• Casino games: \`!blackjack\`, \`!roulette\`, \`!dice\`\n` +
                        `• PvP challenges: \`!rps\`, \`!gladiator\`\n` +
                        `• Bee Mafia game: \`!createmafia\`\n` +
                        `• Valorant teams: \`!valorant\`\n` +
                        `• Activity tracking: \`!activity\`\n` +
                        `• And much more!\n\n` +
                        `Use \`!help\` to see all commands.\n` +
                        `Use \`!subscription\` to check your trial status.\n\n` +
                        `After 7 days, you can upgrade at https://crackedgames.co/bobby-the-bot/`;

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
            }

        } catch (error) {
            console.error('[Guild Join] Error handling guild join:', error);
        }
    });

    // Also handle when bot is removed from a guild
    client.on('guildDelete', async (guild) => {
        try {
            console.log(`[Guild Leave] Bot removed from guild: ${guild.name} (${guild.id})`);
            // Note: We don't delete subscription data, just log the event
            // The subscription data remains so if they re-add the bot, they don't get a new trial
        } catch (error) {
            console.error('[Guild Leave] Error handling guild leave:', error);
        }
    });
};
