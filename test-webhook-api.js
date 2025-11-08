/**
 * Standalone Webhook API Test Script
 * Tests the webhook API without requiring a Discord bot connection
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Middleware
app.use(express.json());
app.use(cors({ origin: '*' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Mafia Webhook API (Test Mode)',
    status: 'online',
    timestamp: new Date().toISOString(),
    note: 'This is a test server. Add your Discord bot token to .env to use the full webhook API.'
  });
});

// Mock game state endpoint
app.get('/api/game/:guildId', (req, res) => {
  const { guildId } = req.params;
  res.json({
    success: true,
    game: {
      guildId: guildId,
      phase: 'night',
      day: 1,
      isActive: true,
      players: [
        { id: '123', name: 'TestPlayer1', isAlive: true, role: 'Beekeeper Bee' },
        { id: '456', name: 'TestPlayer2', isAlive: true, role: 'Killer Wasp' }
      ],
      voiceMembers: [
        { id: '123', username: 'TestPlayer1', displayName: 'Test Player 1', muted: false, deafened: false },
        { id: '456', username: 'TestPlayer2', displayName: 'Test Player 2', muted: false, deafened: false }
      ]
    },
    note: 'Test data - bot not connected'
  });
});

// Mock voice control endpoints
app.post('/api/voice/mute', (req, res) => {
  const { userId, guildId } = req.body;
  res.json({
    success: true,
    message: `Would mute user ${userId} (test mode - bot not connected)`,
    userId: userId,
    muted: true
  });
});

app.post('/api/voice/unmute', (req, res) => {
  const { userId, guildId } = req.body;
  res.json({
    success: true,
    message: `Would unmute user ${userId} (test mode - bot not connected)`,
    userId: userId,
    muted: false
  });
});

app.post('/api/voice/deafen', (req, res) => {
  const { userId, guildId } = req.body;
  res.json({
    success: true,
    message: `Would deafen user ${userId} (test mode - bot not connected)`,
    userId: userId,
    deafened: true
  });
});

app.post('/api/voice/undeafen', (req, res) => {
  const { userId, guildId } = req.body;
  res.json({
    success: true,
    message: `Would undeafen user ${userId} (test mode - bot not connected)`,
    userId: userId,
    deafened: false
  });
});

app.post('/api/voice/bulk', (req, res) => {
  const { operations } = req.body;
  res.json({
    success: true,
    message: `Would process ${operations?.length || 0} operations (test mode)`,
    note: 'Test mode - bot not connected'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'GET /api/game/:guildId',
      'POST /api/voice/mute',
      'POST /api/voice/unmute',
      'POST /api/voice/deafen',
      'POST /api/voice/undeafen',
      'POST /api/voice/bulk'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                                                              ║');
  console.log('║  🧪 Mafia Webhook API - TEST MODE                           ║');
  console.log('║                                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`✅ Test server listening on http://localhost:${PORT}`);
  console.log();
  console.log('📋 Available endpoints:');
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   GET  http://localhost:${PORT}/api/game/:guildId`);
  console.log(`   POST http://localhost:${PORT}/api/voice/mute`);
  console.log(`   POST http://localhost:${PORT}/api/voice/unmute`);
  console.log(`   POST http://localhost:${PORT}/api/voice/deafen`);
  console.log(`   POST http://localhost:${PORT}/api/voice/undeafen`);
  console.log(`   POST http://localhost:${PORT}/api/voice/bulk`);
  console.log();
  console.log('⚠️  NOTE: This is test mode with mock data.');
  console.log('   To use the real webhook API:');
  console.log('   1. Add your Discord bot token to .env');
  console.log('   2. Run: npm start');
  console.log();
  console.log('🎮 Try the interactive demo:');
  console.log('   Open: docs/mafia-webhook-example.html');
  console.log();
  console.log('Press Ctrl+C to stop the server');
  console.log();
});

app.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.error('   Kill the other process or change MAFIA_WEBHOOK_PORT in .env');
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
  }
});
