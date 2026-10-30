// 잡별 노출률·조건 통과율 측정 — node exposure.js [uniform|realistic]
// 노출률 하위 잡과, 3부 조건 병목(바로 가능 비율이 낮은 잡)을 함께 보여줌
const { recommend, conditionCheck } = require('./scoring.js');
const jobs = require('./jobs.json');
const { makeGenerator } = require('./profiles.js');

const MODE = process.argv[2] || 'uniform';
const N = 10000, topCnt = {}, readyCnt = {}, nearCnt = {}, softWhy = {};
const gen = makeGenerator(42, MODE);
for (let i = 0; i < N; i++) {
  const a = gen();
  for (const x of recommend(a, jobs).results) topCnt[x.no] = (topCnt[x.no] || 0) + 1;
  for (const j of jobs) {
    const soft = conditionCheck(a, j);
    if (soft === null) continue;
    if (!soft.length) readyCnt[j.no] = (readyCnt[j.no] || 0) + 1;
    else {
      if (soft.length <= 2) nearCnt[j.no] = (nearCnt[j.no] || 0) + 1;
      for (const w of soft) { softWhy[j.no] = softWhy[j.no] || {}; softWhy[j.no][w] = (softWhy[j.no][w] || 0) + 1; }
    }
  }
}
const pct = (c, n = N) => +((c || 0) / n * 100).toFixed(1);
const rows = jobs.map(j => ({
  no: j.no, name: j.name, type: (j.type_name || '').split(' ')[0],
  top: +((topCnt[j.no] || 0) / N * 100).toFixed(2), ready: pct(readyCnt[j.no]), near: pct(nearCnt[j.no]),
  why: Object.entries(softWhy[j.no] || {}).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w).join('·'),
})).sort((a, b) => a.top - b.top);

console.log(`=== 노출률 하위 15잡 (${MODE}, 10,000명 기준) ===`);
rows.slice(0, 15).forEach((r, i) => console.log(`${i + 1}. ${r.no} ${r.name} | 추천 ${r.top}% | 바로 가능 ${r.ready}% | 준비하면 가능 ${r.near}% | 주로 부족한 조건: ${r.why || '-'}`));
console.log('\n=== 참고: 바로 가능 비율 하위 5 (3부 조건 병목) ===');
[...rows].sort((a, b) => a.ready - b.ready).slice(0, 5).forEach(r => console.log(`${r.no} ${r.name} | 바로 가능 ${r.ready}% | 추천 ${r.top}% | 주로 부족한 조건: ${r.why || '-'}`));
