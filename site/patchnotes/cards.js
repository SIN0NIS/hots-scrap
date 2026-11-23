/* 패치 노트 → 그림 카드(PNG 여러 장) 저장. 2026-11-24
   '카드 이미지로 저장' 을 누를 때만 이 파일과 html2canvas·글꼴을 받는다.
   노트 본문(html)을 영웅·갈래마다 카드로 나누고, 실제로 재어 두 줄로 쌓아 쪽을 나눈 뒤 쪽마다 한 장씩 찍는다.
   주황색(테스트 서버 뒤에 바뀐 것): 공식 한글판은 원문의 .pn-new 를 따르고, 번역판은 영문 원문을 바로 앞
   테스트 서버 영문 노트와 견줘 없던 문장을 칠한다(같은 일을 하는 tools/patch_cards.py 와 규칙이 같다). */
(function () {
  'use strict';
  var FAM = '"Noto Sans KR"';
  var FONT_CSS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap';
  var H2C = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
  var W = 1600, BUDGET = 2250, SPLIT = 1400, GAP = 28;
  var LEVEL = /^\d+\s*레벨$/;

  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var el = document.createElement('script'); el.src = src;
      el.onload = ok; el.onerror = function () { fail(new Error('그림 도구를 받지 못했습니다')); };
      document.head.appendChild(el);
    });
  }
  var fontP = null;
  function loadFont(text) {
    if (!fontP) fontP = new Promise(function (ok) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONT_CSS; l.setAttribute('data-cardfont', '1');
      l.onload = l.onerror = function () { ok(); }; document.head.appendChild(l); setTimeout(ok, 6000);
    });
    return fontP.then(function () {
      if (!document.fonts || !document.fonts.load) return;
      var t = (text || '') + '0123456789%()+-.,·';
      var all = Promise.all(['400', '700', '900'].map(function (w) { return document.fonts.load(w + ' 18px ' + FAM, t).catch(function () {}); }));
      return Promise.race([all, new Promise(function (ok) { setTimeout(ok, 8000); })]);
    });
  }

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var norm = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };

  // ---------------------------------------------------------------- 읽기
  function ownText(li) {   // 아래 목록·그림을 뺀 제 글자
    var c = li.cloneNode(true);
    [].slice.call(c.querySelectorAll('ul,ol,aside,figure,img')).forEach(function (x) { x.remove(); });
    return c;
  }
  function leafHTML(li) {
    var c = ownText(li), out = '';
    (function walk(n) {
      [].slice.call(n.childNodes).forEach(function (x) {
        if (x.nodeType === 3) out += esc(x.nodeValue);
        else if (x.nodeType === 1 && (x.tagName === 'S' || x.tagName === 'DEL')) out += '<s>' + esc(x.textContent) + '</s>';
        else if (x.nodeType === 1 && x.tagName === 'BR') out += ' ';
        else if (x.nodeType === 1) walk(x);
      });
    })(c);
    return norm(out);
  }
  function isNew(el) { return !!(el.closest('.pn-new') || el.querySelector('.pn-new')); }
  function parseUl(ul) {
    var out = [];
    [].slice.call(ul.children).forEach(function (li) {
      if (li.tagName !== 'LI') return;
      var sub = [].slice.call(li.children).filter(function (x) { return x.tagName === 'UL' || x.tagName === 'OL'; })[0];
      if (sub) {
        var lab = norm(ownText(li).textContent);
        out.push({ label: lab, kids: parseUl(sub), lnew: isNew(ownText(li)) || !!li.closest('.pn-new') });
      } else {
        var t = leafHTML(li);
        if (t) out.push({ text: t, plain: norm(li.textContent), isnew: isNew(li) });
      }
    });
    return out;
  }
  function parseSection(html) {
    var doc = new DOMParser().parseFromString('<div id="r">' + html + '</div>', 'text/html');
    var root = doc.getElementById('r');
    var cards = [], cur = null, group = null;
    function ensure() {
      if (!cur) { cur = { title: group || '', parts: [] }; cards.push(cur); }
      if (!cur.parts.length) cur.parts.push({ sub: null, nodes: [] });
    }
    [].slice.call(root.children).forEach(function (el) {
      var tag = el.tagName;
      if (tag === 'H2' || tag === 'H3') { group = norm(el.textContent); cur = null; }
      else if (tag === 'H4' || tag === 'H5') { cur = { title: norm(el.textContent), parts: [] }; cards.push(cur); }
      else if (tag === 'UL' || tag === 'OL') { ensure(); cur.parts[cur.parts.length - 1].nodes = cur.parts[cur.parts.length - 1].nodes.concat(parseUl(el)); }
      else if (tag === 'P' && !el.querySelector('img,iframe,video')) {
        var t = norm(el.textContent);
        if (!t) return;
        var lk = [].slice.call(el.querySelectorAll('a')).map(function (a) { return norm(a.textContent); }).join('');
        if (lk.length * 2 >= t.length) return;   // '공식 포럼에서 토론하기' 같은 링크뿐인 문단은 뺀다
        var st = el.querySelector('strong,b');
        if (st && norm(st.textContent) === t && t.length < 30) {
          if (!cur) { cur = { title: group || '', parts: [] }; cards.push(cur); }
          cur.parts.push({ sub: t, nodes: [] });
        } else { ensure(); cur.parts[cur.parts.length - 1].nodes.push({ text: leafHTML(el), plain: t, isnew: isNew(el) }); }
      }
    });
    return cards.filter(function (c) { return c.parts.some(function (p) { return p.nodes.length; }); });
  }
  function leaves(nodes, acc) {
    acc = acc || [];
    nodes.forEach(function (n) { if (n.text != null) acc.push(n); else leaves(n.kids, acc); });
    return acc;
  }
  function allNew(nodes) { var l = leaves(nodes); return l.length > 0 && l.every(function (x) { return x.isnew; }); }

  // 카드 다듬기: 빈 제목 → 갈래 이름, 영웅이 목록 머리로 온 묶음(버그 수정) → 영웅마다, 수집품 → 종류마다
  function shapeCards(cards, sec, heroNames) {
    cards.forEach(function (c) { if (!c.title) c.title = sec.name; });
    var out = [];
    cards.forEach(function (c) {
      var ns = [].concat.apply([], c.parts.map(function (p) { return p.nodes; }));
      var labeled = ns.length && ns.every(function (n) { return n.label != null; });
      var heroish = labeled && ns.filter(function (n) { return heroNames[n.label]; }).length * 2 > ns.length;
      if (heroish) {
        ns.forEach(function (n) {
          var nodes = [];
          n.kids.forEach(function (k) { if (k.label === '기본' || k.label === '특성') nodes = nodes.concat(k.kids); else nodes.push(k); });
          out.push({ title: n.label, parts: [{ sub: null, nodes: nodes }] });
        });
      } else if (sec.key === 'collection' && labeled) {
        ns.forEach(function (n) {
          var m = n.label.match(/^([^:：]+)[:：]\s*(.+)$/);   // '새로운 묶음 상품: 검은 황혼 …' 꼴
          if (m) out.push({ title: m[1], parts: [{ sub: null, nodes: [{ label: m[2], kids: n.kids }] }] });
          else out.push({ title: n.label.replace(/[:：]\s*$/, ''), parts: [{ sub: null, nodes: n.kids }] });
        });
      } else out.push(c);
    });
    return out;
  }

  // ---------------------------------------------------------------- 그리기
  var CSS = [
    '.pc-root{position:fixed;left:-30000px;top:0;width:' + W + 'px;font-family:' + FAM + ',sans-serif;color:#e9e6f5;}',
    '.pc-root *{box-sizing:border-box;margin:0;padding:0}',
    '.pc-page{width:' + W + 'px;padding:58px 62px 40px;background-color:#0f0c1d;background-image:radial-gradient(ellipse at 50% 0%,#33205c 0%,#0f0c1d 38%);}',
    '.pc-badge{display:table;margin:0 auto;background:#3fd6f5;color:#0b2030;font-weight:900;letter-spacing:.22em;font-size:18px;padding:7px 16px 7px 20px;border-radius:4px}',
    '.pc-h1{text-align:center;font-weight:900;font-size:56px;margin-top:26px;color:#fff;line-height:1.25}',
    '.pc-date{text-align:center;color:#b9a8ff;font-size:25px;margin-top:10px}',
    '.pc-intro{text-align:center;color:#a9a3c4;font-size:17px;margin-top:24px;line-height:1.75}',
    '.pc-intro b{color:#ff9f3d}',
    '.pc-sec{display:flex;align-items:center;margin:44px 0 30px}',
    '.pc-sec i{flex:1;height:2px;background:#4a37a8}',
    '.pc-sec span{font-size:32px;font-weight:900;color:#fff;padding:0 22px}',
    '.pc-cols{display:flex;align-items:flex-start}',
    '.pc-col{flex:1;min-width:0}',
    '.pc-col+.pc-col{margin-left:' + GAP + 'px}',
    '.pc-card{background:#1b1636;border:1px solid #2d2656;border-radius:12px;padding:26px 26px 28px;margin-bottom:' + GAP + 'px}',
    '.pc-ct{font-size:27px;font-weight:900;color:#fff;padding:0 0 16px 18px;border-bottom:1px solid #2f2858;margin-bottom:12px;position:relative;line-height:1.3}',
    '.pc-ct:before{content:"";position:absolute;left:0;top:6px;width:6px;height:24px;background:#8a6cff;border-radius:2px}',
    '.pc-new{color:#ff9f3d !important}',
    '.pc-sub{color:#3fd6f5;font-size:15px;font-weight:700;letter-spacing:.12em;margin:14px 0 4px}',
    '.pc-ab{margin:12px 0 4px;line-height:1.4}',
    '.pc-lv{display:inline-block;font-size:14px;font-weight:700;color:#f3d27a;border:1px solid #8a7438;background:#2a2410;border-radius:4px;padding:1px 8px;margin-right:10px;vertical-align:3px}',
    '.pc-an{font-size:20px;font-weight:700;color:#c9b6ff}',
    '.pc-li{position:relative;padding-left:20px;font-size:18.5px;line-height:1.75;color:#ddd8ee}',
    '.pc-li:before{content:"";position:absolute;left:4px;top:13px;width:6px;height:6px;border-radius:3px;background:#5a5380}',
    '.pc-li s{color:#7d7799}',
    '.pc-foot{text-align:center;color:#6f6990;font-size:14.5px;margin-top:12px}'
  ].join('\n');

  function nodeBlocks(n, coll, depth) {   // → html 조각 목록(쪼갤 수 있는 단위)
    if (n.text != null) {
      if (coll && depth === 0) return ['<div class="pc-ab"><span class="pc-an' + (n.isnew ? ' pc-new' : '') + '">' + n.text + '</span></div>'];
      return ['<div class="pc-li' + (n.isnew ? ' pc-new' : '') + '">' + n.text + '</div>'];
    }
    var lab = esc(n.label.replace(/[:：]\s*$/, ''));
    var nw = (n.lnew || allNew(n.kids)) ? ' pc-new' : '';
    if (LEVEL.test(n.label)) {
      var out = [];
      n.kids.forEach(function (k) {
        if (k.label != null) {
          var kn = (k.lnew || allNew(k.kids)) ? ' pc-new' : '';
          out.push('<div class="pc-ab"><span class="pc-lv">' + lab + '</span><span class="pc-an' + kn + '">' + esc(k.label) + '</span></div>' + kidsHTML(k.kids, coll, depth + 1));
        } else out.push('<div class="pc-ab"><span class="pc-lv">' + lab + '</span></div>' + nodeBlocks(k, coll, depth + 1).join(''));
      });
      return out;
    }
    return ['<div class="pc-ab"><span class="pc-an' + nw + '">' + lab + '</span></div>' + kidsHTML(n.kids, coll, depth + 1)];
  }
  function kidsHTML(kids, coll, depth) { return kids.map(function (k) { return nodeBlocks(k, coll, depth).join(''); }).join(''); }

  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstChild; }

  // 카드 하나 → 재어 가며 '(계속)' 카드로 쪼갠 [{el, h}]
  function buildCards(card, coll, meas) {
    var all = [].concat.apply([], card.parts.map(function (p) { return p.nodes; }));
    var tnew = !coll && allNew(all) ? ' pc-new' : '';
    var res = [], cur = null, n = 0;
    function open() {
      cur = el('<div class="pc-card"><div class="pc-ct' + tnew + '">' + esc(card.title) + (n++ ? ' (계속)' : '') + '</div></div>');
      meas.appendChild(cur); res.push(cur);
    }
    open();
    card.parts.forEach(function (p) {
      var subHTML = p.sub ? '<div class="pc-sub">' + esc(p.sub) + '</div>' : '';
      var first = true;
      p.nodes.forEach(function (nd) {
        nodeBlocks(nd, coll, 0).forEach(function (b) {
          var piece = el('<div>' + (first ? subHTML : '') + b + '</div>');
          cur.appendChild(piece);
          if (cur.offsetHeight > SPLIT && cur.children.length > 2) {
            cur.removeChild(piece); open();
            piece = el('<div>' + subHTML + b + '</div>');
            cur.appendChild(piece);
          }
          first = false;
        });
      });
    });
    return res.map(function (c) { return { el: c, h: c.offsetHeight + GAP }; });
  }

  function paginate(secs) {   // secs: [{name, cards:[{el,h}]}] → pages: [[{name, cols:[[el],[el]]}]]
    var pages = [], cur = [], used = 0, HEAD = 110;
    secs.forEach(function (s) {
      var cols = [[], []], hs = [0, 0];
      s.cards.forEach(function (c) {
        var i = hs[0] <= hs[1] ? 0 : 1;
        var need = used + HEAD + Math.max(hs[i] + c.h, hs[1 - i]);
        if (need > BUDGET && (cols[0].length || cur.length)) {
          if (cols[0].length) cur.push({ name: s.name, cols: cols });
          pages.push(cur); cur = []; used = 0; cols = [[], []]; hs = [0, 0]; i = 0;
        }
        cols[i].push(c.el); hs[i] += c.h;
      });
      if (cols[0].length) { cur.push({ name: s.name, cols: cols }); used += HEAD + Math.max(hs[0], hs[1]); }
    });
    if (cur.length) pages.push(cur);
    return pages;
  }

  // 번역판: 영문 원문 잎과 짝지어 테스트 서버 영문 노트에 없던 문장을 칠한다
  function markFromPTR(koSecs, enDoc, ptrDoc) {
    var ptr = {};
    ptrDoc.sections.forEach(function (s) {
      var d = new DOMParser().parseFromString('<div>' + (s.html || '') + '</div>', 'text/html');
      [].slice.call(d.querySelectorAll('li')).forEach(function (li) { if (!li.querySelector('ul,ol')) ptr[norm(li.textContent)] = 1; });
    });
    var enBy = {};
    enDoc.sections.forEach(function (s) { enBy[s.key] = s; });
    koSecs.forEach(function (ks) {
      if (ks.sec.key !== 'balance' && ks.sec.key !== 'bugs') return;
      var es = enBy[ks.sec.key]; if (!es) return;
      var kl = leaves([].concat.apply([], ks.raw.map(function (c) { return [].concat.apply([], c.parts.map(function (p) { return p.nodes; })); })));
      var ec = parseSection(es.html);
      var el2 = leaves([].concat.apply([], ec.map(function (c) { return [].concat.apply([], c.parts.map(function (p) { return p.nodes; })); })));
      if (kl.length !== el2.length) return;
      kl.forEach(function (k, i) { k.isnew = !ptr[norm(el2[i].plain)]; });
    });
  }

  /* opts: {doc, row, enDoc, ptrDoc, heroNames:{이름:1}, focusName, onProgress} → Promise<[{name, blob}]> */
  async function make(opts) {
    var doc = opts.doc, row = opts.row;
    await loadFont(doc.sections.map(function (s) { return s.html; }).join(' ').replace(/<[^>]+>/g, ''));
    if (!window.html2canvas) await loadScript(H2C);
    var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    var root = document.createElement('div'); root.className = 'pc-root'; document.body.appendChild(root);
    try {
      var hasPn = doc.sections.some(function (s) { return /pn-new/.test(s.html || ''); });
      var koSecs = doc.sections.filter(function (s) { return s.key !== 'intro'; })
        .map(function (s) { return { sec: s, raw: parseSection(s.html || '') }; });
      if (!hasPn && opts.enDoc && opts.ptrDoc) markFromPTR(koSecs, opts.enDoc, opts.ptrDoc);
      if (!hasPn) koSecs.forEach(function (ks) {   // 주황색은 밸런스·버그 수정에만(번역판)
        if (ks.sec.key === 'balance' || ks.sec.key === 'bugs') return;
        ks.raw.forEach(function (c) { c.parts.forEach(function (p) { leaves(p.nodes).forEach(function (l) { l.isnew = false; }); }); });
      });
      // 재는 칸: 한 줄 너비
      var colW = (W - 124 - GAP) / 2;
      var meas = el('<div style="width:' + colW + 'px"></div>'); root.appendChild(meas);
      var secs = [];
      koSecs.forEach(function (ks) {
        var cards = shapeCards(ks.raw, ks.sec, opts.heroNames || {});
        if (opts.focusName) cards = cards.filter(function (c) { return c.title === opts.focusName; });
        var built = [];
        cards.forEach(function (c) { built = built.concat(buildCards(c, ks.sec.key === 'collection', meas)); });
        if (built.length) secs.push({ name: ks.sec.name, cards: built });
      });
      if (!secs.length) throw new Error('카드로 만들 항목이 없습니다');
      var pages = paginate(secs);
      // 머리
      var intro = doc.sections.filter(function (s) { return s.key === 'intro'; })[0];
      var introHTML = '';
      if (intro) {
        var d = new DOMParser().parseFromString('<div>' + intro.html + '</div>', 'text/html');
        introHTML = [].slice.call(d.querySelectorAll('p')).map(function (p) {
          var t = esc(norm(p.textContent)); return p.querySelector('b,strong,.pn-new') ? '<b>' + t + '</b>' : t;
        }).filter(Boolean).join('<br>');
      }
      var ptrRow = row.kind === 'ptr' || row.isPtr;
      var title = esc(String(doc.title || row.title).replace(/\s*-\s*\d{4}년.*$/, ''));
      var m = String(row.date).match(/(\d{4})-(\d{2})-(\d{2})/);
      var dateTxt = m ? (+m[1]) + '년 ' + (+m[2]) + '월 ' + (+m[3]) + '일' : row.date;
      var src = row.translated ? '원문: news.blizzard.com · 영웅·기술·특성 이름: 공식 한글 게임 자료 기준 · 비공식 번역 · hotscrap.com'
                               : '출처: 블리자드 공식 한국어 패치 노트 · hotscrap.com';
      var files = [];
      for (var i = 0; i < pages.length; i++) {
        if (opts.onProgress) opts.onProgress(i + 1, pages.length);
        var pg = el('<div class="pc-page"><div class="pc-badge">' + (ptrRow ? 'PTR' : 'LIVE') + ' · ' + (i + 1) + '/' + pages.length + '</div>'
          + '<div class="pc-h1">' + title + '</div><div class="pc-date">' + dateTxt + '</div>'
          + (introHTML ? '<div class="pc-intro">' + introHTML + '</div>' : '') + '</div>');
        pages[i].forEach(function (s) {
          pg.appendChild(el('<div class="pc-sec"><i></i><span>' + esc(s.name) + '</span><i></i></div>'));
          var cw = el('<div class="pc-cols"><div class="pc-col"></div><div class="pc-col"></div></div>');
          s.cols.forEach(function (col, ci) { col.forEach(function (c) { cw.children[ci].appendChild(c); }); });
          pg.appendChild(cw);
        });
        pg.appendChild(el('<div class="pc-foot">' + src + '</div>'));
        root.appendChild(pg);
        var canvas = await window.html2canvas(pg, { backgroundColor: '#0f0c1d', scale: 1.25, useCORS: true, logging: false });
        var blob = await new Promise(function (ok) { canvas.toBlob(ok, 'image/png'); });
        files.push({ name: 'hotscrap_patch_' + row.date + (opts.focusName ? '_' + opts.focusName : '') + '_' + (i + 1) + '.png', blob: blob });
        root.removeChild(pg);
      }
      return files;
    } finally {
      root.remove(); style.remove();
    }
  }

  async function save(files) {
    var coarse = window.matchMedia && matchMedia('(any-pointer:coarse)').matches;
    try {
      var fs = files.map(function (f) { return new File([f.blob], f.name, { type: 'image/png' }); });
      if (coarse && navigator.canShare && navigator.canShare({ files: fs })) { await navigator.share({ files: fs }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    for (var i = 0; i < files.length; i++) {
      var a = document.createElement('a'); a.download = files[i].name; a.href = URL.createObjectURL(files[i].blob);
      document.body.appendChild(a); a.click(); a.remove();
      (function (u) { setTimeout(function () { URL.revokeObjectURL(u); }, 4000); })(a.href);
      await new Promise(function (ok) { setTimeout(ok, 350); });
    }
  }

  window.pnCards = { make: make, save: save, _parse: parseSection, _shape: shapeCards };
})();
