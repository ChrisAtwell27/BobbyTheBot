// ===============================================
// VALORANT HEAD-TO-HEAD COMPARISON VISUALIZER
// ===============================================
// Creates visual canvas-based comparison displays for two Valorant players

const { createCanvas } = require('canvas');
const { loadImageFromURL } = require('./apiClient');
const { RANK_MAPPING } = require('./rankUtils');
const { getAgentById } = require('./agentUtils');

/**
 * Creates a head-to-head comparison visualization for two players
 * @param {Object} player1 - First player data { account, mmr, matchStats, bestAgent, avatar, registration }
 * @param {Object} player2 - Second player data { account, mmr, matchStats, bestAgent, avatar, registration }
 * @returns {Promise<Buffer>} - The created canvas buffer
 */
async function createCompareVisualization(player1, player2) {
    const canvas = createCanvas(1000, 700);
    const ctx = canvas.getContext('2d');

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 1000, 700);
    gradient.addColorStop(0, '#0a0e13');
    gradient.addColorStop(0.5, '#1a1f25');
    gradient.addColorStop(1, '#0a0e13');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 700);

    // Add subtle pattern
    ctx.fillStyle = 'rgba(255, 70, 84, 0.02)';
    for (let i = 0; i < 1000; i += 40) {
        for (let j = 0; j < 700; j += 40) {
            if ((i + j) % 80 === 0) {
                ctx.fillRect(i, j, 20, 20);
            }
        }
    }

    // Border accents
    const accentGradient = ctx.createLinearGradient(0, 0, 1000, 0);
    accentGradient.addColorStop(0, '#ff4654');
    accentGradient.addColorStop(0.5, '#ff6b7a');
    accentGradient.addColorStop(1, '#ff4654');
    ctx.fillStyle = accentGradient;
    ctx.fillRect(0, 0, 1000, 6);
    ctx.fillRect(0, 694, 1000, 6);
    ctx.fillRect(0, 0, 6, 700);
    ctx.fillRect(994, 0, 6, 700);

    // Center divider line
    ctx.strokeStyle = 'rgba(255, 70, 84, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(500, 80);
    ctx.lineTo(500, 650);
    ctx.stroke();
    ctx.setLineDash([]);

    // "VS" in center
    ctx.fillStyle = '#ff4654';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('VS', 500, 60);

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.fillText('HEAD TO HEAD', 500, 35);

    // Load avatars
    const [avatar1, avatar2] = await Promise.all([
        loadImageFromURL(player1.avatar).catch(() => null),
        loadImageFromURL(player2.avatar).catch(() => null)
    ]);

    // Draw player 1 (left side)
    await drawPlayerSide(ctx, player1, avatar1, 50, true);

    // Draw player 2 (right side)
    await drawPlayerSide(ctx, player2, avatar2, 550, false);

    // Draw comparison bars
    drawComparisonBars(ctx, player1, player2);

    // Footer
    ctx.fillStyle = '#666666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Powered by HenrikDev Valorant API • Head-to-Head Comparison', 500, 680);

    return canvas.toBuffer();
}

/**
 * Draw one player's side of the comparison
 */
async function drawPlayerSide(ctx, player, avatar, startX, isLeft) {
    const centerX = startX + 200;

    // Player card background
    ctx.fillStyle = 'rgba(30, 35, 40, 0.8)';
    ctx.fillRect(startX, 85, 400, 180);
    ctx.strokeStyle = isLeft ? '#00ff88' : '#ff4654';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, 85, 400, 180);

    // Avatar
    const avatarX = centerX;
    const avatarY = 140;
    const avatarRadius = 40;

    if (avatar) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
        ctx.restore();
    } else {
        ctx.fillStyle = '#5865f2';
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '35px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('👤', avatarX, avatarY + 12);
    }

    // Avatar border
    ctx.strokeStyle = isLeft ? '#00ff88' : '#ff4654';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius + 2, 0, Math.PI * 2);
    ctx.stroke();

    // Player name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    const name = player.account?.name || player.registration?.name || 'Unknown';
    const tag = player.account?.tag || player.registration?.tag || '';
    ctx.fillText(`${name}#${tag}`, centerX, 200);

    // Rank
    const rankData = player.mmr?.data?.current_data || player.mmr?.current_data;
    const rankName = rankData?.currenttierpatched || 'Unranked';
    const rr = rankData?.ranking_in_tier ?? rankData?.elo ?? 0;
    const rankColor = getRankColorByName(rankName);

    ctx.fillStyle = rankColor;
    ctx.font = 'bold 16px Arial';
    ctx.fillText(rankName, centerX, 225);
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '14px Arial';
    ctx.fillText(`${rr} RR`, centerX, 245);

    // Best Agent
    if (player.bestAgent && player.bestAgent.name) {
        ctx.fillStyle = '#5865f2';
        ctx.font = 'bold 12px Arial';
        ctx.fillText('BEST AGENT', centerX, 268);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.fillText(player.bestAgent.name, centerX, 285);
    }
}

/**
 * Draw comparison stat bars in the middle section
 */
function drawComparisonBars(ctx, player1, player2) {
    const stats = getComparisonStats(player1, player2);
    const startY = 290;
    const barHeight = 35;
    const gap = 10;

    stats.forEach((stat, index) => {
        const y = startY + index * (barHeight + gap);
        drawStatBar(ctx, stat, y, barHeight);
    });
}

/**
 * Get stats to compare between two players
 */
function getComparisonStats(player1, player2) {
    const p1Stats = player1.matchStats || {};
    const p2Stats = player2.matchStats || {};
    const p1Agent = player1.bestAgent || {};
    const p2Agent = player2.bestAgent || {};

    // Get rank tiers
    const p1Rank = player1.mmr?.data?.current_data || player1.mmr?.current_data;
    const p2Rank = player2.mmr?.data?.current_data || player2.mmr?.current_data;
    const p1Tier = p1Rank?.currenttier || 0;
    const p2Tier = p2Rank?.currenttier || 0;

    return [
        {
            name: 'RANK',
            p1Value: p1Tier,
            p2Value: p2Tier,
            p1Display: p1Rank?.currenttierpatched || 'Unranked',
            p2Display: p2Rank?.currenttierpatched || 'Unranked',
            higherIsBetter: true,
            isRank: true
        },
        {
            name: 'WIN RATE',
            p1Value: p1Stats.winRate || 0,
            p2Value: p2Stats.winRate || 0,
            p1Display: `${(p1Stats.winRate || 0).toFixed(1)}%`,
            p2Display: `${(p2Stats.winRate || 0).toFixed(1)}%`,
            higherIsBetter: true
        },
        {
            name: 'KDA',
            p1Value: p1Stats.avgKDA || 0,
            p2Value: p2Stats.avgKDA || 0,
            p1Display: (p1Stats.avgKDA || 0).toFixed(2),
            p2Display: (p2Stats.avgKDA || 0).toFixed(2),
            higherIsBetter: true
        },
        {
            name: 'AVG ACS',
            p1Value: p1Stats.avgACS || 0,
            p2Value: p2Stats.avgACS || 0,
            p1Display: Math.round(p1Stats.avgACS || 0).toString(),
            p2Display: Math.round(p2Stats.avgACS || 0).toString(),
            higherIsBetter: true
        },
        {
            name: 'MATCHES',
            p1Value: p1Stats.totalMatches || 0,
            p2Value: p2Stats.totalMatches || 0,
            p1Display: (p1Stats.totalMatches || 0).toString(),
            p2Display: (p2Stats.totalMatches || 0).toString(),
            higherIsBetter: true
        },
        {
            name: 'TOTAL KILLS',
            p1Value: p1Stats.totalKills || 0,
            p2Value: p2Stats.totalKills || 0,
            p1Display: (p1Stats.totalKills || 0).toString(),
            p2Display: (p2Stats.totalKills || 0).toString(),
            higherIsBetter: true
        },
        {
            name: 'BEST AGENT WIN%',
            p1Value: p1Agent.winRate || 0,
            p2Value: p2Agent.winRate || 0,
            p1Display: p1Agent.name ? `${(p1Agent.winRate || 0).toFixed(1)}%` : 'N/A',
            p2Display: p2Agent.name ? `${(p2Agent.winRate || 0).toFixed(1)}%` : 'N/A',
            higherIsBetter: true
        },
        {
            name: 'BEST AGENT KDA',
            p1Value: p1Agent.kda || 0,
            p2Value: p2Agent.kda || 0,
            p1Display: p1Agent.name ? (p1Agent.kda || 0).toFixed(2) : 'N/A',
            p2Display: p2Agent.name ? (p2Agent.kda || 0).toFixed(2) : 'N/A',
            higherIsBetter: true
        }
    ];
}

/**
 * Draw a single stat comparison bar
 */
function drawStatBar(ctx, stat, y, height) {
    const leftX = 50;
    const rightX = 550;
    const barWidth = 180;
    const centerX = 500;

    // Stat name in center
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(stat.name, centerX, y + height / 2 + 4);

    // Determine winner
    let p1Wins = false;
    let p2Wins = false;
    let tie = false;

    if (stat.p1Value === stat.p2Value) {
        tie = true;
    } else if (stat.higherIsBetter) {
        p1Wins = stat.p1Value > stat.p2Value;
        p2Wins = stat.p2Value > stat.p1Value;
    } else {
        p1Wins = stat.p1Value < stat.p2Value;
        p2Wins = stat.p2Value < stat.p1Value;
    }

    // Player 1 bar (right-aligned to center)
    const p1BarX = centerX - 80 - barWidth;
    ctx.fillStyle = p1Wins ? 'rgba(0, 255, 136, 0.3)' : tie ? 'rgba(255, 255, 0, 0.2)' : 'rgba(100, 100, 100, 0.3)';
    ctx.fillRect(p1BarX, y, barWidth, height);
    ctx.strokeStyle = p1Wins ? '#00ff88' : tie ? '#ffff00' : '#555555';
    ctx.lineWidth = 1;
    ctx.strokeRect(p1BarX, y, barWidth, height);

    // Player 1 value
    ctx.fillStyle = p1Wins ? '#00ff88' : tie ? '#ffff00' : '#ffffff';
    ctx.font = p1Wins ? 'bold 14px Arial' : '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(stat.p1Display, p1BarX + barWidth / 2, y + height / 2 + 5);

    // Player 2 bar (left-aligned from center)
    const p2BarX = centerX + 80;
    ctx.fillStyle = p2Wins ? 'rgba(255, 70, 84, 0.3)' : tie ? 'rgba(255, 255, 0, 0.2)' : 'rgba(100, 100, 100, 0.3)';
    ctx.fillRect(p2BarX, y, barWidth, height);
    ctx.strokeStyle = p2Wins ? '#ff4654' : tie ? '#ffff00' : '#555555';
    ctx.lineWidth = 1;
    ctx.strokeRect(p2BarX, y, barWidth, height);

    // Player 2 value
    ctx.fillStyle = p2Wins ? '#ff4654' : tie ? '#ffff00' : '#ffffff';
    ctx.font = p2Wins ? 'bold 14px Arial' : '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(stat.p2Display, p2BarX + barWidth / 2, y + height / 2 + 5);

    // Winner indicator
    if (p1Wins) {
        ctx.fillStyle = '#00ff88';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'right';
        ctx.fillText('◀', p1BarX - 5, y + height / 2 + 5);
    } else if (p2Wins) {
        ctx.fillStyle = '#ff4654';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('▶', p2BarX + barWidth + 5, y + height / 2 + 5);
    }
}

/**
 * Get color based on rank name
 */
function getRankColorByName(rankName) {
    if (!rankName) return '#666666';
    const lower = rankName.toLowerCase();

    if (lower.includes('iron')) return '#3d3d3d';
    if (lower.includes('bronze')) return '#a16a4a';
    if (lower.includes('silver')) return '#b4b4b4';
    if (lower.includes('gold')) return '#daa520';
    if (lower.includes('platinum')) return '#0ea5a5';
    if (lower.includes('diamond')) return '#b9a3eb';
    if (lower.includes('ascendant')) return '#00ff88';
    if (lower.includes('immortal')) return '#ff4654';
    if (lower.includes('radiant')) return '#ffffaa';

    return '#666666';
}

module.exports = {
    createCompareVisualization
};
