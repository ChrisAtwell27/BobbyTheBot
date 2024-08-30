// alertHandler.js
module.exports = (client, alertKeywords, alertChannelId) => {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return; // Ignore messages from bots

    // Validate alertKeywords
    if (!Array.isArray(alertKeywords) || alertKeywords.length === 0) {
      console.error('alertKeywords must be a non-empty array.');
      return;
    }

    // Validate alertChannelId
    const alertChannel = client.channels.cache.get(alertChannelId);
    if (!alertChannel) {
      console.error(`Alert channel with ID ${alertChannelId} not found.`);
      return;
    }

    const messageContentLower = message.content.toLowerCase();

    /** Alert for specific keywords **/
    const foundKeyword = alertKeywords.find((keyword) =>
      messageContentLower.includes(keyword.toLowerCase())
    );

    if (foundKeyword) {
      try {
        await alertChannel.send(
          `🚨 **Alert:** The keyword "**${foundKeyword}**" was mentioned by **${message.author.tag}** in **#${message.channel.name}**:\n> ${message.content}`
        );
        console.log(
          `Alert sent for keyword "${foundKeyword}" mentioned by ${message.author.tag}.`
        );
      } catch (error) {
        console.error('Error sending alert message:', error);
      }
    }

    /** Greeting Bobby **/
    const greetings = ['hi bobby', 'hello bobby', 'hey bobby'];
    const foundGreet = greetings.find((greet) =>
      messageContentLower.includes(greet)
    );

    if (foundGreet) {
      try {
        await message.channel.send(`Hi ${message.author}! 👋`);
        console.log(`Greeted ${message.author.tag}.`);
      } catch (error) {
        console.error('Error sending greeting message:', error);
      }
    }
  });
};
