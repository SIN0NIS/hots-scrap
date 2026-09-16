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
PN = ROOT / "site" / "data" / "patchnotes"
BACK, FWD = 2, 21       # 라이브: 빌드 추출일이 패치 후 며칠 늦는다 (2022-02 은 18일)
BACK_PTR, FWD_PTR = 2, 35  # PTR 빌드는 저장소에 더 늦게 올라온다 (실측 25~29일)


def d(s):
    return date.fromisoformat(s[:10])


def main():
    builds = json.loads((PN / "builds.json").read_text(encoding="utf-8"))
    diffs = {}  # (toBuild, isPtr) → 파일
    for f in (PN / "diff").glob("*.json"):
        a, b = f.stem.split("-")
        diffs[(int(b.replace("_ptr", "")), b.endswith("_ptr"))] = f
    officials = []
    for f in sorted((PN / "official").glob("*.json")):
        officials.append({"file": f, "doc": json.loads(f.read_text(encoding="utf-8")), "dir": "official"})
    for f in sorted((PN / "translated").glob("*.json")):  # 한글 공식판이 없어 자체 번역한 노트
        officials.append({"file": f, "doc": json.loads(f.read_text(encoding="utf-8")), "dir": "translated"})
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
            row["translated"] = {k: doc.get("translated", {}).get(k) for k in ("by", "at")}
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
    hj = ROOT.parent / "hots_scrap" / "site" / "data" / "97650" / "heroes.json"
    if hj.exists():
        for h in json.loads(hj.read_text(encoding="utf-8"))["heroes"]:
            heroes[h["id"]] = {"name": h["name"], "role": h.get("role")}
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
    (PN / "heroes.json").write_text(json.dumps(heroes, ensure_ascii=False, indent=1), encoding="utf-8")
    bgs = {}
    mj = ROOT.parent / "hots_scrap" / "site" / "replay" / "js" / "data_maps.js"
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
    from diff_heroes_data import normalize as _normalize
    latest_norm = _normalize(json.loads((ROOT / latest_live["herodata"]).read_text(encoding="utf-8-sig")), json.loads((ROOT / latest_live["kokr"]).read_text(encoding="utf-8-sig")))
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
    n_off = sum(1 for r in rows if r["official"] and not r.get("translated"))
    n_tr = sum(1 for r in rows if r.get("translated"))
    n_both = sum(1 for r in rows if r["official"] and r["diff"])
    n_data = sum(1 for r in rows if not r["official"])
    print(f"index.json {len(rows)}건 — 공식 한글 {n_off} · 자체 번역 {n_tr} · 데이터만 {n_data} (diff 짝 {n_both})")
    unmatched_recent = [r["date"] + " " + r["kind"] for r in rows if r["official"] and not r["build"] and r["date"] >= "2019-10-01"]
    print("2019-10 이후 빌드 미매칭 공식 노트:", unmatched_recent)


if __name__ == "__main__":
    main()
