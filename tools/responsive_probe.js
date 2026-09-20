/* 화면 비율 점검기 — 지금 보이는 화면에서 "안 나오는 것"을 찾아낸다. (개발용, 배포되지 않는다)
 *
 * 브라우저 콘솔(또는 Claude 의 javascript_tool)에서:
 *     eval(await (await fetch('/tools/responsive_probe.js')).text()); __probe()
 *
 * 돌려주는 것
 *   overflowX   문서가 화면보다 가로로 몇 px 넘치는가 (0 이어야 한다 — 넘치면 폰에서 좌우로 흔들린다)
 *   out         화면 밖으로 삐져나간 요소들(가장 바깥 것만). 가로 스크롤 상자 안에 든 것은 뺀다(의도된 스크롤)
 *   tinyTap     누를 수 있는데 너무 작은 것 (폰 폭에서만 본다. 기준 28px)
 *   smallText   10px 도 안 되는 글자
 *   tallFixed   화면에 붙어 있는데(fixed) 화면보다 커서 끝이 안 보이는 것 — 가로로 눕힌 폰에서 자주 난다
 *   scrollers   가로로 스크롤되는 상자(문제는 아니고 참고)
 */
window.__probe = function (opt) {
  opt = opt || {};
  var de = document.documentElement;
  var vw = de.clientWidth, vh = window.innerHeight;
  var TAP = opt.tap || 28, MINFONT = opt.minFont || 10;

  function name(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    var c = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    if (c) s += '.' + c;
    return s;
  }
  function path(el) {
    var out = [], n = 0;
    for (var p = el; p && p !== document.body && n < 3; p = p.parentElement, n++) out.unshift(name(p));
    return out.join(' > ');
  }
  // 가로로 잘라 주거나 스크롤시켜 주는 조상이 있고, 그 조상은 화면 안에 들어와 있는가
  function contained(el) {
    for (var p = el.parentElement; p && p !== de; p = p.parentElement) {
      var ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') {
        if (p === document.body) return false;          // body 가 자르는 것은 '넘침을 숨긴 것'일 뿐이다
        var pr = p.getBoundingClientRect();
        if (pr.right <= vw + 1 && pr.left >= -1) return true;
      }
    }
    return false;
  }

  var out = [], outSet = new Set(), tiny = [], small = [], tall = [], scrollers = [];
  var all = document.body.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var el = all[i], r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;

    if ((r.right > vw + 1 || r.left < -1) && r.bottom > 0) {
      var parentOut = el.parentElement && outSet.has(el.parentElement);
      if (parentOut) outSet.add(el);                                 // 부모가 이미 걸렸으면 자식은 적지 않는다
      else if (!contained(el)) {
        outSet.add(el);
        out.push({ el: path(el), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
      }
    }

    if ((cs.position === 'fixed' || cs.position === 'sticky') && r.height > vh + 1 && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') {
      tall.push({ el: path(el), h: Math.round(r.height), vh: vh });
    }

    if (el.scrollWidth > el.clientWidth + 2 && (cs.overflowX === 'auto' || cs.overflowX === 'scroll')) {
      scrollers.push(path(el));
    }

    if (vw <= 820 && r.top < vh * 3) {
      var tag = el.tagName;
      var tappable = tag === 'A' || tag === 'BUTTON' || tag === 'SELECT' || tag === 'SUMMARY' ||
        (tag === 'INPUT' && el.type !== 'hidden') || el.hasAttribute('onclick') || el.getAttribute('role') === 'button';
      if (tappable && Math.min(r.width, r.height) < TAP && tiny.length < 40) {
        // 글 속에 섞인 링크는 뺀다(줄 높이만큼이라 원래 낮다)
        var inline = tag === 'A' && cs.display === 'inline' && el.parentElement && /^(P|LI|DD|SPAN|TD|DIV)$/.test(el.parentElement.tagName) && (el.parentElement.textContent || '').length > (el.textContent || '').length + 20;
        if (!inline) tiny.push({ el: path(el), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }

    var fs = parseFloat(cs.fontSize);
    if (fs < MINFONT && small.length < 12) {
      for (var k = 0; k < el.childNodes.length; k++) {
        var t = el.childNodes[k];
        if (t.nodeType === 3 && t.nodeValue.trim().length > 1) { small.push({ el: path(el), px: fs, text: t.nodeValue.trim().slice(0, 18) }); break; }
      }
    }
  }
  return {
    vw: vw, vh: vh, docW: de.scrollWidth, overflowX: Math.max(0, de.scrollWidth - vw),
    out: out.slice(0, 10), outCount: out.length,
    tinyTap: tiny.slice(0, 8), tinyCount: tiny.length,
    smallText: small.slice(0, 6), smallCount: small.length,
    tallFixed: tall.slice(0, 5), scrollers: scrollers.slice(0, 6)
  };
};
'probe ready';
