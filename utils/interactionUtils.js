// ===============================================
// DISCORD INTERACTION UTILITIES
// ===============================================
// Provides safe interaction handling to prevent Discord API errors
// and gracefully handle expired or invalid interactions

/**
 * Safely responds to a Discord interaction with automatic fallback handling
 * @param {Interaction} interaction - The Discord interaction to respond to
 * @param {string} responseType - Type of response: 'reply', 'update', 'defer', 'deferReply', 'deferUpdate', 'followUp', 'editReply'
 * @param {Object} responseData - The data to send (optional for defer types)
 * @returns {Promise<boolean>} - True if successful, false if failed
 */
async function safeInteractionResponse(interaction, responseType, responseData = {}) {
    try {
        // Check if interaction is still valid (not expired)
        if (!interaction.isRepliable()) {
            console.log('[Interaction Utils] Interaction is no longer repliable');
            return false;
        }

        // Handle different response types
        switch (responseType) {
            case 'reply':
                // Reply to the interaction (or followUp if already replied/deferred)
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(responseData);
                } else {
                    await interaction.reply(responseData);
                }
                break;

            case 'update':
                // Update the message (or editReply if already replied)
                if (interaction.replied) {
                    await interaction.editReply(responseData);
                } else if (interaction.deferred) {
                    await interaction.editReply(responseData);
                } else {
                    await interaction.update(responseData);
                }
                break;

            case 'defer':
            case 'deferUpdate':
                // Defer with update (no loading message)
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferUpdate(responseData);
                }
                break;

            case 'deferReply':
                // Defer with reply (shows loading message)
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferReply(responseData);
                }
                break;

            case 'followUp':
                // Always send a follow-up message
                await interaction.followUp(responseData);
                break;

            case 'editReply':
                // Edit the reply (must be already replied or deferred)
                if (interaction.replied || interaction.deferred) {
                    await interaction.editReply(responseData);
                } else {
                    console.warn('[Interaction Utils] Cannot editReply on non-replied interaction, falling back to reply');
                    await interaction.reply(responseData);
                }
                break;

            default:
                console.error(`[Interaction Utils] Unknown response type: ${responseType}`);
                return false;
        }

        return true;
    } catch (error) {
        console.error('[Interaction Utils] Error in safe interaction response:', error.message);

        // Try fallback response if possible
        try {
            if (!interaction.replied && !interaction.deferred) {
                // Try to send an error message to the user
                if (responseType === 'reply' || responseType === 'deferReply') {
                    await interaction.reply({
                        content: '❌ There was an error processing your request. Please try again.',
                        ephemeral: true
                    });
                } else if (responseType === 'update' || responseType === 'defer' || responseType === 'deferUpdate') {
                    await interaction.update({
                        content: '❌ There was an error processing your request. Please try again.',
                        components: []
                    });
                }
            } else if (interaction.deferred) {
                // If deferred, we can edit the reply
                await interaction.editReply({
                    content: '❌ There was an error processing your request. Please try again.',
                    components: []
                });
            }
        } catch (fallbackError) {
            console.error('[Interaction Utils] Fallback response also failed:', fallbackError.message);
        }

        return false;
    }
}

/**
 * Checks if an interaction is still valid and can be responded to
 * @param {Interaction} interaction - The Discord interaction to check
 * @returns {boolean} - True if valid, false otherwise
 */
function isInteractionValid(interaction) {
    if (!interaction) {
        return false;
    }

    // Check if repliable
    if (typeof interaction.isRepliable === 'function' && !interaction.isRepliable()) {
        return false;
    }

    return true;
}

/**
 * Safely defers an interaction with automatic type detection
 * @param {Interaction} interaction - The Discord interaction to defer
 * @param {Object} options - Defer options (ephemeral, fetchReply, etc.)
 * @returns {Promise<boolean>} - True if successful, false if failed
 */
async function safeDeferInteraction(interaction, options = {}) {
    try {
        if (!isInteractionValid(interaction)) {
            return false;
        }

        if (interaction.deferred || interaction.replied) {
            console.log('[Interaction Utils] Interaction already deferred or replied');
            return true; // Not an error, just already handled
        }

        // Choose defer method based on interaction type
        if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isAnySelectMenu()) {
            // For components, use deferUpdate to avoid showing loading message
            await interaction.deferUpdate(options);
        } else {
            // For commands and modals, use deferReply
            await interaction.deferReply(options);
        }

        return true;
    } catch (error) {
        console.error('[Interaction Utils] Error deferring interaction:', error.message);
        return false;
    }
}

/**
 * Safely sends an error message to the user
 * @param {Interaction} interaction - The Discord interaction
 * @param {string} errorMessage - The error message to display
 * @param {boolean} ephemeral - Whether the message should be ephemeral (default: true)
 * @returns {Promise<boolean>} - True if successful, false if failed
 */
async function sendErrorResponse(interaction, errorMessage, ephemeral = true) {
    const errorData = {
        content: `❌ ${errorMessage}`,
        ephemeral: ephemeral,
        components: [] // Clear any components
    };

    return await safeInteractionResponse(interaction, 'reply', errorData);
}

/**
 * Safely sends a success message to the user
 * @param {Interaction} interaction - The Discord interaction
 * @param {string} successMessage - The success message to display
 * @param {boolean} ephemeral - Whether the message should be ephemeral (default: false)
 * @returns {Promise<boolean>} - True if successful, false if failed
 */
async function sendSuccessResponse(interaction, successMessage, ephemeral = false) {
    const successData = {
        content: `✅ ${successMessage}`,
        ephemeral: ephemeral
    };

    return await safeInteractionResponse(interaction, 'reply', successData);
}

module.exports = {
    safeInteractionResponse,
    isInteractionValid,
    safeDeferInteraction,
    sendErrorResponse,
    sendSuccessResponse
};
