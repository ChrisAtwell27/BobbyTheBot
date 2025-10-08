const mongoose = require('mongoose');
require('dotenv').config();

async function migratePetSchema() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');

        // Check if collection has validation rules
        const collections = await db.listCollections({ name: 'users' }).toArray();
        if (collections.length > 0 && collections[0].options.validator) {
            console.log('⚠️  Found existing validation rules, removing...');
            await db.command({
                collMod: 'users',
                validator: {},
                validationLevel: 'off'
            });
            console.log('✅ Validation rules removed');
        }

        // Get all users with pets stored as strings (old format)
        const usersWithStringPets = await usersCollection.find({
            pet: { $type: 'string' }
        }).toArray();

        console.log(`Found ${usersWithStringPets.length} users with old pet format`);

        // Migrate each user
        for (const user of usersWithStringPets) {
            console.log(`Migrating user ${user.userId}...`);

            // If pet is a string, convert it or remove it
            // Since we can't parse the old format, we'll just remove it
            await usersCollection.updateOne(
                { _id: user._id },
                { $unset: { pet: "" } }
            );

            console.log(`✅ Migrated user ${user.userId}`);
        }

        console.log('\n✅ Migration complete!');
        console.log('Users can now adopt new pets with the correct schema.');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

migratePetSchema();
