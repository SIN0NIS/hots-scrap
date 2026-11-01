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

  function paint(ents, N) {
    const R = extent(ents), PX = N / (2 * R);
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
    function shade(i, o, u, v, t) {
      const L = o.m.emis;
      if (L.tile !== 1 || L.angle) {
        const r = (L.angle || 0) * Math.PI / 180, ca = Math.cos(r), sa = Math.sin(r), x = u - 0.5, y = v - 0.5;
        u = (x * ca - y * sa) * L.tile + 0.5; v = (x * sa + y * ca) * L.tile + 0.5;
      }
      if (!samp(o.te, L.chan, u, v, S)) return;
      samp(o.tm, o.m.mask.chan, u, v, M);
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
      const rr = (e.rot || 0) * Math.PI / 180, fx = -Math.sin(rr), fy = -Math.cos(rr);   // 앞 방향
      const rx = -fy, ry = fx;                                                        // 오른쪽
      // 커서를 따라가는 그림은 조준점(위쪽 reach)이 기준이다
      const cur = e.cursor && e.kind !== "circle" ? -(e.offset && e.offset < FAR ? Math.min(REACH, e.offset) : REACH) : 0;
      const ox = fx * (e.fwd || 0) - rx * (e.side || 0), oy = cur + fy * (e.fwd || 0) - ry * (e.side || 0);
      const each = (cx, cy, r, fn) => eachW(ox + rx * cx - fx * cy, oy + ry * cx - fy * cy, r, (x, y, i) => {
        const X = x - ox, Y = y - oy;
        fn(X * rx + Y * ry, -(X * fx + Y * fy), i);
      });
      const t = (e.tint || [255, 255, 255]).map(c => c / 255);
      const reach = e.offset && e.offset < FAR ? Math.min(REACH, e.offset) : REACH;
      if (e.kind === "range" || e.kind === "circle") {
        const r = e.radius, cy = e.kind === "range" || e.self ? 0 : -reach, ms = mats(e.model, 2 * r);
        each(0, cy, r * 1.42, (x, y, i) => { for (const o of ms) shade(i, o, x / (2 * r) + 0.5, (y - cy) / (2 * r) + 0.5, t); });
      } else if (e.kind === "quad") {
        const w = e.width, len = e.length, p = e.parts || {}, cap = Math.min(w, len / 3), seg = [];
        if (p.center) {
          if (p.launch) seg.push([p.launch, 0, cap]);
          seg.push([p.center, p.launch ? cap : 0, p.impact ? len - cap : len]);
          if (p.impact) seg.push([p.impact, len - cap, len]);
        } else for (const m of [p.launch, p.impact]) if (m) seg.push([m, 0, len]);
        const S2 = seg.map(([m, s0, s1]) => [mats(m, w), s0, s1, m === p.center]);
        let ox = 0, oy = 0, ax = dx, ay = dy;
        if (e.place === "perp") { ox = dy * len / 2; oy = -reach - dx * len / 2; ax = -dy; ay = dx; }
        else if (e.place === "center") { oy = -(reach - len / 2); }
        const bx = -ay, by = ax;
        each(ox + ax * len / 2, oy + ay * len / 2, len / 2 + w, (x, y, i) => {
          const lx = x - ox, ly = y - oy, s = lx * ax + ly * ay, q = lx * bx + ly * by;
          if (s < 0 || s > len || Math.abs(q) > w / 2) return;
          for (const [ms, s0, s1, mid] of S2) {
            if (s < s0 || s > s1) continue;
            const u = q / w + 0.5, v = mid ? 1 - ((s - s0) / w) % 1 : 1 - (s - s0) / (s1 - s0);
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
          if (ring) for (const o of fill) shade(i, o, 0.5 + 0.5 * rho * Math.sin(th), 0.5 - 0.5 * rho * Math.cos(th), t);
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
          for (const o of ms) shade(i, o, x / (2 * hw) + 0.5, s / L, t);
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
        each(0, 0, Math.max(...xs.map(Math.abs), ...fs.map(Math.abs)), (x, y, i) => {
          const b = -y; if (!inside(x, b)) return;
          for (const o of ms) shade(i, o, (x - x0) / (x1 - x0), 1 - (b - f0) / (f1 - f0), t);
        });
      }
    }
    return { R, ER, EG, EB, A };
  }

  const REACH = 6;
  function extent(ents) {
    let r = 3;
    for (const e of ents) {
      const reach = e.offset && e.offset < FAR ? Math.min(REACH, e.offset) : REACH;
      const sh = Math.abs(e.fwd || 0) + Math.abs(e.side || 0) + (e.cursor ? REACH : 0);
      if (e.kind === "range") r = Math.max(r, e.radius);
      else if (e.kind === "cone") r = Math.max(r, sh + e.radius);
      else if (e.kind === "circle") r = Math.max(r, (e.self ? 0 : reach) + e.radius);
      else if (e.kind === "triangle") r = Math.max(r, Math.min(e.length, FAR));
      else if (e.kind === "poly") r = Math.max(r, ...e.verts.map(v => Math.hypot(v[0], v[1])));
      else if (e.kind === "quad") r = Math.max(r, Math.min(FAR, (e.place === "down" ? e.length : reach + e.length / 2) + (e.cursor ? REACH : 0)));
    }
    return Math.min(r + 0.8, FAR);
  }

  /* 기술 하나에 그림이 여럿이면 특성 판(variant)은 빼고 기본 판을 **다** 겹친다 — 겐지 표창 세 갈래,
     그레이메인 술병(직선 끝에서 부채꼴). 사거리 원은 하나만. 사거리 원이 없는데 기술 사거리를 알면
     게임의 사거리 그림으로 깔아 둔다(시전 거리 + 그 뒤 범위가 같이 보이게). */
  function pick(skill) {
    const list = skill.e || [];
    const base = list.filter(e => !e.variant);
    const use = base.length ? base : list.slice(0, 1);
    const ranges = use.filter(e => e.kind === "range"), rest = use.filter(e => e.kind !== "range");
    const out = ranges.slice(0, 1).concat(rest);
    if (!ranges.length && skill.r && META.models[META.range])
      out.unshift({ kind: "range", radius: skill.r, model: META.range, tint: META.tint, synth: true });
    return out;
  }

  /* 게임이 범위를 안 띄우는 기술(첸 술통 부수기·아르타니스 이연격 …) — 위키 판정 도형(data-g)을
     같은 노란 UI 로 그린다. 원·직사각형·부채꼴만; 이동·여러 자리·다각형은 옛 그림을 남긴다(null). */
  function fromWiki(raw) {
    if (!raw) return null;
    let w; try { w = JSON.parse(decodeURIComponent(raw)); } catch (e) { return null; }
    const G = META.gen, out = [];
    for (const g of w.g || []) {
      const at = g["자리"] === "착지" && w.d > 0;     // 도형거리 0 이면 제자리
      if (g["꼴"] === "원" && g["반지름"] > 0)
        out.push({ kind: "circle", radius: +g["반지름"], self: !at, offset: at ? w.d : undefined, model: G.circle });
      else if (g["꼴"] === "직사각형" && (g["길이"] || g["세로"]))
        out.push({ kind: "quad", width: +(g["가로"] || 1), length: +(g["길이"] || g["세로"]),
                   place: at ? "center" : "down", offset: w.d, parts: G.quad });
      else if (g["꼴"] === "부채꼴" && g["반지름"] > 0)
        out.push({ kind: "cone", radius: +g["반지름"], arc: +(g["각도"] || 90), model: G.cone });
      else return null;                   // 못 그리는 꼴이 섞이면 통째로 옛 그림
    }
    out.forEach(e => { e.tint = META.tint; e.fromWiki = true; });
    return out.length ? out : null;
  }

  const KIND = { range: "사거리", circle: "범위", quad: "직선", cone: "부채꼴", triangle: "삼각형", poly: "범위" };
  const n2 = v => Math.round(v * 100) / 100;
  function label(e) {
    if (e.kind === "range" || e.kind === "circle") return `${KIND[e.kind]} ${n2(e.radius)}`;
    if (e.kind === "quad") return `직선 ${n2(e.length)}×${n2(e.width)}`;
    if (e.kind === "cone") return `부채꼴 ${n2(e.radius)} · ${n2(e.arc)}°`;
    if (e.kind === "triangle") return `삼각형 ${n2(e.length)} · ${n2(e.angle)}°`;
    return KIND[e.kind];
  }

  async function fill(box) {
    box.classList.add("on");
    const skill = (await heroData(box.dataset.h))[box.dataset.s];
    const ents = skill && (skill.e || []).length ? pick(skill) : fromWiki(box.dataset.g);
    if (!ents || !ents.length) { box.remove(); return; }
    const names = new Set();
    for (const e of ents) for (const m of [e.model, ...Object.values(e.parts || {})])
      for (const mt of META.models[m] || []) { names.add(mt.emis.tex); names.add(mt.mask.tex); }
    await Promise.all([...names].map(loadTex));
    const dpr = Math.min(2, window.devicePixelRatio || 1), N = Math.round(CSS * dpr);
    const { R, ER, EG, EB, A } = paint(ents, N);
    const cv = document.createElement("canvas"); cv.width = cv.height = N;
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
    // 영웅 자리
    g.fillStyle = "#e6edf3"; g.beginPath(); g.arc(N / 2, N / 2, Math.max(3, 0.55 * PX), 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, N - 18 * dpr, 64 * dpr, 18 * dpr);
    g.fillStyle = "#c9d1d9"; g.font = `${11 * dpr}px system-ui, sans-serif`; g.fillText(`±${Math.round(R)}`, 5 * dpr, N - 5 * dpr);
    const est = ents.some(e => e.guess || e.region || e.bounce || e.synth) && !ents[0].fromWiki;
    box.innerHTML = "";
    box.appendChild(cv);
    const cap = document.createElement("div");
    cap.className = "splatcap";
    cap.innerHTML = (ents[0].fromWiki ? `<b>판정 범위</b> ${ents.map(label).join(" · ")} · <span class="est" title="게임은 이 기술에 바닥 범위 표시를 띄우지 않아, 판정 범위를 같은 모양의 노란 UI 로 그렸습니다">게임엔 표시 없음</span>`
                                     : `<b>인게임 범위 표시</b> ${ents.map(label).join(" · ")}`)
      + (ents.some(e => e.kind !== "range") ? " · 조준은 위쪽" : "")
      + (est ? ` · <span class="est" title="${ents.map(e => e.guess || (e.region ? "지역 " + e.region : "") || (e.bounce ? "벽 반사 생략" : "") || (e.synth ? "사거리 원은 기술 사거리로 그림(게임은 안 띄움)" : "")).filter(Boolean).join(" / ")}">일부 추정</span>` : "");
    box.appendChild(cap);
  }

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
  window.hotsSplat = { scan };
})();
