const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { getBobbyBucks, updateBobbyBucks } = require('../database/helpers/economyHelpers');
const { getHouseBalance, updateHouse } = require('../database/helpers/serverHelpers');
const Challenge = require('../database/models/Challenge');
const { TARGET_GUILD_ID } = require('../config/guildConfig');
const { CleanupMap, LimitedMap } = require('../utils/memoryUtils');

// Store active gladiator matches (auto-cleanup after 1 hour, max 50 concurrent matches)
const activeMatches = new LimitedMap(50);
const activeChallenges = new CleanupMap(3 * 60 * 1000, 1 * 60 * 1000); // In-memory cache with auto-cleanup

// Configuration
const CHALLENGE_TIMEOUT = 3 * 60 * 1000; // 3 minutes
const TURN_TIMEOUT = 30 * 1000; // 30 seconds per turn
const MIN_BET = 10;
const MAX_BET = 100000;

// Combat configuration
const STARTING_HEALTH = 100;
const STARTING_STAMINA = 50;
const STAMINA_REGEN = 10; // per turn

// Attack types with damage, accuracy, stamina cost, and special effects
const ATTACK_TYPES = {
    QUICK_STRIKE: {
        name: 'Quick Strike',
        emoji: '⚡',
        damage: [15, 25],
        accuracy: 85,
        staminaCost: 5,
        description: 'A fast, precise attack',
        critChance: 10
    },
    POWER_ATTACK: {
        name: 'Power Attack',
        emoji: '💥',
        damage: [25, 40],
        accuracy: 65,
        staminaCost: 15,
        description: 'A devastating blow that may miss',
        critChance: 20
    },
    DEFENSIVE_STANCE: {
        name: 'Defensive Stance',
        emoji: '🛡️',
        damage: [5, 15],
        accuracy: 95,
        staminaCost: 3,
        description: 'Block and counter-attack',
        block: true,
        critChance: 5
    },
    BERSERKER_RAGE: {
        name: 'Berserker Rage',
        emoji: '🔥',
        damage: [30, 50],
        accuracy: 50,
        staminaCost: 25,
        description: 'All-or-nothing devastating attack',
        critChance: 30
    },
    PRECISION_STRIKE: {
        name: 'Precision Strike',
        emoji: '🎯',
        damage: [20, 30],
        accuracy: 95,
        staminaCost: 12,
        description: 'Calculated strike that rarely misses',
        critChance: 25
    }
};

// Gladiator classes with different stats and abilities
const GLADIATOR_CLASSES = {
    WARRIOR: {
        name: 'Warrior',
        emoji: '⚔️',
        healthBonus: 20,
        staminaBonus: 10,
        specialties: ['POWER_ATTACK', 'DEFENSIVE_STANCE'],
        description: 'Balanced fighter with strong defense'
    },
    BERSERKER: {
        name: 'Berserker',
        emoji: '🪓',
        healthBonus: 10,
        staminaBonus: 20,
        specialties: ['BERSERKER_RAGE', 'QUICK_STRIKE'],
        description: 'High damage, high risk fighter'
    },
    ASSASSIN: {
        name: 'Assassin',
        emoji: '🗡️',
        healthBonus: 0,
        staminaBonus: 15,
        specialties: ['PRECISION_STRIKE', 'QUICK_STRIKE'],
        description: 'Fast and precise, but fragile'
    },
    GLADIATOR: {
        name: 'Gladiator',
        emoji: '🏛️',
        healthBonus: 15,
        staminaBonus: 5,
        specialties: ['POWER_ATTACK', 'PRECISION_STRIKE'],
        description: 'Classic arena fighter'
    }
};

// Function to load image from URL
async function loadImageFromURL(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
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
        }).on('error', reject);
    });
}

// Function to create epic arena visualization
async function createArenaVisualization(match, combatLog = []) {
    const canvas = createCanvas(800, 600);
    const ctx = canvas.getContext('2d');
    
    // Arena background gradient
    const gradient = ctx.createLinearGradient(0, 0, 800, 600);
    gradient.addColorStop(0, '#8B4513');
    gradient.addColorStop(0.3, '#DEB887');
    gradient.addColorStop(0.7, '#D2B48C');
    gradient.addColorStop(1, '#F4A460');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 600);
    
    // Arena floor
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, 400, 800, 200);
    
    // Sand texture
    ctx.fillStyle = '#F4E4BC';
    for (let i = 0; i < 100; i++) {
        const x = Math.random() * 800;
        const y = 400 + Math.random() * 200;
        ctx.beginPath();
        ctx.arc(x, y, Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Colosseum walls
    ctx.fillStyle = '#696969';
    ctx.fillRect(0, 0, 800, 100);
    ctx.fillRect(0, 100, 50, 300);
    ctx.fillRect(750, 100, 50, 300);
    
    // Crowd silhouettes
    ctx.fillStyle = '#2F2F2F';
    for (let x = 0; x < 800; x += 15) {
        const height = 30 + Math.random() * 40;
        ctx.fillRect(x, 70 - height, 12, height);
    }
    
    // Arena title
    ctx.fillStyle = '#8B0000';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 3;
    ctx.fillText('⚔️ GLADIATOR ARENA ⚔️', 400, 50);
    ctx.shadowBlur = 0;
    
    // Draw gladiators
    const player1 = match.player1;
    const player2 = match.player2;
    
    // Player 1 (left side)
    await drawGladiator(ctx, player1, 150, 300, 'left');
    
    // Player 2 (right side)
    await drawGladiator(ctx, player2, 650, 300, 'right');
    
    // Health bars
    drawHealthBar(ctx, player1.health, player1.maxHealth, 50, 150, player1.displayName, 'left');
    drawHealthBar(ctx, player2.health, player2.maxHealth, 550, 150, player2.displayName, 'right');
    
    // Stamina bars
    drawStaminaBar(ctx, player1.stamina, player1.maxStamina, 50, 180);
    drawStaminaBar(ctx, player2.stamina, player2.maxStamina, 550, 180);
    
    // Combat log area
    if (combatLog.length > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(200, 120, 400, 150);
        
        ctx.strokeStyle = '#8B0000';
        ctx.lineWidth = 3;
        ctx.strokeRect(200, 120, 400, 150);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⚔️ COMBAT LOG ⚔️', 400, 145);
        
        ctx.font = '12px Arial';
        const recentLogs = combatLog.slice(-8);
        recentLogs.forEach((log, index) => {
            ctx.fillText(log, 400, 165 + (index * 12));
        });
    }
    
    // Current turn indicator
    if (match.currentTurn) {
        const currentPlayer = match.currentTurn === match.player1.id ? player1 : player2;
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${currentPlayer.displayName}'s Turn`, 400, 320);
        
        // Glowing effect around current player
        const glowX = match.currentTurn === match.player1.id ? 150 : 650;
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 5;
        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(glowX, 350, 70, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
    
    // Match info
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`Pot: 🍯${match.pot.toLocaleString()}`, 400, 500);

    if (match.spectatorBets && Object.keys(match.spectatorBets).length > 0) {
        ctx.fillText(`Spectator Bets: 🍯${Object.values(match.spectatorBets).reduce((sum, bet) => sum + bet.amount, 0).toLocaleString()}`, 400, 520);
    }
    
    return canvas.toBuffer();
}

// Helper function to draw a gladiator
async function drawGladiator(ctx, player, x, y, facing) {
    try {
        // Load player avatar
        const avatarURL = player.avatarURL || 
            `https://cdn.discordapp.com/embed/avatars/${player.id % 5}.png`;
        const avatar = await loadImageFromURL(avatarURL);
        
        // Gladiator body (simplified representation)
        const bodyColor = player.health > 50 ? '#8B4513' : '#654321';
        ctx.fillStyle = bodyColor;
        ctx.fillRect(x - 25, y, 50, 80);
        
        // Armor/clothing
        ctx.fillStyle = player.health > 25 ? '#4682B4' : '#2F4F4F';
        ctx.fillRect(x - 20, y + 10, 40, 50);
        
        // Health-based damage effects
        if (player.health < 50) {
            ctx.fillStyle = '#8B0000';
            for (let i = 0; i < 5; i++) {
                const dmgX = x - 20 + Math.random() * 40;
                const dmgY = y + 10 + Math.random() * 60;
                ctx.fillRect(dmgX, dmgY, 3, 8);
            }
        }
        
        // Avatar as head
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y - 15, 25, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, x - 25, y - 40, 50, 50);
        ctx.restore();
        
        // Avatar border
        ctx.strokeStyle = player.health > 50 ? '#FFD700' : '#FF4500';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y - 15, 25, 0, Math.PI * 2);
        ctx.stroke();
        
        // Weapon based on class
        const weapon = player.gladiatorClass;
        ctx.fillStyle = '#C0C0C0';
        if (facing === 'left') {
            // Weapon in right hand
            if (weapon === 'WARRIOR' || weapon === 'GLADIATOR') {
                // Sword
                ctx.fillRect(x + 30, y + 20, 5, 40);
                ctx.fillRect(x + 25, y + 15, 15, 5);
            } else if (weapon === 'BERSERKER') {
                // Axe
                ctx.fillRect(x + 30, y + 20, 5, 35);
                ctx.fillRect(x + 28, y + 15, 20, 10);
            } else if (weapon === 'ASSASSIN') {
                // Dagger
                ctx.fillRect(x + 30, y + 25, 3, 25);
                ctx.fillRect(x + 27, y + 20, 9, 5);
            }
        } else {
            // Weapon in left hand (mirrored)
            if (weapon === 'WARRIOR' || weapon === 'GLADIATOR') {
                ctx.fillRect(x - 35, y + 20, 5, 40);
                ctx.fillRect(x - 40, y + 15, 15, 5);
            } else if (weapon === 'BERSERKER') {
                ctx.fillRect(x - 35, y + 20, 5, 35);
                ctx.fillRect(x - 48, y + 15, 20, 10);
            } else if (weapon === 'ASSASSIN') {
                ctx.fillRect(x - 33, y + 25, 3, 25);
                ctx.fillRect(x - 36, y + 20, 9, 5);
            }
        }
        
        // Class symbol
        const classData = GLADIATOR_CLASSES[weapon];
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(classData.emoji, x, y + 100);
        
    } catch (error) {
        console.error('Error drawing gladiator:', error);
        // Fallback drawing
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(x - 25, y - 40, 50, 120);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🤺', x, y);
    }
}

// Helper function to draw health bar
function drawHealthBar(ctx, health, maxHealth, x, y, name, align) {
    const barWidth = 200;
    const barHeight = 20;
    const healthPercentage = health / maxHealth;
    
    // Background
    ctx.fillStyle = '#2F2F2F';
    ctx.fillRect(x, y, barWidth, barHeight);
    
    // Health bar
    const healthColor = healthPercentage > 0.6 ? '#00FF00' : 
                       healthPercentage > 0.3 ? '#FFFF00' : '#FF0000';
    ctx.fillStyle = healthColor;
    ctx.fillRect(x, y, barWidth * healthPercentage, barHeight);
    
    // Border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, barWidth, barHeight);
    
    // Text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = align;
    const textX = align === 'left' ? x : x + barWidth;
    ctx.fillText(`${name}: ${health}/${maxHealth} HP`, textX, y - 5);
}

// Helper function to draw stamina bar
function drawStaminaBar(ctx, stamina, maxStamina, x, y) {
    const barWidth = 200;
    const barHeight = 15;
    const staminaPercentage = stamina / maxStamina;
    
    // Background
    ctx.fillStyle = '#2F2F2F';
    ctx.fillRect(x, y, barWidth, barHeight);
    
    // Stamina bar
    ctx.fillStyle = '#0080FF';
    ctx.fillRect(x, y, barWidth * staminaPercentage, barHeight);
    
    // Border
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, barWidth, barHeight);
    
    // Text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${stamina}/${maxStamina} Stamina`, x + barWidth/2, y + 12);
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // Only run in target guild
        if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

        if (!message.guild) return;

        // EARLY RETURN: Skip if not a gladiator command
        const content = message.content.toLowerCase();
        if (!content.startsWith('!gladiator') && !content.startsWith('!arena')) return;

        const args = message.content.split(' ');
        const command = args[0].toLowerCase();

        // Gladiator challenge command
        if (command === '!gladiator' || command === '!arena') {
            if (args.length < 3) {
                return message.channel.send({
                    embeds: [new EmbedBuilder()
                        .setColor('#FF6B6B')
                        .setTitle('⚔️ Gladiator Arena Usage')
                        .setDescription('**Usage:** `!gladiator <@opponent> <bet_amount> [class]`')
                        .addFields(
                            { name: 'Example', value: '`!gladiator @friend 100 WARRIOR`', inline: false },
                            { name: 'Classes', value: Object.entries(GLADIATOR_CLASSES).map(([key, data]) => 
                                `**${key}** ${data.emoji} - ${data.description}`).join('\n'), inline: false },
                            { name: 'Bet Range', value: `🍯{MIN_BET} - 🍯{MAX_BET.toLocaleString()}`, inline: true }
                        )
                        .setTimestamp()]
                });
            }

            const challengedUser = message.mentions.users.first();
            const betAmount = parseInt(args[2]);
            const gladiatorClass = args[3] ? args[3].toUpperCase() : 'WARRIOR';

            // Validation
            if (!challengedUser) {
                return message.channel.send('❌ You must mention a valid user to challenge!');
            }

            if (challengedUser.bot) {
                return message.channel.send('❌ You cannot challenge bots to gladiator combat!');
            }

            if (challengedUser.id === message.author.id) {
                return message.channel.send('❌ You cannot challenge yourself! That would be... interesting though.');
            }

            if (isNaN(betAmount) || betAmount < MIN_BET || betAmount > MAX_BET) {
                return message.channel.send(`❌ Bet amount must be between 🍯{MIN_BET} and 🍯{MAX_BET.toLocaleString()}!`);
            }

            if (!GLADIATOR_CLASSES[gladiatorClass]) {
                return message.channel.send(`❌ Invalid gladiator class! Choose from: ${Object.keys(GLADIATOR_CLASSES).join(', ')}`);
            }

            // Check balances
            const challengerBalance = await getBobbyBucks(message.author.id);
            const challengedBalance = await getBobbyBucks(challengedUser.id);

            if (challengerBalance < betAmount) {
                return message.channel.send(`❌ You don't have enough Honey! You need 🍯{betAmount}, but only have 🍯{challengerBalance}.`);
            }

            if (challengedBalance < betAmount) {
                return message.channel.send(`❌ ${challengedUser.username} doesn't have enough Honey for this bet!`);
            }

            // Check for existing challenges
            const existingChallenge = Array.from(activeChallenges.values())
                .find(c => (c.challenger.id === message.author.id && c.challenged.id === challengedUser.id) ||
                          (c.challenger.id === challengedUser.id && c.challenged.id === message.author.id));

            if (existingChallenge) {
                return message.channel.send('❌ There is already a pending challenge between you two!');
            }

            // Check for active matches
            const activeMatch = Array.from(activeMatches.values())
                .find(m => m.player1.id === message.author.id || m.player2.id === message.author.id ||
                          m.player1.id === challengedUser.id || m.player2.id === challengedUser.id);

            if (activeMatch) {
                return message.channel.send('❌ One of you is already in an active gladiator match!');
            }

            // Create challenge
            const challengeId = `challenge_${Date.now()}_${message.author.id}`;
            const challenge = {
                id: challengeId,
                challenger: {
                    id: message.author.id,
                    username: message.author.username,
                    displayName: message.author.displayName || message.author.username,
                    avatarURL: message.author.displayAvatarURL({ extension: 'png', size: 128 }),
                    gladiatorClass: gladiatorClass
                },
                challenged: {
                    id: challengedUser.id,
                    username: challengedUser.username,
                    displayName: challengedUser.displayName || challengedUser.username,
                    avatarURL: challengedUser.displayAvatarURL({ extension: 'png', size: 128 }),
                    gladiatorClass: null
                },
                betAmount: betAmount,
                channelId: message.channel.id,
                timestamp: Date.now()
            };

            activeChallenges.set(challengeId, challenge);

            // Save to database
            try {
                await Challenge.create({
                    challengeId,
                    type: 'gladiator',
                    creator: message.author.id,
                    creatorName: message.author.displayName || message.author.username,
                    challenged: challengedUser.id,
                    challengedName: challengedUser.displayName || challengedUser.username,
                    amount: betAmount,
                    channelId: message.channel.id,
                    gladiatorClass: gladiatorClass,
                    challengerAvatarURL: message.author.displayAvatarURL({ extension: 'png', size: 128 }),
                    challengedAvatarURL: challengedUser.displayAvatarURL({ extension: 'png', size: 128 })
                });
            } catch (dbError) {
                console.error('[GLADIATOR] Error saving challenge to database:', dbError);
            }

            // Create challenge embed
            const challengeEmbed = await createChallengeEmbed(challenge);
            const challengeButtons = createChallengeButtons(challengeId);

            const challengeMessage = await message.channel.send({
                content: `${challengedUser}, you have been challenged to gladiator combat!`,
                embeds: [challengeEmbed.embed],
                files: challengeEmbed.files,
                components: [challengeButtons]
            });

            // Auto-expire challenge
            setTimeout(async () => {
                if (activeChallenges.has(challengeId)) {
                    activeChallenges.delete(challengeId);

                    // Delete from database
                    try {
                        await Challenge.deleteOne({ challengeId });
                    } catch (dbError) {
                        console.error('[GLADIATOR] Error deleting expired challenge from database:', dbError);
                    }

                    const expiredEmbed = new EmbedBuilder()
                        .setColor('#666666')
                        .setTitle('⏰ Gladiator Challenge Expired')
                        .setDescription('The challenge timed out and has been cancelled.')
                        .setTimestamp();
                    
                    challengeMessage.edit({ 
                        embeds: [expiredEmbed], 
                        components: [],
                        files: []
                    }).catch(() => {});
                }
            }, CHALLENGE_TIMEOUT);
        }

        // Arena stats command
        if (command === '!arenastats') {
            const userId = message.mentions.users.first()?.id || message.author.id;
            const user = message.mentions.users.first() || message.author;
            
            // This would require a persistent stats system - for now just show basic info
            const balance = await getBobbyBucks(userId);
            
            const statsEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`⚔️ ${user.displayName || user.username}'s Arena Stats`)
                .setDescription('*Gladiator statistics coming soon!*')
                .addFields(
                    { name: '💰 Current Balance', value: `🍯{balance.toLocaleString()}`, inline: true },
                    { name: '🏆 Arena Status', value: 'Ready for Combat', inline: true }
                )
                .setTimestamp();
            
            return message.channel.send({ embeds: [statsEmbed] });
        }
    });

    // Handle button interactions
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        // Check if this is a gladiator interaction
        const parts = interaction.customId.split('_');
        const action = parts[0];
        const gladiatorActions = ['accept', 'decline', 'class', 'attack', 'bet'];
        
        if (!gladiatorActions.includes(action)) return;

        try {
            // Handle challenge buttons (accept/decline)
            if (['accept', 'decline'].includes(action)) {
                const challengeId = parts.slice(1).join('_');
                let challenge = activeChallenges.get(challengeId);

                // Try to load from database if not in memory
                if (!challenge) {
                    try {
                        const dbChallenge = await Challenge.findOne({ challengeId });
                        if (dbChallenge) {
                            challenge = {
                                id: dbChallenge.challengeId,
                                challenger: {
                                    id: dbChallenge.creator,
                                    username: dbChallenge.creatorName,
                                    displayName: dbChallenge.creatorName,
                                    avatarURL: dbChallenge.challengerAvatarURL,
                                    gladiatorClass: dbChallenge.gladiatorClass
                                },
                                challenged: {
                                    id: dbChallenge.challenged,
                                    username: dbChallenge.challengedName,
                                    displayName: dbChallenge.challengedName,
                                    avatarURL: dbChallenge.challengedAvatarURL,
                                    gladiatorClass: null
                                },
                                betAmount: dbChallenge.amount,
                                channelId: dbChallenge.channelId,
                                timestamp: dbChallenge.createdAt.getTime()
                            };
                            activeChallenges.set(challengeId, challenge);
                            console.log(`[GLADIATOR] Loaded challenge ${challengeId} from database`);
                        }
                    } catch (dbError) {
                        console.error('[GLADIATOR] Error loading challenge from database:', dbError);
                    }
                }

                if (!challenge) {
                    return interaction.reply({
                        content: '❌ This challenge is no longer active. It may have expired.\n\n💡 **Tip:** Ask the challenger to create a new challenge with `!gladiator`!',
                        ephemeral: true
                    });
                }

                if (interaction.user.id !== challenge.challenged.id) {
                    return interaction.reply({
                        content: '❌ Only the challenged player can respond to this challenge!',
                        ephemeral: true
                    });
                }

                if (action === 'decline') {
                    activeChallenges.delete(challengeId);

                    // Delete from database
                    try {
                        await Challenge.deleteOne({ challengeId });
                    } catch (dbError) {
                        console.error('[GLADIATOR] Error deleting declined challenge from database:', dbError);
                    }

                    const declineEmbed = new EmbedBuilder()
                        .setColor('#FF4444')
                        .setTitle('❌ Challenge Declined')
                        .setDescription(`${challenge.challenged.displayName} has declined the gladiator challenge.`)
                        .setTimestamp();
                    
                    await interaction.update({
                        embeds: [declineEmbed],
                        components: [],
                        files: []
                    });
                    return;
                }

                if (action === 'accept') {
                    // Show class selection in the same interaction update
                    const classButtons = createClassSelectionButtons(challengeId);
                    
                    const classEmbed = new EmbedBuilder()
                        .setColor('#4ECDC4')
                        .setTitle('⚔️ Choose Your Gladiator Class')
                        .setDescription(`**${challenge.challenged.displayName}**, select your fighting style for the arena!\n\n**Challenger:** ${challenge.challenger.displayName} (${GLADIATOR_CLASSES[challenge.challenger.gladiatorClass].emoji} ${challenge.challenger.gladiatorClass})`)
                        .addFields(
                            Object.entries(GLADIATOR_CLASSES).map(([key, data]) => ({
                                name: `${data.emoji} ${data.name}`,
                                value: data.description,
                                inline: true
                            }))
                        )
                        .setFooter({ text: 'Choose wisely - this will determine your combat stats!' })
                        .setTimestamp();
                    
                    await interaction.update({
                        embeds: [classEmbed],
                        components: classButtons,
                        files: []
                    });
                    return;
                }
            }
            // Handle class selection
            else if (action === 'class') {
                const challengeId = parts.slice(2).join('_');
                const selectedClass = parts[1];
                const challenge = activeChallenges.get(challengeId);

                if (!challenge) {
                    return interaction.reply({
                        content: '❌ This challenge is no longer active. It may have expired or the bot was restarted.\n\n💡 **Tip:** Ask the challenger to create a new challenge with `!gladiator`!',
                        ephemeral: true
                    });
                }

                if (interaction.user.id !== challenge.challenged.id) {
                    return interaction.reply({
                        content: '❌ Only the challenged player can select their class!',
                        ephemeral: true
                    });
                }

                // Set the challenged player's class
                challenge.challenged.gladiatorClass = selectedClass;
                
                // Update the message to show the battle is starting
                const startingEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('⚔️ THE BATTLE BEGINS!')
                    .setDescription(`**${challenge.challenged.displayName}** has chosen the ${GLADIATOR_CLASSES[selectedClass].emoji} **${GLADIATOR_CLASSES[selectedClass].name}** class!\n\nThe gladiator arena match is starting now...`)
                    .addFields(
                        { name: '⚔️ Challenger', value: `${challenge.challenger.displayName}\n${GLADIATOR_CLASSES[challenge.challenger.gladiatorClass].emoji} ${challenge.challenger.gladiatorClass}`, inline: true },
                        { name: '🛡️ Defender', value: `${challenge.challenged.displayName}\n${GLADIATOR_CLASSES[selectedClass].emoji} ${selectedClass}`, inline: true },
                        { name: '💰 Prize Pot', value: `🍯{(challenge.betAmount * 2).toLocaleString()}`, inline: true }
                    )
                    .setTimestamp();
                
                await interaction.update({
                    embeds: [startingEmbed],
                    components: [],
                    files: []
                });
                
                // Start the match by sending a new message (separate from the interaction)
                setTimeout(async () => {
                    try {
                        const channel = await client.channels.fetch(challenge.channelId);
                        await startGladiatorMatchInChannel(channel, challenge);
                    } catch (error) {
                        console.error('Error starting match in channel:', error);
                    }
                }, 2000);
                return;
            }
            // Handle combat actions
            else if (action === 'attack') {
                const matchId = parts[1];
                const attackType = parts[2];
                const match = activeMatches.get(matchId);
                
                if (!match) {
                    return interaction.reply({
                        content: '❌ This match is no longer active.',
                        ephemeral: true
                    });
                }

                if (interaction.user.id !== match.currentTurn) {
                    return interaction.reply({
                        content: '❌ It\'s not your turn!',
                        ephemeral: true
                    });
                }

                // Defer the update immediately to prevent timeout
                await interaction.deferUpdate();
                await executeAttack(interaction, match, attackType);
                return;
            }
            // Handle spectator betting
            else if (action === 'bet') {
                const matchId = parts[1];
                const playerId = parts[2];
                const match = activeMatches.get(matchId);
                
                if (!match) {
                    return interaction.reply({
                        content: '❌ This match is no longer active.',
                        ephemeral: true
                    });
                }

                if (interaction.user.id === match.player1.id || interaction.user.id === match.player2.id) {
                    return interaction.reply({
                        content: '❌ Players cannot bet on their own match!',
                        ephemeral: true
                    });
                }

                return interaction.reply({
                    content: '💰 Spectator betting feature coming soon! For now, enjoy the epic combat!',
                    ephemeral: true
                });
            }
        } catch (error) {
            // Handle interaction errors gracefully
            if (error.code === 10062 || error.code === 40060) {
                // Interaction expired or unknown - this is normal for old buttons
                console.log('Gladiator interaction expired or unknown - user clicked an old button');
                return;
            }

            console.error('Error handling gladiator interaction:', error);

            // Only try to respond if interaction hasn't been acknowledged yet
            if (!interaction.replied && !interaction.deferred) {
                try {
                    await interaction.reply({
                        content: '❌ An error occurred while processing your action. Please try again.',
                        ephemeral: true
                    });
                } catch (replyError) {
                    // Silently ignore if we can't send the error message
                    if (replyError.code !== 10062 && replyError.code !== 40060) {
                        console.error('Error sending error reply:', replyError);
                    }
                }
            }
        }
    });

    // Function to start a gladiator match in a channel (separate from interactions)
    async function startGladiatorMatchInChannel(channel, challenge) {
        activeChallenges.delete(challenge.id);

        // Delete from database
        try {
            await Challenge.deleteOne({ challengeId: challenge.id });
        } catch (dbError) {
            console.error('[GLADIATOR] Error deleting accepted challenge from database:', dbError);
        }

        // Lock both players' bets
        await updateBobbyBucks(challenge.challenger.id, -challenge.betAmount);
        await updateBobbyBucks(challenge.challenged.id, -challenge.betAmount);
        
        // Create match
        const matchId = `match_${Date.now()}`;
        const classData1 = GLADIATOR_CLASSES[challenge.challenger.gladiatorClass];
        const classData2 = GLADIATOR_CLASSES[challenge.challenged.gladiatorClass];
        
        const match = {
            id: matchId,
            channelId: challenge.channelId,
            player1: {
                ...challenge.challenger,
                health: STARTING_HEALTH + classData1.healthBonus,
                maxHealth: STARTING_HEALTH + classData1.healthBonus,
                stamina: STARTING_STAMINA + classData1.staminaBonus,
                maxStamina: STARTING_STAMINA + classData1.staminaBonus
            },
            player2: {
                ...challenge.challenged,
                health: STARTING_HEALTH + classData2.healthBonus,
                maxHealth: STARTING_HEALTH + classData2.healthBonus,
                stamina: STARTING_STAMINA + classData2.staminaBonus,
                maxStamina: STARTING_STAMINA + classData2.staminaBonus
            },
            pot: challenge.betAmount * 2,
            currentTurn: challenge.challenger.id,
            turnCount: 1,
            combatLog: [],
            spectatorBets: {},
            startTime: Date.now(),
            turnTimer: null
        };
        
        activeMatches.set(matchId, match);
        
        // Create initial arena display
        const arenaEmbed = await createArenaEmbed(match);
        const combatButtons = createCombatButtons(matchId, match.currentTurn);
        
        await channel.send({
            embeds: [arenaEmbed.embed],
            files: arenaEmbed.files,
            components: combatButtons
        });
        
        // Start turn timer
        startTurnTimer(matchId);
    }

    // Function to execute an attack
    async function executeAttack(interaction, match, attackType) {
        try {
            // Clear turn timer since player is taking action
            if (match.turnTimer) {
                clearTimeout(match.turnTimer);
                match.turnTimer = null;
            }
            
            const attacker = match.currentTurn === match.player1.id ? match.player1 : match.player2;
            const defender = match.currentTurn === match.player1.id ? match.player2 : match.player1;
            const attack = ATTACK_TYPES[attackType];
            
            // Check stamina
            if (attacker.stamina < attack.staminaCost) {
                return interaction.followUp({
                    content: '❌ Not enough stamina for this attack!',
                    ephemeral: true
                });
            }
            
            // Execute attack
            attacker.stamina -= attack.staminaCost;
            
            const hit = Math.random() * 100 < attack.accuracy;
            let damage = 0;
            let critical = false;
            let blocked = false;
            
            if (hit) {
                damage = Math.floor(Math.random() * (attack.damage[1] - attack.damage[0] + 1)) + attack.damage[0];
                
                // Check for critical hit
                if (Math.random() * 100 < attack.critChance) {
                    damage = Math.floor(damage * 1.5);
                    critical = true;
                }
                
                // Check for block (if defender used defensive stance last turn)
                if (attack.block && Math.random() * 100 < 30) {
                    blocked = true;
                    damage = Math.floor(damage * 0.3);
                }
                
                defender.health = Math.max(0, defender.health - damage);
            }
            
            // Create combat log entry
            let logEntry = `${attacker.displayName} uses ${attack.emoji} ${attack.name}`;
            if (!hit) {
                logEntry += ' but misses!';
            } else {
                logEntry += ` for ${damage} damage`;
                if (critical) logEntry += ' (CRITICAL!)';
                if (blocked) logEntry += ' (blocked)';
                logEntry += '!';
            }
            
            match.combatLog.push(logEntry);
            
            // Regenerate stamina
            attacker.stamina = Math.min(attacker.maxStamina, attacker.stamina + STAMINA_REGEN);
            defender.stamina = Math.min(defender.maxStamina, defender.stamina + STAMINA_REGEN);
            
            // Check for victory
            if (defender.health <= 0) {
                return endMatch(interaction, match, attacker, defender);
            }
            
            // Switch turns
            match.currentTurn = match.currentTurn === match.player1.id ? match.player2.id : match.player1.id;
            match.turnCount++;
            
            // Update arena display
            const arenaEmbed = await createArenaEmbed(match);
            const combatButtons = createCombatButtons(match.id, match.currentTurn);
            
            await interaction.editReply({
                embeds: [arenaEmbed.embed],
                files: arenaEmbed.files,
                components: combatButtons
            });
            
            // Start new turn timer
            startTurnTimer(match.id);
            
        } catch (error) {
            console.error('Error executing attack:', error);
            
            try {
                await interaction.followUp({
                    content: '❌ An error occurred while executing your attack. Please try again.',
                    ephemeral: true
                });
            } catch (followUpError) {
                console.error('Error sending attack error followUp:', followUpError);
            }
        }
    }

    // Function to end a match
    async function endMatch(interaction, match, winner, loser) {
        // Clear turn timer
        if (match.turnTimer) {
            clearTimeout(match.turnTimer);
        }
        
        activeMatches.delete(match.id);
        
        // Calculate winnings (95% to winner, 5% house cut)
        const houseCut = Math.floor(match.pot * 0.05);
        const winnings = match.pot - houseCut;
        
        await updateBobbyBucks(winner.id, winnings);
        await updateHouse(houseCut);
        
        // Create victory visualization
        const victoryEmbed = await createVictoryEmbed(match, winner, loser, winnings);
        
        try {
            await interaction.editReply({
                embeds: [victoryEmbed.embed],
                files: victoryEmbed.files,
                components: []
            });
        } catch (error) {
            console.error('Error updating victory message:', error);
            // Try to send as followUp if editReply fails
            try {
                await interaction.followUp({
                    embeds: [victoryEmbed.embed],
                    files: victoryEmbed.files,
                    components: []
                });
            } catch (followUpError) {
                console.error('Error sending victory followUp:', followUpError);
            }
        }
        
        // Send victory DM
        try {
            const winnerUser = await client.users.fetch(winner.id);
            const dmEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🏆 VICTORY IN THE ARENA!')
                .setDescription(`You have emerged victorious from gladiator combat!`)
                .addFields(
                    { name: '💰 Winnings', value: `🍯{winnings.toLocaleString()}`, inline: true },
                    { name: '💳 New Balance', value: `🍯${(await getBobbyBucks(winner.id)).toLocaleString()}`, inline: true }
                )
                .setTimestamp();
            
            await winnerUser.send({ embeds: [dmEmbed] });
        } catch (error) {
            console.log(`Could not send victory DM to ${winner.id}`);
        }
    }

    // Function to start turn timer
    function startTurnTimer(matchId) {
        const match = activeMatches.get(matchId);
        if (!match) return;
        
        // Clear any existing timer for this match
        if (match.turnTimer) {
            clearTimeout(match.turnTimer);
        }
        
        match.turnTimer = setTimeout(async () => {
            const currentMatch = activeMatches.get(matchId);
            if (!currentMatch) return;
            
            const attacker = currentMatch.currentTurn === currentMatch.player1.id ? currentMatch.player1 : currentMatch.player2;
            
            // Add timeout penalty
            currentMatch.combatLog.push(`${attacker.displayName} hesitates and misses their chance!`);
            
            // Deduct stamina for hesitation
            attacker.stamina = Math.max(0, attacker.stamina - 5);
            
            // Switch turns
            currentMatch.currentTurn = currentMatch.currentTurn === currentMatch.player1.id ? currentMatch.player2.id : currentMatch.player1.id;
            currentMatch.turnCount++;
            
            // Try to update the arena display through channel message
            try {
                const channel = await client.channels.fetch(currentMatch.channelId);
                const arenaEmbed = await createArenaEmbed(currentMatch);
                const combatButtons = createCombatButtons(currentMatch.id, currentMatch.currentTurn);
                
                await channel.send({
                    content: `⏰ ${attacker.displayName} took too long! Turn skipped.`,
                    embeds: [arenaEmbed.embed],
                    files: arenaEmbed.files,
                    components: combatButtons
                });
                
                // Start next turn timer
                startTurnTimer(matchId);
                
            } catch (error) {
                console.error('Error handling turn timeout:', error);
            }
        }, TURN_TIMEOUT);
    }

    // Helper function to create challenge embed
    async function createChallengeEmbed(challenge) {
        const challengerClass = GLADIATOR_CLASSES[challenge.challenger.gladiatorClass];
        
        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('⚔️ GLADIATOR CHALLENGE!')
            .setDescription(`**${challenge.challenger.displayName}** challenges **${challenge.challenged.displayName}** to combat in the arena!`)
            .addFields(
                { name: '💰 Bet Amount', value: `🍯{challenge.betAmount.toLocaleString()} each`, inline: true },
                { name: '🏆 Total Pot', value: `🍯{(challenge.betAmount * 2).toLocaleString()}`, inline: true },
                { name: '⚔️ Challenger Class', value: `${challengerClass.emoji} ${challengerClass.name}`, inline: true }
            )
            .setFooter({ text: 'The challenged player must accept and choose their class!' })
            .setTimestamp();

        // Simple arena preview
        const canvas = createCanvas(400, 200);
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createLinearGradient(0, 0, 400, 200);
        gradient.addColorStop(0, '#8B4513');
        gradient.addColorStop(1, '#D2B48C');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 400, 200);
        
        ctx.fillStyle = '#8B0000';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('⚔️ GLADIATOR ARENA ⚔️', 200, 50);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Arial';
        ctx.fillText('A challenge has been issued!', 200, 100);
        ctx.fillText(`Pot: 🍯${(challenge.betAmount * 2).toLocaleString()}`, 200, 130);
        
        const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'challenge.png' });
        embed.setImage('attachment://challenge.png');
        
        return { embed, files: [attachment] };
    }

    // Helper function to create challenge buttons
    function createChallengeButtons(challengeId) {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`accept_${challengeId}`)
                .setLabel('Accept Challenge')
                .setStyle(ButtonStyle.Success)
                .setEmoji('⚔️'),
            new ButtonBuilder()
                .setCustomId(`decline_${challengeId}`)
                .setLabel('Decline')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );
    }

    // Helper function to create class selection buttons
    function createClassSelectionButtons(challengeId) {
        const rows = [];
        const classes = Object.entries(GLADIATOR_CLASSES);
        
        for (let i = 0; i < classes.length; i += 2) {
            const row = new ActionRowBuilder();
            
            for (let j = 0; j < 2 && i + j < classes.length; j++) {
                const [key, data] = classes[i + j];
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`class_${key}_${challengeId}`)
                        .setLabel(`${data.emoji} ${data.name}`)
                        .setStyle(ButtonStyle.Primary)
                );
            }
            
            rows.push(row);
        }
        
        return rows;
    }

    // Helper function to create arena embed
    async function createArenaEmbed(match) {
        const currentPlayer = match.currentTurn === match.player1.id ? match.player1 : match.player2;
        
        const embed = new EmbedBuilder()
            .setColor('#8B4513')
            .setTitle('⚔️ GLADIATOR COMBAT IN PROGRESS')
            .setDescription(`**Turn ${match.turnCount}** - ${currentPlayer.displayName}'s turn`)
            .addFields(
                { name: '💰 Prize Pot', value: `🍯{match.pot.toLocaleString()}`, inline: true },
                { name: '⏱️ Turn Timer', value: `${TURN_TIMEOUT/1000} seconds`, inline: true },
                { name: '📊 Combat Stats', value: `${match.combatLog.length} attacks made`, inline: true }
            )
            .setFooter({ text: 'Choose your attack wisely! Stamina is limited.' })
            .setTimestamp();

        const arenaBuffer = await createArenaVisualization(match, match.combatLog);
        const attachment = new AttachmentBuilder(arenaBuffer, { name: 'arena.png' });
        embed.setImage('attachment://arena.png');
        
        return { embed, files: [attachment] };
    }

    // Helper function to create combat buttons
    function createCombatButtons(matchId, currentTurn) {
        const rows = [];
        const attacks = Object.entries(ATTACK_TYPES);
        
        for (let i = 0; i < attacks.length; i += 2) {
            const row = new ActionRowBuilder();
            
            for (let j = 0; j < 2 && i + j < attacks.length; j++) {
                const [key, attack] = attacks[i + j];
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`attack_${matchId}_${key}`)
                        .setLabel(`${attack.emoji} ${attack.name}`)
                        .setStyle(ButtonStyle.Primary)
                );
            }
            
            rows.push(row);
        }
        
        // Add final attack button if odd number
        if (attacks.length % 2 !== 0) {
            const lastAttack = attacks[attacks.length - 1];
            const [key, attack] = lastAttack;
            rows[rows.length - 1].addComponents(
                new ButtonBuilder()
                    .setCustomId(`attack_${matchId}_${key}`)
                    .setLabel(`${attack.emoji} ${attack.name}`)
                    .setStyle(ButtonStyle.Primary)
            );
        }
        
        return rows;
    }

    // Helper function to create victory embed
    async function createVictoryEmbed(match, winner, loser, winnings) {
        const embed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('🏆 VICTORY IN THE ARENA!')
            .setDescription(`**${winner.displayName}** emerges victorious from gladiator combat!`)
            .addFields(
                { name: '🏆 Winner', value: `${winner.displayName} (${GLADIATOR_CLASSES[winner.gladiatorClass].emoji} ${winner.gladiatorClass})`, inline: true },
                { name: '💀 Defeated', value: `${loser.displayName} (${GLADIATOR_CLASSES[loser.gladiatorClass].emoji} ${loser.gladiatorClass})`, inline: true },
                { name: '💰 Winnings', value: `🍯{winnings.toLocaleString()}`, inline: true },
                { name: '⚔️ Combat Summary', value: `${match.turnCount} turns • ${match.combatLog.length} attacks`, inline: true },
                { name: '🏥 Final Health', value: `Winner: ${winner.health}/${winner.maxHealth} HP`, inline: true },
                { name: '⏱️ Match Duration', value: `${Math.floor((Date.now() - match.startTime) / 1000)} seconds`, inline: true }
            )
            .setTimestamp();

        // Create victory visualization
        const canvas = createCanvas(600, 400);
        const ctx = canvas.getContext('2d');
        
        // Golden background
        const gradient = ctx.createRadialGradient(300, 200, 0, 300, 200, 300);
        gradient.addColorStop(0, '#FFD700');
        gradient.addColorStop(1, '#B8860B');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 400);
        
        // Victory text
        ctx.fillStyle = '#8B0000';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 5;
        ctx.fillText('🏆 VICTORY! 🏆', 300, 80);
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(winner.displayName, 300, 120);
        
        ctx.font = '18px Arial';
        ctx.fillText(`Defeats ${loser.displayName}`, 300, 150);
        ctx.fillText(`Wins 🍯${winnings.toLocaleString()}`, 300, 180);
        
        // Champion laurel wreath effect
        ctx.strokeStyle = '#228B22';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(300, 250, 80, 0, Math.PI * 2);
        ctx.stroke();
        
        // Draw winner avatar in center
        try {
            const avatarURL = winner.avatarURL || 
                `https://cdn.discordapp.com/embed/avatars/${winner.id % 5}.png`;
            const avatar = await loadImageFromURL(avatarURL);
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(300, 250, 60, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, 240, 190, 120, 120);
            ctx.restore();
            
            // Golden border
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(300, 250, 60, 0, Math.PI * 2);
            ctx.stroke();
            
        } catch (error) {
            // Fallback
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(300, 250, 60, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#8B0000';
            ctx.font = 'bold 40px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('👑', 300, 265);
        }
        
        const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'victory.png' });
        embed.setImage('attachment://victory.png');
        
        return { embed, files: [attachment] };
    }

    // Clean up on startup and load challenges from database
    client.once('ready', async () => {
        console.log('Gladiator Arena Handler loaded! ⚔️🏛️');

        // Clear all existing matches
        activeMatches.forEach(match => {
            if (match.turnTimer) {
                clearTimeout(match.turnTimer);
            }
        });
        activeMatches.clear();
        activeChallenges.clear();

        // Load active gladiator challenges from database
        try {
            const gladiatorChallenges = await Challenge.find({ type: 'gladiator' });
            console.log(`[GLADIATOR] Loaded ${gladiatorChallenges.length} active challenges from database`);

            for (const dbChallenge of gladiatorChallenges) {
                const challenge = {
                    id: dbChallenge.challengeId,
                    challenger: {
                        id: dbChallenge.creator,
                        username: dbChallenge.creatorName,
                        displayName: dbChallenge.creatorName,
                        avatarURL: dbChallenge.challengerAvatarURL,
                        gladiatorClass: dbChallenge.gladiatorClass
                    },
                    challenged: {
                        id: dbChallenge.challenged,
                        username: dbChallenge.challengedName,
                        displayName: dbChallenge.challengedName,
                        avatarURL: dbChallenge.challengedAvatarURL,
                        gladiatorClass: null
                    },
                    betAmount: dbChallenge.amount,
                    channelId: dbChallenge.channelId,
                    timestamp: dbChallenge.createdAt.getTime()
                };
                activeChallenges.set(dbChallenge.challengeId, challenge);
            }
        } catch (error) {
            console.error('[GLADIATOR] Error loading challenges from database:', error);
        }
    });
};
