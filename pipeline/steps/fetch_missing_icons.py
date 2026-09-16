# -*- coding: utf-8 -*-
"""빠진 아이콘 채우기.

새 영웅이 나오면 그 초상·기술 아이콘이 내 이미지 저장소(sin0nis.github.io/images)에 아직 없다.
게임에서 다시 뽑기 전까지는 그림이 빈 채로 보이므로, 같은 파일을 공개된 곳에서 받아
site/images/ 에 둔다. 화면은 내 저장소를 먼저 보고, 없으면 여기를 본다.

받는 곳: HeroesToolChest/heroes-images (MIT). 게임 데이터와 같은 출처라 파일 이름이 그대로 맞는다.

**무엇이 있는지 확인하는 데 요청을 1개만 쓴다.**
예전에는 아이콘 1,100개를 하나씩 HEAD 로 찔러 봤는데(= 내 Pages 에 요청 1,100개),
지금은 GitHub 트리 API 로 저장소 파일 목록을 **한 번에** 받아 대조한다.
내려받기는 진짜 없는 것에만 나간다.

사용:
  python fetch_missing_icons.py            # 빠진 것만 받아 온다
  python fetch_missing_icons.py --check    # 무엇이 빠졌는지만 본다(내려받지 않음)
"""
import argparse
import json
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
OUT = SITE / "images"
FOLDERS = ("heroportraits", "abilitytalents")

# 내 이미지 저장소 — sin0nis.github.io/images 를 서빙하는 곳
CDN_REPO = "SIN0NIS/images"
CDN_BRANCH = "main"
# 받아 올 곳
SRC_REPO = "HeroesToolChest/heroes-images"
SRC = "https://raw.githubusercontent.com/HeroesToolChest/heroes-images/main/heroesimages"

UA = "Mozilla/5.0 hots-scrap/0.1 (fan archive; contact via GitHub SIN0NIS/hots-scrap)"
S = requests.Session()
S.headers["User-Agent"] = UA
def gh_token():
    """GitHub 토큰. CI 는 환경변수로, 내 PC 는 gh 로그인에서 가져온다.
    토큰이 있으면 API 한도가 시간당 60 → 5,000 이라 한도에 걸릴 일이 없다."""
    t = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if t:
        return t
    try:
        import subprocess
        r = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, timeout=10, shell=(os.name == "nt"))
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    except Exception:
        pass
    return None


_t = gh_token()
if _t:
    S.headers["Authorization"] = "Bearer " + _t


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8-sig"))


def referenced():
    """화면이 실제로 부르는 아이콘 이름 → {(폴더, 파일)}"""
    want = set()

    def icons(entries):
        for e in entries or []:
            if e.get("icon"):
                want.add(("abilitytalents", e["icon"]))

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
                icons(cur.get(k))
    # 변천도(series)가 그리는 아이콘 — 옛 특성이라 여기에만 있는 것이 있다
    sdir = SITE / "data" / "patchnotes" / "series"
    if sdir.is_dir():
        for f in sdir.glob("*.json"):
            icons((load(f) or {}).get("items"))
    for f in (SITE / "data" / "builds").glob("*.json"):
        if f.name == "index.json":
            continue
        for h in load(f).values():
            p = (h.get("portraits") or {}).get("heroSelect")
            if p:
                want.add(("heroportraits", p))
            for grp in ("abilities", "talents"):
                for lst in (h.get(grp) or {}).values():
                    icons(lst)
    return want


def cdn_files():
    """내 이미지 저장소에 있는 파일 목록 — 요청 **1개**로 전부 받는다."""
    url = f"https://api.github.com/repos/{CDN_REPO}/git/trees/{CDN_BRANCH}?recursive=1"
    r = S.get(url, timeout=60)
    r.raise_for_status()
    d = r.json()
    if d.get("truncated"):
        raise RuntimeError("저장소가 너무 커서 목록이 잘렸습니다. 폴더별로 나눠 받아야 합니다.")
    have = set()
    for n in d.get("tree", []):
        if n.get("type") != "blob":
            continue
        p = n["path"]
        d0 = p.split("/", 1)[0]
        if d0 in FOLDERS:
            have.add(p)
    return have


def write_index(gone=None):
    """화면이 어떤 파일을 여기서 찾아야 하는지 적어 둔다(헛걸음 없이 바로 가게).

    files   — 여기 site/images/ 에 있는 것. 화면은 이것만 로컬에서 부른다.
    missing — 내 저장소에도, 받아 오는 곳에도 **없는** 것. 게임에서 삭제된 옛 특성 아이콘들이라
              어디에도 남아 있지 않다. 화면은 이 목록을 보고 **아예 부르지 않는다**(404 를 안 만든다).

    **항상** 다시 쓴다. 내려받은 게 없을 때 건너뛰면, 아이콘을 지운 뒤에 유령 목록이 남아
    없는 파일을 부르게 된다."""
    have = sorted(f"{d}/{x.name}" for d in FOLDERS for x in (OUT / d).glob("*.png")) if OUT.exists() else []
    prev = []
    if (OUT / "index.json").exists():
        prev = (load(OUT / "index.json") or {}).get("missing") or []
    gone = sorted(set(prev if gone is None else gone) - set(have))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.json").write_text(
        json.dumps({"files": have, "missing": gone}, ensure_ascii=False, indent=1), encoding="utf-8")
    return have, gone


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="무엇이 빠졌는지만 본다")
    a = ap.parse_args()

    want = sorted(referenced())
    local = {f"{d}/{x.name}" for d in FOLDERS for x in (OUT / d).glob("*.png")} if OUT.exists() else set()
    try:
        have = cdn_files()
    except Exception as e:
        print(f"내 이미지 저장소 목록을 못 읽었습니다 — {e}", file=sys.stderr)
        return 2
    print(f"화면이 부르는 아이콘 {len(want)}개 · 내 저장소 {len(have)}개 · 여기 받아 둔 것 {len(local)}개 (요청 1개로 확인)")

    # 이미 "어디에도 없다" 고 확인된 것은 다시 받으러 가지 않는다.
    # (안 그러면 실행할 때마다 원본 저장소에 404 를 21개씩 만든다)
    known_gone = set((load(OUT / "index.json") or {}).get("missing") or []) if (OUT / "index.json").exists() else set()
    todo, skipped = [], 0
    for d, n in want:
        key = f"{d}/{n}"
        if key in have or key in local:
            continue
        if key in known_gone:
            skipped += 1
            continue
        todo.append((d, n))
    stale = sorted(p for p in local if p in have)   # 내 저장소에 올라갔으니 여기 것은 필요 없다
    print(f"내 저장소에 없어 채워야 할 것 {len(todo)}개"
          + (f" (어디에도 없다고 이미 확인된 {skipped}개는 건너뜀)" if skipped else ""))
    for d, n in todo:
        print(f"   {d}/{n}")
    if stale:
        print(f"내 저장소에 이미 올라가 여기서 지워도 되는 것 {len(stale)}개")
        for p in stale:
            print(f"   {p}")

    if a.check:
        write_index(known_gone)
        return 1 if todo else 0

    got, gone = 0, []
    for d, n in todo:
        r = S.get(f"{SRC}/{d}/{n}", timeout=40)
        if r.status_code != 200 or not r.content:
            gone.append(f"{d}/{n}")          # 어디에도 없다 — 화면이 부르지 않게 적어 둔다
            continue
        p = OUT / d / n
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(r.content)
        got += 1
    if todo:
        print(f"받음 {got}개 · 어디에도 없음 {len(gone)}개 → {OUT}")
        for p in gone:
            print(f"   (없음) {p}")
    files, gone = write_index(known_gone | set(gone))
    print(f"목록 {len(files)}개 · 없는 것 {len(gone)}개 → {OUT / 'index.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
