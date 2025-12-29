const {
  ActionRowBuilder,
  ButtonBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ButtonStyle,
} = require("discord.js");
const { createCanvas } = require("canvas");
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

const baccaratStreaksFilePath = path.join(
  __dirname,
  "../data/baccarat_streaks.txt"
);

// 8-deck shoe configuration (standard for Baccarat)
const NUM_DECKS = 8;
let gameShoe = [];
let pendingShuffleAnnouncement = null; // Store channel for shuffle announcement

// Round history tracking (resets on shuffle)
// 'P' = Player, 'B' = Banker, 'T' = Tie
let roundHistory = [];
const MAX_HISTORY = 20; // Show last 20 rounds

// Initialize shoe at startup
function initializeShoe() {
  const suits = ["Hearts", "Diamonds", "Clubs", "Spades"];
  const values = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  gameShoe = [];
  for (let i = 0; i < NUM_DECKS; i++) {
    for (const suit of suits) {
      for (const value of values) {
        gameShoe.push({ suit, value });
      }
    }
  }
  // Fisher-Yates shuffle
  for (let i = gameShoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [gameShoe[i], gameShoe[j]] = [gameShoe[j], gameShoe[i]];
  }
  // Reset history on new shoe
  roundHistory = [];
  console.log(`[Baccarat] Shuffled new ${NUM_DECKS}-deck shoe (${gameShoe.length} cards)`);
}
initializeShoe();

// Draw card from shoe, track if shuffle needed
function drawCard(channel) {
  if (gameShoe.length < 52) {
    // Reshuffle when fewer than 52 cards remain
    initializeShoe();
    pendingShuffleAnnouncement = channel;
  }
  return gameShoe.pop();
}

// Send shuffle announcement if pending
async function checkShuffleAnnouncement(channel) {
  if (pendingShuffleAnnouncement) {
    const shuffleEmbed = new EmbedBuilder()
      .setColor("#2ECC71")
      .setDescription("🔀 The dealer shuffles a fresh 8-deck shoe...");
    await channel.send({ embeds: [shuffleEmbed] }).catch(() => {});
    pendingShuffleAnnouncement = null;
  }
}

// Format round history as colored circles
// Red = Banker, Blue = Player, Green = Tie
function formatRoundHistory() {
  if (roundHistory.length === 0) return "No rounds played yet";
  return roundHistory.map(result => {
    if (result === "B") return "🔴"; // Banker = Red
    if (result === "P") return "🔵"; // Player = Blue
    return "🟢"; // Tie = Green
  }).join("");
}

// Add result to history
function addToHistory(winner) {
  if (winner === "banker") roundHistory.push("B");
  else if (winner === "player") roundHistory.push("P");
  else roundHistory.push("T");

  // Keep only last MAX_HISTORY rounds
  if (roundHistory.length > MAX_HISTORY) {
    roundHistory.shift();
  }
}

// Get history stats
function getHistoryStats() {
  const stats = { player: 0, banker: 0, tie: 0 };
  for (const result of roundHistory) {
    if (result === "P") stats.player++;
    else if (result === "B") stats.banker++;
    else stats.tie++;
  }
  return stats;
}

// Card and game visual constants
const CARD_WIDTH = 80;
const CARD_HEIGHT = 112;
const CARD_SPACING = 15;
const CANVAS_WIDTH = 700;
const CANVAS_HEIGHT = 450;

module.exports = (client) => {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    // EARLY RETURN: Skip if not a baccarat command
    if (!message.content.toLowerCase().startsWith("!baccarat")) return;

    const args = message.content.split(" ");

    if (args[0].toLowerCase() === "!baccarat") {
      // Check subscription tier (PLUS required for baccarat)
      const subCheck = await checkSubscription(
        message.guild.id,
        TIERS.PLUS,
        message.guild.ownerId
      );
      if (!subCheck.hasAccess) {
        const upgradeEmbed = createUpgradeEmbed(
          "Baccarat",
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
            "baccarat",
            "!baccarat [amount]",
            "!baccarat 100"
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

      await startBaccaratGame(message, guildId, userId, betAmount);
    }
  });

  // ==========================================
  // BACCARAT GAME LOGIC
  // ==========================================

  // Calculate Baccarat hand value (mod 10)
  function calculateBaccaratValue(hand) {
    let value = 0;
    for (const card of hand) {
      if (["J", "Q", "K", "10"].includes(card.value)) {
        value += 0;
      } else if (card.value === "A") {
        value += 1;
      } else {
        value += parseInt(card.value, 10);
      }
    }
    return value % 10;
  }

  // Get single card value for third card rules
  function getCardValue(card) {
    if (["J", "Q", "K", "10"].includes(card.value)) return 0;
    if (card.value === "A") return 1;
    return parseInt(card.value, 10);
  }

  // Check for natural (8 or 9)
  function isNatural(hand) {
    if (hand.length !== 2) return false;
    const value = calculateBaccaratValue(hand);
    return value === 8 || value === 9;
  }

  // Check if hand is a pair
  function isPair(hand) {
    return hand.length >= 2 && hand[0].value === hand[1].value;
  }

  // Determine if Player should draw third card
  function shouldPlayerDraw(playerHand) {
    const playerValue = calculateBaccaratValue(playerHand);
    // Player stands on 6-7, draws on 0-5
    return playerValue <= 5;
  }

  // Determine if Banker should draw third card (complex tableau)
  function shouldBankerDraw(bankerHand, playerThirdCard) {
    const bankerValue = calculateBaccaratValue(bankerHand);

    // Banker always stands on 7
    if (bankerValue === 7) return false;

    // If no player third card (Player stood), Banker draws on 0-5
    if (playerThirdCard === null) {
      return bankerValue <= 5;
    }

    const p3 = getCardValue(playerThirdCard);

    // Banker drawing tableau based on Player's third card
    switch (bankerValue) {
      case 0:
      case 1:
      case 2:
        return true; // Always draw
      case 3:
        return p3 !== 8; // Draw unless P3 is 8
      case 4:
        return p3 >= 2 && p3 <= 7; // Draw on 2-7
      case 5:
        return p3 >= 4 && p3 <= 7; // Draw on 4-7
      case 6:
        return p3 === 6 || p3 === 7; // Draw on 6-7 only
      default:
        return false;
    }
  }

  // Determine winner
  function determineWinner(playerHand, bankerHand) {
    const playerValue = calculateBaccaratValue(playerHand);
    const bankerValue = calculateBaccaratValue(bankerHand);

    if (playerValue > bankerValue) return "player";
    if (bankerValue > playerValue) return "banker";
    return "tie";
  }

  // Calculate payouts for all bet types
  function calculatePayouts(bets, winner, playerHand, bankerHand) {
    const payouts = {
      player: { bet: bets.player || 0, winnings: 0, won: false },
      banker: { bet: bets.banker || 0, winnings: 0, won: false },
      tie: { bet: bets.tie || 0, winnings: 0, won: false },
      playerPair: { bet: bets.playerPair || 0, winnings: 0, won: false },
      bankerPair: { bet: bets.bankerPair || 0, winnings: 0, won: false },
    };

    // Main bet payouts
    if (winner === "player") {
      payouts.player.winnings = bets.player * 2; // 1:1 (return bet + winnings)
      payouts.player.won = bets.player > 0;
    } else if (winner === "banker") {
      // 0.95:1 (5% commission)
      payouts.banker.winnings = Math.floor(bets.banker * 1.95);
      payouts.banker.won = bets.banker > 0;
    } else if (winner === "tie") {
      payouts.tie.winnings = bets.tie * 9; // 8:1 (return bet + 8x)
      payouts.tie.won = bets.tie > 0;
      // Main bets are returned on tie (push)
      payouts.player.winnings = bets.player;
      payouts.banker.winnings = bets.banker;
    }

    // Side bet payouts (independent of main result)
    if (isPair(playerHand) && bets.playerPair > 0) {
      payouts.playerPair.winnings = bets.playerPair * 12; // 11:1
      payouts.playerPair.won = true;
    }
    if (isPair(bankerHand) && bets.bankerPair > 0) {
      payouts.bankerPair.winnings = bets.bankerPair * 12; // 11:1
      payouts.bankerPair.won = true;
    }

    return payouts;
  }

  // ==========================================
  // VISUAL RENDERING
  // ==========================================

  // Create visual card representation
  function createCardImage(card) {
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext("2d");

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
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "left";
    ctx.fillText(card.value, 6, 18);
    ctx.font = "12px Arial";
    ctx.fillText(suitSymbols[card.suit], 6, 32);

    // Large center symbol
    ctx.font = "32px Arial";
    ctx.textAlign = "center";
    ctx.fillText(suitSymbols[card.suit], CARD_WIDTH / 2, CARD_HEIGHT / 2 + 12);

    // Value in center
    ctx.font = "bold 20px Arial";
    ctx.fillText(card.value, CARD_WIDTH / 2, CARD_HEIGHT / 2 - 8);

    return canvas;
  }

  // Create baccarat table visualization
  async function createBaccaratTable(
    playerHand,
    bankerHand,
    bets,
    phase,
    result,
    playerName,
    streak
  ) {
    const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    const ctx = canvas.getContext("2d");

    // Casino table background (burgundy/maroon theme)
    const gradient = ctx.createRadialGradient(
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      0,
      CANVAS_WIDTH / 2,
      CANVAS_HEIGHT / 2,
      350
    );
    gradient.addColorStop(0, "#4a1c2a");
    gradient.addColorStop(1, "#2a0f14");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Gold border trim
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, CANVAS_WIDTH - 4, CANVAS_HEIGHT - 4);

    // Title
    ctx.fillStyle = "#ffd700";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.fillText("BACCARAT", CANVAS_WIDTH / 2, 35);

    // Streak indicator
    if (streak >= 3) {
      ctx.fillStyle = "#ff6600";
      ctx.font = "bold 16px Arial";
      ctx.fillText(`🔥 ${streak} WIN STREAK! (+10% BONUS) 🔥`, CANVAS_WIDTH / 2, 58);
    } else if (streak > 0) {
      ctx.fillStyle = "#ffaa00";
      ctx.font = "bold 12px Arial";
      ctx.fillText(`⭐ ${streak} Win Streak`, CANVAS_WIDTH / 2, 55);
    }

    const cardsY = 80;

    // Draw Banker hand (left side)
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("BANKER", 175, cardsY);

    if (bankerHand.length > 0) {
      const bankerValue = calculateBaccaratValue(bankerHand);
      ctx.font = "14px Arial";
      ctx.fillText(`Value: ${bankerValue}`, 175, cardsY + 18);

      const bankerStartX = 175 - ((bankerHand.length * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING) / 2);
      for (let i = 0; i < bankerHand.length; i++) {
        const cardCanvas = createCardImage(bankerHand[i]);
        ctx.drawImage(cardCanvas, bankerStartX + i * (CARD_WIDTH + CARD_SPACING), cardsY + 25);
      }
    }

    // Draw Player hand (right side)
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PLAYER", 525, cardsY);

    if (playerHand.length > 0) {
      const playerValue = calculateBaccaratValue(playerHand);
      ctx.font = "14px Arial";
      ctx.fillText(`Value: ${playerValue}`, 525, cardsY + 18);

      const playerStartX = 525 - ((playerHand.length * (CARD_WIDTH + CARD_SPACING) - CARD_SPACING) / 2);
      for (let i = 0; i < playerHand.length; i++) {
        const cardCanvas = createCardImage(playerHand[i]);
        ctx.drawImage(cardCanvas, playerStartX + i * (CARD_WIDTH + CARD_SPACING), cardsY + 25);
      }
    }

    // Draw bet zones
    const betY = 260;
    const betZones = [
      { label: "PLAYER", payout: "1:1", bet: bets.player, x: 70, highlight: result === "player" },
      { label: "BANKER", payout: "0.95:1", bet: bets.banker, x: 190, highlight: result === "banker" },
      { label: "TIE", payout: "8:1", bet: bets.tie, x: 310, highlight: result === "tie" },
      { label: "P PAIR", payout: "11:1", bet: bets.playerPair, x: 430, highlight: isPair(playerHand) && bets.playerPair > 0 },
      { label: "B PAIR", payout: "11:1", bet: bets.bankerPair, x: 550, highlight: isPair(bankerHand) && bets.bankerPair > 0 },
    ];

    for (const zone of betZones) {
      // Bet zone background
      ctx.fillStyle = zone.highlight && phase === "result" ? "#2ECC71" : "rgba(255, 215, 0, 0.2)";
      ctx.fillRect(zone.x, betY, 100, 80);
      ctx.strokeStyle = zone.bet > 0 ? "#ffd700" : "#666666";
      ctx.lineWidth = 2;
      ctx.strokeRect(zone.x, betY, 100, 80);

      // Zone label
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "center";
      ctx.fillText(zone.label, zone.x + 50, betY + 20);

      // Payout ratio
      ctx.fillStyle = "#aaaaaa";
      ctx.font = "10px Arial";
      ctx.fillText(zone.payout, zone.x + 50, betY + 35);

      // Bet amount
      if (zone.bet > 0) {
        ctx.fillStyle = "#ffd700";
        ctx.font = "bold 14px Arial";
        ctx.fillText(`🍯${zone.bet}`, zone.x + 50, betY + 60);
      }
    }

    // Player info bar
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 380, CANVAS_WIDTH, 70);

    ctx.fillStyle = "#ffffff";
    ctx.font = "14px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Player: ${playerName}`, 20, 410);

    const totalBet = (bets.player || 0) + (bets.banker || 0) + (bets.tie || 0) + (bets.playerPair || 0) + (bets.bankerPair || 0);
    ctx.textAlign = "center";
    ctx.fillText(`Total Bet: 🍯${totalBet}`, CANVAS_WIDTH / 2, 410);

    // Result overlay
    if (phase === "result" && result) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 40px Arial";
      ctx.textAlign = "center";

      let resultText = "";
      if (result === "player") resultText = "PLAYER WINS!";
      else if (result === "banker") resultText = "BANKER WINS!";
      else if (result === "tie") resultText = "TIE!";

      ctx.fillText(resultText, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);

      // Show hand values
      ctx.font = "24px Arial";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(
        `Banker: ${calculateBaccaratValue(bankerHand)}  |  Player: ${calculateBaccaratValue(playerHand)}`,
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2 + 20
      );
    }

    return canvas;
  }

  // Display hand with emoji
  function displayHandEmoji(hand) {
    const suitEmojis = {
      Hearts: "♥️",
      Diamonds: "♦️",
      Clubs: "♣️",
      Spades: "♠️",
    };
    return hand.map((card) => `${card.value}${suitEmojis[card.suit]}`).join(" ");
  }

  // ==========================================
  // STREAK SYSTEM
  // ==========================================

  function getStreak(userId) {
    if (!fs.existsSync(baccaratStreaksFilePath)) {
      fs.writeFileSync(baccaratStreaksFilePath, "", "utf-8");
    }
    const data = fs.readFileSync(baccaratStreaksFilePath, "utf-8");
    const userRecord = data.split("\n").find((line) => line.startsWith(userId));
    return userRecord ? parseInt(userRecord.split(":")[1], 10) : 0;
  }

  function updateStreak(userId, won) {
    let data = fs.existsSync(baccaratStreaksFilePath)
      ? fs.readFileSync(baccaratStreaksFilePath, "utf-8")
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
      if (userRecordIndex >= 0) {
        lines[userRecordIndex] = `${userId}:0`;
      } else {
        lines.push(`${userId}:0`);
      }
    }

    fs.writeFileSync(baccaratStreaksFilePath, lines.join("\n") + "\n", "utf-8");
  }

  function calculateStreakBonus(baseWinnings, streak) {
    if (streak >= 3) {
      return Math.floor(baseWinnings * 0.1);
    }
    return 0;
  }

  // ==========================================
  // MAIN GAME FLOW
  // ==========================================

  async function startBaccaratGame(message, guildId, userId, baseAmount) {
    const channel = message.channel;

    // Check for shuffle announcement
    await checkShuffleAnnouncement(channel);

    const currentStreak = getStreak(userId);
    const currentBalance = await getBalance(guildId, userId);

    // Game state
    const gameId = `baccarat_${Date.now()}_${userId}`;
    const bets = {
      player: 0,
      banker: 0,
      tie: 0,
      playerPair: 0,
      bankerPair: 0,
    };

    // Create initial betting interface
    const createBettingEmbed = async () => {
      const totalBet = bets.player + bets.banker + bets.tie + bets.playerPair + bets.bankerPair;
      const remainingBalance = currentBalance - totalBet;

      let betsDisplay = "";
      if (bets.player > 0) betsDisplay += `Player: 🍯${bets.player}\n`;
      if (bets.banker > 0) betsDisplay += `Banker: 🍯${bets.banker}\n`;
      if (bets.tie > 0) betsDisplay += `Tie: 🍯${bets.tie}\n`;
      if (bets.playerPair > 0) betsDisplay += `Player Pair: 🍯${bets.playerPair}\n`;
      if (bets.bankerPair > 0) betsDisplay += `Banker Pair: 🍯${bets.bankerPair}\n`;
      if (!betsDisplay) betsDisplay = "No bets placed yet";

      const streakInfo = currentStreak >= 3
        ? `\n🔥 **${currentStreak} Win Streak! +10% Bonus Active!**`
        : currentStreak > 0
        ? `\n⭐ ${currentStreak} Win Streak`
        : "";

      // Get history stats
      const stats = getHistoryStats();
      const historyDisplay = formatRoundHistory();
      const statsDisplay = roundHistory.length > 0
        ? `🔵 P: ${stats.player} | 🔴 B: ${stats.banker} | 🟢 T: ${stats.tie}`
        : "No rounds yet";

      return new EmbedBuilder()
        .setTitle("🎰 Baccarat - Place Your Bets")
        .setColor("#4a1c2a")
        .setDescription(
          `**${message.author.username}** is playing Baccarat!\nBet amount per click: **${await formatCurrency(guildId, baseAmount)}**${streakInfo}`
        )
        .addFields(
          { name: "📊 Current Bets", value: betsDisplay, inline: true },
          { name: "💰 Total Wagered", value: `🍯${totalBet}`, inline: true },
          { name: "💵 Remaining", value: `🍯${remainingBalance}`, inline: true },
          { name: "📜 Round History", value: historyDisplay, inline: false },
          { name: "📈 Stats", value: statsDisplay, inline: false }
        )
        .setFooter({ text: "🔵 Player | 🔴 Banker | 🟢 Tie • Click bet buttons, then DEAL" });
    };

    const createBettingButtons = async () => {
      const totalBet = bets.player + bets.banker + bets.tie + bets.playerPair + bets.bankerPair;
      const remainingBalance = currentBalance - totalBet;
      const canAddBet = remainingBalance >= baseAmount;

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${gameId}_player`)
          .setLabel(`Player (1:1)`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!canAddBet),
        new ButtonBuilder()
          .setCustomId(`${gameId}_banker`)
          .setLabel(`Banker (0.95:1)`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!canAddBet),
        new ButtonBuilder()
          .setCustomId(`${gameId}_tie`)
          .setLabel(`Tie (8:1)`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!canAddBet)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${gameId}_ppair`)
          .setLabel(`P Pair (11:1)`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!canAddBet),
        new ButtonBuilder()
          .setCustomId(`${gameId}_bpair`)
          .setLabel(`B Pair (11:1)`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!canAddBet),
        new ButtonBuilder()
          .setCustomId(`${gameId}_deal`)
          .setLabel("DEAL CARDS")
          .setStyle(ButtonStyle.Success)
          .setEmoji("🎴")
          .setDisabled(totalBet === 0)
      );

      return [row1, row2];
    };

    // Send initial betting interface
    const gameMessage = await channel.send({
      embeds: [await createBettingEmbed()],
      components: await createBettingButtons(),
    });

    // Create button collector
    const filter = (i) => i.user.id === userId && i.customId.startsWith(gameId);
    const collector = gameMessage.createMessageComponentCollector({
      filter,
      time: 120000,
    });

    let gameEnded = false;

    collector.on("collect", async (interaction) => {
      try {
        const action = interaction.customId.replace(`${gameId}_`, "");
        const totalBet = bets.player + bets.banker + bets.tie + bets.playerPair + bets.bankerPair;
        const remainingBalance = currentBalance - totalBet;

        if (action === "deal") {
          // Execute the game
          gameEnded = true;
          collector.stop("deal");
          await executeBaccaratGame(interaction, message, guildId, userId, bets, currentStreak);
        } else {
          // Place bet
          if (remainingBalance >= baseAmount) {
            switch (action) {
              case "player":
                bets.player += baseAmount;
                break;
              case "banker":
                bets.banker += baseAmount;
                break;
              case "tie":
                bets.tie += baseAmount;
                break;
              case "ppair":
                bets.playerPair += baseAmount;
                break;
              case "bpair":
                bets.bankerPair += baseAmount;
                break;
            }

            await interaction.update({
              embeds: [await createBettingEmbed()],
              components: await createBettingButtons(),
            });
          } else {
            await interaction.reply({
              content: "You don't have enough balance to place more bets!",
              ephemeral: true,
            });
          }
        }
      } catch (error) {
        console.error("[Baccarat] Collector error:", error);
      }
    });

    collector.on("end", async (collected, reason) => {
      if (reason === "time" && !gameEnded) {
        // Timeout - no bets were dealt
        const timeoutEmbed = new EmbedBuilder()
          .setTitle("🎰 Baccarat - Timed Out")
          .setColor("#ff6600")
          .setDescription("No bets were placed in time. Game cancelled.");

        await gameMessage.edit({
          embeds: [timeoutEmbed],
          components: [],
        }).catch(() => {});
      }
    });
  }

  async function executeBaccaratGame(interaction, message, guildId, userId, bets, currentStreak) {
    const channel = message.channel;

    // Calculate total bet and deduct from balance
    const totalBet = bets.player + bets.banker + bets.tie + bets.playerPair + bets.bankerPair;
    await updateBalance(guildId, userId, -totalBet);

    // Check for shuffle announcement
    await checkShuffleAnnouncement(channel);

    // Deal initial cards
    const playerHand = [drawCard(channel), drawCard(channel)];
    const bankerHand = [drawCard(channel), drawCard(channel)];

    // Check for naturals
    const playerNatural = isNatural(playerHand);
    const bankerNatural = isNatural(bankerHand);

    // Apply third card rules if no naturals
    let playerThirdCard = null;
    if (!playerNatural && !bankerNatural) {
      // Player draws first
      if (shouldPlayerDraw(playerHand)) {
        playerThirdCard = drawCard(channel);
        playerHand.push(playerThirdCard);
      }

      // Banker draws based on Player's action
      if (shouldBankerDraw(bankerHand, playerThirdCard)) {
        bankerHand.push(drawCard(channel));
      }
    }

    // Determine winner
    const winner = determineWinner(playerHand, bankerHand);

    // Add to round history
    addToHistory(winner);

    // Calculate payouts
    const payouts = calculatePayouts(bets, winner, playerHand, bankerHand);
    const totalWinnings = Object.values(payouts).reduce((sum, p) => sum + p.winnings, 0);
    const netResult = totalWinnings - totalBet;

    // Determine if main bet won (for streak tracking)
    const mainBetWon =
      (winner === "player" && bets.player > 0) ||
      (winner === "banker" && bets.banker > 0) ||
      (winner === "tie" && bets.tie > 0);

    // Calculate streak bonus
    const newStreak = mainBetWon ? currentStreak + 1 : 0;
    const streakBonus = mainBetWon ? calculateStreakBonus(totalWinnings, currentStreak) : 0;
    const finalWinnings = totalWinnings + streakBonus;

    // Update balance
    await updateBalance(guildId, userId, finalWinnings);

    // Update house (for losses)
    const houseProfit = totalBet - totalWinnings;
    if (houseProfit > 0) {
      await updateHouse(houseProfit);
    }

    // Update streak
    updateStreak(userId, mainBetWon);

    // Create result visualization
    const resultCanvas = await createBaccaratTable(
      playerHand,
      bankerHand,
      bets,
      "result",
      winner,
      message.author.username,
      newStreak
    );

    const attachment = new AttachmentBuilder(resultCanvas.toBuffer(), {
      name: "baccarat-result.png",
    });

    // Build result description
    let resultDescription = "";

    // Show pair results
    if (isPair(playerHand)) {
      resultDescription += "🎯 **Player Pair!**\n";
    }
    if (isPair(bankerHand)) {
      resultDescription += "🎯 **Banker Pair!**\n";
    }

    // Show main result
    if (winner === "player") {
      resultDescription += "🏆 **Player wins!**\n";
    } else if (winner === "banker") {
      resultDescription += "🏆 **Banker wins!**\n";
    } else {
      resultDescription += "🤝 **It's a Tie!**\n";
    }

    // Show payouts breakdown
    let payoutBreakdown = "";
    if (payouts.player.winnings > 0) payoutBreakdown += `Player: +🍯${payouts.player.winnings}\n`;
    if (payouts.banker.winnings > 0) payoutBreakdown += `Banker: +🍯${payouts.banker.winnings}\n`;
    if (payouts.tie.winnings > 0) payoutBreakdown += `Tie: +🍯${payouts.tie.winnings}\n`;
    if (payouts.playerPair.winnings > 0) payoutBreakdown += `Player Pair: +🍯${payouts.playerPair.winnings}\n`;
    if (payouts.bankerPair.winnings > 0) payoutBreakdown += `Banker Pair: +🍯${payouts.bankerPair.winnings}\n`;
    if (streakBonus > 0) payoutBreakdown += `🔥 Streak Bonus: +🍯${streakBonus}\n`;

    if (!payoutBreakdown) payoutBreakdown = "No winnings";

    // Determine embed color
    let embedColor = "#ff0000"; // Red for loss
    if (netResult > 0) embedColor = "#2ECC71"; // Green for profit
    else if (netResult === 0) embedColor = "#f39c12"; // Orange for break-even

    const newBalance = await getBalance(guildId, userId);

    // Get updated history
    const historyStats = getHistoryStats();

    const resultEmbed = new EmbedBuilder()
      .setTitle(`🎰 Baccarat - ${winner === "tie" ? "Tie!" : winner === "player" ? "Player Wins!" : "Banker Wins!"}`)
      .setColor(embedColor)
      .setDescription(resultDescription)
      .setImage("attachment://baccarat-result.png")
      .addFields(
        {
          name: "🎴 Hands",
          value: `**Banker:** ${displayHandEmoji(bankerHand)} (${calculateBaccaratValue(bankerHand)})\n**Player:** ${displayHandEmoji(playerHand)} (${calculateBaccaratValue(playerHand)})`,
          inline: true,
        },
        {
          name: "💰 Payouts",
          value: payoutBreakdown,
          inline: true,
        },
        {
          name: "📊 Result",
          value: `**Bet:** 🍯${totalBet}\n**Won:** 🍯${finalWinnings}\n**Net:** ${netResult >= 0 ? "+" : ""}🍯${netResult}\n**Balance:** 🍯${newBalance}${newStreak >= 3 ? `\n🔥 **${newStreak} Win Streak!**` : newStreak > 0 ? `\n⭐ ${newStreak} Streak` : ""}`,
          inline: true,
        },
        {
          name: "📜 Round History",
          value: formatRoundHistory(),
          inline: false,
        },
        {
          name: "📈 Shoe Stats",
          value: `🔵 P: ${historyStats.player} | 🔴 B: ${historyStats.banker} | 🟢 T: ${historyStats.tie}`,
          inline: false,
        }
      )
      .setFooter({ text: "🔵 Player | 🔴 Banker | 🟢 Tie • Pays 1:1, 0.95:1, 8:1, Pairs 11:1" })
      .setTimestamp();

    await interaction.update({
      embeds: [resultEmbed],
      files: [attachment],
      components: [],
    });
  }

  // Handle button interactions
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("baccarat_")) return;

    // Interactions are handled by the collector in startBaccaratGame
    // This is just a fallback for expired games
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "This game has expired. Start a new game with `!baccarat [amount]`",
          ephemeral: true,
        });
      } catch {
        // Ignore errors from already replied interactions
      }
    }
  });
};
