/* ================= 재생 엔진 (순수 로직) =================
   리플레이 JSON -> 재생 가능한 형태(G)로 가공한다. DOM 을 만지지 않는다. */

function teamOf(playerLabel, players){
  for(const k in players){ const p=players[k];
    if(playerLabel === p.name + "(" + p.hero + ")" || playerLabel === p.name) return p.team; }
  return 0;
}

function prepare(raw){
  const players = raw.players;
  const label = {}; for(const k in players){ label[players[k].name] = players[k].name+"("+players[k].hero+")"; }
  const heroes = {};
  for(const lab in (raw.hero_position_tracks||{})){
    heroes[lab] = { team: teamOf(lab, players), pts: raw.hero_position_tracks[lab].map(p=>({t:p[0],x:p[1],y:p[2],src:p[3]})) };
  }
  for(const nm in (raw.movement_commands||{})){
    // 새 추출기는 트랙과 같은 «이름(영웅)» 라벨로 준다. 옛 JSON 은 «이름»뿐이라
    // 그때만 label 표로 옮긴다 (동명이인이면 옛 형식에서는 어차피 구분이 안 된다).
    const lab = heroes[nm] ? nm : (label[nm] || nm);
    if(!heroes[lab]) heroes[lab] = {team: teamOf(lab,players), pts:[]};
    for(const p of raw.movement_commands[nm]) heroes[lab].pts.push({t:p[0],x:p[1],y:p[2],src:'m'});
  }
  // 어택무브(A + 클릭) — «스킬»로 분류되지만 실제로는 거기까지 걸어가는 명령이다.
  // 실측: 8경기에서 10,014건이 나와 목적지 정보가 16% 늘어난다.
  for(const nm in (raw.attack_moves||{})){
    const lab = heroes[nm] ? nm : (label[nm] || nm);
    if(!heroes[lab]) continue;
    for(const p of raw.attack_moves[nm]) heroes[lab].pts.push({t:p[0],x:p[1],y:p[2],src:'m'});
  }
  // 스킬 조준점 — 이동 목적지가 아니라 «그때 사거리 안에 있었다»는 약한 단서
  for(const nm in (raw.ability_aims||{})){
    const lab = heroes[nm] ? nm : (label[nm] || nm);
    if(!heroes[lab]) continue;
    for(const p of raw.ability_aims[nm]) heroes[lab].pts.push({t:p[0],x:p[1],y:p[2],src:'a',link:p[3]});
  }
  let maxT = 0, minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
  for(const lab in heroes){
    heroes[lab].pts.sort((a,b)=>a.t-b.t);
    for(const p of heroes[lab].pts){ maxT=Math.max(maxT,p.t);
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y); }
  }
  const evs = (raw.timeline||[]).filter(e=>!/^EndOfGame|^PlayerSpawned$/.test(e.e));
  for(const e of evs) maxT = Math.max(maxT, e.t);
  const structures = (raw.structures||[]).map(s=>({...s, deathT:Infinity}));
  for(const e of evs){
    if(e.e!=='structure_died') continue;
    let best=null,bd=9;
    for(const s of structures){ const d=Math.hypot(s.x-e.x,s.y-e.y);
      if(d<bd && s.deathT===Infinity){bd=d;best=s;} }
    if(best) best.deathT=e.t;
  }
  // 선수별 총 경험치 (경기 종료 시점 기록)
  const xpEnd={};
  for(const e of (raw.timeline||[])) if(e.e==='EndOfGameXPBreakdown' && e.player)
    xpEnd[e.player]=(e.MinionXP||0)+(e.CreepXP||0)+(e.StructureXP||0)+(e.HeroXP||0)+(e.TrickleXP||0);
  const out = { players, heroes, evs, maxT, structures, teamXp: raw.team_xp||[],
    raw,                        // 구간 통계가 원본의 막타·구슬 목록을 그대로 쓴다
    apm: raw.apm||{}, xpEnd,
    bounds:{minX:minX-6,maxX:maxX+6,minY:minY-6,maxY:maxY+6} };
  for(const lab in heroes){
    const h = heroes[lab];
    h.path = smoothPath(buildPath(h.pts, maxT), h.pts, maxT);
    h.conf = buildConf(h.path, h.pts);     // 프레임별 «얼마나 믿을 수 있나» 0~1
    h.heroName = (lab.match(/\((.+)\)$/)||[])[1] || lab;   // 라벨 "이름(영웅)" -> 영웅
  }
  return out;
}

/* 이동 재구성. 근거의 세기 순으로 층을 쌓는다.
     1) 위치 스냅샷(s/c/r/d) — 게임이 남긴 «사실». 무조건 최우선.
     2) 이동 명령(m) — 유저가 찍은 곳. 그쪽으로 최대 이속으로 간다.
     3) 스킬 조준점(a) — 그 순간 시전자가 조준점 사거리 안에 있었다는 «약한 사실».
        멀리 벗어나 있으면 사거리 안으로 당긴다 (표본 8경기에서 평균 오차 -19.8%).
     4) 지형 — 못 가는 칸은 통과하지 못하고, 벽 건너편을 찍으면 길찾기로 돌아간다.
   원본 스냅샷이 15초 간격이라 그 사이는 어차피 추정이다. 여기서 촘촘한 격자로
   한 번 풀어 두고 posAt 에서 다시 보간하면 60fps 로 이어져 보인다. */
const PDT=0.1, SPEED=5.5, SNAP_DIST=10;
// 전투 스냅샷 보정 비율(스텝당). 한 번에 60% 를 당기면 그 프레임만 툭 튀므로
// 여러 스텝에 나눠 수렴시킨다. 0.25 면 스냅샷 간격(약 1초=10스텝)에 대부분 따라잡는다.
const CORR=0.25;
const AIM_R=7;            // 스킬 조준점 앵커의 사거리 (월드 유닛)
const F=Float32Array, U=Uint8Array;

function buildPath(pts, maxT){
  const n=Math.floor((maxT+PDT)/PDT)+1;
  const xs=new F(n), ys=new F(n), fl=new U(n);   // fl: 0=없음 1=살아있음 2=사망
  let cx=0, cy=0, has=false, tx=0, ty=0, hasT=false, dead=false, i=0;
  let sx=0, sy=0, hasS=false, sAge=0;            // 수렴 중인 전투 스냅샷 목표
  let route=null, ri=0;                          // 길찾기 경로와 진행 위치
  let lastFix=-1;                                // 마지막으로 실측 좌표를 적용한 시각
  // 첫 점이 한참 뒤에 있는 리플레이(난투 등)는 그 전 구간이 통째로 비어
  // 영웅이 안 그려졌다. 첫 위치를 시작부터 깔아 둔다.
  const first=pts.find(p=>p.src!=='m'&&p.src!=='a');
  if(first){ cx=first.x; cy=first.y; has=true; }
  const setTarget=(x,y)=>{ tx=x; ty=y; hasT=true; route=null; ri=0; };
  for(let k=0;k<n;k++){
    const t=k*PDT;
    while(i<pts.length && pts[i].t<=t){
      const p=pts[i++];
      // 새 이동 명령이 오면 스냅샷 수렴은 끝낸다 — 둘이 맞서면 교착에 빠진다(아래 참고)
      if(p.src==='m'){ setTarget(p.x,p.y); hasS=false; }
      else if(p.src==='j'){                      // 이동기(도약·돌진·점멸) — 바로 옮긴다
        if(has && !dead){ cx=p.x; cy=p.y; hasT=false; hasS=false; route=null; }
      }
      else if(p.src==='a'){                      // 스킬 조준점 — 사거리 밖이면 당긴다
        // 같은 초에 실측 스냅샷이 있었으면 그쪽이 사실이므로 건드리지 않는다
        if(has && !dead && p.t!==lastFix){
          const dx=p.x-cx, dy=p.y-cy, d=Math.hypot(dx,dy);
          if(d>AIM_R){
            const f=(d-AIM_R)/d, nx=cx+dx*f, ny=cy+dy*f;
            // 앵커도 지형을 뚫으면 안 된다 — 막혀 있으면 당기지 않는다
            if(canGo(cx,cy,nx,ny)){ cx=nx; cy=ny; route=null; }
          }
        }
      }
      else if(p.src==='s'||p.src==='r'){ cx=p.x; cy=p.y; has=true; dead=false; hasT=false; hasS=false; route=null; lastFix=p.t; }
      else if(p.src==='d'){ cx=p.x; cy=p.y; has=true; dead=true; hasT=false; hasS=false; route=null; lastFix=p.t; }
      else if(p.src==='c'){
        if(!has){ cx=p.x; cy=p.y; has=true; hasS=false; }
        else if(Math.hypot(p.x-cx,p.y-cy)>SNAP_DIST){ cx=p.x; cy=p.y; hasS=false; route=null; }
        else { sx=p.x; sy=p.y; hasS=true; sAge=0; }   // 가까우면 부드럽게 끌어당긴다
        dead=false;
      }
    }
    if(has && !dead){
      if(hasS){                                  // 스냅샷 쪽으로 조금씩 수렴
        cx+=(sx-cx)*CORR; cy+=(sy-cy)*CORR;
        if(Math.hypot(sx-cx,sy-cy)<0.05){ cx=sx; cy=sy; hasS=false; }
        // 당기는 힘(CORR*거리)과 미는 힘(SPEED*PDT)이 정확히 맞서면 거리 0.55/0.25=2.2
        // 에서 영영 안 풀린다 — 영웅이 제자리에 못박혔다가 다음 스냅샷에 순간이동했다.
        // 15스텝(1.5초)이면 수렴은 이미 98.7% 끝났으므로 여기서 끊는다.
        // 위치는 건드리지 않는다 (스냅시키면 그 자체가 순간이동이 된다).
        else if(++sAge>=15) hasS=false;
      }
      if(hasT){
        // 목적지가 벽 건너편이면 한 번만 길을 찾아 두고 그 경로를 따라간다
        if(!route && typeof findPath==='function' && !clearLine(cx,cy,tx,ty)){
          route=findPath(cx,cy,tx,ty) || false; ri=0;
        }
        // 막혔다고 명령을 곧장 버리지 않는다 — 그 자리에서 길을 다시 찾아 본다.
        // (retry 가 step 을 줄이지 않는 continue 를 2회로 묶어 무한루프를 막는다)
        let step=SPEED*PDT, retry=2;
        while(step>1e-6){
          const wp = (route && ri<route.length) ? route[ri] : [tx,ty];
          const dx=wp[0]-cx, dy=wp[1]-cy, d=Math.hypot(dx,dy);
          if(d<=step){
            if(canGo(cx,cy,wp[0],wp[1])){ cx=wp[0]; cy=wp[1]; }
            else if(retry-- > 0 && (route=repathFrom(cx,cy,tx,ty))){ ri=0; continue; }
            else { hasT=false; route=null; break; }
            step-=d;
            if(route && ri<route.length){ ri++; if(ri>=route.length){ route=null; hasT=false; break; } }
            else { hasT=false; break; }          // 목적지 도착
          }else{
            const nx=cx+dx/d*step, ny=cy+dy/d*step;
            if(canGo(cx,cy,nx,ny)){ cx=nx; cy=ny; }
            else if(retry-- > 0 && (route=repathFrom(cx,cy,tx,ty))){ ri=0; continue; }
            else { hasT=false; route=null; }
            break;
          }
        }
      }
    }
    xs[k]=cx; ys[k]=cy; fl[k]=has? (dead?2:1) : 0;
  }
  return {n,xs,ys,fl};
}

/* ── 앞뒤로 두 번 돌려 섞기 (Forward-Backward) ──────────────────────
   앞으로만 도는 시뮬은 «다음 스냅샷이 온다»는 것을 모른다. 목적지로 걸어가다가
   스냅샷을 만나야 비로소 끌려가므로 스냅샷 «직전» 구간이 늘 뒤처진다.
   시간을 뒤집어 한 번 더 돌리면 그 구간은 앵커에서 «출발»하므로 정확하다.

   다만 역방향에는 이동 명령을 넣을 수 없다 (목적지는 시간을 뒤집으면 뜻이
   달라진다). 그래서 앵커에서 멀어지면 역방향은 «다음 앵커에 서 있다»가 되어
   쓸모가 없다 — 실측으로 앵커 사이 위치에 따라 섞었더니 짧은 공백은 −45% 좋아진
   대신 긴 공백이 3배 나빠졌다. 다음 앵커까지 FB_TAU 초 안에서만 믿는다.
   실측 결과: 평균 5.29 -> 5.11 (−3.4%), p95 14.61 -> 13.25 (−9.3%). */
const FB_TAU = 6.0;
function smoothPath(P, pts, maxT){
  const n=P.n, xs=P.xs, ys=P.ys, fl=P.fl;
  // 부활(r)은 앵커로 쓰지 않는다 — 순간이동이라 «거기서 되짚는다»가 성립하지 않는다
  const hardT=[];
  for(const p of pts) if(p.src==='c'||p.src==='s'||p.src==='d') hardT.push(p.t);
  hardT.sort((a,b)=>a-b);
  if(hardT.length<2) return P;
  // 시간을 뒤집은 앵커만으로 한 번 더 (명령·조준점 없이)
  const rev=[];
  for(const p of pts) if(p.src!=='m'&&p.src!=='a') rev.push({t:maxT-p.t,x:p.x,y:p.y,src:p.src});
  rev.sort((a,b)=>a.t-b.t);
  const B=buildPath(rev, maxT);
  let hi=0;
  for(let k=0;k<n;k++){
    if(fl[k]!==1) continue;
    const kb=n-1-k;
    if(kb<0||kb>=B.n||B.fl[kb]!==1) continue;
    const t=k*PDT;
    while(hi<hardT.length && hardT[hi]<t) hi++;
    if(hi>=hardT.length) break;
    const w = 1 - (hardT[hi]-t)/FB_TAU;
    if(w<=0) continue;
    xs[k]=xs[k]*(1-w)+B.xs[kb]*w;
    ys[k]=ys[k]*(1-w)+B.ys[kb]*w;
  }
  return P;
}

/* ── 신뢰도 트랙 ────────────────────────────────────────────────────
   «이 프레임의 위치를 얼마나 믿을 수 있나»를 0~1로 매긴다. 정확도를 올리는 게
   아니라 정직해지는 장치다 — 재구성이 완벽할 수 없으므로, 확실한 구간과 짐작인
   구간을 화면에서 구분해 준다.
   실측 오차와 맞물리는 두 가지로 만든다:
     · 가장 가까운 실측 앵커까지의 시간 (홀드아웃에서 공백이 길수록 오차가 컸다)
     · 그 구간에 이동 명령이 있었나 (명령을 빼면 오차가 5.3 -> 15.5 로 뛴다) */
function buildConf(P, pts){
  const n=P.n, cf=new F(n);
  const hard=[], cmd=[];
  for(const p of pts){
    if(p.src==='c'||p.src==='s'||p.src==='d'||p.src==='r') hard.push(p.t);
    else if(p.src==='m') cmd.push(p.t);
  }
  hard.sort((a,b)=>a-b); cmd.sort((a,b)=>a-b);
  let hi=0, ci=0, lastH=-1e9, lastC=-1e9;
  for(let k=0;k<n;k++){
    const t=k*PDT;
    while(hi<hard.length && hard[hi]<=t) lastH=hard[hi++];
    while(ci<cmd.length && cmd[ci]<=t) lastC=cmd[ci++];
    const nextH = hi<hard.length ? hard[hi] : 1e9;
    const gap = Math.min(t-lastH, nextH-t);        // 가까운 쪽 앵커까지
    let c = 1/(1+gap/6);                           // 6초 떨어지면 0.5
    if(t-lastC < 3) c = Math.min(1, c+0.15);       // 최근 명령이 있으면 조금 더 믿는다
    cf[k] = P.fl[k] ? Math.max(0.15, Math.min(1, c)) : 0;
  }
  return cf;
}
/* 지형 격자가 없으면 늘 통과 (기존 동작 유지).
   스냅샷 좌표는 정수라 가끔 «벽» 칸 위에 그대로 떨어진다. 그러면 어느 쪽으로도
   못 나가 다음 스냅샷까지 15초를 그 자리에 못박혔다 (실측 8경기 4건·59.6초).
   지금 선 칸이 막혀 있으면 «갈 수 있는 칸으로 나가는 이동»은 허용해 빠져나가게
   한다. 벽 띠를 가로지르지는 못한다. */
function canGo(x0,y0,x1,y1){
  if(typeof clearLine!=='function') return true;
  if(typeof walkable==='function' && !walkable(x0,y0))
    return walkable(x1,y1) || ((x1|0)===(x0|0) && (y1|0)===(y0|0));
  return clearLine(x0,y0,x1,y1);
}
/* 격자 사이를 선형 보간해 돌려준다 — 이것이 «뚝뚝 끊김»을 없애는 핵심이다. */
function posAt(h, t){
  const P=h.path; if(!P||!P.n) return null;
  const C=h.conf;
  const f=t/PDT;
  const at=(i,dead)=>({x:P.xs[i], y:P.ys[i], dead, conf:C?C[i]:1});
  if(f<=0) return P.fl[0]? at(0, P.fl[0]===2) : null;
  const last=P.n-1;
  if(f>=last) return P.fl[last]? at(last, P.fl[last]===2) : null;
  const i=f|0, a=P.fl[i], b=P.fl[i+1];
  if(!a) return b? at(i+1, b===2) : null;
  // 사망 구간은 보간하지 않는다 (시체가 미끄러지면 이상하다)
  if(!b || a===2 || b===2) return at(i, a===2);
  const u=f-i;
  return {x:P.xs[i]+(P.xs[i+1]-P.xs[i])*u, y:P.ys[i]+(P.ys[i+1]-P.ys[i])*u,
          dead:false, conf: C ? C[i]+(C[i+1]-C[i])*u : 1};
}

/* ---- 이벤트 분류·표기 ---- */
const CAT = e=>{
  if(e.e==='PlayerDeath')return'kill';
  if(e.e==='structure_died'||e.e==='TownStructureDeath')return'struct';
  if(e.e==='JungleCampCapture')return'merc';
  if(/Tribute|Curse|Altar|Shrine|Temple|Terror|Seed|Plant|Immortal|Punisher|Payload|Doubloon|Gem|Skull|Warhead|Cannon|Blackheart|Dragon|Garden/i.test(e.e))return'obj';
  if(e.e==='LevelUp'||e.e==='TalentChosen'||e.e==='TeamLevel')return'grow';
  return 'misc';
};
const fmtT = s=>String(Math.floor(s/60)).padStart(2,'0')+":"+String(Math.floor(s%60)).padStart(2,'0');
function span(txt, team){ const c=team===0?'b':team===1?'r':'g'; return `<b class="${c}">${txt}</b>`; }
/* "이름(영웅)" 라벨 -> 영웅 아이콘을 붙인 색 라벨 */
function nameHTML(label, players){
  const t=teamOf(label,players);
  const hero=(String(label||'').match(/\((.+)\)$/)||[])[1];
  const hd=hero?heroByName(hero):null;
  const ic=hd?`<img class="li" src="icons/${hd.icon}" alt="">`:'';
  return `<b class="${t===0?'b':t===1?'r':'g'}">${ic}${label}</b>`;
}
/* 추정치 딱지 — 리플레이에 없어서 추론한 값 옆에 붙인다 */
function estB(why){ return `<u class="estb" title="${why}">추정치</u>`; }
const EST_WHY = {
  struct: '리플레이는 건물을 «누가» 부쉈는지 거의 남기지 않습니다 (실측 39건 중 4건). '
        + '건물이 붙어 있는 진영으로 부순 팀을 추론한 값입니다.',
  pos:    '위치는 15초 간격 스냅샷과 이동·조준 명령으로 되살린 값입니다. '
        + '표본 검증 오차 평균 5.1 · 중앙값 3.7 타일.',
  lvxp:   '레벨 문턱값은 리플레이에 없습니다. 표본 8판의 30초 간격 기록에서 뽑은 하한입니다.',
  pie:    '영웅별 «항목 경험치» 는 리플레이에 없습니다. 그 항목을 만든 사건 수로 나눈 비율입니다.',
  pieLive:'점수표의 경험치 기여도는 경기 최종값 하나뿐입니다. '
        + '그 시각의 항목별 팀 경험치를 사건 수 비율로 나눈 값입니다 (검증 오차 평균 2.0%p).',
  apm:    'APM 은 분 단위로만 남습니다. 구간에 걸친 분들의 평균으로 어림한 값입니다.',
  lvfall: '경험치 기록이 없어 선수들의 최고 레벨로 어림한 값입니다.',
};

function evHTML(e, players){
  const tm = v => v==null?null:(Math.round(v)===1?0:1);
  let ic='•', body='';
  switch(CAT(e)){
    case 'kill':{ ic='💀';
      body=`${nameHTML(e.player,players)} 처치됨 <span class="dim">←</span> `+
        (e.killers||[]).map(k=>nameHTML(k,players)).join(', '); break; }
    case 'struct':{
      const k=(typeof structKind==='function')?structKind(e.UnitType||e.unit)
              :{ko:(e.UnitType||e.unit||'건물').replace(/^Town/,''), ic:'🏰'};
      ic=k.ic;
      body=`<b class="g">${k.ko}</b> 파괴`
         + (e.killers && e.killers.length
              ? ` <span class="dim">←</span> `+e.killers.map(k=>nameHTML(k,players)).join(', ')
              : estB(EST_WHY.struct)); break; }
    case 'merc':{ ic='⚔️'; body=`${span((e.CampType||'용병'), tm(e.TeamID))} 점령 <span class="dim">(캠프 ${e.CampID??'?'} · ${tm(e.TeamID)===0?'1팀':'2팀'})</span>`; break; }
    case 'obj':{ ic='🪶'; body=`<b class="g">${e.e}</b>` + (e.TeamID?` <span class="dim">${tm(e.TeamID)===0?'1팀':'2팀'}</span>`:''); break; }
    case 'grow':{ ic='⬆';
      // 레벨은 팀 공통이고 특성도 같은 티어에서 갈리므로 «팀 한 줄» 로 묶어 둔다
      // (선수마다 찍으면 데모 한 판이 195줄이 된다 -> 46줄).
      if(e.e==='TeamLevel'){
        body = span((e.team?'2팀':'1팀'), e.team) + ` <b class="g">레벨 ${e.lv}</b>`
             + (e.picks.length ? ` <span class="talstrip">` + e.picks.map(p=>
                 `<span class="tp" title="${p.hero} · ${p.ko}">`
                 + (p.ic?`<img src="talents/${p.ic}.webp" alt="">`:'')
                 + `${p.hero}</span>`).join('') + `</span>` : '');
      }else{
        body = e.e==='LevelUp' ? `${nameHTML(e.player??'?',players)} <span class="dim">레벨 ${e.Level??''}</span>`
             : `${nameHTML(e.player??'?',players)} <span class="dim">특성: ${e.PurchaseName??''}</span>`;
      }
      break; }
    default:{ body=`<b class="g">${e.e}</b>`; }
  }
  return `<span class="t">${fmtT(e.t)}</span><span class="ic">${ic}</span><span>${body}</span>`;
}
