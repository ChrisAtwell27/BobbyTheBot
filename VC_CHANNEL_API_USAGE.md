# Voice Channel API Usage Guide

## 🎯 New VC Channel Endpoints

I've added two powerful endpoints that let you mute/unmute **everyone** in a voice channel at once - perfect for your mafia game website!

---

## 📡 Endpoints

### 1. Mute Everyone in Voice Channel

**Endpoint:** `POST /api/voice/channel/mute`

**Use Case:** Mute all players at once during night phase

**Request:**
```javascript
const API_URL = 'https://bobby-the-bot-i76i6.ondigitalocean.app';
const WEBHOOK_SECRET = 'a75bba994a6b37cd0adb25c384cc68ef901fa0edfbfc32bb8b5d7d219268704c';
const GUILD_ID = '701308904877064193';

// Mute everyone in the default mafia VC
await fetch(`${API_URL}/api/voice/channel/mute`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WEBHOOK_SECRET}`
  },
  body: JSON.stringify({
    guildId: GUILD_ID,
    reason: 'Night phase started'
  })
});

// Or specify a custom channel ID
await fetch(`${API_URL}/api/voice/channel/mute`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WEBHOOK_SECRET}`
  },
  body: JSON.stringify({
    channelId: '1434636519380881508',  // Custom VC ID
    guildId: GUILD_ID,
    reason: 'Night phase started'
  })
});
```

**Response:**
```json
{
  "success": true,
  "message": "Muted 8 of 8 members in voice channel",
  "channelId": "1434633691455426600",
  "results": [
    {
      "userId": "123456789",
      "username": "Player1",
      "success": true,
      "muted": true
    },
    {
      "userId": "987654321",
      "username": "Player2",
      "success": true,
      "muted": true
    }
    // ... more players
  ]
}
```

---

### 2. Unmute Everyone in Voice Channel

**Endpoint:** `POST /api/voice/channel/unmute`

**Use Case:** Unmute all players at once during day phase

**Request:**
```javascript
// Unmute everyone in the default mafia VC
await fetch(`${API_URL}/api/voice/channel/unmute`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${WEBHOOK_SECRET}`
  },
  body: JSON.stringify({
    guildId: GUILD_ID,
    reason: 'Day phase started'
  })
});
```

**Response:**
```json
{
  "success": true,
  "message": "Unmuted 8 of 8 members in voice channel",
  "channelId": "1434633691455426600",
  "results": [
    {
      "userId": "123456789",
      "username": "Player1",
      "success": true,
      "muted": false
    }
    // ... more players
  ]
}
```

---

## 🎮 Integration with Your Mafia Game

### Night Phase (Mute Everyone)

```javascript
async function startNightPhase() {
  const response = await fetch(`${API_URL}/api/voice/channel/mute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WEBHOOK_SECRET}`
    },
    body: JSON.stringify({
      guildId: GUILD_ID,
      reason: 'Night phase - discussion locked'
    })
  });

  const result = await response.json();
  console.log(`Muted ${result.results.filter(r => r.success).length} players`);

  return result;
}
```

### Day Phase (Unmute Everyone)

```javascript
async function startDayPhase() {
  const response = await fetch(`${API_URL}/api/voice/channel/unmute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WEBHOOK_SECRET}`
    },
    body: JSON.stringify({
      guildId: GUILD_ID,
      reason: 'Day phase - discussion open'
    })
  });

  const result = await response.json();
  console.log(`Unmuted ${result.results.filter(r => r.success).length} players`);

  return result;
}
```

### Error Handling

```javascript
async function toggleVoiceChannel(action) {
  try {
    const endpoint = action === 'mute'
      ? '/api/voice/channel/mute'
      : '/api/voice/channel/unmute';

    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${WEBHOOK_SECRET}`
      },
      body: JSON.stringify({
        guildId: GUILD_ID,
        reason: `Phase transition - ${action}`
      })
    });

    const result = await response.json();

    if (!result.success) {
      console.error(`Failed to ${action}:`, result.error);
      return false;
    }

    // Check if any individual operations failed
    const failures = result.results.filter(r => !r.success);
    if (failures.length > 0) {
      console.warn(`${failures.length} players failed to ${action}:`, failures);
    }

    return true;
  } catch (error) {
    console.error(`Error ${action}ing voice channel:`, error);
    return false;
  }
}

// Usage
await toggleVoiceChannel('mute');    // Night phase
await toggleVoiceChannel('unmute');  // Day phase
```

---

## 📝 Request Parameters

### Required:
- **`guildId`** (string): Your Discord server ID
  - Example: `"701308904877064193"`

### Optional:
- **`channelId`** (string): Specific voice channel ID to control
  - Default: `"1434633691455426600"` (the mafia VC)
  - Example: `"1434636519380881508"`
- **`reason`** (string): Reason for the action (shows in Discord audit log)
  - Default: `"Muted/Unmuted via webhook - channel operation"`
  - Example: `"Night phase started"`

---

## 🔑 Default Voice Channel IDs

The API has these defaults built-in:

- **Default Mafia VC**: `1434633691455426600`
- **Your Requested VC**: `1434636519380881508` (you can specify this via `channelId` parameter)

If you don't provide a `channelId`, it uses the default mafia VC.

---

## 🆚 When to Use Each Endpoint

### Use VC Channel Endpoints (`/api/voice/channel/mute`)
✅ **When:** You want to mute/unmute **everyone** in the voice channel
✅ **Best for:**
- Phase transitions (night → day)
- Starting/ending games
- Emergency controls

### Use Individual Endpoints (`/api/voice/mute`)
✅ **When:** You need to control **specific players**
✅ **Best for:**
- Role-specific muting (like Keller Bee)
- Dead players
- Individual penalties/effects

---

## 🚀 Complete Example: Mafia Game Phases

```javascript
class MafiaGame {
  constructor() {
    this.apiUrl = 'https://bobby-the-bot-i76i6.ondigitalocean.app';
    this.secret = 'a75bba994a6b37cd0adb25c384cc68ef901fa0edfbfc32bb8b5d7d219268704c';
    this.guildId = '701308904877064193';
  }

  async muteAll(reason) {
    const response = await fetch(`${this.apiUrl}/api/voice/channel/mute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.secret}`
      },
      body: JSON.stringify({
        guildId: this.guildId,
        reason
      })
    });
    return await response.json();
  }

  async unmuteAll(reason) {
    const response = await fetch(`${this.apiUrl}/api/voice/channel/unmute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.secret}`
      },
      body: JSON.stringify({
        guildId: this.guildId,
        reason
      })
    });
    return await response.json();
  }

  async startNightPhase() {
    console.log('Starting night phase...');
    const result = await this.muteAll('Night phase - discussion locked');
    console.log(`Muted ${result.results?.filter(r => r.success).length || 0} players`);
  }

  async startDayPhase() {
    console.log('Starting day phase...');
    const result = await this.unmuteAll('Day phase - discussion open');
    console.log(`Unmuted ${result.results?.filter(r => r.success).length || 0} players`);
  }

  async startVotingPhase() {
    // Keep everyone unmuted during voting
    console.log('Starting voting phase...');
    await this.unmuteAll('Voting phase');
  }

  async endGame() {
    console.log('Game ended - unmuting all');
    await this.unmuteAll('Game ended');
  }
}

// Usage
const game = new MafiaGame();

// Game flow
await game.startNightPhase();   // Everyone muted
// ... night actions happen ...

await game.startDayPhase();     // Everyone unmuted
// ... discussion happens ...

await game.startVotingPhase();  // Everyone stays unmuted
// ... voting happens ...

await game.endGame();            // Cleanup
```

---

## 🎯 Quick Reference

| Action | Endpoint | Method | Use Case |
|--------|----------|--------|----------|
| Mute all in VC | `/api/voice/channel/mute` | POST | Night phase, game start |
| Unmute all in VC | `/api/voice/channel/unmute` | POST | Day phase, game end |
| Mute one player | `/api/voice/mute` | POST | Dead player, role effect |
| Unmute one player | `/api/voice/unmute` | POST | Remove role effect |
| Get VC members | `/api/voice/members/:guildId` | GET | Check who's in VC |
| Bulk operations | `/api/voice/bulk` | POST | Complex scenarios |

---

## 🔒 Security Notes

- Keep your `WEBHOOK_SECRET` secure
- Never expose it in client-side JavaScript
- Use a backend server to proxy requests if needed
- The secret is: `a75bba994a6b37cd0adb25c384cc68ef901fa0edfbfc32bb8b5d7d219268704c`

---

## ✅ Testing

Once deployed (watch: https://cloud.digitalocean.com/apps), test with:

```bash
curl -X POST https://bobby-the-bot-i76i6.ondigitalocean.app/api/voice/channel/mute \
  -H "Authorization: Bearer a75bba994a6b37cd0adb25c384cc68ef901fa0edfbfc32bb8b5d7d219268704c" \
  -H "Content-Type: application/json" \
  -d '{"guildId":"701308904877064193","reason":"Testing VC mute"}'
```

Happy coding! 🐝🎮
