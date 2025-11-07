const fs = require('fs');
const path = require('path');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { thinIceRoleId } = require('../data/config');
const { TARGET_GUILD_ID } = require('../config/guildConfig');

// Load bad words from the formatted_badwords.txt file
const badWordsFilePath = path.join(__dirname, '../data/formatted_badwords.txt');
let badWords = [];

// Words that are too common and cause false positives (exclude these)
const excludedWords = [
    'sex', 'hell', 'damn', 'ass', 'crap', 'poop', 'balls', 'butt', 
    'bum', 'lmfao', 'piss', 'pissed', 'bloody', 'feck'
];

try {
    const badWordsContent = fs.readFileSync(badWordsFilePath, 'utf-8');
    const allWords = badWordsContent.split(',').map(word => word.trim().replace(/['"]+/g, '')).filter(word => word.length > 0);
    
    // Filter out excluded words
    badWords = allWords.filter(word => !excludedWords.includes(word.toLowerCase()));
    
    console.log(`❄️ Thin Ice Handler: Loaded ${badWords.length} bad words (${allWords.length - badWords.length} excluded)`);
} catch (error) {
    console.error('❌ Thin Ice Handler: Failed to load bad words file:', error);
}

const topEggRoleId = '701309444562092113';

// Timeout durations in milliseconds
const TIMEOUT_DURATIONS = {
    1: 60000,      // 1 minute
    2: 300000,     // 5 minutes
    3: 600000,     // 10 minutes
    4: 1800000     // 30 minutes
};

module.exports = async (client) => {
    const thinIceFilePath = path.join(__dirname, '../data/thin_ice.txt');

    // Ensure thin_ice.txt exists
    if (!fs.existsSync(thinIceFilePath)) {
        fs.writeFileSync(thinIceFilePath, '', 'utf-8');
    }

    console.log('❄️ Thin Ice Handler initialized');

    client.on('messageCreate', async message => {
        if (message.author.bot) return;

        // Only run in target guild
        if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

        if (!message.guild) return;
        if (!message.member) return;

        const messageContent = message.content.toLowerCase();

        // Handle admin commands first
        // Command structure: !Reset Thinice @User
        if (messageContent.startsWith('!reset thinice')) {
            // Check if the author has the Top Egg role or admin permissions
            const hasPermission = message.member.roles.cache.has(topEggRoleId) ||
                                  message.member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (!hasPermission) {
                return message.reply("❌ You don't have permission to use this command.");
            }

            // Extract the mentioned user
            const mentionedUser = message.mentions.users.first();
            if (!mentionedUser) {
                return message.reply('❌ Please mention a valid user to reset Thin Ice.');
            }

            const member = message.guild.members.cache.get(mentionedUser.id);
            if (!member) {
                return message.reply('❌ User not found in this server.');
            }

            const warnings = getUserWarnings(member.id, thinIceFilePath);

            // Remove the Thin Ice role from the mentioned user
            if (member.roles.cache.has(thinIceRoleId)) {
                await member.roles.remove(thinIceRoleId);

                const embed = new EmbedBuilder()
                    .setColor(0x00FF00) // Green
                    .setTitle('❄️ Thin Ice Reset')
                    .setDescription(`${member}'s Thin Ice status has been cleared!`)
                    .addFields(
                        { name: '👤 User', value: member.user.tag, inline: true },
                        { name: '🔢 Previous Warnings', value: warnings.toString(), inline: true },
                        { name: '✅ Action By', value: message.author.tag, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Status reset by moderator' });

                await message.channel.send({ embeds: [embed] });
                console.log(`❄️ Thin Ice reset for ${member.user.tag} by ${message.author.tag}`);
            } else {
                return message.reply(`${member} does not have the Thin Ice role.`);
            }

            // Clear the warnings for the user in thin_ice.txt
            clearUserWarnings(member.id, thinIceFilePath);
            return;
        }

        // Command to check thin ice status
        if (messageContent === '!thinice' || messageContent.startsWith('!thinice ')) {
            const mentionedUser = message.mentions.users.first();
            const targetUser = mentionedUser || message.author;
            const member = message.guild.members.cache.get(targetUser.id);

            if (!member) {
                return message.reply('❌ User not found.');
            }

            const warnings = getUserWarnings(targetUser.id, thinIceFilePath);
            const hasThinIce = member.roles.cache.has(thinIceRoleId);

            const embed = new EmbedBuilder()
                .setColor(hasThinIce ? 0x87CEEB : 0x00FF00)
                .setTitle(`❄️ Thin Ice Status - ${targetUser.username}`)
                .addFields(
                    { name: '🔢 Warning Level', value: warnings.toString(), inline: true },
                    { name: '❄️ Status', value: hasThinIce ? 'On Thin Ice' : 'Clear', inline: true },
                    { name: '⏭️ Next Penalty', value: getNextPenalty(warnings), inline: true }
                )
                .setTimestamp();

            if (targetUser.displayAvatarURL) {
                embed.setThumbnail(targetUser.displayAvatarURL());
            }

            await message.channel.send({ embeds: [embed] });
            return;
        }

        // Check if message contains "bobby"
        const containsBobby = messageContent.includes('bobby');
        if (!containsBobby) return;

        // Check for bad words using word boundaries for more accurate detection
        const foundBadWord = badWords.find(word => {
            const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            return regex.test(messageContent);
        });

        if (foundBadWord) {
            console.log(`❄️ Detected bad word "${foundBadWord}" in message from ${message.author.tag}: "${message.content}"`);

            try {
                const member = message.member;
                let warnings = getUserWarnings(member.id, thinIceFilePath);

                // Delete the offending message
                try {
                    await message.delete();
                } catch (deleteError) {
                    console.error('Failed to delete offensive message:', deleteError);
                }

                if (warnings === 0) {
                    // First offense: Give them the Thin Ice role and warn them
                    await member.roles.add(thinIceRoleId);

                    const embed = new EmbedBuilder()
                        .setColor(0x87CEEB) // Light blue (thin ice color)
                        .setTitle('❄️ Thin Ice Warning')
                        .setDescription(`${member}, you're on thin ice!`)
                        .addFields(
                            { name: '⚠️ Offense', value: 'Inappropriate language directed at Bobby', inline: false },
                            { name: '🔢 Warning Level', value: '1/3', inline: true },
                            { name: '⏭️ Next Penalty', value: '1 minute timeout', inline: true }
                        )
                        .setFooter({ text: 'Be respectful or face consequences!' })
                        .setTimestamp();

                    await message.channel.send({ embeds: [embed] });
                    updateUserWarnings(member.id, thinIceFilePath, warnings + 1);

                } else if (warnings === 1) {
                    // Second offense: Timeout for 1 minute
                    const embed = new EmbedBuilder()
                        .setColor(0xFFA500) // Orange
                        .setTitle('❄️💥 Ice Cracking!')
                        .setDescription(`${member}, you broke the thin ice!`)
                        .addFields(
                            { name: '⚠️ Penalty', value: 'Timeout for 1 minute', inline: false },
                            { name: '🔢 Warning Level', value: '2/3', inline: true },
                            { name: '⏭️ Next Penalty', value: '5 minute timeout', inline: true }
                        )
                        .setFooter({ text: 'Last chance to change your behavior!' })
                        .setTimestamp();

                    await message.channel.send({ embeds: [embed] });
                    await member.timeout(TIMEOUT_DURATIONS[1], 'Broke thin ice (2nd offense)');
                    updateUserWarnings(member.id, thinIceFilePath, warnings + 1);

                } else if (warnings === 2) {
                    // Third offense: Timeout for 5 minutes
                    const embed = new EmbedBuilder()
                        .setColor(0xFF4500) // Red-orange
                        .setTitle('❄️💥💥 Ice Shattered!')
                        .setDescription(`${member}, you completely broke the ice again!`)
                        .addFields(
                            { name: '⚠️ Penalty', value: 'Timeout for 5 minutes', inline: false },
                            { name: '🔢 Warning Level', value: '3/3', inline: true },
                            { name: '⏭️ Next Penalty', value: '10 minute timeout', inline: true }
                        )
                        .setFooter({ text: 'This is your final warning!' })
                        .setTimestamp();

                    await message.channel.send({ embeds: [embed] });
                    await member.timeout(TIMEOUT_DURATIONS[2], 'Broke thin ice (3rd offense)');
                    updateUserWarnings(member.id, thinIceFilePath, warnings + 1);

                } else {
                    // Fourth offense and above: Timeout for 10+ minutes
                    const timeoutDuration = TIMEOUT_DURATIONS[4];

                    const embed = new EmbedBuilder()
                        .setColor(0xFF0000) // Red
                        .setTitle('❄️💥💥💥 Frozen Out!')
                        .setDescription(`${member}, you continue to break the ice!`)
                        .addFields(
                            { name: '⚠️ Penalty', value: `Timeout for ${Math.floor(timeoutDuration / 60000)} minutes`, inline: false },
                            { name: '🔢 Warning Level', value: `${warnings + 1} (Critical)`, inline: true },
                            { name: '📢 Note', value: 'Contact a moderator to appeal', inline: true }
                        )
                        .setFooter({ text: 'Continued violations may result in escalation' })
                        .setTimestamp();

                    await message.channel.send({ embeds: [embed] });
                    await member.timeout(timeoutDuration, `Broke thin ice (${warnings + 1}th offense)`);
                    updateUserWarnings(member.id, thinIceFilePath, warnings + 1);
                }

                console.log(`❄️ Thin Ice: ${member.user.tag} warning level ${warnings + 1}`);
            } catch (error) {
                console.error('Failed to manage thin ice:', error);
            }
        }
    });

    client.on('guildMemberUpdate', async (oldMember, newMember) => {
        const hadThinIceRole = oldMember.roles.cache.has(thinIceRoleId);
        const hasThinIceRoleNow = newMember.roles.cache.has(thinIceRoleId);

        // Check if the Thin Ice role was removed
        if (hadThinIceRole && !hasThinIceRoleNow) {
            try {
                const warnings = getUserWarnings(newMember.id, thinIceFilePath);

                if (warnings > 0) {
                    // If the user has warnings, reassign the Thin Ice role
                    await newMember.roles.add(thinIceRoleId);
                    console.log(`Reassigned Thin Ice role to ${newMember.user.tag} because they have ${warnings} warnings.`);
                }
            } catch (error) {
                console.error('Failed to reassign Thin Ice role:', error);
            }
        }
    });

    function clearUserWarnings(userId, filePath) {
        try {
            if (fs.existsSync(filePath)) {
                let data = fs.readFileSync(filePath, 'utf-8');
                const lines = data.split('\n').filter(line => line.trim() !== '');
                const newLines = lines.filter(line => !line.startsWith(userId));
                fs.writeFileSync(filePath, newLines.join('\n') + (newLines.length > 0 ? '\n' : ''), 'utf-8');
            }
        } catch (error) {
            console.error('Error clearing user warnings:', error);
        }
    }

    function getUserWarnings(userId, filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, '', 'utf-8');
                return 0;
            }
            const data = fs.readFileSync(filePath, 'utf-8');
            const userRecord = data.split('\n').find(line => line.startsWith(userId));
            return userRecord ? parseInt(userRecord.split(':')[1], 10) || 0 : 0;
        } catch (error) {
            console.error('Error getting user warnings:', error);
            return 0;
        }
    }

    function updateUserWarnings(userId, filePath, warnings) {
        try {
            let data = fs.readFileSync(filePath, 'utf-8');
            const lines = data.split('\n').filter(line => line.trim() !== '');
            const userRecordIndex = lines.findIndex(line => line.startsWith(userId));

            if (userRecordIndex !== -1) {
                lines[userRecordIndex] = `${userId}:${warnings}`;
            } else {
                lines.push(`${userId}:${warnings}`);
            }

            fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
        } catch (error) {
            console.error('Error updating user warnings:', error);
        }
    }

    function getNextPenalty(currentWarnings) {
        if (currentWarnings === 0) return 'Thin Ice role';
        if (currentWarnings === 1) return '1 minute timeout';
        if (currentWarnings === 2) return '5 minute timeout';
        if (currentWarnings === 3) return '10 minute timeout';
        return '30 minute timeout';
    }
};
