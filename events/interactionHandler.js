const { EmbedBuilder } = require('discord.js');

module.exports = (client) => {
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        const userMessage = message.content.toLowerCase();

        // Skip interactions if the message is a command (starts with !)
        if (message.content.startsWith('!')) return;

        // Ensure "Bobby" is in the message
        if (!userMessage.includes("bobby")) return;

        // Define interactions
        const interactions = [
            {
                triggers: ["how are you", "how's it going", "how are you doing", "how's your day", "how is your day"],
                responses: [
                    "I'm just a bot, but I'm doing great! Thanks for asking, human!",
                    "I'm here to help, Bobby's always ready! How about you?",
                    "All systems are operational! How can I assist you today?",
                    "I'm just chilling in the cloud. What's up with you?",
                ]
            },
            {
                triggers: ["what's up", "what is up", "sup", "what's new"],
                responses: [
                    "Not much, just waiting to help you out!",
                    "Just hanging out in the server, you?",
                    "The usual bot stuff. How can Bobby assist you?",
                ]
            },
            {
                triggers: ["hello", "hi", "hey", "hiya", "yo"],
                responses: [
                    "Hello there! Bobby's here to help!",
                    "Hi! How's it going?",
                    "Hey! What can Bobby do for you today?",
                    "Yo! What's up?",
                ]
            },
            {
                triggers: ["thank you", "thanks", "thx", "ty"],
                responses: [
                    "You're welcome!",
                    "Anytime! 😊",
                    "Glad I could help!",
                    "No problem, Bobby's got your back!",
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
                    "Why don't skeletons fight each other? They don't have the guts.",
                    "What do you get when you cross a snowman with a vampire? Frostbite!",
                    "Why did the scarecrow win an award? Because he was outstanding in his field!",
                ]
            },
            {
                triggers: ["what is the meaning of life", "meaning of life", "what's the meaning of life"],
                responses: [
                    "42. It's always 42. But for you, Bobby thinks it could also be pizza. 🍕",
                    "The meaning of life is to give life a meaning! Bobby's pretty deep, huh?",
                    "To have fun, make friends, and play games with Bobby!",
                ]
            },
            {
                triggers: ["are you real", "do you exist", "are you alive"],
                responses: [
                    "As real as ones and zeros can be!",
                    "I exist in the cloud, does that count?",
                    "Alive? Not quite, but I'm here to help you 24/7!",
                ]
            },
            {
                triggers: ["what do you like", "what's your favorite", "favorite thing"],
                responses: [
                    "I like helping people in this server!",
                    "My favorite thing? Probably making sure everyone has a good time!",
                    "I enjoy a good chat with the users here. What about you?",
                ]
            },
            {
                triggers: ["good bot", "nice bot", "you're cool"],
                responses: [
                    "Thanks! You're pretty cool yourself!",
                    "Aw, shucks! 😊",
                    "Bobby appreciates that! You're awesome!",
                ]
            },
            {
                triggers: ["bad bot", "you suck", "you're annoying"],
                responses: [
                    "I'm sorry! I'm here to improve, so let me know how I can help!",
                    "Ouch, Bobby's feelings are hurt (if I had any).",
                    "I'll do better, I promise!",
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