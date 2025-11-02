const mongoose = require('mongoose');

const wordleMonthlyWinnerSchema = new mongoose.Schema({
    month: {
        type: String,  // Format: "YYYY-MM"
        required: true,
        unique: true,
        index: true
    },
    winner: {
        userId: {
            type: String,
            required: true
        },
        username: {
            type: String,
            required: true
        },
        stats: {
            totalGames: Number,
            avgScore: Number,
            bestScore: Number,
            weightedScore: Number,
            totalHoney: Number
        }
    },
    topTen: [{
        userId: String,
        username: String,
        totalGames: Number,
        avgScore: Number,
        bestScore: Number,
        weightedScore: Number,
        totalHoney: Number,
        position: Number
    }],
    announcedAt: {
        type: Date,
        default: null
    },
    totalPlayers: {
        type: Number,
        default: 0
    },
    totalGamesPlayed: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// Index for efficient queries
wordleMonthlyWinnerSchema.index({ month: -1 });
wordleMonthlyWinnerSchema.index({ 'winner.userId': 1 });

// Delete existing model if it exists (prevents caching issues)
if (mongoose.models.WordleMonthlyWinner) {
    delete mongoose.models.WordleMonthlyWinner;
}

const WordleMonthlyWinner = mongoose.model('WordleMonthlyWinner', wordleMonthlyWinnerSchema);

module.exports = WordleMonthlyWinner;