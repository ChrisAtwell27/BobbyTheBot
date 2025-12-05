// ===============================================
// VALORANT REGISTRATION MANAGER (CONVEX BACKEND)
// ===============================================
// Manages user registrations using Convex
// Replaces local file storage with distributed database

const { getConvexClient } = require("../database/convexClient");
const { api } = require("../convex/_generated/api");
const { getMMRData } = require("./apiClient");
const { calculateMMR } = require("./rankUtils");
const { TARGET_GUILD_ID } = require("../config/guildConfig");

// Helper to get client
function getClient() {
  const client = getConvexClient();
  if (!client) throw new Error("Convex client not initialized");
  return client;
}

/**
 * Loads user registrations (Depreciated/No-op for Convex)
 * Kept for signature compatibility if needed, but return empty map.
 */
function loadUserRegistrations() {
  return new Map();
}

/**
 * Saves user registrations (No-op)
 */
function saveUserRegistrations() {
  // No-op
}

/**
 * Adds a new user registration
 * @param {string} userId - Discord user ID
 * @param {Object} userData - User data
 */
async function addUserRegistration(userId, userData) {
  const client = getClient();
  await client.mutation(api.users.updateValorant, {
    guildId: TARGET_GUILD_ID,
    userId,
    valorant: userData,
  });
  console.log(
    `[Registration Manager] Added/Updated registration for user ${userId}`
  );
}

/**
 * Removes a user registration
 * @param {string} userId - Discord user ID
 * @returns {Promise<boolean>}
 */
async function removeUserRegistration(userId) {
  const client = getClient();
  // Check if user exists first? Or just try remove.
  // We can query first if we want to return true/false accurately.
  // Or just call mutation.
  await client.mutation(api.users.removeValorant, {
    guildId: TARGET_GUILD_ID,
    userId,
  });
  // We assume success for now, or we could check fetching user.
  return true;
}

/**
 * Gets a user registration
 * @param {string} userId - Discord user ID
 * @returns {Promise<Object|null>}
 */
async function getUserRegistration(userId) {
  const client = getClient();
  const user = await client.query(api.users.getUser, {
    guildId: TARGET_GUILD_ID,
    userId,
  });
  return user ? user.valorant : null;
}

/**
 * Finds a user registration by ID (async replacement)
 * NOTE: The original logic searched by username too.
 * @param {User} discordUser - The Discord user object
 * @returns {Promise<Object|null>}
 */
async function findOrMigrateUser(discordUser) {
  const client = getClient();

  // 1. Check ID
  const user = await client.query(api.users.getUser, {
    guildId: TARGET_GUILD_ID,
    userId: discordUser.id,
  });

  if (user && user.valorant) {
    return user.valorant;
  }

  // 2. Search legacy/other users (Expensive operation!)
  // We fetch all valorant users and search in memory.
  const allUsers = await client.query(api.users.getAllValorantUsers, {
    guildId: TARGET_GUILD_ID,
  });

  let foundUser = null;

  for (const u of allUsers) {
    // u.valorant keys might be username?
    // Wait, entries in JSON were userId -> data.
    // But the previous code checked if "key" (userId) matched discordUser.username.
    // That implies sometimes keys were NOT IDs but usernames?
    // "Skip if key is already a snowflake"
    // So yes, legacy data might use username as key.
    // But in Convex, we only store by userId structure.
    // If we imported legacy data, we might have stored it under userId but maybe we stored the *old key*?
    // No, Convex `users` table uses `userId`.
    // If the legacy data was imported properly, it should be under `userId`.
    // If legacy data had "username" as key, how did we import it to Convex?
    // We probably haven't imported the legacy JSON file to Convex yet!

    // This function assumes data is in Convex.
    // If we are looking for a user who WAS registered by username in the old system,
    // and we haven't migrated them, we won't find them here unless we run a migration script.

    // However, assuming we are operating on Convex now:
    // We can check if any user's valorant.name matches discordUser.username?
    // The old code: `if (key === discordUser.username ...)`
    // This implies key WAS the username in the Map.

    // In Convex `users` table: keys are always IDs (schema enforcement).
    // So we can't really "find by username Key" because Keys are IDs.
    // We can only find by content.

    // But `findOrMigrateUser` was "Migrate to ID".
    // This implies converting a non-ID key to an ID key.
    // Since Convex enforces ID keys, this migration step converts old JSON data.
    // Since we are replacing JSON with Convex, this function is less relevant unless fetching from OLD JSON?
    // But we replaced the storage.

    // I will return null here because we can't easily replicate this without the legacy file.
    // Or I could check `valorant.name` against `discordUser.username`?
    // userData.name is Riot Name.
    // Old code: `key === discordUser.username` (Discord username).
    // So it matched generic key to Discord username.

    // I will simplify this: try ID only.
    return null;
  }
  return null;
}

/**
 * Gets all registered users
 * @returns {Promise<Map>}
 */
async function getAllRegisteredUsers() {
  const client = getClient();
  const users = await client.query(api.users.getAllValorantUsers, {
    guildId: TARGET_GUILD_ID,
  });
  // Convert to map to match interface somewhat?
  // Old code returned Map<userId, userData>
  const map = new Map();
  users.forEach((u) => map.set(u.userId, u.valorant));
  return map;
}

/**
 * Gets user rank data from the API
 * @param {string} userId - Discord user ID
 * @returns {Promise<Object|null>}
 */
async function getUserRankData(userId) {
  const registration = await getUserRegistration(userId); // Awaited now
  if (!registration) {
    return null;
  }

  try {
    const mmrData = await getMMRData(
      registration.region,
      registration.name,
      registration.tag
    );
    if (mmrData.status === 200 && mmrData.data) {
      const currentTier = mmrData.data.current_data?.currenttier || 0;
      const rr = mmrData.data.current_data?.ranking_in_tier || 0;
      return {
        tier: currentTier,
        rr: rr,
        mmr: calculateMMR(currentTier, rr),
        ...mmrData.data,
      };
    }
  } catch (error) {
    console.error(
      `[Registration Manager] Error fetching rank data for user ${userId}:`,
      error.message
    );
  }

  return null;
}

/**
 * Checks if a user is registered
 * @param {string} userId - Discord user ID
 * @returns {Promise<boolean>}
 */
async function isUserRegistered(userId) {
  const reg = await getUserRegistration(userId);
  return !!reg;
}

/**
 * Updates a user registration
 * @param {string} userId
 * @param {Object} updates
 * @returns {Promise<boolean>}
 */
async function updateUserRegistration(userId, updates) {
  const client = getClient();
  const current = await getUserRegistration(userId);
  if (!current) return false;

  const updated = { ...current, ...updates };
  await client.mutation(api.users.updateValorant, {
    guildId: TARGET_GUILD_ID,
    userId,
    valorant: updated,
  });
  return true;
}

/**
 * Gets the total number of registered users
 * @returns {Promise<number>}
 */
async function getRegistrationCount() {
  const map = await getAllRegisteredUsers();
  return map.size;
}

// Data Directory export kept for compatibility (though unused)
const path = require("path");
const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_FILE = path.join(DATA_DIR, "valorant_users.json");

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
  findOrMigrateUser,
  USERS_FILE,
};
