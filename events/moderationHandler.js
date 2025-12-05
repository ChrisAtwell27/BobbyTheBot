const { Collection, PermissionsBitField, EmbedBuilder } = require("discord.js");
// TARGET_GUILD_ID removed
const { LimitedMap } = require("../utils/memoryUtils");
const { hasAdminPermission } = require("../utils/adminPermissions");

module.exports = (client) => {
  // Configuration options
  const config = {
    deadRoleName: "dead.",
    graveyardChannelName: "the-graveyard",
    spamThreshold: 2, // Number of channels for spam detection
    timeWindow: 30000, // 30 seconds window
    maxWarnings: 3,
    logChannelId: null, // Set this to your log channel ID if you want logging
    // Admin roles now configured per-server via settings (adminRoles setting)
    messageRateLimit: 10, // Max messages per timeWindow
    duplicateMessageThreshold: 3, // How many duplicate messages trigger action
    maxTrackedUsers: 500, // Maximum users to track to prevent memory leaks
  };

  // Track user messages for spam detection using LimitedMap to prevent unbounded growth
  const userMessages = new LimitedMap(config.maxTrackedUsers);
  const userWarnings = new LimitedMap(config.maxTrackedUsers);
  const userMessageCount = new LimitedMap(config.maxTrackedUsers);

  console.log("🛡️ Moderation Handler initialized with enhanced spam detection");

  // Listen for messages
  client.on("messageCreate", async (message) => {
    // Ignore bots and system messages
    if (message.author.bot || message.system) return;

    // Only run in guilds
    if (!message.guild) return;

    // Check if user is exempt from moderation
    if (await isExemptFromModeration(message.member)) return;

    // Ignore commands (messages starting with !)
    if (message.content.startsWith("!")) return;

    // Ignore empty messages or messages with only embeds/attachments
    if (!message.content.trim()) return;

    try {
      // Check for rate limiting
      await checkMessageRateLimit(message);

      // Check for spam patterns
      await checkForSpam(message);
    } catch (error) {
      console.error("Error in moderation handler:", error);
    }
  });

  // Clean up old message data every 5 minutes
  const cleanupInterval = setInterval(
    () => {
      cleanupOldData();
    },
    5 * 60 * 1000
  );

  // Store interval ID for potential cleanup
  if (!global.moderationHandlerIntervals)
    global.moderationHandlerIntervals = [];
  global.moderationHandlerIntervals.push(cleanupInterval);

  // Check if user is exempt from moderation (async version)
  async function isExemptFromModeration(member) {
    if (!member) return false;

    // Check if user has configured admin permissions
    const guildId = member.guild.id;
    const isAdmin = await hasAdminPermission(member, guildId);
    return isAdmin;
  }

  // Check message rate limiting
  async function checkMessageRateLimit(message) {
    const userId = message.author.id;
    const currentTime = Date.now();

    if (!userMessageCount.has(userId)) {
      userMessageCount.set(userId, []);
    }

    const timestamps = userMessageCount.get(userId);

    // Remove timestamps outside the time window
    const recentTimestamps = timestamps.filter(
      (time) => currentTime - time <= config.timeWindow
    );

    recentTimestamps.push(currentTime);
    userMessageCount.set(userId, recentTimestamps);

    // Check if user exceeded message rate limit
    if (recentTimestamps.length > config.messageRateLimit) {
      await handleRateLimitViolation(message);
    }
  }

  // Handle rate limit violations
  async function handleRateLimitViolation(message) {
    try {
      const embed = new EmbedBuilder()
        .setColor(0xffa500) // Orange
        .setTitle("⚠️ Message Rate Limit")
        .setDescription(
          `${message.author}, please slow down! You're sending messages too quickly.`
        )
        .addFields(
          { name: "🚫 Action", value: "Messages deleted", inline: true },
          { name: "⏱️ Cooldown", value: "30 seconds", inline: true }
        )
        .setTimestamp()
        .setFooter({ text: "Spam Prevention System" });

      const warningMsg = await message.channel.send({ embeds: [embed] });

      // Delete the warning after 5 seconds
      setTimeout(() => {
        warningMsg.delete().catch(console.error);
      }, 5000);

      // Delete the spam message
      await message.delete().catch(console.error);

      console.log(
        `⚠️ Rate limit: ${message.author.tag} exceeded message limit`
      );
    } catch (error) {
      console.error("Error handling rate limit violation:", error);
    }
  }

  // Function to check for spam
  async function checkForSpam(message) {
    const userId = message.author.id;
    const messageContent = message.content.toLowerCase().trim();
    const currentTime = Date.now();

    // Initialize user data if doesn't exist
    if (!userMessages.has(userId)) {
      userMessages.set(userId, []);
    }

    const userMessageHistory = userMessages.get(userId);

    // Add current message to history
    userMessageHistory.push({
      content: messageContent,
      channelId: message.channel.id,
      messageId: message.id,
      timestamp: currentTime,
      message: message,
    });

    // Remove old messages outside time window
    const recentMessages = userMessageHistory.filter(
      (msg) => currentTime - msg.timestamp <= config.timeWindow
    );

    userMessages.set(userId, recentMessages);

    // Check for spam (same message in multiple channels)
    const duplicateMessages = recentMessages.filter(
      (msg) => msg.content === messageContent
    );
    const uniqueChannels = new Set(
      duplicateMessages.map((msg) => msg.channelId)
    );

    if (uniqueChannels.size >= config.spamThreshold) {
      await handleSpamDetection(message, duplicateMessages);
    }
  }

  // Function to handle spam detection
  async function handleSpamDetection(triggerMessage, duplicateMessages) {
    const user = triggerMessage.author;
    const guild = triggerMessage.guild;

    try {
      // Delete all duplicate messages
      const deletedChannels = new Set();
      for (const msgData of duplicateMessages) {
        try {
          const channel = guild.channels.cache.get(msgData.channelId);
          if (channel && msgData.message) {
            await msgData.message.delete();
            deletedChannels.add(channel.name);
          }
        } catch (deleteError) {
          console.error(
            `Failed to delete message in channel ${msgData.channelId}:`,
            deleteError
          );
        }
      }

      // Give user the Dead. role
      await assignDeadRole(guild.members.cache.get(user.id));

      // Log the action
      await logModerationAction({
        type: "SPAM_DETECTION",
        user: user,
        reason: `Sent same message in ${deletedChannels.size} channels: "${duplicateMessages[0].content.substring(0, 100)}..."`,
        channels: Array.from(deletedChannels),
        guild: guild,
      });

      // Clear user's message history to prevent multiple triggers
      userMessages.delete(user.id);

      console.log(
        `🚨 Spam detected: ${user.tag} sent duplicate messages across ${deletedChannels.size} channels`
      );
    } catch (error) {
      console.error("Error handling spam detection:", error);
    }
  }

  // Function to assign Dead. role
  async function assignDeadRole(member) {
    if (!member) return false;

    try {
      // Find the Dead. role
      let deadRole = member.guild.roles.cache.find(
        (role) => role.name === config.deadRoleName
      );

      // Create the role if it doesn't exist
      if (!deadRole) {
        deadRole = await createDeadRole(member.guild);
      }

      // Check if user already has the role
      if (member.roles.cache.has(deadRole.id)) {
        return false;
      }

      // Add the role
      await member.roles.add(deadRole, "Moderation: Spam detection");

      // Send notification to graveyard channel
      try {
        const graveyardChannel = member.guild.channels.cache.find(
          (channel) => channel.name === config.graveyardChannelName
        );

        if (graveyardChannel && graveyardChannel.isTextBased()) {
          const embed = new EmbedBuilder()
            .setColor(0xff6b6b)
            .setTitle("💀 Welcome to the Graveyard")
            .setDescription(
              `**${member.user.tag}** has been given the "${config.deadRoleName}" role for spam behavior.`
            )
            .addFields(
              {
                name: "⚠️ Reason",
                value: "Sending identical messages across multiple channels",
                inline: false,
              },
              {
                name: "📞 Appeal Process",
                value: "Contact a moderator if you believe this was a mistake",
                inline: false,
              },
              {
                name: "🔄 Next Steps",
                value:
                  "Please review the server rules and wait for a moderator to assist you",
                inline: false,
              }
            )
            .setTimestamp()
            .setFooter({ text: "Moderation System" });

          if (member.user.displayAvatarURL) {
            embed.setThumbnail(member.user.displayAvatarURL());
          }

          await graveyardChannel.send({
            content: `${member.user}`, // Ping the user so they see it
            embeds: [embed],
          });
        } else {
          console.log(
            `Could not find graveyard channel: ${config.graveyardChannelName}`
          );
        }
      } catch (graveyardError) {
        console.error(
          `Could not send message to graveyard channel:`,
          graveyardError
        );
      }

      return true;
    } catch (error) {
      console.error("Error assigning dead role:", error);
      return false;
    }
  }

  // Function to create Dead. role
  async function createDeadRole(guild) {
    try {
      const deadRole = await guild.roles.create({
        name: config.deadRoleName,
        color: "#2C2C2C", // Dark gray color
        reason: "Moderation: Auto-created dead role",
        permissions: [],
      });

      // Update channel permissions to restrict the dead role
      for (const [channelId, channel] of guild.channels.cache) {
        if (
          channel.isTextBased() &&
          channel
            .permissionsFor(guild.members.me)
            .has(PermissionsBitField.Flags.ManageChannels)
        ) {
          try {
            await channel.permissionOverwrites.create(deadRole, {
              SendMessages: false,
              AddReactions: false,
              CreatePublicThreads: false,
              CreatePrivateThreads: false,
              SendMessagesInThreads: false,
            });
          } catch (permError) {
            console.error(
              `Could not update permissions for channel ${channel.name}:`,
              permError
            );
          }
        }
      }

      console.log(`✅ Created dead role: ${config.deadRoleName}`);
      return deadRole;
    } catch (error) {
      console.error("Error creating dead role:", error);
      throw error;
    }
  }

  // Function to log moderation actions
  async function logModerationAction(data) {
    const { type, user, reason, channels, guild } = data;

    // Console log
    console.log(`📋 Moderation Action: ${type} - ${user.tag} - ${reason}`);

    // Try to log to specified channel
    if (config.logChannelId) {
      try {
        const logChannel = guild.channels.cache.get(config.logChannelId);
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setColor(0xff6b6b) // Red color
            .setTitle("🛡️ Moderation Action")
            .addFields(
              { name: "Action", value: type, inline: true },
              { name: "User", value: `${user.tag} (${user.id})`, inline: true },
              { name: "Reason", value: reason, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: "Moderation Handler" });

          if (channels && channels.length > 0) {
            embed.addFields({
              name: "Affected Channels",
              value: channels.join(", "),
              inline: false,
            });
          }

          await logChannel.send({ embeds: [embed] });
        }
      } catch (logError) {
        console.error("Error sending log message:", logError);
      }
    }
  }

  // Function to clean up old data
  function cleanupOldData() {
    const currentTime = Date.now();
    let cleanedUsers = 0;

    // Clean up message history
    for (const [userId, messages] of userMessages) {
      const recentMessages = messages.filter(
        (msg) => currentTime - msg.timestamp <= config.timeWindow
      );

      if (recentMessages.length === 0) {
        userMessages.delete(userId);
        cleanedUsers++;
      } else {
        userMessages.set(userId, recentMessages);
      }
    }

    // Clean up message count tracking
    for (const [userId, timestamps] of userMessageCount) {
      const recentTimestamps = timestamps.filter(
        (time) => currentTime - time <= config.timeWindow
      );

      if (recentTimestamps.length === 0) {
        userMessageCount.delete(userId);
      } else {
        userMessageCount.set(userId, recentTimestamps);
      }
    }

    // Clean up user warnings - reset warnings older than 1 hour
    const warningExpiryTime = 60 * 60 * 1000; // 1 hour
    for (const [userId, warningData] of userWarnings) {
      // If warnings data includes timestamp, check expiry
      if (
        warningData &&
        typeof warningData === "object" &&
        warningData.timestamp
      ) {
        if (currentTime - warningData.timestamp > warningExpiryTime) {
          userWarnings.delete(userId);
        }
      } else if (typeof warningData === "number" && warningData === 0) {
        // Clean up users with zero warnings
        userWarnings.delete(userId);
      }
    }

    if (cleanedUsers > 0) {
      console.log(`🧹 Cleaned up data for ${cleanedUsers} users`);
    }
  }

  // Command to manually assign dead role and delete messages
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.author.bot) return;

    // Only run in guilds
    if (!message.guild) return;

    // EARLY RETURN: Skip if not a moderation command
    const content = message.content.toLowerCase();
    if (
      !content.startsWith("!dead") &&
      !content.startsWith("!undead") &&
      !content.startsWith("!modstats") &&
      !content.startsWith("!modhelp") &&
      !content.startsWith("!modconfig")
    )
      return;

    const args = message.content.split(" ");

    // Command to assign dead role and delete user messages
    if (args[0] === "!dead") {
      // Check if user has permission (admin or manage roles)
      if (
        !message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)
      ) {
        return message.channel.send(
          '❌ You need the "Manage Roles" permission to use this command.'
        );
      }

      let targetMember;
      if (args[1]) {
        const mentionedUser =
          message.mentions.users.first() ||
          message.guild.members.cache.find(
            (member) => member.user.username === args[1]
          )?.user;
        if (!mentionedUser) {
          return message.channel.send("❌ User not found.");
        }
        targetMember = message.guild.members.cache.get(mentionedUser.id);
      } else {
        return message.channel.send(
          "❌ Please mention a user or provide their username."
        );
      }

      if (!targetMember) {
        return message.channel.send(
          "❌ Could not find that member in this server."
        );
      }

      // Send initial status message
      const statusMsg = await message.channel.send(
        `🔄 Processing... This may take a moment.`
      );

      try {
        // Delete messages from the past 5 days
        const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
        let totalDeleted = 0;
        const channelsProcessed = [];

        const MAX_MESSAGES_PER_CHANNEL = 1000; // Safety limit per channel
        const OPERATION_TIMEOUT = 120000; // 2 minute timeout for entire operation
        const operationStart = Date.now();
        let totalMessagesFetched = 0;

        console.log(
          `[MODERATION] Starting dead command for user ${targetMember.user.tag} (${targetMember.id})`
        );

        for (const [channelId, channel] of message.guild.channels.cache) {
          // Safety check: timeout protection
          if (Date.now() - operationStart > OPERATION_TIMEOUT) {
            console.warn(
              `[MODERATION] Operation timeout after ${OPERATION_TIMEOUT}ms. Stopping early. Deleted ${totalDeleted} messages so far.`
            );
            await statusMsg.edit(
              `⚠️ Operation timed out after processing ${channelsProcessed.length} channels. Deleted ${totalDeleted} messages. Some channels may not have been processed.`
            );
            break;
          }

          if (
            channel.isTextBased() &&
            channel
              .permissionsFor(message.guild.members.me)
              .has(PermissionsBitField.Flags.ViewChannel)
          ) {
            try {
              let lastId;
              let messagesDeleted = 0;
              let keepFetching = true;
              let channelMessagesFetched = 0;

              console.log(
                `[MODERATION] Processing channel: ${channel.name} (${channel.id})`
              );

              while (keepFetching) {
                // Safety check: prevent infinite loops per channel
                if (channelMessagesFetched >= MAX_MESSAGES_PER_CHANNEL) {
                  console.warn(
                    `[MODERATION] Reached maximum fetch limit of ${MAX_MESSAGES_PER_CHANNEL} messages for channel ${channel.name}. Moving to next channel.`
                  );
                  break;
                }

                const options = { limit: 100 };
                if (lastId) options.before = lastId;

                const messages = await channel.messages.fetch(options);
                if (messages.size === 0) break;

                channelMessagesFetched += messages.size;
                totalMessagesFetched += messages.size;

                const userMessages = messages.filter(
                  (msg) =>
                    msg.author.id === targetMember.id &&
                    msg.createdTimestamp >= fiveDaysAgo
                );

                if (userMessages.size > 0) {
                  console.log(
                    `[MODERATION] Found ${userMessages.size} messages from user in channel ${channel.name}`
                  );
                  for (const msg of userMessages.values()) {
                    try {
                      await msg.delete();
                      messagesDeleted++;
                      totalDeleted++;
                      // Small delay to avoid rate limiting
                      await new Promise((resolve) => setTimeout(resolve, 100));
                    } catch (deleteErr) {
                      console.error(
                        `[MODERATION] Failed to delete message ${msg.id}:`,
                        deleteErr
                      );
                    }
                  }
                }

                // Check if oldest message is beyond 5 days
                const oldestMessage = messages.last();
                if (
                  oldestMessage &&
                  oldestMessage.createdTimestamp < fiveDaysAgo
                ) {
                  keepFetching = false;
                } else if (messages.size < 100) {
                  keepFetching = false;
                }

                lastId = messages.last()?.id;
              }

              if (messagesDeleted > 0) {
                channelsProcessed.push(`${channel.name} (${messagesDeleted})`);
                console.log(
                  `[MODERATION] Channel ${channel.name} complete: ${messagesDeleted} messages deleted, ${channelMessagesFetched} messages fetched`
                );
              }
            } catch (channelErr) {
              console.error(
                `[MODERATION] Error processing channel ${channel.name}:`,
                channelErr
              );
            }
          }
        }

        const operationDuration = (
          (Date.now() - operationStart) /
          1000
        ).toFixed(2);
        console.log(
          `[MODERATION] Dead command complete: ${totalDeleted} messages deleted across ${channelsProcessed.length} channels, ${totalMessagesFetched} total messages fetched in ${operationDuration}s`
        );

        // Assign the specific role
        let roleAssigned = false;
        try {
          const role = message.guild.roles.cache.get("756551561047572580");
          if (role) {
            await targetMember.roles.add(
              role,
              `Manual moderation by ${message.author.tag}`
            );
            roleAssigned = true;
          } else {
            console.error("Role 756551561047572580 not found");
          }
        } catch (roleErr) {
          console.error("Error assigning role:", roleErr);
        }

        // Update status message with results
        const embed = new EmbedBuilder()
          .setColor(0xff6b6b)
          .setTitle("💀 Dead Role Applied")
          .setDescription(
            `**${targetMember.user.tag}** has been given the dead role.`
          )
          .addFields(
            {
              name: "🗑️ Messages Deleted",
              value: `${totalDeleted} messages`,
              inline: true,
            },
            {
              name: "📁 Channels Affected",
              value: `${channelsProcessed.length} channels`,
              inline: true,
            },
            {
              name: "👤 Role Assigned",
              value: roleAssigned ? "✅ Yes" : "❌ Failed",
              inline: true,
            }
          )
          .setTimestamp()
          .setFooter({ text: `Executed by ${message.author.tag}` });

        if (channelsProcessed.length > 0 && channelsProcessed.length <= 10) {
          embed.addFields({
            name: "📋 Channel Details",
            value: channelsProcessed.join("\n"),
            inline: false,
          });
        }

        await statusMsg.edit({ content: null, embeds: [embed] });

        // Log the action
        await logModerationAction({
          type: "MANUAL_DEAD_ROLE",
          user: targetMember.user,
          reason: `Manually given dead role by ${message.author.tag}. ${totalDeleted} messages deleted from past 5 days.`,
          channels: channelsProcessed,
          guild: message.guild,
        });

        // Send notification to graveyard channel
        try {
          const graveyardChannel = message.guild.channels.cache.find(
            (channel) => channel.name === config.graveyardChannelName
          );

          if (graveyardChannel && graveyardChannel.isTextBased()) {
            const graveyardEmbed = new EmbedBuilder()
              .setColor(0xff6b6b)
              .setTitle("💀 Welcome to the Graveyard")
              .setDescription(
                `**${targetMember.user.tag}** has been manually given the dead role.`
              )
              .addFields(
                {
                  name: "⚖️ Moderator",
                  value: message.author.tag,
                  inline: true,
                },
                {
                  name: "🗑️ Messages Deleted",
                  value: `${totalDeleted}`,
                  inline: true,
                },
                {
                  name: "📞 Appeal Process",
                  value:
                    "Contact a moderator if you believe this was a mistake",
                  inline: false,
                }
              )
              .setTimestamp()
              .setFooter({ text: "Manual Moderation Action" });

            if (targetMember.user.displayAvatarURL) {
              graveyardEmbed.setThumbnail(targetMember.user.displayAvatarURL());
            }

            await graveyardChannel.send({
              content: `${targetMember.user}`,
              embeds: [graveyardEmbed],
            });
          }
        } catch (graveyardError) {
          console.error(
            `Could not send message to graveyard channel:`,
            graveyardError
          );
        }
      } catch (error) {
        console.error("Error in !dead command:", error);
        await statusMsg.edit(
          `❌ An error occurred while processing the command: ${error.message}`
        );
      }
    }

    // Command to remove dead role from a user
    if (args[0] === "!undead") {
      // Check if user has permission (admin or manage roles)
      if (
        !message.member.permissions.has(PermissionsBitField.Flags.ManageRoles)
      ) {
        return message.channel.send(
          '❌ You need the "Manage Roles" permission to use this command.'
        );
      }

      let targetMember;
      if (args[1]) {
        const mentionedUser =
          message.mentions.users.first() ||
          message.guild.members.cache.find(
            (member) => member.user.username === args[1]
          )?.user;
        if (!mentionedUser) {
          return message.channel.send("❌ User not found.");
        }
        targetMember = message.guild.members.cache.get(mentionedUser.id);
      } else {
        return message.channel.send(
          "❌ Please mention a user or provide their username."
        );
      }

      if (!targetMember) {
        return message.channel.send(
          "❌ Could not find that member in this server."
        );
      }

      // Remove dead role
      const success = await removeDeadRole(targetMember);
      if (success) {
        message.channel.send(
          `✅ Removed the "${config.deadRoleName}" role from ${targetMember.user.tag}.`
        );

        // Log the action
        await logModerationAction({
          type: "ROLE_REMOVAL",
          user: targetMember.user,
          reason: `Dead role manually removed by ${message.author.tag}`,
          channels: [],
          guild: message.guild,
        });
      } else {
        message.channel.send(
          `❌ ${targetMember.user.tag} doesn't have the "${config.deadRoleName}" role.`
        );
      }
    }

    // Command to check user stats
    if (args[0] === "!modstats") {
      let targetUser = message.author;
      if (args[1]) {
        const mentionedUser =
          message.mentions.users.first() ||
          message.guild.members.cache.find(
            (member) => member.user.username === args[1]
          )?.user;
        if (mentionedUser) {
          targetUser = mentionedUser;
        }
      }

      const stats = getUserStats(targetUser.id, message.guild);
      const targetMember = message.guild.members.cache.get(targetUser.id);

      const embed = new EmbedBuilder()
        .setColor(stats.hasDeadRole ? 0xff6b6b : 0x4a90e2)
        .setTitle("📊 Moderation Stats")
        .setDescription(`**User:** ${targetUser.tag}`)
        .addFields(
          {
            name: "📝 Recent Messages Tracked",
            value: `${stats.recentMessages}`,
            inline: true,
          },
          { name: "⚠️ Warnings", value: `${stats.warnings}`, inline: true },
          {
            name: "💀 Has Dead Role",
            value: stats.hasDeadRole ? "✅ Yes" : "❌ No",
            inline: true,
          },
          {
            name: "📊 Message Rate",
            value: `${stats.messageRate}/30s`,
            inline: true,
          },
          {
            name: "🛡️ Status",
            value: stats.isExempt ? "Exempt" : "Active",
            inline: true,
          },
          {
            name: "🕒 Tracked Since",
            value: "<t:" + Math.floor(Date.now() / 1000) + ":R>",
            inline: true,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Moderation System | Type !modhelp for commands" });

      if (targetUser.displayAvatarURL) {
        embed.setThumbnail(targetUser.displayAvatarURL());
      }

      await message.channel.send({ embeds: [embed] });
    }

    // Command to show moderation help
    if (args[0] === "!modhelp") {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🛡️ Moderation Commands")
        .setDescription("Available moderation commands and features")
        .addFields(
          {
            name: "!dead [@user]",
            value:
              "Delete all messages from the past 5 days and assign dead role (Requires: Manage Roles)",
            inline: false,
          },
          {
            name: "!undead [@user]",
            value: "Remove the dead role from a user (Requires: Manage Roles)",
            inline: false,
          },
          {
            name: "!modstats [@user]",
            value: "View moderation statistics for yourself or another user",
            inline: false,
          },
          {
            name: "!modconfig",
            value: "View current moderation configuration (Requires: Admin)",
            inline: false,
          }
        )
        .addFields({
          name: "📋 Automatic Features",
          value:
            "• Spam detection across channels\n• Message rate limiting\n• Duplicate message detection\n• Auto-role assignment for violations",
          inline: false,
        })
        .setFooter({ text: "Moderation Handler" })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
    }

    // Command to view config (admin only)
    if (args[0] === "!modconfig") {
      if (
        !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return message.reply(
          "❌ You need Administrator permission to use this command."
        );
      }

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("⚙️ Moderation Configuration")
        .addFields(
          {
            name: "💀 Dead Role Name",
            value: config.deadRoleName,
            inline: true,
          },
          {
            name: "🪦 Graveyard Channel",
            value: config.graveyardChannelName,
            inline: true,
          },
          {
            name: "🚨 Spam Threshold",
            value: `${config.spamThreshold} channels`,
            inline: true,
          },
          {
            name: "⏱️ Time Window",
            value: `${config.timeWindow / 1000}s`,
            inline: true,
          },
          {
            name: "📊 Message Rate Limit",
            value: `${config.messageRateLimit} msgs/30s`,
            inline: true,
          },
          {
            name: "⚠️ Max Warnings",
            value: config.maxWarnings.toString(),
            inline: true,
          },
          {
            name: "🛡️ Exempt Roles",
            value: config.exemptRoles.join(", ") || "None",
            inline: false,
          }
        )
        .setTimestamp()
        .setFooter({ text: "Moderation Handler Configuration" });

      await message.channel.send({ embeds: [embed] });
    }
  });

  // Function to remove dead role manually
  async function removeDeadRole(member) {
    try {
      const deadRole = member.guild.roles.cache.find(
        (role) => role.name === config.deadRoleName
      );
      if (deadRole && member.roles.cache.has(deadRole.id)) {
        await member.roles.remove(deadRole, "Manual moderation: Role removed");
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error removing dead role:", error);
      return false;
    }
  }

  // Function to get user stats
  function getUserStats(userId, guild) {
    const messages = userMessages.get(userId) || [];
    const warnings = userWarnings.get(userId) || 0;
    const messageRate = userMessageCount.get(userId)?.length || 0;
    const member = guild.members.cache.get(userId);
    const deadRole = guild.roles.cache.find(
      (role) => role.name === config.deadRoleName
    );
    const hasDeadRole =
      member && deadRole ? member.roles.cache.has(deadRole.id) : false;
    const isExempt = member ? isExemptFromModeration(member) : false;

    return {
      recentMessages: messages.length,
      warnings: warnings,
      hasDeadRole: hasDeadRole,
      messageRate: messageRate,
      isExempt: isExempt,
    };
  }
};
