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
  SlashCommandBuilder,
  Collection
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel, Partials.GuildMember]
});

const LOG_CHANNEL_ID = '1433248485221732455';
const WELCOME_CHANNEL_ID = '1433206382416363754';
const BUDGET_CHANNEL_ID = '1433933002219454524';

let budget = {
  robux: { total: 0, history: [] },
  usd: { total: 0, history: [] }
};

const COLORS = {
  SUCCESS: 0x57F287,
  ERROR: 0xED4245,
  INFO: 0x5865F2,
  WARNING: 0xFEE75C,
  CLAIM: 0x9B59B6,
  BUDGET: 0x3498DB
};

const activeGiveaways = new Map(); // Track active giveaways

client.once('ready', () => {
  console.log('✅ Logged in as ' + client.user.tag);
  console.log('🤖 Bot is ready and online!');
});

/* ------------------------------ WELCOME MESSAGE ------------------------------ */
client.on('guildMemberAdd', async member => {
  try {
    console.log('👋 New member joined: ' + member.user.tag);
    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!welcomeChannel) return;

    const memberCount = member.guild.memberCount;
    const embed = new EmbedBuilder()
      .setTitle('👋 Welcome, ' + member.displayName + '!')
      .setDescription(`You are member **#${memberCount}** of Smiley Services.
⭐⭐⭐⭐⭐ Shop Safe | Develop Quick

Use /ticket to get started.`)
      .setColor(COLORS.INFO)
      .setThumbnail(member.displayAvatarURL())
      .setImage('https://imgur.com/TOPOPxQ.png')
      .setFooter({ text: 'Smiley Services Bot', iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    await welcomeChannel.send({ content: `🎉 Welcome <@${member.id}>!`, embeds: [embed] });
  } catch (error) {
    console.error('❌ Error in guildMemberAdd:', error);
  }
});

/* ------------------------------ INTERACTIONS ------------------------------ */
client.on('interactionCreate', async interaction => {
  try {
    const guild = interaction.guild;
    const ticketRole = guild.roles.cache.find(r => r.name === 'Ticket RDS');
    const hasTicketRDS =
      interaction.member?.roles?.cache?.has(ticketRole ? ticketRole.id : null);
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    const budgetChannel = guild.channels.cache.get(BUDGET_CHANNEL_ID);

    /* ---------------- BUTTON HANDLERS ---------------- */
    if (interaction.isButton()) {
      const id = interaction.customId;

      // Giveaway join button
      if (id.startsWith('giveaway_join_')) {
        const giveawayId = id.split('_')[2];
        const giveaway = activeGiveaways.get(giveawayId);
        if (!giveaway) return await interaction.reply({ content: '❌ Giveaway not found.', ephemeral: true });

        if (giveaway.participants.includes(interaction.user.id)) {
          return await interaction.reply({ content: '⚠️ You already joined this giveaway!', ephemeral: true });
        }

        giveaway.participants.push(interaction.user.id);
        await interaction.reply({ content: '🎉 You have joined the giveaway!', ephemeral: true });
        return;
      }

      // Ticket-related buttons remain unchanged...
      // (existing ticket creation logic here)
    }

    /* ---------------- MODAL SUBMISSIONS ---------------- */
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === 'clockin_modal') {
      const tasks = interaction.fields.getTextInputValue('tasks');
      const now = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

      const embed = new EmbedBuilder()
        .setTitle('⏰ Clocked In')
        .setDescription(`**${interaction.user.username}** has clocked in!\n\n**Time:** ${now}\n\n**Tasks for today:**\n${tasks}`)
        .setColor(COLORS.SUCCESS)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setFooter({ text: 'Smiley Services Bot', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: true });
      if (logChannel) logChannel.send({ embeds: [embed] });
      return;
    }

    /* ---------------- SLASH COMMANDS ---------------- */
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      // Permission check for Ticket RDS
      const restricted = ['delete', 'availability', 'clockin', 'clockout', 'add', 'remove', 'claim', 'embed', 'giveaway'];
      if (restricted.includes(cmd) && !hasTicketRDS) {
        const errorEmbed = new EmbedBuilder()
          .setTitle('❌ Permission Denied')
          .setDescription('You need the **Ticket RDS** role to use this command.')
          .setColor(COLORS.ERROR);
        return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }

      /* ---------------- /GIVEAWAY COMMAND ---------------- */
      if (cmd === 'giveaway') {
        const prize = interaction.options.getString('prize');
        const durationStr = interaction.options.getString('duration');
        const winnerCount = interaction.options.getInteger('winners');

        // Parse duration
        const durationMs = parseDuration(durationStr);
        if (!durationMs) {
          return await interaction.reply({
            content: '❌ Invalid duration. Use formats like `10m`, `1h`, or `2d`.',
            ephemeral: true
          });
        }

        const giveawayId = Date.now().toString();
        const embed = new EmbedBuilder()
          .setTitle('🎉 Giveaway Started!')
          .setDescription(`**Prize:** ${prize}\n**Winners:** ${winnerCount}\n**Hosted by:** <@${interaction.user.id}>\n\nClick the button below to join!`)
          .setColor(COLORS.INFO)
          .setTimestamp(Date.now() + durationMs)
          .setFooter({ text: `Ends in ${durationStr}` });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`giveaway_join_${giveawayId}`)
            .setLabel('🎉 Join Giveaway')
            .setStyle(ButtonStyle.Success)
        );

        const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        // Save giveaway data
        activeGiveaways.set(giveawayId, {
          id: giveawayId,
          prize,
          winnerCount,
          participants: [],
          channelId: interaction.channel.id,
          messageId: message.id,
          endTime: Date.now() + durationMs
        });

        // End giveaway after duration
        setTimeout(async () => {
          const giveaway = activeGiveaways.get(giveawayId);
          if (!giveaway) return;

          const participants = giveaway.participants;
          if (participants.length === 0) {
            const noWin = new EmbedBuilder()
              .setTitle('🎉 Giveaway Ended!')
              .setDescription(`**Prize:** ${prize}\nNo participants joined.`)
              .setColor(COLORS.ERROR);
            await interaction.channel.send({ embeds: [noWin] });
          } else {
            const winners = pickRandom(participants, winnerCount);
            const winEmbed = new EmbedBuilder()
              .setTitle('🎉 Giveaway Ended!')
              .setDescription(`**Prize:** ${prize}\n**Winner(s):** ${winners.map(id => `<@${id}>`).join(', ')}`)
              .setColor(COLORS.SUCCESS);
            await interaction.channel.send({ embeds: [winEmbed] });
          }

          activeGiveaways.delete(giveawayId);
        }, durationMs);
        return;
      }

      // keep your other slash commands here (ticket, embed, add/remove, etc.)
    }
  } catch (error) {
    console.error('❌ Interaction error:', error);
  }
});

/* ------------------------------ HELPERS ------------------------------ */
function parseDuration(str) {
  const match = str.match(/(\d+)(s|m|h|d)/);
  if (!match) return null;
  const num = parseInt(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * multipliers[unit];
}

function pickRandom(arr, count) {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/* ------------------------------ LOGIN ------------------------------ */
client.login(process.env.DISCORD_TOKEN);
