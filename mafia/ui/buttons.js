const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Create voting buttons for the voting phase
 */
function createVotingButtons(gameId, alivePlayers) {
    const rows = [];
    const buttonsPerRow = 4;

    for (let i = 0; i < alivePlayers.length; i += buttonsPerRow) {
        const row = new ActionRowBuilder();

        for (let j = 0; j < buttonsPerRow && i + j < alivePlayers.length; j++) {
            const player = alivePlayers[i + j];
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`mafiavote_${gameId}_${player.id}`)
                    .setLabel(player.displayName)
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🗳️')
            );
        }
        rows.push(row);
    }

    // Add skip vote button
    const skipRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`mafiavote_${gameId}_skip`)
            .setLabel('Skip Vote')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⏭️')
    );
    rows.push(skipRow);

    return rows;
}

module.exports = {
    createVotingButtons
};
