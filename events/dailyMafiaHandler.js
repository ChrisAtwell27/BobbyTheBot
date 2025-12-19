const gameState = require("../dailyMafia/game/dailyGameState");
const { startGame, cancelGame } = require("../dailyMafia/core/dailyGameLoop");
const {
  sendNightActionPrompts,
  handleActionSubmission,
} = require("../dailyMafia/core/dailyActionHandler");
const {
  handleVoteCommand,
  handleUnvoteCommand,
  handleVotesCommand,
  handleVoteButton,
} = require("../dailyMafia/core/dailyVotingHandler");
const {
  buildSetupEmbed,
  createStatusMessage,
  updateStatusMessage,
} = require("../dailyMafia/ui/dailyEmbeds");
const {
  buildStartGameButtons,
  buildJoinGameButton,
} = require("../dailyMafia/ui/dailyButtons");
const { getSetting, getServerTier } = require("../utils/settingsManager");

/**
 * Daily Mafia Command Handler
 * Handles all commands, buttons, and DM interactions for Daily Mafia
 */

const PREFIX = "!dailymafia";
const ALIAS = "!dm";

/**
 * Handle message command
 * @param {Object} client - Discord client
 * @param {Object} message - Discord message
 * @returns {Promise<void>}
 */
async function handleMessage(client, message) {
  try {
    // Ignore bots
    if (message.author.bot) return;

    // Check for DM (night action submission)
    if (message.channel.type === "DM") {
      await handleActionSubmission(client, message);
      return;
    }

    // Check for command prefix
    const content = message.content.trim();

    if (!content.startsWith(PREFIX) && !content.startsWith(ALIAS)) {
      return;
    }

    // Parse command
    const args = content
      .slice(content.startsWith(PREFIX) ? PREFIX.length : ALIAS.length)
      .trim()
      .split(/\s+/);
    const command = args.shift().toLowerCase();

    // Route commands
    switch (command) {
      case "start":
        await handleStartCommand(client, message, args);
        break;

      case "join":
        await handleJoinCommand(client, message);
        break;

      case "leave":
        await handleLeaveCommand(client, message);
        break;

      case "cancel":
        await handleCancelCommand(client, message);
        break;

      case "vote":
        await handleVoteCommand(client, message, args);
        break;

      case "unvote":
        await handleUnvoteCommand(client, message);
        break;

      case "votes":
        await handleVotesCommand(client, message);
        break;

      case "status":
        await handleStatusCommand(client, message);
        break;

      case "help":
        await handleHelpCommand(client, message);
        break;

      case "restartphase":
        await handleRestartPhaseCommand(client, message, args);
        break;

      default:
        await message.reply(
          `❌ Unknown command. Use \`${PREFIX} help\` for a list of commands.`
        );
    }
  } catch (error) {
    console.error("Error handling daily mafia message:", error);
  }
}

/**
 * Handle start command - create new game
 * @param {Object} client - Discord client
 * @param {Object} message - Discord message
 * @param {Array} args - Command arguments
 * @returns {Promise<void>}
 */
async function handleStartCommand(client, message, args) {
  try {
    // Check tier - Daily Mafia requires Plus tier or higher
    const tier = (await getServerTier(message.guildId)) || "free";

    if (tier === "free") {
      await message.reply(
        "❌ **Daily Mafia requires Plus tier or higher!**\n\n" +
          "This feature allows games to span multiple days with persistent storage.\n" +
          "Upgrade your server at: <https://flow-nexus.ruv.io>\n\n" +
          "Use `!subscription` for more info."
      );
      return;
    }

    // Check if Daily Mafia channel is configured
    const configuredChannelId = await getSetting(
      message.guildId,
      "channels.dailymafia"
    );

    if (configuredChannelId && configuredChannelId !== message.channelId) {
      await message.reply(
        `❌ **Daily Mafia games can only be started in <#${configuredChannelId}>**\n\n` +
          `Your server admin has configured a specific channel for Daily Mafia games.\n` +
          `To change this, use the settings dashboard: <https://crackedgames.co/bobby-the-bot/>`
      );
      return;
    }

    // Check if there's already an active game in this channel
    const activeGames = await gameState.getActiveGames(message.guildId);
    const existingGame = activeGames.find(
      (g) => g.channelId === message.channelId
    );

    if (existingGame) {
      await message.reply(
        "❌ There is already an active Daily Mafia game in this channel."
      );
      return;
    }

    // Parse options
    const debugMode = args.includes("debug");
    const revealRoles = !args.includes("noreveal");

    // Create game
    const gameId = await gameState.createGame({
      guildId: message.guildId,
      channelId: message.channelId,
      organizerId: message.author.id,
      debugMode,
      revealRoles,
      tier,
    });

    // Add organizer as first player
    await gameState.addPlayer({
      gameId,
      playerId: message.author.id,
      displayName: message.author.displayName || message.author.username,
      role: "pending", // Will be assigned when game starts
    });

    // Create setup embed
    const players = await gameState.getPlayers(gameId);
    const game = await gameState.getGame(gameId);
    const embed = buildSetupEmbed(gameId, players, game?.lobbyDeadline);

    // Combine join/leave buttons AND start/cancel buttons
    const joinButtons = buildJoinGameButton(gameId);
    const startButtons = buildStartGameButtons(gameId);
    const allButtons = [...joinButtons, ...startButtons];

    const setupMessage = await message.channel.send({
      content: `🐝 **Daily Mafia Game Created!**\n\nOrganizer: ${message.author}\n\nPlayers can join using the buttons below. **Organizer:** Click "Start Game" when ready (need 8+ players).`,
      embeds: [embed],
      components: allButtons,
    });

    // Update game with setup message ID (for later updates)
    await gameState.updateGame(gameId, {
      statusMessageId: setupMessage.id,
    });

    console.log(
      `[Daily Mafia] ✅ Game ${gameId} created successfully by ${message.author.username}`
    );
  } catch (error) {
    console.error("[Daily Mafia] ❌ Error handling start command:", error);
    console.error("[Daily Mafia] Error stack:", error.stack);
    await message.reply(
      "❌ An error occurred while creating the game. Check bot logs for details."
    );
  }
}

/**
 * Handle join command
 * @param {Object} client - Discord client
 * @param {Object} message - Discord message
 * @returns {Promise<void>}
 */
async function handleJoinCommand(client, message) {
  try {
    // Find pending game in channel
    const games = await gameState.getActiveGames(message.guildId);
    const game = games.find(
      (g) => g.channelId === message.channelId && g.status === "pending"
    );

    if (!game) {
      await message.reply(
        "❌ No pending Daily Mafia game in this channel. Use `!dailymafia start` to create one."
      );
      return;
    }

    // Check if player already in game
    const existingPlayer = await gameState.getPlayer(
      game.gameId,
      message.author.id
    );
    if (existingPlayer) {
      await message.reply("✅ You are already in this game.");
      return;
    }

    // Check if player is in another active game
    const playerActiveGame = await gameState.getPlayerActiveGame(
      message.author.id
    );
    if (playerActiveGame) {
      await message.reply("❌ You are already in another Daily Mafia game.");
      return;
    }

    // Add player
    await gameState.addPlayer({
      gameId: game.gameId,
      playerId: message.author.id,
      displayName: message.author.displayName || message.author.username,
      role: "pending",
    });

    await message.reply(
      `✅ You have joined the game! (Game #${game.gameId.substring(6, 12)})`
    );

    // Update setup message with both join AND start buttons
    const players = await gameState.getPlayers(game.gameId);
    const embed = buildSetupEmbed(game.gameId, players, game.lobbyDeadline);

    try {
      const setupMessage = await message.channel.messages.fetch(
        game.statusMessageId
      );
      const joinButtons = buildJoinGameButton(game.gameId);
      const startButtons = buildStartGameButtons(game.gameId);
      const allButtons = [...joinButtons, ...startButtons];
      await setupMessage.edit({ embeds: [embed], components: allButtons });
    } catch (error) {
      console.error("Could not update setup message:", error);
    }
  } catch (error) {
    console.error("Error handling join command:", error);
    await message.reply("❌ An error occurred while joining the game.");
  }
}

/**
 * Handle leave command
 * @param {Object} client - Discord client
 * @param {Object} message - Discord message
 * @returns {Promise<void>}
 */
async function handleLeaveCommand(client, message) {
  try {
    const games = await gameState.getActiveGames(message.guildId);
    const game = games.find(
      (g) => g.channelId === message.channelId && g.status === "pending"
    );

    if (!game) {
      await message.reply("❌ No pending game to leave.");
      return;
    }

    const player = await gameState.getPlayer(game.gameId, message.author.id);
    if (!player) {
      await message.reply("❌ You are not in this game.");
      return;
    }

    // Note: Actual player removal would require a new database operation
    // For now, inform that they need to wait for game start or cancellation
    await message.reply(
      "❌ Cannot leave game after joining. Ask the organizer to cancel the game."
    );
  } catch (error) {
    console.error("Error handling leave command:", error);
    await message.reply("❌ An error occurred.");
  }
}

/**
 * Handle cancel command
 * @param {Object} client - Discord client
 * @param {Object} message - Discord message
 * @returns {Promise<void>}
 */
async function handleCancelCommand(client, message) {
  try {
    const games = await gameState.getActiveGames(message.guildId);
    const game = games.find((g) => g.channelId === message.channelId);

    if (!game) {
      await message.reply("❌ No active game in this channel.");
      return;
    }

    // Only organizer can cancel
    if (game.organizerId !== message.author.id) {
      await message.reply("❌ Only the game organizer can cancel the game.");
      return;
    }

    await cancelGame(client, game.gameId);
    await message.reply("✅ Game has been cancelled.");
  } catch (error) {
    console.error("Error handling cancel command:", error);
    await message.reply("❌ An error occurred while cancelling the game.");
  }
}

/**
 * Handle status command
 * @param {Object} client - Discord client
 * @param {Object} message - Discord message
 * @returns {Promise<void>}
 */
async function handleStatusCommand(client, message) {
  try {
    const games = await gameState.getActiveGames(message.guildId);
    const game = games.find((g) => g.channelId === message.channelId);

    if (!game) {
      await message.reply("❌ No active Daily Mafia game in this channel.");
      return;
    }

    // Trigger status update
    await updateStatusMessage(client, game.gameId);
    await message.reply("✅ Status updated!");
  } catch (error) {
    console.error("Error handling status command:", error);
    await message.reply("❌ An error occurred.");
  }
}

/**
 * Handle help command
 * @param {Object} client - Discord client
 * @param {Object} message - Discord message
 * @returns {Promise<void>}
 */
async function handleHelpCommand(client, message) {
  // Check if a specific channel is configured
  const configuredChannelId = await getSetting(
    message.guildId,
    "channels.dailymafia"
  );
  const channelInfo = configuredChannelId
    ? `\n**Configured Channel:** <#${configuredChannelId}>`
    : "\n**Channel:** Can be started in any channel (or configure in settings)";

  const helpText = `
🐝 **Daily Mafia Commands** ⭐ Plus Tier Feature

**About Daily Mafia:**
Asynchronous Mafia games that span real days/weeks!
• 24-hour phases (or until everyone acts)
• Persistent storage - survives bot restarts
• Public voting in channel
• Same roles as regular Mafia
• Winners get 10,000 ${await require("../utils/currencyHelper").getCurrencyName(message.guildId)}!${channelInfo}

**Game Management:**
\`${PREFIX} start [debug]\` - Create a new game
\`${PREFIX} join\` - Join pending game
\`${PREFIX} cancel\` - Cancel game (organizer only)

**Gameplay:**
\`${PREFIX} vote @player\` - Cast your vote
\`${PREFIX} vote skip\` - Vote to skip
\`${PREFIX} unvote\` - Remove your vote
\`${PREFIX} votes\` - Show vote tally

**Info:**
\`${PREFIX} status\` - Refresh game status
\`${PREFIX} help\` - Show this help

**Night Actions:**
Send DMs to the bot with your action during night phase.

**Settings:**
Use \`!settings\` to configure the Daily Mafia channel for your server.

**Aliases:**
You can use \`${ALIAS}\` instead of \`${PREFIX}\`
`;

  await message.reply(helpText);
}

/**
 * Handle restart phase command (debug/recovery tool)
 * @param {Object} client - Discord client
 * @param {Object} message - Discord message
 * @param {Array} args - Command arguments
 * @returns {Promise<void>}
 */
async function handleRestartPhaseCommand(client, message, args) {
  try {
    const games = await gameState.getActiveGames(message.guildId);
    const game = games.find((g) => g.channelId === message.channelId);

    if (!game) {
      await message.reply("❌ No active Daily Mafia game in this channel.");
      return;
    }

    // Only organizer can restart phase
    if (
      game.organizerId !== message.author.id &&
      !message.member.permissions.has("ADMINISTRATOR")
    ) {
      await message.reply(
        "❌ Only the organizer or admin can restart the phase."
      );
      return;
    }

    const {
      sendPhaseNotifications,
    } = require("../dailyMafia/core/dailyGameLoop");

    // 1. Send public phase notification
    await sendPhaseNotifications(client, game.gameId, game.phase);

    // 2. If Night phase, resend prompts
    if (game.phase === "night") {
      await sendNightActionPrompts(client, game.gameId);

      // Resend Role DMs if requested (useful if start crashed)
      if (args.includes("roles") || game.nightNumber === 1) {
        await sendRoleDMs(client, game.gameId);
        await message.reply(
          "✅ Phase restarted: Notifications, Action Prompts, and Role DMs sent."
        );
      } else {
        await message.reply(
          "✅ Phase restarted: Notifications and Action Prompts sent. (Use `!dm restartphase roles` to resend role DMs)"
        );
      }
    } else {
      await message.reply("✅ Phase restarted: Notification sent.");
    }
  } catch (error) {
    console.error("Error restarting phase:", error);
    await message.reply("❌ An error occurred while restarting the phase.");
  }
}

/**
 * Handle button interaction
 * @param {Object} client - Discord client
 * @param {Object} interaction - Button interaction
 * @returns {Promise<void>}
 */
async function handleButtonInteraction(client, interaction) {
  try {
    if (!interaction.customId.startsWith("dailymafia_")) {
      return;
    }

    const [, action, gameId, param] = interaction.customId.split("_");

    switch (action) {
      case "vote":
        await handleVoteButton(client, interaction);
        break;

      case "join":
        await handleJoinButton(client, interaction, gameId);
        break;

      case "leave":
        await handleLeaveButton(client, interaction, gameId);
        break;

      case "start":
        await handleStartButton(client, interaction, gameId);
        break;

      case "cancel":
        await handleCancelButton(client, interaction, gameId);
        break;

      case "refresh":
        await handleRefreshButton(client, interaction, gameId);
        break;
    }
  } catch (error) {
    console.error("Error handling button interaction:", error);
  }
}

/**
 * Handle join button
 */
async function handleJoinButton(client, interaction, gameId) {
  const game = await gameState.getGame(gameId);
  if (!game || game.status !== "pending") {
    await interaction.reply({
      content: "❌ This game is no longer accepting players.",
      ephemeral: true,
    });
    return;
  }

  const existingPlayer = await gameState.getPlayer(gameId, interaction.user.id);
  if (existingPlayer) {
    await interaction.reply({
      content: "✅ You are already in this game.",
      ephemeral: true,
    });
    return;
  }

  await gameState.addPlayer({
    gameId,
    playerId: interaction.user.id,
    displayName: interaction.user.displayName || interaction.user.username,
    role: "pending",
  });

  await interaction.reply({
    content: "✅ You have joined the game!",
    ephemeral: true,
  });

  // Update setup message with both join AND start buttons
  const players = await gameState.getPlayers(gameId);
  const embed = buildSetupEmbed(gameId, players, game?.lobbyDeadline);
  const joinButtons = buildJoinGameButton(gameId);
  const startButtons = buildStartGameButtons(gameId);
  const allButtons = [...joinButtons, ...startButtons];
  await interaction.message.edit({ embeds: [embed], components: allButtons });
}

/**
 * Handle leave button
 */
async function handleLeaveButton(client, interaction, gameId) {
  await interaction.reply({
    content:
      "❌ Cannot leave after joining. Ask the organizer to cancel the game.",
    ephemeral: true,
  });
}

/**
 * Handle start button (begin game)
 */
async function handleStartButton(client, interaction, gameId) {
  const game = await gameState.getGame(gameId);
  if (!game) {
    await interaction.reply({ content: "❌ Game not found.", ephemeral: true });
    return;
  }

  if (game.organizerId !== interaction.user.id) {
    await interaction.reply({
      content: "❌ Only the organizer can start the game.",
      ephemeral: true,
    });
    return;
  }

  const players = await gameState.getPlayers(gameId);
  if (players.length < 8) {
    await interaction.reply({
      content: `❌ Need at least 8 players to start (currently ${players.length}).`,
      ephemeral: true,
    });
    return;
  }

  // Assign roles (using shared mafiaUtils)
  const {
    getRoleDistribution,
    shuffleArray,
  } = require("../mafia/game/mafiaUtils");
  const { ROLES } = require("../mafia/roles/mafiaRoles");

  // Get role distribution (returns role KEYS like 'QUEEN_BEE', 'KILLER_WASP')
  const roleKeys = getRoleDistribution(players.length, false, false, game.tier);
  const shuffledRoleKeys = shuffleArray(roleKeys);

  // Update players with roles (convert keys to names for storage)
  for (let i = 0; i < players.length; i++) {
    const roleKey = shuffledRoleKeys[i];
    // Store role KEY (e.g. 'QUEEN_BEE') not name, for compatibility with utility functions

    await gameState.updatePlayer(gameId, players[i].playerId, {
      role: roleKey,
    });
  }

  // Create status message
  const statusMessageId = await createStatusMessage(client, gameId);
  if (statusMessageId) {
    await gameState.updateGame(gameId, { statusMessageId });
  }

  // Start game
  await startGame(client, gameId);

  // Send role DMs
  await sendRoleDMs(client, gameId);

  // Send night action prompts
  await sendNightActionPrompts(client, gameId);

  await interaction.reply({ content: "✅ Game started!", ephemeral: true });
}

/**
 * Send role DMs to all players
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
      dm += `**Abilities:**\n${role.abilities.join("\n")}\n\n`;
      dm += `**Win Condition:** ${role.winCondition}`;

      await user.send(dm);
    } catch (error) {
      console.error(`Could not send role DM to ${player.displayName}:`, error);
    }
  }
}

/**
 * Handle cancel button
 */
async function handleCancelButton(client, interaction, gameId) {
  const game = await gameState.getGame(gameId);
  if (!game) return;

  if (game.organizerId !== interaction.user.id) {
    await interaction.reply({
      content: "❌ Only the organizer can cancel.",
      ephemeral: true,
    });
    return;
  }

  await cancelGame(client, gameId);
  await interaction.reply({ content: "✅ Game cancelled.", ephemeral: true });
}

/**
 * Handle refresh button
 */
async function handleRefreshButton(client, interaction, gameId) {
  await updateStatusMessage(client, gameId);
  await interaction.reply({ content: "✅ Status refreshed!", ephemeral: true });
}

/**
 * Update existing pending game messages to include Start/Cancel buttons
 * Run on bot startup to fix any games created before button update
 */
async function updateExistingPendingGames(client) {
  try {
    console.log("[Daily Mafia] Checking for pending games to update...");

    // Get all games across all guilds
    const allGames = await gameState.getAllActiveGames();
    const pendingGames = allGames.filter((g) => g.status === "pending");

    if (pendingGames.length === 0) {
      console.log("[Daily Mafia] No pending games found to update");
      return;
    }

    console.log(
      `[Daily Mafia] Found ${pendingGames.length} pending game(s) - updating setup messages...`
    );

    for (const game of pendingGames) {
      try {
        const channel = await client.channels.fetch(game.channelId);
        if (!channel) continue;

        const setupMessage = await channel.messages.fetch(game.statusMessageId);
        if (!setupMessage) continue;

        // Get current players and rebuild embed
        const players = await gameState.getPlayers(game.gameId);
        const embed = buildSetupEmbed(game.gameId, players, game.lobbyDeadline);

        // Add both join AND start buttons
        const joinButtons = buildJoinGameButton(game.gameId);
        const startButtons = buildStartGameButtons(game.gameId);
        const allButtons = [...joinButtons, ...startButtons];

        await setupMessage.edit({ embeds: [embed], components: allButtons });
        console.log(
          `[Daily Mafia] ✅ Updated setup message for game ${game.gameId}`
        );
      } catch (error) {
        console.error(
          `[Daily Mafia] Failed to update game ${game.gameId}:`,
          error.message
        );
      }
    }

    console.log("[Daily Mafia] ✅ Finished updating pending games");
  } catch (error) {
    console.error(
      "[Daily Mafia] Error updating existing pending games:",
      error
    );
  }
}

// Export as initialization function (required by handlerRegistry wrapper)
module.exports = (client) => {
  console.log("[Daily Mafia Handler] Initializing handler...");

  // Register message handler
  client.on("messageCreate", (message) => handleMessage(client, message));

  // Register interaction handler
  client.on("interactionCreate", (interaction) => {
    if (interaction.isButton()) {
      handleButtonInteraction(client, interaction);
    }
  });

  // Update existing pending games on startup (after bot is ready)
  client.once("ready", () => {
    setTimeout(() => {
      updateExistingPendingGames(client);
    }, 5000); // Wait 5 seconds for bot to fully initialize
  });

  console.log(
    "[Daily Mafia Handler] ✅ Registered message and interaction handlers"
  );
};
