# Mafia Webhook API

This API allows external applications (like a website) to control Discord voice channel muting and deafening during mafia games.

## Installation

Install the required dependencies:

```bash
npm install express cors
```

## Configuration

Add these environment variables to your `.env` file:

```env
# Mafia Webhook API Configuration
MAFIA_WEBHOOK_PORT=3001
MAFIA_WEBHOOK_SECRET=your_secure_random_secret_here
MAFIA_WEB_ORIGIN=http://localhost:8080
MAFIA_WEBHOOK_ENABLED=true  # Set to false to disable the webhook server
```

### Environment Variables

- **MAFIA_WEBHOOK_PORT**: Port for the webhook API server (default: 3001)
- **MAFIA_WEBHOOK_SECRET**: Secret token for authentication (highly recommended for production)
- **MAFIA_WEB_ORIGIN**: Allowed CORS origin for your web application (default: *)
- **MAFIA_WEBHOOK_ENABLED**: Set to `false` to disable the webhook server (default: enabled)

## Authentication

The API supports two authentication methods:

### 1. Bearer Token (Recommended)

Add the `Authorization` header with your webhook secret:

```javascript
headers: {
  'Authorization': 'Bearer your_secret_here',
  'Content-Type': 'application/json'
}
```

### 2. HMAC Signature

Sign your request body with HMAC-SHA256 and include the signature in the `X-Webhook-Signature` header:

```javascript
const crypto = require('crypto');
const payload = JSON.stringify(requestBody);
const signature = crypto
  .createHmac('sha256', webhookSecret)
  .update(payload)
  .digest('hex');

headers: {
  'X-Webhook-Signature': signature,
  'Content-Type': 'application/json'
}
```

## API Endpoints

### Health Check

```http
GET /health
```

Returns the API status.

**Response:**
```json
{
  "success": true,
  "service": "Mafia Webhook API",
  "status": "online",
  "timestamp": "2025-11-08T12:00:00.000Z"
}
```

---

### Get Game State

```http
GET /api/game/:guildId
```

Get the current game state for a guild.

**Parameters:**
- `guildId` (path): Discord guild ID

**Response:**
```json
{
  "success": true,
  "game": {
    "guildId": "123456789",
    "phase": "night",
    "day": 1,
    "isActive": true,
    "players": [
      {
        "id": "987654321",
        "name": "PlayerName",
        "isAlive": true,
        "role": "Beekeeper Bee"
      }
    ],
    "voiceMembers": [
      {
        "id": "987654321",
        "username": "PlayerName",
        "displayName": "Player Display Name",
        "muted": true,
        "deafened": false
      }
    ]
  }
}
```

---

### Get Voice Channel Members

```http
GET /api/voice/members/:guildId
```

Get all members currently in the mafia voice channel.

**Parameters:**
- `guildId` (path): Discord guild ID

**Response:**
```json
{
  "success": true,
  "channelId": "1434633691455426600",
  "memberCount": 10,
  "members": [
    {
      "id": "987654321",
      "username": "PlayerName",
      "displayName": "Player Display Name",
      "muted": false,
      "deafened": false,
      "selfMuted": false,
      "selfDeafened": false
    }
  ]
}
```

---

### Mute User

```http
POST /api/voice/mute
```

Mute a specific user in voice chat.

**Request Body:**
```json
{
  "userId": "987654321",
  "guildId": "123456789",
  "reason": "Night phase"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Muted PlayerName",
  "userId": "987654321",
  "muted": true
}
```

---

### Unmute User

```http
POST /api/voice/unmute
```

Unmute a specific user in voice chat.

**Request Body:**
```json
{
  "userId": "987654321",
  "guildId": "123456789",
  "reason": "Day phase"
}
```

---

### Deafen User

```http
POST /api/voice/deafen
```

Deafen a specific user in voice chat.

**Request Body:**
```json
{
  "userId": "987654321",
  "guildId": "123456789",
  "reason": "Special role ability"
}
```

---

### Undeafen User

```http
POST /api/voice/undeafen
```

Undeafen a specific user in voice chat.

**Request Body:**
```json
{
  "userId": "987654321",
  "guildId": "123456789",
  "reason": "Ability expired"
}
```

---

### Bulk Voice Operations

```http
POST /api/voice/bulk
```

Perform multiple voice control operations at once (useful for phase transitions).

**Request Body:**
```json
{
  "guildId": "123456789",
  "operations": [
    {
      "userId": "111111111",
      "mute": true,
      "deafen": false,
      "reason": "Night phase"
    },
    {
      "userId": "222222222",
      "mute": true,
      "deafen": true,
      "reason": "Dead player"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Processed 2 operations",
  "results": [
    {
      "userId": "111111111",
      "success": true,
      "muted": true,
      "deafened": false
    },
    {
      "userId": "222222222",
      "success": true,
      "muted": true,
      "deafened": true
    }
  ]
}
```

---

## Usage Examples

### JavaScript/Fetch

```javascript
const API_URL = 'http://localhost:3001';
const WEBHOOK_SECRET = 'your_secret_here';

// Mute a player
async function mutePlayer(userId, guildId) {
  const response = await fetch(`${API_URL}/api/voice/mute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WEBHOOK_SECRET}`
    },
    body: JSON.stringify({
      userId,
      guildId,
      reason: 'Muted via web interface'
    })
  });

  return await response.json();
}

// Get game state
async function getGameState(guildId) {
  const response = await fetch(`${API_URL}/api/game/${guildId}`, {
    headers: {
      'Authorization': `Bearer ${WEBHOOK_SECRET}`
    }
  });

  return await response.json();
}

// Bulk mute all players for night phase
async function nightPhase(guildId, playerIds) {
  const operations = playerIds.map(id => ({
    userId: id,
    mute: true,
    reason: 'Night phase'
  }));

  const response = await fetch(`${API_URL}/api/voice/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WEBHOOK_SECRET}`
    },
    body: JSON.stringify({ guildId, operations })
  });

  return await response.json();
}
```

### Python

```python
import requests

API_URL = 'http://localhost:3001'
WEBHOOK_SECRET = 'your_secret_here'

def mute_player(user_id, guild_id):
    response = requests.post(
        f'{API_URL}/api/voice/mute',
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {WEBHOOK_SECRET}'
        },
        json={
            'userId': user_id,
            'guildId': guild_id,
            'reason': 'Muted via Python script'
        }
    )
    return response.json()

def get_game_state(guild_id):
    response = requests.get(
        f'{API_URL}/api/game/{guild_id}',
        headers={'Authorization': f'Bearer {WEBHOOK_SECRET}'}
    )
    return response.json()
```

### cURL

```bash
# Health check (no auth required)
curl http://localhost:3001/health

# Get game state
curl -H "Authorization: Bearer your_secret_here" \
  http://localhost:3001/api/game/123456789

# Mute a player
curl -X POST http://localhost:3001/api/voice/mute \
  -H "Authorization: Bearer your_secret_here" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "987654321",
    "guildId": "123456789",
    "reason": "Night phase"
  }'
```

---

## Web Interface Example

A complete web interface example is available at [docs/mafia-webhook-example.html](../docs/mafia-webhook-example.html).

Open it in a browser and configure:
1. Webhook API URL (e.g., `http://localhost:3001`)
2. Your webhook secret
3. Your Discord guild ID

The interface allows you to:
- Test the connection
- View current game state
- Control individual player voice states
- See real-time mute/deafen status

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error description",
  "message": "Detailed error message"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad request (missing parameters)
- `401` - Unauthorized (invalid or missing authentication)
- `404` - Not found (no active game or resource)
- `500` - Internal server error

---

## Security Considerations

1. **Always use HTTPS in production** - Never send the webhook secret over unencrypted connections
2. **Keep your webhook secret secure** - Don't commit it to version control
3. **Restrict CORS origins** - Set `MAFIA_WEB_ORIGIN` to your specific domain in production
4. **Use environment variables** - Never hardcode secrets in your code
5. **Rate limiting** - Consider adding rate limiting for production use
6. **Network security** - Use firewall rules to restrict API access to trusted IPs

---

## Integration with Game Phases

Here's how you might integrate with mafia game phases:

```javascript
// Example: Handle phase transitions
async function handlePhaseTransition(phase, guildId, players) {
  const API_URL = 'http://localhost:3001';
  const WEBHOOK_SECRET = process.env.MAFIA_WEBHOOK_SECRET;

  let operations = [];

  switch(phase) {
    case 'night':
      // Mute all alive players
      operations = players
        .filter(p => p.isAlive)
        .map(p => ({
          userId: p.id,
          mute: true,
          reason: 'Night phase - discussion locked'
        }));
      break;

    case 'day':
      // Unmute alive players
      operations = players
        .filter(p => p.isAlive)
        .map(p => ({
          userId: p.id,
          mute: false,
          reason: 'Day phase - discussion open'
        }));
      break;

    case 'voting':
      // Similar to day phase
      operations = players
        .filter(p => p.isAlive)
        .map(p => ({
          userId: p.id,
          mute: false,
          reason: 'Voting phase'
        }));
      break;
  }

  const response = await fetch(`${API_URL}/api/voice/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WEBHOOK_SECRET}`
    },
    body: JSON.stringify({ guildId, operations })
  });

  return await response.json();
}
```

---

## Troubleshooting

### Port already in use
If port 3001 is already in use, change `MAFIA_WEBHOOK_PORT` in your `.env` file.

### Authentication failures
- Verify `MAFIA_WEBHOOK_SECRET` is set correctly in `.env`
- Check that the `Authorization` header includes `Bearer ` prefix
- Ensure the secret matches between your bot and web application

### CORS errors
- Set `MAFIA_WEB_ORIGIN` to your web application's URL
- For development, you can use `*` to allow all origins (not recommended for production)

### User not in voice channel
Ensure the user you're trying to control is actually in the mafia voice channel before sending API requests.

---

## License

Part of BobbyTheBot project.
