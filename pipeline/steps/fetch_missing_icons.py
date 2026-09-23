# -*- coding: utf-8 -*-
"""빠진 아이콘 채우기 · 목록 맞추기.

아이콘은 내 이미지 저장소(SIN0NIS/images → sin0nis.github.io/images)가 맡는다.
**그 저장소가 스스로 채운다** — 여기서 적어 둔 `need`(사이트가 부르는데 거기 없는 것)를 6시간마다 읽어,
그것만 블리자드 서버에서 게임 파일로 꺼내 올린다(SIN0NIS/images 의 tools/pick_icons.py).

여기서 하는 일
  1. `need` 적기 — 사이트가 부르는 아이콘 중 이미지 저장소에 없는 것. 이미지 저장소가 이걸 읽는다.
  2. 급한 임시본 — 이미지 저장소가 채우기 전(최대 몇 시간)에도 그림이 비지 않게, 같은 파일을
     HeroesToolChest/heroes-images(MIT)에서 받아 site/images/ 에 둔다. 화면은 여기를 먼저 본다.
  3. 치우기 — 이미지 저장소에 들어온 것은 여기 임시본을 지우고 `missing` 에서도 뺀다.
     (임시본이 남으면 화면이 계속 그걸 먼저 부르고, `missing` 에 남으면 화면이 아예 안 부른다)

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


def deployed_sha():
    """이미지 저장소의 Pages 가 **마지막으로 성공한 배포**의 커밋. (요청 2~4개)

    git 에 올라간 것과 Pages 가 실제로 내주는 것은 다르다 — 굽기가 실패하면 올라갔는데 404 다.
    여기 임시본을 지우는 판단을 '올라갔다'로 하면, 굽기가 실패한 동안 그림이 통째로 사라진다."""
    try:
        r = S.get(f"https://api.github.com/repos/{CDN_REPO}/deployments?environment=github-pages&per_page=3", timeout=30)
        r.raise_for_status()
        for dep in r.json():
            st = S.get(dep["statuses_url"] + "?per_page=1", timeout=30)
            st.raise_for_status()
            js = st.json()
            if js and js[0].get("state") == "success":
                return dep.get("sha"), True
    except Exception as e:
        print(f"  Pages 배포 상태를 못 읽었습니다 — {e}", file=sys.stderr)
    return None, False


def cdn_files():
    """이미지 저장소가 지금 **서빙하고 있는** 파일 목록. 돌려주는 것: (목록, 서빙 확인됨?)

    확인이 안 되면 올라간 것(main)으로 대신 보되, 그때는 임시본을 지우지 않는다(안전한 쪽)."""
    sha, served = deployed_sha()
    url = f"https://api.github.com/repos/{CDN_REPO}/git/trees/{sha or CDN_BRANCH}?recursive=1"
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
    return have, served


def write_index(gone=None, need=None, cdn=None):
    """화면이 어떤 파일을 여기서 찾아야 하는지 적어 둔다(헛걸음 없이 바로 가게).

    files   — 여기 site/images/ 에 있는 것. 화면은 이것만 로컬에서 부른다.
    missing — 이미지 저장소에도 여기에도 **없는** 것. 화면은 이 목록을 보고 **아예 부르지 않는다**(404 를 안 만든다).
              이미지 저장소에 들어온 이름은 반드시 뺀다 — 안 빼면 들어온 그림이 영영 안 보인다.
    need    — 사이트가 부르는데 이미지 저장소에 없는 것. **이미지 저장소가 이 목록을 읽고 채운다.**

    **항상** 다시 쓴다. 내려받은 게 없을 때 건너뛰면, 아이콘을 지운 뒤에 유령 목록이 남아
    없는 파일을 부르게 된다."""
    have = sorted(f"{d}/{x.name}" for d in FOLDERS for x in (OUT / d).glob("*.png")) if OUT.exists() else []
    prev = {}
    if (OUT / "index.json").exists():
        prev = load(OUT / "index.json") or {}
    gone = sorted(set(prev.get("missing") or [] if gone is None else gone) - set(have) - set(cdn or ()))
    need = sorted(prev.get("need") or [] if need is None else need)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "index.json").write_text(
        json.dumps({"files": have, "missing": gone, "need": need}, ensure_ascii=False, indent=1), encoding="utf-8")
    return have, gone


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="무엇이 빠졌는지만 본다")
    a = ap.parse_args()

    want = sorted(referenced())
    local = {f"{d}/{x.name}" for d in FOLDERS for x in (OUT / d).glob("*.png")} if OUT.exists() else set()
    try:
        have, served = cdn_files()
    except Exception as e:
        print(f"내 이미지 저장소 목록을 못 읽었습니다 — {e}", file=sys.stderr)
        return 2
    print(f"화면이 부르는 아이콘 {len(want)}개 · 이미지 저장소 {len(have)}개"
          + ("(Pages 가 내주는 그 커밋 기준)" if served else "(배포 확인 못 함 — 임시본은 그대로 둔다)")
          + f" · 여기 받아 둔 것 {len(local)}개")

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
    wantk = {f"{d}/{n}" for d, n in want}
    # 치울 임시본: (1) 이미지 저장소가 내주고 있는 것 — 단 배포가 확인됐을 때만, (2) 이제 아무도 안 부르는 것
    stale = sorted(p for p in local if (served and p in have) or p not in wantk)
    need = sorted(k for k in wantk if k not in have)
    print(f"이미지 저장소가 채워 줄 것(need) {len(need)}개 · 그중 급한 임시본을 받아 볼 것 {len(todo)}개"
          + (f" (HeroesToolChest 에도 없다고 이미 확인된 {skipped}개는 건너뜀)" if skipped else ""))
    for d, n in todo:
        print(f"   {d}/{n}")
    if stale:
        print(f"이미지 저장소에 들어와 여기 임시본을 치울 것 {len(stale)}개")
        for p in stale:
            print(f"   {p}")

    if a.check:
        write_index(known_gone, need, have)
        return 1 if todo else 0

    # 이미지 저장소에 들어왔으니 여기 임시본은 지운다 — 남겨 두면 화면이 계속 이걸 먼저 부른다
    for p in stale:
        try:
            (OUT / p).unlink()
        except FileNotFoundError:
            pass

    got, gone, retry = 0, [], []
    for d, n in todo:
        try:
            r = S.get(f"{SRC}/{d}/{n}", timeout=40)
        except Exception:
            retry.append(f"{d}/{n}")
            continue
        if r.status_code == 200 and r.content:
            p = OUT / d / n
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(r.content)
            got += 1
        elif r.status_code == 404:
            gone.append(f"{d}/{n}")          # 진짜 없다 — 화면이 부르지 않게 적어 둔다
        else:
            # 429·5xx 같은 일시 오류를 '영영 없음'으로 적으면 그 아이콘은 다시는 안 받아진다.
            # 아무 데도 적지 않고 남겨 둔다 → 다음에 돌 때 다시 시도한다.
            retry.append(f"{d}/{n}")
    if todo:
        print(f"받음 {got}개 · 어디에도 없음 {len(gone)}개 · 다음에 다시 시도 {len(retry)}개 → {OUT}")
        for p in gone:
            print(f"   (없음) {p}")
        for p in retry:
            print(f"   (일시 오류) {p}")
    files, gone = write_index(known_gone | set(gone), need, have)
    print(f"임시본 {len(files)}개 · 아직 어디에도 없는 것 {len(gone)}개 · need {len(need)}개 → {OUT / 'index.json'}")
    return 3 if retry else 0                 # 3 = 일부를 못 받았다(다시 돌리면 된다)


if __name__ == "__main__":
    sys.exit(main())
