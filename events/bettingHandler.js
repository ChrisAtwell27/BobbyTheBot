/**
 * Betting Handler
 * Admin-created betting pools where users wager on multiple-choice outcomes
 * Uses pari-mutuel (pool) betting with fair distribution
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  PermissionsBitField,
} = require("discord.js");
const { getConvexClient } = require("../database/convexClient");
const { api } = require("../convex/_generated/api");
const { getSetting } = require("../utils/settingsManager");
const { updateBalance, getBalance } = require("../database/helpers/convexEconomyHelpers");
const {
  getCurrencyName,
  getCurrencyEmoji,
  formatCurrency,
} = require("../utils/currencyHelper");
const {
  checkSubscription,
  createUpgradeEmbed,
  TIERS,
} = require("../utils/subscriptionUtils");
const { hasAdminPermission } = require("../utils/adminPermissions");

// Constants
const MIN_BET = 100;
const HOUSE_CUT_PERCENT = 0.05;

module.exports = (client) => {
  const convex = getConvexClient();

  // =====================================================================
  // HELPER FUNCTIONS
  // =====================================================================

  /**
   * Build the betting embed for a bet
   */
  async function buildBetEmbed(bet, guildId) {
    const currencyEmoji = await getCurrencyEmoji(guildId);
    const currencyName = await getCurrencyName(guildId);

    const statusEmojis = {
      open: "🎲",
      locked: "🔒",
      resolved: "🏆",
      cancelled: "❌",
    };

    const statusColors = {
      open: "#00FF00",
      locked: "#FFA500",
      resolved: "#FFD700",
      cancelled: "#FF0000",
    };

    const embed = new EmbedBuilder()
      .setTitle(`${statusEmojis[bet.status]} BET: ${bet.title}`)
      .setColor(statusColors[bet.status])
      .setTimestamp();

    if (bet.description) {
      embed.setDescription(bet.description);
    }

    // Build options display
    let optionsText = "";
    for (const option of bet.options) {
      const percentage =
        bet.totalPool > 0
          ? ((option.totalWagered / bet.totalPool) * 100).toFixed(1)
          : "0.0";

      // Calculate potential payout multiplier (with house cut)
      const netPool = bet.totalPool * (1 - HOUSE_CUT_PERCENT);
      const payoutMultiplier =
        option.totalWagered > 0
          ? (netPool / option.totalWagered).toFixed(2)
          : "∞";

      const isWinner = bet.winningOption === option.id;
      const prefix = isWinner ? "✅ " : "";

      optionsText += `${prefix}**${option.id.toUpperCase()})** ${option.label}\n`;
      optionsText += `   ${currencyEmoji}${option.totalWagered.toLocaleString()} (${percentage}%) | Payout: ${payoutMultiplier}x\n\n`;
    }

    embed.addFields({
      name: `📊 Current Pool: ${currencyEmoji}${bet.totalPool.toLocaleString()}`,
      value: optionsText || "No options",
      inline: false,
    });

    // Status-specific info
    if (bet.status === "open") {
      embed.setFooter({
        text: `Bet ID: ${bet.betId} | Min bet: ${currencyEmoji}${MIN_BET.toLocaleString()} | 5% house cut on winnings`,
      });
    } else if (bet.status === "locked") {
      embed.addFields({
        name: "⏳ Status",
        value: "Betting is **LOCKED** - Awaiting result",
        inline: false,
      });
      embed.setFooter({ text: `Bet ID: ${bet.betId}` });
    } else if (bet.status === "resolved") {
      const winningOption = bet.options.find((o) => o.id === bet.winningOption);
      const houseCut = bet.houseCut || Math.floor(bet.totalPool * HOUSE_CUT_PERCENT);
      const netPool = bet.totalPool - houseCut;

      embed.addFields({
        name: "🏆 Winner",
        value: `**${winningOption?.label || "Unknown"}**`,
        inline: true,
      });
      embed.addFields({
        name: "💰 Payouts",
        value: `Pool: ${currencyEmoji}${bet.totalPool.toLocaleString()}\nHouse: ${currencyEmoji}${houseCut.toLocaleString()}\nPaid: ${currencyEmoji}${netPool.toLocaleString()}`,
        inline: true,
      });
      embed.setFooter({ text: `Bet ID: ${bet.betId} | Resolved` });
    } else if (bet.status === "cancelled") {
      embed.addFields({
        name: "❌ Cancelled",
        value: "All bets have been refunded",
        inline: false,
      });
      embed.setFooter({ text: `Bet ID: ${bet.betId} | Cancelled` });
    }

    return embed;
  }

  /**
   * Build action buttons for a bet (user buttons)
   */
  function buildBetButtons(bet) {
    const row = new ActionRowBuilder();

    if (bet.status === "open") {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`bet_place_${bet.betId}`)
          .setLabel("Place Bet")
          .setStyle(ButtonStyle.Success)
          .setEmoji("💰")
      );
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`bet_mybet_${bet.betId}`)
          .setLabel("View My Bet")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("👁️")
      );
    } else if (bet.status === "locked") {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`bet_mybet_${bet.betId}`)
          .setLabel("View My Bet")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("👁️")
      );
    }

    return row.components.length > 0 ? row : null;
  }

  /**
   * Build admin action buttons for a bet (lock, resolve, cancel)
   */
  function buildAdminButtons(bet) {
    const row = new ActionRowBuilder();

    if (bet.status === "open") {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`bet_admin_lock_${bet.betId}`)
          .setLabel("Lock Betting")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🔒")
      );
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`bet_admin_cancel_${bet.betId}`)
          .setLabel("Cancel Bet")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌")
      );
    } else if (bet.status === "locked") {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`bet_admin_resolve_${bet.betId}`)
          .setLabel("Select Winner")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🏆")
      );
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`bet_admin_cancel_${bet.betId}`)
          .setLabel("Cancel & Refund")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("❌")
      );
    }

    return row.components.length > 0 ? row : null;
  }

  /**
   * Post or update the bet embed in the channel
   */
  async function postBetEmbed(channel, bet, guildId) {
    const embed = await buildBetEmbed(bet, guildId);
    const userButtons = buildBetButtons(bet);
    const adminButtons = buildAdminButtons(bet);

    const messageOptions = { embeds: [embed], components: [] };

    // Add user buttons row
    if (userButtons) {
      messageOptions.components.push(userButtons);
    }

    // Add admin buttons row (only for open/locked bets)
    if (adminButtons) {
      messageOptions.components.push(adminButtons);
    }

    if (bet.messageId) {
      try {
        const existingMessage = await channel.messages.fetch(bet.messageId);
        await existingMessage.edit(messageOptions);
        return existingMessage;
      } catch {
        // Message not found, post new one
      }
    }

    const message = await channel.send(messageOptions);

    // Save message ID
    await convex.mutation(api.betting.updateBetMessageId, {
      guildId,
      betId: bet.betId,
      messageId: message.id,
    });

    return message;
  }

  // =====================================================================
  // MESSAGE COMMANDS
  // =====================================================================

  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.toLowerCase();
    if (!content.startsWith("!bet") && !content.startsWith("!mybets")) return;

    const guildId = message.guild.id;

    // Check subscription tier
    const subCheck = await checkSubscription(
      guildId,
      TIERS.PLUS,
      message.guild.ownerId
    );
    if (!subCheck.hasAccess) {
      const upgradeEmbed = createUpgradeEmbed(
        "Betting System",
        TIERS.PLUS,
        subCheck.guildTier
      );
      return message.channel.send({ embeds: [upgradeEmbed] });
    }

    // Check if betting feature is enabled
    const bettingEnabled = await getSetting(guildId, "features.betting", true);
    if (!bettingEnabled) {
      return message.reply(
        "❌ The betting feature is disabled for this server. An admin can enable it in the dashboard."
      );
    }

    // Handle !mybets command (any user)
    if (content.startsWith("!mybets")) {
      return handleMyBets(message);
    }

    // Parse !bet command
    const fullArgs = message.content.slice(4).trim();
    const args = fullArgs.split(/ +/);
    const subcommand = args[0]?.toLowerCase();

    // Admin-only commands
    const adminCommands = ["create", "lock", "resolve", "cancel", "list", "info"];
    if (adminCommands.includes(subcommand)) {
      const isAdmin = await hasAdminPermission(message.member, guildId);
      if (!isAdmin) {
        return message.reply("❌ You need admin permission to manage bets.");
      }
    }

    switch (subcommand) {
      case "create":
        return handleBetCreate(message, fullArgs);
      case "lock":
        return handleBetLock(message, args[1]);
      case "resolve":
        return handleBetResolve(message, args[1], args[2]);
      case "cancel":
        return handleBetCancel(message, args[1]);
      case "list":
        return handleBetList(message);
      case "info":
        return handleBetInfo(message, args[1]);
      default:
        return showBetHelp(message);
    }
  });

  /**
   * Show betting help
   */
  async function showBetHelp(message) {
    const currencyEmoji = await getCurrencyEmoji(message.guild.id);

    const embed = new EmbedBuilder()
      .setTitle("🎲 Betting System")
      .setColor("#FFD700")
      .setDescription("Create and manage betting pools for your server!")
      .addFields(
        {
          name: "👑 Admin Commands",
          value:
            '`!bet create "Title" "Option 1" "Option 2" ...` - Create a bet\n' +
            "`!bet lock <betId>` - Lock betting\n" +
            "`!bet resolve <betId> <optionId>` - Select winner\n" +
            "`!bet cancel <betId>` - Cancel and refund\n" +
            "`!bet list` - Show active bets\n" +
            "`!bet info <betId>` - Bet details",
          inline: false,
        },
        {
          name: "👤 User Commands",
          value:
            "`!mybets` - View your active bets\n" +
            "Click **Place Bet** button on any open bet",
          inline: false,
        },
        {
          name: "💡 How It Works",
          value:
            `• Minimum bet: ${currencyEmoji}${MIN_BET.toLocaleString()}\n` +
            "• 5% house cut on winnings\n" +
            "• Winners split the pool proportionally\n" +
            "• One bet per user per event",
          inline: false,
        }
      )
      .setFooter({ text: "Pool betting - odds change as bets are placed!" });

    return message.channel.send({ embeds: [embed] });
  }

  /**
   * Handle !bet create command
   */
  async function handleBetCreate(message, fullArgs) {
    const guildId = message.guild.id;

    // Parse quoted strings: "Title" "Option 1" "Option 2" ...
    const matches = fullArgs.match(/"([^"]+)"/g);
    if (!matches || matches.length < 3) {
      return message.reply(
        '❌ Usage: `!bet create "Title" "Option 1" "Option 2" [..."Option N"]`\n' +
          "You need at least a title and 2 options."
      );
    }

    // Remove quotes
    const parts = matches.map((m) => m.slice(1, -1));
    const title = parts[0];
    const options = parts.slice(1);

    if (options.length > 10) {
      return message.reply("❌ Maximum 10 options allowed per bet.");
    }

    try {
      const result = await convex.mutation(api.betting.createBet, {
        guildId,
        title,
        options,
        creatorId: message.author.id,
        creatorName: message.author.displayName || message.author.username,
        channelId: message.channel.id,
      });

      // Get the created bet
      const bet = await convex.query(api.betting.getBet, {
        guildId,
        betId: result.betId,
      });

      // Post the embed
      await postBetEmbed(message.channel, bet, guildId);

      // Delete the command message for cleanliness
      try {
        await message.delete();
      } catch {
        // Ignore if can't delete
      }
    } catch (error) {
      return message.reply(`❌ Failed to create bet: ${error.message}`);
    }
  }

  /**
   * Handle !bet lock command
   */
  async function handleBetLock(message, betId) {
    if (!betId) {
      return message.reply("❌ Usage: `!bet lock <betId>`");
    }

    const guildId = message.guild.id;

    try {
      await convex.mutation(api.betting.lockBet, { guildId, betId });

      // Get updated bet and refresh embed
      const bet = await convex.query(api.betting.getBet, { guildId, betId });
      if (bet && bet.messageId) {
        try {
          const channel = message.guild.channels.cache.get(bet.channelId);
          if (channel) {
            await postBetEmbed(channel, bet, guildId);
          }
        } catch {
          // Ignore embed update errors
        }
      }

      return message.reply(`✅ Bet **${betId}** has been locked. No more wagers accepted.`);
    } catch (error) {
      return message.reply(`❌ Failed to lock bet: ${error.message}`);
    }
  }

  /**
   * Handle !bet resolve command
   */
  async function handleBetResolve(message, betId, optionId) {
    if (!betId || !optionId) {
      return message.reply("❌ Usage: `!bet resolve <betId> <optionId>` (e.g., `!bet resolve bet_abc123 a`)");
    }

    const guildId = message.guild.id;
    const currencyEmoji = await getCurrencyEmoji(guildId);

    try {
      const result = await convex.mutation(api.betting.resolveBet, {
        guildId,
        betId,
        winningOptionId: optionId.toLowerCase(),
      });

      // Pay out winners
      for (const payout of result.payouts) {
        if (payout.payout > 0) {
          await updateBalance(guildId, payout.userId, payout.payout);
        }
      }

      // Get updated bet and refresh embed
      const bet = await convex.query(api.betting.getBet, { guildId, betId });
      if (bet && bet.messageId) {
        try {
          const channel = message.guild.channels.cache.get(bet.channelId);
          if (channel) {
            await postBetEmbed(channel, bet, guildId);
          }
        } catch {
          // Ignore embed update errors
        }
      }

      // Build results message
      let resultsText = `🏆 **Bet Resolved!**\n\n`;
      resultsText += `**Winner:** ${result.winningOption}\n`;
      resultsText += `**Total Pool:** ${currencyEmoji}${result.totalPool.toLocaleString()}\n`;
      resultsText += `**House Cut:** ${currencyEmoji}${result.houseCut.toLocaleString()}\n`;
      resultsText += `**Paid Out:** ${currencyEmoji}${result.netPool.toLocaleString()}\n\n`;

      if (result.payouts.length > 0) {
        resultsText += `**Winners (${result.totalWinners}):**\n`;
        for (const p of result.payouts.slice(0, 10)) {
          resultsText += `• ${p.username}: ${currencyEmoji}${p.amount.toLocaleString()} → ${currencyEmoji}${p.payout.toLocaleString()}\n`;
        }
        if (result.payouts.length > 10) {
          resultsText += `...and ${result.payouts.length - 10} more winners`;
        }
      } else {
        resultsText += `No winners this time!`;
      }

      return message.channel.send(resultsText);
    } catch (error) {
      return message.reply(`❌ Failed to resolve bet: ${error.message}`);
    }
  }

  /**
   * Handle !bet cancel command
   */
  async function handleBetCancel(message, betId) {
    if (!betId) {
      return message.reply("❌ Usage: `!bet cancel <betId>`");
    }

    const guildId = message.guild.id;
    const currencyEmoji = await getCurrencyEmoji(guildId);

    try {
      const result = await convex.mutation(api.betting.cancelBet, { guildId, betId });

      // Refund all bettors
      for (const refund of result.refunds) {
        await updateBalance(guildId, refund.userId, refund.amount);
      }

      // Get updated bet and refresh embed
      const bet = await convex.query(api.betting.getBet, { guildId, betId });
      if (bet && bet.messageId) {
        try {
          const channel = message.guild.channels.cache.get(bet.channelId);
          if (channel) {
            await postBetEmbed(channel, bet, guildId);
          }
        } catch {
          // Ignore embed update errors
        }
      }

      return message.reply(
        `✅ Bet **${betId}** has been cancelled.\n` +
          `Refunded ${currencyEmoji}${result.totalRefunded.toLocaleString()} to ${result.refunds.length} bettor(s).`
      );
    } catch (error) {
      return message.reply(`❌ Failed to cancel bet: ${error.message}`);
    }
  }

  /**
   * Handle !bet list command
   */
  async function handleBetList(message) {
    const guildId = message.guild.id;
    const currencyEmoji = await getCurrencyEmoji(guildId);

    try {
      const bets = await convex.query(api.betting.getActiveBets, { guildId });

      if (bets.length === 0) {
        return message.reply("📭 No active bets. Create one with `!bet create`");
      }

      const embed = new EmbedBuilder()
        .setTitle("🎲 Active Bets")
        .setColor("#FFD700")
        .setTimestamp();

      for (const bet of bets.slice(0, 10)) {
        const statusEmoji = bet.status === "open" ? "🟢" : "🔒";
        embed.addFields({
          name: `${statusEmoji} ${bet.title}`,
          value:
            `ID: \`${bet.betId}\`\n` +
            `Pool: ${currencyEmoji}${bet.totalPool.toLocaleString()}\n` +
            `Options: ${bet.options.map((o) => o.label).join(", ")}`,
          inline: true,
        });
      }

      if (bets.length > 10) {
        embed.setFooter({ text: `Showing 10 of ${bets.length} active bets` });
      }

      return message.channel.send({ embeds: [embed] });
    } catch (error) {
      return message.reply(`❌ Failed to list bets: ${error.message}`);
    }
  }

  /**
   * Handle !bet info command
   */
  async function handleBetInfo(message, betId) {
    if (!betId) {
      return message.reply("❌ Usage: `!bet info <betId>`");
    }

    const guildId = message.guild.id;

    try {
      const bet = await convex.query(api.betting.getBet, { guildId, betId });

      if (!bet) {
        return message.reply("❌ Bet not found.");
      }

      const embed = await buildBetEmbed(bet, guildId);
      return message.channel.send({ embeds: [embed] });
    } catch (error) {
      return message.reply(`❌ Failed to get bet info: ${error.message}`);
    }
  }

  /**
   * Handle !mybets command
   */
  async function handleMyBets(message) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const currencyEmoji = await getCurrencyEmoji(guildId);

    try {
      const userBets = await convex.query(api.betting.getUserBets, {
        guildId,
        userId,
      });

      if (userBets.length === 0) {
        return message.reply("📭 You don't have any active bets.");
      }

      const embed = new EmbedBuilder()
        .setTitle("🎫 Your Active Bets")
        .setColor("#3498DB")
        .setTimestamp();

      for (const { entry, bet } of userBets) {
        const option = bet.options.find((o) => o.id === entry.optionId);
        const statusEmoji = bet.status === "open" ? "🟢" : "🔒";

        embed.addFields({
          name: `${statusEmoji} ${bet.title}`,
          value:
            `Your pick: **${option?.label || "Unknown"}**\n` +
            `Amount: ${currencyEmoji}${entry.amount.toLocaleString()}\n` +
            `Bet ID: \`${bet.betId}\``,
          inline: true,
        });
      }

      return message.reply({ embeds: [embed] });
    } catch (error) {
      return message.reply(`❌ Failed to get your bets: ${error.message}`);
    }
  }

  // =====================================================================
  // BUTTON INTERACTIONS
  // =====================================================================

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.guild) return;

    const guildId = interaction.guild.id;

    // Handle button clicks
    if (interaction.isButton()) {
      if (!interaction.customId.startsWith("bet_")) return;

      // Check if betting is enabled
      const bettingEnabled = await getSetting(guildId, "features.betting", true);
      if (!bettingEnabled) {
        return interaction.reply({
          content: "❌ The betting feature is disabled for this server.",
          ephemeral: true,
        });
      }

      const customId = interaction.customId;

      // Handle admin buttons: bet_admin_<action>_<betId>
      // Format: bet_admin_lock_bet_xyz123 or bet_admin_resolve_bet_xyz123
      if (customId.startsWith("bet_admin_")) {
        // Check admin permission
        const isAdmin = await hasAdminPermission(interaction.member, guildId);
        if (!isAdmin) {
          return interaction.reply({
            content: "❌ Only admins can use these controls.",
            ephemeral: true,
          });
        }

        if (customId.startsWith("bet_admin_lock_")) {
          const betId = customId.slice("bet_admin_lock_".length);
          return handleAdminLockButton(interaction, betId);
        } else if (customId.startsWith("bet_admin_resolve_")) {
          const betId = customId.slice("bet_admin_resolve_".length);
          return handleAdminResolveButton(interaction, betId);
        } else if (customId.startsWith("bet_admin_cancel_")) {
          const betId = customId.slice("bet_admin_cancel_".length);
          return handleAdminCancelButton(interaction, betId);
        }
      }

      // Handle user buttons: bet_<action>_<betId>
      // Format: bet_place_bet_xyz123 or bet_mybet_bet_xyz123
      if (customId.startsWith("bet_place_")) {
        const betId = customId.slice("bet_place_".length);
        return handlePlaceBetButton(interaction, betId);
      } else if (customId.startsWith("bet_mybet_")) {
        const betId = customId.slice("bet_mybet_".length);
        return handleViewMyBetButton(interaction, betId);
      }
    }

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("bet_modal_")) {
        return handleBetModalSubmit(interaction);
      }
    }

    // Handle select menu (option selection)
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith("bet_option_")) {
        return handleOptionSelect(interaction);
      } else if (interaction.customId.startsWith("bet_resolve_winner_")) {
        return handleResolveWinnerSelect(interaction);
      }
    }
  });

  // =====================================================================
  // ADMIN BUTTON HANDLERS
  // =====================================================================

  /**
   * Handle admin "Lock Betting" button click
   */
  async function handleAdminLockButton(interaction, betId) {
    const guildId = interaction.guild.id;

    try {
      await convex.mutation(api.betting.lockBet, { guildId, betId });

      // Get updated bet and refresh embed
      const bet = await convex.query(api.betting.getBet, { guildId, betId });
      if (bet && bet.channelId) {
        const channel = interaction.guild.channels.cache.get(bet.channelId);
        if (channel) {
          await postBetEmbed(channel, bet, guildId);
        }
      }

      return interaction.reply({
        content: `🔒 **Bet locked!** No more wagers will be accepted.\n\nUse the **Select Winner** button to resolve the bet.`,
        ephemeral: true,
      });
    } catch (error) {
      return interaction.reply({
        content: `❌ Failed to lock bet: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  /**
   * Handle admin "Select Winner" button click - shows option dropdown
   */
  async function handleAdminResolveButton(interaction, betId) {
    const guildId = interaction.guild.id;

    try {
      const bet = await convex.query(api.betting.getBet, { guildId, betId });

      if (!bet) {
        return interaction.reply({
          content: "❌ Bet not found.",
          ephemeral: true,
        });
      }

      if (bet.status !== "locked") {
        return interaction.reply({
          content: "❌ Bet must be locked before selecting a winner.",
          ephemeral: true,
        });
      }

      // Show select menu for choosing winner
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`bet_resolve_winner_${betId}`)
        .setPlaceholder("Select the winning option...")
        .addOptions(
          bet.options.map((opt) => ({
            label: opt.label,
            description: `Pool: ${opt.totalWagered.toLocaleString()} wagered`,
            value: opt.id,
            emoji: "🏆",
          }))
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      return interaction.reply({
        content: "🏆 **Select the winning option:**",
        components: [row],
        ephemeral: true,
      });
    } catch (error) {
      return interaction.reply({
        content: `❌ Error: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  /**
   * Handle resolve winner selection from dropdown
   */
  async function handleResolveWinnerSelect(interaction) {
    const guildId = interaction.guild.id;
    // customId format: bet_resolve_winner_<betId> where betId contains underscore
    const betId = interaction.customId.slice("bet_resolve_winner_".length);
    const winningOptionId = interaction.values[0];
    const currencyEmoji = await getCurrencyEmoji(guildId);

    try {
      const result = await convex.mutation(api.betting.resolveBet, {
        guildId,
        betId,
        winningOptionId,
      });

      // Pay out winners
      for (const payout of result.payouts) {
        if (payout.payout > 0) {
          await updateBalance(guildId, payout.userId, payout.payout);
        }
      }

      // Get updated bet and refresh embed
      const bet = await convex.query(api.betting.getBet, { guildId, betId });
      if (bet && bet.channelId) {
        const channel = interaction.guild.channels.cache.get(bet.channelId);
        if (channel) {
          await postBetEmbed(channel, bet, guildId);

          // Post results announcement in the channel
          let resultsText = `🏆 **Bet Resolved: ${bet.title}**\n\n`;
          resultsText += `**Winner:** ${result.winningOption}\n`;
          resultsText += `**Total Pool:** ${currencyEmoji}${result.totalPool.toLocaleString()}\n`;
          resultsText += `**House Cut:** ${currencyEmoji}${result.houseCut.toLocaleString()}\n`;
          resultsText += `**Paid Out:** ${currencyEmoji}${result.netPool.toLocaleString()}\n\n`;

          if (result.payouts.length > 0) {
            resultsText += `**Winners (${result.totalWinners}):**\n`;
            for (const p of result.payouts.slice(0, 10)) {
              resultsText += `• <@${p.userId}>: ${currencyEmoji}${p.amount.toLocaleString()} → ${currencyEmoji}${p.payout.toLocaleString()}\n`;
            }
            if (result.payouts.length > 10) {
              resultsText += `...and ${result.payouts.length - 10} more winners`;
            }
          } else {
            resultsText += `No winners this round - house keeps the pool!`;
          }

          await channel.send(resultsText);
        }
      }

      return interaction.update({
        content: `✅ **Bet resolved!** ${result.totalWinners} winner(s) paid out ${currencyEmoji}${result.netPool.toLocaleString()}`,
        components: [],
      });
    } catch (error) {
      return interaction.reply({
        content: `❌ Failed to resolve bet: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  /**
   * Handle admin "Cancel & Refund" button click
   */
  async function handleAdminCancelButton(interaction, betId) {
    const guildId = interaction.guild.id;
    const currencyEmoji = await getCurrencyEmoji(guildId);

    try {
      const result = await convex.mutation(api.betting.cancelBet, { guildId, betId });

      // Refund all bettors
      for (const refund of result.refunds) {
        await updateBalance(guildId, refund.userId, refund.amount);
      }

      // Get updated bet and refresh embed
      const bet = await convex.query(api.betting.getBet, { guildId, betId });
      if (bet && bet.channelId) {
        const channel = interaction.guild.channels.cache.get(bet.channelId);
        if (channel) {
          await postBetEmbed(channel, bet, guildId);
        }
      }

      return interaction.reply({
        content:
          `✅ **Bet cancelled!**\n\n` +
          `Refunded ${currencyEmoji}${result.totalRefunded.toLocaleString()} to ${result.refunds.length} bettor(s).`,
        ephemeral: true,
      });
    } catch (error) {
      return interaction.reply({
        content: `❌ Failed to cancel bet: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  /**
   * Handle "Place Bet" button click
   */
  async function handlePlaceBetButton(interaction, betId) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    try {
      // Get the bet
      const bet = await convex.query(api.betting.getBet, { guildId, betId });

      if (!bet) {
        return interaction.reply({
          content: "❌ This bet no longer exists.",
          ephemeral: true,
        });
      }

      if (bet.status !== "open") {
        return interaction.reply({
          content: "❌ This bet is no longer accepting wagers.",
          ephemeral: true,
        });
      }

      // Check if user already bet
      const existingEntry = await convex.query(api.betting.getUserBetEntry, {
        guildId,
        betId,
        userId,
      });

      if (existingEntry) {
        const option = bet.options.find((o) => o.id === existingEntry.optionId);
        const currencyEmoji = await getCurrencyEmoji(guildId);
        return interaction.reply({
          content:
            `❌ You already bet ${currencyEmoji}${existingEntry.amount.toLocaleString()} on **${option?.label || "Unknown"}**\n` +
            `You can only place one bet per event.`,
          ephemeral: true,
        });
      }

      // Show option select menu
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`bet_option_${betId}`)
        .setPlaceholder("Select an option to bet on...")
        .addOptions(
          bet.options.map((opt) => ({
            label: opt.label,
            description: `Current pool: ${opt.totalWagered.toLocaleString()}`,
            value: opt.id,
          }))
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      return interaction.reply({
        content: "🎲 **Select which option you want to bet on:**",
        components: [row],
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error handling place bet button:", error);
      return interaction.reply({
        content: "❌ An error occurred. Please try again.",
        ephemeral: true,
      });
    }
  }

  /**
   * Handle option selection from dropdown
   */
  async function handleOptionSelect(interaction) {
    const guildId = interaction.guild.id;
    // customId format: bet_option_<betId> where betId contains underscore (e.g., bet_m4z5abc123)
    const betId = interaction.customId.slice("bet_option_".length);
    const selectedOption = interaction.values[0];
    const currencyEmoji = await getCurrencyEmoji(guildId);

    // Get the bet for option label
    const bet = await convex.query(api.betting.getBet, { guildId, betId });
    const option = bet?.options.find((o) => o.id === selectedOption);

    // Show modal for amount input
    const modal = new ModalBuilder()
      .setCustomId(`bet_modal_${betId}_${selectedOption}`)
      .setTitle(`Bet on: ${option?.label || selectedOption.toUpperCase()}`);

    const amountInput = new TextInputBuilder()
      .setCustomId("bet_amount")
      .setLabel(`Enter bet amount (min ${MIN_BET.toLocaleString()})`)
      .setPlaceholder(`e.g., 1000`)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(10);

    const row = new ActionRowBuilder().addComponents(amountInput);
    modal.addComponents(row);

    return interaction.showModal(modal);
  }

  /**
   * Handle bet modal submission
   */
  async function handleBetModalSubmit(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const username = interaction.user.displayName || interaction.user.username;

    // Parse customId: bet_modal_<betId>_<optionId>
    // betId format is "bet_<timestamp><random>" so it contains an underscore
    // optionId is always single letter (a, b, c, etc.)
    // So we extract optionId from the end and reconstruct betId
    const customId = interaction.customId;
    const optionId = customId.slice(-1); // Last character is the option (a, b, c, etc.)
    // Remove "bet_modal_" prefix and "_<optionId>" suffix to get betId
    const betId = customId.slice("bet_modal_".length, -2); // -2 for "_a" at the end

    const amountStr = interaction.fields.getTextInputValue("bet_amount");
    const amount = parseInt(amountStr.replace(/,/g, ""), 10);

    const currencyEmoji = await getCurrencyEmoji(guildId);

    // Validate amount
    if (isNaN(amount) || amount < MIN_BET) {
      return interaction.reply({
        content: `❌ Invalid amount. Minimum bet is ${currencyEmoji}${MIN_BET.toLocaleString()}`,
        ephemeral: true,
      });
    }

    // Check user balance
    const balance = await getBalance(guildId, userId);
    if (balance < amount) {
      return interaction.reply({
        content: `❌ Insufficient funds. You have ${currencyEmoji}${balance.toLocaleString()}`,
        ephemeral: true,
      });
    }

    try {
      // Deduct balance first
      await updateBalance(guildId, userId, -amount);

      // Place the bet
      await convex.mutation(api.betting.placeBet, {
        guildId,
        betId,
        userId,
        username,
        optionId,
        amount,
      });

      // Get updated bet and refresh the embed
      const bet = await convex.query(api.betting.getBet, { guildId, betId });
      const option = bet.options.find((o) => o.id === optionId);

      if (bet && bet.messageId && bet.channelId) {
        try {
          const channel = interaction.guild.channels.cache.get(bet.channelId);
          if (channel) {
            await postBetEmbed(channel, bet, guildId);
          }
        } catch {
          // Ignore embed update errors
        }
      }

      return interaction.reply({
        content:
          `✅ **Bet Placed!**\n\n` +
          `You bet ${currencyEmoji}${amount.toLocaleString()} on **${option?.label || optionId.toUpperCase()}**\n` +
          `New pool: ${currencyEmoji}${bet.totalPool.toLocaleString()}`,
        ephemeral: true,
      });
    } catch (error) {
      // Refund on error
      await updateBalance(guildId, userId, amount);

      console.error("Error placing bet:", error);
      return interaction.reply({
        content: `❌ Failed to place bet: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  /**
   * Handle "View My Bet" button click
   */
  async function handleViewMyBetButton(interaction, betId) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const currencyEmoji = await getCurrencyEmoji(guildId);

    try {
      const entry = await convex.query(api.betting.getUserBetEntry, {
        guildId,
        betId,
        userId,
      });

      if (!entry) {
        return interaction.reply({
          content: "📭 You haven't placed a bet on this event yet.",
          ephemeral: true,
        });
      }

      const bet = await convex.query(api.betting.getBet, { guildId, betId });
      const option = bet?.options.find((o) => o.id === entry.optionId);

      // Calculate potential payout
      const netPool = bet.totalPool * (1 - HOUSE_CUT_PERCENT);
      const potentialPayout =
        option.totalWagered > 0
          ? Math.floor((entry.amount / option.totalWagered) * netPool)
          : 0;

      return interaction.reply({
        content:
          `🎫 **Your Bet on "${bet.title}"**\n\n` +
          `**Pick:** ${option?.label || "Unknown"}\n` +
          `**Amount:** ${currencyEmoji}${entry.amount.toLocaleString()}\n` +
          `**Potential Payout:** ${currencyEmoji}${potentialPayout.toLocaleString()} (${(potentialPayout / entry.amount).toFixed(2)}x)\n` +
          `\n_Note: Payout changes as more bets are placed._`,
        ephemeral: true,
      });
    } catch (error) {
      console.error("Error viewing bet:", error);
      return interaction.reply({
        content: "❌ An error occurred. Please try again.",
        ephemeral: true,
      });
    }
  }

  console.log("🎲 Betting Handler initialized");
};
