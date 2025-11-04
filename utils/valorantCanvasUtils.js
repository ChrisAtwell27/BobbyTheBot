// ===============================================
// VALORANT CANVAS UTILITIES
// ===============================================
// Provides shared canvas visualization utilities for Valorant handlers
// to eliminate code duplication and ensure consistent styling

const { createCanvas, loadImage } = require('canvas');
const https = require('https');
const path = require('path');
const fs = require('fs');

// Cache for loaded images
const imageCache = new Map();
const rankImageCache = new Map();

/**
 * Creates a standard Valorant-style background gradient
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 */
function createValorantBackground(ctx, width, height) {
    // Enhanced background gradient
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0a0e13');
    gradient.addColorStop(0.3, '#1e2328');
    gradient.addColorStop(0.7, '#2c3e50');
    gradient.addColorStop(1, '#0a0e13');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Add subtle pattern overlay
    ctx.fillStyle = 'rgba(255, 70, 84, 0.05)';
    for (let i = 0; i < width; i += 30) {
        for (let j = 0; j < height; j += 30) {
            if ((i + j) % 60 === 0) {
                ctx.fillRect(i, j, 15, 15);
            }
        }
    }
}

/**
 * Creates a Valorant-style accent gradient border
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {string} color - Accent color (default: '#ff4654' for red)
 * @param {number} borderHeight - Height of border bars (default: 6)
 */
function createAccentBorder(ctx, width, height, color = '#ff4654', borderHeight = 6) {
    const accentGradient = ctx.createLinearGradient(0, 0, width, 0);

    // Adjust gradient based on color
    if (color === '#ff4654') {
        // Red (default Valorant)
        accentGradient.addColorStop(0, '#ff4654');
        accentGradient.addColorStop(0.5, '#ff6b7a');
        accentGradient.addColorStop(1, '#ff4654');
    } else if (color.startsWith('#4a90e2') || color === 'blue') {
        // Blue (for Team 1)
        accentGradient.addColorStop(0, '#4a90e2');
        accentGradient.addColorStop(0.5, '#6aa8f0');
        accentGradient.addColorStop(1, '#4a90e2');
    } else if (color.startsWith('#e24a4a') || color === 'red') {
        // Red (for Team 2)
        accentGradient.addColorStop(0, '#e24a4a');
        accentGradient.addColorStop(0.5, '#f06a6a');
        accentGradient.addColorStop(1, '#e24a4a');
    } else {
        // Custom color
        accentGradient.addColorStop(0, color);
        accentGradient.addColorStop(0.5, color);
        accentGradient.addColorStop(1, color);
    }

    ctx.fillStyle = accentGradient;
    ctx.fillRect(0, 0, width, borderHeight);
    ctx.fillRect(0, height - borderHeight, width, borderHeight);
}

/**
 * Draws text with a glow effect
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {string} text - Text to draw
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {Object} options - Drawing options
 * @param {string} options.color - Text color (default: '#ffffff')
 * @param {string} options.font - Font (default: 'bold 28px Arial')
 * @param {string} options.glowColor - Glow color (default: '#ff4654')
 * @param {number} options.glowBlur - Glow blur amount (default: 10)
 * @param {string} options.align - Text alignment (default: 'center')
 */
function drawGlowText(ctx, text, x, y, options = {}) {
    const {
        color = '#ffffff',
        font = 'bold 28px Arial',
        glowColor = '#ff4654',
        glowBlur = 10,
        align = 'center'
    } = options;

    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowBlur;
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0; // Reset shadow
}

/**
 * Draws a player slot with gradient background and border
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Slot width
 * @param {number} height - Slot height
 * @param {boolean} filled - Whether the slot is filled
 * @param {string} accentColor - Accent color for filled slots (default: '#ff4654')
 */
function drawPlayerSlotBackground(ctx, x, y, width, height, filled = false, accentColor = '#ff4654') {
    // Slot background with gradient
    const slotGradient = ctx.createLinearGradient(x, y, x, y + height);
    if (filled) {
        // Use accent color with transparency
        const rgb = hexToRgb(accentColor);
        slotGradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`);
        slotGradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`);
    } else {
        slotGradient.addColorStop(0, 'rgba(60, 60, 60, 0.5)');
        slotGradient.addColorStop(1, 'rgba(40, 40, 40, 0.5)');
    }
    ctx.fillStyle = slotGradient;
    ctx.fillRect(x - 2, y - 2, width + 4, height + 4);

    // Slot border
    ctx.strokeStyle = filled ? accentColor : '#666666';
    ctx.lineWidth = filled ? 3 : 2;
    ctx.strokeRect(x - 2, y - 2, width + 4, height + 4);
}

/**
 * Loads an image from a URL with caching
 * @param {string} url - The image URL
 * @returns {Promise<Image>} - The loaded image
 */
async function loadImageFromURL(url) {
    // Check cache first
    if (imageCache.has(url)) {
        return imageCache.get(url);
    }

    try {
        const image = await loadImage(url);
        imageCache.set(url, image);
        return image;
    } catch (error) {
        console.error(`[Canvas Utils] Failed to load image from URL: ${url}`, error.message);
        throw error;
    }
}

/**
 * Loads an image from a file path with caching
 * @param {string} filePath - The file path
 * @returns {Promise<Image>} - The loaded image
 */
async function loadImageFromFile(filePath) {
    // Check cache first
    if (imageCache.has(filePath)) {
        return imageCache.get(filePath);
    }

    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const image = await loadImage(filePath);
        imageCache.set(filePath, image);
        return image;
    } catch (error) {
        console.error(`[Canvas Utils] Failed to load image from file: ${filePath}`, error.message);
        throw error;
    }
}

/**
 * Loads rank images from the images directory
 * @param {string} imagesDir - Path to images directory (default: '../images')
 * @returns {Object} - Map of rank tier to loaded image
 */
async function loadRankImages(imagesDir = path.join(__dirname, '..', 'images')) {
    // Return cached images if already loaded
    if (rankImageCache.size > 0) {
        return Object.fromEntries(rankImageCache);
    }

    const rankImages = {};
    const rankFiles = {
        0: 'Unranked_Rank.png',
        3: 'Iron_1_Rank.png',
        4: 'Iron_2_Rank.png',
        5: 'Iron_3_Rank.png',
        6: 'Bronze_1_Rank.png',
        7: 'Bronze_2_Rank.png',
        8: 'Bronze_3_Rank.png',
        9: 'Silver_1_Rank.png',
        10: 'Silver_2_Rank.png',
        11: 'Silver_3_Rank.png',
        12: 'Gold_1_Rank.png',
        13: 'Gold_2_Rank.png',
        14: 'Gold_3_Rank.png',
        15: 'Platinum_1_Rank.png',
        16: 'Platinum_2_Rank.png',
        17: 'Platinum_3_Rank.png',
        18: 'Diamond_1_Rank.png',
        19: 'Diamond_2_Rank.png',
        20: 'Diamond_3_Rank.png',
        21: 'Ascendant_1_Rank.png',
        22: 'Ascendant_2_Rank.png',
        23: 'Ascendant_3_Rank.png',
        24: 'Immortal_1_Rank.png',
        25: 'Immortal_2_Rank.png',
        26: 'Immortal_3_Rank.png',
        27: 'Radiant_Rank.png'
    };

    for (const [tier, filename] of Object.entries(rankFiles)) {
        try {
            const imagePath = path.join(imagesDir, filename);
            if (fs.existsSync(imagePath)) {
                const image = await loadImage(imagePath);
                rankImages[tier] = image;
                rankImageCache.set(parseInt(tier), image);
            }
        } catch (error) {
            console.error(`[Canvas Utils] Failed to load rank image for tier ${tier}:`, error.message);
        }
    }

    return rankImages;
}

/**
 * Draws a rank icon on the canvas with fallback
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} rankTier - The rank tier number
 * @param {number} x - X position (center)
 * @param {number} y - Y position (center)
 * @param {number} size - Icon size (default: 40)
 * @param {Object} rankImages - Map of loaded rank images
 */
async function drawRankIcon(ctx, rankTier, x, y, size = 40, rankImages = {}) {
    if (rankImages[rankTier]) {
        // Draw the rank image
        try {
            ctx.drawImage(rankImages[rankTier], x - size/2, y - size/2, size, size);
        } catch (error) {
            console.error(`[Canvas Utils] Failed to draw rank image for tier ${rankTier}:`, error.message);
            drawFallbackRankIcon(ctx, rankTier, x, y, size);
        }
    } else {
        // Draw fallback rank icon
        drawFallbackRankIcon(ctx, rankTier, x, y, size);
    }
}

/**
 * Draws a fallback rank icon (colored circle with text)
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} rankTier - The rank tier number
 * @param {number} x - X position (center)
 * @param {number} y - Y position (center)
 * @param {number} size - Icon size
 */
function drawFallbackRankIcon(ctx, rankTier, x, y, size) {
    // Get rank color based on tier
    const color = getRankColor(rankTier);

    // Draw circle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size/2, 0, Math.PI * 2);
    ctx.fill();

    // Draw rank abbreviation
    const abbr = getRankAbbreviation(rankTier);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size/3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(abbr, x, y);
}

/**
 * Gets the color for a rank tier
 * @param {number} rankTier - The rank tier number
 * @returns {string} - Hex color code
 */
function getRankColor(rankTier) {
    if (rankTier === 0) return '#8D8D8D'; // Unranked
    if (rankTier >= 3 && rankTier <= 5) return '#4A4A4A'; // Iron
    if (rankTier >= 6 && rankTier <= 8) return '#CD7F32'; // Bronze
    if (rankTier >= 9 && rankTier <= 11) return '#C0C0C0'; // Silver
    if (rankTier >= 12 && rankTier <= 14) return '#FFD700'; // Gold
    if (rankTier >= 15 && rankTier <= 17) return '#00CED1'; // Platinum
    if (rankTier >= 18 && rankTier <= 20) return '#B57EDC'; // Diamond
    if (rankTier >= 21 && rankTier <= 23) return '#32CD32'; // Ascendant
    if (rankTier >= 24 && rankTier <= 26) return '#FF6347'; // Immortal
    if (rankTier === 27) return '#FFD700'; // Radiant
    return '#8D8D8D'; // Default
}

/**
 * Gets the abbreviation for a rank tier
 * @param {number} rankTier - The rank tier number
 * @returns {string} - Rank abbreviation
 */
function getRankAbbreviation(rankTier) {
    if (rankTier === 0) return 'UR';
    if (rankTier >= 3 && rankTier <= 5) return `I${rankTier - 2}`;
    if (rankTier >= 6 && rankTier <= 8) return `B${rankTier - 5}`;
    if (rankTier >= 9 && rankTier <= 11) return `S${rankTier - 8}`;
    if (rankTier >= 12 && rankTier <= 14) return `G${rankTier - 11}`;
    if (rankTier >= 15 && rankTier <= 17) return `P${rankTier - 14}`;
    if (rankTier >= 18 && rankTier <= 20) return `D${rankTier - 17}`;
    if (rankTier >= 21 && rankTier <= 23) return `A${rankTier - 20}`;
    if (rankTier >= 24 && rankTier <= 26) return `Im${rankTier - 23}`;
    if (rankTier === 27) return 'R';
    return '?';
}

/**
 * Converts hex color to RGB object
 * @param {string} hex - Hex color code
 * @returns {Object} - RGB object with r, g, b properties
 */
function hexToRgb(hex) {
    // Remove # if present
    hex = hex.replace('#', '');

    // Parse hex values
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return { r, g, b };
}

/**
 * Clears the image cache (useful for memory management)
 */
function clearImageCache() {
    imageCache.clear();
    console.log('[Canvas Utils] Image cache cleared');
}

/**
 * Clears the rank image cache
 */
function clearRankImageCache() {
    rankImageCache.clear();
    console.log('[Canvas Utils] Rank image cache cleared');
}

module.exports = {
    createValorantBackground,
    createAccentBorder,
    drawGlowText,
    drawPlayerSlotBackground,
    loadImageFromURL,
    loadImageFromFile,
    loadRankImages,
    drawRankIcon,
    drawFallbackRankIcon,
    getRankColor,
    getRankAbbreviation,
    hexToRgb,
    clearImageCache,
    clearRankImageCache
};
