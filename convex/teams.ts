import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get a team by teamId
 */
export const getTeam = query({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    const team = await ctx.db
      .query("teamHistories")
      .withIndex("by_team_id", (q) => q.eq("teamId", args.teamId))
      .first();
    return team;
  },
});

/**
 * Get teams for a guild
 */
export const getGuildTeams = query({
  args: { guildId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const teams = await ctx.db
      .query("teamHistories")
      .withIndex("by_guild_and_created", (q) => q.eq("guildId", args.guildId))
      .order("desc")
      .take(limit);
    return teams;
  },
});

/**
 * Get teams for a specific user (as leader or member)
 */
export const getUserTeams = query({
  args: { guildId: v.string(), userId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;

    // Get teams where user is leader
    const leaderTeams = await ctx.db
      .query("teamHistories")
      .withIndex("by_guild_and_leader", (q) =>
        q.eq("guildId", args.guildId).eq("leaderId", args.userId)
      )
      .order("desc")
      .take(limit);

    // Get teams where user is a member
    const memberTeams = await ctx.db
      .query("teamHistories")
      .withIndex("by_guild_and_created", (q) => q.eq("guildId", args.guildId))
      .filter((q) => q.eq(q.field("memberIds"), args.userId))
      .order("desc")
      .take(limit);

    // Combine and sort by completedAt
    const allTeams = [...leaderTeams, ...memberTeams]
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, limit);

    return allTeams;
  },
});

/**
 * Get team stats for a user
 */
export const getUserTeamStats = query({
  args: { guildId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const leaderTeams = await ctx.db
      .query("teamHistories")
      .withIndex("by_guild_and_leader", (q) =>
        q.eq("guildId", args.guildId).eq("leaderId", args.userId)
      )
      .collect();

    const memberTeams = await ctx.db
      .query("teamHistories")
      .withIndex("by_guild_and_created", (q) => q.eq("guildId", args.guildId))
      .filter((q) => q.eq(q.field("memberIds"), args.userId))
      .collect();

    return {
      teamsLed: leaderTeams.length,
      teamsJoined: memberTeams.length,
      totalTeams: leaderTeams.length + memberTeams.length,
    };
  },
});

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Save a team to history
 */
export const saveTeamHistory = mutation({
  args: {
    guildId: v.string(),
    teamId: v.string(),
    leaderId: v.string(),
    leaderName: v.string(),
    memberIds: v.array(v.string()),
    memberNames: v.array(v.string()),
    channelId: v.string(),
    createdAt: v.number(),
    status: v.union(
      v.literal("completed"),
      v.literal("disbanded"),
      v.literal("timeout")
    ),
    matchResult: v.optional(
      v.union(v.literal("win"), v.literal("loss"), v.literal("pending"), v.null())
    ),
    matchScore: v.optional(v.string()),
    reportedBy: v.optional(v.string()),
    reportedAt: v.optional(v.number()),
    stats: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const team = await ctx.db.insert("teamHistories", {
      guildId: args.guildId,
      teamId: args.teamId,
      leaderId: args.leaderId,
      leaderName: args.leaderName,
      memberIds: args.memberIds,
      memberNames: args.memberNames,
      channelId: args.channelId,
      createdAt: args.createdAt,
      completedAt: now,
      status: args.status,
      matchResult: args.matchResult,
      matchScore: args.matchScore,
      reportedBy: args.reportedBy,
      reportedAt: args.reportedAt,
      stats: args.stats,
    });

    return team;
  },
});

/**
 * Update team match result
 */
export const updateMatchResult = mutation({
  args: {
    teamId: v.string(),
    matchResult: v.union(v.literal("win"), v.literal("loss"), v.literal("pending")),
    matchScore: v.optional(v.string()),
    reportedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const team = await ctx.db
      .query("teamHistories")
      .withIndex("by_team_id", (q) => q.eq("teamId", args.teamId))
      .first();

    if (!team) {
      throw new Error("Team not found");
    }

    await ctx.db.patch(team._id, {
      matchResult: args.matchResult,
      matchScore: args.matchScore,
      reportedBy: args.reportedBy,
      reportedAt: Date.now(),
    });

    return team._id;
  },
});

/**
 * Cleanup old team history (older than specified days)
 */
export const cleanupOldHistory = mutation({
  args: { guildId: v.string(), daysToKeep: v.number() },
  handler: async (ctx, args) => {
    const cutoffDate = Date.now() - args.daysToKeep * 24 * 60 * 60 * 1000;

    const oldTeams = await ctx.db
      .query("teamHistories")
      .withIndex("by_guild_and_created", (q) => q.eq("guildId", args.guildId))
      .filter((q) => q.lt(q.field("completedAt"), cutoffDate))
      .collect();

    for (const team of oldTeams) {
      await ctx.db.delete(team._id);
    }

    return oldTeams.length;
  },
});
