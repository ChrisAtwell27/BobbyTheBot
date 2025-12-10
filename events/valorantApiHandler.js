const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
} = require("discord.js");

// ===============================================
// VALORANT STATS & API HANDLER (REFACTORED)
// ===============================================
// This handler manages Valorant account registration and stats display
// Commands: !valstats, !valprofile, !valmatches, !createteams (admin), !valtest (admin), !valreset (admin), !vallist (admin), !valskills (admin)
//
// IMPORTANT: This is separate from the Valorant TEAM BUILDER
// Team Builder uses: !valorant, @Valorant role, valorant_ button prefixes
// This handler uses: !valstats, !valprofile, valstats_ button prefixes
// ===============================================

// Import utilities
const {
  validateValorantRegistration,
  VALID_REGIONS,
} = require("../utils/validators");
const { safeInteractionResponse } = require("../utils/interactionUtils");
const {
  checkSubscription,
  createUpgradeEmbed,
  TIERS,
} = require("../utils/subscriptionUtils");

// Import Valorant API modules
const {
  getAccountData,
  getMMRData,
  getMMRDataV3,
  getMMRHistory,
  getStoredMatches,
  getMatches,
} = require("../valorantApi/apiClient");
const {
  RANK_MAPPING,
  loadRankImage,
  createFallbackRankIcon,
  getRankInfo,
  calculateMMR,
} = require("../valorantApi/rankUtils");
const {
  getUserRegistration,
  getAllRegisteredUsers,
  addUserRegistration,
  removeUserRegistration,
  getUserRankData,
  isUserRegistered,
  findOrMigrateUser,
  USERS_FILE,
} = require("../valorantApi/registrationManager");
const {
  getPlayerMatchStats,
  COMPETITIVE_MODES,
} = require("../valorantApi/matchStats");
const { createStatsVisualization } = require("../valorantApi/statsVisualizer");
const {
  calculateEnhancedSkillScore,
  createBalancedTeams,
} = require("../valorantApi/teamBalancer");

// ===============================================
// UNIQUE HANDLER FUNCTIONS
// ===============================================
// These functions are specific to this handler and handle command logic

// Helper function to show registration modal
async function showRegistrationModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(`valstats_registration_${interaction.user.id}`)
    .setTitle("📝 Valorant Account Registration");

  const usernameInput = new TextInputBuilder()
    .setCustomId("valorant_username")
    .setLabel("Valorant Username (Name#Tag)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Example: PlayerName#1234")
    .setRequired(true)
    .setMaxLength(30);

  const regionInput = new TextInputBuilder()
    .setCustomId("valorant_region")
    .setLabel("Region")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("na, eu, ap, kr, latam, or br")
    .setRequired(true)
    .setMaxLength(10);

  const firstRow = new ActionRowBuilder().addComponents(usernameInput);
  const secondRow = new ActionRowBuilder().addComponents(regionInput);

  modal.addComponents(firstRow, secondRow);

  await interaction.showModal(modal);
}

// Show registration prompt with button
async function showRegistrationPrompt(message) {
  const embed = new EmbedBuilder()
    .setTitle("🎮 Valorant Stats Registration")
    .setColor("#ff4654")
    .setDescription("You need to register your Valorant account first!")
    .addFields(
      {
        name: "📋 What We Track",
        value:
          "• Competitive Rank & RR\n• Match History & KDA\n• Win Rate & ACS\n• Peak Rank",
        inline: true,
      },
      {
        name: "🔒 Privacy",
        value:
          "• Only public Riot data\n• No account access\n• Data from HenrikDev API",
        inline: true,
      },
      {
        name: "🌍 Supported Regions",
        value: "`NA`, `EU`, `AP`, `KR`, `LATAM`, `BR`",
        inline: false,
      }
    )
    .setFooter({ text: "Click the button below to register" });

  const registerButton = new ButtonBuilder()
    .setCustomId(`valstats_register_${message.author.id}`)
    .setLabel("Register Now")
    .setEmoji("✅")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(registerButton);

  await message.channel.send({
    embeds: [embed],
    components: [row],
  });
}

// Handle registration submission with validation
async function handleRegistrationSubmission(interaction) {
  const username = interaction.fields.getTextInputValue("valorant_username");
  const region = interaction.fields
    .getTextInputValue("valorant_region")
    .toLowerCase();

  // Extract name and tag from username
  if (!username.includes("#")) {
    return await safeInteractionResponse(interaction, "reply", {
      content:
        "❌ Invalid username format! Please use the format: Username#Tag (e.g., Player#1234)",
      ephemeral: true,
    });
  }

  const [name, tag] = username.split("#");

  // Validate inputs using the validators module
  const validation = validateValorantRegistration({
    name: name,
    tag: tag,
    region: region,
  });

  if (!validation.valid) {
    const errorMessages = Object.values(validation.errors).join("\n");
    return await safeInteractionResponse(interaction, "reply", {
      content: `❌ Validation failed:\n${errorMessages}`,
      ephemeral: true,
    });
  }

  // Use sanitized values
  const {
    name: cleanName,
    tag: cleanTag,
    region: cleanRegion,
  } = validation.sanitized;

  await safeInteractionResponse(interaction, "defer", { ephemeral: true });

  try {
    console.log(
      `Testing account: ${cleanName}#${cleanTag} in region ${cleanRegion}`
    );
    const accountData = await getAccountData(cleanName, cleanTag);

    if (accountData.status !== 200) {
      return await safeInteractionResponse(interaction, "reply", {
        content: `❌ Could not find a Valorant account with that username and tag. Please check your spelling and try again.\n\nAPI Response: ${
          accountData.error || "Unknown error"
        }`,
      });
    }

    const userData = {
      name: cleanName,
      tag: cleanTag,
      region: cleanRegion,
      puuid: accountData.data.puuid,
      registeredAt: new Date().toISOString(),
    };

    await addUserRegistration(interaction.guild.id, interaction.user.id, userData);

    const successEmbed = new EmbedBuilder()
      .setTitle("✅ Registration Successful!")
      .setColor("#00ff00")
      .setDescription(
        `Successfully registered your Valorant account: **${cleanName}#${cleanTag}**`
      )
      .addFields(
        { name: "🌍 Region", value: cleanRegion.toUpperCase(), inline: true },
        {
          name: "🆔 PUUID",
          value: accountData.data.puuid.substring(0, 8) + "...",
          inline: true,
        },
        {
          name: "📅 Registered",
          value: new Date().toLocaleDateString(),
          inline: true,
        },
        {
          name: "🚀 Next Step",
          value: "Use `!valstats` or `!valprofile` to view your stats!",
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({ text: "Powered by HenrikDev Valorant API" });

    await safeInteractionResponse(interaction, "reply", {
      embeds: [successEmbed],
    });
  } catch (error) {
    console.error("Registration error:", error);

    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Account Validation Failed")
      .setColor("#ff0000")
      .setDescription(
        "Unable to verify your Valorant account. **Most common causes:** Typo in Name#Tag, no ranked games played, or API rate limit."
      )
      .addFields({
        name: "🔧 Quick Fixes",
        value:
          '1. Verify spelling: **"PlayerName#1234"** (case-sensitive)\n' +
          "2. Play 1+ Ranked match if new account\n" +
          "3. Wait 1 minute and retry\n" +
          "4. Contact admin if issue persists",
        inline: false,
      })
      .setFooter({ text: `Error: ${error.message.substring(0, 100)}...` })
      .setTimestamp();

    await safeInteractionResponse(interaction, "reply", {
      embeds: [errorEmbed],
    });
  }
}

// Handle updating registration
async function handleUpdateRegistration(message, args) {
  if (args.length < 1) {
    return await message.channel.send(
      "❌ Usage: `!valupdate <Name#Tag> [region]`\nExample: `!valupdate NewName#Tag na`"
    );
  }

  const username = args[0];
  let region = args[1] ? args[1].toLowerCase() : null;

  // Extract name and tag from username
  if (!username.includes("#")) {
    return await message.channel.send(
      "❌ Invalid username format! Please use the format: Username#Tag (e.g., Player#1234)"
    );
  }

  const [name, tag] = username.split("#");

  // If region not provided, try to get from existing registration
  if (!region) {
    const existing = await getUserRegistration(message.guild.id, message.author.id);
    if (existing) {
      region = existing.region;
    } else {
      return await message.channel.send(
        "❌ Region is required for new registrations or if I cannot find your old one.\nUsage: `!valupdate <Name#Tag> <region>`"
      );
    }
  }

  // Validate inputs
  const validation = validateValorantRegistration({
    name: name,
    tag: tag,
    region: region,
  });

  if (!validation.valid) {
    const errorMessages = Object.values(validation.errors).join("\n");
    return await message.channel.send(
      `❌ Validation failed:\n${errorMessages}`
    );
  }

  // Use sanitized values
  const {
    name: cleanName,
    tag: cleanTag,
    region: cleanRegion,
  } = validation.sanitized;

  const loadingMsg = await message.channel.send(
    "🔄 Verifying new Valorant account..."
  );

  try {
    const accountData = await getAccountData(cleanName, cleanTag);

    if (accountData.status !== 200) {
      return await loadingMsg.edit(
        `❌ Could not find account **${cleanName}#${cleanTag}**. Please check spelling and try again.`
      );
    }

    const userData = {
      name: cleanName,
      tag: cleanTag,
      region: cleanRegion,
      puuid: accountData.data.puuid,
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await addUserRegistration(message.guild.id, message.author.id, userData);

    const successEmbed = new EmbedBuilder()
      .setTitle("✅ Valorant Tag Updated!")
      .setColor("#00ff00")
      .setDescription(
        `Successfully updated your Valorant account to: **${cleanName}#${cleanTag}**`
      )
      .addFields(
        { name: "🌍 Region", value: cleanRegion.toUpperCase(), inline: true },
        {
          name: "🆔 PUUID",
          value: accountData.data.puuid.substring(0, 8) + "...",
          inline: true,
        }
      )
      .setTimestamp();

    await loadingMsg.edit({ content: null, embeds: [successEmbed] });
  } catch (error) {
    console.error("Update error:", error);
    await loadingMsg.edit(`❌ Error updating account: ${error.message}`);
  }
}

// Show user stats with comprehensive visualization
async function showUserStats(message, registration) {
  const loadingEmbed = new EmbedBuilder()
    .setTitle("🔄 Loading Enhanced Valorant Stats...")
    .setColor("#ff4654")
    .setDescription(
      "Fetching your latest data from Riot Games with comprehensive analysis..."
    )
    .setTimestamp();

  const loadingMessage = await message.channel.send({ embeds: [loadingEmbed] });

  try {
    console.log(
      `Fetching enhanced stats for: ${registration.name}#${registration.tag} in ${registration.region}`
    );

    // Single consolidated progress message
    const updateProgress = async (step) => {
      const steps = [
        `${step >= 1 ? "✓" : step === 1 ? "⏳" : "⏸️"} Account data`,
        `${step >= 2 ? "✓" : step === 2 ? "⏳" : "⏸️"} MMR & Rank info`,
        `${step >= 3 ? "✓" : step === 3 ? "⏳" : "⏸️"} Match history`,
      ];

      await loadingMessage.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔄 Loading Valorant Stats...")
            .setColor("#ff4654")
            .setDescription(
              `**${registration.name}#${
                registration.tag
              }** • ${registration.region.toUpperCase()}\n\n${steps.join(
                " • "
              )}`
            )
            .setTimestamp(),
        ],
      });
    };

    await updateProgress(1);
    const accountData = await getAccountData(
      registration.name,
      registration.tag
    );

    await updateProgress(2);
    // Fetch both v2 MMR (legacy) and v3 MMR (comprehensive) data
    const [mmrData, mmrDataV3] = await Promise.all([
      getMMRData(registration.region, registration.name, registration.tag),
      getMMRDataV3(registration.region, registration.name, registration.tag),
    ]);

    await updateProgress(3);
    const matchData = await getMatches(
      registration.region,
      registration.name,
      registration.tag
    );

    if (accountData.status !== 200) {
      throw new Error(
        `Could not fetch account data: ${accountData.error || "Unknown error"}`
      );
    }

    if (mmrData.status !== 200) {
      console.warn("MMR v2 data unavailable:", mmrData.error);
    }

    if (mmrDataV3.status !== 200) {
      console.warn("MMR v3 data unavailable:", mmrDataV3.error);
    }

    // Get user avatar
    const userAvatar = message.author.displayAvatarURL({
      extension: "png",
      size: 256,
    });

    // Create enhanced visualization with v3 MMR data
    const statsCanvas = await createStatsVisualization(
      accountData.data,
      mmrData.data,
      matchData.data || [],
      userAvatar,
      registration,
      mmrDataV3.data // Pass v3 MMR data for enhanced display
    );

    const attachment = new AttachmentBuilder(statsCanvas.toBuffer(), {
      name: "valorant-stats.png",
    });

    const statsEmbed = new EmbedBuilder()
      .setTitle(
        `📊 ${accountData.data.name}#${accountData.data.tag} - Valorant Profile`
      )
      .setColor("#ff4654")
      .setImage("attachment://valorant-stats.png")
      .setDescription(
        "Comprehensive statistics with match history and performance metrics"
      )
      .setTimestamp()
      .setFooter({ text: "Powered by HenrikDev API • Enhanced Stats v4.0" });

    const refreshButton = new ButtonBuilder()
      .setCustomId(`valstats_refresh_${message.author.id}`)
      .setLabel("Refresh Stats")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Primary);

    const matchesButton = new ButtonBuilder()
      .setCustomId(`valmatches_refresh_${message.author.id}`)
      .setLabel("Detailed Matches")
      .setEmoji("📊")
      .setStyle(ButtonStyle.Secondary);

    const mmrHistoryButton = new ButtonBuilder()
      .setCustomId(`valmmr_history_${message.author.id}`)
      .setLabel("MMR History")
      .setEmoji("📈")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(
      refreshButton,
      matchesButton,
      mmrHistoryButton
    );

    await loadingMessage.edit({
      embeds: [statsEmbed],
      files: [attachment],
      components: [row],
    });
  } catch (error) {
    console.error("Error displaying stats:", error);

    let errorDesc = "There was an error fetching your Valorant statistics.";
    let isAccountError = false;

    // Check if it's likely a changed tag issue
    if (
      error.message.includes("404") ||
      error.message.includes("Could not fetch account data")
    ) {
      errorDesc = `**Could not find your Valorant account.**\n\nDid you change your Riot ID/Tag recently?\nUse \`!valupdate <NewName#Tag>\` to update it!`;
      isAccountError = true;
    }

    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Error Fetching Stats")
      .setColor("#ff0000")
      .setDescription(errorDesc);

    if (!isAccountError) {
      errorEmbed.addFields({
        name: "Error Details",
        value: `\`\`\`${error.message}\`\`\``,
        inline: false,
      });
    }

    await loadingMessage.edit({ embeds: [errorEmbed] });
  }
}

// Show MMR history for a user
async function showMMRHistory(message, registration) {
  const loadingEmbed = new EmbedBuilder()
    .setTitle("🔄 Loading MMR History...")
    .setColor("#ff4654")
    .setDescription("Fetching your ranked progression history...")
    .setTimestamp();

  const loadingMessage = await message.channel.send({ embeds: [loadingEmbed] });

  try {
    console.log(
      `Fetching MMR history for: ${registration.name}#${registration.tag}`
    );

    // Fetch both MMR v3 (current/peak/seasonal) and MMR history
    const [mmrDataV3, mmrHistory] = await Promise.all([
      getMMRDataV3(registration.region, registration.name, registration.tag),
      getMMRHistory(registration.region, registration.name, registration.tag),
    ]);

    if (mmrDataV3.status !== 200 && mmrHistory.status !== 200) {
      throw new Error("Could not fetch MMR data. Player may not have competitive history.");
    }

    const embed = new EmbedBuilder()
      .setTitle(`📈 MMR History - ${registration.name}#${registration.tag}`)
      .setColor("#ff4654")
      .setTimestamp()
      .setFooter({ text: "Powered by HenrikDev API • MMR Tracking v4.0" });

    // Current rank info from v3
    if (mmrDataV3.status === 200 && mmrDataV3.data) {
      const v3Data = mmrDataV3.data;

      // Current rank section
      if (v3Data.current) {
        const current = v3Data.current;
        const rankName = current.tier?.name || "Unranked";
        const rr = current.rr || 0;
        const lastChange = current.last_change || 0;
        const elo = current.elo || 0;
        const gamesNeeded = current.games_needed_for_rating || 0;

        let currentValue = `**${rankName}** • ${rr} RR`;
        if (lastChange !== 0) {
          currentValue += `\nLast Game: ${lastChange > 0 ? "+" : ""}${lastChange} RR`;
        }
        if (elo > 0) {
          currentValue += `\nTotal ELO: ${elo}`;
        }
        if (gamesNeeded > 0) {
          currentValue += `\n⚠️ ${gamesNeeded} more games needed for rating`;
        }

        // Leaderboard placement for high ranks
        if (current.leaderboard_placement && current.leaderboard_placement.rank) {
          currentValue += `\n🏆 **Leaderboard: #${current.leaderboard_placement.rank}**`;
        }

        embed.addFields({
          name: "🎯 Current Rank",
          value: currentValue,
          inline: true,
        });
      }

      // Peak rank section
      if (v3Data.peak) {
        const peak = v3Data.peak;
        const peakRankName = peak.tier?.name || "Unknown";
        const peakSeason = peak.season?.short || "Unknown";

        embed.addFields({
          name: "⭐ Peak Rank",
          value: `**${peakRankName}**\nAchieved in: ${peakSeason}`,
          inline: true,
        });
      }

      // Seasonal stats
      if (v3Data.seasonal && v3Data.seasonal.length > 0) {
        // Get the last 3 seasons (reverse since API returns oldest first)
        const recentSeasons = [...v3Data.seasonal].reverse().slice(0, 3);
        const seasonalText = recentSeasons.map(season => {
          const seasonName = season.season?.short || "Unknown";
          const wins = season.wins || 0;
          const games = season.games || 0;
          const endRank = season.end_tier?.name || "Unrated";
          const winRate = games > 0 ? ((wins / games) * 100).toFixed(1) : 0;

          let text = `**${seasonName}**: ${endRank}`;
          if (games > 0) {
            text += `\n${wins}W/${games - wins}L (${winRate}% WR)`;
          }

          // Show act wins (triangle badges)
          if (season.act_wins && season.act_wins.length > 0) {
            const topWins = season.act_wins.slice(0, 3).map(w => w.name).join(", ");
            text += `\n🔺 ${topWins}`;
          }

          return text;
        }).join("\n\n");

        embed.addFields({
          name: "📅 Recent Seasons",
          value: seasonalText || "No seasonal data",
          inline: false,
        });
      }
    }

    // MMR History (recent matches)
    if (mmrHistory.status === 200 && mmrHistory.data && mmrHistory.data.history) {
      const history = mmrHistory.data.history.slice(0, 10); // Last 10 matches

      if (history.length > 0) {
        const historyText = history.map((match) => {
          const rankName = match.tier?.name || "Unknown";
          const mapName = match.map?.name || "Unknown";
          const rrChange = match.last_change || 0;
          const currentRR = match.rr || 0;
          const date = match.date ? new Date(match.date).toLocaleDateString() : "";

          const changeIcon = rrChange > 0 ? "🟢" : rrChange < 0 ? "🔴" : "⚪";
          const changeText = rrChange > 0 ? `+${rrChange}` : `${rrChange}`;

          return `${changeIcon} **${changeText}** RR → ${currentRR} RR | ${mapName} | ${rankName}${date ? ` • ${date}` : ""}`;
        }).join("\n");

        // Calculate net RR change
        const totalChange = history.reduce((sum, m) => sum + (m.last_change || 0), 0);
        const netText = totalChange > 0 ? `+${totalChange}` : `${totalChange}`;

        embed.addFields({
          name: `📊 Recent RR Changes (Net: ${netText} RR)`,
          value: historyText,
          inline: false,
        });

        // Calculate streak
        let streak = 0;
        let streakType = null;
        for (const match of history) {
          const change = match.last_change || 0;
          if (streakType === null) {
            streakType = change > 0 ? "win" : change < 0 ? "loss" : null;
            streak = streakType ? 1 : 0;
          } else if (
            (streakType === "win" && change > 0) ||
            (streakType === "loss" && change < 0)
          ) {
            streak++;
          } else {
            break;
          }
        }

        if (streak >= 2) {
          const streakEmoji = streakType === "win" ? "🔥" : "❄️";
          const streakText = streakType === "win" ? "Win Streak" : "Loss Streak";
          embed.addFields({
            name: `${streakEmoji} Current ${streakText}`,
            value: `**${streak} games**`,
            inline: true,
          });
        }
      }
    } else {
      embed.addFields({
        name: "📊 Match History",
        value: "No recent competitive matches found",
        inline: false,
      });
    }

    const refreshButton = new ButtonBuilder()
      .setCustomId(`valmmr_history_${message.author.id}`)
      .setLabel("Refresh")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Primary);

    const backButton = new ButtonBuilder()
      .setCustomId(`valstats_refresh_${message.author.id}`)
      .setLabel("Back to Stats")
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(refreshButton, backButton);

    await loadingMessage.edit({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error("Error displaying MMR history:", error);

    let errorDesc = "There was an error fetching your MMR history.";
    let isAccountError = false;

    if (
      error.message.includes("404") ||
      error.message.includes("Could not fetch")
    ) {
      errorDesc = `**Could not find your Valorant account.**\n\nDid you change your Riot ID/Tag recently?\nUse \`!valupdate <NewName#Tag>\` to update it!`;
      isAccountError = true;
    }

    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Error Fetching MMR History")
      .setColor("#ff0000")
      .setDescription(errorDesc);

    if (!isAccountError) {
      errorEmbed.addFields({
        name: "Error Details",
        value: `\`\`\`${error.message}\`\`\``,
        inline: false,
      });
    }

    await loadingMessage.edit({ embeds: [errorEmbed] });
  }
}

// Show detailed match history
async function showUserMatches(message, registration) {
  const loadingEmbed = new EmbedBuilder()
    .setTitle("🔄 Loading Match History...")
    .setColor("#ff4654")
    .setDescription("Fetching your recent competitive matches...")
    .setTimestamp();

  const loadingMessage = await message.channel.send({ embeds: [loadingEmbed] });

  try {
    console.log(
      `Fetching matches for: ${registration.name}#${registration.tag}`
    );

    const matchStats = await getPlayerMatchStats(registration);

    if (matchStats.totalMatches === 0) {
      const noMatchesEmbed = new EmbedBuilder()
        .setTitle("📊 No Competitive Matches Found")
        .setColor("#ffaa00")
        .setDescription(
          `No recent competitive matches found for **${registration.name}#${registration.tag}**`
        )
        .addFields({
          name: "💡 Tip",
          value: "Play some competitive matches and try again!",
          inline: false,
        })
        .setTimestamp();

      return await loadingMessage.edit({ embeds: [noMatchesEmbed] });
    }

    const embed = new EmbedBuilder()
      .setTitle(
        `📊 Competitive Match Stats - ${registration.name}#${registration.tag}`
      )
      .setColor("#ff4654")
      .setDescription(
        `Statistics from **${matchStats.totalMatches}** recent competitive matches`
      )
      .addFields(
        {
          name: "⚔️ KDA",
          value: `**${matchStats.totalKills}** / ${matchStats.totalDeaths} / ${
            matchStats.totalAssists
          }\n**${matchStats.avgKDA.toFixed(2)}** K/D Ratio`,
          inline: true,
        },
        {
          name: "🏆 Win Rate",
          value: `**${matchStats.wins}W** - ${
            matchStats.totalMatches - matchStats.wins
          }L\n**${matchStats.winRate.toFixed(1)}%** Win Rate`,
          inline: true,
        },
        {
          name: "📈 Average ACS",
          value: `**${Math.round(matchStats.avgACS)}** ACS\nPer Match`,
          inline: true,
        },
        {
          name: "📊 Performance Analysis",
          value: [
            `• **Kills per Match:** ${(
              matchStats.totalKills / matchStats.totalMatches
            ).toFixed(1)}`,
            `• **Deaths per Match:** ${(
              matchStats.totalDeaths / matchStats.totalMatches
            ).toFixed(1)}`,
            `• **Assists per Match:** ${(
              matchStats.totalAssists / matchStats.totalMatches
            ).toFixed(1)}`,
          ].join("\n"),
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({
        text: `Based on last ${matchStats.totalMatches} competitive matches`,
      });

    const refreshButton = new ButtonBuilder()
      .setCustomId(`valmatches_refresh_${message.author.id}`)
      .setLabel("Refresh")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(refreshButton);

    await loadingMessage.edit({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error("Error displaying matches:", error);

    let errorDesc = "There was an error fetching your match history.";
    let isAccountError = false;

    // Check if it's likely a changed tag issue
    if (
      error.message.includes("404") ||
      error.message.includes("Could not fetch") ||
      error.message.includes("Account not found")
    ) {
      errorDesc = `**Could not find your Valorant account.**\n\nDid you change your Riot ID/Tag recently?\nUse \`!valupdate <NewName#Tag>\` to update it!`;
      isAccountError = true;
    }

    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Error Fetching Matches")
      .setColor("#ff0000")
      .setDescription(errorDesc);

    if (!isAccountError) {
      errorEmbed.addFields({
        name: "Error Details",
        value: `\`\`\`${error.message}\`\`\``,
        inline: false,
      });
    }

    errorEmbed.setTimestamp();

    await loadingMessage.edit({ embeds: [errorEmbed] });
  }
}

// Get all users who reacted to a message
async function getMessageReactors(targetMessage) {
  const reactors = new Set();

  // Get all reactions from the message
  for (const reaction of targetMessage.reactions.cache.values()) {
    try {
      const users = await reaction.users.fetch();
      users.forEach((user) => {
        if (!user.bot) {
          // Exclude bots
          reactors.add(user);
        }
      });
    } catch (error) {
      console.error("Error fetching reaction users:", error);
    }
  }

  return Array.from(reactors);
}

// Get comprehensive stats for players who have registered
async function getPlayersWithStats(guildId, reactors, client) {
  const players = [];

  for (const user of reactors) {
    const registration = await getUserRegistration(guildId, user.id);
    if (!registration) {
      console.log(`User ${user.tag} is not registered`);
      continue;
    }

    try {
      // Get rank data
      const rankData = await getUserRankData(guildId, user.id);
      if (!rankData) {
        console.log(`No rank data for ${user.tag}`);
        continue;
      }

      // Get match statistics with KDA data
      const matchStats = await getPlayerMatchStats(registration);

      const currentTier = rankData.current_data?.currenttier || 0;
      const peakTier = rankData.highest_rank?.tier || currentTier;
      const currentRR = rankData.current_data?.ranking_in_tier || 0;
      const avgKDA = matchStats.avgKDA || 0;
      const winRate = matchStats.winRate || 0;
      const avgACS = matchStats.avgACS || 0;

      // Calculate skill score
      const skillScore = calculateEnhancedSkillScore(
        currentTier,
        peakTier,
        winRate,
        currentRR,
        avgKDA,
        avgACS
      );

      const rankInfo = getRankInfo(currentTier);

      players.push({
        user,
        registration,
        rankInfo,
        currentTier,
        peakTier,
        currentRR,
        avgKDA,
        winRate,
        avgACS,
        skillScore,
        mmr: calculateMMR(currentTier, currentRR),
      });

      console.log(
        `Added player ${user.tag}: Rank ${rankInfo.name}, KDA ${avgKDA.toFixed(
          2
        )}, WR ${winRate.toFixed(1)}%, Skill ${skillScore.toFixed(2)}`
      );
    } catch (error) {
      console.error(`Error getting stats for ${user.tag}:`, error);
    }
  }

  return players;
}

// Handle team creation from message reactions
async function handleCreateTeams(client, message, messageId, channelId = null) {
  const loadingEmbed = new EmbedBuilder()
    .setTitle("🔄 Creating Balanced Teams...")
    .setColor("#ff4654")
    .setDescription(
      "Analyzing player reactions and calculating comprehensive team balance..."
    )
    .setTimestamp();

  const loadingMessage = await message.channel.send({ embeds: [loadingEmbed] });

  try {
    // Determine which channel to search in
    let targetChannel = message.channel;
    if (channelId) {
      try {
        targetChannel = await client.channels.fetch(channelId);
        if (!targetChannel) {
          throw new Error("Channel not found");
        }
        if (!targetChannel.isTextBased()) {
          throw new Error("Target channel is not a text channel");
        }
      } catch (error) {
        throw new Error(
          `Could not access channel ${channelId}: ${error.message}`
        );
      }
    }

    // Validate message ID format
    if (!/^\d{17,19}$/.test(messageId)) {
      throw new Error(
        "Invalid message ID format. Message IDs should be 17-19 digits long."
      );
    }

    // Attempt to fetch the target message with better error handling
    let targetMessage;
    try {
      targetMessage = await targetChannel.messages.fetch(messageId);
      if (!targetMessage) {
        throw new Error("Message not found");
      }
    } catch (fetchError) {
      if (fetchError.code === 10008) {
        throw new Error(
          `Message with ID ${messageId} was not found in ${targetChannel.name}. Please check:\n• The message ID is correct\n• The message exists in the specified channel\n• The message hasn't been deleted\n• The bot has permission to read message history`
        );
      } else if (fetchError.code === 50001) {
        throw new Error(
          `The bot doesn't have permission to access ${targetChannel.name}`
        );
      } else if (fetchError.code === 50013) {
        throw new Error(
          `The bot doesn't have permission to read message history in ${targetChannel.name}`
        );
      } else {
        throw new Error(`Failed to fetch message: ${fetchError.message}`);
      }
    }

    // Check if the message has any reactions
    if (!targetMessage.reactions.cache.size) {
      throw new Error(
        "The target message has no reactions. Players need to react to the message to be included in team creation."
      );
    }

    // Get all users who reacted to the message
    const reactors = await getMessageReactors(targetMessage);

    if (reactors.length < 2) {
      throw new Error(
        `Need at least 2 players to create teams. Found ${reactors.length} reactor(s).`
      );
    }

    // Update loading message with progress
    const progressEmbed = new EmbedBuilder()
      .setTitle("🔄 Processing Players...")
      .setColor("#ff4654")
      .setDescription(
        `Found ${reactors.length} players. Getting comprehensive Valorant stats...`
      )
      .addFields({
        name: "📊 Progress",
        value:
          "Fetching player registrations, rank data, and match statistics...",
        inline: false,
      })
      .setTimestamp();

    await loadingMessage.edit({ embeds: [progressEmbed] });

    // Get comprehensive stats for each registered player
    const players = await getPlayersWithStats(message.guild.id, reactors, client);

    if (players.length < 2) {
      const unregisteredCount = reactors.length - players.length;

      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Not Enough Registered Players")
        .setColor("#ff0000")
        .setDescription(
          `Need at least **2 registered players** to create teams.\n\n**Found:** ${players.length}/${reactors.length} reactors registered`
        )
        .addFields(
          {
            name: "🔧 Unregistered Players - How to Fix",
            value:
              "1. Each unregistered player: Use `!valstats` in chat\n" +
              '2. Click the **"Register Now"** button\n' +
              "3. Fill in: **Valorant Name#Tag** and **region**\n" +
              "4. Wait 30 seconds for API verification\n" +
              "5. Try `!createteams` again",
            inline: false,
          },
          {
            name: "🌍 Supported Regions",
            value: "`NA`, `EU`, `AP`, `KR`, `LATAM`, `BR`",
            inline: false,
          },
          {
            name: "💡 Already Registered?",
            value: "Make sure you reacted to the message with an emoji!",
            inline: false,
          }
        )
        .setFooter({ text: `${unregisteredCount} player(s) need to register` });

      await loadingMessage.edit({ embeds: [errorEmbed] });
      return; // Exit gracefully instead of throwing
    }

    // Update loading with calculation phase
    const calcEmbed = new EmbedBuilder()
      .setTitle("⚖️ Calculating Team Balance...")
      .setColor("#ff4654")
      .setDescription(
        `Analyzing ${players.length} players using enhanced skill formula...`
      )
      .addFields({
        name: "🧮 Skill Formula Components",
        value:
          "• Current Rank (35%)\n• KDA Ratio (25%)\n• Win Rate (20%)\n• Peak Rank (15%)\n• Current RR (5%)",
        inline: false,
      })
      .setTimestamp();

    await loadingMessage.edit({ embeds: [calcEmbed] });

    // Create balanced teams
    const teams = createBalancedTeams(players);

    // Display the teams
    await displayBalancedTeams(
      loadingMessage,
      teams,
      reactors.length,
      players.length,
      targetChannel.name
    );
  } catch (error) {
    console.error("Error creating teams:", error);

    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Error Creating Teams")
      .setColor("#ff0000")
      .setDescription("There was an error creating balanced teams.")
      .addFields(
        {
          name: "🐛 Error Details:",
          value: `\`\`\`${error.message}\`\`\``,
          inline: false,
        },
        {
          name: "💡 Common Solutions:",
          value: [
            "• Double-check the message ID is correct",
            "• Ensure the message has reactions",
            "• Make sure players are registered with `!valstats`",
            "• Verify the bot has permission to read message history",
            "• If using a different channel, include the channel ID: `!createteams <messageId> <channelId>`",
          ].join("\n"),
          inline: false,
        },
        {
          name: "📖 Command Format:",
          value: "`!createteams <messageId> [channelId]`",
          inline: false,
        }
      )
      .setTimestamp();

    await loadingMessage.edit({ embeds: [errorEmbed] });
  }
}

// Display balanced teams with comprehensive information
async function displayBalancedTeams(
  loadingMessage,
  teams,
  totalReactors,
  registeredPlayers,
  channelName = "current channel"
) {
  const embed = new EmbedBuilder()
    .setTitle("⚖️ Enhanced Balanced Valorant Teams")
    .setColor("#ff4654")
    .setDescription(
      `Created ${teams.length} balanced teams from reactions in ${channelName}`
    )
    .addFields({
      name: "📊 Analysis Summary",
      value: `**Total Reactors:** ${totalReactors}\n**Registered Players:** ${registeredPlayers}\n**Teams Created:** ${teams.length}\n**Algorithm:** Enhanced Snake Draft with KDA`,
      inline: false,
    });

  // Add each team
  teams.forEach((team, index) => {
    const teamNumber = index + 1;
    const teamMembers = team.players
      .map((p) => {
        const rankIcon = p.rankInfo.name.charAt(0);
        return `${rankIcon} **${p.user.username}** - ${p.rankInfo.name} (${
          p.currentRR
        } RR)\n   └ KDA: ${p.avgKDA.toFixed(2)} | WR: ${p.winRate.toFixed(
          1
        )}% | Skill: ${p.skillScore.toFixed(1)}`;
      })
      .join("\n");

    embed.addFields({
      name: `👥 Team ${teamNumber} - Avg Skill: ${team.avgSkill.toFixed(2)}`,
      value: teamMembers || "No players",
      inline: false,
    });

    // Add team statistics
    embed.addFields({
      name: `📊 Team ${teamNumber} Stats`,
      value: `**Avg KDA:** ${team.avgKDA.toFixed(
        2
      )} | **Avg WR:** ${team.avgWinRate.toFixed(1)}% | **Players:** ${
        team.players.length
      }`,
      inline: false,
    });
  });

  // Add unregistered players info
  const unregisteredCount = totalReactors - registeredPlayers;
  if (unregisteredCount > 0) {
    embed.addFields({
      name: "⚠️ Unregistered Players",
      value: `${unregisteredCount} players who reacted are not registered.\nThey can use \`!valstats\` to register and be included in future team creation.`,
      inline: false,
    });
  }

  embed.setTimestamp().setFooter({
    text: "Balanced using: Current Rank (35%) + KDA (25%) + Win Rate (20%) + Peak Rank (15%) + RR (5%) • Use !valskills (admin) to view ratings",
  });

  await loadingMessage.edit({ embeds: [embed] });
}

// ===============================================
// MODULE EXPORTS AND EVENT HANDLERS
// ===============================================

module.exports = {
  // Export functions for other handlers to use
  getUserRegistration,
  getUserRankData,
  loadRankImage,
  RANK_MAPPING,
  createFallbackRankIcon,
  getAllRegisteredUsers,

  // Initialize function to set up event handlers
  init: async (client) => {
    // Only add event listeners if not already added
    if (!client._valorantApiHandlerInitialized) {
      console.log(
        "Valorant API Handler (Refactored) with KDA Integration & Stored Matches loaded successfully!"
      );
      console.log(`Registered regions: ${VALID_REGIONS.join(", ")}`);
      console.log(
        "Commands: !valstats, !valprofile, !valmatches, !createteams (admin), !valtest (admin), !valreset (admin), !vallist (admin), !valskills (admin)"
      );
      console.log(`Data file: ${USERS_FILE}`);

      client.on("messageCreate", async (message) => {
        if (message.author.bot) return;
        if (!message.guild) return;

        const command = message.content.toLowerCase().split(" ")[0];

        // !valstats or !valprofile command - ULTIMATE TIER REQUIRED
        if (command === "!valstats" || command === "!valprofile") {
          // Check subscription tier (guild-based)
          const subCheck = await checkSubscription(
            message.guild.id,
            TIERS.ULTIMATE,
            message.guild.ownerId
          );
          if (!subCheck.hasAccess) {
            const upgradeEmbed = createUpgradeEmbed(
              "Valorant Stats",
              TIERS.ULTIMATE,
              subCheck.guildTier
            );
            return message.channel.send({ embeds: [upgradeEmbed] });
          }

          // Use migration utility to handle legacy username registrations
          const registration = await findOrMigrateUser(message.guild.id, message.author);

          // Check if registration exists AND has all required fields
          if (!registration || !registration.name || !registration.tag || !registration.region) {
            // If incomplete registration exists, remove it first so they can re-register
            if (registration) {
              await removeUserRegistration(message.guild.id, message.author.id);
            }
            await showRegistrationPrompt(message);
          } else {
            await showUserStats(message, registration);
          }
        }

        // !valupdate command
        if (command === "!valupdate") {
          const args = message.content.split(" ").slice(1);
          await handleUpdateRegistration(message, args);
        }

        // !valmatches command - ULTIMATE TIER REQUIRED
        if (command === "!valmatches") {
          // Check subscription tier (guild-based)
          const subCheck = await checkSubscription(
            message.guild.id,
            TIERS.ULTIMATE,
            message.guild.ownerId
          );
          if (!subCheck.hasAccess) {
            const upgradeEmbed = createUpgradeEmbed(
              "Valorant Match History",
              TIERS.ULTIMATE,
              subCheck.guildTier
            );
            return message.channel.send({ embeds: [upgradeEmbed] });
          }

          const registration = await findOrMigrateUser(message.guild.id, message.author);
          // Check if registration exists AND has all required fields
          if (!registration || !registration.name || !registration.tag || !registration.region) {
            await message.channel.send(
              "❌ You need to register first! Use `!valstats` to register your Valorant account."
            );
          } else {
            await showUserMatches(message, registration);
          }
        }

        // !valreset command (admin only)
        if (
          command === "!valreset" &&
          message.member.permissions.has("ADMINISTRATOR")
        ) {
          const mentionedUser = message.mentions.users.first();
          if (mentionedUser) {
            const removed = await removeUserRegistration(message.guild.id, mentionedUser.id);
            if (removed) {
              await message.channel.send(
                `✅ Reset Valorant registration for ${mentionedUser.tag}`
              );
            } else {
              await message.channel.send(
                `❌ ${mentionedUser.tag} is not registered.`
              );
            }
          } else {
            await message.channel.send(
              "❌ Please mention a user to reset their registration."
            );
          }
        }

        // !createteams command (admin only) - PLUS TIER REQUIRED
        if (
          command === "!createteams" &&
          message.member.permissions.has("ADMINISTRATOR")
        ) {
          // Check subscription tier (guild-based)
          const subCheck = await checkSubscription(
            message.guild.id,
            TIERS.PLUS,
            message.guild.ownerId
          );
          if (!subCheck.hasAccess) {
            const upgradeEmbed = createUpgradeEmbed(
              "Valorant Team Builder",
              TIERS.PLUS,
              subCheck.guildTier
            );
            await message.channel.send({ embeds: [upgradeEmbed] });
            return;
          }

          const args = message.content.split(" ").slice(1);
          if (args.length === 0) {
            const helpEmbed = new EmbedBuilder()
              .setTitle("📖 Create Teams Command Help")
              .setColor("#ff4654")
              .setDescription(
                "Create balanced Valorant teams from message reactions using comprehensive player statistics."
              )
              .addFields(
                {
                  name: "📝 Command Format",
                  value:
                    "`!createteams <messageId> [channelId]`\n\n**Examples:**\n• `!createteams 1234567890` (same channel)\n• `!createteams 1234567890 9876543210` (different channel)",
                  inline: false,
                },
                {
                  name: "🔍 How to Get Message ID",
                  value:
                    '1. Enable Developer Mode in Discord Settings\n2. Right-click any message\n3. Click "Copy Message ID"',
                  inline: false,
                }
              )
              .setTimestamp();
            await message.channel.send({ embeds: [helpEmbed] });
            return;
          }
          const messageId = args[0];
          const channelId = args[1] || null;
          await handleCreateTeams(client, message, messageId, channelId);
        }

        // !vallist command (admin only)
        if (
          command === "!vallist" &&
          message.member.permissions.has("ADMINISTRATOR")
        ) {
          const allUsers = await getAllRegisteredUsers(message.guild.id);
          if (allUsers.size === 0) {
            await message.channel.send("No registered Valorant users found.");
            return;
          }

          const embed = new EmbedBuilder()
            .setTitle("📋 Registered Valorant Users")
            .setColor("#ff4654")
            .setDescription(`Total registered users: ${allUsers.size}`)
            .setTimestamp();

          let userList = [];
          for (const [userId, userData] of allUsers) {
            try {
              const user = await client.users.fetch(userId);
              userList.push(
                `• **${user.tag}**: ${userData.name}#${
                  userData.tag
                } (${userData.region.toUpperCase()})`
              );
            } catch (error) {
              userList.push(
                `• **Unknown User** (${userId}): ${userData.name}#${
                  userData.tag
                } (${userData.region.toUpperCase()})`
              );
            }
          }

          // Split into chunks if too long
          const chunkSize = 10;
          for (let i = 0; i < userList.length; i += chunkSize) {
            const chunk = userList.slice(i, i + chunkSize);
            embed.addFields({
              name: `Users ${i + 1}-${Math.min(
                i + chunkSize,
                userList.length
              )}`,
              value: chunk.join("\n") || "None",
              inline: false,
            });
          }

          await message.channel.send({ embeds: [embed] });
        }

        // !valskills command (admin only) - Show skill ratings
        if (
          command === "!valskills" &&
          message.member.permissions.has("ADMINISTRATOR")
        ) {
          const allUsers = await getAllRegisteredUsers(message.guild.id);
          if (allUsers.size === 0) {
            await message.channel.send("No registered Valorant users found.");
            return;
          }

          const loadingMsg = await message.channel.send(
            "🔄 Calculating skill ratings for all users..."
          );

          const playerSkills = [];
          for (const [userId, userData] of allUsers) {
            try {
              const user = await client.users.fetch(userId);
              const rankData = await getUserRankData(message.guild.id, userId);
              if (!rankData) continue;

              const matchStats = await getPlayerMatchStats(userData);

              const currentTier = rankData.current_data?.currenttier || 0;
              const peakTier = rankData.highest_rank?.tier || currentTier;
              const currentRR = rankData.current_data?.ranking_in_tier || 0;
              const avgKDA = matchStats.avgKDA || 0;
              const winRate = matchStats.winRate || 0;
              const avgACS = matchStats.avgACS || 0;

              const skillScore = calculateEnhancedSkillScore(
                currentTier,
                peakTier,
                winRate,
                currentRR,
                avgKDA,
                avgACS
              );

              const rankInfo = getRankInfo(currentTier);

              playerSkills.push({
                user,
                rankInfo,
                skillScore,
                avgKDA,
                winRate,
              });
            } catch (error) {
              console.error(`Error getting skills for user ${userId}:`, error);
            }
          }

          // Sort by skill score
          playerSkills.sort((a, b) => b.skillScore - a.skillScore);

          const embed = new EmbedBuilder()
            .setTitle("🎯 Player Skill Ratings")
            .setColor("#ff4654")
            .setDescription(
              `Comprehensive skill ratings for ${playerSkills.length} players\n\n**Formula:** Current Rank (35%) + KDA (25%) + Win Rate (20%) + Peak Rank (15%) + RR (5%)`
            )
            .setTimestamp();

          const playerList = playerSkills
            .map((p, i) => {
              return `**${i + 1}.** ${p.user.username}\n   └ ${
                p.rankInfo.name
              } | Skill: ${p.skillScore.toFixed(2)} | KDA: ${p.avgKDA.toFixed(
                2
              )} | WR: ${p.winRate.toFixed(1)}%`;
            })
            .join("\n\n");

          // Split if too long
          if (playerList.length > 1024) {
            const chunks = playerList.match(/[\s\S]{1,1024}/g) || [];
            chunks.forEach((chunk, i) => {
              embed.addFields({
                name: i === 0 ? "📊 Rankings" : "\u200b",
                value: chunk,
                inline: false,
              });
            });
          } else {
            embed.addFields({
              name: "📊 Rankings",
              value: playerList || "No data",
              inline: false,
            });
          }

          await loadingMsg.edit({ content: null, embeds: [embed] });
        }

        // !valtest command (admin only)
        if (
          command === "!valtest" &&
          message.member.permissions.has("ADMINISTRATOR")
        ) {
          const args = message.content.split(" ").slice(1);
          if (args.length < 2) {
            await message.channel.send(
              "Usage: `!valtest <username#tag> <region>`\nExample: `!valtest Player#1234 na`"
            );
            return;
          }

          const username = args[0];
          const region = args[1].toLowerCase();

          if (!username.includes("#")) {
            await message.channel.send(
              "❌ Invalid username format! Use: Username#Tag"
            );
            return;
          }

          // Validate inputs
          const [name, tag] = username.split("#");
          const validation = validateValorantRegistration({
            name,
            tag,
            region,
          });

          if (!validation.valid) {
            const errorMessages = Object.values(validation.errors).join("\n");
            await message.channel.send(
              `❌ Validation failed:\n${errorMessages}`
            );
            return;
          }

          const {
            name: cleanName,
            tag: cleanTag,
            region: cleanRegion,
          } = validation.sanitized;

          const testEmbed = new EmbedBuilder()
            .setTitle("🧪 Testing Valorant API")
            .setColor("#ff4654")
            .setDescription(
              `Testing account: **${cleanName}#${cleanTag}** in region **${cleanRegion.toUpperCase()}**`
            )
            .setTimestamp();

          const testMessage = await message.channel.send({
            embeds: [testEmbed],
          });

          try {
            const accountData = await getAccountData(cleanName, cleanTag);

            if (accountData.status !== 200) {
              throw new Error(
                `Account not found: ${accountData.error || "Unknown error"}`
              );
            }

            const mmrData = await getMMRData(cleanRegion, cleanName, cleanTag);

            testEmbed.addFields({
              name: "✅ Account Found",
              value: `**Level:** ${
                accountData.data.account_level
              }\n**Region:** ${
                accountData.data.region
              }\n**PUUID:** ${accountData.data.puuid.substring(0, 16)}...`,
              inline: false,
            });

            if (mmrData.status === 200 && mmrData.data) {
              const currentRank = mmrData.data.current_data;
              const rankInfo = getRankInfo(currentRank?.currenttier || 0);

              testEmbed.addFields({
                name: "🏆 Rank Data",
                value: `**Current Rank:** ${rankInfo.name}\n**RR:** ${
                  currentRank?.ranking_in_tier || 0
                }\n**MMR Change:** ${
                  currentRank?.mmr_change_to_last_game || 0
                }`,
                inline: false,
              });
            } else {
              testEmbed.addFields({
                name: "⚠️ MMR Data",
                value: "No competitive rank data available",
                inline: false,
              });
            }

            testEmbed.setColor("#00ff00");
            await testMessage.edit({ embeds: [testEmbed] });
          } catch (error) {
            testEmbed.setColor("#ff0000");
            testEmbed.addFields({
              name: "❌ Error",
              value: `\`\`\`${error.message}\`\`\``,
              inline: false,
            });
            await testMessage.edit({ embeds: [testEmbed] });
          }
        }
      });

      // Handle button interactions
      client.on("interactionCreate", async (interaction) => {
        try {
          if (interaction.isButton()) {
            // Registration button
            if (interaction.customId.startsWith("valstats_register_")) {
              const userId = interaction.customId.split("_")[2];
              if (interaction.user.id !== userId) {
                return await safeInteractionResponse(interaction, "reply", {
                  content: "❌ This registration is not for you!",
                  ephemeral: true,
                });
              }
              await showRegistrationModal(interaction);
            }

            // Refresh stats button
            if (interaction.customId.startsWith("valstats_refresh_")) {
              const userId = interaction.customId.split("_")[2];
              if (interaction.user.id !== userId) {
                return await safeInteractionResponse(interaction, "reply", {
                  content: "❌ This is not your stats panel!",
                  ephemeral: true,
                });
              }

              const registration = await getUserRegistration(interaction.guild.id, userId);
              if (!registration) {
                return await safeInteractionResponse(interaction, "reply", {
                  content:
                    "❌ You are not registered! Use `!valstats` to register.",
                  ephemeral: true,
                });
              }

              await safeInteractionResponse(interaction, "defer");
              await showUserStats(
                {
                  channel: interaction.channel,
                  author: interaction.user,
                },
                registration
              );
            }

            // Refresh matches button
            if (interaction.customId.startsWith("valmatches_refresh_")) {
              const userId = interaction.customId.split("_")[2];
              if (interaction.user.id !== userId) {
                return await safeInteractionResponse(interaction, "reply", {
                  content: "❌ This is not your matches panel!",
                  ephemeral: true,
                });
              }

              const registration = await getUserRegistration(interaction.guild.id, userId);
              if (!registration) {
                return await safeInteractionResponse(interaction, "reply", {
                  content:
                    "❌ You are not registered! Use `!valstats` to register.",
                  ephemeral: true,
                });
              }

              await safeInteractionResponse(interaction, "defer");
              await showUserMatches(
                {
                  channel: interaction.channel,
                  author: interaction.user,
                },
                registration
              );
            }

            // MMR History button
            if (interaction.customId.startsWith("valmmr_history_")) {
              const userId = interaction.customId.split("_")[2];
              if (interaction.user.id !== userId) {
                return await safeInteractionResponse(interaction, "reply", {
                  content: "❌ This is not your MMR history panel!",
                  ephemeral: true,
                });
              }

              const registration = await getUserRegistration(interaction.guild.id, userId);
              if (!registration) {
                return await safeInteractionResponse(interaction, "reply", {
                  content:
                    "❌ You are not registered! Use `!valstats` to register.",
                  ephemeral: true,
                });
              }

              await safeInteractionResponse(interaction, "defer");
              await showMMRHistory(
                {
                  channel: interaction.channel,
                  author: interaction.user,
                },
                registration
              );
            }
          }

          // Handle modal submissions
          if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith("valstats_registration_")) {
              await handleRegistrationSubmission(interaction);
            }
          }
        } catch (error) {
          console.error("Error handling interaction:", error);
        }
      });

      client._valorantApiHandlerInitialized = true;
    }
  },
};
