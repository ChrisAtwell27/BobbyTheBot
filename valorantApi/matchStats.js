// ===============================================
// VALORANT MATCH STATISTICS
// ===============================================
// Handles fetching and processing player match statistics

const { getStoredMatches, getMatches } = require('./apiClient');
const { LimitedMap } = require('../utils/memoryUtils');

// Competitive game modes for filtering
const COMPETITIVE_MODES = ['competitive', 'ranked'];

// ===============================================
// MATCH STATS CACHE
// ===============================================
// Cache player match stats for 10 minutes to reduce API calls
// Key: "name#tag" (lowercase), Value: { stats: Object, timestamp: number }
const matchStatsCache = new LimitedMap(100); // Max 100 players cached
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Get cache key for a player
 * @param {Object} registration - User registration data
 * @returns {string} - Cache key
 */
function getCacheKey(registration) {
    return `${registration.name.toLowerCase()}#${registration.tag.toLowerCase()}`;
}

/**
 * Get cached stats for a player if valid
 * @param {Object} registration - User registration data
 * @returns {Object|null} - Cached stats or null
 */
function getCachedStats(registration) {
    const key = getCacheKey(registration);
    const cached = matchStatsCache.get(key);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log(`[Match Stats] Using cached stats for ${registration.name}#${registration.tag}`);
        return cached.stats;
    }

    return null;
}

/**
 * Set cached stats for a player
 * @param {Object} registration - User registration data
 * @param {Object} stats - Stats to cache
 */
function setCachedStats(registration, stats) {
    const key = getCacheKey(registration);
    matchStatsCache.set(key, {
        stats,
        timestamp: Date.now()
    });
    console.log(`[Match Stats] Cached stats for ${registration.name}#${registration.tag}`);
}

/**
 * Clear cached stats for a player (useful after manual refresh)
 * @param {Object} registration - User registration data
 */
function clearCachedStats(registration) {
    const key = getCacheKey(registration);
    matchStatsCache.delete(key);
    console.log(`[Match Stats] Cleared cache for ${registration.name}#${registration.tag}`);
}

/**
 * Clear all cached stats
 */
function clearAllCachedStats() {
    const size = matchStatsCache.size;
    matchStatsCache.clear();
    console.log(`[Match Stats] Cleared ${size} cached player stats`);
}

/**
 * Gets player match statistics from stored matches (v1 endpoint)
 * Uses caching to reduce API calls (10 minute TTL)
 * @param {Object} registration - User registration data
 * @param {boolean} forceRefresh - Skip cache and force API call
 * @returns {Promise<Object>} - Match statistics
 */
async function getPlayerMatchStats(registration, forceRefresh = false) {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
        const cachedStats = getCachedStats(registration);
        if (cachedStats) {
            return cachedStats;
        }
    }

    try {
        // Use stored-matches endpoint for more comprehensive data
        const storedMatchData = await getStoredMatches(registration.region, registration.name, registration.tag);

        if (storedMatchData.status !== 200 || !storedMatchData.data) {
            console.log('[Match Stats] No stored match data available, falling back to regular matches endpoint');
            return await getPlayerMatchStatsLegacy(registration);
        }

        // Filter for competitive matches only
        const competitiveMatches = storedMatchData.data.filter(match =>
            match.meta && match.meta.mode &&
            COMPETITIVE_MODES.includes(match.meta.mode.toLowerCase())
        );

        if (competitiveMatches.length === 0) {
            console.log('[Match Stats] No competitive matches found in stored data');
            return {
                totalKills: 0,
                totalDeaths: 1, // Avoid division by zero
                totalAssists: 0,
                totalMatches: 0,
                wins: 0,
                avgKDA: 0,
                winRate: 0,
                avgACS: 0
            };
        }

        // Take last 30 matches for more comprehensive analysis
        const recentMatches = competitiveMatches.slice(0, 30);

        let totalKills = 0;
        let totalDeaths = 0;
        let totalAssists = 0;
        let totalScore = 0;
        let wins = 0;
        let validMatches = 0;

        for (const match of recentMatches) {
            // Find player's stats in this match
            if (!match.stats || !match.teams) continue;

            const playerStats = match.stats;
            const teams = match.teams;

            // Check if this is the player's data (matches by PUUID if available)
            if (registration.puuid && playerStats.puuid !== registration.puuid) {
                continue;
            }

            totalKills += playerStats.kills || 0;
            totalDeaths += playerStats.deaths || 0;
            totalAssists += playerStats.assists || 0;
            totalScore += playerStats.score || 0;

            // Determine if won based on team scores
            const redScore = teams.red || 0;
            const blueScore = teams.blue || 0;
            const playerTeam = playerStats.team;

            let won = false;
            if (playerTeam === 'Red' && redScore > blueScore) won = true;
            if (playerTeam === 'Blue' && blueScore > redScore) won = true;

            if (won) wins++;
            validMatches++;
        }

        // Calculate averages and ratios
        const avgKDA = totalDeaths > 0 ? (totalKills + totalAssists) / totalDeaths : totalKills + totalAssists;
        const winRate = validMatches > 0 ? (wins / validMatches) * 100 : 0;
        const avgACS = validMatches > 0 ? totalScore / validMatches : 0;

        console.log(`[Match Stats] Player ${registration.name}#${registration.tag} stats from ${validMatches} competitive matches:`);
        console.log(`  - KDA: ${totalKills}/${totalDeaths}/${totalAssists} (${avgKDA.toFixed(2)})`);
        console.log(`  - Win Rate: ${winRate.toFixed(1)}%`);
        console.log(`  - Avg ACS: ${avgACS.toFixed(0)}`);

        const stats = {
            totalKills,
            totalDeaths: Math.max(totalDeaths, 1), // Ensure never 0
            totalAssists,
            totalMatches: validMatches,
            wins,
            avgKDA,
            winRate,
            avgACS
        };

        // Cache the results
        setCachedStats(registration, stats);

        return stats;

    } catch (error) {
        console.error('[Match Stats] Error fetching stored match stats:', error);
        // Fall back to legacy method
        return await getPlayerMatchStatsLegacy(registration, forceRefresh);
    }
}

/**
 * Gets player match statistics using legacy endpoint (v4) - fallback
 * Uses caching to reduce API calls (10 minute TTL)
 * @param {Object} registration - User registration data
 * @param {boolean} forceRefresh - Skip cache and force API call
 * @returns {Promise<Object>} - Match statistics
 */
async function getPlayerMatchStatsLegacy(registration, forceRefresh = false) {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
        const cachedStats = getCachedStats(registration);
        if (cachedStats) {
            return cachedStats;
        }
    }

    try {
        const matchData = await getMatches(registration.region, registration.name, registration.tag);

        if (matchData.status !== 200 || !matchData.data) {
            return {
                totalKills: 0,
                totalDeaths: 1,
                totalAssists: 0,
                totalMatches: 0,
                wins: 0,
                avgKDA: 0,
                winRate: 0,
                avgACS: 0
            };
        }

        // Filter for competitive matches only
        const competitiveMatches = matchData.data.filter(match =>
            match.metadata && match.metadata.queue.name &&
            match.metadata.queue.name.toLowerCase() === 'competitive'
        ).slice(0, 30); // Last 30 competitive matches

        if (competitiveMatches.length === 0) {
            return {
                totalKills: 0,
                totalDeaths: 1,
                totalAssists: 0,
                totalMatches: 0,
                wins: 0,
                avgKDA: 0,
                winRate: 0,
                avgACS: 0
            };
        }

        let totalKills = 0;
        let totalDeaths = 0;
        let totalAssists = 0;
        let totalScore = 0;
        let wins = 0;
        let validMatches = 0;

        for (const match of competitiveMatches) {
            const player = match.players.find(p =>
                p.name.toLowerCase() === registration.name.toLowerCase()
            );
            if (!player) continue;

            totalKills += player.stats.kills;
            totalDeaths += player.stats.deaths;
            totalAssists += player.stats.assists;
            totalScore += player.stats.score;

            const won = player.team_id === (match.teams.find(t => t.won) || {}).team_id;
            if (won) wins++;
            validMatches++;
        }

        const avgKDA = totalDeaths > 0 ? (totalKills + totalAssists) / totalDeaths : totalKills + totalAssists;
        const winRate = validMatches > 0 ? (wins / validMatches) * 100 : 0;
        const avgACS = validMatches > 0 ? totalScore / validMatches : 0;

        console.log(`[Match Stats] Legacy: Player ${registration.name}#${registration.tag} stats from ${validMatches} matches`);

        const stats = {
            totalKills,
            totalDeaths: Math.max(totalDeaths, 1),
            totalAssists,
            totalMatches: validMatches,
            wins,
            avgKDA,
            winRate,
            avgACS
        };

        // Cache the results
        setCachedStats(registration, stats);

        return stats;

    } catch (error) {
        console.error('[Match Stats] Error fetching legacy match stats:', error);
        return {
            totalKills: 0,
            totalDeaths: 1,
            totalAssists: 0,
            totalMatches: 0,
            wins: 0,
            avgKDA: 0,
            winRate: 0,
            avgACS: 0
        };
    }
}

/**
 * Calculates KDA from kills, deaths, and assists
 * @param {number} kills - Total kills
 * @param {number} deaths - Total deaths
 * @param {number} assists - Total assists
 * @returns {number} - KDA ratio
 */
function calculateKDA(kills, deaths, assists) {
    return deaths > 0 ? (kills + assists) / deaths : kills + assists;
}

/**
 * Calculates win rate percentage
 * @param {number} wins - Number of wins
 * @param {number} totalMatches - Total number of matches
 * @returns {number} - Win rate percentage
 */
function calculateWinRate(wins, totalMatches) {
    return totalMatches > 0 ? (wins / totalMatches) * 100 : 0;
}

/**
 * Calculates average combat score
 * @param {number} totalScore - Total score across all matches
 * @param {number} totalMatches - Total number of matches
 * @returns {number} - Average combat score
 */
function calculateAverageACS(totalScore, totalMatches) {
    return totalMatches > 0 ? totalScore / totalMatches : 0;
}

/**
 * Gets agent statistics from match data (v4 endpoint)
 * @param {Object} registration - User registration data
 * @param {Array} matchData - Match data array from v4 API
 * @returns {Object} - Agent statistics with best agent info
 */
function getAgentStatsFromMatches(registration, matchData) {
    if (!matchData || !Array.isArray(matchData) || matchData.length === 0) {
        return { bestAgent: null, agentStats: {} };
    }

    const agentStats = {};

    // Filter for competitive matches - handle both v3 and v4 formats
    const competitiveMatches = matchData.filter(match => {
        if (!match.metadata) return false;
        // v3 format: metadata.mode
        if (match.metadata.mode && match.metadata.mode.toLowerCase() === 'competitive') return true;
        // v4 format: metadata.queue.name
        if (match.metadata.queue?.name?.toLowerCase() === 'competitive') return true;
        return false;
    });

    for (const match of competitiveMatches) {
        if (!match.players) continue;

        // Handle both v3 (players.all_players) and v4 (players array) formats
        const playersArray = match.players?.all_players || match.players || [];
        const player = playersArray.find(p =>
            p.name && p.name.toLowerCase() === registration.name.toLowerCase()
        );

        // Get agent name - handle both v3 (character) and v4 (agent.name) formats
        const agentNameRaw = player?.character || player?.agent?.name;
        if (!player || !agentNameRaw) continue;

        const agentName = agentNameRaw.toLowerCase();

        // Determine win - handle both v3 and v4 formats
        let won = false;
        if (match.teams?.red && match.teams?.blue) {
            // v3 format: teams.red/blue.has_won
            const playerTeam = player.team?.toLowerCase();
            if (playerTeam === 'red') won = match.teams.red.has_won;
            else if (playerTeam === 'blue') won = match.teams.blue.has_won;
        } else if (Array.isArray(match.teams)) {
            // v4 format: teams[].won
            won = player.team_id === (match.teams.find(t => t.won) || {}).team_id;
        }

        if (!agentStats[agentName]) {
            agentStats[agentName] = {
                name: agentNameRaw, // Use the raw name (preserves capitalization)
                games: 0,
                wins: 0,
                kills: 0,
                deaths: 0,
                assists: 0,
                totalScore: 0,
                headshots: 0,
                bodyshots: 0,
                legshots: 0
            };
        }

        const stats = agentStats[agentName];
        stats.games++;
        if (won) stats.wins++;
        stats.kills += player.stats?.kills || 0;
        stats.deaths += player.stats?.deaths || 0;
        stats.assists += player.stats?.assists || 0;
        stats.totalScore += player.stats?.score || 0;
        stats.headshots += player.stats?.headshots || 0;
        stats.bodyshots += player.stats?.bodyshots || 0;
        stats.legshots += player.stats?.legshots || 0;
    }

    // Calculate derived stats and find best agent
    let bestAgent = null;
    let bestScore = -1;

    for (const [agentId, stats] of Object.entries(agentStats)) {
        // Calculate KDA
        stats.kda = stats.deaths > 0
            ? (stats.kills + stats.assists) / stats.deaths
            : stats.kills + stats.assists;

        // Calculate win rate (for display only, not used in scoring)
        stats.winRate = stats.games > 0 ? (stats.wins / stats.games) * 100 : 0;

        // Calculate average ACS
        stats.avgACS = stats.games > 0 ? stats.totalScore / stats.games : 0;

        // Calculate average kills per game
        stats.avgKills = stats.games > 0 ? stats.kills / stats.games : 0;

        // Calculate headshot percentage
        const totalShots = stats.headshots + stats.bodyshots + stats.legshots;
        stats.hsPercent = totalShots > 0 ? (stats.headshots / totalShots) * 100 : 0;

        // Score agents purely by YOUR performance stats (not wins/losses)
        // Weight: games played (20%), ACS (35%), KDA (30%), HS% (15%)
        // Minimum 3 games to be considered "best"
        if (stats.games >= 3) {
            const gamesScore = Math.min(stats.games / 20, 1) * 20; // Max 20 points for games
            const acsScore = Math.min(stats.avgACS / 300, 1) * 35; // Max 35 points for ACS (300+ = max)
            const kdaScore = Math.min(stats.kda / 2.5, 1) * 30; // Max 30 points for KDA (2.5+ = max)
            const hsScore = Math.min(stats.hsPercent / 30, 1) * 15; // Max 15 points for HS% (30%+ = max)

            const totalScore = gamesScore + acsScore + kdaScore + hsScore;

            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestAgent = {
                    id: agentId,
                    ...stats
                };
            }
        }
    }

    // If no agent has 3+ games, pick the one with best ACS
    if (!bestAgent) {
        let bestACS = 0;
        for (const [agentId, stats] of Object.entries(agentStats)) {
            if (stats.avgACS > bestACS || (stats.avgACS === bestACS && stats.games > (bestAgent?.games || 0))) {
                bestACS = stats.avgACS;
                bestAgent = {
                    id: agentId,
                    ...stats
                };
            }
        }
    }

    // Sort agents by games played for the "My Agents" list
    const sortedAgents = Object.entries(agentStats)
        .map(([id, stats]) => ({ id, ...stats }))
        .sort((a, b) => b.games - a.games);

    return { bestAgent, agentStats, sortedAgents };
}

module.exports = {
    getPlayerMatchStats,
    getPlayerMatchStatsLegacy,
    calculateKDA,
    calculateWinRate,
    calculateAverageACS,
    getAgentStatsFromMatches,
    clearCachedStats,
    clearAllCachedStats,
    COMPETITIVE_MODES
};
