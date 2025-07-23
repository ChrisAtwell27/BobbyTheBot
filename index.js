const { Client, GatewayIntentBits, Partials } = require('discord.js');
const path = require('path');
const fs = require('fs');

// Load configuration values
const { loggingChannelId, alertChannelId, alertKeywords } = require('./data/config');

// Create the client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Increase max listeners to prevent warnings
client.setMaxListeners(25);

// Import and initialize event handlers
require('./events/messageReactionHandler')(client);
require('./events/loggingHandler')(client, loggingChannelId);
require('./events/alertHandler')(client, alertKeywords, alertChannelId);
require('./events/thinIceHandler')(client);
require('./events/eggbuckHandler')(client);
require('./events/gamblingHandler')(client);
require('./events/blackjackHandler')(client);
require('./events/interactionHandler')(client);
require('./events/clipHandler')(client);
require('./events/valorantTeamHandler')(client);
require('./events/activityAwardsHandler')(client);
require('./events/russianRouletteHandler')(client);
require('./events/gladiatorHandler')(client);
require('./events/pokerHandler')(client);
require('./events/repoTeamHandler')(client);
require('./events/virtualPetHandler')(client);
require('./events/helpHandler')(client);
require('./events/kothHandler')(client);
require('./events/moderationHandler')(client);
require('./events/boosterRoleHandler')(client);
require('./events/memberCountHandler')(client);
require('./events/levelingHandler')(client);
require('./events/discordEventHandler')(client);
// Initialize Valorant API handler separately to prevent conflicts
const valorantApiHandler = require('./events/valorantApiHandler');
valorantApiHandler.init(client);

// Start the bot
client.once("ready", () => {
  console.log("Role bot is online!");
});

client.login("MTI3NjI0Nzg3NTA2MzUxMzA5OA.GZNqnp.35UImMB1mi2D119PYwUD8sxZmhG1t-DBoJOxmw"); // Replace with your bot token
//DONT DELETE MTI3NjI0Nzg3NTA2MzUxMzA5OA.GZNqnp.35UImMB1mi2D119PYwUD8sxZmhG1t-DBoJOxmw
