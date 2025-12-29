const {
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");
const { createCanvas } = require("canvas");
const Matter = require("matter-js");
const { Engine, World, Bodies, Body } = Matter;
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

const BOARD_WIDTH = 400;
const BOARD_HEIGHT = 520;
const PEG_RADIUS = 5;
const BALL_RADIUS = 8;
const ROWS = 8;
const NUM_BUCKETS = 9;
const BUCKET_WIDTH = BOARD_WIDTH / NUM_BUCKETS;
const HORIZONTAL_SPACING = 38;
const VERTICAL_SPACING = 38;
const START_Y = 90;
const BUCKET_Y = 420;
const BUCKET_HEIGHT = 80;
const DROP_VARIANCE = 12; // ±12px random offset from center

// Payout multipliers by risk level
const PAYOUTS = {
  low:    [1.5, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.5],
  medium: [5.0, 2.0, 1.5, 1.0, 0.5, 1.0, 1.5, 2.0, 5.0],
  high:   [10.0, 3.0, 1.5, 0.3, 0.0, 0.3, 1.5, 3.0, 10.0],
};

// Frame timing (respects Discord rate limits ~5 edits per 5 seconds)
// ~400ms between frames allows for smoother animation while staying safe
const FRAME_DELAYS = [400, 400, 380, 380, 360, 360, 350, 350, 340, 340, 330, 330, 320, 320, 300, 800];

// Colors
const COLORS = {
  background: "#1a1a2e",
  boardGradientStart: "#16213e",
  boardGradientEnd: "#0f3460",
  peg: "#ffd700",
  pegHighlight: "#ffed4a",
  pegShadow: "#b8860b",
  ball: "#ff6b6b",
  ballHighlight: "#ff8a8a",
  ballShadow: "#cc5555",
  bucketWin: "#2ecc71",
  bucketNeutral: "#3498db",
  bucketLose: "#e74c3c",
  text: "#ffffff",
  textDim: "#aaaaaa",
  gold: "#ffd700",
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Generate triangular peg layout
function generatePegPositions() {
  const pegs = [];
  for (let row = 0; row < ROWS; row++) {
    const pegsInRow = row + 3; // 3 pegs in row 0, 4 in row 1, etc.
    const rowWidth = (pegsInRow - 1) * HORIZONTAL_SPACING;
    const startX = (BOARD_WIDTH - rowWidth) / 2;

    for (let col = 0; col < pegsInRow; col++) {
      pegs.push({
        x: startX + col * HORIZONTAL_SPACING,
        y: START_Y + row * VERTICAL_SPACING,
      });
    }
  }
  return pegs;
}

// ==========================================
// PHYSICS SIMULATION
// ==========================================

function simulatePlinko() {
  // Create physics engine
  const engine = Engine.create({
    gravity: { x: 0, y: 1.0 },
  });
  const world = engine.world;

  // Add pegs as static bodies
  const pegPositions = generatePegPositions();
  const pegs = pegPositions.map((pos) =>
    Bodies.circle(pos.x, pos.y, PEG_RADIUS, {
      isStatic: true,
      restitution: 0.5,
      friction: 0.1,
      label: "peg",
    })
  );
  World.add(world, pegs);

  // Add walls
  const leftWall = Bodies.rectangle(-10, BOARD_HEIGHT / 2, 20, BOARD_HEIGHT, {
    isStatic: true,
  });
  const rightWall = Bodies.rectangle(
    BOARD_WIDTH + 10,
    BOARD_HEIGHT / 2,
    20,
    BOARD_HEIGHT,
    { isStatic: true }
  );
  World.add(world, [leftWall, rightWall]);

  // Add bucket dividers
  for (let i = 1; i < NUM_BUCKETS; i++) {
    const divider = Bodies.rectangle(
      i * BUCKET_WIDTH,
      BUCKET_Y + BUCKET_HEIGHT / 2,
      4,
      BUCKET_HEIGHT,
      { isStatic: true }
    );
    World.add(world, divider);
  }

  // Add bucket floor
  const floor = Bodies.rectangle(
    BOARD_WIDTH / 2,
    BUCKET_Y + BUCKET_HEIGHT + 10,
    BOARD_WIDTH,
    20,
    { isStatic: true }
  );
  World.add(world, floor);

  // Create ball with slight random offset from center
  // Drop closer to first peg row (START_Y=90) to reduce momentum buildup
  const dropX =
    BOARD_WIDTH / 2 + (Math.random() - 0.5) * DROP_VARIANCE * 2;
  const ball = Bodies.circle(dropX, 72, BALL_RADIUS, {
    restitution: 0.5,
    friction: 0.1,
    frictionAir: 0.02,
    density: 0.001,
    label: "ball",
  });
  // Minimal initial velocity - let gravity and pegs do the work
  Body.setVelocity(ball, {
    x: (Math.random() - 0.5) * 0.3,
    y: 0,
  });
  World.add(world, ball);

  // Run simulation and capture frames
  const frames = [];
  const TOTAL_TICKS = 400;
  const NUM_FRAMES = 16;
  const CAPTURE_INTERVAL = Math.floor(TOTAL_TICKS / NUM_FRAMES);

  for (let tick = 0; tick < TOTAL_TICKS; tick++) {
    Engine.update(engine, 1000 / 60);

    // Capture frame at intervals
    if (tick % CAPTURE_INTERVAL === 0) {
      frames.push({
        x: ball.position.x,
        y: ball.position.y,
        tick,
      });
    }

    // Check if ball has settled in bucket
    if (
      ball.position.y > BUCKET_Y + 30 &&
      Math.abs(ball.velocity.y) < 0.3 &&
      Math.abs(ball.velocity.x) < 0.3
    ) {
      // Ball has landed - capture final frame
      frames.push({
        x: ball.position.x,
        y: Math.min(ball.position.y, BUCKET_Y + BUCKET_HEIGHT - BALL_RADIUS - 5),
        landed: true,
      });
      break;
    }
  }

  // If simulation timed out, add final position
  if (!frames[frames.length - 1]?.landed) {
    frames.push({
      x: ball.position.x,
      y: Math.min(ball.position.y, BUCKET_Y + BUCKET_HEIGHT - BALL_RADIUS - 5),
      landed: true,
    });
  }

  // Determine final bucket (clamp to valid range)
  const finalX = frames[frames.length - 1].x;
  // Clamp finalX to board boundaries first, then calculate bucket
  const clampedX = Math.max(0, Math.min(BOARD_WIDTH - 1, finalX));
  const bucketIndex = Math.floor(clampedX / BUCKET_WIDTH);
  // Ensure bucket is within valid range
  const validBucket = Math.max(0, Math.min(NUM_BUCKETS - 1, bucketIndex));

  // Clean up physics world
  World.clear(world, false);

  return {
    frames,
    finalBucket: validBucket,
    pegPositions,
  };
}

// ==========================================
// CANVAS RENDERING
// ==========================================

function drawBackground(ctx) {
  // Dark gradient background
  const gradient = ctx.createLinearGradient(0, 0, 0, BOARD_HEIGHT);
  gradient.addColorStop(0, COLORS.boardGradientStart);
  gradient.addColorStop(1, COLORS.boardGradientEnd);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

  // Subtle border
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, BOARD_WIDTH - 4, BOARD_HEIGHT - 4);
}

function drawHeader(ctx, playerName, betAmount, risk, currencyEmoji) {
  // Header background
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(0, 0, BOARD_WIDTH, 55);

  // Title
  ctx.fillStyle = COLORS.gold;
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PLINKO", BOARD_WIDTH / 2, 22);

  // Player info
  ctx.fillStyle = COLORS.text;
  ctx.font = "12px Arial";
  ctx.textAlign = "left";
  ctx.fillText(`Player: ${playerName}`, 10, 42);

  ctx.textAlign = "center";
  ctx.fillText(`Bet: ${currencyEmoji}${betAmount.toLocaleString()}`, BOARD_WIDTH / 2, 42);

  // Risk level with color coding
  const riskColors = {
    low: "#2ecc71",
    medium: "#f39c12",
    high: "#e74c3c",
  };
  ctx.fillStyle = riskColors[risk];
  ctx.textAlign = "right";
  ctx.fillText(`Risk: ${risk.toUpperCase()}`, BOARD_WIDTH - 10, 42);
}

function drawPeg(ctx, x, y) {
  // 3D gradient effect
  const gradient = ctx.createRadialGradient(
    x - 2,
    y - 2,
    0,
    x,
    y,
    PEG_RADIUS
  );
  gradient.addColorStop(0, COLORS.pegHighlight);
  gradient.addColorStop(1, COLORS.pegShadow);

  ctx.beginPath();
  ctx.arc(x, y, PEG_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
}

function drawBall(ctx, x, y) {
  // Shadow
  ctx.beginPath();
  ctx.arc(x + 2, y + 2, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fill();

  // Ball with gradient
  const gradient = ctx.createRadialGradient(
    x - 2,
    y - 2,
    0,
    x,
    y,
    BALL_RADIUS
  );
  gradient.addColorStop(0, COLORS.ballHighlight);
  gradient.addColorStop(1, COLORS.ball);

  ctx.beginPath();
  ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = COLORS.ballShadow;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawTrail(ctx, trail) {
  if (!trail || trail.length < 2) return;

  // Draw fading trail
  for (let i = 0; i < trail.length - 1; i++) {
    const frame = trail[i];
    // Validate frame has required properties before drawing
    if (frame && typeof frame.x === 'number' && typeof frame.y === 'number') {
      const opacity = (i + 1) / trail.length * 0.4;
      const size = BALL_RADIUS * 0.4 * ((i + 1) / trail.length);

      ctx.beginPath();
      ctx.arc(frame.x, frame.y, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 107, 107, ${opacity})`;
      ctx.fill();
    }
  }
}

function drawBuckets(ctx, risk, highlightBucket = null) {
  const multipliers = PAYOUTS[risk];

  for (let i = 0; i < NUM_BUCKETS; i++) {
    const x = i * BUCKET_WIDTH;
    const multiplier = multipliers[i];

    // Bucket color based on payout
    let color;
    if (multiplier >= 2.0) color = COLORS.bucketWin;
    else if (multiplier >= 1.0) color = COLORS.bucketNeutral;
    else color = COLORS.bucketLose;

    // Draw bucket
    ctx.fillStyle = color;
    if (highlightBucket === i) {
      // Highlight winning bucket with glow
      ctx.shadowColor = COLORS.gold;
      ctx.shadowBlur = 15;
      ctx.fillStyle = COLORS.gold;
    }
    ctx.fillRect(x + 2, BUCKET_Y, BUCKET_WIDTH - 4, BUCKET_HEIGHT);
    ctx.shadowBlur = 0;

    // Bucket border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, BUCKET_Y, BUCKET_WIDTH - 4, BUCKET_HEIGHT);

    // Multiplier label
    ctx.fillStyle = highlightBucket === i ? "#000000" : COLORS.text;
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${multiplier}x`, x + BUCKET_WIDTH / 2, BUCKET_Y + 20);
  }

  // Bucket divider lines
  ctx.strokeStyle = COLORS.boardGradientStart;
  ctx.lineWidth = 3;
  for (let i = 1; i < NUM_BUCKETS; i++) {
    ctx.beginPath();
    ctx.moveTo(i * BUCKET_WIDTH, BUCKET_Y);
    ctx.lineTo(i * BUCKET_WIDTH, BUCKET_Y + BUCKET_HEIGHT);
    ctx.stroke();
  }
}

function drawResultOverlay(ctx, multiplier, winnings, betAmount, currencyEmoji) {
  const netResult = winnings - betAmount;

  // Semi-transparent overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(50, 180, BOARD_WIDTH - 100, 120);
  ctx.strokeStyle = COLORS.gold;
  ctx.lineWidth = 2;
  ctx.strokeRect(50, 180, BOARD_WIDTH - 100, 120);

  // Result text
  ctx.textAlign = "center";

  // Multiplier
  ctx.fillStyle = COLORS.gold;
  ctx.font = "bold 32px Arial";
  ctx.fillText(`${multiplier}x`, BOARD_WIDTH / 2, 220);

  // Win/Loss text
  if (netResult > 0) {
    ctx.fillStyle = COLORS.bucketWin;
    ctx.font = "bold 18px Arial";
    ctx.fillText(`YOU WIN!`, BOARD_WIDTH / 2, 250);
    ctx.font = "14px Arial";
    ctx.fillText(`+${currencyEmoji}${netResult.toLocaleString()}`, BOARD_WIDTH / 2, 275);
  } else if (netResult < 0) {
    ctx.fillStyle = COLORS.bucketLose;
    ctx.font = "bold 18px Arial";
    ctx.fillText(`BETTER LUCK NEXT TIME`, BOARD_WIDTH / 2, 250);
    ctx.font = "14px Arial";
    ctx.fillText(`-${currencyEmoji}${Math.abs(netResult).toLocaleString()}`, BOARD_WIDTH / 2, 275);
  } else {
    ctx.fillStyle = COLORS.bucketNeutral;
    ctx.font = "bold 18px Arial";
    ctx.fillText(`BREAK EVEN`, BOARD_WIDTH / 2, 250);
    ctx.font = "14px Arial";
    ctx.fillText(`${currencyEmoji}0`, BOARD_WIDTH / 2, 275);
  }
}

async function renderPlinkoBoard(gameState) {
  const canvas = createCanvas(BOARD_WIDTH, BOARD_HEIGHT);
  const ctx = canvas.getContext("2d");

  // 1. Background
  drawBackground(ctx);

  // 2. Header
  drawHeader(
    ctx,
    gameState.playerName,
    gameState.betAmount,
    gameState.risk,
    gameState.currencyEmoji
  );

  // 3. Draw pegs
  gameState.pegPositions.forEach((peg) => drawPeg(ctx, peg.x, peg.y));

  // 4. Draw buckets
  drawBuckets(
    ctx,
    gameState.risk,
    gameState.phase === "result" ? gameState.finalBucket : null
  );

  // 5. Draw trail
  if (gameState.trail && gameState.trail.length > 0) {
    drawTrail(ctx, gameState.trail);
  }

  // 6. Draw ball
  if (gameState.ballPosition) {
    drawBall(ctx, gameState.ballPosition.x, gameState.ballPosition.y);
  }

  // 7. Result overlay
  if (gameState.phase === "result") {
    drawResultOverlay(
      ctx,
      gameState.multiplier,
      gameState.winnings,
      gameState.betAmount,
      gameState.currencyEmoji
    );
  }

  return canvas;
}

// ==========================================
// GAME EXECUTION
// ==========================================

async function startPlinkoGame(message, guildId, userId, betAmount, risk) {
  const channel = message.channel;
  const playerName = message.author.username;

  // Get currency emoji
  const currencyEmoji = await formatCurrency(guildId, 0).then((str) =>
    str.replace(/[0-9,]/g, "").trim() || "🍯"
  );

  // Deduct bet
  await updateBalance(guildId, userId, -betAmount);

  try {
    // Pre-simulate the entire game
    const simulation = simulatePlinko();
    const { frames, finalBucket, pegPositions } = simulation;

    // Calculate winnings (total payout, includes returned bet for multiplier >= 1.0)
    const multiplier = PAYOUTS[risk][finalBucket];
    const winnings = Math.floor(betAmount * multiplier);
    // For balance calculations: only add the profit portion (winnings - betAmount)
    const profit = winnings - betAmount;

    // Generate all frame images upfront
    const frameImages = [];

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const isLastFrame = frame.landed === true;

      // Build trail from previous frames
      const trailStart = Math.max(0, i - 4);
      const trail = frames.slice(trailStart, i);

      const gameState = {
        playerName,
        betAmount,
        risk,
        currencyEmoji,
        pegPositions,
        ballPosition: { x: frame.x, y: frame.y },
        trail,
        phase: isLastFrame ? "result" : "playing",
        finalBucket: isLastFrame ? finalBucket : null,
        multiplier,
        winnings,
      };

      const canvas = await renderPlinkoBoard(gameState);
      frameImages.push(canvas.toBuffer());
    }

    // Send initial frame
    const initialAttachment = new AttachmentBuilder(frameImages[0], {
      name: "plinko.png",
    });
    const gameMessage = await channel.send({
      files: [initialAttachment],
    });

    // Edit message with each subsequent frame
    for (let i = 1; i < frameImages.length; i++) {
      await delay(FRAME_DELAYS[Math.min(i - 1, FRAME_DELAYS.length - 1)]);

      const attachment = new AttachmentBuilder(frameImages[i], {
        name: "plinko.png",
      });

      try {
        await gameMessage.edit({ files: [attachment] });
      } catch (editError) {
        // Handle rate limit or edit errors gracefully
        console.log(`[Plinko] Frame edit error (frame ${i}):`, editError.message);
        await delay(1000); // Wait a bit longer and continue
      }
    }

    // Update balance with profit (already deducted bet at start)
    // Profit can be negative (loss), zero (break even), or positive (win)
    if (profit > 0) {
      await updateBalance(guildId, userId, profit);
    } else if (profit < 0) {
      // Profit is already negative, don't deduct again - it's the net loss
      // House gets the loss amount
      await updateHouse(guildId, Math.abs(profit)).catch(() => {});
    }
    // If profit === 0, no additional balance change needed (bet was already deducted)

    // Get new balance
    const newBalance = await getBalance(guildId, userId);

    // Send result embed
    const resultColor =
      profit > 0 ? "#2ecc71" : profit < 0 ? "#e74c3c" : "#f39c12";

    const resultEmbed = new EmbedBuilder()
      .setTitle(`🎰 Plinko Result - ${multiplier}x`)
      .setColor(resultColor)
      .setDescription(
        profit > 0
          ? "🎉 **You won!**"
          : profit < 0
          ? "💔 Better luck next time!"
          : "🤝 Break even!"
      )
      .addFields(
        {
          name: "Bet",
          value: `${currencyEmoji}${betAmount.toLocaleString()}`,
          inline: true,
        },
        { name: "Multiplier", value: `${multiplier}x`, inline: true },
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
        },
        { name: "Risk Level", value: risk.toUpperCase(), inline: true }
      )
      .setFooter({ text: `Plinko • ${playerName}` })
      .setTimestamp();

    await channel.send({ embeds: [resultEmbed] });
  } catch (error) {
    console.error("[Plinko] Game error:", error);
    // Refund bet on error
    await updateBalance(guildId, userId, betAmount);
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#e74c3c")
          .setDescription(
            "❌ An error occurred during the game. Your bet has been refunded."
          ),
      ],
    });
  }
}

// ==========================================
// MODULE EXPORT
// ==========================================

module.exports = (client) => {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    // EARLY RETURN: Skip if not a plinko command
    if (!message.content.toLowerCase().startsWith("!plinko")) return;

    const args = message.content.split(" ");

    // Check subscription tier (PLUS required)
    const subCheck = await checkSubscription(
      message.guild.id,
      TIERS.PLUS,
      message.guild.ownerId
    );
    if (!subCheck.hasAccess) {
      const upgradeEmbed = createUpgradeEmbed(
        "Plinko",
        TIERS.PLUS,
        subCheck.guildTier
      );
      return message.channel.send({ embeds: [upgradeEmbed] });
    }

    // Parse arguments: !plinko <amount> [risk]
    if (
      args.length < 2 ||
      isNaN(parseInt(args[1], 10)) ||
      parseInt(args[1], 10) <= 0
    ) {
      return message.channel.send(
        invalidUsageMessage(
          "plinko",
          "!plinko <amount> [low/medium/high]",
          "!plinko 100 medium"
        )
      );
    }

    const betAmount = parseInt(args[1], 10);
    const risk = args[2]?.toLowerCase() || "medium";

    // Validate risk level
    if (!["low", "medium", "high"].includes(risk)) {
      return message.channel.send(
        invalidUsageMessage(
          "plinko",
          "!plinko <amount> [low/medium/high]",
          "!plinko 100 high"
        )
      );
    }

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

    // Start the game
    await startPlinkoGame(message, guildId, userId, betAmount, risk);
  });
};
