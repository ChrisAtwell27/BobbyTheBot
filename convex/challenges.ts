import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get a challenge by challengeId
 */
export const getChallenge = query({
  args: { challengeId: v.string() },
  handler: async (ctx, args) => {
    const challenge = await ctx.db
      .query("challenges")
      .withIndex("by_challenge_id", (q) => q.eq("challengeId", args.challengeId))
      .first();
    return challenge;
  },
});

/**
 * Get all challenges for a guild
 */
export const getAllChallenges = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    const challenges = await ctx.db
      .query("challenges")
      .withIndex("by_guild", (q) => q.eq("guildId", args.guildId))
      .collect();
    return challenges;
  },
});

/**
 * Get expired challenges (for cleanup)
 */
export const getExpiredChallenges = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const challenges = await ctx.db
      .query("challenges")
      .withIndex("by_expiry")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();
    return challenges;
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Create a new challenge
 */
export const createChallenge = mutation({
  args: {
    guildId: v.string(),
    challengeId: v.string(),
    type: v.union(
      v.literal("rps"),
      v.literal("highercard"),
      v.literal("quickdraw"),
      v.literal("numberduel"),
      v.literal("gladiator")
    ),
    creator: v.string(),
    creatorName: v.string(),
    amount: v.number(),
    channelId: v.string(),
    challenged: v.optional(v.string()),
    challengedName: v.optional(v.string()),
    gladiatorClass: v.optional(v.string()),
    challengerAvatarURL: v.optional(v.string()),
    challengedAvatarURL: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const expiresAt = now + 5 * 60 * 1000; // 5 minutes

    const challenge = await ctx.db.insert("challenges", {
      guildId: args.guildId,
      challengeId: args.challengeId,
      type: args.type,
      creator: args.creator,
      creatorName: args.creatorName,
      amount: args.amount,
      channelId: args.channelId,
      challenged: args.challenged,
      challengedName: args.challengedName,
      gladiatorClass: args.gladiatorClass,
      challengerAvatarURL: args.challengerAvatarURL,
      challengedAvatarURL: args.challengedAvatarURL,
      createdAt: now,
      expiresAt: expiresAt,
    });

    return challenge;
  },
});

/**
 * Delete a challenge
 */
export const deleteChallenge = mutation({
  args: { challengeId: v.string() },
  handler: async (ctx, args) => {
    const challenge = await ctx.db
      .query("challenges")
      .withIndex("by_challenge_id", (q) => q.eq("challengeId", args.challengeId))
      .first();

    if (challenge) {
      await ctx.db.delete(challenge._id);
      return true;
    }
    return false;
  },
});

/**
 * Cleanup expired challenges (TTL replacement)
 * This should be called periodically by a cron job
 */
export const cleanupExpiredChallenges = mutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("challenges")
      .withIndex("by_expiry")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    for (const challenge of expired) {
      await ctx.db.delete(challenge._id);
    }

    return expired.length;
  },
});
