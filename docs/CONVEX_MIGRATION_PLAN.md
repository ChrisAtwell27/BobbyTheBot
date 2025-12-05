# MongoDB to Convex Migration Plan

## Overview
Migrating from MongoDB Atlas to Convex with **guild ID partitioning**. All guilds share the same tables, with data partitioned by `guildId` field and indexed for performance.

## Architecture Changes

### Current (MongoDB)
- Single database with collections: `users`, `bounties`, `challenges`, etc.
- Guild data distinguished by `guildId` field
- All guilds share the same collections

### Target (Convex) - **SAME APPROACH, BETTER IMPLEMENTATION**
- Single set of tables shared across all guilds
- Guild data distinguished by `guildId` field (same as MongoDB)
- Indexes on `guildId` for fast queries
- TypeScript type safety and real-time updates

**Key Insight:** The data structure is the same! We're just moving from MongoDB to Convex with better type safety and tooling.

## Table Structure

### Shared Tables (All Guilds)

All these tables contain data for ALL guilds, partitioned by `guildId`:

1. **users** - User data with economy, pets, stats
2. **bounties** - Active and historical bounties
3. **challenges** - Gambling challenges (with TTL via cron)
4. **teamHistories** - Valorant team records
5. **triviaSessions** - Trivia game state
6. **wordleScores** - Wordle scores
7. **wordleMonthlyWinners** - Wordle monthly leaderboards
8. **servers** - Server settings
9. **subscriptions** - Subscription management (global, no guildId needed)

## Implementation Steps

### 1. Setup Convex (✓ = Complete)
- [ ] Install Convex CLI: `npm install convex`
- [ ] Initialize Convex project: `npx convex dev`
- [ ] Configure deployment URLs
- [ ] Set up environment variables

### 2. Schema Definition
- [ ] Create `convex/schema.ts` with all table schemas
- [ ] Define indexes for performance
- [ ] Set up validators for data integrity

### 3. Helper Functions
- [ ] Create `convex/lib/` directory for utilities
- [ ] Port economy helpers to Convex queries/mutations
- [ ] Port pet helpers to Convex queries/mutations
- [ ] Port team history helpers
- [ ] Port Valorant helpers
- [ ] Port server helpers

### 4. Query/Mutation Files
Create Convex functions for each domain:
- [ ] `convex/users.ts` - User CRUD operations
- [ ] `convex/bounties.ts` - Bounty management
- [ ] `convex/challenges.ts` - Challenge tracking
- [ ] `convex/teams.ts` - Team history
- [ ] `convex/trivia.ts` - Trivia sessions
- [ ] `convex/wordle.ts` - Wordle scores
- [ ] `convex/economy.ts` - Economy operations

### 5. Migration Script
- [ ] Create `scripts/migrateToConvex.js`
- [ ] Fetch all MongoDB data
- [ ] Transform data to Convex format
- [ ] Batch insert into Convex per guild
- [ ] Verify data integrity

### 6. Update Application Code
Event handlers to update:
- [ ] askHandler.js
- [ ] birthdayHandler.js
- [ ] bountyHandler.js
- [ ] blackjackHandler.js
- [ ] gamblingHandler.js
- [ ] russianRouletteHandler.js
- [ ] wordleHandler.js
- [ ] triviaHandler.js
- [ ] valorantTeamHandler.js
- [ ] rawValorantTeamHandler.js
- [ ] eggbuckHandler.js
- [ ] kothHandler.js
- [ ] mafiaHandler.js

Command files to update:
- [ ] All economy commands
- [ ] Pet commands
- [ ] Bounty commands
- [ ] Team commands
- [ ] Wordle commands

### 7. Testing
- [ ] Test per-guild data isolation
- [ ] Verify all CRUD operations
- [ ] Test leaderboards
- [ ] Test TTL for challenges
- [ ] Performance testing

### 8. Deployment
- [ ] Deploy Convex functions
- [ ] Update environment variables
- [ ] Run migration script
- [ ] Monitor for errors
- [ ] Keep MongoDB as backup initially

## Key Differences: MongoDB vs Convex

| Feature | MongoDB | Convex |
|---------|---------|--------|
| **Connection** | Mongoose with connection pooling | HTTP/WebSocket, no persistent connection |
| **Schema** | Optional (enforced by Mongoose) | TypeScript schema required |
| **Queries** | Flexible query language | TypeScript functions |
| **Indexes** | Manual index creation | Defined in schema |
| **Transactions** | Supported | Automatic per-function |
| **Real-time** | Change streams | Built-in subscriptions |
| **TTL** | TTL indexes | Scheduled functions |
| **Validation** | Schema validators | TypeScript + validators |

## Guild ID Handling

### Extracting Guild ID
```javascript
// In Discord.js events
const guildId = interaction.guildId || message.guildId;

// In helper functions
function getTableName(guildId, baseTable) {
  return `guild_${guildId}_${baseTable}`;
}
```

### Table Name Convention
- Format: `guild_{guildId}_{tableName}`
- Example: `guild_123456789_users`
- Sanitize guild IDs to ensure valid table names

## Data Migration Strategy

### Phase 1: Dual Write (Recommended)
1. Keep MongoDB connection active
2. Write to both MongoDB and Convex
3. Validate data consistency
4. Switch reads to Convex gradually
5. Remove MongoDB once stable

### Phase 2: Big Bang Migration (Faster)
1. Schedule maintenance window
2. Export all MongoDB data
3. Transform and import to Convex
4. Switch application to Convex
5. Verify and monitor

## Rollback Plan
- Keep MongoDB Atlas subscription active for 30 days
- Maintain export scripts for quick rollback
- Monitor error rates closely
- Have toggle to switch back to MongoDB if needed

## Performance Considerations
- Convex has limits on function execution time (10s)
- Large batch operations may need pagination
- Indexes are crucial for leaderboards
- Consider caching for frequently accessed data

## Security
- Use Convex environment variables for secrets
- Implement proper authentication
- Validate all inputs in mutations
- Use Convex auth if needed for user verification
