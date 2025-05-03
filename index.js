// 🔧 カスタムポイント：時間割やDM文面を自由に変更可

const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');
const dayjs = require('dayjs');
require('dayjs/locale/ja');
dayjs.locale('ja');

const TOKEN = process.env.TOKEN;
const TARGET_USER_ID = process.env.TARGET_USER_ID;

const schedule = require('./schedule');
const getWeather = require('./getWeather');
const getUpcomingTasks = require('./getNotionTasks');

const client = new Client({
  intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
});

client.once('ready', async () => {
  console.log(`Bot started as ${client.user.tag}`);

  const user = await client.users.fetch(TARGET_USER_ID);
  const today = dayjs();
  const dayLabel = today.format('dd');
  const todaySchedule = schedule[dayLabel] || ['（時間割未登録）'];
  const scheduleText = todaySchedule.join('\n');
  const weather = await getWeather();
  const taskText = await getUpcomingTasks();

  const message = `✅ テスト送信：今日は ${today.format('MM月DD日（dd）')} です！\n\n` +
    `${weather ? `🌤️ 天気：${weather.description}\n🌡️ 気温：最高 ${weather.tempMax}℃ / 最低 ${weather.tempMin}℃` : '🌥️ 天気情報を取得できませんでした。'}\n\n` +
    `📚 今日の時間割:\n${scheduleText}\n\n${taskText}`;

  await user.send(message);
});

cron.schedule('0 21 * * *', async () => {
  const user = await client.users.fetch(TARGET_USER_ID);
  const today = dayjs();
  const dayLabel = today.format('dd');
  const todaySchedule = schedule[dayLabel] || ['（時間割未登録）'];
  const scheduleText = todaySchedule.join('\n');
  const weather = await getWeather();
  const taskText = await getUpcomingTasks();

  const message = `おはようございます！今日は ${today.format('MM月DD日（dd）')} です！\n\n` +
    `${weather ? `🌤️ 天気：${weather.description}\n🌡️ 気温：最高 ${weather.tempMax}℃ / 最低 ${weather.tempMin}℃` : '🌥️ 天気情報を取得できませんでした。'}\n\n` +
    `📚 今日の時間割:\n${scheduleText}\n\n${taskText}`;

  await user.send(message);
});

const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(3000);

client.login(TOKEN);
