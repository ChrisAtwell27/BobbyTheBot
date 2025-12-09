const { EmbedBuilder } = require('discord.js');
const { getSubscription, normalizeTier, TIERS } = require('../utils/subscriptionUtils');
const { getConvexClient } = require('../utils/convexClient');
const { api } = require('../convex/_generated/api');

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
      const ownerId = message.guild.ownerId;

      // Get Convex client and query guild-specific subscription
      const convex = getConvexClient();
      const ownerSubscription = await convex.query(api.subscriptions.getSubscription, {
        discordId: ownerId
      });

      // Find this guild's subscription data
      const guildSubscription = ownerSubscription?.verifiedGuilds?.find(g => g.guildId === guildId);

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
        [TIERS.ULTIMATE]: 'Everything in Plus + Audit Logs, Auto-Moderation, Custom Prefix, API Access & Priority Support'
      };

      // Determine current tier and status
      let currentTier = TIERS.FREE;
      let status = 'active';
      let expiresAt = null;

      if (guildSubscription) {
        currentTier = normalizeTier(guildSubscription.tier || 'free');
        status = guildSubscription.status || 'active';
        expiresAt = guildSubscription.expiresAt;
      }

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
        },
        {
          name: '✅ Status',
          value: status === 'active' ? 'Active' : 'Inactive',
          inline: true
        }
      );

      // Add expiration info for paid subscriptions
      if (status === 'active' && expiresAt) {
        const expirationDate = new Date(expiresAt);
        const now = Date.now();

        if (expirationDate > now) {
          const daysUntilExpiry = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));
          embed.addFields({
            name: '📅 Subscription Expires',
            value: `<t:${Math.floor(expirationDate.getTime() / 1000)}:R> (${daysUntilExpiry} days)`,
            inline: true
          });
        }
      }

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
        text: 'Use !settings for bot configuration | Subscriptions help keep Bobby running!'
      });
      embed.setTimestamp();

      await message.channel.send({ embeds: [embed] });

    } catch (error) {
      console.error('Error in subscription command:', error);
      await message.reply('❌ An error occurred while fetching subscription information. Please try again.').catch(console.error);
    }
  });
};
