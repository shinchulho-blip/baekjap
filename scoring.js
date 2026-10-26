// ============================================================
// 백잡사전 N잡 진단 — 채점 엔진 참조 구현 v1.7 (scoring.js)
// 명세: baekjap-diagnosis-logic 문서와 1:1 대응
// 사용: const { recommend } = require('./scoring.js');
//       const jobs = require('./jobs.json');
//       const result = recommend(answers, jobs);
// ============================================================

// ---- 상수 테이블 (명세 §4) ----
const PLACE_SETS = { 1: ['재택', '온라인'], 2: ['재택', '온라인', '방문', '점포'], 3: null };
const TIME_ORDER = ['주5h 미만', '주5~15h', '주15~30h', '주30h 이상'];
const COST_ORDER = ['₩', '₩₩', '₩₩₩', '₩₩₩₩', '₩₩₩₩₩'];
const LIC_SETS   = { 1: ['불필요'], 2: ['불필요', '교육이수'], 3: null };

const EXP_MAP = { 1: [1, 2, 3], 2: [9, 10], 3: [4, 5], 4: [7], 5: [8], 6: [6, 1] };
const TYPE_FACE_ON = [3, 4, 5, 8, 9];   // 대면 친화
const TYPE_SOLO    = [1, 6, 7];         // 비대면 친화
const TYPE_MANUAL  = [7, 8, 9];         // 매뉴얼형
const TYPE_AUTON   = [1, 2, 6, 10];     // 자율형
const TYPE_NUMERIC = [1, 2, 10];        // 숫자 성과형
const TYPE_CARE    = [4, 5, 8];         // 돌봄·보람형
const IMAGE_RISK   = ['022', '023', '090']; // 이미지 리스크 잡 (운세·펫택시 계열) — 설정값, 조사 진행 시 수정

// [5층] 활동 여건 잡 집합 (잡명 기반 파생 속성 — v0.3 신설 축)
const OUTDOOR_JOBS = ['034', '038', '042', '043', '066', '067', '068', '081']; // 야외 활동형
const VEHICLE_JOBS = ['045', '077', '085', '087', '088', '090'];               // 차량 활용형
const SENIOR_JOBS  = ['027', '028', '033', '040', '045', '054', '055', '071', '073']; // 시니어 대상
const KIDS_JOBS    = ['029', '032', '041', '075', '078'];                      // 아동·청소년 대상
const INST_JOBS    = ['012','017','018','019','021','031','042','043','044','061','062','063','071','073','076','092','093']; // 기관·단체 통로형
const TRAVEL_JOBS  = ['045', '077', '096', '100'];                    // 여행·숙박·손님 맞이형
const CAPITAL_JOBS = ['047', '094', '095', '096', '097', '098', '099']; // 자본·시설 투자형 (하향군)
const SIMPLE_JOBS  = ['005', '006', '008', '051', '095']; // 저진입 단순 과업·재판매형 (v0.5 하향군)
const PRO_JOBS     = ['025','020','009','011','013','014','010','047','030','026','096','019','018','024','055','056','080']; // 전문성·경력 연결형 (v0.5 상향군)
const PET_JOBS     = ['081', '082', '083', '084', '090'];             // 반려동물 돌봄형

// [v0.7] 시장 선호도 상위 잡 — 사용자 지정: 조사 시트 판정이 못 잡은 "사람들이 찾고 좋아하는" 잡 6종.
// 어떤 응답에서도 상시 +1.0 (매력도 프리미엄과 별개의 시장 선호도 프리미엄)
const POPULAR_JOBS = ['021', '037', '043', '056', '061', '100'];
// [v0.7] Q28 선호 분야 → 온램프 대상 잡 (선택한 분야와 직결되는 잡에 +2.5)
const Q28_PREF_MAP = { 1: ['037'], 2: ['021'], 3: ['043'], 4: ['056', '061'], 5: ['100'] }; // ⑥ 없음 = 보정 없음

const Q8_BANDS = { 1: [0, 30], 2: [30, 100], 3: [100, 300], 4: [300, Infinity] };

// Q14 자격명 → 유형 매핑 사전 (확정 과제 §7-6: 운영 중 계속 확장)
const LICENSE_TYPE_MAP = [
  ['요양', 8], ['간병', 8], ['산후', 8], ['도우미', 8], ['복지', 8], ['사회복지', 8],
  ['강사', 4], ['교육', 4], ['한국어', 4], ['체험', 4],
  ['스포츠', 5], ['운동', 5], ['요가', 5], ['필라테스', 5], ['골프', 5], ['안마', 5],
  ['심리', 3], ['상담', 3], ['커리어', 3], ['직업', 3],
  ['전기', 7], ['소방', 7], ['용접', 7], ['에어컨', 7], ['가전', 7], ['목공', 7], ['농업', 7], ['농장', 7], ['드론', 7], ['안전', 7], ['건설', 7],
  ['미용', 9], ['펫', 9], ['동물', 9], ['운전', 9], ['정리수납', 9], ['가사', 9],
  ['장례', 9], ['택시', 9], ['탁송', 9],
  ['체육', 5], ['수목', 7], ['조경', 7], ['식물', 7], ['병해충', 7], ['농장관리', 7],
];

// ---- 1층: Knockout 필터 (명세 §4.1) ----
function layer1Pass(a, j) {
  let fails = 0; const why = [];
  const ps = PLACE_SETS[a.Q1];
  if (ps && !ps.includes(j.place)) { fails++; why.push('활동 반경'); }
  if (a.Q2 < 4 && TIME_ORDER.indexOf(j.time) > a.Q2 - 1) { fails++; why.push('주간 시간'); }
  if (a.Q3 === 1 && j.flex === '고정') { fails++; why.push('시간 통제'); }
  const ls = LIC_SETS[a.Q4];
  if (ls && !ls.includes(j.license)) { fails++; why.push('자격·교육'); }
  if (a.Q5 < 3 && COST_ORDER.indexOf(j.cost) > a.Q5 - 1) { fails++; why.push('시작 비용'); }
  if (a.Q6 === 1 && j.stamina !== '하') { fails++; why.push('체력'); }
  if (a.Q6 === 2 && j.stamina === '상') { fails++; why.push('체력'); }
  return { ok: fails === 0, fails, why };
}

// ---- 채점 (명세 §4.2~4.4) ----
function scoreJob(a, j, typeScore) {
  let s = typeScore.get(j.type_no) || 0;
  const reasons = [];

  // [2층] Q7 첫 수입 시기
  const inc = j.income;
  if (a.Q7 === 1) { s += (inc === '건별' || inc === '시간제') ? 0.75 : (inc === '자산형' ? -0.75 : 0); }
  if (a.Q7 === 2) { s += inc === '월정액' ? 0.75 : (inc === '자산형' ? -0.25 : 0.25); }
  if (a.Q7 === 3) { s += inc === '자산형' ? 0.75 : (inc === '월정액' ? 0.5 : 0.25); }

  // [2층] Q8 월 목표 수입 (기대치 미달 = 순위 하향, 제외 아님) — 밴드 결측 잡은 poolQ8Mid 사용
  if (j.income_min !== null && j.income_max !== null) {
    const [umin, umax] = Q8_BANDS[a.Q8];
    if (j.income_max < umin) s -= 1.0;
  }

  // [2층] Q9 수입 방식 취향
  if (a.Q9 === 1) { s += (inc === '건별' || inc === '시간제') ? 0.5 : (inc === '자산형' ? -0.5 : 0); }
  if (a.Q9 === 2) { s += (inc === '월정액' || inc === '자산형') ? 0.5 : 0; }

  // [2층] Q10 목적 유형 보너스
  if (a.Q10 === 1 && (inc === '건별' || inc === '시간제')) s += 0.5;
  if (a.Q10 === 2 && TYPE_FACE_ON.includes(j.type_no)) s += 1.0;
  if (a.Q10 === 3 && [1, 2, 3, 6].includes(j.type_no)) s += 1.0;
  if (a.Q10 === 4) {
    if (inc === '자산형') s += 0.75;
    if (inc === '월정액') s += 0.25;
    if (j.type_no === 10) s += 0.75;
    if (j.cost === '₩₩₩' || j.cost === '₩₩₩₩' || j.cost === '₩₩₩₩₩') s += 0.25;
  }

  // [3층] Q12 디지털 수준
  if (a.Q12 === 3) { if (j.type_no === 1) s += 0.5; if (j.difficulty === '★★★★' || j.difficulty === '★★★★★') s += 0.5; }

  // [3층] Q14 보유 자격 직결 — 유형 일치 +3, 잡명 직접 일치 +3
  if (a.Q14 && a.Q14.has && a.Q14.name) {
    const kw = LICENSE_TYPE_MAP.find(([k]) => a.Q14.name.includes(k) && (j.name.includes(k) || (j.concept || '').includes(k)));
    if (kw) s += 3;
    if (a.Q14.typeBonus && a.Q14.typeBonus.includes(j.type_no)) s += 3;
  }

  // [하향 레버 v0.4] 자본형: 사업 의사가 없는 응답자(Q10≠④)에게 시설·재고 투자 잡 하향
  if (a.Q10 !== 4 && CAPITAL_JOBS.includes(j.no)) s -= 1.5;
  // [하향 레버 v0.4] 육체형: 몸을 많이 쓰는 잡 전반 소폭 하향 (Q6=③ 응답자에게도 순위상 뒤로)
  if (j.stamina === '상') s -= 0.75;

  // [4층] 보정 ±1~2
  if (a.Q15 === 1 && TYPE_FACE_ON.includes(j.type_no)) s += 1;
  if (a.Q15 === 3 && TYPE_SOLO.includes(j.type_no)) s += 1;
  if (a.Q16 === 1 && TYPE_MANUAL.includes(j.type_no)) s += 1;
  if (a.Q16 === 3 && TYPE_AUTON.includes(j.type_no)) s += 1;
  if (a.Q17 === 1 && TYPE_NUMERIC.includes(j.type_no)) s += 1;
  if (a.Q17 === 2 && TYPE_CARE.includes(j.type_no)) s += 1;
  if (a.Q18 === 1 && IMAGE_RISK.includes(j.no)) s -= 1.5;
  if (a.Q18 === 2 && IMAGE_RISK.includes(j.no)) s += 1;
  if (a.Q19 === 1) { if ([2, 3, 4].includes(j.type_no)) s += 1; if (j.difficulty === '★★★★' || j.difficulty === '★★★★★') s += 0.5; }
  if (a.Q19 === 2) { if (j.type_no === 7 || j.type_no === 9) s += 0.5; if (j.difficulty === '★' || j.difficulty === '★★') s += 0.5; }

  // [5층] 활동 여건 (v0.3 신설) — 응답이 잡의 전제와 맞을 때만 온램프
  if (a.Q20 === 2 && OUTDOOR_JOBS.includes(j.no)) s += 2.5;   // 야외에서 활동적으로
  if (a.Q21 === 1 && VEHICLE_JOBS.includes(j.no)) s += 2.5;   // 차량 활용 가능
  if (a.Q22 === 1 && SENIOR_JOBS.includes(j.no)) s += 2.5;    // 시니어 대상 선호
  if (a.Q22 === 2 && KIDS_JOBS.includes(j.no)) s += 2.5;      // 아동·청소년 대상 선호
  if (a.Q24 === 1 && INST_JOBS.includes(j.no)) s += 2.5;      // 기관 통로 선호
  if (a.Q24 === 2 && INST_JOBS.includes(j.no)) s -= 1.0;      // 직접 알리기 선호 시 소폭 하향

  // [5층] Q25 일의 중심 (v0.4) — 상향군 온램프
  if (a.Q25 === 1 && [2, 3, 4].includes(j.type_no)) s += 2.5; // 가르치고 조언하기 → 컨설턴트·강사·상담·심사원
  if (a.Q25 === 2 && TRAVEL_JOBS.includes(j.no)) s += 2.5;    // 여행·숙박·손님 맞이 → 여행·민박
  if (a.Q25 === 3 && PET_JOBS.includes(j.no)) s += 2.5;       // 동물 돌보기 → 펫
  if (a.Q25 === 4 && [1, 6].includes(j.type_no)) s += 1.0;    // 화면·작업 집중 → 디지털·창작
  if (a.Q4 === 3 && j.license === '국가자격') s += 1.0;       // 자격 준비 의향 → 국가자격 잡 (직업상담사·ISO 심사원 등)

  // [5층] Q28 선호 분야 (v0.7) — 끌리는 분야를 고르면 직결 잡에 온램프
  const pref = Q28_PREF_MAP[a.Q28]; // 선호 분야 직결 시 +3.5 (v0.7)
  if (pref && pref.includes(j.no)) s += 4.5;

  // [6층] 매력도 프리미엄 (v0.6) — 수익성·이미지·선호도 조사 기반, Q27 강도 스위치
  const ATTR_W = { 1: 0.9, 2: 0.2, 3: 0.55 }[a.Q27] ?? 0.55;
  const effAttract = POPULAR_JOBS.includes(j.no) ? Math.max(j.attract || 0, 4.5) : (j.attract || 0); // v0.7 시장 선호도 보정: 인기 6종은 매력도 하한 4.5
  s += ATTR_W * effAttract;

  // [6층] 시장 선호도 프리미엄 (v0.7) — 사용자 지정 인기 잡 6종 상시 가산
  if (POPULAR_JOBS.includes(j.no)) s += 1.0;

  // [5층] Q26 일의 깊이 (v0.5) — 전문성 선호가 기본값이 되도록 설계
  if (a.Q26 === 1 && SIMPLE_JOBS.includes(j.no)) s += 1.0;    // 빨리 시작 선호 → 단순 과업형 가점
  if (a.Q26 === 2) {
    if (SIMPLE_JOBS.includes(j.no)) s -= 3.0;                 // 전문성 선호 → 단순 과업형 강하향
    if (PRO_JOBS.includes(j.no)) s += 2.5;                    // 전문성 선호 → 전문형 강상향
  }

  return s;
}

// 근거 문장 생성 (명세 §6)
function buildReasons(a, j, typeScore) {
  const r = [];
  const ps = PLACE_SETS[a.Q1];
  if (!ps || ps.includes(j.place)) {
    const label = { 1: '집에서만', 2: '동네까지는 나가기', 3: '이동·현장 포함' }[a.Q1];
    r.push(`${label} 조건이 맞아요`);
  }
  if (a.Q2 === 4 || TIME_ORDER.indexOf(j.time) <= a.Q2 - 1) r.push(`주간 시간(${j.time}) 안에서 가능해요`);
  if (typeScore.get(j.type_no) > 0) r.push('오래 해온 경험과 연결되는 분야예요');
  if (a.Q14 && a.Q14.has && a.Q14.typeBonus && a.Q14.typeBonus.includes(j.type_no)) r.push('가진 자격을 바로 쓸 수 있어요');
  if (j.income_min !== null && Q8_BANDS[a.Q8] && j.income_max >= Q8_BANDS[a.Q8][0]) r.push('목표 수입 범위에 들어와요');
  if (POPULAR_JOBS.includes(j.no)) r.push('많은 사람들이 관심을 갖는 인기 분야예요');
  return r;
}

// ---- 메인: recommend(answers, jobs) ----
function recommend(a, jobs) {
  // 1층 필터 (+실패 사유 보존: R6에서 사용)
  let pool = [], excluded = [];
  const evaluated = new Map();
  for (const j of jobs) {
    const v = layer1Pass(a, j);
    evaluated.set(j.no, v);
    (v.ok ? pool : excluded).push(j);
  }
  const condMap = new Map();

  // R2 안전망: 풀 0~1개면 제약을 한 계단씩 완화 (비용→자격→시간→체력→장소 순)
  const relaxed = [];
  let guard = 0;
  while (pool.length < 2 && guard < 12) {
    guard++;
    const step = relaxed.length;
    if (step % 5 === 0 && a.Q5 < 3) { a = { ...a, Q5: a.Q5 + 1 }; relaxed.push('시작비용 완화'); }
    else if (step % 5 === 1 && a.Q4 < 3) { a = { ...a, Q4: a.Q4 + 1 }; relaxed.push('자격 조건 완화'); }
    else if (step % 5 === 2 && a.Q2 < 4) { a = { ...a, Q2: a.Q2 + 1 }; relaxed.push('시간 완화'); }
    else if (step % 5 === 3 && a.Q6 < 3) { a = { ...a, Q6: a.Q6 + 1 }; relaxed.push('체력 완화'); }
    else if (step % 5 === 4 && a.Q1 < 3) { a = { ...a, Q1: a.Q1 + 1 }; relaxed.push('활동 반경 완화'); }
    pool = jobs.filter(j => layer1Pass(a, j).ok);
  }

  // 3층 유형 점수 계산
  const typeScore = new Map();
  const bump = (t, v) => typeScore.set(t, (typeScore.get(t) || 0) + v);
  (a.Q11 || []).forEach(e => (EXP_MAP[e] || []).forEach(t => bump(t, 2)));
  if (a.Q13 === 1) { bump(4, 1.5); bump(5, 1.5); }
  if (a.Q13 === 2) { bump(4, 0.5); bump(5, 0.5); }

  // R6 조건부 온램프 (v0.3): Q23=① 도전 수용 시, 1층 조건을 딱 하나만 어긴 잡 중 친화도 높은 것을 최대 3개 편입
  if (a.Q23 === 1) {
    const prefSet = Q28_PREF_MAP[a.Q28] || [];
    const affinity = j => (typeScore.get(j.type_no) || 0)
      + (a.Q20 === 2 && OUTDOOR_JOBS.includes(j.no) ? 2.5 : 0)
      + (a.Q21 === 1 && VEHICLE_JOBS.includes(j.no) ? 2.5 : 0)
      + (a.Q22 === 1 && SENIOR_JOBS.includes(j.no) ? 2.5 : 0)
      + (a.Q22 === 2 && KIDS_JOBS.includes(j.no) ? 2.5 : 0)
      + (a.Q24 === 1 && INST_JOBS.includes(j.no) ? 2.5 : 0)
      + (a.Q25 === 1 && [2, 3, 4].includes(j.type_no) ? 2.5 : 0)
      + (a.Q25 === 2 && TRAVEL_JOBS.includes(j.no) ? 2.5 : 0)
      + (a.Q25 === 3 && PET_JOBS.includes(j.no) ? 2.5 : 0)
      + (prefSet.includes(j.no) ? 4.5 : 0)
      + (a.Q4 === 3 && j.license === '국가자격' ? 1.0 : 0)
      + (a.Q26 === 2 && PRO_JOBS.includes(j.no) ? 1.5 : 0)
      + (a.Q14 && a.Q14.has && a.Q14.name && LICENSE_TYPE_MAP.find(([k]) => a.Q14.name.includes(k) && (j.name.includes(k) || (j.concept || '').includes(k))) ? 3 : 0)
      + (a.Q14 && a.Q14.typeBonus && a.Q14.typeBonus.includes(j.type_no) ? 3 : 0);
    const near = jobs.filter(j => { const v = layer1Pass(a, j); return !v.ok && v.fails === 1; });
    const admitted = near.filter(j => affinity(j) >= 2.5)
      .sort((x, y) => affinity(y) - affinity(x) || parseInt(x.no) - parseInt(y.no))
      .slice(0, 3);
    for (const j of admitted) condMap.set(j.no, evaluated.get(j.no).why);
  }

  // 2·4층 개별 채점
  const scored = pool.map(j => {
    const s = scoreJob(a, j, typeScore);
    const reasons = buildReasons(a, j, typeScore);
    const condWhy = condMap.get(j.no) || null;
    if (condWhy) reasons.push(`단, ${condWhy.join('·')} 조건을 하나 채우면 시작할 수 있어요`);
    return { job: j, score: Math.round(s * 100) / 100, reasons, conditional: condWhy };
  });

  // 동점 로테이션 해시: 응답 조합 + 잡번호 → 0~999 (같은 답이면 항상 같은 값 = 결정적)
  const key = JSON.stringify(a);
  const hash = no => { let h = 0; const s = key + no; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000; return h; };

  // R5 노출 지터: 응답 해시 기반 ±0.6 (같은 답이면 항상 같은 값 — 결정적)
  const jitter = no => (((hash(no) % 9) - 4) * 0.15);

  // 정렬: (점수+지터) desc → 유형 경험 점수 desc → 해시 로테이션 asc → Job No. asc
  scored.sort((x, y) =>
    (y.score + jitter(y.job.no)) - (x.score + jitter(x.job.no)) ||
    (typeScore.get(y.job.type_no) || 0) - (typeScore.get(x.job.type_no) || 0) ||
    hash(x.job.no) - hash(y.job.no) ||
    (parseInt(x.job.no) - parseInt(y.job.no)));

  // R1: 풀 2~5개면 전부, 6개 이상이면 상위 6개
  let out = scored.slice(0, Math.min(6, scored.length));

  // R3: 같은 유형 최대 3개 — 초과분을 다음 순위 잡으로 교체 (v0.3: 2→3, 중장년 적합 잡의 유형 내 기회 확대)
  const countByType = {};
  let simpleUsed = false;
  const kept = [];
  for (const it of scored) {
    const c = countByType[it.job.type_no] || 0;
    if (c >= 3) continue;
    if (SIMPLE_JOBS.includes(it.job.no)) { if (simpleUsed) continue; simpleUsed = true; }
    countByType[it.job.type_no] = c + 1;
    kept.push(it);
    if (kept.length >= 6) break;
  }
  out = kept;

  // R4: 풀에 있는 각 유형의 최고 점수 잡은 반드시 포함 — 빠졌으면 중복 유형 2번째와 교체
  const outTypes = new Set(out.map(it => it.job.type_no));
  for (const t of new Set(pool.map(j => j.type_no))) {
    if (outTypes.has(t)) continue;
    const top = scored.find(it => it.job.type_no === t);
    if (!top) continue;
    const dupIdx = out.findIndex((it, i) => (countByType[it.job.type_no] === 2) && out.findIndex(o => o === it) === i && out.filter(o => o.job.type_no === it.job.type_no).length === 2 && it !== out.find(o => o.job.type_no === it.job.type_no));
    const swapIdx = dupIdx >= 0 ? dupIdx : out.length - 1;
    if (out.length >= 6) out[swapIdx] = top; else out.push(top);
    outTypes.add(t);
  }

  // R8: 전문형(PRO_JOBS) 최소 3개 보장 — 부족하면 비전문형 최하위와 교체 (v0.5)
  const proIn = out.filter(it => PRO_JOBS.includes(it.job.no)).length;
  if (proIn < 3) {
    const outNos = new Set(out.map(it => it.job.no));
    const proPool = scored.filter(it => PRO_JOBS.includes(it.job.no) && !outNos.has(it.job.no));
    for (const pro of proPool) {
      if (out.filter(it => PRO_JOBS.includes(it.job.no)).length >= 3) break;
      if (out.length >= 6) {
        let idx = -1;
        for (let i = out.length - 1; i >= 0; i--) {
          if (!PRO_JOBS.includes(out[i].job.no) && !out[i].job.__r4) { idx = i; break; }
        }
        if (idx === -1) idx = out.length - 1;
        out[idx] = pro;
      } else out.push(pro);
    }
  }
  out.sort((x, y) => y.score - x.score);

  return {
    count: out.length,
    pool_size: pool.length,
    relaxed,
    results: out.map(it => ({
      no: it.job.no, name: it.job.name, type: it.job.type_name,
      conditional: it.conditional || null,
      concept: it.job.concept, cost: it.job.cost, time: it.job.time,
      income: it.job.income_max ? `월 ${it.job.income_min}~${it.job.income_max}만원${it.job.income_est ? '(추정)' : ''}` : it.job.income_raw || null,
      score: it.score, reasons: it.reasons,
    })),
  };
}

// Q14 주관식 자격명 → 유형 보너스 계산 (명세 §4.4)
function licenseTypeBonus(name) {
  const n = String(name || '');
  const types = new Set();
  for (const [kw, t] of LICENSE_TYPE_MAP) if (n.includes(kw)) types.add(t);
  return [...types];
}

module.exports = { recommend, licenseTypeBonus, layer1Pass, scoreJob, OUTDOOR_JOBS, VEHICLE_JOBS, SENIOR_JOBS, KIDS_JOBS, INST_JOBS, TRAVEL_JOBS, PET_JOBS, CAPITAL_JOBS, SIMPLE_JOBS, PRO_JOBS, POPULAR_JOBS, Q28_PREF_MAP };
