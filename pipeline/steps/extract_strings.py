# -*- coding: utf-8 -*-
"""Step T2. 영문 노트에서 번역할 문장(세그먼트)만 뽑기 → raw/translate/segments.json

세그먼트 = 블록 요소(p·li 의 직접 내용·h2~h6·td·blockquote) 하나의 innerHTML.
인라인 태그(<b> <span class="pn-new"> <s> …)는 그대로 두고 글자만 번역하게 한다.
같은 문장이 여러 번 나오면 한 번만 번역한다(패치 노트는 상투 문구가 많다).

  segments.json = {"meta": {...}, "items": [{"id": 1, "en": "…원문 조각…", "n": 12}]}
    n = 등장 횟수(많이 쓰이는 문장부터 정렬)

사용: python extract_strings.py
"""
import json
import re
from collections import Counter
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parents[2]
EN = ROOT / "site" / "data" / "patchnotes" / "en"
OUT = ROOT / "raw" / "translate"
BLOCK = {"p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "td", "th", "blockquote", "figcaption", "dt", "dd"}
SKIP_TXT = re.compile(r"^\s*$|^[\d\s.,%+\-–—/()\[\]]*$")


def segments_of(html):
    """블록 요소별 innerHTML 조각. li 는 하위 ul/ol 을 뺀 직접 내용만."""
    soup = BeautifulSoup(html or "", "html.parser")
    out = []
    for el in soup.find_all(list(BLOCK)):
        if el.name == "li":
            parts = []
            for c in el.children:
                if isinstance(c, Tag) and c.name in ("ul", "ol"):
                    break
                parts.append(c)
            frag = "".join(str(x) for x in parts)
        else:
            if el.find(list(BLOCK)):  # 블록이 중첩되면 안쪽에서 따로 잡힌다
                continue
            frag = el.decode_contents()
        frag = re.sub(r"\s+", " ", frag).strip()
        if frag and not SKIP_TXT.match(BeautifulSoup(frag, "html.parser").get_text()):
            out.append(frag)
    # 블록 밖 최상위 조각(영웅·전장 소제목 <strong class="pn-name">Xul</strong> 등)
    for c in soup.children:
        if isinstance(c, Tag):
            if c.name in BLOCK or c.name in ("ul", "ol", "table", "tbody", "tr"):
                continue
            frag = re.sub(r"\s+", " ", c.decode_contents() if c.name in ("div", "span") else str(c)).strip()
        else:
            frag = re.sub(r"\s+", " ", str(c)).strip()
        if frag and not SKIP_TXT.match(BeautifulSoup(frag, "html.parser").get_text()):
            out.append(frag)
    # 블록이 하나도 없는 순수 텍스트(드묾)
    if not out:
        t = re.sub(r"\s+", " ", soup.get_text(" ", strip=True))
        if t and not SKIP_TXT.match(t):
            out.append(t)
    return out


def walk(doc, add):
    add(doc.get("title"))
    for sec in doc.get("sections", []):
        add(sec.get("name"))
        for frag in segments_of(sec.get("html")):
            add(frag)
        for h in sec.get("heroes", []):
            add(h.get("name"))
            for c in h.get("changes", []):
                add(c.get("name"))
                for l in c.get("lines", []):
                    add(l.get("html") or l.get("text"))
        for it in sec.get("items", []):
            add(it.get("name"))
            for c in it.get("changes", []):
                add(c.get("name"))
                for l in c.get("lines", []):
                    add(l.get("html") or l.get("text"))


def main():
    cnt = Counter()
    files = sorted(EN.glob("*.json"))
    for f in files:
        doc = json.loads(f.read_text(encoding="utf-8"))
        def add(s):
            if not s:
                return
            s = re.sub(r"\s+", " ", str(s)).strip()
            if not s or SKIP_TXT.match(BeautifulSoup(s, "html.parser").get_text()):
                return
            if not re.search(r"[A-Za-z]", s):  # 숫자·기호만 있으면 번역 불필요
                return
            cnt[s] += 1
        walk(doc, add)
    items = [{"id": i + 1, "en": s, "n": n} for i, (s, n) in enumerate(cnt.most_common())]
    OUT.mkdir(parents=True, exist_ok=True)
    chars = sum(len(x["en"]) for x in items)
    (OUT / "segments.json").write_text(json.dumps({
        "meta": {"files": len(files), "unique": len(items), "occurrences": sum(cnt.values()), "chars": chars},
        "items": items}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"세그먼트: 문서 {len(files)} · 등장 {sum(cnt.values())} · 고유 {len(items)} · 글자 {chars:,} → {OUT / 'segments.json'}")


if __name__ == "__main__":
    main()
