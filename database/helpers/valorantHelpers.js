const User = require('../models/User');

// Validate Valorant user data
function validateValorantData(valorantData) {
    if (!valorantData || typeof valorantData !== 'object') {
        return { valid: false, error: 'Invalid data format' };
    }

    const required = ['name', 'tag', 'region'];
    for (const field of required) {
        if (!valorantData[field]) {
            return { valid: false, error: `Missing required field: ${field}` };
        }
    }

    // Validate region
    const validRegions = ['na', 'eu', 'ap', 'kr', 'latam', 'br'];
    if (!validRegions.includes(valorantData.region.toLowerCase())) {
        return { valid: false, error: 'Invalid region' };
    }

    return { valid: true };
}

// Save Valorant user data with proper MongoDB objects
async function saveValorantUser(userId, valorantData) {
    try {
        // Validate data before saving
        const validation = validateValorantData(valorantData);
        if (!validation.valid) {
            console.error(`[VALORANT] Validation failed for user ${userId}:`, validation.error);
            return false;
        }

        const valorantObject = {
            puuid: valorantData.puuid || null,
            name: valorantData.name,
            tag: valorantData.tag,
            region: valorantData.region.toLowerCase(),
            registeredAt: valorantData.registeredAt || new Date(),
            lastUpdated: new Date()
        };

        const user = await User.findOneAndUpdate(
            { userId },
            {
                $set: { valorant: valorantObject }
            },
            { upsert: true, new: true }
        );

        console.log(`[VALORANT] Saved user ${valorantData.name}#${valorantData.tag} for Discord ID ${userId}`);
        return true;
    } catch (error) {
        console.error('[VALORANT] Error saving Valorant user:', error);
        return false;
    }
}

// Get Valorant user data with error recovery
async function getValorantUser(userId) {
    try {
        const user = await User.findOne({ userId });
        if (!user) {
            return null;
        }

        // Handle new format (object)
        if (user.valorant && typeof user.valorant === 'object') {
            return user.valorant;
        }

        // Handle legacy format (stringified JSON) with error recovery
        if (user.valorantRank && typeof user.valorantRank === 'string') {
            try {
                const legacyData = JSON.parse(user.valorantRank);
                console.log(`[VALORANT] Migrating legacy data for user ${userId}`);

                // Migrate to new format
                await saveValorantUser(userId, legacyData);
                return legacyData;
            } catch (parseError) {
                console.error(`[VALORANT] Failed to parse legacy data for user ${userId}:`, parseError);
                console.error(`[VALORANT] Corrupted data:`, user.valorantRank);
                return null;
            }
        }

        return null;
    } catch (error) {
        console.error('[VALORANT] Error getting Valorant user:', error);
        return null;
    }
}

// Get all registered Valorant users with error recovery
async function getAllValorantUsers() {
    try {
        // Query for both new and legacy formats
        const users = await User.find({
            $or: [
                { 'valorant': { $exists: true, $ne: null } },
                { 'valorantRank': { $exists: true, $ne: null } }
            ]
        }).select('userId valorant valorantRank');

        const userMap = new Map();
        for (const user of users) {
            try {
                let valorantData = null;

                // Try new format first
                if (user.valorant && typeof user.valorant === 'object') {
                    valorantData = user.valorant;
                }
                // Fall back to legacy format
                else if (user.valorantRank && typeof user.valorantRank === 'string') {
                    try {
                        valorantData = JSON.parse(user.valorantRank);
                        // Migrate legacy data in background (don't await)
                        saveValorantUser(user.userId, valorantData).catch(err =>
                            console.error(`[VALORANT] Error migrating user ${user.userId}:`, err)
                        );
                    } catch (parseError) {
                        console.error(`[VALORANT] Failed to parse legacy data for user ${user.userId}:`, parseError);
                        continue; // Skip this user
                    }
                }

                if (valorantData) {
                    userMap.set(user.userId, valorantData);
                }
            } catch (error) {
                console.error(`[VALORANT] Error processing Valorant data for user ${user.userId}:`, error);
            }
        }

        console.log(`[VALORANT] Loaded ${userMap.size} registered users from database`);
        return userMap;
    } catch (error) {
        console.error('[VALORANT] Error getting all Valorant users:', error);
        return new Map();
    }
}

// Remove Valorant user data (handles both formats)
async function removeValorantUser(userId) {
    try {
        const result = await User.findOneAndUpdate(
            { userId },
            {
                $unset: {
                    valorant: '',
                    valorantRank: ''  // Also remove legacy field if exists
                }
            },
            { new: true }
        );

        if (result) {
            console.log(`[VALORANT] Removed Valorant data for user ${userId}`);
            return true;
        }

        console.log(`[VALORANT] No user found with ID ${userId}`);
        return false;
    } catch (error) {
        console.error('[VALORANT] Error removing Valorant user:', error);
        return false;
    }
}

module.exports = {
    saveValorantUser,
    getValorantUser,
    getAllValorantUsers,
    removeValorantUser
};
