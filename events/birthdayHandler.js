const cron = require("node-cron");
const { getConvexClient } = require("../database/convexClient");
const { api } = require("../convex/_generated/api");
const {
  checkSubscription,
  createUpgradeEmbed,
  TIERS,
} = require("../utils/subscriptionUtils");

// Remove direct instantiation to prevent startup crash if env var is missing
// const client = new ConvexHttpClient(process.env.CONVEX_URL);
// Update Role ID should be dynamic or configured per guild, but for now keeping hardcoded if global or need config migration
const UPDATES_ROLE_ID = "1428572559523188746";

module.exports = (discordClient) => {
  const client = getConvexClient();

  // Handle !birthday command
  discordClient.on("messageCreate", async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Only run in a guild
    if (!message.guild) return;

    // EARLY RETURN: Skip if not a birthday command
    if (!message.content.toLowerCase().startsWith("!birthday")) return;

    // Check subscription tier - PLUS TIER REQUIRED for birthday
    const subCheck = await checkSubscription(
      message.guild.id,
      TIERS.PLUS,
      message.guild.ownerId
    );
    if (!subCheck.hasAccess) {
      const upgradeEmbed = createUpgradeEmbed(
        "Birthday Tracking",
        TIERS.PLUS,
        subCheck.guildTier
      );
      return message.channel.send({ embeds: [upgradeEmbed] });
    }

    const content = message.content.trim();

    // Check for !birthday command
    if (content.startsWith("!birthday")) {
      const args = content.split(" ");

      // Show birthday info if no args provided
      if (args.length === 1) {
        try {
          const user = await client.query(api.users.getUser, {
            guildId: message.guild.id, // Use dynamic guild ID
            userId: message.author.id,
          });

          if (!user || !user.birthday || !user.birthday.month) {
            await message.reply(
              "You haven't set your birthday yet! Use `!birthday MM-DD-YYYY` to set it.\nExample: `!birthday 03-15-1995`"
            );
            return;
          }

          const month = String(user.birthday.month).padStart(2, "0");
          const day = String(user.birthday.day).padStart(2, "0");
          const year = user.birthday.year;

          await message.reply(
            `Your birthday is set to: ${month}-${day}-${year}`
          );
        } catch (error) {
          console.error("[BIRTHDAY] Error fetching birthday:", error);
          await message.reply(
            "An error occurred while fetching your birthday."
          );
        }
        return;
      }

      // Parse and set birthday
      const dateString = args[1];
      const datePattern = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
      const match = dateString.match(datePattern);

      if (!match) {
        await message.reply(
          "Invalid date format! Please use `!birthday MM-DD-YYYY`\nExample: `!birthday 03-15-1995`"
        );
        return;
      }

      const month = parseInt(match[1]);
      const day = parseInt(match[2]);
      const year = parseInt(match[3]);

      // Validate month
      if (month < 1 || month > 12) {
        await message.reply("Invalid month! Month must be between 1 and 12.");
        return;
      }

      // Validate day
      if (day < 1 || day > 31) {
        await message.reply("Invalid day! Day must be between 1 and 31.");
        return;
      }

      // Validate day for specific months
      const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (day > daysInMonth[month - 1]) {
        await message.reply(
          `Invalid day! Month ${month} only has ${daysInMonth[month - 1]} days.`
        );
        return;
      }

      // Validate year (reasonable range)
      const currentYear = new Date().getFullYear();
      if (year < 1900 || year > currentYear) {
        await message.reply(
          `Invalid year! Year must be between 1900 and ${currentYear}.`
        );
        return;
      }

      // Validate that the date is in the past
      const birthDate = new Date(year, month - 1, day);
      if (birthDate > new Date()) {
        await message.reply("Birthday cannot be in the future!");
        return;
      }

      try {
        // Update or create user with birthday
        await client.mutation(api.users.setBirthday, {
          guildId: message.guild.id, // Dynamic guild ID
          userId: message.author.id,
          month,
          day,
          year,
        });

        const formattedDate = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}-${year}`;
        await message.reply(
          `Birthday set successfully! Your birthday is: ${formattedDate}`
        );

        console.log(
          `[BIRTHDAY] User ${message.author.tag} set birthday to ${formattedDate}`
        );
      } catch (error) {
        console.error("[BIRTHDAY] Error setting birthday:", error);
        await message.reply(
          "An error occurred while setting your birthday. Please try again."
        );
      }
    }
  });

  // Daily birthday check at midnight (00:00)
  // Runs every day at midnight server time
  cron.schedule("0 0 * * *", async () => {
    console.log("[BIRTHDAY] Running daily birthday check...");

    try {
      const today = new Date();
      const currentMonth = today.getMonth() + 1; // JavaScript months are 0-indexed
      const currentDay = today.getDate();
      const currentYear = today.getFullYear();

      // Iterate through all guilds the bot is in
      for (const guild of discordClient.guilds.cache.values()) {
        try {
          // Find users with birthdays today for this guild
          const users = await client.query(api.users.getBirthdaysToday, {
            guildId: guild.id,
            month: currentMonth,
            day: currentDay,
            currentYear: currentYear,
          });

          if (!users || users.length === 0) {
            // console.log(`[BIRTHDAY] No birthdays today for guild ${guild.name}.`);
            continue;
          }

          console.log(
            `[BIRTHDAY] Found ${users.length} birthday(s) today in ${guild.name}!`
          );

          // TODO: Get dynamic announcements channel from settings
          // For now, falling back to a default logic or checking if we can find one
          // Accepting the passed announcementsChannelId might not work if it differs per guild
          // The original index.js passed a single ID. We should probably look for a channel named 'announcements' or similar if not configured.

          // Simplistic approach: Try to find a channel named 'announcements' or 'general'
          const announcementsChannel = guild.channels.cache.find(
            (c) =>
              c.name.includes("announcements") || c.name.includes("general")
          );

          if (!announcementsChannel || !announcementsChannel.isTextBased()) {
            console.error(
              `[BIRTHDAY] Could not find announcements channel in ${guild.name}!`
            );
            continue;
          }

          // Send birthday messages
          for (const user of users) {
            try {
              const year = user.birthday?.year || 2000;
              const age = currentYear - year;

              await announcementsChannel.send({
                content: `<@&${UPDATES_ROLE_ID}> Happy Birthday <@${user.userId}>! 🎉🎂🎈\nWishing you an amazing ${age}th birthday!`,
                allowedMentions: {
                  roles: [UPDATES_ROLE_ID], // Note: Role needs to exist in this guild!
                  users: [user.userId],
                },
              });

              // Update lastBirthdayWish to current year
              await client.mutation(api.users.markBirthdayWished, {
                guildId: guild.id,
                userId: user.userId,
                year: currentYear,
              });

              console.log(
                `[BIRTHDAY] Sent birthday wish to user ${user.userId} (age ${age}) in ${guild.name}`
              );
            } catch (error) {
              console.error(
                `[BIRTHDAY] Error sending birthday message for user ${user.userId} in ${guild.name}:`,
                error
              );
            }
          }
        } catch (guildError) {
          console.error(
            `[BIRTHDAY] Error processing guild ${guild.id}:`,
            guildError
          );
        }
      }
    } catch (error) {
      console.error("[BIRTHDAY] Error in birthday check:", error);
    }
  });

  console.log(
    "[BIRTHDAY] Birthday handler initialized. Daily check scheduled for midnight."
  );
};
