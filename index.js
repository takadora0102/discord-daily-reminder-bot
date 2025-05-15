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
  SelectMenuBuilder,
  SlashCommandBuilder,
  Routes,
  REST,
  Events,
} = require('discord.js');
const cron = require('node-cron');
const dayjs = require('dayjs');
require('dayjs/locale/ja');
dayjs.locale('ja');

require('dotenv').config();
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
    new ButtonBuilder().setCustomId('go').setLabel('GO').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('back').setLabel('BACK').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('add_task').setLabel('📌 タスクを追加').setStyle(ButtonStyle.Success)
  );

  await user.send({ content: message, components: [row] });
});

// 毎朝6時：天気・時間割・タスク通知
cron.schedule('0 6 * * *', async () => {
  const user = await client.users.fetch(TARGET_USER_ID);
  const message = await buildMessage();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('go').setLabel('GO').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('back').setLabel('BACK').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('add_task').setLabel('📌 タスクを追加').setStyle(ButtonStyle.Success)
  );

  await user.send({ content: message, components: [row] });
});

// ニュース通知（朝・昼・夜）
const sendNews = async (label) => {
  const user = await client.users.fetch(TARGET_USER_ID);
  const now = dayjs().add(9, 'hour').format('MM/DD HH:mm');

  try {
    const news = await getFormattedNews();
    await user.send(`📰【${label}ニュース】（${now}）\n\n${news}`);
  } catch (error) {
    console.error('❌ ニュース取得失敗:', error);
    await user.send(`📰【${label}ニュース】（${now}）\n⚠️ ニュースの取得に失敗しました。`);
  }
};
cron.schedule('0 7 * * *', () => sendNews('朝'));
cron.schedule('0 12 * * *', () => sendNews('昼'));
cron.schedule('0 20 * * *', () => sendNews('夜'));
client.on(Events.InteractionCreate, async interaction => {
  try {
    // ================= ボタン処理 =================
    if (interaction.isButton()) {
      if (interaction.customId === 'add_task') {
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
              .setCustomId('task_description')
              .setLabel('内容')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );

        await interaction.showModal(modal);
        return;
      }

      // GO/BACKボタン：通学案内処理
      await interaction.deferReply({ ephemeral: true });
      const now = dayjs().add(9, 'hour');
      const nowMinutes = now.hour() * 60 + now.minute();
      if (interaction.customId === 'go') {
        const sList = timetable.weekday.go.shinkansen.map(parseTime).filter(m => m >= nowMinutes);
        const tList = timetable.weekday.go.train.map(parseTime).filter(m => m >= nowMinutes);
        const routes = [];
        for (let sTime of sList) {
          const sArrival = sTime + 8;
          const candidate = tList.find(t => t >= sArrival + 1);
          if (candidate) {
            routes.push(`博多南発 ${formatTime(sTime)} 博多発 ${formatTime(candidate)}`);
            if (routes.length >= 2) break;
          }
        }
        const reply = routes.length ? `【通学案内】\n① ${routes[0]}${routes[1] ? `\n② ${routes[1]}` : ''}` : '適切な通学案が見つかりませんでした。';
        await interaction.editReply({ content: reply });
      }

      if (interaction.customId === 'back') {
        const tList = timetable.weekday.back.train.map(parseTime).filter(t => t >= nowMinutes);
        const sList = timetable.weekday.back.shinkansen.map(parseTime).filter(s => s >= nowMinutes);
        const routes = [];
        for (let tTime of tList) {
          const tArrival = tTime + 20;
          const candidate = sList.find(s => s >= tArrival + 1);
          if (candidate) {
            routes.push(`福工大前発 ${formatTime(tTime)} 博多発 ${formatTime(candidate)}`);
            if (routes.length >= 2) break;
          }
        }
        const reply = routes.length ? `【帰宅案内】\n① ${routes[0]}${routes[1] ? `\n② ${routes[1]}` : ''}` : '適切な帰宅案が見つかりませんでした。';
        await interaction.editReply({ content: reply });
      }
    }

    // ========== モーダル送信後：Type選択用セレクトメニュー表示 ==========
    if (interaction.isModalSubmit() && interaction.customId === 'task_modal') {
      const title = interaction.fields.getTextInputValue('task_name');
      const deadline = interaction.fields.getTextInputValue('task_deadline');
      const description = interaction.fields.getTextInputValue('task_description');

      const select = new SelectMenuBuilder()
        .setCustomId(`task_type_select|${encodeURIComponent(title)}|${deadline}|${encodeURIComponent(description)}`)
        .setPlaceholder('タスクの種類を選んでください')
        .addOptions([
          { label: 'To Do', value: 'To Do' },
          { label: 'Assignment', value: 'Assignment' },
          { label: 'Test', value: 'Test' },
          { label: 'Others', value: 'Others' },
        ]);

      const row = new ActionRowBuilder().addComponents(select);
      await interaction.reply({ content: '📌 タスクの種類を選んでください：', components: [row], ephemeral: true });
    }
    // ========== Type選択後：Notionに保存 ==========
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('task_type_select')) {
      const [_, rawTitle, deadline, rawDesc] = interaction.customId.split('|');
      const title = decodeURIComponent(rawTitle);
      const description = decodeURIComponent(rawDesc);
      const type = interaction.values[0];

      const result = await saveTaskToNotion({ title, deadline, type, description });

      await interaction.update({
        content: result.success
          ? '✅ タスクをNotionに追加しました！'
          : '❌ タスクの追加に失敗しました。',
        components: [],
      });
    }
  } catch (e) {
    console.error('❗ Interaction処理中エラー:', e);
  }
});

// ================= スラッシュコマンド登録 =================
const commands = [
  new SlashCommandBuilder()
    .setName('task')
    .setDescription('📌 タスク追加ボタンを表示する'),
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

// ================= 起動確認用Webサーバー =================
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(process.env.PORT || 3000);

client.login(TOKEN);
