const { ConvexHttpClient } = require('convex/browser');

/**
 * Convex client for BobbyTheBot
 * Replaces MongoDB connection
 */

let convexClient = null;

/**
 * Initialize Convex client
 */
function getConvexClient() {
  if (!convexClient) {
    const convexUrl = process.env.CONVEX_URL;

    if (!convexUrl) {
      console.warn('⚠️  CONVEX_URL not found in environment variables. Data will not be persisted.');
      return null;
    }

    convexClient = new ConvexHttpClient(convexUrl);
    console.log('✅ Convex client initialized');
  }

  return convexClient;
}

/**
 * Close Convex client
 */
function closeConvexClient() {
  if (convexClient) {
    convexClient.close();
    convexClient = null;
    console.log('✅ Convex client closed');
  }
}

/**
 * Check if Convex is connected
 */
function isConvexConnected() {
  return convexClient !== null;
}

module.exports = {
  getConvexClient,
  closeConvexClient,
  isConvexConnected,
};
