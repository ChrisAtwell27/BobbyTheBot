// Migration script to fix Valorant user data in MongoDB
// Run with: node scripts/migrateValorantData.js

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../database/models/User');

async function migrateValorantData() {
    try {
        console.log('🔄 Starting Valorant data migration...');

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Find all users with valorantRank field (old format)
        // Use .collection.find() to bypass schema restrictions
        const usersWithOldData = await User.collection.find({
            valorantRank: { $exists: true, $ne: null }
        }).toArray();

        console.log(`📊 Found ${usersWithOldData.length} users with old data format`);

        let successCount = 0;
        let failCount = 0;
        let emptyCount = 0;

        for (const userDoc of usersWithOldData) {
            try {
                console.log(`\n🔍 Processing user ${userDoc.userId}...`);
                console.log(`   Raw valorantRank data type: ${typeof userDoc.valorantRank}`);
                console.log(`   Raw valorantRank data:`, userDoc.valorantRank);

                let valorantData = null;

                // Handle different data formats
                if (typeof userDoc.valorantRank === 'string') {
                    // Try to parse JSON string
                    try {
                        valorantData = JSON.parse(userDoc.valorantRank);
                        console.log(`   ✅ Parsed JSON data:`, valorantData);
                    } catch (parseError) {
                        console.log(`   ❌ Failed to parse JSON:`, parseError.message);
                        console.log(`   📝 Content:`, userDoc.valorantRank.substring(0, 100));
                        failCount++;
                        continue;
                    }
                } else if (typeof userDoc.valorantRank === 'object') {
                    // Already an object
                    valorantData = userDoc.valorantRank;
                    console.log(`   ✅ Already object format:`, valorantData);
                } else {
                    console.log(`   ⚠️ Unknown data format: ${typeof userDoc.valorantRank}`);
                    failCount++;
                    continue;
                }

                // Check if we have required fields
                if (!valorantData || !valorantData.name || !valorantData.tag || !valorantData.region) {
                    console.log(`   ⚠️ Missing required fields:`, {
                        hasName: !!valorantData?.name,
                        hasTag: !!valorantData?.tag,
                        hasRegion: !!valorantData?.region
                    });
                    emptyCount++;

                    // Remove invalid data
                    await User.findOneAndUpdate(
                        { userId: userDoc.userId },
                        { $unset: { valorantRank: '' } }
                    );
                    console.log(`   🗑️ Removed invalid/empty data for user ${userDoc.userId}`);
                    continue;
                }

                // Migrate to new format, preserving any existing data in the new field
                const existingValorantData = userDoc.valorant || {};
                const newValorantData = {
                    puuid: valorantData.puuid || null,
                    name: valorantData.name,
                    tag: valorantData.tag,
                    region: valorantData.region.toLowerCase(),
                    registeredAt: valorantData.registeredAt ? new Date(valorantData.registeredAt) : new Date(),
                    lastUpdated: new Date(),
                    // Preserve existing preferredAgents and blockedUsers if they exist
                    preferredAgents: existingValorantData.preferredAgents || valorantData.preferredAgents || [],
                    blockedUsers: existingValorantData.blockedUsers || valorantData.blockedUsers || []
                };

                // Update user with new format and remove old field
                await User.findOneAndUpdate(
                    { userId: userDoc.userId },
                    {
                        $set: { valorant: newValorantData },
                        $unset: { valorantRank: '' }
                    }
                );

                console.log(`   ✅ Migrated ${valorantData.name}#${valorantData.tag} (${valorantData.region})`);
                if (existingValorantData.preferredAgents && existingValorantData.preferredAgents.length > 0) {
                    console.log(`   📝 Preserved preferred agents: ${existingValorantData.preferredAgents.join(', ')}`);
                }
                successCount++;

            } catch (userError) {
                console.error(`   ❌ Error processing user ${userDoc.userId}:`, userError);
                failCount++;
            }
        }

        console.log('\n📊 Migration Summary:');
        console.log(`   ✅ Successfully migrated: ${successCount}`);
        console.log(`   ⚠️ Empty/Invalid data removed: ${emptyCount}`);
        console.log(`   ❌ Failed: ${failCount}`);

        // Now check users with new format but empty fields
        console.log('\n🔍 Checking users with new format...');
        const usersWithNewData = await User.find({
            'valorant': { $exists: true, $ne: null }
        });

        console.log(`📊 Found ${usersWithNewData.length} users with new data format`);

        for (const user of usersWithNewData) {
            if (!user.valorant.name || !user.valorant.tag || !user.valorant.region) {
                console.log(`⚠️ User ${user.userId} has incomplete valorant data:`, {
                    name: user.valorant.name || 'MISSING',
                    tag: user.valorant.tag || 'MISSING',
                    region: user.valorant.region || 'MISSING',
                    puuid: user.valorant.puuid || 'MISSING'
                });
            } else {
                console.log(`✅ User ${user.userId}: ${user.valorant.name}#${user.valorant.tag} (${user.valorant.region})`);
            }
        }

        console.log('\n✨ Migration complete!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('👋 Disconnected from MongoDB');
    }
}

// Run migration
migrateValorantData();
