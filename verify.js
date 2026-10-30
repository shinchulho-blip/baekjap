// ============================================================
// 회귀 검증 v2.0 — node verify.js (실패 항목이 있으면 종료 코드 1)
// ============================================================
const fs = require('fs');
const S = require('./scoring.js');
const { recommend, conditionCheck, FIELD_JOBS, CAR_REQUIRED, MIN_RESULTS, MAX_RESULTS, MAX_SOFT_FAILS, WANT_MIN } = S;
const jobs = require('./jobs.json');
const { makeGenerator } = require('./profiles.js');

let failed = 0;
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '통과' : '실패'} | ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failed++;
};
const name = no => `${no} ${jobs.find(j => j.no === no).name}`;
const inFields = (fields, no) => (fields || []).some(f => FIELD_JOBS[f].includes(no));

// 1) 최악 경로: 3부 조건을 모두 가장 좁게 답하면 정확히 2개 (016, 006)
const worst = { Q1: [], Q2: [], Q3: 5, Q4: 5, Q5: 2, Q6: 1, Q7: 1, Q8: [10], Q9: [], Q10: 1, Q11: 3, Q12: { has: false },
  Q13: 3, Q14: 4, Q15: 1, Q16: 1, Q17: 1, Q18: 1, Q19: 1, Q20: 1, Q21: 1, Q22: 1, Q23: 2 };
const w = recommend(worst, jobs);
const worstNos = w.results.map(r => r.no).sort();
check(w.count === 2 && worstNos.join() === '006,016', '최악 경로 출력 2개 (016, 006)', w.results.map(r => name(r.no)).join(', '));

// 2) 결정성: 같은 답 → 같은 결과
const gen = makeGenerator(2026, 'uniform');
let det = true;
for (let i = 0; i < 500; i++) {
  const a = gen();
  if (JSON.stringify(recommend(a, jobs)) !== JSON.stringify(recommend(JSON.parse(JSON.stringify(a)), jobs))) { det = false; break; }
}
check(det, '결정성 (같은 답 → 같은 결과, 500명)');
check(!/Math\.random/.test(fs.readFileSync(__dirname + '/scoring.js', 'utf8')), 'scoring.js에 Math.random 없음');

// 3) 분야 연결: 잡 100개 모두 1개 이상 분야에 연결
const linked = new Set(Object.values(FIELD_JOBS).flat());
check(linked.size === jobs.length && jobs.every(j => linked.has(j.no)), `분야 연결 ${linked.size} / ${jobs.length}`);

// 4) 무작위 2만 명: 개수 2~6 · 절대 조건 위반 0 · 조건부는 부족 조건 2개 이하 · 하고 싶은 분야 최소 보장
const N = 20000, freq = {}, dist = {};
let hardViolations = 0, softViolations = 0, wantShort = 0, wantAsked = 0, wantGot = 0;
const g = makeGenerator(7, 'uniform');
for (let n = 0; n < N; n++) {
  const a = g();
  const r = recommend(a, jobs);
  dist[r.count] = (dist[r.count] || 0) + 1;
  for (const x of r.results) {
    freq[x.no] = (freq[x.no] || 0) + 1;
    const j = jobs.find(v => v.no === x.no);
    if (conditionCheck(a, j) === null) hardViolations++;
    if (x.conditional && x.conditional.length > MAX_SOFT_FAILS && !r.relaxed.length) softViolations++;
  }
  if (a.Q1.length) {
    wantAsked++;
    const got = r.results.filter(x => inFields(a.Q1, x.no)).length;
    if (got) wantGot++;
    const available = jobs.filter(j => inFields(a.Q1, j.no)).filter(j => { const s = conditionCheck(a, j); return s !== null && s.length <= MAX_SOFT_FAILS; }).length;
    if (got < Math.min(WANT_MIN, available)) wantShort++;
  }
}
const counts = Object.keys(dist).map(Number);
check(Math.min(...counts) >= MIN_RESULTS && Math.max(...counts) <= MAX_RESULTS, `출력 개수 ${MIN_RESULTS}~${MAX_RESULTS}개`, JSON.stringify(dist));
check(hardViolations === 0, '절대 조건(집에서만·앉아서만·차 없음·하기 싫은 분야) 위반 0건', `${hardViolations}건`);
check(softViolations === 0, `조건부 추천은 부족 조건 ${MAX_SOFT_FAILS}개 이하`, `${softViolations}건`);
check(wantShort < N * 0.01, `하고 싶은 분야 잡 최소 ${WANT_MIN}개 보장 (가능한 경우)`, `미달 ${wantShort}명 / 분야 고른 ${wantAsked}명`);
console.log(`     참고: 하고 싶은 분야를 고른 사람 중 그 분야 잡을 1개 이상 받은 비율 ${(wantGot / wantAsked * 100).toFixed(1)}%`);

// 5) 커버리지: 무작위 2만 명 기준 전체 등장 + 1% 넘게 추천되는 잡 60개 이상
const seen = Object.keys(freq).length;
const over1 = jobs.filter(j => (freq[j.no] || 0) / N >= 0.01).length;
check(seen === jobs.length, `무작위 커버리지 ${seen} / ${jobs.length}`, jobs.filter(j => !freq[j.no]).map(j => name(j.no)).join(', '));
check(over1 >= 60, `응답자 1% 넘게에게 추천되는 잡 ${over1}개 (기준 60)`);
const top = Object.entries(freq).sort((x, y) => y[1] - x[1]).slice(0, 3);
console.log(`     참고: 최다 노출 ${top.map(([no, c]) => `${name(no)} ${(c / N * 100).toFixed(1)}%`).join(' | ')}`);

// 6) 도달성: 각 잡의 분야를 '하고 싶은 일'로 고르고 조건을 그 잡에 맞춘 응답 중, 그 잡이 바로 추천되는 응답이 존재
const TIME = ['주5h 미만', '주5~15h', '주15~30h', '주30h 이상'], COST = ['₩', '₩₩', '₩₩₩', '₩₩₩₩', '₩₩₩₩₩'];
const unreachable = [];
for (const j of jobs) {
  const field = Number(Object.keys(FIELD_JOBS).find(f => FIELD_JOBS[f].includes(j.no)));
  const fit = {
    Q1: [field], Q2: [],
    Q15: ['재택', '온라인'].includes(j.place) ? 1 : (j.place === '현장' ? 3 : 2),
    Q16: TIME.indexOf(j.time) + 1, Q17: j.flex === '고정' ? 3 : 2,
    Q18: { '하': 1, '중': 2, '상': 3 }[j.stamina],
    Q19: Math.min(3, COST.indexOf(j.cost) + 1), Q20: j.license === '불필요' ? 1 : (j.license === '교육이수' ? 2 : 3), Q23: 1,
  };
  const gj = makeGenerator(100 + parseInt(j.no), 'uniform');
  let ok = false;
  for (let i = 0; i < 3000 && !ok; i++) {
    const a = { ...gj(), ...fit };
    ok = recommend(a, jobs).results.some(x => x.no === j.no && !x.conditional);
  }
  if (!ok) unreachable.push(name(j.no));
}
check(!unreachable.length, `도달성 ${jobs.length - unreachable.length} / ${jobs.length} (맞는 답이면 바로 추천)`, unreachable.join(', '));

// 7) index.html에 들어 있는 잡 데이터가 jobs.json과 같음
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const m = html.match(/const JOBS = (\[[\s\S]*?\n\]);/);
check(!!m && JSON.stringify(JSON.parse(m[1])) === JSON.stringify(jobs), 'index.html 잡 데이터 = jobs.json');
check(/<script src="scoring\.js"><\/script>/.test(html), 'index.html이 scoring.js를 불러옴 (채점 코드 단일화)');

// 8) 예시 결과
const ex = { Q1: [10, 4], Q2: [14], Q3: 1, Q4: 2, Q5: 1, Q6: 5, Q7: 1, Q8: [5, 9], Q9: [2, 1], Q10: 2, Q11: 2,
  Q12: { has: true, name: '요양보호사', typeBonus: S.licenseTypeBonus('요양보호사') }, Q13: 3, Q14: 1,
  Q15: 2, Q16: 2, Q17: 2, Q18: 2, Q19: 1, Q20: 2, Q21: 2, Q22: 2, Q23: 2 };
const er = recommend(ex, jobs);
console.log(`\n예시(돌봄·교육 희망, 요양보호사 자격, 동네·주5~15h·가벼운 활동) → ${er.count}개`);
er.results.forEach((x, i) => console.log(`  ${i + 1}위 [${x.score}점] ${x.no} ${x.name}${x.conditional ? ' (준비 필요: ' + x.conditional.join('·') + ')' : ''} — ${x.reasons.join(' / ')}`));

console.log(failed ? `\n실패 ${failed}건` : '\n모든 검증 통과');
process.exitCode = failed ? 1 : 0;
