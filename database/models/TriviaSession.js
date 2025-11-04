const mongoose = require('mongoose');

const triviaSessionSchema = new mongoose.Schema({
    serverId: {
        type: String,
        required: true,
        unique: true,
        default: 'default'
    },
    // Session token from Open Trivia DB
    sessionToken: {
        type: String,
        default: null
    },
    // Last time the token was used (for 6-hour expiry tracking)
    lastUsed: {
        type: Date,
        default: Date.now
    },
    // Current active daily question
    activeQuestion: {
        question: String,
        correctAnswer: String,
        incorrectAnswers: [String],
        allAnswers: [String],
        difficulty: String,
        category: String,
        postedAt: Date,
        messageId: String,
        answered: Boolean,
        answeredAt: Date
    },
    // History of past questions (to prevent repeats)
    questionHistory: {
        type: [String],
        default: []
    },
    // Stats
    totalQuestions: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

const TriviaSession = mongoose.model('TriviaSession', triviaSessionSchema);

module.exports = TriviaSession;
