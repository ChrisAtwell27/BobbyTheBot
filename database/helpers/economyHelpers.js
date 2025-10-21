const User = require('../models/User');

// Get user's balance
async function getBobbyBucks(userId) {
    try {
        const user = await User.findOne({ userId });
        return user ? user.balance : 0;
    } catch (error) {
        console.error('Error getting balance:', error);
        return 0;
    }
}

// Update user's balance (add or subtract)
async function updateBobbyBucks(userId, amount) {
    try {
        let user = await User.findOne({ userId });
        if (!user) {
            user = new User({ userId, balance: amount });
        } else {
            user.balance += amount;
        }
        await user.save();
        return user.balance;
    } catch (error) {
        console.error('Error updating balance:', error);
        return 0;
    }
}

// Set user's balance directly
async function setBobbyBucks(userId, amount) {
    try {
        let user = await User.findOne({ userId });
        if (!user) {
            user = new User({ userId, balance: amount });
        } else {
            user.balance = amount;
        }
        await user.save();
        return user.balance;
    } catch (error) {
        console.error('Error setting balance:', error);
        return 0;
    }
}

// Get top balances for leaderboard
async function getTopBalances(limit = 10) {
    try {
        const users = await User.find({ balance: { $gt: 0 } })
            .sort({ balance: -1 })
            .limit(limit)
            .select('userId balance');
        return users.map(user => ({
            userId: user.userId,
            balance: user.balance
        }));
    } catch (error) {
        console.error('Error getting top balances:', error);
        return [];
    }
}

// Get total economy (sum of all balances)
async function getTotalEconomy() {
    try {
        const result = await User.aggregate([
            { $group: { _id: null, total: { $sum: '$balance' } } }
        ]);
        return result.length > 0 ? result[0].total : 0;
    } catch (error) {
        console.error('Error getting total economy:', error);
        return 0;
    }
}

// Get user's rank
async function getUserRank(userId) {
    try {
        const user = await User.findOne({ userId });
        if (!user) return null;

        const rank = await User.countDocuments({ balance: { $gt: user.balance } });
        return rank + 1;
    } catch (error) {
        console.error('Error getting user rank:', error);
        return null;
    }
}

module.exports = {
    getBobbyBucks,
    updateBobbyBucks,
    setBobbyBucks,
    getTopBalances,
    getTotalEconomy,
    getUserRank
};
