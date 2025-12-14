/**
 * Tournament Handler
 * Manages tournament brackets for external games
 * Supports single elimination, double elimination, and round robin formats
 */

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    PermissionsBitField,
    ChannelType,
    AttachmentBuilder,
} = require("discord.js");
const { getConvexClient } = require("../database/convexClient");
const { api } = require("../convex/_generated/api");
const { generateBracket, getRoundName, calculateRoundRobinStandings } = require("../utils/bracketGenerator");
const { createBracketVisualization, getTournamentTypeDisplay, getTeamSizeDisplay } = require("../utils/bracketVisualizer");
const { hasAdminPermission } = require("../utils/adminPermissions");
const { checkSubscription, createUpgradeEmbed, TIERS } = require("../utils/subscriptionUtils");

// Store active tournament timers (Map of tournamentId -> { closeTimer, startTimer })
const tournamentTimers = new Map();

// Colors
const COLORS = {
    open: "#00ff88",
    closed: "#ffaa00",
    active: "#5865f2",
    completed: "#888888",
    cancelled: "#ff4654",
};

module.exports = (client) => {
    const convex = getConvexClient();

    // =====================================================================
    // HELPER FUNCTIONS
    // =====================================================================

    /**
     * Build tournament embed
     */
    async function buildTournamentEmbed(tournament, participants, guildId) {
        const embed = new EmbedBuilder()
            .setTitle(`🏆 ${tournament.name}`)
            .setColor(COLORS[tournament.status] || COLORS.open)
            .setTimestamp();

        if (tournament.description) {
            embed.setDescription(tournament.description);
        }

        // Tournament info
        embed.addFields(
            {
                name: "📋 Type",
                value: getTournamentTypeDisplay(tournament.type),
                inline: true,
            },
            {
                name: "👥 Team Size",
                value: getTeamSizeDisplay(tournament.teamSize),
                inline: true,
            },
            {
                name: "📊 Status",
                value: tournament.status.toUpperCase(),
                inline: true,
            }
        );

        // Participants
        const participantCount = participants?.length || 0;
        const maxText = tournament.maxParticipants ? `/${tournament.maxParticipants}` : "";
        embed.addFields({
            name: "👤 Participants",
            value: `${participantCount}${maxText} registered`,
            inline: true,
        });

        // Times
        const startTime = Math.floor(tournament.startTime / 1000);
        const closeTime = Math.floor(tournament.registrationCloseTime / 1000);
        embed.addFields(
            {
                name: "🔒 Registration Closes",
                value: `<t:${closeTime}:R>`,
                inline: true,
            },
            {
                name: "🚀 Starts",
                value: `<t:${startTime}:R>`,
                inline: true,
            }
        );

        // Participant list (if not too many)
        if (participants && participants.length > 0 && participants.length <= 16) {
            const participantList = participants
                .map((p, i) => {
                    const name = p.teamName || p.username;
                    const eliminated = p.eliminated ? " ~~" : "";
                    const eliminatedEnd = p.eliminated ? "~~ ❌" : "";
                    return `${i + 1}. ${eliminated}${name}${eliminatedEnd}`;
                })
                .join("\n");

            embed.addFields({
                name: "📝 Registered",
                value: participantList || "None yet",
                inline: false,
            });
        }

        // Winner (if completed)
        if (tournament.status === "completed" && tournament.winnerName) {
            embed.addFields({
                name: "🏆 Champion",
                value: `**${tournament.winnerName}**`,
                inline: false,
            });
        }

        embed.setFooter({
            text: `Tournament ID: ${tournament.tournamentId} | Created by ${tournament.creatorName}`,
        });

        return embed;
    }

    /**
     * Build tournament action buttons
     */
    function buildTournamentButtons(tournament, userId, isAdmin, isRegistered) {
        const rows = [];
        const row1 = new ActionRowBuilder();

        if (tournament.status === "open") {
            if (isRegistered) {
                row1.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`tournament_leave_${tournament.tournamentId}`)
                        .setLabel("Leave Tournament")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("🚪")
                );
            } else {
                row1.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`tournament_join_${tournament.tournamentId}`)
                        .setLabel("Join Tournament")
                        .setStyle(ButtonStyle.Success)
                        .setEmoji("✅")
                );
            }

            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`tournament_info_${tournament.tournamentId}`)
                    .setLabel("View Bracket")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji("📊")
            );

            if (isAdmin) {
                row1.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`tournament_start_${tournament.tournamentId}`)
                        .setLabel("Force Start")
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("▶️")
                );
                row1.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`tournament_cancel_${tournament.tournamentId}`)
                        .setLabel("Cancel")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("❌")
                );
            }
        } else if (tournament.status === "closed" || tournament.status === "active") {
            row1.addComponents(
                new ButtonBuilder()
                    .setCustomId(`tournament_bracket_${tournament.tournamentId}`)
                    .setLabel("View Bracket")
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("📊")
            );

            if (isAdmin && tournament.status === "active") {
                row1.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`tournament_cancel_${tournament.tournamentId}`)
                        .setLabel("Cancel Tournament")
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji("❌")
                );
            }
        }

        if (row1.components.length > 0) {
            rows.push(row1);
        }

        return rows;
    }

    /**
     * Build match thread embed and buttons
     */
    function buildMatchEmbed(match, tournament) {
        const embed = new EmbedBuilder()
            .setTitle(`⚔️ ${match.participant1Name || "TBD"} vs ${match.participant2Name || "TBD"}`)
            .setColor(COLORS.active)
            .addFields(
                { name: "🏆 Tournament", value: tournament.name, inline: true },
                { name: "📋 Round", value: getRoundName(match.round, 0, match.bracketType), inline: true },
                { name: "📊 Match", value: `#${match.matchNumber}`, inline: true }
            )
            .setDescription("Report the winner when your match is complete.\n\n**Both participants must confirm the result.**");

        if (match.reportedWinnerId) {
            const reportedName = match.reportedWinnerId === match.participant1Id
                ? match.participant1Name
                : match.participant2Name;
            embed.addFields({
                name: "⏳ Pending Confirmation",
                value: `**${reportedName}** reported as winner.\nAwaiting confirmation from opponent.`,
                inline: false,
            });
        }

        return embed;
    }

    /**
     * Build match report buttons
     */
    function buildMatchButtons(match) {
        const row = new ActionRowBuilder();

        if (match.status !== "completed" && !match.reportedWinnerId) {
            // Report winner buttons
            if (match.participant1Id) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`tournament_match_p1_${match.matchId}`)
                        .setLabel(`${match.participant1Name} Won`)
                        .setStyle(ButtonStyle.Primary)
                );
            }
            if (match.participant2Id) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`tournament_match_p2_${match.matchId}`)
                        .setLabel(`${match.participant2Name} Won`)
                        .setStyle(ButtonStyle.Primary)
                );
            }
        } else if (match.reportedWinnerId && match.status !== "completed") {
            // Confirm/Dispute buttons
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`tournament_match_confirm_${match.matchId}`)
                    .setLabel("Confirm Result")
                    .setStyle(ButtonStyle.Success)
                    .setEmoji("✅"),
                new ButtonBuilder()
                    .setCustomId(`tournament_match_dispute_${match.matchId}`)
                    .setLabel("Dispute")
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji("⚠️")
            );
        }

        return row.components.length > 0 ? row : null;
    }

    /**
     * Parse time string to milliseconds from now
     * Supports: "1h", "2h30m", "30m", "tomorrow 8pm", "12/25 3pm"
     */
    function parseTimeString(timeStr) {
        const now = Date.now();
        const lower = timeStr.toLowerCase().trim();

        // Relative time: "1h", "2h30m", "30m"
        const relativeMatch = lower.match(/^(\d+)h(?:(\d+)m)?$|^(\d+)m$/);
        if (relativeMatch) {
            const hours = parseInt(relativeMatch[1] || 0);
            const mins = parseInt(relativeMatch[2] || relativeMatch[3] || 0);
            return now + (hours * 60 * 60 * 1000) + (mins * 60 * 1000);
        }

        // Try to parse as a date
        const date = new Date(timeStr);
        if (!isNaN(date.getTime()) && date.getTime() > now) {
            return date.getTime();
        }

        return null;
    }

    /**
     * Schedule tournament timers
     */
    function scheduleTournamentTimers(tournament) {
        const now = Date.now();

        // Clear existing timers
        clearTournamentTimers(tournament.tournamentId);

        const timers = {};

        // Schedule registration close
        if (tournament.registrationCloseTime > now) {
            timers.closeTimer = setTimeout(async () => {
                await handleRegistrationClose(tournament);
            }, tournament.registrationCloseTime - now);
        }

        // Schedule tournament start
        if (tournament.startTime > now) {
            timers.startTimer = setTimeout(async () => {
                await handleTournamentStart(tournament);
            }, tournament.startTime - now);
        }

        if (Object.keys(timers).length > 0) {
            tournamentTimers.set(tournament.tournamentId, timers);
            console.log(`[Tournament] Scheduled timers for ${tournament.tournamentId}`);
        }
    }

    /**
     * Clear tournament timers
     */
    function clearTournamentTimers(tournamentId) {
        const timers = tournamentTimers.get(tournamentId);
        if (timers) {
            if (timers.closeTimer) clearTimeout(timers.closeTimer);
            if (timers.startTimer) clearTimeout(timers.startTimer);
            tournamentTimers.delete(tournamentId);
        }
    }

    /**
     * Handle registration closing
     */
    async function handleRegistrationClose(tournament) {
        try {
            console.log(`[Tournament] Closing registration for ${tournament.tournamentId}`);

            // Update status
            await convex.mutation(api.tournaments.updateTournamentStatus, {
                guildId: tournament.guildId,
                tournamentId: tournament.tournamentId,
                status: "closed",
            });

            // Get participants
            const participants = await convex.query(api.tournaments.getParticipants, {
                guildId: tournament.guildId,
                tournamentId: tournament.tournamentId,
            });

            if (participants.length < 2) {
                // Not enough participants - cancel
                await convex.mutation(api.tournaments.cancelTournament, {
                    guildId: tournament.guildId,
                    tournamentId: tournament.tournamentId,
                });

                const channel = await client.channels.fetch(tournament.channelId).catch(() => null);
                if (channel) {
                    await channel.send({
                        content: `❌ Tournament **${tournament.name}** has been cancelled due to insufficient participants (need at least 2).`,
                    });
                }
                return;
            }

            // Generate bracket
            const bracketData = generateBracket(tournament.type, participants);

            // Save matches to database
            await convex.mutation(api.tournaments.createMatches, {
                guildId: tournament.guildId,
                tournamentId: tournament.tournamentId,
                matches: bracketData.matches,
            });

            // Create bracket visualization
            const bracketBuffer = await createBracketVisualization(tournament, bracketData.matches, participants);
            const attachment = new AttachmentBuilder(bracketBuffer, { name: "bracket.png" });

            // Post in channel
            const channel = await client.channels.fetch(tournament.channelId).catch(() => null);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle(`🔒 Registration Closed - ${tournament.name}`)
                    .setDescription(`**${participants.length}** participants registered.\n\nTournament starts <t:${Math.floor(tournament.startTime / 1000)}:R>`)
                    .setColor(COLORS.closed)
                    .setImage("attachment://bracket.png");

                await channel.send({
                    embeds: [embed],
                    files: [attachment],
                });
            }
        } catch (error) {
            console.error("[Tournament] Error closing registration:", error);
        }
    }

    /**
     * Handle tournament start
     */
    async function handleTournamentStart(tournament) {
        try {
            console.log(`[Tournament] Starting tournament ${tournament.tournamentId}`);

            // Update status to active
            await convex.mutation(api.tournaments.updateTournamentStatus, {
                guildId: tournament.guildId,
                tournamentId: tournament.tournamentId,
                status: "active",
            });

            // Update current round
            await convex.mutation(api.tournaments.updateCurrentRound, {
                guildId: tournament.guildId,
                tournamentId: tournament.tournamentId,
                currentRound: 1,
            });

            // Get ready matches for round 1
            const allMatches = await convex.query(api.tournaments.getMatches, {
                guildId: tournament.guildId,
                tournamentId: tournament.tournamentId,
            });

            const readyMatches = allMatches.filter(m =>
                (m.status === "ready" && m.round === 1) ||
                m.status === "bye"
            );

            // Get channel
            const channel = await client.channels.fetch(tournament.channelId).catch(() => null);
            if (!channel) return;

            // Announce start
            await channel.send({
                content: `🚀 **${tournament.name}** has begun! Good luck to all participants!`,
            });

            // Process bye matches first
            for (const match of readyMatches) {
                if (match.status === "bye") {
                    await processByeMatch(tournament, match);
                }
            }

            // Create threads for ready matches
            const actualMatches = readyMatches.filter(m => m.status === "ready");
            for (const match of actualMatches) {
                await createMatchThread(channel, tournament, match);
            }
        } catch (error) {
            console.error("[Tournament] Error starting tournament:", error);
        }
    }

    /**
     * Process a bye match (auto-advance the participant)
     */
    async function processByeMatch(tournament, match) {
        const winnerId = match.participant1Id || match.participant2Id;
        const winnerName = match.participant1Name || match.participant2Name;

        if (!winnerId) return;

        // Auto-confirm the bye
        await convex.mutation(api.tournaments.confirmMatchWinner, {
            guildId: tournament.guildId,
            tournamentId: tournament.tournamentId,
            matchId: match.matchId,
            confirmedBy: "SYSTEM",
        });
    }

    /**
     * Create a match thread
     */
    async function createMatchThread(channel, tournament, match) {
        try {
            const threadName = `Match ${match.round}-${match.matchNumber}: ${match.participant1Name} vs ${match.participant2Name}`;

            const thread = await channel.threads.create({
                name: threadName.slice(0, 100),
                autoArchiveDuration: 60,
                reason: `Tournament match thread for ${tournament.name}`,
            });

            // Update match with thread ID
            await convex.mutation(api.tournaments.updateMatch, {
                guildId: tournament.guildId,
                tournamentId: tournament.tournamentId,
                matchId: match.matchId,
                threadId: thread.id,
                status: "in_progress",
            });

            // Build mentions for participants
            let mentions = "";
            if (match.participant1Id) mentions += `<@${match.participant1Id.split("_")[0] || match.participant1Id}> `;
            if (match.participant2Id) mentions += `<@${match.participant2Id.split("_")[0] || match.participant2Id}>`;

            const embed = buildMatchEmbed(match, tournament);
            const buttons = buildMatchButtons(match);

            const components = buttons ? [buttons] : [];
            await thread.send({
                content: mentions ? `🏆 **Match Starting!**\n${mentions}` : "🏆 **Match Starting!**",
                embeds: [embed],
                components,
            });

            return thread;
        } catch (error) {
            console.error("[Tournament] Error creating match thread:", error);
            return null;
        }
    }

    /**
     * Delete match thread after delay
     */
    async function deleteMatchThread(threadId, delay = 30000) {
        setTimeout(async () => {
            try {
                const thread = await client.channels.fetch(threadId).catch(() => null);
                if (thread) {
                    await thread.delete("Match completed");
                }
            } catch (error) {
                console.error("[Tournament] Error deleting thread:", error);
            }
        }, delay);
    }

    /**
     * Check if tournament is complete
     */
    async function checkTournamentComplete(tournament) {
        const matches = await convex.query(api.tournaments.getMatches, {
            guildId: tournament.guildId,
            tournamentId: tournament.tournamentId,
        });

        const incomplete = matches.filter(m =>
            m.status !== "completed" && m.status !== "bye"
        );

        if (incomplete.length === 0) {
            // Find the final match
            const finalMatch = matches.find(m =>
                m.bracketType === "grand_finals" || !m.nextMatchId
            );

            if (finalMatch && finalMatch.winnerId) {
                // Tournament complete!
                await convex.mutation(api.tournaments.setTournamentWinner, {
                    guildId: tournament.guildId,
                    tournamentId: tournament.tournamentId,
                    winnerId: finalMatch.winnerId,
                    winnerName: finalMatch.winnerName,
                });

                const channel = await client.channels.fetch(tournament.channelId).catch(() => null);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle(`🏆 Tournament Complete - ${tournament.name}`)
                        .setDescription(`**${finalMatch.winnerName}** is the champion!`)
                        .setColor(COLORS.completed);

                    await channel.send({ embeds: [embed] });
                }

                return true;
            }
        }

        return false;
    }

    /**
     * Start next round matches
     */
    async function startNextRoundMatches(tournament, completedMatch) {
        // Check if there's a next match that's now ready
        if (completedMatch.nextMatchId) {
            const nextMatch = await convex.query(api.tournaments.getMatch, {
                guildId: tournament.guildId,
                tournamentId: tournament.tournamentId,
                matchId: completedMatch.nextMatchId,
            });

            if (nextMatch && nextMatch.status === "ready") {
                const channel = await client.channels.fetch(tournament.channelId).catch(() => null);
                if (channel) {
                    await createMatchThread(channel, tournament, nextMatch);
                }
            }
        }
    }

    // =====================================================================
    // MESSAGE HANDLER
    // =====================================================================

    client.on("messageCreate", async (message) => {
        if (message.author.bot || !message.guild) return;

        const content = message.content.toLowerCase().trim();
        const guildId = message.guild.id;

        // !tournament create <name>
        if (content.startsWith("!tournament create ") || content.startsWith("!tour create ")) {
            const name = message.content.split(/create\s+/i)[1]?.trim();
            if (!name) {
                return message.reply("Please provide a tournament name: `!tournament create <name>`");
            }

            // Check admin
            const isAdmin = await hasAdminPermission(guildId, message.author.id, message.member);
            if (!isAdmin) {
                return message.reply("❌ Only admins can create tournaments.");
            }

            // Check subscription
            const subscription = await checkSubscription(guildId, message.author.id);
            if (!subscription || subscription.tier === "free") {
                const embed = createUpgradeEmbed(
                    "Tournament System",
                    "Create and manage tournament brackets",
                    TIERS.PLUS
                );
                return message.reply({ embeds: [embed] });
            }

            // Show modal for tournament config
            // Since we can't show modal from message, use select menus
            const typeSelect = new StringSelectMenuBuilder()
                .setCustomId(`tournament_create_type_${Date.now()}`)
                .setPlaceholder("Select tournament type")
                .addOptions([
                    { label: "Single Elimination", value: "single_elim", description: "Standard knockout bracket" },
                    { label: "Double Elimination", value: "double_elim", description: "Winners & losers brackets" },
                    { label: "Round Robin", value: "round_robin", description: "Everyone plays everyone" },
                ]);

            const row = new ActionRowBuilder().addComponents(typeSelect);

            // Store pending tournament data
            const pendingId = `pending_${Date.now()}`;
            client.pendingTournaments = client.pendingTournaments || new Map();
            client.pendingTournaments.set(pendingId, {
                name,
                guildId,
                channelId: message.channel.id,
                creatorId: message.author.id,
                creatorName: message.author.username,
                step: "type",
            });

            const embed = new EmbedBuilder()
                .setTitle("🏆 Create Tournament")
                .setDescription(`**${name}**\n\nSelect the tournament format:`)
                .setColor(COLORS.open);

            const msg = await message.reply({ embeds: [embed], components: [row] });

            // Store message ID for cleanup
            const pending = client.pendingTournaments.get(pendingId);
            pending.messageId = msg.id;
            pending.selectId = typeSelect.data.custom_id;

            return;
        }

        // !tournament list
        if (content === "!tournament list" || content === "!tour list" || content === "!tournaments") {
            const tournaments = await convex.query(api.tournaments.getActiveTournaments, { guildId });

            if (tournaments.length === 0) {
                return message.reply("No active tournaments. Create one with `!tournament create <name>`");
            }

            const embed = new EmbedBuilder()
                .setTitle("🏆 Active Tournaments")
                .setColor(COLORS.open);

            for (const t of tournaments.slice(0, 10)) {
                const startTime = Math.floor(t.startTime / 1000);
                embed.addFields({
                    name: t.name,
                    value: `${getTournamentTypeDisplay(t.type)} | ${getTeamSizeDisplay(t.teamSize)}\nStatus: ${t.status} | Starts: <t:${startTime}:R>\nID: \`${t.tournamentId}\``,
                    inline: false,
                });
            }

            return message.reply({ embeds: [embed] });
        }

        // !tournament info <id>
        if (content.startsWith("!tournament info ") || content.startsWith("!tour info ")) {
            const tournamentId = content.split(/info\s+/i)[1]?.trim();
            if (!tournamentId) {
                return message.reply("Please provide a tournament ID: `!tournament info <id>`");
            }

            const tournament = await convex.query(api.tournaments.getTournament, {
                guildId,
                tournamentId,
            });

            if (!tournament) {
                return message.reply("Tournament not found.");
            }

            const participants = await convex.query(api.tournaments.getParticipants, {
                guildId,
                tournamentId,
            });

            const isAdmin = await hasAdminPermission(guildId, message.author.id, message.member);
            const isRegistered = participants.some(p => p.userId === message.author.id);

            const embed = await buildTournamentEmbed(tournament, participants, guildId);
            const buttons = buildTournamentButtons(tournament, message.author.id, isAdmin, isRegistered);

            return message.reply({ embeds: [embed], components: buttons });
        }

        // !tournament cancel <id>
        if (content.startsWith("!tournament cancel ") || content.startsWith("!tour cancel ")) {
            const tournamentId = content.split(/cancel\s+/i)[1]?.trim();
            if (!tournamentId) {
                return message.reply("Please provide a tournament ID: `!tournament cancel <id>`");
            }

            const isAdmin = await hasAdminPermission(guildId, message.author.id, message.member);
            if (!isAdmin) {
                return message.reply("❌ Only admins can cancel tournaments.");
            }

            try {
                await convex.mutation(api.tournaments.cancelTournament, {
                    guildId,
                    tournamentId,
                });

                clearTournamentTimers(tournamentId);

                return message.reply(`✅ Tournament \`${tournamentId}\` has been cancelled.`);
            } catch (error) {
                return message.reply(`❌ ${error.message}`);
            }
        }
    });

    // =====================================================================
    // INTERACTION HANDLER
    // =====================================================================

    client.on("interactionCreate", async (interaction) => {
        if (!interaction.guild) return;

        const guildId = interaction.guild.id;

        // Handle tournament creation flow select menus
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith("tournament_create_")) {
            const pendingTournaments = client.pendingTournaments || new Map();

            // Find the pending tournament
            let pendingId = null;
            let pending = null;
            for (const [id, p] of pendingTournaments.entries()) {
                if (p.selectId === interaction.customId || p.teamSelectId === interaction.customId || p.timeSelectId === interaction.customId) {
                    pendingId = id;
                    pending = p;
                    break;
                }
            }

            if (!pending) {
                return interaction.reply({ content: "Session expired. Please start again.", ephemeral: true });
            }

            if (pending.step === "type") {
                pending.type = interaction.values[0];
                pending.step = "teamSize";

                const teamSelect = new StringSelectMenuBuilder()
                    .setCustomId(`tournament_create_team_${Date.now()}`)
                    .setPlaceholder("Select team size")
                    .addOptions([
                        { label: "1v1", value: "1" },
                        { label: "2v2", value: "2" },
                        { label: "3v3", value: "3" },
                        { label: "4v4", value: "4" },
                        { label: "5v5", value: "5" },
                    ]);

                pending.teamSelectId = teamSelect.data.custom_id;
                const row = new ActionRowBuilder().addComponents(teamSelect);

                const embed = new EmbedBuilder()
                    .setTitle("🏆 Create Tournament")
                    .setDescription(`**${pending.name}**\nType: ${getTournamentTypeDisplay(pending.type)}\n\nSelect the team size:`)
                    .setColor(COLORS.open);

                return interaction.update({ embeds: [embed], components: [row] });
            }

            if (pending.step === "teamSize") {
                pending.teamSize = parseInt(interaction.values[0]);
                pending.step = "time";

                const timeSelect = new StringSelectMenuBuilder()
                    .setCustomId(`tournament_create_time_${Date.now()}`)
                    .setPlaceholder("Select start time")
                    .addOptions([
                        { label: "In 30 minutes", value: "30m" },
                        { label: "In 1 hour", value: "1h" },
                        { label: "In 2 hours", value: "2h" },
                        { label: "In 3 hours", value: "3h" },
                        { label: "Tomorrow (24h)", value: "24h" },
                    ]);

                pending.timeSelectId = timeSelect.data.custom_id;
                const row = new ActionRowBuilder().addComponents(timeSelect);

                const embed = new EmbedBuilder()
                    .setTitle("🏆 Create Tournament")
                    .setDescription(`**${pending.name}**\nType: ${getTournamentTypeDisplay(pending.type)}\nTeam Size: ${getTeamSizeDisplay(pending.teamSize)}\n\nSelect when the tournament starts:`)
                    .setColor(COLORS.open);

                return interaction.update({ embeds: [embed], components: [row] });
            }

            if (pending.step === "time") {
                const timeStr = interaction.values[0];
                const startTime = parseTimeString(timeStr);

                if (!startTime) {
                    return interaction.reply({ content: "Invalid time format.", ephemeral: true });
                }

                // Create the tournament
                try {
                    const result = await convex.mutation(api.tournaments.createTournament, {
                        guildId: pending.guildId,
                        name: pending.name,
                        type: pending.type,
                        teamSize: pending.teamSize,
                        startTime,
                        channelId: pending.channelId,
                        creatorId: pending.creatorId,
                        creatorName: pending.creatorName,
                    });

                    // Clean up pending
                    pendingTournaments.delete(pendingId);

                    // Get tournament for display
                    const tournament = await convex.query(api.tournaments.getTournament, {
                        guildId: pending.guildId,
                        tournamentId: result.tournamentId,
                    });

                    // Schedule timers
                    scheduleTournamentTimers(tournament);

                    // Build and send embed
                    const embed = await buildTournamentEmbed(tournament, [], pending.guildId);
                    const buttons = buildTournamentButtons(tournament, pending.creatorId, true, false);

                    // Update message ID
                    await convex.mutation(api.tournaments.updateTournamentMessages, {
                        guildId: pending.guildId,
                        tournamentId: result.tournamentId,
                        mainMessageId: interaction.message.id,
                    });

                    return interaction.update({ embeds: [embed], components: buttons });
                } catch (error) {
                    return interaction.reply({ content: `❌ Error creating tournament: ${error.message}`, ephemeral: true });
                }
            }
        }

        // Handle button interactions
        if (interaction.isButton()) {
            const customId = interaction.customId;

            // Join tournament
            if (customId.startsWith("tournament_join_")) {
                const tournamentId = customId.replace("tournament_join_", "");

                try {
                    const tournament = await convex.query(api.tournaments.getTournament, { guildId, tournamentId });
                    if (!tournament) {
                        return interaction.reply({ content: "Tournament not found.", ephemeral: true });
                    }

                    // For team tournaments, we'd need a modal - for now, just solo join
                    await convex.mutation(api.tournaments.joinTournament, {
                        guildId,
                        tournamentId,
                        userId: interaction.user.id,
                        username: interaction.user.username,
                    });

                    // Refresh embed
                    const participants = await convex.query(api.tournaments.getParticipants, { guildId, tournamentId });
                    const isAdmin = await hasAdminPermission(guildId, interaction.user.id, interaction.member);

                    const embed = await buildTournamentEmbed(tournament, participants, guildId);
                    const buttons = buildTournamentButtons(tournament, interaction.user.id, isAdmin, true);

                    await interaction.update({ embeds: [embed], components: buttons });
                } catch (error) {
                    return interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
                }
            }

            // Leave tournament
            if (customId.startsWith("tournament_leave_")) {
                const tournamentId = customId.replace("tournament_leave_", "");

                try {
                    await convex.mutation(api.tournaments.leaveTournament, {
                        guildId,
                        tournamentId,
                        userId: interaction.user.id,
                    });

                    const tournament = await convex.query(api.tournaments.getTournament, { guildId, tournamentId });
                    const participants = await convex.query(api.tournaments.getParticipants, { guildId, tournamentId });
                    const isAdmin = await hasAdminPermission(guildId, interaction.user.id, interaction.member);

                    const embed = await buildTournamentEmbed(tournament, participants, guildId);
                    const buttons = buildTournamentButtons(tournament, interaction.user.id, isAdmin, false);

                    await interaction.update({ embeds: [embed], components: buttons });
                } catch (error) {
                    return interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
                }
            }

            // Force start tournament
            if (customId.startsWith("tournament_start_")) {
                const tournamentId = customId.replace("tournament_start_", "");

                const isAdmin = await hasAdminPermission(guildId, interaction.user.id, interaction.member);
                if (!isAdmin) {
                    return interaction.reply({ content: "❌ Only admins can force start.", ephemeral: true });
                }

                const tournament = await convex.query(api.tournaments.getTournament, { guildId, tournamentId });
                if (!tournament) {
                    return interaction.reply({ content: "Tournament not found.", ephemeral: true });
                }

                const participants = await convex.query(api.tournaments.getParticipants, { guildId, tournamentId });
                if (participants.length < 2) {
                    return interaction.reply({ content: "❌ Need at least 2 participants.", ephemeral: true });
                }

                // Close registration and start
                clearTournamentTimers(tournamentId);
                await handleRegistrationClose(tournament);
                await handleTournamentStart({ ...tournament, status: "closed" });

                return interaction.reply({ content: "✅ Tournament started!", ephemeral: true });
            }

            // Cancel tournament
            if (customId.startsWith("tournament_cancel_")) {
                const tournamentId = customId.replace("tournament_cancel_", "");

                const isAdmin = await hasAdminPermission(guildId, interaction.user.id, interaction.member);
                if (!isAdmin) {
                    return interaction.reply({ content: "❌ Only admins can cancel.", ephemeral: true });
                }

                try {
                    await convex.mutation(api.tournaments.cancelTournament, { guildId, tournamentId });
                    clearTournamentTimers(tournamentId);

                    const embed = new EmbedBuilder()
                        .setTitle("❌ Tournament Cancelled")
                        .setColor(COLORS.cancelled);

                    await interaction.update({ embeds: [embed], components: [] });
                } catch (error) {
                    return interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
                }
            }

            // View bracket
            if (customId.startsWith("tournament_bracket_") || customId.startsWith("tournament_info_")) {
                const tournamentId = customId.replace("tournament_bracket_", "").replace("tournament_info_", "");

                const tournament = await convex.query(api.tournaments.getTournament, { guildId, tournamentId });
                if (!tournament) {
                    return interaction.reply({ content: "Tournament not found.", ephemeral: true });
                }

                const matches = await convex.query(api.tournaments.getMatches, { guildId, tournamentId });
                const participants = await convex.query(api.tournaments.getParticipants, { guildId, tournamentId });

                if (matches.length === 0) {
                    return interaction.reply({ content: "Bracket not generated yet. Wait for registration to close.", ephemeral: true });
                }

                // Sort participants for round robin standings
                const sortedParticipants = tournament.type === "round_robin"
                    ? calculateRoundRobinStandings(participants)
                    : participants;

                const bracketBuffer = await createBracketVisualization(tournament, matches, sortedParticipants);
                const attachment = new AttachmentBuilder(bracketBuffer, { name: "bracket.png" });

                return interaction.reply({ files: [attachment], ephemeral: true });
            }

            // Match winner reports
            if (customId.startsWith("tournament_match_p1_") || customId.startsWith("tournament_match_p2_")) {
                const isP1 = customId.startsWith("tournament_match_p1_");
                const matchId = customId.replace("tournament_match_p1_", "").replace("tournament_match_p2_", "");

                // Find tournament for this match
                const allTournaments = await convex.query(api.tournaments.getActiveTournaments, { guildId });
                let foundMatch = null;
                let foundTournament = null;

                for (const t of allTournaments) {
                    const match = await convex.query(api.tournaments.getMatch, {
                        guildId,
                        tournamentId: t.tournamentId,
                        matchId,
                    });
                    if (match) {
                        foundMatch = match;
                        foundTournament = t;
                        break;
                    }
                }

                if (!foundMatch || !foundTournament) {
                    return interaction.reply({ content: "Match not found.", ephemeral: true });
                }

                // Check if user is a participant
                const isP1User = interaction.user.id === (foundMatch.participant1Id?.split("_")[0] || foundMatch.participant1Id);
                const isP2User = interaction.user.id === (foundMatch.participant2Id?.split("_")[0] || foundMatch.participant2Id);
                const isAdmin = await hasAdminPermission(guildId, interaction.user.id, interaction.member);

                if (!isP1User && !isP2User && !isAdmin) {
                    return interaction.reply({ content: "❌ Only match participants can report results.", ephemeral: true });
                }

                const winnerId = isP1 ? foundMatch.participant1Id : foundMatch.participant2Id;

                await convex.mutation(api.tournaments.reportMatchWinner, {
                    guildId,
                    tournamentId: foundTournament.tournamentId,
                    matchId,
                    winnerId,
                    reportedBy: interaction.user.id,
                });

                // Refresh match data and update embed
                const updatedMatch = await convex.query(api.tournaments.getMatch, {
                    guildId,
                    tournamentId: foundTournament.tournamentId,
                    matchId,
                });

                const embed = buildMatchEmbed(updatedMatch, foundTournament);
                const buttons = buildMatchButtons(updatedMatch);

                await interaction.update({ embeds: [embed], components: buttons ? [buttons] : [] });
            }

            // Confirm match result
            if (customId.startsWith("tournament_match_confirm_")) {
                const matchId = customId.replace("tournament_match_confirm_", "");

                // Find tournament for this match
                const allTournaments = await convex.query(api.tournaments.getActiveTournaments, { guildId });
                let foundMatch = null;
                let foundTournament = null;

                for (const t of allTournaments) {
                    const match = await convex.query(api.tournaments.getMatch, {
                        guildId,
                        tournamentId: t.tournamentId,
                        matchId,
                    });
                    if (match) {
                        foundMatch = match;
                        foundTournament = t;
                        break;
                    }
                }

                if (!foundMatch || !foundTournament) {
                    return interaction.reply({ content: "Match not found.", ephemeral: true });
                }

                // Check if user is the opponent (not the reporter)
                const reportedByP1 = foundMatch.reportedBy === (foundMatch.participant1Id?.split("_")[0] || foundMatch.participant1Id);
                const isP1User = interaction.user.id === (foundMatch.participant1Id?.split("_")[0] || foundMatch.participant1Id);
                const isP2User = interaction.user.id === (foundMatch.participant2Id?.split("_")[0] || foundMatch.participant2Id);
                const isAdmin = await hasAdminPermission(guildId, interaction.user.id, interaction.member);

                // Opponent should confirm, or admin
                const canConfirm = isAdmin ||
                    (reportedByP1 && isP2User) ||
                    (!reportedByP1 && isP1User);

                if (!canConfirm) {
                    return interaction.reply({ content: "❌ Only the opponent or an admin can confirm.", ephemeral: true });
                }

                // Confirm the result
                const result = await convex.mutation(api.tournaments.confirmMatchWinner, {
                    guildId,
                    tournamentId: foundTournament.tournamentId,
                    matchId,
                    confirmedBy: interaction.user.id,
                });

                // Update thread with completion message
                const embed = new EmbedBuilder()
                    .setTitle("✅ Match Complete")
                    .setDescription(`**${result.winnerName}** wins!`)
                    .setColor(COLORS.completed);

                await interaction.update({ embeds: [embed], components: [] });

                // Schedule thread deletion
                if (foundMatch.threadId) {
                    deleteMatchThread(foundMatch.threadId, 30000);
                }

                // Check if tournament is complete
                const isComplete = await checkTournamentComplete(foundTournament);

                // If not complete, start next round matches
                if (!isComplete) {
                    await startNextRoundMatches(foundTournament, foundMatch);
                }
            }

            // Dispute match result
            if (customId.startsWith("tournament_match_dispute_")) {
                const matchId = customId.replace("tournament_match_dispute_", "");

                // For now, just notify that a dispute was raised
                await interaction.reply({
                    content: "⚠️ **Dispute raised!** An admin will need to resolve this match.",
                    ephemeral: false,
                });
            }
        }
    });

    console.log("✅ Tournament handler loaded");
};
