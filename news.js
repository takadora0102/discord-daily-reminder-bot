const Parser = require('rss-parser');
const { OpenAI } = require('openai');
require('dotenv').config();

const parser = new Parser();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 対象のRSSフィード
const feeds = [
  'https://b.hatena.ne.jp/hotentry/it.rss', // はてなIT
  'https://gigazine.net/news/rss_2.0/',      // GIGAZINE
  'https://techcrunch.com/feed/',            // TechCrunch US
  'http://feeds.bbci.co.uk/news/world/rss.xml' // BBC World
];

// ChatGPTに要約させるプロンプト
const buildPrompt = (title, content, link) => `
以下の記事の内容を日本語でできるだけ詳しく要約してください。
出力形式：
1. **タイトル**（キャッチーに）
2. 内容（3〜5文、見出し付き＋段落あり）
3. 最後にリンクを記載

---
タイトル: ${title}
本文: ${content}
URL: ${link}
`;

async function fetchAndSummarize(feedUrl, maxItems = 3) {
  const feed = await parser.parseURL(feedUrl);
  const selected = feed.items.slice(0, maxItems);

  const summaries = [];
  for (const item of selected) {
    const prompt = buildPrompt(item.title, item.contentSnippet || item.content || '', item.link);

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      });

      const result = completion.choices[0].message.content.trim();
      summaries.push(result);
    } catch (err) {
      console.error(`❌ ChatGPT要約エラー: ${item.link}`);
      summaries.push(`⚠️ 要約できませんでした：${item.link}`);
    }
  }
  return summaries;
}

async function getFormattedNews() {
  const results = [];

  for (const url of feeds) {
    const articles = await fetchAndSummarize(url, 2); // 各ソースから2件取得（計約8件→後で5件にランダム抽出可）
    results.push(...articles);
  }

  // ランダムで5件抽出
  const shuffled = results.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 5).join('\n\n---\n\n');
}

module.exports = { getFormattedNews };
