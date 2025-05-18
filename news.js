const Parser   = require('rss-parser');
const fetch    = require('node-fetch');
const crypto   = require('crypto');
const parser   = new Parser();

const feedsByTime = {
  朝: [
    'https://jp.reuters.com/rssFeed/topNews',
    'https://b.hatena.ne.jp/hotentry/it.rss',
    'https://techcrunch.com/feed/'
  ],
  昼: [
    'https://japan.cnet.com/rss/index.rdf',
    'https://gigazine.net/news/rss_2.0/',
    'http://feeds.bbci.co.uk/news/world/rss.xml'
  ],
  夜: [
    'https://sorae.info/feed',
    'https://resemom.jp/rss/rss.xml',
    'https://benesse.jp/contents/feed.xml'
  ]
};

/* ────────────────── キャッシュ & ユーティリティ ────────────────── */
const translateCache = new Map();      // key: md5(text) -> 日本語
const alreadySent    = new Set();      // URL 重複排除 (24h)

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

/* ────────────────── 英語判定の改良 ────────────────── */
function isEnglish(text = '') {
  const jp = text.match(/[\u3000-\u30FF\u4E00-\u9FFF]/g) || [];
  const en = text.match(/[A-Za-z]/g) || [];
  return en.length > jp.length;  // アルファベットが日本語より多ければ英語
}

/* ────────────────── 翻訳 (タイムアウト・リトライ・キャッシュ) ────────────────── */
async function translate(text, from = 'en', to = 'ja', retry = 1) {
  const key = md5(text);
  if (translateCache.has(key)) return translateCache.get(key);

  try {
    const res = await fetch('https://libretranslate.de/translate', {
      method  : 'POST',
      timeout : 7000,                                        // 7 秒で Abort
      headers : { 'Content-Type': 'application/json' },
      body    : JSON.stringify({ q: text, source: from, target: to, format: 'text' })
    });
    const data = await res.json();
    translateCache.set(key, data.translatedText);
    return data.translatedText;
  } catch (e) {
    if (retry) return translate(text, from, to, retry - 1);  // 1 回だけリトライ
    console.warn('❌ 翻訳失敗:', e.message);
    return text;                                             // 最後は原文
  }
}

/* ────────────────── メイン関数 ────────────────── */
async function getFormattedNews(label = '朝') {
  const urls = feedsByTime[label] || [];
  const items = [];

  for (const url of urls) {
    try {
      const feed = await parser.parseURL(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Discord Bot)' }
      });

      for (const item of feed.items.slice(0, 4)) {
        if (alreadySent.has(item.link)) continue;            // 重複除外
        alreadySent.add(item.link);

        let title   = item.title?.trim()           || '（無題）';
        let summary = item.contentSnippet?.trim()  || '';
        if (summary.length > 120) summary = summary.slice(0, 117) + '…';

        if (isEnglish(title)  ) title   = await translate(title);
        if (isEnglish(summary)) summary = await translate(summary);

        items.push(`**${title}**\n${summary}\n🔗 <${item.link}>`);
      }
    } catch (e) {
      console.warn(`⚠️ ${url} 取得失敗: ${e.message}`);
    }
  }

  // 直近24h の重複キャッシュを 24h ごとに掃除
  setTimeout(() => alreadySent.clear(), 86_400_000);

  return items.slice(0, 5);   // 5 本まで返す（長さ制限対策）
}

module.exports = { getFormattedNews };
