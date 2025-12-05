# Gambling Tier Implementation

## Overview
This document describes the tier-based access control system for gambling commands in BobbyTheBot. The system restricts certain gambling features to paid subscription tiers while keeping basic gambling functionality free.

## Tier Structure

### FREE Tier (No Subscription Required)
**Available to all servers by default**

#### House Games (3 commands)
- `!flip [amount]` - Coin flip game (2x payout)
- `!roulette [amount] [red/black/number]` - Roulette wheel (2x or 36x payout)
- `!dice [amount] [guess (1-6)]` - Dice roll (6x payout)

#### Daily Challenges (Available to all tiers)
- `!wordle` - Daily Wordle puzzle with Honey rewards
- `!trivia` - Daily trivia questions

### PLUS Tier (Subscription Required)
**All FREE tier games PLUS:**

#### Card Games
- `!blackjack [amount]` or `!bj` - Classic Blackjack vs dealer
  - 2x payout on win
  - 2.5x payout on natural blackjack
  - Multi-deck shoe system
  - Win streak bonuses

#### PvP Challenge Games
- `!rps [amount]` - Rock Paper Scissors duel
- `!highercard [amount]` - Higher card wins
- `!quickdraw [amount]` - Type random word fastest
- `!numberduel [amount]` - Closest number guess wins

#### High Stakes Games
- `!russianroulette` or `!rr` - Multiplayer Russian Roulette
  - All money at stake
  - 2-6 players
  - Winner takes all pots

## Implementation Details

### Configuration File
**Location:** [`d:\TestDCBot\BobbyTheBot\config\tierCommands.js`](d:\TestDCBot\BobbyTheBot\config\tierCommands.js)

This centralized configuration file contains:
- Command definitions for each tier
- Helper functions for tier checking
- Dynamic embed generation for the `!gamble` command

#### Key Functions:
```javascript
getAvailableGamblingCommands(userTier)  // Returns all commands available to a tier
isCommandAvailable(commandName, userTier)  // Check if a specific command is available
getRequiredTier(commandName)  // Get the required tier for a command
formatGamblingCommandsForEmbed(userTier)  // Format commands for Discord embed display
```

### Tier Checks in Command Handlers

#### Gambling Handler
**Location:** [`d:\TestDCBot\BobbyTheBot\events\gamblingHandler.js`](d:\TestDCBot\BobbyTheBot\events\gamblingHandler.js:9)

- Lines 440-505: PvP games tier checks (RPS, Higher Card, Quick Draw, Number Duel)
- Line 411-432: Dynamic `!gamble` menu generation based on guild tier

#### Blackjack Handler
**Location:** [`d:\TestDCBot\BobbyTheBot\events\blackjackHandler.js`](d:\TestDCBot\BobbyTheBot\events\blackjackHandler.js:9)

- Lines 62-67: PLUS tier check before allowing blackjack games

#### Russian Roulette Handler
**Location:** [`d:\TestDCBot\BobbyTheBot\events\russianRouletteHandler.js`](d:\TestDCBot\BobbyTheBot\events\russianRouletteHandler.js:9)

- Lines 362-367: PLUS tier check before creating lobbies

### Tier Check Pattern

All PLUS tier commands follow this pattern:

```javascript
// Check subscription tier
const subCheck = await checkSubscription(message.guild.id, TIERS.PLUS);
if (!subCheck.hasAccess) {
    const upgradeEmbed = createUpgradeEmbed('Feature Name', TIERS.PLUS, subCheck.guildTier);
    return message.channel.send({ embeds: [upgradeEmbed] });
}

// Continue with command logic...
```

### Subscription Utilities
**Location:** [`d:\TestDCBot\BobbyTheBot\utils\subscriptionUtils.js`](d:\TestDCBot\BobbyTheBot\utils\subscriptionUtils.js)

Provides:
- `checkSubscription(guildId, requiredTier)` - Validates guild tier access
- `createUpgradeEmbed(featureName, requiredTier, currentTier)` - Creates upgrade prompt
- `TIERS` constant - Tier hierarchy definitions

## User Experience

### !gamble Command Behavior

The `!gamble` command dynamically displays available commands based on the server's subscription tier:

#### FREE Tier Server
```
🎰 CASINO GAMES
Your Server Tier: FREE (Free)

🏠 Free House Games
🪙 !flip [amount] - Coin flip - 2x payout
🎡 !roulette [amount] [red/black/number] - Roulette wheel
🎲 !dice [amount] [guess (1-6)] - Dice roll

⭐ PLUS Tier Games (Subscription Required) 🔒
🔒 !blackjack [amount]
🔒 !rps [amount]
🔒 !highercard [amount]
🔒 !quickdraw [amount]
🔒 !numberduel [amount]
🔒 !russianroulette

💰 Your Stats | 🎯 Payouts
```

#### PLUS Tier Server
```
🎰 CASINO GAMES
Your Server Tier: PLUS ⭐

🏠 Free House Games
[FREE tier commands...]

⭐ PLUS Tier Games
🃏 !blackjack [amount] - Classic Blackjack vs dealer
✊ !rps [amount] - Rock Paper Scissors duel
🎴 !highercard [amount] - Higher card wins
⚡ !quickdraw [amount] - Type random word fastest
🔢 !numberduel [amount] - Closest number guess wins
🔫 !russianroulette - Multiplayer Russian Roulette

💰 Your Stats | 🎯 Payouts
```

### Blocked Command Behavior

When a user tries to use a PLUS tier command without a subscription:

```
🔒 UPGRADE REQUIRED

Feature: Blackjack
Required Tier: PLUS ⭐
Current Tier: FREE

This feature requires a PLUS subscription.
Upgrade your server to unlock premium casino games!
```

## Integration with Convex/Clerk/Vercel

The tier system is designed to integrate with your website's API:

### API Endpoints Needed
1. **Subscription Status Check**
   - Endpoint: `/api/subscription/status`
   - Parameters: `guildId`
   - Returns: `{ tier: 'free' | 'plus' | 'ultimate', status: 'active' | 'expired' }`

2. **Subscription Management**
   - Endpoint: `/api/subscription/manage`
   - Actions: Create, update, cancel subscriptions
   - Links Discord guilds to Clerk user accounts

### Database Schema (Convex)

The existing Subscription model should include:
```javascript
{
  discordId: string,           // Clerk user ID
  tier: 'free' | 'plus' | 'ultimate',
  status: 'active' | 'expired' | 'cancelled',
  verifiedGuilds: [
    {
      guildId: string,
      guildName: string,
      verifiedAt: Date
    }
  ],
  expiresAt: Date,
  features: string[]
}
```

### Clerk Integration Flow

1. User logs in to your website with Discord OAuth (Clerk)
2. User's Discord ID is linked to their Clerk account
3. User purchases PLUS subscription via Stripe/payment provider
4. Convex database creates/updates subscription record
5. User adds bot to their Discord server
6. Bot verifies guild against Convex database via API
7. Guild gains access to PLUS tier features

## Testing the Implementation

### Manual Testing Steps

1. **Test FREE tier access:**
   ```
   !gamble        # Should show only FREE games
   !flip 100      # Should work
   !roulette 100 red  # Should work
   !dice 100 3    # Should work
   !blackjack 100 # Should show upgrade prompt
   ```

2. **Test PLUS tier access** (after adding subscription):
   ```
   !gamble        # Should show all games
   !blackjack 100 # Should start game
   !rps 100       # Should create challenge
   !russianroulette  # Should create lobby
   ```

3. **Test upgrade prompts:**
   - Try PLUS commands without subscription
   - Verify upgrade embed displays correctly
   - Check tier information is accurate

## Maintenance

### Adding New Commands

To add a new gambling command:

1. **Add to tier configuration** ([`config/tierCommands.js`](d:\TestDCBot\BobbyTheBot\config\tierCommands.js))
   ```javascript
   newcommand: {
       syntax: '!newcommand [amount]',
       description: 'Description here',
       payout: 'Payout info',
       emoji: '🎮'
   }
   ```

2. **Implement command handler**
   - Add tier check using `checkSubscription()`
   - Follow existing command patterns

3. **Update documentation**
   - Add to this document
   - Update help command if needed

### Changing Tier Requirements

To move a command to a different tier:

1. Edit [`config/tierCommands.js`](d:\TestDCBot\BobbyTheBot\config\tierCommands.js)
2. Move command object to different tier section
3. Update tier check in command handler (if needed)
4. Test in both FREE and PLUS tier servers

## Files Modified

| File | Purpose | Changes Made |
|------|---------|--------------|
| [`config/tierCommands.js`](d:\TestDCBot\BobbyTheBot\config\tierCommands.js) | Tier configuration | Created - Central config for all tier-based commands |
| [`events/gamblingHandler.js`](d:\TestDCBot\BobbyTheBot\events\gamblingHandler.js) | Main gambling handler | Lines 9, 411-432 - Dynamic !gamble menu |
| [`events/blackjackHandler.js`](d:\TestDCBot\BobbyTheBot\events\blackjackHandler.js) | Blackjack game | Lines 9, 62-67 - PLUS tier check |
| [`events/russianRouletteHandler.js`](d:\TestDCBot\BobbyTheBot\events\russianRouletteHandler.js) | Russian Roulette game | Lines 9, 362-367 - PLUS tier check |

## Next Steps

1. **Website Integration**
   - Build Convex API endpoints for subscription management
   - Implement Clerk authentication for Discord users
   - Create subscription purchase flow with Stripe
   - Add guild verification system

2. **Help Command Updates**
   - Update `!help` to show tier-appropriate commands
   - Add tier information to command descriptions

3. **Analytics**
   - Track command usage by tier
   - Monitor conversion from FREE to PLUS
   - Track feature usage to optimize tier distribution

4. **Marketing**
   - Create upgrade prompts with clear value proposition
   - Highlight PLUS tier features in bot description
   - Create website landing page for BobbyTheBot PLUS

## Support

For questions about the tier system implementation:
- Configuration issues: Check [`config/tierCommands.js`](d:\TestDCBot\BobbyTheBot\config\tierCommands.js)
- Subscription checks: See [`utils/subscriptionUtils.js`](d:\TestDCBot\BobbyTheBot\utils\subscriptionUtils.js)
- Command handlers: Review individual handler files in `events/`
