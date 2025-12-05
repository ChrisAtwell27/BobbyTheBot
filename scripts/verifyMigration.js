const { ConvexHttpClient } = require('convex/browser');
const { api } = require('../convex/_generated/api');
const mongoose = require('mongoose');
const User = require('../database/models/User');
require('dotenv').config();

async function verifyMigration() {
  console.log('\n🔍 Verifying Convex Migration...\n');

  // Connect to MongoDB
  await mongoose.connect(process.env.MONGODB_URI);
  const mongoUsers = await User.find({}).lean();

  // Connect to Convex
  const client = new ConvexHttpClient(process.env.CONVEX_URL);
  const guildId = '701308904877064193';

  // Get all users from Convex using a high limit
  const convexUsers = await client.query(api.users.getTopBalances, {
    guildId,
    limit: 1000
  });

  console.log('=== MIGRATION VERIFICATION ===\n');
  console.log(`MongoDB Users:     ${mongoUsers.length}`);
  console.log(`Convex Users:      ${convexUsers.length}`);
  console.log(`Match:             ${mongoUsers.length === convexUsers.length ? '✅ YES' : '❌ NO'}`);
  console.log(`Difference:        ${Math.abs(mongoUsers.length - convexUsers.length)} users`);

  if (mongoUsers.length !== convexUsers.length) {
    console.log('\n⚠️  User counts do not match!');

    // Find which users are missing
    const convexUserIds = new Set(convexUsers.map(u => u.userId));
    const missingUsers = mongoUsers.filter(u => !convexUserIds.has(u.userId));

    if (missingUsers.length > 0) {
      console.log(`\n❌ ${missingUsers.length} users not migrated:`);
      missingUsers.slice(0, 10).forEach(u => {
        console.log(`   - User ${u.userId} (balance: ${u.balance || 0})`);
      });
      if (missingUsers.length > 10) {
        console.log(`   ... and ${missingUsers.length - 10} more`);
      }
    }
  } else {
    console.log('\n✅ All users successfully migrated!');
  }

  // Check MongoDB guild distribution
  const guildMap = {};
  mongoUsers.forEach(u => {
    const gid = u.guildId || 'no_guild_id';
    guildMap[gid] = (guildMap[gid] || 0) + 1;
  });

  console.log('\n=== MongoDB Guild Distribution ===');
  Object.entries(guildMap).forEach(([gid, count]) => {
    console.log(`  ${gid === 'no_guild_id' ? 'no_guild_id (migrated to 701308904877064193)' : gid}: ${count} users`);
  });

  console.log('\n✅ Verification complete!\n');

  await mongoose.disconnect();
}

verifyMigration().catch(console.error);
