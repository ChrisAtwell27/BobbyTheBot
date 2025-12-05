/**
 * Deploy Slash Commands to Discord
 * Run this script to register/update slash commands with Discord's API
 *
 * Usage:
 * - Deploy to specific guild (faster, for testing): node commands/deployCommands.js
 * - Deploy globally (slower, takes up to 1 hour): node commands/deployCommands.js --global
 */

const { REST, Routes } = require("discord.js");
const commands = require("./slashCommandBuilder");
require("dotenv").config();

// Guild ID can be provided via:
// 1. Command line: node commands/deployCommands.js --guild=123456789
// 2. Environment variable: DEPLOY_GUILD_ID
// 3. Fallback to DISCORD_GUILD_ID from .env

// Check for required environment variables
if (!process.env.DISCORD_BOT_TOKEN) {
  console.error(
    "❌ Error: DISCORD_BOT_TOKEN not found in environment variables"
  );
  process.exit(1);
}

if (!process.env.DISCORD_CLIENT_ID) {
  console.error(
    "❌ Error: DISCORD_CLIENT_ID not found in environment variables"
  );
  console.error(
    "💡 Add DISCORD_CLIENT_ID to your .env file (find it in Discord Developer Portal)"
  );
  process.exit(1);
}

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

// Parse guild ID from command line or environment
const guildArg = process.argv.find((arg) => arg.startsWith("--guild="));
const guildId = guildArg
  ? guildArg.split("=")[1]
  : process.env.DEPLOY_GUILD_ID || process.env.DISCORD_GUILD_ID;

// Check if deploying globally
const isGlobal = process.argv.includes("--global");

// Prepare command data for Discord API
const commandData = commands.map((cmd) => cmd.data.toJSON());

// Create REST client
const rest = new REST({ version: "10" }).setToken(token);

async function deployCommands() {
  try {
    console.log(`\n🚀 Starting slash command deployment...\n`);
    console.log(`📋 Total commands to deploy: ${commandData.length}`);
    console.log(
      `🎯 Deployment mode: ${isGlobal ? "GLOBAL" : `GUILD (${guildId})`}\n`
    );

    // Log all commands being deployed
    console.log("Commands:");
    commandData.forEach((cmd, index) => {
      console.log(`  ${index + 1}. /${cmd.name} - ${cmd.description}`);
    });
    console.log("");

    let route;
    if (isGlobal) {
      // Deploy globally (takes up to 1 hour to propagate)
      route = Routes.applicationCommands(clientId);
      console.log(
        "⚠️  Global deployment can take up to 1 hour to propagate to all servers"
      );
    } else {
      // Deploy to specific guild (instant)
      route = Routes.applicationGuildCommands(clientId, guildId);
      console.log("✅ Guild deployment is instant");
    }

    console.log("\n⏳ Deploying commands...");

    const data = await rest.put(route, { body: commandData });

    console.log(`\n✅ Successfully deployed ${data.length} slash commands!`);

    if (isGlobal) {
      console.log(
        "\n💡 Global commands are now registered. They may take up to 1 hour to appear in Discord."
      );
    } else {
      console.log(
        `\n💡 Commands are now available in your guild (ID: ${guildId})`
      );
    }

    console.log("\n📖 Command Categories:");
    const categories = {};
    commands.forEach((cmd) => {
      if (!categories[cmd.category]) categories[cmd.category] = [];
      categories[cmd.category].push(cmd.data.name);
    });
    Object.entries(categories).forEach(([cat, cmds]) => {
      console.log(`  ${cat}: ${cmds.join(", ")}`);
    });

    console.log("\n🎉 Deployment complete!\n");
  } catch (error) {
    console.error("\n❌ Error deploying commands:", error);

    if (error.code === 50001) {
      console.error(
        "\n💡 Missing Access: Make sure the bot has been invited to the guild with applications.commands scope"
      );
    } else if (error.code === 401) {
      console.error("\n💡 Invalid token: Check your DISCORD_BOT_TOKEN in .env");
    } else if (error.code === 10004) {
      console.error(
        "\n💡 Unknown Guild: Check your TARGET_GUILD_ID in guildConfig.js"
      );
    } else if (error.rawError) {
      console.error("Raw error:", JSON.stringify(error.rawError, null, 2));
    }

    process.exit(1);
  }
}

// Run deployment
deployCommands();
