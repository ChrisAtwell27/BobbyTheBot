const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { TARGET_GUILD_ID } = require('../config/guildConfig');

// Configuration - Update these values as needed
const CLIP_SUBMISSION_CHANNEL = 'clip-submission'; // Channel name for submissions
const UPDATES_ROLE_ID = '701465164716703808'; // @Updates role ID
const WINNER_ROLE_ID = '831709147078066217'; // Role ID for clip winners
const VOTING_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

const submissionsFilePath = path.join(__dirname, '../data/clip_submissions.json');
const votingFilePath = path.join(__dirname, '../data/clip_voting.json');
const lastVotingFilePath = path.join(__dirname, '../data/last_voting_date.txt');

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // Only run in target guild
        if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

        const args = message.content.split(' ');

        // Command to submit a clip
        if (args[0] === '!submitclip') {
            // Check if message has video attachment
            const videoAttachment = message.attachments.find(attachment => 
                attachment.contentType && attachment.contentType.startsWith('video/')
            );

            if (!videoAttachment) {
                return message.reply('Please attach a video file with your clip submission!');
            }

            // Check if user already submitted this period
            const submissions = getBiweeklySubmissions();
            const userAlreadySubmitted = submissions.some(sub => sub.userId === message.author.id);

            if (userAlreadySubmitted) {
                return message.reply('You have already submitted a clip this biweekly period! Wait until the next submission period to submit again.');
            }

            // Find the clip submission channel
            const submissionChannel = message.guild.channels.cache.find(
                channel => channel.name === CLIP_SUBMISSION_CHANNEL && channel.type === 0 // Text channel
            );

            if (!submissionChannel) {
                return message.reply(`Could not find #${CLIP_SUBMISSION_CHANNEL} channel.`);
            }

            // Add submission to biweekly list
            const submission = {
                userId: message.author.id,
                username: message.author.username,
                videoUrl: videoAttachment.url,
                submittedAt: new Date().toISOString(),
                description: args.slice(1).join(' ') || 'No description provided'
            };

            submissions.push(submission);
            saveBiweeklySubmissions(submissions);

            // Post in submission channel
            await submissionChannel.send({
                content: `📹 **New Clip Submission by ${message.author.username}**\n${submission.description}`,
                files: [videoAttachment.url]
            });

            return message.reply('Your clip has been submitted successfully! Good luck in this biweekly voting! 🎬');
        }

        // Command to check current submissions (optional admin command)
        if (args[0] === '!clipstatus') {
            const submissions = getBiweeklySubmissions();
            if (submissions.length === 0) {
                return message.reply('No clips submitted this biweekly period yet.');
            }

            let statusMessage = `📊 **Biweekly Clip Submissions (${submissions.length})**\n\n`;
            submissions.forEach((sub, index) => {
                statusMessage += `${index + 1}. **${sub.username}** - ${sub.description}\n`;
            });

            return message.reply(statusMessage);
        }
    });

    // Check every Sunday at 9:00 AM if it's time for biweekly voting
    cron.schedule('0 9 * * 0', async () => {
        if (shouldStartVoting()) {
            await startBiweeklyVoting(client);
        }
    }, {
        timezone: "America/New_York" // Adjust timezone as needed
    });

    // Check every Sunday at 11:59 PM if voting should end
    cron.schedule('59 23 * * 0', async () => {
        const votingData = getVotingData();
        if (votingData && votingData.messageId) {
            await endBiweeklyVoting(client);
        }
    }, {
        timezone: "America/New_York" // Adjust timezone as needed
    });

    // Function to check if it's time to start voting (every 2 weeks)
    function shouldStartVoting() {
        const lastVotingDate = getLastVotingDate();
        const now = new Date();
        
        if (!lastVotingDate) {
            // First time running, start voting
            return true;
        }

        const daysSinceLastVoting = Math.floor((now - lastVotingDate) / (1000 * 60 * 60 * 24));
        
        // Start voting if it's been 14 days or more since last voting
        return daysSinceLastVoting >= 14;
    }

    // Function to start the biweekly voting
    async function startBiweeklyVoting(client) {
        const submissions = getBiweeklySubmissions();

        if (submissions.length === 0) {
            console.log('No submissions for this biweekly period, skipping voting.');
            return;
        }

        // Find the clip submission channel
        const guild = client.guilds.cache.first(); // Assumes single server, adjust if needed
        const submissionChannel = guild.channels.cache.find(
            channel => channel.name === CLIP_SUBMISSION_CHANNEL && channel.type === 0
        );

        if (!submissionChannel) {
            console.log(`Could not find #${CLIP_SUBMISSION_CHANNEL} channel for voting.`);
            return;
        }

        // Create voting message
        let votingMessage = `<@&${UPDATES_ROLE_ID}> 🗳️ **BIWEEKLY CLIP VOTING HAS STARTED!** 🗳️\n\n`;
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
        for (let i = 0; i < Math.min(submissions.length, VOTING_EMOJI.length); i++) {
            await votingPost.react(VOTING_EMOJI[i]);
        }

        // Save voting data
        const votingData = {
            messageId: votingPost.id,
            channelId: submissionChannel.id,
            submissions: submissions,
            startedAt: new Date().toISOString()
        };
        saveVotingData(votingData);

        // Update last voting date
        saveLastVotingDate(new Date());

        console.log('Biweekly clip voting started!');
    }

    // Function to end the biweekly voting and determine winner
    async function endBiweeklyVoting(client) {
        const votingData = getVotingData();

        if (!votingData || !votingData.messageId) {
            console.log('No active voting found.');
            return;
        }

        try {
            const guild = client.guilds.cache.first();
            const channel = guild.channels.cache.get(votingData.channelId);
            const votingMessage = await channel.messages.fetch(votingData.messageId);

            // Count votes
            const voteCounts = [];
            for (let i = 0; i < Math.min(votingData.submissions.length, VOTING_EMOJI.length); i++) {
                const reaction = votingMessage.reactions.cache.get(VOTING_EMOJI[i]);
                const count = reaction ? reaction.count - 1 : 0; // Subtract 1 for bot's own reaction
                voteCounts.push({
                    submission: votingData.submissions[i],
                    votes: count,
                    emoji: VOTING_EMOJI[i]
                });
            }

            // Find winner (highest votes)
            const winner = voteCounts.reduce((prev, current) => 
                (prev.votes > current.votes) ? prev : current
            );

            // Award winner role
            const winnerMember = guild.members.cache.get(winner.submission.userId);
            if (winnerMember) {
                await winnerMember.roles.add(WINNER_ROLE_ID);
            }

            // Announce results
            let resultsMessage = `🏆 **BIWEEKLY CLIP VOTING RESULTS** 🏆\n\n`;
            resultsMessage += `🥇 **WINNER: ${winner.submission.username}** with ${winner.votes} votes!\n`;
            resultsMessage += `"${winner.submission.description}"\n\n`;
            resultsMessage += `**All Results:**\n`;
            
            voteCounts
                .sort((a, b) => b.votes - a.votes)
                .forEach((result, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                    resultsMessage += `${medal} ${result.submission.username} - ${result.votes} votes\n`;
                });

            resultsMessage += `\n🎬 Congratulations to all participants! New submissions start now for the next biweekly period!`;

            await channel.send(resultsMessage);

            // Reset for next biweekly period
            clearBiweeklyData();

            console.log(`Biweekly voting ended. Winner: ${winner.submission.username}`);

        } catch (error) {
            console.error('Error ending biweekly voting:', error);
        }
    }

    // Helper functions for data management
    function getBiweeklySubmissions() {
        if (!fs.existsSync(submissionsFilePath)) {
            return [];
        }
        try {
            const data = fs.readFileSync(submissionsFilePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            return [];
        }
    }

    function saveBiweeklySubmissions(submissions) {
        fs.writeFileSync(submissionsFilePath, JSON.stringify(submissions, null, 2), 'utf-8');
    }

    function getVotingData() {
        if (!fs.existsSync(votingFilePath)) {
            return null;
        }
        try {
            const data = fs.readFileSync(votingFilePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            return null;
        }
    }

    function saveVotingData(votingData) {
        fs.writeFileSync(votingFilePath, JSON.stringify(votingData, null, 2), 'utf-8');
    }

    function getLastVotingDate() {
        if (!fs.existsSync(lastVotingFilePath)) {
            return null;
        }
        try {
            const dateString = fs.readFileSync(lastVotingFilePath, 'utf-8');
            return new Date(dateString);
        } catch (error) {
            return null;
        }
    }

    function saveLastVotingDate(date) {
        fs.writeFileSync(lastVotingFilePath, date.toISOString(), 'utf-8');
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