/* ================= 지형 통행 판정 · 길찾기 =================
   PATH_BITS(js/data_pathing.js) 는 전장별 «걸을 수 있는 칸»을 1비트/칸으로 담고 있다.
   격자는 게임 좌표 그대로라 (x, y) 를 내림하면 바로 칸 번호다.

   ※ 정확도로는 «본전 또는 약간 손해» 라는 것을 재어 두었다 (tools/evaluate.py).
       홀드아웃 표본 347개 · 단위 타일
         지형 켜고 A* 있음    평균 5.56 · p95 16.10   <- 지금 이것
         지형 아예 끔         평균 5.06 · p95 10.77
         지형 켜고 A* 없음    평균 21.92 · p95 84.81  <- 최악
     즉 지형을 쓰려면 길찾기가 반드시 있어야 하고, 그러고도 안 쓰는 편이 수치상
     조금 낫다. 그런데도 켜 두는 이유는 눈에 보이는 품질이다 — 영웅이 벽과
     낭떠러지를 뚫고 걸으면 숫자가 좋아도 바로 티가 난다.
     (격자 자체는 맞다: 실측 위치의 99.7% 가 통행 칸 위에 있다. 다만 영웅이
      15초 사이에 직선으로 걷지 않아 구간의 31.7% 가 «막힘» 으로 나오고,
      그 우회를 A* 가 메운다.) */
let WALK = null;          // {W,H,bits:Uint8Array}  — 지금 전장의 통행 격자

function loadPathing(slug, W, H){
  WALK = null; pathCache = new Map();
  if(typeof PATH_BITS==='undefined' || !PATH_BITS[slug]) return;
  const b = atob(PATH_BITS[slug]);
  const bits = new Uint8Array(b.length);
  for(let i=0;i<b.length;i++) bits[i]=b.charCodeAt(i);
  WALK = {W, H, bits};
}
function walkable(x, y){
  if(!WALK) return true;                       // 격자가 없으면 막지 않는다
  const cx=x|0, cy=y|0;
  if(cx<0||cy<0||cx>=WALK.W||cy>=WALK.H) return false;
  const i = cy*WALK.W + cx;
  return (WALK.bits[i>>3] >> (7-(i&7)) & 1) === 1;
}
/* 두 점 사이가 뚫려 있나 — 0.1칸 간격으로 훑는다.
   0.5 로 성기게 보면 simplify 가 «뚫려 있다»고 승인한 지름길을 한 걸음(0.55칸)
   단위로 다시 볼 때 거부해, 애써 찾은 경로가 중간에 통째로 버려졌다
   (실측: 경로 중간 중단 253 -> 50회, 오히려 전체 시간도 2137 -> 1793ms). */
function clearLine(x0,y0,x1,y1){
  const dx=x1-x0, dy=y1-y0, d=Math.hypot(dx,dy);
  const n=Math.ceil(d/0.1);
  for(let i=1;i<=n;i++){
    const t=i/n;
    if(!walkable(x0+dx*t, y0+dy*t)) return false;
  }
  return true;
}
/* 막힌 자리를 찍었을 때 가장 가까운 갈 수 있는 칸으로 옮긴다 */
function nearestWalkable(x,y,maxR){
  if(walkable(x,y)) return [x,y];
  const R=maxR||12;
  for(let r=1;r<=R;r++){
    for(let a=0;a<16;a++){
      const th=a/16*Math.PI*2;
      const nx=x+Math.cos(th)*r, ny=y+Math.sin(th)*r;
      if(walkable(nx,ny)) return [nx,ny];
    }
  }
  return null;
}

/* --- A* 길찾기 ---
   격자가 256x216 이라 최악에도 5만여 칸이다. 경로는 목적지가 바뀔 때만 새로
   구하고 결과를 캐시한다 (buildPath 가 미리 한 번 다 돌려 놓는 구조라 충분히 빠르다). */
const DIRS=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],
            [1,1,1.4142],[1,-1,1.4142],[-1,1,1.4142],[-1,-1,1.4142]];
// 같은 칸 -> 같은 칸 경로는 몇 번이고 다시 나온다. 캐시가 없으면 리플레이 한 판에
// A* 를 2천 번 돌려 5초 넘게 걸린다 (실측). 칸 단위로 캐시하면 대부분 재사용된다.
let pathCache = new Map();
const PATH_CACHE_MAX = 4000;
// 가까운 목표는 길을 찾지 않고 그냥 벽 앞에서 멈춘다. 어차피 곧 다음 명령이나
// 스냅샷이 온다. 실측: 이 문턱을 14 로 두면 시간 -34%, 품질은 오히려 조금 낫다.
const PATH_MIN_DIST=14;
function findPath(sx,sy,tx,ty){
  if(!WALK) return null;
  if(Math.hypot(tx-sx,ty-sy)<PATH_MIN_DIST) return null;
  if(clearLine(sx,sy,tx,ty)) return null;      // 직선으로 갈 수 있으면 길찾기 불필요
  const W=WALK.W, H=WALK.H;
  const key=((sy|0)*W+(sx|0))*1e6 + ((ty|0)*W+(tx|0));
  if(pathCache.has(key)) return pathCache.get(key);
  const r=findPathRaw(sx,sy,tx,ty);
  if(pathCache.size>=PATH_CACHE_MAX) pathCache.clear();
  pathCache.set(key,r);
  return r;
}
/* 벽에 부딪힌 자리에서의 재탐색. PATH_MIN_DIST 관문을 건너뛴다 —
   이미 막혀 있으면 목적지가 가까워도 우회로가 필요하다. */
function repathFrom(sx,sy,tx,ty){
  if(!WALK || clearLine(sx,sy,tx,ty)) return null;
  return findPathRaw(sx,sy,tx,ty);
}
function findPathRaw(sx,sy,tx,ty){
  const W=WALK.W, H=WALK.H;
  const s=nearestWalkable(sx,sy,6), t=nearestWalkable(tx,ty,14);
  if(!s||!t) return null;
  const si=(s[1]|0)*W+(s[0]|0), ti=(t[1]|0)*W+(t[0]|0);
  if(si===ti) return null;
  const g=new Float32Array(W*H).fill(Infinity);
  const prev=new Int32Array(W*H).fill(-1);
  const seen=new Uint8Array(W*H);
  // 이진 힙
  const hq=[], hv=[];
  const push=(i,f)=>{ hq.push(i); hv.push(f); let c=hq.length-1;
    while(c>0){ const p=(c-1)>>1; if(hv[p]<=hv[c]) break;
      [hq[p],hq[c]]=[hq[c],hq[p]]; [hv[p],hv[c]]=[hv[c],hv[p]]; c=p; } };
  const pop=()=>{ const top=hq[0]; const li=hq.pop(), lv=hv.pop();
    if(hq.length){ hq[0]=li; hv[0]=lv; let p=0;
      for(;;){ const l=p*2+1, r=l+1; let m=p;
        if(l<hq.length&&hv[l]<hv[m]) m=l;
        if(r<hq.length&&hv[r]<hv[m]) m=r;
        if(m===p) break;
        [hq[p],hq[m]]=[hq[m],hq[p]]; [hv[p],hv[m]]=[hv[m],hv[p]]; p=m; } }
    return top; };
  const tX=ti%W, tY=(ti/W)|0;
  const h=(i)=>{ const x=i%W, y=(i/W)|0; const dx=Math.abs(x-tX), dy=Math.abs(y-tY);
    return (dx+dy) + (1.4142-2)*Math.min(dx,dy); };
  g[si]=0; push(si, h(si));
  // 탐색 상한. 넉넉히 두면 «갈 수 없는 곳»을 찍었을 때 격자를 통째로 훑어 느려진다.
  let found=false, steps=0;
  while(hq.length && steps++ < 9000){
    const cur=pop();
    if(cur===ti){ found=true; break; }
    if(seen[cur]) continue;
    seen[cur]=1;
    const cx=cur%W, cy=(cur/W)|0;
    for(const [dx,dy,w] of DIRS){
      const nx=cx+dx, ny=cy+dy;
      if(nx<0||ny<0||nx>=W||ny>=H) continue;
      const ni=ny*W+nx;
      if(seen[ni] || !walkable(nx,ny)) continue;
      // 대각선은 양옆이 다 뚫려 있을 때만 (벽 모서리를 뚫지 않게)
      if(dx&&dy&&(!walkable(cx+dx,cy)||!walkable(cx,cy+dy))) continue;
      const ng=g[cur]+w;
      if(ng<g[ni]){ g[ni]=ng; prev[ni]=cur; push(ni, ng+h(ni)); }
    }
  }
  if(!found) return null;
  const out=[];
  for(let i=ti;i!==-1;i=prev[i]) out.push([i%W+0.5, ((i/W)|0)+0.5]);
  out.reverse();
  return simplify(out);
}
/* 꺾이지 않아도 되는 중간점을 걷어낸다 (직선으로 이어지면 건너뛴다).
   앞을 멀리까지 보면 clearLine 이 폭발하므로 창을 제한한다. */
const SIMP_LOOK=24;
function simplify(pts){
  if(pts.length<3) return pts;
  const out=[pts[0]];
  let i=0;
  while(i<pts.length-1){
    const cur=out[out.length-1];
    let j=Math.min(pts.length-1, i+SIMP_LOOK);
    while(j>i+1 && !clearLine(cur[0],cur[1],pts[j][0],pts[j][1])) j--;
    out.push(pts[j]); i=j;
  }
  return out;
}
