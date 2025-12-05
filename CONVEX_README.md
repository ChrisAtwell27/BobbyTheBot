# 🚀 Convex Migration for BobbyTheBot

This bot has been set up to migrate from MongoDB Atlas to Convex with **per-guild data isolation**.

## ✨ What is Convex?

Convex is a modern backend platform that replaces traditional databases with:
- **Type-safe** TypeScript functions
- **Real-time** subscriptions
- **Automatic** scaling and optimization
- **Built-in** cron jobs and scheduling
- **Developer-friendly** dashboard and tools

## 📦 What's Included

This migration setup includes everything you need:

### Core Files
- ✅ **Convex Schema** (`convex/schema.ts`) - Database structure with 8 tables
- ✅ **76 Convex Functions** - All queries and mutations ready to use
- ✅ **Migration Script** - Automated MongoDB → Convex data transfer
- ✅ **Client Wrapper** - Easy-to-use connection manager
- ✅ **Helper Functions** - Drop-in replacements for MongoDB helpers

### Documentation
- 📖 [Migration Plan](docs/CONVEX_MIGRATION_PLAN.md) - Overall strategy
- 📖 [Setup Guide](docs/CONVEX_SETUP_GUIDE.md) - Step-by-step instructions
- 📖 [Quick Reference](docs/CONVEX_QUICK_REFERENCE.md) - Developer cheat sheet
- 📖 [Migration Summary](docs/CONVEX_MIGRATION_SUMMARY.md) - Complete overview

## 🎯 Quick Start

### 1. Install Convex

```bash
npm install convex
```

### 2. Initialize Convex Project

```bash
npx convex dev
```

This will:
- Create a Convex account (or log you in)
- Set up your project
- Give you a `CONVEX_URL` for your `.env` file
- Generate TypeScript definitions

### 3. Add Environment Variable

Add to your `.env` file:

```env
CONVEX_URL=https://your-project.convex.cloud
```

### 4. Deploy Convex Functions

```bash
npx convex deploy
```

### 5. Migrate Your Data

```bash
# For a specific guild
node scripts/migrateToConvex.js YOUR_GUILD_ID

# Or use "default" for testing
node scripts/migrateToConvex.js default
```

### 6. Verify in Dashboard

Go to https://dashboard.convex.dev and check your data!

## 📊 Per-Guild Data Isolation

Each guild gets its own logically separated data:

```javascript
// Guild A's data
await client.query(api.users.getBalance, {
  guildId: '123456',
  userId: 'user123'
});

// Guild B's data (completely separate)
await client.query(api.users.getBalance, {
  guildId: '789012',
  userId: 'user123'
});
```

## 🔄 Migration Strategy

### Recommended: Dual-Write Approach

1. **Keep MongoDB running** (backup)
2. **Migrate data to Convex**
3. **Write to both** MongoDB and Convex
4. **Read from Convex** for new features
5. **Monitor for 7-14 days**
6. **Remove MongoDB** when confident

### Alternative: Big Bang Migration

1. **Schedule maintenance window**
2. **Run migration script**
3. **Switch to Convex**
4. **Monitor closely**

## 📁 File Structure

```
BobbyTheBot/
├── convex/
│   ├── schema.ts              # Database schema
│   ├── users.ts               # User functions (16)
│   ├── bounties.ts            # Bounty functions (11)
│   ├── challenges.ts          # Challenge functions (5)
│   ├── teams.ts               # Team functions (7)
│   ├── trivia.ts              # Trivia functions (6)
│   ├── wordle.ts              # Wordle functions (8)
│   ├── servers.ts             # Server functions (7)
│   ├── subscriptions.ts       # Subscription functions (8)
│   ├── crons.ts               # Cron jobs
│   ├── tsconfig.json          # TypeScript config
│   └── _generated/            # Auto-generated (by Convex)
│
├── database/
│   ├── convexClient.js        # Convex connection manager
│   └── helpers/
│       └── convexEconomyHelpers.js  # Economy wrapper
│
├── scripts/
│   └── migrateToConvex.js     # Migration script
│
└── docs/
    ├── CONVEX_MIGRATION_PLAN.md
    ├── CONVEX_SETUP_GUIDE.md
    ├── CONVEX_QUICK_REFERENCE.md
    └── CONVEX_MIGRATION_SUMMARY.md
```

## 🛠️ Key Differences from MongoDB

| Feature | MongoDB | Convex |
|---------|---------|--------|
| **Connection** | Persistent connection pool | HTTP/WebSocket calls |
| **Queries** | Flexible query language | TypeScript functions |
| **Real-time** | Change streams | Built-in subscriptions |
| **Schema** | Optional (Mongoose enforces) | Required (TypeScript) |
| **Dates** | `Date` objects | `number` timestamps |
| **TTL** | TTL indexes | Cron jobs |
| **Guild isolation** | Manual filtering | Built-in to queries |

## 📝 Example Usage

### Before (MongoDB)

```javascript
const User = require('./database/models/User');

// Get balance
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
const guildId = interaction.guildId;

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

## 🎨 Convex Dashboard Features

Access at https://dashboard.convex.dev:

- **Data Browser** - View and edit all tables
- **Functions** - Test queries/mutations directly
- **Logs** - Real-time function execution logs
- **Usage** - Monitor performance and costs
- **Deployments** - Version history and rollback

## ⚡ Performance Benefits

- **No connection pool management** - Convex handles it
- **Automatic query optimization** - Smart indexing
- **Real-time subscriptions** - Live data updates
- **Edge caching** - Global CDN for fast access
- **Automatic scaling** - Handles traffic spikes

## 💰 Cost Estimate

Convex pricing is usage-based:

- **Free Tier**: 1GB storage, 1M function calls/month
- **Hobby Tier** ($25/mo): 8GB storage, 10M calls/month
- **Pro Tier**: Custom pricing for larger bots

Typical Discord bot with 1,000 users:
- ~100MB storage
- ~500K function calls/month
- **Fits in Free Tier!**

## 🚨 Troubleshooting

### "CONVEX_URL not found"
Run `npx convex dev` and add the URL to `.env`

### "Cannot find module api"
Run `npx convex dev` to generate TypeScript definitions

### Migration timeouts
Reduce `BATCH_SIZE` in `scripts/migrateToConvex.js`

### Data looks wrong
Verify `guildId` is being passed correctly to all functions

## 📚 Learn More

- **Convex Docs**: https://docs.convex.dev
- **Convex Discord**: https://convex.dev/community
- **TypeScript Guide**: https://www.typescriptlang.org/docs
- **Migration Plan**: [docs/CONVEX_MIGRATION_PLAN.md](docs/CONVEX_MIGRATION_PLAN.md)

## ✅ Migration Checklist

- [ ] Install Convex: `npm install convex`
- [ ] Initialize project: `npx convex dev`
- [ ] Add `CONVEX_URL` to `.env`
- [ ] Deploy functions: `npx convex deploy`
- [ ] Run migration script for each guild
- [ ] Verify data in Convex dashboard
- [ ] Update event handlers to use Convex
- [ ] Update command handlers to use Convex
- [ ] Test all bot features
- [ ] Monitor for 7-14 days
- [ ] Remove MongoDB code (optional)

## 🤝 Support

Need help?

1. Check the [Setup Guide](docs/CONVEX_SETUP_GUIDE.md)
2. Review the [Quick Reference](docs/CONVEX_QUICK_REFERENCE.md)
3. Join [Convex Discord](https://convex.dev/community)
4. Check Convex logs in the dashboard

## 🎉 Benefits Summary

- ✅ **Per-guild data isolation** - Complete separation
- ✅ **Type safety** - Catch errors at compile time
- ✅ **Real-time updates** - Live leaderboards, balances
- ✅ **Better developer experience** - Dashboard, logs, testing
- ✅ **Automatic scaling** - No manual tuning
- ✅ **Built-in features** - Cron jobs, subscriptions
- ✅ **Cost-effective** - Free tier for most bots

---

**Ready to migrate?** Start with the [Setup Guide](docs/CONVEX_SETUP_GUIDE.md)!
