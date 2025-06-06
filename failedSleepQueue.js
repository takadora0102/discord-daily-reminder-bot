﻿const fs = require("fs");
const Q  = "./failedSleepQueue.json";

function load() {
  try { return JSON.parse(fs.readFileSync(Q, "utf8")); }
  catch { return []; }
}
function save(arr) { fs.writeFileSync(Q, JSON.stringify(arr)); }

const queue = load();

module.exports = {
  push(item) { queue.push(item); save(queue); },
  drain()    { const arr = [...queue]; queue.length = 0; save(queue); return arr; }
};