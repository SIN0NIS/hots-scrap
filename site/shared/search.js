/* 한글 검색기 — 사이트 전 앱이 같은 규칙으로 찾게 한다.
 *
 * 왜 따로 만들었나
 *   예전 방식은 검색어를 통째로 초성으로 바꿔서 비교했다("줄ㅈ" → "ㅈㅈ").
 *   그러면 이미 다 친 글자("줄")까지 초성으로 뭉개져, 글자를 더 쳐도 결과가 안 좁혀졌다.
 *   여기서는 **다 친 글자는 글자대로, 자음 하나만 친 것은 그 자리의 초성으로** 맞춘다.
 *     "줄ㅈ"  → [줄][초성 ㅈ]  → 줄진        (제이나·정크랫 따위는 안 걸린다)
 *     "ㅈㅈ"  → [초성 ㅈ][초성 ㅈ] → 줄진
 *     "줄지"  → [줄][지~]      → 줄진        (치는 중인 마지막 글자는 받침을 안 따진다)
 *     "바ㄹ"  → [바][초성 ㄹ] 또는 [발]      → 발라, 바리안
 *
 * 쓰는 법
 *   scrapSearch.score('줄ㅈ', '줄진')        → 점수(0 이면 안 맞음, 클수록 잘 맞음)
 *   scrapSearch.filter(목록, '줄ㅈ', h => [h.name_ko, h.name_en])
 *       → 맞는 것만 점수순으로. 잘 맞는 것이 있으면 어설픈 것은 빼고 준다.
 *   scrapSearch.mark('줄진', '줄ㅈ')         → 맞은 자리에 <mark> 를 씌운 HTML
 */
(function () {
  'use strict';

  var SBASE = 0xac00, SLAST = 0xd7a3, NJUNG = 21, NJONG = 28;
  // 호환 자모(자판으로 치는 ㄱ~ㅎ)를 초성 번호로
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  var JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  // 받침 번호 → 호환 자모 (0 은 받침 없음)
  var JONG = '\u0000ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';

  function isSyl(c) { var u = c.charCodeAt(0); return u >= SBASE && u <= SLAST; }
  function parts(c) {                       // 완성된 글자 → {초성, 중성, 종성} 번호
    var u = c.charCodeAt(0) - SBASE;
    return { cho: Math.floor(u / (NJUNG * NJONG)), jung: Math.floor(u / NJONG) % NJUNG, jong: u % NJONG };
  }
  function isChoJamo(c) { return CHO.indexOf(c) > -1; }
  function isJungJamo(c) { return JUNG.indexOf(c) > -1; }

  /* 검색어를 한 칸씩 뜯는다.
     kind: 'syl' 완성 글자 · 'cho' 자음 하나 · 'jung' 모음 하나 · 'raw' 그 밖(영문·숫자) */
  function tokenize(q) {
    var out = [];
    for (var i = 0; i < q.length; i++) {
      var c = q[i];
      if (isSyl(c)) out.push({ kind: 'syl', c: c, p: parts(c) });
      else if (isChoJamo(c)) out.push({ kind: 'cho', c: c, n: CHO.indexOf(c) });
      else if (isJungJamo(c)) out.push({ kind: 'jung', c: c, n: JUNG.indexOf(c) });
      else out.push({ kind: 'raw', c: c });
    }
    return out;
  }

  /* 검색어 토큰들이 text 의 start 자리에서부터 이어 맞는지 본다.
     맞으면 {end, fuzzy} — fuzzy 는 초성·모음처럼 '덜 친 글자'로 맞춘 횟수. 아니면 null. */
  function runFrom(toks, text, start) {
    var i = start, fuzzy = 0;
    for (var t = 0; t < toks.length; t++) {
      var tk = toks[t], last = (t === toks.length - 1);
      if (i >= text.length) return null;
      var c = text[i];

      if (tk.kind === 'syl') {
        if (c === tk.c) { i++; continue; }
        if (isSyl(c) && tk.p.jong === 0) {
          var p = parts(c);
          if (p.cho === tk.p.cho && p.jung === tk.p.jung) {
            // 치는 중인 마지막 글자는 받침을 안 따진다: "줄지" → "줄진"
            if (last) { i++; fuzzy++; continue; }
            // 다음에 친 자음이 이 글자의 받침이면 그것도 맞다: "바ㄹ" → "발"(라리라)
            var nx = toks[t + 1];
            if (p.jong !== 0 && nx && nx.kind === 'cho' && JONG.indexOf(nx.c) === p.jong) { i++; fuzzy++; continue; }
          }
        }
        return null;
      }

      if (tk.kind === 'cho') {
        // 앞 글자의 받침으로 친 것일 수도 있다: "바ㄹ" → "발"
        if (t > 0 && toks[t - 1].kind === 'syl' && toks[t - 1].p.jong === 0 && i > start) {
          var prev = text[i - 1];
          if (isSyl(prev) && JONG.indexOf(tk.c) === parts(prev).jong) { fuzzy++; continue; }
        }
        if (isSyl(c) && parts(c).cho === tk.n) { i++; fuzzy++; continue; }
        if (c === tk.c) { i++; continue; }       // 자모를 그대로 적어 둔 이름
        return null;
      }

      if (tk.kind === 'jung') {
        if (isSyl(c) && parts(c).jung === tk.n) { i++; fuzzy++; continue; }
        if (c === tk.c) { i++; continue; }
        return null;
      }

      if (c !== tk.c) return null;
      i++;
    }
    return { end: i, fuzzy: fuzzy };
  }

  /* 띄어쓰기와 문장부호는 무시한다 — "dva" 로 "D.Va" 를, "켈투자드" 로 "Kel'Thuzad" 를 찾게. */
  var SKIP = /[\s.'’·\-_,!?()[\]]/;
  function norm(s) {
    var raw = String(s == null ? '' : s).toLowerCase(), out = '';
    for (var i = 0; i < raw.length; i++) if (!SKIP.test(raw[i])) out += raw[i];
    return out;
  }

  /* 한 낱말에 대한 점수. 0 이면 안 맞는다.
     앞에서 맞을수록 · 덜 뭉개고 맞을수록 · 이름 전체와 가까울수록 높다. */
  function scoreOne(toks, text) {
    if (!toks.length) return 1;
    var best = 0;
    for (var s = 0; s + toks.length <= text.length + toks.length; s++) {
      if (s >= text.length) break;
      var r = runFrom(toks, text, s);
      if (!r) continue;
      var sc = 1000;
      sc -= s * 40;                       // 앞에서 맞을수록 좋다
      sc -= r.fuzzy * 30;                 // 덜 친 글자로 때운 만큼 깎는다
      sc -= (text.length - r.end) * 2;    // 이름이 딱 끝날수록 좋다
      if (s === 0 && r.end === text.length && r.fuzzy === 0) sc += 500;  // 이름과 완전히 같다
      if (sc > best) best = sc;
      if (s === 0) break;                 // 맨 앞에서 맞았으면 더 볼 것 없다
    }
    return best > 0 ? best : 0;
  }

  /* 사람들이 실제로 치는 다른 표기. 화면에 보이는 이름은 그대로 두고, 찾을 때만 같이 본다.
     (블리자드 정발 표기는 "D.Va" 지만 다들 "디바" 라고 친다) */
  var ALIAS = { 'd.va': ['디바'] };

  /* 한 항목의 점수 — 이름이 여럿(한글·영문)이면 가장 잘 맞는 쪽을 쓴다. */
  function score(query, texts) {
    var q = norm(query);
    if (!q) return 1;
    var toks = tokenize(q);
    var list = Object.prototype.toString.call(texts) === '[object Array]' ? texts : [texts];
    for (var a = 0, n0 = list.length; a < n0; a++) {
      var extra = ALIAS[String(list[a] == null ? '' : list[a]).toLowerCase()];
      if (extra) list = list.concat(extra);
    }
    var best = 0;
    for (var i = 0; i < list.length; i++) {
      var sc = scoreOne(toks, norm(list[i]));
      if (i > 0) sc -= 1;                 // 같은 점수면 첫 번째 이름(보통 한글) 우선
      if (sc > best) best = sc;
    }
    return best;
  }

  /* 목록 거르기 + 점수순 정렬.
     글자를 더 칠수록 좁아지게: 잘 맞는 것이 있으면 한참 떨어지는 것은 빼고 준다. */
  function filter(list, query, getTexts) {
    var q = norm(query);
    if (!q) return list.slice();
    var toks = tokenize(q);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var texts = getTexts ? getTexts(list[i]) : list[i];
      var sc = score(q, texts);
      if (sc > 0) out.push({ v: list[i], s: sc, i: i });
    }
    out.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    if (out.length > 1 && q.length >= 2) {
      // 1등과 너무 차이나는 것은 버린다(글자를 더 칠수록 결과가 좁아지는 느낌을 준다).
      // 다만 최소 몇 개는 남겨 둬서, 살짝 잘못 친 경우에도 찾을 수 있게 한다.
      var cut = out[0].s - 260, keep = [];
      for (var k = 0; k < out.length; k++) if (out[k].s >= cut || keep.length < 3) keep.push(out[k]);
      out = keep;
    }
    return out.map(function (x) { return x.v; });
  }

  /* 맞은 자리에 <mark> 씌우기 — 어디가 걸렸는지 눈에 보이게. */
  function mark(text, query) {
    var raw = String(text == null ? '' : text);
    var q = norm(query);
    if (!q) return esc(raw);
    // 공백을 지운 좌표를 원문 좌표로 되돌리기 위한 표
    var flat = '', map = [];
    for (var i = 0; i < raw.length; i++) {
      if (SKIP.test(raw[i])) continue;
      flat += raw[i].toLowerCase(); map.push(i);
    }
    var toks = tokenize(q);
    for (var s = 0; s < flat.length; s++) {
      var r = runFrom(toks, flat, s);
      if (!r) continue;
      var a = map[s], b = map[r.end - 1];
      if (a == null || b == null) break;
      return esc(raw.slice(0, a)) + '<mark>' + esc(raw.slice(a, b + 1)) + '</mark>' + esc(raw.slice(b + 1));
    }
    return esc(raw);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 예전 코드가 쓰던 초성 뽑기 — 다른 데서 부르고 있어 남겨 둔다 */
  function chosung(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      out += isSyl(c) ? CHO[parts(c).cho] : c;
    }
    return out;
  }

  window.scrapSearch = { score: score, filter: filter, mark: mark, chosung: chosung, esc: esc, tokenize: tokenize };
})();
