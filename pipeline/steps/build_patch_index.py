# -*- coding: utf-8 -*-
"""Step E. 공식 노트(official/*.json) ↔ 빌드(builds.json) ↔ diff 를 날짜로 매칭 → data/patchnotes/index.json

매칭 규칙: 공식 노트 제목 날짜(한국 기준, 보통 미국 날짜 +1)와 빌드의 git 추가 날짜가 ±3일 안이면 짝.
  여러 빌드가 후보면 가장 가까운 것. PTR 노트는 PTR 빌드와, 나머지는 비-PTR 빌드와만 짝.
  짝이 없는 쪽은 한쪽만 있는 항목으로 남긴다(공식만 / 데이터만).

index.json 항목:
  {date, kind, title, newsId, source(블리자드 원문 주소), official: "official/<date>.json"|null,
   build, version, diff: "diff/<from>-<to>.json"|null, heroes[], battlegrounds[], summary{heroes, changes}}
"""
import json
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def site_file(*parts):
    """배포 저장소 안에서 돌 때도, 작업 폴더 옆에 hots_scrap 이 있을 때도 찾는다.
    (CI 는 저장소를 hots-scrap 이라는 이름으로 받으므로 폴더 이름에 기대면 안 된다)"""
    for base in (ROOT, ROOT.parent / "hots_scrap", ROOT.parent / "hots-scrap"):
        p = base.joinpath("site", *parts)
        if p.exists():
            return p
    return ROOT.joinpath("site", *parts)

PN = ROOT / "site" / "data" / "patchnotes"
BACK, FWD = 2, 21       # 라이브: 빌드 추출일이 패치 후 며칠 늦는다 (2022-02 은 18일)
BACK_PTR, FWD_PTR = 2, 35  # PTR 빌드는 저장소에 더 늦게 올라온다 (실측 25~29일)


def d(s):
    return date.fromisoformat(s[:10])


TIP_KEY = {"Q": "Q", "W": "W", "E": "E", "Heroic": "R", "Trait": "D", "Active": "활성", "Passive": "지속 효과"}


def tip_html(t):
    """게임 툴팁 마크업 → 패치 기록 말풍선용 작은 HTML. 값은 <b class=tv>, '지속 효과:' 같은 초록 머리는 <b class=tq>."""
    import re
    t = t or ""
    t = re.sub(r"\s*\(\+([\d.]+%) per level\)", r" (+\1)", t)            # 레벨 성장치는 "(+4%)" 로만 적는다
    t = re.sub(r'<c val="00ff90">(.*?)</c>', r'<b class="tq">\1</b>', t, flags=re.S)
    t = re.sub(r"<c [^>]*>(.*?)</c>", r'<b class="tv">\1</b>', t, flags=re.S)
    t = re.sub(r"<n\s*/>", "<br>", t)
    t = re.sub(r"<img[^>]*/?>", "", t)
    t = re.sub(r"</?(?!b\b|/b\b|br\b)[a-zA-Z][^>]*>", "", t)               # s·lang 같은 나머지 태그는 글자만 남긴다
    return t.strip()


def write_tips():
    """패치 노트 속 기술·특성 이름을 누르면 뜨는 설명 → data/patchnotes/tips/<live|ptr>/<영웅>.json.
    빌드메이커 자료(data/builds/<판>.ko.json, 1.6MB)를 영웅마다 쪼갠다 — 화면은 누른 영웅 것만 받는다(평균 10KB).
    현재 빌드 기준이다(옛 패치는 당시 설명과 다를 수 있다 — 화면이 그렇게 적는다).
    테스트 서버 자료는 새 영웅의 한국어가 비어 영어로 메워져 있기도 하다(잘아타스 28칸). 그런 칸은 **다른 판의 같은 칸**
    (nameId|buttonId)에 한국어가 있으면 그 이름·설명을 쓰고 `from` 에 그 판을 적는다 — 노트는 한국어 이름으로 부르니까."""
    import re
    hangul = re.compile(r"[가-힣]")
    data = {}
    for ch in ("live", "ptr"):
        src = PN.parent / "builds" / f"{ch}.ko.json"
        if src.exists():
            data[ch] = json.loads(src.read_text(encoding="utf-8"))

    def slots(h):
        for lv, g in [(None, g) for g in (h.get("abilities") or {}).values()] + \
                     [(int(k.replace("level", "")), g) for k, g in (h.get("talents") or {}).items()]:
            for a in g:
                yield lv, a

    ko_by_slot = {}   # (판, 영웅, nameId|buttonId) → 한국어가 있는 칸
    for ch, heroes in data.items():
        for hid, h in heroes.items():
            for _, a in slots(h):
                if hangul.search(a.get("name") or ""):
                    ko_by_slot[(ch, hid, f"{a.get('nameId')}|{a.get('buttonId')}")] = a
    for ch, heroes in data.items():
        other = "live" if ch == "ptr" else "ptr"
        out_dir = PN / "tips" / ch
        out_dir.mkdir(parents=True, exist_ok=True)
        keep = set()
        for hid, h in heroes.items():
            tips = {}
            for lvl, a in slots(h):
                src_from = None
                if not hangul.search(a.get("name") or ""):
                    alt = ko_by_slot.get((other, hid, f"{a.get('nameId')}|{a.get('buttonId')}"))
                    if alt:
                        a, src_from = dict(alt, abilityType=a.get("abilityType")), other
                name = (a.get("name") or "").strip()
                if not name or name in tips:
                    continue
                e = {"icon": a.get("icon"), "tip": tip_html(a.get("fullTooltip"))}
                if src_from:
                    e["from"] = src_from
                if lvl:
                    e["level"] = lvl
                k = TIP_KEY.get(a.get("abilityType"))
                if k:
                    e["key"] = k
                for f, src_k in (("cd", "cooldownTooltip"), ("cost", "energyTooltip")):
                    if a.get(src_k):
                        e[f] = tip_html(a[src_k]).replace('<b class="tv">', "").replace("</b>", "")
                tips[name] = e
            f = out_dir / f"{hid}.json"
            body = json.dumps({"hero": hid, "name": h.get("name"), "build": None, "tips": tips}, ensure_ascii=False, separators=(",", ":"))
            if not f.exists() or f.read_text(encoding="utf-8") != body:
                f.write_text(body, encoding="utf-8")
            keep.add(f.name)
        for f in out_dir.glob("*.json"):
            if f.name not in keep:
                f.unlink()


def write_notice(rows):
    """사이트 하단 알림(shared/notice.js)이 읽는 작은 파일 → site/data/notice.json.
    채널(본 서버·테스트 서버)마다 **가장 최근 노트**가 공식 한글판 없이 자체 번역이면 그 하나를 올린다.
    더 새 노트나 블리자드 한국어판이 나오면 저절로 빠진다. 날짜를 보지 않으니 돌릴 때마다 안 바뀐다."""
    items = []
    for ch in ("live", "ptr"):
        notes = [r for r in rows if r.get("official")
                 and (("ptr" if (r.get("isPtr") or r["kind"] == "ptr") else "live") == ch)]
        if not notes or not notes[0].get("translated"):   # rows 는 최신순
            continue
        r = notes[0]
        items.append({"key": f"{ch}|{r.get('newsId') or r['date']}", "channel": ch, "date": r["date"],
                      "title": r["title"], "href": "patchnotes/?v=" + r["date"] + (f"&b={r['build']}" if r.get("build") else ""),
                      "auto": bool(r["translated"].get("auto"))})
    f = PN.parent / "notice.json"
    f.write_text(json.dumps({"unofficial": items}, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    builds = json.loads((PN / "builds.json").read_text(encoding="utf-8"))
    diffs = {}  # (toBuild, isPtr) → 파일
    for f in (PN / "diff").glob("*.json"):
        a, b = f.stem.split("-")
        diffs[(int(b.replace("_ptr", "")), b.endswith("_ptr"))] = f
    officials = []
    for f in sorted((PN / "official").glob("*.json")):
        officials.append({"file": f, "doc": json.loads(f.read_text(encoding="utf-8")), "dir": "official"})
    have_ko = {str(o["doc"].get("newsId")) for o in officials if o["doc"].get("newsId")}
    for f in sorted((PN / "translated").glob("*.json")):  # 한글 공식판이 없어 자체 번역한 노트
        doc = json.loads(f.read_text(encoding="utf-8"))
        if doc.get("newsId") and str(doc["newsId"]) in have_ko:
            continue  # 블리자드 한국어판이 나왔다(같은 글은 언어가 달라도 newsId 가 같다) — 공식판이 이긴다
        officials.append({"file": f, "doc": doc, "dir": "translated"})
    officials.sort(key=lambda o: (o["doc"]["date"], o["file"].name))  # 날짜 오름차순 — 앞 노트가 앞 빌드를 먼저 가져간다

    def has_changes(doc):
        """게임 변경이 담긴 노트인가 (영웅·전장 항목이 하나라도 있으면)"""
        return bool(doc.get("heroes") or doc.get("battlegrounds")
                    or any(sec.get("heroes") or sec.get("items") for sec in doc.get("sections", [])))

    # 내용이 있는 노트가 먼저 빌드를 고르게 한다 (운영 공지가 패치 빌드를 선점하지 않도록)
    officials.sort(key=lambda o: (0 if has_changes(o["doc"]) else 1, o["doc"]["date"], o["file"].name))
    used = set()
    rows = []
    for o in officials:
        doc = o["doc"]
        od = d(doc["date"])
        want_ptr = doc["kind"] == "ptr"
        back, fwd = (BACK_PTR, FWD_PTR) if want_ptr else (BACK, FWD)
        best = None
        for b in builds:
            if b["isPtr"] != want_ptr or (b["build"], b["isPtr"]) in used:
                continue
            gap = (d(b["date"]) - od).days
            if -back <= gap <= fwd and (best is None or abs(gap) < best[0]):
                best = (abs(gap), b)
        row = {"date": doc["date"], "kind": doc["kind"], "title": doc["title"], "newsId": doc.get("newsId"),
               "source": doc.get("source"),
               "official": f"{o['dir']}/{o['file'].name}", "build": None, "version": None, "diff": None,
               "heroes": doc["heroes"], "battlegrounds": doc["battlegrounds"], "summary": None}
        if o["dir"] == "translated":
            t = doc.get("translated", {})
            row["translated"] = {k: t.get(k) for k in ("by", "at")}
            if t.get("auto"):
                row["translated"]["auto"] = t["auto"]   # 자동 초벌 문장 수(있을 때만) — 화면이 '자동 초벌(비공식)'로
            row["en"] = f"en/{o['file'].name}"
        if best:
            b = best[1]
            used.add((b["build"], b["isPtr"]))
            row.update({"build": b["build"], "version": b["version"], "buildDate": b["date"]})
            if b.get("dateEstimated"):
                row["buildDateEstimated"] = True
            df = diffs.get((b["build"], b["isPtr"]))
            if df:
                dd = json.loads(df.read_text(encoding="utf-8"))
                row["diff"] = f"diff/{df.name}"
                row["summary"] = dd["summary"]
                row["heroes"] = sorted(set(row["heroes"]) | set(dd["heroes"].keys()))
        rows.append(row)

    # 공식 노트와 짝이 없는 빌드(diff 있는 것만) → 데이터만 있는 항목
    for b in builds:
        if (b["build"], b["isPtr"]) in used:
            continue
        df = diffs.get((b["build"], b["isPtr"]))
        if not df:
            continue
        dd = json.loads(df.read_text(encoding="utf-8"))
        if dd["summary"]["changes"] == 0:
            continue
        rows.append({"date": b["date"], "kind": "data", "title": f"데이터 변경 {b['version']}{' (PTR)' if b['isPtr'] else ''}", "newsId": None, "isPtr": b["isPtr"],
                     "official": None, "build": b["build"], "version": b["version"], "buildDate": b["date"],
                     "diff": f"diff/{df.name}", "heroes": sorted(dd["heroes"].keys()), "battlegrounds": [], "summary": dd["summary"]})

    # 영웅 이름표(id → {name, portrait}) + 전장 이름표 — 프론트 필터용
    heroes = {}
    hj = site_file("data", "97650", "heroes.json")
    if hj.exists():
        for h in json.loads(hj.read_text(encoding="utf-8"))["heroes"]:
            heroes[h["id"]] = {"name": h["name"], "role": h.get("role")}
    # 도감 자료(97650)는 2026-07 빌드에 멈춰 있어 그 뒤 영웅은 역할군이 없다.
    # 게임 XML 에서 뽑아 둔 것(extract_hero_roles.py)으로 빈 자리만 채운다 — 도감 쪽이 우선.
    rj = site_file("data", "patchnotes", "roles.json")
    extra_roles = json.loads(rj.read_text(encoding="utf-8-sig")) if rj.exists() else {}
    # 최신 본 서버 빌드 + 최신 빌드(테스트 서버일 수 있다). 새 영웅은 테스트 서버에 먼저 온다.
    latest_live = [b for b in builds if not b["isPtr"]][-1]
    newest = builds[-1]
    live_ids = set()
    for b in ([latest_live] if newest["build"] == latest_live["build"] else [latest_live, newest]):
        hd = json.loads((ROOT / b["herodata"]).read_text(encoding="utf-8-sig"))
        names = {}
        try:
            gs = json.loads((ROOT / b["kokr"]).read_text(encoding="utf-8-sig"))
            names = (gs.get("items") or gs).get("hero", {}).get("name", {}) or {}
        except Exception:
            pass
        for hid, h in (hd.get("items") or hd).items():
            if not isinstance(h, dict):
                continue
            if not b["isPtr"]:
                live_ids.add(hid)
            e = heroes.setdefault(hid, {"name": names.get(hid) or hid})
            if e.get("name") in (None, "", hid) and names.get(hid):
                e["name"] = names[hid]
            e["portrait"] = (h.get("portraits") or {}).get("heroSelect") or e.get("portrait")
            if b["isPtr"] and hid not in live_ids:
                e["upcoming"] = True   # 테스트 서버에만 있는 새 영웅
    for f in (PN / "diff").glob("*.json"):
        for hid, h in json.loads(f.read_text(encoding="utf-8"))["heroes"].items():
            heroes.setdefault(hid, {"name": h["name"]})
    # 역할군이 비어 있으면 게임 XML 에서 뽑아 둔 값으로 채운다(도감 자료에 없는 새 영웅)
    for hid, e in heroes.items():
        if not e.get("role") and extra_roles.get(hid):
            e["role"] = extra_roles[hid]
    # 시계열 파일이 없는 영웅(새 영웅·소환수)은 표시해 둔다. 화면이 없는 파일을 부르지 않게(404 아끼기).
    for hid, e in heroes.items():
        if (PN / "series" / f"{hid}.json").exists():
            e.pop("noSeries", None)
        else:
            e["noSeries"] = True
    (PN / "heroes.json").write_text(json.dumps(heroes, ensure_ascii=False, indent=1), encoding="utf-8")
    bgs = {}
    mj = site_file("replay", "js", "data_maps.js")
    if mj.exists():
        import re
        for m in re.finditer(r'"slug": "([^"]+)", "ko": "([^"]+)"', mj.read_text(encoding="utf-8")):
            bgs[m.group(1)] = m.group(2)
    bgs["brawl"] = "난투"
    (PN / "battlegrounds.json").write_text(json.dumps(bgs, ensure_ascii=False, indent=1), encoding="utf-8")

    rows.sort(key=lambda r: (r["date"], r["build"] or 0), reverse=True)

    # 영웅별·전장별 이력: heroes/<id>.json, battlegrounds/<slug>.json (패치 최신순, 공식 블록 + 데이터 변경)
    hist_h, hist_b = {}, {}
    off_cache = {}
    for r in rows:
        key = {"date": r["date"], "kind": r["kind"], "title": r["title"], "build": r["build"], "version": r["version"], "newsId": r["newsId"],
               "isPtr": bool(r.get("isPtr")) or r["kind"] == "ptr", "translated": r.get("translated")}
        if r["official"]:
            doc = off_cache.get(r["official"]) or json.loads((PN / r["official"]).read_text(encoding="utf-8"))
            off_cache[r["official"]] = doc
            for sec in doc["sections"]:
                for h in sec.get("heroes", []):
                    for hid in h.get("heroIds") or ([h["heroId"]] if h.get("heroId") else []):
                        hist_h.setdefault(hid, {}).setdefault(r["date"] + "|" + str(r["build"]), {**key, "official": [], "data": None})["official"].append({"section": sec["name"], "html": h["html"], "changes": h["changes"]})
                for it in sec.get("items", []):
                    ids = it.get("heroIds") or ([it["heroId"]] if it.get("heroId") else [])
                    for hid in ids:
                        hist_h.setdefault(hid, {}).setdefault(r["date"] + "|" + str(r["build"]), {**key, "official": [], "data": None})["official"].append({"section": sec["name"] + (" · " + it["under"] if it.get("under") else ""), "html": it["html"], "changes": it.get("changes", [])})
                    if it.get("battleground"):
                        hist_b.setdefault(it["battleground"], {}).setdefault(r["date"] + "|" + str(r["build"]), {**key, "official": []})["official"].append({"section": sec["name"] + (" · " + it["under"] if it.get("under") else ""), "html": it["html"]})
        if r["diff"]:
            dd = json.loads((PN / r["diff"]).read_text(encoding="utf-8"))
            for hid, h in dd["heroes"].items():
                e = hist_h.setdefault(hid, {}).setdefault(r["date"] + "|" + str(r["build"]), {**key, "official": [], "data": None})
                e["data"] = {"from": dd["from"], "to": dd["to"], "added": h.get("added", False), "removed": h.get("removed", False), "changes": h["changes"]}
    # 현재(최신 라이브 빌드) 기술·특성 스냅숏 — 변천도의 행이 된다
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent))
    from diff_heroes_data import load_norm as _load_norm
    latest_norm = _load_norm(latest_live)   # fills 적용본
    (PN / "heroes").mkdir(exist_ok=True)
    (PN / "battlegrounds").mkdir(exist_ok=True)
    for hid, m in hist_h.items():
        entries = [m[k] for k in sorted(m, reverse=True)]
        cur = latest_norm.get(hid)
        current = None
        if cur:
            current = {"build": latest_live["version"],
                       "abilities": [{"id": k, "name": v["name"], "type": v["type"], "icon": v["icon"]} for k, v in cur["abilities"].items()],
                       "talents": sorted([{"id": k, "name": v["name"], "level": v["level"], "type": v["type"], "icon": v["icon"], "sort": v.get("sort") or 0} for k, v in cur["talents"].items()], key=lambda t: (t["level"], t["sort"]))}
        (PN / "heroes" / f"{hid}.json").write_text(json.dumps({"id": hid, "current": current, "entries": entries}, ensure_ascii=False), encoding="utf-8")
    for slug, m in hist_b.items():
        entries = [m[k] for k in sorted(m, reverse=True)]
        (PN / "battlegrounds" / f"{slug}.json").write_text(json.dumps({"id": slug, "entries": entries}, ensure_ascii=False), encoding="utf-8")
    print(f"영웅 이력 {len(hist_h)}개, 전장 이력 {len(hist_b)}개")
    (PN / "index.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    write_notice(rows)
    write_tips()
    n_off = sum(1 for r in rows if r["official"] and not r.get("translated"))
    n_tr = sum(1 for r in rows if r.get("translated"))
    n_both = sum(1 for r in rows if r["official"] and r["diff"])
    n_data = sum(1 for r in rows if not r["official"])
    print(f"index.json {len(rows)}건 — 공식 한글 {n_off} · 자체 번역 {n_tr} · 데이터만 {n_data} (diff 짝 {n_both})")
    unmatched_recent = [r["date"] + " " + r["kind"] for r in rows if r["official"] and not r["build"] and r["date"] >= "2019-10-01"]
    print("2019-10 이후 빌드 미매칭 공식 노트:", unmatched_recent)


if __name__ == "__main__":
    main()
