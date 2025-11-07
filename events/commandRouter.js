/**
 * Centralized Command Router
 * This replaces the individual client.on('messageCreate') listeners in each handler
 * to dramatically reduce CPU usage by processing messages only once.
 */

const { TARGET_GUILD_ID } = require('../config/guildConfig');

// Import command handlers (they should export command objects, not register listeners)
// Example structure: { name: 'createmafia', execute: async (message, args) => {...} }

const commandMap = new Map();

module.exports = (client) => {
    // Register commands here
    // commandMap.set('createmafia', require('./mafiaHandler').commands.createmafia);
    // commandMap.set('help', require('./helpHandler').commands.help);
    // etc...

    console.log('📡 Centralized Command Router initialized');

    // Single messageCreate listener
    client.on('messageCreate', async (message) => {
        // Skip bots
        if (message.author.bot) return;

        // Guild filter (if needed)
        if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

        // Check if message starts with command prefix
        if (!message.content.startsWith('!')) return;

        // Parse command and args
        const args = message.content.slice(1).trim().split(/\s+/);
        const commandName = args.shift().toLowerCase();

        // Get command from map
        const command = commandMap.get(commandName);
        if (!command) return; // Command not found, ignore silently

        // Execute command
        try {
            await command.execute(message, args);
        } catch (error) {
            console.error(`Error executing command ${commandName}:`, error);
            message.reply('There was an error executing that command.');
        }
    });

    console.log(`✅ Registered ${commandMap.size} commands in centralized router`);
};
