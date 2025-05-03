// index.js - 抜粋した部分のみ改修済み（timetable連携、ボタン表示）

const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const schedule = require('./schedule');
const timetable = require('./timetable');
const getWeather = require('./getWeather');
const getNotionTasks = require('./getNotionTasks');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

const TOKEN = process.env.DISCORD_TOKEN;

client.once('ready', () => {
  console.log('Bot is online!');
});

client.on('ready', () => {
  const channel = client.channels.cache.get(process.env.DISCORD_USER_ID);
  if (!channel) return;

  const today = new Date();
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][today.getDay()];
  if (weekday === '土' || weekday === '日') return; // 土日スキップ

  const dateStr = `${today.getMonth() + 1}月${today.getDate()}日（${weekday}）`;
  const weather = getWeather();
  const lessons = schedule[weekday] || [];
  const tasks = getNotionTasks();

  const content = `おはようございます！\n\n${dateStr}\n天気：${weather}\n\n今日の時間割：\n${lessons.join('\n')}\n\n直近のタスク：\n${tasks.join('\n')}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('go_button')
      .setLabel('GO')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('back_button')
      .setLabel('BACK')
      .setStyle(ButtonStyle.Secondary)
  );

  channel.send({ content, components: [row] });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const getNextTwoTimes = (times) => {
    return times
      .map((t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      })
      .filter((t) => t >= currentMinutes)
      .slice(0, 2)
      .map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  };

  if (interaction.customId === 'go_button') {
    const shinkansenTimes = getNextTwoTimes(timetable.weekday.go.shinkansen);
    const trainTimes = getNextTwoTimes(timetable.weekday.go.train).filter(
      (t) => {
        const [shHour, shMin] = shinkansenTimes[0].split(':').map(Number);
        const [trHour, trMin] = t.split(':').map(Number);
        const diff = (trHour * 60 + trMin) - (shHour * 60 + shMin);
        return diff >= 1;
      }
    );
    await interaction.reply(`【通学案内】\n新幹線：${shinkansenTimes.join(', ')}\n電車：${trainTimes.slice(0,2).join(', ')}`);
  }

  if (interaction.customId === 'back_button') {
    const trainTimes = getNextTwoTimes(timetable.weekday.back.train);
    const shinkansenTimes = getNextTwoTimes(timetable.weekday.back.shinkansen).filter(
      (t) => {
        const [trHour, trMin] = trainTimes[0].split(':').map(Number);
        const [shHour, shMin] = t.split(':').map(Number);
        const diff = (shHour * 60 + shMin) - (trHour * 60 + trMin);
        return diff >= 1;
      }
    );
    await interaction.reply(`【帰宅案内】\n電車：${trainTimes.join(', ')}\n新幹線：${shinkansenTimes.slice(0,2).join(', ')}`);
  }
});

client.login(TOKEN);
