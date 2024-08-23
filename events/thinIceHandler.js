const fs = require('fs');
const path = require('path');
const { thinIceRoleId } = require('../data/config'); // Import thinIceRoleId from config.js

// Load bad words from the formatted_badwords.txt file
const badWordsFilePath = path.join(__dirname, '../data/formatted_badwords.txt');
const badWordsContent = fs.readFileSync(badWordsFilePath, 'utf-8');
const badWords = badWordsContent.split(',').map(word => word.trim().replace(/['"]+/g, ''));
const topEggRoleId = '701309444562092113';

module.exports = async (client) => {
    const thinIceFilePath = path.join(__dirname, '../data/thin_ice.txt');

    client.on('messageCreate', async message => {
        if (message.author.bot) return; // Ignore bot messages

        const messageContent = message.content.toLowerCase();
        const containsBobby = messageContent.includes('bobby');
        const containsBadWord = badWords.some(word => messageContent.includes(word));

        if (containsBobby && containsBadWord) {
            try {
                const member = message.member;
                let warnings = getUserWarnings(member.id, thinIceFilePath);

                if (warnings === 0) {
                    // First offense: Give them the Thin Ice role and warn them
                    await member.roles.add(thinIceRoleId);
                    await message.channel.send(`${member}, you're on thin ice!`);
                    updateUserWarnings(member.id, thinIceFilePath, warnings + 1);
                } else if (warnings === 1) {
                    // Second offense: Timeout for 1 minute
                    await message.channel.send(`${member}, you broke the already thin ice. Timeout for 1 minute.`);
                    await member.timeout(60000, 'Broke thin ice');
                    updateUserWarnings(member.id, thinIceFilePath, warnings + 1);
                } else if (warnings === 2) {
                    // Third offense: Timeout for 5 minutes
                    await message.channel.send(`${member}, you broke the already thin ice again. Timeout for 5 minutes.`);
                    await member.timeout(300000, 'Broke thin ice again');
                    updateUserWarnings(member.id, thinIceFilePath, warnings + 1);
                } else {
                    // Fourth offense and above: Timeout for 10 minutes
                    await message.channel.send(`${member}, you continue to break the ice. Timeout for 10 minutes.`);
                    await member.timeout(600000, 'Broke thin ice multiple times');
                    updateUserWarnings(member.id, thinIceFilePath, warnings + 1);
                }
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

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return; // Ignore bot messages

        // Command structure: !Reset Thinice @User
        if (message.content.startsWith('!Reset Thinice')) {
            // Check if the author has the Top Egg role
            if (!message.member.roles.cache.has(topEggRoleId)) {
                return message.reply("You don't have permission to use this command.");
            }

            // Extract the mentioned user
            const mentionedUser = message.mentions.users.first();
            if (!mentionedUser) {
                return message.reply('Please mention a valid user to reset Thin Ice.');
            }

            const member = message.guild.members.cache.get(mentionedUser.id);

            // Remove the Thin Ice role from the mentioned user
            if (member.roles.cache.has(thinIceRoleId)) {
                await member.roles.remove(thinIceRoleId);
                message.channel.send(`${member}, your Thin Ice status has been reset.`);
            } else {
                message.channel.send(`${member} does not have the Thin Ice role.`);
            }

            // Clear the warnings for the user in thin_ice.txt
            clearUserWarnings(member.id, thinIceFilePath);
        }
    });

    function clearUserWarnings(userId, filePath) {
        if (fs.existsSync(filePath)) {
            let data = fs.readFileSync(filePath, 'utf-8');
            const userRecord = data.split('\n').find(line => line.startsWith(userId));

            if (userRecord) {
                data = data.replace(userRecord, ''); // Remove the user record
                data = data.trim(); // Remove any extra whitespace
                fs.writeFileSync(filePath, data, 'utf-8');
            }
        }
    }

    function getUserWarnings(userId, filePath) {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '', 'utf-8');
        }
        const data = fs.readFileSync(filePath, 'utf-8');
        const userRecord = data.split('\n').find(line => line.startsWith(userId));
        return userRecord ? parseInt(userRecord.split(':')[1], 10) : 0;
    }

    function updateUserWarnings(userId, filePath, warnings) {
        let data = fs.readFileSync(filePath, 'utf-8');
        const userRecord = data.split('\n').find(line => line.startsWith(userId));
        if (userRecord) {
            data = data.replace(userRecord, `${userId}:${warnings}`);
        } else {
            data += `${userId}:${warnings}\n`;
        }
        fs.writeFileSync(filePath, data, 'utf-8');
    }
};
