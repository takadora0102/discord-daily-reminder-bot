/* ────────── import & 初期設定 ────────── */
const {
  Client, GatewayIntentBits,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder,
  SlashCommandBuilder, Routes, REST,
  Events, Partials
} = require('discord.js');
const cron  = require('node-cron');
const dayjs = require('dayjs');
require('dayjs/locale/ja'); dayjs.locale('ja');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

/* ────────── .env ────────── */
const TOKEN          = process.env.TOKEN;
const CLIENT_ID      = process.env.CLIENT_ID;
const GUILD_ID       = process.env.GUILD_ID;
const TARGET_USER_ID = process.env.TARGET_USER_ID;

/* ────────── 自作モジュール ────────── */
const schedule          = require('./schedule');
const timetable         = require('./timetable');
const getWeather        = require('./getWeather');
const getUpcomingTasks  = require('./getNotionTasks');
const { saveTaskToNotion }  = require('./saveTaskToNotion');
const { saveStudyToNotion } = require('./saveStudyToNotion');
const { saveSleepToNotion } = require('./saveSleepToNotion');
const { getFormattedNews }  = require('./news');

/* ────────── Discord クライアント ────────── */
const client = new Client({
  intents : [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

/* ────────── 状態保持 ────────── */
const studySessions = new Map();   // uid → { start, duration, date }
const sleepSessions = new Map();   // uid → Date
const pendingTasks  = new Map();   // uuid → taskObj

/* ────────── UI ビルダー ────────── */
const buildRowMorning = () =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('go').setLabel('GO').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('back').setLabel('BACK').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('study_start').setLabel('勉強開始').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('add_task').setLabel('📝 タスクを追加').setStyle(ButtonStyle.Secondary)
  );

const buildRowNight = () =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sleep_start').setLabel('消灯').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('sleep_end').setLabel('起床').setStyle(ButtonStyle.Secondary)
  );

/* ────────── 朝メッセージ生成 ────────── */
const buildMorningMessage = async (uid, sleepMin, diff, avg) => {
  const today    = dayjs().add(9, 'hour');
  const dayLabel = today.format('dd');
  const sched    = schedule[dayLabel] || ['（時間割未登録）'];
  const weather  = await getWeather();
  const tasks    = await getUpcomingTasks();

  const sleepLine = `🛌 睡眠時間：${Math.floor(sleepMin / 60)}h${sleepMin % 60}m（${diff >= 0 ? '+' : ''}${diff}m）｜週平均：${Math.floor(avg / 60)}h${avg % 60}m`;

  return `おはようございます！今日は ${today.format('MM月DD日（dd）')} です！\n\n` +
         `${sleepLine}\n\n` +
         (weather ? `🌤️ 天気：${weather.description}\n🌡️ 最高${weather.tempMax}℃ / 最低${weather.tempMin}℃\n\n` : '') +
         `📚 今日の時間割:\n${sched.join('\n')}\n\n${tasks}`;
};

/* ────────── 起動時テスト送信 ────────── */
client.once('ready', async () => {
  console.log(`✅ Bot started as ${client.user.tag}`);
  const user = await client.users.fetch(TARGET_USER_ID);
  const msg  = await buildMorningMessage(TARGET_USER_ID, 420, 15, 390); // 7h, +15m, avg 6.5h
  await user.send({ content: '✅ テスト送信：ボタン付き', components: [buildRowMorning()] });
  await user.send({ content: msg });
});

/* ────────── ニュース送信ヘルパ ────────── */
const sendNews = label => async () => {
  console.log(`[NEWS] ${label} タスク`);
  const user   = await client.users.fetch(TARGET_USER_ID);
  const blocks = await getFormattedNews(label);         // 配列で取得
  if (!blocks.length) return user.send(`📰 ${label}のニュースは取得できませんでした。`);

  let chunk = '';
  for (const line of blocks) {
    if ((chunk + '\n\n' + line).length > 1900) { await user.send(chunk); chunk = line; }
    else chunk += (chunk ? '\n\n' : '') + line;
  }
  if (chunk) await user.send(chunk);
};

/* ────────── cron スケジュール (JST) ────────── */
cron.schedule('1 6  * * *', sendNews('朝'), { timezone: 'Asia/Tokyo' });
cron.schedule('0 12 * * *', sendNews('昼'), { timezone: 'Asia/Tokyo' });
cron.schedule('0 20 * * *', sendNews('夜'), { timezone: 'Asia/Tokyo' });

cron.schedule('0 22 * * *', async () => {
  const user  = await client.users.fetch(TARGET_USER_ID);
  const today = dayjs().format('YYYY-MM-DD');
  const total = [...studySessions.values()]
    .filter(v => v.date === today)
    .reduce((a, b) => a + b.duration, 0);
  await user.send({
    content: `📘 今日の勉強時間：${Math.floor(total / 60)}h${total % 60}m`,
    components: [buildRowNight()]
  });
}, { timezone: 'Asia/Tokyo' });

/* ────────── 通学/帰宅ルート計算ヘルパ ────────── */
const parseTime  = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const formatTime = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

async function handleRouteButton(inter) {
  const isGo = inter.customId === 'go';
  const nowMin = dayjs().add(9, 'hour').hour() * 60 + dayjs().minute();
  const A = isGo ? timetable.weekday.go   : timetable.weekday.back;
  const B = isGo ? timetable.weekday.back : timetable.weekday.go;

  const aList = A.train     .map(parseTime).filter(t => t >= nowMin);
  const bList = B.shinkansen.map(parseTime).filter(t => t >= nowMin);
  const routes = [];

  for (const a of aList) {
    const arr = a + (isGo ? 8 : 20);
    const b   = bList.find(x => x >= arr + 1);
    if (b) {
      routes.push(`${isGo ? '博多南' : '福工大前'} ${formatTime(a)} → 博多 ${formatTime(b)}`);
      if (routes.length >= 2) break;
    }
  }
  inter.reply({
    content: routes.length ? `【${isGo ? '通学' : '帰宅'}案内】\n` + routes.join('\n') : '適切なルートが見つかりません',
    ephemeral: true
  });
}

/* ────────── Interaction 処理 ────────── */
client.on(Events.InteractionCreate, async interaction => {
  try {
    const uid = interaction.user.id;

    /* 起床 → 朝通知 */
    if (interaction.isButton() && interaction.customId === 'sleep_end') {
      if (!sleepSessions.has(uid)) return interaction.reply({ content: '⚠️ 消灯記録がありません', ephemeral: true });
      const dur = Math.round((Date.now() - sleepSessions.get(uid)) / 60000);
      sleepSessions.delete(uid);
      const { diff, average } = await saveSleepToNotion({ duration: dur, user: uid });
      const msg = await buildMorningMessage(uid, dur, diff, average);
      return interaction.reply({ content: msg, components: [buildRowMorning()] });
    }

    /* 消灯 */
    if (interaction.isButton() && interaction.customId === 'sleep_start') {
      sleepSessions.set(uid, Date.now());
      return interaction.reply({ content: '🛌 おやすみなさい！', ephemeral: true });
    }

    /* 通学 / 帰宅 */
    if (interaction.isButton() && (interaction.customId === 'go' || interaction.customId === 'back'))
      return handleRouteButton(interaction);

    /* 勉強開始 */
    if (interaction.isButton() && interaction.customId === 'study_start') {
      studySessions.set(uid, { start: Date.now() });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('study_end').setLabel('勉強終了').setStyle(ButtonStyle.Danger)
      );
      return interaction.reply({ content: '📗 勉強開始しました。', components: [row] });
    }

    /* 勉強終了 → カテゴリ選択 */
    if (interaction.isButton() && interaction.customId === 'study_end') {
      const sess = studySessions.get(uid);
      if (!sess) return interaction.reply({ content: '⚠️ 勉強開始記録がありません', ephemeral: true });
      const dur = Math.round((Date.now() - sess.start) / 60000);
      studySessions.set(uid, { ...sess, duration: dur, date: dayjs().format('YYYY-MM-DD') });

      const sel = new StringSelectMenuBuilder()
        .setCustomId(`study_cat|${uid}`)
        .setPlaceholder('カテゴリ選択')
        .addOptions(['理論', '機械', '電力', '法規', 'その他'].map(v => ({ label: v, value: v })));
      return interaction.reply({
        content: `勉強 ${dur} 分\nカテゴリを選択：`,
        components: [new ActionRowBuilder().addComponents(sel)],
        ephemeral: true
      });
    }

    /* カテゴリ確定 → Notion 保存 */
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('study_cat')) {
      const cat  = interaction.values[0];
      const sess = studySessions.get(uid);
      if (!sess) return;
      await saveStudyToNotion({ duration: sess.duration, category: cat, user: uid });
      return interaction.update({ content: `✅ ${sess.duration}m を「${cat}」で記録！`, components: [] });
    }

    /* タスク追加モーダル起動 */
    if (interaction.isButton() && interaction.customId === 'add_task') {
      const modal = new ModalBuilder().setCustomId('task_modal').setTitle('タスクを追加')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('task_name').setLabel('タスク名').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('task_deadline').setLabel('期限 (YYYYMMDD or YYYY-MM-DD)').setStyle(TextInputStyle.Short).setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('task_description').setLabel('内容').setStyle(TextInputStyle.Paragraph).setRequired(false)
          )
        );
      return interaction.showModal(modal);
    }

    /* タスクモーダル submit */
    if (interaction.isModalSubmit() && interaction.customId === 'task_modal') {
      let title = interaction.fields.getTextInputValue('task_name');
      let deadline = interaction.fields.getTextInputValue('task_deadline');
      const desc = interaction.fields.getTextInputValue('task_description');

      if (/^\d{8}$/.test(deadline))
        deadline = `${deadline.slice(0, 4)}-${deadline.slice(4, 6)}-${deadline.slice(6, 8)}`;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline))
        return interaction.reply({ content: '⚠️ 期限形式が不正', ephemeral: true });

      const uuid = uuidv4();
      pendingTasks.set(uuid, { title, deadline, desc });

      const sel = new StringSelectMenuBuilder().setCustomId(`task_type|${uuid}`).setPlaceholder('種別を選択')
        .addOptions(['To Do', 'Assignment', 'Test', 'Others'].map(v => ({ label: v, value: v })));
      return interaction.reply({ content: '🔽 タスク種別を選択：', components: [new ActionRowBuilder().addComponents(sel)], ephemeral: true });
    }

    /* タスク種別確定 → Notion 保存 */
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('task_type')) {
      const [, uuid] = interaction.customId.split('|');
      const task = pendingTasks.get(uuid);
      if (!task) return interaction.reply({ content: '⚠️ タスク情報が見つかりません', ephemeral: true });

      const type = interaction.values[0];
      const res = await saveTaskToNotion({
        title: task.title, deadline: task.deadline, type, description: task.desc
      });
      pendingTasks.delete(uuid);
      return interaction.update({ content: res.success ? '✅ 追加しました' : '❌ 失敗しました', components: [] });
    }

  } catch (e) { console.error('❌ Interaction Error:', e); }
});

/* ────────── Slash コマンド登録 ────────── */
const commands = [new SlashCommandBuilder().setName('task').setDescription('📝 タスク追加ボタン')].map(c => c.toJSON());
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Slash コマンド登録成功');
  } catch (e) {
    console.error('❌ Slash コマンド登録失敗:', e);
  }
})();

/* ────────── keep-alive (Render) ────────── */
require('express')().get('/', (_, res) => res.send('Bot is running.')).listen(process.env.PORT || 3000);

/* ────────── 起動 ────────── */
client.login(TOKEN);
