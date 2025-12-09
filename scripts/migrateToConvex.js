require('dotenv').config();
const { ConvexHttpClient } = require('convex/browser');
const mongoose = require('mongoose');
const { api } = require('../convex/_generated/api');

// Import MongoDB models
const User = require('../database/models/User');
const Bounty = require('../database/models/Bounty');
const Challenge = require('../database/models/Challenge');
const TeamHistory = require('../database/models/TeamHistory');
const TriviaSession = require('../database/models/TriviaSession');
const WordleScore = require('../database/models/WordleScore');
const WordleMonthlyWinner = require('../database/models/WordleMonthlyWinner');
const Server = require('../database/models/Server');
const Subscription = require('../database/models/Subscription');

/**
 * ============================================================================
 * ONE-TIME MIGRATION SCRIPT: MongoDB to Convex
 * ============================================================================
 *
 * IMPORTANT: This script is for HISTORICAL MIGRATION PURPOSES ONLY.
 *
 * This script was used to migrate data from MongoDB to Convex during the
 * database transition. It intentionally reads from MongoDB and writes to
 * Convex.
 *
 * DO NOT use this script for ongoing operations. The bot and API now use
 * Convex exclusively as the database backend.
 *
 * The MongoDB references in this file are intentional - they are needed
 * to read the source data during migration.
 *
 * Migration Strategy: Guild ID Partitioning
 *   - All guilds share the same Convex tables
 *   - Data partitioned by guildId field (same as MongoDB)
 *   - Single migration handles all guilds
 *
 * Usage: node scripts/migrateToConvex.js
 *
 * ============================================================================
 */

const BATCH_SIZE = 50; // Process in batches to avoid timeouts

async function connectToMongoDB() {
  console.log('🔌 Connecting to MongoDB...');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    throw error;
  }
}

function getConvexClient() {
  console.log('🔌 Connecting to Convex...');
  const convexUrl = process.env.CONVEX_URL;

  if (!convexUrl) {
    throw new Error('❌ CONVEX_URL not found in environment variables');
  }

  const client = new ConvexHttpClient(convexUrl);
  console.log('✅ Connected to Convex');
  return client;
}

/**
 * Convert MongoDB Date to timestamp
 */
function dateToTimestamp(date) {
  if (!date) return undefined;
  return date instanceof Date ? date.getTime() : date;
}

/**
 * Convert Map to plain object
 */
function mapToObject(map) {
  if (!map) return undefined;
  if (map instanceof Map) {
    return Object.fromEntries(map);
  }
  return map;
}

/**
 * Recursively convert all Date objects to timestamps in an object
 */
function convertDatesToTimestamps(obj) {
  if (!obj) return obj;
  if (obj instanceof Date) return obj.getTime();
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(convertDatesToTimestamps);

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = convertDatesToTimestamps(value);
  }
  return result;
}

/**
 * Migrate users from MongoDB to Convex
 */
async function migrateUsers(client) {
  console.log(`\n📦 Migrating users...`);

  try {
    const users = await User.find({}).lean();
    console.log(`Found ${users.length} users to migrate`);

    let migrated = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      for (const user of batch) {
        try {
          // Use actual guild ID from your server
          const guildId = user.guildId || '701308904877064193';

          // Convert MongoDB document to Convex format
          const convexUser = {
            guildId,
            userId: user.userId,
            balance: user.balance || 0,
            memory: user.memory,
            personalityScore: user.personalityScore,
            messageCount: user.messageCount,
            lastActive: dateToTimestamp(user.lastActive),
            dailyMessageCount: user.dailyMessageCount,
            lastDailyReset: dateToTimestamp(user.lastDailyReset),
            // Legacy fields - convert all nested dates to timestamps
            pet: convertDatesToTimestamps(user.pet),
            birthday: convertDatesToTimestamps(user.birthday),
            valorant: convertDatesToTimestamps(user.valorant),
            gladiatorStats: user.gladiatorStats || user.arenaStats, // arenaStats is the old name
            mafiaStats: user.mafiaStats,
            createdAt: dateToTimestamp(user.createdAt) || Date.now(),
            updatedAt: dateToTimestamp(user.updatedAt) || Date.now(),
          };

          // Remove undefined fields
          Object.keys(convexUser).forEach(key =>
            convexUser[key] === undefined && delete convexUser[key]
          );

          await client.mutation(api.users.upsertUser, {
            guildId: convexUser.guildId,
            userId: convexUser.userId,
            data: convexUser,
          });

          migrated++;
        } catch (error) {
          console.error(`  ✗ Failed to migrate user ${user.userId}:`, error.message);
          failed++;
        }
      }

      console.log(`  ✓ Progress: ${Math.min(i + BATCH_SIZE, users.length)}/${users.length} users processed`);
    }

    console.log(`✅ Users migration complete: ${migrated} migrated, ${failed} failed`);
    return { migrated, failed };
  } catch (error) {
    console.error('❌ Error migrating users:', error);
    throw error;
  }
}

/**
 * Migrate bounties from MongoDB to Convex
 */
async function migrateBounties(client) {
  console.log(`\n📦 Migrating bounties...`);

  try {
    const bounties = await Bounty.find({}).lean();
    console.log(`Found ${bounties.length} bounties to migrate`);

    let migrated = 0;
    let failed = 0;

    for (const bounty of bounties) {
      try {
        await client.mutation(api.bounties.createBounty, {
          guildId: bounty.guildId,
          bountyId: bounty.bountyId,
          creatorId: bounty.creatorId,
          creatorName: bounty.creatorName,
          description: bounty.description,
          reward: bounty.reward,
          channelId: bounty.channelId,
          expiresAt: dateToTimestamp(bounty.expiresAt),
          messageId: bounty.messageId,
        });

        // Update status if not active
        if (bounty.status !== 'active') {
          if (bounty.status === 'claimed') {
            await client.mutation(api.bounties.claimBounty, {
              bountyId: bounty.bountyId,
              claimedBy: bounty.claimedBy,
              claimedByName: bounty.claimedByName,
              proofUrl: bounty.proofUrl,
            });
          } else if (bounty.status === 'cancelled') {
            await client.mutation(api.bounties.cancelBounty, {
              bountyId: bounty.bountyId,
            });
          }
        }

        migrated++;
      } catch (error) {
        console.error(`  ✗ Failed to migrate bounty ${bounty.bountyId}:`, error.message);
        failed++;
      }
    }

    console.log(`✅ Bounties migration complete: ${migrated} migrated, ${failed} failed`);
    return { migrated, failed };
  } catch (error) {
    console.error('❌ Error migrating bounties:', error);
    throw error;
  }
}

/**
 * Migrate team histories from MongoDB to Convex
 */
async function migrateTeamHistories(client) {
  console.log(`\n📦 Migrating team histories...`);

  try {
    const teams = await TeamHistory.find({}).lean();
    console.log(`Found ${teams.length} teams to migrate`);

    let migrated = 0;
    let failed = 0;

    for (const team of teams) {
      try {
        const teamData = {
          guildId: team.guildId,
          teamId: team.teamId,
          leaderId: team.leaderId,
          leaderName: team.leaderName,
          memberIds: team.memberIds,
          memberNames: team.memberNames,
          channelId: team.channelId,
          createdAt: dateToTimestamp(team.createdAt),
          status: team.status,
          matchResult: team.matchResult,
          matchScore: team.matchScore,
          reportedBy: team.reportedBy,
          reportedAt: dateToTimestamp(team.reportedAt),
          stats: team.stats,
        };

        // Remove null values (convert to undefined for optional fields)
        Object.keys(teamData).forEach(key => {
          if (teamData[key] === null) {
            delete teamData[key];
          }
        });

        await client.mutation(api.teams.saveTeamHistory, teamData);

        migrated++;
      } catch (error) {
        console.error(`  ✗ Failed to migrate team ${team.teamId}:`, error.message);
        failed++;
      }
    }

    console.log(`✅ Team histories migration complete: ${migrated} migrated, ${failed} failed`);
    return { migrated, failed };
  } catch (error) {
    console.error('❌ Error migrating team histories:', error);
    throw error;
  }
}

/**
 * Migrate trivia sessions from MongoDB to Convex
 */
async function migrateTriviaSessions(client) {
  console.log(`\n📦 Migrating trivia sessions...`);

  try {
    const sessions = await TriviaSession.find({}).lean();
    console.log(`Found ${sessions.length} sessions to migrate`);

    let migrated = 0;

    for (const session of sessions) {
      try {
        const guildId = session.guildId || session.serverId || '701308904877064193';

        await client.mutation(api.trivia.upsertSession, {
          guildId,
          sessionToken: session.sessionToken,
          activeQuestion: session.activeQuestion ? {
            ...session.activeQuestion,
            postedAt: dateToTimestamp(session.activeQuestion.postedAt),
            answeredAt: dateToTimestamp(session.activeQuestion.answeredAt),
          } : undefined,
          questionHistory: session.questionHistory,
          totalQuestions: session.totalQuestions,
        });

        migrated++;
      } catch (error) {
        console.error(`  ✗ Failed to migrate trivia session:`, error.message);
      }
    }

    console.log(`✅ Trivia sessions migration complete: ${migrated} migrated`);
    return { migrated, failed: 0 };
  } catch (error) {
    console.error('❌ Error migrating trivia sessions:', error);
    throw error;
  }
}

/**
 * Migrate wordle scores from MongoDB to Convex
 */
async function migrateWordleScores(client) {
  console.log(`\n📦 Migrating wordle scores...`);

  try {
    const scores = await WordleScore.find({}).lean();
    console.log(`Found ${scores.length} wordle scores to migrate`);

    let migrated = 0;
    let failed = 0;

    for (const score of scores) {
      try {
        const guildId = score.guildId || '701308904877064193';

        // Migrate by adding all scores
        for (const s of score.scores) {
          await client.mutation(api.wordle.addScore, {
            guildId,
            userId: score.userId,
            score: s.score,
            honeyAwarded: s.honeyAwarded,
          });
        }

        migrated++;
      } catch (error) {
        console.error(`  ✗ Failed to migrate wordle score for user ${score.userId}:`, error.message);
        failed++;
      }
    }

    console.log(`✅ Wordle scores migration complete: ${migrated} migrated, ${failed} failed`);
    return { migrated, failed };
  } catch (error) {
    console.error('❌ Error migrating wordle scores:', error);
    throw error;
  }
}

/**
 * Migrate wordle monthly winners from MongoDB to Convex
 */
async function migrateWordleMonthlyWinners(client) {
  console.log(`\n📦 Migrating wordle monthly winners...`);

  try {
    const winners = await WordleMonthlyWinner.find({}).lean();
    console.log(`Found ${winners.length} monthly winners to migrate`);

    let migrated = 0;

    for (const winner of winners) {
      try {
        const guildId = winner.guildId || '701308904877064193';

        // Clean topTen array - remove MongoDB _id fields
        const cleanTopTen = winner.topTen ? winner.topTen.map(player => {
          const { _id, ...rest } = player;
          return rest;
        }) : [];

        await client.mutation(api.wordle.saveMonthlyWinner, {
          guildId,
          month: winner.month,
          winner: winner.winner,
          topTen: cleanTopTen,
          totalPlayers: winner.totalPlayers,
          totalGamesPlayed: winner.totalGamesPlayed,
        });

        migrated++;
      } catch (error) {
        console.error(`  ✗ Failed to migrate monthly winner for ${winner.month}:`, error.message);
      }
    }

    console.log(`✅ Wordle monthly winners migration complete: ${migrated} migrated`);
    return { migrated, failed: 0 };
  } catch (error) {
    console.error('❌ Error migrating wordle monthly winners:', error);
    throw error;
  }
}

/**
 * Migrate server settings from MongoDB to Convex
 */
async function migrateServers(client) {
  console.log(`\n📦 Migrating server settings...`);

  try {
    const servers = await Server.find({}).lean();
    console.log(`Found ${servers.length} servers to migrate`);

    let migrated = 0;

    for (const server of servers) {
      try {
        const guildId = server.guildId || server.serverId || '701308904877064193';

        await client.mutation(api.servers.upsertServer, {
          guildId,
          houseBalance: server.houseBalance,
          lastVotingDate: dateToTimestamp(server.lastVotingDate),
          settings: mapToObject(server.settings),
        });

        migrated++;
      } catch (error) {
        console.error(`  ✗ Failed to migrate server:`, error.message);
      }
    }

    console.log(`✅ Server settings migration complete: ${migrated} migrated`);
    return { migrated, failed: 0 };
  } catch (error) {
    console.error('❌ Error migrating server settings:', error);
    throw error;
  }
}

/**
 * Migrate subscriptions from MongoDB to Convex
 */
async function migrateSubscriptions(client) {
  console.log(`\n📦 Migrating subscriptions...`);

  try {
    const subscriptions = await Subscription.find({}).lean();
    console.log(`Found ${subscriptions.length} subscriptions to migrate`);

    let migrated = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        const subscriptionData = {
          discordId: sub.discordId,
          discordUsername: sub.discordUsername,
          discordAvatar: sub.discordAvatar,
          tier: sub.tier,
          status: sub.status,
          botVerified: sub.botVerified,
          verifiedGuilds: sub.verifiedGuilds ? sub.verifiedGuilds.map(g => {
            const { _id, ...rest } = g;
            return {
              ...rest,
              verifiedAt: dateToTimestamp(g.verifiedAt),
            };
          }) : [],
          expiresAt: dateToTimestamp(sub.expiresAt),
          paymentReference: sub.paymentReference || undefined,
          features: sub.features || [],
          metadata: mapToObject(sub.metadata),
        };

        // Remove null values
        Object.keys(subscriptionData).forEach(key => {
          if (subscriptionData[key] === null) {
            delete subscriptionData[key];
          }
        });

        await client.mutation(api.subscriptions.upsertSubscription, subscriptionData);

        migrated++;
      } catch (error) {
        console.error(`  ✗ Failed to migrate subscription for ${sub.discordId}:`, error.message);
        failed++;
      }
    }

    console.log(`✅ Subscriptions migration complete: ${migrated} migrated, ${failed} failed`);
    return { migrated, failed };
  } catch (error) {
    console.error('❌ Error migrating subscriptions:', error);
    throw error;
  }
}

/**
 * Main migration function
 */
async function main() {
  console.log('🚀 Starting MongoDB to Convex migration...\n');
  console.log('📋 Migration Strategy: Guild ID Partitioning');
  console.log('   - All guilds share the same Convex tables');
  console.log('   - Data partitioned by guildId field (same as MongoDB)');
  console.log('   - Single migration handles all guilds\n');

  const stats = {
    users: { migrated: 0, failed: 0 },
    bounties: { migrated: 0, failed: 0 },
    teams: { migrated: 0, failed: 0 },
    trivia: { migrated: 0, failed: 0 },
    wordle: { migrated: 0, failed: 0 },
    wordleWinners: { migrated: 0, failed: 0 },
    servers: { migrated: 0, failed: 0 },
    subscriptions: { migrated: 0, failed: 0 },
  };

  try {
    // Connect to both databases
    await connectToMongoDB();
    const convexClient = getConvexClient();

    // Run migrations
    console.log('\n📊 Starting data migration...\n');
    stats.users = await migrateUsers(convexClient);
    stats.bounties = await migrateBounties(convexClient);
    stats.teams = await migrateTeamHistories(convexClient);
    stats.trivia = await migrateTriviaSessions(convexClient);
    stats.wordle = await migrateWordleScores(convexClient);
    stats.wordleWinners = await migrateWordleMonthlyWinners(convexClient);
    stats.servers = await migrateServers(convexClient);
    stats.subscriptions = await migrateSubscriptions(convexClient);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('\n📊 Migration Summary:');
    console.log(`   Users:            ${stats.users.migrated} migrated, ${stats.users.failed} failed`);
    console.log(`   Bounties:         ${stats.bounties.migrated} migrated, ${stats.bounties.failed} failed`);
    console.log(`   Team Histories:   ${stats.teams.migrated} migrated, ${stats.teams.failed} failed`);
    console.log(`   Trivia Sessions:  ${stats.trivia.migrated} migrated, ${stats.trivia.failed} failed`);
    console.log(`   Wordle Scores:    ${stats.wordle.migrated} migrated, ${stats.wordle.failed} failed`);
    console.log(`   Wordle Winners:   ${stats.wordleWinners.migrated} migrated, ${stats.wordleWinners.failed} failed`);
    console.log(`   Servers:          ${stats.servers.migrated} migrated, ${stats.servers.failed} failed`);
    console.log(`   Subscriptions:    ${stats.subscriptions.migrated} migrated, ${stats.subscriptions.failed} failed`);

    const totalMigrated = Object.values(stats).reduce((sum, s) => sum + s.migrated, 0);
    const totalFailed = Object.values(stats).reduce((sum, s) => sum + s.failed, 0);
    console.log(`\n   TOTAL:            ${totalMigrated} migrated, ${totalFailed} failed`);

    console.log('\n📝 Next steps:');
    console.log('  1. ✅ Verify data in Convex dashboard: https://dashboard.convex.dev');
    console.log('  2. 📋 Update your bot code to use Convex helpers');
    console.log('  3. 🧪 Test all bot features thoroughly');
    console.log('  4. 📊 Monitor Convex logs for any issues');
    console.log('  5. 🗄️  Keep MongoDB backup for at least 30 days');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run migration
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
