import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Daily Mafia Convex Functions
 * Database operations for asynchronous Daily Mafia games
 */

// ============================================================================
// GAME QUERIES & MUTATIONS
// ============================================================================

/**
 * Create a new daily mafia game
 */
export const createGame = mutation({
  args: {
    gameId: v.string(),
    guildId: v.string(),
    channelId: v.string(),
    organizerId: v.string(),
    debugMode: v.boolean(),
    revealRoles: v.boolean(),
    tier: v.union(v.literal("plus"), v.literal("ultimate")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const phaseDeadline = args.debugMode
      ? now + 5 * 60 * 1000 // 5 minutes for debug
      : now + 24 * 60 * 60 * 1000; // 24 hours for normal

    // Lobby deadline: 24 hours from creation (or 10 minutes for debug)
    const lobbyDeadline = args.debugMode
      ? now + 10 * 60 * 1000 // 10 minutes for debug
      : now + 24 * 60 * 60 * 1000; // 24 hours for normal

    const gameData = {
      gameId: args.gameId,
      guildId: args.guildId,
      channelId: args.channelId,
      organizerId: args.organizerId,
      phase: "setup" as const,
      nightNumber: 0,
      dayNumber: 0,
      phaseStartTime: now,
      phaseDeadline,
      lobbyDeadline,
      status: "pending" as const,
      debugMode: args.debugMode,
      revealRoles: args.revealRoles,
      tier: args.tier,
      framedPlayers: [],
      dousedPlayers: [],
      deceivedPlayers: [],
      blackmailedPlayers: [],
      kidnappedPlayers: [],
      sabotagedPlayers: [],
      hypnotizedPlayers: [],
      silencedPlayers: [],
      createdAt: now,
      lastActivityAt: now,
    };

    const id = await ctx.db.insert("dailyMafiaGames", gameData);
    return id;
  },
});

/**
 * Get game by game ID
 */
export const getGame = query({
  args: { gameId: v.string() },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db
      .query("dailyMafiaGames")
      .withIndex("by_game_id", (q) => q.eq("gameId", gameId))
      .first();
    return game;
  },
});

/**
 * Get active games for a guild
 */
export const getActiveGames = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const games = await ctx.db
      .query("dailyMafiaGames")
      .withIndex("by_guild_and_status", (q) =>
        q.eq("guildId", guildId).eq("status", "active")
      )
      .collect();
    return games;
  },
});

/**
 * Get all active and pending games (for deadline checking)
 */
export const getAllActiveGames = query({
  handler: async (ctx) => {
    // Get both active games (for phase deadlines) and pending games (for lobby deadlines)
    const activeGames = await ctx.db
      .query("dailyMafiaGames")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return games;
  },
});

/**
 * Update game state
 */
export const updateGame = mutation({
  args: {
    gameId: v.string(),
    updates: v.object({
      phase: v.optional(v.union(
        v.literal("setup"),
        v.literal("night"),
        v.literal("day"),
        v.literal("voting"),
        v.literal("ended")
      )),
      nightNumber: v.optional(v.number()),
      dayNumber: v.optional(v.number()),
      phaseStartTime: v.optional(v.number()),
      phaseDeadline: v.optional(v.number()),
      status: v.optional(v.union(
        v.literal("pending"),
        v.literal("active"),
        v.literal("completed"),
        v.literal("cancelled")
      )),
      statusMessageId: v.optional(v.string()),
      framedPlayers: v.optional(v.array(v.string())),
      dousedPlayers: v.optional(v.array(v.string())),
      deceivedPlayers: v.optional(v.array(v.string())),
      blackmailedPlayers: v.optional(v.array(v.string())),
      kidnappedPlayers: v.optional(v.array(v.string())),
      sabotagedPlayers: v.optional(v.array(v.string())),
      hypnotizedPlayers: v.optional(v.array(v.string())),
      silencedPlayers: v.optional(v.array(v.string())),
    }),
  },
  handler: async (ctx, { gameId, updates }) => {
    const game = await ctx.db
      .query("dailyMafiaGames")
      .withIndex("by_game_id", (q) => q.eq("gameId", gameId))
      .first();

    if (!game) throw new Error(`Game ${gameId} not found`);

    await ctx.db.patch(game._id, {
      ...updates,
      lastActivityAt: Date.now(),
    });

    return true;
  },
});

// ============================================================================
// PLAYER QUERIES & MUTATIONS
// ============================================================================

/**
 * Add player to game
 */
export const addPlayer = mutation({
  args: {
    gameId: v.string(),
    playerId: v.string(),
    displayName: v.string(),
    role: v.string(),
    roleResources: v.optional(v.object({
      bulletsRemaining: v.optional(v.number()),
      vestsRemaining: v.optional(v.number()),
      alertsRemaining: v.optional(v.number()),
      jailsRemaining: v.optional(v.number()),
      seancesRemaining: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const playerData = {
      gameId: args.gameId,
      playerId: args.playerId,
      displayName: args.displayName,
      role: args.role,
      alive: true,
      hasActedThisPhase: false,
      isInactive: false,
      bulletsRemaining: args.roleResources?.bulletsRemaining,
      vestsRemaining: args.roleResources?.vestsRemaining,
      alertsRemaining: args.roleResources?.alertsRemaining,
      jailsRemaining: args.roleResources?.jailsRemaining,
      seancesRemaining: args.roleResources?.seancesRemaining,
      joinedAt: Date.now(),
    };

    const id = await ctx.db.insert("dailyMafiaPlayers", playerData);
    return id;
  },
});

/**
 * Get all players for a game
 */
export const getPlayers = query({
  args: { gameId: v.string() },
  handler: async (ctx, { gameId }) => {
    const players = await ctx.db
      .query("dailyMafiaPlayers")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    return players;
  },
});

/**
 * Get alive players for a game
 */
export const getAlivePlayers = query({
  args: { gameId: v.string() },
  handler: async (ctx, { gameId }) => {
    const players = await ctx.db
      .query("dailyMafiaPlayers")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .filter((q) => q.eq(q.field("alive"), true))
      .collect();
    return players;
  },
});

/**
 * Get player by game and player ID
 */
export const getPlayer = query({
  args: { gameId: v.string(), playerId: v.string() },
  handler: async (ctx, { gameId, playerId }) => {
    const player = await ctx.db
      .query("dailyMafiaPlayers")
      .withIndex("by_game_and_player", (q) =>
        q.eq("gameId", gameId).eq("playerId", playerId)
      )
      .first();
    return player;
  },
});

/**
 * Get player's active game
 */
export const getPlayerActiveGame = query({
  args: { playerId: v.string() },
  handler: async (ctx, { playerId }) => {
    const player = await ctx.db
      .query("dailyMafiaPlayers")
      .withIndex("by_player_active_games", (q) => q.eq("playerId", playerId))
      .first();

    if (!player) return null;

    const game = await ctx.db
      .query("dailyMafiaGames")
      .withIndex("by_game_id", (q) => q.eq("gameId", player.gameId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    return game;
  },
});

/**
 * Update player
 */
export const updatePlayer = mutation({
  args: {
    gameId: v.string(),
    playerId: v.string(),
    updates: v.object({
      alive: v.optional(v.boolean()),
      hasActedThisPhase: v.optional(v.boolean()),
      lastActionTime: v.optional(v.number()),
      isInactive: v.optional(v.boolean()),
      bulletsRemaining: v.optional(v.number()),
      vestsRemaining: v.optional(v.number()),
      alertsRemaining: v.optional(v.number()),
      jailsRemaining: v.optional(v.number()),
      seancesRemaining: v.optional(v.number()),
      deathReason: v.optional(v.string()),
      deathPhase: v.optional(v.string()),
      deathNight: v.optional(v.number()),
    }),
  },
  handler: async (ctx, { gameId, playerId, updates }) => {
    const player = await ctx.db
      .query("dailyMafiaPlayers")
      .withIndex("by_game_and_player", (q) =>
        q.eq("gameId", gameId).eq("playerId", playerId)
      )
      .first();

    if (!player) throw new Error(`Player ${playerId} not found in game ${gameId}`);

    await ctx.db.patch(player._id, updates);
    return true;
  },
});

/**
 * Reset hasActedThisPhase for all alive players
 */
export const resetPhaseActions = mutation({
  args: { gameId: v.string() },
  handler: async (ctx, { gameId }) => {
    const players = await ctx.db
      .query("dailyMafiaPlayers")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .filter((q) => q.eq(q.field("alive"), true))
      .collect();

    for (const player of players) {
      await ctx.db.patch(player._id, {
        hasActedThisPhase: false,
        lastActionTime: undefined,
      });
    }

    return true;
  },
});

// ============================================================================
// ACTION QUERIES & MUTATIONS
// ============================================================================

/**
 * Upsert action (create or update)
 */
export const upsertAction = mutation({
  args: {
    gameId: v.string(),
    nightNumber: v.number(),
    playerId: v.string(),
    actionType: v.string(),
    targetId: v.optional(v.string()),
    keyword: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if action already exists
    const existing = await ctx.db
      .query("dailyMafiaActions")
      .withIndex("by_game_night_player", (q) =>
        q.eq("gameId", args.gameId)
         .eq("nightNumber", args.nightNumber)
         .eq("playerId", args.playerId)
      )
      .first();

    const actionData = {
      actionType: args.actionType,
      targetId: args.targetId,
      keyword: args.keyword,
      submittedAt: Date.now(),
      processed: false,
    };

    if (existing) {
      // Update existing action
      await ctx.db.patch(existing._id, actionData);
      return existing._id;
    } else {
      // Create new action
      const id = await ctx.db.insert("dailyMafiaActions", {
        gameId: args.gameId,
        nightNumber: args.nightNumber,
        playerId: args.playerId,
        ...actionData,
      });
      return id;
    }
  },
});

/**
 * Get actions for a night
 */
export const getActionsForNight = query({
  args: { gameId: v.string(), nightNumber: v.number() },
  handler: async (ctx, { gameId, nightNumber }) => {
    const actions = await ctx.db
      .query("dailyMafiaActions")
      .withIndex("by_game_and_night", (q) =>
        q.eq("gameId", gameId).eq("nightNumber", nightNumber)
      )
      .collect();
    return actions;
  },
});

/**
 * Mark all actions as processed
 */
export const markActionsProcessed = mutation({
  args: { gameId: v.string(), nightNumber: v.number() },
  handler: async (ctx, { gameId, nightNumber }) => {
    const actions = await ctx.db
      .query("dailyMafiaActions")
      .withIndex("by_game_and_night", (q) =>
        q.eq("gameId", gameId).eq("nightNumber", nightNumber)
      )
      .collect();

    for (const action of actions) {
      await ctx.db.patch(action._id, { processed: true });
    }

    return true;
  },
});

// ============================================================================
// VOTE QUERIES & MUTATIONS
// ============================================================================

/**
 * Upsert vote (create or update)
 */
export const upsertVote = mutation({
  args: {
    gameId: v.string(),
    dayNumber: v.number(),
    voterId: v.string(),
    targetId: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if vote already exists
    const existing = await ctx.db
      .query("dailyMafiaVotes")
      .withIndex("by_game_day_voter", (q) =>
        q.eq("gameId", args.gameId)
         .eq("dayNumber", args.dayNumber)
         .eq("voterId", args.voterId)
      )
      .first();

    const voteData = {
      targetId: args.targetId,
      votedAt: Date.now(),
    };

    if (existing) {
      // Update existing vote
      await ctx.db.patch(existing._id, voteData);
      return existing._id;
    } else {
      // Create new vote
      const id = await ctx.db.insert("dailyMafiaVotes", {
        gameId: args.gameId,
        dayNumber: args.dayNumber,
        voterId: args.voterId,
        ...voteData,
      });
      return id;
    }
  },
});

/**
 * Get votes for a day
 */
export const getVotesForDay = query({
  args: { gameId: v.string(), dayNumber: v.number() },
  handler: async (ctx, { gameId, dayNumber }) => {
    const votes = await ctx.db
      .query("dailyMafiaVotes")
      .withIndex("by_game_and_day", (q) =>
        q.eq("gameId", gameId).eq("dayNumber", dayNumber)
      )
      .collect();
    return votes;
  },
});

/**
 * Delete vote
 */
export const deleteVote = mutation({
  args: {
    gameId: v.string(),
    dayNumber: v.number(),
    voterId: v.string(),
  },
  handler: async (ctx, { gameId, dayNumber, voterId }) => {
    const vote = await ctx.db
      .query("dailyMafiaVotes")
      .withIndex("by_game_day_voter", (q) =>
        q.eq("gameId", gameId)
         .eq("dayNumber", dayNumber)
         .eq("voterId", voterId)
      )
      .first();

    if (vote) {
      await ctx.db.delete(vote._id);
      return true;
    }

    return false;
  },
});

// ============================================================================
// EVENT QUERIES & MUTATIONS
// ============================================================================

/**
 * Create event
 */
export const createEvent = mutation({
  args: {
    gameId: v.string(),
    phase: v.string(),
    phaseNumber: v.number(),
    eventType: v.union(
      v.literal("death"),
      v.literal("phase_change"),
      v.literal("action"),
      v.literal("vote"),
      v.literal("win"),
      v.literal("conversion"),
      v.literal("other")
    ),
    description: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("dailyMafiaEvents", {
      ...args,
      timestamp: Date.now(),
    });
    return id;
  },
});

/**
 * Get recent events
 */
export const getRecentEvents = query({
  args: { gameId: v.string(), limit: v.number() },
  handler: async (ctx, { gameId, limit }) => {
    const events = await ctx.db
      .query("dailyMafiaEvents")
      .withIndex("by_game_and_timestamp", (q) => q.eq("gameId", gameId))
      .order("desc")
      .take(limit);
    return events;
  },
});

/**
 * Get all events for a game
 */
export const getAllEvents = query({
  args: { gameId: v.string() },
  handler: async (ctx, { gameId }) => {
    const events = await ctx.db
      .query("dailyMafiaEvents")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    return events;
  },
});
