// ===============================================
// VALORANT RANK UTILITIES
// ===============================================
// Provides rank-related functions and mappings

const { loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

// Rank mapping with image paths
const RANK_MAPPING = {
    0: { name: 'Unranked', color: '#8D8D8D', image: 'Unranked_Rank.png' },
    3: { name: 'Iron 1', color: '#4A4A4A', image: 'Iron_1_Rank.png' },
    4: { name: 'Iron 2', color: '#4A4A4A', image: 'Iron_2_Rank.png' },
    5: { name: 'Iron 3', color: '#4A4A4A', image: 'Iron_3_Rank.png' },
    6: { name: 'Bronze 1', color: '#CD7F32', image: 'Bronze_1_Rank.png' },
    7: { name: 'Bronze 2', color: '#CD7F32', image: 'Bronze_2_Rank.png' },
    8: { name: 'Bronze 3', color: '#CD7F32', image: 'Bronze_3_Rank.png' },
    9: { name: 'Silver 1', color: '#C0C0C0', image: 'Silver_1_Rank.png' },
    10: { name: 'Silver 2', color: '#C0C0C0', image: 'Silver_2_Rank.png' },
    11: { name: 'Silver 3', color: '#C0C0C0', image: 'Silver_3_Rank.png' },
    12: { name: 'Gold 1', color: '#FFD700', image: 'Gold_1_Rank.png' },
    13: { name: 'Gold 2', color: '#FFD700', image: 'Gold_2_Rank.png' },
    14: { name: 'Gold 3', color: '#FFD700', image: 'Gold_3_Rank.png' },
    15: { name: 'Platinum 1', color: '#00CED1', image: 'Platinum_1_Rank.png' },
    16: { name: 'Platinum 2', color: '#00CED1', image: 'Platinum_2_Rank.png' },
    17: { name: 'Platinum 3', color: '#00CED1', image: 'Platinum_3_Rank.png' },
    18: { name: 'Diamond 1', color: '#B57EDC', image: 'Diamond_1_Rank.png' },
    19: { name: 'Diamond 2', color: '#B57EDC', image: 'Diamond_2_Rank.png' },
    20: { name: 'Diamond 3', color: '#B57EDC', image: 'Diamond_3_Rank.png' },
    21: { name: 'Ascendant 1', color: '#00FF7F', image: 'Ascendant_1_Rank.png' },
    22: { name: 'Ascendant 2', color: '#00FF7F', image: 'Ascendant_2_Rank.png' },
    23: { name: 'Ascendant 3', color: '#00FF7F', image: 'Ascendant_3_Rank.png' },
    24: { name: 'Immortal 1', color: '#FF6B6B', image: 'Immortal_1_Rank.png' },
    25: { name: 'Immortal 2', color: '#FF6B6B', image: 'Immortal_2_Rank.png' },
    26: { name: 'Immortal 3', color: '#FF6B6B', image: 'Immortal_3_Rank.png' },
    27: { name: 'Radiant', color: '#FFFF99', image: 'Radiant_Rank.png' }
};

/**
 * Loads a rank image from the filesystem
 * @param {number} rankTier - The rank tier number (0-27)
 * @returns {Promise<Image|null>} - The loaded image or null if not found
 */
async function loadRankImage(rankTier) {
    try {
        const rankInfo = RANK_MAPPING[rankTier] || RANK_MAPPING[0];
        const imagePath = path.join(__dirname, '..', 'images', rankInfo.image);

        if (fs.existsSync(imagePath)) {
            return await loadImage(imagePath);
        } else {
            console.warn(`[Rank Utils] Rank image not found: ${imagePath}`);
            return null;
        }
    } catch (error) {
        console.error('[Rank Utils] Error loading rank image:', error);
        return null;
    }
}

/**
 * Creates a fallback rank icon (colored circle with rank initial)
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} size - Icon size
 * @param {Object} rankInfo - Rank information object from RANK_MAPPING
 */
function createFallbackRankIcon(ctx, x, y, size, rankInfo) {
    ctx.fillStyle = rankInfo.color;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Add rank initial
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size / 3}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(rankInfo.name.charAt(0), x + size / 2, y + size / 2 + size / 10);
}

/**
 * Gets rank information by tier number
 * @param {number} rankTier - The rank tier number (0-27)
 * @returns {Object} - Rank information (name, color, image)
 */
function getRankInfo(rankTier) {
    return RANK_MAPPING[rankTier] || RANK_MAPPING[0];
}

/**
 * Calculates MMR from rank tier and RR
 * @param {number} tier - Rank tier (0-27)
 * @param {number} rr - Ranked rating (0-100)
 * @returns {number} - Calculated MMR
 */
function calculateMMR(tier, rr = 0) {
    return (tier * 100) + rr;
}

/**
 * Gets the rank tier from MMR
 * @param {number} mmr - The MMR value
 * @returns {number} - The rank tier
 */
function getTierFromMMR(mmr) {
    return Math.floor(mmr / 100);
}

/**
 * Gets the RR from MMR
 * @param {number} mmr - The MMR value
 * @returns {number} - The RR value (0-100)
 */
function getRRFromMMR(mmr) {
    return mmr % 100;
}

/**
 * Checks if a rank tier is valid
 * @param {number} rankTier - The rank tier to check
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidRankTier(rankTier) {
    return rankTier in RANK_MAPPING;
}

/**
 * Gets all available rank tiers
 * @returns {Array<number>} - Array of all rank tier numbers
 */
function getAllRankTiers() {
    return Object.keys(RANK_MAPPING).map(Number);
}

/**
 * Gets rank name by tier
 * @param {number} rankTier - The rank tier number
 * @returns {string} - The rank name
 */
function getRankName(rankTier) {
    const rankInfo = RANK_MAPPING[rankTier];
    return rankInfo ? rankInfo.name : 'Unknown';
}

/**
 * Gets rank color by tier
 * @param {number} rankTier - The rank tier number
 * @returns {string} - The rank color (hex)
 */
function getRankColor(rankTier) {
    const rankInfo = RANK_MAPPING[rankTier];
    return rankInfo ? rankInfo.color : '#8D8D8D';
}

module.exports = {
    RANK_MAPPING,
    loadRankImage,
    createFallbackRankIcon,
    getRankInfo,
    calculateMMR,
    getTierFromMMR,
    getRRFromMMR,
    isValidRankTier,
    getAllRankTiers,
    getRankName,
    getRankColor
};
