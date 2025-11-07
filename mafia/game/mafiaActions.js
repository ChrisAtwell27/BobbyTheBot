/**
 * Mafia Night Actions Processing
 * Handles attack/defense system, role abilities, and visit tracking
 *
 * Attack Levels: 0=None, 1=Basic, 2=Powerful, 3=Unstoppable
 * Defense Levels: 0=None, 1=Basic, 2=Powerful, 3=Invincible
 * Attack succeeds if attack >= defense
 */

const { ROLES } = require('../roles/mafiaRoles');
const { addVisit, getVisitors } = require('./mafiaGameState');
const { EmbedBuilder } = require('discord.js');

/**
 * Process all night actions and determine deaths
 * @param {Object} game - Game object
 * @param {Object} client - Discord client
 * @returns {Array} Array of death results
 */
async function processNightActions(game, client) {
    const deaths = [];
    const protections = new Map(); // playerId => protection level
    const attacks = new Map(); // playerId => array of {attackerId, attack level}
    const healers = new Map(); // playerId => healerId
    const roleblocks = new Map(); // playerId => blocker
    const controlTargets = new Map(); // playerId => {target1, target2}
    const jailedPlayers = new Set(); // players who are jailed
    const alertPlayers = new Set(); // players who are on alert

    // Process guilty vigilantes (Soldier Bees who killed a Bee) - they die from guilt
    for (const player of game.players) {
        if (player.alive && player.guiltyNextNight) {
            player.alive = false;
            player.guiltyNextNight = false;
            deaths.push({
                victimId: player.id,
                killers: [{
                    killerId: player.id, // Self-inflicted (guilt)
                    attackType: 'guilt'
                }]
            });
        }
    }

    // First pass: Process all actions and determine protections/attacks
    for (const [userId, action] of Object.entries(game.nightActions)) {
        const player = game.players.find(p => p.id === userId);

        // Check if player is revived (dead but temporarily brought back by Retributionist)
        const isRevived = (game.revivals || []).some(r => r.revivedId === userId);

        if (!player || (!player.alive && !isRevived)) continue;

        const role = ROLES[player.role];

        // Process based on action type
        switch (action.actionType || role.actionType) {
            case 'heal':
                await processHeal(game, player, action, healers, protections);
                break;
            case 'guard':
                await processGuard(game, player, action, protections);
                break;
            case 'vest':
                await processVest(game, player, protections);
                break;
            case 'mafia_kill':
                await processMafiaKill(game, player, action, attacks);
                break;
            case 'shoot':
                await processShoot(game, player, action, attacks);
                break;
            case 'serial_kill':
                await processSerialKill(game, player, action, attacks);
                break;
            case 'arsonist':
                await processArsonist(game, player, action, attacks);
                break;
            case 'witch':
                await processWitch(game, player, action, controlTargets);
                break;
            case 'jail':
                await processJail(game, player, action, jailedPlayers, protections, attacks);
                break;
            case 'roleblock':
                await processRoleblock(game, player, action, roleblocks);
                break;
            case 'alert':
                await processAlert(game, player, action, alertPlayers, protections);
                break;
            case 'clean':
                await processClean(game, player, action);
                break;
            case 'disguise':
                await processDisguise(game, player, action);
                break;
            case 'remember':
                await processRemember(game, player, action, client);
                break;
            case 'track':
                await processTrack(game, player, action);
                break;
            case 'pollinate':
                await processPollinate(game, player, action);
                break;
            case 'blackmail':
                await processBlackmail(game, player, action);
                break;
            case 'deceive':
                await processDeceive(game, player, action);
                break;
            case 'hypnotize':
                await processHypnotize(game, player, action);
                break;
            case 'pirate_duel':
                await processPirateDuel(game, player, action, client);
                break;
            case 'guardian':
                await processGuardian(game, player, action, protections);
                break;
            case 'spy':
                await processSpy(game, player, action);
                break;
            case 'trap':
                await processTrap(game, player, action);
                break;
            case 'retribution':
                await processRetribution(game, player, action, client);
                break;
            case 'poison':
                await processPoison(game, player, action);
                break;
            case 'gossip':
                await processGossip(game, player, action, client);
                break;
            case 'beekeeper':
                await processBeekeeper(game, player, action);
                break;
            case 'sabotage':
                await processSabotage(game, player, action);
                break;
            case 'mimic':
                await processMimic(game, player, action);
                break;
            case 'gamble':
                await processGamble(game, player, action);
                break;
            case 'doppelganger':
                await processDoppelganger(game, player, action, client);
                break;
            case 'oracle':
                await processOracle(game, player, action, client);
                break;
            case 'librarian':
                await processLibrarian(game, player, action);
                break;
            case 'coroner':
                await processCoroner(game, player, action);
                break;
            case 'transport':
                await processTransport(game, player, action);
                break;
            case 'psychic':
                await processPsychic(game, player, action);
                break;
            case 'silencer':
                await processSilencer(game, player, action);
                break;
            case 'mole':
                await processMole(game, player, action, client);
                break;
            case 'kidnap':
                await processKidnap(game, player, action);
                break;
            case 'yakuza':
                await processYakuza(game, player, action, client);
                break;
            case 'cultist':
                await processCultist(game, player, action, client);
                break;
            case 'wildcard':
                await processWildcard(game, player, action, client);
                break;
        }
    }

    // Process trap results (must happen before roleblocks and attack resolution)
    await processTrapResults(game, client, attacks);

    // Apply roleblocks and jails (cancel actions)
    applyRoleblocks(game, roleblocks, jailedPlayers);

    // Apply witch controls (redirect actions)
    applyWitchControls(game, controlTargets, attacks);

    // Apply transports (swap actions between transported players)
    applyTransports(game, attacks, protections, healers);

    // Process Serial Killer counter-attacks (kills visitors)
    processSerialKillerCounterattacks(game, attacks);

    // Process Veteran counter-attacks (kills all visitors)
    processVeteranCounterattacks(game, alertPlayers, attacks);

    // Resolve attacks vs defenses
    const attackResults = resolveAttacks(game, attacks, protections, healers);

    // Process Bodyguard deaths and counterattacks
    const bodyguardResults = await processBodyguardCounterattacks(game, attackResults, attacks, client);

    // Combine all deaths
    deaths.push(...attackResults);
    deaths.push(...bodyguardResults);

    // Check for Matchmaker deaths (if partner dies, matchmaker dies too)
    const matchmakerDeaths = [];
    for (const death of deaths) {
        const matchmakers = game.players.filter(p =>
            p.alive &&
            p.role === 'MATCHMAKER_BEETLE' &&
            p.linkedPartner === death.victimId
        );

        for (const matchmaker of matchmakers) {
            matchmaker.alive = false;
            matchmakerDeaths.push({
                victimId: matchmaker.id,
                killers: [{
                    killerId: null,
                    attackType: 'matchmaker_link'
                }]
            });
        }
    }
    deaths.push(...matchmakerDeaths);

    // Check for Doppelgänger deaths (if copied target dies, doppelganger dies too)
    const doppelgangerDeaths = [];
    for (const death of deaths) {
        const doppelgangers = game.players.filter(p =>
            p.alive &&
            p.role !== 'DOPPELGANGER' && // After copying, role changes
            p.copiedTarget === death.victimId
        );

        for (const doppelganger of doppelgangers) {
            doppelganger.alive = false;
            doppelgangerDeaths.push({
                victimId: doppelganger.id,
                killers: [{
                    killerId: null,
                    attackType: 'doppelganger_link'
                }]
            });
        }
    }
    deaths.push(...doppelgangerDeaths);

    // Process investigative actions
    await processInvestigations(game, client);

    // Process lookout
    await processLookouts(game, client);

    // Process tracker
    await processTrackers(game, client);

    // Process pollinator
    await processPollinators(game, client);

    // Process spy
    await processSpies(game, client);

    // Process poison deaths
    const poisonDeaths = await processPoisonDeaths(game, client);
    deaths.push(...poisonDeaths);

    // Process beekeeper results
    await processBeekeepers(game, client, attacks);

    // Process gambler results
    await processGamblers(game, client, deaths);

    // Notify gamblers who used coins
    await notifyGamblerCoinUsage(game, client);

    // Process librarian results
    await processLibrarians(game, client);

    // Process coroner results
    await processCoroners(game, client);

    // Process janitor results (notify Janitors of cleaned roles)
    await processJanitors(game, client, deaths);

    // Process disguiser results (notify Disguisers of successful disguises)
    await processDisguisers(game, client);

    // Process psychic results
    await processPsychics(game, client);

    // Update lastRoleblockTarget for Escort Bees (only if their action succeeded)
    for (const result of game.nightResults) {
        if (result.type === 'roleblock') {
            const blocker = game.players.find(p => p.id === result.blockerId);
            if (blocker && blocker.role === 'ESCORT_BEE') {
                blocker.lastRoleblockTarget = result.targetId;
            }
        }
    }

    // Process Killer Wasp succession (if Wasp Queen died)
    await processWaspSuccession(game, deaths, client);

    return deaths;
}

/**
 * Process healing action
 */
async function processHeal(game, healer, action, healers, protections) {
    const targetId = action.target;
    addVisit(game, healer.id, targetId);

    healers.set(targetId, healer.id);

    // Heal provides protection against basic attacks
    const currentProtection = protections.get(targetId) || 0;
    protections.set(targetId, Math.max(currentProtection, 1));

    game.nightResults.push({
        type: 'heal',
        healerId: healer.id,
        targetId: targetId
    });
}

/**
 * Process bodyguard protection
 */
async function processGuard(game, guard, action, protections) {
    const targetId = action.target;
    addVisit(game, guard.id, targetId);

    // Bodyguard provides powerful protection (2)
    const currentProtection = protections.get(targetId) || 0;
    protections.set(targetId, Math.max(currentProtection, 2));

    game.nightResults.push({
        type: 'guard',
        guardId: guard.id,
        targetId: targetId
    });
}

/**
 * Process survivor vesting
 */
async function processVest(game, survivor, protections) {
    if (survivor.vests > 0) {
        survivor.vests--;

        // Vest provides powerful protection (2)
        protections.set(survivor.id, 2);

        game.nightResults.push({
            type: 'vest',
            userId: survivor.id
        });
    }
}

/**
 * Process mafia kill
 */
async function processMafiaKill(game, killer, action, attacks) {
    const targetId = action.target;
    addVisit(game, killer.id, targetId);

    if (!attacks.has(targetId)) {
        attacks.set(targetId, []);
    }

    const role = ROLES[killer.role];
    attacks.get(targetId).push({
        attackerId: killer.id,
        attackLevel: role.attack,
        attackType: 'mafia'
    });
}

/**
 * Process vigilante shoot
 */
async function processShoot(game, shooter, action, attacks) {
    if (shooter.bullets <= 0) return;

    const targetId = action.target;
    shooter.bullets--;

    addVisit(game, shooter.id, targetId);

    if (!attacks.has(targetId)) {
        attacks.set(targetId, []);
    }

    attacks.get(targetId).push({
        attackerId: shooter.id,
        attackLevel: 1, // Basic attack
        attackType: 'vigilante'
    });

    game.nightResults.push({
        type: 'vigilante_shoot',
        shooterId: shooter.id,
        targetId: targetId
    });
}

/**
 * Process serial killer kill
 */
async function processSerialKill(game, sk, action, attacks) {
    const targetId = action.target;
    addVisit(game, sk.id, targetId);

    if (!attacks.has(targetId)) {
        attacks.set(targetId, []);
    }

    attacks.get(targetId).push({
        attackerId: sk.id,
        attackLevel: 1, // Basic attack
        attackType: 'serial_killer'
    });
}

/**
 * Process arsonist douse/ignite
 */
async function processArsonist(game, arsonist, action, attacks) {
    if (action.ignite) {
        // Ignite all doused players
        for (const targetId of game.dousedPlayers) {
            const target = game.players.find(p => p.id === targetId);
            if (target && target.alive) {
                if (!attacks.has(targetId)) {
                    attacks.set(targetId, []);
                }
                attacks.get(targetId).push({
                    attackerId: arsonist.id,
                    attackLevel: 3, // Unstoppable attack
                    attackType: 'arson'
                });
            }
        }
        game.dousedPlayers.clear();

        game.nightResults.push({
            type: 'ignite',
            arsonistId: arsonist.id
        });
    } else {
        // Douse target
        const targetId = action.target;
        addVisit(game, arsonist.id, targetId);
        game.dousedPlayers.add(targetId);

        game.nightResults.push({
            type: 'douse',
            arsonistId: arsonist.id,
            targetId: targetId
        });
    }
}

/**
 * Process witch control
 */
async function processWitch(game, witch, action, controlTargets) {
    const targetId = action.target;
    const newTargetId = action.newTarget;

    addVisit(game, witch.id, targetId);

    controlTargets.set(targetId, newTargetId);

    game.nightResults.push({
        type: 'witch_control',
        witchId: witch.id,
        targetId: targetId,
        newTargetId: newTargetId
    });
}

/**
 * Apply witch controls to redirect actions
 */
function applyWitchControls(game, controlTargets, attacks) {
    // For each controlled player, redirect their action
    for (const [controlledId, newTargetId] of controlTargets.entries()) {
        const action = game.nightActions[controlledId];
        if (action && action.target) {
            action.target = newTargetId;
        }
    }
}

/**
 * Apply transports - swap all actions targeting the transported players
 */
function applyTransports(game, attacks, protections, healers) {
    if (!game.transports || game.transports.length === 0) return;

    for (const transport of game.transports) {
        const { target1, target2 } = transport;

        // Swap attacks
        const attacks1 = attacks.get(target1);
        const attacks2 = attacks.get(target2);
        if (attacks1) attacks.set(target2, attacks1);
        else attacks.delete(target2);
        if (attacks2) attacks.set(target1, attacks2);
        else attacks.delete(target1);

        // Swap protections
        const protection1 = protections.get(target1);
        const protection2 = protections.get(target2);
        if (protection1 !== undefined) protections.set(target2, protection1);
        else protections.delete(target2);
        if (protection2 !== undefined) protections.set(target1, protection2);
        else protections.delete(target1);

        // Swap healers
        const healer1 = healers.get(target1);
        const healer2 = healers.get(target2);
        if (healer1) healers.set(target2, healer1);
        else healers.delete(target2);
        if (healer2) healers.set(target1, healer2);
        else healers.delete(target1);

        // Swap visits
        const visits1 = game.visits[target1] || [];
        const visits2 = game.visits[target2] || [];
        if (visits1.length > 0) game.visits[target2] = visits1;
        else delete game.visits[target2];
        if (visits2.length > 0) game.visits[target1] = visits2;
        else delete game.visits[target1];

        // Redirect any actions targeting these players
        for (const [userId, action] of Object.entries(game.nightActions)) {
            if (action.target === target1) {
                action.target = target2;
            } else if (action.target === target2) {
                action.target = target1;
            }
        }
    }
}

/**
 * Serial Killer kills all visitors
 */
function processSerialKillerCounterattacks(game, attacks) {
    const serialKillers = game.players.filter(p => p.alive && p.role === 'MURDER_HORNET');

    for (const sk of serialKillers) {
        const visitors = getVisitors(game, sk.id);

        for (const visitorId of visitors) {
            if (visitorId === sk.id) continue; // Don't attack self

            if (!attacks.has(visitorId)) {
                attacks.set(visitorId, []);
            }

            attacks.get(visitorId).push({
                attackerId: sk.id,
                attackLevel: 1, // Basic attack
                attackType: 'serial_killer_counter'
            });
        }
    }
}

/**
 * Resolve all attacks against defenses
 * @returns {Array} Array of {victimId, killers: [{killerId, attackType}]}
 */
function resolveAttacks(game, attacks, protections, healers) {
    const deaths = [];

    for (const [targetId, attackArray] of attacks.entries()) {
        const target = game.players.find(p => p.id === targetId);
        if (!target || !target.alive) continue;

        // Get target's natural defense
        const role = ROLES[target.role];
        let defense = role.defense || 0;

        // Add protection from heals/bodyguards
        const protection = protections.get(targetId) || 0;
        defense = Math.max(defense, protection);

        // Check for Beekeeper protection - all Bees are immune to attacks
        const beekeeperProtecting = game.beekeeperProtection && game.beekeeperProtection.active && role.team === 'bee';
        if (beekeeperProtecting) {
            // Store that this Bee was saved by Beekeeper
            if (!game.beekeeperProtection.savedBees) {
                game.beekeeperProtection.savedBees = [];
            }
            game.beekeeperProtection.savedBees.push(targetId);
            continue; // Skip this target - they're protected by Beekeeper
        }

        const killingAttacks = []; // Track all attacks that would kill
        let usedCoin = false;

        // Check each attack
        for (const attack of attackArray) {
            if (attack.attackLevel >= defense) {
                // Check if target is Gambler Beetle with lucky coins (only once)
                if (!usedCoin && target.role === 'GAMBLER_BEETLE' && target.luckyCoins > 0) {
                    // Spend a coin to survive
                    target.luckyCoins--;
                    usedCoin = true;

                    game.nightResults.push({
                        type: 'gambler_coin_used',
                        gamblerId: targetId,
                        coinsRemaining: target.luckyCoins
                    });

                    continue; // Survived this attack
                }

                // Track this killing attack
                killingAttacks.push({
                    killerId: attack.attackerId,
                    attackType: attack.attackType
                });

                // Check for vigilante guilt (killed a bee)
                if (attack.attackType === 'vigilante') {
                    const attacker = game.players.find(p => p.id === attack.attackerId);
                    if (attacker && role.team === 'bee') {
                        // Vigilante dies from guilt next night
                        attacker.guiltyNextNight = true;
                    }
                }
            }
        }

        // If any attacks succeeded, target dies
        if (killingAttacks.length > 0) {
            target.alive = false;

            deaths.push({
                victimId: targetId,
                killers: killingAttacks // Array of all killing attacks
            });
        }
    }

    return deaths;
}

/**
 * Process bodyguard counterattacks
 */
async function processBodyguardCounterattacks(game, attackResults, attacks, client) {
    const deaths = [];

    for (const result of game.nightResults) {
        if (result.type !== 'guard') continue;

        const guardId = result.guardId;
        const targetId = result.targetId;

        // Check if target was attacked
        const targetAttacks = attacks.get(targetId);
        if (!targetAttacks || targetAttacks.length === 0) continue;

        // Bodyguard dies
        const guard = game.players.find(p => p.id === guardId);
        if (guard && guard.alive) {
            guard.alive = false;
            deaths.push({
                victimId: guardId,
                killers: [{
                    killerId: targetAttacks[0].attackerId,
                    attackType: 'bodyguard_sacrifice'
                }]
            });

            // Bodyguard kills one attacker (powerful attack)
            const attackerId = targetAttacks[0].attackerId;
            const attacker = game.players.find(p => p.id === attackerId);
            if (attacker && attacker.alive) {
                const attackerRole = ROLES[attacker.role];
                if (2 >= (attackerRole.defense || 0)) { // Powerful attack (2) vs defense
                    attacker.alive = false;
                    deaths.push({
                        victimId: attackerId,
                        killers: [{
                            killerId: guardId,
                            attackType: 'bodyguard_counter'
                        }]
                    });
                }
            }
        }
    }

    return deaths;
}

/**
 * Process all investigative actions
 */
async function processInvestigations(game, client) {
    for (const [userId, action] of Object.entries(game.nightActions)) {
        const player = game.players.find(p => p.id === userId);
        if (!player || !player.alive) continue;

        const role = ROLES[player.role];

        if (action.actionType === 'investigate_suspicious' || role.actionType === 'investigate_suspicious') {
            await processSheriffInvestigation(game, player, action, client);
        } else if (action.actionType === 'investigate_exact' || role.actionType === 'investigate_exact') {
            await processInvestigatorInvestigation(game, player, action, client);
        } else if (action.actionType === 'consigliere' || role.actionType === 'consigliere') {
            await processConsigliereInvestigation(game, player, action, client);
        }
    }
}

/**
 * Process Sheriff (Queen's Guard) investigation
 */
async function processSheriffInvestigation(game, sheriff, action, client) {
    const targetId = action.target;
    addVisit(game, sheriff.id, targetId);

    const target = game.players.find(p => p.id === targetId);
    if (!target) return;

    // Check for disguise - if disguised, use disguised role instead
    const roleToInvestigate = target.disguisedAs || target.role;
    const targetRole = ROLES[roleToInvestigate];
    let isSuspicious = false;

    // Check if target is framed
    if (game.framedPlayers.has(targetId)) {
        isSuspicious = true;
    } else {
        // Check natural suspicion
        if (targetRole.team === 'wasp' && !targetRole.immuneToDetection) {
            isSuspicious = true;
        } else if (targetRole.team === 'neutral' && (targetRole.subteam === 'killing' || targetRole.subteam === 'evil')) {
            isSuspicious = true;
        }
    }

    try {
        const user = await client.users.fetch(sheriff.id);
        const resultEmbed = createImportantEmbed(
            '👮 INVESTIGATION RESULTS',
            isSuspicious
                ? `🚨 **${target.displayName}** is **SUSPICIOUS!** 🚨\n\nThey could be a Wasp or Evil Neutral!`
                : `✅ **${target.displayName}** is **NOT SUSPICIOUS** ✅\n\nThey appear to be innocent.`,
            isSuspicious ? '#FF0000' : '#00FF00'
        )
            .setFooter({ text: 'Queen\'s Guard Investigation' });

        await user.send({ embeds: [resultEmbed] });
    } catch (error) {
        console.error(`Could not send investigation result to sheriff:`, error);
    }
}

/**
 * Process Investigator (Scout Bee) investigation
 */
async function processInvestigatorInvestigation(game, investigator, action, client) {
    const targetId = action.target;
    addVisit(game, investigator.id, targetId);

    const target = game.players.find(p => p.id === targetId);
    if (!target) return;

    // Check for disguise - if disguised, use disguised role instead
    const roleToInvestigate = target.disguisedAs || target.role;
    const targetRole = ROLES[roleToInvestigate];

    try {
        const user = await client.users.fetch(investigator.id);
        const resultEmbed = createImportantEmbed(
            '🔍 SCOUT INVESTIGATION',
            `🎯 **${target.displayName}** is a **${targetRole.name}**! ${targetRole.emoji}\n\n**Team:** ${targetRole.team === 'bee' ? '🐝 Bee' : targetRole.team === 'wasp' ? '🐝 Wasp' : '⚪ Neutral'}`,
            '#0099FF'
        )
            .setFooter({ text: 'Scout Bee - Exact Role Investigation' });

        await user.send({ embeds: [resultEmbed] });
    } catch (error) {
        console.error(`Could not send investigation result to investigator:`, error);
    }
}

/**
 * Process Consigliere (Spy Wasp) investigation
 */
async function processConsigliereInvestigation(game, consigliere, action, client) {
    const targetId = action.target;
    addVisit(game, consigliere.id, targetId);

    const target = game.players.find(p => p.id === targetId);
    if (!target) return;

    // Check for disguise - if disguised, use disguised role instead
    const roleToInvestigate = target.disguisedAs || target.role;
    const targetRole = ROLES[roleToInvestigate];

    try {
        const user = await client.users.fetch(consigliere.id);
        const resultEmbed = new EmbedBuilder()
            .setColor('#8B0000')
            .setTitle('🕵️ Spy Report')
            .setDescription(`**${target.displayName}** is a **${targetRole.name}**! ${targetRole.emoji}`)
            .setTimestamp();

        await user.send({ embeds: [resultEmbed] });
    } catch (error) {
        console.error(`Could not send investigation result to consigliere:`, error);
    }
}

/**
 * Process lookout results
 */
async function processLookouts(game, client) {
    for (const [userId, action] of Object.entries(game.nightActions)) {
        const player = game.players.find(p => p.id === userId);
        if (!player || !player.alive) continue;

        const role = ROLES[player.role];

        if (action.actionType === 'lookout' || role.actionType === 'lookout') {
            const targetId = action.target;
            addVisit(game, userId, targetId);

            const visitors = getVisitors(game, targetId).filter(v => v !== userId);
            const target = game.players.find(p => p.id === targetId);

            let visitorsText = 'No one visited them.';
            if (visitors.length > 0) {
                const visitorNames = visitors.map(vid => {
                    const visitor = game.players.find(p => p.id === vid);
                    return visitor ? visitor.displayName : 'Unknown';
                });
                visitorsText = visitorNames.join(', ');
            }

            try {
                const user = await client.users.fetch(userId);
                const hasVisitors = visitors.length > 0;
                const resultEmbed = createImportantEmbed(
                    '👁️ LOOKOUT REPORT',
                    `You watched **${target.displayName}** last night.`,
                    hasVisitors ? '#FFD700' : '#808080'
                )
                    .addFields({
                        name: hasVisitors ? '👥 Visitors Detected!' : '👥 No Visitors',
                        value: `>>> ${visitorsText}`,
                        inline: false
                    })
                    .setFooter({ text: 'Lookout Bee - Surveillance Report' });

                await user.send({ embeds: [resultEmbed] });
            } catch (error) {
                console.error(`Could not send lookout result:`, error);
            }
        }
    }
}

/**
 * Process jail action
 */
async function processJail(game, jailer, action, jailedPlayers, protections, attacks) {
    const targetId = action.target;
    const execute = action.execute || false;

    // Jail the target (protects them and prevents their action)
    jailedPlayers.add(targetId);

    // Jailed players get invincible protection
    protections.set(targetId, 3);

    if (execute) {
        if (jailer.executions > 0) {
            jailer.executions--;

            // Execute with unstoppable attack
            if (!attacks.has(targetId)) {
                attacks.set(targetId, []);
            }
            attacks.get(targetId).push({
                attackerId: jailer.id,
                attackLevel: 3, // Unstoppable
                attackType: 'jail_execute'
            });

            // Check if target is a bee - lose all executions
            const target = game.players.find(p => p.id === targetId);
            if (target && ROLES[target.role].team === 'bee') {
                jailer.executions = 0;
            }
        }
    }

    game.nightResults.push({
        type: 'jail',
        jailerId: jailer.id,
        targetId: targetId,
        execute: execute
    });
}

/**
 * Process roleblock action
 */
async function processRoleblock(game, blocker, action, roleblocks) {
    const targetId = action.target;

    // Record visit (roleblocking is a visiting action)
    addVisit(game, blocker.id, targetId);

    // Record roleblock
    roleblocks.set(targetId, blocker.id);

    game.nightResults.push({
        type: 'roleblock',
        blockerId: blocker.id,
        targetId: targetId
    });
}

/**
 * Process seance (Medium) - NO LONGER USED
 * Medium Bee now has access to all dead players via dead chat (see mafiaHandler.js)
 */
// async function processSeance(game, medium, action, client) {
//     const targetId = action.target;
//     const target = game.players.find(p => p.id === targetId);
//
//     if (!target || target.alive) return;
//
//     const targetRole = ROLES[target.role];
//
//     // Store active seance connection
//     if (!game.activeSeances) {
//         game.activeSeances = [];
//     }
//
//     game.activeSeances.push({
//         mediumId: medium.id,
//         mediumName: medium.displayName,
//         deadId: target.id,
//         deadName: target.displayName,
//         deadRole: targetRole.name,
//         deadEmoji: targetRole.emoji
//     });
//
//     try {
//         // Notify Medium
//         const mediumUser = await client.users.fetch(medium.id);
//         const mediumEmbed = new EmbedBuilder()
//             .setColor('#9B59B6')
//             .setTitle('👻 Seance Connection Established')
//             .setDescription(`You have connected with **${target.displayName}** from beyond the grave.\n\n**Their Role:** ${targetRole.name} ${targetRole.emoji}\n\n💬 You can now send messages to them! Just type your message and send it to me. They can respond back.`)
//             .setFooter({ text: 'Connection will end when the night ends.' })
//             .setTimestamp();
//
//         await mediumUser.send({ embeds: [mediumEmbed] });
//
//         // Notify dead player
//         const deadUser = await client.users.fetch(target.id);
//         const deadEmbed = new EmbedBuilder()
//             .setColor('#9B59B6')
//             .setTitle('👻 A Medium Has Contacted You!')
//             .setDescription(`**${medium.displayName}** the Medium Bee has connected with you from the living world!\n\n💬 You can send messages back! Just type your message and send it to me. They will receive it.`)
//             .setFooter({ text: 'Connection will end when the night ends.' })
//             .setTimestamp();
//
//         await deadUser.send({ embeds: [deadEmbed] });
//     } catch (error) {
//         console.error(`Could not send seance notifications:`, error);
//     }
// }

/**
 * Process veteran alert
 */
async function processAlert(game, veteran, action, alertPlayers, protections) {
    if (veteran.alerts <= 0) return;

    veteran.alerts--;
    alertPlayers.add(veteran.id);

    // Veteran gets powerful defense while on alert
    protections.set(veteran.id, 2);

    game.nightResults.push({
        type: 'alert',
        veteranId: veteran.id
    });
}

/**
 * Process janitor clean
 */
async function processClean(game, janitor, action) {
    const targetId = action.target;

    if (janitor.cleans <= 0) return;

    // Mark for cleaning (will be processed after deaths)
    if (!game.cleanedPlayers) {
        game.cleanedPlayers = new Set();
    }
    game.cleanedPlayers.add(targetId);
    janitor.cleans--;

    game.nightResults.push({
        type: 'clean',
        janitorId: janitor.id,
        targetId: targetId
    });
}

/**
 * Process disguiser
 */
async function processDisguise(game, disguiser, action) {
    const targetId = action.target;
    const target = game.players.find(p => p.id === targetId);

    if (!target || target.alive) return;
    if (disguiser.disguises <= 0) return;

    disguiser.disguises--;
    disguiser.disguisedAs = target.role;

    game.nightResults.push({
        type: 'disguise',
        disguiserId: disguiser.id,
        targetId: targetId,
        newRole: target.role
    });
}

/**
 * Process amnesiac remember
 */
async function processRemember(game, amnesiac, action, client) {
    const targetId = action.target;
    const target = game.players.find(p => p.id === targetId);

    if (!target || target.alive) return;
    if (amnesiac.hasRemembered) return;

    // Remember the role
    const oldRole = amnesiac.role;
    amnesiac.role = target.role;
    amnesiac.hasRemembered = true;

    // Initialize new role data
    const roleInfo = ROLES[target.role];
    if (roleInfo.bullets !== undefined) amnesiac.bullets = roleInfo.bullets;
    if (roleInfo.vests !== undefined) amnesiac.vests = roleInfo.vests;
    if (roleInfo.executions !== undefined) amnesiac.executions = roleInfo.executions;
    if (roleInfo.alerts !== undefined) amnesiac.alerts = roleInfo.alerts;

    game.nightResults.push({
        type: 'remember',
        amnesiacId: amnesiac.id,
        oldRole: oldRole,
        newRole: target.role
    });

    // Notify the amnesiac
    try {
        const user = await client.users.fetch(amnesiac.id);
        const resultEmbed = new EmbedBuilder()
            .setColor('#FF69B4')
            .setTitle('🪲 You Remembered!')
            .setDescription(`You have remembered that you are a **${roleInfo.name}**! ${roleInfo.emoji}\n\n${roleInfo.description}`)
            .addFields(
                { name: 'Abilities', value: roleInfo.abilities.join('\n'), inline: false },
                { name: 'Win Condition', value: roleInfo.winCondition, inline: false }
            )
            .setTimestamp();

        await user.send({ embeds: [resultEmbed] });
    } catch (error) {
        console.error(`Could not send remember result to amnesiac:`, error);
    }
}

/**
 * Apply roleblocks - cancel actions of roleblocked/jailed players
 */
function applyRoleblocks(game, roleblocks, jailedPlayers) {
    // Add pirate duel targets to roleblock list
    if (game.pirateDuels && game.pirateDuels.length > 0) {
        for (const duel of game.pirateDuels) {
            // Pirate targets are roleblocked
            roleblocks.set(duel.targetId, duel.pirateId);
        }
    }

    for (const [userId, action] of Object.entries(game.nightActions)) {
        const player = game.players.find(p => p.id === userId);
        if (!player) continue;

        const role = ROLES[player.role];

        // Check if roleblocked or jailed
        const isRoleblocked = roleblocks.has(userId);
        const isJailed = jailedPlayers.has(userId);

        // Veteran on alert cannot be roleblocked
        if (action.actionType === 'alert' && isRoleblocked) {
            continue;
        }

        // Cancel action if roleblocked or jailed
        if (isRoleblocked || isJailed) {
            delete game.nightActions[userId];
        }
    }
}

/**
 * Process Veteran counter-attacks
 */
function processVeteranCounterattacks(game, alertPlayers, attacks) {
    for (const veteranId of alertPlayers) {
        const visitors = getVisitors(game, veteranId);

        for (const visitorId of visitors) {
            if (visitorId === veteranId) continue;

            if (!attacks.has(visitorId)) {
                attacks.set(visitorId, []);
            }

            attacks.get(visitorId).push({
                attackerId: veteranId,
                attackLevel: 2, // Powerful attack
                attackType: 'veteran_counter'
            });
        }
    }
}

/**
 * Process tracker action - records who the target visits
 */
async function processTrack(game, tracker, action) {
    const targetId = action.target;
    addVisit(game, tracker.id, targetId);

    game.nightResults.push({
        type: 'track',
        trackerId: tracker.id,
        targetId: targetId
    });
}

/**
 * Process tracker results
 */
async function processTrackers(game, client) {
    for (const [userId, action] of Object.entries(game.nightActions)) {
        const player = game.players.find(p => p.id === userId);
        if (!player || !player.alive) continue;

        const role = ROLES[player.role];

        if (action.actionType === 'track' || role.actionType === 'track') {
            const targetId = action.target;
            const target = game.players.find(p => p.id === targetId);

            // Find who the target visited
            const targetAction = game.nightActions[targetId];
            let visitedText = 'They did not visit anyone.';

            if (targetAction && targetAction.target) {
                const visited = game.players.find(p => p.id === targetAction.target);
                if (visited) {
                    visitedText = `They visited **${visited.displayName}**.`;
                }
            }

            try {
                const user = await client.users.fetch(userId);
                const didVisit = targetAction && targetAction.target;
                const resultEmbed = createImportantEmbed(
                    '🗺️ TRACKER REPORT',
                    `You tracked **${target.displayName}** last night.`,
                    didVisit ? '#FFA500' : '#808080'
                )
                    .addFields({
                        name: didVisit ? '📍 Movement Detected!' : '📍 No Movement',
                        value: `>>> ${visitedText}`,
                        inline: false
                    })
                    .setFooter({ text: 'Tracker Bee - Movement Report' });

                await user.send({ embeds: [resultEmbed] });
            } catch (error) {
                console.error(`Could not send tracker result:`, error);
            }
        }
    }
}

/**
 * Process pollinate action - stores the action for delayed results
 */
async function processPollinate(game, pollinator, action) {
    const targetId = action.target;
    addVisit(game, pollinator.id, targetId);

    // Initialize pollination history if not exists
    if (!game.pollinationHistory) {
        game.pollinationHistory = [];
    }

    // Store this pollination with the current night number
    game.pollinationHistory.push({
        pollinatorId: pollinator.id,
        targetId: targetId,
        night: game.nightNumber
    });

    game.nightResults.push({
        type: 'pollinate',
        pollinatorId: pollinator.id,
        targetId: targetId
    });
}

/**
 * Process pollinator results - send results from 2 nights ago
 */
async function processPollinators(game, client) {
    if (!game.pollinationHistory || !game.nightHistory) return;

    const currentNight = game.nightNumber;

    // Find pollinations from 2 nights ago
    for (const pollination of game.pollinationHistory) {
        if (pollination.night === currentNight - 2) { // Fixed: was -1, should be -2
            const pollinator = game.players.find(p => p.id === pollination.pollinatorId);
            const target = game.players.find(p => p.id === pollination.targetId);

            if (!pollinator || !pollinator.alive) continue;

            // Get historical data from that night
            const historicalNight = game.nightHistory.find(h => h.night === pollination.night);
            if (!historicalNight) continue;

            // Get visitors to the target from THAT night (not current night)
            const visitors = historicalNight.visits[pollination.targetId] || [];

            // Get who the target visited on THAT night (not current night)
            const targetAction = historicalNight.nightActions[pollination.targetId];

            let visitorsText = 'No one visited them.';
            if (visitors.length > 0) {
                const visitorNames = visitors.map(vid => {
                    const visitor = game.players.find(p => p.id === vid);
                    return visitor ? visitor.displayName : 'Unknown';
                });
                visitorsText = visitorNames.join(', ');
            }

            let visitedText = 'They did not visit anyone.';
            if (targetAction && targetAction.target) {
                const visited = game.players.find(p => p.id === targetAction.target);
                if (visited) {
                    visitedText = visited.displayName;
                }
            }

            try {
                const user = await client.users.fetch(pollination.pollinatorId);
                const resultEmbed = new EmbedBuilder()
                    .setColor('#FF69B4')
                    .setTitle('🌸 Pollination Results')
                    .setDescription(`Your pollination of **${target.displayName}** from 2 nights ago has bloomed!`)
                    .addFields(
                        { name: 'Visitors to Target', value: visitorsText, inline: false },
                        { name: 'Target Visited', value: visitedText, inline: false }
                    )
                    .setTimestamp();

                await user.send({ embeds: [resultEmbed] });
            } catch (error) {
                console.error(`Could not send pollinator result:`, error);
            }
        }
    }
}

/**
 * Process blackmail action
 */
async function processBlackmail(game, blackmailer, action) {
    const targetId = action.target;
    addVisit(game, blackmailer.id, targetId);

    // Initialize blackmailed players set if not exists
    if (!game.blackmailedPlayers) {
        game.blackmailedPlayers = new Set();
    }

    game.blackmailedPlayers.add(targetId);

    game.nightResults.push({
        type: 'blackmail',
        blackmailerId: blackmailer.id,
        targetId: targetId
    });
}

/**
 * Process deceive action (Deceiver Wasp) - twists messages during next day
 */
async function processDeceive(game, deceiver, action) {
    const targetId = action.target;
    addVisit(game, deceiver.id, targetId);

    // Initialize deceived players set if not exists
    if (!game.deceivedPlayers) {
        game.deceivedPlayers = new Set();
    }

    game.deceivedPlayers.add(targetId);

    game.nightResults.push({
        type: 'deceive',
        deceiverId: deceiver.id,
        targetId: targetId
    });
}

/**
 * Process hypnotize action
 */
async function processHypnotize(game, hypnotist, action) {
    const targetId = action.target;
    const fakeMessage = action.fakeMessage || 'You were roleblocked!';

    addVisit(game, hypnotist.id, targetId);

    // Initialize hypnotized players map if not exists
    if (!game.hypnotizedPlayers) {
        game.hypnotizedPlayers = new Map();
    }

    game.hypnotizedPlayers.set(targetId, fakeMessage);

    game.nightResults.push({
        type: 'hypnotize',
        hypnotistId: hypnotist.id,
        targetId: targetId,
        fakeMessage: fakeMessage
    });
}

/**
 * Process pirate duel action - now handled via game.pirateDuels at dawn
 * This function is called during night processing to handle roleblocking
 */
async function processPirateDuel(game, pirate, action, client) {
    // Pirate duels are now resolved at dawn, not during night processing
    // The duel data is stored in game.pirateDuels and processed separately
    // This function is kept for compatibility but does minimal work

    // Just mark that pirate duel is in progress (actual processing happens at dawn)
    game.nightResults.push({
        type: 'pirate_duel_processing',
        pirateId: pirate.id,
        note: 'Duel results will be revealed at dawn'
    });
}

/**
 * Process guardian protection
 */
async function processGuardian(game, guardian, action, protections) {
    // First night - choose target
    if (!guardian.guardianTarget) {
        guardian.guardianTarget = action.target;

        game.nightResults.push({
            type: 'guardian_select',
            guardianId: guardian.id,
            targetId: action.target
        });
        return;
    }

    // Every night - protect the guardian's target
    const targetId = guardian.guardianTarget;

    // Guardian provides invincible protection to their target
    const currentProtection = protections.get(targetId) || 0;
    protections.set(targetId, Math.max(currentProtection, 3));

    game.nightResults.push({
        type: 'guardian_protect',
        guardianId: guardian.id,
        targetId: targetId
    });
}

/**
 * Process spy action - records action for later processing
 */
async function processSpy(game, spy, action) {
    // Spy doesn't visit anyone, just observes
    game.nightResults.push({
        type: 'spy',
        spyId: spy.id
    });
}

/**
 * Process spy results - show all Wasp visits
 */
async function processSpies(game, client) {
    const spies = game.players.filter(p => p.alive && p.role === 'SPY_BEE');

    for (const spy of spies) {
        // Find all Wasp visits
        const waspVisits = [];
        const wasps = game.players.filter(p => ROLES[p.role].team === 'wasp' && p.alive);

        for (const wasp of wasps) {
            const action = game.nightActions[wasp.id];
            if (action && action.target) {
                const target = game.players.find(p => p.id === action.target);
                if (target) {
                    waspVisits.push({
                        wasp: wasp.displayName,
                        target: target.displayName
                    });
                }
            }
        }

        try {
            const user = await client.users.fetch(spy.id);
            const resultEmbed = new EmbedBuilder()
                .setColor('#4B0082')
                .setTitle('🕵️ Spy Report')
                .setDescription('You have observed the Wasp activities tonight.')
                .setTimestamp();

            if (waspVisits.length > 0) {
                const visitsText = waspVisits.map(v => `• **${v.wasp}** visited **${v.target}**`).join('\n');
                resultEmbed.addFields({
                    name: 'Wasp Visits',
                    value: visitsText,
                    inline: false
                });
            } else {
                resultEmbed.addFields({
                    name: 'Wasp Visits',
                    value: 'No Wasp visits detected tonight.',
                    inline: false
                });
            }

            await user.send({ embeds: [resultEmbed] });
        } catch (error) {
            console.error(`Could not send spy result:`, error);
        }
    }
}

/**
 * Process trap action
 */
async function processTrap(game, trapper, action) {
    const targetId = action.target;
    addVisit(game, trapper.id, targetId);

    // Initialize traps map if not exists
    if (!game.traps) {
        game.traps = new Map();
    }

    game.traps.set(targetId, trapper.id);

    game.nightResults.push({
        type: 'trap',
        trapperId: trapper.id,
        targetId: targetId
    });
}

/**
 * Process trap results - catch and roleblock attackers
 */
async function processTrapResults(game, client, attacks) {
    if (!game.traps) return;

    for (const [targetId, trapperId] of game.traps.entries()) {
        const trapper = game.players.find(p => p.id === trapperId);
        if (!trapper || !trapper.alive) continue;

        const visitors = getVisitors(game, targetId);
        const attackers = [];

        // Check each visitor to see if they have an attack
        for (const visitorId of visitors) {
            if (visitorId === trapperId) continue; // Don't trap yourself

            const visitor = game.players.find(p => p.id === visitorId);
            if (!visitor) continue;

            const visitorRole = ROLES[visitor.role];
            const visitorAction = game.nightActions[visitorId];

            // Check if visitor has attack capabilities
            if (visitorRole.attack > 0 && visitorAction && visitorAction.target === targetId) {
                attackers.push(visitor);

                // Roleblock the attacker
                delete game.nightActions[visitorId];

                // Remove their attack from the attacks map
                if (attacks.has(targetId)) {
                    const targetAttacks = attacks.get(targetId);
                    const newAttacks = targetAttacks.filter(a => a.attackerId !== visitorId);
                    if (newAttacks.length > 0) {
                        attacks.set(targetId, newAttacks);
                    } else {
                        attacks.delete(targetId);
                    }
                }
            }
        }

        // Notify trapper of caught attackers
        try {
            const user = await client.users.fetch(trapperId);
            const target = game.players.find(p => p.id === targetId);

            const resultEmbed = new EmbedBuilder()
                .setColor('#8B4513')
                .setTitle('🪤 Trap Results')
                .setDescription(`You set a trap at **${target.displayName}'s** house.`)
                .setTimestamp();

            if (attackers.length > 0) {
                const attackerNames = attackers.map(a => `• **${a.displayName}**`).join('\n');
                resultEmbed.addFields({
                    name: 'Attackers Caught!',
                    value: attackerNames + '\n\nThey have been roleblocked!',
                    inline: false
                });
            } else {
                resultEmbed.addFields({
                    name: 'Result',
                    value: 'No attackers visited your trap.',
                    inline: false
                });
            }

            await user.send({ embeds: [resultEmbed] });
        } catch (error) {
            console.error(`Could not send trap result:`, error);
        }
    }

    // Clear traps for next night
    game.traps.clear();
}

/**
 * Process retribution action
 */
async function processRetribution(game, retributionist, action, client) {
    if (retributionist.hasRevived) {
        return;
    }

    const targetId = action.target;
    const target = game.players.find(p => p.id === targetId);

    if (!target || target.alive) return;

    const targetRole = ROLES[target.role];
    if (targetRole.team !== 'bee') return;

    retributionist.hasRevived = true;

    // Store the revival for processing
    if (!game.revivals) {
        game.revivals = [];
    }

    game.revivals.push({
        retributionistId: retributionist.id,
        revivedId: targetId,
        revivedRole: target.role
    });

    game.nightResults.push({
        type: 'retribution',
        retributionistId: retributionist.id,
        revivedId: targetId
    });

    try {
        const user = await client.users.fetch(retributionist.id);
        await user.send(`⚰️ You have revived **${target.displayName}** (${targetRole.name}) for one night! They will perform their action tonight.`);

        // Notify the revived player with their role details
        const revivedUser = await client.users.fetch(targetId);

        const { EmbedBuilder } = require('discord.js');
        const revivalEmbed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle(`⚰️ You Have Been Revived!`)
            .setDescription(`The Retributionist Bee has brought you back for one night!\n\n**Your Role:** ${targetRole.name} ${targetRole.emoji}\n**Abilities:** ${targetRole.abilities.map(a => `• ${a}`).join('\n')}\n\nYou can perform your night action! A prompt will follow.`)
            .setFooter({ text: 'Use your ability wisely - you only have one night!' })
            .setTimestamp();

        await revivedUser.send({ embeds: [revivalEmbed] });

        // Now we need to send them a proper night action prompt
        // This is a simplified version - ideally we'd call the full prompt logic
        const alivePlayers = game.players.filter(p => p.alive);

        if (targetRole.nightAction && targetRole.actionType) {
            let promptText = '';
            let targets = alivePlayers;

            // Filter targets based on action type
            if (['investigate_suspicious', 'investigate_exact', 'consigliere', 'lookout', 'track', 'roleblock', 'shoot', 'serial_kill'].includes(targetRole.actionType)) {
                targets = alivePlayers.filter(p => p.id !== targetId);
            } else if (['frame', 'clean', 'disguise'].includes(targetRole.actionType)) {
                targets = alivePlayers.filter(p => p.id !== targetId && ROLES[p.role].team !== 'wasp');
            }

            const targetsList = targets.map((p, i) => `${i + 1}. ${p.displayName}`).join('\n');

            promptText = `Choose your target by sending me the **number**.\n\n${targetsList}`;

            const actionEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`${targetRole.emoji} Night Action - ${targetRole.name}`)
                .setDescription(promptText)
                .setFooter({ text: 'Send the number of your target' });

            await revivedUser.send({ embeds: [actionEmbed] });
        }
    } catch (error) {
        console.error(`Could not send retribution notifications:`, error);
    }
}

/**
 * Process poison action
 */
async function processPoison(game, poisoner, action) {
    const targetId = action.target;
    addVisit(game, poisoner.id, targetId);

    // Initialize poisoned players map if not exists
    if (!game.poisonedPlayers) {
        game.poisonedPlayers = new Map();
    }

    // Poison lasts 2 nights
    game.poisonedPlayers.set(targetId, {
        poisonerId: poisoner.id,
        nightPoisoned: game.nightNumber,
        deathNight: game.nightNumber + 2
    });

    game.nightResults.push({
        type: 'poison',
        poisonerId: poisoner.id,
        targetId: targetId
    });
}

/**
 * Process poison deaths - kills players who were poisoned 2 nights ago
 */
async function processPoisonDeaths(game, client) {
    if (!game.poisonedPlayers) return [];

    const deaths = [];
    const currentNight = game.nightNumber;

    for (const [targetId, poisonInfo] of game.poisonedPlayers.entries()) {
        if (poisonInfo.deathNight === currentNight) {
            const target = game.players.find(p => p.id === targetId);
            if (target && target.alive) {
                target.alive = false;
                deaths.push({
                    victimId: targetId,
                    killers: [{
                        killerId: poisonInfo.poisonerId,
                        attackType: 'poison'
                    }]
                });

                // Notify victim
                try {
                    const user = await client.users.fetch(targetId);
                    await user.send('💀 You have died from poison!');
                } catch (error) {
                    console.error(`Could not notify poisoned victim:`, error);
                }
            }

            // Remove from poisoned list
            game.poisonedPlayers.delete(targetId);
        }
    }

    return deaths;
}

/**
 * Process gossip action - send anonymous message
 */
async function processGossip(game, gossiper, action, client) {
    const targetId = action.target;
    const message = action.message || 'Someone is spreading rumors about you...';

    try {
        const user = await client.users.fetch(targetId);
        const embed = new EmbedBuilder()
            .setColor('#FF1493')
            .setTitle('🗣️ Anonymous Gossip')
            .setDescription(message)
            .setFooter({ text: 'Someone has sent you this message anonymously.' })
            .setTimestamp();

        await user.send({ embeds: [embed] });
    } catch (error) {
        console.error(`Could not send gossip message:`, error);
    }

    game.nightResults.push({
        type: 'gossip',
        gossiperId: gossiper.id,
        targetId: targetId,
        message: message
    });
}

/**
 * Process beekeeper action
 */
async function processBeekeeper(game, beekeeper, action) {
    // If Beekeeper chooses protect, all Bees are protected tonight
    if (action.choice === 'protect') {
        game.beekeeperProtection = {
            beekeeperId: beekeeper.id,
            active: true
        };
    }

    game.nightResults.push({
        type: 'beekeeper',
        beekeeperId: beekeeper.id,
        actionChoice: action.choice // 'protect' or 'inspect'
    });
}

/**
 * Process beekeeper results
 */
async function processBeekeepers(game, client, attacks) {
    for (const result of game.nightResults.filter(r => r.type === 'beekeeper')) {
        const beekeeper = game.players.find(p => p.id === result.beekeeperId);
        if (!beekeeper || !beekeeper.alive) continue;

        try {
            const user = await client.users.fetch(result.beekeeperId);
            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🍯 Beekeeper Report')
                .setTimestamp();

            if (result.actionChoice === 'protect') {
                // Check which Bees were saved by protection
                const savedBees = game.beekeeperProtection?.savedBees || [];

                let resultText = 'You protected all Bees tonight.\n\n';
                if (savedBees.length > 0) {
                    const savedNames = savedBees.map(id => {
                        const saved = game.players.find(p => p.id === id);
                        return saved ? saved.displayName : 'Unknown';
                    });
                    resultText += `**Result:** You saved **${savedNames.length}** Bee${savedNames.length === 1 ? '' : 's'} from death!\n\n• ${savedNames.join('\n• ')}`;
                } else {
                    resultText += '**Result:** No Bees were attacked tonight.';
                }

                embed.setDescription(resultText);
                beekeeper.hasProtected = true;
            } else if (result.actionChoice === 'inspect') {
                // Count Wasps alive
                const waspsAlive = game.players.filter(p => p.alive && ROLES[p.role].team === 'wasp').length;
                embed.setDescription(`You inspected the honey stores tonight.\n\n**Result:** There ${waspsAlive === 1 ? 'is' : 'are'} **${waspsAlive}** Wasp${waspsAlive === 1 ? '' : 's'} alive.`);
            }

            await user.send({ embeds: [embed] });
        } catch (error) {
            console.error(`Could not send beekeeper result:`, error);
        }
    }
}

/**
 * Process sabotage action
 */
async function processSabotage(game, saboteur, action) {
    const targetId = action.target;
    addVisit(game, saboteur.id, targetId);

    // Initialize sabotaged players set
    if (!game.sabotagedPlayers) {
        game.sabotagedPlayers = new Set();
    }

    game.sabotagedPlayers.add(targetId);

    game.nightResults.push({
        type: 'sabotage',
        saboteurId: saboteur.id,
        targetId: targetId
    });
}

/**
 * Process mimic action
 */
async function processMimic(game, mimic, action) {
    if (mimic.mimics <= 0) return;

    const roleChoice = action.roleChoice; // e.g., 'SCOUT_BEE'

    mimic.mimics--;
    mimic.mimickedRole = roleChoice;

    game.nightResults.push({
        type: 'mimic',
        mimicId: mimic.id,
        mimickedRole: roleChoice
    });
}

/**
 * Process gamble action
 */
async function processGamble(game, gambler, action) {
    const targetId = action.target;

    if (!game.gamblerBets) {
        game.gamblerBets = new Map();
    }

    game.gamblerBets.set(gambler.id, targetId);

    game.nightResults.push({
        type: 'gamble',
        gamblerId: gambler.id,
        targetId: targetId
    });
}

/**
 * Process gambler results
 */
async function processGamblers(game, client, deaths) {
    if (!game.gamblerBets) return;

    for (const [gamblerId, betTargetId] of game.gamblerBets.entries()) {
        const gambler = game.players.find(p => p.id === gamblerId);
        if (!gambler || !gambler.alive) continue;

        // Check if bet target died
        const targetDied = deaths.some(d => d.victimId === betTargetId);

        if (targetDied) {
            gambler.luckyCoins = (gambler.luckyCoins || 0) + 1;
        }

        try {
            const user = await client.users.fetch(gamblerId);
            const target = game.players.find(p => p.id === betTargetId);

            const embed = new EmbedBuilder()
                .setColor(targetDied ? '#00FF00' : '#FF0000')
                .setTitle('🎰 Gambler Results')
                .setDescription(`You bet on **${target.displayName}** dying tonight.`)
                .addFields(
                    { name: 'Result', value: targetDied ? '**They died!** You won a lucky coin! 🪙' : 'They survived. No coin.', inline: false },
                    { name: 'Lucky Coins', value: `${gambler.luckyCoins || 0}/3`, inline: false }
                )
                .setTimestamp();

            await user.send({ embeds: [embed] });

            // Check if won
            if (gambler.luckyCoins >= 3) {
                const winEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🎰 JACKPOT!')
                    .setDescription('You have collected 3 lucky coins! You have won the game! 🎉')
                    .setTimestamp();

                await user.send({ embeds: [winEmbed] });
            }
        } catch (error) {
            console.error(`Could not send gambler result:`, error);
        }
    }

    game.gamblerBets.clear();
}

/**
 * Process doppelganger action
 */
async function processDoppelganger(game, doppelganger, action, client) {
    if (doppelganger.hasCopied) return;

    const targetId = action.target;
    const target = game.players.find(p => p.id === targetId);
    if (!target) return;

    // Copy their role
    const oldRole = doppelganger.role;
    doppelganger.role = target.role;
    doppelganger.hasCopied = true;
    doppelganger.copiedTarget = targetId;

    // Copy role-specific properties
    const targetRole = ROLES[target.role];
    if (targetRole.bullets !== undefined) doppelganger.bullets = targetRole.bullets;
    if (targetRole.vests !== undefined) doppelganger.vests = targetRole.vests;
    if (targetRole.executions !== undefined) doppelganger.executions = targetRole.executions;
    if (targetRole.alerts !== undefined) doppelganger.alerts = targetRole.alerts;
    if (targetRole.cleans !== undefined) doppelganger.cleans = targetRole.cleans;
    if (targetRole.disguises !== undefined) doppelganger.disguises = targetRole.disguises;
    if (targetRole.mimics !== undefined) doppelganger.mimics = targetRole.mimics;

    game.nightResults.push({
        type: 'doppelganger',
        doppelgangerId: doppelganger.id,
        targetId: targetId,
        newRole: target.role
    });

    // Notify doppelganger
    try {
        const user = await client.users.fetch(doppelganger.id);
        const embed = new EmbedBuilder()
            .setColor('#9370DB')
            .setTitle('🎭 Transformation Complete!')
            .setDescription(`You have become a **${targetRole.name}**! ${targetRole.emoji}\n\n${targetRole.description}`)
            .addFields(
                { name: 'Abilities', value: targetRole.abilities.join('\n'), inline: false },
                { name: 'Win Condition', value: targetRole.winCondition, inline: false },
                { name: 'Team', value: targetRole.team === 'bee' ? 'Bee Team' : targetRole.team === 'wasp' ? 'Wasp Team' : 'Neutral', inline: true }
            )
            .setFooter({ text: `If ${target.displayName} dies, you die too!` })
            .setTimestamp();

        await user.send({ embeds: [embed] });
    } catch (error) {
        console.error(`Could not send doppelganger result:`, error);
    }
}

/**
 * Process oracle action - receives automatic hints
 */
async function processOracle(game, oracle, action, client) {
    // Generate cryptic hint
    const hints = generateOracleHints(game, oracle);
    const randomHint = hints[Math.floor(Math.random() * hints.length)];

    try {
        const user = await client.users.fetch(oracle.id);
        const embed = new EmbedBuilder()
            .setColor('#8A2BE2')
            .setTitle('🔮 Oracle Vision')
            .setDescription(`*The spirits whisper to you...*\n\n"${randomHint}"`)
            .setTimestamp();

        await user.send({ embeds: [embed] });
    } catch (error) {
        console.error(`Could not send oracle hint:`, error);
    }

    game.nightResults.push({
        type: 'oracle',
        oracleId: oracle.id,
        hint: randomHint
    });
}

/**
 * Generate oracle hints based on game state
 */
function generateOracleHints(game, oracle) {
    const hints = [];
    const wasps = game.players.filter(p => p.alive && ROLES[p.role].team === 'wasp');
    const bees = game.players.filter(p => p.alive && ROLES[p.role].team === 'bee');
    const neutrals = game.players.filter(p => p.alive && ROLES[p.role].team === 'neutral');

    // Team count hints
    hints.push(`${wasps.length} ${wasps.length === 1 ? 'shadow lurks' : 'shadows lurk'} among the hive`);
    hints.push(`The innocent number ${bees.length}`);

    // Death prediction hints
    if (Object.keys(game.nightActions).length > 0) {
        hints.push('Blood will be spilled before dawn');
    } else {
        hints.push('A peaceful night approaches');
    }

    // Visitor hints
    const visitCounts = new Map();
    for (const visits of Object.values(game.visits || {})) {
        for (const visitedId of visits) {
            visitCounts.set(visitedId, (visitCounts.get(visitedId) || 0) + 1);
        }
    }

    const mostVisited = Array.from(visitCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    if (mostVisited && mostVisited[1] > 1) {
        const target = game.players.find(p => p.id === mostVisited[0]);
        if (target) {
            hints.push(`Many eyes watch ${target.displayName} tonight`);
        }
    }

    // Role hints
    if (game.players.some(p => p.alive && p.role === 'MURDER_HORNET')) {
        hints.push('A solitary killer stalks the night');
    }

    // Neutral hints
    if (neutrals.length > 0) {
        hints.push(`${neutrals.length} ${neutrals.length === 1 ? 'seeks' : 'seek'} neither hive nor nest`);
    }

    // Random cryptic hints
    hints.push('Trust is a fragile flower');
    hints.push('Deception wears many faces');
    hints.push('Not all who buzz are bees');

    return hints;
}

/**
 * Notify gamblers who used lucky coins to survive
 */
async function notifyGamblerCoinUsage(game, client) {
    const coinUsages = game.nightResults.filter(r => r.type === 'gambler_coin_used');

    for (const usage of coinUsages) {
        try {
            const user = await client.users.fetch(usage.gamblerId);
            const embed = createImportantEmbed(
                '🎰 LUCKY COIN USED!',
                '⚠️ You were attacked tonight, but your lucky coin saved you! ⚠️',
                '#FFD700'
            )
                .addFields({
                    name: '🪙 Coins Remaining',
                    value: `>>> **${usage.coinsRemaining}/3** lucky coins left`,
                    inline: false
                })
                .setFooter({ text: 'Gambler Beetle - Coin Defense Activated' });

            await user.send({ embeds: [embed] });
        } catch (error) {
            console.error(`Could not notify gambler about coin usage:`, error);
        }
    }
}

/**
 * Create an important/noticeable embed for ability results
 */
function createImportantEmbed(title, description, color = '#FF0000') {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(`⚠️ ${title} ⚠️`)
        .setDescription(`**═══════════════════**\n${description}\n**═══════════════════**`)
        .setTimestamp();
}

/**
 * Process librarian action - detect limited-use abilities
 */
async function processLibrarian(game, librarian, action) {
    const targetId = action.target;
    addVisit(game, librarian.id, targetId);

    const target = game.players.find(p => p.id === targetId);
    if (!target) return;

    // Check if target has any limited-use abilities
    const hasLimitedAbilities =
        (target.bullets !== undefined && target.bullets > 0) ||
        (target.vests !== undefined && target.vests > 0) ||
        (target.cleans !== undefined && target.cleans > 0) ||
        (target.disguises !== undefined && target.disguises > 0) ||
        (target.executions !== undefined && target.executions > 0) ||
        (target.alerts !== undefined && target.alerts > 0) ||
        (target.mimics !== undefined && target.mimics > 0);

    game.nightResults.push({
        type: 'librarian',
        librarianId: librarian.id,
        targetId: targetId,
        hasLimitedAbilities: hasLimitedAbilities
    });
}

/**
 * Process coroner action - examine dead player
 */
async function processCoroner(game, coroner, action) {
    const targetId = action.target;
    const target = game.players.find(p => p.id === targetId);

    if (!target || target.alive) return;

    // Find death information
    let causeOfDeath = 'Unknown';
    let killerId = null;

    // Check previous night deaths
    for (const result of game.nightResults) {
        if (result.victimId === targetId) {
            causeOfDeath = result.attackType || 'Unknown';
            killerId = result.killerId;
            break;
        }
    }

    game.nightResults.push({
        type: 'coroner',
        coronerId: coroner.id,
        targetId: targetId,
        causeOfDeath: causeOfDeath,
        killerId: killerId
    });
}

/**
 * Process transport action - swap two players
 */
async function processTransport(game, transporter, action) {
    const target1Id = action.target1;
    const target2Id = action.target2;

    addVisit(game, transporter.id, target1Id);
    addVisit(game, transporter.id, target2Id);

    // Initialize transports map if not exists
    if (!game.transports) {
        game.transports = [];
    }

    game.transports.push({
        transporterId: transporter.id,
        target1: target1Id,
        target2: target2Id
    });

    game.nightResults.push({
        type: 'transport',
        transporterId: transporter.id,
        target1: target1Id,
        target2: target2Id
    });
}

/**
 * Process psychic action - generate 3-player vision
 */
async function processPsychic(game, psychic, action) {
    const alivePlayers = game.players.filter(p => p.alive);

    // Separate evil and all players
    const evilPlayers = alivePlayers.filter(p => {
        const role = ROLES[p.role];
        return role.team === 'wasp' || (role.team === 'neutral' && (role.subteam === 'evil' || role.subteam === 'killing'));
    });

    const selectedPlayers = [];
    let hasEvil = false;

    // If evil players exist, guarantee at least one is selected
    if (evilPlayers.length > 0) {
        // Pick 1 random evil player
        const randomEvil = evilPlayers[Math.floor(Math.random() * evilPlayers.length)];
        selectedPlayers.push(randomEvil);
        hasEvil = true;

        // Pick 2 more random players from remaining pool (excluding the selected evil player)
        const remainingPlayers = alivePlayers.filter(p => p.id !== randomEvil.id);
        const shuffled = [...remainingPlayers].sort(() => Math.random() - 0.5);
        selectedPlayers.push(...shuffled.slice(0, Math.min(2, shuffled.length)));

        // Shuffle the final selection so the evil player isn't always first
        selectedPlayers.sort(() => Math.random() - 0.5);
    } else {
        // No evil players alive - just pick 3 random players
        const shuffled = [...alivePlayers].sort(() => Math.random() - 0.5);
        selectedPlayers.push(...shuffled.slice(0, 3));
        hasEvil = false;
    }

    game.nightResults.push({
        type: 'psychic',
        psychicId: psychic.id,
        selectedPlayers: selectedPlayers.map(p => p.id),
        hasEvil: hasEvil
    });
}

/**
 * Process silencer action - silence ability results
 */
async function processSilencer(game, silencer, action) {
    const targetId = action.target;
    addVisit(game, silencer.id, targetId);

    // Initialize silenced players set
    if (!game.silencedPlayers) {
        game.silencedPlayers = new Set();
    }

    game.silencedPlayers.add(targetId);

    game.nightResults.push({
        type: 'silencer',
        silencerId: silencer.id,
        targetId: targetId
    });
}

/**
 * Process mole action - learn random Bee role
 */
async function processMole(game, mole, action, client) {
    // Get all alive Bee players (excluding already known ones)
    const bees = game.players.filter(p => {
        const role = ROLES[p.role];
        return p.alive && role.team === 'bee';
    });

    if (bees.length === 0) return;

    // Select random Bee
    const randomBee = bees[Math.floor(Math.random() * bees.length)];
    const beeRole = ROLES[randomBee.role];

    game.nightResults.push({
        type: 'mole',
        moleId: mole.id,
        discoveredId: randomBee.id,
        discoveredRole: randomBee.role
    });

    // Notify mole immediately
    try {
        const user = await client.users.fetch(mole.id);
        const embed = new EmbedBuilder()
            .setColor('#8B4513')
            .setTitle('🐛 Mole Report')
            .setDescription(`You have discovered that **${randomBee.displayName}** is a **${beeRole.name}**! ${beeRole.emoji}`)
            .setTimestamp();

        await user.send({ embeds: [embed] });
    } catch (error) {
        console.error(`Could not send mole result:`, error);
    }
}

/**
 * Process kidnap action - kidnap player for cycle
 */
async function processKidnap(game, kidnapper, action) {
    const targetId = action.target;

    // Initialize kidnapped players map
    if (!game.kidnappedPlayers) {
        game.kidnappedPlayers = new Map();
    }

    // Kidnap lasts for 1 day/night cycle
    game.kidnappedPlayers.set(targetId, {
        kidnapperId: kidnapper.id,
        kidnappedPhase: game.phase,
        releasePhase: game.phase + 2 // Released after 2 phase transitions
    });

    game.nightResults.push({
        type: 'kidnap',
        kidnapperId: kidnapper.id,
        targetId: targetId
    });
}

/**
 * Process yakuza action - convert neutral to Wasp
 */
async function processYakuza(game, yakuza, action, client) {
    if (yakuza.hasConverted) return;

    const targetId = action.target;
    const target = game.players.find(p => p.id === targetId);
    if (!target || !target.alive) return;

    const targetRole = ROLES[target.role];

    // Can only convert Neutrals (not Neutral Killing)
    if (targetRole.team !== 'neutral' || targetRole.subteam === 'killing') {
        game.nightResults.push({
            type: 'yakuza_failed',
            yakuzaId: yakuza.id,
            targetId: targetId
        });
        return;
    }

    // Convert to Wasp (Soldier Bee role, but on Wasp team)
    const oldRole = target.role;
    target.role = 'SOLDIER_BEE';
    target.convertedByYakuza = true;
    target.originalTeam = 'wasp'; // Override team

    yakuza.hasConverted = true;

    game.nightResults.push({
        type: 'yakuza',
        yakuzaId: yakuza.id,
        targetId: targetId,
        oldRole: oldRole
    });

    // Notify converted player
    try {
        const user = await client.users.fetch(targetId);
        const embed = new EmbedBuilder()
            .setColor('#8B0000')
            .setTitle('⚡ You Have Been Converted!')
            .setDescription('The Yakuza Wasp has converted you to the Wasp team!\n\nYou are now a **Soldier Bee** working for the Wasps. Your new goal is to eliminate all Bees and harmful Neutrals!')
            .setTimestamp();

        await user.send({ embeds: [embed] });
    } catch (error) {
        console.error(`Could not notify converted player:`, error);
    }
}

/**
 * Process cultist action - convert to cult
 */
async function processCultist(game, cultist, action, client) {
    const targetId = action.target;
    const target = game.players.find(p => p.id === targetId);
    if (!target || !target.alive) return;

    const targetRole = ROLES[target.role];

    // Cannot convert Wasps or Neutral Killing roles
    if (targetRole.team === 'wasp' || (targetRole.team === 'neutral' && targetRole.subteam === 'killing')) {
        game.nightResults.push({
            type: 'cultist_failed',
            cultistId: cultist.id,
            targetId: targetId
        });
        return;
    }

    // Convert to cult
    const oldRole = target.role;
    target.convertedToCult = true;
    target.cultLeader = cultist.id;

    // Track conversions
    cultist.conversions = (cultist.conversions || 0) + 1;

    game.nightResults.push({
        type: 'cultist',
        cultistId: cultist.id,
        targetId: targetId,
        oldRole: oldRole,
        totalConversions: cultist.conversions
    });

    // Notify converted player
    try {
        const user = await client.users.fetch(targetId);
        const embed = new EmbedBuilder()
            .setColor('#4B0082')
            .setTitle('🕯️ You Have Joined the Cult!')
            .setDescription('The Cultist has converted you!\n\nYou are now part of the Cult. You must help the Cultist achieve victory. If the Cultist has 3 converted members alive, you all win together!')
            .setTimestamp();

        await user.send({ embeds: [embed] });
    } catch (error) {
        console.error(`Could not notify converted player:`, error);
    }
}

/**
 * Process wildcard action - random ability
 */
async function processWildcard(game, wildcard, action, client) {
    // Generate random ability
    const abilities = [
        'investigate',
        'protect',
        'attack',
        'roleblock',
        'heal'
    ];

    const randomAbility = abilities[Math.floor(Math.random() * abilities.length)];
    const targetId = action.target;

    game.nightResults.push({
        type: 'wildcard',
        wildcardId: wildcard.id,
        targetId: targetId,
        ability: randomAbility
    });

    // Notify wildcard of their ability
    try {
        const user = await client.users.fetch(wildcard.id);
        const target = game.players.find(p => p.id === targetId);

        let abilityDescription = '';
        switch (randomAbility) {
            case 'investigate':
                abilityDescription = 'You investigated their role!';
                break;
            case 'protect':
                abilityDescription = 'You protected them from attacks!';
                break;
            case 'attack':
                abilityDescription = 'You attacked them!';
                break;
            case 'roleblock':
                abilityDescription = 'You roleblocked them!';
                break;
            case 'heal':
                abilityDescription = 'You healed them!';
                break;
        }

        const embed = new EmbedBuilder()
            .setColor('#FF1493')
            .setTitle('🎲 Wildcard Ability!')
            .setDescription(`Tonight, you randomly gained: **${randomAbility.toUpperCase()}**\n\n${abilityDescription}\n\nTarget: **${target.displayName}**`)
            .setTimestamp();

        await user.send({ embeds: [embed] });
    } catch (error) {
        console.error(`Could not send wildcard result:`, error);
    }
}

/**
 * Process librarian results - send investigation results
 */
async function processLibrarians(game, client) {
    const librarianResults = game.nightResults.filter(r => r.type === 'librarian');

    for (const result of librarianResults) {
        const librarian = game.players.find(p => p.id === result.librarianId);
        if (!librarian || !librarian.alive) continue;

        // Check if librarian is silenced
        if (game.silencedPlayers && game.silencedPlayers.has(result.librarianId)) {
            continue;
        }

        const target = game.players.find(p => p.id === result.targetId);

        try {
            const user = await client.users.fetch(result.librarianId);
            const resultEmbed = createImportantEmbed(
                '📚 LIBRARIAN INVESTIGATION',
                result.hasLimitedAbilities
                    ? `📖 **${target.displayName}** has **LIMITED-USE ABILITIES!** 📖\n\nThey possess special powers like bullets, vests, or other charges.`
                    : `📄 **${target.displayName}** has **NO LIMITED-USE ABILITIES** 📄\n\nThey don't have any special charges or limited powers.`,
                result.hasLimitedAbilities ? '#FFD700' : '#808080'
            )
                .setFooter({ text: 'Librarian Bee - Ability Detection' });

            await user.send({ embeds: [resultEmbed] });
        } catch (error) {
            console.error(`Could not send librarian result:`, error);
        }
    }
}

/**
 * Process coroner results - send examination results
 */
async function processCoroners(game, client) {
    const coronerResults = game.nightResults.filter(r => r.type === 'coroner');

    for (const result of coronerResults) {
        const coroner = game.players.find(p => p.id === result.coronerId);
        if (!coroner || !coroner.alive) continue;

        // Check if coroner is silenced
        if (game.silencedPlayers && game.silencedPlayers.has(result.coronerId)) {
            continue;
        }

        const target = game.players.find(p => p.id === result.targetId);

        try {
            const user = await client.users.fetch(result.coronerId);

            let causeText = 'Unknown';
            switch (result.causeOfDeath) {
                case 'mafia':
                    causeText = '🔪 Mafia Kill';
                    break;
                case 'vigilante':
                    causeText = '🔫 Vigilante Shot';
                    break;
                case 'serial_killer':
                    causeText = '⚔️ Serial Killer';
                    break;
                case 'arson':
                    causeText = '🔥 Arson';
                    break;
                case 'poison':
                    causeText = '☠️ Poison';
                    break;
                case 'voted':
                    causeText = '⚖️ Lynched by Vote';
                    break;
                case 'bodyguard_sacrifice':
                    causeText = '🛡️ Bodyguard Sacrifice';
                    break;
                case 'veteran_counter':
                    causeText = '⚔️ Veteran Counterattack';
                    break;
                default:
                    causeText = '❓ Unknown';
            }

            const resultEmbed = createImportantEmbed(
                '🔬 CORONER EXAMINATION',
                `You examined **${target.displayName}**'s body.`,
                '#4B0082'
            )
                .addFields({
                    name: '☠️ Cause of Death',
                    value: `>>> ${causeText}`,
                    inline: false
                })
                .setFooter({ text: 'Coroner Bee - Autopsy Report' });

            await user.send({ embeds: [resultEmbed] });
        } catch (error) {
            console.error(`Could not send coroner result:`, error);
        }
    }
}

/**
 * Process janitor results - notify Janitors of cleaned roles
 */
async function processJanitors(game, client, deaths) {
    if (!game.cleanedPlayers || game.cleanedPlayers.size === 0) return;

    // Find all Janitor clean actions
    const janitorResults = game.nightResults.filter(r => r.type === 'clean');

    for (const result of janitorResults) {
        const janitor = game.players.find(p => p.id === result.janitorId);
        if (!janitor) continue;

        const targetId = result.targetId;

        // Check if the target actually died
        const targetDied = deaths.some(d => d.victimId === targetId);

        if (!targetDied) {
            // Target didn't die, clean failed
            try {
                const user = await client.users.fetch(result.janitorId);
                const target = game.players.find(p => p.id === targetId);
                await user.send(`🧹 Your clean failed - **${target?.displayName || 'Unknown'}** did not die tonight.`);
            } catch (error) {
                console.error(`Could not notify janitor of failed clean:`, error);
            }
            // Remove from cleaned players since clean failed
            game.cleanedPlayers.delete(targetId);
            continue;
        }

        // Target died and was cleaned - notify janitor of the role
        const target = game.players.find(p => p.id === targetId);
        if (!target) continue;

        const targetRole = ROLES[target.role];

        try {
            const user = await client.users.fetch(result.janitorId);
            const { EmbedBuilder } = require('discord.js');
            const cleanEmbed = new EmbedBuilder()
                .setColor('#8B0000')
                .setTitle('🧹 Clean Successful!')
                .setDescription(`You successfully cleaned **${target.displayName}**'s body!\n\n**Their Role:** ${targetRole.emoji} ${targetRole.name}\n\nTheir role will be hidden from all players at the end of the game.`)
                .setFooter({ text: `Cleans remaining: ${janitor.cleans}` })
                .setTimestamp();

            await user.send({ embeds: [cleanEmbed] });
        } catch (error) {
            console.error(`Could not notify janitor of successful clean:`, error);
        }
    }
}

/**
 * Process disguiser results - notify Disguisers of successful disguises
 */
async function processDisguisers(game, client) {
    const disguiserResults = game.nightResults.filter(r => r.type === 'disguise');

    for (const result of disguiserResults) {
        const disguiser = game.players.find(p => p.id === result.disguiserId);
        if (!disguiser) continue;

        const target = game.players.find(p => p.id === result.targetId);
        if (!target) continue;

        const targetRole = ROLES[result.newRole];

        try {
            const user = await client.users.fetch(result.disguiserId);
            const { EmbedBuilder } = require('discord.js');
            const disguiseEmbed = new EmbedBuilder()
                .setColor('#8B0000')
                .setTitle('🎪 Disguise Successful!')
                .setDescription(`You are now disguised as **${target.displayName}**!\n\n**Disguised Role:** ${targetRole.emoji} ${targetRole.name}\n\nInvestigators will see you as this role instead of your true identity.`)
                .setFooter({ text: `Disguises remaining: ${disguiser.disguises}` })
                .setTimestamp();

            await user.send({ embeds: [disguiseEmbed] });
        } catch (error) {
            console.error(`Could not notify disguiser of successful disguise:`, error);
        }
    }
}

/**
 * Process psychic results - send visions
 */
async function processPsychics(game, client) {
    const psychicResults = game.nightResults.filter(r => r.type === 'psychic');

    for (const result of psychicResults) {
        const psychic = game.players.find(p => p.id === result.psychicId);
        if (!psychic || !psychic.alive) continue;

        // Check if psychic is silenced
        if (game.silencedPlayers && game.silencedPlayers.has(result.psychicId)) {
            continue;
        }

        const selectedPlayers = result.selectedPlayers.map(id => game.players.find(p => p.id === id));
        const playerNames = selectedPlayers.map(p => p.displayName).join(', ');

        try {
            const user = await client.users.fetch(result.psychicId);
            const resultEmbed = createImportantEmbed(
                '🔮 PSYCHIC VISION',
                `You have received a vision about these players:\n\n**${playerNames}**`,
                result.hasEvil ? '#8B0000' : '#00FF00'
            )
                .addFields({
                    name: result.hasEvil ? '⚠️ Vision Result' : '✅ Vision Result',
                    value: result.hasEvil
                        ? '>>> **AT LEAST ONE** of these players is **EVIL** (Wasp or Evil Neutral)!'
                        : '>>> **ALL** of these players are **INNOCENT** (Bees or Benign Neutrals)!',
                    inline: false
                })
                .setFooter({ text: 'Psychic Bee - Spiritual Vision' });

            await user.send({ embeds: [resultEmbed] });
        } catch (error) {
            console.error(`Could not send psychic result:`, error);
        }
    }
}

/**
 * Process Killer Wasp succession when Wasp Queen dies
 * @param {Object} game - Game object
 * @param {Array} deaths - Array of death objects
 * @param {Object} client - Discord client
 */
async function processWaspSuccession(game, deaths, client) {
    // Check if Wasp Queen died
    const queenDied = deaths.some(death => {
        const victim = game.players.find(p => p.id === death.victimId);
        return victim && victim.role === 'WASP_QUEEN';
    });

    if (!queenDied) return;

    // Find all alive Killer Wasps
    const aliveKillerWasps = game.players.filter(p => p.alive && p.role === 'KILLER_WASP');

    if (aliveKillerWasps.length === 0) return;

    // Randomly select one Killer Wasp to promote
    const newQueen = aliveKillerWasps[Math.floor(Math.random() * aliveKillerWasps.length)];

    // Promote to Wasp Queen
    newQueen.role = 'WASP_QUEEN';

    // Notify the promoted Killer Wasp
    try {
        const { EmbedBuilder } = require('discord.js');
        const user = await client.users.fetch(newQueen.id);
        const promotionEmbed = new EmbedBuilder()
            .setColor('#8B0000')
            .setTitle('👸 You Have Been Promoted!')
            .setDescription(`The Wasp Queen has fallen!\n\nYou have been promoted to **Wasp Queen**! 👸\n\n**New Abilities:**\n• Choose kill target each night\n• Basic attack (1)\n• Basic defense (1)\n• Immune to detection\n• Appear as not suspicious\n• Lead the Wasp team to victory!`)
            .setFooter({ text: 'Long live the Queen!' })
            .setTimestamp();

        await user.send({ embeds: [promotionEmbed] });
    } catch (error) {
        console.error(`Could not notify promoted Killer Wasp:`, error);
    }

    // Add to night results for logging
    game.nightResults.push({
        type: 'wasp_succession',
        newQueenId: newQueen.id,
        oldRole: 'KILLER_WASP'
    });
}

module.exports = {
    processNightActions,
    processWaspSuccession
};
