import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get a user by guildId and userId
 */
export const getUser = query({
  args: { guildId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();
    return user;
  },
});

/**
 * Get user balance
 */
export const getBalance = query({
  args: { guildId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();
    return user?.balance ?? 0;
  },
});

/**
 * Get top users by balance (leaderboard)
 */
export const getTopBalances = query({
  args: { guildId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const users = await ctx.db
      .query("users")
      .withIndex("by_guild_and_balance", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .take(limit);
    return users.filter((u) => u.balance > 0);
  },
});

/**
 * Get user rank by balance
 */
export const getUserRank = query({
  args: { guildId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();

    if (!user) return null;

    const usersWithHigherBalance = await ctx.db
      .query("users")
      .withIndex("by_guild_and_balance", (q) => q.eq("guildId", args.guildId))
      .filter((q) => q.gt(q.field("balance"), user.balance))
      .collect();

    return {
      rank: usersWithHigherBalance.length + 1,
      balance: user.balance,
    };
  },
});

/**
 * Calculate total economy for a guild
 */
export const getTotalEconomy = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) => q.eq("guildId", args.guildId))
      .collect();

    const total = users.reduce((sum, user) => sum + user.balance, 0);
    return total;
  },
});

/**
 * Get top pets by level
 */
export const getTopPets = query({
  args: { guildId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const users = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) => q.eq("guildId", args.guildId))
      .collect();

    const usersWithPets = users
      .filter((u) => u.pet && u.pet.level > 0)
      .sort((a, b) => {
        if (b.pet!.level !== a.pet!.level) {
          return b.pet!.level - a.pet!.level;
        }
        return b.pet!.xp - a.pet!.xp;
      })
      .slice(0, limit);

    return usersWithPets;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create or update a user
 */
export const upsertUser = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args.data,
        updatedAt: now,
      });
      return existing._id;
    } else {
      const newUser = await ctx.db.insert("users", {
        guildId: args.guildId,
        userId: args.userId,
        balance: 0,
        createdAt: now,
        updatedAt: now,
        ...args.data,
      });
      return newUser;
    }
  },
});

/**
 * Update user balance (add or subtract)
 */
export const updateBalance = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();

    const now = Date.now();

    if (user) {
      const newBalance = user.balance + args.amount;
      await ctx.db.patch(user._id, {
        balance: newBalance,
        updatedAt: now,
      });
      return newBalance;
    } else {
      // Create new user with the amount as initial balance
      await ctx.db.insert("users", {
        guildId: args.guildId,
        userId: args.userId,
        balance: Math.max(0, args.amount),
        createdAt: now,
        updatedAt: now,
      });
      return Math.max(0, args.amount);
    }
  },
});

/**
 * Set exact balance
 */
export const setBalance = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();

    const now = Date.now();

    if (user) {
      await ctx.db.patch(user._id, {
        balance: args.amount,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("users", {
        guildId: args.guildId,
        userId: args.userId,
        balance: args.amount,
        createdAt: now,
        updatedAt: now,
      });
    }
    return args.amount;
  },
});

/**
 * Update user pet
 */
export const updatePet = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    pet: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();

    const now = Date.now();

    if (user) {
      await ctx.db.patch(user._id, {
        pet: args.pet,
        updatedAt: now,
      });
      return user._id;
    } else {
      const newUser = await ctx.db.insert("users", {
        guildId: args.guildId,
        userId: args.userId,
        balance: 0,
        pet: args.pet,
        createdAt: now,
        updatedAt: now,
      });
      return newUser;
    }
  },
});

/**
 * Delete user pet
 */
export const deletePet = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();

    if (user) {
      await ctx.db.patch(user._id, {
        pet: undefined,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Update user Valorant data
 */
export const updateValorant = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    valorant: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();

    const now = Date.now();

    if (user) {
      await ctx.db.patch(user._id, {
        valorant: args.valorant,
        updatedAt: now,
      });
      return user._id;
    } else {
      const newUser = await ctx.db.insert("users", {
        guildId: args.guildId,
        userId: args.userId,
        balance: 0,
        valorant: args.valorant,
        createdAt: now,
        updatedAt: now,
      });
      return newUser;
    }
  },
});

/**
 * Remove Valorant data from user
 */
export const removeValorant = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();

    if (user) {
      await ctx.db.patch(user._id, {
        valorant: undefined,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Get all Valorant users in a guild
 */
export const getAllValorantUsers = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) => q.eq("guildId", args.guildId))
      .filter((q) => q.neq(q.field("valorant"), undefined))
      .collect();

    return users.map((u) => ({
      userId: u.userId,
      valorant: u.valorant,
    }));
  },
});

/**
 * Update user memory (for AI conversation context)
 */
export const updateMemory = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    memory: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();

    const now = Date.now();

    if (user) {
      await ctx.db.patch(user._id, {
        memory: args.memory,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("users", {
        guildId: args.guildId,
        userId: args.userId,
        balance: 0,
        memory: args.memory,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/**
 * Update activity tracking
 */
export const updateActivity = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    messageCount: v.optional(v.number()),
    dailyMessageCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();

    const now = Date.now();

    if (user) {
      await ctx.db.patch(user._id, {
        messageCount: args.messageCount ?? user.messageCount,
        dailyMessageCount: args.dailyMessageCount ?? user.dailyMessageCount,
        lastActive: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("users", {
        guildId: args.guildId,
        userId: args.userId,
        balance: 0,
        messageCount: args.messageCount ?? 0,
        dailyMessageCount: args.dailyMessageCount ?? 0,
        lastActive: now,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// ============================================================================
// BIRTHDAY FUNCTIONS
// ============================================================================

/**
 * Set user birthday
 */
export const setBirthday = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    month: v.number(),
    day: v.number(),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();

    const now = Date.now();
    const birthdayData = {
      month: args.month,
      day: args.day,
      year: args.year,
      lastBirthdayWish: user?.birthday?.lastBirthdayWish,
    };

    if (user) {
      await ctx.db.patch(user._id, {
        birthday: birthdayData,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("users", {
        guildId: args.guildId,
        userId: args.userId,
        balance: 0,
        birthday: birthdayData,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/**
 * Get users with birthday today
 */
export const getBirthdaysToday = query({
  args: {
    guildId: v.string(),
    month: v.number(),
    day: v.number(),
    currentYear: v.number(),
  },
  handler: async (ctx, args) => {
    // We can't query directly by nested fields in the index efficiently without a specific index,
    // but we can filter by guildId and then filter in memory since user count per guild is manageable.
    // Ideally we would add an index, but for now this works.
    const users = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) => q.eq("guildId", args.guildId))
      .collect();

    return users.filter((u) => {
      if (!u.birthday) return false;
      
      const isToday = u.birthday.month === args.month && u.birthday.day === args.day;
      if (!isToday) return false;

      // Check if already wished using the lastBirthdayWish year
      const alreadyWished = u.birthday.lastBirthdayWish === args.currentYear;
      return !alreadyWished;
    });
  },
});

/**
 * Mark birthday as wished
 */
export const markBirthdayWished = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();

    if (user && user.birthday) {
      await ctx.db.patch(user._id, {
        birthday: {
          ...user.birthday,
          lastBirthdayWish: args.year,
        },
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Update user gladiator stats
 */
export const updateGladiatorStats = mutation({
  args: {
    guildId: v.string(),
    userId: v.string(),
    gladiatorStats: v.any(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();

    const now = Date.now();

    if (user) {
      await ctx.db.patch(user._id, {
        gladiatorStats: args.gladiatorStats,
        updatedAt: now,
      });
      return user._id;
    } else {
      const newUser = await ctx.db.insert("users", {
        guildId: args.guildId,
        userId: args.userId,
        balance: 0,
        gladiatorStats: args.gladiatorStats,
        createdAt: now,
        updatedAt: now,
      });
      return newUser;
    }
  },
});

/**
 * Get user gladiator stats
 */
export const getGladiatorStats = query({
  args: { guildId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();
    return user?.gladiatorStats ?? null;
  },
});

/**
 * Get top gladiators by wins
 */
export const getTopGladiators = query({
  args: { guildId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const users = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) => q.eq("guildId", args.guildId))
      .collect();

    const usersWithStats = users
      .filter((u) => u.gladiatorStats && u.gladiatorStats.wins > 0)
      .sort((a, b) => {
        const aWins = a.gladiatorStats?.wins ?? 0;
        const bWins = b.gladiatorStats?.wins ?? 0;
        if (bWins !== aWins) return bWins - aWins;
        const aWinRate = aWins / (a.gladiatorStats?.totalMatches ?? 1);
        const bWinRate = bWins / (b.gladiatorStats?.totalMatches ?? 1);
        return bWinRate - aWinRate;
      })
      .slice(0, limit);

    return usersWithStats;
  },
});

/**
 * Reset all user balances to a specific amount (DANGEROUS)
 */
export const resetAllBalances = mutation({
  args: {
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    // This is a potentially heavy operation, but Convex handles it transactionally.
    // If there are too many users, this might time out and need to be batched/paginated.
    // However, for this bot's scale, it should be fine.
    const users = await ctx.db.query("users").collect();
    
    let modifiedCount = 0;
    const now = Date.now();
    
    for (const user of users) {
      await ctx.db.patch(user._id, {
        balance: args.amount,
        updatedAt: now,
      });
      modifiedCount++;
    }
    
    return { modifiedCount };
  },
});
