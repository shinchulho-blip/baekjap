// ============================================================
// 백잡사전 N잡 진단 — 채점 엔진 v2.0 (scoring.js)
// 질문 구조: 1부 하고 싶은 일(Q1~Q7) · 2부 잘하는 것(Q8~Q14) · 3부 지금 상황(Q15~Q23)
// 사용(Node):   const { recommend } = require('./scoring.js');
//               const result = recommend(answers, require('./jobs.json'));
// 사용(브라우저): <script src="scoring.js"></script> 후 recommend(answers, JOBS)
// ============================================================

// ---- 조정 포인트: 가중치 ----
const W = {
  WANT: 6,          // Q1 하고 싶은 분야 직결
  STRENGTH: 2.5,    // Q9 잘한다는 말을 듣는 것
  EXP: 2,           // Q8 오래 해온 일
  LICENSE: 3,       // Q12 보유 자격 (유형 일치 / 잡명 직접 일치 각각)
  TARGET: 2,        // Q3 함께하고 싶은 대상
  ATTRACT: 0.25,    // 매력도 지수 (응답과 무관한 점수 — 작게 유지)
  POPULAR: 0.3,     // 시장 선호도 인기 잡
  COND_PENALTY: 1.5 // 조정 가능 조건 1개 부족당 감점
};

// ---- 조정 포인트: 출력 규칙 ----
const MAX_RESULTS = 6;
const MIN_RESULTS = 2;
const MAX_PER_TYPE = 3;      // 같은 유형 최대 개수
const MAX_SIMPLE = 1;        // 단순 과업형 최대 개수
const WANT_READY_MAX = 3;    // 하고 싶은 분야 중 바로 가능한 잡 최대 개수
const WANT_MIN = 2;          // 하고 싶은 분야 잡 최소 보장 개수 (부족하면 '준비하면 가능' 잡으로 채움)
const MAX_SOFT_FAILS = 2;    // 조정 가능 조건이 이 개수까지 부족하면 '준비하면 가능'으로 보여줌
const MAX_CONDITIONAL = 3;   // 결과 중 '준비하면 가능' 잡 최대 개수 (안전망 제외)

// ---- Q1·Q2 분야 → 잡 (잡 100개 모두 1개 이상 분야에 연결) ----
const FIELD_NAMES = { 1: '컴퓨터·스마트폰', 2: '창업·경영 자문', 3: '상담', 4: '교육·강의', 5: '운동·건강 지도',
  6: '문화·취미 안내', 7: '글·영상·작품', 8: '집수리·시설 점검', 9: '나무·농사·자연', 10: '돌봄',
  11: '반려동물', 12: '운전·배달·이동', 13: '살림·정리·행사', 14: '가게·공간 운영' };
const FIELD_JOBS = {
  1:  ['001', '002', '003', '004', '005', '006', '007', '008'],
  2:  ['009', '010', '011', '012', '013', '014', '015', '016', '017'],
  3:  ['018', '019', '020', '021', '022', '023', '024'],
  4:  ['025', '026', '027', '028', '029', '030', '031', '032', '033'],
  5:  ['036', '038', '039', '040', '046'],
  6:  ['034', '035', '037', '041', '042', '043', '044', '045'],
  7:  ['047', '048', '049', '050', '051', '052', '053', '054', '055'],
  8:  ['056', '057', '058', '059', '060', '061', '062', '063', '064', '065', '069'],
  9:  ['034', '043', '066', '067', '068'],
  10: ['070', '071', '072', '073', '074', '075', '076'],
  11: ['081', '082', '083', '084', '090'],
  12: ['077', '078', '085', '086', '087', '088', '089'],
  13: ['079', '080', '091', '092', '093'],
  14: ['094', '095', '096', '097', '098', '099', '100'],
};

// ---- 잡 집합 (잡명 기반 파생 속성) ----
const OUTDOOR_JOBS = ['034', '038', '042', '043', '066', '067', '068', '081']; // 야외 활동형
const VEHICLE_JOBS = ['045', '077', '085', '087', '088', '090'];               // 차량 활용형
const CAR_REQUIRED = ['088', '090'];                                           // 자기 차가 꼭 필요한 잡 (차 없음 → 제외)
const SENIOR_JOBS  = ['027', '028', '033', '040', '045', '054', '055', '071', '073']; // 시니어 대상
const KIDS_JOBS    = ['029', '032', '041', '075', '078'];                      // 아동·청소년 대상
const GUEST_JOBS   = ['030', '042', '044', '045', '077', '096', '100'];        // 외국인·여행객 대상
const BIZ_JOBS     = ['001', '002', '003', '007'];                             // 사장님·회사 대상 (+ 2유형 전체)
const INST_JOBS    = ['012','017','018','019','021','031','042','043','044','061','062','063','071','073','076','092','093']; // 기관·단체 통로형
const PET_JOBS     = ['081', '082', '083', '084', '090'];                      // 반려동물 돌봄형
const CAPITAL_JOBS = ['047', '094', '095', '096', '097', '098', '099'];        // 자본·시설 투자형 (사업 의사 없으면 하향)
const SIMPLE_JOBS  = ['005', '006', '008', '051', '095'];                      // 저진입 단순 과업·재판매형
const PRO_JOBS     = ['025','020','009','011','013','014','010','047','030','026','096','019','018','024','055','056','080']; // 전문성·경력 연결형
const POPULAR_JOBS = ['021', '037', '043', '056', '061', '100'];               // 시장 선호도 인기 잡

const TYPE_FACE_ON = [3, 4, 5, 8, 9];   // 대면 친화
const TYPE_SOLO    = [1, 6, 7];         // 비대면 친화

// ---- Q3 함께하고 싶은 대상 ----
const TARGET_NAMES = { 1: '또래·어르신', 2: '아이·청소년', 3: '외국인·여행객', 4: '사장님·회사' };
function targetHit(q3, j) {
  if (q3 === 1) return SENIOR_JOBS.includes(j.no);
  if (q3 === 2) return KIDS_JOBS.includes(j.no);
  if (q3 === 3) return GUEST_JOBS.includes(j.no);
  if (q3 === 4) return j.type_no === 2 || BIZ_JOBS.includes(j.no);
  return false;
}

// ---- Q8 오래 해온 일 → 유형 (8 운전은 차량 활용 잡) ----
const EXP_NAMES = { 1: '서류·사무·관리', 2: '영업·판매·응대', 3: '가르치고 설명하기', 4: '기술·현장·수리', 5: '돌봄·간호·복지',
  6: '글·그림·사진·영상', 7: '경영·회계·기획', 8: '운전·운송·물류', 9: '살림·육아' };
const EXP_MAP = { 1: [1, 2, 3], 2: [9, 10], 3: [4, 5], 4: [7], 5: [8], 6: [6, 1], 7: [2, 10], 9: [8, 9] };
function expHit(e, j) {
  if (e === 8) return VEHICLE_JOBS.includes(j.no);
  return (EXP_MAP[e] || []).includes(j.type_no);
}

// ---- Q9 잘한다는 말을 듣는 것 → 유형(t)·잡(j) ----
const STRENGTH_NAMES = { 1: '쉽게 설명하기', 2: '잘 들어주기', 3: '손재주', 4: '꼼꼼함', 5: '글·사진', 6: '친화력',
  7: '운전', 8: '동물 다루기', 9: '살림·정리', 10: '돈·숫자 관리', 11: '운동·체력' };
const STRENGTH_MAP = {
  1:  { t: [4, 5] },
  2:  { t: [3, 8] },
  3:  { t: [7], j: ['035', '051', '082'] },
  4:  { j: ['003', '005', '008', '015', '016', '017', '062', '091', '092'] },
  5:  { t: [6], j: ['001', '002', '007'] },
  6:  { j: ['036', '042', '044', '045', '046', '054', '077', '093', '096', '100'] },
  7:  { j: VEHICLE_JOBS },
  8:  { j: PET_JOBS },
  9:  { j: ['037', '071', '074', '075', '079', '080'] },
  10: { t: [2, 10] },
  11: { j: ['036', '038', '039', '040', '043', '066', '067', '081', '086', '089'] },
};
function strengthHit(k, j) {
  const m = STRENGTH_MAP[k];
  return !!m && ((m.t || []).includes(j.type_no) || (m.j || []).includes(j.no));
}

// Q12 자격명 → 유형 매핑 사전 (운영 중 계속 확장)
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
function licenseHit(lic, j) {
  if (!lic || !lic.has) return false;
  const direct = !!lic.name && LICENSE_TYPE_MAP.some(([k]) => lic.name.includes(k) && (j.name.includes(k) || (j.concept || '').includes(k)));
  return direct || (lic.typeBonus || []).includes(j.type_no);
}

const inFields = (fields, j) => (fields || []).some(f => (FIELD_JOBS[f] || []).includes(j.no));
const wantedFieldOf = (a, j) => (a.Q1 || []).find(f => FIELD_JOBS[f].includes(j.no));

// ---- 3부 조건 판정 ----
// 절대 조건에 걸리면 null (결과에서 제외), 아니면 부족한 '조정 가능 조건' 목록(빈 배열 = 바로 가능)
const TIME_ORDER = ['주5h 미만', '주5~15h', '주15~30h', '주30h 이상'];
const COST_ORDER = ['₩', '₩₩', '₩₩₩', '₩₩₩₩', '₩₩₩₩₩'];
const LIC_LEVEL  = { '불필요': 0, '교육이수': 1, '민간자격': 2, '국가자격': 2 };
const STAMINA_LEVEL = { '하': 0, '중': 1, '상': 2 };
function conditionCheck(a, j) {
  // 절대 조건
  if (inFields(a.Q2, j) && !inFields(a.Q1, j)) return null;               // 하기 싫은 분야
  if (a.Q15 === 1 && !['재택', '온라인'].includes(j.place)) return null;  // 집에서만
  if (a.Q18 === 1 && j.stamina === '상') return null;                    // 앉아서 하는 일만
  if (a.Q23 === 2 && CAR_REQUIRED.includes(j.no)) return null;           // 차 없음
  // 조정 가능 조건
  const soft = [];
  if (a.Q15 === 2 && j.place === '현장') soft.push('먼 곳까지 이동');
  if (a.Q16 < 4 && TIME_ORDER.indexOf(j.time) > a.Q16 - 1) soft.push('일주일 시간 더 확보');
  if (a.Q17 === 1 && j.flex === '고정') soft.push('정해진 근무시간');
  if (LIC_LEVEL[j.license] > a.Q20 - 1) soft.push('자격·교육 준비');
  if (a.Q19 < 3 && COST_ORDER.indexOf(j.cost) > a.Q19 - 1) soft.push('시작 비용');
  if (STAMINA_LEVEL[j.stamina] > a.Q18 - 1) soft.push('체력');
  return soft;
}

// ---- 채점 ----
function scoreJob(a, j) {
  let s = 0;
  const inc = j.income;

  // [1부] 하고 싶은 일
  if (inFields(a.Q1, j)) s += W.WANT;
  if (targetHit(a.Q3, j)) s += W.TARGET;
  if (a.Q3 === 6 && TYPE_SOLO.includes(j.type_no)) s += 1;             // 사람보다 일 자체
  if (a.Q4 === 1 && ['재택', '온라인'].includes(j.place)) s += 1.5;
  if (a.Q4 === 2 && ['점포', '방문'].includes(j.place)) s += 1.5;
  if (a.Q4 === 3 && OUTDOOR_JOBS.includes(j.no)) s += 2;
  if (a.Q4 === 4 && j.place === '현장') s += 1.5;
  if (a.Q5 === 1 && TYPE_FACE_ON.includes(j.type_no)) s += 1;
  if (a.Q5 === 3 && TYPE_SOLO.includes(j.type_no)) s += 1;
  if (a.Q6 === 1 && (inc === '건별' || inc === '시간제')) s += 0.5;
  if (a.Q6 === 2 && TYPE_FACE_ON.includes(j.type_no)) s += 1;
  if (a.Q6 === 3 && PRO_JOBS.includes(j.no)) s += 1;
  if (a.Q6 === 4 && (inc === '자산형' || j.type_no === 10)) s += 1;
  if (a.Q6 === 5 && [3, 4, 8].includes(j.type_no)) s += 1;
  const JOY = { 1: [3, 8], 2: [1, 2, 10], 4: [6, 7], 5: [5] };           // Q7 가장 기쁜 순간 → 유형
  if ((JOY[a.Q7] || []).includes(j.type_no)) s += 1;
  if (a.Q7 === 3 && PRO_JOBS.includes(j.no)) s += 1;

  // [2부] 잘하는 것
  for (const e of a.Q8 || []) if (expHit(e, j)) s += W.EXP;
  for (const k of a.Q9 || []) if (strengthHit(k, j)) s += W.STRENGTH;
  if (a.Q10 === 3 && j.type_no === 1) s += 0.5;
  if (a.Q10 === 1 && j.type_no === 1) s -= 1;
  if (a.Q11 === 1 && [4, 5].includes(j.type_no)) s += 1;
  if (a.Q12 && a.Q12.has) {
    if (a.Q12.name && LICENSE_TYPE_MAP.some(([k]) => a.Q12.name.includes(k) && (j.name.includes(k) || (j.concept || '').includes(k)))) s += W.LICENSE;
    if ((a.Q12.typeBonus || []).includes(j.type_no)) s += W.LICENSE;
  }
  if (a.Q13 === 1 && SIMPLE_JOBS.includes(j.no)) s += 1;
  if (a.Q13 === 2) { if (SIMPLE_JOBS.includes(j.no)) s -= 2; if (PRO_JOBS.includes(j.no)) s += 1.5; }
  if (a.Q14 === 1 && INST_JOBS.includes(j.no)) s += 1;
  if (a.Q14 === 3 && ['재택', '온라인'].includes(j.place)) s += 0.5;

  // [3부] 상황 (수입·차량)
  if (a.Q21 === 1 && (inc === '건별' || inc === '시간제')) s += 0.5;
  if (a.Q21 === 3 && inc === '자산형') s += 0.5;
  const minIncome = { 1: 0, 2: 30, 3: 100, 4: 300 }[a.Q22] || 0;          // 목표보다 수입이 낮으면 순위 하향 (제외 아님)
  if (j.income_max !== null && j.income_max !== undefined && j.income_max < minIncome) s -= 1;
  if (a.Q23 === 1 && VEHICLE_JOBS.includes(j.no)) s += 1.5;
  if (a.Q6 !== 4 && CAPITAL_JOBS.includes(j.no)) s -= 1.5;                // 사업 의사가 없으면 자본형 하향

  // 잡 자체 점수 (응답과 무관 — 동점 정리 수준으로만)
  s += W.ATTRACT * (j.attract || 0);
  if (POPULAR_JOBS.includes(j.no)) s += W.POPULAR;
  return s;
}

// ---- 추천 근거 문장 (응답 기준) ----
function buildReasons(a, j, soft) {
  const r = [];
  const f = wantedFieldOf(a, j);
  if (f) r.push(`하고 싶다고 고른 '${FIELD_NAMES[f]}' 분야예요`);
  const k = (a.Q9 || []).find(x => strengthHit(x, j));
  if (k) r.push(`'${STRENGTH_NAMES[k]}' 강점을 살릴 수 있어요`);
  const e = (a.Q8 || []).find(x => expHit(x, j));
  if (e) r.push(`오래 해온 '${EXP_NAMES[e]}' 경험과 이어져요`);
  if (licenseHit(a.Q12, j)) r.push(`가진 자격(${a.Q12.name || '보유 자격'})을 살릴 수 있어요`);
  if (targetHit(a.Q3, j)) r.push(`원하신 대상(${TARGET_NAMES[a.Q3]})과 함께하는 일이에요`);
  const minIncome = { 1: 0, 2: 30, 3: 100, 4: 300 }[a.Q22] || 0;
  if (minIncome > 0 && j.income_max && j.income_max >= minIncome) r.push('목표 수입 범위에 들어와요');
  const top = r.slice(0, 3);                       // 응답과 직결된 근거 최대 3개
  if (!soft.length) top.push('지금 조건(시간·비용·체력·자격)으로 바로 시작할 수 있어요');
  return top;
}

// ---- 메인: recommend(answers, jobs) ----
function recommend(a, jobs) {
  // 동점 로테이션 해시: 응답 조합 + 잡번호 → 0~999 (같은 답이면 항상 같은 값 = 결정적)
  const key = JSON.stringify(a);
  const hash = no => { let h = 0; const s = key + no; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1000; return h; };
  const jitter = no => ((hash(no) % 9) - 4) * 0.15;   // ±0.6, 결정적

  const evaluated = [];
  for (const j of jobs) {
    const soft = conditionCheck(a, j);
    if (soft === null) continue;
    evaluated.push({ job: j, soft, score: scoreJob(a, j) - W.COND_PENALTY * soft.length, order: jitter(j.no) });
  }
  const byRank = (x, y) => (y.score + y.order) - (x.score + x.order) || hash(x.job.no) - hash(y.job.no) || parseInt(x.job.no) - parseInt(y.job.no);
  const ready = evaluated.filter(e => e.soft.length === 0).sort(byRank);
  const near  = evaluated.filter(e => e.soft.length > 0 && e.soft.length <= MAX_SOFT_FAILS).sort(byRank);

  const out = [], countByType = {};
  let simpleUsed = 0;
  const add = e => {
    if (out.includes(e)) return false;
    if ((countByType[e.job.type_no] || 0) >= MAX_PER_TYPE) return false;
    if (SIMPLE_JOBS.includes(e.job.no)) { if (simpleUsed >= MAX_SIMPLE) return false; simpleUsed++; }
    countByType[e.job.type_no] = (countByType[e.job.type_no] || 0) + 1;
    out.push(e);
    return true;
  };

  // 1) 하고 싶은 분야: 고른 분야마다 1개씩(바로 가능 → 없으면 '준비하면 가능') → 바로 가능한 잡 최대 3개까지
  //    → 합쳐서 2개가 안 되면 '준비하면 가능' 잡으로 최소 2개 보장
  const fields = a.Q1 || [];
  const inField = (f, e) => FIELD_JOBS[f].includes(e.job.no);
  for (const f of fields) {
    if (out.some(e => inField(f, e))) continue;
    for (const e of ready.concat(near)) if (inField(f, e) && add(e)) break;
  }
  const wantedCount = () => out.filter(e => inFields(fields, e.job)).length;
  for (const e of ready) { if (wantedCount() >= WANT_READY_MAX) break; if (inFields(fields, e.job)) add(e); }
  for (const e of near)  { if (wantedCount() >= WANT_MIN) break;       if (inFields(fields, e.job)) add(e); }
  // 2) 남은 칸: 바로 가능한 다른 잡 + 하고 싶은 분야의 '준비하면 가능' 잡을 점수순으로 (준비 필요 잡은 최대 3개)
  const rest = ready.concat(near.filter(e => inFields(fields, e.job))).sort(byRank);
  for (const e of rest) {
    if (out.length >= MAX_RESULTS) break;
    if (e.soft.length && out.filter(o => o.soft.length).length >= MAX_CONDITIONAL) continue;
    add(e);
  }
  // 3) 안전망: 2개가 안 되면 준비가 필요한 잡으로 채움 (조건 부족이 적은 순)
  const relaxed = [];
  if (out.length < MIN_RESULTS) {
    const rest = evaluated.filter(e => !out.includes(e) && e.soft.length > 0)
      .sort((x, y) => x.soft.length - y.soft.length || byRank(x, y));
    for (const e of rest) { if (out.length >= MIN_RESULTS) break; out.push(e); }
    if (rest.length) relaxed.push('지금 바로 할 수 있는 일이 적어 준비가 필요한 일도 함께 보여드려요');
  }
  out.sort(byRank);

  return {
    count: out.length,
    pool_size: ready.length,
    relaxed,
    results: out.map(e => {
      const j = e.job;
      return {
        no: j.no, name: j.name, type: j.type_name,
        conditional: e.soft.length ? e.soft : null,
        checks: {
          want: inFields(a.Q1, j),
          strength: (a.Q9 || []).some(k => strengthHit(k, j)) || (a.Q8 || []).some(x => expHit(x, j)) || licenseHit(a.Q12, j),
          ready: e.soft.length === 0,
        },
        concept: j.concept, cost: j.cost, time: j.time,
        income: j.income_max ? `월 ${j.income_min}~${j.income_max}만원${j.income_est ? '(추정)' : ''}` : j.income_raw || null,
        score: Math.round(e.score * 100) / 100, reasons: buildReasons(a, j, e.soft),
      };
    }),
  };
}

// Q12 주관식 자격명 → 유형 보너스 계산
function licenseTypeBonus(name) {
  const n = String(name || '');
  const types = new Set();
  for (const [kw, t] of LICENSE_TYPE_MAP) if (n.includes(kw)) types.add(t);
  return [...types];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { recommend, licenseTypeBonus, conditionCheck, scoreJob, W, FIELD_JOBS, FIELD_NAMES, CAR_REQUIRED,
    SIMPLE_JOBS, PRO_JOBS, POPULAR_JOBS, MAX_RESULTS, MIN_RESULTS, MAX_SOFT_FAILS, WANT_MIN };
}
