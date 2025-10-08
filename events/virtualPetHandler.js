const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const https = require('https');
const { getPet, savePet, deletePet, getPetInventory, savePetInventory, getTopPets } = require('../database/helpers/petHelpers');
const { getBobbyBucks, updateBobbyBucks } = require('../database/helpers/economyHelpers');

// Active games tracker
const activeGames = new Map();

// Pet types with different characteristics
const PET_TYPES = {
    dog: {
        name: 'Dog',
        emoji: '🐕',
        hungerDecay: 0.8,
        happinessDecay: 0.6,
        energyDecay: 0.7,
        cleanlinessDecay: 0.5,
        healthDecay: 0.3,
        cost: 500,
        abilities: ['fetch', 'guard', 'dig'],
        favoriteGames: ['fetch', 'race']
    },
    cat: {
        name: 'Cat',
        emoji: '🐱',
        hungerDecay: 0.6,
        happinessDecay: 0.4,
        energyDecay: 0.5,
        cleanlinessDecay: 0.3,
        healthDecay: 0.2,
        cost: 400,
        abilities: ['hunt', 'stealth', 'climb'],
        favoriteGames: ['hunt', 'hide_seek']
    },
    rabbit: {
        name: 'Rabbit',
        emoji: '🐰',
        hungerDecay: 1.0,
        happinessDecay: 0.5,
        energyDecay: 0.6,
        cleanlinessDecay: 0.4,
        healthDecay: 0.3,
        cost: 300,
        abilities: ['hop', 'burrow', 'forage'],
        favoriteGames: ['race', 'treasure_hunt']
    },
    bird: {
        name: 'Bird',
        emoji: '🐦',
        hungerDecay: 0.9,
        happinessDecay: 0.7,
        energyDecay: 0.8,
        cleanlinessDecay: 0.6,
        healthDecay: 0.4,
        cost: 350,
        abilities: ['fly', 'sing', 'scout'],
        favoriteGames: ['fetch', 'treasure_hunt']
    },
    fish: {
        name: 'Fish',
        emoji: '🐠',
        hungerDecay: 0.4,
        happinessDecay: 0.2,
        energyDecay: 0.3,
        cleanlinessDecay: 0.8,
        healthDecay: 0.2,
        cost: 200,
        abilities: ['swim', 'bubble', 'dive'],
        favoriteGames: ['bubble_pop', 'race']
    },
    dragon: {
        name: 'Dragon',
        emoji: '🐉',
        hungerDecay: 1.2,
        happinessDecay: 0.8,
        energyDecay: 0.9,
        cleanlinessDecay: 0.7,
        healthDecay: 0.5,
        cost: 2000,
        abilities: ['breathe_fire', 'fly', 'roar'],
        favoriteGames: ['treasure_hunt', 'battle']
    },
    unicorn: {
        name: 'Unicorn',
        emoji: '🦄',
        hungerDecay: 0.7,
        happinessDecay: 0.5,
        energyDecay: 0.6,
        cleanlinessDecay: 0.4,
        healthDecay: 0.2,
        cost: 1500,
        abilities: ['heal', 'magic', 'sparkle'],
        favoriteGames: ['race', 'treasure_hunt']
    },
    penguin: {
        name: 'Penguin',
        emoji: '🐧',
        hungerDecay: 0.7,
        happinessDecay: 0.4,
        energyDecay: 0.5,
        cleanlinessDecay: 0.3,
        healthDecay: 0.3,
        cost: 450,
        abilities: ['slide', 'swim', 'waddle'],
        favoriteGames: ['race', 'ice_slide']
    }
};

// Pet personalities that affect behavior
const PERSONALITIES = {
    playful: { happiness_bonus: 1.2, energy_decay: 1.1, favorite_activity: 'play', emoji: '🎭' },
    lazy: { energy_decay: 0.8, happiness_bonus: 0.9, favorite_activity: 'sleep', emoji: '😴' },
    curious: { experience_bonus: 1.3, happiness_bonus: 1.1, favorite_activity: 'explore', emoji: '🔍' },
    brave: { health_bonus: 1.1, happiness_bonus: 1.0, favorite_activity: 'adventure', emoji: '⚔️' },
    shy: { happiness_bonus: 0.9, energy_decay: 0.9, favorite_activity: 'cuddle', emoji: '🙈' },
    energetic: { energy_decay: 1.2, happiness_bonus: 1.2, favorite_activity: 'play', emoji: '⚡' },
    gentle: { happiness_bonus: 1.0, health_bonus: 1.1, favorite_activity: 'cuddle', emoji: '💕' },
    mischievous: { happiness_bonus: 1.1, cleanliness_decay: 1.2, favorite_activity: 'play', emoji: '😈' }
};

// Pet moods/emotions
const MOODS = {
    ecstatic: { emoji: '🤩', threshold: 90, messages: ['is bouncing with joy!', 'can\'t stop wagging!', 'is absolutely thrilled!'] },
    happy: { emoji: '😊', threshold: 70, messages: ['seems content!', 'is smiling!', 'looks pleased!'] },
    content: { emoji: '😌', threshold: 50, messages: ['is doing okay.', 'seems calm.', 'is relaxed.'] },
    sad: { emoji: '😢', threshold: 30, messages: ['looks sad...', 'seems down...', 'needs attention...'] },
    angry: { emoji: '😠', threshold: 15, messages: ['is upset!', 'seems frustrated!', 'is grumpy!'] },
    sick: { emoji: '🤢', threshold: 0, messages: ['is feeling ill!', 'needs care badly!', 'is in poor condition!'] }
};

// Pet achievements
const ACHIEVEMENTS = {
    first_steps: { name: 'First Steps', emoji: '👶', description: 'Reach level 5', requirement: { type: 'level', value: 5 }, reward: 100 },
    dedicated_owner: { name: 'Dedicated Owner', emoji: '💝', description: 'Care for your pet 50 times', requirement: { type: 'care_count', value: 50 }, reward: 250 },
    happy_camper: { name: 'Happy Camper', emoji: '😄', description: 'Keep happiness above 90 for 7 days', requirement: { type: 'happy_streak', value: 7 }, reward: 500 },
    master_trainer: { name: 'Master Trainer', emoji: '🎓', description: 'Train your pet 25 times', requirement: { type: 'train_count', value: 25 }, reward: 300 },
    speed_demon: { name: 'Speed Demon', emoji: '🏃', description: 'Win 10 races', requirement: { type: 'race_wins', value: 10 }, reward: 400 },
    treasure_hunter: { name: 'Treasure Hunter', emoji: '💎', description: 'Find 20 treasures', requirement: { type: 'treasures_found', value: 20 }, reward: 600 },
    ancient_companion: { name: 'Ancient Companion', emoji: '👴', description: 'Keep your pet alive for 30 days', requirement: { type: 'age', value: 30 }, reward: 1000 },
    max_level: { name: 'Maximum Power', emoji: '⚡', description: 'Reach level 50', requirement: { type: 'level', value: 50 }, reward: 2000 },
    social_butterfly: { name: 'Social Butterfly', emoji: '🦋', description: 'Have 15 playdates', requirement: { type: 'playdates', value: 15 }, reward: 350 },
    perfect_health: { name: 'Perfect Health', emoji: '💪', description: 'Keep all stats above 80 for 5 days', requirement: { type: 'perfect_streak', value: 5 }, reward: 750 }
};

// Random pet events
const RANDOM_EVENTS = [
    { id: 'found_treasure', chance: 0.05, message: 'found a treasure while exploring!', reward: { type: 'bobby_bucks', amount: 100 }, stat: 'treasures_found' },
    { id: 'found_food', chance: 0.08, message: 'found some food!', effect: { hunger: 20 } },
    { id: 'made_friend', chance: 0.06, message: 'made a new friend!', effect: { happiness: 25 } },
    { id: 'got_dirty', chance: 0.07, message: 'got messy playing!', effect: { cleanliness: -30, happiness: 10 } },
    { id: 'learned_trick', chance: 0.04, message: 'learned a new trick!', effect: { experience: 20 } },
    { id: 'feel_sick', chance: 0.03, message: 'isn\'t feeling well...', effect: { health: -25 } },
    { id: 'burst_energy', chance: 0.06, message: 'had a sudden burst of energy!', effect: { energy: 25, happiness: 15 } },
    { id: 'nap', chance: 0.08, message: 'took a spontaneous nap!', effect: { energy: 30, hunger: -10 } }
];

// Pet items that can be purchased
const PET_ITEMS = {
    // Food items
    basic_food: { name: 'Basic Pet Food', emoji: '🥫', type: 'food', cost: 50, hunger: 25, happiness: 5 },
    premium_food: { name: 'Premium Pet Food', emoji: '🍖', type: 'food', cost: 100, hunger: 40, happiness: 10 },
    treats: { name: 'Pet Treats', emoji: '🍪', type: 'food', cost: 75, hunger: 15, happiness: 20 },
    gourmet_meal: { name: 'Gourmet Pet Meal', emoji: '🍽️', type: 'food', cost: 200, hunger: 60, happiness: 25 },
    
    // Toys
    ball: { name: 'Ball', emoji: '⚽', type: 'toy', cost: 150, happiness: 30, energy: -10 },
    rope: { name: 'Rope Toy', emoji: '🪢', type: 'toy', cost: 120, happiness: 25, energy: -15 },
    mouse_toy: { name: 'Toy Mouse', emoji: '🐭', type: 'toy', cost: 100, happiness: 35, energy: -20 },
    feather: { name: 'Feather Wand', emoji: '🪶', type: 'toy', cost: 130, happiness: 40, energy: -25 },
    
    // Medicine/Care items
    medicine: { name: 'Pet Medicine', emoji: '💊', type: 'medicine', cost: 300, health: 50 },
    vitamins: { name: 'Pet Vitamins', emoji: '🧪', type: 'medicine', cost: 150, health: 25, happiness: 10 },
    soap: { name: 'Pet Soap', emoji: '🧼', type: 'care', cost: 80, cleanliness: 40 },
    shampoo: { name: 'Premium Shampoo', emoji: '🧴', type: 'care', cost: 120, cleanliness: 60, happiness: 15 },
    
    // Accessories
    collar: { name: 'Fancy Collar', emoji: '📿', type: 'accessory', cost: 250, happiness: 20, permanent: true },
    bow: { name: 'Cute Bow', emoji: '🎀', type: 'accessory', cost: 180, happiness: 15, permanent: true },
    hat: { name: 'Pet Hat', emoji: '🎩', type: 'accessory', cost: 300, happiness: 25, permanent: true },
    bed: { name: 'Comfy Pet Bed', emoji: '🛏️', type: 'accessory', cost: 400, happiness: 30, energy: 20, permanent: true }
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

module.exports = (client) => {
    // Initialize pet decay system
    setInterval(() => {
        updateAllPetsDecay();
    }, 300000); // Update every 5 minutes

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!message.guild) return;

        const args = message.content.split(' ');

        // Adopt a pet command
        if (args[0] === '!adopt') {
            const userId = message.author.id;
            const currentPet = await getPet(userId);
            
            if (currentPet) {
                return message.channel.send('❌ You already have a pet! Use `!pet` to check on them.');
            }

            const adoptionMenu = await createAdoptionMenu();
            const attachment = new AttachmentBuilder(adoptionMenu.toBuffer(), { name: 'adoption-center.png' });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`pet_adopt_${userId}`)
                .setPlaceholder('Choose a pet to adopt!')
                .addOptions(
                    Object.entries(PET_TYPES).map(([key, pet]) => ({
                        label: `${pet.emoji} ${pet.name} - ¢${pet.cost}`,
                        description: `A lovely ${pet.name.toLowerCase()} companion`,
                        value: key
                    }))
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle('🏠 Pet Adoption Center')
                .setColor('#7b68ee')
                .setDescription('**Welcome to the Pet Adoption Center!**\nChoose your new companion from our selection of adorable pets.')
                .setImage('attachment://adoption-center.png')
                .addFields(
                    { name: '💰 Adoption Fees', value: Object.entries(PET_TYPES).map(([key, pet]) => `${pet.emoji} ${pet.name}: ??{pet.cost}`).join('\n'), inline: true },
                    { name: '🎮 Getting Started', value: 'After adoption, use:\n• `!pet` - Check pet status\n• `!feed` - Feed your pet\n• `!play` - Play with your pet\n• `!petshop` - Buy items', inline: true }
                )
                .setFooter({ text: 'All pets come with love and companionship!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment], components: [row] });
        }

        // Check pet status
        if (args[0] === '!pet') {
            const userId = message.author.id;
            const pet = await getPet(userId);

            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet yet! Use `!adopt` to get one.');
            }

            const petCard = await createPetCard(message.author, pet);
            const attachment = new AttachmentBuilder(petCard.toBuffer(), { name: 'pet-status.png' });

            // Row 1: Basic Care (emojis in labels to avoid rendering issues)
            const careRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pet_feed_${userId}`)
                        .setLabel('🍽 Feed')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`pet_play_${userId}`)
                        .setLabel('🎾 Play')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`pet_clean_${userId}`)
                        .setLabel('🛁 Clean')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`pet_sleep_${userId}`)
                        .setLabel('💤 Sleep')
                        .setStyle(ButtonStyle.Secondary)
                );

            // Row 2: Games & Activities
            const gamesRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pet_mood_${userId}`)
                        .setLabel('😊 Mood')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`pet_race_${userId}`)
                        .setLabel('🏁 Race')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`pet_treasure_${userId}`)
                        .setLabel('💎 Treasure')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`pet_adventure_${userId}`)
                        .setLabel('🗺 Adventure')
                        .setStyle(ButtonStyle.Success)
                );

            // Row 3: Social & Info
            const allPets = getAllPets(userId);
            const socialRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pet_train_${userId}`)
                        .setLabel('🎓 Train')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`pet_achievements_${userId}`)
                        .setLabel('🏆 Achievements')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`pet_shop_${userId}`)
                        .setLabel('🛒 Shop')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`pet_inventory_${userId}`)
                        .setLabel('🎒 Inventory')
                        .setStyle(ButtonStyle.Secondary)
                );

            // Add switch pet button if user has multiple pets
            if (allPets.length > 1) {
                socialRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pet_switch_${userId}`)
                        .setLabel(`🔄 Switch Pet (${allPets.length})`)
                        .setStyle(ButtonStyle.Success)
                );
            }

            const mood = getPetMood(pet);
            const personality = pet.personality ? PERSONALITIES[pet.personality] : null;
            const petStatus = getPetStatus(pet);

            // Calculate sleep status if sleeping
            let sleepInfo = '';
            if (pet.isSleeping && pet.sleepStartTime) {
                const sleepMinutes = Math.floor((Date.now() - pet.sleepStartTime) / 60000);
                sleepInfo = `\n\n😴 **Currently Sleeping** (${sleepMinutes} min)\n⚡ Energy recovering at 2/min`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`${PET_TYPES[pet.type].emoji} ${pet.name}`)
                .setColor(petStatus.color)
                .setDescription(`**${petStatus.message}**\n${mood.emoji} *${mood.messages[Math.floor(Math.random() * mood.messages.length)]}*${sleepInfo}`)
                .setImage('attachment://pet-status.png')
                .addFields(
                    { name: '\u200B', value: getStatsDisplay(pet), inline: false },
                    {
                        name: '📋 Info',
                        value: `⭐ **Level ${pet.level}** • ${pet.experience}/100 XP\n🎂 Age: **${pet.age} days**\n🎭 ${personality ? `${personality.emoji} ${pet.personality}` : '🎲 Random'}`,
                        inline: true
                    },
                    {
                        name: '🏆 Progress',
                        value: `Achievements: **${getPetAchievements(userId).length}/10**\nRaces Won: **${pet.stats?.race_wins || 0}**\nTreasures: **${pet.stats?.treasures_found || 0}**\nPlaydates: **${pet.stats?.playdates || 0}**`,
                        inline: true
                    }
                )
                .setFooter({ text: '💡 Stats update in real-time! Use buttons below to interact.' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment], components: [careRow, gamesRow, socialRow] });
        }

        // Pet shop command - IMPROVED!
        if (args[0] === '!petshop' || args[0] === '!shop') {
            const userId = message.author.id;
            const pet = await getPet(userId);

            if (!pet) {
                return message.channel.send('❌ You need a pet to use the pet shop! Use `!adopt` to get one.');
            }

            const balance = getBobbyBucks(userId);

            // Create item buttons organized by category
            const foodItems = Object.entries(PET_ITEMS).filter(([, item]) => item.type === 'food');
            const toyItems = Object.entries(PET_ITEMS).filter(([, item]) => item.type === 'toy');
            const medicineItems = Object.entries(PET_ITEMS).filter(([, item]) => item.type === 'medicine');
            const careItems = Object.entries(PET_ITEMS).filter(([, item]) => item.type === 'care');
            const accessoryItems = Object.entries(PET_ITEMS).filter(([, item]) => item.type === 'accessory');

            const embed = new EmbedBuilder()
                .setTitle('🛒 Bobby\'s Pet Shop')
                .setColor('#6B8E23')
                .setDescription(`**Welcome! We have everything your pet needs!**\n💰 Your Balance: **¢${balance.toLocaleString()}**\n\n🛍️ *Select an item below to purchase*`)
                .addFields(
                    {
                        name: '🍽️ Food & Treats',
                        value: foodItems.map(([, item]) =>
                            `**${item.emoji} ${item.name}** - ¢${item.cost}\n↳ ${item.hunger ? `+${item.hunger} Hunger` : ''} ${item.happiness ? `+${item.happiness} Happiness` : ''}`
                        ).join('\n'),
                        inline: false
                    },
                    {
                        name: '🎾 Toys',
                        value: toyItems.map(([, item]) =>
                            `**${item.emoji} ${item.name}** - ¢${item.cost}\n↳ +${item.happiness} Happiness, ${item.energy} Energy`
                        ).join('\n'),
                        inline: false
                    },
                    {
                        name: '💊 Medicine & Health',
                        value: medicineItems.map(([, item]) =>
                            `**${item.emoji} ${item.name}** - ¢${item.cost}\n↳ +${item.health} Health${item.happiness ? `, +${item.happiness} Happiness` : ''}`
                        ).join('\n'),
                        inline: true
                    },
                    {
                        name: '🛁 Care Items',
                        value: careItems.map(([, item]) =>
                            `**${item.emoji} ${item.name}** - ¢${item.cost}\n↳ +${item.cleanliness} Cleanliness${item.happiness ? `, +${item.happiness} Happiness` : ''}`
                        ).join('\n'),
                        inline: true
                    },
                    {
                        name: '👑 Accessories (Permanent!)',
                        value: accessoryItems.map(([, item]) => {
                            const effects = [];
                            if (item.happiness) effects.push(`+${item.happiness} Happiness`);
                            if (item.energy) effects.push(`+${item.energy} Energy`);
                            return `**${item.emoji} ${item.name}** - ¢${item.cost}\n↳ ${effects.join(', ')} (Keeps forever!)`;
                        }).join('\n'),
                        inline: false
                    }
                )
                .setFooter({ text: '💡 Use !use <item_key> to use items from your inventory' })
                .setTimestamp();

            // Create select menu with ALL items
            const allItems = Object.entries(PET_ITEMS).map(([key, item]) => ({
                label: `${item.emoji} ${item.name} - ¢${item.cost}`,
                description: `${item.type.charAt(0).toUpperCase() + item.type.slice(1)} item`,
                value: key
            })).slice(0, 25); // Discord limit

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`pet_buyitem_${userId}`)
                .setPlaceholder('🛍️ Select an item to purchase...')
                .addOptions(allItems);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            return message.channel.send({ embeds: [embed], components: [row] });
        }

        // Feed pet with specific food
        if (args[0] === '!feed' && args[1]) {
            const userId = message.author.id;
            const pet = await getPet(userId);
            const foodKey = args[1].toLowerCase();
            
            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet to feed! Use `!adopt` to get one.');
            }

            const food = PET_ITEMS[foodKey];
            if (!food || food.type !== 'food') {
                const availableFood = Object.entries(PET_ITEMS)
                    .filter(([key, item]) => item.type === 'food')
                    .map(([key, item]) => `\`${key}\` - ${item.name} (??{item.cost})`)
                    .join('\n');
                
                return message.channel.send(`❌ Invalid food item! Available food:\n${availableFood}`);
            }

            const balance = getBobbyBucks(userId);
            if (balance < food.cost) {
                return message.channel.send(`❌ You need ??{food.cost} to buy ${food.name}! You have ??{balance}.`);
            }

            // Process feeding
            updateBobbyBucks(userId, -food.cost);
            pet.hunger = Math.min(100, pet.hunger + food.hunger);
            pet.happiness = Math.min(100, pet.happiness + (food.happiness || 0));
            pet.experience += 5;
            pet.lastFed = Date.now();
            await savePet(userId, pet);

            const feedingCard = await createFeedingCard(message.author, pet, food);
            const attachment = new AttachmentBuilder(feedingCard.toBuffer(), { name: 'feeding-card.png' });

            const embed = new EmbedBuilder()
                .setTitle(`${PET_TYPES[pet.type].emoji} Feeding Time!`)
                .setColor('#8fbc8f')
                .setDescription(`**${pet.name} enjoyed the ${food.name}!**`)
                .setImage('attachment://feeding-card.png')
                .addFields(
                    { name: '🍽️ Food', value: food.name, inline: true },
                    { name: '💰 Cost', value: `??{food.cost}`, inline: true },
                    { name: '⭐ XP Gained', value: '+5 XP', inline: true }
                )
                .setFooter({ text: 'Your pet is grateful for the meal!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // Pet inventory command
        if (args[0] === '!petinventory' || args[0] === '!petinv') {
            const userId = message.author.id;
            const pet = await getPet(userId);
            
            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet! Use `!adopt` to get one.');
            }

            const inventory = await getPetInventory(userId);
            const inventoryCard = await createInventoryCard(message.author, pet, inventory);
            const attachment = new AttachmentBuilder(inventoryCard.toBuffer(), { name: 'pet-inventory.png' });

            const embed = new EmbedBuilder()
                .setTitle(`${PET_TYPES[pet.type].emoji} ${pet.name}'s Inventory`)
                .setColor('#9370db')
                .setDescription('**Items owned by your pet**')
                .setImage('attachment://pet-inventory.png')
                .addFields(
                    { name: '📦 Total Items', value: Object.values(inventory).reduce((a, b) => a + b, 0).toString(), inline: true },
                    { name: '🎯 Usage', value: 'Use `!use <item>` to use items', inline: true }
                )
                .setFooter({ text: 'Keep your pet well-supplied!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // Use item command
        if (args[0] === '!use' && args[1]) {
            const userId = message.author.id;
            const pet = await getPet(userId);
            const itemKey = args[1].toLowerCase();
            
            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet! Use `!adopt` to get one.');
            }

            const inventory = await getPetInventory(userId);
            if (!inventory[itemKey] || inventory[itemKey] <= 0) {
                return message.channel.send(`❌ You don't have any ${itemKey} in your inventory!`);
            }

            const item = PET_ITEMS[itemKey];
            if (!item) {
                return message.channel.send('❌ Invalid item!');
            }

            // Use the item
            if (item.hunger) pet.hunger = Math.min(100, pet.hunger + item.hunger);
            if (item.happiness) pet.happiness = Math.min(100, pet.happiness + item.happiness);
            if (item.health) pet.health = Math.min(100, pet.health + item.health);
            if (item.energy) pet.energy = Math.max(0, Math.min(100, pet.energy + item.energy));
            if (item.cleanliness) pet.cleanliness = Math.min(100, pet.cleanliness + item.cleanliness);

            pet.experience += 3;
            pet.lastCared = Date.now();

            // Remove item from inventory (unless permanent)
            if (!item.permanent) {
                inventory[itemKey]--;
                await savePetInventory(userId, inventory);
            }

            await savePet(userId, pet);

            const useCard = await createItemUseCard(message.author, pet, item);
            const attachment = new AttachmentBuilder(useCard.toBuffer(), { name: 'item-use.png' });

            const embed = new EmbedBuilder()
                .setTitle(`${item.emoji} Item Used!`)
                .setColor('#8fbc8f')
                .setDescription(`**${pet.name} used ${item.name}!**`)
                .setImage('attachment://item-use.png')
                .addFields(
                    { name: '📦 Item', value: item.name, inline: true },
                    { name: '✨ Effect', value: getItemEffectText(item), inline: true },
                    { name: '⭐ XP Gained', value: '+3 XP', inline: true }
                )
                .setFooter({ text: 'Item used successfully!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // Pet leaderboard
        if (args[0] === '!petleaderboard' || args[0] === '!pettop') {
            const topPets = await getTopPets(message.guild, 10);
            
            if (topPets.length === 0) {
                return message.channel.send('❌ No pets found in this server!');
            }

            const leaderboardCard = await createPetLeaderboard(topPets, message.guild);
            const attachment = new AttachmentBuilder(leaderboardCard.toBuffer(), { name: 'pet-leaderboard.png' });

            const embed = new EmbedBuilder()
                .setTitle('🏆 Pet Leaderboard - Happiest Pets')
                .setColor('#daa520')
                .setDescription('**Top 10 happiest and healthiest pets in the server!**')
                .setImage('attachment://pet-leaderboard.png')
                .addFields(
                    { name: '📊 Ranking Method', value: 'Based on happiness + health + level', inline: true },
                    { name: '🎯 Total Pets', value: topPets.length.toString(), inline: true }
                )
                .setFooter({ text: 'Take good care of your pet to climb the ranks!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // Pet training command
        if (args[0] === '!train') {
            const userId = message.author.id;
            const pet = await getPet(userId);
            
            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet to train! Use `!adopt` to get one.');
            }

            const trainingCost = 100;
            const balance = getBobbyBucks(userId);
            
            if (balance < trainingCost) {
                return message.channel.send(`❌ Training costs ??{trainingCost}! You have ??{balance}.`);
            }

            const timeSinceLastTraining = Date.now() - (pet.lastTraining || 0);
            const cooldownTime = 1800000; // 30 minutes
            
            if (timeSinceLastTraining < cooldownTime) {
                const remainingTime = Math.ceil((cooldownTime - timeSinceLastTraining) / 60000);
                return message.channel.send(`❌ Your pet is tired from training! Wait ${remainingTime} more minutes.`);
            }

            // Process training
            updateBobbyBucks(userId, -trainingCost);
            pet.experience += 15;
            pet.energy = Math.max(0, pet.energy - 20);
            pet.happiness = Math.min(100, pet.happiness + 10);
            pet.lastTraining = Date.now();
            
            // Check for level up
            const oldLevel = pet.level;
            while (pet.experience >= 100) {
                pet.experience -= 100;
                pet.level++;
            }
            
            await savePet(userId, pet);

            const trainingCard = await createTrainingCard(message.author, pet, oldLevel);
            const attachment = new AttachmentBuilder(trainingCard.toBuffer(), { name: 'training-card.png' });

            const levelUpText = pet.level > oldLevel ? `\n🎉 **LEVEL UP!** ${pet.name} is now level ${pet.level}!` : '';

            const embed = new EmbedBuilder()
                .setTitle(`${PET_TYPES[pet.type].emoji} Training Session Complete!`)
                .setColor('#6495ed')
                .setDescription(`**${pet.name} completed training!**${levelUpText}`)
                .setImage('attachment://training-card.png')
                .addFields(
                    { name: '💰 Cost', value: `??{trainingCost}`, inline: true },
                    { name: '⭐ XP Gained', value: '+15 XP', inline: true },
                    { name: '😊 Happiness', value: '+10', inline: true }
                )
                .setFooter({ text: 'Training makes your pet smarter and happier!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // NEW INTERACTIVE FEATURES!

        // Pet mood/emotion check
        if (args[0] === '!petmood' || args[0] === '!mood') {
            const userId = message.author.id;
            const pet = await getPet(userId);

            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet! Use `!adopt` to get one.');
            }

            const moodCard = await createMoodCard(pet, message.author);
            const attachment = new AttachmentBuilder(moodCard.toBuffer(), { name: 'pet-mood.png' });

            const mood = getPetMood(pet);

            const embed = new EmbedBuilder()
                .setTitle(`${PET_TYPES[pet.type].emoji} ${pet.name}'s Emotional State`)
                .setColor(getPetStatus(pet).color)
                .setDescription(`**${pet.name} ${mood.messages[Math.floor(Math.random() * mood.messages.length)]}**`)
                .setImage('attachment://pet-mood.png')
                .setFooter({ text: 'Your pet\'s mood changes based on their care!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // Mini-game: Fetch
        if (args[0] === '!fetch') {
            const userId = message.author.id;
            const pet = await getPet(userId);

            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet! Use `!adopt` to get one.');
            }

            if (pet.energy < 25) {
                return message.channel.send(`❌ ${pet.name} is too tired to play fetch! Let them rest.`);
            }

            if (activeGames.has(userId)) {
                return message.channel.send('❌ You already have an active game!');
            }

            const directions = ['⬅️', '➡️', '⬆️', '⬇️'];
            const sequence = Array.from({ length: 5 }, () => directions[Math.floor(Math.random() * directions.length)]);

            activeGames.set(userId, {
                type: 'fetch',
                sequence,
                currentStep: 0,
                startTime: Date.now(),
                pet
            });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId(`fetch_left_${userId}`).setEmoji('⬅️').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`fetch_right_${userId}`).setEmoji('➡️').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`fetch_up_${userId}`).setEmoji('⬆️').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`fetch_down_${userId}`).setEmoji('⬇️').setStyle(ButtonStyle.Primary)
                );

            const embed = new EmbedBuilder()
                .setTitle(`${PET_TYPES[pet.type].emoji} Fetch Game Started!`)
                .setColor('#4169e1')
                .setDescription(`**Watch where the ball goes and click the arrows in order!**\n\n🎾 Ball path: ${sequence.join(' → ')}\n\n⏱️ You have 30 seconds!`)
                .setFooter({ text: 'Click the arrows in the correct sequence!' });

            message.channel.send({ embeds: [embed], components: [row] });

            setTimeout(() => {
                if (activeGames.has(userId) && activeGames.get(userId).type === 'fetch') {
                    activeGames.delete(userId);
                    message.channel.send(`⏰ Time's up! ${pet.name} looks disappointed...`);
                }
            }, 30000);

            return;
        }

        // Mini-game: Treasure Hunt
        if (args[0] === '!treasure' || args[0] === '!hunt') {
            const userId = message.author.id;
            const pet = await getPet(userId);

            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet! Use `!adopt` to get one.');
            }

            if (pet.energy < 30) {
                return message.channel.send(`❌ ${pet.name} is too tired for a treasure hunt!`);
            }

            if (activeGames.has(userId)) {
                return message.channel.send('❌ You already have an active game!');
            }

            const treasureSpot = Math.floor(Math.random() * 9);

            activeGames.set(userId, {
                type: 'treasure',
                treasureSpot,
                attempts: 0,
                maxAttempts: 3,
                startTime: Date.now(),
                pet
            });

            const buttons = [];
            for (let i = 0; i < 9; i++) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`treasure_${i}_${userId}`)
                        .setLabel('❓')
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            const rows = [
                new ActionRowBuilder().addComponents(buttons.slice(0, 3)),
                new ActionRowBuilder().addComponents(buttons.slice(3, 6)),
                new ActionRowBuilder().addComponents(buttons.slice(6, 9))
            ];

            const embed = new EmbedBuilder()
                .setTitle(`${PET_TYPES[pet.type].emoji} Treasure Hunt!`)
                .setColor('#daa520')
                .setDescription(`**${pet.name} is searching for treasure!**\n\nClick a spot to dig! You have 3 tries.\n💎 Find the treasure for a big reward!`)
                .setFooter({ text: 'Choose wisely! Only 3 attempts!' });

            return message.channel.send({ embeds: [embed], components: rows });
        }

        // Mini-game: Pet Race
        if (args[0] === '!race') {
            const userId = message.author.id;
            const pet = await getPet(userId);

            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet! Use `!adopt` to get one.');
            }

            if (pet.energy < 35) {
                return message.channel.send(`❌ ${pet.name} is too tired to race!`);
            }

            const raceCost = 50;
            const balance = getBobbyBucks(userId);

            if (balance < raceCost) {
                return message.channel.send(`❌ Racing costs ??${raceCost}! You have ??${balance}.`);
            }

            updateBobbyBucks(userId, -raceCost);

            // Calculate race performance
            const baseSpeed = (pet.energy / 100) * (pet.health / 100) * pet.level;
            const randomFactor = Math.random() * 0.5 + 0.75;
            const petSpeed = baseSpeed * randomFactor;

            const opponents = ['Lightning', 'Speedy', 'Dash', 'Rocket', 'Flash'];
            const opponentSpeeds = opponents.map(() => Math.random() * pet.level * 1.2);

            const allRacers = [
                { name: pet.name, speed: petSpeed, isPlayer: true },
                ...opponents.map((name, i) => ({ name, speed: opponentSpeeds[i], isPlayer: false }))
            ];

            allRacers.sort((a, b) => b.speed - a.speed);
            const playerPosition = allRacers.findIndex(r => r.isPlayer) + 1;

            pet.energy = Math.max(0, pet.energy - 35);
            pet.experience += playerPosition <= 3 ? 25 : 10;

            let reward = 0;
            let resultMessage = '';

            if (playerPosition === 1) {
                reward = 200;
                resultMessage = `🏆 **FIRST PLACE!** ${pet.name} won the race!`;
                pet.stats = pet.stats || {};
                pet.stats.race_wins = (pet.stats.race_wins || 0) + 1;
            } else if (playerPosition === 2) {
                reward = 100;
                resultMessage = `🥈 **Second place!** ${pet.name} did great!`;
            } else if (playerPosition === 3) {
                reward = 50;
                resultMessage = `🥉 **Third place!** ${pet.name} tried their best!`;
            } else {
                resultMessage = `😅 **${playerPosition}th place.** Better luck next time!`;
            }

            if (reward > 0) {
                updateBobbyBucks(userId, reward);
            }

            await savePet(userId, pet);
            checkAchievements(userId, pet, message.channel);

            const embed = new EmbedBuilder()
                .setTitle(`🏁 Race Results!`)
                .setColor(playerPosition === 1 ? '#FFD700' : playerPosition <= 3 ? '#C0C0C0' : '#CD853F')
                .setDescription(resultMessage)
                .addFields(
                    { name: '🏆 Final Standings', value: allRacers.map((r, i) => `${i + 1}. ${r.name}${r.isPlayer ? ' ⭐' : ''}`).join('\n'), inline: true },
                    { name: '💰 Earnings', value: reward > 0 ? `+??${reward}` : 'None', inline: true },
                    { name: '⭐ XP Gained', value: `+${playerPosition <= 3 ? 25 : 10} XP`, inline: true }
                )
                .setFooter({ text: `${pet.name} lost 35 energy from racing!` })
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }

        // Pet adventure command
        if (args[0] === '!adventure' || args[0] === '!explore') {
            const userId = message.author.id;
            const pet = await getPet(userId);

            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet! Use `!adopt` to get one.');
            }

            const timeSinceLastAdventure = Date.now() - (pet.lastAdventure || 0);
            const cooldownTime = 3600000; // 1 hour

            if (timeSinceLastAdventure < cooldownTime) {
                const remainingTime = Math.ceil((cooldownTime - timeSinceLastAdventure) / 60000);
                return message.channel.send(`❌ ${pet.name} is resting from their last adventure! Wait ${remainingTime} more minutes.`);
            }

            if (pet.energy < 40) {
                return message.channel.send(`❌ ${pet.name} needs at least 40 energy to go on an adventure!`);
            }

            // Trigger random event
            const event = triggerRandomEvent(pet);

            pet.energy = Math.max(0, pet.energy - 40);
            pet.lastAdventure = Date.now();
            await savePet(userId, pet);

            if (event.reward && event.reward.type === 'bobby_bucks') {
                updateBobbyBucks(userId, event.reward.amount);
            }

            const adventureCard = await createAdventureCard(pet, event);
            const attachment = new AttachmentBuilder(adventureCard.toBuffer(), { name: 'adventure.png' });

            const embed = new EmbedBuilder()
                .setTitle(`🗺️ Adventure Time!`)
                .setColor('#228b22')
                .setDescription(`**${pet.name} went on an adventure!**\n\n${PET_TYPES[pet.type].emoji} ${pet.name} ${event.message}`)
                .setImage('attachment://adventure.png')
                .addFields(
                    { name: '✨ Results', value: getEventResults(event, pet), inline: false },
                    { name: '⚡ Energy Used', value: '-40 Energy', inline: true }
                )
                .setFooter({ text: 'Adventures can happen once per hour!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // Pet achievements command
        if (args[0] === '!petach' || args[0] === '!achievements') {
            const userId = message.author.id;
            const pet = await getPet(userId);

            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet! Use `!adopt` to get one.');
            }

            const userAchievements = getPetAchievements(userId);
            const earnedAchievements = Object.entries(ACHIEVEMENTS)
                .filter(([key]) => userAchievements.includes(key))
                .map(([key, ach]) => `${ach.emoji} **${ach.name}** - ${ach.description}`)
                .join('\n') || 'No achievements yet!';

            const nextAchievements = Object.entries(ACHIEVEMENTS)
                .filter(([key]) => !userAchievements.includes(key))
                .slice(0, 3)
                .map(([key, ach]) => `${ach.emoji} **${ach.name}** - ${ach.description} (??${ach.reward})`)
                .join('\n');

            const embed = new EmbedBuilder()
                .setTitle(`${PET_TYPES[pet.type].emoji} ${pet.name}'s Achievements`)
                .setColor('#9370db')
                .setDescription(`**Earned: ${userAchievements.length}/${Object.keys(ACHIEVEMENTS).length}**`)
                .addFields(
                    { name: '🏆 Unlocked Achievements', value: earnedAchievements, inline: false },
                    { name: '🎯 Next Goals', value: nextAchievements || 'All achievements earned!', inline: false }
                )
                .setFooter({ text: 'Keep playing to unlock more achievements!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }

        // Pet playdate command
        if (args[0] === '!playdate') {
            const userId = message.author.id;
            const pet = await getPet(userId);

            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet! Use `!adopt` to get one.');
            }

            const targetUser = message.mentions.users.first();
            if (!targetUser) {
                return message.channel.send('❌ Mention a user to have a playdate with! Usage: `!playdate @user`');
            }

            if (targetUser.id === userId) {
                return message.channel.send('❌ Your pet can\'t have a playdate with themselves!');
            }

            const targetPet = await getPet(targetUser.id);
            if (!targetPet) {
                return message.channel.send('❌ That user doesn\'t have a pet!');
            }

            if (pet.energy < 20 || targetPet.energy < 20) {
                return message.channel.send('❌ One of the pets is too tired for a playdate!');
            }

            // Execute playdate
            pet.happiness = Math.min(100, pet.happiness + 30);
            pet.energy = Math.max(0, pet.energy - 20);
            pet.experience += 10;
            pet.stats = pet.stats || {};
            pet.stats.playdates = (pet.stats.playdates || 0) + 1;

            targetPet.happiness = Math.min(100, targetPet.happiness + 30);
            targetPet.energy = Math.max(0, targetPet.energy - 20);
            targetPet.experience += 10;
            targetPet.stats = targetPet.stats || {};
            targetPet.stats.playdates = (targetPet.stats.playdates || 0) + 1;

            await savePet(userId, pet);
            await savePet(targetUser.id, targetPet);

            checkAchievements(userId, pet, message.channel);
            checkAchievements(targetUser.id, targetPet, message.channel);

            const playdateCard = await createPlaydateCard(pet, targetPet, message.author, targetUser);
            const attachment = new AttachmentBuilder(playdateCard.toBuffer(), { name: 'playdate.png' });

            const embed = new EmbedBuilder()
                .setTitle('🎉 Playdate Success!')
                .setColor('#ff69b4')
                .setDescription(`**${pet.name} and ${targetPet.name} had a wonderful playdate!**`)
                .setImage('attachment://playdate.png')
                .setFooter({ text: 'Both pets had a great time together!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        }

        // Rename pet command
        if (args[0] === '!renamepet' && args[1]) {
            const userId = message.author.id;
            const pet = await getPet(userId);

            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet! Use `!adopt` to get one.');
            }

            const newName = args.slice(1).join(' ').substring(0, 30);
            const oldName = pet.name;

            pet.name = newName;
            await savePet(userId, pet);

            return message.channel.send(`✅ Successfully renamed your pet from **${oldName}** to **${newName}**! ${PET_TYPES[pet.type].emoji}`);
        }
    });

    // Handle button and select menu interactions
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

        // Handle pet adoption
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('pet_adopt_')) {
            const userId = interaction.customId.split('_')[2];
            
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ This adoption menu is not for you!', ephemeral: true });
            }

            const petType = interaction.values[0];
            const pet = PET_TYPES[petType];
            const balance = getBobbyBucks(userId);

            if (balance < pet.cost) {
                return interaction.reply({
                    content: `❌ You need ¢${pet.cost} to adopt a ${pet.name}! You have ¢${balance}.`,
                    ephemeral: true
                });
            }

            const existingPets = getAllPets(userId);
            const maxPets = 5; // Maximum pets per user

            if (existingPets.length >= maxPets) {
                return interaction.reply({
                    content: `❌ You've reached the maximum of ${maxPets} pets! You'll need to release one before adopting another.`,
                    ephemeral: true
                });
            }

            // Create new pet
            const petNumber = existingPets.filter(p => p.type === petType).length + 1;
            const newPet = createNewPet(petType, `${pet.name}-${petNumber}`);

            // If this is the first pet, mark it as active
            if (existingPets.length === 0) {
                newPet.isActive = true;
            } else {
                newPet.isActive = false;
            }

            updateBobbyBucks(userId, -pet.cost);
            await savePet(userId, newPet);

            const adoptionCard = await createAdoptionCard(interaction.user, newPet);
            const attachment = new AttachmentBuilder(adoptionCard.toBuffer(), { name: 'adoption-success.png' });

            const totalPets = existingPets.length + 1;
            const embed = new EmbedBuilder()
                .setTitle('🎉 Congratulations on Your New Pet!')
                .setColor('#8fbc8f')
                .setDescription(`**Welcome ${newPet.name} to the family!**\n\nYou now have **${totalPets}** pet${totalPets > 1 ? 's' : ''}!${totalPets > 1 ? '\n\n💡 Use the **Switch Pet** button in your pet dashboard to manage multiple pets!' : ''}`)
                .setImage('attachment://adoption-success.png')
                .addFields(
                    { name: '🏷️ Pet Type', value: pet.name, inline: true },
                    { name: '💰 Adoption Fee', value: `¢${pet.cost}`, inline: true },
                    { name: '🎯 Getting Started', value: 'Use `!pet` to check on your new friend!', inline: true }
                )
                .setFooter({ text: 'Remember to feed and care for your pet regularly!' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], files: [attachment] });
        }

        // Handle pet shop category selection
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('pet_shop_')) {
            const userId = interaction.customId.split('_')[2];
            
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ This shop menu is not for you!', ephemeral: true });
            }

            const category = interaction.values[0];
            const items = Object.entries(PET_ITEMS).filter(([key, item]) => item.type === category);

            const itemSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`pet_buyitem_${userId}`)
                .setPlaceholder(`Choose a ${category} item to buy!`)
                .addOptions(
                    items.map(([key, item]) => ({
                        label: `${item.name} - ??{item.cost}`,
                        description: getItemDescription(item),
                        value: key,
                        emoji: item.emoji
                    }))
                );

            const row = new ActionRowBuilder().addComponents(itemSelectMenu);
            const balance = getBobbyBucks(userId);

            const embed = new EmbedBuilder()
                .setTitle(`🛒 Pet Shop - ${category.charAt(0).toUpperCase() + category.slice(1)} Items`)
                .setColor('#5a6c8a')
                .setDescription(`**Available ${category} items for your pet:**`)
                .addFields(
                    items.map(([key, item]) => ({
                        name: `${item.emoji} ${item.name}`,
                        value: `Cost: ??{item.cost}\nEffect: ${getItemDescription(item)}`,
                        inline: true
                    }))
                )
                .addFields({ name: '💰 Your Balance', value: `??{balance.toLocaleString()}`, inline: false })
                .setFooter({ text: 'Select an item above to purchase it!' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], components: [row] });
        }

        // Handle item purchases
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('pet_buyitem_')) {
            const userId = interaction.customId.split('_')[2];
            
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ This purchase menu is not for you!', ephemeral: true });
            }

            const itemKey = interaction.values[0];
            const item = PET_ITEMS[itemKey];
            const balance = getBobbyBucks(userId);

            if (balance < item.cost) {
                return interaction.reply({
                    content: `❌ You need ??{item.cost} to buy ${item.name}! You have ??{balance}.`,
                    ephemeral: true
                });
            }

            // Purchase item
            updateBobbyBucks(userId, -item.cost);
            const inventory = await getPetInventory(userId);
            inventory[itemKey] = (inventory[itemKey] || 0) + 1;
            await savePetInventory(userId, inventory);

            const purchaseCard = await createPurchaseCard(interaction.user, item);
            const attachment = new AttachmentBuilder(purchaseCard.toBuffer(), { name: 'purchase-card.png' });

            const embed = new EmbedBuilder()
                .setTitle('🛍️ Purchase Successful!')
                .setColor('#8fbc8f')
                .setDescription(`**You bought ${item.name} for your pet!**`)
                .setImage('attachment://purchase-card.png')
                .addFields(
                    { name: '📦 Item', value: item.name, inline: true },
                    { name: '💰 Cost', value: `??{item.cost}`, inline: true },
                    { name: '✨ Effect', value: getItemDescription(item), inline: true }
                )
                .setFooter({ text: 'Use `!use ' + itemKey + '` to use this item!' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], files: [attachment] });
        }

        // Handle fetch game buttons
        if (interaction.isButton() && (interaction.customId.startsWith('fetch_'))) {
            const parts = interaction.customId.split('_');
            const direction = parts[1];
            const userId = parts[2];

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ This is not your game!', ephemeral: true });
            }

            const game = activeGames.get(userId);
            if (!game || game.type !== 'fetch') {
                return interaction.reply({ content: '❌ No active fetch game found!', ephemeral: true });
            }

            const directionMap = { left: '⬅️', right: '➡️', up: '⬆️', down: '⬇️' };
            const clickedDirection = directionMap[direction];

            if (game.sequence[game.currentStep] === clickedDirection) {
                game.currentStep++;

                if (game.currentStep >= game.sequence.length) {
                    // Game won!
                    activeGames.delete(userId);

                    const pet = await getPet(userId);
                    pet.happiness = Math.min(100, pet.happiness + 25);
                    pet.energy = Math.max(0, pet.energy - 25);
                    pet.experience += 15;

                    const reward = Math.floor(Math.random() * 100) + 50;
                    updateBobbyBucks(userId, reward);
                    await savePet(userId, pet);

                    return interaction.reply({
                        content: `🎉 **Perfect!** ${pet.name} caught the ball!\n+25 Happiness, +15 XP, +??${reward}!`,
                        ephemeral: false
                    });
                } else {
                    return interaction.reply({
                        content: `✅ Correct! Keep going... (${game.currentStep}/${game.sequence.length})`,
                        ephemeral: true
                    });
                }
            } else {
                // Game lost
                activeGames.delete(userId);
                return interaction.reply({
                    content: `❌ Wrong direction! ${game.pet.name} missed the ball!`,
                    ephemeral: false
                });
            }
        }

        // Handle treasure hunt buttons
        if (interaction.isButton() && interaction.customId.startsWith('treasure_')) {
            const parts = interaction.customId.split('_');
            const spot = parseInt(parts[1]);
            const userId = parts[2];

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ This is not your game!', ephemeral: true });
            }

            const game = activeGames.get(userId);
            if (!game || game.type !== 'treasure') {
                return interaction.reply({ content: '❌ No active treasure hunt found!', ephemeral: true });
            }

            game.attempts++;

            if (spot === game.treasureSpot) {
                // Found treasure!
                activeGames.delete(userId);

                const pet = await getPet(userId);
                const reward = Math.floor(Math.random() * 200) + 150;
                pet.happiness = Math.min(100, pet.happiness + 30);
                pet.energy = Math.max(0, pet.energy - 30);
                pet.experience += 20;
                pet.stats = pet.stats || {};
                pet.stats.treasures_found = (pet.stats.treasures_found || 0) + 1;

                updateBobbyBucks(userId, reward);
                await savePet(userId, pet);
                checkAchievements(userId, pet, interaction.channel);

                return interaction.reply({
                    content: `💎 **TREASURE FOUND!** ${pet.name} dug up treasure!\n+30 Happiness, +20 XP, +??${reward}!`,
                    ephemeral: false
                });
            } else if (game.attempts >= game.maxAttempts) {
                // Out of attempts
                activeGames.delete(userId);

                const pet = await getPet(userId);
                pet.energy = Math.max(0, pet.energy - 15);
                await savePet(userId, pet);

                return interaction.reply({
                    content: `😞 No treasure found! ${pet.name} is tired from digging. The treasure was at spot ${game.treasureSpot + 1}.`,
                    ephemeral: false
                });
            } else {
                // Keep trying
                return interaction.reply({
                    content: `❌ Nothing here! ${game.maxAttempts - game.attempts} attempts remaining.`,
                    ephemeral: true
                });
            }
        }

        // Handle dashboard button actions
        if (interaction.isButton() && interaction.customId.startsWith('pet_mood_')) {
            const userId = interaction.customId.split('_')[2];
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ This is not your pet!', ephemeral: true });
            }

            const pet = await getPet(userId);
            if (!pet) {
                return interaction.reply({ content: '❌ You don\'t have a pet!', ephemeral: true });
            }

            const moodCard = await createMoodCard(pet, interaction.user);
            const attachment = new AttachmentBuilder(moodCard.toBuffer(), { name: 'pet-mood.png' });
            const mood = getPetMood(pet);
            const personality = pet.personality ? PERSONALITIES[pet.personality] : null;

            // Back button to return to dashboard
            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pet_dashboard_${userId}`)
                        .setLabel('⬅️ Back to Dashboard')
                        .setStyle(ButtonStyle.Secondary)
                );

            const embed = new EmbedBuilder()
                .setTitle(`${PET_TYPES[pet.type].emoji} ${pet.name}'s Emotional State`)
                .setColor(getPetStatus(pet).color)
                .setDescription(`**${pet.name} ${mood.messages[Math.floor(Math.random() * mood.messages.length)]}**`)
                .setImage('attachment://pet-mood.png')
                .addFields(
                    { name: '🎭 Personality', value: personality ? `${personality.emoji} ${pet.personality}` : '🎲 Random', inline: true },
                    { name: '💭 Current Thought', value: `"${getPetThoughts(pet)}"`, inline: false }
                )
                .setTimestamp();

            // Update the message instead of creating new one
            return interaction.update({ embeds: [embed], files: [attachment], components: [backButton] });
        }

        if (interaction.isButton() && interaction.customId.startsWith('pet_achievements_')) {
            const userId = interaction.customId.split('_')[2];
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ This is not your pet!', ephemeral: true });
            }

            const pet = await getPet(userId);
            const userAchievements = getPetAchievements(userId);
            const earnedAchievements = Object.entries(ACHIEVEMENTS)
                .filter(([key]) => userAchievements.includes(key))
                .map(([, ach]) => `${ach.emoji} **${ach.name}** - ${ach.description}`)
                .join('\n') || 'No achievements yet!';

            const nextAchievements = Object.entries(ACHIEVEMENTS)
                .filter(([key]) => !userAchievements.includes(key))
                .slice(0, 5)
                .map(([, ach]) => `${ach.emoji} **${ach.name}** - ${ach.description}\n   *Reward: ¢${ach.reward}*`)
                .join('\n');

            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pet_dashboard_${userId}`)
                        .setLabel('⬅️ Back to Dashboard')
                        .setStyle(ButtonStyle.Secondary)
                );

            const embed = new EmbedBuilder()
                .setTitle(`${PET_TYPES[pet.type].emoji} ${pet.name}'s Achievements`)
                .setColor('#9370db')
                .setDescription(`**Progress: ${userAchievements.length}/${Object.keys(ACHIEVEMENTS).length} Unlocked**`)
                .addFields(
                    { name: '✅ Unlocked Achievements', value: earnedAchievements, inline: false },
                    { name: '🎯 Next Goals', value: nextAchievements || '🎉 All achievements complete!', inline: false }
                )
                .setFooter({ text: 'Complete goals to earn Bobby Bucks!' })
                .setTimestamp();

            return interaction.update({ embeds: [embed], components: [backButton] });
        }

        // Quick helper messages (ephemeral)
        if (interaction.isButton() && interaction.customId.startsWith('pet_race_')) {
            return interaction.reply({ content: '🏁 Use the `!race` command to start a race!', ephemeral: true });
        }

        if (interaction.isButton() && interaction.customId.startsWith('pet_treasure_')) {
            return interaction.reply({ content: '💎 Use the `!treasure` command to start treasure hunting!', ephemeral: true });
        }

        if (interaction.isButton() && interaction.customId.startsWith('pet_adventure_')) {
            return interaction.reply({ content: '🗺 Use the `!adventure` command to go on an adventure!', ephemeral: true });
        }

        if (interaction.isButton() && interaction.customId.startsWith('pet_train_')) {
            return interaction.reply({ content: '🎓 Use the `!train` command to train your pet!', ephemeral: true });
        }

        if (interaction.isButton() && interaction.customId.startsWith('pet_shop_')) {
            const userId = interaction.customId.split('_')[2];
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ Not your pet!', ephemeral: true });
            }

            // Open shop in the same message
            const balance = getBobbyBucks(userId);

            const foodItems = Object.entries(PET_ITEMS).filter(([, item]) => item.type === 'food');
            const toyItems = Object.entries(PET_ITEMS).filter(([, item]) => item.type === 'toy');
            const medicineItems = Object.entries(PET_ITEMS).filter(([, item]) => item.type === 'medicine');
            const careItems = Object.entries(PET_ITEMS).filter(([, item]) => item.type === 'care');
            const accessoryItems = Object.entries(PET_ITEMS).filter(([, item]) => item.type === 'accessory');

            const embed = new EmbedBuilder()
                .setTitle('🛒 Bobby\'s Pet Shop')
                .setColor('#6B8E23')
                .setDescription(`**Welcome! We have everything your pet needs!**\n💰 Your Balance: **¢${balance.toLocaleString()}**\n\n🛍️ *Select an item below to purchase*`)
                .addFields(
                    {
                        name: '🍽️ Food & Treats',
                        value: foodItems.map(([, item]) =>
                            `**${item.emoji} ${item.name}** - ¢${item.cost}\n↳ ${item.hunger ? `+${item.hunger} Hunger` : ''} ${item.happiness ? `+${item.happiness} Happiness` : ''}`
                        ).join('\n'),
                        inline: false
                    },
                    {
                        name: '🎾 Toys',
                        value: toyItems.map(([, item]) =>
                            `**${item.emoji} ${item.name}** - ¢${item.cost}\n↳ +${item.happiness} Happiness, ${item.energy} Energy`
                        ).join('\n'),
                        inline: false
                    },
                    {
                        name: '💊 Medicine & Health',
                        value: medicineItems.map(([, item]) =>
                            `**${item.emoji} ${item.name}** - ¢${item.cost}\n↳ +${item.health} Health${item.happiness ? `, +${item.happiness} Happiness` : ''}`
                        ).join('\n'),
                        inline: true
                    },
                    {
                        name: '🛁 Care Items',
                        value: careItems.map(([, item]) =>
                            `**${item.emoji} ${item.name}** - ¢${item.cost}\n↳ +${item.cleanliness} Cleanliness${item.happiness ? `, +${item.happiness} Happiness` : ''}`
                        ).join('\n'),
                        inline: true
                    },
                    {
                        name: '👑 Accessories (Permanent!)',
                        value: accessoryItems.map(([, item]) => {
                            const effects = [];
                            if (item.happiness) effects.push(`+${item.happiness} Happiness`);
                            if (item.energy) effects.push(`+${item.energy} Energy`);
                            return `**${item.emoji} ${item.name}** - ¢${item.cost}\n↳ ${effects.join(', ')} (Keeps forever!)`;
                        }).join('\n'),
                        inline: false
                    }
                )
                .setFooter({ text: '💡 Select item to purchase, then click Back' })
                .setTimestamp();

            const allItems = Object.entries(PET_ITEMS).map(([key, item]) => ({
                label: `${item.emoji} ${item.name} - ¢${item.cost}`,
                description: `${item.type.charAt(0).toUpperCase() + item.type.slice(1)} item`,
                value: key
            })).slice(0, 25);

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`pet_buyitem_${userId}`)
                .setPlaceholder('🛍️ Select an item to purchase...')
                .addOptions(allItems);

            const backButton = new ButtonBuilder()
                .setCustomId(`pet_dashboard_${userId}`)
                .setLabel('⬅️ Back to Dashboard')
                .setStyle(ButtonStyle.Secondary);

            const row1 = new ActionRowBuilder().addComponents(selectMenu);
            const row2 = new ActionRowBuilder().addComponents(backButton);

            return interaction.update({ embeds: [embed], components: [row1, row2] });
        }

        if (interaction.isButton() && interaction.customId.startsWith('pet_inventory_')) {
            return interaction.reply({ content: '🎒 Use the `!inventory` or `!petinv` command to check your items!', ephemeral: true });
        }

        // Dashboard button - return to main menu
        if (interaction.isButton() && interaction.customId.startsWith('pet_dashboard_')) {
            const userId = interaction.customId.split('_')[2];
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ Not your pet!', ephemeral: true });
            }

            const pet = await getPet(userId);
            if (!pet) {
                return interaction.reply({ content: '❌ Pet not found!', ephemeral: true });
            }

            const petCard = await createPetCard(interaction.user, pet);
            const attachment = new AttachmentBuilder(petCard.toBuffer(), { name: 'pet-status.png' });

            // Recreate dashboard
            const careRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId(`pet_feed_${userId}`).setLabel('🍽 Feed').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`pet_play_${userId}`).setLabel('🎾 Play').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`pet_clean_${userId}`).setLabel('🛁 Clean').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`pet_sleep_${userId}`).setLabel('💤 Sleep').setStyle(ButtonStyle.Secondary)
                );

            const gamesRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId(`pet_mood_${userId}`).setLabel('😊 Mood').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`pet_race_${userId}`).setLabel('🏁 Race').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`pet_treasure_${userId}`).setLabel('💎 Treasure').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`pet_adventure_${userId}`).setLabel('🗺 Adventure').setStyle(ButtonStyle.Success)
                );

            const socialRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId(`pet_train_${userId}`).setLabel('🎓 Train').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`pet_achievements_${userId}`).setLabel('🏆 Achievements').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`pet_shop_${userId}`).setLabel('🛒 Shop').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`pet_inventory_${userId}`).setLabel('🎒 Inventory').setStyle(ButtonStyle.Secondary)
                );

            const mood = getPetMood(pet);
            const personality = pet.personality ? PERSONALITIES[pet.personality] : null;
            const petStatus = getPetStatus(pet);

            let sleepInfo = '';
            if (pet.isSleeping && pet.sleepStartTime) {
                const sleepMinutes = Math.floor((Date.now() - pet.sleepStartTime) / 60000);
                sleepInfo = `\n\n😴 **Currently Sleeping** (${sleepMinutes} min)\n⚡ Energy recovering at 2/min`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`${PET_TYPES[pet.type].emoji} ${pet.name}`)
                .setColor(petStatus.color)
                .setDescription(`**${petStatus.message}**\n${mood.emoji} *${mood.messages[Math.floor(Math.random() * mood.messages.length)]}*${sleepInfo}`)
                .setImage('attachment://pet-status.png')
                .addFields(
                    { name: '\u200B', value: getStatsDisplay(pet), inline: false },
                    {
                        name: '📋 Info',
                        value: `⭐ **Level ${pet.level}** • ${pet.experience}/100 XP\n🎂 Age: **${pet.age} days**\n🎭 ${personality ? `${personality.emoji} ${pet.personality}` : '🎲 Random'}`,
                        inline: true
                    },
                    {
                        name: '🏆 Progress',
                        value: `Achievements: **${getPetAchievements(userId).length}/10**\nRaces Won: **${pet.stats?.race_wins || 0}**\nTreasures: **${pet.stats?.treasures_found || 0}**\nPlaydates: **${pet.stats?.playdates || 0}**`,
                        inline: true
                    }
                )
                .setFooter({ text: '💡 Stats update in real-time! Use buttons below to interact.' })
                .setTimestamp();

            return interaction.update({ embeds: [embed], files: [attachment], components: [careRow, gamesRow, socialRow] });
        }

        // Handle pet switch button
        if (interaction.isButton() && interaction.customId.startsWith('pet_switch_')) {
            const userId = interaction.customId.split('_')[2];

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ This is not your pet menu!', ephemeral: true });
            }

            const allPets = getAllPets(userId);
            if (allPets.length === 0) {
                return interaction.reply({ content: '❌ You don\'t have any pets!', ephemeral: true });
            }

            // Create pet selector
            const petSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`pet_select_${userId}`)
                .setPlaceholder('Choose which pet to switch to!')
                .addOptions(
                    allPets.map(p => ({
                        label: `${p.name} (${PET_TYPES[p.type].name}) - Lv${p.level}`,
                        description: `${p.isActive ? '✓ Currently Active' : 'Switch to this pet'} • ${Math.floor((p.hunger + p.happiness + p.health)/3)}% Health`,
                        value: p.id
                    }))
                );

            const row = new ActionRowBuilder().addComponents(petSelectMenu);

            const embed = new EmbedBuilder()
                .setTitle('🔄 Switch Active Pet')
                .setColor('#5a6c8a')
                .setDescription(`**You have ${allPets.length} pet${allPets.length > 1 ? 's' : ''}!**\n\nSelect which pet you want to interact with:`)
                .addFields(
                    allPets.map(p => {
                        const mood = getPetMood(p);
                        return {
                            name: `${p.isActive ? '✅ ' : ''}${p.name} ${p.isSleeping ? '😴' : mood.emoji}`,
                            value: `**${PET_TYPES[p.type].name}** • Level ${p.level}\n${p.isSleeping ? 'Sleeping...' : mood.name}\nHunger: ${p.hunger}% • Happiness: ${p.happiness}%`,
                            inline: true
                        };
                    })
                )
                .setFooter({ text: 'Select a pet from the menu above to make it active!' })
                .setTimestamp();

            await interaction.update({ embeds: [embed], components: [row] });
            return;
        }

        // Handle pet selection from switch menu
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('pet_select_')) {
            const userId = interaction.customId.split('_')[2];

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ This is not your pet menu!', ephemeral: true });
            }

            const selectedPetId = interaction.values[0];
            const allPets = getAllPets(userId);

            // Set all pets to inactive
            allPets.forEach(p => p.isActive = false);

            // Set selected pet to active
            const selectedPet = allPets.find(p => p.id === selectedPetId);
            if (selectedPet) {
                selectedPet.isActive = true;
                saveAllPets(userId, allPets);

                return interaction.reply({
                    content: `✅ Switched to **${selectedPet.name}**! Use \`!pet\` to view their dashboard.`,
                    ephemeral: true
                });
            } else {
                return interaction.reply({ content: '❌ Pet not found!', ephemeral: true });
            }
        }

        // Handle pet care buttons
        if (interaction.isButton() && interaction.customId.startsWith('pet_')) {
            const [, action, userId] = interaction.customId.split('_');

            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ This is not your pet!', ephemeral: true });
            }

            const pet = await getPet(userId);
            if (!pet) {
                return interaction.reply({ content: '❌ You don\'t have a pet!', ephemeral: true });
            }

            let response = '';
            let xpGained = 0;

            switch (action) {
                case 'feed':
                    if (pet.isSleeping) {
                        return interaction.reply({ content: '❌ Your pet is sleeping! Let them rest.', ephemeral: true });
                    }
                    if (pet.hunger >= 90) {
                        return interaction.reply({ content: '❌ Your pet is not hungry right now!', ephemeral: true });
                    }
                    pet.hunger = Math.min(100, pet.hunger + 20);
                    pet.happiness = Math.min(100, pet.happiness + 5);
                    xpGained = 3;
                    response = `Fed ${pet.name}! They're feeling satisfied.`;
                    break;

                case 'play':
                    if (pet.isSleeping) {
                        return interaction.reply({ content: '❌ Your pet is sleeping! Let them rest.', ephemeral: true });
                    }
                    if (pet.energy < 20) {
                        return interaction.reply({ content: '❌ Your pet is too tired to play! Let them rest.', ephemeral: true });
                    }
                    pet.happiness = Math.min(100, pet.happiness + 15);
                    pet.energy = Math.max(0, pet.energy - 15);
                    xpGained = 4;
                    response = `Played with ${pet.name}! They had a great time.`;
                    break;

                case 'clean':
                    if (pet.isSleeping) {
                        return interaction.reply({ content: '❌ Your pet is sleeping! Let them rest.', ephemeral: true });
                    }
                    if (pet.cleanliness >= 90) {
                        return interaction.reply({ content: '❌ Your pet is already clean!', ephemeral: true });
                    }
                    pet.cleanliness = Math.min(100, pet.cleanliness + 25);
                    pet.happiness = Math.min(100, pet.happiness + 10);
                    xpGained = 2;
                    response = `Cleaned ${pet.name}! They're sparkling clean now.`;
                    break;

                case 'sleep':
                    if (pet.isSleeping) {
                        return interaction.reply({ content: '❌ Your pet is already sleeping!', ephemeral: true });
                    }
                    if (pet.energy >= 90) {
                        return interaction.reply({ content: '❌ Your pet is not tired right now!', ephemeral: true });
                    }

                    // Put pet to sleep - they will recover energy over time
                    pet.isSleeping = true;
                    pet.sleepStartTime = Date.now();
                    pet.energy = Math.min(100, pet.energy + 10); // Immediate small boost
                    pet.health = Math.min(100, pet.health + 5);
                    xpGained = 2;

                    // Calculate how long they should sleep (based on how tired they are)
                    const energyDeficit = 100 - pet.energy;
                    const sleepMinutes = Math.ceil(energyDeficit / 2); // 2 energy per minute while sleeping

                    response = `${pet.name} is now sleeping! 😴\nThey will recover **${energyDeficit} energy** over the next **${sleepMinutes} minutes**.\n\n💡 Energy will automatically recover while sleeping!`;
                    break;
            }

            pet.experience += xpGained;
            const oldLevel = pet.level;
            while (pet.experience >= 100) {
                pet.experience -= 100;
                pet.level++;
            }

            await savePet(userId, pet);

            const careCard = await createCareCard(interaction.user, pet, action);
            const attachment = new AttachmentBuilder(careCard.toBuffer(), { name: 'pet-care.png' });

            const levelUpText = pet.level > oldLevel ? `\n🎉 **LEVEL UP!** ${pet.name} is now level ${pet.level}!` : '';

            const embed = new EmbedBuilder()
                .setTitle(`${PET_TYPES[pet.type].emoji} Pet Care`)
                .setColor('#8fbc8f')
                .setDescription(`${response}${levelUpText}`)
                .setImage('attachment://pet-care.png')
                .addFields(
                    { name: '⭐ XP Gained', value: `+${xpGained} XP`, inline: true },
                    { name: '📊 Pet Status', value: getStatsDisplay(pet), inline: true }
                )
                .setFooter({ text: 'Your pet appreciates the care!' })
                .setTimestamp();

            // Add back button to return to dashboard
            const backButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pet_dashboard_${userId}`)
                        .setLabel('⬅️ Back to Dashboard')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.update({ embeds: [embed], files: [attachment], components: [backButton] });
        }
    });

    // Pet management functions

    // Get all pets for a user
    function getAllPets(userId) {
        if (!fs.existsSync(petsFilePath)) {
            fs.writeFileSync(petsFilePath, '', 'utf-8');
            return [];
        }
        const data = fs.readFileSync(petsFilePath, 'utf-8');
        const userRecord = data.split('\n').find(line => line.startsWith(`${userId}|`));
        if (userRecord) {
            try {
                let pets = JSON.parse(userRecord.substring(userRecord.indexOf('|') + 1));

                // Ensure pets is an array (backward compatibility)
                if (!Array.isArray(pets)) {
                    pets = [pets];
                }

                // Apply time-based stat updates to all pets
                pets = pets.map(pet => updatePetStatsOverTime(pet));

                // Save the updated stats back
                saveAllPets(userId, pets);

                return pets;
            } catch (e) {
                return [];
            }
        }
        return [];
    }

    // Get active/primary pet for a user (first pet or user's selected pet)
    function getPet(userId, petId = null) {
        const pets = getAllPets(userId);
        if (pets.length === 0) return null;

        if (petId) {
            return pets.find(p => p.id === petId) || pets[0];
        }

        // Return the active pet or first pet
        return pets.find(p => p.isActive) || pets[0];
    }

    // Save all pets for a user
    function saveAllPets(userId, pets) {
        if (!fs.existsSync(petsFilePath)) {
            fs.writeFileSync(petsFilePath, '', 'utf-8');
        }
        let data = fs.readFileSync(petsFilePath, 'utf-8').trim();
        const userRecord = data.split('\n').find(line => line.startsWith(`${userId}|`));
        const petData = `${userId}|${JSON.stringify(pets)}`;

        if (userRecord) {
            data = data.replace(userRecord, petData);
        } else {
            data += `\n${petData}`;
        }

        fs.writeFileSync(petsFilePath, data.trim(), 'utf-8');
    }

    // Save a single pet (updates the pet in the array)
    function savePet(userId, pet) {
        let pets = getAllPets(userId);

        // Ensure pets is an array
        if (!Array.isArray(pets)) {
            pets = [pets];
        }

        const petIndex = pets.findIndex(p => p.id === pet.id);
        if (petIndex >= 0) {
            pets[petIndex] = pet;
        } else {
            pets.push(pet);
        }

        saveAllPets(userId, pets);
    }

    function getPetInventory(userId) {
        if (!fs.existsSync(petItemsFilePath)) {
            fs.writeFileSync(petItemsFilePath, '', 'utf-8');
            return {};
        }
        const data = fs.readFileSync(petItemsFilePath, 'utf-8');
        const userRecord = data.split('\n').find(line => line.startsWith(`${userId}|`));
        if (userRecord) {
            try {
                return JSON.parse(userRecord.substring(userRecord.indexOf('|') + 1));
            } catch (e) {
                return {};
            }
        }
        return {};
    }

    function savePetInventory(userId, inventory) {
        if (!fs.existsSync(petItemsFilePath)) {
            fs.writeFileSync(petItemsFilePath, '', 'utf-8');
        }
        let data = fs.readFileSync(petItemsFilePath, 'utf-8').trim();
        const userRecord = data.split('\n').find(line => line.startsWith(`${userId}|`));
        const inventoryData = `${userId}|${JSON.stringify(inventory)}`;
        
        if (userRecord) {
            data = data.replace(userRecord, inventoryData);
        } else {
            data += `\n${inventoryData}`;
        }
        
        fs.writeFileSync(petItemsFilePath, data.trim(), 'utf-8');
    }

    function getBobbyBucks(userId) {
        if (!fs.existsSync(bobbyBucksFilePath)) {
            return 0;
        }
        const data = fs.readFileSync(bobbyBucksFilePath, 'utf-8');
        const userRecord = data.split('\n').find(line => line.startsWith(userId));
        return userRecord ? parseInt(userRecord.split(':')[1], 10) : 0;
    }

    function updateBobbyBucks(userId, amount) {
        if (!fs.existsSync(bobbyBucksFilePath)) {
            fs.writeFileSync(bobbyBucksFilePath, '', 'utf-8');
        }

        let data = fs.readFileSync(bobbyBucksFilePath, 'utf-8').trim();
        const userRecord = data.split('\n').find(line => line.startsWith(userId));
        let newBalance;

        if (userRecord) {
            const currentBalance = parseInt(userRecord.split(':')[1], 10);
            newBalance = currentBalance + amount;
            data = data.replace(userRecord, `${userId}:${newBalance}`);
        } else {
            newBalance = amount;
            data += `\n${userId}:${newBalance}`;
        }

        fs.writeFileSync(bobbyBucksFilePath, data.trim(), 'utf-8');
        return newBalance;
    }

    function updatePetStatsOverTime(pet) {
        const now = Date.now();
        const lastUpdate = pet.lastStatUpdate || pet.created || now;
        const minutesPassed = Math.floor((now - lastUpdate) / 60000);

        if (minutesPassed < 1) return pet; // No update needed if less than 1 minute

        const petType = PET_TYPES[pet.type];
        const personality = pet.personality ? PERSONALITIES[pet.personality] : null;

        // Calculate decay/growth per minute
        const hungerDecayPerMin = petType.hungerDecay / 5; // Original was per 5 minutes
        const happinessDecayPerMin = petType.happinessDecay / 5;
        const cleanlinessDecayPerMin = petType.cleanlinessDecay / 5;
        const healthDecayPerMin = petType.healthDecay / 5;

        // HUNGER: Decreases over time (pet gets hungry)
        pet.hunger = Math.max(0, pet.hunger - (hungerDecayPerMin * minutesPassed));

        // HAPPINESS: Decreases over time, but slower if personality is content
        const happinessMultiplier = personality ? (personality.happiness_bonus || 1) : 1;
        pet.happiness = Math.max(0, pet.happiness - (happinessDecayPerMin * minutesPassed / happinessMultiplier));

        // ENERGY: Gradually INCREASES over time when pet is resting (recovery)
        // But decreases if hunger or health is too low
        if (pet.isSleeping) {
            // Pet is actively sleeping - faster energy recovery!
            const sleepRecoveryPerMin = 2.0; // Recovers 2 energy per minute while sleeping
            pet.energy = Math.min(100, pet.energy + (sleepRecoveryPerMin * minutesPassed));

            // Wake up pet once fully rested
            if (pet.energy >= 95) {
                pet.isSleeping = false;
                pet.sleepStartTime = null;
            }
        } else if (pet.hunger < 20 || pet.health < 30) {
            // Low hunger or health drains energy
            pet.energy = Math.max(0, pet.energy - (0.3 * minutesPassed));
        } else {
            // Natural energy recovery (slower than sleep for balance)
            const energyRecoveryPerMin = 0.2; // Recovers 12 energy per hour when resting
            pet.energy = Math.min(100, pet.energy + (energyRecoveryPerMin * minutesPassed));
        }

        // CLEANLINESS: Decreases over time
        pet.cleanliness = Math.max(0, pet.cleanliness - (cleanlinessDecayPerMin * minutesPassed));

        // HEALTH: Decreases slowly over time, faster if stats are critical
        let healthDecay = healthDecayPerMin;
        if (pet.hunger < 20) healthDecay *= 2; // Starving hurts health
        if (pet.happiness < 20) healthDecay *= 1.5; // Sadness affects health
        if (pet.cleanliness < 20) healthDecay *= 1.5; // Poor hygiene affects health
        pet.health = Math.max(0, pet.health - (healthDecay * minutesPassed));

        // If health is critical, all stats suffer
        if (pet.health < 20) {
            pet.happiness = Math.max(0, pet.happiness - (0.2 * minutesPassed));
            pet.energy = Math.max(0, pet.energy - (0.3 * minutesPassed));
        }

        // Age the pet
        const daysSinceCreated = Math.floor((now - pet.created) / (24 * 60 * 60 * 1000));
        pet.age = daysSinceCreated;

        // Update last stat update timestamp
        pet.lastStatUpdate = now;

        return pet;
    }

    function updateAllPetsDecay() {
        if (!fs.existsSync(petsFilePath)) return;

        const data = fs.readFileSync(petsFilePath, 'utf-8').trim();
        if (!data) return;

        const lines = data.split('\n').filter(line => line.includes('|'));
        let updatedData = '';

        lines.forEach(line => {
            const separatorIndex = line.indexOf('|');
            if (separatorIndex === -1) return;

            const userId = line.substring(0, separatorIndex);
            const petDataStr = line.substring(separatorIndex + 1);

            try {
                let pet = JSON.parse(petDataStr);
                pet = updatePetStatsOverTime(pet);
                updatedData += `${userId}|${JSON.stringify(pet)}\n`;
            } catch (e) {
                updatedData += line + '\n';
            }
        });

        fs.writeFileSync(petsFilePath, updatedData.trim(), 'utf-8');
    }

    async function getTopPets(guild, limit = 10) {
        if (!fs.existsSync(petsFilePath)) return [];
        
        const data = fs.readFileSync(petsFilePath, 'utf-8').trim();
        if (!data) return [];
        
        const pets = [];
        const lines = data.split('\n').filter(line => line.includes('|'));
        
        for (const line of lines) {
            const separatorIndex = line.indexOf('|');
            if (separatorIndex === -1) continue;
            
            const userId = line.substring(0, separatorIndex);
            const petDataStr = line.substring(separatorIndex + 1);
            
            try {
                const pet = JSON.parse(petDataStr);
                let member = guild.members.cache.get(userId);
                if (!member) {
                    try {
                        member = await guild.members.fetch(userId);
                    } catch (e) {
                        continue;
                    }
                }
                
                // Calculate overall score
                const score = pet.happiness + pet.health + (pet.level * 10);
                pets.push({
                    userId,
                    username: member.user.username,
                    pet,
                    score
                });
            } catch (e) {
                continue;
            }
        }
        
        return pets.sort((a, b) => b.score - a.score).slice(0, limit);
    }

    function getPetStatus(pet) {
        const avgStat = (pet.hunger + pet.happiness + pet.health + pet.energy + pet.cleanliness) / 5;
        
        if (avgStat >= 80) {
            return { message: 'Your pet is thriving and very happy! 🌟', color: '#8fbc8f' };
        } else if (avgStat >= 60) {
            return { message: 'Your pet is doing well and content. 😊', color: '#daa520' };
        } else if (avgStat >= 40) {
            return { message: 'Your pet needs some attention. 😐', color: '#cd853f' };
        } else if (avgStat >= 20) {
            return { message: 'Your pet is struggling and needs care! 😰', color: '#d2691e' };
        } else {
            return { message: 'Your pet is in critical condition! Take care of them immediately! 🚨', color: '#dc143c' };
        }
    }

    function getStatsDisplay(pet) {
        const getBar = (value) => {
            const filled = Math.floor(value / 10);
            const empty = 10 - filled;
            return '█'.repeat(filled) + '░'.repeat(empty);
        };

        const pad = (num) => num.toString().padStart(3, ' ');

        return `\`\`\`
🍽️ Hunger      ${getBar(pet.hunger)} ${pad(pet.hunger)}%
😊 Happiness   ${getBar(pet.happiness)} ${pad(pet.happiness)}%
❤️  Health      ${getBar(pet.health)} ${pad(pet.health)}%
⚡ Energy      ${getBar(pet.energy)} ${pad(pet.energy)}%
🛁 Cleanliness ${getBar(pet.cleanliness)} ${pad(pet.cleanliness)}%
\`\`\``;
    }

    function getItemDescription(item) {
        const effects = [];
        if (item.hunger) effects.push(`+${item.hunger} Hunger`);
        if (item.happiness) effects.push(`+${item.happiness} Happiness`);
        if (item.health) effects.push(`+${item.health} Health`);
        if (item.energy) effects.push(`${item.energy > 0 ? '+' : ''}${item.energy} Energy`);
        if (item.cleanliness) effects.push(`+${item.cleanliness} Cleanliness`);
        return effects.join(', ') || 'Special item';
    }

    function getItemEffectText(item) {
        return getItemDescription(item);
    }

    function getCategoryEmoji(category) {
        const emojis = {
            food: '🍽️',
            toy: '🎾',
            medicine: '💊',
            care: '🛁',
            accessory: '👑'
        };
        return emojis[category] || '📦';
    }

    // Canvas drawing functions

    // Helper function to draw pet icon instead of emoji
    function drawPetIcon(ctx, petType, x, y, size = 40) {
        ctx.save();

        // Different shapes for different pet types
        switch(petType) {
            case 'dog':
                // Dog: Circle head
                ctx.fillStyle = '#d4a574';
                ctx.beginPath();
                ctx.arc(x, y, size / 2, 0, Math.PI * 2);
                ctx.fill();
                // Ears
                ctx.beginPath();
                ctx.arc(x - size / 3, y - size / 3, size / 4, 0, Math.PI * 2);
                ctx.arc(x + size / 3, y - size / 3, size / 4, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'cat':
                // Cat: Triangular ears
                ctx.fillStyle = '#e6b872';
                ctx.beginPath();
                ctx.arc(x, y, size / 2, 0, Math.PI * 2);
                ctx.fill();
                // Triangular ears
                ctx.beginPath();
                ctx.moveTo(x - size / 3, y - size / 3);
                ctx.lineTo(x - size / 2, y - size);
                ctx.lineTo(x - size / 6, y - size / 3);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(x + size / 3, y - size / 3);
                ctx.lineTo(x + size / 2, y - size);
                ctx.lineTo(x + size / 6, y - size / 3);
                ctx.closePath();
                ctx.fill();
                break;
            case 'rabbit':
                // Rabbit: Long ears
                ctx.fillStyle = '#e0e0e0';
                ctx.beginPath();
                ctx.arc(x, y, size / 2, 0, Math.PI * 2);
                ctx.fill();
                // Long ears
                ctx.fillStyle = '#e0e0e0';
                ctx.fillRect(x - size / 4, y - size, size / 8, size * 0.7);
                ctx.fillRect(x + size / 8, y - size, size / 8, size * 0.7);
                break;
            case 'bird':
                // Bird: Small circle with beak
                ctx.fillStyle = '#87ceeb';
                ctx.beginPath();
                ctx.arc(x, y, size / 2, 0, Math.PI * 2);
                ctx.fill();
                // Beak
                ctx.fillStyle = '#ff8c00';
                ctx.beginPath();
                ctx.moveTo(x + size / 2, y);
                ctx.lineTo(x + size, y + size / 6);
                ctx.lineTo(x + size / 2, y + size / 3);
                ctx.closePath();
                ctx.fill();
                break;
            case 'hamster':
                // Hamster: Round with small ears
                ctx.fillStyle = '#d4a574';
                ctx.beginPath();
                ctx.arc(x, y, size / 2, 0, Math.PI * 2);
                ctx.fill();
                // Small ears
                ctx.beginPath();
                ctx.arc(x - size / 4, y - size / 2, size / 6, 0, Math.PI * 2);
                ctx.arc(x + size / 4, y - size / 2, size / 6, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'turtle':
                // Turtle: Oval with shell pattern
                ctx.fillStyle = '#8fbc8f';
                ctx.beginPath();
                ctx.ellipse(x, y, size / 2, size / 3, 0, 0, Math.PI * 2);
                ctx.fill();
                // Shell pattern
                ctx.strokeStyle = '#556b2f';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, size / 3, 0, Math.PI * 2);
                ctx.stroke();
                break;
            default:
                // Default: Simple circle
                ctx.fillStyle = '#a9a9a9';
                ctx.beginPath();
                ctx.arc(x, y, size / 2, 0, Math.PI * 2);
                ctx.fill();
        }

        // Eyes for all pets
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(x - size / 6, y, size / 10, 0, Math.PI * 2);
        ctx.arc(x + size / 6, y, size / 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    async function createAdoptionMenu() {
        const canvas = createCanvas(600, 400);
        const ctx = canvas.getContext('2d');
        
        // Softer background gradient
        const gradient = ctx.createLinearGradient(0, 0, 600, 400);
        gradient.addColorStop(0, '#b19cd9');
        gradient.addColorStop(1, '#8a7ca8');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 400);
        
        // Title
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('PET ADOPTION CENTER', 300, 50);
        
        // Subtle decoration (emoji removed for better rendering)
        // Decorative hearts as circles instead of emojis
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        for (let i = 0; i < 15; i++) {
            const x = Math.random() * 600;
            const y = Math.random() * 400;
            const size = Math.random() * 3 + 2;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Pet showcase with better contrast
        const pets = Object.values(PET_TYPES);
        const cols = 3;
        const rows = 2;
        
        for (let i = 0; i < Math.min(pets.length, 6); i++) {
            const pet = pets[i];
            const petType = Object.keys(PET_TYPES)[i];
            const x = 100 + (i % cols) * 150;
            const y = 120 + Math.floor(i / cols) * 120;

            // Pet box with softer colors
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(x - 50, y - 40, 100, 80);
            ctx.strokeStyle = '#5a6c8a';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - 50, y - 40, 100, 80);

            // Draw pet icon instead of emoji
            drawPetIcon(ctx, petType, x, y - 10, 35);

            // Pet name and cost
            ctx.fillStyle = '#2c3e50';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(pet.name, x, y + 20);
            ctx.font = '10px Arial';
            ctx.fillText(`¢${pet.cost}`, x, y + 35);
        }
        
        return canvas;
    }

    async function createPetCard(user, pet) {
        const canvas = createCanvas(500, 400);
        const ctx = canvas.getContext('2d');
        
        // Softer background
        const gradient = ctx.createLinearGradient(0, 0, 500, 400);
        gradient.addColorStop(0, '#6495ed');
        gradient.addColorStop(1, '#5a6c8a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 500, 400);
        
        // Pet status color overlay (much more subtle)
        const status = getPetStatus(pet);
        ctx.fillStyle = status.color + '15';
        ctx.fillRect(0, 0, 500, 400);
        
        // Pet info header
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(pet.name, 250, 40);
        
        // Level and age
        ctx.font = '16px Arial';
        ctx.fillText(`Level ${pet.level} • ${pet.age} days old`, 250, 65);
        
        try {
            // Owner avatar
            const avatarURL = user.displayAvatarURL({ extension: 'png', size: 128 });
            const avatar = await loadImageFromURL(avatarURL);
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(80, 120, 30, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, 50, 90, 60, 60);
            ctx.restore();
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(80, 120, 30, 0, Math.PI * 2);
            ctx.stroke();
        } catch (error) {
            ctx.fillStyle = '#7289da';
            ctx.beginPath();
            ctx.arc(80, 120, 30, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Owner name
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Owner: ${user.username}`, 80, 165);

        // Pet type name (large) with glow effect since emojis don't render well
        ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(PET_TYPES[pet.type].name.toUpperCase(), 350, 120);

        // Level indicator
        ctx.font = '24px Arial';
        ctx.fillText(`Level ${pet.level}`, 350, 150);
        ctx.shadowBlur = 0;

        // Personality badge
        if (pet.personality) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(280, 160, 140, 30);
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.strokeRect(280, 160, 140, 30);

            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(pet.personality.toUpperCase(), 350, 180);
        }

        // Mood indicator
        const mood = getPetMood(pet);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(450, 50, 120, 40);
        ctx.strokeStyle = mood.threshold >= 70 ? '#90EE90' : mood.threshold >= 30 ? '#FFD700' : '#FF6B6B';
        ctx.lineWidth = 2;
        ctx.strokeRect(450, 50, 120, 40);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('MOOD', 510, 65);
        ctx.font = '10px Arial';
        ctx.fillText(mood.name || 'Happy', 510, 80);
        
        // Stats bars with softer colors
        const stats = [
            { name: 'Hunger', value: pet.hunger, emoji: '🍽️', color: '#cd5c5c' },
            { name: 'Happiness', value: pet.happiness, emoji: '😊', color: '#daa520' },
            { name: 'Health', value: pet.health, emoji: '❤️', color: '#8fbc8f' },
            { name: 'Energy', value: pet.energy, emoji: '⚡', color: '#87ceeb' },
            { name: 'Cleanliness', value: pet.cleanliness, emoji: '🛁', color: '#98fb98' }
        ];
        
        stats.forEach((stat, index) => {
            const y = 200 + index * 35;
            
            // Stat label
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(stat.name, 30, y);
            
            // Progress bar background
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(150, y - 12, 200, 16);
            
            // Progress bar fill
            ctx.fillStyle = stat.color;
            ctx.fillRect(150, y - 12, (stat.value / 100) * 200, 16);
            
            // Progress bar border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.strokeRect(150, y - 12, 200, 16);
            
            // Value text
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(`${stat.value}%`, 370, y);
        });
        
        // XP bar
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('Experience', 30, 385);
        
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(150, 373, 200, 16);
        
        ctx.fillStyle = '#9370db';
        ctx.fillRect(150, 373, (pet.experience / 100) * 200, 16);
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(150, 373, 200, 16);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`${pet.experience}/100`, 370, 385);
        
        return canvas;
    }

    async function createPetShopDisplay() {
        const canvas = createCanvas(600, 400);
        const ctx = canvas.getContext('2d');
        
        // Softer background
        const gradient = ctx.createLinearGradient(0, 0, 600, 400);
        gradient.addColorStop(0, '#708090');
        gradient.addColorStop(1, '#5a6c8a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 400);
        
        // Shop sign
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('PET SHOP', 300, 50);
        
        // Categories display with muted colors
        const categories = [
            { name: 'Food', emoji: '🍽️', color: '#cd5c5c' },
            { name: 'Toys', emoji: '🎾', color: '#daa520' },
            { name: 'Medicine', emoji: '💊', color: '#8fbc8f' },
            { name: 'Care', emoji: '🛁', color: '#87ceeb' },
            { name: 'Accessories', emoji: '👑', color: '#9370db' }
        ];
        
        categories.forEach((cat, index) => {
            const x = 60 + index * 100;
            const y = 200;
            
            // Category circle
            ctx.fillStyle = cat.color;
            ctx.beginPath();
            ctx.arc(x, y, 40, 0, Math.PI * 2);
            ctx.fill();
            
            // Category label (emoji removed for better rendering)
            ctx.font = '30px Arial';
            ctx.textAlign = 'center';
            // Emoji removed - category name shown below is sufficient
            
            // Category name
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(cat.name, x, y + 65);
        });
        
        // Subtle shop decorations (emoji removed for better rendering)
        // Decorative circles instead of emojis
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        for (let i = 0; i < 10; i++) {
            const x = Math.random() * 600;
            const y = Math.random() * 400;
            ctx.beginPath();
            ctx.arc(x, y, Math.random() * 3 + 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        return canvas;
    }

    async function createAdoptionCard(user, pet) {
        const canvas = createCanvas(400, 300);
        const ctx = canvas.getContext('2d');
        
        // Softer success background
        const gradient = ctx.createLinearGradient(0, 0, 400, 300);
        gradient.addColorStop(0, '#90ee90');
        gradient.addColorStop(1, '#8fbc8f');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 400, 300);
        
        // Subtle celebration particles
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * 400;
            const y = Math.random() * 300;
            ctx.beginPath();
            ctx.arc(x, y, Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Title
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ADOPTION SUCCESS!', 200, 50);
        
        // Pet icon (using custom drawing instead of emoji)
        drawPetIcon(ctx, pet.type, 200, 150, 80);
        
        // Pet name
        ctx.font = 'bold 24px Arial';
        ctx.fillText(pet.name, 200, 200);
        
        // Welcome message
        ctx.font = '16px Arial';
        ctx.fillText('Welcome to the family!', 200, 230);
        
        return canvas;
    }

    async function createFeedingCard(user, pet, food) {
        const canvas = createCanvas(400, 250);
        const ctx = canvas.getContext('2d');
        
        // Softer background
        const gradient = ctx.createLinearGradient(0, 0, 400, 250);
        gradient.addColorStop(0, '#f0e68c');
        gradient.addColorStop(1, '#daa520');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 400, 250);
        
        // Title
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('FEEDING TIME!', 200, 40);
        
        // Pet and food (using custom drawing instead of emojis)
        drawPetIcon(ctx, pet.type, 150, 120, 50);

        // Food label (emoji removed for better rendering)
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(food.name, 250, 120);
        
        // Pet name and happiness
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`${pet.name} enjoyed the meal!`, 200, 160);
        
        // Stats gained
        ctx.font = '14px Arial';
        ctx.fillText(`+${food.hunger} Hunger, +${food.happiness || 0} Happiness`, 200, 190);
        
        return canvas;
    }

    async function createInventoryCard(user, pet, inventory) {
        const canvas = createCanvas(500, 400);
        const ctx = canvas.getContext('2d');
        
        // Softer background
        const gradient = ctx.createLinearGradient(0, 0, 500, 400);
        gradient.addColorStop(0, '#b19cd9');
        gradient.addColorStop(1, '#9370db');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 500, 400);
        
        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`📦 ${pet.name}'s Inventory`, 250, 40);
        
        // Items grid
        const items = Object.entries(inventory).filter(([key, count]) => count > 0);
        const cols = 4;
        
        items.slice(0, 12).forEach(([itemKey, count], index) => {
            const item = PET_ITEMS[itemKey];
            if (!item) return;
            
            const x = 80 + (index % cols) * 100;
            const y = 100 + Math.floor(index / cols) * 80;
            
            // Item box
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(x - 30, y - 30, 60, 60);
            ctx.strokeStyle = '#5a6c8a';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - 30, y - 30, 60, 60);
            
            // Item label (emoji removed for better rendering)
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(item.name, x, y);
            
            // Count
            ctx.fillStyle = '#dc143c';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(count.toString(), x + 20, y - 20);
        });
        
        return canvas;
    }

    async function createItemUseCard(user, pet, item) {
        const canvas = createCanvas(350, 200);
        const ctx = canvas.getContext('2d');
        
        // Softer background
        const gradient = ctx.createLinearGradient(0, 0, 350, 200);
        gradient.addColorStop(0, '#87ceeb');
        gradient.addColorStop(1, '#6495ed');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 350, 200);
        
        // Title
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ITEM USED!', 175, 30);
        
        // Pet and item (using custom drawing instead of emojis)
        drawPetIcon(ctx, pet.type, 125, 90, 40);

        // Item label (emoji removed for better rendering)
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(item.name, 225, 90);
        
        // Effect text
        ctx.font = 'bold 16px Arial';
        ctx.fillText(item.name, 175, 130);
        
        ctx.font = '14px Arial';
        ctx.fillText(getItemEffectText(item), 175, 155);
        
        return canvas;
    }

    async function createPurchaseCard(user, item) {
        const canvas = createCanvas(350, 200);
        const ctx = canvas.getContext('2d');
        
        // Softer background
        const gradient = ctx.createLinearGradient(0, 0, 350, 200);
        gradient.addColorStop(0, '#98fb98');
        gradient.addColorStop(1, '#8fbc8f');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 350, 200);
        
        // Title
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('PURCHASE SUCCESS!', 175, 30);
        
        // Item (emoji removed for better rendering)
        
        // Item info
        ctx.font = 'bold 18px Arial';
        ctx.fillText(item.name, 175, 140);
        
        ctx.font = '14px Arial';
        ctx.fillText(`Cost: ??{item.cost}`, 175, 165);
        
        return canvas;
    }

    async function createCareCard(user, pet, action) {
        const canvas = createCanvas(350, 200);
        const ctx = canvas.getContext('2d');
        
        // Softer background colors by action
        const colors = {
            feed: ['#f0e68c', '#daa520'],
            play: ['#ffa07a', '#cd5c5c'],
            clean: ['#98fb98', '#8fbc8f'],
            sleep: ['#b0c4de', '#6495ed']
        };
        
        const gradient = ctx.createLinearGradient(0, 0, 350, 200);
        gradient.addColorStop(0, colors[action][0]);
        gradient.addColorStop(1, colors[action][1]);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 350, 200);
        
        // Action icons
        const icons = {
            feed: '🍽️',
            play: '🎾',
            clean: '🛁',
            sleep: '😴'
        };
        
        // Title
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${icons[action]} PET CARE`, 175, 30);
        
        // Pet (using custom drawing instead of emoji)
        drawPetIcon(ctx, pet.type, 175, 100, 60);
        
        // Pet name
        ctx.font = 'bold 18px Arial';
        ctx.fillText(pet.name, 175, 140);
        
        // Action text
        const actionTexts = {
            feed: 'is well fed!',
            play: 'had fun playing!',
            clean: 'is squeaky clean!',
            sleep: 'feels refreshed!'
        };
        
        ctx.font = '14px Arial';
        ctx.fillText(actionTexts[action], 175, 165);
        
        return canvas;
    }

    async function createTrainingCard(user, pet, oldLevel) {
        const canvas = createCanvas(400, 250);
        const ctx = canvas.getContext('2d');
        
        // Softer background
        const gradient = ctx.createLinearGradient(0, 0, 400, 250);
        gradient.addColorStop(0, '#dda0dd');
        gradient.addColorStop(1, '#9370db');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 400, 250);
        
        // Title
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('TRAINING COMPLETE!', 200, 40);
        
        // Pet (using custom drawing instead of emoji)
        drawPetIcon(ctx, pet.type, 200, 120, 60);
        
        // Training info
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`${pet.name} completed training!`, 200, 160);
        
        // Level up indicator
        if (pet.level > oldLevel) {
            ctx.fillStyle = '#daa520';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`LEVEL UP! Now Level ${pet.level}!`, 200, 190);
        } else {
            ctx.fillStyle = '#2c3e50';
            ctx.font = '14px Arial';
            ctx.fillText('+15 XP, +10 Happiness', 200, 190);
        }
        
        return canvas;
    }

    async function createPetLeaderboard(topPets, guild) {
        const canvas = createCanvas(600, 400 + (topPets.length * 40));
        const ctx = canvas.getContext('2d');
        
        // Softer background
        const gradient = ctx.createLinearGradient(0, 0, 600, canvas.height);
        gradient.addColorStop(0, '#f0e68c');
        gradient.addColorStop(1, '#daa520');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, canvas.height);
        
        // Title
        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('PET LEADERBOARD', 300, 50);
        
        // Server name
        ctx.font = '18px Arial';
        ctx.fillText(guild.name, 300, 80);
        
        // Leaderboard entries
        topPets.forEach((entry, index) => {
            const y = 120 + index * 40;
            
            // Rank background with softer colors
            let rankColor = '#708090';
            if (index === 0) rankColor = '#daa520';
            else if (index === 1) rankColor = '#c0c0c0';
            else if (index === 2) rankColor = '#cd853f';
            
            ctx.fillStyle = rankColor;
            ctx.fillRect(30, y - 15, 50, 25);
            
            // Rank
            ctx.fillStyle = '#2c3e50';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(index + 1, 55, y);
            
            // Pet icon (using custom drawing instead of emoji)
            drawPetIcon(ctx, entry.pet.type, 110, y, 20);
            
            // Pet and owner info
            ctx.fillStyle = '#2c3e50';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`${entry.pet.name} (${entry.username})`, 140, y - 5);
            
            // Stats
            ctx.font = '12px Arial';
            ctx.fillText(`Level ${entry.pet.level} • Happiness: ${entry.pet.happiness}% • Health: ${entry.pet.health}%`, 140, y + 10);
            
            // Score
            ctx.fillStyle = '#555555';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(`Score: ${entry.score}`, 570, y);
        });
        
        return canvas;
    }

    // NEW HELPER FUNCTIONS

    async function createMoodCard(pet, user) {
        const canvas = createCanvas(500, 350);
        const ctx = canvas.getContext('2d');

        // Gradient background based on mood
        const mood = getPetMood(pet);
        const gradient = ctx.createLinearGradient(0, 0, 0, 350);

        if (mood.threshold >= 70) {
            gradient.addColorStop(0, '#FFD700');
            gradient.addColorStop(1, '#FFA500');
        } else if (mood.threshold >= 30) {
            gradient.addColorStop(0, '#87CEEB');
            gradient.addColorStop(1, '#4682B4');
        } else {
            gradient.addColorStop(0, '#778899');
            gradient.addColorStop(1, '#2F4F4F');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 500, 350);

        // Title
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, 500, 60);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 5;
        ctx.fillText(`${pet.name}'s Mood`, 250, 40);
        ctx.shadowBlur = 0;

        // Large mood text (emojis don't render well in canvas)
        const moodName = Object.keys(MOODS).find(k => MOODS[k].emoji === mood.emoji);

        ctx.font = '32px Arial';
        ctx.fillText('Feeling', 250, 100);

        ctx.font = 'bold 42px Arial';
        ctx.fillText(moodName.toUpperCase(), 250, 140);

        // Personality badge
        if (pet.personality) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(150, 220, 200, 40);
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 3;
            ctx.strokeRect(150, 220, 200, 40);

            ctx.fillStyle = '#2c3e50';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`${pet.personality}`, 250, 247);
        }

        // Thought bubble
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.beginPath();
        ctx.roundRect(50, 270, 400, 60, 10);
        ctx.fill();
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#2c3e50';
        ctx.font = '16px Arial';
        ctx.fillText(`💭 "${getPetThoughts(pet)}"`, 250, 305);

        return canvas;
    }

    async function createGameResultCard(type, result, pet, reward) {
        const canvas = createCanvas(600, 400);
        const ctx = canvas.getContext('2d');

        // Background
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        if (result === 'win') {
            gradient.addColorStop(0, '#FFD700');
            gradient.addColorStop(1, '#FF8C00');
        } else if (result === 'place') {
            gradient.addColorStop(0, '#C0C0C0');
            gradient.addColorStop(1, '#696969');
        } else {
            gradient.addColorStop(0, '#4682B4');
            gradient.addColorStop(1, '#1E3A5F');
        }

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 400);

        // Decorative circles instead of emojis
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        for (let i = 0; i < 30; i++) {
            const x = Math.random() * 600;
            const y = Math.random() * 400;
            const size = Math.random() * 15 + 5;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Pet name (large) - emojis don't render well
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 15;
        ctx.font = 'bold 56px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(pet.name.toUpperCase(), 300, 160);

        ctx.font = '32px Arial';
        ctx.fillText(PET_TYPES[pet.type].name, 300, 200);
        ctx.shadowBlur = 0;

        // Result text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 10;

        if (result === 'win') {
            ctx.fillText('VICTORY!', 300, 260);
        } else if (result === 'place') {
            ctx.fillText('NICE TRY!', 300, 260);
        } else {
            ctx.fillText('KEEP TRYING!', 300, 260);
        }

        // Reward info
        if (reward > 0) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(200, 290, 200, 50);
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 3;
            ctx.strokeRect(200, 290, 200, 50);

            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 28px Arial';
            ctx.fillText(`+¢${reward}`, 300, 325);
        }

        ctx.shadowBlur = 0;

        return canvas;
    }

    async function createAdventureCard(pet, event) {
        const canvas = createCanvas(600, 400);
        const ctx = canvas.getContext('2d');

        // Adventure background
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, '#228B22');
        gradient.addColorStop(0.5, '#2E8B57');
        gradient.addColorStop(1, '#006400');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 400);

        // Adventure elements - trees as triangles
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        for (let i = 0; i < 20; i++) {
            const x = Math.random() * 600;
            const y = Math.random() * 400;
            const size = Math.random() * 20 + 10;

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - size, y + size * 2);
            ctx.lineTo(x + size, y + size * 2);
            ctx.closePath();
            ctx.fill();
        }

        // Title banner
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 30, 600, 60);

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 10;
        ctx.fillText('ADVENTURE COMPLETE!', 300, 70);

        // Pet info
        ctx.shadowBlur = 20;
        ctx.font = 'bold 48px Arial';
        ctx.fillText(pet.name, 300, 180);

        ctx.font = '28px Arial';
        ctx.fillText(PET_TYPES[pet.type].name, 300, 215);

        // Event result box
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillRect(50, 250, 500, 100);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 4;
        ctx.strokeRect(50, 250, 500, 100);

        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`${pet.name} ${event.message}`, 300, 285);

        // Rewards
        if (event.reward) {
            ctx.font = 'bold 24px Arial';
            ctx.fillStyle = '#228B22';
            ctx.fillText(`💰 Reward: ¢${event.reward.amount}`, 300, 325);
        }

        return canvas;
    }

    async function createPlaydateCard(pet1, pet2, user1, user2) {
        const canvas = createCanvas(700, 400);
        const ctx = canvas.getContext('2d');

        // Happy background
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, '#FF69B4');
        gradient.addColorStop(0.5, '#FFB6C1');
        gradient.addColorStop(1, '#FF1493');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 700, 400);

        // Hearts decoration - using circles
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        for (let i = 0; i < 30; i++) {
            const x = Math.random() * 700;
            const y = Math.random() * 400;
            const size = Math.random() * 12 + 5;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Title
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 20, 700, 70);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 42px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 10;
        ctx.fillText('PLAYDATE SUCCESS!', 350, 70);

        // Pet 1
        ctx.shadowBlur = 15;
        ctx.font = 'bold 36px Arial';
        ctx.fillText(pet1.name, 180, 180);
        ctx.font = '20px Arial';
        ctx.fillText(PET_TYPES[pet1.type].name, 180, 210);

        // Heart between - using text
        ctx.font = 'bold 36px Arial';
        ctx.fillText('❤', 350, 195);

        // Pet 2
        ctx.font = 'bold 36px Arial';
        ctx.fillText(pet2.name, 520, 180);
        ctx.font = '20px Arial';
        ctx.fillText(PET_TYPES[pet2.type].name, 520, 210);

        // Names
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(100, 230, 160, 40);
        ctx.fillRect(440, 230, 160, 40);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(pet1.name, 180, 257);
        ctx.fillText(pet2.name, 520, 257);

        // Benefits box
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillRect(150, 300, 400, 70);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 4;
        ctx.strokeRect(150, 300, 400, 70);

        ctx.fillStyle = '#2c3e50';
        ctx.font = 'bold 18px Arial';
        ctx.fillText('Both pets gained:', 350, 330);
        ctx.font = '16px Arial';
        ctx.fillText('+30 Happiness  |  +10 XP  |  -20 Energy', 350, 355);

        return canvas;
    }

    async function createAchievementCard(achievement, pet) {
        const canvas = createCanvas(600, 350);
        const ctx = canvas.getContext('2d');

        // Golden background
        const gradient = ctx.createLinearGradient(0, 0, 0, 350);
        gradient.addColorStop(0, '#FFD700');
        gradient.addColorStop(0.5, '#FFA500');
        gradient.addColorStop(1, '#FF8C00');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 600, 350);

        // Sparkles
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * 600;
            const y = Math.random() * 350;
            const size = Math.random() * 3 + 1;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Achievement banner
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 40, 600, 80);

        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 38px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 15;
        ctx.fillText('ACHIEVEMENT UNLOCKED!', 300, 90);

        // Achievement icon - using text instead of emoji
        ctx.shadowBlur = 20;
        ctx.font = 'bold 48px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('ACHIEVEMENT', 300, 180);

        // Achievement name
        ctx.shadowBlur = 10;
        ctx.font = 'bold 32px Arial';
        ctx.fillText(achievement.name, 300, 250);

        // Reward box
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(200, 280, 200, 50);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.strokeRect(200, 280, 200, 50);

        ctx.fillStyle = '#00FF00';
        ctx.font = 'bold 26px Arial';
        ctx.fillText(`+¢${achievement.reward}`, 300, 313);

        return canvas;
    }

    function createNewPet(type, name) {
        const personalities = Object.keys(PERSONALITIES);
        const randomPersonality = personalities[Math.floor(Math.random() * personalities.length)];

        return {
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`, // Unique ID
            type: type,
            name: name,
            personality: randomPersonality,
            hunger: 100,
            happiness: 100,
            health: 100,
            energy: 100,
            cleanliness: 100,
            level: 1,
            experience: 0,
            age: 0,
            created: Date.now(),
            isActive: true, // Mark as active pet
            lastFed: Date.now(),
            lastPlayed: Date.now(),
            lastCleaned: Date.now(),
            lastCared: Date.now(),
            lastTraining: 0,
            lastAdventure: 0,
            stats: {
                care_count: 0,
                train_count: 0,
                race_wins: 0,
                treasures_found: 0,
                playdates: 0
            }
        };
    }

    function getPetMood(pet) {
        const avgStat = (pet.hunger + pet.happiness + pet.health + pet.energy + pet.cleanliness) / 5;

        for (const [key, mood] of Object.entries(MOODS)) {
            if (avgStat >= mood.threshold) {
                return { ...mood, name: key };
            }
        }

        return { ...MOODS.sick, name: 'sick' };
    }

    function getPetThoughts(pet) {
        const thoughts = [];

        if (pet.hunger < 30) thoughts.push("I'm so hungry...");
        else if (pet.hunger > 90) thoughts.push("My belly is full!");

        if (pet.happiness < 30) thoughts.push("I'm feeling sad...");
        else if (pet.happiness > 90) thoughts.push("Life is amazing!");

        if (pet.energy < 30) thoughts.push("I need to rest...");
        else if (pet.energy > 90) thoughts.push("I'm full of energy!");

        if (pet.cleanliness < 30) thoughts.push("I need a bath!");

        if (thoughts.length === 0) {
            const defaultThoughts = [
                "What's my owner up to?",
                "I wonder what's for dinner!",
                "Life is good!",
                "Time for some fun!",
                "I love my owner!"
            ];
            return defaultThoughts[Math.floor(Math.random() * defaultThoughts.length)];
        }

        return thoughts[Math.floor(Math.random() * thoughts.length)];
    }

    function triggerRandomEvent(pet) {
        const event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];

        // Apply effects
        if (event.effect) {
            if (event.effect.hunger) pet.hunger = Math.max(0, Math.min(100, pet.hunger + event.effect.hunger));
            if (event.effect.happiness) pet.happiness = Math.max(0, Math.min(100, pet.happiness + event.effect.happiness));
            if (event.effect.health) pet.health = Math.max(0, Math.min(100, pet.health + event.effect.health));
            if (event.effect.energy) pet.energy = Math.max(0, Math.min(100, pet.energy + event.effect.energy));
            if (event.effect.cleanliness) pet.cleanliness = Math.max(0, Math.min(100, pet.cleanliness + event.effect.cleanliness));
            if (event.effect.experience) pet.experience += event.effect.experience;
        }

        // Track stats
        if (event.stat) {
            pet.stats = pet.stats || {};
            pet.stats[event.stat] = (pet.stats[event.stat] || 0) + 1;
        }

        return event;
    }

    function getEventResults(event, pet) {
        const results = [];

        if (event.reward) {
            if (event.reward.type === 'bobby_bucks') {
                results.push(`💰 Found ??${event.reward.amount}`);
            }
        }

        if (event.effect) {
            if (event.effect.hunger) results.push(`🍽️ ${event.effect.hunger > 0 ? '+' : ''}${event.effect.hunger} Hunger`);
            if (event.effect.happiness) results.push(`😊 ${event.effect.happiness > 0 ? '+' : ''}${event.effect.happiness} Happiness`);
            if (event.effect.health) results.push(`❤️ ${event.effect.health > 0 ? '+' : ''}${event.effect.health} Health`);
            if (event.effect.energy) results.push(`⚡ ${event.effect.energy > 0 ? '+' : ''}${event.effect.energy} Energy`);
            if (event.effect.cleanliness) results.push(`🛁 ${event.effect.cleanliness > 0 ? '+' : ''}${event.effect.cleanliness} Cleanliness`);
            if (event.effect.experience) results.push(`⭐ +${event.effect.experience} XP`);
        }

        return results.length > 0 ? results.join('\n') : 'Nothing happened...';
    }

    function getPetAchievements(userId) {
        if (!fs.existsSync(petAchievementsFilePath)) {
            fs.writeFileSync(petAchievementsFilePath, '', 'utf-8');
            return [];
        }

        const data = fs.readFileSync(petAchievementsFilePath, 'utf-8');
        const userRecord = data.split('\n').find(line => line.startsWith(`${userId}|`));

        if (userRecord) {
            try {
                return JSON.parse(userRecord.substring(userRecord.indexOf('|') + 1));
            } catch (e) {
                return [];
            }
        }

        return [];
    }

    function savePetAchievements(userId, achievements) {
        if (!fs.existsSync(petAchievementsFilePath)) {
            fs.writeFileSync(petAchievementsFilePath, '', 'utf-8');
        }

        let data = fs.readFileSync(petAchievementsFilePath, 'utf-8').trim();
        const userRecord = data.split('\n').find(line => line.startsWith(`${userId}|`));
        const achievementData = `${userId}|${JSON.stringify(achievements)}`;

        if (userRecord) {
            data = data.replace(userRecord, achievementData);
        } else {
            data += `\n${achievementData}`;
        }

        fs.writeFileSync(petAchievementsFilePath, data.trim(), 'utf-8');
    }

    async function checkAchievements(userId, pet, channel) {
        const userAchievements = getPetAchievements(userId);
        const newAchievements = [];

        for (const [key, achievement] of Object.entries(ACHIEVEMENTS)) {
            if (userAchievements.includes(key)) continue;

            let unlocked = false;

            switch (achievement.requirement.type) {
                case 'level':
                    unlocked = pet.level >= achievement.requirement.value;
                    break;
                case 'care_count':
                    unlocked = (pet.stats?.care_count || 0) >= achievement.requirement.value;
                    break;
                case 'train_count':
                    unlocked = (pet.stats?.train_count || 0) >= achievement.requirement.value;
                    break;
                case 'race_wins':
                    unlocked = (pet.stats?.race_wins || 0) >= achievement.requirement.value;
                    break;
                case 'treasures_found':
                    unlocked = (pet.stats?.treasures_found || 0) >= achievement.requirement.value;
                    break;
                case 'playdates':
                    unlocked = (pet.stats?.playdates || 0) >= achievement.requirement.value;
                    break;
                case 'age':
                    unlocked = pet.age >= achievement.requirement.value;
                    break;
            }

            if (unlocked) {
                userAchievements.push(key);
                newAchievements.push({ key, achievement });
                updateBobbyBucks(userId, achievement.reward);
            }
        }

        if (newAchievements.length > 0) {
            savePetAchievements(userId, userAchievements);

            // Display achievement cards
            if (channel) {
                for (const { achievement } of newAchievements) {
                    const achievementCard = await createAchievementCard(achievement, pet);
                    const attachment = new AttachmentBuilder(achievementCard.toBuffer(), { name: 'achievement.png' });

                    const embed = new EmbedBuilder()
                        .setTitle('🏆 New Achievement!')
                        .setColor('#FFD700')
                        .setDescription(`**${achievement.name}**\n${achievement.description}`)
                        .setImage('attachment://achievement.png')
                        .setFooter({ text: `Reward: ¢${achievement.reward} Bobby Bucks!` })
                        .setTimestamp();

                    await channel.send({ embeds: [embed], files: [attachment] });
                }
            }
        }

        return newAchievements;
    }
};

