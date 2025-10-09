const mongoose = require('mongoose');

const wordleScoreSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    score: {
        type: Number,
        required: true,
        min: 1,
        max: 7  // 1-6 for successful games, 7 for failures (X/6)
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    honeyAwarded: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Compound index for efficient queries
wordleScoreSchema.index({ userId: 1, timestamp: -1 });
wordleScoreSchema.index({ timestamp: -1 });

// Delete existing model if it exists (prevents caching issues)
if (mongoose.models.WordleScore) {
    delete mongoose.models.WordleScore;
}

const WordleScore = mongoose.model('WordleScore', wordleScoreSchema);

module.exports = WordleScore;
