const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

let isConnected = false;

async function connectToDatabase() {
    if (isConnected) {
        console.log('✅ Using existing MongoDB connection');
        return;
    }

    if (!MONGODB_URI) {
        console.warn('⚠️  MONGODB_URI not found in environment variables - Bot will not persist data');
        console.warn('⚠️  Set MONGODB_URI in DigitalOcean App Platform or .env file');
        return;
    }

    try {
        await mongoose.connect(MONGODB_URI);

        isConnected = true;
        console.log('✅ Connected to MongoDB Atlas');

        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
            isConnected = false;
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('⚠️  MongoDB disconnected');
            isConnected = false;
        });

    } catch (error) {
        console.error('❌ Failed to connect to MongoDB:', error);
        throw error;
    }
}

async function disconnectFromDatabase() {
    if (!isConnected) {
        return;
    }

    try {
        // Remove all event listeners to prevent memory leaks
        mongoose.connection.removeAllListeners('error');
        mongoose.connection.removeAllListeners('disconnected');

        // Disconnect from MongoDB
        await mongoose.disconnect();
        isConnected = false;
        console.log('✅ Disconnected from MongoDB');
    } catch (error) {
        console.error('❌ Error disconnecting from MongoDB:', error);
    }
}

module.exports = { connectToDatabase, disconnectFromDatabase, isConnected: () => isConnected };
