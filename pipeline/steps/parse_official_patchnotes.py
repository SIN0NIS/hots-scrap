# -*- coding: utf-8 -*-
"""Step B. raw/official/{newsId}.html → data/patchnotes/official/{date}.json

본문(section.blog) 형식은 연도별로 다르다. 공통 규칙으로 처리:
  상위 섹션 = h2 가 있으면 h2, 없으면 h3 (목차 "빠른 탐색/바로가기/검색" 은 버림)
  영웅      = h4 (어느 섹션에 있든). 2017 형식은 h3 가 역할군, 그 아래 h4 영웅
             "영웅 개편: 레가르" 처럼 h3 제목 자체가 영웅인 경우도 처리
  소제목    = p>strong 보라: 기본/능력치/기술/특성
  라벨 li   = li 의 ul 앞 텍스트가 짧으면 라벨(기술명 [Q] / (Q), "N레벨", 전장명)
  전장      = 전장 섹션의 li 보라 라벨 또는 p 보라 라벨 + 뒤따르는 ul
  색: 주황 rgb(255,140,0)=이번 추가 텍스트(pn-new), 보라(pn-h), 파랑(pn-name), <s>=삭제

사용:
  python parse_official_patchnotes.py            # raw 전체
  python parse_official_patchnotes.py --id 24291432
"""
import argparse
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "raw" / "official"
OUT = ROOT / "site" / "data" / "patchnotes" / "official"
ALIAS = ROOT / "pipeline" / "aliases.json"
HEROES_JSON = ROOT.parent / "hots_scrap" / "site" / "data" / "97650" / "heroes.json"
MAPS_JS = ROOT.parent / "hots_scrap" / "site" / "replay" / "js" / "data_maps.js"

SECTION_KEYS = {
    "일반": "general", "전장 업데이트": "battlegrounds", "전장": "battlegrounds",
    "밸런스 업데이트": "balance", "영웅 밸런스": "balance", "영웅": "heroes", "영웅 업데이트": "heroes",
    "버그 수정": "bugs", "신규 영웅": "new_hero", "새로운 영웅": "new_hero",
    "사용자 인터페이스": "ui", "디자인 및 게임플레이": "design", "디자인 및 게임 플레이": "design",
    "아트": "art", "사운드": "sound", "상점": "shop", "수집품": "collection",
    "전사": "role_tank", "돌격": "role_bruiser", "치유사": "role_healer", "지원가": "role_support",
    "암살자": "role_assassin", "근접 암살자": "role_melee", "원거리 암살자": "role_ranged", "전문가": "role_specialist",
}
TOC_RE = re.compile(r"빠른 탐색|바로가기|^검색|목차")
REWORK_RE = re.compile(r"^(?:영웅\s*)?개편\s*[:：]\s*(.+)$|^(.+?)\s*(?:영웅\s*)?개편$")
DATE_RE = re.compile(r"(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일")
LEVEL_RE = re.compile(r"^(\d+)\s*레벨$")
KEY_RE = re.compile(r"[\[(]([^\[\]()]{1,20})[\])]\s*$")
ORANGE = re.compile(r"255,\s*140,\s*0|ff8c00", re.I)
PURPLE = re.compile(r"9900ff|9933ff|153,\s*0,\s*255|153,\s*51,\s*255", re.I)
BLUE = re.compile(r"0099ff|0,\s*153,\s*255", re.I)
GROUPS = {"기본": "base", "능력치": "stat", "기술": "ability", "특성": "talent", "고유 능력": "trait"}

# ---------- 영문(en-us) 모드 상수 ----------
SECTION_KEYS_EN = {
    "general": "general", "battlegrounds": "battlegrounds", "battleground": "battlegrounds", "maps": "battlegrounds",
    "heroes": "heroes", "hero": "heroes", "bug fixes": "bugs", "bug fix": "bugs", "new hero": "new_hero",
    "art": "art", "design": "design", "sound": "sound", "audio": "sound", "user interface": "ui", "ui": "ui",
    "collection": "collection", "shop": "shop", "balance update": "balance", "balance": "balance",
    "warrior": "role_tank", "tank": "role_tank", "bruiser": "role_bruiser", "healer": "role_healer",
    "support": "role_support", "assassin": "role_assassin", "melee assassin": "role_melee",
    "ranged assassin": "role_ranged", "specialist": "role_specialist", "multiclass": "role_multi",
}
SECTION_NAMES_EN = {  # 화면에 쓸 한글 섹션 이름 (구조 번역은 기계적으로 고정)
    "general": "일반", "battlegrounds": "전장", "heroes": "영웅", "bugs": "버그 수정", "new_hero": "새로운 영웅",
    "art": "아트", "design": "디자인", "sound": "사운드", "ui": "사용자 인터페이스", "collection": "수집품",
    "shop": "상점", "balance": "밸런스 업데이트", "intro": "머리말",
    "role_tank": "전사", "role_bruiser": "투사", "role_healer": "치유사", "role_support": "지원가",
    "role_assassin": "암살자", "role_melee": "근접 암살자", "role_ranged": "원거리 암살자",
    "role_specialist": "전문가", "role_multi": "다중 역할",
    "map_updates": "전장 업데이트", "hero_updates": "영웅 업데이트", "gameplay": "게임 플레이",
    "matchmaking": "대전 상대 검색", "rework": "개편", "quests": "퀘스트", "events": "이벤트",
}
GROUPS_EN = {"base": "base", "stats": "stat", "stat": "stat", "abilities": "ability", "ability": "ability",
             "talents": "talent", "talent": "talent", "trait": "trait"}
TOC_EN_RE = re.compile(r"quick navigation|jump to|^navigation|table of contents", re.I)
LEVEL_EN_RE = re.compile(r"^level\s*(\d+)$", re.I)
REWORK_EN_RE = re.compile(r"^(?:hero\s*)?rework\s*[:：]\s*(.+)$|^(.+?)\s*(?:hero\s*)?rework$", re.I)
DATE_EN_RE = re.compile(r"([A-Z][a-z]+)\s+(\d{1,2}),?\s+(\d{4})")
MONTHS = {m: i + 1 for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july",
                                          "august", "september", "october", "november", "december"])}
EN_MODE = False


# ---------- 이름 → id ----------
def load_maps():
    hero, bg = {}, {}
    if HEROES_JSON.exists():
        for h in json.loads(HEROES_JSON.read_text(encoding="utf-8"))["heroes"]:
            hero[h["name"]] = h["id"]
    if MAPS_JS.exists():
        for m in re.finditer(r'"slug": "([^"]+)", "ko": "([^"]+)"', MAPS_JS.read_text(encoding="utf-8")):
            bg[m.group(2)] = m.group(1)
    if ALIAS.exists():
        a = json.loads(ALIAS.read_text(encoding="utf-8"))
        hero.update(a.get("heroes", {}))
        bg.update(a.get("battlegrounds", {}))
    return hero, bg


def norm_name(s):
    s = re.sub(r"[\u200b\ufeff]", "", s or "")
    s = re.sub(r"\s+", " ", s).strip()
    s = KEY_RE.sub("", s)
    return s.strip(" :：")


def hero_name(s):
    """h4/라벨 텍스트 → 영웅 이름 후보 ("태사다르 개편" → "태사다르")"""
    s = norm_name(s)
    if EN_MODE:
        return re.sub(r"\s*(hero\s*)?rework$", "", s, flags=re.I).strip()
    s = re.sub(r"\s*(영웅\s*)?개편$", "", s)
    return s.strip()


def group_of(label):
    return (GROUPS_EN.get(label.lower()) if EN_MODE else GROUPS.get(label))


def level_of(label):
    m = (LEVEL_EN_RE if EN_MODE else LEVEL_RE).match(label)
    return int(m.group(1)) if m else None


SKIP_LABELS = {"버그 수정", "일반", "전장", "영웅", "기술", "특성", "기본", "능력치", "수집품", "사용자 인터페이스",
               "Bug Fixes", "General", "Battlegrounds", "Heroes", "Abilities", "Talents", "Base", "Stats",
               "Collection", "User Interface", "Developer Comment", "Developer Comments"}


def ids_of(v):
    return v if isinstance(v, list) else [v]


# ---------- HTML 정리 ----------
def clean_html(nodes):
    frag = BeautifulSoup("<div></div>", "html.parser").div
    for el in nodes:
        if isinstance(el, Comment):
            continue
        frag.append(NavigableString(str(el)) if isinstance(el, NavigableString) else BeautifulSoup(str(el), "html.parser"))
    for c in frag.find_all(string=lambda t: isinstance(t, Comment)):
        c.extract()
    for a in frag.find_all("a"):
        if a.get("name") or a.get("id") or a.get("href", "").startswith("#"):
            a.unwrap() if a.get_text(strip=True) and not a.get("href", "").startswith("#") else a.decompose()
    for t in frag.find_all(["span", "strong", "b"]):
        st = t.get("style", "")
        cls = "pn-new" if ORANGE.search(st) else "pn-h" if PURPLE.search(st) else "pn-name" if BLUE.search(st) else None
        if cls:
            t["class"] = cls
    for t in frag.find_all(True):
        for k in ("style", "target", "rel", "id", "name"):
            if k in t.attrs and not (t.name == "a" and k in ("target", "rel")):
                del t.attrs[k]
    for t in frag.find_all(["span", "div"]):
        if not t.attrs and t.name == "span":
            t.unwrap()
    for t in list(frag.find_all(["p", "div", "hr"])):
        if t.name == "hr" or (not t.get_text(strip=True) and not t.find("img")):
            t.decompose()
    out = frag.decode_contents()
    out = out.replace("\u200b", "").replace("\ufeff", "")      # 보이지 않는 폭 0 공백
    out = out.replace("\xa0", " ").replace("&nbsp;", " ")       # 줄바꿈을 막는 공백
    return re.sub(r"\n\s*\n+", "\n", out).strip()


def head_nodes(li):
    """li 에서 첫 ul 앞까지의 노드들"""
    parts = []
    for c in li.children:
        if isinstance(c, Tag) and c.name in ("ul", "ol"):
            break
        parts.append(c)
    return parts


def head_style(parts):
    return " ".join(t.get("style", "") for p in parts if isinstance(p, Tag) for t in [p] + p.find_all(True))


def line_info(li):
    parts = head_nodes(li)
    html = clean_html(parts)
    tsoup = BeautifulSoup(html, "html.parser")
    for s_ in tsoup.find_all("s"):
        s_.replace_with(NavigableString("~~" + s_.get_text(" ", strip=True) + "~~"))
    text = re.sub(r"\s+", " ", tsoup.get_text(" ", strip=True))
    # 전체가 주황이면 이번 패치에 추가된 줄
    plain = "".join(str(p) for p in parts if isinstance(p, NavigableString)).strip()
    added = bool(text) and not plain and all(
        ORANGE.search(p.get("style", "")) or (p.find(style=ORANGE) is not None and not p.find(string=lambda s: s.strip(), recursive=False))
        for p in parts if isinstance(p, Tag))
    return {"text": text, "html": html, "added": added}


def li_label(li):
    """(라벨, 종류) — 종류: level|purple|blue|plain, 라벨 아니면 (None, None)"""
    parts = head_nodes(li)
    text = re.sub(r"\s+", " ", "".join(p if isinstance(p, NavigableString) else p.get_text(" ") for p in parts)).strip()
    if not text or li.find(["ul", "ol"], recursive=False) is None:
        return None, None
    st = head_style(parts)
    has_strong = any(isinstance(p, Tag) and (p.name in ("strong", "b") or p.find(["strong", "b"])) for p in parts)
    if len(text) > 40 and not has_strong:
        return None, None
    label = norm_name(text)
    if level_of(label) is not None:
        return label, "level"
    if PURPLE.search(st):
        return label, "purple"
    if BLUE.search(st):
        return label, "blue"
    return label, "plain"


def sub_lis(li):
    """li 직계의 모든 ul/ol 안 li (형제 ul 이 둘 이상인 원문이 있다)"""
    out = []
    for u in li.find_all(["ul", "ol"], recursive=False):
        out.extend(u.find_all("li", recursive=False))
    return out


def parse_lis(lis, ctx=None):
    out, ctx = [], dict(ctx or {})
    for li in lis:
        label, kind = li_label(li)
        sub = li.find(["ul", "ol"], recursive=False)
        if label and sub is not None:
            c = dict(ctx)
            if kind == "level":
                c["level"] = level_of(label)
                out.extend(parse_lis(sub_lis(li), c))
            elif group_of(label):
                c["group"] = group_of(label)
                out.extend(parse_lis(sub_lis(li), c))
            else:
                raw = re.sub(r"\s+", " ", "".join(p if isinstance(p, NavigableString) else p.get_text(" ") for p in head_nodes(li))).strip()
                key = KEY_RE.search(raw)
                subs = sub_lis(li)
                leaf = [x for x in subs if li_label(x)[0] is None]
                deeper = [x for x in subs if li_label(x)[0] is not None]
                out.append({"name": label, "key": key.group(1) if key else None, "new": raw.startswith("(신규)") or "신규" in raw[:6],
                            "group": c.get("group", "talent" if "level" in c else "ability"),
                            "level": c.get("level"), "lines": [line_info(x) for x in leaf]})
                if deeper:
                    out.extend(parse_lis(deeper, {**c, "parent": label}))
        else:
            out.append({"name": None, "key": None, "new": False, "group": ctx.get("group", "base"),
                        "level": ctx.get("level"), "lines": [line_info(li)]})
            deeper2 = sub_lis(li)
            if deeper2:  # 라벨이 아닌 긴 문장 아래 하위 항목
                out.extend(parse_lis(deeper2, ctx))
    return out


def hero_block(nodes):
    changes, group = [], None
    for n in nodes:
        if not isinstance(n, Tag):
            continue
        if n.name == "p":
            t = norm_name(n.get_text(" ", strip=True))
            if group_of(t):
                group = group_of(t)
        elif n.name == "ul":
            changes.extend(parse_lis(n.find_all("li", recursive=False), {"group": group} if group else {}))
    return {"changes": changes, "html": clean_html(nodes)}


def lift_headers(body):
    """닫히지 않은 li/ul 안에 갇힌 h2~h4(원문 마크업 오류)를 그 뒤 형제들과 함께 본문 최상위로 끌어올린다."""
    for _ in range(50):
        h = next((x for x in body.find_all(["h2", "h3", "h4"]) if x.parent is not body), None)
        if h is None:
            return
        top = h
        while top.parent is not body:
            top = top.parent
        block = [h] + list(h.next_siblings)
        anchor = top
        for n in block:
            n.extract()
            anchor.insert_after(n)
            anchor = n


def split_by(nodes, tag):
    """nodes 를 tag 헤더로 자른다. 글자 없는 헤더(구분선 이미지만 든 h4 등)는 헤더로 보지 않는다."""
    groups, cur, head = [], [], None
    for n in nodes:
        if isinstance(n, Tag) and n.name == tag and n.get_text(strip=True):
            if cur or head is not None:
                groups.append((head, cur))
            head, cur = n.get_text(" ", strip=True), []
        else:
            cur.append(n)
    groups.append((head, cur))
    return groups


def bg_items(nodes, bg_map, unmatched, date):
    """전장 섹션: li 보라 라벨 / p 라벨 + 뒤따르는 ul"""
    items = []
    pending = None
    for n in nodes:
        if not isinstance(n, Tag):
            continue
        if n.name in ("p", "h3", "h4", "h5"):
            label = norm_name(n.get_text(" ", strip=True))
            if label in bg_map:
                pending = {"name": label, "battleground": bg_map[label], "html": ""}
                items.append(pending)
            else:
                if label and PURPLE.search(head_style([n])) and 1 < len(label) < 20 and label not in SKIP_LABELS:
                    unmatched.setdefault("maybe_battlegrounds", {}).setdefault(label, []).append(date)
                pending = None
        elif n.name == "ul":
            handled = False
            for li in n.find_all("li", recursive=False):
                label, k = li_label(li)
                if label and label in bg_map:
                    handled = True
                    items.append({"name": label, "battleground": bg_map[label], "html": clean_html(list(li.children))})
                elif label and k == "purple" and label not in SKIP_LABELS:
                    unmatched.setdefault("maybe_battlegrounds", {}).setdefault(label, []).append(date)
            if not handled and pending is not None:
                pending["html"] += clean_html([n])
    return items


def parse_article(html, hero_map, bg_map, unmatched, list_title=None):
    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.get_text() if soup.title else "").split(" — ")[0].strip()
    if list_title and DATE_RE.search(list_title) and not DATE_RE.search(title):
        title = list_title
    ld = soup.find("script", type="application/ld+json")
    published = None
    if ld:
        m = re.search(r'"datePublished":\s*"([^"]+)"', ld.string or "")
        published = m.group(1) if m else None
    canon = soup.find("link", rel="canonical")
    source = canon["href"] if canon else None
    if EN_MODE:
        m = DATE_EN_RE.search(title)
        date = f"{m.group(3)}-{MONTHS.get(m.group(1).lower(), 1):02d}-{int(m.group(2)):02d}" if m else (published or "")[:10]
        t = title.lower()
        kind = ("ptr" if ("ptr" in t or "public test" in t) else "hotfix" if "hotfix" in t
                else "balance" if "balance" in t else "live" if "live" in t else "patch")
    else:
        m = DATE_RE.search(title)
        date = f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}" if m else (published or "")[:10]
        t = title.upper()
        kind = ("ptr" if ("PTR" in t or "공개 테스트" in title) else "hotfix" if ("긴급" in title or "핫픽스" in title)
                else "balance" if "밸런스" in title else "live" if "라이브" in title else "patch")

    body = soup.select_one("section.blog")
    if body is None:
        raise ValueError("section.blog 없음")
    for d in list(body.find_all("div")):  # div 는 의미 없음(2018~2019 문서는 중첩 div 로 감쌈) → 모두 펴기
        d.unwrap()
    lift_headers(body)
    top = list(body.children)
    toc_re = TOC_EN_RE if EN_MODE else TOC_RE
    real_h2 = [n for n in top if isinstance(n, Tag) and n.name == "h2" and not toc_re.search(n.get_text())]
    lvl = "h2" if real_h2 else "h3"
    sections, heroes, bgs = [], [], []

    def add_hero(hname, hnodes, bucket):
        hname = hero_name(hname)
        if not hname or hname in SKIP_LABELS or hname in bg_map or (hname not in hero_map and (len(hname) > 12 or re.search(r"\d", hname))):
            return
        hid = hero_map.get(hname)
        if hid is None:
            unmatched.setdefault("heroes", {}).setdefault(hname, []).append(date)
        blk = hero_block(hnodes)
        ids = ids_of(hid) if hid else []
        bucket.append({"name": hname, "heroId": ids[0] if ids else None, "heroIds": ids, **blk})
        heroes.extend(ids)

    for head, nodes in split_by(top, lvl):
        if head is None:
            if not BeautifulSoup("".join(str(n) for n in nodes), "html.parser").get_text(strip=True):
                continue
            name, key = "머리말", "intro"
        else:
            name = norm_name(head)
            if toc_re.search(name):  # 목차: 링크 목록만 버리고 그 자리에 있던 그림·설명은 남긴다
                keep = [n for n in nodes if not (isinstance(n, Tag) and n.name in ("ul", "ol"))]
                rest = clean_html(keep)
                if BeautifulSoup(rest, "html.parser").get_text(strip=True) or "<img" in rest:
                    sections.append({"name": "머리말", "key": "intro", "html": rest})
                continue
            if EN_MODE:
                key = SECTION_KEYS_EN.get(name.lower(), re.sub(r"\W+", "_", name).strip("_").lower())
            else:
                key = SECTION_KEYS.get(name, re.sub(r"\W+", "_", name).strip("_").lower())
        sec = {"name": name, "key": key, "html": clean_html(nodes)}
        hs = []
        rw = (REWORK_EN_RE if EN_MODE else REWORK_RE).match(name)
        if rw and not any(isinstance(n, Tag) and n.name == "h4" for n in nodes):
            add_hero(rw.group(1) or rw.group(2), nodes, hs)
            sec["key"] = "rework"
        for hname, hnodes in split_by(nodes, "h4"):
            if hname is None:
                continue
            if norm_name(hname) in bg_map:  # h4 가 전장인 문서
                sec.setdefault("items", []).append({"name": norm_name(hname), "battleground": bg_map[norm_name(hname)], "html": clean_html(hnodes)})
                bgs.append(bg_map[norm_name(hname)])
                continue
            add_hero(hname, hnodes, hs)
        if hs:
            sec["heroes"] = hs
        if key == "battlegrounds" or name.startswith("전장"):
            its = bg_items(nodes, bg_map, unmatched, date)
            if its:
                sec["items"] = its
                bgs.extend(i["battleground"] for i in its if i["battleground"])
        elif not hs:
            # h4 영웅이 없는 섹션: h3(전장|영웅) 하위나 li 라벨/"영웅:" 접두에서 영웅·전장 찾기
            items = []
            for h3, part in split_by(nodes, "h3" if lvl == "h2" else "h5"):
                h3n = norm_name(h3) if h3 else None
                if h3n and (h3n.startswith("전장") or (EN_MODE and h3n.lower().startswith("battleground"))):
                    for it in bg_items(part, bg_map, unmatched, date):
                        it["under"] = h3n
                        items.append(it)
                        if it["battleground"]:
                            bgs.append(it["battleground"])
                    continue
                pend = None
                for n in part:
                    if not isinstance(n, Tag):
                        continue
                    if n.name in ("p", "strong", "b", "font", "span", "div"):
                        lab = hero_name(n.get_text(" ", strip=True))
                        st = n if n.name in ("strong", "b") else n.find(["strong", "b"])
                        if lab in hero_map and st is not None and len(lab) < 20:
                            ids = ids_of(hero_map[lab])
                            heroes.extend(ids)
                            pend = {"name": lab, "heroId": ids[0], "heroIds": ids, "under": h3n, "html": "", "changes": []}
                            items.append(pend)
                        elif n.get_text(strip=True):
                            pend = None
                    elif n.name == "ul" and pend is not None:
                        pend["html"] += clean_html([n])
                        pend["changes"].extend(parse_lis(n.find_all("li", recursive=False)))
                    elif n.name not in ("ul", "blockquote", "img"):
                        pend = None
                seen_li = set()
                for ul in [n for n in part if isinstance(n, Tag) and n.name in ("ul", "ol")]:
                    lis = ul.find_all("li", recursive=False)
                    lis += [x for x in ul.find_all("li") if x not in lis and li_label(x)[0]]  # 중첩 li 안의 라벨도
                    for li in lis:
                        if id(li) in seen_li:
                            continue
                        seen_li.add(id(li))
                        label, k = li_label(li)
                        if not label:  # "아르타니스: …" 접두 형식
                            st = li.find(["strong", "b"])
                            pre = hero_name(st.get_text()) if st is not None else ""
                            if pre and pre in hero_map and li.get_text(" ", strip=True).startswith(pre):
                                ids = ids_of(hero_map[pre])
                                heroes.extend(ids)
                                items.append({"name": pre, "heroId": ids[0], "heroIds": ids, "under": h3n,
                                              "html": clean_html(list(li.children)),
                                              "changes": [{"name": None, "key": None, "new": False, "group": "base", "level": None, "lines": [line_info(li)]}]})
                            continue
                        label = hero_name(label)
                        if label in SKIP_LABELS:
                            continue
                        if label in bg_map:
                            it = {"name": label, "battleground": bg_map[label], "html": clean_html(list(li.children)), "under": h3n}
                            bgs.append(bg_map[label])
                            items.append(it)
                        elif label in hero_map or (h3n in ("영웅", "Heroes") and k == "purple"):
                            ids = ids_of(hero_map.get(label)) if label in hero_map else []
                            if not ids:
                                unmatched.setdefault("heroes", {}).setdefault(label, []).append(date)
                            heroes.extend(ids)
                            sub = li.find("ul", recursive=False)
                            items.append({"name": label, "heroId": ids[0] if ids else None, "heroIds": ids, "under": h3n,
                                          "html": clean_html(list(li.children)),
                                          "changes": parse_lis(sub.find_all("li", recursive=False)) if sub is not None else []})
            if items:  # 같은 영웅·전장이 줄마다 따로 생기지 않게 하나로 합친다
                merged, by_key = [], {}
                for it in items:
                    k = (it.get("heroId") or it.get("battleground") or it.get("name"), it.get("under"))
                    if k in by_key:
                        m = by_key[k]
                        m["html"] += it.get("html", "")
                        m.setdefault("changes", []).extend(it.get("changes") or [])
                    else:
                        by_key[k] = it
                        merged.append(it)
                sec["items"] = merged
        sections.append(sec)

    return {"date": date, "kind": kind, "title": title, "source": source, "published": published,
            "sections": sections, "heroes": sorted(set(heroes)), "battlegrounds": sorted(set(bgs))}


def main():
    global EN_MODE, RAW, OUT
    ap = argparse.ArgumentParser()
    ap.add_argument("--id")
    ap.add_argument("--en", action="store_true", help="영문 원문(raw/official_en) → data/patchnotes/en/")
    a = ap.parse_args()
    if a.en:
        EN_MODE = True
        RAW = ROOT / "raw" / "official_en"
        OUT = ROOT / "site" / "data" / "patchnotes" / "en"
    OUT.mkdir(parents=True, exist_ok=True)
    hero_map, bg_map = load_maps()
    if EN_MODE:  # 영문명 → id (용어집의 영문→한글 + 한글→id)
        gp = ROOT / "site" / "data" / "patchnotes" / "glossary.json"
        gl = json.loads(gp.read_text(encoding="utf-8")) if gp.exists() else {}
        en_hero, en_bg = {}, {}
        for en_name, ko_name in (gl.get("heroes") or {}).items():
            if ko_name in hero_map:
                en_hero[en_name] = hero_map[ko_name]
        for en_name, ko_name in (gl.get("battlegrounds") or {}).items():
            if ko_name in bg_map:
                en_bg[en_name] = bg_map[ko_name]
        en_hero.update((gl.get("alias_heroes") or {}))
        en_bg.update((gl.get("alias_battlegrounds") or {}))
        hero_map, bg_map = en_hero, en_bg
    if not hero_map:
        print("경고: 영웅 이름표 없음", file=sys.stderr)
    lf = (RAW / "missing.json") if (EN_MODE and (RAW / "missing.json").exists()) else (RAW / "list.json")
    lst = {i["newsId"]: i for i in json.loads(lf.read_text(encoding="utf-8"))} if lf.exists() else {}
    files = [RAW / f"{a.id}.html"] if a.id else sorted(RAW.glob("*.html"))
    unmatched, done, fail, used = {}, 0, 0, {}
    if not a.id:
        for f in OUT.glob("*.json"):
            f.unlink()
    for f in files:
        nid = f.stem
        if not a.id and lst and nid in lst and not lst[nid]["isPatchNote"]:
            continue
        try:
            doc = parse_article(f.read_text(encoding="utf-8"), hero_map, bg_map, unmatched, lst.get(nid, {}).get("title"))
            if EN_MODE:
                doc["lang"] = "en"
                for sec in doc["sections"]:
                    sec["nameKo"] = SECTION_NAMES_EN.get(sec["key"], "")
        except Exception as e:
            fail += 1
            print(f"실패 {nid}: {e}", file=sys.stderr)
            continue
        doc["newsId"] = nid
        stem = doc["date"]
        if stem in used and used[stem] != nid:
            stem = f"{doc['date']}_{nid}"
        used[stem] = nid
        (OUT / f"{stem}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
        done += 1
        print(f"{stem}.json  {doc['kind']:7s} 영웅 {len(doc['heroes']):2d} 전장 {len(doc['battlegrounds'])}  {doc['title']}")
    (OUT.parent / "unmatched.json").write_text(json.dumps(unmatched, ensure_ascii=False, indent=1), encoding="utf-8")
    n_un = sum(len(v) for v in unmatched.values())
    print(f"완료 {done}건, 실패 {fail}건, 미매핑 이름 {n_un}개 → {OUT.parent / 'unmatched.json'}")


if __name__ == "__main__":
    main()
