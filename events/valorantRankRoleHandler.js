const { EmbedBuilder } = require('discord.js');

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        // Only respond to !setupvalranks command
        if (message.content !== '!setupvalranks') return;

        // Check if user has admin permissions
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('You need Administrator permissions to use this command.');
        }

        try {
            // Create an embed for the rank selection message
            const embed = new EmbedBuilder()
                .setTitle('🎮 Select Your VALORANT Rank')
                .setDescription('React with your current VALORANT rank to get the corresponding role!\n\n' +
                    'Available ranks:\n' +
                    ':Iron: **Iron**\n' +
                    ':Bronze: **Bronze**\n' +
                    ':Silver: **Silver**\n' +
                    ':Gold: **Gold**\n' +
                    ':Platinum: **Platinum**\n' +
                    ':Diamond: **Diamond**\n' +
                    ':Ascendant: **Ascendant**\n' +
                    ':Immortal: **Immortal**\n' +
                    ':Radiant: **Radiant**\n\n' +
                    '*Note: You can only have one rank role at a time. Reacting to a new rank will remove your previous rank role.*')
                .setColor('#FF4655') // VALORANT red color
                .setFooter({ text: 'React below to select your rank!' })
                .setTimestamp();

            // Send the embed
            const sentMessage = await message.channel.send({ embeds: [embed] });

            // Add all the rank emoji reactions
            // Note: These emoji names should match your Discord server's custom emojis
            const rankEmojis = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'];

            // Add reactions in order
            for (const emoji of rankEmojis) {
                try {
                    await sentMessage.react(emoji);
                } catch (error) {
                    console.error(`Failed to add reaction ${emoji}:`, error);
                    // If it's a custom emoji, try with colon format
                    try {
                        await sentMessage.react(`:${emoji}:`);
                    } catch (err) {
                        console.error(`Failed to add reaction :${emoji}::`, err);
                    }
                }
            }

            // Log the message ID for configuration
            console.log(`✅ Valorant rank role message created!`);
            console.log(`Message ID: ${sentMessage.id}`);
            console.log(`Add this to your config.js roleMessageIds: valRanks: "${sentMessage.id}"`);

            // Send a confirmation message to the admin
            await message.reply(
                `✅ Valorant rank role message created!\n\n` +
                `**Next steps:**\n` +
                `1. Add this to your \`data/config.js\` under \`roleMessageIds\`:\n` +
                `\`\`\`js\nvalRanks: "${sentMessage.id}"\`\`\`\n\n` +
                `2. Add the emoji-to-role mappings to \`roleMappings\` in \`data/config.js\`:\n` +
                `\`\`\`js\n// Example format:\n'Iron': 'YOUR_IRON_ROLE_ID',\n'Bronze': 'YOUR_BRONZE_ROLE_ID',\n// ... etc\`\`\`\n\n` +
                `3. Get role IDs by typing \`\\@RoleName\` in Discord and copying the ID from the mention.\n\n` +
                `4. Restart the bot for changes to take effect.`
            );

        } catch (error) {
            console.error('Error setting up Valorant rank roles:', error);
            message.reply('❌ An error occurred while setting up the rank role message.');
        }
    });
};
