require('dotenv').config();
const { ConvexHttpClient } = require('convex/browser');
const mongoose = require('mongoose');
const { api } = require('../convex/_generated/api');

/**
 * ============================================================================
 * TARGETED VALORANT MIGRATION SCRIPT: MongoDB to Convex
 * ============================================================================
 *
 * This script ONLY migrates Valorant registration data from MongoDB to Convex.
 * It will NOT touch currency, pets, or any other user data.
 *
 * Safe to run after initial migration - only updates the valorant field.
 *
 * Usage: node scripts/migrateValorantToConvex.js
 *
 * ============================================================================
 */

// Import MongoDB User model
const User = require('../database/models/User');

const BATCH_SIZE = 50;

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
 * Migrate ONLY Valorant data from MongoDB to Convex
 */
async function migrateValorantData(client) {
  console.log('\n🎮 Migrating Valorant registrations...');
  console.log('⚠️  This will ONLY update valorant data - currency and other data will NOT be affected.\n');

  try {
    // Find all users with valorant data in MongoDB
    const usersWithValorant = await User.find({
      $or: [
        { 'valorant': { $exists: true, $ne: null } },
        { 'valorantRank': { $exists: true, $ne: null } }  // Old format
      ]
    }).lean();

    console.log(`📊 Found ${usersWithValorant.length} users with Valorant data in MongoDB`);

    if (usersWithValorant.length === 0) {
      console.log('ℹ️  No Valorant data to migrate.');
      return { migrated: 0, skipped: 0, failed: 0 };
    }

    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < usersWithValorant.length; i += BATCH_SIZE) {
      const batch = usersWithValorant.slice(i, i + BATCH_SIZE);

      for (const user of batch) {
        try {
          const guildId = user.guildId || '701308904877064193';

          // Get valorant data - handle both old and new formats
          let valorantData = user.valorant;

          // Handle old valorantRank format
          if (!valorantData && user.valorantRank) {
            if (typeof user.valorantRank === 'string') {
              try {
                valorantData = JSON.parse(user.valorantRank);
              } catch (e) {
                console.log(`  ⚠️ Could not parse valorantRank for user ${user.userId}`);
                skipped++;
                continue;
              }
            } else {
              valorantData = user.valorantRank;
            }
          }

          // Validate required fields
          if (!valorantData || !valorantData.name || !valorantData.tag || !valorantData.region) {
            console.log(`  ⚠️ Skipping user ${user.userId} - missing required valorant fields`);
            skipped++;
            continue;
          }

          // Prepare valorant data for Convex
          const convexValorantData = {
            puuid: valorantData.puuid || null,
            name: valorantData.name,
            tag: valorantData.tag,
            region: valorantData.region.toLowerCase(),
            registeredAt: dateToTimestamp(valorantData.registeredAt) || Date.now(),
            lastUpdated: dateToTimestamp(valorantData.lastUpdated) || Date.now(),
            preferredAgents: valorantData.preferredAgents || [],
            blockedUsers: valorantData.blockedUsers || [],
          };

          // Use updateValorant mutation - ONLY updates valorant field
          await client.mutation(api.users.updateValorant, {
            guildId,
            userId: user.userId,
            valorant: convexValorantData,
          });

          console.log(`  ✅ Migrated ${valorantData.name}#${valorantData.tag} (${user.userId})`);
          migrated++;

        } catch (error) {
          console.error(`  ❌ Failed to migrate user ${user.userId}:`, error.message);
          failed++;
        }
      }

      console.log(`\n📈 Progress: ${Math.min(i + BATCH_SIZE, usersWithValorant.length)}/${usersWithValorant.length} users processed\n`);
    }

    return { migrated, skipped, failed };

  } catch (error) {
    console.error('❌ Error migrating Valorant data:', error);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting Valorant-Only Migration: MongoDB → Convex\n');
  console.log('═'.repeat(60));
  console.log('⚠️  SAFE MIGRATION: Only valorant data will be updated');
  console.log('✅ Currency, pets, and other user data will NOT be affected');
  console.log('═'.repeat(60));

  try {
    await connectToMongoDB();
    const convexClient = getConvexClient();

    const stats = await migrateValorantData(convexClient);

    console.log('\n' + '═'.repeat(60));
    console.log('✅ VALORANT MIGRATION COMPLETED');
    console.log('═'.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`   ✅ Successfully migrated: ${stats.migrated}`);
    console.log(`   ⚠️  Skipped (invalid data): ${stats.skipped}`);
    console.log(`   ❌ Failed: ${stats.failed}`);

    console.log('\n📝 Next steps:');
    console.log('  1. Test !valstats with a migrated user');
    console.log('  2. Verify currency was NOT affected');
    console.log('  3. Check Convex dashboard for the updated records');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

// Run migration
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
