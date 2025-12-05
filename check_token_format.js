require("dotenv").config();
const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.log("No token.");
  process.exit(1);
}

const parts = token.split(".");
console.log(`Token has ${parts.length} parts.`);
if (parts.length === 3) {
  try {
    const id = Buffer.from(parts[0], "base64").toString("ascii");
    console.log(`Decoded ID: ${id}`);
    console.log(`Is ID numeric: ${/^\d+$/.test(id)}`);
  } catch (e) {
    console.log("Failed to decode ID part.");
  }
} else {
  console.log("❌ Token does not have 3 parts (ID.Timestamp.HMAC).");
}
