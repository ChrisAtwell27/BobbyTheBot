const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getItemById } = require('../utils/itemLoader');
const { getPuzzleNumber } = require('../utils/puzzleGenerator');
const {
  createGridImage,
  createGameDisplayImage,
  createAnswerRevealImage,
  createGuessHistoryImage,
} = require('../utils/craftleCanvasUtils');

/**
 * Craftle Discord Embeds
 * Creates visual displays for the game
 */

// Color constants
const COLORS = {
  PRIMARY: '#8B4513', // Brown (Minecraft dirt color)
  SUCCESS: '#00FF00', // Green
  WARNING: '#FFA500', // Orange
  ERROR: '#FF0000', // Red
  INFO: '#00BFFF', // Blue
};

// Emoji constants
const EMOJIS = {
  CORRECT: '🟩',
  WRONG_POSITION: '🟨',
  NOT_IN_RECIPE: '⬜',
  MISSING: '🟥', // Red for missing item (empty cell where item should be)
  EMPTY: '⬛',
  PICKAXE: '⛏️',
  HONEY: '🍯',
  TROPHY: '🏆',
  FIRE: '🔥',
  STAR: '⭐',
};

/**
 * Build the game grid display
 * @param {Array} guesses - Array of guess objects with grid and feedback
 * @param {number} attempts - Current attempt number
 * @param {boolean} showItems - Whether to show item names
 * @returns {string} Grid display string
 */
function buildGridDisplay(guesses, attempts, showItems = false) {
  let display = '';

  // Show all previous guesses
  for (let guessIdx = 0; guessIdx < guesses.length; guessIdx++) {
    const guess = guesses[guessIdx];
    const feedback = guess.feedback;

    if (showItems) {
      // Show item names with feedback colors
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const itemId = guess.grid[i][j];
          const fb = feedback[i][j];

          if (fb === 'correct') {
            display += EMOJIS.CORRECT;
          } else if (fb === 'wrong_position') {
            display += EMOJIS.WRONG_POSITION;
          } else if (fb === 'missing') {
            display += EMOJIS.MISSING;
          } else if (fb === 'not_in_recipe') {
            display += EMOJIS.NOT_IN_RECIPE;
          } else {
            display += EMOJIS.EMPTY;
          }
        }
        display += '\n';
      }
    } else {
      // Show only feedback colors
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const fb = feedback[i][j];

          if (fb === 'correct') {
            display += EMOJIS.CORRECT;
          } else if (fb === 'wrong_position') {
            display += EMOJIS.WRONG_POSITION;
          } else if (fb === 'missing') {
            display += EMOJIS.MISSING;
          } else if (fb === 'not_in_recipe') {
            display += EMOJIS.NOT_IN_RECIPE;
          } else {
            display += EMOJIS.EMPTY;
          }
        }
        display += '\n';
      }
    }

    // Add space between guesses
    if (guessIdx < guesses.length - 1) {
      display += '\n';
    }
  }

  // Show remaining empty attempts
  const remaining = 6 - guesses.length;
  if (remaining > 0) {
    display += '\n';
    for (let r = 0; r < remaining; r++) {
      for (let i = 0; i < 3; i++) {
        display += EMOJIS.EMPTY + EMOJIS.EMPTY + EMOJIS.EMPTY + '\n';
      }
      if (r < remaining - 1) {
        display += '\n';
      }
    }
  }

  return display;
}

/**
 * Create the main game embed
 * @param {Object} puzzle - Puzzle object
 * @param {Object} progress - User progress object
 * @returns {EmbedBuilder} Game embed
 */
function createGameEmbed(puzzle, progress) {
  const puzzleNum = getPuzzleNumber(puzzle.date);
  const attempts = progress ? progress.attempts : 0;
  const guesses = progress ? progress.guesses : [];
  const solved = progress ? progress.solved : false;

  const embed = new EmbedBuilder()
    .setColor(solved ? COLORS.SUCCESS : COLORS.PRIMARY)
    .setTitle(`${EMOJIS.PICKAXE} Daily Craftle - Puzzle #${puzzleNum}`)
    .setDescription(
      solved
        ? `✅ **SOLVED!** You guessed the recipe in ${attempts} attempt${attempts !== 1 ? 's' : ''}!`
        : `Guess the Minecraft crafting recipe!\nAttempts: ${attempts}/6`
    );

  // Add grid display
  if (guesses.length > 0) {
    const gridDisplay = buildGridDisplay(guesses, attempts);
    embed.addFields({
      name: 'Your Guesses',
      value: gridDisplay || 'No guesses yet',
      inline: false,
    });
  }

  // Add hints
  if (!solved && attempts > 0 && attempts < 6) {
    const lastFeedback = guesses[guesses.length - 1]?.feedback;
    const correctCount = lastFeedback
      ? lastFeedback.flat().filter(f => f === 'correct').length
      : 0;
    const wrongPositionCount = lastFeedback
      ? lastFeedback.flat().filter(f => f === 'wrong_position').length
      : 0;

    embed.addFields({
      name: 'Last Guess',
      value: `${EMOJIS.CORRECT} Correct: ${correctCount}\n${EMOJIS.WRONG_POSITION} Wrong Position: ${wrongPositionCount}`,
      inline: false,
    });
  }

  // Add difficulty badge
  const difficultyBadge = {
    easy: '🟢 Easy',
    medium: '🟡 Medium',
    hard: '🔴 Hard',
  }[puzzle.metadata.difficulty];

  embed.addFields({
    name: 'Difficulty',
    value: difficultyBadge,
    inline: true,
  });

  // Add category
  embed.addFields({
    name: 'Category',
    value: puzzle.recipe.category.charAt(0).toUpperCase() + puzzle.recipe.category.slice(1),
    inline: true,
  });

  embed.setFooter({
    text: solved
      ? 'Use !craftle stats to see your statistics'
      : 'Use the buttons below to make your guess',
  });

  return embed;
}

/**
 * Create the main game embed with canvas image (uses real Minecraft textures)
 * @param {Object} puzzle - Puzzle object
 * @param {Object} progress - User progress object
 * @param {Array} currentGrid - Current guess grid (3x3)
 * @returns {Promise<{embed: EmbedBuilder, files: AttachmentBuilder[]}>} Embed with attached image
 */
async function createGameEmbedWithCanvas(puzzle, progress, currentGrid = null) {
  const puzzleNum = getPuzzleNumber(puzzle.date);
  const attempts = progress ? progress.attempts : 0;
  const guesses = progress ? progress.guesses : [];
  const solved = progress ? progress.solved : false;

  // Create the grid image
  const grid = currentGrid || [[null, null, null], [null, null, null], [null, null, null]];
  const lastFeedback = guesses.length > 0 ? guesses[guesses.length - 1].feedback : null;

  const gridBuffer = await createGridImage(grid, lastFeedback);
  const attachment = new AttachmentBuilder(gridBuffer, { name: 'craftle-grid.png' });

  const embed = new EmbedBuilder()
    .setColor(solved ? COLORS.SUCCESS : COLORS.PRIMARY)
    .setTitle(`${EMOJIS.PICKAXE} Daily Craftle - Puzzle #${puzzleNum}`)
    .setDescription(
      solved
        ? `✅ **SOLVED!** You guessed the recipe in ${attempts} attempt${attempts !== 1 ? 's' : ''}!`
        : `Guess the Minecraft crafting recipe!\n**Attempts:** ${attempts}/6`
    )
    .setImage('attachment://craftle-grid.png');

  // Add difficulty badge
  const difficultyBadge = {
    easy: '🟢 Easy',
    medium: '🟡 Medium',
    hard: '🔴 Hard',
  }[puzzle.metadata?.difficulty] || '🟢 Easy';

  embed.addFields(
    {
      name: 'Difficulty',
      value: difficultyBadge,
      inline: true,
    },
    {
      name: 'Category',
      value: (puzzle.recipe.category || 'misc').charAt(0).toUpperCase() + (puzzle.recipe.category || 'misc').slice(1),
      inline: true,
    }
  );

  // Add hints after first guess
  if (!solved && attempts > 0 && attempts < 6) {
    const lastGuess = guesses[guesses.length - 1];
    if (lastGuess?.feedback) {
      const correctCount = lastGuess.feedback.flat().filter(f => f === 'correct').length;
      const wrongPositionCount = lastGuess.feedback.flat().filter(f => f === 'wrong_position').length;

      embed.addFields({
        name: 'Last Guess Feedback',
        value: `${EMOJIS.CORRECT} Correct: ${correctCount} | ${EMOJIS.WRONG_POSITION} Wrong Position: ${wrongPositionCount}`,
        inline: false,
      });
    }
  }

  embed.setFooter({
    text: solved
      ? 'Use !craftle stats to see your statistics'
      : 'Select items below and submit your guess!',
  });

  return { embed, files: [attachment] };
}

/**
 * Create the result embed with canvas image (shown after completing)
 * @param {Object} puzzle - Puzzle object
 * @param {Object} progress - User progress object
 * @param {number} reward - Currency reward amount
 * @returns {Promise<{embed: EmbedBuilder, files: AttachmentBuilder[]}>} Result embed with image
 */
async function createResultEmbedWithCanvas(puzzle, progress, reward) {
  const puzzleNum = getPuzzleNumber(puzzle.date);
  const solved = progress.solved;
  const attempts = progress.attempts;

  // Create the answer reveal image
  const answerBuffer = await createAnswerRevealImage(puzzle.recipe);
  const attachment = new AttachmentBuilder(answerBuffer, { name: 'craftle-answer.png' });

  const embed = new EmbedBuilder()
    .setColor(solved ? COLORS.SUCCESS : COLORS.WARNING)
    .setTitle(
      solved
        ? `${EMOJIS.STAR} Puzzle #${puzzleNum} Solved!`
        : `${EMOJIS.FIRE} Puzzle #${puzzleNum} Complete`
    )
    .setDescription(
      solved
        ? `You crafted **${puzzle.recipe.output}** in ${attempts} attempt${attempts !== 1 ? 's' : ''}!`
        : `You used all 6 attempts. The recipe was **${puzzle.recipe.output}**.`
    )
    .setImage('attachment://craftle-answer.png');

  // Add reward info
  if (reward > 0) {
    embed.addFields({
      name: 'Reward',
      value: `${EMOJIS.HONEY} **+${reward.toLocaleString()}** honey`,
      inline: true,
    });
  }

  // Add share text
  const shareText = generateShareText(puzzleNum, progress.guesses, solved);
  embed.addFields({
    name: 'Share Your Result',
    value: `\`\`\`${shareText}\`\`\``,
    inline: false,
  });

  embed.setFooter({
    text: 'Come back tomorrow for a new puzzle!',
  });

  return { embed, files: [attachment] };
}

/**
 * Create the result embed (shown after completing)
 * @param {Object} puzzle - Puzzle object
 * @param {Object} progress - User progress object
 * @param {number} reward - Currency reward amount
 * @returns {EmbedBuilder} Result embed
 */
function createResultEmbed(puzzle, progress, reward) {
  const puzzleNum = getPuzzleNumber(puzzle.date);
  const solved = progress.solved;
  const attempts = progress.attempts;

  const embed = new EmbedBuilder()
    .setColor(solved ? COLORS.SUCCESS : COLORS.WARNING)
    .setTitle(
      solved
        ? `${EMOJIS.STAR} Puzzle #${puzzleNum} Solved!`
        : `${EMOJIS.FIRE} Puzzle #${puzzleNum} Complete`
    )
    .setDescription(
      solved
        ? `You crafted **${puzzle.recipe.output}** in ${attempts} attempt${attempts !== 1 ? 's' : ''}!`
        : `You used all 6 attempts. The recipe was **${puzzle.recipe.output}**.`
    );

  // Show the answer grid
  let answerDisplay = `**Recipe for ${puzzle.recipe.output}:**\n`;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const itemId = puzzle.recipe.grid[i][j];
      if (itemId) {
        const item = getItemById(itemId);
        answerDisplay += item?.emoji || '🟫';
      } else {
        answerDisplay += '⬜';
      }
    }
    answerDisplay += '\n';
  }

  embed.addFields({
    name: 'Answer',
    value: answerDisplay,
    inline: false,
  });

  // Add reward info
  if (reward > 0) {
    embed.addFields({
      name: 'Reward',
      value: `${EMOJIS.HONEY} **+${reward.toLocaleString()}** honey`,
      inline: true,
    });
  }

  // Add share text
  const shareText = generateShareText(puzzleNum, progress.guesses, solved);
  embed.addFields({
    name: 'Share Your Result',
    value: `\`\`\`${shareText}\`\`\``,
    inline: false,
  });

  embed.setFooter({
    text: 'Come back tomorrow for a new puzzle!',
  });

  return embed;
}

/**
 * Generate share text (Wordle-style)
 * @param {number} puzzleNum - Puzzle number
 * @param {Array} guesses - Array of guesses
 * @param {boolean} solved - Whether puzzle was solved
 * @returns {string} Share text
 */
function generateShareText(puzzleNum, guesses, solved) {
  let shareText = `${EMOJIS.PICKAXE} Craftle #${puzzleNum} ${solved ? guesses.length : 'X'}/6\n\n`;

  for (const guess of guesses) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const fb = guess.feedback[i][j];
        if (fb === 'correct') {
          shareText += EMOJIS.CORRECT;
        } else if (fb === 'wrong_position') {
          shareText += EMOJIS.WRONG_POSITION;
        } else {
          shareText += EMOJIS.NOT_IN_RECIPE;
        }
      }
      shareText += '\n';
    }
    shareText += '\n';
  }

  return shareText.trim();
}

/**
 * Create user stats embed
 * @param {Object} stats - User stats object
 * @param {Object} user - Discord user object
 * @returns {EmbedBuilder} Stats embed
 */
function createStatsEmbed(stats, user) {
  const winRate = stats.totalAttempts > 0 ? (stats.totalSolved / stats.totalAttempts) * 100 : 0;

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`${EMOJIS.TROPHY} Craftle Stats - ${user.displayName}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      {
        name: 'Games Played',
        value: stats.totalAttempts.toString(),
        inline: true,
      },
      {
        name: 'Games Won',
        value: stats.totalSolved.toString(),
        inline: true,
      },
      {
        name: 'Win Rate',
        value: `${Math.round(winRate)}%`,
        inline: true,
      },
      {
        name: 'Current Streak',
        value: `${EMOJIS.FIRE} ${stats.currentStreak} day${stats.currentStreak !== 1 ? 's' : ''}`,
        inline: true,
      },
      {
        name: 'Longest Streak',
        value: `${EMOJIS.STAR} ${stats.longestStreak} day${stats.longestStreak !== 1 ? 's' : ''}`,
        inline: true,
      },
      {
        name: 'Avg. Attempts',
        value: stats.averageAttempts > 0 ? stats.averageAttempts.toFixed(1) : '0',
        inline: true,
      },
      {
        name: 'Total Honey Earned',
        value: `${EMOJIS.HONEY} ${stats.totalHoneyEarned.toLocaleString()}`,
        inline: false,
      }
    );

  // Add guess distribution
  const distDisplay = buildDistributionDisplay(stats.distribution);
  embed.addFields({
    name: 'Guess Distribution',
    value: distDisplay,
    inline: false,
  });

  return embed;
}

/**
 * Build distribution display
 * @param {Object} distribution - Distribution object
 * @returns {string} Distribution display
 */
function buildDistributionDisplay(distribution) {
  const maxCount = Math.max(
    distribution.solve1,
    distribution.solve2,
    distribution.solve3,
    distribution.solve4,
    distribution.solve5,
    distribution.solve6,
    distribution.fail
  );

  let display = '';
  for (let i = 1; i <= 6; i++) {
    const key = `solve${i}`;
    const count = distribution[key] || 0;
    const barLength = maxCount > 0 ? Math.round((count / maxCount) * 10) : 0;
    const bar = '█'.repeat(barLength) || '░';

    display += `${i}: ${bar} ${count}\n`;
  }

  // Add fail row
  const failCount = distribution.fail || 0;
  const failBarLength = maxCount > 0 ? Math.round((failCount / maxCount) * 10) : 0;
  const failBar = '█'.repeat(failBarLength) || '░';
  display += `X: ${failBar} ${failCount}`;

  return `\`\`\`\n${display}\n\`\`\``;
}

/**
 * Create leaderboard embed
 * @param {string} guildName - Guild name
 * @param {Array} rankings - Rankings array
 * @param {string} type - Leaderboard type
 * @param {Object} client - Discord client
 * @returns {Promise<EmbedBuilder>} Leaderboard embed
 */
async function createLeaderboardEmbed(guildName, rankings, type, client) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.PRIMARY)
    .setTitle(`${EMOJIS.TROPHY} Craftle Leaderboard - ${guildName}`)
    .setDescription(
      type === 'daily'
        ? "Today's Top Players"
        : type === 'weekly'
        ? 'This Week\'s Top Players'
        : type === 'monthly'
        ? 'This Month\'s Top Players'
        : 'All-Time Top Players'
    );

  if (rankings.length === 0) {
    embed.addFields({
      name: 'No Data',
      value: 'No one has played Craftle yet!',
      inline: false,
    });
    return embed;
  }

  // Build leaderboard display
  let leaderboardText = '';
  for (let i = 0; i < Math.min(rankings.length, 10); i++) {
    const rank = rankings[i];
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;

    // Get display name
    let displayName = rank.displayName;
    try {
      const user = await client.users.fetch(rank.userId);
      displayName = user.displayName || user.username;
    } catch (error) {
      // Keep default if fetch fails
    }

    leaderboardText += `${medal} **${displayName}**\n`;
    leaderboardText += `   ${EMOJIS.STAR} Score: ${rank.score} | Solved: ${rank.solveCount} | Avg: ${rank.averageAttempts}\n`;
  }

  embed.addFields({
    name: 'Rankings',
    value: leaderboardText,
    inline: false,
  });

  embed.setFooter({
    text: 'Play !craftle to improve your rank',
  });

  return embed;
}

/**
 * Create help embed
 * @returns {EmbedBuilder} Help embed
 */
function createHelpEmbed() {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`${EMOJIS.PICKAXE} How to Play Craftle`)
    .setDescription(
      'Craftle is a daily Minecraft crafting recipe guessing game, inspired by Wordle!'
    )
    .addFields(
      {
        name: 'How to Play',
        value:
          '• Guess the crafting recipe in 6 attempts\n' +
          '• Click cells to place items (leave empty cells empty!)\n' +
          '• Place your pattern anywhere - it auto-aligns\n' +
          '• Submit your guess to get color feedback\n' +
          '• Not all recipes use all 9 cells!',
        inline: false,
      },
      {
        name: 'Feedback Colors',
        value:
          `${EMOJIS.CORRECT} **Green**: Correct (item OR empty cell matches)\n` +
          `${EMOJIS.WRONG_POSITION} **Yellow**: Item in recipe but wrong position\n` +
          `${EMOJIS.MISSING} **Red**: Missing item (this cell needs an item)\n` +
          `${EMOJIS.NOT_IN_RECIPE} **White**: Item is not in the recipe`,
        inline: false,
      },
      {
        name: 'Rewards',
        value:
          'Earn honey based on how many attempts you use:\n' +
          `• 1 attempt: ${EMOJIS.HONEY} 5,000\n` +
          `• 2 attempts: ${EMOJIS.HONEY} 2,500\n` +
          `• 3 attempts: ${EMOJIS.HONEY} 1,500\n` +
          `• 4 attempts: ${EMOJIS.HONEY} 1,000\n` +
          `• 5 attempts: ${EMOJIS.HONEY} 500\n` +
          `• 6 attempts: ${EMOJIS.HONEY} 250\n` +
          '• Plus streak bonuses!',
        inline: false,
      },
      {
        name: 'Commands',
        value:
          '`!craftle` - Play today\'s puzzle\n' +
          '`!craftle stats` - View your statistics\n' +
          '`!craftle leaderboard` - View server rankings\n' +
          '`!craftle help` - Show this help message',
        inline: false,
      }
    )
    .setFooter({
      text: 'A new puzzle is available every day at midnight UTC!',
    });

  return embed;
}

module.exports = {
  createGameEmbed,
  createGameEmbedWithCanvas,
  createResultEmbed,
  createResultEmbedWithCanvas,
  createStatsEmbed,
  createLeaderboardEmbed,
  createHelpEmbed,
  generateShareText,
  buildGridDisplay,
  buildDistributionDisplay,
  COLORS,
  EMOJIS,
};
