const {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");
const { createCanvas, loadImage } = require("canvas");
const fs = require("fs");
const path = require("path");
const {
  getBalance,
  updateBalance,
} = require("../database/helpers/convexEconomyHelpers");
const {
  getHouseBalance,
  updateHouse,
} = require("../database/helpers/serverHelpers");
// TARGET_GUILD_ID removed
const {
  insufficientFundsMessage,
  invalidUsageMessage,
  processingMessage,
} = require("../utils/errorMessages");
const {
  checkSubscription,
  createUpgradeEmbed,
  TIERS,
} = require("../utils/subscriptionUtils");
const { formatCurrency, getCurrencyName } = require("../utils/currencyHelper");

const blackjackStreaksFilePath = path.join(
  __dirname,
  "../data/blackjack_streaks.txt"
);

// Multi-deck shoe configuration
const NUM_DECKS = 6;
const SHUFFLE_THRESHOLD = 0.75; // Shuffle when 75% of cards are dealt
let gameShoe = [];
let runningCount = 0;
let cardsDealt = 0;

// Initialize shoe at startup
function initShoeAtStartup() {
  const suits = ["Hearts", "Diamonds", "Clubs", "Spades"];
  const values = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
    "A",
  ];
  gameShoe = [];
  for (let i = 0; i < NUM_DECKS; i++) {
    for (const suit of suits) {
      for (const value of values) {
        gameShoe.push({ suit, value });
      }
    }
  }
  // Shuffle
  for (let i = gameShoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [gameShoe[i], gameShoe[j]] = [gameShoe[j], gameShoe[i]];
  }
  runningCount = 0;
  cardsDealt = 0;
}
initShoeAtStartup();

// Card and game visual constants
const CARD_WIDTH = 100;
const CARD_HEIGHT = 140;
const CARD_SPACING = 20;
const CANVAS_PADDING = 30;

module.exports = (client) => {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // Only run in guilds
    if (!message.guild) return;

    // EARLY RETURN: Skip if not a blackjack command
    if (!message.content.toLowerCase().startsWith("!blackjack")) return;

    const args = message.content.split(" ");

    // Blackjack game
    if (args[0] === "!blackjack") {
      // Check subscription tier (PLUS required for blackjack)
      const subCheck = await checkSubscription(message.guild.id, TIERS.PLUS, message.guild.ownerId);
      if (!subCheck.hasAccess) {
        const upgradeEmbed = createUpgradeEmbed(
          "Blackjack",
          TIERS.PLUS,
          subCheck.guildTier
        );
        return message.channel.send({ embeds: [upgradeEmbed] });
      }

      if (
        args.length !== 2 ||
        isNaN(parseInt(args[1], 10)) ||
        parseInt(args[1], 10) <= 0
      ) {
        return message.channel.send(
          invalidUsageMessage(
            "blackjack",
            "!blackjack [amount]",
            "!blackjack 100"
          )
        );
      }

      const betAmount = parseInt(args[1], 10);
      const userId = message.author.id;
      const guildId = message.guild.id;
      const balance = await getBalance(guildId, userId);

      if (balance < betAmount) {
        return message.channel.send(
          insufficientFundsMessage(message.author.username, balance, betAmount)
        );
      }

      await startBlackjackGame(message, guildId, userId, betAmount);
    }
  });

  // Create visual card representation
  function createCardImage(card, isHidden = false) {
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext("2d");

    if (isHidden) {
      // Card back design
      const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
      gradient.addColorStop(0, "#1a1a2e");
      gradient.addColorStop(0.5, "#16213e");
      gradient.addColorStop(1, "#0f0f23");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

      // Border
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, CARD_WIDTH - 6, CARD_HEIGHT - 6);

      // Pattern
      ctx.fillStyle = "#ffd700";
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText("🎰", CARD_WIDTH / 2, CARD_HEIGHT / 2 + 7);

      return canvas;
    }

    // Card face
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Border
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, CARD_WIDTH - 2, CARD_HEIGHT - 2);

    // Card color based on suit
    const isRed = card.suit === "Hearts" || card.suit === "Diamonds";
    ctx.fillStyle = isRed ? "#dc143c" : "#000000";

    // Suit symbols
    const suitSymbols = {
      Hearts: "♥",
      Diamonds: "♦",
      Clubs: "♣",
      Spades: "♠",
    };

    // Value and suit in corners
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "left";
    ctx.fillText(card.value, 8, 20);
    ctx.font = "14px Arial";
    ctx.fillText(suitSymbols[card.suit], 8, 35);

    // Large center symbol
    ctx.font = "40px Arial";
    ctx.textAlign = "center";
    ctx.fillText(suitSymbols[card.suit], CARD_WIDTH / 2, CARD_HEIGHT / 2 + 15);

    // Value in center
    ctx.font = "bold 24px Arial";
    ctx.fillText(card.value, CARD_WIDTH / 2, CARD_HEIGHT / 2 - 10);

    // Rotated value and suit in opposite corner
    ctx.save();
    ctx.translate(CARD_WIDTH - 8, CARD_HEIGHT - 8);
    ctx.rotate(Math.PI);
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "left";
    ctx.fillText(card.value, 0, 16);
    ctx.font = "14px Arial";
    ctx.fillText(suitSymbols[card.suit], 0, 31);
    ctx.restore();

    return canvas;
  }

  // Create game table visualization
  async function createGameTable(
    playerHands,
    dealerHand,
    playerScores,
    dealerScore,
    gameState,
    playerName,
    betAmount,
    isSplit = false,
    streak = 0,
    deckStatus = "NEUTRAL"
  ) {
    // Handle both single hand and split hands
    const hands = Array.isArray(playerHands[0]) ? playerHands : [playerHands];
    const scores = Array.isArray(playerScores) ? playerScores : [playerScores];

    const maxHandLength = Math.max(
      ...hands.map((h) => h.length),
      dealerHand.length
    );
    const handCount = hands.length;

    const totalWidth =
      Math.max(
        maxHandLength * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING,
        dealerHand.length * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING
      ) +
      CANVAS_PADDING * 2;

    const extraHeight = isSplit ? 180 : 0; // Extra space for second hand
    const canvas = createCanvas(Math.max(totalWidth, 600), 400 + extraHeight);
    const ctx = canvas.getContext("2d");

    // Casino table background
    const gradient = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      0,
      canvas.width / 2,
      canvas.height / 2,
      canvas.width / 2
    );
    gradient.addColorStop(0, "#0f5132");
    gradient.addColorStop(1, "#0a3d2a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Table felt texture
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    for (let i = 0; i < canvas.width; i += 20) {
      for (let j = 0; j < canvas.height; j += 20) {
        ctx.fillRect(i, j, 1, 1);
      }
    }

    // Title
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🎰 BLACKJACK TABLE 🎰", canvas.width / 2, 30);

    // Deck status indicator (Hot/Cold)
    ctx.font = "bold 16px Arial";
    if (deckStatus === "HOT") {
      ctx.fillStyle = "#ff4444";
      ctx.fillText("🔥 HOT DECK 🔥", canvas.width / 2, 55);
    } else if (deckStatus === "COLD") {
      ctx.fillStyle = "#4444ff";
      ctx.fillText("❄️ COLD DECK ❄️", canvas.width / 2, 55);
    } else {
      ctx.fillStyle = "#888888";
      ctx.fillText("⚪ NEUTRAL DECK", canvas.width / 2, 55);
    }

    // Streak indicator
    if (streak >= 3) {
      ctx.fillStyle = "#ff6600";
      ctx.font = "bold 18px Arial";
      ctx.fillText(
        `🔥 ${streak} WIN STREAK! (+10% BONUS) 🔥`,
        canvas.width / 2,
        78
      );
    } else if (streak > 0) {
      ctx.fillStyle = "#ffaa00";
      ctx.font = "bold 14px Arial";
      ctx.fillText(`⭐ ${streak} Win Streak`, canvas.width / 2, 75);
    }

    // Dealer section
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "left";
    const dealerYOffset = streak >= 3 ? 100 : streak > 0 ? 95 : 90;
    ctx.fillText("DEALER", 30, dealerYOffset);
    ctx.fillText(
      `Total: ${gameState === "playing" ? "?" : dealerScore}`,
      30,
      dealerYOffset + 20
    );

    // Draw dealer cards
    const dealerStartX =
      (canvas.width -
        (dealerHand.length * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING)) /
      2;
    for (let i = 0; i < dealerHand.length; i++) {
      const cardCanvas = createCardImage(
        dealerHand[i],
        gameState === "playing" && i === 1
      );
      ctx.drawImage(
        cardCanvas,
        dealerStartX + i * (CARD_WIDTH + CARD_SPACING),
        dealerYOffset + 30
      );
    }

    // Player section(s)
    const playerYStart = dealerYOffset + 180;
    for (let handIndex = 0; handIndex < hands.length; handIndex++) {
      const hand = hands[handIndex];
      const score = scores[handIndex];
      const yOffset = playerYStart + handIndex * 200;

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px Arial";
      ctx.textAlign = "left";
      const handLabel = isSplit
        ? `${playerName.toUpperCase()} - HAND ${handIndex + 1}`
        : `${playerName.toUpperCase()}`;
      ctx.fillText(handLabel, 30, yOffset);
      ctx.fillText(`Total: ${score}`, 30, yOffset + 20);
      ctx.fillText(`Bet: 🍯${betAmount}`, 30, yOffset + 40);

      // Draw player cards
      const playerStartX =
        (canvas.width -
          (hand.length * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING)) /
        2;
      for (let i = 0; i < hand.length; i++) {
        const cardCanvas = createCardImage(hand[i]);
        ctx.drawImage(
          cardCanvas,
          playerStartX + i * (CARD_WIDTH + CARD_SPACING),
          yOffset + 50
        );
      }
    }

    // Game status
    if (gameState !== "playing") {
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 36px Arial";
      ctx.textAlign = "center";

      let statusText = "";
      if (gameState === "bust") statusText = "BUST!";
      else if (gameState === "win") statusText = "YOU WIN!";
      else if (gameState === "lose") statusText = "DEALER WINS!";
      else if (gameState === "tie") statusText = "TIE!";

      ctx.fillText(statusText, canvas.width / 2, canvas.height / 2);
    }

    return canvas;
  }

  async function startBlackjackGame(message, guildId, userId, betAmount) {
    // Show processing message
    const processingMsg = await message.channel.send(
      processingMessage("we deal the cards")
    );

    // CRITICAL FIX: Deduct the initial bet from player's balance when game starts
    await updateBalance(guildId, userId, -betAmount);

    // Get current streak and deck status
    const currentStreak = getStreak(userId);
    const deckStatus = getDeckStatus();

    const playerHand = [drawCard(gameShoe), drawCard(gameShoe)];
    const dealerHand = [drawCard(gameShoe), drawCard(gameShoe)];

    // Delete processing message before showing the game
    await processingMsg.delete().catch(() => {});

    let playerScore = calculateHandValue(playerHand);
    let dealerScore = calculateHandValue(dealerHand);

    // Check if split is possible
    const canSplit =
      playerHand[0].value === playerHand[1].value &&
      (await getBalance(guildId, userId)) >= betAmount;

    // Create initial game visualization
    const gameCanvas = await createGameTable(
      playerHand,
      dealerHand,
      playerScore,
      dealerScore,
      "playing",
      message.author.username,
      betAmount,
      false,
      currentStreak,
      deckStatus
    );

    const attachment = new AttachmentBuilder(gameCanvas.toBuffer(), {
      name: "blackjack-table.png",
    });

    let streakInfo =
      currentStreak >= 3
        ? `\n🔥 **${currentStreak} Win Streak! +10% Bonus Active!**`
        : currentStreak > 0
          ? `\n⭐ ${currentStreak} Win Streak`
          : "";
    let deckInfo =
      deckStatus === "HOT"
        ? "\n🔥 Hot Deck (High cards likely)"
        : deckStatus === "COLD"
          ? "\n❄️ Cold Deck (Low cards likely)"
          : "\n⚪ Neutral Deck";

    let gameEmbed = new EmbedBuilder()
      .setTitle("🎰 Casino Blackjack")
      .setColor("#0f5132")
      .setDescription(
        `**${message.author.username}** is playing Blackjack!\n**Bet:** ${await formatCurrency(guildId, betAmount)}${streakInfo}${deckInfo}`
      )
      .setImage("attachment://blackjack-table.png")
      .addFields(
        {
          name: "🎯 Your Hand",
          value: `${displayHandEmoji(playerHand)}\n**Score:** ${playerScore}`,
          inline: true,
        },
        {
          name: "🎭 Dealer's Hand",
          value: `${displayHandEmoji([dealerHand[0]])} 🎴\n**Score:** ${calculateHandValue([dealerHand[0]])} + ?`,
          inline: true,
        },
        {
          name: "💰 Game Info",
          value: `**Your Balance:** ${await formatCurrency(guildId, await getBalance(guildId, userId))}\n**House Edge:** ${await getHouseBalance()}`,
          inline: true,
        }
      )
      .setFooter({ text: "Choose your action wisely! 🎲" })
      .setTimestamp();

    // Check for natural blackjack
    if (playerScore === 21) {
      if (dealerScore === 21) {
        // Tie - return the bet (no streak bonus or penalty)
        await updateBalance(guildId, userId, betAmount);

        const finalCanvas = await createGameTable(
          playerHand,
          dealerHand,
          playerScore,
          dealerScore,
          "tie",
          message.author.username,
          betAmount,
          false,
          currentStreak,
          deckStatus
        );
        const finalAttachment = new AttachmentBuilder(finalCanvas.toBuffer(), {
          name: "blackjack-result.png",
        });

        gameEmbed = new EmbedBuilder()
          .setTitle("🎰 Blackjack - Push!")
          .setColor("#ffaa00")
          .setDescription(`Both you and the dealer have blackjack! It's a tie!`)
          .setImage("attachment://blackjack-result.png")
          .addFields(
            {
              name: "🎯 Final Result",
              value: `**You:** ${playerScore}\n**Dealer:** ${dealerScore}`,
              inline: true,
            },
            {
              name: "💰 Payout",
              value: `**Returned:** ${await formatCurrency(guildId, betAmount)}`,
              inline: true,
            }
          )
          .setFooter({ text: "Your bet has been returned!" })
          .setTimestamp();

        return message.channel.send({
          embeds: [gameEmbed],
          files: [finalAttachment],
        });
      } else {
        // Player blackjack wins - pay 3:2 + streak bonus
        const baseWinnings = Math.floor(betAmount * 2.5);
        const streakBonus = calculateStreakBonus(baseWinnings, currentStreak);
        const totalWinnings = baseWinnings + streakBonus;
        await updateBalance(guildId, userId, totalWinnings);
        updateStreak(userId, true); // Increment streak

        const finalCanvas = await createGameTable(
          playerHand,
          dealerHand,
          playerScore,
          dealerScore,
          "win",
          message.author.username,
          betAmount,
          false,
          currentStreak + 1,
          deckStatus
        );
        const finalAttachment = new AttachmentBuilder(finalCanvas.toBuffer(), {
          name: "blackjack-result.png",
        });

        let bonusText =
          streakBonus > 0 ? `\n🔥 **Streak Bonus: +${await formatCurrency(guildId, streakBonus)}**` : "";

        gameEmbed = new EmbedBuilder()
          .setTitle("🎰 Blackjack - Natural 21!")
          .setColor("#00ff00")
          .setDescription(`🎉 BLACKJACK! You got a natural 21!${bonusText}`)
          .setImage("attachment://blackjack-result.png")
          .addFields(
            {
              name: "🎯 Final Result",
              value: `**You:** ${playerScore}\n**Dealer:** ${dealerScore}`,
              inline: true,
            },
            {
              name: "💰 Payout",
              value: `**Won:** ${await formatCurrency(guildId, totalWinnings)}\n**New Balance:** ${await formatCurrency(guildId, await getBalance(guildId, userId))}\n**Streak:** ${currentStreak + 1} wins`,
              inline: true,
            }
          )
          .setFooter({ text: "Blackjack pays 3:2!" })
          .setTimestamp();

        return message.channel.send({
          embeds: [gameEmbed],
          files: [finalAttachment],
        });
      }
    }

    const hitButton = new ButtonBuilder()
      .setCustomId("hit")
      .setLabel("Hit")
      .setStyle("Success")
      .setEmoji("🎯");

    const standButton = new ButtonBuilder()
      .setCustomId("stand")
      .setLabel("Stand")
      .setStyle("Primary")
      .setEmoji("✋");

    const doubleButton = new ButtonBuilder()
      .setCustomId("double")
      .setLabel("Double Down")
      .setStyle("Secondary")
      .setEmoji("⚡")
      .setDisabled((await getBalance(guildId, userId)) < betAmount);

    const splitButton = new ButtonBuilder()
      .setCustomId("split")
      .setLabel("Split")
      .setStyle("Success")
      .setEmoji("✂️")
      .setDisabled(!canSplit);

    const surrenderButton = new ButtonBuilder()
      .setCustomId("surrender")
      .setLabel("Surrender")
      .setStyle("Danger")
      .setEmoji("🏳️");

    const row = new ActionRowBuilder().addComponents(
      hitButton,
      standButton,
      doubleButton,
      splitButton,
      surrenderButton
    );

    const gameMessage = await message.channel.send({
      embeds: [gameEmbed],
      files: [attachment],
      components: [row],
    });

    const filter = (i) => i.user.id === userId;
    const collector = gameMessage.createMessageComponentCollector({
      filter,
      time: 120000,
    });
    let gameEnded = false; // Track if game has ended to prevent multiple stops

    collector.on("collect", async (interaction) => {
      try {
        if (interaction.customId === "hit") {
          playerHand.push(drawCard(gameShoe));
          playerScore = calculateHandValue(playerHand);

          if (playerScore > 21) {
            // Player busts - house keeps the bet (already deducted)
            await updateHouse(betAmount);
            updateStreak(userId, false); // Reset streak

            const finalCanvas = await createGameTable(
              playerHand,
              dealerHand,
              playerScore,
              dealerScore,
              "bust",
              message.author.username,
              betAmount,
              false,
              0,
              deckStatus
            );
            const finalAttachment = new AttachmentBuilder(
              finalCanvas.toBuffer(),
              { name: "blackjack-result.png" }
            );

            gameEmbed = new EmbedBuilder()
              .setTitle("🎰 Blackjack - Bust!")
              .setColor("#ff0000")
              .setDescription(`💥 You busted with ${playerScore}!`)
              .setImage("attachment://blackjack-result.png")
              .addFields(
                {
                  name: "🎯 Final Result",
                  value: `**You:** ${playerScore} (BUST)\n**Dealer:** ${calculateHandValue([dealerHand[0]])} + ?`,
                  inline: true,
                },
                {
                  name: "💰 Loss",
                  value: `**Lost:** ${await formatCurrency(guildId, betAmount)}\n**New Balance:** ${await formatCurrency(guildId, await getBalance(guildId, userId))}\n**Streak:** Reset`,
                  inline: true,
                }
              )
              .setFooter({ text: "Better luck next time!" })
              .setTimestamp();

            gameEnded = true;
            collector.stop();
            await interaction.update({
              embeds: [gameEmbed],
              files: [finalAttachment],
              components: [],
            });
          } else {
            // Update game state
            const updatedCanvas = await createGameTable(
              playerHand,
              dealerHand,
              playerScore,
              dealerScore,
              "playing",
              message.author.username,
              betAmount,
              false,
              currentStreak,
              deckStatus
            );
            const updatedAttachment = new AttachmentBuilder(
              updatedCanvas.toBuffer(),
              { name: "blackjack-table.png" }
            );

            gameEmbed = new EmbedBuilder()
              .setTitle("🎰 Casino Blackjack")
              .setColor("#0f5132")
              .setDescription(
                `**${message.author.username}** is playing Blackjack!\n**Bet:** ${await formatCurrency(guildId, betAmount)}${streakInfo}${deckInfo}`
              )
              .setImage("attachment://blackjack-table.png")
              .addFields(
                {
                  name: "🎯 Your Hand",
                  value: `${displayHandEmoji(playerHand)}\n**Score:** ${playerScore}`,
                  inline: true,
                },
                {
                  name: "🎭 Dealer's Hand",
                  value: `${displayHandEmoji([dealerHand[0]])} 🎴\n**Score:** ${calculateHandValue([dealerHand[0]])} + ?`,
                  inline: true,
                },
                {
                  name: "💰 Game Info",
                  value: `**Your Balance:** ${await formatCurrency(guildId, await getBalance(guildId, userId))}\n**House Edge:** ${await getHouseBalance()}`,
                  inline: true,
                }
              )
              .setFooter({ text: "Choose your action wisely! 🎲" })
              .setTimestamp();

            await interaction.update({
              embeds: [gameEmbed],
              files: [updatedAttachment],
            });
          }
        } else if (
          interaction.customId === "stand" ||
          interaction.customId === "double"
        ) {
          let actualBet = betAmount;

          if (interaction.customId === "double") {
            actualBet = betAmount * 2;
            await updateBalance(guildId, userId, -betAmount); // Take the extra bet
            playerHand.push(drawCard(gameShoe));
            playerScore = calculateHandValue(playerHand);

            if (playerScore > 21) {
              // Player busts after doubling - house keeps both bets
              await updateHouse(actualBet);
              updateStreak(userId, false); // Reset streak

              const finalCanvas = await createGameTable(
                playerHand,
                dealerHand,
                playerScore,
                dealerScore,
                "bust",
                message.author.username,
                actualBet,
                false,
                0,
                deckStatus
              );
              const finalAttachment = new AttachmentBuilder(
                finalCanvas.toBuffer(),
                { name: "blackjack-result.png" }
              );

              gameEmbed = new EmbedBuilder()
                .setTitle("🎰 Blackjack - Double Down Bust!")
                .setColor("#ff0000")
                .setDescription(
                  `💥 You doubled down and busted with ${playerScore}!`
                )
                .setImage("attachment://blackjack-result.png")
                .addFields(
                  {
                    name: "🎯 Final Result",
                    value: `**You:** ${playerScore} (BUST)\n**Dealer:** ${calculateHandValue([dealerHand[0]])} + ?`,
                    inline: true,
                  },
                  {
                    name: "💰 Loss",
                    value: `**Lost:** ${await formatCurrency(guildId, actualBet)}\n**New Balance:** ${await formatCurrency(guildId, await getBalance(guildId, userId))}\n**Streak:** Reset`,
                    inline: true,
                  }
                )
                .setFooter({ text: "Double down gone wrong!" })
                .setTimestamp();

              gameEnded = true;
              collector.stop();
              await interaction.update({
                embeds: [gameEmbed],
                files: [finalAttachment],
                components: [],
              });
              return;
            }
          }

          // Dealer plays
          while (dealerScore < 17) {
            dealerHand.push(drawCard(gameShoe));
            dealerScore = calculateHandValue(dealerHand);
          }

          let resultMessage = "";
          let resultColor = "#ffaa00";
          let gameState = "tie";
          let newStreak = currentStreak;

          if (dealerScore > 21 || playerScore > dealerScore) {
            // Player wins - pay 2:1 + streak bonus
            const baseWinnings = actualBet * 2;
            const streakBonus = calculateStreakBonus(
              baseWinnings,
              currentStreak
            );
            const totalWinnings = baseWinnings + streakBonus;
            await updateBalance(guildId, userId, totalWinnings);
            updateStreak(userId, true); // Increment streak
            newStreak = currentStreak + 1;
            resultMessage =
              streakBonus > 0
                ? `🎉 You won ${await formatCurrency(guildId, totalWinnings)}! (${await formatCurrency(guildId, streakBonus)} streak bonus)`
                : `🎉 You won ${await formatCurrency(guildId, totalWinnings)}!`;
            resultColor = "#00ff00";
            gameState = "win";
          } else if (playerScore === dealerScore) {
            // Tie - return the bet (no streak change)
            await updateBalance(guildId, userId, actualBet);
            resultMessage = `🤝 It's a tie! You get your ${await formatCurrency(guildId, actualBet)} back.`;
            resultColor = "#ffaa00";
            gameState = "tie";
          } else {
            // Dealer wins - house keeps the bet (already deducted)
            await updateHouse(actualBet);
            updateStreak(userId, false); // Reset streak
            newStreak = 0;
            resultMessage = `😢 You lost ${await formatCurrency(guildId, actualBet)}. Better luck next time!`;
            resultColor = "#ff0000";
            gameState = "lose";
          }

          const finalCanvas = await createGameTable(
            playerHand,
            dealerHand,
            playerScore,
            dealerScore,
            gameState,
            message.author.username,
            actualBet,
            false,
            newStreak,
            deckStatus
          );
          const finalAttachment = new AttachmentBuilder(
            finalCanvas.toBuffer(),
            { name: "blackjack-result.png" }
          );

          gameEmbed = new EmbedBuilder()
            .setTitle("🎰 Blackjack - Game Over!")
            .setColor(resultColor)
            .setDescription(resultMessage)
            .setImage("attachment://blackjack-result.png")
            .addFields(
              {
                name: "🎯 Final Result",
                value: `**You:** ${playerScore}\n**Dealer:** ${dealerScore}`,
                inline: true,
              },
              {
                name: "💰 Your Stats",
                value: `**New Balance:** ${await formatCurrency(guildId, await getBalance(guildId, userId))}\n**Win Streak:** ${newStreak}\n**House Balance:** ${await formatCurrency(guildId, await getHouseBalance())}`,
                inline: true,
              }
            )
            .setFooter({ text: "Thanks for playing! 🎲" })
            .setTimestamp();

          gameEnded = true;
          collector.stop();
          await interaction.update({
            embeds: [gameEmbed],
            files: [finalAttachment],
            components: [],
          });
        } else if (interaction.customId === "surrender") {
          // Surrender - return half the bet
          const refund = Math.floor(betAmount / 2);
          await updateBalance(guildId, userId, refund);
          await updateHouse(betAmount - refund);
          updateStreak(userId, false); // Reset streak

          const finalCanvas = await createGameTable(
            playerHand,
            dealerHand,
            playerScore,
            dealerScore,
            "lose",
            message.author.username,
            betAmount,
            false,
            0,
            deckStatus
          );
          const finalAttachment = new AttachmentBuilder(
            finalCanvas.toBuffer(),
            { name: "blackjack-result.png" }
          );

          gameEmbed = new EmbedBuilder()
            .setTitle("🎰 Blackjack - Surrender")
            .setColor("#ffaa00")
            .setDescription(
              `🏳️ You surrendered and received half your bet back.`
            )
            .setImage("attachment://blackjack-result.png")
            .addFields(
              {
                name: "🎯 Your Hand",
                value: `${displayHandEmoji(playerHand)}\n**Score:** ${playerScore}`,
                inline: true,
              },
              {
                name: "💰 Refund",
                value: `**Returned:** ${await formatCurrency(guildId, refund)}\n**New Balance:** ${await formatCurrency(guildId, await getBalance(guildId, userId))}`,
                inline: true,
              }
            )
            .setFooter({ text: "Sometimes the best move is to fold!" })
            .setTimestamp();

          gameEnded = true;
          collector.stop();
          await interaction.update({
            embeds: [gameEmbed],
            files: [finalAttachment],
            components: [],
          });
        } else if (interaction.customId === "split") {
          // Split hands - requires additional bet
          await updateBalance(guildId, userId, -betAmount); // Take second bet

          const hand1 = [playerHand[0], drawCard(gameShoe)];
          const hand2 = [playerHand[1], drawCard(gameShoe)];
          const score1 = calculateHandValue(hand1);
          const score2 = calculateHandValue(hand2);

          const splitCanvas = await createGameTable(
            [hand1, hand2],
            dealerHand,
            [score1, score2],
            dealerScore,
            "playing",
            message.author.username,
            betAmount,
            true,
            currentStreak,
            deckStatus
          );
          const splitAttachment = new AttachmentBuilder(
            splitCanvas.toBuffer(),
            { name: "blackjack-split.png" }
          );

          gameEmbed = new EmbedBuilder()
            .setTitle("🎰 Blackjack - Split Hands!")
            .setColor("#0f5132")
            .setDescription(
              `✂️ **${message.author.username}** split their hand!\n**Total Bet:** ${await formatCurrency(guildId, betAmount * 2)}`
            )
            .setImage("attachment://blackjack-split.png")
            .addFields(
              {
                name: "🎯 Hand 1",
                value: `${displayHandEmoji(hand1)}\n**Score:** ${score1}`,
                inline: true,
              },
              {
                name: "🎯 Hand 2",
                value: `${displayHandEmoji(hand2)}\n**Score:** ${score2}`,
                inline: true,
              },
              {
                name: "🎭 Dealer",
                value: `${displayHandEmoji([dealerHand[0]])} 🎴\n**Score:** ${calculateHandValue([dealerHand[0]])} + ?`,
                inline: true,
              }
            )
            .setFooter({ text: "Playing both hands now!" })
            .setTimestamp();

          await interaction.update({
            embeds: [gameEmbed],
            files: [splitAttachment],
            components: [],
          });

          // Play hand 1
          let finalScore1 = score1;
          let finalHand1 = [...hand1];
          await playHand(
            message,
            guildId,
            userId,
            finalHand1,
            dealerHand,
            betAmount,
            1,
            currentStreak,
            deckStatus
          );

          // Play hand 2
          let finalScore2 = score2;
          let finalHand2 = [...hand2];
          await playHand(
            message,
            guildId,
            userId,
            finalHand2,
            dealerHand,
            betAmount,
            2,
            currentStreak,
            deckStatus
          );

          gameEnded = true;
          collector.stop();
        }
      } catch (error) {
        console.error("[Blackjack] Error in collector interaction:", error);
        // Ensure collector is stopped even on error
        if (!gameEnded) {
          gameEnded = true;
          collector.stop();
        }
        try {
          await interaction.reply({
            content:
              "An error occurred during the game. Your bet has been refunded.",
            ephemeral: true,
          });
          await updateBalance(guildId, userId, betAmount); // Refund on error
        } catch (replyError) {
          console.error(
            "[Blackjack] Failed to send error message:",
            replyError
          );
        }
      }
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "time") {
        await gameMessage.edit({
          components: [],
          embeds: [gameEmbed.setFooter({ text: "Game timed out! ⏰" })],
        });
      }
    });
  }

  function createDeck() {
    const suits = ["Hearts", "Diamonds", "Clubs", "Spades"];
    const values = [
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "J",
      "Q",
      "K",
      "A",
    ];
    const deck = [];
    for (const suit of suits) {
      for (const value of values) {
        deck.push({ suit, value });
      }
    }
    return deck;
  }

  function createShoe(numDecks = NUM_DECKS) {
    const shoe = [];
    for (let i = 0; i < numDecks; i++) {
      shoe.push(...createDeck());
    }
    shuffle(shoe);
    return shoe;
  }

  function initializeShoe() {
    gameShoe = createShoe();
    runningCount = 0;
    cardsDealt = 0;
  }

  function needsShuffle() {
    const totalCards = NUM_DECKS * 52;
    return cardsDealt >= totalCards * SHUFFLE_THRESHOLD;
  }

  function getDeckStatus() {
    // True count = Running count / Decks remaining
    const totalCards = NUM_DECKS * 52;
    const cardsRemaining = totalCards - cardsDealt;
    const decksRemaining = cardsRemaining / 52;
    const trueCount = decksRemaining > 0 ? runningCount / decksRemaining : 0;

    if (trueCount >= 2) return "HOT";
    if (trueCount <= -2) return "COLD";
    return "NEUTRAL";
  }

  function updateCount(card) {
    // Hi-Lo counting system
    const value = card.value;
    if (["2", "3", "4", "5", "6"].includes(value)) {
      runningCount += 1; // Low cards favor player
    } else if (["10", "J", "Q", "K", "A"].includes(value)) {
      runningCount -= 1; // High cards favor dealer
    }
    // 7, 8, 9 are neutral (0)
  }

  function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  function drawCard(shoe) {
    if (needsShuffle() || shoe.length === 0) {
      initializeShoe();
      shoe = gameShoe;
    }
    const card = shoe.pop();
    cardsDealt++;
    updateCount(card);
    return card;
  }

  function calculateHandValue(hand) {
    let value = 0;
    let aces = 0;
    for (const card of hand) {
      if (["J", "Q", "K"].includes(card.value)) {
        value += 10;
      } else if (card.value === "A") {
        aces += 1;
        value += 11;
      } else {
        value += parseInt(card.value, 10);
      }
    }
    while (value > 21 && aces) {
      value -= 10;
      aces -= 1;
    }
    return value;
  }

  function displayHand(hand) {
    return hand.map((card) => `${card.value} of ${card.suit}`).join(", ");
  }

  function displayHandEmoji(hand) {
    const suitEmojis = {
      Hearts: "♥️",
      Diamonds: "♦️",
      Clubs: "♣️",
      Spades: "♠️",
    };
    return hand
      .map((card) => `${card.value}${suitEmojis[card.suit]}`)
      .join(" ");
  }

  // Streak tracking functions
  function getStreak(userId) {
    if (!fs.existsSync(blackjackStreaksFilePath)) {
      fs.writeFileSync(blackjackStreaksFilePath, "", "utf-8");
    }
    const data = fs.readFileSync(blackjackStreaksFilePath, "utf-8");
    const userRecord = data.split("\n").find((line) => line.startsWith(userId));
    return userRecord ? parseInt(userRecord.split(":")[1], 10) : 0;
  }

  function updateStreak(userId, won) {
    let data = fs.existsSync(blackjackStreaksFilePath)
      ? fs.readFileSync(blackjackStreaksFilePath, "utf-8")
      : "";
    const lines = data.split("\n").filter((line) => line.trim() !== "");
    const userRecordIndex = lines.findIndex((line) => line.startsWith(userId));

    if (won) {
      const currentStreak = getStreak(userId);
      const newStreak = currentStreak + 1;

      if (userRecordIndex >= 0) {
        lines[userRecordIndex] = `${userId}:${newStreak}`;
      } else {
        lines.push(`${userId}:${newStreak}`);
      }
    } else {
      // Lost - reset streak
      if (userRecordIndex >= 0) {
        lines[userRecordIndex] = `${userId}:0`;
      } else {
        lines.push(`${userId}:0`);
      }
    }

    fs.writeFileSync(
      blackjackStreaksFilePath,
      lines.join("\n") + "\n",
      "utf-8"
    );
  }

  function calculateStreakBonus(baseWinnings, streak) {
    if (streak >= 3) {
      return Math.floor(baseWinnings * 0.1); // 10% bonus
    }
    return 0;
  }

  async function playHand(
    message,
    guildId,
    userId,
    playerHand,
    dealerHand,
    betAmount,
    handNumber,
    currentStreak,
    deckStatus
  ) {
    // Simplified hand play for split - auto-play to 17+
    let playerScore = calculateHandValue(playerHand);

    // Player draws until 17 or bust (simplified for split)
    while (playerScore < 17 && playerScore <= 21) {
      playerHand.push(drawCard(gameShoe));
      playerScore = calculateHandValue(playerHand);
    }

    // Dealer plays
    let dealerScore = calculateHandValue(dealerHand);
    while (dealerScore < 17) {
      dealerHand.push(drawCard(gameShoe));
      dealerScore = calculateHandValue(dealerHand);
    }

    // Determine result
    let won = false;
    let resultMessage = "";
    let gameState = "lose";
    let payout = 0;

    if (playerScore > 21) {
      await updateHouse(betAmount);
      resultMessage = `💥 Hand ${handNumber} Bust! Lost ${await formatCurrency(guildId, betAmount)}`;
      gameState = "bust";
    } else if (dealerScore > 21 || playerScore > dealerScore) {
      const baseWinnings = betAmount * 2;
      const streakBonus = calculateStreakBonus(baseWinnings, currentStreak);
      payout = baseWinnings + streakBonus;
      await updateBalance(guildId, userId, payout);
      won = true;
      resultMessage = `🎉 Hand ${handNumber} Wins! Won ${await formatCurrency(guildId, payout)}`;
      gameState = "win";
    } else if (playerScore === dealerScore) {
      await updateBalance(guildId, userId, betAmount);
      resultMessage = `🤝 Hand ${handNumber} Push! Returned ${await formatCurrency(guildId, betAmount)}`;
      gameState = "tie";
    } else {
      await updateHouse(betAmount);
      resultMessage = `😢 Hand ${handNumber} Loses! Lost ${await formatCurrency(guildId, betAmount)}`;
      gameState = "lose";
    }

    // Update streak based on result
    if (won) {
      updateStreak(userId, true);
    } else if (gameState === "lose" || gameState === "bust") {
      updateStreak(userId, false);
    }

    const finalCanvas = await createGameTable(
      playerHand,
      dealerHand,
      playerScore,
      dealerScore,
      gameState,
      message.author.username,
      betAmount,
      false,
      won ? currentStreak + 1 : 0,
      deckStatus
    );
    const finalAttachment = new AttachmentBuilder(finalCanvas.toBuffer(), {
      name: `blackjack-hand${handNumber}.png`,
    });

    const embed = new EmbedBuilder()
      .setTitle(`🎰 Blackjack - Hand ${handNumber} Result`)
      .setColor(
        gameState === "win"
          ? "#00ff00"
          : gameState === "tie"
            ? "#ffaa00"
            : "#ff0000"
      )
      .setDescription(resultMessage)
      .setImage(`attachment://blackjack-hand${handNumber}.png`)
      .addFields(
        {
          name: "🎯 Your Hand",
          value: `${displayHandEmoji(playerHand)}\n**Score:** ${playerScore}`,
          inline: true,
        },
        {
          name: "🎭 Dealer",
          value: `${displayHandEmoji(dealerHand)}\n**Score:** ${dealerScore}`,
          inline: true,
        },
        {
          name: "💰 Balance",
          value: await formatCurrency(guildId, await getBalance(guildId, userId)),
          inline: true,
        }
      )
      .setTimestamp();

    await message.channel.send({ embeds: [embed], files: [finalAttachment] });
  }
};
