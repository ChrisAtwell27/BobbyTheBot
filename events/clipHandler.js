const fs = require("fs");
const path = require("path");
const cron = require("node-cron");

// Configuration - Update these values as needed
// TODO: These should be retrieved dynamically via getSetting
const CLIP_SUBMISSION_CHANNEL = "clip-submission"; // Channel name for submissions
const UPDATES_ROLE_ID = "701465164716703808"; // @Updates role ID
const WINNER_ROLE_ID = "831709147078066217"; // Role ID for clip winners
const VOTING_EMOJI = [
  "1️⃣",
  "2️⃣",
  "3️⃣",
  "4️⃣",
  "5️⃣",
  "6️⃣",
  "7️⃣",
  "8️⃣",
  "9️⃣",
  "🔟",
];

const submissionsFilePath = path.join(
  __dirname,
  "../data/clip_submissions.json"
);
const votingFilePath = path.join(__dirname, "../data/clip_voting.json");
const lastVotingFilePath = path.join(__dirname, "../data/last_voting_date.txt");

module.exports = (client) => {
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    // Only run in guilds
    if (!message.guild) return;

    // EARLY RETURN: Skip if not a clip command
    const content = message.content.toLowerCase();
    if (
      !content.startsWith("!submitclip") &&
      !content.startsWith("!clipstatus")
    )
      return;

    const args = message.content.split(" ");

    // Command to submit a clip
    if (args[0] === "!submitclip") {
      // Check if message has video attachment
      const videoAttachment = message.attachments.find(
        (attachment) =>
          attachment.contentType && attachment.contentType.startsWith("video/")
      );

      if (!videoAttachment) {
        return message.reply(
          "Please attach a video file with your clip submission!"
        );
      }

      // Check if user already submitted this period
      const submissions = getBiweeklySubmissions(message.guild.id);
      const userAlreadySubmitted = submissions.some(
        (sub) => sub.userId === message.author.id
      );

      if (userAlreadySubmitted) {
        return message.reply(
          "You have already submitted a clip this biweekly period! Wait until the next submission period to submit again."
        );
      }

      // Find the clip submission channel
      // Use configured channel name or fallback
      // Ideally use getSetting, but assuming strict channel name for now as per prior code
      const submissionChannel = message.guild.channels.cache.find(
        (channel) =>
          channel.name === CLIP_SUBMISSION_CHANNEL && channel.type === 0 // Text channel
      );

      if (!submissionChannel) {
        return message.reply(
          `Could not find #${CLIP_SUBMISSION_CHANNEL} channel.`
        );
      }

      // Add submission to biweekly list
      const submission = {
        userId: message.author.id,
        username: message.author.username,
        videoUrl: videoAttachment.url,
        submittedAt: new Date().toISOString(),
        description: args.slice(1).join(" ") || "No description provided",
        guildId: message.guild.id, // Add guildId
      };

      const allSubmissions = getAllSubmissions();
      allSubmissions.push(submission);
      saveAllSubmissions(allSubmissions);

      // Post in submission channel
      await submissionChannel.send({
        content: `📹 **New Clip Submission by ${message.author.username}**\n${submission.description}`,
        files: [videoAttachment.url],
      });

      return message.reply(
        "Your clip has been submitted successfully! Good luck in this biweekly voting! 🎬"
      );
    }

    // Command to check current submissions (optional admin command)
    if (args[0] === "!clipstatus") {
      const submissions = getBiweeklySubmissions(message.guild.id);
      if (submissions.length === 0) {
        return message.reply("No clips submitted this biweekly period yet.");
      }

      let statusMessage = `📊 **Biweekly Clip Submissions (${submissions.length})**\n\n`;
      submissions.forEach((sub, index) => {
        statusMessage += `${index + 1}. **${sub.username}** - ${sub.description}\n`;
      });

      return message.reply(statusMessage);
    }
  });

  // Check every Sunday at 9:00 AM if it's time for biweekly voting
  cron.schedule(
    "0 9 * * 0",
    async () => {
      if (shouldStartVoting()) {
        await startBiweeklyVoting(client);
      }
    },
    {
      timezone: "America/New_York",
    }
  );

  // Check every Sunday at 11:59 PM if voting should end
  cron.schedule(
    "59 23 * * 0",
    async () => {
      await endBiweeklyVoting(client);
    },
    {
      timezone: "America/New_York",
    }
  );

  // Function to check if it's time to start voting (every 2 weeks)
  function shouldStartVoting() {
    const lastVotingDate = getLastVotingDate();
    const now = new Date();

    if (!lastVotingDate) {
      // First time running, start voting
      return true;
    }

    const daysSinceLastVoting = Math.floor(
      (now - lastVotingDate) / (1000 * 60 * 60 * 24)
    );

    // Start voting if it's been 14 days or more since last voting
    return daysSinceLastVoting >= 14;
  }

  // Function to start the biweekly voting
  async function startBiweeklyVoting(client) {
    const allSubmissions = getAllSubmissions();

    if (allSubmissions.length === 0) {
      console.log("No submissions for this biweekly period.");
      return;
    }

    // Group by guildId
    const submissionsByGuild = {};
    for (const sub of allSubmissions) {
      const gid = sub.guildId || client.guilds.cache.first()?.id; // Fallback for legacy data
      if (!gid) continue;
      if (!submissionsByGuild[gid]) submissionsByGuild[gid] = [];
      submissionsByGuild[gid].push(sub);
    }

    const votingDataObj = getVotingData() || {};

    // Iterate guilds
    for (const guildId of Object.keys(submissionsByGuild)) {
      const submissions = submissionsByGuild[guildId];
      if (submissions.length === 0) continue;

      try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) continue;

        // Find the clip submission channel
        const submissionChannel = guild.channels.cache.find(
          (channel) =>
            channel.name === CLIP_SUBMISSION_CHANNEL && channel.type === 0
        );

        if (!submissionChannel) {
          console.log(
            `Could not find #${CLIP_SUBMISSION_CHANNEL} channel for voting in ${guild.name}.`
          );
          continue;
        }

        // Create voting message
        // Note: Role might not exist in all guilds, or might have different ID.
        // Should really use getSetting for role ID too.
        // Assuming global role ID only works for one server.
        // For other servers, we might just skip the role ping or try to find it.
        let votingMessage = `🗳️ **BIWEEKLY CLIP VOTING HAS STARTED!** 🗳️\n\n`;
        const updatesRole = guild.roles.cache.get(UPDATES_ROLE_ID);
        if (updatesRole) {
          votingMessage = `<@&${UPDATES_ROLE_ID}> ${votingMessage}`;
        }

        votingMessage += `Vote for your favorite clip by reacting below! Voting ends tonight at 11:59 PM.\n\n`;

        // Add each submission with emoji
        submissions.forEach((submission, index) => {
          if (index < VOTING_EMOJI.length) {
            votingMessage += `${VOTING_EMOJI[index]} **${submission.username}** - ${submission.description}\n`;
          }
        });

        votingMessage += `\n🎬 React with the corresponding emoji to vote!`;

        // Send voting message
        const votingPost = await submissionChannel.send(votingMessage);

        // Add reaction emojis
        for (
          let i = 0;
          i < Math.min(submissions.length, VOTING_EMOJI.length);
          i++
        ) {
          await votingPost.react(VOTING_EMOJI[i]);
        }

        // Save voting data for this guild
        votingDataObj[guildId] = {
          messageId: votingPost.id,
          channelId: submissionChannel.id,
          submissions: submissions,
          startedAt: new Date().toISOString(),
        };
      } catch (err) {
        console.error(`Error starting voting for guild ${guildId}:`, err);
      }
    }

    saveVotingData(votingDataObj);
    // Update last voting date (globally for cron timing)
    saveLastVotingDate(new Date());

    console.log("Biweekly clip voting started for active guilds!");
  }

  // Function to end the biweekly voting and determine winner
  async function endBiweeklyVoting(client) {
    const votingDataObj = getVotingData();

    if (!votingDataObj || Object.keys(votingDataObj).length === 0) {
      console.log("No active voting found.");
      return;
    }

    for (const guildId of Object.keys(votingDataObj)) {
      const votingData = votingDataObj[guildId];
      if (!votingData || !votingData.messageId) continue;

      try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) continue;

        const channel = guild.channels.cache.get(votingData.channelId);
        if (!channel) continue;

        const votingMessage = await channel.messages
          .fetch(votingData.messageId)
          .catch(() => null);
        if (!votingMessage) continue;

        // Count votes
        const voteCounts = [];
        for (
          let i = 0;
          i < Math.min(votingData.submissions.length, VOTING_EMOJI.length);
          i++
        ) {
          const reaction = votingMessage.reactions.cache.get(VOTING_EMOJI[i]);
          const count = reaction ? reaction.count - 1 : 0; // Subtract 1 for bot's own reaction
          voteCounts.push({
            submission: votingData.submissions[i],
            votes: count,
            emoji: VOTING_EMOJI[i],
          });
        }

        // Find winner (highest votes)
        if (voteCounts.length === 0) continue;

        const winner = voteCounts.reduce((prev, current) =>
          prev.votes > current.votes ? prev : current
        );

        // Award winner role
        // Again, role ID is hardcoded (likely specific to main server)
        // We check if role exists in this guild
        if (guild.roles.cache.has(WINNER_ROLE_ID)) {
          const winnerMember = guild.members.cache.get(
            winner.submission.userId
          );
          if (winnerMember) {
            await winnerMember.roles.add(WINNER_ROLE_ID);
          }
        }

        // Announce results
        let resultsMessage = `🏆 **BIWEEKLY CLIP VOTING RESULTS** 🏆\n\n`;
        resultsMessage += `🥇 **WINNER: ${winner.submission.username}** with ${winner.votes} votes!\n`;
        resultsMessage += `"${winner.submission.description}"\n\n`;
        resultsMessage += `**All Results:**\n`;

        voteCounts
          .sort((a, b) => b.votes - a.votes)
          .forEach((result, index) => {
            const medal =
              index === 0
                ? "🥇"
                : index === 1
                  ? "🥈"
                  : index === 2
                    ? "🥉"
                    : `${index + 1}.`;
            resultsMessage += `${medal} ${result.submission.username} - ${result.votes} votes\n`;
          });

        resultsMessage += `\n🎬 Congratulations to all participants! New submissions start now for the next biweekly period!`;

        await channel.send(resultsMessage);

        console.log(
          `Biweekly voting ended for guild ${guild.name}. Winner: ${winner.submission.username}`
        );
      } catch (error) {
        console.error(
          `Error ending biweekly voting for guild ${guildId}:`,
          error
        );
      }
    }

    // Reset for next biweekly period (clear all)
    clearBiweeklyData();
  }

  // Helper functions for data management
  function getAllSubmissions() {
    if (!fs.existsSync(submissionsFilePath)) {
      return [];
    }
    try {
      const data = fs.readFileSync(submissionsFilePath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  function getBiweeklySubmissions(guildId) {
    const all = getAllSubmissions();
    // Filter by guildId. Handle legacy entries (no guildId) by assigning them to first cached guild?
    // Or just filter matched.
    return all.filter((s) => s.guildId === guildId);
  }

  function saveAllSubmissions(submissions) {
    fs.writeFileSync(
      submissionsFilePath,
      JSON.stringify(submissions, null, 2),
      "utf-8"
    );
  }

  function getVotingData() {
    if (!fs.existsSync(votingFilePath)) {
      return null;
    }
    try {
      const data = fs.readFileSync(votingFilePath, "utf-8");
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  function saveVotingData(votingData) {
    fs.writeFileSync(
      votingFilePath,
      JSON.stringify(votingData, null, 2),
      "utf-8"
    );
  }

  function getLastVotingDate() {
    if (!fs.existsSync(lastVotingFilePath)) {
      return null;
    }
    try {
      const dateString = fs.readFileSync(lastVotingFilePath, "utf-8");
      return new Date(dateString);
    } catch (error) {
      return null;
    }
  }

  function saveLastVotingDate(date) {
    fs.writeFileSync(lastVotingFilePath, date.toISOString(), "utf-8");
  }

  function clearBiweeklyData() {
    // Clear submissions for next biweekly period
    if (fs.existsSync(submissionsFilePath)) {
      fs.unlinkSync(submissionsFilePath);
    }
    // Clear voting data
    if (fs.existsSync(votingFilePath)) {
      fs.unlinkSync(votingFilePath);
    }
    // Don't clear last voting date - we need it for biweekly timing
  }
};
