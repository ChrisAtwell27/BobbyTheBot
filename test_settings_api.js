const http = require("http");

const API_KEY = process.env.SETTINGS_API_KEY || "default-secret";
const GUILD_ID = `test-api-guild-${Date.now()}`;
const PORT = 8080; // Main proxy port

function log(msg) {
  console.log(`[TEST] ${msg}`);
}

async function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "localhost",
      port: PORT,
      path: path,
      method: method,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function test() {
  log(`Starting API test on port ${PORT} for guild ${GUILD_ID}`);

  try {
    // 1. Check health
    log("Checking /health...");
    const health = await makeRequest("GET", "/health");
    if (health.status !== 200 || !health.body.status) {
      throw new Error(`Health check failed: ${JSON.stringify(health.body)}`);
    }
    log("✅ Health check passed");

    // 2. Set options via API
    log("Setting test value via API...");
    const setRes = await makeRequest("POST", `/api/settings/${GUILD_ID}`, {
      key: "apiTestKey",
      value: "api-success",
    });

    if (setRes.status !== 200 || !setRes.body.success) {
      // If 502, it means the bot hasn't started the internal server yet
      if (setRes.status === 502) {
        log(
          "⚠️ Settings API not available (502). Bot might not be ready or settings server failed to start."
        );
        process.exit(1);
      }
      throw new Error(`Failed to set setting: ${JSON.stringify(setRes.body)}`);
    }
    log("✅ Setting updated via API");

    // 3. Get options via API
    log("Getting settings via API...");
    const getRes = await makeRequest("GET", `/api/settings/${GUILD_ID}`);

    if (getRes.status !== 200 || !getRes.body.success) {
      throw new Error(`Failed to get settings: ${JSON.stringify(getRes.body)}`);
    }

    const retrievedVal = getRes.body.settings.apiTestKey;
    if (retrievedVal === "api-success") {
      log(`✅ Verified value: ${retrievedVal}`);
    } else {
      throw new Error(
        `Value mismatch. Expected 'api-success', got '${retrievedVal}'`
      );
    }

    log("🎉 ALL TESTS PASSED");
    process.exit(0);
  } catch (error) {
    log(`❌ Test failed: ${error.message}`);
    process.exit(1);
  }
}

// Wait for bot to potentially start up if running in parallel, but here we assume bot is running
// Actually, I can't restart the bot easily from here without killing the main process.
// I will assume the user or I will restart the bot.
// Since I can't restart the bot via tool, I rely on the existing bot process picking up changes?
// No, node processes don't hot reload index.js changes usually.
// I might need to tell the user to restart, or if I have a run_command that allows background process management.
// The current 'node index.js' is not running in background I can see/control easily unless I started it.
// The "Running terminal commands" metadata shows "node test_settings.js" but not the main bot.
// If the bot is NOT running, I should start it in background.

test();
