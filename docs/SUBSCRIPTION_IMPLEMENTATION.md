# Subscription System Implementation - Free Tier

## Overview

The subscription tier checking system has been implemented for BobbyTheBot's Free tier features. This document outlines what was implemented, how it works, and what's next.

## What Was Implemented

### 1. Subscription Utilities Module
**File:** [`utils/subscriptionUtils.js`](../utils/subscriptionUtils.js)

A comprehensive utilities module that provides:

- **Tier Constants**: `TIERS.FREE`, `TIERS.PLUS`, `TIERS.ULTIMATE`
- **Tier Checking**: `checkSubscription(discordId, requiredTier)` - Verifies user access
- **Tier Normalization**: Maps legacy tiers (basic, premium, enterprise) to new system
- **Subscription Caching**: 5-minute cache to reduce database queries
- **Upgrade Prompts**: `createUpgradeEmbed()` - Creates beautiful upgrade embeds
- **Cache Management**: Functions to clear cache when subscriptions update

### 2. Handler Updates

#### Modified Handlers (With Tier Restrictions)

##### [`events/valorantApiHandler.js`](../events/valorantApiHandler.js)
- **Free Tier Commands**: `!valstats`, `!valprofile`, `!valmatches`, `!valupdate`, all admin commands
- **Plus Tier Commands**: `!createteams` (team builder) - **NOW REQUIRES PLUS TIER**
- Implementation: Added subscription check before team creation

##### [`events/gamblingHandler.js`](../events/gamblingHandler.js)
- **Free Tier Commands**: `!flip`, `!roulette`, `!dice`, `!gamble` (menu)
- **Plus Tier Commands**: All PvP games - **NOW REQUIRE PLUS TIER**:
  - `!rps` (Rock Paper Scissors)
  - `!highercard` (Higher Card duel)
  - `!quickdraw` (Quick Draw challenge)
  - `!numberduel` (Number Duel)
- Implementation: Added subscription check before each PvP game command

#### Unmodified Handlers (All Free Tier)

The following handlers remain unchanged as all their features are Free tier:

- [`events/valorantRankRoleHandler.js`](../events/valorantRankRoleHandler.js) - Reaction role system
- [`events/memberCountHandler.js`](../events/memberCountHandler.js) - Member count tracking
- [`events/messageReactionHandler.js`](../events/messageReactionHandler.js) - Reaction roles
- [`events/alertHandler.js`](../events/alertHandler.js) - Keyword alerts
- [`events/bountyHandler.js`](../events/bountyHandler.js) - Bounty system
- [`events/eggbuckHandler.js`](../events/eggbuckHandler.js) - Economy system
- [`events/helpHandler.js`](../events/helpHandler.js) - Help menu
- [`events/interactionHandler.js`](../events/interactionHandler.js) - Basic interactions
- [`events/triviaHandler.js`](../events/triviaHandler.js) - Trivia system

## How It Works

### Subscription Check Flow

```javascript
// Example from gamblingHandler.js
const { checkSubscription, createUpgradeEmbed, TIERS } = require('../utils/subscriptionUtils');

// In command handler
if (command === '!rps') {
    // Check if user has Plus tier or higher
    const subCheck = await checkSubscription(message.author.id, TIERS.PLUS);

    if (!subCheck.hasAccess) {
        // User doesn't have access - show upgrade prompt
        const upgradeEmbed = createUpgradeEmbed('PvP Casino Games', TIERS.PLUS, subCheck.userTier);
        return message.channel.send({ embeds: [upgradeEmbed] });
    }

    // User has access - continue with command
    createChallenge(message, args, 'rps', { /* ... */ });
}
```

### Subscription Data Model

The system uses the existing `Subscription` model from [`database/models/Subscription.js`](../database/models/Subscription.js):

```javascript
{
    discordId: String,           // Discord user ID
    tier: String,                // 'free', 'plus', 'ultimate' (or legacy tiers)
    status: String,              // 'active', 'expired', 'cancelled', 'pending'
    botVerified: Boolean,        // Whether bot is installed
    subscribedAt: Date,          // Subscription start date
    expiresAt: Date             // Subscription expiration (null for lifetime)
}
```

### Tier Hierarchy

```
FREE (0) < PLUS (1) < ULTIMATE (2)
```

Legacy tier mappings:
- `basic` → `plus`
- `premium` → `ultimate`
- `enterprise` → `ultimate`

### Caching Strategy

- **Cache Duration**: 5 minutes per user
- **Cache Key**: Discord user ID
- **Cache Invalidation**: Call `clearSubscriptionCache(discordId)` after subscription updates
- **Purpose**: Reduce MongoDB queries, improve performance

## Upgrade Prompts

When a user without sufficient tier tries to use a restricted command, they see a beautiful embed:

**Example for Plus Tier Feature:**

```
╔══════════════════════════════════════╗
║  ⭐ Plus ($4.99/mo) Feature         ║
╠══════════════════════════════════════╣
║  PvP Casino Games requires the      ║
║  Plus ($4.99/mo) tier.              ║
║                                      ║
║  Your current tier: 🆓 Free         ║
║                                      ║
║  🎯 What You Get                    ║
║  • Blackjack & All PvP Games        ║
║  • Valorant Team Builder            ║
║  • Bee Mafia                        ║
║  • Bobby AI                         ║
║  • Activity Tracking & KOTH         ║
║                                      ║
║  💳 Upgrade Now                     ║
║  Visit our website to upgrade!      ║
╚══════════════════════════════════════╝
```

## Testing the Implementation

### Prerequisites

1. **MongoDB Running**: Ensure MongoDB is running
2. **Subscription API**: The subscription API should be running on port 3002
3. **Clerk Setup**: Clerk authentication should be configured

### Test Cases

#### Test Case 1: Free User Accessing Free Features
```
User: Free tier user
Action: !valstats, !flip, !economy, !trivia, etc.
Expected: ✅ Commands work normally
```

#### Test Case 2: Free User Accessing Plus Features
```
User: Free tier user
Action: !createteams, !rps, !highercard
Expected: ⭐ Shows upgrade prompt with Plus tier information
```

#### Test Case 3: Plus User Accessing All Features
```
User: Plus tier user
Action: !createteams, !rps, !valstats, !flip
Expected: ✅ All commands work normally
```

#### Test Case 4: No Subscription Record (Defaults to Free)
```
User: No subscription in database
Action: Any command
Expected: Treated as Free tier user
```

#### Test Case 5: Expired Subscription
```
User: Plus tier with expired subscription
Action: !rps
Expected: ⭐ Treated as Free tier, shows upgrade prompt
```

### Manual Testing Steps

1. **Create Test Subscriptions**:
   ```javascript
   // Using MongoDB or your subscription API
   await Subscription.create({
       discordId: 'YOUR_DISCORD_ID',
       tier: 'free',
       status: 'active'
   });
   ```

2. **Test Free Tier Commands**:
   - `!valstats` (should work)
   - `!flip 100` (should work)
   - `!economy` (should work)

3. **Test Plus Tier Commands** (as Free user):
   - `!rps 100` (should show upgrade prompt)
   - `!createteams <messageId>` (should show upgrade prompt)

4. **Upgrade to Plus Tier**:
   ```javascript
   await Subscription.updateOne(
       { discordId: 'YOUR_DISCORD_ID' },
       { tier: 'plus', status: 'active' }
   );
   ```

5. **Test Plus Tier Commands Again**:
   - `!rps 100` (should now work)
   - `!createteams <messageId>` (should now work)

## Next Steps

### Phase 2: Plus Tier Implementation

The following features need to be implemented for Plus tier:

1. **Mafia Handler** (`events/mafiaHandler.js`)
   - Full Bee Mafia game access
   - Admin debug commands

2. **Bobby AI** (`events/interactionHandler.js`)
   - Enhanced conversational AI
   - Memory persistence
   - Context awareness

3. **Activity Tracking** (`events/activityHandler.js` if exists)
   - KOTH (King of the Hill)
   - Activity leaderboards

### Phase 3: Ultimate Tier Implementation

1. **Audit Logs**
   - Comprehensive server logging
   - Action history tracking

2. **Advanced Auto-Moderation**
   - Enhanced spam detection
   - Intelligent content filtering

3. **Custom Prefix**
   - Per-server prefix customization

4. **API Access**
   - RESTful API endpoints
   - Rate limiting by tier

5. **Monthly Bonus**
   - Automatic 10,000 Honey distribution

### Integration with Subscription API

Ensure the subscription API at [`api/subscriptionServer.js`](../api/subscriptionServer.js) provides:

1. **Webhook Endpoint**: Receive subscription updates from Clerk
2. **Cache Invalidation**: Call `clearSubscriptionCache(discordId)` when subscriptions update
3. **Subscription Sync**: Periodic sync between Clerk and MongoDB

### Monitoring & Analytics

Consider implementing:

1. **Usage Tracking**: Log when users hit tier restrictions
2. **Conversion Metrics**: Track upgrade prompt interactions
3. **Feature Usage**: Monitor which Plus features are most used
4. **Error Logging**: Track subscription check failures

## Admin Commands Philosophy

**Important**: Admin commands inherit the tier of their parent feature.

Examples:
- `!award` (economy admin) → Free (because economy is free)
- `!valreset` (valorant admin) → Free (because valorant stats are free)
- `!createteams` (valorant admin) → Plus (because team builder is Plus)
- Mafia debug commands → Plus (because Mafia is Plus)

This ensures admins can manage free features without a subscription while premium feature management requires the appropriate tier.

## Troubleshooting

### Issue: User has Plus but still sees upgrade prompt

**Possible Causes:**
1. Subscription not in database
2. Subscription status is not 'active'
3. Subscription has expired
4. Cache is stale (wait 5 minutes or clear cache)

**Solution:**
```javascript
// Check user's subscription
const subscription = await Subscription.findOne({ discordId: 'USER_ID' });
console.log(subscription);

// Clear cache and retry
const { clearSubscriptionCache } = require('./utils/subscriptionUtils');
clearSubscriptionCache('USER_ID');
```

### Issue: Commands not checking subscription

**Possible Causes:**
1. Handler not importing subscriptionUtils
2. Check not added to command handler
3. Bot restart needed

**Solution:**
1. Verify import: `const { checkSubscription, TIERS } = require('../utils/subscriptionUtils');`
2. Check command handler has subscription check
3. Restart bot: `npm start` or `node index.js`

### Issue: Database connection errors

**Possible Causes:**
1. MongoDB not running
2. Connection string incorrect
3. Network issues

**Solution:**
1. Start MongoDB: `mongod` or check service
2. Verify connection in console logs
3. Check `.env` or config file for correct MongoDB URI

## Summary

### Files Created
- ✅ `utils/subscriptionUtils.js` - Core subscription system

### Files Modified
- ✅ `events/valorantApiHandler.js` - Added Plus tier check for `!createteams`
- ✅ `events/gamblingHandler.js` - Added Plus tier checks for all PvP games

### Files Ready (No Changes Needed)
- ✅ 10 other handlers (all Free tier)

### Commands Restricted
- **Plus Tier Required** (2 total):
  - `!createteams` - Valorant team builder
  - `!rps`, `!highercard`, `!quickdraw`, `!numberduel` - PvP casino games

### Free Tier Features
All other features remain accessible to free users, including:
- Full economy system with admin commands
- Basic casino games (flip, roulette, dice)
- Valorant stats viewing
- Bounty system
- Trivia
- Help system
- Server engagement features
- And more!

---

**Implementation Status**: ✅ Free Tier Complete
**Next Phase**: Plus Tier (Mafia, Bobby AI, Activity Tracking)
**Future Phase**: Ultimate Tier (Audit Logs, Advanced Features)
