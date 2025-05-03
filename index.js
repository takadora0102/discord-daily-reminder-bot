// 🔧 時刻表ボタン機能（JST対応済み）

const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, Partials } = require('discord.js');
const cron = require('node-cron');
const dayjs = require('dayjs');
require('dayjs/locale/ja');
dayjs.locale('ja');

const TOKEN = process.env.TOKEN;
const TARGET_USER_ID = process.env.TARGET_USER_ID;

const schedule = require('./schedule');
const getWeather = require('./getWeather');
const getUpcomingTasks = require('./getNotionTasks');
const timetable = require('./timetable');

const client = new Client({
  intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
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

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('go').setLabel('GO').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('back').setLabel('BACK').setStyle(ButtonStyle.Secondary)
  );

  await user.send({ content: message, components: [row] });
});

cron.schedule('0 22 * * 1-5', async () => {
  const user = await client.users.fetch(TARGET_USER_ID);
  const message = await buildMessage();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('go').setLabel('GO').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('back').setLabel('BACK').setStyle(ButtonStyle.Secondary)
  );

  await user.send({ content: message, components: [row] });
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  await interaction.deferReply();

  const now = dayjs().add(9, 'hour'); // JSTに変換！
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
    await interaction.editReply(reply);
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
    await interaction.editReply(reply);
  }
});

const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(3000);

client.login(TOKEN);
