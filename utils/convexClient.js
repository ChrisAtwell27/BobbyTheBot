const { ConvexHttpClient } = require("convex/browser");
require("dotenv").config();

let client = null;

function initializeClient() {
  if (!client && process.env.CONVEX_URL) {
    try {
      client = new ConvexHttpClient(process.env.CONVEX_URL);
      console.log("✅ Convex client initialized");
    } catch (error) {
      console.error("❌ Failed to initialize Convex client:", error.message);
      throw error;
    }
  }
  return client;
}

function getConvexClient() {
  if (!client) {
    if (!process.env.CONVEX_URL) {
      throw new Error("CONVEX_URL not found in environment variables");
    }
    return initializeClient();
  }
  return client;
}

// Initialize on module load
if (process.env.CONVEX_URL) {
  try {
    initializeClient();
  } catch (error) {
    console.warn("⚠️ Convex client initialization failed. Will retry on first use.");
  }
} else {
  console.warn(
    "⚠️ CONVEX_URL not found in environment variables. Settings functionality will be disabled."
  );
}

// Export both the client directly (for backward compatibility) and the getter function
module.exports = {
  client,
  getConvexClient,
};
// Allow direct access for backward compatibility
module.exports.default = client;
