// ===============================================
// VALORANT STATS VISUALIZER
// ===============================================
// Creates visual canvas-based stats displays for Valorant profiles

const { createCanvas } = require('canvas');
const { loadImageFromURL } = require('./apiClient');
const { RANK_MAPPING, loadRankImage, createFallbackRankIcon } = require('./rankUtils');

/**
 * Creates a comprehensive stats visualization for a player
 * @param {Object} accountData - Account data from API
 * @param {Object} mmrData - MMR/rank data from API (v2)
 * @param {Array} matchData - Match data from API
 * @param {string} userAvatar - User's Discord avatar URL
 * @param {Object} registration - User registration data
 * @param {Object} mmrDataV3 - MMR data from v3 API (optional, for enhanced display)
 * @returns {Promise<Canvas>} - The created canvas
 */
async function createStatsVisualization(accountData, mmrData, matchData, userAvatar, registration, mmrDataV3 = null) {
    const canvas = createCanvas(1000, 900);
    const ctx = canvas.getContext('2d');

    // Enhanced background with pattern
    const gradient = ctx.createLinearGradient(0, 0, 1000, 900);
    gradient.addColorStop(0, '#0a0e13');
    gradient.addColorStop(0.3, '#1e2328');
    gradient.addColorStop(0.7, '#2c3e50');
    gradient.addColorStop(1, '#0a0e13');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 900);

    // Add subtle pattern overlay
    ctx.fillStyle = 'rgba(255, 70, 84, 0.03)';
    for (let i = 0; i < 1000; i += 50) {
        for (let j = 0; j < 900; j += 50) {
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
    ctx.fillRect(0, 892, 1000, 8);
    ctx.fillRect(0, 0, 8, 900);
    ctx.fillRect(992, 0, 8, 900);

    // Enhanced header section
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('VALORANT PLAYER PROFILE', 500, 50);

    // Subtitle
    ctx.font = '16px Arial';
    ctx.fillStyle = '#cccccc';
    ctx.fillText('Powered by HenrikDev API • Enhanced Visualization v3.0 • KDA + Stored Matches', 500, 75);

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
    ctx.fillText(`Last Updated: ${new Date(accountData.updated_at).toLocaleDateString()}`, 220, 180);

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

    // Enhanced recent matches section - Filter for competitive matches only
    if (matchData && matchData.length > 0) {
        // Filter for competitive matches only
        const competitiveMatches = matchData.filter(match =>
            match.metadata && match.metadata.queue.name && match.metadata.queue.name.toLowerCase() === 'competitive'
        );

        if (competitiveMatches.length > 0) {
            // Section header with gradient background
            const matchesHeaderGradient = ctx.createLinearGradient(50, 390, 950, 420);
            matchesHeaderGradient.addColorStop(0, 'rgba(255, 70, 84, 0.2)');
            matchesHeaderGradient.addColorStop(1, 'rgba(255, 107, 122, 0.2)');
            ctx.fillStyle = matchesHeaderGradient;
            ctx.fillRect(50, 390, 900, 30);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('RECENT COMPETITIVE MATCHES', 80, 412);

            const recentMatches = competitiveMatches.slice(0, 6);
            recentMatches.forEach((match, index) => {
                const y = 445 + index * 60;
                const player = match.players.find(p => p.name.toLowerCase() === accountData.name.toLowerCase());

                if (!player) return;

                const won = player.team_id === (match.teams.find(t => t.won) || {}).team_id;

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

                // Map name
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px Arial';
                ctx.fillText(match.metadata.map.name, 160, y);

                // Agent name
                ctx.fillText(player.agent.name, 320, y);

                // Enhanced KDA display
                const kda = `${player.stats.kills}/${player.stats.deaths}/${player.stats.assists}`;
                const kdRatio = player.stats.deaths > 0 ? (player.stats.kills / player.stats.deaths).toFixed(2) : player.stats.kills.toFixed(2);
                ctx.fillText(`${kda} (${kdRatio} K/D)`, 450, y);

                // Score with color coding
                const acs = player.stats.score;
                ctx.fillStyle = acs >= 250 ? '#00ff88' : acs >= 200 ? '#ffff00' : acs >= 150 ? '#ff8800' : '#ff4444';
                ctx.fillText(`${acs} ACS`, 600, y);

                // Date
                const matchDate = new Date(match.metadata.started_at);
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
            ctx.fillText('NO RECENT COMPETITIVE MATCHES FOUND', 80, 445);

            ctx.font = '16px Arial';
            ctx.fillStyle = '#cccccc';
            ctx.fillText('Play some competitive matches to see your recent performance here!', 80, 475);
        }
    }

    // Enhanced footer with version info
    ctx.fillStyle = '#666666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Powered by HenrikDev Valorant API • Enhanced Stats v4.0 • MMR + ELO + Seasonal Data', 500, 880);

    return canvas;
}

module.exports = {
    createStatsVisualization
};
