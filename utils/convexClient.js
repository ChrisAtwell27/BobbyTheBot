const { ConvexHttpClient } = require("convex/browser");
require("dotenv").config();

let client = null;

if (process.env.CONVEX_URL) {
  try {
    client = new ConvexHttpClient(process.env.CONVEX_URL);
    console.log("✅ Convex client initialized");
  } catch (error) {
    console.error("❌ Failed to initialize Convex client:", error.message);
  }
} else {
  console.warn(
    "⚠️ CONVEX_URL not found in environment variables. Settings functionality will be disabled."
  );
}

module.exports = client;
