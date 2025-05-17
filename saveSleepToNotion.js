const { Client } = require('@notionhq/client');
require('dotenv').config();

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_SLEEP_DATABASE_ID;

// 過去の睡眠記録から前日比・週平均を計算する関数
async function calculateSleepStats(user) {
  try {
    const response = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: 'User',
        rich_text: { equals: user }
      },
      sorts: [{ property: 'Sleep Date', direction: 'descending' }]
    });

    const today = new Date();
    const last7 = [];
    let previousDuration = null;

    for (const page of response.results) {
      const props = page.properties;
      const dateStr = props['Sleep Date'].date?.start;
      const duration = props['Duration'].number;

      if (!dateStr || !duration) continue;

      const date = new Date(dateStr);
      const daysDiff = (today - date) / (1000 * 60 * 60 * 24);

      if (daysDiff < 8) last7.push(duration);
      if (daysDiff > 0.5 && daysDiff < 1.5 && previousDuration === null) {
        previousDuration = duration;
      }
    }

    const avg = Math.round(last7.reduce((a, b) => a + b, 0) / last7.length || 0);
    return { previous: previousDuration ?? 0, average: avg };
  } catch (e) {
    console.error('❌ 睡眠統計取得失敗:', e);
    return { previous: 0, average: 0 };
  }
}

async function saveSleepToNotion({ duration, user }) {
  const now = new Date();
  const stats = await calculateSleepStats(user);
  const diff = duration - stats.previous;

  try {
    await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: {
        'Sleep Date': { date: { start: now.toISOString() } },
        'Duration': { number: duration },
        'Previous Diff': { number: diff },
        'Weekly Average': { number: stats.average },
        'User': { rich_text: [{ text: { content: user } }] }
      }
    });

    return { success: true, diff, average: stats.average };
  } catch (error) {
    console.error('❌ Notionへの睡眠記録保存失敗:', error);
    return { success: false };
  }
}

module.exports = { saveSleepToNotion };
