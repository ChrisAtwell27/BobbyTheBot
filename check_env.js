require("dotenv").config();

console.log("Checking environment variables...");
console.log(`DISCORD_BOT_TOKEN exists: ${!!process.env.DISCORD_BOT_TOKEN}`);
if (process.env.DISCORD_BOT_TOKEN) {
  console.log(`Token length: ${process.env.DISCORD_BOT_TOKEN.length}`);
  console.log(`First 5 char: ${process.env.DISCORD_BOT_TOKEN.substring(0, 5)}`);
} else {
  console.log("DISCORD_BOT_TOKEN is missing or empty.");
}

console.log("Keys loaded:");
Object.keys(process.env).forEach((k) => {
  if (k.includes("TOKEN") || k.includes("KEY") || k.includes("SECRET")) {
    console.log(`- ${k}`);
  }
});
