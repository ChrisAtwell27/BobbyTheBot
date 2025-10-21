const mongoose = require('mongoose');

const challengeSchema = new mongoose.Schema({
    challengeId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        enum: ['rps', 'highercard', 'quickdraw', 'numberduel', 'gladiator']
    },
    creator: {
        type: String,
        required: true
    },
    creatorName: {
        type: String,
        required: true
    },
    challenged: String, // For gladiator challenges
    challengedName: String, // For gladiator challenges
    amount: {
        type: Number,
        required: true
    },
    channelId: {
        type: String,
        required: true
    },
    // Gladiator-specific fields
    gladiatorClass: String,
    challengerAvatarURL: String,
    challengedAvatarURL: String,
    // Additional metadata
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 300 // Auto-delete after 5 minutes (TTL index)
    }
});

module.exports = mongoose.model('Challenge', challengeSchema);
