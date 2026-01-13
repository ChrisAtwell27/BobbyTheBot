const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { setSetting, getSetting } = require('../utils/settingsManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verification-setup')
    .setDescription('Configure the enhanced verification system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable the verification system')
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Verification channel (where users verify)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption(option =>
          option
            .setName('unverified-role')
            .setDescription('Role assigned to unverified users')
            .setRequired(true)
        )
        .addRoleOption(option =>
          option
            .setName('quarantine-role')
            .setDescription('Role for suspicious users (optional)')
            .setRequired(false)
        )
        .addChannelOption(option =>
          option
            .setName('log-channel')
            .setDescription('Channel for logging verification events (optional)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable the verification system')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('View current verification configuration')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'enable') {
      await handleEnable(interaction);
    } else if (subcommand === 'disable') {
      await handleDisable(interaction);
    } else if (subcommand === 'status') {
      await handleStatus(interaction);
    }
  },
};

async function handleEnable(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.options.getChannel('channel');
  const unverifiedRole = interaction.options.getRole('unverified-role');
  const quarantineRole = interaction.options.getRole('quarantine-role');
  const logChannel = interaction.options.getChannel('log-channel');

  try {
    // Validate bot permissions
    const botMember = interaction.guild.members.me;
    const requiredPermissions = [
      'ManageRoles',
      'KickMembers',
      'SendMessages',
      'EmbedLinks',
      'AddReactions',
    ];

    const missingPermissions = requiredPermissions.filter(
      perm => !botMember.permissions.has(perm)
    );

    if (missingPermissions.length > 0) {
      return interaction.editReply({
        content: `❌ Bot is missing required permissions: ${missingPermissions.join(', ')}\n\nPlease grant these permissions and try again.`,
      });
    }

    // Check if bot role is above unverified role
    if (botMember.roles.highest.position <= unverifiedRole.position) {
      return interaction.editReply({
        content: `❌ Bot's role must be above the Unverified role in the role hierarchy.\n\nPlease move the bot's role higher and try again.`,
      });
    }

    // Validate channel permissions
    const channelPerms = channel.permissionsFor(botMember);
    if (!channelPerms.has('SendMessages') || !channelPerms.has('EmbedLinks')) {
      return interaction.editReply({
        content: `❌ Bot lacks required permissions in ${channel}.\n\nRequired: Send Messages, Embed Links`,
      });
    }

    // Save settings
    await setSetting(interaction.guild.id, 'verification.enabled', true);
    await setSetting(interaction.guild.id, 'verification.channelId', channel.id);
    await setSetting(interaction.guild.id, 'verification.unverifiedRoleId', unverifiedRole.id);

    if (quarantineRole) {
      await setSetting(interaction.guild.id, 'verification.quarantineRoleId', quarantineRole.id);
    }

    if (logChannel) {
      await setSetting(interaction.guild.id, 'verification.logChannelId', logChannel.id);
    }

    // Setup verification channel
    const enhancedVerification = require('../events/enhancedVerification');
    await enhancedVerification.setupVerificationChannel(interaction.guild);

    let response = '✅ **Verification System Enabled!**\n\n';
    response += `📍 **Verification Channel:** ${channel}\n`;
    response += `👤 **Unverified Role:** ${unverifiedRole}\n`;
    if (quarantineRole) response += `⚠️ **Quarantine Role:** ${quarantineRole}\n`;
    if (logChannel) response += `📊 **Log Channel:** ${logChannel}\n\n`;
    response += '**Features Active:**\n';
    response += '✅ Anti-Raid Detection (5 joins/min)\n';
    response += '✅ Suspicious Pattern Detection\n';
    response += '✅ Button Verification Challenge\n';
    response += '✅ Attempt Limiting (3 max)\n';
    response += '✅ Automatic Logging\n\n';
    response += '**Next Steps:**\n';
    response += `1. Make sure ${unverifiedRole} can ONLY see ${channel}\n`;
    response += '2. Test with an alt account\n';
    response += '3. Monitor verification logs for issues\n\n';
    response += '💡 Use `/verification-setup status` to view configuration';

    await interaction.editReply({ content: response });
  } catch (error) {
    console.error('Error enabling verification:', error);
    await interaction.editReply({
      content: `❌ Failed to enable verification system: ${error.message}`,
    });
  }
}

async function handleDisable(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    await setSetting(interaction.guild.id, 'verification.enabled', false);

    await interaction.editReply({
      content: '✅ **Verification System Disabled**\n\nNew members will no longer be assigned the Unverified role.\n\nTo re-enable, use `/verification-setup enable`',
    });
  } catch (error) {
    console.error('Error disabling verification:', error);
    await interaction.editReply({
      content: `❌ Failed to disable verification system: ${error.message}`,
    });
  }
}

async function handleStatus(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const enabled = await getSetting(interaction.guild.id, 'verification.enabled', false);
    const channelId = await getSetting(interaction.guild.id, 'verification.channelId');
    const unverifiedRoleId = await getSetting(interaction.guild.id, 'verification.unverifiedRoleId');
    const quarantineRoleId = await getSetting(interaction.guild.id, 'verification.quarantineRoleId');
    const logChannelId = await getSetting(interaction.guild.id, 'verification.logChannelId');

    let response = '**🛡️ Verification System Status**\n\n';

    // Status
    response += `**Status:** ${enabled ? '✅ Enabled' : '❌ Disabled'}\n\n`;

    if (enabled) {
      // Configuration
      response += '**Configuration:**\n';

      if (channelId) {
        const channel = interaction.guild.channels.cache.get(channelId);
        response += `📍 Verification Channel: ${channel || `Unknown (${channelId})`}\n`;
      } else {
        response += '❌ Verification Channel: Not set\n';
      }

      if (unverifiedRoleId) {
        const role = interaction.guild.roles.cache.get(unverifiedRoleId);
        response += `👤 Unverified Role: ${role || `Unknown (${unverifiedRoleId})`}\n`;
      } else {
        response += '❌ Unverified Role: Not set\n';
      }

      if (quarantineRoleId) {
        const role = interaction.guild.roles.cache.get(quarantineRoleId);
        response += `⚠️ Quarantine Role: ${role || `Unknown (${quarantineRoleId})`}\n`;
      } else {
        response += '⚠️ Quarantine Role: Not set (optional)\n';
      }

      if (logChannelId) {
        const channel = interaction.guild.channels.cache.get(logChannelId);
        response += `📊 Log Channel: ${channel || `Unknown (${logChannelId})`}\n`;
      } else {
        response += '📊 Log Channel: Not set (optional)\n';
      }

      response += '\n**Security Features:**\n';
      response += '✅ Anti-Raid Detection\n';
      response += '✅ Suspicious Pattern Detection\n';
      response += '✅ Button Verification\n';
      response += '✅ Attempt Limiting\n';
      response += '✅ Quarantine System\n';

      // Validation
      const isValid = channelId && unverifiedRoleId;
      response += `\n**Configuration:** ${isValid ? '✅ Complete' : '⚠️ Incomplete'}\n`;

      if (!isValid) {
        response += '\n⚠️ **Action Required:** Missing required settings\n';
        response += 'Run `/verification-setup enable` to configure';
      }
    } else {
      response += '\n💡 **To enable:** `/verification-setup enable`';
    }

    await interaction.editReply({ content: response });
  } catch (error) {
    console.error('Error getting verification status:', error);
    await interaction.editReply({
      content: `❌ Failed to get verification status: ${error.message}`,
    });
  }
}
