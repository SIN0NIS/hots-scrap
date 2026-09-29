# -*- coding: utf-8 -*-
"""내 PC 설치본에서 게임 빌드 자료를 직접 뽑는다 — 원본(HeroesToolChest)이 늦을 때.

보통은 HeroesToolChest/heroes-data2 가 새 빌드를 올려 주기를 기다린다(서버가 6시간마다 확인).
하지만 본 서버 패치 당일은 원본이 하루 이틀 늦는다. 그동안 사이트가 옛 빌드를 보여 주지 않도록,
**배틀넷이 받아 둔 게임 파일에서 같은 자료를 직접 만들어** 파이프라인에 끼워 넣는다.

원본과 같은 결과가 나오는지 확인했다(2026-09-29, 테스트 서버 2.57.0.98217 로 대조):
  · 영웅 자료 90명 **전부 값까지 일치** (설치본에 아직 없던 잘아타스만 빠졌고, 본 서버에는 있다)
  · 글(gamestrings) 겹치는 항목 **값 차이 0 · 누락 0 · 군더더기 0**
그래서 아래 설정을 반드시 원본과 똑같이 맞춰야 한다. 하나라도 빠지면 글 3,400여 개가 달라진다.
  -e all                          원본은 모든 종류를 뽑는다(영웅만 뽑으면 글 1,153개가 빈다)
  --localized-text Extract        자료와 글을 나눠 쓴다(원본 형식)
  --gs-replace-constant-vars --gs-preserve-constant-vars
  --gs-replace-style-vars   --gs-preserve-style-vars
                                  색·상수 변수를 값으로 바꾸되 원래 이름을 hlt-name 으로 남긴다
설정이 맞는지는 만들어진 gamestrings 파일의 meta 를 원본과 견줘 보면 바로 안다.

만드는 것
  vendor/heroes-data2/heroesdata/<버전>/   .hdp.json(json:"full") + data/ + gamestrings/   ← 빌드메이커 자료가 읽는 곳
  vendor/full/<버전>/herodata.json·gamestrings_kokr.json                                   ← 변경점(diff)이 읽는 곳
  site/data/patchnotes/builds.json 에 그 빌드 한 줄

vendor/ 는 git 에 올라가지 않는다. 서버(GitHub Actions)에는 게임 설치본이 없으므로 여기서만 돈다.
나중에 원본이 같은 빌드를 올리면 그때부터는 원본 것을 쓰게 된다(버전이 같으면 새 빌드로 치지 않는다).

사용
  python extract_local_build.py                 # 설치본(본 서버) 버전을 뽑아 넣는다
  python extract_local_build.py --ptr           # 테스트 서버 설치본
  python extract_local_build.py --date 2026-09-28   # 빌드 날짜를 지정(기본: 오늘)
  python extract_local_build.py --check         # 무엇을 할지만 본다
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HD2 = ROOT / "vendor" / "heroes-data2" / "heroesdata"
FULL = ROOT / "vendor" / "full"
BUILDS = ROOT / "site" / "data" / "patchnotes" / "builds.json"
KST = timezone(timedelta(hours=9))
INSTALLS = {
    "live": Path(r"C:\Program Files (x86)\Heroes of the Storm"),
    "ptr": Path(r"C:\Program Files (x86)\Heroes of the Storm Public Test"),
}
HDP = Path(os.environ.get("HDP_PATH", r"C:\Users\sinon\.dotnet\tools\dotnet-heroes-data-parser.exe"))
# 원본(HeroesToolChest)과 같은 결과를 내는 설정. 바꾸지 마라 — 위 머리말 참고.
FLAGS = ["-e", "all", "--localized-text", "Extract",
         "--gs-replace-constant-vars", "--gs-preserve-constant-vars",
         "--gs-replace-style-vars", "--gs-preserve-style-vars"]
LOCALES = ["koKR", "enUS"]


def say(*a):
    print(*a, flush=True)


def installed_version(inst):
    """설치본이 지금 받아 둔 빌드 — .build.info 의 Version"""
    p = inst / ".build.info"
    if not p.exists():
        raise SystemExit(f"게임 설치본을 못 찾았습니다: {inst}")
    lines = [x for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
    head = [c.split("!")[0] for c in lines[0].split("|")]
    for row in lines[1:]:
        d = dict(zip(head, row.split("|")))
        if d.get("Version"):
            return d["Version"]
    raise SystemExit(f"설치본 버전을 못 읽었습니다: {p}")


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8-sig"))


def gs_index(files):
    """글 파일 색인. 맵 전용 글(gamestrings_mapdata_98285_kokr.json)이 같이 나오므로
    원본처럼 'mapdata|kokr' 로 따로 적는다. 한 칸에 몰아넣으면 본 글이 가려져
    이름·설명이 통째로 비어 버린다(2026-09-29 에 실제로 겪음)."""
    out = {}
    for f in files:
        m = re.match(r"^gamestrings_(?:([a-z]+)_)?\d+_([a-z]{4})$", f.stem)
        if not m:
            continue
        out[(m.group(1) + "|" if m.group(1) else "") + m.group(2)] = f.name
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ptr", action="store_true", help="테스트 서버 설치본에서")
    ap.add_argument("--date", help="빌드 날짜 YYYY-MM-DD (기본: 오늘)")
    ap.add_argument("--check", action="store_true", help="무엇을 할지만 본다")
    ap.add_argument("--force", action="store_true", help="이미 있어도 다시 만든다")
    ap.add_argument("--threads", type=int, default=4)
    a = ap.parse_args()

    ch = "ptr" if a.ptr else "live"
    inst = INSTALLS[ch]
    ver = installed_version(inst)
    folder = ver + ("_ptr" if a.ptr else "")
    build = int(ver.split(".")[-1])
    vdir = HD2 / folder
    say(f"설치본({ch}) {inst}\n  버전 {ver} → 폴더 {folder}")

    rows = load(BUILDS) if BUILDS.exists() else []
    known = {(b["build"], bool(b.get("isPtr"))) for b in rows}
    if vdir.exists() and not a.force:
        say(f"이미 있습니다: {vdir}  (--force 로 다시 만듭니다)")
        return 0
    if (build, a.ptr) in known and not a.force:
        say(f"빌드 목록에 이미 있습니다: {ver}  (--force 로 다시 만듭니다)")
        return 0
    if a.check:
        say("할 일: 설치본에서 뽑아 vendor/ 에 넣고 builds.json 에 한 줄 더합니다.")
        return 1
    if not HDP.exists() and not shutil.which(str(HDP)):
        raise SystemExit(f"HeroesDataParser 를 못 찾았습니다: {HDP}")

    with tempfile.TemporaryDirectory(prefix="hdp_local_") as work:
        cmd = [str(HDP), "game", "-s", str(inst), *FLAGS, "-t", str(a.threads), "-o", work]
        for l in LOCALES:
            cmd += ["-l", l]
        say(f"  뽑는 중 … (몇 분 걸립니다)")
        t0 = time.time()
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=3600)
        if r.returncode != 0:
            say((r.stdout or "")[-1500:], (r.stderr or "")[-800:])
            raise SystemExit(f"뽑기 실패 (rc={r.returncode})")
        say(f"  끝 · {time.time() - t0:.0f}초")

        w = Path(work)
        data_files = sorted((w / "data").glob("*.json"))
        gs_files = sorted((w / "gamestrings").glob("*.json"))
        if not data_files or not gs_files:
            raise SystemExit("자료가 안 나왔습니다(설정을 확인하세요)")

        # 1) 빌드메이커 자료가 읽는 곳 — 원본과 같은 폴더 모양, 다만 패치가 아니라 완성본이다
        if vdir.exists():
            shutil.rmtree(vdir)
        (vdir / "data").mkdir(parents=True, exist_ok=True)
        (vdir / "gamestrings").mkdir(parents=True, exist_ok=True)
        for f in data_files:
            shutil.copy2(f, vdir / "data" / f.name)
        for f in gs_files:
            shutil.copy2(f, vdir / "gamestrings" / f.name)
        meta = load(vdir / "data" / f"herodata_{build}.json")["meta"]
        (vdir / ".hdp.json").write_text(json.dumps({
            "hdp": meta.get("hdpVersion"),
            "json": "full",                     # 패치 사슬이 아니라 그 자체로 완성본
            "extracted": True,
            "source": "local-install",          # 원본이 아니라 내 PC 설치본에서 만든 것
            "madeAt": datetime.now(KST).strftime("%Y-%m-%d %H:%M"),
            "files": {
                "[data]": {f.name.split("_")[0]: f.name for f in data_files},
                "[gamestrings]": gs_index(gs_files),
            },
        }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

        # 2) 변경점(diff)이 읽는 곳 — 복원본과 같은 모양
        out = FULL / folder
        out.mkdir(parents=True, exist_ok=True)
        shutil.copy2(vdir / "data" / f"herodata_{build}.json", out / "herodata.json")
        shutil.copy2(vdir / "gamestrings" / f"gamestrings_{build}_kokr.json", out / "gamestrings_kokr.json")

    # 3) 빌드 목록에 한 줄
    date = a.date or datetime.now(KST).strftime("%Y-%m-%d")
    row = {"version": ver, "build": build, "isPtr": a.ptr, "folder": folder,
           "repo": "local-install", "date": date,
           "herodata": f"vendor/full/{folder}/herodata.json",
           "kokr": f"vendor/full/{folder}/gamestrings_kokr.json"}
    rows = [b for b in rows if not (b["build"] == build and bool(b.get("isPtr")) == a.ptr)]
    rows.append(row)
    rows.sort(key=lambda b: (b["build"], bool(b.get("isPtr"))))
    BUILDS.write_text(json.dumps(rows, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    say(f"넣었습니다: {folder} ({date}) · 빌드 목록 {len(rows)}개")
    say("이어서: diff_heroes_data.py" + (" --ptr" if a.ptr else "")
        + " → build_talent_data.py → fetch_missing_icons.py → build_patch_index.py → build_status.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
