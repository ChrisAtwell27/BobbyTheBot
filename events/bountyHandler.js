const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { getConvexClient } = require("../database/convexClient");
const { api } = require("../convex/_generated/api");
const {
  updateBalance,
  getBalance,
} = require("../database/helpers/convexEconomyHelpers");
// TARGET_GUILD_ID removed
const {
  insufficientFundsMessage,
  invalidUsageMessage,
  permissionDeniedMessage,
} = require("../utils/errorMessages");
const { hasAdminPermission } = require("../utils/adminPermissions");

// Configuration
const MIN_BOUNTY = 50;
const MAX_BOUNTY = 1000000;
const BOUNTY_DURATION = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

// Generate unique bounty ID
function generateBountyId() {
  return `bounty_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Format bounty embed
function formatBountyEmbed(bounty, detailed = false) {
  const statusEmojis = {
    active: "🟢",
    claimed: "🟡",
    expired: "⚫",
    cancelled: "🔴",
  };

  const timeLeft = bounty.expiresAt - Date.now();
  const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

  let timeString;
  if (timeLeft <= 0) {
    timeString = "Expired";
  } else if (hoursLeft > 0) {
    timeString = `${hoursLeft}h ${minutesLeft}m`;
  } else {
    timeString = `${minutesLeft}m`;
  }

  const embed = new EmbedBuilder()
    .setTitle(
      `${statusEmojis[bounty.status]} Bounty #${bounty.bountyId.split("_")[1].substr(0, 6)}`
    )
    .setColor(
      bounty.status === "active"
        ? "#00ff00"
        : bounty.status === "claimed"
          ? "#ffa500"
          : "#888888"
    )
    .setDescription(`**${bounty.description}**`)
    .addFields(
      {
        name: "💰 Reward",
        value: `🍯${bounty.reward.toLocaleString()}`,
        inline: true,
      },
      { name: "👤 Creator", value: bounty.creatorName, inline: true },
      { name: "⏰ Time Left", value: timeString, inline: true }
    )
    .setFooter({
      text: `Posted ${new Date(bounty.createdAt).toLocaleString()}`,
    })
    .setTimestamp();

  if (detailed) {
    embed.addFields({
      name: "📋 Status",
      value: bounty.status.toUpperCase(),
      inline: true,
    });

    if (bounty.claimedBy) {
      embed.addFields({
        name: "🎯 Claimed By",
        value: bounty.claimedByName || "Unknown",
        inline: true,
      });
    }

    if (bounty.proofUrl) {
      embed.addFields({
        name: "🔗 Proof",
        value: bounty.proofUrl,
        inline: false,
      });
    }
  }

  return embed;
}

// Post a new bounty
async function postBounty(message, args) {
  try {
    const client = getConvexClient();
    if (!client) return message.reply("Database connection unavailable.");

    // Parse command: !postbounty <amount> <description>
    if (args.length < 2) {
      return message.reply(
        invalidUsageMessage(
          "postbounty",
          "!postbounty <amount> <description>",
          "!postbounty 500 First person to get a pentakill in Valorant"
        )
      );
    }

    const amount = parseInt(args[0], 10);
    const description = args.slice(1).join(" ");

    // Validate amount
    if (isNaN(amount) || amount < MIN_BOUNTY || amount > MAX_BOUNTY) {
      return message.reply(
        `❌ **Invalid Amount**\n\nBounty must be between 🍯${MIN_BOUNTY} and 🍯${MAX_BOUNTY}.`
      );
    }

    // Validate description length
    if (description.length < 10) {
      return message.reply(
        "❌ **Description Too Short**\n\nBounty description must be at least 10 characters. Be specific!"
      );
    }

    if (description.length > 500) {
      return message.reply(
        "❌ **Description Too Long**\n\nBounty description must be under 500 characters."
      );
    }

    // Check user balance
    const balance = await getBalance(message.guild.id, message.author.id);
    if (balance < amount) {
      return message.reply(
        insufficientFundsMessage(message.author.username, balance, amount)
      );
    }

    // Deduct honey (escrow)
    await updateBalance(message.guild.id, message.author.id, -amount);

    // Create bounty
    const bountyId = generateBountyId();
    const expiresAt = Date.now() + BOUNTY_DURATION;

    await client.mutation(api.bounties.createBounty, {
      guildId: message.guild.id,
      bountyId,
      creatorId: message.author.id,
      creatorName: message.author.username,
      description,
      reward: amount,
      channelId: message.channel.id,
      expiresAt,
    });

    // Send bounty announcement
    // We reconstruct the object for the embed since mutation result might vary or not be needed
    const bounty = {
      bountyId,
      creatorName: message.author.username,
      description,
      reward: amount,
      status: "active",
      expiresAt,
      createdAt: Date.now(),
    };

    const embed = formatBountyEmbed(bounty);
    embed.setDescription(
      `**${description}**\n\n✅ Bounty posted! First person to complete this and provide proof wins **🍯${amount.toLocaleString()}**!`
    );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_bounty_${bountyId}`)
        .setLabel("Claim Bounty")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🎯")
    );

    const announcementMsg = await message.channel.send({
      content: "🎯 **NEW BOUNTY POSTED!**",
      embeds: [embed],
      components: [buttons],
    });

    // Save message ID for future updates
    await client.mutation(api.bounties.updateBountyMessage, {
      bountyId,
      messageId: announcementMsg.id,
    });

    console.log(
      `[BOUNTY] Created bounty ${bountyId} by ${message.author.username} for ${amount} honey`
    );
  } catch (error) {
    console.error("[BOUNTY] Error posting bounty:", error);
    message.reply("❌ Failed to post bounty. Please try again.");
  }
}

// Post a new admin bounty (unlimited, no cost)
async function postAdminBounty(message, args) {
  try {
    const client = getConvexClient();
    if (!client) return message.reply("Database connection unavailable.");

    // Check permissions
    const guildId = message.guild.id;
    const isAdmin = await hasAdminPermission(message.member, guildId);
    if (!isAdmin) {
      return message.reply(permissionDeniedMessage());
    }

    // Parse command: !postadminbounty <amount> <description>
    if (args.length < 2) {
      return message.reply(
        invalidUsageMessage(
          "postadminbounty",
          "!postadminbounty <amount> <description>",
          "!postadminbounty 1000000 Server Event Grand Prize"
        )
      );
    }

    const amount = parseInt(args[0], 10);
    const description = args.slice(1).join(" ");

    // Validate amount (only check if positive)
    if (isNaN(amount) || amount <= 0) {
      return message.reply(
        `❌ **Invalid Amount**\n\nAmount must be a positive number.`
      );
    }

    // Validate description length
    if (description.length < 10) {
      return message.reply(
        "❌ **Description Too Short**\n\nBounty description must be at least 10 characters. Be specific!"
      );
    }

    if (description.length > 500) {
      return message.reply(
        "❌ **Description Too Long**\n\nBounty description must be under 500 characters."
      );
    }

    // Create bounty (NO COST TO ADMIN)
    const bountyId = generateBountyId();
    const expiresAt = Date.now() + BOUNTY_DURATION;

    await client.mutation(api.bounties.createBounty, {
      guildId: message.guild.id,
      bountyId,
      creatorId: message.author.id,
      creatorName: message.author.username + " (ADMIN)",
      description,
      reward: amount,
      channelId: message.channel.id,
      expiresAt,
    });

    // Send bounty announcement
    const bounty = {
      bountyId,
      creatorName: message.author.username + " (ADMIN)",
      description,
      reward: amount,
      status: "active",
      expiresAt,
      createdAt: Date.now(),
    };

    const embed = formatBountyEmbed(bounty);
    embed.setDescription(
      `**${description}**\n\n🚨 **ADMIN BOUNTY** 🚨\n✅ Bounty posted! First person to complete this and provide proof wins **🍯${amount.toLocaleString()}**!`
    );
    embed.setColor("#ff0000"); // Red for admin bounties

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_bounty_${bountyId}`)
        .setLabel("Claim Bounty")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🎯")
    );

    const announcementMsg = await message.channel.send({
      content: "🚨 **ADMIN BOUNTY POSTED!** 🚨",
      embeds: [embed],
      components: [buttons],
    });

    // Save message ID for future updates
    await client.mutation(api.bounties.updateBountyMessage, {
      bountyId,
      messageId: announcementMsg.id,
    });

    console.log(
      `[BOUNTY] Created ADMIN bounty ${bountyId} by ${message.author.username} for ${amount} honey`
    );
  } catch (error) {
    console.error("[BOUNTY] Error posting admin bounty:", error);
    message.reply("❌ Failed to post admin bounty. Please try again.");
  }
}

// List active bounties
async function listBounties(message) {
  try {
    const client = getConvexClient();
    if (!client) return message.reply("Database connection unavailable.");

    const bounties = await client.query(api.bounties.getActiveBounties, {
      guildId: message.guild.id,
    });

    // Sort in memory since query returns mostly filtered list, just need simple sort
    bounties.sort((a, b) => b.createdAt - a.createdAt);
    const recentBounties = bounties.slice(0, 10);

    if (recentBounties.length === 0) {
      return message.reply(
        "📋 **No Active Bounties**\n\nThere are no active bounties right now. Be the first to post one with `!postbounty`!"
      );
    }

    const embed = new EmbedBuilder()
      .setTitle("🎯 Active Bounties")
      .setColor("#00ff00")
      .setDescription("Complete any of these challenges to earn honey!")
      .setFooter({ text: `Showing ${recentBounties.length} active bounties` })
      .setTimestamp();

    for (const bounty of recentBounties) {
      const timeLeft = bounty.expiresAt - Date.now();
      const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));

      const shortId = bounty.bountyId.split("_")[1].substr(0, 6);

      embed.addFields({
        name: `#${shortId} - 🍯${bounty.reward.toLocaleString()}`,
        value: `${bounty.description.substring(0, 100)}${bounty.description.length > 100 ? "..." : ""}\n⏰ ${hoursLeft}h left • 👤 ${bounty.creatorName}`,
        inline: false,
      });
    }

    message.reply({ embeds: [embed] });
  } catch (error) {
    console.error("[BOUNTY] Error listing bounties:", error);
    message.reply("❌ Failed to load bounties. Please try again.");
  }
}

// View specific bounty
async function viewBounty(message, bountyIdPart) {
  try {
    const client = getConvexClient();
    if (!client) return message.reply("Database connection unavailable.");

    const allBounties = await client.query(api.bounties.getAllBounties, {
      guildId: message.guild.id,
    });
    const bounty = allBounties.find((b) => b.bountyId.includes(bountyIdPart));

    if (!bounty) {
      return message.reply(
        "❌ **Bounty Not Found**\n\nCouldn't find a bounty with that ID. Use `!bounties` to see active bounties."
      );
    }

    const embed = formatBountyEmbed(bounty, true);

    const buttons = new ActionRowBuilder();

    if (bounty.status === "active") {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`claim_bounty_${bounty.bountyId}`)
          .setLabel("Claim Bounty")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🎯")
      );
    }

    if (bounty.creatorId === message.author.id && bounty.status === "active") {
      buttons.addComponents(
        new ButtonBuilder()
          .setCustomId(`cancel_bounty_${bounty.bountyId}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌")
      );
    }

    await message.reply({
      embeds: [embed],
      components: buttons.components.length > 0 ? [buttons] : [],
    });
  } catch (error) {
    console.error("[BOUNTY] Error viewing bounty:", error);
    message.reply("❌ Failed to load bounty details.");
  }
}

// Cancel bounty (creator only)
async function cancelBounty(message, bountyIdPart) {
  try {
    const client = getConvexClient();
    if (!client) return message.reply("Database connection unavailable.");

    const allBounties = await client.query(api.bounties.getActiveBounties, {
      guildId: message.guild.id,
    });
    const bounty = allBounties.find((b) => b.bountyId.includes(bountyIdPart));

    if (!bounty) {
      return message.reply("❌ **Bounty Not Found**");
    }

    if (bounty.creatorId !== message.author.id) {
      return message.reply(
        "❌ **Permission Denied**\n\nYou can only cancel your own bounties."
      );
    }

    if (bounty.status !== "active") {
      return message.reply(
        `❌ **Cannot Cancel**\n\nThis bounty is already ${bounty.status}.`
      );
    }

    // Refund honey
    await updateBalance(message.guild.id, bounty.creatorId, bounty.reward);

    // Update status
    await client.mutation(api.bounties.cancelBounty, {
      bountyId: bounty.bountyId,
    });

    message.reply(
      `✅ **Bounty Cancelled**\n\n🍯${bounty.reward.toLocaleString()} has been refunded to your account.`
    );

    console.log(
      `[BOUNTY] Cancelled bounty ${bounty.bountyId} by ${message.author.username}`
    );
  } catch (error) {
    console.error("[BOUNTY] Error cancelling bounty:", error);
    message.reply("❌ Failed to cancel bounty.");
  }
}

// Auto-expire bounties
async function cleanupExpiredBounties(client) {
  try {
    const convex = getConvexClient();
    if (!convex) return;

    // Get expired active bounties globally
    const expiredBounties = await convex.query(
      api.bounties.getAllExpiredBounties
    );

    if (expiredBounties.length === 0) return;

    for (const bounty of expiredBounties) {
      // Refund creator
      try {
        await updateBalance(bounty.guildId, bounty.creatorId, bounty.reward);
      } catch (refundError) {
        console.error(
          `[BOUNTY] Error refunding user ${bounty.creatorId} for bounty ${bounty.bountyId}:`,
          refundError
        );
      }

      // Notify in channel
      try {
        const channel = await client.channels.fetch(bounty.channelId);
        if (channel) {
          await channel.send(
            `⏱️ **Bounty Expired** - Bounty "${bounty.description.substring(0, 50)}..." has expired. 🍯${bounty.reward.toLocaleString()} refunded to <@${bounty.creatorId}>.`
          );
        }
      } catch (channelError) {
        console.error(
          "[BOUNTY] Could not notify about expired bounty:",
          channelError.message
        );
      }

      console.log(
        `[BOUNTY] Expired bounty ${bounty.bountyId}, refunded ${bounty.reward} to ${bounty.creatorId}`
      );
    }

    // Update status to expired
    for (const bounty of expiredBounties) {
      await convex.mutation(api.bounties.expireBounty, {
        bountyId: bounty.bountyId,
      });
    }

    if (expiredBounties.length > 0) {
      console.log(
        `[BOUNTY] Cleaned up ${expiredBounties.length} expired bounties`
      );
    }
  } catch (error) {
    console.error("[BOUNTY] Error cleaning up expired bounties:", error);
  }
}

module.exports = (client) => {
  // Start cleanup interval
  const bountyCleanupInterval = setInterval(
    () => cleanupExpiredBounties(client),
    CLEANUP_INTERVAL
  );

  // Store interval ID for potential cleanup
  if (!global.bountyHandlerIntervals) global.bountyHandlerIntervals = [];
  global.bountyHandlerIntervals.push(bountyCleanupInterval);

  console.log(
    "[BOUNTY] Auto-cleanup system initialized (checks every 5 minutes)"
  );

  // Message commands
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    // Only respond in guilds
    if (!message.guild) return;

    // EARLY RETURN: Skip if not a bounty command
    const content = message.content.toLowerCase();
    if (
      !content.startsWith("!postbounty") &&
      !content.startsWith("!postadminbounty") &&
      !content.startsWith("!bounties") &&
      !content.startsWith("!bounty") &&
      !content.startsWith("!claimbounty") &&
      !content.startsWith("!cancelbounty") &&
      !content.startsWith("!clearbounties")
    )
      return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // !postbounty <amount> <description>
    if (command === "postbounty") {
      await postBounty(message, args);
    }

    // !postadminbounty <amount> <description>
    if (command === "postadminbounty") {
      await postAdminBounty(message, args);
    }

    // !bounties - list all active
    if (command === "bounties") {
      await listBounties(message);
    }

    // !bounty <id> - view specific
    if (command === "bounty" && args.length > 0) {
      await viewBounty(message, args[0]);
    }

    // !cancelbounty <id>
    if (command === "cancelbounty" && args.length > 0) {
      await cancelBounty(message, args[0]);
    }

    // Admin command: !clearbounties
    if (command === "clearbounties") {
      const guildId = message.guild.id;
      const isAdmin = await hasAdminPermission(message.member, guildId);
      if (!isAdmin) {
        return message.reply(permissionDeniedMessage());
      }

      try {
        const convex = getConvexClient();
        const result = await convex.mutation(
          api.bounties.deleteAllGuildBounties,
          { guildId: message.guild.id }
        );
        message.reply(`✅ Cleared ${result} bounties.`);
      } catch (error) {
        console.error("[BOUNTY] Error clearing bounties:", error);
        message.reply("❌ Failed to clear bounties.");
      }
    }
  });

  // Button interactions
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.guild) return;

    const customId = interaction.customId;

    // Claim bounty button
    if (customId.startsWith("claim_bounty_")) {
      try {
        const convex = getConvexClient();
        if (!convex)
          return interaction.reply({
            content: "Database unavailable.",
            ephemeral: true,
          });

        const bountyId = customId.replace("claim_bounty_", "");
        const bounty = await convex.query(api.bounties.getBounty, { bountyId });

        if (!bounty) {
          return interaction.reply({
            content: "❌ Bounty not found.",
            ephemeral: true,
          });
        }

        if (bounty.status !== "active") {
          return interaction.reply({
            content: `❌ This bounty is ${bounty.status}.`,
            ephemeral: true,
          });
        }

        if (bounty.creatorId === interaction.user.id) {
          return interaction.reply({
            content: "❌ You cannot claim your own bounty!",
            ephemeral: true,
          });
        }

        // Ask for proof
        const proofEmbed = new EmbedBuilder()
          .setTitle("🎯 Claim Bounty")
          .setColor("#ffa500")
          .setDescription(
            `**Bounty:** ${bounty.description}\n**Reward:** 🍯${bounty.reward.toLocaleString()}\n\nTo claim this bounty, reply to this message with a link to your proof (screenshot, clip, etc.).\n\n⏰ You have 2 minutes to provide proof.`
          )
          .setFooter({ text: "Send proof link in next message" });

        await interaction.reply({ embeds: [proofEmbed], ephemeral: true });

        // Wait for proof
        const filter = (m) => m.author.id === interaction.user.id;
        const collector = interaction.channel.createMessageCollector({
          filter,
          time: 120000,
          max: 1,
        });

        collector.on("collect", async (msg) => {
          try {
            const proofUrl = msg.content;

            // Claim bounty in Convex
            await convex.mutation(api.bounties.claimBounty, {
              bountyId: bounty.bountyId,
              claimedBy: interaction.user.id,
              claimedByName: interaction.user.username,
              proofUrl: proofUrl,
            });

            // Award honey
            await updateBalance(
              interaction.guild.id,
              interaction.user.id,
              bounty.reward
            );

            // Announce completion
            const completionEmbed = new EmbedBuilder()
              .setTitle("🎉 Bounty Claimed!")
              .setColor("#00ff00")
              .setDescription(
                `**${bounty.description}**\n\n🎯 **Claimed by:** ${interaction.user.username}\n💰 **Reward:** 🍯${bounty.reward.toLocaleString()}\n🔗 **Proof:** ${proofUrl}`
              )
              .setFooter({ text: `Created by ${bounty.creatorName}` })
              .setTimestamp();

            await interaction.channel.send({
              content: `🎉 <@${interaction.user.id}> completed a bounty!`,
              embeds: [completionEmbed],
            });

            // Update original bounty message
            try {
              if (bounty.messageId) {
                const originalMsg = await interaction.channel.messages.fetch(
                  bounty.messageId
                );
                const updatedBountyObj = {
                  ...bounty,
                  status: "claimed",
                  claimedBy: interaction.user.id,
                  claimedByName: interaction.user.username,
                  proofUrl,
                };
                // In formatBountyEmbed, it expects a bounty object. We simulate it.
                await originalMsg.edit({
                  embeds: [formatBountyEmbed(updatedBountyObj, true)],
                  components: [], // Remove buttons
                });
              }
            } catch (updateError) {
              console.error(
                "[BOUNTY] Could not update original message:",
                updateError.message
              );
            }

            await msg.react("✅");

            console.log(
              `[BOUNTY] Bounty ${bountyId} claimed by ${interaction.user.username} for ${bounty.reward} honey`
            );
            collector.stop();
          } catch (collectError) {
            console.error(
              "[BOUNTY] Error processing bounty claim:",
              collectError
            );
            collector.stop();
            try {
              await interaction.followUp({
                content:
                  "❌ An error occurred while processing your claim. Please try again.",
                ephemeral: true,
              });
            } catch (followUpError) {
              console.error(
                "[BOUNTY] Failed to send error followup:",
                followUpError
              );
            }
          }
        });

        collector.on("end", (collected) => {
          if (collected.size === 0) {
            interaction.followUp({
              content:
                "⏱️ Claim timed out. Try again when you have proof ready.",
              ephemeral: true,
            });
          }
        });
      } catch (error) {
        console.error("[BOUNTY] Error claiming bounty:", error);
        interaction.reply({
          content: "❌ Failed to claim bounty.",
          ephemeral: true,
        });
      }
    }

    // Cancel bounty button
    if (customId.startsWith("cancel_bounty_")) {
      try {
        const convex = getConvexClient();
        const bountyId = customId.replace("cancel_bounty_", "");
        const bounty = await convex.query(api.bounties.getBounty, { bountyId });

        if (!bounty) {
          return interaction.reply({
            content: "❌ Bounty not found.",
            ephemeral: true,
          });
        }

        if (bounty.creatorId !== interaction.user.id) {
          return interaction.reply({
            content: "❌ Only the creator can cancel this bounty.",
            ephemeral: true,
          });
        }

        if (bounty.status !== "active") {
          return interaction.reply({
            content: `❌ This bounty is already ${bounty.status}.`,
            ephemeral: true,
          });
        }

        // Refund honey
        await updateBalance(bounty.guildId, bounty.creatorId, bounty.reward);

        // Update status
        await convex.mutation(api.bounties.cancelBounty, {
          bountyId: bounty.bountyId,
        });

        await interaction.reply({
          content: `✅ Bounty cancelled. 🍯${bounty.reward.toLocaleString()} refunded.`,
          ephemeral: true,
        });

        // Update original message
        try {
          if (bounty.messageId) {
            const originalMsg = await interaction.channel.messages.fetch(
              bounty.messageId
            );
            const updatedBountyObj = { ...bounty, status: "cancelled" };
            const updatedEmbed = formatBountyEmbed(updatedBountyObj, true);
            await originalMsg.edit({ embeds: [updatedEmbed], components: [] });
          }
        } catch (updateError) {
          console.error(
            "[BOUNTY] Could not update original message:",
            updateError.message
          );
        }

        console.log(
          `[BOUNTY] Cancelled bounty ${bountyId} by ${interaction.user.username}`
        );
      } catch (error) {
        console.error("[BOUNTY] Error cancelling bounty:", error);
        interaction.reply({
          content: "❌ Failed to cancel bounty.",
          ephemeral: true,
        });
      }
    }
  });
};
