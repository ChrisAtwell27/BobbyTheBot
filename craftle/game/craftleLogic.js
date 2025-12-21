/**
 * Craftle Game Logic
 * Handles guess validation, feedback generation, and game state checking
 */

/**
 * Calculate the shift needed to align answer pattern to player's guess pattern
 * We align by top-left corners so the first item matches the player's first placement
 * @param {Array} guessGrid - Player's guess grid
 * @param {Array} answerGrid - Answer grid to align
 * @returns {Object} { rowShift, colShift } to apply to answer positions, or null if either is empty
 */
function getAlignmentShift(guessGrid, answerGrid) {
  const guessBounds = getGridBounds(guessGrid);
  const answerBounds = getGridBounds(answerGrid);

  if (!guessBounds || !answerBounds) return null;

  // Align by top-left corners of the patterns
  // This makes the first placed item align with where the answer expects its first item
  // Shift = guessTL - answerTL (how much to move answer to align with guess)
  return {
    rowShift: guessBounds.minRow - answerBounds.minRow,
    colShift: guessBounds.minCol - answerBounds.minCol
  };
}

/**
 * Validate a guess against the answer recipe
 * The guess pattern is aligned to match the answer pattern position
 * Feedback is shown in the player's coordinate space, with "missing" markers
 * showing where additional items should be placed relative to what they placed
 * @param {Array} guessGrid - 3x3 array of guessed item IDs (or null)
 * @param {Array} answerGrid - 3x3 array of correct item IDs (or null)
 * @returns {Array} 3x3 array of feedback strings (in player's positions)
 */
function validateGuess(guessGrid, answerGrid) {
  // Start with all cells as "correct" (empty cells are valid)
  const feedback = Array(3).fill(null).map(() => Array(3).fill("correct"));

  // Get alignment shift - how much to shift guess pattern to align with answer
  const shift = getAlignmentShift(guessGrid, answerGrid);

  // If guess is empty, just return all correct (player hasn't placed anything yet)
  if (!shift) {
    return feedback;
  }

  // Create an aligned version of the answer for comparison in player's space
  // This shifts the answer to match where the player placed their items
  const alignedAnswer = createEmptyGrid();
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (answerGrid[i][j] !== null) {
        // Shift answer position to align with player's placement
        const alignedRow = i + shift.rowShift;
        const alignedCol = j + shift.colShift;

        if (alignedRow >= 0 && alignedRow < 3 && alignedCol >= 0 && alignedCol < 3) {
          alignedAnswer[alignedRow][alignedCol] = answerGrid[i][j];
        }
      }
    }
  }

  // Build a map of items in the answer (for "wrong_position" detection)
  const answerItems = new Map();
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const cell = alignedAnswer[i][j];
      if (cell !== null) {
        answerItems.set(cell, (answerItems.get(cell) || 0) + 1);
      }
    }
  }

  // Track which cells have exact matches
  const correctMatches = new Set();

  // First pass: Check exact item matches
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const guessedItem = guessGrid[i][j];
      const correctItem = alignedAnswer[i][j];

      if (guessedItem !== null && guessedItem === correctItem) {
        feedback[i][j] = "correct";
        correctMatches.add(`${i},${j}`);
        answerItems.set(guessedItem, answerItems.get(guessedItem) - 1);
      }
    }
  }

  // Second pass: Handle non-matching cells
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (correctMatches.has(`${i},${j}`)) continue;

      const guessedItem = guessGrid[i][j];
      const correctItem = alignedAnswer[i][j];

      // Both empty - correct (empty matches empty)
      if (guessedItem === null && correctItem === null) {
        feedback[i][j] = "correct";
        continue;
      }

      // Empty guess where item is expected - mark as "missing"
      if (guessedItem === null && correctItem !== null) {
        feedback[i][j] = "missing";
        continue;
      }

      // Item placed where should be empty
      if (guessedItem !== null && correctItem === null) {
        const remainingCount = answerItems.get(guessedItem) || 0;
        if (remainingCount > 0) {
          feedback[i][j] = "wrong_position";
          answerItems.set(guessedItem, remainingCount - 1);
        } else {
          feedback[i][j] = "not_in_recipe";
        }
        continue;
      }

      // Both have items but they don't match
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
 * @returns {boolean} True if all cells are "correct"
 */
function isSolved(feedback) {
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const cell = feedback[i][j];
      // All cells must be "correct" (items match OR both empty)
      if (cell !== "correct") {
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
 * Get the bounding box of non-null items in a grid
 * @param {Array} grid - 3x3 grid
 * @returns {Object} { minRow, maxRow, minCol, maxCol } or null if empty
 */
function getGridBounds(grid) {
  let minRow = 3, maxRow = -1, minCol = 3, maxCol = -1;

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (grid[i][j] !== null) {
        minRow = Math.min(minRow, i);
        maxRow = Math.max(maxRow, i);
        minCol = Math.min(minCol, j);
        maxCol = Math.max(maxCol, j);
      }
    }
  }

  if (maxRow === -1) return null; // Empty grid

  return { minRow, maxRow, minCol, maxCol };
}

/**
 * Normalize a grid by shifting items to bottom-right
 * This allows matching recipes placed anywhere in the grid
 * @param {Array} grid - 3x3 grid
 * @returns {Array} Normalized grid (bottom-right aligned)
 */
function normalizeGrid(grid) {
  const bounds = getGridBounds(grid);
  if (!bounds) return cloneGrid(grid); // Empty grid

  const { minRow, maxRow, minCol, maxCol } = bounds;
  const height = maxRow - minRow + 1;
  const width = maxCol - minCol + 1;

  // Calculate shift needed to move to bottom-right
  const rowShift = (3 - height) - minRow;
  const colShift = (3 - width) - minCol;

  // Create new grid with shifted positions
  const normalized = createEmptyGrid();

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (grid[i][j] !== null) {
        const newRow = i + rowShift;
        const newCol = j + colShift;
        if (newRow >= 0 && newRow < 3 && newCol >= 0 && newCol < 3) {
          normalized[newRow][newCol] = grid[i][j];
        }
      }
    }
  }

  return normalized;
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
  getGridBounds,
  normalizeGrid,
  getFeedbackSummary,
  calculateAccuracy,
  generateHint,
};
