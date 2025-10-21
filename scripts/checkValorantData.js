// Script to inspect actual Valorant data in MongoDB
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../database/models/User');

async function checkValorantData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get ALL users and inspect their complete documents
        const allUsers = await User.find({}).lean();
        console.log(`📊 Total users in database: ${allUsers.length}\n`);

        // Focus on the 4 users from the logs
        const targetUsers = [
            '451459488562806784',
            '442102180024025090',
            '755593512556167249',
            '180532993767505921'
        ];

        for (const userId of targetUsers) {
            const user = allUsers.find(u => u.userId === userId);
            if (user) {
                console.log(`\n👤 User ${userId}:`);
                console.log(`   Has 'valorant' field: ${user.valorant !== undefined}`);
                console.log(`   Has 'valorantRank' field: ${user.valorantRank !== undefined}`);

                if (user.valorant !== undefined) {
                    console.log(`   valorant type: ${typeof user.valorant}`);
                    console.log(`   valorant value:`, JSON.stringify(user.valorant, null, 2));
                }

                if (user.valorantRank !== undefined) {
                    console.log(`   valorantRank type: ${typeof user.valorantRank}`);
                    console.log(`   valorantRank value:`, JSON.stringify(user.valorantRank, null, 2));
                }

                // Check ALL keys on the user object
                console.log(`   All user keys:`, Object.keys(user));
            } else {
                console.log(`\n⚠️ User ${userId} not found in database`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkValorantData();
