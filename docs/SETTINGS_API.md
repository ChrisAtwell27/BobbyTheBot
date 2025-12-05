# Bobby Bot Settings API Reference

This document describes the REST API endpoints for configuring bot settings per-server via the web dashboard.

## Base URL
```
http://localhost:3003/api/settings
```

## Authentication
All endpoints require authentication via Bearer token:
```
Authorization: Bearer <SETTINGS_API_SECRET>
```

---

## Channel Settings

### Get Available Channels
Returns all channels in a guild for selection dropdowns.

```
GET /api/settings/:guildId/available-channels?type=text|voice|all
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Optional. Filter by `text`, `voice`, or `all` (default) |

**Response:**
```json
{
  "success": true,
  "guildId": "123456789",
  "channels": [
    {
      "id": "987654321",
      "name": "general",
      "type": "text",
      "category": "Text Channels",
      "position": 0
    }
  ]
}
```

### Get Configured Channels
Returns all configured channel settings for a guild.

```
GET /api/settings/:guildId/channels
```

**Response:**
```json
{
  "success": true,
  "guildId": "123456789",
  "channels": {
    "mafia_text": {
      "id": "987654321",
      "name": "mafia-game",
      "type": "text"
    },
    "mafia_voice": {
      "id": "987654322",
      "name": "Mafia VC",
      "type": "voice"
    }
  }
}
```

### Set a Channel
Configure a specific channel setting.

```
POST /api/settings/:guildId/channels/:channelType
```

**Valid Channel Types:**
| Type | Description | Tier |
|------|-------------|------|
| `trivia` | Trivia game channel | Free |
| `wordle` | Wordle game channel | Free |
| `alerts` | Alert notifications | Free |
| `updates` | Update announcements | Free |
| `announcements` | General announcements | Free |
| `commands` | Bot commands channel | Free |
| `logging` | Moderation logs | Free |
| `changelog` | Bot changelog | Free |
| `mafia_text` | Mafia game text channel | Free |
| `mafia_voice` | Mafia game voice channel | Free |
| `graveyard` | Moderation graveyard channel | Free |
| `clip_submission` | Clip submission channel | Free |

**Request Body:**
```json
{
  "channelId": "987654321"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Channel mafia_text updated",
  "channelType": "mafia_text",
  "channelId": "987654321"
}
```

---

## Role Settings

### Get Configured Roles
Returns all configured role settings for a guild.

```
GET /api/settings/:guildId/roles
```

**Response:**
```json
{
  "success": true,
  "guildId": "123456789",
  "roles": {
    "dead": {
      "id": "111222333",
      "name": "dead.",
      "color": "#808080"
    },
    "valorant_team": {
      "id": "444555666",
      "name": "Valorant",
      "color": "#FF4655"
    }
  }
}
```

### Set a Role
Configure a specific role setting.

```
POST /api/settings/:guildId/roles/:roleType
```

**Valid Role Types:**
| Type | Description | Tier |
|------|-------------|------|
| `dead` | Role for "dead" users in mafia/moderation | Free |
| `bump_reminder` | Role to ping for server bumps | Free |
| `updates` | Role for update notifications | Free |
| `clip_winner` | Role for clip contest winners | Free |
| `valorant_team` | Role to ping for Valorant teams | Basic |
| `valorant_inhouse` | Role for in-house games | Basic |

**Request Body:**
```json
{
  "roleId": "111222333"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Role dead updated",
  "roleType": "dead",
  "roleId": "111222333"
}
```

---

## Feature Toggles

### Get All Features
Returns all feature toggle states for a guild.

```
GET /api/settings/:guildId/features
```

**Response:**
```json
{
  "success": true,
  "guildId": "123456789",
  "tier": "basic",
  "features": {
    "mafia": true,
    "moderation": true,
    "team_builder": false
  }
}
```

### Toggle a Feature
Enable or disable a specific feature.

```
POST /api/settings/:guildId/features/:featureName
```

**Valid Features:**
| Feature | Description | Tier |
|---------|-------------|------|
| `trivia` | Trivia games | Free |
| `alerts` | Alert system | Free |
| `gambling` | Economy gambling | Free |
| `wordle` | Wordle games | Free |
| `mafia` | Mafia game | Free |
| `moderation` | Moderation tools | Free |
| `clips` | Clip submissions | Free |
| `bump_reminder` | Server bump reminders | Free |
| `birthdays` | Birthday tracking | Basic |
| `bounties` | Bounty system | Basic |
| `team_builder` | Valorant team builder | Basic |
| `valorant` | Valorant API features | Premium |

**Request Body:**
```json
{
  "enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Feature mafia enabled",
  "featureName": "mafia",
  "enabled": true
}
```

---

## Error Responses

### 400 Bad Request
Invalid channel/role/feature type.
```json
{
  "success": false,
  "error": "Invalid channel type. Valid types: trivia, wordle, ..."
}
```

### 401 Unauthorized
Missing or invalid authentication.
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

### 403 Forbidden
Tier requirement not met.
```json
{
  "success": false,
  "error": "Forbidden: Higher subscription tier required",
  "tier": {
    "current": "free",
    "required": "basic"
  }
}
```

### 500 Server Error
Internal error.
```json
{
  "success": false,
  "error": "Error message details"
}
```

---

## Frontend Implementation Example

### Channel Selector Component
```jsx
// Fetch available channels for dropdown
const fetchChannels = async (guildId, type = 'text') => {
  const res = await fetch(
    `/api/settings/${guildId}/available-channels?type=${type}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json();
};

// Save channel selection
const saveChannel = async (guildId, channelType, channelId) => {
  const res = await fetch(
    `/api/settings/${guildId}/channels/${channelType}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channelId }),
    }
  );
  return res.json();
};
```

### Settings Page Structure
```
Settings
├── Channels
│   ├── Mafia Text Channel (dropdown)
│   ├── Mafia Voice Channel (dropdown)
│   ├── Graveyard Channel (dropdown)
│   ├── Alerts Channel (dropdown)
│   └── ...
├── Roles
│   ├── Dead Role (dropdown)
│   ├── Valorant Team Role (dropdown) [Basic+]
│   ├── Valorant Inhouse Role (dropdown) [Basic+]
│   └── ...
└── Features
    ├── Mafia (toggle)
    ├── Moderation (toggle)
    ├── Team Builder (toggle) [Basic+]
    └── ...
```

---

## Tier System

| Tier | Value | Description |
|------|-------|-------------|
| `free` | 0 | Default tier, basic features |
| `basic` | 1 | Expanded features (team builder, birthdays) |
| `premium` | 2 | API-intensive features (Valorant API) |
| `enterprise` | 3 | Custom branding, priority support |

Settings locked to a higher tier will return a `403` error with tier info.
