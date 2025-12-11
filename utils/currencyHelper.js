/**
 * Currency Helper - Dynamic currency name and emoji for Ultimate tier servers
 * Non-ultimate servers default to "Honey" with emoji
 */

const { getSetting } = require("./settingsManager");
const emoji = require("node-emoji");

const DEFAULTS = {
  name: "Honey",
  emoji: "🍯", // Honey pot emoji
};

/**
 * Convert Discord shortcode to Unicode emoji using node-emoji library
 * @param {string} input - Could be shortcode (:poop:), unicode (💩), or custom (<:name:id>)
 * @returns {string} - Unicode emoji if convertible, original string otherwise
 */
function convertToUnicode(input) {
  if (!input) return input;

  // If it's a shortcode format (:name:), try to convert it
  if (input.startsWith(":") && input.endsWith(":")) {
    const name = input.slice(1, -1); // Remove colons
    const unicode = emoji.get(name);
    // emoji.get returns the shortcode back if not found, so check if it changed
    if (unicode && unicode !== `:${name}:`) {
      return unicode;
    }
  }

  // Return as-is (already unicode or custom emoji that can't be converted)
  return input;
}

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
  return name && validateCurrencyName(name) ? name : DEFAULTS.name;
}

/**
 * Get currency emoji for a guild (defaults to honey pot)
 * Converts Discord shortcodes to Unicode for canvas/image compatibility
 * @param {string} guildId
 * @returns {Promise<string>}
 */
async function getCurrencyEmoji(guildId) {
  if (!guildId) return DEFAULTS.emoji;
  const emojiValue = await getSetting(guildId, "currency.emoji", null);
  if (emojiValue && validateCurrencyEmoji(emojiValue)) {
    // Convert shortcodes to unicode for canvas compatibility
    return convertToUnicode(emojiValue);
  }
  return DEFAULTS.emoji;
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
  convertToUnicode,
  DEFAULTS,
};
