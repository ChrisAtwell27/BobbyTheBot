/**
 * Gladiator Arena Handler
 * Epic turn-based PvP combat system with classes, abilities, and status effects
 *
 * Commands:
 * - !gladiator @opponent <amount> [class] - Challenge to arena combat
 * - !arena @opponent <amount> [class] - Alias for !gladiator
 * - !arenastats [@user] - View gladiator statistics
 * - !arenahelp - Show arena help and class info
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const {
  getBalance,
  updateBalance,
} = require("../database/helpers/convexEconomyHelpers");
const { getConvexClient } = require("../database/convexClient");
const { api } = require("../convex/_generated/api");
const { CleanupMap, LimitedMap } = require("../utils/memoryUtils");
const {
  insufficientFundsMessage,
  invalidUsageMessage,
  processingMessage,
} = require("../utils/errorMessages");
const { formatCurrency, getCurrencyName } = require("../utils/currencyHelper");

// ==========================================
// CONSTANTS
// ==========================================

const CHALLENGE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const TURN_TIMEOUT = 60 * 1000; // 60 seconds per turn
const HOUSE_CUT = 0.05; // 5% house cut

// Memory management
const activeChallenges = new CleanupMap(5 * 60 * 1000, 1 * 60 * 1000);
const activeMatches = new LimitedMap(50);

// ==========================================
// GLADIATOR CLASSES
// ==========================================

const GLADIATOR_CLASSES = {
  warrior: {
    name: "Warrior",
    emoji: "⚔️",
    description: "Balanced fighter with high damage and good defense",
    color: 0xE74C3C, // Red
    baseStats: { hp: 120, attack: 18, defense: 12, speed: 10 },
    abilities: [
      {
        name: "Heavy Strike",
        emoji: "🗡️",
        description: "Deal 150% damage",
        type: "damage",
        multiplier: 1.5,
        cooldown: 0,
      },
      {
        name: "Shield Bash",
        emoji: "🛡️",
        description: "Deal 80% damage and stun for 1 turn",
        type: "damage_stun",
        multiplier: 0.8,
        effect: { type: "stun", duration: 1 },
        cooldown: 3,
      },
      {
        name: "Battle Cry",
        emoji: "📣",
        description: "Increase attack by 30% for 3 turns",
        type: "buff",
        effect: { stat: "attack", bonus: 0.3, duration: 3 },
        cooldown: 4,
      },
    ],
  },
  mage: {
    name: "Mage",
    emoji: "🔮",
    description: "High damage spellcaster with powerful abilities",
    color: 0x9B59B6, // Purple
    baseStats: { hp: 80, attack: 25, defense: 6, speed: 12 },
    abilities: [
      {
        name: "Fireball",
        emoji: "🔥",
        description: "Deal 130% magic damage",
        type: "damage",
        multiplier: 1.3,
        cooldown: 0,
      },
      {
        name: "Ice Shard",
        emoji: "❄️",
        description: "Deal 100% damage and slow enemy for 2 turns",
        type: "damage_debuff",
        multiplier: 1.0,
        effect: { stat: "speed", penalty: 0.5, duration: 2 },
        cooldown: 2,
      },
      {
        name: "Arcane Barrier",
        emoji: "✨",
        description: "Gain a shield that absorbs 40 damage",
        type: "shield",
        shieldAmount: 40,
        cooldown: 4,
      },
    ],
  },
  rogue: {
    name: "Rogue",
    emoji: "🗡️",
    description: "Fast and deadly, excels at critical strikes",
    color: 0x2ECC71, // Green
    baseStats: { hp: 90, attack: 20, defense: 8, speed: 18 },
    abilities: [
      {
        name: "Backstab",
        emoji: "🔪",
        description: "Deal 120% damage, 40% chance for 200% crit",
        type: "damage_crit",
        multiplier: 1.2,
        critChance: 0.4,
        critMultiplier: 2.0,
        cooldown: 0,
      },
      {
        name: "Poison Blade",
        emoji: "☠️",
        description: "Deal 80% damage + 8 poison damage for 3 turns",
        type: "damage_dot",
        multiplier: 0.8,
        effect: { type: "poison", damage: 8, duration: 3 },
        cooldown: 3,
      },
      {
        name: "Smoke Bomb",
        emoji: "💨",
        description: "Evade all attacks next turn",
        type: "evade",
        duration: 1,
        cooldown: 4,
      },
    ],
  },
  tank: {
    name: "Tank",
    emoji: "🛡️",
    description: "Incredibly durable with high HP and defense",
    color: 0x3498DB, // Blue
    baseStats: { hp: 160, attack: 12, defense: 18, speed: 6 },
    abilities: [
      {
        name: "Slam",
        emoji: "💥",
        description: "Deal damage equal to 50% of your defense",
        type: "defense_damage",
        defenseMultiplier: 0.5,
        cooldown: 0,
      },
      {
        name: "Fortify",
        emoji: "🏰",
        description: "Increase defense by 50% for 3 turns",
        type: "buff",
        effect: { stat: "defense", bonus: 0.5, duration: 3 },
        cooldown: 3,
      },
      {
        name: "Taunt & Heal",
        emoji: "💪",
        description: "Heal 25% of max HP",
        type: "heal",
        healPercent: 0.25,
        cooldown: 4,
      },
    ],
  },
  assassin: {
    name: "Assassin",
    emoji: "🥷",
    description: "Glass cannon with extremely high burst damage",
    color: 0x1ABC9C, // Teal
    baseStats: { hp: 70, attack: 28, defense: 5, speed: 20 },
    abilities: [
      {
        name: "Execute",
        emoji: "⚰️",
        description: "Deal 110% damage, +50% if enemy below 40% HP",
        type: "execute",
        multiplier: 1.1,
        executeThreshold: 0.4,
        executeBonus: 0.5,
        cooldown: 0,
      },
      {
        name: "Shadow Strike",
        emoji: "🌑",
        description: "Deal 180% damage, but take 15% recoil",
        type: "recoil_damage",
        multiplier: 1.8,
        recoilPercent: 0.15,
        cooldown: 2,
      },
      {
        name: "Death Mark",
        emoji: "💀",
        description: "Mark enemy: take 25% more damage for 3 turns",
        type: "debuff",
        effect: { type: "marked", damageIncrease: 0.25, duration: 3 },
        cooldown: 4,
      },
    ],
  },
  paladin: {
    name: "Paladin",
    emoji: "⚜️",
    description: "Holy warrior with healing and protective abilities",
    color: 0xF1C40F, // Gold
    baseStats: { hp: 110, attack: 15, defense: 14, speed: 9 },
    abilities: [
      {
        name: "Holy Smite",
        emoji: "✝️",
        description: "Deal 125% holy damage",
        type: "damage",
        multiplier: 1.25,
        cooldown: 0,
      },
      {
        name: "Divine Shield",
        emoji: "🌟",
        description: "Become immune to damage for 1 turn",
        type: "invincible",
        duration: 1,
        cooldown: 5,
      },
      {
        name: "Lay on Hands",
        emoji: "🙏",
        description: "Heal 35% of max HP and remove debuffs",
        type: "heal_cleanse",
        healPercent: 0.35,
        cooldown: 4,
      },
    ],
  },
};

// ==========================================
// COMBAT ENGINE
// ==========================================

/**
 * Create a new gladiator with stats
 */
function createGladiator(userId, username, avatarURL, className) {
  const classData = GLADIATOR_CLASSES[className];
  const baseStats = { ...classData.baseStats };

  return {
    id: userId,
    name: username,
    avatarURL,
    class: className,
    classData,
    maxHp: baseStats.hp,
    hp: baseStats.hp,
    baseAttack: baseStats.attack,
    baseDefense: baseStats.defense,
    baseSpeed: baseStats.speed,
    attack: baseStats.attack,
    defense: baseStats.defense,
    speed: baseStats.speed,
    shield: 0,
    buffs: [],
    debuffs: [],
    cooldowns: [0, 0, 0], // Cooldowns for each ability
    isStunned: false,
    isEvading: false,
    isInvincible: false,
  };
}

/**
 * Calculate damage with all modifiers
 */
function calculateDamage(attacker, defender, baseDamage) {
  // Apply attack buffs
  let attackMod = 1;
  for (const buff of attacker.buffs) {
    if (buff.stat === "attack") {
      attackMod += buff.bonus;
    }
  }

  // Apply defense with buffs
  let defense = defender.defense;
  for (const buff of defender.buffs) {
    if (buff.stat === "defense") {
      defense *= (1 + buff.bonus);
    }
  }

  // Check for marked debuff (takes more damage)
  let damageIncrease = 1;
  for (const debuff of defender.debuffs) {
    if (debuff.type === "marked") {
      damageIncrease += debuff.damageIncrease;
    }
  }

  // Calculate final damage
  let damage = Math.floor((baseDamage * attackMod - defense * 0.5) * damageIncrease);
  damage = Math.max(1, damage); // Minimum 1 damage

  return damage;
}

/**
 * Apply damage to a gladiator (handles shield first)
 */
function applyDamage(gladiator, damage) {
  if (gladiator.isInvincible) {
    return { absorbed: true, shieldDamage: 0, hpDamage: 0, remainingHp: gladiator.hp };
  }

  let shieldDamage = 0;
  let hpDamage = 0;

  if (gladiator.shield > 0) {
    if (damage <= gladiator.shield) {
      shieldDamage = damage;
      gladiator.shield -= damage;
      damage = 0;
    } else {
      shieldDamage = gladiator.shield;
      damage -= gladiator.shield;
      gladiator.shield = 0;
    }
  }

  hpDamage = Math.min(damage, gladiator.hp);
  gladiator.hp -= hpDamage;

  return { absorbed: false, shieldDamage, hpDamage, remainingHp: gladiator.hp };
}

/**
 * Process turn effects (buffs/debuffs tick down, DOT damage)
 */
function processTurnEffects(gladiator) {
  const effects = [];

  // Process poison/DOT damage
  for (const debuff of gladiator.debuffs) {
    if (debuff.type === "poison" && debuff.damage) {
      gladiator.hp -= debuff.damage;
      effects.push(`☠️ Took ${debuff.damage} poison damage`);
    }
  }

  // Tick down buff durations
  gladiator.buffs = gladiator.buffs.filter(buff => {
    buff.duration--;
    return buff.duration > 0;
  });

  // Tick down debuff durations
  gladiator.debuffs = gladiator.debuffs.filter(debuff => {
    debuff.duration--;
    return debuff.duration > 0;
  });

  // Tick down cooldowns
  gladiator.cooldowns = gladiator.cooldowns.map(cd => Math.max(0, cd - 1));

  // Reset temporary states
  gladiator.isEvading = false;
  gladiator.isInvincible = false;

  // Check for stun removal
  if (gladiator.isStunned) {
    gladiator.isStunned = false;
    effects.push("💫 Recovered from stun");
  }

  // Recalculate stats from base + buffs
  gladiator.attack = gladiator.baseAttack;
  gladiator.defense = gladiator.baseDefense;
  gladiator.speed = gladiator.baseSpeed;

  for (const buff of gladiator.buffs) {
    if (buff.stat === "attack") gladiator.attack = Math.floor(gladiator.baseAttack * (1 + buff.bonus));
    if (buff.stat === "defense") gladiator.defense = Math.floor(gladiator.baseDefense * (1 + buff.bonus));
    if (buff.stat === "speed") gladiator.speed = Math.floor(gladiator.baseSpeed * (1 + buff.bonus));
  }

  for (const debuff of gladiator.debuffs) {
    if (debuff.stat === "speed") gladiator.speed = Math.floor(gladiator.speed * (1 - debuff.penalty));
  }

  return effects;
}

/**
 * Execute an ability
 */
function executeAbility(attacker, defender, abilityIndex) {
  const ability = attacker.classData.abilities[abilityIndex];
  const results = {
    abilityName: ability.name,
    abilityEmoji: ability.emoji,
    description: [],
    damage: 0,
    healing: 0,
    critical: false,
    missed: false,
  };

  // Check if defender is evading
  if (defender.isEvading && ability.type.includes("damage")) {
    results.missed = true;
    results.description.push("💨 Attack missed! Enemy evaded!");
    return results;
  }

  switch (ability.type) {
    case "damage":
      results.damage = calculateDamage(attacker, defender, attacker.attack * ability.multiplier);
      const dmgResult = applyDamage(defender, results.damage);
      if (dmgResult.absorbed) {
        results.description.push("🌟 Attack was blocked by divine protection!");
      } else {
        results.description.push(`Dealt **${results.damage}** damage!`);
        if (dmgResult.shieldDamage > 0) {
          results.description.push(`(${dmgResult.shieldDamage} absorbed by shield)`);
        }
      }
      break;

    case "damage_crit":
      const isCrit = Math.random() < ability.critChance;
      const critMult = isCrit ? ability.critMultiplier : 1;
      results.damage = calculateDamage(attacker, defender, attacker.attack * ability.multiplier * critMult);
      results.critical = isCrit;
      const critResult = applyDamage(defender, results.damage);
      if (critResult.absorbed) {
        results.description.push("🌟 Attack was blocked by divine protection!");
      } else {
        results.description.push(`${isCrit ? "💥 CRITICAL HIT! " : ""}Dealt **${results.damage}** damage!`);
      }
      break;

    case "damage_stun":
      results.damage = calculateDamage(attacker, defender, attacker.attack * ability.multiplier);
      const stunResult = applyDamage(defender, results.damage);
      if (!stunResult.absorbed) {
        results.description.push(`Dealt **${results.damage}** damage!`);
        defender.isStunned = true;
        results.description.push("💫 Enemy is stunned for 1 turn!");
      }
      break;

    case "damage_debuff":
      results.damage = calculateDamage(attacker, defender, attacker.attack * ability.multiplier);
      const debuffResult = applyDamage(defender, results.damage);
      if (!debuffResult.absorbed) {
        results.description.push(`Dealt **${results.damage}** damage!`);
        defender.debuffs.push({ ...ability.effect });
        results.description.push(`❄️ Enemy's ${ability.effect.stat} reduced for ${ability.effect.duration} turns!`);
      }
      break;

    case "damage_dot":
      results.damage = calculateDamage(attacker, defender, attacker.attack * ability.multiplier);
      const dotResult = applyDamage(defender, results.damage);
      if (!dotResult.absorbed) {
        results.description.push(`Dealt **${results.damage}** damage!`);
        defender.debuffs.push({ ...ability.effect });
        results.description.push(`☠️ Enemy is poisoned for ${ability.effect.duration} turns!`);
      }
      break;

    case "execute":
      const hpPercent = defender.hp / defender.maxHp;
      let execMult = ability.multiplier;
      if (hpPercent <= ability.executeThreshold) {
        execMult += ability.executeBonus;
        results.description.push("⚰️ Execute bonus activated!");
      }
      results.damage = calculateDamage(attacker, defender, attacker.attack * execMult);
      const execResult = applyDamage(defender, results.damage);
      if (!execResult.absorbed) {
        results.description.push(`Dealt **${results.damage}** damage!`);
      }
      break;

    case "recoil_damage":
      results.damage = calculateDamage(attacker, defender, attacker.attack * ability.multiplier);
      const recoilResult = applyDamage(defender, results.damage);
      if (!recoilResult.absorbed) {
        results.description.push(`Dealt **${results.damage}** damage!`);
      }
      const recoilDamage = Math.floor(results.damage * ability.recoilPercent);
      attacker.hp -= recoilDamage;
      results.description.push(`💔 Took ${recoilDamage} recoil damage!`);
      break;

    case "defense_damage":
      results.damage = calculateDamage(attacker, defender, attacker.defense * ability.defenseMultiplier);
      const defDmgResult = applyDamage(defender, results.damage);
      if (!defDmgResult.absorbed) {
        results.description.push(`Dealt **${results.damage}** damage!`);
      }
      break;

    case "buff":
      attacker.buffs.push({ ...ability.effect });
      results.description.push(`${ability.effect.stat === "attack" ? "⚔️" : "🛡️"} ${ability.effect.stat.charAt(0).toUpperCase() + ability.effect.stat.slice(1)} increased by ${ability.effect.bonus * 100}% for ${ability.effect.duration} turns!`);
      break;

    case "shield":
      attacker.shield += ability.shieldAmount;
      results.description.push(`✨ Gained a shield absorbing ${ability.shieldAmount} damage!`);
      break;

    case "heal":
      results.healing = Math.floor(attacker.maxHp * ability.healPercent);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + results.healing);
      results.description.push(`💚 Healed for ${results.healing} HP!`);
      break;

    case "heal_cleanse":
      results.healing = Math.floor(attacker.maxHp * ability.healPercent);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + results.healing);
      attacker.debuffs = [];
      results.description.push(`💚 Healed for ${results.healing} HP and cleansed all debuffs!`);
      break;

    case "evade":
      attacker.isEvading = true;
      results.description.push("💨 Will evade all attacks next turn!");
      break;

    case "invincible":
      attacker.isInvincible = true;
      results.description.push("🌟 Divine protection activated for 1 turn!");
      break;

    case "debuff":
      defender.debuffs.push({ ...ability.effect });
      results.description.push(`💀 Enemy marked! Takes ${ability.effect.damageIncrease * 100}% more damage for ${ability.effect.duration} turns!`);
      break;
  }

  // Set cooldown
  attacker.cooldowns[abilityIndex] = ability.cooldown;

  return results;
}

// ==========================================
// EMBED BUILDERS
// ==========================================

/**
 * Build the match status embed
 */
function buildMatchEmbed(match, turnMessage = null, isGameOver = false) {
  const p1 = match.player1;
  const p2 = match.player2;

  const p1HpBar = createHpBar(p1.hp, p1.maxHp);
  const p2HpBar = createHpBar(p2.hp, p2.maxHp);

  const p1StatusIcons = getStatusIcons(p1);
  const p2StatusIcons = getStatusIcons(p2);

  const embed = new EmbedBuilder()
    .setTitle("⚔️ GLADIATOR ARENA ⚔️")
    .setColor(isGameOver ? 0xFFD700 : 0xFF4444)
    .setDescription(turnMessage || `**Turn ${match.turn}** - ${match.currentTurn === p1.id ? p1.name : p2.name}'s turn!`)
    .addFields(
      {
        name: `${p1.classData.emoji} ${p1.name} (${p1.classData.name})`,
        value: `${p1HpBar} ${p1.hp}/${p1.maxHp} HP${p1.shield > 0 ? ` (+${p1.shield} 🛡️)` : ""}\n` +
               `⚔️ ${p1.attack} | 🛡️ ${p1.defense} | 💨 ${p1.speed}${p1StatusIcons}`,
        inline: true,
      },
      {
        name: "⚡",
        value: "VS",
        inline: true,
      },
      {
        name: `${p2.classData.emoji} ${p2.name} (${p2.classData.name})`,
        value: `${p2HpBar} ${p2.hp}/${p2.maxHp} HP${p2.shield > 0 ? ` (+${p2.shield} 🛡️)` : ""}\n` +
               `⚔️ ${p2.attack} | 🛡️ ${p2.defense} | 💨 ${p2.speed}${p2StatusIcons}`,
        inline: true,
      }
    )
    .setFooter({ text: `Prize Pool: ${match.prizePool} (5% house cut applied)` })
    .setTimestamp();

  if (p1.avatarURL || p2.avatarURL) {
    embed.setThumbnail(match.currentTurn === p1.id ? p1.avatarURL : p2.avatarURL);
  }

  return embed;
}

/**
 * Create HP bar visualization
 */
function createHpBar(current, max) {
  const percentage = current / max;
  const filledBars = Math.round(percentage * 10);
  const emptyBars = 10 - filledBars;

  let color = "🟩"; // Green
  if (percentage <= 0.25) color = "🟥"; // Red
  else if (percentage <= 0.5) color = "🟨"; // Yellow

  return color.repeat(filledBars) + "⬛".repeat(emptyBars);
}

/**
 * Get status effect icons
 */
function getStatusIcons(gladiator) {
  const icons = [];
  if (gladiator.isStunned) icons.push("💫");
  if (gladiator.isEvading) icons.push("💨");
  if (gladiator.isInvincible) icons.push("🌟");
  if (gladiator.buffs.length > 0) icons.push("⬆️");
  if (gladiator.debuffs.length > 0) icons.push("⬇️");

  return icons.length > 0 ? "\n" + icons.join(" ") : "";
}

/**
 * Build ability buttons for current player
 */
function buildAbilityButtons(match, gladiator) {
  const rows = [];
  const abilities = gladiator.classData.abilities;

  const row = new ActionRowBuilder();

  for (let i = 0; i < abilities.length; i++) {
    const ability = abilities[i];
    const onCooldown = gladiator.cooldowns[i] > 0;

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`gladiator_ability_${match.id}_${i}`)
        .setLabel(`${ability.name}${onCooldown ? ` (${gladiator.cooldowns[i]})` : ""}`)
        .setStyle(onCooldown ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setEmoji(ability.emoji)
        .setDisabled(onCooldown || gladiator.isStunned)
    );
  }

  rows.push(row);

  // Add forfeit button
  const forfeitRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gladiator_forfeit_${match.id}`)
      .setLabel("Forfeit")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🏳️")
  );
  rows.push(forfeitRow);

  return rows;
}

/**
 * Build challenge embed
 */
async function buildChallengeEmbed(challenger, challenged, amount, className, guildId) {
  const classData = GLADIATOR_CLASSES[className];
  const prizePool = Math.floor(amount * 2 * (1 - HOUSE_CUT));
  const formattedPrize = await formatCurrency(guildId, prizePool);
  const formattedBet = await formatCurrency(guildId, amount);

  return new EmbedBuilder()
    .setTitle("⚔️ GLADIATOR CHALLENGE ⚔️")
    .setColor(classData.color)
    .setDescription(
      `**${challenger.username}** challenges **${challenged.username}** to arena combat!\n\n` +
      `${classData.emoji} **Challenger's Class:** ${classData.name}\n` +
      `*${classData.description}*`
    )
    .addFields(
      { name: "💰 Bet Amount", value: formattedBet, inline: true },
      { name: "🏆 Prize Pool", value: `${formattedPrize} (after 5% house cut)`, inline: true },
      { name: "⏳ Expires", value: `<t:${Math.floor((Date.now() + CHALLENGE_TIMEOUT) / 1000)}:R>`, inline: true },
    )
    .addFields({
      name: "📋 Class Abilities",
      value: classData.abilities.map(a => `${a.emoji} **${a.name}** - ${a.description}`).join("\n"),
    })
    .setFooter({ text: "Click a button to accept with your chosen class!" })
    .setTimestamp();
}

/**
 * Build class selection buttons
 */
function buildClassButtons(challengeId) {
  const rows = [];
  const classes = Object.keys(GLADIATOR_CLASSES);

  // First row: warrior, mage, rogue
  const row1 = new ActionRowBuilder();
  for (const cls of ["warrior", "mage", "rogue"]) {
    const classData = GLADIATOR_CLASSES[cls];
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`gladiator_accept_${challengeId}_${cls}`)
        .setLabel(classData.name)
        .setStyle(ButtonStyle.Primary)
        .setEmoji(classData.emoji)
    );
  }
  rows.push(row1);

  // Second row: tank, assassin, paladin
  const row2 = new ActionRowBuilder();
  for (const cls of ["tank", "assassin", "paladin"]) {
    const classData = GLADIATOR_CLASSES[cls];
    row2.addComponents(
      new ButtonBuilder()
        .setCustomId(`gladiator_accept_${challengeId}_${cls}`)
        .setLabel(classData.name)
        .setStyle(ButtonStyle.Primary)
        .setEmoji(classData.emoji)
    );
  }
  rows.push(row2);

  // Decline button
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gladiator_decline_${challengeId}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("❌")
  );
  rows.push(row3);

  return rows;
}

/**
 * Build arena stats embed
 */
async function buildStatsEmbed(userId, username, avatarURL, stats, guildId) {
  const currencyName = await getCurrencyName(guildId);
  const totalEarningsStr = await formatCurrency(guildId, stats?.totalEarnings || 0);

  const winRate = stats?.totalMatches > 0
    ? ((stats.wins / stats.totalMatches) * 100).toFixed(1)
    : "0.0";

  const favoriteClass = stats?.classStats
    ? Object.entries(stats.classStats).sort((a, b) => b[1].wins - a[1].wins)[0]
    : null;

  const embed = new EmbedBuilder()
    .setTitle(`⚔️ Arena Stats: ${username}`)
    .setColor(0xFFD700)
    .setThumbnail(avatarURL)
    .addFields(
      { name: "🏆 Wins", value: `${stats?.wins || 0}`, inline: true },
      { name: "💀 Losses", value: `${stats?.losses || 0}`, inline: true },
      { name: "📊 Win Rate", value: `${winRate}%`, inline: true },
      { name: "⚔️ Total Matches", value: `${stats?.totalMatches || 0}`, inline: true },
      { name: "💰 Total Earnings", value: totalEarningsStr, inline: true },
      { name: "🔥 Current Streak", value: `${stats?.currentStreak || 0}`, inline: true },
    );

  if (favoriteClass) {
    const classData = GLADIATOR_CLASSES[favoriteClass[0]];
    if (classData) {
      embed.addFields({
        name: "⭐ Favorite Class",
        value: `${classData.emoji} ${classData.name} (${favoriteClass[1].wins}W/${favoriteClass[1].losses}L)`,
        inline: false,
      });
    }
  }

  if (stats?.bestStreak > 0) {
    embed.addFields({
      name: "🏅 Best Win Streak",
      value: `${stats.bestStreak}`,
      inline: true,
    });
  }

  embed.setFooter({ text: "Battle in the arena with !gladiator @opponent <amount> [class]" });
  embed.setTimestamp();

  return embed;
}

/**
 * Build help embed
 */
function buildHelpEmbed() {
  const classInfo = Object.entries(GLADIATOR_CLASSES)
    .map(([key, cls]) => `${cls.emoji} **${cls.name}** - ${cls.description}`)
    .join("\n");

  return new EmbedBuilder()
    .setTitle("⚔️ Gladiator Arena Guide ⚔️")
    .setColor(0xFF4444)
    .setDescription(
      "Battle other players in epic turn-based combat! Choose your class wisely and use abilities strategically to claim victory.\n\n" +
      "**Commands:**\n" +
      "`!gladiator @user <amount> [class]` - Challenge someone\n" +
      "`!arena @user <amount> [class]` - Same as above\n" +
      "`!arenastats [@user]` - View combat statistics\n" +
      "`!arenahelp` - Show this help\n\n" +
      "**Classes (default: warrior):**\n" + classInfo
    )
    .addFields(
      {
        name: "⚔️ Combat Mechanics",
        value:
          "• **Turn-based:** Faster gladiator goes first\n" +
          "• **Abilities:** 3 unique abilities per class\n" +
          "• **Cooldowns:** Powerful abilities have cooldowns\n" +
          "• **Status Effects:** Stun, poison, buffs, debuffs\n" +
          "• **House Cut:** 5% of prize pool goes to the house",
      },
      {
        name: "💡 Tips",
        value:
          "• Counter assassins with tanks\n" +
          "• Use crowd control against glass cannons\n" +
          "• Save powerful abilities for critical moments\n" +
          "• Watch enemy cooldowns!",
      }
    )
    .setFooter({ text: "May the strongest gladiator win!" })
    .setTimestamp();
}

// ==========================================
// STATS MANAGEMENT
// ==========================================

/**
 * Update gladiator stats after a match
 */
async function updateStats(guildId, winnerId, loserId, winnerClass, loserClass, prizeAmount) {
  const client = getConvexClient();

  // Get existing stats
  const [winnerStats, loserStats] = await Promise.all([
    client.query(api.users.getGladiatorStats, { guildId, userId: winnerId }),
    client.query(api.users.getGladiatorStats, { guildId, userId: loserId }),
  ]);

  // Update winner stats
  const newWinnerStats = {
    wins: (winnerStats?.wins || 0) + 1,
    losses: winnerStats?.losses || 0,
    totalMatches: (winnerStats?.totalMatches || 0) + 1,
    totalEarnings: (winnerStats?.totalEarnings || 0) + prizeAmount,
    currentStreak: (winnerStats?.currentStreak || 0) + 1,
    bestStreak: Math.max(winnerStats?.bestStreak || 0, (winnerStats?.currentStreak || 0) + 1),
    classStats: winnerStats?.classStats || {},
  };

  if (!newWinnerStats.classStats[winnerClass]) {
    newWinnerStats.classStats[winnerClass] = { wins: 0, losses: 0 };
  }
  newWinnerStats.classStats[winnerClass].wins++;

  // Update loser stats
  const newLoserStats = {
    wins: loserStats?.wins || 0,
    losses: (loserStats?.losses || 0) + 1,
    totalMatches: (loserStats?.totalMatches || 0) + 1,
    totalEarnings: loserStats?.totalEarnings || 0,
    currentStreak: 0,
    bestStreak: loserStats?.bestStreak || 0,
    classStats: loserStats?.classStats || {},
  };

  if (!newLoserStats.classStats[loserClass]) {
    newLoserStats.classStats[loserClass] = { wins: 0, losses: 0 };
  }
  newLoserStats.classStats[loserClass].losses++;

  // Save stats
  await Promise.all([
    client.mutation(api.users.updateGladiatorStats, { guildId, userId: winnerId, gladiatorStats: newWinnerStats }),
    client.mutation(api.users.updateGladiatorStats, { guildId, userId: loserId, gladiatorStats: newLoserStats }),
  ]);
}

// ==========================================
// COMMAND HANDLERS
// ==========================================

/**
 * Handle !gladiator / !arena command
 */
async function handleGladiatorCommand(message, args) {
  const guildId = message.guild?.id;
  if (!guildId) {
    return message.reply("This command can only be used in a server!");
  }

  // Check for help
  if (args[0] === "help" || message.content.startsWith("!arenahelp")) {
    return message.channel.send({ embeds: [buildHelpEmbed()] });
  }

  // Parse arguments: !gladiator @user <amount> [class]
  const mentioned = message.mentions.users.first();
  if (!mentioned) {
    return message.channel.send(
      invalidUsageMessage("gladiator", "!gladiator @user <amount> [class]", "!gladiator @Bobby 100 warrior")
    );
  }

  if (mentioned.id === message.author.id) {
    return message.reply("You can't challenge yourself!");
  }

  if (mentioned.bot) {
    return message.reply("You can't challenge a bot!");
  }

  // Find amount (first number after mention)
  const amountArg = args.find(arg => !arg.startsWith("<@") && !isNaN(parseInt(arg)));
  if (!amountArg) {
    return message.channel.send(
      invalidUsageMessage("gladiator", "!gladiator @user <amount> [class]", "!gladiator @Bobby 100 warrior")
    );
  }

  const amount = parseInt(amountArg);
  if (amount < 10) {
    return message.reply("Minimum bet is 10!");
  }

  // Find class (optional, default warrior)
  const validClasses = Object.keys(GLADIATOR_CLASSES);
  const classArg = args.find(arg => validClasses.includes(arg.toLowerCase()));
  const className = classArg ? classArg.toLowerCase() : "warrior";

  // Check balance
  const balance = await getBalance(guildId, message.author.id);
  if (balance < amount) {
    return message.channel.send(
      await insufficientFundsMessage(message.author.username, balance, amount, guildId)
    );
  }

  // Check if challenged has enough balance
  const challengedBalance = await getBalance(guildId, mentioned.id);
  if (challengedBalance < amount) {
    const currencyName = await getCurrencyName(guildId);
    return message.reply(`${mentioned.username} doesn't have enough ${currencyName} to accept this challenge!`);
  }

  // Create challenge
  const challengeId = `gladiator_${Date.now()}_${message.author.id}`;

  // Lock challenger's bet
  await updateBalance(guildId, message.author.id, -amount);

  const challenge = {
    id: challengeId,
    challengerId: message.author.id,
    challengerName: message.author.username,
    challengerAvatar: message.author.displayAvatarURL({ dynamic: true }),
    challengerClass: className,
    challengedId: mentioned.id,
    challengedName: mentioned.username,
    challengedAvatar: mentioned.displayAvatarURL({ dynamic: true }),
    amount,
    guildId,
    channelId: message.channel.id,
    timestamp: Date.now(),
  };

  activeChallenges.set(challengeId, challenge);

  // Send challenge embed
  const embed = await buildChallengeEmbed(message.author, mentioned, amount, className, guildId);
  const buttons = buildClassButtons(challengeId);

  const challengeMessage = await message.channel.send({
    content: `${mentioned}, you've been challenged!`,
    embeds: [embed],
    components: buttons,
  });

  // Set timeout for challenge expiry
  challenge.timeoutId = setTimeout(async () => {
    if (activeChallenges.has(challengeId)) {
      activeChallenges.delete(challengeId);
      await updateBalance(guildId, message.author.id, amount); // Refund

      try {
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("expired")
            .setLabel("Challenge Expired")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
            .setEmoji("⏰")
        );
        await challengeMessage.edit({ components: [disabledRow] });
        await message.channel.send(`⏰ Gladiator challenge from **${message.author.username}** has expired and been refunded.`);
      } catch (e) {
        // Message may have been deleted
      }
    }
  }, CHALLENGE_TIMEOUT);
}

/**
 * Handle !arenastats command
 */
async function handleArenaStatsCommand(message, args) {
  const guildId = message.guild?.id;
  if (!guildId) {
    return message.reply("This command can only be used in a server!");
  }

  const targetUser = message.mentions.users.first() || message.author;

  try {
    const client = getConvexClient();
    const stats = await client.query(api.users.getGladiatorStats, {
      guildId,
      userId: targetUser.id
    });

    const embed = await buildStatsEmbed(
      targetUser.id,
      targetUser.username,
      targetUser.displayAvatarURL({ dynamic: true }),
      stats,
      guildId
    );

    await message.channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("[GLADIATOR] Error fetching stats:", error);
    await message.reply("Failed to fetch arena stats. Please try again.");
  }
}

// ==========================================
// INTERACTION HANDLERS
// ==========================================

/**
 * Handle gladiator button interactions
 */
async function handleGladiatorInteraction(interaction) {
  const customId = interaction.customId;
  const userId = interaction.user.id;
  const guildId = interaction.guild?.id;

  if (!guildId) {
    return interaction.reply({ content: "This can only be used in a server!", ephemeral: true });
  }

  // Handle challenge acceptance
  if (customId.startsWith("gladiator_accept_")) {
    const parts = customId.split("_");
    const challengeId = parts.slice(2, -1).join("_");
    const acceptedClass = parts[parts.length - 1];

    const challenge = activeChallenges.get(challengeId);
    if (!challenge) {
      return interaction.reply({ content: "This challenge has expired!", ephemeral: true });
    }

    if (userId !== challenge.challengedId) {
      return interaction.reply({ content: "This challenge isn't for you!", ephemeral: true });
    }

    // Check balance again
    const balance = await getBalance(guildId, userId);
    if (balance < challenge.amount) {
      const currencyName = await getCurrencyName(guildId);
      return interaction.reply({
        content: `You don't have enough ${currencyName}! Need ${challenge.amount}.`,
        ephemeral: true
      });
    }

    // Lock challenged's bet
    await updateBalance(guildId, userId, -challenge.amount);

    // Clear timeout
    if (challenge.timeoutId) {
      clearTimeout(challenge.timeoutId);
    }
    activeChallenges.delete(challengeId);

    // Start the match!
    await startMatch(interaction, challenge, acceptedClass);
  }

  // Handle challenge decline
  else if (customId.startsWith("gladiator_decline_")) {
    const challengeId = customId.replace("gladiator_decline_", "");
    const challenge = activeChallenges.get(challengeId);

    if (!challenge) {
      return interaction.reply({ content: "This challenge has already expired!", ephemeral: true });
    }

    if (userId !== challenge.challengedId) {
      return interaction.reply({ content: "This challenge isn't for you!", ephemeral: true });
    }

    // Clear timeout and refund
    if (challenge.timeoutId) {
      clearTimeout(challenge.timeoutId);
    }
    activeChallenges.delete(challengeId);
    await updateBalance(guildId, challenge.challengerId, challenge.amount);

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("declined")
        .setLabel("Challenge Declined")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
        .setEmoji("❌")
    );

    await interaction.update({ components: [disabledRow] });
    await interaction.channel.send(`${interaction.user.username} declined the gladiator challenge.`);
  }

  // Handle ability usage
  else if (customId.startsWith("gladiator_ability_")) {
    const parts = customId.split("_");
    const matchId = parts[2];
    const abilityIndex = parseInt(parts[3]);

    const match = activeMatches.get(matchId);
    if (!match) {
      return interaction.reply({ content: "This match has ended!", ephemeral: true });
    }

    if (userId !== match.currentTurn) {
      return interaction.reply({ content: "It's not your turn!", ephemeral: true });
    }

    await processAbility(interaction, match, abilityIndex);
  }

  // Handle forfeit
  else if (customId.startsWith("gladiator_forfeit_")) {
    const matchId = customId.replace("gladiator_forfeit_", "");
    const match = activeMatches.get(matchId);

    if (!match) {
      return interaction.reply({ content: "This match has already ended!", ephemeral: true });
    }

    if (userId !== match.player1.id && userId !== match.player2.id) {
      return interaction.reply({ content: "You're not in this match!", ephemeral: true });
    }

    // Determine winner/loser
    const winner = userId === match.player1.id ? match.player2 : match.player1;
    const loser = userId === match.player1.id ? match.player1 : match.player2;

    await endMatch(interaction, match, winner, loser, true);
  }
}

/**
 * Start a gladiator match
 */
async function startMatch(interaction, challenge, acceptedClass) {
  const matchId = `match_${Date.now()}`;
  const prizePool = Math.floor(challenge.amount * 2 * (1 - HOUSE_CUT));

  const player1 = createGladiator(
    challenge.challengerId,
    challenge.challengerName,
    challenge.challengerAvatar,
    challenge.challengerClass
  );

  const player2 = createGladiator(
    challenge.challengedId,
    challenge.challengedName,
    challenge.challengedAvatar,
    acceptedClass
  );

  // Determine who goes first based on speed
  const firstPlayer = player1.speed >= player2.speed ? player1 : player2;

  const match = {
    id: matchId,
    player1,
    player2,
    currentTurn: firstPlayer.id,
    turn: 1,
    prizePool,
    amount: challenge.amount,
    guildId: challenge.guildId,
    channelId: interaction.channel.id,
    messageId: null,
    lastActivity: Date.now(),
  };

  activeMatches.set(matchId, match);

  // Build initial embed
  const embed = buildMatchEmbed(match, `**${firstPlayer.name}** goes first! (Higher speed: ${firstPlayer.speed})`);
  const currentPlayer = firstPlayer.id === player1.id ? player1 : player2;
  const buttons = buildAbilityButtons(match, currentPlayer);

  await interaction.update({
    content: `⚔️ **MATCH STARTED!** ⚔️\n<@${player1.id}> vs <@${player2.id}>`,
    embeds: [embed],
    components: buttons
  });

  // Set turn timeout
  match.turnTimeoutId = setTimeout(() => handleTurnTimeout(match), TURN_TIMEOUT);
}

/**
 * Process an ability usage
 */
async function processAbility(interaction, match, abilityIndex) {
  // Clear turn timeout
  if (match.turnTimeoutId) {
    clearTimeout(match.turnTimeoutId);
  }

  const attacker = match.currentTurn === match.player1.id ? match.player1 : match.player2;
  const defender = match.currentTurn === match.player1.id ? match.player2 : match.player1;

  // Check if stunned
  if (attacker.isStunned) {
    await interaction.reply({ content: "You're stunned and can't act!", ephemeral: true });

    // Process turn effects and switch turns
    processTurnEffects(attacker);
    match.currentTurn = defender.id;
    match.turn++;

    const embed = buildMatchEmbed(match, `💫 **${attacker.name}** was stunned!\n**${defender.name}'s** turn!`);
    const buttons = buildAbilityButtons(match, defender);

    await interaction.message.edit({ embeds: [embed], components: buttons });
    match.turnTimeoutId = setTimeout(() => handleTurnTimeout(match), TURN_TIMEOUT);
    return;
  }

  // Execute ability
  const result = executeAbility(attacker, defender, abilityIndex);

  // Build result description
  let turnDescription = `${result.abilityEmoji} **${attacker.name}** used **${result.abilityName}**!\n`;
  turnDescription += result.description.join("\n");

  // Process end-of-turn effects for attacker
  const attackerEffects = processTurnEffects(attacker);
  if (attackerEffects.length > 0) {
    turnDescription += `\n\n**${attacker.name}:** ${attackerEffects.join(", ")}`;
  }

  // Check for death
  if (defender.hp <= 0) {
    await endMatch(interaction, match, attacker, defender, false);
    return;
  }

  if (attacker.hp <= 0) {
    await endMatch(interaction, match, defender, attacker, false);
    return;
  }

  // Switch turns
  match.currentTurn = defender.id;
  match.turn++;
  match.lastActivity = Date.now();

  // Process start-of-turn effects for defender
  const defenderEffects = processTurnEffects(defender);
  if (defenderEffects.length > 0) {
    turnDescription += `\n\n**${defender.name}:** ${defenderEffects.join(", ")}`;
  }

  // Check if defender died from DOT
  if (defender.hp <= 0) {
    await endMatch(interaction, match, attacker, defender, false);
    return;
  }

  // Update embed
  const embed = buildMatchEmbed(match, turnDescription + `\n\n**${defender.name}'s** turn!`);
  const buttons = buildAbilityButtons(match, defender);

  await interaction.update({ embeds: [embed], components: buttons });

  // Set new turn timeout
  match.turnTimeoutId = setTimeout(() => handleTurnTimeout(match), TURN_TIMEOUT);
}

/**
 * Handle turn timeout
 */
async function handleTurnTimeout(match) {
  if (!activeMatches.has(match.id)) return;

  const afkPlayer = match.currentTurn === match.player1.id ? match.player1 : match.player2;
  const winner = match.currentTurn === match.player1.id ? match.player2 : match.player1;

  try {
    const channel = await globalClient.channels.fetch(match.channelId);
    if (channel) {
      await channel.send(`⏰ **${afkPlayer.name}** took too long! **${winner.name}** wins by default!`);

      // Award victory
      const prizePool = match.prizePool;
      await updateBalance(match.guildId, winner.id, prizePool);
      await updateStats(match.guildId, winner.id, afkPlayer.id, winner.class, afkPlayer.class, prizePool);
    }
  } catch (e) {
    console.error("[GLADIATOR] Error handling timeout:", e);
  }

  activeMatches.delete(match.id);
}

/**
 * End a match
 */
async function endMatch(interaction, match, winner, loser, forfeited) {
  // Clear timeout
  if (match.turnTimeoutId) {
    clearTimeout(match.turnTimeoutId);
  }

  activeMatches.delete(match.id);

  // Award prize
  const prizePool = match.prizePool;
  await updateBalance(match.guildId, winner.id, prizePool);

  // Update stats
  await updateStats(match.guildId, winner.id, loser.id, winner.class, loser.class, prizePool);

  // Build victory embed
  const prizeStr = await formatCurrency(match.guildId, prizePool);

  const victoryEmbed = new EmbedBuilder()
    .setTitle("⚔️ GLADIATOR ARENA - VICTORY! ⚔️")
    .setColor(0xFFD700)
    .setDescription(
      forfeited
        ? `🏳️ **${loser.name}** has forfeited!\n\n🏆 **${winner.name}** wins by default!`
        : `💀 **${loser.name}** has been defeated!\n\n🏆 **${winner.name}** is victorious!`
    )
    .addFields(
      { name: "🏆 Winner", value: `${winner.classData.emoji} ${winner.name}`, inline: true },
      { name: "💀 Loser", value: `${loser.classData.emoji} ${loser.name}`, inline: true },
      { name: "💰 Prize", value: prizeStr, inline: true },
    )
    .setThumbnail(winner.avatarURL)
    .setFooter({ text: `Match lasted ${match.turn} turns` })
    .setTimestamp();

  // Disable all buttons
  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("match_ended")
      .setLabel("Match Ended")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
      .setEmoji("🏁")
  );

  await interaction.update({ embeds: [victoryEmbed], components: [disabledRow] });
}

// ==========================================
// MODULE EXPORT
// ==========================================

// Store client reference for timeout handling
let globalClient = null;

module.exports = (client) => {
  globalClient = client;

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    const command = message.content.split(" ")[0].toLowerCase();
    const args = message.content.slice(command.length).trim().split(/\s+/);

    if (command === "!gladiator" || command === "!arena") {
      await handleGladiatorCommand(message, args);
    } else if (command === "!arenastats") {
      await handleArenaStatsCommand(message, args);
    } else if (command === "!arenahelp") {
      await message.channel.send({ embeds: [buildHelpEmbed()] });
    }
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith("gladiator_")) return;

    try {
      await handleGladiatorInteraction(interaction);
    } catch (error) {
      console.error("[GLADIATOR] Interaction error:", error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "An error occurred. Please try again.", ephemeral: true });
        }
      } catch (e) {
        // Interaction may have expired
      }
    }
  });

  console.log("⚔️ Gladiator Arena handler initialized!");
};

// Export for handler registry
module.exports.handleGladiatorInteraction = handleGladiatorInteraction;
