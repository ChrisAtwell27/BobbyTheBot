const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { updateBobbyBucks } = require('../database/helpers/economyHelpers');
const User = require('../database/models/User');
const { TARGET_GUILD_ID } = require('../config/guildConfig');

// Constants
const MAFIA_VC_ID = '1434633691455426600';
const MAFIA_TEXT_CHANNEL_ID = '1434636519380881508';
const MIN_PLAYERS = 6;
const SETUP_DELAY = 30000; // 30 seconds
const NIGHT_DURATION = 60000; // 1 minute
const DAY_DISCUSSION_DURATION = 180000; // 3 minutes
const VOTING_DURATION = 120000; // 2 minutes for voting
const WINNER_REWARD = 500; // BobbyBucks

// Role Configuration - Easy to modify for new roles
const ROLES = {
    WASP: {
        name: 'Wasp',
        emoji: '🐝',
        team: 'bad',
        description: 'You are a **Wasp**! Work with your fellow Wasps to eliminate the bees. Each night, you can vote with your team to sting one player.',
        abilities: ['Can communicate with other Wasps at night', 'Vote to eliminate one player each night'],
        winCondition: 'Eliminate all bees or equal their numbers'
    },
    BEEKEEPER: {
        name: 'Beekeeper',
        emoji: '🧑‍🌾',
        team: 'good',
        description: 'You are the **Beekeeper**! You can protect one player from being eliminated each night.',
        abilities: ['Protect one player each night from elimination'],
        winCondition: 'Eliminate all Wasps'
    },
    SCOUT_BEE: {
        name: 'Scout Bee',
        emoji: '🔍',
        team: 'good',
        description: 'You are a **Scout Bee**! You can investigate one player each night to discover if they are a Wasp or not.',
        abilities: ['Investigate one player each night to learn their alignment'],
        winCondition: 'Eliminate all Wasps'
    },
    WORKER_BEE: {
        name: 'Worker Bee',
        emoji: '🐝',
        team: 'good',
        description: 'You are a **Worker Bee**! You have no special abilities, but you can help identify the Wasps through discussion and voting.',
        abilities: ['Vote during the day phase'],
        winCondition: 'Eliminate all Wasps'
    }
};

// Game state storage
const activeGames = new Map();
const playerGameMap = new Map(); // Track which game each player is in

// Role distribution based on player count
function getRoleDistribution(playerCount) {
    const distribution = [];

    if (playerCount < MIN_PLAYERS) {
        return null;
    }

    // Calculate number of Wasps (roughly 1/3 of players, minimum 2)
    let waspCount;
    if (playerCount <= 8) waspCount = 2;
    else if (playerCount <= 11) waspCount = 3;
    else if (playerCount <= 14) waspCount = 4;
    else waspCount = Math.floor(playerCount / 3);

    // Add Wasps
    for (let i = 0; i < waspCount; i++) {
        distribution.push('WASP');
    }

    // Add special roles
    distribution.push('BEEKEEPER');
    distribution.push('SCOUT_BEE');

    // Fill remaining with Worker Bees
    const remainingSlots = playerCount - distribution.length;
    for (let i = 0; i < remainingSlots; i++) {
        distribution.push('WORKER_BEE');
    }

    return distribution;
}

// Shuffle array
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Create game embed
function createGameEmbed(game) {
    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🐝 Bee Mafia Game 🐝')
        .setTimestamp();

    const alivePlayers = game.players.filter(p => p.alive);
    const deadPlayers = game.players.filter(p => !p.alive);

    if (game.phase === 'setup') {
        embed.setDescription(`**Game Status:** Setting up\n**Players:** ${game.players.length}`);
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
            name: 'Instructions',
            value: 'Vote for a player to eliminate using the buttons below!',
            inline: false
        });

        const voteCounts = {};
        Object.values(game.votes || {}).forEach(targetId => {
            voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
        });

        if (Object.keys(voteCounts).length > 0) {
            const voteStatus = alivePlayers.map(p => {
                const count = voteCounts[p.id] || 0;
                return `• ${p.displayName}: ${count} vote${count !== 1 ? 's' : ''}`;
            }).join('\n');

            embed.addFields({
                name: 'Current Votes',
                value: voteStatus,
                inline: false
            });
        }
    }

    return embed;
}

// Create voting buttons
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

// Send role DMs
async function sendRoleDMs(game, client) {
    for (const player of game.players) {
        try {
            const user = await client.users.fetch(player.id);
            const role = ROLES[player.role];

            const roleEmbed = new EmbedBuilder()
                .setColor(role.team === 'bad' ? '#8B0000' : '#FFD700')
                .setTitle(`${role.emoji} Your Role: ${role.name}`)
                .setDescription(role.description)
                .addFields(
                    { name: 'Abilities', value: role.abilities.join('\n'), inline: false },
                    { name: 'Win Condition', value: role.winCondition, inline: false }
                )
                .setFooter({ text: '🤫 Keep this secret!' });

            // Add teammate info for Wasps
            if (player.role === 'WASP') {
                const teammates = game.players
                    .filter(p => p.role === 'WASP' && p.id !== player.id)
                    .map(p => p.displayName)
                    .join(', ');

                if (teammates) {
                    roleEmbed.addFields({
                        name: 'Your Fellow Wasps',
                        value: teammates,
                        inline: false
                    });
                }
            }

            await user.send({ embeds: [roleEmbed] });

            // Send night instructions if applicable
            if (player.role === 'WASP') {
                await user.send('During night phase, you can send messages to coordinate with your team. Just send me a DM during the night!');
            }
        } catch (error) {
            console.error(`Could not send role DM to ${player.displayName}:`, error);
        }
    }
}

// Update game display
async function updateGameDisplay(game, client) {
    try {
        const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
        const message = await channel.messages.fetch(game.messageId);

        const embed = createGameEmbed(game);
        const components = game.phase === 'voting' ? createVotingButtons(game.id, game.players.filter(p => p.alive)) : [];

        await message.edit({
            embeds: [embed],
            components: components
        });
    } catch (error) {
        console.error('Error updating game display:', error);
    }
}

// Start night phase
async function startNightPhase(game, client) {
    game.phase = 'night';
    game.phaseEndTime = Date.now() + NIGHT_DURATION;
    game.nightActions = {};
    game.nightMessages = [];

    const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);

    const nightEmbed = new EmbedBuilder()
        .setColor('#000080')
        .setTitle('🌙 Night Falls Over the Hive')
        .setDescription('The bees settle in for the night. Those with special abilities should check their DMs!')
        .setTimestamp();

    await channel.send({ embeds: [nightEmbed] });

    // Send night action prompts
    await sendNightActionPrompts(game, client);

    // Update game display
    await updateGameDisplay(game, client);

    // Set timer for day phase
    game.phaseTimer = setTimeout(async () => {
        await endNightPhase(game, client);
    }, NIGHT_DURATION);
}

// Send night action prompts
async function sendNightActionPrompts(game, client) {
    const alivePlayers = game.players.filter(p => p.alive);

    for (const player of alivePlayers) {
        try {
            const user = await client.users.fetch(player.id);

            if (player.role === 'WASP') {
                const waspTargets = alivePlayers
                    .filter(p => p.role !== 'WASP')
                    .map((p, i) => `${i + 1}. ${p.displayName}`)
                    .join('\n');

                const waspEmbed = new EmbedBuilder()
                    .setColor('#8B0000')
                    .setTitle('🐝 Night Phase - Choose Your Target')
                    .setDescription('Vote for who to eliminate tonight. Send me the **number** of your target.\n\n' + waspTargets)
                    .setFooter({ text: 'You can also send messages to coordinate with your team!' });

                await user.send({ embeds: [waspEmbed] });
            } else if (player.role === 'BEEKEEPER') {
                const targets = alivePlayers
                    .map((p, i) => `${i + 1}. ${p.displayName}`)
                    .join('\n');

                const keeperEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🧑‍🌾 Night Phase - Protect Someone')
                    .setDescription('Choose a player to protect tonight. Send me the **number** of your target.\n\n' + targets)
                    .setFooter({ text: 'Choose wisely!' });

                await user.send({ embeds: [keeperEmbed] });
            } else if (player.role === 'SCOUT_BEE') {
                const targets = alivePlayers
                    .filter(p => p.id !== player.id)
                    .map((p, i) => `${i + 1}. ${p.displayName}`)
                    .join('\n');

                const scoutEmbed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('🔍 Night Phase - Investigate Someone')
                    .setDescription('Choose a player to investigate tonight. Send me the **number** of your target.\n\n' + targets)
                    .setFooter({ text: 'Discover the truth!' });

                await user.send({ embeds: [scoutEmbed] });
            }
        } catch (error) {
            console.error(`Could not send night action prompt to ${player.displayName}:`, error);
        }
    }
}

// Process night action
async function processNightAction(userId, message, game, client) {
    const player = game.players.find(p => p.id === userId);
    if (!player || !player.alive) return;

    const alivePlayers = game.players.filter(p => p.alive);
    const choice = parseInt(message.content.trim());

    if (player.role === 'WASP') {
        // Handle Wasp coordination messages
        if (isNaN(choice)) {
            // This is a coordination message, relay to other Wasps
            const wasps = game.players.filter(p => p.role === 'WASP' && p.alive && p.id !== userId);

            for (const wasp of wasps) {
                try {
                    const user = await client.users.fetch(wasp.id);
                    await user.send(`**${player.displayName}:** ${message.content}`);
                } catch (error) {
                    console.error(`Could not relay message to ${wasp.displayName}:`, error);
                }
            }

            await message.reply('Message sent to your fellow Wasps! 🐝');
            return;
        }

        // Handle Wasp vote
        const validTargets = alivePlayers.filter(p => p.role !== 'WASP');
        if (choice >= 1 && choice <= validTargets.length) {
            const target = validTargets[choice - 1];
            game.nightActions[userId] = { action: 'kill', target: target.id };
            await message.reply(`You voted to eliminate **${target.displayName}**. 🎯`);
        } else {
            await message.reply('Invalid choice. Please send a valid number.');
        }
    } else if (player.role === 'BEEKEEPER') {
        if (choice >= 1 && choice <= alivePlayers.length) {
            const target = alivePlayers[choice - 1];
            game.nightActions[userId] = { action: 'protect', target: target.id };
            await message.reply(`You are protecting **${target.displayName}** tonight. 🛡️`);
        } else {
            await message.reply('Invalid choice. Please send a valid number.');
        }
    } else if (player.role === 'SCOUT_BEE') {
        const validTargets = alivePlayers.filter(p => p.id !== userId);
        if (choice >= 1 && choice <= validTargets.length) {
            const target = validTargets[choice - 1];
            game.nightActions[userId] = { action: 'investigate', target: target.id };

            const targetPlayer = game.players.find(p => p.id === target.id);
            const isWasp = targetPlayer.role === 'WASP';

            const resultEmbed = new EmbedBuilder()
                .setColor(isWasp ? '#8B0000' : '#00FF00')
                .setTitle('🔍 Investigation Results')
                .setDescription(`**${target.displayName}** is ${isWasp ? '**a WASP!** 🐝⚠️' : '**NOT a Wasp.** ✅'}`)
                .setTimestamp();

            await message.reply({ embeds: [resultEmbed] });
        } else {
            await message.reply('Invalid choice. Please send a valid number.');
        }
    }
}

// End night phase
async function endNightPhase(game, client) {
    if (game.phase !== 'night') return;

    const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);

    // Process night actions
    const killVotes = {};
    let protectedPlayer = null;

    // Count Wasp votes
    Object.entries(game.nightActions).forEach(([userId, action]) => {
        if (action.action === 'kill') {
            killVotes[action.target] = (killVotes[action.target] || 0) + 1;
        } else if (action.action === 'protect') {
            protectedPlayer = action.target;
        }
    });

    // Determine who was killed
    let killedPlayer = null;
    if (Object.keys(killVotes).length > 0) {
        // Find player with most votes
        const maxVotes = Math.max(...Object.values(killVotes));
        const topTargets = Object.keys(killVotes).filter(id => killVotes[id] === maxVotes);

        // If tie, random selection
        const targetId = topTargets[Math.floor(Math.random() * topTargets.length)];

        // Check if protected
        if (targetId !== protectedPlayer) {
            killedPlayer = game.players.find(p => p.id === targetId);
            if (killedPlayer) {
                killedPlayer.alive = false;
            }
        }
    }

    // Announce results
    const dawnEmbed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('☀️ Dawn Breaks Over the Hive')
        .setTimestamp();

    if (killedPlayer) {
        dawnEmbed.setDescription(`The bees wake to find **${killedPlayer.displayName}** has been eliminated during the night! 💀\n\n*Their role will be revealed at the end of the game.*`);
    } else {
        dawnEmbed.setDescription('The bees wake to find everyone safe! The Beekeeper must have protected someone. 🛡️');
    }

    await channel.send({ embeds: [dawnEmbed] });

    // Check win condition
    if (checkWinCondition(game, client)) {
        return;
    }

    // Start day phase
    game.phase = 'day';
    game.phaseEndTime = Date.now() + DAY_DISCUSSION_DURATION;

    const dayEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('☀️ Day Discussion Phase')
        .setDescription(`Discuss amongst yourselves and try to figure out who the Wasps are!\n\nVoting will begin in ${DAY_DISCUSSION_DURATION / 1000} seconds.`)
        .setTimestamp();

    await channel.send({ embeds: [dayEmbed] });

    await updateGameDisplay(game, client);

    // Set timer for voting phase
    game.phaseTimer = setTimeout(async () => {
        await startVotingPhase(game, client);
    }, DAY_DISCUSSION_DURATION);
}

// Start voting phase
async function startVotingPhase(game, client) {
    if (game.phase !== 'day') return;

    game.phase = 'voting';
    game.phaseEndTime = Date.now() + VOTING_DURATION;
    game.votes = {};

    const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);

    const votingEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🗳️ Voting Phase')
        .setDescription('Vote for who you think is a Wasp! The player with the most votes will be eliminated.')
        .setTimestamp();

    await channel.send({ embeds: [votingEmbed] });

    await updateGameDisplay(game, client);

    // Set timer for vote results
    game.phaseTimer = setTimeout(async () => {
        await endVotingPhase(game, client);
    }, VOTING_DURATION);
}

// End voting phase
async function endVotingPhase(game, client) {
    if (game.phase !== 'voting') return;

    const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);

    // Tally votes
    const voteCounts = {};
    Object.values(game.votes).forEach(targetId => {
        if (targetId !== 'skip') {
            voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
        }
    });

    let eliminatedPlayer = null;

    if (Object.keys(voteCounts).length > 0) {
        const maxVotes = Math.max(...Object.values(voteCounts));
        const topTargets = Object.keys(voteCounts).filter(id => voteCounts[id] === maxVotes);

        // If tie and at least 2 votes, random selection, otherwise no elimination
        if (maxVotes >= 2) {
            const targetId = topTargets[Math.floor(Math.random() * topTargets.length)];
            eliminatedPlayer = game.players.find(p => p.id === targetId);
            if (eliminatedPlayer) {
                eliminatedPlayer.alive = false;
            }
        }
    }

    // Announce results
    const resultsEmbed = new EmbedBuilder()
        .setColor('#FF4500')
        .setTitle('🗳️ Voting Results')
        .setTimestamp();

    if (eliminatedPlayer) {
        resultsEmbed.setDescription(`**${eliminatedPlayer.displayName}** has been voted out by the hive! 💀\n\n*Their role will be revealed at the end of the game.*`);
    } else {
        resultsEmbed.setDescription('No one received enough votes to be eliminated. The hive remains uncertain...');
    }

    // Show vote breakdown
    if (Object.keys(voteCounts).length > 0) {
        const voteBreakdown = Object.entries(voteCounts)
            .map(([targetId, count]) => {
                const player = game.players.find(p => p.id === targetId);
                return `• ${player?.displayName || 'Unknown'}: ${count} vote${count !== 1 ? 's' : ''}`;
            })
            .join('\n');

        resultsEmbed.addFields({
            name: 'Vote Breakdown',
            value: voteBreakdown,
            inline: false
        });
    }

    await channel.send({ embeds: [resultsEmbed] });

    // Check win condition
    if (checkWinCondition(game, client)) {
        return;
    }

    // Start next night phase
    await startNightPhase(game, client);
}

// Check win condition
function checkWinCondition(game, client) {
    const aliveWasps = game.players.filter(p => p.alive && p.role === 'WASP').length;
    const aliveBees = game.players.filter(p => p.alive && p.role !== 'WASP').length;

    if (aliveWasps === 0) {
        endGame(game, client, 'bees');
        return true;
    }

    if (aliveWasps >= aliveBees) {
        endGame(game, client, 'wasps');
        return true;
    }

    return false;
}

// End game
async function endGame(game, client, winner) {
    // Clear timers
    if (game.phaseTimer) {
        clearTimeout(game.phaseTimer);
    }

    const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);

    // Create results embed
    const resultsEmbed = new EmbedBuilder()
        .setColor(winner === 'bees' ? '#FFD700' : '#8B0000')
        .setTitle(`🎮 Game Over - ${winner === 'bees' ? 'Bees Win!' : 'Wasps Win!'} 🎮`)
        .setDescription(winner === 'bees' ?
            '🐝 The bees have successfully eliminated all the Wasps! The hive is safe!' :
            '🐝 The Wasps have taken over the hive! The bees have been defeated!')
        .setTimestamp();

    // Show all roles
    const roleReveal = game.players.map(p => {
        const role = ROLES[p.role];
        return `${role.emoji} ${p.displayName} - **${role.name}** ${p.alive ? '✅' : '💀'}`;
    }).join('\n');

    resultsEmbed.addFields({
        name: 'Role Reveals',
        value: roleReveal,
        inline: false
    });

    // Award BobbyBucks to winners
    const winners = game.players.filter(p => {
        if (winner === 'bees') {
            return p.role !== 'WASP';
        } else {
            return p.role === 'WASP';
        }
    });

    for (const player of winners) {
        try {
            await updateBobbyBucks(player.id, WINNER_REWARD);

            // Update stats
            await User.findOneAndUpdate(
                { userId: player.id },
                {
                    $inc: {
                        'mafiaStats.gamesPlayed': 1,
                        'mafiaStats.gamesWon': 1
                    },
                    $addToSet: { 'mafiaStats.rolesPlayed': ROLES[player.role].name }
                },
                { upsert: true }
            );
        } catch (error) {
            console.error(`Error updating stats for ${player.displayName}:`, error);
        }
    }

    // Update stats for losers
    const losers = game.players.filter(p => !winners.includes(p));
    for (const player of losers) {
        try {
            await User.findOneAndUpdate(
                { userId: player.id },
                {
                    $inc: { 'mafiaStats.gamesPlayed': 1 },
                    $addToSet: { 'mafiaStats.rolesPlayed': ROLES[player.role].name }
                },
                { upsert: true }
            );
        } catch (error) {
            console.error(`Error updating stats for ${player.displayName}:`, error);
        }
    }

    resultsEmbed.addFields({
        name: '💰 Rewards',
        value: `${winners.map(p => p.displayName).join(', ')} each received **${WINNER_REWARD} BobbyBucks**!`,
        inline: false
    });

    await channel.send({ embeds: [resultsEmbed] });

    // Clean up
    game.players.forEach(p => playerGameMap.delete(p.id));
    activeGames.delete(game.id);
}

module.exports = (client) => {
    console.log('🐝 Mafia Handler loaded!');

    // Handle !createmafia command
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // Only run in target guild
        if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

        const args = message.content.split(' ');
        const command = args[0].toLowerCase();

        if (command === '!createmafia') {
            // Check if already in a game
            if (playerGameMap.has(message.author.id)) {
                return message.reply('You are already in an active game!');
            }

            // Check if user is in voice channel
            const member = message.member;
            if (!member.voice.channel || member.voice.channel.id !== MAFIA_VC_ID) {
                return message.reply(`You must be in the Mafia voice channel (<#${MAFIA_VC_ID}>) to create a game!`);
            }

            // Get all members in voice channel
            const voiceChannel = member.voice.channel;
            const members = Array.from(voiceChannel.members.values());
            const humanMembers = members.filter(m => !m.user.bot);

            if (humanMembers.length < MIN_PLAYERS) {
                return message.reply(`Not enough players! You need at least ${MIN_PLAYERS} players in the voice channel to start a game.`);
            }

            // Check if any players are already in a game
            const playersInGame = humanMembers.filter(m => playerGameMap.has(m.user.id));
            if (playersInGame.length > 0) {
                return message.reply(`Some players are already in an active game: ${playersInGame.map(m => m.displayName).join(', ')}`);
            }

            // Create game
            const gameId = `mafia_${Date.now()}`;
            const players = humanMembers.map(m => ({
                id: m.user.id,
                username: m.user.username,
                displayName: m.displayName || m.user.username,
                alive: true,
                role: null
            }));

            const game = {
                id: gameId,
                channelId: MAFIA_TEXT_CHANNEL_ID,
                messageId: null,
                players: players,
                phase: 'setup',
                phaseEndTime: null,
                nightActions: {},
                votes: {},
                phaseTimer: null
            };

            // Assign roles
            const roleDistribution = getRoleDistribution(players.length);
            const shuffledRoles = shuffleArray(roleDistribution);

            for (let i = 0; i < players.length; i++) {
                players[i].role = shuffledRoles[i];
            }

            activeGames.set(gameId, game);
            players.forEach(p => playerGameMap.set(p.id, gameId));

            // Send initial message
            const channel = await client.channels.fetch(MAFIA_TEXT_CHANNEL_ID);
            const setupEmbed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🐝 Bee Mafia Game Starting! 🐝')
                .setDescription(`A game has been created with **${players.length} players**!\n\nRoles are being assigned... Check your DMs!`)
                .addFields({
                    name: 'Players',
                    value: players.map(p => `• ${p.displayName}`).join('\n'),
                    inline: false
                })
                .setTimestamp();

            const gameMessage = await channel.send({ embeds: [setupEmbed] });
            game.messageId = gameMessage.id;

            // Send role DMs
            await sendRoleDMs(game, client);

            // Wait 30 seconds then start night phase
            await channel.send(`The night phase will begin in ${SETUP_DELAY / 1000} seconds...`);

            setTimeout(async () => {
                await startNightPhase(game, client);
            }, SETUP_DELAY);
        }

        // Handle DMs for night actions
        if (message.channel.type === 1) { // DM channel
            const gameId = playerGameMap.get(message.author.id);
            if (!gameId) return;

            const game = activeGames.get(gameId);
            if (!game || game.phase !== 'night') return;

            await processNightAction(message.author.id, message, game, client);
        }
    });

    // Handle button interactions
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        const [action, gameId, targetId] = interaction.customId.split('_');

        if (action === 'mafiavote') {
            const game = activeGames.get(gameId);

            if (!game) {
                return interaction.reply({
                    content: 'This game is no longer active.',
                    ephemeral: true
                });
            }

            if (game.phase !== 'voting') {
                return interaction.reply({
                    content: 'It is not voting time!',
                    ephemeral: true
                });
            }

            const player = game.players.find(p => p.id === interaction.user.id);
            if (!player) {
                return interaction.reply({
                    content: 'You are not in this game!',
                    ephemeral: true
                });
            }

            if (!player.alive) {
                return interaction.reply({
                    content: 'Dead players cannot vote!',
                    ephemeral: true
                });
            }

            // Record vote
            game.votes[interaction.user.id] = targetId;

            if (targetId === 'skip') {
                await interaction.reply({
                    content: 'You voted to skip elimination.',
                    ephemeral: true
                });
            } else {
                const target = game.players.find(p => p.id === targetId);
                await interaction.reply({
                    content: `You voted for **${target.displayName}**.`,
                    ephemeral: true
                });
            }

            // Update display
            await updateGameDisplay(game, client);

            // Check if all alive players have voted
            const alivePlayers = game.players.filter(p => p.alive);
            const votedPlayers = Object.keys(game.votes).length;

            if (votedPlayers === alivePlayers.length) {
                // Everyone voted, end phase early
                clearTimeout(game.phaseTimer);
                await endVotingPhase(game, client);
            }
        }
    });
};
