/**
 * CPU Diagnostics Script
 * Run this with: node diagnose-cpu.js
 *
 * This script helps identify CPU bottlenecks by:
 * 1. Checking for accumulating event listeners
 * 2. Monitoring active timers
 * 3. Tracking memory usage patterns
 */

const { Client, GatewayIntentBits, Partials } = require('discord.js');
require('dotenv').config();

console.log('[DIAGNOSTIC] Starting CPU diagnostic scan...\n');

// Track timer counts
let intervalCount = 0;
let timeoutCount = 0;

// Monkey-patch setInterval and setTimeout to count them
const originalSetInterval = global.setInterval;
const originalSetTimeout = global.setTimeout;
const originalClearInterval = global.clearInterval;
const originalClearTimeout = global.clearTimeout;

const activeIntervals = new Set();
const activeTimeouts = new Set();

global.setInterval = function(...args) {
  intervalCount++;
  const id = originalSetInterval.apply(this, args);
  activeIntervals.add(id);
  console.log(`[TIMER] setInterval created (#${intervalCount}) - Total active: ${activeIntervals.size}`);
  if (args[1]) console.log(`  └─ Interval: ${args[1]}ms`);
  return id;
};

global.setTimeout = function(...args) {
  timeoutCount++;
  const id = originalSetTimeout.apply(this, args);
  activeTimeouts.add(id);
  return id;
};

global.clearInterval = function(id) {
  activeIntervals.delete(id);
  return originalClearInterval.apply(this, arguments);
};

global.clearTimeout = function(id) {
  activeTimeouts.delete(id);
  return originalClearTimeout.apply(this, arguments);
};

// Load configuration
const { loggingChannelId, alertChannelId, alertKeywords, changelogChannelId } = require('./data/config');
const { connectToDatabase } = require('./database/connection');

connectToDatabase().catch(err => {
  console.error('[DIAGNOSTIC] Database connection failed:', err);
  process.exit(1);
});

// Create client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.setMaxListeners(process.env.MAX_EVENT_LISTENERS || 50);

console.log('\n[DIAGNOSTIC] Loading event handlers...\n');

// Load all handlers (same as index.js)
require('./events/messageReactionHandler')(client);
require('./events/valorantRankRoleHandler')(client);
require('./events/debugEmojiHandler')(client);
require('./events/loggingHandler')(client, loggingChannelId);
require('./events/alertHandler')(client, alertKeywords, alertChannelId);
require('./events/thinIceHandler')(client);
require('./events/eggbuckHandler')(client);
require('./events/gamblingHandler')(client);
require('./events/blackjackHandler')(client);
require('./events/clipHandler')(client);
require('./events/valorantTeamHandler')(client);
require('./events/russianRouletteHandler')(client);
require('./events/helpHandler')(client);
require('./events/kothHandler')(client);
require('./events/moderationHandler')(client);
require('./events/boosterRoleHandler')(client);
require('./events/memberCountHandler')(client);
require('./events/askHandler')(client);
require('./events/valorantMapHandler')(client);
require('./events/bumpHandler')(client);
require('./events/birthdayHandler')(client);
require('./events/wordleHandler')(client);
require('./events/valorantInhouseHandler')(client);
const mafiaHandler = require('./events/mafiaHandler');
mafiaHandler(client);
require('./events/triviaHandler')(client);
require('./events/bountyHandler')(client);
require('./events/changelogHandler')(client, changelogChannelId);
const valorantApiHandler = require('./events/valorantApiHandler');
valorantApiHandler.init(client);

console.log('\n[DIAGNOSTIC] All handlers loaded!\n');
console.log('=== TIMER SUMMARY ===');
console.log(`Total setInterval calls: ${intervalCount}`);
console.log(`Active intervals: ${activeIntervals.size}`);
console.log(`Active timeouts: ${activeTimeouts.size}`);
console.log('=====================\n');

// Check event listener counts
console.log('=== EVENT LISTENER COUNTS ===');
const events = [
  'messageCreate',
  'messageReactionAdd',
  'messageReactionRemove',
  'guildMemberAdd',
  'guildMemberRemove',
  'ready',
  'error',
  'voiceStateUpdate'
];

events.forEach(eventName => {
  const count = client.listenerCount(eventName);
  if (count > 0) {
    console.log(`${eventName}: ${count} listener(s)${count > 5 ? ' ⚠️ HIGH!' : ''}`);
  }
});
console.log('==============================\n');

client.once('ready', async () => {
  console.log(`[DIAGNOSTIC] Bot logged in as ${client.user.tag}\n`);

  // Monitor CPU for 30 seconds
  console.log('[DIAGNOSTIC] Monitoring CPU for 30 seconds...\n');

  let lastCpu = process.cpuUsage();
  let sampleCount = 0;
  let highCpuCount = 0;

  const monitorInterval = setInterval(() => {
    sampleCount++;
    const currentCpu = process.cpuUsage(lastCpu);
    const cpuPercent = ((currentCpu.user + currentCpu.system) / 1000000) * 100;
    const memory = process.memoryUsage();
    const heapMB = (memory.heapUsed / 1024 / 1024).toFixed(2);
    const rssMB = (memory.rss / 1024 / 1024).toFixed(2);

    console.log(`[${sampleCount}] CPU: ${cpuPercent.toFixed(2)}% | Heap: ${heapMB}MB | RSS: ${rssMB}MB${cpuPercent > 50 ? ' ⚠️ HIGH!' : ''}`);

    if (cpuPercent > 50) highCpuCount++;

    lastCpu = process.cpuUsage();

    if (sampleCount >= 30) {
      clearInterval(monitorInterval);

      console.log('\n=== DIAGNOSTIC COMPLETE ===');
      console.log(`Samples taken: ${sampleCount}`);
      console.log(`High CPU samples (>50%): ${highCpuCount}`);
      console.log(`Active intervals: ${activeIntervals.size}`);
      console.log(`Active timeouts: ${activeTimeouts.size}`);

      if (highCpuCount > 5) {
        console.log('\n⚠️ WARNING: High CPU usage detected!');
        console.log('Potential causes:');
        console.log('- Too many active timers');
        console.log('- Infinite loops or tight loops');
        console.log('- Heavy computation in event handlers');
        console.log('- Message fetching operations');
      } else {
        console.log('\n✅ CPU usage appears normal during idle state');
        console.log('Note: CPU spike may occur during specific operations');
      }

      console.log('\n[DIAGNOSTIC] Exiting in 3 seconds...');
      setTimeout(() => {
        client.destroy();
        process.exit(0);
      }, 3000);
    }
  }, 1000);
});

client.login(process.env.DISCORD_BOT_TOKEN).catch(error => {
  console.error('[DIAGNOSTIC] Failed to login:', error);
  process.exit(1);
});
