const { roleMessageIds, roleMappings } = require('../data/config');

module.exports = (client) => {
  client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;

    console.log("Added");

    // Log the emoji name to debug
    console.log(`Emoji used: ${reaction.emoji.name}`);

    const messageId = reaction.message.id;
    const emoji = reaction.emoji.name;
    const roleId = roleMappings[emoji];

    // Log both the roleMappings key and the matched roleId
    console.log(`Emoji Key: ${emoji}`);
    console.log(`Role ID found: ${roleId}`);

    if (roleId && Object.values(roleMessageIds).includes(messageId)) {
      try {
        const guild = reaction.message.guild;
        const member = await guild.members.fetch(user.id);

        if (!member.roles.cache.has(roleId)) {
          await member.roles.add(roleId);
          console.log(`Added role ${roleId} to user ${user.username}`);
        } else {
          console.log(`User already has role: ${roleId}`);
        }
      } catch (error) {
        console.error("Failed to add role:", error);
      }
    } else if (!roleId) {
      console.log("No role ID found for emoji:", emoji);
    } else if (!Object.values(roleMessageIds).includes(messageId)) {
      console.log("No message ID found");
    }
  });

  client.on("messageReactionRemove", async (reaction, user) => {
    if (user.bot) return;
    console.log("Remove");

    const messageId = reaction.message.id;
    const emoji = reaction.emoji.name;
    const roleId = roleMappings[emoji];

    if (roleId && Object.values(roleMessageIds).includes(messageId)) {
      try {
        const guild = reaction.message.guild;
        const member = await guild.members.fetch(user.id);

        if (member.roles.cache.has(roleId)) {
          await member.roles.remove(roleId);
          console.log(`Removed role ${roleId} from user ${user.username}`);
        }
      } catch (error) {
        console.error("Failed to remove role:", error);
      }
    }
  });
};
