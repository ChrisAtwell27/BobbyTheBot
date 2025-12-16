// ===============================================
// VALORANT STATS VISUALIZER
// ===============================================
// Creates visual canvas-based stats displays for Valorant profiles

const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const fs = require('fs');
const { loadImageFromURL } = require('./apiClient');
const { RANK_MAPPING, loadRankImage, createFallbackRankIcon } = require('./rankUtils');
const { getAgentById } = require('./agentUtils');

// Path to agent icons
const AGENT_ICONS_PATH = path.join(__dirname, '..', 'images');

// Agent name to filename mapping (handles special cases)
const AGENT_FILENAME_MAP = {
    'kay/o': 'kayo',
    'kayo': 'kayo',
    'phoenix': 'pheonix', // File is misspelled as pheonix.png
};

/**
 * Load agent icon from local images folder
 * @param {string} agentName - Agent name (e.g., 'Jett', 'KAY/O')
 * @returns {Promise<Image|null>} - Loaded image or null if not found
 */
async function loadAgentIcon(agentName) {
    if (!agentName) return null;

    try {
        // Normalize agent name to lowercase for filename
        let filename = agentName.toLowerCase().replace(/[^a-z0-9]/g, '');

        // Check for special mappings
        const lowerName = agentName.toLowerCase();
        if (AGENT_FILENAME_MAP[lowerName]) {
            filename = AGENT_FILENAME_MAP[lowerName];
        }

        const iconPath = path.join(AGENT_ICONS_PATH, `${filename}.png`);

        // Check if file exists
        if (fs.existsSync(iconPath)) {
            return await loadImage(iconPath);
        }

        console.log(`[StatsViz] Agent icon not found: ${iconPath}`);
        return null;
    } catch (error) {
        console.error(`[StatsViz] Error loading agent icon for ${agentName}:`, error.message);
        return null;
    }
}

/**
 * Creates a comprehensive stats visualization for a player
 * @param {Object} accountData - Account data from API
 * @param {Object} mmrData - MMR/rank data from API (v2)
 * @param {Array} matchData - Match data from API
 * @param {string} userAvatar - User's Discord avatar URL
 * @param {Object} registration - User registration data
 * @param {Object} mmrDataV3 - MMR data from v3 API (optional, for enhanced display)
 * @param {Object} bestAgent - Best agent stats (optional)
 * @param {Array} sortedAgents - All agents sorted by games played (optional)
 * @param {Object} teammateData - Teammate statistics (optional, { teammates, bestTeammate, worstTeammate })
 * @returns {Promise<Canvas>} - The created canvas
 */
async function createStatsVisualization(accountData, mmrData, matchData, userAvatar, registration, mmrDataV3 = null, bestAgent = null, sortedAgents = null, teammateData = null) {
    // Calculate canvas height based on content
    // Show preferred agents (max 3) from registration instead of all played agents
    const preferredAgents = registration?.preferredAgents || [];
    const hasPreferredAgents = preferredAgents.length > 0 && sortedAgents && sortedAgents.length > 0;
    const agentCount = hasPreferredAgents ? Math.min(preferredAgents.length, 3) : 0;
    const agentSectionHeight = hasPreferredAgents ? 40 + (agentCount * 32) : 0; // Reduced row height

    // Calculate teammate section height
    const hasTeammates = teammateData?.bestTeammate || teammateData?.worstTeammate;
    const teammateSectionHeight = hasTeammates ? 120 : 0; // Best/worst teammate cards

    const canvasHeight = 1050 + agentSectionHeight + teammateSectionHeight;

    const canvas = createCanvas(1000, canvasHeight);
    const ctx = canvas.getContext('2d');

    // Enhanced background with pattern
    const gradient = ctx.createLinearGradient(0, 0, 1000, canvasHeight);
    gradient.addColorStop(0, '#0a0e13');
    gradient.addColorStop(0.3, '#1e2328');
    gradient.addColorStop(0.7, '#2c3e50');
    gradient.addColorStop(1, '#0a0e13');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, canvasHeight);

    // Add subtle pattern overlay
    ctx.fillStyle = 'rgba(255, 70, 84, 0.03)';
    for (let i = 0; i < 1000; i += 50) {
        for (let j = 0; j < canvasHeight; j += 50) {
            if ((i + j) % 100 === 0) {
                ctx.fillRect(i, j, 25, 25);
            }
        }
    }

    // Enhanced Valorant-style accents
    const accentGradient = ctx.createLinearGradient(0, 0, 1000, 0);
    accentGradient.addColorStop(0, '#ff4654');
    accentGradient.addColorStop(0.5, '#ff6b7a');
    accentGradient.addColorStop(1, '#ff4654');
    ctx.fillStyle = accentGradient;
    ctx.fillRect(0, 0, 1000, 8);
    ctx.fillRect(0, canvasHeight - 8, 1000, 8);
    ctx.fillRect(0, 0, 8, canvasHeight);
    ctx.fillRect(992, 0, 8, canvasHeight);

    // Enhanced header section
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('VALORANT PLAYER PROFILE', 500, 50);

    // Subtitle
    ctx.font = '16px Arial';
    ctx.fillStyle = '#cccccc';
    ctx.fillText('Enhanced Visualization v3.0 • KDA + Stored Matches', 500, 75);

    // User info section with enhanced styling
    const infoBoxGradient = ctx.createLinearGradient(50, 100, 950, 200);
    infoBoxGradient.addColorStop(0, 'rgba(255, 70, 84, 0.1)');
    infoBoxGradient.addColorStop(1, 'rgba(255, 107, 122, 0.1)');
    ctx.fillStyle = infoBoxGradient;
    ctx.fillRect(50, 100, 900, 100);
    ctx.strokeStyle = '#ff4654';
    ctx.lineWidth = 2;
    ctx.strokeRect(50, 100, 900, 100);

    try {
        // Enhanced user avatar with glow effect
        if (userAvatar) {
            const avatar = await loadImageFromURL(userAvatar);

            // Glow effect
            ctx.shadowColor = '#ff4654';
            ctx.shadowBlur = 15;
            ctx.save();
            ctx.beginPath();
            ctx.arc(150, 150, 45, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, 105, 105, 90, 90);
            ctx.restore();
            ctx.shadowBlur = 0;

            // Enhanced avatar border with gradient
            const borderGradient = ctx.createRadialGradient(150, 150, 40, 150, 150, 50);
            borderGradient.addColorStop(0, '#ff4654');
            borderGradient.addColorStop(1, '#ff6b7a');
            ctx.strokeStyle = borderGradient;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(150, 150, 45, 0, Math.PI * 2);
            ctx.stroke();
        }
    } catch (error) {
        // Enhanced fallback avatar
        const avatarGradient = ctx.createRadialGradient(150, 150, 0, 150, 150, 45);
        avatarGradient.addColorStop(0, '#ff6b7a');
        avatarGradient.addColorStop(1, '#ff4654');
        ctx.fillStyle = avatarGradient;
        ctx.beginPath();
        ctx.arc(150, 150, 45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '36px Arial';
        ctx.textAlign = 'center';
        // Use initials instead of emoji
        const initials = accountData.name.substring(0, 2).toUpperCase();
        ctx.fillText(initials, 150, 165);
    }

    // Enhanced player name and info
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${accountData.name}#${accountData.tag}`, 220, 135);

    ctx.font = '16px Arial';
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText(`Level ${accountData.account_level} • Region: ${accountData.region.toUpperCase()}`, 220, 160);
    // Format last updated date - handle missing or invalid dates
    const lastUpdated = accountData.updated_at
        ? new Date(accountData.updated_at).toLocaleDateString()
        : 'Recently';
    ctx.fillText(`Last Updated: ${lastUpdated !== 'Invalid Date' ? lastUpdated : 'Recently'}`, 220, 180);

    // Enhanced current rank section - use v3 data if available, fallback to v2
    const hasV3Data = mmrDataV3 && mmrDataV3.current;
    const hasV2Data = mmrData && mmrData.current_data;

    if (hasV3Data || hasV2Data) {
        // Enhanced rank box with gradient
        const rankBoxGradient = ctx.createLinearGradient(50, 220, 950, 370);
        rankBoxGradient.addColorStop(0, 'rgba(255, 70, 84, 0.15)');
        rankBoxGradient.addColorStop(1, 'rgba(255, 107, 122, 0.15)');
        ctx.fillStyle = rankBoxGradient;
        ctx.fillRect(50, 220, 900, 150);
        ctx.strokeStyle = '#ff4654';
        ctx.lineWidth = 3;
        ctx.strokeRect(50, 220, 900, 150);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('CURRENT COMPETITIVE RANK', 80, 250);

        // Get current rank info - prefer v3 data
        let currentTier = 0;
        let currentRR = 0;
        let lastChange = 0;
        let totalElo = 0;
        let leaderboardRank = null;
        let gamesNeeded = 0;

        if (hasV3Data) {
            currentTier = mmrDataV3.current.tier?.id || 0;
            currentRR = mmrDataV3.current.rr || 0;
            lastChange = mmrDataV3.current.last_change || 0;
            totalElo = mmrDataV3.current.elo || 0;
            leaderboardRank = mmrDataV3.current.leaderboard_placement?.rank || null;
            gamesNeeded = mmrDataV3.current.games_needed_for_rating || 0;
        } else if (hasV2Data) {
            currentTier = mmrData.current_data.currenttier || 0;
            currentRR = mmrData.current_data.ranking_in_tier || 0;
            lastChange = mmrData.current_data.mmr_change_to_last_game || 0;
        }

        const rankInfo = RANK_MAPPING[currentTier] || RANK_MAPPING[0];

        // Load and display rank image
        const rankImage = await loadRankImage(currentTier);
        if (rankImage) {
            ctx.drawImage(rankImage, 80, 260, 70, 70);
        } else {
            createFallbackRankIcon(ctx, 80, 260, 70, rankInfo);
        }

        ctx.fillStyle = rankInfo.color;
        ctx.font = 'bold 32px Arial';
        ctx.fillText(rankInfo.name, 170, 295);

        // RR display
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`${currentRR} RR`, 170, 320);

        // Total ELO display (from v3)
        if (totalElo > 0) {
            ctx.fillStyle = '#cccccc';
            ctx.font = '14px Arial';
            ctx.fillText(`ELO: ${totalElo}`, 170, 340);
        }

        // Games needed warning
        if (gamesNeeded > 0) {
            ctx.fillStyle = '#ffaa00';
            ctx.font = '12px Arial';
            ctx.fillText(`${gamesNeeded} games needed for rating`, 170, 358);
        }

        // Last game RR change
        if (lastChange !== 0) {
            ctx.fillStyle = lastChange > 0 ? '#00ff88' : '#ff4444';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`Last Game: ${lastChange > 0 ? '+' : ''}${lastChange} RR`, 380, 280);
        }

        // Leaderboard rank for high ranks (from v3)
        if (leaderboardRank) {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(`#${leaderboardRank} Leaderboard`, 380, 310);
        }

        // Peak rank display - prefer v3 data
        let peakTier = 0;
        let peakSeason = null;

        if (hasV3Data && mmrDataV3.peak) {
            peakTier = mmrDataV3.peak.tier?.id || 0;
            peakSeason = mmrDataV3.peak.season?.short || null;
        } else if (hasV2Data && mmrData.highest_rank) {
            peakTier = mmrData.highest_rank.tier || 0;
        }

        if (peakTier > 0) {
            const peakRank = RANK_MAPPING[peakTier] || RANK_MAPPING[0];
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px Arial';
            ctx.fillText('Peak Rank:', 700, 265);

            const peakRankImage = await loadRankImage(peakTier);
            if (peakRankImage) {
                ctx.drawImage(peakRankImage, 700, 275, 45, 45);
            } else {
                createFallbackRankIcon(ctx, 700, 275, 45, peakRank);
            }

            ctx.fillStyle = peakRank.color;
            ctx.font = 'bold 20px Arial';
            ctx.fillText(peakRank.name, 755, 302);

            // Show peak season if available (from v3)
            if (peakSeason) {
                ctx.fillStyle = '#aaaaaa';
                ctx.font = '12px Arial';
                ctx.fillText(`Achieved: ${peakSeason}`, 755, 322);
            }
        }

        // Seasonal stats summary (from v3) - get most recent season (API returns oldest first)
        if (hasV3Data && mmrDataV3.seasonal && mmrDataV3.seasonal.length > 0) {
            const currentSeason = mmrDataV3.seasonal[mmrDataV3.seasonal.length - 1];
            if (currentSeason.games > 0) {
                const wins = currentSeason.wins || 0;
                const games = currentSeason.games || 0;
                const winRate = ((wins / games) * 100).toFixed(1);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px Arial';
                ctx.fillText('This Act:', 580, 345);

                ctx.fillStyle = '#e0e0e0';
                ctx.font = '14px Arial';
                ctx.fillText(`${wins}W / ${games - wins}L (${winRate}% WR)`, 650, 345);

                // Act wins triangles
                if (currentSeason.act_wins && currentSeason.act_wins.length > 0) {
                    ctx.fillStyle = '#ffd700';
                    ctx.font = '12px Arial';
                    const topWins = currentSeason.act_wins.slice(0, 3).map(w => w.name).join(', ');
                    ctx.fillText(`Act Wins: ${topWins}`, 580, 365);
                }
            }
        }
    }

    // Best Agent section - display user's most successful agent
    if (bestAgent && bestAgent.name) {
        const agentBoxY = 380;

        // Agent box background
        const agentBoxGradient = ctx.createLinearGradient(50, agentBoxY, 950, agentBoxY + 60);
        agentBoxGradient.addColorStop(0, 'rgba(88, 101, 242, 0.15)');
        agentBoxGradient.addColorStop(1, 'rgba(114, 137, 218, 0.15)');
        ctx.fillStyle = agentBoxGradient;
        ctx.fillRect(50, agentBoxY, 900, 60);
        ctx.strokeStyle = '#5865f2';
        ctx.lineWidth = 2;
        ctx.strokeRect(50, agentBoxY, 900, 60);

        // Get agent info from our data
        const agentInfo = getAgentById(bestAgent.name.toLowerCase());
        const agentRole = agentInfo ? agentInfo.role : 'Agent';

        // Load and draw agent icon
        const agentIcon = await loadAgentIcon(bestAgent.name);
        const iconOffset = agentIcon ? 60 : 0; // Offset text if icon is present

        if (agentIcon) {
            // Draw agent icon with circular clip
            ctx.save();
            ctx.beginPath();
            ctx.arc(105, agentBoxY + 30, 22, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(agentIcon, 83, agentBoxY + 8, 44, 44);
            ctx.restore();

            // Icon border
            ctx.strokeStyle = '#5865f2';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(105, agentBoxY + 30, 22, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Best Agent label
        ctx.fillStyle = '#5865f2';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('BEST AGENT', 80 + iconOffset, agentBoxY + 20);

        // Agent name with role
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Arial';
        ctx.fillText(`${bestAgent.name}`, 80 + iconOffset, agentBoxY + 45);

        // Role indicator (text only, no emoji)
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '14px Arial';
        ctx.fillText(`[${agentRole}]`, 200 + iconOffset, agentBoxY + 45);

        // Stats display
        const statsStartX = 350 + (iconOffset > 0 ? 20 : 0);

        // Games played
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('Games', statsStartX, agentBoxY + 20);
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`${bestAgent.games}`, statsStartX, agentBoxY + 45);

        // Win rate
        ctx.font = 'bold 14px Arial';
        ctx.fillText('Win Rate', statsStartX + 100, agentBoxY + 20);
        const winRateColor = bestAgent.winRate >= 55 ? '#00ff88' : bestAgent.winRate >= 45 ? '#ffff00' : '#ff4444';
        ctx.fillStyle = winRateColor;
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`${bestAgent.winRate.toFixed(1)}%`, statsStartX + 100, agentBoxY + 45);

        // KDA
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('KDA', statsStartX + 210, agentBoxY + 20);
        const kdaColor = bestAgent.kda >= 1.5 ? '#00ff88' : bestAgent.kda >= 1.0 ? '#ffff00' : '#ff4444';
        ctx.fillStyle = kdaColor;
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`${bestAgent.kda.toFixed(2)}`, statsStartX + 210, agentBoxY + 45);

        // Avg ACS
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('Avg ACS', statsStartX + 310, agentBoxY + 20);
        const acsColor = bestAgent.avgACS >= 250 ? '#00ff88' : bestAgent.avgACS >= 200 ? '#ffff00' : '#ff8800';
        ctx.fillStyle = acsColor;
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`${Math.round(bestAgent.avgACS)}`, statsStartX + 310, agentBoxY + 45);

        // K/D/A totals (moved to where HS% was since stored matches don't have headshot data)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('K/D/A', statsStartX + 420, agentBoxY + 20);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`${bestAgent.kills}/${bestAgent.deaths}/${bestAgent.assists}`, statsStartX + 420, agentBoxY + 45);
    }

    // Adjust match section Y position based on whether best agent is shown
    const matchSectionY = bestAgent && bestAgent.name ? 455 : 390;

    // Enhanced recent matches section - supports both v3 and v4 API formats
    if (matchData && matchData.length > 0) {
        // Filter for competitive matches - handle both v3 and v4 formats
        const competitiveMatches = matchData.filter(match => {
            if (!match.metadata) return false;
            // v3 format: metadata.mode
            if (match.metadata.mode && match.metadata.mode.toLowerCase() === 'competitive') return true;
            // v4 format: metadata.queue.name
            if (match.metadata.queue?.name?.toLowerCase() === 'competitive') return true;
            return false;
        });

        if (competitiveMatches.length > 0) {
            // Section header with gradient background
            const matchesHeaderGradient = ctx.createLinearGradient(50, matchSectionY, 950, matchSectionY + 30);
            matchesHeaderGradient.addColorStop(0, 'rgba(255, 70, 84, 0.2)');
            matchesHeaderGradient.addColorStop(1, 'rgba(255, 107, 122, 0.2)');
            ctx.fillStyle = matchesHeaderGradient;
            ctx.fillRect(50, matchSectionY, 900, 30);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('RECENT COMPETITIVE MATCHES', 80, matchSectionY + 22);

            const recentMatches = competitiveMatches.slice(0, 8); // Show up to 8 recent matches
            recentMatches.forEach((match, index) => {
                const y = matchSectionY + 55 + index * 60;

                // Handle both v3 (players.all_players) and v4 (players array) formats
                const playersArray = match.players?.all_players || match.players || [];
                const player = playersArray.find(p => p.name?.toLowerCase() === accountData.name.toLowerCase());

                if (!player) return;

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

                // Enhanced match result background with gradient
                const matchGradient = ctx.createLinearGradient(50, y - 25, 950, y + 35);
                if (won) {
                    matchGradient.addColorStop(0, 'rgba(0, 255, 136, 0.15)');
                    matchGradient.addColorStop(1, 'rgba(0, 200, 100, 0.15)');
                } else {
                    matchGradient.addColorStop(0, 'rgba(255, 68, 68, 0.15)');
                    matchGradient.addColorStop(1, 'rgba(200, 50, 50, 0.15)');
                }
                ctx.fillStyle = matchGradient;
                ctx.fillRect(50, y - 25, 900, 50);

                ctx.strokeStyle = won ? '#00ff88' : '#ff4444';
                ctx.lineWidth = 2;
                ctx.strokeRect(50, y - 25, 900, 50);

                // Match result with text
                ctx.fillStyle = won ? '#00ff88' : '#ff4444';
                ctx.font = 'bold 16px Arial';
                ctx.fillText(won ? 'WIN' : 'LOSS', 80, y);

                // Map name - handle both v3 (string) and v4 (object with .name) formats
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px Arial';
                const mapName = typeof match.metadata.map === 'string' ? match.metadata.map : match.metadata.map?.name || 'Unknown';
                ctx.fillText(mapName, 160, y);

                // Agent name - handle both v3 (character) and v4 (agent.name) formats
                const agentName = player.character || player.agent?.name || 'Unknown';
                ctx.fillText(agentName, 320, y);

                // Enhanced KDA display
                const kda = `${player.stats.kills}/${player.stats.deaths}/${player.stats.assists}`;
                const kdRatio = player.stats.deaths > 0 ? (player.stats.kills / player.stats.deaths).toFixed(2) : player.stats.kills.toFixed(2);
                ctx.fillText(`${kda} (${kdRatio} K/D)`, 450, y);

                // ACS (Average Combat Score) - score field from API is already ACS
                const acs = player.stats.score || 0;
                ctx.fillStyle = acs >= 250 ? '#00ff88' : acs >= 200 ? '#ffff00' : acs >= 150 ? '#ff8800' : '#ff4444';
                ctx.fillText(`${acs} ACS`, 600, y);

                // Date - handle both v3 (game_start unix) and v4 (started_at ISO) formats
                const matchDate = match.metadata.game_start
                    ? new Date(match.metadata.game_start * 1000)
                    : new Date(match.metadata.started_at);
                ctx.fillStyle = '#cccccc';
                ctx.fillText(matchDate.toLocaleDateString(), 720, y);

                // Enhanced headshot percentage
                const totalShots = player.stats.headshots + player.stats.bodyshots + player.stats.legshots;
                const hsPercent = totalShots > 0 ? Math.round((player.stats.headshots / totalShots) * 100) : 0;
                ctx.fillStyle = hsPercent >= 30 ? '#00ff88' : hsPercent >= 20 ? '#ffff00' : '#ff8800';
                ctx.fillText(`HS: ${hsPercent}%`, 820, y);
            });
        } else {
            // No competitive matches found
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('NO RECENT COMPETITIVE MATCHES FOUND', 80, matchSectionY + 55);

            ctx.font = '16px Arial';
            ctx.fillStyle = '#cccccc';
            ctx.fillText('Play some competitive matches to see your recent performance here!', 80, matchSectionY + 85);
        }
    }

    // My Agents section - show only the user's preferred agents (selected in My Agents tab)
    if (hasPreferredAgents) {
        const agentsSectionY = matchSectionY + 530; // Position after matches section

        // Get stats for preferred agents only (match by name, case-insensitive)
        const preferredAgentStats = preferredAgents
            .map(prefAgentId => {
                // Find matching agent in sortedAgents by ID or name
                return sortedAgents.find(a =>
                    a.id?.toLowerCase() === prefAgentId.toLowerCase() ||
                    a.name?.toLowerCase() === prefAgentId.toLowerCase()
                );
            })
            .filter(Boolean) // Remove nulls (agents with no match data)
            .slice(0, 3); // Max 3 agents

        if (preferredAgentStats.length > 0) {
            // Section header
            const agentsHeaderGradient = ctx.createLinearGradient(50, agentsSectionY, 950, agentsSectionY + 30);
            agentsHeaderGradient.addColorStop(0, 'rgba(88, 101, 242, 0.2)');
            agentsHeaderGradient.addColorStop(1, 'rgba(114, 137, 218, 0.2)');
            ctx.fillStyle = agentsHeaderGradient;
            ctx.fillRect(50, agentsSectionY, 900, 30);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('MY AGENTS', 80, agentsSectionY + 22);

            // Column headers (adjusted for icon column)
            ctx.fillStyle = '#aaaaaa';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('AGENT', 110, agentsSectionY + 50);
            ctx.fillText('GAMES', 250, agentsSectionY + 50);
            ctx.fillText('K/D/A', 330, agentsSectionY + 50);
            ctx.fillText('KDA', 460, agentsSectionY + 50);
            ctx.fillText('ACS', 540, agentsSectionY + 50);
            ctx.fillText('AVG K', 620, agentsSectionY + 50);
            ctx.fillText('W/L', 710, agentsSectionY + 50);
            ctx.fillText('WIN%', 810, agentsSectionY + 50);

            // Draw each agent row (using for...of to allow async icon loading)
            for (let index = 0; index < preferredAgentStats.length; index++) {
                const agent = preferredAgentStats[index];
                const y = agentsSectionY + 72 + index * 32;

                // Alternating row background
                if (index % 2 === 0) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                    ctx.fillRect(50, y - 10, 900, 28);
                }

                // Load and draw agent icon
                const agentIcon = await loadAgentIcon(agent.name || agent.id);
                if (agentIcon) {
                    // Draw small circular agent icon
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(80, y + 4, 12, 0, Math.PI * 2);
                    ctx.clip();
                    ctx.drawImage(agentIcon, 68, y - 8, 24, 24);
                    ctx.restore();

                    // Icon border
                    ctx.strokeStyle = '#5865f2';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(80, y + 4, 12, 0, Math.PI * 2);
                    ctx.stroke();
                }

                // Get agent info for role
                const agentInfo = getAgentById(agent.name?.toLowerCase() || agent.id);
                const agentRole = agentInfo ? agentInfo.role : 'Agent';

                // Agent name with role in brackets (offset for icon)
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px Arial';
                ctx.fillText(`${agent.name || agent.id}`, 110, y + 5);

                ctx.fillStyle = '#666666';
                ctx.font = '11px Arial';
                ctx.fillText(`[${agentRole}]`, 110, y + 18);

                // Games
                ctx.fillStyle = '#ffffff';
                ctx.font = '14px Arial';
                ctx.fillText(`${agent.games}`, 250, y + 5);

                // K/D/A
                ctx.fillText(`${agent.kills}/${agent.deaths}/${agent.assists}`, 330, y + 5);

                // KDA with color
                const kdaColor = agent.kda >= 1.5 ? '#00ff88' : agent.kda >= 1.0 ? '#ffff00' : '#ff4444';
                ctx.fillStyle = kdaColor;
                ctx.fillText(`${agent.kda.toFixed(2)}`, 460, y + 5);

                // ACS with color
                const acsColor = agent.avgACS >= 250 ? '#00ff88' : agent.avgACS >= 200 ? '#ffff00' : '#ff8800';
                ctx.fillStyle = acsColor;
                ctx.fillText(`${Math.round(agent.avgACS)}`, 540, y + 5);

                // Avg Kills
                ctx.fillStyle = '#ffffff';
                ctx.fillText(`${agent.avgKills?.toFixed(1) || (agent.kills / agent.games).toFixed(1)}`, 620, y + 5);

                // W/L
                ctx.fillText(`${agent.wins}/${agent.games - agent.wins}`, 710, y + 5);

                // Win rate with color
                const winColor = agent.winRate >= 55 ? '#00ff88' : agent.winRate >= 45 ? '#ffff00' : '#ff4444';
                ctx.fillStyle = winColor;
                ctx.fillText(`${agent.winRate.toFixed(0)}%`, 810, y + 5);
            }
        }
    }

    // Teammate section - show best and worst teammates
    if (hasTeammates) {
        const teammateSectionY = matchSectionY + 530 + agentSectionHeight;

        // Section header
        const teammateHeaderGradient = ctx.createLinearGradient(50, teammateSectionY, 950, teammateSectionY + 30);
        teammateHeaderGradient.addColorStop(0, 'rgba(255, 165, 0, 0.2)');
        teammateHeaderGradient.addColorStop(1, 'rgba(255, 100, 0, 0.2)');
        ctx.fillStyle = teammateHeaderGradient;
        ctx.fillRect(50, teammateSectionY, 900, 30);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('FREQUENT TEAMMATES', 80, teammateSectionY + 22);

        // Best teammate card (left side)
        if (teammateData.bestTeammate) {
            const best = teammateData.bestTeammate;
            const cardX = 60;
            const cardY = teammateSectionY + 45;

            // Card background (green tint for best)
            ctx.fillStyle = 'rgba(0, 255, 136, 0.1)';
            ctx.fillRect(cardX, cardY, 420, 65);
            ctx.strokeStyle = 'rgba(0, 255, 136, 0.5)';
            ctx.lineWidth = 2;
            ctx.strokeRect(cardX, cardY, 420, 65);

            // "BEST" label (no emoji - canvas doesn't render them properly)
            ctx.fillStyle = '#00ff88';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('* BEST TEAMMATE *', cardX + 10, cardY + 15);

            // Name
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`${best.name}#${best.tag}`, cardX + 10, cardY + 35);

            // Stats
            ctx.font = '12px Arial';
            ctx.fillStyle = '#aaaaaa';
            ctx.fillText(`${best.gamesPlayed} games`, cardX + 10, cardY + 52);

            ctx.fillStyle = '#00ff88';
            ctx.fillText(`${best.winRate.toFixed(0)}% WR`, cardX + 90, cardY + 52);

            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${best.wins}W-${best.losses}L`, cardX + 160, cardY + 52);

            // Their performance
            ctx.fillStyle = '#888888';
            ctx.font = '11px Arial';
            ctx.fillText(`Their avg: ${best.theirAvgACS.toFixed(0)} ACS • ${best.theirKDA.toFixed(2)} KDA`, cardX + 240, cardY + 35);
            ctx.fillText(`Plays: ${best.favoriteAgent}`, cardX + 240, cardY + 52);
        }

        // Worst teammate card (right side)
        if (teammateData.worstTeammate && teammateData.worstTeammate.key !== teammateData.bestTeammate?.key) {
            const worst = teammateData.worstTeammate;
            const cardX = 520;
            const cardY = teammateSectionY + 45;

            // Card background (red tint for worst)
            ctx.fillStyle = 'rgba(255, 68, 68, 0.1)';
            ctx.fillRect(cardX, cardY, 420, 65);
            ctx.strokeStyle = 'rgba(255, 68, 68, 0.5)';
            ctx.lineWidth = 2;
            ctx.strokeRect(cardX, cardY, 420, 65);

            // "WORST" label (no emoji - canvas doesn't render them properly)
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 11px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('x UNLUCKY TEAMMATE x', cardX + 10, cardY + 15);

            // Name
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`${worst.name}#${worst.tag}`, cardX + 10, cardY + 35);

            // Stats
            ctx.font = '12px Arial';
            ctx.fillStyle = '#aaaaaa';
            ctx.fillText(`${worst.gamesPlayed} games`, cardX + 10, cardY + 52);

            ctx.fillStyle = '#ff4444';
            ctx.fillText(`${worst.winRate.toFixed(0)}% WR`, cardX + 90, cardY + 52);

            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${worst.wins}W-${worst.losses}L`, cardX + 160, cardY + 52);

            // Their performance
            ctx.fillStyle = '#888888';
            ctx.font = '11px Arial';
            ctx.fillText(`Their avg: ${worst.theirAvgACS.toFixed(0)} ACS • ${worst.theirKDA.toFixed(2)} KDA`, cardX + 240, cardY + 35);
            ctx.fillText(`Plays: ${worst.favoriteAgent}`, cardX + 240, cardY + 52);
        }
    }

    // Enhanced footer with version info
    ctx.fillStyle = '#666666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Enhanced Stats v4.0 • MMR + ELO + Seasonal Data', 500, canvasHeight - 20);

    return canvas;
}

module.exports = {
    createStatsVisualization
};
