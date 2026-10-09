# -*- coding: utf-8 -*-
"""범위 구경 탭이 읽을 자료 한 장을 만든다 — `site/data/shapes.json`.

도감은 영웅을 하나씩 받는다(한 명 28KB). 범위 구경은 **영웅을 가로질러** 보는 탭이라
그 방식이면 영웅 91명 = 요청 91번이 된다. 공짜 호스팅에서 그러면 안 되므로, 그림에
**꼭 필요한 칸만** 추려 한 장으로 미리 말아 둔다.

그리는 데 실제로 쓰이는 칸은 여섯뿐이다(`shared/shape.js` 가 읽는 것):
도형 · 도형거리 · 찾는 반지름 · 찾는 대상 · 최소 사거리 · 그래프.
나머지는 그림 밑에 적어 줄 **설명용**이라 따로 추린다.

    python pipeline/steps/build_shapes.py
"""
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SRC = ROOT / "site" / "data" / "herodex"
DST = ROOT / "site" / "data" / "shapes.json"

DRAW = ("도형", "도형거리", "찾는 반지름", "찾는 대상", "최소 사거리", "그래프")
SHOW = ("유형", "영향", "지정", "속성", "범위", "아군 범위", "반지름", "아군 반지름",
        "안쪽 반지름", "너비", "높이", "각도", "사거리", "히트박스", "투사체 속도",
        "모양", "자리 패턴", "기준", "갈래 수", "둘러싼 수", "튕기는 거리", "튕기는 횟수")


def rows_of(d, hi, key, kind):
    out = []
    for a in d.get(key) or []:
        w = a.get("위키식") or {}
        if not (w.get("도형") or w.get("찾는 반지름")):
            continue                       # 그릴 게 없으면 싣지 않는다
        keep = {k: w[k] for k in DRAW + SHOW if w.get(k) not in (None, "", [], {})}
        r = {"h": hi, "n": a.get("이름") or "", "i": a.get("id") or "", "w": keep}
        if kind == "특성":
            r["lv"] = a.get("레벨")
        elif a.get("칸"):
            r["s"] = a["칸"]
        out.append(r)
    return out


def main():
    idx = json.load(io.open(SRC / "index.json", encoding="utf-8"))
    heroes, figs = [], []
    for hi, h in enumerate(idx["heroes"]):
        d = json.load(io.open(SRC / f"{h['id']}.json", encoding="utf-8"))
        heroes.append({"id": h["id"], "name": h["name"],
                       "r": (d.get("기본") or {}).get("반지름")})
        figs += rows_of(d, hi, "기술", "기술")
    for hi, h in enumerate(idx["heroes"]):
        d = json.load(io.open(SRC / f"{h['id']}.json", encoding="utf-8"))
        figs += rows_of(d, hi, "특성", "특성")

    out = {"build": idx.get("build"), "기준": idx.get("기준") or {},
           "영웅": heroes, "그림": figs}
    DST.parent.mkdir(parents=True, exist_ok=True)
    io.open(DST, "w", encoding="utf-8", newline="").write(
        json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    kb = DST.stat().st_size / 1024
    tal = sum(1 for f in figs if "lv" in f)
    print(f"그림 {len(figs)}개(기술 {len(figs) - tal} · 특성 {tal}) · 영웅 {len(heroes)}명"
          f" · {kb:.0f}KB → {DST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
