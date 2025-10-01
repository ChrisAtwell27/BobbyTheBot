const fs = require('fs');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const https = require('https');

const petsFilePath = path.join(__dirname, '../data/virtual_pets.txt');
const petItemsFilePath = path.join(__dirname, '../data/pet_items.txt');
const bobbyBucksFilePath = path.join(__dirname, '../data/bobby_bucks.txt');

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
        cost: 500
    },
    cat: {
        name: 'Cat',
        emoji: '🐱',
        hungerDecay: 0.6,
        happinessDecay: 0.4,
        energyDecay: 0.5,
        cleanlinessDecay: 0.3,
        healthDecay: 0.2,
        cost: 400
    },
    rabbit: {
        name: 'Rabbit',
        emoji: '🐰',
        hungerDecay: 1.0,
        happinessDecay: 0.5,
        energyDecay: 0.6,
        cleanlinessDecay: 0.4,
        healthDecay: 0.3,
        cost: 300
    },
    bird: {
        name: 'Bird',
        emoji: '🐦',
        hungerDecay: 0.9,
        happinessDecay: 0.7,
        energyDecay: 0.8,
        cleanlinessDecay: 0.6,
        healthDecay: 0.4,
        cost: 350
    },
    fish: {
        name: 'Fish',
        emoji: '🐠',
        hungerDecay: 0.4,
        happinessDecay: 0.2,
        energyDecay: 0.3,
        cleanlinessDecay: 0.8,
        healthDecay: 0.2,
        cost: 200
    },
    dragon: {
        name: 'Dragon',
        emoji: '🐉',
        hungerDecay: 1.2,
        happinessDecay: 0.8,
        energyDecay: 0.9,
        cleanlinessDecay: 0.7,
        healthDecay: 0.5,
        cost: 2000
    }
};

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
            const currentPet = getPet(userId);
            
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
                        label: `${pet.name} - ??{pet.cost}`,
                        description: `A lovely ${pet.name.toLowerCase()} companion`,
                        value: key,
                        emoji: pet.emoji
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
            const pet = getPet(userId);
            
            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet yet! Use `!adopt` to get one.');
            }

            const petCard = await createPetCard(message.author, pet);
            const attachment = new AttachmentBuilder(petCard.toBuffer(), { name: 'pet-status.png' });

            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pet_feed_${userId}`)
                        .setLabel('🍽️ Feed')
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
                        .setLabel('😴 Sleep')
                        .setStyle(ButtonStyle.Secondary)
                );

            const petStatus = getPetStatus(pet);
            const embed = new EmbedBuilder()
                .setTitle(`${PET_TYPES[pet.type].emoji} ${pet.name} - Pet Status`)
                .setColor(petStatus.color)
                .setDescription(`**${petStatus.message}**`)
                .setImage('attachment://pet-status.png')
                .addFields(
                    { name: '📊 Stats', value: getStatsDisplay(pet), inline: true },
                    { name: '🎂 Age', value: `${pet.age} days old`, inline: true },
                    { name: '⭐ Level', value: `Level ${pet.level} (${pet.experience}/100 XP)`, inline: true }
                )
                .setFooter({ text: 'Take good care of your pet for bonus XP!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment], components: [actionRow] });
        }

        // Pet shop command
        if (args[0] === '!petshop') {
            const userId = message.author.id;
            const pet = getPet(userId);
            
            if (!pet) {
                return message.channel.send('❌ You need a pet to use the pet shop! Use `!adopt` to get one.');
            }

            const shopImage = await createPetShopDisplay();
            const attachment = new AttachmentBuilder(shopImage.toBuffer(), { name: 'pet-shop.png' });

            const categories = ['food', 'toy', 'medicine', 'care', 'accessory'];
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`pet_shop_${userId}`)
                .setPlaceholder('Choose a category to browse!')
                .addOptions(
                    categories.map(category => ({
                        label: category.charAt(0).toUpperCase() + category.slice(1),
                        description: `Browse ${category} items for your pet`,
                        value: category,
                        emoji: getCategoryEmoji(category)
                    }))
                );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle('🛒 Pet Shop - Everything for Your Pet!')
                .setColor('#5a6c8a')
                .setDescription('**Welcome to the Pet Shop!**\nFind everything your pet needs to stay happy and healthy.')
                .setImage('attachment://pet-shop.png')
                .addFields(
                    { name: '🍽️ Food', value: 'Keep your pet well-fed', inline: true },
                    { name: '🎾 Toys', value: 'Fun and entertainment', inline: true },
                    { name: '💊 Medicine', value: 'Health and wellness', inline: true },
                    { name: '🛁 Care', value: 'Cleanliness supplies', inline: true },
                    { name: '👑 Accessories', value: 'Stylish additions', inline: true },
                    { name: '💰 Your Balance', value: `??{getBobbyBucks(userId).toLocaleString()}`, inline: true }
                )
                .setFooter({ text: 'Select a category above to start shopping!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment], components: [row] });
        }

        // Feed pet with specific food
        if (args[0] === '!feed' && args[1]) {
            const userId = message.author.id;
            const pet = getPet(userId);
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
            savePet(userId, pet);

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
            const pet = getPet(userId);
            
            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet! Use `!adopt` to get one.');
            }

            const inventory = getPetInventory(userId);
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
            const pet = getPet(userId);
            const itemKey = args[1].toLowerCase();
            
            if (!pet) {
                return message.channel.send('❌ You don\'t have a pet! Use `!adopt` to get one.');
            }

            const inventory = getPetInventory(userId);
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
                savePetInventory(userId, inventory);
            }

            savePet(userId, pet);

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
            const pet = getPet(userId);
            
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
            
            savePet(userId, pet);

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
                    content: `❌ You need ??{pet.cost} to adopt a ${pet.name}! You have ??{balance}.`,
                    ephemeral: true
                });
            }

            // Create new pet
            const newPet = createNewPet(petType, `${pet.name}-${Math.floor(Math.random() * 1000)}`);
            updateBobbyBucks(userId, -pet.cost);
            savePet(userId, newPet);

            const adoptionCard = await createAdoptionCard(interaction.user, newPet);
            const attachment = new AttachmentBuilder(adoptionCard.toBuffer(), { name: 'adoption-success.png' });

            const embed = new EmbedBuilder()
                .setTitle('🎉 Congratulations on Your New Pet!')
                .setColor('#8fbc8f')
                .setDescription(`**Welcome ${newPet.name} to the family!**`)
                .setImage('attachment://adoption-success.png')
                .addFields(
                    { name: '🏷️ Pet Type', value: pet.name, inline: true },
                    { name: '💰 Adoption Fee', value: `??{pet.cost}`, inline: true },
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
            const inventory = getPetInventory(userId);
            inventory[itemKey] = (inventory[itemKey] || 0) + 1;
            savePetInventory(userId, inventory);

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

        // Handle pet care buttons
        if (interaction.isButton() && interaction.customId.startsWith('pet_')) {
            const [prefix, action, userId] = interaction.customId.split('_');
            
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ This is not your pet!', ephemeral: true });
            }

            const pet = getPet(userId);
            if (!pet) {
                return interaction.reply({ content: '❌ You don\'t have a pet!', ephemeral: true });
            }

            let response = '';
            let xpGained = 0;

            switch (action) {
                case 'feed':
                    if (pet.hunger >= 90) {
                        return interaction.reply({ content: '❌ Your pet is not hungry right now!', ephemeral: true });
                    }
                    pet.hunger = Math.min(100, pet.hunger + 20);
                    pet.happiness = Math.min(100, pet.happiness + 5);
                    xpGained = 3;
                    response = `Fed ${pet.name}! They're feeling satisfied.`;
                    break;

                case 'play':
                    if (pet.energy < 20) {
                        return interaction.reply({ content: '❌ Your pet is too tired to play! Let them rest.', ephemeral: true });
                    }
                    pet.happiness = Math.min(100, pet.happiness + 15);
                    pet.energy = Math.max(0, pet.energy - 15);
                    xpGained = 4;
                    response = `Played with ${pet.name}! They had a great time.`;
                    break;

                case 'clean':
                    if (pet.cleanliness >= 90) {
                        return interaction.reply({ content: '❌ Your pet is already clean!', ephemeral: true });
                    }
                    pet.cleanliness = Math.min(100, pet.cleanliness + 25);
                    pet.happiness = Math.min(100, pet.happiness + 10);
                    xpGained = 2;
                    response = `Cleaned ${pet.name}! They're sparkling clean now.`;
                    break;

                case 'sleep':
                    if (pet.energy >= 90) {
                        return interaction.reply({ content: '❌ Your pet is not tired right now!', ephemeral: true });
                    }
                    pet.energy = Math.min(100, pet.energy + 30);
                    pet.health = Math.min(100, pet.health + 5);
                    xpGained = 2;
                    response = `${pet.name} took a nice nap and feels refreshed!`;
                    break;
            }

            pet.experience += xpGained;
            const oldLevel = pet.level;
            while (pet.experience >= 100) {
                pet.experience -= 100;
                pet.level++;
            }

            savePet(userId, pet);

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

            await interaction.reply({ embeds: [embed], files: [attachment] });
        }
    });

    // Pet management functions
    function createNewPet(type, name) {
        return {
            type: type,
            name: name,
            hunger: 100,
            happiness: 100,
            health: 100,
            energy: 100,
            cleanliness: 100,
            level: 1,
            experience: 0,
            age: 0,
            created: Date.now(),
            lastFed: Date.now(),
            lastPlayed: Date.now(),
            lastCleaned: Date.now(),
            lastCared: Date.now(),
            lastTraining: 0
        };
    }

    function getPet(userId) {
        if (!fs.existsSync(petsFilePath)) {
            fs.writeFileSync(petsFilePath, '', 'utf-8');
            return null;
        }
        const data = fs.readFileSync(petsFilePath, 'utf-8');
        const userRecord = data.split('\n').find(line => line.startsWith(`${userId}|`));
        if (userRecord) {
            try {
                return JSON.parse(userRecord.substring(userRecord.indexOf('|') + 1));
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    function savePet(userId, pet) {
        if (!fs.existsSync(petsFilePath)) {
            fs.writeFileSync(petsFilePath, '', 'utf-8');
        }
        let data = fs.readFileSync(petsFilePath, 'utf-8').trim();
        const userRecord = data.split('\n').find(line => line.startsWith(`${userId}|`));
        const petData = `${userId}|${JSON.stringify(pet)}`;
        
        if (userRecord) {
            data = data.replace(userRecord, petData);
        } else {
            data += `\n${petData}`;
        }
        
        fs.writeFileSync(petsFilePath, data.trim(), 'utf-8');
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
                const pet = JSON.parse(petDataStr);
                const petType = PET_TYPES[pet.type];
                
                // Apply decay rates
                pet.hunger = Math.max(0, pet.hunger - petType.hungerDecay);
                pet.happiness = Math.max(0, pet.happiness - petType.happinessDecay);
                pet.energy = Math.max(0, pet.energy - petType.energyDecay);
                pet.cleanliness = Math.max(0, pet.cleanliness - petType.cleanlinessDecay);
                pet.health = Math.max(0, pet.health - petType.healthDecay);
                
                // Age the pet
                const daysSinceCreated = Math.floor((Date.now() - pet.created) / (24 * 60 * 60 * 1000));
                pet.age = daysSinceCreated;
                
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
        
        return `🍽️ Hunger: ${getBar(pet.hunger)} ${pet.hunger}%\n` +
               `😊 Happiness: ${getBar(pet.happiness)} ${pet.happiness}%\n` +
               `❤️ Health: ${getBar(pet.health)} ${pet.health}%\n` +
               `⚡ Energy: ${getBar(pet.energy)} ${pet.energy}%\n` +
               `🛁 Cleanliness: ${getBar(pet.cleanliness)} ${pet.cleanliness}%`;
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
        ctx.fillText('🏠 PET ADOPTION CENTER', 300, 50);
        
        // Subtle decoration
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        for (let i = 0; i < 15; i++) {
            const x = Math.random() * 600;
            const y = Math.random() * 400;
            ctx.font = `${Math.random() * 15 + 10}px Arial`;
            ctx.fillText('💝', x, y);
        }
        
        // Pet showcase with better contrast
        const pets = Object.values(PET_TYPES);
        const cols = 3;
        const rows = 2;
        
        for (let i = 0; i < Math.min(pets.length, 6); i++) {
            const pet = pets[i];
            const x = 100 + (i % cols) * 150;
            const y = 120 + Math.floor(i / cols) * 120;
            
            // Pet box with softer colors
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(x - 50, y - 40, 100, 80);
            ctx.strokeStyle = '#5a6c8a';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - 50, y - 40, 100, 80);
            
            // Pet emoji with shadow for better visibility
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 2;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            ctx.font = '40px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(pet.emoji, x, y - 5);
            
            // Reset shadow
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            // Pet name and cost
            ctx.fillStyle = '#2c3e50';
            ctx.font = 'bold 12px Arial';
            ctx.fillText(pet.name, x, y + 20);
            ctx.font = '10px Arial';
            ctx.fillText(`??{pet.cost}`, x, y + 35);
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
        ctx.fillText(`${PET_TYPES[pet.type].emoji} ${pet.name}`, 250, 40);
        
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
        
        // Pet emoji (large)
        ctx.font = '80px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(PET_TYPES[pet.type].emoji, 350, 150);
        
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
            ctx.fillText(`${stat.emoji} ${stat.name}`, 30, y);
            
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
        ctx.fillText('⭐ Experience', 30, 385);
        
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
        ctx.fillText('🛒 PET SHOP', 300, 50);
        
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
            
            // Category emoji
            ctx.font = '30px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(cat.emoji, x, y + 10);
            
            // Category name
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(cat.name, x, y + 65);
        });
        
        // Subtle shop decorations
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        for (let i = 0; i < 10; i++) {
            const x = Math.random() * 600;
            const y = Math.random() * 400;
            ctx.font = `${Math.random() * 12 + 8}px Arial`;
            ctx.fillText('🛍️', x, y);
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
        ctx.fillText('🎉 ADOPTION SUCCESS!', 200, 50);
        
        // Pet
        ctx.font = '80px Arial';
        ctx.fillText(PET_TYPES[pet.type].emoji, 200, 150);
        
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
        ctx.fillText('🍽️ FEEDING TIME!', 200, 40);
        
        // Pet and food
        ctx.font = '50px Arial';
        ctx.fillText(PET_TYPES[pet.type].emoji, 150, 120);
        ctx.fillText(food.emoji, 250, 120);
        
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
            
            // Item emoji
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(item.emoji, x, y - 5);
            
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
        ctx.fillText('✨ ITEM USED!', 175, 30);
        
        // Pet and item
        ctx.font = '40px Arial';
        ctx.fillText(PET_TYPES[pet.type].emoji, 125, 90);
        ctx.fillText(item.emoji, 225, 90);
        
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
        ctx.fillText('🛍️ PURCHASE SUCCESS!', 175, 30);
        
        // Item
        ctx.font = '60px Arial';
        ctx.fillText(item.emoji, 175, 100);
        
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
        
        // Pet
        ctx.font = '60px Arial';
        ctx.fillText(PET_TYPES[pet.type].emoji, 175, 100);
        
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
        ctx.fillText('🎓 TRAINING COMPLETE!', 200, 40);
        
        // Pet
        ctx.font = '60px Arial';
        ctx.fillText(PET_TYPES[pet.type].emoji, 200, 120);
        
        // Training info
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`${pet.name} completed training!`, 200, 160);
        
        // Level up indicator
        if (pet.level > oldLevel) {
            ctx.fillStyle = '#daa520';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(`🎉 LEVEL UP! Now Level ${pet.level}!`, 200, 190);
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
        ctx.fillText('🏆 PET LEADERBOARD', 300, 50);
        
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
            
            // Pet emoji
            ctx.font = '20px Arial';
            ctx.fillText(PET_TYPES[entry.pet.type].emoji, 110, y);
            
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
};

