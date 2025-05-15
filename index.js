const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
  Routes,
  REST,
  Events,
  Partials,
} = require('discord.js');
const cron = require('node-cron');
const dayjs = require('dayjs');
require('dayjs/locale/ja');
dayjs.locale('ja');

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const TARGET_USER_ID = process.env.TARGET_USER_ID;

const schedule = require('./schedule');
const getWeather = require('./getWeather');
const getUpcomingTasks = require('./getNotionTasks');
const { saveTaskToNotion } = require('./saveTaskToNotion');
const { getFormattedNews } = require('./news');
const timetable = require('./timetable');

const pendingTasks = new Map(); // UUID → 一時保存データ
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
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
  console.log(`✅ Bot started as ${client.user.tag}`);

  const user = await client.users.fetch(TARGET_USER_ID);
  const message = await buildMessage('✅ テスト送信');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('add_task').setLabel('📝 タスクを追加').setStyle(ButtonStyle.Primary)
  );

  await user.send({ content: message, components: [row] });
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton() && interaction.customId === 'add_task') {
      const modal = new ModalBuilder().setCustomId('task_modal').setTitle('タスクを追加');

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
            .setLabel('期限 (YYYY-MM-DD または YYYYMMDD)')
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
      const title = interaction.fields.getTextInputValue('task_name');
      let deadline = interaction.fields.getTextInputValue('task_deadline');
      const description = interaction.fields.getTextInputValue('task_description');

      // YYYYMMDD → YYYY-MM-DD に自動変換
      if (/^\d{8}$/.test(deadline)) {
        deadline = `${deadline.slice(0, 4)}-${deadline.slice(4, 6)}-${deadline.slice(6, 8)}`;
      }

      const uuid = uuidv4();
      pendingTasks.set(uuid, { title, deadline, description });

      const select = new SelectMenuBuilder()
        .setCustomId(`task_type_select|${uuid}`)
        .setPlaceholder('タスクの種類を選んでください')
        .addOptions([
          { label: 'To Do', value: 'To Do' },
          { label: 'Assignment', value: 'Assignment' },
          { label: 'Test', value: 'Test' },
          { label: 'Others', value: 'Others' },
        ]);

      const row = new ActionRowBuilder().addComponents(select);
      await interaction.reply({ content: '種類を選択してください：', components: [row], ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('task_type_select')) {
      const [_, uuid] = interaction.customId.split('|');
      const task = pendingTasks.get(uuid);

      if (!task) {
        await interaction.reply({ content: '⚠️ タスク情報が見つかりませんでした。', ephemeral: true });
        return;
      }

      const type = interaction.values[0];
      const result = await saveTaskToNotion({ title: task.title, deadline: task.deadline, type, description: task.description });
      pendingTasks.delete(uuid);
      await interaction.update({
        content: result.success
          ? '✅ タスクをNotionに追加しました！'
          : '❌ タスクの追加に失敗しました。',
        components: [],
      });
    }
  } catch (e) {
    console.error('❌ Interaction処理中エラー:', e);
  }
});

// スラッシュコマンド（任意で `/task` を表示する場合）
const commands = [
  new SlashCommandBuilder()
    .setName('task')
    .setDescription('📝 タスク追加ボタンを表示します'),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ スラッシュコマンド登録成功');
  } catch (err) {
    console.error('❌ スラッシュコマンド登録失敗:', err);
  }
})();
// Webサーバー（Render対応）
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(process.env.PORT || 3000);

// Botログイン
client.login(TOKEN);
