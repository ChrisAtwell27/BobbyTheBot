const { Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');

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

const loggingChannelId = '1276266582234103808'; // Replace with your logging channel ID
const alertKeywords = ['ban', 'kick', 'trouble']; // Replace with the keywords you want to monitor
const alertChannelId = '1276267465227108455'; // Replace with your alert channel ID
const TRN_API_KEY = '61daadcd-0a0f-4002-bc32-208f055e12ad'; // Replace with your Tracker.gg API key

const roleMessageIds = {
  matchmaking: "1276256865092636784",
  smashBros: "1276256865092636784",
  valorant: "1276293355399151760",
  minecraft: "1276294247108182016",
  lethalcompany: "1276296159564005416",
  miscgames: "1276296976182411335",
  updates: "1276298066789535765"
};

const roleMappings = {
    'EggGold': '818839698306236487',
    'dancin': '768666021178638396',
    'jettCool': '1058201257338228757',
    'steveChairSpin': '701465918634459146',
    'diamond': '818840981293891675',
    'Bracken': '1190377213342777474',
    '🔥': '1021080456223019108',
    'pingsock': '701465164716703808'
  };
  

client.once("ready", () => {
  console.log("Role bot is online!");
});

client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;
  
    console.log("Added");
  
    // Log the emoji name to debug
    console.log(`Emoji used: ${reaction.emoji.name}`);
  
    const messageId = reaction.message.id;
    const emoji = reaction.emoji.name;
    const roleId = roleMappings[emoji];
  
    // Log both the roleMappings key and the matched roleId
    console.log(`Emoji Key: ${emoji}`);
    console.log(`Role ID found: ${roleId}`);
  
    if (roleId && Object.values(roleMessageIds).includes(messageId)) {
      try {
        const guild = reaction.message.guild;
        const member = await guild.members.fetch(user.id);
  
        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(roleId);
          console.log(`Added role ${roleId} to user ${user.username}`);
        } else {
          console.log(`User already has role: ${roleId}`);
        }
      } catch (error) {
        console.error("Failed to add role:", error);
      }
    } else if (!roleId) {
      console.log("No role ID found for emoji:", emoji);
    } else if (!Object.values(roleMessageIds).includes(messageId)) {
      console.log("No message ID found");
    }
  });
  

client.on("messageReactionRemove", async (reaction, user) => {
  if (user.bot) return;
  console.log("Remove");

  const messageId = reaction.message.id;
  const emoji = reaction.emoji.name;
  const roleId = roleMappings[emoji];

  if (roleId && Object.values(roleMessageIds).includes(messageId)) {
    try {
      const guild = reaction.message.guild;
      const member = await guild.members.fetch(user.id);

      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId);
        console.log(`Removed role ${roleId} from user ${user.username}`);
      }
    } catch (error) {
      console.error("Failed to remove role:", error);
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Check if the message starts with "!rank"
  if (message.content.startsWith('!rank')) {
      const args = message.content.split(' ');
      const valorantUsername = args[1];

      if (!valorantUsername) {
          return message.channel.send('Please provide a Valorant username. Usage: !rank {username#tag}');
      }

      try {
          const encodedUsername = encodeURIComponent(valorantUsername.replace('#', '%23'));
          const response = await axios.get(`https://api.tracker.gg/api/v2/valorant/standard/profile/riot/${encodedUsername}`, {
              headers: {
                  'TRN-Api-Key': TRN_API_KEY,
              },
          });

          const data = response.data.data;
          const rank = data.segments[0]?.stats?.rank?.metadata?.tierName || 'Rank not found';
          message.channel.send(`${valorantUsername}'s rank is: ${rank}`);
      } catch (error) {
          console.error('Error fetching rank:', error);
          message.channel.send(`Couldn't fetch rank for ${valorantUsername}. Make sure the username is correct and try again.`);
      }
  }
});


// Logging deleted messages
client.on('messageDelete', message => {
  if (!message.partial) { // Check if the message is not a partial
      const logChannel = client.channels.cache.get(loggingChannelId);
      if (logChannel) {
          logChannel.send(`# 🗑️ A message by ${message.author.tag} was deleted in ${message.channel.name}: "${message.content}"`);
      }
  }
});

// Logging edited messages
client.on('messageUpdate', (oldMessage, newMessage) => {
  if (!oldMessage.partial && !newMessage.partial && oldMessage.content !== newMessage.content) {
      const logChannel = client.channels.cache.get(loggingChannelId);
      if (logChannel) {
          logChannel.send(`# ✏️ A message by ${oldMessage.author.tag} was edited in ${oldMessage.channel.name}:\n**Before:** ${oldMessage.content}\n**After:** ${newMessage.content}`);
      }
  }
});

// Logging user bans
client.on('guildBanAdd', ban => {
  const logChannel = client.channels.cache.get(loggingChannelId);
  if (logChannel) {
      logChannel.send(`# ⛔ User ${ban.user.tag} was banned.`);
  }
});

// Logging user unbans
client.on('guildBanRemove', ban => {
  const logChannel = client.channels.cache.get(loggingChannelId);
  if (logChannel) {
      logChannel.send(`# ✅ User ${ban.user.tag} was unbanned.`);
  }
});

//Alerts
client.on('messageCreate', message => {
  if (message.author.bot) return; // Ignore bot messages

  const logChannel = client.channels.cache.get(loggingChannelId);
  const alertChannel = client.channels.cache.get(alertChannelId);

  // Check if the message contains any of the keywords
  const foundKeyword = alertKeywords.find(keyword => message.content.toLowerCase().includes(keyword.toLowerCase()));

  if (foundKeyword) {
      if (alertChannel) {
          alertChannel.send(`# 🚨 Alert: The keyword "${foundKeyword}" was mentioned by ${message.author.tag} in ${message.channel.name}:\n"${message.content}"`);
      }
  }
});

//Alerts
client.on('messageCreate', message => {
  if (message.author.bot) return; // Ignore bot messages

  const logChannel = client.channels.cache.get(loggingChannelId);
  const alertChannel = client.channels.cache.get(alertChannelId);
  const greets = ["Hi Bobby", "Hi Bobby!", "Hi Bobby.", "Hi Bobby?", "Hello Bobby"];

  // Check if the message contains any of the keywords
  const foundKeyword = greets.find(keyword => message.content.toLowerCase().includes(keyword.toLowerCase()));

  if (foundKeyword) {
    message.channel.send(`Hi ${message.author.tag} :D"`);
  }
});

client.login(
  "MTI3NjI0Nzg3NTA2MzUxMzA5OA.GZo-h9.o5p-dcWqjLyGsfz4Vhx6BFhSzKT9F_6LcXJEEM"
); // Replace with the new bot token after regenerating