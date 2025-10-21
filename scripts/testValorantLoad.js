// Test script to verify Valorant data loads correctly
require('dotenv').config();
const mongoose = require('mongoose');
const { getAllValorantUsers } = require('../database/helpers/valorantHelpers');

async function testValorantLoad() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        console.log('🔄 Loading Valorant users...\n');
        const userMap = await getAllValorantUsers();

        console.log(`\n📊 Loaded ${userMap.size} users\n`);

        userMap.forEach((userData, userId) => {
            console.log(`✅ ${userData.name}#${userData.tag} (${userData.region}) - Discord ID: ${userId}`);
            if (userData.preferredAgents && userData.preferredAgents.length > 0) {
                console.log(`   Preferred Agents: ${userData.preferredAgents.join(', ')}`);
            }
            if (userData.puuid) {
                console.log(`   PUUID: ${userData.puuid}`);
            }
        });

        console.log('\n✨ Test complete!');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

testValorantLoad();
