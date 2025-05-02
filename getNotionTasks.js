// getNotionTasks.js
const axios = require('axios');
const dayjs = require('dayjs');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DB_ID = process.env.NOTION_DB_ID;

async function getUpcomingTasks() {
  const today = dayjs().startOf('day');
  const threeDaysLater = today.add(3, 'day');

  const url = `https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`;

  try {
    const response = await axios.post(
      url,
      {
        filter: {
          and: [
            {
              property: 'Deadline', // ← あなたの列名に合わせて修正済み
              date: {
                on_or_after: today.format('YYYY-MM-DD')
              }
            },
            {
              property: 'Deadline',
              date: {
                on_or_before: threeDaysLater.format('YYYY-MM-DD')
              }
            }
          ]
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

    const results = response.data.results;

    if (results.length === 0) return '📌 締切が3日以内のタスクはありません。';

    const tasks = results.map(page => {
      const taskName =
        page.properties.Task?.title?.[0]?.text?.content || '(無題)';
      const dueDate =
        page.properties.Deadline?.date?.start || '日付なし';
      const dateText = dayjs(dueDate).format('MM/DD (dd)');

      return `📝 ${taskName}（締切: ${dateText}）`;
    });

    return `✅ 直近のタスク:\n${tasks.join('\n')}`;
  } catch (error) {
    console.error('Notion API エラー:', error.response?.data || error.message);
    return '⚠️ タスクの取得に失敗しました。';
  }
}

module.exports = getUpcomingTasks;
