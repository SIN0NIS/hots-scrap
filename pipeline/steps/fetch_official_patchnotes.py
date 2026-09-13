# -*- coding: utf-8 -*-
"""Step A. 블리자드 코리아 공식 히오스 패치 노트 수집.

목록: news.blizzard.com 의 내부 API (RSS 는 404, 목록 페이지는 JS 렌더링)
  1페이지  GET /ko-kr/api/news/heroes-of-the-storm        → feed.contentItems / feed.pagination
  이후     GET /ko-kr/api/feed/heroes-of-the-storm?offset=N → contentItems / pagination
본문: newsUrl 의 HTML 을 raw/official/{newsId}.html 로 저장 (재파싱용 캐시, 이미 있으면 skip)

사용:
  python fetch_official_patchnotes.py                # 목록 갱신 + 전부 내려받기(캐시 없는 것만)
  python fetch_official_patchnotes.py --list-only    # 목록만
  python fetch_official_patchnotes.py --id 24291432  # 특정 글 1개만
  python fetch_official_patchnotes.py --limit 3      # 최신 N개만
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "raw" / "official"
LIST = RAW / "list.json"
BASE = "https://news.blizzard.com"
PRODUCT = "heroes-of-the-storm"
LOCALE = "ko-kr"  # --en 이면 en-us / raw/official_en
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) hots-scrap-patchnotes/0.1 (fan archive; contact via GitHub SIN0NIS/hots-scrap)"
SLEEP = 1.2  # 요청 간격(초)
TITLE_RE = re.compile(r"패치\s*노트|(?:공개\s*테스트\s*서버|오픈\s*베타|공개\s*베타|긴급\s*수정|밸런스|출시|라이브)\s*노트|밸런스\s*(?:업데이트|변경)")
TITLE_EN_RE = re.compile(r"(?:Patch|PTR|Hotfix|Launch|Open\s*Beta|Live)\s+Notes\b|Balance\s+(?:Notes|Update|Changes)\b|\bHotfix(?:es)?\b|^Heroes of the Storm Update\s*[-–—]\s*[A-Z][a-z]+\s+\d{1,2},\s*\d{4}$", re.I)


def get(url, **kw):
    lang = "en-US,en;q=0.9" if LOCALE == "en-us" else "ko-KR,ko;q=0.9"
    r = requests.get(url, headers={"User-Agent": UA, "Accept-Language": lang}, timeout=30, **kw)
    r.raise_for_status()
    return r


def fetch_list():
    """패치 노트 글 목록 전체. [{newsId, url, title, published, category}] 최신순."""
    items, seen = [], set()

    def take(content_items):
        for it in content_items:
            p = it.get("properties", {})
            nid = str(p.get("newsId") or "")
            title = p.get("title") or ""
            if not nid or nid in seen:
                continue
            seen.add(nid)
            items.append({
                "newsId": nid,
                "url": p.get("newsUrl") or f"{BASE}/{LOCALE}/article/{nid}/{p.get('newsSlug','')}",
                "title": title,
                "published": p.get("lastUpdated"),
                "category": p.get("category"),
                "isPatchNote": bool((TITLE_EN_RE if LOCALE == "en-us" else TITLE_RE).search(title)),
            })

    d = get(f"{BASE}/{LOCALE}/api/news/{PRODUCT}?").json()
    feed = d.get("feed", {})
    take(feed.get("contentItems", []))
    pg = feed.get("pagination", {})
    while pg.get("hasNextPage"):
        offset = pg.get("offset", 0) + pg.get("limit", 0)
        time.sleep(SLEEP)
        d = get(f"{BASE}/{LOCALE}/api/feed/{PRODUCT}?offset={offset}").json()
        take(d.get("contentItems", []))
        pg = d.get("pagination", {})
        print(f"  목록 offset={offset} 누적={len(items)}", file=sys.stderr)
    return items


def fetch_article(item):
    out = RAW / f"{item['newsId']}.html"
    if out.exists() and out.stat().st_size > 1000:
        return False
    html = get(item["url"]).text
    out.write_text(html, encoding="utf-8")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list-only", action="store_true")
    ap.add_argument("--id", help="특정 newsId 하나만")
    ap.add_argument("--limit", type=int, default=0, help="최신 N개만")
    ap.add_argument("--all", action="store_true", help="패치 노트가 아닌 글도 내려받기")
    ap.add_argument("--en", action="store_true", help="영어(en-us) 목록·본문 → raw/official_en")
    ap.add_argument("--missing", action="store_true", help="--en 과 함께: missing.json(한글판 없는 글)만 내려받기")
    a = ap.parse_args()
    global LOCALE, RAW, LIST
    if a.en:
        LOCALE = "en-us"
        RAW = ROOT / "raw" / "official_en"
        LIST = RAW / "list.json"
    RAW.mkdir(parents=True, exist_ok=True)

    if LIST.exists() and a.id:
        items = json.loads(LIST.read_text(encoding="utf-8"))
    else:
        items = fetch_list()
        LIST.write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
        n_pn = sum(1 for i in items if i["isPatchNote"])
        print(f"목록 {len(items)}건 (패치 노트 {n_pn}건) → {LIST}")
    if a.list_only:
        return

    if a.missing:
        items = json.loads((RAW / "missing.json").read_text(encoding="utf-8"))
    targets = [i for i in items if a.all or i["isPatchNote"]]
    if a.id:
        targets = [i for i in items if i["newsId"] == a.id]
        if not targets:  # 목록에 없으면 URL 만 만들어 시도
            targets = [{"newsId": a.id, "url": f"{BASE}/{LOCALE}/article/{a.id}/x", "title": "?"}]
    if a.limit:
        targets = targets[: a.limit]

    got = 0
    for i, it in enumerate(targets, 1):
        try:
            if fetch_article(it):
                got += 1
                print(f"[{i}/{len(targets)}] 받음 {it['newsId']} {it['title']}")
                time.sleep(SLEEP)
            else:
                print(f"[{i}/{len(targets)}] 캐시 {it['newsId']} {it['title']}")
        except Exception as e:
            print(f"[{i}/{len(targets)}] 실패 {it['newsId']} {it['title']}: {e}", file=sys.stderr)
    print(f"완료: 새로 받음 {got}, 대상 {len(targets)}")


if __name__ == "__main__":
    main()
