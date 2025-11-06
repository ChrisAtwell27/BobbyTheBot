const mongoose = require('mongoose');

const bountySchema = new mongoose.Schema({
    bountyId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    creatorId: {
        type: String,
        required: true,
        index: true
    },
    creatorName: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true,
        maxlength: 500
    },
    reward: {
        type: Number,
        required: true,
        min: 1
    },
    status: {
        type: String,
        required: true,
        enum: ['active', 'claimed', 'expired', 'cancelled'],
        default: 'active',
        index: true
    },
    claimedBy: {
        type: String,
        default: null
    },
    claimedByName: {
        type: String,
        default: null
    },
    proofUrl: {
        type: String,
        default: null
    },
    channelId: {
        type: String,
        required: true
    },
    messageId: {
        type: String,
        default: null
    },
    guildId: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true
    },
    completedAt: {
        type: Date,
        default: null
    }
});

// Index for efficient queries
bountySchema.index({ status: 1, expiresAt: 1 });
bountySchema.index({ guildId: 1, status: 1 });

module.exports = mongoose.model('Bounty', bountySchema);
