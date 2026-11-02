/* HotS Scrap 위키 — 인게임 범위 UI(splat) 그리기.
   게임이 기술 버튼에 마우스를 올리거나 조준할 때 바닥에 까는 노란 범위 표시를 게임 텍스처 그대로 그린다.
   자료는 splat/ (02_뷰어/hots_skill_range/tools/export_site.py 가 만든다):
     models.json      모델별 재질(발광·마스크 텍스처와 채널, 혼합, 배율)
     hero/<id>.json   { 기술 id: { r: 기술 사거리, e: [그림 항목 …] } }
     tex/*.webp
   쓰는 법: 기술 칸에 <div class="splatbox" data-h="영웅 id" data-s="기술 id"></div> 를 두면
   화면에 들어올 때 스스로 채운다(자료가 없으면 칸이 사라지고 옛 판정 그림이 대신 보인다 — CSS :has).
   그림 항목의 fwd·side·rot 은 게임이 그 그림을 놓는 자리(HostSiteOps): 앞으로 fwd, 왼쪽으로 side, 왼쪽으로 rot° 돌림.
   합성(추정): 결과 = 바탕 × (1 − 마스크) + 틴트 × 발광 × 배율 — 겹치면 각각 최댓값, 가산 재질은 더한다. */
(function () {
  "use strict";
  const BASE = (document.currentScript && document.currentScript.src || "").replace(/splat\.js.*$/, "") + "splat/";
  const CSS = 300;                                  // 칸 한 변(px)
  const CH = { 0: -1, 1: -1, 2: 3, 3: 0, 4: 1, 5: 2 };   // LAYR 채널 → RGBA 칸 (-1 = RGB)
  const FAR = 30;
  let META = null;
  const heroes = {}, tex = {}, loading = {};
  const once = (k, fn) => loading[k] || (loading[k] = fn());

  const meta = () => once("meta", () => fetch(BASE + "models.json").then(r => r.json()).then(j => (META = j)));
  const heroData = id => once("h:" + id, () => meta().then(m => m.heroes.includes(id)
    ? fetch(BASE + "hero/" + id + ".json").then(r => r.json()) : {}).then(j => (heroes[id] = j)));

  // 밉 단계까지 — 큰 그림을 작은 칸에 찍을 때 가는 선이 끊기지 않게
  function loadTex(name) {
    return once("t:" + name, async () => {
      const im = new Image(); im.src = BASE + "tex/" + name + ".webp"; await im.decode();
      const lv = []; let w = im.width, h = im.height, from = im;
      for (;;) {
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(from, 0, 0, w, h);
        lv.push({ w, h, d: g.getImageData(0, 0, w, h).data });
        if (w <= 8 || h <= 8) break;
        from = c; w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
      }
      return (tex[name] = lv);
    });
  }

  /* st: 다이얼 상태 — th 조준 방향(시계 방향 °), dist 찍는 자리까지 거리(null = 기본), phi 끌기 방향(°), drag 끌어서 쓰는 기술 */
  function paint(ents, N, st) {
    st = st || {};
    const R = st.R || extent(ents, st), PX = N / (2 * R);
    const TH = (st.th || 0) * Math.PI / 180, PH = (st.phi || 0) * Math.PI / 180, cP = Math.cos(PH), sP = Math.sin(PH);
    const ER = new Float32Array(N * N), EG = new Float32Array(N * N), EB = new Float32Array(N * N), A = new Float32Array(N * N);
    const lod = (lv, size) => lv[Math.min(Math.floor(Math.log2(Math.max(1, lv[0].w / Math.max(1e-3, size * PX)))), lv.length - 1)];
    const S = [0, 0, 0], M = [0, 0, 0];
    function samp(t, ch, u, v, out) {
      if (!(u >= 0 && v >= 0 && u <= 1 && v <= 1)) return false;
      const x = u * (t.w - 1), y = v * (t.h - 1), x0 = x | 0, y0 = y | 0;
      const x1 = Math.min(x0 + 1, t.w - 1), y1 = Math.min(y0 + 1, t.h - 1), fx = x - x0, fy = y - y0, d = t.d;
      const a = (y0 * t.w + x0) * 4, b = (y0 * t.w + x1) * 4, c = (y1 * t.w + x0) * 4, e = (y1 * t.w + x1) * 4;
      const wa = (1 - fx) * (1 - fy), wb = fx * (1 - fy), wc = (1 - fx) * fy, we = fx * fy, k = CH[ch] ?? 3;
      if (k >= 0) out[0] = out[1] = out[2] = (d[a + k] * wa + d[b + k] * wb + d[c + k] * wc + d[e + k] * we) / 255;
      else for (let i = 0; i < 3; i++) out[i] = (d[a + i] * wa + d[b + i] * wb + d[c + i] * wc + d[e + i] * we) / 255;
      return true;
    }
    // gv: 그러데이션 발광을 반지름 비율로 읽을 때(원형 부채꼴 — 게임은 호 모양 판에 바깥으로 갈수록 밝게 입힌다)
    // 층마다 제 tile·angle 로 텍스처 좌표를 바꾼다(발광과 마스크가 따로 — 원형 부채꼴은 발광만 8배·90°).
    // 1 보다 촘촘히 깐 층은 되풀이(감싸기), 성기게 깐 층(얼음 고리 0.91)은 밖이면 비운다
    const UV = [0, 0];
    function layerUV(L, u, v) {
      if ((L.tile == null || L.tile === 1) && !L.angle) { UV[0] = u; UV[1] = v; return UV; }
      const r = (L.angle || 0) * Math.PI / 180, ca = Math.cos(r), sa = Math.sin(r), x = u - 0.5, y = v - 0.5, k = L.tile || 1;
      let a = (x * ca - y * sa) * k + 0.5, b = (x * sa + y * ca) * k + 0.5;
      if (k > 1) { a -= Math.floor(a); b -= Math.floor(b); }
      UV[0] = a; UV[1] = b; return UV;
    }
    function shade(i, o, u, v, t, gv) {
      const L = o.m.emis;
      const grad = gv != null && /gradient/.test(L.tex);
      let q = grad ? [0.5, gv] : layerUV(L, u, v);
      if (!samp(o.te, L.chan, q[0], q[1], S)) return;
      q = layerUV(o.m.mask, u, v);
      if (!samp(o.tm, o.m.mask.chan, q[0], q[1], M)) return;
      const a = (M[0] + M[1] + M[2]) / 3;
      // 발광이 밋밋한 그러데이션이면(원형 부채꼴의 가운데 재질) 마스크 모양으로 깎는다 — 안 그러면 부채꼴 전체가 빛난다
      const k = o.m.mult * (o.m.blend === 3 || /gradient/.test(o.m.emis.tex) ? a : 1);
      const r = S[0] * t[0] * k, g = S[1] * t[1] * k, b = S[2] * t[2] * k;
      if (o.m.blend === 2 || o.m.blend === 3) { ER[i] += r; EG[i] += g; EB[i] += b; return; }
      if (r > ER[i]) ER[i] = r; if (g > EG[i]) EG[i] = g; if (b > EB[i]) EB[i] = b;
      if (a > A[i]) A[i] = a;
    }
    const mats = (model, size) => (META.models[model] || []).filter(m => tex[m.emis.tex] && tex[m.mask.tex])
      .map(m => ({ m, te: lod(tex[m.emis.tex], size), tm: lod(tex[m.mask.tex], size) }));
    function eachW(cx, cy, r, fn) {
      const x0 = Math.max(0, Math.floor((cx - r + R) * PX)), x1 = Math.min(N - 1, Math.ceil((cx + r + R) * PX));
      const y0 = Math.max(0, Math.floor((cy - r + R) * PX)), y1 = Math.min(N - 1, Math.ceil((cy + r + R) * PX));
      for (let py = y0; py <= y1; py++) {
        const wy = (py + 0.5) / PX - R;
        for (let px = x0; px <= x1; px++) fn((px + 0.5) / PX - R, wy, py * N + px);
      }
    }
    const dx = 0, dy = -1;                            // 조준은 위쪽 (그림마다 제 틀에서 그린다)
    for (const e of ents) {
      // 제 틀: 앞 = 위쪽(−y). 게임이 놓는 자리만큼 옮기고 돌린다
      // 조준 방향 다이얼만큼 틀째 돌린다(rot 은 왼쪽 +, th 는 시계 방향 +)
      const rr = (e.rot || 0) * Math.PI / 180 - TH, fx = -Math.sin(rr), fy = -Math.cos(rr);   // 앞 방향
      const rx = -fy, ry = fx;                                                        // 오른쪽
      const reach = reachOf(e, st);
      // 커서를 따라가는 그림은 조준점(조준 방향으로 reach)이 기준이다
      const cur = e.cursor && e.kind !== "circle" ? reach : 0;
      const ox = Math.sin(TH) * cur + fx * (e.fwd || 0) - rx * (e.side || 0), oy = -Math.cos(TH) * cur + fy * (e.fwd || 0) - ry * (e.side || 0);
      // 끌기: 찍은 자리(제 틀의 0,−reach)를 축으로 phi 만큼 더 돌린다
      const spin = st.drag && e.anch && PH;
      const each = (cx, cy, r, fn) => {
        if (spin) { const X = cx, Y = cy + reach; cx = X * cP - Y * sP; cy = X * sP + Y * cP - reach; }
        eachW(ox + rx * cx - fx * cy, oy + ry * cx - fy * cy, r, (x, y, i) => {
          const X = x - ox, Y = y - oy;
          let lx = X * rx + Y * ry, ly = -(X * fx + Y * fy);
          if (spin) { const a = lx, b = ly + reach; lx = a * cP + b * sP; ly = -a * sP + b * cP - reach; }
          fn(lx, ly, i);
        });
      };
      // 틴트를 못 읽은 지역 그림(오르피아 압도의 아귀 · 안두인 응징)도 게임은 같은 노랑으로 칠한다(StormCustomGuideModel)
      const t = (e.tint || META.tint || [255, 255, 255]).map(c => c / 255);
      if (e.kind === "range" || e.kind === "circle") {
        const r = e.radius, cy = e.kind === "range" || e.self ? 0 : -reach, ms = mats(e.model, 2 * r);
        // turn: 조준 방향을 따라 도는 원 그림 — 그림 아래쪽이 앞이라 뒤집어 찍는다(마이에브 칼날 부채)
        const sg = e.turn ? -1 : 1;
        each(0, cy, r * 1.42, (x, y, i) => { for (const o of ms) shade(i, o, sg * x / (2 * r) + 0.5, sg * (y - cy) / (2 * r) + 0.5, t); });
      } else if (e.kind === "quad") {
        // 아주 가는 직선(겐지 표창 0.25)은 끝 조각도 그만큼 줄어 화살촉이 안 보인다 — 끝 조각은 폭 0.8 을 보장
        const w = e.width, len = e.length, p = e.parts || {}, cw = Math.max(w, 0.8), cap = Math.min(cw, len / 3), seg = [];
        if (p.center) {
          if (p.launch) seg.push([p.launch, 0, cap]);
          seg.push([p.center, p.launch ? cap : 0, p.impact ? len - cap : len]);
          if (p.impact) seg.push([p.impact, len - cap, len]);
        } else for (const m of [p.launch, p.impact]) if (m) seg.push([m, 0, len]);
        const S2 = seg.map(([m, s0, s1]) => [mats(m, w), s0, s1, m === p.center, m === p.center || !p.center ? w : cw]);
        let ox = 0, oy = 0, ax = dx, ay = dy;
        if (e.place === "perp") { ox = dy * len / 2; oy = -reach - dx * len / 2; ax = -dy; ay = dx; }
        else if (e.place === "center") { oy = -(reach - len / 2); }
        // 찍은 자리에서 시작하는 직선 — 끌어서 쓰는 기술은 그 자리에서, 게임의 Detached 직선은 폭 절반 뒤에서
        // (굴단 부패: 원 0·3·6 + 반지름 1.5 = −1.5~7.5, 데커드 호라드림 상자 6×6 은 찍은 자리가 한가운데)
        else if (e.anch) oy = -reach + (e.anch === "detached" ? w / 2 : 0);
        const bx = -ay, by = ax;
        each(ox + ax * len / 2, oy + ay * len / 2, len / 2 + cw, (x, y, i) => {
          const lx = x - ox, ly = y - oy, s = lx * ax + ly * ay, q = lx * bx + ly * by;
          if (s < 0 || s > len || Math.abs(q) > cw / 2) return;
          for (const [ms, s0, s1, mid, pw] of S2) {
            if (s < s0 || s > s1 || Math.abs(q) > pw / 2) continue;
            const u = q / pw + 0.5, v = mid ? 1 - ((s - s0) / w) % 1 : 1 - (s - s0) / (s1 - s0);
            for (const o of ms) shade(i, o, u, v, t);
          }
        });
      } else if (e.kind === "cone") {
        const Rr = e.radius, half = Math.min(e.arc, 359.9) / 2 * Math.PI / 180, base = Math.atan2(dy, dx);
        const ring = /360/.test(e.model);     // 원형 부채꼴(storm_ui_aoecone360) — 호가 가운데 원 그림이라 각을 그대로 쓴다
        const all = (META.models[e.model] || []).filter(m => tex[m.emis.tex] && tex[m.mask.tex]);
        const fill = all.filter(m => /center/i.test(m.name)).map(m => ({ m, te: lod(tex[m.emis.tex], Rr), tm: lod(tex[m.mask.tex], Rr) }));
        const edge = all.filter(m => !/center/i.test(m.name)).slice(0, 1).map(m => ({ m, te: lod(tex[m.emis.tex], Rr / 2), tm: lod(tex[m.mask.tex], Rr / 2) }));
        const P0 = 15 * Math.PI / 180, P1 = 75 * Math.PI / 180;     // 그림 속 호가 차지하는 각
        each(0, 0, Rr, (x, y, i) => {
          const r = Math.hypot(x, y); if (r > Rr) return;
          let th = Math.atan2(y, x) - base; th = Math.atan2(Math.sin(th), Math.cos(th));
          if (Math.abs(th) > half) return;
          const ph = P0 + (th + half) / (2 * half) * (P1 - P0), rho = r / Rr;
          // 원형 그림은 앞이 오른쪽(+u) — 오른쪽에 가운데 장식, 왼쪽(뒤)이 끊겨 있다
          if (ring) for (const o of fill) shade(i, o, 0.5 + 0.5 * rho * Math.cos(th), 0.5 + 0.5 * rho * Math.sin(th), t, rho);
          else for (const o of fill) shade(i, o, rho * Math.sin(ph), 1 - rho * Math.cos(ph), t);
          if (half < Math.PI * 0.99) {
            const inw = r * Math.sin(half - Math.abs(th)), al = r * Math.cos(half - Math.abs(th));
            for (const o of edge) shade(i, o, inw / (Rr / 2), 1 - al / Rr, t);
          }
        });
      } else if (e.kind === "triangle") {
        const L = e.length, hw = L * Math.tan(e.angle / 2 * Math.PI / 180), ms = mats(e.model, 2 * hw);
        each(0, -L / 2, L / 2 + hw, (x, y, i) => {
          const s = -y; if (s < 0 || s > L) return;
          for (const o of ms) shade(i, o, x / (2 * hw) + 0.5, 1 - s / L, t);   // 텍스처 위(v=0)가 먼 끝 — 직선 그림과 같다(알라라크 Q 는 밑변이 앞, 디바 매트릭스는 멀수록 넓다)
        });
      } else if (e.kind === "path") {
        /* 게임이 바닥에 안 까는 **움직이는 판정의 길**(요한나 축복받은 망치 나선 · 루나라 위습 이동) —
           자료로 잰 길을 직선 그림(시작·가운데·끝 조각)을 휘어 붙여 그린다. 점은 [오른쪽, 앞] */
        const P = e.pts, w = e.width, hw = w / 2, p = e.parts || {}, cum = [0];
        for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
        const L = cum[cum.length - 1], cap = Math.min(Math.max(w, 0.8), L / 3);
        const mC = mats(p.center, w), mL = p.launch ? mats(p.launch, w) : [], mI = p.impact ? mats(p.impact, w) : [];
        const far = Math.max(...P.map(q => Math.hypot(q[0], q[1]))) + w;
        const BX = [], BX2 = [], BY = [], BY2 = [];
        for (let k = 1; k < P.length; k++) {
          BX[k] = Math.min(P[k - 1][0], P[k][0]); BX2[k] = Math.max(P[k - 1][0], P[k][0]);
          BY[k] = Math.min(P[k - 1][1], P[k][1]); BY2[k] = Math.max(P[k - 1][1], P[k][1]);
        }
        each(0, 0, far, (x, y, i) => {
          const b = -y; let bd = hw * hw, bs = -1, bq = 0;
          for (let k = 1; k < P.length; k++) {
            const ax = P[k - 1][0], ay = P[k - 1][1];
            // 조각 상자 밖이면 건너뛴다(나선 160 조각 × 칸 전체가 다이얼을 끌 때 무겁다)
            if (x < BX[k] - hw || x > BX2[k] + hw || b < BY[k] - hw || b > BY2[k] + hw) continue;
            const vx = P[k][0] - ax, vy = P[k][1] - ay, l2 = vx * vx + vy * vy || 1;
            const tt = Math.max(0, Math.min(1, ((x - ax) * vx + (b - ay) * vy) / l2));
            const ex = x - ax - vx * tt, ey = b - ay - vy * tt, d2 = ex * ex + ey * ey;
            if (d2 <= bd) { bd = d2; bs = cum[k - 1] + tt * (cum[k] - cum[k - 1]); bq = (vx * ey - vy * ex) / Math.sqrt(l2); }
          }
          if (bs < 0) return;
          const u = -bq / w + 0.5;
          if (bs < cap && mL.length) { for (const o of mL) shade(i, o, u, 1 - bs / cap, t); }
          else if (bs > L - cap && mI.length) { for (const o of mI) shade(i, o, u, 1 - (bs - L + cap) / cap, t); }
          else for (const o of mC) shade(i, o, u, 1 - ((bs - cap) / w) % 1, t);
        });
      } else if (e.kind === "poly") {
        const P = e.verts.map(([x, y]) => [x, -y]);
        const xs = P.map(p => p[0]), fs = P.map(p => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), f0 = Math.min(...fs), f1 = Math.max(...fs);
        const ms = mats(e.model, Math.max(x1 - x0, f1 - f0));
        const inside = (a, b) => { let c = false;
          for (let i = 0, j = P.length - 1; i < P.length; j = i++)
            if ((P[i][1] > b) !== (P[j][1] > b) && a < (P[j][0] - P[i][0]) * (b - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
          return c; };
        // 보이는 그림 모델을 못 찾은 지역(데스윙 맹격)은 기본 원을 늘이면 타원이 된다 —
        // 다각형 모양 그대로 노란 테두리 + 안쪽 은은한 그늘(커서 그림과 같은 짜임)로 그린다
        const outline = !e.model || (e.region && /storm_ui_aoecursor_fantasy/.test(e.model));
        const tt = outline ? META.tint.map(c => c / 255) : t;
        const edgeDist = (a, b) => { let m = 1e9;
          for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
            const ax = P[j][0], ay = P[j][1], bx = P[i][0] - ax, by = P[i][1] - ay;
            const k = Math.max(0, Math.min(1, ((a - ax) * bx + (b - ay) * by) / (bx * bx + by * by || 1)));
            m = Math.min(m, Math.hypot(a - ax - bx * k, b - ay - by * k));
          }
          return m; };
        const lw = Math.max(0.07, 1.4 / PX);              // 선 굵기(거리) — 작은 칸에서도 1px 넘게
        each(0, 0, Math.max(...xs.map(Math.abs), ...fs.map(Math.abs)), (x, y, i) => {
          const b = -y; if (!inside(x, b)) return;
          if (!outline) { for (const o of ms) shade(i, o, (x - x0) / (x1 - x0), 1 - (b - f0) / (f1 - f0), tt); return; }
          const dd = edgeDist(x, b);
          const line = Math.max(0, 1 - dd / lw) * 1.5, shadow = 0.5 * Math.exp(-dd / 0.6);
          if (line * tt[0] > ER[i]) { ER[i] = line * tt[0]; EG[i] = line * tt[1]; EB[i] = line * tt[2]; }
          if (shadow > A[i]) A[i] = shadow;
        });
      }
    }
    return { R, ER, EG, EB, A };
  }

  const REACH = 6;
  // 찍은 자리에 놓이는 그림 — 겨냥 다이얼의 거리를 따른다
  const aimed = e => (e.kind === "circle" && !e.self) || e.anch || (e.kind === "quad" && (e.place === "perp" || e.place === "center")) || (e.cursor && e.kind !== "circle");
  const baseReach = e => e.offset && e.offset < FAR ? Math.min(REACH, e.offset) : REACH;
  const reachOf = (e, st) => st && st.dist != null && aimed(e) ? st.dist : baseReach(e);
  // 칸 크기는 다이얼을 끝까지 당겨도 그대로이게 — 거리는 최대로 잡고 잰다
  function extent(ents, st) {
    let r = 3;
    for (const e of ents) {
      const reach = st && st.maxR && aimed(e) ? st.maxR : baseReach(e);
      const sh = Math.abs(e.fwd || 0) + Math.abs(e.side || 0) + (e.cursor ? REACH : 0);
      if (e.kind === "range") r = Math.max(r, e.radius);
      else if (e.kind === "cone") r = Math.max(r, sh + e.radius);
      else if (e.kind === "circle") r = Math.max(r, (e.self ? 0 : reach) + e.radius + Math.hypot(e.fwd || 0, e.side || 0));
      else if (e.kind === "triangle") r = Math.max(r, Math.min(e.length, FAR));
      else if (e.kind === "poly") r = Math.max(r, ...e.verts.map(v => Math.hypot(v[0], v[1])));
      else if (e.kind === "path") r = Math.max(r, Math.max(...e.pts.map(v => Math.hypot(v[0], v[1]))) + e.width);
      else if (e.kind === "quad") r = Math.max(r, Math.min(FAR, (e.anch ? reach + e.length + sh : e.place === "down" ? e.length + sh : reach + e.length / 2) + (e.cursor ? REACH : 0)));
    }
    // 견줄 눈금(레이너 일반 공격)은 늘 보이게 — 범위가 작아도 칸을 그만큼은 넓힌다
    const base = META && META.refs && META.refs["레이너 일반 공격"] || 0;
    return Math.min(Math.max(r, base) + 0.8, FAR);
  }

  /* 기술 하나에 그림이 여럿이면 특성 판(variant)은 빼고 기본 판을 **다** 겹친다 — 겐지 표창 세 갈래,
     그레이메인 술병(직선 끝에서 부채꼴). 사거리 원은 하나만. 사거리 원이 없는데 기술 사거리를 알면
     게임의 사거리 그림으로 깔아 둔다(시전 거리 + 그 뒤 범위가 같이 보이게). */
  function pick(skill) {
    const list = skill.e || [];
    const base = list.filter(e => !e.variant);
    let use = base.length ? base : list.slice(0, 1);
    // 시전자에서 쏘는 직선에 붙은 '추정' 원(이름으로 찾은 탐색 범위, 사거리 없음)은 날아가는 판정 크기다
    // (리밍 마력탄 1.6) — 6 거리에 원으로 그리면 거짓이다
    if (use.some(e => e.kind === "quad" && (e.place === "down" || e.side)))
      use = use.filter(e => !(e.kind === "circle" && e.guess && (!(e.offset < FAR) || e.radius < 2)));   // 리밍 거울공 판도
    const ranges = use.filter(e => e.kind === "range"), rest = use.filter(e => e.kind !== "range");
    const out = ranges.slice(0, 1).concat(rest);
    if (!ranges.length && skill.r && META.models[META.range])
      out.unshift({ kind: "range", radius: skill.r, model: META.range, tint: META.tint, synth: true });
    /* 두 번째 단계 — 게임 그림이 사거리 원뿐인데 효과를 따라가 피해 범위를 찾았으면(아우리엘 수정 방패:
       아군 지정 → 만료되며 주위 7 폭발) 대상 자리에 겹친다. 사거리가 없으면 제 자리. */
    // 반경 1 미만은 날아가는 판정 하나의 크기(요한나 망치 0.75)라 제자리 원으로 그리면 거짓이다
    if (!rest.length && skill.a && skill.a.radius >= 1 && META.gen) {
      // 즉시 시전(가로쉬 척살)이거나 사거리 원이 곧 효과 범위면 제 자리
      const rr = skill.r || (ranges[0] && ranges[0].radius);
      const same = rr && Math.abs(rr - skill.a.radius) < 0.6;   // 사거리 원이 곧 효과 범위 — 겹쳐 그릴 것 없음
      const reach = skill.self || same ? 0 : rr;
      if (!(same && skill.self)) out.push({ kind: "circle", radius: skill.a.radius, self: !reach, offset: reach || undefined,
                 model: META.gen.circle, tint: META.tint, area: skill.a.src });
    }
    return out;
  }

  /* 게임이 범위를 안 띄우는 기술(첸 술통 부수기·아르타니스 이연격 …) — 위키 판정 도형(data-g)을
     같은 노란 UI 로 그린다. 자료로 잴 수 있는 꼴은 다 옮기고, 거리가 자료에 없는 꼴(모르는 이동)이
     섞이면 옛 그림을 남긴다(null). 자리 잡는 법은 shared/shape.js 와 같다. */
  function fromWiki(raw) {
    const w = wikiData(raw);
    if (!w) return null;
    const out = [];
    for (const g of w.g || []) {
      const es = wikiEnts(g, w);
      if (!es) return null;               // 못 그리는 꼴이 섞이면 통째로 옛 그림
      out.push(...es);
    }
    out.forEach(e => { e.fromWiki = true; });
    return out.length ? out : null;
  }
  function wikiData(raw) {
    if (!raw) return null;
    try { return JSON.parse(decodeURIComponent(raw)); } catch (e) { return null; }
  }
  const MAXD = 12;                        // 길게 가는 것은 12 까지만 그리고 숫자는 꼬리말에
  // 위키 도형 하나 → 그림 항목들. 위키 좌표는 [오른쪽, 앞], 각도는 오른쪽이 +
  function wikiEnts(g, w) {
    const G = META.gen, d = +w.d || 0, k = g["꼴"], out = [];
    const at = g["자리"] === "앞" ? (+g["거리"] || 0) : g["자리"] === "착지" ? d + (+g["거리"] || 0)
             : (g["자리"] === "원점" || g["쓸기"]) ? 0 : d;
    const fw = v => Math.min(v, MAXD * 1.25);
    // 찍은 자리(도형거리 d) 둘레에 놓이는 것은 그 자리를 기준으로 적는다 — 겨냥 다이얼로 옮겨 다닌다
    const atAim = d > 0 && !(g["자리"] === "원점" || g["자리"] === "앞" || g["쓸기"]);   // 착지(+거리) — 찍은 자리 기준
    const place = (y, o) => atAim ? Object.assign(o, { self: false, offset: d, fwd: (y - d) || undefined })
                                  : Object.assign(o, { self: true, fwd: fw(y) || undefined });
    const disc = (r, x, y, lab) => place(y, { kind: "circle", radius: r, side: x ? -x : undefined, model: G.circle, lab });
    const ring = (r, x, y, lab) => place(y, { kind: "circle", radius: r, side: x ? -x : undefined, model: META.range, lab });
    // 직선: (x, y) 에서 오른쪽으로 ang° 기운 쪽으로 길이 len.
    // 그림의 fwd·side 는 돌린 축 기준이라(게임 HostSiteOps 와 같다) 시작점을 그 축으로 옮겨 적는다
    const line = (x, y, len, wd, ang, lab) => {
      const a = (ang || 0) * Math.PI / 180, sa = Math.sin(a), ca = Math.cos(a);
      const f = x * sa + y * ca, sd = -(x * ca - y * sa);
      return { kind: "quad", place: "down", length: len, width: wd, parts: G.quad,
               side: sd || undefined, fwd: f || undefined, rot: ang ? -ang : undefined, lab };
    };
    const R = +g["반지름"] || 0;
    if (k === "원" && R > 0) {
      if (g["날아감"]) {                  // 날아가는 원 — 지나간 길 + 닿는 자리
        const D = Math.min(+g["날아감"], MAXD), r0 = g["작은"] != null ? +g["작은"] : R;
        out.push(line(0, 0, D, Math.max(2 * r0, 0.3), 0, `날아감 ${n2(+g["날아감"])}`), disc(R, 0, D));
      } else out.push(g["유지"] ? ring(R, 0, at, `유지 거리 ${n2(R)}`) : disc(R, 0, at));
    } else if (k === "직사각형" && (g["세로"] || g["길이"])) {
      const W = +(g["가로"] || 1), H = +(g["세로"] || g["길이"]), sx = +g["옆"] || 0, run = +g["쓸기"] || 0;
      if (g["각"]) {                       // X 로 엇갈리는 막대(겐지 폭렬참)
        for (const s of [1, -1]) {
          const t = s * g["각"] * Math.PI / 180;
          out.push(line(-Math.sin(t) * H / 2, at - Math.cos(t) * H / 2, H, W, s * g["각"], s > 0 ? `${n2(W)}×${n2(H)} 엇갈림` : ""));
        }
      } else if (g["향함"]) {               // 흩어져 나가는 길(겐지 수리검)
        const [tx, ty] = g["향함"];
        out.push(line(0, 0, Math.hypot(tx, ty), W, Math.atan2(tx, ty) * 180 / Math.PI));
      } else if (g["모임"] && sx) {         // 옆에서 나와 엇갈리는 길(리밍 마력탄)
        out.push(line(sx, 0, run || Math.hypot(sx, g["모임"]), W, Math.atan2(-sx, g["모임"]) * 180 / Math.PI));
      } else if (g["자리"] === "원점" && !run) {
        out.push(line(sx, g["가운데"] ? -H / 2 : 0, H, W, 0));
      } else out.push(line(sx, at - H / 2, H + run, W, 0));
    } else if (k === "다각형" && (g["점"] || []).length >= 3) {
      out.push({ kind: "poly", verts: g["점"].map(p => [p[0], -(p[1] + at)]) });
    } else if (k === "부채꼴" && R > 0) {
      const seq = g["조각방향"];
      if (seq && seq.length) {              // 휩쓰는 기술 — 휘두르는 전체 폭을 한 부채꼴로
        const wd = g["조각각"] || g["각도"] / seq.length, a0 = seq[0], a1 = seq[seq.length - 1];
        out.push({ kind: "cone", radius: R, arc: Math.min(360, Math.abs(a1 - a0) + wd), rot: -(a0 + a1) / 2, model: G.cone,
                   lab: `휩쓸기 ${n2(R)} · ${n2(Math.abs(a1 - a0) + wd)}°` });
      } else out.push({ kind: "cone", radius: R, arc: +(g["각도"] || 90), fwd: at || undefined, model: G.cone });
      if (g["안쪽"]) out.push(ring(+g["안쪽"], 0, at, `안쪽 ${n2(+g["안쪽"])} 빔`));
    } else if (k === "고리" && R > 0) {      // 가운데가 빈 고리 — 안쪽 경계를 가는 원으로
      out.push(disc(R, 0, at, `고리 ${n2(+g["안쪽"] || 0)}~${n2(R)}`), ring(+g["안쪽"] || 0.01, 0, at, ""));
    } else if (k === "튕김" && R > 0) {      // 다음 대상을 고르는 거리 — 장판이 아니라 가는 원
      out.push(ring(R, 0, at, `옮겨 붙음 ${n2(R)}${g["수"] > 1 ? ` ×${g["수"]}` : ""}`));
    } else if (k === "뿌림" && R > 0) {      // 구역 아무 데나 떨어짐 — 구역 + 몇 발
      out.push(ring(R, 0, at, `${n2(R)} 안에 무작위`));
      const hit = +g["판정"] || Math.max(0.5, R * 0.12);
      for (const [ux, uy] of [[0.42, 0.18], [-0.3, 0.55], [0.1, -0.6], [-0.62, -0.2], [0.68, -0.38]])
        out.push(disc(hit, ux * R, at + uy * R, ""));
    } else if (k === "뿌림상자" && g["가로"]) {
      const W = +g["가로"], H = +g["세로"] || 1;
      out.push({ kind: "poly", verts: [[-W / 2, 0], [W / 2, 0], [W / 2, -H], [-W / 2, -H]], lab: `${n2(W)}×${n2(H)} 안에서 흩어져 나옴` });
    } else if (k === "둘레" && R > 0) {      // 둘러싸는 담 — 둘레 + 칸마다 작은 원
      out.push(ring(R, 0, 0, `둘레 ${n2(R)}${g["수"] ? ` · ${g["수"]}칸` : ""}`));
      for (let i = 0; i < (g["수"] || 0); i++) {
        const t = i * 2 * Math.PI / g["수"];
        out.push(disc(0.5, Math.sin(t) * R, Math.cos(t) * R, ""));
      }
    } else if (k === "자리들" && (g["점"] || []).length) {
      if (g["벽"] && (g["벽선"] || []).length) {   // 담 한 장 = 직선 하나(레오릭 묘실)
        for (const [p0, p1] of g["벽선"]) {
          const vx = p1[0] - p0[0], vy = p1[1] - p0[1];
          out.push(line(p0[0], p0[1] + at, Math.max(Math.hypot(vx, vy), 0.5), 1, Math.atan2(vx, vy) * 180 / Math.PI, ""));
        }
        out[0].lab = `담 ${g["벽선"].length}장`;
      } else {
        const r = +g["판정"] || R || 0.6;
        g["점"].forEach(p => out.push(disc(r, p[0], p[1] + at, "")));
        out[0].lab = `${g["점"].length}곳`;
      }
    } else if (k === "끌기") {               // 찍은 자리에서 끌어 방향을 정함 — 화살표 하나(끌기 다이얼로 돈다)
      out.push({ kind: "quad", place: "down", anch: true, offset: d || undefined, length: Math.min(+g["거리"] || 0, MAXD) || 1,
                 width: 0.8, parts: G.quad, lab: `끌기 ${n2(+g["거리"] || 0)}` });
    } else if (k === "갈래" && g["길이"]) {
      const n = g["수"] || 1, gap = g["간격"] || 0, L = +g["길이"], half = gap * (n - 1) / 2;
      for (let i = 0; i < n; i++) {
        const a = -half + gap * i, t = a * Math.PI / 180;
        out.push(line(0, 0, L, 0.5, a, ""));
        if (R) out.push(disc(R, Math.sin(t) * L, Math.cos(t) * L, ""));
      }
      out[0].lab = `${n}갈래 ${n2(L)}`;
    } else if (k === "모아 쏘는 이동" && g["최대"]) {
      out.push({ kind: "path", pts: [[0, 0], [0, Math.min(+g["최대"], MAXD)]], width: 1, parts: G.quad, data: "move",
                 lab: `모아서 이동 ${n2(+g["최소"] || 0)}~${n2(+g["최대"])}` });
    } else if (k === "이동" && g["거리"] > 0 || k === "나선") out.push(...moving(g));
    else return null;
    out.forEach(e => { e.tint = META.tint; });
    return out;
  }

  /* 게임 UI 는 없지만 자료가 있는 움직이는 판정 — 같은 노란 직선 그림을 길 따라 휘어 붙인다.
     나선: 반지름은 자료로 잰 상한(속도 × 지속 × 바깥 몫), 도는 모양(두 바퀴)은 눈대중(shared/shape.js 와 같은 길).
     이동: 몸이 가는 길(12 까지만 그리고 숫자는 꼬리말에). */
  function moving(g) {
    const G = META.gen, out = [];
    if (g["꼴"] === "나선") {
      const R = +g["반지름"] || 3.2, r0 = Math.min(0.75, R * 0.1), turns = 2, pts = [];
      for (let k = 0; k <= 160; k++) {
        const t = k / 160, th = t * turns * 2 * Math.PI, rr = r0 + (R - r0) * t;
        pts.push([rr * Math.sin(th), rr * Math.cos(th)]);
      }
      const hit = +g["판정"] || 0.5, end = pts[pts.length - 1];
      out.push({ kind: "path", pts, width: 2 * hit, parts: G.quad, data: "spiral", R, n: g["수"] || 1 });
      out.push({ kind: "circle", radius: hit, self: true, side: -end[0], fwd: end[1], model: G.circle, data: "hit" });
    } else {
      const L = Math.min(+g["거리"], MAXD);
      out.push({ kind: "path", pts: [[0, 0], [0, L]], width: +(g["반지름"] || 0.5) * 2, parts: G.quad, data: "move", dist: +g["거리"] });
    }
    out.forEach(e => { e.tint = META.tint; });
    return out;
  }
  // 게임 그림이 있는 기술에도 게임이 안 그리는 것은 덧그린다 — 나선(요한나 축복받은 망치),
  // 옮겨 붙는 거리(스랄 연쇄 번개: 게임은 첫 대상 사거리만 띄운다)
  function extraWiki(raw, skill) {
    const w = wikiData(raw);
    if (!w) return [];
    if (!(w.d > 0) && skill && skill.r) w.d = skill.r;       // 옮겨 붙는 자리는 첫 대상(사거리 끝)
    const quad = skill && (skill.e || []).some(e => e.kind === "quad");
    // 끌기 화살표는 게임 그림에 직선이 없을 때만(라그나로스 살아 있는 유성: 원 하나뿐)
    return (w.g || []).filter(g => g["꼴"] === "나선" || g["꼴"] === "튕김" || (g["꼴"] === "끌기" && !quad))
      .flatMap(g => (wikiEnts(g, w) || []).map(e => Object.assign(e, { data: e.data || "extra" })));
  }

  /* 게임 그림이 있어도 위키 판정의 **두 번째 범위**가 빠진 것을 채운다 — 오르피아 두려움(직선 끝 원 2.5),
     들창코 노획물 투척(착지 2.75 + 더미 4.5·2). 이미 같은 크기 원이 있으면 안 그린다(±0.3).
     시전자에서 뻗는 기술이면 그 거리에 붙이고(방향 다이얼로 돈다), 찍는 기술이면 찍은 자리를 따른다.
     게임 그림이 전용 데칼 하나뿐인 직선(들창코 충격파)은 위키 가늠자 다각형(겉) 모양으로 데칼을 편다. */
  function moreWiki(ents, raw, skill, drag) {
    const w = wikiData(raw);
    if (!w || !(w.g || []).length) return ents;
    const out = ents.slice();
    // 모양만 있는 지역 부채꼴(그림 모델을 못 찾아 기본 90°)은 위키의 각도를 쓴다(안두인 응징 20°)
    out.forEach((e, i) => {
      if (e.kind !== "cone" || !e.region) return;
      const g = w.g.find(g => g["꼴"] === "부채꼴" && g["각도"] && Math.abs(g["반지름"] - e.radius) / e.radius < 0.15);
      if (g) out[i] = Object.assign({}, e, { arc: +g["각도"] });
    });
    const shell = w.g.find(g => g["꼴"] === "다각형" && g["겉"] && (g["점"] || []).length >= 3);
    if (shell) out.forEach((e, i) => {
      const p = e.parts || {};
      if (e.kind === "quad" && p.launch && !p.center && !p.impact && e.place === "down")
        out[i] = { kind: "poly", verts: shell["점"].map(q => [q[0], -q[1]]), model: p.launch, tint: e.tint, lab: `직선 ${n2(Math.max(...shell["점"].map(q => q[1])))}` };
    });
    // 사거리 원은 영웅 둘레라 찍은 자리의 원을 대신하지 못한다(들창코 들창 폭풍 사거리 2.75 ↔ 착지 2.62)
    const have = out.filter(e => e.kind === "circle").map(e => e.radius);
    // 게임 그림이 사거리 원뿐이면 대상을 찍는 기술이다(카라짐 흙의 벗) — 덧그린 원은 찍은 자리를 따른다
    const aim = drag || out.some(aimed) || !out.some(e => e.kind !== "range");
    for (const g of w.g) {
      if (g["꼴"] !== "원" || g["날아감"] || g["직격"] || !(g["반지름"] >= 1) || !(w.d > 0)) continue;
      if (g["자리"] === "원점" || g["자리"] === "앞") continue;
      if (have.some(r => Math.abs(r - g["반지름"]) < 0.3)) continue;
      have.push(+g["반지름"]);
      for (const e of wikiEnts(g, w) || []) {
        e.data = "more";
        e.lab = `범위 ${n2(e.radius)}${g["편"] === "자신" ? "(자신)" : g["편"] === "아군" ? "(아군)" : ""}`;
        // 시전자에서 뻗는 기술은 찍는 자리가 없다 — 도형거리에 못 박는다
        if (!aim && !e.self) Object.assign(e, { self: true, fwd: Math.min((e.offset || 0) + (e.fwd || 0), MAXD * 1.25), offset: undefined });
        out.push(e);
      }
    }
    return out;
  }

  const KIND = { range: "사거리", circle: "범위", quad: "직선", cone: "부채꼴", triangle: "삼각형", poly: "다각형" };
  const n2 = v => Math.round(v * 100) / 100;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  function label(e) {
    if (e.lab != null) return e.lab;
    if (e.area) return `효과 범위 ${n2(e.radius)}`;
    if (e.data === "spiral") return `나선 궤적 ~${n2(e.R)}${e.n > 1 ? ` × ${e.n}개` : ""}`;
    if (e.data === "hit") return `판정 ${n2(e.radius)}`;
    if (e.data === "move") return `이동 ${n2(e.dist)}`;
    if (e.kind === "range" || e.kind === "circle") return `${KIND[e.kind]} ${n2(e.radius)}`;
    if (e.kind === "quad") return `직선 ${n2(e.length)}×${n2(e.width)}`;
    if (e.kind === "cone") return `부채꼴 ${n2(e.radius)} · ${n2(e.arc)}°`;
    if (e.kind === "triangle") return `삼각형 ${n2(e.length)} · ${n2(e.angle)}°`;
    return KIND[e.kind];
  }

  /* 칸 하나 그리기 — 다이얼을 끄는 동안(fast)은 반 해상도로 그려 손을 안 놓치게 */
  function draw(cv, ents, st, fast) {
    const dpr = Math.min(2, window.devicePixelRatio || 1) / (fast ? 2 : 1), N = Math.round((st.css || CSS) * dpr);
    const { R, ER, EG, EB, A } = paint(ents, N, st);
    if (cv.width !== N || cv.height !== N) cv.width = cv.height = N;
    const g = cv.getContext("2d");
    // 바탕 — 어두운 판 + 거리 1 격자 (밝기 테마와 상관없이 게임 바닥처럼)
    g.fillStyle = "#1a1f27"; g.fillRect(0, 0, N, N);
    const PX = N / (2 * R);
    g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 1;
    for (let k = -Math.floor(R); k <= R; k++) {
      const p = Math.round((k + R) * PX) + 0.5;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, N); g.moveTo(0, p); g.lineTo(N, p); g.stroke();
    }
    const img = g.getImageData(0, 0, N, N), d = img.data;
    for (let i = 0; i < N * N; i++) {
      const k = i * 4, a = 1 - A[i];
      d[k] = Math.min(255, d[k] * a + ER[i] * 255);
      d[k + 1] = Math.min(255, d[k + 1] * a + EG[i] * 255);
      d[k + 2] = Math.min(255, d[k + 2] * a + EB[i] * 255);
    }
    g.putImageData(img, 0, 0);
    // 견줄 눈금 — 손으로 그릴 때 배경에 깔던 사거리(레이너 일반 공격·해머 공성 모드). 칸 안에 드는 것만
    g.save();
    g.setLineDash([4 * dpr, 4 * dpr]); g.lineWidth = dpr;
    g.font = `${10 * dpr}px system-ui, sans-serif`; g.textAlign = "right";
    for (const [nm, rv] of Object.entries(META.refs || {})) {
      if (!(rv > 0) || rv > R) continue;
      g.strokeStyle = "rgba(140,190,255,.45)";
      g.beginPath(); g.arc(N / 2, N / 2, rv * PX, 0, Math.PI * 2); g.stroke();
      const a = -Math.PI / 4, lx = N / 2 + Math.cos(a) * rv * PX, ly = N / 2 + Math.sin(a) * rv * PX;
      g.fillStyle = "rgba(160,200,255,.8)"; g.fillText(`${nm} ${rv}`, lx - 3 * dpr, ly - 3 * dpr);
    }
    g.restore();
    // 찍은 자리 — 겨냥 다이얼이 있을 때만(어디를 찍었는지)
    if (st.dist != null) {
      const ax = N / 2 + Math.sin(st.th * Math.PI / 180) * st.dist * PX, ay = N / 2 - Math.cos(st.th * Math.PI / 180) * st.dist * PX;
      g.strokeStyle = "rgba(120,190,255,.95)"; g.lineWidth = 1.5 * dpr;
      g.beginPath(); g.arc(ax, ay, 4 * dpr, 0, Math.PI * 2);
      g.moveTo(ax - 8 * dpr, ay); g.lineTo(ax - 5 * dpr, ay); g.moveTo(ax + 5 * dpr, ay); g.lineTo(ax + 8 * dpr, ay);
      g.moveTo(ax, ay - 8 * dpr); g.lineTo(ax, ay - 5 * dpr); g.moveTo(ax, ay + 5 * dpr); g.lineTo(ax, ay + 8 * dpr); g.stroke();
    }
    // 영웅 자리
    g.fillStyle = "#e6edf3"; g.beginPath(); g.arc(N / 2, N / 2, Math.max(3, 0.55 * PX), 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, N - 18 * dpr, 64 * dpr, 18 * dpr);
    g.fillStyle = "#c9d1d9"; g.font = `${11 * dpr}px system-ui, sans-serif`; g.fillText(`±${Math.round(R)}`, 5 * dpr, N - 5 * dpr);
  }

  /* ── 다이얼 — 마우스를 올려 보는 게임과 달리 폰에서도 돌려 보게 ──
     겨냥(조이스틱): 사거리 안의 한 점을 찍는 기술 — 방향과 거리를 같이 정한다.
     방향(시계): 제자리에서 쏘는 기술 — 그림을 통째로 돌린다.
     끌기(네모): 끌어서 쓰는 기술 — 찍은 자리를 축으로 끄는 방향을 정한다. */
  function setup(ents, skill, box) {
    const w = wikiData(box.dataset.g) || {};
    const st = { th: 0, phi: 0, dist: null };
    st.drag = !!box.dataset.dr || (w.g || []).some(g => g["꼴"] === "끌기");
    /* 끌어서 쓰는 기술의 직선은 **찍은 자리(사거리 안)에서 시작**해 끄는 쪽으로 뻗는다. 게임 자료의 앞 옮김
       (메이 빙벽 SOpMoveForwardBy3)은 끌기 전 안내용이라 빼야 시작점이 사거리 밖으로 밀리지 않는다 */
    if (st.drag) ents.forEach((e, i) => {
      if (e.kind === "quad" && e.place === "down" && e.offset) ents[i] = Object.assign({}, e, { anch: true, fwd: 0, side: 0 });
    });
    const rng = ents.find(e => e.kind === "range");
    const offs = ents.filter(aimed).map(e => e.offset).filter(v => v > 0 && v < FAR);
    const maxR = (rng && rng.radius < FAR && rng.radius) || (skill && skill.r < FAR && skill.r) || (offs.length ? Math.max(...offs) : 0);
    if (ents.some(aimed) && maxR > 0) {
      st.maxR = maxR;
      // 처음 자리는 예전 그림 그대로 — 게임 그림은 6 까지, 위키 도형은 그 도형거리
      st.dist = ents[0].fromWiki ? Math.min(maxR, MAXD * 1.25) : Math.min(REACH, maxR);
    }
    // 돌려 봐도 똑같은 그림(제자리 원·사거리 원뿐)은 다이얼을 안 단다
    st.turnable = ents.some(e => !(e.kind === "range" || (e.kind === "circle" && e.self && !e.fwd && !e.side)));
    st.R = extent(ents, st);
    // 넓은 그림(±12 넘게 — 메이 빙벽 ±27)은 칸을 키운다. 거리 1 이 너무 작아지지 않게, 460px 까지
    st.css = st.R > 12 ? Math.min(460, Math.round(CSS * Math.sqrt(st.R / 12))) : CSS;
    return st;
  }
  const SVGNS = 'xmlns="http://www.w3.org/2000/svg"';
  const way = th => { const h = Math.round(((th % 360) + 360) % 360 / 30) % 12; return `${h || 12}시`; };
  function dials(box, cv, ents, st) {
    if (!st.turnable && !st.drag) return;
    const row = document.createElement("div");
    row.className = "splatdial";
    const aim = st.dist != null;
    let html = "";
    if (aim) html += `<span class="sdl">겨냥</span><svg class="sda" ${SVGNS} viewBox="0 0 46 46" width="46" height="46" tabindex="0" role="slider" aria-label="겨냥 — 방향과 거리"><circle cx="23" cy="23" r="20"/><line x1="23" y1="23" x2="23" y2="3"/><circle class="k" cx="23" cy="3" r="5"/></svg><span class="sdn sdav"></span>`;
    else if (st.turnable) html += `<span class="sdl">방향</span><svg class="sdd" ${SVGNS} viewBox="0 0 44 44" width="44" height="44" tabindex="0" role="slider" aria-label="조준 방향">${[0, 90, 180, 270].map(a => `<line class="tk" x1="22" y1="4" x2="22" y2="8" transform="rotate(${a} 22 22)"/>`).join("")}<circle cx="22" cy="22" r="18"/><line class="nd" x1="22" y1="22" x2="22" y2="7"/><circle class="hb" cx="22" cy="22" r="2.5"/></svg><span class="sdn sddv"></span>`;
    if (st.drag) html += `<span class="sdl">끌기</span><svg class="sdg" ${SVGNS} viewBox="0 0 44 44" width="44" height="44" tabindex="0" role="slider" aria-label="끄는 방향"><rect x="3" y="3" width="38" height="38" rx="9"/><g class="ar"><line x1="22" y1="22" x2="22" y2="9"/><path d="M22 5 L17.5 11 L26.5 11 Z"/></g><circle class="hb" cx="22" cy="22" r="2.5"/></svg><span class="sdn sdgv"></span>`;
    html += `<button type="button" class="sdr" title="처음대로">↺</button>`;
    row.innerHTML = html;
    box.insertBefore(row, box.querySelector(".splatcap"));
    const init = { th: st.th, dist: st.dist, phi: st.phi };
    const sync = () => {
      const a = row.querySelector(".sda");
      if (a) {
        const k = 20 * st.dist / st.maxR, t = st.th * Math.PI / 180, x = 23 + Math.sin(t) * k, y = 23 - Math.cos(t) * k;
        a.querySelector("line").setAttribute("x2", x.toFixed(1)); a.querySelector("line").setAttribute("y2", y.toFixed(1));
        a.querySelector(".k").setAttribute("cx", x.toFixed(1)); a.querySelector(".k").setAttribute("cy", y.toFixed(1));
        row.querySelector(".sdav").textContent = `${way(st.th)} ${n2(st.dist)}`;
      }
      const d = row.querySelector(".sdd");
      if (d) { d.querySelector(".nd").setAttribute("transform", `rotate(${st.th} 22 22)`); row.querySelector(".sddv").textContent = way(st.th); }
      const gq = row.querySelector(".sdg");
      if (gq) { gq.querySelector(".ar").setAttribute("transform", `rotate(${st.th + st.phi} 22 22)`); row.querySelector(".sdgv").textContent = way(st.th + st.phi); }
    };
    let pend = 0, busy = false;
    const redraw = fast => {
      if (pend) cancelAnimationFrame(pend);
      pend = requestAnimationFrame(() => { pend = 0; draw(cv, ents, st, fast); });
    };
    const ang = (el, ev) => { const r = el.getBoundingClientRect(), x = ev.clientX - r.left - r.width / 2, y = ev.clientY - r.top - r.height / 2;
                               return { a: Math.atan2(x, -y) * 180 / Math.PI, k: Math.hypot(x, y) / (r.width / 2 - 3) }; };
    const snap = v => Math.round(v / 5) * 5;          // 5° 씩 — 손 떨림에 그림이 흔들리지 않게
    const set = (el, ev) => {
      const { a, k } = ang(el, ev);
      if (el.classList.contains("sda")) { st.th = snap(a); st.dist = Math.round(Math.min(1, k) * st.maxR * 4) / 4; }
      else if (el.classList.contains("sdd")) st.th = snap(a);
      else st.phi = snap(a - st.th);
      sync(); redraw(true);
    };
    for (const el of row.querySelectorAll("svg")) {
      el.addEventListener("pointerdown", ev => { busy = true; el.setPointerCapture(ev.pointerId); set(el, ev); ev.preventDefault(); });
      el.addEventListener("pointermove", ev => { if (busy && el.hasPointerCapture(ev.pointerId)) set(el, ev); });
      const up = () => { if (busy) { busy = false; redraw(false); } };
      el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
      el.addEventListener("keydown", ev => {
        const step = { ArrowLeft: -15, ArrowRight: 15 }[ev.key];
        if (step == null && !(el.classList.contains("sda") && /Arrow(Up|Down)/.test(ev.key))) return;
        ev.preventDefault();
        if (step != null) { if (el.classList.contains("sdg")) st.phi += step; else st.th += step; }
        else st.dist = Math.max(0, Math.min(st.maxR, st.dist + (ev.key === "ArrowUp" ? 0.5 : -0.5)));
        sync(); redraw(false);
      });
    }
    row.querySelector(".sdr").addEventListener("click", () => { Object.assign(st, init); sync(); redraw(false); });
    sync();
  }

  /* 특성 [적용] — '바뀌는 값' 의 «칸 A → B» 를 그림 크기에 옮긴다. 값이 A 와 같은 칸만 바꾼다
     (발라 무기고: 다발 사격 반지름 10 → 12.35). 바꾼 칸 수를 돌려준다. */
  const CHG = [[/사거리/, [["range", "radius"], ["*", "offset"]]],
               [/반지름/, [["circle", "radius"], ["cone", "radius"]]],
               [/너비|폭|가로/, [["quad", "width"]]],
               [/길이|높이|세로|거리/, [["quad", "length"], ["triangle", "length"]]],
               [/각도/, [["cone", "arc"], ["triangle", "angle"]]]];
  function applyChg(ents, chg) {
    let n = 0;
    for (const c of chg || []) {
      const m = /^(.*?)\s+(-?[\d.]+)\s*→\s*(-?[\d.]+)/.exec(String(c));
      if (!m) continue;
      const a = +m[2], b = +m[3], row = CHG.find(([rx]) => rx.test(m[1]));
      if (!row || !(a > 0) || !(b > 0)) continue;
      for (const e of ents) for (const [k, f] of row[1])
        if ((k === "*" || e.kind === k) && typeof e[f] === "number" && Math.abs(e[f] - a) < 0.02) { e[f] = b; e.tal = true; n++; }
    }
    return n;
  }
  /* 영웅 문서가 '이 기술을 바꾸는 특성' 칩을 고를 때 — 특성 판 그림이 어느 기술 것인지(특성 id → 기술 id).
     아직 안 받았으면 받고 나서 cb 를 부른다 */
  function tals(hid, cb) {
    if (heroes[hid]) return Object.fromEntries(Object.entries(heroes[hid]._t || {}).map(([k, v]) => [k, v.s]));
    heroData(hid).then(cb, () => {});
    return null;
  }

  async function fill(box) {
    box.classList.add("on");
    const hd = await heroData(box.dataset.h);
    let skill = box.dataset.t ? (hd._t || {})[box.dataset.t] : hd[box.dataset.s];
    const ta = box.dataset.ta, tf = ta && (hd._t || {})[ta];
    let tfig = false;
    if (tf && tf.s === box.dataset.s && (tf.e || []).length) { skill = tf; tfig = true; }   // 특성이 그림째 바꾸는 기술
    let ents = skill && (skill.e || []).length ? pick(skill) : fromWiki(box.dataset.g);
    if (skill && (skill.e || []).length) {
      const ex = extraWiki(box.dataset.g, skill);
      // 효과 범위로 찾은 원이 사실 옮겨 붙는 거리였으면(스랄 연쇄 번개 6) 가는 원 하나만 남긴다
      ents = ents.filter(e => !(e.area && ex.some(x => x.model === META.range && Math.abs(x.radius - e.radius) < 0.3))).concat(ex);
      ents = moreWiki(ents, box.dataset.g, skill, !!box.dataset.dr);
    }
    if (!ents || !ents.length) { box.remove(); return; }
    const tn = ta ? applyChg(ents, wikiData(box.dataset.chg)) : 0;
    const names = new Set();
    for (const e of ents) for (const m of [e.model, ...Object.values(e.parts || {})])
      for (const mt of META.models[m] || []) { names.add(mt.emis.tex); names.add(mt.mask.tex); }
    await Promise.all([...names].map(loadTex));
    const st = setup(ents, skill, box);
    const cv = document.createElement("canvas");
    draw(cv, ents, st, false);
    const est = ents.some(e => e.guess || e.region || e.bounce || e.synth || e.area || e.data) && !ents[0].fromWiki;
    box.innerHTML = "";
    if (st.css !== CSS) { box.style.width = st.css + "px"; cv.style.width = st.css + "px"; }   // 폰에서는 max-width 100% 가 줄인다
    box.appendChild(cv);
    const cap = document.createElement("div");
    cap.className = "splatcap";
    cap.innerHTML = (ta ? `<b class="calc-v">특성 적용 · ${esc(box.dataset.tn || "")}</b> ${tfig || tn ? "" : "<span class=\"note\">(범위는 그대로)</span> "}· ` : "") + (ents[0].fromWiki ? `<b>판정 범위</b> ${ents.map(label).filter(Boolean).join(" · ")} · <span class="est" title="게임은 이 기술에 바닥 범위 표시를 띄우지 않아, 판정 범위를 같은 모양의 노란 UI 로 그렸습니다">게임엔 표시 없음</span>`
                                     : `<b>인게임 범위 표시</b> ${ents.map(label).filter(Boolean).join(" · ")}`)
      + (st.turnable ? "" : ents.some(e => e.kind !== "range") ? " · 조준은 위쪽" : "")
      + (est ? ` · <span class="est" title="${ents.map(e => e.guess || (e.region ? "지역 " + e.region : "") || (e.bounce ? "벽 반사 생략" : "") || (e.synth ? "사거리 원은 기술 사거리로 그림(게임은 안 띄움)" : "") || (e.area ? "효과 범위는 게임 효과(" + e.area + ")에서 읽음 — 게임은 바닥에 안 띄움" : "") || (e.data === "spiral" ? "나선 궤적은 게임 UI 에 없음 — 뻗는 거리는 자료(속도·지속)로 잰 상한, 도는 모양은 눈대중" : "") || (e.data === "move" ? "이동 길은 게임 UI 에 없음 — 자료의 거리로 그림" : "") || (e.data === "more" ? "이 범위는 게임 UI 에 없음 — 위키 판정 자료로 그림" : "") || (e.data === "extra" ? (e.anch ? "끄는 거리는 게임 UI 에 없음 — 자료로 그림" : "옮겨 붙는 거리는 게임 UI 에 없음 — 자료로 그림") : "")).filter(Boolean).join(" / ")}">일부 추정</span>` : "");
    box.appendChild(cap);
    dials(box, cv, ents, st);
    // 옛 판정 그림이 없던 기술은 펼침 제목이 '상세 표' 뿐이다 — 그림이 붙었으니 앞에 적어 준다
    const sum = box.closest("details") && box.closest("details").querySelector(":scope > summary");
    if (sum && !/범위 그림/.test(sum.textContent)) sum.textContent = "범위 그림" + (sum.textContent.trim() ? " · " + sum.textContent.trim() : "");
  }

  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__splatFill = fill;   // 개발용 전수 점검
  const io = "IntersectionObserver" in window ? new IntersectionObserver(es => {
    for (const en of es) if (en.isIntersecting) { io.unobserve(en.target); fill(en.target).catch(() => en.target.remove()); }
  }, { rootMargin: "300px" }) : null;
  function scan(root) {
    (root.querySelectorAll ? root.querySelectorAll(".splatbox:not(.on)") : []).forEach(b => {
      if (io) io.observe(b); else fill(b).catch(() => b.remove());
    });
  }
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n.parentNode || n); })
    .observe(document.documentElement, { childList: true, subtree: true });
  window.hotsSplat = { scan, tals };
})();
