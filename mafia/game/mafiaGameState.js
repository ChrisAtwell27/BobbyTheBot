/**
 * Mafia Game State Management
 * Handles game storage, player tracking, and game lifecycle
 */

const { LimitedMap } = require('../../utils/memoryUtils');

// Game state storage (limit to 5 concurrent mafia games)
const activeGames = new LimitedMap(5);
const playerGameMap = new LimitedMap(100); // Track which game each player is in (max 100 players)

/**
 * Create a new game
 * @param {string} gameId - Unique game identifier
 * @param {Array} players - Array of player objects
 * @param {string} organizerId - Discord ID of game organizer
 * @param {string} channelId - Discord channel ID
 * @returns {Object} Game object
 */
function createGame(gameId, players, organizerId, channelId) {
    const game = {
        id: gameId,
        channelId: channelId,
        messageId: null,
        cachedChannel: null,
        organizerId: organizerId,
        players: players,
        phase: 'setup',
        phaseEndTime: null,
        nightActions: {},
        nightResults: [], // Store results to display at dawn
        visits: {}, // Track who visited whom
        votes: {},
        phaseTimer: null,
        warningTimer: null,
        lastActivityTime: Date.now(),
        framedPlayers: new Set(), // Players framed this night
        dousedPlayers: new Set() // Players doused by arsonist
    };

    activeGames.set(gameId, game);
    players.forEach(p => playerGameMap.set(p.id, gameId));

    return game;
}

/**
 * Get game by ID
 * @param {string} gameId - Game ID
 * @returns {Object|null} Game object or null
 */
function getGame(gameId) {
    return activeGames.get(gameId);
}

/**
 * Get game by player ID
 * @param {string} playerId - Discord user ID
 * @returns {Object|null} Game object or null
 */
function getGameByPlayer(playerId) {
    const gameId = playerGameMap.get(playerId);
    return gameId ? activeGames.get(gameId) : null;
}

/**
 * Delete a game and clean up
 * @param {string} gameId - Game ID
 */
function deleteGame(gameId) {
    const game = activeGames.get(gameId);
    if (game) {
        // Clear timers
        if (game.phaseTimer) clearTimeout(game.phaseTimer);
        if (game.warningTimer) clearTimeout(game.warningTimer);

        // Clean up player mappings
        game.players.forEach(p => playerGameMap.delete(p.id));

        // Remove game
        activeGames.delete(gameId);
    }
}

/**
 * Get all active games
 * @returns {Map} Map of active games
 */
function getAllGames() {
    return activeGames;
}

/**
 * Add a visit to the tracking system
 * @param {Object} game - Game object
 * @param {string} visitorId - ID of visiting player
 * @param {string} targetId - ID of target player
 */
function addVisit(game, visitorId, targetId) {
    if (!game.visits[targetId]) {
        game.visits[targetId] = [];
    }
    if (!game.visits[targetId].includes(visitorId)) {
        game.visits[targetId].push(visitorId);
    }
}

/**
 * Get all visitors to a target
 * @param {Object} game - Game object
 * @param {string} targetId - ID of target player
 * @returns {Array} Array of visitor IDs
 */
function getVisitors(game, targetId) {
    return game.visits[targetId] || [];
}

/**
 * Clear nightly data (visits, actions, frames, seances, blackmail)
 * @param {Object} game - Game object
 */
function clearNightData(game) {
    game.nightActions = {};
    game.visits = {};
    game.nightResults = [];
    game.framedPlayers.clear();
    game.activeSeances = []; // Clear seance connections

    // Clear blackmail - players can speak again after one day
    if (game.blackmailedPlayers) {
        game.blackmailedPlayers.clear();
    }
}

/**
 * Clear voting data
 * @param {Object} game - Game object
 */
function clearVotes(game) {
    game.votes = {};
}

/**
 * Update last activity time
 * @param {Object} game - Game object
 */
function updateActivity(game) {
    game.lastActivityTime = Date.now();
}

module.exports = {
    createGame,
    getGame,
    getGameByPlayer,
    deleteGame,
    getAllGames,
    addVisit,
    getVisitors,
    clearNightData,
    clearVotes,
    updateActivity
};
