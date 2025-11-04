// alertHandler.js
const { EmbedBuilder, Collection } = require('discord.js');
const { TARGET_GUILD_ID } = require('../config/guildConfig');

module.exports = (client, alertKeywords, alertChannelId) => {
  // Rate limiting: Track alerts to prevent spam
  const alertCooldowns = new Collection();
  const COOLDOWN_MS = 60000; // 1 minute cooldown per user per keyword

  // Validation on initialization
  let isValidConfig = true;

  if (!Array.isArray(alertKeywords) || alertKeywords.length === 0) {
    console.error('⚠️ Alert Handler: alertKeywords must be a non-empty array. Handler disabled.');
    isValidConfig = false;
  }

  if (!alertChannelId) {
    console.error('⚠️ Alert Handler: alertChannelId is not configured. Handler disabled.');
    isValidConfig = false;
  }

  console.log(`🔔 Alert Handler initialized with ${alertKeywords?.length || 0} keywords`);

  client.on('messageCreate', async (message) => {
    // Skip if config is invalid
    if (!isValidConfig) return;

    // Ignore messages from bots
    if (message.author.bot) return;

    // Only run in target guild
    if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

    // Ignore DMs
    if (!message.guild) return;

    // Ignore empty messages
    if (!message.content || !message.content.trim()) return;

    // Get alert channel (check on each message in case it was created after bot startup)
    const alertChannel = client.channels.cache.get(alertChannelId);
    if (!alertChannel) {
      console.error(`❌ Alert channel with ID ${alertChannelId} not found.`);
      return;
    }

    // Check for keyword matches
    const foundKeywords = alertKeywords.filter((keyword) => {
      try {
        // Escape special regex characters in keyword
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
        return regex.test(message.content);
      } catch (error) {
        console.error(`Error creating regex for keyword "${keyword}":`, error);
        return false;
      }
    });

    // Process each found keyword
    for (const foundKeyword of foundKeywords) {
      // Check cooldown
      const cooldownKey = `${message.author.id}-${foundKeyword}`;
      const lastAlert = alertCooldowns.get(cooldownKey);
      const now = Date.now();

      if (lastAlert && now - lastAlert < COOLDOWN_MS) {
        continue; // Skip if on cooldown
      }

      // Update cooldown
      alertCooldowns.set(cooldownKey, now);

      try {
        // Create embed for alert
        const embed = new EmbedBuilder()
          .setColor(0xFF0000) // Red color
          .setTitle('🚨 Keyword Alert')
          .setDescription(`The keyword "**${foundKeyword}**" was detected`)
          .addFields(
            { name: '👤 User', value: `${message.author} (${message.author.tag})`, inline: true },
            { name: '📍 Channel', value: `${message.channel}`, inline: true },
            { name: '🕒 Time', value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`, inline: true },
            { name: '💬 Message Content', value: message.content.length > 1024 ? message.content.substring(0, 1021) + '...' : message.content, inline: false }
          )
          .setTimestamp()
          .setFooter({ text: `User ID: ${message.author.id}` });

        // Add thumbnail if user has avatar
        if (message.author.displayAvatarURL) {
          embed.setThumbnail(message.author.displayAvatarURL());
        }

        // Add message link button if possible
        const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;

        await alertChannel.send({
          content: `🚨 **Keyword Alert:** \`${foundKeyword}\``,
          embeds: [embed],
          components: [{
            type: 1, // Action row
            components: [{
              type: 2, // Button
              style: 5, // Link button
              label: 'Jump to Message',
              url: messageLink
            }]
          }]
        });

        console.log(`🚨 Alert sent: "${foundKeyword}" by ${message.author.tag} in #${message.channel.name}`);

      } catch (error) {
        console.error(`Error sending alert for keyword "${foundKeyword}":`, error);
      }
    }
  });

  // Cleanup old cooldowns every 5 minutes
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, timestamp] of alertCooldowns.entries()) {
      if (now - timestamp > COOLDOWN_MS) {
        alertCooldowns.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} alert cooldowns`);
    }
  }, 5 * 60 * 1000);
};
