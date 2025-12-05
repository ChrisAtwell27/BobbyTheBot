import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get subscription by Discord ID
 */
export const getSubscription = query({
  args: { discordId: v.string() },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_discord_id", (q) => q.eq("discordId", args.discordId))
      .first();
    return subscription;
  },
});

/**
 * Get all subscriptions by status
 */
export const getSubscriptionsByStatus = query({
  args: { status: v.union(v.literal("active"), v.literal("expired"), v.literal("cancelled"), v.literal("pending")) },
  handler: async (ctx, args) => {
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .collect();
    return subscriptions;
  },
});

/**
 * Get all subscriptions by tier
 */
export const getSubscriptionsByTier = query({
  args: { tier: v.union(v.literal("free"), v.literal("basic"), v.literal("premium"), v.literal("enterprise")) },
  handler: async (ctx, args) => {
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_tier", (q) => q.eq("tier", args.tier))
      .collect();
    return subscriptions;
  },
});

/**
 * Check if subscription is valid
 */
export const isSubscriptionValid = query({
  args: { discordId: v.string() },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_discord_id", (q) => q.eq("discordId", args.discordId))
      .first();

    if (!subscription) return false;

    if (subscription.status !== "active") return false;

    if (subscription.expiresAt && subscription.expiresAt < Date.now()) {
      return false;
    }

    return true;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create or update subscription
 */
export const upsertSubscription = mutation({
  args: {
    discordId: v.string(),
    discordUsername: v.optional(v.string()),
    discordAvatar: v.optional(v.string()),
    tier: v.optional(v.union(v.literal("free"), v.literal("basic"), v.literal("premium"), v.literal("enterprise"))),
    status: v.optional(v.union(v.literal("active"), v.literal("expired"), v.literal("cancelled"), v.literal("pending"))),
    botVerified: v.optional(v.boolean()),
    verifiedGuilds: v.optional(v.array(v.any())),
    expiresAt: v.optional(v.number()),
    paymentReference: v.optional(v.string()),
    features: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_discord_id", (q) => q.eq("discordId", args.discordId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.discordUsername !== undefined && { discordUsername: args.discordUsername }),
        ...(args.discordAvatar !== undefined && { discordAvatar: args.discordAvatar }),
        ...(args.tier !== undefined && { tier: args.tier }),
        ...(args.status !== undefined && { status: args.status }),
        ...(args.botVerified !== undefined && { botVerified: args.botVerified }),
        ...(args.verifiedGuilds !== undefined && { verifiedGuilds: args.verifiedGuilds }),
        ...(args.expiresAt !== undefined && { expiresAt: args.expiresAt }),
        ...(args.paymentReference !== undefined && { paymentReference: args.paymentReference }),
        ...(args.features !== undefined && { features: args.features }),
        ...(args.metadata !== undefined && { metadata: args.metadata }),
        updatedAt: now,
      });
      return existing._id;
    } else {
      const newSubscription = await ctx.db.insert("subscriptions", {
        discordId: args.discordId,
        discordUsername: args.discordUsername,
        discordAvatar: args.discordAvatar,
        tier: args.tier ?? "free",
        status: args.status ?? "pending",
        botVerified: args.botVerified ?? false,
        verifiedGuilds: args.verifiedGuilds ?? [],
        expiresAt: args.expiresAt,
        subscribedAt: now,
        paymentReference: args.paymentReference,
        features: args.features ?? [],
        metadata: args.metadata,
        createdAt: now,
        updatedAt: now,
      });
      return newSubscription;
    }
  },
});

/**
 * Add verified guild to subscription
 */
export const addVerifiedGuild = mutation({
  args: {
    discordId: v.string(),
    guildId: v.string(),
    guildName: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_discord_id", (q) => q.eq("discordId", args.discordId))
      .first();

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const existingGuild = subscription.verifiedGuilds.find(
      (g) => g.guildId === args.guildId
    );

    if (existingGuild) {
      return subscription._id; // Already verified
    }

    const updatedGuilds = [
      ...subscription.verifiedGuilds,
      {
        guildId: args.guildId,
        guildName: args.guildName,
        verifiedAt: Date.now(),
      },
    ];

    await ctx.db.patch(subscription._id, {
      verifiedGuilds: updatedGuilds,
      updatedAt: Date.now(),
    });

    return subscription._id;
  },
});

/**
 * Remove verified guild from subscription
 */
export const removeVerifiedGuild = mutation({
  args: {
    discordId: v.string(),
    guildId: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_discord_id", (q) => q.eq("discordId", args.discordId))
      .first();

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const updatedGuilds = subscription.verifiedGuilds.filter(
      (g) => g.guildId !== args.guildId
    );

    await ctx.db.patch(subscription._id, {
      verifiedGuilds: updatedGuilds,
      updatedAt: Date.now(),
    });

    return subscription._id;
  },
});

/**
 * Update verification check timestamp
 */
export const updateVerificationCheck = mutation({
  args: { discordId: v.string() },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_discord_id", (q) => q.eq("discordId", args.discordId))
      .first();

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    await ctx.db.patch(subscription._id, {
      lastVerificationCheck: Date.now(),
      updatedAt: Date.now(),
    });

    return subscription._id;
  },
});
