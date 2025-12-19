const gameState = require("../game/dailyGameState");

/**
 * Daily Mafia Voting Handler
 * Handles public voting in channel with buttons and commands
 */

/**
 * Process vote command
 * @param {Object} client - Discord client
 * @param {Object} message - Discord message
 * @param {Array} args - Command arguments
 * @returns {Promise<void>}
 */
async function handleVoteCommand(client, message, args) {
  try {
    // Get game for this channel
    const games = await gameState.getActiveGames(message.guildId);
    const game = games.find((g) => g.channelId === message.channelId);

    if (!game) {
      await message.reply("❌ No active Daily Mafia game in this channel.");
      return;
    }

    if (game.phase !== "voting") {
      await message.reply("❌ It is not currently voting phase.");
      return;
    }

    const player = await gameState.getPlayer(game.gameId, message.author.id);
    if (!player) {
      await message.reply("❌ You are not in this game.");
      return;
    }

    if (!player.alive) {
      await message.reply("❌ You are dead and cannot vote.");
      return;
    }

    // Parse target
    let targetId = null;

    if (args[0]?.toLowerCase() === "skip") {
      targetId = "skip";
    } else if (message.mentions.users.size > 0) {
      // Extract first mentioned user
      targetId = message.mentions.users.first().id;
    } else {
      // Try to match by name
      const targetName = args.join(" ");
      const alivePlayers = await gameState.getAlivePlayers(game.gameId);
      const target = alivePlayers.find((p) =>
        p.displayName.toLowerCase().includes(targetName.toLowerCase())
      );

      if (target) {
        targetId = target.playerId;
      }
    }

    if (!targetId) {
      await message.reply(
        "❌ Invalid target. Use `!vote @player` or `!vote skip`."
      );
      return;
    }

    // Validate target
    if (targetId !== "skip") {
      const target = await gameState.getPlayer(game.gameId, targetId);
      if (!target || !target.alive) {
        await message.reply("❌ That player is not alive or in this game.");
        return;
      }
    }

    // Submit vote
    await submitVote(client, game.gameId, message.author.id, targetId);

    // Confirmation message
    let confirmation = "✅ Vote submitted!\n";
    if (targetId === "skip") {
      confirmation += "You voted to **skip** elimination.";
    } else {
      const target = await gameState.getPlayer(game.gameId, targetId);
      confirmation += `You voted for **${target.displayName}**.`;
    }

    await message.reply(confirmation);
  } catch (error) {
    console.error("Error handling vote command:", error);
    await message.reply("❌ An error occurred while processing your vote.");
  }
}

/**
 * Handle unvote command
 * @param {Object} client - Discord client
 * @param {Object} message - Discord message
 * @returns {Promise<void>}
 */
async function handleUnvoteCommand(client, message) {
  try {
    const games = await gameState.getActiveGames(message.guildId);
    const game = games.find((g) => g.channelId === message.channelId);

    if (!game || game.phase !== "voting") {
      await message.reply("❌ Not in voting phase.");
      return;
    }

    const player = await gameState.getPlayer(game.gameId, message.author.id);
    if (!player || !player.alive) {
      await message.reply("❌ You cannot unvote.");
      return;
    }

    // Delete vote
    const success = await gameState.deleteVote(
      game.gameId,
      game.dayNumber,
      message.author.id
    );

    if (success) {
      // Mark as not acted
      await gameState.updatePlayer(game.gameId, message.author.id, {
        hasActedThisPhase: false,
      });

      await message.reply("✅ Vote removed.");

      // Update status display
      const { updateStatusMessage } = require("../ui/dailyEmbeds");
      await updateStatusMessage(client, game.gameId);
    } else {
      await message.reply("❌ You have not voted yet.");
    }
  } catch (error) {
    console.error("Error handling unvote command:", error);
    await message.reply("❌ An error occurred while removing your vote.");
  }
}

/**
 * Handle votes display command
 * @param {Object} client - Discord client
 * @param {Object} message - Discord message
 * @returns {Promise<void>}
 */
async function handleVotesCommand(client, message) {
  try {
    const games = await gameState.getActiveGames(message.guildId);
    const game = games.find((g) => g.channelId === message.channelId);

    if (!game || game.phase !== "voting") {
      await message.reply("❌ Not in voting phase.");
      return;
    }

    const voteDisplay = await buildVoteTally(game.gameId, game.dayNumber);
    await message.reply(voteDisplay);
  } catch (error) {
    console.error("Error handling votes command:", error);
    await message.reply("❌ An error occurred while fetching votes.");
  }
}

/**
 * Submit or update vote
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @param {string} voterId - Voter player ID
 * @param {string} targetId - Target player ID or "skip"
 * @returns {Promise<void>}
 */
async function submitVote(client, gameId, voterId, targetId) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game) return;

    // Upsert vote
    await gameState.upsertVote({
      gameId,
      dayNumber: game.dayNumber,
      voterId,
      targetId,
    });

    // Mark voter as acted
    await gameState.updatePlayer(gameId, voterId, {
      hasActedThisPhase: true,
      lastActionTime: Date.now(),
      isInactive: false, // Clear inactive flag
    });

    // Create vote event
    const voter = await gameState.getPlayer(gameId, voterId);
    const targetName =
      targetId === "skip"
        ? "skip"
        : (await gameState.getPlayer(gameId, targetId))?.displayName ||
          "Unknown";

    await gameState.createEvent({
      gameId,
      phase: "voting",
      phaseNumber: game.dayNumber,
      eventType: "vote",
      description: `${voter.displayName} voted for ${targetName}`,
      data: { voterId, targetId },
    });

    // Update status display
    const { updateStatusMessage } = require("../ui/dailyEmbeds");
    await updateStatusMessage(client, gameId);

    // Check if all players have voted (early phase end)
    const { checkEarlyPhaseEnd } = require("./dailyGameLoop");
    await checkEarlyPhaseEnd(client, gameId);
  } catch (error) {
    console.error("Error submitting vote:", error);
    throw error;
  }
}

/**
 * Handle button interaction for voting
 * @param {Object} client - Discord client
 * @param {Object} interaction - Button interaction
 * @returns {Promise<void>}
 */
async function handleVoteButton(client, interaction) {
  try {
    // Custom ID format: dailymafia_vote_{gameId}_{targetId}
    const [, , gameId, targetId] = interaction.customId.split("_");

    const game = await gameState.getGame(gameId);
    if (!game || game.phase !== "voting") {
      await interaction.reply({
        content: "❌ Voting is not currently active.",
        ephemeral: true,
      });
      return;
    }

    const player = await gameState.getPlayer(gameId, interaction.user.id);
    if (!player || !player.alive) {
      await interaction.reply({
        content: "❌ You cannot vote.",
        ephemeral: true,
      });
      return;
    }

    // Submit vote
    await submitVote(client, gameId, interaction.user.id, targetId);

    // Confirmation
    let confirmation = "✅ Vote submitted!\n";
    if (targetId === "skip") {
      confirmation += "You voted to **skip** elimination.";
    } else {
      const target = await gameState.getPlayer(gameId, targetId);
      confirmation += `You voted for **${target.displayName}**.`;
    }

    await interaction.reply({
      content: confirmation,
      ephemeral: true,
    });
  } catch (error) {
    console.error("Error handling vote button:", error);
    await interaction.reply({
      content: "❌ An error occurred while processing your vote.",
      ephemeral: true,
    });
  }
}

/**
 * Build vote tally display
 * @param {string} gameId - Game ID
 * @param {number} dayNumber - Day number
 * @returns {Promise<string>} Vote tally message
 */
async function buildVoteTally(gameId, dayNumber) {
  const votes = await gameState.getVotesForDay(gameId, dayNumber);
  const players = await gameState.getAlivePlayers(gameId);

  // Count votes for each target
  const voteCounts = {};
  const voterMap = {};

  for (const vote of votes) {
    if (!voteCounts[vote.targetId]) {
      voteCounts[vote.targetId] = [];
    }
    voteCounts[vote.targetId].push(vote.voterId);
    voterMap[vote.voterId] = vote.targetId;
  }

  // Build tally message
  let message = `🗳️ **Vote Tally - Day ${dayNumber}**\n\n`;

  // Show votes for each player
  for (const player of players) {
    const voteCount = voteCounts[player.playerId]?.length || 0;
    const voters = voteCounts[player.playerId] || [];

    message += `**${player.displayName}** - ${voteCount} vote${voteCount !== 1 ? "s" : ""}\n`;

    if (voters.length > 0) {
      const voterNames = await Promise.all(
        voters.map(async (voterId) => {
          const voter = await gameState.getPlayer(gameId, voterId);
          return voter?.displayName || "Unknown";
        })
      );
      message += `  └ ${voterNames.join(", ")}\n`;
    }
  }

  // Skip votes
  const skipVotes = voteCounts["skip"]?.length || 0;
  if (skipVotes > 0) {
    message += `\n**Skip** - ${skipVotes} vote${skipVotes !== 1 ? "s" : ""}\n`;
  }

  // Show who hasn't voted
  const notVoted = players.filter((p) => !voterMap[p.playerId]);
  if (notVoted.length > 0) {
    message += `\n**Haven't voted:** ${notVoted.map((p) => p.displayName).join(", ")}`;
  }

  return message;
}

/**
 * Tally votes and eliminate player (or skip)
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @returns {Promise<void>}
 */
async function tallyVotes(client, gameId) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game) return;

    console.log(
      `[Daily Mafia ${gameId}] Tallying votes for Day ${game.dayNumber}`
    );

    const votes = await gameState.getVotesForDay(gameId, game.dayNumber);

    // Count votes
    const voteCounts = {};
    for (const vote of votes) {
      voteCounts[vote.targetId] = (voteCounts[vote.targetId] || 0) + 1;
    }

    // Find most voted
    let mostVoted = null;
    let maxVotes = 0;
    let isTie = false;

    for (const [targetId, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        mostVoted = targetId;
        maxVotes = count;
        isTie = false;
      } else if (count === maxVotes) {
        isTie = true;
      }
    }

    const channel = await client.channels.fetch(game.channelId);

    // Handle result
    if (!mostVoted || isTie || mostVoted === "skip") {
      // No elimination
      const message =
        `🗳️ **[Game ${gameId}] Voting Results**\n\n` +
        (isTie ? "The vote was **tied**." : "The vote was to **skip**.") +
        "\n\nNo one will be eliminated today.";

      if (channel) {
        await channel.send(message);
      }

      await gameState.createEvent({
        gameId,
        phase: "voting",
        phaseNumber: game.dayNumber,
        eventType: "other",
        description: isTie ? "Vote tied - no elimination" : "Voted to skip",
      });
    } else {
      // Eliminate player
      const target = await gameState.getPlayer(gameId, mostVoted);

      if (target) {
        await gameState.updatePlayer(gameId, mostVoted, {
          alive: false,
          deathReason: "lynched",
          deathPhase: "voting",
          deathNight: game.dayNumber,
        });

        await gameState.createEvent({
          gameId,
          phase: "voting",
          phaseNumber: game.dayNumber,
          eventType: "death",
          description: `${target.displayName} was lynched (${gameState.getRoleDefinition(target.role)?.name || target.role})`,
          data: { playerId: mostVoted, reason: "lynched" },
        });

        let message = `🗳️ **[Game ${gameId}] Voting Results**\n\n`;
        message += `**${target.displayName}** was eliminated by vote! (${maxVotes} votes)\n`;

        if (game.revealRoles) {
          message += `\n**Role:** ${gameState.getRoleDefinition(target.role)?.name || target.role}`;
        }

        if (channel) {
          await channel.send(message);
        }

        console.log(
          `[Daily Mafia ${gameId}] ${target.displayName} was lynched`
        );
      }
    }
  } catch (error) {
    console.error("Error tallying votes:", error);
  }
}

module.exports = {
  handleVoteCommand,
  handleUnvoteCommand,
  handleVotesCommand,
  handleVoteButton,
  submitVote,
  tallyVotes,
  buildVoteTally,
};
