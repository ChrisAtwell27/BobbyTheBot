/**
 * Craftle Canvas Utilities
 * Renders crafting grids using actual Minecraft textures
 */

const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');

// Paths to Minecraft assets
const ASSETS_BASE = path.join(__dirname, '../../images/minecraft-assets-1.21.11/assets/minecraft/textures');
const ITEM_TEXTURES = path.join(ASSETS_BASE, 'item');
const BLOCK_TEXTURES = path.join(ASSETS_BASE, 'block');

// Canvas dimensions
const CELL_SIZE = 64;
const GRID_PADDING = 8;
const GRID_SIZE = 3;
const CANVAS_SIZE = CELL_SIZE * GRID_SIZE + GRID_PADDING * 4;

// Colors
const COLORS = {
  BACKGROUND: '#8B8B8B',      // Minecraft inventory gray
  SLOT_DARK: '#373737',       // Dark slot border
  SLOT_LIGHT: '#FFFFFF',      // Light slot highlight
  SLOT_BG: '#8B8B8B',         // Slot background
  CORRECT: '#55FF55',         // Green for correct
  WRONG_POSITION: '#FFFF55',  // Yellow for wrong position
  NOT_IN_RECIPE: '#FF5555',   // Red/gray for not in recipe
  EMPTY: '#555555',           // Empty slot overlay
};

// Image cache
const textureCache = new Map();

/**
 * Load a Minecraft texture by item ID
 * @param {string} itemId - Item ID like 'diamond', 'oak_planks', etc.
 * @returns {Promise<Image|null>} Loaded image or null
 */
async function loadTexture(itemId) {
  if (!itemId) return null;

  // Check cache first
  if (textureCache.has(itemId)) {
    return textureCache.get(itemId);
  }

  // Try item texture first, then block texture
  const itemPath = path.join(ITEM_TEXTURES, `${itemId}.png`);
  const blockPath = path.join(BLOCK_TEXTURES, `${itemId}.png`);

  // Special cases for items that have different texture names
  const alternates = [
    itemPath,
    blockPath,
    // Try removing _block suffix for block items
    path.join(BLOCK_TEXTURES, `${itemId.replace('_block', '')}.png`),
    // Try adding _top for blocks
    path.join(BLOCK_TEXTURES, `${itemId}_top.png`),
    // Try _side for blocks (like pumpkin)
    path.join(BLOCK_TEXTURES, `${itemId}_side.png`),
    // Try planks
    path.join(BLOCK_TEXTURES, `${itemId}_planks.png`),
    // Try carved_ prefix (for pumpkin -> carved_pumpkin)
    path.join(BLOCK_TEXTURES, `carved_${itemId}.png`),
  ];

  for (const texturePath of alternates) {
    if (fs.existsSync(texturePath)) {
      try {
        const image = await loadImage(texturePath);
        textureCache.set(itemId, image);
        return image;
      } catch (error) {
        console.error(`[Craftle] Failed to load texture: ${texturePath}`, error.message);
      }
    }
  }

  console.warn(`[Craftle] Texture not found for item: ${itemId}`);
  textureCache.set(itemId, null);
  return null;
}

/**
 * Draw a Minecraft-style inventory slot
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} size - Slot size
 * @param {string|null} feedbackColor - Optional feedback color overlay
 */
function drawSlot(ctx, x, y, size, feedbackColor = null) {
  // Outer highlight (top-left is light)
  ctx.fillStyle = COLORS.SLOT_LIGHT;
  ctx.fillRect(x, y, size, 2);
  ctx.fillRect(x, y, 2, size);

  // Outer shadow (bottom-right is dark)
  ctx.fillStyle = COLORS.SLOT_DARK;
  ctx.fillRect(x + size - 2, y, 2, size);
  ctx.fillRect(x, y + size - 2, size, 2);

  // Inner slot background
  ctx.fillStyle = COLORS.SLOT_BG;
  ctx.fillRect(x + 2, y + 2, size - 4, size - 4);

  // Feedback overlay if provided
  if (feedbackColor) {
    ctx.fillStyle = feedbackColor;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
    ctx.globalAlpha = 1.0;

    // Feedback border
    ctx.strokeStyle = feedbackColor;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 4, y + 4, size - 8, size - 8);
  }
}

/**
 * Create a crafting grid image
 * @param {Array} grid - 3x3 array of item IDs (or null for empty)
 * @param {Array|null} feedback - 3x3 array of feedback strings (optional)
 * @returns {Promise<Buffer>} PNG buffer
 */
async function createGridImage(grid, feedback = null) {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext('2d');

  // Background (Minecraft inventory style)
  ctx.fillStyle = COLORS.BACKGROUND;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Draw border
  ctx.fillStyle = COLORS.SLOT_LIGHT;
  ctx.fillRect(0, 0, CANVAS_SIZE, 4);
  ctx.fillRect(0, 0, 4, CANVAS_SIZE);
  ctx.fillStyle = COLORS.SLOT_DARK;
  ctx.fillRect(CANVAS_SIZE - 4, 0, 4, CANVAS_SIZE);
  ctx.fillRect(0, CANVAS_SIZE - 4, CANVAS_SIZE, 4);

  // Draw grid
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const x = GRID_PADDING + col * (CELL_SIZE + GRID_PADDING);
      const y = GRID_PADDING + row * (CELL_SIZE + GRID_PADDING);

      // Determine feedback color
      let feedbackColor = null;
      if (feedback && feedback[row] && feedback[row][col]) {
        const fb = feedback[row][col];
        if (fb === 'correct') {
          feedbackColor = COLORS.CORRECT;
        } else if (fb === 'wrong_position') {
          feedbackColor = COLORS.WRONG_POSITION;
        } else if (fb === 'not_in_recipe') {
          feedbackColor = COLORS.NOT_IN_RECIPE;
        }
      }

      // Draw slot
      drawSlot(ctx, x, y, CELL_SIZE, feedbackColor);

      // Draw item texture
      const itemId = grid[row] ? grid[row][col] : null;
      if (itemId) {
        const texture = await loadTexture(itemId);
        if (texture) {
          // Draw texture scaled to fit slot (with padding)
          const padding = 6;
          const textureSize = CELL_SIZE - padding * 2 - 4;
          ctx.imageSmoothingEnabled = false; // Keep pixel art crisp
          ctx.drawImage(texture, x + padding + 2, y + padding + 2, textureSize, textureSize);
          ctx.imageSmoothingEnabled = true;
        } else {
          // Draw placeholder with item name
          ctx.fillStyle = '#FF00FF';
          ctx.fillRect(x + 8, y + 8, CELL_SIZE - 16, CELL_SIZE - 16);
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(itemId.substring(0, 6), x + CELL_SIZE / 2, y + CELL_SIZE / 2);
        }
      }
    }
  }

  return canvas.toBuffer('image/png');
}

/**
 * Create a guess history image showing all guesses stacked
 * @param {Array} guesses - Array of guess objects with grid and feedback
 * @returns {Promise<Buffer>} PNG buffer
 */
async function createGuessHistoryImage(guesses) {
  if (!guesses || guesses.length === 0) {
    return createGridImage([[null, null, null], [null, null, null], [null, null, null]]);
  }

  const MINI_CELL = 24;
  const MINI_PADDING = 2;
  const GUESS_WIDTH = MINI_CELL * 3 + MINI_PADDING * 4;
  const GUESS_HEIGHT = MINI_CELL * 3 + MINI_PADDING * 4;
  const SPACING = 8;

  const cols = Math.min(guesses.length, 3);
  const rows = Math.ceil(guesses.length / 3);

  const canvasWidth = cols * GUESS_WIDTH + (cols - 1) * SPACING + 16;
  const canvasHeight = rows * GUESS_HEIGHT + (rows - 1) * SPACING + 16;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#2C2F33';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Draw each guess as a mini-grid
  for (let i = 0; i < guesses.length; i++) {
    const guess = guesses[i];
    const col = i % 3;
    const row = Math.floor(i / 3);
    const offsetX = 8 + col * (GUESS_WIDTH + SPACING);
    const offsetY = 8 + row * (GUESS_HEIGHT + SPACING);

    // Draw mini background
    ctx.fillStyle = COLORS.BACKGROUND;
    ctx.fillRect(offsetX, offsetY, GUESS_WIDTH, GUESS_HEIGHT);

    // Draw guess number
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`#${i + 1}`, offsetX + 2, offsetY - 2);

    // Draw mini grid with feedback colors only (no textures for performance)
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const x = offsetX + MINI_PADDING + c * (MINI_CELL + MINI_PADDING);
        const y = offsetY + MINI_PADDING + r * (MINI_CELL + MINI_PADDING);

        const fb = guess.feedback[r][c];
        let color = COLORS.EMPTY;

        if (fb === 'correct') {
          color = COLORS.CORRECT;
        } else if (fb === 'wrong_position') {
          color = COLORS.WRONG_POSITION;
        } else if (fb === 'not_in_recipe') {
          color = '#AAAAAA';
        } else if (guess.grid[r][c] === null) {
          color = COLORS.SLOT_DARK;
        }

        ctx.fillStyle = color;
        ctx.fillRect(x, y, MINI_CELL, MINI_CELL);

        // Add border
        ctx.strokeStyle = COLORS.SLOT_DARK;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, MINI_CELL, MINI_CELL);
      }
    }
  }

  return canvas.toBuffer('image/png');
}

/**
 * Create a full game display with current guess and history
 * @param {Array} currentGrid - Current guess grid (3x3)
 * @param {Array} guesses - Previous guesses with feedback
 * @param {Object} puzzle - Puzzle metadata
 * @returns {Promise<Buffer>} PNG buffer
 */
async function createGameDisplayImage(currentGrid, guesses = [], puzzle = null) {
  // Main grid dimensions
  const MAIN_GRID_SIZE = CANVAS_SIZE;

  // History panel dimensions
  const HISTORY_WIDTH = 150;
  const HEADER_HEIGHT = 40;

  const totalWidth = MAIN_GRID_SIZE + HISTORY_WIDTH + 16;
  const totalHeight = Math.max(MAIN_GRID_SIZE + HEADER_HEIGHT, 300);

  const canvas = createCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');

  // Dark background
  ctx.fillStyle = '#23272A';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // Header
  ctx.fillStyle = '#2C2F33';
  ctx.fillRect(0, 0, totalWidth, HEADER_HEIGHT);

  // Title
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('CRAFTLE', 12, 28);

  // Puzzle info
  if (puzzle) {
    ctx.font = '14px Arial';
    ctx.fillStyle = '#7289DA';
    const diffColors = { easy: '#43B581', medium: '#FAA61A', hard: '#F04747' };
    ctx.fillStyle = diffColors[puzzle.metadata?.difficulty] || '#FFFFFF';
    ctx.fillText(puzzle.metadata?.difficulty?.toUpperCase() || 'DAILY', 100, 28);
  }

  // Attempt counter
  ctx.textAlign = 'right';
  ctx.fillStyle = '#B9BBBE';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(`${guesses.length}/6`, totalWidth - 12, 28);

  // Main crafting grid
  const mainGridBuffer = await createGridImage(currentGrid);
  const mainGridImage = await loadImage(mainGridBuffer);
  ctx.drawImage(mainGridImage, 8, HEADER_HEIGHT + 8);

  // History panel header
  ctx.fillStyle = '#2C2F33';
  ctx.fillRect(MAIN_GRID_SIZE + 8, HEADER_HEIGHT, HISTORY_WIDTH + 8, totalHeight - HEADER_HEIGHT);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('GUESSES', MAIN_GRID_SIZE + 8 + HISTORY_WIDTH / 2, HEADER_HEIGHT + 20);

  // Draw guess history
  if (guesses.length > 0) {
    const historyBuffer = await createGuessHistoryImage(guesses);
    const historyImage = await loadImage(historyBuffer);
    ctx.drawImage(historyImage, MAIN_GRID_SIZE + 12, HEADER_HEIGHT + 30, HISTORY_WIDTH - 8, historyImage.height * ((HISTORY_WIDTH - 8) / historyImage.width));
  } else {
    ctx.fillStyle = '#72767D';
    ctx.font = '11px Arial';
    ctx.fillText('No guesses yet', MAIN_GRID_SIZE + 8 + HISTORY_WIDTH / 2, HEADER_HEIGHT + 60);
  }

  return canvas.toBuffer('image/png');
}

/**
 * Create the answer reveal image
 * @param {Object} recipe - The correct recipe
 * @returns {Promise<Buffer>} PNG buffer
 */
async function createAnswerRevealImage(recipe) {
  const REVEAL_WIDTH = 320;
  const REVEAL_HEIGHT = 340;

  const canvas = createCanvas(REVEAL_WIDTH, REVEAL_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#23272A';
  ctx.fillRect(0, 0, REVEAL_WIDTH, REVEAL_HEIGHT);

  // Header
  ctx.fillStyle = '#43B581';
  ctx.fillRect(0, 0, REVEAL_WIDTH, 50);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('ANSWER', REVEAL_WIDTH / 2, 35);

  // Recipe name
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 18px Arial';
  ctx.fillText(recipe.output, REVEAL_WIDTH / 2, 80);

  // Draw the correct grid
  const gridBuffer = await createGridImage(recipe.grid);
  const gridImage = await loadImage(gridBuffer);
  const gridScale = 0.9;
  const scaledWidth = CANVAS_SIZE * gridScale;
  const scaledHeight = CANVAS_SIZE * gridScale;
  const gridX = (REVEAL_WIDTH - scaledWidth) / 2;
  const gridY = 95;

  ctx.drawImage(gridImage, gridX, gridY, scaledWidth, scaledHeight);

  // Description
  if (recipe.description) {
    ctx.fillStyle = '#B9BBBE';
    ctx.font = '12px Arial';
    ctx.fillText(recipe.description, REVEAL_WIDTH / 2, REVEAL_HEIGHT - 20);
  }

  return canvas.toBuffer('image/png');
}

/**
 * Preload common textures
 * @param {Array} itemIds - Array of item IDs to preload
 */
async function preloadTextures(itemIds) {
  const promises = itemIds.map(id => loadTexture(id));
  await Promise.all(promises);
  console.log(`[Craftle] Preloaded ${itemIds.length} textures`);
}

/**
 * Clear the texture cache
 */
function clearTextureCache() {
  textureCache.clear();
  console.log('[Craftle] Texture cache cleared');
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
function getCacheStats() {
  return {
    texturesCached: textureCache.size,
  };
}

module.exports = {
  createGridImage,
  createGuessHistoryImage,
  createGameDisplayImage,
  createAnswerRevealImage,
  loadTexture,
  preloadTextures,
  clearTextureCache,
  getCacheStats,
  CELL_SIZE,
  GRID_SIZE,
  CANVAS_SIZE,
  COLORS,
};
