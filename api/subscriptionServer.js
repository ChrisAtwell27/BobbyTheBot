const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Subscription = require('../database/models/Subscription');

/**
 * Subscription Verification API Server
 *
 * Provides REST endpoints for:
 * - Verifying if users have the bot installed in their servers
 * - Managing subscription data
 * - Integration with Clerk authentication
 *
 * Authentication Flow with Clerk:
 * 1. User logs into website using Clerk with Discord OAuth provider
 * 2. Clerk stores the Discord OAuth tokens (access_token, refresh_token)
 * 3. Website retrieves Discord tokens from Clerk user's externalAccounts
 * 4. Website calls /api/subscription/verify with the Discord access token
 * 5. API fetches user's guilds from Discord and checks bot installation
 * 6. Returns verification status and list of verified guilds
 *
 * Getting Discord Token from Clerk (Frontend):
 * ```javascript
 * const { user } = useUser();
 * const discordAccount = user.externalAccounts.find(acc => acc.provider === 'discord');
 * // For server-side, use Clerk Backend API to get OAuth tokens
 * ```
 */
class SubscriptionServer {
    constructor(client) {
        this.client = client;
        this.app = express();
        this.apiSecret = process.env.SUBSCRIPTION_API_SECRET || null;
        this.discordApiBase = 'https://discord.com/api/v10';

        if (!this.apiSecret) {
            console.warn('⚠️  SUBSCRIPTION_API_SECRET not set. API authentication is DISABLED.');
            console.warn('   Set SUBSCRIPTION_API_SECRET in your .env file for production use.');
        }

        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // Parse JSON bodies
        this.app.use(express.json());

        // Enable CORS for web applications
        // Supports multiple origins via comma-separated list: "http://localhost:3000,https://mysite.com"
        const allowedOrigins = process.env.SUBSCRIPTION_WEB_ORIGIN
            ? process.env.SUBSCRIPTION_WEB_ORIGIN.split(',').map(o => o.trim())
            : null;

        this.app.use(cors({
            origin: allowedOrigins
                ? (origin, callback) => {
                    // Allow requests with no origin (like mobile apps or curl)
                    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
                        callback(null, true);
                    } else {
                        callback(new Error('Not allowed by CORS'));
                    }
                }
                : '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Discord-Token'],
            credentials: true
        }));

        // Request logging
        this.app.use((req, res, next) => {
            console.log(`[Subscription API] ${req.method} ${req.path}`);
            next();
        });
    }

    /**
     * Verify API key for authenticated requests
     */
    verifyApiKey(req, res, next) {
        // Skip if no secret is configured
        if (!this.apiSecret) {
            return next();
        }

        const apiKey = req.headers['x-api-key'];
        const authHeader = req.headers['authorization'];

        // Check for API key header
        if (apiKey && apiKey === this.apiSecret) {
            return next();
        }

        // Check for Bearer token
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            if (token === this.apiSecret) {
                return next();
            }
        }

        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'Invalid or missing API key. Use X-API-Key header or Bearer token.'
        });
    }

    /**
     * Generate a verification token for secure callbacks
     */
    generateVerificationToken(discordId) {
        const timestamp = Date.now();
        const data = `${discordId}:${timestamp}`;
        const signature = crypto
            .createHmac('sha256', this.apiSecret || 'default-secret')
            .update(data)
            .digest('hex');
        return Buffer.from(`${data}:${signature}`).toString('base64');
    }

    /**
     * Verify a verification token
     */
    verifyToken(token) {
        try {
            const decoded = Buffer.from(token, 'base64').toString('utf-8');
            const [discordId, timestamp, signature] = decoded.split(':');

            // Check token age (valid for 10 minutes)
            const age = Date.now() - parseInt(timestamp);
            if (age > 10 * 60 * 1000) {
                return { valid: false, error: 'Token expired' };
            }

            // Verify signature
            const expectedSignature = crypto
                .createHmac('sha256', this.apiSecret || 'default-secret')
                .update(`${discordId}:${timestamp}`)
                .digest('hex');

            if (signature !== expectedSignature) {
                return { valid: false, error: 'Invalid signature' };
            }

            return { valid: true, discordId };
        } catch (error) {
            return { valid: false, error: 'Invalid token format' };
        }
    }

    /**
     * Fetch user's guilds from Discord API using their access token
     */
    async fetchUserGuilds(accessToken) {
        const response = await fetch(`${this.discordApiBase}/users/@me/guilds`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `Discord API error: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Fetch user info from Discord API
     */
    async fetchUserInfo(accessToken) {
        const response = await fetch(`${this.discordApiBase}/users/@me`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || `Discord API error: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Check if bot is in a specific guild
     */
    async isBotInGuild(guildId) {
        try {
            const guild = await this.client.guilds.fetch(guildId);
            return guild ? true : false;
        } catch (error) {
            // Bot is not in this guild or doesn't have access
            return false;
        }
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        // ==================== Health & Info ====================

        /**
         * Health check endpoint
         */
        this.app.get('/health', (req, res) => {
            res.json({
                success: true,
                service: 'Subscription Verification API',
                status: 'online',
                timestamp: new Date().toISOString(),
                botConnected: this.client.isReady(),
                guildCount: this.client.guilds.cache.size
            });
        });

        /**
         * Get bot info (public endpoint for invite link generation)
         */
        this.app.get('/api/subscription/bot-info', (req, res) => {
            res.json({
                success: true,
                bot: {
                    id: this.client.user?.id,
                    username: this.client.user?.username,
                    discriminator: this.client.user?.discriminator,
                    avatar: this.client.user?.avatar,
                    inviteUrl: `https://discord.com/api/oauth2/authorize?client_id=${this.client.user?.id}&permissions=8&scope=bot%20applications.commands`
                }
            });
        });

        // ==================== Verification Endpoints ====================

        /**
         * Verify if user has bot installed in any of their servers
         *
         * This is the main verification endpoint. The website should call this
         * after the user logs in with Discord OAuth.
         *
         * Required: Discord access token with 'guilds' scope
         */
        this.app.post('/api/subscription/verify', this.verifyApiKey.bind(this), async (req, res) => {
            try {
                const { discordToken } = req.body;
                const discordTokenHeader = req.headers['x-discord-token'];
                const accessToken = discordToken || discordTokenHeader;

                if (!accessToken) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing Discord access token',
                        message: 'Provide Discord OAuth access token in request body as "discordToken" or X-Discord-Token header'
                    });
                }

                // Fetch user info and guilds from Discord
                const [userInfo, userGuilds] = await Promise.all([
                    this.fetchUserInfo(accessToken),
                    this.fetchUserGuilds(accessToken)
                ]);

                const discordId = userInfo.id;

                // Check which guilds have the bot installed
                const verifiedGuilds = [];
                for (const guild of userGuilds) {
                    const hasBotInstalled = await this.isBotInGuild(guild.id);
                    if (hasBotInstalled) {
                        verifiedGuilds.push({
                            guildId: guild.id,
                            guildName: guild.name,
                            guildIcon: guild.icon,
                            isOwner: guild.owner,
                            permissions: guild.permissions
                        });
                    }
                }

                const botVerified = verifiedGuilds.length > 0;

                // Update or create subscription record
                const subscription = await Subscription.findOneAndUpdate(
                    { discordId },
                    {
                        $set: {
                            discordUsername: userInfo.username,
                            discordAvatar: userInfo.avatar,
                            botVerified,
                            lastVerificationCheck: new Date(),
                            verifiedGuilds: verifiedGuilds.map(g => ({
                                guildId: g.guildId,
                                guildName: g.guildName,
                                verifiedAt: new Date()
                            }))
                        },
                        $setOnInsert: {
                            tier: 'free',
                            status: 'pending',
                            subscribedAt: new Date()
                        }
                    },
                    { upsert: true, new: true }
                );

                res.json({
                    success: true,
                    verified: botVerified,
                    user: {
                        id: discordId,
                        username: userInfo.username,
                        avatar: userInfo.avatar,
                        globalName: userInfo.global_name
                    },
                    guilds: {
                        total: userGuilds.length,
                        withBot: verifiedGuilds.length,
                        verified: verifiedGuilds
                    },
                    subscription: {
                        tier: subscription.tier,
                        status: subscription.status,
                        features: Subscription.getTierFeatures(subscription.tier),
                        expiresAt: subscription.expiresAt
                    }
                });

            } catch (error) {
                console.error('[Subscription API] Verification error:', error);

                // Handle Discord API errors specifically
                if (error.message.includes('Discord API error')) {
                    return res.status(401).json({
                        success: false,
                        error: 'Discord authentication failed',
                        message: 'The Discord access token is invalid or expired. Please re-authenticate.'
                    });
                }

                res.status(500).json({
                    success: false,
                    error: 'Verification failed',
                    message: error.message
                });
            }
        });

        /**
         * Clerk-specific verification endpoint
         *
         * Use this when you have Clerk user data available.
         * The website should fetch the Discord OAuth token from Clerk's Backend API
         * and include the Clerk user ID for tracking.
         *
         * Request body:
         * - clerkUserId: The Clerk user ID (for linking accounts)
         * - discordToken: The Discord access token from Clerk's OAuth
         * - discordId: (optional) Discord user ID if already known
         */
        this.app.post('/api/subscription/verify-clerk', this.verifyApiKey.bind(this), async (req, res) => {
            try {
                const { clerkUserId, discordToken, discordId: providedDiscordId } = req.body;

                if (!clerkUserId) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing Clerk user ID',
                        message: 'clerkUserId is required'
                    });
                }

                if (!discordToken) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing Discord token',
                        message: 'discordToken is required. Fetch it from Clerk Backend API using getUserOauthAccessToken()'
                    });
                }

                // Fetch user info and guilds from Discord
                const [userInfo, userGuilds] = await Promise.all([
                    this.fetchUserInfo(discordToken),
                    this.fetchUserGuilds(discordToken)
                ]);

                const discordId = userInfo.id;

                // Verify Discord ID matches if provided
                if (providedDiscordId && providedDiscordId !== discordId) {
                    return res.status(400).json({
                        success: false,
                        error: 'Discord ID mismatch',
                        message: 'The provided Discord ID does not match the token owner'
                    });
                }

                // Check which guilds have the bot installed
                const verifiedGuilds = [];
                for (const guild of userGuilds) {
                    const hasBotInstalled = await this.isBotInGuild(guild.id);
                    if (hasBotInstalled) {
                        verifiedGuilds.push({
                            guildId: guild.id,
                            guildName: guild.name,
                            guildIcon: guild.icon,
                            isOwner: guild.owner,
                            permissions: guild.permissions
                        });
                    }
                }

                const botVerified = verifiedGuilds.length > 0;

                // Update or create subscription record with Clerk user ID
                const subscription = await Subscription.findOneAndUpdate(
                    { discordId },
                    {
                        $set: {
                            discordUsername: userInfo.username,
                            discordAvatar: userInfo.avatar,
                            botVerified,
                            lastVerificationCheck: new Date(),
                            verifiedGuilds: verifiedGuilds.map(g => ({
                                guildId: g.guildId,
                                guildName: g.guildName,
                                verifiedAt: new Date()
                            })),
                            'metadata.clerkUserId': clerkUserId
                        },
                        $setOnInsert: {
                            tier: 'free',
                            status: 'pending',
                            subscribedAt: new Date()
                        }
                    },
                    { upsert: true, new: true }
                );

                res.json({
                    success: true,
                    verified: botVerified,
                    clerkUserId,
                    user: {
                        discordId,
                        username: userInfo.username,
                        avatar: userInfo.avatar,
                        globalName: userInfo.global_name
                    },
                    guilds: {
                        total: userGuilds.length,
                        withBot: verifiedGuilds.length,
                        verified: verifiedGuilds
                    },
                    subscription: {
                        tier: subscription.tier,
                        status: subscription.status,
                        features: Subscription.getTierFeatures(subscription.tier),
                        expiresAt: subscription.expiresAt
                    },
                    // Include invite URL if not verified
                    ...(botVerified ? {} : {
                        action: 'invite_required',
                        inviteUrl: `https://discord.com/api/oauth2/authorize?client_id=${this.client.user?.id}&permissions=8&scope=bot%20applications.commands`
                    })
                });

            } catch (error) {
                console.error('[Subscription API] Clerk verification error:', error);

                if (error.message.includes('Discord API error')) {
                    return res.status(401).json({
                        success: false,
                        error: 'Discord token expired',
                        message: 'The Discord access token from Clerk is invalid or expired. User needs to re-link Discord in Clerk.',
                        action: 'reauth_required'
                    });
                }

                res.status(500).json({
                    success: false,
                    error: 'Verification failed',
                    message: error.message
                });
            }
        });

        /**
         * Lookup subscription by Clerk user ID
         */
        this.app.get('/api/subscription/clerk/:clerkUserId', this.verifyApiKey.bind(this), async (req, res) => {
            try {
                const { clerkUserId } = req.params;

                const subscription = await Subscription.findOne({ 'metadata.clerkUserId': clerkUserId });

                if (!subscription) {
                    return res.status(404).json({
                        success: false,
                        error: 'Not found',
                        message: 'No subscription found for this Clerk user. User needs to verify first.',
                        action: 'verification_required'
                    });
                }

                res.json({
                    success: true,
                    subscription: {
                        discordId: subscription.discordId,
                        discordUsername: subscription.discordUsername,
                        tier: subscription.tier,
                        status: subscription.status,
                        botVerified: subscription.botVerified,
                        verifiedGuilds: subscription.verifiedGuilds,
                        features: Subscription.getTierFeatures(subscription.tier),
                        subscribedAt: subscription.subscribedAt,
                        expiresAt: subscription.expiresAt,
                        lastVerificationCheck: subscription.lastVerificationCheck
                    }
                });

            } catch (error) {
                console.error('[Subscription API] Clerk lookup error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Lookup failed',
                    message: error.message
                });
            }
        });

        /**
         * Quick verify endpoint - check if a Discord user ID has verified guilds
         * This doesn't require a Discord token, just checks our database
         */
        this.app.get('/api/subscription/verify/:discordId', this.verifyApiKey.bind(this), async (req, res) => {
            try {
                const { discordId } = req.params;

                const subscription = await Subscription.findOne({ discordId });

                if (!subscription) {
                    return res.json({
                        success: true,
                        verified: false,
                        exists: false,
                        message: 'No subscription record found for this user'
                    });
                }

                res.json({
                    success: true,
                    verified: subscription.botVerified,
                    exists: true,
                    subscription: {
                        tier: subscription.tier,
                        status: subscription.status,
                        features: Subscription.getTierFeatures(subscription.tier),
                        verifiedGuilds: subscription.verifiedGuilds.length,
                        lastCheck: subscription.lastVerificationCheck,
                        expiresAt: subscription.expiresAt
                    }
                });

            } catch (error) {
                console.error('[Subscription API] Quick verify error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Verification check failed',
                    message: error.message
                });
            }
        });

        /**
         * Check specific guild for bot installation
         */
        this.app.get('/api/subscription/check-guild/:guildId', this.verifyApiKey.bind(this), async (req, res) => {
            try {
                const { guildId } = req.params;

                const hasBotInstalled = await this.isBotInGuild(guildId);

                if (hasBotInstalled) {
                    const guild = await this.client.guilds.fetch(guildId);
                    res.json({
                        success: true,
                        installed: true,
                        guild: {
                            id: guild.id,
                            name: guild.name,
                            memberCount: guild.memberCount,
                            icon: guild.iconURL()
                        }
                    });
                } else {
                    res.json({
                        success: true,
                        installed: false,
                        message: 'Bot is not installed in this guild'
                    });
                }

            } catch (error) {
                console.error('[Subscription API] Check guild error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Guild check failed',
                    message: error.message
                });
            }
        });

        // ==================== Subscription Management ====================

        /**
         * Get subscription details
         */
        this.app.get('/api/subscription/:discordId', this.verifyApiKey.bind(this), async (req, res) => {
            try {
                const { discordId } = req.params;

                const subscription = await Subscription.findOne({ discordId });

                if (!subscription) {
                    return res.status(404).json({
                        success: false,
                        error: 'Not found',
                        message: 'No subscription found for this user'
                    });
                }

                res.json({
                    success: true,
                    subscription: {
                        discordId: subscription.discordId,
                        discordUsername: subscription.discordUsername,
                        tier: subscription.tier,
                        status: subscription.status,
                        botVerified: subscription.botVerified,
                        verifiedGuilds: subscription.verifiedGuilds,
                        features: Subscription.getTierFeatures(subscription.tier),
                        subscribedAt: subscription.subscribedAt,
                        expiresAt: subscription.expiresAt,
                        lastVerificationCheck: subscription.lastVerificationCheck
                    }
                });

            } catch (error) {
                console.error('[Subscription API] Get subscription error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch subscription',
                    message: error.message
                });
            }
        });

        /**
         * Create or update subscription (for payment webhook callbacks)
         */
        this.app.post('/api/subscription', this.verifyApiKey.bind(this), async (req, res) => {
            try {
                const {
                    discordId,
                    tier,
                    status,
                    expiresAt,
                    paymentReference,
                    features,
                    metadata
                } = req.body;

                if (!discordId) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required field',
                        message: 'discordId is required'
                    });
                }

                const updateData = {};
                if (tier) updateData.tier = tier;
                if (status) updateData.status = status;
                if (expiresAt) updateData.expiresAt = new Date(expiresAt);
                if (paymentReference) updateData.paymentReference = paymentReference;
                if (features) updateData.features = features;
                if (metadata) updateData.metadata = metadata;

                const subscription = await Subscription.findOneAndUpdate(
                    { discordId },
                    {
                        $set: updateData,
                        $setOnInsert: {
                            subscribedAt: new Date()
                        }
                    },
                    { upsert: true, new: true }
                );

                res.json({
                    success: true,
                    message: 'Subscription updated successfully',
                    subscription: {
                        discordId: subscription.discordId,
                        tier: subscription.tier,
                        status: subscription.status,
                        features: Subscription.getTierFeatures(subscription.tier),
                        expiresAt: subscription.expiresAt
                    }
                });

            } catch (error) {
                console.error('[Subscription API] Update subscription error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to update subscription',
                    message: error.message
                });
            }
        });

        /**
         * Cancel subscription
         */
        this.app.delete('/api/subscription/:discordId', this.verifyApiKey.bind(this), async (req, res) => {
            try {
                const { discordId } = req.params;

                const subscription = await Subscription.findOneAndUpdate(
                    { discordId },
                    {
                        $set: {
                            status: 'cancelled',
                            tier: 'free'
                        }
                    },
                    { new: true }
                );

                if (!subscription) {
                    return res.status(404).json({
                        success: false,
                        error: 'Not found',
                        message: 'No subscription found for this user'
                    });
                }

                res.json({
                    success: true,
                    message: 'Subscription cancelled successfully',
                    subscription: {
                        discordId: subscription.discordId,
                        status: subscription.status,
                        tier: subscription.tier
                    }
                });

            } catch (error) {
                console.error('[Subscription API] Cancel subscription error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to cancel subscription',
                    message: error.message
                });
            }
        });

        // ==================== Bulk Operations ====================

        /**
         * Get all active subscriptions (admin endpoint)
         */
        this.app.get('/api/subscriptions', this.verifyApiKey.bind(this), async (req, res) => {
            try {
                const { tier, status, verified, page = 1, limit = 50 } = req.query;
                const skip = (parseInt(page) - 1) * parseInt(limit);

                const query = {};
                if (tier) query.tier = tier;
                if (status) query.status = status;
                if (verified !== undefined) query.botVerified = verified === 'true';

                const [subscriptions, total] = await Promise.all([
                    Subscription.find(query)
                        .sort({ subscribedAt: -1 })
                        .skip(skip)
                        .limit(parseInt(limit))
                        .lean(),
                    Subscription.countDocuments(query)
                ]);

                res.json({
                    success: true,
                    subscriptions: subscriptions.map(s => ({
                        discordId: s.discordId,
                        discordUsername: s.discordUsername,
                        tier: s.tier,
                        status: s.status,
                        botVerified: s.botVerified,
                        verifiedGuildsCount: s.verifiedGuilds?.length || 0,
                        subscribedAt: s.subscribedAt,
                        expiresAt: s.expiresAt
                    })),
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total,
                        pages: Math.ceil(total / parseInt(limit))
                    }
                });

            } catch (error) {
                console.error('[Subscription API] List subscriptions error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to list subscriptions',
                    message: error.message
                });
            }
        });

        /**
         * Get subscription statistics (admin endpoint)
         */
        this.app.get('/api/subscriptions/stats', this.verifyApiKey.bind(this), async (req, res) => {
            try {
                const [
                    totalSubscriptions,
                    tierCounts,
                    statusCounts,
                    verifiedCount
                ] = await Promise.all([
                    Subscription.countDocuments(),
                    Subscription.aggregate([
                        { $group: { _id: '$tier', count: { $sum: 1 } } }
                    ]),
                    Subscription.aggregate([
                        { $group: { _id: '$status', count: { $sum: 1 } } }
                    ]),
                    Subscription.countDocuments({ botVerified: true })
                ]);

                res.json({
                    success: true,
                    stats: {
                        total: totalSubscriptions,
                        verified: verifiedCount,
                        byTier: tierCounts.reduce((acc, { _id, count }) => {
                            acc[_id] = count;
                            return acc;
                        }, {}),
                        byStatus: statusCounts.reduce((acc, { _id, count }) => {
                            acc[_id] = count;
                            return acc;
                        }, {}),
                        botGuildCount: this.client.guilds.cache.size
                    }
                });

            } catch (error) {
                console.error('[Subscription API] Stats error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to fetch statistics',
                    message: error.message
                });
            }
        });

        // ==================== 404 Handler ====================

        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
                availableEndpoints: [
                    'GET  /health',
                    'GET  /api/subscription/bot-info',
                    'POST /api/subscription/verify',
                    'POST /api/subscription/verify-clerk',
                    'GET  /api/subscription/verify/:discordId',
                    'GET  /api/subscription/clerk/:clerkUserId',
                    'GET  /api/subscription/check-guild/:guildId',
                    'GET  /api/subscription/:discordId',
                    'POST /api/subscription',
                    'DELETE /api/subscription/:discordId',
                    'GET  /api/subscriptions',
                    'GET  /api/subscriptions/stats'
                ]
            });
        });
    }

    /**
     * Start the subscription server
     */
    start(port = 3002) {
        this.server = this.app.listen(port, () => {
            console.log(`✅ Subscription Verification API server listening on port ${port}`);
            if (this.apiSecret) {
                console.log('🔒 API authentication is ENABLED');
            } else {
                console.log('⚠️  API authentication is DISABLED (set SUBSCRIPTION_API_SECRET to enable)');
            }
        });

        this.server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`❌ Port ${port} is already in use. Subscription API could not start.`);
            } else {
                console.error('❌ Subscription API error:', error);
            }
        });

        return this.server;
    }

    /**
     * Stop the subscription server
     */
    stop() {
        if (this.server) {
            this.server.close(() => {
                console.log('Subscription Verification API server stopped');
            });
        }
    }
}

module.exports = SubscriptionServer;
