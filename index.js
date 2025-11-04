const { Client, GatewayIntentBits, Partials } = require('discord.js');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Load environment variables
require('dotenv').config();

// Load configuration values
const { loggingChannelId, alertChannelId, alertKeywords } = require('./data/config');

// Initialize database connection
const { connectToDatabase } = require('./database/connection');
connectToDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
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
client.setMaxListeners(50); // or higher if needed

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
require('./events/mafiaHandler')(client);
require('./events/triviaHandler')(client);
// Initialize Valorant API handler separately to prevent conflicts
const valorantApiHandler = require('./events/valorantApiHandler');
valorantApiHandler.init(client);

// Create a simple HTTP server for health checks
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
        await setupVerificationChannel(guild);
    }
});

client.on('guildMemberAdd', async (member) => {
    await handleMemberJoin(member);
});

client.on('messageReactionAdd', async (reaction, user) => {
    await handleReactionAdd(reaction, user);
});

client.login(process.env.DISCORD_BOT_TOKEN);
