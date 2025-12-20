const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { loadItems, getAllRecipeItems } = require('../utils/itemLoader');

/**
 * Craftle Interactive Buttons
 * Creates button components for item selection and game controls
 */

/**
 * Create item selection menu (max 5 rows for Discord)
 * Layout: Row 1: Item Select | Row 2: Category Select | Row 3-4: Grid (2 rows of buttons) | Row 5: Controls
 * @param {Array} currentGrid - Current guess grid (3x3)
 * @param {string} category - Selected category filter
 * @returns {Array} Array of ActionRow components (max 5)
 */
function createItemSelectionMenu(currentGrid = null, category = 'all') {
  const items = loadItems();
  const recipeItems = getAllRecipeItems();

  // Filter to only items used in recipes
  let availableItems = recipeItems
    .map(itemId => items[itemId])
    .filter(item => item !== undefined);

  // Apply category filter
  if (category !== 'all') {
    availableItems = availableItems.filter(item => item.category === category);
  }

  availableItems.sort((a, b) => a.name.localeCompare(b.name));

  // Limit to 25 items (Discord select menu limit)
  const pageItems = availableItems.slice(0, 25);

  // Create select menu with items
  const options = pageItems.length > 0
    ? pageItems.map(item =>
        new StringSelectMenuOptionBuilder()
          .setLabel(item.name)
          .setValue(item.id)
          .setDescription(item.category || 'misc')
      )
    : [new StringSelectMenuOptionBuilder().setLabel('No items in category').setValue('none').setDescription('Try another category')];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`craftle_select_item:${category}`)
    .setPlaceholder(`Select item (${category === 'all' ? 'All Items' : category})`)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  // Row 2: Category filter buttons (5 categories max)
  const categories = [
    { name: 'All', value: 'all' },
    { name: 'Tools', value: 'tools' },
    { name: 'Building', value: 'building' },
    { name: 'Redstone', value: 'redstone' },
    { name: 'Misc', value: 'misc' },
  ];

  const categoryRow = new ActionRowBuilder().addComponents(
    ...categories.map(cat =>
      new ButtonBuilder()
        .setCustomId(`craftle_category:${cat.value}`)
        .setLabel(cat.name)
        .setStyle(cat.value === category ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  );

  // Rows 3-4: Grid buttons (3x3 = 9 buttons, split into 2 rows: 5 + 4)
  // Row 3: cells 0,0 | 0,1 | 0,2 | 1,0 | 1,1
  // Row 4: cells 1,2 | 2,0 | 2,1 | 2,2 + Clear button
  const gridPositions = [
    [[0,0], [0,1], [0,2], [1,0], [1,1]],  // First 5
    [[1,2], [2,0], [2,1], [2,2]]           // Last 4
  ];

  const gridRow1 = new ActionRowBuilder();
  for (const [i, j] of gridPositions[0]) {
    const cell = currentGrid ? currentGrid[i][j] : null;
    const item = cell ? items[cell] : null;
    gridRow1.addComponents(
      new ButtonBuilder()
        .setCustomId(`craftle_cell:${i},${j}`)
        .setLabel(item ? item.name.substring(0, 10) : `[${i+1},${j+1}]`)
        .setStyle(cell ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
  }

  const gridRow2 = new ActionRowBuilder();
  for (const [i, j] of gridPositions[1]) {
    const cell = currentGrid ? currentGrid[i][j] : null;
    const item = cell ? items[cell] : null;
    gridRow2.addComponents(
      new ButtonBuilder()
        .setCustomId(`craftle_cell:${i},${j}`)
        .setLabel(item ? item.name.substring(0, 10) : `[${i+1},${j+1}]`)
        .setStyle(cell ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
  }
  // Add clear button to row 2
  gridRow2.addComponents(
    new ButtonBuilder()
      .setCustomId('craftle_clear')
      .setLabel('Clear')
      .setStyle(ButtonStyle.Danger)
  );

  // Row 5: Control buttons
  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('craftle_submit')
      .setLabel('Submit Guess')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('craftle_help')
      .setLabel('Help')
      .setStyle(ButtonStyle.Secondary)
  );

  // Return exactly 5 rows
  return [selectRow, categoryRow, gridRow1, gridRow2, controlRow];
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
