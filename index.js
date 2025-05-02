const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');
const dayjs = require('dayjs');
require('dayjs/locale/ja');
dayjs.locale('ja');

const TOKEN = process.env.TOKEN;
const TARGET_USER_ID = process.env.TARGET_USER_ID;

const schedule = require('./schedule');
const getWeather = require('./getWeather'); // 天気取得を追加

const client = new Client({
  intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
});

client.once('ready', async () => {
  console.log(`Bot started as ${client.user.tag}`);

  // ✅ 起動時にテスト送信
  try {
    const user = await client.users.fetch(TARGET_USER_ID);
    const today = dayjs();
    const dayLabel = today.format('dd');
    const todaySchedule = schedule[dayLabel] || ["（時間割未登録）"];
    const scheduleText = todaySchedule.join('\n');
    const weather = await getWeather();

    const message = `✅ テスト送信：今日は ${today.format('MM月DD日（dd）')} です！

${
  weather
    ? `🌤️ 天気：${weather.description}
🌡️ 気温：最高 ${weather.tempMax}℃ / 最低 ${weather.tempMin}℃`
    : '🌥️ 天気情報を取得できませんでした。'
}

📚 今日の時間割:
${scheduleText}
`;

    await user.send(message);
    console.log('DMテスト送信成功');
  } catch (err) {
    console.error('DMテスト送信失敗:', err);
  }

  // ✅ 毎朝6:00 JST（＝21:00 UTC）に定期送信
  cron.schedule('0 21 * * *', async () => {
    try {
      const user = await client.users.fetch(TARGET_USER_ID);
      const today = dayjs();
      const dayLabel = today.format('dd');
      const todaySchedule = schedule[dayLabel] || ["（時間割未登録）"];
      const scheduleText = todaySchedule.join('\n');
      const weather = await getWeather();

      const message = `おはようございます！今日は ${today.format('MM月DD日（dd）')} です！

${
  weather
    ? `🌤️ 天気：${weather.description}
🌡️ 気温：最高 ${weather.tempMax}℃ / 最低 ${weather.tempMin}℃`
    : '🌥️ 天気情報を取得できませんでした。'
}

📚 今日の時間割:
${scheduleText}
`;

      await user.send(message);
      console.log('DM送信完了:', message);
    } catch (err) {
      console.error('DM送信失敗:', err);
    }
  });
});

// ✅ ダミーWebサーバー（Render無料プラン維持用）
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(3000, () => {
  console.log('Web server running on port 3000');
});

client.login(TOKEN);
