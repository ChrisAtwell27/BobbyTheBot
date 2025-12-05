# Per-Guild Subscription Implementation

## Overview

This document describes the implementation of per-guild subscriptions with individual trial periods for Bobby The Bot. This architectural change moves from user-level subscriptions to guild-level subscriptions, where each server gets its own 7-day trial period and independent subscription status.

## Problem Statement

**Previous Architecture:**
- Subscriptions were managed at the user level
- Website API returned user-level subscription data
- Bot commands checked guild-level subscriptions (inconsistent)
- Users got ONE trial across all servers
- Website displayed incorrect subscription information

**New Architecture:**
- Each guild has its own subscription status
- Each guild gets its own 7-day trial when bot is added
- API returns per-guild tier, status, and trial information
- Consistent subscription checking across bot and API

---

## Implementation Changes

### 1. Convex Schema Updates

**File:** `convex/schema.ts`

Added per-guild subscription fields to the `verifiedGuilds` array:

```typescript
verifiedGuilds: v.array(v.object({
  guildId: v.string(),
  guildName: v.string(),
  verifiedAt: v.number(),
  // Per-guild subscription data
  tier: v.optional(v.union(...)),
  status: v.optional(v.union("active", "trial", "expired", ...)),
  trialEndsAt: v.optional(v.number()),
  expiresAt: v.optional(v.number()),
  subscribedAt: v.optional(v.number()),
}))
```

### 2. Convex Subscription Mutations

**File:** `convex/subscriptions.ts`

#### New/Updated Functions:

- **`addVerifiedGuild`** - Now automatically starts a 7-day trial for new guilds
- **`getGuildSubscription`** - Query guild-specific subscription status
- **`updateGuildSubscription`** - Update per-guild tier/status/expiration

**Key Features:**
- Automatic trial creation (7 days from guild verification)
- Trial expiration checking
- Per-guild tier syncing to servers table

### 3. API Endpoint Changes

**File:** `api/subscriptionServer.js`

#### Updated Endpoint: `POST /api/subscription/verify-clerk`

**New Response Format:**
```json
{
  "success": true,
  "verified": true,
  "guilds": {
    "verified": [
      {
        "guildId": "123456789",
        "guildName": "My Server",
        "tier": "free",
        "status": "trial",
        "trialEndsAt": "2025-12-12T00:00:00.000Z",
        "expiresAt": null,
        "subscribedAt": "2025-12-05T00:00:00.000Z"
      }
    ]
  }
}
```

**What Changed:**
- Each guild in the `verified` array now includes per-guild subscription data
- Removed user-level subscription object from response
- Added automatic trial creation for new guilds via API verification

### 4. Convex API Helper

**File:** `api/convexApiHelper.js` (NEW)

A bridge module that allows the Express API to query Convex for subscription data.

**Functions:**
- `getSubscriptionByDiscordId()` - Get user's full subscription
- `getGuildSubscription()` - Get specific guild's subscription
- `addVerifiedGuild()` - Add guild with trial
- `updateGuildSubscription()` - Update guild subscription
- `formatGuildForResponse()` - Format for API responses

### 5. Automatic Trial Creation

**File:** `events/guildJoinHandler.js` (NEW)

Monitors `guildCreate` events and automatically:
1. Creates subscription record if needed
2. Adds guild with 7-day trial
3. Sends welcome message to guild with trial information

**Registered in:** `events/handlerRegistry.js`

### 6. Updated Commands

**File:** `events/subscriptionCommandHandler.js`

The `!subscription` command now shows:
- Guild-specific tier and status
- Trial information (days remaining)
- Trial expiration countdown
- Orange color theme for trial subscriptions

---

## Trial Logic

### When Trials Start

1. **Bot joins a new guild** → Automatic 7-day trial via `guildJoinHandler`
2. **User verifies via website** → Automatic 7-day trial via API endpoint

### Trial Duration

- **Length:** 7 days (604,800,000 milliseconds)
- **Countdown:** Displayed in `!subscription` command
- **Expiration:** Checked dynamically in queries

### Trial Status

- **Status:** `"trial"`
- **Tier:** `"free"` (during trial, all features accessible)
- **After Expiration:** Status changes to `"expired"`, tier remains `"free"`

---

## Migration

### Migration Script

**File:** `scripts/migrateToPerGuildSubscriptions.js`

**Purpose:** Migrate existing user-level subscriptions to per-guild format

**How to Run:**
```bash
node scripts/migrateToPerGuildSubscriptions.js
```

**What It Does:**
1. Fetches all subscriptions from Convex
2. For each subscription with verified guilds:
   - Checks if already migrated
   - Converts user-level tier/status to per-guild format
   - Sets trial status if subscription was pending
   - Updates each guild individually
3. Reports migration statistics

**Safety:**
- Checks if already migrated before updating
- Skips subscriptions with no guilds
- Detailed logging for troubleshooting

---

## API Response Examples

### Before Migration (OLD)

```json
{
  "guilds": {
    "verified": [
      {
        "guildId": "123",
        "guildName": "Server 1"
      }
    ]
  },
  "subscription": {
    "tier": "free",
    "status": "active"
  }
}
```

### After Migration (NEW)

```json
{
  "guilds": {
    "verified": [
      {
        "guildId": "123",
        "guildName": "Server 1",
        "tier": "free",
        "status": "trial",
        "trialEndsAt": 1733961600000,
        "expiresAt": null
      },
      {
        "guildId": "456",
        "guildName": "Server 2",
        "tier": "premium",
        "status": "active",
        "trialEndsAt": null,
        "expiresAt": 1736553600000
      }
    ]
  }
}
```

---

## Webhook Integration (Stripe/Clerk)

### When User Purchases Subscription

**Endpoint:** Your payment webhook handler

**Required Changes:**
```javascript
// Update specific guild's subscription
await ConvexHelper.updateGuildSubscription(discordId, guildId, {
  tier: 'premium',           // or 'basic'
  status: 'active',
  expiresAt: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
  trialEndsAt: null          // Clear trial
});
```

**Key Points:**
- Update the **specific guild** that user selected
- Set `status` to `'active'`
- Set `expiresAt` for subscription duration
- Clear `trialEndsAt`

---

## Testing Checklist

### Test Scenarios

- [ ] Bot joins new guild → 7-day trial starts automatically
- [ ] `!subscription` shows trial with days remaining
- [ ] User verifies on website → API returns per-guild trial data
- [ ] User purchases subscription → Specific guild upgrades
- [ ] Trial expires → Status changes to `"expired"`
- [ ] User has multiple guilds → Each has independent trial/status
- [ ] Migration script runs without errors
- [ ] Bot commands check guild-specific subscriptions

### Verification Commands

```bash
# Check Convex data
node scripts/verifySubscriptions.js

# Run migration
node scripts/migrateToPerGuildSubscriptions.js

# Test API endpoint
curl -X POST http://localhost:3002/api/subscription/verify-clerk \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret" \
  -d '{"clerkUserId": "user_123", "discordToken": "token"}'
```

---

## Files Changed

### Modified Files
- `convex/schema.ts` - Added per-guild subscription fields
- `convex/subscriptions.ts` - Updated mutations for per-guild data
- `api/subscriptionServer.js` - Updated verify-clerk endpoint
- `events/subscriptionCommandHandler.js` - Shows trial information
- `events/handlerRegistry.js` - Registered guild join handler

### New Files
- `api/convexApiHelper.js` - Convex bridge for API
- `events/guildJoinHandler.js` - Automatic trial creation
- `scripts/migrateToPerGuildSubscriptions.js` - Migration script
- `docs/PER_GUILD_SUBSCRIPTION_IMPLEMENTATION.md` - This document

---

## Benefits

✅ **Each server gets its own 7-day trial**
✅ **Accurate subscription display on website**
✅ **Independent subscriptions per guild**
✅ **Automatic trial creation**
✅ **Consistent data across bot and API**
✅ **Users can have trial + premium servers simultaneously**

---

## Deployment Steps

1. **Push schema changes** to Convex (automatic via `npx convex dev`)
2. **Deploy updated API** with Convex helper integration
3. **Deploy bot** with guildJoinHandler
4. **Run migration script** for existing subscriptions
5. **Test** with a new guild join
6. **Verify** API responses match new format
7. **Update website** to display per-guild trials

---

## Support & Troubleshooting

### Common Issues

**Issue:** Trial not starting automatically
**Fix:** Check Convex URL is set in environment, verify guildJoinHandler is registered

**Issue:** API returns user-level subscription
**Fix:** Ensure using `ConvexHelper` instead of MongoDB `Subscription` model

**Issue:** Migration script fails
**Fix:** Check Convex connection, verify subscription data structure

### Logs to Monitor

```
[Guild Join] Bot added to guild: ServerName (123)
[Guild Join] ✅ Started 7-day trial for guild ServerName (123)
[Subscription API] Clerk verification error: ...
```

---

## Future Enhancements

- **Trial expiration notifications** - Notify guild owner 1 day before trial ends
- **Grace period** - 3-day grace period after trial expiration
- **Trial analytics** - Track trial conversion rates per guild
- **Multiple trial types** - 7-day, 14-day, 30-day trials
- **Referral trials** - Extended trials for referrals

---

## Contact

For questions or issues with this implementation:
- Review this documentation
- Check Convex dashboard for subscription data
- Test with migration script
- Verify API responses manually
