const {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { createCanvas } = require("canvas");
const GIFEncoder = require("gif-encoder-2");
const {
  getBalance,
  updateBalance,
} = require("../database/helpers/convexEconomyHelpers");
const { updateHouse } = require("../database/helpers/serverHelpers");
const {
  insufficientFundsMessage,
  invalidUsageMessage,
} = require("../utils/errorMessages");
const {
  checkSubscription,
  createUpgradeEmbed,
  TIERS,
} = require("../utils/subscriptionUtils");
const { formatCurrency } = require("../utils/currencyHelper");

// ==========================================
// CONSTANTS
// ==========================================

const BOARD_WIDTH = 500;
const BOARD_HEIGHT = 350;

// GIF animation settings
const GIF_FPS = 20;
const GIF_FRAME_DELAY = Math.floor(1000 / GIF_FPS);
const GIF_QUALITY = 10;

// Crash game settings
const HOUSE_EDGE = 0.01; // 1% house edge (matches Stake)
const MIN_CRASH = 1.0;
const MAX_DISPLAY_MULTIPLIER = 100; // Cap display at 100x

// Pre-defined cash-out options (user-friendly)
const CASHOUT_OPTIONS = [
  { label: "1.5x", value: 1.5, style: ButtonStyle.Success },
  { label: "2x", value: 2.0, style: ButtonStyle.Success },
  { label: "3x", value: 3.0, style: ButtonStyle.Primary },
  { label: "5x", value: 5.0, style: ButtonStyle.Primary },
  { label: "10x", value: 10.0, style: ButtonStyle.Danger },
];

// Colors
const COLORS = {
  background: "#0d1117",
  graphBg: "#161b22",
  graphLine: "#58a6ff",
  graphFill: "rgba(88, 166, 255, 0.1)",
  crashed: "#f85149",
  win: "#3fb950",
  text: "#ffffff",
  textDim: "#8b949e",
  gold: "#ffd700",
  gridLine: "#30363d",
  rocketTrail: "#ff6b6b",
};

// ==========================================
// CRASH POINT GENERATION
// ==========================================

/**
 * Generate a crash point using Stake's formula
 * Win probability = 0.99 / multiplier (99% RTP)
 *
 * Approximate win rates:
 * - 1.5x: ~66%
 * - 2.0x: ~50%
 * - 3.0x: ~33%
 * - 5.0x: ~20%
 * - 10.0x: ~10%
 * - 100.0x: ~1%
 */
function generateCrashPoint() {
  // Random value between 0 and 1
  const e = Math.random();

  // 1% of games crash instantly at 1.00x (house edge)
  if (e < HOUSE_EDGE) {
    return 1.0;
  }

  // Stake's formula: crashPoint = (1 - houseEdge) / random
  // This gives exactly 99% RTP
  const crashPoint = (1 - HOUSE_EDGE) / e;

  // Round to 2 decimal places, minimum 1.00
  return Math.max(1.0, Math.floor(crashPoint * 100) / 100);
}

/**
 * Generate multiplier curve for animation
 * @param {number} crashPoint - The point where game crashes
 * @param {number} duration - Duration in frames
 */
function generateMultiplierCurve(crashPoint, duration) {
  const curve = [];

  // Use exponential growth curve
  // m(t) = e^(kt) where k is calculated to reach crashPoint at duration
  const k = Math.log(crashPoint) / duration;

  for (let frame = 0; frame <= duration; frame++) {
    const t = frame / duration;
    // Exponential curve that starts slow and accelerates
    const multiplier = Math.exp(k * frame);
    curve.push(Math.min(multiplier, crashPoint));
  }

  return curve;
}

// ==========================================
// CANVAS RENDERING
// ==========================================

function drawBackground(ctx) {
  // Dark gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, BOARD_HEIGHT);
  gradient.addColorStop(0, COLORS.background);
  gradient.addColorStop(1, "#161b22");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
}

function drawHeader(ctx, playerName, betAmount, targetMultiplier, currencyEmoji) {
  // Header background
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, BOARD_WIDTH, 50);

  // Title
  ctx.fillStyle = COLORS.gold;
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "center";
  ctx.fillText("CRASH", BOARD_WIDTH / 2, 22);

  // Player info
  ctx.fillStyle = COLORS.text;
  ctx.font = "12px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`Player: ${playerName}`, 10, 40);

  ctx.textAlign = "center";
  ctx.fillText(`Bet: ${betAmount.toLocaleString()}`, BOARD_WIDTH / 2, 40);

  // Target multiplier
  ctx.fillStyle = COLORS.graphLine;
  ctx.textAlign = "right";
  ctx.fillText(`Target: ${targetMultiplier}x`, BOARD_WIDTH - 10, 40);
}

function drawGraph(ctx, multiplierHistory, currentMultiplier, crashed, graphArea, totalFrames) {
  const { x, y, width, height } = graphArea;

  // Graph background
  ctx.fillStyle = COLORS.graphBg;
  ctx.fillRect(x, y, width, height);

  // Graph border
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);

  // Draw grid lines
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 0.5;

  // Dynamic max display - scales with current multiplier
  const maxDisplayMult = Math.max(currentMultiplier * 1.5, 2.5);

  // Horizontal grid lines (multiplier levels)
  const gridLevels = [1.5, 2, 3, 5, 10, 20, 50];

  for (const level of gridLevels) {
    if (level <= maxDisplayMult && level >= 1) {
      const yPos = y + height - ((level - 1) / (maxDisplayMult - 1)) * height;
      if (yPos >= y && yPos <= y + height) {
        ctx.beginPath();
        ctx.moveTo(x, yPos);
        ctx.lineTo(x + width, yPos);
        ctx.stroke();

        // Label
        ctx.fillStyle = COLORS.textDim;
        ctx.font = "10px Arial";
        ctx.textAlign = "right";
        ctx.fillText(`${level}x`, x - 5, yPos + 3);
      }
    }
  }

  // Draw 1x baseline
  const baselineY = y + height;
  ctx.fillStyle = COLORS.textDim;
  ctx.font = "10px Arial";
  ctx.textAlign = "right";
  ctx.fillText("1x", x - 5, baselineY - 2);

  // Draw multiplier curve
  if (multiplierHistory.length > 0) {
    ctx.beginPath();
    ctx.strokeStyle = crashed ? COLORS.crashed : COLORS.graphLine;
    ctx.lineWidth = 3;

    // X position based on frame progress (spreads across full width)
    const frameCount = multiplierHistory.length;
    const maxFrames = totalFrames || frameCount;

    for (let i = 0; i < multiplierHistory.length; i++) {
      // X spreads based on time/frame progress
      const xPos = x + (i / maxFrames) * width;
      const mult = multiplierHistory[i];
      // Y position: 1x at bottom, higher multipliers go up
      const yPos = y + height - ((mult - 1) / (maxDisplayMult - 1)) * height;
      const clampedY = Math.max(y, Math.min(y + height, yPos));

      if (i === 0) {
        ctx.moveTo(xPos, clampedY);
      } else {
        ctx.lineTo(xPos, clampedY);
      }
    }
    ctx.stroke();

    // Fill under the curve
    const lastXPos = x + ((multiplierHistory.length - 1) / maxFrames) * width;
    ctx.lineTo(lastXPos, y + height);
    ctx.lineTo(x, y + height);
    ctx.closePath();
    ctx.fillStyle = crashed ? "rgba(248, 81, 73, 0.15)" : COLORS.graphFill;
    ctx.fill();

    // Draw rocket/dot at current position
    const lastMult = multiplierHistory[multiplierHistory.length - 1];
    const lastY = y + height - ((lastMult - 1) / (maxDisplayMult - 1)) * height;
    const clampedLastY = Math.max(y + 8, Math.min(y + height - 8, lastY));

    // Glow effect first (behind)
    ctx.beginPath();
    ctx.arc(lastXPos, clampedLastY, 14, 0, Math.PI * 2);
    ctx.fillStyle = crashed ? "rgba(248, 81, 73, 0.4)" : "rgba(88, 166, 255, 0.4)";
    ctx.fill();

    // Main dot
    ctx.beginPath();
    ctx.arc(lastXPos, clampedLastY, 8, 0, Math.PI * 2);
    ctx.fillStyle = crashed ? COLORS.crashed : COLORS.graphLine;
    ctx.fill();

    // Inner highlight
    ctx.beginPath();
    ctx.arc(lastXPos - 2, clampedLastY - 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fill();
  }
}

function drawMultiplierDisplay(ctx, multiplier, crashed, cashedOut) {
  const centerX = BOARD_WIDTH / 2;
  const centerY = 160;

  // Large multiplier display
  ctx.font = "bold 64px Arial";
  ctx.textAlign = "center";

  if (crashed && !cashedOut) {
    ctx.fillStyle = COLORS.crashed;
    ctx.fillText("CRASHED!", centerX, centerY);
    ctx.font = "bold 32px Arial";
    ctx.fillText(`@ ${multiplier.toFixed(2)}x`, centerX, centerY + 40);
  } else if (cashedOut) {
    ctx.fillStyle = COLORS.win;
    ctx.fillText(`${multiplier.toFixed(2)}x`, centerX, centerY);
    ctx.font = "bold 24px Arial";
    ctx.fillText("CASHED OUT!", centerX, centerY + 35);
  } else {
    ctx.fillStyle = COLORS.graphLine;
    ctx.fillText(`${multiplier.toFixed(2)}x`, centerX, centerY);
  }
}

function drawResultOverlay(ctx, won, multiplier, winnings, betAmount, currencyEmoji) {
  const netResult = winnings - betAmount;

  // Semi-transparent overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
  ctx.fillRect(75, 200, BOARD_WIDTH - 150, 120);
  ctx.strokeStyle = won ? COLORS.win : COLORS.crashed;
  ctx.lineWidth = 2;
  ctx.strokeRect(75, 200, BOARD_WIDTH - 150, 120);

  ctx.textAlign = "center";

  if (won) {
    // Win display
    ctx.fillStyle = COLORS.win;
    ctx.font = "bold 24px Arial";
    ctx.fillText("YOU WON!", BOARD_WIDTH / 2, 235);

    ctx.font = "bold 18px Arial";
    ctx.fillText(`Cashed out at ${multiplier.toFixed(2)}x`, BOARD_WIDTH / 2, 265);

    ctx.fillStyle = COLORS.gold;
    ctx.font = "bold 20px Arial";
    ctx.fillText(`+${netResult.toLocaleString()}`, BOARD_WIDTH / 2, 300);
  } else {
    // Loss display
    ctx.fillStyle = COLORS.crashed;
    ctx.font = "bold 24px Arial";
    ctx.fillText("CRASHED!", BOARD_WIDTH / 2, 235);

    ctx.font = "bold 18px Arial";
    ctx.fillText(`Crashed at ${multiplier.toFixed(2)}x`, BOARD_WIDTH / 2, 265);

    ctx.fillStyle = COLORS.crashed;
    ctx.font = "bold 20px Arial";
    ctx.fillText(`-${betAmount.toLocaleString()}`, BOARD_WIDTH / 2, 300);
  }
}

async function renderCrashFrame(gameState) {
  const canvas = createCanvas(BOARD_WIDTH, BOARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // 1. Background
  drawBackground(ctx);

  // 2. Header
  drawHeader(
    ctx,
    gameState.playerName,
    gameState.betAmount,
    gameState.targetMultiplier,
    gameState.currencyEmoji
  );

  // 3. Graph area
  const graphArea = {
    x: 60,
    y: 55,
    width: BOARD_WIDTH - 80,
    height: 120,
  };

  drawGraph(
    ctx,
    gameState.multiplierHistory,
    gameState.currentMultiplier,
    gameState.crashed,
    graphArea,
    gameState.totalFrames
  );

  // 4. Multiplier display
  drawMultiplierDisplay(
    ctx,
    gameState.currentMultiplier,
    gameState.crashed,
    gameState.cashedOut
  );

  // 5. Result overlay (if game ended)
  if (gameState.phase === "result") {
    drawResultOverlay(
      ctx,
      gameState.won,
      gameState.resultMultiplier,
      gameState.winnings,
      gameState.betAmount,
      gameState.currencyEmoji
    );
  }

  return canvas;
}

// ==========================================
// GIF GENERATION
// ==========================================

async function generateCrashGIF(gameState, crashPoint, targetMultiplier) {
  const encoder = new GIFEncoder(BOARD_WIDTH, BOARD_HEIGHT);
  encoder.setDelay(GIF_FRAME_DELAY);
  encoder.setQuality(GIF_QUALITY);
  encoder.setRepeat(-1); // No repeat
  encoder.start();

  // Determine outcome
  const cashedOut = targetMultiplier <= crashPoint;
  const resultMultiplier = cashedOut ? targetMultiplier : crashPoint;

  // Calculate animation duration - use the result multiplier for timing
  // This ensures the animation always goes to the end point (cashout or crash)
  const endMultiplier = cashedOut ? targetMultiplier : crashPoint;
  const baseDuration = 50; // frames
  const durationMultiplier = Math.log(endMultiplier + 1) / Math.log(2);
  const totalFrames = Math.max(30, Math.min(Math.floor(baseDuration * durationMultiplier), 80));

  // Generate the multiplier curve up to the end point
  const curve = generateMultiplierCurve(endMultiplier, totalFrames);

  // Generate frames
  const multiplierHistory = [];

  for (let frame = 0; frame <= totalFrames; frame++) {
    const currentMult = curve[frame] || endMultiplier;
    multiplierHistory.push(currentMult);

    const isLastFrame = frame === totalFrames;

    const frameState = {
      ...gameState,
      multiplierHistory: [...multiplierHistory],
      currentMultiplier: currentMult,
      crashed: isLastFrame && !cashedOut,
      cashedOut: isLastFrame && cashedOut,
      phase: isLastFrame ? "result" : "playing",
      won: cashedOut,
      resultMultiplier: resultMultiplier,
      winnings: cashedOut ? Math.floor(gameState.betAmount * targetMultiplier) : 0,
      totalFrames: totalFrames,
    };

    const canvas = await renderCrashFrame(frameState);
    const ctx = canvas.getContext("2d");
    encoder.addFrame(ctx);

    // Hold on result frame
    if (isLastFrame) {
      encoder.setDelay(2000); // 2 second pause
      encoder.addFrame(ctx);
    }
  }

  encoder.finish();
  return encoder.out.getData();
}

// ==========================================
// GAME EXECUTION
// ==========================================

async function startCrashGame(message, guildId, userId, betAmount, targetMultiplier) {
  const channel = message.channel;
  const playerName = message.author.username;

  // Get currency emoji
  const currencyEmoji = await formatCurrency(guildId, 0).then((str) =>
    str.replace(/[0-9,]/g, "").trim() || "🍯"
  );

  // Send loading message
  const loadingMsg = await channel.send("🚀 Launching rocket...");

  // Deduct bet
  await updateBalance(guildId, userId, -betAmount);

  try {
    // Generate crash point
    const crashPoint = generateCrashPoint();

    // Determine outcome
    const won = targetMultiplier <= crashPoint;
    const winnings = won ? Math.floor(betAmount * targetMultiplier) : 0;
    const profit = winnings - betAmount;

    // Game state for rendering
    const gameState = {
      playerName,
      betAmount,
      targetMultiplier,
      currencyEmoji,
      multiplierHistory: [],
      currentMultiplier: 1.0,
      crashed: false,
      cashedOut: false,
      phase: "playing",
      won,
      resultMultiplier: won ? targetMultiplier : crashPoint,
      winnings,
    };

    // Generate GIF
    const gifBuffer = await generateCrashGIF(gameState, crashPoint, targetMultiplier);

    // Delete loading message
    await loadingMsg.delete().catch(() => {});

    // Send GIF
    const gifAttachment = new AttachmentBuilder(gifBuffer, {
      name: "crash.gif",
    });

    await channel.send({
      files: [gifAttachment],
    });

    // Update balance
    if (profit > 0) {
      await updateBalance(guildId, userId, profit);
    } else if (profit < 0) {
      await updateHouse(guildId, Math.abs(profit)).catch(() => {});
    }

    // Get new balance
    const newBalance = await getBalance(guildId, userId);

    // Result embed
    const resultColor = won ? "#3fb950" : "#f85149";

    const resultEmbed = new EmbedBuilder()
      .setTitle(`🚀 Crash Result - ${won ? "Cashed Out!" : "Crashed!"}`)
      .setColor(resultColor)
      .setDescription(
        won
          ? `🎉 **You cashed out at ${targetMultiplier}x!**`
          : `💥 **Crashed at ${crashPoint.toFixed(2)}x** (Target: ${targetMultiplier}x)`
      )
      .addFields(
        {
          name: "Bet",
          value: `${currencyEmoji}${betAmount.toLocaleString()}`,
          inline: true,
        },
        {
          name: "Target",
          value: `${targetMultiplier}x`,
          inline: true,
        },
        {
          name: "Crash Point",
          value: `${crashPoint.toFixed(2)}x`,
          inline: true,
        },
        {
          name: "Winnings",
          value: `${currencyEmoji}${winnings.toLocaleString()}`,
          inline: true,
        },
        {
          name: "Net Result",
          value: `${profit >= 0 ? "+" : ""}${currencyEmoji}${profit.toLocaleString()}`,
          inline: true,
        },
        {
          name: "New Balance",
          value: `${currencyEmoji}${newBalance.toLocaleString()}`,
          inline: true,
        }
      )
      .setFooter({ text: `Crash • ${playerName}` })
      .setTimestamp();

    await channel.send({ embeds: [resultEmbed] });

  } catch (error) {
    console.error("[Crash] Game error:", error);
    await loadingMsg.delete().catch(() => {});
    // Refund bet on error
    await updateBalance(guildId, userId, betAmount);
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#f85149")
          .setDescription(
            "❌ An error occurred during the game. Your bet has been refunded."
          ),
      ],
    });
  }
}

// ==========================================
// INTERACTIVE GAME START
// ==========================================

async function showCrashMenu(message, guildId, userId, betAmount) {
  const channel = message.channel;
  const playerName = message.author.username;

  // Get currency emoji
  const currencyEmoji = await formatCurrency(guildId, 0).then((str) =>
    str.replace(/[0-9,]/g, "").trim() || "🍯"
  );

  // Create button rows
  const row1 = new ActionRowBuilder().addComponents(
    CASHOUT_OPTIONS.slice(0, 4).map((opt) =>
      new ButtonBuilder()
        .setCustomId(`crash_${opt.value}_${userId}_${betAmount}`)
        .setLabel(opt.label)
        .setStyle(opt.style)
    )
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`crash_${CASHOUT_OPTIONS[4].value}_${userId}_${betAmount}`)
      .setLabel(CASHOUT_OPTIONS[4].label)
      .setStyle(CASHOUT_OPTIONS[4].style),
    new ButtonBuilder()
      .setCustomId(`crash_custom_${userId}_${betAmount}`)
      .setLabel("Custom")
      .setStyle(ButtonStyle.Secondary)
  );

  // Info embed
  const menuEmbed = new EmbedBuilder()
    .setTitle("🚀 Crash - Select Cash Out Target")
    .setColor("#58a6ff")
    .setDescription(
      `**${playerName}** is betting **${currencyEmoji}${betAmount.toLocaleString()}**\n\n` +
      "Select when you want to automatically cash out.\n" +
      "If the rocket crashes before your target, you lose your bet!"
    )
    .addFields(
      { name: "💡 Tip", value: "Lower targets (1.5x-2x) are safer but pay less.\nHigher targets (5x-10x) are riskier but pay more!", inline: false },
      { name: "📊 Odds", value: "~66% reach 1.5x\n~50% reach 2x\n~33% reach 3x\n~20% reach 5x\n~10% reach 10x", inline: true },
      { name: "💰 Potential Win", value: CASHOUT_OPTIONS.map(o => `${o.label}: ${currencyEmoji}${Math.floor(betAmount * o.value).toLocaleString()}`).join("\n"), inline: true }
    )
    .setFooter({ text: "Menu expires in 30 seconds" });

  const menuMsg = await channel.send({
    embeds: [menuEmbed],
    components: [row1, row2],
  });

  // Create collector for button interactions
  const filter = (i) => {
    return i.customId.startsWith("crash_") && i.customId.includes(userId);
  };

  const collector = menuMsg.createMessageComponentCollector({
    filter,
    time: 30000,
  });

  let gameStarted = false;

  collector.on("collect", async (interaction) => {
    if (interaction.user.id !== userId) {
      return interaction.reply({
        content: "This isn't your game!",
        ephemeral: true,
      });
    }

    gameStarted = true;
    collector.stop();

    const parts = interaction.customId.split("_");

    if (parts[1] === "custom") {
      // Handle custom multiplier
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("🚀 Enter Custom Multiplier")
            .setColor("#58a6ff")
            .setDescription(
              "Reply with your desired cash-out multiplier (e.g., `2.5` or `7.77`).\n" +
              "Must be between 1.01x and 100x."
            ),
        ],
        components: [],
      });

      // Wait for custom multiplier input
      const customFilter = (m) => m.author.id === userId && !isNaN(parseFloat(m.content));

      try {
        const collected = await channel.awaitMessages({
          filter: customFilter,
          max: 1,
          time: 15000,
          errors: ["time"],
        });

        const customMult = parseFloat(collected.first().content);

        if (customMult < 1.01 || customMult > 100) {
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor("#f85149")
                .setDescription("❌ Multiplier must be between 1.01x and 100x. Game cancelled, bet refunded."),
            ],
          });
          return;
        }

        // Delete the user's input message
        await collected.first().delete().catch(() => {});

        await startCrashGame(message, guildId, userId, betAmount, customMult);

      } catch (err) {
        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("#f85149")
              .setDescription("❌ No multiplier entered in time. Game cancelled, bet refunded."),
          ],
        });
      }

    } else {
      // Pre-defined multiplier selected
      const targetMultiplier = parseFloat(parts[1]);

      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle("🚀 Launching...")
            .setColor("#58a6ff")
            .setDescription(`Target: ${targetMultiplier}x`),
        ],
        components: [],
      });

      await startCrashGame(message, guildId, userId, betAmount, targetMultiplier);
    }
  });

  collector.on("end", async () => {
    if (!gameStarted) {
      // Timeout - disable buttons
      const disabledRow1 = new ActionRowBuilder().addComponents(
        CASHOUT_OPTIONS.slice(0, 4).map((opt) =>
          new ButtonBuilder()
            .setCustomId(`crash_disabled_${opt.value}`)
            .setLabel(opt.label)
            .setStyle(opt.style)
            .setDisabled(true)
        )
      );

      const disabledRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`crash_disabled_10`)
          .setLabel("10x")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`crash_disabled_custom`)
          .setLabel("Custom")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );

      await menuMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle("🚀 Crash - Expired")
            .setColor("#f85149")
            .setDescription("Game selection timed out. Use `!crash <amount>` to try again."),
        ],
        components: [disabledRow1, disabledRow2],
      }).catch(() => {});
    }
  });
}

// ==========================================
// MODULE EXPORT
// ==========================================

module.exports = (client) => {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    // EARLY RETURN: Skip if not a crash command
    if (!message.content.toLowerCase().startsWith("!crash")) return;

    const args = message.content.split(" ");

    // Check subscription tier (PLUS required)
    const subCheck = await checkSubscription(
      message.guild.id,
      TIERS.PLUS,
      message.guild.ownerId
    );
    if (!subCheck.hasAccess) {
      const upgradeEmbed = createUpgradeEmbed(
        "Crash",
        TIERS.PLUS,
        subCheck.guildTier
      );
      return message.channel.send({ embeds: [upgradeEmbed] });
    }

    // Parse arguments: !crash <amount> [multiplier]
    if (
      args.length < 2 ||
      isNaN(parseInt(args[1], 10)) ||
      parseInt(args[1], 10) <= 0
    ) {
      return message.channel.send(
        invalidUsageMessage(
          "crash",
          "!crash <amount> [multiplier]",
          "!crash 100 (shows menu) or !crash 100 2.5 (auto 2.5x target)"
        )
      );
    }

    const betAmount = parseInt(args[1], 10);
    const userId = message.author.id;
    const guildId = message.guild.id;

    // Check balance
    const balance = await getBalance(guildId, userId);
    if (balance < betAmount) {
      return message.channel.send(
        await insufficientFundsMessage(
          message.author.username,
          balance,
          betAmount,
          guildId
        )
      );
    }

    // Check if multiplier was provided directly
    if (args.length >= 3) {
      const targetMultiplier = parseFloat(args[2]);

      if (isNaN(targetMultiplier) || targetMultiplier < 1.01 || targetMultiplier > 100) {
        return message.channel.send(
          invalidUsageMessage(
            "crash",
            "!crash <amount> [multiplier]",
            "!crash 100 2.5 (multiplier must be 1.01-100)"
          )
        );
      }

      // Direct game start with specified multiplier
      await startCrashGame(message, guildId, userId, betAmount, targetMultiplier);
    } else {
      // Show interactive menu
      await showCrashMenu(message, guildId, userId, betAmount);
    }
  });
};
