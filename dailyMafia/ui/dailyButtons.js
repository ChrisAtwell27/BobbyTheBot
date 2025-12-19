const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const gameState = require('../game/dailyGameState');

/**
 * Daily Mafia Button UI Components
 * Builds interactive button components for voting and game actions
 */

/**
 * Build voting buttons for all alive players
 * @param {string} gameId - Game ID
 * @returns {Promise<Array>} Array of ActionRow components
 */
async function buildVotingButtons(gameId) {
  try {
    const alivePlayers = await gameState.getAlivePlayers(gameId);
    const game = await gameState.getGame(gameId);
    const votes = await gameState.getVotesForDay(gameId, game.dayNumber);

    // Count votes for each player
    const voteCounts = {};
    for (const vote of votes) {
      voteCounts[vote.targetId] = (voteCounts[vote.targetId] || 0) + 1;
    }

    const rows = [];
    let currentRow = new ActionRowBuilder();
    let buttonCount = 0;

    for (const player of alivePlayers) {
      const voteCount = voteCounts[player.playerId] || 0;
      const label = voteCount > 0 ? `${player.displayName} (${voteCount})` : player.displayName;

      const button = new ButtonBuilder()
        .setCustomId(`dailymafia_vote_${gameId}_${player.playerId}`)
        .setLabel(label)
        .setStyle(voteCount > 0 ? ButtonStyle.Danger : ButtonStyle.Secondary);

      currentRow.addComponents(button);
      buttonCount++;

      // Discord allows max 5 buttons per row
      if (buttonCount >= 5) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
        buttonCount = 0;
      }
    }

    // Add skip button
    const skipVotes = voteCounts['skip'] || 0;
    const skipLabel = skipVotes > 0 ? `Skip Vote (${skipVotes})` : 'Skip Vote';

    const skipButton = new ButtonBuilder()
      .setCustomId(`dailymafia_vote_${gameId}_skip`)
      .setLabel(skipLabel)
      .setStyle(ButtonStyle.Primary);

    currentRow.addComponents(skipButton);
    rows.push(currentRow);

    // Discord allows max 5 action rows
    return rows.slice(0, 5);

  } catch (error) {
    console.error('Error building voting buttons:', error);
    return [];
  }
}

/**
 * Build game start confirmation buttons
 * @param {string} gameId - Game ID
 * @returns {Array} Array of ActionRow components
 */
function buildStartGameButtons(gameId) {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`dailymafia_start_${gameId}`)
        .setLabel('Start Game')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`dailymafia_cancel_${gameId}`)
        .setLabel('Cancel Game')
        .setStyle(ButtonStyle.Danger)
    );

  return [row];
}

/**
 * Build join game button
 * @param {string} gameId - Game ID
 * @returns {Array} Array of ActionRow components
 */
function buildJoinGameButton(gameId) {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`dailymafia_join_${gameId}`)
        .setLabel('Join Game')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`dailymafia_leave_${gameId}`)
        .setLabel('Leave Game')
        .setStyle(ButtonStyle.Secondary)
    );

  return [row];
}

/**
 * Build refresh status button
 * @param {string} gameId - Game ID
 * @returns {Array} Array of ActionRow components
 */
function buildRefreshButton(gameId) {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`dailymafia_refresh_${gameId}`)
        .setLabel('Refresh Status')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
    );

  return [row];
}

/**
 * Disable all buttons in action rows
 * @param {Array} rows - Array of ActionRow components
 * @returns {Array} Array of ActionRow components with disabled buttons
 */
function disableAllButtons(rows) {
  return rows.map(row => {
    const newRow = new ActionRowBuilder();
    row.components.forEach(button => {
      newRow.addComponents(
        ButtonBuilder.from(button).setDisabled(true)
      );
    });
    return newRow;
  });
}

module.exports = {
  buildVotingButtons,
  buildStartGameButtons,
  buildJoinGameButton,
  buildRefreshButton,
  disableAllButtons,
};
