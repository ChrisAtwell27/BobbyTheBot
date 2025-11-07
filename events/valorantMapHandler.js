const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const { TARGET_GUILD_ID } = require('../config/guildConfig');
const { LimitedMap } = require('../utils/memoryUtils');

// ===============================================
// VALORANT MAP SELECTOR HANDLER WITH AUTO-CONVERSION
// ===============================================
// This handler manages random map selection with visuals and auto-converts images
// Commands: !valorantmap, !randommap, !mapveto (for map veto process)
// Features: Automatic image format conversion to .jpg
// ===============================================

// Map data with information about each Valorant map
const VALORANT_MAPS = {
    'Ascent': {
        fileName: 'Loading_Screen_Ascent.jpg',
        description: 'An open playground for small wars of position and attrition divide two sites on Ascent.',
        type: 'Standard',
        sites: 2,
        region: 'Italy',
        features: ['Mid Control', 'Catwalk', 'Long Sightlines']
    },
    'Bind': {
        fileName: 'Loading_Screen_Bind.jpg',
        description: 'Two sites. No middle. Gotta pick left or right. What\'s it going to be then?',
        type: 'Standard',
        sites: 2,
        region: 'Morocco',
        features: ['Teleporters', 'No Mid', 'Close Quarters']
    },
    'Breeze': {
        fileName: 'Loading_Screen_Breeze.jpg',
        description: 'Take in the sights of historic ruins or seaside caves on this tropical paradise.',
        type: 'Standard',
        sites: 2,
        region: 'Caribbean',
        features: ['Long Range', 'Open Spaces', 'Mechanical Doors']
    },
    'Fracture': {
        fileName: 'Loading_Screen_Fracture.jpg',
        description: 'A top-secret research facility split apart by a failed radianite experiment.',
        type: 'Standard',
        sites: 2,
        region: 'United States',
        features: ['Four Orbs', 'Ziplines', 'H-Shape Layout']
    },
    'Haven': {
        fileName: 'Loading_Screen_Haven.jpg',
        description: 'Beneath a forgotten monastery, three sites set the stage for large-scale engagements.',
        type: 'Standard',
        sites: 3,
        region: 'Bhutan',
        features: ['Three Sites', 'Garage', 'Long Rotations']
    },
    'Icebox': {
        fileName: 'Loading_Screen_Icebox.jpg',
        description: 'Your next battleground is a secret Kingdom excavation site overtaken by the arctic.',
        type: 'Standard',
        sites: 2,
        region: 'Russia',
        features: ['Vertical Combat', 'Ziplines', 'Tight Chokepoints']
    },
    'Lotus': {
        fileName: 'Loading_Screen_Lotus.jpg',
        description: 'A mysterious structure housing an astral conduit radiates with ancient power.',
        type: 'Standard',
        sites: 3,
        region: 'India',
        features: ['Three Sites', 'Rotating Doors', 'Silent Drop']
    },
    'Pearl': {
        fileName: 'Loading_Screen_Pearl.jpg',
        description: 'Attackers push down into the defenders on this two-site map set in a vibrant, underwater city.',
        type: 'Standard',
        sites: 2,
        region: 'Portugal',
        features: ['Mid Control', 'Art', 'Underwater Theme']
    },
    'Split': {
        fileName: 'Loading_Screen_Split.jpg',
        description: 'If you want to go far, you\'ll have to go up. A pair of sites split by an elevated center.',
        type: 'Standard',
        sites: 2,
        region: 'Japan',
        features: ['Vertical Combat', 'Ropes', 'Elevated Mid']
    },
    'Sunset': {
        fileName: 'Loading_Screen_Sunset.jpg',
        description: 'A vibrant community thrives in the heart of Los Angeles.',
        type: 'Standard',
        sites: 2,
        region: 'United States',
        features: ['Mid Control', 'Market', 'Courtyard']
    },
    'Abyss': {
        fileName: 'Loading_Screen_Abyss.jpg',
        description: 'A perilous battleground suspended high above an endless chasm.',
        type: 'Standard',
        sites: 2,
        region: 'Unknown',
        features: ['No Fall Damage Areas', 'Suspended Platforms', 'Unique Layout']
    },
    'Corrode': {
        fileName: 'Loading_Screen_Corrode.jpg',
        description: 'A harsh industrial complex where metal meets corrosion in this gritty battleground.',
        type: 'Standard',
        sites: 2,
        region: 'Industrial Complex',
        features: ['Industrial Theme', 'Multi-level Design', 'Close Combat']
    }
};

// File paths
const MAPS_DIR = path.join(__dirname, '..', 'ValorantMaps');
const BACKUP_DIR = path.join(MAPS_DIR, 'originals');

// Supported input image formats
const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'];

// Store active map veto sessions (limit to 20 concurrent veto sessions)
const activeVetos = new LimitedMap(20);

// Function to ensure directories exist
function ensureDirectoriesExist() {
    if (!fs.existsSync(MAPS_DIR)) {
        fs.mkdirSync(MAPS_DIR, { recursive: true });
        console.log(`Created ValorantMaps directory: ${MAPS_DIR}`);
    }
    
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log(`Created backup directory: ${BACKUP_DIR}`);
    }
}

// Function to scan for existing map images in any format
function scanForMapImages() {
    const foundImages = {};
    const allFiles = fs.readdirSync(MAPS_DIR);
    
    Object.keys(VALORANT_MAPS).forEach(mapName => {
        // Look for any image file that contains the map name
        const possibleNames = [
            `Loading_Screen_${mapName}`,
            `${mapName}`,
            mapName.toLowerCase(),
            `loading_screen_${mapName.toLowerCase()}`,
            `map_${mapName.toLowerCase()}`
        ];
        
        for (const fileName of allFiles) {
            const fileNameWithoutExt = path.parse(fileName).name.toLowerCase();
            const fileExt = path.parse(fileName).ext.toLowerCase();
            
            if (SUPPORTED_FORMATS.includes(fileExt)) {
                for (const possibleName of possibleNames) {
                    if (fileNameWithoutExt.includes(possibleName.toLowerCase()) || 
                        possibleName.toLowerCase().includes(fileNameWithoutExt)) {
                        foundImages[mapName] = fileName;
                        break;
                    }
                }
            }
            
            if (foundImages[mapName]) break;
        }
    });
    
    return foundImages;
}

// Function to convert image to standard format
async function convertImageToStandard(inputPath, outputPath, mapName) {
    try {
        console.log(`Converting ${mapName}: ${path.basename(inputPath)} → ${path.basename(outputPath)}`);
        
        // Load the original image
        const originalImage = await loadImage(inputPath);
        
        // Create canvas with the original dimensions
        const canvas = createCanvas(originalImage.width, originalImage.height);
        const ctx = canvas.getContext('2d');
        
        // Draw the image onto canvas
        ctx.drawImage(originalImage, 0, 0);
        
        // Convert to buffer (JPEG format with 95% quality)
        const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
        
        // Write the converted image
        fs.writeFileSync(outputPath, buffer);
        
        console.log(`✅ Successfully converted ${mapName} to standard format`);
        return true;
    } catch (error) {
        console.error(`❌ Error converting ${mapName}:`, error.message);
        return false;
    }
}

// Function to backup original file
function backupOriginalFile(originalPath, mapName) {
    try {
        const originalFileName = path.basename(originalPath);
        const backupPath = path.join(BACKUP_DIR, `${mapName}_original_${originalFileName}`);
        
        if (!fs.existsSync(backupPath)) {
            fs.copyFileSync(originalPath, backupPath);
            console.log(`📁 Backed up original: ${originalFileName} → ${path.basename(backupPath)}`);
        }
    } catch (error) {
        console.error(`❌ Error backing up ${mapName}:`, error.message);
    }
}

// Function to auto-convert all map images
async function autoConvertMapImages() {
    console.log('🔄 Starting automatic image conversion process...');
    
    ensureDirectoriesExist();
    const foundImages = scanForMapImages();
    
    let convertedCount = 0;
    let alreadyCorrectCount = 0;
    let notFoundCount = 0;
    
    for (const [mapName, mapData] of Object.entries(VALORANT_MAPS)) {
        const targetPath = path.join(MAPS_DIR, mapData.fileName);
        const foundImage = foundImages[mapName];
        
        if (foundImage) {
            const sourcePath = path.join(MAPS_DIR, foundImage);
            
            // Check if it's already in the correct format and name
            if (foundImage === mapData.fileName) {
                console.log(`✅ ${mapName} already in correct format: ${foundImage}`);
                alreadyCorrectCount++;
                continue;
            }
            
            // Backup the original file
            backupOriginalFile(sourcePath, mapName);
            
            // Convert to standard format
            const success = await convertImageToStandard(sourcePath, targetPath, mapName);
            
            if (success) {
                convertedCount++;
                
                // Remove the old file if conversion was successful and it's different
                if (sourcePath !== targetPath) {
                    try {
                        fs.unlinkSync(sourcePath);
                        console.log(`🗑️ Removed old file: ${foundImage}`);
                    } catch (error) {
                        console.warn(`⚠️ Could not remove old file ${foundImage}:`, error.message);
                    }
                }
            }
        } else {
            console.log(`❌ ${mapName}: No image file found`);
            notFoundCount++;
        }
    }
    
    // Summary
    console.log('\n📊 Image Conversion Summary:');
    console.log(`✅ Already correct format: ${alreadyCorrectCount}`);
    console.log(`🔄 Successfully converted: ${convertedCount}`);
    console.log(`❌ Not found: ${notFoundCount}`);
    console.log(`📁 Originals backed up to: ${BACKUP_DIR}`);
    
    if (convertedCount > 0) {
        console.log('🎉 Image conversion completed! All maps now use standard format.');
    }
    
    if (notFoundCount > 0) {
        console.log('\n📝 Missing maps - Please add these files to ValorantMaps folder:');
        Object.keys(VALORANT_MAPS).forEach(mapName => {
            if (!foundImages[mapName]) {
                console.log(`   • ${VALORANT_MAPS[mapName].fileName} (or any format with "${mapName}" in the name)`);
            }
        });
    }
}

// Function to get conversion info for startup
function getConversionInfo() {
    const foundImages = scanForMapImages();
    const needsConversion = [];
    const alreadyCorrect = [];
    const missing = [];
    
    Object.keys(VALORANT_MAPS).forEach(mapName => {
        const mapData = VALORANT_MAPS[mapName];
        const foundImage = foundImages[mapName];
        
        if (foundImage) {
            if (foundImage === mapData.fileName) {
                alreadyCorrect.push(mapName);
            } else {
                needsConversion.push({ mapName, foundImage });
            }
        } else {
            missing.push(mapName);
        }
    });
    
    return { needsConversion, alreadyCorrect, missing };
}

// Helper function to check if map image exists (checks for converted format)
function mapImageExists(mapName) {
    const mapData = VALORANT_MAPS[mapName];
    if (!mapData) return false;
    
    const imagePath = path.join(MAPS_DIR, mapData.fileName);
    return fs.existsSync(imagePath);
}

// Function to load map image
async function loadMapImage(mapName) {
    try {
        const mapData = VALORANT_MAPS[mapName];
        if (!mapData) throw new Error('Map not found');
        
        const imagePath = path.join(MAPS_DIR, mapData.fileName);
        
        if (fs.existsSync(imagePath)) {
            return await loadImage(imagePath);
        } else {
            console.warn(`Map image not found: ${imagePath}`);
            return null;
        }
    } catch (error) {
        console.error('Error loading map image:', error);
        return null;
    }
}

// Function to create enhanced map visualization
async function createMapVisualization(mapName) {
    const canvas = createCanvas(800, 600);
    const ctx = canvas.getContext('2d');
    
    const mapData = VALORANT_MAPS[mapName];
    if (!mapData) {
        throw new Error('Map data not found');
    }
    
    // Enhanced background gradient
    const gradient = ctx.createLinearGradient(0, 0, 800, 600);
    gradient.addColorStop(0, '#0a0e13');
    gradient.addColorStop(0.3, '#1e2328');
    gradient.addColorStop(0.7, '#2c3e50');
    gradient.addColorStop(1, '#0a0e13');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 600);
    
    // Valorant-style accent borders
    const accentGradient = ctx.createLinearGradient(0, 0, 800, 0);
    accentGradient.addColorStop(0, '#ff4654');
    accentGradient.addColorStop(0.5, '#ff6b7a');
    accentGradient.addColorStop(1, '#ff4654');
    ctx.fillStyle = accentGradient;
    ctx.fillRect(0, 0, 800, 8);
    ctx.fillRect(0, 592, 800, 8);
    ctx.fillRect(0, 0, 8, 600);
    ctx.fillRect(792, 0, 8, 600);
    
    try {
        // Load and display map image
        const mapImage = await loadMapImage(mapName);
        if (mapImage) {
            // Calculate image dimensions to fit in the canvas
            const maxWidth = 700;
            const maxHeight = 480;
            const imageAspectRatio = mapImage.width / mapImage.height;
            
            let drawWidth = maxWidth;
            let drawHeight = maxWidth / imageAspectRatio;
            
            if (drawHeight > maxHeight) {
                drawHeight = maxHeight;
                drawWidth = maxHeight * imageAspectRatio;
            }
            
            const x = (800 - drawWidth) / 2;
            const y = (600 - drawHeight) / 2;
            
            // Draw map image with border
            ctx.shadowColor = '#000000';
            ctx.shadowBlur = 10;
            ctx.drawImage(mapImage, x, y, drawWidth, drawHeight);
            ctx.shadowBlur = 0;
            
            // Enhanced border around map
            ctx.strokeStyle = '#ff4654';
            ctx.lineWidth = 3;
            ctx.strokeRect(x - 2, y - 2, drawWidth + 4, drawHeight + 4);
        } else {
            // Fallback display when image is not found
            ctx.fillStyle = 'rgba(255, 70, 84, 0.3)';
            ctx.fillRect(50, 100, 700, 400);
            ctx.strokeStyle = '#ff4654';
            ctx.lineWidth = 3;
            ctx.strokeRect(50, 100, 700, 400);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 48px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🗺️', 400, 280);
            ctx.font = 'bold 24px Arial';
            ctx.fillText('Map Image Not Found', 400, 320);
            ctx.font = '16px Arial';
            ctx.fillText(`Looking for: ValorantMaps/${mapData.fileName}`, 400, 350);
        }
    } catch (error) {
        console.error('Error displaying map image:', error);
    }
    
    // Map title with glow effect
    ctx.shadowColor = '#ff4654';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`🗺️ ${mapName.toUpperCase()}`, 400, 50);
    ctx.shadowBlur = 0;
    
    return canvas;
}

// Function to get random map
function getRandomMap(excludeMaps = []) {
    const availableMaps = Object.keys(VALORANT_MAPS).filter(map => !excludeMaps.includes(map));
    if (availableMaps.length === 0) return null;
    
    const randomIndex = Math.floor(Math.random() * availableMaps.length);
    return availableMaps[randomIndex];
}

// Function to create map embed
async function createMapEmbed(mapName, isRandom = false) {
    const mapData = VALORANT_MAPS[mapName];
    if (!mapData) {
        throw new Error('Map not found');
    }
    
    // Create the map visualization
    const mapCanvas = await createMapVisualization(mapName);
    const attachment = new AttachmentBuilder(mapCanvas.toBuffer(), { name: `${mapName.toLowerCase()}-display.png` });
    
    const embed = new EmbedBuilder()
        .setTitle(`🗺️ ${isRandom ? 'Random Map Selected:' : 'Map:'} ${mapName}`)
        .setColor('#ff4654')
        .setImage(`attachment://${mapName.toLowerCase()}-display.png`)
        .setFooter({ text: isRandom ? 'Good luck on your selected map!' : 'Use !randommap for a random selection' })
        .setTimestamp();
    
    return {
        embed: embed,
        files: [attachment]
    };
}

// Function to create map selection buttons
function createMapButtons(mapName) {
    const randomButton = new ButtonBuilder()
        .setCustomId('valorantmap_random')
        .setLabel('Random Map')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎲');
    
    const vetoButton = new ButtonBuilder()
        .setCustomId('valorantmap_veto')
        .setLabel('Start Map Veto')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⚖️');
    
    return new ActionRowBuilder().addComponents(randomButton, vetoButton);
}

// Function to create map veto process
async function startMapVeto(interaction) {
    const vetoId = `veto_${interaction.user.id}_${Date.now()}`;
    const allMaps = Object.keys(VALORANT_MAPS);
    
    const vetoSession = {
        id: vetoId,
        userId: interaction.user.id,
        remainingMaps: [...allMaps],
        bannedMaps: [],
        phase: 'ban', // 'ban' or 'pick'
        currentStep: 1,
        maxSteps: 7, // Ban 6, pick 1
        startTime: Date.now() // Track start time for duration calculation
    };
    
    activeVetos.set(vetoId, vetoSession);
    
    // Auto-delete veto session after 10 minutes
    setTimeout(() => {
        activeVetos.delete(vetoId);
    }, 10 * 60 * 1000);
    
    const embed = new EmbedBuilder()
        .setTitle('⚖️ Map Veto Process Started')
        .setColor('#ff4654')
        .setDescription(`**Step ${vetoSession.currentStep}/${vetoSession.maxSteps}:** Ban a map\n\nRemaining maps: **${vetoSession.remainingMaps.length}**`)
        .addFields({
            name: '🗺️ Available Maps',
            value: vetoSession.remainingMaps.join(', '),
            inline: false
        })
        .setFooter({ text: 'Select maps to ban using the buttons below' })
        .setTimestamp();
    
    // Create buttons for map selection (up to 5 per row, maximum 5 rows)
    const components = [];
    const mapsPerRow = 5;
    
    for (let i = 0; i < vetoSession.remainingMaps.length; i += mapsPerRow) {
        const row = new ActionRowBuilder();
        const rowMaps = vetoSession.remainingMaps.slice(i, i + mapsPerRow);
        
        rowMaps.forEach(mapName => {
            const button = new ButtonBuilder()
                .setCustomId(`valorantmap_veto_${vetoId}_${mapName}`)
                .setLabel(mapName)
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🚫');
            row.addComponents(button);
        });
        
        components.push(row);
        
        // Discord has a limit of 5 action rows per message
        if (components.length >= 5) break;
    }
    
    return { embed, components };
}

// Helper function to safely respond to interactions
async function safeInteractionResponse(interaction, responseType, responseData) {
    try {
        if (!interaction.isRepliable()) {
            console.log('Interaction is no longer repliable');
            return false;
        }

        if (responseType === 'reply') {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(responseData);
            } else {
                await interaction.reply(responseData);
            }
        } else if (responseType === 'update') {
            if (interaction.replied) {
                await interaction.editReply(responseData);
            } else {
                await interaction.update(responseData);
            }
        } else if (responseType === 'defer') {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }
        }
        return true;
    } catch (error) {
        console.error('Error in safe interaction response:', error.message);
        
        try {
            if (!interaction.replied && !interaction.deferred && responseType === 'reply') {
                await interaction.reply({ 
                    content: '❌ There was an error processing your request. Please try again.', 
                    ephemeral: true 
                });
            }
        } catch (fallbackError) {
            console.error('Fallback response also failed:', fallbackError.message);
        }
        return false;
    }
}

module.exports = (client) => {
    if (!client._valorantMapHandlerInitialized) {
        console.log('Valorant Map Handler - Auto-Converting Image Format loaded successfully!');
        console.log('Commands: !valorantmap, !randommap, !maplist, !convertmaps (admin)');
        console.log(`Maps directory: ${MAPS_DIR}`);
        console.log(`Available maps: ${Object.keys(VALORANT_MAPS).length} (including new map: Corrode)`);
        console.log('Expected image format: Loading_Screen_{MapName}.jpg');
        console.log('Features: Auto-conversion from any supported image format');
        
        // Auto-convert images on startup
        (async () => {
            try {
                ensureDirectoriesExist();
                
                const conversionInfo = getConversionInfo();
                
                if (conversionInfo.needsConversion.length > 0) {
                    console.log(`\n🔄 Found ${conversionInfo.needsConversion.length} images that need conversion...`);
                    await autoConvertMapImages();
                } else if (conversionInfo.missing.length > 0) {
                    console.log(`\n⚠️ ${conversionInfo.missing.length} map images are missing:`);
                    conversionInfo.missing.forEach(mapName => {
                        console.log(`   • ${VALORANT_MAPS[mapName].fileName}`);
                    });
                    console.log('\n💡 You can add images in any supported format and they will be auto-converted!');
                    console.log(`   Supported formats: ${SUPPORTED_FORMATS.join(', ')}`);
                } else {
                    console.log('\n✅ All map images are already in correct format!');
                }
            } catch (error) {
                console.error('Error during image conversion:', error);
            }
        })();

        client.on('messageCreate', async (message) => {
            if (message.author.bot) return;

            // Only run in target guild
            if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

            if (!message.guild) return;

            // EARLY RETURN: Skip if not a map command
            const command = message.content.toLowerCase();
            if (!command.startsWith('!randommap') && !command.startsWith('!valorantmap') &&
                !command.startsWith('!maplist') && !command.startsWith('!maps') &&
                !command.startsWith('!convertmaps') && !command.startsWith('!mapstatus')) return;

            // Random map command
            if (command === '!randommap' || command === '!valorantmap') {
                try {
                    const randomMap = getRandomMap();
                    if (!randomMap) {
                        return message.reply('❌ No maps available for selection.');
                    }

                    const mapDisplay = await createMapEmbed(randomMap, true);
                    const buttons = createMapButtons(randomMap);

                    await message.channel.send({
                        embeds: [mapDisplay.embed],
                        files: mapDisplay.files,
                        components: [buttons]
                    });
                } catch (error) {
                    console.error('Error creating random map display:', error);
                    message.reply('❌ There was an error selecting a random map. Please try again.');
                }
            }

            // Map list command
            if (command === '!maplist' || command === '!maps') {
                const embed = new EmbedBuilder()
                    .setTitle('🗺️ Available Valorant Maps')
                    .setColor('#ff4654')
                    .setDescription(`**${Object.keys(VALORANT_MAPS).length}** maps available for selection`)
                    .addFields({
                        name: '📋 Map Pool',
                        value: Object.keys(VALORANT_MAPS).map(map => `• **${map}**`).join('\n'),
                        inline: false
                    })
                    .addFields({
                        name: '🎲 Commands',
                        value: '• `!randommap` - Select a random map\n• `!valorantmap` - Same as !randommap\n• `!maplist` - Show this list\n• `!convertmaps` - Convert images (admin)',
                        inline: false
                    })
                    .setFooter({ text: 'Auto-converts images from any supported format!' })
                    .setTimestamp();

                message.reply({ embeds: [embed] });
            }

            // Admin command to manually trigger conversion
            if (command === '!convertmaps' && message.member.permissions.has('ADMINISTRATOR')) {
                const loadingMessage = await message.reply('🔄 Starting image conversion process...');
                
                try {
                    await autoConvertMapImages();
                    
                    const conversionInfo = getConversionInfo();
                    const embed = new EmbedBuilder()
                        .setTitle('✅ Image Conversion Complete')
                        .setColor('#00ff00')
                        .addFields(
                            { name: '📊 Status', value: `✅ Correct format: ${conversionInfo.alreadyCorrect.length}\n❌ Missing: ${conversionInfo.missing.length}`, inline: false }
                        )
                        .setFooter({ text: 'All images have been processed!' })
                        .setTimestamp();
                    
                    if (conversionInfo.missing.length > 0) {
                        embed.addFields({
                            name: '📝 Missing Images',
                            value: conversionInfo.missing.map(map => `• ${VALORANT_MAPS[map].fileName}`).join('\n'),
                            inline: false
                        });
                        embed.setColor('#ffaa00');
                    }
                    
                    await loadingMessage.edit({ content: '', embeds: [embed] });
                } catch (error) {
                    console.error('Error in manual conversion:', error);
                    await loadingMessage.edit('❌ Error occurred during conversion. Check console for details.');
                }
            }

            // Admin command to show conversion status
            if (command === '!mapstatus' && message.member.permissions.has('ADMINISTRATOR')) {
                const conversionInfo = getConversionInfo();
                
                const embed = new EmbedBuilder()
                    .setTitle('📊 Map Images Status')
                    .setColor('#ff4654')
                    .setDescription(`Checking ${Object.keys(VALORANT_MAPS).length} maps for proper format`)
                    .addFields(
                        { name: '✅ Correct Format', value: `${conversionInfo.alreadyCorrect.length} maps`, inline: true },
                        { name: '🔄 Need Conversion', value: `${conversionInfo.needsConversion.length} maps`, inline: true },
                        { name: '❌ Missing', value: `${conversionInfo.missing.length} maps`, inline: true }
                    )
                    .setTimestamp();

                if (conversionInfo.needsConversion.length > 0) {
                    embed.addFields({
                        name: '🔄 Images That Need Conversion',
                        value: conversionInfo.needsConversion.map(item => `• ${item.foundImage} → Loading_Screen_${item.mapName}.jpg`).join('\n'),
                        inline: false
                    });
                }

                if (conversionInfo.missing.length > 0) {
                    embed.addFields({
                        name: '❌ Missing Images',
                        value: conversionInfo.missing.map(map => `• ${VALORANT_MAPS[map].fileName}`).join('\n'),
                        inline: false
                    });
                }

                embed.addFields({
                    name: '💡 Supported Formats',
                    value: SUPPORTED_FORMATS.join(', '),
                    inline: false
                });

                message.reply({ embeds: [embed] });
            }
        });

        client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton()) return;
            
            if (!interaction.customId.startsWith('valorantmap_')) return;
            
            const parts = interaction.customId.split('_');
            const action = parts[1];

            if (action === 'random') {
                await safeInteractionResponse(interaction, 'defer');
                
                try {
                    const randomMap = getRandomMap();
                    if (!randomMap) {
                        return safeInteractionResponse(interaction, 'reply', {
                            content: '❌ No maps available for selection.',
                            ephemeral: true
                        });
                    }

                    const mapDisplay = await createMapEmbed(randomMap, true);
                    const buttons = createMapButtons(randomMap);

                    await safeInteractionResponse(interaction, 'update', {
                        embeds: [mapDisplay.embed],
                        files: mapDisplay.files,
                        components: [buttons]
                    });
                } catch (error) {
                    console.error('Error creating random map:', error);
                    await safeInteractionResponse(interaction, 'reply', {
                        content: '❌ There was an error selecting a random map. Please try again.',
                        ephemeral: true
                    });
                }
            }

            if (action === 'veto') {
                try {
                    const vetoDisplay = await startMapVeto(interaction);
                    
                    await safeInteractionResponse(interaction, 'reply', {
                        embeds: [vetoDisplay.embed],
                        components: vetoDisplay.components,
                        ephemeral: true
                    });
                } catch (error) {
                    console.error('Error starting map veto:', error);
                    await safeInteractionResponse(interaction, 'reply', {
                        content: '❌ There was an error starting the map veto process.',
                        ephemeral: true
                    });
                }
            }

            // Handle veto selections
            if (action === 'veto' && parts.length > 3) {
                const vetoId = parts[2];
                const mapName = parts.slice(3).join('_');
                const vetoSession = activeVetos.get(vetoId);

                if (!vetoSession) {
                    return safeInteractionResponse(interaction, 'reply', {
                        content: '❌ This veto session has expired.',
                        ephemeral: true
                    });
                }

                if (interaction.user.id !== vetoSession.userId) {
                    return safeInteractionResponse(interaction, 'reply', {
                        content: '❌ This is not your veto session.',
                        ephemeral: true
                    });
                }

                await safeInteractionResponse(interaction, 'defer');

                // Process the veto
                vetoSession.bannedMaps.push(mapName);
                vetoSession.remainingMaps = vetoSession.remainingMaps.filter(map => map !== mapName);
                vetoSession.currentStep++;

                if (vetoSession.remainingMaps.length === 1) {
                    // Veto complete - final map selected
                    const finalMap = vetoSession.remainingMaps[0];
                    activeVetos.delete(vetoId);

                    try {
                        const finalMapDisplay = await createMapEmbed(finalMap, true);

                        // Calculate veto duration
                        const vetoDuration = Date.now() - vetoSession.startTime;
                        const durationMinutes = Math.floor(vetoDuration / 60000);
                        const durationSeconds = Math.floor((vetoDuration % 60000) / 1000);
                        const durationText = durationMinutes > 0
                            ? `${durationMinutes}m ${durationSeconds}s`
                            : `${durationSeconds}s`;

                        const finalEmbed = new EmbedBuilder()
                            .setTitle('⚖️ Map Veto Complete!')
                            .setColor('#00ff00')
                            .setDescription(`**🗺️ Final Map: ${finalMap}**\n\n🎮 Open Valorant → Queue Custom/Unrated → Select **${finalMap}** → Play!`)
                            .addFields({
                                name: '📊 Summary',
                                value: `**Banned:** ${vetoSession.bannedMaps.join(', ')} • **Duration:** ${durationText}`,
                                inline: false
                            })
                            .setFooter({ text: 'Good luck and have fun!' })
                            .setTimestamp();

                        await safeInteractionResponse(interaction, 'update', {
                            embeds: [finalEmbed, finalMapDisplay.embed],
                            files: finalMapDisplay.files,
                            components: []
                        });
                    } catch (error) {
                        console.error('Error showing final map:', error);
                    }
                } else {
                    // Continue veto process
                    const embed = new EmbedBuilder()
                        .setTitle('⚖️ Map Veto Process')
                        .setColor('#ff4654')
                        .setDescription(`**Step ${vetoSession.currentStep}/${vetoSession.maxSteps}:** ${vetoSession.remainingMaps.length > 1 ? 'Ban a map' : 'Final map selected!'}\n\nRemaining maps: **${vetoSession.remainingMaps.length}**`)
                        .addFields(
                            { name: '🗺️ Available Maps', value: vetoSession.remainingMaps.join(', '), inline: false },
                            { name: '🚫 Banned Maps', value: vetoSession.bannedMaps.join(', ') || 'None', inline: false }
                        )
                        .setFooter({ text: 'Select maps to ban using the buttons below' })
                        .setTimestamp();

                    // Create new buttons for remaining maps
                    const components = [];
                    const mapsPerRow = 5;
                    
                    for (let i = 0; i < vetoSession.remainingMaps.length; i += mapsPerRow) {
                        const row = new ActionRowBuilder();
                        const rowMaps = vetoSession.remainingMaps.slice(i, i + mapsPerRow);
                        
                        rowMaps.forEach(mapName => {
                            const button = new ButtonBuilder()
                                .setCustomId(`valorantmap_veto_${vetoId}_${mapName}`)
                                .setLabel(mapName)
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('🚫');
                            row.addComponents(button);
                        });
                        
                        components.push(row);
                        if (components.length >= 5) break;
                    }

                    await safeInteractionResponse(interaction, 'update', {
                        embeds: [embed],
                        components: components
                    });
                }
            }
        });

        client._valorantMapHandlerInitialized = true;
        
        console.log('\n🎨 Auto-Conversion Features:');
        console.log('• Automatically converts any supported image format');
        console.log('• Creates backups of original files');
        console.log('• Standardizes all images to Loading_Screen_{MapName}.jpg');
        console.log(`• Supported input formats: ${SUPPORTED_FORMATS.join(', ')}`);
        console.log('• Use !convertmaps (admin) to manually trigger conversion');
        console.log('• Use !mapstatus (admin) to check conversion status');
    }
};