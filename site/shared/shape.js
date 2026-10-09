/* HotS Scrap — 범위 그림 그리는 공용 계층.
   사용: <script src=".../shared/shape.js"></script> 한 줄. 생김새(shape.css)도 같이 끌어온다.

     hotsShape.svg(위키식, { hero: 영웅자료, yard: 눈금 })   범위 그림 <div class="fig">
     hotsShape.graph(위키식)                                시간·거리에 따라 변하는 값 그래프
     hotsShape.side('적'|'아군'|'둘 다')                     편에 따른 색

   **도감(herodex)과 범위 구경(shapes) 탭이 같은 이 파일을 쓴다.** 한쪽만 고쳐져 둘이
   조용히 어긋나는 일을 막으려고 꺼내 놓았다. 색은 쓰는 쪽이 --foe/--ally/--both/--hit/
   --gold/--wiki/--line/--card2/--dim/--fg 를 정해 줘야 한다. */
(function (g) {
  if (!document.querySelector('link[data-shape-css]')) {
    var sc = document.currentScript;
    var base = (sc && sc.src) ? sc.src.replace(/shape\.js.*$/, '') : '';
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = base + 'shape.css';
    l.setAttribute('data-shape-css', '');
    (document.head || document.documentElement).appendChild(l);
  }
  const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  function SIDEC(side) {
    return side === '아군' ? 'var(--ally)' : side === '둘 다' ? 'var(--both)' : 'var(--foe)';
  }
  /* **서서히 차는 값**은 숫자 두 개로는 "얼마나 빨리 차나" 가 안 보인다.
     거리에 따라 줄어드는 피해(디바 자폭 1100→400)나 단계마다 자라는 반지름
     (리밍 비전 보주 0.25→2.14)을 작은 꺾은선으로 보여 준다. */
  function graphSVG(w) {
    const g = (w || {})['그래프'];
    if (!g || !g.점 || g.점.length < 2) return '';
    const W = 190, H = 64, L = 30, B = 14;
    const xs = g.점.map(p => p[0]), ys = g.점.map(p => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const px = v => L + (x1 === x0 ? 0 : (v - x0) / (x1 - x0)) * (W - L - 6);
    const py = v => (H - B) - (y1 === y0 ? 0 : (v - y0) / (y1 - y0)) * (H - B - 10);
    const pts = g.점.map(p => px(p[0]) + ',' + py(p[1])).join(' ');
    const t = (x, y, s, anc) => `<text x="${x}" y="${y}" font-size="8.5" fill="var(--dim)"`
            + `${anc ? ` text-anchor="${anc}"` : ''}>${esc(s)}</text>`;
    return `<div class="fig"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" `
         + `aria-label="서서히 바뀌는 값"><g>`
         + `<line x1="${L}" y1="${H - B}" x2="${W - 4}" y2="${H - B}" stroke="var(--line)" stroke-width="1"/>`
         + `<line x1="${L}" y1="6" x2="${L}" y2="${H - B}" stroke="var(--line)" stroke-width="1"/></g>`
         + `<polyline points="${pts}" fill="none" stroke="var(--gold)" stroke-width="1.8"/>`
         + g.점.filter((_, i, A) => i === 0 || i === A.length - 1)
             .map(p => `<circle cx="${px(p[0])}" cy="${py(p[1])}" r="2.6" fill="var(--gold)"/>`).join('')
         + t(L - 3, py(y1) + 3, String(y1), 'end') + t(L - 3, py(y0) + 3, String(y0), 'end')
         + t(L, H - 3, String(x0)) + t(W - 4, H - 3, String(x1), 'end')
         + `</svg><div class="cap">${esc(g.가로)}에 따라 <b>${esc(g.세로)}</b> `
         + `${y0 === ys[0] ? '늘어남' : '줄어듦'} — ${esc(String(ys[0]))} → ${esc(String(ys[ys.length - 1]))}`
         + `</div></div>`;
  }
  function shapeSVG(w, opt) {
    opt = opt || {};
    // 밖에서 받는 두 가지 — **어느 영웅인가**(히트박스 크기)와 **견줄 눈금**(레이너 평타 6.5 …).
    // 예전에는 도감의 전역 변수를 그대로 집어 썼다. 그래서 이 그림은 도감 안에서만 살 수
    // 있었고, 범위만 모아 보는 탭을 만들려면 코드를 베끼는 수밖에 없었다.
    const HERO = opt.hero || null, YARD = opt.yard || {};
    const gs = (w || {})['도형'] || [];
    // 장판이 없어도 **찾는 범위**만 있으면 그릴 값이 있다(겐지 튕겨내기 `Radius 7.0`)
    const seekR = Number((w || {})['찾는 반지름']) || 0;
    if (!gs.length && !seekR) return '';
    let d = typeof w['도형거리'] === 'number' ? w['도형거리'] : 0;
    // 사거리가 전역급이면(한조 용의 화살) 격자가 수십 칸이 돼 정작 범위가 안 보인다.
    // 그럴 때는 **범위만** 제자리에 그리고, 사거리는 글로만 적는다.
    const farCast = d > 30 ? d : 0;
    if (farCast) d = 0;
    const hr = (HERO && HERO.기본 && HERO.기본.반지름) || 0.6875;
    let x0 = -hr, x1 = hr, y0 = -hr, y1 = hr;
    const put = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    const arcPts = (R, A, cy) => {
      const pts = [], half = Math.min(A, 360) / 2;
      for (let t = -half; t <= half + 0.01; t += 5)
        pts.push([R * Math.sin(t * Math.PI / 180), cy + R * Math.cos(t * Math.PI / 180)]);
      return pts;
    };
    gs.forEach(g => {
      // 쓸고 가는 판정은 영웅에게서 출발한다(기술이 떨어지는 자리가 아니다)
      // `자리: '앞'` 은 **제 거리를 들고 다니는 도형**이다(굴단 부패가 0·3·6 에서 세 번 터진다).
    const at = g.자리 === '앞' ? (g.거리 || 0) : (g.자리 === '원점' || g.쓸기) ? 0 : d;
      if (g.꼴 === '다각형' || g.꼴 === '자리들') (g.점 || []).forEach(p => put(p[0], p[1]));
      else if (g.꼴 === '부채꼴') { put(0, at); arcPts(g.반지름, g.각도, at).forEach(p => put(p[0], p[1])); }
      else if (g.꼴 === '이동') { put(0, 0); put(0, g.거리); }
      else if (g.꼴 === '둘레') { put(-g.반지름, -g.반지름); put(g.반지름, g.반지름); }
      else if (g.꼴 === '튕김') { put(-g.반지름, at - g.반지름); put(g.반지름, at + g.반지름); }
      // 끌 수 있는 거리는 25~30 이나 되기도 한다(데커드 고서 회오리·라그나로스 유성).
      // 그대로 담으면 격자가 깨알이 되니 **그리는 길이는 12 까지만** 담고 숫자로 적는다.
      else if (g.꼴 === '끌기') { const L = Math.min(g.거리 || 0, 12); put(-1, -L); put(1, L); }
      else if (g.꼴 === '갈래') {   // 여러 갈래 — 가장 바깥 갈래의 끝까지 담는다
        const half = (g.간격 || 0) * ((g.수 || 1) - 1) / 2, L = g.길이 || 0;
        [-half, 0, half].forEach(t => {
          const r = t * Math.PI / 180;
          put(Math.sin(r) * L, Math.cos(r) * L);
        });
      }
      else if (g.꼴 === '직사각형') {
        if (g.자리 === '원점' && !g.쓸기) { put(-g.가로 / 2, 0); put(g.가로 / 2, g.세로); }
        else { put(-g.가로 / 2, at - g.세로 / 2); put(g.가로 / 2, at + (g.쓸기 || 0) + g.세로 / 2); }
      } else if (g.날아감) {
        // 굵기가 그대로 날아가는 원은 '작은' 이 없다 — 그대로 빼면 NaN 이 돼 그림이 통째로 깨진다
        const r0 = (g.작은 === undefined ? g.반지름 : g.작은);
        put(-g.반지름, -r0); put(g.반지름, g.날아감 + g.반지름);
      }
      else { put(-g.반지름, at - g.반지름); put(g.반지름, at + g.반지름); }
    });
    if (d > 0) { put(0, d); put(-d, 0); put(d, 0); put(0, -d); }   // 시전 사거리는 **사방으로** 미친다
    if (seekR > 0) { put(-seekR, -seekR); put(seekR, seekR); }      // 찾는 범위도 격자에 담는다
    const dead = Number(w['최소 사거리']) || 0;      // 이 안쪽으로는 못 쓴다
    // 눈금은 **기술이 차지하는 만큼만** 깐다. 반지름 1 짜리 기술에 해머 공성 11 까지 그리면
    // 격자가 깨알이 돼 정작 그 기술이 안 보인다. 그래서 '기술이 미치는 거리' 를 먼저 재고,
    // 그보다 큰 눈금은 **가장 작은 것 하나만** 남긴다(그것조차 없으면 비교할 게 없으니까).
    let own = Math.max(hr, Math.abs(x0), x1, Math.abs(y0), y1);
    const ys = Object.entries(YARD).sort((a, b) => a[1] - b[1]);
    const limit = Math.max(own, ys.length ? ys[0][1] : 0);
    const yard = ys.filter(([, r]) => r <= limit);
    yard.forEach(([, r]) => { put(-r, -r); put(r, r); });
    x0 = Math.floor(x0 - 0.7); x1 = Math.ceil(x1 + 0.7);
    y0 = Math.floor(y0 - 0.7); y1 = Math.ceil(y1 + 0.7);
    const wu = x1 - x0, hu = y1 - y0;
    if (wu > 90 || hu > 90) return '';          // 지도 전체급은 격자로 보여 봐야 의미가 없다
    const S = Math.max(5, Math.min(24, 300 / Math.max(wu, hu)));
    const W = wu * S, H = hu * S;
    const px = x => (x - x0) * S, py = y => (y1 - y) * S;
    let grid = '';
    for (let x = x0; x <= x1; x++)
      grid += `<line x1="${px(x)}" y1="0" x2="${px(x)}" y2="${H}" stroke="var(--line)" stroke-width="${x === 0 ? 1.4 : 0.6}"/>`;
    for (let y = y0; y <= y1; y++)
      grid += `<line x1="0" y1="${py(y)}" x2="${W}" y2="${py(y)}" stroke="var(--line)" stroke-width="${y === 0 ? 1.4 : 0.6}"/>`;
    let body = '';
    // 눈금 — '이 범위가 레이너 평타보다 넓나?' 를 눈으로 재라고 깔아 둔다.
    // 너무 옅으면 안 보이고 너무 진하면 정작 기술 범위를 가린다. 선은 가늘게, 대신 이름표를 붙인다.
    yard.forEach(([k, r]) => {
      body += `<circle cx="${px(0)}" cy="${py(0)}" r="${r * S}" fill="none" stroke="var(--wiki)" `
            + `stroke-width="1" stroke-dasharray="4 3" opacity=".55"/>`;
      if (py(r) > 9)
        body += `<text x="${px(0) + 4}" y="${py(r) - 3}" font-size="9" fill="var(--wiki)" `
              + `opacity=".85">${esc(k)} ${r}</text>`;
    });
    // **못 쓰는 안쪽** — 히트박스에 딱 붙여서는 시전이 안 되는 기술이 있다(아나 생체
    // 수류탄 최소 3). 빗금 대신 옅은 붉은 원으로 '여기는 안 된다' 를 보인다.
    // 빨강은 '찾는 범위' 한 뜻으로만 쓴다 — 못 쓰는 안쪽은 **회색**으로 비켜 준다
    if (dead > 0)
      body += `<circle cx="${px(0)}" cy="${py(0)}" r="${dead * S}" fill="var(--dim)" `
            + `fill-opacity=".14" stroke="var(--dim)" stroke-width="1" stroke-dasharray="2 3"/>`;
    // **색이 뜻이다.** 빨강 = 이 안에서 대상을 찾는다 · 파랑 = 실제로 맞는 범위.
    // 유닛을 찍거나 게임이 알아서 고르는 기술은 그 동그라미가 '찾는 범위' 다.
    // 시전 사거리는 '누구에게' 가 아니라 '어디까지 찍나' 라서 색을 안 쓴다 — 늘 금색.
    const RC = 'var(--gold)';
    // 시전 사거리 — 어디까지 찍을 수 있나(영웅 중심). 공격 범위는 그 **끝**에 그린다.
    if (d > 0) {
      body += `<circle cx="${px(0)}" cy="${py(0)}" r="${d * S}" fill="none" stroke="${RC}" `
            + `stroke-width="1.2" stroke-dasharray="5 4"/>`
            + `<line x1="${px(0)}" y1="${py(0)}" x2="${px(0)}" y2="${py(d)}" stroke="${RC}" `
            + `stroke-width="1" stroke-dasharray="3 3" opacity=".8"/>`;
    }
    // 장판은 없고 **고를 적을 찾기만** 하는 기술(겐지 튕겨내기 `Radius 7.0`)
    const sr = seekR;
    const SC = SIDEC(w['찾는 대상']);
    if (sr > 0)
      body += `<circle cx="${px(0)}" cy="${py(0)}" r="${sr * S}" fill="${SC}" `
            + `fill-opacity=".07" stroke="${SC}" stroke-width="1.2" stroke-dasharray="5 4"/>`
            + (py(sr) > 11 ? `<text x="${px(0) + 4}" y="${py(sr) + 11}" font-size="9" `
               + `fill="${SC}" opacity=".9">이 안에서 찾음</text>` : '');
    gs.forEach(g => {
      // `자리: '앞'` 은 **제 거리를 들고 다니는 도형**이다(굴단 부패가 0·3·6 에서 세 번 터진다).
    const at = g.자리 === '앞' ? (g.거리 || 0) : (g.자리 === '원점' || g.쓸기) ? 0 : d;
      // **색은 '누구에게' 한 가지만 말한다** — 빨강 적 · 파랑 아군 · 보라 둘 다.
      // '찾는 범위인가' 는 색이 아니라 **점선**이 말한다. 한 명만 맞는 직격은 진하게.
      const C = SIDEC(g.편);
      const fill = g.직격
        ? `fill="${C}" fill-opacity=".30" stroke="${C}" stroke-width="2"`
        : `fill="${C}" fill-opacity=".16" stroke="${C}" stroke-width="1.4"`;
      if (g.꼴 === '자리들') {
        // 여러 지점에 차례로 생기는 기술(잘아타스 공허 걸음의 삼각형). 자리를 잇고 번호를 붙인다.
        const pts = (g.점 || []).map(p => px(p[0]) + ',' + py(p[1]));
        body += `<polygon points="${pts.join(' ')}" fill="${C}" fill-opacity=".10" `
              + `stroke="${C}" stroke-width="1.2" stroke-dasharray="5 3"/>`;
        (g.점 || []).forEach((p, i) => {
          body += `<circle cx="${px(p[0])}" cy="${py(p[1])}" r="4" fill="${C}"/>`
                + `<text x="${px(p[0]) + 6}" y="${py(p[1]) - 5}" font-size="9" fill="${C}">${i + 1}</text>`;
        });
      } else if (g.꼴 === '다각형')
        body += `<polygon points="${(g.점 || []).map(p => px(p[0]) + ',' + py(p[1])).join(' ')}" ${fill}/>`;
      else if (g.꼴 === '부채꼴') {
        if (g.안쪽) {
          /* **가운데가 빈 부채꼴.** 가로쉬 대지파괴자는 0~7.25 를 때리는 부채꼴과,
             6.25~7.25 **바깥 띠**에서만 기절·당기는 부채꼴이 따로다. 통짜로 그리면
             둘이 똑같아 보여 "같은 걸 두 번 그렸나" 가 된다. */
          const o = arcPts(g.반지름, g.각도, at);
          const i2 = arcPts(g.안쪽, g.각도, at).reverse();
          body += `<polygon points="${o.concat(i2).map(q => px(q[0]) + ',' + py(q[1])).join(' ')}" ${fill}/>`;
        } else {
          const pts = arcPts(g.반지름, g.각도, at).map(p => px(p[0]) + ',' + py(p[1]));
          body += `<polygon points="${px(0)},${py(at)} ${pts.join(' ')}" ${fill}/>`;
        }
        if (g.띠) {
          // 두께가 일정한 띠가 바깥으로 밀려 나가는 기술(안두인 응징) — 어느 한 순간에
          // 맞는 것은 **이 띠**다. 끝이 호라는 게 여기서 보인다. 연한 부채꼴은 지나간 자리.
          const outer = arcPts(g.반지름, g.각도, at);
          const inner = arcPts(Math.max(g.반지름 - g.띠, 0.01), g.각도, at).reverse();
          body += `<polygon points="${outer.concat(inner).map(q => px(q[0]) + ',' + py(q[1])).join(' ')}" `
                + `fill="${C}" fill-opacity=".30" stroke="${C}" stroke-width="1.6"/>`;
        }
      } else if (g.꼴 === '끌기') {
        /* **끌어서 놓는 기술**(알라락 염력·데커드 고서 회오리·줄 해골 마법학자 …).
           누르고 끌어 자리와 방향을 같이 정한다. 장판이 아니므로 채우지 않고,
           끌 수 있는 축을 **양쪽 화살표 막대**로 긋는다 — 튕김(퍼지는 화살표)과 다른 표시다. */
        const L = Math.min(g.거리 || 0, 12) * S, cx = px(0), cy = py(0);
        body += `<line x1="${cx}" y1="${(cy - L).toFixed(1)}" x2="${cx}" y2="${(cy + L).toFixed(1)}" `
              + `stroke="${C}" stroke-width="2" stroke-dasharray="7 4" opacity=".9"/>`;
        for (const d2 of [-1, 1]) {
          const ey = cy + d2 * L;
          body += `<polygon points="${cx},${(ey + d2 * 7).toFixed(1)} `
                + `${(cx - 5).toFixed(1)},${(ey).toFixed(1)} ${(cx + 5).toFixed(1)},${(ey).toFixed(1)}" `
                + `fill="${C}"/>`;
        }
        body += `<line x1="${(cx - 7).toFixed(1)}" y1="${cy}" x2="${(cx + 7).toFixed(1)}" y2="${cy}" `
              + `stroke="${C}" stroke-width="2"/>`;
      } else if (g.꼴 === '튕김') {
        /* **옮겨 붙는 거리**(연쇄·튕김)는 장판이 아니다. 레가르 연쇄 치유의 반지름 7 은
           "여기 있는 아군을 다 치유한다" 가 아니라 "다음 대상을 여기서 고른다" 다.
           빨간·파란 장판으로 그리면 광역기로 읽히므로 **채우지 않고**, 점선 테두리에
           밖으로 뻗는 화살표를 둘러 '여기로 옮겨 간다' 를 보이게 한다. */
        const cx = px(0), cy = py(at), R = g.반지름 * S;
        body += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${C}" `
              + `stroke-width="1.6" stroke-dasharray="5 5" opacity=".85"/>`;
        for (let i = 0; i < 6; i++) {
          const t = (i * 60 + 30) * Math.PI / 180;
          const ux = Math.sin(t), uy = -Math.cos(t);
          const x0 = cx + ux * R * 0.3, y0 = cy + uy * R * 0.3;
          const x1 = cx + ux * R * 0.88, y1 = cy + uy * R * 0.88;
          const hx = -uy, hy = ux, h = 4.5;
          body += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" `
                + `x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${C}" stroke-width="1.4"/>`
                + `<polygon points="${(x1 + ux * h).toFixed(1)},${(y1 + uy * h).toFixed(1)} `
                + `${(x1 + hx * h * 0.5).toFixed(1)},${(y1 + hy * h * 0.5).toFixed(1)} `
                + `${(x1 - hx * h * 0.5).toFixed(1)},${(y1 - hy * h * 0.5).toFixed(1)}" fill="${C}"/>`;
        }
      } else if (g.꼴 === '둘레') {
        /* **둘러싸는 자리** — 마이에브 감시관의 감옥은 반지름 5.5 둘레에 화신 여덟을 세운다.
           원 하나만 그리면 '장판' 으로 보이니, 둘레를 점선으로 긋고 자리마다 점을 찍는다. */
        body += `<circle cx="${px(0)}" cy="${py(0)}" r="${g.반지름 * S}" fill="none" `
              + `stroke="${C}" stroke-width="1.6" stroke-dasharray="6 4"/>`;
        for (let i = 0; i < (g.수 || 0); i++) {
          const t = i * 2 * Math.PI / g.수;
          body += `<circle cx="${px(Math.sin(t) * g.반지름)}" cy="${py(Math.cos(t) * g.반지름)}" `
                + `r="3.5" fill="${C}"/>`;
        }
      } else if (g.꼴 === '갈래') {
        /* **여러 갈래로 뻗는 기술** — 디아블로 화염 발구르기는 5갈래가 20도씩 벌어진다.
           선 하나하나를 그려야 '부채꼴 장판' 이 아니라 '갈래' 라는 게 보인다. */
        const n = g.수 || 1, gap = g.간격 || 0, L = g.길이 || 0;
        const half = gap * (n - 1) / 2;
        for (let i = 0; i < n; i++) {
          const t = (-half + gap * i) * Math.PI / 180;
          const ex = Math.sin(t) * L, ey = Math.cos(t) * L;
          body += `<line x1="${px(0)}" y1="${py(0)}" x2="${px(ex)}" y2="${py(ey)}" `
                + `stroke="${C}" stroke-width="1.6" stroke-opacity=".85"/>`;
          if (g.반지름)   // 갈래 끝의 판정 크기
            body += `<circle cx="${px(ex)}" cy="${py(ey)}" r="${g.반지름 * S}" `
                  + `fill="${C}" fill-opacity=".28" stroke="${C}" stroke-width="1.2"/>`;
        }
      } else if (g.꼴 === '이동') {
        /* 판정은 없고 몸만 가는 기술 — 화살표만 그린다(아래에서 그려진다) */
      } else if (g.꼴 === '직사각형' && g.자리 === '원점' && !g.쓸기) {
        // 발밑에서 끝까지 깔리는 빔(디바 딱콩! 1.25 x 15) — 가운데에 놓지 않는다
        body += `<rect x="${px(-g.가로 / 2)}" y="${py(g.세로)}" width="${g.가로 * S}" `
              + `height="${g.세로 * S}" ${fill}/>`;
      } else if (g.꼴 === '직사각형') {
        const run = g.쓸기 || 0;
        body += `<rect x="${px(-g.가로 / 2)}" y="${py(at + run + g.세로 / 2)}" width="${g.가로 * S}" `
              + `height="${(g.세로 + run) * S}" ${fill}/>`;
        if (run)   // 출발할 때의 판정 상자를 한 번 더 그려 '얼마짜리 상자가 쓸고 가는지' 보이게
          body += `<rect x="${px(-g.가로 / 2)}" y="${py(at + g.세로 / 2)}" width="${g.가로 * S}" `
                + `height="${g.세로 * S}" fill="none" stroke="${C}" stroke-width="1" `
                + `stroke-dasharray="4 3"/>`;
      }
      else if (g.꼴 === '고리')
        body += `<circle cx="${px(0)}" cy="${py(at)}" r="${g.반지름 * S}" ${fill}/>`
              + `<circle cx="${px(0)}" cy="${py(at)}" r="${g.안쪽 * S}" fill="var(--card2)" `
              + `stroke="${C}" stroke-width="1"/>`;
      else if (g.날아감) {
        // 날아가는 원 — 지나간 자리를 띠로 그린다. 굵기가 그대로면 곧은 띠,
        // 커지면(리밍 보주·안두인 응징) 넓어지는 띠다. '바로 앞에서 맞아도 터진다' 가 여기서 보인다.
        const r0 = (g.작은 === undefined ? g.반지름 : g.작은), r1 = g.반지름, D = g.날아감;
        body += `<polygon points="${px(-r0)},${py(0)} ${px(r0)},${py(0)} `
              + `${px(r1)},${py(D)} ${px(-r1)},${py(D)}" fill="${C}" fill-opacity=".10" `
              + `stroke="${C}" stroke-width="1" stroke-dasharray="4 3"/>`;
        body += `<circle cx="${px(0)}" cy="${py(0)}" r="${r0 * S}" fill="none" stroke="${C}" `
              + `stroke-width="1" stroke-dasharray="3 3"/>`
              + `<circle cx="${px(0)}" cy="${py(D)}" r="${r1 * S}" ${fill}/>`;
      } else {
        body += `<circle cx="${px(0)}" cy="${py(at)}" r="${g.반지름 * S}" ${fill}/>`;
        if (g.작은)   // 충전으로 커지는 원 — 처음 크기(충전 안 했을 때)를 점선으로
          body += `<circle cx="${px(0)}" cy="${py(at)}" r="${g.작은 * S}" fill="none" `
                + `stroke="${C}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
      }
    });
    // 방향이 있는 기술은 **화살표**로 어디로 가는지 보여 준다 — 날아가는 거리,
    // 없으면 부채꼴·다각형이 뻗은 길이만큼.
    let arrow = 0;
    gs.forEach(g => {
      arrow = Math.max(arrow, g.쓸기 || 0, g.날아감 || 0, g.거리 || 0,
                       (g.꼴 === '직사각형' && g.자리 === '원점' && !g.쓸기) ? g.세로 : 0);
      if (!g.쓸기 && !g.날아감 && g.자리 === '원점')
        arrow = Math.max(arrow, g.꼴 === '부채꼴' ? g.반지름
                              : g.꼴 === '다각형' ? Math.max(...(g.점 || [[0, 0]]).map(p => p[1])) : 0);
    });
    if (arrow > hr * 1.5) {
      const y0 = py(hr * 1.1), y1 = py(arrow), x = px(0), hd = Math.min(7, Math.max(4, S * 0.45));
      body += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1 + hd}" stroke="var(--fg)" `
            + `stroke-width="1.3" opacity=".5"/>`
            + `<polygon points="${x},${y1} ${x - hd * 0.6},${y1 + hd} ${x + hd * 0.6},${y1 + hd}" `
            + `fill="var(--fg)" opacity=".5"/>`;
    }
    body += `<circle cx="${px(0)}" cy="${py(0)}" r="${hr * S}" fill="var(--hit)" fill-opacity=".55" `
          + `stroke="var(--hit)" stroke-width="1"/>`;
    body += `<text x="4" y="${H - 5}" font-size="10" fill="var(--hit)">hitbox r ${hr}</text>`;
    const names = gs.map(g => g.꼴 === '자리들' ? `${(g.점 || []).length}곳` :
                               g.쓸기 ? `${g.꼴} ${g.가로} 폭이 ${g.쓸기} 를 지나감` :
                               (g.날아감 && g.작은) ? `날아가며 커지는 ${g.꼴}(${g.작은}→${g.반지름})` :
                               g.날아감 ? `${g.꼴} 반지름 ${g.반지름}이 ${g.날아감} 을 지나감` :
                               g.안쪽 ? `${g.꼴} 바깥 띠 ${g.안쪽}~${g.반지름}` :
                             g.작은 ? `커지는 ${g.꼴}(최소 ${g.작은} · 최대 ${g.반지름})` :
                               g.띠 ? `${g.꼴} ${g.각도}도 · 두께 ${g.띠} 띠가 ${g.반지름} 까지 밀려 남` :
                             g.꼴 === '끌기' ? `끌어서 놓음 — ${g.거리} 까지`
                               + (g.거리 > 12 ? ' (격자에는 12 까지만)' : '') :
                             g.꼴 === '튕김' ? `${g.반지름} 안으로 옮겨 붙음` + (g.수 > 1 ? ` x${g.수}` : '') :
                             g.꼴 === '이동' ? `${g.거리} 이동(판정 없음)` :
                               g.직격 ? `${g.꼴}(직격)` : g.꼴)
                   .filter((v, i, z) => z.indexOf(v) === i).join(' · ');
    const cap = [`한 칸 = 거리 1 · 위쪽이 앞`,
                 `<b class="c-hero">●</b> 영웅 히트박스 ${hr}`,
                 d > 0 ? `<b class="c-rng">◌</b> 시전 사거리 ${d}` : '',
                 sr > 0 ? `◌ 이 안에서 찾음 ${sr}` : '',
                 dead > 0 ? `<b class="c-dim">◌</b> 최소 ${dead} 안쪽은 못 씀` : '',
                 farCast ? `시전 사거리 ${farCast} 은 너무 멀어 격자에 안 그림` : '',
                 gs.some(g => g.편 === '적') ? `<b class="c-foe">■</b> 적에게` : '',
                 gs.some(g => g.편 === '아군') ? `<b class="c-ally">■</b> 아군에게` : '',
                 gs.some(g => g.편 === '둘 다') ? `<b class="c-both">■</b> 적·아군 모두` : '',
                 names ? `범위 ${esc(names)}` : '',
                 gs.some(g => g.직격) ? `진한 쪽은 한 명만 맞는 직격` : '',
                 yard.map(([k, r]) => `<b class="c-yard">⌁</b> ${esc(k)} ${r}`).join(' · ')]
                .filter(Boolean).join(' · ');
    return `<div class="fig"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" `
         + `aria-label="범위 그림"><g>${grid}</g>${body}</svg><div class="cap">${cap}</div></div>`;
  }

  g.hotsShape = { svg: shapeSVG, graph: graphSVG, side: SIDEC, esc: esc };
})(window);
