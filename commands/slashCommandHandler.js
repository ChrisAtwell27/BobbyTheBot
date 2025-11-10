/**
 * Slash Command Handler
 * Routes slash commands to their respective handler functions
 * Integrates with existing handlers by calling their logic
 */

const { TARGET_GUILD_ID } = require('../config/guildConfig');

/**
 * Initialize slash command handling
 * @param {Client} client - Discord client
 * @param {Object} interactionRouter - The centralized interaction router
 */
module.exports = (client, interactionRouter) => {
    console.log('⚡ Slash Command Handler initializing...');

    // Import existing handlers (they can be reused)
    const eggbuckHandler = require('../events/eggbuckHandler');
    const helpHandler = require('../events/helpHandler');
    const askHandler = require('../events/askHandler');
    const moderationHandler = require('../events/moderationHandler');

    /**
     * Register slash command handlers with the interaction router
     * This maps slash command names to their execution functions
     */

    // HELP COMMAND
    interactionRouter.registerSlashCommand('help', async (interaction) => {
        const category = interaction.options.getString('category');

        // For now, send a simple response
        // TODO: Integrate with existing helpHandler's showCategoryHelp function
        await interaction.reply({
            content: `🔧 Help command received${category ? ` for category: ${category}` : ''}!\n\n` +
                     `This is the new slash command system. Full integration with existing handlers coming soon!\n` +
                     `For now, you can still use \`!help\` for the full help menu.`,
            ephemeral: true
        });
    });

    // ECONOMY COMMANDS
    interactionRouter.registerSlashCommand('balance', async (interaction) => {
        const targetUser = interaction.options.getUser('user') || interaction.user;

        await interaction.reply({
            content: `💰 Checking balance for ${targetUser}...\n` +
                     `This slash command will be fully integrated soon. Use \`!balance\` for now.`,
            ephemeral: true
        });
    });

    interactionRouter.registerSlashCommand('daily', async (interaction) => {
        await interaction.reply({
            content: `🎁 Daily reward system!\n` +
                     `Full integration coming soon. Use \`!daily\` for now.`,
            ephemeral: true
        });
    });

    interactionRouter.registerSlashCommand('give', async (interaction) => {
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        await interaction.reply({
            content: `💸 Transfer ${amount} BobbyBucks to ${targetUser}!\n` +
                     `Full integration coming soon. Use \`!give @user amount\` for now.`,
            ephemeral: true
        });
    });

    interactionRouter.registerSlashCommand('leaderboard', async (interaction) => {
        await interaction.reply({
            content: `🏆 Leaderboard!\n` +
                     `Full integration coming soon. Use \`!leaderboard\` for now.`,
            ephemeral: true
        });
    });

    // GAMBLING COMMANDS
    interactionRouter.registerSlashCommand('flip', async (interaction) => {
        const choice = interaction.options.getString('choice');
        const amount = interaction.options.getInteger('amount');

        await interaction.reply({
            content: `🪙 Coin flip! You chose ${choice} and bet ${amount} BobbyBucks!\n` +
                     `Full integration coming soon. Use \`!flip ${choice} ${amount}\` for now.`
        });
    });

    interactionRouter.registerSlashCommand('slots', async (interaction) => {
        const amount = interaction.options.getInteger('amount');

        await interaction.reply({
            content: `🎰 Slot machine! Bet: ${amount} BobbyBucks!\n` +
                     `Full integration coming soon. Use \`!slots ${amount}\` for now.`
        });
    });

    interactionRouter.registerSlashCommand('dice', async (interaction) => {
        const guess = interaction.options.getInteger('guess');
        const amount = interaction.options.getInteger('amount');

        await interaction.reply({
            content: `🎲 Dice roll! You guessed ${guess} and bet ${amount} BobbyBucks!\n` +
                     `Full integration coming soon. Use \`!dice ${guess} ${amount}\` for now.`
        });
    });

    interactionRouter.registerSlashCommand('blackjack', async (interaction) => {
        const bet = interaction.options.getInteger('bet');

        await interaction.reply({
            content: `🃏 Blackjack! Bet: ${bet} BobbyBucks!\n` +
                     `Full integration coming soon. Use \`!blackjack ${bet}\` for now.`
        });
    });

    interactionRouter.registerSlashCommand('roulette', async (interaction) => {
        const bet = interaction.options.getString('bet');
        const amount = interaction.options.getInteger('amount');

        await interaction.reply({
            content: `🎡 Roulette! Betting ${amount} on ${bet}!\n` +
                     `Full integration coming soon. Use \`!roulette ${bet} ${amount}\` for now.`
        });
    });

    // GAME COMMANDS
    interactionRouter.registerSlashCommand('mafia', async (interaction) => {
        const subcommand = interaction.options.getSubcommand();

        await interaction.reply({
            content: `🐝 Bee Mafia - ${subcommand}!\n` +
                     `Full integration coming soon. Use \`!createmafia\`, \`!joinmafia\`, etc. for now.`,
            ephemeral: subcommand === 'status'
        });
    });

    interactionRouter.registerSlashCommand('wordle', async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const word = subcommand === 'guess' ? interaction.options.getString('word') : null;

        await interaction.reply({
            content: `📝 Wordle ${subcommand}${word ? `: ${word}` : ''}!\n` +
                     `Full integration coming soon. Use \`!wordle\` and \`!guess word\` for now.`,
            ephemeral: true
        });
    });

    interactionRouter.registerSlashCommand('trivia', async (interaction) => {
        await interaction.reply({
            content: `🧠 Daily Trivia!\n` +
                     `Full integration coming soon. Use the existing trivia system for now.`
        });
    });

    interactionRouter.registerSlashCommand('poker', async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const buyin = subcommand === 'create' ? interaction.options.getInteger('buyin') : null;

        await interaction.reply({
            content: `🃏 Poker - ${subcommand}${buyin ? ` (Buy-in: ${buyin})` : ''}!\n` +
                     `Full integration coming soon. Use \`!createpoker\` and \`!joinpoker\` for now.`
        });
    });

    // VALORANT COMMANDS
    interactionRouter.registerSlashCommand('valstats', async (interaction) => {
        const targetUser = interaction.options.getUser('user') || interaction.user;

        await interaction.reply({
            content: `📊 Valorant stats for ${targetUser}!\n` +
                     `Full integration coming soon. Use \`!valstats\` for now.`,
            ephemeral: true
        });
    });

    interactionRouter.registerSlashCommand('valprofile', async (interaction) => {
        const username = interaction.options.getString('username');
        const tag = interaction.options.getString('tag');
        const region = interaction.options.getString('region');

        await interaction.reply({
            content: `🔗 Linking Valorant profile: ${username}#${tag} (${region})!\n` +
                     `Full integration coming soon. Use \`!valprofile ${username}#${tag}\` for now.`,
            ephemeral: true
        });
    });

    interactionRouter.registerSlashCommand('team', async (interaction) => {
        const players = interaction.options.getInteger('players') || 10;

        await interaction.reply({
            content: `👥 Creating balanced teams for ${players} players!\n` +
                     `Full integration coming soon. Use \`!team\` for now.`
        });
    });

    interactionRouter.registerSlashCommand('valorantmap', async (interaction) => {
        const subcommand = interaction.options.getSubcommand();

        await interaction.reply({
            content: `🗺️ Valorant Map - ${subcommand}!\n` +
                     `Full integration coming soon. Use \`!valorantmap\` for now.`
        });
    });

    interactionRouter.registerSlashCommand('inhouse', async (interaction) => {
        const mode = interaction.options.getString('mode');

        await interaction.reply({
            content: `🏟️ Creating in-house match (${mode})!\n` +
                     `Full integration coming soon. Use \`!inhouse\` for now.`
        });
    });

    // PET COMMANDS
    interactionRouter.registerSlashCommand('pet', async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const name = subcommand === 'adopt' ? interaction.options.getString('name') : null;
        const targetUser = subcommand === 'view' ? interaction.options.getUser('user') : null;

        await interaction.reply({
            content: `🐾 Pet ${subcommand}${name ? `: ${name}` : ''}${targetUser ? ` - viewing ${targetUser}'s pet` : ''}!\n` +
                     `Full integration coming soon. Use \`!adopt\`, \`!feed\`, \`!pet\`, etc. for now.`,
            ephemeral: subcommand === 'status'
        });
    });

    // MODERATION COMMANDS
    interactionRouter.registerSlashCommand('kick', async (interaction) => {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Check permissions
        if (!interaction.member.permissions.has('KickMembers')) {
            return interaction.reply({
                content: '❌ You do not have permission to kick members.',
                ephemeral: true
            });
        }

        await interaction.reply({
            content: `⚠️ Kick ${targetUser}: ${reason}\n` +
                     `Full integration coming soon. Use \`!kick @user reason\` for now.`,
            ephemeral: true
        });
    });

    interactionRouter.registerSlashCommand('ban', async (interaction) => {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const deleteDays = interaction.options.getInteger('delete_days') || 0;

        // Check permissions
        if (!interaction.member.permissions.has('BanMembers')) {
            return interaction.reply({
                content: '❌ You do not have permission to ban members.',
                ephemeral: true
            });
        }

        await interaction.reply({
            content: `🔨 Ban ${targetUser}: ${reason} (Delete ${deleteDays} days of messages)\n` +
                     `Full integration coming soon. Use \`!ban @user reason\` for now.`,
            ephemeral: true
        });
    });

    interactionRouter.registerSlashCommand('timeout', async (interaction) => {
        const targetUser = interaction.options.getUser('user');
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Check permissions
        if (!interaction.member.permissions.has('ModerateMembers')) {
            return interaction.reply({
                content: '❌ You do not have permission to timeout members.',
                ephemeral: true
            });
        }

        await interaction.reply({
            content: `⏱️ Timeout ${targetUser} for ${duration} minutes: ${reason}\n` +
                     `Full integration coming soon. Use \`!timeout @user duration reason\` for now.`,
            ephemeral: true
        });
    });

    // UTILITY COMMANDS
    interactionRouter.registerSlashCommand('ask', async (interaction) => {
        const question = interaction.options.getString('question');

        await interaction.reply({
            content: `🤖 Asking Bobby: "${question}"\n` +
                     `Full integration coming soon. Just mention Bobby or use \`!ask\` for now.`
        });
    });

    interactionRouter.registerSlashCommand('bounty', async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        const bountyId = subcommand === 'claim' ? interaction.options.getString('bounty_id') : null;

        await interaction.reply({
            content: `💎 Bounty ${subcommand}${bountyId ? `: ${bountyId}` : ''}!\n` +
                     `Full integration coming soon. Use \`!bounty\` for now.`,
            ephemeral: subcommand === 'list'
        });
    });

    interactionRouter.registerSlashCommand('thinice', async (interaction) => {
        const targetUser = interaction.options.getUser('user') || interaction.user;

        await interaction.reply({
            content: `❄️ Thin Ice status for ${targetUser}!\n` +
                     `Full integration coming soon. Use \`!thinice\` for now.`,
            ephemeral: true
        });
    });

    console.log('✅ Slash Command Handler initialized');
    console.log('   Commands are registered and ready to use!');
    console.log('   Note: Full handler integration is a work in progress.');
    console.log('   For now, ! commands still provide full functionality.');
};
