/* ================= 이벤트 로그 =================
   재생 중에는 새로 생긴 줄만 덧붙인다. 예전에는 이벤트가 하나 뜰 때마다
   250줄(아이콘 <img> 포함)을 통째로 다시 만들어 그 프레임이 툭 걸렸다.
   logCount=-1 은 «처음부터 다시 그려라» 신호다 (되감기·필터 변경·리플레이 교체). */
const logEl=document.getElementById('log');
const filters={kill:true,struct:true,merc:true,obj:true,grow:true,misc:true};

/* 레벨·특성을 «팀 + 레벨» 한 줄로 묶는다.
   팀 레벨은 다섯 명이 같이 오르고, 특성도 같은 티어에서 갈리므로
   선수마다 한 줄씩 쓰면 같은 이야기를 다섯 번 하는 셈이 된다. */
function growGroups(){
  if(!G) return [];
  if(G._growG) return G._growG;
  const rows = {};
  const at = (team, lv, t) => {
    const g = (rows[team+'-'+lv] ||= {e:'TeamLevel', t, team, lv, picks:[]});
    if(t < g.t) g.t = t;
    return g;
  };
  for(const e of G.evs){
    if(e.e!=='LevelUp' || !e.player || e.Level==null) continue;
    const tm = teamOf(e.player, G.players);
    if(tm===0 || tm===1) at(tm, +e.Level, e.t);
  }
  const {pickMap} = (typeof teamPicks==='function') ? teamPicks() : {pickMap:{}};
  for(const lab in pickMap){
    const tm = teamOf(lab, G.players); if(tm!==0 && tm!==1) continue;
    for(const tier of TIERS){
      const p = pickMap[lab][tier]; if(!p) continue;
      at(tm, tier, p.t).picks.push({hero:(G.heroes[lab]||{}).heroName||lab, ko:p.ko, ic:p.ic, t:p.t});
    }
  }
  const out = Object.values(rows).sort((a,b)=>a.t-b.t);
  for(const g of out) g.picks.sort((a,b)=>a.t-b.t);
  return (G._growG = out);
}
let logCount=-1;
const LOG_MAX=250;              // 화면에 유지할 최대 줄 수
const logCntEl=document.getElementById('logCnt');

let flt=[];                     // 필터를 통과한 이벤트 (시간순)
let firstShown=0, shown=0;      // 화면에 올라간 구간 [firstShown, shown)

function evRow(e){
  const d=document.createElement('div');
  d.className='ev';
  d.innerHTML=evHTML(e,G.players);
  return d;
}
function logRebuild(){
  // 레벨·특성만 묶은 줄로 갈아 끼운다 (나머지는 원본 그대로)
  flt=G.evs.filter(e=>CAT(e)!=='grow' && (filters[CAT(e)]??true));
  if(filters.grow) flt=flt.concat(growGroups()).sort((a,b)=>a.t-b.t);
  let end=0; while(end<flt.length && flt[end].t<=tCur) end++;
  const start=Math.max(0,end-LOG_MAX);
  firstShown=start; shown=end;
  if(end===0){ logEl.innerHTML='<div class="empty">재생하면 이벤트가 여기에 표시됩니다</div>'; return; }
  const frag=document.createDocumentFragment();
  for(let i=start;i<end;i++) frag.appendChild(evRow(flt[i]));
  logEl.replaceChildren(frag);
  logEl.scrollTop=logEl.scrollHeight;
}
function renderLog(){
  if(!G) return;
  if(logCount===-1){ logRebuild(); logCount=shown; }
  else {
    // 되감기: 지금 시각보다 뒤에 있는 줄을 끝에서 걷어낸다.
    // 화면에 남은 것보다 더 뒤로 가면 통째로 다시 그린다.
    if(shown>firstShown && flt[firstShown].t>tCur){ logRebuild(); logCount=shown; }
    else {
      let changed=false;
      while(shown>firstShown && flt[shown-1].t>tCur){
        logEl.lastElementChild.remove(); shown--; changed=true;
      }
      // 앞으로 가기: 새로 보이게 된 것만 덧붙인다
      while(shown<flt.length && flt[shown].t<=tCur){
        if(!shown && logEl.firstElementChild?.className==='empty') logEl.replaceChildren();
        logEl.appendChild(evRow(flt[shown])); shown++; changed=true;
        if(shown-firstShown>LOG_MAX){ logEl.firstElementChild.remove(); firstShown++; }
      }
      if(changed){ logCount=shown; logEl.scrollTop=logEl.scrollHeight;
        if(shown===0&&!logEl.firstElementChild)
          logEl.innerHTML='<div class="empty">재생하면 이벤트가 여기에 표시됩니다</div>'; }
    }
  }
  // 머리줄의 «지나온 것 / 전체» (flt 는 logRebuild 가 채운다 — 그 뒤에 센다)
  if(logCntEl){
    const s=`${shown}/${flt.length}`;
    if(logCntEl.textContent!==s) logCntEl.textContent=s;
  }
  // 최근 2초 강조는 «끝쪽 연속 구간» 이라, 끝에서부터 오래된 줄을 만나면 멈춘다
  const kids=logEl.children;
  for(let n=kids.length-1;n>=0;n--){
    const e=flt[firstShown+n]; if(!e) break;
    const fr=tCur-e.t<2;
    const had=kids[n].classList.contains('fresh');
    if(fr!==had) kids[n].classList.toggle('fresh',fr);
    if(!fr) break;
  }
}
document.querySelectorAll('#filters button').forEach(b=>b.onclick=()=>{
  filters[b.dataset.f]=!filters[b.dataset.f]; b.classList.toggle('on');
  logCount=-1;
  // 아래 시간축도 같은 필터를 따른다 — 다 끄면 아무것도 안 남는다
  if(typeof applyTlFilters==='function') applyTlFilters();
  markDirty(); });

/* 로그 패널 접기/펴기 */
const sideEl=document.getElementById('side'), sideTgl=document.getElementById('sideTgl');
sideTgl.onclick=()=>{
  const c=sideEl.classList.toggle('collapsed');
  sideTgl.textContent=c?'◂':'▸';
  sideTgl.title=c?'로그 펴기':'로그 접기';
  requestAnimationFrame(()=>{ resizeOverlay(); fit(); if(typeof drawXp==='function') drawXp(); });
};
