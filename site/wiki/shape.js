/* HotS Scrap — 범위 그림 그리는 공용 계층.
   사용: <script src=".../shared/shape.js"></script> 한 줄. 생김새(shape.css)도 같이 끌어온다.

     hotsShape.svg(위키식, { hero: 영웅자료, yard: 눈금 })   범위 그림 <div class="fig">
     hotsShape.graph(위키식)                                시간·거리에 따라 변하는 값 그래프
     hotsShape.side('적'|'아군'|'둘 다'|'자신')                     편에 따른 색

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
    return side === '아군' ? 'var(--ally)' : side === '둘 다' ? 'var(--both)'
         : side === '자신' ? 'var(--self, #17806d)' : 'var(--foe)';
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
    return `<div class="fig"><button type="button" class="figz" aria-label="크게 보기">⤢</button>`
         + `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" `
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
    /* **사거리가 무제한인 기술**(노바 정밀 타격 · 한조 용의 화살 · 켈투자드 어둠의 균열 …).
       숫자가 없으니 `도형거리` 가 비어 **제 발밑에** 그려졌다 — "내 둘레에 터지는 기술"
       로 읽힌다. 실제로는 지도 어디에나 놓인다. 본체에서 범위까지 **끊긴 선**으로 잇고
       끝에 '무제한' 이라고 적는다. 거리를 지어내지 않으려고 **선을 끊어** 둔다 —
       띄운 만큼은 그림을 읽히게 하려는 자리이지 잰 거리가 아니다. */
    const freeCast = typeof w['도형거리'] !== 'number' && !farCast
                  && /무제한|전역/.test(String(w['사거리'] || ''))
                  && gs.some(g0 => g0.자리 === '착지');
    let freeR = 0;
    if (freeCast) {
      gs.forEach(g0 => {
        if (g0.자리 !== '착지') return;
        freeR = Math.max(freeR, Number(g0.반지름) || 0, (Number(g0.세로) || 0) / 2,
                         (Number(g0.가로) || 0) / 2);
      });
      d = freeR + hr + 2.6;
    }
    /* 다이얼 셋을 가리는 자리 — `freeCast`·`farCast` 가 정해진 뒤라야
       '사거리를 아는 기술인가' 를 물을 수 있다(그 둘이 `d` 를 고친다). */
    const canSpin = gs0.some(g0 => g0.꼴 === '끌기')
                 || String((w || {})['지정'] || '').startsWith('끌어서');
    /* **겨냥 다이얼이 붙는 기술** — 사거리 안의 한 점을 찍는 것. 끌어서 쓰는 기술은
       방향 다이얼이 이미 있고, 거리 막대(`모임 범위`)가 있는 기술은 그 막대가 거리를
       맡으므로 겹치지 않게 비켜 둔다. 사거리를 모르는 것(무제한·전역)도 뺀다. */
    /* **방향만 정하는 기술** — 제 몸에 붙은 방향 있는 도형(부채꼴·직사각형·쓸기).
       원·고리는 돌려도 똑같으니 뺀다. 끌어서 쓰는 기술은 끌기 다이얼이 맡는다. */
    const 방향꼴 = g0 => (g0.자리 === '원점' || g0.자리 === undefined || g0.쓸기)
                     && ((g0.꼴 === '부채꼴' && (Number(g0.각도) || 360) < 350)
                         || g0.꼴 === '직사각형' || g0.꼴 === '다각형');
    /* **날아가는 판정이 있으면 쏘는 기술이다.** 쓸기(몸에서 앞으로 쓸고 가는 판정)나
       직격은 '어디에 떨어뜨릴까' 가 아니라 '어느 쪽으로 쏠까' 다 — 맞는 자리는 날아가다
       부딪히는 데서 정해진다(축복받은 방패). 그래서 겨냥 대신 방향을 단다. */
    const 쏘는꼴 = g0 => (Number(g0.쓸기) || 0) > 0 || g0.직격;
    const isShot = gs0.some(쏘는꼴);
    const canTurn = !canSpin && (gs0.some(방향꼴) || isShot);
    /* **방향을 돌리면 그림이 통째로 돈다.** 착지에 매달린 것(튕김 원·뿌림)도 같이 돌아야
       한다 — 방패를 옆으로 던졌는데 튕김 원만 앞에 남아 있으면 거짓말이다. 몸 가운데
       있는 원은 돌려도 제자리다. */
    const turns = g0 => canTurn;
    const aimMax = (typeof w['도형거리'] === 'number') ? w['도형거리'] : 0;
    const canAim = !span && !canSpin && !isShot && !freeCast && !farCast && aimMax > 0
                && gs0.some(g0 => g0.자리 === '착지');
    const aim = (canAim && opt.겨냥 && typeof opt.겨냥.거리 === 'number')
              ? { 각: ((Number(opt.겨냥.각) || 0) % 360 + 360) % 360,
                  거리: Math.max(0, Math.min(aimMax, Number(opt.겨냥.거리))) }
              : null;
    if (aim) d = aim.거리;
    /* 겨냥은 **찍은 자리에 매달린 것**을 다 옮긴다 — 장판(착지)만이 아니라 거기서
       튕기고 퍼지는 것, 제 거리를 들고 다니는 것까지. 몸에 붙은 것(원점)은 안 움직인다. */
    const aims = g0 => !!aim && (g0.자리 === '착지' || g0.자리 === '앞'
                                 || g0.꼴 === '튕김' || g0.꼴 === '뿌림');
    const spin = ((canSpin || canTurn) && typeof opt.방향 === 'number')
                 ? ((opt.방향 % 360) + 360) % 360 : 0;
    const spins = g0 => (canSpin
                      && (g0.자리 === '착지' || g0.자리 === '원점' || g0.꼴 === '끌기'))
                     || turns(g0);
    // **제가 놓인 자리에서 돈다.** 찍은 자리에 붙은 것(장판·끌기 축)은 거기서,
    // 제자리에 깔리는 것(메이 빙벽)은 영웅에게서 — 기준을 하나로 묶으면 빙벽이
    // 11 떨어진 점을 축으로 휘둘러진다.
    // 겨냥은 **영웅을 축으로** 돈다 — 제 착지점을 축으로 돌리면 자리가 안 옮겨진다
    const pivot = g0 => ((aims(g0) || turns(g0)) ? 0
                      : (g0.꼴 === '끌기' || g0.자리 === '착지') ? d : 0);
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
      /* 돌거나 옮겨 다니는 도형은 **한 바퀴 돌린 자리까지** 틀에 담아 둬야 끌 때
         그림이 안 흔들린다. 다만 방향 갈래는 **실제로 돌렸을 때만** 넓힌다 —
         늘 넓히면 가만히 있는 그림의 틀까지 커져 예전 그림과 달라진다. */
      if ((canSpin && spins(g)) || aims(g) || (spin && turns(g))) tmp = [];
      // 쓸고 가는 판정은 영웅에게서 출발한다(기술이 떨어지는 자리가 아니다)
      // `자리: '앞'` 은 **제 거리를 들고 다니는 도형**이다(굴단 부패가 0·3·6 에서 세 번 터진다).
    const at = g.자리 === '앞' ? (g.거리 || 0)
             : g.자리 === '착지' ? d + (g.거리 || 0)
             : (g.자리 === '원점' || g.쓸기) ? 0 : d;
      // **점 꼴도 제 자리를 탄다.** 찍은 자리에 놓이는 패턴(데커드 결계의 두루마리)을
      // 좌표 그대로 찍으면 영웅 둘레에 그려진다 — 그만큼 밀어 담는다.
      if (g.꼴 === '다각형' || g.꼴 === '자리들') (g.점 || []).forEach(p => put(p[0], p[1] + at));
      else if (g.꼴 === '부채꼴') { put(0, at); arcPts(g.반지름, g.각도, at).forEach(p => put(p[0], p[1])); }
      // 몸만 가는 거리는 75 나 되기도 한다(폴스타트 비행). 끌기와 같은 잣대로
      // **그리는 길이는 12 까지만** 담고 진짜 거리는 꼬리말에 숫자로 적는다.
      else if (g.꼴 === '이동') { put(0, 0); put(0, Math.min(g.거리 || 0, 12)); }
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
    /* 겨냥 중에는 **사거리 끝까지** 자리를 미리 잡아 둔다. 꼭지를 당길 때마다 판이
       다시 재어지면 그림이 쪼그라들어 아래 글이 손가락 밑에서 밀려 올라간다. */
    if (aim) {
      let 품 = 0;
      gs0.forEach(g0 => {
        if (g0.자리 !== '착지') return;
        품 = Math.max(품, Number(g0.반지름) || 0, (Number(g0.세로) || 0) / 2,
                      (Number(g0.가로) || 0) / 2, Number(g0.거리) || 0);
      });
      const rr = aimMax + 품;
      put(-rr, -rr); put(rr, rr);
    }
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
    // **특성이 사거리를 늘렸으면 예전 사거리도** 옅은 점선으로 같이 긋는다
    const wasD = typeof w['전거리'] === 'number' ? w['전거리'] : null;
    if (wasD != null && wasD > 0 && !freeCast && !farCast)
      body += `<circle cx="${px(0)}" cy="${py(0)}" r="${wasD * S}" fill="none" `
            + `stroke="var(--dim)" stroke-width="1.1" stroke-dasharray="3 4" opacity=".75"/>`
            + `<text x="${px(0) + 4}" y="${py(wasD) - 3}" font-size="9" fill="var(--dim)" `
            + `opacity=".9">특성 전 ${wasD}</text>`;
    // 시전 사거리 — 어디까지 찍을 수 있나(영웅 중심). 공격 범위는 그 **끝**에 그린다.
    // 무제한인 기술은 **그 동그라미를 안 그린다** — 띄운 거리는 잰 값이 아니다.
    if (freeCast) {
      const x = px(0), yA = py(hr * 1.15), yB = py(d - freeR), yM = (yA + yB) / 2;
      body += `<line x1="${x}" y1="${yA}" x2="${x}" y2="${(yM + 7).toFixed(1)}" `
            + `stroke="var(--gold)" stroke-width="1.2" stroke-dasharray="4 4" opacity=".8"/>`
            + `<line x1="${x}" y1="${(yM - 7).toFixed(1)}" x2="${x}" y2="${yB}" `
            + `stroke="var(--gold)" stroke-width="1.2" stroke-dasharray="4 4" opacity=".8"/>`
            // 끊긴 자리 — 빗금 둘로 "여기는 잰 거리가 아니다" 를 보인다
            + `<line x1="${x - 5}" y1="${(yM + 4).toFixed(1)}" x2="${x + 5}" y2="${(yM - 1).toFixed(1)}" `
            + `stroke="var(--gold)" stroke-width="1.4"/>`
            + `<line x1="${x - 5}" y1="${(yM + 1).toFixed(1)}" x2="${x + 5}" y2="${(yM - 4).toFixed(1)}" `
            + `stroke="var(--gold)" stroke-width="1.4"/>`
            + `<text x="${x + 8}" y="${(yM + 3).toFixed(1)}" font-size="9" fill="var(--gold)">`
            + `사거리 무제한</text>`;
    } else if (d > 0) {
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
      /* **도는 판정** — 조각 하나가 가운데를 중심으로 빙 돈다(피닉스 플라스마 절단기는
         두 바퀴, 키히라 회전 휩쓸기는 한 바퀴). 시간 손잡이만큼 돌려 놓고, **지나온
         자리**를 옅게 깔아 "여기까지 쓸고 갔다" 를 보인다. */
      const turn = (g.돌기 || 0) * at01;
      let mark = -1;                 // 돌릴 자리는 **지나온 자리를 깐 뒤**에 찍는다(아래)
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
      /* **특성이 범위를 바꿨으면 예전 크기를 점선으로** 남긴다. 숫자만 "반지름 9.5 →
         11.25" 라고 적어 두면 얼마나 넓어지는지 눈으로는 알 수가 없다. 채우지 않고
         테두리만 긋는다 — 채우면 "장판이 둘" 로 읽힌다. */
      const was = { 반지름: g.전반지름, 가로: g.전가로, 세로: g.전세로,
                    안쪽: g.전안쪽, 각도: g.전각도 };
      if (Object.values(was).some(v => v != null) || (wasD != null && g.자리 === '착지')) {
        const G = Object.assign({}, g);
        for (const k2 of Object.keys(was)) if (was[k2] != null) G[k2] = was[k2];
        const atW = (wasD != null && g.자리 === '착지') ? wasD + (g.거리 || 0) : at;
        const gl = `fill="none" stroke="${C}" stroke-width="1.3" stroke-dasharray="5 4" opacity=".6"`;
        if (G.꼴 === '원')
          body += `<circle cx="${px(0)}" cy="${py(atW)}" r="${G.반지름 * S}" ${gl}/>`;
        else if (G.꼴 === '부채꼴') {
          const o2 = arcPts(G.반지름, G.각도, atW);
          const p2 = G.안쪽 ? o2.concat(arcPts(G.안쪽, G.각도, atW).reverse())
                            : [[0, atW]].concat(o2);
          body += `<polygon points="${p2.map(q => px(q[0]) + ',' + py(q[1])).join(' ')}" ${gl}/>`;
        } else if (G.꼴 === '직사각형' && !G.쓸기)
          body += `<rect x="${px(-G.가로 / 2)}" y="${py(atW + G.세로 / 2)}" `
                + `width="${G.가로 * S}" height="${G.세로 * S}" ${gl}/>`;
      }
      /* **지나온 자리** — 도는 판정이 여태 쓸고 온 넓이. 도는 조각만 그리면 "앞에
         부채꼴 하나" 로 보이지만, 실제로 맞는 넓이는 이것이다.
         ⚠ **점선으로 긋지 않는다.** 이 그림에서 점선은 '거리 눈금'(시전 사거리·평타
         견줌)이 쓰는 표기라, 지나온 자리를 점선으로 두르면 "이것도 무슨 사거리인가"
         로 읽힌다. 옅게 채우고 **가는 실선**으로만 두른다 — 돌아가는 조각(진한 실선)의
         꼬리라는 게 한눈에 보이게. 안쪽이 빈 띠는 **고리 모양 다각형**으로 긋는다.
         (속을 덮는 원을 겹쳐 놓으면 그 안의 눈금과 영웅이 통째로 가려진다.) */
      if (turn) {
        const R0 = g.꼴 === '부채꼴' ? g.반지름 : (g.세로 || 0);
        const In = g.꼴 === '부채꼴' ? (g.안쪽 || 0) : 0;
        const half = (g.꼴 === '부채꼴' ? Math.min(g.각도 || 0, 360) : 0) / 2;
        const a0 = Math.min(0, turn) - half;
        const span = Math.min(Math.max(0, turn) + half - a0, 360);
        const ring = (R, from, to) => {
          const q = [];
          for (let t = from; t <= to + 0.01; t += 4)
            q.push([R * Math.sin(t * Math.PI / 180), R * Math.cos(t * Math.PI / 180)]);
          return q;
        };
        if (R0 > 0) {
          const out = ring(R0, a0, a0 + span);
          const back = In ? ring(In, a0, a0 + span).reverse() : [[0, 0]];
          body += `<polygon points="${out.concat(back).map(q2 => px(q2[0]) + ',' + py(q2[1])).join(' ')}" `
                + `fill="${C}" fill-opacity=".12" stroke="${C}" stroke-width="1" `
                + `stroke-opacity=".55"/>`;
        }
      }
      /* ⚠ **지나온 자리는 돌면 안 된다.** 아래 `rotate` 는 여기서부터 끝까지를 감싸므로,
         표식을 띠보다 앞에 찍으면 **띠까지 같이 돌아가** 조각과 어긋난 자리에 깔린다
         (180도 돌린 피닉스 Q 에서 띠가 반대쪽에 깔렸다). 띠를 다 깐 뒤에 찍는다. */
      mark = ((spin && spins(g)) || (aim && aims(g)) || turn) ? body.length : -1;
      if (g.꼴 === '자리들') {
        // 여러 지점에 차례로 생기는 기술(잘아타스 공허 걸음의 삼각형). 자리를 잇고 번호를 붙인다.
        /* **담은 차례가 없다.** 레오릭 망자의 묘실은 ㄷ 자 담이 한꺼번에 서는 것이라,
           칸마다 1~73 을 적으면 담은 안 보이고 숫자만 보인다. 칸을 네모로 깔아 담처럼
           보이게 하고 번호도 잇는 선도 안 그린다(`벽` 이 몇 장인지 자료에 적혀 있다). */
        if (g.벽) {
          /* 담 한 장을 **선 하나**로 긋는다. 칸마다 점을 찍고 1~73 번호를 매기면
             담은 안 보이고 숫자만 보인다(레오릭 묘실). 자료가 담의 두 끝을 준다. */
          (g.벽선 || []).forEach(seg => {
            body += `<line x1="${px(seg[0][0])}" y1="${py(seg[0][1] + at)}" `
                  + `x2="${px(seg[1][0])}" y2="${py(seg[1][1] + at)}" stroke="${C}" `
                  + `stroke-width="5" stroke-linecap="square" stroke-opacity=".85"/>`;
          });
          if (!(g.벽선 || []).length) {          // 두 끝을 못 받았으면 칸을 깔아 둔다
            const sz = Math.max(3, S * 0.26);
            (g.점 || []).forEach(p => {
              body += `<rect x="${px(p[0]) - sz / 2}" y="${py(p[1] + at) - sz / 2}" `
                    + `width="${sz}" height="${sz}" fill="${C}" fill-opacity=".55"/>`;
            });
          }
        } else {
        const pts = (g.점 || []).map(p => px(p[0]) + ',' + py(p[1] + at));
        body += `<polygon points="${pts.join(' ')}" fill="${C}" fill-opacity=".10" `
              + `stroke="${C}" stroke-width="1.2" stroke-dasharray="5 3"/>`;
        (g.점 || []).forEach((p, i) => {
          body += `<circle cx="${px(p[0])}" cy="${py(p[1] + at)}" r="4" fill="${C}"/>`
                + `<text x="${px(p[0]) + 6}" y="${py(p[1] + at) - 5}" font-size="9" `
                + `fill="${C}">${i + 1}</text>`;
        });
        }
      } else if (g.꼴 === '다각형') {
        /* 가늠자 다각형(`겉`)은 **어디까지 미치나**를 그린 것이라, 안에 든 탐색 상자와
           겹쳐 그리면 "부채 안에 상자가 하나 더" 로 보인다. 겉은 **테두리 쪽**으로,
           속을 채우는 것은 상자 쪽에 맡긴다. */
        const pp = (g.점 || []).map(p => px(p[0]) + ',' + py(p[1] + at)).join(' ');
        body += g.겉
          ? `<polygon points="${pp}" fill="${C}" fill-opacity=".08" stroke="${C}" `
            + `stroke-width="2" stroke-opacity=".9"/>`
          : `<polygon points="${pp}" ${fill}/>`;
      }
      else if (g.꼴 === '부채꼴' && g.조각방향 && g.조각방향.length) {
        /* **휩쓰는 기술** — 조각을 한꺼번에 깔면 "넓은 부채꼴 하나" 로 보여, 어느 쪽으로
           휘두르는지도 몇 번 휘두르는지도 안 보인다. 자료는 조각마다 방향(`FacingAdjustment`)
           과 차례(이름 끝의 Start/Mid/End · 1/2/3)를 적어 둔다 — 그대로 한 조각씩,
           손잡이가 가리키는 차례만 진하게 그리고 **휘두르는 쪽을 호 화살표**로 긋는다. */
        const seq = g.조각방향, wdt = g.조각각 || (g.각도 / seq.length);
        const base = g.차례시작 || 1, tot = Number(w['휩쓰는 차례']) || seq.length;
        /* **게임에서는 매끄럽게 돈다.** 자료가 조각 셋으로 적힌 까닭은 판정을 세 번
           굴리기 때문이고, 눈에 보이는 것은 **부채꼴 하나가 죽 돌아가는 모습**이다.
           조각을 뚝뚝 끊어 켜면 "세 번 찍는 기술" 로 읽힌다. 그래서 첫 조각 각에서 끝
           조각 각까지 **이어서** 돌리고, 지나온 자리는 그만큼 넓어진 부채꼴로 덮는다.
           (조각 수 x 조각각 이 적혀 있는 `각도` 와 맞는다 — 초 황혼의 망치 146+73=219≈220) */
        const where = at01 * tot;                       // 손잡이가 가리키는 '차례' 자리
        const u = Math.max(0, Math.min(1, (where - (base - 1)) / seq.length));
        if (u > 0) {
          const a0 = seq[0], aN = seq[seq.length - 1];
          const now = a0 + (aN - a0) * u;               // 지금 겨누는 쪽
          const cone = (A, rot, op, sw, so) => {
            const pts = [[0, 0]].concat(arcPts(g.반지름, A, 0))
                         .map(q => px(q[0]) + ',' + py(q[1])).join(' ');
            body += `<g transform="rotate(${rot} ${px(0)} ${py(0)})">`
                  + `<polygon points="${pts}" fill="${C}" fill-opacity="${op}" `
                  + `stroke="${C}" stroke-width="${sw}" stroke-opacity="${so}"/></g>`;
          };
          // ① 지나온 자리 — 시작 쪽부터 지금 쪽까지 통째로(옅게)
          cone(Math.abs(now - a0) + wdt, (a0 + now) / 2, '.07', 1, '.45');
          // ② 지금 자리 — 한 조각 너비로(진하게)
          cone(wdt, now, g.직격 ? '.30' : '.18', 1.6, '1');
        }
        // **휘두르는 쪽** — 첫 조각에서 끝 조각으로 호를 따라 화살표 하나
        if (seq.length > 1 && u > 0) {
          const RA = g.반지름 * 0.62, a0 = seq[0], a1 = seq[seq.length - 1];
          const step = a1 > a0 ? 4 : -4, qs = [];
          for (let t = a0; (step > 0 ? t <= a1 : t >= a1); t += step)
            qs.push(px(RA * Math.sin(t * Math.PI / 180)) + ','
                  + py(RA * Math.cos(t * Math.PI / 180)));
          const hx = px(RA * Math.sin(a1 * Math.PI / 180)), hy = py(RA * Math.cos(a1 * Math.PI / 180));
          body += `<polyline points="${qs.join(' ')}" fill="none" stroke="var(--fg)" `
                + `stroke-width="1.4" opacity=".55"/>`
                + `<g transform="rotate(${a1 + (a1 > a0 ? 90 : -90)} ${hx} ${hy})">`
                + `<polygon points="${hx},${hy - 5} ${hx - 7},${hy + 3} ${hx + 7},${hy + 3}" `
                + `fill="var(--fg)" opacity=".55"/></g>`;
        }
      }
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
        /* **막는 구조물은 테두리를 실선으로** 긋는다 — 점선은 거리 고리 몫이라(규칙 95)
           섞어 쓰면 '얼마나 먼가' 로 읽힌다. 감옥·좀비 벽은 **지나갈 수 없는 담**이다.
           자리마다 네모를 깔아 담 한 칸씩이라는 것도 보이게 한다(묘실과 같은 꼴). */
        body += `<circle cx="${px(0)}" cy="${py(0)}" r="${g.반지름 * S}" fill="${C}" `
              + `fill-opacity=".05" stroke="${C}" stroke-width="2.4" stroke-opacity=".85"/>`;
        const bz = Math.max(4, S * 0.5);
        for (let i = 0; i < (g.수 || 0); i++) {
          const t = i * 2 * Math.PI / g.수;
          const bx = px(Math.sin(t) * g.반지름), by = py(Math.cos(t) * g.반지름);
          body += `<rect x="${bx - bz / 2}" y="${by - bz / 2}" width="${bz}" height="${bz}" `
                + `fill="${C}" fill-opacity=".75" stroke="${C}" stroke-width="1"/>`;
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
        /* 다만 **제자리를 가운데 두는 상자**는 앞뒤로 절반씩이다(규칙 96) — 도살자
           힘줄 끊기는 세로 7 이지만 앞으로 미치는 거리는 3.5 다(가늠자도 3.5). */
        const y0 = g.가운데 ? g.세로 / 2 : g.세로;
        body += `<rect x="${px(sx - g.가로 / 2)}" y="${py(y0)}" width="${g.가로 * S}" `
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
      } else if (g.유지) {
        /* **닿는 넓이가 아니라 "이 안에 머물러야 이어진다" 는 거리**(폴스타트 피뢰침).
           속을 칠하면 "여기 있는 모두를 때린다" 로 읽히므로 **테두리만** 긋는다. */
        body += `<circle cx="${px(0)}" cy="${py(at)}" r="${g.반지름 * S}" fill="none" `
              + `stroke="${C}" stroke-width="1.6" stroke-dasharray="7 5" opacity=".9"/>`
              + `<text x="${px(0) + 4}" y="${py(at) - g.반지름 * S - 4}" font-size="9" `
              + `fill="${C}" opacity=".95">여기 벗어나면 끊김 ${g.반지름}</text>`;
      } else {
        body += `<circle cx="${px(0)}" cy="${py(at)}" r="${g.반지름 * S}" ${fill}/>`;
        if (g.작은)   // 충전으로 커지는 원 — 처음 크기(충전 안 했을 때)를 점선으로
          body += `<circle cx="${px(0)}" cy="${py(at)}" r="${g.작은 * S}" fill="none" `
                + `stroke="${C}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
      }
      if (mark >= 0) {   // 제 기준점에서 돌린다(화면은 y 가 아래라 +가 시계 방향)
        const deg = ((spin && spins(g)) ? spin : 0)
                  + ((aim && aims(g)) ? aim.각 : 0) + turn;
        body = body.slice(0, mark)
             + `<g transform="rotate(${deg.toFixed(1)} ${px(0).toFixed(1)} `
             + `${py(pivot(g)).toFixed(1)})">` + body.slice(mark) + '</g>';
      }
    });
    // 방향이 있는 기술은 **화살표**로 어디로 가는지 보여 준다 — 날아가는 거리,
    // 없으면 부채꼴·다각형이 뻗은 길이만큼.
    let arrow = 0;
    gs.forEach(g => {
      arrow = Math.max(arrow, g.쓸기 || 0, g.날아감 || 0,
                       Math.min(g.거리 || 0, 12),          // 끌기·이동은 12 까지만 긋는다
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
    body += `<text x="4" y="${H - 5}" font-size="10" fill="var(--hit)">히트박스 반지름 ${hr}</text>`;
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
                 freeCast ? `<b class="c-rng">⇢</b> 사거리 <b>무제한</b> — 지도 어디에나 놓는다`
                 : d > 0 ? `<b class="c-rng">◌</b> ${(w || {})['기준'] === '일반 공격이 닿는 곳' ? '일반 공격 사거리' : '시전 사거리'} ${d}` : '',
                 sr > 0 ? `◌ 이 안에서 찾음 ${sr}` : '',
                 dead > 0 ? `<b class="c-dim">◌</b> 최소 ${dead} 안쪽은 못 씀` : '',
                 farCast ? `시전 사거리 ${farCast} 은 너무 멀어 격자에 안 그림` : '',
                 gs.some(g => g.편 === '적') ? `<b class="c-foe">■</b> 적에게` : '',
                 gs.some(g => g.편 === '아군') ? `<b class="c-ally">■</b> 아군에게` : '',
                 gs.some(g => g.편 === '둘 다') ? `<b class="c-both">■</b> 적·아군 모두` : '',
                 gs.some(g => g.편 === '자신') ? `<b class="c-self">■</b> 나에게만(제 몸에 거는 구역)` : '',
                 names ? `범위 ${esc(names)}` : '',
                 gs.some(g => g.직격 && !g.유지) ? `진한 쪽은 한 명만 맞는 직격` : '',
                 gs.some(g => g.유지)
                   ? `<b class="c-dim">◌</b> 점선 안은 맞는 범위가 아니라 <b>붙어 있어야 하는 거리</b>` : '',
                 gs.some(g => g.꼴 === '나선' && g.반지름)
                   ? `<b class="c-dim">⌁</b> 나선은 도는 모양만 눈대중 — 반지름은 자료로 잰 상한`
                   : gs.some(g => g.꼴 === '나선')
                   ? `<b class="c-dim">⌁</b> 나선은 눈대중 — 뻗는 거리는 자료에 없다` : '',
                 (wasD != null || gs.some(g => g.전반지름 != null || g.전가로 != null
                                            || g.전세로 != null || g.전각도 != null))
                   ? `<b class="c-dim">◌</b> 점선은 <b>특성 찍기 전</b> 크기` : '',
                 gs.some(g => g.조각방향) ? `<b class="c-rng">◍</b> 조각을 <b>차례로</b> 휘두른다 — `
                   + `화살표가 휘두르는 쪽, 손잡이가 차례` : '',
                 gs.some(g => g.꼴 === '모르는 이동')
                   ? `<b class="c-dim">⌁</b> 화살표는 방향만 — 거리는 자료에 없다` : '',
                 yard.map(([k, r]) => `<b class="c-yard">⌁</b> ${esc(k)} ${r}`).join(' · ')]
                .filter(Boolean).join(' · ');
    let bar = '';
    if ((span || canSpin || canTurn || chg || canAim) && !opt.막대끔) {
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
        const chgNm = chg.도는중 ? '도는 중' : chg.휩쓰는중 ? '휩쓰는 중' : '모으기';
        inner += `<span class="cvl">${chgNm}</span>`
               + `<input type="range" class="cvt" min="0" max="1" step="any" `
               + `value="${at01}" aria-label="${chgNm} 시간">`
               + `<span class="cvn cvs">${chgLabel(chg, at01)}</span>`;
      }
      if (canTurn) inner += `<span class="cvl">방향</span>` + dialHTML(spin);
      if (canSpin) inner += `<span class="cvl">끌기</span>` + dragHTML(spin);
      /* 겨냥 손잡이 — 처음 자리는 **사거리 끝, 앞쪽**이다(예전 그림과 같은 자리). */
      const a0 = aim || { 각: 0, 거리: aimMax };
      if (canAim) inner += `<span class="cvl">겨냥</span>` + aimHTML(a0.각, a0.거리, aimMax);
      bar = `<div class="cv" data-cv="${id}" data-deg="${spin}"`
          + (canAim ? ` data-aimdeg="${a0.각}" data-aimdist="${a0.거리}" `
                    + `data-aimmax="${aimMax}"` : '')
          + `>${inner}</div>`;
    }
    /* **크게 보기 단추**는 늘 넣어 둔다 — 보일지 말지는 CSS 가 정한다
       (`hotsShape.크게(…)` 로 자료를 대 주는 화면에서만 뜬다). 그림 안에 넣어야
       그림을 옮겨도 같이 따라다니고, 다시 그릴 때(svg·꼬리말만 갈아 끼운다)도 안 날아간다. */
    return `<div class="fig"><button type="button" class="figz" aria-label="크게 보기">⤢</button>`
         + `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" `
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
  /* **겨냥 다이얼(조이스틱).** 제자리에서 터지는 기술은 자리를 고를 게 없지만,
     사거리 안의 **한 점을 찍는 기술**은 플레이어가 어디에 놓을지 정한다. 앞쪽 끝에
     한 장면만 그려 두면 "앞으로만 쓰는 기술" 로 읽히고, 가까이 찍었을 때 내 몸과
     얼마나 겹치는지도 안 보인다. 그래서 **원 안에서 자리를 끌어 옮기는** 손잡이를 둔다.

     방향 다이얼(`.cvd`)과 다른 점은 **거리까지 함께** 정한다는 것이다. 바늘이 아니라
     꼭지를 원 안에서 옮긴다 — 가운데가 제자리, 테두리가 사거리 끝. */
  const aimWay = deg => wayName(deg);
  function aimHTML(deg, dist, max) {
    const R = 19, cx = 23, cy = 23;
    const r0 = max > 0 ? Math.max(0, Math.min(1, dist / max)) * R : 0;
    const a0 = deg * Math.PI / 180;
    let ring = '';
    for (let t = 0; t < 360; t += 45) {
      const a1 = t * Math.PI / 180;
      ring += `<line x1="${(cx + (R - 3) * Math.sin(a1)).toFixed(1)}" `
            + `y1="${(cy - (R - 3) * Math.cos(a1)).toFixed(1)}" `
            + `x2="${(cx + R * Math.sin(a1)).toFixed(1)}" `
            + `y2="${(cy - R * Math.cos(a1)).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`;
    }
    return `<svg class="cva" viewBox="0 0 46 46" width="46" height="46" tabindex="0" `
         + `role="slider" aria-label="끌어서 정할 자리(사거리 안)" aria-valuemin="0" `
         + `aria-valuemax="${max}" aria-valuenow="${Math.round(dist * 10) / 10}">`
         + `<circle cx="${cx}" cy="${cy}" r="${R}" fill="var(--card2)" `
         + `stroke="var(--ally)" stroke-width="1.2"/>${ring}`
         + `<circle cx="${cx}" cy="${cy}" r="2" fill="var(--dim)"/>`
         + `<line class="cvaL" x1="${cx}" y1="${cy}" `
         + `x2="${(cx + r0 * Math.sin(a0)).toFixed(1)}" y2="${(cy - r0 * Math.cos(a0)).toFixed(1)}" `
         + `stroke="var(--ally)" stroke-width="1.4" stroke-dasharray="3 2"/>`
         + `<circle class="cvaK" cx="${(cx + r0 * Math.sin(a0)).toFixed(1)}" `
         + `cy="${(cy - r0 * Math.cos(a0)).toFixed(1)}" r="4.6" fill="var(--ally)" `
         + `stroke="var(--card)" stroke-width="1.2"/></svg>`
         + `<span class="cvn cvay">${aimWay(deg)} ${Math.round(dist * 10) / 10}</span>`;
  }
  function paintAim(box) {
    const max = Number(box.dataset.aimmax) || 0;
    const deg = Number(box.dataset.aimdeg) || 0;
    const dist = Math.max(0, Math.min(max, Number(box.dataset.aimdist) || 0));
    const R = 19, cx = 23, cy = 23;
    const r0 = max > 0 ? (dist / max) * R : 0, a0 = deg * Math.PI / 180;
    const x = (cx + r0 * Math.sin(a0)).toFixed(1), y = (cy - r0 * Math.cos(a0)).toFixed(1);
    const L = box.querySelector('.cvaL'), K = box.querySelector('.cvaK');
    if (L) { L.setAttribute('x2', x); L.setAttribute('y2', y); }
    if (K) { K.setAttribute('cx', x); K.setAttribute('cy', y); }
    const s = box.querySelector('.cva');
    if (s) s.setAttribute('aria-valuenow', Math.round(dist * 10) / 10);
    const lab = box.querySelector('.cvay');
    if (lab) lab.textContent = `${aimWay(deg)} ${Math.round(dist * 10) / 10}`;
  }
  function setAim(box, deg, dist, ev) {
    const max = Number(box.dataset.aimmax) || 0;
    box.dataset.aimdeg = ((Math.round(deg / 5) * 5 % 360) + 360) % 360;
    box.dataset.aimdist = Math.max(0, Math.min(max, Math.round(dist * 20) / 20));
    paintAim(box);
    redraw(box);
    if (ev && ev.cancelable) ev.preventDefault();
  }
  /* 꼭지를 끌 때 쓰는 자리 셈 — 원 밖으로 끌면 테두리에 붙는다(사거리 끝). */
  function aimAt(svg, ev, max) {
    const r = svg.getBoundingClientRect();
    const dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
    const deg = Math.atan2(dx, -dy) * 180 / Math.PI;
    const R = r.width / 2 * (19 / 23);                 // 그림의 테두리 반지름만큼
    const dist = Math.min(1, Math.hypot(dx, dy) / (R || 1)) * max;
    return [deg, dist];
  }
  /* **끌기 다이얼.** 눌러 끌어서 쏘는 기술(알라라크 염동력·메이 빙벽)이 쓴다. 방향
     다이얼과 한눈에 갈리게 **네모 틀 + 점선 화살표**로 그린다 — '끌어 당긴다' 는 몸짓
     그대로다. 값은 방향 다이얼과 같은 `data-deg` 라 코드가 둘로 갈리지 않는다. */
  function dragHTML(deg) {
    const c = 22, R = 16, a0 = deg * Math.PI / 180;
    const x = (c + R * Math.sin(a0)), y = (c - R * Math.cos(a0));
    const h = 4.6, ax = Math.sin(a0), ay = -Math.cos(a0);
    const p1 = `${(x - h * ax + h * 0.62 * ay).toFixed(1)},${(y - h * ay - h * 0.62 * ax).toFixed(1)}`;
    const p2 = `${(x - h * ax - h * 0.62 * ay).toFixed(1)},${(y - h * ay + h * 0.62 * ax).toFixed(1)}`;
    return `<svg class="cvg" viewBox="0 0 44 44" width="44" height="44" tabindex="0" `
         + `role="slider" aria-label="끌어서 쏘는 방향" aria-valuemin="0" aria-valuemax="359" `
         + `aria-valuenow="${Math.round(deg)}">`
         + `<rect x="3.5" y="3.5" width="37" height="37" rx="7" fill="none" `
         + `stroke="var(--both)" stroke-width="1.2"/>`
         + `<circle cx="${c}" cy="${c}" r="2.4" fill="var(--both)"/>`
         + `<line class="cvp" x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" `
         + `stroke="var(--both)" stroke-width="1.8" stroke-dasharray="4 2.5"/>`
         + `<polygon class="cvh" points="${x.toFixed(1)},${y.toFixed(1)} ${p1} ${p2}" `
         + `fill="var(--both)"/></svg>`
         + `<span class="cvn cvw">${wayName(deg)}</span>`;
  }
  function paintDial(box) {
    const deg = Number(box.dataset.deg) || 0, a0 = deg * Math.PI / 180;
    const p = box.querySelector('.cvp'), d0 = box.querySelector('.cvd, .cvg');
    const R = box.querySelector('.cvg') ? 16 : 16;
    const x = 22 + R * Math.sin(a0), y = 22 - R * Math.cos(a0);
    if (p) { p.setAttribute('x2', x.toFixed(1)); p.setAttribute('y2', y.toFixed(1)); }
    const h0 = box.querySelector('.cvh');          // 끌기 다이얼의 화살촉
    if (h0) {
      const h = 4.6, ax = Math.sin(a0), ay = -Math.cos(a0);
      h0.setAttribute('points', `${x.toFixed(1)},${y.toFixed(1)} `
        + `${(x - h * ax + h * 0.62 * ay).toFixed(1)},${(y - h * ay - h * 0.62 * ax).toFixed(1)} `
        + `${(x - h * ax - h * 0.62 * ay).toFixed(1)},${(y - h * ay + h * 0.62 * ax).toFixed(1)}`);
    }
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
    if (box.dataset.aimmax) {
      o.겨냥 = { 각: Number(box.dataset.aimdeg) || 0,
                 거리: Number(box.dataset.aimdist) || 0 };
    }
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
      const a0 = e.target.closest && e.target.closest('.cva');
      if (a0) {
        try { a0.setPointerCapture(e.pointerId); } catch (x) {}
        a0.dataset.grab = '1';
        const box = a0.closest('.cv');
        const [dg, ds] = aimAt(a0, e, Number(box.dataset.aimmax) || 0);
        setAim(box, dg, ds, e);
        return;
      }
      const d0 = e.target.closest && e.target.closest('.cvd, .cvg');
      if (!d0) return;
      try { d0.setPointerCapture(e.pointerId); } catch (x) {}   // 못 잡아도 돌아는 간다
      d0.dataset.grab = '1';
      setDeg(d0.closest('.cv'), degAt(d0, e), e);
    }, true);
    g.addEventListener('pointermove', e => {
      const a0 = e.target.closest && e.target.closest('.cva');
      if (a0 && a0.dataset.grab === '1') {
        const box = a0.closest('.cv');
        const [dg, ds] = aimAt(a0, e, Number(box.dataset.aimmax) || 0);
        setAim(box, dg, ds, e);
        return;
      }
      const d0 = e.target.closest && e.target.closest('.cvd, .cvg');
      if (d0 && d0.dataset.grab === '1') setDeg(d0.closest('.cv'), degAt(d0, e), e);
    }, true);
    g.addEventListener('pointerup', e => {
      const a0 = e.target.closest && e.target.closest('.cva');
      if (a0) delete a0.dataset.grab;
      const d0 = e.target.closest && e.target.closest('.cvd, .cvg');
      if (d0) delete d0.dataset.grab;
    }, true);
    g.addEventListener('keydown', e => {
      const a0 = e.target.closest && e.target.closest('.cva');
      if (a0) {
        // 좌우로 방향, 위아래로 거리 — 사거리의 1/20 씩 움직인다
        const box = a0.closest('.cv'), max = Number(box.dataset.aimmax) || 0;
        const dg = Number(box.dataset.aimdeg) || 0, ds = Number(box.dataset.aimdist) || 0;
        const st = Math.max(0.25, Math.round(max / 20 * 4) / 4);
        if (e.key === 'ArrowRight') return setAim(box, dg + 5, ds, e);
        if (e.key === 'ArrowLeft') return setAim(box, dg - 5, ds, e);
        if (e.key === 'ArrowUp') return setAim(box, dg, ds + st, e);
        if (e.key === 'ArrowDown') return setAim(box, dg, ds - st, e);
        if (e.key === 'Home') return setAim(box, 0, max, e);
        return;
      }
      const d0 = e.target.closest && e.target.closest('.cvd, .cvg');
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

  /* ── 크게 보기 ──────────────────────────────────────────────────────────
     카드가 좁아 깨알로 보이는 그림을 큰 판에 띄운다. **베껴 그리지 않고 `.fig` 를
     통째로 옮겨 온다** — 다이얼·시간 손잡이·거리 막대가 그대로 따라온다(동작은 모두
     document 에 걸려 있어 자리를 옮겨도 먹는다). 닫을 때 돌려놓으려고 **자리 표식**
     (주석 마디)을 꽂아 둔다.

     쓰는 쪽은 `hotsShape.크게(fig => 정보)` 로 **그림 하나를 무엇이라 부를지**만 대 준다:
       { 꼬리표, 앞말, 이름, 영웅, 링크, 링크글, 설명, 칸들 }
     `설명` 은 글이거나 **약속(Promise)** 이어도 된다 — 범위 구경은 그때 가서 받아 온다.
     `꼬리표`·`칸들` 은 쓰는 쪽이 만든 조각이라 그대로 싣는다(이미 `esc` 를 거친 것). */
  let SAY = null, ZBACK = null, ZSLOT = null, ZBOX = null;

  function zoomShell() {
    if (ZBOX) return ZBOX;
    const d = document.createElement('div');
    d.className = 'hz';
    d.hidden = true;
    d.innerHTML = '<div class="hzbox" role="dialog" aria-modal="true" aria-labelledby="hz-nm">'
      + '<div class="hzhead"><div class="hzh1"><span class="hz-tag"></span>'
      + '<span class="of hz-of"></span><span class="nm" id="hz-nm"></span>'
      + '<span class="who hz-who"></span><a class="go hz-go scrap-tap" href="./">도감 ↗</a></div>'
      + '<button type="button" class="hzx scrap-tap" aria-label="닫기">✕</button></div>'
      + '<div class="hzbody"><div class="hzfig"></div><div class="hzside">'
      + '<p class="hzsay"></p><div class="hznums"></div><p class="hzhint"></p>'
      + '</div></div></div>';
    document.body.appendChild(d);
    d.addEventListener('click', e => {
      if (e.target === d || e.target.closest('.hzx')) zoomClose();
    });
    ZBOX = d;
    return d;
  }

  function zoomOpen(fig, info) {
    if (!fig || ZBACK) return;
    const d = zoomShell(), q = x => d.querySelector(x);
    info = info || {};
    q('.hz-tag').innerHTML = info['꼬리표'] || '';
    q('.hz-of').textContent = info['앞말'] || '';
    q('#hz-nm').textContent = info['이름'] || '';
    q('.hz-who').textContent = info['영웅'] || '';
    const go = q('.hz-go');
    go.hidden = !info['링크'];
    if (info['링크']) { go.href = info['링크']; go.textContent = info['링크글'] || '도감 ↗'; }
    q('.hznums').innerHTML = info['칸들'] || '';
    const cv = fig.querySelector('.cv');
    q('.hzhint').textContent = cv
      ? (cv.querySelector('.cvd') ? '다이얼을 끌면 방향이 돌아갑니다(화살표 키로도). ' : '')
        + (cv.querySelector('.cvt') ? '손잡이를 밀면 시간에 따라 어떻게 되는지 보입니다. ' : '')
        + (cv.querySelector('.cvr') ? '막대를 밀면 모이는 자리가 움직입니다.' : '')
      : '';
    const say = q('.hzsay'), txt = info['설명'];
    const put = t => { say.textContent = t || '게임이 적어 둔 설명이 없습니다.';
                       say.className = 'hzsay' + (t ? '' : ' wait'); };
    if (txt && typeof txt.then === 'function') {
      say.textContent = '설명 불러오는 중…'; say.className = 'hzsay wait';
      txt.then(t => { if (ZBACK) put(t); }, () => { if (ZBACK) put(null); });
    } else put(txt);
    ZBACK = fig;
    ZSLOT = document.createComment('fig');
    fig.parentNode.replaceChild(ZSLOT, fig);
    q('.hzfig').appendChild(fig);
    d.hidden = false;
    document.body.style.overflow = 'hidden';
    q('.hzx').focus();
  }

  function zoomClose() {
    if (ZBACK && ZSLOT && ZSLOT.parentNode) ZSLOT.parentNode.replaceChild(ZBACK, ZSLOT);
    ZBACK = ZSLOT = null;
    if (ZBOX) ZBOX.hidden = true;
    document.body.style.overflow = '';
  }

  function zoomWire(fn) {
    SAY = fn;
    document.documentElement.dataset.hotsZoom = '1';     // CSS 가 단추를 꺼내 준다
    if (zoomWire.on) return;
    zoomWire.on = true;
    document.addEventListener('click', e => {
      if (!SAY || ZBACK || !e.target.closest) return;
      if (e.target.closest('.hz') || e.target.closest('.cv') || e.target.closest('a')) return;
      const hit = e.target.closest('.figz') || e.target.closest('.fig > svg');
      if (!hit) return;
      const fig = hit.closest('.fig');
      if (fig) zoomOpen(fig, SAY(fig));
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && ZBACK) zoomClose();
    });
  }

  g.hotsShape = { svg: shapeSVG, graph: graphSVG, side: SIDEC, esc: esc,
                  크게: zoomWire, 크게끄기: zoomClose, 크게중: () => !!ZBACK };
})(window);
