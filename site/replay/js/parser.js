/* ================= .StormReplay 브라우저 내 파싱 (Pyodide) =================
   js/py_bundle.js 의 파이썬 소스(mpyq + heroprotocol 계열)를 가상 FS 에 풀고
   browser_extract.extract() 로 JSON 을 뽑는다. 최초 1회만 엔진을 내려받는다. */
const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.3/full/pyodide.js';
let pyEngine = null;
const setStatus = t => { document.getElementById('calHint').textContent = t; };

async function ensurePyodide(){
  if(pyEngine) return pyEngine;
  if(typeof PY_FILES==='undefined' || !PY_FILES) throw new Error('파서가 내장되지 않은 빌드입니다');
  setStatus('Python 엔진 다운로드 중… (최초 1회, 인터넷 필요)');
  await new Promise((res,rej)=>{ const s=document.createElement('script');
    s.src=PYODIDE_URL; s.onload=res;
    s.onerror=()=>rej(new Error('Pyodide CDN 로드 실패 — 인터넷 연결을 확인하세요'));
    document.head.appendChild(s); });
  setStatus('엔진 초기화 중…');
  pyEngine = await loadPyodide();
  for(const [name,b64] of Object.entries(PY_FILES))
    pyEngine.FS.writeFile('/home/pyodide/'+name, Uint8Array.from(atob(b64), c=>c.charCodeAt(0)));
  pyEngine.runPython('import sys; sys.path.insert(0,"/home/pyodide")');
  return pyEngine;
}
async function parseReplay(file){
  const py = await ensurePyodide();
  setStatus('리플레이 파싱 중… '+file.name);
  py.FS.writeFile('/tmp/r.StormReplay', new Uint8Array(await file.arrayBuffer()));
  const json = py.runPython('import browser_extract; browser_extract.extract("/tmp/r.StormReplay")');
  return JSON.parse(json);
}
