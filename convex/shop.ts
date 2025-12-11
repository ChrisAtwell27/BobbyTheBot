import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// SHOP ITEM QUERIES
// ============================================================================

/**
 * Get all shop items for a guild
 */
export const getItems = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    return await ctx.db
      .query("shopItems")
      .withIndex("by_guild", (q) => q.eq("guildId", guildId))
      .collect();
  },
});

/**
 * Get enabled shop items for a guild (sorted by order)
 */
export const getEnabledItems = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const items = await ctx.db
      .query("shopItems")
      .withIndex("by_guild_and_enabled", (q) =>
        q.eq("guildId", guildId).eq("enabled", true)
      )
      .collect();
    return items.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/**
 * Get a specific shop item
 */
export const getItem = query({
  args: { guildId: v.string(), itemId: v.string() },
  handler: async (ctx, { guildId, itemId }) => {
    return await ctx.db
      .query("shopItems")
      .withIndex("by_guild_and_item", (q) =>
        q.eq("guildId", guildId).eq("itemId", itemId)
      )
      .first();
  },
});

/**
 * Get purchase count for a user on a specific item
 */
export const getUserPurchaseCount = query({
  args: { guildId: v.string(), itemId: v.string(), userId: v.string() },
  handler: async (ctx, { guildId, itemId, userId }) => {
    const purchases = await ctx.db
      .query("shopPurchases")
      .withIndex("by_guild_item_user", (q) =>
        q.eq("guildId", guildId).eq("itemId", itemId).eq("userId", userId)
      )
      .collect();
    return purchases.length;
  },
});

/**
 * Get all purchases for a guild
 */
export const getPurchases = query({
  args: { guildId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { guildId, limit }) => {
    const query = ctx.db
      .query("shopPurchases")
      .withIndex("by_guild", (q) => q.eq("guildId", guildId))
      .order("desc");

    if (limit) {
      return await query.take(limit);
    }
    return await query.collect();
  },
});

/**
 * Get purchases for a specific user
 */
export const getUserPurchases = query({
  args: { guildId: v.string(), userId: v.string() },
  handler: async (ctx, { guildId, userId }) => {
    return await ctx.db
      .query("shopPurchases")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", guildId).eq("userId", userId)
      )
      .collect();
  },
});

// ============================================================================
// SHOP ITEM MUTATIONS
// ============================================================================

/**
 * Create a new shop item
 */
export const createItem = mutation({
  args: {
    guildId: v.string(),
    itemId: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    price: v.number(),
    imageUrl: v.optional(v.string()),
    stock: v.optional(v.number()),
    maxPerUser: v.optional(v.number()),
    roleReward: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if item already exists
    const existing = await ctx.db
      .query("shopItems")
      .withIndex("by_guild_and_item", (q) =>
        q.eq("guildId", args.guildId).eq("itemId", args.itemId)
      )
      .first();

    if (existing) {
      throw new Error(`Item with ID ${args.itemId} already exists`);
    }

    // Get next sort order if not provided
    let sortOrder = args.sortOrder;
    if (sortOrder === undefined) {
      const items = await ctx.db
        .query("shopItems")
        .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
        .collect();
      sortOrder = items.length > 0 ? Math.max(...items.map((i) => i.sortOrder)) + 1 : 0;
    }

    return await ctx.db.insert("shopItems", {
      guildId: args.guildId,
      itemId: args.itemId,
      title: args.title,
      description: args.description,
      price: args.price,
      imageUrl: args.imageUrl,
      stock: args.stock,
      maxPerUser: args.maxPerUser,
      roleReward: args.roleReward,
      enabled: true,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update an existing shop item
 */
export const updateItem = mutation({
  args: {
    guildId: v.string(),
    itemId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    price: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    stock: v.optional(v.number()),
    maxPerUser: v.optional(v.number()),
    roleReward: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
    messageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db
      .query("shopItems")
      .withIndex("by_guild_and_item", (q) =>
        q.eq("guildId", args.guildId).eq("itemId", args.itemId)
      )
      .first();

    if (!item) {
      throw new Error(`Item with ID ${args.itemId} not found`);
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.price !== undefined) updates.price = args.price;
    if (args.imageUrl !== undefined) updates.imageUrl = args.imageUrl;
    if (args.stock !== undefined) updates.stock = args.stock;
    if (args.maxPerUser !== undefined) updates.maxPerUser = args.maxPerUser;
    if (args.roleReward !== undefined) updates.roleReward = args.roleReward;
    if (args.enabled !== undefined) updates.enabled = args.enabled;
    if (args.sortOrder !== undefined) updates.sortOrder = args.sortOrder;
    if (args.messageId !== undefined) updates.messageId = args.messageId;

    await ctx.db.patch(item._id, updates);
    return true;
  },
});

/**
 * Delete a shop item
 */
export const deleteItem = mutation({
  args: { guildId: v.string(), itemId: v.string() },
  handler: async (ctx, { guildId, itemId }) => {
    const item = await ctx.db
      .query("shopItems")
      .withIndex("by_guild_and_item", (q) =>
        q.eq("guildId", guildId).eq("itemId", itemId)
      )
      .first();

    if (!item) {
      return false;
    }

    await ctx.db.delete(item._id);
    return true;
  },
});

/**
 * Record a purchase
 */
export const recordPurchase = mutation({
  args: {
    guildId: v.string(),
    itemId: v.string(),
    userId: v.string(),
    username: v.string(),
    price: v.number(),
    itemTitle: v.string(),
  },
  handler: async (ctx, args) => {
    // Record the purchase
    const purchaseId = await ctx.db.insert("shopPurchases", {
      guildId: args.guildId,
      itemId: args.itemId,
      userId: args.userId,
      username: args.username,
      price: args.price,
      itemTitle: args.itemTitle,
      purchasedAt: Date.now(),
      notified: false,
    });

    // Decrement stock if applicable
    const item = await ctx.db
      .query("shopItems")
      .withIndex("by_guild_and_item", (q) =>
        q.eq("guildId", args.guildId).eq("itemId", args.itemId)
      )
      .first();

    if (item && item.stock !== undefined && item.stock !== null) {
      await ctx.db.patch(item._id, {
        stock: Math.max(0, item.stock - 1),
        updatedAt: Date.now(),
      });
    }

    return purchaseId;
  },
});

/**
 * Mark a purchase as notified
 */
export const markPurchaseNotified = mutation({
  args: { purchaseId: v.id("shopPurchases") },
  handler: async (ctx, { purchaseId }) => {
    await ctx.db.patch(purchaseId, { notified: true });
    return true;
  },
});

/**
 * Reorder shop items
 */
export const reorderItems = mutation({
  args: {
    guildId: v.string(),
    itemIds: v.array(v.string()),
  },
  handler: async (ctx, { guildId, itemIds }) => {
    for (let i = 0; i < itemIds.length; i++) {
      const item = await ctx.db
        .query("shopItems")
        .withIndex("by_guild_and_item", (q) =>
          q.eq("guildId", guildId).eq("itemId", itemIds[i])
        )
        .first();

      if (item) {
        await ctx.db.patch(item._id, {
          sortOrder: i,
          updatedAt: Date.now(),
        });
      }
    }
    return true;
  },
});
