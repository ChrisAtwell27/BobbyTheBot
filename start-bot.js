/**
 * Bot Startup Script with Auto-Restart
 * Run this instead of index.js: node start-bot.js
 *
 * Features:
 * - Automatically restarts bot on crash
 * - Tracks restart count and timing
 * - Prevents restart loops (max 10 restarts in 5 minutes)
 * - Logs all crashes for debugging
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const MAX_RESTARTS = 10;
const RESTART_WINDOW = 5 * 60 * 1000; // 5 minutes
const restartTimes = [];
let botProcess = null;
let totalRestarts = 0;

// Create crash log file
const crashLogPath = path.join(__dirname, 'crash.log');

function logCrash(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  console.log(logMessage.trim());

  try {
    fs.appendFileSync(crashLogPath, logMessage);
  } catch (err) {
    console.error('Failed to write to crash log:', err);
  }
}

function startBot() {
  console.log('\n========================================');
  console.log('Starting Discord bot...');
  console.log(`Restart count: ${totalRestarts}`);
  console.log('========================================\n');

  botProcess = spawn('node', ['index.js'], {
    stdio: 'inherit',
    cwd: __dirname,
    env: process.env
  });

  botProcess.on('exit', (code, signal) => {
    const now = Date.now();
    restartTimes.push(now);

    // Remove old restart times outside the window
    const cutoff = now - RESTART_WINDOW;
    while (restartTimes.length > 0 && restartTimes[0] < cutoff) {
      restartTimes.shift();
    }

    // Log the crash
    if (code !== 0) {
      logCrash(`Bot crashed with exit code ${code}, signal: ${signal || 'none'}`);
    } else {
      logCrash('Bot exited normally');
    }

    // Check if we've restarted too many times
    if (restartTimes.length >= MAX_RESTARTS) {
      logCrash(`🚨 CRITICAL: Bot has restarted ${MAX_RESTARTS} times in ${RESTART_WINDOW / 1000}s`);
      logCrash('This indicates a persistent issue. Please check the logs and fix the problem.');
      logCrash('Exiting to prevent restart loop...');
      process.exit(1);
    }

    // Restart the bot
    totalRestarts++;
    logCrash(`Restarting bot in 3 seconds... (restart #${totalRestarts})`);

    setTimeout(() => {
      startBot();
    }, 3000);
  });

  botProcess.on('error', (error) => {
    logCrash(`Failed to start bot process: ${error.message}`);
  });
}

// Handle signals to gracefully shut down
process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  if (botProcess) {
    botProcess.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 5000);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT (Ctrl+C), shutting down gracefully...');
  if (botProcess) {
    botProcess.kill('SIGINT');
  }
  setTimeout(() => process.exit(0), 5000);
});

// Start the bot
logCrash('========================================');
logCrash('Bot Monitor Started');
logCrash('========================================');
startBot();
