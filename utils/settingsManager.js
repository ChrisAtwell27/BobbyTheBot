const { client: convex } = require("./convexClient");
// api import removed to avoid ESM issues in Node.js environment
const { CleanupMap } = require("./memoryUtils");

// Cache settings for 5 minutes (300000 ms)
const settingsCache = new CleanupMap(300000, 60000);

/**
 * Get all settings for a guild
 * @param {string} guildId
 * @returns {Promise<Object>} Settings object
 */
async function getSettings(guildId) {
  // Return empty if convex is not configured
  if (!convex) return {};

  if (settingsCache.has(guildId)) {
    return settingsCache.get(guildId);
  }

  try {
    // Use string identifier for query to avoid ESM import issues
    const server = await convex.query("servers:getServer", { guildId });
    const settings = server && server.settings ? server.settings : {};
    settingsCache.set(guildId, settings);
    return settings;
  } catch (error) {
    console.error(`Error fetching settings for guild ${guildId}:`, error);
    return {}; // Return empty on error
  }
}

/**
 * Get a specific setting value using dot notation
 * @param {string} guildId
 * @param {string} key - Dot notation key (e.g. "features.trivia")
 * @param {any} defaultValue
 * @returns {Promise<any>}
 */
async function getSetting(guildId, key, defaultValue = undefined) {
  const settings = await getSettings(guildId);

  if (!key) return settings;

  const parts = key.split(".");
  let value = settings;

  for (const part of parts) {
    if (value === undefined || value === null) return defaultValue;
    value = value[part];
  }

  return value !== undefined ? value : defaultValue;
}

/**
 * Set a specific setting value using dot notation
 * @param {string} guildId
 * @param {string} key - Dot notation key (e.g. "features.trivia")
 * @param {any} value
 * @returns {Promise<boolean>} Success status
 */
async function setSetting(guildId, key, value) {
  try {
    // 1. Get current settings
    const currentSettings = await getSettings(guildId);

    // 2. Deep update
    const newSettings = { ...currentSettings };
    setDeep(newSettings, key, value);

    // 3. Save back
    await convex.mutation("servers:updateSettings", {
      guildId,
      settings: newSettings,
    });

    // 4. Update cache
    settingsCache.set(guildId, newSettings);

    return true;
  } catch (error) {
    console.error(`Error setting value for ${key} in guild ${guildId}:`, error);
    return false;
  }
}

// Helper for deep setting
function setDeep(obj, path, value) {
  if (!path) return obj;
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
  return obj;
}

/**
 * Clear cache for a guild (useful if we implement real-time updates later)
 * @param {string} guildId
 */
function invalidateCache(guildId) {
  settingsCache.delete(guildId);
}

/**
 * Get the subscription tier for a guild
 * @param {string} guildId
 * @returns {Promise<string>} Tier (default "free")
 */
async function getServerTier(guildId) {
  if (!convex) return "free";
  try {
    const server = await convex.query("servers:getServer", { guildId });
    return server && server.tier ? server.tier : "free";
  } catch (error) {
    console.error(`Error fetching tier for guild ${guildId}:`, error);
    return "free";
  }
}

module.exports = {
  getSettings,
  getSetting,
  setSetting,
  invalidateCache,
  getServerTier,
};
