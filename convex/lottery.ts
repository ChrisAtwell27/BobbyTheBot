import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Constants
const STARTING_JACKPOT = 200000;
const JACKPOT_INCREMENT = 50000;
const MIN_NUMBER = 1;
const MAX_NUMBER = 20;
const NUMBERS_TO_PICK = 3;

// ============================================================================
// LOTTERY QUERIES
// ============================================================================

/**
 * Get the current lottery state for a guild
 */
export const getState = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    return await ctx.db
      .query("lotteryState")
      .withIndex("by_guild", (q) => q.eq("guildId", guildId))
      .first();
  },
});

/**
 * Get all entries for the current week
 */
export const getEntries = query({
  args: { guildId: v.string(), weekNumber: v.number() },
  handler: async (ctx, { guildId, weekNumber }) => {
    return await ctx.db
      .query("lotteryEntries")
      .withIndex("by_guild_and_week", (q) =>
        q.eq("guildId", guildId).eq("weekNumber", weekNumber)
      )
      .collect();
  },
});

/**
 * Get a user's entry for the current week
 */
export const getUserEntry = query({
  args: { guildId: v.string(), weekNumber: v.number(), userId: v.string() },
  handler: async (ctx, { guildId, weekNumber, userId }) => {
    return await ctx.db
      .query("lotteryEntries")
      .withIndex("by_guild_week_user", (q) =>
        q.eq("guildId", guildId).eq("weekNumber", weekNumber).eq("userId", userId)
      )
      .first();
  },
});

/**
 * Get lottery history for a guild
 */
export const getHistory = query({
  args: { guildId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { guildId, limit }) => {
    const query = ctx.db
      .query("lotteryHistory")
      .withIndex("by_guild", (q) => q.eq("guildId", guildId))
      .order("desc");

    if (limit) {
      return await query.take(limit);
    }
    return await query.collect();
  },
});

// ============================================================================
// LOTTERY MUTATIONS
// ============================================================================

/**
 * Initialize lottery state for a guild (or get existing)
 */
export const initState = mutation({
  args: { guildId: v.string(), channelId: v.optional(v.string()) },
  handler: async (ctx, { guildId, channelId }) => {
    const existing = await ctx.db
      .query("lotteryState")
      .withIndex("by_guild", (q) => q.eq("guildId", guildId))
      .first();

    if (existing) {
      // Update channel if provided
      if (channelId) {
        await ctx.db.patch(existing._id, {
          channelId,
          updatedAt: Date.now(),
        });
      }
      return existing._id;
    }

    const now = Date.now();
    return await ctx.db.insert("lotteryState", {
      guildId,
      jackpot: STARTING_JACKPOT,
      weekNumber: 1,
      channelId,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Submit a lottery entry
 */
export const submitEntry = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    username: v.string(),
    numbers: v.array(v.number()),
  },
  handler: async (ctx, { guildId, userId, username, numbers }) => {
    // Get lottery state
    const state = await ctx.db
      .query("lotteryState")
      .withIndex("by_guild", (q) => q.eq("guildId", guildId))
      .first();

    if (!state) {
      throw new Error("Lottery not initialized for this server");
    }

    if (state.status !== "open") {
      throw new Error("Lottery is not currently accepting entries");
    }

    // Validate numbers
    if (numbers.length !== NUMBERS_TO_PICK) {
      throw new Error(`You must pick exactly ${NUMBERS_TO_PICK} numbers`);
    }

    // Check for duplicates
    const uniqueNumbers = new Set(numbers);
    if (uniqueNumbers.size !== NUMBERS_TO_PICK) {
      throw new Error("All numbers must be unique");
    }

    // Validate range
    for (const num of numbers) {
      if (num < MIN_NUMBER || num > MAX_NUMBER || !Number.isInteger(num)) {
        throw new Error(`Numbers must be whole numbers between ${MIN_NUMBER} and ${MAX_NUMBER}`);
      }
    }

    // Check if user already has an entry this week
    const existingEntry = await ctx.db
      .query("lotteryEntries")
      .withIndex("by_guild_week_user", (q) =>
        q.eq("guildId", guildId).eq("weekNumber", state.weekNumber).eq("userId", userId)
      )
      .first();

    if (existingEntry) {
      throw new Error("You already have an entry for this week's lottery");
    }

    // Sort numbers for consistent comparison
    const sortedNumbers = [...numbers].sort((a, b) => a - b);

    // Create entry
    await ctx.db.insert("lotteryEntries", {
      guildId,
      weekNumber: state.weekNumber,
      userId,
      username,
      numbers: sortedNumbers,
      enteredAt: Date.now(),
    });

    return { success: true, numbers: sortedNumbers };
  },
});

/**
 * Draw the lottery (called by scheduled task)
 */
export const drawLottery = mutation({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const state = await ctx.db
      .query("lotteryState")
      .withIndex("by_guild", (q) => q.eq("guildId", guildId))
      .first();

    if (!state) {
      throw new Error("Lottery not initialized");
    }

    // Set status to drawing
    await ctx.db.patch(state._id, { status: "drawing", updatedAt: Date.now() });

    // Generate winning numbers (3 unique random numbers 1-20)
    const winningNumbers: number[] = [];
    while (winningNumbers.length < NUMBERS_TO_PICK) {
      const num = Math.floor(Math.random() * MAX_NUMBER) + MIN_NUMBER;
      if (!winningNumbers.includes(num)) {
        winningNumbers.push(num);
      }
    }
    winningNumbers.sort((a, b) => a - b);

    // Get all entries for this week
    const entries = await ctx.db
      .query("lotteryEntries")
      .withIndex("by_guild_and_week", (q) =>
        q.eq("guildId", guildId).eq("weekNumber", state.weekNumber)
      )
      .collect();

    // Find winner (exact match only)
    let winner = null;
    for (const entry of entries) {
      if (
        entry.numbers.length === winningNumbers.length &&
        entry.numbers.every((num, i) => num === winningNumbers[i])
      ) {
        winner = entry;
        break;
      }
    }

    const now = Date.now();

    // Record in history
    await ctx.db.insert("lotteryHistory", {
      guildId,
      weekNumber: state.weekNumber,
      winningNumbers,
      jackpot: state.jackpot,
      winner: winner
        ? {
            userId: winner.userId,
            username: winner.username,
            numbers: winner.numbers,
          }
        : undefined,
      totalEntries: entries.length,
      drawnAt: now,
    });

    // Update state for next week
    const newJackpot = winner ? STARTING_JACKPOT : state.jackpot + JACKPOT_INCREMENT;

    await ctx.db.patch(state._id, {
      jackpot: newJackpot,
      weekNumber: state.weekNumber + 1,
      lastDrawTime: now,
      winningNumbers,
      lastWinner: winner
        ? {
            userId: winner.userId,
            username: winner.username,
            numbers: winner.numbers,
            amount: state.jackpot,
            timestamp: now,
          }
        : undefined,
      status: "open",
      updatedAt: now,
    });

    return {
      winningNumbers,
      winner: winner
        ? {
            userId: winner.userId,
            username: winner.username,
            numbers: winner.numbers,
            amount: state.jackpot,
          }
        : null,
      totalEntries: entries.length,
      newJackpot,
      weekNumber: state.weekNumber,
    };
  },
});

/**
 * Clear entries for a specific week (used after draw)
 */
export const clearWeekEntries = mutation({
  args: { guildId: v.string(), weekNumber: v.number() },
  handler: async (ctx, { guildId, weekNumber }) => {
    const entries = await ctx.db
      .query("lotteryEntries")
      .withIndex("by_guild_and_week", (q) =>
        q.eq("guildId", guildId).eq("weekNumber", weekNumber)
      )
      .collect();

    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }

    return entries.length;
  },
});

/**
 * Update lottery state (for admin use)
 */
export const updateState = mutation({
  args: {
    guildId: v.string(),
    channelId: v.optional(v.string()),
    mainMessageId: v.optional(v.string()),
    status: v.optional(v.union(v.literal("open"), v.literal("drawing"), v.literal("closed"))),
    jackpot: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("lotteryState")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();

    if (!state) {
      throw new Error("Lottery not initialized");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.channelId !== undefined) updates.channelId = args.channelId;
    if (args.mainMessageId !== undefined) updates.mainMessageId = args.mainMessageId;
    if (args.status !== undefined) updates.status = args.status;
    if (args.jackpot !== undefined) updates.jackpot = args.jackpot;

    await ctx.db.patch(state._id, updates);
    return true;
  },
});

/**
 * Get entry count for current week
 */
export const getEntryCount = query({
  args: { guildId: v.string(), weekNumber: v.number() },
  handler: async (ctx, { guildId, weekNumber }) => {
    const entries = await ctx.db
      .query("lotteryEntries")
      .withIndex("by_guild_and_week", (q) =>
        q.eq("guildId", guildId).eq("weekNumber", weekNumber)
      )
      .collect();

    return entries.length;
  },
});
