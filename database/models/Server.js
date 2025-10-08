const mongoose = require('mongoose');

const serverSchema = new mongoose.Schema({
    serverId: {
        type: String,
        required: true,
        unique: true,
        default: 'default'
    },
    // House balance for gambling
    houseBalance: {
        type: Number,
        default: 0
    },
    // Last voting date for clips
    lastVotingDate: {
        type: Date,
        default: null
    },
    // Other server-wide settings
    settings: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map()
    }
}, {
    timestamps: true
});

const Server = mongoose.model('Server', serverSchema);

module.exports = Server;
