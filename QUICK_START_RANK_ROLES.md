# Quick Start: VALORANT Rank Roles

## What I Need to Do Right Now

### 1. Restart the bot
The new code has been added, so restart Bobby:
```bash
node index.js
# or if using pm2: pm2 restart bobby
```

### 2. Check your emoji names
In Discord, type:
```
!listemojis
```

This will show you:
- ✅ Which Valorant rank emojis were found
- ❌ Which ones are missing
- The **exact names** of all your emojis

### 3. Fix any missing or misnamed emojis

If the bot says emojis are missing, you need to:
- Make sure the emoji names match **exactly** (case-sensitive):
  - `Iron` not `iron` or `IRON`
  - `Bronze` not `bronze`
  - `Silver` not `silver`
  - etc.

You can rename emojis in Server Settings > Emoji > click emoji > Edit

### 4. Run the setup command

Once all emojis are found, go to your `#flairs` channel and type:
```
!setupvalranks
```

The bot will:
- Create the rank selection message
- Add all emoji reactions
- Tell you the message ID
- Show you which emojis were successfully added

### 5. Update config.js

The bot will tell you exactly what to add. Open [`data/config.js`](data/config.js) and:

#### A. Update the message ID (line 13)
Replace `"REPLACE_WITH_MESSAGE_ID"` with the actual message ID from step 4

#### B. Update emoji-to-role mappings (lines 27-35)
The bot's reply will show you the exact emoji names found. Use those names!

For each emoji, get the role ID:
1. Type `\@RoleName` in Discord (e.g., `\@Iron`)
2. You'll see `<@&123456789012345678>`
3. Copy the numbers (that's the role ID)
4. Update the config:
   ```js
   'Iron': '123456789012345678',  // Replace with actual role ID
   ```

#### C. Update the valorantRankRoles array (lines 38-48)
Copy the same role IDs into this array (must match exactly!)

### 6. Restart the bot again
```bash
node index.js
# or: pm2 restart bobby
```

### 7. Test it!
Go to the `#flairs` channel and click on one of the rank emojis. You should get that rank role!

## Troubleshooting

### "Emoji not found"
- Run `!listemojis` to see the exact emoji names
- Make sure emoji names in config.js match exactly (case-sensitive)
- Use `!testemoji EmojiName` to test individual emojis

### "Role not being added"
- Check that role IDs are correct (use `\@RoleName` to get them)
- Make sure the bot has "Manage Roles" permission
- Ensure the bot's role is higher than the rank roles in Server Settings

### "Multiple rank roles at once"
- Make sure the role IDs in `valorantRankRoles` array match the ones in `roleMappings` exactly

## Full Documentation

For complete details, see [VALORANT_RANK_ROLES_SETUP.md](VALORANT_RANK_ROLES_SETUP.md)

## Commands

- `!setupvalranks` - Create the rank selection message
- `!listemojis` - See all server emojis and check which rank emojis are found
- `!testemoji <name>` - Test a specific emoji (e.g., `!testemoji Iron`)
