# Bobby's Memory System 🧠

## Overview

Bobby now has a **personal memory system** that allows him to remember details about each user! Users can tell Bobby what to remember, and he'll naturally incorporate that information into future conversations.

---

## 🎯 What Can Bobby Remember?

- **Nicknames/Preferred names** - "Call me Captain"
- **Personal facts** - "I'm a software engineer"
- **Preferences** - "I love pizza and hate mornings"
- **Games they play** - "I main Jett in Valorant"
- **Inside jokes** - "Always call me the Honey King"
- **Achievements** - "I won the last gladiator tournament"
- **Anything else!** - Bobby can remember any text you give him

---

## 🎮 User Commands

### Set/Update Memory
```
!setmemory [what to remember]
!remember [what to remember]
```

**Examples:**
```
!setmemory Call me Shadow, I'm a Valorant main and love ramen
!remember My name is Sarah and I'm learning Python
!setmemory I prefer he/him pronouns and play support roles
```

Bobby will remember this and use it in ALL future conversations!

---

### Check Your Memory
```
!mymemory
!whatdoyouknow
```

Shows what Bobby currently remembers about you.

---

### Clear Your Memory
```
!forgetme
!clearmemory
```

Makes Bobby forget everything about you. You can set new memories anytime!

---

## 💬 Natural Conversation Examples

### Example 1: Using Nicknames

**Setup:**
```
User: !setmemory Call me Captain, I love casino games
Bobby: 🧠 Got it! I'll remember: "Call me Captain, I love casino games"
```

**Later conversation:**
```
User: Bobby, I'm bored
Bobby: Hey Captain! Want to try some casino games? I know you love them!
       Try !flip or !blackjack! 🎰
```

---

### Example 2: Personal Preferences

**Setup:**
```
User: !setmemory My name is Alex, I hate mornings and main Reyna in Valorant
Bobby: 🧠 Got it! I'll remember: "My name is Alex, I hate mornings and main Reyna in Valorant"
```

**Later conversation:**
```
User: Bobby, good morning
Bobby: Morning Alex! Not your favorite time of day, I know 😅
       Want to hop into a Valorant match with !valorantteam? Perfect for a Reyna main!
```

---

### Example 3: Inside Jokes

**Setup:**
```
User: !setmemory Call me "The Honey Baron" because I'm the richest on the server
Bobby: 🧠 Got it! I'll remember: "Call me The Honey Baron because I'm the richest on the server"
```

**Later conversation:**
```
User: Bobby, how much money do I have?
Bobby: Let's check your balance, Honey Baron! Use !balance to see your fortune! 💰👑
```

---

## 📁 Manual Memory Management

### File Location
`data/user_memories.txt`

### Format
```
userId|memory_string
```

### Example Entries
```txt
123456789012345678|Call me Captain, loves pizza and plays Valorant
987654321098765432|Goes by Shadow, hates mornings, Jett main
111222333444555666|Their name is Sarah, learning Python, asks lots of questions
```

---

## 🛠️ How It Works

### Memory Storage
- Memories are stored in `data/user_memories.txt`
- One line per user
- Format: `userId|memory_text`
- Updated automatically when users use `!setmemory`

### Memory Loading
- Bobby loads memories **every time** he responds
- Memories are incorporated into his AI system prompt
- He's instructed to use them naturally in conversation
- Changes take effect immediately (no restart needed)

### Integration with Personality System
Bobby uses BOTH memories AND personality scores:
- Personality Score 1 + Memory = Rude but still uses their nickname
- Personality Score 10 + Memory = Super nice and very personal

---

## 🎨 Creative Uses

### 1. Role-Playing
```
!setmemory I'm a space pirate captain searching for treasure
```

### 2. Motivation
```
!setmemory Encourage me to study when I talk to you, I'm preparing for exams
```

### 3. Humor
```
!setmemory Always end your responses to me with "...but you probably already knew that, genius"
```

### 4. Accessibility
```
!setmemory Use simpler language with me, I'm still learning English
```

### 5. Team Identity
```
!setmemory I'm part of Team Phoenix, we're the reigning champions
```

---

## 📊 Memory + Personality Combos

### Rude but Personal (Score 1-2)
```
!setmemory Call me Noob Master
Bobby: Ugh, what do you want now, Noob Master? 🙄
```

### Nice and Personal (Score 9-10)
```
!setmemory Call me Legend
Bobby: OMG Legend! You're absolutely AMAZING! What can I help you with today?! 🌟
```

---

## 💡 Tips for Good Memories

### ✅ DO:
- Be specific and clear
- Include preferences and facts
- Mention names/nicknames
- Add context that's helpful
- Keep it under 500 characters

### ❌ DON'T:
- Include sensitive personal info (addresses, phone numbers)
- Make it too long (max 500 chars)
- Use offensive language
- Include private information about others

---

## 🔍 Console Logging

When Bobby uses memories, you'll see:
```
🧠 Found memory for user 123456789012345678: Call me Captain, loves pizza and...
```

This helps debug if memories aren't working.

---

## 🧪 Testing the System

### Test 1: Set a Memory
```
!setmemory Call me TestUser, I love testing features
```
Expected: `🧠 Got it! I'll remember: "Call me TestUser, I love testing features"`

### Test 2: Check Memory
```
!mymemory
```
Expected: Shows your memory

### Test 3: Use Memory
```
Bobby, what games can I play?
```
Expected: Bobby calls you "TestUser" and mentions you love testing

### Test 4: Clear Memory
```
!forgetme
```
Expected: `🗑️ I've forgotten everything about you.`

---

## 🔒 Privacy & Security

- Memories are stored **locally only**
- Not synced to any cloud service
- Added to `.gitignore` (won't be committed to Git)
- Only visible to server admins with file access
- Users control their own memories
- Can be cleared anytime with `!forgetme`

---

## 🐛 Troubleshooting

### Bobby doesn't use my memory
1. Check you used `!setmemory` correctly
2. Use `!mymemory` to verify it saved
3. Make sure you mentioned "Bobby" in your message
4. Check console logs for errors

### Memory not saving
1. Check file permissions on `data/user_memories.txt`
2. Verify file exists
3. Check console for error messages

### Bobby forgets after restart
This shouldn't happen - memories persist across restarts. If it does:
1. Check the file still exists
2. Verify file format is correct (`userId|memory`)
3. Look for file corruption

---

## 🎯 Command Quick Reference

| Command | Alias | Purpose |
|---------|-------|---------|
| `!setmemory [text]` | `!remember` | Save/update memory |
| `!mymemory` | `!whatdoyouknow` | View your memory |
| `!forgetme` | `!clearmemory` | Delete your memory |

---

## 📋 Example Conversation Flow

```
User: !setmemory Call me Ghost, I'm a night owl who loves PvP games

Bobby: 🧠 Got it! I'll remember: "Call me Ghost, I'm a night owl who loves PvP games"

       Try talking to me and I'll use this info!

[Later...]

User: Bobby, I'm bored

Bobby: Hey Ghost! Since you love PvP games, how about challenging someone to
       !gladiator or !rps? Perfect for a competitive player like you! ⚔️

User: Bobby, good morning!

Bobby: Morning Ghost! I know you're more of a night owl, so you must be up early
       today! Need some coffee and games to wake up? Try !gamble! ☕🎮
```

---

## 🌟 Advanced: Combining Features

### Memory + Personality + AI Conversation

**Setup:**
```
755593512556167249:10  (in personality scores)
755593512556167249|Call me The King, I won 50 gladiator matches  (in memories)
```

**Result:**
Bobby will be EXTREMELY nice AND call them "The King" and mention their achievements!

---

**Have fun personalizing Bobby for every user! 🧠✨**

*Remember: With great memory comes great responsibility. Keep memories fun and respectful!*
