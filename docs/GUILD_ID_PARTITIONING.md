# Guild ID Partitioning Strategy

## Overview

Your bot uses **guild ID partitioning** - all guilds share the same database tables, with data partitioned by a `guildId` field. This is the same strategy used by MongoDB, and Convex supports it perfectly.

## Architecture

### Shared Tables with Guild Partitioning

```
┌─────────────────────────────────────┐
│         USERS TABLE                 │
├──────────┬──────────┬──────────────┤
│ guildId  │ userId   │ balance      │
├──────────┼──────────┼──────────────┤
│ guild_A  │ user_1   │ 1000         │ ← Guild A's data
│ guild_A  │ user_2   │ 500          │ ← Guild A's data
│ guild_B  │ user_1   │ 2000         │ ← Guild B's data
│ guild_B  │ user_3   │ 750          │ ← Guild B's data
│ guild_C  │ user_1   │ 300          │ ← Guild C's data
└──────────┴──────────┴──────────────┘
```

**Key Points:**
- ✅ All guilds use the same `users` table
- ✅ Data is partitioned by `guildId` field
- ✅ Indexes on `guildId` ensure fast queries
- ✅ Each query explicitly specifies which guild's data to access

## How Queries Work

### Query Pattern

Every database operation requires a `guildId`:

```javascript
// Get Guild A's user
const user = await client.query(api.users.getUser, {
  guildId: 'guild_A',
  userId: 'user_1'
});
// Returns: { guildId: 'guild_A', userId: 'user_1', balance: 1000 }

// Get Guild B's user (different partition)
const user = await client.query(api.users.getUser, {
  guildId: 'guild_B',
  userId: 'user_1'
});
// Returns: { guildId: 'guild_B', userId: 'user_1', balance: 2000 }
```

### Index-Based Filtering

Convex uses compound indexes to quickly filter by `guildId`:

```typescript
// From schema.ts
users: defineTable({
  guildId: v.string(),
  userId: v.string(),
  balance: v.number(),
  // ... other fields
})
  .index("by_guild_and_user", ["guildId", "userId"])
  .index("by_guild_and_balance", ["guildId", "balance"])
```

When you query:
```javascript
await client.query(api.users.getUser, {
  guildId: 'guild_A',
  userId: 'user_1'
});
```

Convex uses the `by_guild_and_user` index to instantly find the record without scanning the entire table.

## Data Isolation

### Automatic Isolation

Data isolation is enforced at the query level:

```javascript
// Function definition (in convex/users.ts)
export const getUser = query({
  args: { guildId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_guild_and_user", (q) =>
        q.eq("guildId", args.guildId)  // ← Filters by guildId
         .eq("userId", args.userId)
      )
      .first();
  },
});
```

**You cannot accidentally query another guild's data** because:
1. `guildId` is a required parameter
2. All indexes filter by `guildId` first
3. TypeScript enforces parameter types

### Comparison to Alternatives

| Approach | Pros | Cons |
|----------|------|------|
| **Guild ID Partitioning** (Our approach) | Simple, scalable, same as MongoDB, easy to implement | Requires discipline to always pass guildId |
| **Separate Databases per Guild** | Complete isolation | Complex, expensive, hard to manage 1000s of guilds |
| **Separate Tables per Guild** | Good isolation | Not supported by Convex, requires dynamic schema |

## Performance

### Why It's Fast

1. **Compound Indexes**: `[guildId, userId]` lookups are O(log n)
2. **Prefix Scanning**: All queries start with `guildId`, using the index prefix
3. **No Full Table Scans**: Indexes prevent scanning millions of records

### Example Performance

With 1,000 guilds and 1,000 users per guild (1 million total records):

```javascript
// Get user balance (Guild A)
await client.query(api.users.getBalance, {
  guildId: 'guild_A',
  userId: 'user_1'
});
// ⚡ < 10ms (uses index)

// Get Guild A's leaderboard (top 10)
await client.query(api.users.getTopBalances, {
  guildId: 'guild_A',
  limit: 10
});
// ⚡ < 50ms (uses by_guild_and_balance index)
```

## Security

### Preventing Cross-Guild Data Access

1. **Required Parameters**: TypeScript enforces `guildId` parameter
2. **Index Filtering**: All queries filter by `guildId` first
3. **No Global Queries**: Cannot query all guilds at once (by design)

### Example: Secure Leaderboard

```javascript
// ✅ CORRECT - Guild-specific leaderboard
await client.query(api.users.getTopBalances, {
  guildId: interaction.guildId,  // From Discord interaction
  limit: 10
});
// Returns only Guild A's top 10 users

// ❌ IMPOSSIBLE - Cannot get global leaderboard
await client.query(api.users.getTopBalances, {
  // Missing guildId - TypeScript error!
  limit: 10
});
```

## Scalability

### Horizontal Scaling

Guild ID partitioning scales horizontally:

```
With 1 guild:
  - 1,000 users
  - 10 queries/sec

With 100 guilds:
  - 100,000 users
  - 1,000 queries/sec

With 10,000 guilds:
  - 10,000,000 users
  - 100,000 queries/sec

↓ Performance stays constant per guild ↓
Guild A's query time: ~10ms (regardless of total guilds)
```

**Why?** Indexes partition data by `guildId`, so query time depends only on:
- Number of users per guild (not total users)
- Number of queries per guild (not total queries)

### Convex's Auto-Scaling

Convex automatically handles:
- Load balancing across regions
- Caching hot data
- Index optimization
- Query parallelization

You don't manage servers, connections, or scaling.

## Migration from MongoDB

### No Restructuring Needed

Your MongoDB already uses guild ID partitioning:

```javascript
// MongoDB query
await User.findOne({ guildId: 'guild_A', userId: 'user_1' });

// Convex query (same structure!)
await client.query(api.users.getUser, {
  guildId: 'guild_A',
  userId: 'user_1'
});
```

The only difference is:
- MongoDB: Pass `guildId` in query filter
- Convex: Pass `guildId` as function parameter

### Migration Script

The migration script preserves the `guildId` field:

```javascript
// MongoDB document
{
  _id: ObjectId("..."),
  guildId: "guild_A",
  userId: "user_1",
  balance: 1000
}

// ↓ Migrates to ↓

// Convex document
{
  _id: "...",
  guildId: "guild_A",
  userId: "user_1",
  balance: 1000
}
```

**One migration handles all guilds** because they all go into the same tables.

## Best Practices

### 1. Always Extract Guild ID Early

```javascript
// ✅ GOOD - Extract once at the top
async function handleCommand(interaction) {
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  const balance = await client.query(api.users.getBalance, {
    guildId,
    userId
  });

  // ... use balance
}
```

### 2. Never Hardcode Guild ID

```javascript
// ❌ BAD - Hardcoded guild ID
const balance = await client.query(api.users.getBalance, {
  guildId: 'guild_A',  // Wrong!
  userId
});

// ✅ GOOD - Dynamic guild ID
const balance = await client.query(api.users.getBalance, {
  guildId: interaction.guildId,  // From Discord
  userId
});
```

### 3. Use TypeScript for Safety

```typescript
// TypeScript will catch missing guildId
const balance = await client.query(api.users.getBalance, {
  // Missing guildId - TypeScript error!
  userId: 'user_1'
});
```

### 4. Test with Multiple Guilds

Always test your bot in multiple guilds to ensure data isolation:

```javascript
// Test data isolation
const guild1Balance = await client.query(api.users.getBalance, {
  guildId: 'guild_1',
  userId: 'user_1'
});

const guild2Balance = await client.query(api.users.getBalance, {
  guildId: 'guild_2',
  userId: 'user_1'  // Same userId, different guild
});

// Should be different values!
console.assert(guild1Balance !== guild2Balance);
```

## Conclusion

Guild ID partitioning is:
- ✅ Simple to understand
- ✅ Easy to implement
- ✅ Scales horizontally
- ✅ Secure by design
- ✅ Same as MongoDB (no restructuring)

You're keeping the same data structure, just upgrading the technology underneath!
