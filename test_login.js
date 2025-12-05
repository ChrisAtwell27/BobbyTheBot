require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

console.log("Starting isolated login test...");

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("❌ Token is missing from env!");
  process.exit(1);
}

console.log(`Token found, length: ${token.length}`);
console.log(
  `Token trim check: '${token}' === '${token.trim()}' ? ${token === token.trim()}`
);
console.log(`Token whitespace check: /\\s/.test(token) ? ${/\s/.test(token)}`);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.on("ready", () => {
  console.log(`✅ Login successful! Logged in as ${client.user.tag}`);
  client.destroy();
  process.exit(0);
});

client.login(token).catch((err) => {
  console.error("❌ Login failed:", err);
  process.exit(1);
});
