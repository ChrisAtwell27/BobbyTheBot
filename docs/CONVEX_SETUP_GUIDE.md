# Convex Setup Guide for BobbyTheBot

## Prerequisites

- Node.js 18+ installed
- Existing MongoDB Atlas database with data
- Convex account (sign up at https://convex.dev)

## Step 1: Install Dependencies

```bash
npm install convex
```

## Step 2: Initialize Convex Project

1. Run the Convex dev server to set up your project:

```bash
npx convex dev
```

2. Follow the prompts:
   - Create a new Convex account or log in
   - Create a new project or select existing
   - The CLI will create a `convex/` directory and generate TypeScript definitions

3. The CLI will provide you with a `CONVEX_URL`. Copy this for the next step.

## Step 3: Configure Environment Variables

Add to your `.env` file:

```env
# Convex Configuration
CONVEX_URL=https://your-project.convex.cloud

# Keep MongoDB for now (backup during migration)
MONGODB_URI=mongodb+srv://...
```

## Step 4: Deploy Convex Functions

Deploy your Convex schema and functions:

```bash
npx convex deploy
```

This will:
- Deploy the schema definitions from `convex/schema.ts`
- Deploy all query and mutation functions
- Set up cron jobs for cleanup tasks

## Step 5: Run Migration Script

Migrate your data from MongoDB to Convex:

```bash
# For a specific guild
node scripts/migrateToConvex.js YOUR_GUILD_ID

# For default guild
node scripts/migrateToConvex.js
```

The script will:
- Connect to both MongoDB and Convex
- Migrate all data collections
- Provide progress updates
- Report any failures

**Expected output:**
```
🚀 Starting MongoDB to Convex migration...

📍 Using guild ID: 123456789

🔌 Connecting to MongoDB...
✅ Connected to MongoDB
🔌 Connecting to Convex...
✅ Connected to Convex

📦 Migrating users for guild 123456789...
Found 150 users to migrate
  ✓ Migrated 10/150 users
  ✓ Migrated 20/150 users
  ...
✅ Users migration complete: 150 migrated, 0 failed

📦 Migrating bounties for guild 123456789...
Found 25 bounties to migrate
✅ Bounties migration complete: 25 migrated, 0 failed

...

✅ Migration completed successfully!
```

## Step 6: Verify Data in Convex Dashboard

1. Go to your Convex dashboard at https://dashboard.convex.dev
2. Select your project
3. Navigate to "Data" tab
4. Verify tables contain expected data:
   - `users`
   - `bounties`
   - `challenges`
   - `teamHistories`
   - `triviaSessions`
   - `wordleScores`
   - `wordleMonthlyWinners`
   - `servers`
   - `subscriptions`

## Step 7: Update Bot Code (Optional - Manual Migration)

If you want to gradually migrate your bot code:

### Option A: Keep MongoDB helpers, add Convex alongside

```javascript
// Use both systems temporarily
const mongoEconomyHelpers = require('./database/helpers/economyHelpers');
const convexEconomyHelpers = require('./database/helpers/convexEconomyHelpers');

// Write to both
await mongoEconomyHelpers.updateBalance(userId, amount);
await convexEconomyHelpers.updateBalance(guildId, userId, amount);

// Read from Convex
const balance = await convexEconomyHelpers.getBalance(guildId, userId);
```

### Option B: Switch to Convex entirely

Replace all MongoDB helper imports:

```javascript
// Old
const { updateBalance } = require('./database/helpers/economyHelpers');

// New
const { updateBalance } = require('./database/helpers/convexEconomyHelpers');

// Update function calls to include guildId
const guildId = interaction.guildId;
await updateBalance(guildId, userId, amount);
```

## Step 8: Update index.js

Replace MongoDB connection with Convex:

```javascript
// Old
const { connectToDatabase } = require('./database/connection');

// New
const { getConvexClient } = require('./database/convexClient');

// In your startup code
// Old
await connectToDatabase();

// New
getConvexClient(); // Initializes the client
```

## Step 9: Testing

Test all bot features thoroughly:

- [ ] Economy commands (balance, give, leaderboard)
- [ ] Pet commands (adopt, feed, play)
- [ ] Bounty system (create, claim, list)
- [ ] Challenges (RPS, higher card, gladiator)
- [ ] Valorant teams (create, join, history)
- [ ] Trivia games
- [ ] Wordle scores
- [ ] All gambling games

## Step 10: Monitor and Rollback Plan

### Monitoring

Watch for errors in your bot logs:
```bash
# Look for Convex-related errors
grep -i "convex\|error" bot.log
```

Monitor Convex dashboard:
- Check "Logs" tab for function errors
- Monitor "Usage" tab for performance
- Review "Functions" tab for failed executions

### Rollback Plan

If you need to rollback to MongoDB:

1. Keep `MONGODB_URI` in your `.env`
2. Switch back to MongoDB helpers:
   ```javascript
   // Revert to MongoDB helpers
   const helpers = require('./database/helpers/economyHelpers');
   ```
3. Your MongoDB data is still intact (you didn't delete it)

### When to Fully Commit

After 7-14 days of stable operation:
- All features working correctly
- No data inconsistencies
- Performance acceptable
- No major errors in Convex logs

Then you can:
- Remove MongoDB connection code
- Cancel MongoDB Atlas subscription (optional)
- Delete old MongoDB helper files

## Multi-Guild Setup

If you have multiple guilds, you need to migrate each separately:

```bash
# Migrate guild 1
node scripts/migrateToConvex.js 123456789

# Migrate guild 2
node scripts/migrateToConvex.js 987654321

# Migrate guild 3
node scripts/migrateToConvex.js 555555555
```

Each guild will have isolated data in Convex with the same table structure.

## Common Issues

### Issue: "CONVEX_URL not found"
**Solution:** Run `npx convex dev` and add the URL to your `.env` file

### Issue: "Cannot find module api"
**Solution:** Run `npx convex dev` to generate TypeScript definitions

### Issue: Migration fails with "Timeout"
**Solution:**
- Reduce `BATCH_SIZE` in migration script
- Run migrations for smaller subsets of data
- Check Convex function execution limits

### Issue: "Duplicate key error"
**Solution:**
- Clear Convex tables in dashboard
- Re-run migration
- Check for duplicate data in MongoDB

### Issue: Data looks different in Convex
**Solution:**
- Verify `guildId` is being passed correctly
- Check date conversions (Date objects → timestamps)
- Review Map conversions (Map → Object)

## Performance Considerations

### Query Optimization

Convex automatically optimizes queries, but you should:
- Use indexes defined in `schema.ts`
- Avoid large data scans
- Paginate results for large datasets

### Function Limits

- Max execution time: 10 seconds
- Use pagination for large operations
- Break up batch operations

### Real-time Updates

Convex supports real-time subscriptions:

```javascript
// Subscribe to balance changes
const unsubscribe = client.subscribe(
  api.users.getBalance,
  { guildId, userId },
  (balance) => {
    console.log('New balance:', balance);
  }
);

// Later, unsubscribe
unsubscribe();
```

## Cost Estimation

Convex pricing is based on:
- Database storage
- Bandwidth
- Function executions

For a typical Discord bot:
- **Free tier**: Up to 1GB storage, 1M function calls/month
- **Hobby tier** ($25/mo): Up to 8GB storage, 10M function calls/month
- **Pro tier**: Custom pricing for larger bots

Estimate your usage at: https://www.convex.dev/pricing

## Support

If you encounter issues:
1. Check Convex documentation: https://docs.convex.dev
2. Join Convex Discord: https://convex.dev/community
3. Review bot logs for specific errors
4. Check the migration script output for failed records

## Next Steps

After successful migration:
1. ✅ Data migrated to Convex
2. ✅ Bot running on Convex
3. ✅ MongoDB kept as backup
4. 📋 Monitor for 7-14 days
5. 📋 Update all command handlers
6. 📋 Update all event handlers
7. 📋 Remove MongoDB code
8. 📋 Cancel MongoDB subscription (optional)
