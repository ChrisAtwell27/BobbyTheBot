const { topEggRoleId } = require('../data/config');

const COMMANDS_CHANNEL_ID = '701461029602721873';
const BUMP_COOLDOWN = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

// Store active bump timers
const activeBumpTimers = new Map();

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        // Ignore bot messages
        if (message.author.bot) return;

        // Check if message is in the commands channel
        if (message.channelId !== COMMANDS_CHANNEL_ID) return;

        // Check if message is /bump
        if (message.content.trim().toLowerCase() !== '/bump') return;

        // Check if user has the top egg role
        if (!message.member?.roles.cache.has(topEggRoleId)) return;

        // User with top egg role typed /bump in commands channel
        console.log(`[BUMP] ${message.author.tag} initiated bump in commands channel`);

        // Clear any existing timer for this user
        if (activeBumpTimers.has(message.author.id)) {
            clearTimeout(activeBumpTimers.get(message.author.id));
        }

        // Send confirmation message
        await message.reply({
            content: ` Bump detected! I'll remind <@&${topEggRoleId}> to bump again in 2 hours.`,
            allowedMentions: { parse: [] } // Don't ping on confirmation
        });

        // Set timer for 2 hours
        const timer = setTimeout(async () => {
            try {
                // Send reminder in the commands channel
                await message.channel.send({
                    content: `ð <@&${topEggRoleId}> Time to bump again! Use \`/bump\` to keep the server active!`,
                    allowedMentions: { roles: [topEggRoleId] }
                });

                console.log(`[BUMP] Sent bump reminder to top egg role`);

                // Remove from active timers
                activeBumpTimers.delete(message.author.id);
            } catch (error) {
                console.error('[BUMP] Error sending bump reminder:', error);
                activeBumpTimers.delete(message.author.id);
            }
        }, BUMP_COOLDOWN);

        // Store the timer
        activeBumpTimers.set(message.author.id, timer);

        console.log(`[BUMP] Timer set for ${message.author.tag}, will remind in 2 hours`);
    });
};
