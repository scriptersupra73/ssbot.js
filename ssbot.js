require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.GuildMember]
});

const LOG_CHANNEL_ID = '1433248485221732455';
const WELCOME_CHANNEL_ID = '1433206382416363754';
const BUDGET_CHANNEL_ID = '1433933002219454524';

let budget = { robux: 0, usd: 0 };

client.once('ready', () => {
  console.log('Logged in as ' + client.user.tag);
});

client.on('guildMemberAdd', async member => {
  try {
    console.log('New member joined: ' + member.user.tag);
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!welcomeChannel) {
      console.log('Welcome channel not found');
      return;
    }
    const memberCount = member.guild.memberCount;
    const embed = new EmbedBuilder()
      .setTitle('Welcome, ' + member.displayName + '!')
      .setDescription('You are member #' + memberCount + ' of Smiley Services. Use /ticket to get started.')
      .setColor(0x5865F2)
      .setThumbnail(member.displayAvatarURL())
      .setImage('https://media.tenor.com/mUcTW_KLwYwAAAAi/wave-roblox.gif')
      .setFooter({ text: 'Smiley Services Bot', iconURL: client.user.displayAvatarURL() });
    await welcomeChannel.send({ content: 'Welcome <@' + member.id + '>!', embeds: [embed] });
    console.log('Welcome message sent');
  } catch (error) {
    console.error('Error in guildMemberAdd:', error);
  }
});

client.on('interactionCreate', async interaction => {
  try {
    const guild = interaction.guild;
    const ticketRole = guild.roles.cache.find(r => r.name === 'Ticket RDS');
    const hasTicketRDS = interaction.member && interaction.member.roles && interaction.member.roles.cache && interaction.member.roles.cache.has(ticketRole ? ticketRole.id : null);
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    const budgetChannel = guild.channels.cache.get(BUDGET_CHANNEL_ID);

    if (interaction.isButton()) {
      const ticketType = interaction.customId;
      if (['buy', 'commission', 'investor', 'help'].includes(ticketType)) {
        const category = guild.channels.cache.find(c => c.name === 'tickets' && c.type === ChannelType.GuildCategory);
        if (!category) {
          return await interaction.reply({ content: 'Ticket category not found.', ephemeral: true });
        }
        if (!ticketRole) {
          return await interaction.reply({ content: 'Role Ticket RDS not found.', ephemeral: true });
        }
        const channel = await guild.channels.create({
          name: ticketType + '-ticket-' + interaction.user.username,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: ticketRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]
        });
        await channel.send('Ticket created by <@' + interaction.user.id + '> for ' + ticketType + '. <@&' + ticketRole.id + '> will assist you.');
        await interaction.reply({ content: 'Ticket created: ' + channel, ephemeral: true });
        return;
      }
      if (ticketType === 'confirm_delete') {
        if (!hasTicketRDS) {
          return await interaction.reply({ content: 'You do not have permission to delete tickets.', ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        await interaction.channel.delete();
        return;
      }
      if (ticketType === 'cancel_delete') {
        await interaction.reply({ content: 'Ticket deletion cancelled.', ephemeral: true });
        return;
      }
    }

    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'clockin_modal') {
      const tasks = interaction.fields.getTextInputValue('tasks');
      const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: 'numeric', hour12: true });
      const embed = new EmbedBuilder()
        .setTitle(interaction.user.username + ' Clocked In')
        .setDescription('Time: ' + now + '\n\nTasks: ' + tasks)
        .setColor(0x57F287)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setFooter({ text: 'Smiley Services Bot', iconURL: client.user.displayAvatarURL() });
      await interaction.reply({ embeds: [embed], ephemeral: true });
      if (logChannel) {
        logChannel.send('<@' + interaction.user.id + '> clocked in. Time: ' + now + '\nTasks: ' + tasks);
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;
      if (['delete', 'availability', 'clockin', 'clockout', 'add', 'remove'].includes(cmd) && !hasTicketRDS) {
        return await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
      }

      if (cmd === 'add' || cmd === 'remove') {
        const currency = interaction.options.getString('currency');
        const amount = interaction.options.getNumber('amount');
        if (!currency || !amount) {
          return await interaction.reply({ content: 'Missing currency or amount.', ephemeral: true });
        }
        if (!['robux', 'usd'].includes(currency)) {
          return await interaction.reply({ content: 'Invalid currency. Use robux or usd.', ephemeral: true });
        }
        const isAdding = cmd === 'add';
        const symbol = currency === 'robux' ? 'R$' : '$';
        const before = budget[currency];
        const after = isAdding ? before + amount : Math.max(0, before - amount);
        budget[currency] = after;
        const embed = new EmbedBuilder()
          .setTitle((isAdding ? 'Added' : 'Removed') + ' ' + symbol + amount)
          .setDescription(interaction.user.username + ' ' + (isAdding ? 'added to' : 'removed from') + ' the ' + currency.toUpperCase() + ' budget.')
          .addFields(
            { name: 'Previous Total', value: symbol + before, inline: true },
            { name: isAdding ? 'Added' : 'Removed', value: symbol + amount, inline: true },
            { name: 'New Total', value: symbol + after, inline: true }
          )
          .setColor(isAdding ? 0x57F287 : 0xED4245)
          .setThumbnail(interaction.user.displayAvatarURL())
          .setFooter({ text: 'Smiley Services Budget Tracker', iconURL: client.user.displayAvatarURL() })
          .setTimestamp();
        await interaction.reply({ content: 'Budget updated.', ephemeral: true });
        if (budgetChannel) {
          budgetChannel.send({ embeds: [embed] });
        }
        return;
      }

      if (cmd === 'ticket') {
        const embed = new EmbedBuilder().setTitle('TICKETS').setDescription('Choose your ticket type below:').setColor(0x2f3136);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('buy').setLabel('Buying').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('commission').setLabel('Commission').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('investor').setLabel('Investor').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('help').setLabel('Help').setStyle(ButtonStyle.Primary)
        );
        await interaction.reply({ embeds: [embed], components: [row] });
        return;
      }

      if (cmd === 'delete') {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('confirm_delete').setLabel('Confirm Delete').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('cancel_delete').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({ content: 'Are you sure you want to delete this ticket?', components: [row] });
        return;
      }

      if (cmd === 'availability') {
        const status = interaction.options.getString('status');
        const hours = interaction.options.getString('hours');
        await interaction.reply({ content: '<@' + interaction.user.id + '> updated availability:\nStatus: ' + status + '\nActive Hours: ' + hours, ephemeral: false });
        if (logChannel) {
          logChannel.send('<@' + interaction.user.id + '> is now ' + status + ' and active during ' + hours);
        }
        return;
      }

      if (cmd === 'clockin') {
        const modal = new ModalBuilder().setCustomId('clockin_modal').setTitle('Clock In');
        const taskInput = new TextInputBuilder().setCustomId('tasks').setLabel('Tasks for today').setStyle(TextInputStyle.Paragraph).setPlaceholder('Enter what you will be working on...').setRequired(true);
        const row = new ActionRowBuilder().addComponents(taskInput);
        modal.addComponents(row);
        await interaction.showModal(modal);
        return;
      }

      if (cmd === 'clockout') {
        const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const embed = new EmbedBuilder()
          .setTitle(interaction.user.username + ' Clocked Out')
          .setDescription('Time: ' + now)
          .setColor(0xED4245)
          .setThumbnail(interaction.user.displayAvatarURL())
          .setFooter({ text: 'Smiley Services Bot', iconURL: client.user.displayAvatarURL() });
        await interaction.reply({ embeds: [embed], ephemeral: true });
        if (logChannel) {
          logChannel.send('<@' + interaction.user.id + '> clocked out at ' + now);
        }
        return;
      }
    }
  } catch (error) {
    console.error('Interaction error:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Something went wrong.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Something went wrong.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
