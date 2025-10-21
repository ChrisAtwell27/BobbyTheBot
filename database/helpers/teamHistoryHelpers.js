const TeamHistory = require('../models/TeamHistory');

// Save team to history when it's completed
async function saveTeamToHistory(teamData) {
    try {
        const historyEntry = new TeamHistory({
            teamId: teamData.id,
            leaderId: teamData.leader.id,
            leaderName: teamData.leader.displayName,
            memberIds: teamData.members.map(m => m.id),
            memberNames: teamData.members.map(m => m.displayName),
            guildId: teamData.guildId,
            channelId: teamData.channelId,
            createdAt: teamData.createdAt,
            completedAt: new Date(),
            status: teamData.status || 'completed',
            stats: {
                maxMembers: teamData.members.length,
                totalJoins: teamData.totalJoins || teamData.members.length,
                totalLeaves: teamData.totalLeaves || 0,
                durationMinutes: Math.floor((Date.now() - teamData.createdAt.getTime()) / 60000)
            }
        });

        await historyEntry.save();
        console.log(`[TEAM HISTORY] Saved team ${teamData.id} to database`);
        return true;
    } catch (error) {
        console.error('[TEAM HISTORY] Error saving team to history:', error);
        return false;
    }
}

// Get user's team history
async function getUserTeamHistory(userId, limit = 50) {
    try {
        const teams = await TeamHistory.find({
            $or: [
                { leaderId: userId },
                { memberIds: userId }
            ]
        })
        .sort({ completedAt: -1 })
        .limit(limit);

        return teams;
    } catch (error) {
        console.error('[TEAM HISTORY] Error fetching user team history:', error);
        return [];
    }
}

// Get all team history for a guild
async function getGuildTeamHistory(guildId, limit = 100) {
    try {
        const teams = await TeamHistory.find({ guildId })
            .sort({ completedAt: -1 })
            .limit(limit);

        return teams;
    } catch (error) {
        console.error('[TEAM HISTORY] Error fetching guild team history:', error);
        return [];
    }
}

// Get team statistics for a user
async function getUserTeamStats(userId) {
    try {
        const asLeader = await TeamHistory.countDocuments({ leaderId: userId });
        const asMember = await TeamHistory.countDocuments({
            memberIds: userId,
            leaderId: { $ne: userId }
        });

        const recentTeams = await TeamHistory.find({
            $or: [
                { leaderId: userId },
                { memberIds: userId }
            ]
        })
        .sort({ completedAt: -1 })
        .limit(10);

        return {
            totalTeams: asLeader + asMember,
            teamsAsLeader: asLeader,
            teamsAsMember: asMember,
            recentTeams: recentTeams
        };
    } catch (error) {
        console.error('[TEAM HISTORY] Error fetching user team stats:', error);
        return {
            totalTeams: 0,
            teamsAsLeader: 0,
            teamsAsMember: 0,
            recentTeams: []
        };
    }
}

// Clean up old team history (optional - keep last 30 days by default)
async function cleanupOldTeamHistory(daysToKeep = 30) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

        const result = await TeamHistory.deleteMany({
            completedAt: { $lt: cutoffDate }
        });

        console.log(`[TEAM HISTORY] Cleaned up ${result.deletedCount} old team records`);
        return result.deletedCount;
    } catch (error) {
        console.error('[TEAM HISTORY] Error cleaning up old team history:', error);
        return 0;
    }
}

module.exports = {
    saveTeamToHistory,
    getUserTeamHistory,
    getGuildTeamHistory,
    getUserTeamStats,
    cleanupOldTeamHistory
};
