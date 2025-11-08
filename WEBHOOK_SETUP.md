# Mafia Webhook API - Quick Start Guide

This guide will help you set up the webhook integration to control Discord voice chat from your website version of the mafia game.

## What Does This Do?

The Mafia Webhook API allows your website to:
- **Mute/unmute players** in Discord voice chat
- **Deafen/undeafen players** in Discord voice chat
- **Get current game state** and player information
- **Perform bulk operations** for phase transitions (e.g., mute everyone during night phase)

This means you can build a web-based mafia game interface while still using Discord for voice communication!

## Setup Instructions

### 1. Install Dependencies

The required packages (Express and CORS) have already been added to `package.json`. Just run:

```bash
npm install
```

### 2. Configure Environment Variables

Create or update your `.env` file with these settings:

```env
# Your existing Discord bot token
DISCORD_BOT_TOKEN=your_discord_bot_token_here

# Mafia Webhook API Configuration
MAFIA_WEBHOOK_PORT=3001
MAFIA_WEBHOOK_SECRET=your_secure_random_secret_here
MAFIA_WEB_ORIGIN=http://localhost:8080
```

**Important:**
- **MAFIA_WEBHOOK_SECRET**: Generate a strong random secret (e.g., use a password generator). This is used to authenticate requests from your website.
- **MAFIA_WEB_ORIGIN**: Set this to your website's URL. Use `*` for development (allows all origins), but use specific URLs in production.

### 3. Start the Bot

Run the bot as normal:

```bash
npm start
```

You should see these log messages:
```
✅ Mafia Webhook API server listening on port 3001
🔒 Webhook authentication is ENABLED
```

If you see:
```
⚠️  Webhook authentication is DISABLED (set MAFIA_WEBHOOK_SECRET to enable)
```

Make sure you've set `MAFIA_WEBHOOK_SECRET` in your `.env` file.

### 4. Test the API

Open the example web interface:

```bash
# On Windows
start docs/mafia-webhook-example.html

# On Mac/Linux
open docs/mafia-webhook-example.html
```

Or simply open `docs/mafia-webhook-example.html` in your web browser.

In the example page:
1. Enter your webhook API URL (default: `http://localhost:3001`)
2. Enter your webhook secret (the same value as `MAFIA_WEBHOOK_SECRET`)
3. Enter your Discord guild (server) ID
4. Click "Test Connection" to verify everything works

## API Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Check if API is online |
| `/api/game/:guildId` | GET | Get current game state |
| `/api/voice/members/:guildId` | GET | Get all voice channel members |
| `/api/voice/mute` | POST | Mute a specific player |
| `/api/voice/unmute` | POST | Unmute a specific player |
| `/api/voice/deafen` | POST | Deafen a specific player |
| `/api/voice/undeafen` | POST | Undeafen a specific player |
| `/api/voice/bulk` | POST | Perform multiple operations at once |

## Quick Integration Example

Here's a simple example of how to use the API from your website:

```javascript
const API_URL = 'http://localhost:3001';
const WEBHOOK_SECRET = 'your_secret_here';
const GUILD_ID = 'your_discord_server_id';

// Mute a player during night phase
async function mutePlayer(userId) {
  const response = await fetch(`${API_URL}/api/voice/mute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WEBHOOK_SECRET}`
    },
    body: JSON.stringify({
      userId: userId,
      guildId: GUILD_ID,
      reason: 'Night phase'
    })
  });

  const result = await response.json();
  console.log(result);
}

// Get current game state
async function getGameState() {
  const response = await fetch(`${API_URL}/api/game/${GUILD_ID}`, {
    headers: {
      'Authorization': `Bearer ${WEBHOOK_SECRET}`
    }
  });

  const result = await response.json();
  return result.game;
}

// Mute all players at once (night phase)
async function startNightPhase(playerIds) {
  const operations = playerIds.map(id => ({
    userId: id,
    mute: true,
    reason: 'Night phase - discussion locked'
  }));

  const response = await fetch(`${API_URL}/api/voice/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${WEBHOOK_SECRET}`
    },
    body: JSON.stringify({
      guildId: GUILD_ID,
      operations: operations
    })
  });

  return await response.json();
}
```

## Architecture Overview

```
┌─────────────────────┐
│   Your Website      │
│   (Mafia Game UI)   │
└──────────┬──────────┘
           │ HTTPS/HTTP
           │ (Authenticated with Bearer Token)
           ▼
┌─────────────────────────────┐
│  Mafia Webhook API Server   │
│  (Express.js on port 3001)  │
└──────────┬──────────────────┘
           │
           │ Discord.js API
           ▼
┌─────────────────────────────┐
│     Discord Bot             │
│  (Controls Voice Channel)   │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Discord Voice Channel      │
│  (Players in VC)            │
└─────────────────────────────┘
```

## Security Best Practices

1. **Generate a strong webhook secret**:
   ```bash
   # Generate a random secret (Linux/Mac)
   openssl rand -hex 32

   # Or use an online generator
   # https://randomkeygen.com/
   ```

2. **Never commit secrets to git**:
   - Your `.env` file should be in `.gitignore`
   - Use environment variables for production deployments

3. **Use HTTPS in production**:
   - Deploy behind a reverse proxy (nginx, Apache)
   - Use Let's Encrypt for free SSL certificates

4. **Restrict CORS origins**:
   ```env
   # Development
   MAFIA_WEB_ORIGIN=*

   # Production
   MAFIA_WEB_ORIGIN=https://yourgame.com
   ```

5. **Add rate limiting** (optional for production):
   ```javascript
   // Example using express-rate-limit
   const rateLimit = require('express-rate-limit');

   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100 // limit each IP to 100 requests per windowMs
   });

   app.use('/api/', limiter);
   ```

## Troubleshooting

### Port Already in Use

If you see `Port 3001 is already in use`:

1. Change the port in `.env`:
   ```env
   MAFIA_WEBHOOK_PORT=3002
   ```

2. Or kill the process using that port:
   ```bash
   # Windows
   netstat -ano | findstr :3001
   taskkill /PID <PID> /F

   # Linux/Mac
   lsof -ti:3001 | xargs kill
   ```

### Authentication Errors

- **401 Unauthorized**: Check that `MAFIA_WEBHOOK_SECRET` matches in both `.env` and your web application
- Make sure you're sending the `Authorization: Bearer <secret>` header

### CORS Errors

If you see CORS errors in your browser console:

1. Check `MAFIA_WEB_ORIGIN` in `.env`
2. For development, try setting it to `*`
3. Make sure your website URL matches the origin setting

### Connection Refused

- Ensure the bot is running
- Check that the port is correct
- Verify firewall settings aren't blocking the port

## Disable the Webhook Server

If you want to disable the webhook server:

```env
MAFIA_WEBHOOK_ENABLED=false
```

Or simply don't set `MAFIA_WEBHOOK_SECRET`.

## Next Steps

1. **Read the full API documentation**: [api/README.md](api/README.md)
2. **Explore the example interface**: [docs/mafia-webhook-example.html](docs/mafia-webhook-example.html)
3. **Build your web application**: Use the API to create your mafia game interface
4. **Deploy to production**: Set up HTTPS, proper CORS, and secure your webhook secret

## Need Help?

- Check the [API documentation](api/README.md) for detailed endpoint information
- Review the [example HTML page](docs/mafia-webhook-example.html) source code
- Look at the [webhook server implementation](api/mafiaWebhookServer.js)

## Files Created

This webhook integration includes:

- **[api/mafiaWebhookServer.js](api/mafiaWebhookServer.js)** - Main webhook server implementation
- **[api/README.md](api/README.md)** - Complete API documentation
- **[docs/mafia-webhook-example.html](docs/mafia-webhook-example.html)** - Interactive example interface
- **[.env.example](.env.example)** - Updated with webhook configuration
- **[index.js](index.js)** - Updated to start webhook server
- **[events/mafiaHandler.js](events/mafiaHandler.js)** - Updated to expose game state

Happy coding! 🐝
