const axios = require('axios');
const dayjs = require('dayjs');

const NOTION_TOKEN = process.env.NOTION_API_KEY;
const NOTION_DB_ID = process.env.NOTION_MEMO_DATABASE_ID;

console.log('▶️ 使用中の NOTION_MEMO_DATABASE_ID:', NOTION_DB_ID);

const getUpcomingTasks = async () => {
  try {
    const today = dayjs().format('YYYY-MM-DD');

    const res = await axios.post(
      `https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`,
      {
        filter: {
          property: 'Deadline',
          date: {
            on_or_after: today
          }
        },
        sorts: [
          {
            property: 'Deadline',
            direction: 'ascending'
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );

    const results = res.data.results;

    if (results.length === 0) {
      return '✅ 本日以降のタスクはありません。';
    }

    const tasks = results
      .map((page) => {
        const title =
          page.properties.Name?.title?.[0]?.plain_text || '（無題）';
        const deadline = page.properties.Deadline?.date?.start || '（締切未設定）';
        const type = page.properties.Type?.select?.name || '';
        return `・${title}（${deadline}${type ? ` / ${type}` : ''}）`;
      })
      .slice(0, 5)
      .join('\n');

    return `📝 今日以降のタスク:\n${tasks}`;
  } catch (error) {
    console.error('❌ タスク取得エラー:', error.response?.data || error.message);
    return '⚠️ タスクの取得に失敗しました。';
  }
};

module.exports = getUpcomingTasks;
