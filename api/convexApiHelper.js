const { ConvexHttpClient } = require('convex/browser');
const { api } = require('../convex/_generated/api');

/**
 * Convex API Helper for Subscription Server
 *
 * This module provides a bridge between the Express API server
 * and the Convex database, allowing the API to query guild-specific
 * subscription data.
 */

let convexClient = null;

/**
 * Initialize Convex HTTP client
 */
function initConvexClient() {
    if (!convexClient) {
        const convexUrl = process.env.CONVEX_URL;
        if (!convexUrl) {
            throw new Error('CONVEX_URL environment variable is not set');
        }
        convexClient = new ConvexHttpClient(convexUrl);
        console.log('✅ Convex API Helper initialized');
    }
    return convexClient;
}

/**
 * Get subscription with per-guild data
 * @param {string} discordId - Discord user ID
 * @returns {Promise<Object|null>} Subscription with per-guild details
 */
async function getSubscriptionByDiscordId(discordId) {
    const client = initConvexClient();
    try {
        const subscription = await client.query(api.subscriptions.getSubscription, {
            discordId
        });
        return subscription;
    } catch (error) {
        console.error('[Convex API Helper] Error getting subscription:', error);
        throw error;
    }
}

/**
 * Get guild-specific subscription status
 * @param {string} discordId - Discord user ID
 * @param {string} guildId - Guild ID
 * @returns {Promise<Object|null>} Guild-specific subscription data
 */
async function getGuildSubscription(discordId, guildId) {
    const client = initConvexClient();
    try {
        const guildData = await client.query(api.subscriptions.getGuildSubscription, {
            discordId,
            guildId
        });
        return guildData;
    } catch (error) {
        console.error('[Convex API Helper] Error getting guild subscription:', error);
        throw error;
    }
}

/**
 * Add verified guild
 * @param {string} discordId - Discord user ID
 * @param {string} guildId - Guild ID
 * @param {string} guildName - Guild name
 * @returns {Promise<string>} Subscription ID
 */
async function addVerifiedGuild(discordId, guildId, guildName) {
    const client = initConvexClient();
    try {
        const result = await client.mutation(api.subscriptions.addVerifiedGuild, {
            discordId,
            guildId,
            guildName
        });
        return result;
    } catch (error) {
        console.error('[Convex API Helper] Error adding verified guild:', error);
        throw error;
    }
}

/**
 * Update guild-specific subscription
 * @param {string} discordId - Discord user ID
 * @param {string} guildId - Guild ID
 * @param {Object} updates - Updates to apply
 * @returns {Promise<string>} Subscription ID
 */
async function updateGuildSubscription(discordId, guildId, updates) {
    const client = initConvexClient();
    try {
        const result = await client.mutation(api.subscriptions.updateGuildSubscription, {
            discordId,
            guildId,
            ...updates
        });
        return result;
    } catch (error) {
        console.error('[Convex API Helper] Error updating guild subscription:', error);
        throw error;
    }
}

/**
 * Upsert subscription (create or update user-level data)
 * @param {Object} subscriptionData - Subscription data
 * @returns {Promise<string>} Subscription ID
 */
async function upsertSubscription(subscriptionData) {
    const client = initConvexClient();
    try {
        const result = await client.mutation(api.subscriptions.upsertSubscription, subscriptionData);
        return result;
    } catch (error) {
        console.error('[Convex API Helper] Error upserting subscription:', error);
        throw error;
    }
}

/**
 * Format guild data for API response
 */
function formatGuildForResponse(guild) {
    const now = Date.now();
    let status = guild.status || 'active';
    let tier = guild.tier || 'free';

    // Check if paid subscription has expired
    if (status === 'active' && guild.expiresAt && guild.expiresAt < now) {
        status = 'expired';
    }

    return {
        guildId: guild.guildId,
        guildName: guild.guildName,
        guildIcon: null, // Not stored in Convex, will be populated from Discord API
        isOwner: false,  // Will be populated from Discord API
        tier,
        status,
        expiresAt: guild.expiresAt || null,
        subscribedAt: guild.subscribedAt || guild.verifiedAt,
    };
}

/**
 * Update server subscription tier
 * Updates the tier field in the servers table for tier-gating features
 * @param {string} guildId - Guild ID
 * @param {string} tier - Subscription tier (free, plus, ultimate)
 * @returns {Promise<string>} Server ID
 */
async function updateServerTier(guildId, tier) {
    const client = initConvexClient();
    try {
        const result = await client.mutation(api.servers.updateTier, {
            guildId,
            tier
        });
        console.log(`[Convex API Helper] Updated server tier for ${guildId} to ${tier}`);
        return result;
    } catch (error) {
        console.error('[Convex API Helper] Error updating server tier:', error);
        throw error;
    }
}

module.exports = {
    initConvexClient,
    getSubscriptionByDiscordId,
    getGuildSubscription,
    addVerifiedGuild,
    updateGuildSubscription,
    upsertSubscription,
    formatGuildForResponse,
    updateServerTier,
};
