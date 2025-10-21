const mongoose = require('mongoose');

const wordleScoreSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    scores: [{
        score: {
            type: Number,
            required: true,
            min: 1,
            max: 7  // 1-6 for successful games, 7 for failures (X/6)
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        honeyAwarded: {
            type: Number,
            default: 0
        }
    }],
    totalGames: {
        type: Number,
        default: 0
    },
    totalHoney: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for efficient queries
wordleScoreSchema.index({ userId: 1 });
wordleScoreSchema.index({ totalGames: -1 });

// Delete existing model if it exists (prevents caching issues)
if (mongoose.models.WordleScore) {
    delete mongoose.models.WordleScore;
}

const WordleScore = mongoose.model('WordleScore', wordleScoreSchema);

module.exports = WordleScore;
