/* ================= 경기 통계 · 특성 창 =================
   게임의 «종료 화면» 과 «특성 화면» 을 따로 연다.

   자료는 리플레이의 SScoreResultEvent 하나에 다 들어 있다 — 항목 134개 중
   74개가 채워지고, 영웅 피해량·공성 피해량·치유량·보호막·경험치 기여도가
   모두 그 안에 있다. (오래 «리플레이에 피해량은 없다» 고 알고 있었는데
   SStatGameEvent 만 뒤져서 놓치고 있었다.)

   주의: 이 값들은 «경기 전체» 의 최종 수치다. 재생 위치를 되감아도 바뀌지 않는다.
   시각에 따라 변하는 값은 스코어보드의 통계 페이지와 «구간 통계» 가 맡는다. */

const SCORE_COLS = [
  { k:'SoloKill',              ko:'킬',        ic:'⚔' },
  { k:'Assists',               ko:'어시',      ic:'🤝' },
  { k:'Deaths',                ko:'죽음',      ic:'💀', low:true },
  { k:'SiegeDamage',           ko:'공성 피해', ic:'🏰' },
  { k:'HeroDamage',            ko:'영웅 피해', ic:'🗡' },
  { k:'Healing',               ko:'치유',      ic:'✚' },
  { k:'ProtectionGivenToAllies', ko:'보호막',  ic:'🛡' },
  { k:'ExperienceContribution', ko:'경험치',   ic:'⬆' },
];
/* 곁들여 볼 만한 것 — 접어 두고 «자세히» 로 편다 */
const SCORE_MORE = [
  { k:'Takedowns', ko:'처치 관여' }, { k:'DamageTaken', ko:'받은 피해' },
  { k:'DamageSoaked', ko:'막아낸 피해' }, { k:'SelfHealing', ko:'자가 치유' },
  { k:'StructureDamage', ko:'구조물 피해' }, { k:'MinionDamage', ko:'미니언 피해' },
  { k:'CreepDamage', ko:'용병 피해' }, { k:'MinionKills', ko:'미니언 처치' },
  { k:'RegenGlobes', ko:'재생구슬' }, { k:'MercCampCaptures', ko:'용병 점령' },
  { k:'WatchTowerCaptures', ko:'감시탑' }, { k:'TimeSpentDead', ko:'죽어 있던 시간', sec:true },
  { k:'TimeCCdEnemyHeroes', ko:'적 제어 시간', sec:true },
  { k:'HighestKillStreak', ko:'최다 연속 처치' }, { k:'TownKills', ko:'건물 파괴' },
];

const scoreModal = document.getElementById('scoreModal');
const scoreBody  = document.getElementById('scoreBody');
let scoreMore = false, scoreSort = null, scoreDesc = true;

/* 선수 순서는 리플레이의 players 순서와 같다 (0~4 = 1팀, 5~9 = 2팀) */
function scoreRows(){
  const sc = (G.raw && G.raw.score) || {};
  const out = [];
  const ps = G.players;
  const keys = Object.keys(ps);
  keys.forEach((k, i) => {
    const p = ps[k];
    out.push({ i, team: p.team === 0 ? 0 : 1, hero: p.hero, name: p.name,
               get: f => (sc[f] || [])[i] });
  });
  return out;
}
const fmtNum = v => (v == null ? '-' : (+v).toLocaleString());
const fmtSec = v => v == null ? '-' : `${Math.floor(v/60)}:${String(Math.round(v%60)).padStart(2,'0')}`;

function scoreHTML(){
  if(!G || !G.raw || !G.raw.score || !Object.keys(G.raw.score).length)
    return '<p class="spannote">이 리플레이에는 종료 점수표가 없습니다.</p>';
  const rows = scoreRows();
  const cols = SCORE_COLS.concat(scoreMore ? SCORE_MORE.map(c => ({...c, extra:true})) : []);
  // 항목마다 «가장 높은 쪽» 을 굵게 (죽음은 낮을수록 좋으므로 제외)
  const best = {};
  for(const c of cols){
    const vals = rows.map(r => +r.get(c.k) || 0);
    best[c.k] = c.low ? null : Math.max(...vals);
  }
  if(scoreSort){
    rows.sort((a,b) => ((+b.get(scoreSort)||0) - (+a.get(scoreSort)||0)) * (scoreDesc?1:-1));
  }
  let h = '<table class="scoretbl"><thead><tr><th class="nm">선수</th>';
  for(const c of cols)
    h += `<th class="${scoreSort===c.k?'on':''}${c.extra?' ex':''}" data-k="${c.k}" title="${c.ko} — 눌러서 정렬">`
       + `${c.ic?`<i>${c.ic}</i>`:''}${c.ko}</th>`;
  h += '</tr></thead><tbody>';
  let lastTeam = null;
  for(const r of rows){
    if(!scoreSort && r.team !== lastTeam){        // 정렬 중이 아니면 팀별로 묶는다
      lastTeam = r.team;
      h += `<tr class="tsep ${r.team?'r':'b'}"><td class="nm" colspan="${cols.length+1}">`
         + `${r.team?'2팀':'1팀'}</td></tr>`;
    }
    const hd = heroByName(r.hero);
    h += `<tr class="${r.team?'r':'b'}"><td class="nm">`
       + (hd ? `<img src="icons/${hd.icon}" alt="">` : '')
       + `<span>${r.hero}</span><em>${r.name}</em></td>`;
    for(const c of cols){
      const v = r.get(c.k);
      const top = best[c.k] && +v === best[c.k] && +v > 0;
      h += `<td class="${top?'top':''}${c.extra?' ex':''}">${c.sec?fmtSec(v):fmtNum(v)}</td>`;
    }
    h += '</tr>';
  }
  h += '</tbody></table>';
  h += `<p class="spannote">경기 <b>전체</b> 최종 수치입니다 — 재생 위치를 되감아도 바뀌지 않습니다.
        시각에 따라 변하는 값은 스코어보드의 통계 페이지와 <b>구간 통계</b>(<code>[</code> <code>]</code> <code>\\</code>)를 보세요.
        리플레이의 종료 점수표(74개 항목)에서 그대로 가져왔습니다.</p>`;
  return h;
}

/* 특성 창 — 선수별로 7티어를 한 줄에 늘어놓는다 */
function talentHTML(){
  const TIER = [1,4,7,10,13,16,20];
  let h = '<table class="taltbl"><thead><tr><th class="nm">선수</th>';
  for(const t of TIER) h += `<th>${t}</th>`;
  h += '</tr></thead><tbody>';
  // 통계 창처럼 팀별로 묶는다 (1팀 다섯 줄 · 구분줄 · 2팀 다섯 줄)
  const byTeam = [plCards.filter(c=>c.hh.team!==1), plCards.filter(c=>c.hh.team===1)];
  for(const [ti, group] of byTeam.entries()){
    h += `<tr class="tsep ${ti?'r':'b'}"><td class="nm" colspan="${TIER.length+1}">`
       + `${ti?'2팀':'1팀'} <em>${group.length}명</em></td></tr>`;
  for(const c of group){
    const hd = heroByName(c.hh.heroName);
    h += `<tr class="${c.hh.team===1?'r':'b'}"><td class="nm">`
       + (hd ? `<img src="icons/${hd.icon}" alt="">` : '')
       + `<span>${c.hh.heroName}</span><em>${c.lab.replace(/\(.*\)$/,'')}</em></td>`;
    for(const t of TIER){
      const cell = c.pips[t];
      const img = cell && cell.querySelector('img');
      const on = cell && cell.classList.contains('got');
      h += `<td><span class="tc ${on?'got':'none'}" title="${cell?cell.title:''}">`
         + (on && img ? `<img src="${img.src}" alt="">` : '') + '</span></td>';
    }
    h += '</tr>';
  }
  }
  h += '</tbody></table>';
  h += `<p class="spannote">지금 재생 시각까지 찍은 특성만 밝게 나옵니다.
        티어를 건너뛴 칸은 아직 안 찍은 것입니다.</p>`;
  return h;
}

let scoreTab = 'score';
function openScore(tab){
  if(!G) return;
  scoreTab = tab || scoreTab;
  document.querySelectorAll('#scoreTabs button').forEach(b =>
    b.classList.toggle('on', b.dataset.s === scoreTab));
  scoreBody.innerHTML = scoreTab === 'talent' ? talentHTML() : scoreHTML();
  document.getElementById('scoreMore').hidden = scoreTab !== 'score';
  scoreModal.hidden = false;
  // 열 머리를 누르면 그 항목으로 정렬
  scoreBody.querySelectorAll('th[data-k]').forEach(th => th.onclick = () => {
    const k = th.dataset.k;
    if(scoreSort === k) scoreDesc = !scoreDesc; else { scoreSort = k; scoreDesc = true; }
    openScore();
  });
}
function closeScore(){ scoreModal.hidden = true; }

document.getElementById('openScore').onclick = () => openScore('score');
document.getElementById('openTalent').onclick = () => openScore('talent');
document.getElementById('scoreClose').onclick = closeScore;
document.getElementById('scoreMore').onclick = () => { scoreMore = !scoreMore; openScore(); };
document.querySelectorAll('#scoreTabs button').forEach(b =>
  b.onclick = () => openScore(b.dataset.s));
scoreModal.onclick = e => { if(e.target === scoreModal) closeScore(); };
window.addEventListener('keydown', e => {
  if(!G || (typeof isTypingTarget==='function' && isTypingTarget())) return;
  if(e.key === 'Escape' && !scoreModal.hidden){ closeScore(); e.stopPropagation(); }
  else if(e.key === 's' || e.key === 'S'){ e.preventDefault();
    scoreModal.hidden || scoreTab !== 'score' ? openScore('score') : closeScore(); }
  else if(e.key === 't' && !toolOn){ e.preventDefault();
    scoreModal.hidden || scoreTab !== 'talent' ? openScore('talent') : closeScore(); }
});
