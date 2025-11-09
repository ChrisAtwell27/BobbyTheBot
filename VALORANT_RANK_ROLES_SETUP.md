# VALORANT Rank Roles Setup Guide

This guide explains how to set up reaction-based VALORANT rank role selection in your Discord server.

## Features

- **Mutual Exclusivity**: Users can only have one rank role at a time
- **Easy Role Selection**: React with rank emojis to get the corresponding role
- **Automatic Role Swapping**: When selecting a new rank, the old rank role is automatically removed
- **Custom Emojis**: Uses your server's custom VALORANT rank emojis

## Prerequisites

Before setting up, make sure you have:

1. Created Discord roles for each VALORANT rank:
   - Iron
   - Bronze
   - Silver
   - Gold
   - Platinum
   - Diamond
   - Ascendant
   - Immortal
   - Radiant

2. Created custom emojis for each rank (named exactly as the roles):
   - `:Iron:`
   - `:Bronze:`
   - `:Silver:`
   - `:Gold:`
   - `:Platinum:`
   - `:Diamond:`
   - `:Ascendant:`
   - `:Immortal:`
   - `:Radiant:`

## Setup Instructions

### Step 1: Get Role IDs

1. In Discord, type `\@RoleName` (e.g., `\@Iron`) in any channel
2. The role will be mentioned and you'll see something like `<@&123456789012345678>`
3. Copy the number (the role ID) from the mention
4. Repeat for all 9 rank roles

### Step 2: Update Configuration

Edit `data/config.js` and replace the placeholder values:

#### Update `roleMappings`:

```js
roleMappings: {
    // ... existing mappings ...

    // Valorant Rank Roles
    'Iron': 'YOUR_IRON_ROLE_ID_HERE',
    'Bronze': 'YOUR_BRONZE_ROLE_ID_HERE',
    'Silver': 'YOUR_SILVER_ROLE_ID_HERE',
    'Gold': 'YOUR_GOLD_ROLE_ID_HERE',
    'Platinum': 'YOUR_PLATINUM_ROLE_ID_HERE',
    'Diamond': 'YOUR_DIAMOND_ROLE_ID_HERE',
    'Ascendant': 'YOUR_ASCENDANT_ROLE_ID_HERE',
    'Immortal': 'YOUR_IMMORTAL_ROLE_ID_HERE',
    'Radiant': 'YOUR_RADIANT_ROLE_ID_HERE'
},
```

#### Update `valorantRankRoles` array:

```js
valorantRankRoles: [
    'YOUR_IRON_ROLE_ID_HERE',
    'YOUR_BRONZE_ROLE_ID_HERE',
    'YOUR_SILVER_ROLE_ID_HERE',
    'YOUR_GOLD_ROLE_ID_HERE',
    'YOUR_PLATINUM_ROLE_ID_HERE',
    'YOUR_DIAMOND_ROLE_ID_HERE',
    'YOUR_ASCENDANT_ROLE_ID_HERE',
    'YOUR_IMMORTAL_ROLE_ID_HERE',
    'YOUR_RADIANT_ROLE_ID_HERE'
],
```

**Note:** Make sure the role IDs in `valorantRankRoles` match the ones in `roleMappings`!

### Step 3: Create the Reaction Role Message

1. Start your bot
2. Go to your `#flairs` channel (or whichever channel you want)
3. Type the command: `!setupvalranks`
4. The bot will:
   - Create an embed message with rank selection instructions
   - Add all rank emoji reactions to the message
   - Reply with the message ID and further instructions

### Step 4: Add Message ID to Config

After running `!setupvalranks`, the bot will tell you the message ID. Add it to your config:

```js
roleMessageIds: {
    // ... existing message IDs ...
    valRanks: "YOUR_MESSAGE_ID_HERE"
},
```

### Step 5: Restart the Bot

Restart your bot for all changes to take effect:

```bash
# If running locally:
node index.js

# If running with pm2:
pm2 restart bobby

# If running on Digital Ocean:
# The app will restart automatically on push
```

## How It Works

### User Experience

1. User goes to the `#flairs` channel
2. User sees the VALORANT rank selection embed
3. User clicks on their current rank emoji
4. Bot automatically:
   - Removes any previous rank roles they had
   - Adds the new rank role
5. User can change their rank at any time by clicking a different emoji

### Technical Details

**Files Involved:**
- [`events/valorantRankRoleHandler.js`](events/valorantRankRoleHandler.js) - Handles the `!setupvalranks` command
- [`events/messageReactionHandler.js`](events/messageReactionHandler.js) - Handles reaction add/remove events
- [`data/config.js`](data/config.js) - Stores role and message ID mappings

**Mutual Exclusivity:**
The `messageReactionHandler` checks if the reacted role is in the `valorantRankRoles` array. If it is, the handler removes all other rank roles before adding the new one.

## Troubleshooting

### Reactions aren't working

1. **Check emoji names**: Emoji names in `roleMappings` must match your Discord emoji names exactly (case-sensitive)
2. **Check role IDs**: Make sure role IDs are correct (no extra spaces or quotes)
3. **Check message ID**: Ensure the message ID in `roleMessageIds.valRanks` matches the actual message ID
4. **Check bot permissions**: Bot needs "Manage Roles" permission
5. **Check role hierarchy**: Bot's role must be higher than the rank roles in the server settings

### Bot can't add reactions

- Make sure the bot has "Add Reactions" permission in the channel
- Custom emojis must be from the same server (or the bot must have Nitro)

### Roles aren't being removed

- Check that all role IDs in `valorantRankRoles` are correct
- Make sure the role IDs match exactly between `roleMappings` and `valorantRankRoles`

### "REPLACE_WITH_" placeholders still present

- You need to replace ALL placeholder values in `config.js` with actual role IDs
- Don't forget to update both `roleMappings` AND `valorantRankRoles`

## Commands

| Command | Permission | Description |
|---------|-----------|-------------|
| `!setupvalranks` | Administrator | Creates the rank selection message in the current channel |

## Example Config

Here's a complete example configuration:

```js
module.exports = {
    roleMessageIds: {
        matchmaking: "1276256865092636784",
        // ... other message IDs ...
        valRanks: "1234567890123456789"  // From !setupvalranks
    },
    roleMappings: {
        'EggGold': '818839698306236487',
        // ... other role mappings ...

        // Valorant Ranks
        'Iron': '1111111111111111111',
        'Bronze': '2222222222222222222',
        'Silver': '3333333333333333333',
        'Gold': '4444444444444444444',
        'Platinum': '5555555555555555555',
        'Diamond': '6666666666666666666',
        'Ascendant': '7777777777777777777',
        'Immortal': '8888888888888888888',
        'Radiant': '9999999999999999999'
    },
    valorantRankRoles: [
        '1111111111111111111',  // Iron
        '2222222222222222222',  // Bronze
        '3333333333333333333',  // Silver
        '4444444444444444444',  // Gold
        '5555555555555555555',  // Platinum
        '6666666666666666666',  // Diamond
        '7777777777777777777',  // Ascendant
        '8888888888888888888',  // Immortal
        '9999999999999999999'   // Radiant
    ],
    // ... rest of config ...
};
```

## Notes

- Role IDs are Discord snowflake IDs (long numbers as strings)
- Emoji names must match exactly (case-sensitive)
- The bot must be restarted after config changes
- Users can change their rank at any time
- Only one rank role can be active at a time per user

---

**Need Help?**
Check the bot logs for detailed error messages if something isn't working correctly.
