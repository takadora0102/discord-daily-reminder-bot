const Parser = require('rss-parser');
const parser = new Parser();
const fetch = require('node-fetch');

const feedsByTime = {
  朝: [
    'http://feeds.bbci.co.uk/news/world/rss.xml',
    'https://jp.reuters.com/rssFeed/topNews',
    'https://techcrunch.com/feed/'
  ],
  昼: [
    'https://b.hatena.ne.jp/hotentry/it.rss',
    'https://japan.cnet.com/rss/index.rdf',
    'https://gigazine.net/news/rss_2.0/'
  ],
  夜: [
    'https://sorae.info/feed',
    'https://resemom.jp/rss/rss.xml',
    'https://benesse.jp/contents/feed.xml'
  ]
};

async function translate(text, from = 'en', to = 'ja') {
  try {
    const res = await fetch('https://libretranslate.de/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: from, target: to, format: 'text' })
    });
    const data = await res.json();
    return data.translatedText || text;
  } catch (e) {
    console.error('❌ 翻訳失敗:', e);
    return text;
  }
}

function isEnglish(text) {
  const jaMatch = text.match(/[\u3000-\u30FF\u4E00-\u9FFF]/g);
  const jaRatio = (jaMatch ? jaMatch.length : 0) / text.length;
  return jaRatio < 0.3;
}

async function getFormattedNews(label = '朝') {
  const urls = feedsByTime[label] || [];
  const all = [];

  for (const url of urls) {
    try {
      const feed = await parser.parseURL(url);
      for (const item of feed.items.slice(0, 3)) {
        let title = item.title?.trim() || '（無題）';
        let summary = item.contentSnippet?.slice(0, 100) || '';
        let link = item.link;

        if (isEnglish(title)) title = await translate(title);
        if (isEnglish(summary)) summary = await translate(summary);

        all.push(`**${title}**\n${summary}...\n🔗 <${link}>`);
      }
    } catch (e) {
      console.warn(`⚠️ ${url} の取得に失敗:`, e.message);
    }
  }

  const shuffled = all.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 5).join('\n\n---\n\n');
}

module.exports = { getFormattedNews };
