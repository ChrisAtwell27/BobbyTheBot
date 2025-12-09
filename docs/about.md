# Bobby The Bot - Complete Command Guide

A feature-rich Discord bot built with discord.js for community engagement, gaming integration, and economy management.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Economy & Currency](#economy--currency)
3. [Casino Games](#casino-games)
4. [PvP Games](#pvp-games)
5. [King of the Hill](#king-of-the-hill)
6. [Bee Mafia](#bee-mafia)
7. [Bounty System](#bounty-system)
8. [Valorant Integration](#valorant-integration)
9. [Team Builder](#team-builder)
10. [Trivia & Wordle](#trivia--wordle)
11. [Birthday System](#birthday-system)
12. [Activity Tracking](#activity-tracking)
13. [Clip Submissions](#clip-submissions)
14. [Bobby AI](#bobby-ai)
15. [Moderation](#moderation)
16. [Booster Perks](#booster-perks)
17. [Utility Commands](#utility-commands)
18. [Subscription Tiers](#subscription-tiers)

---

## Getting Started

1. **Check your balance**: Run `!balance` to see your starting Honey
2. **View all commands**: Type `!help` to see the interactive help menu
3. **Quick reference**: Use `!cmdlist` for a text-only command list
4. **Check your tier**: Run `!subscription` to see what features are available

---

## Economy & Currency

Bobby uses **Honey** as the server currency. All gambling, bounties, and rewards use Honey.

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!balance` | Check your Honey balance | `!balance` or `!balance @user` |
| `!baltop` | View the top 10 richest members | `!baltop` |
| `!pay` | Transfer Honey to another user | `!pay @friend 500` |
| `!beg` | Beg for Honey (1-10 range with tip jar) | `!beg` |
| `!economy` | View server-wide economy statistics | `!economy` |
| `!spend` | Spend Honey on items/services | `!spend 100` |

### Admin Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!award` | Award Honey to a user | `!award @user 1000` |
| `!awardall` | Award Honey to ALL users | `!awardall 500` |
| `!clearhoney` | Reset all balances to 5000 | `!clearhoney` (requires confirmation) |

### Tips

- New users start with **5,000 Honey**
- Use `!baltop` to see where you rank
- The tip jar in `!beg` lets others donate to you

---

## Casino Games

Test your luck against the house! All casino games are available on the **Free Tier**.

### Commands

| Command | Description | Odds | Example |
|---------|-------------|------|---------|
| `!gamble` | View all casino games | - | `!gamble` |
| `!flip` | Coin flip (heads or tails) | 50/50, 2x payout | `!flip 100` |
| `!roulette` | Bet on colors or numbers | 2x (color) / 36x (number) | `!roulette 50 red` or `!roulette 50 17` |
| `!dice` | Guess the dice roll | 1/6 chance, 6x payout | `!dice 100 4` |
| `!blackjack` | Play blackjack vs dealer | Standard rules | `!blackjack 200` |

### How Each Game Works

**Coin Flip (`!flip`)**

- Bet any amount of Honey
- The bot flips a coin
- Win = double your bet, Lose = lose your bet

**Roulette (`!roulette`)**

- Bet on `red`, `black`, or a specific number (0-36)
- Red/Black pays 2x
- Specific number pays 36x

**Dice (`!dice`)**

- Pick a number 1-6
- If the dice lands on your number, you win 6x your bet

**Blackjack (`!blackjack`)**

- Standard casino blackjack rules
- Beat the dealer without going over 21
- Use buttons to Hit, Stand, or Double Down

---

## PvP Games

Challenge other players to skill-based duels! **Requires Plus Tier.**

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!rps` | Rock Paper Scissors | `!rps 100` |
| `!highercard` | Highest card wins | `!highercard 200` |
| `!quickdraw` | Type the word fastest | `!quickdraw 150` |
| `!numberduel` | Closest to random number | `!numberduel 100` |
| `!gladiator` | Arena combat with classes | `!gladiator @user 500 warrior` |
| `!arena` | Same as gladiator | `!arena @user 500` |
| `!arenastats` | View arena W/L record | `!arenastats` or `!arenastats @user` |
| `!challenges` | View pending challenges | `!challenges` |
| `!russianroulette` | Winner takes all, loser loses EVERYTHING | `!russianroulette` or `!rr` |

### How PvP Works

1. **Create a challenge**: Run the command with an amount (e.g., `!rps 100`)
2. **Wait for opponent**: Another player accepts via button
3. **Play**: Both players participate
4. **Winner takes all**: Winner gets both players' bets

### Gladiator Classes

- **Warrior** - Balanced stats
- **Assassin** - High damage, low defense
- **Tank** - High defense, low damage
- **Berserker** - Random massive damage

### Russian Roulette

This is a **high-risk** game:

- Two players enter
- One wins EVERYTHING from the other
- The loser loses their ENTIRE balance
- Use with caution!

---

## King of the Hill

Become the King and defend your throne! **Requires Plus Tier.**

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!koth` | Challenge the King or become King | `!koth 500` |
| `!kothstatus` | View current King and stats | `!kothstatus` |

### How It Works

1. **Become King**: If no one is King, first player to use `!koth` claims the throne
2. **Challenge**: Other players use `!koth <amount>` to challenge
3. **Battle**: Random battle determines winner
4. **Rewards**: King earns Honey from successful defenses
5. **Streak**: Longer reign = bigger rewards

---

## Bee Mafia

Town of Salem style social deduction game with **65+ unique roles**! **Requires Plus Tier.**

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!createmafia` | Start a new game | `!createmafia` or `!createmafia random` |
| `!presets` | View preset configurations | `!presets` |
| `!mafiaroles` | View all roles | `!mafiaroles bee` or `!mafiaroles all` |
| `!roles` | Same as mafiaroles | `!roles wasp` |
| `!reveal` | Queen Bee reveals for 3 votes | `!reveal` (during day only) |

### Starting a Game

1. **Join voice channel**: You need 6+ players in a voice channel
2. **Run command**: `!createmafia` or `!createmafia random` for chaos mode
3. **Configure times**: Use the buttons to set phase durations
4. **Start**: Everyone gets their secret role via DM

### Game Phases

1. **Night Phase**: Evil roles perform their actions (kill, investigate, etc.)
2. **Day Phase**: Discussion and voting to eliminate suspects
3. **Voting**: Majority vote eliminates a player
4. **Repeat**: Until one faction wins

### Factions

| Faction | Goal |
|---------|------|
| **Bee Hive** | Eliminate all Wasps and evil roles |
| **Wasp Nest** | Outnumber or kill all Bees |
| **Neutral** | Various individual win conditions |

### Notable Roles

**Bee Hive (Town)**

- **Queen Bee** - Can reveal for 3 extra votes
- **Investigator** - Learns a player's role each night
- **Doctor** - Heals one player per night
- **Veteran** - Kills anyone who visits them

**Wasp Nest (Mafia)**

- **Wasp Queen** - Leads the wasps
- **Assassin** - Kills for the wasps
- **Consort** - Blocks a player's action

**Neutral**

- **Serial Killer** - Wins by being last alive
- **Jester** - Wins by getting voted out
- **Survivor** - Just needs to survive

Use `!mafiaroles all` to see all 65+ roles!

---

## Bounty System

Post challenges for others to complete for rewards! **Requires Plus Tier.**

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!postbounty` | Post a bounty | `!postbounty 500 "Get a clutch ace in Valorant"` |
| `!bounties` | View all active bounties | `!bounties` |
| `!bounty` | View specific bounty | `!bounty 3` |
| `!claimbounty` | Claim a completed bounty | `!claimbounty 3` |
| `!cancelbounty` | Cancel your bounty (refund) | `!cancelbounty 3` |

### Admin Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!postadminbounty` | Post without spending Honey | `!postadminbounty 1000 "Win 5 games today"` |
| `!clearbounties` | Clear all active bounties | `!clearbounties` |

### How It Works

1. **Post**: Use `!postbounty <amount> "description"` - the amount is deducted from your balance
2. **Complete**: Someone completes the challenge
3. **Verify**: The bounty poster or admin verifies completion
4. **Claim**: Completer uses `!claimbounty <id>` to receive reward

---

## Valorant Integration

Track your Valorant rank, stats, and match history! **Requires Ultimate Tier.**

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!valprofile` | Link your Riot account | `!valprofile PlayerName#1234 na` |
| `!valstats` | View rank and performance | `!valstats` or `!valstats @user` |
| `!valupdate` | Force refresh your stats | `!valupdate` |
| `!valmatches` | View recent match history | `!valmatches` |
| `!valtop` | Server rank leaderboard | `!valtop` |
| `!valskills` | Detailed skill breakdown | `!valskills` |

### Admin Commands

| Command | Description |
|---------|-------------|
| `!createteams` | Create balanced competitive teams |

### Linking Your Account

1. Run `!valprofile YourName#TAG region`
2. Supported regions: `na`, `eu`, `ap`, `kr`, `latam`, `br`
3. Your public Riot data will be fetched

### What's Tracked

- Current rank and RR
- Peak rank achieved
- Win rate
- Average KDA
- ACS (Average Combat Score)
- Recent match history with performance

---

## Team Builder

Create balanced teams for gaming! **Requires Plus Tier.**

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `@Valorant` | Create 5-player team from voice | Mention the role |
| `!valorant` | Same as above | `!valorant` |
| `!team` | Create balanced teams | `!team 10 2` (10 players, 2 hour timer) |
| `!inhouse` | Create in-house match | `!inhouse 5v5` or `!inhouse 3v3` |
| `!valorantmap` | Random map or vote | `!valorantmap` |
| `!randommap` | Same as above | `!randommap` |
| `!maplist` | View all Valorant maps | `!maplist` |
| `@REPO` | Create 6-player horror squad | Mention the role |
| `!repo` | Same as above | `!repo` |

### How Team Builder Works

1. **Join voice**: Get players in a voice channel
2. **Run command**: `@Valorant` or `!valorant`
3. **Auto-balance**: If Valorant stats are linked, teams are balanced by skill
4. **Random map**: Use `!valorantmap` to pick a map

### In-House Matches

For custom competitive matches:

1. Run `!inhouse 5v5` or `!inhouse 3v3`
2. Players join via buttons
3. Teams are balanced using Valorant MMR if available
4. Get a random map with `!valorantmap`

---

## Trivia & Wordle

Daily brain teasers and word games! **Free Tier.**

### Trivia Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!trivia` | Start/view daily trivia | `!trivia` |
| `!triviaanswer` | Submit your answer | `!triviaanswer Paris` |
| `!triviacurrent` | Show current question | `!triviacurrent` |
| `!triviastats` | View your trivia stats | `!triviastats` |

### Wordle Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!wordle start` | Start a new Wordle game | `!wordle start` |
| `!wordle guess` | Make a guess | `!wordle guess CRANE` |

### How Trivia Works

1. A new trivia question is posted daily
2. Use `!triviaanswer` to submit your answer
3. First correct answer wins bonus Honey
4. Track your streak with `!triviastats`

### How Wordle Works

1. Start with `!wordle start`
2. Guess 5-letter words with `!wordle guess WORD`
3. Green = correct letter, correct position
4. Yellow = correct letter, wrong position
5. Gray = letter not in word
6. You have 6 attempts to guess the word

---

## Birthday System

Birthday tracking and celebrations! **Requires Plus Tier.**

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!birthday set` | Set your birthday | `!birthday set 03/15` (March 15) |
| `!birthday` | View your/someone's birthday | `!birthday` or `!birthday @user` |
| `!birthday list` | View upcoming birthdays | `!birthday list` |
| `!birthday remove` | Remove your birthday | `!birthday remove` |

### How It Works

1. Set your birthday with `!birthday set MM/DD`
2. On your birthday, you get a special announcement
3. Birthday users receive bonus Honey
4. Check `!birthday list` to see upcoming celebrations

---

## Activity Tracking

Daily activity competitions with prizes! **Free Tier.**

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!activity` | Check your daily activity | `!activity` or `!activity @user` |
| `!activetop` | Daily activity leaderboard | `!activetop` |

### What's Tracked

- Messages sent
- Reactions given
- Voice channel time
- Commands used

### Daily Prize

The most active member each day wins **5,000 Honey**! Check `!activetop` to see the current standings.

---

## Clip Submissions

Submit gaming clips for biweekly voting contests! **Free Tier.**

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!submitclip` | Submit a video clip | `!submitclip Insane 1v5 clutch` |
| `!clipstatus` | Check submission period | `!clipstatus` |

### How It Works

1. **Submit**: Use `!submitclip` with a video attachment
2. **Review Period**: Clips are collected for 2 weeks
3. **Voting**: Community votes on best clips
4. **Winner**: Top clips win Honey and special recognition

---

## Bobby AI

Chat with Bobby, your AI companion! **Free Tier.**

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| Say "Bobby" | Chat naturally | "Hey Bobby, what's up?" |
| `!ask` | Ask a direct question | `!ask What's the weather like?` |
| `!8ball` | Magic 8-ball | `!8ball Will I win today?` |
| `!setmemory` | Store info Bobby remembers | `!setmemory My favorite game is Valorant` |
| `!mymemory` | See what Bobby knows about you | `!mymemory` |
| `!forgetme` | Clear your data from memory | `!forgetme` |

### Admin Commands

| Command | Description |
|---------|-------------|
| `!resetbobby` | Reset Bobby's conversation memory |

### Chatting with Bobby

Just include "Bobby" in your message:

- "Bobby, tell me a joke"
- "What do you think about this, Bobby?"
- "Hey Bobby, how are you?"

Bobby remembers context within a conversation and can recall things you've told him with `!setmemory`.

---

## Moderation

Server moderation and admin tools. **Free Tier** (Admin permissions required).

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!thinice` | Check user's warning status | `!thinice @user` |
| `!reset thinice` | Reset warnings | `!reset thinice @user` |
| `!dead` | Assign dead role to user | `!dead @user` |
| `!undead` | Remove dead status | `!undead @user` |
| `!modstats` | View moderation statistics | `!modstats` |
| `!modconfig` | Configure mod settings | `!modconfig` |

### Thin Ice System

The Thin Ice system tracks warnings:

1. Users accumulate warnings for rule violations
2. Check status with `!thinice @user`
3. Too many warnings = automatic action
4. Admins can reset with `!reset thinice @user`

---

## Booster Perks

Exclusive commands for Server Boosters! **Free Tier** (requires Server Booster status).

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!boosterrole` | Create your custom role | `!boosterrole` |
| `!color` | Set your role color | `!color #ff5733` |
| `!recolor` | Change role color | `!recolor #00ff00` |
| `!rename` | Rename your custom role | `!rename Cool Person` |
| `!deletecolor` | Delete your custom role | `!deletecolor` |

### How It Works

1. Boost the server
2. Run `!boosterrole` to create your custom role
3. Use `!color #hexcode` to pick any color
4. Use `!rename` to give it a custom name

---

## Utility Commands

General bot utilities and information. **Free Tier.**

### Commands

| Command | Description | Example |
|---------|-------------|---------|
| `!help` | Interactive help menu | `!help` or `!help casino` |
| `!cmdlist` | Quick command reference | `!cmdlist` |
| `!subscription` | View server's tier | `!subscription` |
| `!settings` | Bot configuration dashboard | `!settings` |
| `!membercount` | Server member stats | `!membercount` |

### Admin Commands

| Command | Description |
|---------|-------------|
| `!createmembercount` | Create member count display channel |

---

## Subscription Tiers

Bobby operates on a tiered subscription model per server.

### Tier Comparison

| Feature | Free | Plus | Ultimate |
|---------|:----:|:----:|:--------:|
| Economy & Honey | Yes | Yes | Yes |
| Casino Games | Yes | Yes | Yes |
| Trivia & Wordle | Yes | Yes | Yes |
| Activity Tracking | Yes | Yes | Yes |
| Clip Submissions | Yes | Yes | Yes |
| Bobby AI | Yes | Yes | Yes |
| Moderation Tools | Yes | Yes | Yes |
| Booster Perks | Yes | Yes | Yes |
| PvP Games | - | Yes | Yes |
| King of the Hill | - | Yes | Yes |
| Bee Mafia (65+ roles) | - | Yes | Yes |
| Bounty System | - | Yes | Yes |
| Team Builder | - | Yes | Yes |
| Birthday Tracking | - | Yes | Yes |
| Valorant Stats | - | - | Yes |
| Match History | - | - | Yes |
| Rank Leaderboards | - | - | Yes |
| Skill Analysis | - | - | Yes |

### Checking Your Tier

Run `!subscription` to see:

- Your server's current tier
- What features are available
- What you're missing

---

## Quick Reference

### Most Used Commands

```
!balance      - Check your Honey
!gamble       - View casino games
!flip <amt>   - Quick coin flip
!help         - Full help menu
!cmdlist      - Quick command list
```

### Getting Help

- `!help` - Interactive menu with all categories
- `!help <category>` - Specific category (e.g., `!help casino`)
- `!cmdlist` - Text-only quick reference

---

_Bobby The Bot - Making Discord servers more engaging, one command at a time._
