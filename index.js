const { Client, GatewayIntentBits, Partials } = require("discord.js");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction], // Enable partials
});

const roleMessageIds = {
  matchmaking: "1276256865092636784",
  smashBros: "1276256865092636784",
};

const roleMappings = {
    'EggGold': '818839698306236487',
    'dancin': '768666021178638396', // Standard Emoji
    '<:dancin:757956869271584838>': '768666021178638396', // Custom Emoji
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

client.login(
  "MTI3NjI0Nzg3NTA2MzUxMzA5OA.GZo-h9.o5p-dcWqjLyGsfz4Vhx6BFhSzKT9F_6LcXJEEM"
); // Replace with the new bot token after regenerating
