# Bot Settings & API Documentation

This document describes the configuration settings available for the bot and how to manage them via the REST API.

## 1. Available Settings

Settings are key-value pairs stored per-guild in the Convex database.

| Setting Key          | Type      | Default             | Description                                                                                           |
| :------------------- | :-------- | :------------------ | :---------------------------------------------------------------------------------------------------- |
| `features.trivia`    | `boolean` | `true`              | Enables/disables the daily trivia posting feature.                                                    |
| `features.alerts`    | `boolean` | `true`              | Enables/disables keyword alerting in chat.                                                            |
| `features.gambling`  | `boolean` | `true`              | Enables economy games (Blackjack, Roulette, etc.).                                                    |
| `features.wordle`    | `boolean` | `true`              | Enables daily Wordle game.                                                                            |
| `features.birthdays` | `boolean` | `false`             | Enables birthday tracking and wishes. (Requires Basic Tier)                                           |
| `features.bounties`  | `boolean` | `false`             | Enables bounty system. (Requires Basic Tier)                                                          |
| `features.valorant`  | `boolean` | `false`             | Enables Valorant team tracking. (Requires Premium Tier)                                               |
| `channels.updates`   | `string`  | `null`              | Channel ID for bot announcements.                                                                     |
| `openaiApiKey`       | `string`  | _(Global Fallback)_ | Custom OpenAI API Key for this specific server. Overrides the global env var. (Requires Premium Tier) |

_Note: New settings can be added arbitrarily as the system supports dynamic key-value storage._

---

## 2. API Reference

The bot exposes a REST API to manage these settings programmatically. This is useful for building web dashboards or external configuration tools.

### Base Configuration

- **Port**: Default is `8080` (or `process.env.PORT`).
- **Base URL**: `http://<bot-host>:8080/api/settings`
- **Authentication**: Required for all requests.
  - **Header**: `X-API-Key: <your-secret>`
  - **Secret**: Set via `SETTINGS_API_KEY` env var (defaults to `process.env.MAFIA_WEBHOOK_SECRET` or "default-secret").

### Endpoints

#### `GET /api/settings/:guildId`

Retrieves all settings for a specific guild.

**Response:**

```json
{
  "success": true,
  "guildId": "123456789",
  "settings": {
    "features": {
      "trivia": true,
      "alerts": false
    },
    "openaiApiKey": "sk-..."
  }
}
```

#### `POST /api/settings/:guildId`

Updates a specific setting. Nested keys are supported using dot notation.

**Body Parameters:**

- `key` (string): The setting key (e.g., "features.trivia" or "openaiApiKey").
- `value` (any): The new value.

**Request:**

```json
{
  "key": "features.trivia",
  "value": false
}
```

**Response:**

```json
{
  "success": true,
  "message": "Setting updated",
  "settings": { ...new_settings_object... }
}
```

---

## 3. Usage Examples

### Disable Trivia for a Guild

```bash
curl -X POST http://localhost:8080/api/settings/YOUR_GUILD_ID \
  -H "Content-Type: application/json" \
  -H "X-API-Key: default-secret" \
  -d '{"key": "features.trivia", "value": false}'
```

### Set Custom OpenAI Key

```bash
curl -X POST http://localhost:8080/api/settings/YOUR_GUILD_ID \
  -H "Content-Type: application/json" \
  -H "X-API-Key: default-secret" \
  -d '{"key": "openaiApiKey", "value": "sk-proj-1234..."}'
```

### Get All Settings

```bash
curl -H "X-API-Key: default-secret" http://localhost:8080/api/settings/YOUR_GUILD_ID
```
