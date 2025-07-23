const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ===============================================
// VALORANT STATS & API HANDLER
// ===============================================
// This handler manages Valorant account registration and stats display
// Commands: !valstats, !valprofile (user), !valtest, !valreset (admin)
// 
// IMPORTANT: This is separate from the Valorant TEAM BUILDER
// Team Builder uses: !valorant, @Valorant role, valorant_ button prefixes
// This handler uses: !valstats, !valprofile, valstats_ button prefixes
// ===============================================

// API Configuration
const API_KEY = 'HDEV-c58e378a-b84e-45bd-bced-aae3e742c2c3';
const BASE_URL = 'https://api.henrikdev.xyz/valorant';

// File paths for persistent storage
const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'valorant_users.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('Created data directory:', DATA_DIR);
}

// Store user registrations (loaded from file)
let userRegistrations = new Map();

// Valid regions
const VALID_REGIONS = ['na', 'eu', 'ap', 'kr', 'latam', 'br'];

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

// Function to load user registrations from file
function loadUserRegistrations() {
    try {
        if (fs.existsSync(USERS_FILE)) {
            const fileData = fs.readFileSync(USERS_FILE, 'utf8');
            const data = JSON.parse(fileData);
            
            // Convert object back to Map
            userRegistrations = new Map(Object.entries(data));
            console.log(`Loaded ${userRegistrations.size} registered Valorant users from file`);
            
            // Log loaded users for debugging
            userRegistrations.forEach((userData, userId) => {
                console.log(`- ${userData.name}#${userData.tag} (${userData.region}) - Discord ID: ${userId}`);
            });
        } else {
            console.log('No existing Valorant users file found, starting fresh');
            userRegistrations = new Map();
        }
    } catch (error) {
        console.error('Error loading user registrations:', error);
        userRegistrations = new Map();
    }
}

// Function to save user registrations to file
function saveUserRegistrations() {
    try {
        // Convert Map to object for JSON storage
        const dataObject = Object.fromEntries(userRegistrations);
        fs.writeFileSync(USERS_FILE, JSON.stringify(dataObject, null, 2), 'utf8');
        console.log(`Saved ${userRegistrations.size} registered Valorant users to file`);
    } catch (error) {
        console.error('Error saving user registrations:', error);
    }
}

// Function to add a new user registration
function addUserRegistration(userId, userData) {
    userRegistrations.set(userId, userData);
    saveUserRegistrations();
    console.log(`Added registration for user ${userId}: ${userData.name}#${userData.tag} (${userData.region})`);
}

// Function to remove a user registration
function removeUserRegistration(userId) {
    const userData = userRegistrations.get(userId);
    if (userData) {
        userRegistrations.delete(userId);
        saveUserRegistrations();
        console.log(`Removed registration for user ${userId}: ${userData.name}#${userData.tag}`);
        return true;
    }
    return false;
}

// Function to load rank image from filesystem
async function loadRankImage(rankTier) {
    try {
        const rankInfo = RANK_MAPPING[rankTier] || RANK_MAPPING[0];
        const imagePath = path.join(__dirname, '..', 'images', rankInfo.image);
        
        if (fs.existsSync(imagePath)) {
            return await loadImage(imagePath);
        } else {
            console.warn(`Rank image not found: ${imagePath}`);
            return null;
        }
    } catch (error) {
        console.error('Error loading rank image:', error);
        return null;
    }
}

// Function to create a fallback rank icon
function createFallbackRankIcon(ctx, x, y, size, rankInfo) {
    ctx.fillStyle = rankInfo.color;
    ctx.beginPath();
    ctx.arc(x + size/2, y + size/2, size/2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Add rank initial
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size/3}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText(rankInfo.name.charAt(0), x + size/2, y + size/2 + size/10);
}

// Enhanced function to make API requests with timeout and error handling
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
                        reject(new Error('Empty response from API'));
                        return;
                    }
                    const jsonData = JSON.parse(data);
                    console.log(`API Response for ${endpoint}:`, jsonData.status || 'No status');
                    resolve(jsonData);
                } catch (error) {
                    console.error('Failed to parse API response:', data);
                    reject(new Error('Failed to parse API response: ' + error.message));
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('API request timeout - please try again later'));
        });

        req.on('error', (error) => {
            console.error('API Request error:', error.message);
            reject(new Error('Network error: ' + error.message));
        });

        req.end();
    });
}

// Function to load image from URL with timeout
async function loadImageFromURL(url) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, { timeout: 5000 }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                try {
                    const buffer = Buffer.concat(chunks);
                    resolve(loadImage(buffer));
                } catch (error) {
                    reject(error);
                }
            });
        });
        
        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Image load timeout'));
        });
        
        request.on('error', reject);
    });
}

// Function to get user registration data
function getUserRegistration(userId) {
    return userRegistrations.get(userId);
}

// Function to get or fetch user rank data
async function getUserRankData(userId) {
    const registration = userRegistrations.get(userId);
    if (!registration) return null;

    try {
        const mmrData = await makeAPIRequest(`/v2/mmr/${registration.region}/${encodeURIComponent(registration.name)}/${encodeURIComponent(registration.tag)}`);
        if (mmrData.status === 200 && mmrData.data.current_data) {
            return mmrData.data.current_data;
        }
    } catch (error) {
        console.error('Error fetching rank data:', error);
    }
    return null;
}

// Function to get all registered users (for admin purposes)
function getAllRegisteredUsers() {
    return Array.from(userRegistrations.entries()).map(([userId, userData]) => ({
        discordId: userId,
        ...userData
    }));
}

// Function to create user stats visualization - Fix parameter list
async function createStatsVisualization(accountData, mmrData, matchData, userAvatar, registration) {
    const canvas = createCanvas(1000, 800);
    const ctx = canvas.getContext('2d');
    
    // Enhanced background with pattern
    const gradient = ctx.createLinearGradient(0, 0, 1000, 800);
    gradient.addColorStop(0, '#0a0e13');
    gradient.addColorStop(0.3, '#1e2328');
    gradient.addColorStop(0.7, '#2c3e50');
    gradient.addColorStop(1, '#0a0e13');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 800);
    
    // Add subtle pattern overlay
    ctx.fillStyle = 'rgba(255, 70, 84, 0.03)';
    for (let i = 0; i < 1000; i += 50) {
        for (let j = 0; j < 800; j += 50) {
            if ((i + j) % 100 === 0) {
                ctx.fillRect(i, j, 25, 25);
            }
        }
    }
    
    // Enhanced Valorant-style accents
    const accentGradient = ctx.createLinearGradient(0, 0, 1000, 0);
    accentGradient.addColorStop(0, '#ff4654');
    accentGradient.addColorStop(0.5, '#ff6b7a');
    accentGradient.addColorStop(1, '#ff4654');
    ctx.fillStyle = accentGradient;
    ctx.fillRect(0, 0, 1000, 8);
    ctx.fillRect(0, 792, 1000, 8);
    ctx.fillRect(0, 0, 8, 800);
    ctx.fillRect(992, 0, 8, 800);
    
    // Enhanced header section
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🎯 VALORANT PLAYER PROFILE', 500, 50);
    
    // Subtitle
    ctx.font = '16px Arial';
    ctx.fillStyle = '#cccccc';
    ctx.fillText('Powered by HenrikDev API & Enhanced Visualization', 500, 75);
    
    // User info section with enhanced styling
    const infoBoxGradient = ctx.createLinearGradient(50, 100, 950, 200);
    infoBoxGradient.addColorStop(0, 'rgba(255, 70, 84, 0.1)');
    infoBoxGradient.addColorStop(1, 'rgba(255, 107, 122, 0.1)');
    ctx.fillStyle = infoBoxGradient;
    ctx.fillRect(50, 100, 900, 100);
    ctx.strokeStyle = '#ff4654';
    ctx.lineWidth = 2;
    ctx.strokeRect(50, 100, 900, 100);
    
    try {
        // Enhanced user avatar with glow effect
        if (userAvatar) {
            const avatar = await loadImageFromURL(userAvatar);
            
            // Glow effect
            ctx.shadowColor = '#ff4654';
            ctx.shadowBlur = 15;
            ctx.save();
            ctx.beginPath();
            ctx.arc(150, 150, 45, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, 105, 105, 90, 90);
            ctx.restore();
            ctx.shadowBlur = 0;
            
            // Enhanced avatar border with gradient
            const borderGradient = ctx.createRadialGradient(150, 150, 40, 150, 150, 50);
            borderGradient.addColorStop(0, '#ff4654');
            borderGradient.addColorStop(1, '#ff6b7a');
            ctx.strokeStyle = borderGradient;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(150, 150, 45, 0, Math.PI * 2);
            ctx.stroke();
        }
    } catch (error) {
        // Enhanced fallback avatar
        const avatarGradient = ctx.createRadialGradient(150, 150, 0, 150, 150, 45);
        avatarGradient.addColorStop(0, '#ff6b7a');
        avatarGradient.addColorStop(1, '#ff4654');
        ctx.fillStyle = avatarGradient;
        ctx.beginPath();
        ctx.arc(150, 150, 45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('👤', 150, 165);
    }
    
    // Enhanced player name and info
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${accountData.name}#${accountData.tag}`, 220, 135);
    
    ctx.font = '16px Arial';
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText(`🎮 Level ${accountData.account_level} • 🌍 Region: ${accountData.region.toUpperCase()}`, 220, 160);
    ctx.fillText(`📅 Last Updated: ${new Date(accountData.updated_at).toLocaleDateString()}`, 220, 180);
    
    // Enhanced current rank section
    if (mmrData && mmrData.current_data) {
        const currentRank = mmrData.current_data;
        const rankInfo = RANK_MAPPING[currentRank.currenttier] || RANK_MAPPING[0];
        
        // Enhanced rank box with gradient
        const rankBoxGradient = ctx.createLinearGradient(50, 220, 950, 350);
        rankBoxGradient.addColorStop(0, 'rgba(255, 70, 84, 0.15)');
        rankBoxGradient.addColorStop(1, 'rgba(255, 107, 122, 0.15)');
        ctx.fillStyle = rankBoxGradient;
        ctx.fillRect(50, 220, 900, 130);
        ctx.strokeStyle = '#ff4654';
        ctx.lineWidth = 3;
        ctx.strokeRect(50, 220, 900, 130);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('🏆 CURRENT COMPETITIVE RANK', 80, 250);
        
        // Load and display rank image
        const rankImage = await loadRankImage(currentRank.currenttier);
        if (rankImage) {
            ctx.drawImage(rankImage, 80, 260, 60, 60);
        } else {
            createFallbackRankIcon(ctx, 80, 260, 60, rankInfo);
        }
        
        ctx.fillStyle = rankInfo.color;
        ctx.font = 'bold 32px Arial';
        ctx.fillText(rankInfo.name, 160, 295);
        
        if (currentRank.ranking_in_tier !== undefined) {
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px Arial';
            ctx.fillText(`${currentRank.ranking_in_tier} RR`, 160, 320);
        }
        
        if (currentRank.mmr_change_to_last_game) {
            const change = currentRank.mmr_change_to_last_game;
            ctx.fillStyle = change > 0 ? '#00ff88' : '#ff4444';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`Last Game: ${change > 0 ? '+' : ''}${change} RR`, 400, 295);
        }
        
        // Enhanced peak rank display
        if (mmrData.highest_rank) {
            const peakRank = RANK_MAPPING[mmrData.highest_rank.tier] || RANK_MAPPING[0];
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 18px Arial';
            ctx.fillText('🌟 Peak Rank:', 600, 280);
            
            const peakRankImage = await loadRankImage(mmrData.highest_rank.tier);
            if (peakRankImage) {
                ctx.drawImage(peakRankImage, 600, 285, 40, 40);
            } else {
                createFallbackRankIcon(ctx, 600, 285, 40, peakRank);
            }
            
            ctx.fillStyle = peakRank.color;
            ctx.font = 'bold 20px Arial';
            ctx.fillText(peakRank.name, 650, 310);
        }
    }
    
    // Enhanced recent matches section - Filter for competitive matches only
    if (matchData && matchData.length > 0) {
        // Filter for competitive matches only
        const competitiveMatches = matchData.filter(match => 
            match.metadata && match.metadata.queue.name && match.metadata.queue.name.toLowerCase() === 'competitive'
        );
        
        if (competitiveMatches.length > 0) {
            // Section header with gradient background
            const matchesHeaderGradient = ctx.createLinearGradient(50, 370, 950, 400);
            matchesHeaderGradient.addColorStop(0, 'rgba(255, 70, 84, 0.2)');
            matchesHeaderGradient.addColorStop(1, 'rgba(255, 107, 122, 0.2)');
            ctx.fillStyle = matchesHeaderGradient;
            ctx.fillRect(50, 370, 900, 30);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('📊 RECENT COMPETITIVE MATCHES', 80, 390);
            
            const recentMatches = competitiveMatches.slice(0, 6);
            recentMatches.forEach((match, index) => {
                const y = 420 + index * 60;
                // Fix: Use accountData.name instead of registration.name
                const player = match.players.find(p => p.name.toLowerCase() === accountData.name.toLowerCase());
                
                if (!player) return;
                
                const won = player.team_id === (match.teams.find(t => t.won) || {}).team_id;
                
                // Enhanced match result background with gradient
                const matchGradient = ctx.createLinearGradient(50, y - 25, 950, y + 35);
                if (won) {
                    matchGradient.addColorStop(0, 'rgba(0, 255, 136, 0.15)');
                    matchGradient.addColorStop(1, 'rgba(0, 200, 100, 0.15)');
                } else {
                    matchGradient.addColorStop(0, 'rgba(255, 68, 68, 0.15)');
                    matchGradient.addColorStop(1, 'rgba(200, 50, 50, 0.15)');
                }
                ctx.fillStyle = matchGradient;
                ctx.fillRect(50, y - 25, 900, 50);
                
                ctx.strokeStyle = won ? '#00ff88' : '#ff4444';
                ctx.lineWidth = 2;
                ctx.strokeRect(50, y - 25, 900, 50);
                
                // Match result with enhanced styling using emojis
                ctx.fillStyle = won ? '#00ff88' : '#ff4444';
                ctx.font = 'bold 16px Arial';
                ctx.fillText(won ? '🔱 WIN' : '❌ LOSS', 80, y);
                
                // Map name with icon
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 14px Arial';
                ctx.fillText(`🗺️ ${match.metadata.map.name}`, 160, y);
                
                // Agent name
                ctx.fillText(`👤 ${player.agent.name}`, 320, y);
                
                // Enhanced KDA display
                const kda = `${player.stats.kills}/${player.stats.deaths}/${player.stats.assists}`;
                const kdRatio = player.stats.deaths > 0 ? (player.stats.kills / player.stats.deaths).toFixed(2) : player.stats.kills.toFixed(2);
                ctx.fillText(`⚔️ ${kda} (${kdRatio} K/D)`, 450, y);
                
                // Score with color coding
                const acs = player.stats.score;
                ctx.fillStyle = acs >= 250 ? '#00ff88' : acs >= 200 ? '#ffff00' : acs >= 150 ? '#ff8800' : '#ff4444';
                ctx.fillText(`📈 ${acs} ACS`, 600, y);
                
                // Date
                const matchDate = new Date(match.metadata.started_at);
                ctx.fillStyle = '#cccccc';
                ctx.fillText(`📅 ${matchDate.toLocaleDateString()}`, 720, y);
                
                // Enhanced headshot percentage
                const totalShots = player.stats.headshots + player.stats.bodyshots + player.stats.legshots;
                const hsPercent = totalShots > 0 ? Math.round((player.stats.headshots / totalShots) * 100) : 0;
                ctx.fillStyle = hsPercent >= 30 ? '#00ff88' : hsPercent >= 20 ? '#ffff00' : '#ff8800';
                ctx.fillText(`🎯 ${hsPercent}%`, 820, y);
            });
        } else {
            // No competitive matches found
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'left';
            ctx.fillText('📊 NO RECENT COMPETITIVE MATCHES FOUND', 80, 420);
            
            ctx.font = '16px Arial';
            ctx.fillStyle = '#cccccc';
            ctx.fillText('Play some competitive matches to see your recent performance here!', 80, 450);
        }
    }
    
    // Enhanced footer with version info
    ctx.fillStyle = '#666666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Powered by HenrikDev Valorant API • Enhanced Visual Stats v2.0 • Data stored persistently', 500, 780);
    
    return canvas;
}

// Load existing registrations on startup
loadUserRegistrations();

// Export API handler functions and event handlers separately
module.exports = {
    // Data functions
    getUserRegistration,
    getUserRankData,
    loadRankImage,
    RANK_MAPPING,
    createFallbackRankIcon,
    getAllRegisteredUsers,
    
    // Initialize function to set up event handlers
    init: (client) => {
        // Only add event listeners if not already added
        if (!client._valorantApiHandlerInitialized) {
            console.log('Valorant API Handler with Persistent Storage loaded successfully!');
            console.log(`Registered regions: ${VALID_REGIONS.join(', ')}`);
            console.log('Commands: !valstats, !valprofile, !valmatches, !valtest (admin), !valreset (admin), !vallist (admin)');
            console.log(`Data file: ${USERS_FILE}`);
            console.log(`Loaded ${userRegistrations.size} registered users`);

            client.on('messageCreate', async (message) => {
                if (message.author.bot) return;
                if (!message.guild) return;

                const args = message.content.split(' ');
                const command = args[0].toLowerCase();

                // Stats commands
                if (command === '!valstats' || command === '!valprofile') {
                    const userId = message.author.id;
                    const registration = userRegistrations.get(userId);

                    if (!registration) {
                        await showRegistrationPrompt(message);
                    } else {
                        await showUserStats(message, registration);
                    }
                }

                // New matches command
                if (command === '!valmatches') {
                    const userId = message.author.id;
                    const registration = userRegistrations.get(userId);

                    if (!registration) {
                        await showRegistrationPrompt(message);
                    } else {
                        await showUserMatches(message, registration);
                    }
                }

                // Admin commands
                if (command === '!valreset' && message.member.permissions.has('ADMINISTRATOR')) {
                    const targetUser = message.mentions.users.first();
                    if (targetUser) {
                        if (removeUserRegistration(targetUser.id)) {
                            message.reply(`✅ Reset Valorant registration for ${targetUser.username}`);
                        } else {
                            message.reply(`❌ ${targetUser.username} was not registered`);
                        }
                    }
                }

                if (command === '!vallist' && message.member.permissions.has('ADMINISTRATOR')) {
                    const allUsers = getAllRegisteredUsers();
                    if (allUsers.length === 0) {
                        return message.reply('📋 No users are currently registered.');
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('📋 Registered Valorant Users')
                        .setColor('#ff4654')
                        .setDescription(`Total registered users: **${allUsers.length}**`)
                        .setTimestamp();

                    const userList = allUsers.map((user, index) => {
                        const discordUser = client.users.cache.get(user.discordId);
                        const discordName = discordUser ? discordUser.username : 'Unknown User';
                        return `${index + 1}. **${user.name}#${user.tag}** (${user.region.toUpperCase()}) - ${discordName}`;
                    }).join('\n');

                    embed.addFields({
                        name: '👥 Users',
                        value: userList.length > 1024 ? userList.substring(0, 1021) + '...' : userList,
                        inline: false
                    });

                    message.reply({ embeds: [embed] });
                }

                if (command === '!valtest' && message.member.permissions.has('ADMINISTRATOR')) {
                    const testEmbed = new EmbedBuilder()
                        .setTitle('🔧 Testing Valorant API...')
                        .setColor('#ff4654')
                        .setDescription('Testing connection to HenrikDev API...')
                        .setTimestamp();

                    const testMessage = await message.channel.send({ embeds: [testEmbed] });

                    try {
                        const testData = await makeAPIRequest('/v1/account/Riot/123');
                        
                        const resultEmbed = new EmbedBuilder()
                            .setTitle('✅ API Test Results')
                            .setColor('#00ff00')
                            .addFields(
                                { name: 'Status', value: testData.status ? testData.status.toString() : 'No status', inline: true },
                                { name: 'Data File', value: fs.existsSync(USERS_FILE) ? '✅ Exists' : '❌ Missing', inline: true },
                                { name: 'Registered Users', value: userRegistrations.size.toString(), inline: true },
                                { name: 'Response', value: `\`\`\`json\n${JSON.stringify(testData, null, 2).substring(0, 1000)}\n\`\`\``, inline: false }
                            )
                            .setTimestamp();

                        await testMessage.edit({ embeds: [resultEmbed] });
                    } catch (error) {
                        const errorEmbed = new EmbedBuilder()
                            .setTitle('❌ API Test Failed')
                            .setColor('#ff0000')
                            .addFields(
                                { name: 'Error', value: error.message, inline: false },
                                { name: 'Data File', value: fs.existsSync(USERS_FILE) ? '✅ Exists' : '❌ Missing', inline: true },
                                { name: 'Registered Users', value: userRegistrations.size.toString(), inline: true },
                                { name: 'Full Error', value: `\`\`\`\n${error.stack.substring(0, 1000)}\n\`\`\``, inline: false }
                            )
                            .setTimestamp();

                        await testMessage.edit({ embeds: [errorEmbed] });
                    }
                }
            });

            client.on('interactionCreate', async (interaction) => {
                if (interaction.isButton()) {
                    if (interaction.customId.startsWith('valstats_register_')) {
                        const userId = interaction.customId.split('_')[2];
                        if (interaction.user.id !== userId) {
                            return interaction.reply({
                                content: '❌ This registration is not for you!',
                                ephemeral: true
                            });
                        }
                        await showRegistrationModal(interaction);
                    }

                    if (interaction.customId.startsWith('valstats_refresh_')) {
                        const userId = interaction.customId.split('_')[2];
                        if (interaction.user.id !== userId) {
                            return interaction.reply({
                                content: '❌ This is not your stats panel!',
                                ephemeral: true
                            });
                        }

                        const registration = userRegistrations.get(userId);
                        if (!registration) {
                            return interaction.reply({
                                content: '❌ You are not registered! Use `!valstats` to register.',
                                ephemeral: true
                            });
                        }

                        await interaction.deferUpdate();
                        await showUserStats({ 
                            channel: interaction.channel, 
                            author: interaction.user 
                        }, registration);
                    }

                    if (interaction.customId.startsWith('valmatches_refresh_')) {
                        const userId = interaction.customId.split('_')[2];
                        if (interaction.user.id !== userId) {
                            return interaction.reply({
                                content: '❌ This is not your matches panel!',
                                ephemeral: true
                            });
                        }

                        const registration = userRegistrations.get(userId);
                        if (!registration) {
                            return interaction.reply({
                                content: '❌ You are not registered! Use `!valstats` to register.',
                                ephemeral: true
                            });
                        }

                        await interaction.deferUpdate();
                        await showUserMatches({ 
                            channel: interaction.channel, 
                            author: interaction.user 
                        }, registration);
                    }

                    if (interaction.customId.startsWith('valstats_details_')) {
                        const userId = interaction.customId.split('_')[2];
                        if (interaction.user.id !== userId) {
                            return interaction.reply({
                                content: '❌ This is not your stats panel!',
                                ephemeral: true
                            });
                        }

                        return interaction.reply({
                            content: '🚧 Detailed match view coming soon! For now, check your recent matches in the stats image above.',
                            ephemeral: true
                        });
                    }
                }

                if (interaction.isModalSubmit()) {
                    if (interaction.customId.startsWith('valstats_registration_')) {
                        await handleRegistrationSubmission(interaction);
                    }
                }
            });

            client._valorantApiHandlerInitialized = true;
        }

        // Helper functions
        async function showRegistrationPrompt(message) {
            const embed = new EmbedBuilder()
                .setTitle('🔐 Valorant Registration Required')
                .setColor('#ff4654')
                .setDescription('You need to register your Valorant account to use this feature!')
                .addFields(
                    { name: '📝 What we need:', value: '• Your Valorant username and tag (e.g., Player#1234)\n• Your region (e.g., na, eu, ap)', inline: false },
                    { name: '🔒 Privacy:', value: 'Your data is stored securely in our local database file. No personal Discord data is saved.', inline: false },
                    { name: '🌍 Valid Regions:', value: VALID_REGIONS.join(', ').toUpperCase(), inline: false },
                    { name: '🎯 Team Builder Integration:', value: 'Once registered, your rank will show in team builder!', inline: false },
                    { name: '💾 Persistent Storage:', value: 'Your registration will persist even if the bot restarts!', inline: false }
                )
                .setFooter({ text: 'Click the button below to register!' })
                .setTimestamp();

            const registerButton = new ButtonBuilder()
                .setCustomId(`valstats_register_${message.author.id}`)
                .setLabel('Register Now')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝');

            const row = new ActionRowBuilder().addComponents(registerButton);
            return message.channel.send({ embeds: [embed], components: [row] });
        }

        async function showRegistrationModal(interaction) {
            const modal = new ModalBuilder()
                .setCustomId(`valstats_registration_${interaction.user.id}`)
                .setTitle('🎯 Valorant Account Registration');

            const usernameInput = new TextInputBuilder()
                .setCustomId('valorant_username')
                .setLabel('Valorant Username and Tag')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., PlayerName#1234')
                .setRequired(true)
                .setMaxLength(50);

            const regionInput = new TextInputBuilder()
                .setCustomId('valorant_region')
                .setLabel('Region')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., na, eu, ap, kr, latam, br')
                .setRequired(true)
                .setMaxLength(10);

            const firstRow = new ActionRowBuilder().addComponents(usernameInput);
            const secondRow = new ActionRowBuilder().addComponents(regionInput);

            modal.addComponents(firstRow, secondRow);
            await interaction.showModal(modal);
        }

        async function handleRegistrationSubmission(interaction) {
            const username = interaction.fields.getTextInputValue('valorant_username');
            const region = interaction.fields.getTextInputValue('valorant_region').toLowerCase();

            if (!username.includes('#') || username.split('#').length !== 2) {
                return interaction.reply({
                    content: '❌ Invalid username format! Please use the format: Username#Tag (e.g., Player#1234)',
                    ephemeral: true
                });
            }

            if (!VALID_REGIONS.includes(region)) {
                return interaction.reply({
                    content: `❌ Invalid region! Valid regions are: ${VALID_REGIONS.join(', ').toUpperCase()}`,
                    ephemeral: true
                });
            }

            const [name, tag] = username.split('#');
            await interaction.deferReply({ ephemeral: true });

            try {
                console.log(`Testing account: ${name}#${tag} in region ${region}`);
                const accountData = await makeAPIRequest(`/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
                
                if (accountData.status !== 200) {
                    return interaction.editReply({
                        content: `❌ Could not find a Valorant account with that username and tag. Please check your spelling and try again.\n\nAPI Response: ${accountData.error || 'Unknown error'}`
                    });
                }

                const userData = {
                    name: name,
                    tag: tag,
                    region: region,
                    puuid: accountData.data.puuid,
                    registeredAt: new Date().toISOString()
                };

                addUserRegistration(interaction.user.id, userData);

                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Registration Successful!')
                    .setColor('#00ff00')
                    .setDescription(`Successfully registered your Valorant account: **${name}#${tag}**`)
                    .addFields(
                        { name: '🌍 Region', value: region.toUpperCase(), inline: true },
                        { name: '⭐ Level', value: accountData.data.account_level.toString(), inline: true },
                        { name: '💾 Storage', value: 'Saved to persistent database', inline: true },
                        { name: '🚀 Next Step', value: 'Use `!valstats` or `!valprofile` to view your stats!', inline: false },
                        { name: '🎯 Team Builder', value: 'Your rank will now show when you join Valorant teams!', inline: false }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });

            } catch (error) {
                console.error('Registration error:', error);
                await interaction.editReply({
                    content: '❌ There was an error validating your account. Please try again later or contact an administrator.\n\nError: ' + error.message
                });
            }
        }

        async function showUserStats(message, registration) {
            const loadingEmbed = new EmbedBuilder()
                .setTitle('🔄 Loading Valorant Stats...')
                .setColor('#ff4654')
                .setDescription('Fetching your latest data from Riot Games...')
                .setTimestamp();

            const loadingMessage = await message.channel.send({ embeds: [loadingEmbed] });

            try {
                console.log(`Fetching stats for: ${registration.name}#${registration.tag} in ${registration.region}`);
                
                const [accountData, mmrData, matchData] = await Promise.all([
                    makeAPIRequest(`/v1/account/${encodeURIComponent(registration.name)}/${encodeURIComponent(registration.tag)}`),
                    makeAPIRequest(`/v2/mmr/${registration.region}/${encodeURIComponent(registration.name)}/${encodeURIComponent(registration.tag)}`),
                    makeAPIRequest(`/v4/matches/${registration.region}/pc/${encodeURIComponent(registration.name)}/${encodeURIComponent(registration.tag)}`)
                ]);

                console.log('Account API status:', accountData.status);
                console.log('MMR API status:', mmrData.status);
                console.log('Matches API status:', matchData.status);

                if (accountData.status !== 200) {
                    throw new Error(`Account not found - Status: ${accountData.status}`);
                }

                const userAvatar = message.author.displayAvatarURL({ extension: 'png', size: 128 });
                // Fix: Pass registration as the last parameter
                const statsImage = await createStatsVisualization(
                    accountData.data, 
                    mmrData.status === 200 ? mmrData.data : null,
                    matchData.status === 200 ? matchData.data : [],
                    userAvatar,
                    registration  // Add this parameter
                );

                const attachment = new AttachmentBuilder(statsImage.toBuffer(), { name: 'valorant-stats.png' });

                const statsEmbed = new EmbedBuilder()
                    .setTitle(`🎯 ${accountData.data.name}#${accountData.data.tag}`)
                    .setColor('#ff4654')
                    .setImage('attachment://valorant-stats.png')
                    .setFooter({ text: 'Stats are updated in real-time from Riot Games • Data stored persistently' })
                    .setTimestamp();

                if (mmrData.status === 200 && mmrData.data.current_data) {
                    const currentRank = mmrData.data.current_data;
                    const rankInfo = RANK_MAPPING[currentRank.currenttier] || RANK_MAPPING[0];
                    
                    statsEmbed.addFields({
                        name: '🏆 Current Rank',
                        value: `**${rankInfo.name}**${currentRank.ranking_in_tier !== undefined ? `\n${currentRank.ranking_in_tier} RR` : ''}`,
                        inline: true
                    });
                }

                if (matchData.status === 200 && matchData.data.length > 0) {
                    const recentMatch = matchData.data[0];
                    const player = recentMatch.players.find(p => p.name.toLowerCase() === registration.name.toLowerCase());
                    
                    if (player) {
                        const won = player.team_id === (recentMatch.teams.find(t => t.won) || {}).team_id;
                        statsEmbed.addFields({
                            name: '🎮 Last Match',
                            value: `${won ? '✅ Victory' : '❌ Defeat'}\n${recentMatch.metadata.map.name}`,
                            inline: true
                        });
                    }
                }

                statsEmbed.addFields({
                    name: '📊 Account Level',
                    value: accountData.data.account_level.toString(),
                    inline: true
                });

                const refreshButton = new ButtonBuilder()
                    .setCustomId(`valstats_refresh_${message.author.id}`)
                    .setLabel('Refresh Stats')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄');

                const detailsButton = new ButtonBuilder()
                    .setCustomId(`valstats_details_${message.author.id}`)
                    .setLabel('Match Details')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📋');

                const row = new ActionRowBuilder().addComponents(refreshButton, detailsButton);

                await loadingMessage.edit({ 
                    embeds: [statsEmbed], 
                    files: [attachment],
                    components: [row]
                });

            } catch (error) {
                console.error('Stats error:', error);
                
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error Loading Stats')
                    .setColor('#ff0000')
                    .setDescription('There was an error loading your Valorant stats. This could be due to:')
                    .addFields(
                        { name: '🔧 Possible Issues:', value: '• Riot API is temporarily down\n• Your account may be private\n• Network connectivity issues\n• Rate limit exceeded', inline: false },
                        { name: '💡 Try:', value: '• Wait a few minutes and try again\n• Check if your Valorant account is public\n• Contact an administrator if the issue persists', inline: false },
                        { name: '🐛 Error Details:', value: `\`${error.message}\``, inline: false }
                    )
                    .setTimestamp();

                await loadingMessage.edit({ embeds: [errorEmbed], components: [] });
            }
        }

        // New function to show detailed match history
        async function showUserMatches(message, registration) {
            const loadingEmbed = new EmbedBuilder()
                .setTitle('🔄 Loading Match History...')
                .setColor('#ff4654')
                .setDescription('Fetching your recent competitive matches...')
                .setTimestamp();

            const loadingMessage = await message.channel.send({ embeds: [loadingEmbed] });

            try {
                console.log(`Fetching matches for: ${registration.name}#${registration.tag} in ${registration.region}`);
                
                const [accountData, matchData] = await Promise.all([
                    makeAPIRequest(`/v1/account/${encodeURIComponent(registration.name)}/${encodeURIComponent(registration.tag)}`),
                    makeAPIRequest(`/v4/matches/${registration.region}/pc/${encodeURIComponent(registration.name)}/${encodeURIComponent(registration.tag)}`)
                ]);

                if (accountData.status !== 200) {
                    throw new Error(`Account not found - Status: ${accountData.status}`);
                }

                if (matchData.status !== 200 || !matchData.data || matchData.data.length === 0) {
                    const noMatchesEmbed = new EmbedBuilder()
                        .setTitle('📋 No Matches Found')
                        .setColor('#ffaa00')
                        .setDescription('No recent matches found for your account.')
                        .addFields(
                            { name: '💡 Tip', value: 'Play some Valorant matches and try again!', inline: false }
                        )
                        .setTimestamp();

                    return await loadingMessage.edit({ embeds: [noMatchesEmbed] });
                }

                // Filter for competitive matches only
                const competitiveMatches = matchData.data.filter(match => 
                    match.metadata && match.metadata.queue.name && match.metadata.queue.name.toLowerCase() === 'competitive'
                );

                if (competitiveMatches.length === 0) {
                    const noCompMatchesEmbed = new EmbedBuilder()
                        .setTitle('📋 No Competitive Matches Found')
                        .setColor('#ffaa00')
                        .setDescription('No recent competitive matches found for your account.')
                        .addFields(
                            { name: '💡 Tip', value: 'Play some competitive matches and try again!', inline: false }
                        )
                        .setTimestamp();

                    return await loadingMessage.edit({ embeds: [noCompMatchesEmbed] });
                }

                // Take the last 10 matches
                const recentMatches = competitiveMatches.slice(0, 10);
                
                // Calculate overall stats
                let totalKills = 0, totalDeaths = 0, totalAssists = 0, totalACS = 0;
                let wins = 0, losses = 0;
                const mapStats = {};
                const agentStats = {};

                const matchDetails = recentMatches.map((match, index) => {
                    const player = match.players.find(p => p.name.toLowerCase() === registration.name.toLowerCase());
                    if (!player) return null;

                    const won = player.team_id === (match.teams.find(t => t.won) || {}).team_id;
                    const matchDate = new Date(match.metadata.started_at);
                    
                    // Update overall stats
                    totalKills += player.stats.kills;
                    totalDeaths += player.stats.deaths;
                    totalAssists += player.stats.assists;
                    totalACS += player.stats.score;
                    
                    if (won) wins++; else losses++;
                    
                    // Track map stats
                    const mapName = match.metadata.map.name;
                    if (!mapStats[mapName]) mapStats[mapName] = { wins: 0, losses: 0, games: 0 };
                    mapStats[mapName].games++;
                    if (won) mapStats[mapName].wins++; else mapStats[mapName].losses++;
                    
                    // Track agent stats
                    const agentName = player.agent.name;
                    if (!agentStats[agentName]) agentStats[agentName] = { games: 0, wins: 0 };
                    agentStats[agentName].games++;
                    if (won) agentStats[agentName].wins++;

                    const kda = `${player.stats.kills}/${player.stats.deaths}/${player.stats.assists}`;
                    const kdRatio = player.stats.deaths > 0 ? (player.stats.kills / player.stats.deaths).toFixed(2) : player.stats.kills.toFixed(2);
                    const acs = player.stats.score;
                    
                    // Calculate headshot percentage
                    const totalShots = player.stats.headshots + player.stats.bodyshots + player.stats.legshots;
                    const hsPercent = totalShots > 0 ? Math.round((player.stats.headshots / totalShots) * 100) : 0;

                    return {
                        result: won ? '🔱 WIN' : '❌ LOSS',
                        map: mapName,
                        agent: agentName,
                        kda: kda,
                        kdRatio: kdRatio,
                        acs: acs,
                        hsPercent: hsPercent,
                        date: matchDate.toLocaleDateString(),
                        rounds: `${match.metadata.rounds_played} rounds`
                    };
                }).filter(match => match !== null);

                if (matchDetails.length === 0) {
                    throw new Error('No valid match data found');
                }

                // Calculate averages
                const avgKDA = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : totalKills.toFixed(2);
                const avgACS = Math.round(totalACS / matchDetails.length);
                const winRate = Math.round((wins / (wins + losses)) * 100);

                // Create the main embed
                const matchesEmbed = new EmbedBuilder()
                    .setTitle(`📊 Match History - ${accountData.data.name}#${accountData.data.tag}`)
                    .setColor('#ff4654')
                    .setDescription(`**Last ${matchDetails.length} Competitive Matches**`)
                    .addFields(
                        {
                            name: '📈 Overall Performance',
                            value: `**${wins}W - ${losses}L** (${winRate}% WR)\n` +
                                   `**${totalKills}/${totalDeaths}/${totalAssists}** (${avgKDA} K/D)\n` +
                                   `**${avgACS} Avg ACS**`,
                            inline: true
                        },
                        {
                            name: '🗺️ Most Played Maps',
                            value: Object.entries(mapStats)
                                .sort((a, b) => b[1].games - a[1].games)
                                .slice(0, 3)
                                .map(([map, stats]) => `**${map}**: ${stats.wins}W-${stats.losses}L`)
                                .join('\n') || 'No data',
                            inline: true
                        },
                        {
                            name: '👤 Most Played Agents',
                            value: Object.entries(agentStats)
                                .sort((a, b) => b[1].games - a[1].games)
                                .slice(0, 3)
                                .map(([agent, stats]) => `**${agent}**: ${stats.games} games (${Math.round((stats.wins/stats.games)*100)}% WR)`)
                                .join('\n') || 'No data',
                            inline: true
                        }
                    )
                    .setTimestamp();

                // Create detailed match list
                let matchList = '';
                matchDetails.forEach((match, index) => {
                    const resultColor = match.result.includes('WIN') ? '🟢' : '🔴';
                    matchList += `${resultColor} **${match.result}** | ${match.map}\n`;
                    matchList += `└ ${match.agent} • ${match.kda} (${match.kdRatio} K/D) • ${match.acs} ACS • ${match.hsPercent}% HS\n`;
                    matchList += `└ ${match.date} • ${match.rounds}\n\n`;
                });

                // Split into multiple embeds if needed (Discord has field value limits)
                const maxLength = 1024;
                if (matchList.length <= maxLength) {
                    matchesEmbed.addFields({
                        name: '🎮 Recent Matches',
                        value: matchList,
                        inline: false
                    });
                } else {
                    // Split into multiple fields
                    const chunks = [];
                    let currentChunk = '';
                    const lines = matchList.split('\n');
                    
                    for (const line of lines) {
                        if ((currentChunk + line + '\n').length > maxLength) {
                            if (currentChunk) chunks.push(currentChunk);
                            currentChunk = line + '\n';
                        } else {
                            currentChunk += line + '\n';
                        }
                    }
                    if (currentChunk) chunks.push(currentChunk);

                    chunks.forEach((chunk, index) => {
                        matchesEmbed.addFields({
                            name: index === 0 ? '🎮 Recent Matches' : '🎮 Recent Matches (cont.)',
                            value: chunk,
                            inline: false
                        });
                    });
                }

                // Add refresh button
                const refreshButton = new ButtonBuilder()
                    .setCustomId(`valmatches_refresh_${message.author.id}`)
                    .setLabel('Refresh Matches')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄');

                const backButton = new ButtonBuilder()
                    .setCustomId(`valstats_refresh_${message.author.id}`)
                    .setLabel('Back to Stats')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📊');

                const row = new ActionRowBuilder().addComponents(refreshButton, backButton);

                await loadingMessage.edit({ 
                    embeds: [matchesEmbed], 
                    components: [row]
                });

            } catch (error) {
                console.error('Matches error:', error);
                
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error Loading Matches')
                    .setColor('#ff0000')
                    .setDescription('There was an error loading your match history.')
                    .addFields(
                        { name: '🔧 Possible Issues:', value: '• Riot API is temporarily down\n• Network connectivity issues\n• No recent matches found', inline: false },
                        { name: '💡 Try:', value: '• Wait a few minutes and try again\n• Play some competitive matches\n• Contact an administrator if the issue persists', inline: false },
                        { name: '🐛 Error Details:', value: `\`${error.message}\``, inline: false }
                    )
                    .setTimestamp();

                await loadingMessage.edit({ embeds: [errorEmbed], components: [] });
            }
        }
    }
};