// ===============================================
// VALORANT API CLIENT
// ===============================================
// Handles all HTTP requests to the Henrik Dev Valorant API
// with timeout handling and error recovery

const https = require('https');
const { loadImage } = require('canvas');

// API Configuration
const API_KEY = process.env.VALORANT_API_KEY;
const BASE_URL = 'https://api.henrikdev.xyz/valorant';

// Validate API key is present
if (!API_KEY) {
    console.error('VALORANT_API_KEY is not set in environment variables!');
    throw new Error('Missing VALORANT_API_KEY environment variable');
}

/**
 * Makes an API request to the Henrik Dev Valorant API
 * @param {string} endpoint - The API endpoint (e.g., '/v1/account/name/tag')
 * @returns {Promise<Object>} - The API response data
 */
async function makeAPIRequest(endpoint) {
    return new Promise((resolve, reject) => {
        const url = new URL(`${BASE_URL}${endpoint}`);

        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
                'Authorization': API_KEY,
                'Accept': '*/*',
                'User-Agent': 'DiscordBot/1.0'
            },
            timeout: 10000 // 10 second timeout
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (data.trim() === '') {
                        req.destroy(); // Ensure request is destroyed on error
                        reject(new Error('Empty response from API'));
                        return;
                    }
                    const jsonData = JSON.parse(data);
                    console.log(`[API Client] API Response for ${endpoint}:`, jsonData.status || 'No status');
                    resolve(jsonData);
                } catch (error) {
                    console.error('[API Client] Failed to parse API response:', data);
                    req.destroy(); // Ensure request is destroyed on parse error
                    reject(new Error('Failed to parse API response: ' + error.message));
                }
            });

            // Handle response errors
            res.on('error', (error) => {
                console.error('[API Client] Response stream error:', error.message);
                req.destroy();
                reject(new Error('Response error: ' + error.message));
            });
        });

        req.on('timeout', () => {
            req.destroy(); // Destroy request to free resources
            reject(new Error('API request timeout - please try again later'));
        });

        req.on('error', (error) => {
            console.error('[API Client] API Request error:', error.message);
            req.destroy(); // Ensure request is destroyed on error
            reject(new Error('Network error: ' + error.message));
        });

        req.end();
    });
}

/**
 * Loads an image from a URL with timeout
 * @param {string} url - The image URL
 * @returns {Promise<Image>} - The loaded image
 */
async function loadImageFromURL(url) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Image load timeout'));
        }, 5000); // 5 second timeout

        https.get(url, (res) => {
            const chunks = [];

            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                clearTimeout(timeout);
                const buffer = Buffer.concat(chunks);
                loadImage(buffer)
                    .then(resolve)
                    .catch(reject);
            });
        }).on('error', (error) => {
            clearTimeout(timeout);
            console.error('[API Client] Image load error:', error.message);
            reject(error);
        });
    });
}

/**
 * Fetches account data for a player
 * @param {string} name - Player name
 * @param {string} tag - Player tag (without #)
 * @returns {Promise<Object>} - Account data
 */
async function getAccountData(name, tag) {
    return await makeAPIRequest(`/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
}

/**
 * Fetches MMR data for a player
 * @param {string} region - Player region
 * @param {string} name - Player name
 * @param {string} tag - Player tag (without #)
 * @returns {Promise<Object>} - MMR data
 */
async function getMMRData(region, name, tag) {
    return await makeAPIRequest(`/v2/mmr/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
}

/**
 * Fetches stored match data for a player (v1 endpoint - comprehensive)
 * @param {string} region - Player region
 * @param {string} name - Player name
 * @param {string} tag - Player tag (without #)
 * @returns {Promise<Object>} - Match data
 */
async function getStoredMatches(region, name, tag) {
    return await makeAPIRequest(`/v1/stored-matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
}

/**
 * Fetches match data for a player (v4 endpoint - legacy fallback)
 * @param {string} region - Player region
 * @param {string} name - Player name
 * @param {string} tag - Player tag (without #)
 * @returns {Promise<Object>} - Match data
 */
async function getMatches(region, name, tag) {
    return await makeAPIRequest(`/v4/matches/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
}

module.exports = {
    makeAPIRequest,
    loadImageFromURL,
    getAccountData,
    getMMRData,
    getStoredMatches,
    getMatches,
    API_KEY,
    BASE_URL
};
