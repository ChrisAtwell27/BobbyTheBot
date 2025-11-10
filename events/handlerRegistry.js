/**
 * Handler Registry
 * This file initializes all handlers and registers them with the centralized routers
 * to reduce CPU usage by eliminating duplicate event listeners.
 */

const { loggingChannelId, alertChannelId, alertKeywords, changelogChannelId } = require('../data/config');

module.exports = (client, commandRouter, interactionRouter) => {
    console.log('📋 Registering handlers with centralized routers...');

    // Initialize slash command handler (integrates with interaction router)
    require('../commands/slashCommandHandler')(client, interactionRouter);

    // ==========================================
    // HANDLERS THAT NEED THEIR OWN LISTENERS
    // (These monitor specific events other than messageCreate/interactionCreate)
    // ==========================================

    // Message reaction handler - monitors reactions
    require('./messageReactionHandler')(client);

    // Logging handler - monitors message delete/update, bans
    require('./loggingHandler')(client, loggingChannelId);

    // Member count handler - monitors member joins, voice state updates
    require('./memberCountHandler')(client);

    // Booster role handler - monitors member/role updates, voice state
    require('./boosterRoleHandler')(client);

    // Changelog handler - special initialization
    require('./changelogHandler')(client, changelogChannelId);

    // Birthday handler
    require('./birthdayHandler')(client);

    // ==========================================
    // MESSAGE PROCESSORS
    // (These need to see ALL messages, not just commands)
    // ==========================================

    // Alert handler - monitors for keywords in all messages
    const alertHandler = require('./alertHandler');
    const alertProcessor = createMessageProcessor(client, alertHandler, alertKeywords, alertChannelId);
    if (alertProcessor) {
        commandRouter.registerMessageProcessor(alertProcessor);
    }

    // Thin ice handler - monitors for profanity in messages containing "bobby"
    const thinIceHandler = require('./thinIceHandler');
    const thinIceProcessor = createMessageProcessor(client, thinIceHandler);
    if (thinIceProcessor) {
        commandRouter.registerMessageProcessor(thinIceProcessor);
    }

    // Bump handler - monitors for DISBOARD bot messages
    const bumpHandler = require('./bumpHandler');
    const bumpProcessor = createMessageProcessor(client, bumpHandler);
    if (bumpProcessor) {
        commandRouter.registerMessageProcessor(bumpProcessor);
    }

    // Ask handler - responds when messages contain "bobby"
    const askHandler = require('./askHandler');
    const askProcessor = createMessageProcessor(client, askHandler);
    if (askProcessor) {
        commandRouter.registerMessageProcessor(askProcessor);
    }

    // Interaction handler - provides intelligent command suggestions
    const interactionHandler = require('./interactionHandler');
    const interactionProcessor = createMessageProcessor(client, interactionHandler);
    if (interactionProcessor) {
        commandRouter.registerMessageProcessor(interactionProcessor);
    }

    // ==========================================
    // COMMAND HANDLERS
    // (These respond to specific ! commands)
    // ==========================================

    // Help handler - !help, !commands, !cmdlist, !commandlist
    registerCommandHandler(client, commandRouter, interactionRouter, './helpHandler',
        ['help', 'commands', 'cmdlist', 'commandlist']);

    // Valorant rank role handler - !setrankroles, !rankroles, etc.
    registerCommandHandler(client, commandRouter, interactionRouter, './valorantRankRoleHandler');

    // Debug emoji handler - !emojis, !testemoji
    registerCommandHandler(client, commandRouter, interactionRouter, './debugEmojiHandler');

    // Eggbuck handler - !balance, !daily, !give, etc.
    registerCommandHandler(client, commandRouter, interactionRouter, './eggbuckHandler');

    // Gambling handler - !flip, !roulette, !dice, !slots
    registerCommandHandler(client, commandRouter, interactionRouter, './gamblingHandler');

    // Blackjack handler - !blackjack, !bj, !hit, !stand
    registerCommandHandler(client, commandRouter, interactionRouter, './blackjackHandler');

    // Clip handler - !submitclip, !clips
    registerCommandHandler(client, commandRouter, interactionRouter, './clipHandler');

    // Valorant team handler - !team, !createteam
    registerCommandHandler(client, commandRouter, interactionRouter, './valorantTeamHandler');

    // Russian roulette handler - !roulette, !spin
    registerCommandHandler(client, commandRouter, interactionRouter, './russianRouletteHandler');

    // Gladiator handler - !gladiator, !fight
    registerCommandHandler(client, commandRouter, interactionRouter, './gladiatorHandler');

    // Virtual pet handler - !adopt, !pet, !feed
    registerCommandHandler(client, commandRouter, interactionRouter, './virtualPetHandler');

    // KOTH handler - !koth, !king
    registerCommandHandler(client, commandRouter, interactionRouter, './kothHandler');

    // Moderation handler - !kick, !ban, !timeout
    registerCommandHandler(client, commandRouter, interactionRouter, './moderationHandler');

    // Valorant map handler - !map, !mapvote
    registerCommandHandler(client, commandRouter, interactionRouter, './valorantMapHandler');

    // Valorant in-house handler - !inhouse
    registerCommandHandler(client, commandRouter, interactionRouter, './valorantInhouseHandler');

    // Wordle handler - !wordle, !guess
    registerCommandHandler(client, commandRouter, interactionRouter, './wordleHandler');

    // Trivia handler - !trivia
    registerCommandHandler(client, commandRouter, interactionRouter, './triviaHandler');

    // Bounty handler - !bounty, !claim
    registerCommandHandler(client, commandRouter, interactionRouter, './bountyHandler');

    // Mafia handler - !createmafia, !join, !vote, etc.
    const mafiaHandler = require('./mafiaHandler');
    const mafiaWrapper = createHandlerWrapper(client, () => mafiaHandler);
    if (mafiaWrapper.messageHandler) {
        commandRouter.registerMessageProcessor(mafiaWrapper.messageHandler);
    }
    if (mafiaWrapper.interactionHandler) {
        // Mafia uses custom interaction handling
        interactionRouter.registerButton('mafia_', mafiaWrapper.interactionHandler);
        interactionRouter.registerButton('bee_mafia_', mafiaWrapper.interactionHandler);
        interactionRouter.registerSelectMenu('mafia_', mafiaWrapper.interactionHandler);
    }

    // Valorant API handler - special initialization
    try {
        const valorantApiHandler = require('./valorantApiHandler');
        const valorantApiWrapper = createHandlerWrapper(client, () => ({ init: valorantApiHandler.init }));
        if (valorantApiHandler.init) {
            valorantApiHandler.init(client, commandRouter, interactionRouter);
        }
    } catch (error) {
        console.log('⚠️  Valorant API handler skipped:', error.message);
    }

    console.log('✅ All handlers registered with routers');
    console.log(`   Total commands: ${commandRouter.getCommandCount()}`);
    console.log(`   Total processors: ${commandRouter.getProcessorCount()}`);

    // Return the mafiaHandler for external use (webhook API)
    return {
        mafiaHandler
    };
};

/**
 * Creates a message processor from a handler that exports a function
 */
function createMessageProcessor(client, handlerModule, ...args) {
    // Create a mock client that captures the messageCreate listener
    let capturedListener = null;
    const mockClient = {
        on: (event, listener) => {
            if (event === 'messageCreate') {
                capturedListener = listener;
            }
        },
        once: client.once.bind(client),
        setMaxListeners: () => {},
        // Pass through other client properties
        user: client.user,
        users: client.users,
        guilds: client.guilds,
        channels: client.channels,
        ws: client.ws
    };

    // Initialize the handler with the mock client
    try {
        handlerModule(mockClient, ...args);
        return capturedListener;
    } catch (error) {
        console.error(`Failed to create message processor:`, error);
        return null;
    }
}

/**
 * Creates a wrapper for a handler and registers it with routers
 */
function createHandlerWrapper(client, handlerGetter) {
    let messageListener = null;
    let interactionListener = null;

    const mockClient = {
        on: (event, listener) => {
            if (event === 'messageCreate') {
                messageListener = listener;
            } else if (event === 'interactionCreate') {
                interactionListener = listener;
            }
        },
        once: client.once.bind(client),
        setMaxListeners: () => {},
        user: client.user,
        users: client.users,
        guilds: client.guilds,
        channels: client.channels,
        ws: client.ws
    };

    try {
        const handler = handlerGetter();
        if (typeof handler === 'function') {
            handler(mockClient);
        } else if (handler.init) {
            handler.init(mockClient);
        }

        return {
            messageHandler: messageListener,
            interactionHandler: interactionListener
        };
    } catch (error) {
        console.error(`Failed to create handler wrapper:`, error);
        return {};
    }
}

/**
 * Registers a handler with both command and interaction routers
 */
function registerCommandHandler(client, commandRouter, interactionRouter, handlerPath, commandAliases = null) {
    try {
        const handler = require(handlerPath);
        const wrapper = createHandlerWrapper(client, () => handler);

        // Register message handler as a processor
        if (wrapper.messageHandler) {
            commandRouter.registerMessageProcessor(wrapper.messageHandler);
        }

        // Register interaction handler
        if (wrapper.interactionHandler) {
            // Most handlers use custom IDs that we need to discover
            // For now, just register as a general processor
            // TODO: Extract specific button/select menu IDs from each handler
        }

        return wrapper;
    } catch (error) {
        console.error(`Failed to register handler ${handlerPath}:`, error);
        return null;
    }
}
