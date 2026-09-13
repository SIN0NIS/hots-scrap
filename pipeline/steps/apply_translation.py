# -*- coding: utf-8 -*-
"""Step T5. 번역문을 영문 노트 구조에 넣어 한국어 노트 만들기
   site/data/patchnotes/en/<date>.json + raw/translate/out → site/data/patchnotes/translated/<date>.json

영문판과 완전히 같은 구조(섹션·영웅·변경 목록)를 유지하고 글자만 한국어로 바꾼다.
번역이 없는 문장은 영문 그대로 두고 몇 건인지 기록한다(화면에서 원문 링크로 안내).

각 문서에 번역 표기를 남긴다:
  "translated": {"by": "Claude (claude-opus-5)", "at": "<날짜>", "source": "<블리자드 원문 URL>",
                 "glossary": "HeroesToolChest 공식 게임 텍스트(enus↔kokr) 대조", "segments": 총/번역됨}

사용: python apply_translation.py [--at 2026-09-13]
"""
import argparse
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parents[2]
PN = ROOT / "site" / "data" / "patchnotes"
EN = PN / "en"
OUT = PN / "translated"
TR = ROOT / "raw" / "translate"
BLOCK = {"p", "li", "h1", "h2", "h3", "h4", "h5", "h6", "td", "th", "blockquote", "figcaption", "dt", "dd"}
BY = "Claude (claude-opus-5)"


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


GLOSS = json.loads((PN / "glossary.json").read_text(encoding="utf-8")) if (PN / "glossary.json").exists() else {}
BY_HERO = GLOSS.get("byHero") or {}
NAMES = dict(GLOSS.get("heroes") or {})          # 영문 영웅명 → 공식 한글명
NAMES.update(GLOSS.get("battlegrounds") or {})   # 전장 이름도 같은 자리에 온다


def official_name(frag, hero):
    """조각이 '이름 하나'면 그 영웅의 공식 한글명으로 바꾼다. (Cheap Shot 이 영웅마다 다른 문제)"""
    if not frag:
        return None
    table = BY_HERO.get(hero) or {}
    soup = BeautifulSoup(frag, "html.parser")
    txt = norm(soup.get_text(" ", strip=True))
    if not txt or len(txt) > 60:
        return None
    key = re.sub(r"\s*[\[(][^\[\]()]{1,20}[\])]\s*$", "", txt).strip()
    ko = table.get(key) or table.get(txt)
    if not ko:  # 영웅·전장 이름 자체가 소제목인 경우 ("Chen", "Abathur:")
        bare = key.rstrip(":： ").strip()
        ko = NAMES.get(bare)
        if ko:
            key = bare
    if not ko:
        return None
    tail = txt[len(key):]
    out = frag
    for t in soup.find_all(string=True):
        if norm(t) and norm(t) in txt:
            out = frag.replace(str(t), ko + tail, 1)
            break
    return out if out != frag else ko + tail


class Table:
    """번역 메모리(원문 → 번역). 원문 문장으로 찾으므로 문장 목록이 바뀌어도 어긋나지 않는다."""
    def __init__(self):
        mem = json.loads((TR / "memory.json").read_text(encoding="utf-8")) if (TR / "memory.json").exists() else {}
        self.map = {norm(en): ko for en, ko in mem.items() if (ko or "").strip()}
        self.hit = self.miss = 0

    def get(self, en):
        k = norm(en)
        if not k:
            return None
        v = self.map.get(k)
        if v is None:
            # 눈에 보이는 영문 글자가 있을 때만 '번역 없음'으로 센다 (이미지·링크 조각 제외)
            vis = BeautifulSoup(k, "html.parser").get_text(" ", strip=True)
            if re.search(r"[A-Za-z]{3,}", vis):
                self.miss += 1
            return None
        self.hit += 1
        return v


def replace_frag(parent, nodes, html):
    """nodes(부모의 앞부분 자식들)를 번역 html 로 갈아끼운다."""
    new = BeautifulSoup(html, "html.parser")
    anchor = nodes[0]
    for c in list(new.contents):
        anchor.insert_before(c.extract() if hasattr(c, "extract") else c)
    for n in nodes:
        n.extract()


def translate_html(html, T, hero=None):
    """블록 요소(p·li·h*)와 블록 밖 최상위 조각을 번역문으로 갈아끼운다.
       hero 가 주어지면 그 영웅의 공식 기술·특성명을 우선 적용한다."""
    if not html:
        return html
    soup = BeautifulSoup(html, "html.parser")
    # 블록 밖 최상위 조각(영웅·전장 소제목 등)
    for c in list(soup.children):
        if isinstance(c, Tag) and (c.name in BLOCK or c.name in ("ul", "ol", "table", "tbody", "tr")):
            continue
        raw = c.decode_contents() if isinstance(c, Tag) and c.name in ("div", "span") else str(c)
        ko = official_name(raw, hero) or T.get(raw)
        if ko and norm(ko) != norm(raw):
            new = BeautifulSoup(ko, "html.parser")
            if isinstance(c, Tag) and c.name in ("div", "span"):
                c.clear()
                for x in list(new.contents):
                    c.append(x.extract() if hasattr(x, "extract") else x)
            else:
                for x in list(new.contents):
                    c.insert_before(x.extract() if hasattr(x, "extract") else x)
                c.extract()
    for el in soup.find_all(list(BLOCK)):
        if el.name == "li":
            parts = []
            for c in el.children:
                if isinstance(c, Tag) and c.name in ("ul", "ol"):
                    break
                parts.append(c)
            if not parts:
                continue
            ko = T.get("".join(str(x) for x in parts))
            if ko:
                replace_frag(el, parts, ko)
        else:
            if el.find(list(BLOCK)):
                continue
            ko = T.get(el.decode_contents())
            if ko:
                el.clear()
                new = BeautifulSoup(ko, "html.parser")
                for c in list(new.contents):
                    el.append(c.extract() if hasattr(c, "extract") else c)
    return str(soup)


def plain(html):
    s = BeautifulSoup(html or "", "html.parser")
    for x in s.find_all("s"):
        x.replace_with(NavigableString("~~" + x.get_text(" ", strip=True) + "~~"))
    return re.sub(r"\s+", " ", s.get_text(" ", strip=True))


def tr_lines(lines, T, hero=None):
    for l in lines:
        raw = l.get("html")
        ko = T.get(raw)                     # 줄 하나가 통째로 한 세그먼트인 경우(대부분)
        l["html"] = ko if ko else translate_html(raw, T, hero)   # 블록이 들어있으면 블록별로
        l["text"] = plain(l["html"])
    return lines


def tr_changes(changes, T, hero=None):
    for c in changes:
        if c.get("name"):
            c["nameEn"] = c["name"]
            table = BY_HERO.get(hero) if hero else None
            key = re.sub(r"\s*[\[(][^\[\]()]{1,20}[\])]\s*$", "", c["name"]).strip()
            c["name"] = (table or {}).get(key) or (table or {}).get(c["name"]) or T.get(c["name"]) or c["name"]
        tr_lines(c.get("lines") or [], T, hero)
    return changes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--at", default="2026-09-13", help="번역 표기에 남길 날짜")
    a = ap.parse_args()
    T = Table()
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*.json"):
        f.unlink()
    done = 0
    for f in sorted(EN.glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        before = T.miss
        doc["titleEn"] = doc["title"]
        doc["title"] = T.get(doc["title"]) or doc["title"]
        for sec in doc.get("sections", []):
            sec["nameEn"] = sec["name"]
            sec["name"] = sec.get("nameKo") or T.get(sec["name"]) or sec["name"]
            sec.pop("nameKo", None)
            sec["html"] = translate_html(sec.get("html"), T)
            for h in sec.get("heroes", []):
                hid = h.get("heroId")
                h["nameEn"] = h["name"]
                h["name"] = T.get(h["name"]) or h["name"]
                h["html"] = translate_html(h.get("html"), T, hid)
                tr_changes(h.get("changes") or [], T, hid)
            for it in sec.get("items", []):
                hid = it.get("heroId")
                it["nameEn"] = it["name"]
                it["name"] = T.get(it["name"]) or it["name"]
                it["html"] = translate_html(it.get("html"), T, hid)
                tr_changes(it.get("changes") or [], T, hid)
        doc["lang"] = "ko"
        doc["translated"] = {"by": BY, "at": a.at, "source": doc.get("source"),
                             "glossary": "HeroesToolChest 공식 게임 텍스트(enus↔kokr) 대조",
                             "untranslated": T.miss - before}
        (OUT / f.name).write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
        done += 1
    print(f"번역본 {done}건 → {OUT}  (문장 치환 {T.hit}, 번역 없음 {T.miss})")


if __name__ == "__main__":
    main()
