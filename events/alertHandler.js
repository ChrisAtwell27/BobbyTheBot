const { EmbedBuilder } = require("discord.js");

const { CleanupMap } = require("../utils/memoryUtils");
const { getSetting } = require("../utils/settingsManager");

module.exports = (client, alertKeywords, legacyAlertChannelId) => {
  // Rate limiting: Track alerts to prevent spam with automatic cleanup
  // CleanupMap automatically removes expired entries and auto-registers for graceful shutdown
  const COOLDOWN_MS = 60000; // 1 minute cooldown per user per keyword
  const alertCooldowns = new CleanupMap(COOLDOWN_MS, 60000); // Auto-cleanup every 1 minute

  // Validation on initialization
  // We allow alertChannelId to be missing here if it's configured dynamically per guild
  if (!Array.isArray(alertKeywords) || alertKeywords.length === 0) {
    console.error(
      "⚠️ Alert Handler: alertKeywords must be a non-empty array. Handler disabled."
    );
    return;
  }

  console.log(
    `🔔 Alert Handler initialized with ${alertKeywords?.length || 0} keywords`
  );

  client.on("messageCreate", async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Only run in guilds
    if (!message.guild) return;

    // Ignore empty messages
    if (!message.content || !message.content.trim()) return;

    // Check if alerts are enabled
    const features = await getSetting(message.guild.id, "features", {});
    // Default to true if not specified (legacy behavior)
    if (features.alerts === false) return;

    // Get alert channel (prefer dynamic setting, fallback to legacy config)
    const alertChannelId = await getSetting(
      message.guild.id,
      "channels.alerts",
      legacyAlertChannelId
    );

    if (!alertChannelId) {
      // Silent return if no channel configured
      return;
    }

    const alertChannel = client.channels.cache.get(alertChannelId);
    if (!alertChannel) {
      // Channel configured but not found (deleted? bot lacks access?)
      // console.warn(`❌ Alert channel with ID ${alertChannelId} not found in guild ${message.guild.name}.`);
      return;
    }

    // Check for keyword matches
    const foundKeywords = alertKeywords.filter((keyword) => {
      try {
        // Escape special regex characters in keyword
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escapedKeyword}\\b`, "i");
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
          .setColor(0xff0000) // Red color
          .setTitle("🚨 Keyword Alert")
          .setDescription(`The keyword "**${foundKeyword}**" was detected`)
          .addFields(
            {
              name: "👤 User",
              value: `${message.author} (${message.author.tag})`,
              inline: true,
            },
            { name: "📍 Channel", value: `${message.channel}`, inline: true },
            {
              name: "🕒 Time",
              value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`,
              inline: true,
            },
            {
              name: "💬 Message Content",
              value:
                message.content.length > 1024
                  ? message.content.substring(0, 1021) + "..."
                  : message.content,
              inline: false,
            }
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
          components: [
            {
              type: 1, // Action row
              components: [
                {
                  type: 2, // Button
                  style: 5, // Link button
                  label: "Jump to Message",
                  url: messageLink,
                },
              ],
            },
          ],
        });

        console.log(
          `🚨 Alert sent: "${foundKeyword}" by ${message.author.tag} in #${message.channel.name}`
        );
      } catch (error) {
        console.error(
          `Error sending alert for keyword "${foundKeyword}":`,
          error
        );
      }
    }
  });
};
