const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    // User memories for Bobby's conversation context
    memory: {
        type: String,
        default: ''
    },
    // Personality score (1-10, default 5)
    personalityScore: {
        type: Number,
        default: 5,
        min: 1,
        max: 10
    },
    // Economy data
    balance: {
        type: Number,
        default: 0
    },
    // Activity tracking
    messageCount: {
        type: Number,
        default: 0
    },
    lastActive: {
        type: Date,
        default: Date.now
    },
    dailyMessageCount: {
        type: Number,
        default: 0
    },
    lastDailyReset: {
        type: Date,
        default: Date.now
    },
    // Virtual pet data
    pet: {
        name: String,
        type: String,
        emoji: String,
        hunger: {
            type: Number,
            default: 100
        },
        happiness: {
            type: Number,
            default: 100
        },
        health: {
            type: Number,
            default: 100
        },
        level: {
            type: Number,
            default: 1
        },
        xp: {
            type: Number,
            default: 0
        },
        lastFed: Date,
        lastPlayed: Date,
        lastTrained: Date,
        inventory: {
            type: Map,
            of: Number,
            default: new Map()
        },
        adoptedAt: Date
    },
    // Valorant stats
    valorantRank: String,
    // Gladiator arena stats
    arenaStats: {
        wins: {
            type: Number,
            default: 0
        },
        losses: {
            type: Number,
            default: 0
        },
        kills: {
            type: Number,
            default: 0
        },
        deaths: {
            type: Number,
            default: 0
        },
        favoriteClass: String
    },
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster queries
userSchema.index({ balance: -1 }); // For baltop
userSchema.index({ dailyMessageCount: -1 }); // For activetop
userSchema.index({ 'pet.level': -1 }); // For pet leaderboard

const User = mongoose.model('User', userSchema);

module.exports = User;
