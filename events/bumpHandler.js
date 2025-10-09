const { topEggRoleId } = require('../data/config');

const COMMANDS_CHANNEL_ID = '701461029602721873';
const DISBOARD_BOT_ID = '302050872383242240';
const BUMP_COOLDOWN = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

// Store active bump timer (only one timer active at a time)
let activeBumpTimer = null;

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        // Only listen for messages from DISBOARD bot
        if (message.author.id !== DISBOARD_BOT_ID) return;

        // Check if message is in the commands channel
        if (message.channelId !== COMMANDS_CHANNEL_ID) return;

        // DISBOARD bot sent a message - this indicates a successful bump
        console.log(`[BUMP] DISBOARD bot message detected in commands channel`);

        // Clear any existing timer
        if (activeBumpTimer) {
            clearTimeout(activeBumpTimer);
        }

        // Send confirmation message
        await message.channel.send({
            content: `✅ Bump detected! I'll remind <@&${topEggRoleId}> to bump again in 2 hours.`,
            allowedMentions: { parse: [] } // Don't ping on confirmation
        });

        // Set timer for 2 hours
        activeBumpTimer = setTimeout(async () => {
            try {
                // Send reminder in the commands channel
                await message.channel.send({
                    content: `🔔 <@&${topEggRoleId}> Time to bump again! Use \`/bump\` to keep the server active!`,
                    allowedMentions: { roles: [topEggRoleId] }
                });

                console.log(`[BUMP] Sent bump reminder to top egg role`);

                // Clear the timer reference
                activeBumpTimer = null;
            } catch (error) {
                console.error('[BUMP] Error sending bump reminder:', error);
                activeBumpTimer = null;
            }
        }, BUMP_COOLDOWN);

        console.log(`[BUMP] Timer set, will remind in 2 hours`);
    });
};
