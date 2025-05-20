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
const {
  TOKEN, CLIENT_ID, GUILD_ID,
  TARGET_USER_ID
} = process.env;

/* ────────── 自作モジュール ────────── */
const schedule          = require('./schedule');
const timetable         = require('./timetable');
const getWeather        = require('./getWeather');
const getUpcomingTasks  = require('./getNotionTasks');
const { saveTaskToNotion }  = require('./saveTaskToNotion');
const { saveStudyToNotion } = require('./saveStudyToNotion');
const { saveSleepToNotion } = require('./saveSleepToNotion');
const { getFormattedNews }  = require('./news');
const sleepStore            = require('./sleepStore');
const failedSleepQ          = require('./failedSleepQueue');

/* ────────── Discord クライアント ────────── */
const client = new Client({
  intents : [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

/* ────────── 状態保持（メモリ） ────────── */
const studySessions = new Map();     // uid → { start, duration, date }
const pendingTasks  = new Map();     // uuid → taskObj

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
async function buildMorningMessage(uid, sleepMin, diff, avg) {
  const today  = dayjs().add(9,'hour');
  const sched  = schedule[today.format('dd')] || ['（時間割未登録）'];
  const weather= await getWeather();
  const tasks  = await getUpcomingTasks();

  const line=`🛌 睡眠：${Math.floor(sleepMin/60)}h${sleepMin%60}m（${diff>=0?'+':''}${diff}m）｜週平均:${Math.floor(avg/60)}h${avg%60}m`;

  return `おはようございます！今日は ${today.format('MM月DD日（dd）')} です！\n\n`+
         `${line}\n\n`+
         (weather?`🌤️ 天気：${weather.description}\n🌡️ 最⾼${weather.tempMax}℃ / 最低${weather.tempMin}℃\n\n`:'')+
         `📚 時間割:\n${sched.join('\n')}\n\n${tasks}`;
}

/* ────────── ニュース送信ヘルパ ────────── */
const sendNews = label => async () => {
  const user = await client.users.fetch(TARGET_USER_ID);
  const blocks = await getFormattedNews(label);
  if (!blocks.length) return user.send(`📰 ${label}のニュースは取得できませんでした。`);

  let buf='';
  for(const l of blocks){
    if((buf+'\n\n'+l).length>1900){ await user.send(buf); buf=l; }
    else buf+=(buf?'\n\n':'')+l;
  }
  if(buf) await user.send(buf);
};

/* ────────── cron スケジュール (JST) ────────── */
cron.schedule('1 6  * * *', sendNews('朝'), { timezone:'Asia/Tokyo' });
cron.schedule('0 12 * * *', sendNews('昼'), { timezone:'Asia/Tokyo' });
cron.schedule('0 20 * * *', sendNews('夜'), { timezone:'Asia/Tokyo' });

cron.schedule('0 22 * * *', async () => {
  const user  = await client.users.fetch(TARGET_USER_ID);
  const today = dayjs().format('YYYY-MM-DD');
  const total = [...studySessions.values()]
    .filter(v=>v.date===today)
    .reduce((a,b)=>a+b.duration,0);
  await user.send({
    content:`📘 今日の勉強時間：${Math.floor(total/60)}h${total%60}m`,
    components:[buildRowNight()]
  });
}, { timezone:'Asia/Tokyo' });

/* ────────── 通学/帰宅ルート計算 ────────── */
const parse  = s=>{const[h,m]=s.split(':').map(Number);return h*60+m;};
const format = n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
async function route(inter,isGo){
  const nowMin=dayjs().add(9,'hour').hour()*60+dayjs().minute();
  const A=isGo?timetable.weekday.go:timetable.weekday.back;
  const B=isGo?timetable.weekday.back:timetable.weekday.go;
  const al=A.train.map(parse).filter(t=>t>=nowMin);
  const bl=B.shinkansen.map(parse).filter(t=>t>=nowMin);
  const res=[];
  for(const a of al){
    const arr=a+(isGo?8:20);
    const b=bl.find(x=>x>=arr+1);
    if(b){res.push(`${isGo?'博多南':'福工大前'} ${format(a)} → 博多 ${format(b)}`);if(res.length>=2)break;}
  }
  inter.reply({ content: res.length?`【${isGo?'通学':'帰宅'}】\n${res.join('\n')}`:'ルート無し', ephemeral:true });
}

/* ────────── 起動テスト DM ────────── */
client.once('ready', async()=>{
  console.log(`✅ Bot started as ${client.user.tag}`);
  const u  = await client.users.fetch(TARGET_USER_ID);
  const msg= await buildMorningMessage(TARGET_USER_ID,420,15,390);
  await u.send({ content:'✅ テスト送信：ボタン付き', components:[buildRowMorning()] });
  await u.send({ content:msg });
});

/* ────────── Interaction 処理 ────────── */
client.on(Events.InteractionCreate, async inter=>{
  try{
    const uid=inter.user.id;

    /* 消灯 */
    if(inter.isButton() && inter.customId==='sleep_start'){
      if(sleepStore.has(uid))
        return inter.reply({content:'⚠️ すでに就寝記録があります',ephemeral:true});
      sleepStore.set(uid,Date.now());
      return inter.reply({content:'🛌 おやすみなさい！',ephemeral:true});
    }

    /* 起床 */
    if(inter.isButton() && inter.customId==='sleep_end'){
      if(!sleepStore.has(uid))
        return inter.reply({content:'⚠️ 消灯記録がありません',ephemeral:true});

      const dur=Math.round((Date.now()-sleepStore.get(uid))/60000);
      sleepStore.del(uid);
      if(dur<10||dur>1080)
        return inter.reply({content:`⚠️ 異常値(${dur}分)。10分〜18hのみ保存`,ephemeral:true});

      const {diff,average,success}=await saveSleepToNotion({duration:dur,user:uid});
      if(!success) failedSleepQ.push({duration:dur,user:uid,ts:Date.now()});
      else for(const item of failedSleepQ.drain()) await saveSleepToNotion(item);

      const morning=await buildMorningMessage(uid,dur,diff,average);
      return inter.reply({content:morning,components:[buildRowMorning()]});
    }

    /* ルート */
    if(inter.isButton() && (inter.customId==='go'||inter.customId==='back'))
      return route(inter, inter.customId==='go');

    /* 勉強開始 */
    if(inter.isButton() && inter.customId==='study_start'){
      studySessions.set(uid,{start:Date.now()});
      const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('study_end').setLabel('勉強終了').setStyle(ButtonStyle.Danger)
      );
      return inter.reply({content:'📗 勉強開始しました。',components:[row]});
    }

    /* 勉強終了 → カテゴリ選択 */
    if(inter.isButton() && inter.customId==='study_end'){
      const sess=studySessions.get(uid);
      if(!sess) return inter.reply({content:'⚠️ 勉強開始記録がありません',ephemeral:true});
      const dur=Math.round((Date.now()-sess.start)/60000);
      studySessions.set(uid,{...sess,duration:dur,date:dayjs().format('YYYY-MM-DD')});

      const sel=new StringSelectMenuBuilder().setCustomId(`study_cat|${uid}`)
        .setPlaceholder('カテゴリ選択')
        .addOptions(['理論','機械','電力','法規','その他'].map(v=>({label:v,value:v})));
      return inter.reply({
        content:`勉強 ${dur} 分\nカテゴリを選択：`,
        components:[new ActionRowBuilder().addComponents(sel)],
        ephemeral:true
      });
    }

    /* カテゴリ確定 → Notion 保存 */
    if(inter.isStringSelectMenu() && inter.customId.startsWith('study_cat')){
      const cat=interaction.values[0];
      const sess=studySessions.get(uid);
      if(!sess) return;
      await saveStudyToNotion({duration:sess.duration,category:cat,user:uid});
      return inter.update({content:`✅ ${sess.duration}m を「${cat}」で記録！`,components:[]});
    }

    /* タスク追加モーダル */
    if(inter.isButton() && inter.customId==='add_task'){
      const modal=new ModalBuilder().setCustomId('task_modal').setTitle('タスクを追加')
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
      return inter.showModal(modal);
    }

    /* タスクモーダル Submit */
    if(inter.isModalSubmit() && inter.customId==='task_modal'){
      let title    = inter.fields.getTextInputValue('task_name');
      let deadline = inter.fields.getTextInputValue('task_deadline');
      const desc   = inter.fields.getTextInputValue('task_description');

      if(/^\d{8}$/.test(deadline))
        deadline=`${deadline.slice(0,4)}-${deadline.slice(4,6)}-${deadline.slice(6,8)}`;
      if(!/^\d{4}-\d{2}-\d{-2}$/.test(deadline))
        return inter.reply({content:'⚠️ 期限形式が不正',ephemeral:true});

      const uuid=uuidv4();
      pendingTasks.set(uuid,{title,deadline,desc});

      const sel=new StringSelectMenuBuilder().setCustomId(`task_type|${uuid}`)
        .setPlaceholder('種別を選択')
        .addOptions(['To Do','Assignment','Test','Others'].map(v=>({label:v,value:v})));
      return inter.reply({
        content:'🔽 タスク種別を選択：',
        components:[new ActionRowBuilder().addComponents(sel)],
        ephemeral:true
      });
    }

    /* タスク種別確定 */
    if(inter.isStringSelectMenu() && inter.customId.startsWith('task_type')){
      const [,uuid]=inter.customId.split('|');
      const task=pendingTasks.get(uuid);
      if(!task) return inter.reply({content:'⚠️ タスク情報が見つかりません',ephemeral:true});

      const result=await saveTaskToNotion({
        title:task.title, deadline:task.deadline,
        type:inter.values[0], description:task.desc
      });
      pendingTasks.delete(uuid);
      return inter.update({
        content: result.success?'✅ タスクを追加しました！':'❌ タスク追加に失敗',
        components:[]
      });
    }

  }catch(e){ console.error('❌ Interaction Error:',e); }
});

/* ────────── Slash コマンド登録 ────────── */
const commands=[new SlashCommandBuilder().setName('task').setDescription('📝 タスク追加ボタン')]
  .map(c=>c.toJSON());
const rest=new REST({version:'10'}).setToken(TOKEN);
(async()=>{
  try{
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:commands});
    console.log('✅ Slash コマンド登録成功');
  }catch(e){ console.error('❌ Slash コマンド登録失敗:',e); }
})();

/* ────────── keep-alive (Render) ────────── */
require('express')().get('/',(_,res)=>res.send('Bot is running.')).listen(process.env.PORT||3000);

/* ────────── 起動 ────────── */
client.login(TOKEN);
