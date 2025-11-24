# Bot Permission Checking Guide

This guide explains how to check user subscription tiers in your Discord bot to gate features.

## Flow Overview

```
User runs command → Bot checks subscription tier → Grant or deny access
```

## 1. Check User Subscription in Bot

In your Discord bot, before executing premium commands:

```javascript
// Example: Premium command handler
async function handlePremiumCommand(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  // Check subscription tier
  const subscription = await checkSubscription(guildId);

  if (!hasFeatureAccess(subscription.tier, 'premium_feature')) {
    return interaction.reply({
      content: '⚠️ This feature requires a Premium subscription.\nUpgrade at: https://crackedgames.com/bobby-the-bot',
      ephemeral: true
    });
  }

  // Execute premium feature
  await executePremiumFeature(interaction);
}
```

## 2. Helper Functions

### Check Subscription from Database

```javascript
async function checkSubscription(guildId) {
  try {
    // Query your MongoDB subscription collection
    const subscription = await Subscription.findOne({
      'verifiedGuilds.guildId': guildId,
      status: 'active'
    });

    if (!subscription) {
      return { tier: 'free', status: 'none' };
    }

    // Check if subscription is expired
    if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
      return { tier: 'free', status: 'expired' };
    }

    return {
      tier: subscription.tier,
      status: subscription.status,
      features: subscription.features
    };
  } catch (error) {
    console.error('Failed to check subscription:', error);
    return { tier: 'free', status: 'error' };
  }
}
```

### Check Feature Access

```javascript
// Define tier features
const TIER_FEATURES = {
  free: ['basic_commands'],
  basic: ['basic_commands', 'custom_prefix', 'priority_support'],
  premium: [
    'basic_commands',
    'custom_prefix',
    'priority_support',
    'advanced_analytics',
    'custom_embeds',
    'unlimited_servers'
  ],
  enterprise: [
    'basic_commands',
    'custom_prefix',
    'priority_support',
    'advanced_analytics',
    'custom_embeds',
    'unlimited_servers',
    'api_access',
    'white_label',
    'dedicated_support'
  ]
};

function hasFeatureAccess(tier, feature) {
  const features = TIER_FEATURES[tier] || TIER_FEATURES.free;
  return features.includes(feature);
}
```

## 3. Caching Subscriptions (Recommended)

To avoid database queries on every command, cache subscriptions:

```javascript
// Simple in-memory cache
const subscriptionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedSubscription(guildId) {
  const cached = subscriptionCache.get(guildId);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const subscription = await checkSubscription(guildId);
  subscriptionCache.set(guildId, {
    data: subscription,
    timestamp: Date.now()
  });

  return subscription;
}

// Clear cache when subscription is updated
function invalidateSubscriptionCache(guildId) {
  subscriptionCache.delete(guildId);
}
```

## 4. Example Command Implementations

### Basic Command (Free Tier)

```javascript
// Available to all users
client.on('interactionCreate', async (interaction) => {
  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!');
  }
});
```

### Premium Command (Requires Premium+)

```javascript
client.on('interactionCreate', async (interaction) => {
  if (interaction.commandName === 'analytics') {
    const subscription = await getCachedSubscription(interaction.guildId);

    if (!hasFeatureAccess(subscription.tier, 'advanced_analytics')) {
      return interaction.reply({
        embeds: [{
          color: 0xFFA500,
          title: '⚠️ Premium Feature',
          description: 'Advanced analytics requires a **Premium** subscription or higher.',
          fields: [{
            name: 'Upgrade Now',
            value: '[Visit our website](https://crackedgames.com/bobby-the-bot)'
          }]
        }],
        ephemeral: true
      });
    }

    // Show analytics
    await showAdvancedAnalytics(interaction);
  }
});
```

### Server Limit Check (Enterprise)

```javascript
client.on('guildCreate', async (guild) => {
  // Bot was added to a new server
  const ownerId = guild.ownerId;

  // Check how many servers this user has the bot in
  const userGuilds = client.guilds.cache.filter(g => g.ownerId === ownerId);

  const subscription = await checkSubscriptionByDiscordId(ownerId);

  // Check server limits
  const serverLimits = {
    free: 1,
    basic: 3,
    premium: Infinity, // unlimited
    enterprise: Infinity
  };

  const limit = serverLimits[subscription.tier];

  if (userGuilds.size > limit) {
    // Send message to owner
    const owner = await client.users.fetch(ownerId);
    await owner.send({
      embeds: [{
        color: 0xFF0000,
        title: '❌ Server Limit Reached',
        description: `You've reached your server limit (${limit}) for the **${subscription.tier}** tier.`,
        fields: [{
          name: 'Upgrade to add more servers',
          value: '[Visit our website](https://crackedgames.com/bobby-the-bot)'
        }]
      }]
    });

    // Leave the guild
    await guild.leave();
  }
});
```

## 5. Webhook Handler (Update Cache)

When your subscription API receives an update from the website's webhook:

```javascript
// In your subscription API
app.post('/api/subscription', async (req, res) => {
  const { discordId, tier, status } = req.body;

  // Update database
  await updateSubscription(discordId, { tier, status });

  // Notify bot to clear cache (if using Redis/pub-sub)
  await redisClient.publish('subscription-update', JSON.stringify({
    discordId,
    action: 'invalidate-cache'
  }));

  res.json({ success: true });
});
```

## 6. Environment Variables

Add to your bot's `.env`:

```bash
# MongoDB connection (if not already set)
MONGODB_URI=mongodb://localhost:27017/bobby-bot

# Feature flags
ENABLE_PREMIUM_FEATURES=true
```

## 7. Testing

### Test with Mock Data

```javascript
// For testing, you can override the subscription check
if (process.env.NODE_ENV === 'development') {
  // Force premium tier for testing
  async function checkSubscription(guildId) {
    return {
      tier: 'premium',
      status: 'active',
      features: TIER_FEATURES.premium
    };
  }
}
```

## Summary

1. **Website**: User purchases → Stripe webhook → Bot API updates subscription
2. **Bot API**: Stores subscription in MongoDB with tier and features
3. **Discord Bot**:
   - Checks subscription before executing commands
   - Caches results to reduce database queries
   - Shows upgrade prompts for premium features

This ensures that when a user purchases a tier, their server automatically gets access to the corresponding features.
