module.exports = (client, loggingChannelId) => {
    client.on('messageDelete', async message => {
      try {
        // Fetch partial messages to get full data
        if (message.partial) {
          try {
            await message.fetch();
          } catch (error) {
            console.error('Failed to fetch partial deleted message:', error);
            return;
          }
        }

        // Check if message has author (webhook messages may not)
        if (!message.author) {
          return;
        }

        const logChannel = client.channels.cache.get(loggingChannelId);
        if (logChannel) {
          logChannel.send(`# 🗑️ A message by ${message.author.tag} was deleted in ${message.channel.name}: "${message.content}"`);
        }
      } catch (error) {
        console.error('Error in messageDelete handler:', error);
      }
    });

    client.on('messageUpdate', async (oldMessage, newMessage) => {
      try {
        // Fetch partial messages to get full data
        if (oldMessage.partial) {
          try {
            await oldMessage.fetch();
          } catch (error) {
            console.error('Failed to fetch partial old message:', error);
            return;
          }
        }
        if (newMessage.partial) {
          try {
            await newMessage.fetch();
          } catch (error) {
            console.error('Failed to fetch partial new message:', error);
            return;
          }
        }

        // Check if messages have authors (webhook messages may not)
        if (!oldMessage.author || !newMessage.author) {
          return;
        }

        // Only log if content actually changed
        if (oldMessage.content !== newMessage.content) {
          const logChannel = client.channels.cache.get(loggingChannelId);
          if (logChannel) {
            logChannel.send(`# ✏️ A message by ${oldMessage.author.tag} was edited in ${oldMessage.channel.name}:\n**Before:** ${oldMessage.content}\n**After:** ${newMessage.content}`);
          }
        }
      } catch (error) {
        console.error('Error in messageUpdate handler:', error);
      }
    });
  
    client.on('guildBanAdd', ban => {
      const logChannel = client.channels.cache.get(loggingChannelId);
      if (logChannel) {
        logChannel.send(`# ⛔ User ${ban.user.tag} was banned.`);
      }
    });
  
    client.on('guildBanRemove', ban => {
      const logChannel = client.channels.cache.get(loggingChannelId);
      if (logChannel) {
        logChannel.send(`# ✅ User ${ban.user.tag} was unbanned.`);
      }
    });
  };
  