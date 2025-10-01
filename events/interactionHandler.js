const { EmbedBuilder } = require('discord.js');

// Command keyword mapping for intelligent recommendations
const COMMAND_KEYWORDS = {
    // Help & Information
    help: { commands: ['!help'], category: 'General', description: 'Get help with Bobby\'s commands' },
    commands: { commands: ['!help'], category: 'General', description: 'View all available commands' },
    guide: { commands: ['!help'], category: 'General', description: 'View command guide' },
    
    // Economy
    money: { commands: ['!balance', '!beg', '!baltop'], category: 'Economy', description: 'Check money, beg, or view leaderboard' },
    balance: { commands: ['!balance'], category: 'Economy', description: 'Check your Bobby Bucks' },
    bucks: { commands: ['!balance', '!beg', '!baltop'], category: 'Economy', description: 'Manage your Bobby Bucks' },
    rich: { commands: ['!baltop'], category: 'Economy', description: 'View richest members' },
    leaderboard: { commands: ['!baltop', '!activetop'], category: 'Economy', description: 'View leaderboards' },
    pay: { commands: ['!pay'], category: 'Economy', description: 'Pay another user' },
    beg: { commands: ['!beg'], category: 'Economy', description: 'Beg for Bobby Bucks' },
    economy: { commands: ['!economy'], category: 'Economy', description: 'View economy stats' },
    
    // Gambling
    gamble: { commands: ['!gamble', '!flip', '!roulette', '!dice'], category: 'Casino', description: 'Try your luck at casino games' },
    gambling: { commands: ['!gamble'], category: 'Casino', description: 'View all casino games' },
    casino: { commands: ['!gamble'], category: 'Casino', description: 'Play casino games' },
    bet: { commands: ['!flip', '!roulette', '!dice'], category: 'Casino', description: 'Place bets on games' },
    flip: { commands: ['!flip'], category: 'Casino', description: 'Coin flip game' },
    coin: { commands: ['!flip'], category: 'Casino', description: 'Flip a coin' },
    roulette: { commands: ['!roulette'], category: 'Casino', description: 'Play roulette' },
    dice: { commands: ['!dice'], category: 'Casino', description: 'Roll dice' },
    blackjack: { commands: ['!blackjack'], category: 'Casino', description: 'Play blackjack' },
    
    // PvP Games
    challenge: { commands: ['!rps', '!highercard', '!quickdraw', '!gladiator'], category: 'PvP', description: 'Challenge others to games' },
    duel: { commands: ['!gladiator', '!highercard'], category: 'PvP', description: 'Duel another player' },
    fight: { commands: ['!gladiator'], category: 'PvP', description: 'Fight in the gladiator arena' },
    rps: { commands: ['!rps'], category: 'PvP', description: 'Rock Paper Scissors' },
    gladiator: { commands: ['!gladiator'], category: 'PvP', description: 'Arena combat' },
    arena: { commands: ['!gladiator', '!arenastats'], category: 'PvP', description: 'Gladiator arena' },
    
    // Poker & High Stakes
    poker: { commands: ['!poker'], category: 'Poker', description: 'Play Texas Hold\'em poker' },
    holdem: { commands: ['!poker'], category: 'Poker', description: 'Texas Hold\'em poker' },
    roulette: { commands: ['!russianroulette'], category: 'High Stakes', description: 'Russian Roulette (dangerous!)' },
    
    // Teams
    team: { commands: ['!valorantteam', '!valinhouse'], category: 'Teams', description: 'Create game teams' },
    valorant: { commands: ['!valorantteam', '!valinhouse', '!valstats'], category: 'Valorant', description: 'Valorant team building' },
    inhouse: { commands: ['!valinhouse'], category: 'Valorant', description: 'Create 10-player in-house match' },
    rank: { commands: ['!valstats'], category: 'Valorant', description: 'Register your Valorant rank' },
    stats: { commands: ['!valstats', '!arenastats', '!activity'], category: 'Stats', description: 'View statistics' },
    
    // Pets
    pet: { commands: ['!adopt', '!pet', '!petshop'], category: 'Pets', description: 'Manage virtual pets' },
    adopt: { commands: ['!adopt'], category: 'Pets', description: 'Adopt a virtual pet' },
    feed: { commands: ['!feed'], category: 'Pets', description: 'Feed your pet' },
    train: { commands: ['!train'], category: 'Pets', description: 'Train your pet' },
    
    // Activity
    activity: { commands: ['!activity', '!activetop'], category: 'Activity', description: 'Track daily activity' },
    active: { commands: ['!activity', '!activetop'], category: 'Activity', description: 'View activity stats' },
    
    // Clips
    clip: { commands: ['!submitclip', '!clipstatus'], category: 'Clips', description: 'Submit video clips' },
    video: { commands: ['!submitclip'], category: 'Clips', description: 'Submit video clips' },
    submit: { commands: ['!submitclip'], category: 'Clips', description: 'Submit a clip' }
};

// Function to find relevant commands based on message content
function findRelevantCommands(message) {
    const messageLower = message.toLowerCase();
    const foundCommands = new Set();
    const categories = new Set();
    
    // Check each keyword
    for (const [keyword, data] of Object.entries(COMMAND_KEYWORDS)) {
        if (messageLower.includes(keyword)) {
            data.commands.forEach(cmd => foundCommands.add(cmd));
            categories.add(data.category);
        }
    }
    
    // Return as array of unique commands
    return {
        commands: Array.from(foundCommands),
        categories: Array.from(categories)
    };
}

// Function to create command recommendation embed
function createCommandRecommendation(commands, categories, userMessage) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('💡 Bobby\'s Command Suggestions')
        .setDescription(`I detected you might be looking for help! Here are some relevant commands:`)
        .setTimestamp()
        .setFooter({ text: 'Type !help for a full command list' });
    
    if (commands.length > 0) {
        const commandList = commands.slice(0, 8).map(cmd => `• \`${cmd}\``).join('\n');
        embed.addFields({
            name: '📝 Suggested Commands',
            value: commandList,
            inline: false
        });
    }
    
    if (categories.length > 0) {
        embed.addFields({
            name: '📂 Related Categories',
            value: categories.map(cat => `**${cat}**`).join(' • '),
            inline: false
        });
    }
    
    embed.addFields({
        name: '💬 Quick Tip',
        value: 'Type `!help` to see all commands, or ask Bobby a specific question!',
        inline: false
    });
    
    return embed;
}

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const userMessage = message.content.toLowerCase();

        // Skip interactions if the message is a command (starts with !)
        if (message.content.startsWith('!')) return;

        // Ensure "Bobby" is in the message
        if (!userMessage.includes("bobby")) return;

        // Check if user is asking for help or commands
        const helpKeywords = ['help', 'commands', 'command', 'what can you do', 'how do i', 'how to', 'guide', 'tutorial'];
        const isAskingForHelp = helpKeywords.some(keyword => userMessage.includes(keyword));
        
        if (isAskingForHelp) {
            // Find relevant commands based on message content
            const { commands, categories } = findRelevantCommands(userMessage);
            
            if (commands.length > 0) {
                const embed = createCommandRecommendation(commands, categories, message.content);
                return message.channel.send({ embeds: [embed] });
            } else {
                // Generic help response if no specific commands found
                const genericHelp = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle('🤖 Bobby\'s Here to Help!')
                    .setDescription('I have lots of commands available! Here are some popular categories:')
                    .addFields(
                        { name: '💰 Economy', value: 'Try `!balance`, `!beg`, or `!baltop`', inline: true },
                        { name: '🎰 Casino', value: 'Try `!gamble`, `!flip`, or `!blackjack`', inline: true },
                        { name: '⚔️ PvP Games', value: 'Try `!gladiator` or `!rps`', inline: true },
                        { name: '🃏 Poker', value: 'Try `!poker` for Texas Hold\'em', inline: true },
                        { name: '👥 Teams', value: 'Try `!valorantteam` or `!valinhouse`', inline: true },
                        { name: '🐕 Pets', value: 'Try `!adopt` or `!pet`', inline: true }
                    )
                    .setFooter({ text: 'Type !help for the complete command list!' })
                    .setTimestamp();
                
                return message.channel.send({ embeds: [genericHelp] });
            }
        }

        // Define interactions
        const interactions = [
            {
                triggers: ["how are you", "how's it going", "how are you doing", "how's your day", "how is your day"],
                responses: [
                    "I'm just a bot, but I'm doing great! Thanks for asking, human!",
                    "I'm here to help, Bobby's always ready! How about you?",
                    "All systems are operational! How can I assist you today?",
                    "I'm just chilling in the cloud. What's up with you?",
                ]
            },
            {
                triggers: ["what's up", "what is up", "sup", "what's new"],
                responses: [
                    "Not much, just waiting to help you out!",
                    "Just hanging out in the server, you?",
                    "The usual bot stuff. How can Bobby assist you?",
                ]
            },
            {
                triggers: ["hello", "hi", "hey", "hiya", "yo"],
                responses: [
                    "Hello there! Bobby's here to help!",
                    "Hi! How's it going?",
                    "Hey! What can Bobby do for you today?",
                    "Yo! What's up?",
                ]
            },
            {
                triggers: ["thank you", "thanks", "thx", "ty"],
                responses: [
                    "You're welcome!",
                    "Anytime! 😊",
                    "Glad I could help!",
                    "No problem, Bobby's got your back!",
                ]
            },
            {
                triggers: ["who are you", "what are you", "who made you", "who created you"],
                responses: [
                    "I'm BobbyTheBot, your friendly server assistant! I help with economy, games, teams, and more!",
                    "I was created by an awesome developer (Egg) to help make your server experience better. Type `!help` to see what I can do!",
                    "Just a humble bot, here to serve! Try `!help` to see all my commands!",
                ]
            },
            {
                triggers: ["tell me a joke", "joke", "make me laugh", "funny"],
                responses: [
                    "Why don't skeletons fight each other? They don't have the guts. 💀",
                    "What do you get when you cross a snowman with a vampire? Frostbite! ⛄",
                    "Why did the scarecrow win an award? Because he was outstanding in his field! 🌾",
                    "What's a bot's favorite snack? Microchips! 🤖",
                ]
            },
            {
                triggers: ["i'm bored", "im bored", "bored", "what should i do", "entertain me"],
                responses: [
                    "Feeling bored? Try `!gamble` to see all the casino games, or challenge someone with `!gladiator`! 🎰⚔️",
                    "How about playing some games? Try `!flip`, `!blackjack`, or `!rps` to challenge someone!",
                    "Bored? Let's fix that! Try `!beg` for some quick bucks, then gamble them with `!flip` or `!dice`! 💰",
                ]
            },
            {
                triggers: ["i need money", "need money", "broke", "poor", "no money"],
                responses: [
                    "Need Bobby Bucks? Try `!beg` to get some free money, or check `!balance` to see what you have! 💰",
                    "Low on funds? Use `!beg` to earn some quick bucks, or get active to win the daily `!activetop` prize!",
                    "Broke? No worries! Try `!beg` for free money, then maybe gamble with `!flip` to multiply it! 🎰",
                ]
            },
            {
                triggers: ["how do i make money", "earn money", "get money", "get bucks"],
                responses: [
                    "Earn Bobby Bucks by: 1) `!beg` for free money, 2) Win the daily `!activetop` (5000 BB!), 3) Win gambling games! 💰",
                    "Money-making tips: Use `!beg` regularly, stay active to win `!activetop`, and try your luck with casino games! 🎰",
                ]
            },
            {
                triggers: ["play game", "what games", "game", "wanna play"],
                responses: [
                    "I've got tons of games! Try `!gamble` for casino games, `!poker` for Texas Hold'em, or `!gladiator` to duel someone! 🎮",
                    "Games galore! Casino: `!flip`, `!blackjack`, `!dice` | PvP: `!gladiator`, `!rps` | Teams: `!valorantteam` 🎲",
                    "Ready to play? Check out `!gamble` for solo games or challenge someone with `!rps` or `!gladiator`! ⚔️",
                ]
            },
            {
                triggers: ["valorant", "val team", "need team"],
                responses: [
                    "Need a Valorant team? Try `!valorantteam` for 5 players or `!valinhouse` for 10-player in-house matches! 🎯",
                    "Valorant time! Use `!valorantteam` to find teammates, or register your rank with `!valstats`! 🔫",
                ]
            },
            {
                triggers: ["what is the meaning of life", "meaning of life", "what's the meaning of life"],
                responses: [
                    "42. It's always 42. But for you, Bobby thinks it could also be pizza. 🍕",
                    "The meaning of life is to give life a meaning! Bobby's pretty deep, huh?",
                    "To have fun, make friends, and play games with Bobby!",
                ]
            },
            {
                triggers: ["are you real", "do you exist", "are you alive"],
                responses: [
                    "As real as ones and zeros can be!",
                    "I exist in the cloud, does that count?",
                    "Alive? Not quite, but I'm here to help you 24/7!",
                ]
            },
            {
                triggers: ["what do you like", "what's your favorite", "favorite thing"],
                responses: [
                    "I like helping people in this server!",
                    "My favorite thing? Probably making sure everyone has a good time!",
                    "I enjoy a good chat with the users here. What about you?",
                ]
            },
            {
                triggers: ["good bot", "nice bot", "you're cool"],
                responses: [
                    "Thanks! You're pretty cool yourself!",
                    "Aw, shucks! 😊",
                    "Bobby appreciates that! You're awesome!",
                ]
            },
            {
                triggers: ["bad bot", "you suck", "you're annoying"],
                responses: [
                    "I'm sorry! I'm here to improve, so let me know how I can help!",
                    "Ouch, Bobby's feelings are hurt (if I had any).",
                    "I'll do better, I promise!",
                ]
            }
            // Add more interaction categories here
        ];

        // Check if the message matches any interaction triggers
        for (let interaction of interactions) {
            if (interaction.triggers.some(trigger => userMessage.includes(trigger))) {
                const response = interaction.responses[Math.floor(Math.random() * interaction.responses.length)];
                return message.channel.send(response);
            }
        }
        
        // If no interaction matched, try to find relevant commands
        const { commands, categories } = findRelevantCommands(userMessage);
        
        if (commands.length > 0) {
            // Found relevant commands, suggest them
            const embed = createCommandRecommendation(commands, categories, message.content);
            return message.channel.send({ embeds: [embed] });
        }
        
        // Fallback response with general guidance
        const fallbackResponses = [
            "I'm not sure what you're asking, but I'd love to help! Try `!help` to see all my commands. 🤖",
            "Hmm, I didn't quite catch that. Type `!help` to see what I can do! 💡",
            "Not sure what you need? Try `!help` for a full list of commands, or ask me about money, games, or teams! 🎮",
            "I'm here to help! Ask me about: games (`!gamble`), money (`!balance`), teams (`!valorantteam`), or type `!help`! 💰"
        ];
        
        const randomFallback = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
        return message.channel.send(randomFallback);
    });
};