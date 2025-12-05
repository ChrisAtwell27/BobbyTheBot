require("dotenv").config();

console.log("Checking environment variables...");
console.log(`DISCORD_BOT_TOKEN exists: ${!!process.env.DISCORD_BOT_TOKEN}`);

console.log(`CONVEX_URL exists: ${!!process.env.CONVEX_URL}`);
if (process.env.CONVEX_URL) {
  console.log(`CONVEX_URL value: ${process.env.CONVEX_URL}`);
} else {
  console.log("CONVEX_URL is missing.");
}
