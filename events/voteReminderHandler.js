/**
 * Vote Reminder Handler
 * Sends weekly reminders to vote for the bot on top.gg
 * Configurable via settings - can be enabled/disabled per server
 */

const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const cron = require("node-cron");
const { getSetting, setSetting } = require("../utils/settingsManager");

// Vote link
const VOTE_URL = "https://top.gg/bot/1276247875063513098/vote";

// Store active guilds with vote reminders enabled
const activeGuilds = new Map();

// Store interval reference for cleanup
let cronTask = null;

module.exports = (client) => {
  console.log("🗳️ Vote Reminder Handler initialized");

  // =====================================================================
  // SCHEDULED REMINDER - Every Sunday at 12 PM (noon)
  // =====================================================================
  cronTask = cron.schedule("0 12 * * 0", async () => {
    console.log("🗳️ Sending weekly vote reminders...");

    for (const [guildId, channelId] of activeGuilds) {
      try {
        await sendVoteReminder(guildId, channelId);
      } catch (error) {
        console.error(`Vote reminder failed for guild ${guildId}:`, error);
      }
    }
  });

  // Store for cleanup
  global.voteReminderIntervals = global.voteReminderIntervals || [];
  global.voteReminderIntervals.push(cronTask);

  /**
   * Send vote reminder to a channel
   */
  async function sendVoteReminder(guildId, channelId) {
    // Double-check if still enabled
    const enabled = await getSetting(guildId, "features.voteReminder", false);
    if (!enabled) {
      activeGuilds.delete(guildId);
      return;
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle("🗳️ Vote for Bobby!")
      .setColor(0x5865F2) // Discord Blurple
      .setDescription(
        `**Help Bobby grow by voting on top.gg!**\n\n` +
        `Your vote helps more people discover Bobby and keeps our community thriving! 🐝\n\n` +
        `Voting takes just a few seconds and makes a huge difference!`
      )
      .addFields({
        name: "🔗 Vote Now",
        value: `**[Click here to vote!](${VOTE_URL})**`,
        inline: false,
      })
      .setFooter({
        text: "Thank you for supporting Bobby! 💛",
      })
      .setTimestamp()
      .setThumbnail(client.user.displayAvatarURL());

    await channel.send({ embeds: [embed] });
    console.log(`  ✓ Vote reminder sent to ${guild.name}`);
  }

  // =====================================================================
  // MESSAGE HANDLER - Setup commands
  // =====================================================================
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.toLowerCase();

    // !votereminder or !vote commands
    if (content.startsWith("!votereminder") || content === "!vote setup" || content === "!vote disable") {
      const args = message.content.split(/ +/).slice(1);
      const subcommand = args[0]?.toLowerCase();

      // Check admin permission
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply("❌ You need Administrator permission to manage vote reminders.");
      }

      if (subcommand === "enable" || subcommand === "setup" || content === "!vote setup") {
        // Enable vote reminders
        const channel = message.mentions.channels.first() || message.channel;

        // Save to settings
        await setSetting(message.guild.id, "features.voteReminder", true);
        await setSetting(message.guild.id, "channels.voteReminder", channel.id);

        // Add to active guilds
        activeGuilds.set(message.guild.id, channel.id);

        const embed = new EmbedBuilder()
          .setTitle("✅ Vote Reminders Enabled")
          .setColor(0x00FF00)
          .setDescription(
            `Weekly vote reminders will be sent to ${channel}.\n\n` +
            `**Schedule:** Every Sunday at 12:00 PM\n\n` +
            `Use \`!votereminder disable\` to turn off.`
          );

        await message.reply({ embeds: [embed] });

      } else if (subcommand === "disable" || content === "!vote disable") {
        // Disable vote reminders
        await setSetting(message.guild.id, "features.voteReminder", false);
        activeGuilds.delete(message.guild.id);

        await message.reply("✅ Vote reminders have been disabled.");

      } else if (subcommand === "test") {
        // Send a test reminder
        const channelId = await getSetting(message.guild.id, "channels.voteReminder", message.channel.id);
        await sendVoteReminder(message.guild.id, channelId);
        await message.reply("✅ Test vote reminder sent!");

      } else if (subcommand === "status") {
        // Check status
        const enabled = await getSetting(message.guild.id, "features.voteReminder", false);
        const channelId = await getSetting(message.guild.id, "channels.voteReminder", null);

        const embed = new EmbedBuilder()
          .setTitle("🗳️ Vote Reminder Status")
          .setColor(enabled ? 0x00FF00 : 0xFF0000)
          .addFields(
            { name: "Status", value: enabled ? "✅ Enabled" : "❌ Disabled", inline: true },
            { name: "Channel", value: channelId ? `<#${channelId}>` : "Not set", inline: true }
          );

        await message.reply({ embeds: [embed] });

      } else {
        // Show help
        const embed = new EmbedBuilder()
          .setTitle("🗳️ Vote Reminder Commands")
          .setColor(0x5865F2)
          .setDescription(
            `**Commands:**\n` +
            `\`!votereminder enable [#channel]\` - Enable weekly vote reminders\n` +
            `\`!votereminder disable\` - Disable vote reminders\n` +
            `\`!votereminder status\` - Check current status\n` +
            `\`!votereminder test\` - Send a test reminder\n\n` +
            `**Schedule:** Every Sunday at 12:00 PM`
          );

        await message.reply({ embeds: [embed] });
      }
      return;
    }

    // Simple !vote command - show vote link
    if (content === "!vote") {
      const embed = new EmbedBuilder()
        .setTitle("🗳️ Vote for Bobby!")
        .setColor(0x5865F2)
        .setDescription(
          `**Support Bobby by voting on top.gg!**\n\n` +
          `**[Click here to vote!](${VOTE_URL})**\n\n` +
          `Your vote helps Bobby reach more servers! 🐝`
        )
        .setThumbnail(client.user.displayAvatarURL());

      await message.reply({ embeds: [embed] });
    }
  });

  // =====================================================================
  // STARTUP - Load active vote reminder channels
  // =====================================================================
  client.once("ready", async () => {
    console.log("🗳️ Loading active vote reminder channels...");

    for (const guild of client.guilds.cache.values()) {
      try {
        const enabled = await getSetting(guild.id, "features.voteReminder", false);
        const channelId = await getSetting(guild.id, "channels.voteReminder", null);

        if (enabled && channelId) {
          activeGuilds.set(guild.id, channelId);
          console.log(`  ✓ Vote reminder active in ${guild.name}`);
        }
      } catch (error) {
        // Ignore errors for guilds without vote reminders
      }
    }

    console.log(`🗳️ ${activeGuilds.size} guilds with active vote reminders`);
  });
};
