const { getConvexClient } = require('../database/convexClient');
const { api } = require('../convex/_generated/api');
const { checkSubscription, TIERS } = require('../utils/subscriptionUtils');
const { getSetting } = require('../utils/settingsManager');

// Cache for logging channel IDs per guild (refreshed every 5 minutes)
const loggingChannelCache = new Map();
// Cache for subscription status per guild (refreshed every 5 minutes)
const subscriptionCache = new Map();
// Cache for feature toggle status per guild
const featureToggleCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getLoggingChannelId(guildId) {
  const cached = loggingChannelCache.get(guildId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.channelId;
  }

  try {
    const client = getConvexClient();
    const server = await client.query(api.servers.getServer, { guildId });
    const channelId = server?.settings?.loggingChannelId || null;

    loggingChannelCache.set(guildId, { channelId, timestamp: Date.now() });
    return channelId;
  } catch (error) {
    console.error('Error fetching logging channel:', error);
    return null;
  }
}

// Check if audit logs feature is enabled for guild (cached)
async function isAuditLogsEnabled(guildId) {
  const cached = featureToggleCache.get(guildId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.enabled;
  }

  try {
    const features = await getSetting(guildId, 'features', {});
    // Default to true if not specified (legacy behavior for existing guilds)
    const enabled = features.audit_logs !== false;
    featureToggleCache.set(guildId, { enabled, timestamp: Date.now() });
    return enabled;
  } catch (error) {
    console.error('Error checking audit_logs feature toggle:', error);
    return true; // Default to enabled on error
  }
}

// Check if guild has Plus tier (cached to avoid spamming subscription checks)
async function hasLoggingAccess(guildId) {
  // First check if feature is toggled on
  if (!await isAuditLogsEnabled(guildId)) return false;

  const cached = subscriptionCache.get(guildId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.hasAccess;
  }

  try {
    const result = await checkSubscription(guildId, TIERS.PLUS);
    subscriptionCache.set(guildId, { hasAccess: result.hasAccess, timestamp: Date.now() });
    return result.hasAccess;
  } catch (error) {
    console.error('Error checking subscription for logging:', error);
    return false;
  }
}

module.exports = (client, fallbackLoggingChannelId) => {
    client.on('messageDelete', async message => {
      try {
        // Fetch partial messages to get full data
        if (message.partial) {
          try {
            await message.fetch();
          } catch (error) {
            console.error('Failed to fetch partial deleted message:', error);
            return;
          }
        }

        // Check if message has author (webhook messages may not)
        if (!message.author) {
          return;
        }

        // Only log in guilds
        if (!message.guild) return;

        // Check subscription - Audit Logs require Plus tier
        if (!await hasLoggingAccess(message.guild.id)) return;

        // Get guild-specific logging channel
        const loggingChannelId = await getLoggingChannelId(message.guild.id) || fallbackLoggingChannelId;
        if (!loggingChannelId) return;

        const logChannel = client.channels.cache.get(loggingChannelId);
        // Verify the log channel belongs to the same guild
        if (logChannel && logChannel.guild?.id === message.guild.id) {
          logChannel.send(`# 🗑️ A message by ${message.author.tag} was deleted in ${message.channel.name}: "${message.content}"`);
        }
      } catch (error) {
        console.error('Error in messageDelete handler:', error);
      }
    });

    client.on('messageUpdate', async (oldMessage, newMessage) => {
      try {
        // Fetch partial messages to get full data
        if (oldMessage.partial) {
          try {
            await oldMessage.fetch();
          } catch (error) {
            console.error('Failed to fetch partial old message:', error);
            return;
          }
        }
        if (newMessage.partial) {
          try {
            await newMessage.fetch();
          } catch (error) {
            console.error('Failed to fetch partial new message:', error);
            return;
          }
        }

        // Check if messages have authors (webhook messages may not)
        if (!oldMessage.author || !newMessage.author) {
          return;
        }

        // Only log in guilds
        if (!oldMessage.guild) return;

        // Check subscription - Audit Logs require Plus tier
        if (!await hasLoggingAccess(oldMessage.guild.id)) return;

        // Only log if content actually changed
        if (oldMessage.content !== newMessage.content) {
          // Get guild-specific logging channel
          const loggingChannelId = await getLoggingChannelId(oldMessage.guild.id) || fallbackLoggingChannelId;
          if (!loggingChannelId) return;

          const logChannel = client.channels.cache.get(loggingChannelId);
          // Verify the log channel belongs to the same guild
          if (logChannel && logChannel.guild?.id === oldMessage.guild.id) {
            logChannel.send(`# ✏️ A message by ${oldMessage.author.tag} was edited in ${oldMessage.channel.name}:\n**Before:** ${oldMessage.content}\n**After:** ${newMessage.content}`);
          }
        }
      } catch (error) {
        console.error('Error in messageUpdate handler:', error);
      }
    });

    client.on('guildBanAdd', async ban => {
      try {
        // Check subscription - Audit Logs require Plus tier
        if (!await hasLoggingAccess(ban.guild.id)) return;

        // Get guild-specific logging channel
        const loggingChannelId = await getLoggingChannelId(ban.guild.id) || fallbackLoggingChannelId;
        if (!loggingChannelId) return;

        const logChannel = client.channels.cache.get(loggingChannelId);
        // Verify the log channel belongs to the same guild
        if (logChannel && logChannel.guild?.id === ban.guild.id) {
          logChannel.send(`# ⛔ User ${ban.user.tag} was banned.`);
        }
      } catch (error) {
        console.error('Error in guildBanAdd handler:', error);
      }
    });

    client.on('guildBanRemove', async ban => {
      try {
        // Check subscription - Audit Logs require Plus tier
        if (!await hasLoggingAccess(ban.guild.id)) return;

        // Get guild-specific logging channel
        const loggingChannelId = await getLoggingChannelId(ban.guild.id) || fallbackLoggingChannelId;
        if (!loggingChannelId) return;

        const logChannel = client.channels.cache.get(loggingChannelId);
        // Verify the log channel belongs to the same guild
        if (logChannel && logChannel.guild?.id === ban.guild.id) {
          logChannel.send(`# ✅ User ${ban.user.tag} was unbanned.`);
        }
      } catch (error) {
        console.error('Error in guildBanRemove handler:', error);
      }
    });
  };
  