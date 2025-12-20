const {getTodaysPuzzle, getPuzzleNumber} = require('../craftle/utils/puzzleGenerator');
const gameState = require('../craftle/game/craftleGameState');
const {validateGuess, isSolved, createEmptyGrid, isGridComplete} = require('../craftle/game/craftleLogic');
const {awardPuzzleReward} = require('../craftle/game/craftleRewards');
const {getItemById, loadItems} = require('../craftle/utils/itemLoader');
const {
  createGameEmbedWithCanvas,
  createResultEmbedWithCanvas,
  createStatsEmbed,
  createLeaderboardEmbed,
  createHelpEmbed,
  generateShareText,
} = require('../craftle/ui/craftleEmbeds');
const {
  createGameUI,
  createItemPickerUI,
  createCompletedGameButtons,
  parseCustomId,
  parseCellPosition,
} = require('../craftle/ui/craftleButtons');

/**
 * Craftle Command Handler
 * All interactions are EPHEMERAL (only visible to the player)
 */

// Store active game sessions
// Each session: { puzzleId, currentGrid, category, page }
const activeSessions = new Map();

/**
 * Main command handler
 */
async function handleCraftleCommand(message, args) {
  const subcommand = args[0]?.toLowerCase();

  if (subcommand === 'stats') {
    return await handleStatsCommand(message);
  }

  if (subcommand === 'leaderboard' || subcommand === 'lb') {
    return await handleLeaderboardCommand(message, args[1]);
  }

  if (subcommand === 'help') {
    return await handleHelpCommand(message);
  }

  // Default: Play
  return await handlePlayCommand(message);
}

/**
 * Handle !craftle (play today's puzzle)
 * Sends an ephemeral-like message by using DM or thread
 */
async function handlePlayCommand(message) {
  const guildId = message.guild.id;
  const userId = message.author.id;

  try {
    const puzzle = await getTodaysPuzzle();
    if (!puzzle) {
      return message.reply('❌ Could not load today\'s puzzle. Please try again later.');
    }

    const progress = await gameState.getOrCreateUserProgress(guildId, userId, puzzle.puzzleId, puzzle.date);
    if (!progress) {
      return message.reply('❌ Error loading your progress. Please try again.');
    }

    // Check if already completed
    if (progress.solved || progress.attempts >= 6) {
      const { embed, files } = await createResultEmbedWithCanvas(puzzle, progress, 0);
      const buttons = createCompletedGameButtons();

      // Try to DM the result, fall back to reply
      try {
        await message.author.send({
          content: `You've already completed today's Craftle!`,
          embeds: [embed],
          files,
          components: [buttons],
        });
        return message.reply(`✅ You've already completed today's Craftle! Check your DMs for your result.`);
      } catch {
        return message.reply({
          content: `You've already completed today's Craftle!`,
          embeds: [embed],
          files,
          components: [buttons],
        });
      }
    }

    // Initialize session
    activeSessions.set(userId, {
      puzzleId: puzzle.puzzleId,
      currentGrid: createEmptyGrid(),
      category: 'all',
      page: 0,
    });

    // Create game UI
    const { embed, files } = await createGameEmbedWithCanvas(puzzle, progress, activeSessions.get(userId).currentGrid);
    const components = createGameUI(activeSessions.get(userId).currentGrid);

    // Try to DM the game (truly private)
    try {
      const dmMsg = await message.author.send({
        content: `🎮 **Craftle Puzzle #${getPuzzleNumber(puzzle.date)}** - Click a cell to place an item!`,
        embeds: [embed],
        files,
        components,
      });

      // Store DM message info for updates
      activeSessions.get(userId).dmChannelId = dmMsg.channel.id;
      activeSessions.get(userId).messageId = dmMsg.id;

      return message.reply(`✅ Craftle game sent to your DMs! Check your messages to play privately.`);
    } catch (dmError) {
      // DMs disabled, send in channel but note it's visible
      const gameMsg = await message.reply({
        content: `⚠️ I couldn't DM you, so here's your game (others can see but can't interact):`,
        embeds: [embed],
        files,
        components,
      });

      activeSessions.get(userId).messageId = gameMsg.id;
      activeSessions.get(userId).channelId = message.channel.id;
    }
  } catch (error) {
    console.error('[Craftle] Error in handlePlayCommand:', error);
    return message.reply('❌ An error occurred. Please try again.');
  }
}

/**
 * Handle !craftle stats
 */
async function handleStatsCommand(message) {
  const guildId = message.guild.id;
  const userId = message.author.id;

  try {
    const stats = await gameState.getOrInitializeUserStats(guildId, userId);
    if (!stats) {
      return message.reply('❌ Error loading your statistics.');
    }

    const embed = createStatsEmbed(stats, message.author);
    return message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('[Craftle] Error in handleStatsCommand:', error);
    return message.reply('❌ An error occurred while fetching your stats.');
  }
}

/**
 * Handle !craftle leaderboard
 */
async function handleLeaderboardCommand(message, type = 'daily') {
  const guildId = message.guild.id;
  const validTypes = ['daily', 'weekly', 'monthly', 'alltime'];

  if (!validTypes.includes(type)) {
    type = 'daily';
  }

  try {
    const topPlayers = await gameState.getTopPlayers(guildId, 10);
    const rankings = gameState.calculateLeaderboardScores(topPlayers);
    const embed = await createLeaderboardEmbed(message.guild.name, rankings, type, message.client);

    return message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('[Craftle] Error in handleLeaderboardCommand:', error);
    return message.reply('❌ An error occurred while fetching the leaderboard.');
  }
}

/**
 * Handle !craftle help
 */
async function handleHelpCommand(message) {
  const embed = createHelpEmbed();
  return message.reply({ embeds: [embed] });
}

/**
 * Handle button interactions
 */
async function handleButtonInteraction(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;

  // Get session
  const session = activeSessions.get(userId);

  // Cell click - open item picker
  if (customId.startsWith('craftle_cell:')) {
    if (!session) {
      return interaction.reply({ content: '❌ Session expired. Use !craftle to start a new game.', ephemeral: true });
    }

    const { row, col } = parseCellPosition(customId);

    // Show item picker for this cell
    const components = createItemPickerUI(row, col, session.category || 'all', session.page || 0);

    return interaction.update({
      content: `📦 **Select an item for cell [${row + 1},${col + 1}]:**`,
      components,
      embeds: [],
      files: [],
    });
  }

  // Category change in picker
  if (customId.startsWith('craftle_picker_cat:')) {
    if (!session) {
      return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
    }

    const parts = customId.split(':');
    const [cellRow, cellCol] = parts[1].split(',').map(Number);
    const category = parts[2];

    session.category = category;
    session.page = 0;

    const components = createItemPickerUI(cellRow, cellCol, category, 0);
    return interaction.update({ components });
  }

  // Page change in picker
  if (customId.startsWith('craftle_picker_page:')) {
    if (!session) {
      return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
    }

    const parts = customId.split(':');
    const [cellRow, cellCol] = parts[1].split(',').map(Number);
    const category = parts[2];
    const page = parseInt(parts[3]);

    session.page = page;

    const components = createItemPickerUI(cellRow, cellCol, category, page);
    return interaction.update({ components });
  }

  // Clear specific cell
  if (customId.startsWith('craftle_clear_cell:')) {
    if (!session) {
      return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
    }

    const parts = customId.split(':');
    const [cellRow, cellCol] = parts[1].split(',').map(Number);

    session.currentGrid[cellRow][cellCol] = null;

    // Go back to grid view
    return showGridView(interaction, session);
  }

  // Back to grid
  if (customId === 'craftle_back_to_grid') {
    if (!session) {
      return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
    }

    return showGridView(interaction, session);
  }

  // Clear all
  if (customId === 'craftle_clear') {
    if (!session) {
      return interaction.reply({ content: '❌ Session expired.', ephemeral: true });
    }

    session.currentGrid = createEmptyGrid();
    return showGridView(interaction, session);
  }

  // Submit guess
  if (customId === 'craftle_submit') {
    return handleSubmitGuess(interaction);
  }

  // Help
  if (customId === 'craftle_help') {
    const embed = createHelpEmbed();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Stats button
  if (customId === 'craftle_stats') {
    return handleStatsButton(interaction);
  }

  // Leaderboard button
  if (customId === 'craftle_leaderboard') {
    return handleLeaderboardButton(interaction);
  }

  // Share button
  if (customId === 'craftle_share') {
    return handleShareButton(interaction);
  }
}

/**
 * Handle select menu interactions (item selection)
 */
async function handleSelectMenuInteraction(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const session = activeSessions.get(userId);

  if (!session) {
    return interaction.reply({ content: '❌ Session expired. Use !craftle to start a new game.', ephemeral: true });
  }

  // Item picked for a cell
  if (customId.startsWith('craftle_pick_item:')) {
    const selectedItemId = interaction.values[0];

    if (selectedItemId === 'none') {
      return interaction.reply({ content: '⚠️ No items in this category.', ephemeral: true });
    }

    const parts = customId.split(':');
    const [cellRow, cellCol] = parts[1].split(',').map(Number);

    // Place item in cell
    session.currentGrid[cellRow][cellCol] = selectedItemId;

    // Show grid view
    return showGridView(interaction, session);
  }
}

/**
 * Show the main grid view
 */
async function showGridView(interaction, session) {
  try {
    const puzzle = await getTodaysPuzzle();
    const progress = await gameState.getUserProgress(
      interaction.guild?.id || interaction.channel?.id,
      interaction.user.id,
      puzzle.puzzleId
    );

    const { embed, files } = await createGameEmbedWithCanvas(puzzle, progress, session.currentGrid);
    const components = createGameUI(session.currentGrid);

    return interaction.update({
      content: `🎮 **Craftle** - Click a cell to place an item!`,
      embeds: [embed],
      files,
      components,
    });
  } catch (error) {
    console.error('[Craftle] Error in showGridView:', error);
    return interaction.reply({ content: '❌ Error updating game view.', ephemeral: true });
  }
}

/**
 * Handle submit guess
 */
async function handleSubmitGuess(interaction) {
  const userId = interaction.user.id;
  const session = activeSessions.get(userId);

  if (!session) {
    return interaction.reply({ content: '❌ Session expired. Use !craftle to start a new game.', ephemeral: true });
  }

  // Check if grid is complete
  if (!isGridComplete(session.currentGrid)) {
    return interaction.reply({ content: '⚠️ Please fill all 9 cells before submitting!', ephemeral: true });
  }

  await interaction.deferUpdate();

  try {
    const puzzle = await getTodaysPuzzle();
    const guildId = interaction.guild?.id || interaction.channel?.id;
    const progress = await gameState.getUserProgress(guildId, userId, puzzle.puzzleId);

    if (!progress) {
      return interaction.followUp({ content: '❌ Error loading progress.', ephemeral: true });
    }

    // Validate guess
    const feedback = validateGuess(session.currentGrid, puzzle.recipe.grid);
    const solved = isSolved(feedback);

    // Add guess to database
    await gameState.addGuess(guildId, userId, puzzle.puzzleId, session.currentGrid, feedback, solved);

    // Get updated progress
    const updatedProgress = await gameState.getUserProgress(guildId, userId, puzzle.puzzleId);
    const attempts = updatedProgress.attempts;
    const isComplete = solved || attempts >= 6;

    if (isComplete) {
      // Game over
      const stats = await gameState.getOrInitializeUserStats(guildId, userId);
      const reward = await awardPuzzleReward(guildId, userId, solved, attempts, stats, puzzle.metadata.difficulty, false);

      await gameState.markRewardGiven(guildId, userId, puzzle.puzzleId, reward);
      await gameState.updateUserStats(guildId, userId, solved, attempts, puzzle.date, puzzle.puzzleId, reward);

      const { embed: resultEmbed, files } = await createResultEmbedWithCanvas(puzzle, updatedProgress, reward);
      const buttons = createCompletedGameButtons();

      await interaction.editReply({
        content: solved ? '🎉 **Congratulations!**' : '😔 **Better luck tomorrow!**',
        embeds: [resultEmbed],
        files,
        components: [buttons],
      });

      activeSessions.delete(userId);
    } else {
      // Continue playing - reset grid
      session.currentGrid = createEmptyGrid();

      const { embed, files } = await createGameEmbedWithCanvas(puzzle, updatedProgress, session.currentGrid);
      const components = createGameUI(session.currentGrid);

      await interaction.editReply({
        content: `🎮 **Attempt ${attempts}/6** - Click a cell to place an item!`,
        embeds: [embed],
        files,
        components,
      });
    }
  } catch (error) {
    console.error('[Craftle] Error in handleSubmitGuess:', error);
    await interaction.followUp({ content: '❌ Error submitting guess.', ephemeral: true });
  }
}

/**
 * Handle stats button
 */
async function handleStatsButton(interaction) {
  const guildId = interaction.guild?.id || interaction.channel?.id;
  const userId = interaction.user.id;

  const stats = await gameState.getOrInitializeUserStats(guildId, userId);
  const embed = createStatsEmbed(stats, interaction.user);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle leaderboard button
 */
async function handleLeaderboardButton(interaction) {
  const guildId = interaction.guild?.id;

  if (!guildId) {
    return interaction.reply({ content: 'Leaderboard is only available in servers.', ephemeral: true });
  }

  const topPlayers = await gameState.getTopPlayers(guildId, 10);
  const rankings = gameState.calculateLeaderboardScores(topPlayers);
  const embed = await createLeaderboardEmbed(interaction.guild.name, rankings, 'daily', interaction.client);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle share button
 */
async function handleShareButton(interaction) {
  const guildId = interaction.guild?.id || interaction.channel?.id;
  const userId = interaction.user.id;

  const puzzle = await getTodaysPuzzle();
  const progress = await gameState.getUserProgress(guildId, userId, puzzle.puzzleId);

  if (!progress || (!progress.solved && progress.attempts < 6)) {
    return interaction.reply({ content: '❌ Complete the puzzle first!', ephemeral: true });
  }

  const puzzleNum = getPuzzleNumber(puzzle.date);
  const shareText = generateShareText(puzzleNum, progress.guesses, progress.solved);

  // Post publicly
  await interaction.reply({ content: shareText });
}

module.exports = (client) => {
  // Message handler
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'craftle') {
      await handleCraftleCommand(message, args);
    }
  });

  // Interaction handler
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.customId || !interaction.customId.startsWith('craftle_')) return;

    try {
      if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
      }
    } catch (error) {
      console.error('[Craftle] Interaction error:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
        }
      } catch {}
    }
  });
};
