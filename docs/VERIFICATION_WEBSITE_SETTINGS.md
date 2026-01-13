# Verification Settings for Website Dashboard

## Overview

Yes, you need to add settings options on your website dashboard for server administrators to configure the Enhanced Verification System. This document outlines the exact settings needed.

## Required Settings in Database

Your Convex backend already stores settings in the `servers` table with the `settings` field. The verification system uses these keys:

```javascript
verification: {
  enabled: boolean,              // Master toggle for verification system
  channelId: string,             // Verification channel ID
  unverifiedRoleId: string,      // Role assigned to unverified users
  quarantineRoleId: string,      // Role for suspicious users (optional)
  logChannelId: string           // Channel for logging events (optional)
}
```

## Website UI Components Needed

### 1. Verification Settings Page/Section

Create a "Verification" section in your server settings dashboard with these components:

#### **Master Toggle**
```jsx
<Toggle
  label="Enhanced Verification System"
  description="Enable advanced bot protection with button verification and raid detection"
  value={settings.verification?.enabled}
  onChange={(value) => updateSetting('verification.enabled', value)}
/>
```

#### **Verification Channel Selector**
```jsx
<ChannelDropdown
  label="Verification Channel"
  description="Channel where users will verify themselves (only visible to Unverified role)"
  type="text" // Text channel only
  value={settings.verification?.channelId}
  onChange={(channelId) => updateSetting('verification.channelId', channelId)}
  required={settings.verification?.enabled}
/>
```

#### **Unverified Role Selector**
```jsx
<RoleDropdown
  label="Unverified Role"
  description="Role assigned to new members until they verify (should deny access to most channels)"
  value={settings.verification?.unverifiedRoleId}
  onChange={(roleId) => updateSetting('verification.unverifiedRoleId', roleId)}
  required={settings.verification?.enabled}
  warningText="⚠️ Make sure this role denies access to all channels except the verification channel"
/>
```

#### **Quarantine Role Selector** (Optional)
```jsx
<RoleDropdown
  label="Quarantine Role (Optional)"
  description="Role for suspicious users that need manual review by moderators"
  value={settings.verification?.quarantineRoleId}
  onChange={(roleId) => updateSetting('verification.quarantineRoleId', roleId)}
  optional
  showClearButton
/>
```

#### **Log Channel Selector** (Optional)
```jsx
<ChannelDropdown
  label="Log Channel (Optional)"
  description="Private channel where verification events, raids, and quarantines are logged"
  type="text"
  value={settings.verification?.logChannelId}
  onChange={(channelId) => updateSetting('verification.logChannelId', channelId)}
  optional
  showClearButton
/>
```

### 2. Setup Guide Integration

Add a collapsible "Setup Guide" section with step-by-step instructions:

```jsx
<SetupGuide>
  <Step number="1" title="Create Required Roles">
    1. Create an "Unverified" role
    2. Remove ALL permissions or restrict to verification channel only
    3. Optional: Create a "Quarantine" role with similar restrictions
  </Step>

  <Step number="2" title="Create Verification Channel">
    1. Create a text channel (e.g., #verification)
    2. Only allow "Unverified" role to see this channel
    3. Grant bot permissions: Send Messages, Embed Links, Add Reactions
  </Step>

  <Step number="3" title="Configure Settings">
    1. Enable the verification system above
    2. Select your verification channel
    3. Select your unverified role
    4. Optional: Select quarantine and log channels
  </Step>

  <Step number="4" title="Test the System">
    1. Join with an alt account
    2. Verify you get the "Unverified" role
    3. Complete the verification challenge
    4. Confirm you get full server access
  </Step>
</SetupGuide>
```

### 3. Live Status Indicator

Show if the system is properly configured:

```jsx
<StatusCard>
  <StatusItem
    label="Verification System"
    status={settings.verification?.enabled ? 'enabled' : 'disabled'}
  />

  <StatusItem
    label="Configuration"
    status={isFullyConfigured() ? 'complete' : 'incomplete'}
    details={getMissingSettings()}
  />

  <StatusItem
    label="Raid Protection"
    status={settings.verification?.enabled ? 'active' : 'inactive'}
  />
</StatusCard>

// Helper function
function isFullyConfigured() {
  return settings.verification?.enabled &&
         settings.verification?.channelId &&
         settings.verification?.unverifiedRoleId;
}

function getMissingSettings() {
  const missing = [];
  if (!settings.verification?.channelId) missing.push('Verification Channel');
  if (!settings.verification?.unverifiedRoleId) missing.push('Unverified Role');
  return missing.length ? `Missing: ${missing.join(', ')}` : '';
}
```

### 4. Security Configuration (Advanced Section)

Optional expandable section for power users:

```jsx
<AdvancedSettings collapsed>
  <NumberInput
    label="Verification Delay (seconds)"
    description="Time users must wait before completing verification"
    value={10}
    min={5}
    max={30}
    disabled
    note="Currently requires code modification"
  />

  <NumberInput
    label="Raid Detection Threshold"
    description="Number of joins in 1 minute to trigger raid mode"
    value={5}
    min={3}
    max={15}
    disabled
    note="Currently requires code modification"
  />

  <NumberInput
    label="Max Verification Attempts"
    description="Failed attempts before 1-hour lockout"
    value={3}
    min={2}
    max={5}
    disabled
    note="Currently requires code modification"
  />
</AdvancedSettings>
```

## API Endpoints Needed

If you have a web API for your dashboard, you'll need:

### **GET** `/api/servers/:guildId/settings`
Returns all server settings including verification config

### **PATCH** `/api/servers/:guildId/settings`
Updates server settings (calls Convex `updateSettings` mutation)

```javascript
// Example request body
{
  "verification": {
    "enabled": true,
    "channelId": "1234567890",
    "unverifiedRoleId": "0987654321",
    "quarantineRoleId": "1122334455",
    "logChannelId": "5544332211"
  }
}
```

### **GET** `/api/servers/:guildId/channels`
Returns list of text channels for dropdown

### **GET** `/api/servers/:guildId/roles`
Returns list of roles for dropdown

## Validation Rules

Implement these validations on the frontend:

```javascript
function validateVerificationSettings(settings) {
  const errors = [];

  // If enabled, require channel and role
  if (settings.verification?.enabled) {
    if (!settings.verification.channelId) {
      errors.push('Verification channel is required when system is enabled');
    }

    if (!settings.verification.unverifiedRoleId) {
      errors.push('Unverified role is required when system is enabled');
    }
  }

  // Warn about bot permissions
  if (settings.verification?.enabled) {
    // Check if bot has required permissions (via Discord API)
    const requiredPerms = [
      'MANAGE_ROLES',
      'KICK_MEMBERS',
      'SEND_MESSAGES',
      'EMBED_LINKS',
      'ADD_REACTIONS'
    ];

    // Show warning if missing permissions
  }

  return errors;
}
```

## User Experience Flow

1. **Admin navigates to Server Settings → Verification**
2. **Sees toggle to enable system** (disabled by default)
3. **When enabled, shows configuration fields** with validation
4. **Provides real-time feedback** on missing settings
5. **Shows setup guide** for first-time users
6. **Displays status indicators** showing if system is working
7. **Saves settings** to Convex via mutation

## Example React Component Structure

```jsx
import { useState, useEffect } from 'react';
import { useConvex } from 'convex/react';
import { api } from '../convex/_generated/api';

export function VerificationSettings({ guildId }) {
  const convex = useConvex();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);

  // Load settings
  useEffect(() => {
    const loadSettings = async () => {
      const server = await convex.query(api.servers.getServer, { guildId });
      setSettings(server?.settings || {});
    };
    loadSettings();
  }, [guildId]);

  // Update setting
  const updateSetting = async (key, value) => {
    setLoading(true);
    try {
      const newSettings = { ...settings };
      setDeep(newSettings, key, value);

      await convex.mutation(api.servers.updateSettings, {
        guildId,
        settings: newSettings
      });

      setSettings(newSettings);
    } catch (error) {
      console.error('Failed to update setting:', error);
      // Show error toast
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="verification-settings">
      <h2>Enhanced Verification System</h2>

      <Toggle
        label="Enable Verification"
        value={settings.verification?.enabled}
        onChange={(v) => updateSetting('verification.enabled', v)}
        disabled={loading}
      />

      {settings.verification?.enabled && (
        <>
          <ChannelDropdown
            label="Verification Channel"
            guildId={guildId}
            value={settings.verification?.channelId}
            onChange={(v) => updateSetting('verification.channelId', v)}
          />

          <RoleDropdown
            label="Unverified Role"
            guildId={guildId}
            value={settings.verification?.unverifiedRoleId}
            onChange={(v) => updateSetting('verification.unverifiedRoleId', v)}
          />

          {/* More fields... */}
        </>
      )}
    </div>
  );
}
```

## Testing Checklist

After implementing the UI:

- [ ] Toggle enables/disables verification system
- [ ] Channel selector only shows text channels
- [ ] Role selector shows all roles
- [ ] Settings save to Convex correctly
- [ ] Validation prevents invalid configurations
- [ ] Setup guide is clear and helpful
- [ ] Status indicators update in real-time
- [ ] Optional fields can be cleared
- [ ] Works on mobile/responsive

## Migration Path

If you don't have a dashboard yet:

1. **Quick Option**: Use Discord slash commands to configure
   ```javascript
   // Add admin-only slash command
   /verification setup channel:#verify role:@Unverified
   ```

2. **Manual Option**: Admins can use a setup script
   ```bash
   npm run setup-verification <guildId>
   ```

3. **Full Dashboard**: Build the UI components described above

---

**Recommended**: Start with the toggle and required fields, add optional fields later.
