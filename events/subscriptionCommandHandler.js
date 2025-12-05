const { EmbedBuilder } = require('discord.js');
const { getSubscription, normalizeTier, TIERS } = require('../utils/subscriptionUtils');

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
      const subscription = await getSubscription(guildId);

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

      // Determine current tier
      let currentTier = TIERS.FREE;
      let isActive = false;
      let expiresAt = null;

      if (subscription && subscription.status === 'active') {
        currentTier = normalizeTier(subscription.tier);
        isActive = true;
        expiresAt = subscription.expiresAt;
      }

      // Create embed
      const embed = new EmbedBuilder()
        .setColor(tierColors[currentTier])
        .setTitle(`${tierEmojis[currentTier]} Server Subscription Status`)
        .setDescription(`**${message.guild.name}** is currently on the **${tierNames[currentTier]}** tier.`)
        .addFields(
          {
            name: '📊 Current Tier',
            value: `${tierEmojis[currentTier]} **${tierNames[currentTier]}**`,
            inline: true
          },
          {
            name: '✅ Status',
            value: isActive ? 'Active' : 'Inactive',
            inline: true
          }
        );

      // Add expiration info if applicable
      if (isActive && expiresAt) {
        const expirationDate = new Date(expiresAt);
        const now = new Date();

        if (expirationDate > now) {
          const daysUntilExpiry = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));
          embed.addFields({
            name: '📅 Expires',
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
