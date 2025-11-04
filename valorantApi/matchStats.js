// ===============================================
// VALORANT MATCH STATISTICS
// ===============================================
// Handles fetching and processing player match statistics

const { getStoredMatches, getMatches } = require('./apiClient');

// Competitive game modes for filtering
const COMPETITIVE_MODES = ['competitive', 'ranked'];

/**
 * Gets player match statistics from stored matches (v1 endpoint)
 * @param {Object} registration - User registration data
 * @returns {Promise<Object>} - Match statistics
 */
async function getPlayerMatchStats(registration) {
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

        return {
            totalKills,
            totalDeaths: Math.max(totalDeaths, 1), // Ensure never 0
            totalAssists,
            totalMatches: validMatches,
            wins,
            avgKDA,
            winRate,
            avgACS
        };

    } catch (error) {
        console.error('[Match Stats] Error fetching stored match stats:', error);
        // Fall back to legacy method
        return await getPlayerMatchStatsLegacy(registration);
    }
}

/**
 * Gets player match statistics using legacy endpoint (v4) - fallback
 * @param {Object} registration - User registration data
 * @returns {Promise<Object>} - Match statistics
 */
async function getPlayerMatchStatsLegacy(registration) {
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
        ).slice(0, 20); // Last 20 competitive matches

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

        return {
            totalKills,
            totalDeaths: Math.max(totalDeaths, 1),
            totalAssists,
            totalMatches: validMatches,
            wins,
            avgKDA,
            winRate,
            avgACS
        };

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

module.exports = {
    getPlayerMatchStats,
    getPlayerMatchStatsLegacy,
    calculateKDA,
    calculateWinRate,
    calculateAverageACS,
    COMPETITIVE_MODES
};
