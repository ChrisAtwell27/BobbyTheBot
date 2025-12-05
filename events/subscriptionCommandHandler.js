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

    // Check if message is !subscription command
    const content = message.content.toLowerCase();
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
        [TIERS.ULTIMATE]: 0x9B59B6,   // Purple
        trial: 0xF39C12               // Orange for trial
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
      let trialEndsAt = null;
      let isOnTrial = false;

      if (guildSubscription) {
        currentTier = normalizeTier(guildSubscription.tier || 'free');
        status = guildSubscription.status || 'active';
        expiresAt = guildSubscription.expiresAt;
        trialEndsAt = guildSubscription.trialEndsAt;
        isOnTrial = status === 'trial';

        // Check if trial has expired
        if (isOnTrial && trialEndsAt && Date.now() > trialEndsAt) {
          status = 'expired';
          isOnTrial = false;
        }
      }

      // Create embed
      const embedColor = isOnTrial ? tierColors.trial : tierColors[currentTier];
      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`${isOnTrial ? '🎁' : tierEmojis[currentTier]} Server Subscription Status`)
        .setDescription(`**${message.guild.name}** is currently ${isOnTrial ? 'on a **7-day trial**' : `on the **${tierNames[currentTier]}** tier`}.`);

      // Show trial information prominently
      if (isOnTrial && trialEndsAt) {
        const trialEndDate = new Date(trialEndsAt);
        const now = Date.now();
        const daysRemaining = Math.ceil((trialEndDate - now) / (1000 * 60 * 60 * 24));

        embed.addFields({
          name: '🎁 Trial Status',
          value: `You have **${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}** remaining in your trial!\nTrial ends <t:${Math.floor(trialEndDate.getTime() / 1000)}:R>`,
          inline: false
        });
      }

      embed.addFields(
        {
          name: '📊 Current Tier',
          value: `${tierEmojis[currentTier]} **${tierNames[currentTier]}**`,
          inline: true
        },
        {
          name: '✅ Status',
          value: isOnTrial ? '🎁 Trial Active' : (status === 'active' ? 'Active' : 'Inactive'),
          inline: true
        }
      );

      // Add expiration info for paid subscriptions
      if (status === 'active' && !isOnTrial && expiresAt) {
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
