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
  PermissionsBitField,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const LOG_CHANNEL_ID = '1433248485221732455';
const WELCOME_CHANNEL_ID = '1433206382416363754';
const BUDGET_CHANNEL_ID = '1433933002219454524';

let budget = {
  robux: 0,
  usd: 0
};

client.once('ready', () => {
  console.log(`🟢 Logged in as ${client.user.tag}`);
});

// 👋 Welcomer Embed
client.on('guildMemberAdd', async member => {
  const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  const memberCount = member.guild.memberCount;

  const embed = new EmbedBuilder()
    .setTitle(`👋 Welcome, ${member.displayName}!`)
    .setDescription(`You are member **#${memberCount}** of Smiley Services.\n\n🎟️ Use \`ticket channel\` to get started or explore the other channels.`)
    .setColor(0x5865F2)
    .setThumbnail(member.displayAvatarURL({ dynamic: true }))
    .setImage('https://media.tenor.com/mUcTW_KLwYwAAAAi/wave-roblox.gif')
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
    const hasTicketRDS = interaction.member?.roles?.cache?.has(ticketRole?.id);
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    const budgetChannel = guild.channels.cache.get(BUDGET_CHANNEL_ID);

    // 📝 Modal Submission (Clockin)
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'clockin_modal') {
      const tasks = interaction.fields.getTextInputValue('tasks');
      const now = new Date().toLocaleString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
      });

      const embed = new EmbedBuilder()
        .setTitle(`✅ ${interaction.user.username} Clocked In`)
        .setDescription(`🕒 **${now}**\n\n📋 **Tasks / Jobs:**\n${tasks}`)
        .setColor(0x57F287)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: 'Smiley Services Bot', iconURL: client.user.displayAvatarURL() });

      await interaction.reply({ embeds: [embed], ephemeral: true });

      if (logChannel) {
        logChannel.send(`✅ <@${interaction.user.id}> clocked in.\n🕒 ${now}\n📋 Tasks:\n${tasks}`);
      }
      return;
    }

    // 🎯 Slash Commands
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      if (['ticket', 'delete', 'availability', 'clockin', 'clockout', 'add', 'remove'].includes(cmd) && !hasTicketRDS) {
        return await interaction.reply({ content: '⛔ You do not have permission to use this command.', ephemeral: true });
      }

      // 💰 Budget Commands
      if (cmd === 'add' || cmd === 'remove') {
        const currency = interaction.options.getString('currency');
        const amount = interaction.options.getNumber('amount');

        if (!['robux', 'usd'].includes(currency)) {
          return await interaction.reply({ content: '❌ Invalid currency. Use `robux` or `usd`.', ephemeral: true });
        }

        const isAdding = cmd === 'add';
        const symbol = currency === 'robux' ? '🪙 R$' : '💵 $';
        const before = budget[currency];
        const after = isAdding ? before + amount : Math.max(0, before - amount);
        budget[currency] = after;

        const embed = new EmbedBuilder()
          .setTitle(`${isAdding ? '➕ Added' : '➖ Removed'} ${symbol}${amount}`)
          .setDescription(`**${interaction.user.username}** ${isAdding ? 'added to' : 'removed from'} the ${currency.toUpperCase()} budget.`)
          .addFields(
            { name: 'Previous Total', value: `${symbol}${before}`, inline: true },
            { name: isAdding ? 'Added' : 'Removed', value: `${symbol}${amount}`, inline: true },
            { name: 'New Total', value: `${symbol}${after}`, inline: true }
          )
          .setColor(isAdding ? 0x57F287 : 0xED4245)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .setFooter({ text: 'Smiley Services Budget Tracker', iconURL: client.user.displayAvatarURL() })
          .setTimestamp();

        await interaction.reply({ content: `✅ Budget updated.`, ephemeral: true });
        if (budgetChannel) {
          budgetChannel.send({ embeds: [embed] });
        }
        return;
      }

      // 🎫 Ticket Panel
      if (cmd === 'ticket') {
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
        return;
      }

      // 🗑️ Delete Ticket
      if (cmd === 'delete') {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('confirm_delete').setLabel('Confirm Delete').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('cancel_delete').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ content: 'Are you sure you want to delete this ticket?', components: [row] });
        return;
      }

      // 📋 Availability
      if (cmd === 'availability') {
        const status = interaction.options.getString('status');
        const hours = interaction.options.getString('hours');

        await interaction.reply({
          content: `📋 <@${interaction.user.id}> updated availability:\nStatus: **${status}**\nActive Hours: **${hours}**`,
          ephemeral: false
        });

        if (logChannel) {
          logChannel.send(`📢 <@${interaction.user.id}> is now **${status}** and active during **${hours}**`);
        }
        return;
      }

      // 🕒 Clock In Modal Trigger
      if (cmd === 'clockin') {
        const modal = new ModalBuilder()
          .setCustomId('clockin_modal')
          .setTitle('🕒 Clock In — Smiley Services');

        const taskInput = new TextInputBuilder()
          .setCustomId('tasks')
          .setLabel('Tasks / Jobs for today')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Enter what you’ll be working on...')
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(taskInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
        return;
      }

      // 🔚 Clock Out
      if (cmd === 'clockout') {
        const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

        const embed = new EmbedBuilder()
          .setTitle(`🔚 ${interaction.user.username} Clocked Out`)
          .setDescription(`🕒 **${now}**`)
          .setColor(0xED4245)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .setFooter({ text: 'Smiley Services Bot
