const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");
const { getSetting } = require("../utils/settingsManager");

// ============ SECURITY CONFIGURATION ============
const VERIFICATION_DELAY_SECONDS = 10; // Time user must wait before verifying
const RAID_DETECTION_THRESHOLD = 5; // Number of joins in time window
const RAID_DETECTION_WINDOW_MS = 60000; // 1 minute window for raid detection
const MAX_VERIFICATION_ATTEMPTS = 3; // Max failed verification attempts
const LOCKOUT_DURATION_MS = 3600000; // 1 hour lockout after max attempts

// ============ TRACKING MAPS ============
// Track recent joins for raid detection
const recentJoins = new Map(); // guildId -> array of timestamps

// Track verification attempts
const verificationAttempts = new Map(); // userId -> { attempts, lockoutUntil }

// Track pending verifications
const pendingVerifications = new Map(); // userId -> { startTime, code }

// ============ HELPER FUNCTIONS ============

/**
 * Detect if server is under raid (mass joins)
 */
function detectRaid(guildId) {
  if (!recentJoins.has(guildId)) {
    recentJoins.set(guildId, []);
  }

  const joins = recentJoins.get(guildId);
  const now = Date.now();

  // Remove old joins outside the window
  const recentJoinCount = joins.filter(
    (timestamp) => now - timestamp < RAID_DETECTION_WINDOW_MS
  ).length;

  return recentJoinCount >= RAID_DETECTION_THRESHOLD;
}

/**
 * Record a member join for raid detection
 */
function recordJoin(guildId) {
  if (!recentJoins.has(guildId)) {
    recentJoins.set(guildId, []);
  }

  const joins = recentJoins.get(guildId);
  const now = Date.now();

  // Add current join
  joins.push(now);

  // Clean up old joins
  const filtered = joins.filter(
    (timestamp) => now - timestamp < RAID_DETECTION_WINDOW_MS
  );
  recentJoins.set(guildId, filtered);
}

/**
 * Check if user is locked out from verification attempts
 */
function isUserLockedOut(userId) {
  const attempts = verificationAttempts.get(userId);
  if (!attempts) return false;

  if (attempts.lockoutUntil && Date.now() < attempts.lockoutUntil) {
    return true;
  }

  return false;
}

/**
 * Increment failed verification attempts
 */
function incrementFailedAttempt(userId) {
  let attempts = verificationAttempts.get(userId) || { attempts: 0 };
  attempts.attempts++;

  if (attempts.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    attempts.lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
    console.log(
      `🔒 User ${userId} locked out for 1 hour after ${attempts.attempts} failed attempts`
    );
  }

  verificationAttempts.set(userId, attempts);
}

/**
 * Reset verification attempts on success
 */
function resetAttempts(userId) {
  verificationAttempts.delete(userId);
  pendingVerifications.delete(userId);
}

/**
 * Generate a simple verification code (random emoji sequence)
 */
function generateVerificationCode() {
  const emojis = ["🎮", "🎯", "🎨", "🎪", "🎭", "🎬", "🎤", "🎧", "🎼", "🎹"];
  const shuffled = [...emojis].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 4);
}

/**
 * Check suspicious patterns in user profile
 */
function hasSuspiciousPatterns(member) {
  const username = member.user.username.toLowerCase();
  const displayName = member.user.displayName?.toLowerCase() || "";

  // Common bot/spam patterns
  const suspiciousPatterns = [
    /nitro/i,
    /free.*gift/i,
    /discord\.gg/i,
    /\d{10,}/i, // Long number sequences
    /@everyone/i,
    /steam.*gift/i,
    /claim.*here/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(username) || pattern.test(displayName)) {
      return true;
    }
  }

  return false;
}

/**
 * Log verification event
 */
async function logVerification(guild, member, status, reason = "") {
  const logChannelId = await getSetting(guild.id, "verification.logChannelId");
  if (!logChannelId) return;

  const logChannel = guild.channels.cache.get(logChannelId);
  if (!logChannel) return;

  const accountCreated = Math.floor(member.user.createdTimestamp / 1000);
  const color = status === "success" ? "#00ff00" : status === "rejected" ? "#ff0000" : "#ffaa00";

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${status === "success" ? "✅" : status === "rejected" ? "❌" : "⚠️"} Verification ${status.toUpperCase()}`)
    .setDescription(`**User:** ${member.user.tag} (${member.user.id})`)
    .addFields(
      { name: "Account Created", value: `<t:${accountCreated}:R>`, inline: true },
      { name: "Has Avatar", value: member.user.avatar ? "Yes" : "No", inline: true },
      { name: "Status", value: reason || status, inline: false }
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  try {
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Failed to log verification:", error);
  }
}

// ============ MAIN VERIFICATION HANDLERS ============

/**
 * Handle new member join with enhanced security checks
 */
async function handleMemberJoin(member) {
  const guild = member.guild;

  // Check if enhanced verification is enabled
  const verificationEnabled = await getSetting(guild.id, "verification.enabled");
  if (!verificationEnabled) return;

  const verifyChannelId = await getSetting(guild.id, "verification.channelId");
  const unverifiedRoleId = await getSetting(guild.id, "verification.unverifiedRoleId");
  const quarantineRoleId = await getSetting(guild.id, "verification.quarantineRoleId");

  if (!verifyChannelId || !unverifiedRoleId) {
    console.log("Enhanced verification not fully configured");
    return;
  }

  // Record join for raid detection
  recordJoin(guild.id);

  // ============ SECURITY CHECKS ============

  // 1. Check for raid
  if (detectRaid(guild.id)) {
    console.log(`🚨 RAID DETECTED in ${guild.name} - Blocking new joins`);
    await logVerification(guild, member, "rejected", "🚨 Raid detected - Auto-kicked");

    try {
      await member.send(
        "⚠️ This server is currently under a raid attack. Please try joining again later."
      );
    } catch {}

    await member.kick("Raid protection");
    return;
  }

  // 2. Check for suspicious patterns
  if (hasSuspiciousPatterns(member)) {
    console.log(`⚠️ Suspicious pattern detected: ${member.user.tag}`);

    // Put in quarantine role instead of kicking (for manual review)
    if (quarantineRoleId) {
      const quarantineRole = guild.roles.cache.get(quarantineRoleId);
      if (quarantineRole) {
        try {
          await member.roles.add(quarantineRole);
          await logVerification(
            guild,
            member,
            "quarantine",
            "Suspicious username pattern - Quarantined for manual review"
          );
          return;
        } catch (error) {
          console.error("Failed to quarantine member:", error);
        }
      }
    }
  }

  // 3. Assign unverified role
  const unverifiedRole = guild.roles.cache.get(unverifiedRoleId);
  if (unverifiedRole) {
    try {
      await member.roles.add(unverifiedRole);
      console.log(`✅ Assigned Unverified role to ${member.user.tag}`);
    } catch (error) {
      console.error("Failed to assign Unverified role:", error);
    }
  }

  // 4. Send verification instructions via DM
  try {
    const verifyChannel = guild.channels.cache.get(verifyChannelId);

    const embed = new EmbedBuilder()
      .setColor("#ff4654")
      .setTitle(`Welcome to ${guild.name}! 👋`)
      .setDescription(
        `To gain access to the server, please complete verification in ${verifyChannel}.\n\n` +
          `**Security Info:**\n` +
          `✅ You passed automated security checks\n\n` +
          `Click the verification button and wait ${VERIFICATION_DELAY_SECONDS} seconds to complete verification.`
      )
      .setThumbnail(guild.iconURL())
      .setFooter({ text: "This helps us keep the server safe from bots and spammers" })
      .setTimestamp();

    await member.send({ embeds: [embed] });
  } catch (error) {
    console.log(`Could not DM ${member.user.tag}, verification will be in channel`);
  }

  await logVerification(guild, member, "pending", "Awaiting verification");
}

/**
 * Setup verification message in channel
 */
async function setupVerificationChannel(guild) {
  const verificationEnabled = await getSetting(guild.id, "verification.enabled");
  if (!verificationEnabled) return null;

  const verifyChannelId = await getSetting(guild.id, "verification.channelId");
  const unverifiedRoleId = await getSetting(guild.id, "verification.unverifiedRoleId");

  if (!verifyChannelId || !unverifiedRoleId) return null;

  const verifyChannel = guild.channels.cache.get(verifyChannelId);
  if (!verifyChannel) {
    console.error(`Verify channel ${verifyChannelId} not found`);
    return null;
  }

  // Check if verification message already exists
  const messages = await verifyChannel.messages.fetch({ limit: 10 });
  const existingMessage = messages.find(
    (msg) =>
      msg.author.id === guild.client.user.id &&
      msg.embeds.length > 0 &&
      msg.embeds[0].title?.includes("Verification")
  );

  if (!existingMessage) {
    const embed = new EmbedBuilder()
      .setColor("#ff4654")
      .setTitle("🛡️ Server Verification")
      .setDescription(
        `Welcome to **${guild.name}**!\n\n` +
          `To gain access to the server, click the button below and follow the instructions.\n\n` +
          `**Why verify?**\n` +
          `✅ Keeps out spam bots and scammers\n` +
          `✅ Protects the community\n` +
          `✅ Only takes ${VERIFICATION_DELAY_SECONDS} seconds\n\n` +
          `**Requirements:**\n` +
          `• You'll need to wait ${VERIFICATION_DELAY_SECONDS} seconds during verification\n` +
          `• Maximum ${MAX_VERIFICATION_ATTEMPTS} attempts allowed\n` +
          `• Complete the emoji challenge to verify`
      )
      .setThumbnail(guild.iconURL())
      .setFooter({ text: "Click the button below to start verification" })
      .setTimestamp();

    const button = new ButtonBuilder()
      .setCustomId("verify_start")
      .setLabel("Start Verification")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🛡️");

    const row = new ActionRowBuilder().addComponents(button);

    await verifyChannel.send({ embeds: [embed], components: [row] });
  }

  return { verifyChannel, verifyChannelId };
}

/**
 * Handle verification button interactions
 */
async function handleVerificationInteraction(interaction) {
  if (!interaction.isButton()) return;

  const { customId, user, guild, member } = interaction;

  // Start verification
  if (customId === "verify_start") {
    // Check if user is locked out
    if (isUserLockedOut(user.id)) {
      const attempts = verificationAttempts.get(user.id);
      const timeLeft = Math.ceil((attempts.lockoutUntil - Date.now()) / 60000);

      return interaction.reply({
        content: `❌ You've been locked out due to too many failed attempts. Try again in ${timeLeft} minutes.`,
        ephemeral: true,
      });
    }

    // Generate verification code
    const code = generateVerificationCode();
    const correctIndex = Math.floor(Math.random() * 4);
    const correctEmoji = code[correctIndex];

    // Store pending verification
    pendingVerifications.set(user.id, {
      startTime: Date.now(),
      correctEmoji,
      correctIndex,
    });

    // Create buttons with emojis
    const buttons = code.map((emoji, index) =>
      new ButtonBuilder()
        .setCustomId(`verify_select_${index}`)
        .setLabel(emoji)
        .setStyle(ButtonStyle.Secondary)
    );

    const row = new ActionRowBuilder().addComponents(buttons);

    const embed = new EmbedBuilder()
      .setColor("#ffaa00")
      .setTitle("🔐 Verification Challenge")
      .setDescription(
        `Please wait ${VERIFICATION_DELAY_SECONDS} seconds, then click the **${correctEmoji}** button below.\n\n` +
          `**Time started:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
          `**Can verify at:** <t:${Math.floor((Date.now() + VERIFICATION_DELAY_SECONDS * 1000) / 1000)}:T>`
      )
      .setFooter({ text: `Attempts remaining: ${MAX_VERIFICATION_ATTEMPTS - (verificationAttempts.get(user.id)?.attempts || 0)}` });

    return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
  }

  // Handle emoji selection
  if (customId.startsWith("verify_select_")) {
    const selectedIndex = parseInt(customId.split("_")[2]);
    const pending = pendingVerifications.get(user.id);

    if (!pending) {
      return interaction.reply({
        content: "❌ Verification session expired. Please start again.",
        ephemeral: true,
      });
    }

    // Check if enough time has passed
    const timePassed = Date.now() - pending.startTime;
    const requiredTime = VERIFICATION_DELAY_SECONDS * 1000;

    if (timePassed < requiredTime) {
      const timeLeft = Math.ceil((requiredTime - timePassed) / 1000);
      return interaction.reply({
        content: `⏰ Please wait ${timeLeft} more seconds before verifying.`,
        ephemeral: true,
      });
    }

    // Check if correct emoji
    if (selectedIndex !== pending.correctIndex) {
      incrementFailedAttempt(user.id);
      const attemptsLeft = MAX_VERIFICATION_ATTEMPTS - (verificationAttempts.get(user.id)?.attempts || 0);

      if (attemptsLeft <= 0) {
        await logVerification(guild, member, "rejected", "Too many failed verification attempts");

        return interaction.update({
          content: `❌ Too many failed attempts. You've been locked out for 1 hour.`,
          embeds: [],
          components: [],
        });
      }

      return interaction.reply({
        content: `❌ Wrong emoji! Attempts remaining: ${attemptsLeft}`,
        ephemeral: true,
      });
    }

    // SUCCESS! Remove unverified role
    const unverifiedRoleId = await getSetting(guild.id, "verification.unverifiedRoleId");
    const unverifiedRole = guild.roles.cache.get(unverifiedRoleId);

    if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
      try {
        await member.roles.remove(unverifiedRole);
        resetAttempts(user.id);

        await logVerification(guild, member, "success", "Completed verification challenge");

        const successEmbed = new EmbedBuilder()
          .setColor("#00ff00")
          .setTitle("✅ Verification Successful!")
          .setDescription(
            `Welcome to **${guild.name}**!\n\n` +
              `You now have access to all channels. Enjoy your stay!`
          )
          .setThumbnail(guild.iconURL());

        await interaction.update({
          embeds: [successEmbed],
          components: [],
        });

        console.log(`✅ Successfully verified ${user.tag}`);
      } catch (error) {
        console.error("Failed to remove Unverified role:", error);
        return interaction.reply({
          content: "❌ An error occurred during verification. Please contact a moderator.",
          ephemeral: true,
        });
      }
    }
  }
}

// Cleanup old data periodically
setInterval(() => {
  const now = Date.now();

  // Clean up old join records
  for (const [guildId, joins] of recentJoins.entries()) {
    const filtered = joins.filter(
      (timestamp) => now - timestamp < RAID_DETECTION_WINDOW_MS
    );
    if (filtered.length === 0) {
      recentJoins.delete(guildId);
    } else {
      recentJoins.set(guildId, filtered);
    }
  }

  // Clean up expired lockouts
  for (const [userId, attempts] of verificationAttempts.entries()) {
    if (attempts.lockoutUntil && now > attempts.lockoutUntil) {
      verificationAttempts.delete(userId);
    }
  }

  // Clean up old pending verifications (>5 minutes)
  for (const [userId, pending] of pendingVerifications.entries()) {
    if (now - pending.startTime > 5 * 60 * 1000) {
      pendingVerifications.delete(userId);
    }
  }
}, 60000); // Run every minute

module.exports = {
  handleMemberJoin,
  setupVerificationChannel,
  handleVerificationInteraction,
  detectRaid,
};
