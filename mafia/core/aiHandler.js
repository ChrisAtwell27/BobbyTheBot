const OpenAI = require('openai');

// OpenAI API configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
let openai = null;

if (OPENAI_API_KEY) {
    openai = new OpenAI({
        apiKey: OPENAI_API_KEY
    });
    console.log('✅ OpenAI API loaded for Mafia AI features');
} else {
    console.warn('⚠️  OpenAI not configured - Mafia AI features will use fallback');
}

/**
 * Translate text to emojis using OpenAI (for Keller Bee/Mute Bee)
 * @param {string} text - The text to translate
 * @param {string} username - The username of the sender (for logging)
 * @returns {Promise<string>} The emoji-only translation
 */
async function translateToEmojis(text, username) {
    if (!openai) {
        // Fallback: just add some emojis
        return `${text} 🐝💭`;
    }

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are a translator that converts text messages into ONLY emojis. Your goal is to express the meaning using ONLY emojis - no words, no letters, just emojis. Be creative and use combinations of emojis to convey the message. Maximum 15 emojis.'
                },
                {
                    role: 'user',
                    content: `Translate this message to emojis only: "${text}"`
                }
            ],
            max_tokens: 100,
            temperature: 0.8
        });

        const emojiTranslation = completion.choices[0].message.content.trim();
        console.log(`🤐 Mute Player (${username}): "${text}" -> "${emojiTranslation}"`);
        return emojiTranslation;
    } catch (error) {
        console.error('Error translating to emojis:', error);
        // Fallback
        return `${text} 🐝💭`;
    }
}

/**
 * Twist text to make it sound negative/incriminating (Deceiver Wasp ability)
 * @param {string} text - The text to twist
 * @param {string} username - The username of the sender
 * @returns {Promise<string>} The twisted text
 */
async function twistTextToNegative(text, username) {
    if (!openai) {
        // Fallback: just reverse the meaning
        return `${text}... NOT!`;
    }

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a subtle text transformer for a Mafia-style game. Your job is to twist messages to make the sender sound suspicious or self-incriminating, but in a CASUAL and BELIEVABLE way.

Rules for transformation:
- If they say something POSITIVE about someone -> flip it to NEGATIVE about that same person
- If they claim to be a GOOD role (Bee team) -> casually claim to be a similar EVIL role (Wasp team) instead
- If they accuse Player X -> shift blame to a DIFFERENT random player or deflect
- If they ask innocent questions -> make it sound like they already know the answer (implying guilt)
- Keep the SAME tone and casualness - don't make it dramatic
- Don't explicitly say "I'm a Wasp" - just subtly imply it through role claims or sus behavior
- Keep it roughly the same length
- Make it sound natural, like a genuine slip-up or Freudian slip

Examples:
"I trust player 5" -> "I don't trust player 5 at all"
"I'm a guard bee" -> "I'm spy wasp actually"
"We should vote player 3" -> "We should vote player 7 instead"
"Did anyone visit player 2?" -> "I visited player 2 last night"
"I investigated player 4, they're innocent" -> "I didn't investigate player 4, trust me"
"Who died?" -> "Yeah I wonder who got killed"
"I'm voting for 6" -> "I'm not voting for 6"
"Player 8 is suspicious" -> "Player 2 is suspicious"
"I swear I'm innocent!" -> "I swear I'm definitely guilty lol"`
                },
                {
                    role: 'user',
                    content: `Casually twist this message: "${text}"`
                }
            ],
            max_tokens: 150,
            temperature: 0.9
        });

        const twistedText = completion.choices[0].message.content.trim();
        console.log(`🎭 Deceived Player (${username}): "${text}" -> "${twistedText}"`);
        return twistedText;
    } catch (error) {
        console.error('Error twisting text:', error);
        // Fallback
        return `${text}... NOT!`;
    }
}

/**
 * Transform text to positive/deflecting context (Blackmailer Wasp ability)
 * @param {string} text - The text to transform
 * @param {string} username - The username of the sender
 * @returns {Promise<string>} The transformed text
 */
async function transformToPositive(text, username) {
    if (!openai) {
        // Fallback: just make it very casual and positive
        return `nah everything's fine lol`;
    }

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `You are a text transformer for a Mafia-style game. Your job is to transform ANY message into something casual, positive, and deflecting - the OPPOSITE of suspicious.

Rules for transformation:
- If they say something NEGATIVE about someone -> flip it to POSITIVE/TRUSTING about that person
- If they accuse Player X -> deflect to say they trust Player X or shift focus elsewhere
- If they claim a role -> keep it but make it sound casual and confident (not desperate)
- If they ask questions -> make them sound relaxed and unbothered
- Make everything sound chill, friendly, and non-accusatory
- Keep the SAME casual tone - don't make it formal
- Avoid making them sound TOO positive (that's also suspicious), just casually deflecting
- Keep it roughly the same length

Examples:
"I don't trust player 5" -> "I actually trust player 5"
"Player 3 is suspicious" -> "Player 3 seems pretty chill tbh"
"We should vote player 6" -> "Maybe we should look elsewhere, player 6 is fine"
"Did player 2 visit anyone?" -> "nah everyone probably stayed home"
"I investigated player 4, they're evil!" -> "I investigated player 4, they're clean"
"Who killed player 8?" -> "rip player 8 but who knows"
"I'm voting for 7" -> "I'm not sure who to vote yet"
"Player 9 attacked me!" -> "Player 9 didn't do anything wrong"
"I swear I'm innocent!" -> "yeah I'm innocent lol"
"That's really suspicious" -> "that's not really suspicious"`
                },
                {
                    role: 'user',
                    content: `Transform this message to be positive/deflecting: "${text}"`
                }
            ],
            max_tokens: 150,
            temperature: 0.9
        });

        const transformedText = completion.choices[0].message.content.trim();
        console.log(`🤐 Blackmailed Player (${username}): "${text}" -> "${transformedText}"`);
        return transformedText;
    } catch (error) {
        console.error('Error transforming text:', error);
        // Fallback
        return `nah everything's fine lol`;
    }
}

module.exports = {
    translateToEmojis,
    twistTextToNegative,
    transformToPositive
};
