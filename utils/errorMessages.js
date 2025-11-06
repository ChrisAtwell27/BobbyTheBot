// ===============================================
// STANDARDIZED ERROR & FEEDBACK MESSAGES
// ===============================================
// Consistent user-facing messages with emojis and next-step guidance

/**
 * Generate insufficient funds error message with helpful next steps
 * @param {string} username - User's display name
 * @param {number} currentBalance - User's current balance
 * @param {number} required - Amount required
 * @returns {string} - Formatted error message
 */
function insufficientFundsMessage(username, currentBalance, required) {
    const shortage = required - currentBalance;
    return `❌ **Insufficient Funds**\n\n` +
           `Sorry ${username}, you don't have enough Honey.\n\n` +
           `**Your Balance:** 🍯${currentBalance.toLocaleString()}\n` +
           `**Required:** 🍯${required.toLocaleString()}\n` +
           `**Short By:** 🍯${shortage.toLocaleString()}\n\n` +
           `💡 **Earn More:**\n` +
           `• \`!beg\` - Daily free honey\n` +
           `• \`!work\` - Work for honey\n` +
           `• \`!gamble\` - Try your luck with smaller bets`;
}

/**
 * Generate invalid usage error message
 * @param {string} command - Command name (e.g., "rps", "blackjack")
 * @param {string} syntax - Correct syntax
 * @param {string} example - Example usage (optional)
 * @returns {string} - Formatted error message
 */
function invalidUsageMessage(command, syntax, example = null) {
    let message = `❌ **Invalid Command Usage**\n\n` +
                  `**Correct Syntax:** \`${syntax}\``;

    if (example) {
        message += `\n**Example:** \`${example}\``;
    }

    message += `\n\n💡 **Tip:** Type \`!help ${command}\` for more info`;

    return message;
}

/**
 * Generate "you can't do that" error message
 * @param {string} reason - Why they can't do it
 * @returns {string} - Formatted error message
 */
function cannotPerformActionMessage(reason) {
    return `❌ **Action Not Allowed**\n\n${reason}`;
}

/**
 * Generate success message for gambling wins
 * @param {string} username - Winner's username
 * @param {number} winAmount - Amount won
 * @param {number} newBalance - New balance after win
 * @returns {string} - Formatted success message
 */
function gamblingWinMessage(username, winAmount, newBalance) {
    return `🎉 **Congratulations ${username}!**\n\n` +
           `**You Won:** 🍯${winAmount.toLocaleString()}\n` +
           `**New Balance:** 🍯${newBalance.toLocaleString()}`;
}

/**
 * Generate loss message for gambling
 * @param {string} username - Loser's username
 * @param {number} lostAmount - Amount lost
 * @param {number} newBalance - New balance after loss
 * @returns {string} - Formatted loss message
 */
function gamblingLossMessage(username, lostAmount, newBalance) {
    let message = `😔 **Better Luck Next Time, ${username}**\n\n` +
                  `**You Lost:** 🍯${lostAmount.toLocaleString()}\n` +
                  `**Remaining Balance:** 🍯${newBalance.toLocaleString()}`;

    if (newBalance < 100) {
        message += `\n\n💡 **Low Balance?** Try \`!beg\` or \`!work\` to earn more`;
    }

    return message;
}

/**
 * Generate cooldown error message
 * @param {string} command - Command name
 * @param {number} remainingSeconds - Seconds remaining
 * @returns {string} - Formatted error message
 */
function cooldownMessage(command, remainingSeconds) {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;

    let timeString;
    if (minutes > 0) {
        timeString = `${minutes}m ${seconds}s`;
    } else {
        timeString = `${seconds}s`;
    }

    return `⏱️ **Cooldown Active**\n\n` +
           `You must wait **${timeString}** before using \`${command}\` again.`;
}

/**
 * Generate generic error message with helpful context
 * @param {string} action - What they were trying to do
 * @returns {string} - Formatted error message
 */
function genericErrorMessage(action) {
    return `❌ **Something Went Wrong**\n\n` +
           `An error occurred while ${action}.\n\n` +
           `💡 **What to do:**\n` +
           `• Try again in a few moments\n` +
           `• If this persists, contact a server admin`;
}

/**
 * Generate processing message for long operations
 * @param {string} action - What's being processed
 * @returns {string} - Formatted processing message
 */
function processingMessage(action) {
    return `⏳ **Processing...**\n\nPlease wait while ${action}`;
}

/**
 * Generate "not found" error message
 * @param {string} item - What wasn't found
 * @returns {string} - Formatted error message
 */
function notFoundMessage(item) {
    return `❌ **Not Found**\n\n${item} could not be found.`;
}

/**
 * Generate permission denied message
 * @param {string} requiredPermission - What permission is needed
 * @returns {string} - Formatted error message
 */
function permissionDeniedMessage(requiredPermission = 'Administrator') {
    return `🔒 **Permission Denied**\n\n` +
           `You don't have permission to use this command.\n\n` +
           `**Required:** ${requiredPermission}`;
}

/**
 * Generate timeout message for inactive players
 * @param {string} username - User who timed out
 * @returns {string} - Formatted timeout message
 */
function timeoutMessage(username) {
    return `⏱️ **Timeout**\n\n${username} took too long to respond. The action has been cancelled.`;
}

module.exports = {
    insufficientFundsMessage,
    invalidUsageMessage,
    cannotPerformActionMessage,
    gamblingWinMessage,
    gamblingLossMessage,
    cooldownMessage,
    genericErrorMessage,
    processingMessage,
    notFoundMessage,
    permissionDeniedMessage,
    timeoutMessage
};
