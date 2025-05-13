const Parser = require('rss-parser');
const parser = new Parser();

// 使用するRSSフィード（日本語＋英語混在）
const feeds = [
  'https://b.hatena.ne.jp/hotentry/it.rss',             // はてなIT
  'https://gigazine.net/news/rss_2.0/',                 // GIGAZINE
  'https://techcrunch.com/feed/',                       // TechCrunch US
  'http://feeds.bbci.co.uk/news/world/rss.xml'          // BBC World
];

async function fetchTitles(feedUrl, maxItems = 3) {
  const feed = await parser.parseURL(feedUrl);
  const selected = feed.items.slice(0, maxItems);

  return selected.map((item, i) =>
    `**${item.title.trim()}**\n🔗 ${item.link}`
  );
}

async function getFormattedNews() {
  const all = [];

  for (const url of feeds) {
    const items = await fetchTitles(url, 3); // 各ソースから最大3件ずつ取得
    all.push(...items);
  }

  // ランダムに5件抽出
  const shuffled = all.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 5).join('\n\n---\n\n');
}

module.exports = { getFormattedNews };
