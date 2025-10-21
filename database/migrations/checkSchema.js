const mongoose = require('mongoose');
require('dotenv').config();

async function checkSchema() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;

        // List all collections with their options
        const collections = await db.listCollections({ name: 'users' }).toArray();

        if (collections.length > 0) {
            console.log('\n📋 Users collection info:');
            console.log(JSON.stringify(collections[0], null, 2));

            if (collections[0].options.validator) {
                console.log('\n⚠️  Collection has validation rules!');
                console.log('Validation rules:', JSON.stringify(collections[0].options.validator, null, 2));
            } else {
                console.log('\n✅ No validation rules found');
            }
        }

        // Check a sample user document
        const usersCollection = db.collection('users');
        const sampleUser = await usersCollection.findOne({});

        if (sampleUser) {
            console.log('\n📄 Sample user document structure:');
            console.log('Pet field type:', typeof sampleUser.pet);
            console.log('Pet field value:', sampleUser.pet);
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

checkSchema();
