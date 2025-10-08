# Bobby's Conversation History System 💭

## How It Works

Bobby has **TWO types of memory**:

### 1. 🧠 **Permanent Memories** (from `!setmemory`)
- Stored in: `data/user_memories.txt`
- Persists: Forever (until cleared with `!forgetme`)
- Contains: Personal info, nicknames, preferences
- Example: "Call me Captain, I love pizza"

### 2. 💬 **Conversation History** (recent messages)
- Stored in: RAM (in-memory)
- Persists: Until bot restarts or `!resetbobby`
- Contains: Last 5 message pairs (10 total messages)
- Example: Your last 5 questions and Bobby's last 5 answers

---

## Message History Details

### Current Setting
```javascript
MAX_HISTORY_LENGTH = 5  // Keeps last 5 exchanges
```

This means Bobby remembers:
- Your last 5 messages to him
- His last 5 responses to you
- **Total: 10 messages** in the conversation

### What Gets Remembered

**Example conversation:**
```
1. You: Bobby, what games can I play?
2. Bobby: Try !flip, !blackjack, or !roulette!

3. You: Bobby, what's the best one?
4. Bobby: I'd recommend !blackjack for strategy!

5. You: Bobby, how do I play blackjack?
6. Bobby: Use !blackjack [amount] to start a game!

7. You: Bobby, what's my balance?
8. Bobby: Use !balance to check your Honey!

9. You: Bobby, thanks!
10. Bobby: You're welcome! Have fun!
```

After message 10, Bobby remembers all of this context!

**Message 11:**
```
You: Bobby, remind me about that card game
Bobby: You mean blackjack? You asked about it earlier! Use !blackjack [amount] to play!
```

Bobby can reference earlier parts of the conversation!

---

## How to Adjust History Length

### Change the Number

In [askHandler.js:30](d:\TestDCBot\BobbyTheBot\events\askHandler.js#L30):

```javascript
const MAX_HISTORY_LENGTH = 5;  // Change this number
```

### Options:

| Setting | Message Pairs | Total Messages | Use Case |
|---------|---------------|----------------|----------|
| `3` | 3 pairs | 6 messages | Quick, focused conversations |
| `5` | 5 pairs | 10 messages | **Current setting** - Good balance |
| `10` | 10 pairs | 20 messages | Longer context |
| `20` | 20 pairs | 40 messages | Extended conversations |

### Trade-offs:

**Shorter History (3-5):**
- ✅ Less API token usage (cheaper)
- ✅ Faster responses
- ✅ More focused on current topic
- ❌ Forgets older context faster

**Longer History (10-20):**
- ✅ Better long-term context
- ✅ Can reference older topics
- ✅ More natural conversations
- ❌ More expensive (more tokens)
- ❌ Slightly slower responses

---

## How History is Stored

### Per-User Storage

Each user has their **own separate history**:

```
User A's history: [msg1, msg2, msg3, msg4, msg5]
User B's history: [msg1, msg2, msg3, msg4, msg5]
User C's history: [msg1, msg2, msg3, msg4, msg5]
```

Your conversation with Bobby doesn't affect anyone else's!

### Memory Structure

```javascript
conversationHistory = Map {
  "123456789012345678" => [
    { role: "system", content: "Bobby's instructions + personality + memories" },
    { role: "user", content: "Bobby, what games can I play?" },
    { role: "assistant", content: "Try !flip or !blackjack!" },
    { role: "user", content: "Bobby, what's my balance?" },
    { role: "assistant", content: "Use !balance to check!" },
    // ... up to MAX_HISTORY_LENGTH pairs
  ],
  "987654321098765432" => [ ... ],
  // ... more users
}
```

---

## When History is Cleared

### Automatic Clearing:
1. **Bot restart** - All conversation history lost (but permanent memories stay!)
2. **Max length reached** - Oldest messages are automatically removed

### Manual Clearing:
1. **`!resetbobby`** - Clears YOUR conversation history only
2. **`!clearbobby`** - Same as resetbobby

**Important:** This does NOT clear your permanent memory (from `!setmemory`). Use `!forgetme` for that.

---

## How Bobby Uses History

### Example: Referencing Past Context

**Conversation:**
```
You: Bobby, I need to earn money
Bobby: Try !beg for free Honey, or !activetop for the daily prize!

[5 minutes later...]

You: Bobby, what was that command you mentioned?
Bobby: You mean !beg for free money, or !activetop for the daily competition?
```

Bobby remembers your earlier question!

### Combining History + Permanent Memory

**Setup:**
```
!setmemory Call me Captain
```

**Conversation:**
```
You: Bobby, I'm bored
Bobby: Hey Captain! Want to try some games?

You: Bobby, like what?
Bobby: How about !flip, !roulette, or !blackjack?

You: Bobby, remind me what you suggested?
Bobby: Sure Captain! I suggested !flip, !roulette, or !blackjack!
```

Bobby uses BOTH:
- ✅ Your permanent memory (nickname "Captain")
- ✅ Conversation history (remembers suggesting games)

---

## API Token Usage

### Why History Affects Cost

Every message to OpenAI includes:
- System prompt (Bobby's instructions)
- Your permanent memory
- ALL conversation history
- Your new message

**More history = More tokens = Higher cost**

### Token Calculation Example

With `MAX_HISTORY_LENGTH = 5`:
```
System prompt:       ~800 tokens
Your memory:         ~50 tokens
5 message pairs:     ~500 tokens
Your new message:    ~50 tokens
-------------------------
Total input:         ~1,400 tokens
```

With `MAX_HISTORY_LENGTH = 20`:
```
System prompt:       ~800 tokens
Your memory:         ~50 tokens
20 message pairs:    ~2,000 tokens
Your new message:    ~50 tokens
-------------------------
Total input:         ~2,900 tokens (2x more expensive!)
```

### Cost Impact

**GPT-4 Mini pricing:**
- Input: ~$0.15 per 1M tokens
- Output: ~$0.60 per 1M tokens

**With 5 messages:**
- ~$0.0002 per conversation turn

**With 20 messages:**
- ~$0.0004 per conversation turn

Still very cheap, but doubles the cost!

---

## Best Practices

### For Most Users
**Keep it at 5** (current setting)
- Good balance of context and cost
- Remembers recent conversation
- Doesn't waste tokens on old messages

### For Long Conversations
**Increase to 10-15** if:
- Users have extended back-and-forth discussions
- Need to reference older topics
- Cost isn't a major concern

### For Quick Interactions
**Reduce to 3** if:
- Most interactions are one-off questions
- Want to minimize costs
- Don't need much context

---

## Testing History Length

### Test Short History (3):

```javascript
MAX_HISTORY_LENGTH = 3;
```

**Conversation:**
```
1. You: Bobby, tell me about games
2. Bobby: We have !flip, !roulette, !blackjack!

3. You: Bobby, what about pets?
4. Bobby: Check out !adopt and !pet!

5. You: Bobby, what about economy?
6. Bobby: Try !balance and !beg!

7. You: Bobby, tell me about those card games again
8. Bobby: Which card games? (Forgot the first exchange!)
```

### Test Long History (10):

```javascript
MAX_HISTORY_LENGTH = 10;
```

**Conversation:**
```
[Same 6 messages as above...]

7. You: Bobby, tell me about those card games again
8. Bobby: You mean !flip, !roulette, and !blackjack? I mentioned those earlier!
```

Bobby still remembers!

---

## Quick Reference

### Current Settings
- **Conversation History:** 5 message pairs (10 total)
- **Permanent Memory:** Unlimited (stored in file)
- **Storage:** In-memory (RAM)
- **Persistence:** Until bot restart or `!resetbobby`

### Related Commands
- `!resetbobby` - Clear conversation history
- `!setmemory` - Save permanent memory
- `!mymemory` - View permanent memory
- `!forgetme` - Clear permanent memory

---

**Bobby's memory system is flexible and powerful! Adjust `MAX_HISTORY_LENGTH` to fit your needs!** 🧠✨
