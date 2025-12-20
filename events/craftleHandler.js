const {getTodaysPuzzle, getPuzzleNumber} = require('../craftle/utils/puzzleGenerator');
const gameState = require('../craftle/game/craftleGameState');
const {validateGuess, isSolved, createEmptyGrid, isGridComplete} = require('../craftle/game/craftleLogic');
const {awardPuzzleReward} = require('../craftle/game/craftleRewards');
const {getItemById, loadItems} = require('../craftle/utils/itemLoader');
const {
  createGameEmbed,
  createGameEmbedWithCanvas,
  createResultEmbed,
  createResultEmbedWithCanvas,
  createStatsEmbed,
  createLeaderboardEmbed,
  createHelpEmbed,
  generateShareText,
} = require('../craftle/ui/craftleEmbeds');
const {
  createItemSelectionMenu,
  createCompletedGameButtons,
  parseCustomId,
  parseCellPosition,
} = require('../craftle/ui/craftleButtons');

/**
 * Craftle Command Handler
 * Handles all !craftle commands and button interactions
 */

// Store active game sessions (user grids being built)
const activeSessions = new Map();

/**
 * Main command handler
 * @param {Object} message - Discord message object
 * @param {Array} args - Command arguments
 */
async function handleCraftleCommand(message, args) {
  const subcommand = args[0]?.toLowerCase();

  // Handle subcommands
  if (subcommand === 'stats') {
    return await handleStatsCommand(message);
  }

  if (subcommand === 'leaderboard' || subcommand === 'lb') {
    return await handleLeaderboardCommand(message, args[1]);
  }

  if (subcommand === 'help') {
    return await handleHelpCommand(message);
  }

  // Default: Show today's puzzle
  return await handlePlayCommand(message);
}

/**
 * Handle !craftle (play today's puzzle)
 */
async function handlePlayCommand(message) {
  const guildId = message.guild.id;
  const userId = message.author.id;

  try {
    // Get today's puzzle
    const puzzle = await getTodaysPuzzle();
    if (!puzzle) {
      return message.reply('❌ Could not load today\'s puzzle. Please try again later.');
    }

    // Get or create user progress
    const progress = await gameState.getOrCreateUserProgress(
      guildId,
      userId,
      puzzle.puzzleId,
      puzzle.date
    );

    if (!progress) {
      return message.reply('❌ Error loading your progress. Please try again.');
    }

    // Check if user has already completed this puzzle
    if (progress.solved || progress.attempts >= 6) {
      const { embed, files } = await createGameEmbedWithCanvas(puzzle, progress, null);
      const buttons = createCompletedGameButtons();

      return message.reply({
        embeds: [embed],
        files,
        components: [buttons],
      });
    }

    // Initialize active session
    activeSessions.set(userId, {
      puzzleId: puzzle.puzzleId,
      currentGrid: createEmptyGrid(),
      selectedCell: null,
    });

    // Show game interface with canvas image
    const { embed, files } = await createGameEmbedWithCanvas(puzzle, progress, activeSessions.get(userId).currentGrid);
    const components = createItemSelectionMenu(activeSessions.get(userId).currentGrid);

    return message.reply({
      embeds: [embed],
      files,
      components,
    });
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
    // Get or initialize user stats
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

  // Validate type
  if (!validTypes.includes(type)) {
    type = 'daily';
  }

  try {
    // Get top players (real-time)
    const topPlayers = await gameState.getTopPlayers(guildId, 10);

    // Calculate rankings
    const rankings = gameState.calculateLeaderboardScores(topPlayers);

    // Create leaderboard embed
    const embed = await createLeaderboardEmbed(
      message.guild.name,
      rankings,
      type,
      message.client
    );

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
 * @param {Object} interaction - Button interaction
 */
async function handleButtonInteraction(interaction) {
  const customId = interaction.customId;

  // Parse action
  if (customId.startsWith('craftle_select_item')) {
    return await handleItemSelection(interaction);
  }

  if (customId.startsWith('craftle_cell')) {
    return await handleCellSelection(interaction);
  }

  if (customId === 'craftle_submit') {
    return await handleSubmitGuess(interaction);
  }

  if (customId === 'craftle_clear') {
    return await handleClearGrid(interaction);
  }

  if (customId === 'craftle_help') {
    const embed = createHelpEmbed();
    return await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (customId === 'craftle_stats') {
    return await handleStatsButton(interaction);
  }

  if (customId === 'craftle_leaderboard') {
    return await handleLeaderboardButton(interaction);
  }

  if (customId === 'craftle_share') {
    return await handleShareButton(interaction);
  }

  if (customId.startsWith('craftle_page')) {
    return await handlePageChange(interaction);
  }

  if (customId.startsWith('craftle_lb')) {
    return await handleLeaderboardTypeChange(interaction);
  }
}

/**
 * Handle select menu interactions
 * @param {Object} interaction - Select menu interaction
 */
async function handleSelectMenuInteraction(interaction) {
  const customId = interaction.customId;

  if (customId.startsWith('craftle_select_item')) {
    return await handleItemFromMenu(interaction);
  }
}

/**
 * Handle item selection from dropdown menu
 */
async function handleItemFromMenu(interaction) {
  const userId = interaction.user.id;
  const session = activeSessions.get(userId);

  if (!session) {
    return await interaction.reply({
      content: '❌ Your session has expired. Please start a new game with !craftle',
      ephemeral: true,
    });
  }

  const selectedItemId = interaction.values[0];

  // Add item to first available cell
  let placed = false;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (session.currentGrid[i][j] === null) {
        session.currentGrid[i][j] = selectedItemId;
        placed = true;
        break;
      }
    }
    if (placed) break;
  }

  if (!placed) {
    return await interaction.reply({
      content: '⚠️ Grid is full! Clear a cell or submit your guess.',
      ephemeral: true,
    });
  }

  const item = getItemById(selectedItemId);
  await interaction.reply({
    content: `✅ Added **${item.name}** to the grid!`,
    ephemeral: true,
  });

  // Update the message with new grid
  await updateGameMessage(interaction.message, userId);
}

/**
 * Handle item selection button
 */
async function handleItemSelection(interaction) {
  const userId = interaction.user.id;
  const session = activeSessions.get(userId);

  if (!session) {
    return await interaction.reply({
      content: '❌ Your session has expired. Please start a new game with !craftle',
      ephemeral: true,
    });
  }

  await interaction.deferUpdate();
}

/**
 * Handle cell selection (to clear or replace)
 */
async function handleCellSelection(interaction) {
  const userId = interaction.user.id;
  const session = activeSessions.get(userId);

  if (!session) {
    return await interaction.reply({
      content: '❌ Your session has expired. Please start a new game with !craftle',
      ephemeral: true,
    });
  }

  const { row, col } = parseCellPosition(interaction.customId);

  // Clear the cell
  session.currentGrid[row][col] = null;

  await interaction.deferUpdate();
  await updateGameMessage(interaction.message, userId);
}

/**
 * Handle submit guess button
 */
async function handleSubmitGuess(interaction) {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  const session = activeSessions.get(userId);

  if (!session) {
    return await interaction.reply({
      content: '❌ Your session has expired. Please start a new game with !craftle',
      ephemeral: true,
    });
  }

  // Check if grid is complete
  if (!isGridComplete(session.currentGrid)) {
    return await interaction.reply({
      content: '⚠️ Please fill all 9 cells before submitting!',
      ephemeral: true,
    });
  }

  await interaction.deferUpdate();

  try {
    // Get puzzle
    const puzzle = await getTodaysPuzzle();
    if (!puzzle) {
      return await interaction.followUp({
        content: '❌ Error loading puzzle.',
        ephemeral: true,
      });
    }

    // Get user progress
    const progress = await gameState.getUserProgress(guildId, userId, puzzle.puzzleId);
    if (!progress) {
      return await interaction.followUp({
        content: '❌ Error loading progress.',
        ephemeral: true,
      });
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
      // Game over - award rewards
      const stats = await gameState.getOrInitializeUserStats(guildId, userId);
      const reward = await awardPuzzleReward(
        guildId,
        userId,
        solved,
        attempts,
        stats,
        puzzle.metadata.difficulty,
        false
      );

      // Mark reward as given
      await gameState.markRewardGiven(guildId, userId, puzzle.puzzleId, reward);

      // Update user stats
      await gameState.updateUserStats(
        guildId,
        userId,
        solved,
        attempts,
        puzzle.date,
        puzzle.puzzleId,
        reward
      );

      // Show result embed with canvas image
      const { embed: resultEmbed, files } = await createResultEmbedWithCanvas(puzzle, updatedProgress, reward);
      const buttons = createCompletedGameButtons();

      await interaction.message.edit({
        embeds: [resultEmbed],
        files,
        components: [buttons],
      });

      // Clear session
      activeSessions.delete(userId);
    } else {
      // Continue playing - reset grid for next guess
      session.currentGrid = createEmptyGrid();

      const { embed, files } = await createGameEmbedWithCanvas(puzzle, updatedProgress, session.currentGrid);
      const components = createItemSelectionMenu(session.currentGrid);

      await interaction.message.edit({
        embeds: [embed],
        files,
        components,
      });
    }
  } catch (error) {
    console.error('[Craftle] Error in handleSubmitGuess:', error);
    await interaction.followUp({
      content: '❌ An error occurred while submitting your guess.',
      ephemeral: true,
    });
  }
}

/**
 * Handle clear grid button
 */
async function handleClearGrid(interaction) {
  const userId = interaction.user.id;
  const session = activeSessions.get(userId);

  if (!session) {
    return await interaction.reply({
      content: '❌ Your session has expired.',
      ephemeral: true,
    });
  }

  // Clear the grid
  session.currentGrid = createEmptyGrid();

  await interaction.deferUpdate();
  await updateGameMessage(interaction.message, userId);
}

/**
 * Handle stats button (from completed game)
 */
async function handleStatsButton(interaction) {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  const stats = await gameState.getOrInitializeUserStats(guildId, userId);
  const embed = createStatsEmbed(stats, interaction.user);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle leaderboard button
 */
async function handleLeaderboardButton(interaction) {
  const guildId = interaction.guild.id;
  const topPlayers = await gameState.getTopPlayers(guildId, 10);
  const rankings = gameState.calculateLeaderboardScores(topPlayers);
  const embed = await createLeaderboardEmbed(interaction.guild.name, rankings, 'daily', interaction.client);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle share button
 */
async function handleShareButton(interaction) {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;

  const puzzle = await getTodaysPuzzle();
  const progress = await gameState.getUserProgress(guildId, userId, puzzle.puzzleId);

  if (!progress || (!progress.solved && progress.attempts < 6)) {
    return await interaction.reply({
      content: '❌ You haven\'t completed today\'s puzzle yet!',
      ephemeral: true,
    });
  }

  const puzzleNum = getPuzzleNumber(puzzle.date);
  const shareText = generateShareText(puzzleNum, progress.guesses, progress.solved);

  await interaction.reply({
    content: shareText,
    ephemeral: false,
  });
}

/**
 * Handle page change button
 */
async function handlePageChange(interaction) {
  const { data } = parseCustomId(interaction.customId);
  const page = parseInt(data);
  const userId = interaction.user.id;
  const session = activeSessions.get(userId);

  if (!session) {
    return await interaction.reply({
      content: '❌ Your session has expired.',
      ephemeral: true,
    });
  }

  const components = createItemSelectionMenu(session.currentGrid, page);

  await interaction.update({ components });
}

/**
 * Handle leaderboard type change
 */
async function handleLeaderboardTypeChange(interaction) {
  const { data } = parseCustomId(interaction.customId);
  const type = data; // daily, weekly, monthly, alltime

  const guildId = interaction.guild.id;
  const topPlayers = await gameState.getTopPlayers(guildId, 10);
  const rankings = gameState.calculateLeaderboardScores(topPlayers);
  const embed = await createLeaderboardEmbed(interaction.guild.name, rankings, type, interaction.client);

  await interaction.update({ embeds: [embed] });
}

/**
 * Update game message with current grid (using canvas)
 */
async function updateGameMessage(message, userId) {
  const session = activeSessions.get(userId);
  if (!session) return;

  const puzzle = await getTodaysPuzzle();
  const progress = await gameState.getUserProgress(message.guild.id, userId, puzzle.puzzleId);

  const { embed, files } = await createGameEmbedWithCanvas(puzzle, progress, session.currentGrid);
  const components = createItemSelectionMenu(session.currentGrid);

  await message.edit({
    embeds: [embed],
    files,
    components,
  });
}

module.exports = (client) => {
  // Register message handler
  client.on('messageCreate', async (message) => {
    // Ignore bots
    if (message.author.bot) return;

    // Only respond to !craftle commands
    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'craftle') {
      await handleCraftleCommand(message, args);
    }
  });

  // Register interaction handler
  client.on('interactionCreate', async (interaction) => {
    // Only handle Craftle interactions
    if (!interaction.customId || !interaction.customId.startsWith('craftle_')) return;

    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenuInteraction(interaction);
    }
  });
};
