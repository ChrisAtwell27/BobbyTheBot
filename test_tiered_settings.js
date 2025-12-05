const http = require("http");

const API_KEY = process.env.SETTINGS_API_KEY || "default-secret";
const GUILD_ID = `test-tier-guild-${Date.now()}`;
const PORT = 8080;

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
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  log(`Starting Tiered API Tier Test`);

  try {
    // 1. Get initial settings (should show tier: free)
    log("1. Getting settings...");
    const getRes = await makeRequest("GET", `/api/settings/${GUILD_ID}`);
    if (!getRes.body.success) throw new Error("Failed to get settings");

    log(`Current Tier: ${getRes.body.tier}`);
    if (getRes.body.tier !== "free")
      log("⚠️ Warning: Expected tier to be free initially");

    // 2. Try to set a FREE setting (should success)
    log("2. Setting FREE setting (features.trivia)...");
    const setFree = await makeRequest("POST", `/api/settings/${GUILD_ID}`, {
      key: "features.trivia",
      value: false,
    });
    if (setFree.status === 200) log("✅ Success: Free setting updated");
    else
      throw new Error(
        `Failed to set free setting: ${JSON.stringify(setFree.body)}`
      );

    // 3. Try to set a PREMIUM setting (should fail)
    log("3. Setting PREMIUM setting (openaiApiKey)...");
    const setPrem = await makeRequest("POST", `/api/settings/${GUILD_ID}`, {
      key: "openaiApiKey",
      value: "sk-fail",
    });

    if (setPrem.status === 403) {
      log(
        `✅ Success: Premium setting blocked (403). Message: ${setPrem.body.error}`
      );
    } else {
      throw new Error(
        `Expected 403 Forbidden, got ${setPrem.status}: ${JSON.stringify(setPrem.body)}`
      );
    }

    log("🎉 ALL TESTS PASSED");
    process.exit(0);
  } catch (error) {
    log(`❌ Test failed: ${error.message}`);
    process.exit(1);
  }
}

test();
