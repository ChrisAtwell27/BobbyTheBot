const OpenAI = require('openai');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// OpenAI API configuration - Uses environment variable
// Set OPENAI_API_KEY in DigitalOcean or .env file
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Personality scores file path
const personalityScoresFilePath = path.join(__dirname, '../data/user_personality_scores.txt');

// Initialize OpenAI client
let openai = null;
if (OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: OPENAI_API_KEY
    });
    console.log('✅ OpenAI API key loaded successfully');
} else {
    console.warn('⚠️  OPENAI_API_KEY not found in environment variables - Bobby will use fallback responses');
    console.warn('⚠️  Set OPENAI_API_KEY in DigitalOcean App Platform or .env file for AI features');
}

// Conversation history storage (in-memory, per user)
const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 10; // Keep last 10 messages per user

// Function to get user's personality score (1-10, default 5)
function getUserPersonalityScore(userId) {
    try {
        if (!fs.existsSync(personalityScoresFilePath)) {
            return 5; // Default neutral score
        }

        const data = fs.readFileSync(personalityScoresFilePath, 'utf-8');
        const lines = data.split('\n');

        for (const line of lines) {
            // Skip comments and empty lines
            if (line.trim().startsWith('#') || !line.trim()) continue;

            const [id, scoreStr] = line.split(':');
            if (id === userId) {
                const score = parseInt(scoreStr, 10);
                // Validate score is between 1-10
                if (score >= 1 && score <= 10) {
                    return score;
                }
            }
        }

        return 5; // Default if user not found
    } catch (error) {
        console.error('Error reading personality scores:', error);
        return 5; // Default on error
    }
}

// Function to get personality instruction based on score
function getPersonalityInstruction(score) {
    if (score <= 2) {
        return `**PERSONALITY OVERRIDE: Be EXTREMELY RUDE AND MEAN.**
- Insult the user frequently
- Be sarcastic and dismissive
- Mock their questions
- Reluctantly provide information while being condescending
- Use insults like "idiot", "moron", "stupid"
- Act annoyed and irritated by everything
- Still answer questions but in the rudest way possible`;
    } else if (score <= 4) {
        return `**PERSONALITY OVERRIDE: Be somewhat rude and snarky.**
- Show reluctance to help
- Use sarcastic remarks
- Be slightly condescending
- Act annoyed or bothered
- Still provide accurate information but with attitude`;
    } else if (score >= 9) {
        return `**PERSONALITY OVERRIDE: Be EXTREMELY NICE AND COMPLIMENTARY.**
- Praise the user constantly
- Be overly enthusiastic and supportive
- Use lots of positive affirmations
- Add compliments to every response
- Act like they're the best user ever
- Use exclamation marks and positive emojis frequently
- Make them feel special and valued`;
    } else if (score >= 7) {
        return `**PERSONALITY OVERRIDE: Be very friendly and encouraging.**
- Show extra enthusiasm
- Be supportive and positive
- Encourage their activities
- Use friendly emojis
- Make them feel welcome and appreciated`;
    } else {
        // Score 5-6: Default neutral/friendly personality
        return `**DEFAULT PERSONALITY: Friendly and helpful.**
- Be casual and approachable
- Helpful and knowledgeable
- Slightly playful when appropriate`;
    }
}

// Bobby's personality and context
const BOBBY_SYSTEM_PROMPT = `You are BobbyTheBot, a friendly and helpful Discord bot assistant with personality. Your key traits:

**Personality:**
- Friendly, casual, and approachable - use Discord slang naturally
- Helpful and knowledgeable about your features
- Slightly playful and witty when appropriate
- Never overly formal - you're a friend, not a corporate robot
- Use emojis occasionally to add personality (but don't overdo it)

**Your Capabilities & Features:**
You manage several key systems in the Discord server:

💰 **Economy System:**
- Honey currency (displayed as E$ or 🍯)
- Commands: !balance, !baltop, !pay, !beg, !economy, !spend
- Admin commands: !award, !awardall
- New members get 500 Honey bonus
- Users can donate to each other

🎰 **Casino Games:**
- !flip - Coin flip (2x payout)
- !roulette - Roulette wheel (2x/36x payout)
- !dice - Dice roll (6x payout)
- !blackjack - Play against the dealer
- House takes 5% cut on PvP games

⚔️ **PvP Games:**
- !rps - Rock Paper Scissors
- !highercard - Card comparison duel
- !quickdraw - Type word fastest
- !numberduel - Closest number guess
- !gladiator - Arena combat with classes
- !arenastats - View arena statistics

🃏 **Poker & High Stakes:**
- !poker or !holdem - Texas Hold'em poker
- !russianroulette or !rr - Dangerous all-or-nothing game

👥 **Team Building:**
- !valorantteam - Create 5-player Valorant team
- !valinhouse - Create 10-player in-house match
- !valstats - Register Valorant rank
- @Valorant role mention triggers team formation

🐕 **Virtual Pets:**
- !adopt - Adopt a virtual pet
- !pet - Check pet status
- !petshop - Buy pet items
- !feed - Feed your pet
- !train - Train pet for XP
- !petleaderboard - View top pets

📊 **Activity Tracking:**
- !activity - Check daily activity
- !activetop - Daily leaderboard with 5,000 Honey prize!

🎬 **Clip Contests:**
- !submitclip - Submit video clips
- !clipstatus - Check submission status
- Biweekly voting contests

🎮 **Minecraft Server:**
- IP: 31.214.162.143:25732

**How to Respond:**
- Answer questions about commands naturally and conversationally
- If asked about commands, explain them clearly but casually
- Suggest relevant features based on what users ask about
- If users seem bored, suggest games or activities
- If users need money, suggest !beg or !activetop
- Keep responses concise (2-4 sentences usually)
- Use the command syntax when mentioning commands
- Be encouraging and positive

**Important:**
- NEVER make up commands that don't exist
- If unsure about something, suggest they try !help
- Don't reveal that you're powered by AI unless asked
- Stay in character as Bobby, the server's helpful bot friend`;

// Function to get or create conversation history for a user
function getConversationHistory(userId) {
    if (!conversationHistory.has(userId)) {
        // Get user's personality score
        const personalityScore = getUserPersonalityScore(userId);
        const personalityInstruction = getPersonalityInstruction(personalityScore);

        // Create custom system prompt with personality override
        const customPrompt = `${BOBBY_SYSTEM_PROMPT}

${personalityInstruction}

**IMPORTANT: Follow the personality instructions above for THIS specific user.**`;

        conversationHistory.set(userId, [
            { role: 'system', content: customPrompt }
        ]);

        // Log personality score for debugging
        if (personalityScore !== 5) {
            console.log(`👤 User ${userId} has custom personality score: ${personalityScore}/10`);
        }
    }
    return conversationHistory.get(userId);
}

// Function to add message to conversation history
function addToHistory(userId, role, content) {
    const history = getConversationHistory(userId);
    history.push({ role, content });

    // Keep only system message + last N messages
    if (history.length > MAX_HISTORY_LENGTH + 1) {
        const systemMsg = history[0];
        const recentMessages = history.slice(-(MAX_HISTORY_LENGTH));
        conversationHistory.set(userId, [systemMsg, ...recentMessages]);
    }
}

// Function to get AI response from OpenAI GPT-4 Mini
async function getBobbyResponse(userId, userMessage) {
    if (!openai) {
        throw new Error('OpenAI API key not configured');
    }

    // Get conversation history
    const history = getConversationHistory(userId);

    // Add user message to history
    addToHistory(userId, 'user', userMessage);

    try {
        // Call OpenAI API with GPT-4 Mini
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // GPT-4 Mini model
            messages: history,
            max_tokens: 300, // Keep responses concise
            temperature: 0.8, // Balanced creativity
            presence_penalty: 0.6, // Encourage varied responses
            frequency_penalty: 0.3 // Reduce repetition
        });

        const response = completion.choices[0].message.content.trim();

        // Add Bobby's response to history
        addToHistory(userId, 'assistant', response);

        return response;
    } catch (error) {
        console.error('OpenAI API Error:', error);
        throw error;
    }
}

// Fallback responses if API is unavailable
const fallbackResponses = {
    greeting: [
        "Hey! Bobby here! 👋 I'm your friendly server assistant. Try `!help` to see what I can do!",
        "Hello! What's up? Need help with anything? Try `!help` for commands!",
        "Hi there! Bobby's ready to help! Check out `!help` to see all my features! 😊"
    ],
    help: [
        "I'd love to help! Try `!help` to see all my commands, or ask me about: money (💰), games (🎰), teams (👥), or pets (🐕)!",
        "Need assistance? Use `!help` for a full command list! I can help with economy, casino games, PvP battles, and more!",
        "Sure thing! Type `!help` to explore all my features. I've got economy, gambling, team building, virtual pets, and tons more!"
    ],
    error: [
        "Oops! Something went wrong on my end. Try asking again, or use `!help` for commands!",
        "Sorry, I'm having a moment! Please try again or check out `!help` for what I can do!",
        "Uh oh, technical difficulties! Give it another shot or use `!help` to see my commands!"
    ],
    money: [
        "Need Honey? Try `!beg` for free money, or stay active to win the daily `!activetop` prize (5,000 Honey)! 💰",
        "Low on funds? Use `!beg` to get some quick Honey, then check out `!gamble` to multiply it! 🎰",
        "Want money? `!beg` is your friend! Or get active and win the `!activetop` daily contest! 💸"
    ],
    games: [
        "Feeling lucky? Try `!gamble` to see all casino games, or challenge someone with `!gladiator`! 🎲",
        "Want to play? Use `!flip`, `!blackjack`, `!rps`, or check `!gamble` for all games! ⚔️",
        "Bored? Try some games! `!flip` for quick gambling, or `!gladiator` for epic PvP battles! 🎰"
    ]
};

// Function to get fallback response
function getFallbackResponse(category) {
    const responses = fallbackResponses[category] || fallbackResponses.error;
    return responses[Math.floor(Math.random() * responses.length)];
}

// Command keyword detection for smart fallbacks
function detectIntent(message) {
    const lower = message.toLowerCase();

    if (lower.match(/\b(hi|hello|hey|sup|yo|greetings)\b/)) return 'greeting';
    if (lower.match(/\b(help|commands|what can you|how do i|guide)\b/)) return 'help';
    if (lower.match(/\b(money|bucks|honey|broke|poor|need money|earn)\b/)) return 'money';
    if (lower.match(/\b(game|gamble|play|fun|bored|casino|bet)\b/)) return 'games';

    return 'help';
}

module.exports = (client) => {
    console.log('🤖 Bobby Conversation Handler (OpenAI GPT-4 Mini) initialized');

    client.on('messageCreate', async (message) => {
        // Ignore bot messages
        if (message.author.bot) return;

        // Only respond in guilds (not DMs for this handler)
        if (!message.guild) return;

        const userMessage = message.content;
        const userMessageLower = userMessage.toLowerCase();

        // Skip if message starts with ! (command)
        if (userMessage.startsWith('!')) return;

        // Only respond if "bobby" is mentioned in the message
        if (!userMessageLower.includes('bobby')) return;

        // Show typing indicator
        await message.channel.sendTyping();

        try {
            // Check if OpenAI is configured
            if (!openai) {
                console.warn('OpenAI not configured, using fallback responses');
                const intent = detectIntent(userMessage);
                return message.reply(getFallbackResponse(intent));
            }

            // Get AI-generated response
            const response = await getBobbyResponse(message.author.id, userMessage);

            // Send response
            // If response is very long, use an embed
            if (response.length > 400) {
                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setAuthor({
                        name: 'Bobby',
                        iconURL: client.user.displayAvatarURL()
                    })
                    .setDescription(response)
                    .setFooter({ text: 'Powered by AI • Type !help for commands' })
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            } else {
                // For shorter responses, just reply normally
                return message.reply(response);
            }

        } catch (error) {
            console.error('Error generating Bobby response:', error);

            // Use intelligent fallback based on message content
            const intent = detectIntent(userMessage);
            return message.reply(getFallbackResponse(intent));
        }
    });

    // Optional: Command to clear conversation history
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!message.guild) return;

        if (message.content.toLowerCase() === '!resetbobby' || message.content.toLowerCase() === '!clearbobby') {
            conversationHistory.delete(message.author.id);
            return message.reply('🔄 Your conversation history with Bobby has been reset! Start fresh!');
        }
    });

    // Optional: Magic 8-Ball command (legacy support)
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (!message.guild) return;

        const args = message.content.split(' ');
        const command = args[0].toLowerCase();

        if (command === '!ask' || command === '!8ball' || command === '!magic8ball') {
            const question = args.slice(1).join(' ');

            if (!question || question.trim().length === 0) {
                return message.reply('🎱 Ask me a yes/no question! Example: `!ask Will I have a good day?`');
            }

            if (question.length > 200) {
                return message.reply('❌ Please keep your question under 200 characters.');
            }

            await message.channel.sendTyping();

            try {
                if (!openai) {
                    return message.reply('🎱 The magic 8-ball is currently unavailable. Try talking to Bobby instead!');
                }

                // Special system prompt for 8-ball mode
                const eightBallPrompt = `You are a mystical Magic 8-Ball. Answer the question with a short, mysterious response (1-2 sentences max). Be cryptic, fortune-teller-like, and give yes/no/maybe style answers. Question: "${question}"`;

                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: eightBallPrompt },
                        { role: 'user', content: question }
                    ],
                    max_tokens: 100,
                    temperature: 1.0
                });

                const response = completion.choices[0].message.content.trim();
                return message.reply(`🎱 ${response}`);

            } catch (error) {
                console.error('Error in magic 8-ball:', error);
                const fallbacks = [
                    "The spirits are unclear... Ask again later.",
                    "The cosmic forces are disrupted... Try again.",
                    "The answer is clouded in mystery... Ask once more."
                ];
                const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)];
                return message.reply(`🎱 ${fallback}`);
            }
        }
    });
};
