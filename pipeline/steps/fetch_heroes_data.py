# -*- coding: utf-8 -*-
"""Step C. HeroesToolChest 버전별 인게임 데이터 수집 (herodata + kokr gamestrings 만).

  vendor/heroes-data   (2.47.2.76003 ~ 2.55.16.97039, full JSON)  — sparse: herodata_* / *_kokr.json / .hdp.json
  vendor/heroes-data2  (2.55.16.97039 ~ 최신, JSON Patch 형식)      — 전체(11MB)
  vendor/full/<version>/herodata.json, gamestrings_kokr.json  ← data2 패치 체인을 적용해 복원한 full JSON
  data/patchnotes/builds.json  ← [{version, build, isPtr, date, herodata, kokr}] 빌드 오름차순

날짜 = 그 버전 폴더가 처음 추가된 커밋 날짜(git log). blob:none 필터라 커밋·트리만 받으므로 가능.

사용:
  python fetch_heroes_data.py            # clone(없으면) + builds.json
  python fetch_heroes_data.py --pull     # 기존 clone 갱신
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import jsonpatch

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / "vendor"
HD1 = VENDOR / "heroes-data"
HD2 = VENDOR / "heroes-data2"
FULL = VENDOR / "full"
OUT = ROOT / "site" / "data" / "patchnotes" / "builds.json"
REPO1 = "https://github.com/HeroesToolChest/heroes-data.git"
REPO2 = "https://github.com/HeroesToolChest/heroes-data2.git"
SPARSE1 = ["heroesdata/*/.hdp.json", "heroesdata/*/data/herodata_*", "heroesdata/*/gamestrings/*_kokr.json", "heroesdata/.version.json"]


def run(args, cwd=None, check=True):
    print("  $", " ".join(args), file=sys.stderr)
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check and r.returncode != 0:
        raise RuntimeError(r.stderr[-2000:])
    return r.stdout


def clone_sparse(repo, dest, patterns):
    if dest.exists():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    run(["git", "clone", "--filter=blob:none", "--no-checkout", repo, str(dest)])
    run(["git", "sparse-checkout", "init", "--no-cone"], cwd=dest)
    run(["git", "sparse-checkout", "set", "--no-cone"] + patterns, cwd=dest)
    run(["git", "checkout"], cwd=dest)


def clone_full(repo, dest):
    if dest.exists():
        return
    run(["git", "clone", "--filter=blob:none", repo, str(dest)])


def first_commit_date(repo_dir, path):
    out = run(["git", "log", "--diff-filter=A", "--format=%cI", "--reverse", "--", path], cwd=repo_dir)
    return out.strip().split("\n")[0][:10] if out.strip() else None


def ver_info(name):
    m = re.match(r"^(\d+\.\d+\.\d+\.(\d+))(_ptr)?$", name)
    if not m:
        return None
    return {"version": m.group(1), "build": int(m.group(2)), "isPtr": bool(m.group(3)), "folder": name}


def load(p):
    txt = Path(p).read_text(encoding="utf-8-sig")
    try:
        return json.loads(txt)
    except json.JSONDecodeError:  # 2.49.1.77692/.hdp.json 은 쉼표 누락
        return json.loads(re.sub(r'"[ \t]*\n(\s*")', '",\n\\1', txt))


def hdp_files(vdir):
    """.hdp.json → (herodata 파일, kokr gamestrings 파일) 상대경로. 옛 hdp(4.x)는 files 없음 → 이름 규칙."""
    hdp = load(vdir / ".hdp.json") if (vdir / ".hdp.json").exists() else {}
    files = hdp.get("files") or {}
    hero = files.get("[data]", {}).get("herodata")
    ko = files.get("[gamestrings]", {}).get("kokr")
    dup = (hdp.get("duplicate") or {})  # 같은 데이터를 다른 버전 폴더가 가짐
    ddir = vdir.parent / dup["data"] if dup.get("data") else vdir
    gdir = vdir.parent / dup["gamestrings"] if dup.get("gamestrings") else (ddir if dup.get("data") and not (vdir / "gamestrings").exists() else vdir)
    if not hero:
        c = list((ddir / "data").glob("herodata_*.json"))
        hero = c[0].name if c else None
    if not ko:
        c = list((gdir / "gamestrings").glob("gamestrings_*_kokr.json"))
        ko = c[0].name if c else None
    return hdp, (ddir / "data" / hero if hero else None), (gdir / "gamestrings" / ko if ko else None)


def resolve_data2(builds):
    """data2 의 patch 버전을 root-version 부터 체인 적용해 vendor/full 에 복원."""
    vroot = HD2 / "heroesdata"
    idx = load(vroot / ".version.json")
    cache = {}  # folder → (herodata dict, kokr dict)

    def full_of(folder):
        if folder in cache:
            return cache[folder]
        vdir = vroot / folder
        hdp, hp, kp = hdp_files(vdir)
        if hdp.get("json") == "patch":
            base_h, base_k = full_of(hdp["depends-on"])
            h = jsonpatch.apply_patch(base_h, load(hp), in_place=False)
            k = jsonpatch.apply_patch(base_k, load(kp), in_place=False)
        else:
            h, k = load(hp), load(kp)
        cache[folder] = (h, k)
        return h, k

    for folder in idx["versions"]:
        info = ver_info(folder)
        if not info:
            continue
        h, k = full_of(folder)
        out = FULL / folder
        out.mkdir(parents=True, exist_ok=True)
        hp, kp = out / "herodata.json", out / "gamestrings_kokr.json"
        if not hp.exists():
            hp.write_text(json.dumps(h, ensure_ascii=False), encoding="utf-8")
        if not kp.exists():
            kp.write_text(json.dumps(k, ensure_ascii=False), encoding="utf-8")
        info.update({"repo": "heroes-data2", "date": first_commit_date(HD2, f"heroesdata/{folder}"),
                     "herodata": str(hp.relative_to(ROOT)).replace("\\", "/"), "kokr": str(kp.relative_to(ROOT)).replace("\\", "/")})
        builds[info["build"], info["isPtr"]] = info
        print(f"  data2 {folder}  date={info['date']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pull", action="store_true")
    a = ap.parse_args()
    VENDOR.mkdir(exist_ok=True)

    print("heroes-data (sparse)…")
    clone_sparse(REPO1, HD1, SPARSE1)
    print("heroes-data2…")
    clone_full(REPO2, HD2)
    if a.pull:
        run(["git", "pull", "--ff-only"], cwd=HD1)
        run(["git", "pull", "--ff-only"], cwd=HD2)

    builds = {}
    for vdir in sorted((HD1 / "heroesdata").iterdir()):
        info = ver_info(vdir.name)
        if not info or not vdir.is_dir():
            continue
        hdp, hp, kp = hdp_files(vdir)
        if hp is None or kp is None:
            print(f"  경고 {vdir.name}: herodata/kokr 없음", file=sys.stderr)
            continue
        info.update({"repo": "heroes-data", "date": first_commit_date(HD1, f"heroesdata/{vdir.name}"),
                     "herodata": str(hp.relative_to(ROOT)).replace("\\", "/"), "kokr": str(kp.relative_to(ROOT)).replace("\\", "/")})
        builds[info["build"], info["isPtr"]] = info
    print(f"  heroes-data {len(builds)}개 버전")
    resolve_data2(builds)

    rows = sorted(builds.values(), key=lambda b: (b["build"], b["isPtr"]))
    # 저장소에 늦게 올라온 버전은 커밋일이 실제 패치일보다 뒤일 수 있다.
    # 빌드 번호는 시간순이므로, 날짜가 거꾸로 가면 앞뒤 사이 값으로 눌러 준다(추정 표시를 남긴다).
    for i in range(len(rows) - 2, -1, -1):   # 뒤에서 앞으로: 뒤 빌드보다 늦은 날짜는 뒤 날짜로 낮춘다
        b, nxt = rows[i], rows[i + 1]
        if b.get("date") and nxt.get("date") and b["date"] > nxt["date"]:
            b["dateRaw"], b["date"], b["dateEstimated"] = b["date"], nxt["date"], True
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"완료: {len(rows)}개 빌드 → {OUT}  ({rows[0]['version']} … {rows[-1]['version']})")


if __name__ == "__main__":
    main()
