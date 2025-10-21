const User = require('../models/User');

// Get user's pet data
async function getPet(userId) {
    try {
        const user = await User.findOne({ userId });
        if (user && user.pet && user.pet.name) {
            return user.pet;
        }
        return null;
    } catch (error) {
        console.error('Error getting pet:', error);
        return null;
    }
}

// Save/update user's pet
async function savePet(userId, petData) {
    try {
        let user = await User.findOne({ userId });
        if (!user) {
            user = new User({ userId, pet: petData });
        } else {
            user.pet = petData;
        }
        await user.save();
        return true;
    } catch (error) {
        console.error('Error saving pet:', error);
        return false;
    }
}

// Delete user's pet
async function deletePet(userId) {
    try {
        const user = await User.findOne({ userId });
        if (user) {
            user.pet = undefined;
            await user.save();
        }
        return true;
    } catch (error) {
        console.error('Error deleting pet:', error);
        return false;
    }
}

// Get pet inventory
async function getPetInventory(userId) {
    try {
        const user = await User.findOne({ userId });
        if (user && user.pet && user.pet.inventory) {
            // Convert Map to plain object for compatibility
            return Object.fromEntries(user.pet.inventory);
        }
        return {};
    } catch (error) {
        console.error('Error getting pet inventory:', error);
        return {};
    }
}

// Save pet inventory
async function savePetInventory(userId, inventory) {
    try {
        const user = await User.findOne({ userId });
        if (user && user.pet) {
            user.pet.inventory = new Map(Object.entries(inventory));
            await user.save();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error saving pet inventory:', error);
        return false;
    }
}

// Get top pets by level for leaderboard
async function getTopPets(limit = 10) {
    try {
        const users = await User.find({ 'pet.level': { $exists: true, $gt: 0 } })
            .sort({ 'pet.level': -1, 'pet.xp': -1 })
            .limit(limit)
            .select('userId pet.name pet.petType pet.emoji pet.level pet.xp');

        return users.map(user => ({
            userId: user.userId,
            petName: user.pet.name,
            petType: user.pet.petType,
            petEmoji: user.pet.emoji,
            level: user.pet.level,
            xp: user.pet.xp
        }));
    } catch (error) {
        console.error('Error getting top pets:', error);
        return [];
    }
}

module.exports = {
    getPet,
    savePet,
    deletePet,
    getPetInventory,
    savePetInventory,
    getTopPets
};
