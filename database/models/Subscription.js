const mongoose = require('mongoose');

/**
 * Subscription Model
 * Stores subscription data for users who subscribe via the website
 */
const subscriptionSchema = new mongoose.Schema({
    // Discord user ID
    discordId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    // Discord username (for display purposes)
    discordUsername: {
        type: String,
        default: null
    },
    // Discord avatar hash
    discordAvatar: {
        type: String,
        default: null
    },
    // Subscription tier (e.g., 'free', 'basic', 'premium', 'enterprise')
    tier: {
        type: String,
        enum: ['free', 'basic', 'premium', 'enterprise'],
        default: 'free'
    },
    // Subscription status
    status: {
        type: String,
        enum: ['active', 'expired', 'cancelled', 'pending'],
        default: 'pending'
    },
    // Whether user has bot installed in at least one server
    botVerified: {
        type: Boolean,
        default: false
    },
    // List of guild IDs where the bot is verified to be installed
    verifiedGuilds: [{
        guildId: String,
        guildName: String,
        verifiedAt: {
            type: Date,
            default: Date.now
        }
    }],
    // Last verification check timestamp
    lastVerificationCheck: {
        type: Date,
        default: null
    },
    // Subscription dates
    subscribedAt: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        default: null
    },
    // Payment reference (from payment processor like Stripe)
    paymentReference: {
        type: String,
        default: null
    },
    // Custom features enabled for this subscription
    features: {
        type: [String],
        default: []
    },
    // Metadata for additional info
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map()
    }
}, {
    timestamps: true
});

// Indexes for faster queries
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ tier: 1 });
subscriptionSchema.index({ expiresAt: 1 });
subscriptionSchema.index({ botVerified: 1 });

// Virtual for checking if subscription is active and valid
subscriptionSchema.virtual('isValid').get(function() {
    if (this.status !== 'active') return false;
    if (this.expiresAt && new Date() > this.expiresAt) return false;
    return true;
});

// Method to check if a specific feature is enabled
subscriptionSchema.methods.hasFeature = function(feature) {
    return this.features.includes(feature);
};

// Static method to get tier features
subscriptionSchema.statics.getTierFeatures = function(tier) {
    const tierFeatures = {
        free: ['basic_commands'],
        basic: ['basic_commands', 'custom_prefix', 'priority_support'],
        premium: ['basic_commands', 'custom_prefix', 'priority_support', 'advanced_analytics', 'custom_embeds', 'unlimited_servers'],
        enterprise: ['basic_commands', 'custom_prefix', 'priority_support', 'advanced_analytics', 'custom_embeds', 'unlimited_servers', 'api_access', 'white_label', 'dedicated_support']
    };
    return tierFeatures[tier] || tierFeatures.free;
};

// Delete existing model if it exists (prevents caching issues)
if (mongoose.models.Subscription) {
    delete mongoose.models.Subscription;
}

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;
