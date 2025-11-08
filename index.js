const { Client, GatewayIntentBits, Partials } = require('discord.js');
const http = require('http');

// Load environment variables
require('dotenv').config();

// Global error handlers
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  // Give time to log then exit
  setTimeout(() => process.exit(1), 1000);
});

// Load configuration values
const { loggingChannelId, alertChannelId, alertKeywords, changelogChannelId } = require('./data/config');

// Initialize database connection
const { connectToDatabase } = require('./database/connection');
connectToDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
  console.error('Bot will exit due to database connection failure');
  process.exit(1);
});

// Create the client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Increase max listeners to prevent warnings
client.setMaxListeners(process.env.MAX_EVENT_LISTENERS || 50);


// Import and initialize event handlers
require('./events/messageReactionHandler')(client);
require('./events/loggingHandler')(client, loggingChannelId);
require('./events/alertHandler')(client, alertKeywords, alertChannelId);
require('./events/thinIceHandler')(client);
require('./events/eggbuckHandler')(client);
require('./events/gamblingHandler')(client);
require('./events/blackjackHandler')(client);
require('./events/clipHandler')(client);
require('./events/valorantTeamHandler')(client);
require('./events/russianRouletteHandler')(client);
require('./events/gladiatorHandler')(client);
require('./events/pokerHandler')(client);
require('./events/virtualPetHandler')(client);
require('./events/helpHandler')(client);
require('./events/kothHandler')(client);
require('./events/moderationHandler')(client);
require('./events/boosterRoleHandler')(client);
require('./events/memberCountHandler')(client);
require('./events/askHandler')(client);
require('./events/valorantMapHandler')(client);
require('./events/bumpHandler')(client);
require('./events/birthdayHandler')(client);
require('./events/wordleHandler')(client);
require('./events/socialMediaPostHandler')(client);
require('./events/valorantInhouseHandler')(client);
const mafiaHandler = require('./events/mafiaHandler');
mafiaHandler(client);
require('./events/triviaHandler')(client);
require('./events/bountyHandler')(client);
require('./events/changelogHandler')(client, changelogChannelId);
// Initialize Valorant API handler separately to prevent conflicts
const valorantApiHandler = require('./events/valorantApiHandler');
valorantApiHandler.init(client);

// Initialize Mafia Webhook API server (replaces old health check server)
// The webhook API includes a /health endpoint, so we don't need a separate server
// START IMMEDIATELY for App Platform health checks (don't wait for Discord client)
let mafiaWebhookServer = null;
if (process.env.MAFIA_WEBHOOK_ENABLED !== 'false') {
  const MafiaWebhookServer = require('./api/mafiaWebhookServer');
  // Use PORT environment variable for App Platform compatibility
  const webhookPort = process.env.MAFIA_WEBHOOK_PORT || process.env.PORT || 3001;

  try {
    // Start webhook server immediately so App Platform health checks pass
    // The server will work for /health endpoint even before Discord client is ready
    // Game-specific endpoints will just return "no game found" until client connects
    mafiaWebhookServer = new MafiaWebhookServer(client, mafiaHandler.getActiveGames());
    mafiaWebhookServer.start(webhookPort);
    console.log('🚀 Mafia Webhook API starting (before Discord client ready for App Platform health checks)');
  } catch (error) {
    console.error('Failed to start Mafia Webhook API:', error);
  }
}

// Start the bot
const { setupVerificationChannel, handleMemberJoin, handleReactionAdd } = require('./verification');

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Log all servers the bot is in
    console.log('\n=== Servers this bot is in ===');
    for (const guild of client.guilds.cache.values()) {
        console.log(`- ${guild.name} (ID: ${guild.id}) - ${guild.memberCount} members`);
    }
    console.log('==============================\n');

    // Setup verification channels for all guilds
    for (const guild of client.guilds.cache.values()) {
        try {
            await setupVerificationChannel(guild);
        } catch (error) {
            console.error(`Failed to setup verification for guild ${guild.name}:`, error);
        }
    }
});

client.on('guildMemberAdd', async (member) => {
    try {
        await handleMemberJoin(member);
    } catch (error) {
        console.error('Error handling member join:', error);
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    try {
        await handleReactionAdd(reaction, user);
    } catch (error) {
        console.error('Error handling reaction add:', error);
    }
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(error => {
    console.error('Failed to login to Discord:', error);
    process.exit(1);
});
