/**
 * Currency Helper - Dynamic currency name and emoji for Ultimate tier servers
 * Non-ultimate servers default to "Honey" with emoji
 */

const { getSetting } = require("./settingsManager");

const DEFAULTS = {
  name: "Honey",
  emoji: "\uD83C\uDF6F", // Honey pot emoji
};

/**
 * Validate currency name - max 20 chars, letters only
 * @param {string} name
 * @returns {boolean}
 */
function validateCurrencyName(name) {
  if (!name || typeof name !== "string") return false;
  return /^[a-zA-Z]{1,20}$/.test(name);
}

/**
 * Validate currency emoji - single emoji only
 * @param {string} emoji
 * @returns {boolean}
 */
function validateCurrencyEmoji(emoji) {
  if (!emoji || typeof emoji !== "string") return false;
  // Match single Unicode emoji (with optional variation selector)
  const emojiRegex = /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)$/u;
  return emojiRegex.test(emoji);
}

/**
 * Get currency name for a guild (defaults to "Honey")
 * @param {string} guildId
 * @returns {Promise<string>}
 */
async function getCurrencyName(guildId) {
  if (!guildId) return DEFAULTS.name;
  const name = await getSetting(guildId, "currency.name", null);
  return name && validateCurrencyName(name) ? name : DEFAULTS.name;
}

/**
 * Get currency emoji for a guild (defaults to honey pot)
 * @param {string} guildId
 * @returns {Promise<string>}
 */
async function getCurrencyEmoji(guildId) {
  if (!guildId) return DEFAULTS.emoji;
  const emoji = await getSetting(guildId, "currency.emoji", null);
  return emoji && validateCurrencyEmoji(emoji) ? emoji : DEFAULTS.emoji;
}

/**
 * Format an amount with the guild's currency emoji
 * @param {string} guildId
 * @param {number} amount
 * @returns {Promise<string>} e.g. "🍯1,000"
 */
async function formatCurrency(guildId, amount) {
  const emoji = await getCurrencyEmoji(guildId);
  return `${emoji}${amount.toLocaleString()}`;
}

/**
 * Get both currency name and emoji in one call (for efficiency)
 * @param {string} guildId
 * @returns {Promise<{name: string, emoji: string}>}
 */
async function getCurrencyInfo(guildId) {
  const [name, emoji] = await Promise.all([
    getCurrencyName(guildId),
    getCurrencyEmoji(guildId),
  ]);
  return { name, emoji };
}

module.exports = {
  getCurrencyName,
  getCurrencyEmoji,
  formatCurrency,
  getCurrencyInfo,
  validateCurrencyName,
  validateCurrencyEmoji,
  DEFAULTS,
};
