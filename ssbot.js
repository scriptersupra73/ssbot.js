require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

const LOG_CHANNEL_ID = '1433248485221732455';
const WELCOME_CHANNEL_ID = '1433206382416363754';

client.once('ready', () => {
  console.log(`🟢 Logged in as ${client.user.tag}`);
});

// 👋 Welcomer Embed
client.on('guildMemberAdd', async member => {
  const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  const memberCount = member.guild.memberCount;

  const embed = new EmbedBuilder()
    .setTitle(`👋 Welcome, ${member.displayName}!`)
    .setDescription(`You are member **#${memberCount}** of Smiley Services.\n\n🎟️ Use \`/ticket\` to get started or explore the channels.`)
    .setColor(0x5865F2)
    .setThumbnail(member.displayAvatarURL({ dynamic: true }))
    .setImage('https://media.tenor.com/mUcTW_KLwYwAAAAi/wave-roblox.gif') // Replace with your own hosted .gif
    .setFooter({
      text: 'Smiley Services Bot • Precision meets creativity',
      iconURL: client.user.displayAvatarURL()
    });

  if (welcomeChannel) {
    welcomeChannel.send({ content: `Welcome <@${member.id}>!`, embeds: [embed] });
  }
});

client.on('interactionCreate', async interaction => {
  try {
    const guild = interaction.guild;
    const ticketRole = guild.roles.cache.find(r => r.name === 'Ticket RDS');
    const hasTicketRDS = interaction.member.roles.cache.has(ticketRole?.id);
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);

    if (interaction.isChatInputCommand()) {
      if (['ticket', 'delete', 'availability', 'clockin', 'clockout'].includes(interaction.commandName) && !hasTicketRDS) {
        return await interaction.reply({ content: '⛔ You do not have permission to use this command.', ephemeral: true });
      }

      if (interaction.commandName === 'ticket') {
        const embed = new EmbedBuilder()
          .setTitle('🎫 TICKETS')
          .setDescription('Choose your ticket type below:')
          .setColor(0x2f3136);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('buy').setLabel('Buying').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('commission').setLabel('Commission').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('investor').setLabel('Investor').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('help').setLabel('Help').setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
      }

      if (interaction.commandName === 'delete') {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('confirm_delete').setLabel('Confirm Delete').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('cancel_delete').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ content: 'Are you sure you want to delete this ticket?', components: [row] });
      }

      if (interaction.commandName === 'availability') {
        const status = interaction.options.getString('status');
        const hours = interaction.options.getString('hours');

        await interaction.reply({
          content: `📋 <@${interaction.user.id}> updated availability:\nStatus: **${status}**\nActive Hours: **${hours}**`,
          ephemeral: false
        });

        if (logChannel) {
          logChannel.send(`📢 <@${interaction.user.id}> is now **${status}** and active during **${hours}**`);
        }
      }

      if (interaction.commandName === 'clockin') {
        const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        await interaction.reply({
          content: `🕒 <@${interaction.user.id}> clocked in at **${now}**`,
          ephemeral: false
        });

        if (logChannel) {
          logChannel.send(`✅ <@${interaction.user.id}> clocked in at **${now}**`);
        }
      }

      if (interaction.commandName === 'clockout') {
        const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        await interaction.reply({
          content: `🔚 <@${interaction.user.id}> clocked out at **${now}**`,
          ephemeral: false
        });

        if (logChannel) {
          logChannel.send(`🚪 <@${interaction.user.id}> clocked out at **${now}**`);
        }
      }
    }

    if (interaction.isButton()) {
      const ticketType = interaction.customId;

      if (['buy', 'commission', 'investor', 'help'].includes(ticketType)) {
        const category = guild.channels.cache.find(c => c.name === 'tickets' && c.type === ChannelType.GuildCategory);

        if (!category) {
          return await interaction.reply({ content: '⚠️ Ticket category "tickets" not found.', ephemeral: true });
        }

        if (!ticketRole) {
          return await interaction.reply({ content: '⚠️ Role "Ticket RDS" not found.', ephemeral: true });
        }

        const channel = await guild.channels.create({
          name: `${ticketType}-ticket-${interaction.user.username}`,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: ticketRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]
        });

        await channel.send(`🎫 Ticket created by <@${interaction.user.id}> for **${ticketType}**. <@&${ticketRole.id}> will assist you.`);
        await interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
      }

      if (ticketType === 'confirm_delete') {
        await interaction.deferReply({ ephemeral: true });
        await interaction.channel.delete();
      }

      if (ticketType === 'cancel_delete') {
        await interaction.reply({ content: '❌ Ticket deletion cancelled.', ephemeral: true });
      }
    }
  } catch (error) {
    console.error('❌ Interaction error:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '⚠️ Something went wrong.', ephemeral: true });
    } else {
      await interaction.reply({ content: '⚠️ Something went wrong.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
