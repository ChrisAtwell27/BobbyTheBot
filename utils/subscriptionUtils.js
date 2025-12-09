// ===============================================
// SUBSCRIPTION UTILITIES
// ===============================================
// Utilities for checking user subscription tiers and access control
// Uses Convex as the source of truth for subscription data

const { getConvexClient } = require('./convexClient');
const { api } = require('../convex/_generated/api');
const { EmbedBuilder } = require('discord.js');

// Tier constants (hierarchical: free < plus < ultimate)
const TIERS = {
    FREE: 'free',
    PLUS: 'plus',
    ULTIMATE: 'ultimate',
    // Legacy tier mappings from old model
    BASIC: 'basic',      // Maps to 'plus'
    PREMIUM: 'premium',  // Maps to 'ultimate'
    ENTERPRISE: 'enterprise' // Maps to 'ultimate'
};

// Tier hierarchy for comparison (lower number = lower tier)
const TIER_HIERARCHY = {
    [TIERS.FREE]: 0,
    [TIERS.PLUS]: 1,
    [TIERS.BASIC]: 1,      // Legacy: basic = plus
    [TIERS.ULTIMATE]: 2,
    [TIERS.PREMIUM]: 2,    // Legacy: premium = ultimate
    [TIERS.ENTERPRISE]: 2  // Legacy: enterprise = ultimate
};

// Cache subscription data to reduce database queries
// Using a simple Map with 5-minute cache expiration
const subscriptionCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Normalize legacy tier names to new tier system
 * @param {string} tier - The tier name to normalize
 * @returns {string} - Normalized tier name
 */
function normalizeTier(tier) {
    if (!tier) return TIERS.FREE;

    const lowerTier = tier.toLowerCase();

    // Map legacy tiers to new system
    if (lowerTier === 'basic') return TIERS.PLUS;
    if (lowerTier === 'premium' || lowerTier === 'enterprise') return TIERS.ULTIMATE;

    // Return as-is if already normalized
    return lowerTier;
}

/**
 * Get subscription data for a guild/server by owner ID (with caching)
 * @param {string} guildId - Discord guild (server) ID
 * @param {string} ownerId - Discord owner ID of the guild
 * @param {boolean} forceRefresh - Skip cache and force database query
 * @returns {Promise<Object|null>} - Subscription object or null if not found
 */
async function getSubscriptionByOwner(ownerId, forceRefresh = false) {
    const cacheKey = `owner_${ownerId}`;

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
        const cached = subscriptionCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }
    }

    try {
        const convex = getConvexClient();
        const subscription = await convex.query(api.subscriptions.getSubscription, {
            discordId: ownerId
        });

        // Cache the result (including null results to prevent repeated queries)
        subscriptionCache.set(cacheKey, {
            data: subscription,
            timestamp: Date.now()
        });

        return subscription;
    } catch (error) {
        console.error(`[Subscription] Error fetching subscription for owner ${ownerId}:`, error);
        return null;
    }
}

/**
 * Get subscription data for a guild/server (with caching)
 * This function requires the guild object or ownerId to look up the subscription
 * @param {string} guildId - Discord guild (server) ID
 * @param {string} ownerId - Discord owner ID of the guild (required for Convex lookup)
 * @param {boolean} forceRefresh - Skip cache and force database query
 * @returns {Promise<Object|null>} - Subscription object or null if not found
 */
async function getSubscription(guildId, ownerId = null, forceRefresh = false) {
    // Check guild cache first
    if (!forceRefresh) {
        const cached = subscriptionCache.get(guildId);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }
    }

    // If no ownerId provided, we can't look up in Convex
    // Return null - caller should provide ownerId
    if (!ownerId) {
        console.warn(`[Subscription] No ownerId provided for guild ${guildId}, cannot fetch subscription`);
        return null;
    }

    try {
        const convex = getConvexClient();
        const subscription = await convex.query(api.subscriptions.getSubscription, {
            discordId: ownerId
        });

        // Verify this guild is in the subscription's verifiedGuilds
        if (subscription) {
            const guildInSubscription = subscription.verifiedGuilds?.find(g => g.guildId === guildId);
            if (!guildInSubscription) {
                // Guild not in this subscription
                subscriptionCache.set(guildId, {
                    data: null,
                    timestamp: Date.now()
                });
                return null;
            }
        }

        // Cache the result (including null results to prevent repeated queries)
        subscriptionCache.set(guildId, {
            data: subscription,
            timestamp: Date.now()
        });

        return subscription;
    } catch (error) {
        console.error(`[Subscription] Error fetching subscription for guild ${guildId}:`, error);
        return null;
    }
}

/**
 * Check if a guild/server has access to a specific tier (or higher)
 * @param {string} guildId - Discord guild (server) ID
 * @param {string} requiredTier - Required tier level (TIERS.FREE, TIERS.PLUS, or TIERS.ULTIMATE)
 * @param {string} ownerId - Discord owner ID of the guild (required for Convex lookup)
 * @returns {Promise<Object>} - { hasAccess: boolean, guildTier: string, subscription: Object|null }
 */
async function checkSubscription(guildId, requiredTier = TIERS.FREE, ownerId = null) {
    // Normalize the required tier
    const normalizedRequired = normalizeTier(requiredTier);

    // Get guild's subscription
    const subscription = await getSubscription(guildId, ownerId);

    // If no subscription found, default to free tier
    if (!subscription) {
        const isFree = normalizedRequired === TIERS.FREE;
        return {
            hasAccess: isFree,
            guildTier: TIERS.FREE,
            subscription: null
        };
    }

    // Use the MAIN subscription tier as source of truth (not per-guild tier)
    const guildTier = normalizeTier(subscription.tier);

    // Check if subscription is active and valid
    const isValid = subscription.status === 'active' &&
                   (!subscription.expiresAt || Date.now() <= subscription.expiresAt);

    // If subscription is invalid, treat as free tier
    if (!isValid) {
        const isFree = normalizedRequired === TIERS.FREE;
        return {
            hasAccess: isFree,
            guildTier: TIERS.FREE,
            subscription: subscription,
            reason: subscription.status === 'expired' ? 'expired' : 'inactive'
        };
    }

    // Compare tier hierarchy (higher or equal = has access)
    const guildTierLevel = TIER_HIERARCHY[guildTier] ?? 0;
    const requiredTierLevel = TIER_HIERARCHY[normalizedRequired] ?? 0;
    const hasAccess = guildTierLevel >= requiredTierLevel;

    return {
        hasAccess,
        guildTier,
        subscription
    };
}

/**
 * Create an upgrade prompt embed for servers without required tier
 * @param {string} featureName - Name of the feature being accessed
 * @param {string} requiredTier - Required tier for the feature
 * @param {string} guildTier - Server's current tier
 * @returns {EmbedBuilder} - Discord embed with upgrade prompt
 */
function createUpgradeEmbed(featureName, requiredTier, guildTier = TIERS.FREE) {
    const normalizedRequired = normalizeTier(requiredTier);

    // Tier colors
    const tierColors = {
        [TIERS.FREE]: 0x95A5A6,      // Gray
        [TIERS.PLUS]: 0x3498DB,      // Blue
        [TIERS.ULTIMATE]: 0x9B59B6   // Purple
    };

    // Tier emojis
    const tierEmojis = {
        [TIERS.FREE]: '🆓',
        [TIERS.PLUS]: '⭐',
        [TIERS.ULTIMATE]: '👑'
    };

    // Tier display names (no pricing)
    const tierNames = {
        [TIERS.FREE]: 'Free',
        [TIERS.PLUS]: 'Plus',
        [TIERS.ULTIMATE]: 'Ultimate'
    };

    const embed = new EmbedBuilder()
        .setColor(tierColors[normalizedRequired] || 0x3498DB)
        .setTitle(`${tierEmojis[normalizedRequired]} Feature Unavailable`)
        .setDescription(
            `**${featureName}** requires the **${tierNames[normalizedRequired]}** tier.\n\n` +
            `[Upgrade your subscription](https://bobbybot.io/upgrade) to unlock this feature!`
        )
        .setTimestamp();

    return embed;
}

/**
 * Clear cached subscription for a guild (useful after subscription updates)
 * @param {string} guildId - Discord guild ID
 */
function clearSubscriptionCache(guildId) {
    subscriptionCache.delete(guildId);
    console.log(`[Subscription] Cache cleared for guild ${guildId}`);
}

/**
 * Clear cached subscription for an owner (useful after subscription updates)
 * @param {string} ownerId - Discord owner ID
 */
function clearOwnerSubscriptionCache(ownerId) {
    subscriptionCache.delete(`owner_${ownerId}`);
    console.log(`[Subscription] Cache cleared for owner ${ownerId}`);
}

/**
 * Clear all subscription cache (useful for debugging or major updates)
 */
function clearAllSubscriptionCache() {
    const size = subscriptionCache.size;
    subscriptionCache.clear();
    console.log(`[Subscription] Cleared ${size} cached subscriptions`);
}

/**
 * Middleware function to check subscription before command execution
 * Returns a function that can be used to wrap command handlers
 *
 * @param {string} requiredTier - Required tier for the command
 * @param {string} featureName - Name of the feature (for upgrade prompt)
 * @returns {Function} - Async middleware function
 *
 * @example
 * const checkTier = requireTier(TIERS.PLUS, 'Blackjack');
 * const result = await checkTier(message.guild.id, message.guild.ownerId);
 * if (!result.allowed) {
 *   await message.reply({ embeds: [result.embed] });
 *   return;
 * }
 */
function requireTier(requiredTier, featureName) {
    return async function(guildId, ownerId) {
        const result = await checkSubscription(guildId, requiredTier, ownerId);

        if (result.hasAccess) {
            return {
                allowed: true,
                subscription: result.subscription,
                guildTier: result.guildTier
            };
        } else {
            return {
                allowed: false,
                subscription: result.subscription,
                guildTier: result.guildTier,
                embed: createUpgradeEmbed(featureName, requiredTier, result.guildTier),
                reason: result.reason || 'insufficient_tier'
            };
        }
    };
}

module.exports = {
    // Constants
    TIERS,
    TIER_HIERARCHY,

    // Core functions
    getSubscription,
    getSubscriptionByOwner,
    checkSubscription,
    normalizeTier,

    // UI helpers
    createUpgradeEmbed,

    // Cache management
    clearSubscriptionCache,
    clearOwnerSubscriptionCache,
    clearAllSubscriptionCache,

    // Middleware
    requireTier
};
