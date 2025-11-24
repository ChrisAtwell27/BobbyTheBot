const { EmbedBuilder } = require('discord.js');
const { ROLES } = require('../roles/mafiaRoles');

/**
 * Create the main game embed based on current state
 */
function createGameEmbed(game) {
    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`🐝 Bee Mafia Game 🐝${game.debugMode ? ' [DEBUG MODE]' : ''}`)
        .setTimestamp();

    const alivePlayers = game.players.filter(p => p.alive);
    const deadPlayers = game.players.filter(p => !p.alive);

    if (game.phase === 'setup') {
        embed.setDescription(`**Game Status:** Setting up\n**Players:** ${game.players.length}${game.debugMode ? '\n**Mode:** Debug' : ''}`);
        embed.addFields({
            name: 'Players in Game',
            value: game.players.map(p => `• ${p.displayName}`).join('\n') || 'No players yet',
            inline: false
        });
    } else if (game.phase === 'night') {
        embed.setDescription(`**Phase:** 🌙 Night Time\n**Time Remaining:** ${Math.ceil((game.phaseEndTime - Date.now()) / 1000)}s`);
        embed.addFields({
            name: `Alive Players (${alivePlayers.length})`,
            value: alivePlayers.map(p => `• ${p.displayName}`).join('\n'),
            inline: true
        });
        if (deadPlayers.length > 0) {
            embed.addFields({
                name: `Eliminated (${deadPlayers.length})`,
                value: deadPlayers.map(p => `• ${p.displayName}`).join('\n'),
                inline: true
            });
        }
    } else if (game.phase === 'day') {
        embed.setDescription(`**Phase:** ☀️ Day Discussion\n**Time Remaining:** ${Math.ceil((game.phaseEndTime - Date.now()) / 1000)}s`);
        embed.addFields({
            name: `Alive Players (${alivePlayers.length})`,
            value: alivePlayers.map(p => `• ${p.displayName}`).join('\n'),
            inline: true
        });
        if (deadPlayers.length > 0) {
            embed.addFields({
                name: `Eliminated (${deadPlayers.length})`,
                value: deadPlayers.map(p => `• ${p.displayName}`).join('\n'),
                inline: true
            });
        }
    } else if (game.phase === 'voting') {
        embed.setDescription(`**Phase:** 🗳️ Voting Time\n**Time Remaining:** ${Math.ceil((game.phaseEndTime - Date.now()) / 1000)}s`);
        embed.addFields({
            name: `Alive Players (${alivePlayers.length})`,
            value: alivePlayers.map(p => `• ${p.displayName}`).join('\n'),
            inline: true
        });
        if (deadPlayers.length > 0) {
            embed.addFields({
                name: `Eliminated (${deadPlayers.length})`,
                value: deadPlayers.map(p => `• ${p.displayName}`).join('\n'),
                inline: true
            });
        }
        embed.addFields({
            name: 'Instructions',
            value: 'Check your DMs to vote for a player to eliminate!',
            inline: false
        });
    }

    return embed;
}

/**
 * Get cause of death message based on attack type
 */
function getCauseOfDeath(game, death) {
    // Handle new format with multiple killers
    const killers = death.killers || [{ killerId: death.killerId, attackType: death.attackType }];

    if (killers.length === 1) {
        // Single killer
        const killerData = killers[0];
        const killer = game.players.find(p => p.id === killerData.killerId);
        const killerName = killer ? killer.displayName : 'Unknown';
        const killerRole = killer && ROLES[killer.role] ? ROLES[killer.role].name : 'Unknown';

        switch (killerData.attackType) {
            case 'mafia':
                return `You were killed by the Wasps (${killerName} - ${killerRole})`;
            case 'vigilante':
                return `You were shot by a Vigilante Bee (${killerName})`;
            case 'serial_killer':
                return `You were killed by the Hornet (${killerName})`;
            case 'arson':
                return `You were ignited by the Fire Ant (${killerName})`;
            case 'bodyguard_sacrifice':
                return `You died protecting your target as a Guard Bee`;
            case 'bodyguard_counter':
                return `You were killed by a Guard Bee's counterattack (${killerName})`;
            case 'serial_killer_counter':
                return `You were killed by the Hornet's counterattack (${killerName})`;
            case 'veteran_counter':
                return `You were killed by a Soldier Bee's alert (${killerName})`;
            case 'jail_execute':
                return `You were executed by the Queen Bee (${killerName})`;
            case 'voted':
                return `You were voted out by the hive`;
            case 'jester_haunt':
                return `You were haunted to death by the Clown Beetle`;
            case 'guilt':
                return `You died from guilt after killing a fellow Bee team member`;
            case 'poison':
                return `You died from poison (${killerName})`;
            case 'matchmaker_link':
                return `You died through a matchmaker link`;
            case 'doppelganger_link':
                return `You died through a doppelgänger link`;
            default:
                return `You were eliminated`;
        }
    } else {
        // Multiple killers - list them all
        const deathMessages = killers.map(killerData => {
            const killer = game.players.find(p => p.id === killerData.killerId);
            const killerName = killer ? killer.displayName : 'Unknown';
            const killerRole = killer && ROLES[killer.role] ? ROLES[killer.role].name : 'Unknown';

            switch (killerData.attackType) {
                case 'mafia':
                    return `the Wasps (${killerName} - ${killerRole})`;
                case 'vigilante':
                    return `a Vigilante Bee (${killerName})`;
                case 'serial_killer':
                    return `the Hornet (${killerName})`;
                case 'arson':
                    return `the Fire Ant (${killerName})`;
                case 'bodyguard_counter':
                    return `a Guard Bee's counterattack (${killerName})`;
                case 'serial_killer_counter':
                    return `the Hornet's counterattack (${killerName})`;
                case 'veteran_counter':
                    return `a Veteran Bee on alert (${killerName})`;
                case 'jail_execute':
                    return `the Jailer Bee (${killerName})`;
                case 'poison':
                    return `poison (${killerName})`;
                default:
                    return 'unknown sources';
            }
        });

        return `You were killed by MULTIPLE sources: ${deathMessages.join(', ')}`;
    }
}

/**
 * Get public death cause (without revealing killer identity)
 */
function getPublicDeathCause(attackType) {
    switch (attackType) {
        case 'mafia':
            return 'killed by the Wasps';
        case 'vigilante':
            return 'shot by a Soldier Bee';
        case 'serial_killer':
            return 'killed by the Murder Hornet';
        case 'arson':
            return 'ignited by the Fire Ant';
        case 'poison':
            return 'died from poison';
        case 'bodyguard_sacrifice':
            return 'died protecting their target';
        case 'bodyguard_counter':
            return 'killed by a Bodyguard Bee';
        case 'serial_killer_counter':
            return 'killed by the Murder Hornet';
        case 'veteran_counter':
            return 'killed by a Veteran Bee on alert';
        case 'jail_execute':
            return 'executed by the Jailer Bee';
        case 'matchmaker_link':
            return 'died through a matchmaker link';
        case 'doppelganger_link':
            return 'died through a doppelgänger link';
        case 'voted':
            return 'voted out by the hive';
        case 'jester_haunt':
            return 'haunted by the Clown Beetle';
        case 'guilt':
            return 'died from guilt';
        default:
            return 'eliminated';
    }
}

module.exports = {
    createGameEmbed,
    getCauseOfDeath,
    getPublicDeathCause
};
