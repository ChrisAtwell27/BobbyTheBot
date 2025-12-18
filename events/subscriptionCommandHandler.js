const { EmbedBuilder } = require('discord.js');
const { normalizeTier, TIERS, getSubscription, clearSubscriptionCache } = require('../utils/subscriptionUtils');

/**
 * Subscription Command Handler
 * Handles the !subscription command to display subscription tier information
 */

module.exports = (client) => {
  console.log('💳 Subscription Command Handler initialized');

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const content = message.content.toLowerCase().trim();

    // Handle !setupbobby command (free tier)
    if (content === '!setupbobby' || content === '!setup') {
      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('⚙️ Setup Bobby The Bot')
        .setDescription('Configure Bobby for your server through our web dashboard!')
        .addFields(
          {
            name: '🔗 Setup Link',
            value: '**[crackedgames.co/bobby-the-bot](https://crackedgames.co/bobby-the-bot)**',
            inline: false
          },
          {
            name: '📋 What You Can Configure',
            value: [
              '• Set custom bot prefix',
              '• Configure moderation settings',
              '• Manage feature toggles',
              '• Set up role permissions',
              '• Configure channel restrictions',
              '• And much more!'
            ].join('\n'),
            inline: false
          },
          {
            name: '💡 Tip',
            value: 'Make sure you\'re logged in with the Discord account that owns this server to access all settings.',
            inline: false
          }
        )
        .setFooter({ text: 'Use !subscription to check your current tier' })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
      return;
    }

    // Check if message is !subscription command
    if (!content.startsWith('!subscription') && !content.startsWith('!sub') && !content.startsWith('!tier')) {
      return;
    }

    try {
      const guildId = message.guild.id;
      const args = content.split(/\s+/).slice(1);

      // Debug command to test API connection
      if (args[0] === 'debug') {
        const apiSecret = process.env.SUBSCRIPTION_API_SECRET;
        const websiteUrl = process.env.WEBSITE_URL || 'https://crackedgames.co';

        let debugInfo = `**API Debug Info**\n`;
        debugInfo += `API Secret Set: ${apiSecret ? '✅ Yes' : '❌ No'}\n`;
        debugInfo += `Website URL: ${websiteUrl}\n`;
        debugInfo += `Guild ID: ${guildId}\n\n`;

        if (apiSecret) {
          try {
            const response = await fetch(`${websiteUrl}/api/subscription/guild/${guildId}`, {
              method: 'GET',
              headers: {
                'X-API-Key': apiSecret,
                'Content-Type': 'application/json'
              }
            });
            debugInfo += `API Status: ${response.status} ${response.statusText}\n`;
            const data = await response.json();
            debugInfo += `Response: \`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
          } catch (fetchError) {
            debugInfo += `Fetch Error: ${fetchError.message}`;
          }
        } else {
          debugInfo += `⚠️ Set SUBSCRIPTION_API_SECRET in your .env file`;
        }

        await message.reply(debugInfo);
        return;
      }

      // Check for refresh argument to clear cache
      const forceRefresh = args[0] === 'refresh' || args[0] === 'reload';
      if (forceRefresh) {
        clearSubscriptionCache(guildId);
      }

      // Get subscription from website API (single source of truth)
      const subscription = await getSubscription(guildId, null, forceRefresh);

      // Tier information
      const tierEmojis = {
        [TIERS.FREE]: '🆓',
        [TIERS.PLUS]: '⭐',
        [TIERS.ULTIMATE]: '👑'
      };

      const tierNames = {
        [TIERS.FREE]: 'Free',
        [TIERS.PLUS]: 'Plus',
        [TIERS.ULTIMATE]: 'Ultimate'
      };

      const tierColors = {
        [TIERS.FREE]: 0x95A5A6,      // Gray
        [TIERS.PLUS]: 0x3498DB,      // Blue
        [TIERS.ULTIMATE]: 0x9B59B6   // Purple
      };

      const tierDescriptions = {
        [TIERS.FREE]: 'Basic features including Economy, Casino, and more!',
        [TIERS.PLUS]: 'Blackjack, PvP Games, Valorant Teams, Bee Mafia, AI Chat & Activity Tracking',
        [TIERS.ULTIMATE]: 'Everything in Plus + Valorant API Stats, 65+ Mafia Roles & Priority Support'
      };

      // Get tier from website API - the single source of truth
      const currentTier = normalizeTier(subscription?.tier || 'free');
      const status = subscription?.status || 'active';

      // Create embed
      const embedColor = tierColors[currentTier];
      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`${tierEmojis[currentTier]} Server Subscription Status`)
        .setDescription(`**${message.guild.name}** is currently on the **${tierNames[currentTier]}** tier.`);

      embed.addFields(
        {
          name: '📊 Current Tier',
          value: `${tierEmojis[currentTier]} **${tierNames[currentTier]}**`,
          inline: true
        }
      );

      // Add tier benefits
      embed.addFields({
        name: '🎁 Tier Benefits',
        value: tierDescriptions[currentTier],
        inline: false
      });

      // Add upgrade information if not on highest tier
      if (currentTier !== TIERS.ULTIMATE) {
        const nextTier = currentTier === TIERS.FREE ? TIERS.PLUS : TIERS.ULTIMATE;
        const upgradePrice = nextTier === TIERS.PLUS ? '$4.99/mo' : '$9.99/mo';

        embed.addFields({
          name: '⬆️ Upgrade Available',
          value: `Upgrade to **${tierEmojis[nextTier]} ${tierNames[nextTier]}** (${upgradePrice}) for more features!\n\nVisit [crackedgames.co/bobby-the-bot](https://crackedgames.co/bobby-the-bot/) to upgrade.`,
          inline: false
        });
      }

      // Add footer
      embed.setFooter({
        text: forceRefresh
          ? '🔄 Refreshed from server | Use !settings for bot configuration'
          : 'Use !subscription refresh to update | !settings for bot configuration'
      });
      embed.setTimestamp();

      await message.channel.send({ embeds: [embed] });

    } catch (error) {
      console.error('Error in subscription command:', error);
      await message.reply('❌ An error occurred while fetching subscription information. Please try again.').catch(console.error);
    }
  });
};
