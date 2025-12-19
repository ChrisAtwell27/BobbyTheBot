/**
 * Craftle Game Logic
 * Handles guess validation, feedback generation, and game state checking
 */

/**
 * Validate a guess against the answer recipe
 * @param {Array} guessGrid - 3x3 array of guessed item IDs (or null)
 * @param {Array} answerGrid - 3x3 array of correct item IDs (or null)
 * @returns {Array} 3x3 array of feedback strings
 */
function validateGuess(guessGrid, answerGrid) {
  const feedback = Array(3).fill(null).map(() => Array(3).fill(null));

  // Build a map of items in the answer (for "wrong_position" detection)
  const answerItems = new Map();
  answerGrid.forEach(row => {
    row.forEach(cell => {
      if (cell !== null) {
        answerItems.set(cell, (answerItems.get(cell) || 0) + 1);
      }
    });
  });

  // Track which cells have been matched correctly
  const correctMatches = new Map();

  // First pass: Mark exact matches (green)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const guessedItem = guessGrid[i][j];
      const correctItem = answerGrid[i][j];

      if (guessedItem === correctItem) {
        feedback[i][j] = "correct";
        // Track correct matches to avoid double-counting in second pass
        correctMatches.set(`${i},${j}`, true);

        // Decrease available count for this item
        if (guessedItem !== null) {
          answerItems.set(guessedItem, answerItems.get(guessedItem) - 1);
        }
      }
    }
  }

  // Second pass: Mark wrong position (yellow) and not in recipe (gray)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      // Skip cells already marked as correct
      if (correctMatches.has(`${i},${j}`)) {
        continue;
      }

      const guessedItem = guessGrid[i][j];

      // Empty cell
      if (guessedItem === null) {
        feedback[i][j] = null;
        continue;
      }

      // Check if item exists elsewhere in the recipe
      const remainingCount = answerItems.get(guessedItem) || 0;

      if (remainingCount > 0) {
        feedback[i][j] = "wrong_position";
        answerItems.set(guessedItem, remainingCount - 1);
      } else {
        feedback[i][j] = "not_in_recipe";
      }
    }
  }

  return feedback;
}

/**
 * Check if the guess is completely correct
 * @param {Array} feedback - 3x3 feedback array
 * @returns {boolean} True if all non-null cells are correct
 */
function isSolved(feedback) {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const cell = feedback[i][j];
      // If there's a feedback value and it's not "correct", puzzle is not solved
      if (cell !== null && cell !== "correct") {
        return false;
      }
    }
  }
  return true;
}

/**
 * Check if a grid is valid (3x3 structure)
 * @param {Array} grid - Grid to validate
 * @returns {boolean} True if valid
 */
function isValidGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== 3) {
    return false;
  }

  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== 3) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a grid is complete (all cells filled)
 * @param {Array} grid - Grid to check
 * @returns {boolean} True if all cells have values
 */
function isGridComplete(grid) {
  for (const row of grid) {
    for (const cell of row) {
      if (cell === null) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Count how many cells are filled in a grid
 * @param {Array} grid - Grid to count
 * @returns {number} Number of filled cells
 */
function countFilledCells(grid) {
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
 * Get unique items from a grid
 * @param {Array} grid - Grid to extract from
 * @returns {Set} Set of unique item IDs
 */
function getUniqueItems(grid) {
  const items = new Set();
  for (const row of grid) {
    for (const cell of row) {
      if (cell !== null) {
        items.add(cell);
      }
    }
  }
  return items;
}

/**
 * Compare two grids for exact equality
 * @param {Array} grid1 - First grid
 * @param {Array} grid2 - Second grid
 * @returns {boolean} True if grids are identical
 */
function areGridsEqual(grid1, grid2) {
  if (!isValidGrid(grid1) || !isValidGrid(grid2)) {
    return false;
  }

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (grid1[i][j] !== grid2[i][j]) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Create an empty 3x3 grid
 * @returns {Array} Empty grid filled with nulls
 */
function createEmptyGrid() {
  return Array(3).fill(null).map(() => Array(3).fill(null));
}

/**
 * Clone a grid (deep copy)
 * @param {Array} grid - Grid to clone
 * @returns {Array} Cloned grid
 */
function cloneGrid(grid) {
  return grid.map(row => [...row]);
}

/**
 * Get feedback summary for a guess
 * @param {Array} feedback - Feedback grid
 * @returns {Object} Summary with counts
 */
function getFeedbackSummary(feedback) {
  const summary = {
    correct: 0,
    wrongPosition: 0,
    notInRecipe: 0,
    empty: 0,
  };

  for (const row of feedback) {
    for (const cell of row) {
      if (cell === "correct") {
        summary.correct++;
      } else if (cell === "wrong_position") {
        summary.wrongPosition++;
      } else if (cell === "not_in_recipe") {
        summary.notInRecipe++;
      } else if (cell === null) {
        summary.empty++;
      }
    }
  }

  return summary;
}

/**
 * Calculate accuracy percentage for a guess
 * @param {Array} feedback - Feedback grid
 * @returns {number} Percentage (0-100)
 */
function calculateAccuracy(feedback) {
  const summary = getFeedbackSummary(feedback);
  const totalFilled = 9 - summary.empty;

  if (totalFilled === 0) {
    return 0;
  }

  return Math.round((summary.correct / totalFilled) * 100);
}

/**
 * Generate hint based on current progress
 * @param {Array} answerGrid - Correct answer
 * @param {Array} guesses - Array of previous guess grids
 * @returns {string} Hint text
 */
function generateHint(answerGrid, guesses) {
  // Get all items that have been tried
  const triedItems = new Set();
  guesses.forEach(guess => {
    getUniqueItems(guess.grid).forEach(item => triedItems.add(item));
  });

  // Get items in the answer
  const answerItems = getUniqueItems(answerGrid);

  // Find an item that's in the answer but hasn't been tried yet
  const untriedAnswerItems = Array.from(answerItems).filter(item => !triedItems.has(item));

  if (untriedAnswerItems.length > 0) {
    return `Hint: The recipe contains ${untriedAnswerItems[0]}`;
  }

  // If all items have been tried, give a position hint
  const incorrectPositions = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (answerGrid[i][j] !== null) {
        const lastGuess = guesses[guesses.length - 1];
        if (lastGuess && lastGuess.grid[i][j] !== answerGrid[i][j]) {
          incorrectPositions.push({ item: answerGrid[i][j], row: i, col: j });
        }
      }
    }
  }

  if (incorrectPositions.length > 0) {
    const hint = incorrectPositions[0];
    return `Hint: Try placing ${hint.item} at row ${hint.row + 1}, column ${hint.col + 1}`;
  }

  return "You're very close! Double-check your item placements.";
}

module.exports = {
  validateGuess,
  isSolved,
  isValidGrid,
  isGridComplete,
  countFilledCells,
  getUniqueItems,
  areGridsEqual,
  createEmptyGrid,
  cloneGrid,
  getFeedbackSummary,
  calculateAccuracy,
  generateHint,
};
