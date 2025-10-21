const mongoose = require('mongoose');

const teamHistorySchema = new mongoose.Schema({
    teamId: {
        type: String,
        required: true,
        index: true
    },
    leaderId: {
        type: String,
        required: true,
        index: true
    },
    leaderName: {
        type: String,
        required: true
    },
    memberIds: {
        type: [String],
        required: true
    },
    memberNames: {
        type: [String],
        required: true
    },
    guildId: {
        type: String,
        required: true,
        index: true
    },
    channelId: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        required: true
    },
    completedAt: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['completed', 'disbanded', 'timeout'],
        default: 'completed'
    },
    matchResult: {
        type: String,
        enum: ['win', 'loss', 'pending', null],
        default: 'pending'
    },
    matchScore: {
        type: String, // e.g., "13-7"
        default: null
    },
    reportedBy: {
        type: String,
        default: null
    },
    reportedAt: {
        type: Date,
        default: null
    },
    stats: {
        maxMembers: Number,
        totalJoins: Number,
        totalLeaves: Number,
        durationMinutes: Number
    }
}, {
    timestamps: true
});

// Indexes for faster queries
teamHistorySchema.index({ createdAt: -1 }); // For recent teams
teamHistorySchema.index({ leaderId: 1, createdAt: -1 }); // For user history
teamHistorySchema.index({ memberIds: 1 }); // For finding teams by member

// Delete existing model if it exists (prevents caching issues)
if (mongoose.models.TeamHistory) {
    delete mongoose.models.TeamHistory;
}

const TeamHistory = mongoose.model('TeamHistory', teamHistorySchema);

module.exports = TeamHistory;
