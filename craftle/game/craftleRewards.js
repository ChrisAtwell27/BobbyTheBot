const { updateBalance } = require('../../database/helpers/convexEconomyHelpers');

/**
 * Craftle Reward System
 * Handles currency distribution based on performance
 */

// Base reward values by attempt number
const BASE_REWARDS = {
  1: 5000, // Perfect solve in 1 attempt
  2: 2500, // Solved in 2 attempts
  3: 1500, // Solved in 3 attempts
  4: 1000, // Solved in 4 attempts
  5: 500, // Solved in 5 attempts
  6: 250, // Barely made it in 6 attempts
  FAIL: 0, // Failed to solve
};

// Bonus values
const BONUSES = {
  STREAK_PER_DAY: 100, // Bonus per consecutive day in streak
  FIRST_SOLVE_DAILY: 500, // Bonus for being first to solve today
  PERFECT_SCORE: 1000, // Extra bonus for solving in 1 attempt
  DIFFICULTY_MULTIPLIER: {
    easy: 1.0,
    medium: 1.2,
    hard: 1.5,
  },
};

/**
 * Calculate total reward for completing a puzzle
 * @param {boolean} solved - Whether the puzzle was solved
 * @param {number} attempts - Number of attempts used
 * @param {Object} stats - User stats object
 * @param {string} difficulty - Puzzle difficulty
 * @param {boolean} isFirstSolve - Whether this is the first solve today
 * @returns {number} Total reward amount
 */
function calculateReward(solved, attempts, stats, difficulty = 'medium', isFirstSolve = false) {
  if (!solved) {
    return BASE_REWARDS.FAIL;
  }

  // Base reward based on attempts
  let totalReward = BASE_REWARDS[attempts] || 0;

  // Apply difficulty multiplier
  const difficultyMultiplier = BONUSES.DIFFICULTY_MULTIPLIER[difficulty] || 1.0;
  totalReward = Math.round(totalReward * difficultyMultiplier);

  // Perfect score bonus
  if (attempts === 1) {
    totalReward += BONUSES.PERFECT_SCORE;
  }

  // Streak bonus
  if (stats && stats.currentStreak > 0) {
    const streakBonus = stats.currentStreak * BONUSES.STREAK_PER_DAY;
    totalReward += streakBonus;
  }

  // First solve bonus
  if (isFirstSolve) {
    totalReward += BONUSES.FIRST_SOLVE_DAILY;
  }

  return totalReward;
}

/**
 * Award currency to a user
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} amount - Amount to award
 * @param {string} reason - Reason for reward
 * @returns {Promise<boolean>} Success status
 */
async function awardCurrency(guildId, userId, amount, reason = 'Craftle completion') {
  if (amount <= 0) {
    return false;
  }

  try {
    await updateBalance(guildId, userId, amount);
    console.log(`[Craftle] Awarded ${amount} honey to user ${userId} (${reason})`);
    return true;
  } catch (error) {
    console.error(`[Craftle] Error awarding currency to user ${userId}:`, error);
    return false;
  }
}

/**
 * Calculate and award reward for puzzle completion
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {boolean} solved - Whether puzzle was solved
 * @param {number} attempts - Number of attempts
 * @param {Object} stats - User stats
 * @param {string} difficulty - Puzzle difficulty
 * @param {boolean} isFirstSolve - First solve of the day
 * @returns {Promise<number>} Amount awarded
 */
async function awardPuzzleReward(
  guildId,
  userId,
  solved,
  attempts,
  stats,
  difficulty,
  isFirstSolve = false
) {
  const rewardAmount = calculateReward(solved, attempts, stats, difficulty, isFirstSolve);

  if (rewardAmount > 0) {
    const success = await awardCurrency(
      guildId,
      userId,
      rewardAmount,
      `Craftle ${solved ? 'solved' : 'attempted'} in ${attempts} attempt${attempts !== 1 ? 's' : ''}`
    );

    if (success) {
      return rewardAmount;
    }
  }

  return 0;
}

/**
 * Get reward breakdown (for display purposes)
 * @param {boolean} solved - Whether puzzle was solved
 * @param {number} attempts - Number of attempts
 * @param {Object} stats - User stats
 * @param {string} difficulty - Puzzle difficulty
 * @param {boolean} isFirstSolve - First solve of the day
 * @returns {Object} Breakdown of rewards
 */
function getRewardBreakdown(solved, attempts, stats, difficulty = 'medium', isFirstSolve = false) {
  const breakdown = {
    base: 0,
    difficultyBonus: 0,
    perfectBonus: 0,
    streakBonus: 0,
    firstSolveBonus: 0,
    total: 0,
  };

  if (!solved) {
    return breakdown;
  }

  // Base reward
  breakdown.base = BASE_REWARDS[attempts] || 0;

  // Difficulty multiplier
  const difficultyMultiplier = BONUSES.DIFFICULTY_MULTIPLIER[difficulty] || 1.0;
  breakdown.difficultyBonus = Math.round(breakdown.base * (difficultyMultiplier - 1.0));

  // Perfect score bonus
  if (attempts === 1) {
    breakdown.perfectBonus = BONUSES.PERFECT_SCORE;
  }

  // Streak bonus
  if (stats && stats.currentStreak > 0) {
    breakdown.streakBonus = stats.currentStreak * BONUSES.STREAK_PER_DAY;
  }

  // First solve bonus
  if (isFirstSolve) {
    breakdown.firstSolveBonus = BONUSES.FIRST_SOLVE_DAILY;
  }

  // Calculate total
  breakdown.total =
    Math.round(breakdown.base * difficultyMultiplier) +
    breakdown.perfectBonus +
    breakdown.streakBonus +
    breakdown.firstSolveBonus;

  return breakdown;
}

/**
 * Format reward breakdown as string
 * @param {Object} breakdown - Reward breakdown object
 * @returns {string} Formatted string
 */
function formatRewardBreakdown(breakdown) {
  if (breakdown.total === 0) {
    return 'No reward (puzzle not solved)';
  }

  let output = `**Reward Breakdown:**\n`;
  output += `Base Reward: 🍯 ${breakdown.base.toLocaleString()}\n`;

  if (breakdown.difficultyBonus > 0) {
    output += `Difficulty Bonus: 🍯 +${breakdown.difficultyBonus.toLocaleString()}\n`;
  }

  if (breakdown.perfectBonus > 0) {
    output += `Perfect Score Bonus: 🍯 +${breakdown.perfectBonus.toLocaleString()}\n`;
  }

  if (breakdown.streakBonus > 0) {
    output += `Streak Bonus: 🍯 +${breakdown.streakBonus.toLocaleString()}\n`;
  }

  if (breakdown.firstSolveBonus > 0) {
    output += `First Solve Bonus: 🍯 +${breakdown.firstSolveBonus.toLocaleString()}\n`;
  }

  output += `\n**Total: 🍯 ${breakdown.total.toLocaleString()}**`;

  return output;
}

/**
 * Get reward preview (before completing)
 * @param {number} attempts - Current attempt number
 * @param {Object} stats - User stats
 * @param {string} difficulty - Puzzle difficulty
 * @returns {string} Preview text
 */
function getRewardPreview(attempts, stats, difficulty = 'medium') {
  const currentReward = calculateReward(true, attempts, stats, difficulty, false);
  const nextReward = attempts < 6 ? calculateReward(true, attempts + 1, stats, difficulty, false) : 0;

  let preview = `Current potential reward: 🍯 **${currentReward.toLocaleString()}**`;

  if (nextReward > 0) {
    preview += `\nNext attempt: 🍯 ${nextReward.toLocaleString()}`;
  }

  return preview;
}

module.exports = {
  calculateReward,
  awardCurrency,
  awardPuzzleReward,
  getRewardBreakdown,
  formatRewardBreakdown,
  getRewardPreview,
  BASE_REWARDS,
  BONUSES,
};
