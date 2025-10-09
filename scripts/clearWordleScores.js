require('dotenv').config();
const { connectToDatabase } = require('../database/connection');
const WordleScore = require('../database/models/WordleScore');

async function clearWordleScores() {
    try {
        console.log('Connecting to database...');
        await connectToDatabase();

        console.log('Clearing WordleScore collection...');
        const result = await WordleScore.deleteMany({});

        console.log(`✓ Deleted ${result.deletedCount} documents from WordleScore collection`);

        process.exit(0);
    } catch (error) {
        console.error('Error clearing WordleScore collection:', error);
        process.exit(1);
    }
}

clearWordleScores();
