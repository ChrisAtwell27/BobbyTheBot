// ===============================================
// TOURNAMENT BRACKET GENERATOR
// ===============================================
// Generates bracket structures for single elimination,
// double elimination, and round robin tournaments

/**
 * Calculate the next power of 2 greater than or equal to n
 * @param {number} n - Input number
 * @returns {number} - Next power of 2
 */
function nextPowerOf2(n) {
    if (n <= 1) return 2;
    return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Calculate number of rounds needed for single elimination
 * @param {number} numParticipants - Number of participants
 * @returns {number} - Number of rounds
 */
function calculateRounds(numParticipants) {
    return Math.ceil(Math.log2(numParticipants));
}

/**
 * Shuffle array using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} - Shuffled array (new array)
 */
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Seed participants with standard bracket seeding (1v8, 4v5, 2v7, 3v6, etc.)
 * This ensures highest seeds meet lowest seeds first
 * @param {Array} participants - Array of participant objects
 * @param {boolean} randomize - Whether to randomize seeds first
 * @returns {Array} - Seeded participants in bracket order
 */
function seedParticipants(participants, randomize = true) {
    // Optionally shuffle first for random seeding
    const seeded = randomize ? shuffleArray(participants) : [...participants];

    // Assign seed numbers
    seeded.forEach((p, i) => {
        p.seed = i + 1;
    });

    // For small brackets, just return in order
    if (seeded.length <= 2) return seeded;

    // Standard bracket seeding order
    const bracketSize = nextPowerOf2(seeded.length);
    const positions = generateBracketPositions(bracketSize);

    // Place participants in seeded positions (fill remaining with null for byes)
    const result = new Array(bracketSize).fill(null);
    for (let i = 0; i < seeded.length; i++) {
        result[positions[i]] = seeded[i];
    }

    return result;
}

/**
 * Generate bracket positions for standard seeding
 * @param {number} size - Bracket size (power of 2)
 * @returns {Array} - Array of positions for each seed
 */
function generateBracketPositions(size) {
    if (size === 2) return [0, 1];

    // Recursively build positions
    const half = generateBracketPositions(size / 2);
    const positions = [];

    for (let i = 0; i < half.length; i++) {
        positions.push(half[i] * 2);
        positions.push(size - 1 - half[i] * 2);
    }

    return positions;
}

/**
 * Generate a single elimination bracket
 * @param {Array} participants - Array of { participantId, username, teamName? }
 * @param {boolean} randomize - Whether to randomize seeding
 * @returns {Object} - { matches: Array, rounds: number, totalMatches: number }
 */
function generateSingleElimBracket(participants, randomize = true) {
    if (participants.length < 2) {
        throw new Error('Need at least 2 participants for a tournament');
    }

    const seededParticipants = seedParticipants(participants, randomize);
    const bracketSize = seededParticipants.length;
    const numRounds = calculateRounds(bracketSize);
    const matches = [];

    let matchCounter = 1;
    const matchMap = {}; // Map to track match positions for linking

    // Generate matches for each round
    for (let round = 1; round <= numRounds; round++) {
        const matchesInRound = bracketSize / Math.pow(2, round);

        for (let matchNum = 1; matchNum <= matchesInRound; matchNum++) {
            const matchId = `m${matchCounter}`;

            // Determine next match
            let nextMatchId = null;
            let nextMatchSlot = null;

            if (round < numRounds) {
                const nextMatchNum = Math.ceil(matchNum / 2);
                const nextRoundFirstMatch = matchCounter + matchesInRound - matchNum + 1;
                const nextMatchIndex = nextRoundFirstMatch + nextMatchNum - 1;
                nextMatchId = `m${nextMatchIndex}`;
                nextMatchSlot = matchNum % 2 === 1 ? 1 : 2;
            }

            // Track for later reference
            matchMap[`r${round}m${matchNum}`] = matchId;

            // For round 1, assign participants
            let p1 = null, p1Name = null, p2 = null, p2Name = null;
            let status = 'pending';

            if (round === 1) {
                const idx1 = (matchNum - 1) * 2;
                const idx2 = idx1 + 1;

                const participant1 = seededParticipants[idx1];
                const participant2 = seededParticipants[idx2];

                if (participant1) {
                    p1 = participant1.participantId;
                    p1Name = participant1.teamName || participant1.username;
                }
                if (participant2) {
                    p2 = participant2.participantId;
                    p2Name = participant2.teamName || participant2.username;
                }

                // Determine initial status
                if (p1 && p2) {
                    status = 'ready';
                } else if (p1 || p2) {
                    status = 'bye';
                }
            }

            matches.push({
                matchId,
                round,
                matchNumber: matchNum,
                bracketType: 'winners',
                participant1Id: p1,
                participant1Name: p1Name,
                participant2Id: p2,
                participant2Name: p2Name,
                status,
                nextMatchId,
                nextMatchSlot,
            });

            matchCounter++;
        }
    }

    return {
        matches,
        rounds: numRounds,
        totalMatches: matches.length,
        bracketSize,
    };
}

/**
 * Generate a double elimination bracket
 * @param {Array} participants - Array of participant objects
 * @param {boolean} randomize - Whether to randomize seeding
 * @returns {Object} - { matches: Array, rounds: number, totalMatches: number }
 */
function generateDoubleElimBracket(participants, randomize = true) {
    if (participants.length < 2) {
        throw new Error('Need at least 2 participants for a tournament');
    }

    // Generate winners bracket first
    const winnersResult = generateSingleElimBracket(participants, randomize);
    const winnersMatches = winnersResult.matches;
    const winnersRounds = winnersResult.rounds;
    const bracketSize = winnersResult.bracketSize;

    const matches = [];
    let matchCounter = 1;

    // Add winners bracket matches
    for (const match of winnersMatches) {
        matches.push({
            ...match,
            matchId: `w${match.matchId.slice(1)}`, // Prefix with 'w' for winners
        });
        matchCounter++;
    }

    // Calculate losers bracket structure
    // Losers bracket has 2 * (winnersRounds - 1) rounds
    const losersRounds = 2 * (winnersRounds - 1);
    const losersMatches = [];
    let losersMatchCounter = 1;

    // Generate losers bracket rounds
    // Alternating between "new losers drop down" and "losers play each other"
    for (let round = 1; round <= losersRounds; round++) {
        // Negative round numbers for losers bracket
        const losersRound = -round;

        // Calculate matches in this losers round
        let matchesInRound;
        if (round % 2 === 1) {
            // Odd rounds: losers from winners bracket drop down
            matchesInRound = bracketSize / Math.pow(2, Math.ceil(round / 2) + 1);
        } else {
            // Even rounds: remaining losers play each other
            matchesInRound = bracketSize / Math.pow(2, Math.ceil(round / 2) + 1);
        }

        matchesInRound = Math.max(1, Math.floor(matchesInRound));

        for (let matchNum = 1; matchNum <= matchesInRound; matchNum++) {
            const matchId = `l${losersMatchCounter}`;

            // Determine next match in losers bracket
            let nextMatchId = null;
            let nextMatchSlot = null;

            if (round < losersRounds) {
                nextMatchId = `l${losersMatchCounter + matchesInRound}`;
                nextMatchSlot = matchNum % 2 === 1 ? 1 : 2;
            } else {
                // Final losers match goes to grand finals
                nextMatchId = 'gf1';
                nextMatchSlot = 2; // Losers bracket winner is participant 2 in grand finals
            }

            losersMatches.push({
                matchId,
                round: losersRound,
                matchNumber: matchNum,
                bracketType: 'losers',
                participant1Id: null,
                participant1Name: null,
                participant2Id: null,
                participant2Name: null,
                status: 'pending',
                nextMatchId,
                nextMatchSlot,
            });

            losersMatchCounter++;
        }
    }

    matches.push(...losersMatches);

    // Add grand finals
    matches.push({
        matchId: 'gf1',
        round: winnersRounds + 1,
        matchNumber: 1,
        bracketType: 'grand_finals',
        participant1Id: null, // Winners bracket champion
        participant1Name: null,
        participant2Id: null, // Losers bracket champion
        participant2Name: null,
        status: 'pending',
        nextMatchId: null,
        nextMatchSlot: null,
    });

    // Update winners bracket matches to link losers to losers bracket
    for (let i = 0; i < winnersMatches.length; i++) {
        const match = matches[i];
        // Link to appropriate losers bracket match
        // This is simplified - in a full implementation, you'd calculate exact positions
        if (match.round < winnersRounds) {
            match.loserNextMatchId = `l${match.round}`;
        }
    }

    // Update final winners match to go to grand finals
    const finalWinnersMatch = matches.find(m => m.bracketType === 'winners' && m.round === winnersRounds);
    if (finalWinnersMatch) {
        finalWinnersMatch.nextMatchId = 'gf1';
        finalWinnersMatch.nextMatchSlot = 1;
    }

    return {
        matches,
        rounds: winnersRounds + losersRounds + 1, // Including grand finals
        winnersRounds,
        losersRounds,
        totalMatches: matches.length,
        bracketSize,
    };
}

/**
 * Generate a round robin bracket
 * Uses the circle method for scheduling
 * @param {Array} participants - Array of participant objects
 * @param {boolean} randomize - Whether to randomize order
 * @returns {Object} - { matches: Array, rounds: number, totalMatches: number }
 */
function generateRoundRobinBracket(participants, randomize = true) {
    if (participants.length < 2) {
        throw new Error('Need at least 2 participants for a tournament');
    }

    // Optionally shuffle
    const players = randomize ? shuffleArray(participants) : [...participants];

    // If odd number, add a "bye" participant
    const hasBye = players.length % 2 === 1;
    if (hasBye) {
        players.push({ participantId: null, username: 'BYE' });
    }

    const n = players.length;
    const numRounds = n - 1;
    const matchesPerRound = n / 2;
    const matches = [];
    let matchCounter = 1;

    // Circle method: fix position 0, rotate others
    for (let round = 1; round <= numRounds; round++) {
        for (let match = 0; match < matchesPerRound; match++) {
            // Calculate positions using circle method
            const home = match === 0 ? 0 : (round + match - 1) % (n - 1) + 1;
            const away = (round + n - match - 2) % (n - 1) + 1;

            // Adjust for fixed position
            const p1 = players[home];
            const p2 = players[away];

            // Skip bye matches
            if (!p1.participantId || !p2.participantId) {
                continue;
            }

            matches.push({
                matchId: `rr${matchCounter}`,
                round,
                matchNumber: match + 1,
                bracketType: 'round_robin',
                participant1Id: p1.participantId,
                participant1Name: p1.teamName || p1.username,
                participant2Id: p2.participantId,
                participant2Name: p2.teamName || p2.username,
                status: 'ready', // All round robin matches can start immediately
                nextMatchId: null,
                nextMatchSlot: null,
            });

            matchCounter++;
        }
    }

    return {
        matches,
        rounds: numRounds,
        totalMatches: matches.length,
        matchesPerRound,
    };
}

/**
 * Generate bracket based on tournament type
 * @param {string} type - 'single_elim', 'double_elim', or 'round_robin'
 * @param {Array} participants - Array of participant objects
 * @param {boolean} randomize - Whether to randomize seeding
 * @returns {Object} - Bracket data
 */
function generateBracket(type, participants, randomize = true) {
    switch (type) {
        case 'single_elim':
            return generateSingleElimBracket(participants, randomize);
        case 'double_elim':
            return generateDoubleElimBracket(participants, randomize);
        case 'round_robin':
            return generateRoundRobinBracket(participants, randomize);
        default:
            throw new Error(`Unknown tournament type: ${type}`);
    }
}

/**
 * Get round name for display
 * @param {number} round - Round number
 * @param {number} totalRounds - Total number of rounds
 * @param {string} bracketType - Type of bracket
 * @returns {string} - Human-readable round name
 */
function getRoundName(round, totalRounds, bracketType) {
    if (bracketType === 'round_robin') {
        return `Round ${round}`;
    }

    if (bracketType === 'losers') {
        return `Losers Round ${Math.abs(round)}`;
    }

    if (bracketType === 'grand_finals') {
        return 'Grand Finals';
    }

    // Winners bracket naming
    const roundsFromEnd = totalRounds - round;
    switch (roundsFromEnd) {
        case 0:
            return 'Finals';
        case 1:
            return 'Semi-Finals';
        case 2:
            return 'Quarter-Finals';
        default:
            return `Round ${round}`;
    }
}

/**
 * Calculate round robin standings
 * @param {Array} participants - Array of participant objects with wins/losses
 * @returns {Array} - Sorted standings
 */
function calculateRoundRobinStandings(participants) {
    return [...participants]
        .map(p => ({
            ...p,
            points: p.wins * 3, // 3 points per win
            matchesPlayed: p.wins + p.losses,
        }))
        .sort((a, b) => {
            // Sort by points, then wins, then fewest losses
            if (b.points !== a.points) return b.points - a.points;
            if (b.wins !== a.wins) return b.wins - a.wins;
            return a.losses - b.losses;
        });
}

module.exports = {
    generateBracket,
    generateSingleElimBracket,
    generateDoubleElimBracket,
    generateRoundRobinBracket,
    seedParticipants,
    getRoundName,
    calculateRoundRobinStandings,
    nextPowerOf2,
    calculateRounds,
};
