/**
 * Mafia Game Utility Functions
 * Helper functions for role distribution, team counting, win conditions, etc.
 */

const { ROLES, getAvailableRoleKeys } = require('../roles/mafiaRoles');

/**
 * Get a player's actual team (respecting conversions)
 * @param {Object} player - Player object
 * @returns {string} Team name ('bee', 'wasp', or 'neutral')
 */
function getPlayerTeam(player) {
    // Check if player was converted (Yakuza conversion overrides role team)
    if (player.originalTeam) {
        return player.originalTeam;
    }
    // Check if Mercenary with assigned team
    if (player.role === 'MERCENARY' && player.mercenaryTeam) {
        return player.mercenaryTeam;
    }
    // Otherwise use the role's default team
    return ROLES[player.role].team;
}

/**
 * Check if a player is a mute variant
 * @param {Object} player - Player object
 * @returns {boolean} True if player is mute
 */
function isMutePlayer(player) {
    if (!player) return false;
    const role = ROLES[player.role];
    return role && role.isMuteBee === true;
}

/**
 * Get role distribution based on player count
 * @param {number} playerCount - Number of players
 * @param {boolean} randomMode - If true, uses fully random distribution (only wasp count and queen guaranteed)
 * @param {boolean} debugMode - If true, forces wasp count to 2 for testing
 * @param {string} tier - Subscription tier ('plus' or 'ultimate')
 * @returns {Array} Array of role keys
 */
function getRoleDistribution(playerCount, randomMode = false, debugMode = false, tier = 'plus') {
    const distribution = [];

    if (playerCount < 6) {
        return null;
    }

    // Get available roles based on tier
    const availableRoleKeys = getAvailableRoleKeys(tier);

    // Helper to filter roles by tier
    const filterByTier = (roles) => roles.filter(r => availableRoleKeys.includes(r));

    // Calculate faction sizes based on player count
    let waspCount;

    // Debug mode: force wasp count to 2
    if (debugMode) {
        waspCount = 2;
    } else if (playerCount === 6) {
        waspCount = 1;
    } else if (playerCount >= 7 && playerCount <= 8) {
        waspCount = 1; // 7-8 players: Only Wasp Queen (no Killer Wasp yet)
    } else if (playerCount === 9) {
        waspCount = 2; // 9 players: Wasp Queen + Killer Wasp
    } else if (playerCount >= 10 && playerCount <= 13) {
        waspCount = 3;
    } else if (playerCount >= 14 && playerCount <= 16) {
        waspCount = 4;
    } else {
        // For 17+ players, use formula (roughly 30% wasps)
        waspCount = Math.floor(playerCount * 0.3);
    }

    const neutralCount = playerCount >= 8 ? Math.floor(playerCount * 0.15) : 0;
    const beeCount = playerCount - waspCount - neutralCount;

    // === WASP ROLES ===
    if (waspCount >= 1) distribution.push('WASP_QUEEN'); // Always have Queen

    // Killer Wasp only appears with 9+ players (2+ wasps needed)
    if (waspCount >= 2 && playerCount >= 9) {
        distribution.push('KILLER_WASP');
    }

    // All remaining wasp slots are random (filtered by tier)
    const allWaspRoles = filterByTier(['DECEIVER_WASP', 'SPY_WASP', 'CONSORT_WASP', 'JANITOR_WASP', 'DISGUISER_WASP', 'KILLER_WASP', 'BLACKMAILER_WASP', 'HYPNOTIST_WASP', 'POISONER_WASP', 'SABOTEUR_WASP', 'MIMIC_WASP', 'SILENCER_WASP', 'MOLE_WASP', 'KIDNAPPER_WASP', 'YAKUZA_WASP']);
    for (let i = distribution.length; i < waspCount; i++) {
        const randomRole = allWaspRoles[Math.floor(Math.random() * allWaspRoles.length)];
        distribution.push(randomRole);
    }

    // === NEUTRAL ROLES === (filtered by tier)
    const neutralRoles = filterByTier(['CLOWN_BEETLE', 'BOUNTY_HUNTER', 'BUTTERFLY', 'MURDER_HORNET', 'FIRE_ANT', 'SPIDER', 'AMNESIAC_BEETLE', 'PIRATE_BEETLE', 'GUARDIAN_ANT', 'GOSSIP_BEETLE', 'PHANTOM_MOTH', 'GAMBLER_BEETLE', 'MATCHMAKER_BEETLE', 'DOPPELGANGER', 'ORACLE', 'JUDGE', 'MERCENARY', 'CULTIST', 'WILDCARD']);
    for (let i = 0; i < neutralCount; i++) {
        const randomNeutral = neutralRoles[Math.floor(Math.random() * neutralRoles.length)];
        distribution.push(randomNeutral);
    }

    // === BEE ROLES ===
    const beeRoles = [];

    if (randomMode) {
        // RANDOM MODE: All bee roles are completely random (no guarantees), filtered by tier
        const allBeeRoles = filterByTier(['SCOUT_BEE', 'NURSE_BEE', 'QUEENS_GUARD', 'GUARD_BEE', 'LOOKOUT_BEE', 'SOLDIER_BEE', 'QUEEN_BEE', 'JAILER_BEE', 'ESCORT_BEE', 'MEDIUM_BEE', 'VETERAN_BEE', 'WORKER_BEE', 'TRACKER_BEE', 'POLLINATOR_BEE', 'SPY_BEE', 'TRAPPER_BEE', 'RETRIBUTIONIST_BEE', 'BEEKEEPER', 'LIBRARIAN_BEE', 'TRANSPORTER_BEE', 'PSYCHIC_BEE', 'MARSHAL_BEE', 'MUTE_BEE', 'DEAF_BEE']);

        // Fill all bee slots with random roles
        for (let i = 0; i < beeCount; i++) {
            const randomRole = allBeeRoles[Math.floor(Math.random() * allBeeRoles.length)];
            beeRoles.push(randomRole);
        }
    } else {
        // STANDARD MODE: Guaranteed core roles
        if (beeCount >= 1) beeRoles.push('GUARD_BEE'); // Always have protector
        if (beeCount >= 2) beeRoles.push('NURSE_BEE'); // Always have healer

        // Scout Bee only appears with 10+ players
        if (beeCount >= 3 && playerCount >= 10) {
            beeRoles.push('SCOUT_BEE');
        }

        // Optional power roles (filtered by tier)
        const optionalBeeRoles = filterByTier(['QUEENS_GUARD', 'LOOKOUT_BEE', 'SOLDIER_BEE', 'QUEEN_BEE', 'JAILER_BEE', 'ESCORT_BEE', 'MEDIUM_BEE', 'VETERAN_BEE', 'TRACKER_BEE', 'POLLINATOR_BEE', 'SPY_BEE', 'TRAPPER_BEE', 'RETRIBUTIONIST_BEE', 'BEEKEEPER', 'LIBRARIAN_BEE', 'TRANSPORTER_BEE', 'PSYCHIC_BEE', 'MARSHAL_BEE']);

        // Add random power roles
        while (beeRoles.length < Math.min(beeCount, Math.floor(beeCount * 0.6))) {
            const randomRole = optionalBeeRoles[Math.floor(Math.random() * optionalBeeRoles.length)];
            beeRoles.push(randomRole);
        }

        // Fill remaining with Worker Bees
        while (beeRoles.length < beeCount) {
            beeRoles.push('WORKER_BEE');
        }
    }

    distribution.push(...beeRoles);

    return distribution;
}

/**
 * Shuffle an array
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array
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
 * Get team counts
 * @param {Object} game - Game object
 * @returns {Object} Team counts
 */
function getTeamCounts(game) {
    const alive = game.players.filter(p => p.alive);
    const wasps = alive.filter(p => getPlayerTeam(p) === 'wasp').length;
    const bees = alive.filter(p => getPlayerTeam(p) === 'bee').length;
    const neutralKilling = alive.filter(p => getPlayerTeam(p) === 'neutral' && ROLES[p.role].subteam === 'killing').length;
    const neutralEvil = alive.filter(p => getPlayerTeam(p) === 'neutral' && ROLES[p.role].subteam === 'evil').length;
    const neutralBenign = alive.filter(p => getPlayerTeam(p) === 'neutral' && ROLES[p.role].subteam === 'benign').length;

    return {
        wasps,
        bees,
        neutralKilling,
        neutralEvil,
        neutralBenign,
        total: alive.length
    };
}

/**
 * Count votes
 * @param {Object} votes - Votes object
 * @returns {Object} Vote counts
 */
function countVotes(votes) {
    const voteCounts = {};
    Object.values(votes).forEach(targetId => {
        if (targetId !== 'skip') {
            voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
        }
    });
    return voteCounts;
}

/**
 * Determine winners based on win type
 * @param {Object} game - Game object
 * @param {string} winnerType - Type of win
 * @param {Object} specificWinner - Specific winner for neutral wins
 * @returns {Array} Array of winning players
 */
function determineWinners(game, winnerType, specificWinner = null) {
    const winners = [];

    game.players.forEach(player => {
        const role = ROLES[player.role];
        const team = getPlayerTeam(player);

        if (winnerType === 'bees' && team === 'bee') {
            winners.push(player);
        } else if (winnerType === 'wasps' && team === 'wasp') {
            winners.push(player);
        } else if (winnerType === 'cult' && (player.role === 'CULTIST' || player.convertedToCult)) {
            winners.push(player);
        } else if (winnerType === 'neutral_killer' && player.id === specificWinner?.id) {
            winners.push(player);
        } else if (winnerType === 'jester' && player.id === specificWinner?.id) {
            winners.push(player);
        } else if (winnerType === 'executioner' && player.id === specificWinner?.id) {
            winners.push(player);
        }

        // Survivors win with anyone (if alive)
        if (player.alive && (player.role === 'BUTTERFLY' || player.role === 'MUTE_BUTTERFLY')) {
            if (!winners.includes(player)) {
                winners.push(player);
            }
        }

        // Gossip Beetle wins with anyone (if alive)
        if (player.alive && player.role === 'GOSSIP_BEETLE') {
            if (!winners.includes(player)) {
                winners.push(player);
            }
        }

        // Oracle wins with anyone (if alive)
        if (player.alive && player.role === 'ORACLE') {
            if (!winners.includes(player)) {
                winners.push(player);
            }
        }

        // Wildcard wins with anyone (if alive)
        if (player.alive && player.role === 'WILDCARD') {
            if (!winners.includes(player)) {
                winners.push(player);
            }
        }

        // Judge wins if alive, used ability, and changed outcome
        if (player.alive && player.role === 'JUDGE' && player.hasUsedRevote && player.changedOutcome) {
            if (!winners.includes(player)) {
                winners.push(player);
            }
        }

        // Phantom Moth wins if alive and has been lynched before
        if (player.alive && player.role === 'PHANTOM_MOTH' && player.hasBeenLynched) {
            if (!winners.includes(player)) {
                winners.push(player);
            }
        }

        // Guardian Ant wins if alive and their target wins
        if (player.alive && player.role === 'GUARDIAN_ANT' && player.guardianTarget) {
            const target = game.players.find(p => p.id === player.guardianTarget);
            if (target && winners.includes(target)) {
                if (!winners.includes(player)) {
                    winners.push(player);
                }
            }
        }

        // Matchmaker Beetle wins if alive and their linked partner wins
        if (player.alive && player.role === 'MATCHMAKER_BEETLE' && player.linkedPartner) {
            const partner = game.players.find(p => p.id === player.linkedPartner);
            if (partner && winners.includes(partner)) {
                if (!winners.includes(player)) {
                    winners.push(player);
                }
            }
        }

        // Spider wins if they're alive and sees bees or wasps lose
        if (player.alive && player.role === 'SPIDER') {
            if (winnerType === 'neutral_killer' || (winnerType === 'wasps' && team !== 'bee') || (winnerType === 'bees' && team !== 'wasp')) {
                if (!winners.includes(player)) {
                    winners.push(player);
                }
            }
        }
    });

    return winners;
}

/**
 * Check win conditions
 * @param {Object} game - Game object
 * @returns {Object|null} Win info or null
 */
function checkWinConditions(game) {
    const { wasps, bees, neutralKilling, neutralEvil, total } = getTeamCounts(game);

    // Check for Cult win (all alive players are cult members)
    const alivePlayers = game.players.filter(p => p.alive);
    const cultMembers = alivePlayers.filter(p => p.role === 'CULTIST' || p.convertedToCult);
    if (cultMembers.length > 0 && cultMembers.length === alivePlayers.length) {
        const cultLeader = game.players.find(p => p.role === 'CULTIST') || cultMembers[0];
        return { type: 'cult', winner: cultLeader };
    }

    // Check for Neutral Killer solo win (only they remain)
    if (total === 1 && neutralKilling === 1) {
        const winner = game.players.find(p => p.alive && ROLES[p.role].subteam === 'killing');
        return { type: 'neutral_killer', winner };
    }

    // Check for Wasp win (equal or outnumber all others)
    if (wasps > 0 && wasps >= (bees + neutralKilling + neutralEvil)) {
        return { type: 'wasps' };
    }

    // Check for Bee win (all Wasps and harmful Neutrals dead)
    if (wasps === 0 && neutralKilling === 0) {
        return { type: 'bees' };
    }

    return null;
}

/**
 * Initialize player role-specific data
 * @param {Object} player - Player object
 * @param {string} roleKey - Role key
 */
function initializePlayerRole(player, roleKey) {
    player.role = roleKey;
    const roleInfo = ROLES[roleKey];

    // Initialize role-specific data
    if (roleInfo.bullets !== undefined) {
        player.bullets = roleInfo.bullets;
    }
    if (roleInfo.vests !== undefined) {
        player.vests = roleInfo.vests;
    }
    if (roleInfo.selfHealsLeft !== undefined) {
        player.selfHealsLeft = roleInfo.selfHealsLeft;
    }
    if (roleInfo.executions !== undefined) {
        player.executions = roleInfo.executions;
    }
    if (roleInfo.alerts !== undefined) {
        player.alerts = roleInfo.alerts;
    }
    if (roleInfo.cleans !== undefined) {
        player.cleans = roleInfo.cleans;
    }
    if (roleInfo.disguises !== undefined) {
        player.disguises = roleInfo.disguises;
    }
    if (roleInfo.hasRemembered !== undefined) {
        player.hasRemembered = roleInfo.hasRemembered;
    }
    if (roleInfo.mimics !== undefined) {
        player.mimics = roleInfo.mimics;
    }
    if (roleInfo.conversions !== undefined) {
        player.conversions = roleInfo.conversions;
    }
    if (roleInfo.luckyCoins !== undefined) {
        player.luckyCoins = roleInfo.luckyCoins;
    }

    // Special role initialization
    if (roleKey === 'MERCENARY') {
        // Mercenary randomly joins Bee or Wasp team
        player.mercenaryTeam = Math.random() < 0.5 ? 'bee' : 'wasp';
    }
}

module.exports = {
    getPlayerTeam,
    getRoleDistribution,
    shuffleArray,
    getTeamCounts,
    countVotes,
    determineWinners,
    checkWinConditions,
    initializePlayerRole,
    isMutePlayer
};
