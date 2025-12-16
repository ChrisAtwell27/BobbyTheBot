const { EmbedBuilder } = require('discord.js');
const { api } = require('../convex/_generated/api');
const { getConvexClient } = require('../utils/convexClient');

/**
 * Setup Reminder Handler
 * Periodically checks for servers without configured settings and DMs owners
 */

// Track which owners we've already DM'd to avoid spam
// Key: `${guildId}_${ownerId}`, Value: timestamp of last DM
const dmSentCache = new Map();

// Don't DM the same owner more than once per week
const DM_COOLDOWN = 7 * 24 * 60 * 60 * 1000; // 7 days

// Delay before first check after bot starts
const STARTUP_DELAY = 60 * 1000; // 1 minute

// How often to check for unconfigured servers
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if settings object is empty or effectively unconfigured
 */
function isSettingsEmpty(settings) {
  if (!settings) return true;
  if (typeof settings !== 'object') return true;

  // Check if it's an empty object {}
  const keys = Object.keys(settings);
  if (keys.length === 0) return true;

  // Check if all values are empty/null/undefined
  const hasAnyValue = keys.some(key => {
    const value = settings[key];
    if (value === null || value === undefined) return false;
    if (typeof value === 'object' && Object.keys(value).length === 0) return false;
    return true;
  });

  return !hasAnyValue;
}

/**
 * Create the setup reminder embed
 */
function createSetupReminderEmbed(guildName) {
  return new EmbedBuilder()
    .setColor(0xFF6B35)
    .setTitle('⚙️ Complete Your Bobby Bot Setup!')
    .setDescription(
      `Hey there! I noticed that **${guildName}** hasn't been fully configured yet.\n\n` +
      `To unlock all of Bobby's features and customize the bot for your server, please visit our dashboard!`
    )
    .addFields(
      {
        name: '🔗 Setup Dashboard',
        value: '**[crackedgames.co/bobby-the-bot](https://crackedgames.co/bobby-the-bot)**',
        inline: false
      },
      {
        name: '✨ What You Can Configure',
        value: [
          '• **Channels** - Set up lottery, betting, trivia, and more',
          '• **Features** - Enable/disable gambling, moderation, valorant tools',
          '• **Roles** - Configure notification roles and permissions',
          '• **Admin Roles** - Set which roles can manage the bot',
        ].join('\n'),
        inline: false
      },
      {
        name: '🎮 Popular Features',
        value: [
          '• 🎰 Casino & Gambling system',
          '• 🎫 Weekly Lottery',
          '• 🎯 Valorant Team Builder & Stats',
          '• 🧩 Daily Wordle & Trivia',
          '• 🕵️ Mafia Game',
          '• 🛒 Server Economy & Shop',
        ].join('\n'),
        inline: false
      }
    )
    .setFooter({ text: 'Weekly reminder until setup is complete' })
    .setTimestamp();
}

/**
 * Check all guilds for unconfigured settings
 */
async function checkAllGuilds(client) {
  console.log('[Setup Reminder] 🔍 Checking for unconfigured servers...');

  let convex;
  try {
    convex = getConvexClient();
  } catch (error) {
    console.error('[Setup Reminder] Failed to get Convex client:', error.message);
    return;
  }

  let checkedCount = 0;
  let remindersSent = 0;

  for (const guild of client.guilds.cache.values()) {
    checkedCount++;

    const guildId = guild.id;
    const ownerId = guild.ownerId;
    const cacheKey = `${guildId}_${ownerId}`;

    // Check if we've already DM'd this owner recently
    const lastDm = dmSentCache.get(cacheKey);
    if (lastDm && Date.now() - lastDm < DM_COOLDOWN) {
      continue;
    }

    try {
      // Query the server settings from Convex
      const server = await convex.query(api.servers.getServer, { guildId });

      // Check if settings are empty/unconfigured
      if (!server || isSettingsEmpty(server.settings)) {
        try {
          const owner = await guild.fetchOwner();

          if (!owner || owner.user.bot) {
            continue;
          }

          const embed = createSetupReminderEmbed(guild.name);

          await owner.send({ embeds: [embed] });

          // Mark that we've DM'd this owner
          dmSentCache.set(cacheKey, Date.now());
          remindersSent++;

          console.log(`[Setup Reminder] 📬 Sent setup reminder to ${owner.user.tag} for server "${guild.name}"`);

          // Small delay between DMs to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (dmError) {
          if (dmError.code !== 50007) {
            console.log(`[Setup Reminder] Could not DM owner of "${guild.name}": ${dmError.message}`);
          }
        }
      }
    } catch (error) {
      console.error(`[Setup Reminder] Error checking guild ${guild.name}:`, error.message);
    }
  }

  console.log(`[Setup Reminder] ✅ Checked ${checkedCount} servers, sent ${remindersSent} reminders`);
}

module.exports = (client) => {
  console.log('[Setup Reminder] Handler initialized');

  // Run initial check after startup delay
  setTimeout(() => {
    checkAllGuilds(client);
  }, STARTUP_DELAY);

  // Run periodic checks every 24 hours
  const intervalId = setInterval(() => {
    checkAllGuilds(client);
  }, CHECK_INTERVAL);

  // Store interval for cleanup
  if (!global.setupReminderIntervals) {
    global.setupReminderIntervals = [];
  }
  global.setupReminderIntervals.push(intervalId);
};
