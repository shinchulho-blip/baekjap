// 전체 순위 노출률 측정 — node ranking.js [uniform|realistic] [csv]
// 가상 응답자 10,000명에게 추천된 횟수로 잡 100개 순위를 매김 (결정적 난수 — 같은 모드면 같은 결과)
const { recommend } = require('./scoring.js');
const jobs = require('./jobs.json');
const { makeGenerator } = require('./profiles.js');

const MODE = process.argv[2] || 'uniform';
const CSV = process.argv[3] === 'csv';
const N = 10000, topCnt = {}, condCnt = {};
const gen = makeGenerator(42, MODE);
for (let i = 0; i < N; i++) {
  for (const x of recommend(gen(), jobs).results) {
    topCnt[x.no] = (topCnt[x.no] || 0) + 1;
    if (x.conditional) condCnt[x.no] = (condCnt[x.no] || 0) + 1;
  }
}
const rows = jobs.map(j => ({ no: j.no, name: j.name, top: topCnt[j.no] || 0, cond: condCnt[j.no] || 0 })).sort((a, b) => b.top - a.top);
if (CSV) console.log('rank,no,name,exposure_pct,conditional_pct');
rows.forEach((r, i) => {
  const pct = (r.top / N * 100).toFixed(2), cpct = (r.cond / N * 100).toFixed(2);
  console.log(CSV ? `${i + 1},${r.no},${r.name},${pct},${cpct}` : `${i + 1}|${r.no}|${r.name}|${pct}% (준비하면 가능 ${cpct}%)`);
});
