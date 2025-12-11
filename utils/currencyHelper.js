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
 * Validate currency emoji - accepts multiple formats:
 * - Unicode emojis (💩, 🍯)
 * - Discord shortcodes (:poop:, :honey_pot:)
 * - Discord custom emojis (<:custom:123456789>, <a:animated:123456789>)
 * @param {string} emoji
 * @returns {boolean}
 */
function validateCurrencyEmoji(emoji) {
  if (!emoji || typeof emoji !== "string") return false;

  // Unicode emoji (with optional variation selector)
  const unicodeEmojiRegex = /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)$/u;

  // Discord shortcode format (:emoji_name:)
  const shortcodeRegex = /^:[a-zA-Z0-9_]+:$/;

  // Discord custom emoji format (<:name:id> or <a:name:id> for animated)
  const customEmojiRegex = /^<a?:[a-zA-Z0-9_]+:\d+>$/;

  return unicodeEmojiRegex.test(emoji) ||
         shortcodeRegex.test(emoji) ||
         customEmojiRegex.test(emoji);
}

/**
 * Get currency name for a guild (defaults to "Honey")
 * @param {string} guildId
 * @returns {Promise<string>}
 */
async function getCurrencyName(guildId) {
  if (!guildId) return DEFAULTS.name;
  const name = await getSetting(guildId, "currency.name", null);
  console.log(`[Currency] getCurrencyName for ${guildId}: fetched "${name}", valid: ${validateCurrencyName(name)}`);
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
  console.log(`[Currency] getCurrencyEmoji for ${guildId}: fetched "${emoji}", valid: ${validateCurrencyEmoji(emoji)}`);
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
