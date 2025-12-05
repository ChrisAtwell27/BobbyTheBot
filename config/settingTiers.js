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
  // =====================================================================
  // FEATURE TOGGLES (free tier)
  // =====================================================================
  "features.trivia": "free",
  "features.alerts": "free",
  "features.gambling": "free",
  "features.wordle": "free",
  "features.mafia": "free",
  "features.moderation": "free",
  "features.clips": "free",
  "features.bump_reminder": "free",

  // Basic Tier features
  "features.birthdays": "basic",
  "features.bounties": "basic",
  "features.team_builder": "basic",

  // Premium features
  "features.valorant": "premium", // API intensive
  "features.custom_branding": "enterprise",

  // =====================================================================
  // CHANNEL SETTINGS (free tier - all servers can configure channels)
  // =====================================================================
  "channels.trivia": "free",
  "channels.wordle": "free",
  "channels.alerts": "free",
  "channels.updates": "free",
  "channels.announcements": "free",
  "channels.commands": "free",
  "channels.logging": "free",
  "channels.changelog": "free",

  // Mafia channels
  "channels.mafia_text": "free",
  "channels.mafia_voice": "free",

  // Moderation channels
  "channels.graveyard": "free",

  // Clip submission
  "channels.clip_submission": "free",

  // =====================================================================
  // ROLE SETTINGS (free tier - all servers can configure roles)
  // =====================================================================
  // Admin roles (who can use admin commands)
  "adminRoles": "free",

  // Moderation roles
  "roles.dead": "free", // Role given to "dead" users in mafia/moderation

  // Notification roles (who gets pinged for various events)
  "roles.bump_reminder": "free", // Role to ping for server bumps
  "roles.updates": "free", // Role for update notifications
  "roles.clip_winner": "free", // Role for clip contest winners

  // Team builder / Valorant roles
  "roles.valorant_team": "basic", // Role to ping for Valorant teams
  "roles.valorant_inhouse": "basic", // Role for in-house games

  // =====================================================================
  // PREMIUM SETTINGS
  // =====================================================================
  openaiApiKey: "premium", // Custom API keys are premium
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
