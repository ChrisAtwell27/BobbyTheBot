const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { TARGET_GUILD_ID } = require('../config/guildConfig');

// Instagram Graph API configuration
// Get these from: https://developers.facebook.com/apps/
const INSTAGRAM_CONFIG = {
  accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
  instagramBusinessAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
  apiVersion: 'v21.0'
};

// Validate configuration on startup
if (!INSTAGRAM_CONFIG.accessToken || !INSTAGRAM_CONFIG.instagramBusinessAccountId) {
  console.warn('⚠️ Instagram credentials not configured. Social media posting disabled.');
  console.warn('Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID in .env to enable.');
}

const MONITORED_CHANNEL_ID = '1408581411933519944';

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    // Ignore bot messages and only monitor specific channel
    if (message.author.bot || message.channelId !== MONITORED_CHANNEL_ID) return;

    // Only run in target guild
    if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

    try {
      // Check if message has attachments (images)
      if (message.attachments.size > 0) {
        const attachment = message.attachments.first();

        // Only process image attachments
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
          const caption = message.content || ''; // Use message content as caption

          try {
            await postToInstagram(attachment.url, caption);

            // React to confirm post was successful
            await message.react('✅');
            console.log(`[SOCIAL MEDIA] Successfully posted to Instagram from message ${message.id}`);
          } catch (instagramError) {
            console.error('[SOCIAL MEDIA] Instagram API error:', instagramError.message);
            await message.react('❌').catch(() => {});

            // Send user-friendly error message
            await message.reply('Failed to post to Instagram. Please check the image format and try again.').catch(() => {});
          }
        }
      }
      // Handle text-only posts (if you want to support them)
      else if (message.content && message.content.trim().length > 0) {
        console.log(`[SOCIAL MEDIA] Text-only message detected in monitored channel. Instagram requires media for posts.`);
        await message.react('⚠️').catch(() => {});
      }
    } catch (error) {
      console.error('[SOCIAL MEDIA] Error in social media post handler:', error);
      await message.react('❌').catch(() => {});
    }
  });
};

/**
 * Posts an image to Instagram using the Graph API
 * @param {string} imageUrl - URL of the image to post
 * @param {string} caption - Caption for the Instagram post
 */
async function postToInstagram(imageUrl, caption) {
  const { accessToken, instagramBusinessAccountId, apiVersion } = INSTAGRAM_CONFIG;

  // Validate configuration
  if (!accessToken) {
    throw new Error('Instagram access token not configured. Set INSTAGRAM_ACCESS_TOKEN in .env file.');
  }
  if (!instagramBusinessAccountId) {
    throw new Error('Instagram Business Account ID not configured. Set INSTAGRAM_BUSINESS_ACCOUNT_ID in .env file.');
  }

  try {
    // Step 1: Create a media container
    const containerResponse = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${instagramBusinessAccountId}/media`,
      {
        image_url: imageUrl,
        caption: caption,
        access_token: accessToken
      }
    );

    const creationId = containerResponse.data.id;
    console.log(`Media container created: ${creationId}`);

    // Step 2: Wait for media to be processed (usually takes a few seconds)
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 3: Publish the media container
    const publishResponse = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${instagramBusinessAccountId}/media_publish`,
      {
        creation_id: creationId,
        access_token: accessToken
      }
    );

    const postId = publishResponse.data.id;
    console.log(`Successfully posted to Instagram! Post ID: ${postId}`);

    return postId;
  } catch (error) {
    if (error.response) {
      console.error('Instagram API Error:', error.response.data);
      throw new Error(`Instagram API Error: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}
