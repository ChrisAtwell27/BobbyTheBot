const { EmbedBuilder } = require('discord.js');

/**
 * Settings Command Handler
 * Handles the !settings command to provide link to bot configuration dashboard
 */

module.exports = (client) => {
  console.log('⚙️ Settings Command Handler initialized');

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    // Check if message is !settings command
    const content = message.content.toLowerCase();
    if (!content.startsWith('!settings') && !content.startsWith('!config') && !content.startsWith('!setup')) {
      return;
    }

    try {
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)  // Discord Blurple
        .setTitle('⚙️ Bot Settings & Configuration')
        .setDescription(
          `Configure Bobby The Bot settings and features for **${message.guild.name}**`
        )
        .addFields(
          {
            name: '🌐 Settings Dashboard',
            value: '[Visit the Settings Page](https://crackedgames.co/bobby-the-bot/)\n\nManage bot features, subscription, and server-specific configurations.',
            inline: false
          },
          {
            name: '🔧 Available Settings',
            value: '• Feature toggles (Trivia, Alerts, Gambling, etc.)\n• Audit log channel\n• Premium features\n• API configuration',
            inline: false
          },
          {
            name: '📚 Documentation',
            value: 'For detailed API documentation, check `SETTINGS.md` in the bot repository.',
            inline: false
          }
        )
        .setFooter({
          text: 'Use !subscription to check your subscription tier'
        })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });

    } catch (error) {
      console.error('Error in settings command:', error);
      await message.reply('❌ An error occurred while generating settings information. Please try again.').catch(console.error);
    }
  });
};
