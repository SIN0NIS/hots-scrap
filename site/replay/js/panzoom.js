/* ================= 팬 / 줌 =================
   #world 전체를 CSS transform 으로 움직인다. 핀은 화면 크기를 유지하도록
   1/z 로 역보정한다. */
let z=1, ox=0, oy=0;
/* 보이는 범위를 벗어나지 않게 잡아 준다.
     축소 — 전장이 다 보이는 배율보다 더 줄이지 않는다. 그 아래로 가면 지도가
            점만 해지고 화면 대부분이 빈 바탕이 된다.
     확대 — 그 배율의 16배까지. 그 이상은 어디를 보는지 알 수 없다.
     이동 — 지도가 화면보다 작은 쪽은 가운데 고정, 큰 쪽은 가장자리가 화면 안으로
            들어오지 않게 막는다 (엉뚱한 빈 곳을 보게 되던 문제).
   기준은 «실제로 보이는 것» 이다. 배경 그림은 월드 상자(CW×CH) 밖으로 삐져나가는
   일이 흔해서 (저주받은 골짜기: 월드 0~1800 인데 그림은 -501~2301), 월드만 기준으로
   잡으면 지도 가장자리를 볼 수 없게 된다. 그래서 둘을 합친 상자를 쓴다. */
const ZOOM_MAX_MUL = 16;
function contentBox(){
  let x0=0, y0=0, x1=CW, y1=CH;
  if(bgEl && bgEl.style.display!=='none' && bgEl.style.width){
    const L=parseFloat(bgEl.style.left)||0, T=parseFloat(bgEl.style.top)||0;
    const W=parseFloat(bgEl.style.width)||0, H=parseFloat(bgEl.style.height)||0;
    if(W>0 && H>0){
      x0=Math.min(x0,L); y0=Math.min(y0,T);
      x1=Math.max(x1,L+W); y1=Math.max(y1,T+H);
    }
  }
  return {x0, y0, w:Math.max(1,x1-x0), h:Math.max(1,y1-y0)};
}
function clampView(){
  const vw=stage.clientWidth, vh=stage.clientHeight;
  if(!vw || !vh || !CW || !CH) return;
  const B=contentBox();
  const zmin=Math.min(vw/B.w, vh/B.h)*0.98;
  z = Math.max(zmin, Math.min(zmin*ZOOM_MAX_MUL, z));
  // 화면에서 내용이 차지하는 구간은 [ox + x0*z, ox + (x0+w)*z]
  const cw=B.w*z, ch=B.h*z;
  ox = cw<=vw ? (vw-cw)/2 - B.x0*z : Math.max(vw-(B.x0+B.w)*z, Math.min(-B.x0*z, ox));
  oy = ch<=vh ? (vh-ch)/2 - B.y0*z : Math.max(vh-(B.y0+B.h)*z, Math.min(-B.y0*z, oy));
}
function apply(){
  clampView();
  world.style.transform="translate("+ox+"px,"+oy+"px) scale("+z+")";
  document.getElementById('zv').textContent=Math.round(z*100)+"%";
  markDirty();                          // 영웅 표시는 줌에 맞춰 다시 그려야 한다
  if(typeof ST==='undefined') return;   // tools.js 로드 전 호출 대비 (스크립트 순서 방어)
  ST.objs.forEach(o=>{ if(o.type==='pin') o.el.style.transform="scale("+(1/z)+")"; });
}
/* 전장 전체가 들어오는 배율 = 더 줄일 수 없는 하한 */
function fitZ(){
  const B=contentBox();
  return Math.min(stage.clientWidth/B.w, stage.clientHeight/B.h)*0.98;
}
function fit(){
  z=fitZ();
  ox=(stage.clientWidth-CW*z)/2; oy=(stage.clientHeight-CH*z)/2;
  apply();
}
document.getElementById('zi').onclick=()=>{z*=1.25;apply();};
document.getElementById('zo').onclick=()=>{z/=1.25;apply();};
document.getElementById('fitb').onclick=fit;
stage.addEventListener('wheel',function(e){
  if(e.target.closest('#tbar')||e.target.closest('#tgl')||e.target.closest('#zbar'))return;
  e.preventDefault();
  const r=stage.getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;
  const k=e.deltaY<0?1.15:1/1.15;
  ox=mx-(mx-ox)*k; oy=my-(my-oy)*k; z*=k; apply();
},{passive:false});

const vpts=new Map(); let vdrag=null, vpinch=null, lastTap=0;
function vmid(){const a=[...vpts.values()];
  return {x:(a[0].x+a[1].x)/2, y:(a[0].y+a[1].y)/2,
          d:Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y)};}
stage.addEventListener('pointerdown',function(e){
  if(e.target.closest('#zbar')||e.target.closest('#tgl')||e.target.closest('#tbar')||
     e.target.closest('#trash')||e.target.closest('#quickmenu'))return;
  vpts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  stage.setPointerCapture(e.pointerId);
  if(vpts.size===2){ const m=vmid(); const r=stage.getBoundingClientRect();
    vpinch={d:m.d, x:m.x-r.left, y:m.y-r.top, z:z, ox:ox, oy:oy}; vdrag=null; return; }
  if(vpts.size===1){
    vdrag={x:e.clientX,y:e.clientY,ox:ox,oy:oy}; stage.classList.add('drag');
    const now=Date.now();
    if(now-lastTap<300){ const r=stage.getBoundingClientRect();
      const mx=e.clientX-r.left, my=e.clientY-r.top;
      const k=z<fitZ()*1.8?2.5:1/2.5;
      ox=mx-(mx-ox)*k; oy=my-(my-oy)*k; z*=k; apply();
      // 줌으로 바뀐 오프셋을 끌기 기준에 다시 넣는다. 안 하면 손가락이 조금만
      // 움직여도 줌 이전 위치로 되돌아가 화면이 튄다 (터치는 거의 항상 흔들린다).
      vdrag.ox=ox; vdrag.oy=oy; }
    lastTap=now;
  }
});
stage.addEventListener('pointermove',function(e){
  if(!vpts.has(e.pointerId))return;
  vpts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(vpinch&&vpts.size>=2){
    const m=vmid(); const k=m.d/(vpinch.d||1);
    z=vpinch.z*k;
    ox=vpinch.x-(vpinch.x-vpinch.ox)*k; oy=vpinch.y-(vpinch.y-vpinch.oy)*k;
    apply(); return;
  }
  if(!vdrag)return; ox=vdrag.ox+(e.clientX-vdrag.x); oy=vdrag.oy+(e.clientY-vdrag.y); apply();
});
function vEnd(e){ vpts.delete(e.pointerId);
  if(vpts.size<2) vpinch=null;
  if(vpts.size===0){ vdrag=null; stage.classList.remove('drag'); } }
stage.addEventListener('pointerup',vEnd);
stage.addEventListener('pointercancel',vEnd);
window.addEventListener('resize',()=>{ resizeOverlay(); fit(); });
