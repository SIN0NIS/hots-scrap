# -*- coding: utf-8 -*-
"""Step 0. 참고하는 곳들이 갱신됐는지만 싸게 확인한다(무거운 clone 없이).

보는 곳 네 군데
  1) 블리자드 뉴스 한국어판  — 새 패치 노트가 올라왔나
  2) 블리자드 뉴스 영어판    — 한국어판이 아직 없는 회차까지 포함
  3) HeroesToolChest heroes-data2 — 새 게임 빌드가 올라왔나 (GitHub API, clone 안 함)
  4) Nexus Patch Notes      — 참고 사이트가 우리보다 더 갖고 있나 (구성 참고용, 내용은 안 씀)

사용:
  python check_updates.py              # 사람이 읽는 표
  python check_updates.py --json       # 기계가 읽는 JSON
  python check_updates.py --pages 3    # 뉴스 목록을 몇 페이지까지 볼지(기본 1)
  python check_updates.py --nexus      # 참고 사이트 수록 범위까지

요청 수: 기본 3개(한국어 뉴스 1 + 영어 뉴스 1 + GitHub 목록 1). --nexus 를 주면 4개.

돌려주는 값: 새로 할 일이 있으면 1, 없으면 0. 확인 자체가 실패하면 2.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_official_patchnotes import TITLE_EN_RE, TITLE_RE  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "site" / "data" / "patchnotes" / "index.json"
BUILDS = ROOT / "site" / "data" / "patchnotes" / "builds.json"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) hots-scrap-patchnotes/0.1 "
      "(fan archive; contact via GitHub SIN0NIS/hots-scrap)")
BASE = "https://news.blizzard.com"
PRODUCT = "heroes-of-the-storm"
NEXUS = "https://nexus-patch-notes.github.io/"
# 버전 폴더는 저장소 루트가 아니라 heroesdata/ 아래에 있다(루트를 보면 늘 0개로 나온다)
GH_TREE = "https://api.github.com/repos/HeroesToolChest/heroes-data2/contents/heroesdata"


def get(url, **kw):
    h = {"User-Agent": UA, **kw.pop("headers", {})}
    # GitHub API 는 토큰이 있으면 시간당 한도가 60 → 5,000 으로 늘어난다.
    # CI 에서 넘겨 주는 GITHUB_TOKEN 을 실제로 쓴다(없으면 그냥 비인증으로 간다).
    if "api.github.com" in url and os.environ.get("GITHUB_TOKEN"):
        h["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
    r = requests.get(url, headers=h, timeout=30, **kw)
    r.raise_for_status()
    return r


def news_list(locale, pages):
    """패치 노트 글만 [{newsId, title, date}] 로."""
    lang = "ko-KR,ko;q=0.9" if locale == "ko-kr" else "en-US,en;q=0.9"
    rx = TITLE_RE if locale == "ko-kr" else TITLE_EN_RE
    out, seen, offset = [], set(), 0
    for page in range(pages):
        url = (f"{BASE}/{locale}/api/news/{PRODUCT}" if page == 0
               else f"{BASE}/{locale}/api/feed/{PRODUCT}?offset={offset}")
        j = get(url, headers={"Accept-Language": lang}).json()
        feed = j.get("feed") or j
        items = feed.get("contentItems") or []
        if not items:
            break
        for it in items:
            p = it.get("properties") or {}
            nid = str(p.get("newsId") or "")
            title = (p.get("title") or "").strip()
            if not nid or nid in seen:
                continue
            seen.add(nid)
            if rx.search(title):
                out.append({"newsId": nid, "title": title, "date": (p.get("lastUpdated") or "")[:10]})
        offset += len(items)
    return out


def latest_builds(n=6):
    """heroes-data2 저장소 맨 위 폴더 이름만 본다. clone 하지 않는다."""
    try:
        j = get(GH_TREE, headers={"Accept": "application/vnd.github+json"}).json()
    except Exception as e:
        return None, str(e)
    vers = []
    for it in j:
        if it.get("type") != "dir":
            continue
        m = re.fullmatch(r"(\d+\.\d+\.\d+\.(\d+))(_ptr)?", it["name"])
        if m:
            vers.append({"version": m.group(1), "build": int(m.group(2)), "isPtr": bool(m.group(3))})
    vers.sort(key=lambda v: (v["build"], v["isPtr"]))
    return vers[-n:], None


def nexus_dates():
    """참고 사이트가 다루는 날짜 목록(구성 비교용). 실패해도 그냥 넘어간다."""
    try:
        html = get(NEXUS).text
    except Exception:
        return None
    return sorted(set(re.findall(r"(20[12]\d-[01]\d-[0-3]\d)", html)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", type=int, default=1, help="뉴스 목록을 몇 페이지까지 볼지(1페이지 24건이면 몇 주치)")
    ap.add_argument("--nexus", action="store_true", help="참고 사이트 수록 범위까지 본다(요청 하나 더)")
    ap.add_argument("--json", action="store_true", help="JSON 으로 출력")
    a = ap.parse_args()

    idx = json.loads(INDEX.read_text(encoding="utf-8-sig")) if INDEX.exists() else []
    have_news = {str(r["newsId"]) for r in idx if r.get("newsId")}
    have_dates = {r["date"] for r in idx}
    builds = json.loads(BUILDS.read_text(encoding="utf-8-sig")) if BUILDS.exists() else []
    have_builds = {b["build"] for b in builds}

    try:
        ko = news_list("ko-kr", a.pages)
        en = news_list("en-us", a.pages)
    except Exception as e:
        print(f"확인 실패: 블리자드 뉴스를 못 읽었습니다 — {e}", file=sys.stderr)
        if a.json:
            # 빈 출력을 남기면 CI 가 "새 것 없음" 과 구별하지 못하고 무거운 분기를 헛돌린다.
            # 반드시 모양이 온전한 JSON 을 남긴다.
            print(json.dumps({"ok": False, "error": str(e),
                              "newKo": [], "newEnOnly": [], "newBuilds": []}, ensure_ascii=False))
        return 2

    new_ko = [x for x in ko if x["newsId"] not in have_news]
    new_en = [x for x in en if x["newsId"] not in have_news]
    ko_ids = {x["newsId"] for x in ko}
    # 영어만 있는 것 = 번역 대상 후보
    new_en_only = [x for x in new_en if x["newsId"] not in ko_ids]

    bl, berr = latest_builds()
    new_builds = [b for b in (bl or []) if b["build"] not in have_builds]

    nx = nexus_dates() if a.nexus else None
    nx_missing = sorted(d for d in (nx or []) if d not in have_dates and d >= "2016-09-29")

    todo = bool(new_ko or new_en or new_builds)
    report = {
        "haveNotes": len(idx), "haveBuilds": len(builds),
        "newKo": new_ko, "newEn": new_en, "newEnOnly": new_en_only,
        "newBuilds": new_builds, "buildsError": berr,
        "nexusOnlyDates": nx_missing[:20], "nexusChecked": nx is not None,
        "todo": todo,
    }
    if a.json:
        print(json.dumps(report, ensure_ascii=False, indent=1))
        return 1 if todo else 0

    print(f"지금 가진 것: 패치 {len(idx)}건 · 빌드 {len(builds)}개")
    print()
    print(f"[블리자드 한국어] 새 패치 노트 {len(new_ko)}건")
    for x in new_ko:
        print(f"   + {x['date']}  {x['title'][:58]}")
    print(f"[블리자드 영어] 새 패치 노트 {len(new_en)}건 (그중 한국어판이 아직 없는 것 {len(new_en_only)}건)")
    for x in new_en:
        mark = "번역 필요" if x in new_en_only else "한국어판 있음"
        print(f"   + {x['date']}  [{mark}] {x['title'][:50]}")
    if berr:
        print(f"[게임 데이터] 확인 실패 — {berr}")
    else:
        print(f"[게임 데이터] 새 빌드 {len(new_builds)}개")
        for b in new_builds:
            print(f"   + {b['version']}{' (테스트 서버)' if b['isPtr'] else ''}")
    if nx is None:
        print("[참고 사이트] 건너뜀 (--nexus 로 볼 수 있습니다)")
    else:
        print(f"[참고 사이트] 거기만 있는 날짜 {len(nx_missing)}개" + (f" — {', '.join(nx_missing[:6])} …" if nx_missing else ""))
    print()
    print("할 일이 있습니다. 업데이트를 돌리세요." if todo else "새로 할 일이 없습니다.")
    return 1 if todo else 0


if __name__ == "__main__":
    sys.exit(main())
