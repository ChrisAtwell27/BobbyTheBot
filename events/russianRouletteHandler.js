const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const { createCanvas, loadImage } = require("canvas");
const https = require("https");
const fs = require("fs");
const path = require("path");
const {
  getBobbyBucks,
  updateBobbyBucks,
  setBobbyBucks,
} = require("../database/helpers/economyHelpers");
// TARGET_GUILD_ID removed for multi-guild support
const { CleanupMap } = require("../utils/memoryUtils");
const {
  checkSubscription,
  createUpgradeEmbed,
  TIERS,
} = require("../utils/subscriptionUtils");

// Store active Russian Roulette lobbies (auto-cleanup after 5 minutes)
const activeLobbies = new CleanupMap(5 * 60 * 1000, 1 * 60 * 1000);

// Configuration
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const LOBBY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const COUNTDOWN_TIME = 10; // 10 seconds before game starts

// Function to load image from URL
async function loadImageFromURL(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const buffer = Buffer.concat(chunks);
            resolve(loadImage(buffer));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

// Function to create dramatic Russian Roulette table visualization
async function createRouletteTableVisualization(lobby) {
  const canvas = createCanvas(700, 400);
  const ctx = canvas.getContext("2d");

  // Dark, dramatic background
  const gradient = ctx.createRadialGradient(350, 200, 0, 350, 200, 350);
  gradient.addColorStop(0, "#2c1810");
  gradient.addColorStop(0.7, "#1a0f08");
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 700, 400);

  // Blood red accent lines
  ctx.fillStyle = "#8b0000";
  ctx.fillRect(0, 0, 700, 8);
  ctx.fillRect(0, 392, 700, 8);

  // Title with dramatic styling
  ctx.fillStyle = "#ff0000";
  ctx.font = "bold 32px Arial";
  ctx.textAlign = "center";
  ctx.shadowColor = "#000000";
  ctx.shadowBlur = 5;
  ctx.fillText("🔫 RUSSIAN ROULETTE 🔫", 350, 45);
  ctx.shadowBlur = 0;

  // Subtitle warning
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px Arial";
  ctx.fillText("⚠️ ONE WILL FALL - ALL MONEY AT STAKE ⚠️", 350, 70);

  // Draw circular table
  const centerX = 350;
  const centerY = 220;
  const tableRadius = 120;

  // Table surface
  ctx.fillStyle = "#0d4a0d";
  ctx.beginPath();
  ctx.arc(centerX, centerY, tableRadius, 0, Math.PI * 2);
  ctx.fill();

  // Table border
  ctx.strokeStyle = "#8b4513";
  ctx.lineWidth = 8;
  ctx.stroke();

  // Revolver in center
  ctx.fillStyle = "#2c2c2c";
  ctx.beginPath();
  ctx.arc(centerX, centerY, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Gun details
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "center";
  ctx.fillText("🔫", centerX, centerY + 7);

  // Draw player positions around the table
  const players = lobby.players;
  const maxPositions = MAX_PLAYERS;

  for (let i = 0; i < maxPositions; i++) {
    const angle = (i / maxPositions) * Math.PI * 2 - Math.PI / 2; // Start from top
    const posX = centerX + Math.cos(angle) * (tableRadius + 60);
    const posY = centerY + Math.sin(angle) * (tableRadius + 60);

    const player = players[i];

    if (player) {
      try {
        // Player avatar
        const avatarURL =
          player.avatarURL ||
          `https://cdn.discordapp.com/embed/avatars/${player.id % 5}.png`;

        const avatar = await loadImageFromURL(avatarURL);

        // Avatar background (red glow for drama)
        ctx.fillStyle = "#ff0000";
        ctx.beginPath();
        ctx.arc(posX, posY, 32, 0, Math.PI * 2);
        ctx.fill();

        // Draw circular avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(posX, posY, 28, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, posX - 28, posY - 28, 56, 56);
        ctx.restore();

        // Avatar border
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(posX, posY, 28, 0, Math.PI * 2);
        ctx.stroke();

        // Player name
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "center";
        const displayName = player.displayName || player.username;
        const truncatedName =
          displayName.length > 10
            ? displayName.substring(0, 10) + "..."
            : displayName;
        ctx.fillText(truncatedName, posX, posY + 45);

        // Player balance
        ctx.fillStyle = "#ffd700";
        ctx.font = "bold 10px Arial";
        ctx.fillText(`🍯${player.balance.toLocaleString()}`, posX, posY + 58);
      } catch (error) {
        console.error("Error loading avatar:", error);
        // Fallback avatar
        ctx.fillStyle = "#8b0000";
        ctx.beginPath();
        ctx.arc(posX, posY, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "20px Arial";
        ctx.textAlign = "center";
        ctx.fillText("💀", posX, posY + 7);
      }
    } else {
      // Empty chair
      ctx.fillStyle = "#4a4a4a";
      ctx.beginPath();
      ctx.arc(posX, posY, 28, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#666666";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#999999";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.fillText("EMPTY", posX, posY - 5);
      ctx.fillText("CHAIR", posX, posY + 8);
    }

    // Position number
    ctx.fillStyle = "#cccccc";
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${i + 1}`, posX, posY + 70);
  }

  // Dramatic warning at bottom
  ctx.fillStyle = "#ff0000";
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "center";
  ctx.fillText("💀 THE LOSER LOSES EVERYTHING 💀", 350, 385);

  return canvas.toBuffer();
}

// Function to create countdown visualization
async function createCountdownVisualization(timeLeft) {
  const canvas = createCanvas(400, 200);
  const ctx = canvas.getContext("2d");

  // Dark background
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 400, 200);

  // Red border
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 400, 10);
  ctx.fillRect(0, 190, 400, 10);

  // Countdown number (large and dramatic)
  ctx.fillStyle = timeLeft <= 3 ? "#ff0000" : "#ffffff";
  ctx.font = "bold 72px Arial";
  ctx.textAlign = "center";
  ctx.shadowColor = "#000000";
  ctx.shadowBlur = 10;
  ctx.fillText(timeLeft.toString(), 200, 120);
  ctx.shadowBlur = 0;

  // Text
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px Arial";
  ctx.fillText("SECONDS UNTIL FATE", 200, 160);

  return canvas.toBuffer();
}

// Function to create death result visualization
async function createDeathResultVisualization(
  victim,
  survivors,
  totalPot,
  winnings
) {
  const canvas = createCanvas(600, 500);
  const ctx = canvas.getContext("2d");

  // Blood red background
  const gradient = ctx.createLinearGradient(0, 0, 600, 500);
  gradient.addColorStop(0, "#4a0000");
  gradient.addColorStop(0.5, "#8b0000");
  gradient.addColorStop(1, "#000000");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 600, 500);

  // Dramatic border
  ctx.fillStyle = "#ff0000";
  ctx.fillRect(0, 0, 600, 15);
  ctx.fillRect(0, 485, 600, 15);

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 36px Arial";
  ctx.textAlign = "center";
  ctx.shadowColor = "#000000";
  ctx.shadowBlur = 8;
  ctx.fillText("💀 DEATH HAS CHOSEN 💀", 300, 50);
  ctx.shadowBlur = 0;

  try {
    // Victim avatar (larger, with dramatic effect)
    const avatarURL =
      victim.avatarURL ||
      `https://cdn.discordapp.com/embed/avatars/${victim.id % 5}.png`;

    const avatar = await loadImageFromURL(avatarURL);

    // Dark overlay for victim
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.beginPath();
    ctx.arc(300, 140, 52, 0, Math.PI * 2);
    ctx.fill();

    // Draw victim avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(300, 140, 50, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 250, 90, 100, 100);
    ctx.restore();

    // Red X over victim
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(275, 115);
    ctx.lineTo(325, 165);
    ctx.moveTo(325, 115);
    ctx.lineTo(275, 165);
    ctx.stroke();
  } catch (error) {
    // Fallback for victim
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(300, 140, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff0000";
    ctx.font = "bold 40px Arial";
    ctx.textAlign = "center";
    ctx.fillText("💀", 300, 155);
  }

  // Victim info
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px Arial";
  ctx.textAlign = "center";
  ctx.fillText(`${victim.displayName || victim.username}`, 300, 210);

  ctx.fillStyle = "#ff6666";
  ctx.font = "bold 18px Arial";
  ctx.fillText(`Lost: 🍯${victim.lostAmount.toLocaleString()}`, 300, 235);

  // Results box
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
  ctx.fillRect(50, 260, 500, 200);

  ctx.strokeStyle = "#ff0000";
  ctx.lineWidth = 3;
  ctx.strokeRect(50, 260, 500, 200);

  // Results text
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px Arial";
  ctx.textAlign = "center";
  ctx.fillText("💰 SPOILS OF SURVIVAL 💰", 300, 290);

  ctx.font = "16px Arial";
  ctx.fillText(`Total Pot: 🍯${totalPot.toLocaleString()}`, 300, 320);
  ctx.fillText(`Each Survivor Wins: 🍯${winnings.toLocaleString()}`, 300, 345);

  // Survivors list
  ctx.font = "bold 14px Arial";
  ctx.fillText("🏆 SURVIVORS:", 300, 375);

  ctx.font = "12px Arial";
  let yPos = 395;
  survivors.forEach((survivor, index) => {
    ctx.fillText(`${survivor.displayName || survivor.username}`, 300, yPos);
    yPos += 18;
  });

  return canvas.toBuffer();
}

module.exports = (client) => {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (!message.guild) return; // Skip DMs

    // EARLY RETURN: Skip if not a russian roulette command
    const content = message.content.toLowerCase();
    if (!content.startsWith("!russianroulette") && !content.startsWith("!rr"))
      return;

    const args = message.content.split(" ");
    const command = args[0].toLowerCase();

    // Russian Roulette command
    if (command === "!russianroulette" || command === "!rr") {
      // Check subscription tier (PLUS required for russian roulette)
      const subCheck = await checkSubscription(message.guild.id, TIERS.PLUS);
      if (!subCheck.hasAccess) {
        const upgradeEmbed = createUpgradeEmbed(
          "Russian Roulette",
          TIERS.PLUS,
          subCheck.guildTier
        );
        return message.channel.send({ embeds: [upgradeEmbed] });
      }

      const userId = message.author.id;
      const userBalance = await getBobbyBucks(userId);

      // Check if user has any money
      if (userBalance <= 0) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ff0000")
              .setTitle("❌ Insufficient Funds")
              .setDescription(
                "You need at least B1 to play Russian Roulette!\nYou cannot risk what you do not have."
              )
              .setTimestamp(),
          ],
        });
      }

      // Check if there's already an active lobby in this channel
      const existingLobby = Array.from(activeLobbies.values()).find(
        (lobby) => lobby.channelId === message.channel.id
      );

      if (existingLobby) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor("#ff6b6b")
              .setTitle("🔫 Russian Roulette Already Active")
              .setDescription(
                "There is already a Russian Roulette lobby in this channel!\nJoin the existing game or wait for it to finish."
              )
              .setTimestamp(),
          ],
        });
      }

      // Create new lobby
      const lobbyId = `rr_${Date.now()}_${userId}`;
      const lobby = {
        id: lobbyId,
        channelId: message.channel.id,
        messageId: null,
        players: [
          {
            id: userId,
            username: message.author.username,
            displayName: message.author.displayName || message.author.username,
            avatarURL: message.author.displayAvatarURL({
              extension: "png",
              size: 128,
            }),
            balance: userBalance,
          },
        ],
        createdAt: Date.now(),
        gameStarted: false,
      };

      // Create lobby embed and buttons
      const embed = await createLobbyEmbed(lobby);
      const components = createLobbyButtons(lobbyId, false, false);

      try {
        const lobbyMessage = await message.channel.send({
          embeds: [embed.embed],
          files: embed.files,
          components: [components],
        });

        lobby.messageId = lobbyMessage.id;
        activeLobbies.set(lobbyId, lobby);

        console.log("Russian Roulette lobby created:", lobbyId);

        // Auto-delete lobby after timeout
        lobby.timeoutTimer = setTimeout(() => {
          const currentLobby = activeLobbies.get(lobbyId);
          if (currentLobby && !currentLobby.gameStarted) {
            activeLobbies.delete(lobbyId);

            client.channels
              .fetch(currentLobby.channelId)
              .then((channel) => {
                channel.messages
                  .fetch(currentLobby.messageId)
                  .then((msg) => {
                    const timeoutEmbed = new EmbedBuilder()
                      .setColor("#666666")
                      .setTitle("⏰ Russian Roulette Lobby Expired")
                      .setDescription("The lobby timed out due to inactivity.")
                      .setTimestamp();

                    msg
                      .edit({
                        embeds: [timeoutEmbed],
                        components: [],
                        files: [],
                      })
                      .catch(() => {});
                  })
                  .catch(() => {});
              })
              .catch(() => {});
          }
        }, LOBBY_TIMEOUT);
      } catch (error) {
        console.error("Error creating Russian Roulette lobby:", error);
      }
    }
  });

  // Handle button interactions
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const parts = interaction.customId.split("_");
    const action = parts[0];
    const rrActions = ["rrjoin", "rrleave", "rrstart"];
    if (!rrActions.includes(action)) return;

    const lobbyId = parts.slice(1).join("_");
    const lobby = activeLobbies.get(lobbyId);

    if (!lobby) {
      return interaction.reply({
        content: "❌ This Russian Roulette lobby is no longer active.",
        ephemeral: true,
      });
    }

    if (lobby.gameStarted) {
      return interaction.reply({
        content: "❌ This game has already started!",
        ephemeral: true,
      });
    }

    const userId = interaction.user.id;
    const userBalance = await getBobbyBucks(userId);

    if (action === "rrjoin") {
      // Check if user already in lobby
      if (lobby.players.some((player) => player.id === userId)) {
        return interaction.reply({
          content: "❌ You are already in this Russian Roulette lobby!",
          ephemeral: true,
        });
      }

      // Check if lobby is full
      if (lobby.players.length >= MAX_PLAYERS) {
        return interaction.reply({
          content: "❌ This Russian Roulette table is full!",
          ephemeral: true,
        });
      }

      // Check if user has money
      if (userBalance <= 0) {
        return interaction.reply({
          content: "❌ You need at least B1 to join Russian Roulette!",
          ephemeral: true,
        });
      }

      // Add player to lobby
      lobby.players.push({
        id: userId,
        username: interaction.user.username,
        displayName: interaction.user.displayName || interaction.user.username,
        avatarURL: interaction.user.displayAvatarURL({
          extension: "png",
          size: 128,
        }),
        balance: userBalance,
      });

      // Update lobby display
      const canStart = lobby.players.length >= MIN_PLAYERS;
      const embed = await createLobbyEmbed(lobby);
      const components = createLobbyButtons(lobbyId, canStart, false);

      await interaction.update({
        embeds: [embed.embed],
        files: embed.files,
        components: [components],
      });
    } else if (action === "rrleave") {
      // Check if user is in lobby
      const playerIndex = lobby.players.findIndex(
        (player) => player.id === userId
      );
      if (playerIndex === -1) {
        return interaction.reply({
          content: "❌ You are not in this Russian Roulette lobby!",
          ephemeral: true,
        });
      }

      // Remove player
      lobby.players.splice(playerIndex, 1);

      // If no players left, delete lobby
      if (lobby.players.length === 0) {
        // Clear timeout timer if exists
        if (lobby.timeoutTimer) {
          clearTimeout(lobby.timeoutTimer);
        }
        activeLobbies.delete(lobbyId);
        const emptyEmbed = new EmbedBuilder()
          .setColor("#666666")
          .setTitle("🔫 Russian Roulette Lobby Closed")
          .setDescription("All players have left. The lobby has been closed.")
          .setTimestamp();

        return interaction.update({
          embeds: [emptyEmbed],
          components: [],
          files: [],
        });
      }

      // Update lobby display
      const canStart = lobby.players.length >= MIN_PLAYERS;
      const embed = await createLobbyEmbed(lobby);
      const components = createLobbyButtons(lobbyId, canStart, false);

      await interaction.update({
        embeds: [embed.embed],
        files: embed.files,
        components: [components],
      });
    } else if (action === "rrstart") {
      // Check if user is in lobby
      if (!lobby.players.some((player) => player.id === userId)) {
        return interaction.reply({
          content: "❌ Only players in the lobby can start the game!",
          ephemeral: true,
        });
      }

      // Check minimum players
      if (lobby.players.length < MIN_PLAYERS) {
        return interaction.reply({
          content: `❌ Need at least ${MIN_PLAYERS} players to start Russian Roulette!`,
          ephemeral: true,
        });
      }

      // Mark game as started
      lobby.gameStarted = true;

      // Start countdown
      await startCountdown(interaction, lobby);
    }
  });

  // Function to start countdown and execute game
  async function startCountdown(interaction, lobby) {
    // Initial countdown message
    const startEmbed = new EmbedBuilder()
      .setColor("#ff0000")
      .setTitle("🔫 RUSSIAN ROULETTE STARTING!")
      .setDescription(
        "**FINAL WARNING:** One player will lose ALL their money!\nThe pot will be split among survivors!"
      )
      .addFields(
        {
          name: "💀 Players at Risk",
          value: lobby.players
            .map((p) => p.displayName || p.username)
            .join("\n"),
          inline: true,
        },
        {
          name: "💰 Total at Stake",
          value: `🍯{lobby.players.reduce((total, player) => total + player.balance, 0).toLocaleString()}`,
          inline: true,
        }
      )
      .setTimestamp();

    await interaction.update({
      embeds: [startEmbed],
      components: [],
    });

    // Countdown
    for (let i = COUNTDOWN_TIME; i > 0; i--) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      try {
        const countdownImageBuffer = await createCountdownVisualization(i);
        const attachment = new AttachmentBuilder(countdownImageBuffer, {
          name: "countdown.png",
        });

        const countdownEmbed = new EmbedBuilder()
          .setColor(i <= 3 ? "#ff0000" : "#ff6b6b")
          .setTitle("🔫 RUSSIAN ROULETTE - COUNTDOWN")
          .setDescription(
            i <= 3 ? "**💀 DEATH APPROACHES 💀**" : "Prepare for your fate..."
          )
          .setImage("attachment://countdown.png")
          .setTimestamp();

        await interaction.editReply({
          embeds: [countdownEmbed],
          files: [attachment],
        });
      } catch (error) {
        console.error("Error updating countdown:", error);
      }
    }

    // Execute the game
    await executeRussianRoulette(interaction, lobby);
  }

  // Function to execute the Russian Roulette game
  async function executeRussianRoulette(interaction, lobby) {
    // Wait a moment for dramatic effect
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Randomly select victim
    const victimIndex = Math.floor(Math.random() * lobby.players.length);
    const victim = lobby.players[victimIndex];
    const survivors = lobby.players.filter((_, index) => index !== victimIndex);

    // Calculate money redistribution
    const totalPot = lobby.players.reduce(
      (total, player) => total + player.balance,
      0
    );
    const victimLoss = victim.balance;
    const winningsPerSurvivor = Math.floor(victimLoss / survivors.length);

    // Update balances
    await setBobbyBucks(victim.id, 0); // Victim loses everything

    for (const survivor of survivors) {
      await updateBobbyBucks(survivor.id, winningsPerSurvivor);
    }

    // Create dramatic result visualization
    try {
      const resultImageBuffer = await createDeathResultVisualization(
        { ...victim, lostAmount: victimLoss },
        survivors,
        totalPot,
        winningsPerSurvivor
      );
      const attachment = new AttachmentBuilder(resultImageBuffer, {
        name: "death-result.png",
      });

      const resultEmbed = new EmbedBuilder()
        .setColor("#8b0000")
        .setTitle("💀 THE CHAMBER WAS NOT EMPTY 💀")
        .setDescription(
          `**${victim.displayName || victim.username}** has been claimed by fate!`
        )
        .setImage("attachment://death-result.png")
        .addFields(
          {
            name: "💀 Victim",
            value: `${victim.displayName || victim.username}`,
            inline: true,
          },
          {
            name: "💸 Lost",
            value: `🍯{victimLoss.toLocaleString()}`,
            inline: true,
          },
          { name: "🏆 Survivors", value: `${survivors.length}`, inline: true },
          {
            name: "💰 Each Survivor Won",
            value: `🍯{winningsPerSurvivor.toLocaleString()}`,
            inline: true,
          },
          {
            name: "🎯 Survival Rate",
            value: `${((survivors.length / lobby.players.length) * 100).toFixed(1)}%`,
            inline: true,
          },
          {
            name: "🔫 Odds Beaten",
            value: `${lobby.players.length}:1`,
            inline: true,
          }
        )
        .setFooter({ text: "Russian Roulette: Where fortune favors the lucky" })
        .setTimestamp();

      await interaction.editReply({
        embeds: [resultEmbed],
        files: [attachment],
      });
    } catch (error) {
      console.error("Error creating result visualization:", error);

      // Fallback text-only result
      const fallbackEmbed = new EmbedBuilder()
        .setColor("#8b0000")
        .setTitle("💀 RUSSIAN ROULETTE RESULT 💀")
        .setDescription(
          `**${victim.displayName || victim.username}** was eliminated!`
        )
        .addFields(
          {
            name: "💀 Victim",
            value: victim.displayName || victim.username,
            inline: true,
          },
          {
            name: "💸 Lost",
            value: `🍯{victimLoss.toLocaleString()}`,
            inline: true,
          },
          {
            name: "💰 Survivor Winnings",
            value: `🍯{winningsPerSurvivor.toLocaleString()} each`,
            inline: true,
          },
          {
            name: "🏆 Survivors",
            value: survivors.map((s) => s.displayName || s.username).join("\n"),
            inline: false,
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [fallbackEmbed] });
    }

    // Send individual notifications to survivors
    survivors.forEach(async (survivor) => {
      try {
        const user = await client.users.fetch(survivor.id);
        const survivorEmbed = new EmbedBuilder()
          .setColor("#00ff00")
          .setTitle("🏆 YOU SURVIVED RUSSIAN ROULETTE!")
          .setDescription(
            `You have survived the deadly game and claimed your share of ${victim.displayName || victim.username}'s fortune!`
          )
          .addFields(
            {
              name: "💰 Winnings",
              value: `🍯{winningsPerSurvivor.toLocaleString()}`,
              inline: true,
            },
            {
              name: "💳 New Balance",
              value: `🍯${(await getBobbyBucks(survivor.id)).toLocaleString()}`,
              inline: true,
            }
          )
          .setTimestamp();

        await user.send({ embeds: [survivorEmbed] });
      } catch (error) {
        console.log(`Could not send DM to survivor ${survivor.id}`);
      }
    });

    // Send notification to victim
    try {
      const victimUser = await client.users.fetch(victim.id);
      const victimEmbed = new EmbedBuilder()
        .setColor("#ff0000")
        .setTitle("💀 YOU HAVE BEEN ELIMINATED")
        .setDescription(
          "The chamber was not empty. Your fortune has been claimed by the survivors."
        )
        .addFields(
          {
            name: "💸 Lost",
            value: `🍯{victimLoss.toLocaleString()}`,
            inline: true,
          },
          { name: "💳 Current Balance", value: "B0", inline: true }
        )
        .setFooter({ text: "Better luck next time... if there is one." })
        .setTimestamp();

      await victimUser.send({ embeds: [victimEmbed] });
    } catch (error) {
      console.log(`Could not send DM to victim ${victim.id}`);
    }

    // Clean up lobby
    // Clear timeout timer if exists
    if (lobby.timeoutTimer) {
      clearTimeout(lobby.timeoutTimer);
    }
    activeLobbies.delete(lobby.id);
  }

  // Helper function to create lobby embed
  async function createLobbyEmbed(lobby) {
    const totalPot = lobby.players.reduce(
      (total, player) => total + player.balance,
      0
    );

    // Create visual table
    const tableImageBuffer = await createRouletteTableVisualization(lobby);
    const attachment = new AttachmentBuilder(tableImageBuffer, {
      name: "roulette-table.png",
    });

    const embed = new EmbedBuilder()
      .setColor("#8b0000")
      .setTitle("🔫 RUSSIAN ROULETTE LOBBY")
      .setDescription(
        "**⚠️ WARNING: ONE PLAYER WILL LOSE EVERYTHING! ⚠️**\n\nThe eliminated player will lose their ENTIRE balance.\nSurvivors will split the victim's money equally."
      )
      .setImage("attachment://roulette-table.png")
      .addFields(
        {
          name: "👥 Players",
          value: `${lobby.players.length}/${MAX_PLAYERS}`,
          inline: true,
        },
        {
          name: "💰 Total at Stake",
          value: `🍯{totalPot.toLocaleString()}`,
          inline: true,
        },
        {
          name: "📊 Required",
          value: `${MIN_PLAYERS}-${MAX_PLAYERS} players`,
          inline: true,
        },
        {
          name: "🎭 Players in Lobby",
          value:
            lobby.players.length > 0
              ? lobby.players
                  .map(
                    (player, index) =>
                      `${index + 1}. **${player.displayName || player.username}** (🍯{player.balance.toLocaleString()})`
                  )
                  .join("\n")
              : "None",
          inline: false,
        }
      )
      .setFooter({
        text:
          lobby.players.length >= MIN_PLAYERS
            ? "Ready to start! Click START when ready."
            : `Need ${MIN_PLAYERS - lobby.players.length} more players to start.`,
      })
      .setTimestamp();

    return {
      embed: embed,
      files: [attachment],
    };
  }

  // Helper function to create lobby buttons
  function createLobbyButtons(lobbyId, canStart, gameStarted) {
    const joinButton = new ButtonBuilder()
      .setCustomId(`rrjoin_${lobbyId}`)
      .setLabel("Join Table")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("💀")
      .setDisabled(gameStarted);

    const leaveButton = new ButtonBuilder()
      .setCustomId(`rrleave_${lobbyId}`)
      .setLabel("Leave Table")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🚪")
      .setDisabled(gameStarted);

    const startButton = new ButtonBuilder()
      .setCustomId(`rrstart_${lobbyId}`)
      .setLabel("START GAME")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🔫")
      .setDisabled(!canStart || gameStarted);

    return new ActionRowBuilder().addComponents(
      joinButton,
      leaveButton,
      startButton
    );
  }

  // Clean up old lobbies on startup
  client.once("ready", () => {
    console.log("Russian Roulette Handler loaded! 🔫💀");
    activeLobbies.clear();
  });
};
