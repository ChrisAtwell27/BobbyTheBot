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

// Create a simple HTTP server for health checks (App Platform requirement)
// This starts IMMEDIATELY so App Platform health checks pass
const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      botStatus: client.ws.status === 0 ? 'ready' : 'not ready',
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  } else {
    console.error('HTTP server error:', error);
  }
});

// Initialize Mafia Webhook API server on port 3001 (internal only)
let mafiaWebhookServer = null;
if (process.env.MAFIA_WEBHOOK_ENABLED !== 'false') {
  const MafiaWebhookServer = require('./api/mafiaWebhookServer');
  const webhookPort = process.env.MAFIA_WEBHOOK_PORT || 3001;

  // Wait for client to be ready before starting webhook server
  client.once('ready', () => {
    try {
      mafiaWebhookServer = new MafiaWebhookServer(client, mafiaHandler.getActiveGames());
      mafiaWebhookServer.start(webhookPort);
    } catch (error) {
      console.error('Failed to start Mafia Webhook API:', error);
    }
  });
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
