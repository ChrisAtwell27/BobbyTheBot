/**
 * Tier Definitions for Bot Settings
 * Defines which subscription tier is required for each setting.
 */

// Rank values for comparison (higher = better)
const TIERS = {
  free: 0,
  basic: 1,
  premium: 2,
  enterprise: 3,
};

// Default tier for guilds with no subscription
const DEFAULT_TIER = "free";

// Setting requirements
// Key: Setting name (dot notation supported)
// Value: Minimum required tier key
const SETTING_REQUIREMENTS = {
  // Basic features available to everyone
  "features.trivia": "free",
  "features.alerts": "free",

  // Premium features
  openaiApiKey: "premium", // Custom API keys are premium
  "features.custom_branding": "enterprise", // Example
};

/**
 * Check if a tier meets the requirement
 * @param {string} currentTier - The guild's current tier
 * @param {string} requiredTier - The required tier
 * @returns {boolean}
 */
function meetsRequirement(currentTier, requiredTier) {
  const currentVal = TIERS[currentTier] || 0;
  const requiredVal = TIERS[requiredTier] || 0;
  return currentVal >= requiredVal;
}

/**
 * Get requirement for a specific setting key
 * @param {string} key
 * @returns {string} The required tier (defaults to 'free' if not defined)
 */
function getRequirement(key) {
  return SETTING_REQUIREMENTS[key] || "free";
}

module.exports = {
  TIERS,
  DEFAULT_TIER,
  SETTING_REQUIREMENTS,
  meetsRequirement,
  getRequirement,
};
