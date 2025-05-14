const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
  Events,
  Partials
} = require('discord.js');
const cron = require('node-cron');
const dayjs = require('dayjs');
require('dayjs/locale/ja');
dayjs.locale('ja');
require('dotenv').config();

const TOKEN = process.env.TOKEN;
const TARGET_USER_ID = process.env.TARGET_USER_ID;

const schedule = require('./schedule');
const getWeather = require('./getWeather');
const getUpcomingTasks = require('./getNotionTasks');
const timetable = require('./timetable');
const { getFormattedNews } = require('./news');
const { saveTaskToNotion } = require('./saveToNotion'); // ✅ 追加済み

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

  const commuteRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('go').setLabel('GO').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('back').setLabel('BACK').setStyle(ButtonStyle.Secondary)
  );

  const taskRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('add_task').setLabel('📝 タスクを追加').setStyle(ButtonStyle.Success)
  );

  await user.send({ content: message, components: [commuteRow, taskRow] });
});

// ✅ インタラクション処理 with try/catch
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === 'go' || interaction.customId === 'back') {
        await interaction.deferReply();
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

        if (interaction.customId === 'add_task') {
          const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('select_task_type')
              .setPlaceholder('タスクの種類を選んでください')
              .addOptions([
                { label: 'To Do', value: 'To Do' },
                { label: 'Assignment', value: 'Assignment' },
                { label: 'Test', value: 'Test' },
                { label: 'Others', value: 'Others' }
              ])
          );
          await interaction.reply({ content: '📂 タスクの種類を選んでください', components: [row], ephemeral: true });
        }
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_task_type') {
      const selectedType = interaction.values[0];
      const modal = new ModalBuilder().setCustomId(`modal_task_input|${selectedType}`).setTitle('新しいタスクを追加');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('title').setLabel('🏷 タスク名').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('deadline').setLabel('🗓 締切日（YYYY-MM-DD）').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('description').setLabel('✏️ 説明').setStyle(TextInputStyle.Paragraph).setRequired(false)
        )
      );
      await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_task_input|')) {
      const type = interaction.customId.split('|')[1];
      const title = interaction.fields.getTextInputValue('title');
      const deadline = interaction.fields.getTextInputValue('deadline');
      const description = interaction.fields.getTextInputValue('description');
      await interaction.deferReply({ ephemeral: true });

      const result = await saveTaskToNotion({ title, type, deadline, description });
      if (result.success) {
        await interaction.editReply(`✅ タスク「${title}」を追加しました！`);
      } else {
        await interaction.editReply(`❌ タスクの追加に失敗しました。`);
      }
    }
  } catch (err) {
    console.error('❌ Interactionエラー:', err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply('❌ 予期せぬエラーが発生しました。');
      } else {
        await interaction.reply({ content: '❌ 処理中にエラーが発生しました。', ephemeral: true });
      }
    } catch {}
  }
});

// ニュース通知
async function sendNewsDM(timeLabel) {
  try {
    const user = await client.users.fetch(TARGET_USER_ID);
    const news = await getFormattedNews();
    const message = `🗞️ **${timeLabel}のニュースまとめ（全5件）**\n\n${news}`;
    await user.send(message);
    console.log(`✅ ${timeLabel}のニュースを送信しました`);
  } catch (err) {
    console.error(`❌ ${timeLabel}ニュース送信失敗:`, err);
  }
}

cron.schedule('0 21 * * 0-6', () => sendNewsDM('朝刊'));  // JST 6:00
cron.schedule('0 3 * * 0-6',  () => sendNewsDM('昼刊'));  // JST 12:00
cron.schedule('0 13 * * 0-6', () => sendNewsDM('夜刊'));  // JST 22:00

const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(3000);

client.login(TOKEN);
