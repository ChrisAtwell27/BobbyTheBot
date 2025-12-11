import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Constants
const HOUSE_CUT_PERCENT = 0.05; // 5% house cut
const MIN_BET = 100;
const MAX_OPTIONS = 10;

// ============================================================================
// BETTING QUERIES
// ============================================================================

/**
 * Get a specific bet by betId
 */
export const getBet = query({
  args: { guildId: v.string(), betId: v.string() },
  handler: async (ctx, { guildId, betId }) => {
    return await ctx.db
      .query("bets")
      .withIndex("by_bet_id", (q) => q.eq("guildId", guildId).eq("betId", betId))
      .first();
  },
});

/**
 * Get all active (open or locked) bets for a guild
 */
export const getActiveBets = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const openBets = await ctx.db
      .query("bets")
      .withIndex("by_guild_and_status", (q) =>
        q.eq("guildId", guildId).eq("status", "open")
      )
      .collect();

    const lockedBets = await ctx.db
      .query("bets")
      .withIndex("by_guild_and_status", (q) =>
        q.eq("guildId", guildId).eq("status", "locked")
      )
      .collect();

    return [...openBets, ...lockedBets].sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Get all bets for a guild (including resolved/cancelled)
 */
export const getAllBets = query({
  args: { guildId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { guildId, limit }) => {
    const query = ctx.db
      .query("bets")
      .withIndex("by_guild", (q) => q.eq("guildId", guildId))
      .order("desc");

    if (limit) {
      return await query.take(limit);
    }
    return await query.collect();
  },
});

/**
 * Get all entries for a specific bet
 */
export const getBetEntries = query({
  args: { guildId: v.string(), betId: v.string() },
  handler: async (ctx, { guildId, betId }) => {
    return await ctx.db
      .query("betEntries")
      .withIndex("by_bet", (q) => q.eq("guildId", guildId).eq("betId", betId))
      .collect();
  },
});

/**
 * Get a user's entry for a specific bet
 */
export const getUserBetEntry = query({
  args: { guildId: v.string(), betId: v.string(), userId: v.string() },
  handler: async (ctx, { guildId, betId, userId }) => {
    return await ctx.db
      .query("betEntries")
      .withIndex("by_bet_and_user", (q) =>
        q.eq("guildId", guildId).eq("betId", betId).eq("userId", userId)
      )
      .first();
  },
});

/**
 * Get all of a user's bets across all active bets
 */
export const getUserBets = query({
  args: { guildId: v.string(), userId: v.string() },
  handler: async (ctx, { guildId, userId }) => {
    const entries = await ctx.db
      .query("betEntries")
      .withIndex("by_user", (q) => q.eq("guildId", guildId).eq("userId", userId))
      .collect();

    // Get the bet details for each entry
    const betsWithEntries = await Promise.all(
      entries.map(async (entry) => {
        const bet = await ctx.db
          .query("bets")
          .withIndex("by_bet_id", (q) =>
            q.eq("guildId", guildId).eq("betId", entry.betId)
          )
          .first();
        return { entry, bet };
      })
    );

    // Filter to only active bets
    return betsWithEntries.filter(
      (item) => item.bet && (item.bet.status === "open" || item.bet.status === "locked")
    );
  },
});

// ============================================================================
// BETTING MUTATIONS
// ============================================================================

/**
 * Create a new bet
 */
export const createBet = mutation({
  args: {
    guildId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    options: v.array(v.string()), // Array of option labels
    creatorId: v.string(),
    creatorName: v.string(),
    channelId: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate options
    if (args.options.length < 2) {
      throw new Error("A bet must have at least 2 options");
    }
    if (args.options.length > MAX_OPTIONS) {
      throw new Error(`A bet can have at most ${MAX_OPTIONS} options`);
    }

    // Check for duplicate option labels
    const uniqueLabels = new Set(args.options.map((o) => o.toLowerCase()));
    if (uniqueLabels.size !== args.options.length) {
      throw new Error("All options must be unique");
    }

    // Generate unique betId
    const betId = `bet_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    // Create options with IDs (a, b, c, etc.)
    const optionIds = "abcdefghij".split("");
    const options = args.options.map((label, i) => ({
      id: optionIds[i],
      label,
      totalWagered: 0,
    }));

    const now = Date.now();

    await ctx.db.insert("bets", {
      guildId: args.guildId,
      betId,
      title: args.title,
      description: args.description,
      options,
      creatorId: args.creatorId,
      creatorName: args.creatorName,
      channelId: args.channelId,
      status: "open",
      totalPool: 0,
      houseCut: 0,
      createdAt: now,
    });

    return { betId, options };
  },
});

/**
 * Place a bet on an option
 */
export const placeBet = mutation({
  args: {
    guildId: v.string(),
    betId: v.string(),
    userId: v.string(),
    username: v.string(),
    optionId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    // Get the bet
    const bet = await ctx.db
      .query("bets")
      .withIndex("by_bet_id", (q) =>
        q.eq("guildId", args.guildId).eq("betId", args.betId)
      )
      .first();

    if (!bet) {
      throw new Error("Bet not found");
    }

    if (bet.status !== "open") {
      throw new Error("This bet is no longer accepting wagers");
    }

    // Validate option exists
    const option = bet.options.find((o) => o.id === args.optionId);
    if (!option) {
      throw new Error("Invalid option");
    }

    // Validate amount
    if (args.amount < MIN_BET) {
      throw new Error(`Minimum bet is ${MIN_BET}`);
    }

    // Check if user already has a bet on this
    const existingEntry = await ctx.db
      .query("betEntries")
      .withIndex("by_bet_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("betId", args.betId).eq("userId", args.userId)
      )
      .first();

    if (existingEntry) {
      throw new Error("You already have a bet on this event");
    }

    // Calculate current odds for this option (before this bet)
    const newTotalPool = bet.totalPool + args.amount;
    const newOptionTotal = option.totalWagered + args.amount;
    const oddsAtEntry = newTotalPool > 0 ? newTotalPool / newOptionTotal : 1;

    // Create the entry
    await ctx.db.insert("betEntries", {
      guildId: args.guildId,
      betId: args.betId,
      userId: args.userId,
      username: args.username,
      optionId: args.optionId,
      amount: args.amount,
      oddsAtEntry,
      createdAt: Date.now(),
    });

    // Update the bet totals
    const updatedOptions = bet.options.map((o) =>
      o.id === args.optionId
        ? { ...o, totalWagered: o.totalWagered + args.amount }
        : o
    );

    await ctx.db.patch(bet._id, {
      options: updatedOptions,
      totalPool: bet.totalPool + args.amount,
    });

    return {
      success: true,
      newTotalPool: bet.totalPool + args.amount,
      optionTotal: option.totalWagered + args.amount,
    };
  },
});

/**
 * Lock a bet (stop accepting new wagers)
 */
export const lockBet = mutation({
  args: { guildId: v.string(), betId: v.string() },
  handler: async (ctx, { guildId, betId }) => {
    const bet = await ctx.db
      .query("bets")
      .withIndex("by_bet_id", (q) => q.eq("guildId", guildId).eq("betId", betId))
      .first();

    if (!bet) {
      throw new Error("Bet not found");
    }

    if (bet.status !== "open") {
      throw new Error("Bet is not open");
    }

    await ctx.db.patch(bet._id, {
      status: "locked",
      lockedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Resolve a bet and calculate payouts
 */
export const resolveBet = mutation({
  args: {
    guildId: v.string(),
    betId: v.string(),
    winningOptionId: v.string(),
  },
  handler: async (ctx, { guildId, betId, winningOptionId }) => {
    const bet = await ctx.db
      .query("bets")
      .withIndex("by_bet_id", (q) => q.eq("guildId", guildId).eq("betId", betId))
      .first();

    if (!bet) {
      throw new Error("Bet not found");
    }

    if (bet.status === "resolved") {
      throw new Error("Bet is already resolved");
    }

    if (bet.status === "cancelled") {
      throw new Error("Bet was cancelled");
    }

    // Validate winning option
    const winningOption = bet.options.find((o) => o.id === winningOptionId);
    if (!winningOption) {
      throw new Error("Invalid winning option");
    }

    // Get all entries
    const entries = await ctx.db
      .query("betEntries")
      .withIndex("by_bet", (q) => q.eq("guildId", guildId).eq("betId", betId))
      .collect();

    // Calculate house cut and net pool
    const houseCut = Math.floor(bet.totalPool * HOUSE_CUT_PERCENT);
    const netPool = bet.totalPool - houseCut;

    // Calculate payouts for winners
    const winningEntries = entries.filter((e) => e.optionId === winningOptionId);
    const totalWinningBets = winningOption.totalWagered;

    const payouts: Array<{ oddsAtEntry: number | undefined; oddsActual: number; oddsMultiplier: number; oddsDisplay: string; oddsText: string; userId: string; username: string; amount: number; payout: number }> = [];

    for (const entry of winningEntries) {
      // Pari-mutuel: (user bet / total winning bets) * net pool
      const payout =
        totalWinningBets > 0
          ? Math.floor((entry.amount / totalWinningBets) * netPool)
          : 0;

      payouts.push({
        userId: entry.userId,
        username: entry.username,
        amount: entry.amount,
        payout,
        oddsAtEntry: entry.oddsAtEntry,
        oddsActual: payout / entry.amount,
        oddsMultiplier: payout / entry.amount,
        oddsDisplay: `${(payout / entry.amount).toFixed(2)}x`,
        oddsText: `${entry.amount} → ${payout}`,
      });

      // Update entry with payout
      await ctx.db.patch(entry._id, { payout });
    }

    // Mark losing entries with 0 payout
    const losingEntries = entries.filter((e) => e.optionId !== winningOptionId);
    for (const entry of losingEntries) {
      await ctx.db.patch(entry._id, { payout: 0 });
    }

    // Update bet status
    await ctx.db.patch(bet._id, {
      status: "resolved",
      winningOption: winningOptionId,
      houseCut,
      resolvedAt: Date.now(),
    });

    return {
      winningOption: winningOption.label,
      winningOptionId,
      totalPool: bet.totalPool,
      houseCut,
      netPool,
      totalWinners: winningEntries.length,
      totalLosers: losingEntries.length,
      payouts,
    };
  },
});

/**
 * Cancel a bet and mark for refunds
 */
export const cancelBet = mutation({
  args: { guildId: v.string(), betId: v.string() },
  handler: async (ctx, { guildId, betId }) => {
    const bet = await ctx.db
      .query("bets")
      .withIndex("by_bet_id", (q) => q.eq("guildId", guildId).eq("betId", betId))
      .first();

    if (!bet) {
      throw new Error("Bet not found");
    }

    if (bet.status === "resolved") {
      throw new Error("Cannot cancel a resolved bet");
    }

    if (bet.status === "cancelled") {
      throw new Error("Bet is already cancelled");
    }

    // Get all entries for refund list
    const entries = await ctx.db
      .query("betEntries")
      .withIndex("by_bet", (q) => q.eq("guildId", guildId).eq("betId", betId))
      .collect();

    // Mark all entries with their original amount as payout (refund)
    for (const entry of entries) {
      await ctx.db.patch(entry._id, { payout: entry.amount });
    }

    // Update bet status
    await ctx.db.patch(bet._id, {
      status: "cancelled",
      resolvedAt: Date.now(),
    });

    return {
      refunds: entries.map((e) => ({
        userId: e.userId,
        username: e.username,
        amount: e.amount,
      })),
      totalRefunded: bet.totalPool,
    };
  },
});

/**
 * Update the message ID for a bet embed
 */
export const updateBetMessageId = mutation({
  args: { guildId: v.string(), betId: v.string(), messageId: v.string() },
  handler: async (ctx, { guildId, betId, messageId }) => {
    const bet = await ctx.db
      .query("bets")
      .withIndex("by_bet_id", (q) => q.eq("guildId", guildId).eq("betId", betId))
      .first();

    if (!bet) {
      throw new Error("Bet not found");
    }

    await ctx.db.patch(bet._id, { messageId });
    return true;
  },
});

/**
 * Get bet statistics for a guild
 */
export const getBetStats = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const allBets = await ctx.db
      .query("bets")
      .withIndex("by_guild", (q) => q.eq("guildId", guildId))
      .collect();

    const resolvedBets = allBets.filter((b) => b.status === "resolved");
    const totalHouseCut = resolvedBets.reduce((sum, b) => sum + b.houseCut, 0);
    const totalPool = resolvedBets.reduce((sum, b) => sum + b.totalPool, 0);

    return {
      totalBets: allBets.length,
      activeBets: allBets.filter((b) => b.status === "open" || b.status === "locked").length,
      resolvedBets: resolvedBets.length,
      cancelledBets: allBets.filter((b) => b.status === "cancelled").length,
      totalPool,
      totalHouseCut,
    };
  },
});
