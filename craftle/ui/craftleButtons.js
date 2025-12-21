const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { loadItems, getAllRecipeItems } = require('../utils/itemLoader');

/**
 * Craftle Interactive Buttons
 * Creates button components for item selection and game controls
 */

/**
 * Create the main game UI (max 5 rows for Discord)
 * New flow: Click a cell → opens item picker for that cell
 * Layout: Row 1-3: 3x3 Grid | Row 4: Controls | Row 5: Submit
 * @param {Array} currentGrid - Current guess grid (3x3)
 * @param {number|null} selectedCell - Currently selected cell (row*3+col) or null
 * @returns {Array} Array of ActionRow components (max 5)
 */
function createGameUI(currentGrid = null, selectedCell = null) {
  const items = loadItems();

  // Rows 1-3: 3x3 Grid (one row per grid row)
  const gridRows = [];
  for (let i = 0; i < 3; i++) {
    const row = new ActionRowBuilder();
    for (let j = 0; j < 3; j++) {
      const cellIndex = i * 3 + j;
      const cell = currentGrid ? currentGrid[i][j] : null;
      const item = cell ? items[cell] : null;
      const isSelected = selectedCell === cellIndex;

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`craftle_cell:${i},${j}`)
          .setLabel(item ? item.name.substring(0, 12) : '[ Empty ]')
          .setStyle(isSelected ? ButtonStyle.Success : (cell ? ButtonStyle.Primary : ButtonStyle.Secondary))
      );
    }
    gridRows.push(row);
  }

  // Row 4: Control buttons
  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('craftle_clear')
      .setLabel('Clear All')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('craftle_help')
      .setLabel('How to Play')
      .setStyle(ButtonStyle.Secondary)
  );

  // Row 5: Submit button
  const submitRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('craftle_submit')
      .setLabel('Submit Guess')
      .setStyle(ButtonStyle.Success)
      .setDisabled(false)
  );

  return [...gridRows, controlRow, submitRow];
}

/**
 * Create item picker UI for a specific cell (shown after clicking a cell)
 * @param {number} cellRow - Row of selected cell (0-2)
 * @param {number} cellCol - Column of selected cell (0-2)
 * @param {string} category - Category filter
 * @param {number} page - Page number for pagination
 * @param {Array} dailyItems - Optional array of item IDs available for today's puzzle
 * @returns {Array} Array of ActionRow components (max 5)
 */
function createItemPickerUI(cellRow, cellCol, category = 'all', page = 0, dailyItems = null) {
  const items = loadItems();

  // Use daily items if provided, otherwise fall back to all recipe items
  const itemIds = dailyItems || getAllRecipeItems();

  // Map to item objects
  let availableItems = itemIds
    .map(itemId => items[itemId])
    .filter(item => item !== undefined);

  // Apply category filter
  if (category !== 'all') {
    availableItems = availableItems.filter(item => item.category === category);
  }

  availableItems.sort((a, b) => a.name.localeCompare(b.name));

  // Pagination
  const itemsPerPage = 25;
  const totalPages = Math.ceil(availableItems.length / itemsPerPage);
  const startIdx = page * itemsPerPage;
  const pageItems = availableItems.slice(startIdx, startIdx + itemsPerPage);

  // Row 1: Item dropdown
  const options = pageItems.length > 0
    ? pageItems.map(item =>
        new StringSelectMenuOptionBuilder()
          .setLabel(item.name)
          .setValue(item.id)
          .setDescription(item.category || 'misc')
      )
    : [new StringSelectMenuOptionBuilder().setLabel('No items').setValue('none').setDescription('Try another category')];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`craftle_pick_item:${cellRow},${cellCol}:${category}:${page}`)
    .setPlaceholder(`Pick item for cell [${cellRow + 1},${cellCol + 1}]`)
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  const selectRow = new ActionRowBuilder().addComponents(selectMenu);

  // Row 2: Category filters (simplified - only 5 categories for cleaner UI)
  const categories = [
    { name: 'All', value: 'all' },
    { name: 'Building', value: 'building' },
    { name: 'Misc', value: 'misc' },
    { name: 'Food', value: 'food' },
    { name: 'Redstone', value: 'redstone' },
  ];

  const categoryRow = new ActionRowBuilder().addComponents(
    ...categories.map(cat =>
      new ButtonBuilder()
        .setCustomId(`craftle_picker_cat:${cellRow},${cellCol}:${cat.value}:${page}`)
        .setLabel(cat.name)
        .setStyle(cat.value === category ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  );

  // Row 3: Pagination (use prev/next prefix to avoid duplicate IDs when on single page)
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`craftle_picker_prev:${cellRow},${cellCol}:${category}:${Math.max(0, page - 1)}`)
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`craftle_picker_info`)
      .setLabel(`Page ${page + 1}/${Math.max(1, totalPages)} (${availableItems.length} items)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`craftle_picker_next:${cellRow},${cellCol}:${category}:${Math.min(totalPages - 1, page + 1)}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );

  // Row 4: Clear cell + Back to grid
  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`craftle_clear_cell:${cellRow},${cellCol}`)
      .setLabel('Clear This Cell')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('craftle_back_to_grid')
      .setLabel('← Back to Grid')
      .setStyle(ButtonStyle.Primary)
  );

  return [selectRow, categoryRow, navRow, actionRow];
}

/**
 * Create item selection menu (LEGACY - keeping for compatibility)
 * @deprecated Use createGameUI instead
 */
function createItemSelectionMenu(currentGrid = null, category = 'all') {
  return createGameUI(currentGrid, null);
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
        } else if (fb === 'missing') {
          display += '🟥'; // Red for missing item (cell should have an item)
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
  createGameUI,
  createItemPickerUI,
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
