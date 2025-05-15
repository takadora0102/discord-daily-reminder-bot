const { Client } = require('@notionhq/client');
require('dotenv').config();

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_MEMO_DATABASE_ID;

/**
 * モーダル入力や自動登録されたタスクを Notion に保存する関数
 * @param {Object} data - { title, type, deadline, description }
 */
async function saveTaskToNotion({ title, type, deadline, description }) {
  try {
    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [{ text: { content: title } }]
        },
        Type: {
          select: { name: type }
        },
        Deadline: {
          date: { start: deadline }
        },
        Description: {
          rich_text: [{ text: { content: description } }]
        }
      }
    });
    return { success: true, url: response.url };
  } catch (error) {
    console.error('❌ Notion送信エラー:', error.body || error);
    return { success: false, error };
  }
}

module.exports = { saveTaskToNotion };
