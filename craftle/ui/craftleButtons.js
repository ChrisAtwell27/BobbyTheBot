const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { loadItems, getAllRecipeItems } = require('../utils/itemLoader');

/**
 * Craftle Interactive Buttons
 * Creates button components for item selection and game controls
 */

/**
 * Create item selection menu
 * @param {Array} currentGrid - Current guess grid (3x3)
 * @param {number} page - Current page number
 * @returns {Array} Array of ActionRow components
 */
function createItemSelectionMenu(currentGrid = null, page = 0) {
  const items = loadItems();
  const recipeItems = getAllRecipeItems();

  // Filter to only items used in recipes
  const availableItems = recipeItems
    .map(itemId => items[itemId])
    .filter(item => item !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));

  const itemsPerPage = 25; // Discord limit
  const totalPages = Math.ceil(availableItems.length / itemsPerPage);
  const startIdx = page * itemsPerPage;
  const endIdx = Math.min(startIdx + itemsPerPage, availableItems.length);
  const pageItems = availableItems.slice(startIdx, endIdx);

  // Create select menu with items
  const options = pageItems.map(item =>
    new StringSelectMenuOptionBuilder()
      .setLabel(item.name)
      .setValue(item.id)
      .setEmoji(item.emoji || '🟫')
      .setDescription(`${item.category}`)
  );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`craftle_select_item:${page}`)
    .setPlaceholder('Select an item to place')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  // Create grid position buttons (for selecting where to place)
  const gridButtons = [];
  for (let i = 0; i < 3; i++) {
    const row = new ActionRowBuilder();
    for (let j = 0; j < 3; j++) {
      const cell = currentGrid ? currentGrid[i][j] : null;
      const item = cell ? items[cell] : null;

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`craftle_cell:${i},${j}`)
          .setLabel(item ? item.emoji || '?' : '⬛')
          .setStyle(cell ? ButtonStyle.Primary : ButtonStyle.Secondary)
      );
    }
    gridButtons.push(row);
  }

  // Create control buttons
  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('craftle_submit')
      .setLabel('Submit Guess')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('craftle_clear')
      .setLabel('Clear Grid')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('craftle_help')
      .setLabel('Help')
      .setEmoji('❓')
      .setStyle(ButtonStyle.Primary)
  );

  // Add pagination buttons if needed
  if (totalPages > 1) {
    const paginationRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`craftle_page:${Math.max(0, page - 1)}`)
        .setLabel('Previous')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`craftle_page_info:${page}`)
        .setLabel(`Page ${page + 1}/${totalPages}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`craftle_page:${Math.min(totalPages - 1, page + 1)}`)
        .setLabel('Next')
        .setEmoji('➡️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages - 1)
    );

    return [selectRow, ...gridButtons, controlRow, paginationRow];
  }

  return [selectRow, ...gridButtons, controlRow];
}

/**
 * Create simplified control buttons (for completed games)
 * @returns {ActionRowBuilder} Control row
 */
function createCompletedGameButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('craftle_stats')
      .setLabel('View Stats')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('craftle_leaderboard')
      .setLabel('Leaderboard')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('craftle_share')
      .setLabel('Share')
      .setEmoji('📤')
      .setStyle(ButtonStyle.Success)
  );
}

/**
 * Create grid display with current items
 * @param {Array} grid - 3x3 grid of item IDs
 * @returns {string} Visual grid representation
 */
function createGridDisplay(grid) {
  const items = loadItems();
  let display = '```\n';

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const itemId = grid[i][j];
      const item = itemId ? items[itemId] : null;

      if (item) {
        display += ` ${item.emoji || '?'} `;
      } else {
        display += ' ⬛ ';
      }
    }
    display += '\n';
  }

  display += '```';
  return display;
}

/**
 * Create item picker with categories
 * @param {string} category - Selected category
 * @returns {ActionRowBuilder} Select menu for items in category
 */
function createCategoryItemPicker(category = 'all') {
  const items = loadItems();
  const recipeItems = getAllRecipeItems();

  let filteredItems = recipeItems
    .map(itemId => items[itemId])
    .filter(item => item !== undefined);

  // Filter by category if specified
  if (category !== 'all') {
    filteredItems = filteredItems.filter(item => item.category === category);
  }

  filteredItems.sort((a, b) => a.name.localeCompare(b.name));

  // Limit to 25 items (Discord limit)
  const options = filteredItems.slice(0, 25).map(item =>
    new StringSelectMenuOptionBuilder()
      .setLabel(item.name)
      .setValue(item.id)
      .setEmoji(item.emoji || '🟫')
  );

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`craftle_item_picker:${category}`)
    .setPlaceholder(`Select item from ${category === 'all' ? 'all categories' : category}`)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  return new ActionRowBuilder().addComponents(selectMenu);
}

/**
 * Create category selector
 * @returns {ActionRowBuilder} Button row for categories
 */
function createCategorySelector() {
  const categories = [
    { name: 'All', value: 'all', emoji: '📦' },
    { name: 'Building', value: 'building', emoji: '🏗️' },
    { name: 'Tools', value: 'tools', emoji: '⚒️' },
    { name: 'Weapons', value: 'weapons', emoji: '⚔️' },
    { name: 'Food', value: 'food', emoji: '🍖' },
    { name: 'Redstone', value: 'redstone', emoji: '🔴' },
  ];

  const buttons = categories.slice(0, 5).map(cat =>
    new ButtonBuilder()
      .setCustomId(`craftle_category:${cat.value}`)
      .setLabel(cat.name)
      .setEmoji(cat.emoji)
      .setStyle(ButtonStyle.Secondary)
  );

  return new ActionRowBuilder().addComponents(...buttons);
}

/**
 * Create leaderboard type selector
 * @returns {ActionRowBuilder} Button row for leaderboard types
 */
function createLeaderboardSelector() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('craftle_lb:daily')
      .setLabel('Daily')
      .setEmoji('📅')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('craftle_lb:weekly')
      .setLabel('Weekly')
      .setEmoji('📆')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('craftle_lb:monthly')
      .setLabel('Monthly')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('craftle_lb:alltime')
      .setLabel('All Time')
      .setEmoji('🏆')
      .setStyle(ButtonStyle.Success)
  );
}

/**
 * Parse custom ID to extract data
 * @param {string} customId - Button custom ID
 * @returns {Object} Parsed data
 */
function parseCustomId(customId) {
  const parts = customId.split(':');
  return {
    action: parts[0],
    data: parts[1],
  };
}

/**
 * Parse cell position from custom ID
 * @param {string} customId - Cell button custom ID (craftle_cell:i,j)
 * @returns {Object} Position {row, col}
 */
function parseCellPosition(customId) {
  const parsed = parseCustomId(customId);
  const [row, col] = parsed.data.split(',').map(Number);
  return { row, col };
}

/**
 * Create a simple text display of the grid
 * @param {Array} grid - 3x3 grid
 * @param {Array} feedback - 3x3 feedback array (optional)
 * @returns {string} Text representation
 */
function createTextGrid(grid, feedback = null) {
  const items = loadItems();
  let display = '';

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const itemId = grid[i][j];
      const item = itemId ? items[itemId] : null;

      if (feedback) {
        const fb = feedback[i][j];
        if (fb === 'correct') {
          display += '🟩';
        } else if (fb === 'wrong_position') {
          display += '🟨';
        } else if (fb === 'not_in_recipe') {
          display += '⬜';
        } else {
          display += '⬛';
        }
      } else {
        display += item ? (item.emoji || '🟫') : '⬛';
      }
    }
    display += '\n';
  }

  return display;
}

module.exports = {
  createItemSelectionMenu,
  createCompletedGameButtons,
  createGridDisplay,
  createCategoryItemPicker,
  createCategorySelector,
  createLeaderboardSelector,
  createTextGrid,
  parseCustomId,
  parseCellPosition,
};
