module.exports = (client, loggingChannelId) => {
    client.on('messageDelete', message => {
      if (!message.partial) {
        const logChannel = client.channels.cache.get(loggingChannelId);
        if (logChannel) {
          logChannel.send(`# 🗑️ A message by ${message.author.tag} was deleted in ${message.channel.name}: "${message.content}"`);
        }
      }
    });
  
    client.on('messageUpdate', (oldMessage, newMessage) => {
      if (!oldMessage.partial && !newMessage.partial && oldMessage.content !== newMessage.content) {
        const logChannel = client.channels.cache.get(loggingChannelId);
        if (logChannel) {
          logChannel.send(`# ✏️ A message by ${oldMessage.author.tag} was edited in ${oldMessage.channel.name}:\n**Before:** ${oldMessage.content}\n**After:** ${newMessage.content}`);
        }
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
  