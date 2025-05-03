// 🔧 時刻表ボタン機能追加バージョン

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
  const today = dayjs();
  const dayLabel = today.format('dd');
  const todaySchedule = schedule[dayLabel] || ['（時間割未登録）'];
  const scheduleText = todaySchedule.join('\n');
  const weather = await getWeather();
  const taskText = await getUpcomingTasks();

  return `${prefix}！今日は ${today.format('MM月DD日（dd）')} です！\n\n` +
    `${weather ? `🌤️ 天気：${weather.description}\n🌡️ 気温：最高 ${weather.tempMax}℃ / 最低 ${weather.tempMin}℃` : '🌥️ 天気情報を取得できませんでした。'}\n\n` +
    `📚 今日の時間割:\n${scheduleText}\n\n${taskText}`;
};

const getNextTimes = (nowMinutes, list) => {
  return list
    .map(t => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    })
    .filter(m => m >= nowMinutes)
    .slice(0, 4); // 予備含め4つ取得
};

const formatTimes = (times) => {
  return times.map(m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
};

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

cron.schedule('0 7 * * 1-5', async () => {
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

  const now = dayjs();
  const nowMinutes = now.hour() * 60 + now.minute();
  let reply = '';

  if (interaction.customId === 'go') {
    const sList = getNextTimes(nowMinutes, timetable.weekday.go.shinkansen);
    const tList = getNextTimes(nowMinutes, timetable.weekday.go.train)
      .filter(t => t - sList[0] >= 1);
    reply = `【通学案内】\n新幹線：${formatTimes(sList).slice(0, 2).join(', ')}\n電車：${formatTimes(tList).slice(0, 2).join(', ')}`;
  }

  if (interaction.customId === 'back') {
    const tList = getNextTimes(nowMinutes, timetable.weekday.back.train);
    const sList = getNextTimes(nowMinutes, timetable.weekday.back.shinkansen)
      .filter(s => s - tList[0] >= 1);
    reply = `【帰宅案内】\n電車：${formatTimes(tList).slice(0, 2).join(', ')}\n新幹線：${formatTimes(sList).slice(0, 2).join(', ')}`;
  }

  await interaction.reply(reply);
});

const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(3000);

client.login(TOKEN);
