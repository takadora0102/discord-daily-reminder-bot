const { Client } = require('@notionhq/client');
require('dotenv').config();

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_STUDY_DATABASE_ID;

async function saveStudyToNotion({ duration, category, user }) {
  const now = new Date();

  try {
    await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: {
        Date: { date: { start: now.toISOString() } },
        Duration: { number: duration },
        Category: { select: { name: category } },
        User: { rich_text: [{ text: { content: user } }] }
      }
    });

    return { success: true };
  } catch (error) {
    console.error('❌ Notionへの勉強記録保存失敗:', error);
    return { success: false };
  }
}

module.exports = { saveStudyToNotion };
