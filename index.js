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
const badWords = ['4r5e', '5h1t', '5hit', 'a55', 'anal', 'anus', 'ar5e', 'arrse', 'arse', 'ass', 'ass-fucker', 'asses', 'assfucker', 'assfukka', 'asshole', 'assholes', 'asswhole', 'a_s_s', 'b!tch', 'b00bs', 'b17ch', 'b1tch', 'ballbag', 'balls', 'ballsack', 'bastard', 'beastial', 'beastiality', 'bellend', 'bestial', 'bestiality', 'bi+ch', 'biatch', 'bitch', 'bitcher', 'bitchers', 'bitches', 'bitchin', 'bitching', 'bloody', 'blow job', 'blowjob', 'blowjobs', 'boiolas', 'bollock', 'bollok', 'boner', 'boob', 'boobs', 'booobs', 'boooobs', 'booooobs', 'booooooobs', 'breasts', 'buceta', 'bugger', 'bum', 'bunny fucker', 'butt', 'butthole', 'buttmuch', 'buttplug', 'c0ck', 'c0cksucker', 'carpet muncher', 'cawk', 'chink', 'cipa', 'cl1t', 'clit', 'clitoris', 'clits', 'cnut', 'cock', 'cock-sucker', 'cockface', 'cockhead', 'cockmunch', 'cockmuncher', 'cocks', 'cocksuck', 'cocksucked', 'cocksucker', 'cocksucking', 'cocksucks', 'cocksuka', 'cocksukka', 'cok', 'cokmuncher', 'coksucka', 'coon', 'cox', 'crap', 'cum', 'cummer', 'cumming', 'cums', 'cumshot', 'cunilingus', 'cunillingus', 'cunnilingus', 'cunt', 'cuntlick', 'cuntlicker', 'cuntlicking', 'cunts', 'cyalis', 'cyberfuc', 'cyberfuck', 'cyberfucked', 'cyberfucker', 'cyberfuckers', 'cyberfucking', 'd1ck', 'damn', 'dick', 'dickhead', 'dildo', 'dildos', 'dink', 'dinks', 'dirsa', 'dlck', 'dog-fucker', 'doggin', 'dogging', 'donkeyribber', 'doosh', 'duche', 'dyke', 'ejaculate', 'ejaculated', 'ejaculates', 'ejaculating', 'ejaculatings', 'ejaculation', 'ejakulate', 'f u c k', 'f u c k e r', 'f4nny', 'fag', 'fagging', 'faggitt', 'faggot', 'faggs', 'fagot', 'fagots', 'fags', 'fanny', 'fannyflaps', 'fannyfucker', 'fanyy', 'fatass', 'fcuk', 'fcuker', 'fcuking', 'feck', 'fecker', 'felching', 'fellate', 'fellatio', 'fingerfuck', 'fingerfucked', 'fingerfucker', 'fingerfuckers', 'fingerfucking', 'fingerfucks', 'fistfuck', 'fistfucked', 'fistfucker', 'fistfuckers', 'fistfucking', 'fistfuckings', 'fistfucks', 'flange', 'fook', 'fooker', 'fuck', 'fucka', 'fucked', 'fucker', 'fuckers', 'fuckhead', 'fuckheads', 'fuckin', 'fucking', 'fuckings', 'fuckingshitmotherfucker', 'fuckme', 'fucks', 'fuckwhit', 'fuckwit', 'fudge packer', 'fudgepacker', 'fuk', 'fuker', 'fukker', 'fukkin', 'fuks', 'fukwhit', 'fukwit', 'fux', 'fux0r', 'f_u_c_k', 'gangbang', 'gangbanged', 'gangbangs', 'gaylord', 'gaysex', 'goatse', 'god-dam', 'god-damned', 'goddamn', 'goddamned', 'hardcoresex', 'hell', 'heshe', 'hoar', 'hoare', 'hoer', 'homo', 'hore', 'horniest', 'horny', 'hotsex', 'jack-off', 'jackoff', 'jap', 'jerk-off', 'jism', 'jiz', 'jizm', 'jizz', 'kawk', 'knob', 'knobead', 'knobed', 'knobend', 'knobhead', 'knobjocky', 'knobjokey', 'kock', 'kondum', 'kondums', 'kum', 'kummer', 'kumming', 'kums', 'kunilingus', 'l3i+ch', 'l3itch', 'labia', 'lmfao', 'lust', 'lusting', 'm0f0', 'm0fo', 'm45terbate', 'ma5terb8', 'ma5terbate', 'masochist', 'master-bate', 'masterb8', 'masterbat*', 'masterbat3', 'masterbate', 'masterbation', 'masterbations', 'masturbate', 'mo-fo', 'mof0', 'mofo', 'mothafuck', 'mothafucka', 'mothafuckas', 'mothafuckaz', 'mothafucked', 'mothafucker', 'mothafuckers', 'mothafuckin', 'mothafucking', 'mothafuckings', 'mothafucks', 'mother fucker', 'motherfuck', 'motherfucked', 'motherfucker', 'motherfuckers', 'motherfuckin', 'motherfucking', 'motherfuckings', 'motherfuckka', 'motherfucks', 'muff', 'mutha', 'muthafecker', 'muthafuckker', 'muther', 'mutherfucker', 'n1gga', 'n1gger', 'nazi', 'nigg3r', 'nigg4h', 'nigga', 'niggah', 'niggas', 'niggaz', 'nigger', 'niggers', 'nob', 'nob jokey', 'nobhead', 'nobjocky', 'nobjokey', 'numbnuts', 'nutsack', 'orgasim', 'orgasims', 'orgasm', 'orgasms', 'p0rn', 'pawn', 'pecker', 'penis', 'penisfucker', 'phonesex', 'phuck', 'phuk', 'phuked', 'phuking', 'phukked', 'phukking', 'phuks', 'phuq', 'pigfucker', 'pimpis', 'piss', 'pissed', 'pisser', 'pissers', 'pisses', 'pissflaps', 'pissin', 'pissing', 'pissoff', 'poop', 'porn', 'porno', 'pornography', 'pornos', 'prick', 'pricks', 'pron', 'pube', 'pusse', 'pussi', 'pussies', 'pussy', 'pussys', 'rectum', 'retard', 'rimjaw', 'rimming', 's hit', 's.o.b.', 'sadist', 'schlong', 'screwing', 'scroat', 'scrote', 'scrotum', 'semen', 'sex', 'sh!+', 'sh!t', 'sh1t', 'shag', 'shagger', 'shaggin', 'shagging', 'shemale', 'shi+', 'shit', 'shitdick', 'shite', 'shited', 'shitey', 'shitfuck', 'shitfull', 'shithead', 'shiting', 'shitings', 'shits', 'shitted', 'shitter', 'shitters', 'shitting', 'shittings', 'shitty', 'skank', 'slut', 'sluts', 'smegma', 'smut', 'snatch', 'son-of-a-bitch', 'spac', 'spunk', 's_h_i_t', 't1tt1e5', 't1tties', 'teets', 'teez', 'testical', 'testicle', 'tit', 'titfuck', 'tits', 'titt', 'tittie5', 'tittiefucker', 'titties', 'tittyfuck', 'tittywank', 'titwank', 'tosser', 'turd', 'tw4t', 'twat', 'twathead', 'twatty', 'twunt', 'twunter', 'v14gra', 'v1gra', 'vagina', 'viagra', 'vulva', 'w00se', 'wang', 'wank', 'wanker', 'wanky', 'whoar', 'whore', 'willies', 'xrated', 'xxx']; // Add your list of bad words here
const alertChannelId = '1276267465227108455'; // Replace with your alert channel ID
//const TRN_API_KEY = '61daadcd-0a0f-4002-bc32-208f055e12ad'; // Replace with your Tracker.gg API key

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


//Insulting Bobby

client.on('messageCreate', async message => {
  if (message.author.bot) return; // Ignore bot messages

  const messageContent = message.content.toLowerCase();
  const containsBobby = messageContent.includes('bobby');
  const containsBadWord = badWords.some(word => messageContent.includes(word));

  if (containsBobby && containsBadWord) {
      try {
          // Timeout the user for 1 minute (60000 milliseconds)
          const timeoutDuration = 60000;
          await message.member.timeout(timeoutDuration, 'Disrespecting Bobby');
          
          // Send a message to the channel
          await message.channel.send(`Anyone who disrespects Bobby deserves punishment... You're not excluded ${message.author}.`);
      } catch (error) {
          console.error('Failed to timeout the user:', error);
      }
  }
});

client.login(
  "MTI3NjI0Nzg3NTA2MzUxMzA5OA.GZo-h9.o5p-dcWqjLyGsfz4Vhx6BFhSzKT9F_6LcXJEEM"
); // Replace with the new bot token after regenerating