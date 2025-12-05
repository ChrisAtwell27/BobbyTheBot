# Bot Subscription Integration Guide

This document explains how Bobby The Bot should check server subscription tiers and implement subscription-related commands.

## Overview

Subscriptions are stored in **Convex** (source of truth) and can be queried by the bot via the website's API or directly from Convex.

## Subscription Tiers

| Tier | Features |
|------|----------|
| `free` | Basic bot functionality |
| `plus` | AI Chatbot, Full Moderation, Mafia Game w/ VC, Role Management, Gambling Games, Valorant LFG |
| `ultimate` | Everything in Plus + Custom Economy, 65+ Roles Ultimate Mafia, Custom AI Memory |

## Option 1: Query via Website API

### Endpoint: GET `/api/verify-subscription`

The bot can query the website API to check a guild's subscription status.

**Request:**
```http
GET https://your-website.com/api/verify-subscription?discordId={BOT_DISCORD_ID}
Headers:
  X-API-Key: {SUBSCRIPTION_API_SECRET}
```

**Response:**
```json
{
  "verified": true,
  "guilds": [
    {
      "guildId": "701308904877064193",
      "guildName": "My Server",
      "tier": "plus",
      "status": "active",
      "expiresAt": "2025-01-15T00:00:00.000Z"
    }
  ]
}
```

### Bot Implementation (Python Example)

```python
import aiohttp
from typing import Optional, Dict

class SubscriptionChecker:
    def __init__(self, api_url: str, api_key: str):
        self.api_url = api_url
        self.api_key = api_key
        self._cache: Dict[str, dict] = {}  # guild_id -> subscription data
        self._cache_ttl = 300  # 5 minutes

    async def get_guild_subscription(self, guild_id: str) -> dict:
        """Get subscription info for a specific guild."""
        # Check cache first
        if guild_id in self._cache:
            cached = self._cache[guild_id]
            if time.time() - cached['fetched_at'] < self._cache_ttl:
                return cached['data']

        # Fetch from API
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.api_url}/api/guild-subscription/{guild_id}",
                headers={"X-API-Key": self.api_key}
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    self._cache[guild_id] = {
                        'data': data,
                        'fetched_at': time.time()
                    }
                    return data
                return {"tier": "free", "status": "none"}

    async def has_feature(self, guild_id: str, feature: str) -> bool:
        """Check if a guild has access to a specific feature."""
        sub = await self.get_guild_subscription(guild_id)
        tier = sub.get('tier', 'free')

        # Define feature access by tier
        FEATURE_TIERS = {
            'ai_chatbot': ['plus', 'ultimate'],
            'moderation': ['plus', 'ultimate'],
            'mafia_game': ['plus', 'ultimate'],
            'role_management': ['plus', 'ultimate'],
            'gambling_games': ['plus', 'ultimate'],
            'valorant_lfg': ['plus', 'ultimate'],
            'custom_economy': ['ultimate'],
            'ultimate_mafia': ['ultimate'],
            'custom_ai_memory': ['ultimate'],
        }

        allowed_tiers = FEATURE_TIERS.get(feature, [])
        return tier in allowed_tiers
```

## Option 2: Direct Convex Query

If your bot has access to Convex, you can query the `guildSubscriptions` table directly.

### Convex Schema

```typescript
// convex/schema.ts
guildSubscriptions: defineTable({
  guildId: v.string(),
  guildName: v.string(),
  ownerId: v.string(),        // Discord user ID who purchased
  clerkUserId: v.string(),
  clerkSubscriptionId: v.optional(v.string()),
  tier: v.string(),           // "free", "plus", "ultimate"
  status: v.string(),         // "active", "canceled", "expired", "trial"
  expiresAt: v.optional(v.number()),
  trialEndsAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_guildId", ["guildId"])
```

### Query Function

```typescript
// convex/guildSubscriptions.ts
export const getByGuildId = query({
  args: { guildId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("guildSubscriptions")
      .withIndex("by_guildId", (q) => q.eq("guildId", args.guildId))
      .first();
  },
});
```

## Option 3: Add a Bot-Specific API Endpoint

Create a dedicated endpoint for the bot to query guild subscriptions.

### Create: `app/api/guild-subscription/[guildId]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(
  request: NextRequest,
  { params }: { params: { guildId: string } }
) {
  // Verify API key
  const apiKey = request.headers.get("X-API-Key");
  if (apiKey !== process.env.SUBSCRIPTION_API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { guildId } = params;

  try {
    const subscription = await convex.query(
      api.guildSubscriptions.getByGuildId,
      { guildId }
    );

    if (!subscription) {
      return NextResponse.json({
        guildId,
        tier: "free",
        status: "none",
        features: getFeaturesByTier("free"),
      });
    }

    // Check if subscription is expired
    const isExpired = subscription.expiresAt && subscription.expiresAt < Date.now();
    const effectiveTier = isExpired ? "free" : subscription.tier;

    return NextResponse.json({
      guildId,
      guildName: subscription.guildName,
      tier: effectiveTier,
      status: isExpired ? "expired" : subscription.status,
      expiresAt: subscription.expiresAt
        ? new Date(subscription.expiresAt).toISOString()
        : null,
      features: getFeaturesByTier(effectiveTier),
    });
  } catch (error) {
    console.error("[BOT API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscription" },
      { status: 500 }
    );
  }
}

function getFeaturesByTier(tier: string): string[] {
  const features: Record<string, string[]> = {
    free: ["basic_commands"],
    plus: [
      "basic_commands",
      "ai_chatbot",
      "moderation",
      "mafia_game",
      "role_management",
      "gambling_games",
      "valorant_lfg",
    ],
    ultimate: [
      "basic_commands",
      "ai_chatbot",
      "moderation",
      "mafia_game",
      "role_management",
      "gambling_games",
      "valorant_lfg",
      "custom_economy",
      "ultimate_mafia",
      "custom_ai_memory",
    ],
  };
  return features[tier] || features.free;
}
```

---

## Implementing the `!subscription` Command

### Discord.py Example

```python
import discord
from discord.ext import commands
from datetime import datetime

class SubscriptionCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.api_url = "https://your-website.com"
        self.api_key = "your-api-key"

    @commands.command(name="subscription", aliases=["sub", "plan"])
    async def subscription_command(self, ctx):
        """Show the current subscription status for this server."""

        guild_id = str(ctx.guild.id)

        # Fetch subscription from API
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.api_url}/api/guild-subscription/{guild_id}",
                headers={"X-API-Key": self.api_key}
            ) as response:
                if response.status != 200:
                    await ctx.send("❌ Failed to fetch subscription info.")
                    return

                data = await response.json()

        # Build embed
        tier = data.get("tier", "free")
        status = data.get("status", "none")
        expires_at = data.get("expiresAt")
        features = data.get("features", [])

        # Tier colors
        colors = {
            "free": discord.Color.greyple(),
            "plus": discord.Color.blue(),
            "ultimate": discord.Color.gold(),
        }

        # Tier emojis
        emojis = {
            "free": "🆓",
            "plus": "⭐",
            "ultimate": "👑",
        }

        embed = discord.Embed(
            title=f"{emojis.get(tier, '📋')} Server Subscription",
            color=colors.get(tier, discord.Color.greyple())
        )

        embed.add_field(
            name="Current Plan",
            value=f"**{tier.upper()}**",
            inline=True
        )

        embed.add_field(
            name="Status",
            value=status.capitalize(),
            inline=True
        )

        if expires_at and tier != "free":
            expires_date = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            embed.add_field(
                name="Renews On",
                value=f"<t:{int(expires_date.timestamp())}:D>",
                inline=True
            )

        # Features list
        if features:
            feature_names = {
                "basic_commands": "Basic Commands",
                "ai_chatbot": "AI Chatbot",
                "moderation": "Full Moderation",
                "mafia_game": "Mafia Game w/ VC",
                "role_management": "Role Management",
                "gambling_games": "Gambling Games",
                "valorant_lfg": "Valorant LFG",
                "custom_economy": "Custom Economy",
                "ultimate_mafia": "65+ Roles Mafia",
                "custom_ai_memory": "Custom AI Memory",
            }

            feature_list = "\n".join([
                f"✅ {feature_names.get(f, f)}"
                for f in features
            ])
            embed.add_field(
                name="Features",
                value=feature_list,
                inline=False
            )

        # Upgrade prompt for free users
        if tier == "free":
            embed.add_field(
                name="Want More Features?",
                value=f"[Upgrade your server]({self.api_url}/bobby-the-bot) to unlock premium features!",
                inline=False
            )

        embed.set_footer(text=f"Server ID: {guild_id}")

        await ctx.send(embed=embed)

    @commands.command(name="features")
    async def features_command(self, ctx):
        """Show available features and what tier they require."""

        embed = discord.Embed(
            title="📋 Bobby The Bot Features",
            description="Here's what each subscription tier includes:",
            color=discord.Color.blue()
        )

        embed.add_field(
            name="🆓 Free",
            value="• Basic Commands",
            inline=False
        )

        embed.add_field(
            name="⭐ Plus ($9.99/mo)",
            value=(
                "• AI Chatbot\n"
                "• Full Moderation\n"
                "• Mafia Game w/ VC Integration\n"
                "• Unlimited Role Management\n"
                "• Gambling Games (Blackjack, Russian Roulette)\n"
                "• Valorant Team Building / LFG"
            ),
            inline=False
        )

        embed.add_field(
            name="👑 Ultimate ($14.99/mo)",
            value=(
                "• Everything in Plus\n"
                "• Custom Economy\n"
                "• 65+ Roles Ultimate Mafia\n"
                "• Custom Chatbot AI Memory"
            ),
            inline=False
        )

        embed.add_field(
            name="Get Started",
            value=f"[Upgrade your server]({self.api_url}/bobby-the-bot)",
            inline=False
        )

        await ctx.send(embed=embed)

async def setup(bot):
    await bot.add_cog(SubscriptionCog(bot))
```

---

## Feature Gating in Commands

Use a decorator to gate commands by subscription tier:

```python
from functools import wraps

def requires_tier(*allowed_tiers):
    """Decorator to require a specific subscription tier for a command."""
    def decorator(func):
        @wraps(func)
        async def wrapper(self, ctx, *args, **kwargs):
            guild_id = str(ctx.guild.id)
            sub = await self.subscription_checker.get_guild_subscription(guild_id)
            tier = sub.get("tier", "free")

            if tier not in allowed_tiers:
                tier_names = ", ".join(t.capitalize() for t in allowed_tiers)
                await ctx.send(
                    f"❌ This command requires a **{tier_names}** subscription.\n"
                    f"Upgrade at: https://your-website.com/bobby-the-bot"
                )
                return

            return await func(self, ctx, *args, **kwargs)
        return wrapper
    return decorator

# Usage:
class GamblingCog(commands.Cog):
    @commands.command()
    @requires_tier("plus", "ultimate")
    async def blackjack(self, ctx):
        """Play blackjack (Plus+ required)"""
        # ... game logic
        pass

    @commands.command()
    @requires_tier("ultimate")
    async def economy(self, ctx):
        """Custom economy commands (Ultimate required)"""
        # ... economy logic
        pass
```

---

## Webhook Updates (Real-time Sync)

When a subscription changes (purchase, cancel, update), the website sends a webhook to the bot:

**Endpoint:** `POST {BOT_API_URL}/api/subscription`

**Payload:**
```json
{
  "discordId": "451459488562806784",
  "clerkUserId": "user_xxx",
  "guildId": "701308904877064193",
  "guildName": "My Server",
  "tier": "plus",
  "status": "active",
  "expiresAt": "2025-01-15T00:00:00.000Z",
  "metadata": {
    "clerkUserId": "user_xxx",
    "lastUpdated": "2024-12-05T20:00:00.000Z"
  }
}
```

**Bot Handler:**
```python
from aiohttp import web

async def subscription_webhook(request):
    """Handle subscription updates from the website."""
    # Verify API key
    api_key = request.headers.get("X-API-Key")
    if api_key != os.environ["SUBSCRIPTION_API_SECRET"]:
        return web.json_response({"error": "Unauthorized"}, status=401)

    data = await request.json()
    guild_id = data.get("guildId")
    tier = data.get("tier")
    status = data.get("status")

    # Update local cache
    bot.subscription_cache[guild_id] = {
        "tier": tier,
        "status": status,
        "expiresAt": data.get("expiresAt"),
        "updated_at": time.time()
    }

    # Optionally notify the server
    if status == "active" and tier != "free":
        guild = bot.get_guild(int(guild_id))
        if guild:
            # Find a suitable channel to announce
            channel = guild.system_channel or guild.text_channels[0]
            await channel.send(
                f"🎉 This server has been upgraded to **{tier.upper()}**! "
                f"New features are now available."
            )

    return web.json_response({"success": True})

# Add to bot's web server
app = web.Application()
app.router.add_post("/api/subscription", subscription_webhook)
```

---

## Summary

1. **Source of Truth:** Convex `guildSubscriptions` table
2. **Bot Access:** Via `/api/guild-subscription/{guildId}` endpoint
3. **Real-time Updates:** Webhook to bot when subscriptions change
4. **Caching:** Bot should cache subscription data (5-10 min TTL)
5. **Feature Gating:** Use decorators or checks before premium commands
