/* ================= 스코어보드 =================
   reference/heroes-of-the-storm-analyzer 의 TeamPanel / ScoreColumn 배치를 옮겼다.
     [1팀 선수 5줄] [가운데 점수 기둥] [2팀 선수 5줄]
   선수 한 줄 = 초상화 + 영웅/닉네임 + 특성 7칸 + 스킬 사용 + 수치 칸.
   수치 칸은 가운데 «특성/관여/APM/XP» 단추로 갈아 끼운다. */
const TIERS = [1,4,7,10,13,16,20];
const teamEls = [document.getElementById('top0'), document.getElementById('top1')];
let plCards = [];
let selPlayer = null;              // 선수 한 명을 고르면 그 줄이 금색으로 강조된다

function talentInfo(name){
  const d = (typeof TALENT_DB!=='undefined') ? TALENT_DB[name] : null;
  if(d) return { ko: d.ko || name, lv: d.lv, ic: d.ic || '' };
  // 표에 없는 특성은 내부명을 읽기 좋게 푼다:
  // "KerriganFuryOfTheSwarm" -> "Fury Of The Swarm" (영웅 이름 접두어는 뗀다)
  let s = String(name||'');
  for(const h of HERO_DB){
    const en = h.en.replace(/[^A-Za-z]/g,'');
    if(en && s.startsWith(en)){ s = s.slice(en.length); break; }
  }
  s = s.replace(/^(HeroicAbility|Mastery|Talent)/,'')
       .replace(/([a-z0-9])([A-Z])/g,'$1 $2').trim();
  return { ko: s || name, lv: null, ic: '' };
}

/* 공용 스킬 번호 — 기본 공격·탈것·귀환이라 «스킬 사용»에서 뺀다
   (실측: 26=공격/A이동, 111=탈것, 115=귀환, 나머지는 좌표 없는 공용) */
const SHARED_ABIL = new Set([22,23,26,41,45,66,77,110,111,115,172,788,789,796,137,138]);
const SK_SLOTS = 5;

/* 선수별 «티어 -> 고른 특성» 표. 스코어보드·이벤트 로그·타임라인이 같이 쓰므로
   한 번만 만들어 G 에 붙여 둔다. 티어를 모르는 특성은 남은 칸에 순서대로 채운다. */
function teamPicks(){
  if(!G) return {pickMap:{}, levels:{}};
  if(G._picks) return G._picks;
  const picks = {}, levels = {};
  for(const e of G.evs){
    if(e.e==='TalentChosen' && e.player){
      const info = talentInfo(e.PurchaseName||'');
      (picks[e.player] ||= []).push({t:e.t, ko:info.ko, lv:info.lv, ic:info.ic});
    }else if(e.e==='LevelUp' && e.player && e.Level!=null){
      (levels[e.player] ||= []).push({t:e.t, lv:+e.Level});
    }
  }
  for(const k in picks) picks[k].sort((a,b)=>a.t-b.t);
  for(const k in levels) levels[k].sort((a,b)=>a.t-b.t);
  const pickMap = {};
  for(const lab in picks){
    const m = {}, rest = [];
    for(const p of picks[lab]){ if(p.lv && !m[p.lv]) m[p.lv]=p; else rest.push(p); }
    for(const tier of TIERS) if(!m[tier] && rest.length) m[tier]=rest.shift();
    pickMap[lab] = m;
  }
  return (G._picks = {pickMap, levels});
}

function buildTeamBar(){
  plCards = []; selPlayer = null;
  teamEls.forEach(el=>el.replaceChildren());
  if(!G) return;
  const {pickMap, levels} = teamPicks();

  for(const lab in G.heroes){
    const hh = G.heroes[lab];
    const team = hh.team===1 ? 1 : 0;
    const hd = heroByName(hh.heroName);
    const ad = (typeof ABIL_DB!=='undefined') ? ABIL_DB[hh.heroName] : null;
    const row = document.createElement('div');
    row.className = 'pl';

    /* ── 관전 UI 배치 ─────────────────────────────────────────────
       [1·4·7 특성] [큰 초상화 + 좌하단 궁극기] [13·16·20 특성]
                    [ Q W E D 스킬 아이콘 ]
       왼쪽 세 칸이 초반 티어(1/4/7), 오른쪽 세 칸이 후반(13/16/20)이고
       10레벨 궁극기는 초상화 왼쪽 아래에 작게 붙는다. 실제 관전 UI 와 같다. */
    const picks = pickMap[lab] || {};
    const mkTal = tier => {
      const i = document.createElement('i');
      i.className = 'tcell';
      const p = picks[tier];
      if(p){
        i.dataset.t = p.t; i.title = `${tier} 레벨 · ${p.ko}`;
        if(p.ic){ const im=document.createElement('img'); im.src='talents/'+p.ic+'.webp'; im.alt=p.ko; i.appendChild(im); }
        else i.classList.add('noic');
      }else { i.title = `${tier} 레벨 · 아직 안 찍음`; i.classList.add('none'); }
      return i;
    };
    const pips = {};
    // 특성 두 줄 — 위 1·4·7·10, 아래 13·16·20 (관전 바와 같다)
    const tg = document.createElement('span'); tg.className='tgrid';
    for(const tiers of [[1,4,7,10],[13,16,20]]){
      const rw = document.createElement('span'); rw.className='trow';
      for(const tier of tiers){ const c=mkTal(tier); pips[tier]=c; rw.appendChild(c); }
      tg.appendChild(rw);
    }

    // 초상화 + 궁극기(10레벨). 궁극기 칸은 특성 줄에도 있고 초상화에도 겹쳐 붙는다.
    const who = document.createElement('button');
    who.type='button'; who.className='who'; who.title=lab;
    const por = document.createElement('span'); por.className='por';
    const psrc = ad && ad.p ? 'portraits/'+ad.p+'.webp' : (hd ? 'icons/'+hd.icon : '');
    if(psrc){ const im=document.createElement('img'); im.src=psrc; im.alt=hh.heroName; por.appendChild(im); }
    const ult = mkTal(10); ult.classList.add('ult'); por.appendChild(ult);
    pips.ult = ult;                       // 초상화 쪽 사본 (같은 티어를 둘 다 켠다)
    who.appendChild(por);

    // 이름 + 최근 스킬
    const nc = document.createElement('span'); nc.className='col';
    const hn = document.createElement('span'); hn.className='hero'; hn.textContent=hh.heroName;
    const un = document.createElement('span'); un.className='user';
    un.textContent = lab.replace(/\(.*\)$/,'').trim() || lab;
    nc.append(hn,un);

    const casts = (hh.pts||[]).filter(p=>p.src==='a' && p.link!=null && !SHARED_ABIL.has(p.link));
    const order = [];
    for(const c of casts) if(!order.includes(c.link) && order.length<SK_SLOTS) order.push(c.link);
    const bars = document.createElement('span'); bars.className='sk';
    const slots = order.map((lk,i)=>{
      const u=document.createElement('u');
      u.title=`스킬 ${i+1} (내부 번호 ${lk}) · ${casts.filter(c=>c.link===lk).length}회 사용`;
      bars.appendChild(u); return {el:u, link:lk};
    });
    nc.appendChild(bars);

    const lvEl = document.createElement('span'); lvEl.className='plv'; lvEl.textContent='1';

    // 수치 여러 개를 한 줄에 늘어놓는다. 예전에는 탭으로 하나씩 갈아 끼웠는데,
    // 카드 오른쪽에 240px 넘게 남아서 그냥 다 보이게 하는 편이 낫다.
    const kda=document.createElement('span'); kda.className='kda';

    if(team===0) row.append(who, tg, nc, lvEl, kda);
    else         row.append(kda, lvEl, nc, tg, who);

    teamEls[team].appendChild(row);
    const card = {lab, card:row, pips, hh, slots, kda, lvEl, lv:1,
                  casts: casts.map(c=>({t:c.t, link:c.link})),
                  levels: levels[lab]||[]};
    who.onclick = ()=>{ selPlayer = (selPlayer===lab) ? null : lab; applySel(); };
    plCards.push(card);
  }
  applySel();
  fillStats();
}
function applySel(){
  for(const c of plCards) c.card.classList.toggle('sel', c.lab===selPlayer);
}

/* 지금 시각까지의 선수별 «처치 관여 / 데스».
   리플레이의 KillingPlayer 는 «관여자 목록»이라 누가 막타인지는 알 수 없다.
   그래서 킬/어시로 나누지 않고 히오스 기준인 처치 관여(Takedown)로 센다. */
function kdaAt(){
  const r={};
  for(const c of plCards) r[c.lab]={td:0,d:0};
  for(const e of G.evs){
    if(e.t>tCur) break;
    if(e.e!=='PlayerDeath') continue;
    if(r[e.player]) r[e.player].d++;
    for(const n of (e.killers||[])) if(r[n]) r[n].td++;
  }
  return r;
}
/* 지금 시각까지 죽어 있던 시간 (경로에서 직접 센다) */
function deadSecs(hh){
  const P=hh.path; if(!P||!P.n) return 0;
  const last=Math.min(P.n-1, Math.floor(tCur/PDT));
  let n=0; for(let k=0;k<=last;k++) if(P.fl[k]===2) n++;
  return Math.round(n*PDT);
}
/* 지금 시각 기준 갱신 — 생사·특성·스킬 사용 */
function updateTeamBar(){
  if(!G || !plCards.length) return;
  const CAST_HOLD = 1.2;                  // 스킬 표시를 켜 두는 시간(초)
  for(const c of plCards){
    const p = posAt(c.hh, tCur);
    const dead = !!(p && p.dead);
    if(c.card.classList.contains('dead')!==dead) c.card.classList.toggle('dead',dead);
    let got=0;
    for(const tier of TIERS.concat(['ult'])){
      const i = c.pips[tier]; if(!i) continue;
      const t=i.dataset.t, on = t!==undefined && +t<=tCur;
      if(i.classList.contains('got')!==on) i.classList.toggle('got',on);
      // 아직 시각이 안 된 칸도 «안 찍음» 으로 본다 (되감으면 다시 ✕ 가 된다)
      if(i.classList.contains('none')!==!on) i.classList.toggle('none',!on);
      const fresh = on && tCur-+t<3;
      if(i.classList.contains('fresh')!==fresh) i.classList.toggle('fresh',fresh);
      if(on && tier!=='ult') got++;   // ult 는 10레벨 칸의 사본이라 두 번 세지 않는다
    }
    let lv=1;
    if(c.levels.length){ for(const L of c.levels){ if(L.t<=tCur) lv=L.lv; else break; } }
    else if(got) lv=TIERS[got-1];
    c.lv=lv;
    if(c.lvEl && c.lvEl.textContent!==String(lv)) c.lvEl.textContent=lv;
    c.card.title = `${c.lab} · 레벨 ${lv}`;
    // 최근에 쓴 스킬
    const hot=new Set();
    for(const k of c.casts){ if(k.t<=tCur && tCur-k.t<CAST_HOLD) hot.add(k.link); }
    for(const s of c.slots){
      const on=hot.has(s.link);
      if(s.el.classList.contains('hot')!==on) s.el.classList.toggle('hot',on);
    }
    const casting = hot.size>0;
    if(c.card.classList.contains('cast')!==casting) c.card.classList.toggle('cast',casting);
  }
  fillStats();
  updateScore();
}

/* 수치 칸 채우기 — 탭 없이 한 줄에 다 보여 준다.
   시각을 따라 변하는 값(관여·데스·미니언·구슬·APM·사망)과 경기 최종값
   (영웅 피해·공성 피해)을 섞어 놓되, 최종값은 «끝» 표시로 구분한다. */
const STAT_CELLS = [
  { k:'td',    ko:'관여',      cls:'k' },
  { k:'death', ko:'데스',      cls:'d' },
  { k:'cs',    ko:'미니언' },
  { k:'globe', ko:'구슬' },
  { k:'apm',   ko:'APM' },
  { k:'dead',  ko:'사망',      time:true },
  { k:'hero',  ko:'영웅딜',    fin:true },
  { k:'siege', ko:'공성딜',    fin:true },
];
const kNum = v => v==null ? '-' : (v>=10000 ? (v/1000).toFixed(0)+'k'
                                : v>=1000 ? (v/1000).toFixed(1)+'k' : String(v));
const kTime = s => s ? `${Math.floor(s/60)}:${String(Math.round(s%60)).padStart(2,'0')}` : '-';

function fillStats(){
  if(!G || !plCards.length) return;
  const kda = kdaAt();
  const min = Math.max(1, Math.floor(tCur/60));
  const sc  = (G.raw && G.raw.score) || {};
  const idx = {};                       // 라벨 -> 점수표에서의 자리
  Object.keys(G.players).forEach((k,i)=>{
    const p=G.players[k]; idx[`${p.name}(${p.hero})`]=i;
  });
  for(const c of plCards){
    const v = kda[c.lab] || {td:0,d:0};
    // 그때까지 잡은 것 · 주운 구슬 (되감으면 그 시각까지의 값)
    let cs=0, globe=0;
    for(const k of ((G.raw&&G.raw.kill_anchors||{})[c.lab]||[])){
      if(k[0]>tCur) break;
      if(k[3]==='minion') cs++;
    }
    for(const t of ((G.raw&&G.raw.globes||{})[c.lab]||[])){ if(t>tCur) break; globe++; }
    const b=(G.apm||{})[c.lab]||{};
    let tot=0; for(const m in b){ if(+m<min) tot+=b[m]; }
    const i = idx[c.lab];
    const val = {
      td: v.td, death: v.d, cs, globe,
      apm: Math.round(tot/min), dead: deadSecs(c.hh),
      hero:  i!=null ? (sc.HeroDamage||[])[i]  : null,
      siege: i!=null ? (sc.SiegeDamage||[])[i] : null,
    };
    let h='';
    for(const s of STAT_CELLS){
      const raw = val[s.k];
      if(s.fin && raw==null) continue;
      h += `<s class="${s.fin?'fin':''}" title="${s.ko}${s.fin?' — 경기 최종값 (되감아도 안 바뀐다)':''}">`
         + `<b class="${s.cls||''}">${s.time?kTime(raw):kNum(raw)}</b><em>${s.ko}</em></s>`;
    }
    if(c.kda.innerHTML!==h) c.kda.innerHTML=h;
  }
}

/* 가운데 점수 기둥 + 접었을 때의 한 줄 요약 */
const tClock=document.getElementById('tClock');
const tClockSub=document.getElementById('tClockSub');
const tLv=[document.getElementById('tLv0'),document.getElementById('tLv1')];
const tK=[document.getElementById('tK0'),document.getElementById('tK1')];
const tS=[document.getElementById('tS0'),document.getElementById('tS1')];
const bdMini=document.getElementById('bdMini');
/* 앞서는 쪽만 팀 색으로 켠다 (레퍼런스의 StatRow lead 표시) */
function setPair(els, v){
  for(let i=0;i<2;i++){
    if(els[i].textContent!==String(v[i])) els[i].textContent=v[i];
    els[i].classList.toggle('lead', v[i]>v[1-i]);
  }
}
function updateScore(){
  if(!G) return;
  tClock.textContent = fmtT(tCur);
  tClockSub.textContent = '/ ' + fmtT(G.maxT||0);
  // 팀 레벨은 경험치 표본이 정확하다. 없으면 선수 최고 레벨로 어림한다.
  const lv=[1,1];
  for(const r of (G.teamXp||[])) if(r.t<=tCur) lv[r.team]=r.lv;
  const lvGuess = !(G.teamXp||[]).length;    // 경험치 기록이 없으면 선수 레벨로 어림한다
  if(lvGuess)
    for(const c of plCards) lv[c.hh.team===1?1:0]=Math.max(lv[c.hh.team===1?1:0], c.lv||1);
  for(const el of tLv){ el.classList.toggle('est', lvGuess);
    if(lvGuess) el.title = EST_WHY.lvfall; }
  const k=[0,0], s=[0,0];
  for(const e of G.evs){
    if(e.t>tCur) break;
    const cat=CAT(e), tm=eventTeam(e,G.players);
    if(tm!==0&&tm!==1) continue;
    if(cat==='kill') k[tm]++;
    // 건물 수는 하단 타임라인에 찍히는 것과 같게 센다 — 성벽·성문·우물까지 세면
    // 화면의 표식 개수와 숫자가 어긋나 보인다
    else if(cat==='struct' && (typeof structKind!=='function' || structKind(e.UnitType||e.unit).big)) s[tm]++;
  }
  setPair(tLv,lv); setPair(tK,k); setPair(tS,s);
  // 다음 레벨까지 남은 경험치 (문턱값은 표본에서 뽑은 추정치라 «약» 이다)
  const cur=[null,null];
  for(const r of (G.teamXp||[])) if(r.t<=tCur) cur[r.team]=r;
  for(let i=0;i<2;i++){
    const need = (typeof lvXp==='function') ? lvXp(lv[i]+1) : null;
    const now = cur[i] ? cur[i].minion+cur[i].creep+cur[i].hero+cur[i].struct+cur[i].trickle : null;
    tLv[i].title = (need!=null && now!=null)
      ? `${i+1}팀 레벨 ${lv[i]} · 경험치 ${Math.round(now).toLocaleString()}\n`
        +`레벨 ${lv[i]+1} 까지 약 ${Math.max(0,Math.round(need-now)).toLocaleString()} (문턱 약 ${need.toLocaleString()}+)`
      : `${i+1}팀 레벨 ${lv[i]}`;
  }
  // 접었을 때 쓰는 한 줄 요약. 내용이 바뀔 때만 다시 쓴다 —
  // 매 프레임 innerHTML 을 갈면 노드 13개를 초당 60번 새로 만든다.
  const mini =
    `<b class="b">${lv[0]}</b><i>렙</i><b class="b">${k[0]}</b><i>킬</i><b class="b">${s[0]}</b><i>건물</i>`+
    `<span class="cl">${fmtT(tCur)}</span>`+
    `<b class="r">${s[1]}</b><i>건물</i><b class="r">${k[1]}</b><i>킬</i><b class="r">${lv[1]}</b><i>렙</i>`;
  if(bdMini.innerHTML!==mini) bdMini.innerHTML=mini;
}

/* ---- 스코어보드 접기: 펼침 → 한 줄 → 숨김 → 펼침 ---- */
const boardEl=document.getElementById('board');
const bdTgl=document.getElementById('bdTgl');
/* 리플레이를 열면 «한 줄» 로 시작한다 — 1366x768 같은 노트북에서 스코어보드를
   펼친 채로 두면 지도 칸이 289px 밖에 안 남아 전장이 우표만 해진다.
   자세히 볼 때만 ⌄ 또는 Tab 으로 펼친다. */
let boardState=1;                          // 0 펼침 · 1 한 줄 · 2 숨김
function setBoardState(s){
  boardState=(s+3)%3;
  boardEl.classList.toggle('mini', boardState===1);
  document.body.classList.toggle('board-off', boardState===2);
  bdTgl.textContent = boardState===0 ? '⌄' : '⌃';
  bdTgl.title = ['스코어보드 한 줄로 (Tab)','스코어보드 숨기기 (Tab)','스코어보드 펼치기 (Tab)'][boardState];
  // 스테이지 크기가 바뀌었으니 오버레이를 다시 맞춘다
  requestAnimationFrame(()=>{ resizeOverlay(); if(typeof drawXp==='function') drawXp(); });
}
bdTgl.onclick=()=>setBoardState(boardState+1);
setBoardState(boardState);
