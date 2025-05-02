const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');
const dayjs = require('dayjs');
require('dayjs/locale/ja');
dayjs.locale('ja');

const TOKEN = process.env.TOKEN;
const TARGET_USER_ID = process.env.TARGET_USER_ID;
const schedule = require('./schedule'); // 時間割データを読み込み

const client = new Client({
  intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
});

client.once('ready', async () => {
  console.log(`Bot started as ${client.user.tag}`);

  // ✅ 起動時のテスト送信
  try {
    const user = await client.users.fetch(TARGET_USER_ID);
    const today = dayjs();
    const dayLabel = today.format('dd');
    const todaySchedule = schedule[dayLabel] || ["（時間割未登録）"];
    const scheduleText = todaySchedule.join('\n');

    const message = `✅ テスト送信：今日は ${today.format('MM月DD日（dd）')} です！

📚 今日の時間割:
${scheduleText}
`;
    await user.send(message);
    console.log('DMテスト送信成功');
  } catch (err) {
    console.error('DMテスト送信失敗:', err);
  }

  // ✅ 毎朝6時（JST）に定期送信（= 21時 UTC）
  cron.schedule('0 21 * * *', async () => {
    try {
      const user = await client.users.fetch(TARGET_USER_ID);
      const today = dayjs();
      const dayLabel = today.format('dd');
      const todaySchedule = schedule[dayLabel] || ["（時間割未登録）"];
      const scheduleText = todaySchedule.join('\n');

      const message = `おはようございます！今日は ${today.format('MM月DD日（dd）')} です！

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

// ✅ Expressでポート維持（Render無料プラン対策）
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(3000, () => {
  console.log('Web server running on port 3000');
});

client.login(TOKEN);
