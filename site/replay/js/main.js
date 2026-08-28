/* ================= 조립: 모드 · 재생 루프 · 컨트롤 · 로드 · 부트 ================= */

/* --- 상단 모드 탭 ---
   'map'    지도만 본다. 재생바·로그를 감추고 리플레이 표기도 그리지 않는다.
   'replay' 리플레이를 재생한다. 리플레이의 전장으로 배경을 되돌린다. */
let uiMode='map';
let repSlug=null;                 // 지금 열린 리플레이의 전장 (맵 보기에서 딴 맵을 봐도 기억)
function setUIMode(m){
  uiMode=m;
  document.body.classList.toggle('mode-map', m==='map');
  document.body.classList.toggle('mode-replay', m==='replay');
  document.querySelectorAll('#modebar .tab').forEach(b=>
    b.classList.toggle('on', b.dataset.mode===m));
  if(m==='replay'){
    // 맵 보기에서 다른 전장을 구경했다면 리플레이의 전장으로 되돌린다
    if(G && repSlug && repSlug!==curMapSlug) loadMapBySlug(repSlug);
    setMapLock(!!(G && repSlug));
  }else{
    playing=false; playBtn.textContent='▶ 재생';
    setMapLock(false);                       // 맵 보기에서는 전장을 자유롭게 고른다
  }
  logCount=-1; markDirty();
  // 패널이 접혔다 펴지므로 오버레이 크기와 화면 맞춤을 다시 잡는다
  requestAnimationFrame(()=>{ resizeOverlay(); fit(); });
}
document.querySelectorAll('#modebar .tab').forEach(b=>
  b.onclick=()=>setUIMode(b.dataset.mode));

/* 조용히 죽는 것을 막는 그물.
   이번에 «재생을 눌러도 아무 일이 없다» 의 원인이 부팅 중 ReferenceError 였는데,
   화면에는 아무 표시도 나지 않아 찾는 데 오래 걸렸다. 첫 오류만이라도 알린다. */
let bootErrShown = false;
window.addEventListener('error', e=>{
  if(bootErrShown) return;
  bootErrShown = true;
  try{ setStatus('⚠ 오류: ' + (e.message||e) + ' — 콘솔(F12)에 자세한 내용'); }catch(_){}
});

/* --- 재생 루프 --- */
const clock=document.getElementById('clock'), seek=document.getElementById('seek'), playBtn=document.getElementById('play');
/* 재생 루프.
   예전에는 마지막 줄에서 다음 프레임을 예약했다. 그러면 갱신 함수 하나가 예외를
   던지는 순간 예약이 통째로 건너뛰어져 루프가 «영영» 끊긴다. 화면에는 아무 표시도
   나지 않아서, 그때부터 재생을 눌러도 아무 일이 없는 것처럼 보인다.
   그래서 두 겹으로 막는다.
     1. 다음 프레임 예약을 finally 로 옮겨, 무슨 일이 있어도 이어지게 한다.
        예외는 삼키지 않고 한 번 화면에 알린다.
     2. 그래도 멎으면 감시견이 되살린다. 되살릴 때는 세대 번호를 올려
        예전 체인이 스스로 멈추게 한다 — 안 그러면 루프가 여러 겹 돌아
        같은 프레임을 두 번씩 그린다. */
let tickAlive = 0;                 // 마지막으로 한 프레임이 돈 시각
let loopGen = 0;                   // 살아 있어야 할 체인의 세대
let loopErrShown = false;
function startLoop(){
  const gen = ++loopGen;
  const step = ts=>{
    tickAlive = ts;
    try{ tick(ts); }
    finally{ if(gen===loopGen) requestAnimationFrame(step); }
  };
  requestAnimationFrame(step);
}
function tick(ts){
  try{
    if(playing && G){
      // 프레임 간격을 0.25초로 자른다. 파싱·탭 전환처럼 오래 멎었다가 돌아오면
      // (지금-마지막) 이 몇 초가 되고, 배속을 곱해 게임 시간이 한 번에 수십 초씩
      // 뛰어오른다 (실측: 파싱 3초 멈춤 x4 배속 = 12초 건너뜀).
      if(lastTs) tCur=Math.min(G.maxT, tCur+Math.min(0.25,(ts-lastTs)/1000)*speed);
      if(tCur>=G.maxT){playing=false;playBtn.textContent='▶ 재생';}
      needsDraw=true;
    }
    lastTs=ts;
    if(needsDraw){
      if(G && uiMode==='replay'){
        seek.value=tCur/G.maxT*100;
        clock.firstChild.textContent=fmtT(tCur);
        renderLog(); updateTeamBar(); updateTimeline(); drawXp();
        if(typeof xpPieTick==='function') xpPieTick();
        if(typeof updateSpanLive==='function') updateSpanLive();
      }
      draw();
    }
  }catch(err){
    console.error('재생 루프 오류', err);
    if(!loopErrShown){
      loopErrShown = true;
      setStatus('⚠ 화면 갱신 중 오류: ' + (err && err.message || err)
                + ' — 재생은 계속됩니다 (콘솔에 자세한 내용)');
    }
  }
}
/* 감시견 — 어떤 이유로든 루프가 멎으면 되살린다.
   창이 안 보이면 rAF 는 원래 멈추므로 그때는 따지지 않는다. */
setInterval(()=>{
  if(document.hidden) return;
  const last = tickAlive;
  requestAnimationFrame(ts=>{
    if(ts - last > 1500){          // 1.5초 넘게 한 프레임도 안 돌았다
      console.warn('재생 루프가 멎어 되살립니다');
      lastTs = 0;                  // 멈춘 만큼 게임 시간이 건너뛰지 않게
      startLoop();
    }
  });
}, 2000);
playBtn.onclick=()=>{ if(!G)return; if(tCur>=G.maxT)tCur=0;
  playing=!playing; playBtn.textContent=playing?'⏸ 정지':'▶ 재생';
  lastTs=0;                       // 누르기 직전까지 멎어 있던 시간은 재생에 안 센다
  markDirty(); };
seek.oninput=()=>{ if(G){ tCur=seek.value/100*G.maxT; logCount=-1; markDirty(); } };
document.querySelectorAll('.spd').forEach(b=>b.onclick=()=>{
  speed=+b.dataset.s;
  document.querySelectorAll('.spd').forEach(x=>x.classList.toggle('on',x===b)); });

/* --- 보정/표시 컨트롤 --- */
const calL=document.getElementById('calL'), calR=document.getElementById('calR'),
      calB=document.getElementById('calB'), calT=document.getElementById('calT');
function syncCalInputs(){ if(!cal) return;
  calL.value=cal.L; calR.value=cal.R; calB.value=cal.B; calT.value=cal.T; }
for(const [el,k] of [[calL,'L'],[calR,'R'],[calB,'B'],[calT,'T']])
  el.oninput=()=>{ if(cal){ cal[k]=+el.value; placeBg(); markDirty(); } };
document.getElementById('confTgl').onchange=e=>{ showConf=e.target.checked; markDirty(); };
document.getElementById('bgAlpha').oninput=e=>{ bgAlpha=e.target.value/100; placeBg(); };
/* 영웅 표시 크기 — 두 보기에서 뜻이 조금 다르다.
     리플레이 보기: 오버레이 초상화의 «화면 px 반지름» (확대해도 크기가 유지된다)
     맵 보기: 보드에 옮겨 놓은 영웅 말의 지름 (지도에 붙어 있어 확대하면 같이 커진다)
   같은 손잡이로 둘 다 다루도록 값을 반지름으로 통일하고, 말은 지름 = 값×2 로 맞춘다. */
const heroSzEl=document.getElementById('heroSz');
function applyHeroSize(v){
  HERO_R=v;
  heroSzEl.title='영웅 표시 크기 '+v;
  if(typeof ST!=='undefined'){
    tokSz = v*2;                         // 앞으로 놓을 말도 같은 크기로
    for(const o of ST.objs) if(o.type==='tok'&&o.hero) resizeObj(o, v*2);
  }
  markDirty();
}
heroSzEl.oninput=e=>applyHeroSize(+e.target.value);
heroSzEl.value=HERO_R;

/* 화면 글씨 크기 — css/style.css 의 모든 font-size 에 곱해지는 배율.
   px 로 적힌 스타일시트라 rem 으로는 한 번에 못 키운다. 값은 기억해 둔다. */
const uiFs=document.getElementById('uiFs'), uiFsV=document.getElementById('uiFsV');
function applyFs(pct){
  const v=Math.max(90, Math.min(150, +pct||110));
  document.documentElement.style.setProperty('--fs', (v/100).toFixed(2));
  uiFs.value=v; uiFsV.textContent=v+'%';
  try{ localStorage.setItem('hots_ui_fs', v); }catch(_){}
  // 캔버스 글씨(그래프 눈금)와 창 크기 계산도 같이 다시
  requestAnimationFrame(()=>{ resizeOverlay(); if(typeof drawXp==='function') drawXp(); });
}
uiFs.oninput=e=>applyFs(e.target.value);
applyFs((()=>{ try{ return localStorage.getItem('hots_ui_fs')||110; }catch(_){ return 110; } })());
document.getElementById('showStruct').onchange=e=>{ showStruct=e.target.checked; markDirty(); };
document.getElementById('heroIconTgl').onchange=e=>{ showHeroIcons=e.target.checked; markDirty(); };

/* --- 리플레이 로드 --- */
let unknownMap = '';           // 못 찾은 전장 이름 (없으면 빈 문자열)
function load(raw){
  unknownMap = '';
  // 경로를 계산하기 전에 지형부터 올려야 한다 (prepare 안에서 길찾기를 쓴다)
  const mm=matchMap(raw.map);
  if(mm) loadPathing(mm.slug, mm.W, mm.H); else loadPathing('', 0, 0);
  G=prepare(raw); tCur=0; playing=false; logCount=-1;
  playBtn.textContent='▶ 재생';
  document.getElementById('mapName').textContent=raw.map||'';
  const t0=[],t1=[];
  for(const k in raw.players){const p=raw.players[k];(p.team===0?t0:t1).push(p);}
  // 영웅 미니맵 아이콘 준비 (이름 -> 내장 아이콘)
  for(const lab in G.heroes){
    const h=G.heroes[lab], hd=heroByName(h.heroName);
    if(hd){ const im=new Image(); im.src='icons/'+hd.icon; im.onload=markDirty; h.img=im; }
  }
  // 맵 이름으로 배경 자동 선택 + 리플레이의 전장으로 고정
  const m=matchMap(raw.map);
  repSlug = m ? m.slug : null;
  if(m){
    setMapLock(true);
    if(m.slug!==curMapSlug) loadMapBySlug(m.slug);   // 그림틀·cal 은 여기서 잡는다
    else { cal={...bgAutoCal}; syncCalInputs(); }
  }else{
    /* 뷰어가 모르는 전장.
       예전에는 «배경이 이미 있으면» 아무것도 안 해서, 직전에 보던 전장(대개
       시작 전장인 저주받은 골짜기)이 그대로 남았다. 좌표계가 전혀 다른 지도 위에
       영웅이 찍히는데 화면에는 아무 표시도 없어서, 맞는 전장인 줄 알기 쉬웠다.
       이제는 «틀린 지도를 보여 주느니 안 보여 준다» — 배경을 걷고 리플레이 좌표에
       맞춰 틀을 다시 잡은 뒤, 어떤 이름을 못 찾았는지 화면에 알린다. */
    setMapLock(false);
    bgImg = null; curMapSlug = '';
    document.getElementById('mapSel').value = '';
    cal = { L:Math.round(G.bounds.minX), R:Math.round(G.bounds.maxX),
            B:Math.round(G.bounds.minY), T:Math.round(G.bounds.maxY) };
    setViewBounds(G.bounds); setupCanvas(); fit();
    syncCalInputs();
    unknownMap = raw.map || '(이름 없음)';
  }
  document.body.classList.add('has-replay');
  buildTeamBar(); buildTimeline();      // buildTimeline 이 구조물 주인을 정한다
  fillBoardHead(raw, t0, t1);           // 승리 팀 판정이 그 결과를 쓴다
  setUIMode('replay');            // 리플레이를 열면 바로 재생 화면으로
  markDirty(); renderLog(); updateTeamBar();
  if(unknownMap)
    setStatus(`⚠ «${unknownMap}» 은 뷰어에 없는 전장입니다 — 배경 없이 좌표만 그립니다. `
            + `위 «배경 맵» 에서 비슷한 전장을 직접 고르면 그 위에 얹힙니다.`);
}
/* 리플레이 보기에서 전장이 어긋나지 않도록 맵 선택을 잠근다.
   (맵 보기에서는 항상 풀려 있어 자유롭게 전장을 구경할 수 있다) */
function setMapLock(on){
  mapSel.disabled=on;
  mapSel.title=on?'리플레이의 전장으로 고정됨 (맵 보기에서는 자유롭게 바꿀 수 있다)':'배경 맵 선택';
}
/* 리플레이를 닫고 맵 보기로 돌아간다. 판서·핀은 그대로 둔다 */
const closeRep=document.getElementById('closeRep');
closeRep.onclick=()=>{
  G=null; repSlug=null; tCur=0; playing=false; logCount=-1;
  playBtn.textContent='▶ 재생'; seek.value=0; clock.firstChild.textContent='00:00';
  document.getElementById('mapName').textContent='';
  logEl.innerHTML='<div class="empty">리플레이를 열면 이벤트가 여기에 표시됩니다</div>';
  document.body.classList.remove('has-replay');
  buildTeamBar(); buildTimeline();
  setUIMode('map');
};
/* 지금 재생 중인 영웅 배치를 전술 보드 말로 굳힌다.
   보드 말은 맵 보기에서도 남으므로, 특정 순간의 구도를 놓고 작전을 그릴 수 있다. */
document.getElementById('snapBoard').onclick=()=>{
  if(!G) return;
  const made=[];
  const prevTeam=team, prevSel=heroSel;
  // 1) 영웅 — 살아 있으면 그 자리, 죽어 있으면 죽은 자리에 «회색» 말로
  let alive=0, dead=0;
  for(const lab in G.heroes){
    const hh=G.heroes[lab], p=posAt(hh,tCur);
    if(!p) continue;
    const hd=heroByName(hh.heroName);
    const [px,py]=proj(p.x,p.y);
    team = hh.team===1?'red':'blue';
    heroSel = hd ? {name:hh.heroName, src:'icons/'+hd.icon} : null;
    const o=addTok(px,py);
    if(p.dead){ o.dead=true; paintObj(o); o.el.title=hh.heroName+' (사망 중)'; dead++; }
    else alive++;
    made.push(o);
  }
  team=prevTeam; heroSel=prevSel;
  // 2) 이 시각까지 파괴된 구조물 — 자리에 ✕ 표식을 남긴다.
  //    (용병 캠프·정령의 우물은 «파괴»가 아니라 점령/소모라 세지 않는다)
  let st=0;
  for(const s of (G.structures||[])){
    if(!(s.deathT<=tCur)) continue;
    const m=/Core|King/.test(s.unit) ? {t:'★',c:'core',s:46}
          : /TownHall/.test(s.unit)  ? {t:'✕',c:'',    s:40}
          : /CannonTower/.test(s.unit)?{t:'✕',c:'',    s:26} : null;
    if(!m) continue;
    const [px,py]=proj(s.x,s.y);
    made.push(addMark(px,py,m.t,m.c,m.s)); st++;
  }
  // 한 번에 되돌릴 수 있게 방금 만든 것들을 한 묶음으로 바꿔 넣는다
  ST.hist.length = ST.hist.length - made.length;
  if(!made.length){ setStatus('옮길 것이 없습니다'); return; }
  ST.hist.push({t:'addmany', objs:made});
  // 보드 말은 월드 좌표계라 리플레이 보기에서는 그 위 오버레이의 영웅 아이콘에 완전히
  // 가려 보이지 않는다. 결과가 실제로 보이는 맵 보기로 넘겨 준다.
  setUIMode('map');
  setStatus(`${fmtT(tCur)} 상황을 보드로 옮겼습니다 — 영웅 ${alive}명`
    + (dead?` (사망 ${dead})`:'') + `, 파괴된 구조물 ${st}개 · Ctrl+Z 로 취소`);
};

/* 스코어보드 머리줄 — 팀 이름·전장·경기 길이·승패.
   리플레이에는 팀 이름이 없으므로 «1팀/2팀» 에 대표 영웅을 붙여 알아보게 한다. */
function fillBoardHead(raw, t0, t1){
  const name = list => list.length ? `${list.length}인 · ${list.map(p=>p.hero).slice(0,2).join('·')}…` : '';
  document.getElementById('bdName0').textContent = '1팀 ' + name(t0);
  document.getElementById('bdName1').textContent = name(t1) + ' 2팀';
  document.getElementById('bdMap').textContent = raw.map || '알 수 없는 전장';
  const mins = Math.round((G.maxT||0)/60);
  const sub=document.getElementById('bdSub');
  sub.textContent = (unknownMap ? `⚠ «${unknownMap}» 전장을 못 찾음 — 배경 없이 좌표만 · ` : '')
    + `${fmtT(G.maxT||0)} · 선수 ${(t0.length+t1.length)}명 · 이벤트 ${G.evs.length}건`;
  document.getElementById('bdMap').classList.toggle('warn', !!unknownMap);
  // 리플레이 빌드와 담아 둔 프로토콜이 다르면 값이 조용히 어긋날 수 있다.
  // 지금까지는 문제없이 읽히지만, 이상하면 여기부터 의심하도록 남겨 둔다.
  sub.title = (raw.build && raw.parser_build && raw.build !== raw.parser_build)
    ? `리플레이 빌드 ${raw.build} · 파서 빌드 ${raw.parser_build} — 다르지만 읽혔습니다`
    : `빌드 ${raw.build||'?'}`;
  // 승리 팀 — 핵이 부서진 쪽의 반대. 부서진 핵이 없으면 표시하지 않는다.
  let win = null;
  for(const e of G.evs){
    if(CAT(e)!=='struct') continue;
    if(!/Core|King/.test(e.UnitType||e.unit||'')) continue;
    const own = (typeof structOwner==='function') ? structOwner(e.x,e.y) : null;
    if(own===0||own===1) win = own===0?1:0;
  }
  document.getElementById('bdWin0').hidden = win!==0;
  document.getElementById('bdWin1').hidden = win!==1;
}
document.getElementById('boardShow').onclick=()=>setBoardState(0);
document.getElementById('evPrev').onclick=()=>jumpEvent(-1);
document.getElementById('evNext').onclick=()=>jumpEvent(1);

document.getElementById('file').onchange=async ev=>{
  const f=ev.target.files[0]; if(!f)return;
  ev.target.value='';
  try{
    if(/\.stormreplay$/i.test(f.name)){
      const raw = await parseReplay(f);
      load(raw);
      setStatus('파싱 완료: '+f.name+' — 재생을 누르세요');
    } else load(JSON.parse(await f.text()));
  }catch(err){ alert('읽기 실패: '+err.message); setStatus(''); }
};

/* --- 예제 리플레이 --- */
const sampleSel=document.getElementById('sampleSel');
// 데모는 내장 데이터라 파싱도 인터넷도 필요 없다 — file:// 에서도 된다
if(typeof DEMO_REPLAY!=='undefined' && DEMO_REPLAY){
  const o=document.createElement('option');
  o.value='__demo__'; o.textContent='데모: 저주받은 골짜기';
  sampleSel.appendChild(o);
}
// 나머지 예제는 파일을 받아 파싱해야 하므로 웹 서버로 열었을 때만 (file:// 는 fetch 불가)
if(location.protocol!=='file:' && typeof SAMPLE_DB!=='undefined'){
  for(const s of SAMPLE_DB){
    const o=document.createElement('option');
    o.value=s.file; o.textContent=`${s.ko} (${Math.round(s.kb/100)/10}MB)`;
    sampleSel.appendChild(o);
  }
}
sampleSel.onchange=async ()=>{
  const f=sampleSel.value; if(!f) return;
  sampleSel.value='';
  if(f==='__demo__'){ load(DEMO_REPLAY); setStatus('데모 리플레이 — 재생을 누르세요'); return; }
  try{
    showLoading('샘플 내려받는 중…');
    const res=await fetch(f);
    if(!res.ok) throw new Error('HTTP '+res.status);
    const blob=await res.blob();
    hideLoading();
    const raw=await parseReplay(new File([blob], f.split('/').pop()));
    load(raw);
    setStatus('파싱 완료 — 재생을 누르세요');
  }catch(err){ hideLoading(); alert('샘플 로드 실패: '+err.message); setStatus(''); }
};

/* --- 키보드 --- */
window.addEventListener('keydown',function(e){
  const typing=isTypingTarget();
  if(toolOn){
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ e.preventDefault(); undo(); return; }
    if(e.key==='Escape'){ setMode('pan'); return; }
    if((e.key==='Delete'||e.key==='Backspace')&&selObj&&!typing){ delObj(selObj,true); return; }
  }
  if(typing||!G) return;
  if(e.key==='Tab' && !e.shiftKey && document.body.classList.contains('has-replay')
     && uiMode==='replay'){ e.preventDefault(); setBoardState(boardState+1); return; }
  if(e.code==='Space'){ e.preventDefault(); playBtn.onclick(); }
  // preventDefault 가 없으면 타임라인에 포커스가 있을 때 range 기본 스텝과 겹쳐 서로 덮어쓴다
  else if(e.key==='ArrowRight'){ e.preventDefault(); tCur=Math.min(G.maxT,tCur+5); logCount=-1; markDirty(); }
  else if(e.key==='ArrowLeft'){ e.preventDefault(); tCur=Math.max(0,tCur-5); logCount=-1; markDirty(); }
});

/* --- 부트: 맵 보기로 시작한다 (리플레이를 열면 재생 모드로 바뀐다) ---
   부트가 중간에 걸려도 재생 루프만은 반드시 돌게 한다. 예전에 여기서 예외가
   나면 그 아래 startLoop() 이 통째로 건너뛰어져, 재생을 눌러도 아무 일이
   일어나지 않았다 (화면에는 아무 표시도 없었다). */
try{
  setUIMode('map');
  const START_MAP='cursed_hollow';
  const startM=MAP_DB.find(m=>m.slug===START_MAP)||MAP_DB[0];
  if(startM){ loadMapBySlug(startM.slug); syncHiResBtn(); }
}catch(err){
  console.error('초기화 오류', err);
  setStatus('⚠ 초기화 중 오류: ' + (err && err.message || err));
}
startLoop();
