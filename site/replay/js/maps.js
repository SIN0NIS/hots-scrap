/* ================= 배경 맵 =================
   MAP_DB(js/data_maps.js)의 SVG 를 <img> 로 불러와 캔버스에 깐다.
   file:// 로 열어도 동작하도록 fetch 를 쓰지 않는다.
   cal(월드범위)은 매니페스트 값으로 자동 설정되고, 수동으로 미세 조정할 수 있다. */
let bgAutoCal=null;
let curMapSlug=null;

const mapSel=document.getElementById('mapSel');
(function buildMapSel(){
  const opt=(v,t)=>{const o=document.createElement('option');o.value=v;o.textContent=t;return o;};
  mapSel.appendChild(opt('','배경 맵 선택 ▾'));
  const g1=document.createElement('optgroup'); g1.label='정식 전장';
  const g2=document.createElement('optgroup'); g2.label='무작위 난투';
  for(const m of MAP_DB) (m.brawl?g2:g1).appendChild(opt(m.slug,m.ko));
  mapSel.appendChild(g1); mapSel.appendChild(g2);
})();
mapSel.onchange=()=>{ if(mapSel.value){ loadMapBySlug(mapSel.value); syncHiResBtn(); } };

/* 리플레이의 맵 이름(한/영, 샌드박스 표기 포함) -> MAP_DB 항목 */
function mapNorm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9가-힣]/g,''); }
/* 리플레이가 적어 준 전장 이름으로 내장 전장을 찾는다.
   리플레이의 m_title 은 클라이언트 언어를 따르고 «(경쟁전)» 같은 꼬리가 붙기도 한다.
   그래서 세 단계로 찾는다: 그대로 -> 괄호 꼬리를 뗀 것 -> 부분 일치. */
function matchMap(name){
  const raw = String(name||'');
  const cands = [raw, raw.replace(/[([{（【].*$/, ''), raw];
  for(const c of cands){
    const n = mapNorm(c);
    if(!n) continue;
    for(const m of MAP_DB)
      if(n===mapNorm(m.ko) || n===mapNorm(m.en) || n===mapNorm(m.slug)) return m;
  }
  const n = mapNorm(raw);
  if(!n) return null;
  for(const m of MAP_DB) if(n.includes(mapNorm(m.ko))||n.includes(mapNorm(m.en))) return m;
  return null;
}

const loadingEl=document.getElementById('loading');
function showLoading(t){ loadingEl.textContent=t; loadingEl.classList.add('show'); }
function hideLoading(){ loadingEl.classList.remove('show'); }

/* 화면에 담을 월드 범위: 전장 격자와 그림이 덮는 범위의 교집합.
   (개별 저장된 난투맵은 그림이 격자 일부만 덮으므로 교집합을 써야 여백이 안 생긴다) */
function mapViewBounds(m){
  return { minX: Math.max(0, m.cal.L), maxX: Math.min(m.W, m.cal.R),
           minY: Math.max(0, m.cal.B), maxY: Math.min(m.H, m.cal.T) };
}

/* 평소에는 가벼운 판(maps_lite, 약 0.5MB)을 쓰고, 「고화질」을 켰을 때만
   원본(maps, 약 10MB)을 받는다. 둘은 골격이 같아 정렬값을 그대로 공유한다. */
let hiRes=false;
function mapFile(m){ return (!hiRes && m.lite) ? m.lite : m.file; }

function loadMapBySlug(slug, keepView){
  const m=MAP_DB.find(x=>x.slug===slug);
  if(!m) return;
  curMapSlug=slug; mapSel.value=slug;
  loadPathing(slug, m.W, m.H);           // 이 전장의 통행 격자 (지형 충돌·길찾기용)
  const src=mapFile(m);
  const mb=(!hiRes && m.lite) ? m.liteMb : m.mb;
  showLoading(`맵 불러오는 중… ${m.ko}${mb?` (${mb}MB)`:''}`);
  const img=new Image();
  img.onload=()=>{
    if(curMapSlug!==slug || bgEl.dataset.want!==src) return;  // 그 사이 다른 것을 골랐다
    bgImg=img; bgEl.src=img.src;           // SVG 를 그대로 화면에 얹는다
    bgAutoCal={L:m.cal.L,R:m.cal.R,B:m.cal.B,T:m.cal.T};
    cal={...bgAutoCal};
    // 그림틀은 리플레이가 아니라 맵을 따른다 — 나중에 리플레이를 열어도
    // 화면이 안 흔들리고, 먼저 그려둔 판서·핀이 제자리에 남는다.
    setViewBounds(mapViewBounds(m));
    syncCalInputs(); setupCanvas(); placeBg();
    if(!keepView) fit();                   // 고화질로 바꿔 끼울 때는 보던 자리를 지킨다
    hideLoading(); markDirty();
    setStatus(G && uiMode==='replay'
      ? '배경: '+m.ko+' — 구조물 마커와 어긋나면 배경 월드범위로 미세 조정'
      : m.ko+' — 끌어서 이동 · 휠로 확대 · 🖌 도구로 전술 작성');
  };
  img.onerror=()=>{ hideLoading(); setStatus('맵 파일을 읽지 못했습니다: '+src); };
  bgEl.dataset.want=src;
  img.src=src;
}

/* --- 고화질 토글 --- */
const hiResBtn=document.getElementById('hires');
function syncHiResBtn(){
  const m=MAP_DB.find(x=>x.slug===curMapSlug);
  hiResBtn.classList.toggle('on',hiRes);
  hiResBtn.textContent=hiRes?'🔍 고화질':'🔍 고화질';
  hiResBtn.title=hiRes
    ? '원본 화질로 보는 중 — 누르면 가벼운 판으로 (빠름)'
    : `원본 화질로 보기${m&&m.mb?` (${m.mb}MB 내려받음)`:''}`;
}
hiResBtn.onclick=()=>{
  hiRes=!hiRes;
  syncHiResBtn();
  if(curMapSlug) loadMapBySlug(curMapSlug, true);   // 보던 자리를 유지한 채 갈아 끼운다
};

/* --- 직접 올린 배경 (SVG/PNG) --- */
function applyBg(url, mapW, mapH, label){
  const img=new Image();
  img.onload=()=>{ bgImg=img; bgEl.src=url;
    if(mapW && mapH){ bgAutoCal={L:0,R:mapW,B:0,T:mapH};
      cal={...bgAutoCal};
      if(!G){ setViewBounds({minX:0,maxX:mapW,minY:0,maxY:mapH}); setupCanvas(); fit(); }
      syncCalInputs();
      setStatus(`배경 자동 정렬됨: ${label??''} (${mapW}×${mapH})`); }
    else setStatus('구조물 마커가 배경의 건물과 겹치도록 X/Y 범위를 조절하세요');
    placeBg(); markDirty(); };
  img.onerror=()=>alert('이미지를 읽지 못했습니다');
  img.src=url;
}
function svgDims(text){
  const w=text.match(/data-map-w="([\d.]+)"/), h=text.match(/data-map-h="([\d.]+)"/);
  if(w&&h) return [parseFloat(w[1]), parseFloat(h[1])];
  const vb=text.match(/viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"/);
  return vb? [parseFloat(vb[1]), parseFloat(vb[2])] : [null,null];
}
document.getElementById('bgfile').onchange=async ev=>{
  const f=ev.target.files[0]; if(!f)return;
  curMapSlug=null; mapSel.value='';
  if(/\.svg$/i.test(f.name)){
    const text=await f.text();
    const [w,h]=svgDims(text);
    applyBg(URL.createObjectURL(new Blob([text],{type:'image/svg+xml'})), w, h, f.name);
  } else { bgAutoCal=null; applyBg(URL.createObjectURL(f), null, null, f.name); }
};
