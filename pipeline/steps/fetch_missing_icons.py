# -*- coding: utf-8 -*-
"""빠진 아이콘 채우기.

새 영웅이 나오면 그 초상·기술 아이콘이 내 이미지 저장소(sin0nis.github.io/images)에 아직 없다.
게임에서 다시 뽑기 전까지는 그림이 빈 채로 보이므로, 같은 파일을 공개된 곳에서 받아
site/images/ 에 둔다. 화면은 내 저장소를 먼저 보고, 없으면 여기를 본다.

받는 곳: HeroesToolChest/heroes-images (MIT). 게임 데이터와 같은 출처라 파일 이름이 그대로 맞는다.

사용:
  python fetch_missing_icons.py            # 빠진 것만 받아 온다
  python fetch_missing_icons.py --check    # 무엇이 빠졌는지만 본다(내려받지 않음)
"""
import argparse
import json
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
OUT = SITE / "images"
CDN = "https://sin0nis.github.io/images"
SRC = "https://raw.githubusercontent.com/HeroesToolChest/heroes-images/main/heroesimages"
UA = "Mozilla/5.0 hots-scrap/0.1 (fan archive; contact via GitHub SIN0NIS/hots-scrap)"
S = requests.Session()
S.headers["User-Agent"] = UA


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8-sig"))


def referenced():
    """화면이 실제로 부르는 아이콘 이름 → {(폴더, 파일)}"""
    want = set()
    hj = SITE / "data" / "patchnotes" / "heroes.json"
    if hj.exists():
        for v in load(hj).values():
            if v.get("portrait"):
                want.add(("heroportraits", v["portrait"]))
    hdir = SITE / "data" / "patchnotes" / "heroes"
    if hdir.is_dir():
        for f in hdir.glob("*.json"):
            cur = (load(f) or {}).get("current") or {}
            for k in ("abilities", "talents"):
                for e in cur.get(k) or []:
                    if e.get("icon"):
                        want.add(("abilitytalents", e["icon"]))
    for f in (SITE / "data" / "builds").glob("*.ko.json"):
        for h in load(f).values():
            p = (h.get("portraits") or {}).get("heroSelect")
            if p:
                want.add(("heroportraits", p))
            for grp in ("abilities", "talents"):
                for lst in (h.get(grp) or {}).values():
                    for e in lst:
                        if e.get("icon"):
                            want.add(("abilitytalents", e["icon"]))
    return want


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()

    want = sorted(referenced())
    local = {(d, n) for d in ("heroportraits", "abilitytalents") for n in
             (x.name for x in (OUT / d).glob("*.png"))} if OUT.exists() else set()
    todo = []
    print(f"화면이 부르는 아이콘 {len(want)}개 · 여기 이미 받아 둔 것 {len(local)}개")
    for d, n in want:
        if (d, n) in local:
            continue
        r = S.head(f"{CDN}/{d}/{n}", timeout=20, allow_redirects=True)
        if r.status_code != 200:
            todo.append((d, n))
    print(f"내 이미지 저장소에 없는 것 {len(todo)}개")
    for d, n in todo:
        print(f"   {d}/{n}")
    if a.check or not todo:
        return 1 if todo else 0

    got = miss = 0
    for d, n in todo:
        r = S.get(f"{SRC}/{d}/{n}", timeout=40)
        if r.status_code != 200 or not r.content:
            print(f"  못 받음({r.status_code}): {d}/{n}", file=sys.stderr)
            miss += 1
            continue
        p = OUT / d / n
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(r.content)
        got += 1
    print(f"받음 {got}개 · 실패 {miss}개 → {OUT}")
    # 화면이 어떤 파일을 여기서 찾아야 하는지 적어 둔다(헛걸음 없이 바로 가게)
    have = sorted(f"{d}/{x.name}" for d in ("heroportraits", "abilitytalents")
                  for x in (OUT / d).glob("*.png")) if OUT.exists() else []
    (OUT / "index.json").write_text(json.dumps({"files": have}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"목록 {len(have)}개 → {OUT / 'index.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
