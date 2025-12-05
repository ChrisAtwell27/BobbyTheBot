# Simplified Convex Migration Guide

## TL;DR

**The data structure is exactly the same as MongoDB!** You're just moving from MongoDB to Convex with:
- ✅ Same table partitioning by `guildId`
- ✅ TypeScript type safety
- ✅ Real-time updates
- ✅ Better developer tools

**Migration is a single command:**
```bash
node scripts/migrateToConvex.js
```

---

## Why This Is Simple

### MongoDB Structure (Current)
```
users collection:
  - { guildId: "123", userId: "user1", balance: 1000 }
  - { guildId: "123", userId: "user2", balance: 500 }
  - { guildId: "456", userId: "user1", balance: 2000 }
```

### Convex Structure (Target)
```
users table:
  - { guildId: "123", userId: "user1", balance: 1000 }
  - { guildId: "123", userId: "user2", balance: 500 }
  - { guildId: "456", userId: "user1", balance: 2000 }
```

**It's the same!** Just different technology underneath.

---

## Quick Start (5 Steps)

### 1. Initialize Convex

```bash
npx convex dev
```

Follow the prompts to:
- Create/login to Convex account
- Create a new project
- Get your `CONVEX_URL`

### 2. Add to `.env`

```env
CONVEX_URL=https://your-project.convex.cloud
```

### 3. Deploy Functions

```bash
npx convex deploy
```

This uploads all the pre-built query/mutation functions.

### 4. Run Migration

```bash
node scripts/migrateToConvex.js
```

This migrates **all** your data from MongoDB to Convex in one go.

### 5. Verify Data

Go to https://dashboard.convex.dev and check your tables!

---

## What Changes in Your Code?

### Before (MongoDB)
```javascript
const User = require('./database/models/User');

// Get user
const user = await User.findOne({ userId: '123' });
const balance = user?.balance || 0;

// Update balance
user.balance += 100;
await user.save();
```

### After (Convex)
```javascript
const { getConvexClient } = require('./database/convexClient');
const { api } = require('./convex/_generated/api');

const client = getConvexClient();
const guildId = interaction.guildId; // Get from Discord interaction

// Get balance
const balance = await client.query(api.users.getBalance, {
  guildId,
  userId: '123'
});

// Update balance
await client.mutation(api.users.updateBalance, {
  guildId,
  userId: '123',
  amount: 100
});
```

**Key difference:** You now explicitly pass `guildId` to every function (instead of it being implicit in your queries).

---

## Guild ID Partitioning

### How It Works

All guilds share the same tables, but queries are automatically filtered by `guildId`:

```javascript
// Guild A's data
await client.query(api.users.getBalance, {
  guildId: '123456789',
  userId: 'user1'
});
// Returns Guild A's balance for user1

// Guild B's data (completely separate)
await client.query(api.users.getBalance, {
  guildId: '987654321',
  userId: 'user1'
});
// Returns Guild B's balance for user1
```

### Why It's Fast

Convex tables have compound indexes:
- `by_guild_and_user` for user lookups
- `by_guild_and_balance` for leaderboards
- `by_guild_and_status` for filtering

These indexes make queries lightning-fast even with millions of records across all guilds.

---

## Common Questions

### Q: Do I need to migrate each guild separately?
**A:** No! One migration command handles all guilds.

### Q: Will Guild A's data mix with Guild B's data?
**A:** No! Each query requires `guildId`, so data is isolated by design.

### Q: What if I forget to pass `guildId`?
**A:** Convex will throw a validation error - you can't accidentally query the wrong guild.

### Q: Is this slower than separate databases?
**A:** No! Indexes make it just as fast (or faster) than MongoDB.

### Q: Can I still use MongoDB during migration?
**A:** Yes! Keep both running, migrate data, then switch over once tested.

---

## Testing After Migration

Test these key features:

```bash
# Economy
/balance              # Check user balance
/leaderboard          # Check leaderboard
/give @user 100       # Transfer money

# Pets
/pet adopt            # Adopt a pet
/pet status           # Check pet stats

# Bounties
/bounty create        # Create a bounty
/bounty list          # List bounties

# Gambling
/blackjack 100        # Play blackjack
/rps @user 50         # Play RPS
```

---

## Troubleshooting

### Error: "CONVEX_URL not found"
Run `npx convex dev` and add the URL to `.env`

### Error: "Cannot find module '_generated/api'"
Run `npx convex dev` to generate TypeScript files

### Error: "guildId is required"
Add `guildId` parameter to your function calls:
```javascript
const guildId = interaction.guildId || message.guildId;
```

### Migration hangs or times out
Reduce `BATCH_SIZE` in `scripts/migrateToConvex.js` from 50 to 25

---

## What You Get

- ✅ **Same data structure** - No complex reorganization
- ✅ **Type safety** - Catch errors at compile time
- ✅ **Real-time updates** - Live leaderboards, balance updates
- ✅ **Better tooling** - Dashboard for viewing/editing data
- ✅ **Automatic scaling** - No connection pool management
- ✅ **Built-in cron jobs** - Scheduled cleanup tasks
- ✅ **Cost-effective** - Free tier for most Discord bots

---

## Next Steps

1. ✅ Run `npx convex dev`
2. ✅ Add `CONVEX_URL` to `.env`
3. ✅ Deploy functions: `npx convex deploy`
4. ✅ Run migration: `node scripts/migrateToConvex.js`
5. ✅ Verify data in dashboard
6. 📋 Update event handlers to use Convex
7. 📋 Test all features thoroughly
8. 📋 Monitor for 7-14 days
9. 📋 Remove MongoDB code (optional)

---

**Questions?** Check the full [Setup Guide](CONVEX_SETUP_GUIDE.md) or [Quick Reference](CONVEX_QUICK_REFERENCE.md).
