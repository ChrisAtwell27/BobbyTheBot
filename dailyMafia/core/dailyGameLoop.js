const gameState = require('../game/dailyGameState');
const { checkWinConditions } = require('../../mafia/game/mafiaUtils');

/**
 * Daily Mafia Game Loop
 * Handles phase transitions with 24-hour (or debug) timeouts
 */

// Phase duration - same for ALL phases
const PHASE_DURATION_NORMAL = 24 * 60 * 60 * 1000; // 24 hours
const PHASE_DURATION_DEBUG = 5 * 60 * 1000;       // 5 minutes

/**
 * Get phase duration - same for all phases (24hr or 5min debug)
 * @param {Object} game - Game object
 * @returns {number} Duration in milliseconds
 */
function getPhaseDuration(game) {
  return game.debugMode ? PHASE_DURATION_DEBUG : PHASE_DURATION_NORMAL;
}

/**
 * Calculate time remaining until deadline
 * @param {number} deadline - Deadline timestamp
 * @returns {Object} Time remaining { hours, minutes, total }
 */
function getTimeRemaining(deadline) {
  const now = Date.now();
  const total = Math.max(0, deadline - now);
  const hours = Math.floor(total / (60 * 60 * 1000));
  const minutes = Math.floor((total % (60 * 60 * 1000)) / (60 * 1000));

  return { hours, minutes, total };
}

/**
 * Format time remaining as string
 * @param {number} deadline - Deadline timestamp
 * @returns {string} Formatted time string
 */
function formatTimeRemaining(deadline) {
  const { hours, minutes } = getTimeRemaining(deadline);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Check if all alive players have acted this phase
 * @param {string} gameId - Game ID
 * @param {string} phase - Current phase
 * @returns {Promise<boolean>} True if all have acted
 */
async function checkAllPlayersActed(gameId, phase) {
  const game = await gameState.getGame(gameId);
  if (!game) return false;

  const alivePlayers = await gameState.getAlivePlayers(gameId);

  if (phase === 'night') {
    // Check only players with night actions
    const playersWithActions = alivePlayers.filter(p => {
      const role = gameState.getRoleDefinition(p.role);
      return role && role.nightAction;
    });

    if (playersWithActions.length === 0) return true;

    return playersWithActions.every(p => p.hasActedThisPhase);
  }

  if (phase === 'voting') {
    // Check all alive players have voted
    if (alivePlayers.length === 0) return true;
    return alivePlayers.every(p => p.hasActedThisPhase);
  }

  // Day phase doesn't require actions
  return false;
}

/**
 * Start a new phase
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @param {string} newPhase - New phase to start
 * @param {Object} options - Phase options
 * @returns {Promise<boolean>} Success
 */
async function startPhase(client, gameId, newPhase, options = {}) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game) return false;

    const now = Date.now();
    const duration = getPhaseDuration(game); // Same duration for all phases
    const deadline = now + duration;

    // Update game state
    const updates = {
      phase: newPhase,
      phaseStartTime: now,
      phaseDeadline: deadline,
    };

    // Increment counters
    if (newPhase === 'night') {
      updates.nightNumber = game.nightNumber + 1;
    } else if (newPhase === 'voting') {
      updates.dayNumber = game.dayNumber + 1;
    }

    await gameState.updateGame(gameId, updates);

    // Reset hasActedThisPhase for all alive players
    await gameState.resetPhaseActions(gameId);

    // Create phase change event
    await gameState.createEvent({
      gameId,
      phase: newPhase,
      phaseNumber: newPhase === 'night' ? updates.nightNumber : updates.dayNumber,
      eventType: 'phase_change',
      description: `${newPhase.charAt(0).toUpperCase() + newPhase.slice(1)} phase started`,
    });

    // Send phase notifications
    await sendPhaseNotifications(client, gameId, newPhase);

    console.log(`[Daily Mafia ${gameId}] Started ${newPhase} phase`);
    return true;
  } catch (error) {
    console.error(`Error starting phase ${newPhase}:`, error);
    return false;
  }
}

/**
 * End current phase and transition to next
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @param {boolean} isTimeout - Whether phase ended due to timeout
 * @returns {Promise<boolean>} Success
 */
async function endPhase(client, gameId, isTimeout = false) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game) return false;

    console.log(`[Daily Mafia ${gameId}] Ending ${game.phase} phase (timeout: ${isTimeout})`);

    // Mark inactive players if timeout
    if (isTimeout) {
      await markInactivePlayers(gameId, game.phase);
    }

    // Process phase-specific logic
    if (game.phase === 'night') {
      await processNightPhaseEnd(client, gameId);
    } else if (game.phase === 'voting') {
      await processVotingPhaseEnd(client, gameId);
    }

    // Check win conditions
    const winner = await checkGameWinCondition(client, gameId);
    if (winner) {
      await endGame(client, gameId, winner);
      return true;
    }

    // Determine next phase
    const nextPhase = getNextPhase(game.phase);
    await startPhase(client, gameId, nextPhase);

    return true;
  } catch (error) {
    console.error(`Error ending phase for game ${gameId}:`, error);
    return false;
  }
}

/**
 * Get next phase in sequence
 * @param {string} currentPhase - Current phase
 * @returns {string} Next phase
 */
function getNextPhase(currentPhase) {
  const phaseOrder = ['night', 'day', 'voting'];
  const currentIndex = phaseOrder.indexOf(currentPhase);

  if (currentIndex === -1 || currentIndex === phaseOrder.length - 1) {
    return 'night'; // Loop back to night
  }

  return phaseOrder[currentIndex + 1];
}

/**
 * Mark inactive players who haven't acted by deadline
 * @param {string} gameId - Game ID
 * @param {string} phase - Current phase
 * @returns {Promise<void>}
 */
async function markInactivePlayers(gameId, phase) {
  const alivePlayers = await gameState.getAlivePlayers(gameId);

  for (const player of alivePlayers) {
    if (!player.hasActedThisPhase) {
      await gameState.updatePlayer(gameId, player.playerId, {
        isInactive: true,
      });

      await gameState.createEvent({
        gameId,
        phase,
        phaseNumber: phase === 'night' ? player.nightNumber : player.dayNumber,
        eventType: 'other',
        description: `${player.displayName} was marked inactive (did not act)`,
        data: { playerId: player.playerId },
      });

      console.log(`[Daily Mafia ${gameId}] Marked ${player.displayName} as inactive`);
    }
  }
}

/**
 * Process night phase end
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @returns {Promise<void>}
 */
async function processNightPhaseEnd(client, gameId) {
  // Import action handler dynamically to avoid circular dependency
  const { processNightActions } = require('./dailyActionHandler');
  await processNightActions(client, gameId);
}

/**
 * Process voting phase end
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @returns {Promise<void>}
 */
async function processVotingPhaseEnd(client, gameId) {
  // Import voting handler dynamically to avoid circular dependency
  const { tallyVotes } = require('./dailyVotingHandler');
  await tallyVotes(client, gameId);
}

/**
 * Check win conditions
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @returns {Promise<string|null>} Winner team or null
 */
async function checkGameWinCondition(client, gameId) {
  try {
    const game = await gameState.getGame(gameId);
    const players = await gameState.getPlayers(gameId);

    // Convert to format expected by shared mafiaUtils
    const gameData = {
      players: players.map(p => ({
        userId: p.playerId,
        role: p.role,
        alive: p.alive,
      })),
    };

    // Use shared win condition logic
    const result = checkWinConditions(gameData);

    if (result.gameOver) {
      return result.winner;
    }

    return null;
  } catch (error) {
    console.error('Error checking win conditions:', error);
    return null;
  }
}

/**
 * End game with winner
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @param {string} winnerTeam - Winning team
 * @returns {Promise<void>}
 */
async function endGame(client, gameId, winnerTeam) {
  try {
    console.log(`[Daily Mafia ${gameId}] Game ended - ${winnerTeam} team wins!`);

    // Update game status
    await gameState.updateGame(gameId, {
      phase: 'ended',
      status: 'completed',
    });

    // Create win event
    await gameState.createEvent({
      gameId,
      phase: 'ended',
      phaseNumber: 0,
      eventType: 'win',
      description: `${winnerTeam} team wins!`,
      data: { winnerTeam },
    });

    // Distribute rewards
    const { distributeRewards } = require('../game/dailyRewards');
    await distributeRewards(client, gameId, winnerTeam);

    // Send game end notifications
    await sendGameEndNotifications(client, gameId, winnerTeam);

  } catch (error) {
    console.error('Error ending game:', error);
  }
}

/**
 * Send phase notifications to channel
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @param {string} phase - Phase name
 * @returns {Promise<void>}
 */
async function sendPhaseNotifications(client, gameId, phase) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game) return;

    const channel = await client.channels.fetch(game.channelId);
    if (!channel) return;

    const timeRemaining = formatTimeRemaining(game.phaseDeadline);

    let message = '';
    if (phase === 'night') {
      message = `🌙 **[Game ${gameId}] Night ${game.nightNumber + 1} has begun!**\n`;
      message += `Players with night actions should check their DMs.\n`;
      message += `⏰ Phase ends in ${timeRemaining} or when all players act.`;
    } else if (phase === 'day') {
      message = `☀️ **[Game ${gameId}] Day ${game.dayNumber} has begun!**\n`;
      message += `Discuss and prepare for voting.\n`;
      message += `⏰ Phase ends in ${timeRemaining}.`;
    } else if (phase === 'voting') {
      message = `🗳️ **[Game ${gameId}] Voting Phase has begun!**\n`;
      message += `Use \`!vote @player\` or the buttons below to vote.\n`;
      message += `⏰ Phase ends in ${timeRemaining} or when all players vote.`;
    }

    await channel.send(message);

    // Update status display
    const { updateStatusMessage } = require('../ui/dailyEmbeds');
    await updateStatusMessage(client, gameId);

  } catch (error) {
    console.error('Error sending phase notifications:', error);
  }
}

/**
 * Send game end notifications
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @param {string} winnerTeam - Winning team
 * @returns {Promise<void>}
 */
async function sendGameEndNotifications(client, gameId, winnerTeam) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game) return;

    const channel = await client.channels.fetch(game.channelId);
    if (!channel) return;

    const players = await gameState.getPlayers(gameId);
    const winners = players.filter(p => {
      const role = gameState.getRoleDefinition(p.role);
      return role && role.team === winnerTeam;
    });

    const { formatCurrency } = require('../../utils/currencyHelper');
    const rewardAmount = await formatCurrency(game.guildId, 10000);

    let message = `🎉 **[Game ${gameId}] GAME OVER!** 🎉\n\n`;
    message += `**${winnerTeam.toUpperCase()} TEAM WINS!**\n\n`;
    message += `**Winners** (each receives ${rewardAmount}):\n`;
    message += winners.map(w => `• ${w.displayName} - ${w.role}`).join('\n');

    await channel.send(message);

    // Final status update
    const { updateStatusMessage } = require('../ui/dailyEmbeds');
    await updateStatusMessage(client, gameId);

  } catch (error) {
    console.error('Error sending game end notifications:', error);
  }
}

/**
 * Check if phase can end early (all players acted)
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @returns {Promise<void>}
 */
async function checkEarlyPhaseEnd(client, gameId) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game || game.status !== 'active') return;

    const allActed = await checkAllPlayersActed(gameId, game.phase);

    if (allActed) {
      console.log(`[Daily Mafia ${gameId}] All players acted - ending phase early`);
      await endPhase(client, gameId, false);
    }
  } catch (error) {
    console.error('Error checking early phase end:', error);
  }
}

/**
 * Start the game (transition from setup to first night)
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @returns {Promise<boolean>} Success
 */
async function startGame(client, gameId) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game) return false;

    if (game.status !== 'pending') {
      console.log(`Game ${gameId} is not in pending status`);
      return false;
    }

    // Update status to active
    await gameState.updateGame(gameId, {
      status: 'active',
    });

    // Create game start event
    await gameState.createEvent({
      gameId,
      phase: 'setup',
      phaseNumber: 0,
      eventType: 'other',
      description: 'Game started',
    });

    // Start first night phase
    await startPhase(client, gameId, 'night');

    console.log(`[Daily Mafia ${gameId}] Game started!`);
    return true;
  } catch (error) {
    console.error('Error starting game:', error);
    return false;
  }
}

/**
 * Cancel game
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @returns {Promise<boolean>} Success
 */
async function cancelGame(client, gameId) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game) return false;

    await gameState.updateGame(gameId, {
      status: 'cancelled',
      phase: 'ended',
    });

    await gameState.createEvent({
      gameId,
      phase: game.phase,
      phaseNumber: 0,
      eventType: 'other',
      description: 'Game cancelled',
    });

    const channel = await client.channels.fetch(game.channelId);
    if (channel) {
      await channel.send(`❌ **[Game ${gameId}] Game has been cancelled.**`);
    }

    console.log(`[Daily Mafia ${gameId}] Game cancelled`);
    return true;
  } catch (error) {
    console.error('Error cancelling game:', error);
    return false;
  }
}

module.exports = {
  // Phase management
  startPhase,
  endPhase,
  checkEarlyPhaseEnd,

  // Game lifecycle
  startGame,
  endGame,
  cancelGame,

  // Win conditions
  checkGameWinCondition,

  // Utilities
  getPhaseDuration,
  getTimeRemaining,
  formatTimeRemaining,
  checkAllPlayersActed,
};
