const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const https = require('https');

// Function to load image from URL with timeout and error handling
async function loadImageFromURL(url, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Image loading timeout'));
        }, timeout);

        https.get(url, (res) => {
            const chunks = [];

            res.on('data', (chunk) => chunks.push(chunk));

            res.on('end', () => {
                clearTimeout(timer);
                try {
                    const buffer = Buffer.concat(chunks);
                    resolve(loadImage(buffer));
                } catch (error) {
                    reject(error);
                }
            });

            res.on('error', (error) => {
                clearTimeout(timer);
                reject(error);
            });
        }).on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}

// Help categories and their commands
const HELP_CATEGORIES = {
    economy: {
        name: '💰 Economy & Currency',
        emoji: '💰',
        description: 'Manage your Bobby Bucks and economy',
        commands: [
            { name: '!balance', description: 'Check your Bobby Bucks balance', usage: '!balance [@user]' },
            { name: '!baltop', description: 'View the richest members leaderboard', usage: '!baltop' },
            { name: '!pay', description: 'Pay another user Bobby Bucks', usage: '!pay @user [amount]' },
            { name: '!beg', description: 'Beg for Bobby Bucks with interactive tip jar', usage: '!beg' },
            { name: '!economy', description: 'View server economy statistics', usage: '!economy' },
            { name: '!spend', description: 'Spend your Bobby Bucks', usage: '!spend [amount]' },
            { name: '!award', description: '**[ADMIN]** Award Bobby Bucks to user', usage: '!award @user [amount]' },
            { name: '!awardall', description: '**[ADMIN]** Award all users Bobby Bucks', usage: '!awardall [amount]' }
        ]
    },
    casino: {
        name: '🎰 Casino & Gambling',
        emoji: '🎰',
        description: 'Test your luck with various casino games',
        commands: [
            { name: '!gamble', description: 'View all available casino games', usage: '!gamble' },
            { name: '!flip', description: 'Coin flip game (2x payout)', usage: '!flip [amount]' },
            { name: '!roulette', description: 'Roulette game (2x/36x payout)', usage: '!roulette [amount] [red/black/0-36]' },
            { name: '!dice', description: 'Dice roll game (6x payout)', usage: '!dice [amount] [1-6]' },
            { name: '!blackjack', description: 'Play blackjack against the dealer', usage: '!blackjack [amount]' },
            { name: '!challenges', description: 'View active PvP game challenges', usage: '!challenges' }
        ]
    },
    pvp: {
        name: '⚔️ PvP Games',
        emoji: '⚔️',
        description: 'Challenge other players to various games',
        commands: [
            { name: '!rps', description: 'Rock Paper Scissors challenge', usage: '!rps [amount]' },
            { name: '!highercard', description: 'Higher card duel', usage: '!highercard [amount]' },
            { name: '!quickdraw', description: 'Type the word fastest to win', usage: '!quickdraw [amount]' },
            { name: '!numberduel', description: 'Closest number guess wins', usage: '!numberduel [amount]' },
            { name: '!gladiator', description: 'Epic gladiator arena combat', usage: '!gladiator @opponent [amount] [class]' },
            { name: '!arena', description: 'Alternative command for gladiator', usage: '!arena @opponent [amount] [class]' },
            { name: '!arenastats', description: 'View arena statistics', usage: '!arenastats [@user]' }
        ]
    },
    poker: {
        name: '🃏 Poker & High Stakes',
        emoji: '🃏',
        description: 'High-stakes poker and dangerous games',
        commands: [
            { name: '!poker', description: 'Create Texas Hold\'em poker lobby', usage: '!poker [buy-in]' },
            { name: '!holdem', description: 'Alternative poker command', usage: '!holdem [buy-in]' },
            { name: '!russianroulette', description: '**DANGEROUS** - Winner takes all, loser loses everything', usage: '!russianroulette' },
            { name: '!rr', description: 'Short command for Russian Roulette', usage: '!rr' }
        ]
    },
    teams: {
        name: '👥 Team Building',
        emoji: '👥',
        description: 'Form teams for various games and activities',
        commands: [
            { name: '@Valorant', description: 'Create a 5-player Valorant team', usage: 'Mention @Valorant role or !valorant' },
            { name: '!valorant', description: 'Alternative Valorant team command', usage: '!valorant' },
            { name: '@REPO', description: 'Create a 6-player horror game squad', usage: 'Mention @REPO role or !repo' },
            { name: '!repo', description: 'Alternative REPO squad command', usage: '!repo' }
        ]
    },
    pets: {
        name: '🐕 Virtual Pets',
        emoji: '🐕',
        description: 'Adopt and care for virtual pets',
        commands: [
            { name: '!adopt', description: 'Adopt a new virtual pet', usage: '!adopt' },
            { name: '!pet', description: 'Check your pet\'s status and care for them', usage: '!pet' },
            { name: '!petshop', description: 'Buy items for your pet', usage: '!petshop' },
            { name: '!feed', description: 'Feed your pet with specific food', usage: '!feed [food_item]' },
            { name: '!petinventory', description: 'View your pet\'s inventory', usage: '!petinventory or !petinv' },
            { name: '!use', description: 'Use an item on your pet', usage: '!use [item]' },
            { name: '!train', description: 'Train your pet for XP and levels', usage: '!train' },
            { name: '!petleaderboard', description: 'View top pets in the server', usage: '!petleaderboard or !pettop' }
        ]
    },
    activity: {
        name: '📊 Activity & Stats',
        emoji: '📊',
        description: 'Track activity and compete for daily prizes',
        commands: [
            { name: '!activity', description: 'Check daily activity stats', usage: '!activity [@user]' },
            { name: '!activetop', description: 'Daily activity leaderboard (5,000 BB prize!)', usage: '!activetop' }
        ]
    },
    clips: {
        name: '🎬 Clip Submissions',
        emoji: '🎬',
        description: 'Submit and vote on video clips',
        commands: [
            { name: '!submitclip', description: 'Submit a video clip (biweekly contest)', usage: '!submitclip [description]' },
            { name: '!clipstatus', description: 'Check current submission status', usage: '!clipstatus' }
        ]
    },
    moderation: {
        name: '🛡️ Moderation',
        emoji: '🛡️',
        description: 'Moderation and admin commands',
        commands: [
            { name: '!Reset Thinice', description: '**[ADMIN]** Reset user\'s thin ice status', usage: '!Reset Thinice @user' }
        ]
    },
    interaction: {
        name: '💬 Bot Interactions',
        emoji: '💬',
        description: 'Chat and interact with Bobby',
        commands: [
            { name: 'Talk to Bobby', description: 'Say "Bobby" in your message to chat!', usage: 'Hey Bobby, how are you?' },
            { name: 'Conversations', description: 'Bobby responds to greetings, questions, and more', usage: 'Bobby, tell me a joke' }
        ]
    }
};

// Create help menu visualization
async function createHelpMenuCard(user) {
    try {
        const canvas = createCanvas(800, 600);
        const ctx = canvas.getContext('2d');

        // Background gradient
        const gradient = ctx.createLinearGradient(0, 0, 800, 600);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(0.5, '#764ba2');
        gradient.addColorStop(1, '#f093fb');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 800, 600);

        // Decorative pattern
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        for (let i = 0; i < 50; i++) {
            const x = Math.random() * 800;
            const y = Math.random() * 600;
            const size = Math.random() * 3 + 1;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }

        // Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 5;
        ctx.fillText('🤖 BOBBY BOT HELP', 400, 80);
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.font = '24px Arial';
        ctx.fillText('Your Ultimate Discord Companion', 400, 120);

        try {
            // User avatar with timeout protection
            const avatarURL = user.displayAvatarURL({ extension: 'png', size: 128 });
            const avatar = await loadImageFromURL(avatarURL, 3000);

            ctx.save();
            ctx.beginPath();
            ctx.arc(400, 200, 50, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatar, 350, 150, 100, 100);
            ctx.restore();

            // Avatar border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(400, 200, 50, 0, Math.PI * 2);
            ctx.stroke();
        } catch (error) {
            console.log('Failed to load user avatar, using fallback:', error.message);
            // Fallback avatar
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(400, 200, 50, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#667eea';
            ctx.font = '40px Arial';
            ctx.fillText('👤', 400, 210);
        }

        // Welcome message
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Welcome, ${user.username}!`, 400, 280);

        // Features grid
        const categories = Object.values(HELP_CATEGORIES);
        const cols = 3;
        const rows = Math.ceil(categories.length / cols);

        for (let i = 0; i < Math.min(categories.length, 9); i++) {
            const cat = categories[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = 150 + col * 200;
            const y = 340 + row * 80;

            // Category box
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(x - 80, y - 30, 160, 60);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - 80, y - 30, 160, 60);

            // Category info
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(cat.emoji, x, y - 5);
            ctx.font = '12px Arial';
            ctx.fillText(cat.name.replace(/^.+? /, ''), x, y + 15);
        }

        // Instructions
        ctx.fillStyle = '#ffffff';
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Use the dropdown menu below to explore different categories!', 400, 550);

        return canvas;
    } catch (error) {
        console.error('Error creating help menu card:', error);
        // Return a simple canvas on error
        const canvas = createCanvas(800, 400);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#667eea';
        ctx.fillRect(0, 0, 800, 400);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Bobby Bot Help', 400, 200);
        return canvas;
    }
}

// Create category help visualization
async function createCategoryCard(category, user) {
    try {
        const canvas = createCanvas(700, 500 + (category.commands.length * 25));
        const ctx = canvas.getContext('2d');

        // Background
        const gradient = ctx.createLinearGradient(0, 0, 700, canvas.height);
        gradient.addColorStop(0, '#4facfe');
        gradient.addColorStop(1, '#00f2fe');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 700, canvas.height);

        // Header
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 3;
        ctx.fillText(`${category.emoji} ${category.name}`, 350, 50);
        ctx.shadowBlur = 0;

        // Description
        ctx.font = '18px Arial';
        ctx.fillText(category.description, 350, 80);

        // Commands section
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillRect(30, 110, 640, canvas.height - 140);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeRect(30, 110, 640, canvas.height - 140);

        // Commands
        ctx.fillStyle = '#333333';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('Available Commands:', 50, 140);

        category.commands.forEach((cmd, index) => {
            const y = 170 + index * 35;

            // Command name
            ctx.fillStyle = '#0066cc';
            ctx.font = 'bold 16px Arial';
            ctx.fillText(cmd.name, 50, y);

            // Usage
            ctx.fillStyle = '#666666';
            ctx.font = '12px Arial';
            ctx.fillText(`Usage: ${cmd.usage}`, 50, y + 15);

            // Description
            ctx.fillStyle = '#333333';
            ctx.font = '14px Arial';
            ctx.fillText(cmd.description, 250, y);

            // Separator line
            if (index < category.commands.length - 1) {
                ctx.strokeStyle = '#dddddd';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(50, y + 25);
                ctx.lineTo(650, y + 25);
                ctx.stroke();
            }
        });

        return canvas;
    } catch (error) {
        console.error('Error creating category card:', error);
        // Return a simple canvas on error
        const canvas = createCanvas(700, 400);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#4facfe';
        ctx.fillRect(0, 0, 700, 400);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${category.emoji} ${category.name}`, 350, 200);
        return canvas;
    }
}

module.exports = (client) => {
    console.log('📖 Help Handler initialized');

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!message.guild) return;

        const args = message.content.split(' ');
        const command = args[0].toLowerCase();

        try {
            // Main help command
            if (command === '!help' || command === '!commands') {
                if (args[1]) {
                    // Specific category help
                    const categoryKey = args[1].toLowerCase();
                    if (HELP_CATEGORIES[categoryKey]) {
                        await showCategoryHelp(message, HELP_CATEGORIES[categoryKey]);
                    } else {
                        await message.reply(`❌ Unknown category: \`${args[1]}\`. Use \`!help\` to see all categories.`);
                    }
                } else {
                    await showMainHelp(message);
                }
            }

            // Quick command to list all commands
            if (command === '!cmdlist' || command === '!commandlist') {
                await showQuickCommandList(message);
            }
        } catch (error) {
            console.error('Error in help handler:', error);
            await message.reply('❌ An error occurred while generating the help menu. Please try again.').catch(console.error);
        }
    });

    // Handle help menu interactions
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isStringSelectMenu()) return;
        if (!interaction.customId.startsWith('help_category_')) return;

        const userId = interaction.customId.split('_')[2];
        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: '❌ This help menu is not for you!',
                ephemeral: true
            });
        }

        const categoryKey = interaction.values[0];
        
        if (categoryKey === 'main') {
            await showMainHelpInteraction(interaction);
        } else if (HELP_CATEGORIES[categoryKey]) {
            await showCategoryHelpInteraction(interaction, HELP_CATEGORIES[categoryKey]);
        }
    });

    // Show quick command list (text-only, no images)
    async function showQuickCommandList(message) {
        const embed = new EmbedBuilder()
            .setColor(0x667eea)
            .setTitle('📋 Quick Command List')
            .setDescription('All available commands organized by category');

        for (const [key, category] of Object.entries(HELP_CATEGORIES)) {
            const commandsList = category.commands
                .map(cmd => `\`${cmd.name}\``)
                .join(', ');

            embed.addFields({
                name: `${category.emoji} ${category.name}`,
                value: commandsList.length > 1024 ? commandsList.substring(0, 1020) + '...' : commandsList,
                inline: false
            });
        }

        embed.setFooter({ text: 'Use !help [category] for detailed information about a category' });

        return message.channel.send({ embeds: [embed] });
    }

    // Show main help menu
    async function showMainHelp(message) {
        try {
            const helpCard = await createHelpMenuCard(message.author);
            const attachment = new AttachmentBuilder(helpCard.toBuffer(), { name: 'help-menu.png' });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`help_category_${message.author.id}`)
                .setPlaceholder('Choose a category to explore!')
                .addOptions([
                    {
                        label: 'Main Menu',
                        description: 'Return to the main help menu',
                        value: 'main',
                        emoji: '🏠'
                    },
                    ...Object.entries(HELP_CATEGORIES).map(([key, category]) => ({
                        label: category.name.replace(/^.+? /, ''),
                        description: category.description,
                        value: key,
                        emoji: category.emoji
                    }))
                ]);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const embed = new EmbedBuilder()
                .setTitle('🤖 Bobby Bot Help Center')
                .setColor('#667eea')
                .setDescription('**Welcome to Bobby Bot!** 🎉\n\nI\'m your all-in-one Discord companion with tons of features to enhance your server experience!')
                .setImage('attachment://help-menu.png')
                .addFields(
                    { name: '💰 Economy System', value: 'Bobby Bucks currency with banking features', inline: true },
                    { name: '🎰 Casino Games', value: 'Dice, roulette, blackjack, and more!', inline: true },
                    { name: '⚔️ PvP Battles', value: 'Challenge friends to epic duels', inline: true },
                    { name: '🃏 Poker Tables', value: 'Texas Hold\'em with friends', inline: true },
                    { name: '👥 Team Building', value: 'Form teams for games', inline: true },
                    { name: '🐕 Virtual Pets', value: 'Adopt and care for digital companions', inline: true },
                    { name: '📊 Activity Tracking', value: 'Daily competitions with prizes', inline: true },
                    { name: '🎬 Clip Contests', value: 'Submit videos for biweekly voting', inline: true },
                    { name: '💬 AI Interactions', value: 'Chat naturally with Bobby!', inline: true }
                )
                .addFields({
                    name: '🚀 Quick Start',
                    value: '• Use `!balance` to check your Bobby Bucks\n• Try `!gamble` to see casino games\n• Say "Hey Bobby" to start chatting!\n• Use the dropdown below for detailed help\n• Type `!cmdlist` for a quick command reference',
                    inline: false
                })
                .setFooter({ text: 'Select a category above for detailed command information!' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment], components: [row] });
        } catch (error) {
            console.error('Error showing main help:', error);
            // Fallback to text-only help if image generation fails
            return showQuickCommandList(message);
        }
    }

    // Show category-specific help
    async function showCategoryHelp(message, category) {
        try {
            const categoryCard = await createCategoryCard(category, message.author);
            const attachment = new AttachmentBuilder(categoryCard.toBuffer(), { name: 'category-help.png' });

            const embed = new EmbedBuilder()
                .setTitle(`${category.emoji} ${category.name}`)
                .setColor('#4facfe')
                .setDescription(category.description)
                .setImage('attachment://category-help.png')
                .addFields({
                    name: '📋 Command List',
                    value: category.commands.map(cmd =>
                        `**${cmd.name}** - ${cmd.description}`
                    ).join('\n').substring(0, 1024),
                    inline: false
                })
                .setFooter({ text: 'Use !help to return to the main menu' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed], files: [attachment] });
        } catch (error) {
            console.error('Error showing category help:', error);
            // Fallback to text-only version
            const embed = new EmbedBuilder()
                .setTitle(`${category.emoji} ${category.name}`)
                .setColor('#4facfe')
                .setDescription(category.description)
                .addFields(
                    category.commands.map(cmd => ({
                        name: cmd.name,
                        value: `${cmd.description}\n**Usage:** \`${cmd.usage}\``,
                        inline: false
                    }))
                )
                .setFooter({ text: 'Use !help to return to the main menu' })
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }
    }

    // Show main help via interaction
    async function showMainHelpInteraction(interaction) {
        const helpCard = await createHelpMenuCard(interaction.user);
        const attachment = new AttachmentBuilder(helpCard.toBuffer(), { name: 'help-menu.png' });

        const embed = new EmbedBuilder()
            .setTitle('🤖 Bobby Bot Help Center')
            .setColor('#667eea')
            .setDescription('**Welcome to Bobby Bot!** 🎉\n\nI\'m your all-in-one Discord companion with tons of features to enhance your server experience!')
            .setImage('attachment://help-menu.png')
            .addFields(
                { name: '💰 Economy System', value: 'Bobby Bucks currency with banking features', inline: true },
                { name: '🎰 Casino Games', value: 'Dice, roulette, blackjack, and more!', inline: true },
                { name: '⚔️ PvP Battles', value: 'Challenge friends to epic duels', inline: true },
                { name: '🃏 Poker Tables', value: 'Texas Hold\'em with friends', inline: true },
                { name: '👥 Team Building', value: 'Form teams for games', inline: true },
                { name: '🐕 Virtual Pets', value: 'Adopt and care for digital companions', inline: true },
                { name: '📊 Activity Tracking', value: 'Daily competitions with prizes', inline: true },
                { name: '🎬 Clip Contests', value: 'Submit videos for biweekly voting', inline: true },
                { name: '💬 AI Interactions', value: 'Chat naturally with Bobby!', inline: true }
            )
            .addFields({
                name: '🚀 Quick Start',
                value: '• Use `!balance` to check your Bobby Bucks\n• Try `!gamble` to see casino games\n• Say "Hey Bobby" to start chatting!\n• Use the dropdown below for detailed help',
                inline: false
            })
            .setFooter({ text: 'Select a category above for detailed command information!' })
            .setTimestamp();

        await interaction.update({ embeds: [embed], files: [attachment] });
    }

    // Show category help via interaction
    async function showCategoryHelpInteraction(interaction, category) {
        const categoryCard = await createCategoryCard(category, interaction.user);
        const attachment = new AttachmentBuilder(categoryCard.toBuffer(), { name: 'category-help.png' });

        const embed = new EmbedBuilder()
            .setTitle(`${category.emoji} ${category.name}`)
            .setColor('#4facfe')
            .setDescription(category.description)
            .setImage('attachment://category-help.png')
            .addFields({
                name: '📋 Command List',
                value: category.commands.map(cmd => 
                    `**${cmd.name}** - ${cmd.description}`
                ).join('\n'),
                inline: false
            })
            .setFooter({ text: 'Use the dropdown to explore other categories!' })
            .setTimestamp();

        await interaction.update({ embeds: [embed], files: [attachment] });
    }
};