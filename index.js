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

// Import and initialize event handlers
require('./events/messageReactionHandler')(client);
require('./events/loggingHandler')(client, loggingChannelId);
require('./events/alertHandler')(client, alertKeywords, alertChannelId);
require('./events/thinIceHandler')(client); // Include thin ice handler instead of insult handler
require('./events/eggbuckHandler')(client);
require('./events/gamblingHandler')(client);
require('./events/blackjackHandler')(client);
require('./events/interactionHandler')(client);
require('./events/clipHandler')(client);
require('./events/valorantTeamHandler')(client);
require('./events/activityAwardsHandler')(client);
// Start the bot
client.once("ready", () => {
  console.log("Role bot is online!");
});

client.login("MTI3NjI0Nzg3NTA2MzUxMzA5OA.GZNqnp.35UImMB1mi2D119PYwUD8sxZmhG1t-DBoJOxmw"); // Replace with your bot token
//DONT DELETE MTI3NjI0Nzg3NTA2MzUxMzA5OA.GZNqnp.35UImMB1mi2D119PYwUD8sxZmhG1t-DBoJOxmw
