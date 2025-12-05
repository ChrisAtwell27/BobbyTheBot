import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get wordle scores for a user
 */
export const getUserScores = query({
  args: { guildId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const userScore = await ctx.db
      .query("wordleScores")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();
    return userScore;
  },
});

/**
 * Get all wordle scores for a guild
 */
export const getAllScores = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const scores = await ctx.db
      .query("wordleScores")
      .withIndex("by_guild_and_user", (q) => q.eq("guildId", args.guildId))
      .collect();
    return scores;
  },
});

/**
 * Get wordle leaderboard
 */
export const getLeaderboard = query({
  args: { guildId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const scores = await ctx.db
      .query("wordleScores")
      .withIndex("by_guild_and_games", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .take(limit);
    return scores;
  },
});

/**
 * Get monthly winner
 */
export const getMonthlyWinner = query({
  args: { guildId: v.string(), month: v.string() },
  handler: async (ctx, args) => {
    const winner = await ctx.db
      .query("wordleMonthlyWinners")
      .withIndex("by_guild_and_month", (q) =>
        q.eq("guildId", args.guildId).eq("month", args.month)
      )
      .first();
    return winner;
  },
});

/**
 * Get all monthly winners for a guild
 */
export const getAllMonthlyWinners = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const winners = await ctx.db
      .query("wordleMonthlyWinners")
      .withIndex("by_guild_and_month", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .collect();
    return winners;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Add a wordle score
 */
export const addScore = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    score: v.number(),
    honeyAwarded: v.number(),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("wordleScores")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();

    const now = Date.now();
    const newScore = {
      score: args.score,
      timestamp: args.timestamp || now,
      honeyAwarded: args.honeyAwarded,
    };

    if (existing) {
      const updatedScores = [...existing.scores, newScore];
      const updatedTotalGames = existing.totalGames + 1;
      const updatedTotalHoney = existing.totalHoney + args.honeyAwarded;

      await ctx.db.patch(existing._id, {
        scores: updatedScores,
        totalGames: updatedTotalGames,
        totalHoney: updatedTotalHoney,
        updatedAt: now,
      });
      return existing._id;
    } else {
      const newUserScore = await ctx.db.insert("wordleScores", {
        guildId: args.guildId,
        userId: args.userId,
        scores: [newScore],
        totalGames: 1,
        totalHoney: args.honeyAwarded,
        createdAt: now,
        updatedAt: now,
      });
      return newUserScore;
    }
  },
});

/**
 * Clear all scores for a guild
 */
export const clearAllScores = mutation({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const scores = await ctx.db
      .query("wordleScores")
      .withIndex("by_guild_and_user", (q) => q.eq("guildId", args.guildId))
      .collect();

    for (const score of scores) {
      await ctx.db.delete(score._id);
    }

    return scores.length;
  },
});

/**
 * Save monthly winner
 */
export const saveMonthlyWinner = mutation({
  args: {
    guildId: v.string(),
    month: v.string(),
    winner: v.any(),
    topTen: v.array(v.any()),
    totalPlayers: v.number(),
    totalGamesPlayed: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("wordleMonthlyWinners")
      .withIndex("by_guild_and_month", (q) =>
        q.eq("guildId", args.guildId).eq("month", args.month)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        winner: args.winner,
        topTen: args.topTen,
        totalPlayers: args.totalPlayers,
        totalGamesPlayed: args.totalGamesPlayed,
        announcedAt: now,
        updatedAt: now,
      });
      return existing._id;
    } else {
      const newWinner = await ctx.db.insert("wordleMonthlyWinners", {
        guildId: args.guildId,
        month: args.month,
        winner: args.winner,
        topTen: args.topTen,
        totalPlayers: args.totalPlayers,
        totalGamesPlayed: args.totalGamesPlayed,
        announcedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return newWinner;
    }
  },
});
