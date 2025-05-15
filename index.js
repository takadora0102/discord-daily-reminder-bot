const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
} = require('discord.js');
require('dotenv').config();
const { saveTaskToNotion } = require('./saveTaskToNotion');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});

const TARGET_USER_ID = process.env.TARGET_USER_ID;

client.once('ready', async () => {
  console.log(`✅ Bot started as ${client.user.tag}`);

  const user = await client.users.fetch(TARGET_USER_ID);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('add_task')
      .setLabel('📌 タスクを追加')
      .setStyle(ButtonStyle.Primary)
  );

  await user.send({
    content: '📋 タスクを追加するには以下のボタンを押してください：',
    components: [row],
  });
});
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton() && interaction.customId === 'add_task') {
      const modal = new ModalBuilder()
        .setCustomId('task_modal')
        .setTitle('タスクを追加');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('task_name')
            .setLabel('タスク名')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('task_deadline')
            .setLabel('期限 (YYYY-MM-DD)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('task_type')
            .setLabel('種類（To Do等）')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('task_description')
            .setLabel('内容')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
        )
      );

      await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'task_modal') {
      await interaction.deferReply({ ephemeral: true });

      const title = interaction.fields.getTextInputValue('task_name');
      const deadline = interaction.fields.getTextInputValue('task_deadline');
      const type = interaction.fields.getTextInputValue('task_type');
      const description = interaction.fields.getTextInputValue('task_description');

      const result = await saveTaskToNotion({ title, deadline, type, description });

      await interaction.editReply({
        content: result.success
          ? '✅ タスクをNotionに追加しました！'
          : '❌ タスクの追加に失敗しました。',
      });
    }
  } catch (e) {
    console.error('❌ Interaction エラー:', e);
  }
});

client.login(process.env.TOKEN);
