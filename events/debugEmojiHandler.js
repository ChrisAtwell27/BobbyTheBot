// Debug handler to help identify emoji names in your server
module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        // Command to list all server emojis
        if (message.content === '!listemojis') {
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('You need Administrator permissions to use this command.');
            }

            try {
                const guild = message.guild;
                const emojis = guild.emojis.cache;

                if (emojis.size === 0) {
                    return message.reply('No custom emojis found in this server.');
                }

                // Group emojis into chunks to avoid message length limits
                const emojiList = emojis.map(emoji => {
                    return `${emoji} - Name: \`${emoji.name}\` - ID: \`${emoji.id}\``;
                });

                // Send in chunks of 20 emojis per message
                const chunkSize = 20;
                for (let i = 0; i < emojiList.length; i += chunkSize) {
                    const chunk = emojiList.slice(i, i + chunkSize);
                    await message.channel.send(
                        `**Server Emojis (${i + 1}-${Math.min(i + chunkSize, emojiList.length)} of ${emojiList.length}):**\n\n` +
                        chunk.join('\n')
                    );
                }

                // Look for Valorant rank emojis specifically
                const rankNames = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'];
                const foundRanks = [];
                const missingRanks = [];

                for (const rankName of rankNames) {
                    const emoji = emojis.find(e => e.name === rankName);
                    if (emoji) {
                        foundRanks.push(`${emoji} \`${emoji.name}\``);
                    } else {
                        missingRanks.push(rankName);
                    }
                }

                let rankMessage = '\n**Valorant Rank Emojis Status:**\n\n';

                if (foundRanks.length > 0) {
                    rankMessage += `✅ **Found (${foundRanks.length}):**\n${foundRanks.join('\n')}\n\n`;
                }

                if (missingRanks.length > 0) {
                    rankMessage += `❌ **Missing (${missingRanks.length}):**\n${missingRanks.map(r => `- ${r}`).join('\n')}\n\n`;
                    rankMessage += `*Make sure emoji names match exactly (case-sensitive)*`;
                }

                await message.channel.send(rankMessage);

            } catch (error) {
                console.error('Error listing emojis:', error);
                message.reply('An error occurred while listing emojis.');
            }
        }

        // Command to test a specific emoji reaction
        if (message.content.startsWith('!testemoji ')) {
            if (!message.member.permissions.has('Administrator')) {
                return message.reply('You need Administrator permissions to use this command.');
            }

            try {
                const emojiName = message.content.split(' ')[1];
                const guild = message.guild;
                const emoji = guild.emojis.cache.find(e => e.name === emojiName);

                if (emoji) {
                    const testMsg = await message.channel.send(`Testing emoji: ${emoji} (Name: \`${emoji.name}\`, ID: \`${emoji.id}\`)`);
                    await testMsg.react(emoji);
                    await message.reply(`✅ Successfully found and reacted with \`${emojiName}\`!\n\nUse this in your config.js:\n\`\`\`js\n'${emoji.name}': 'YOUR_ROLE_ID_HERE'\`\`\``);
                } else {
                    await message.reply(`❌ Emoji \`${emojiName}\` not found in server.\n\nUse \`!listemojis\` to see all available emojis.`);
                }
            } catch (error) {
                console.error('Error testing emoji:', error);
                message.reply('An error occurred while testing the emoji.');
            }
        }
    });
};
