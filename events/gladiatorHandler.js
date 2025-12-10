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

const DEFAULT_CHALLENGE_TIMEOUT = 5 * 60 * 1000; // 5 minutes default
const MIN_CHALLENGE_TIMEOUT = 1 * 60 * 1000; // 1 minute minimum
const MAX_CHALLENGE_TIMEOUT = 60 * 60 * 1000; // 60 minutes maximum
const TURN_TIMEOUT = 30 * 60 * 1000; // 30 minutes per turn
const HOUSE_CUT = 0.05; // 5% house cut

// Memory management
const activeChallenges = new CleanupMap(5 * 60 * 1000, 1 * 60 * 1000);
const activeMatches = new LimitedMap(50);

// ==========================================
// GLADIATOR CLASSES - ENERGY SYSTEM
// ==========================================
// Balance Philosophy:
// - Energy system: Start with 3, gain 1 per turn, max 5
// - Abilities cost 1-3 energy based on power
// - Fatigue: After turn 12, both players take escalating damage (ensures match ends)
// - Max 20 turns total
// - Each class has clear identity and counterplay

const MAX_ENERGY = 5;
const STARTING_ENERGY = 3;
const ENERGY_PER_TURN = 1;
const FATIGUE_START_TURN = 12;
const MAX_TURNS = 20;

const GLADIATOR_CLASSES = {
  warrior: {
    name: "Warrior",
    emoji: "⚔️",
    description: "Balanced fighter with stun and self-buff",
    color: 0xE74C3C, // Red
    baseStats: { hp: 100, attack: 15, defense: 12, speed: 10 },
    abilities: [
      {
        name: "Slash",
        emoji: "🗡️",
        description: "Deal 100% damage",
        type: "damage",
        multiplier: 1.0,
        energyCost: 1,
      },
      {
        name: "Shield Bash",
        emoji: "🛡️",
        description: "Deal 60% damage and stun for 1 turn",
        type: "damage_stun",
        multiplier: 0.6,
        effect: { type: "stun", duration: 1 },
        energyCost: 2,
      },
      {
        name: "War Cry",
        emoji: "📣",
        description: "Boost ATK by 40% for 2 turns",
        type: "buff",
        effect: { stat: "attack", bonus: 0.4, duration: 2 },
        energyCost: 2,
      },
    ],
  },
  mage: {
    name: "Mage",
    emoji: "🔮",
    description: "Glass cannon with burst and shield",
    color: 0x9B59B6, // Purple
    baseStats: { hp: 75, attack: 18, defense: 6, speed: 11 },
    abilities: [
      {
        name: "Fireball",
        emoji: "🔥",
        description: "Deal 110% magic damage",
        type: "damage",
        multiplier: 1.1,
        energyCost: 1,
      },
      {
        name: "Pyroblast",
        emoji: "💥",
        description: "Deal 180% damage (big nuke)",
        type: "damage",
        multiplier: 1.8,
        energyCost: 3,
      },
      {
        name: "Mana Shield",
        emoji: "✨",
        description: "Gain 15 shield",
        type: "shield",
        shieldAmount: 15,
        energyCost: 2,
      },
    ],
  },
  rogue: {
    name: "Rogue",
    emoji: "🗡️",
    description: "Fast crits with poison and evasion",
    color: 0x2ECC71, // Green
    baseStats: { hp: 85, attack: 16, defense: 8, speed: 14 },
    abilities: [
      {
        name: "Backstab",
        emoji: "🔪",
        description: "Deal 90% damage, 40% crit for 170%",
        type: "damage_crit",
        multiplier: 0.9,
        critChance: 0.4,
        critMultiplier: 1.7,
        energyCost: 1,
      },
      {
        name: "Envenom",
        emoji: "☠️",
        description: "Deal 50% + 8 poison for 3 turns",
        type: "damage_dot",
        multiplier: 0.5,
        effect: { type: "poison", damage: 8, duration: 3 },
        energyCost: 2,
      },
      {
        name: "Vanish",
        emoji: "💨",
        description: "Evade next attack",
        type: "evade",
        duration: 1,
        energyCost: 2,
      },
    ],
  },
  tank: {
    name: "Tank",
    emoji: "🛡️",
    description: "Extremely durable with sustain",
    color: 0x3498DB, // Blue
    baseStats: { hp: 130, attack: 11, defense: 16, speed: 7 },
    abilities: [
      {
        name: "Slam",
        emoji: "💥",
        description: "Deal 80% + 30% of DEF as damage",
        type: "defense_damage",
        multiplier: 0.8,
        defenseMultiplier: 0.3,
        energyCost: 1,
      },
      {
        name: "Fortify",
        emoji: "🏰",
        description: "Boost DEF by 50% for 2 turns",
        type: "buff",
        effect: { stat: "defense", bonus: 0.5, duration: 2 },
        energyCost: 2,
      },
      {
        name: "Recover",
        emoji: "💪",
        description: "Heal 25% of max HP",
        type: "heal",
        healPercent: 0.25,
        energyCost: 3,
      },
    ],
  },
  assassin: {
    name: "Assassin",
    emoji: "🥷",
    description: "High burst with execute finisher",
    color: 0x1ABC9C, // Teal
    baseStats: { hp: 70, attack: 19, defense: 6, speed: 13 },
    abilities: [
      {
        name: "Strike",
        emoji: "⚔️",
        description: "Deal 100% damage",
        type: "damage",
        multiplier: 1.0,
        energyCost: 1,
      },
      {
        name: "Ambush",
        emoji: "🌑",
        description: "Deal 150% damage, take 10% recoil",
        type: "recoil_damage",
        multiplier: 1.5,
        recoilPercent: 0.1,
        energyCost: 2,
      },
      {
        name: "Execute",
        emoji: "⚰️",
        description: "Deal 100%, +80% if enemy <30% HP",
        type: "execute",
        multiplier: 1.0,
        executeThreshold: 0.3,
        executeBonus: 0.8,
        energyCost: 3,
      },
    ],
  },
  paladin: {
    name: "Paladin",
    emoji: "⚜️",
    description: "Tanky healer with invincibility",
    color: 0xF1C40F, // Gold
    baseStats: { hp: 110, attack: 13, defense: 13, speed: 9 },
    abilities: [
      {
        name: "Smite",
        emoji: "✝️",
        description: "Deal 110% holy damage",
        type: "damage",
        multiplier: 1.1,
        energyCost: 1,
      },
      {
        name: "Divine Shield",
        emoji: "🌟",
        description: "Block ALL damage next turn",
        type: "invincible",
        duration: 1,
        energyCost: 3,
      },
      {
        name: "Holy Light",
        emoji: "🙏",
        description: "Heal 30% HP, cleanse debuffs",
        type: "heal_cleanse",
        healPercent: 0.3,
        energyCost: 3,
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
    energy: STARTING_ENERGY, // Energy system - starts at 3, max 5, gain 1 per turn
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

  // Calculate final damage - defense reduces damage but not below 30% of base
  const defenseReduction = defense * 0.5;
  const minDamage = Math.floor(baseDamage * attackMod * 0.3); // At least 30% of raw damage
  let damage = Math.floor((baseDamage * attackMod - defenseReduction) * damageIncrease);
  damage = Math.max(minDamage, damage); // Minimum 30% damage always goes through

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
 * Process turn effects (buffs/debuffs tick down, DOT damage, energy regen)
 */
function processTurnEffects(gladiator, matchTurn = 1) {
  const effects = [];

  // Energy regeneration - gain 1 energy per turn, capped at MAX_ENERGY
  if (gladiator.energy < MAX_ENERGY) {
    gladiator.energy = Math.min(MAX_ENERGY, gladiator.energy + ENERGY_PER_TURN);
    effects.push(`⚡ +${ENERGY_PER_TURN} energy (${gladiator.energy}/${MAX_ENERGY})`);
  }

  // Fatigue damage after FATIGUE_START_TURN
  if (matchTurn >= FATIGUE_START_TURN) {
    const fatigueDamage = (matchTurn - FATIGUE_START_TURN + 1) * 5; // 5, 10, 15, 20... damage
    gladiator.hp -= fatigueDamage;
    effects.push(`🔥 Fatigue! Took ${fatigueDamage} damage`);
  }

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
 * Returns null if insufficient energy
 */
function executeAbility(attacker, defender, abilityIndex) {
  const ability = attacker.classData.abilities[abilityIndex];

  // Check energy cost
  const energyCost = ability.energyCost || 1;
  if (attacker.energy < energyCost) {
    return null; // Not enough energy
  }

  // Consume energy
  attacker.energy -= energyCost;

  const results = {
    abilityName: ability.name,
    abilityEmoji: ability.emoji,
    description: [],
    damage: 0,
    healing: 0,
    critical: false,
    missed: false,
    energyCost: energyCost,
  };

  // Check if defender is evading (only for damage abilities)
  const isDamageAbility = ability.type.includes("damage") || ability.type === "execute" || ability.type === "recoil_damage" || ability.type === "defense_damage";
  if (defender.isEvading && isDamageAbility) {
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
      if (stunResult.absorbed) {
        results.description.push("🌟 Attack was blocked by divine protection!");
      } else {
        results.description.push(`Dealt **${results.damage}** damage!`);
        defender.isStunned = true;
        results.description.push("💫 Enemy is stunned for 1 turn!");
      }
      break;

    case "damage_debuff":
      results.damage = calculateDamage(attacker, defender, attacker.attack * ability.multiplier);
      const debuffResult = applyDamage(defender, results.damage);
      if (debuffResult.absorbed) {
        results.description.push("🌟 Attack was blocked by divine protection!");
      } else {
        results.description.push(`Dealt **${results.damage}** damage!`);
        defender.debuffs.push({ ...ability.effect });
        results.description.push(`❄️ Enemy's ${ability.effect.stat} reduced for ${ability.effect.duration} turns!`);
      }
      break;

    case "damage_dot":
      results.damage = calculateDamage(attacker, defender, attacker.attack * ability.multiplier);
      const dotResult = applyDamage(defender, results.damage);
      if (dotResult.absorbed) {
        results.description.push("🌟 Attack was blocked by divine protection!");
      } else {
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
      if (execResult.absorbed) {
        results.description.push("🌟 Attack was blocked by divine protection!");
      } else {
        results.description.push(`Dealt **${results.damage}** damage!`);
      }
      break;

    case "recoil_damage":
      results.damage = calculateDamage(attacker, defender, attacker.attack * ability.multiplier);
      const recoilResult = applyDamage(defender, results.damage);
      if (recoilResult.absorbed) {
        results.description.push("🌟 Attack was blocked by divine protection!");
      } else {
        results.description.push(`Dealt **${results.damage}** damage!`);
      }
      const recoilDamage = Math.floor(results.damage * ability.recoilPercent);
      attacker.hp -= recoilDamage;
      results.description.push(`💔 Took ${recoilDamage} recoil damage!`);
      break;

    case "defense_damage":
      // Base damage from attack stat + bonus from defense
      const defBaseDamage = attacker.attack * (ability.multiplier || 1.0);
      const defBonusDamage = attacker.defense * (ability.defenseMultiplier || 0);
      results.damage = calculateDamage(attacker, defender, defBaseDamage + defBonusDamage);
      const defDmgResult = applyDamage(defender, results.damage);
      if (defDmgResult.absorbed) {
        results.description.push("🌟 Attack was blocked by divine protection!");
      } else {
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

  return results;
}

// ==========================================
// EMBED BUILDERS
// ==========================================

/**
 * Create an energy bar visualization
 */
function createEnergyBar(current, max) {
  const filled = Math.min(current, max);
  return "⚡".repeat(filled) + "⬜".repeat(max - filled);
}

/**
 * Build the match status embed
 */
function buildMatchEmbed(match, turnMessage = null, isGameOver = false) {
  const p1 = match.player1;
  const p2 = match.player2;

  const p1HpBar = createHpBar(p1.hp, p1.maxHp);
  const p2HpBar = createHpBar(p2.hp, p2.maxHp);

  const p1EnergyBar = createEnergyBar(p1.energy, MAX_ENERGY);
  const p2EnergyBar = createEnergyBar(p2.energy, MAX_ENERGY);

  const p1StatusIcons = getStatusIcons(p1);
  const p2StatusIcons = getStatusIcons(p2);

  // Fatigue warning
  let fatigueWarning = "";
  if (match.turn >= FATIGUE_START_TURN - 2) {
    const turnsUntilFatigue = FATIGUE_START_TURN - match.turn;
    if (turnsUntilFatigue > 0) {
      fatigueWarning = `\n⚠️ **Fatigue starts in ${turnsUntilFatigue} turns!**`;
    } else {
      const fatigueDamage = (match.turn - FATIGUE_START_TURN + 1) * 5;
      fatigueWarning = `\n🔥 **FATIGUE ACTIVE!** (${fatigueDamage} damage/turn)`;
    }
  }

  // Determine whose turn and highlight them
  const currentPlayer = match.currentTurn === p1.id ? p1 : p2;
  const turnIndicator = isGameOver ? "" : `\n\n🎯 **<@${currentPlayer.id}> IT'S YOUR TURN!** 🎯`;

  // Build compact stat lines
  const p1Turn = match.currentTurn === p1.id && !isGameOver ? "▶️ " : "";
  const p2Turn = match.currentTurn === p2.id && !isGameOver ? "▶️ " : "";

  const p1Stats = `${p1Turn}${p1.classData.emoji} **${p1.name}** (${p1.classData.name})\n` +
    `❤️ ${p1.hp}/${p1.maxHp}${p1.shield > 0 ? ` +${p1.shield}🛡️` : ""} | ⚡${p1.energy}/${MAX_ENERGY}\n` +
    `⚔️${p1.attack} 🛡️${p1.defense} 💨${p1.speed}${p1StatusIcons}`;

  const p2Stats = `${p2Turn}${p2.classData.emoji} **${p2.name}** (${p2.classData.name})\n` +
    `❤️ ${p2.hp}/${p2.maxHp}${p2.shield > 0 ? ` +${p2.shield}🛡️` : ""} | ⚡${p2.energy}/${MAX_ENERGY}\n` +
    `⚔️${p2.attack} 🛡️${p2.defense} 💨${p2.speed}${p2StatusIcons}`;

  const embed = new EmbedBuilder()
    .setTitle("⚔️ GLADIATOR ARENA ⚔️")
    .setColor(isGameOver ? 0xFFD700 : (match.turn >= FATIGUE_START_TURN ? 0xFF6600 : 0xFF4444))
    .setDescription((turnMessage || `**Turn ${match.turn}/${MAX_TURNS}**`) + turnIndicator + fatigueWarning)
    .addFields(
      {
        name: "🏟️ Combatants",
        value: `${p1Stats}\n\n⚡ **VS** ⚡\n\n${p2Stats}`,
        inline: false,
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
    const energyCost = ability.energyCost || 1;
    const hasEnergy = gladiator.energy >= energyCost;
    const canUse = hasEnergy && !gladiator.isStunned;

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`gladiator_ability_${match.id}_${i}`)
        .setLabel(`${ability.name} (${energyCost}⚡)`)
        .setStyle(canUse ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji(ability.emoji)
        .setDisabled(!canUse)
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
async function buildChallengeEmbed(challenger, challenged, amount, className, guildId, timeout = DEFAULT_CHALLENGE_TIMEOUT) {
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
      { name: "⏳ Expires", value: `<t:${Math.floor((Date.now() + timeout) / 1000)}:R>`, inline: true },
    )
    .addFields({
      name: "📋 Class Abilities",
      value: classData.abilities.map(a => `${a.emoji} **${a.name}** (${a.energyCost || 1}⚡) - ${a.description}`).join("\n"),
    })
    .addFields({
      name: "⚡ Energy System",
      value: `Start: ${STARTING_ENERGY} | Regen: +${ENERGY_PER_TURN}/turn | Max: ${MAX_ENERGY} | Fatigue: Turn ${FATIGUE_START_TURN}+ | Max turns: ${MAX_TURNS}`,
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
    .map(([key, cls]) => {
      const s = cls.baseStats;
      return `${cls.emoji} **${cls.name}** - HP:${s.hp} ATK:${s.attack} DEF:${s.defense} SPD:${s.speed}\n*${cls.description}*`;
    })
    .join("\n\n");

  return new EmbedBuilder()
    .setTitle("⚔️ Gladiator Arena Guide ⚔️")
    .setColor(0xFF4444)
    .setDescription(
      "Battle other players in epic turn-based combat! Choose your class wisely and use abilities strategically to claim victory.\n\n" +
      "**Commands:**\n" +
      "`!gladiator @user <amount> [class] [duration]` - Challenge someone\n" +
      "`!arena @user <amount> [class] [duration]` - Same as above\n" +
      "`!arenastats [@user]` - View combat statistics\n" +
      "`!arenaclass` - View all classes and abilities\n" +
      "`!arenahelp` - Show this help\n\n" +
      "**Duration:** Optional expiry time (e.g., `5m`, `30m`, `1h`). Default: 5m, Max: 60m"
    )
    .addFields(
      {
        name: "📊 Classes & Stats",
        value: classInfo,
      },
      {
        name: "⚡ Energy System",
        value:
          `• **Start:** ${STARTING_ENERGY} energy\n` +
          `• **Regen:** +${ENERGY_PER_TURN} energy per turn\n` +
          `• **Max:** ${MAX_ENERGY} energy\n` +
          "• **Abilities:** Cost 1-3 energy each\n" +
          "• Manage energy wisely - can't use abilities without it!",
      },
      {
        name: "⚔️ Combat Mechanics",
        value:
          "• **Turn Order:** Higher speed goes first\n" +
          "• **Damage:** ATK × Multiplier - (DEF × 0.5), min 30%\n" +
          "• **Effects:** Stun, poison, shields, buffs/debuffs\n" +
          `• **Fatigue:** After turn ${FATIGUE_START_TURN}, both take escalating damage\n` +
          `• **Max Turns:** ${MAX_TURNS} (winner by HP% if reached)\n` +
          "• **House Cut:** 5% of prize pool",
      },
      {
        name: "🎯 Class Matchups",
        value:
          "• **Warrior** beats Rogue (stun stops crits)\n" +
          "• **Mage** beats Tank (high burst vs slow)\n" +
          "• **Rogue** beats Mage (fast crits, evasion)\n" +
          "• **Tank** beats Assassin (survives burst)\n" +
          "• **Assassin** beats Paladin (execute vs heals)\n" +
          "• **Paladin** beats Warrior (sustain war)",
      }
    )
    .setFooter({ text: "All classes are balanced - skill determines victory!" })
    .setTimestamp();
}

/**
 * Build class list embed with buttons
 */
function buildClassListEmbed() {
  const classOverview = Object.entries(GLADIATOR_CLASSES)
    .map(([key, cls]) => {
      const s = cls.baseStats;
      return `${cls.emoji} **${cls.name}** - *${cls.description}*\nHP:${s.hp} | ATK:${s.attack} | DEF:${s.defense} | SPD:${s.speed}`;
    })
    .join("\n\n");

  return new EmbedBuilder()
    .setTitle("⚔️ Gladiator Classes ⚔️")
    .setColor(0xFF4444)
    .setDescription(
      "Choose a class to see detailed abilities and strategies!\n\n" +
      classOverview
    )
    .setFooter({ text: "Click a button below to see class details" })
    .setTimestamp();
}

/**
 * Build class selection buttons
 */
function buildClassListButtons() {
  const rows = [];

  // First row: warrior, mage, rogue
  const row1 = new ActionRowBuilder();
  for (const cls of ["warrior", "mage", "rogue"]) {
    const classData = GLADIATOR_CLASSES[cls];
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`gladiator_class_${cls}`)
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
        .setCustomId(`gladiator_class_${cls}`)
        .setLabel(classData.name)
        .setStyle(ButtonStyle.Primary)
        .setEmoji(classData.emoji)
    );
  }
  rows.push(row2);

  return rows;
}

/**
 * Build detailed class embed
 */
function buildClassDetailEmbed(className) {
  const cls = GLADIATOR_CLASSES[className];
  if (!cls) return null;

  const s = cls.baseStats;

  // Build stat comparison bars
  const maxStat = { hp: 130, attack: 21, defense: 16, speed: 15 };
  const statBar = (value, max) => {
    const filled = Math.round((value / max) * 10);
    return "🟩".repeat(filled) + "⬛".repeat(10 - filled);
  };

  const statsDisplay =
    `**HP:** ${statBar(s.hp, maxStat.hp)} ${s.hp}\n` +
    `**ATK:** ${statBar(s.attack, maxStat.attack)} ${s.attack}\n` +
    `**DEF:** ${statBar(s.defense, maxStat.defense)} ${s.defense}\n` +
    `**SPD:** ${statBar(s.speed, maxStat.speed)} ${s.speed}`;

  // Build abilities list with energy costs
  const abilitiesDisplay = cls.abilities.map(ability => {
    const energyCost = ability.energyCost || 1;
    return `${ability.emoji} **${ability.name}** (${energyCost}⚡)\n${ability.description}`;
  }).join("\n\n");

  // Class-specific tips
  const tips = {
    warrior: "**Strategy:** Use War Cry to buff, then alternate Slash and Shield Bash. Save stun to interrupt enemy heals or big attacks.",
    mage: "**Strategy:** Build to 3 energy for Pyroblast burst. Use Mana Shield when low. Fireball is efficient at 1 energy.",
    rogue: "**Strategy:** Poison early for guaranteed damage, then fish for crits with Backstab. Save Vanish to dodge big hits.",
    tank: "**Strategy:** Fortify immediately, then outlast with Slam. Save Recover for when below 50% HP - it's expensive but powerful!",
    assassin: "**Strategy:** Strike to build energy, then Ambush for burst. Save Execute for when enemy is below 30% HP!",
    paladin: "**Strategy:** Balance offense with Smite. Divine Shield costs 3 but blocks ALL damage. Holy Light cleanses and heals.",
  };

  // Matchup info
  const matchups = {
    warrior: "✅ Beats: Rogue | ❌ Loses to: Paladin | ⚖️ Even: Mage, Tank, Assassin",
    mage: "✅ Beats: Tank | ❌ Loses to: Rogue | ⚖️ Even: Warrior, Assassin, Paladin",
    rogue: "✅ Beats: Mage | ❌ Loses to: Warrior | ⚖️ Even: Tank, Assassin, Paladin",
    tank: "✅ Beats: Assassin | ❌ Loses to: Mage | ⚖️ Even: Warrior, Rogue, Paladin",
    assassin: "✅ Beats: Paladin | ❌ Loses to: Tank | ⚖️ Even: Warrior, Mage, Rogue",
    paladin: "✅ Beats: Warrior | ❌ Loses to: Assassin | ⚖️ Even: Mage, Rogue, Tank",
  };

  return new EmbedBuilder()
    .setTitle(`${cls.emoji} ${cls.name}`)
    .setColor(cls.color)
    .setDescription(`*${cls.description}*`)
    .addFields(
      {
        name: "📊 Base Stats",
        value: statsDisplay,
        inline: false,
      },
      {
        name: "⚔️ Abilities (Energy Cost)",
        value: abilitiesDisplay,
        inline: false,
      },
      {
        name: "🎯 Matchups",
        value: matchups[className],
        inline: false,
      },
      {
        name: "💡 Tips",
        value: tips[className],
        inline: false,
      }
    )
    .setFooter({ text: `Energy: Start ${STARTING_ENERGY}, +${ENERGY_PER_TURN}/turn, max ${MAX_ENERGY} | !gladiator @user <amount> ${className}` })
    .setTimestamp();
}

/**
 * Build back button to return to class list
 */
function buildBackToClassListButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("gladiator_class_list")
      .setLabel("← Back to All Classes")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📋")
  );
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

  // Parse arguments: !gladiator @user <amount> [class] [duration]
  const mentioned = message.mentions.users.first();
  if (!mentioned) {
    return message.channel.send(
      invalidUsageMessage("gladiator", "!gladiator @user <amount> [class] [duration]", "!gladiator @Bobby 100 warrior 10m")
    );
  }

  if (mentioned.id === message.author.id) {
    return message.reply("You can't challenge yourself!");
  }

  if (mentioned.bot) {
    return message.reply("You can't challenge a bot!");
  }

  // Find amount (first number after mention, not a duration like "5m")
  const amountArg = args.find(arg => !arg.startsWith("<@") && !isNaN(parseInt(arg)) && !/^\d+[mh]$/i.test(arg));
  if (!amountArg) {
    return message.channel.send(
      invalidUsageMessage("gladiator", "!gladiator @user <amount> [class] [duration]", "!gladiator @Bobby 100 warrior 10m")
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

  // Find duration (optional, e.g., "5m", "10m", "1h")
  // Matches patterns like: 5m, 10m, 30m, 1h, etc.
  const durationArg = args.find(arg => /^\d+[mh]$/i.test(arg));
  let challengeTimeout = DEFAULT_CHALLENGE_TIMEOUT;

  if (durationArg) {
    const value = parseInt(durationArg);
    const unit = durationArg.slice(-1).toLowerCase();

    if (unit === "m") {
      challengeTimeout = value * 60 * 1000; // minutes to ms
    } else if (unit === "h") {
      challengeTimeout = value * 60 * 60 * 1000; // hours to ms
    }

    // Clamp to min/max
    if (challengeTimeout < MIN_CHALLENGE_TIMEOUT) {
      challengeTimeout = MIN_CHALLENGE_TIMEOUT;
    } else if (challengeTimeout > MAX_CHALLENGE_TIMEOUT) {
      challengeTimeout = MAX_CHALLENGE_TIMEOUT;
    }
  }

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
    timeout: challengeTimeout,
  };

  activeChallenges.set(challengeId, challenge);

  // Send challenge embed
  const embed = await buildChallengeEmbed(message.author, mentioned, amount, className, guildId, challengeTimeout);
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
  }, challengeTimeout);
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
    // customId format: gladiator_ability_match_timestamp_abilityIndex
    // parts: [gladiator, ability, match, timestamp, abilityIndex]
    const parts = customId.split("_");
    const matchId = `${parts[2]}_${parts[3]}`; // Reconstruct "match_timestamp"
    const abilityIndex = parseInt(parts[4]);

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

  // Handle class info buttons
  else if (customId.startsWith("gladiator_class_")) {
    const className = customId.replace("gladiator_class_", "");

    // Back to class list
    if (className === "list") {
      const embed = buildClassListEmbed();
      const buttons = buildClassListButtons();
      await interaction.update({ embeds: [embed], components: buttons });
      return;
    }

    // Show specific class details
    const detailEmbed = buildClassDetailEmbed(className);
    if (!detailEmbed) {
      return interaction.reply({ content: "Unknown class!", ephemeral: true });
    }

    const backButton = buildBackToClassListButton();
    await interaction.update({ embeds: [detailEmbed], components: [backButton] });
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
    processTurnEffects(attacker, match.turn);
    match.currentTurn = defender.id;
    match.turn++;

    // Check max turns - if exceeded, determine winner by HP %
    if (match.turn > MAX_TURNS) {
      await endMatchByHp(interaction, match);
      return;
    }

    const embed = buildMatchEmbed(match, `💫 **${attacker.name}** was stunned!\n**${defender.name}'s** turn!`);
    const buttons = buildAbilityButtons(match, defender);

    await interaction.message.edit({ embeds: [embed], components: buttons });
    match.turnTimeoutId = setTimeout(() => handleTurnTimeout(match), TURN_TIMEOUT);
    return;
  }

  // Execute ability
  const result = executeAbility(attacker, defender, abilityIndex);

  // Check if ability failed due to insufficient energy
  if (result === null) {
    await interaction.reply({ content: "Not enough energy for that ability!", ephemeral: true });
    match.turnTimeoutId = setTimeout(() => handleTurnTimeout(match), TURN_TIMEOUT);
    return;
  }

  // Build result description
  let turnDescription = `${result.abilityEmoji} **${attacker.name}** used **${result.abilityName}** (${result.energyCost}⚡)!\n`;
  turnDescription += result.description.join("\n");

  // Check for death immediately after ability
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

  // Check max turns - if exceeded, determine winner by HP %
  if (match.turn > MAX_TURNS) {
    await endMatchByHp(interaction, match);
    return;
  }

  // Process start-of-turn effects for defender (includes energy regen and fatigue)
  const defenderEffects = processTurnEffects(defender, match.turn);
  if (defenderEffects.length > 0) {
    turnDescription += `\n\n**${defender.name}:** ${defenderEffects.join(", ")}`;
  }

  // Check if defender died from DOT or fatigue
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
 * End match by HP comparison when max turns reached
 */
async function endMatchByHp(interaction, match) {
  // Clear timeout
  if (match.turnTimeoutId) {
    clearTimeout(match.turnTimeoutId);
  }

  const p1HpPercent = match.player1.hp / match.player1.maxHp;
  const p2HpPercent = match.player2.hp / match.player2.maxHp;

  let winner, loser;
  let isDraw = false;

  if (Math.abs(p1HpPercent - p2HpPercent) < 0.01) {
    // Within 1% is a draw
    isDraw = true;
  } else if (p1HpPercent > p2HpPercent) {
    winner = match.player1;
    loser = match.player2;
  } else {
    winner = match.player2;
    loser = match.player1;
  }

  activeMatches.delete(match.id);

  if (isDraw) {
    // Refund both players half the pot
    const refundAmount = Math.floor(match.prizePool / 2);
    await updateBalance(match.guildId, match.player1.id, refundAmount);
    await updateBalance(match.guildId, match.player2.id, refundAmount);

    const refundStr = await formatCurrency(match.guildId, refundAmount);

    // Build draw display for both players
    const p1Display =
      `${match.player1.classData.emoji} **${match.player1.name}**\n` +
      `Class: ${match.player1.classData.name}\n` +
      `HP: ${match.player1.hp}/${match.player1.maxHp} (${Math.floor(p1HpPercent * 100)}%)`;

    const p2Display =
      `${match.player2.classData.emoji} **${match.player2.name}**\n` +
      `Class: ${match.player2.classData.name}\n` +
      `HP: ${match.player2.hp}/${match.player2.maxHp} (${Math.floor(p2HpPercent * 100)}%)`;

    const drawEmbed = new EmbedBuilder()
      .setTitle("🤝 GAME OVER - DRAW 🤝")
      .setColor(0x808080) // Gray for draw
      .setDescription(
        `**═══════════════════════════════**\n` +
        `⏰ Maximum ${MAX_TURNS} turns reached!\n` +
        `Both gladiators fought to a standstill!\n` +
        `**═══════════════════════════════**`
      )
      .addFields(
        {
          name: "⚔️ Fighter 1",
          value: p1Display,
          inline: true,
        },
        {
          name: "⚔️ Fighter 2",
          value: p2Display,
          inline: true,
        },
        {
          name: "\u200B",
          value: "\u200B",
          inline: false,
        },
        {
          name: "💰 Refund",
          value: `**${refundStr}** each`,
          inline: true,
        },
        {
          name: "⏱️ Match Duration",
          value: `**${MAX_TURNS}** turns (max)`,
          inline: true,
        }
      )
      .setFooter({ text: `GG! Use !gladiator @user <amount> to rematch!` })
      .setTimestamp();

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("match_draw")
        .setLabel("DRAW!")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
        .setEmoji("🤝"),
      new ButtonBuilder()
        .setCustomId("match_draw_gg")
        .setLabel("GG")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
        .setEmoji("🎮")
    );

    await interaction.update({ embeds: [drawEmbed], components: [disabledRow] });
  } else {
    // Award prize to winner with higher HP %
    const prizePool = match.prizePool;
    await updateBalance(match.guildId, winner.id, prizePool);
    await updateStats(match.guildId, winner.id, loser.id, winner.class, loser.class, prizePool);

    const prizeStr = await formatCurrency(match.guildId, prizePool);

    // Calculate HP percentages
    const winnerHpPercent = Math.floor((winner.hp / winner.maxHp) * 100);
    const loserHpPercent = Math.floor((loser.hp / loser.maxHp) * 100);

    // Build winner showcase
    const winnerShowcase =
      `╔══════════════════════════════╗\n` +
      `║     🏆 **WINNER** 🏆        ║\n` +
      `╠══════════════════════════════╣\n` +
      `║  ${winner.classData.emoji} **${winner.name}**\n` +
      `║  Class: ${winner.classData.name}\n` +
      `║  HP Remaining: ${winner.hp}/${winner.maxHp} (${winnerHpPercent}%)\n` +
      `╚══════════════════════════════╝`;

    // Build loser display
    const loserDisplay =
      `┌──────────────────────────────┐\n` +
      `│     💀 Defeated 💀          │\n` +
      `├──────────────────────────────┤\n` +
      `│  ${loser.classData.emoji} ${loser.name}\n` +
      `│  Class: ${loser.classData.name}\n` +
      `│  Final HP: ${loser.hp}/${loser.maxHp} (${loserHpPercent}%)\n` +
      `└──────────────────────────────┘`;

    const victoryEmbed = new EmbedBuilder()
      .setTitle("⏰ GAME OVER - TIME'S UP ⏰")
      .setColor(0xFFD700) // Gold for victory
      .setDescription(
        `**═══════════════════════════════**\n` +
        `Maximum ${MAX_TURNS} turns reached!\n` +
        `**${winner.name}** wins by HP advantage!\n` +
        `**═══════════════════════════════**`
      )
      .addFields(
        {
          name: "\u200B",
          value: winnerShowcase,
          inline: false,
        },
        {
          name: "\u200B",
          value: loserDisplay,
          inline: false,
        },
        {
          name: "💰 Prize Awarded",
          value: `**${prizeStr}** → <@${winner.id}>`,
          inline: true,
        },
        {
          name: "⏱️ Match Duration",
          value: `**${MAX_TURNS}** turns (max)`,
          inline: true,
        },
        {
          name: "🏟️ Arena Fee",
          value: `5% house cut`,
          inline: true,
        }
      )
      .setThumbnail(winner.avatarURL)
      .setFooter({ text: `GG! Use !gladiator @user <amount> to play again!` })
      .setTimestamp();

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("match_ended_winner")
        .setLabel(`${winner.name} WINS!`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(true)
        .setEmoji("🏆"),
      new ButtonBuilder()
        .setCustomId("match_ended_gg")
        .setLabel("GG")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
        .setEmoji("🎮")
    );

    await interaction.update({ embeds: [victoryEmbed], components: [disabledRow] });
  }
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

  // Build victory embed with clear GAME OVER screen
  const prizeStr = await formatCurrency(match.guildId, prizePool);

  // Calculate HP percentages for display
  const winnerHpPercent = Math.floor((winner.hp / winner.maxHp) * 100);
  const loserHpPercent = Math.floor((loser.hp / loser.maxHp) * 100);

  // Build dramatic title based on how the match ended
  let titleEmoji = "🏆";
  let endReason = "";
  if (forfeited) {
    titleEmoji = "🏳️";
    endReason = "FORFEIT";
  } else if (loser.hp <= 0) {
    titleEmoji = "💀";
    endReason = "KNOCKOUT";
  }

  // Build winner showcase
  const winnerShowcase =
    `╔══════════════════════════════╗\n` +
    `║     🏆 **WINNER** 🏆        ║\n` +
    `╠══════════════════════════════╣\n` +
    `║  ${winner.classData.emoji} **${winner.name}**\n` +
    `║  Class: ${winner.classData.name}\n` +
    `║  HP Remaining: ${winner.hp}/${winner.maxHp} (${winnerHpPercent}%)\n` +
    `╚══════════════════════════════╝`;

  // Build loser display
  const loserDisplay =
    `┌──────────────────────────────┐\n` +
    `│     💀 Defeated 💀          │\n` +
    `├──────────────────────────────┤\n` +
    `│  ${loser.classData.emoji} ${loser.name}\n` +
    `│  Class: ${loser.classData.name}\n` +
    `│  Final HP: ${Math.max(0, loser.hp)}/${loser.maxHp} (${loserHpPercent}%)\n` +
    `└──────────────────────────────┘`;

  // Match summary
  const matchSummary = forfeited
    ? `🏳️ **${loser.name}** surrendered the battle!`
    : `⚔️ **${winner.name}** struck the final blow!`;

  const victoryEmbed = new EmbedBuilder()
    .setTitle(`${titleEmoji} GAME OVER - ${endReason || "VICTORY"} ${titleEmoji}`)
    .setColor(0xFFD700) // Gold for victory
    .setDescription(
      `**═══════════════════════════════**\n` +
      `${matchSummary}\n` +
      `**═══════════════════════════════**`
    )
    .addFields(
      {
        name: "\u200B", // Empty field name for spacing
        value: winnerShowcase,
        inline: false,
      },
      {
        name: "\u200B",
        value: loserDisplay,
        inline: false,
      },
      {
        name: "💰 Prize Awarded",
        value: `**${prizeStr}** → <@${winner.id}>`,
        inline: true,
      },
      {
        name: "⏱️ Match Duration",
        value: `**${match.turn}** turns`,
        inline: true,
      },
      {
        name: "🏟️ Arena Fee",
        value: `5% house cut`,
        inline: true,
      }
    )
    .setThumbnail(winner.avatarURL)
    .setFooter({ text: `GG! Use !gladiator @user <amount> to play again!` })
    .setTimestamp();

  // Disable all buttons with clear "Game Over" indicator
  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("match_ended_winner")
      .setLabel(`${winner.name} WINS!`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(true)
      .setEmoji("🏆"),
    new ButtonBuilder()
      .setCustomId("match_ended_gg")
      .setLabel("GG")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
      .setEmoji("🎮")
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
    } else if (command === "!arenaclass" || command === "!arenaclasses") {
      const embed = buildClassListEmbed();
      const buttons = buildClassListButtons();
      await message.channel.send({ embeds: [embed], components: buttons });
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
