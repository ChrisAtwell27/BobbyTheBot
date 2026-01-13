# Enhanced Verification System Setup Guide

## Overview

The enhanced verification system provides multi-layer security to protect your Discord server from spam bots, scammers, and raids.

## Features

✅ **Anti-Raid Detection** - Automatically kicks users during mass join attacks
✅ **Button-Based Verification** - Time-delayed emoji challenge to prevent bots
✅ **Suspicious Pattern Detection** - Identifies common bot username patterns
✅ **Attempt Limiting** - Locks out users after failed verification attempts
✅ **Quarantine System** - Holds suspicious users for manual review
✅ **Comprehensive Logging** - Tracks all verification events

## Requirements

### Required Roles
1. **Unverified Role** - Applied to new members until they verify
   - Remove ALL channel permissions or restrict to verification channel only
   - This role denies access to the rest of the server

2. **Quarantine Role** (Optional but recommended)
   - For suspicious users that need manual review
   - Similar restrictions to Unverified role

### Required Channels
1. **Verification Channel** - Where users verify themselves
   - Only the Unverified role should see this channel
   - Bot needs Send Messages, Embed Links, Add Reactions permissions

2. **Verification Log Channel** (Optional but recommended)
   - Private channel for moderators
   - Records all verification events, kicks, and quarantines

## Configuration

Use the settings manager to configure verification for your server:

```javascript
// Enable enhanced verification
await setSetting(guildId, 'verification.enabled', true);

// Set verification channel (where users verify)
await setSetting(guildId, 'verification.channelId', 'CHANNEL_ID_HERE');

// Set unverified role (assigned to new members)
await setSetting(guildId, 'verification.unverifiedRoleId', 'ROLE_ID_HERE');

// Optional: Set quarantine role (for suspicious users)
await setSetting(guildId, 'verification.quarantineRoleId', 'ROLE_ID_HERE');

// Optional: Set log channel (for verification events)
await setSetting(guildId, 'verification.logChannelId', 'CHANNEL_ID_HERE');
```

## Integration

Add to your bot's main file (index.js or similar):

```javascript
const enhancedVerification = require('./events/enhancedVerification');

// Setup verification channel on bot ready
client.once('ready', async () => {
  for (const guild of client.guilds.cache.values()) {
    await enhancedVerification.setupVerificationChannel(guild);
  }
});

// Handle new member joins
client.on('guildMemberAdd', async (member) => {
  await enhancedVerification.handleMemberJoin(member);
});

// Handle button interactions for verification
client.on('interactionCreate', async (interaction) => {
  await enhancedVerification.handleVerificationInteraction(interaction);
});
```

## Security Configuration

You can adjust security thresholds in `enhancedVerification.js`:

```javascript
const VERIFICATION_DELAY_SECONDS = 10;      // Time delay before user can verify
const RAID_DETECTION_THRESHOLD = 5;          // Number of joins to trigger raid mode
const RAID_DETECTION_WINDOW_MS = 60000;      // Time window for raid detection (1 min)
const MAX_VERIFICATION_ATTEMPTS = 3;         // Maximum failed attempts before lockout
const LOCKOUT_DURATION_MS = 3600000;         // Lockout duration (1 hour)
```

## How It Works

### 1. New Member Joins
- Bot assigns Unverified role immediately
- Checks for raid (mass joins in 1 minute)
  - If raid detected: **Kicks user with raid protection message**
- Checks for suspicious username patterns
  - Patterns: "nitro", "free gift", invite links, long number sequences
  - If suspicious: **Assigns Quarantine role for manual review**
- Sends welcome DM with verification instructions
- Logs join event

### 2. User Starts Verification
- User clicks "Start Verification" button in verification channel
- Bot generates random 4-emoji challenge
- Tells user which emoji to click after waiting 10 seconds

### 3. User Completes Challenge
- User waits 10 seconds (enforced)
- User clicks correct emoji
  - **Success**: Unverified role removed, full server access granted
  - **Failure**: Attempt count incremented
- After 3 failed attempts: **1-hour lockout**

### 4. Logging
All events logged to verification log channel:
- ✅ Successful verifications
- ❌ Raid kicks
- ⚠️ Quarantined users
- 🔒 Lockouts

## Suspicious Patterns Detected

The system automatically flags usernames containing:
- `nitro`, `free gift`, `claim here`
- Discord invite links (`discord.gg`)
- Long number sequences (10+ digits)
- `@everyone`, `steam gift`

## Raid Protection

**Trigger**: 5+ users join within 1 minute

**Action**:
1. All new joins are automatically kicked
2. Kicked users receive DM: "Server is under raid, try again later"
3. Raid logged to verification log channel
4. Raid mode expires after 1 minute of no joins

## Testing

1. Create test roles and channels
2. Configure settings with test IDs
3. Join server with alt account
4. Verify the flow:
   - ✅ Unverified role applied
   - ✅ Welcome DM received
   - ✅ Verification button appears
   - ✅ Emoji challenge works
   - ✅ Verification succeeds/fails correctly
   - ✅ Logging works

## Troubleshooting

### Bot can't assign Unverified role
- Check bot's role hierarchy (must be above Unverified role)
- Verify bot has "Manage Roles" permission

### Verification button doesn't respond
- Check bot has "Use Application Commands" permission
- Verify interaction handler is registered

### Logging not working
- Check log channel exists
- Verify bot has Send Messages permission in log channel
- Confirm logChannelId setting is correct

### Users not getting kicked during raids
- Check bot has "Kick Members" permission
- Verify RAID_DETECTION_THRESHOLD is appropriate for your server

## Security Best Practices

1. **Set Unverified role permissions to deny everything**
   - Only allow access to verification channel
   - Prevents bots from seeing/spamming other channels

2. **Monitor the log channel regularly**
   - Watch for patterns in suspicious joins
   - Adjust detection patterns if needed

3. **Use Quarantine role for review**
   - Don't auto-kick suspicious users
   - Allow mods to manually review and approve

4. **Adjust raid threshold for your server**
   - Larger servers may need higher threshold
   - Smaller servers may want lower threshold

5. **Test the system regularly**
   - Use alt accounts to verify it works
   - Update patterns based on new bot trends

## Advanced: Custom Patterns

To add new suspicious patterns, edit `hasSuspiciousPatterns()` function:

```javascript
const suspiciousPatterns = [
  /nitro/i,
  /free.*gift/i,
  /your-custom-pattern/i,  // Add your pattern here
];
```

## Support

If you encounter issues:
1. Check bot logs for error messages
2. Verify all settings are configured correctly
3. Test with bot's role at different positions in hierarchy
4. Check channel and role permissions

---

**Last Updated**: January 2026
