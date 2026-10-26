const { recommend, licenseTypeBonus } = require('./scoring.js');
const jobs = require('./jobs.json');
const wrand = pairs => { let r = Math.random(), acc = 0; for (const [v,w] of pairs){ acc += w; if (r < acc) return v; } return pairs[pairs.length-1][0]; };
const rand = a => a[Math.floor(Math.random()*a.length)];
const base = { Q7:1,Q8:2,Q9:1,Q10:1,Q11:[],Q12:2,Q13:3,Q14:{has:false},Q15:2,Q16:2,Q17:2,Q18:2,Q19:2,Q20:3,Q21:2,Q22:3,Q23:2,Q24:3,Q25:5,Q26:3,Q27:3,Q28:6 };
const LIC_NAMES = ['요양보호사','스포츠강사','운동지도사','펫미용사','심리상담사','전기기능사','한국어교원','정리수납전문가'];
function genProfile(){
  const exps=[rand([1,2,3,4,5,6])]; if(Math.random()<.6) exps.push(rand([1,2,3,4,5,6]));
  const has=Math.random()<.3; const lic=has?rand(LIC_NAMES):null;
  return { ...base, Q1:rand([1,2,3]),Q2:rand([1,2,3,4]),Q3:rand([1,2,3]),Q4:rand([1,2,3]),Q5:rand([1,2,3]),Q6:rand([1,2,3]),
    Q7:rand([1,2,3,4]),Q8:rand([1,2,3,4]),Q9:rand([1,2,3]),Q10:rand([1,2,3,4]),Q11:exps,Q12:rand([1,2,3]),Q13:rand([1,2,3]),
    Q14:has?{has:true,name:lic,typeBonus:licenseTypeBonus(lic)}:{has:false},
    Q15:rand([1,2,3]),Q16:rand([1,2,3]),Q17:rand([1,2]),Q18:rand([1,2]),Q19:rand([1,2]),
    Q20:wrand([[1,.35],[2,.30],[3,.35]]), Q21:wrand([[1,.45],[2,.55]]), Q22:wrand([[1,.30],[2,.15],[3,.45],[4,.10]]),
    Q23:wrand([[1,.40],[2,.60]]), Q24:wrand([[1,.35],[2,.30],[3,.35]]),
    Q25: MODE==='realistic' ? wrand([[1,.35],[2,.15],[3,.15],[4,.20],[5,.15]]) : rand([1,2,3,4,5]),
    Q26: MODE==='realistic' ? wrand([[1,.25],[2,.45],[3,.30]]) : rand([1,2,3]),
    Q27: MODE==='realistic' ? wrand([[1,.40],[2,.25],[3,.35]]) : rand([1,2,3]),
    Q28: MODE==='realistic' ? wrand([[1,.13],[2,.18],[3,.13],[4,.11],[5,.07],[6,.38]]) : rand([1,2,3,4,5,6]) };
}
const MODE = process.argv[2] || 'uniform';
const N=10000, topCnt={};
for (let i=0;i<N;i++){ const r=recommend(genProfile(),jobs); for(const x of r.results) topCnt[x.no]=(topCnt[x.no]||0)+1; }
const rows = jobs.map(j=>({no:j.no,name:j.name,top:topCnt[j.no]||0})).sort((a,b)=>b.top-a.top);
rows.forEach((r,i)=>console.log(`${i+1}|${r.no}|${r.name}|${(r.top/N*100).toFixed(2)}%`));
