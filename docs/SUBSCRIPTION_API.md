# Subscription Verification API Documentation

This document provides complete documentation for the Subscription Verification API, which allows your website to verify if users have the Discord bot installed in their servers.

## Table of Contents

1. [Overview](#overview)
2. [Environment Variables](#environment-variables)
3. [Authentication](#authentication)
4. [Clerk Integration](#clerk-integration)
5. [API Endpoints](#api-endpoints)
6. [Error Handling](#error-handling)
7. [Examples](#examples)
8. [Database Schema](#database-schema)

---

## Overview

The Subscription Verification API provides endpoints to:
- Verify if a Discord user has the bot installed in any of their servers
- Manage subscription tiers and statuses
- Link subscriptions with Clerk authentication
- Track verified guilds for each user

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Your Website  │────▶│ Subscription API │────▶│   Discord API   │
│   (with Clerk)  │     │    (Port 3002)   │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │     MongoDB      │
                        │  (Subscriptions) │
                        └──────────────────┘
```

### Verification Flow

1. User signs into your website using Clerk with Discord as the OAuth provider
2. Your website retrieves the Discord OAuth access token from Clerk
3. Website calls the verification endpoint with the Discord token
4. API fetches the user's Discord guilds
5. API checks which guilds have your bot installed
6. Returns verification status and subscription info

---

## Environment Variables

Add these to your `.env` file:

```env
# Subscription API Configuration
SUBSCRIPTION_API_ENABLED=true          # Set to 'false' to disable the API
SUBSCRIPTION_API_PORT=3002             # Port for the subscription API (default: 3002)
SUBSCRIPTION_API_SECRET=your-secret    # API key for authentication (REQUIRED for production)
SUBSCRIPTION_WEB_ORIGIN=http://localhost:3000  # CORS allowed origin (default: *)

# Multiple origins supported (comma-separated):
# SUBSCRIPTION_WEB_ORIGIN=http://localhost:3000,https://staging.mysite.com,https://mysite.com
```

### Required Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUBSCRIPTION_API_ENABLED` | No | `true` | Enable/disable the subscription API |
| `SUBSCRIPTION_API_PORT` | No | `3002` | Port the API listens on |
| `SUBSCRIPTION_API_SECRET` | **Yes*** | `null` | API secret for authentication |
| `SUBSCRIPTION_WEB_ORIGIN` | No | `*` | CORS allowed origins (comma-separated for multiple) |

*Required for production use. Without it, authentication is disabled.

### Development vs Production

**For local development:**
```env
SUBSCRIPTION_WEB_ORIGIN=http://localhost:3000
```

**For production:**
```env
SUBSCRIPTION_WEB_ORIGIN=https://your-website.com
```

**For multiple environments:**
```env
SUBSCRIPTION_WEB_ORIGIN=http://localhost:3000,https://staging.mysite.com,https://mysite.com
```

---

## Authentication

All endpoints (except `/health` and `/api/subscription/bot-info`) require authentication.

### Using API Key Header

```http
X-API-Key: your-api-secret
```

### Using Bearer Token

```http
Authorization: Bearer your-api-secret
```

### Example with cURL

```bash
curl -X POST https://your-bot-api.com:3002/api/subscription/verify \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-secret" \
  -H "X-Discord-Token: user-discord-oauth-token" \
  -d '{}'
```

---

## Clerk Integration

### Setting Up Discord OAuth in Clerk

1. Go to Clerk Dashboard > User & Authentication > Social Connections
2. Enable Discord
3. Add the following scopes: `identify`, `guilds`
4. Save your configuration

### Getting Discord Token from Clerk (Server-Side)

```typescript
// Next.js API Route Example
import { clerkClient } from '@clerk/nextjs/server';

export async function POST(request: Request) {
  const { userId } = await request.json();

  // Get the Discord OAuth token from Clerk
  const [oauthToken] = await clerkClient.users.getUserOauthAccessToken(
    userId,
    'oauth_discord'
  );

  if (!oauthToken) {
    return Response.json({ error: 'Discord not connected' }, { status: 400 });
  }

  // Call your bot's subscription API
  const response = await fetch('https://your-bot-api.com:3002/api/subscription/verify-clerk', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': process.env.SUBSCRIPTION_API_SECRET!,
    },
    body: JSON.stringify({
      clerkUserId: userId,
      discordToken: oauthToken.token,
    }),
  });

  return Response.json(await response.json());
}
```

### React Hook Example

```typescript
// hooks/useSubscription.ts
import { useUser } from '@clerk/nextjs';
import { useState, useEffect } from 'react';

interface SubscriptionStatus {
  verified: boolean;
  tier: string;
  guilds: Array<{ guildId: string; guildName: string }>;
  inviteUrl?: string;
}

export function useSubscription() {
  const { user } = useUser();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    async function checkSubscription() {
      try {
        const res = await fetch('/api/verify-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        });

        const data = await res.json();

        if (data.success) {
          setStatus({
            verified: data.verified,
            tier: data.subscription.tier,
            guilds: data.guilds.verified,
            inviteUrl: data.inviteUrl,
          });
        } else {
          setError(data.message);
        }
      } catch (err) {
        setError('Failed to check subscription');
      } finally {
        setLoading(false);
      }
    }

    checkSubscription();
  }, [user]);

  return { status, loading, error };
}
```

---

## API Endpoints

### Health Check

#### `GET /health`

Returns API health status.

**Authentication:** Not required

**Response:**
```json
{
  "success": true,
  "service": "Subscription Verification API",
  "status": "online",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "botConnected": true,
  "guildCount": 42
}
```

---

### Bot Info

#### `GET /api/subscription/bot-info`

Returns bot information and invite URL.

**Authentication:** Not required

**Response:**
```json
{
  "success": true,
  "bot": {
    "id": "123456789012345678",
    "username": "BobbyTheBot",
    "discriminator": "0",
    "avatar": "abc123",
    "inviteUrl": "https://discord.com/api/oauth2/authorize?client_id=123456789012345678&permissions=8&scope=bot%20applications.commands"
  }
}
```

---

### Verify User (Standard)

#### `POST /api/subscription/verify`

Verify if a user has the bot installed and create/update their subscription.

**Authentication:** Required

**Headers:**
- `X-API-Key` or `Authorization: Bearer <token>`
- `X-Discord-Token` (optional, can also be in body)

**Request Body:**
```json
{
  "discordToken": "user-discord-oauth-access-token"
}
```

**Response (Verified):**
```json
{
  "success": true,
  "verified": true,
  "user": {
    "id": "123456789012345678",
    "username": "JohnDoe",
    "avatar": "abc123",
    "globalName": "John"
  },
  "guilds": {
    "total": 15,
    "withBot": 2,
    "verified": [
      {
        "guildId": "987654321098765432",
        "guildName": "My Server",
        "guildIcon": "def456",
        "isOwner": true,
        "permissions": "2147483647"
      }
    ]
  },
  "subscription": {
    "tier": "premium",
    "status": "active",
    "features": ["basic_commands", "custom_prefix", "priority_support", "advanced_analytics", "custom_embeds", "unlimited_servers"],
    "expiresAt": "2025-12-31T23:59:59.000Z"
  }
}
```

**Response (Not Verified):**
```json
{
  "success": true,
  "verified": false,
  "user": { ... },
  "guilds": {
    "total": 15,
    "withBot": 0,
    "verified": []
  },
  "subscription": {
    "tier": "free",
    "status": "pending",
    "features": ["basic_commands"],
    "expiresAt": null
  }
}
```

---

### Verify User (Clerk)

#### `POST /api/subscription/verify-clerk`

Verify a user with Clerk integration. Links the Clerk user ID to the subscription.

**Authentication:** Required

**Request Body:**
```json
{
  "clerkUserId": "user_abc123",
  "discordToken": "user-discord-oauth-access-token",
  "discordId": "123456789012345678"  // Optional
}
```

**Response (Verified):**
```json
{
  "success": true,
  "verified": true,
  "clerkUserId": "user_abc123",
  "user": {
    "discordId": "123456789012345678",
    "username": "JohnDoe",
    "avatar": "abc123",
    "globalName": "John"
  },
  "guilds": {
    "total": 15,
    "withBot": 2,
    "verified": [ ... ]
  },
  "subscription": {
    "tier": "premium",
    "status": "active",
    "features": [ ... ],
    "expiresAt": "2025-12-31T23:59:59.000Z"
  }
}
```

**Response (Not Verified - Invite Required):**
```json
{
  "success": true,
  "verified": false,
  "clerkUserId": "user_abc123",
  "user": { ... },
  "guilds": { ... },
  "subscription": { ... },
  "action": "invite_required",
  "inviteUrl": "https://discord.com/api/oauth2/authorize?client_id=..."
}
```

---

### Lookup by Clerk User ID

#### `GET /api/subscription/clerk/:clerkUserId`

Get subscription details by Clerk user ID.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "subscription": {
    "discordId": "123456789012345678",
    "discordUsername": "JohnDoe",
    "tier": "premium",
    "status": "active",
    "botVerified": true,
    "verifiedGuilds": [ ... ],
    "features": [ ... ],
    "subscribedAt": "2024-01-01T00:00:00.000Z",
    "expiresAt": "2025-12-31T23:59:59.000Z",
    "lastVerificationCheck": "2025-01-15T10:30:00.000Z"
  }
}
```

---

### Quick Verify

#### `GET /api/subscription/verify/:discordId`

Quick check if a Discord user has verified guilds (checks database only, no Discord API call).

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "verified": true,
  "exists": true,
  "subscription": {
    "tier": "premium",
    "status": "active",
    "features": [ ... ],
    "verifiedGuilds": 2,
    "lastCheck": "2025-01-15T10:30:00.000Z",
    "expiresAt": "2025-12-31T23:59:59.000Z"
  }
}
```

---

### Check Guild

#### `GET /api/subscription/check-guild/:guildId`

Check if bot is installed in a specific guild.

**Authentication:** Required

**Response (Installed):**
```json
{
  "success": true,
  "installed": true,
  "guild": {
    "id": "987654321098765432",
    "name": "My Server",
    "memberCount": 1500,
    "icon": "https://cdn.discordapp.com/icons/..."
  }
}
```

**Response (Not Installed):**
```json
{
  "success": true,
  "installed": false,
  "message": "Bot is not installed in this guild"
}
```

---

### Get Subscription

#### `GET /api/subscription/:discordId`

Get full subscription details for a Discord user.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "subscription": {
    "discordId": "123456789012345678",
    "discordUsername": "JohnDoe",
    "tier": "premium",
    "status": "active",
    "botVerified": true,
    "verifiedGuilds": [
      {
        "guildId": "987654321098765432",
        "guildName": "My Server",
        "verifiedAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "features": [ ... ],
    "subscribedAt": "2024-01-01T00:00:00.000Z",
    "expiresAt": "2025-12-31T23:59:59.000Z",
    "lastVerificationCheck": "2025-01-15T10:30:00.000Z"
  }
}
```

---

### Create/Update Subscription

#### `POST /api/subscription`

Create or update a subscription. Use this for payment webhook callbacks.

**Authentication:** Required

**Request Body:**
```json
{
  "discordId": "123456789012345678",
  "tier": "premium",
  "status": "active",
  "expiresAt": "2025-12-31T23:59:59.000Z",
  "paymentReference": "stripe_pi_abc123",
  "features": ["custom_feature"],
  "metadata": {
    "stripeCustomerId": "cus_abc123"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Subscription updated successfully",
  "subscription": {
    "discordId": "123456789012345678",
    "tier": "premium",
    "status": "active",
    "features": [ ... ],
    "expiresAt": "2025-12-31T23:59:59.000Z"
  }
}
```

---

### Cancel Subscription

#### `DELETE /api/subscription/:discordId`

Cancel a subscription (sets status to 'cancelled' and tier to 'free').

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "message": "Subscription cancelled successfully",
  "subscription": {
    "discordId": "123456789012345678",
    "status": "cancelled",
    "tier": "free"
  }
}
```

---

### List Subscriptions (Admin)

#### `GET /api/subscriptions`

List all subscriptions with optional filtering.

**Authentication:** Required

**Query Parameters:**
- `tier` - Filter by tier (free, basic, premium, enterprise)
- `status` - Filter by status (active, expired, cancelled, pending)
- `verified` - Filter by verification status (true/false)
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 50, max: 100)

**Example:**
```
GET /api/subscriptions?tier=premium&status=active&page=1&limit=20
```

**Response:**
```json
{
  "success": true,
  "subscriptions": [
    {
      "discordId": "123456789012345678",
      "discordUsername": "JohnDoe",
      "tier": "premium",
      "status": "active",
      "botVerified": true,
      "verifiedGuildsCount": 2,
      "subscribedAt": "2024-01-01T00:00:00.000Z",
      "expiresAt": "2025-12-31T23:59:59.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

---

### Subscription Statistics (Admin)

#### `GET /api/subscriptions/stats`

Get aggregate statistics about subscriptions.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "stats": {
    "total": 1500,
    "verified": 1200,
    "byTier": {
      "free": 1000,
      "basic": 300,
      "premium": 150,
      "enterprise": 50
    },
    "byStatus": {
      "active": 1200,
      "expired": 100,
      "cancelled": 150,
      "pending": 50
    },
    "botGuildCount": 42
  }
}
```

---

## Error Handling

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Human-readable error message",
  "action": "suggested_action"  // Optional
}
```

### Common Error Codes

| Status Code | Error | Description |
|-------------|-------|-------------|
| 400 | Bad Request | Missing or invalid parameters |
| 401 | Unauthorized | Invalid or missing API key |
| 404 | Not Found | Resource not found |
| 500 | Internal Server Error | Server-side error |

### Action Types

Some errors include an `action` field suggesting next steps:

- `invite_required` - User needs to add bot to a server
- `reauth_required` - Discord token expired, user needs to re-authenticate
- `verification_required` - User needs to verify their subscription

---

## Examples

### Full Verification Flow with Next.js and Clerk

```typescript
// app/api/verify-subscription/route.ts
import { auth, clerkClient } from '@clerk/nextjs/server';

export async function POST() {
  const { userId } = auth();

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get Discord OAuth token from Clerk
    const [token] = await clerkClient.users.getUserOauthAccessToken(
      userId,
      'oauth_discord'
    );

    if (!token) {
      return Response.json({
        success: false,
        error: 'Discord not connected',
        action: 'connect_discord'
      }, { status: 400 });
    }

    // Verify with bot API
    const response = await fetch(
      `${process.env.BOT_API_URL}/api/subscription/verify-clerk`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.SUBSCRIPTION_API_SECRET!,
        },
        body: JSON.stringify({
          clerkUserId: userId,
          discordToken: token.token,
        }),
      }
    );

    const data = await response.json();
    return Response.json(data);

  } catch (error) {
    console.error('Verification error:', error);
    return Response.json({
      success: false,
      error: 'Verification failed'
    }, { status: 500 });
  }
}
```

### Stripe Webhook Integration

```typescript
// app/api/webhooks/stripe/route.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const discordId = session.metadata?.discordId;

    if (discordId) {
      // Update subscription via bot API
      await fetch(`${process.env.BOT_API_URL}/api/subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.SUBSCRIPTION_API_SECRET!,
        },
        body: JSON.stringify({
          discordId,
          tier: 'premium',
          status: 'active',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          paymentReference: session.payment_intent,
          metadata: {
            stripeCustomerId: session.customer,
            stripeSessionId: session.id,
          }
        }),
      });
    }
  }

  return Response.json({ received: true });
}
```

---

## Database Schema

### Subscription Model

```javascript
{
  discordId: String,           // Discord user ID (unique)
  discordUsername: String,     // Display name
  discordAvatar: String,       // Avatar hash

  tier: String,                // 'free' | 'basic' | 'premium' | 'enterprise'
  status: String,              // 'active' | 'expired' | 'cancelled' | 'pending'

  botVerified: Boolean,        // Has bot in at least one server
  verifiedGuilds: [{
    guildId: String,
    guildName: String,
    verifiedAt: Date
  }],

  lastVerificationCheck: Date,
  subscribedAt: Date,
  expiresAt: Date,

  paymentReference: String,    // e.g., Stripe payment intent ID
  features: [String],          // Custom enabled features
  metadata: Map                // Additional data (e.g., clerkUserId)
}
```

### Tier Features

| Tier | Features |
|------|----------|
| `free` | basic_commands |
| `basic` | basic_commands, custom_prefix, priority_support |
| `premium` | basic_commands, custom_prefix, priority_support, advanced_analytics, custom_embeds, unlimited_servers |
| `enterprise` | All premium + api_access, white_label, dedicated_support |

---

## Security Best Practices

1. **Always use HTTPS** in production
2. **Set `SUBSCRIPTION_API_SECRET`** to a strong, random value
3. **Configure `SUBSCRIPTION_WEB_ORIGIN`** to your specific domain(s)
4. **Never expose** the API secret to the client-side
5. **Validate** Discord tokens are fresh before using them
6. **Rate limit** your website's API routes
7. **Monitor** for suspicious activity in subscription changes

---

## Support

For issues or questions about this API, please:
- Check the bot logs for error details
- Review the response error messages
- Open an issue on the repository
