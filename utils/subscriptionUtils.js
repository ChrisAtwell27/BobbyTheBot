// ===============================================
// SUBSCRIPTION UTILITIES
// ===============================================
// Utilities for checking user subscription tiers and access control

const Subscription = require('../database/models/Subscription');
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
 * Get subscription data for a guild/server (with caching)
 * @param {string} guildId - Discord guild (server) ID
 * @param {boolean} forceRefresh - Skip cache and force database query
 * @returns {Promise<Object|null>} - Subscription object or null if not found
 */
async function getSubscription(guildId, forceRefresh = false) {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
        const cached = subscriptionCache.get(guildId);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }
    }

    try {
        // Query database - find subscription where this guild is in verifiedGuilds array
        const subscription = await Subscription.findOne({
            'verifiedGuilds.guildId': guildId,
            status: 'active'
        });

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
 * @returns {Promise<Object>} - { hasAccess: boolean, guildTier: string, subscription: Object|null }
 */
async function checkSubscription(guildId, requiredTier = TIERS.FREE) {
    // Normalize the required tier
    const normalizedRequired = normalizeTier(requiredTier);

    // Get guild's subscription
    const subscription = await getSubscription(guildId);

    // If no subscription found, default to free tier
    if (!subscription) {
        const isFree = normalizedRequired === TIERS.FREE;
        return {
            hasAccess: isFree,
            guildTier: TIERS.FREE,
            subscription: null
        };
    }

    // Normalize guild's tier
    const guildTier = normalizeTier(subscription.tier);

    // Check if subscription is active and valid
    const isValid = subscription.status === 'active' &&
                   (!subscription.expiresAt || new Date() <= subscription.expiresAt);

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
    const normalizedGuild = normalizeTier(guildTier);

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

    // Tier display names
    const tierNames = {
        [TIERS.FREE]: 'Free',
        [TIERS.PLUS]: 'Plus ($4.99/mo)',
        [TIERS.ULTIMATE]: 'Ultimate ($9.99/mo)'
    };

    const embed = new EmbedBuilder()
        .setColor(tierColors[normalizedRequired] || 0x3498DB)
        .setTitle(`${tierEmojis[normalizedRequired]} ${tierNames[normalizedRequired]} Feature`)
        .setDescription(
            `**${featureName}** requires the **${tierNames[normalizedRequired]}** tier.\n\n` +
            `This server's current tier: ${tierEmojis[normalizedGuild]} **${tierNames[normalizedGuild]}**`
        )
        .addFields(
            {
                name: '🎯 What You Get',
                value: normalizedRequired === TIERS.PLUS
                    ? '• Blackjack & All PvP Games\n• Valorant Team Builder\n• Bee Mafia\n• Bobby AI\n• Activity Tracking & KOTH'
                    : '• Everything in Plus\n• Audit Logs\n• Advanced Auto-Moderation\n• Custom Prefix\n• API Access\n• Priority Support\n• Monthly 10,000 Honey Bonus',
                inline: false
            },
            {
                name: '💳 Upgrade Now',
                value: 'Visit our website to upgrade your subscription and unlock this feature!',
                inline: false
            }
        )
        .setFooter({ text: 'Subscriptions help keep BobbyTheBot running!' })
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
 * const result = await checkTier(message.guild.id);
 * if (!result.allowed) {
 *   await message.reply({ embeds: [result.embed] });
 *   return;
 * }
 */
function requireTier(requiredTier, featureName) {
    return async function(guildId) {
        const result = await checkSubscription(guildId, requiredTier);

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
    checkSubscription,
    normalizeTier,

    // UI helpers
    createUpgradeEmbed,

    // Cache management
    clearSubscriptionCache,
    clearAllSubscriptionCache,

    // Middleware
    requireTier
};
