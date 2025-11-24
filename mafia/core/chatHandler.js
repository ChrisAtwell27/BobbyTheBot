const { EmbedBuilder } = require('discord.js');
const { getGameByPlayer } = require('../game/mafiaGameState');
const { isMutePlayer } = require('../game/mafiaUtils');
const { translateToEmojis, twistTextToNegative, transformToPositive } = require('./aiHandler');

const MAFIA_TEXT_CHANNEL_ID = '1434636519380881508';

/**
 * Handle chat messages in the Mafia text channel
 * Applies transformations for Mute Bee, Deceiver Wasp, Blackmailer Wasp, etc.
 */
async function handleGameChat(message, client) {
    // Only handle messages in the mafia channel
    if (message.channel.id !== MAFIA_TEXT_CHANNEL_ID) return;
    if (message.author.bot) return;
    if (message.content.startsWith('!')) return; // Ignore commands

    const game = getGameByPlayer(message.author.id);
    if (!game || game.phase !== 'day') return; // Only transform during day phase

    const player = game.players.find(p => p.id === message.author.id);
    if (!player || !player.alive) return;

    // STEP 1: Check if message needs transformation (deceive/blackmail)
    let transformedText = message.content;
    let transformationType = null;
    let footerText = null;
    let embedColor = null;

    // Check blackmail first (higher priority than deceive)
    if (game.blackmailedPlayers && game.blackmailedPlayers.has(player.id)) {
        transformedText = await transformToPositive(message.content, message.author.username);
        transformationType = 'blackmail';
        footerText = '🤐 They seem oddly positive...';
        embedColor = '#4B0082';
    }
    // Check deceive if not blackmailed
    else if (game.deceivedPlayers && game.deceivedPlayers.has(player.id)) {
        transformedText = await twistTextToNegative(message.content, message.author.username);
        transformationType = 'deceive';
        footerText = '🎭 Something seems off...';
        embedColor = '#8B0000';
    }

    // STEP 2: Check if Mute Bee - translate the (potentially transformed) text to emojis
    if (isMutePlayer(player)) {
        // Delete the original message
        try {
            await message.delete();
        } catch (error) {
            console.error('Could not delete message:', error);
        }

        // Translate the transformed text to emojis
        const emojiMessage = await translateToEmojis(transformedText, message.author.username);

        if (emojiMessage) {
            // Determine footer based on transformation status
            let finalFooter = '🤐 Translated to emojis';
            if (transformationType === 'blackmail') {
                finalFooter = '🤐 Muted & Blackmailed - Positive then emojis';
            } else if (transformationType === 'deceive') {
                finalFooter = '🤐 Muted & Deceived - Twisted then emojis';
            }

            // Send emoji message to channel
            const emojiEmbed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setAuthor({
                    name: `${player.displayName} (Mute Bee)`,
                    iconURL: message.author.displayAvatarURL()
                })
                .setDescription(emojiMessage)
                .setFooter({ text: finalFooter })
                .setTimestamp();

            await message.channel.send({ embeds: [emojiEmbed] });

            // Send TRANSFORMED (but not emoji'd) message to Deaf Bee players
            const deafBeePlayers = game.players.filter(p => p.role === 'DEAF_BEE' && p.alive);
            for (const deafBee of deafBeePlayers) {
                try {
                    if (deafBee.id.startsWith('bot')) continue;
                    
                    const deafBeeUser = await client.users.fetch(deafBee.id);
                    // Deaf Bees see the transformed text (positive/negative) but NOT emojis
                    await deafBeeUser.send(`💬 **${player.displayName}:** ${transformedText}`);
                } catch (error) {
                    console.error(`Could not send message to Deaf Bee ${deafBee.displayName}:`, error);
                }
            }
        }
    }
    // STEP 3: If not Mute Bee but transformed, send transformed version
    else if (transformationType) {
        // Delete the original message
        try {
            await message.delete();
        } catch (error) {
            console.error('Could not delete message:', error);
        }

        // Send transformed message to channel
        const transformedEmbed = new EmbedBuilder()
            .setColor(embedColor)
            .setAuthor({
                name: `${player.displayName}`,
                iconURL: message.author.displayAvatarURL()
            })
            .setDescription(transformedText)
            .setFooter({ text: footerText })
            .setTimestamp();

        await message.channel.send({ embeds: [transformedEmbed] });

        // Send transformed message to all Deaf Bee players via DM
        const deafBeePlayers = game.players.filter(p => p.role === 'DEAF_BEE' && p.alive);
        for (const deafBee of deafBeePlayers) {
            try {
                if (deafBee.id.startsWith('bot')) continue;

                const deafBeeUser = await client.users.fetch(deafBee.id);
                await deafBeeUser.send(`💬 **${player.displayName}:** ${transformedText}`);
            } catch (error) {
                console.error(`Could not send message to Deaf Bee ${deafBee.displayName}:`, error);
            }
        }
    }
}

module.exports = {
    handleGameChat
};
