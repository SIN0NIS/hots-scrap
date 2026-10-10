# -*- coding: utf-8 -*-
"""도감의 **범위 구경** 화면이 읽을 자료 한 장을 만든다 — `site/data/herodex/shapes.json`.

도감은 영웅을 하나씩 받는다(한 명 28KB). 범위 구경은 **영웅을 가로질러** 보는 화면이라
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
DST = ROOT / "site" / "data" / "herodex" / "shapes.json"

DRAW = ("도형", "도형거리", "찾는 반지름", "찾는 대상", "최소 사거리", "그래프")
SHOW = ("유형", "영향", "지정", "속성", "범위", "아군 범위", "반지름", "아군 반지름",
        "안쪽 반지름", "너비", "높이", "각도", "사거리", "히트박스", "투사체 속도",
        "모양", "자리 패턴", "기준", "갈래 수", "둘러싼 수", "튕기는 거리", "튕기는 횟수")


# 특성 단계는 "6-2"(여섯째 줄 둘째)로 적혀 있다. 사람이 쓰는 말은 **레벨**이다.
TIER_LV = [1, 4, 7, 10, 13, 16, 20]


def changes_map(d):
    """특성 id → (바꾸는 기술 이름, 'tier-slot'). 기술마다 달린 '특성 강화' 를 뒤집어 만든다.

    "이 범위는 **무엇이 바꾼 모습인가**" 를 적어 주려는 것이다. 특성 그림만 따로 놓이면
    어느 기술 이야기인지 알 수가 없다 — 부패의 반지름 8 짜리 원은 그냥 보면 남의 기술이다."""
    out = {}
    for a in d.get("기술") or []:
        for u in a.get("특성 강화") or []:
            if u.get("id"):
                out[u["id"]] = (a.get("이름") or "", u.get("단계") or "")
    return out


def tier_label(step):
    """'5-3' → '13lv 3' (열세 레벨 셋째). 못 읽으면 그대로 돌려준다.

    **레벨 + 순서**로 적는다 — `13T-3` 보다 `13lv 3` 이 읽기 쉽다."""
    try:
        t, k = str(step).split("-")
        return f"{TIER_LV[int(t) - 1]}lv {k}"
    except (ValueError, IndexError):
        return str(step or "")


def rows_of(d, hi, key, kind, chg=None):
    out = []
    for a in d.get(key) or []:
        w = a.get("위키식") or {}
        if not (w.get("도형") or w.get("찾는 반지름")):
            continue                       # 그릴 게 없으면 싣지 않는다
        keep = {k: w[k] for k in DRAW + SHOW if w.get(k) not in (None, "", [], {})}
        r = {"h": hi, "n": a.get("이름") or "", "i": a.get("id") or "", "w": keep}
        if kind == "특성":
            r["lv"] = a.get("레벨")
            of, step = (chg or {}).get(a.get("id") or "", ("", ""))
            if of:
                r["of"] = of                 # 이 특성이 바꾸는 기술
                r["t"] = tier_label(step)    # 16T-3 꼴
        elif a.get("칸"):
            # 같은 자리를 나눠 쓰는 기술은 **그 자리 글자**로 보인다(발리라 매복 = Q).
            share = str(a.get("같은 칸") or "").split(" ")[0]
            r["s"] = share or a["칸"]
            if share:
                r["alt"] = a["같은 칸"]
        if a.get("모드"):
            r["m"] = a["모드"]
        out.append(r)
    return out


def main():
    idx = json.load(io.open(SRC / "index.json", encoding="utf-8"))
    heroes, figs = [], []
    for hi, h in enumerate(idx["heroes"]):
        d = json.load(io.open(SRC / f"{h['id']}.json", encoding="utf-8"))
        heroes.append({"id": h["id"], "name": h["name"],
                       "r": (d.get("기본") or {}).get("반지름")})
        abil = rows_of(d, hi, "기술", "기술")
        tal = rows_of(d, hi, "특성", "특성", changes_map(d))
        # **기술 바로 뒤에 그 기술을 바꾸는 특성을 붙여 둔다.** 기본 틀과 "16T-3 을 찍으면
        # 이렇게 바뀐다" 를 나란히 놓아야 무엇이 달라졌는지 눈으로 견줄 수 있다.
        after = {}
        for t in tal:
            after.setdefault(t.get("of") or "", []).append(t)
        for r in abil:
            figs.append(r)
            # 글자로 줄 세우면 16T 가 1T 앞에 선다. **레벨 숫자**로 센다.
            # 궁극기 해금 특성(이름이 기술과 같다)은 기술 카드와 똑같아서 뺀다.
            mine = [t for t in after.pop(r["n"], []) if t["n"] != r["n"]]
            figs += sorted(mine, key=lambda x: (int(str(x.get("t") or "0").split("lv")[0] or 0),
                                                str(x.get("t") or "")))
        for rest in after.values():          # 어느 기술인지 못 밝힌 것은 그 영웅 끝에
            figs += rest

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
