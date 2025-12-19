const gameState = require('../game/dailyGameState');
const { endPhase } = require('../core/dailyGameLoop');

/**
 * Daily Mafia Phase Checker
 * Periodic cron job to check for phase deadlines and end phases that have timed out
 */

// Store interval reference
let checkInterval = null;

/**
 * Check all active and pending games for expired phases/lobbies
 * @param {Object} client - Discord client
 * @returns {Promise<void>}
 */
async function checkPhaseDeadlines(client) {
  try {
    const activeGames = await gameState.getAllActiveGames();

    if (activeGames.length === 0) {
      return; // No games
    }

    console.log(`[Phase Checker] Checking ${activeGames.length} game(s)`);

    const now = Date.now();

    for (const game of activeGames) {
      try {
        // Handle pending games (lobby deadline checking)
        if (game.status === 'pending' && game.lobbyDeadline) {
          if (now >= game.lobbyDeadline) {
            await handleLobbyDeadline(client, game);
          } else {
            // Send lobby warnings
            const timeUntilLobbyClose = game.lobbyDeadline - now;
            if (shouldSendLobbyWarning(game, timeUntilLobbyClose)) {
              await sendLobbyWarning(client, game, timeUntilLobbyClose);
            }
          }
          continue;
        }

        // Handle active games (phase deadline checking)
        if (game.status === 'active') {
          if (now >= game.phaseDeadline) {
            console.log(
              `[Phase Checker] Game ${game.gameId} phase deadline reached (${game.phase})`
            );

            // End phase with timeout flag
            await endPhase(client, game.gameId, true);
          } else {
            // Check for warning thresholds
            const timeUntilDeadline = game.phaseDeadline - now;

            // Send warnings at 2 hours and 30 minutes before deadline
            if (shouldSendWarning(game, timeUntilDeadline)) {
              await sendInactivityWarning(client, game, timeUntilDeadline);
            }
          }
        }
      } catch (error) {
        console.error(`[Phase Checker] Error processing game ${game.gameId}:`, error);
      }
    }
  } catch (error) {
    console.error('[Phase Checker] Error checking phase deadlines:', error);
  }
}

/**
 * Determine if warning should be sent
 * @param {Object} game - Game object
 * @param {number} timeRemaining - Time until deadline (ms)
 * @returns {boolean} Should send warning
 */
function shouldSendWarning(game, timeRemaining) {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const THIRTY_MINUTES = 30 * 60 * 1000;

  // Only send warnings for normal mode (not debug)
  if (game.debugMode) return false;

  // Check if we're approaching a warning threshold
  const twoHourWarning = timeRemaining <= TWO_HOURS && timeRemaining > (TWO_HOURS - 5 * 60 * 1000);
  const thirtyMinWarning = timeRemaining <= THIRTY_MINUTES && timeRemaining > (THIRTY_MINUTES - 5 * 60 * 1000);

  return twoHourWarning || thirtyMinWarning;
}

/**
 * Send warning about approaching deadline to inactive players
 * @param {Object} client - Discord client
 * @param {Object} game - Game object
 * @param {number} timeRemaining - Time until deadline (ms)
 * @returns {Promise<void>}
 */
async function sendInactivityWarning(client, game, timeRemaining) {
  try {
    const channel = await client.channels.fetch(game.channelId);
    if (!channel) return;

    const alivePlayers = await gameState.getAlivePlayers(game.gameId);
    const inactivePlayers = alivePlayers.filter(p => !p.hasActedThisPhase);

    if (inactivePlayers.length === 0) return;

    const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
    const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));

    let timeString = '';
    if (hours > 0) {
      timeString = `${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      timeString = `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }

    const mentions = inactivePlayers.map(p => `<@${p.playerId}>`).join(' ');

    const warningMsg = `⚠️ **[Game ${game.gameId}] Phase Deadline Warning**\n\n` +
                      `${mentions}\n\n` +
                      `The ${game.phase} phase will end in **${timeString}**.\n` +
                      `Please submit your ${game.phase === 'voting' ? 'vote' : 'action'} or you will be marked inactive!`;

    await channel.send(warningMsg);

    console.log(`[Phase Checker] Sent warning to ${inactivePlayers.length} inactive player(s) in game ${game.gameId}`);
  } catch (error) {
    console.error('[Phase Checker] Error sending inactivity warning:', error);
  }
}

/**
 * Start the phase checker interval
 * @param {Object} client - Discord client
 * @param {number} intervalMinutes - Check interval in minutes (default: 5)
 * @returns {void}
 */
function startPhaseChecker(client, intervalMinutes = 5) {
  if (checkInterval) {
    console.log('[Phase Checker] Already running');
    return;
  }

  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[Phase Checker] Starting with ${intervalMinutes} minute interval`);

  // Run immediately on start
  checkPhaseDeadlines(client);

  // Then run at regular intervals
  checkInterval = setInterval(() => {
    checkPhaseDeadlines(client);
  }, intervalMs);
}

/**
 * Stop the phase checker interval
 * @returns {void}
 */
function stopPhaseChecker() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log('[Phase Checker] Stopped');
  }
}

/**
 * Check if phase checker is running
 * @returns {boolean} Is running
 */
function isRunning() {
  return checkInterval !== null;
}

/**
 * Handle lobby deadline - auto-start if >= 8 players, auto-cancel if < 8
 * @param {Object} client - Discord client
 * @param {Object} game - Game object
 * @returns {Promise<void>}
 */
async function handleLobbyDeadline(client, game) {
  try {
    const players = await gameState.getPlayers(game.gameId);
    const playerCount = players.length;

    console.log(`[Phase Checker] Lobby deadline reached for game ${game.gameId} (${playerCount} players)`);

    const channel = await client.channels.fetch(game.channelId);
    if (!channel) return;

    if (playerCount >= 8) {
      // AUTO-START: 8+ players
      console.log(`[Phase Checker] Auto-starting game ${game.gameId} (${playerCount} players)`);

      await channel.send(
        `🐝 **[Game ${game.gameId}] Lobby Closed - AUTO-STARTING!**\n\n` +
        `${playerCount} players joined - game is starting now!\n` +
        `Check your DMs for your role!`
      );

      // Use the same start logic as manual start
      const { startGame } = require('../core/dailyGameLoop');
      const { getRoleDistribution, shuffleArray } = require('../../mafia/game/mafiaUtils');
      const { ROLES } = require('../../mafia/roles/mafiaRoles');
      const { createStatusMessage } = require('../ui/dailyEmbeds');
      const { sendNightActionPrompts } = require('../core/dailyActionHandler');

      // Assign roles
      const roleKeys = getRoleDistribution(playerCount, false, false, game.tier);
      const shuffledRoleKeys = shuffleArray(roleKeys);

      for (let i = 0; i < players.length; i++) {
        const roleKey = shuffledRoleKeys[i];
        const roleName = ROLES[roleKey].name; // Convert key to display name

        await gameState.updatePlayer(game.gameId, players[i].playerId, {
          role: roleName,
        });
      }

      // Create status message
      const statusMessageId = await createStatusMessage(client, game.gameId);
      if (statusMessageId) {
        await gameState.updateGame(game.gameId, { statusMessageId });
      }

      // Start game
      await startGame(client, game.gameId);

      // Send role DMs
      await sendRoleDMs(client, game.gameId);

      // Send night action prompts
      await sendNightActionPrompts(client, game.gameId);

    } else {
      // AUTO-CANCEL: Less than 8 players
      console.log(`[Phase Checker] Auto-cancelling game ${game.gameId} (only ${playerCount} players)`);

      await gameState.updateGame(game.gameId, {
        status: 'cancelled',
        phase: 'ended',
      });

      await gameState.createEvent({
        gameId: game.gameId,
        phase: 'setup',
        phaseNumber: 0,
        eventType: 'other',
        description: `Game auto-cancelled (insufficient players: ${playerCount}/8)`,
      });

      await channel.send(
        `❌ **[Game ${game.gameId}] Lobby Closed - CANCELLED**\n\n` +
        `Only ${playerCount} player${playerCount !== 1 ? 's' : ''} joined (minimum 8 required).\n` +
        `The game has been automatically cancelled.`
      );

      // Try to delete the setup message
      if (game.statusMessageId) {
        try {
          const setupMessage = await channel.messages.fetch(game.statusMessageId);
          await setupMessage.delete();
        } catch (error) {
          console.error('Could not delete setup message:', error);
        }
      }
    }
  } catch (error) {
    console.error(`[Phase Checker] Error handling lobby deadline for game ${game.gameId}:`, error);
  }
}

/**
 * Send role DMs to all players
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @returns {Promise<void>}
 */
async function sendRoleDMs(client, gameId) {
  const players = await gameState.getPlayers(gameId);

  for (const player of players) {
    try {
      const user = await client.users.fetch(player.playerId);
      const role = gameState.getRoleDefinition(player.role);

      if (!role) continue;

      let dm = `🐝 **Daily Mafia - Your Role**\n\n`;
      dm += `**Role:** ${role.emoji} ${role.name}\n`;
      dm += `**Team:** ${role.team}\n\n`;
      dm += `**Description:** ${role.description}\n\n`;
      dm += `**Abilities:**\n${role.abilities.join('\n')}\n\n`;
      dm += `**Win Condition:** ${role.winCondition}`;

      await user.send(dm);
    } catch (error) {
      console.error(`Could not send role DM to ${player.displayName}:`, error);
    }
  }
}

/**
 * Determine if lobby warning should be sent
 * @param {Object} game - Game object
 * @param {number} timeRemaining - Time until lobby closes (ms)
 * @returns {boolean} Should send warning
 */
function shouldSendLobbyWarning(game, timeRemaining) {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const THIRTY_MINUTES = 30 * 60 * 1000;

  // Only send warnings for normal mode (not debug)
  if (game.debugMode) return false;

  // Check if we're approaching a warning threshold
  const twoHourWarning = timeRemaining <= TWO_HOURS && timeRemaining > (TWO_HOURS - 5 * 60 * 1000);
  const thirtyMinWarning = timeRemaining <= THIRTY_MINUTES && timeRemaining > (THIRTY_MINUTES - 5 * 60 * 1000);

  return twoHourWarning || thirtyMinWarning;
}

/**
 * Send lobby warning about approaching deadline
 * @param {Object} client - Discord client
 * @param {Object} game - Game object
 * @param {number} timeRemaining - Time until lobby closes (ms)
 * @returns {Promise<void>}
 */
async function sendLobbyWarning(client, game, timeRemaining) {
  try {
    const channel = await client.channels.fetch(game.channelId);
    if (!channel) return;

    const players = await gameState.getPlayers(game.gameId);
    const playerCount = players.length;

    const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
    const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));

    let timeString = '';
    if (hours > 0) {
      timeString = `${hours} hour${hours > 1 ? 's' : ''}`;
    } else {
      timeString = `${minutes} minute${minutes > 1 ? 's' : ''}`;
    }

    const warningMsg = `⚠️ **[Game ${game.gameId}] Lobby Closing Soon**\n\n` +
                      `Current players: ${playerCount}/8 minimum\n\n` +
                      `Lobby closes in **${timeString}**.\n` +
                      (playerCount >= 8
                        ? `✅ Minimum met - game will auto-start!`
                        : `❌ Need ${8 - playerCount} more player${8 - playerCount !== 1 ? 's' : ''} or the game will be cancelled!`);

    await channel.send(warningMsg);

    console.log(`[Phase Checker] Sent lobby warning for game ${game.gameId} (${playerCount} players, ${timeString} remaining)`);
  } catch (error) {
    console.error('[Phase Checker] Error sending lobby warning:', error);
  }
}

module.exports = {
  checkPhaseDeadlines,
  startPhaseChecker,
  stopPhaseChecker,
  isRunning,
};
