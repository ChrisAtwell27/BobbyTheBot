const { roleMessageIds, roleMappings } = require('../config');

module.exports = (client) => {
  client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;

    const messageId = reaction.message.id;
    const emoji = reaction.emoji.name;
    const roleId = roleMappings[emoji];

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
    }
  });

  client.on("messageReactionRemove", async (reaction, user) => {
    if (user.bot) return;

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
