/* HotS Scrap 공통 계층 — 전역 바 + 테마(scrap.theme, 전 페이지 공유)
   사용: <script src=".../shared/scrap.js" defer></script> 한 줄.
   이 파일을 고치면 이 스크립트를 부르는 모든 페이지에 반영된다. */
(function () {
  var KEY = 'scrap.theme';
  var sc = document.currentScript;
  var BASE = (sc && sc.src) ? sc.src.replace(/shared\/scrap\.js.*$/, '') : '../';

  function cur() {
    var t = null;
    try { t = localStorage.getItem(KEY); } catch (e) {}
    if (!t) t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    return t;
  }

  function addBar() {
    if (document.getElementById('scrap-bar')) return;
    var d = document.createElement('div');
    d.id = 'scrap-bar';
    d.innerHTML = '<a id="scrap-brand" href="' + BASE + '" style="font-weight:600;letter-spacing:0.3px;text-decoration:none;display:inline-flex;align-items:center;gap:6px;"><img id="scrap-logo" src="' + BASE + 'shared/logo_light.svg" alt="" style="height:18px;width:18px;"> HotS Scrap</a>'
      + '<span style="position:absolute;right:8px;top:50%;transform:translateY(-50%);display:flex;gap:6px;align-items:center;">'
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
      d.style.cssText = marginCss + 'padding:6px 96px;text-align:center;font:13px/1 "Malgun Gothic","Segoe UI",sans-serif;position:relative;z-index:99999;'
        + (light ? 'background:#e8eef7;border-bottom:2px solid #c8a24b;' : 'background:#0b1526;border-bottom:2px solid #8a6d2f;');
      document.getElementById('scrap-brand').style.color = light ? '#a97e1f' : '#e8c268';
      document.getElementById('scrap-logo').src = BASE + 'shared/' + (light ? 'logo.svg' : 'logo_light.svg');
      var ctl = light ? 'background:#ffffff;border:1px solid #cdd9ea;color:#31405a;' : 'background:#132b4d;border:1px solid #233a5c;color:#eaf1fa;';
      btn.style.cssText = 'border-radius:99px;padding:4px 10px;cursor:pointer;font-size:12px;line-height:1;' + ctl;
      document.getElementById('scrap-gh').style.cssText = 'text-decoration:none;font-size:12px;line-height:1;border-radius:99px;padding:4px 10px;' + ctl;
      btn.textContent = light ? '☀ Light' : '☾ Dark';
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
