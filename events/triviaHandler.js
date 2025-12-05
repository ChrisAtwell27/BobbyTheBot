const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const axios = require("axios");
const cron = require("node-cron");
// const TriviaSession = require("../database/models/TriviaSession"); // REMOVED: Migrated to Convex
const { getConvexClient } = require("../database/convexClient");
const { api } = require("../convex/_generated/api");
// TARGET_GUILD_ID removed
const { getSetting } = require("../utils/settingsManager");

// TRIVIA_CHANNEL_ID removed (dynamic)
const CATEGORY_VIDEO_GAMES = 15;

// Decode HTML entities
function decodeHTML(text) {
  const entities = {
    "&quot;": '"',
    "&#039;": "'",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&ldquo;": '"',
    "&rdquo;": '"',
    "&lsquo;": "'",
    "&rsquo;": "'",
    "&ndash;": "-",
    "&mdash;": "-",
    "&hellip;": "...",
    "&nbsp;": " ",
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, "g"), char);
  }
  return decoded;
}

// Get or create session token
async function getSessionToken(guildId) {
  try {
    const client = getConvexClient();
    let session = await client.query(api.trivia.getSession, {
      guildId: guildId,
    });

    // Check if token exists and isn't expired (6 hours)
    const now = Date.now();
    const sixHours = 6 * 60 * 60 * 1000;

    if (session && session.sessionToken && now - session.lastUsed < sixHours) {
      // Update last used time - using updateSessionToken or upsertSession
      await client.mutation(api.trivia.updateSessionToken, {
        guildId: guildId,
        sessionToken: session.sessionToken,
      });
      return session.sessionToken;
    }

    // Need to get a new token
    console.log("[TRIVIA] Requesting new session token...");
    const response = await axios.get(
      "https://opentdb.com/api_token.php?command=request"
    );

    if (response.data.response_code === 0) {
      const newToken = response.data.token;

      // Create or update session with new token
      await client.mutation(api.trivia.upsertSession, {
        guildId: guildId,
        sessionToken: newToken,
      });

      console.log("[TRIVIA] New session token obtained");
      return newToken;
    } else {
      console.error("[TRIVIA] Failed to get session token:", response.data);
      return null;
    }
  } catch (error) {
    console.error("[TRIVIA] Error getting session token:", error);
    return null;
  }
}

// Reset session token if it's exhausted
async function resetSessionToken(guildId, token) {
  try {
    console.log("[TRIVIA] Resetting exhausted token...");
    const response = await axios.get(
      `https://opentdb.com/api_token.php?command=reset&token=${token}`
    );

    if (response.data.response_code === 0) {
      const client = getConvexClient();
      // Update last used time
      await client.mutation(api.trivia.updateSessionToken, {
        guildId: guildId,
        sessionToken: token,
      });

      console.log("[TRIVIA] Token reset successfully");
      return true;
    }
    return false;
  } catch (error) {
    console.error("[TRIVIA] Error resetting token:", error);
    return false;
  }
}

// Fetch a trivia question
async function fetchTriviaQuestion(guildId, retryCount = 0) {
  const MAX_RETRIES = 3;

  try {
    const token = await getSessionToken(guildId);
    if (!token) {
      console.error("[TRIVIA] No valid session token available");
      return null;
    }

    // Fetch question from API
    const url = `https://opentdb.com/api.php?amount=1&category=${CATEGORY_VIDEO_GAMES}&token=${token}`;
    console.log("[TRIVIA] Fetching question from API...");

    const response = await axios.get(url);

    // Handle response codes
    switch (response.data.response_code) {
      case 0: // Success
        const question = response.data.results[0];
        return question;

      case 1: // No results
        console.error("[TRIVIA] No results available");
        return null;

      case 2: // Invalid parameter
        console.error("[TRIVIA] Invalid parameter");
        return null;

      case 3: // Token not found
        if (retryCount >= MAX_RETRIES) {
          console.error("[TRIVIA] Max retries reached for token not found");
          return null;
        }
        console.error("[TRIVIA] Token not found, getting new token...");
        await getSessionToken(guildId);
        return fetchTriviaQuestion(guildId, retryCount + 1); // Retry with new token

      case 4: // Token empty (all questions used)
        if (retryCount >= MAX_RETRIES) {
          console.error("[TRIVIA] Max retries reached for token exhaustion");
          return null;
        }
        console.log("[TRIVIA] Token exhausted, resetting...");
        await resetSessionToken(guildId, token);
        return fetchTriviaQuestion(guildId, retryCount + 1); // Retry after reset

      case 5: // Rate limit
        console.error("[TRIVIA] Rate limited, please wait");
        return null;

      default:
        console.error(
          "[TRIVIA] Unknown response code:",
          response.data.response_code
        );
        return null;
    }
  } catch (error) {
    console.error("[TRIVIA] Error fetching trivia question:", error);
    return null;
  }
}

// Removed import line since it was moved to top

// ... imports ...

// Post daily trivia question for a specific guild
async function postDailyTriviaForGuild(client, guildId, channelId) {
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      console.error(
        `[TRIVIA] Could not find trivia channel ${channelId} for guild ${guildId}`
      );
      return;
    }

    // Check if there's already an unanswered question today
    const convexClient = getConvexClient();
    const session = await convexClient.query(api.trivia.getSession, {
      guildId: guildId,
    });

    if (session && session.activeQuestion && !session.activeQuestion.answered) {
      const postedToday =
        new Date(session.activeQuestion.postedAt).toDateString() ===
        new Date().toDateString();
      if (postedToday) {
        console.log(
          `[TRIVIA] Question already posted today for guild ${guildId}`
        );
        return;
      }
    }

    const question = await fetchTriviaQuestion(guildId);
    if (!question) {
      // Quiet fail or notify admin? Quiet for now
      return;
    }

    // ... processing ...
    // Decode HTML entities
    const decodedQuestion = decodeHTML(question.question);
    const decodedCorrectAnswer = decodeHTML(question.correct_answer);
    const decodedIncorrectAnswers = question.incorrect_answers.map((ans) =>
      decodeHTML(ans)
    );

    // Shuffle answers
    const allAnswers = [decodedCorrectAnswer, ...decodedIncorrectAnswers];
    const shuffledAnswers = allAnswers.sort(() => Math.random() - 0.5);

    // Build embed
    const difficultyColors = {
      easy: "#00ff00",
      medium: "#ffa500",
      hard: "#ff0000",
    };

    const difficultyEmojis = {
      easy: "🟢",
      medium: "🟡",
      hard: "🔴",
    };

    const buttonLabels = ["A", "B", "C", "D"];
    let answersText = shuffledAnswers
      .map((ans, i) => {
        return `**${buttonLabels[i]}.** ${ans}`;
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setTitle("🎮 Daily Video Game Trivia!")
      .setColor(difficultyColors[question.difficulty] || "#3498db")
      .setDescription(`**${decodedQuestion}**\n\n${answersText}`)
      .addFields(
        {
          name: "🎯 Difficulty",
          value: `${difficultyEmojis[question.difficulty]} ${question.difficulty.toUpperCase()}`,
          inline: true,
        },
        {
          name: "⏰ Answer Revealed",
          value: "Today at 8:00 PM EST",
          inline: true,
        }
      )
      .setFooter({
        text: "Discuss your answers below! 💭 Answer will be revealed at 8 PM EST",
      })
      .setTimestamp();

    const message = await channel.send({
      content: "🎮 **Daily Trivia Time!** Think you know gaming? 🧠",
      embeds: [embed],
    });

    // Save to database
    const activeQuestion = {
      question: decodedQuestion,
      correctAnswer: decodedCorrectAnswer,
      incorrectAnswers: decodedIncorrectAnswers,
      allAnswers: shuffledAnswers,
      difficulty: question.difficulty,
      category: question.category,
      postedAt: Date.now(),
      messageId: message.id,
      answered: false,
    };

    let totalQuestions = 1;
    if (session) {
      totalQuestions = (session.totalQuestions || 0) + 1;
    }

    await convexClient.mutation(api.trivia.upsertSession, {
      guildId: guildId,
      activeQuestion: activeQuestion,
      totalQuestions: totalQuestions,
    });

    console.log(
      `[TRIVIA] Daily trivia posted successfully for guild ${guildId}`
    );
  } catch (error) {
    console.error(
      `[TRIVIA] Error posting daily trivia for guild ${guildId}:`,
      error
    );
  }
}

// Iterate all guilds and post trivia
async function postDailyTrivia(client) {
  try {
    const convex = getConvexClient();
    if (!convex) return;

    const servers = await convex.query(api.servers.getAllServers);

    for (const server of servers) {
      const guildId = server.guildId;

      // Check if trivia is enabled
      const isEnabled = await getSetting(guildId, "features.trivia", true);
      if (!isEnabled) continue;

      // Get trivia channel
      const channelId = await getSetting(guildId, "channels.trivia");
      if (!channelId) continue;

      await postDailyTriviaForGuild(client, guildId, channelId);
    }
  } catch (err) {
    console.error("[TRIVIA] Error in postDailyTrivia cron:", err);
  }
}

// Reveal answer for a specific guild
async function revealAnswerForGuild(client, guildId, channelId) {
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const convexClient = getConvexClient();
    const session = await convexClient.query(api.trivia.getSession, {
      guildId: guildId,
    });

    if (
      !session ||
      !session.activeQuestion ||
      session.activeQuestion.answered
    ) {
      return;
    }

    const aq = session.activeQuestion;

    // Find which letter corresponds to the correct answer
    const buttonLabels = ["A", "B", "C", "D"];
    const correctIndex = aq.allAnswers.indexOf(aq.correctAnswer);
    const correctLetter = buttonLabels[correctIndex];

    const embed = new EmbedBuilder()
      .setTitle("🎯 Daily Trivia Answer Revealed!")
      .setColor("#ffd700")
      .setDescription(
        `**Question:** ${aq.question}\n\n**Correct Answer:** ${correctLetter}. **${aq.correctAnswer}**`
      )
      .addFields(
        {
          name: "🎮 Difficulty",
          value: aq.difficulty.toUpperCase(),
          inline: true,
        },
        { name: "📊 Category", value: aq.category, inline: true }
      )
      .setFooter({
        text: "Thanks for playing! New trivia question tomorrow! 🎮",
      })
      .setTimestamp();

    await channel.send({ embeds: [embed] });

    // Mark as answered
    const updatedActiveQuestion = {
      ...aq,
      answered: true,
      answeredAt: Date.now(),
    };

    await convexClient.mutation(api.trivia.updateActiveQuestion, {
      guildId: guildId,
      activeQuestion: updatedActiveQuestion,
    });
  } catch (error) {
    console.error(
      `[TRIVIA] Error revealing answer for guild ${guildId}:`,
      error
    );
  }
}

// Iterate all guilds and reveal answer
async function revealAnswer(client) {
  try {
    const convex = getConvexClient();
    if (!convex) return;

    const servers = await convex.query(api.servers.getAllServers);

    for (const server of servers) {
      const guildId = server.guildId;
      // Get trivia channel
      const channelId = await getSetting(guildId, "channels.trivia");
      if (!channelId) continue;

      await revealAnswerForGuild(client, guildId, channelId);
    }
  } catch (err) {
    console.error("[TRIVIA] Error in revealAnswer cron:", err);
  }
}

module.exports = (client) => {
  // Schedule daily trivia posting at 10:00 AM EST (15:00 UTC)
  // Cron format: second minute hour day month weekday
  cron.schedule(
    "0 15 * * *",
    () => {
      console.log("[TRIVIA] Cron job triggered for daily trivia");
      postDailyTrivia(client);
    },
    {
      timezone: "America/New_York",
    }
  );

  // Schedule answer reveal at 8:00 PM EST (01:00 UTC next day)
  cron.schedule(
    "0 1 * * *",
    () => {
      console.log("[TRIVIA] Cron job triggered for answer reveal");
      revealAnswer(client);
    },
    {
      timezone: "America/New_York",
    }
  );

  console.log(
    "[TRIVIA] Scheduled jobs initialized - Daily question at 10 AM EST, Answer reveal at 8 PM EST"
  );

  // Manual commands
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // Only run in guilds
    if (!message.guild) return;

    // Get enabled status and channel setting
    const guildId = message.guild.id;
    const channelId = await getSetting(guildId, "channels.trivia");

    // EARLY RETURN: Skip if not a trivia command
    const command = message.content.toLowerCase();
    if (!command.startsWith("!trivia")) return;

    // Manual trivia post (for testing or manual trigger - Admin only)
    if (command === "!trivia") {
      // Check if user has administrator permissions
      if (
        !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return message.reply(
          "You don't have permission to use this command. (Administrator only)"
        );
      }

      if (!channelId || message.channel.id !== channelId) {
        return message.reply(
          `Trivia questions can only be posted in the configured trivia channel!`
        );
      }
      await postDailyTriviaForGuild(client, guildId, channelId);
    }

    // Manual answer reveal (for testing - Admin only)
    if (command === "!triviaanswer") {
      // Check if user has administrator permissions
      if (
        !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return message.reply(
          "You don't have permission to use this command. (Administrator only)"
        );
      }

      if (!channelId || message.channel.id !== channelId) {
        return message.reply(
          `Trivia commands can only be used in the configured trivia channel!`
        );
      }
      await revealAnswerForGuild(client, guildId, channelId);
    }

    // Show current question (Admin only)
    if (command === "!triviacurrent") {
      // Check if user has administrator permissions
      if (
        !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return message.reply(
          "You don't have permission to use this command. (Administrator only)"
        );
      }

      try {
        const convexClient = getConvexClient();
        const session = await convexClient.query(api.trivia.getSession, {
          guildId: guildId,
        });

        if (
          !session ||
          !session.activeQuestion ||
          session.activeQuestion.answered
        ) {
          return message.reply(
            "No active trivia question right now! Check back at 10 AM EST."
          );
        }

        const aq = session.activeQuestion;
        const buttonLabels = ["A", "B", "C", "D"];
        let answersText = aq.allAnswers
          .map((ans, i) => {
            return `**${buttonLabels[i]}.** ${ans}`;
          })
          .join("\n");

        const embed = new EmbedBuilder()
          .setTitle("🎮 Current Daily Trivia")
          .setColor("#3498db")
          .setDescription(`**${aq.question}**\n\n${answersText}`)
          .addFields(
            {
              name: "🎯 Difficulty",
              value: aq.difficulty.toUpperCase(),
              inline: true,
            },
            {
              name: "⏰ Posted",
              value: `<t:${Math.floor(new Date(aq.postedAt).getTime() / 1000)}:R>`,
              inline: true,
            },
            {
              name: "🕐 Answer Reveals",
              value: "Today at 8:00 PM EST",
              inline: true,
            }
          )
          .setFooter({ text: "Discuss your answer below! 💭" });

        message.reply({ embeds: [embed] });
      } catch (error) {
        console.error("[TRIVIA] Error fetching current question:", error);
        message.reply("❌ Failed to fetch current trivia question.");
      }
    }

    // Stats command (Admin only)
    if (command === "!triviastats") {
      // Check if user has administrator permissions
      if (
        !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return message.reply(
          "You don't have permission to use this command. (Administrator only)"
        );
      }

      try {
        const convexClient = getConvexClient();
        const session = await convexClient.query(api.trivia.getSession, {
          guildId: guildId,
        });

        if (!session) {
          return message.reply("No trivia stats available yet!");
        }

        const hasActive =
          session.activeQuestion && !session.activeQuestion.answered;

        const embed = new EmbedBuilder()
          .setTitle("📊 Trivia Statistics")
          .setColor("#3498db")
          .addFields(
            {
              name: "🎮 Total Questions",
              value: (session.totalQuestions || 0).toString(),
              inline: true,
            },
            {
              name: "📝 Active Question",
              value: hasActive ? "Yes ✅" : "No ❌",
              inline: true,
            },
            {
              name: "⏰ Next Question",
              value: "Tomorrow at 10 AM EST",
              inline: true,
            }
          )
          .setFooter({
            text: "Daily trivia posts at 10 AM EST, answer revealed at 8 PM EST",
          })
          .setTimestamp();

        message.reply({ embeds: [embed] });
      } catch (error) {
        console.error("[TRIVIA] Error fetching stats:", error);
        message.reply("❌ Failed to fetch trivia stats.");
      }
    }
  });
};
