const { recommend, licenseTypeBonus } = require('./scoring.js');
const jobs = require('./jobs.json');
const rand = a => a[Math.floor(Math.random()*a.length)];

// ---- 각 잡의 '최적 응답 프로필' 구성 (구성적 도달성 증명) ----
const EXP_FOR_TYPE = t => ({1:6,2:1,3:1,4:3,5:3,6:6,7:4,8:5,9:2,10:2}[t]);
const Q11CODE_FOR_TYPE = t => ({1:6,2:1,3:1,4:3,5:3,6:6,7:4,8:5,9:2,10:2}[t]);
const LIC_KEYWORD_FOR = j => {
  const kws = ['요양','간병','산후','도우미','복지','강사','교육','한국어','체험','스포츠','운동','요가','필라테스','골프','안마','심리','상담','커리어','직업','전기','소방','용접','에어컨','가전','목공','농업','농장','드론','안전','건설','미용','펫','동물','운전','정리수납','가사'];
  return kws.find(k => (j.name.includes(k) || (j.concept||'').includes(k)) && licenseTypeBonus(k).length>0);
};
function bestProfile(j){
  const t = j.type_no;
  const q8 = (j.income_min!==null && j.income_max<30) ? 1 : (j.income_min>=300 ? 4 : (j.income_max>=30 && j.income_min<=100) ? 2 : (j.income_max>=100 ? 3 : 2));
  const lic = LIC_KEYWORD_FOR(j);
  return {
    Q1: ['재택','온라인'].includes(j.place)?1:(['방문','점포'].includes(j.place)?2:3),
    Q2: ['주5h 미만','주5~15h','주15~30h','주30h 이상'].indexOf(j.time)+1,
    Q3: j.flex==='고정'?3:(j.flex==='완전자유'?1:2),
    Q4: j.license==='불필요'?1:(j.license==='교육이수'?2:3),
    Q5: ['₩','₩₩','₩₩₩','₩₩₩₩','₩₩₩₩₩'].indexOf(j.cost)<=0?1:(['₩','₩₩'].includes(j.cost)?['₩','₩₩'].indexOf(j.cost)+1:3),
    Q6: j.stamina==='하'?1:(j.stamina==='중'?2:3),
    Q7: (j.income==='건별'||j.income==='시간제')?1:(j.income==='월정액'?2:3),
    Q8: q8,
    Q9: (j.income==='건별'||j.income==='시간제')?1:2,
    Q10: [4,5,8,9].includes(t)?2:([1,2,3,6].includes(t)?3:(t===10?4:1)),
    Q11: [Q11CODE_FOR_TYPE(t)],
    Q12: t===1?3:2, Q13: (t===4||t===5)?1:3,
    Q14: lic ? {has:true, name:lic, typeBonus:licenseTypeBonus(lic)} : {has:false},
    Q27: 3,
    Q28: { '021':2,'037':1,'043':3,'056':4,'061':4,'100':5 }[j.no] || 6, // v0.7 선호 분야 직결 매핑
    Q26: SIMPLE_JOBS.includes(j.no)?1:2,
    Q25: [2,3,4].includes(t)?1:(TRAVEL_JOBS.includes(j.no)?2:(PET_JOBS.includes(j.no)?3:([1,6].includes(t)?4:5))),
    Q24: INST_JOBS.includes(j.no)?1:2,
    Q23: 1,
    Q20: OUTDOOR_JOBS.includes(j.no)?2:3, Q21: VEHICLE_JOBS.includes(j.no)?1:2,
    Q22: SENIOR_JOBS.includes(j.no)?1:(KIDS_JOBS.includes(j.no)?2:3),
    Q15: [3,4,5,8,9].includes(t)?1:([1,6,7].includes(t)?3:2),
    Q16: [7,8,9].includes(t)?1:([1,2,6,10].includes(t)?3:2),
    Q17: [1,2,10].includes(t)?1:([4,5,8].includes(t)?2:1),
    Q18: ['022','023','090'].includes(j.no)?2:1,
    Q19: (j.difficulty==='★★★★'||j.difficulty==='★★★★★')?1:(([7,9].includes(t))&&['★','★★'].includes(j.difficulty)?2:([2,3,4].includes(t)?1:2)),
  };
}
// 선호 변이: 제약(Q1~Q6, Q8, Q11~Q14)은 잡 최적값 고정, 선호(Q3·Q7·Q9·Q10·Q15~Q19)는 변이
function variants(j){
  const p0 = bestProfile(j);
  const rnd = (() => { let s = parseInt(j.no) * 7919; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  const ALTS = { Q3:[1,2,3], Q7:[1,2,3,4], Q9:[1,2,3], Q10:[1,2,3,4], Q15:[1,2,3], Q16:[1,2,3], Q17:[1,2], Q19:[1,2] };
  const vs = [p0];
  for (let i = 0; i < 11; i++) {
    const p = { ...p0 };
    for (const k of Object.keys(ALTS)) p[k] = ALTS[k][Math.floor(rnd() * ALTS[k].length)];
    vs.push(p);
  }
  return vs;
}
const { OUTDOOR_JOBS, VEHICLE_JOBS, SENIOR_JOBS, KIDS_JOBS, INST_JOBS, TRAVEL_JOBS, PET_JOBS, CAPITAL_JOBS, SIMPLE_JOBS, PRO_JOBS } = require('./scoring.js');
let ok = 0, fail = [];
for (const j of jobs) {
  const hit = variants(j).some(p => recommend(p, jobs).results.some(x => x.no === j.no));
  if (hit) ok++; else fail.push(j.no + ' ' + j.name + '(pool ' + recommend(bestProfile(j), jobs).pool_size + ')');
}
console.log('구성적 도달성(선호 변이 12종):', ok, '/ 100 잡이 최적 응답에서 6위 안 도달');
if (fail.length) console.log('  미도달:', fail.join(', '));

// ---- 랜덤 표집 커버리지 + 개수 분포 ----
const base = { Q7:1,Q8:2,Q9:1,Q10:1,Q11:[],Q12:2,Q13:3,Q14:{has:false},Q15:2,Q16:2,Q17:2,Q18:2,Q19:2,Q20:3,Q21:2,Q22:3,Q23:2,Q24:3,Q25:5,Q26:3,Q27:3,Q28:6 };
const LIC_NAMES = ['요양보호사','스포츠강사','운동지도사','펫미용사','심리상담사','전기기능사','한국어교원','정리수납전문가'];
function genProfile(){
  const exps=[rand([1,2,3,4,5,6])]; if(Math.random()<.6) exps.push(rand([1,2,3,4,5,6]));
  const has=Math.random()<.3; const lic=has?rand(LIC_NAMES):null;
  return { ...base, Q1:rand([1,2,3]),Q2:rand([1,2,3,4]),Q3:rand([1,2,3]),Q4:rand([1,2,3]),Q5:rand([1,2,3]),Q6:rand([1,2,3]),
    Q7:rand([1,2,3,4]),Q8:rand([1,2,3,4]),Q9:rand([1,2,3]),Q10:rand([1,2,3,4]),Q11:exps,Q12:rand([1,2,3]),Q13:rand([1,2,3]),
    Q14:has?{has:true,name:lic,typeBonus:licenseTypeBonus(lic)}:{has:false},
    Q15:rand([1,2,3]),Q16:rand([1,2,3]),Q17:rand([1,2]),Q18:rand([1,2]),Q19:rand([1,2]),Q20:rand([1,2,3]),Q21:rand([1,2]),Q22:rand([1,2,3,4]),Q23:rand([1,2]),Q24:rand([1,2,3]),Q25:rand([1,2,3,4,5]),Q26:rand([1,2,3]),Q27:rand([1,2,3]),Q28:rand([1,2,3,4,5,6]) };
}
const seen=new Set(), dist={};
for(let i=0;i<5000;i++){ const r=recommend(genProfile(),jobs); r.results.forEach(x=>seen.add(x.no)); dist[r.count]=(dist[r.count]||0)+1; }
const never=jobs.filter(j=>!seen.has(j.no));
console.log('랜덤 표집(5000명) top-6 커버리지:', seen.size, '/ 100 | 미도달:', never.length?never.map(j=>j.no).join(','):'없음');
console.log('출력 개수 분포:', JSON.stringify(dist));

// ---- 최악 경로 / 워크드 예제 / 결정성 ----
const r1 = recommend({ ...base, Q1:1,Q2:1,Q3:1,Q4:1,Q5:1,Q6:1 }, jobs);
console.log('최악 경로 → pool:', r1.pool_size, '| 출력:', r1.count, '|', r1.results.map(x=>x.no+' '+x.name).join(', '));
const persona = { ...base, Q1:3,Q2:3,Q3:3,Q4:2,Q5:1,Q6:2, Q7:2,Q8:2,Q9:1,Q10:1, Q11:[2,5], Q12:1, Q13:2, Q14:{has:false}, Q15:1,Q16:1,Q17:2,Q18:1,Q19:2 };
const r2 = recommend(persona, jobs);
console.log('워크드 예제 → pool:', r2.pool_size, '| 출력:', r2.count);
r2.results.forEach((x,i)=>console.log(`  ${i+1}위 [${x.score}점] ${x.no} ${x.name} — ${x.reasons.join(' / ')}`));
console.log('결정성(같은 답→같은 결과):', JSON.stringify(r2)===JSON.stringify(recommend(persona,jobs))?'통과':'실패');
