// ============================================================
// 가상 응답자 생성기 (verify.js · ranking.js · exposure.js 공용)
// 결정적 난수(mulberry32) 사용 — 같은 seed면 항상 같은 응답 집합
// mode: 'uniform'  = 모든 선택지를 같은 확률로
//       'realistic' = 중장년 응답 분포 가정치 (실측 아님 — 응답 로그가 쌓이면 교체)
// ============================================================
const { licenseTypeBonus } = require('./scoring.js');

function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const LIC_NAMES = ['요양보호사', '사회복지사', '스포츠강사', '펫미용사', '심리상담사', '전기기능사', '한국어교원', '정리수납전문가', '드론', '조경기능사'];
const FIELDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

function makeGenerator(seed = 1, mode = 'uniform') {
  const R = rng(seed);
  const pick = arr => arr[Math.floor(R() * arr.length)];
  const wpick = pairs => { const r = R(); let acc = 0; for (const [v, w] of pairs) { acc += w; if (r < acc) return v; } return pairs[pairs.length - 1][0]; };
  const some = (arr, max) => { const n = 1 + Math.floor(R() * max); const s = new Set(); while (s.size < n) s.add(pick(arr)); return [...s]; };
  const real = mode === 'realistic';

  return function generate() {
    const Q1 = R() < 0.15 ? [] : some(FIELDS, 2);
    const rest = FIELDS.filter(f => !Q1.includes(f));
    const hasLic = R() < 0.35, lic = pick(LIC_NAMES);
    return {
      Q1, Q2: R() < 0.5 ? [] : some(rest, 2),
      Q3: pick([1, 2, 3, 4, 5, 6]), Q4: pick([1, 2, 3, 4, 5]), Q5: pick([1, 2, 3]),
      Q6: pick([1, 2, 3, 4, 5]), Q7: pick([1, 2, 3, 4, 5]),
      Q8: some([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2), Q9: some([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 2),
      Q10: real ? wpick([[1, .40], [2, .45], [3, .15]]) : pick([1, 2, 3]),
      Q11: pick([1, 2, 3]),
      Q12: hasLic ? { has: true, name: lic, typeBonus: licenseTypeBonus(lic) } : { has: false },
      Q13: pick([1, 2, 3]), Q14: pick([1, 2, 3, 4]),
      Q15: real ? wpick([[1, .20], [2, .50], [3, .30]]) : pick([1, 2, 3]),
      Q16: real ? wpick([[1, .20], [2, .45], [3, .25], [4, .10]]) : pick([1, 2, 3, 4]),
      Q17: pick([1, 2, 3]),
      Q18: real ? wpick([[1, .30], [2, .50], [3, .20]]) : pick([1, 2, 3]),
      Q19: real ? wpick([[1, .40], [2, .40], [3, .20]]) : pick([1, 2, 3]),
      Q20: real ? wpick([[1, .35], [2, .45], [3, .20]]) : pick([1, 2, 3]),
      Q21: pick([1, 2, 3, 4]), Q22: pick([1, 2, 3, 4]),
      Q23: real ? wpick([[1, .45], [2, .55]]) : pick([1, 2]),
    };
  };
}

module.exports = { makeGenerator, rng, FIELDS };
