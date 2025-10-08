const OpenAI = require('openai');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// OpenAI API configuration - Uses environment variable
// Set OPENAI_API_KEY in DigitalOcean or .env file
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Personality scores file path
const personalityScoresFilePath = path.join(__dirname, '../data/user_personality_scores.txt');

// User memories file path
const userMemoriesFilePath = path.join(__dirname, '../data/user_memories.txt');

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
const MAX_HISTORY_LENGTH = 5; // Keep last 5 message pairs per user (user message + Bobby's response)

// Function to get user's memory/personal details
function getUserMemory(userId) {
    try {
        if (!fs.existsSync(userMemoriesFilePath)) {
            return null; // No memories file
        }

        const data = fs.readFileSync(userMemoriesFilePath, 'utf-8');
        const lines = data.split('\n');

        for (const line of lines) {
            // Skip comments and empty lines
            if (line.trim().startsWith('#') || !line.trim()) continue;

            const [id, memory] = line.split('|');
            const trimmedId = id ? id.trim() : '';

            if (trimmedId === userId) {
                const trimmedMemory = memory ? memory.trim() : '';
                if (trimmedMemory) {
                    console.log(`🧠 Found memory for user ${userId}: ${trimmedMemory.substring(0, 50)}...`);
                    return trimmedMemory;
                }
            }
        }

        return null; // No memory found for this user
    } catch (error) {
        console.error('Error reading user memories:', error);
        return null;
    }
}

// Function to save/update user memory
function saveUserMemory(userId, memory) {
    try {
        let data = '';
        let userFound = false;

        // Read existing file if it exists
        if (fs.existsSync(userMemoriesFilePath)) {
            data = fs.readFileSync(userMemoriesFilePath, 'utf-8');
        }

        const lines = data.split('\n');
        const updatedLines = [];

        // Update existing or keep other lines
        for (const line of lines) {
            if (line.trim().startsWith('#') || !line.trim()) {
                updatedLines.push(line);
                continue;
            }

            const [id] = line.split('|');
            const trimmedId = id ? id.trim() : '';

            if (trimmedId === userId) {
                // Update this user's memory
                updatedLines.push(`${userId}|${memory}`);
                userFound = true;
            } else {
                // Keep other users' memories
                updatedLines.push(line);
            }
        }

        // Add new user if not found
        if (!userFound) {
            updatedLines.push(`${userId}|${memory}`);
        }

        // Write back to file
        fs.writeFileSync(userMemoriesFilePath, updatedLines.join('\n'), 'utf-8');
        console.log(`💾 Saved memory for user ${userId}: ${memory.substring(0, 50)}...`);
        return true;
    } catch (error) {
        console.error('Error saving user memory:', error);
        return false;
    }
}

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
            // Trim whitespace from both id and score
            const trimmedId = id ? id.trim() : '';
            const trimmedScore = scoreStr ? scoreStr.trim() : '';

            if (trimmedId === userId) {
                const score = parseInt(trimmedScore, 10);
                // Validate score is between 1-10
                if (score >= 1 && score <= 10) {
                    console.log(`✅ Found personality score for user ${userId}: ${score}/10`);
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
- Stay in character as Bobby, the server's helpful bot friend

**Memory System:**
- If users ask you to remember something, call them, or refer to them in a specific way, tell them to use: \`!setmemory [what to remember]\`
- Example: "Bobby, call me Captain" → Respond: "Sure! Use \`!setmemory Call me Captain\` so I remember that!"
- Users can check what you remember with \`!mymemory\`
- If you have existing memories about a user (shown above), USE THEM naturally in conversation

**Smart Suggestions:**
- When users ask about earning money, suggest: \`!beg\`, \`!activetop\`, or gambling games
- When users say they're bored, suggest games they might enjoy
- When users ask about a specific game, offer to help them start it
- Tailor suggestions based on their conversation context and preferences
- Make suggestions feel natural, not forced

**Mood Detection:**
- Pay attention to user's emotional tone (happy, sad, frustrated, excited, etc.)
- Adjust your responses accordingly:
  * If they seem sad/down → Be more encouraging and supportive
  * If they're excited → Match their energy and enthusiasm
  * If they're frustrated → Be more patient and helpful
  * If they're casual → Keep it light and fun
- Use appropriate emojis based on their mood
- Don't overdo it - be subtle and natural

**Context Learning:**
- Notice patterns in what users ask about or play
- If they frequently ask about certain games, remember that preference
- If they mention liking/disliking something, incorporate that knowledge
- Build understanding of their preferences through conversation`;

// Function to get or create conversation history for a user
function getConversationHistory(userId) {
    // Always check personality score (in case it changed in the file)
    const personalityScore = getUserPersonalityScore(userId);
    const personalityInstruction = getPersonalityInstruction(personalityScore);

    // Get user's personal memories
    const userMemory = getUserMemory(userId);

    // Create custom system prompt with personality override and memories
    let customPrompt = `${BOBBY_SYSTEM_PROMPT}

${personalityInstruction}

**IMPORTANT: Follow the personality instructions above for THIS specific user.**`;

    // Add user memories if they exist
    if (userMemory) {
        customPrompt += `

**PERSONAL MEMORY ABOUT THIS USER:**
${userMemory}

**IMPORTANT: Remember and naturally reference these personal details when talking to this user. Use their preferred name/nickname if specified. Incorporate these memories naturally into conversation.**`;
    }

    if (!conversationHistory.has(userId)) {
        // Create new conversation with personality
        conversationHistory.set(userId, [
            { role: 'system', content: customPrompt }
        ]);

        // Log personality score for debugging
        if (personalityScore !== 5) {
            console.log(`👤 User ${userId} has custom personality score: ${personalityScore}/10`);
        }
    } else {
        // Update the system prompt in case personality score changed
        const history = conversationHistory.get(userId);
        history[0] = { role: 'system', content: customPrompt };
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

    // Get conversation history (this also updates personality)
    const history = getConversationHistory(userId);

    // Add user message to history
    addToHistory(userId, 'user', userMessage);

    // Debug: Log personality score
    const currentScore = getUserPersonalityScore(userId);
    if (currentScore !== 5) {
        console.log(`🎭 Responding to user ${userId} with personality score: ${currentScore}/10`);
    }

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

    // Single consolidated messageCreate listener to avoid memory leaks
    client.on('messageCreate', async (message) => {
        // Ignore bot messages
        if (message.author.bot) return;

        // Only respond in guilds (not DMs for this handler)
        if (!message.guild) return;

        const userMessage = message.content;
        const userMessageLower = userMessage.toLowerCase();
        const args = userMessage.split(' ');
        const command = args[0].toLowerCase();

        // Handle !resetbobby and !clearbobby commands
        if (command === '!resetbobby' || command === '!clearbobby') {
            conversationHistory.delete(message.author.id);
            return message.reply('🔄 Your conversation history with Bobby has been reset! Start fresh!');
        }

        // Handle !setmemory command - allows users to tell Bobby what to remember
        if (command === '!setmemory' || command === '!remember') {
            const memoryText = args.slice(1).join(' ');

            if (!memoryText || memoryText.trim().length === 0) {
                return message.reply('💭 Tell me what you want me to remember! Example: `!setmemory Call me Captain, I love pizza and play Valorant`');
            }

            if (memoryText.length > 500) {
                return message.reply('❌ Memory is too long! Please keep it under 500 characters.');
            }

            const success = saveUserMemory(message.author.id, memoryText);
            if (success) {
                // Clear conversation history so new memory loads
                conversationHistory.delete(message.author.id);
                return message.reply(`🧠 Got it! I'll remember: "${memoryText}"\n\nTry talking to me and I'll use this info!`);
            } else {
                return message.reply('❌ Oops! I had trouble saving that memory. Try again?');
            }
        }

        // Handle !mymemory command - shows what Bobby remembers about you
        if (command === '!mymemory' || command === '!whatdoyouknow') {
            const memory = getUserMemory(message.author.id);
            if (memory) {
                return message.reply(`🧠 Here's what I remember about you:\n"${memory}"\n\nUse \`!setmemory\` to update this!`);
            } else {
                return message.reply(`💭 I don't have any memories about you yet! Use \`!setmemory [text]\` to tell me what to remember.\n\nExample: \`!setmemory Call me Shadow, I'm a Valorant main\``);
            }
        }

        // Handle !forgetme command - clears user's memory
        if (command === '!forgetme' || command === '!clearmemory') {
            const memory = getUserMemory(message.author.id);
            if (memory) {
                saveUserMemory(message.author.id, '');
                conversationHistory.delete(message.author.id);
                return message.reply('🗑️ I\'ve forgotten everything about you. Use `!setmemory` if you want me to remember something new!');
            } else {
                return message.reply('💭 I don\'t have any memories about you to forget!');
            }
        }

        // Handle Magic 8-Ball commands (!ask, !8ball, !magic8ball)
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

        // Skip if message starts with ! (other commands)
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
};
