// index.js
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

client.once('ready', () => {
  console.log(`Bot started as ${client.user.tag}`);

  cron.schedule('0 22 * * *', async () => {
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

client.login(TOKEN);
