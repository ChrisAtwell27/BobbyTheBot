# Bobby The Bot

A feature-rich Discord bot built with discord.js for community engagement, gaming integration, and economy management.

## Overview

Bobby is a multi-purpose Discord bot designed to enhance server engagement through gamification, Valorant integration, social games, and a robust economy system. Built with Node.js and powered by Convex for real-time database operations.

## Tech Stack

- **Runtime**: Node.js
- **Discord Library**: discord.js v14
- **Database**: Convex (distributed real-time database)
- **Image Processing**: Canvas for custom embeds and visualizations
- **AI Integration**: OpenAI for conversational AI features
- **Scheduling**: node-cron for automated tasks
- **API Integration**: Valorant API for player statistics

## Features

### Economy System
The core currency is **Honey**, used across all bot features.

| Command | Description |
|---------|-------------|
| `!balance` | Check your Honey balance |
| `!baltop` | View richest members leaderboard |
| `!pay @user <amount>` | Transfer Honey to another user |
| `!beg` | Beg for Honey with interactive tip jar |
| `!economy` | View server-wide economy statistics |
| `!spend <amount>` | Spend Honey on items/services |

**Admin Commands:**
- `!award @user <amount>` - Award Honey to a user
- `!awardall <amount>` - Award Honey to all users
- `!clearhoney` - Reset all balances to 5000

### Casino Games
Test your luck against the house.

| Command | Description | Odds |
|---------|-------------|------|
| `!flip <amount>` | Coin flip | 50/50, 2x payout |
| `!roulette <amount> <bet>` | Roulette wheel | Various payouts |
| `!dice <amount> <1-6>` | Dice roll | 6x payout |
| `!blackjack <amount>` | Classic blackjack | Standard rules |
| `!gamble` | View all casino games | - |

### PvP Games
Challenge other players to skill-based duels.

| Command | Description |
|---------|-------------|
| `!rps <amount>` | Rock Paper Scissors |
| `!highercard <amount>` | Higher card wins |
| `!quickdraw <amount>` | Type fastest to win |
| `!numberduel <amount>` | Closest to random number |
| `!gladiator @user <amount> [class]` | Arena combat with classes |
| `!arenastats [@user]` | View arena statistics |
| `!challenges` | View active PvP challenges |

### Poker & High Stakes

| Command | Description |
|---------|-------------|
| `!poker [buy-in]` | Create Texas Hold'em lobby |
| `!russianroulette` | Winner takes all, loser loses EVERYTHING |

### King of the Hill
Become the King and defend your throne.

| Command | Description |
|---------|-------------|
| `!koth <amount>` | Challenge the King or become first King |
| `!kothstatus` | View current game status |

### Bee Mafia
Town of Salem style social deduction with **65+ unique roles**.

| Command | Description |
|---------|-------------|
| `!createmafia [random]` | Start new game (6+ players in voice) |
| `!presets` | View preset game configurations |
| `!mafiaroles [faction]` | View all 65+ roles by faction |
| `!reveal` | Queen Bee: reveal for 3 extra votes |

**Factions:** Bee, Wasp, Neutral

### Bounty System
Post and complete challenges for rewards.

| Command | Description |
|---------|-------------|
| `!postbounty <amount> "description"` | Post a challenge bounty |
| `!bounties` | View all active bounties |
| `!bounty <id>` | View specific bounty details |
| `!claimbounty <id>` | Claim completed bounty reward |
| `!cancelbounty <id>` | Cancel your bounty (full refund) |

**Admin Commands:**
- `!postadminbounty <amount> "description"` - Post without spending
- `!clearbounties` - Clear all active bounties

### Valorant Integration
Track your Valorant rank, stats, and matches.

| Command | Description |
|---------|-------------|
| `!valprofile <user#tag> <region>` | Link your Riot account |
| `!valstats [@user]` | View rank, RR, and performance |
| `!valupdate` | Force update profile data |
| `!valmatches [@user]` | View recent match history |
| `!valtop` | Server rank leaderboard |
| `!valskills [@user]` | Detailed skill statistics |

**Features:**
- Real-time rank tracking
- Match history with performance stats
- Visual stat cards with rank icons
- Server-wide leaderboards sorted by MMR

### Team Builder
Form balanced teams for gaming.

| Command | Description |
|---------|-------------|
| `@Valorant` / `!valorant` | Create 5-player Valorant team |
| `!team [players] [hours]` | Balanced teams with skill matching |
| `!inhouse [5v5\|3v3]` | Create in-house custom match |
| `!valorantmap` | Random map or vote on maps |
| `!maplist` | View all Valorant maps |
| `@REPO` / `!repo` | Create 6-player horror squad |

### Trivia & Wordle
Daily brain teasers and word games.

| Command | Description |
|---------|-------------|
| `!trivia` | Answer daily trivia for Honey |
| `!triviaanswer <answer>` | Submit your answer |
| `!triviacurrent` | Show current question |
| `!triviastats [@user]` | View trivia statistics |
| `!wordle start` | Start new Wordle game |
| `!wordle guess <word>` | Make a guess |

### Virtual Pets
Adopt, feed, and train virtual companions.

| Command | Description |
|---------|-------------|
| `!adopt` | Adopt a new pet (costs Honey) |
| `!pet` | Check pet status |
| `!feed <food>` | Feed your pet |
| `!train` | Train for XP and levels |
| `!petshop` | Buy food and items |
| `!petinventory` | View pet inventory |
| `!use <item>` | Use item on pet |
| `!petleaderboard` | Top pets by level |

### Birthday System
Birthday tracking and celebrations.

| Command | Description |
|---------|-------------|
| `!birthday set <MM/DD>` | Set your birthday |
| `!birthday [@user]` | View birthday |
| `!birthday list` | Upcoming birthdays |
| `!birthday remove` | Remove your birthday |

### Activity Tracking
Daily activity competitions with prizes.

| Command | Description |
|---------|-------------|
| `!activity [@user]` | Check daily activity stats |
| `!activetop` | Daily leaderboard (5,000 Honey prize!) |

**Tracked:** Messages, reactions, voice activity

### Clip Submissions
Submit gaming clips for biweekly voting contests.

| Command | Description |
|---------|-------------|
| `!submitclip [description]` | Submit video clip |
| `!clipstatus` | Check submission status |

### Bobby AI
Chat with Bobby - your AI companion powered by OpenAI.

| Command | Description |
|---------|-------------|
| Say "Bobby" | Chat naturally by mentioning Bobby |
| `!ask <question>` | Ask a direct question |
| `!8ball <question>` | Magic 8-ball |
| `!setmemory <info>` | Store info for Bobby to remember |
| `!mymemory` | See what Bobby remembers |
| `!forgetme` | Clear your data from memory |

### Moderation
Server moderation and admin tools.

| Command | Description |
|---------|-------------|
| `!thinice @user` | Check warning status |
| `!reset thinice @user` | Reset warnings |
| `!dead @user` | Assign dead role |
| `!undead @user` | Remove dead status |
| `!modstats` | View moderation statistics |
| `!modconfig` | Configure moderation settings |

### Booster Perks
Exclusive commands for Server Boosters.

| Command | Description |
|---------|-------------|
| `!boosterrole` | Create custom booster role |
| `!color <#hex>` | Set custom role color |
| `!recolor <#hex>` | Change role color |
| `!rename <name>` | Rename custom role |
| `!deletecolor` | Delete custom role |

### Utility Commands

| Command | Description |
|---------|-------------|
| `!help [category]` | Display help menu |
| `!cmdlist` | Quick command reference |
| `!subscription` | View subscription tier |
| `!settings` | Bot configuration dashboard |
| `!membercount` | Server member statistics |

## Subscription Tiers

Bobby operates on a tiered subscription model:

| Tier | Features |
|------|----------|
| **Free** | Economy, Casino, Trivia, Wordle, Pets, AI Chat, Activity Tracking |
| **Plus** | + Bounties, PvP Games, King of the Hill, Mafia, Teams, Birthdays |
| **Ultimate** | + Full Valorant Integration (stats, leaderboards, match history) |

## Database Architecture

Bobby uses Convex for real-time, distributed database operations with guild-partitioned data:

- **Users Table**: Economy, pets, Valorant data, birthdays, activity
- **Bounties Table**: Active/claimed/expired bounties
- **Challenges Table**: PvP game challenges
- **Team Histories**: Past team formations and match results
- **Trivia Sessions**: Question tracking and user answers
- **Wordle Scores**: Game statistics and monthly winners
- **Servers Table**: Guild-wide settings and house balance
- **Subscriptions Table**: User subscription management

All data is partitioned by `guildId` with compound indexes for fast queries.

## Visual Features

Bobby generates custom visual embeds using Canvas:

- **Valorant Stat Cards**: Rank icons, performance graphs, match history
- **Leaderboards**: Ranked displays with player avatars and statistics
- **Help Menu**: Interactive category-based navigation
- **Game Results**: Visual outcomes for casino and PvP games

## Automated Features

- **Daily Activity Rewards**: Automatic prize distribution at midnight
- **Birthday Announcements**: Automated birthday celebrations
- **Wordle Monthly Winners**: Monthly leaderboard resets and prizes
- **Bounty Expiration**: Automatic cleanup of expired bounties
- **Trivia Rotation**: Daily question cycling

## Error Handling

Bobby includes robust error handling:

- Automatic crash recovery (up to 5 crashes before exit)
- Shard disconnect/reconnect handling
- Database connection resilience
- Graceful degradation for API failures

## Getting Started

1. Invite Bobby to your server
2. Run `!help` to see available commands
3. Check `!subscription` to view your tier
4. Set up economy with `!balance` to get started

## Support

For issues or feature requests, contact the bot developer or server administrators.

---

*Bobby The Bot - Making Discord servers more engaging, one command at a time.*
