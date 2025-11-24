# Guild-Based Subscription System

## Important Change: Server-Based, Not User-Based

The subscription system for BobbyTheBot is **guild-based** (server-based), not user-based. This means:

- ✅ Subscriptions are tied to **Discord servers** (guilds)
- ✅ When a server owner purchases a subscription, **everyone in that server** gets access to premium features
- ❌ Individual users do NOT have subscriptions

---

## How It Works

### 1. Subscription Model

The `Subscription` model stores subscriptions with a `verifiedGuilds` array:

```javascript
{
    discordId: "USER_ID",              // The user who purchased the subscription
    tier: "plus",                      // Subscription tier
    status: "active",                  // Subscription status
    verifiedGuilds: [                  // Array of verified servers
        {
            guildId: "SERVER_ID_1",    // Discord server ID
            guildName: "My Server",     // Server name
            verifiedAt: Date            // When bot was verified in server
        }
    ]
}
```

### 2. Checking Subscriptions

When a command is executed, we check the **server's** subscription, not the user's:

```javascript
// ✅ CORRECT - Check guild/server subscription
const subCheck = await checkSubscription(message.guild.id, TIERS.PLUS);

// ❌ WRONG - Don't check user subscription
const subCheck = await checkSubscription(message.author.id, TIERS.PLUS);
```

### 3. How Purchases Work

1. **User visits website** and purchases a subscription
2. **Stripe webhook** notifies the Subscription API
3. **API creates/updates** subscription in MongoDB with user's Discord ID
4. **User connects bot** to their server
5. **Bot verifies** it's installed and adds server to `verifiedGuilds`
6. **All members** of that server now have access to premium features

---

## Implementation Details

### Subscription Utilities (`utils/subscriptionUtils.js`)

```javascript
/**
 * Check if a guild/server has access to a specific tier
 * @param {string} guildId - Discord guild (server) ID
 * @param {string} requiredTier - Required tier (TIERS.FREE, TIERS.PLUS, TIERS.ULTIMATE)
 * @returns {Promise<Object>} - { hasAccess, guildTier, subscription }
 */
async function checkSubscription(guildId, requiredTier) {
    // Query database for subscription where this guild is verified
    const subscription = await Subscription.findOne({
        'verifiedGuilds.guildId': guildId,
        status: 'active'
    });

    // ... check tier and return result
}
```

### Database Query

The system queries MongoDB to find a subscription where:
- The `verifiedGuilds` array contains the server's ID
- The subscription status is `'active'`
- The subscription hasn't expired

```javascript
// Find subscription for a specific server
await Subscription.findOne({
    'verifiedGuilds.guildId': guildId,  // Server is in verifiedGuilds
    status: 'active'                     // Subscription is active
});
```

### Command Handler Example

```javascript
// In valorantApiHandler.js
if (command === '!createteams') {
    // Check server's subscription (not user's)
    const subCheck = await checkSubscription(message.guild.id, TIERS.PLUS);

    if (!subCheck.hasAccess) {
        // Show upgrade prompt
        const upgradeEmbed = createUpgradeEmbed(
            'Valorant Team Builder',
            TIERS.PLUS,
            subCheck.guildTier  // Current server tier
        );
        return message.channel.send({ embeds: [upgradeEmbed] });
    }

    // Server has access - execute command
    await handleCreateTeams(client, message, messageId, channelId);
}
```

---

## Upgrade Prompts

When a server doesn't have the required tier, users see:

```
╔════════════════════════════════════════╗
║  ⭐ Plus ($14.99/mo) Feature          ║
╠════════════════════════════════════════╣
║  Valorant Team Builder requires the   ║
║  Plus ($14.99/mo) tier.               ║
║                                        ║
║  This server's current tier: 🆓 Free  ║  ← Server tier, not user tier
║                                        ║
║  🎯 What You Get                      ║
║  • Blackjack & All PvP Games          ║
║  • Valorant Team Builder              ║
║  • Bee Mafia                          ║
║  • Bobby AI                           ║
║  • Activity Tracking & KOTH           ║
╚════════════════════════════════════════╝
```

Note: The prompt shows "This **server's** current tier", not "Your current tier".

---

## Benefits of Guild-Based Subscriptions

### For Server Owners
- ✅ Purchase once, unlock for entire community
- ✅ Encourage server growth
- ✅ Provide value to all members

### For Server Members
- ✅ Free access if server owner subscribes
- ✅ No individual purchases needed
- ✅ Fair access for everyone in the community

### For BobbyTheBot
- ✅ Encourages server owners to upgrade
- ✅ Simpler permission model
- ✅ Better value proposition

---

## Testing Guild-Based Subscriptions

### Setup Test Data

```javascript
// Create a subscription for a server
await Subscription.create({
    discordId: 'OWNER_USER_ID',  // User who purchased
    tier: 'plus',
    status: 'active',
    verifiedGuilds: [
        {
            guildId: 'YOUR_SERVER_ID',  // Your test server
            guildName: 'Test Server',
            verifiedAt: new Date()
        }
    ]
});
```

### Test Commands

1. **In a Free Server:**
   - Try `!rps 100` → Should show upgrade prompt
   - Try `!createteams` → Should show upgrade prompt

2. **In a Plus Server:**
   - Try `!rps 100` → Should work
   - Try `!createteams` → Should work

3. **Different Users, Same Server:**
   - User A tries `!rps` in Plus server → Works
   - User B tries `!rps` in same Plus server → Works
   - User C tries `!rps` in different Free server → Blocked

---

## Cache Management

Subscriptions are cached per guild ID for 5 minutes:

```javascript
// Cache key = guild ID, not user ID
subscriptionCache.set(guildId, {
    data: subscription,
    timestamp: Date.now()
});

// Clear cache when subscription updates
clearSubscriptionCache(guildId);  // Pass guild ID, not user ID
```

---

## Migration from User-Based (If Applicable)

If you previously had user-based subscriptions:

```javascript
// OLD - User-based (INCORRECT)
const subCheck = await checkSubscription(message.author.id, TIERS.PLUS);

// NEW - Guild-based (CORRECT)
const subCheck = await checkSubscription(message.guild.id, TIERS.PLUS);
```

Update all handlers to use `message.guild.id` instead of `message.author.id`.

---

## Frequently Asked Questions

### Q: Can a user have a personal subscription?
**A:** No, subscriptions are server-based only. Users must be in a server that has a subscription.

### Q: What if a user is in multiple servers?
**A:** They get premium features in any server that has a subscription, and free features in servers without subscriptions.

### Q: What if the server owner leaves?
**A:** The subscription stays with the server as long as it's in the `verifiedGuilds` array and the subscription is active.

### Q: Can a server have multiple subscriptions?
**A:** No, each server can only be in one subscription's `verifiedGuilds` array. The highest tier takes precedence.

### Q: How do I test with multiple servers?
**A:** Add multiple guild objects to the `verifiedGuilds` array in a single subscription, or create separate subscriptions with different server IDs.

---

## Summary

- ✅ **Guild-based**: Subscriptions belong to servers, not users
- ✅ **Everyone benefits**: All server members get premium features
- ✅ **Check guild ID**: Always use `message.guild.id` in subscription checks
- ✅ **VerifiedGuilds**: Servers are stored in `verifiedGuilds` array
- ✅ **Cache by guild**: Caching uses guild ID as key
- ✅ **Upgrade prompts**: Show server's tier, not user's tier

This approach makes BobbyTheBot's premium features accessible to entire communities, not just individual users!
