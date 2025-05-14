const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  Events,
  Partials
} = require('discord.js');
const cron = require('node-cron');
const dayjs = require('dayjs');
require('dayjs/locale/ja');
dayjs.locale('ja');
require('dotenv').config();

const TOKEN = process.env.TOKEN;
const TARGET_USER_ID = process.env.TARGET_USER_ID;

const schedule = require('./schedule');
const getWeather = require('./getWeather');
const getUpcomingTasks = require('./getNotionTasks');
const timetable = require('./timetable');
const { getFormattedNews } = require('./news');
const { saveTaskToNotion } = require('./saveToNotion');

const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ],
  partials: [Partials.Channel]
});

const buildMessage = async (prefix = 'おはようございます') => {
  const today = dayjs().add(9, 'hour');
  const dayLabel = today.format('dd');
  const todaySchedule = schedule[dayLabel] || ['（時間割未登録）'];
  const scheduleText = todaySchedule.join('\n');
  const weather = await getWeather();
  const taskText = await getUpcomingTasks();

  return `${prefix}！今日は ${today.format('MM月DD日（dd）')} です！\n\n` +
    `${weather ? `🌤️ 天気：${weather.description}\n🌡️ 気温：最高 ${weather.tempMax}℃ / 最低 ${weather.tempMin}℃` : '🌥️ 天気情報を取得できませんでした。'}\n\n` +
    `📚 今日の時間割:\n${scheduleText}\n\n${taskText}`;
};

const parseTime = (timeStr) => {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
};

const formatTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
client.once('ready', async () => {
  console.log(`Bot started as ${client.user.tag}`);
  const user = await client.users.fetch(TARGET_USER_ID);
  const message = await buildMessage('✅ テスト送信');

  const commuteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('go').setLabel('GO').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('back').setLabel('BACK').setStyle(ButtonStyle.Secondary)
  );

  const taskRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('add_task').setLabel('📝 タスクを追加').setStyle(ButtonStyle.Success)
  );

  await user.send({ content: message, components: [commuteRow, taskRow] });
});

client.on(Events.InteractionCreate, async interaction => {
  console.log(`🔔 Interaction received: ${interaction.customId || interaction.type}`);
  try {
    if (interaction.isButton() && interaction.customId === 'add_task') {
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_task_type')
          .setPlaceholder('タスクの種類を選んでください')
          .addOptions([
            { label: 'To Do', value: 'To Do' },
            { label: 'Assignment', value: 'Assignment' },
            { label: 'Test', value: 'Test' },
            { label: 'Others', value: 'Others' }
          ])
      );
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({ content: '📂 タスクの種類を選んでください', components: [row] });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_task_type') {
      const selectedType = interaction.values[0];
      const modal = new ModalBuilder().setCustomId(`modal_task_input|${selectedType}`).setTitle('新しいタスクを追加');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('title').setLabel('🏷 タスク名').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('deadline').setLabel('🗓 締切日（YYYY-MM-DD）').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('description').setLabel('✏️ 説明').setStyle(TextInputStyle.Paragraph).setRequired(false)
        )
      );
      await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_task_input|')) {
      const type = interaction.customId.split('|')[1];
      const title = interaction.fields.getTextInputValue('title');
      const deadline = interaction.fields.getTextInputValue('deadline');
      const description = interaction.fields.getTextInputValue('description');
      await interaction.deferReply({ ephemeral: true });

      const result = await saveTaskToNotion({ title, type, deadline, description });
      if (result.success) {
        await interaction.editReply(`✅ タスク「${title}」を追加しました！`);
      } else {
        await interaction.editReply(`❌ タスクの追加に失敗しました。`);
      }
    }
  } catch (err) {
    console.error('❌ Interactionエラー:', err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply('❌ エラーが発生しました。');
      } else {
        await interaction.reply({ content: '❌ エラーが発生しました。', ephemeral: true });
      }
    } catch {}
  }
});

// 通学・ニュース通知などは省略（ご希望あれば再送可能）
