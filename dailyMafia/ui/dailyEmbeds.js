const { EmbedBuilder } = require('discord.js');
const gameState = require('../game/dailyGameState');
const { formatTimeRemaining } = require('../core/dailyGameLoop');
const { buildVotingButtons, buildRefreshButton } = require('./dailyButtons');

/**
 * Daily Mafia Embed Builders
 * Creates comprehensive status displays for Daily Mafia games
 */

// Debounce map to prevent spam updates
const updateDebounce = new Map();
const DEBOUNCE_TIME = 30000; // 30 seconds

/**
 * Build comprehensive game status embed
 * @param {string} gameId - Game ID
 * @returns {Promise<Object>} Embed object
 */
async function buildStatusEmbed(gameId) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game) return null;

    const players = await gameState.getPlayers(gameId);
    const alivePlayers = players.filter(p => p.alive);
    const deadPlayers = players.filter(p => !p.alive);
    const recentEvents = await gameState.getRecentEvents(gameId, 5);

    const embed = new EmbedBuilder()
      .setColor(getPhaseColor(game.phase))
      .setTitle(`🐝 Daily Mafia - Game #${game.gameId.substring(6, 12)}`)
      .setTimestamp();

    // Phase information
    let phaseInfo = `**Current Phase:** ${getPhaseEmoji(game.phase)} ${game.phase.charAt(0).toUpperCase() + game.phase.slice(1)}`;

    if (game.phase === 'night') {
      phaseInfo += ` ${game.nightNumber}`;
    } else if (game.phase === 'voting' || game.phase === 'day') {
      phaseInfo += ` ${game.dayNumber}`;
    }

    phaseInfo += `\n**Time Remaining:** ${formatTimeRemaining(game.phaseDeadline)}`;

    embed.addFields({
      name: '📋 Game Info',
      value: phaseInfo,
      inline: false,
    });

    // Alive players
    let aliveList = '';
    for (const player of alivePlayers) {
      const emoji = player.hasActedThisPhase ? '✅' :
                   player.isInactive ? '💤' : '⏳';

      aliveList += `${emoji} ${player.displayName}`;

      if (player.isInactive) {
        aliveList += ' (inactive)';
      } else if (!player.hasActedThisPhase && game.phase !== 'day') {
        aliveList += ' (waiting)';
      }

      aliveList += '\n';
    }

    embed.addFields({
      name: `👥 Alive Players (${alivePlayers.length})`,
      value: aliveList || 'None',
      inline: false,
    });

    // Dead players
    if (deadPlayers.length > 0) {
      let deadList = '';
      for (const player of deadPlayers) {
        deadList += `☠️ ${player.displayName}`;

        if (game.revealRoles && player.role) {
          deadList += ` - ${player.role}`;
        }

        if (player.deathReason) {
          deadList += ` (${player.deathReason})`;
        }

        deadList += '\n';
      }

      embed.addFields({
        name: `💀 Dead Players (${deadPlayers.length})`,
        value: deadList,
        inline: false,
      });
    }

    // Waiting for (if applicable)
    if (game.phase !== 'day' && game.phase !== 'ended') {
      const waiting = alivePlayers.filter(p => !p.hasActedThisPhase);

      if (waiting.length > 0) {
        const mentions = waiting.map(p => `<@${p.playerId}>`).join(', ');
        embed.addFields({
          name: '⏰ Waiting For',
          value: mentions,
          inline: false,
        });
      }
    }

    // Recent events
    if (recentEvents.length > 0) {
      let eventList = '';
      for (const event of recentEvents.reverse()) {
        const timeAgo = getTimeAgo(event.timestamp);
        eventList += `• ${event.description} - *${timeAgo}*\n`;
      }

      embed.addFields({
        name: '📜 Recent Events',
        value: eventList,
        inline: false,
      });
    }

    return embed;

  } catch (error) {
    console.error('Error building status embed:', error);
    return null;
  }
}

/**
 * Update status message in channel
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @returns {Promise<void>}
 */
async function updateStatusMessage(client, gameId) {
  try {
    // Check debounce
    const lastUpdate = updateDebounce.get(gameId) || 0;
    const now = Date.now();

    if (now - lastUpdate < DEBOUNCE_TIME) {
      return; // Skip update to avoid rate limits
    }

    updateDebounce.set(gameId, now);

    const game = await gameState.getGame(gameId);
    if (!game || !game.statusMessageId) return;

    const channel = await client.channels.fetch(game.channelId);
    if (!channel) return;

    const embed = await buildStatusEmbed(gameId);
    if (!embed) return;

    let components = [];

    // Add voting buttons during voting phase
    if (game.phase === 'voting' && game.status === 'active') {
      components = await buildVotingButtons(gameId);
    } else {
      components = buildRefreshButton(gameId);
    }

    try {
      const message = await channel.messages.fetch(game.statusMessageId);
      await message.edit({
        embeds: [embed],
        components,
      });

      console.log(`[Daily Mafia ${gameId}] Updated status message`);
    } catch (error) {
      // Message might have been deleted, create new one
      const newMessage = await channel.send({
        embeds: [embed],
        components,
      });

      await gameState.updateGame(gameId, {
        statusMessageId: newMessage.id,
      });

      console.log(`[Daily Mafia ${gameId}] Created new status message`);
    }

  } catch (error) {
    console.error('Error updating status message:', error);
  }
}

/**
 * Create initial status message
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @returns {Promise<string|null>} Message ID
 */
async function createStatusMessage(client, gameId) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game) return null;

    const channel = await client.channels.fetch(game.channelId);
    if (!channel) return null;

    const embed = await buildStatusEmbed(gameId);
    if (!embed) return null;

    const components = buildRefreshButton(gameId);

    const message = await channel.send({
      embeds: [embed],
      components,
    });

    // Pin the message
    try {
      await message.pin();
    } catch (error) {
      console.error('Could not pin status message:', error);
    }

    console.log(`[Daily Mafia ${gameId}] Created status message`);

    return message.id;

  } catch (error) {
    console.error('Error creating status message:', error);
    return null;
  }
}

/**
 * Build game setup embed
 * @param {string} gameId - Game ID
 * @param {Array} players - Player list
 * @param {number} lobbyDeadline - Lobby deadline timestamp
 * @returns {Object} Embed object
 */
function buildSetupEmbed(gameId, players, lobbyDeadline = null) {
  const playerCount = players.length;
  const minPlayers = 8;
  const needMore = Math.max(0, minPlayers - playerCount);

  let statusEmoji = '';
  let statusText = '';

  if (playerCount >= minPlayers) {
    statusEmoji = '✅';
    statusText = 'Ready to start!';
  } else {
    statusEmoji = '⏳';
    statusText = `Need ${needMore} more player${needMore !== 1 ? 's' : ''}`;
  }

  const embed = new EmbedBuilder()
    .setColor(playerCount >= minPlayers ? '#00FF00' : '#FFD700')
    .setTitle(`🐝 Daily Mafia - Game Lobby`)
    .setDescription(`Game ID: \`${gameId.substring(6, 12)}\``)
    .addFields({
      name: `👥 Players (${playerCount}/${minPlayers} minimum)`,
      value: players.length > 0 ? players.map(p => `• ${p.displayName}`).join('\n') : 'None yet',
    })
    .addFields({
      name: '📋 Lobby Status',
      value: `${statusEmoji} **${statusText}**\n\n` +
             (lobbyDeadline
               ? `⏰ Lobby closes: <t:${Math.floor(lobbyDeadline / 1000)}:R>\n` +
                 `• **${minPlayers}+ players**: Auto-starts when lobby closes\n` +
                 `• **< ${minPlayers} players**: Auto-cancels\n` +
                 `• **Manual start**: Available for organizer when ${minPlayers}+ players join`
               : 'Use buttons below to join or leave.'),
    })
    .setTimestamp();

  return embed;
}

/**
 * Build game end embed
 * @param {string} gameId - Game ID
 * @param {string} winnerTeam - Winning team
 * @param {Array} winners - Winner players
 * @param {string} rewardAmount - Formatted reward amount
 * @returns {Object} Embed object
 */
function buildGameEndEmbed(gameId, winnerTeam, winners, rewardAmount) {
  const embed = new EmbedBuilder()
    .setColor('#00FF00')
    .setTitle(`🎉 Game Over - ${winnerTeam.toUpperCase()} Team Wins!`)
    .setDescription(`Game #${gameId.substring(6, 12)}`)
    .addFields({
      name: '🏆 Winners',
      value: winners.map(w => `• ${w.displayName} - ${w.role}`).join('\n'),
    })
    .addFields({
      name: '💰 Rewards',
      value: `Each winner receives **${rewardAmount}**!`,
    })
    .setTimestamp();

  return embed;
}

/**
 * Get phase emoji
 * @param {string} phase - Phase name
 * @returns {string} Emoji
 */
function getPhaseEmoji(phase) {
  const emojis = {
    setup: '⚙️',
    night: '🌙',
    day: '☀️',
    voting: '🗳️',
    ended: '🏁',
  };
  return emojis[phase] || '❓';
}

/**
 * Get phase color
 * @param {string} phase - Phase name
 * @returns {string} Hex color
 */
function getPhaseColor(phase) {
  const colors = {
    setup: '#FFD700', // Gold
    night: '#000080', // Navy
    day: '#FFD700',   // Gold
    voting: '#FF4500', // Red-orange
    ended: '#808080', // Gray
  };
  return colors[phase] || '#000000';
}

/**
 * Get time ago string
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Time ago string
 */
function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

module.exports = {
  buildStatusEmbed,
  updateStatusMessage,
  createStatusMessage,
  buildSetupEmbed,
  buildGameEndEmbed,
};
