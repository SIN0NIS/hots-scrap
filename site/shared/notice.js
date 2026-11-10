/* HotS Scrap 하단 알림 — 공식 한글판이 없는 최신 패치 노트(본 서버·테스트 서버)를 비공식 번역으로 제공한다고 알린다.
   자료: data/notice.json (pipeline/steps/build_patch_index.py 의 write_notice 가 만든다, 수백 바이트).
   - 세션당 한 번만 받는다(sessionStorage 에 담아 둔다) — 무료 호스팅이라 페이지마다 요청하지 않는다.
   - × 로 닫으면 이 세션 동안만 숨긴다. '이후로 알리지 않음' 을 체크하고 닫으면 그 노트(key)는 다시 안 띄운다.
     새 노트가 나오면 key 가 달라서 다시 알린다.
   - 그 노트를 보고 있는 페이지에서는 띄우지 않는다.
   허브(index.html)는 이 파일을 직접 부르고, 나머지 페이지는 scrap.js 가 불러 준다. 두 번 실려도 한 번만 돈다. */
(function () {
  if (window.__scrapNotice) return;
  window.__scrapNotice = true;

  var me = document.currentScript || document.querySelector('script[src*="shared/notice.js"]');
  var BASE = (me && me.src) ? me.src.replace(/shared\/notice\.js.*$/, '') : '../';
  var OFF = 'scrap.noticeOff', SEEN = 'scrap.noticeSeen', CACHE = 'scrap.noticeData';
  var CH = { live: '라이브(본 서버)', ptr: '테스트 서버(PTR)' };

  function get(store, k) { try { return JSON.parse(store.getItem(k) || 'null'); } catch (e) { return null; } }
  function put(store, k, v) { try { store.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function load(done) {
    var c = get(sessionStorage, CACHE);
    if (c) return done(c);
    fetch(BASE + 'data/notice.json')   // data/* 는 60초 캐시(cloudflare/extra/_headers) — 새 노트가 금방 닿는다
      .then(function (r) { return r.ok ? r.json() : { unofficial: [] }; })
      .then(function (d) { put(sessionStorage, CACHE, d); done(d); })
      .catch(function () {});
  }

  function css() {
    if (document.getElementById('scrap-notice-css')) return;
    var s = document.createElement('style');
    s.id = 'scrap-notice-css';
    var light = '--sn-bg:#ffffff;--sn-fg:#122036;--sn-bd:#c8a24b;--sn-sub:#4a5a73;--sn-link:#8a6414;';
    var dark = '--sn-bg:#101f38;--sn-fg:#eaf1fa;--sn-bd:#8a6d2f;--sn-sub:#a9b8cc;--sn-link:#f0c46a;';
    s.textContent =
      '#scrap-notice{' + light + 'position:fixed;left:12px;right:64px;bottom:var(--sn-bottom,12px);z-index:99997;margin:0 auto;max-width:620px;'
      + 'box-sizing:border-box;background:var(--sn-bg);color:var(--sn-fg);border:1px solid var(--sn-bd);border-left-width:4px;'
      + 'border-radius:12px;padding:10px 12px 10px 14px;box-shadow:0 6px 20px rgba(0,0,0,.22);'
      + 'font:13px/1.5 "Malgun Gothic","Segoe UI",sans-serif;display:flex;gap:10px;align-items:flex-start;}'
      + '@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) #scrap-notice{' + dark + '}}'
      + ':root[data-theme="dark"] #scrap-notice{' + dark + '}'
      + '#scrap-notice .sn-body{flex:1;min-width:0;}'
      + '#scrap-notice .sn-tag{display:inline-block;font-size:11px;font-weight:700;padding:1px 7px;border-radius:99px;background:#7c3aed;color:#fff;margin-right:6px;vertical-align:1px;}'
      + '#scrap-notice .sn-line{margin:2px 0;}'
      + '#scrap-notice a.sn-go{color:var(--sn-link);font-weight:700;text-decoration:underline;white-space:nowrap;}'
      + '#scrap-notice .sn-foot{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin-top:6px;font-size:12px;color:var(--sn-sub);}'
      + '#scrap-notice label{cursor:pointer;display:inline-flex;align-items:center;gap:5px;}'
      + '#scrap-notice .sn-x{border:0;background:none;color:inherit;font-size:20px;line-height:1;cursor:pointer;padding:0 2px;opacity:.7;}'
      + '#scrap-notice .sn-x:hover{opacity:1;}'
      + '@media (max-width:560px){#scrap-notice{left:8px;right:56px;font-size:12.5px;padding:9px 10px 9px 12px;}}'
      + '@media (any-pointer:coarse){#scrap-notice .sn-x{min-width:44px;min-height:44px;margin:-10px -8px -10px 0;}'
      + '#scrap-notice label{min-height:36px;}}'
      + '@media print{#scrap-notice{display:none;}}';
    (document.head || document.documentElement).appendChild(s);
  }

  function here(it) {   // 그 노트를 이미 보고 있다
    return /\/patchnotes\//.test(location.pathname) && new URLSearchParams(location.search).get('v') === it.date;
  }

  function show(d) {
    var off = get(localStorage, OFF) || [], seen = get(sessionStorage, SEEN) || [];
    var list = ((d && d.unofficial) || []).filter(function (it) {
      return off.indexOf(it.key) < 0 && seen.indexOf(it.key) < 0 && !here(it);
    });
    if (!list.length || document.getElementById('scrap-notice')) return;
    css();
    var lines = list.map(function (it) {
      var md = it.date.split('-');
      return '<p class="sn-line"><span class="sn-tag">비공식 번역</span>'
        + '<b>' + CH[it.channel] + ' 패치 노트 (' + (+md[1]) + '월 ' + (+md[2]) + '일)</b>는 한국어 공식판이 아직 없어 '
        + (it.auto ? '자동으로 옮긴 ' : '') + '<b>비공식 번역</b>으로 제공합니다. '
        + '<a class="sn-go" href="' + BASE + esc(it.href) + '">바로 보기 →</a></p>';
    }).join('');
    var box = document.createElement('div');
    box.id = 'scrap-notice';
    box.setAttribute('role', 'status');
    box.innerHTML = '<div class="sn-body">' + lines
      + '<div class="sn-foot"><span>블리자드 한국어판이 나오면 그것으로 바뀝니다.</span>'
      + '<label><input type="checkbox" class="sn-off"> 이후로 알리지 않음</label></div></div>'
      + '<button type="button" class="sn-x" title="닫기" aria-label="알림 닫기">×</button>';
    // 앱이 아래에 제 칸을 깔아 두었으면(빌드메이커) 뒤로가기 단추와 같은 높이만큼 띄운다
    var bb = document.body.getAttribute('data-scrap-back-bottom');
    if (bb) box.style.setProperty('--sn-bottom', bb);
    document.body.appendChild(box);
    function close() {
      var keys = list.map(function (it) { return it.key; });
      if (box.querySelector('.sn-off').checked) put(localStorage, OFF, off.concat(keys).slice(-50));
      put(sessionStorage, SEEN, seen.concat(keys));
      box.remove();
    }
    box.querySelector('.sn-x').addEventListener('click', close);
    // 바로 보기를 눌러 그 노트로 가면 이번 세션에는 다시 안 띄운다(체크는 그대로 따른다)
    box.querySelectorAll('.sn-go').forEach(function (a) { a.addEventListener('click', close); });
  }

  function start() { load(show); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
