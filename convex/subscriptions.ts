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
  args: { tier: v.union(v.literal("free"), v.literal("plus"), v.literal("ultimate")) },
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
    tier: v.optional(v.union(v.literal("free"), v.literal("plus"), v.literal("ultimate"))),
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

      // Sync tier to servers if guilds provided at creation
      if (args.verifiedGuilds && args.verifiedGuilds.length > 0) {
        for (const guild of args.verifiedGuilds) {
           const server = await ctx.db
            .query("servers")
            .withIndex("by_guild", (q) => q.eq("guildId", guild.guildId))
            .first();
           
           if (server) {
             await ctx.db.patch(server._id, {
               tier: args.tier ?? "free",
               updatedAt: now,
             });
           }
        }
      }

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

    const now = Date.now();

    if (existingGuild) {
      // Already verified
      return subscription._id;
    }

    const newGuild = {
      guildId: args.guildId,
      guildName: args.guildName,
      verifiedAt: now,
      tier: "free" as const,
      status: "active" as const,
      subscribedAt: now,
    };

    const updatedGuilds = [...subscription.verifiedGuilds, newGuild];

    await ctx.db.patch(subscription._id, {
      verifiedGuilds: updatedGuilds,
      updatedAt: now,
    });

    // SYNC TIER TO SERVER
    const server = await ctx.db
      .query("servers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();

    if (server) {
      await ctx.db.patch(server._id, {
        tier: newGuild.tier,
        updatedAt: now,
      });
    } else {
      // If server doesn't exist yet (bot just joined?), create it
      await ctx.db.insert("servers", {
        guildId: args.guildId,
        houseBalance: 0,
        settings: {},
        tier: newGuild.tier,
        createdAt: now,
        updatedAt: now,
      });
    }

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

/**
 * Get guild-specific subscription status
 */
export const getGuildSubscription = query({
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
      return null;
    }

    const guildData = subscription.verifiedGuilds.find(
      (g) => g.guildId === args.guildId
    );

    if (!guildData) {
      return null;
    }

    // Check if paid subscription has expired
    const now = Date.now();
    if (guildData.status === "active" && guildData.expiresAt && guildData.expiresAt < now) {
      return {
        ...guildData,
        status: "expired" as const,
        isSubscriptionExpired: true,
      };
    }

    return guildData;
  },
});

/**
 * Get subscription by metadata (e.g., Clerk user ID)
 */
export const getSubscriptionByMetadata = query({
  args: {
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    // Since Convex doesn't support querying by nested object fields directly,
    // we need to fetch all subscriptions and filter
    const subscriptions = await ctx.db
      .query("subscriptions")
      .collect();

    return subscriptions.find(
      (s) => s.metadata && (s.metadata as Record<string, string>)[args.key] === args.value
    ) || null;
  },
});

/**
 * Get all subscriptions with pagination
 */
export const getAllSubscriptions = query({
  args: {
    tier: v.optional(v.union(v.literal("free"), v.literal("plus"), v.literal("ultimate"))),
    status: v.optional(v.union(v.literal("active"), v.literal("expired"), v.literal("cancelled"), v.literal("pending"))),
    botVerified: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Fetch all subscriptions - Convex handles this efficiently
    const allSubscriptions = await ctx.db
      .query("subscriptions")
      .collect();

    // Apply filters
    let filtered = allSubscriptions;
    if (args.tier) {
      filtered = filtered.filter((s) => s.tier === args.tier);
    }
    if (args.status) {
      filtered = filtered.filter((s) => s.status === args.status);
    }
    if (args.botVerified !== undefined) {
      filtered = filtered.filter((s) => s.botVerified === args.botVerified);
    }

    // Sort by subscribedAt descending
    filtered.sort((a, b) => (b.subscribedAt || 0) - (a.subscribedAt || 0));

    // Apply pagination
    const limit = args.limit || 50;
    const total = filtered.length;
    const paginated = filtered.slice(0, limit);

    return {
      subscriptions: paginated,
      total,
      hasMore: filtered.length > limit,
    };
  },
});

/**
 * Get subscription statistics
 */
export const getSubscriptionStats = query({
  args: {},
  handler: async (ctx) => {
    const subscriptions = await ctx.db
      .query("subscriptions")
      .collect();

    const total = subscriptions.length;
    const verified = subscriptions.filter((s) => s.botVerified).length;

    // Count by tier
    const byTier: Record<string, number> = {};
    for (const sub of subscriptions) {
      byTier[sub.tier] = (byTier[sub.tier] || 0) + 1;
    }

    // Count by status
    const byStatus: Record<string, number> = {};
    for (const sub of subscriptions) {
      byStatus[sub.status] = (byStatus[sub.status] || 0) + 1;
    }

    return {
      total,
      verified,
      byTier,
      byStatus,
    };
  },
});

/**
 * Cancel subscription (set to cancelled and free tier)
 */
export const cancelSubscription = mutation({
  args: { discordId: v.string() },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_discord_id", (q) => q.eq("discordId", args.discordId))
      .first();

    if (!subscription) {
      return null;
    }

    const now = Date.now();

    // Update main subscription
    await ctx.db.patch(subscription._id, {
      status: "cancelled",
      tier: "free",
      updatedAt: now,
    });

    // Update all verified guilds to free tier
    const updatedGuilds = subscription.verifiedGuilds.map((g) => ({
      ...g,
      tier: "free" as const,
      status: "cancelled" as const,
    }));

    await ctx.db.patch(subscription._id, {
      verifiedGuilds: updatedGuilds,
    });

    // Update servers table for all verified guilds
    for (const guild of subscription.verifiedGuilds) {
      const server = await ctx.db
        .query("servers")
        .withIndex("by_guild", (q) => q.eq("guildId", guild.guildId))
        .first();

      if (server) {
        await ctx.db.patch(server._id, {
          tier: "free",
          updatedAt: now,
        });
      }
    }

    return {
      discordId: subscription.discordId,
      status: "cancelled",
      tier: "free",
    };
  },
});

/**
 * Update guild-specific subscription
 */
export const updateGuildSubscription = mutation({
  args: {
    discordId: v.string(),
    guildId: v.string(),
    tier: v.optional(v.union(v.literal("free"), v.literal("plus"), v.literal("ultimate"))),
    status: v.optional(v.union(v.literal("active"), v.literal("expired"), v.literal("cancelled"), v.literal("pending"))),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_discord_id", (q) => q.eq("discordId", args.discordId))
      .first();

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const now = Date.now();

    // Find and update the specific guild
    const updatedGuilds = subscription.verifiedGuilds.map((g) => {
      if (g.guildId === args.guildId) {
        return {
          ...g,
          ...(args.tier !== undefined && { tier: args.tier }),
          ...(args.status !== undefined && { status: args.status }),
          ...(args.expiresAt !== undefined && { expiresAt: args.expiresAt }),
        };
      }
      return g;
    });

    await ctx.db.patch(subscription._id, {
      verifiedGuilds: updatedGuilds,
      updatedAt: now,
    });

    // Sync tier to servers table
    const server = await ctx.db
      .query("servers")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .first();

    const guildData = updatedGuilds.find((g) => g.guildId === args.guildId);
    const tierForServer = guildData?.tier || "free";

    if (server) {
      await ctx.db.patch(server._id, {
        tier: tierForServer,
        updatedAt: now,
      });
    }

    return subscription._id;
  },
});
