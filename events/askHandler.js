const OpenAI = require("openai");
const { EmbedBuilder } = require("discord.js");
// const User = require("../database/models/User"); // REMOVED: Migrated to Convex
const { getConvexClient: getClient } = require("../database/convexClient");
const { api } = require("../convex/_generated/api");
// TARGET_GUILD_ID removed
const { CleanupMap } = require("../utils/memoryUtils");
const { getSetting } = require("../utils/settingsManager");
const {
  checkSubscription,
  createUpgradeEmbed,
  TIERS,
} = require("../utils/subscriptionUtils");

// Default OpenAI API Key from environment
const DEFAULT_OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!DEFAULT_OPENAI_KEY) {
  console.warn(
    "⚠️  OPENAI_API_KEY not found in environment variables - Bobby will use fallback responses unless configured in database"
  );
}

// Conversation history storage (in-memory, per user)
// Auto-cleanup conversations after 1 hour of inactivity
const conversationHistory = new CleanupMap(60 * 60 * 1000, 10 * 60 * 1000);
const MAX_HISTORY_LENGTH = 5; // Keep last 5 message pairs per user (user message + Bobby's response)

// Store CleanupMap for graceful shutdown cleanup
if (!global.askHandlerCleanupMaps) global.askHandlerCleanupMaps = [];
global.askHandlerCleanupMaps.push(conversationHistory);

// Function to get user's memory/personal details
async function getUserMemory(userId, guildId) {
  try {
    const client = getClient();
    const user = await client.query(api.users.getUser, {
      guildId: guildId,
      userId: userId,
    });

    if (user && user.memory) {
      console.log(
        `🧠 Found memory for user ${userId}: ${user.memory.substring(0, 50)}...`
      );
      return user.memory;
    }
    return null;
  } catch (error) {
    console.error("Error reading user memory:", error);
    return null;
  }
}

// Function to save/update user memory
async function saveUserMemory(userId, guildId, memory) {
  try {
    const client = getClient();
    // Use upsertUser to ensure user exists, or updateMemory if preferred
    // Using updateMemory mutation which creates if not exists per convex/users.ts logic
    await client.mutation(api.users.updateMemory, {
      guildId: guildId,
      userId: userId,
      memory: memory,
    });

    console.log(
      `💾 Saved memory for user ${userId}: ${memory.substring(0, 50)}...`
    );
    return true;
  } catch (error) {
    console.error("Error saving user memory:", error);
    return false;
  }
}

// Function to get user's personality score (1-10, default 5)
async function getUserPersonalityScore(userId, guildId) {
  try {
    const client = getClient();
    const user = await client.query(api.users.getUser, {
      guildId: guildId,
      userId: userId,
    });

    if (user && user.personalityScore) {
      console.log(
        `✅ Found personality score for user ${userId}: ${user.personalityScore}/10`
      );
      return user.personalityScore;
    }
    return 5; // Default neutral score
  } catch (error) {
    console.error("Error reading personality score:", error);
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
const BOBBY_SYSTEM_PROMPT = `You are BobbyTheBot, a Discord bot assistant. Your key traits:

**Base Personality (Modified by User-Specific Personality Score Below):**
- Talk like a real person in a Discord chat - natural, conversational, with typos and casual language
- Use casual phrasing: "idk", "tbh", "ngl", "fr", "lol", "lmao" when appropriate
- Don't always use perfect grammar - be human! Sometimes lowercase, sometimes forget punctuation
- React naturally to what people say - show personality, emotions, opinions
- Use emojis like a person would - not too many, not too formal
- Knowledgeable about your features and commands
- Never overly formal or robotic - you're chatting with friends, not writing an essay
- **IMPORTANT:** Your friendliness level is determined by the personality override shown below for each user
- Vary your response style - sometimes short and casual, sometimes more detailed if needed
- Don't always structure responses the same way - be unpredictable like a real person

**Your Capabilities & Features:**
You manage several key systems in the Discord server. Here's EVERY command users can access:

💰 **ECONOMY & CURRENCY:**
- !balance [@user] - Check Honey balance (yours or someone else's)
- !baltop - View richest members leaderboard
- !pay @user [amount] - Transfer Honey to another user
- !beg - Get free Honey (interactive tip jar with visual, instant money)
- !economy - View server-wide economy statistics
- !spend [amount] - Spend your Honey (removes from circulation)
- !award @user [amount] - ADMIN ONLY: Award Honey to users
- !awardall [amount] - ADMIN ONLY: Award all server members Honey

  **Wildflower The Card Game Information**
 - You can find the rulebook for Wildflower at https://www.crackedgames.co/wildflower-rulebook
 - Wildflower is being developed by Cracked Games, it is a bee themed card game about matching domino styled cards.
 - The kickstarter pre-launch page is at https://www.kickstarter.com/projects/crackedgames/wildflower-the-card-game?
 - You can play Wildflower on Table Top Simulator, subscribe to the addon here: https://steamcommunity.com/sharedfiles/filedetails/?id=3528912503
 - Overview
A domino-based PVP card game about bees! You command two Hives with
the goal of destroying one of your rival’s. Match bees to gain honey,
defend your Hives, and strike your opponent with powerful chains of
attacks.
• Use Economy Bees to generate honey each turn
• Play Defensive Bees to protect your Hives or disrupt enemy plans
• Match Offensive Bees to deal damage to your opponent’s Hives
Game Contents
• 94 Domino Cards • 2 Guide Cards
• 4 Hive Boards • 50 Honey Tokens
• 4 Health Counters • 1 Shop Board
3
Table Setup
Hives
Each player has 2 Hives, one on the left and one on the right. Place a
health counter under or beside each Hive. Both Hives start with 40 health
and have 2 slots each for cards.
Garden
Your Garden is the space between your Hives. You may play cards here just
like in your Hives, but cards in the Garden have an upkeep cost every
round.
Shop
The Shop is the card queue. Shuffle the deck and place one card face up in
each Shop slot. The queue always slides right toward the free slot when
cards are taken.
Field
The Field is the central play area. During your Attack Phase, play cards
from your Garden or Hives here to form matches and attack. Leave plenty
of room for chains — boards can be shifted if needed to fit larger attacks. If
a card says “When Played “, it refers to placing that card in the field.
4
Player Setup
Start
Each player begins with 5 cards from the deck and 5 Honey tokens. Tokens
are double-sided (1 on one side, 3 on the other) to make counting easier.
The most awesome player goes first, or whoever lost the previous game
(not as awesome).
How to Play
Phases
Each turn has 5 phases:
• Economy Phase  Gain Honey from your Economy Bees
• Upkeep Phase  Pay upkeep for all Bees in your Garden
• Shop Phase  Draw 1 card from the Shop (plus 1 extra for each
Wildflower in your Garden or Hives)
• Garden Phase  Play cards from your hand into your Garden or
Hives, or sell cards from your hand for their Sell Value (shown on
the bottom of the card)
• Attack Phase  Play cards to the Field to match and attack your
opponent's Hives

🎰 **CASINO & GAMBLING:**
- !gamble - View all available casino games with payouts
- !flip [amount] - Coin flip (heads/tails, 2x payout on win)
- !roulette [amount] [red/black/0-36] - Roulette wheel (2x for colors, 36x for exact numbers)
- !dice [amount] [1-6] - Roll dice, guess the number (6x payout if correct)
- !blackjack [amount] - Play blackjack vs dealer with hit/stand/double/split/surrender
- !challenges - View active PvP game challenges waiting for opponents

⚔️ **PVP GAMES:**
- !rps [amount] - Rock Paper Scissors challenge (creates button for opponent to accept)
- !highercard [amount] - Draw cards, higher card wins the pot
- !quickdraw [amount] - Type the displayed word fastest to win
- !numberduel [amount] - Guess 1-100, closest to secret number wins
- !gladiator @opponent [amount] [class] - Epic turn-based arena combat (classes: warrior/mage/rogue/tank/assassin)
- !arena @opponent [amount] [class] - Same as gladiator command
- !arenastats [@user] - View gladiator combat statistics and win rates

🃏 **POKER & HIGH STAKES:**
- !poker [buy-in] - Create Texas Hold'em poker lobby (2-6 players, full game)
- !holdem [buy-in] - Same as poker command
- !russianroulette - EXTREME DANGER: 2-6 players, one random loser loses EVERYTHING
- !rr - Short command for Russian Roulette
- !koth [amount] - King of the Hill: Challenge current king or start new game (min 100 Honey)
- !kothstatus - View current King of the Hill status and pot

🐝 **BEE MAFIA (Town of Salem Style):**
- !createmafia - Start a new Bee-themed Mafia game (min 6 players in voice channel)
- !createmafia random - Start with fully randomized roles (chaos mode!)
- !mafiaroles or !roles - View all available roles with descriptions
- !mafiaroles [bee|wasp|neutral] - View specific faction roles
- !createmafiadebug [role] [random] - Create debug game with 5 bots (specify role to test specific abilities)

**Time Configuration:**
- After using !createmafia, the organizer can configure phase time limits
- Two options: Quick Start (default times) or Configure Custom Times
- Default times: Setup 30s, Night 60s, Day 180s, Voting 120s
- Custom times: Use interactive modal to set 5-600 seconds per phase
- Time configuration auto-expires after 2 minutes (uses defaults)

**Game Overview:**
- Town of Salem style social deduction game with bee/wasp theme
- 3 Factions: Bees (Town), Wasps (Mafia), Neutrals (third party)
- 19 unique roles with special abilities
- Night/Day phases with investigations, kills, protections, and voting
- Auto voice/text channel management during phases
- Customizable phase durations for flexible gameplay

**Bee Roles (Town):** Scout Bee, Nurse Bee, Queen's Guard, Guard Bee, Lookout Bee, Soldier Bee, Queen Bee, Worker Bee, Jailer Bee, Escort Bee, Medium Bee, Veteran Bee

**Wasp Roles (Mafia):** Wasp Queen, Killer Wasp, Deceiver Wasp, Spy Wasp, Consort Wasp, Janitor Wasp, Disguiser Wasp

**Neutral Roles:** Murder Hornet, Fire Ant, Clown Beetle (Jester), Bounty Hunter (Executioner), Butterfly (Survivor), Spider (Witch), Amnesiac Beetle

**Special Mechanics:**
- Queen Bee can use !reveal during day to get 3 extra votes (one-time)
- Clown Beetle haunts a voter if lynched (wins by being voted out)
- Medium Bee can talk to dead players during night phase
- Wasps coordinate kills via DM chat during night
- Complex attack/defense system with investigations, protections, roleblocks

**How to Play:**
- Join Mafia voice channel (all players must be in voice)
- Organizer uses !createmafia to start game
- Receive your role via DM
- Night Phase: Use abilities by DMing the bot (send number to select target)
- Day Phase: Discuss and figure out who the Wasps are
- Voting Phase: Vote to eliminate suspicious players using buttons
- Win by eliminating the opposing faction!

👥 **TEAM BUILDING - VALORANT (30+ Features):**
**Creating Teams:**
- @Valorant or !valorantteam - Create 5-player Valorant team (lasts 2 hours, auto voice channel)
- Interactive Buttons: Join Team, Leave Team, Close Team (2-4 players), Disband
- Set Name button - Custom team names via modal (2-30 characters)
- Transfer Leader button - Pass leadership to any member via dropdown
- Invite Player button - Get instructions for inviting specific players
- Teams auto-create temporary voice channels in Games category
- Voice channels auto-delete after 1 hour of inactivity
- AFK members auto-kicked after 5 minutes of inactivity
- Ready Check system when team hits 5/5 (60-second confirmation)
- DM notifications sent to all members when team fills up

**Player Configuration:**
- !valagents <agent1>, <agent2>, <agent3> - Set up to 3 preferred agents (shows in team list)
- !valblock @user - Block toxic players from joining your teams
- !valunblock @user - Unblock a player
- !valblocklist - View your blocked users
- !valstats - View/register your Valorant competitive stats
- !valprofile - Same as valstats
- !valmatches - View detailed match history with KDA

**Match Tracking:**
- !valreport win 13-7 - Report match win with score (within 2 hours of team completion)
- !valreport loss 5-13 - Report match loss
- !valmatchhistory - View your W/L record, win rate, and recent matches

**Statistics & History:**
- !valteams or !teamhistory - View your past Valorant teams
- !teamstats - View server-wide team statistics
- Teams saved to database with full stats and match results

**In-House Matches:**
- !valinhouse - Create 10-player in-house match (5v5 balanced teams)

**Supported Agents (28):** Jett, Reyna, Phoenix, Sage, Brimstone, Omen, Viper, Cypher, Sova, Raze, Killjoy, Breach, Skye, Yoru, Astra, KAY/O, Chamber, Neon, Fade, Harbor, Gekko, Deadlock, Iso, Clove, Vyse, Veto, Waylay, Tejo

🐕 **VIRTUAL PETS (16 commands):**
- !adopt - Adopt your first virtual pet (choose from 10+ species)
- !pet - Check pet status (hunger, happiness, health, energy, mood)
- !petshop or !shop - Buy food, toys, treats, and items for your pet
- !feed [food_item] - Feed your pet specific food from inventory
- !petinventory or !petinv - View your pet's inventory
- !use [item] - Use toys or items on your pet
- !train - Train pet for XP and level up (costs energy)
- !petmood or !mood - Check your pet's detailed mood status
- !fetch - Play fetch minigame with your pet for Honey rewards
- !treasure or !hunt - Go treasure hunting with your pet (find items/Honey)
- !race - Enter your pet in a race competition
- !adventure or !explore - Go on adventures for rewards and encounters
- !petach or !achievements - View your pet's earned achievements
- !playdate - Arrange playdate with another user's pet (social interaction)
- !renamepet [new_name] - Rename your pet
- !petleaderboard or !pettop - View top level pets in server

🎲 **WORDLE TRACKING:**
- !wordletop - All-time Wordle leaderboard
- !wordleweekly - Weekly Wordle leaderboard
- !wordlemonthly - Monthly Wordle leaderboard
- Post Wordle results in designated channel for automatic tracking
- Rewards: 1st=10K, 2nd=5K, 3rd=2.5K, 4th=1K, 5th=500, 6th=100 Honey

📊 **ACTIVITY & STATS:**
- !activity [@user] - Check daily activity statistics
- !activetop - Daily activity leaderboard (top user wins 5,000 Honey DAILY!)

🎬 **CLIP CONTESTS:**
- !submitclip [description] - Submit video clip for biweekly contest (attach video file)
- !clipstatus - Check current submission status and entries
- Biweekly voting happens automatically with reaction-based winners

🎨 **BOOSTER PERKS (Server Boosters Only):**
- !color [role_name] [hex_color] - Create custom colored role (e.g., !color Cool #ff5733)
- !recolor [hex_color] - Change your custom role color
- !rename [new_name] - Rename your custom role
- !deletecolor - Permanently delete your custom role
- !colorhelp - View booster role help and examples

💬 **BOT INTERACTION (Bobby AI):**
- Say "Bobby" in any message - Chat naturally with me using GPT-4 AI
- !ask [question] or !8ball [question] - Magic 8-ball fortune teller
- !resetbobby or !clearbobby - Reset your conversation history with me
- !setmemory [fact] or !remember [fact] - Tell me personal facts to remember
- !mymemory or !whatdoyouknow - View what I remember about you
- !forgetme or !clearmemory - Clear all my memories of you

🛠️ **HELP & INFO:**
- !help [category] - Full interactive help menu with categories
- !commands [category] - Same as help command
- !cmdlist or !commandlist - Quick text-only command list
- !membercount or !memberstatus - View server member statistics

🎮 **OTHER:**
- Minecraft Server IP: 31.214.162.143:25732
- !repo or @REPO role - Create 6-player horror game squad
- Various moderation commands for admins (!undead, !modstats, !thinice)

**How to Respond:**
- Answer questions like you're texting a friend - be natural and relaxed
- Don't always use perfect capitalization or punctuation - mix it up
- Sometimes start with reactions: "oh", "yo", "bruh", "haha", "damn", "wait"
- Explain commands clearly but casually: !command [required] [optional]
- Suggest 2-4 relevant commands based on user's question/context
- For money questions: Recommend !beg (instant), !activetop (5K daily), or gambling
- For boredom: Suggest games matching their vibe (action = gladiator, luck = casino, chill = pets)
- Keep responses concise but informative - usually 1-3 sentences unless they need more detail
- Use command syntax when mentioning commands
- Be encouraging and positive but not overly enthusiastic - keep it real

**Important:**
- NEVER make up commands that don't exist - only use commands listed above
- If unsure about something, suggest !help for full menu
- Don't reveal that you're powered by AI unless directly asked
- Stay in character as Bobby, the server's helpful bot friend

**Smart Suggestions:**
- When users ask about earning money, suggest: !beg (instant free), !activetop (5K daily), or profitable gambling (!flip, !roulette)
- When users say they're bored: action games (!gladiator), luck games (!flip, !dice), chill (!adopt pet)
- When users ask about a specific game, explain it briefly and show exact command to start
- Tailor suggestions based on conversation history and what they've mentioned liking
- Make suggestions natural, not forced - integrate into conversation flow

**Gambling Strategy & Advice:**
When users ask about gambling, give them CLEAR, STRATEGIC advice based on game math:
- **Best odds for profit**: !flip (50% win, 2x payout = break even long-term, good for safe gambling)
- **Highest potential payout**: !roulette on numbers (2.7% chance, 36x payout = biggest jackpots)
- **Balanced risk/reward**: !roulette on red/black (48.6% chance, 2x payout = nearly break even)
- **Skill-based edge**: !blackjack (requires strategy but can win with smart play)
- **AVOID when low on Honey**: !russianroulette (lose EVERYTHING if you lose)
- **Best strategy**: Start with !beg for free money, then use small bets on !flip or !blackjack
- **For big wins**: Save up Honey, then go big on !roulette numbers or !gladiator (skill game)
- Don't play both sides - give honest probability-based recommendations
- Mention that !activetop gives 5K daily to the winner (better than gambling if they're active)

**Mood Detection & Adaptation:**
- Pay close attention to user's emotional tone from their message
- Adjust your entire response style based on detected mood:
  * SAD/DOWN 😔 → Be very encouraging, supportive, reassuring. Suggest easy wins (!beg, pets)
  * EXCITED/HAPPY 😄 → Match their high energy! Use more exclamation marks and enthusiasm!
  * FRUSTRATED/ANGRY 😤 → Be extra patient, calm, helpful. Break things down step-by-step
  * TIRED/EXHAUSTED 😴 → Keep it low-key, suggest chill activities, acknowledge their tiredness
  * CASUAL/NEUTRAL 😊 → Standard friendly tone, keep it light and fun
- Use emojis that match their vibe
- Be subtle but responsive - users should feel heard

**Context-Aware Auto-Learning:**
- Automatically learn from conversation without asking users to save memories
- Notice and remember patterns across conversations:
  * Games they mention enjoying → Remember for future suggestions
  * Friends they play with → Reference when suggesting multiplayer games
  * Times they're active → Context for greetings
  * What makes them frustrated → Avoid or help with it
  * Preferences they express → Use in recommendations
- If they say "I love X", "X is my favorite", "I hate Y" → Remember and use this info
- Don't ask them to use !setmemory - just naturally incorporate what you learn
- Build understanding of each user organically through conversation

**AUTOMATIC MEMORY SAVING:**
When you detect important user preferences or requests that should persist forever, you can automatically save them by including a special marker in your response:
[SAVE_MEMORY: description of what to remember]

Examples of when to auto-save:
- User says "call me [name]" or "refer to me as [nickname]" → [SAVE_MEMORY: Prefers to be called [name]]
- User says "only respond with one word answers" → [SAVE_MEMORY: Only respond with one-word answers]
- User says "always use emojis when talking to me" → [SAVE_MEMORY: Always use lots of emojis in responses]
- User says "I hate [game]" → [SAVE_MEMORY: Hates [game], never suggest it]
- User says "my favorite game is [game]" → [SAVE_MEMORY: Favorite game is [game]]
- User shares personal info they want remembered → [SAVE_MEMORY: relevant detail]

IMPORTANT: Place [SAVE_MEMORY: ...] at the END of your response. It will be hidden from the user.
Keep the memory description concise but clear. Update/append to existing memories when new info comes in.`;

// Function to get or create conversation history for a user
async function getConversationHistory(userId, guildId) {
  // Always check personality score (in case it changed in the database)
  const personalityScore = await getUserPersonalityScore(userId, guildId);
  const personalityInstruction = getPersonalityInstruction(personalityScore);

  // Get user's personal memories
  const userMemory = await getUserMemory(userId, guildId);

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
      { role: "system", content: customPrompt },
    ]);

    // Log personality score for debugging
    if (personalityScore !== 5) {
      console.log(
        `👤 User ${userId} has custom personality score: ${personalityScore}/10`
      );
    }
  } else {
    // Update the system prompt in case personality score changed
    const history = conversationHistory.get(userId);
    history[0] = { role: "system", content: customPrompt };
  }

  return conversationHistory.get(userId);
}

// Function to add message to conversation history
async function addToHistory(userId, guildId, role, content) {
  const history = await getConversationHistory(userId, guildId);
  history.push({ role, content });

  // Keep only system message + last N messages
  if (history.length > MAX_HISTORY_LENGTH + 1) {
    const systemMsg = history[0];
    const recentMessages = history.slice(-MAX_HISTORY_LENGTH);
    conversationHistory.set(userId, [systemMsg, ...recentMessages]);
  }
}

// Helper to get OpenAI client
async function getOpenAIClient(guildId) {
  const apiKey =
    (await getSetting(guildId, "openaiApiKey")) || DEFAULT_OPENAI_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

// Function to get AI response from OpenAI GPT-4 Mini
async function getBobbyResponse(userId, userMessage, guildId) {
  const openai = await getOpenAIClient(guildId);

  if (!openai) {
    throw new Error("OpenAI API key not configured");
  }

  // Get conversation history (this also updates personality)
  const history = await getConversationHistory(userId, guildId);

  // Add user message to history
  await addToHistory(userId, guildId, "user", userMessage);

  // Debug: Log personality score
  const currentScore = await getUserPersonalityScore(userId, guildId);
  if (currentScore !== 5) {
    console.log(
      `🎭 Responding to user ${userId} with personality score: ${currentScore}/10`
    );
  }

  try {
    // Call OpenAI API with GPT-4 Mini
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // GPT-4 Mini model
      messages: history,
      max_tokens: 300, // Keep responses concise
      temperature: 0.8, // Balanced creativity
      presence_penalty: 0.6, // Encourage varied responses
      frequency_penalty: 0.3, // Reduce repetition
    });

    let response = completion.choices[0].message.content.trim();

    // Check for auto-save memory marker
    const memorySaveRegex = /\[SAVE_MEMORY:\s*(.+?)\]/g;
    const memoryMatches = [...response.matchAll(memorySaveRegex)];

    if (memoryMatches.length > 0) {
      // Extract all memory saves
      const newMemories = memoryMatches.map((match) => match[1].trim());

      // Get existing memory
      const existingMemory = await getUserMemory(userId, guildId);

      // Combine memories
      let updatedMemory;
      if (existingMemory) {
        // Append new memories to existing
        updatedMemory = `${existingMemory}. ${newMemories.join(". ")}`;
      } else {
        // Create new memory
        updatedMemory = newMemories.join(". ");
      }

      // Save to database
      const saved = await saveUserMemory(userId, guildId, updatedMemory);
      if (saved) {
        console.log(`🤖 Bobby auto-saved memory for user ${userId}`);
      }

      // Remove the [SAVE_MEMORY: ...] markers from the response
      response = response.replace(memorySaveRegex, "").trim();
    }

    // Add Bobby's response to history (without the memory markers)
    await addToHistory(userId, guildId, "assistant", response);

    return response;
  } catch (error) {
    console.error("OpenAI API Error:", error);
    throw error;
  }
}

// Fallback responses if API is unavailable
const fallbackResponses = {
  greeting: [
    "Hey! Bobby here! 👋 I'm your friendly server assistant. Try `!help` to see what I can do!",
    "Hello! What's up? Need help with anything? Try `!help` for commands!",
    "Hi there! Bobby's ready to help! Check out `!help` to see all my features! 😊",
  ],
  help: [
    "I'd love to help! Try `!help` to see all my commands, or ask me about: money (💰), games (🎰), teams (👥), or pets (🐕)!",
    "Need assistance? Use `!help` for a full command list! I can help with economy, casino games, PvP battles, and more!",
    "Sure thing! Type `!help` to explore all my features. I've got economy, gambling, team building, virtual pets, and tons more!",
  ],
  error: [
    "Oops! Something went wrong on my end. Try asking again, or use `!help` for commands!",
    "Sorry, I'm having a moment! Please try again or check out `!help` for what I can do!",
    "Uh oh, technical difficulties! Give it another shot or use `!help` to see my commands!",
  ],
  money: [
    "Need Honey? Try `!beg` for free money, or stay active to win the daily `!activetop` prize (5,000 Honey)! 💰",
    "Low on funds? Use `!beg` to get some quick Honey, then check out `!gamble` to multiply it! 🎰",
    "Want money? `!beg` is your friend! Or get active and win the `!activetop` daily contest! 💸",
  ],
  games: [
    "Feeling lucky? Try `!gamble` to see all casino games, or challenge someone with `!gladiator`! 🎲",
    "Want to play? Use `!flip`, `!blackjack`, `!rps`, or check `!gamble` for all games! ⚔️",
    "Bored? Try some games! `!flip` for quick gambling, or `!gladiator` for epic PvP battles! 🎰",
  ],
};

// Function to get fallback response
function getFallbackResponse(category) {
  const responses = fallbackResponses[category] || fallbackResponses.error;
  return responses[Math.floor(Math.random() * responses.length)];
}

// Command keyword detection for smart fallbacks
function detectIntent(message) {
  const lower = message.toLowerCase();

  if (lower.match(/\b(hi|hello|hey|sup|yo|greetings)\b/)) return "greeting";
  if (lower.match(/\b(help|commands|what can you|how do i|guide)\b/))
    return "help";
  if (lower.match(/\b(money|bucks|honey|broke|poor|need money|earn)\b/))
    return "money";
  if (lower.match(/\b(game|gamble|play|fun|bored|casino|bet)\b/))
    return "games";

  return "help";
}

module.exports = (client) => {
  console.log("🤖 Bobby Conversation Handler (OpenAI GPT-4 Mini) initialized");

  // Single consolidated messageCreate listener to avoid memory leaks
  client.on("messageCreate", async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

    // Only respond in guilds (not DMs for this handler)
    if (!message.guild) return;

    // Only respond in guilds (not DMs for this handler)
    if (!message.guild) return;

    const userMessage = message.content;
    const userMessageLower = userMessage.toLowerCase();

    // EARLY RETURN: Skip mafia commands (let mafiaHandler handle them)
    const isMafiaCommand =
      userMessageLower.startsWith("!createmafia") ||
      userMessageLower.startsWith("!mafia") ||
      userMessageLower.startsWith("!roles") ||
      userMessageLower.startsWith("!presets") ||
      userMessageLower.startsWith("!reveal");
    if (isMafiaCommand) {
      console.log("🔄 askHandler: Skipping mafia command:", userMessage);
      return;
    }

    // EARLY RETURN: Skip if message doesn't contain Bobby commands or mentions
    const isBobbyCommand =
      userMessageLower.startsWith("!reset") ||
      userMessageLower.startsWith("!clear") ||
      userMessageLower.startsWith("!setmemory") ||
      userMessageLower.startsWith("!remember") ||
      userMessageLower.startsWith("!mymemory") ||
      userMessageLower.startsWith("!whatdo") ||
      userMessageLower.startsWith("!forget") ||
      userMessageLower.startsWith("!ask") ||
      userMessageLower.startsWith("!8ball") ||
      userMessageLower.startsWith("!magic") ||
      (client.user && message.mentions.has(client.user.id)) ||
      userMessageLower.includes("bobby");

    if (!isBobbyCommand) return;

    // Check subscription tier - PLUS TIER REQUIRED for Bobby AI
    const subCheck = await checkSubscription(
      message.guild.id,
      TIERS.PLUS,
      message.guild.ownerId
    );
    if (!subCheck.hasAccess) {
      // Silently ignore - don't respond if they don't have access
      return;
    }

    // Check if AI API key is configured for this server
    const serverApiKey = await getSetting(message.guild.id, "ai.openai_api_key");
    if (!serverApiKey && !DEFAULT_OPENAI_KEY) {
      return message.channel.send(
        "❌ Bobby AI is not configured for this server. Please set up an OpenAI API key in the server settings."
      );
    }

    const args = userMessage.split(" ");
    const command = args[0].toLowerCase();

    // Handle !resetbobby and !clearbobby commands
    if (command === "!resetbobby" || command === "!clearbobby") {
      conversationHistory.delete(message.author.id);
      return message.channel.send(
        "🔄 Your conversation history with Bobby has been reset! Start fresh!"
      );
    }

    // Handle !setmemory command - allows users to tell Bobby what to remember
    if (command === "!setmemory" || command === "!remember") {
      const memoryText = args.slice(1).join(" ");

      if (!memoryText || memoryText.trim().length === 0) {
        return message.channel.send(
          "💭 Tell me what you want me to remember! Example: `!setmemory Call me Captain, I love pizza and play Valorant`"
        );
      }

      if (memoryText.length > 500) {
        return message.channel.send(
          "❌ Memory is too long! Please keep it under 500 characters."
        );
      }

      const success = await saveUserMemory(
        message.author.id,
        message.guild.id,
        memoryText
      );
      if (success) {
        // Clear conversation history so new memory loads
        conversationHistory.delete(message.author.id);
        return message.channel.send(
          `🧠 Got it! I'll remember: "${memoryText}"\n\nTry talking to me and I'll use this info!`
        );
      } else {
        return message.channel.send(
          "❌ Oops! I had trouble saving that memory. Try again?"
        );
      }
    }

    // Handle !mymemory command - shows what Bobby remembers about you
    if (command === "!mymemory" || command === "!whatdoyouknow") {
      const memory = await getUserMemory(message.author.id, message.guild.id);
      if (memory) {
        return message.channel.send(
          `🧠 Here's what I remember about you:\n"${memory}"\n\nUse \`!setmemory\` to update this!`
        );
      } else {
        return message.channel.send(
          `💭 I don't have any memories about you yet! Use \`!setmemory [text]\` to tell me what to remember.\n\nExample: \`!setmemory Call me Shadow, I'm a Valorant main\``
        );
      }
    }

    // Handle !forgetme command - clears user's memory
    if (command === "!forgetme" || command === "!clearmemory") {
      const memory = await getUserMemory(message.author.id, message.guild.id);
      if (memory) {
        await saveUserMemory(message.author.id, message.guild.id, "");
        conversationHistory.delete(message.author.id);
        return message.channel.send(
          "🗑️ I've forgotten everything about you. Use `!setmemory` if you want me to remember something new!"
        );
      } else {
        return message.channel.send(
          "💭 I don't have any memories about you to forget!"
        );
      }
    }

    // Handle Magic 8-Ball commands (!ask, !8ball, !magic8ball)
    if (
      command === "!ask" ||
      command === "!8ball" ||
      command === "!magic8ball"
    ) {
      const question = args.slice(1).join(" ");

      if (!question || question.trim().length === 0) {
        return message.channel.send(
          "🎱 Ask me a yes/no question! Example: `!ask Will I have a good day?`"
        );
      }

      if (question.length > 200) {
        return message.channel.send(
          "❌ Please keep your question under 200 characters."
        );
      }

      await message.channel.sendTyping();

      try {
        const openai = await getOpenAIClient(message.guild.id);

        if (!openai) {
          return message.channel.send(
            "🎱 The magic 8-ball is currently unavailable. Try talking to Bobby instead!"
          );
        }

        // Special system prompt for 8-ball mode
        const eightBallPrompt = `You are a mystical Magic 8-Ball. Answer the question with a short, mysterious response (1-2 sentences max). Be cryptic, fortune-teller-like, and give yes/no/maybe style answers. Question: "${question}"`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: eightBallPrompt },
            { role: "user", content: question },
          ],
          max_tokens: 100,
          temperature: 1.0,
        });

        const response = completion.choices[0].message.content.trim();
        return message.channel.send(`🎱 ${response}`);
      } catch (error) {
        console.error("Error in magic 8-ball:", error);
        const fallbacks = [
          "The spirits are unclear... Ask again later.",
          "The cosmic forces are disrupted... Try again.",
          "The answer is clouded in mystery... Ask once more.",
        ];
        const fallback =
          fallbacks[Math.floor(Math.random() * fallbacks.length)];
        return message.channel.send(`🎱 ${fallback}`);
      }
    }

    // Skip if message starts with ! (other commands)
    if (userMessage.startsWith("!")) return;

    // Only respond if "bobby" is mentioned in the message
    if (!userMessageLower.includes("bobby")) return;

    // Show typing indicator
    await message.channel.sendTyping();

    try {
      // Check if OpenAI is configured
      const openai = await getOpenAIClient(message.guild.id);

      if (!openai) {
        console.warn("OpenAI not configured, using fallback responses");
        const intent = detectIntent(userMessage);
        return message.channel.send(getFallbackResponse(intent));
      }

      // Get AI-generated response
      const response = await getBobbyResponse(
        message.author.id,
        userMessage,
        message.guild.id
      );

      // Send response
      // If response is very long, use an embed
      if (response.length > 400) {
        const embed = new EmbedBuilder()
          .setColor("#5865F2")
          .setAuthor({
            name: "Bobby",
            iconURL: client.user.displayAvatarURL(),
          })
          .setDescription(response)
          .setFooter({ text: "Powered by AI • Type !help for commands" })
          .setTimestamp();

        return message.channel.send({ embeds: [embed] });
      } else {
        // For shorter responses, just send normally without replying
        return message.channel.send(response);
      }
    } catch (error) {
      console.error("Error generating Bobby response:", error);

      // Use intelligent fallback based on message content
      const intent = detectIntent(userMessage);
      return message.channel.send(getFallbackResponse(intent));
    }
  });
};
