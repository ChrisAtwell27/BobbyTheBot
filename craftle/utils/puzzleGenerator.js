const { getRandomRecipe, extractItemsFromGrid } = require('./itemLoader');
const convex = require('../../utils/convexClient');
const { api } = require('../../convex/_generated/api');

/**
 * Craftle Daily Puzzle Generator
 * Generates daily puzzles at midnight UTC with difficulty rotation
 */

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

    // Select a random recipe with appropriate difficulty
    const recipe = getRandomRecipe({
      difficulty,
      minItems: 3, // At least 3 unique items for interesting gameplay
    });

    if (!recipe) {
      console.error(`[Craftle] No recipe found for difficulty ${difficulty}`);
      return null;
    }

    // Extract items from recipe grid
    const commonItems = extractItemsFromGrid(recipe.grid);

    // Create puzzle in database
    const createdPuzzleId = await convex.mutation(api.craftle.createPuzzle, {
      puzzleId,
      date,
      recipe: {
        id: recipe.id,
        output: recipe.output,
        outputCount: recipe.outputCount,
        grid: recipe.grid,
        category: recipe.category,
        difficulty: recipe.difficulty,
        description: recipe.description,
      },
      metadata: {
        difficulty,
        category: recipe.category,
        commonItems,
      },
    });

    console.log(
      `[Craftle] Generated puzzle for ${date}: ${recipe.output} (${difficulty}) - ${commonItems.length} items`
    );

    return {
      _id: createdPuzzleId,
      puzzleId,
      date,
      recipe,
      metadata: {
        difficulty,
        category: recipe.category,
        commonItems,
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
