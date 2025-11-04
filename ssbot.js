require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.GuildMember]
});

const LOG_CHANNEL_ID = '1433248485221732455';
const WELCOME_CHANNEL_ID = '1433206382416363754';
const BUDGET_CHANNEL_ID = '1433933002219454524';

// Enhanced budget tracking with categories
let budget = {
  robux: { total: 0, history: [] },
  usd: { total: 0, history: [] }
};

// Color scheme for consistent branding
const COLORS = {
  SUCCESS: 0x57F287,    // Green
  ERROR: 0xED4245,      // Red
  INFO: 0x5865F2,       // Blue
  WARNING: 0xFEE75C,    // Yellow
  CLAIM: 0x9B59B6,      // Purple
  BUDGET: 0x3498DB      // Light Blue
};

client.once('ready', () => {
  console.log('✅ Logged in as ' + client.user.tag);
  console.log('🤖 Bot is ready and online!');
});

// Enhanced Welcome Message
client.on('guildMemberAdd', async member => {
  try {
    console.log('👋 New member joined: ' + member.user.tag);
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!welcomeChannel) {
      console.log('❌ Welcome channel not found');
      return;
    }
    const memberCount = member.guild.memberCount;
    const embed = new EmbedBuilder()
      .setTitle('👋 Welcome, ' + member.displayName + '!')
      .setDescription('You are member **#' + memberCount + '** of Smiley Services.\n⭐⭐⭐⭐⭐ Shop Safe | Develop Quick\n\nUse `/ticket` to get started.')
      .setColor(COLORS.INFO)
      .setThumbnail(member.displayAvatarURL())
      .setImage('https://i.imgur.com/TOPOPxQ.png')
      .setFooter({ text: 'Smiley Services Bot', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    await welcomeChannel.send({ content: '🎉 Welcome <@' + member.id + '>!', embeds: [embed] });
    console.log('✅ Welcome message sent');
  } catch (error) {
    console.error('❌ Error in guildMemberAdd:', error);
  }
});

client.on('interactionCreate', async interaction => {
  try {
    const guild = interaction.guild;
    const ticketRole = guild.roles.cache.find(r => r.name === 'Ticket RDS');
    const hasTicketRDS = interaction.member && interaction.member.roles && interaction.member.roles.cache && interaction.member.roles.cache.has(ticketRole ? ticketRole.id : null);
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    const budgetChannel = guild.channels.cache.get(BUDGET_CHANNEL_ID);

    // Button Interactions
    if (interaction.isButton()) {
      const ticketType = interaction.customId;

      // Ticket Creation Buttons
      if (['buy', 'commission', 'investor', 'help'].includes(ticketType)) {
        const category = guild.channels.cache.find(c => c.name === 'tickets' && c.type === ChannelType.GuildCategory);
        if (!category) {
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('Ticket category not found. Please contact an administrator.')
            .setColor(COLORS.ERROR);
          return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        if (!ticketRole) {
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('Role "Ticket RDS" not found. Please contact an administrator.')
            .setColor(COLORS.ERROR);
          return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        const channel = await guild.channels.create({
          name: ticketType + '-' + interaction.user.username,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: ticketRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]
        });

        const ticketEmbed = new EmbedBuilder()
          .setTitle('🎫 New ' + ticketType.charAt(0).toUpperCase() + ticketType.slice(1) + ' Ticket')
          .setDescription('Thank you for creating a ticket!\n\n<@&' + ticketRole.id + '> will assist you shortly.\n\nPlease describe your request in detail.')
          .setColor(COLORS.INFO)
          .setFooter({ text: 'Ticket created by ' + interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
          .setTimestamp();

        await channel.send({ content: '<@' + interaction.user.id + '> • <@&' + ticketRole.id + '>', embeds: [ticketEmbed] });

        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Ticket Created')
          .setDescription('Your ticket has been created: ' + channel)
          .setColor(COLORS.SUCCESS);
        await interaction.reply({ embeds: [successEmbed], ephemeral: true });
        return;
      }

      if (ticketType === 'confirm_delete') {
        if (!hasTicketRDS) {
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Permission Denied')
            .setDescription('You do not have permission to delete tickets.')
            .setColor(COLORS.ERROR);
          return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
        await interaction.deferReply({ ephemeral: true });
        await interaction.channel.delete();
        return;
      }

      if (ticketType === 'cancel_delete') {
        const cancelEmbed = new EmbedBuilder()
          .setTitle('🚫 Cancelled')
          .setDescription('Ticket deletion has been cancelled.')
          .setColor(COLORS.WARNING);
        await interaction.reply({ embeds: [cancelEmbed], ephemeral: true });
        return;
      }
    }

    // Modal Submissions
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'clockin_modal') {
      const tasks = interaction.fields.getTextInputValue('tasks');
      const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: 'numeric', hour12: true });

      const embed = new EmbedBuilder()
        .setTitle('⏰ Clocked In')
        .setDescription('**' + interaction.user.username + '** has clocked in!\n\n**Time:** ' + now + '\n\n**Tasks for today:**\n' + tasks)
        .setColor(COLORS.SUCCESS)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setFooter({ text: 'Smiley Services Bot', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });

      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('⏰ Clock In')
          .setDescription('<@' + interaction.user.id + '> clocked in')
          .addFields(
            { name: '⏱️ Time', value: now },
            { name: '📝 Tasks', value: tasks }
          )
          .setColor(COLORS.SUCCESS)
          .setTimestamp();
        logChannel.send({ embeds: [logEmbed] });
      }
      return;
    }

    // Slash Commands
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      // Permission check for staff commands
      if (['delete', 'availability', 'clockin', 'clockout', 'add', 'remove', 'claim', 'embed'].includes(cmd) && !hasTicketRDS) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Permission Denied')
          .setDescription('You need the **Ticket RDS** role to use this command.')
          .setColor(COLORS.ERROR);
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      // EMBED COMMAND
      if (cmd === 'embed') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const color = interaction.options.getString('color') || '5865F2';
        const imageUrl = interaction.options.getString('image');

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setDescription(description)
          .setColor(parseInt(color, 16))
          .setFooter({ text: 'Smiley Services Bot', iconURL: client.user.displayAvatarURL() })
          .setTimestamp();

        if (imageUrl) {
          embed.setImage(imageUrl);
        }

        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Embed Sent')
          .setDescription('Your custom embed has been posted!')
          .setColor(COLORS.SUCCESS);
        await interaction.reply({ embeds: [successEmbed], ephemeral: true });
        await interaction.channel.send({ embeds: [embed] });
        return;
      }

      // CLAIM COMMAND
      if (cmd === 'claim') {
        if (!interaction.channel.name.includes('ticket')) {
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Invalid Channel')
            .setDescription('This command can only be used in ticket channels.')
            .setColor(COLORS.ERROR);
          return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        const embed = new EmbedBuilder()
          .setTitle('🎫 Ticket Claimed')
          .setDescription('This ticket has been claimed by <@' + interaction.user.id + '>\n\nThey will assist you shortly!')
          .setColor(COLORS.CLAIM)
          .setThumbnail(interaction.user.displayAvatarURL())
          .setFooter({ text: 'Claimed by ' + interaction.user.tag, iconURL: client.user.displayAvatarURL() })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('🎫 Ticket Claimed')
            .setDescription('<@' + interaction.user.id + '> claimed ticket: `' + interaction.channel.name + '`')
            .setColor(COLORS.CLAIM)
            .setTimestamp();
          logChannel.send({ embeds: [logEmbed] });
        }
        return;
      }

      // ADD/REMOVE BUDGET COMMANDS
      if (cmd === 'add' || cmd === 'remove') {
        const currency = interaction.options.getString('currency');
        const amount = interaction.options.getNumber('amount');

        if (!currency || !amount) {
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Missing Information')
            .setDescription('Please provide both currency and amount.')
            .setColor(COLORS.ERROR);
          return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        if (!['robux', 'usd'].includes(currency)) {
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Invalid Currency')
            .setDescription('Currency must be either `robux` or `usd`.')
            .setColor(COLORS.ERROR);
          return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }

        const isAdding = cmd === 'add';
        const symbol = currency === 'robux' ? 'R$' : '$';
        const before = budget[currency].total;
        const after = isAdding ? before + amount : Math.max(0, before - amount);
        budget[currency].total = after;

        // Add to history
        budget[currency].history.push({
          type: isAdding ? 'add' : 'remove',
          amount: amount,
          user: interaction.user.tag,
          timestamp: new Date().toISOString()
        });

        const embed = new EmbedBuilder()
          .setTitle((isAdding ? '💰 Added to Budget' : '💸 Removed from Budget'))
          .setDescription(interaction.user.username + ' ' + (isAdding ? 'added' : 'removed') + ' **' + symbol + amount.toLocaleString() + '** ' + (isAdding ? 'to' : 'from') + ' the ' + currency.toUpperCase() + ' budget.')
          .addFields(
            { name: '📊 Previous Total', value: '`' + symbol + before.toLocaleString() + '`', inline: true },
            { name: (isAdding ? '➕ Added' : '➖ Removed'), value: '`' + symbol + amount.toLocaleString() + '`', inline: true },
            { name: '💵 New Total', value: '`' + symbol + after.toLocaleString() + '`', inline: true }
          )
          .setColor(isAdding ? COLORS.SUCCESS : COLORS.ERROR)
          .setThumbnail(interaction.user.displayAvatarURL())
          .setFooter({ text: 'Smiley Services Budget Tracker', iconURL: client.user.displayAvatarURL() })
          .setTimestamp();

        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Budget Updated')
          .setDescription('The budget has been updated successfully!')
          .setColor(COLORS.SUCCESS);
        await interaction.reply({ embeds: [successEmbed], ephemeral: true });

        if (budgetChannel) {
          budgetChannel.send({ embeds: [embed] });
        }
        return;
      }

      // TICKET COMMAND
      if (cmd === 'ticket') {
        const embed = new EmbedBuilder()
          .setTitle('🎫 TICKETS')
          .setDescription('**Choose your ticket type below:**\n\n🛒 **Buying** - Purchase services or products\n💼 **Commission** - Request custom work\n💰 **Investor** - Investment inquiries\n❓ **Help** - General support')
          .setColor(COLORS.INFO)
          .setFooter({ text: 'Smiley Services Support', iconURL: client.user.displayAvatarURL() });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('buy').setLabel('🛒 Buying').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('commission').setLabel('💼 Commission').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('investor').setLabel('💰 Investor').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('help').setLabel('❓ Help').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
        return;
      }

      // DELETE COMMAND
      if (cmd === 'delete') {
        const embed = new EmbedBuilder()
          .setTitle('⚠️ Delete Ticket?')
          .setDescription('Are you sure you want to delete this ticket?\n\n**This action cannot be undone.**')
          .setColor(COLORS.WARNING);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('confirm_delete').setLabel('✅ Confirm Delete').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('cancel_delete').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
        return;
      }

      // AVAILABILITY COMMAND
      if (cmd === 'availability') {
        const status = interaction.options.getString('status');
        const hours = interaction.options.getString('hours');

        const embed = new EmbedBuilder()
          .setTitle('📅 Availability Updated')
          .setDescription('<@' + interaction.user.id + '> has updated their availability!')
          .addFields(
            { name: '🟢 Status', value: '`' + status + '`', inline: true },
            { name: '⏰ Active Hours', value: '`' + hours + '`', inline: true }
          )
          .setColor(COLORS.INFO)
          .setThumbnail(interaction.user.displayAvatarURL())
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('📅 Availability Update')
            .setDescription('<@' + interaction.user.id + '> is now **' + status + '** and active during **' + hours + '**')
            .setColor(COLORS.INFO)
            .setTimestamp();
          logChannel.send({ embeds: [logEmbed] });
        }
        return;
      }

      // CLOCKIN COMMAND
      if (cmd === 'clockin') {
        const modal = new ModalBuilder()
          .setCustomId('clockin_modal')
          .setTitle('⏰ Clock In');

        const taskInput = new TextInputBuilder()
          .setCustomId('tasks')
          .setLabel('What will you be working on today?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Enter your tasks for today...')
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(taskInput);
        modal.addComponents(row);

        await interaction.showModal(modal);
        return;
      }

      // CLOCKOUT COMMAND
      if (cmd === 'clockout') {
        const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: 'numeric', hour12: true });

        const embed = new EmbedBuilder()
          .setTitle('👋 Clocked Out')
          .setDescription('**' + interaction.user.username + '** has clocked out!\n\n**Time:** ' + now + '\n\nHave a great rest of your day!')
          .setColor(COLORS.ERROR)
          .setThumbnail(interaction.user.displayAvatarURL())
          .setFooter({ text: 'Smiley Services Bot', iconURL: client.user.displayAvatarURL() })
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });

        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle('👋 Clock Out')
            .setDescription('<@' + interaction.user.id + '> clocked out at ' + now)
            .setColor(COLORS.ERROR)
            .setTimestamp();
          logChannel.send({ embeds: [logEmbed] });
        }
        return;
      }
    }
  } catch (error) {
    console.error('❌ Interaction error:', error);
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setDescription('Something went wrong. Please try again later.')
      .setColor(COLORS.ERROR);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
