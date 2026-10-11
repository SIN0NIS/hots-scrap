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
    /* **찍는 자리를 밀어 볼 수 있는 기술**(리밍 마력탄)은 끝점을 밖에서 받는다.
       가까이 찍으면 세 줄이 크게 벌어지고 멀리 찍으면 거의 나란해진다 — 한 장면만
       그려 두면 그 변화가 안 보인다. */
    const span = (w || {})['모임 범위'];
    const atTo = (typeof opt.모임 === 'number' && span)
                 ? Math.round(Math.max(span[0], Math.min(span[1], opt.모임)) * 100) / 100
                 : null;      // 글에 3.45025157474266 이 그대로 나오면 안 된다
    const gs0 = (w || {})['도형'] || [];
    const gs = atTo === null ? gs0
             : gs0.map(g0 => (g0.모임 ? Object.assign({}, g0, { 모임: atTo }) : g0));
    /* 격자는 **맨 끝까지 펼친 모습**으로 재 둔다. 짧게 당길 때마다 칸이 다시 잡히면
       그림판이 300px → 58px 로 쪼그라들어 아래 글이 손가락 밑에서 밀려 올라간다.
       틀을 붙잡아 두면 '짧아졌다' 는 것도 눈으로 바로 보인다. */
    /* **끌어서 놓는 기술은 방향을 플레이어가 정한다.** 앞쪽 한 장면만 그려 두면
       "앞으로만 쓰는 기술" 로 읽힌다. 시계 같은 다이얼을 돌리면 끌기 축과 **찍은 자리에
       붙은 장판**이 같이 돈다 — 둘은 저마다 제 기준점에서 돈다. */
    /* **끌기 축이 있나로 세면 안 된다.** 메이 빙벽·줄 해골 마법학자·알라라크 염동력은
       끌어서 쓰는데 축 도형이 없어 다이얼이 빠져 있었다. `지정` 이 '끌어서' 면 다 붙인다. */
    /* **모으는 시간 손잡이.** 알라라크 돌진·초 주먹은 모은 만큼 멀리 가고,
       요한나 망치는 도는 동안 벌어진다 — 셋 다 '시간이 흐르면 어떻게 되나' 다.
       0(안 모음) ~ 1(끝까지)로 받아 도형이 제 몫을 줄인다. */
    const chg = (w || {})['모으기'];
    const at01 = (chg && typeof opt.모음 === 'number')
                 ? Math.max(0, Math.min(1, opt.모음)) : 1;
    const canSpin = gs0.some(g0 => g0.꼴 === '끌기')
                 || String((w || {})['지정'] || '').startsWith('끌어서');
    const spin = (canSpin && typeof opt.방향 === 'number') ? ((opt.방향 % 360) + 360) % 360 : 0;
    const spins = g0 => canSpin
                     && (g0.자리 === '착지' || g0.자리 === '원점' || g0.꼴 === '끌기');
    // **제가 놓인 자리에서 돈다.** 찍은 자리에 붙은 것(장판·끌기 축)은 거기서,
    // 제자리에 깔리는 것(메이 빙벽)은 영웅에게서 — 기준을 하나로 묶으면 빙벽이
    // 11 떨어진 점을 축으로 휘둘러진다.
    const pivot = g0 => ((g0.꼴 === '끌기' || g0.자리 === '착지') ? d : 0);
    const gsExt = span ? gs0.concat(gs0.map(g0 =>
                    g0.모임 ? Object.assign({}, g0, { 모임: span[0] }) : g0)) : gs;
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
    let tmp = null;        // 도는 도형은 따로 모아 **제 기준점에서 한 바퀴** 돌려 담는다
    const put = (x, y) => {
      if (tmp) { tmp.push([x, y]); return; }
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    };
    const arcPts = (R, A, cy) => {
      const pts = [], half = Math.min(A, 360) / 2;
      for (let t = -half; t <= half + 0.01; t += 5)
        pts.push([R * Math.sin(t * Math.PI / 180), cy + R * Math.cos(t * Math.PI / 180)]);
      return pts;
    };
    gsExt.forEach(g => {
      if (spins(g)) tmp = [];
      // 쓸고 가는 판정은 영웅에게서 출발한다(기술이 떨어지는 자리가 아니다)
      // `자리: '앞'` 은 **제 거리를 들고 다니는 도형**이다(굴단 부패가 0·3·6 에서 세 번 터진다).
    const at = g.자리 === '앞' ? (g.거리 || 0)
             : g.자리 === '착지' ? d + (g.거리 || 0)
             : (g.자리 === '원점' || g.쓸기) ? 0 : d;
      if (g.꼴 === '다각형' || g.꼴 === '자리들') (g.점 || []).forEach(p => put(p[0], p[1]));
      else if (g.꼴 === '부채꼴') { put(0, at); arcPts(g.반지름, g.각도, at).forEach(p => put(p[0], p[1])); }
      else if (g.꼴 === '이동') { put(0, 0); put(0, g.거리); }
      else if (g.꼴 === '둘레') { put(-g.반지름, -g.반지름); put(g.반지름, g.반지름); }
      else if (g.꼴 === '나선') { const R = g.반지름 || 3.2; put(-R, -R); put(R, R); }
      else if (g.꼴 === '모르는 이동') { put(-1, 0); put(1, 6); }
      else if (g.꼴 === '모아 쏘는 이동') { put(-1.5, 0); put(1.5, g.최대 + 1); }
      else if (g.꼴 === '튕김' || g.꼴 === '뿌림') { put(-g.반지름, at - g.반지름); put(g.반지름, at + g.반지름); }
      // 끌 수 있는 거리는 25~30 이나 되기도 한다(데커드 고서 회오리·라그나로스 유성).
      // 그대로 담으면 격자가 깨알이 되니 **그리는 길이는 12 까지만** 담고 숫자로 적는다.
      else if (g.꼴 === '끌기') {
        // 끌기 축은 **찍은 자리**에 붙는다 — 거기서 방향을 정하는 것이기 때문이다
        const L = Math.min(g.거리 || 0, 12); put(-1, d); put(1, d + L);
      }
      else if (g.꼴 === '갈래') {   // 여러 갈래 — 가장 바깥 갈래의 끝까지 담는다
        const half = (g.간격 || 0) * ((g.수 || 1) - 1) / 2, L = g.길이 || 0;
        [-half, 0, half].forEach(t => {
          const r = t * Math.PI / 180;
          put(Math.sin(r) * L, Math.cos(r) * L);
        });
      }
      else if (g.꼴 === '뿌림상자') { put(-g.가로 / 2, -0.5); put(g.가로 / 2, g.세로); }
      // 돌린 막대(겐지 폭렬참의 X)는 대각선만큼 자리를 차지한다
      else if (g.꼴 === '직사각형' && g.각) {
        const d2 = Math.hypot(g.가로, g.세로) / 2;
        put(-d2, at - d2); put(d2, at + d2);
      }
      else if (g.꼴 === '직사각형' && g.향함) {
        const m = g.가로 / 2 + g.세로 / 2;
        put(-m, -m); put(m, m); put(g.향함[0] - m, g.향함[1] - m); put(g.향함[0] + m, g.향함[1] + m);
      }
      else if (g.꼴 === '직사각형' && g.모임) {
        // 가까이 찍으면 일찍 엇갈린 뒤 **훨씬 옆까지** 뻗는다 — 도착점을 담아야 안 잘린다
        const sx = g.옆 || 0, L = g.쓸기 || 0, h = Math.hypot(sx, g.모임) || 1;
        const ex = sx + L * (-sx) / h, ey = L * g.모임 / h, m = g.세로 / 2 + g.가로 / 2;
        put(sx - m, -m); put(sx + m, m); put(ex - m, ey - m); put(ex + m, ey + m);
      }
      else if (g.꼴 === '직사각형') {
        // `옆` 은 **나란히 나가는 줄**의 좌우 어긋남이다(리밍 마력탄 -3 · 0 · 3)
        const sx = g.옆 || 0;
        if (g.자리 === '원점' && !g.쓸기) { put(sx - g.가로 / 2, 0); put(sx + g.가로 / 2, g.세로); }
        else { put(sx - g.가로 / 2, at - g.세로 / 2); put(sx + g.가로 / 2, at + (g.쓸기 || 0) + g.세로 / 2); }
      } else if (g.날아감) {
        // 굵기가 그대로 날아가는 원은 '작은' 이 없다 — 그대로 빼면 NaN 이 돼 그림이 통째로 깨진다
        const r0 = (g.작은 === undefined ? g.반지름 : g.작은);
        put(-g.반지름, -r0); put(g.반지름, g.날아감 + g.반지름);
      }
      else { put(-g.반지름, at - g.반지름); put(g.반지름, at + g.반지름); }
      if (tmp) {
        const pv = pivot(g), got = tmp; tmp = null;
        const r = got.reduce((m, q) => Math.max(m, Math.hypot(q[0], q[1] - pv)), 0);
        put(-r, pv - r); put(r, pv + r);
      }
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
      const mark = (spin && spins(g)) ? body.length : -1;
      // `자리: '앞'` 은 **제 거리를 들고 다니는 도형**이다(굴단 부패가 0·3·6 에서 세 번 터진다).
    const at = g.자리 === '앞' ? (g.거리 || 0)
             : g.자리 === '착지' ? d + (g.거리 || 0)
             : (g.자리 === '원점' || g.쓸기) ? 0 : d;
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
      } else if (g.꼴 === '뿌림') {
        /* **구역 안에 흩뿌리는 것.** 굴단 파괴의 비는 7초 동안 유성을 떨어뜨리는데
           떨어질 자리가 자료에 마흔 곳 적혀 있다. 번호를 매겨 찍으면 "마흔 번 차례로" 로
           읽히지만 실제로는 이 구역 **아무 데나** 떨어진다. 그래서 자리 대신 구역을
           점선으로 두르고, 안에 몇 발만 흩어 놓아 '무작위' 라는 걸 보인다. */
        const cx = px(0), cy = py(at), R = g.반지름 * S;
        body += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${C}" fill-opacity=".07" `
              + `stroke="${C}" stroke-width="1.6" stroke-dasharray="3 5"/>`;
        // 자리는 **정해 놓고** 찍는다 — 볼 때마다 달라지면 그림을 견줄 수가 없다
        const spots = [[0.42, 0.18], [-0.3, 0.55], [0.1, -0.6], [-0.62, -0.2], [0.68, -0.38]];
        for (const [ux, uy] of spots)
          body += `<circle cx="${(cx + ux * R).toFixed(1)}" cy="${(cy + uy * R).toFixed(1)}" `
                + `r="3" fill="${C}" fill-opacity=".55"/>`;
      } else if (g.꼴 === '끌기') {
        /* **끌어서 놓는 기술**(알라락 염력·데커드 고서 회오리·줄 해골 마법학자 …).
           누르고 끌어 자리와 방향을 같이 정한다. 장판이 아니므로 채우지 않고,
           끌 수 있는 거리를 **화살표 하나**로 긋는다 — 튕김(퍼지는 화살표)과 다른 표시다.
           **양쪽으로 긋지 않는다.** 방향은 옆의 다이얼이 정하므로, 반대쪽 화살표는
           "뒤로도 나간다" 로 잘못 읽힌다. */
        const L = Math.min(g.거리 || 0, 12) * S, cx = px(0), cy = py(d);
        const ey = cy - L;
        body += `<line x1="${cx}" y1="${cy.toFixed(1)}" x2="${cx}" y2="${ey.toFixed(1)}" `
              + `stroke="${C}" stroke-width="2" stroke-dasharray="7 4" opacity=".9"/>`
              + `<polygon points="${cx},${(ey - 7).toFixed(1)} `
              + `${(cx - 5).toFixed(1)},${ey.toFixed(1)} ${(cx + 5).toFixed(1)},${ey.toFixed(1)}" `
              + `fill="${C}"/>`;
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
      } else if (g.꼴 === '뿌림상자') {
        /* **상자 안 아무 데서나 나온다.** 머키 멀록 대행진은 옆 ±5 · 앞 1 안에서
           멀록이 흩어져 튀어나와 앞으로 행진한다. 멀록 한 마리 판정만 그리면
           가느다란 선 하나로 보인다. 테두리는 점선, 안에 몇 점만 흩어 둔다. */
        body += `<rect x="${px(-g.가로 / 2)}" y="${py(g.세로)}" width="${g.가로 * S}" `
              + `height="${g.세로 * S}" fill="${C}" fill-opacity=".07" stroke="${C}" `
              + `stroke-width="1.4" stroke-dasharray="3 5"/>`;
        for (const [ux, uy] of [[-0.72, 0.3], [-0.3, 0.7], [0.08, 0.25], [0.45, 0.66], [0.78, 0.35]])
          body += `<circle cx="${px(ux * g.가로 / 2)}" cy="${py(uy * g.세로)}" r="2.6" `
                + `fill="${C}" fill-opacity=".55"/>`;
      } else if (g.꼴 === '직사각형' && g.각) {
        /* **X 로 엇갈리는 막대.** 겐지 폭렬참은 왼다리·오른다리가 1 x 6 막대를 하나씩
           들고 엇갈려 긋는다. 한 줄만 그리면 "한 번 긋는 기술" 로 보인다.
           엇갈리는 각은 자료에 없어(연출 쪽에만 있다) 이름 그대로 ±45 도로 긋는다. */
        const cx2 = px(0), cy2 = py(at);
        body += `<rect x="${(cx2 - g.가로 * S / 2).toFixed(1)}" y="${(cy2 - g.세로 * S / 2).toFixed(1)}" `
              + `width="${g.가로 * S}" height="${g.세로 * S}" ${fill} `
              + `transform="rotate(${g.각} ${cx2.toFixed(1)} ${cy2.toFixed(1)})"/>`;
      } else if (g.꼴 === '직사각형' && g.자리 === '원점' && !g.쓸기) {
        // 발밑에서 끝까지 깔리는 빔(디바 딱콩! 1.25 x 15) — 가운데에 놓지 않는다
        const sx = g.옆 || 0;
        body += `<rect x="${px(sx - g.가로 / 2)}" y="${py(g.세로)}" width="${g.가로 * S}" `
              + `height="${g.세로 * S}" ${fill}/>`;
      } else if (g.꼴 === '직사각형' && g.향함) {
        /* **흩어져 나가는 길**(겐지 수리검 셋). 도착점만 찍어 두면 "어디로 날아가는지"
           가 안 보인다. 제자리에서 제 도착점까지 쓸고 간 자리를 기울인 상자로 긋고,
           출발할 때의 판정 상자를 점선으로 한 번 더 그려 굵기를 보인다. */
        const tx = g.향함[0], ty = g.향함[1];
        const len = Math.hypot(tx, ty), ang = Math.atan2(tx, ty) * 180 / Math.PI;
        const x0 = px(0), y0 = py(0), hw = g.가로 * S / 2;
        const turn = `rotate(${(-ang).toFixed(2)} ${x0.toFixed(1)} ${y0.toFixed(1)})`;
        body += `<rect x="${(x0 - hw).toFixed(1)}" y="${(y0 - len * S).toFixed(1)}" `
              + `width="${(g.가로 * S).toFixed(1)}" height="${(len * S).toFixed(1)}" ${fill} `
              + `transform="${turn}"/>`
              + `<rect x="${(x0 - hw).toFixed(1)}" y="${(y0 - g.세로 * S).toFixed(1)}" `
              + `width="${(g.가로 * S).toFixed(1)}" height="${(g.세로 * S).toFixed(1)}" `
              + `fill="none" stroke="${C}" stroke-width="1" stroke-dasharray="4 3" `
              + `transform="${turn}"/>`;
      } else if (g.꼴 === '직사각형' && g.모임 && g.옆) {
        /* **옆에서 나와 찍은 자리에서 엇갈리는 길.** 리밍 마력탄은 ±3 에서 나와 커서를
           겨누는데, **날아가는 거리는 12 로 늘 같다** — 커서에서 멈추지 않고 그대로
           지나쳐 간다. 그래서 바뀌는 것은 길이가 아니라 **겨누는 각도**뿐이고,
           가까이 찍으면 일찍 엇갈린 뒤 양옆으로 크게 벌어진다.
           길이를 커서까지로 줄여 그리면 "가까이 찍으면 조금만 난다" 로 잘못 읽힌다. */
        const sx = g.옆, to = g.모임;
        const len = g.쓸기 || Math.hypot(sx, to);
        const ang = Math.atan2(sx, to) * 180 / Math.PI;
        const x0 = px(sx), y0 = py(0);
        body += `<rect x="${(x0 - g.가로 * S / 2).toFixed(1)}" y="${(y0 - len * S).toFixed(1)}" `
              + `width="${(g.가로 * S).toFixed(1)}" height="${(len * S).toFixed(1)}" ${fill} `
              + `transform="rotate(${(-ang).toFixed(2)} ${x0.toFixed(1)} ${y0.toFixed(1)})"/>`;
        if (sx > 0)        // 한 번만 — 세 줄이 만나는 자리
          body += `<circle cx="${px(0)}" cy="${py(to)}" r="4" fill="none" stroke="${C}" `
                + `stroke-width="1.6"/><text x="${px(0) + 7}" y="${py(to) + 3}" font-size="9" `
                + `fill="${C}" opacity=".95">여기서 모임</text>`;
      } else if (g.꼴 === '직사각형') {
        const run = g.쓸기 || 0, sx = g.옆 || 0;
        body += `<rect x="${px(sx - g.가로 / 2)}" y="${py(at + run + g.세로 / 2)}" width="${g.가로 * S}" `
              + `height="${(g.세로 + run) * S}" ${fill}/>`;
        if (run)   // 출발할 때의 판정 상자를 한 번 더 그려 '얼마짜리 상자가 쓸고 가는지' 보이게
          body += `<rect x="${px(sx - g.가로 / 2)}" y="${py(at + g.세로 / 2)}" width="${g.가로 * S}" `
                + `height="${g.세로 * S}" fill="none" stroke="${C}" stroke-width="1" `
                + `stroke-dasharray="4 3"/>`;
      }
      else if (g.꼴 === '모아 쏘는 이동') {
        /* **모은 만큼 멀리 간다.** 자료에 공식이 그대로 있다(알라라크는 누적기
           `3 + 0.6354 × 횟수`, 최대 24번). 지금 모은 만큼은 **실선**, 끝까지
           모았을 때는 **점선**으로 남겨 '얼마나 더 갈 수 있나' 가 보이게 한다. */
        const lo = g.최소, hi = g.최대, now = lo + (hi - lo) * at01;
        const cx3 = px(0), y0b = py(0);
        body += `<line x1="${cx3}" y1="${y0b}" x2="${cx3}" y2="${py(hi).toFixed(1)}" `
              + `stroke="${C}" stroke-width="1.4" stroke-dasharray="4 5" opacity=".45"/>`
              + `<line x1="${cx3}" y1="${y0b}" x2="${cx3}" y2="${py(now).toFixed(1)}" `
              + `stroke="${C}" stroke-width="3" opacity=".95"/>`
              + `<polygon points="${cx3},${(py(now) - 9).toFixed(1)} `
              + `${(cx3 - 5.5).toFixed(1)},${py(now).toFixed(1)} `
              + `${(cx3 + 5.5).toFixed(1)},${py(now).toFixed(1)}" fill="${C}"/>`
              + `<text x="${cx3 + 9}" y="${(py(now) + 4).toFixed(1)}" font-size="10" `
              + `fill="${C}">${Math.round(now * 100) / 100}</text>`
              + `<text x="${cx3 + 9}" y="${(py(hi) + 4).toFixed(1)}" font-size="9" `
              + `fill="var(--dim)">끝까지 ${hi}</text>`;
      }
      else if (g.꼴 === '모르는 이동') {
        /* **거리가 자료에 없는 돌진.** 게임 설명이 "돌진 거리는 … 에 비례" 라고
           스스로 말한다 — 고정된 수가 없다. 안 그리면 '범위 없는 기술' 로 읽히니
           방향만 점선 화살표로 긋고, 길이는 믿지 말라고 글에 적는다. */
        const L2 = 5.5 * S, cx2 = px(0), cy2 = py(0);
        body += `<line x1="${cx2}" y1="${cy2}" x2="${cx2}" y2="${(cy2 - L2).toFixed(1)}" `
              + `stroke="${C}" stroke-width="2" stroke-dasharray="6 5" opacity=".85"/>`
              + `<polygon points="${cx2},${(cy2 - L2 - 8).toFixed(1)} `
              + `${(cx2 - 5).toFixed(1)},${(cy2 - L2).toFixed(1)} `
              + `${(cx2 + 5).toFixed(1)},${(cy2 - L2).toFixed(1)}" fill="${C}" opacity=".85"/>`
              + `<text x="${cx2 + 8}" y="${(cy2 - L2 / 2).toFixed(1)}" font-size="9" `
              + `fill="var(--dim)">거리는 자료에 없음</text>`
              + (g.까닭 ? `<text x="${cx2 + 8}" y="${(cy2 - L2 / 2 + 12).toFixed(1)}" `
                 + `font-size="9" fill="var(--dim)">${esc(g.까닭)} 늘어남</text>` : '');
      }
      else if (g.꼴 === '나선') {
        /* **돌며 벌어지는 길**(요한나 축복받은 망치 · 들창코 제어 불가).
           `ApplyForce` 는 힘이라 궤적 자체는 엔진이 가속·회전율로 푼다 — **도는 모양**은
           눈대중이다. 다만 **얼마나 멀리까지**는 자료로 잰다: 몸이 `속도 x 지속` 만큼
           가고 그 길에서 바깥으로 가는 몫이 `바깥/√(옆²+바깥²)` 이니, 그 곱이 반지름의
           상한이다(망치 10 x 3.5 x 51% = 18). `반지름` 이 오면 **자에 맞춰** 그린다 —
           없으면 옛 눈대중 3.2 로 둔다(들창코). 안 그리면 "제자리에 원 하나" 로 읽힌다. */
        const R = g.반지름 || 3.2, turns = 2;
        const r0 = Math.min(Math.max(hr, 0.5), R * 0.1);
        // 몇 개가 도나 · 둘째는 몇 초 뒤에 나오나(망치 둘, 1초 뒤) — 늦은 것은 덜 감겼다
        const secs = (chg && chg.초) || 0;
        const lag = (g.시차 && secs) ? g.시차 / secs : 0;
        const arms = [];
        for (let k = 0; k < Math.max(1, g.수 || 1); k += 1) arms.push(Math.max(0, at01 - k * lag));
        arms.forEach((t1, k) => {
          const pts = [];
          for (let t = 0; t <= t1 + 0.0001; t += 0.01) {
            const th = t * turns * 2 * Math.PI;
            const rr = r0 + (R - r0) * t;                     // 고르게 벌어지게
            pts.push(`${px(rr * Math.sin(th)).toFixed(1)},${py(rr * Math.cos(th)).toFixed(1)}`);
          }
          if (pts.length < 2) return;
          body += `<polyline points="${pts.join(' ')}" fill="none" stroke="${C}" `
                + `stroke-width="1.6" stroke-dasharray="5 4" opacity="${k ? '.55' : '.9'}"/>`;
          // 판정 크기는 **자료 그대로** — 지금 망치가 있는 자리에 실선 동그라미로
          const rr1 = r0 + (R - r0) * t1, th1 = t1 * turns * 2 * Math.PI;
          const hx = px(rr1 * Math.sin(th1)), hy = py(rr1 * Math.cos(th1));
          if (g.판정) body += `<circle cx="${hx}" cy="${hy}" r="${g.판정 * S}" ${fill}/>`;
          if (g.판정 && !k)
            body += `<text x="${hx + g.판정 * S + 3}" y="${hy + 3}" font-size="9" `
                  + `fill="${C}" opacity=".95">판정 ${g.판정}</text>`;
        });
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
      if (mark >= 0)    // 제 기준점에서 돌린다(화면은 y 가 아래라 +가 시계 방향)
        body = body.slice(0, mark)
             + `<g transform="rotate(${spin.toFixed(1)} ${px(0).toFixed(1)} `
             + `${py(pivot(g)).toFixed(1)})">` + body.slice(mark) + '</g>';
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
                             (g.꼴 === '직사각형' && g.각) ? `${g.가로} x ${g.세로} 막대가 X 로 엇갈림` :
                             g.꼴 === '뿌림상자' ? `${g.가로} x ${g.세로} 안에서 흩어져 나옴` :
                             g.꼴 === '뿌림' ? `${g.반지름} 구역에 무작위로 떨어짐` :
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
                 gs.some(g => g.꼴 === '나선' && g.반지름)
                   ? `<b class="c-dim">⌁</b> 나선은 도는 모양만 눈대중 — 반지름은 자료로 잰 상한`
                   : gs.some(g => g.꼴 === '나선')
                   ? `<b class="c-dim">⌁</b> 나선은 눈대중 — 뻗는 거리는 자료에 없다` : '',
                 gs.some(g => g.꼴 === '모르는 이동')
                   ? `<b class="c-dim">⌁</b> 화살표는 방향만 — 거리는 자료에 없다` : '',
                 yard.map(([k, r]) => `<b class="c-yard">⌁</b> ${esc(k)} ${r}`).join(' · ')]
                .filter(Boolean).join(' · ');
    let bar = '';
    if ((span || canSpin || chg) && !opt.막대끔) {
      const cur = atTo === null ? (span ? span[1] : 0) : atTo;
      const id = 'cv' + (++SEQ);
      REG.set(id, { w: w, opt: opt });
      /* `step="any"` — 눈금에 걸리지 않아 **끌기가 매끄럽고 맨 끝까지 닿는다.**
         딱 떨어지는 눈금을 주면 0.4375 + 0.5k 격자에 묶여 최대 12 에 못 간다.
         +/− 단추가 쓸 걸음은 따로 들려 준다. */
      let inner = '';
      if (span) {
        const step = Math.max(0.25, Math.round((span[1] - span[0]) / 16 * 4) / 4);
        inner = `<button type="button" class="cvb" data-d="-1" aria-label="가깝게">−</button>`
              + `<input type="range" class="cvr" min="${span[0]}" max="${span[1]}" step="any" `
              + `data-s="${step}" value="${cur}" aria-label="모이는 자리까지의 거리">`
              + `<button type="button" class="cvb" data-d="1" aria-label="멀게">+</button>`
              + `<span class="cvn">${Math.round(cur * 100) / 100}</span>`;
      }
      if (chg) {
        /* **시간 손잡이** — 왼쪽 끝이 '안 모음', 오른쪽 끝이 '끝까지'.
           초를 아는 것(알라라크 1.5초 · 요한나 3.5초)은 초로, 모르는 것(초 주먹)은
           백분율로 적는다. 0 에서 끝까지 밀어 보면 시간에 따라 어떻게 되는지 보인다. */
        inner += `<span class="cvl">${chg.도는중 ? '도는 중' : '모으기'}</span>`
               + `<input type="range" class="cvt" min="0" max="1" step="any" `
               + `value="${at01}" aria-label="${chg.도는중 ? '도는 시간' : '모으는 시간'}">`
               + `<span class="cvn cvs">${chgLabel(chg, at01)}</span>`;
      }
      if (canSpin) inner += dialHTML(spin);
      bar = `<div class="cv" data-cv="${id}" data-deg="${spin}">${inner}</div>`;
    }
    return `<div class="fig"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" `
         + `aria-label="범위 그림"><g>${grid}</g>${body}</svg>${bar}`
         + `<div class="cap">${cap}</div></div>`;
  }

  /* 조절 막대는 **그리는 층이 스스로** 맡는다 — 두 화면이 같은 코드를 쓰므로
     여기서 한 번만 이어 두면 도감과 범위 구경 양쪽에서 다 움직인다.
     `<input type="range">` 를 쓰면 마우스 끌기·손가락 밀기·화살표 키가 공짜로 따라온다. */
  let SEQ = 0;
  const REG = new Map();
  const chgLabel = (c, t) => (c && c.초)
    ? `${Math.round(t * c.초 * 100) / 100}초`
    : `${Math.round(t * 100)}%`;

  /* **시계 같은 방향 다이얼.** 12시가 앞이고 시계 방향으로 돈다. 바늘을 잡아 끌거나
     (마우스·손가락) 눈금을 눌러도 되고, 포커스를 주면 화살표 키로 5°씩 움직인다. */
  const WAY = ['앞', '앞오른', '오른쪽', '뒤오른', '뒤', '뒤왼', '왼쪽', '앞왼'];
  const wayName = deg => WAY[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  function dialHTML(deg) {
    let tick = '';
    for (let t = 0; t < 360; t += 30) {
      const r0 = t % 90 ? 15 : 13, a0 = t * Math.PI / 180;
      tick += `<line x1="${(22 + r0 * Math.sin(a0)).toFixed(1)}" `
            + `y1="${(22 - r0 * Math.cos(a0)).toFixed(1)}" `
            + `x2="${(22 + 18 * Math.sin(a0)).toFixed(1)}" `
            + `y2="${(22 - 18 * Math.cos(a0)).toFixed(1)}" stroke="var(--line)" `
            + `stroke-width="${t % 90 ? 1 : 1.6}"/>`;
    }
    const a1 = deg * Math.PI / 180;
    return `<svg class="cvd" viewBox="0 0 44 44" width="44" height="44" tabindex="0" `
         + `role="slider" aria-label="끌어서 정할 방향" aria-valuemin="0" aria-valuemax="359" `
         + `aria-valuenow="${Math.round(deg)}"><circle cx="22" cy="22" r="19.5" fill="none" `
         + `stroke="var(--line)" stroke-width="1.2"/>${tick}`
         + `<line class="cvp" x1="22" y1="22" x2="${(22 + 16 * Math.sin(a1)).toFixed(1)}" `
         + `y2="${(22 - 16 * Math.cos(a1)).toFixed(1)}" stroke="var(--gold)" `
         + `stroke-width="2.4" stroke-linecap="round"/>`
         + `<circle cx="22" cy="22" r="2.6" fill="var(--gold)"/></svg>`
         + `<span class="cvn cvw">${wayName(deg)}</span>`;
  }
  function paintDial(box) {
    const deg = Number(box.dataset.deg) || 0, a0 = deg * Math.PI / 180;
    const p = box.querySelector('.cvp'), d0 = box.querySelector('.cvd');
    if (p) { p.setAttribute('x2', (22 + 16 * Math.sin(a0)).toFixed(1));
             p.setAttribute('y2', (22 - 16 * Math.cos(a0)).toFixed(1)); }
    if (d0) d0.setAttribute('aria-valuenow', Math.round(deg));
    const w0 = box.querySelector('.cvw');
    if (w0) w0.textContent = wayName(deg);
  }
  function setDeg(box, deg, ev) {
    box.dataset.deg = ((Math.round(deg / 5) * 5 % 360) + 360) % 360;
    paintDial(box);
    redraw(box);
    if (ev && ev.cancelable) ev.preventDefault();
  }
  function degAt(svg, ev) {
    const r = svg.getBoundingClientRect();
    return Math.atan2(ev.clientX - (r.left + r.width / 2),
                      -(ev.clientY - (r.top + r.height / 2))) * 180 / Math.PI;
  }
  function redraw(box, at) {
    const m = REG.get(box.dataset.cv), fig = box.closest('.fig');
    if (!m || !fig) return;
    const rng = box.querySelector('.cvr');
    if (at === undefined && rng) at = Number(rng.value);
    /* **그림과 글만** 갈아 끼운다. `.fig` 를 통째로 새로 만들면 끌고 있던 막대가
       사라져 손가락이 끊기고, 다시 그릴 때마다 등록표에 새 자리가 쌓인다. */
    const t = document.createElement('div');
    const o = Object.assign({}, m.opt, { 막대끔: true, 방향: Number(box.dataset.deg) || 0 });
    const tr = box.querySelector('.cvt');
    if (tr) o.모음 = Number(tr.value);
    if (typeof at === 'number') o.모임 = at;
    t.innerHTML = shapeSVG(m.w, o);
    const ns = t.querySelector('svg'), nc = t.querySelector('.cap');
    const os = fig.querySelector('svg'), oc = fig.querySelector('.cap');
    if (ns && os) os.replaceWith(ns);
    if (nc && oc) oc.replaceWith(nc);
    const lab = box.querySelector('.cvn');
    if (lab && typeof at === 'number') lab.textContent = Math.round(at * 100) / 100;
  }
  if (!g.__hotsShapeWired) {
    g.__hotsShapeWired = true;
    g.addEventListener('input', e => {
      const r = e.target.closest && e.target.closest('.cvr');
      if (r) { redraw(r.closest('.cv'), Number(r.value)); return; }
      const t = e.target.closest && e.target.closest('.cvt');
      if (t) {
        const box = t.closest('.cv'), m = REG.get(box.dataset.cv);
        const lab = box.querySelector('.cvs');
        if (lab && m) lab.textContent = chgLabel((m.w || {})['모으기'], Number(t.value));
        redraw(box);
      }
    }, true);
    g.addEventListener('pointerdown', e => {
      const d0 = e.target.closest && e.target.closest('.cvd');
      if (!d0) return;
      try { d0.setPointerCapture(e.pointerId); } catch (x) {}   // 못 잡아도 돌아는 간다
      d0.dataset.grab = '1';
      setDeg(d0.closest('.cv'), degAt(d0, e), e);
    }, true);
    g.addEventListener('pointermove', e => {
      const d0 = e.target.closest && e.target.closest('.cvd');
      if (d0 && d0.dataset.grab === '1') setDeg(d0.closest('.cv'), degAt(d0, e), e);
    }, true);
    g.addEventListener('pointerup', e => {
      const d0 = e.target.closest && e.target.closest('.cvd');
      if (d0) delete d0.dataset.grab;
    }, true);
    g.addEventListener('keydown', e => {
      const d0 = e.target.closest && e.target.closest('.cvd');
      if (!d0) return;
      const box = d0.closest('.cv'), now = Number(box.dataset.deg) || 0;
      const k = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[e.key];
      if (k) setDeg(box, now + k, e);
      else if (e.key === 'Home') setDeg(box, 0, e);
    }, true);
    g.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('.cvb');
      if (!b) return;
      const box = b.closest('.cv'), r = box.querySelector('.cvr');
      const st = Number(r.dataset.s) || 1;
      const v = Math.max(Number(r.min), Math.min(Number(r.max),
                Number(r.value) + st * Number(b.dataset.d)));
      r.value = v;                                    // 손잡이도 따라가야 한다
      redraw(box, v);
    }, true);
  }

  g.hotsShape = { svg: shapeSVG, graph: graphSVG, side: SIDEC, esc: esc };
})(window);
