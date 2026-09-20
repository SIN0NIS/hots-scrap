# -*- coding: utf-8 -*-
"""허브가 읽을 상태 파일 → site/data/hub.json

허브 화면에 "이 앱 자료가 언제 갱신됐는지 / 마지막으로 언제 확인했는지" 를 보여 주기 위한 파일.

**요청을 늘리지 않는다.** 지금까지 허브는 apps.json + latest.json 두 개를 받았는데,
이 파일 하나에 둘을 합쳐 두므로 허브가 받는 파일은 오히려 하나로 준다.
apps.json 은 그대로 둔다(사람이 고치는 원본이고, hub.json 을 못 읽을 때 되돌아갈 곳이다).

갱신 시각은 **자료가 실제로 바뀌었을 때만** 움직인다.
앱마다 자기 자료 파일들의 지문(sha1)을 재서, 지문이 달라졌을 때만 그때 시각을 찍는다.
그래서 아무것도 안 바뀐 날에는 파일이 한 글자도 안 바뀌고, 쓸데없는 커밋·배포가 생기지 않는다.

사용:
  python build_status.py                 # 지문을 재고 바뀐 앱만 시각을 새로 찍는다
  python build_status.py --checked       # "마지막 확인" 시각만 찍는다 (자동 확인이 돌 때)
  python build_status.py --seed          # 첫 생성: 갱신 시각을 git 기록에서 가져와 채운다
"""
import argparse
import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
OUT = SITE / "data" / "hub.json"
APPS = SITE / "apps.json"
LATEST = SITE / "data" / "latest.json"
KST = timezone(timedelta(hours=9))

# 앱 id → 그 앱이 실제로 쓰는 자료 파일들. 이것들이 바뀌면 "자료 갱신" 시각이 움직인다.
WATCH = {
    "encyclopedia": ["site/encyclopedia/index.html"],
    # index.json 은 두 판이 같이 쓰므로 지문에 넣지 않는다(넣으면 테스트 서버만 바뀌어도 본 서버까지 '갱신'으로 찍힌다)
    "builds": ["site/data/builds/live.ko.json", "site/data/builds/live.en.json"],
    "builds-ptr": ["site/data/builds/ptr.ko.json", "site/data/builds/ptr.en.json"],
    "replay": ["site/replay/js/data_maps.js", "site/replay/js/data_heroes.js"],
    "patchnotes": ["site/data/patchnotes/index.json", "site/data/patchnotes/builds.json",
                   "site/data/patchnotes/heroes.json"],
    # models 는 바깥 사이트라 우리가 아는 시각이 없다
}


def load(p, default=None):
    p = Path(p)
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding="utf-8-sig"))


def now():
    return datetime.now(KST).strftime("%Y-%m-%d %H:%M")


def fingerprint(paths, raw=False):
    """자료 파일들의 지문. 내용이 같으면 같은 값이 나온다.

    줄바꿈은 맞춰 놓고 잰다. 윈도우에서 git 이 파일을 다시 꺼내면 CRLF 로 바뀌는데,
    그러면 내용은 그대로인데 지문만 달라져서 서버(리눅스)와 내 PC 가 번갈아 '바뀌었다'고 찍는다.
    raw=True 는 예전 방식(바이트 그대로) — 옛 지문과 견줄 때만 쓴다.
    """
    h = hashlib.sha1()
    for rel in paths:
        p = ROOT / rel
        h.update(rel.encode())
        b = p.read_bytes() if p.exists() else b"-"
        h.update(b if raw else b.replace(bytes([13, 10]), bytes([10])))   # CRLF -> LF
    return h.hexdigest()[:16]


def git_date(paths):
    """git 기록에서 그 파일들이 마지막으로 바뀐 시각. 얕은 복제면 못 찾을 수 있다."""
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cI", "--"] + list(paths),
                             cwd=ROOT, capture_output=True, text=True, timeout=30).stdout.strip()
        if out:
            return datetime.fromisoformat(out).astimezone(KST).strftime("%Y-%m-%d %H:%M")
    except Exception:
        pass
    return None


def note_for(app_id):
    """카드에 함께 보일 한 줄 — 무엇을 기준으로 만든 자료인지."""
    if app_id == "encyclopedia":
        lt = load(LATEST) or {}
        return f"build {lt.get('build', '?')} 기준"
    if app_id in ("builds", "builds-ptr"):
        ch = (load(SITE / "data" / "builds" / "index.json") or {}).get("channels") or {}
        c = ch.get("ptr" if app_id == "builds-ptr" else "live") or {}
        if c.get("version"):
            return f"{c['version']} ({c.get('date', '')})".strip()
        return ""
    if app_id == "patchnotes":
        idx = load(SITE / "data" / "patchnotes" / "index.json") or []
        dates = sorted(x.get("date", "") for x in idx if x.get("date"))
        return f"{len(idx)}건 · 최신 {dates[-1]}" if dates else f"{len(idx)}건"
    if app_id == "replay":
        mj = SITE / "replay" / "js" / "data_maps.js"
        return "맵·영웅 자료 내장" if mj.exists() else ""
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--checked", action="store_true", help="'마지막 확인' 시각만 찍는다")
    ap.add_argument("--seed", action="store_true", help="갱신 시각을 git 기록에서 채운다")
    a = ap.parse_args()

    prev = load(OUT) or {}
    prev_apps = {x["id"]: x for x in prev.get("apps", [])}
    reg = load(APPS) or {"apps": []}
    lt = load(LATEST) or {}

    out = {
        "build": lt.get("build"),
        "updated": lt.get("updated"),
        "checkedAt": now() if (a.checked or not prev.get("checkedAt")) else prev["checkedAt"],
        "checkEvery": "6시간",
        "apps": [],
    }
    changed = []
    for app in reg["apps"]:
        row = dict(app)
        watch = WATCH.get(app["id"])
        old = prev_apps.get(app["id"], {})
        if watch:
            fp = fingerprint(watch)
            row["fp"] = fp
            # 옛 지문(바이트 그대로 잰 것)과 같아도 '안 바뀜'이다 — 재는 법만 바뀐 것
            same = old.get("fp") in (fp, fingerprint(watch, raw=True))
            if a.seed and not old.get("updatedAt"):
                row["updatedAt"] = git_date(watch) or now()
            elif same and old.get("updatedAt"):
                row["updatedAt"] = old["updatedAt"]          # 그대로 — 바뀐 게 없다
            else:
                row["updatedAt"] = now()
                if old.get("fp"):
                    changed.append(app["id"])
        note = note_for(app["id"])
        if note:
            row["note"] = note
        out["apps"].append(row)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    size = OUT.stat().st_size
    print(f"hub.json — 앱 {len(out['apps'])}개 · {size:,}바이트 · 마지막 확인 {out['checkedAt']}")
    for x in out["apps"]:
        if x.get("updatedAt"):
            print(f"   {x['id']:<14} 자료 갱신 {x['updatedAt']}   {x.get('note', '')}")
    if changed:
        print("자료가 바뀐 앱:", ", ".join(changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
