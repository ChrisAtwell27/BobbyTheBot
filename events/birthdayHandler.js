const cron = require('node-cron');
const User = require('../database/models/User');

const UPDATES_ROLE_ID = '1428572559523188746';

module.exports = (client, announcementsChannelId) => {
    // Handle !birthday command
    client.on('messageCreate', async (message) => {
        // Ignore bot messages
        if (message.author.bot) return;

        const content = message.content.trim();

        // Check for !birthday command
        if (content.startsWith('!birthday')) {
            const args = content.split(' ');

            // Show birthday info if no args provided
            if (args.length === 1) {
                try {
                    const user = await User.findOne({ userId: message.author.id });

                    if (!user || !user.birthday || !user.birthday.month) {
                        await message.reply('You haven\'t set your birthday yet! Use `!birthday MM-DD-YYYY` to set it.\nExample: `!birthday 03-15-1995`');
                        return;
                    }

                    const month = String(user.birthday.month).padStart(2, '0');
                    const day = String(user.birthday.day).padStart(2, '0');
                    const year = user.birthday.year;

                    await message.reply(`Your birthday is set to: ${month}-${day}-${year}`);
                } catch (error) {
                    console.error('[BIRTHDAY] Error fetching birthday:', error);
                    await message.reply('An error occurred while fetching your birthday.');
                }
                return;
            }

            // Parse and set birthday
            const dateString = args[1];
            const datePattern = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
            const match = dateString.match(datePattern);

            if (!match) {
                await message.reply('Invalid date format! Please use `!birthday MM-DD-YYYY`\nExample: `!birthday 03-15-1995`');
                return;
            }

            const month = parseInt(match[1]);
            const day = parseInt(match[2]);
            const year = parseInt(match[3]);

            // Validate month
            if (month < 1 || month > 12) {
                await message.reply('Invalid month! Month must be between 1 and 12.');
                return;
            }

            // Validate day
            if (day < 1 || day > 31) {
                await message.reply('Invalid day! Day must be between 1 and 31.');
                return;
            }

            // Validate day for specific months
            const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            if (day > daysInMonth[month - 1]) {
                await message.reply(`Invalid day! Month ${month} only has ${daysInMonth[month - 1]} days.`);
                return;
            }

            // Validate year (reasonable range)
            const currentYear = new Date().getFullYear();
            if (year < 1900 || year > currentYear) {
                await message.reply(`Invalid year! Year must be between 1900 and ${currentYear}.`);
                return;
            }

            // Validate that the date is in the past
            const birthDate = new Date(year, month - 1, day);
            if (birthDate > new Date()) {
                await message.reply('Birthday cannot be in the future!');
                return;
            }

            try {
                // Update or create user with birthday
                await User.findOneAndUpdate(
                    { userId: message.author.id },
                    {
                        $set: {
                            birthday: {
                                month: month,
                                day: day,
                                year: year
                            }
                        }
                    },
                    { upsert: true, new: true }
                );

                const formattedDate = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}-${year}`;
                await message.reply(`Birthday set successfully! Your birthday is: ${formattedDate}`);

                console.log(`[BIRTHDAY] User ${message.author.tag} set birthday to ${formattedDate}`);
            } catch (error) {
                console.error('[BIRTHDAY] Error setting birthday:', error);
                await message.reply('An error occurred while setting your birthday. Please try again.');
            }
        }
    });

    // Daily birthday check at midnight (00:00)
    // Runs every day at midnight server time
    cron.schedule('0 0 * * *', async () => {
        console.log('[BIRTHDAY] Running daily birthday check...');

        try {
            const today = new Date();
            const currentMonth = today.getMonth() + 1; // JavaScript months are 0-indexed
            const currentDay = today.getDate();
            const currentYear = today.getFullYear();

            // Find users with birthdays today who haven't been wished this year
            const users = await User.find({
                'birthday.month': currentMonth,
                'birthday.day': currentDay,
                $or: [
                    { lastBirthdayWish: null },
                    { lastBirthdayWish: { $lt: currentYear } }
                ]
            });

            if (users.length === 0) {
                console.log('[BIRTHDAY] No birthdays today.');
                return;
            }

            console.log(`[BIRTHDAY] Found ${users.length} birthday(s) today!`);

            // Get announcements channel
            const announcementsChannel = await client.channels.fetch(announcementsChannelId);

            if (!announcementsChannel) {
                console.error('[BIRTHDAY] Could not find announcements channel!');
                return;
            }

            // Send birthday messages
            for (const user of users) {
                try {
                    const age = currentYear - user.birthday.year;

                    await announcementsChannel.send({
                        content: `<@&${UPDATES_ROLE_ID}> Happy Birthday <@${user.userId}>! 🎉🎂🎈\nWishing you an amazing ${age}th birthday!`,
                        allowedMentions: {
                            roles: [UPDATES_ROLE_ID],
                            users: [user.userId]
                        }
                    });

                    // Update lastBirthdayWish to current year
                    await User.findOneAndUpdate(
                        { userId: user.userId },
                        { $set: { lastBirthdayWish: currentYear } }
                    );

                    console.log(`[BIRTHDAY] Sent birthday wish to user ${user.userId} (age ${age})`);
                } catch (error) {
                    console.error(`[BIRTHDAY] Error sending birthday message for user ${user.userId}:`, error);
                }
            }
        } catch (error) {
            console.error('[BIRTHDAY] Error in birthday check:', error);
        }
    });

    console.log('[BIRTHDAY] Birthday handler initialized. Daily check scheduled for midnight.');
};
