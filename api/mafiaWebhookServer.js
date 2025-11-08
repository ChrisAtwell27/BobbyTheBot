const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const MAFIA_VC_ID = '1434633691455426600';

/**
 * Mafia Webhook API Server
 * Provides REST endpoints for external applications (like a website) to control
 * Discord voice channel muting/deafening during mafia games
 */
class MafiaWebhookServer {
  constructor(client, games) {
    this.client = client;
    this.games = games; // Reference to the games Map from mafiaHandler
    this.app = express();
    this.webhookSecret = process.env.MAFIA_WEBHOOK_SECRET || null;

    if (!this.webhookSecret) {
      console.warn('⚠️  MAFIA_WEBHOOK_SECRET not set. Webhook authentication is DISABLED.');
      console.warn('   Set MAFIA_WEBHOOK_SECRET in your .env file for production use.');
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
    this.app.use(cors({
      origin: process.env.MAFIA_WEB_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT'],
      allowedHeaders: ['Content-Type', 'X-Webhook-Signature', 'Authorization']
    }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[Mafia API] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Verify webhook signature for authenticated requests
   */
  verifySignature(req, res, next) {
    // Skip if no secret is configured
    if (!this.webhookSecret) {
      return next();
    }

    const signature = req.headers['x-webhook-signature'];
    const authHeader = req.headers['authorization'];

    // Check for Bearer token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token === this.webhookSecret) {
        return next();
      }
    }

    // Check for signature-based auth
    if (signature) {
      const payload = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');

      if (signature === expectedSignature) {
        return next();
      }
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid authentication. Use Bearer token or X-Webhook-Signature header.'
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        service: 'Mafia Webhook API',
        status: 'online',
        timestamp: new Date().toISOString()
      });
    });

    // Get current game state
    this.app.get('/api/game/:guildId', this.verifySignature.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const game = this.games.get(guildId);

        if (!game) {
          return res.status(404).json({
            success: false,
            error: 'No active game found for this guild'
          });
        }

        // Get voice channel info
        const voiceChannel = await this.client.channels.fetch(MAFIA_VC_ID);
        const members = voiceChannel?.members.map(m => ({
          id: m.id,
          username: m.user.username,
          displayName: m.displayName,
          muted: m.voice.mute,
          deafened: m.voice.deaf
        })) || [];

        res.json({
          success: true,
          game: {
            guildId: game.guildId,
            phase: game.phase,
            day: game.day,
            isActive: game.isActive,
            players: game.players.map(p => ({
              id: p.id,
              name: p.name,
              isAlive: p.isAlive,
              role: p.role?.name || 'Unknown'
            })),
            voiceMembers: members
          }
        });
      } catch (error) {
        console.error('[Mafia API] Error fetching game state:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch game state',
          message: error.message
        });
      }
    });

    // Mute a specific player
    this.app.post('/api/voice/mute', this.verifySignature.bind(this), async (req, res) => {
      try {
        const { userId, guildId, reason } = req.body;

        if (!userId || !guildId) {
          return res.status(400).json({
            success: false,
            error: 'userId and guildId are required'
          });
        }

        const guild = await this.client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);

        if (!member.voice.channel) {
          return res.status(400).json({
            success: false,
            error: 'User is not in a voice channel'
          });
        }

        await member.voice.setMute(true, reason || 'Muted via webhook');

        res.json({
          success: true,
          message: `Muted ${member.user.username}`,
          userId: userId,
          muted: true
        });
      } catch (error) {
        console.error('[Mafia API] Error muting user:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to mute user',
          message: error.message
        });
      }
    });

    // Unmute a specific player
    this.app.post('/api/voice/unmute', this.verifySignature.bind(this), async (req, res) => {
      try {
        const { userId, guildId, reason } = req.body;

        if (!userId || !guildId) {
          return res.status(400).json({
            success: false,
            error: 'userId and guildId are required'
          });
        }

        const guild = await this.client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);

        if (!member.voice.channel) {
          return res.status(400).json({
            success: false,
            error: 'User is not in a voice channel'
          });
        }

        await member.voice.setMute(false, reason || 'Unmuted via webhook');

        res.json({
          success: true,
          message: `Unmuted ${member.user.username}`,
          userId: userId,
          muted: false
        });
      } catch (error) {
        console.error('[Mafia API] Error unmuting user:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to unmute user',
          message: error.message
        });
      }
    });

    // Deafen a specific player
    this.app.post('/api/voice/deafen', this.verifySignature.bind(this), async (req, res) => {
      try {
        const { userId, guildId, reason } = req.body;

        if (!userId || !guildId) {
          return res.status(400).json({
            success: false,
            error: 'userId and guildId are required'
          });
        }

        const guild = await this.client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);

        if (!member.voice.channel) {
          return res.status(400).json({
            success: false,
            error: 'User is not in a voice channel'
          });
        }

        await member.voice.setDeaf(true, reason || 'Deafened via webhook');

        res.json({
          success: true,
          message: `Deafened ${member.user.username}`,
          userId: userId,
          deafened: true
        });
      } catch (error) {
        console.error('[Mafia API] Error deafening user:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to deafen user',
          message: error.message
        });
      }
    });

    // Undeafen a specific player
    this.app.post('/api/voice/undeafen', this.verifySignature.bind(this), async (req, res) => {
      try {
        const { userId, guildId, reason } = req.body;

        if (!userId || !guildId) {
          return res.status(400).json({
            success: false,
            error: 'userId and guildId are required'
          });
        }

        const guild = await this.client.guilds.fetch(guildId);
        const member = await guild.members.fetch(userId);

        if (!member.voice.channel) {
          return res.status(400).json({
            success: false,
            error: 'User is not in a voice channel'
          });
        }

        await member.voice.setDeaf(false, reason || 'Undeafened via webhook');

        res.json({
          success: true,
          message: `Undeafened ${member.user.username}`,
          userId: userId,
          deafened: false
        });
      } catch (error) {
        console.error('[Mafia API] Error undeafening user:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to undeafen user',
          message: error.message
        });
      }
    });

    // Bulk mute/unmute operation (for phase transitions)
    this.app.post('/api/voice/bulk', this.verifySignature.bind(this), async (req, res) => {
      try {
        const { guildId, operations } = req.body;

        if (!guildId || !Array.isArray(operations)) {
          return res.status(400).json({
            success: false,
            error: 'guildId and operations array are required'
          });
        }

        const guild = await this.client.guilds.fetch(guildId);
        const results = [];

        for (const op of operations) {
          try {
            const member = await guild.members.fetch(op.userId);

            if (!member.voice.channel) {
              results.push({
                userId: op.userId,
                success: false,
                error: 'Not in voice channel'
              });
              continue;
            }

            if (op.mute !== undefined) {
              await member.voice.setMute(op.mute, op.reason || 'Bulk operation via webhook');
            }

            if (op.deafen !== undefined) {
              await member.voice.setDeaf(op.deafen, op.reason || 'Bulk operation via webhook');
            }

            results.push({
              userId: op.userId,
              success: true,
              muted: op.mute,
              deafened: op.deafen
            });
          } catch (error) {
            results.push({
              userId: op.userId,
              success: false,
              error: error.message
            });
          }
        }

        res.json({
          success: true,
          message: `Processed ${operations.length} operations`,
          results: results
        });
      } catch (error) {
        console.error('[Mafia API] Error in bulk operation:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to process bulk operation',
          message: error.message
        });
      }
    });

    // Get all voice channel members
    this.app.get('/api/voice/members/:guildId', this.verifySignature.bind(this), async (req, res) => {
      try {
        const { guildId } = req.params;
        const voiceChannel = await this.client.channels.fetch(MAFIA_VC_ID);

        if (!voiceChannel) {
          return res.status(404).json({
            success: false,
            error: 'Voice channel not found'
          });
        }

        const members = voiceChannel.members.map(m => ({
          id: m.id,
          username: m.user.username,
          displayName: m.displayName,
          muted: m.voice.mute,
          deafened: m.voice.deaf,
          selfMuted: m.voice.selfMute,
          selfDeafened: m.voice.selfDeaf
        }));

        res.json({
          success: true,
          channelId: MAFIA_VC_ID,
          memberCount: members.length,
          members: members
        });
      } catch (error) {
        console.error('[Mafia API] Error fetching voice members:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to fetch voice members',
          message: error.message
        });
      }
    });

    // Mute everyone in a voice channel
    this.app.post('/api/voice/channel/mute', this.verifySignature.bind(this), async (req, res) => {
      try {
        const { channelId, guildId, reason } = req.body;
        const vcId = channelId || MAFIA_VC_ID;

        if (!guildId) {
          return res.status(400).json({
            success: false,
            error: 'guildId is required'
          });
        }

        const voiceChannel = await this.client.channels.fetch(vcId);

        if (!voiceChannel || !voiceChannel.isVoiceBased()) {
          return res.status(404).json({
            success: false,
            error: 'Voice channel not found'
          });
        }

        const results = [];
        for (const [memberId, member] of voiceChannel.members) {
          try {
            await member.voice.setMute(true, reason || 'Muted via webhook - channel operation');
            results.push({
              userId: memberId,
              username: member.user.username,
              success: true,
              muted: true
            });
          } catch (error) {
            results.push({
              userId: memberId,
              username: member.user.username,
              success: false,
              error: error.message
            });
          }
        }

        res.json({
          success: true,
          message: `Muted ${results.filter(r => r.success).length} of ${results.length} members in voice channel`,
          channelId: vcId,
          results: results
        });
      } catch (error) {
        console.error('[Mafia API] Error muting voice channel:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to mute voice channel',
          message: error.message
        });
      }
    });

    // Unmute everyone in a voice channel
    this.app.post('/api/voice/channel/unmute', this.verifySignature.bind(this), async (req, res) => {
      try {
        const { channelId, guildId, reason } = req.body;
        const vcId = channelId || MAFIA_VC_ID;

        if (!guildId) {
          return res.status(400).json({
            success: false,
            error: 'guildId is required'
          });
        }

        const voiceChannel = await this.client.channels.fetch(vcId);

        if (!voiceChannel || !voiceChannel.isVoiceBased()) {
          return res.status(404).json({
            success: false,
            error: 'Voice channel not found'
          });
        }

        const results = [];
        for (const [memberId, member] of voiceChannel.members) {
          try {
            await member.voice.setMute(false, reason || 'Unmuted via webhook - channel operation');
            results.push({
              userId: memberId,
              username: member.user.username,
              success: true,
              muted: false
            });
          } catch (error) {
            results.push({
              userId: memberId,
              username: member.user.username,
              success: false,
              error: error.message
            });
          }
        }

        res.json({
          success: true,
          message: `Unmuted ${results.filter(r => r.success).length} of ${results.length} members in voice channel`,
          channelId: vcId,
          results: results
        });
      } catch (error) {
        console.error('[Mafia API] Error unmuting voice channel:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to unmute voice channel',
          message: error.message
        });
      }
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: [
          'GET /health',
          'GET /api/game/:guildId',
          'GET /api/voice/members/:guildId',
          'POST /api/voice/mute',
          'POST /api/voice/unmute',
          'POST /api/voice/deafen',
          'POST /api/voice/undeafen',
          'POST /api/voice/bulk',
          'POST /api/voice/channel/mute',
          'POST /api/voice/channel/unmute'
        ]
      });
    });
  }

  /**
   * Start the webhook server
   */
  start(port = 3001) {
    this.server = this.app.listen(port, () => {
      console.log(`✅ Mafia Webhook API server listening on port ${port}`);
      if (this.webhookSecret) {
        console.log('🔒 Webhook authentication is ENABLED');
      } else {
        console.log('⚠️  Webhook authentication is DISABLED (set MAFIA_WEBHOOK_SECRET to enable)');
      }
    });

    this.server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use. Mafia Webhook API could not start.`);
      } else {
        console.error('❌ Mafia Webhook API error:', error);
      }
    });

    return this.server;
  }

  /**
   * Stop the webhook server
   */
  stop() {
    if (this.server) {
      this.server.close(() => {
        console.log('Mafia Webhook API server stopped');
      });
    }
  }
}

module.exports = MafiaWebhookServer;