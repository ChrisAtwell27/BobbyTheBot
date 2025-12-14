import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================================================
// TOURNAMENT QUERIES
// ============================================================================

/**
 * Get a tournament by tournamentId
 */
export const getTournament = query({
  args: { guildId: v.string(), tournamentId: v.string() },
  handler: async (ctx, { guildId, tournamentId }) => {
    return await ctx.db
      .query("tournaments")
      .withIndex("by_tournament_id", (q) =>
        q.eq("guildId", guildId).eq("tournamentId", tournamentId)
      )
      .first();
  },
});

/**
 * Get all active tournaments for a guild (open, closed, or active status)
 */
export const getActiveTournaments = query({
  args: { guildId: v.string() },
  handler: async (ctx, { guildId }) => {
    const openTournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_guild_and_status", (q) =>
        q.eq("guildId", guildId).eq("status", "open")
      )
      .collect();

    const closedTournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_guild_and_status", (q) =>
        q.eq("guildId", guildId).eq("status", "closed")
      )
      .collect();

    const activeTournaments = await ctx.db
      .query("tournaments")
      .withIndex("by_guild_and_status", (q) =>
        q.eq("guildId", guildId).eq("status", "active")
      )
      .collect();

    return [...openTournaments, ...closedTournaments, ...activeTournaments]
      .sort((a, b) => a.startTime - b.startTime);
  },
});

/**
 * Get all tournaments for a guild
 */
export const getAllTournaments = query({
  args: { guildId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { guildId, limit }) => {
    const queryBuilder = ctx.db
      .query("tournaments")
      .withIndex("by_guild", (q) => q.eq("guildId", guildId))
      .order("desc");

    if (limit) {
      return await queryBuilder.take(limit);
    }
    return await queryBuilder.collect();
  },
});

/**
 * Get participants for a tournament
 */
export const getParticipants = query({
  args: { guildId: v.string(), tournamentId: v.string() },
  handler: async (ctx, { guildId, tournamentId }) => {
    return await ctx.db
      .query("tournamentParticipants")
      .withIndex("by_tournament", (q) =>
        q.eq("guildId", guildId).eq("tournamentId", tournamentId)
      )
      .collect();
  },
});

/**
 * Get a specific participant by user ID
 */
export const getParticipantByUser = query({
  args: { guildId: v.string(), tournamentId: v.string(), userId: v.string() },
  handler: async (ctx, { guildId, tournamentId, userId }) => {
    return await ctx.db
      .query("tournamentParticipants")
      .withIndex("by_tournament_and_user", (q) =>
        q.eq("guildId", guildId).eq("tournamentId", tournamentId).eq("userId", userId)
      )
      .first();
  },
});

/**
 * Get a specific participant by participant ID
 */
export const getParticipantById = query({
  args: { guildId: v.string(), tournamentId: v.string(), participantId: v.string() },
  handler: async (ctx, { guildId, tournamentId, participantId }) => {
    return await ctx.db
      .query("tournamentParticipants")
      .withIndex("by_participant_id", (q) =>
        q.eq("guildId", guildId).eq("tournamentId", tournamentId).eq("participantId", participantId)
      )
      .first();
  },
});

/**
 * Get all matches for a tournament
 */
export const getMatches = query({
  args: { guildId: v.string(), tournamentId: v.string() },
  handler: async (ctx, { guildId, tournamentId }) => {
    return await ctx.db
      .query("tournamentMatches")
      .withIndex("by_tournament", (q) =>
        q.eq("guildId", guildId).eq("tournamentId", tournamentId)
      )
      .collect();
  },
});

/**
 * Get matches by round
 */
export const getMatchesByRound = query({
  args: { guildId: v.string(), tournamentId: v.string(), round: v.number() },
  handler: async (ctx, { guildId, tournamentId, round }) => {
    return await ctx.db
      .query("tournamentMatches")
      .withIndex("by_tournament_and_round", (q) =>
        q.eq("guildId", guildId).eq("tournamentId", tournamentId).eq("round", round)
      )
      .collect();
  },
});

/**
 * Get a specific match by matchId
 */
export const getMatch = query({
  args: { guildId: v.string(), tournamentId: v.string(), matchId: v.string() },
  handler: async (ctx, { guildId, tournamentId, matchId }) => {
    return await ctx.db
      .query("tournamentMatches")
      .withIndex("by_match_id", (q) =>
        q.eq("guildId", guildId).eq("tournamentId", tournamentId).eq("matchId", matchId)
      )
      .first();
  },
});

/**
 * Get ready matches (both participants known, not yet started)
 */
export const getReadyMatches = query({
  args: { guildId: v.string(), tournamentId: v.string() },
  handler: async (ctx, { guildId, tournamentId }) => {
    return await ctx.db
      .query("tournamentMatches")
      .withIndex("by_tournament_and_status", (q) =>
        q.eq("guildId", guildId).eq("tournamentId", tournamentId).eq("status", "ready")
      )
      .collect();
  },
});

// ============================================================================
// TOURNAMENT MUTATIONS
// ============================================================================

/**
 * Create a new tournament
 */
export const createTournament = mutation({
  args: {
    guildId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    type: v.union(
      v.literal("single_elim"),
      v.literal("double_elim"),
      v.literal("round_robin")
    ),
    teamSize: v.number(),
    maxParticipants: v.optional(v.number()),
    startTime: v.number(),
    channelId: v.string(),
    creatorId: v.string(),
    creatorName: v.string(),
  },
  handler: async (ctx, args) => {
    // Generate unique tournament ID
    const tournamentId = `tour_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    const now = Date.now();
    const registrationCloseTime = args.startTime - (15 * 60 * 1000); // 15 minutes before start

    await ctx.db.insert("tournaments", {
      guildId: args.guildId,
      tournamentId,
      name: args.name,
      description: args.description,
      type: args.type,
      teamSize: args.teamSize,
      maxParticipants: args.maxParticipants,
      startTime: args.startTime,
      registrationCloseTime,
      status: "open",
      currentRound: 0,
      channelId: args.channelId,
      creatorId: args.creatorId,
      creatorName: args.creatorName,
      createdAt: now,
      updatedAt: now,
    });

    return { tournamentId, registrationCloseTime };
  },
});

/**
 * Join a tournament (solo or as team captain)
 */
export const joinTournament = mutation({
  args: {
    guildId: v.string(),
    tournamentId: v.string(),
    userId: v.string(),
    username: v.string(),
    teamName: v.optional(v.string()),
    teamMembers: v.optional(v.array(v.object({
      userId: v.string(),
      username: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    // Get the tournament
    const tournament = await ctx.db
      .query("tournaments")
      .withIndex("by_tournament_id", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId)
      )
      .first();

    if (!tournament) {
      throw new Error("Tournament not found");
    }

    if (tournament.status !== "open") {
      throw new Error("Registration is closed for this tournament");
    }

    // Check if user is already registered
    const existingParticipant = await ctx.db
      .query("tournamentParticipants")
      .withIndex("by_tournament_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId).eq("userId", args.userId)
      )
      .first();

    if (existingParticipant) {
      throw new Error("You are already registered for this tournament");
    }

    // Check max participants
    if (tournament.maxParticipants) {
      const currentParticipants = await ctx.db
        .query("tournamentParticipants")
        .withIndex("by_tournament", (q) =>
          q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId)
        )
        .collect();

      if (currentParticipants.length >= tournament.maxParticipants) {
        throw new Error("Tournament is full");
      }
    }

    // Validate team size for team tournaments
    if (tournament.teamSize > 1) {
      if (!args.teamName) {
        throw new Error("Team name is required for team tournaments");
      }
      const memberCount = (args.teamMembers?.length || 0) + 1; // +1 for captain
      if (memberCount !== tournament.teamSize) {
        throw new Error(`Team must have exactly ${tournament.teamSize} members`);
      }
    }

    // Generate participant ID
    const participantId = `part_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    await ctx.db.insert("tournamentParticipants", {
      guildId: args.guildId,
      tournamentId: args.tournamentId,
      participantId,
      userId: args.userId,
      username: args.username,
      teamName: args.teamName,
      teamMembers: args.teamMembers,
      wins: 0,
      losses: 0,
      eliminated: false,
      joinedAt: Date.now(),
    });

    // Update tournament timestamp
    await ctx.db.patch(tournament._id, { updatedAt: Date.now() });

    return { participantId };
  },
});

/**
 * Leave a tournament
 */
export const leaveTournament = mutation({
  args: {
    guildId: v.string(),
    tournamentId: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db
      .query("tournaments")
      .withIndex("by_tournament_id", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId)
      )
      .first();

    if (!tournament) {
      throw new Error("Tournament not found");
    }

    if (tournament.status !== "open") {
      throw new Error("Cannot leave a tournament after registration closes");
    }

    const participant = await ctx.db
      .query("tournamentParticipants")
      .withIndex("by_tournament_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId).eq("userId", args.userId)
      )
      .first();

    if (!participant) {
      throw new Error("You are not registered for this tournament");
    }

    await ctx.db.delete(participant._id);
    await ctx.db.patch(tournament._id, { updatedAt: Date.now() });

    return true;
  },
});

/**
 * Update tournament status
 */
export const updateTournamentStatus = mutation({
  args: {
    guildId: v.string(),
    tournamentId: v.string(),
    status: v.union(
      v.literal("open"),
      v.literal("closed"),
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db
      .query("tournaments")
      .withIndex("by_tournament_id", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId)
      )
      .first();

    if (!tournament) {
      throw new Error("Tournament not found");
    }

    await ctx.db.patch(tournament._id, {
      status: args.status,
      updatedAt: Date.now()
    });

    return true;
  },
});

/**
 * Update tournament message IDs
 */
export const updateTournamentMessages = mutation({
  args: {
    guildId: v.string(),
    tournamentId: v.string(),
    mainMessageId: v.optional(v.string()),
    bracketMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db
      .query("tournaments")
      .withIndex("by_tournament_id", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId)
      )
      .first();

    if (!tournament) {
      throw new Error("Tournament not found");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.mainMessageId !== undefined) updates.mainMessageId = args.mainMessageId;
    if (args.bracketMessageId !== undefined) updates.bracketMessageId = args.bracketMessageId;

    await ctx.db.patch(tournament._id, updates);
    return true;
  },
});

/**
 * Create matches for a tournament (batch insert)
 */
export const createMatches = mutation({
  args: {
    guildId: v.string(),
    tournamentId: v.string(),
    matches: v.array(v.object({
      matchId: v.string(),
      round: v.number(),
      matchNumber: v.number(),
      bracketType: v.union(
        v.literal("winners"),
        v.literal("losers"),
        v.literal("grand_finals"),
        v.literal("round_robin")
      ),
      participant1Id: v.optional(v.string()),
      participant1Name: v.optional(v.string()),
      participant2Id: v.optional(v.string()),
      participant2Name: v.optional(v.string()),
      status: v.union(
        v.literal("pending"),
        v.literal("ready"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("bye")
      ),
      nextMatchId: v.optional(v.string()),
      nextMatchSlot: v.optional(v.number()),
      loserNextMatchId: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const match of args.matches) {
      await ctx.db.insert("tournamentMatches", {
        guildId: args.guildId,
        tournamentId: args.tournamentId,
        matchId: match.matchId,
        round: match.round,
        matchNumber: match.matchNumber,
        bracketType: match.bracketType,
        participant1Id: match.participant1Id,
        participant1Name: match.participant1Name,
        participant2Id: match.participant2Id,
        participant2Name: match.participant2Name,
        status: match.status,
        nextMatchId: match.nextMatchId,
        nextMatchSlot: match.nextMatchSlot,
        loserNextMatchId: match.loserNextMatchId,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { matchesCreated: args.matches.length };
  },
});

/**
 * Update a match (set thread ID, update status, etc.)
 */
export const updateMatch = mutation({
  args: {
    guildId: v.string(),
    tournamentId: v.string(),
    matchId: v.string(),
    threadId: v.optional(v.string()),
    threadMessageId: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("pending"),
      v.literal("ready"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("bye")
    )),
    participant1Id: v.optional(v.string()),
    participant1Name: v.optional(v.string()),
    participant2Id: v.optional(v.string()),
    participant2Name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db
      .query("tournamentMatches")
      .withIndex("by_match_id", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId).eq("matchId", args.matchId)
      )
      .first();

    if (!match) {
      throw new Error("Match not found");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.threadId !== undefined) updates.threadId = args.threadId;
    if (args.threadMessageId !== undefined) updates.threadMessageId = args.threadMessageId;
    if (args.status !== undefined) updates.status = args.status;
    if (args.participant1Id !== undefined) updates.participant1Id = args.participant1Id;
    if (args.participant1Name !== undefined) updates.participant1Name = args.participant1Name;
    if (args.participant2Id !== undefined) updates.participant2Id = args.participant2Id;
    if (args.participant2Name !== undefined) updates.participant2Name = args.participant2Name;

    await ctx.db.patch(match._id, updates);
    return true;
  },
});

/**
 * Report a match winner (initial report, needs confirmation)
 */
export const reportMatchWinner = mutation({
  args: {
    guildId: v.string(),
    tournamentId: v.string(),
    matchId: v.string(),
    winnerId: v.string(),
    reportedBy: v.string(),
    score: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db
      .query("tournamentMatches")
      .withIndex("by_match_id", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId).eq("matchId", args.matchId)
      )
      .first();

    if (!match) {
      throw new Error("Match not found");
    }

    if (match.status === "completed") {
      throw new Error("Match is already completed");
    }

    // Verify winner is a participant
    if (args.winnerId !== match.participant1Id && args.winnerId !== match.participant2Id) {
      throw new Error("Invalid winner - must be a match participant");
    }

    await ctx.db.patch(match._id, {
      reportedWinnerId: args.winnerId,
      reportedBy: args.reportedBy,
      reportedAt: Date.now(),
      score: args.score,
      status: "in_progress",
      updatedAt: Date.now(),
    });

    return { needsConfirmation: true };
  },
});

/**
 * Confirm a match winner and advance to next match
 */
export const confirmMatchWinner = mutation({
  args: {
    guildId: v.string(),
    tournamentId: v.string(),
    matchId: v.string(),
    confirmedBy: v.string(),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db
      .query("tournamentMatches")
      .withIndex("by_match_id", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId).eq("matchId", args.matchId)
      )
      .first();

    if (!match) {
      throw new Error("Match not found");
    }

    if (!match.reportedWinnerId) {
      throw new Error("No winner has been reported");
    }

    if (match.status === "completed") {
      throw new Error("Match is already completed");
    }

    // Get winner name
    const winnerName = match.reportedWinnerId === match.participant1Id
      ? match.participant1Name
      : match.participant2Name;

    // Get loser ID for double elim
    const loserId = match.reportedWinnerId === match.participant1Id
      ? match.participant2Id
      : match.participant1Id;
    const loserName = match.reportedWinnerId === match.participant1Id
      ? match.participant2Name
      : match.participant1Name;

    // Update current match as completed
    await ctx.db.patch(match._id, {
      winnerId: match.reportedWinnerId,
      winnerName,
      confirmedBy: args.confirmedBy,
      status: "completed",
      updatedAt: Date.now(),
    });

    // Update participant stats
    const winner = await ctx.db
      .query("tournamentParticipants")
      .withIndex("by_participant_id", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId).eq("participantId", match.reportedWinnerId)
      )
      .first();

    if (winner) {
      await ctx.db.patch(winner._id, { wins: winner.wins + 1 });
    }

    const loser = loserId ? await ctx.db
      .query("tournamentParticipants")
      .withIndex("by_participant_id", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId).eq("participantId", loserId)
      )
      .first() : null;

    if (loser) {
      await ctx.db.patch(loser._id, { losses: loser.losses + 1 });
    }

    // Advance winner to next match
    if (match.nextMatchId) {
      const nextMatch = await ctx.db
        .query("tournamentMatches")
        .withIndex("by_match_id", (q) =>
          q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId).eq("matchId", match.nextMatchId!)
        )
        .first();

      if (nextMatch) {
        const updates: Record<string, unknown> = { updatedAt: Date.now() };
        if (match.nextMatchSlot === 1) {
          updates.participant1Id = match.reportedWinnerId;
          updates.participant1Name = winnerName;
        } else {
          updates.participant2Id = match.reportedWinnerId;
          updates.participant2Name = winnerName;
        }

        // Check if next match is now ready
        const p1Ready = match.nextMatchSlot === 1 ? true : !!nextMatch.participant1Id;
        const p2Ready = match.nextMatchSlot === 2 ? true : !!nextMatch.participant2Id;
        if (p1Ready && p2Ready) {
          updates.status = "ready";
        }

        await ctx.db.patch(nextMatch._id, updates);
      }
    }

    // For double elim, move loser to losers bracket
    if (match.loserNextMatchId && loserId) {
      const loserNextMatch = await ctx.db
        .query("tournamentMatches")
        .withIndex("by_match_id", (q) =>
          q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId).eq("matchId", match.loserNextMatchId!)
        )
        .first();

      if (loserNextMatch) {
        // Determine which slot to put loser in
        const updates: Record<string, unknown> = { updatedAt: Date.now() };
        if (!loserNextMatch.participant1Id) {
          updates.participant1Id = loserId;
          updates.participant1Name = loserName;
        } else {
          updates.participant2Id = loserId;
          updates.participant2Name = loserName;
        }

        // Check if losers match is now ready
        const p1Ready = !loserNextMatch.participant1Id ? true : !!loserNextMatch.participant1Id;
        const p2Ready = loserNextMatch.participant2Id ? true : !!updates.participant2Id;
        if (p1Ready && p2Ready) {
          updates.status = "ready";
        }

        await ctx.db.patch(loserNextMatch._id, updates);
      }
    } else if (loser && !match.loserNextMatchId) {
      // Single elim or no losers bracket - mark as eliminated
      await ctx.db.patch(loser._id, { eliminated: true });
    }

    return {
      winnerId: match.reportedWinnerId,
      winnerName,
      loserId,
      loserName,
      nextMatchId: match.nextMatchId,
      loserNextMatchId: match.loserNextMatchId,
    };
  },
});

/**
 * Set tournament winner
 */
export const setTournamentWinner = mutation({
  args: {
    guildId: v.string(),
    tournamentId: v.string(),
    winnerId: v.string(),
    winnerName: v.string(),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db
      .query("tournaments")
      .withIndex("by_tournament_id", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId)
      )
      .first();

    if (!tournament) {
      throw new Error("Tournament not found");
    }

    await ctx.db.patch(tournament._id, {
      status: "completed",
      winnerId: args.winnerId,
      winnerName: args.winnerName,
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Cancel a tournament
 */
export const cancelTournament = mutation({
  args: {
    guildId: v.string(),
    tournamentId: v.string(),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db
      .query("tournaments")
      .withIndex("by_tournament_id", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId)
      )
      .first();

    if (!tournament) {
      throw new Error("Tournament not found");
    }

    if (tournament.status === "completed") {
      throw new Error("Cannot cancel a completed tournament");
    }

    await ctx.db.patch(tournament._id, {
      status: "cancelled",
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Delete all matches for a tournament (for regenerating brackets)
 */
export const deleteAllMatches = mutation({
  args: {
    guildId: v.string(),
    tournamentId: v.string(),
  },
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("tournamentMatches")
      .withIndex("by_tournament", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId)
      )
      .collect();

    for (const match of matches) {
      await ctx.db.delete(match._id);
    }

    return { deletedCount: matches.length };
  },
});

/**
 * Update current round of tournament
 */
export const updateCurrentRound = mutation({
  args: {
    guildId: v.string(),
    tournamentId: v.string(),
    currentRound: v.number(),
  },
  handler: async (ctx, args) => {
    const tournament = await ctx.db
      .query("tournaments")
      .withIndex("by_tournament_id", (q) =>
        q.eq("guildId", args.guildId).eq("tournamentId", args.tournamentId)
      )
      .first();

    if (!tournament) {
      throw new Error("Tournament not found");
    }

    await ctx.db.patch(tournament._id, {
      currentRound: args.currentRound,
      updatedAt: Date.now(),
    });

    return true;
  },
});
