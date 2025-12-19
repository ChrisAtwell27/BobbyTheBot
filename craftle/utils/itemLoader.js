const fs = require('fs');
const path = require('path');

/**
 * Craftle Item Loader
 * Loads and caches Minecraft recipe data from recipes.json
 */

// Cache loaded data
let recipesCache = null;
let itemsCache = null;

/**
 * Load recipes from JSON file
 * @returns {Object} Recipes data
 */
function loadRecipes() {
  if (recipesCache) {
    return recipesCache;
  }

  try {
    const recipesPath = path.join(__dirname, '../data/recipes.json');
    const rawData = fs.readFileSync(recipesPath, 'utf8');
    const data = JSON.parse(rawData);

    recipesCache = data.recipes || [];
    itemsCache = data.items || {};

    console.log(`[Craftle] Loaded ${recipesCache.length} recipes and ${Object.keys(itemsCache).length} items`);
    return recipesCache;
  } catch (error) {
    console.error('[Craftle] Error loading recipes:', error);
    return [];
  }
}

/**
 * Load items from JSON file
 * @returns {Object} Items data
 */
function loadItems() {
  if (itemsCache) {
    return itemsCache;
  }

  // Load recipes which also loads items
  loadRecipes();
  return itemsCache || {};
}

/**
 * Get a specific recipe by ID
 * @param {string} recipeId - Recipe ID
 * @returns {Object|null} Recipe object or null
 */
function getRecipeById(recipeId) {
  const recipes = loadRecipes();
  return recipes.find(r => r.id === recipeId) || null;
}

/**
 * Get a specific item by ID
 * @param {string} itemId - Item ID
 * @returns {Object|null} Item object or null
 */
function getItemById(itemId) {
  const items = loadItems();
  return items[itemId] || null;
}

/**
 * Get recipes by category
 * @param {string} category - Category name (tools, weapons, food, etc.)
 * @returns {Array} Filtered recipes
 */
function getRecipesByCategory(category) {
  const recipes = loadRecipes();
  return recipes.filter(r => r.category === category);
}

/**
 * Get recipes by difficulty
 * @param {string} difficulty - Difficulty level (easy, medium, hard)
 * @returns {Array} Filtered recipes
 */
function getRecipesByDifficulty(difficulty) {
  const recipes = loadRecipes();
  return recipes.filter(r => r.difficulty === difficulty);
}

/**
 * Get all items that appear in recipes
 * @returns {Array} Array of item IDs
 */
function getAllRecipeItems() {
  const recipes = loadRecipes();
  const itemSet = new Set();

  recipes.forEach(recipe => {
    recipe.grid.forEach(row => {
      row.forEach(cell => {
        if (cell !== null) {
          itemSet.add(cell);
        }
      });
    });
  });

  return Array.from(itemSet);
}

/**
 * Get items by category
 * @param {string} category - Category name
 * @returns {Array} Array of items
 */
function getItemsByCategory(category) {
  const items = loadItems();
  return Object.values(items).filter(item => item.category === category);
}

/**
 * Validate a recipe grid
 * @param {Array} grid - 3x3 array of item IDs
 * @returns {boolean} Is valid
 */
function validateRecipeGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== 3) {
    return false;
  }

  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== 3) {
      return false;
    }

    for (const cell of row) {
      if (cell !== null && typeof cell !== 'string') {
        return false;
      }
    }
  }

  return true;
}

/**
 * Extract unique items from a recipe grid
 * @param {Array} grid - 3x3 array of item IDs
 * @returns {Array} Unique item IDs
 */
function extractItemsFromGrid(grid) {
  const items = new Set();

  grid.forEach(row => {
    row.forEach(cell => {
      if (cell !== null) {
        items.add(cell);
      }
    });
  });

  return Array.from(items);
}

/**
 * Get a random recipe
 * @param {Object} filters - Optional filters (category, difficulty)
 * @returns {Object|null} Random recipe
 */
function getRandomRecipe(filters = {}) {
  let recipes = loadRecipes();

  // Apply filters
  if (filters.category) {
    recipes = recipes.filter(r => r.category === filters.category);
  }

  if (filters.difficulty) {
    recipes = recipes.filter(r => r.difficulty === filters.difficulty);
  }

  if (filters.minItems) {
    recipes = recipes.filter(r => {
      const uniqueItems = extractItemsFromGrid(r.grid);
      return uniqueItems.length >= filters.minItems;
    });
  }

  if (recipes.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * recipes.length);
  return recipes[randomIndex];
}

/**
 * Get statistics about recipes
 * @returns {Object} Statistics
 */
function getRecipeStatistics() {
  const recipes = loadRecipes();
  const items = loadItems();

  const stats = {
    totalRecipes: recipes.length,
    totalItems: Object.keys(items).length,
    byDifficulty: {
      easy: recipes.filter(r => r.difficulty === 'easy').length,
      medium: recipes.filter(r => r.difficulty === 'medium').length,
      hard: recipes.filter(r => r.difficulty === 'hard').length,
    },
    byCategory: {},
  };

  // Count by category
  recipes.forEach(recipe => {
    if (!stats.byCategory[recipe.category]) {
      stats.byCategory[recipe.category] = 0;
    }
    stats.byCategory[recipe.category]++;
  });

  return stats;
}

/**
 * Clear cache (useful for reloading data)
 */
function clearCache() {
  recipesCache = null;
  itemsCache = null;
  console.log('[Craftle] Cache cleared');
}

module.exports = {
  loadRecipes,
  loadItems,
  getRecipeById,
  getItemById,
  getRecipesByCategory,
  getRecipesByDifficulty,
  getAllRecipeItems,
  getItemsByCategory,
  validateRecipeGrid,
  extractItemsFromGrid,
  getRandomRecipe,
  getRecipeStatistics,
  clearCache,
};
