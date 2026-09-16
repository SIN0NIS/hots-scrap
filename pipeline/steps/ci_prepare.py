# -*- coding: utf-8 -*-
"""CI 준비. 색인을 다시 만드는 데 꼭 필요한 빌드 자료만 복원한다.

build_patch_index.py 는 vendor/full 에서 **두 빌드**만 읽는다(최신 본 서버 · 가장 최신).
전체 vendor(수백 MB)를 받을 필요가 없으므로, heroes-data2 를 얕게 받아 그 둘만 되살린다.

사용:
  python ci_prepare.py             # 얕은 clone + 필요한 빌드 복원
  python ci_prepare.py --check     # 이미 있는지만 확인(내려받지 않음)
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / "vendor"
HD2 = VENDOR / "heroes-data2"
FULL = VENDOR / "full"
BUILDS = ROOT / "site" / "data" / "patchnotes" / "builds.json"
REPO2 = "https://github.com/HeroesToolChest/heroes-data2.git"


def run(args, cwd=None):
    print("$", " ".join(args), flush=True)
    subprocess.run(args, cwd=cwd, check=True)


def needed():
    rows = sorted(json.loads(BUILDS.read_text(encoding="utf-8-sig")), key=lambda b: b["build"])
    live = [b for b in rows if not b["isPtr"]]
    want = {live[-1]["build"]: live[-1], rows[-1]["build"]: rows[-1]}
    return list(want.values())


def have(b):
    return (ROOT / b["herodata"]).exists() and (ROOT / b["kokr"]).exists()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()

    want = needed()
    missing = [b for b in want if not have(b)]
    for b in want:
        print(f"  {b['version']}{' (테스트 서버)' if b['isPtr'] else ''} … {'있음' if have(b) else '없음'}")
    if a.check:
        return 0 if not missing else 1
    if not missing:
        print("복원할 것이 없습니다.")
        return 0

    if not HD2.exists():
        VENDOR.mkdir(parents=True, exist_ok=True)
        # --filter=blob:none 만 주면 체크아웃 때 결국 전부 받아 온다. --no-checkout 을 같이 줘야
        # 정말 필요한 파일만(패치 사슬을 따라가며) 받는다.
        run(["git", "clone", "--depth", "1", "--filter=blob:none", "--no-checkout", REPO2, str(HD2)])
        run(["git", "checkout"], cwd=HD2)

    import build_talent_data as B   # 패치 사슬 복원기를 그대로 쓴다
    FULL.mkdir(parents=True, exist_ok=True)
    for b in missing:
        ver = b["version"] + ("_ptr" if b["isPtr"] else "")
        hero, ko = B.resolve(ver, "kokr")
        out = FULL / ver
        out.mkdir(parents=True, exist_ok=True)
        (out / "herodata.json").write_text(json.dumps(hero, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        (out / "gamestrings_kokr.json").write_text(json.dumps(ko, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"복원: {ver}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
