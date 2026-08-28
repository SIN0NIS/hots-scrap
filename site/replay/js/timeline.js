/* ================= 경기 전체 이벤트 타임라인 + 통계 =================
   위 줄 = 1팀, 아래 줄 = 2팀. 각자 «자기 팀이 해낸 일»을 시간축에 찍는다.
   표식을 누르면 그 시각으로 이동한다. 통계창은 팀 레벨·경험치 그래프를 그린다. */

const tlRows = [document.getElementById('tl0'), document.getElementById('tl1')];
const tlAxis = document.getElementById('tlAxis');
const tlNowEl = document.getElementById('tlNow');
const statsPanel = document.getElementById('statsPanel');

/* 이벤트를 «누가 해냈나» 기준으로 팀에 나눈다.
   킬은 죽인 쪽, 건물 파괴는 부순 쪽, 용병·오브젝트는 가져간 쪽. */
function eventTeam(e, players){
  const tm = v => v==null ? null : (Math.round(v)===1 ? 0 : 1);
  switch(CAT(e)){
    case 'kill': {
      // 죽은 사람의 반대 팀이 해낸 것
      const vt = teamOf(e.player, players);
      if(e.killers && e.killers.length) return teamOf(e.killers[0], players);
      return vt===0 ? 1 : 0;
    }
    case 'struct': {
      if(e.killers && e.killers.length) return teamOf(e.killers[0], players);
      // 리플레이는 건물을 «누가» 부쉈는지 거의 남기지 않는다 (실측: 39건 중 4건).
      // 대신 건물은 자기 팀 진영에 붙어 있으므로, 주인 팀의 «반대» 가 부순 팀이다.
      const own = structOwner(e.x, e.y);
      return own==null ? null : (own===0 ? 1 : 0);
    }
    case 'merc': return tm(e.TeamID);
    case 'obj':  return e.TeamID!=null ? tm(e.TeamID) : null;
    default: return null;
  }
}
const TL_ICON = {kill:'💀', struct:'🏰', merc:'⚔️', obj:'🪶'};
/* 건물 종류 — 리플레이 내부명을 한국어와 표식으로 바꾼다.
   타임라인에는 «포탑·요새·성채·핵» 만 찍는다 (성벽·성문·우물까지 찍으면 줄이 뒤덮인다). */
function structKind(u){
  u = String(u||'');
  if(/Core|King/.test(u))         return {ko:'핵',   ic:'👑', big:true};
  if(/TownHallL3/.test(u))        return {ko:'성채', ic:'🏯', big:true};
  if(/TownHall/.test(u))          return {ko:'요새', ic:'🏰', big:true};
  if(/CannonTower/.test(u))       return {ko:'포탑', ic:'🗼', big:true};
  if(/Moonwell/.test(u))          return {ko:'치유의 우물', ic:'💧', big:false};
  if(/Gate/.test(u))              return {ko:'성문', ic:'🚪', big:false};
  if(/Wall/.test(u))              return {ko:'성벽', ic:'🧱', big:false};
  return {ko:u.replace(/^Town/,''), ic:'🏚', big:false};
}
/* 건물 주인 팀 — 양 팀 핵의 위치를 기준으로 가까운 쪽이 주인이다.
   어느 핵이 어느 팀 것인지는 «경기 시작 시각의 팀 평균 위치» 로 정한다. */
let coreSides = null;
function buildStructSides(){
  coreSides = null;
  if(!G || !G.structures) return;
  const base=[[0,0,0],[0,0,0]];
  for(const lab in G.heroes){
    const hh=G.heroes[lab], p=posAt(hh,0); if(!p) continue;
    const i=hh.team===1?1:0; base[i][0]+=p.x; base[i][1]+=p.y; base[i][2]++;
  }
  if(!base[0][2] || !base[1][2]) return;
  const B=base.map(a=>[a[0]/a[2], a[1]/a[2]]);
  const cores=G.structures.filter(s=>/Core|King/.test(s.unit))
    .map(s=>{ const d0=Math.hypot(s.x-B[0][0],s.y-B[0][1]), d1=Math.hypot(s.x-B[1][0],s.y-B[1][1]);
              return {x:s.x, y:s.y, team:d0<=d1?0:1}; });
  // 핵이 팀마다 하나씩 잡혔을 때만 쓴다 (영원의 전쟁터처럼 핵이 여럿인 전장 대비)
  if(!cores.some(c=>c.team===0) || !cores.some(c=>c.team===1)){
    coreSides = B.map((b,i)=>({x:b[0], y:b[1], team:i}));
  } else coreSides = cores;
}
function structOwner(x,y){
  if(x==null||y==null||!coreSides||!coreSides.length) return null;
  let best=null, bd=Infinity;
  for(const c of coreSides){ const d=Math.hypot(x-c.x,y-c.y); if(d<bd){bd=d; best=c.team;} }
  return best;
}

let tlBuilt = false;
let tlMarks = [];                 // 재생에 따라 옅고 진하게 바꾸려고 들고 있는다
let selEvent = null;              // 고른 이벤트 (금색 테두리)

/* 사건의 «무게» — 클수록 표식이 커진다. 레퍼런스의 weight 를 내 자료로 옮긴 것. */
function evWeight(e){
  switch(CAT(e)){
    case 'kill':   return 1 + Math.min(2, (e.killers||[]).length*0.35);
    case 'struct': {
      const u=e.UnitType||e.unit||'';
      return /Core|King/.test(u) ? 3.4 : /TownHallL3/.test(u) ? 2.4 : /TownHall/.test(u) ? 1.9 : 1;
    }
    case 'obj':  return 2.2;
    case 'merc': return 1.2;
    default: return 1;
  }
}
function buildTimeline(){
  tlRows.forEach(r=>r.replaceChildren());
  tlAxis.replaceChildren();
  tlBuilt = false; tlMarks = []; selEvent = null;
  if(!G || !G.maxT) return;
  buildStructSides();
  const T = G.maxT;
  for(const e of G.evs){
    const cat = CAT(e);
    let ic = TL_ICON[cat];
    if(!ic) continue;
    if(cat==='struct'){
      const k = structKind(e.UnitType||e.unit);
      if(!k.big) continue;              // 성벽·성문·우물은 너무 많아 뺀다
      ic = k.ic;
    }
    const tm = eventTeam(e, G.players);
    if(tm!==0 && tm!==1) continue;
    // 건물은 파괴자가 거의 안 남아 진영 위치로 팀을 추론한다 — 그 표식은 빨간 점선
    const guessed = cat==='struct' && !(e.killers && e.killers.length);
    const sz = Math.round(9 + evWeight(e)*2.6);
    const m = document.createElement('button');
    m.type='button';
    m.className = 'tlmark';
    m.textContent = ic;
    m.style.left = (e.t/T*100)+'%';
    m.style.width = m.style.height = sz+'px';
    m.style.fontSize = Math.max(7, Math.round(sz*0.62))+'px';
    m.title = fmtT(e.t)+' · '+evText(e, G.players)
            + (guessed ? ' — 부순 팀은 진영 위치로 추론한 추정치입니다' : '');
    if(guessed) m.classList.add('est');
    m.onpointerdown = ev=>{ ev.stopPropagation(); selEvent=e; seekTo(e.t); updateTimeline(); };
    m.dataset.cat = cat;
    tlRows[tm].appendChild(m);
    tlMarks.push({el:m, t:e.t, e});
  }
  // 시간 눈금 — 2분 간격 (긴 경기는 5분)
  const stepSec = T>1500 ? 300 : 120;
  for(let s=0; s<=T; s+=stepSec){
    const sp = document.createElement('span');
    sp.style.left = (s/T*100)+'%';
    sp.textContent = fmtT(s);
    tlAxis.appendChild(sp);
  }
  buildTierLines(T);
  applyTlFilters();
  tlBuilt = true;
  updateTimeline();
}
/* 특성 티어를 세로선으로 — 아이콘으로 찍으면 열네 개가 줄을 뒤덮는다.
   팀마다 1·4·7·10·13·16·20 레벨에서 «처음 특성을 찍은 시각» 에 자기 팀 색 선을 세운다.
   (팀 레벨은 다섯 명이 같이 오르므로 선 하나로 팀 전체를 말할 수 있다) */
let tierLines = [];
function buildTierLines(T){
  tierLines = [];
  const {pickMap} = (typeof teamPicks==='function') ? teamPicks() : {pickMap:{}};
  const got = [{}, {}];
  for(const lab in pickMap){
    const tm = teamOf(lab, G.players); if(tm!==0 && tm!==1) continue;
    for(const tier of TIERS){
      const p = pickMap[lab][tier]; if(!p) continue;
      const g = (got[tm][tier] ||= {t:p.t, who:[]});
      if(p.t < g.t) g.t = p.t;
      g.who.push(`${(G.heroes[lab]||{}).heroName||lab} · ${p.ko}`);
    }
  }
  for(const tm of [0,1]) for(const tier of TIERS){
    const g = got[tm][tier]; if(!g) continue;
    const el = document.createElement('span');
    el.className = 'tltier';
    el.style.left = (g.t/T*100)+'%';
    el.dataset.t = g.t;
    el.innerHTML = `<b>${tier}</b>`;
    el.title = `${tm+1}팀 ${tier}레벨 특성 · ${fmtT(g.t)}\n` + g.who.join('\n');
    tlRows[tm].appendChild(el);
    tierLines.push({el, t:g.t, tm});
  }
}
/* 로그 필터를 그대로 따른다 — 다 끄면 시간축도 텅 빈다 */
function applyTlFilters(){
  for(const m of tlMarks){
    const on = filters[m.el.dataset.cat] ?? true;
    m.el.classList.toggle('off', !on);
  }
  for(const L of tierLines) L.el.classList.toggle('off', !filters.grow);
}

/* 재생 조작 막대의 «이전/다음 사건» 단추 */
function jumpEvent(dir){
  if(!tlMarks.length) return;
  const list = tlMarks.filter(m=>!m.el.classList.contains('off')).map(m=>m.t).sort((a,b)=>a-b);
  if(!list.length) return;
  if(dir<0){ for(let i=list.length-1;i>=0;i--) if(list[i] < tCur-1){ seekTo(list[i]); return; } seekTo(0); }
  else { for(const v of list) if(v > tCur+1){ seekTo(v); return; } seekTo(G.maxT); }
}
/* 표식 툴팁용 짧은 글 (HTML 없이) */
function evText(e, players){
  switch(CAT(e)){
    case 'kill': return (e.player||'?')+' 처치'+(e.killers&&e.killers.length?' ← '+e.killers.join(', '):'');
    case 'struct': return structKind(e.UnitType||e.unit).ko+' 파괴';
    case 'merc': return (e.CampType||'용병')+' 점령';
    default: return e.e;
  }
}
/* 트랙·눈금 아무 데나 누르면 그 시각으로 */
function tlSeekFromEvent(ev, el){
  if(!G) return;
  const r = el.getBoundingClientRect();
  seekTo(Math.max(0, Math.min(G.maxT, (ev.clientX-r.left)/r.width*G.maxT)));
}
tlRows.forEach(r=>r.onclick=ev=>tlSeekFromEvent(ev,r));
tlAxis.onclick=ev=>tlSeekFromEvent(ev,tlAxis);
function seekTo(t){ tCur=t; logCount=-1; markDirty(); }

/* 지금 시각 표시선 · 지나간 구간 · 마커 진하기 (레퍼런스의 progress / past 처리) */
function updateTimeline(){
  if(!G || !tlBuilt) return;
  const track = tlRows[0];
  const par = document.getElementById('timeline').getBoundingClientRect();
  const tr = track.getBoundingClientRect();
  tlNowEl.style.left = (tr.left-par.left + tCur/G.maxT*tr.width)+'px';
  const pct = Math.max(0, Math.min(100, tCur/G.maxT*100)) + '%';
  for(const r of tlRows) r.style.setProperty('--prog', pct);
  if(typeof drawSpanBand==='function') drawSpanBand();
  for(const L of tierLines){
    const future = L.t > tCur;
    if(L.el.classList.contains('future')!==future) L.el.classList.toggle('future',future);
  }
  for(const m of tlMarks){
    const future = m.t > tCur;
    if(m.el.classList.contains('future')!==future) m.el.classList.toggle('future',future);
    const sel = selEvent===m.e;
    if(m.el.classList.contains('sel')!==sel) m.el.classList.toggle('sel',sel);
  }
}

/* ---------------- 시간별 경험치 그래프 ----------------
   x = 경기 시간, y = 누적 경험치. 항목을 고르면 그 출처만 본다.
   («합계» 에서는 출처별 얇은 선도 같이 깔아 구성을 한눈에 보이게 한다) */
const XP_KIND = {total:'합계', minion:'돌격병', creep:'용병',
                 hero:'영웅 처치', struct:'구조물', trickle:'시간 경과'};
const XP_SUB = ['minion','creep','hero','struct','trickle'];
const gXp = document.getElementById('gXp');
const xpKindSel = document.getElementById('xpKind');
const xpLegend = document.getElementById('xpLegend');
xpKindSel.onchange = drawXp;

function xpTotal(r){ return r.minion+r.hero+r.struct+r.creep+r.trickle; }
function xpVal(r,k){ return k==='total' ? xpTotal(r) : r[k]; }
const XP_COL={minion:'#8fa3c8', creep:'#d8b260', hero:'#ff8a94', struct:'#b9a7e0', trickle:'#4dbc92'};

/* 그래프 한 장 그리기. 작은 그래프(#gXp)와 큰 창(#gXpBig)이 같은 코드를 쓴다. */
function drawXpOn(cvEl, opt){
  if(!cvEl) return null;
  const rows = (G && G.teamXp) || [];
  const d = Math.min(2, window.devicePixelRatio||1);
  const w = cvEl.clientWidth, h = cvEl.clientHeight;
  if(!w||!h) return null;
  if(cvEl.width!==Math.round(w*d)||cvEl.height!==Math.round(h*d)){
    cvEl.width=Math.round(w*d); cvEl.height=Math.round(h*d); }
  const c = cvEl.getContext('2d');
  c.clearRect(0,0,cvEl.width,cvEl.height);
  if(!rows.length){
    c.fillStyle='#5b667d'; c.font=(11*d)+'px sans-serif'; c.textAlign='center';
    c.fillText('경험치 기록이 없는 리플레이입니다', cvEl.width/2, cvEl.height/2);
    return null;
  }
  const kind = opt.kind || 'total';
  const big = !!opt.big;
  const maxT = G.maxT || Math.max(...rows.map(r=>r.t));
  const PAD=(big?14:6)*d, PADL=(big?52:30)*d, PADB=(big?22:6)*d;
  const W=cvEl.width-PADL-PAD, H=cvEl.height-PAD-PADB;
  let maxY = 1;
  for(const r of rows) maxY = Math.max(maxY, xpVal(r,kind));
  const X = t=>PADL + (maxT? t/maxT:0)*W;
  const Y = v=>PAD + H - (v/maxY)*H;
  // 가로 눈금 + 경험치 값
  const nTick = big?6:3;
  c.strokeStyle='rgba(120,140,190,.13)'; c.lineWidth=d;
  c.fillStyle='#5b667d'; c.font=(big?11:9)*d+'px ui-monospace,monospace'; c.textAlign='right';
  for(let i=0;i<=nTick;i++){
    const y=PAD+H*i/nTick, v=Math.round(maxY*(1-i/nTick));
    c.beginPath(); c.moveTo(PADL,y); c.lineTo(PADL+W,y); c.stroke();
    c.fillText(v>=1000?(v/1000).toFixed(big?1:0)+'k':v, PADL-3*d, y+3*d);
  }
  // 세로 눈금 (큰 창만) — 2분 간격
  if(big){
    c.textAlign='center';
    const step = maxT>1500?300:120;
    for(let s=0;s<=maxT;s+=step){
      c.beginPath(); c.moveTo(X(s),PAD); c.lineTo(X(s),PAD+H); c.stroke();
      c.fillText(fmtT(s), X(s), PAD+H+15*d);
    }
  }
  // 레벨 문턱선 — «합계» 에서만 뜻이 있다
  if(big && opt.lvLines && kind==='total' && typeof LEVEL_XP!=='undefined'){
    c.setLineDash([4*d,4*d]); c.textAlign='left';
    for(const k in LEVEL_XP){
      const v=lvXp(+k); if(v==null||v>maxY) continue;
      c.strokeStyle='rgba(232,182,76,.28)';
      c.beginPath(); c.moveTo(PADL,Y(v)); c.lineTo(PADL+W,Y(v)); c.stroke();
      c.fillStyle='rgba(232,182,76,.75)';
      c.fillText('Lv '+k, PADL+3*d, Y(v)-3*d);
    }
    c.setLineDash([]);
  }
  const COL=['#339fee','#e64343'];
  const line=(pts,color,width,alpha)=>{
    if(pts.length<2) return;
    c.globalAlpha=alpha; c.strokeStyle=color; c.lineWidth=width; c.lineJoin='round';
    c.beginPath(); pts.forEach((p,i)=> i?c.lineTo(X(p[0]),Y(p[1])):c.moveTo(X(p[0]),Y(p[1])));
    c.stroke(); c.globalAlpha=1;
  };
  // 합계일 때는 출처별 얇은 선을 먼저 깔아 둔다.
  // 큰 창에서 «항목별 색 나누기» 를 켜면 출처마다 색을 달리해 구성을 읽게 한다.
  if(kind==='total'){
    for(const k of XP_SUB) for(const tm of [0,1])
      line(rows.filter(r=>r.team===tm).map(r=>[r.t,r[k]]),
           opt.perTeam? XP_COL[k] : COL[tm],
           (opt.perTeam?1.6:1)*d, opt.perTeam? (tm?0.5:0.95) : .28);
  }
  for(const tm of [0,1])
    line(rows.filter(r=>r.team===tm).map(r=>[r.t,xpVal(r,kind)]), COL[tm], (big?3:2.2)*d, 1);
  // 지금 시각
  c.strokeStyle='rgba(232,182,76,.9)'; c.lineWidth=(big?2:1)*d;
  c.beginPath(); c.moveTo(X(tCur),PAD); c.lineTo(X(tCur),PAD+H); c.stroke();
  return {kind};
}
/* 범례 = 현재 시각의 값 */
function xpLegendHTML(kind, withSub){
  const rows=(G&&G.teamXp)||[]; if(!rows.length) return '';
  const COL=['#339fee','#e64343'];
  const cur=[null,null];
  for(const r of rows) if(r.t<=tCur) cur[r.team]=r;
  const n=v=>v==null?'-':Math.round(v).toLocaleString();
  let html=`<span style="color:${COL[0]}">1팀 <b>${n(cur[0]&&xpVal(cur[0],kind))}</b></span>`+
           `<span style="color:${COL[1]}">2팀 <b>${n(cur[1]&&xpVal(cur[1],kind))}</b></span>`;
  if(withSub && kind==='total' && (cur[0]||cur[1])){
    html+='<span style="width:100%;opacity:.85">'+XP_SUB.map(k=>
      `<i style="font-style:normal;color:${XP_COL[k]}">${XP_KIND[k]}</i> `+
      `<b>${n(cur[0]&&cur[0][k])}</b>:<b>${n(cur[1]&&cur[1][k])}</b>`).join(' · ')+'</span>';
  }
  return html;
}
function drawXp(){
  const kind = xpKindSel.value || 'total';
  if(drawXpOn(gXp, {kind})) xpLegend.innerHTML = xpLegendHTML(kind, true);
  else xpLegend.textContent='';
  if(xpModal && !xpModal.hidden) drawXpBig();
}
/* 그래프 위를 누르면 그 시각으로 */
function xpSeek(cvEl, ev, big){
  if(!G) return;
  const r=cvEl.getBoundingClientRect();
  const PADL=big?52:30, PADR=big?14:6;
  const W=r.width-PADL-PADR;
  seekTo(Math.max(0, Math.min(G.maxT, (ev.clientX-r.left-PADL)/W*G.maxT)));
}
gXp.onclick=ev=>xpSeek(gXp,ev,false);

/* ---------------- 크게 보기 ----------------
   작은 그래프는 118px 이라 레벨 문턱이나 항목 구성이 보이지 않는다.
   같은 그래프를 큰 창에 다시 그리고, 레벨 문턱선과 «몇 경험치에 몇 레벨» 표를 곁들인다. */
const xpModal=document.getElementById('xpModal');
const gXpBig=document.getElementById('gXpBig');
const xpKind2=document.getElementById('xpKind2');
const xpLegend2=document.getElementById('xpLegend2');
const lvTable=document.getElementById('lvTable');
const xpLvLines=document.getElementById('xpLvLines');
const xpPerTeam=document.getElementById('xpPerTeam');
const xpPieLive=document.getElementById('xpPieLive');
xpKind2.replaceChildren(...Object.keys(XP_KIND).map(k=>{
  const o=document.createElement('option'); o.value=k; o.textContent=XP_KIND[k]; return o; }));

function drawXpBig(){
  const kind = xpKind2.value || 'total';
  drawXpOn(gXpBig, {kind, big:true, lvLines:xpLvLines.checked, perTeam:xpPerTeam.checked});
  xpLegend2.innerHTML = xpLegendHTML(kind, true);
  drawPies(kind, xpPieLive.checked);
  pieLastT = tCur;
  drawLvTable();
}
/* 재생 루프가 매 프레임 부른다. «재생 시각까지» 일 때만, 그리고 0.4초 넘게
   움직였을 때만 다시 그린다 — 매 프레임 파이를 새로 그리면 재생이 무거워진다. */
let pieLastT = -1;
function xpPieTick(){
  if(xpModal.hidden || !xpPieLive.checked || !G) return;
  if(Math.abs(tCur - pieLastT) < 0.4) return;
  pieLastT = tCur;
  drawPies(xpKind2.value || 'total', true);
}

/* ── 오른쪽 파이 ──────────────────────────────────
   선 그래프는 «흐름» 을, 파이는 «누가/무엇이 얼마나» 를 맡는다.
   항목별 선을 여러 개 겹쳐 놓으면 어느 쪽이 큰지 읽기 어렵기 때문이다.

     합계   항목 파이 (팀별) + 영웅 파이 (팀별)
     항목   영웅 파이만

   파이는 «경기 전체» 를 센다. 옆의 선 그래프도 경기 전체를 그리므로
   눈금을 맞춘다 — 예전에는 재생 시각까지만 셌는데, 그러면 재생 전에
   창을 열었을 때 (tCur = 0) 죄다 «자료 없음» 으로 비어 보였다.

   영웅 파이의 근거가 둘로 나뉜다 —
     합계는 점수표의 ExperienceContribution 이라 «진짜 경험치 기여» 다.
     항목별은 영웅 단위 경험치가 리플레이에 없어서, 그 항목을 만드는 «사건 수»
     (돌격병 막타 · 용병 막타 · 처치 관여 · 구조물 막타)로 나눈다.
     비율의 뜻이 다르므로 파이 제목에 무엇을 센 것인지 적는다. */
const PIE_SRC = {
  minion:  { ko:'돌격병 막타',   pick:(ka)=>ka.filter(k=>k[3]==='minion').length },
  creep:   { ko:'용병 막타',     pick:(ka)=>ka.filter(k=>k[3]==='merc').length },
  struct:  { ko:'구조물 막타',   pick:(ka)=>ka.filter(k=>k[3]==='struct').length },
  hero:    { ko:'처치 관여',     td:true },
};
function pieSlices(vals, colors){
  const tot = vals.reduce((a,v)=>a+v.n, 0);
  if(!tot) return null;
  return { tot, rows: vals.map((v,i)=>({...v, c:colors[i], p:v.n/tot*100})) };
}
/* 팀 색을 밝기로 다섯 단계 — 같은 팀 안에서 구분되게 */
function heroColors(team){
  const base = team ? [0.62,0.20,25] : [0.68,0.15,245];
  return [0,1,2,3,4].map(i=>
    `oklch(${(base[0]+i*0.07).toFixed(2)} ${(base[1]-i*0.022).toFixed(3)} ${base[2]})`);
}

/* 아이콘은 한 번만 불러 둔다. 당장은 비어 있고, 다 받으면 다시 그린다. */
const pieImgs = new Map();
function pieImg(src, redraw){
  let im = pieImgs.get(src);
  if(!im){ im = new Image(); im.onload = redraw; im.onerror = ()=>{}; im.src = src;
           pieImgs.set(src, im); }
  return im;
}
/* 파이 하나를 캔버스에 그린다.
   조각에 색만 입히면 범례와 눈을 오가야 하므로, 조각 안에 영웅 초상화를
   직접 박고 그 아래에 퍼센트를 적는다. 너무 얇은 조각은 건너뛰고 범례에만 남긴다. */
function drawPieCanvas(cv, sl, R, redraw){
  const S = R*2 + 6, dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(S*dpr); cv.height = Math.round(S*dpr);
  cv.style.width = S+'px'; cv.style.height = S+'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr,0,0,dpr,0,0);
  g.clearRect(0,0,S,S);
  const cx = S/2, cy = S/2;
  const rows = sl.rows.filter(r=>r.n>0).sort((a,b)=>b.n-a.n);
  let a0 = -Math.PI/2;
  const seg = [];
  for(const r of rows){
    const a1 = a0 + r.p/100*Math.PI*2;
    g.beginPath(); g.moveTo(cx,cy); g.arc(cx,cy,R,a0,a1); g.closePath();
    g.fillStyle = r.c; g.fill();
    g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1.5; g.stroke();
    seg.push({ r, mid:(a0+a1)/2 }); a0 = a1;
  }
  for(const s of seg){
    if(s.r.p < 5) continue;
    const rr = R*0.52;
    const x = cx + Math.cos(s.mid)*rr, y = cy + Math.sin(s.mid)*rr;
    const d = Math.max(R*0.32, Math.min(R*0.56, R*0.22 + s.r.p*R*0.010));
    const im = s.r.ic ? pieImg(s.r.ic, redraw) : null;
    if(im && im.complete && im.naturalWidth){
      g.save();
      g.beginPath(); g.arc(x, y, d/2, 0, Math.PI*2); g.closePath();
      g.fillStyle='rgba(0,0,0,.55)'; g.shadowColor='rgba(0,0,0,.65)'; g.shadowBlur=7;
      g.fill(); g.shadowBlur=0; g.clip();
      g.drawImage(im, x-d/2, y-d/2, d, d);
      g.restore();
      g.beginPath(); g.arc(x, y, d/2, 0, Math.PI*2);
      g.strokeStyle='rgba(255,255,255,.8)'; g.lineWidth=1.5; g.stroke();
    }
    const ty = im ? y + d/2 + 9 : y + 4;
    g.font = `600 ${Math.round(R*0.155)}px ui-monospace,Menlo,Consolas,monospace`;
    g.textAlign='center'; g.textBaseline='middle';
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.75)';
    g.strokeText(`${Math.round(s.r.p)}%`, x, ty);
    g.fillStyle = '#fff'; g.fillText(`${Math.round(s.r.p)}%`, x, ty);
  }
}
/* 파이 하나의 자리 — 캔버스는 빈 채로 내고, 붙인 다음에 그린다 */
function pieBox(title, cls, sl, fmt, jobs){
  if(!sl) return `<div class="pieone none"><div class="tt ${cls}">${title}</div>
    <div class="lg"><b>자료 없음</b></div></div>`;
  const id = 'pc'+(jobs.length);
  jobs.push({ id, sl });
  const rows = sl.rows.filter(r=>r.n>0).sort((a,b)=>b.n-a.n);
  // 캔버스는 0 크기로 내보낸다 — 붙인 다음 남은 높이를 재서 크기를 정한다
  return `<div class="pieone"><canvas class="piecv" id="${id}" style="width:0;height:0"></canvas>`
    + `<div class="lg">`
    + `<div class="tt ${cls}">${title}</div>`
    + rows.map(r=>`<b title="${r.ko} — ${fmt(r.n)} (${r.p.toFixed(1)}%)">`
      + (r.ic ? `<img src="${r.ic}" alt="" style="outline:2px solid ${r.c}">`
              : `<i style="background:${r.c}"></i>`)
      + `<span>${r.ko}</span><u>${fmt(r.n)}</u><s>${r.p.toFixed(0)}%</s></b>`).join('')
    + `</div></div>`;
}

/* 합계의 «영웅 몫» 을 재생 시각까지로 되돌린 값 (추정).
   점수표의 ExperienceContribution 은 경기 최종값 하나뿐이라 되감을 수 없다.
   대신 그 시각의 항목별 팀 경험치를, 그 항목을 만든 사건 수 비율로 나눈다.
       est_h = Σ_항목 ( 그 시각 팀 항목 경험치 × 그 항목에서 h 의 사건 몫 )
   시간 경과는 팀 전체에 붙는 값이라 뺀다 — 실제로 점수표 합과도 그렇게 맞는다
   (1팀: 팀 경험치 33,871 − 시간 경과 12,995 = 20,876, 점수표 합 20,841).
   사건이 하나도 없는 항목은 다섯 명에게 고르게 나눈다. */
function xpShareAt(labs, cutoff, row){
  const CATS = ['minion','creep','hero','struct'];
  const cnt = {}; for(const k of CATS) cnt[k] = labs.map(()=>0);
  labs.forEach((lab,i)=>{
    for(const k of ((G.raw&&G.raw.kill_anchors||{})[lab]||[])){
      if(k[0] > cutoff) break;
      if(k[3]==='minion') cnt.minion[i]++;
      else if(k[3]==='merc') cnt.creep[i]++;
      else if(k[3]==='struct') cnt.struct[i]++;
    }
    for(const e of G.evs){ if(e.t > cutoff) break;
      if(e.e==='PlayerDeath' && (e.killers||[]).includes(lab)) cnt.hero[i]++; }
  });
  const out = labs.map(()=>0);
  for(const k of CATS){
    const pot = (row && row[k]) || 0; if(!pot) continue;
    const sum = cnt[k].reduce((a,b)=>a+b, 0);
    labs.forEach((_,i)=> out[i] += pot * (sum ? cnt[k][i]/sum : 1/labs.length));
  }
  return out;
}

function drawPies(kind, live){
  const el = document.getElementById('xpPies');
  if(!el) return;
  if(!G){ el.innerHTML=''; return; }
  const num = v => Math.round(v).toLocaleString();
  const jobs = [];
  let h = '';

  // 기준 시각 — «재생 시각까지» 면 tCur, 아니면 경기 끝
  const cutoff = live ? tCur : Infinity;
  const cur = [null,null];
  for(const r of (G.teamXp||[])) if(r.t <= cutoff) cur[r.team] = r;
  const stamp = live ? `${fmtT(tCur)} 까지` : '경기 전체';

  // 1) 항목 파이 — 합계일 때만. 팀별로 경험치가 어디서 나왔는지.
  if(kind==='total' && (cur[0]||cur[1])){
    h += `<div class="piegrp"><h4>항목 구성 <em>${stamp} · 경험치가 어디서 나왔나</em></h4>`;
    for(const tm of [0,1]){
      const c = cur[tm];
      const sl = c ? pieSlices(XP_SUB.map(k=>({ko:XP_KIND[k], n:c[k]||0})),
                               XP_SUB.map(k=>XP_COL[k])) : null;
      h += pieBox(`${tm+1}팀 <u>${c?num(xpTotal(c)):''}</u>`, tm?'r':'b', sl, num, jobs);
    }
    h += `</div>`;
  }

  // 2) 영웅 파이
  const sc = (G.raw && G.raw.score) || {};
  const idx = {}; Object.keys(G.players).forEach((k,i)=>{
    const p=G.players[k]; idx[`${p.name}(${p.hero})`]=i; });
  const labT = [[],[]];
  for(const lab in G.heroes) labT[G.heroes[lab].team===1?1:0].push(lab);
  // 합계 + 실시간이면 항목에서 되짚어 추정한다 (점수표는 최종값 하나뿐이라 못 되감는다)
  const est = (kind==='total' && live)
    ? [xpShareAt(labT[0], cutoff, cur[0]), xpShareAt(labT[1], cutoff, cur[1])] : null;
  const byTeam = [[],[]];
  for(const tm of [0,1]) labT[tm].forEach((lab,i)=>{
    const hh=G.heroes[lab];
    const hd = heroByName(hh.heroName);
    let n = 0;
    if(kind==='total'){
      n = est ? est[tm][i] : ((sc.ExperienceContribution||[])[idx[lab]] || 0);
    }else if(kind==='trickle'){
      n = 0;                                   // 시간 경과는 팀 전체에 붙는다 (영웅 구분 없음)
    }else{
      const s = PIE_SRC[kind];
      if(s && s.td){
        for(const e of G.evs){ if(e.t > cutoff) break;
          if(e.e==='PlayerDeath' && (e.killers||[]).includes(lab)) n++; }
      }else if(s){
        n = s.pick(((G.raw&&G.raw.kill_anchors||{})[lab]||[]).filter(k=>k[0]<=cutoff));
      }
    }
    byTeam[tm].push({ ko:hh.heroName, n, ic: hd ? `icons/${hd.icon}` : null });
  });
  // 리플레이에 그대로 있는 값인가, 추론해 채운 값인가
  const guess = kind!=='total' || live;
  const src = kind==='total' ? (live ? `${stamp} · 항목에서 되짚은 값${estB(EST_WHY.pieLive)}`
                                     : '경험치 기여 (점수표 · 경기 최종값)')
            : kind==='trickle' ? ''
            : (PIE_SRC[kind] ? `${stamp} · ${PIE_SRC[kind].ko} 수${estB(EST_WHY.pie)}` : '');
  if(kind==='trickle'){
    h += `<div class="piegrp"><h4>영웅 몫</h4>
      <p class="pienote">«시간 경과» 경험치는 팀 전체에 붙는 값이라 영웅별로 나뉘지 않습니다.</p></div>`;
  }else{
    h += `<div class="piegrp"><h4>영웅 몫 <em>${src}</em></h4>`;
    for(const tm of [0,1])
      h += pieBox(`${tm+1}팀${guess?estB(EST_WHY.pie):''}`, tm?'r':'b',
                  pieSlices(byTeam[tm], heroColors(tm)), num, jobs);
    if(kind!=='total')
      h += `<p class="pienote est">영웅별 «항목 경험치» 는 리플레이에 없습니다 —
            그 항목을 만드는 사건 수로 나눈 <b>추정치</b>입니다.</p>`;
    else if(live)
      h += `<p class="pienote est">점수표의 경험치 기여도는 <b>경기 최종값</b> 하나뿐이라 되감을 수 없습니다.
            그 시각의 항목별 팀 경험치를 사건 수 비율로 나눈 <b>추정치</b>입니다
            (시간 경과는 팀 전체 몫이라 뺍니다 · 검증 오차 평균 2.0%p).</p>`;
    h += `</div>`;
  }
  h += `<p class="pienote">파이는 <b>${live?fmtT(tCur)+' 까지':'경기 전체'}</b> 기준입니다.</p>`;
  el.innerHTML = h;

  // 남은 높이를 파이 개수로 나눠 크기를 정한다 — 스크롤 없이 다 보이게.
  // (캔버스를 0 으로 내보냈으므로 지금 scrollHeight 는 «파이를 뺀» 높이다)
  let R = jobs.length > 2 ? 66 : 92;
  if(jobs.length && el.clientHeight > 120){
    const row  = el.querySelector('.pieone').clientHeight;      // 범례가 정하는 최소 높이
    const room = row + (el.clientHeight - el.scrollHeight - 4) / jobs.length;
    R = Math.max(58, Math.min(96, Math.floor((room - 6) / 2)));
  }
  const redraw = () => { for(const j of jobs){
    const cv = document.getElementById(j.id); if(cv) drawPieCanvas(cv, j.sl, R, ()=>{}); } };
  for(const j of jobs){
    const cv = document.getElementById(j.id);
    if(cv) drawPieCanvas(cv, j.sl, R, redraw);
  }
}
/* 레벨 문턱값 표 — «경험치를 얼마나 모아야 몇 레벨인가».
   리플레이는 30초마다 표본만 남기므로 문턱은 구간으로만 알 수 있다 (js/data_levels.js 참고). */
function drawLvTable(){
  if(typeof LEVEL_XP==='undefined'){ lvTable.textContent=''; return; }
  const rows=(G&&G.teamXp)||[];
  const cur=[null,null]; for(const r of rows) if(r.t<=tCur) cur[r.team]=r;
  const now=[cur[0]?xpTotal(cur[0]):null, cur[1]?xpTotal(cur[1]):null];
  const lvNow=[1,1]; for(const r of rows) if(r.t<=tCur) lvNow[r.team]=r.lv;
  const out=[];
  for(const k in LEVEL_XP){
    const L=+k, v=lvXp(L), rg=lvXpRange(L);
    const on = L===lvNow[0]+1 || L===lvNow[1]+1;
    out.push(`<span class="est ${on?'on':''}" title="표본에서 잡은 구간 ${rg[0].toLocaleString()} ~ ${rg[1].toLocaleString()} — 실제 문턱은 이 사이에 있습니다">`+
             `Lv${L} ${v.toLocaleString()}+</span>`);
  }
  const left = i=>{ if(now[i]==null) return ''; const nx=lvXp(lvNow[i]+1);
    return nx==null?'':`${i+1}팀 다음 레벨까지 약 ${Math.max(0,Math.round(nx-now[i])).toLocaleString()}`; };
  out.push(`<span class="note est">${estB(EST_WHY.lvxp)} 문턱값은 표본 리플레이 8판에서 뽑은 <b>하한</b>입니다 `+
           `— 리플레이에 30초 간격 표본만 남아, 실제 문턱은 이 값보다 조금 위입니다 (칸에 마우스를 올리면 구간). `+
           `${left(0)} · ${left(1)}</span>`);
  lvTable.innerHTML=out.join('');
}
function openXpBig(){
  if(!G) return;
  xpKind2.value = xpKindSel.value || 'total';
  xpModal.hidden=false;
  // 창이 뜨자마자 한 번, 배치가 잡힌 다음 한 번 더 그린다.
  // (숨김을 풀기 전에는 캔버스 크기가 0 이라 첫 그림이 통째로 빈다)
  drawXpBig(); requestAnimationFrame(drawXpBig);
}
function closeXpBig(){ xpModal.hidden=true; }
document.getElementById('xpBig').onclick=openXpBig;
document.getElementById('xpClose').onclick=closeXpBig;
xpModal.onclick=e=>{ if(e.target===xpModal) closeXpBig(); };
xpKind2.onchange=drawXpBig;
xpLvLines.onchange=drawXpBig;
xpPerTeam.onchange=drawXpBig;
xpPieLive.onchange=drawXpBig;
gXpBig.onclick=ev=>{ xpSeek(gXpBig,ev,true); drawXpBig(); };
window.addEventListener('keydown',e=>{
  // 포커스가 요소가 아닐 수도 있다 (window·document). matches 를 바로 부르면 터진다.
  if(typeof isTypingTarget==='function' && isTypingTarget()) return;
  if(e.key==='Escape'){ if(!xpModal.hidden){ closeXpBig(); e.stopPropagation(); } }
  else if((e.key==='g'||e.key==='G') && G){ xpModal.hidden?openXpBig():closeXpBig(); }
});
window.addEventListener('resize',()=>{ if(!xpModal.hidden) drawXpBig(); });
