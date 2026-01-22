const { client: convex } = require('../../utils/convexClient');
const { api } = require('../../convex/_generated/api');

/**
 * Craftle Game State Manager
 * Wrapper for Convex database operations
 */

// ============================================================================
// PUZZLE OPERATIONS
// ============================================================================

/**
 * Get puzzle by date
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {Promise<Object|null>} Puzzle object
 */
async function getPuzzleByDate(date) {
  try {
    return await convex.query(api.craftle.getPuzzleByDate, { date });
  } catch (error) {
    console.error(`[Craftle] Error getting puzzle by date ${date}:`, error);
    return null;
  }
}

/**
 * Get puzzle by ID
 * @param {string} puzzleId - Puzzle ID
 * @returns {Promise<Object|null>} Puzzle object
 */
async function getPuzzleById(puzzleId) {
  try {
    return await convex.query(api.craftle.getPuzzle, { puzzleId });
  } catch (error) {
    console.error(`[Craftle] Error getting puzzle ${puzzleId}:`, error);
    return null;
  }
}

/**
 * Update puzzle statistics
 * @param {string} puzzleId - Puzzle ID
 * @param {number} totalAttempts - Total attempts
 * @param {number} totalSolved - Total solved
 * @returns {Promise<string|null>} Updated puzzle ID
 */
async function updatePuzzleStats(puzzleId, totalAttempts, totalSolved) {
  try {
    return await convex.mutation(api.craftle.updatePuzzleStats, {
      puzzleId,
      totalAttempts,
      totalSolved,
    });
  } catch (error) {
    console.error(`[Craftle] Error updating puzzle stats:`, error);
    return null;
  }
}

// ============================================================================
// USER PROGRESS OPERATIONS
// ============================================================================

/**
 * Get or create user progress for today's puzzle
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} puzzleId - Puzzle ID
 * @param {string} date - Date string
 * @returns {Promise<Object|null>} User progress object
 */
async function getOrCreateUserProgress(guildId, userId, puzzleId, date) {
  try {
    // Try to get existing progress
    let progress = await convex.query(api.craftle.getUserProgress, {
      guildId,
      userId,
      puzzleId,
    });

    // Create if doesn't exist
    if (!progress) {
      await convex.mutation(api.craftle.createUserProgress, {
        guildId,
        userId,
        puzzleId,
        date,
      });

      // Fetch the newly created progress
      progress = await convex.query(api.craftle.getUserProgress, {
        guildId,
        userId,
        puzzleId,
      });
    }

    return progress;
  } catch (error) {
    console.error(`[Craftle] Error getting/creating user progress:`, error);
    return null;
  }
}

/**
 * Get user's progress for a specific puzzle
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} puzzleId - Puzzle ID
 * @returns {Promise<Object|null>} User progress object
 */
async function getUserProgress(guildId, userId, puzzleId) {
  try {
    return await convex.query(api.craftle.getUserProgress, {
      guildId,
      userId,
      puzzleId,
    });
  } catch (error) {
    console.error(`[Craftle] Error getting user progress:`, error);
    return null;
  }
}

/**
 * Add a guess to user's progress
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} puzzleId - Puzzle ID
 * @param {Array} grid - Guess grid
 * @param {Array} feedback - Feedback grid
 * @param {boolean} solved - Whether puzzle was solved
 * @returns {Promise<string|null>} Updated progress ID
 */
async function addGuess(guildId, userId, puzzleId, grid, feedback, solved) {
  try {
    return await convex.mutation(api.craftle.addGuess, {
      guildId,
      userId,
      puzzleId,
      grid,
      feedback,
      solved,
    });
  } catch (error) {
    console.error(`[Craftle] Error adding guess:`, error);
    return null;
  }
}

/**
 * Mark reward as given for a user's progress
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} puzzleId - Puzzle ID
 * @param {number} rewardAmount - Amount of currency rewarded
 * @returns {Promise<string|null>} Updated progress ID
 */
async function markRewardGiven(guildId, userId, puzzleId, rewardAmount) {
  try {
    return await convex.mutation(api.craftle.markRewardGiven, {
      guildId,
      userId,
      puzzleId,
      rewardAmount,
    });
  } catch (error) {
    console.error(`[Craftle] Error marking reward given:`, error);
    return null;
  }
}

// ============================================================================
// USER STATS OPERATIONS
// ============================================================================

/**
 * Get or initialize user stats
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User stats object
 */
async function getOrInitializeUserStats(guildId, userId) {
  try {
    // Try to get existing stats
    let stats = await convex.query(api.craftle.getUserStats, {
      guildId,
      userId,
    });

    // Initialize if doesn't exist
    if (!stats) {
      await convex.mutation(api.craftle.initializeUserStats, {
        guildId,
        userId,
      });

      // Fetch the newly created stats
      stats = await convex.query(api.craftle.getUserStats, {
        guildId,
        userId,
      });
    }

    return stats;
  } catch (error) {
    console.error(`[Craftle] Error getting/initializing user stats:`, error);
    return null;
  }
}

/**
 * Get user stats
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User stats object
 */
async function getUserStats(guildId, userId) {
  try {
    return await convex.query(api.craftle.getUserStats, {
      guildId,
      userId,
    });
  } catch (error) {
    console.error(`[Craftle] Error getting user stats:`, error);
    return null;
  }
}

/**
 * Update user stats after completing a puzzle
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {boolean} solved - Whether puzzle was solved
 * @param {number} attempts - Number of attempts used
 * @param {string} date - Date string
 * @param {string} puzzleId - Puzzle ID
 * @param {number} honeyEarned - Amount of currency earned
 * @returns {Promise<string|null>} Updated stats ID
 */
async function updateUserStats(guildId, userId, solved, attempts, date, puzzleId, honeyEarned) {
  try {
    return await convex.mutation(api.craftle.updateUserStats, {
      guildId,
      userId,
      solved,
      attempts,
      date,
      puzzleId,
      honeyEarned,
    });
  } catch (error) {
    console.error(`[Craftle] Error updating user stats:`, error);
    return null;
  }
}

// ============================================================================
// LEADERBOARD OPERATIONS
// ============================================================================

/**
 * Get leaderboard for a guild
 * @param {string} guildId - Guild ID
 * @param {string} type - Leaderboard type (daily, weekly, monthly, alltime)
 * @returns {Promise<Object|null>} Leaderboard object
 */
async function getLeaderboard(guildId, type = 'daily') {
  try {
    return await convex.query(api.craftle.getLeaderboard, {
      guildId,
      type,
    });
  } catch (error) {
    console.error(`[Craftle] Error getting leaderboard:`, error);
    return null;
  }
}

/**
 * Get top players for a guild (real-time)
 * @param {string} guildId - Guild ID
 * @param {number} limit - Number of players to return
 * @returns {Promise<Array>} Array of user stats
 */
async function getTopPlayers(guildId, limit = 10) {
  try {
    return await convex.query(api.craftle.getTopPlayers, {
      guildId,
      limit,
    });
  } catch (error) {
    console.error(`[Craftle] Error getting top players:`, error);
    return [];
  }
}

/**
 * Update leaderboard
 * @param {string} guildId - Guild ID
 * @param {string} type - Leaderboard type
 * @param {string} period - Period string
 * @param {Array} rankings - Rankings array
 * @param {number} expiresAt - Expiry timestamp
 * @returns {Promise<string|null>} Leaderboard ID
 */
async function updateLeaderboard(guildId, type, period, rankings, expiresAt) {
  try {
    return await convex.mutation(api.craftle.updateLeaderboard, {
      guildId,
      type,
      period,
      rankings,
      expiresAt,
    });
  } catch (error) {
    console.error(`[Craftle] Error updating leaderboard:`, error);
    return null;
  }
}

/**
 * Calculate weighted leaderboard scores
 * @param {Array} players - Array of user stats
 * @returns {Array} Sorted rankings with scores
 */
function calculateLeaderboardScores(players) {
  const rankings = players.map(player => {
    // Base score: inverse of average attempts (lower is better)
    // Range: 0-6 (7 - averageAttempts)
    const baseScore = player.averageAttempts > 0 ? 7 - player.averageAttempts : 0;

    // Volume multiplier (reward consistency)
    // Players with more solves get slightly higher weight
    const volumeMultiplier = Math.min(1 + (player.totalSolved * 0.01), 2);

    // Streak bonus (reward active streaks)
    const streakBonus = player.currentStreak * 0.1;

    // Weighted score
    const weightedScore = (baseScore * volumeMultiplier) + streakBonus;

    return {
      userId: player.userId,
      displayName: player.userId, // Will be filled by handler
      score: Math.round(weightedScore * 100) / 100,
      solveCount: player.totalSolved,
      averageAttempts: Math.round(player.averageAttempts * 10) / 10,
      currentStreak: player.currentStreak,
      bestTime: player.bestTime,
    };
  });

  // Sort by weighted score (highest first)
  rankings.sort((a, b) => b.score - a.score);

  return rankings;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if user has played today
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} date - Date to check
 * @returns {Promise<boolean>} True if user has progress for today
 */
async function hasPlayedToday(guildId, userId, date) {
  try {
    const progress = await convex.query(api.craftle.getUserProgressByDate, {
      guildId,
      userId,
      date,
    });
    return progress !== null;
  } catch (error) {
    console.error(`[Craftle] Error checking if user played today:`, error);
    return false;
  }
}

/**
 * Check if user has completed today's puzzle
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} puzzleId - Puzzle ID
 * @returns {Promise<boolean>} True if user completed the puzzle
 */
async function hasCompletedPuzzle(guildId, userId, puzzleId) {
  try {
    const progress = await getUserProgress(guildId, userId, puzzleId);
    return progress && (progress.solved || progress.attempts >= 6);
  } catch (error) {
    console.error(`[Craftle] Error checking if user completed puzzle:`, error);
    return false;
  }
}

/**
 * Get user's remaining attempts
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} puzzleId - Puzzle ID
 * @returns {Promise<number>} Remaining attempts (0-6)
 */
async function getRemainingAttempts(guildId, userId, puzzleId) {
  try {
    const progress = await getUserProgress(guildId, userId, puzzleId);
    if (!progress) return 6;
    return Math.max(0, 6 - progress.attempts);
  } catch (error) {
    console.error(`[Craftle] Error getting remaining attempts:`, error);
    return 0;
  }
}

module.exports = {
  // Puzzle operations
  getPuzzleByDate,
  getPuzzleById,
  updatePuzzleStats,

  // User progress operations
  getOrCreateUserProgress,
  getUserProgress,
  addGuess,
  markRewardGiven,

  // User stats operations
  getOrInitializeUserStats,
  getUserStats,
  updateUserStats,

  // Leaderboard operations
  getLeaderboard,
  getTopPlayers,
  updateLeaderboard,
  calculateLeaderboardScores,

  // Helper functions
  hasPlayedToday,
  hasCompletedPuzzle,
  getRemainingAttempts,
};
