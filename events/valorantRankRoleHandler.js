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
            // Get guild emojis to display in the embed
            const guild = message.guild;
            const rankEmojiNames = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'];

            // Build the description with actual emoji references
            let description = 'React with your current VALORANT rank to get the corresponding role!\n\n**Available ranks:**\n';

            for (const emojiName of rankEmojiNames) {
                const guildEmoji = guild.emojis.cache.find(e => e.name === emojiName);
                if (guildEmoji) {
                    description += `${guildEmoji} **${emojiName}**\n`;
                } else {
                    description += `❓ **${emojiName}** (emoji not found)\n`;
                }
            }

            description += '\n*Note: You can only have one rank role at a time. Reacting to a new rank will remove your previous rank role.*';

            // Create an embed for the rank selection message
            const embed = new EmbedBuilder()
                .setTitle('🎮 Select Your VALORANT Rank')
                .setDescription(description)
                .setColor('#FF4655') // VALORANT red color
                .setFooter({ text: 'React below to select your rank!' })
                .setTimestamp();

            // Send the embed
            const sentMessage = await message.channel.send({ embeds: [embed] });

            console.log('Available guild emojis:', guild.emojis.cache.map(e => e.name).join(', '));

            // Add reactions in order
            for (const emojiName of rankEmojiNames) {
                try {
                    // Find the emoji in the guild's emoji collection
                    const guildEmoji = guild.emojis.cache.find(e => e.name === emojiName);

                    if (guildEmoji) {
                        await sentMessage.react(guildEmoji);
                        console.log(`✅ Added reaction: ${emojiName}`);
                    } else {
                        console.error(`❌ Emoji "${emojiName}" not found in server. Available emojis: ${guild.emojis.cache.map(e => e.name).join(', ')}`);
                    }
                } catch (error) {
                    console.error(`Failed to add reaction ${emojiName}:`, error);
                }
            }

            // Log the message ID for configuration
            console.log(`✅ Valorant rank role message created!`);
            console.log(`Message ID: ${sentMessage.id}`);
            console.log(`Add this to your config.js roleMessageIds: valRanks: "${sentMessage.id}"`);

            // Check which emojis were successfully added
            const foundEmojis = [];
            const missingEmojis = [];

            for (const emojiName of rankEmojiNames) {
                const guildEmoji = guild.emojis.cache.find(e => e.name === emojiName);
                if (guildEmoji) {
                    foundEmojis.push(emojiName);
                } else {
                    missingEmojis.push(emojiName);
                }
            }

            let replyMessage = `✅ Valorant rank role message created!\n\n`;

            if (missingEmojis.length > 0) {
                replyMessage += `⚠️ **Warning:** The following emojis were not found in your server:\n${missingEmojis.map(e => `- :${e}:`).join('\n')}\n\n`;
                replyMessage += `Please make sure these custom emojis exist in your server with the exact names shown above (case-sensitive).\n\n`;
            }

            if (foundEmojis.length > 0) {
                replyMessage += `✅ Successfully added reactions for: ${foundEmojis.join(', ')}\n\n`;
            }

            replyMessage += `**Next steps:**\n` +
                `1. Add this to your \`data/config.js\` under \`roleMessageIds\`:\n` +
                `\`\`\`js\nvalRanks: "${sentMessage.id}"\`\`\`\n\n` +
                `2. Add the emoji-to-role mappings to \`roleMappings\` in \`data/config.js\`. Use the **exact emoji names** from your server:\n` +
                `\`\`\`js\n// Example format (emoji names must match exactly):\n`;

            for (const emojiName of foundEmojis) {
                replyMessage += `'${emojiName}': 'YOUR_${emojiName.toUpperCase()}_ROLE_ID',\n`;
            }

            replyMessage += `\`\`\`\n\n` +
                `3. Get role IDs by typing \`\\@RoleName\` in Discord and copying the ID from the mention.\n\n` +
                `4. Restart the bot for changes to take effect.`;

            // Send a confirmation message to the admin
            await message.reply(replyMessage);

        } catch (error) {
            console.error('Error setting up Valorant rank roles:', error);
            message.reply('❌ An error occurred while setting up the rank role message.');
        }
    });
};
