/**
 * Mafia Game Presets
 * Define preset role distributions for different game modes
 */

const { ROLES } = require('../roles/mafiaRoles');

/**
 * Get role distribution for a preset based on player count
 * @param {string} presetName - Name of the preset
 * @param {number} playerCount - Number of players
 * @returns {Array} Array of role keys
 */
function getPresetDistribution(presetName, playerCount) {
    const preset = PRESETS[presetName.toLowerCase()];
    if (!preset) {
        return null;
    }

    return preset.getRoles(playerCount);
}

/**
 * Get all available preset names
 * @returns {Array} Array of preset names
 */
function getAvailablePresets() {
    return Object.keys(PRESETS);
}

/**
 * Get preset description
 * @param {string} presetName - Name of the preset
 * @returns {string} Preset description
 */
function getPresetDescription(presetName) {
    const preset = PRESETS[presetName.toLowerCase()];
    return preset ? preset.description : null;
}

// Helper function to get random roles from a pool
function getRandomRoles(rolePool, count) {
    const shuffled = [...rolePool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

// Helper function to get balanced random roles (maintains team balance)
function getBalancedRandomRoles(count, waspCount, neutralCount) {
    const beeRoles = Object.keys(ROLES).filter(key => ROLES[key].team === 'bee');
    const waspRoles = Object.keys(ROLES).filter(key => ROLES[key].team === 'wasp' && key !== 'WASP_QUEEN');
    const neutralRoles = Object.keys(ROLES).filter(key => ROLES[key].team === 'neutral');

    const roles = [];

    // Add wasps
    roles.push(...getRandomRoles(waspRoles, waspCount));

    // Add neutrals
    roles.push(...getRandomRoles(neutralRoles, neutralCount));

    // Fill rest with bees
    const beesNeeded = count - waspCount - neutralCount;
    roles.push(...getRandomRoles(beeRoles, beesNeeded));

    return roles;
}

// Define presets
const PRESETS = {
    basic: {
        name: 'Basic',
        description: 'Classic balanced game with standard roles',
        getRoles: (playerCount) => {
            const roles = [];

            // Base 6 players
            roles.push('WASP_QUEEN');
            roles.push('QUEENS_GUARD');
            roles.push('NURSE_BEE');
            roles.push('LOOKOUT_BEE');
            roles.push('WORKER_BEE');
            roles.push('BUTTERFLY');

            if (playerCount >= 7) roles.push('MEDIUM_BEE');
            if (playerCount >= 8) roles.push('KILLER_WASP');
            if (playerCount >= 9) roles.push('RETRIBUTIONIST_BEE');

            if (playerCount >= 10) {
                // Random special bee role
                const specialBeeRoles = ['SCOUT_BEE', 'JAILER_BEE', 'TRACKER_BEE', 'SPY_BEE', 'VETERAN_BEE', 'PSYCHIC_BEE'];
                roles.push(...getRandomRoles(specialBeeRoles, 1));
            }

            if (playerCount >= 11) {
                // Random neutral role
                const neutralRoles = ['CLOWN_BEETLE', 'BOUNTY_HUNTER', 'PIRATE_BEETLE', 'GUARDIAN_ANT'];
                roles.push(...getRandomRoles(neutralRoles, 1));
            }

            if (playerCount >= 12) {
                // Random special wasp role
                const specialWaspRoles = ['SPY_WASP', 'CONSORT_WASP', 'JANITOR_WASP', 'BLACKMAILER_WASP'];
                roles.push(...getRandomRoles(specialWaspRoles, 1));
            }

            // 13+ fill with balanced random roles
            if (playerCount >= 13) {
                const remaining = playerCount - roles.length;
                const waspCount = Math.floor(remaining * 0.25); // 25% wasps
                const neutralCount = Math.floor(remaining * 0.15); // 15% neutrals
                roles.push(...getBalancedRandomRoles(remaining, waspCount, neutralCount));
            }

            return roles;
        }
    },

    mute: {
        name: 'Mute',
        description: 'Everyone is permanently muted! Communicate only with emojis',
        getRoles: (playerCount) => {
            const roles = [];

            // Base roles - all mute variants
            roles.push('WASP_QUEEN'); // No mute variant, keep normal
            roles.push('MUTE_SCOUT_BEE');
            roles.push('MUTE_BEE');
            roles.push('MUTE_BEE');
            roles.push('NURSE_BEE'); // Keep some non-mute for balance
            roles.push('MUTE_BUTTERFLY');

            if (playerCount >= 7) roles.push('MUTE_SOLDIER_BEE');
            if (playerCount >= 8) roles.push('MUTE_WASP');
            if (playerCount >= 9) roles.push('MUTE_JAILER_BEE');
            if (playerCount >= 10) roles.push('LOOKOUT_BEE');
            if (playerCount >= 11) roles.push('MUTE_MURDER_HORNET');
            if (playerCount >= 12) roles.push('MUTE_SPY_WASP');

            if (playerCount >= 13) {
                const remaining = playerCount - roles.length;
                const muteRoles = ['MUTE_BEE', 'MUTE_SCOUT_BEE', 'MUTE_SOLDIER_BEE', 'MUTE_JAILER_BEE', 'MUTE_WASP', 'MUTE_SPY_WASP'];
                roles.push(...getRandomRoles(muteRoles, remaining));
            }

            return roles;
        }
    },

    chaos: {
        name: 'Chaos',
        description: 'Maximum chaos with unpredictable neutral roles',
        getRoles: (playerCount) => {
            const roles = [];

            // Start with minimum wasps and bees
            roles.push('WASP_QUEEN');
            roles.push('KILLER_WASP');
            roles.push('QUEENS_GUARD');
            roles.push('NURSE_BEE');

            // Fill most with chaos neutrals
            const chaosRoles = ['PIRATE_BEETLE', 'WILDCARD', 'GAMBLER_BEETLE', 'JUDGE', 'CLOWN_BEETLE',
                                'PHANTOM_MOTH', 'GOSSIP_BEETLE', 'MATCHMAKER_BEETLE', 'DOPPELGANGER'];

            const neutralCount = Math.min(chaosRoles.length, playerCount - 4);
            roles.push(...getRandomRoles(chaosRoles, neutralCount));

            // Fill remaining with bees
            const remaining = playerCount - roles.length;
            if (remaining > 0) {
                const beeRoles = ['WORKER_BEE', 'SCOUT_BEE', 'LOOKOUT_BEE', 'TRACKER_BEE'];
                roles.push(...getRandomRoles(beeRoles, remaining));
            }

            return roles;
        }
    },

    investigative: {
        name: 'Investigative',
        description: 'Information warfare - lots of investigative roles',
        getRoles: (playerCount) => {
            const roles = [];

            // Core roles
            roles.push('WASP_QUEEN');
            roles.push('SCOUT_BEE');
            roles.push('QUEENS_GUARD');
            roles.push('LOOKOUT_BEE');
            roles.push('TRACKER_BEE');
            roles.push('SPY_BEE');

            if (playerCount >= 7) roles.push('SPY_WASP');
            if (playerCount >= 8) roles.push('KILLER_WASP');
            if (playerCount >= 9) roles.push('PSYCHIC_BEE');
            if (playerCount >= 10) roles.push('POLLINATOR_BEE');
            if (playerCount >= 11) roles.push('LIBRARIAN_BEE');
            if (playerCount >= 12) roles.push('ORACLE');

            if (playerCount >= 13) {
                const remaining = playerCount - roles.length;
                const waspCount = Math.floor(remaining * 0.3);
                const neutralCount = Math.floor(remaining * 0.1);
                roles.push(...getBalancedRandomRoles(remaining, waspCount, neutralCount));
            }

            return roles;
        }
    },

    killing: {
        name: 'Killing',
        description: 'Blood bath mode - lots of killing roles',
        getRoles: (playerCount) => {
            const roles = [];

            // Core killing roles
            roles.push('WASP_QUEEN');
            roles.push('KILLER_WASP');
            roles.push('SOLDIER_BEE');
            roles.push('VETERAN_BEE');
            roles.push('MURDER_HORNET');
            roles.push('JAILER_BEE');

            if (playerCount >= 7) roles.push('GUARD_BEE');
            if (playerCount >= 8) roles.push('POISONER_WASP');
            if (playerCount >= 9) roles.push('FIRE_ANT');
            if (playerCount >= 10) roles.push('SOLDIER_BEE');
            if (playerCount >= 11) roles.push('CONSORT_WASP');
            if (playerCount >= 12) roles.push('NURSE_BEE'); // Need some healing

            if (playerCount >= 13) {
                const remaining = playerCount - roles.length;
                const killingRoles = ['SOLDIER_BEE', 'VETERAN_BEE', 'JAILER_BEE', 'KILLER_WASP', 'POISONER_WASP'];
                roles.push(...getRandomRoles(killingRoles, remaining));
            }

            return roles;
        }
    },

    protective: {
        name: 'Protective',
        description: 'High defense - lots of protective and healing roles',
        getRoles: (playerCount) => {
            const roles = [];

            // Core protective roles
            roles.push('WASP_QUEEN');
            roles.push('NURSE_BEE');
            roles.push('GUARD_BEE');
            roles.push('JAILER_BEE');
            roles.push('BUTTERFLY');
            roles.push('TRAPPER_BEE');

            if (playerCount >= 7) roles.push('KILLER_WASP');
            if (playerCount >= 8) roles.push('TRANSPORTER_BEE');
            if (playerCount >= 9) roles.push('GUARDIAN_ANT');
            if (playerCount >= 10) roles.push('MERCENARY');
            if (playerCount >= 11) roles.push('SCOUT_BEE');
            if (playerCount >= 12) roles.push('CONSORT_WASP');

            if (playerCount >= 13) {
                const remaining = playerCount - roles.length;
                const protectiveRoles = ['NURSE_BEE', 'GUARD_BEE', 'BUTTERFLY', 'TRAPPER_BEE', 'TRANSPORTER_BEE'];
                roles.push(...getRandomRoles(protectiveRoles, remaining));
            }

            return roles;
        }
    },

    deception: {
        name: 'Deception',
        description: 'Lies and manipulation - roles that deceive and confuse',
        getRoles: (playerCount) => {
            const roles = [];

            // Core deception roles
            roles.push('WASP_QUEEN'); // Immune to detection
            roles.push('DECEIVER_WASP');
            roles.push('BLACKMAILER_WASP');
            roles.push('HYPNOTIST_WASP');
            roles.push('CLOWN_BEETLE');
            roles.push('BOUNTY_HUNTER');

            if (playerCount >= 7) roles.push('DISGUISER_WASP');
            if (playerCount >= 8) roles.push('MIMIC_WASP');
            if (playerCount >= 9) roles.push('JANITOR_WASP');
            if (playerCount >= 10) roles.push('SPIDER');
            if (playerCount >= 11) roles.push('DOPPELGANGER');
            if (playerCount >= 12) roles.push('AMNESIAC_BEETLE');

            if (playerCount >= 13) {
                const remaining = playerCount - roles.length;
                const deceptionRoles = ['DECEIVER_WASP', 'BLACKMAILER_WASP', 'HYPNOTIST_WASP', 'DISGUISER_WASP', 'MIMIC_WASP'];
                const beeRoles = ['SCOUT_BEE', 'LOOKOUT_BEE', 'TRACKER_BEE', 'SPY_BEE']; // Add some investigators to counter
                roles.push(...getRandomRoles([...deceptionRoles, ...beeRoles], remaining));
            }

            return roles;
        }
    },

    powerroles: {
        name: 'Power Roles',
        description: 'Everyone has powerful unique abilities',
        getRoles: (playerCount) => {
            const roles = [];

            // No worker bees - everyone is special
            roles.push('WASP_QUEEN');
            roles.push('JAILER_BEE');
            roles.push('VETERAN_BEE');
            roles.push('RETRIBUTIONIST_BEE');
            roles.push('MURDER_HORNET');
            roles.push('QUEEN_BEE');

            if (playerCount >= 7) roles.push('SPY_BEE');
            if (playerCount >= 8) roles.push('TRANSPORTER_BEE');
            if (playerCount >= 9) roles.push('BLACKMAILER_WASP');
            if (playerCount >= 10) roles.push('FIRE_ANT');
            if (playerCount >= 11) roles.push('CULTIST');
            if (playerCount >= 12) roles.push('YAKUZA_WASP');

            if (playerCount >= 13) {
                const remaining = playerCount - roles.length;
                const powerRoles = ['JAILER_BEE', 'VETERAN_BEE', 'SPY_BEE', 'TRANSPORTER_BEE', 'RETRIBUTIONIST_BEE',
                                   'BLACKMAILER_WASP', 'DECEIVER_WASP', 'KIDNAPPER_WASP', 'CULTIST', 'PIRATE_BEETLE'];
                roles.push(...getRandomRoles(powerRoles, remaining));
            }

            return roles;
        }
    },

    mafiavstowns: {
        name: 'Mafia vs Towns',
        description: 'Classic mafia setup - minimal neutrals, focus on team vs team',
        getRoles: (playerCount) => {
            const roles = [];

            // Mafia team (approximately 25-30% of players)
            const waspCount = Math.max(2, Math.floor(playerCount * 0.27));

            roles.push('WASP_QUEEN');
            for (let i = 1; i < waspCount; i++) {
                const waspRoles = ['KILLER_WASP', 'SPY_WASP', 'CONSORT_WASP', 'JANITOR_WASP', 'BLACKMAILER_WASP', 'DECEIVER_WASP'];
                roles.push(...getRandomRoles(waspRoles, 1));
            }

            // Maybe 1 neutral
            if (playerCount >= 10 && Math.random() > 0.5) {
                const neutrals = ['CLOWN_BEETLE', 'BOUNTY_HUNTER', 'BUTTERFLY'];
                roles.push(...getRandomRoles(neutrals, 1));
            }

            // Fill rest with town
            const remaining = playerCount - roles.length;
            const townRoles = ['QUEENS_GUARD', 'SCOUT_BEE', 'NURSE_BEE', 'GUARD_BEE', 'LOOKOUT_BEE',
                              'SOLDIER_BEE', 'JAILER_BEE', 'ESCORT_BEE', 'MEDIUM_BEE', 'VETERAN_BEE',
                              'TRACKER_BEE', 'SPY_BEE', 'RETRIBUTIONIST_BEE', 'WORKER_BEE'];
            roles.push(...getRandomRoles(townRoles, remaining));

            return roles;
        }
    }
};

module.exports = {
    getPresetDistribution,
    getAvailablePresets,
    getPresetDescription,
    PRESETS
};
