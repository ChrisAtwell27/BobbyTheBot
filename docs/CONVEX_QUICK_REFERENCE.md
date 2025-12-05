# Convex Quick Reference

## Key Differences from MongoDB

| Operation | MongoDB | Convex |
|-----------|---------|--------|
| **Get User** | `User.findOne({ userId })` | `client.query(api.users.getUser, { guildId, userId })` |
| **Update Balance** | `user.balance += 100; user.save()` | `client.mutation(api.users.updateBalance, { guildId, userId, amount: 100 })` |
| **Get Top 10** | `User.find().sort({ balance: -1 }).limit(10)` | `client.query(api.users.getTopBalances, { guildId, limit: 10 })` |
| **Create Bounty** | `Bounty.create({ ... })` | `client.mutation(api.bounties.createBounty, { guildId, ... })` |
| **Delete Bounty** | `Bounty.deleteOne({ bountyId })` | `client.mutation(api.bounties.deleteBounty, { bountyId })` |

## Common Patterns

### 1. Getting Data (Queries)

```javascript
const { getConvexClient } = require('./database/convexClient');
const { api } = require('./convex/_generated/api');

const client = getConvexClient();
const guildId = interaction.guildId;

// Get user
const user = await client.query(api.users.getUser, { guildId, userId });

// Get balance
const balance = await client.query(api.users.getBalance, { guildId, userId });

// Get leaderboard
const top10 = await client.query(api.users.getTopBalances, { guildId, limit: 10 });
```

### 2. Updating Data (Mutations)

```javascript
const client = getConvexClient();
const guildId = interaction.guildId;

// Update balance
await client.mutation(api.users.updateBalance, {
  guildId,
  userId,
  amount: 100, // Add 100
});

// Create bounty
await client.mutation(api.bounties.createBounty, {
  guildId,
  bountyId: 'unique-id',
  creatorId: userId,
  creatorName: username,
  description: 'Do something cool',
  reward: 1000,
  channelId: interaction.channelId,
  expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
});
```

### 3. Per-Guild Data Isolation

Every query/mutation requires `guildId`:

```javascript
// ❌ WRONG - No guild isolation
await client.query(api.users.getBalance, { userId });

// ✅ CORRECT - Guild-specific data
await client.query(api.users.getBalance, { guildId, userId });
```

### 4. Date Handling

Convex uses timestamps (numbers), not Date objects:

```javascript
// ❌ WRONG - Date object
expiresAt: new Date(Date.now() + 86400000)

// ✅ CORRECT - Timestamp
expiresAt: Date.now() + 86400000
```

### 5. Error Handling

```javascript
try {
  const balance = await client.query(api.users.getBalance, { guildId, userId });
  // Use balance
} catch (error) {
  console.error('Failed to get balance:', error);
  // Fallback behavior
}
```

## Available Functions

### Users (`api.users`)

**Queries:**
- `getUser(guildId, userId)` - Get user data
- `getBalance(guildId, userId)` - Get user balance
- `getTopBalances(guildId, limit?)` - Leaderboard
- `getUserRank(guildId, userId)` - User's rank
- `getTotalEconomy(guildId)` - Total server economy
- `getTopPets(guildId, limit?)` - Pet leaderboard
- `getAllValorantUsers(guildId)` - All Valorant users

**Mutations:**
- `upsertUser(guildId, userId, data?)` - Create/update user
- `updateBalance(guildId, userId, amount)` - Add/subtract balance
- `setBalance(guildId, userId, amount)` - Set exact balance
- `updatePet(guildId, userId, pet)` - Update pet data
- `deletePet(guildId, userId)` - Remove pet
- `updateValorant(guildId, userId, valorant)` - Update Valorant data
- `removeValorant(guildId, userId)` - Remove Valorant data
- `updateMemory(guildId, userId, memory)` - Update AI memory
- `updateActivity(guildId, userId, messageCount?, dailyMessageCount?)` - Track activity

### Bounties (`api.bounties`)

**Queries:**
- `getBounty(bountyId)` - Get specific bounty
- `getActiveBounties(guildId)` - All active bounties
- `getAllBounties(guildId)` - All bounties (any status)
- `getBountiesByCreator(guildId, creatorId)` - User's bounties
- `getExpiredBounties(guildId)` - Expired bounties

**Mutations:**
- `createBounty(guildId, bountyId, ...)` - Create new bounty
- `claimBounty(bountyId, claimedBy, claimedByName, proofUrl?)` - Claim bounty
- `cancelBounty(bountyId)` - Cancel bounty
- `expireBounties(guildId)` - Mark expired bounties
- `deleteAllGuildBounties(guildId)` - Clear all bounties
- `deleteBounty(bountyId)` - Delete specific bounty
- `updateBountyMessage(bountyId, messageId)` - Update message ID

### Challenges (`api.challenges`)

**Queries:**
- `getChallenge(challengeId)` - Get specific challenge
- `getAllChallenges(guildId)` - All guild challenges
- `getExpiredChallenges()` - Expired challenges (cleanup)

**Mutations:**
- `createChallenge(guildId, challengeId, type, ...)` - Create challenge
- `deleteChallenge(challengeId)` - Delete challenge
- `cleanupExpiredChallenges()` - Remove expired (cron job)

### Teams (`api.teams`)

**Queries:**
- `getTeam(teamId)` - Get specific team
- `getGuildTeams(guildId, limit?)` - Guild's teams
- `getUserTeams(guildId, userId, limit?)` - User's team history
- `getUserTeamStats(guildId, userId)` - User's team stats

**Mutations:**
- `saveTeamHistory(guildId, teamId, ...)` - Save team to history
- `updateMatchResult(teamId, matchResult, matchScore?, reportedBy)` - Update result
- `cleanupOldHistory(guildId, daysToKeep)` - Remove old teams

### Trivia (`api.trivia`)

**Queries:**
- `getSession(guildId)` - Get trivia session

**Mutations:**
- `upsertSession(guildId, ...)` - Create/update session
- `updateSessionToken(guildId, sessionToken)` - Update token
- `updateActiveQuestion(guildId, activeQuestion)` - Set active question
- `addQuestionToHistory(guildId, question)` - Add to history
- `clearSession(guildId)` - Reset session

### Wordle (`api.wordle`)

**Queries:**
- `getUserScores(guildId, userId)` - User's wordle scores
- `getAllScores(guildId)` - All guild scores
- `getLeaderboard(guildId, limit?)` - Wordle leaderboard
- `getMonthlyWinner(guildId, month)` - Specific month winner
- `getAllMonthlyWinners(guildId)` - All monthly winners

**Mutations:**
- `addScore(guildId, userId, score, honeyAwarded)` - Add new score
- `clearAllScores(guildId)` - Reset all scores
- `saveMonthlyWinner(guildId, month, winner, topTen, ...)` - Save monthly winner

### Servers (`api.servers`)

**Queries:**
- `getServer(guildId)` - Get server settings
- `getHouseBalance(guildId)` - Get house balance

**Mutations:**
- `upsertServer(guildId, houseBalance?, ...)` - Create/update server
- `updateHouseBalance(guildId, amount)` - Add/subtract house balance
- `setHouseBalance(guildId, amount)` - Set exact house balance
- `updateLastVotingDate(guildId, date)` - Update voting date
- `updateSettings(guildId, settings)` - Update server settings

### Subscriptions (`api.subscriptions`)

**Queries:**
- `getSubscription(discordId)` - Get subscription
- `getSubscriptionsByStatus(status)` - Filter by status
- `getSubscriptionsByTier(tier)` - Filter by tier
- `isSubscriptionValid(discordId)` - Check if valid

**Mutations:**
- `upsertSubscription(discordId, ...)` - Create/update subscription
- `addVerifiedGuild(discordId, guildId, guildName)` - Add verified guild
- `removeVerifiedGuild(discordId, guildId)` - Remove verified guild
- `updateVerificationCheck(discordId)` - Update check timestamp

## Migration Checklist

### For Each Event Handler

- [ ] Import Convex client and API
- [ ] Add `guildId` extraction from interaction/message
- [ ] Replace MongoDB queries with Convex queries
- [ ] Replace MongoDB mutations with Convex mutations
- [ ] Convert Date objects to timestamps
- [ ] Test thoroughly

### Example Migration

**Before (MongoDB):**
```javascript
const User = require('../database/models/User');

// Get balance
const user = await User.findOne({ userId });
const balance = user?.balance || 0;

// Update balance
user.balance += 100;
await user.save();
```

**After (Convex):**
```javascript
const { getConvexClient } = require('../database/convexClient');
const { api } = require('../convex/_generated/api');

const client = getConvexClient();
const guildId = interaction.guildId;

// Get balance
const balance = await client.query(api.users.getBalance, { guildId, userId });

// Update balance
await client.mutation(api.users.updateBalance, { guildId, userId, amount: 100 });
```

## Debugging Tips

### 1. Check Convex Dashboard Logs

Go to https://dashboard.convex.dev → Your Project → Logs

Look for:
- Failed function calls
- Error messages
- Slow queries

### 2. Add Logging to Convex Functions

Edit `convex/users.ts` (or other files):

```typescript
export const getBalance = query({
  args: { guildId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    console.log('Getting balance for', args);
    const user = await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId).eq("userId", args.userId)
      )
      .first();
    console.log('Found user:', user);
    return user?.balance ?? 0;
  },
});
```

### 3. Test Individual Functions

Use Convex dashboard's "Functions" tab to test queries/mutations directly.

### 4. Check Environment Variables

```bash
# Verify CONVEX_URL is set
echo $CONVEX_URL  # Linux/Mac
echo %CONVEX_URL%  # Windows cmd
$env:CONVEX_URL    # Windows PowerShell
```

## Performance Tips

### 1. Use Indexes

Queries are fast when they use indexes defined in `schema.ts`:

```typescript
// ✅ FAST - Uses index
.withIndex("by_guild_and_user", (q) =>
  q.eq("guildId", guildId).eq("userId", userId)
)

// ❌ SLOW - Full table scan
.filter((q) =>
  q.eq(q.field("guildId"), guildId) && q.eq(q.field("userId"), userId)
)
```

### 2. Limit Results

Always paginate large datasets:

```javascript
// ✅ GOOD - Limited results
const top10 = await client.query(api.users.getTopBalances, {
  guildId,
  limit: 10
});

// ❌ BAD - All users
const allUsers = await client.query(api.users.getTopBalances, {
  guildId,
  limit: 10000
});
```

### 3. Batch Operations

Group related mutations:

```javascript
// ✅ GOOD - Single mutation
await client.mutation(api.users.upsertUser, {
  guildId,
  userId,
  data: { balance: 1000, pet: petData, valorant: valorantData }
});

// ❌ BAD - Multiple mutations
await client.mutation(api.users.setBalance, { guildId, userId, amount: 1000 });
await client.mutation(api.users.updatePet, { guildId, userId, pet: petData });
await client.mutation(api.users.updateValorant, { guildId, userId, valorant: valorantData });
```

## Getting Help

1. **Convex Docs:** https://docs.convex.dev
2. **Convex Discord:** https://convex.dev/community
3. **Convex GitHub:** https://github.com/get-convex/convex-js
4. **This bot's docs:** Check `docs/` folder for more info
