const { loadRecipes, loadItems, extractItemsFromGrid } = require('./itemLoader');
const convex = require('../../utils/convexClient');
const { api } = require('../../convex/_generated/api');

/**
 * Craftle Daily Puzzle Generator
 * Generates daily puzzles at midnight UTC with difficulty rotation
 */

/**
 * Seeded random number generator for consistent daily randomness
 * @param {string} seed - Seed string (e.g., date)
 * @returns {function} Random function that returns 0-1
 */
function seededRandom(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }

  return function() {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    return hash / 0x7fffffff;
  };
}

/**
 * Shuffle array using seeded random
 * @param {Array} array - Array to shuffle
 * @param {function} random - Seeded random function
 * @returns {Array} Shuffled array
 */
function seededShuffle(array, random) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Get the difficulty for a specific date
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {string} Difficulty level
 */
function getDifficultyForDate(date) {
  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 6 = Saturday

  // Weekend = Easy
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 'easy';
  }

  // Wednesday = Hard (mid-week challenge)
  if (dayOfWeek === 3) {
    return 'hard';
  }

  // Monday, Tuesday, Thursday, Friday = Medium
  return 'medium';
}

/**
 * Count total items in a grid (including duplicates)
 * @param {Array} grid - 3x3 grid
 * @returns {number} Total item count
 */
function countGridItems(grid) {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell !== null) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Select daily items and a recipe that uses them
 * Each day gets a random set of ~25 items + one recipe that can be made from them
 * @param {string} date - Date string for seeding randomness
 * @param {string} difficulty - Desired difficulty
 * @returns {Object} { recipe, dailyItems }
 */
function selectDailyPuzzle(date, difficulty) {
  const random = seededRandom(date + '-craftle');
  const allRecipes = loadRecipes();
  const allItems = loadItems();
  const allItemIds = Object.keys(allItems);

  // Filter recipes by difficulty AND minimum item count (exclude trivial 2-3 item recipes)
  let eligibleRecipes = allRecipes.filter(r => {
    const matchesDifficulty = r.difficulty === difficulty;
    const itemCount = countGridItems(r.grid);
    // Require at least 4 items to make the puzzle interesting
    return matchesDifficulty && itemCount >= 4;
  });

  // Fallback: if no recipes match, try without difficulty filter
  if (eligibleRecipes.length === 0) {
    eligibleRecipes = allRecipes.filter(r => countGridItems(r.grid) >= 4);
  }

  // Final fallback: use all recipes if still empty
  if (eligibleRecipes.length === 0) {
    eligibleRecipes = allRecipes;
  }

  // Shuffle recipes for this day
  const shuffledRecipes = seededShuffle(eligibleRecipes, random);

  // Pick the first recipe
  const recipe = shuffledRecipes[0];

  // Get items needed for this recipe
  const recipeItems = extractItemsFromGrid(recipe.grid);

  // Start with recipe items, then add random decoys to reach ~25 total
  const dailyItemsSet = new Set(recipeItems);

  // Shuffle all items and add decoys
  const shuffledAllItems = seededShuffle(allItemIds, random);
  for (const itemId of shuffledAllItems) {
    if (dailyItemsSet.size >= 25) break;
    dailyItemsSet.add(itemId);
  }

  // Convert to array and shuffle again so recipe items aren't always first
  const dailyItems = seededShuffle(Array.from(dailyItemsSet), random);

  return { recipe, dailyItems };
}

/**
 * Generate today's puzzle
 * @param {string} date - Date string (YYYY-MM-DD), defaults to today
 * @returns {Promise<Object>} Created puzzle
 */
async function generateDailyPuzzle(date = null) {
  try {
    // Use provided date or current UTC date
    if (!date) {
      const now = new Date();
      date = now.toISOString().split('T')[0]; // "YYYY-MM-DD"
    }

    const puzzleId = `craftle-${date}`;

    // Check if puzzle already exists
    const existingPuzzle = await convex.query(api.craftle.getPuzzleByDate, { date });
    if (existingPuzzle) {
      console.log(`[Craftle] Puzzle for ${date} already exists`);
      return existingPuzzle;
    }

    // Get difficulty for this date
    const difficulty = getDifficultyForDate(date);

    // Select recipe and daily items using seeded random
    const { recipe, dailyItems } = selectDailyPuzzle(date, difficulty);

    if (!recipe) {
      console.error(`[Craftle] No recipe found for difficulty ${difficulty}`);
      return null;
    }

    // Extract items from recipe grid (for metadata)
    const recipeItems = extractItemsFromGrid(recipe.grid);

    // Create puzzle in database
    const createdPuzzleId = await convex.mutation(api.craftle.createPuzzle, {
      puzzleId,
      date,
      recipe: {
        id: recipe.id,
        output: recipe.output,
        outputCount: recipe.outputCount || 1,
        grid: recipe.grid,
        category: recipe.category,
        difficulty: recipe.difficulty,
        description: recipe.description || '',
      },
      metadata: {
        difficulty,
        category: recipe.category,
        recipeItems,
        dailyItems, // The 25 random items for today
      },
    });

    console.log(
      `[Craftle] Generated puzzle for ${date}: ${recipe.output} (${difficulty}) - ${dailyItems.length} daily items`
    );

    return {
      _id: createdPuzzleId,
      puzzleId,
      date,
      recipe,
      metadata: {
        difficulty,
        category: recipe.category,
        recipeItems,
        dailyItems,
      },
    };
  } catch (error) {
    console.error('[Craftle] Error generating daily puzzle:', error);
    return null;
  }
}

/**
 * Get today's puzzle (creates if doesn't exist)
 * @returns {Promise<Object|null>} Today's puzzle
 */
async function getTodaysPuzzle() {
  const today = new Date().toISOString().split('T')[0];

  // Try to get existing puzzle
  let puzzle = await convex.query(api.craftle.getPuzzleByDate, { date: today });

  // Generate if doesn't exist
  if (!puzzle) {
    const generated = await generateDailyPuzzle(today);
    if (generated) {
      puzzle = await convex.query(api.craftle.getPuzzleByDate, { date: today });
    }
  }

  return puzzle;
}

/**
 * Get puzzle by date
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {Promise<Object|null>} Puzzle for that date
 */
async function getPuzzleByDate(date) {
  return await convex.query(api.craftle.getPuzzleByDate, { date });
}

/**
 * Get the puzzle number (days since Craftle epoch)
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {number} Puzzle number
 */
function getPuzzleNumber(date) {
  // Craftle epoch: December 19, 2025
  const epoch = new Date('2025-12-19');
  const puzzleDate = new Date(date);

  const diffTime = puzzleDate.getTime() - epoch.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  return diffDays + 1; // Puzzle #1 on epoch day
}

/**
 * Check if it's time to generate a new puzzle (midnight UTC check)
 * @returns {boolean} True if we should generate a new puzzle
 */
function shouldGenerateNewPuzzle() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();

  // Check if it's within the first 5 minutes of midnight UTC
  return utcHour === 0 && utcMinute < 5;
}

/**
 * Start the puzzle generation cron job
 * Checks every minute for midnight UTC
 */
function startPuzzleGenerationCron() {
  console.log('[Craftle] Starting puzzle generation cron');

  // Run immediately on start
  getTodaysPuzzle();

  // Then check every minute
  setInterval(async () => {
    if (shouldGenerateNewPuzzle()) {
      console.log('[Craftle] Midnight UTC detected - generating new puzzle');
      await generateDailyPuzzle();
    }
  }, 60000); // Check every minute
}

/**
 * Pre-generate puzzles for the next N days
 * @param {number} days - Number of days to pre-generate
 * @returns {Promise<Array>} Generated puzzles
 */
async function preGeneratePuzzles(days = 7) {
  const puzzles = [];

  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dateString = date.toISOString().split('T')[0];

    const puzzle = await generateDailyPuzzle(dateString);
    if (puzzle) {
      puzzles.push(puzzle);
    }
  }

  console.log(`[Craftle] Pre-generated ${puzzles.length} puzzles`);
  return puzzles;
}

module.exports = {
  generateDailyPuzzle,
  getTodaysPuzzle,
  getPuzzleByDate,
  getPuzzleNumber,
  getDifficultyForDate,
  shouldGenerateNewPuzzle,
  startPuzzleGenerationCron,
  preGeneratePuzzles,
};
