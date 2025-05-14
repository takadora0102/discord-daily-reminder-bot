const {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
require('dotenv').config();

const TOKEN = process.env.TOKEN;
const TARGET_USER_ID = process.env.TARGET_USER_ID;

const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ],
  partials: [Partials.Channel]
});

client.once('ready', async () => {
  console.log(`✅ Bot is ready as ${client.user.tag}`);
  const user = await client.users.fetch(TARGET_USER_ID);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('add_task')
      .setLabel('📝 タスクを追加')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('test_button')
      .setLabel('🧪 テスト用ボタン')
      .setStyle(ButtonStyle.Secondary)
  );

  await user.send({ content: '🧪 テスト用のボタンです。押してみてください。', components: [row] });
});

client.on(Events.InteractionCreate, async interaction => {
  console.log(`🟡 Interaction received`);
  try {
    if (interaction.isButton()) {
      console.log(`🔘 Button Pressed: "${interaction.customId}"`);

      await interaction.reply({
        content: `✅ 押されたボタン: ${interaction.customId}`,
        ephemeral: true
      });

      if (interaction.customId === 'add_task') {
        console.log('🟢 add_task ボタンが一致しました（処理未実装）');
      }
    }
  } catch (err) {
    console.error('❌ Interaction エラー:', err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply('❌ エラーが発生しました。');
      } else {
        await interaction.reply({ content: '❌ エラーが発生しました。', ephemeral: true });
      }
    } catch {}
  }
});

const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running.'));
app.listen(3000);

client.login(TOKEN);
