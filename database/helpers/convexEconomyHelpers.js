const { getConvexClient } = require('../convexClient');
const { api } = require('../../convex/_generated/api');

/**
 * Economy helper functions using Convex
 * Drop-in replacement for MongoDB economyHelpers.js
 */

/**
 * Get user balance
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<number>} User balance
 */
async function getBalance(guildId, userId) {
  try {
    const client = getConvexClient();
    if (!client) return 0;

    const balance = await client.query(api.users.getBalance, { guildId, userId });
    return balance || 0;
  } catch (error) {
    console.error('Error getting balance:', error);
    return 0;
  }
}

/**
 * Update user balance (add or subtract)
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} amount - Amount to add (positive) or subtract (negative)
 * @returns {Promise<number>} New balance
 */
async function updateBalance(guildId, userId, amount) {
  try {
    const client = getConvexClient();
    if (!client) return 0;

    const newBalance = await client.mutation(api.users.updateBalance, {
      guildId,
      userId,
      amount,
    });
    return newBalance;
  } catch (error) {
    console.error('Error updating balance:', error);
    throw error;
  }
}

/**
 * Set exact balance
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} amount - New balance amount
 * @returns {Promise<number>} New balance
 */
async function setBalance(guildId, userId, amount) {
  try {
    const client = getConvexClient();
    if (!client) return 0;

    const newBalance = await client.mutation(api.users.setBalance, {
      guildId,
      userId,
      amount,
    });
    return newBalance;
  } catch (error) {
    console.error('Error setting balance:', error);
    throw error;
  }
}

/**
 * Get top balances (leaderboard)
 * @param {string} guildId - Guild ID
 * @param {number} limit - Number of top users to return
 * @returns {Promise<Array>} Top users
 */
async function getTopBalances(guildId, limit = 10) {
  try {
    const client = getConvexClient();
    if (!client) return [];

    const users = await client.query(api.users.getTopBalances, { guildId, limit });
    return users;
  } catch (error) {
    console.error('Error getting top balances:', error);
    return [];
  }
}

/**
 * Get user rank by balance
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} User rank and balance
 */
async function getUserRank(guildId, userId) {
  try {
    const client = getConvexClient();
    if (!client) return null;

    const rank = await client.query(api.users.getUserRank, { guildId, userId });
    return rank;
  } catch (error) {
    console.error('Error getting user rank:', error);
    return null;
  }
}

/**
 * Calculate total economy
 * @param {string} guildId - Guild ID
 * @returns {Promise<number>} Total economy
 */
async function getTotalEconomy(guildId) {
  try {
    const client = getConvexClient();
    if (!client) return 0;

    const total = await client.query(api.users.getTotalEconomy, { guildId });
    return total;
  } catch (error) {
    console.error('Error getting total economy:', error);
    return 0;
  }
}

module.exports = {
  getBalance,
  updateBalance,
  setBalance,
  getTopBalances,
  getUserRank,
  getTotalEconomy,
};
