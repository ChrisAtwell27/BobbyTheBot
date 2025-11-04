const fs = require('fs');
const path = require('path');
const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const { TARGET_GUILD_ID } = require('../config/guildConfig');

const boosterRolesFilePath = path.join(__dirname, '../data/booster_roles.txt');

module.exports = (client) => {
    // Configuration options
    const config = {
        boosterRoleName: 'Server Booster',
        boosterChannelName: 'booster-chat',
        rolePrefix: '🎨 ', // Prefix for custom booster roles
        maxRoleNameLength: 32
    };
    
    console.log('🚀 Booster Role Handler initialized');
    
    // Listen for role updates (when someone gets/loses booster role)
    client.on('guildMemberUpdate', async (oldMember, newMember) => {
        const hadBoosterRole = oldMember.roles.cache.some(role => role.name === config.boosterRoleName);
        const hasBoosterRole = newMember.roles.cache.some(role => role.name === config.boosterRoleName);
        
        // User just became a booster
        if (!hadBoosterRole && hasBoosterRole) {
            await handleNewBooster(newMember);
        }
        
        // User lost booster status
        if (hadBoosterRole && !hasBoosterRole) {
            await handleLostBooster(newMember);
        }
    });
    
    // Listen for custom role creation commands in booster chat
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // Only run in target guild
        if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

        if (!message.guild) return;
        
        // Check if message is in booster chat
        if (message.channel.name !== config.boosterChannelName) return;
        
        // Check if user has booster role
        const member = message.guild.members.cache.get(message.author.id);
        if (!member || !member.roles.cache.some(role => role.name === config.boosterRoleName)) {
            return;
        }
        
        const args = message.content.split(' ');
        
        // Command to create custom role: !color <name> <hex>
        if (args[0] === '!color') {
            if (args.length < 3) {
                return message.reply('❌ Usage: `!color <role name> <hex color>`\nExample: `!color My Cool Role #ff5733`');
            }
            
            // Parse role name and hex color
            const hexColor = args[args.length - 1]; // Last argument is hex
            const roleName = args.slice(1, -1).join(' '); // Everything between !color and hex
            
            if (!roleName || roleName.length > config.maxRoleNameLength) {
                return message.reply(`❌ Role name must be between 1 and ${config.maxRoleNameLength} characters.`);
            }
            
            if (!isValidHexColor(hexColor)) {
                return message.reply('❌ Invalid hex color. Please use format: `#ff5733` or `#FF5733`');
            }
            
            await createCustomBoosterRole(message, member, roleName, hexColor);
        }
        
        // Command to update existing role color: !recolor <hex>
        if (args[0] === '!recolor') {
            if (args.length !== 2) {
                return message.reply('❌ Usage: `!recolor <hex color>`\nExample: `!recolor #00ff00`');
            }
            
            const hexColor = args[1];
            
            if (!isValidHexColor(hexColor)) {
                return message.reply('❌ Invalid hex color. Please use format: `#ff5733` or `#FF5733`');
            }
            
            await updateBoosterRoleColor(message, member, hexColor);
        }
        
        // Command to update role name: !rename <new name>
        if (args[0] === '!rename') {
            if (args.length < 2) {
                return message.reply('❌ Usage: `!rename <new role name>`\nExample: `!rename My Awesome Role`');
            }
            
            const newName = args.slice(1).join(' ');
            
            if (newName.length > config.maxRoleNameLength) {
                return message.reply(`❌ Role name must be ${config.maxRoleNameLength} characters or less.`);
            }
            
            await updateBoosterRoleName(message, member, newName);
        }
        
        // Command to delete custom role: !deletecolor
        if (args[0] === '!deletecolor') {
            await deleteCustomBoosterRole(message, member);
        }
        
        // Help command
        if (args[0] === '!colorhelp') {
            const helpEmbed = new EmbedBuilder()
                .setColor(0x9932CC)
                .setTitle('🎨 Custom Booster Role Commands')
                .setDescription('Create and manage your custom booster role!')
                .addFields(
                    { name: '🆕 Create Role', value: '`!color <name> <hex>`\nExample: `!color My Cool Role #ff5733`', inline: false },
                    { name: '🎨 Change Color', value: '`!recolor <hex>`\nExample: `!recolor #00ff00`', inline: false },
                    { name: '✏️ Rename Role', value: '`!rename <new name>`\nExample: `!rename My Awesome Role`', inline: false },
                    { name: '🗑️ Delete Role', value: '`!deletecolor`\nPermanently removes your custom role', inline: false },
                    { name: '🌈 Color Tips', value: 'Use [color picker websites](https://htmlcolorcodes.com/) to find hex codes!\nFormat: `#ffffff` (with #)', inline: false }
                )
                .setFooter({ text: 'Thank you for boosting the server! 💜' })
                .setTimestamp();
            
            return message.reply({ embeds: [helpEmbed] });
        }
    });
    
    // Booster command to test booster functionality (changed from admin-only)
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // Only run in target guild
        if (message.guild && message.guild.id !== TARGET_GUILD_ID) return;

        if (!message.guild) return;
        
        const args = message.content.split(' ');
        
        // Booster command to trigger booster welcome for testing
        if (args[0] === '!boosterrole') {
            // Check if user has booster role instead of admin permissions
            const member = message.guild.members.cache.get(message.author.id);
            if (!member || !member.roles.cache.some(role => role.name === config.boosterRoleName)) {
                return message.reply('❌ You need the Server Booster role to use this command.');
            }
            
            let targetMember = message.member; // Default to command user
            
            // If a user is mentioned, use them instead
            if (args[1]) {
                const mentionedUser = message.mentions.users.first() || message.guild.members.cache.find(member => member.user.username === args[1])?.user;
                if (mentionedUser) {
                    targetMember = message.guild.members.cache.get(mentionedUser.id);
                }
            }
            
            if (!targetMember) {
                return message.reply('❌ Could not find that member in this server.');
            }
            
            // Trigger the new booster handler
            await handleNewBooster(targetMember);
            
            // Send confirmation to booster
            const confirmEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Booster Welcome Triggered')
                .setDescription(`Booster welcome message sent for ${targetMember.user.tag}`)
                .addFields(
                    { name: '🎯 Target User', value: `${targetMember.user.tag}`, inline: true },
                    { name: '📍 Channel', value: `#${config.boosterChannelName}`, inline: true },
                    { name: '🚀 Booster', value: `${message.author.tag}`, inline: true }
                )
                .setFooter({ text: 'Testing Command' })
                .setTimestamp();
            
            await message.reply({ embeds: [confirmEmbed] });
            
            console.log(`🧪 Booster ${message.author.tag} triggered booster welcome for ${targetMember.user.tag}`);
        }
    });
    
    // Function to handle new booster
    async function handleNewBooster(member) {
        try {
            const boosterChannel = member.guild.channels.cache.find(channel => 
                channel.name === config.boosterChannelName
            );
            
            if (!boosterChannel || !boosterChannel.isTextBased()) {
                console.log(`Could not find booster channel: ${config.boosterChannelName}`);
                return;
            }
            
            // Check if user has a saved custom role
            const savedRole = getSavedBoosterRole(member.id);
            
            if (savedRole) {
                // Restore their previous custom role
                await restoreBoosterRole(member, savedRole);
                
                const welcomeBackEmbed = new EmbedBuilder()
                    .setColor(0x9932CC)
                    .setTitle('🎉 Welcome Back, Booster!')
                    .setDescription(`Thank you for boosting again, ${member.user}! 💜`)
                    .addFields(
                        { name: '🎨 Custom Role Restored', value: `Your previous role **${savedRole.name}** has been restored!`, inline: false },
                        { name: '✨ Want to Update?', value: 'Use `!recolor <hex>` to change color or `!rename <name>` to change the name', inline: false },
                        { name: '❓ Need Help?', value: 'Type `!colorhelp` for all available commands', inline: false }
                    )
                    .setThumbnail(member.user.displayAvatarURL())
                    .setFooter({ text: 'Thank you for supporting the server!' })
                    .setTimestamp();
                
                await boosterChannel.send({ 
                    content: `${member.user}`, 
                    embeds: [welcomeBackEmbed] 
                });
            } else {
                // First time booster or no saved role
                const welcomeEmbed = new EmbedBuilder()
                    .setColor(0x9932CC)
                    .setTitle('🎉 Thank You for Boosting!')
                    .setDescription(`Welcome to the booster club, ${member.user}! 💜`)
                    .addFields(
                        { name: '🎨 Create Your Custom Role', value: 'You can now create a custom colored role just for you!', inline: false },
                        { name: '📝 How to Create', value: '`!color <role name> <hex color>`\nExample: `!color My Cool Role #ff5733`', inline: false },
                        { name: '🌈 Find Colors', value: 'Visit [htmlcolorcodes.com](https://htmlcolorcodes.com/) to pick your perfect color!', inline: false },
                        { name: '❓ Need Help?', value: 'Type `!colorhelp` for all available commands', inline: false }
                    )
                    .setThumbnail(member.user.displayAvatarURL())
                    .setFooter({ text: 'Enjoy your booster perks!' })
                    .setTimestamp();
                
                await boosterChannel.send({ 
                    content: `${member.user}`, 
                    embeds: [welcomeEmbed] 
                });
            }
            
            console.log(`🚀 New booster welcomed: ${member.user.tag}`);
            
        } catch (error) {
            console.error('Error handling new booster:', error);
        }
    }
    
    // Function to handle lost booster
    async function handleLostBooster(member) {
        try {
            const customRole = getCustomBoosterRole(member);
            
            if (customRole) {
                // Save the role data before removing
                const roleData = {
                    name: customRole.name.replace(config.rolePrefix, ''),
                    color: customRole.hexColor,
                    roleId: customRole.id
                };
                
                saveBoosterRole(member.id, roleData);
                
                // Remove the custom role from the user
                await member.roles.remove(customRole, 'No longer boosting server');
                
                console.log(`💔 Saved and removed custom role for ex-booster: ${member.user.tag}`);
                
                // Optionally delete the role entirely if no one else has it
                // (In case you want to clean up unused roles)
                const roleMembers = customRole.members.size;
                if (roleMembers === 0) {
                    await customRole.delete('Booster role no longer needed');
                    console.log(`🗑️ Deleted unused custom role: ${roleData.name}`);
                }
            }
            
        } catch (error) {
            console.error('Error handling lost booster:', error);
        }
    }
    
    // Function to create custom booster role
    async function createCustomBoosterRole(message, member, roleName, hexColor) {
        try {
            // Check if user already has a custom role
            const existingRole = getCustomBoosterRole(member);
            if (existingRole) {
                return message.reply('❌ You already have a custom role! Use `!recolor <hex>` to change color or `!rename <name>` to change the name.');
            }
            
            // Create the role
            const fullRoleName = config.rolePrefix + roleName;
            const customRole = await member.guild.roles.create({
                name: fullRoleName,
                color: hexColor,
                reason: `Custom booster role for ${member.user.tag}`,
                permissions: []
            });
            // Position the role just below -- COLOR ROLES --
            const colorRolesRole = member.guild.roles.cache.find(role => role.name === '-- COLOR ROLES --');
            if (colorRolesRole) {
                await customRole.setPosition(colorRolesRole.position - 1);
            } else {
                // Fallback: put above booster role
                const boosterRole = member.guild.roles.cache.find(role => role.name === config.boosterRoleName);
                if (boosterRole) {
                    await customRole.setPosition(boosterRole.position - 1);
                }
            }
            
            // Give the role to the user
            await member.roles.add(customRole, 'Custom booster role created');
            
            // Save the role data
            const roleData = {
                name: roleName,
                color: hexColor,
                roleId: customRole.id
            };
            saveBoosterRole(member.id, roleData);
            
            const successEmbed = new EmbedBuilder()
                .setColor(hexColor)
                .setTitle('✅ Custom Role Created!')
                .setDescription(`Your custom role **${fullRoleName}** has been created and assigned!`)
                .addFields(
                    { name: '🎨 Color', value: hexColor.toUpperCase(), inline: true },
                    { name: '📝 Name', value: roleName, inline: true },
                    { name: '💡 Pro Tip', value: 'Your role will be saved even if you stop boosting!', inline: false }
                )
                .setThumbnail(member.user.displayAvatarURL())
                .setFooter({ text: 'Use !colorhelp for more commands' })
                .setTimestamp();
            
            await message.reply({ embeds: [successEmbed] });
            
            console.log(`🎨 Created custom role for ${member.user.tag}: ${fullRoleName} (${hexColor})`);
            
        } catch (error) {
            console.error('Error creating custom booster role:', error);
            message.reply('❌ Failed to create custom role. Please contact a moderator.');
        }
    }
    
    // Function to update booster role color
    async function updateBoosterRoleColor(message, member, hexColor) {
        try {
            const customRole = getCustomBoosterRole(member);
            if (!customRole) {
                return message.reply('❌ You don\'t have a custom role yet! Use `!color <name> <hex>` to create one.');
            }
            
            await customRole.setColor(hexColor, 'Booster updated role color');
            
            // Update saved data
            const roleData = getSavedBoosterRole(member.id) || {};
            roleData.color = hexColor;
            saveBoosterRole(member.id, roleData);
            
            const successEmbed = new EmbedBuilder()
                .setColor(hexColor)
                .setTitle('🎨 Role Color Updated!')
                .setDescription(`Your role color has been changed to **${hexColor.toUpperCase()}**`)
                .setThumbnail(member.user.displayAvatarURL())
                .setTimestamp();
            
            await message.reply({ embeds: [successEmbed] });
            
            console.log(`🎨 Updated role color for ${member.user.tag}: ${hexColor}`);
            
        } catch (error) {
            console.error('Error updating booster role color:', error);
            message.reply('❌ Failed to update role color. Please contact a moderator.');
        }
    }
    
    // Function to update booster role name
    async function updateBoosterRoleName(message, member, newName) {
        try {
            const customRole = getCustomBoosterRole(member);
            if (!customRole) {
                return message.reply('❌ You don\'t have a custom role yet! Use `!color <name> <hex>` to create one.');
            }
            
            const fullRoleName = config.rolePrefix + newName;
            await customRole.setName(fullRoleName, 'Booster updated role name');
            
            // Update saved data
            const roleData = getSavedBoosterRole(member.id) || {};
            roleData.name = newName;
            saveBoosterRole(member.id, roleData);
            
            const successEmbed = new EmbedBuilder()
                .setColor(customRole.hexColor || 0x9932CC)
                .setTitle('✏️ Role Name Updated!')
                .setDescription(`Your role has been renamed to **${fullRoleName}**`)
                .setThumbnail(member.user.displayAvatarURL())
                .setTimestamp();
            
            await message.reply({ embeds: [successEmbed] });
            
            console.log(`✏️ Updated role name for ${member.user.tag}: ${fullRoleName}`);
            
        } catch (error) {
            console.error('Error updating booster role name:', error);
            message.reply('❌ Failed to update role name. Please contact a moderator.');
        }
    }
    
    // Function to delete custom booster role
    async function deleteCustomBoosterRole(message, member) {
        try {
            const customRole = getCustomBoosterRole(member);
            if (!customRole) {
                return message.reply('❌ You don\'t have a custom role to delete.');
            }
            
            // Remove from saved data
            removeSavedBoosterRole(member.id);
            
            // Delete the role
            const roleName = customRole.name;
            await customRole.delete('Booster deleted custom role');
            
            const successEmbed = new EmbedBuilder()
                .setColor(0xFF6B6B)
                .setTitle('🗑️ Custom Role Deleted')
                .setDescription(`Your custom role **${roleName}** has been permanently deleted.`)
                .addFields(
                    { name: '💡 Want a new one?', value: 'Use `!color <name> <hex>` to create a new custom role!', inline: false }
                )
                .setThumbnail(member.user.displayAvatarURL())
                .setTimestamp();
            
            await message.reply({ embeds: [successEmbed] });
            
            console.log(`🗑️ Deleted custom role for ${member.user.tag}: ${roleName}`);
            
        } catch (error) {
            console.error('Error deleting custom booster role:', error);
            message.reply('❌ Failed to delete custom role. Please contact a moderator.');
        }
    }
    
    // Function to restore booster role
    async function restoreBoosterRole(member, savedRole) {
        try {
            // Check if the role still exists
            let existingRole = member.guild.roles.cache.get(savedRole.roleId);
            
            if (!existingRole) {
                // Role was deleted, create a new one
                const fullRoleName = config.rolePrefix + savedRole.name;
                existingRole = await member.guild.roles.create({
                    name: fullRoleName,
                    color: savedRole.color,
                    reason: `Restored booster role for ${member.user.tag}`,
                    permissions: []
                });
                // Position the role just below -- COLOR ROLES --
                const colorRolesRole = member.guild.roles.cache.find(role => role.name === '-- COLOR ROLES --');
                if (colorRolesRole) {
                    await existingRole.setPosition(colorRolesRole.position - 1);
                } else {
                    // Fallback: put above booster role
                    const boosterRole = member.guild.roles.cache.find(role => role.name === config.boosterRoleName);
                    if (boosterRole) {
                        await existingRole.setPosition(boosterRole.position - 1);
                    }
                }
                // Update saved data with new role ID
                savedRole.roleId = existingRole.id;
                saveBoosterRole(member.id, savedRole);
            }
            
            // Give the role back to the user
            await member.roles.add(existingRole, 'Restored booster role');
            
            console.log(`🔄 Restored custom role for ${member.user.tag}: ${savedRole.name}`);
            
        } catch (error) {
            console.error('Error restoring booster role:', error);
        }
    }
    
    // Helper function to get user's custom booster role
    function getCustomBoosterRole(member) {
        return member.roles.cache.find(role => 
            role.name.startsWith(config.rolePrefix) && 
            !role.managed && // Not a bot role
            role.name !== config.boosterRoleName
        );
    }
    
    // Helper function to validate hex color
    function isValidHexColor(hex) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
    }
    
    // Function to save booster role data
    function saveBoosterRole(userId, roleData) {
        if (!fs.existsSync(boosterRolesFilePath)) {
            fs.writeFileSync(boosterRolesFilePath, '', 'utf-8');
        }
        
        let data = fs.readFileSync(boosterRolesFilePath, 'utf-8').trim();
        const recordKey = userId;
        const newRecord = `${recordKey}:${roleData.name}:${roleData.color}:${roleData.roleId || ''}`;
        
        const lines = data.split('\n').filter(line => line.trim() !== '');
        const existingIndex = lines.findIndex(line => line.startsWith(recordKey + ':'));
        
        if (existingIndex !== -1) {
            lines[existingIndex] = newRecord;
        } else {
            lines.push(newRecord);
        }
        
        fs.writeFileSync(boosterRolesFilePath, lines.join('\n'), 'utf-8');
    }
    
    // Function to get saved booster role data
    function getSavedBoosterRole(userId) {
        if (!fs.existsSync(boosterRolesFilePath)) {
            return null;
        }
        
        const data = fs.readFileSync(boosterRolesFilePath, 'utf-8').trim();
        if (!data) return null;
        
        const userRecord = data.split('\n').find(line => line.startsWith(userId + ':'));
        if (userRecord) {
            const [id, name, color, roleId] = userRecord.split(':');
            return {
                name: name || '',
                color: color || '#9932CC',
                roleId: roleId || null
            };
        }
        
        return null;
    }
    
    // Function to remove saved booster role data
    function removeSavedBoosterRole(userId) {
        if (!fs.existsSync(boosterRolesFilePath)) {
            return;
        }
        
        let data = fs.readFileSync(boosterRolesFilePath, 'utf-8').trim();
        if (!data) return;
        
        const lines = data.split('\n').filter(line => 
            line.trim() !== '' && !line.startsWith(userId + ':')
        );
        
        fs.writeFileSync(boosterRolesFilePath, lines.join('\n'), 'utf-8');
    }
};