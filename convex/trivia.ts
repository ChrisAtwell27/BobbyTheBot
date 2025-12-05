import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get trivia session for a guild
 */
export const getSession = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("triviaSessions")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();
    return session;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create or update trivia session
 */
export const upsertSession = mutation({
  args: {
    guildId: v.string(),
    sessionToken: v.optional(v.string()),
    activeQuestion: v.optional(v.any()),
    questionHistory: v.optional(v.array(v.string())),
    totalQuestions: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("triviaSessions")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.sessionToken !== undefined && { sessionToken: args.sessionToken }),
        ...(args.activeQuestion !== undefined && { activeQuestion: args.activeQuestion }),
        ...(args.questionHistory !== undefined && { questionHistory: args.questionHistory }),
        ...(args.totalQuestions !== undefined && { totalQuestions: args.totalQuestions }),
        lastUsed: now,
        updatedAt: now,
      });
      return existing._id;
    } else {
      const newSession = await ctx.db.insert("triviaSessions", {
        guildId: args.guildId,
        sessionToken: args.sessionToken,
        activeQuestion: args.activeQuestion,
        questionHistory: args.questionHistory ?? [],
        totalQuestions: args.totalQuestions ?? 0,
        lastUsed: now,
        createdAt: now,
        updatedAt: now,
      });
      return newSession;
    }
  },
});

/**
 * Update session token (for 6-hour expiry management)
 */
export const updateSessionToken = mutation({
  args: {
    guildId: v.string(),
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("triviaSessions")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();

    const now = Date.now();

    if (session) {
      await ctx.db.patch(session._id, {
        sessionToken: args.sessionToken,
        lastUsed: now,
        updatedAt: now,
      });
      return session._id;
    } else {
      const newSession = await ctx.db.insert("triviaSessions", {
        guildId: args.guildId,
        sessionToken: args.sessionToken,
        questionHistory: [],
        totalQuestions: 0,
        lastUsed: now,
        createdAt: now,
        updatedAt: now,
      });
      return newSession;
    }
  },
});

/**
 * Update active question
 */
export const updateActiveQuestion = mutation({
  args: {
    guildId: v.string(),
    activeQuestion: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("triviaSessions")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();

    const now = Date.now();

    if (session) {
      await ctx.db.patch(session._id, {
        activeQuestion: args.activeQuestion,
        lastUsed: now,
        updatedAt: now,
      });
      return session._id;
    } else {
      const newSession = await ctx.db.insert("triviaSessions", {
        guildId: args.guildId,
        activeQuestion: args.activeQuestion,
        questionHistory: [],
        totalQuestions: 0,
        lastUsed: now,
        createdAt: now,
        updatedAt: now,
      });
      return newSession;
    }
  },
});

/**
 * Add question to history
 */
export const addQuestionToHistory = mutation({
  args: {
    guildId: v.string(),
    question: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("triviaSessions")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();

    if (!session) {
      throw new Error("Session not found");
    }

    const updatedHistory = [...(session.questionHistory || []), args.question];
    const updatedTotal = (session.totalQuestions || 0) + 1;

    await ctx.db.patch(session._id, {
      questionHistory: updatedHistory,
      totalQuestions: updatedTotal,
      lastUsed: Date.now(),
      updatedAt: Date.now(),
    });

    return session._id;
  },
});

/**
 * Clear session (reset)
 */
export const clearSession = mutation({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("triviaSessions")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();

    if (session) {
      await ctx.db.delete(session._id);
      return true;
    }
    return false;
  },
});
