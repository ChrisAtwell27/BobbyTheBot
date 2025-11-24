const { EmbedBuilder } = require('discord.js');
const { ROLES } = require('../roles/mafiaRoles');
const { getPlayerTeam } = require('../game/mafiaUtils');
const { createGameEmbed } = require('./embeds');

// Constant for the main channel ID (should match the one in mafiaHandler.js)
const MAFIA_TEXT_CHANNEL_ID = '1434636519380881508';

/**
 * Send role DMs to all players
 */
async function sendRoleDMs(game, client) {
    const failures = [];

    for (const player of game.players) {
        try {
            // Skip bot players in debug mode (they don't have real Discord accounts)
            if (player.id.startsWith('bot')) {
                continue;
            }

            const user = await client.users.fetch(player.id);
            const role = ROLES[player.role];

            // Determine color based on team
            let color;
            if (role.team === 'bee') color = '#FFD700';
            else if (role.team === 'wasp') color = '#8B0000';
            else color = '#808080';

            const roleEmbed = new EmbedBuilder()
                .setColor(color)
                .setTitle(`${role.emoji} Your Role: ${role.name}`)
                .setDescription(role.description)
                .addFields(
                    { name: 'Abilities', value: role.abilities.join('\n'), inline: false },
                    { name: 'Win Condition', value: role.winCondition, inline: false }
                )
                .setFooter({ text: '🤫 Keep this secret!' });

            // Add teammate info for Wasps
            if (getPlayerTeam(player) === 'wasp') {
                const teammates = game.players
                    .filter(p => getPlayerTeam(p) === 'wasp' && p.id !== player.id)
                    .map(p => `${p.displayName} (${ROLES[p.role].name})`)
                    .join('\n');

                if (teammates) {
                    roleEmbed.addFields({
                        name: '🐝 Your Fellow Wasps',
                        value: teammates,
                        inline: false
                    });
                }
            }

            // Add Executioner target
            if (player.role === 'BOUNTY_HUNTER' && player.target) {
                const targetPlayer = game.players.find(p => p.id === player.target);
                if (targetPlayer) {
                    roleEmbed.addFields({
                        name: '🎯 Your Target',
                        value: `You must get **${targetPlayer.displayName}** lynched during the day!`,
                        inline: false
                    });
                }
            }

            // Add Mercenary team assignment
            if (player.role === 'MERCENARY' && player.mercenaryTeam) {
                const teamName = player.mercenaryTeam === 'bee' ? 'Bee Team 🐝' : 'Wasp Team 🐝';
                const winCondition = player.mercenaryTeam === 'bee'
                    ? 'Eliminate all Wasps and harmful Neutrals'
                    : 'Eliminate all Bees and harmful Neutrals';
                roleEmbed.addFields({
                    name: '💰 Your Assignment',
                    value: `You have been hired by the **${teamName}**!\n\nYour new win condition: ${winCondition}`,
                    inline: false
                });
            }

            // Add resource counts
            if (player.bullets !== undefined) {
                roleEmbed.addFields({
                    name: '⚔️ Bullets Remaining',
                    value: `${player.bullets} bullets`,
                    inline: true
                });
            }
            if (player.vests !== undefined) {
                roleEmbed.addFields({
                    name: '🛡️ Vests Remaining',
                    value: `${player.vests} vests`,
                    inline: true
                });
            }

            await user.send({ embeds: [roleEmbed] });

            // Send night instructions for Wasps
            if (getPlayerTeam(player) === 'wasp') {
                await user.send('During night phase, you can send messages to coordinate with your team. Just send me a DM during the night!');
            }
        } catch (error) {
            console.error(`Could not send role DM to ${player.displayName}:`, error);
            failures.push(player.displayName);
        }
    }

    return failures;
}

/**
 * Send death notification DM to killed player
 */
async function sendDeathNotification(game, client, death) {
    try {
        const victim = game.players.find(p => p.id === death.victimId);
        if (!victim) return;

        // Skip bot players in debug mode
        if (victim.id.startsWith('bot')) {
            return;
        }

        const user = await client.users.fetch(victim.id);
        const role = ROLES[victim.role];

        const deathEmbed = new EmbedBuilder()
            .setColor('#000000')
            .setTitle('💀 You Have Been Eliminated')
            .setDescription(`You have been killed and are now out of the game.\n\n**Your Role:** ${role.emoji} ${role.name}\n\n**Note:** You do not know who killed you. This prevents you from revealing killer identities to the Medium or other dead players.`)
            .setTimestamp();

        await user.send({ embeds: [deathEmbed] });
    } catch (error) {
        console.error(`Could not send death notification to ${death.victimId}:`, error);
    }
}

/**
 * Send an embed to all alive players via DM
 */
async function sendToAllPlayers(game, client, embed, components = []) {
    const alivePlayers = game.players.filter(p => p.alive);

    for (const player of alivePlayers) {
        try {
            if (player.id.startsWith('bot')) continue;

            const user = await client.users.fetch(player.id);
            await user.send({ embeds: [embed], components });
        } catch (error) {
            console.error(`Could not send message to ${player.displayName}:`, error);
        }
    }
}

/**
 * Send an embed to ALL players (including dead) via DM
 */
async function sendToEveryoneInGame(game, client, embed, components = []) {
    for (const player of game.players) {
        try {
            if (player.id.startsWith('bot')) continue;

            const user = await client.users.fetch(player.id);
            await user.send({ embeds: [embed], components });
        } catch (error) {
            console.error(`Could not send message to ${player.displayName}:`, error);
        }
    }
}

/**
 * Update game display (Dashboard)
 */
async function updateGameDisplay(game, client) {
    try {
        // Use cached channel if available, otherwise fetch and cache it
        if (!game.cachedChannel) {
            game.cachedChannel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
        }
        const channel = game.cachedChannel;

        const embed = createGameEmbed(game);

        // If we have a message ID, try to edit it
        if (game.messageId) {
            try {
                const message = await channel.messages.fetch(game.messageId);
                await message.edit({ embeds: [embed] });
            } catch (error) {
                // Message might have been deleted, send a new one
                console.log('Game message not found, sending new one');
                const message = await channel.send({ embeds: [embed] });
                game.messageId = message.id;
            }
        } else {
            // No message ID, send a new one
            const message = await channel.send({ embeds: [embed] });
            game.messageId = message.id;
        }
    } catch (error) {
        console.error('Error updating game display:', error);
    }
}

module.exports = {
    sendRoleDMs,
    sendDeathNotification,
    sendToAllPlayers,
    sendToEveryoneInGame,
    updateGameDisplay
};
