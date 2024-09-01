const { EmbedBuilder } = require('discord.js');

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const userMessage = message.content.toLowerCase();

        // Define interactions
        const interactions = [
            {
                triggers: ["how are you", "how's it going", "how are you doing", "how's your day", "how is your day"],
                responses: [
                    "I'm just a bot, but I'm doing great! Thanks for asking.",
                    "I'm here to help! How about you?",
                    "All systems are operational! How can I assist you today?",
                    "I'm just chilling in the cloud. What's up with you?",
                ]
            },
            {
                triggers: ["what's up", "what is up", "sup", "what's new"],
                responses: [
                    "Not much, just waiting to help you out!",
                    "Just hanging out in the server, you?",
                    "The usual bot stuff. How can I assist you?",
                ]
            },
            {
                triggers: ["hello", "hi", "hey", "hiya", "yo"],
                responses: [
                    "Hello there!",
                    "Hi! How's it going?",
                    "Hey! What can I do for you today?",
                    "Yo! What's up?",
                ]
            },
            {
                triggers: ["thank you", "thanks", "thx", "ty"],
                responses: [
                    "You're welcome!",
                    "Anytime! 😊",
                    "Glad I could help!",
                    "No problem!",
                ]
            },
            {
                triggers: ["who are you", "what are you", "who made you", "who created you"],
                responses: [
                    "I'm BobbyTheBot, your friendly server assistant!",
                    "I was created by some awesome developers to help make your server experience better.",
                    "Just a humble bot, here to serve!",
                ]
            },
            {
                triggers: ["tell me a joke", "joke", "make me laugh"],
                responses: [
                    "Why don’t skeletons fight each other? They don’t have the guts.",
                    "What do you get when you cross a snowman with a vampire? Frostbite!",
                    "Why did the scarecrow win an award? Because he was outstanding in his field!",
                ]
            }
            // Add more interaction categories here
        ];

        // Check if the message matches any interaction triggers
        for (let interaction of interactions) {
            if (interaction.triggers.some(trigger => userMessage.includes(trigger))) {
                const response = interaction.responses[Math.floor(Math.random() * interaction.responses.length)];
                return message.channel.send(response);
            }
        }
    });
};
