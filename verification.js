const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { TARGET_GUILD_ID } = require('./config/guildConfig');

const VERIFY_CHANNEL_ID = '1433901636610428998';
const UNVERIFIED_ROLE_ID = '1433901263820685374';
const VERIFICATION_EMOJI = '✅';

async function setupVerificationChannel(guild) {
    // Only run on target guild
    if (guild.id !== TARGET_GUILD_ID) {
        return null;
    }

    // Get Unverified role by ID
    let unverifiedRole = guild.roles.cache.get(UNVERIFIED_ROLE_ID);
    if (!unverifiedRole) {
        console.error(`Unverified role with ID ${UNVERIFIED_ROLE_ID} not found in guild ${guild.name}`);
        return null;
    }

    // Get verification channel by ID
    let verifyChannel = guild.channels.cache.get(VERIFY_CHANNEL_ID);
    if (!verifyChannel) {
        console.error(`Verify channel with ID ${VERIFY_CHANNEL_ID} not found in guild ${guild.name}`);
        return null;
    }

    // Check if verification message already exists
    const messages = await verifyChannel.messages.fetch({ limit: 10 });
    const existingMessage = messages.find(msg => 
        msg.author.id === guild.client.user.id && 
        msg.content.includes('react with ✅')
    );

    if (!existingMessage) {
        // Send verification message
        const message = await verifyChannel.send({
            content: '**Welcome to the server!**\n\nPlease react with ✅ below to verify and gain access to the server.'
        });
        await message.react(VERIFICATION_EMOJI);
    }

    return { verifyChannel, unverifiedRole };
}

async function handleMemberJoin(member) {
    const result = await setupVerificationChannel(member.guild);
    if (!result) return;

    const { unverifiedRole } = result;
    
    try {
        await member.roles.add(unverifiedRole);
        console.log(`Assigned Unverified role to ${member.user.tag}`);
    } catch (error) {
        console.error(`Failed to assign Unverified role to ${member.user.tag}:`, error);
    }
}

async function handleReactionAdd(reaction, user) {
    // Ignore bot reactions
    if (user.bot) return;

    // Fetch partial reactions
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Error fetching reaction:', error);
            return;
        }
    }

    const { guild, channel } = reaction.message;

    // Only run on target guild
    if (guild.id !== TARGET_GUILD_ID) return;

    // Check if reaction is in verify channel
    if (channel.id !== VERIFY_CHANNEL_ID) return;
    if (reaction.emoji.name !== VERIFICATION_EMOJI) return;

    const member = guild.members.cache.get(user.id);
    if (!member) return;

    const unverifiedRole = guild.roles.cache.get(UNVERIFIED_ROLE_ID);
    if (!unverifiedRole) return;

    // Remove Unverified role
    if (member.roles.cache.has(unverifiedRole.id)) {
        try {
            await member.roles.remove(unverifiedRole);
            console.log(`Verified ${user.tag} - removed Unverified role`);
        } catch (error) {
            console.error(`Failed to remove Unverified role from ${user.tag}:`, error);
        }
    }
}

module.exports = {
    setupVerificationChannel,
    handleMemberJoin,
    handleReactionAdd
};
