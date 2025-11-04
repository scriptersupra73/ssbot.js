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
  InteractionType,
  Collection,
  REST,
  Routes,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) throw new Error('Please set DISCORD_TOKEN in .env');

const LOG_CHANNEL_ID = '1433248485221732455';
const WELCOME_CHANNEL_ID = '1433206382416363754';
const BUDGET_CHANNEL_ID = '1433933002219454524';

const COLORS = {
  SUCCESS: 0x57f287,
  ERROR: 0xed4245,
  INFO: 0x5865f2,
  WARNING: 0xfee75c,
  CLAIM: 0x9b59b6,
  BUDGET: 0x3498db,
  NEUTRAL: 0x2f3136
};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.Reaction],
});

// In-memory budget (robux & usd)
const budget = {
  robux: { total: 0, history: [] },
  usd: { total: 0, history: [] },
};

// In-memory giveaways map: messageId -> giveaway data
// Giveaway data: { prize, hostId, endsAt, winners, entries: Set(userId), timeout, channelId }
const giveaways = new Map();

// Helper: styled embed factory
function styledEmbed({ title, description, color = COLORS.NEUTRAL, thumbnail, fields, footer, timestamp = true }) {
  const e = new EmbedBuilder()
    .setTitle(title || null)
    .setDescription(description || null)
    .setColor(color);
  if (thumbnail) e.setThumbnail(thumbnail);
  if (fields && fields.length) e.addFields(fields);
  if (footer) e.setFooter(footer);
  if (timestamp) e.setTimestamp();
  return e;
}

// Utility: parse duration strings like 10m, 1h, 2d, 30s
function parseDuration(str) {
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const match = /^(\d+)([smhd])$/.exec(str);
  if (!match) return null;
  const num = Number(match[1]);
  const unit = match[2];
  return num * map[unit];
}

// Utility: pick random items from array, unique
function chooseRandom(arr, count) {
  const copy = Array.from(arr);
  if (count >= copy.length) return copy;
  const picked = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);
  }
  return picked;
}

// Register slash commands to each guild the bot is in on ready (simple dev-friendly approach)
async function registerCommands(guildIds = []) {
  const commands = [
    {
      name: 'ticket',
      description: 'Open the ticket panel',
    },
    {
      name: 'embed',
      description: 'Send a polished embed',
      options: [
        { name: 'title', type: 3, description: 'Title', required: true },
        { name: 'description', type: 3, description: 'Description', required: true },
        { name: 'color', type: 3, description: 'Hex color (e.g. 5865F2)', required: false },
        { name: 'image', type: 3, description: 'Image URL', required: false },
      ]
    },
    {
      name: 'claim',
      description: 'Claim this ticket',
    },
    {
      name: 'add',
      description: 'Add to budget',
      options: [
        { name: 'currency', type: 3, description: 'robux or usd', required: true },
        { name: 'amount', type: 10, description: 'Amount to add', required: true }
      ]
    },
    {
      name: 'remove',
      description: 'Remove from budget',
      options: [
        { name: 'currency', type: 3, description: 'robux or usd', required: true },
        { name: 'amount', type: 10, description: 'Amount to remove', required: true }
      ]
    },
    {
      name: 'availability',
      description: 'Update availability',
      options: [
        { name: 'status', type: 3, description: 'Online / Away / Busy', required: true },
        { name: 'hours', type: 3, description: 'Active hours', required: true }
      ]
    },
    {
      name: 'clockin',
      description: 'Clock in and submit tasks'
    },
    {
      name: 'clockout',
      description: 'Clock out'
    },
    {
      name: 'delete',
      description: 'Delete this ticket (staff only)'
    },
    {
      name: 'giveaway',
      description: 'Create a giveaway in this channel',
      options: [
        { name: 'prize', type: 3, description: 'Prize to give', required: true },
        { name: 'duration', type: 3, description: 'Duration (e.g. 10m, 1h, 1d)', required: true },
        { name: 'winners', type: 4, description: 'Number of winners', required: true }
      ]
    }
  ];

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  if (guildIds.length === 0) {
    // register globally (may take up to 1 hour to propagate). For dev, better to register per-guild
    try {
      console.log('Registering global commands...');
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      console.log('Global commands registered.');
    } catch (err) {
      console.error('Failed to register global commands:', err);
    }
  } else {
    for (const gid of guildIds) {
      try {
        console.log(`Registering commands for guild ${gid}...`);
        await rest.put(Routes.applicationGuildCommands(client.user.id, gid), { body: commands });
        console.log(`Registered commands for ${gid}`);
      } catch (err) {
        console.error(`Failed to register commands for ${gid}:`, err);
      }
    }
  }
}

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  // For dev/test: register commands per guild currently cached
  const guildIds = client.guilds.cache.map(g => g.id);
  await registerCommands(guildIds); // remove or change to [] for global registration
});

// Welcome message (polished)
client.on('guildMemberAdd', async (member) => {
  try {
    const ch = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!ch) {
      console.log('Welcome channel not found');
      return;
    }
    const embed = styledEmbed({
      title: `👋 Welcome, ${member.displayName}!`,
      description: `You are member **#${member.guild.memberCount}** of Smiley Services.\n\nUse \`/ticket\` to get started — our staff will help you shortly.`,
      color: COLORS.INFO,
      thumbnail: member.displayAvatarURL(),
      footer: { text: 'Smiley Services Bot', iconURL: client.user.displayAvatarURL() }
    });
    await ch.send({ content: `🎉 Welcome <@${member.id}>!`, embeds: [embed] });
  } catch (err) {
    console.error('Error sending welcome message', err);
  }
});

// Interaction handling
client.on('interactionCreate', async (interaction) => {
  try {
    // Utility helpers inside handler
    const guild = interaction.guild;
    const logChannel = guild ? guild.channels.cache.get(LOG_CHANNEL_ID) : null;
    const budgetChannel = guild ? guild.channels.cache.get(BUDGET_CHANNEL_ID) : null;
    const ticketRole = guild ? guild.roles.cache.find(r => r.name === 'Ticket RDS') : null;
    const hasTicketRDS = interaction.member?.roles?.cache?.has(ticketRole?.id) || false;

    // BUTTONS: giveaway enter / end, ticket delete confirm/cancel
    if (interaction.isButton()) {
      const [action, payload] = interaction.customId.split(':'); // e.g. giveaway:messageId, confirmDelete:channelId
      // Giveaway: join
      if (action === 'giveaway') {
        const msgId = payload;
        const g = giveaways.get(msgId);
        if (!g) return interaction.reply({ content: 'This giveaway is no longer active.', ephemeral: true });

        // add entry
        g.entries.add(interaction.user.id);
        return interaction.reply({ content: '✅ You entered the giveaway!', ephemeral: true });
      }

      // Giveaway: end early (only host or staff)
      if (action === 'giveawayEnd') {
        const msgId = payload;
        const g = giveaways.get(msgId);
        if (!g) return interaction.reply({ content: 'Giveaway not found or already ended.', ephemeral: true });

        if (interaction.user.id !== g.hostId && !hasTicketRDS) {
          return interaction.reply({ content: 'You do not have permission to end this giveaway early.', ephemeral: true });
        }

        // clear timeout and immediately finish
        clearTimeout(g.timeout);
        finishGiveaway(msgId).catch(e => console.error('Error finishing giveaway early:', e));
        return interaction.reply({ content: '⏱️ Giveaway ending now...', ephemeral: true });
      }

      // Ticket delete confirm / cancel
      if (action === 'confirmDelete') {
        if (!hasTicketRDS) return interaction.reply({ content: 'You lack permissions to delete tickets.', ephemeral: true });
        await interaction.reply({ content: 'Deleting ticket...', ephemeral: true });
        // delete the channel where the button was pressed (if it's in a ticket channel)
        if (interaction.channel?.deletable) await interaction.channel.delete().catch(() => null);
        return;
      }
      if (action === 'cancelDelete') {
        const embed = styledEmbed({ title: '🚫 Cancelled', description: 'Ticket deletion cancelled.', color: COLORS.WARNING });
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    // MODAL submit (clockin)
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'clockin_modal') {
      const tasks = interaction.fields.getTextInputValue('tasks');
      const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: 'numeric', hour12: true });

      const embed = styledEmbed({
        title: '⏰ Clocked In',
        description: `**${interaction.user.username}** has clocked in.\n\n**Time:** ${now}\n\n**Tasks:**\n${tasks}`,
        color: COLORS.SUCCESS,
        thumbnail: interaction.user.displayAvatarURL(),
        footer: { text: 'Smiley Services Bot', iconURL: client.user.displayAvatarURL() }
      });

      await interaction.reply({ embeds: [embed], ephemeral: true });
      if (logChannel) {
        const logEmbed = styledEmbed({
          title: '⏰ Clock In',
          description: `<@${interaction.user.id}> clocked in`,
          fields: [
            { name: '⏱️ Time', value: now },
            { name: '📝 Tasks', value: tasks }
          ],
          color: COLORS.SUCCESS
        });
        logChannel.send({ embeds: [logEmbed] }).catch(() => null);
      }
      return;
    }

    // Slash command handling
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      // Permission: staff-only commands
      const staffCommands = ['delete', 'availability', 'clockin', 'clockout', 'add', 'remove', 'claim', 'embed'];
      if (staffCommands.includes(cmd) && !hasTicketRDS) {
        const e = styledEmbed({ title: '❌ Permission Denied', description: 'You need the **Ticket RDS** role to use this command.', color: COLORS.ERROR });
        return interaction.reply({ embeds: [e], ephemeral: true });
      }

      // TICKET command - displays a panel with buttons
      if (cmd === 'ticket') {
        const embed = styledEmbed({
          title: '🎫 Tickets',
          description: '**Choose the ticket type below**\n\n🛒 Buying — Purchase services\n💼 Commission — Custom work\n💰 Investor — Investment questions\n❓ Help — General support',
          color: COLORS.INFO,
          footer: { text: 'Smiley Services Support', iconURL: client.user.displayAvatarURL() }
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket:buy').setLabel('🛒 Buying').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('ticket:commission').setLabel('💼 Commission').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('ticket:investor').setLabel('💰 Investor').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('ticket:help').setLabel('❓ Help').setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({ embeds: [embed], components: [row] });
      }

      // EMBED command
      if (cmd === 'embed') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const colorStr = interaction.options.getString('color') || '5865F2';
        const imageUrl = interaction.options.getString('image');

        const embed = styledEmbed({
          title,
          description,
          color: Number.parseInt(colorStr, 16) || COLORS.INFO,
          thumbnail: undefined,
          footer: { text: 'Smiley Services Bot', iconURL: client.user.displayAvatarURL() }
        });
        if (imageUrl) embed.setImage(imageUrl);

        await interaction.reply({ embeds: [styledEmbed({ title: '✅ Embed Sent', description: 'Your embed has been posted!', color: COLORS.SUCCESS })], ephemeral: true });
        await interaction.channel.send({ embeds: [embed] });
        return;
      }

      // CLAIM command
      if (cmd === 'claim') {
        if (!interaction.channel.name?.includes('ticket')) {
          const e = styledEmbed({ title: '❌ Invalid Channel', description: 'This command can only be used in ticket channels.', color: COLORS.ERROR });
          return interaction.reply({ embeds: [e], ephemeral: true });
        }

        const embed = styledEmbed({
          title: '🎫 Ticket Claimed',
          description: `This ticket has been claimed by <@${interaction.user.id}> — they will assist you shortly.`,
          color: COLORS.CLAIM,
          thumbnail: interaction.user.displayAvatarURL(),
          footer: { text: `Claimed by ${interaction.user.tag}`, iconURL: client.user.displayAvatarURL() }
        });

        await interaction.reply({ embeds: [embed] });
        if (logChannel) {
          logChannel.send({ embeds: [styledEmbed({ title: '🎫 Ticket Claimed', description: `<@${interaction.user.id}> claimed ${interaction.channel.name}`, color: COLORS.CLAIM })] });
        }
        return;
      }

      // ADD / REMOVE budget
      if (cmd === 'add' || cmd === 'remove') {
        const currency = interaction.options.getString('currency')?.toLowerCase();
        const amount = interaction.options.getNumber('amount');

        if (!currency || !amount) {
          const e = styledEmbed({ title: '❌ Missing Information', description: 'Please provide both currency and amount.', color: COLORS.ERROR });
          return interaction.reply({ embeds: [e], ephemeral: true });
        }
        if (!['robux', 'usd'].includes(currency)) {
          const e = styledEmbed({ title: '❌ Invalid Currency', description: 'Currency must be `robux` or `usd`.', color: COLORS.ERROR });
          return interaction.reply({ embeds: [e], ephemeral: true });
        }

        const isAdd = cmd === 'add';
        const before = budget[currency].total;
        const after = isAdd ? before + amount : Math.max(0, before - amount);
        budget[currency].total = after;
        budget[currency].history.push({
          type: isAdd ? 'add' : 'remove',
          amount,
          user: interaction.user.tag,
          timestamp: new Date().toISOString()
        });

        const embed = styledEmbed({
          title: isAdd ? '💰 Added to Budget' : '💸 Removed from Budget',
          description: `${interaction.user.username} ${isAdd ? 'added' : 'removed'} **${currency === 'robux' ? 'R$' : '$'}${amount.toLocaleString()}** ${isAdd ? 'to' : 'from'} the ${currency.toUpperCase()} budget.`,
          color: isAdd ? COLORS.SUCCESS : COLORS.ERROR,
          thumbnail: interaction.user.displayAvatarURL(),
          footer: { text: 'Smiley Services Budget Tracker', iconURL: client.user.displayAvatarURL() },
          fields: [
            { name: '📊 Previous Total', value: `\`${(currency === 'robux' ? 'R$' : '$') + before.toLocaleString()}\``, inline: true },
            { name: isAdd ? '➕ Added' : '➖ Removed', value: `\`${(currency === 'robux' ? 'R$' : '$') + amount.toLocaleString()}\``, inline: true },
            { name: '💵 New Total', value: `\`${(currency === 'robux' ? 'R$' : '$') + after.toLocaleString()}\``, inline: true }
          ]
        });

        await interaction.reply({ embeds: [styledEmbed({ title: '✅ Budget Updated', description: 'The budget has been updated successfully!', color: COLORS.SUCCESS })], ephemeral: true });
        if (budgetChannel) budgetChannel.send({ embeds: [embed] });
        return;
      }

      // TICKET DELETE (shows confirm buttons)
      if (cmd === 'delete') {
        const embed = styledEmbed({
          title: '⚠️ Delete Ticket?',
          description: '**This will permanently delete the ticket channel.**',
          color: COLORS.WARNING
        });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('confirmDelete:yes').setLabel('✅ Confirm Delete').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('cancelDelete:no').setLabel('❌ Cancel').setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      // AVAILABILITY
      if (cmd === 'availability') {
        const status = interaction.options.getString('status');
        const hours = interaction.options.getString('hours');

        const embed = styledEmbed({
          title: '📅 Availability Updated',
          description: `<@${interaction.user.id}> updated their availability.`,
          color: COLORS.INFO,
          thumbnail: interaction.user.displayAvatarURL(),
          fields: [
            { name: '🟢 Status', value: `\`${status}\``, inline: true },
            { name: '⏰ Active Hours', value: `\`${hours}\``, inline: true }
          ]
        });

        await interaction.reply({ embeds: [embed] });
        if (logChannel) logChannel.send({ embeds: [styledEmbed({ title: '📅 Availability Update', description: `<@${interaction.user.id}> is now **${status}** and active during **${hours}**`, color: COLORS.INFO })] });
        return;
      }

      // CLOCKIN: show modal
      if (cmd === 'clockin') {
        const modal = new ModalBuilder().setCustomId('clockin_modal').setTitle('⏰ Clock In');

        const taskInput = new TextInputBuilder()
          .setCustomId('tasks')
          .setLabel('What will you work on today?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Enter your tasks...')
          .setRequired(true);

        const row = new ActionRowBuilder().addComponents(taskInput);
        modal.addComponents(row);

        return interaction.showModal(modal);
      }

      // CLOCKOUT
      if (cmd === 'clockout') {
        const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: 'numeric', hour12: true });
        const embed = styledEmbed({
          title: '👋 Clocked Out',
          description: `**${interaction.user.username}** has clocked out.\n\n**Time:** ${now}\n\nHave a great rest of your day!`,
          color: COLORS.ERROR,
          thumbnail: interaction.user.displayAvatarURL(),
          footer: { text: 'Smiley Services Bot', iconURL: client.user.displayAvatarURL() }
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        if (logChannel) logChannel.send({ embeds: [styledEmbed({ title: '👋 Clock Out', description: `<@${interaction.user.id}> clocked out at ${now}`, color: COLORS.ERROR })] });
        return;
      }

      // GIVEAWAY command - clean UI, button-based entry
      if (cmd === 'giveaway') {
        const prize = interaction.options.getString('prize');
        const durationStr = interaction.options.getString('duration');
        const winners = interaction.options.getInteger('winners');

        const ms = parseDuration(durationStr);
        if (!ms) {
          const e = styledEmbed({ title: '❌ Invalid Duration', description: 'Use `10m`, `1h`, `1d`, or `30s` format.', color: COLORS.ERROR });
          return interaction.reply({ embeds: [e], ephemeral: true });
        }
        if (winners < 1 || winners > 10) {
          const e = styledEmbed({ title: '❌ Invalid Winners', description: 'Winners must be between 1 and 10.', color: COLORS.ERROR });
          return interaction.reply({ embeds: [e], ephemeral: true });
        }

        const endsAt = Date.now() + ms;
        const endsAtTimestamp = Math.floor(endsAt / 1000);

        const giveawayEmbed = styledEmbed({
          title: '🎉 Giveaway',
          description: `**Prize:** ${prize}\n**Hosted by:** <@${interaction.user.id}>\n**Winners:** ${winners}\n**Ends:** <t:${endsAtTimestamp}:R>\n\nClick **Enter** to participate!`,
          color: COLORS.BUDGET,
          thumbnail: client.user.displayAvatarURL(),
          footer: { text: 'Smiley Services Giveaway', iconURL: client.user.displayAvatarURL() }
        });

        // Buttons: Enter and End Early
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('giveaway:temp').setLabel('🎉 Enter').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('giveawayEnd:temp').setLabel('⏱️ End Now').setStyle(ButtonStyle.Danger)
        );

        // Send message and then replace ids with the message id so buttons include message id
        const msg = await interaction.reply({ embeds: [giveawayEmbed], components: [row], fetchReply: true });

        // Update button IDs to include message id so we can identify which giveaway
        const enterId = `giveaway:${msg.id}`;
        const endId = `giveawayEnd:${msg.id}`;
        const updatedRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(enterId).setLabel('🎉 Enter').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(endId).setLabel('⏱️ End Now').setStyle(ButtonStyle.Danger)
        );
        await msg.edit({ components: [updatedRow] });

        // Create giveaway record
        const giveawayData = {
          prize,
          hostId: interaction.user.id,
          endsAt,
          winners,
          entries: new Set(),
          channelId: interaction.channel.id,
          messageId: msg.id,
          timeout: null
        };
        giveaways.set(msg.id, giveawayData);

        // Start timeout to finish the giveaway
        giveawayData.timeout = setTimeout(() => {
          finishGiveaway(msg.id).catch(e => console.error('finishGiveaway error', e));
        }, ms);

        // Optional: log to log channel
        if (logChannel) {
          logChannel.send({ embeds: [styledEmbed({ title: '🎁 Giveaway Started', description: `<@${interaction.user.id}> started a giveaway for **${prize}** (ends <t:${endsAtTimestamp}:R>)`, color: COLORS.INFO })] }).catch(() => null);
        }

        return;
      }
    }
  } catch (err) {
    console.error('Interaction error:', err);
    try {
      const e = styledEmbed({ title: '❌ Error', description: 'Something went wrong. Please try again later.', color: COLORS.ERROR });
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [e], ephemeral: true }).catch(() => null);
      } else {
        await interaction.reply({ embeds: [e], ephemeral: true }).catch(() => null);
      }
    } catch (inner) {
      console.error('Failed to send error message to user', inner);
    }
  }
});

// Finish giveaway helper
async function finishGiveaway(messageId) {
  const g = giveaways.get(messageId);
  if (!g) return;

  giveaways.delete(messageId);

  // fetch channel & message
  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  if (!channel) return;

  const msg = await channel.messages.fetch(messageId).catch(() => null);
  // collect entries
  const entries = Array.from(g.entries); // array of userIds

  // If no entries
  if (entries.length === 0) {
    const noEntriesEmbed = styledEmbed({
      title: '😢 Giveaway Ended',
      description: `No valid entries for **${g.prize}**.`,
      color: COLORS.ERROR
    });
    if (msg) await msg.edit({ embeds: [noEntriesEmbed], components: [] }).catch(() => null);
    return;
  }

  // Pick winners
  const winners = chooseRandom(entries, g.winners);
  const winnersMentions = winners.map(id => `<@${id}>`).join(', ');

  const winnerEmbed = styledEmbed({
    title: '🏆 Giveaway Ended!',
    description: `**Prize:** ${g.prize}\n**Winners:** ${winnersMentions}\n**Hosted by:** <@${g.hostId}>`,
    color: COLORS.SUCCESS,
    thumbnail: client.user.displayAvatarURL()
  });

  if (msg) {
    await msg.edit({ embeds: [winnerEmbed], components: [] }).catch(() => null);
    await msg.reply({ content: `🎉 Congratulations ${winnersMentions}! You won **${g.prize}**!` }).catch(() => null);
  } else {
    // fallback post to channel
    await channel.send({ embeds: [winnerEmbed] }).catch(() => null);
  }

  // optional log to LOG_CHANNEL_ID if available in this guild
  try {
    const guild = channel.guild;
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      logChannel.send({ embeds: [styledEmbed({ title: '🏆 Giveaway Winners', description: `**Prize:** ${g.prize}\n**Winners:** ${winnersMentions}`, color: COLORS.SUCCESS })] }).catch(() => null);
    }
  } catch (err) {
    // ignore
  }

  // clear any leftover timeout (defensive)
  clearTimeout(g.timeout);
}

// Handle dynamic ticket button creation (when user uses ticket buttons)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  // Only handle ticket:* buttons here
  if (!interaction.customId.startsWith('ticket:')) return;

  const type = interaction.customId.split(':')[1]; // buy, commission, investor, help
  const guild = interaction.guild;
  const ticketRole = guild.roles.cache.find(r => r.name === 'Ticket RDS');
  if (!ticketRole) {
    const e = styledEmbed({ title: '❌ Error', description: 'Role "Ticket RDS" not found. Contact an administrator.', color: COLORS.ERROR });
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  // Find category named tickets
  const category = guild.channels.cache.find(c => c.name.toLowerCase() === 'tickets' && c.type === ChannelType.GuildCategory);
  if (!category) {
    const e = styledEmbed({ title: '❌ Error', description: 'Ticket category not found. Contact an administrator.', color: COLORS.ERROR });
    return interaction.reply({ embeds: [e], ephemeral: true });
  }

  // Create channel name safely
  const cleanName = `${type}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);

  const channel = await guild.channels.create({
    name: cleanName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: ticketRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ]
  });

  const embed = styledEmbed({
    title: `🎫 New ${type.charAt(0).toUpperCase() + type.slice(1)} Ticket`,
    description: `Thanks for creating a ticket! <@&${ticketRole.id}> will assist soon.\n\nPlease describe your request in detail.`,
    color: COLORS.INFO,
    footer: { text: `Ticket created by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() }
  });

  await channel.send({ content: `<@${interaction.user.id}> • <@&${ticketRole.id}>`, embeds: [embed] });
  const success = styledEmbed({ title: '✅ Ticket Created', description: `Your ticket has been created: ${channel}`, color: COLORS.SUCCESS });
  return interaction.reply({ embeds: [success], ephemeral: true });
});

// Graceful login
client.login(TOKEN).catch(err => {
  console.error('Failed to login:', err);
});


client.login(process.env.DISCORD_TOKEN);
