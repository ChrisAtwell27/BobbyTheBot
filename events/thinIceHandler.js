const fs = require('fs');
const path = require('path');
const { thinIceRoleId } = require('../data/config'); // Import thinIceRoleId from config.js

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
