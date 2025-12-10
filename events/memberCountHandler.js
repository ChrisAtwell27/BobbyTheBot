const { ChannelType } = require("discord.js");
// TARGET_GUILD_ID removed

module.exports = (client) => {
  let updateInterval;

  // Function to update member count for all guilds
  async function updateMemberCount() {
    try {
      for (const guild of client.guilds.cache.values()) {
        // Iterating all guilds

        try {
          // Find the member count voice channel
          const memberCountChannel = guild.channels.cache.find(
            (channel) =>
              channel.type === ChannelType.GuildVoice &&
              channel.name.startsWith("Member Count: ")
          );

          if (!memberCountChannel) {
            // Auto-create the member count channel if it doesn't exist
            console.log(
              `No "Member Count: " voice channel found in ${guild.name}, creating one...`
            );
            try {
              const memberCount = guild.memberCount;
              const newChannel = await guild.channels.create({
                name: `Member Count: ${memberCount}`,
                type: ChannelType.GuildVoice,
                permissionOverwrites: [
                  {
                    id: guild.roles.everyone,
                    deny: ["Connect", "Speak"],
                  },
                ],
              });
              console.log(
                `Created member count channel in ${guild.name}: ${newChannel.name}`
              );
            } catch (createError) {
              if (createError.code === 50013) {
                console.error(
                  `Missing permissions to create member count channel in ${guild.name}`
                );
              } else {
                console.error(
                  `Failed to create member count channel in ${guild.name}:`,
                  createError.message
                );
              }
            }
            continue;
          }

          // Get current member count (exclude bots)
          const memberCount = guild.memberCount;
          const humanCount = guild.members.cache.filter(
            (member) => !member.user.bot
          ).size;

          // Create new channel name
          const newChannelName = `Member Count: ${memberCount}`;

          // Only update if the name is different to avoid unnecessary API calls
          if (memberCountChannel.name !== newChannelName) {
            // Retry logic for rate limits
            let retries = 0;
            const maxRetries = 3;
            let success = false;

            while (!success && retries < maxRetries) {
              try {
                await memberCountChannel.setName(newChannelName);
                console.log(
                  `Updated member count for ${guild.name}: ${memberCount} members`
                );
                success = true;
              } catch (setNameError) {
                if (setNameError.code === 50013) {
                  console.error(
                    `Missing permissions to update member count channel in ${guild.name}`
                  );
                  break; // Don't retry on permission errors
                } else if (
                  setNameError.code === 50035 ||
                  setNameError.message?.includes("rate limit")
                ) {
                  retries++;
                  if (retries < maxRetries) {
                    const delay = Math.pow(2, retries) * 1000; // Exponential backoff: 2s, 4s, 8s
                    console.warn(
                      `Rate limited while updating member count in ${guild.name}, retrying in ${delay}ms (attempt ${retries}/${maxRetries})`
                    );
                    await new Promise((resolve) => setTimeout(resolve, delay));
                  } else {
                    console.error(
                      `Rate limited while updating member count in ${guild.name}, max retries reached`
                    );
                  }
                } else {
                  console.error(
                    `Error updating member count for ${guild.name}:`,
                    setNameError.message
                  );
                  break; // Don't retry on unknown errors
                }
              }
            }
          }
        } catch (error) {
          // Handle errors in finding the channel or other operations
          console.error(
            `Error in member count update for ${guild.name}:`,
            error.message
          );
        }
      }
    } catch (error) {
      console.error("Error in updateMemberCount function:", error);
    }
  }

  // Function to start the member count updater (immediate updates on join/leave + hourly fallback)
  function startMemberCountUpdater() {
    // Update immediately when bot starts
    setTimeout(() => {
      updateMemberCount();
    }, 5000); // Wait 5 seconds after bot startup

    // Then update every hour as a fallback (in case we miss any events)
    updateInterval = setInterval(updateMemberCount, 3600000);
    console.log(
      "Member count updater started - updating every hour as fallback"
    );
  }

  // Function to stop the member count updater
  function stopMemberCountUpdater() {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
      console.log("Member count updater stopped");
    }
  }

  // Start the updater when the bot is ready
  client.once("ready", () => {
    console.log("Member count handler initialized");
    startMemberCountUpdater();
  });

  // Update member count when a member joins
  client.on("guildMemberAdd", async (member) => {
    // Run on all guilds
    if (member.user.bot) return; // Skip bots for immediate updates

    try {
      const guild = member.guild;
      const memberCountChannel = guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildVoice &&
          channel.name.startsWith("Member Count: ")
      );

      if (memberCountChannel) {
        const memberCount = guild.memberCount;
        const newChannelName = `Member Count: ${memberCount}`;

        if (memberCountChannel.name !== newChannelName) {
          await memberCountChannel.setName(newChannelName);
          console.log(
            `Member joined - Updated count for ${guild.name}: ${memberCount} members`
          );
        }
      }
    } catch (error) {
      console.error(
        "Error updating member count on member join:",
        error.message
      );
    }
  });

  // Update member count when a member leaves
  client.on("guildMemberRemove", async (member) => {
    // Run on all guilds
    if (member.user.bot) return; // Skip bots for immediate updates

    try {
      const guild = member.guild;
      const memberCountChannel = guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildVoice &&
          channel.name.startsWith("Member Count: ")
      );

      if (memberCountChannel) {
        const memberCount = guild.memberCount;
        const newChannelName = `Member Count: ${memberCount}`;

        if (memberCountChannel.name !== newChannelName) {
          await memberCountChannel.setName(newChannelName);
          console.log(
            `Member left - Updated count for ${guild.name}: ${memberCount} members`
          );
        }
      }
    } catch (error) {
      console.error(
        "Error updating member count on member leave:",
        error.message
      );
    }
  });

  // Handle bot joining a new guild - auto-create member count channel
  client.on("guildCreate", async (guild) => {
    console.log(
      `Joined new guild: ${guild.name} (${guild.memberCount} members)`
    );

    // Check if member count channel already exists
    const existingChannel = guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildVoice &&
        channel.name.startsWith("Member Count: ")
    );

    if (!existingChannel) {
      try {
        const memberCount = guild.memberCount;
        const newChannel = await guild.channels.create({
          name: `Member Count: ${memberCount}`,
          type: ChannelType.GuildVoice,
          permissionOverwrites: [
            {
              id: guild.roles.everyone,
              deny: ["Connect", "Speak"],
            },
          ],
        });
        console.log(
          `Auto-created member count channel for new guild ${guild.name}: ${newChannel.name}`
        );
      } catch (error) {
        if (error.code === 50013) {
          console.error(
            `Missing permissions to create member count channel in new guild ${guild.name}`
          );
        } else {
          console.error(
            `Failed to create member count channel in new guild ${guild.name}:`,
            error.message
          );
        }
      }
    }
  });

  // Handle bot leaving a guild
  client.on("guildDelete", (guild) => {
    console.log(`Left guild: ${guild.name}`);
  });

  // Command to manually create a member count channel (admin only)
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    // EARLY RETURN: Skip if not a member count command
    const content = message.content.toLowerCase();
    if (
      !content.startsWith("!createmembercount") &&
      !content.startsWith("!membercount") &&
      !content.startsWith("!memberstatus")
    )
      return;

    const args = message.content.split(" ");

    // Command to create member count channel
    if (args[0] === "!createmembercount") {
      // Check if user has administrator permissions
      if (!message.member.permissions.has("Administrator")) {
        return message.reply(
          "❌ You need Administrator permissions to use this command."
        );
      }

      try {
        // Check if channel already exists
        const existingChannel = message.guild.channels.cache.find(
          (channel) =>
            channel.type === ChannelType.GuildVoice &&
            channel.name.startsWith("Member Count: ")
        );

        if (existingChannel) {
          return message.reply(
            `❌ Member count channel already exists: ${existingChannel.name}`
          );
        }

        // Create the voice channel
        const memberCount = message.guild.memberCount;
        const channel = await message.guild.channels.create({
          name: `Member Count: ${memberCount}`,
          type: ChannelType.GuildVoice,
          permissionOverwrites: [
            {
              id: message.guild.roles.everyone,
              deny: ["Connect", "Speak"],
            },
          ],
        });

        message.reply(
          `✅ Created member count channel: ${channel.name}\n🔄 It will update automatically on member changes and hourly as fallback.`
        );
        console.log(`Created member count channel in ${message.guild.name}`);
      } catch (error) {
        console.error("Error creating member count channel:", error);
        message.reply(
          "❌ Failed to create member count channel. Make sure I have the necessary permissions."
        );
      }
    }

    // Command to check member count status
    if (args[0] === "!membercount" || args[0] === "!memberstatus") {
      const memberCountChannel = message.guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildVoice &&
          channel.name.startsWith("Member Count: ")
      );

      const totalMembers = message.guild.memberCount;

      try {
        // Try to fetch all members to get accurate bot/human count
        await message.guild.members.fetch();
        const humanMembers = message.guild.members.cache.filter(
          (member) => !member.user.bot
        ).size;
        const botMembers = totalMembers - humanMembers;

        let statusMessage = `📊 **${message.guild.name} Member Statistics**\n\n`;
        statusMessage += `👥 **Total Members:** ${totalMembers}\n`;
        statusMessage += `🙋 **Human Members:** ${humanMembers}\n`;
        statusMessage += `🤖 **Bot Members:** ${botMembers}\n\n`;

        if (memberCountChannel) {
          statusMessage += `🔄 **Auto-updating channel:** ${memberCountChannel.name}\n`;
          statusMessage += `⏱️ **Update frequency:** Immediate on member changes + hourly fallback`;
        } else {
          statusMessage += `❌ **No member count channel found**\n`;
          statusMessage += `💡 **Tip:** Use \`!createmembercount\` to create one (Admin only)`;
        }

        return message.reply(statusMessage);
      } catch (error) {
        // If we can't fetch all members (missing GuildMembers intent), show limited info
        console.log(
          "Could not fetch all members - may need GuildMembers intent"
        );

        let statusMessage = `📊 **${message.guild.name} Member Statistics**\n\n`;
        statusMessage += `👥 **Total Members:** ${totalMembers}\n`;
        statusMessage += `ℹ️ **Note:** Cannot show human/bot breakdown - bot may need GuildMembers intent\n\n`;

        if (memberCountChannel) {
          statusMessage += `🔄 **Auto-updating channel:** ${memberCountChannel.name}\n`;
          statusMessage += `⏱️ **Update frequency:** Immediate on member changes + hourly fallback`;
        } else {
          statusMessage += `❌ **No member count channel found**\n`;
          statusMessage += `💡 **Tip:** Use \`!createmembercount\` to create one (Admin only)`;
        }

        return message.reply(statusMessage);
      }
    }
  });

  // Graceful shutdown
  process.on("SIGINT", () => {
    stopMemberCountUpdater();
  });

  process.on("SIGTERM", () => {
    stopMemberCountUpdater();
  });
};
