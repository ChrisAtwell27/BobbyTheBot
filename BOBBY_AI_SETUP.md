# Bobby AI Conversation System Setup

## Overview
Bobby now uses **OpenAI GPT-4 Mini** for natural, intelligent conversations! Whenever someone mentions "Bobby" in their message, the bot will respond using AI-generated text based on context and conversation history.

## Features
✅ **Natural Conversations** - Bobby responds intelligently to any mention of his name
✅ **Context Awareness** - Knows all bot commands and features
✅ **Conversation Memory** - Remembers the last 10 messages per user
✅ **Personality** - Friendly, casual, and helpful Discord bot personality
✅ **Smart Fallbacks** - Works even if API is unavailable
✅ **Magic 8-Ball** - Enhanced `!ask` command with AI responses

## Setup Instructions

### 1. Get OpenAI API Key
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up or log in
3. Navigate to **API Keys** section
4. Click **"Create new secret key"**
5. Copy your API key (starts with `sk-...`)

### 2. Add API Key to Config
Open `data/config.js` and replace `YOUR_OPENAI_API_KEY_HERE` with your actual API key:

```javascript
openaiApiKey: "sk-proj-xxxxxxxxxxxxxxxxxxxxx"
```

**Or** set it as an environment variable:
```bash
export OPENAI_API_KEY="sk-proj-xxxxxxxxxxxxxxxxxxxxx"
```

### 3. Install Dependencies
Already done! The OpenAI package has been installed.

### 4. Start the Bot
```bash
npm start
```

## How to Use

### Natural Conversations
Just mention "Bobby" in any message:

**Examples:**
- "Hey Bobby, how do I earn money?"
- "Bobby what casino games do you have?"
- "Bobby, I'm bored, what should I do?"
- "Thanks Bobby!"
- "Bobby, tell me about the pet system"

Bobby will respond naturally with context-aware answers!

### Magic 8-Ball Command
```
!ask [question]
!8ball [question]
!magic8ball [question]
```

**Example:**
```
!ask Will I win the lottery today?
```

### Clear Conversation History
If you want Bobby to forget your conversation history:
```
!resetbobby
!clearbobby
```

## How It Works

### Conversation Flow
1. User mentions "Bobby" in a message
2. Bot shows typing indicator
3. Message is sent to OpenAI GPT-4 Mini with context
4. AI generates a response based on Bobby's personality
5. Response is sent back to the user

### Conversation Memory
- Bobby remembers the last **10 messages** per user
- Each user has their own conversation history
- Memory is stored in-memory (resets on bot restart)
- Use `!resetbobby` to manually clear your history

### Bobby's Personality
Bobby is programmed to be:
- 🤝 Friendly and approachable
- 💡 Helpful and knowledgeable
- 😄 Slightly playful and witty
- 🎮 Enthusiastic about games and features
- 💬 Casual (uses Discord slang naturally)

### What Bobby Knows
Bobby has complete knowledge of:
- All economy commands (`!balance`, `!beg`, `!pay`, etc.)
- Casino games (`!flip`, `!roulette`, `!blackjack`, etc.)
- PvP games (`!gladiator`, `!rps`, etc.)
- Poker and high-stakes games
- Team building (`!valorantteam`, `!valinhouse`)
- Virtual pets system
- Activity tracking
- Clip contests
- Minecraft server info

## Fallback System
If the OpenAI API is unavailable or not configured:
- Bobby uses smart pre-written responses
- Detects user intent (greeting, help, money, games)
- Still provides helpful suggestions
- No errors or broken functionality

## API Costs
GPT-4 Mini is **very affordable**:
- Input: ~$0.15 per 1M tokens
- Output: ~$0.60 per 1M tokens

**Typical costs:**
- ~500 words = ~$0.0003
- Even with heavy usage, costs are minimal

## Troubleshooting

### Bot doesn't respond to "Bobby"
- Check that OpenAI API key is set correctly
- Look at console logs for errors
- Make sure message isn't a command (doesn't start with `!`)

### "OpenAI not configured" error
- API key is missing or incorrect
- Check `data/config.js` or environment variables
- Verify API key is valid on OpenAI dashboard

### Rate limiting
- Free tier: 3 requests/minute, 200/day
- Paid tier: Much higher limits
- Bobby will use fallback responses if rate limited

## Code Structure

### Main Files
- **`events/askHandler.js`** - Main AI conversation handler
- **`data/config.js`** - Configuration including API key
- **`events/interactionHandler.js`** - ❌ Removed (replaced by AI)

### Key Functions
- `getBobbyResponse(userId, message)` - Gets AI response
- `getConversationHistory(userId)` - Retrieves user's history
- `addToHistory(userId, role, content)` - Adds message to history
- `getFallbackResponse(category)` - Returns fallback if API fails

## Advanced Configuration

### Adjust Response Length
In `askHandler.js`, modify:
```javascript
max_tokens: 300, // Increase for longer responses
```

### Adjust Personality
In `askHandler.js`, modify:
```javascript
temperature: 0.8, // 0.0 = consistent, 1.0 = creative
```

### Change Conversation Memory
In `askHandler.js`, modify:
```javascript
const MAX_HISTORY_LENGTH = 10; // Messages to remember
```

## Support
If you encounter issues:
1. Check console logs for detailed errors
2. Verify API key is correct
3. Check OpenAI account has credits
4. Test with `!ask` command first
5. Review this guide

---

**Enjoy your new AI-powered Bobby! 🤖✨**
