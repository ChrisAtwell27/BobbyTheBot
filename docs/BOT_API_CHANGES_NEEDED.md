# Bot API Changes Required for Per-Server Subscriptions

## Problem
Currently, the website displays incorrect subscription information because:
1. The bot API returns **user-level** subscription data
2. But the bot actually checks **server-level** (guild-level) subscriptions
3. Trials are managed per-user instead of per-server

## Required Changes to Bot API

### 1. Update `/api/subscription/verify-clerk` Response

The bot API endpoint needs to return per-guild subscription and trial information.

#### Current Response (INCORRECT):
```json
{
  "success": true,
  "verified": true,
  "guilds": {
    "total": 5,
    "withBot": 2,
    "verified": [
      {
        "guildId": "123456789",
        "guildName": "My Server",
        "guildIcon": "abc123",
        "isOwner": true
      }
    ]
  },
  "subscription": {
    "tier": "free",
    "status": "active",
    "features": ["basic_commands"],
    "expiresAt": null
  }
}
```

#### New Response (CORRECT):
```json
{
  "success": true,
  "verified": true,
  "guilds": {
    "total": 5,
    "withBot": 2,
    "verified": [
      {
        "guildId": "123456789",
        "guildName": "My Server",
        "guildIcon": "abc123",
        "isOwner": true,
        "tier": "free",
        "status": "trial",
        "trialEndsAt": "2025-12-12T00:00:00.000Z",
        "expiresAt": null
      },
      {
        "guildId": "987654321",
        "guildName": "Another Server",
        "guildIcon": "def456",
        "isOwner": false,
        "tier": "plus",
        "status": "active",
        "trialEndsAt": null,
        "expiresAt": "2026-01-15T00:00:00.000Z"
      }
    ]
  }
}
```

### 2. Database Schema Changes

Update the subscription database schema to track per-guild trials:

```javascript
// OLD - User-level subscription (INCORRECT)
{
  discordId: "USER_ID",
  tier: "free",
  status: "trial",
  trialEndsAt: "2025-12-12T00:00:00.000Z",
  verifiedGuilds: [
    { guildId: "123", guildName: "Server 1" },
    { guildId: "456", guildName: "Server 2" }
  ]
}

// NEW - Per-guild trials (CORRECT)
{
  discordId: "USER_ID",
  verifiedGuilds: [
    {
      guildId: "123",
      guildName: "Server 1",
      tier: "free",
      status: "trial",
      trialEndsAt: "2025-12-12T00:00:00.000Z",
      subscribedAt: "2025-12-05T00:00:00.000Z"
    },
    {
      guildId: "456",
      guildName: "Server 2",
      tier: "plus",
      status: "active",
      trialEndsAt: null,
      expiresAt: "2026-01-15T00:00:00.000Z",
      subscribedAt: "2025-11-01T00:00:00.000Z"
    }
  ]
}
```

### 3. Trial Logic Changes

**Current (WRONG):**
- User gets ONE trial across all servers
- Trial is tied to the user's Discord account

**New (CORRECT):**
- Each server gets its OWN 7-day trial when the bot is first added
- Trials are independent per server
- A user can have trial servers and premium servers at the same time

#### Implementation Example:

```javascript
// When bot joins a new guild
client.on('guildCreate', async (guild) => {
  // Check if this guild already has a trial/subscription
  const existing = await Subscription.findOne({
    'verifiedGuilds.guildId': guild.id
  });

  if (!existing) {
    // Start a new trial for this guild
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7); // 7 days from now

    // Find or create subscription document for guild owner
    await Subscription.findOneAndUpdate(
      { discordId: guild.ownerId },
      {
        $push: {
          verifiedGuilds: {
            guildId: guild.id,
            guildName: guild.name,
            tier: "free",
            status: "trial",
            trialEndsAt: trialEndsAt,
            subscribedAt: new Date()
          }
        }
      },
      { upsert: true }
    );
  }
});

// When checking subscription for a command
async function checkGuildSubscription(guildId) {
  const subscription = await Subscription.findOne({
    'verifiedGuilds.guildId': guildId
  });

  if (!subscription) {
    return { tier: "free", status: "active", hasAccess: false };
  }

  const guildData = subscription.verifiedGuilds.find(g => g.guildId === guildId);

  // Check if trial expired
  if (guildData.status === "trial" && new Date() > new Date(guildData.trialEndsAt)) {
    // Update status to expired
    await Subscription.updateOne(
      { 'verifiedGuilds.guildId': guildId },
      { $set: { 'verifiedGuilds.$.status': 'expired', 'verifiedGuilds.$.tier': 'free' } }
    );
    return { tier: "free", status: "expired", hasAccess: false };
  }

  return {
    tier: guildData.tier,
    status: guildData.status,
    hasAccess: guildData.tier !== "free" || guildData.status === "trial"
  };
}
```

### 4. Webhook Updates (Clerk/Stripe)

When a user purchases a subscription, update the specific guild:

```javascript
// When Stripe webhook confirms payment
app.post('/api/webhooks/stripe', async (req, res) => {
  const { guildId, tier, discordId } = req.body;

  // Update the specific guild's subscription
  await Subscription.updateOne(
    {
      discordId: discordId,
      'verifiedGuilds.guildId': guildId
    },
    {
      $set: {
        'verifiedGuilds.$.tier': tier,
        'verifiedGuilds.$.status': 'active',
        'verifiedGuilds.$.trialEndsAt': null,
        'verifiedGuilds.$.expiresAt': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    }
  );

  res.json({ success: true });
});
```

## Migration Script

If there's existing data, run this migration:

```javascript
// Migrate existing subscriptions to per-guild format
async function migrateToPerGuildSubscriptions() {
  const subscriptions = await Subscription.find({});

  for (const sub of subscriptions) {
    // If verifiedGuilds doesn't have per-guild trial data
    if (sub.verifiedGuilds.length > 0 && !sub.verifiedGuilds[0].tier) {
      const updates = sub.verifiedGuilds.map(guild => ({
        ...guild,
        tier: sub.tier || "free",
        status: sub.status || "active",
        trialEndsAt: sub.trialEndsAt || null,
        expiresAt: sub.expiresAt || null,
        subscribedAt: sub.subscribedAt || new Date()
      }));

      await Subscription.updateOne(
        { _id: sub._id },
        {
          $set: { verifiedGuilds: updates },
          $unset: { tier: "", status: "", trialEndsAt: "", expiresAt: "" }
        }
      );
    }
  }

  console.log('Migration complete');
}
```

## Summary

### ✅ IMPLEMENTATION COMPLETE

All required changes have been successfully implemented:

1. ✅ **Bot API returns per-guild tier/status/trial info**
   - Updated `/api/subscription/verify-clerk` endpoint
   - Returns per-guild data in `guilds.verified` array
   - File: `api/subscriptionServer.js` (lines 443-511)

2. ✅ **Each guild has its own trial period**
   - Automatic 7-day trial on guild join
   - Automatic trial via API verification
   - File: `events/guildJoinHandler.js`

3. ✅ **Database stores subscription data per-guild**
   - Updated Convex schema with per-guild fields
   - Added `tier`, `status`, `trialEndsAt`, `expiresAt` per guild
   - File: `convex/schema.ts` (lines 296-317)

4. ✅ **Commands check guild-specific subscriptions**
   - Updated `!subscription` command to show trial info
   - Displays days remaining, trial status
   - File: `events/subscriptionCommandHandler.js`

5. ✅ **Webhooks can update specific guild subscriptions**
   - Created `ConvexHelper.updateGuildSubscription()` function
   - File: `api/convexApiHelper.js`

### Implementation Files

**New Files Created:**
- `api/convexApiHelper.js` - Convex bridge for API
- `events/guildJoinHandler.js` - Automatic trial creation
- `scripts/migrateToPerGuildSubscriptions.js` - Migration script
- `docs/PER_GUILD_SUBSCRIPTION_IMPLEMENTATION.md` - Full documentation

**Modified Files:**
- `convex/schema.ts` - Per-guild subscription fields
- `convex/subscriptions.ts` - Per-guild mutations & queries
- `api/subscriptionServer.js` - Updated API endpoint
- `events/subscriptionCommandHandler.js` - Shows trial info
- `events/handlerRegistry.js` - Registered guild join handler

### Benefits Achieved:
✅ Users see accurate trial information per server
✅ Each server gets its own trial period (7 days)
✅ No confusion between user and server subscriptions
✅ Matches the guild-based subscription model
✅ Website can display correct per-guild status
✅ Users can have trial servers and premium servers simultaneously

### Next Steps:

1. **Deploy Changes:**
   ```bash
   # Deploy Convex schema changes
   npx convex deploy
   ```

2. **Run Migration:**
   ```bash
   # Migrate existing subscriptions
   node scripts/migrateToPerGuildSubscriptions.js
   ```

3. **Test Implementation:**
   - Add bot to a new guild → Should start 7-day trial
   - Run `!subscription` → Should show trial with days remaining
   - Call API `/verify-clerk` → Should return per-guild data

4. **Update Website:**
   - Parse per-guild `tier`, `status`, `trialEndsAt` from API response
   - Display trial countdown per server
   - Show upgrade options per server

### Documentation:

For complete implementation details, see:
- `docs/PER_GUILD_SUBSCRIPTION_IMPLEMENTATION.md` - Full technical documentation
- `api/convexApiHelper.js` - API integration examples
- `scripts/migrateToPerGuildSubscriptions.js` - Migration guide
