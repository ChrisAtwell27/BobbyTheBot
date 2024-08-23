module.exports = (client, alertKeywords, alertChannelId) => {
    client.on('messageCreate', message => {
      if (message.author.bot) return;
  
      const alertChannel = client.channels.cache.get(alertChannelId);
  
      // Alerts for specific keywords
      const foundKeyword = alertKeywords.find(keyword => message.content.toLowerCase().includes(keyword.toLowerCase()));
      if (foundKeyword) {
        if (alertChannel) {
          alertChannel.send(`# 🚨 Alert: The keyword "${foundKeyword}" was mentioned by ${message.author.tag} in ${message.channel.name}:\n"${message.content}"`);
        }
      }
  
      // Greeting Bobby
      const greets = ["Hi Bobby", "Hi Bobby!", "Hi Bobby.", "Hi Bobby?", "Hello Bobby"];
      const foundGreet = greets.find(greet => message.content.toLowerCase().includes(greet.toLowerCase()));
      if (foundGreet) {
        message.channel.send(`Hi ${message.author.tag} :D`);
      }
    });
  };
  