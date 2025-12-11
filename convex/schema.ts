import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex Schema for BobbyTheBot
 *
 * Data Partitioning Strategy:
 * - All guilds share the same tables (users, bounties, etc.)
 * - Data is partitioned by 'guildId' field
 * - Compound indexes ensure fast queries per guild
 * - Same approach as MongoDB, but with TypeScript type safety
 *
 * Example:
 * - Guild A and Guild B both use the 'users' table
 * - Queries filter by guildId: { guildId: '123', userId: 'user1' }
 * - Indexes make these queries fast even with millions of records
 */

export default defineSchema({
  // ============================================================================
  // USER TABLE
  // ============================================================================
  users: defineTable({
    guildId: v.string(),
    userId: v.string(),

    // Conversation memory
    memory: v.optional(v.string()),
    personalityScore: v.optional(v.number()),

    // Economy
    balance: v.number(),

    // Activity tracking
    messageCount: v.optional(v.number()),
    lastActive: v.optional(v.number()),
    dailyMessageCount: v.optional(v.number()),
    lastDailyReset: v.optional(v.number()),

    // Virtual Pet (legacy - no longer used, kept for migration compatibility)
    pet: v.optional(v.any()),

    // Birthday
    birthday: v.optional(v.object({
      month: v.number(),
      day: v.number(),
      year: v.optional(v.number()),
      lastBirthdayWish: v.optional(v.number()),
    })),

    // Valorant (legacy - may have incomplete data, kept for migration compatibility)
    valorant: v.optional(v.any()),

    // Gladiator Arena (legacy - kept for migration compatibility)
    gladiatorStats: v.optional(v.any()),

    // Mafia Game (legacy - kept for migration compatibility)
    mafiaStats: v.optional(v.any()),

    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_guild_and_user", ["guildId", "userId"])
    .index("by_guild_and_balance", ["guildId", "balance"])
    .index("by_guild_and_messages", ["guildId", "dailyMessageCount"]),

  // ============================================================================
  // BOUNTY TABLE
  // ============================================================================
  bounties: defineTable({
    guildId: v.string(),
    bountyId: v.string(),
    creatorId: v.string(),
    creatorName: v.string(),
    description: v.string(),
    reward: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("claimed"),
      v.literal("expired"),
      v.literal("cancelled")
    ),
    claimedBy: v.optional(v.string()),
    claimedByName: v.optional(v.string()),
    proofUrl: v.optional(v.string()),
    channelId: v.string(),
    messageId: v.optional(v.string()),
    createdAt: v.number(),
    expiresAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_guild_and_status", ["guildId", "status"])
    .index("by_status", ["status"])
    .index("by_guild_and_expiry", ["guildId", "expiresAt"])
    .index("by_bounty_id", ["bountyId"])
    .index("by_guild_creator", ["guildId", "creatorId"]),

  // ============================================================================
  // CHALLENGE TABLE
  // ============================================================================
  challenges: defineTable({
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
    challenged: v.optional(v.string()),
    challengedName: v.optional(v.string()),
    amount: v.number(),
    channelId: v.string(),

    // Gladiator specific
    gladiatorClass: v.optional(v.string()),
    challengerAvatarURL: v.optional(v.string()),
    challengedAvatarURL: v.optional(v.string()),

    createdAt: v.number(),
    expiresAt: v.number(), // For TTL cleanup
  })
    .index("by_challenge_id", ["challengeId"])
    .index("by_guild", ["guildId"])
    .index("by_expiry", ["expiresAt"]),

  // ============================================================================
  // TEAM HISTORY TABLE
  // ============================================================================
  teamHistories: defineTable({
    guildId: v.string(),
    teamId: v.string(),
    leaderId: v.string(),
    leaderName: v.string(),
    memberIds: v.array(v.string()),
    memberNames: v.array(v.string()),
    channelId: v.string(),
    createdAt: v.number(),
    completedAt: v.number(),
    status: v.union(
      v.literal("completed"),
      v.literal("disbanded"),
      v.literal("timeout")
    ),
    matchResult: v.optional(v.union(
      v.literal("win"),
      v.literal("loss"),
      v.literal("pending"),
      v.null()
    )),
    matchScore: v.optional(v.string()),
    reportedBy: v.optional(v.string()),
    reportedAt: v.optional(v.number()),

    stats: v.optional(v.object({
      maxMembers: v.optional(v.number()),
      totalJoins: v.optional(v.number()),
      totalLeaves: v.optional(v.number()),
      durationMinutes: v.optional(v.number()),
    })),
  })
    .index("by_guild_and_created", ["guildId", "createdAt"])
    .index("by_guild_and_leader", ["guildId", "leaderId"])
    .index("by_team_id", ["teamId"]),

  // ============================================================================
  // TRIVIA SESSION TABLE
  // ============================================================================
  triviaSessions: defineTable({
    guildId: v.string(),
    sessionToken: v.optional(v.string()),
    lastUsed: v.number(),

    activeQuestion: v.optional(v.object({
      question: v.string(),
      correctAnswer: v.string(),
      incorrectAnswers: v.array(v.string()),
      allAnswers: v.array(v.string()),
      difficulty: v.string(),
      category: v.string(),
      postedAt: v.number(),
      messageId: v.optional(v.string()),
      answered: v.boolean(),
      answeredAt: v.optional(v.number()),
    })),

    questionHistory: v.array(v.string()),
    totalQuestions: v.number(),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_guild", ["guildId"]),

  // ============================================================================
  // WORDLE SCORE TABLE
  // ============================================================================
  wordleScores: defineTable({
    guildId: v.string(),
    userId: v.string(),

    scores: v.array(v.object({
      score: v.number(),
      timestamp: v.number(),
      honeyAwarded: v.number(),
    })),

    totalGames: v.number(),
    totalHoney: v.number(),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_guild_and_user", ["guildId", "userId"])
    .index("by_guild_and_games", ["guildId", "totalGames"]),

  // ============================================================================
  // WORDLE MONTHLY WINNER TABLE
  // ============================================================================
  wordleMonthlyWinners: defineTable({
    guildId: v.string(),
    month: v.string(), // Format: "YYYY-MM"

    winner: v.object({
      userId: v.string(),
      username: v.string(),
      stats: v.object({
        totalGames: v.number(),
        avgScore: v.number(),
        bestScore: v.number(),
        weightedScore: v.number(),
        totalHoney: v.number(),
      }),
    }),

    topTen: v.array(v.object({
      userId: v.string(),
      username: v.string(),
      totalGames: v.number(),
      avgScore: v.number(),
      bestScore: v.number(),
      weightedScore: v.number(),
      totalHoney: v.number(),
      position: v.number(),
    })),

    announcedAt: v.optional(v.number()),
    totalPlayers: v.number(),
    totalGamesPlayed: v.number(),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_guild_and_month", ["guildId", "month"]),

  // ============================================================================
  // SHOP ITEMS TABLE
  // ============================================================================
  shopItems: defineTable({
    guildId: v.string(),
    itemId: v.string(), // Unique identifier for the item
    title: v.string(),
    description: v.optional(v.string()),
    price: v.number(),
    imageUrl: v.optional(v.string()),
    stock: v.optional(v.number()), // null = unlimited
    maxPerUser: v.optional(v.number()), // null = unlimited
    enabled: v.boolean(),
    roleReward: v.optional(v.string()), // Role ID to give on purchase
    messageId: v.optional(v.string()), // Discord message ID for the shop embed
    sortOrder: v.number(), // For ordering items in the shop
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_guild", ["guildId"])
    .index("by_guild_and_item", ["guildId", "itemId"])
    .index("by_guild_and_enabled", ["guildId", "enabled"])
    .index("by_guild_and_order", ["guildId", "sortOrder"]),

  // ============================================================================
  // SHOP PURCHASES TABLE
  // ============================================================================
  shopPurchases: defineTable({
    guildId: v.string(),
    itemId: v.string(),
    userId: v.string(),
    username: v.string(),
    price: v.number(), // Price at time of purchase
    itemTitle: v.string(), // Title at time of purchase
    purchasedAt: v.number(),
    notified: v.boolean(), // Whether admin notification was sent
  })
    .index("by_guild", ["guildId"])
    .index("by_guild_and_item", ["guildId", "itemId"])
    .index("by_guild_and_user", ["guildId", "userId"])
    .index("by_guild_item_user", ["guildId", "itemId", "userId"]),

  // ============================================================================
  // SERVER TABLE (Guild-wide settings)
  // ============================================================================
  servers: defineTable({
    guildId: v.string(),
    houseBalance: v.number(),
    lastVotingDate: v.optional(v.number()),
    settings: v.optional(v.record(v.string(), v.any())),
    tier: v.optional(v.string()), // "free", "basic", "premium", "enterprise"

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_guild", ["guildId"]),

  // ============================================================================
  // SUBSCRIPTION TABLE (Global - not per-guild)
  // ============================================================================
  subscriptions: defineTable({
    discordId: v.string(),
    discordUsername: v.optional(v.string()),
    discordAvatar: v.optional(v.string()),
    tier: v.union(
      v.literal("free"),
      v.literal("plus"),
      v.literal("ultimate")
    ),
    status: v.union(
      v.literal("active"),
      v.literal("expired"),
      v.literal("cancelled"),
      v.literal("pending")
    ),
    botVerified: v.boolean(),

    verifiedGuilds: v.array(v.object({
      guildId: v.string(),
      guildName: v.string(),
      verifiedAt: v.number(),
      // Per-guild subscription data
      tier: v.optional(v.union(
        v.literal("free"),
        v.literal("plus"),
        v.literal("ultimate")
      )),
      status: v.optional(v.union(
        v.literal("active"),
        v.literal("expired"),
        v.literal("cancelled"),
        v.literal("pending"),
        v.literal("trial")
      )),
      expiresAt: v.optional(v.number()),
      subscribedAt: v.optional(v.number()),
      trialEndsAt: v.optional(v.number()),
    })),

    lastVerificationCheck: v.optional(v.number()),
    subscribedAt: v.number(),
    expiresAt: v.optional(v.number()),
    paymentReference: v.optional(v.string()),
    features: v.array(v.string()),
    metadata: v.optional(v.record(v.string(), v.any())),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_discord_id", ["discordId"])
    .index("by_status", ["status"])
    .index("by_tier", ["tier"]),
});
