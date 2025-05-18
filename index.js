const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder,
  Routes,
  REST,
  Events,
  Partials,
  StringSelectMenuBuilder,
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
const { saveStudyToNotion } = require('./saveStudyToNotion');
const { saveSleepToNotion } = require('./saveSleepToNotion');
const { getFormattedNews } = require('./news');
const timetable = require('./timetable');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});

const studySessions = new Map();
const sleepSessions = new Map();
const pendingTasks = new Map();
const buildMorningMessage = async (userId, sleepMinutes, diff, avg) => {
  const today = dayjs().add(9, 'hour');
  const dayLabel = today.format('dd');
  const todaySchedule = schedule[dayLabel] || ['（時間割未登録）'];
  const scheduleText = todaySchedule.join('\n');
  const weather = await getWeather();
  const taskText = await getUpcomingTasks();

  const sleepMsg = `🛌 睡眠時間：${Math.floor(sleepMinutes / 60)}時間${sleepMinutes % 60}分（${diff >= 0 ? '+' : ''}${diff}分）｜週平均：${Math.floor(avg / 60)}時間${avg % 60}分`;

  return `おはようございます！今日は ${today.format('MM月DD日（dd）')} です！\n\n${sleepMsg}\n\n` +
    `${weather ? `🌤️ 天気：${weather.description}\n🌡️ 気温：最高 ${weather.tempMax}℃ / 最低 ${weather.tempMin}℃` : '🌥️ 天気情報を取得できませんでした。'}\n\n` +
    `📚 今日の時間割:\n${scheduleText}\n\n${taskText}`;
};

const buildRowMorning = () =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('go').setLabel('GO').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('back').setLabel('BACK').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('study_start').setLabel('勉強開始').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('add_task').setLabel('📝 タスクを追加').setStyle(ButtonStyle.Secondary)
  );

const buildRowNight = () =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sleep_start').setLabel('消灯').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('sleep_end').setLabel('起床').setStyle(ButtonStyle.Secondary)
  );
client.once('ready', async () => {
  console.log(`✅ Bot started as ${client.user.tag}`);
});

cron.schedule('0 13 * * 0-6', async () => {
  const user = await client.users.fetch(TARGET_USER_ID);

  let totalMinutes = 0;
  for (const [key, value] of studySessions.entries()) {
    if (value.date === dayjs().format('YYYY-MM-DD')) {
      totalMinutes += value.duration;
    }
  }

  const message = `📘 今日の勉強記録\n・合計勉強時間：${Math.floor(totalMinutes / 60)}時間${totalMinutes % 60}分\n\n今日もお疲れさまでした！`;

  await user.send({ content: message, components: [buildRowNight()] });
});
client.on(Events.InteractionCreate, async interaction => {
  try {
    const userId = interaction.user.id;

    if (interaction.isButton() && interaction.customId === 'sleep_end') {
      if (!sleepSessions.has(userId)) {
        await interaction.reply({ content: '⚠️ 消灯記録がありません。', ephemeral: true });
        return;
      }

      const start = sleepSessions.get(userId);
      const end = new Date();
      const duration = Math.round((end - start) / 60000);
      sleepSessions.delete(userId);

      const { success, diff, average } = await saveSleepToNotion({ duration, user: userId });
      const message = await buildMorningMessage(userId, duration, diff, average);

      await interaction.reply({ content: message, components: [buildRowMorning()] });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'sleep_start') {
      sleepSessions.set(userId, new Date());
      await interaction.reply({ content: '🛌 消灯時間を記録しました。おやすみなさい！', ephemeral: true });
      return;
    }

    if (interaction.isButton() && (interaction.customId === 'go' || interaction.customId === 'back')) {
      await handleRouteButton(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId === 'study_start') {
      studySessions.set(userId, { start: new Date() });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('study_end').setLabel('勉強終了').setStyle(ButtonStyle.Danger)
      );

      await interaction.reply({
        content: '📗 勉強開始しました。終了したら「勉強終了」ボタンを押してください。',
        components: [row],
        flags: 64
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'study_end') {
      const session = studySessions.get(userId);
      if (!session || !session.start) {
        await interaction.reply({ content: '⚠️ 勉強開始記録がありません。', ephemeral: true });
        return;
      }

      const now = new Date();
      const duration = Math.round((now - session.start) / 60000);
      studySessions.set(userId, { ...session, duration, date: dayjs().format('YYYY-MM-DD') });

      const select = new StringSelectMenuBuilder()
        .setCustomId(`study_category|${userId}`)
        .setPlaceholder('カテゴリを選択してください')
        .addOptions([
          { label: '理論', value: '理論' },
          { label: '機械', value: '機械' },
          { label: '電力', value: '電力' },
          { label: '法規', value: '法規' },
          { label: 'その他', value: 'その他' }
        ]);

      const row = new ActionRowBuilder().addComponents(select);
      await interaction.reply({ content: '📘 勉強のカテゴリを選択してください：', components: [row], ephemeral: true });
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('study_category')) {
      const [_, uid] = interaction.customId.split('|');
      const session = studySessions.get(uid);
      const category = interaction.values[0] || 'その他';
      if (!session || !session.duration) {
        await interaction.reply({ content: '⚠️ 勉強時間が不明です。', ephemeral: true });
        return;
      }

      await saveStudyToNotion({ duration: session.duration, category, user: uid });

      await interaction.update({ content: `✅ ${session.duration}分の勉強を「${category}」として記録しました！`, components: [] });
      return;
    }

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
      let title = interaction.fields.getTextInputValue('task_name');
      let deadline = interaction.fields.getTextInputValue('task_deadline');
      const description = interaction.fields.getTextInputValue('task_description');

      if (/^\d{8}$/.test(deadline)) {
        deadline = `${deadline.slice(0, 4)}-${deadline.slice(4, 6)}-${deadline.slice(6, 8)}`;
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
        await interaction.reply({ content: '⚠️ 期限の形式が不正です。YYYYMMDD または YYYY-MM-DD で入力してください。', ephemeral: true });
        return;
      }

      const uuid = uuidv4();
      const select = new StringSelectMenuBuilder()
        .setCustomId(`task_type_select|${uuid}`)
        .setPlaceholder('タスクの種類を選んでください')
        .addOptions([
          { label: 'To Do', value: 'To Do' },
          { label: 'Assignment', value: 'Assignment' },
          { label: 'Test', value: 'Test' },
          { label: 'Others', value: 'Others' }
        ]);

      const row = new ActionRowBuilder().addComponents(select);
      pendingTasks.set(uuid, { title, deadline, description });

      await interaction.reply({ content: '🔽 タスクの種類を選んでください：', components: [row], ephemeral: true });
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('task_type_select')) {
      const [, uuid] = interaction.customId.split('|');
      const task = pendingTasks.get(uuid);
      if (!task) {
        await interaction.reply({ content: '⚠️ タスク情報が見つかりませんでした。', ephemeral: true });
        return;
      }

      const type = interaction.values[0];
      const result = await saveTaskToNotion({
        title: task.title,
        deadline: task.deadline,
        type,
        description: task.description,
      });

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

const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(process.env.PORT || 3000);

client.login(TOKEN);
