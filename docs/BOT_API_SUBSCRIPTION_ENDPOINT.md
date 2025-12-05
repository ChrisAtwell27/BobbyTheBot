# Bot API `/api/subscription` Endpoint Requirements

## Current Issue

When you purchase a subscription through Clerk, the webhook sends data to the bot API at `POST /api/subscription`, but the bot needs to support **per-guild subscriptions**.

## What the Webhook Sends (Updated)

```json
POST /api/subscription
Headers:
  X-API-Key: <SUBSCRIPTION_API_SECRET>
  Content-Type: application/json

Body:
{
  "discordId": "123456789012345678",
  "clerkUserId": "user_abc123",
  "guildId": "987654321098765432",
  "guildName": "My Server",
  "tier": "plus",
  "status": "active",
  "expiresAt": "2026-01-05T00:00:00.000Z",
  "metadata": {
    "clerkUserId": "user_abc123",
    "lastUpdated": "2025-12-05T10:30:00.000Z"
  }
}
```

## What the Bot API Must Do

### 1. Find or Create Subscription Document

```javascript
// Find subscription document for this user
let subscription = await Subscription.findOne({ discordId: req.body.discordId });

if (!subscription) {
  // Create new subscription document if none exists
  subscription = new Subscription({
    discordId: req.body.discordId,
    discordUsername: "", // Will be filled on next verification
    verifiedGuilds: []
  });
}
```

### 2. Update or Add Guild Subscription

```javascript
const { guildId, guildName, tier, status, expiresAt } = req.body;

// Find if this guild already exists in verifiedGuilds
const guildIndex = subscription.verifiedGuilds.findIndex(
  g => g.guildId === guildId
);

const guildData = {
  guildId,
  guildName,
  tier,
  status,
  trialEndsAt: null, // Clear trial when upgrading
  expiresAt: expiresAt ? new Date(expiresAt) : null,
  subscribedAt: new Date(),
  verifiedAt: new Date()
};

if (guildIndex >= 0) {
  // Update existing guild
  subscription.verifiedGuilds[guildIndex] = {
    ...subscription.verifiedGuilds[guildIndex],
    ...guildData
  };
} else {
  // Add new guild
  subscription.verifiedGuilds.push(guildData);
}

// Save subscription
await subscription.save();
```

### 3. Return Success Response

```javascript
return res.json({
  success: true,
  message: "Subscription updated successfully",
  subscription: {
    discordId: subscription.discordId,
    guildId: guildId,
    tier: tier,
    status: status,
    expiresAt: expiresAt
  }
});
```

## Complete Implementation Example

```javascript
// POST /api/subscription
router.post('/api/subscription', authenticate, async (req, res) => {
  try {
    const { discordId, guildId, guildName, tier, status, expiresAt, metadata } = req.body;

    // Validate required fields
    if (!discordId) {
      return res.status(400).json({
        success: false,
        error: "discordId is required"
      });
    }

    if (!guildId) {
      return res.status(400).json({
        success: false,
        error: "guildId is required for per-guild subscriptions"
      });
    }

    console.log(`[BOT API] Updating subscription for guild ${guildId}:`, {
      discordId,
      tier,
      status,
      expiresAt
    });

    // Find or create subscription document
    let subscription = await Subscription.findOne({ discordId });

    if (!subscription) {
      console.log(`[BOT API] Creating new subscription document for ${discordId}`);
      subscription = new Subscription({
        discordId,
        discordUsername: "",
        verifiedGuilds: []
      });
    }

    // Find if this guild already exists
    const guildIndex = subscription.verifiedGuilds.findIndex(
      g => g.guildId === guildId
    );

    // Prepare guild data
    const guildData = {
      guildId,
      guildName: guildName || (guildIndex >= 0 ? subscription.verifiedGuilds[guildIndex].guildName : "Unknown Server"),
      tier: tier || "free",
      status: status || "active",
      trialEndsAt: null, // Clear trial when upgrading to paid
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      subscribedAt: guildIndex >= 0 ? subscription.verifiedGuilds[guildIndex].subscribedAt : new Date(),
      verifiedAt: new Date()
    };

    if (guildIndex >= 0) {
      // Update existing guild
      console.log(`[BOT API] Updating existing guild ${guildId} subscription`);
      subscription.verifiedGuilds[guildIndex] = guildData;
    } else {
      // Add new guild
      console.log(`[BOT API] Adding new guild ${guildId} to subscription`);
      subscription.verifiedGuilds.push(guildData);
    }

    // Store metadata if provided
    if (metadata) {
      subscription.metadata = {
        ...subscription.metadata,
        ...metadata
      };
    }

    // Update lastVerificationCheck
    subscription.lastVerificationCheck = new Date();

    // Save to database
    await subscription.save();

    console.log(`[BOT API] Subscription saved successfully for guild ${guildId}`);

    // Clear cache for this guild
    clearSubscriptionCache(guildId);

    return res.json({
      success: true,
      message: "Subscription updated successfully",
      subscription: {
        discordId: subscription.discordId,
        guildId: guildId,
        tier: tier,
        status: status,
        expiresAt: expiresAt
      }
    });

  } catch (error) {
    console.error('[BOT API] Error updating subscription:', error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message
    });
  }
});
```

## Testing the Endpoint

### Test with cURL:

```bash
curl -X POST http://localhost:3003/api/subscription \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-settings-api-key" \
  -d '{
    "discordId": "YOUR_DISCORD_ID",
    "guildId": "YOUR_GUILD_ID",
    "guildName": "Test Server",
    "tier": "plus",
    "status": "active",
    "expiresAt": "2026-01-05T00:00:00.000Z"
  }'
```

### Expected Response:

```json
{
  "success": true,
  "message": "Subscription updated successfully",
  "subscription": {
    "discordId": "YOUR_DISCORD_ID",
    "guildId": "YOUR_GUILD_ID",
    "tier": "plus",
    "status": "active",
    "expiresAt": "2026-01-05T00:00:00.000Z"
  }
}
```

## Verification

After the webhook runs, verify the subscription was updated:

1. **Check database:**
```javascript
db.subscriptions.findOne({ discordId: "YOUR_DISCORD_ID" })
```

Should show:
```javascript
{
  discordId: "YOUR_DISCORD_ID",
  verifiedGuilds: [
    {
      guildId: "YOUR_GUILD_ID",
      guildName: "Test Server",
      tier: "plus",
      status: "active",
      trialEndsAt: null,
      expiresAt: ISODate("2026-01-05T00:00:00.000Z"),
      subscribedAt: ISODate("2025-12-05T..."),
      verifiedAt: ISODate("2025-12-05T...")
    }
  ]
}
```

2. **Check bot command:**
Run `/subscription` in your Discord server and verify it shows "Plus" tier.

3. **Check website:**
Visit `/bobby-the-bot` and verify the server shows a blue border with "PLUS" badge.

## Debugging Checklist

If subscriptions aren't updating:

- ✅ Check webhook logs in Vercel/server console
- ✅ Verify `BOT_API_URL` environment variable is set correctly
- ✅ Verify `SUBSCRIPTION_API_SECRET` matches between website and bot
- ✅ Check bot API logs for incoming requests
- ✅ Verify MongoDB connection is working
- ✅ Check that pending purchase exists in Convex before webhook runs
- ✅ Verify Clerk webhook is configured to send `user.updated` events
- ✅ Check that subscription cache is cleared after update

## Summary

The bot's `/api/subscription` endpoint must:

1. ✅ Accept `guildId` in the request body
2. ✅ Store subscription data **per-guild** in `verifiedGuilds` array
3. ✅ Support updating existing guilds or adding new ones
4. ✅ Clear subscription cache for the updated guild
5. ✅ Return success response with updated guild data

Once this is implemented, purchases made through Clerk will automatically update the correct guild's subscription on the bot.
