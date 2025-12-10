// ===============================================
// TIER COMMAND CONFIGURATION
// ===============================================
// Central configuration for tier-based command access control
// This file defines which commands are available at each subscription tier

const TIERS = {
    FREE: 'free',
    PLUS: 'plus',
    ULTIMATE: 'ultimate'
};

// ===============================================
// GAMBLING COMMANDS TIER CONFIGURATION
// ===============================================

const GAMBLING_COMMANDS = {
    // FREE TIER - Basic House Games (Solo Play)
    FREE: {
        tier: TIERS.FREE,
        displayName: '🏠 Free House Games',
        description: 'Basic solo games against the house',
        commands: {
            flip: {
                syntax: '!flip [amount]',
                description: 'Coin flip - 2x payout',
                payout: '2x',
                emoji: '🪙'
            },
            roulette: {
                syntax: '!roulette [amount] [red/black/number]',
                description: 'Roulette wheel - Color (2x) or Number (36x)',
                payout: '2x-36x',
                emoji: '🎡'
            },
            dice: {
                syntax: '!dice [amount] [guess (1-6)]',
                description: 'Dice roll - Guess the number',
                payout: '6x',
                emoji: '🎲'
            }
        }
    },

    // PLUS TIER - All Premium Games
    PLUS: {
        tier: TIERS.PLUS,
        displayName: '⭐ PLUS Tier Games',
        description: 'Premium games for PLUS subscribers',
        commands: {
            blackjack: {
                syntax: '!blackjack [amount]',
                description: 'Classic Blackjack vs dealer',
                payout: '2x on win, 2.5x on blackjack',
                emoji: '🃏',
                aliases: ['!bj']
            },
            rps: {
                syntax: '!rps [amount]',
                description: 'Rock Paper Scissors duel',
                payout: 'Winner takes all',
                emoji: '✊'
            },
            highercard: {
                syntax: '!highercard [amount]',
                description: 'Higher card wins',
                payout: 'Winner takes all',
                emoji: '🎴'
            },
            quickdraw: {
                syntax: '!quickdraw [amount]',
                description: 'Type random word fastest',
                payout: 'Winner takes all',
                emoji: '⚡'
            },
            numberduel: {
                syntax: '!numberduel [amount]',
                description: 'Closest number guess wins',
                payout: 'Winner takes all',
                emoji: '🔢'
            },
            russianroulette: {
                syntax: '!russianroulette',
                description: 'Multiplayer Russian Roulette - All money at stake',
                payout: 'Winner takes all pots',
                emoji: '🔫',
                aliases: ['!rr']
            },
            gladiator: {
                syntax: '!gladiator @user [amount] [class] [duration]',
                description: 'Epic turn-based arena combat with 6 classes',
                payout: 'Winner takes all (minus 5% house)',
                emoji: '⚔️',
                aliases: ['!arena']
            }
        }
    }
};

// Daily Challenge Games (Available to all tiers, but tracked separately)
const DAILY_CHALLENGES = {
    wordle: {
        syntax: '!wordle',
        description: 'Daily Wordle puzzle with Honey rewards',
        rewards: '10k-0 based on tries',
        emoji: '📝'
    },
    trivia: {
        syntax: '!trivia',
        description: 'Daily trivia questions',
        rewards: 'Honey for correct answers',
        emoji: '🧠'
    }
};

// ===============================================
// HELPER FUNCTIONS
// ===============================================

/**
 * Get all gambling commands available for a specific tier
 * Includes commands from the specified tier and all lower tiers
 * @param {string} userTier - The user's subscription tier
 * @returns {Object} - Object containing all available command categories
 */
function getAvailableGamblingCommands(userTier = TIERS.FREE) {
    const available = {};

    // Normalize tier
    const normalizedTier = userTier.toLowerCase();

    // Determine tier level
    const tierLevel = {
        [TIERS.FREE]: 0,
        [TIERS.PLUS]: 1,
        'basic': 1,  // Legacy mapping
        [TIERS.ULTIMATE]: 2,
        'premium': 2,  // Legacy mapping
        'enterprise': 2  // Legacy mapping
    }[normalizedTier] || 0;

    // Add FREE tier commands (always available)
    if (tierLevel >= 0) {
        available.FREE = GAMBLING_COMMANDS.FREE;
    }

    // Add PLUS tier commands if user has access
    if (tierLevel >= 1) {
        available.PLUS = GAMBLING_COMMANDS.PLUS;
    }

    // Add ULTIMATE tier commands if user has access
    if (tierLevel >= 2) {
        available.ULTIMATE = GAMBLING_COMMANDS.ULTIMATE;
    }

    return available;
}

/**
 * Check if a specific command is available for a tier
 * @param {string} commandName - The command name (without !)
 * @param {string} userTier - The user's subscription tier
 * @returns {boolean} - True if command is available
 */
function isCommandAvailable(commandName, userTier = TIERS.FREE) {
    const available = getAvailableGamblingCommands(userTier);

    // Check each tier's commands
    for (const tierCategory of Object.values(available)) {
        if (tierCategory.commands[commandName]) {
            return true;
        }
    }

    return false;
}

/**
 * Get the required tier for a specific command
 * @param {string} commandName - The command name (without !)
 * @returns {string|null} - Required tier or null if command doesn't exist
 */
function getRequiredTier(commandName) {
    for (const [tierKey, tierData] of Object.entries(GAMBLING_COMMANDS)) {
        if (tierData.commands[commandName]) {
            return tierData.tier;
        }
    }
    return null;
}

/**
 * Format gambling commands for display in !gamble embed
 * @param {string} userTier - The user's subscription tier
 * @returns {Array} - Array of embed fields for Discord
 */
function formatGamblingCommandsForEmbed(userTier = TIERS.FREE) {
    const available = getAvailableGamblingCommands(userTier);
    const fields = [];

    // Add each tier category
    for (const [tierKey, tierData] of Object.entries(available)) {
        const commandList = Object.values(tierData.commands)
            .map(cmd => `${cmd.emoji} ${cmd.syntax} - ${cmd.description}`)
            .join('\n');

        fields.push({
            name: `${tierData.displayName} (${tierData.description})`,
            value: commandList || 'No commands available',
            inline: false
        });
    }

    // Add locked tiers with upgrade prompt
    const normalizedTier = userTier.toLowerCase();
    const tierLevel = {
        [TIERS.FREE]: 0,
        [TIERS.PLUS]: 1,
        'basic': 1,
        [TIERS.ULTIMATE]: 1,  // Map ULTIMATE to PLUS level since we don't have separate ULTIMATE games
        'premium': 1,
        'enterprise': 1
    }[normalizedTier] || 0;

    // Show PLUS tier as locked if user is FREE
    if (tierLevel < 1) {
        const plusCommands = Object.values(GAMBLING_COMMANDS.PLUS.commands)
            .map(cmd => `🔒 ${cmd.syntax}`)
            .join('\n');

        fields.push({
            name: '⭐ PLUS Tier Games (Subscription Required) 🔒',
            value: `${plusCommands}\n\n**Unlock with PLUS subscription to access all premium games!**`,
            inline: false
        });
    }

    return fields;
}

/**
 * Get all command names (for command routing)
 * @returns {Array<string>} - Array of all gambling command names
 */
function getAllGamblingCommandNames() {
    const commands = [];

    for (const tierData of Object.values(GAMBLING_COMMANDS)) {
        commands.push(...Object.keys(tierData.commands));
    }

    return commands;
}

// ===============================================
// EXPORTS
// ===============================================

module.exports = {
    TIERS,
    GAMBLING_COMMANDS,
    DAILY_CHALLENGES,
    getAvailableGamblingCommands,
    isCommandAvailable,
    getRequiredTier,
    formatGamblingCommandsForEmbed,
    getAllGamblingCommandNames
};
