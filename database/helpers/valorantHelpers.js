const User = require('../models/User');

// Save Valorant user data
async function saveValorantUser(userId, valorantData) {
    try {
        let user = await User.findOne({ userId });
        if (!user) {
            user = new User({ userId, valorantRank: JSON.stringify(valorantData) });
        } else {
            user.valorantRank = JSON.stringify(valorantData);
        }
        await user.save();
        return true;
    } catch (error) {
        console.error('Error saving Valorant user:', error);
        return false;
    }
}

// Get Valorant user data
async function getValorantUser(userId) {
    try {
        const user = await User.findOne({ userId });
        if (user && user.valorantRank) {
            return JSON.parse(user.valorantRank);
        }
        return null;
    } catch (error) {
        console.error('Error getting Valorant user:', error);
        return null;
    }
}

// Get all registered Valorant users
async function getAllValorantUsers() {
    try {
        const users = await User.find({ valorantRank: { $exists: true, $ne: null } })
            .select('userId valorantRank');

        const userMap = new Map();
        for (const user of users) {
            try {
                const valorantData = JSON.parse(user.valorantRank);
                userMap.set(user.userId, valorantData);
            } catch (error) {
                console.error(`Error parsing Valorant data for user ${user.userId}:`, error);
            }
        }
        return userMap;
    } catch (error) {
        console.error('Error getting all Valorant users:', error);
        return new Map();
    }
}

// Remove Valorant user data
async function removeValorantUser(userId) {
    try {
        const user = await User.findOne({ userId });
        if (user) {
            user.valorantRank = null;
            await user.save();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error removing Valorant user:', error);
        return false;
    }
}

module.exports = {
    saveValorantUser,
    getValorantUser,
    getAllValorantUsers,
    removeValorantUser
};
