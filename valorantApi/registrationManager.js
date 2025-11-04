// ===============================================
// VALORANT REGISTRATION MANAGER
// ===============================================
// Manages user registrations (loading, saving, CRUD operations)

const fs = require('fs');
const path = require('path');
const { getMMRData } = require('./apiClient');
const { calculateMMR } = require('./rankUtils');

// File paths for persistent storage
const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'valorant_users.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('[Registration Manager] Created data directory:', DATA_DIR);
}

// Store user registrations (in-memory cache)
let userRegistrations = new Map();

/**
 * Loads user registrations from file
 * @returns {Map} - The loaded user registrations
 */
function loadUserRegistrations() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const fileData = fs.readFileSync(USERS_FILE, 'utf8');
            const data = JSON.parse(fileData);

            // Convert object back to Map
            userRegistrations = new Map(Object.entries(data));
            console.log(`[Registration Manager] Loaded ${userRegistrations.size} registered Valorant users from file`);

            // Log loaded users for debugging
            userRegistrations.forEach((userData, userId) => {
                console.log(`  - ${userData.name}#${userData.tag} (${userData.region}) - Discord ID: ${userId}`);
            });
        } else {
            console.log('[Registration Manager] No existing Valorant users file found, starting fresh');
            userRegistrations = new Map();
        }
    } catch (error) {
        console.error('[Registration Manager] Error loading user registrations:', error);
        userRegistrations = new Map();
    }

    return userRegistrations;
}

/**
 * Saves user registrations to file
 */
function saveUserRegistrations() {
    try {
        // Convert Map to object for JSON storage
        const dataObject = Object.fromEntries(userRegistrations);
        fs.writeFileSync(USERS_FILE, JSON.stringify(dataObject, null, 2), 'utf8');
        console.log(`[Registration Manager] Saved ${userRegistrations.size} registered Valorant users to file`);
    } catch (error) {
        console.error('[Registration Manager] Error saving user registrations:', error);
    }
}

/**
 * Adds a new user registration
 * @param {string} userId - Discord user ID
 * @param {Object} userData - User data (name, tag, region, puuid, registeredAt)
 */
function addUserRegistration(userId, userData) {
    userRegistrations.set(userId, userData);
    saveUserRegistrations();
    console.log(`[Registration Manager] Added registration for user ${userId}: ${userData.name}#${userData.tag} (${userData.region})`);
}

/**
 * Removes a user registration
 * @param {string} userId - Discord user ID
 * @returns {boolean} - True if removed, false if not found
 */
function removeUserRegistration(userId) {
    const userData = userRegistrations.get(userId);
    if (userData) {
        userRegistrations.delete(userId);
        saveUserRegistrations();
        console.log(`[Registration Manager] Removed registration for user ${userId}: ${userData.name}#${userData.tag}`);
        return true;
    }
    return false;
}

/**
 * Gets a user registration
 * @param {string} userId - Discord user ID
 * @returns {Object|null} - User data or null if not found
 */
function getUserRegistration(userId) {
    return userRegistrations.get(userId) || null;
}

/**
 * Gets all registered users
 * @returns {Map} - Map of all user registrations
 */
function getAllRegisteredUsers() {
    return new Map(userRegistrations);
}

/**
 * Gets user rank data from the API
 * @param {string} userId - Discord user ID
 * @returns {Promise<Object|null>} - Rank data or null
 */
async function getUserRankData(userId) {
    const registration = getUserRegistration(userId);
    if (!registration) {
        return null;
    }

    try {
        const mmrData = await getMMRData(registration.region, registration.name, registration.tag);
        if (mmrData.status === 200 && mmrData.data) {
            const currentTier = mmrData.data.current_data?.currenttier || 0;
            const rr = mmrData.data.current_data?.ranking_in_tier || 0;
            return {
                tier: currentTier,
                rr: rr,
                mmr: calculateMMR(currentTier, rr),
                ...mmrData.data
            };
        }
    } catch (error) {
        console.error(`[Registration Manager] Error fetching rank data for user ${userId}:`, error.message);
    }

    return null;
}

/**
 * Checks if a user is registered
 * @param {string} userId - Discord user ID
 * @returns {boolean} - True if registered, false otherwise
 */
function isUserRegistered(userId) {
    return userRegistrations.has(userId);
}

/**
 * Updates a user registration
 * @param {string} userId - Discord user ID
 * @param {Object} updates - Fields to update
 * @returns {boolean} - True if updated, false if user not found
 */
function updateUserRegistration(userId, updates) {
    const userData = userRegistrations.get(userId);
    if (!userData) {
        return false;
    }

    const updatedData = { ...userData, ...updates };
    userRegistrations.set(userId, updatedData);
    saveUserRegistrations();
    console.log(`[Registration Manager] Updated registration for user ${userId}`);
    return true;
}

/**
 * Gets the total number of registered users
 * @returns {number} - Number of registered users
 */
function getRegistrationCount() {
    return userRegistrations.size;
}

// Load registrations on module initialization
loadUserRegistrations();

// Reload registrations periodically (every 30 minutes)
setInterval(() => {
    console.log('[Registration Manager] Reloading user registrations from file...');
    loadUserRegistrations();
}, 30 * 60 * 1000);

module.exports = {
    loadUserRegistrations,
    saveUserRegistrations,
    addUserRegistration,
    removeUserRegistration,
    getUserRegistration,
    getAllRegisteredUsers,
    getUserRankData,
    isUserRegistered,
    updateUserRegistration,
    getRegistrationCount,
    USERS_FILE
};
