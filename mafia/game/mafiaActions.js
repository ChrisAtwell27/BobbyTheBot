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

    // First pass: Process all actions and determine protections/attacks
    for (const [userId, action] of Object.entries(game.nightActions)) {
        const player = game.players.find(p => p.id === userId);
        if (!player || !player.alive) continue;

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
            case 'seance':
                await processSeance(game, player, action, client);
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
        }
    }

    // Apply roleblocks and jails (cancel actions)
    applyRoleblocks(game, roleblocks, jailedPlayers);

    // Apply witch controls (redirect actions)
    applyWitchControls(game, controlTargets, attacks);

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

    // Process investigative actions
    await processInvestigations(game, client);

    // Process lookout
    await processLookouts(game, client);

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
 * @returns {Array} Array of {victimId, killerId, attackType}
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

        // Check each attack
        for (const attack of attackArray) {
            if (attack.attackLevel >= defense) {
                // Attack succeeds
                target.alive = false;

                deaths.push({
                    victimId: targetId,
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

                break; // Target can only die once
            }
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
                killerId: targetAttacks[0].attackerId,
                attackType: 'bodyguard_sacrifice'
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
                        killerId: guardId,
                        attackType: 'bodyguard_counter'
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

    const targetRole = ROLES[target.role];
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
        const resultEmbed = new EmbedBuilder()
            .setColor(isSuspicious ? '#FF0000' : '#00FF00')
            .setTitle('👮 Investigation Results')
            .setDescription(`**${target.displayName}** is ${isSuspicious ? '**SUSPICIOUS!** ⚠️' : '**NOT suspicious.** ✅'}`)
            .setTimestamp();

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

    const targetRole = ROLES[target.role];

    try {
        const user = await client.users.fetch(investigator.id);
        const resultEmbed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('🔍 Investigation Results')
            .setDescription(`**${target.displayName}** is a **${targetRole.name}**! ${targetRole.emoji}`)
            .setTimestamp();

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

    const targetRole = ROLES[target.role];

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
                const resultEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('👁️ Lookout Report')
                    .setDescription(`You watched **${target.displayName}** last night.`)
                    .addFields({
                        name: 'Visitors',
                        value: visitorsText,
                        inline: false
                    })
                    .setTimestamp();

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

    // Record roleblock
    roleblocks.set(targetId, blocker.id);

    game.nightResults.push({
        type: 'roleblock',
        blockerId: blocker.id,
        targetId: targetId
    });
}

/**
 * Process seance (Medium) - establishes two-way communication
 */
async function processSeance(game, medium, action, client) {
    const targetId = action.target;
    const target = game.players.find(p => p.id === targetId);

    if (!target || target.alive) return;

    const targetRole = ROLES[target.role];

    // Store active seance connection
    if (!game.activeSeances) {
        game.activeSeances = [];
    }

    game.activeSeances.push({
        mediumId: medium.id,
        mediumName: medium.displayName,
        deadId: target.id,
        deadName: target.displayName,
        deadRole: targetRole.name,
        deadEmoji: targetRole.emoji
    });

    try {
        // Notify Medium
        const mediumUser = await client.users.fetch(medium.id);
        const mediumEmbed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('👻 Seance Connection Established')
            .setDescription(`You have connected with **${target.displayName}** from beyond the grave.\n\n**Their Role:** ${targetRole.name} ${targetRole.emoji}\n\n💬 You can now send messages to them! Just type your message and send it to me. They can respond back.`)
            .setFooter({ text: 'Connection will end when the night ends.' })
            .setTimestamp();

        await mediumUser.send({ embeds: [mediumEmbed] });

        // Notify dead player
        const deadUser = await client.users.fetch(target.id);
        const deadEmbed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('👻 A Medium Has Contacted You!')
            .setDescription(`**${medium.displayName}** the Medium Bee has connected with you from the living world!\n\n💬 You can send messages back! Just type your message and send it to me. They will receive it.`)
            .setFooter({ text: 'Connection will end when the night ends.' })
            .setTimestamp();

        await deadUser.send({ embeds: [deadEmbed] });
    } catch (error) {
        console.error(`Could not send seance notifications:`, error);
    }
}

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

module.exports = {
    processNightActions
};
