# -*- coding: utf-8 -*-
"""영웅 역할군(전사·투사·치유사…)을 게임 파일에서 뽑는다.

역할군은 **HeroesToolChest 자료(hdp5)에 들어 있지 않다.** 지금까지는 자체 파서로 만든
도감 자료(`site/data/97650/heroes.json`)에서만 가져왔는데, 그건 2026-07 빌드에 멈춰 있어서
그 뒤에 나온 영웅은 역할군이 비어 버린다(티어표 역할군 칸·패치 기록 영웅 거르기에서 '기타'로 빠진다).

게임 XML 의 `<CHero id="…"><ExpandedRole value="RangedAssassin"/>` 가 원본이다.
새 영웅은 자기 heromod 안에, 옛 영웅은 본체 자료 안에 들어 있다.

만드는 것: `site/data/patchnotes/roles.json`  {"Xalatath": "RangedAssassin", …}
쓰는 곳: `build_patch_index.py` 가 도감 자료에 없는 영웅의 역할군을 여기서 채운다(도감 쪽이 우선).

게임 설치본이 필요하므로 **내 PC 에서만** 돈다(서버에는 게임이 없다). 새 영웅이 나왔을 때 한 번 돌리면 된다.

    python extract_hero_roles.py            # 설치본(본 서버)에서
    python extract_hero_roles.py --ptr      # 테스트 서버 설치본에서
    python extract_hero_roles.py --check    # 무엇이 바뀌는지만 본다
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "site" / "data" / "patchnotes" / "roles.json"
INSTALLS = {
    "live": Path(r"C:\Program Files (x86)\Heroes of the Storm"),
    "ptr": Path(r"C:\Program Files (x86)\Heroes of the Storm Public Test"),
}
HDP = Path(os.environ.get("HDP_PATH", r"C:\Users\sinon\.dotnet\tools\dotnet-heroes-data-parser.exe"))
# 영웅 정의가 들어 있는 XML 만 꺼낸다
FILTERS = ["-i", "mods/heroesdata.stormmod/base.stormdata/gamedata/herodata.xml",
           "-i", "mods/heromods/**/*data.xml"]
HERO_RE = re.compile(r'<CHero\s+id="([^"]+)"[^>]*>(.*?)</CHero>', re.S)
ROLE_RE = re.compile(r'<ExpandedRole\s+value="([^"]+)"')


def say(*a):
    print(*a, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ptr", action="store_true", help="테스트 서버 설치본에서")
    ap.add_argument("--check", action="store_true", help="무엇이 바뀌는지만 본다")
    ap.add_argument("--threads", type=int, default=3)
    a = ap.parse_args()

    inst = INSTALLS["ptr" if a.ptr else "live"]
    if not (inst / ".build.info").exists():
        raise SystemExit(f"게임 설치본을 못 찾았습니다: {inst}")
    if not HDP.exists():
        raise SystemExit(f"HeroesDataParser 를 못 찾았습니다: {HDP}")

    roles = {}
    with tempfile.TemporaryDirectory(prefix="hero_roles_") as work:
        cmd = [str(HDP), "casc-extract", "game", "-s", str(inst), "-t", str(a.threads), "-o", work, *FILTERS]
        say("영웅 정의 XML 꺼내는 중 …")
        t0 = time.time()
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=1800)
        if r.returncode != 0:
            say(((r.stdout or "") + (r.stderr or ""))[-1200:])
            raise SystemExit(f"꺼내기 실패 (rc={r.returncode})")
        files = list(Path(work).rglob("*.xml"))
        say(f"  끝 · {time.time() - t0:.0f}초 · 파일 {len(files)}개")
        for f in files:
            try:
                s = f.read_text(encoding="utf-8", errors="replace")
            except Exception:
                continue
            if "CHero" not in s:
                continue
            for m in HERO_RE.finditer(s):
                role = ROLE_RE.search(m.group(2))
                if role:
                    roles[m.group(1)] = role.group(1)

    old = {}
    if OUT.exists():
        old = json.loads(OUT.read_text(encoding="utf-8-sig"))
    added = {k: v for k, v in roles.items() if k not in old}
    changed = {k: (old[k], v) for k, v in roles.items() if k in old and old[k] != v}
    say(f"역할군 {len(roles)}명 · 새로 {len(added)}명 · 바뀜 {len(changed)}명")
    for k, v in sorted(added.items()):
        say(f"   + {k} = {v}")
    for k, (o, n) in sorted(changed.items()):
        say(f"   ~ {k} = {o} → {n}")
    if a.check:
        return 1 if (added or changed) else 0
    if not roles:
        raise SystemExit("역할군을 하나도 못 찾았습니다 — 필터를 확인하세요")

    # 있던 것은 지우지 않는다(옛 설치본에서 돌려도 목록이 줄지 않게)
    merged = dict(old)
    merged.update(roles)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(dict(sorted(merged.items())), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    say(f"적었습니다: {OUT}  ({len(merged)}명)")
    say("이어서: build_patch_index.py → build_status.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
