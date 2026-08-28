/* ================= 구간 기록 =================
   참고: SpazzoReplayStatKit 의 «타임스탬프 기록» (Alt+2 시작 · Alt+3 끝 · Alt+1 결과).
   그 도구는 게임 안에서 도는 관전 UI라 영웅 피해량·힐량·쿨다운까지 읽지만,
   그 값들은 리플레이 파일에 «전혀» 들어 있지 않다 (스탯 이벤트 19종을 전수 확인).
   그래서 파일만으로 낼 수 있는 것 — 처치·데스·경험치·레벨·건물·용병·미니언·
   구슬·APM·사망 시간 — 을 «두 시점 사이의 변화» 로 보여 준다.

   쓰는 법: 하단 조작 막대의 ⟦ ⟧ 또는 [ ] 키로 구간 양끝을 찍고 Σ 로 연다.
   찍은 구간은 타임라인에 금색 띠로 남는다. */

let markA = null, markB = null;
/* «지금까지» 모드 — 구간을 0 ~ 재생 시각으로 잡고 재생을 따라 계속 다시 센다.
   구간 합계를 낼 수 있으면 처음부터 지금까지도 낼 수 있다는, 당연한 이야기다.
   덕분에 상단바에 안 들어가는 팀 단위 값(건물·용병·목표·경험치 항목별·레벨)도
   재생을 따라 실시간으로 오른다. */
let spanLive = false;
let spanLastT = -1;

/* 구간 안의 사건만 세기 위한 도우미 */
const inSpan = (t, a, b) => t >= a && t <= b;

/* 팀 경험치 시계열에서 «구간 동안 늘어난 양» 을 뽑는다.
   표본이 30초 간격이라 구간 양끝에 가장 가까운 표본을 쓴다 — 그래서 구간이
   30초보다 짧으면 0 이 나올 수 있다. 그 사실을 화면에 적어 둔다. */
function xpDelta(team, a, b){
  const rows = (G.teamXp || []).filter(r => r.team === team);
  if(!rows.length) return null;
  const pick = t => { let best = null; for(const r of rows){ if(r.t <= t) best = r; else break; } return best; };
  const s = pick(a), e = pick(b);
  if(!s || !e) return null;
  const d = {};
  for(const k of ['minion','creep','hero','struct','trickle'])
    d[k] = Math.max(0, Math.round(e[k] - s[k]));
  d.total = Object.values(d).reduce((x, y) => x + y, 0);
  d.lv = [s.lv, e.lv];
  d.span = [s.t, e.t];               // 실제로 쓴 표본의 시각 (요청 구간과 다를 수 있다)
  return d;
}

/* 구간 안에서 이 선수가 한 일 */
function playerSpan(lab, hh, a, b){
  const r = { cs:0, merc:0, struct:0, globe:0, td:0, death:0, dead:0, apm:0 };
  for(const k of (G.raw.kill_anchors || {})[lab] || []){
    if(!inSpan(k[0], a, b)) continue;
    if(k[3] === 'minion') r.cs++;
    else if(k[3] === 'merc') r.merc++;
    else if(k[3] === 'struct') r.struct++;
  }
  for(const t of (G.raw.globes || {})[lab] || []) if(inSpan(t, a, b)) r.globe++;
  for(const e of G.evs){
    if(e.e !== 'PlayerDeath' || !inSpan(e.t, a, b)) continue;
    if(e.player === lab) r.death++;
    if((e.killers || []).includes(lab)) r.td++;
  }
  // 죽어 있던 시간은 경로에서 직접 센다 (구간에 걸친 만큼만)
  const P = hh.path;
  if(P && P.n){
    const k0 = Math.max(0, Math.floor(a / PDT)), k1 = Math.min(P.n - 1, Math.floor(b / PDT));
    for(let k = k0; k <= k1; k++) if(P.fl[k] === 2) r.dead += PDT;
    r.dead = Math.round(r.dead);
  }
  // APM 은 분 단위 통계라 구간에 걸친 분들의 평균으로 어림한다
  const bucket = (G.apm || {})[lab] || {};
  let tot = 0, n = 0;
  for(let m = Math.floor(a / 60); m <= Math.floor(b / 60); m++){ tot += bucket[m] || 0; n++; }
  r.apm = n ? Math.round(tot / n) : 0;
  return r;
}

/* ---- 화면 ---- */
const spanModal = document.getElementById('spanModal');
const spanBody  = document.getElementById('spanBody');
const spanTitle = document.getElementById('spanTitle');

function setMark(which){
  if(!G) return;
  if(which === 'a') markA = tCur; else markB = tCur;
  if(markA != null && markB != null && markA > markB){ const t = markA; markA = markB; markB = t; }
  drawSpanBand();
  setStatus(markA != null && markB != null
    ? `구간 ${fmtT(markA)} ~ ${fmtT(markB)} (${Math.round(markB-markA)}초) — Σ 또는 \\ 로 결과를 봅니다`
    : `구간 ${which === 'a' ? '시작' : '끝'}을 ${fmtT(tCur)} 에 찍었습니다 — 반대쪽도 찍으세요`);
}
function clearMarks(){ markA = markB = null; drawSpanBand(); }

/* 타임라인에 금색 띠로 구간을 표시한다 */
function drawSpanBand(){
  const el = document.getElementById('spanBand');
  if(!el || !G || !G.maxT) return;
  if(markA == null || markB == null){ el.hidden = true; return; }
  const tr = tlRows[0].getBoundingClientRect();
  const par = document.getElementById('timeline').getBoundingClientRect();
  el.hidden = false;
  el.style.left  = (tr.left - par.left + markA / G.maxT * tr.width) + 'px';
  el.style.width = Math.max(2, (markB - markA) / G.maxT * tr.width) + 'px';
}

function openSpan(){
  if(!G) return;
  const a = spanLive ? 0 : (markA != null ? markA : 0);
  const b = spanLive ? tCur : (markB != null ? markB : tCur);
  if(b - a < 1){ setStatus('구간이 너무 짧습니다 — [ 와 ] 로 양끝을 찍으세요'); return; }
  spanTitle.textContent = spanLive
    ? `처음부터 지금까지 · 00:00 ~ ${fmtT(b)}`
    : `${fmtT(a)} ~ ${fmtT(b)}  (${Math.round(b-a)}초)`;
  spanBody.innerHTML = spanHTML(a, b);
  spanModal.hidden = false;
  spanLastT = tCur;
  document.getElementById('spanLive').classList.toggle('on', spanLive);
}
function closeSpan(){ spanModal.hidden = true; }

/* 재생 루프가 매 프레임 부른다. «지금까지» 모드일 때만, 그리고 0.5초 넘게
   움직였을 때만 다시 센다 — 매 프레임 표를 새로 만들면 재생이 무거워진다. */
function updateSpanLive(){
  if(!spanLive || spanModal.hidden || !G) return;
  if(Math.abs(tCur - spanLastT) < 0.5) return;
  spanLastT = tCur;
  spanTitle.textContent = `처음부터 지금까지 · 00:00 ~ ${fmtT(tCur)}`;
  spanBody.innerHTML = spanHTML(0, Math.max(1, tCur));
}

function spanHTML(a, b){
  const teams = [0, 1];
  const kills = [0, 0], deaths = [0, 0], structs = [0, 0], camps = [0, 0], objs = [0, 0];
  for(const e of G.evs){
    if(!inSpan(e.t, a, b)) continue;
    const cat = CAT(e), tm = eventTeam(e, G.players);
    if(tm !== 0 && tm !== 1) continue;
    if(cat === 'kill'){ kills[tm]++; deaths[1 - tm]++; }
    else if(cat === 'struct' && structKind(e.UnitType || e.unit).big) structs[tm]++;
    else if(cat === 'merc') camps[tm]++;
    else if(cat === 'obj') objs[tm]++;
  }
  const xp = teams.map(t => xpDelta(t, a, b));
  const num = v => (v == null ? '-' : v.toLocaleString());
  const row = (label, v0, v1, note) => {
    const lead = (+v0 > +v1) ? 'b' : (+v1 > +v0) ? 'r' : '';
    return `<tr><td class="v ${lead === 'b' ? 'on' : ''}">${num(v0)}</td>`
         + `<th>${label}${note ? `<em>${note}</em>` : ''}</th>`
         + `<td class="v ${lead === 'r' ? 'on' : ''}">${num(v1)}</td></tr>`;
  };
  let h = `<table class="spanteam"><thead><tr><th class="b">1팀</th><th></th><th class="r">2팀</th></tr></thead><tbody>`;
  h += row('처치', kills[0], kills[1]);
  h += row('사망', deaths[0], deaths[1]);
  // 어느 팀이 부쉈는지는 진영 위치로 추론한 값이다 (리플레이에 파괴자가 거의 없다)
  h += row(`건물${estB(EST_WHY.struct)}`, structs[0], structs[1], '포탑·요새·성채·핵');
  h += row('용병', camps[0], camps[1]);
  h += row('목표', objs[0], objs[1]);
  if(xp[0] && xp[1]){
    h += row('경험치', xp[0].total, xp[1].total, `표본 ${fmtT(xp[0].span[0])}~${fmtT(xp[0].span[1])}`);
    for(const [k, ko] of [['minion','└ 돌격병'],['creep','└ 용병'],['hero','└ 영웅 처치'],
                          ['struct','└ 구조물'],['trickle','└ 시간 경과']])
      h += row(ko, xp[0][k], xp[1][k]);
    h += row('레벨', `${xp[0].lv[0]}→${xp[0].lv[1]}`, `${xp[1].lv[0]}→${xp[1].lv[1]}`);
  }
  h += `</tbody></table>`;

  // 선수별
  const rows = [];
  for(const lab in G.heroes){
    const hh = G.heroes[lab];
    rows.push({ lab, team: hh.team === 1 ? 1 : 0, hero: hh.heroName, s: playerSpan(lab, hh, a, b) });
  }
  rows.sort((p, q) => p.team - q.team || q.s.td - p.s.td);
  h += `<table class="spanpl"><thead><tr><th>선수</th><th>관여</th><th>데스</th>`
     + `<th>미니언</th><th>용병</th><th>건물</th><th>구슬</th><th class="est" title="${EST_WHY.apm}">APM<u class="estb">추정치</u></th><th>사망</th></tr></thead><tbody>`;
  for(const r of rows){
    const hd = heroByName(r.hero);
    h += `<tr class="${r.team ? 'r' : 'b'}"><td class="nm">`
       + (hd ? `<img src="icons/${hd.icon}" alt="">` : '')
       + `<span>${r.hero}</span><em>${r.lab.replace(/\(.*\)$/, '')}</em></td>`
       + `<td>${r.s.td}</td><td>${r.s.death}</td><td>${r.s.cs}</td><td>${r.s.merc}</td>`
       + `<td>${r.s.struct}</td><td>${r.s.globe}</td><td>${r.s.apm}</td>`
       + `<td>${r.s.dead ? Math.floor(r.s.dead/60)+':'+String(r.s.dead%60).padStart(2,'0') : '-'}</td></tr>`;
  }
  h += `</tbody></table>`;
  h += `<p class="spannote">영웅 피해량·힐량·쿨다운은 리플레이 파일에 들어 있지 않습니다 —
        그 값들은 게임 안에서만 읽을 수 있어서 SpazzoReplayStatKit 은 관전 UI 로 동작합니다.
        경험치는 30초 간격 표본이라 구간이 그보다 짧으면 0 으로 나올 수 있습니다.</p>`;
  return h;
}

document.getElementById('spanA').onclick = () => setMark('a');
document.getElementById('spanB').onclick = () => setMark('b');
document.getElementById('spanGo').onclick = () => { spanLive = false; openSpan(); };
document.getElementById('spanLive').onclick = () => { spanLive = !spanLive; openSpan(); };
document.getElementById('spanClose').onclick = closeSpan;
document.getElementById('spanClear').onclick = clearMarks;
spanModal.onclick = e => { if(e.target === spanModal) closeSpan(); };
window.addEventListener('keydown', e => {
  if(!G) return;
  // 포커스가 요소가 아닐 수도 있다 (window·document). matches 를 바로 부르면 터진다.
  if(typeof isTypingTarget==='function' && isTypingTarget()) return;
  if(e.key === '[') { e.preventDefault(); setMark('a'); }
  else if(e.key === ']') { e.preventDefault(); setMark('b'); }
  else if(e.key === '\\') { e.preventDefault();
    if(spanModal.hidden){ spanLive = false; openSpan(); } else closeSpan(); }
  else if(e.key === '=' || e.key === '+') { e.preventDefault();   // 처음부터 지금까지
    spanLive = true; openSpan(); }
  else if(e.key === 'Escape' && !spanModal.hidden) { closeSpan(); e.stopPropagation(); }
});
