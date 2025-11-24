# Subscription System Quick Start Guide

## For Developers: Adding Subscription Checks to Commands

This guide shows you how to add subscription tier checks to any command in BobbyTheBot.

---

## Basic Usage

### 1. Import the Utilities

At the top of your handler file:

```javascript
const { checkSubscription, createUpgradeEmbed, TIERS } = require('../utils/subscriptionUtils');
```

### 2. Add Check to Your Command

```javascript
// Example: Adding Plus tier check to a command
if (command === '!mycommand') {
    // Check if user has Plus tier or higher
    const subCheck = await checkSubscription(message.author.id, TIERS.PLUS);

    if (!subCheck.hasAccess) {
        // User doesn't have access - show upgrade prompt
        const upgradeEmbed = createUpgradeEmbed('Feature Name', TIERS.PLUS, subCheck.userTier);
        return message.channel.send({ embeds: [upgradeEmbed] });
    }

    // User has access - continue with command logic
    // ... your command code here ...
}
```

---

## Available Tiers

```javascript
TIERS.FREE      // Free tier (0)
TIERS.PLUS      // Plus tier (1) - $14.99/month
TIERS.ULTIMATE  // Ultimate tier (2) - $19.99/month
```

**Tier Hierarchy:** FREE < PLUS < ULTIMATE

Users with higher tiers automatically have access to lower tier features.

---

## Real-World Examples

### Example 1: Plus Tier Command (PvP Game)

```javascript
// In gamblingHandler.js
if (command === '!rps') {
    const subCheck = await checkSubscription(message.author.id, TIERS.PLUS);
    if (!subCheck.hasAccess) {
        const upgradeEmbed = createUpgradeEmbed('PvP Casino Games', TIERS.PLUS, subCheck.userTier);
        return message.channel.send({ embeds: [upgradeEmbed] });
    }

    createChallenge(message, args, 'rps', { /* ... */ });
}
```

### Example 2: Ultimate Tier Command (Audit Logs)

```javascript
// In moderationHandler.js
if (command === '!auditlogs') {
    const subCheck = await checkSubscription(message.author.id, TIERS.ULTIMATE);
    if (!subCheck.hasAccess) {
        const upgradeEmbed = createUpgradeEmbed('Audit Logs', TIERS.ULTIMATE, subCheck.userTier);
        return message.channel.send({ embeds: [upgradeEmbed] });
    }

    // Show audit logs
}
```

### Example 3: Free Tier Command (No Check Needed)

```javascript
// In economyHandler.js
if (command === '!balance') {
    // No subscription check needed - this is a free feature
    const balance = await getBobbyBucks(message.author.id);
    // ... show balance ...
}
```

### Example 4: Multiple Commands with Different Tiers

```javascript
// Free tier commands
if (command === '!flip' || command === '!dice') {
    // No check needed
    playHouseGame(message, args);
}

// Plus tier commands
else if (command === '!blackjack') {
    const subCheck = await checkSubscription(message.author.id, TIERS.PLUS);
    if (!subCheck.hasAccess) {
        const upgradeEmbed = createUpgradeEmbed('Blackjack', TIERS.PLUS, subCheck.userTier);
        return message.channel.send({ embeds: [upgradeEmbed] });
    }
    playBlackjack(message, args);
}

// Ultimate tier commands
else if (command === '!customprefix') {
    const subCheck = await checkSubscription(message.author.id, TIERS.ULTIMATE);
    if (!subCheck.hasAccess) {
        const upgradeEmbed = createUpgradeEmbed('Custom Prefix', TIERS.ULTIMATE, subCheck.userTier);
        return message.channel.send({ embeds: [upgradeEmbed] });
    }
    setCustomPrefix(message, args);
}
```

---

## Advanced Usage

### Getting Full Subscription Details

```javascript
const { getSubscription } = require('../utils/subscriptionUtils');

const subscription = await getSubscription(userId);

if (subscription) {
    console.log(`User tier: ${subscription.tier}`);
    console.log(`Status: ${subscription.status}`);
    console.log(`Expires: ${subscription.expiresAt}`);
}
```

### Manual Tier Comparison

```javascript
const { checkSubscription, TIER_HIERARCHY, TIERS } = require('../utils/subscriptionUtils');

const result = await checkSubscription(userId, TIERS.PLUS);

console.log(`User tier: ${result.userTier}`);
console.log(`Has access: ${result.hasAccess}`);
console.log(`Subscription: ${result.subscription}`);

// Check if user has at least Plus tier
if (TIER_HIERARCHY[result.userTier] >= TIER_HIERARCHY[TIERS.PLUS]) {
    // User has Plus or Ultimate
}
```

### Cache Management

```javascript
const { clearSubscriptionCache } = require('../utils/subscriptionUtils');

// Clear cache after subscription update
await updateSubscription(userId, { tier: 'plus' });
clearSubscriptionCache(userId); // Force refresh on next check
```

---

## Subscription Tiers Reference

### Free Tier ($0/month)
- Full economy system
- Basic gambling (flip, roulette, dice)
- Wordle & Trivia
- Valorant stats viewing
- Bounty system
- Moderation tools
- Server engagement features

### Plus Tier ($14.99/month)
Everything in Free, plus:
- Blackjack
- All PvP casino games
- Valorant team builder
- Bee Mafia
- Bobby AI
- Activity tracking

### Ultimate Tier ($19.99/month)
Everything in Plus, plus:
- Audit logs
- Advanced auto-moderation
- Custom prefix
- API access
- Priority support
- 10,000 monthly Honey bonus

---

## Testing Your Implementation

### Manual Testing

1. **Test as Free User:**
   ```javascript
   // In MongoDB or via API, ensure user has free tier
   // Then try Plus/Ultimate commands - should see upgrade prompt
   ```

2. **Test as Plus User:**
   ```javascript
   // Update user to Plus tier
   await Subscription.updateOne(
       { discordId: 'USER_ID' },
       { tier: 'plus', status: 'active' }
   );
   // Clear cache and test Plus commands
   ```

3. **Test as Ultimate User:**
   ```javascript
   // Update user to Ultimate tier
   // Test all commands - should work
   ```

### Automated Testing

Run the test suite:

```bash
node tests/testSubscription.js
```

This will verify:
- ✅ Tier hierarchy
- ✅ Access control logic
- ✅ Caching system
- ✅ Expired subscriptions
- ✅ Default behavior (no subscription = free)

---

## Common Patterns

### Pattern 1: Simple Gate (Most Common)

```javascript
if (command === '!premium-feature') {
    const subCheck = await checkSubscription(message.author.id, TIERS.PLUS);
    if (!subCheck.hasAccess) {
        return message.channel.send({
            embeds: [createUpgradeEmbed('Feature Name', TIERS.PLUS, subCheck.userTier)]
        });
    }
    // Your code here
}
```

### Pattern 2: Multiple Tiers with Fallbacks

```javascript
if (command === '!search') {
    const subCheck = await checkSubscription(message.author.id, TIERS.PLUS);

    if (subCheck.userTier === TIERS.ULTIMATE) {
        // Ultimate: unlimited searches
        performSearch(message, args, { limit: Infinity });
    } else if (subCheck.userTier === TIERS.PLUS) {
        // Plus: 100 searches per day
        performSearch(message, args, { limit: 100 });
    } else {
        // Free: 10 searches per day
        performSearch(message, args, { limit: 10 });
    }
}
```

### Pattern 3: Admin Commands Follow Parent Feature

```javascript
// Admin command for a Plus feature
if (command === '!adminmafiareset' && message.member.permissions.has('ADMINISTRATOR')) {
    // Admin commands inherit parent feature tier
    const subCheck = await checkSubscription(message.author.id, TIERS.PLUS);
    if (!subCheck.hasAccess) {
        return message.channel.send({
            embeds: [createUpgradeEmbed('Mafia Admin Tools', TIERS.PLUS, subCheck.userTier)]
        });
    }
    // Reset mafia game
}
```

### Pattern 4: Interactive Components (Buttons)

```javascript
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('pvp_accept_')) {
        const subCheck = await checkSubscription(interaction.user.id, TIERS.PLUS);
        if (!subCheck.hasAccess) {
            return interaction.reply({
                embeds: [createUpgradeEmbed('PvP Games', TIERS.PLUS, subCheck.userTier)],
                ephemeral: true
            });
        }
        // Handle PvP acceptance
    }
});
```

---

## Troubleshooting

### Issue: User has subscription but sees upgrade prompt

**Check:**
1. Verify subscription in database: `db.subscriptions.findOne({ discordId: 'USER_ID' })`
2. Check status is 'active': `status: 'active'`
3. Check expiration: `expiresAt: null` or future date
4. Clear cache: `clearSubscriptionCache(userId)`

### Issue: Subscription check throws error

**Check:**
1. MongoDB is connected
2. Subscription model is loaded
3. User ID is valid Discord snowflake
4. Required tier is valid (`TIERS.FREE`, `TIERS.PLUS`, or `TIERS.ULTIMATE`)

### Issue: Cache not updating after subscription change

**Solution:**
```javascript
const { clearSubscriptionCache } = require('../utils/subscriptionUtils');
clearSubscriptionCache(userId); // Call this after updating subscription
```

---

## Best Practices

1. ✅ **Always use TIERS constants** - Never hardcode tier strings
2. ✅ **Show upgrade prompts, not errors** - Use `createUpgradeEmbed()`
3. ✅ **Check early, return early** - Put checks at the start of commands
4. ✅ **Admin commands inherit parent tier** - Economy admin = Free, Mafia admin = Plus
5. ✅ **Cache is automatic** - Don't worry about it unless updating subscriptions
6. ✅ **Free tier is default** - No subscription record = Free tier
7. ✅ **Test with all tiers** - Free, Plus, Ultimate, and "no subscription"

---

## Next Steps

- **Phase 2**: Implement Plus tier features (Mafia, Bobby AI, Activity)
- **Phase 3**: Implement Ultimate tier features (Audit Logs, Advanced Auto-Mod)
- **Integration**: Connect Subscription API webhooks to auto-update subscriptions

---

## Questions?

Refer to:
- [Full Implementation Guide](./SUBSCRIPTION_IMPLEMENTATION.md)
- [Tier Plan Details](./SUBSCRIPTION_TIERS.md)
- [Subscription API Docs](./SUBSCRIPTION_API.md)

Happy coding! 🚀
