const { EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { LimitedMap } = require('../utils/memoryUtils');

/**
 * Changelog Handler - Posts GitHub commit information to a designated changelog channel
 *
 * This handler periodically checks the GitHub repository for new commits and posts
 * formatted embeds to the changelog channel. Uses memory-efficient caching to prevent
 * duplicate posts.
 *
 * @param {Client} client - Discord.js client instance
 * @param {string} changelogChannelId - Discord channel ID where commits should be posted
 *
 * Environment Variables Required:
 * - GITHUB_TOKEN (optional): GitHub Personal Access Token for higher rate limits
 *   Without token: 60 requests/hour
 *   With token: 5000 requests/hour
 *   Create at: https://github.com/settings/tokens (needs 'repo' scope for private repos)
 */
module.exports = (client, changelogChannelId) => {
  console.log('[Changelog Handler] Initializing...');

  // Cache to track posted commits (stores up to 100 commit SHAs)
  const postedCommits = new LimitedMap(100);

  // Configuration
  const GITHUB_OWNER = 'ChrisAtwell27';
  const GITHUB_REPO = 'BobbyTheBot';
  const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
  const MAX_COMMITS_PER_CHECK = 5; // Limit commits posted per interval

  // GitHub API configuration
  const githubApiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits`;
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'BobbyTheBot-Changelog'
  };

  // Add authentication token if available
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    console.log('[Changelog Handler] Using authenticated GitHub API requests');
  } else {
    console.log('[Changelog Handler] Using unauthenticated GitHub API requests (limited to 60/hour)');
  }

  /**
   * Fetches recent commits from GitHub
   * @returns {Promise<Array>} Array of commit objects
   */
  async function fetchCommits() {
    try {
      const response = await axios.get(githubApiUrl, {
        headers,
        params: {
          per_page: MAX_COMMITS_PER_CHECK,
          page: 1
        }
      });

      return response.data;
    } catch (error) {
      if (error.response?.status === 403) {
        console.error('[Changelog Handler] GitHub API rate limit exceeded');
      } else if (error.response?.status === 401) {
        console.error('[Changelog Handler] GitHub authentication failed - check GITHUB_TOKEN');
      } else {
        console.error('[Changelog Handler] Error fetching commits:', error.message);
      }
      return [];
    }
  }

  /**
   * Fetches detailed commit information including file changes
   * @param {string} sha - Commit SHA to fetch
   * @returns {Promise<Object|null>} Detailed commit object with files and stats
   */
  async function fetchCommitDetails(sha) {
    try {
      const response = await axios.get(`${githubApiUrl}/${sha}`, {
        headers
      });

      return response.data;
    } catch (error) {
      console.error(`[Changelog Handler] Error fetching commit details for ${sha}:`, error.message);
      return null;
    }
  }

  /**
   * Creates a formatted embed for a commit
   * @param {Object} commit - GitHub commit object
   * @returns {EmbedBuilder} Formatted Discord embed
   */
  function createCommitEmbed(commit) {
    const commitMessage = commit.commit.message;
    const commitTitle = commitMessage.split('\n')[0]; // First line as title
    const commitBody = commitMessage.split('\n').slice(1).join('\n').trim(); // Rest as description

    const author = commit.commit.author.name;
    const sha = commit.sha.substring(0, 7); // Short SHA
    const commitUrl = commit.html_url;
    const timestamp = new Date(commit.commit.author.date);

    // Calculate files changed statistics
    const filesChanged = commit.files?.length || 0;
    const additions = commit.stats?.additions || 0;
    const deletions = commit.stats?.deletions || 0;

    const embed = new EmbedBuilder()
      .setColor(0x238636) // GitHub green
      .setTitle(`📝 ${commitTitle}`)
      .setURL(commitUrl)
      .setAuthor({
        name: `${author}`,
        iconURL: commit.author?.avatar_url || commit.committer?.avatar_url
      })
      .setTimestamp(timestamp)
      .setFooter({ text: `Commit ${sha}` });

    // Add commit body if it exists
    if (commitBody) {
      embed.setDescription(commitBody.length > 300
        ? commitBody.substring(0, 297) + '...'
        : commitBody
      );
    }

    // Add statistics field
    const statsText = `${filesChanged} file${filesChanged !== 1 ? 's' : ''} changed`;
    const changesText = additions > 0 || deletions > 0
      ? ` (+${additions} -${deletions})`
      : '';

    embed.addFields({
      name: '📊 Changes',
      value: `${statsText}${changesText}`,
      inline: true
    });

    return embed;
  }

  /**
   * Posts a commit to the changelog channel
   * @param {Object} commit - GitHub commit object
   */
  async function postCommit(commit) {
    try {
      const channel = client.channels.cache.get(changelogChannelId);

      if (!channel) {
        console.error('[Changelog Handler] Changelog channel not found:', changelogChannelId);
        return;
      }

      // Fetch detailed commit info to get file changes and stats
      const detailedCommit = await fetchCommitDetails(commit.sha);
      if (!detailedCommit) {
        console.error(`[Changelog Handler] Could not fetch details for commit ${commit.sha.substring(0, 7)}`);
        return;
      }

      const embed = createCommitEmbed(detailedCommit);
      await channel.send({ embeds: [embed] });

      // Mark as posted
      postedCommits.set(commit.sha, Date.now());
      console.log(`[Changelog Handler] Posted commit: ${commit.sha.substring(0, 7)} - ${commit.commit.message.split('\n')[0]}`);
    } catch (error) {
      console.error('[Changelog Handler] Error posting commit:', error.message);
    }
  }

  /**
   * Checks for new commits and posts them
   */
  async function checkForNewCommits() {
    try {
      const commits = await fetchCommits();

      if (commits.length === 0) {
        return;
      }

      // Process commits in reverse order (oldest first)
      const newCommits = commits
        .reverse()
        .filter(commit => !postedCommits.has(commit.sha));

      if (newCommits.length > 0) {
        console.log(`[Changelog Handler] Found ${newCommits.length} new commit(s)`);

        // Post commits with a small delay between each
        for (const commit of newCommits) {
          await postCommit(commit);
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error('[Changelog Handler] Error in check cycle:', error.message);
    }
  }

  // Initial check when bot starts
  client.once('ready', async () => {
    console.log('[Changelog Handler] Bot ready, performing initial commit check...');

    // Fetch initial commits to populate cache (don't post these)
    const initialCommits = await fetchCommits();
    initialCommits.forEach(commit => {
      postedCommits.set(commit.sha, Date.now());
    });

    console.log(`[Changelog Handler] Initialized with ${initialCommits.length} recent commits cached`);
    console.log(`[Changelog Handler] Now monitoring for new commits every ${CHECK_INTERVAL / 60000} minutes`);
  });

  // Start periodic checking
  setInterval(checkForNewCommits, CHECK_INTERVAL);

  console.log('[Changelog Handler] Registered successfully');
};