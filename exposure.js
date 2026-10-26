const { recommend, licenseTypeBonus } = require('./scoring.js');
const jobs = require('./jobs.json');
const rand = a => a[Math.floor(Math.random()*a.length)];
const wrand = pairs => { let r = Math.random(), acc = 0; for (const [v,w] of pairs){ acc += w; if (r < acc) return v; } return pairs[pairs.length-1][0]; };
const base = { Q7:1,Q8:2,Q9:1,Q10:1,Q11:[],Q12:2,Q13:3,Q14:{has:false},Q15:2,Q16:2,Q17:2,Q18:2,Q19:2,Q20:3,Q21:2,Q22:3,Q23:2,Q24:3 };
const LIC_NAMES = ['요양보호사','스포츠강사','운동지도사','펫미용사','심리상담사','전기기능사','한국어교원','정리수납전문가'];

function genProfile(){
  const exps=[rand([1,2,3,4,5,6])]; if(Math.random()<.6) exps.push(rand([1,2,3,4,5,6]));
  const has=Math.random()<.3; const lic=has?rand(LIC_NAMES):null;
  return { ...base, Q1:rand([1,2,3]),Q2:rand([1,2,3,4]),Q3:rand([1,2,3]),Q4:rand([1,2,3]),Q5:rand([1,2,3]),Q6:rand([1,2,3]),
    Q7:rand([1,2,3,4]),Q8:rand([1,2,3,4]),Q9:rand([1,2,3]),Q10:rand([1,2,3,4]),Q11:exps,Q12:rand([1,2,3]),Q13:rand([1,2,3]),
    Q14:has?{has:true,name:lic,typeBonus:licenseTypeBonus(lic)}:{has:false},
    Q15:rand([1,2,3]),Q16:rand([1,2,3]),Q17:rand([1,2]),Q18:rand([1,2]),Q19:rand([1,2]),
    Q20:wrand([[1,.35],[2,.30],[3,.35]]), Q21:wrand([[1,.45],[2,.55]]), Q22:wrand([[1,.30],[2,.15],[3,.45],[4,.10]]), Q23:wrand([[1,.40],[2,.60]]), Q24:wrand([[1,.35],[2,.30],[3,.35]]) };
}

const N = 10000;
const poolCnt = {}, topCnt = {};
for (let i=0;i<N;i++){
  const a = genProfile();
  const r = recommend(a, jobs);
  // pool 재계산은 결과에 없으므로 pool_size만 제공 — 잡별 풀 진입은 scoring.js의 layer1을 재현
  for (const x of r.results) topCnt[x.no] = (topCnt[x.no]||0)+1;
}
// 풀 진입률: scoring.js의 layer1Pass를 직접 재현
const PLACE_SETS={1:['재택','온라인'],2:['재택','온라인','방문','점포'],3:null};
const TIME_ORDER=['주5h 미만','주5~15h','주15~30h','주30h 이상'];
const COST_ORDER=['₩','₩₩','₩₩₩','₩₩₩₩','₩₩₩₩₩'];
const LIC_SETS={1:['불필요'],2:['불필요','교육이수'],3:null};
function inPool(a,j){
  const ps=PLACE_SETS[a.Q1]; if(ps&&!ps.includes(j.place))return false;
  if(a.Q2<4&&TIME_ORDER.indexOf(j.time)>a.Q2-1)return false;
  if(a.Q3===1&&j.flex==='고정')return false;
  const ls=LIC_SETS[a.Q4]; if(ls&&!ls.includes(j.license))return false;
  if(a.Q5<3&&COST_ORDER.indexOf(j.cost)>a.Q5-1)return false;
  if(a.Q6===1&&j.stamina!=='하')return false;
  if(a.Q6===2&&j.stamina==='상')return false;
  return true;
}
for (let i=0;i<N;i++){
  const a = genProfile();
  for (const j of jobs) if (inPool(a,j)) poolCnt[j.no]=(poolCnt[j.no]||0)+1;
}

const rows = jobs.map(j=>({
  no:j.no, name:j.name, type:(j.type_name||'').split(' ')[0],
  poolPct:+((poolCnt[j.no]||0)/N*100).toFixed(1),
  topPct:+((topCnt[j.no]||0)/N*100).toFixed(2),
})).sort((a,b)=>a.topPct-b.topPct);
console.log('=== 노출률 하위 15잡 (10,000명 기준) ===');
rows.slice(0,15).forEach((r,i)=>console.log(`${i+1}. ${r.no} ${r.name} | top-6 노출 ${r.topPct}% | 풀 진입 ${r.poolPct}%`));
console.log('\n=== 참고: 풀 진입률 하위 5 (1층 필터 병목) ===');
[...rows].sort((a,b)=>a.poolPct-b.poolPct).slice(0,5).forEach(r=>console.log(`${r.no} ${r.name} | 풀 진입 ${r.poolPct}% | top-6 ${r.topPct}%`));
