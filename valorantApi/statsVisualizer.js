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
 * @param {Object} mmrData - MMR/rank data from API
 * @param {Array} matchData - Match data from API
 * @param {string} userAvatar - User's Discord avatar URL
 * @param {Object} registration - User registration data
 * @returns {Promise<Canvas>} - The created canvas
 */
async function createStatsVisualization(accountData, mmrData, matchData, userAvatar, registration) {
    const canvas = createCanvas(1000, 800);
    const ctx = canvas.getContext('2d');

    // Enhanced background with pattern
    const gradient = ctx.createLinearGradient(0, 0, 1000, 800);
    gradient.addColorStop(0, '#0a0e13');
    gradient.addColorStop(0.3, '#1e2328');
    gradient.addColorStop(0.7, '#2c3e50');
    gradient.addColorStop(1, '#0a0e13');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 800);

    // Add subtle pattern overlay
    ctx.fillStyle = 'rgba(255, 70, 84, 0.03)';
    for (let i = 0; i < 1000; i += 50) {
        for (let j = 0; j < 800; j += 50) {
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
    ctx.fillRect(0, 792, 1000, 8);
    ctx.fillRect(0, 0, 8, 800);
    ctx.fillRect(992, 0, 8, 800);

    // Enhanced header section
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎯 VALORANT PLAYER PROFILE', 500, 50);

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
        ctx.fillText('👤', 150, 165);
    }

    // Enhanced player name and info
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${accountData.name}#${accountData.tag}`, 220, 135);

    ctx.font = '16px Arial';
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText(`🎮 Level ${accountData.account_level} • 🌍 Region: ${accountData.region.toUpperCase()}`, 220, 160);
    ctx.fillText(`📅 Last Updated: ${new Date(accountData.updated_at).toLocaleDateString()}`, 220, 180);

    // Enhanced current rank section
    if (mmrData && mmrData.current_data) {
        const currentRank = mmrData.current_data;
        const rankInfo = RANK_MAPPING[currentRank.currenttier] || RANK_MAPPING[0];

        // Enhanced rank box with gradient
        const rankBoxGradient = ctx.createLinearGradient(50, 220, 950, 350);
        rankBoxGradient.addColorStop(0, 'rgba(255, 70, 84, 0.15)');
        rankBoxGradient.addColorStop(1, 'rgba(255, 107, 122, 0.15)');
        ctx.fillStyle = rankBoxGradient;
        ctx.fillRect(50, 220, 900, 130);
        ctx.strokeStyle = '#ff4654';
        ctx.lineWidth = 3;
        ctx.strokeRect(50, 220, 900, 130);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('🏆 CURRENT COMPETITIVE RANK', 80, 250);

        // Load and display rank image
        const rankImage = await loadRankImage(currentRank.currenttier);
        if (rankImage) {
            ctx.drawImage(rankImage, 80, 260, 60, 60);
        } else {
            createFallbackRankIcon(ctx, 80, 260, 60, rankInfo);
        }

        ctx.fillStyle = rankInfo.color;
        ctx.font = 'bold 32px Arial';
        ctx.fillText(rankInfo.name, 160, 295);

        if (currentRank.ranking_in_tier !== undefined) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(`${currentRank.ranking_in_tier} RR`, 160, 320);
        }

        if (currentRank.mmr_change_to_last_game) {
            const change = currentRank.mmr_change_to_last_game;
            ctx.fillStyle = change > 0 ? '#00ff88' : '#ff4444';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`Last Game: ${change > 0 ? '+' : ''}${change} RR`, 400, 295);
        }

        // Enhanced peak rank display
        if (mmrData.highest_rank) {
            const peakRank = RANK_MAPPING[mmrData.highest_rank.tier] || RANK_MAPPING[0];
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px Arial';
            ctx.fillText('🌟 Peak Rank:', 600, 280);

            const peakRankImage = await loadRankImage(mmrData.highest_rank.tier);
            if (peakRankImage) {
                ctx.drawImage(peakRankImage, 600, 285, 40, 40);
            } else {
                createFallbackRankIcon(ctx, 600, 285, 40, peakRank);
            }

            ctx.fillStyle = peakRank.color;
            ctx.font = 'bold 20px Arial';
            ctx.fillText(peakRank.name, 650, 310);
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
            const matchesHeaderGradient = ctx.createLinearGradient(50, 370, 950, 400);
            matchesHeaderGradient.addColorStop(0, 'rgba(255, 70, 84, 0.2)');
            matchesHeaderGradient.addColorStop(1, 'rgba(255, 107, 122, 0.2)');
            ctx.fillStyle = matchesHeaderGradient;
            ctx.fillRect(50, 370, 900, 30);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('📊 RECENT COMPETITIVE MATCHES', 80, 390);

            const recentMatches = competitiveMatches.slice(0, 6);
            recentMatches.forEach((match, index) => {
                const y = 420 + index * 60;
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

                // Match result with enhanced styling using emojis
                ctx.fillStyle = won ? '#00ff88' : '#ff4444';
                ctx.font = 'bold 16px Arial';
                ctx.fillText(won ? '🔱 WIN' : '❌ LOSS', 80, y);

                // Map name with icon
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px Arial';
                ctx.fillText(`🗺️ ${match.metadata.map.name}`, 160, y);

                // Agent name
                ctx.fillText(`👤 ${player.agent.name}`, 320, y);

                // Enhanced KDA display
                const kda = `${player.stats.kills}/${player.stats.deaths}/${player.stats.assists}`;
                const kdRatio = player.stats.deaths > 0 ? (player.stats.kills / player.stats.deaths).toFixed(2) : player.stats.kills.toFixed(2);
                ctx.fillText(`⚔️ ${kda} (${kdRatio} K/D)`, 450, y);

                // Score with color coding
                const acs = player.stats.score;
                ctx.fillStyle = acs >= 250 ? '#00ff88' : acs >= 200 ? '#ffff00' : acs >= 150 ? '#ff8800' : '#ff4444';
                ctx.fillText(`📈 ${acs} ACS`, 600, y);

                // Date
                const matchDate = new Date(match.metadata.started_at);
                ctx.fillStyle = '#cccccc';
                ctx.fillText(`📅 ${matchDate.toLocaleDateString()}`, 720, y);

                // Enhanced headshot percentage
                const totalShots = player.stats.headshots + player.stats.bodyshots + player.stats.legshots;
                const hsPercent = totalShots > 0 ? Math.round((player.stats.headshots / totalShots) * 100) : 0;
                ctx.fillStyle = hsPercent >= 30 ? '#00ff88' : hsPercent >= 20 ? '#ffff00' : '#ff8800';
                ctx.fillText(`🎯 ${hsPercent}%`, 820, y);
            });
        } else {
            // No competitive matches found
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('📊 NO RECENT COMPETITIVE MATCHES FOUND', 80, 420);

            ctx.font = '16px Arial';
            ctx.fillStyle = '#cccccc';
            ctx.fillText('Play some competitive matches to see your recent performance here!', 80, 450);
        }
    }

    // Enhanced footer with version info
    ctx.fillStyle = '#666666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Powered by HenrikDev Valorant API • Enhanced Visual Stats v3.0 • KDA + Stored Matches Integration', 500, 780);

    return canvas;
}

module.exports = {
    createStatsVisualization
};
