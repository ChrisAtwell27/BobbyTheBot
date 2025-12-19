const gameState = require("../game/dailyGameState");
const {
  processNightActions: processSharedNightActions,
} = require("../../mafia/game/mafiaActions");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require("discord.js");

/**
 * Daily Mafia Action Handler
 * Handles DM-based night action submission and processing
 */

/**
 * Send night action prompts to players via DM
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @returns {Promise<void>}
 */
async function sendNightActionPrompts(client, gameId) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game) return;

    const alivePlayers = await gameState.getAlivePlayers(gameId);

    for (const player of alivePlayers) {
      const role = gameState.getRoleDefinition(player.role);

      if (!role || !role.nightAction) continue;

      try {
        const user = await client.users.fetch(player.playerId);
        if (!user) continue;

        const targets = alivePlayers.filter(
          (p) => p.playerId !== player.playerId
        );
        const embed = buildActionEmbed(player, role, targets, game);
        const components = buildActionComponents(
          game.gameId,
          player,
          role,
          targets
        );

        await user.send({ embeds: [embed], components });

        console.log(
          `[Daily Mafia ${gameId}] Sent night action prompt to ${player.displayName}`
        );
      } catch (error) {
        console.error(
          `Error sending night action prompt to ${player.displayName}:`,
          error
        );
      }
    }
  } catch (error) {
    console.error("Error sending night action prompts:", error);
  }
}

/**
 * Build action embed for a player
 * @returns {EmbedBuilder} Configured embed
 */
function buildActionEmbed(player, role, targets, game) {
  let color = "#808080"; // Default gray
  if (role.team === "bee")
    color = "#FFD700"; // Gold
  else if (role.team === "wasp")
    color = "#8B0000"; // Dark Red
  else if (role.team === "neutral") color = "#9B59B6"; // Purple

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🌙 Night ${game.nightNumber} - ${role.name} ${role.emoji}`)
    .setDescription(
      `**Goal:** ${role.description || "Survive and win."}\n**Action:** ${role.actionType}`
    );

  // Resource status fields
  const fields = [];
  if (player.bulletsRemaining !== undefined)
    fields.push({
      name: "Bullets",
      value: `${player.bulletsRemaining}`,
      inline: true,
    });
  if (player.vestsRemaining !== undefined)
    fields.push({
      name: "Vests",
      value: `${player.vestsRemaining}`,
      inline: true,
    });
  if (player.alertsRemaining !== undefined)
    fields.push({
      name: "Alerts",
      value: `${player.alertsRemaining}`,
      inline: true,
    });

  if (fields.length > 0) embed.addFields(fields);

  let footerText = "Select your target or action below.";

  // Specific instructions based on role
  if (role.actionType === "mafia_kill")
    footerText = "Coordinate with your team!";
  if (role.actionType === "heal") footerText = "Choose wisely who to save.";
  if (role.actionType === "investigate_suspicious")
    footerText = "Find the Wasps!";

  embed.setFooter({ text: footerText });

  return embed;
}

/**
 * Build interactive components for action prompt
 */
function buildActionComponents(gameId, player, role, targets) {
  const components = [];

  // 1. Target Selection (Select Menu) - if targets exist
  if (targets.length > 0) {
    const options = targets.slice(0, 25).map((target, index) => ({
      label: target.displayName,
      value: target.playerId,
      description: `Target #${index + 1}`,
      emoji: "🎯",
    }));

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`dailymafia_action_target_${gameId}`)
      .setPlaceholder("Select a target...")
      .addOptions(options);

    components.push(new ActionRowBuilder().addComponents(selectMenu));
  }

  // 2. Action Buttons (Skip, Alert, Vest, etc.)
  const buttons = [];

  // Always add Skip
  buttons.push(
    new ButtonBuilder()
      .setCustomId(`dailymafia_action_keyword_${gameId}_skip`)
      .setLabel("Skip Action")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⏭️")
  );

  // Special role buttons
  if (role.actionType === "alert") {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`dailymafia_action_keyword_${gameId}_alert`)
        .setLabel(`Alert (${player.alertsRemaining})`)
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🚨")
        .setDisabled(player.alertsRemaining <= 0)
    );
  }

  if (role.actionType === "vest") {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`dailymafia_action_keyword_${gameId}_vest`)
        .setLabel(`Vest (${player.vestsRemaining})`)
        .setStyle(ButtonStyle.Success)
        .setEmoji("🛡️")
        .setDisabled(player.vestsRemaining <= 0)
    );
  }

  if (role.actionType === "ignite") {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`dailymafia_action_keyword_${gameId}_ignite`)
        .setLabel("Ignite All")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔥")
    );
  }

  // Add buttons row
  if (buttons.length > 0) {
    components.push(new ActionRowBuilder().addComponents(buttons));
  }

  return components;
}

/**
 * Handle action submission via DM
 * @param {Object} client - Discord client
 * @param {Object} message - Discord message
 * @returns {Promise<void>}
 */
async function handleActionSubmission(client, message) {
  try {
    // Get player's active game
    const game = await gameState.getPlayerActiveGame(message.author.id);

    if (!game) {
      return; // Not in an active game
    }

    if (game.phase !== "night") {
      await message.reply(
        "❌ It is not currently night phase. You cannot submit actions right now."
      );
      return;
    }

    const player = await gameState.getPlayer(game.gameId, message.author.id);
    if (!player) return;

    if (!player.alive) {
      await message.reply("❌ You are dead and cannot perform actions.");
      return;
    }

    const role = gameState.getRoleDefinition(player.role);
    if (!role || !role.nightAction) {
      await message.reply("❌ Your role does not have a night action.");
      return;
    }

    // Parse action
    const action = parseActionInput(message.content, game, player, role);

    if (!action) {
      await message.reply(
        "❌ Invalid action. Please use a number, `skip`, or a valid keyword."
      );
      return;
    }

    // Save action to database
    await gameState.upsertAction({
      gameId: game.gameId,
      nightNumber: game.nightNumber,
      playerId: player.playerId,
      actionType: role.actionType,
      targetId: action.targetId,
      keyword: action.keyword,
    });

    // Mark player as acted
    await gameState.updatePlayer(game.gameId, player.playerId, {
      hasActedThisPhase: true,
      lastActionTime: Date.now(),
      isInactive: false, // Clear inactive flag
    });

    // Send confirmation
    let confirmation = `✅ Action submitted for Night ${game.nightNumber}!\n\n`;
    if (action.keyword) {
      confirmation += `**Action:** ${action.keyword}\n`;
    } else if (action.targetId) {
      const target = await gameState.getPlayer(game.gameId, action.targetId);
      confirmation += `**Target:** ${target ? target.displayName : "Unknown"}\n`;
    }
    confirmation += `\nYou can change your action by sending a new message.`;

    await message.reply(confirmation);

    // Check if all players have acted (early phase end)
    const { checkEarlyPhaseEnd } = require("./dailyGameLoop");
    await checkEarlyPhaseEnd(client, game.gameId);

    // Update status display
    const { updateStatusMessage } = require("../ui/dailyEmbeds");
    await updateStatusMessage(client, game.gameId);
  } catch (error) {
    console.error("Error handling action submission:", error);
    await message.reply(
      "❌ An error occurred while processing your action. Please try again."
    );
  }
}

/**
 * Handle interactive action submission (Buttons/Select Menus)
 * @param {Object} client - Discord client
 * @param {Object} interaction - Interaction object
 */
async function handleActionInteraction(client, interaction) {
  try {
    const parts = interaction.customId.split("_");
    const type = parts[2]; // 'target' or 'keyword'
    // gameId is at index 3 for 'target' and 'keyword'
    const gameId = parts[3];

    await interaction.deferReply({ ephemeral: true });

    // Get player's active game
    const game = await gameState.getGame(gameId);
    if (!game) {
      await interaction.editReply("❌ Game not found.");
      return;
    }

    if (game.phase !== "night") {
      await interaction.editReply("❌ It is not currently night phase.");
      return;
    }

    const player = await gameState.getPlayer(game.gameId, interaction.user.id);
    if (!player || !player.alive) {
      await interaction.editReply("❌ You cannot perform actions.");
      return;
    }

    const role = gameState.getRoleDefinition(player.role);

    let targetId = null;
    let keyword = null;

    if (type === "target") {
      targetId = interaction.values[0];
    } else if (type === "keyword") {
      keyword = parts[4]; // 'skip', 'alert', etc.
    }

    // Save action
    await gameState.upsertAction({
      gameId: game.gameId,
      nightNumber: game.nightNumber,
      playerId: player.playerId,
      actionType: role.actionType,
      targetId: targetId,
      keyword: keyword,
    });

    // Mark updated
    await gameState.updatePlayer(game.gameId, player.playerId, {
      hasActedThisPhase: true,
      lastActionTime: Date.now(),
      isInactive: false,
    });

    let confirmation = `✅ Action saved: `;
    if (keyword) confirmation += `**${keyword.toUpperCase()}**`;
    else {
      const target = await gameState.getPlayer(gameId, targetId);
      confirmation += `Targeting **${target ? target.displayName : "Unknown"}**`;
    }

    await interaction.editReply(confirmation);

    // Check early end
    const { checkEarlyPhaseEnd } = require("./dailyGameLoop");
    await checkEarlyPhaseEnd(client, game.gameId);

    // Update public status
    const { updateStatusMessage } = require("../ui/dailyEmbeds");
    await updateStatusMessage(client, game.gameId);
  } catch (error) {
    console.error("Error handling action interaction:", error);
    if (!interaction.replied) {
      await interaction.reply({
        content: "❌ Error processing action.",
        ephemeral: true,
      });
    }
  }
}

/**
 * Parse action input from message
 * @param {string} input - User input
 * @param {Object} game - Game object
 * @param {Object} player - Player object
 * @param {Object} role - Role definition
 * @returns {Object|null} Parsed action or null
 */
function parseActionInput(input, game, player, role) {
  const trimmed = input.trim().toLowerCase();

  // Check for keywords
  const keywords = ["skip", "alert", "vest", "ignite"];
  if (keywords.includes(trimmed)) {
    return { keyword: trimmed, targetId: null };
  }

  // Check for number (target selection)
  const num = parseInt(trimmed);
  if (isNaN(num) || num < 1) {
    return null;
  }

  // Validate number is within range (would need to get alive players)
  // For now, just return the target index
  // This will be validated during processing

  return { keyword: null, targetId: String(num) };
}

/**
 * Process night actions
 * Converts Daily Mafia format to shared mafiaActions.js format and processes
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @returns {Promise<void>}
 */
async function processNightActions(client, gameId) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game) return;

    console.log(
      `[Daily Mafia ${gameId}] Processing night ${game.nightNumber} actions`
    );

    const players = await gameState.getPlayers(gameId);
    const actions = await gameState.getActionsForNight(
      gameId,
      game.nightNumber
    );
    const alivePlayers = players.filter((p) => p.alive);

    // Build player lookup for target resolution
    const playerMap = {};
    alivePlayers.forEach((p, index) => {
      playerMap[String(index + 1)] = p.playerId;
    });

    // Convert actions to shared format
    const nightActions = {};

    for (const action of actions) {
      let targetId = action.targetId;

      // Resolve numeric target to player ID
      if (action.targetId && playerMap[action.targetId]) {
        targetId = playerMap[action.targetId];
      }

      nightActions[action.playerId] = {
        action: action.actionType,
        target: targetId,
        keyword: action.keyword,
      };
    }

    // Convert game state to shared format
    const sharedGameState = {
      id: game.gameId,
      players: players.map((p) => ({
        userId: p.playerId,
        role: p.role,
        alive: p.alive,
        bulletsRemaining: p.bulletsRemaining,
        vestsRemaining: p.vestsRemaining,
        alertsRemaining: p.alertsRemaining,
      })),
      nightActions,
      nightNumber: game.nightNumber,
      framedPlayers: new Set(game.framedPlayers || []),
      dousedPlayers: new Set(game.dousedPlayers || []),
      // ... other game state
    };

    // Process using shared logic
    const results = await processSharedNightActions(sharedGameState);

    // Apply results back to database
    await applyNightResults(client, gameId, results);

    // Mark actions as processed
    await gameState.markActionsProcessed(gameId, game.nightNumber);

    console.log(`[Daily Mafia ${gameId}] Night actions processed`);
  } catch (error) {
    console.error("Error processing night actions:", error);
  }
}

/**
 * Apply night action results to database
 * @param {Object} client - Discord client
 * @param {string} gameId - Game ID
 * @param {Object} results - Action results from shared processor
 * @returns {Promise<void>}
 */
async function applyNightResults(client, gameId, results) {
  try {
    const game = await gameState.getGame(gameId);
    if (!game) return;

    const channel = await client.channels.fetch(game.channelId);

    // Process deaths
    if (results.deaths && results.deaths.length > 0) {
      for (const death of results.deaths) {
        await gameState.updatePlayer(gameId, death.playerId, {
          alive: false,
          deathReason: death.reason,
          deathPhase: "night",
          deathNight: game.nightNumber,
        });

        await gameState.createEvent({
          gameId,
          phase: "night",
          phaseNumber: game.nightNumber,
          eventType: "death",
          description: `${death.playerName} died (${death.reason})`,
          data: { playerId: death.playerId, reason: death.reason },
        });

        // Announce death
        if (channel) {
          await channel.send(
            `☠️ **[Game ${gameId}]** ${death.playerName} was killed during the night!`
          );
        }
      }
    }

    // Update special tracking arrays
    if (results.framedPlayers) {
      await gameState.updateGame(gameId, {
        framedPlayers: Array.from(results.framedPlayers),
      });
    }

    if (results.dousedPlayers) {
      await gameState.updateGame(gameId, {
        dousedPlayers: Array.from(results.dousedPlayers),
      });
    }

    // Process resource consumption (bullets, vests, alerts used)
    // This would be handled by the shared processor and reflected in results
  } catch (error) {
    console.error("Error applying night results:", error);
  }
}

module.exports = {
  sendNightActionPrompts,
  handleActionSubmission,
  processNightActions,
  handleActionInteraction,
};
