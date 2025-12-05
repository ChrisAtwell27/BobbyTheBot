import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get a bounty by bountyId
 */
export const getBounty = query({
  args: { bountyId: v.string() },
  handler: async (ctx, args) => {
    const bounty = await ctx.db
      .query("bounties")
      .withIndex("by_bounty_id", (q) => q.eq("bountyId", args.bountyId))
      .first();
    return bounty;
  },
});

/**
 * Get active bounties for a guild
 */
export const getActiveBounties = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const bounties = await ctx.db
      .query("bounties")
      .withIndex("by_guild_and_status", (q) =>
        q.eq("guildId", args.guildId).eq("status", "active")
      )
      .filter((q) => q.gt(q.field("expiresAt"), now))
      .collect();
    return bounties;
  },
});

/**
 * Get all bounties for a guild (any status)
 */
export const getAllBounties = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const bounties = await ctx.db
      .query("bounties")
      .withIndex("by_guild_and_status", (q) => q.eq("guildId", args.guildId))
      .collect();
    return bounties;
  },
});

/**
 * Get bounties created by a specific user
 */
export const getBountiesByCreator = query({
  args: { guildId: v.string(), creatorId: v.string() },
  handler: async (ctx, args) => {
    const bounties = await ctx.db
      .query("bounties")
      .withIndex("by_guild_creator", (q) =>
        q.eq("guildId", args.guildId).eq("creatorId", args.creatorId)
      )
      .collect();
    return bounties;
  },
});

/**
 * Get expired bounties
 */
export const getExpiredBounties = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const bounties = await ctx.db
      .query("bounties")
      .withIndex("by_guild_and_status", (q) =>
        q.eq("guildId", args.guildId).eq("status", "active")
      )
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();
    return bounties;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new bounty
 */
export const createBounty = mutation({
  args: {
    guildId: v.string(),
    bountyId: v.string(),
    creatorId: v.string(),
    creatorName: v.string(),
    description: v.string(),
    reward: v.number(),
    channelId: v.string(),
    expiresAt: v.number(),
    messageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const bounty = await ctx.db.insert("bounties", {
      guildId: args.guildId,
      bountyId: args.bountyId,
      creatorId: args.creatorId,
      creatorName: args.creatorName,
      description: args.description,
      reward: args.reward,
      status: "active",
      channelId: args.channelId,
      messageId: args.messageId,
      expiresAt: args.expiresAt,
      createdAt: now,
    });
    return bounty;
  },
});

/**
 * Claim a bounty
 */
export const claimBounty = mutation({
  args: {
    bountyId: v.string(),
    claimedBy: v.string(),
    claimedByName: v.string(),
    proofUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const bounty = await ctx.db
      .query("bounties")
      .withIndex("by_bounty_id", (q) => q.eq("bountyId", args.bountyId))
      .first();

    if (!bounty) {
      throw new Error("Bounty not found");
    }

    if (bounty.status !== "active") {
      throw new Error("Bounty is not active");
    }

    const now = Date.now();
    await ctx.db.patch(bounty._id, {
      status: "claimed",
      claimedBy: args.claimedBy,
      claimedByName: args.claimedByName,
      proofUrl: args.proofUrl,
      completedAt: now,
    });

    return bounty._id;
  },
});

/**
 * Cancel a bounty
 */
export const cancelBounty = mutation({
  args: { bountyId: v.string() },
  handler: async (ctx, args) => {
    const bounty = await ctx.db
      .query("bounties")
      .withIndex("by_bounty_id", (q) => q.eq("bountyId", args.bountyId))
      .first();

    if (!bounty) {
      throw new Error("Bounty not found");
    }

    await ctx.db.patch(bounty._id, {
      status: "cancelled",
      completedAt: Date.now(),
    });

    return bounty._id;
  },
});

/**
 * Expire bounties that have passed their expiration time
 */
export const expireBounties = mutation({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiredBounties = await ctx.db
      .query("bounties")
      .withIndex("by_guild_and_status", (q) =>
        q.eq("guildId", args.guildId).eq("status", "active")
      )
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    for (const bounty of expiredBounties) {
      await ctx.db.patch(bounty._id, {
        status: "expired",
        completedAt: now,
      });
    }

    return expiredBounties.length;
  },
});

/**
 * Delete all bounties for a guild
 */
export const deleteAllGuildBounties = mutation({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const bounties = await ctx.db
      .query("bounties")
      .withIndex("by_guild_and_status", (q) => q.eq("guildId", args.guildId))
      .collect();

    for (const bounty of bounties) {
      await ctx.db.delete(bounty._id);
    }

    return bounties.length;
  },
});

/**
 * Delete a specific bounty
 */
export const deleteBounty = mutation({
  args: { bountyId: v.string() },
  handler: async (ctx, args) => {
    const bounty = await ctx.db
      .query("bounties")
      .withIndex("by_bounty_id", (q) => q.eq("bountyId", args.bountyId))
      .first();

    if (bounty) {
      await ctx.db.delete(bounty._id);
      return true;
    }
    return false;
  },
});

/**
 * Update bounty message ID
 */
export const updateBountyMessage = mutation({
  args: {
    bountyId: v.string(),
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    const bounty = await ctx.db
      .query("bounties")
      .withIndex("by_bounty_id", (q) => q.eq("bountyId", args.bountyId))
      .first();

    if (!bounty) {
      throw new Error("Bounty not found");
    }

    await ctx.db.patch(bounty._id, {
      messageId: args.messageId,
    });

    return bounty._id;
  },
});
