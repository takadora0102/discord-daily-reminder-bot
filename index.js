const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');
const dayjs = require('dayjs');
require('dayjs/locale/ja');
dayjs.locale('ja');

const TOKEN = process.env.TOKEN;
const TARGET_USER_ID = process.env.TARGET_USER_ID;

const client = new Client({
  intents: [GatewayIntentBits.DirectMessages, GatewayIntentBits.MessageContent],
});

client.once('ready', async () => {
  console.log(`Bot started as ${client.user.tag}`);

  // ✅ 起動時に一度だけテスト送信
  try {
    const user = await client.users.fetch(TARGET_USER_ID);
    const today = dayjs();
    const message = `✅ テスト送信：今日は ${today.format('MM月DD日（dd）')} です！`;
    await user.send(message);
    console.log('DMテスト送信成功');
  } catch (err) {
    console.error('DMテスト送信失敗:', err);
  }

  // ✅ 毎朝6時（JST） = 毎日21時（UTC）に送信
  cron.schedule('0 21 * * *', async () => {
    try {
      const user = await client.users.fetch(TARGET_USER_ID);
      const today = dayjs();
      const message = `おはようございます！今日は ${today.format('MM月DD日（dd）')} です！`;
      await user.send(message);
      console.log('DM送信完了:', message);
    } catch (err) {
      console.error('DM送信失敗:', err);
    }
  });
});

// ✅ ダミーのExpressサーバーでRender無料枠維持
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(3000, () => {
  console.log('Web server running on port 3000');
});

client.login(TOKEN);
