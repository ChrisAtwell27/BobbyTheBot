import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get server settings
 */
export const getServer = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const server = await ctx.db
      .query("servers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();
    return server;
  },
});

/**
 * Get house balance
 */
export const getHouseBalance = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const server = await ctx.db
      .query("servers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();
    return server?.houseBalance ?? 0;
  },
});

/**
 * Get all servers (for global cron jobs)
 */
export const getAllServers = query({
  args: {},
  handler: async (ctx) => {
    const servers = await ctx.db.query("servers").collect();
    return servers;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create or update server
 */
export const upsertServer = mutation({
  args: {
    guildId: v.string(),
    houseBalance: v.optional(v.number()),
    lastVotingDate: v.optional(v.number()),
    settings: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("servers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.houseBalance !== undefined && { houseBalance: args.houseBalance }),
        ...(args.lastVotingDate !== undefined && { lastVotingDate: args.lastVotingDate }),
        ...(args.settings !== undefined && { settings: args.settings }),
        updatedAt: now,
      });
      return existing._id;
    } else {
      const newServer = await ctx.db.insert("servers", {
        guildId: args.guildId,
        houseBalance: args.houseBalance ?? 0,
        lastVotingDate: args.lastVotingDate,
        settings: args.settings,
        createdAt: now,
        updatedAt: now,
      });
      return newServer;
    }
  },
});

/**
 * Update house balance
 */
export const updateHouseBalance = mutation({
  args: {
    guildId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const server = await ctx.db
      .query("servers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();

    const now = Date.now();

    if (server) {
      const newBalance = server.houseBalance + args.amount;
      await ctx.db.patch(server._id, {
        houseBalance: newBalance,
        updatedAt: now,
      });
      return newBalance;
    } else {
      // Create new server with the amount as initial balance
      await ctx.db.insert("servers", {
        guildId: args.guildId,
        houseBalance: Math.max(0, args.amount),
        createdAt: now,
        updatedAt: now,
      });
      return Math.max(0, args.amount);
    }
  },
});

/**
 * Set exact house balance
 */
export const setHouseBalance = mutation({
  args: {
    guildId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const server = await ctx.db
      .query("servers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();

    const now = Date.now();

    if (server) {
      await ctx.db.patch(server._id, {
        houseBalance: args.amount,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("servers", {
        guildId: args.guildId,
        houseBalance: args.amount,
        createdAt: now,
        updatedAt: now,
      });
    }
    return args.amount;
  },
});

/**
 * Update last voting date
 */
export const updateLastVotingDate = mutation({
  args: {
    guildId: v.string(),
    date: v.number(),
  },
  handler: async (ctx, args) => {
    const server = await ctx.db
      .query("servers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();

    const now = Date.now();

    if (server) {
      await ctx.db.patch(server._id, {
        lastVotingDate: args.date,
        updatedAt: now,
      });
      return server._id;
    } else {
      const newServer = await ctx.db.insert("servers", {
        guildId: args.guildId,
        houseBalance: 0,
        lastVotingDate: args.date,
        createdAt: now,
        updatedAt: now,
      });
      return newServer;
    }
  },
});

/**
 * Update server settings
 */
export const updateSettings = mutation({
  args: {
    guildId: v.string(),
    settings: v.any(),
  },
  handler: async (ctx, args) => {
    const server = await ctx.db
      .query("servers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();

    const now = Date.now();

    if (server) {
      await ctx.db.patch(server._id, {
        settings: args.settings,
        updatedAt: now,
      });
      return server._id;
    } else {
      const newServer = await ctx.db.insert("servers", {
        guildId: args.guildId,
        houseBalance: 0,
        settings: args.settings,
        createdAt: now,
        updatedAt: now,
      });
      return newServer;
    }
  },
});

/**
 * Patch server settings (merge updates)
 */
export const patchSettings = mutation({
  args: {
    guildId: v.string(),
    updates: v.any(),
  },
  handler: async (ctx, args) => {
    const server = await ctx.db
      .query("servers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();

    const now = Date.now();

    if (server) {
      const currentSettings = server.settings || {};
      const newSettings = { ...currentSettings, ...args.updates };
      
      await ctx.db.patch(server._id, {
        settings: newSettings,
        updatedAt: now,
      });
      return server._id;
    } else {
      const newServer = await ctx.db.insert("servers", {
        guildId: args.guildId,
        houseBalance: 0,
        settings: args.updates,
        createdAt: now,
        updatedAt: now,
      });
      return newServer;
    }
  },
});
