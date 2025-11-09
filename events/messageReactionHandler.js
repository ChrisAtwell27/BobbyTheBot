const { roleMessageIds, roleMappings, valorantRankRoles } = require('../data/config');

module.exports = (client) => {
  client.on("messageReactionAdd", async (reaction, user) => {
    try {
      if (user.bot) return;

      // Fetch partial reactions to get full data
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch (error) {
          console.error('Failed to fetch partial reaction:', error);
          return;
        }
      }

      // Check if reaction is in a guild (not DMs)
      if (!reaction.message.guild) {
        return;
      }

      console.log("Added");

      // Support both custom and standard emoji (custom emoji use id, standard use name)
      const emoji = reaction.emoji.name || reaction.emoji.id;

      // Log the emoji name to debug
      console.log(`Emoji used: ${emoji}`);

      const messageId = reaction.message.id;
      const roleId = roleMappings[emoji];

      // Log both the roleMappings key and the matched roleId
      console.log(`Emoji Key: ${emoji}`);
      console.log(`Role ID found: ${roleId}`);

      if (roleId && Object.values(roleMessageIds).includes(messageId)) {
        try {
          const guild = reaction.message.guild;
          const member = await guild.members.fetch(user.id);

          // Check if this is a Valorant rank role (mutual exclusivity)
          const isValorantRankRole = valorantRankRoles && valorantRankRoles.includes(roleId);

          if (isValorantRankRole && messageId === roleMessageIds.valRanks) {
            // Remove all other Valorant rank roles before adding the new one
            for (const rankRoleId of valorantRankRoles) {
              if (rankRoleId !== roleId && member.roles.cache.has(rankRoleId)) {
                await member.roles.remove(rankRoleId);
                console.log(`Removed rank role ${rankRoleId} from user ${user.username}`);
              }
            }
          }

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
    } catch (error) {
      console.error('Error in messageReactionAdd handler:', error);
    }
  });

  client.on("messageReactionRemove", async (reaction, user) => {
    try {
      if (user.bot) return;

      // Fetch partial reactions to get full data
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch (error) {
          console.error('Failed to fetch partial reaction:', error);
          return;
        }
      }

      // Check if reaction is in a guild (not DMs)
      if (!reaction.message.guild) {
        return;
      }

      console.log("Remove");

      // Support both custom and standard emoji (custom emoji use id, standard use name)
      const emoji = reaction.emoji.name || reaction.emoji.id;
      const messageId = reaction.message.id;
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
    } catch (error) {
      console.error('Error in messageReactionRemove handler:', error);
    }
  });
};
