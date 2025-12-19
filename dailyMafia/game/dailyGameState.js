const { getConvexClient } = require("../../database/convexClient");
const { api } = require("../../convex/_generated/api");
const { ROLES } = require("../../mafia/roles/mafiaRoles");

/**
 * Daily Mafia Game State Manager
 * Wrapper for Convex database operations with Daily Mafia-specific logic
 */

/**
 * Generate unique game ID
 * @returns {string} Game ID in format: daily-{timestamp}-{random}
 */
function generateGameId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `daily-${timestamp}-${random}`;
}

/**
 * Get roles available for Daily Mafia mode
 * Filters out voice-dependent roles (Deaf variants)
 * Keeps Mute variants (emoji-only chat works in text)
 *
 * TIER RESTRICTIONS (ENFORCED):
 * - Plus tier: Gets basic + plus tier roles (~20-40 roles)
 * - Ultimate tier: Gets ALL roles including ultimate exclusives (~65 roles)
 *
 * @param {string} tier - Subscription tier ("plus" or "ultimate")
 * @returns {Array} Filtered role definitions
 */
function getDailyModeRoles(tier = "plus") {
  const deafFiltered = Object.values(ROLES).filter((role) => {
    // FIRST FILTER: Exclude Deaf variants (require voice chat - not compatible with Daily Mafia)
    if (role.isDeafBee) return false;

    // Keep Mute variants (emoji-only chat works in text)
    // Keep all other roles
    return true;
  });

  const tierFiltered = deafFiltered.filter((role) => {
    // SECOND FILTER: Apply tier restrictions (LOCK ULTIMATE ROLES)
    // If this is a Plus tier game AND the role requires Ultimate tier, exclude it
    if (tier === "plus" && role.tier && role.tier === "ultimate") {
      return false; // LOCKED: Ultimate-only role in Plus tier game
    }

    // Ultimate tier gets all roles (that passed first filter)
    // Plus tier gets roles with no tier requirement OR tier === 'plus'
    return true;
  });

  const deafCount = Object.keys(ROLES).length - deafFiltered.length;
  const ultimateCount = deafFiltered.length - tierFiltered.length;

  console.log(
    `[Daily Mafia] Role filtering for ${tier} tier: ${tierFiltered.length} roles available (excluded ${deafCount} Deaf, ${ultimateCount} Ultimate-only)`
  );

  return tierFiltered;
}

/**
 * Get role definition by name
 * @param {string} roleName - Role name
 * @returns {Object|null} Role definition
 */
function getRoleDefinition(roleIdentifier) {
  // Try direct key lookup first (O(1))
  if (ROLES[roleIdentifier]) return ROLES[roleIdentifier];

  // Fallback to name search (O(n)) - for backward compatibility
  return Object.values(ROLES).find((r) => r.name === roleIdentifier) || null;
}

// ============================================================================
// GAME OPERATIONS
// ============================================================================

/**
 * Create a new daily mafia game
 * @param {Object} params - Game parameters
 * @returns {Promise<string>} Game ID
 */
async function createGame({
  guildId,
  channelId,
  organizerId,
  debugMode = false,
  revealRoles = true,
  tier = "plus",
}) {
  try {
    const client = getConvexClient();
    if (!client) throw new Error("Convex client not available");

    const gameId = generateGameId();

    await client.mutation(api.dailyMafia.createGame, {
      gameId,
      guildId,
      channelId,
      organizerId,
      debugMode,
      revealRoles,
      tier,
    });

    return gameId;
  } catch (error) {
    console.error("Error creating daily mafia game:", error);
    throw error;
  }
}

/**
 * Get game by game ID
 * @param {string} gameId - Game ID
 * @returns {Promise<Object|null>} Game object
 */
async function getGame(gameId) {
  try {
    const client = getConvexClient();
    if (!client) return null;

    const game = await client.query(api.dailyMafia.getGame, { gameId });
    return game;
  } catch (error) {
    console.error("Error getting daily mafia game:", error);
    return null;
  }
}

/**
 * Get active games for a guild
 * @param {string} guildId - Guild ID
 * @returns {Promise<Array>} Active games
 */
async function getActiveGames(guildId) {
  try {
    const client = getConvexClient();
    if (!client) return [];

    const games = await client.query(api.dailyMafia.getActiveGames, {
      guildId,
    });
    return games;
  } catch (error) {
    console.error("Error getting active daily mafia games:", error);
    return [];
  }
}

/**
 * Get all active games (for deadline checking)
 * @returns {Promise<Array>} All active games
 */
async function getAllActiveGames() {
  try {
    const client = getConvexClient();
    if (!client) return [];

    const games = await client.query(api.dailyMafia.getAllActiveGames, {});
    return games;
  } catch (error) {
    console.error("Error getting all active daily mafia games:", error);
    return [];
  }
}

/**
 * Update game state
 * @param {string} gameId - Game ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<boolean>} Success
 */
async function updateGame(gameId, updates) {
  try {
    const client = getConvexClient();
    if (!client) throw new Error("Convex client not available");

    await client.mutation(api.dailyMafia.updateGame, { gameId, updates });
    return true;
  } catch (error) {
    console.error("Error updating daily mafia game:", error);
    throw error;
  }
}

// ============================================================================
// PLAYER OPERATIONS
// ============================================================================

/**
 * Add player to game
 * @param {Object} params - Player parameters
 * @returns {Promise<string>} Player document ID
 */
async function addPlayer({
  gameId,
  playerId,
  displayName,
  role,
  roleResources = {},
}) {
  try {
    const client = getConvexClient();
    if (!client) throw new Error("Convex client not available");

    const id = await client.mutation(api.dailyMafia.addPlayer, {
      gameId,
      playerId,
      displayName,
      role,
      roleResources,
    });

    return id;
  } catch (error) {
    console.error("Error adding player to daily mafia game:", error);
    throw error;
  }
}

/**
 * Get all players for a game
 * @param {string} gameId - Game ID
 * @returns {Promise<Array>} Players
 */
async function getPlayers(gameId) {
  try {
    const client = getConvexClient();
    if (!client) return [];

    const players = await client.query(api.dailyMafia.getPlayers, { gameId });
    return players;
  } catch (error) {
    console.error("Error getting daily mafia players:", error);
    return [];
  }
}

/**
 * Get alive players for a game
 * @param {string} gameId - Game ID
 * @returns {Promise<Array>} Alive players
 */
async function getAlivePlayers(gameId) {
  try {
    const client = getConvexClient();
    if (!client) return [];

    const players = await client.query(api.dailyMafia.getAlivePlayers, {
      gameId,
    });
    return players;
  } catch (error) {
    console.error("Error getting alive daily mafia players:", error);
    return [];
  }
}

/**
 * Get player by game and player ID
 * @param {string} gameId - Game ID
 * @param {string} playerId - Player ID
 * @returns {Promise<Object|null>} Player object
 */
async function getPlayer(gameId, playerId) {
  try {
    const client = getConvexClient();
    if (!client) return null;

    const player = await client.query(api.dailyMafia.getPlayer, {
      gameId,
      playerId,
    });
    return player;
  } catch (error) {
    console.error("Error getting daily mafia player:", error);
    return null;
  }
}

/**
 * Get player's active game
 * @param {string} playerId - Player ID
 * @returns {Promise<Object|null>} Active game or null
 */
async function getPlayerActiveGame(playerId) {
  try {
    const client = getConvexClient();
    if (!client) return null;

    const game = await client.query(api.dailyMafia.getPlayerActiveGame, {
      playerId,
    });
    return game;
  } catch (error) {
    console.error("Error getting player active game:", error);
    return null;
  }
}

/**
 * Update player
 * @param {string} gameId - Game ID
 * @param {string} playerId - Player ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<boolean>} Success
 */
async function updatePlayer(gameId, playerId, updates) {
  try {
    const client = getConvexClient();
    if (!client) throw new Error("Convex client not available");

    await client.mutation(api.dailyMafia.updatePlayer, {
      gameId,
      playerId,
      updates,
    });
    return true;
  } catch (error) {
    console.error("Error updating daily mafia player:", error);
    throw error;
  }
}

/**
 * Reset hasActedThisPhase for all alive players
 * @param {string} gameId - Game ID
 * @returns {Promise<boolean>} Success
 */
async function resetPhaseActions(gameId) {
  try {
    const client = getConvexClient();
    if (!client) throw new Error("Convex client not available");

    await client.mutation(api.dailyMafia.resetPhaseActions, { gameId });
    return true;
  } catch (error) {
    console.error("Error resetting phase actions:", error);
    throw error;
  }
}

// ============================================================================
// ACTION OPERATIONS
// ============================================================================

/**
 * Upsert action (create or update)
 * @param {Object} params - Action parameters
 * @returns {Promise<string>} Action ID
 */
async function upsertAction({
  gameId,
  nightNumber,
  playerId,
  actionType,
  targetId,
  keyword,
}) {
  try {
    const client = getConvexClient();
    if (!client) throw new Error("Convex client not available");

    const id = await client.mutation(api.dailyMafia.upsertAction, {
      gameId,
      nightNumber,
      playerId,
      actionType,
      targetId,
      keyword,
    });

    return id;
  } catch (error) {
    console.error("Error upserting action:", error);
    throw error;
  }
}

/**
 * Get actions for a night
 * @param {string} gameId - Game ID
 * @param {number} nightNumber - Night number
 * @returns {Promise<Array>} Actions
 */
async function getActionsForNight(gameId, nightNumber) {
  try {
    const client = getConvexClient();
    if (!client) return [];

    const actions = await client.query(api.dailyMafia.getActionsForNight, {
      gameId,
      nightNumber,
    });
    return actions;
  } catch (error) {
    console.error("Error getting actions for night:", error);
    return [];
  }
}

/**
 * Mark all actions as processed
 * @param {string} gameId - Game ID
 * @param {number} nightNumber - Night number
 * @returns {Promise<boolean>} Success
 */
async function markActionsProcessed(gameId, nightNumber) {
  try {
    const client = getConvexClient();
    if (!client) throw new Error("Convex client not available");

    await client.mutation(api.dailyMafia.markActionsProcessed, {
      gameId,
      nightNumber,
    });
    return true;
  } catch (error) {
    console.error("Error marking actions processed:", error);
    throw error;
  }
}

// ============================================================================
// VOTE OPERATIONS
// ============================================================================

/**
 * Upsert vote (create or update)
 * @param {Object} params - Vote parameters
 * @returns {Promise<string>} Vote ID
 */
async function upsertVote({ gameId, dayNumber, voterId, targetId }) {
  try {
    const client = getConvexClient();
    if (!client) throw new Error("Convex client not available");

    const id = await client.mutation(api.dailyMafia.upsertVote, {
      gameId,
      dayNumber,
      voterId,
      targetId,
    });

    return id;
  } catch (error) {
    console.error("Error upserting vote:", error);
    throw error;
  }
}

/**
 * Get votes for a day
 * @param {string} gameId - Game ID
 * @param {number} dayNumber - Day number
 * @returns {Promise<Array>} Votes
 */
async function getVotesForDay(gameId, dayNumber) {
  try {
    const client = getConvexClient();
    if (!client) return [];

    const votes = await client.query(api.dailyMafia.getVotesForDay, {
      gameId,
      dayNumber,
    });
    return votes;
  } catch (error) {
    console.error("Error getting votes for day:", error);
    return [];
  }
}

/**
 * Delete vote
 * @param {string} gameId - Game ID
 * @param {number} dayNumber - Day number
 * @param {string} voterId - Voter ID
 * @returns {Promise<boolean>} Success
 */
async function deleteVote(gameId, dayNumber, voterId) {
  try {
    const client = getConvexClient();
    if (!client) return false;

    const success = await client.mutation(api.dailyMafia.deleteVote, {
      gameId,
      dayNumber,
      voterId,
    });

    return success;
  } catch (error) {
    console.error("Error deleting vote:", error);
    return false;
  }
}

// ============================================================================
// EVENT OPERATIONS
// ============================================================================

/**
 * Create event
 * @param {Object} params - Event parameters
 * @returns {Promise<string>} Event ID
 */
async function createEvent({
  gameId,
  phase,
  phaseNumber,
  eventType,
  description,
  data,
}) {
  try {
    const client = getConvexClient();
    if (!client) throw new Error("Convex client not available");

    const id = await client.mutation(api.dailyMafia.createEvent, {
      gameId,
      phase,
      phaseNumber,
      eventType,
      description,
      data,
    });

    return id;
  } catch (error) {
    console.error("Error creating event:", error);
    throw error;
  }
}

/**
 * Get recent events
 * @param {string} gameId - Game ID
 * @param {number} limit - Number of events to retrieve
 * @returns {Promise<Array>} Recent events
 */
async function getRecentEvents(gameId, limit = 5) {
  try {
    const client = getConvexClient();
    if (!client) return [];

    const events = await client.query(api.dailyMafia.getRecentEvents, {
      gameId,
      limit,
    });
    return events;
  } catch (error) {
    console.error("Error getting recent events:", error);
    return [];
  }
}

/**
 * Get all events for a game
 * @param {string} gameId - Game ID
 * @returns {Promise<Array>} All events
 */
async function getAllEvents(gameId) {
  try {
    const client = getConvexClient();
    if (!client) return [];

    const events = await client.query(api.dailyMafia.getAllEvents, { gameId });
    return events;
  } catch (error) {
    console.error("Error getting all events:", error);
    return [];
  }
}

module.exports = {
  // Game operations
  generateGameId,
  createGame,
  getGame,
  getActiveGames,
  getAllActiveGames,
  updateGame,

  // Player operations
  addPlayer,
  getPlayers,
  getAlivePlayers,
  getPlayer,
  getPlayerActiveGame,
  updatePlayer,
  resetPhaseActions,

  // Action operations
  upsertAction,
  getActionsForNight,
  markActionsProcessed,

  // Vote operations
  upsertVote,
  getVotesForDay,
  deleteVote,

  // Event operations
  createEvent,
  getRecentEvents,
  getAllEvents,

  // Role operations
  getDailyModeRoles,
  getRoleDefinition,
};
