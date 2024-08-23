const { Client, GatewayIntentBits, Partials } = require('discord.js');
const path = require('path');
const fs = require('fs');

// Create the client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Load configuration values
const loggingChannelId = '1276266582234103808'; // Replace with your logging channel ID
const alertKeywords = ['ban', 'kick', 'trouble']; // Replace with the keywords you want to monitor
const alertChannelId = '1276267465227108455'; // Replace with your alert channel ID

// Import and initialize event handlers
require('./events/messageReactionHandler')(client);
require('./events/loggingHandler')(client, loggingChannelId);
require('./events/alertHandler')(client, alertKeywords, alertChannelId);
require('./events/thinIceHandler')(client); // Include thin ice handler instead of insult handler

// Start the bot
client.once("ready", () => {
  console.log("Role bot is online!");
});

client.login("MTI3NjI0Nzg3NTA2MzUxMzA5OA.GZo-h9.o5p-dcWqjLyGsfz4Vhx6BFhSzKT9F_6LcXJEEM"); // Replace with your bot token
