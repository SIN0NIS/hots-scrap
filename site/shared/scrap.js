/* HotS Scrap 공통 계층 — 전역 바 + 테마(scrap.theme, 전 페이지 공유)
   사용: <script src=".../shared/scrap.js" defer></script> 한 줄.
   이 파일을 고치면 이 스크립트를 부르는 모든 페이지에 반영된다. */
(function () {
  var KEY = 'scrap.theme';
  var sc = document.currentScript;
  var BASE = (sc && sc.src) ? sc.src.replace(/shared\/scrap\.js.*$/, '') : '../';

  /* 공통 CSS 도 여기서 같이 끌어온다 — 앱은 이 스크립트 한 줄만 부르면 된다.
     예전에는 scrap.css 를 <link> 로 부르는 앱이 패치 기록 하나뿐이라,
     공통 계층에 규칙을 넣어도 나머지 네 앱에는 닿지 않았다. */
  if (!document.querySelector('link[data-scrap-css]')) {
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = BASE + 'shared/scrap.css';
    l.setAttribute('data-scrap-css', '');
    (document.head || document.documentElement).appendChild(l);
  }

  function cur() {
    var t = null;
    try { t = localStorage.getItem(KEY); } catch (e) {}
    if (!t) t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    return t;
  }

  /* **어느 페이지에서든 네 갈래로 오간다.** 앱마다 머리줄을 따로 두면 하나 늘 때마다
     여러 군데를 고쳐야 한다 — 전역 바가 이미 모든 화면에 깔리니 여기 한 자리에 둔다.
     메인의 큰 타일 넷과 **같은 이름·같은 차례**라 어디 있든 길이 같아 보인다.
     지금 보고 있는 갈래는 눌러도 제자리이므로 글자만 또렷하게 해 둔다. */
  var NAV = [
    ['builds/?ch=live', '특성 찍기', ['builds'], 'talent'],
    ['herodex/', '위키', ['herodex', 'encyclopedia', 'patchnotes', 'tier'], 'codex'],
    ['replay/', '리플레이', ['replay'], 'replay'],
    ['https://sin0nis.github.io/hots_hero_m3/', '뷰어', [], 'viewer']
  ];

  function navLinks() {
    var here = location.pathname, out = '';
    for (var i = 0; i < NAV.length; i++) {
      var n = NAV[i], on = false;
      for (var j = 0; j < n[2].length; j++)
        if (here.indexOf('/' + n[2][j] + '/') >= 0) on = true;
      /* 아이콘은 **마스크**로 깐다 — `<img>` 로 넣으면 색이 파일에 박혀 밝기 전환을
         안 따라온다. 마스크면 바탕이 `currentColor` 라 글자와 같은 색으로 움직인다. */
      out += '<a class="scrap-nav' + (on ? ' on' : '') + '" title="' + n[1] + '" href="'
           + (/^https?:/.test(n[0]) ? n[0] : BASE + n[0]) + '">'
           + '<i class="scrap-ic ic-' + n[3] + '" aria-hidden="true"></i>'
           + '<span>' + n[1] + '</span></a>';
    }
    return '<span id="scrap-nav">' + out + '</span>';
  }

  /* **이 화면의 사용법으로 바로.** 사용법(guide/)은 앱마다 단락이 있어, 보고 있는 화면에 맞는
     단락으로 보낸다. 더 구체적인 것(도감 안의 범위 구경·통계)을 먼저 본다. 사용법 안에서는 안 띄운다. */
  var HELP = [
    [/\/herodex\/shapes/, 'herodex-shapes'], [/\/herodex\/stats/, 'herodex-stats'], [/\/herodex\//, 'herodex'],
    [/\/builds\//, 'builds'], [/\/encyclopedia\//, 'ency'], [/\/patchnotes\//, 'patch'],
    [/\/tier\//, 'tier'], [/\/replay\//, 'replay'], [/hots_hero_m3/, 'viewer']
  ];
  function helpLink() {
    var here = location.pathname;
    if (/\/guide\//.test(here)) return '';
    var at = 'start';
    for (var i = 0; i < HELP.length; i++) if (HELP[i][0].test(here)) { at = HELP[i][1]; break; }
    return '<a id="scrap-help" href="' + BASE + 'guide/#' + at + '" title="이 화면 사용법" '
         + 'style="text-decoration:none;font-size:12px;line-height:1;border-radius:99px;padding:4px 9px;font-weight:700;">?</a>';
  }

  function addBar() {
    if (document.getElementById('scrap-bar')) return;
    var d = document.createElement('div');
    d.id = 'scrap-bar';
    d.innerHTML = '<a id="scrap-brand" href="' + BASE + '" style="font-weight:600;letter-spacing:0.3px;text-decoration:none;display:inline-flex;align-items:center;gap:6px;"><img id="scrap-logo" src="' + BASE + 'shared/logo_light.svg" alt="" style="height:18px;width:18px;"><span class="scrap-bt"> HotS Scrap</span></a>'
      + navLinks()
      + '<span id="scrap-tools">'
      + helpLink()
      + '<button id="scrap-theme-btn" type="button" title="다크/라이트 전환 — 모든 화면에 적용" style="border-radius:99px;padding:4px 10px;cursor:pointer;font-size:12px;line-height:1;">◐</button>'
      + '<a id="scrap-gh" href="https://github.com/SIN0NIS/hots-scrap" target="_blank" rel="noopener" title="GitHub 저장소" style="text-decoration:none;font-size:12px;line-height:1;border-radius:99px;padding:4px 10px;">🔗</a>'
      + '</span>';
    document.body.prepend(d);

    // 페이지 body 에 패딩이 있으면 바가 안쪽으로 밀리니 음수 마진으로 상쇄한다
    var cs = getComputedStyle(document.body);
    var marginCss = '';
    if (parseFloat(cs.paddingTop) > 0 || parseFloat(cs.paddingLeft) > 0) {
      marginCss = 'margin:-' + cs.paddingTop + ' -' + cs.paddingRight + ' 18px -' + cs.paddingLeft + ';';
    }

    // 배경 워터마크 — 빈 공간에만 은은하게 비치는 큰 로고 (콘텐츠 뒤 z:-1)
    if (!document.getElementById('scrap-wm')) {
      var wm = document.createElement('div');
      wm.id = 'scrap-wm';
      document.body.appendChild(wm);
    }

    // 뒤로가기 — 모든 페이지 우측 하단 (돌아갈 기록이 있을 때만)
    if (!document.getElementById('scrap-back') && history.length > 1) {
      var bk = document.createElement('button');
      bk.id = 'scrap-back';
      bk.type = 'button';
      bk.title = '뒤로가기';
      bk.textContent = '←';
      bk.addEventListener('click', function () { history.back(); });
      document.body.appendChild(bk);
    }

    var btn = document.getElementById('scrap-theme-btn');
    function paint() {
      var light = cur() === 'light';
      document.documentElement.setAttribute('data-theme', cur());
      d.style.cssText = marginCss + 'font:13px/1 "Malgun Gothic","Segoe UI",sans-serif;position:relative;z-index:99999;'
        + (light ? 'background:#e8eef7;border-bottom:2px solid #c8a24b;' : 'background:#0b1526;border-bottom:2px solid #8a6d2f;');
      document.getElementById('scrap-brand').style.color = light ? '#a97e1f' : '#e8c268';
      document.getElementById('scrap-logo').src = BASE + 'shared/' + (light ? 'logo.svg' : 'logo_light.svg');
      var ctl = light ? 'background:#ffffff;border:1px solid #cdd9ea;color:#31405a;' : 'background:#132b4d;border:1px solid #233a5c;color:#eaf1fa;';
      btn.style.cssText = 'border-radius:99px;padding:4px 10px;cursor:pointer;font-size:12px;line-height:1;' + ctl;
      document.getElementById('scrap-gh').style.cssText = 'text-decoration:none;font-size:12px;line-height:1;border-radius:99px;padding:4px 10px;' + ctl;
      var hp = document.getElementById('scrap-help');
      if (hp) hp.style.cssText = 'text-decoration:none;font-size:12px;line-height:1;border-radius:99px;padding:4px 9px;font-weight:700;' + ctl;
      // 낱말은 따로 싸 둔다 — 좁은 화면에서는 CSS 가 낱말을 접고 ☀/☾ 만 남긴다
      btn.innerHTML = light ? '☀<span class="scrap-tl"> Light</span>' : '☾<span class="scrap-tl"> Dark</span>';
      var wm2 = document.getElementById('scrap-wm');
      if (wm2) wm2.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;'
        + 'background:url(' + BASE + 'shared/' + (light ? 'logo.svg' : 'logo_light.svg') + ') center/72vmin no-repeat;'
        + 'opacity:' + (light ? '0.05' : '0.05') + ';';
      var bk2 = document.getElementById('scrap-back');
      if (bk2) {
        // 페이지가 자기 UI 와 겹치면 body 속성으로 위치를 옮길 수 있다
        var bkBottom = document.body.getAttribute('data-scrap-back-bottom') || '12px';
        var bkRight = document.body.getAttribute('data-scrap-back-right') || '12px';
        bk2.style.cssText = 'position:fixed;right:' + bkRight + ';bottom:' + bkBottom + ';z-index:99998;width:40px;height:40px;border-radius:50%;font-size:18px;line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.25);' + ctl;
      }
    }
    btn.addEventListener('click', function () {
      var next = cur() === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) {}
      paint();
      window.dispatchEvent(new CustomEvent('scrap-theme', { detail: cur() }));
    });
    paint();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addBar);
  else addBar();
  window.addEventListener('load', addBar);
})();
