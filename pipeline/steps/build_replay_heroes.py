# -*- coding: utf-8 -*-
"""리플레이 뷰어에 빠진 영웅을 채운다 — 표 세 개와 그림 네 종.

리플레이 뷰어의 영웅 자료는 손으로 적는 목록이 아니라 생성 파일인데, 새 영웅이 나와도
저절로 늘지 않는다(옛 생성기가 다른 프로젝트에 있고 2026-07 추출본을 봤다).
그래서 새 영웅이 빠지면 그 영웅이 낀 리플레이에서 **이름도 아이콘도 안 뜬다.**

채우는 것 (이미 있는 영웅은 건드리지 않는다)
  site/replay/js/data_heroes.js     HERO_DB   미니맵 아이콘 · 한국어/영어 이름 · 역할군
  site/replay/js/data_abilities.js  ABIL_DB   초상화 · 기술(칸·이름·아이콘·기본 재사용 대기시간)
  site/replay/js/data_talents.js    TALENT_DB 특성 내부명(talentId) → 한국어명 · 티어 · 아이콘
  site/replay/icons|portraits|abilities|talents/   그림 (32px PNG · 92px·44px WebP)

자료는 사이트가 이미 쓰는 것에서 가져온다(`site/data/builds/live.ko.json` = 한국어 이름·재사용 대기시간,
빌드 원본 herodata = talentId·초상화 파일명, `roles.json` = 역할군).
그림만 게임 설치본에서 꺼내 굽는다 — 미니맵 아이콘·대상 초상화는 아이콘 저장소에 없기 때문이다.

게임 설치본이 필요하므로 **내 PC 에서만** 돈다.

    python build_replay_heroes.py            # 빠진 영웅을 채운다
    python build_replay_heroes.py --check    # 누가 빠졌는지만 본다
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
SITE = ROOT / "site"
RP = SITE / "replay"
JS = RP / "js"
BUILDS = SITE / "data" / "patchnotes" / "builds.json"
ROLES = SITE / "data" / "patchnotes" / "roles.json"
INSTALL = Path(r"C:\Program Files (x86)\Heroes of the Storm")
HDP = Path(os.environ.get("HDP_PATH", r"C:\Users\sinon\.dotnet\tools\dotnet-heroes-data-parser.exe"))

ROLE_KO = {"Tank": "전사", "Bruiser": "투사", "Healer": "치유사", "Support": "지원가",
           "MeleeAssassin": "근접 암살자", "RangedAssassin": "원거리 암살자"}
SLOT_ORDER = ["Q", "W", "E", "R", "Trait", "Active"]
# 탈것·귀환은 관전 바에 안 쓴다
SKILL_GROUPS = ("basic", "heroic", "trait", "activable")


def say(*a):
    print(*a, flush=True)


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8-sig"))


def js_object(path, name):
    """`const NAME = {...};` 또는 `[...]` 를 파이썬 값으로."""
    s = Path(path).read_text(encoding="utf-8")
    i = s.index(name)
    body = s[s.index("=", i) + 1: s.index(";", i)].strip()
    body = re.sub(r",\s*([\]}])", r"\1", body)
    try:
        return json.loads(body)          # 이미 바른 JSON (ABIL_DB·TALENT_DB)
    except json.JSONDecodeError:
        pass
    # HERO_DB 는 키에 따옴표가 없다. **아는 키만** 따옴표를 씌운다 —
    # 아무 낱말에나 씌우면 "빛의 권능: 구원" 같은 값 속 쌍점까지 건드려 깨진다.
    body = re.sub(r'([{,]\s*)(icon|ko|en|role)\s*:', r'\1"\2":', body)
    return json.loads(body)


def head_of(path, mark):
    """파일 맨 앞 주석(생성기 설명)을 그대로 살려 둔다."""
    s = Path(path).read_text(encoding="utf-8")
    return s[: s.index(mark)]


def cd_sec(text):
    m = re.search(r"([\d.]+)\s*초", re.sub(r"<[^>]+>", "", str(text or "")))
    return float(m.group(1)) if m else None


def latest_live():
    rows = [b for b in load(BUILDS) if not b.get("isPtr")]
    rows.sort(key=lambda b: b["build"])
    return rows[-1]


def extract(names, work):
    """게임에서 텍스처만 콕 집어 꺼낸다 → {파일명: 경로}"""
    cmd = [str(HDP), "casc-extract", "game", "-s", str(INSTALL), "-t", "2", "-o", work]
    for n in sorted(names):
        cmd += ["-i", f"mods/**/assets/textures/{Path(n).stem}.dds"]
    say(f"  그림 {len(names)}장 꺼내는 중 …")
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=1800)
    if r.returncode != 0:
        say(((r.stdout or "") + (r.stderr or ""))[-1000:])
        raise SystemExit(f"꺼내기 실패 (rc={r.returncode})")
    found = {}
    for n in names:
        hits = sorted(Path(work).glob(f"mods/*/base.stormassets/assets/textures/{Path(n).stem}.dds"))
        hits.sort(key=lambda p: (0 if "heroes.stormmod" in str(p) else 1, str(p)))
        if hits:
            found[n] = hits[0]
    return found


def bake(src, dest, px, webp):
    from PIL import Image
    im = Image.open(src).convert("RGBA")
    if max(im.size) > px:
        im = im.resize((px, px), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if webp:
        im.save(dest, "WEBP", quality=82, method=4)
    else:
        im.save(dest, "PNG", optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="누가 빠졌는지만 본다")
    a = ap.parse_args()

    row = latest_live()
    raw = load(ROOT / row["herodata"])["items"]
    ko = load(SITE / "data" / "builds" / "live.ko.json")
    idx = {h["id"]: h for h in load(SITE / "data" / "builds" / "index.json")["heroes"]}
    roles = load(ROLES) if ROLES.exists() else {}

    hero_db = js_object(JS / "data_heroes.js", "HERO_DB")
    abil_db = js_object(JS / "data_abilities.js", "ABIL_DB")
    tal_db = js_object(JS / "data_talents.js", "TALENT_DB")
    known = {h["ko"] for h in hero_db}

    todo = [hid for hid, h in idx.items() if h["name_ko"] not in known and hid in ko]
    say(f"리플레이 영웅표 {len(hero_db)}명 · 지금 영웅 {len(idx)}명 → 빠진 영웅 {len(todo)}명"
        + (": " + ", ".join(idx[h]["name_ko"] for h in todo) if todo else ""))
    if a.check or not todo:
        return 1 if todo else 0

    want_icon, want_port, want_ab, want_tal = set(), set(), set(), set()
    new_rows = []
    for hid in todo:
        h, hraw = ko[hid], raw.get(hid) or {}
        name_ko, name_en = idx[hid]["name_ko"], idx[hid]["name_en"]
        ports = hraw.get("portraits") or {}
        mini, target = ports.get("minimap"), ports.get("target")
        if not mini:
            say(f"  ! {name_ko}: 미니맵 아이콘이 없습니다 — 건너뜁니다")
            continue
        role = ROLE_KO.get(roles.get(hid), "")
        new_rows.append({"icon": mini, "ko": name_ko, "en": name_en, "role": role})
        want_icon.add(mini)

        skills = []
        for grp in SKILL_GROUPS:
            for s in (h.get("abilities") or {}).get(grp) or []:
                if not s.get("icon"):
                    continue
                skills.append({"s": s.get("abilityType") or "?", "n": s.get("name") or "",
                               "i": Path(s["icon"]).stem, "cd": cd_sec(s.get("cooldownTooltip"))})
                want_ab.add(s["icon"])
        skills.sort(key=lambda x: (SLOT_ORDER.index(x["s"]) if x["s"] in SLOT_ORDER else 9, x["n"]))
        abil_db[name_ko] = {"p": Path(target).stem if target else None, "sk": skills}
        if target:
            want_port.add(target)

        # 특성: 리플레이가 적어 주는 이름은 게임의 talentId 다. 우리 자료에서는 buttonId 가 그 값이다.
        for lv, arr in (h.get("talents") or {}).items():
            tier = int(re.sub(r"\D", "", lv))
            for t in arr:
                tid = t.get("buttonId")
                if not tid:
                    continue
                stem = Path(t["icon"]).stem if t.get("icon") else ""
                tal_db[tid] = {"ko": t.get("name") or tid, "lv": tier, "ic": stem}
                if t.get("icon"):
                    want_tal.add(t["icon"])

    if not new_rows:
        say("채울 것이 없습니다.")
        return 0

    with tempfile.TemporaryDirectory(prefix="replay_heroes_") as work:
        found = extract(want_icon | want_port | want_ab | want_tal, work)
        miss = sorted(set(want_icon | want_port | want_ab | want_tal) - set(found))
        if miss:
            say(f"  ! 게임에서 못 찾은 그림 {len(miss)}장: {miss[:5]}")
        for n in sorted(want_icon & set(found)):
            bake(found[n], RP / "icons" / (Path(n).stem + ".png"), 32, False)
        for n in sorted(want_port & set(found)):
            bake(found[n], RP / "portraits" / (Path(n).stem + ".webp"), 96, True)
        for n in sorted(want_ab & set(found)):
            bake(found[n], RP / "abilities" / (Path(n).stem + ".webp"), 44, True)
        for n in sorted(want_tal & set(found)):
            bake(found[n], RP / "talents" / (Path(n).stem + ".webp"), 44, True)

    # 영웅표는 사람이 읽는 모양이라 줄 모양을 맞춰 끼워 넣는다
    p = JS / "data_heroes.js"
    s = p.read_text(encoding="utf-8")
    add = "".join('  {icon:"%s",%sko:"%s",%sen:"%s", role:"%s"},\n'
                  % (r["icon"], " " * max(1, 46 - len(r["icon"])), r["ko"],
                     " " * max(1, 14 - len(r["ko"]) * 2), r["en"], r["role"]) for r in new_rows)
    # HERO_ROLES 배열이 앞에 있으므로 **HERO_DB 의** 닫는 괄호를 찾아야 한다
    i = s.index("];", s.index("const HERO_DB"))
    s = s[:i] + add + s[i:]
    p.write_text(s, encoding="utf-8", newline="\n")

    pa = JS / "data_abilities.js"
    pa.write_text(head_of(pa, "const ABIL_DB")
                  + "const ABIL_DB = " + json.dumps(abil_db, ensure_ascii=False, separators=(",", ":")) + ";\n",
                  encoding="utf-8", newline="\n")
    pt = JS / "data_talents.js"
    pt.write_text(head_of(pt, "const TALENT_DB")
                  + "const TALENT_DB = " + json.dumps(tal_db, ensure_ascii=False, separators=(",", ":")) + ";\n",
                  encoding="utf-8", newline="\n")

    say(f"넣었습니다 — 영웅 {len(new_rows)}명 · 미니맵 {len(want_icon)} · 초상화 {len(want_port)}"
        f" · 기술 아이콘 {len(want_ab)} · 특성 아이콘 {len(want_tal)}")
    for r in new_rows:
        say(f"   + {r['ko']} ({r['en']}) · {r['role']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
