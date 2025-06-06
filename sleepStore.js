const fs   = require('fs');
const PATH = './sleepSessions.json';

/* 既存ファイルを読み込む（無ければ空オブジェクト） */
function load() {
  try { return JSON.parse(fs.readFileSync(PATH, 'utf8')); }
  catch { return {}; }
}

/* メモリ→ディスクに書き込み */
function persist(obj) {
  fs.writeFileSync(PATH, JSON.stringify(obj));
}

const data = load();

module.exports = {
  /** そのユーザーが就寝中か？ */
  has: uid => Object.prototype.hasOwnProperty.call(data, uid),

  /** 就寝開始タイムスタンプを取得 */
  get: uid => data[uid],

  /** 就寝開始を記録 */
  set(uid, ts) { data[uid] = ts; persist(data); },

  /** 起床したらレコード削除 */
  del(uid) { delete data[uid]; persist(data); }
};
