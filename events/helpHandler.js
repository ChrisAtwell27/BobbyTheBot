const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
} = require("discord.js");
const { createCanvas, loadImage } = require("canvas");
const https = require("https");
// TARGET_GUILD_ID removed for multi-guild support

// Function to load image from URL with timeout and error handling
async function loadImageFromURL(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Image loading timeout"));
    }, timeout);

    https
      .get(url, (res) => {
        const chunks = [];

        res.on("data", (chunk) => chunks.push(chunk));

        res.on("end", () => {
          clearTimeout(timer);
          try {
            const buffer = Buffer.concat(chunks);
            resolve(loadImage(buffer));
          } catch (error) {
            reject(error);
          }
        });

        res.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
      })
      .on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// Help categories and their commands - COMPREHENSIVE REWORK
const HELP_CATEGORIES = {
  economy: {
    name: "💰 Economy & Currency",
    emoji: "💰",
    description: "Manage your Honey (currency) and server economy",
    tier: "free",
    commands: [
      {
        name: "!balance",
        description: "Check your Honey balance or another user's",
        usage: "!balance [@user]",
      },
      {
        name: "!baltop",
        description: "View the richest members leaderboard (Top 10)",
        usage: "!baltop",
      },
      {
        name: "!pay",
        description: "Transfer Honey to another user",
        usage: "!pay @user <amount>",
      },
      {
        name: "!beg",
        description: "Beg for Honey with interactive tip jar (1-10 range)",
        usage: "!beg",
      },
      {
        name: "!economy",
        description: "View server-wide economy statistics",
        usage: "!economy",
      },
      {
        name: "!spend",
        description: "Spend your Honey on items/services",
        usage: "!spend <amount>",
      },
      {
        name: "!award",
        description: "**[ADMIN]** Award Honey to a user",
        usage: "!award @user <amount>",
      },
      {
        name: "!awardall",
        description: "**[ADMIN]** Award Honey to all users",
        usage: "!awardall <amount>",
      },
      {
        name: "!clearhoney",
        description: "**[ADMIN]** Reset all balances to 5000 (requires confirmation)",
        usage: "!clearhoney",
      },
    ],
  },
  bounties: {
    name: "🎯 Bounty System",
    emoji: "🎯",
    description: "Post and complete challenges for rewards",
    tier: "plus",
    commands: [
      {
        name: "!postbounty",
        description: "Post a challenge bounty for others to complete",
        usage: '!postbounty <amount> "challenge description"',
      },
      {
        name: "!bounties",
        description: "View all active bounties in the server",
        usage: "!bounties",
      },
      {
        name: "!bounty",
        description: "View specific bounty details by ID",
        usage: "!bounty <id>",
      },
      {
        name: "!claimbounty",
        description: "Claim a completed bounty reward",
        usage: "!claimbounty <id>",
      },
      {
        name: "!cancelbounty",
        description: "Cancel your own bounty (full refund)",
        usage: "!cancelbounty <id>",
      },
      {
        name: "!postadminbounty",
        description: "**[ADMIN]** Post a bounty without spending Honey",
        usage: '!postadminbounty <amount> "description"',
      },
      {
        name: "!clearbounties",
        description: "**[ADMIN]** Clear all active bounties",
        usage: "!clearbounties",
      },
    ],
  },
  casino: {
    name: "🎰 Casino Games",
    emoji: "🎰",
    description: "Test your luck with house games (FREE TIER)",
    tier: "free",
    commands: [
      {
        name: "!gamble",
        description: "View all available casino games and their payouts",
        usage: "!gamble",
      },
      {
        name: "!flip",
        description: "Coin flip - 50/50 chance (2x payout)",
        usage: "!flip <amount>",
      },
      {
        name: "!roulette",
        description: "Roulette wheel - bet on colors or numbers",
        usage: "!roulette <amount> <red/black/0-36>",
      },
      {
        name: "!dice",
        description: "Dice roll - guess the number (6x payout)",
        usage: "!dice <amount> <1-6>",
      },
      {
        name: "!blackjack",
        description: "Classic blackjack against the dealer",
        usage: "!blackjack <amount>",
      },
    ],
  },
  pvp: {
    name: "⚔️ PvP Games",
    emoji: "⚔️",
    description: "Challenge other players to skill-based duels (PLUS TIER)",
    tier: "plus",
    commands: [
      {
        name: "!rps",
        description: "Rock Paper Scissors challenge",
        usage: "!rps <amount>",
      },
      {
        name: "!highercard",
        description: "Higher card duel - highest card wins",
        usage: "!highercard <amount>",
      },
      {
        name: "!quickdraw",
        description: "Type the word fastest to win",
        usage: "!quickdraw <amount>",
      },
      {
        name: "!numberduel",
        description: "Guess closest to random number (1-100)",
        usage: "!numberduel <amount>",
      },
      {
        name: "!gladiator",
        description: "Epic gladiator arena combat with classes",
        usage: "!gladiator @opponent <amount> [class]",
      },
      {
        name: "!arena",
        description: "Alternative gladiator command",
        usage: "!arena @opponent <amount> [class]",
      },
      {
        name: "!arenastats",
        description: "View your or another user's arena statistics",
        usage: "!arenastats [@user]",
      },
      {
        name: "!challenges",
        description: "View all active PvP challenges waiting for opponents",
        usage: "!challenges",
      },
    ],
  },
  poker: {
    name: "🃏 Poker & High Stakes",
    emoji: "🃏",
    description: "High-stakes poker tables and dangerous games",
    tier: "free",
    commands: [
      {
        name: "!poker",
        description: "Create a Texas Hold'em poker lobby",
        usage: "!poker [buy-in]",
      },
      {
        name: "!holdem",
        description: "Alternative poker lobby command",
        usage: "!holdem [buy-in]",
      },
      {
        name: "!russianroulette",
        description: "**DANGEROUS** - Winner takes all, loser loses EVERYTHING",
        usage: "!russianroulette (or !rr)",
      },
    ],
  },
  koth: {
    name: "👑 King of the Hill",
    emoji: "👑",
    description: "Become the King and defend your throne (PLUS TIER)",
    tier: "plus",
    commands: [
      {
        name: "!koth",
        description: "Challenge the current King or become the first King",
        usage: "!koth <amount>",
      },
      {
        name: "!kothstatus",
        description: "View current KOTH game status and King info",
        usage: "!kothstatus",
      },
    ],
  },
  mafia: {
    name: "🐝 Bee Mafia",
    emoji: "🐝",
    description: "Town of Salem style social deduction with 65+ unique roles!",
    tier: "plus",
    commands: [
      {
        name: "!createmafia",
        description: "Start new Bee Mafia game (6+ players in voice channel)",
        usage: "!createmafia [random]",
      },
      {
        name: "!createmafia random",
        description: "Start game with fully randomized roles (chaos mode)",
        usage: "!createmafia random",
      },
      {
        name: "!presets",
        description: "View and select from preset game configurations",
        usage: "!presets",
      },
      {
        name: "!mafiaroles",
        description: "View all 65+ roles organized by faction",
        usage: "!mafiaroles [bee|wasp|neutral|all]",
      },
      {
        name: "!roles",
        description: "Alternative command for viewing roles",
        usage: "!roles [faction]",
      },
      {
        name: "!reveal",
        description: "**[Queen Bee]** Reveal yourself for 3 extra votes",
        usage: "!reveal (during day phase only)",
      },
      {
        name: "!createmafiadebug",
        description: "**[DEBUG]** Create test game with bots",
        usage: "!createmafiadebug [role] [random]",
      },
    ],
  },
  valorant: {
    name: "🎮 Valorant Stats",
    emoji: "🎮",
    description: "Track your Valorant rank, stats, and matches (ULTIMATE TIER)",
    tier: "ultimate",
    commands: [
      {
        name: "!valstats",
        description: "View your Valorant rank, RR, and performance stats",
        usage: "!valstats [@user]",
      },
      {
        name: "!valprofile",
        description: "Link your Riot account to Bobby",
        usage: "!valprofile <username#tag> <region>",
      },
      {
        name: "!valupdate",
        description: "Force update your Valorant profile data",
        usage: "!valupdate",
      },
      {
        name: "!valmatches",
        description: "View your recent competitive match history",
        usage: "!valmatches [@user]",
      },
      {
        name: "!valtop",
        description: "View server Valorant rank leaderboard",
        usage: "!valtop (or !valleaderboard)",
      },
      {
        name: "!valskills",
        description: "View detailed skill statistics breakdown",
        usage: "!valskills [@user]",
      },
      {
        name: "!createteams",
        description: "**[ADMIN]** Create balanced competitive teams",
        usage: "!createteams",
      },
    ],
  },
  teams: {
    name: "👥 Team Builder",
    emoji: "👥",
    description: "Form teams for Valorant, REPO, and other games (PLUS TIER)",
    tier: "plus",
    commands: [
      {
        name: "@Valorant / !valorant",
        description: "Create a 5-player Valorant team from voice channel",
        usage: "Mention @Valorant role or type !valorant",
      },
      {
        name: "!team",
        description: "Create balanced Valorant teams with skill matching",
        usage: "!team [players] [timer_hours]",
      },
      {
        name: "!inhouse",
        description: "Create in-house custom match (5v5 or 3v3)",
        usage: "!inhouse [5v5|3v3]",
      },
      {
        name: "!valorantmap",
        description: "Get random map or vote on maps",
        usage: "!valorantmap (or !randommap)",
      },
      {
        name: "!maplist",
        description: "View all available Valorant maps",
        usage: "!maplist (or !maps)",
      },
      {
        name: "@REPO / !repo",
        description: "Create a 6-player horror game squad",
        usage: "Mention @REPO role or type !repo",
      },
    ],
  },
  trivia: {
    name: "🧠 Trivia & Wordle",
    emoji: "🧠",
    description: "Daily trivia questions and word games",
    tier: "free",
    commands: [
      {
        name: "!trivia",
        description: "Answer the daily trivia question for Honey",
        usage: "!trivia",
      },
      {
        name: "!triviaanswer",
        description: "Submit your trivia answer",
        usage: "!triviaanswer <answer>",
      },
      {
        name: "!triviacurrent",
        description: "Show the current trivia question again",
        usage: "!triviacurrent",
      },
      {
        name: "!triviastats",
        description: "View your trivia statistics and streak",
        usage: "!triviastats [@user]",
      },
      {
        name: "!wordle start",
        description: "Start a new Wordle game",
        usage: "!wordle start",
      },
      {
        name: "!wordle guess",
        description: "Make a guess in your Wordle game",
        usage: "!wordle guess <word>",
      },
    ],
  },
  pets: {
    name: "🐕 Virtual Pets",
    emoji: "🐕",
    description: "Adopt, feed, and train virtual companions",
    tier: "free",
    commands: [
      {
        name: "!adopt",
        description: "Adopt a new virtual pet (costs Honey)",
        usage: "!adopt",
      },
      {
        name: "!pet",
        description: "Check your pet's status, hunger, and happiness",
        usage: "!pet",
      },
      {
        name: "!feed",
        description: "Feed your pet with food from inventory",
        usage: "!feed <food_item>",
      },
      {
        name: "!train",
        description: "Train your pet for XP and level ups",
        usage: "!train",
      },
      {
        name: "!petshop",
        description: "Buy food and items for your pet",
        usage: "!petshop",
      },
      {
        name: "!petinventory",
        description: "View your pet's food and item inventory",
        usage: "!petinventory (or !petinv)",
      },
      {
        name: "!use",
        description: "Use an item on your pet (toys, treats)",
        usage: "!use <item>",
      },
      {
        name: "!petleaderboard",
        description: "View top pets in the server by level",
        usage: "!petleaderboard (or !pettop)",
      },
    ],
  },
  birthday: {
    name: "🎂 Birthdays",
    emoji: "🎂",
    description: "Birthday tracking and celebrations (PLUS TIER)",
    tier: "plus",
    commands: [
      {
        name: "!birthday set",
        description: "Set your birthday for celebrations",
        usage: "!birthday set <MM/DD>",
      },
      {
        name: "!birthday",
        description: "View your or someone's birthday",
        usage: "!birthday [@user]",
      },
      {
        name: "!birthday list",
        description: "View upcoming birthdays in the server",
        usage: "!birthday list",
      },
      {
        name: "!birthday remove",
        description: "Remove your birthday from the system",
        usage: "!birthday remove",
      },
    ],
  },
  activity: {
    name: "📊 Activity Tracking",
    emoji: "📊",
    description: "Daily activity competitions with Honey prizes",
    tier: "free",
    commands: [
      {
        name: "!activity",
        description: "Check your daily activity stats (messages, reactions, voice)",
        usage: "!activity [@user]",
      },
      {
        name: "!activetop",
        description: "Daily activity leaderboard (5,000 Honey prize!)",
        usage: "!activetop",
      },
    ],
  },
  clips: {
    name: "🎬 Clip Submissions",
    emoji: "🎬",
    description: "Submit gaming clips for biweekly voting contests",
    tier: "free",
    commands: [
      {
        name: "!submitclip",
        description: "Submit a video clip for the contest",
        usage: "!submitclip [description]",
      },
      {
        name: "!clipstatus",
        description: "Check current submission period and your status",
        usage: "!clipstatus",
      },
    ],
  },
  ai: {
    name: "🤖 Bobby AI",
    emoji: "🤖",
    description: "Chat with Bobby - your AI companion",
    tier: "free",
    commands: [
      {
        name: 'Say "Bobby"',
        description: "Chat naturally by mentioning Bobby in your message",
        usage: "Hey Bobby, how are you?",
      },
      {
        name: "!ask",
        description: "Ask Bobby a direct question",
        usage: "!ask <question>",
      },
      {
        name: "!8ball",
        description: "Ask the magic 8-ball a yes/no question",
        usage: "!8ball <question> (or !magic8ball)",
      },
      {
        name: "!setmemory",
        description: "Store information for Bobby to remember about you",
        usage: "!setmemory <info> (or !remember)",
      },
      {
        name: "!mymemory",
        description: "See what Bobby remembers about you",
        usage: "!mymemory (or !whatdoyouknow)",
      },
      {
        name: "!forgetme",
        description: "Clear all your data from Bobby's memory",
        usage: "!forgetme (or !clearmemory)",
      },
      {
        name: "!resetbobby",
        description: "**[ADMIN]** Reset Bobby's conversation memory",
        usage: "!resetbobby (or !clearbobby)",
      },
    ],
  },
  moderation: {
    name: "🛡️ Moderation",
    emoji: "🛡️",
    description: "Server moderation and admin commands",
    tier: "free",
    commands: [
      {
        name: "!thinice",
        description: "Check a user's thin ice (warning) status",
        usage: "!thinice @user",
      },
      {
        name: "!reset thinice",
        description: "**[ADMIN]** Reset user's thin ice warnings",
        usage: "!reset thinice @user",
      },
      {
        name: "!dead",
        description: "**[ADMIN]** Mark user as dead (assign dead role)",
        usage: "!dead @user",
      },
      {
        name: "!undead",
        description: "**[ADMIN]** Remove dead status from user",
        usage: "!undead @user",
      },
      {
        name: "!modstats",
        description: "**[ADMIN]** View moderation statistics",
        usage: "!modstats",
      },
      {
        name: "!modconfig",
        description: "**[ADMIN]** Configure moderation settings",
        usage: "!modconfig",
      },
    ],
  },
  booster: {
    name: "💎 Booster Perks",
    emoji: "💎",
    description: "Exclusive commands for Server Boosters",
    tier: "free",
    commands: [
      {
        name: "!boosterrole",
        description: "Create your custom booster role",
        usage: "!boosterrole",
      },
      {
        name: "!color",
        description: "Set your custom role color (hex code)",
        usage: "!color <#hexcode>",
      },
      {
        name: "!recolor",
        description: "Change your custom role color",
        usage: "!recolor <#hexcode>",
      },
      {
        name: "!rename",
        description: "Rename your custom booster role",
        usage: "!rename <new name>",
      },
      {
        name: "!deletecolor",
        description: "Delete your custom booster role",
        usage: "!deletecolor",
      },
    ],
  },
  utility: {
    name: "🔧 Utility & Info",
    emoji: "🔧",
    description: "Bot settings, subscription info, and server stats",
    tier: "free",
    commands: [
      {
        name: "!help",
        description: "Display this help menu with all commands",
        usage: "!help [category]",
      },
      {
        name: "!cmdlist",
        description: "Quick text-only command reference",
        usage: "!cmdlist (or !commandlist)",
      },
      {
        name: "!subscription",
        description: "View server's subscription tier and benefits",
        usage: "!subscription (or !sub, !tier)",
      },
      {
        name: "!settings",
        description: "Get link to bot configuration dashboard",
        usage: "!settings (or !config, !setup)",
      },
      {
        name: "!membercount",
        description: "View server member statistics",
        usage: "!membercount (or !memberstatus)",
      },
      {
        name: "!createmembercount",
        description: "**[ADMIN]** Create member count display channel",
        usage: "!createmembercount",
      },
    ],
  },
};

// Tier display info for embeds
const TIER_INFO = {
  free: { emoji: "🆓", name: "Free", color: "#95a5a6" },
  plus: { emoji: "⭐", name: "Plus", color: "#f39c12" },
  ultimate: { emoji: "👑", name: "Ultimate", color: "#9b59b6" },
};

// Create help menu visualization
async function createHelpMenuCard(user) {
  try {
    const canvas = createCanvas(800, 650);
    const ctx = canvas.getContext("2d");

    // Background gradient - honey/bee theme
    const gradient = ctx.createLinearGradient(0, 0, 800, 650);
    gradient.addColorStop(0, "#f5a623");
    gradient.addColorStop(0.5, "#f39c12");
    gradient.addColorStop(1, "#e67e22");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 650);

    // Decorative honeycomb pattern
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * 800;
      const y = Math.random() * 650;
      const size = Math.random() * 4 + 2;
      ctx.beginPath();
      // Hexagon shape
      for (let j = 0; j < 6; j++) {
        const angle = (Math.PI / 3) * j;
        const px = x + size * Math.cos(angle);
        const py = y + size * Math.sin(angle);
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Title with bee emoji
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px Arial";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
    ctx.shadowBlur = 4;
    ctx.fillText("🐝 BOBBY BOT HELP CENTER", 400, 70);
    ctx.shadowBlur = 0;

    // Subtitle with command count
    const totalCommands = Object.values(HELP_CATEGORIES).reduce(
      (sum, cat) => sum + cat.commands.length, 0
    );
    ctx.font = "22px Arial";
    ctx.fillText(`${Object.keys(HELP_CATEGORIES).length} Categories | ${totalCommands}+ Commands`, 400, 105);

    try {
      // User avatar with timeout protection
      const avatarURL = user.displayAvatarURL({ extension: "png", size: 128 });
      const avatar = await loadImageFromURL(avatarURL, 3000);

      ctx.save();
      ctx.beginPath();
      ctx.arc(400, 175, 45, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 355, 130, 90, 90);
      ctx.restore();

      // Avatar border
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(400, 175, 45, 0, Math.PI * 2);
      ctx.stroke();
    } catch (error) {
      console.log("Failed to load user avatar, using fallback:", error.message);
      // Fallback avatar
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(400, 175, 45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f5a623";
      ctx.font = "36px Arial";
      ctx.fillText("👤", 400, 185);
    }

    // Welcome message
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`Welcome, ${user.username}!`, 400, 245);

    // Tier legend
    ctx.font = "14px Arial";
    ctx.fillText("🆓 Free  |  ⭐ Plus  |  👑 Ultimate", 400, 270);

    // Features grid - show 12 categories (4x3)
    const categories = Object.values(HELP_CATEGORIES);
    const cols = 4;
    const startY = 310;
    const boxWidth = 175;
    const boxHeight = 50;
    const gapX = 10;
    const gapY = 8;

    for (let i = 0; i < Math.min(categories.length, 16); i++) {
      const cat = categories[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 50 + col * (boxWidth + gapX);
      const y = startY + row * (boxHeight + gapY);

      // Get tier color
      const tierColors = {
        free: "rgba(255, 255, 255, 0.25)",
        plus: "rgba(241, 196, 15, 0.35)",
        ultimate: "rgba(155, 89, 182, 0.35)",
      };

      // Category box with tier-based color
      ctx.fillStyle = tierColors[cat.tier] || tierColors.free;
      ctx.fillRect(x, y, boxWidth, boxHeight);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, boxWidth, boxHeight);

      // Category emoji and name
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "left";
      const displayName = cat.name.replace(/^.+? /, "").substring(0, 16);
      ctx.fillText(`${cat.emoji} ${displayName}`, x + 8, y + 22);

      // Tier badge
      const tierBadge = TIER_INFO[cat.tier]?.emoji || "";
      if (cat.tier !== "free") {
        ctx.font = "12px Arial";
        ctx.textAlign = "right";
        ctx.fillText(tierBadge, x + boxWidth - 8, y + 22);
      }

      // Command count
      ctx.font = "11px Arial";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.fillText(`${cat.commands.length} commands`, x + 8, y + 40);
    }

    // Instructions at bottom
    ctx.fillStyle = "#ffffff";
    ctx.font = "16px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      "Use the dropdown menu below to explore categories!",
      400,
      615
    );
    ctx.font = "13px Arial";
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillText(
      "Type !help <category> for details  |  !cmdlist for quick reference",
      400,
      638
    );

    return canvas;
  } catch (error) {
    console.error("Error creating help menu card:", error);
    // Return a simple canvas on error
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f5a623";
    ctx.fillRect(0, 0, 800, 400);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px Arial";
    ctx.textAlign = "center";
    ctx.fillText("🐝 Bobby Bot Help", 400, 200);
    return canvas;
  }
}

// Create category help visualization
async function createCategoryCard(category) {
  try {
    const commandCount = category.commands.length;
    const canvasHeight = Math.max(400, 180 + commandCount * 38);
    const canvas = createCanvas(750, canvasHeight);
    const ctx = canvas.getContext("2d");

    // Get tier-specific colors
    const tierColors = {
      free: { primary: "#27ae60", secondary: "#2ecc71" },
      plus: { primary: "#f39c12", secondary: "#f5a623" },
      ultimate: { primary: "#8e44ad", secondary: "#9b59b6" },
    };
    const colors = tierColors[category.tier] || tierColors.free;

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 750, canvasHeight);
    gradient.addColorStop(0, colors.primary);
    gradient.addColorStop(1, colors.secondary);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 750, canvasHeight);

    // Decorative elements
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * 750;
      const y = Math.random() * canvasHeight;
      const size = Math.random() * 20 + 5;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Header background
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fillRect(0, 0, 750, 100);

    // Category title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px Arial";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = 3;
    ctx.fillText(`${category.emoji} ${category.name}`, 375, 45);
    ctx.shadowBlur = 0;

    // Tier badge
    const tierInfo = TIER_INFO[category.tier] || TIER_INFO.free;
    ctx.font = "16px Arial";
    ctx.fillText(`${tierInfo.emoji} ${tierInfo.name} Tier  |  ${commandCount} Commands`, 375, 75);

    // Description
    ctx.font = "15px Arial";
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillText(category.description, 375, 95);

    // Commands container
    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.fillRect(25, 115, 700, canvasHeight - 140);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(25, 115, 700, canvasHeight - 140);

    // Commands list
    ctx.textAlign = "left";
    category.commands.forEach((cmd, index) => {
      const y = 150 + index * 38;
      const isAdmin = cmd.description.includes("[ADMIN]") || cmd.description.includes("[DEBUG]");

      // Alternating row background
      if (index % 2 === 0) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.03)";
        ctx.fillRect(25, y - 18, 700, 38);
      }

      // Command name with admin badge
      ctx.fillStyle = isAdmin ? "#e74c3c" : colors.primary;
      ctx.font = "bold 15px Arial";
      const cmdName = cmd.name.length > 20 ? cmd.name.substring(0, 20) + "..." : cmd.name;
      ctx.fillText(cmdName, 40, y);

      // Usage hint
      ctx.fillStyle = "#7f8c8d";
      ctx.font = "11px Arial";
      const usageText = cmd.usage.length > 25 ? cmd.usage.substring(0, 25) + "..." : cmd.usage;
      ctx.fillText(usageText, 40, y + 14);

      // Description (truncated)
      ctx.fillStyle = "#2c3e50";
      ctx.font = "13px Arial";
      const desc = cmd.description.replace(/\*\*\[.*?\]\*\*\s*/g, ""); // Remove badges
      const truncatedDesc = desc.length > 50 ? desc.substring(0, 50) + "..." : desc;
      ctx.fillText(truncatedDesc, 230, y);
    });

    // Footer
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Use !help to return to main menu  |  !subscription to check your tier", 375, canvasHeight - 15);

    return canvas;
  } catch (error) {
    console.error("Error creating category card:", error);
    // Return a simple canvas on error
    const canvas = createCanvas(750, 300);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f5a623";
    ctx.fillRect(0, 0, 750, 300);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${category.emoji} ${category.name}`, 375, 150);
    return canvas;
  }
}

module.exports = (client) => {
  console.log("📖 Help Handler initialized");

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (!message.guild) return;

    // EARLY RETURN: Skip if not a help command
    const content = message.content.toLowerCase();
    if (
      !content.startsWith("!help") &&
      !content.startsWith("!commands") &&
      !content.startsWith("!cmdlist") &&
      !content.startsWith("!commandlist")
    )
      return;

    const args = message.content.split(" ");
    const command = args[0].toLowerCase();

    try {
      // Main help command
      if (command === "!help" || command === "!commands") {
        if (args[1]) {
          // Specific category help
          const categoryKey = args[1].toLowerCase();
          if (HELP_CATEGORIES[categoryKey]) {
            await showCategoryHelp(message, HELP_CATEGORIES[categoryKey]);
          } else {
            await message.reply(
              `❌ Unknown category: \`${args[1]}\`. Use \`!help\` to see all categories.`
            );
          }
        } else {
          await showMainHelp(message);
        }
      }

      // Quick command to list all commands
      if (command === "!cmdlist" || command === "!commandlist") {
        await showQuickCommandList(message);
      }
    } catch (error) {
      console.error("Error in help handler:", error);
      await message
        .reply(
          "❌ An error occurred while generating the help menu. Please try again."
        )
        .catch(console.error);
    }
  });

  // Handle help menu interactions
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith("help_category_")) return;

    const userId = interaction.customId.split("_")[2];
    if (interaction.user.id !== userId) {
      return interaction.reply({
        content: "❌ This help menu is not for you!",
        ephemeral: true,
      });
    }

    const categoryKey = interaction.values[0];

    if (categoryKey === "main") {
      await showMainHelpInteraction(interaction);
    } else if (HELP_CATEGORIES[categoryKey]) {
      await showCategoryHelpInteraction(
        interaction,
        HELP_CATEGORIES[categoryKey]
      );
    }
  });

  // Show quick command list (text-only, no images)
  async function showQuickCommandList(message) {
    // Count totals
    const totalCommands = Object.values(HELP_CATEGORIES).reduce(
      (sum, cat) => sum + cat.commands.length, 0
    );

    const embed = new EmbedBuilder()
      .setColor(0xf5a623)
      .setTitle("📋 Bobby Bot Quick Command Reference")
      .setDescription(
        `**${Object.keys(HELP_CATEGORIES).length} Categories** | **${totalCommands}+ Commands**\n\n` +
        `🆓 Free | ⭐ Plus | 👑 Ultimate\n` +
        `Use \`!help <category>\` for detailed info`
      );

    for (const [, category] of Object.entries(HELP_CATEGORIES)) {
      const tierInfo = TIER_INFO[category.tier] || TIER_INFO.free;
      const tierBadge = category.tier !== "free" ? ` ${tierInfo.emoji}` : "";

      const commandsList = category.commands
        .map((cmd) => `\`${cmd.name.split(" ")[0]}\``) // Get first word only for cleaner display
        .filter((cmd, index, arr) => arr.indexOf(cmd) === index) // Remove duplicates
        .join(" ");

      embed.addFields({
        name: `${category.emoji} ${category.name.replace(/^.+? /, "")}${tierBadge}`,
        value:
          commandsList.length > 1024
            ? commandsList.substring(0, 1020) + "..."
            : commandsList || "No commands",
        inline: false,
      });
    }

    embed.setFooter({
      text: "!help [category] for details | !subscription to check tier",
      iconURL: message.client.user.displayAvatarURL(),
    });
    embed.setTimestamp();

    return message.channel.send({ embeds: [embed] });
  }

  // Show main help menu
  async function showMainHelp(message) {
    try {
      const helpCard = await createHelpMenuCard(message.author);
      const attachment = new AttachmentBuilder(helpCard.toBuffer(), {
        name: "help-menu.png",
      });

      // Build select menu options (Discord limit is 25 options)
      const categoryOptions = Object.entries(HELP_CATEGORIES).map(([key, category]) => {
        const tierLabel = category.tier !== "free" ? ` [${TIER_INFO[category.tier]?.name}]` : "";
        return {
          label: category.name.replace(/^.+? /, "").substring(0, 25),
          description: (category.description + tierLabel).substring(0, 100),
          value: key,
          emoji: category.emoji,
        };
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`help_category_${message.author.id}`)
        .setPlaceholder("Choose a category to explore!")
        .addOptions([
          {
            label: "Main Menu",
            description: "Return to the main help menu",
            value: "main",
            emoji: "🏠",
          },
          ...categoryOptions.slice(0, 24), // Ensure we don't exceed 25 total
        ]);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      // Count total commands
      const totalCommands = Object.values(HELP_CATEGORIES).reduce(
        (sum, cat) => sum + cat.commands.length, 0
      );

      const embed = new EmbedBuilder()
        .setTitle("🐝 Bobby Bot Help Center")
        .setColor("#f5a623")
        .setDescription(
          `**Welcome to Bobby Bot!** Your all-in-one Discord companion!\n\n` +
          `📊 **${Object.keys(HELP_CATEGORIES).length} Categories** | **${totalCommands}+ Commands**\n\n` +
          `🆓 = Free Tier | ⭐ = Plus Tier | 👑 = Ultimate Tier`
        )
        .setImage("attachment://help-menu.png")
        .addFields(
          {
            name: "🆓 Free Features",
            value: "💰 Economy & Honey\n🎰 Casino Games\n🃏 Poker Tables\n🐕 Virtual Pets\n🧠 Trivia & Wordle\n📊 Activity Tracking\n🤖 Bobby AI Chat",
            inline: true,
          },
          {
            name: "⭐ Plus Features",
            value: "⚔️ PvP Games\n👑 King of the Hill\n🐝 Bee Mafia (65+ roles)\n🎯 Bounty System\n👥 Team Builder\n🎂 Birthday Tracking",
            inline: true,
          },
          {
            name: "👑 Ultimate Features",
            value: "🎮 Valorant API Stats\n📈 Match History\n🏆 Rank Tracking\n⚖️ Team Balancing\n📊 Skill Analysis",
            inline: true,
          }
        )
        .addFields({
          name: "🚀 Quick Start Guide",
          value:
            "```\n" +
            "!balance     - Check your Honey balance\n" +
            "!gamble      - View casino games\n" +
            "!help casino - Casino command details\n" +
            "!createmafia - Start a Bee Mafia game\n" +
            "!subscription - View your server tier\n" +
            "```\n" +
            '💬 Say **"Hey Bobby"** to chat with the AI!\n' +
            "📋 Use `!cmdlist` for a quick command reference",
          inline: false,
        })
        .addFields({
          name: "📖 Category Navigation",
          value: "Use the **dropdown menu** below or type `!help <category>`\n" +
            "Example: `!help economy`, `!help mafia`, `!help valorant`",
          inline: false,
        })
        .setFooter({
          text: `Bobby Bot v2.0 | ${totalCommands}+ commands across ${Object.keys(HELP_CATEGORIES).length} categories`,
          iconURL: message.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      return message.channel.send({
        embeds: [embed],
        files: [attachment],
        components: [row],
      });
    } catch (error) {
      console.error("Error showing main help:", error);
      // Fallback to text-only help if image generation fails
      return showQuickCommandList(message);
    }
  }

  // Show category-specific help
  async function showCategoryHelp(message, category) {
    try {
      const categoryCard = await createCategoryCard(category);
      const attachment = new AttachmentBuilder(categoryCard.toBuffer(), {
        name: "category-help.png",
      });

      // Get tier info for this category
      const tierInfo = TIER_INFO[category.tier] || TIER_INFO.free;
      const tierBadge = category.tier !== "free"
        ? `\n\n${tierInfo.emoji} **Requires ${tierInfo.name} Tier** - Use \`!subscription\` to check your tier`
        : "";

      // Split commands into chunks to avoid field limits
      const commandChunks = [];
      let currentChunk = "";
      for (const cmd of category.commands) {
        const cmdLine = `**${cmd.name}** - ${cmd.description}\n`;
        if ((currentChunk + cmdLine).length > 1000) {
          commandChunks.push(currentChunk);
          currentChunk = cmdLine;
        } else {
          currentChunk += cmdLine;
        }
      }
      if (currentChunk) commandChunks.push(currentChunk);

      const embed = new EmbedBuilder()
        .setTitle(`${category.emoji} ${category.name}`)
        .setColor(tierInfo.color)
        .setDescription(category.description + tierBadge)
        .setImage("attachment://category-help.png");

      // Add command chunks as fields
      commandChunks.forEach((chunk, index) => {
        embed.addFields({
          name: index === 0 ? "📋 Commands" : "📋 Commands (cont.)",
          value: chunk,
          inline: false,
        });
      });

      // Add usage examples for the first 3 commands
      const usageExamples = category.commands.slice(0, 3)
        .map(cmd => `\`${cmd.usage}\``)
        .join("\n");

      embed.addFields({
        name: "💡 Usage Examples",
        value: usageExamples,
        inline: false,
      });

      embed.setFooter({
        text: `Use !help to return to main menu | ${category.commands.length} commands in this category`
      });
      embed.setTimestamp();

      return message.channel.send({ embeds: [embed], files: [attachment] });
    } catch (error) {
      console.error("Error showing category help:", error);
      // Fallback to text-only version
      const tierInfo = TIER_INFO[category.tier] || TIER_INFO.free;
      const tierBadge = category.tier !== "free"
        ? `\n\n${tierInfo.emoji} **Requires ${tierInfo.name} Tier**`
        : "";

      const embed = new EmbedBuilder()
        .setTitle(`${category.emoji} ${category.name}`)
        .setColor(tierInfo.color)
        .setDescription(category.description + tierBadge);

      // Add commands in chunks to avoid limit
      const commandsPerField = 5;
      for (let i = 0; i < category.commands.length; i += commandsPerField) {
        const chunk = category.commands.slice(i, i + commandsPerField);
        embed.addFields({
          name: i === 0 ? "📋 Commands" : "⠀", // invisible character for continuation
          value: chunk.map((cmd) =>
            `**${cmd.name}**\n${cmd.description}\nUsage: \`${cmd.usage}\``
          ).join("\n\n"),
          inline: false,
        });
      }

      embed.setFooter({ text: "Use !help to return to the main menu" });
      embed.setTimestamp();

      return message.channel.send({ embeds: [embed] });
    }
  }

  // Show main help via interaction
  async function showMainHelpInteraction(interaction) {
    try {
      const helpCard = await createHelpMenuCard(interaction.user);
      const attachment = new AttachmentBuilder(helpCard.toBuffer(), {
        name: "help-menu.png",
      });

      // Count total commands
      const totalCommands = Object.values(HELP_CATEGORIES).reduce(
        (sum, cat) => sum + cat.commands.length, 0
      );

      const embed = new EmbedBuilder()
        .setTitle("🐝 Bobby Bot Help Center")
        .setColor("#f5a623")
        .setDescription(
          `**Welcome to Bobby Bot!** Your all-in-one Discord companion!\n\n` +
          `📊 **${Object.keys(HELP_CATEGORIES).length} Categories** | **${totalCommands}+ Commands**\n\n` +
          `🆓 = Free Tier | ⭐ = Plus Tier | 👑 = Ultimate Tier`
        )
        .setImage("attachment://help-menu.png")
        .addFields(
          {
            name: "🆓 Free Features",
            value: "💰 Economy & Honey\n🎰 Casino Games\n🃏 Poker Tables\n🐕 Virtual Pets\n🧠 Trivia & Wordle\n📊 Activity Tracking\n🤖 Bobby AI Chat",
            inline: true,
          },
          {
            name: "⭐ Plus Features",
            value: "⚔️ PvP Games\n👑 King of the Hill\n🐝 Bee Mafia (65+ roles)\n🎯 Bounty System\n👥 Team Builder\n🎂 Birthday Tracking",
            inline: true,
          },
          {
            name: "👑 Ultimate Features",
            value: "🎮 Valorant API Stats\n📈 Match History\n🏆 Rank Tracking\n⚖️ Team Balancing\n📊 Skill Analysis",
            inline: true,
          }
        )
        .addFields({
          name: "🚀 Quick Start Guide",
          value:
            "```\n" +
            "!balance     - Check your Honey balance\n" +
            "!gamble      - View casino games\n" +
            "!help casino - Casino command details\n" +
            "!createmafia - Start a Bee Mafia game\n" +
            "!subscription - View your server tier\n" +
            "```\n" +
            '💬 Say **"Hey Bobby"** to chat with the AI!',
          inline: false,
        })
        .setFooter({
          text: `Bobby Bot v2.0 | ${totalCommands}+ commands across ${Object.keys(HELP_CATEGORIES).length} categories`,
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.update({ embeds: [embed], files: [attachment] });
    } catch (error) {
      console.error("Error in showMainHelpInteraction:", error);
      // Fallback without image
      const embed = new EmbedBuilder()
        .setTitle("🐝 Bobby Bot Help Center")
        .setColor("#f5a623")
        .setDescription("Use the dropdown to explore command categories!")
        .setTimestamp();
      await interaction.update({ embeds: [embed] }).catch(console.error);
    }
  }

  // Show category help via interaction
  async function showCategoryHelpInteraction(interaction, category) {
    try {
      const categoryCard = await createCategoryCard(category);
      const attachment = new AttachmentBuilder(categoryCard.toBuffer(), {
        name: "category-help.png",
      });

      // Get tier info for this category
      const tierInfo = TIER_INFO[category.tier] || TIER_INFO.free;
      const tierBadge = category.tier !== "free"
        ? `\n\n${tierInfo.emoji} **Requires ${tierInfo.name} Tier** - Use \`!subscription\` to check your tier`
        : "";

      // Split commands into chunks to avoid field limits
      const commandChunks = [];
      let currentChunk = "";
      for (const cmd of category.commands) {
        const cmdLine = `**${cmd.name}** - ${cmd.description}\n`;
        if ((currentChunk + cmdLine).length > 1000) {
          commandChunks.push(currentChunk);
          currentChunk = cmdLine;
        } else {
          currentChunk += cmdLine;
        }
      }
      if (currentChunk) commandChunks.push(currentChunk);

      const embed = new EmbedBuilder()
        .setTitle(`${category.emoji} ${category.name}`)
        .setColor(tierInfo.color)
        .setDescription(category.description + tierBadge)
        .setImage("attachment://category-help.png");

      // Add command chunks as fields
      commandChunks.forEach((chunk, index) => {
        embed.addFields({
          name: index === 0 ? "📋 Commands" : "📋 Commands (cont.)",
          value: chunk,
          inline: false,
        });
      });

      // Add usage examples for the first 3 commands
      const usageExamples = category.commands.slice(0, 3)
        .map(cmd => `\`${cmd.usage}\``)
        .join("\n");

      embed.addFields({
        name: "💡 Usage Examples",
        value: usageExamples,
        inline: false,
      });

      embed.setFooter({
        text: `Use dropdown for other categories | ${category.commands.length} commands`
      });
      embed.setTimestamp();

      await interaction.update({ embeds: [embed], files: [attachment] });
    } catch (error) {
      console.error("Error in showCategoryHelpInteraction:", error);
      // Fallback without image
      const tierInfo = TIER_INFO[category.tier] || TIER_INFO.free;
      const embed = new EmbedBuilder()
        .setTitle(`${category.emoji} ${category.name}`)
        .setColor(tierInfo.color)
        .setDescription(category.description)
        .addFields({
          name: "📋 Commands",
          value: category.commands
            .slice(0, 10)
            .map((cmd) => `**${cmd.name}** - ${cmd.description}`)
            .join("\n"),
          inline: false,
        })
        .setTimestamp();
      await interaction.update({ embeds: [embed] }).catch(console.error);
    }
  }
};
