import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================================================
// PUZZLE QUERIES & MUTATIONS
// ============================================================================

/**
 * Get today's puzzle by date
 */
export const getPuzzleByDate = query({
  args: { date: v.string() },
  handler: async (ctx, { date }) => {
    return await ctx.db
      .query("craftlePuzzles")
      .withIndex("by_date", (q) => q.eq("date", date))
      .first();
  },
});

/**
 * Get puzzle by ID
 */
export const getPuzzle = query({
  args: { puzzleId: v.string() },
  handler: async (ctx, { puzzleId }) => {
    return await ctx.db
      .query("craftlePuzzles")
      .withIndex("by_puzzle_id", (q) => q.eq("puzzleId", puzzleId))
      .first();
  },
});

/**
 * Create a new daily puzzle
 */
export const createPuzzle = mutation({
  args: {
    puzzleId: v.string(),
    date: v.string(),
    recipe: v.object({
      id: v.string(),
      output: v.string(),
      outputCount: v.number(),
      grid: v.array(v.array(v.union(v.string(), v.null()))),
      category: v.string(),
      difficulty: v.union(
        v.literal("easy"),
        v.literal("medium"),
        v.literal("hard")
      ),
      description: v.string(),
    }),
    metadata: v.object({
      difficulty: v.union(
        v.literal("easy"),
        v.literal("medium"),
        v.literal("hard")
      ),
      category: v.string(),
      commonItems: v.optional(v.array(v.string())), // Legacy field
      recipeItems: v.optional(v.array(v.string())),
      dailyItems: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, args) => {
    const puzzleId = await ctx.db.insert("craftlePuzzles", {
      ...args,
      stats: {
        totalAttempts: 0,
        totalSolved: 0,
        averageAttempts: 0,
        solveRate: 0,
      },
      createdAt: Date.now(),
    });
    return puzzleId;
  },
});

/**
 * Update puzzle stats
 */
export const updatePuzzleStats = mutation({
  args: {
    puzzleId: v.string(),
    totalAttempts: v.number(),
    totalSolved: v.number(),
  },
  handler: async (ctx, { puzzleId, totalAttempts, totalSolved }) => {
    const puzzle = await ctx.db
      .query("craftlePuzzles")
      .withIndex("by_puzzle_id", (q) => q.eq("puzzleId", puzzleId))
      .first();

    if (!puzzle) return null;

    const averageAttempts = totalAttempts > 0 ? totalAttempts / totalSolved : 0;
    const solveRate = totalAttempts > 0 ? (totalSolved / totalAttempts) * 100 : 0;

    await ctx.db.patch(puzzle._id, {
      stats: {
        totalAttempts,
        totalSolved,
        averageAttempts,
        solveRate,
      },
    });

    return puzzle._id;
  },
});

// ============================================================================
// USER PROGRESS QUERIES & MUTATIONS
// ============================================================================

/**
 * Get user's progress for a specific puzzle
 */
export const getUserProgress = query({
  args: {
    guildId: v.string(),
    userId: v.string(),
    puzzleId: v.string(),
  },
  handler: async (ctx, { guildId, userId, puzzleId }) => {
    return await ctx.db
      .query("craftleUserProgress")
      .withIndex("by_user_and_puzzle", (q) =>
        q.eq("userId", userId).eq("puzzleId", puzzleId)
      )
      .filter((q) => q.eq(q.field("guildId"), guildId))
      .first();
  },
});

/**
 * Get user's progress by date
 */
export const getUserProgressByDate = query({
  args: {
    guildId: v.string(),
    userId: v.string(),
    date: v.string(),
  },
  handler: async (ctx, { guildId, userId, date }) => {
    return await ctx.db
      .query("craftleUserProgress")
      .withIndex("by_guild_and_date", (q) =>
        q.eq("guildId", guildId).eq("date", date)
      )
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();
  },
});

/**
 * Create user progress entry
 */
export const createUserProgress = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    puzzleId: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const progressId = await ctx.db.insert("craftleUserProgress", {
      ...args,
      attempts: 0,
      solved: false,
      guesses: [],
      rewardGiven: false,
      createdAt: now,
      updatedAt: now,
    });
    return progressId;
  },
});

/**
 * Add a guess to user's progress
 */
export const addGuess = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    puzzleId: v.string(),
    grid: v.array(v.array(v.union(v.string(), v.null()))),
    feedback: v.array(
      v.array(
        v.union(
          v.literal("correct"),
          v.literal("wrong_position"),
          v.literal("not_in_recipe"),
          v.literal("missing"),
          v.null()
        )
      )
    ),
    solved: v.boolean(),
  },
  handler: async (ctx, { guildId, userId, puzzleId, grid, feedback, solved }) => {
    const progress = await ctx.db
      .query("craftleUserProgress")
      .withIndex("by_user_and_puzzle", (q) =>
        q.eq("userId", userId).eq("puzzleId", puzzleId)
      )
      .filter((q) => q.eq(q.field("guildId"), guildId))
      .first();

    if (!progress) return null;

    const newGuess = {
      grid,
      feedback,
      timestamp: Date.now(),
    };

    const updatedGuesses = [...progress.guesses, newGuess];
    const attempts = updatedGuesses.length;

    const updateData: any = {
      guesses: updatedGuesses,
      attempts,
      updatedAt: Date.now(),
    };

    if (solved) {
      updateData.solved = true;
      updateData.completedAt = Date.now();
      updateData.solveTime = Date.now() - progress.createdAt;
    } else if (attempts >= 6) {
      // Failed - used all attempts
      updateData.completedAt = Date.now();
    }

    await ctx.db.patch(progress._id, updateData);
    return progress._id;
  },
});

/**
 * Mark reward as given
 */
export const markRewardGiven = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    puzzleId: v.string(),
    rewardAmount: v.number(),
  },
  handler: async (ctx, { guildId, userId, puzzleId, rewardAmount }) => {
    const progress = await ctx.db
      .query("craftleUserProgress")
      .withIndex("by_user_and_puzzle", (q) =>
        q.eq("userId", userId).eq("puzzleId", puzzleId)
      )
      .filter((q) => q.eq(q.field("guildId"), guildId))
      .first();

    if (!progress) return null;

    await ctx.db.patch(progress._id, {
      rewardGiven: true,
      rewardAmount,
      updatedAt: Date.now(),
    });

    return progress._id;
  },
});

// ============================================================================
// USER STATS QUERIES & MUTATIONS
// ============================================================================

/**
 * Get user stats
 */
export const getUserStats = query({
  args: {
    guildId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, { guildId, userId }) => {
    return await ctx.db
      .query("craftleUserStats")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", guildId).eq("userId", userId)
      )
      .first();
  },
});

/**
 * Create or initialize user stats
 */
export const initializeUserStats = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, { guildId, userId }) => {
    const existing = await ctx.db
      .query("craftleUserStats")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", guildId).eq("userId", userId)
      )
      .first();

    if (existing) return existing._id;

    const now = Date.now();
    const statsId = await ctx.db.insert("craftleUserStats", {
      guildId,
      userId,
      totalAttempts: 0,
      totalSolved: 0,
      currentStreak: 0,
      longestStreak: 0,
      averageAttempts: 0,
      totalHoneyEarned: 0,
      lastPlayedDate: "",
      lastPlayedPuzzle: "",
      distribution: {
        solve1: 0,
        solve2: 0,
        solve3: 0,
        solve4: 0,
        solve5: 0,
        solve6: 0,
        fail: 0,
      },
      createdAt: now,
      updatedAt: now,
    });

    return statsId;
  },
});

/**
 * Update user stats after completing a puzzle
 */
export const updateUserStats = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    solved: v.boolean(),
    attempts: v.number(),
    date: v.string(),
    puzzleId: v.string(),
    honeyEarned: v.number(),
  },
  handler: async (ctx, { guildId, userId, solved, attempts, date, puzzleId, honeyEarned }) => {
    const stats = await ctx.db
      .query("craftleUserStats")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", guildId).eq("userId", userId)
      )
      .first();

    if (!stats) return null;

    // Update distribution
    const distribution = { ...stats.distribution };
    if (solved) {
      const key = `solve${attempts}` as keyof typeof distribution;
      distribution[key] = (distribution[key] || 0) + 1;
    } else {
      distribution.fail = (distribution.fail || 0) + 1;
    }

    // Calculate streak
    const lastDate = new Date(stats.lastPlayedDate);
    const currentDate = new Date(date);
    const dayDiff = Math.floor((currentDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

    let currentStreak = stats.currentStreak;
    if (solved) {
      if (dayDiff === 1) {
        // Consecutive day
        currentStreak++;
      } else if (dayDiff > 1 || stats.lastPlayedDate === "") {
        // Streak broken or first play
        currentStreak = 1;
      }
    }

    const longestStreak = Math.max(currentStreak, stats.longestStreak);

    // Calculate average
    const totalAttempts = stats.totalAttempts + 1;
    const totalSolved = solved ? stats.totalSolved + 1 : stats.totalSolved;
    const averageAttempts = totalSolved > 0 ? totalAttempts / totalSolved : 0;

    await ctx.db.patch(stats._id, {
      totalAttempts,
      totalSolved,
      currentStreak,
      longestStreak,
      averageAttempts,
      totalHoneyEarned: stats.totalHoneyEarned + honeyEarned,
      lastPlayedDate: date,
      lastPlayedPuzzle: puzzleId,
      distribution,
      updatedAt: Date.now(),
    });

    return stats._id;
  },
});

// ============================================================================
// LEADERBOARD QUERIES & MUTATIONS
// ============================================================================

/**
 * Get leaderboard for a guild
 */
export const getLeaderboard = query({
  args: {
    guildId: v.string(),
    type: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("alltime")
    ),
  },
  handler: async (ctx, { guildId, type }) => {
    return await ctx.db
      .query("craftleLeaderboards")
      .withIndex("by_guild_and_type", (q) =>
        q.eq("guildId", guildId).eq("type", type)
      )
      .order("desc")
      .first();
  },
});

/**
 * Get top players for a guild (real-time, not cached)
 */
export const getTopPlayers = query({
  args: {
    guildId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { guildId, limit = 10 }) => {
    const stats = await ctx.db
      .query("craftleUserStats")
      .withIndex("by_guild_leaderboard", (q) => q.eq("guildId", guildId))
      .order("desc")
      .take(limit);

    return stats;
  },
});

/**
 * Update leaderboard
 */
export const updateLeaderboard = mutation({
  args: {
    guildId: v.string(),
    type: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
      v.literal("alltime")
    ),
    period: v.string(),
    rankings: v.array(
      v.object({
        userId: v.string(),
        displayName: v.string(),
        score: v.number(),
        solveCount: v.number(),
        averageAttempts: v.number(),
        currentStreak: v.number(),
        bestTime: v.optional(v.number()),
      })
    ),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Find existing leaderboard
    const existing = await ctx.db
      .query("craftleLeaderboards")
      .withIndex("by_guild_and_type", (q) =>
        q.eq("guildId", args.guildId).eq("type", args.type)
      )
      .first();

    const now = Date.now();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        period: args.period,
        rankings: args.rankings,
        generatedAt: now,
        expiresAt: args.expiresAt,
      });
      return existing._id;
    } else {
      // Create new
      const leaderboardId = await ctx.db.insert("craftleLeaderboards", {
        ...args,
        generatedAt: now,
      });
      return leaderboardId;
    }
  },
});
