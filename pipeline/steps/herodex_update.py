# -*- coding: utf-8 -*-
"""영웅 도감 **한 번에 갱신** — 게임이 바뀌면 여기부터 돌린다.

새 영웅이 나오거나 기술·특성이 바뀌었을 때, 사람이 기억해야 할 차례가 여섯이었다.
하나라도 빼먹으면 조용히 어긋난다(그림만 새것, 통계는 옛것 …). 그래서 한 줄로 묶는다.

    ① 설치본 판 확인   게임 `.build.info` ↔ 이미 꺼내 둔 `hots_xml/<판>`
    ② 원본 XML 꺼내기  hots_xml/tools/extract_xml.py
    ③ 상세 뽑기        hots_xml/tools/hero_detail.py --all   → hots_xml/out/*.json
    ④ 검수             규칙·돌연변이·어색한 자리·그림·설명 대조·위키 대조
    ⑤ 사이트 자료      build_herodex.py(→ shapes·stats 까지) · build_status.py
    ⑥ 무엇이 바뀌었나  git HEAD 의 자료와 맞대어 **새 영웅·새 기술·바뀐 값**을 적는다

쓰는 법
    python pipeline/steps/herodex_update.py --check   # 할 일이 있나만 (있으면 종료 코드 1)
    python pipeline/steps/herodex_update.py           # 바뀐 게 있으면 전부 다시 만든다
    python pipeline/steps/herodex_update.py --ptr     # 테스트 서버 설치본으로
    python pipeline/steps/herodex_update.py --force   # 판이 같아도 다시 (해석기를 고쳤을 때)
    python pipeline/steps/herodex_update.py --no-xml  # 이미 꺼내 둔 XML 로 ③부터

**검수를 통과 못 하면 사이트 자료를 안 만든다.** 틀린 그림을 올리는 것보다 안 올리는 게 낫다.
`--anyway` 로 밀어붙일 수 있지만, 그때는 무엇이 걸렸는지 보고에 그대로 남는다.

커밋·푸시는 **안 한다.** 무엇이 바뀌었는지 사람이 보고 나서 할 일이다(규약: push = 즉시 배포).
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
XML = ROOT.parent / "hots_xml"
SITE = ROOT / "site" / "data" / "herodex"
KST = timezone(timedelta(hours=9))
INSTALLS = {
    "live": Path(r"C:\Program Files (x86)\Heroes of the Storm"),
    "ptr": Path(r"C:\Program Files (x86)\Heroes of the Storm Public Test"),
}


def say(*a):
    print(*a, flush=True)


def run(args, cwd, quiet=False):
    """하위 도구를 돌리고 (종료 코드, 출력)을 돌려준다.

    **흘려보내면서 받는다.** 다 끝난 뒤에 한꺼번에 찍으면 XML 꺼내기처럼 몇 분 걸리는 걸음이
    멈춘 것처럼 보인다(기다리는 사람이 죽었나 싶어 끊는다).
    출력은 UTF-8 로 못 박는다 — 윈도 기본 코드페이지(cp949)로 받으면 한국어가 통째로 깨진다."""
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    p = subprocess.Popen([sys.executable] + args, cwd=str(cwd), env=env,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                         text=True, encoding="utf-8", errors="replace", bufsize=1)
    buf = []
    for line in p.stdout:
        buf.append(line)
        if not quiet:
            say("   " + line.rstrip())
    p.wait()
    return p.returncode, "".join(buf)


# ── ① 판 확인 ────────────────────────────────────────────────────────────
def installed_version(side):
    """설치본이 지금 몇 판인가 — `.build.info` 의 Version 칸."""
    p = INSTALLS[side] / ".build.info"
    if not p.exists():
        return None
    head, *rows = p.read_text(encoding="utf-8", errors="replace").splitlines()
    cols = [c.split("!")[0] for c in head.split("|")]
    if "Version" not in cols or not rows:
        return None
    return rows[0].split("|")[cols.index("Version")].strip()


def extracted_versions():
    return sorted(p.name for p in XML.iterdir()
                  if p.is_dir() and (p / "_index.json").exists())


def built_version():
    """사이트 자료가 어느 판으로 만들어졌나."""
    f = SITE / "index.json"
    if not f.exists():
        return None
    return json.loads(f.read_text(encoding="utf-8")).get("build")


# ── ⑥ 무엇이 바뀌었나 ────────────────────────────────────────────────────
_SHOWN = {}


def git_show(path):
    """git 에 올라가 있는(=이미 올린) 자료를 읽는다. 영웅마다 두 번 묻게 되므로 기억해 둔다."""
    if path in _SHOWN:
        return _SHOWN[path]
    p = subprocess.run(["git", "show", f"HEAD:{path}"], cwd=str(ROOT),
                       capture_output=True)
    if p.returncode:
        _SHOWN[path] = None
        return None
    try:
        _SHOWN[path] = json.loads(p.stdout.decode("utf-8"))
    except Exception:                                   # noqa: BLE001
        _SHOWN[path] = None
    return _SHOWN[path]


def key_set(d, kind):
    return {x.get("id") or x.get("이름"): x for x in (d.get(kind) or [])}


def diff_hero(old, new):
    """한 영웅 안에서 **새로 생긴 것 · 없어진 것 · 값이 바뀐 것**을 센다."""
    out = {"생김": [], "빠짐": [], "바뀜": []}
    for kind in ("기술", "특성"):
        a, b = key_set(old, kind), key_set(new, kind)
        for k in b.keys() - a.keys():
            out["생김"].append(f"{kind} {b[k].get('이름') or k}")
        for k in a.keys() - b.keys():
            out["빠짐"].append(f"{kind} {a[k].get('이름') or k}")
        for k in a.keys() & b.keys():
            wa = (a[k].get("위키식") or {})
            wb = (b[k].get("위키식") or {})
            bits = []
            for f2 in sorted(wa.keys() | wb.keys()):
                if f2.startswith("_") or f2 == "도형":
                    continue
                va, vb = wa.get(f2), wb.get(f2)
                if json.dumps(va, ensure_ascii=False, sort_keys=True) \
                        != json.dumps(vb, ensure_ascii=False, sort_keys=True):
                    bits.append(f"{f2} {va} → {vb}")
            # 그림은 좌표가 길어 글로 옮기면 못 읽는다 — '바뀌었다' 만 적는다
            if json.dumps(wa.get("도형"), ensure_ascii=False, sort_keys=True) \
                    != json.dumps(wb.get("도형"), ensure_ascii=False, sort_keys=True):
                bits.append("그림")
            if bits:
                out["바뀜"].append(f"{kind} {b[k].get('이름') or k} — " + " · ".join(bits[:6]))
    return out


def report_changes():
    """git 에 올라가 있는 자료와 **지금 만든 자료**를 맞대 본다.

    예전 것을 따로 베껴 둘 필요가 없다 — 사이트 자료가 이미 저장소에 들어 있다.
    (hots_xml 은 저장소 밖이라 거기서는 이런 대조를 할 수가 없다.)"""
    idx_new = json.loads((SITE / "index.json").read_text(encoding="utf-8"))
    idx_old = git_show("site/data/herodex/index.json")
    L = []
    if not idx_old:
        return ["(견줄 옛 자료가 없습니다 — 첫 만들기)"]
    old_h = {h["id"]: h for h in idx_old.get("heroes", [])}
    new_h = {h["id"]: h for h in idx_new.get("heroes", [])}
    born = [new_h[k]["name"] for k in new_h.keys() - old_h.keys()]
    gone = [old_h[k]["name"] for k in old_h.keys() - new_h.keys()]
    if born:
        L.append(f"**새 영웅 {len(born)}명** — " + " · ".join(sorted(born)))
    if gone:
        L.append(f"**빠진 영웅 {len(gone)}명** — " + " · ".join(sorted(gone)))
    n_ch = 0
    for hid in sorted(new_h.keys() & old_h.keys()):
        old = git_show(f"site/data/herodex/{hid}.json")
        new_f = SITE / f"{hid}.json"
        if not old or not new_f.exists():
            continue
        new = json.loads(new_f.read_text(encoding="utf-8"))
        d = diff_hero(old, new)
        if not any(d.values()):
            continue
        n_ch += 1
        L.append(f"### {new.get('영웅') or hid}")
        for tag in ("생김", "빠짐", "바뀜"):
            for line in d[tag][:12]:
                L.append(f"  - {tag}: {line}")
            if len(d[tag]) > 12:
                L.append(f"  - {tag}: … 그 밖 {len(d[tag]) - 12}건")
    # **처음 보는 꼴·처음 보는 칸**은 따로 외친다. 새 영웅이 우리가 그릴 줄 모르는 모양을
    # 들고 올 수 있다 — 그때 조용히 넘어가면 "빈 그림" 이나 "엉뚱한 그림" 이 된다.
    def vocab(get):
        kinds, keys = set(), set()
        for hid in get:
            d = get[hid]
            if not d:
                continue
            for kind in ("기술", "특성"):
                for x in (d.get(kind) or []):
                    w = x.get("위키식") or {}
                    keys |= {k for k in w if not k.startswith("_")}
                    for g in (w.get("도형") or []):
                        kinds.add(g.get("꼴"))
        return kinds - {None}, keys
    _old = {h: git_show(f"site/data/herodex/{h}.json") for h in sorted(old_h)}
    _new = {h: json.loads((SITE / f"{h}.json").read_text(encoding="utf-8"))
            for h in sorted(new_h) if (SITE / f"{h}.json").exists()}
    k0, f0 = vocab(_old)
    k1, f1 = vocab(_new)
    if k1 - k0:
        L.append(f"⚠ **처음 보는 도형 꼴** — {' · '.join(sorted(k1 - k0))}  (그릴 줄 아는지 확인)")
    if f1 - f0:
        L.append(f"⚠ **처음 보는 칸** — {' · '.join(sorted(f1 - f0))}  (화면에 내보낼지 확인)")
    if not born and not gone and not n_ch:
        L.append("바뀐 자리가 없습니다.")
    return L


# ── ④ 검수 ──────────────────────────────────────────────────────────────
# (이름, 명령, 통과 기준). 기준이 None 이면 **종료 코드 0** 이 곧 통과다.
GATES = [
    ("규칙",        ["tools/rule_test.py"],   r"규칙 (\d+)개 중 (\d+)개 통과"),
    ("어색한 자리",  ["tools/odd_audit.py"],   r"칸 [\d,]+장에서 (\d+)건"),
    ("그림",        ["tools/shape_audit.py"], r"의심 (\d+)건"),
    ("설명 대조",    ["tools/desc_cross.py"],  r"의심 (\d+)건"),
    ("위키 대조",    ["tools/wiki_diff.py"],   r"어긋난 것\*\* (\d+)건"),
    ("돌연변이",     ["tools/rule_mutate.py"], r"(\d+)/(\d+) 잡음"),
]


def gates(skip_slow=False):
    """검수를 차례로 돌린다. **막는 것**과 **세어 두는 것**을 가른다 —
    규칙·돌연변이·어색한 자리는 0 이어야 하고, 그림·설명·위키는 '늘었나' 를 본다."""
    res, ok = [], True
    for name, cmd, pat in GATES:
        if skip_slow and name == "돌연변이":
            res.append((name, "건너뜀", True))
            continue
        code, out = run(cmd, XML, quiet=True)
        m = re.search(pat, out) if pat else None
        got = " ".join(m.groups()) if m else ("돌았음" if code == 0 else "실패")
        good = code == 0
        if name == "규칙" and m:
            good = m.group(1) == m.group(2)
        if name == "돌연변이" and m:
            good = m.group(1) == m.group(2)
        if name == "어색한 자리" and m:
            good = m.group(1) == "0"
        ok = ok and good
        res.append((name, got, good))
    return res, ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ptr", action="store_true", help="테스트 서버 설치본으로")
    ap.add_argument("--check", action="store_true", help="할 일이 있나만 본다(있으면 1)")
    ap.add_argument("--force", action="store_true", help="판이 같아도 다시 만든다")
    ap.add_argument("--no-xml", action="store_true", help="이미 꺼내 둔 XML 로 ③부터")
    ap.add_argument("--no-site", action="store_true", help="사이트 자료는 안 만든다")
    ap.add_argument("--fast", action="store_true", help="느린 검수(돌연변이)는 건너뛴다")
    ap.add_argument("--anyway", action="store_true", help="검수가 걸려도 사이트 자료를 만든다")
    ap.add_argument("--md", help="보고를 이 파일로도 적는다")
    a = ap.parse_args()
    side = "ptr" if a.ptr else "live"

    inst = installed_version(side)
    have = extracted_versions()
    built = built_version()
    say(f"설치본({side}) {inst or '못 찾음'} · 꺼내 둔 것 {have[-1] if have else '없음'}"
        f" · 사이트 자료 {built or '없음'}")
    todo = bool(inst) and (inst not in have or built != inst)
    if a.check:
        say("할 일: " + ("있음" if todo else "없음"))
        return 1 if todo else 0
    if not todo and not a.force:
        say("바뀐 게 없습니다. 해석기를 고쳐서 다시 만들려면 --force.")
        return 0

    if not a.no_xml and inst and inst not in have:
        say(f"\n── ② 원본 XML 꺼내기 ({inst}) ───────────────")
        code, _ = run(["tools/extract_xml.py"] + (["--ptr"] if a.ptr else []), XML)
        if code:
            say("!! XML 을 못 꺼냈습니다. 게임이 켜져 있거나 설치본이 바뀌었는지 보세요.")
            return 2

    say("\n── ③ 상세 뽑기 (91명) ───────────────────────")
    code, out = run(["tools/hero_detail.py", "--all"], XML)
    if code:
        say("!! 상세 뽑기가 실패했습니다.")
        return 2

    say("\n── ④ 검수 ──────────────────────────────────")
    res, ok = gates(skip_slow=a.fast)
    for name, got, good in res:
        say(f"   {'✓' if good else '✗'} {name:10s} {got}")
    if not ok and not a.anyway:
        say("\n!! 검수가 걸렸습니다 — 사이트 자료는 만들지 않았습니다."
            "\n   고치고 다시 돌리거나, 알면서 밀어붙이려면 --anyway.")
        return 3

    if not a.no_site:
        say("\n── ⑤ 사이트 자료 ───────────────────────────")
        code, _ = run(["pipeline/steps/build_herodex.py"], ROOT)
        if code:
            say("!! 사이트 자료 만들기가 실패했습니다.")
            return 2
        run(["pipeline/steps/build_status.py"], ROOT)

    say("\n── ⑥ 무엇이 바뀌었나 ───────────────────────")
    lines = report_changes()
    for ln in lines:
        say(ln)
    if a.md:
        head = (f"# 영웅 도감 갱신 — {datetime.now(KST):%Y-%m-%d %H:%M} (KST)\n\n"
                f"- 자료 판: {inst}\n"
                + "".join(f"- 검수 {n}: {g}{'' if k else '  ← 걸림'}\n" for n, g, k in res)
                + "\n")
        Path(a.md).write_text(head + "\n".join(lines) + "\n", encoding="utf-8")
        say(f"\n→ {a.md}")
    say("\n다음: 브라우저로 확인(콘솔 0 · 다크/라이트 · 375px) → 커밋 → 지시받으면 push")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
