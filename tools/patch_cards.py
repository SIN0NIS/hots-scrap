# -*- coding: utf-8 -*-
"""패치 노트 그림 카드 — 번역본(translated/<날짜>.json)을 여러 장의 PNG 로 찍는다.

영문판과 번역본은 구조가 같으므로 둘을 같은 순서로 읽어 문장을 짝짓고,
테스트 서버 노트(영문)에 없던 문장은 주황색(라이브에서 새로 바뀐 것)으로 칠한다.

사용: python tools/patch_cards.py 2026-11-23 [--ptr 2026-11-09] [--out 폴더]
"""
import argparse
import html
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup, Tag

ROOT = Path(__file__).resolve().parents[1]
PN = ROOT / "site" / "data" / "patchnotes"

GL = json.loads((PN / "glossary.json").read_text(encoding="utf-8"))
LEVEL = re.compile(r"^\d+레벨$")


def norm(s):
    return re.sub(r"\s+", " ", s or "").strip()


def leaf_html(li):
    """잎 문장 — <s>(취소된 변경)만 살리고 나머지 꾸밈은 벗긴다."""
    parts = []
    for c in li.children:
        if isinstance(c, Tag):
            if c.name == "ul":
                continue
            if c.name == "s":
                parts.append("<s>" + html.escape(c.get_text(" ", strip=True)) + "</s>")
            else:
                parts.append(html.escape(c.get_text(" ", strip=True)))
        else:
            parts.append(html.escape(str(c)))
    return norm(" ".join(parts))


def parse_ul(ul):
    out = []
    for li in ul.find_all("li", recursive=False):
        sub = li.find("ul", recursive=False)
        st = li.find("strong", recursive=False)
        if sub is not None:
            label = norm((st or li).get_text(" ", strip=True)) if st else norm(
                "".join(str(x) for x in li.children if not (isinstance(x, Tag) and x.name == "ul")))
            label = BeautifulSoup(label, "html.parser").get_text(" ", strip=True)
            out.append({"label": label, "kids": parse_ul(sub)})
        else:
            out.append({"text": leaf_html(li), "plain": norm(li.get_text(" ", strip=True))})
    return out


def parse_section(sec_html):
    """→ 카드 목록 [{title, rows:[(kind, ...)]}]"""
    soup = BeautifulSoup(sec_html, "html.parser")
    cards, cur, group = [], None, None
    for el in soup.children:
        if not isinstance(el, Tag):
            continue
        if el.name == "h3":
            group = norm(el.get_text(" ", strip=True))
            cur = None
        elif el.name == "h4":
            cur = {"title": norm(el.get_text(" ", strip=True)), "parts": []}
            cards.append(cur)
        elif el.name == "p" and el.find("strong") and not el.find("img"):
            if cur is None:
                cur = {"title": group or "", "parts": []}
                cards.append(cur)
            cur["parts"].append({"sub": norm(el.get_text(" ", strip=True)), "nodes": []})
        elif el.name == "ul":
            if cur is None:
                cur = {"title": group or "", "parts": []}
                cards.append(cur)
            if not cur["parts"]:
                cur["parts"].append({"sub": None, "nodes": []})
            cur["parts"][-1]["nodes"].extend(parse_ul(el))
    return cards


def leaves(nodes):
    for n in nodes:
        if "text" in n:
            yield n
        else:
            yield from leaves(n["kids"])


def mark_new(ko_cards, en_cards, ptr):
    """영문 잎과 짝지어 테스트 서버 노트에 없던 문장에 new 표시."""
    ko_l = [l for c in ko_cards for p in c["parts"] for l in leaves(p["nodes"])]
    en_l = [l for c in en_cards for p in c["parts"] for l in leaves(p["nodes"])]
    if len(ko_l) != len(en_l):
        print(f"  ! 잎 수가 다름 ko {len(ko_l)} / en {len(en_l)} — 주황색 표시 생략")
        return
    for k, e in zip(ko_l, en_l):
        k["new"] = norm(e["plain"]) not in ptr


def all_new(nodes):
    ls = list(leaves(nodes))
    return bool(ls) and all(l.get("new") for l in ls)


# ---------------------------------------------------------------- 그리기
def chars_h(text, per=44, lh=33):
    t = re.sub(r"<[^>]+>", "", text)
    return lh * max(1, -(-len(t) // per))


def node_html(n, collection=False, depth=0):
    if "text" in n:
        cls = "li new" if n.get("new") else "li"
        if collection and depth == 0:
            return f'<div class="nm{" new" if n.get("new") else ""}">{n["text"]}</div>', 40
        return f'<div class="{cls}">{n["text"]}</div>', chars_h(n["text"]) + 2
    lab = html.escape(n["label"].rstrip(":： "))
    newc = " new" if all_new(n["kids"]) else ""
    if LEVEL.match(lab):  # 레벨 묶음 → 안쪽 특성마다 배지
        out, h = [], 0
        for k in n["kids"]:
            if "label" in k:
                kn = " new" if all_new(k["kids"]) else ""
                inner, ih = kids_html(k["kids"], collection, depth + 1)
                out.append(f'<div class="ab"><span class="lv">{lab}</span>'
                           f'<span class="an{kn}">{html.escape(k["label"])}</span></div>{inner}')
                h += 46 + ih
            else:
                s, sh = node_html(k, collection, depth + 1)
                out.append(f'<div class="ab"><span class="lv">{lab}</span></div>{s}')
                h += 46 + sh
        return "".join(out), h
    inner, ih = kids_html(n["kids"], collection, depth + 1)
    return f'<div class="ab"><span class="an{newc}">{lab}</span></div>{inner}', 46 + ih


def kids_html(kids, collection, depth):
    out, h = [], 0
    for k in kids:
        s, sh = node_html(k, collection, depth)
        out.append(s)
        h += sh
    return "".join(out), h


def card_blocks(card, collection=False, split_at=1350):
    """카드 하나 → (html, 높이) 목록. 너무 길면 소제목 단위로 '(계속)' 카드로 나눈다."""
    title = card["title"]
    allnodes = [n for p in card["parts"] for n in p["nodes"]]
    tnew = " new" if all_new(allnodes) and not collection else ""
    pieces, cur, curh = [], [], 0
    for p in card["parts"]:
        sub = f'<div class="sub">{html.escape(p["sub"])}</div>' if p["sub"] else ""
        for i, n in enumerate(p["nodes"]):
            s, h = node_html(n, collection)
            if cur and curh + h > split_at:
                pieces.append((cur, curh))
                cur, curh = [], 0
                if p["sub"]:
                    cur.append(sub)
                    curh += 34
            elif i == 0 and sub:
                cur.append(sub)
                curh += 34
            cur.append(s)
            curh += h
    if cur:
        pieces.append((cur, curh))
    out = []
    for i, (body, h) in enumerate(pieces):
        t = html.escape(title) + (" (계속)" if i else "")
        out.append((f'<div class="card"><div class="ct{tnew}">{t}</div>{"".join(body)}</div>', h + 110))
    return out


CSS = """
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=block');
*{box-sizing:border-box;margin:0;padding:0}
body{width:1600px;background:#0f0c1d;font-family:'Noto Sans KR',sans-serif;color:#e9e6f5}
.page{padding:58px 62px 40px;background:radial-gradient(ellipse 1200px 380px at 50% -60px,#3a2266 0%,rgba(58,34,102,0) 70%),#0f0c1d}
.badge{display:table;margin:0 auto;background:#3fd6f5;color:#0b2030;font-weight:900;letter-spacing:.22em;font-size:18px;padding:7px 16px 7px 20px;border-radius:4px}
h1{text-align:center;font-weight:900;font-size:56px;margin-top:26px;letter-spacing:-.01em;color:#fff}
.date{text-align:center;color:#b9a8ff;font-size:25px;margin-top:10px}
.intro{text-align:center;color:#a9a3c4;font-size:17px;margin-top:26px;line-height:1.75}
.intro b{color:#ff9f3d}
.sec{display:flex;align-items:center;gap:22px;margin:44px 0 30px}
.sec:before,.sec:after{content:"";flex:1;height:2px;background:linear-gradient(90deg,rgba(123,92,255,0),#6b4fe0)}
.sec:after{background:linear-gradient(90deg,#6b4fe0,rgba(123,92,255,0))}
.sec span{font-size:32px;font-weight:900;color:#fff}
.cols{display:flex;gap:28px;align-items:flex-start}
.col{flex:1;display:flex;flex-direction:column;gap:28px;min-width:0}
.card{background:#1b1636;border:1px solid #2d2656;border-radius:12px;padding:26px 26px 28px}
.ct{font-size:27px;font-weight:900;color:#fff;padding-left:18px;position:relative;padding-bottom:16px;border-bottom:1px solid #2f2858;margin-bottom:16px}
.ct:before{content:"";position:absolute;left:0;top:7px;width:6px;height:24px;background:#8a6cff;border-radius:2px}
.ct.new{color:#ff9f3d}
.sub{color:#3fd6f5;font-size:15px;font-weight:700;letter-spacing:.12em;margin:14px 0 4px}
.ab{display:flex;align-items:center;gap:10px;margin:12px 0 4px}
.lv{font-size:14px;font-weight:700;color:#f3d27a;border:1px solid #8a7438;background:#2a2410;border-radius:4px;padding:1px 8px}
.an{font-size:20px;font-weight:700;color:#c9b6ff}
.an.new{color:#ff9f3d}
.nm{font-size:20px;font-weight:700;color:#c9b6ff;margin:12px 0 4px}
.nm.new{color:#ff9f3d}
.li{position:relative;padding-left:20px;font-size:18.5px;line-height:1.75;color:#ddd8ee}
.li:before{content:"";position:absolute;left:4px;top:.8em;width:6px;height:6px;border-radius:50%;background:#5a5380}
.li.new{color:#ff9f3d}
.li s{color:#7d7799;text-decoration-color:#7d7799}
.foot{text-align:center;color:#6f6990;font-size:14.5px;margin-top:40px}
"""


def page_html(meta, body):
    return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>{CSS}</style></head><body>'
            f'<div class="page"><div class="badge">{meta["badge"]}</div><h1>{meta["title"]}</h1>'
            f'<div class="date">{meta["date"]}</div><div class="intro">{meta["intro"]}</div>{body}'
            f'<div class="foot">{meta["foot"]}</div></div></body></html>')


def paginate(sections, budget=2050):
    """sections: [(이름, [(html, h)])] → 쪽마다 [(이름, [col_a, col_b])]"""
    pages, cur, used = [], [], 0
    for name, blocks in sections:
        cols, hs, first = [[], []], [0, 0], True
        for b, h in blocks:
            i = 0 if hs[0] <= hs[1] else 1
            head = 110 if first else 0
            if used + head + max(hs[i] + h, hs[1 - i]) > budget and (any(cols) or cur):
                if any(cols):
                    cur.append((name, cols))
                pages.append(cur)
                cur, used, cols, hs, first = [], 0, [[], []], [0, 0], True
                i = 0
                head = 110
            cols[i].append(b)
            hs[i] += h + 28
            first = False
        if any(cols):
            cur.append((name, cols))
            used += 110 + max(hs)
    if cur:
        pages.append(cur)
    return pages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("date")
    ap.add_argument("--ptr", help="견줄 테스트 서버 영문 노트 날짜(없으면 이 노트 앞의 가장 최근 테스트 서버 노트)")
    ap.add_argument("--out")
    a = ap.parse_args()
    ko = json.loads((PN / "translated" / f"{a.date}.json").read_text(encoding="utf-8"))
    en = json.loads((PN / "en" / f"{a.date}.json").read_text(encoding="utf-8"))
    ptr_date = a.ptr
    if not ptr_date:
        idx = json.loads((PN / "index.json").read_text(encoding="utf-8"))
        cands = [e["date"] for e in idx if e.get("kind") == "ptr" and e["date"] < a.date
                 and (PN / "en" / f'{e["date"]}.json').exists()]
        ptr_date = max(cands) if cands else None
    ptr = set()
    if ptr_date and ko.get("kind") == "live":
        pe = json.loads((PN / "en" / f"{ptr_date}.json").read_text(encoding="utf-8"))
        for s in pe["sections"]:
            for li in BeautifulSoup(s.get("html", ""), "html.parser").find_all("li"):
                if not li.find("ul"):
                    ptr.add(norm(li.get_text(" ", strip=True)))
        print("테스트 서버 노트와 견줌:", ptr_date, len(ptr), "문장")

    en_secs = {s["key"]: s for s in en["sections"]}
    intro_html = ""
    sections = []
    for s in ko["sections"]:
        if s["key"] == "intro":
            soup = BeautifulSoup(s["html"], "html.parser")
            ps = [p for p in soup.find_all("p")]
            intro_html = "<br>".join(
                (f"<b>{html.escape(p.get_text(' ', strip=True))}</b>" if p.find("b") else html.escape(p.get_text(" ", strip=True)))
                for p in ps)
            continue
        kc = parse_section(s["html"])
        ec = parse_section(en_secs[s["key"]]["html"]) if s["key"] in en_secs else []
        if ptr and s["key"] in ("balance", "bugs"):  # 주황색은 밸런스·버그 수정에만
            mark_new(kc, ec, ptr)
        coll = s["key"] == "collection"
        for c in kc:
            if not c["title"]:
                c["title"] = s["name"]
        # 버그 수정처럼 영웅이 h4 가 아니라 목록 머리로 온 경우 → 영웅마다 카드
        heroes_ko = set((GL.get("heroes") or {}).values())
        split = []
        for c in kc:
            ns = [n for part in c["parts"] for n in part["nodes"]]
            if ns and all("label" in n for n in ns) and sum(n["label"] in heroes_ko for n in ns) * 2 > len(ns):
                for n in ns:
                    parts = [{"sub": None, "nodes": []}]
                    for k in n["kids"]:
                        if "label" in k and k["label"] in ("기본", "특성"):
                            parts[-1]["nodes"].extend(k["kids"])
                        else:
                            parts[-1]["nodes"].append(k)
                    split.append({"title": n["label"], "parts": parts})
            else:
                split.append(c)
        kc = split
        if coll:  # '새로운 스킨:' 같은 갈래마다 카드 한 장
            split = []
            for c in kc:
                for part in c["parts"]:
                    for n in part["nodes"]:
                        if "label" in n:
                            split.append({"title": n["label"].rstrip(":： "), "parts": [{"sub": None, "nodes": n["kids"]}]})
                        else:
                            split.append({"title": c["title"], "parts": [{"sub": None, "nodes": [n]}]})
            kc = split
        blocks = [b for c in kc for b in card_blocks(c, collection=coll)]
        if blocks:
            sections.append((s["name"], blocks))

    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", a.date)
    title = re.sub(r"\s*-\s*\d{4}년.*$", "", ko["title"])
    pages = paginate(sections)
    out = Path(a.out) if a.out else ROOT.parent / "HotS" / "report" / "patchcards" / a.date
    out.mkdir(parents=True, exist_ok=True)
    kind = {"live": "LIVE", "ptr": "PTR"}.get(ko.get("kind"), "PATCH")
    files = []
    for i, pg in enumerate(pages, 1):
        body = ""
        for name, cols in pg:
            body += f'<div class="sec"><span>{html.escape(name)}</span></div><div class="cols">'
            body += "".join(f'<div class="col">{"".join(c)}</div>' for c in cols) + "</div>"
        meta = {"badge": f"{kind} · {i}/{len(pages)}", "title": html.escape(title),
                "date": f"{int(m[1])}년 {int(m[2])}월 {int(m[3])}일", "intro": intro_html,
                "foot": "원문: news.blizzard.com · 영웅·기술·특성 이름: 공식 한글 게임 자료 기준 · 비공식 번역 · hotscrap.com"}
        f = out / f"{a.date}_{i}.html"
        f.write_text(page_html(meta, body), encoding="utf-8")
        files.append(f)

    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        br = p.chromium.launch(channel="chrome")
        pg = br.new_page(viewport={"width": 1600, "height": 1200}, device_scale_factor=1.25)
        for f in files:
            pg.goto(f.resolve().as_uri())
            pg.evaluate("document.fonts.ready")
            pg.wait_for_timeout(400)
            png = f.with_suffix(".png")
            pg.screenshot(path=str(png), full_page=True)
            h = pg.evaluate("document.body.scrollHeight")
            print(png, h)
        br.close()


if __name__ == "__main__":
    main()
