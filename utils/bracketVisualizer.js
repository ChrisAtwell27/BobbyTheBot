// ===============================================
// TOURNAMENT BRACKET VISUALIZER
// ===============================================
// Creates canvas-based bracket visualizations

const { createCanvas } = require('canvas');
const { getRoundName } = require('./bracketGenerator');

// Colors
const COLORS = {
    background: '#0a0e13',
    backgroundLight: '#1a1f25',
    accent: '#ff4654',
    accentLight: '#ff6b7a',
    gold: '#ffd700',
    silver: '#c0c0c0',
    green: '#00ff88',
    text: '#ffffff',
    textMuted: '#888888',
    textDim: '#555555',
    matchBox: 'rgba(30, 35, 40, 0.9)',
    matchBoxReady: 'rgba(0, 100, 50, 0.3)',
    matchBoxComplete: 'rgba(0, 80, 40, 0.5)',
    matchBoxPending: 'rgba(50, 50, 50, 0.5)',
    border: '#333333',
    winnerBorder: '#00ff88',
    line: 'rgba(255, 70, 84, 0.4)',
};

// Layout constants
const MATCH_WIDTH = 200;
const MATCH_HEIGHT = 60;
const MATCH_GAP_X = 80;
const MATCH_GAP_Y = 20;
const PADDING = 40;
const PARTICIPANT_HEIGHT = 25;

/**
 * Create a single elimination bracket visualization
 * @param {Object} tournament - Tournament data
 * @param {Array} matches - Array of match objects
 * @param {Array} participants - Array of participant objects
 * @returns {Promise<Buffer>} - PNG buffer
 */
async function createSingleElimVisualization(tournament, matches, participants) {
    // Calculate dimensions
    const rounds = Math.max(...matches.map(m => m.round));
    const firstRoundMatches = matches.filter(m => m.round === 1).length;

    const canvasWidth = PADDING * 2 + (rounds * (MATCH_WIDTH + MATCH_GAP_X));
    const canvasHeight = PADDING * 2 + (firstRoundMatches * (MATCH_HEIGHT + MATCH_GAP_Y)) + 100; // Extra for title

    const canvas = createCanvas(Math.max(canvasWidth, 800), Math.max(canvasHeight, 500));
    const ctx = canvas.getContext('2d');

    // Draw background
    drawBackground(ctx, canvas.width, canvas.height);

    // Draw title
    drawTitle(ctx, canvas.width, tournament.name, `${getTournamentTypeDisplay(tournament.type)} • ${getTeamSizeDisplay(tournament.teamSize)}`);

    // Group matches by round
    const matchesByRound = {};
    for (const match of matches) {
        if (!matchesByRound[match.round]) {
            matchesByRound[match.round] = [];
        }
        matchesByRound[match.round].push(match);
    }

    // Calculate match positions
    const matchPositions = {};
    const titleOffset = 80;

    for (let round = 1; round <= rounds; round++) {
        const roundMatches = matchesByRound[round] || [];
        const totalHeight = canvasHeight - titleOffset - PADDING * 2;
        const matchSpacing = totalHeight / roundMatches.length;

        const x = PADDING + (round - 1) * (MATCH_WIDTH + MATCH_GAP_X);

        roundMatches.forEach((match, idx) => {
            const y = titleOffset + PADDING + (idx * matchSpacing) + (matchSpacing / 2) - (MATCH_HEIGHT / 2);
            matchPositions[match.matchId] = { x, y };
        });
    }

    // Draw connecting lines first
    for (const match of matches) {
        if (match.nextMatchId && matchPositions[match.nextMatchId]) {
            const from = matchPositions[match.matchId];
            const to = matchPositions[match.nextMatchId];

            if (from && to) {
                drawBracketLine(ctx, from, to);
            }
        }
    }

    // Draw matches
    for (const match of matches) {
        const pos = matchPositions[match.matchId];
        if (pos) {
            drawMatch(ctx, pos.x, pos.y, match, rounds);
        }
    }

    // Draw round labels
    for (let round = 1; round <= rounds; round++) {
        const x = PADDING + (round - 1) * (MATCH_WIDTH + MATCH_GAP_X) + MATCH_WIDTH / 2;
        const roundName = getRoundName(round, rounds, 'winners');

        ctx.fillStyle = COLORS.textMuted;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(roundName.toUpperCase(), x, titleOffset + 10);
    }

    // Draw footer
    drawFooter(ctx, canvas.width, canvas.height, tournament.status);

    return canvas.toBuffer();
}

/**
 * Create a round robin standings visualization
 * @param {Object} tournament - Tournament data
 * @param {Array} matches - Array of match objects
 * @param {Array} participants - Array of participant objects sorted by standing
 * @returns {Promise<Buffer>} - PNG buffer
 */
async function createRoundRobinVisualization(tournament, matches, participants) {
    const rowHeight = 40;
    const headerHeight = 50;
    const tableWidth = 600;
    const canvasHeight = PADDING * 2 + 100 + headerHeight + (participants.length * rowHeight) + 60;
    const canvasWidth = Math.max(700, tableWidth + PADDING * 2);

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // Draw background
    drawBackground(ctx, canvas.width, canvas.height);

    // Draw title
    drawTitle(ctx, canvas.width, tournament.name, 'Round Robin Standings');

    const tableX = (canvasWidth - tableWidth) / 2;
    let tableY = 100;

    // Draw table header
    ctx.fillStyle = 'rgba(255, 70, 84, 0.2)';
    ctx.fillRect(tableX, tableY, tableWidth, headerHeight);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(tableX, tableY, tableWidth, headerHeight);

    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('#', tableX + 20, tableY + 30);
    ctx.fillText('PARTICIPANT', tableX + 60, tableY + 30);
    ctx.textAlign = 'center';
    ctx.fillText('W', tableX + 350, tableY + 30);
    ctx.fillText('L', tableX + 420, tableY + 30);
    ctx.fillText('PTS', tableX + 520, tableY + 30);

    tableY += headerHeight;

    // Draw participant rows
    participants.forEach((participant, idx) => {
        const isEven = idx % 2 === 0;
        const y = tableY + idx * rowHeight;

        // Row background
        ctx.fillStyle = isEven ? 'rgba(30, 35, 40, 0.8)' : 'rgba(40, 45, 50, 0.8)';
        ctx.fillRect(tableX, y, tableWidth, rowHeight);

        // Highlight top 3
        if (idx < 3) {
            const medals = [COLORS.gold, COLORS.silver, '#cd7f32'];
            ctx.fillStyle = medals[idx];
            ctx.globalAlpha = 0.1;
            ctx.fillRect(tableX, y, tableWidth, rowHeight);
            ctx.globalAlpha = 1;
        }

        // Border
        ctx.strokeStyle = COLORS.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(tableX, y, tableWidth, rowHeight);

        // Position
        ctx.fillStyle = idx < 3 ? [COLORS.gold, COLORS.silver, '#cd7f32'][idx] : COLORS.text;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`${idx + 1}`, tableX + 20, y + 25);

        // Name
        ctx.fillStyle = COLORS.text;
        ctx.font = '14px Arial';
        const displayName = participant.teamName || participant.username || 'Unknown';
        ctx.fillText(displayName.slice(0, 25), tableX + 60, y + 25);

        // Stats
        ctx.textAlign = 'center';
        ctx.fillStyle = COLORS.green;
        ctx.fillText(`${participant.wins || 0}`, tableX + 350, y + 25);
        ctx.fillStyle = COLORS.accent;
        ctx.fillText(`${participant.losses || 0}`, tableX + 420, y + 25);
        ctx.fillStyle = COLORS.text;
        ctx.font = 'bold 14px Arial';
        ctx.fillText(`${(participant.wins || 0) * 3}`, tableX + 520, y + 25);
    });

    // Draw footer
    drawFooter(ctx, canvas.width, canvas.height, tournament.status);

    return canvas.toBuffer();
}

/**
 * Draw background gradient and pattern
 */
function drawBackground(ctx, width, height) {
    // Gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, COLORS.background);
    gradient.addColorStop(0.5, COLORS.backgroundLight);
    gradient.addColorStop(1, COLORS.background);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Subtle pattern
    ctx.fillStyle = 'rgba(255, 70, 84, 0.02)';
    for (let i = 0; i < width; i += 40) {
        for (let j = 0; j < height; j += 40) {
            if ((i + j) % 80 === 0) {
                ctx.fillRect(i, j, 20, 20);
            }
        }
    }

    // Border accents
    const accentGradient = ctx.createLinearGradient(0, 0, width, 0);
    accentGradient.addColorStop(0, COLORS.accent);
    accentGradient.addColorStop(0.5, COLORS.accentLight);
    accentGradient.addColorStop(1, COLORS.accent);
    ctx.fillStyle = accentGradient;
    ctx.fillRect(0, 0, width, 4);
    ctx.fillRect(0, height - 4, width, 4);
}

/**
 * Draw tournament title
 */
function drawTitle(ctx, width, title, subtitle) {
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, width / 2, 40);

    if (subtitle) {
        ctx.fillStyle = COLORS.textMuted;
        ctx.font = '14px Arial';
        ctx.fillText(subtitle, width / 2, 60);
    }
}

/**
 * Draw a single match box
 */
function drawMatch(ctx, x, y, match, totalRounds) {
    // Determine box color based on status
    let boxColor = COLORS.matchBox;
    let borderColor = COLORS.border;

    switch (match.status) {
        case 'completed':
            boxColor = COLORS.matchBoxComplete;
            borderColor = COLORS.winnerBorder;
            break;
        case 'ready':
        case 'in_progress':
            boxColor = COLORS.matchBoxReady;
            borderColor = COLORS.green;
            break;
        case 'bye':
            boxColor = 'rgba(100, 100, 50, 0.3)';
            borderColor = '#aa8800';
            break;
        default:
            boxColor = COLORS.matchBoxPending;
    }

    // Draw box
    ctx.fillStyle = boxColor;
    ctx.fillRect(x, y, MATCH_WIDTH, MATCH_HEIGHT);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, MATCH_WIDTH, MATCH_HEIGHT);

    // Draw participant slots
    const slot1Y = y + PARTICIPANT_HEIGHT / 2 + 5;
    const slot2Y = y + MATCH_HEIGHT - PARTICIPANT_HEIGHT / 2 - 5;

    drawParticipantSlot(ctx, x, slot1Y, match.participant1Name, match.winnerId === match.participant1Id);
    drawParticipantSlot(ctx, x, slot2Y, match.participant2Name, match.winnerId === match.participant2Id);

    // Draw divider line
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 5, y + MATCH_HEIGHT / 2);
    ctx.lineTo(x + MATCH_WIDTH - 5, y + MATCH_HEIGHT / 2);
    ctx.stroke();

    // Draw score if completed
    if (match.status === 'completed' && match.score) {
        ctx.fillStyle = COLORS.textMuted;
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(match.score, x + MATCH_WIDTH - 10, y + MATCH_HEIGHT / 2 + 3);
    }

    // Draw match number
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '9px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`#${match.matchNumber}`, x + 5, y + 10);
}

/**
 * Draw a participant slot within a match
 */
function drawParticipantSlot(ctx, x, y, name, isWinner) {
    const displayName = name || 'TBD';

    ctx.fillStyle = isWinner ? COLORS.green : (name ? COLORS.text : COLORS.textDim);
    ctx.font = isWinner ? 'bold 12px Arial' : '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(displayName.slice(0, 20), x + 10, y + 4);

    // Winner indicator
    if (isWinner) {
        ctx.fillStyle = COLORS.green;
        ctx.font = '10px Arial';
        ctx.textAlign = 'right';
        ctx.fillText('✓', x + MATCH_WIDTH - 10, y + 4);
    }
}

/**
 * Draw connecting line between matches
 */
function drawBracketLine(ctx, from, to) {
    const startX = from.x + MATCH_WIDTH;
    const startY = from.y + MATCH_HEIGHT / 2;
    const endX = to.x;
    const endY = to.y + MATCH_HEIGHT / 2;
    const midX = startX + (endX - startX) / 2;

    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(midX, startY);
    ctx.lineTo(midX, endY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
}

/**
 * Draw footer
 */
function drawFooter(ctx, width, height, status) {
    const statusColors = {
        open: '#00ff88',
        closed: '#ffaa00',
        active: '#00aaff',
        completed: '#888888',
        cancelled: '#ff4444',
    };

    ctx.fillStyle = statusColors[status] || COLORS.textMuted;
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`STATUS: ${status.toUpperCase()}`, width / 2, height - 20);

    ctx.fillStyle = COLORS.textDim;
    ctx.font = '10px Arial';
    ctx.fillText('Tournament Bracket System', width / 2, height - 8);
}

/**
 * Get display name for tournament type
 */
function getTournamentTypeDisplay(type) {
    switch (type) {
        case 'single_elim': return 'Single Elimination';
        case 'double_elim': return 'Double Elimination';
        case 'round_robin': return 'Round Robin';
        default: return type;
    }
}

/**
 * Get display name for team size
 */
function getTeamSizeDisplay(teamSize) {
    return teamSize === 1 ? '1v1' : `${teamSize}v${teamSize}`;
}

/**
 * Create bracket visualization based on tournament type
 * @param {Object} tournament - Tournament data
 * @param {Array} matches - Array of match objects
 * @param {Array} participants - Array of participant objects
 * @returns {Promise<Buffer>} - PNG buffer
 */
async function createBracketVisualization(tournament, matches, participants) {
    switch (tournament.type) {
        case 'round_robin':
            return createRoundRobinVisualization(tournament, matches, participants);
        case 'double_elim':
            // For now, show just winners bracket
            // TODO: Full double elim visualization
            const winnersMatches = matches.filter(m => m.bracketType === 'winners' || m.bracketType === 'grand_finals');
            return createSingleElimVisualization(tournament, winnersMatches, participants);
        case 'single_elim':
        default:
            return createSingleElimVisualization(tournament, matches, participants);
    }
}

module.exports = {
    createBracketVisualization,
    createSingleElimVisualization,
    createRoundRobinVisualization,
    getTournamentTypeDisplay,
    getTeamSizeDisplay,
};
