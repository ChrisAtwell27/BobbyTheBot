/**
 * Lottery Handler
 * Weekly lottery system where users pick 3 numbers (1-20)
 * Drawing every Monday at 5 PM
 * Jackpot starts at 200,000 and grows by 50,000 each week without a winner
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
} = require("discord.js");
const cron = require("node-cron");
const { getConvexClient } = require("../database/convexClient");
const { api } = require("../convex/_generated/api");
const { getSetting } = require("../utils/settingsManager");
const { updateBalance, getBalance } = require("../database/helpers/economyHelpers");
const {
  getCurrencyName,
  getCurrencyEmoji,
  formatCurrency,
} = require("../utils/currencyHelper");
const {
  checkFeatureAccess,
  createUpgradeEmbed,
  TIERS,
} = require("../utils/subscriptionHelper");
const { setSetting } = require("../utils/settingsManager");

// Constants
const STARTING_JACKPOT = 200000;
const JACKPOT_INCREMENT = 50000;
const MIN_NUMBER = 1;
const MAX_NUMBER = 20;
const NUMBERS_TO_PICK = 3;

// Store active guilds with lottery enabled for scheduled draws
const activeGuilds = new Map();

module.exports = (client) => {
  const convex = getConvexClient();

  // =====================================================================
  // SCHEDULED DRAW - Every Monday at 5 PM (server time)
  // =====================================================================
  cron.schedule("0 17 * * 1", async () => {
    console.log("🎰 Running weekly lottery draws...");

    for (const [guildId, channelId] of activeGuilds) {
      try {
        await runLotteryDraw(guildId, channelId);
      } catch (error) {
        console.error(`Lottery draw failed for guild ${guildId}:`, error);
      }
    }
  });

  /**
   * Run the lottery draw for a guild
   */
  async function runLotteryDraw(guildId, channelId) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    // Get currency info
    const currencyName = await getCurrencyName(guildId);
    const currencyEmoji = await getCurrencyEmoji(guildId);

    // Get the Updates role to ping
    const updatesRoleId = await getSetting(guildId, "roles.updates", null);
    const rolePing = updatesRoleId ? `<@&${updatesRoleId}>` : "";

    // Perform the draw
    const result = await convex.mutation(api.lottery.drawLottery, { guildId });

    // Build results embed
    const resultsEmbed = new EmbedBuilder()
      .setTitle("🎰 LOTTERY DRAW RESULTS 🎰")
      .setColor(result.winner ? "#00FF00" : "#FF6600")
      .setDescription(
        `**Winning Numbers:** 🔢 **${result.winningNumbers.join(" - ")}**`
      )
      .addFields(
        {
          name: "📊 Total Entries",
          value: `${result.totalEntries} participants`,
          inline: true,
        },
        {
          name: `${currencyEmoji} Jackpot`,
          value: `${result.winner ? "WON!" : "Rolled over"}`,
          inline: true,
        }
      )
      .setTimestamp();

    if (result.winner) {
      // We have a winner!
      resultsEmbed.addFields({
        name: "🎉 WINNER!",
        value: `<@${result.winner.userId}> matched all numbers!\n**Prize: ${currencyEmoji}${result.winner.amount.toLocaleString()} ${currencyName}!**`,
        inline: false,
      });

      // Award the prize
      await updateBalance(guildId, result.winner.userId, result.winner.amount);

      resultsEmbed.setFooter({
        text: `Congratulations! New jackpot starts at ${currencyEmoji}${STARTING_JACKPOT.toLocaleString()}`,
      });
    } else {
      resultsEmbed.addFields({
        name: "😔 No Winner This Week",
        value: `The jackpot rolls over!\n**Next Week's Jackpot: ${currencyEmoji}${result.newJackpot.toLocaleString()} ${currencyName}**`,
        inline: false,
      });

      resultsEmbed.setFooter({
        text: `Better luck next week! Jackpot grows by ${currencyEmoji}${JACKPOT_INCREMENT.toLocaleString()} each week.`,
      });
    }

    // Send results with role ping
    await channel.send({
      content: rolePing ? `${rolePing} 🎰 **Weekly Lottery Draw!**` : null,
      embeds: [resultsEmbed],
    });

    // Clear old entries
    await convex.mutation(api.lottery.clearWeekEntries, {
      guildId,
      weekNumber: result.weekNumber,
    });

    // Purge channel messages (keep last 10 for context)
    try {
      const messages = await channel.messages.fetch({ limit: 100 });
      const toDelete = messages.filter(
        (msg) => Date.now() - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000 // Within 14 days
      );
      if (toDelete.size > 0) {
        await channel.bulkDelete(toDelete, true);
      }
    } catch (error) {
      console.log("Could not purge lottery channel:", error.message);
    }

    // Post new lottery embed
    await postLotteryEmbed(channel, guildId);
  }

  /**
   * Post the main lottery embed with entry button
   */
  async function postLotteryEmbed(channel, guildId) {
    const state = await convex.query(api.lottery.getState, { guildId });
    if (!state) return;

    const currencyName = await getCurrencyName(guildId);
    const currencyEmoji = await getCurrencyEmoji(guildId);

    const entryCount = await convex.query(api.lottery.getEntryCount, {
      guildId,
      weekNumber: state.weekNumber,
    });

    // Calculate next draw time (next Monday 5 PM)
    const now = new Date();
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));
    nextMonday.setHours(17, 0, 0, 0);

    const embed = new EmbedBuilder()
      .setTitle(`🎰 Weekly ${currencyName} Lottery 🎰`)
      .setColor("#FFD700")
      .setDescription(
        `Pick **3 numbers** between **1-20** for a chance to win the jackpot!\n\n` +
          `**Current Jackpot:** ${currencyEmoji}**${state.jackpot.toLocaleString()}** ${currencyName}\n\n` +
          `**How to Play:**\n` +
          `• Click the button below to enter\n` +
          `• Pick 3 unique numbers (1-20)\n` +
          `• Match all 3 to win the jackpot!\n` +
          `• One entry per person per week`
      )
      .addFields(
        {
          name: "📅 Next Draw",
          value: `<t:${Math.floor(nextMonday.getTime() / 1000)}:F>`,
          inline: true,
        },
        {
          name: "📊 Current Entries",
          value: `${entryCount} participants`,
          inline: true,
        },
        {
          name: "🎯 Week",
          value: `#${state.weekNumber}`,
          inline: true,
        }
      )
      .setFooter({
        text: `Jackpot grows by ${currencyEmoji}${JACKPOT_INCREMENT.toLocaleString()} each week without a winner!`,
      })
      .setTimestamp();

    // Add last winner info if exists
    if (state.lastWinner) {
      embed.addFields({
        name: "🏆 Last Winner",
        value: `<@${state.lastWinner.userId}> won ${currencyEmoji}${state.lastWinner.amount.toLocaleString()} with numbers: **${state.lastWinner.numbers.join(" - ")}**`,
        inline: false,
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("lottery_enter")
        .setLabel("🎟️ Enter Lottery")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("lottery_check")
        .setLabel("📋 My Entry")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("lottery_entries")
        .setLabel("👥 View All Entries")
        .setStyle(ButtonStyle.Secondary)
    );

    const message = await channel.send({ embeds: [embed], components: [row] });

    // Save message ID to state
    await convex.mutation(api.lottery.updateState, {
      guildId,
      mainMessageId: message.id,
    });

    return message;
  }

  /**
   * Update the main lottery embed (entry count, etc.)
   */
  async function updateLotteryEmbed(guildId) {
    const state = await convex.query(api.lottery.getState, { guildId });
    if (!state || !state.channelId || !state.mainMessageId) return;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(state.channelId);
    if (!channel) return;

    try {
      const message = await channel.messages.fetch(state.mainMessageId);
      if (!message) return;

      // Rebuild embed with updated entry count
      const currencyName = await getCurrencyName(guildId);
      const currencyEmoji = await getCurrencyEmoji(guildId);

      const entryCount = await convex.query(api.lottery.getEntryCount, {
        guildId,
        weekNumber: state.weekNumber,
      });

      // Calculate next draw time
      const now = new Date();
      const nextMonday = new Date(now);
      nextMonday.setDate(now.getDate() + ((1 + 7 - now.getDay()) % 7 || 7));
      nextMonday.setHours(17, 0, 0, 0);

      const embed = new EmbedBuilder()
        .setTitle(`🎰 Weekly ${currencyName} Lottery 🎰`)
        .setColor("#FFD700")
        .setDescription(
          `Pick **3 numbers** between **1-20** for a chance to win the jackpot!\n\n` +
            `**Current Jackpot:** ${currencyEmoji}**${state.jackpot.toLocaleString()}** ${currencyName}\n\n` +
            `**How to Play:**\n` +
            `• Click the button below to enter\n` +
            `• Pick 3 unique numbers (1-20)\n` +
            `• Match all 3 to win the jackpot!\n` +
            `• One entry per person per week`
        )
        .addFields(
          {
            name: "📅 Next Draw",
            value: `<t:${Math.floor(nextMonday.getTime() / 1000)}:F>`,
            inline: true,
          },
          {
            name: "📊 Current Entries",
            value: `${entryCount} participants`,
            inline: true,
          },
          {
            name: "🎯 Week",
            value: `#${state.weekNumber}`,
            inline: true,
          }
        )
        .setFooter({
          text: `Jackpot grows by ${currencyEmoji}${JACKPOT_INCREMENT.toLocaleString()} each week without a winner!`,
        })
        .setTimestamp();

      if (state.lastWinner) {
        embed.addFields({
          name: "🏆 Last Winner",
          value: `<@${state.lastWinner.userId}> won ${currencyEmoji}${state.lastWinner.amount.toLocaleString()} with numbers: **${state.lastWinner.numbers.join(" - ")}**`,
          inline: false,
        });
      }

      await message.edit({ embeds: [embed] });
    } catch (error) {
      // Message might be deleted, ignore
    }
  }

  // =====================================================================
  // MESSAGE HANDLER - Setup commands
  // =====================================================================
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.toLowerCase();

    // Admin commands
    if (content.startsWith("!lottery")) {
      const args = message.content.slice(8).trim().split(/ +/);
      const subcommand = args[0]?.toLowerCase();

      // Check subscription
      const subCheck = await checkFeatureAccess(message.guild.id, "features.lottery", TIERS.PLUS);
      if (!subCheck.hasAccess) {
        const upgradeEmbed = createUpgradeEmbed("Lottery System", TIERS.PLUS, subCheck.guildTier);
        return message.channel.send({ embeds: [upgradeEmbed] });
      }

      // Check admin permission
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply("❌ You need Administrator permission to manage the lottery.");
      }

      if (subcommand === "setup") {
        // Setup lottery in a channel
        const channel = message.mentions.channels.first() || message.channel;

        // Initialize lottery state
        await convex.mutation(api.lottery.initState, {
          guildId: message.guild.id,
          channelId: channel.id,
        });

        // Save lottery channel to settings (for dashboard)
        await setSetting(message.guild.id, "channels.lottery", channel.id);

        // Register for scheduled draws
        activeGuilds.set(message.guild.id, channel.id);

        // Post the lottery embed
        await postLotteryEmbed(channel, message.guild.id);

        await message.reply(`✅ Lottery has been set up in ${channel}!`);

        // Delete setup message after a delay
        setTimeout(() => message.delete().catch(() => {}), 5000);
      } else if (subcommand === "draw") {
        // Manual draw (admin only)
        const state = await convex.query(api.lottery.getState, { guildId: message.guild.id });
        if (!state) {
          return message.reply("❌ Lottery not set up. Use `!lottery setup` first.");
        }

        await message.reply("🎰 Forcing lottery draw...");
        await runLotteryDraw(message.guild.id, state.channelId);
      } else if (subcommand === "jackpot") {
        // Set jackpot (admin only)
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount < 0) {
          return message.reply("❌ Please provide a valid jackpot amount.");
        }

        await convex.mutation(api.lottery.updateState, {
          guildId: message.guild.id,
          jackpot: amount,
        });

        await message.reply(`✅ Jackpot set to ${amount.toLocaleString()}`);
        await updateLotteryEmbed(message.guild.id);
      } else if (subcommand === "refresh") {
        // Refresh the lottery embed
        const state = await convex.query(api.lottery.getState, { guildId: message.guild.id });
        if (!state || !state.channelId) {
          return message.reply("❌ Lottery not set up. Use `!lottery setup` first.");
        }

        const channel = message.guild.channels.cache.get(state.channelId);
        if (channel) {
          await postLotteryEmbed(channel, message.guild.id);
          await message.reply("✅ Lottery embed refreshed!");
        }
      } else {
        // Show help
        const currencyName = await getCurrencyName(message.guild.id);
        const embed = new EmbedBuilder()
          .setTitle("🎰 Lottery Commands")
          .setColor("#FFD700")
          .setDescription(
            `**Admin Commands:**\n` +
              `\`!lottery setup [#channel]\` - Set up lottery in a channel\n` +
              `\`!lottery draw\` - Force a lottery draw (testing)\n` +
              `\`!lottery jackpot <amount>\` - Set jackpot amount\n` +
              `\`!lottery refresh\` - Refresh the lottery embed\n\n` +
              `**How It Works:**\n` +
              `• Users click "Enter Lottery" to pick 3 numbers (1-20)\n` +
              `• Drawing happens every Monday at 5 PM\n` +
              `• Match all 3 numbers to win the jackpot!\n` +
              `• Jackpot starts at ${STARTING_JACKPOT.toLocaleString()} ${currencyName}\n` +
              `• Grows by ${JACKPOT_INCREMENT.toLocaleString()} each week without a winner`
          );

        await message.reply({ embeds: [embed] });
      }
    }
  });

  // =====================================================================
  // INTERACTION HANDLER - Buttons and Modals
  // =====================================================================
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.guild) return;

    const guildId = interaction.guild.id;

    // Button interactions
    if (interaction.isButton()) {
      // Check if this is a lottery button
      if (!interaction.customId.startsWith("lottery_")) return;

      // Check if lottery feature is enabled
      const lotteryEnabled = await getSetting(guildId, "features.lottery", true);
      if (!lotteryEnabled) {
        return interaction.reply({
          content: "❌ The lottery feature is disabled for this server.",
          ephemeral: true,
        });
      }

      if (interaction.customId === "lottery_enter") {
        // Check if lottery is open
        const state = await convex.query(api.lottery.getState, { guildId });
        if (!state || state.status !== "open") {
          return interaction.reply({
            content: "❌ The lottery is not currently accepting entries.",
            ephemeral: true,
          });
        }

        // Check if user already entered
        const existingEntry = await convex.query(api.lottery.getUserEntry, {
          guildId,
          weekNumber: state.weekNumber,
          userId: interaction.user.id,
        });

        if (existingEntry) {
          return interaction.reply({
            content: `❌ You already entered this week with numbers: **${existingEntry.numbers.join(" - ")}**`,
            ephemeral: true,
          });
        }

        // Show modal for number input
        const modal = new ModalBuilder()
          .setCustomId("lottery_numbers_modal")
          .setTitle("🎰 Enter the Lottery");

        const numbersInput = new TextInputBuilder()
          .setCustomId("lottery_numbers")
          .setLabel("Enter 3 numbers (1-20), separated by spaces")
          .setPlaceholder("Example: 5 12 18")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(5)
          .setMaxLength(10);

        const row = new ActionRowBuilder().addComponents(numbersInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
      } else if (interaction.customId === "lottery_check") {
        // Check user's entry
        const state = await convex.query(api.lottery.getState, { guildId });
        if (!state) {
          return interaction.reply({
            content: "❌ Lottery not set up for this server.",
            ephemeral: true,
          });
        }

        const entry = await convex.query(api.lottery.getUserEntry, {
          guildId,
          weekNumber: state.weekNumber,
          userId: interaction.user.id,
        });

        if (entry) {
          await interaction.reply({
            content: `🎟️ Your numbers for Week #${state.weekNumber}: **${entry.numbers.join(" - ")}**\nGood luck! 🍀`,
            ephemeral: true,
          });
        } else {
          await interaction.reply({
            content: "❌ You haven't entered this week's lottery yet. Click **Enter Lottery** to play!",
            ephemeral: true,
          });
        }
      } else if (interaction.customId === "lottery_entries") {
        // View all entries
        const state = await convex.query(api.lottery.getState, { guildId });
        if (!state) {
          return interaction.reply({
            content: "❌ Lottery not set up for this server.",
            ephemeral: true,
          });
        }

        const entries = await convex.query(api.lottery.getEntries, {
          guildId,
          weekNumber: state.weekNumber,
        });

        if (entries.length === 0) {
          return interaction.reply({
            content: "📋 No entries yet for this week's lottery. Be the first to enter!",
            ephemeral: true,
          });
        }

        // Build entries list (max 20 shown)
        const entryList = entries
          .slice(0, 20)
          .map((e, i) => `${i + 1}. **${e.username}** - \`${e.numbers.join(" - ")}\``)
          .join("\n");

        const embed = new EmbedBuilder()
          .setTitle(`📋 Week #${state.weekNumber} Entries`)
          .setColor("#FFD700")
          .setDescription(entryList)
          .setFooter({
            text:
              entries.length > 20
                ? `Showing 20 of ${entries.length} entries`
                : `${entries.length} total entries`,
          });

        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    // Modal submissions
    if (interaction.isModalSubmit()) {
      if (interaction.customId === "lottery_numbers_modal") {
        const input = interaction.fields.getTextInputValue("lottery_numbers");

        // Parse numbers
        const numbers = input
          .split(/[\s,]+/)
          .map((n) => parseInt(n.trim()))
          .filter((n) => !isNaN(n));

        // Validate
        if (numbers.length !== NUMBERS_TO_PICK) {
          return interaction.reply({
            content: `❌ Please enter exactly ${NUMBERS_TO_PICK} numbers. You entered: ${numbers.length}`,
            ephemeral: true,
          });
        }

        // Check duplicates
        if (new Set(numbers).size !== NUMBERS_TO_PICK) {
          return interaction.reply({
            content: "❌ All numbers must be unique!",
            ephemeral: true,
          });
        }

        // Check range
        for (const num of numbers) {
          if (num < MIN_NUMBER || num > MAX_NUMBER) {
            return interaction.reply({
              content: `❌ Numbers must be between ${MIN_NUMBER} and ${MAX_NUMBER}. Invalid: ${num}`,
              ephemeral: true,
            });
          }
        }

        try {
          const result = await convex.mutation(api.lottery.submitEntry, {
            guildId,
            userId: interaction.user.id,
            username: interaction.user.username,
            numbers,
          });

          const currencyEmoji = await getCurrencyEmoji(guildId);

          await interaction.reply({
            content:
              `🎟️ **Entry Confirmed!**\n\n` +
              `Your numbers: **${result.numbers.join(" - ")}**\n\n` +
              `Good luck in the draw! ${currencyEmoji}🍀`,
            ephemeral: true,
          });

          // Update the main embed with new entry count
          await updateLotteryEmbed(guildId);
        } catch (error) {
          await interaction.reply({
            content: `❌ ${error.message}`,
            ephemeral: true,
          });
        }
      }
    }
  });

  // =====================================================================
  // STARTUP - Load active lottery channels
  // =====================================================================
  client.once("ready", async () => {
    console.log("🎰 Loading active lottery channels...");

    for (const guild of client.guilds.cache.values()) {
      try {
        const state = await convex.query(api.lottery.getState, { guildId: guild.id });
        if (state && state.channelId) {
          activeGuilds.set(guild.id, state.channelId);
          console.log(`  ✓ Lottery active in ${guild.name}`);
        }
      } catch (error) {
        // Ignore errors for guilds without lottery
      }
    }

    console.log(`🎰 ${activeGuilds.size} guilds with active lotteries`);
  });
};
