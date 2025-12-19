const gameState = require('./dailyGameState');
const { updateBalance } = require('../../database/helpers/convexEconomyHelpers');
const { formatCurrency } = require('../../utils/currencyHelper');

/**
 * Daily Mafia Rewards System
 * Distributes currency rewards to winning team
 */

// Reward amount per winner
const REWARD_AMOUNT = 10000;

/**
 * Distribute rewards to winning team
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @param {string} winnerTeam - Winning team ("bee", "wasp", or neutral role)
 * @returns {Promise<void>}
 */
async function distributeRewards(client, gameId, winnerTeam) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game) return;

    const players = await gameState.getPlayers(gameId);

    // Determine winners based on team
    const winners = players.filter(player => {
      const role = gameState.getRoleDefinition(player.role);
      if (!role) return false;

      // Check if player is on winning team
      if (role.team === winnerTeam) {
        return true;
      }

      // Special handling for neutrals
      if (winnerTeam === 'neutral' && role.team === 'neutral') {
        // Could add specific neutral win condition checking here
        return true;
      }

      return false;
    });

    if (winners.length === 0) {
      console.log(`[Daily Mafia ${gameId}] No winners found for team ${winnerTeam}`);
      return;
    }

    console.log(`[Daily Mafia ${gameId}] Distributing rewards to ${winners.length} winner(s)`);

    // Award currency to each winner
    const rewardResults = [];

    for (const winner of winners) {
      try {
        const newBalance = await updateBalance(
          game.guildId,
          winner.playerId,
          REWARD_AMOUNT
        );

        rewardResults.push({
          playerId: winner.playerId,
          displayName: winner.displayName,
          amount: REWARD_AMOUNT,
          newBalance,
        });

        console.log(
          `[Daily Mafia ${gameId}] Awarded ${REWARD_AMOUNT} to ${winner.displayName} (new balance: ${newBalance})`
        );

      } catch (error) {
        console.error(`Error awarding currency to ${winner.displayName}:`, error);
      }
    }

    // Create reward event
    await gameState.createEvent({
      gameId,
      phase: 'ended',
      phaseNumber: 0,
      eventType: 'other',
      description: `Rewards distributed to ${winners.length} winner(s)`,
      data: {
        winnerTeam,
        rewards: rewardResults,
      },
    });

    // Send reward notification to channel
    await sendRewardNotification(client, game, winners, rewardResults);

  } catch (error) {
    console.error('Error distributing rewards:', error);
  }
}

/**
 * Send reward notification to channel
 * @param {Object} client - Discord client
 * @param {Object} game - Game object
 * @param {Array} winners - Winner players
 * @param {Array} rewardResults - Reward distribution results
 * @returns {Promise<void>}
 */
async function sendRewardNotification(client, game, winners, rewardResults) {
  try {
    const channel = await client.channels.fetch(game.channelId);
    if (!channel) return;

    const rewardAmount = await formatCurrency(game.guildId, REWARD_AMOUNT);

    let message = `💰 **[Game ${game.gameId}] Rewards Distributed!**\n\n`;
    message += `Each winner has received **${rewardAmount}**!\n\n`;
    message += `**Winners:**\n`;

    for (const result of rewardResults) {
      const winner = winners.find(w => w.playerId === result.playerId);
      const newBalanceFormatted = await formatCurrency(game.guildId, result.newBalance);

      message += `• ${result.displayName}`;

      if (winner && game.revealRoles) {
        message += ` (${winner.role})`;
      }

      message += ` - New balance: ${newBalanceFormatted}\n`;
    }

    await channel.send(message);

  } catch (error) {
    console.error('Error sending reward notification:', error);
  }
}

/**
 * Get reward amount
 * @returns {number} Reward amount per winner
 */
function getRewardAmount() {
  return REWARD_AMOUNT;
}

module.exports = {
  distributeRewards,
  getRewardAmount,
  REWARD_AMOUNT,
};
