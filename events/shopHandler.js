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
const { formatCurrency, getCurrencyName, getCurrencyEmoji } = require("../utils/currencyHelper");
const { getSetting } = require("../utils/settingsManager");
const { hasAdminPermission } = require("../utils/adminPermissions");
const {
  checkSubscription,
  createUpgradeEmbed,
  TIERS,
} = require("../utils/subscriptionUtils");

// Default notification channel (can be overridden in settings)
const DEFAULT_NOTIFICATION_CHANNEL = "701309115686977557";

/**
 * Create an embed for a shop item
 */
async function createShopItemEmbed(item, guildId) {
  const currencyEmoji = await getCurrencyEmoji(guildId);
  const currencyName = await getCurrencyName(guildId);

  const embed = new EmbedBuilder()
    .setTitle(`${item.title}`)
    .setColor("#FFD700")
    .setDescription(item.description || "No description provided.");

  // Add price field
  embed.addFields({
    name: `${currencyEmoji} Price`,
    value: `**${item.price.toLocaleString()} ${currencyName}**`,
    inline: true,
  });

  // Add stock field if limited
  if (item.stock !== null && item.stock !== undefined) {
    embed.addFields({
      name: "📦 Stock",
      value: item.stock > 0 ? `${item.stock} remaining` : "**SOLD OUT**",
      inline: true,
    });
  } else {
    embed.addFields({
      name: "📦 Stock",
      value: "Unlimited",
      inline: true,
    });
  }

  // Add role reward info if applicable
  if (item.roleReward) {
    embed.addFields({
      name: "🎁 Reward",
      value: `<@&${item.roleReward}>`,
      inline: true,
    });
  }

  // Add image if provided
  if (item.imageUrl) {
    embed.setImage(item.imageUrl);
  }

  embed.setFooter({ text: `Item ID: ${item.itemId}` });
  embed.setTimestamp();

  return embed;
}

/**
 * Create buy button for a shop item
 */
function createBuyButton(itemId, soldOut = false) {
  const button = new ButtonBuilder()
    .setCustomId(`shop_buy_${itemId}`)
    .setLabel(soldOut ? "Sold Out" : "Buy Now")
    .setStyle(soldOut ? ButtonStyle.Secondary : ButtonStyle.Success)
    .setEmoji(soldOut ? "❌" : "🛒")
    .setDisabled(soldOut);

  return new ActionRowBuilder().addComponents(button);
}

/**
 * Post all shop items to the shop channel
 */
async function postShopItems(client, guildId) {
  try {
    const convex = getConvexClient();
    if (!convex) return { success: false, error: "Database unavailable" };

    // Get shop channel from settings
    const shopChannelId = await getSetting(guildId, "channels.shop");
    if (!shopChannelId) {
      return { success: false, error: "No shop channel configured" };
    }

    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(shopChannelId);
    if (!channel) {
      return { success: false, error: "Shop channel not found" };
    }

    // Get enabled shop items
    const items = await convex.query(api.shop.getEnabledItems, { guildId });
    if (items.length === 0) {
      return { success: false, error: "No shop items configured" };
    }

    // Post each item as a separate message
    const postedMessages = [];
    for (const item of items) {
      const embed = await createShopItemEmbed(item, guildId);
      const soldOut = item.stock !== null && item.stock !== undefined && item.stock <= 0;
      const button = createBuyButton(item.itemId, soldOut);

      const msg = await channel.send({
        embeds: [embed],
        components: [button],
      });

      // Save message ID to database for future updates
      await convex.mutation(api.shop.updateItem, {
        guildId,
        itemId: item.itemId,
        messageId: msg.id,
      });

      postedMessages.push({ itemId: item.itemId, messageId: msg.id });
    }

    console.log(`[SHOP] Posted ${postedMessages.length} shop items in guild ${guildId}`);
    return { success: true, count: postedMessages.length };
  } catch (error) {
    console.error("[SHOP] Error posting shop items:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Update a single shop item embed in the channel
 */
async function updateShopItemMessage(client, guildId, itemId) {
  try {
    const convex = getConvexClient();
    if (!convex) return;

    const item = await convex.query(api.shop.getItem, { guildId, itemId });
    if (!item || !item.messageId) return;

    const shopChannelId = await getSetting(guildId, "channels.shop");
    if (!shopChannelId) return;

    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(shopChannelId);
    if (!channel) return;

    try {
      const message = await channel.messages.fetch(item.messageId);
      const embed = await createShopItemEmbed(item, guildId);
      const soldOut = item.stock !== null && item.stock !== undefined && item.stock <= 0;
      const button = createBuyButton(item.itemId, soldOut);

      await message.edit({
        embeds: [embed],
        components: [button],
      });
    } catch (msgError) {
      console.error(`[SHOP] Could not update message for item ${itemId}:`, msgError.message);
    }
  } catch (error) {
    console.error("[SHOP] Error updating shop item message:", error);
  }
}

/**
 * Send purchase notification to admins
 */
async function sendPurchaseNotification(client, guildId, purchase, item, buyer) {
  try {
    // Get notification channel from settings, fall back to default
    let notificationChannelId = await getSetting(guildId, "channels.shop_notifications");
    if (!notificationChannelId) {
      notificationChannelId = DEFAULT_NOTIFICATION_CHANNEL;
    }

    // Get notification role from settings
    const notificationRoleId = await getSetting(guildId, "roles.shop_notifications");

    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(notificationChannelId);
    if (!channel) {
      console.error(`[SHOP] Notification channel ${notificationChannelId} not found`);
      return;
    }

    const currencyEmoji = await getCurrencyEmoji(guildId);
    const currencyName = await getCurrencyName(guildId);

    const embed = new EmbedBuilder()
      .setTitle("🛒 New Shop Purchase!")
      .setColor("#00FF00")
      .setDescription(`A user has purchased an item from the shop.`)
      .addFields(
        { name: "👤 Buyer", value: `<@${buyer.id}> (${buyer.username})`, inline: true },
        { name: "📦 Item", value: item.title, inline: true },
        { name: `${currencyEmoji} Price`, value: `${purchase.price.toLocaleString()} ${currencyName}`, inline: true }
      )
      .setTimestamp();

    if (item.roleReward) {
      embed.addFields({ name: "🎁 Role Given", value: `<@&${item.roleReward}>`, inline: true });
    }

    // Build content with role ping if configured
    let content = "";
    if (notificationRoleId) {
      content = `<@&${notificationRoleId}>`;
    }

    await channel.send({
      content: content || undefined,
      embeds: [embed],
    });

    // Mark purchase as notified
    const convex = getConvexClient();
    if (convex && purchase._id) {
      await convex.mutation(api.shop.markPurchaseNotified, {
        purchaseId: purchase._id,
      });
    }
  } catch (error) {
    console.error("[SHOP] Error sending purchase notification:", error);
  }
}

/**
 * Process a shop purchase
 */
async function processPurchase(interaction, itemId) {
  try {
    const convex = getConvexClient();
    if (!convex) {
      return interaction.reply({
        content: "❌ Database unavailable. Please try again later.",
        ephemeral: true,
      });
    }

    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const username = interaction.user.username;

    // Get the item
    const item = await convex.query(api.shop.getItem, { guildId, itemId });
    if (!item) {
      return interaction.reply({
        content: "❌ Item not found.",
        ephemeral: true,
      });
    }

    if (!item.enabled) {
      return interaction.reply({
        content: "❌ This item is no longer available.",
        ephemeral: true,
      });
    }

    // Check stock
    if (item.stock !== null && item.stock !== undefined && item.stock <= 0) {
      return interaction.reply({
        content: "❌ This item is sold out!",
        ephemeral: true,
      });
    }

    // Check max per user limit
    if (item.maxPerUser !== null && item.maxPerUser !== undefined) {
      const purchaseCount = await convex.query(api.shop.getUserPurchaseCount, {
        guildId,
        itemId,
        userId,
      });
      if (purchaseCount >= item.maxPerUser) {
        return interaction.reply({
          content: `❌ You have already purchased this item the maximum number of times (${item.maxPerUser}).`,
          ephemeral: true,
        });
      }
    }

    // Check user balance
    const balance = await getBalance(guildId, userId);
    if (balance < item.price) {
      const currencyName = await getCurrencyName(guildId);
      return interaction.reply({
        content: `❌ Insufficient ${currencyName}! You need **${await formatCurrency(guildId, item.price)}** but only have **${await formatCurrency(guildId, balance)}**.`,
        ephemeral: true,
      });
    }

    // Deduct balance
    await updateBalance(guildId, userId, -item.price);

    // Record purchase
    const purchaseId = await convex.mutation(api.shop.recordPurchase, {
      guildId,
      itemId,
      userId,
      username,
      price: item.price,
      itemTitle: item.title,
    });

    // Give role reward if applicable
    let roleGiven = false;
    if (item.roleReward) {
      try {
        const member = await interaction.guild.members.fetch(userId);
        await member.roles.add(item.roleReward);
        roleGiven = true;
      } catch (roleError) {
        console.error(`[SHOP] Could not give role ${item.roleReward} to ${userId}:`, roleError.message);
      }
    }

    // Build success message
    const currencyEmoji = await getCurrencyEmoji(guildId);
    let successMessage = `✅ **Purchase Complete!**\n\nYou bought **${item.title}** for **${await formatCurrency(guildId, item.price)}**!`;
    if (roleGiven) {
      successMessage += `\n\n🎁 You received the <@&${item.roleReward}> role!`;
    }

    await interaction.reply({
      content: successMessage,
      ephemeral: true,
    });

    // Update the shop item message (stock changed)
    await updateShopItemMessage(interaction.client, guildId, itemId);

    // Send notification to admins
    const purchase = { _id: purchaseId, price: item.price };
    await sendPurchaseNotification(interaction.client, guildId, purchase, item, interaction.user);

    console.log(`[SHOP] ${username} purchased ${item.title} for ${item.price} in guild ${guildId}`);
  } catch (error) {
    console.error("[SHOP] Error processing purchase:", error);
    if (!interaction.replied) {
      await interaction.reply({
        content: "❌ An error occurred while processing your purchase. Please try again.",
        ephemeral: true,
      });
    }
  }
}

/**
 * Handle !shop command to post shop items
 */
async function handleShopCommand(message) {
  const guildId = message.guild.id;

  // Check admin permission
  const isAdmin = await hasAdminPermission(message.member, guildId);
  if (!isAdmin) {
    return message.reply("❌ You need admin permissions to use this command.");
  }

  const result = await postShopItems(message.client, guildId);
  if (result.success) {
    return message.reply(`✅ Posted ${result.count} shop items to the shop channel.`);
  } else {
    return message.reply(`❌ Failed to post shop items: ${result.error}`);
  }
}

/**
 * Handle !refreshshop command to update all shop messages
 */
async function handleRefreshShopCommand(message) {
  const guildId = message.guild.id;

  // Check admin permission
  const isAdmin = await hasAdminPermission(message.member, guildId);
  if (!isAdmin) {
    return message.reply("❌ You need admin permissions to use this command.");
  }

  try {
    const convex = getConvexClient();
    if (!convex) return message.reply("❌ Database unavailable.");

    const items = await convex.query(api.shop.getEnabledItems, { guildId });
    let updated = 0;

    for (const item of items) {
      if (item.messageId) {
        await updateShopItemMessage(message.client, guildId, item.itemId);
        updated++;
      }
    }

    return message.reply(`✅ Refreshed ${updated} shop item embeds.`);
  } catch (error) {
    console.error("[SHOP] Error refreshing shop:", error);
    return message.reply("❌ Failed to refresh shop items.");
  }
}

/**
 * Handle !clearshop command to delete all shop messages
 */
async function handleClearShopCommand(message) {
  const guildId = message.guild.id;

  // Check admin permission
  const isAdmin = await hasAdminPermission(message.member, guildId);
  if (!isAdmin) {
    return message.reply("❌ You need admin permissions to use this command.");
  }

  try {
    const convex = getConvexClient();
    if (!convex) return message.reply("❌ Database unavailable.");

    const shopChannelId = await getSetting(guildId, "channels.shop");
    if (!shopChannelId) {
      return message.reply("❌ No shop channel configured.");
    }

    const channel = await message.guild.channels.fetch(shopChannelId);
    if (!channel) {
      return message.reply("❌ Shop channel not found.");
    }

    const items = await convex.query(api.shop.getItems, { guildId });
    let deleted = 0;

    for (const item of items) {
      if (item.messageId) {
        try {
          const msg = await channel.messages.fetch(item.messageId);
          await msg.delete();
          deleted++;

          // Clear the message ID from the database
          await convex.mutation(api.shop.updateItem, {
            guildId,
            itemId: item.itemId,
            messageId: "",
          });
        } catch (e) {
          // Message may already be deleted
        }
      }
    }

    return message.reply(`✅ Deleted ${deleted} shop messages.`);
  } catch (error) {
    console.error("[SHOP] Error clearing shop:", error);
    return message.reply("❌ Failed to clear shop messages.");
  }
}

module.exports = (client) => {
  console.log("[SHOP] Shop handler initialized");

  // Message commands
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const content = message.content.toLowerCase();

    // Early return if not a shop command
    if (!content.startsWith("!shop") && !content.startsWith("!refreshshop") && !content.startsWith("!clearshop")) {
      return;
    }

    // Check subscription tier - PLUS TIER REQUIRED for shop
    const subCheck = await checkSubscription(
      message.guild.id,
      TIERS.PLUS,
      message.guild.ownerId
    );
    if (!subCheck.hasAccess) {
      const upgradeEmbed = createUpgradeEmbed(
        "Shop System",
        TIERS.PLUS,
        subCheck.guildTier
      );
      return message.channel.send({ embeds: [upgradeEmbed] });
    }

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "shop") {
      await handleShopCommand(message);
    } else if (command === "refreshshop") {
      await handleRefreshShopCommand(message);
    } else if (command === "clearshop") {
      await handleClearShopCommand(message);
    }
  });

  // Button interactions
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.guild) return;

    const customId = interaction.customId;

    // Shop buy button
    if (customId.startsWith("shop_buy_")) {
      // Check subscription tier
      const subCheck = await checkSubscription(
        interaction.guild.id,
        TIERS.PLUS,
        interaction.guild.ownerId
      );
      if (!subCheck.hasAccess) {
        return interaction.reply({
          content: "❌ The shop feature requires Plus tier subscription.",
          ephemeral: true,
        });
      }

      const itemId = customId.replace("shop_buy_", "");
      await processPurchase(interaction, itemId);
    }
  });
};

// Export helper functions for API use
module.exports.postShopItems = postShopItems;
module.exports.updateShopItemMessage = updateShopItemMessage;
