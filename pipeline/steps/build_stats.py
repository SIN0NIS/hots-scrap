# -*- coding: utf-8 -*-
"""**통계 보기** 자료 — 어떤 칸이 있고, 그 값이 어떻게 퍼져 있나.

도감은 영웅 한 명을 보여 주고 범위 구경은 그림을 보여 준다. 여기서는 **전체를 가로로**
본다 — "사거리라는 칸은 몇 개 기술에 있고 값이 얼마부터 얼마까지인가", "영웅 91명의
이동 속도는 다 같은가", "유형에 쓰이는 말은 몇 가지인가".

모으는 것은 넷이다:
  · **영웅 기본 수치** 생명력·재생·이동 속도·시야·공격 사거리·반지름 + 평타 여섯 칸
  · **기술 바깥칸** 재사용·사거리·마나처럼 기술 자체에 적힌 것
  · **위키식 칸** 유형·성장·지정·범위처럼 정리된 것
  · **원자료 줄** 피해.피해량·범위.반지름처럼 줄 안에 든 것

칸마다 **수면 분포(최소·중앙·최대와 막대), 말이면 값별 수**를 미리 세어 둔다.
화면에서 다시 세면 2.7MB 를 다 받아야 하므로 여기서 한 번만 센다.

    python pipeline/steps/build_stats.py
"""
import io
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SRC = ROOT / "site" / "data" / "herodex"
OUT = SRC / "stats.json"
ROWS = SRC / "stats-rows.json"      # 값 목록 — 칸을 열 때만 받는다
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:                                   # noqa: BLE001
    pass

# 화면에 보일 것이 아닌 칸 — 아이콘 파일 이름·내부 id·긴 글
SKIP = {"아이콘", "id", "설명", "위키식", "도형", "그래프", "출처", "이름"}

# ── 정상 게임에서 만날 수 없는 값은 **적어 두고 뺀다** ──────────────────────
# 통계는 "보통 얼마쯤인가" 를 보려는 것인데, 엔진의 표식값 하나가 최댓값과 평균을
# 통째로 망가뜨린다(사거리 최대 500 · 총 피해 최대 199,998). 그렇다고 조용히 지우면
# 자료를 숨기는 것이니, **무엇을 왜 뺐는지 세어 화면에 같이 보인다.**
RANGE_KEYS = ("사거리", "도형거리", "이동 거리(추정)", "찾는 반지름", "최소 사거리",
              "나오는 범위", "끌기 범위", "질주 거리", "밀리는 거리")
HUGE_KEYS = ("피해", "피해량", "틱당 피해", "총 피해", "회복량", "생명력 회복량")
# 0 이 "없음" 을 뜻하는 칸 — 0 을 세면 중앙값이 가라앉는다
ZERO_KEYS = ("속도", "반지름", "가로", "세로", "부채꼴", "각도", "너비", "높이",
             "피해 흡수", "나오는 범위", "도형거리")


def drop_reason(name, f):
    """이 값을 빼야 하나 — 빼야 하면 **까닭**을, 아니면 None."""
    base = name.split(".")[-1]
    if any(k == base or k in name for k in RANGE_KEYS):
        if f >= 300:
            return "전장 전체를 뜻하는 표식(500·363)"
        # **0.25 도 안 되는 '사거리' 는 닿는 거리가 아니다.** 우리가 돌진 거리를 못 읽어
        # 안쪽 자리값이 그대로 남은 것이다(줄진 톱날 베기 0.0615). 우리 흠이라 적어 둔다.
        if 0 < f < 0.25:
            return "우리가 못 읽은 자리값(0.25 미만)"
    if any(k == base for k in HUGE_KEYS) and f >= 99999:
        return "즉시 처치 자리값(99999)"
    if f == 65535:
        return "'한도 없음' 표식(65535)"
    if base in ("생명력", "LifeMax") and f <= 1:
        return "몸이 없는 더미 유닛"
    if f == 0 and any(k == base for k in ZERO_KEYS):
        return "0 은 '없음' 이지 크기가 아니다"
    return None
BOX = 14            # 막대 칸 수
SAMPLES = 6         # 칸마다 남길 보기


def num(v):
    """숫자로 읽히면 숫자, 아니면 None. '11.0'·'4초'·'+25%' 도 읽는다."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v or "").strip()
    if not s:
        return None
    t = s.replace(",", "").rstrip("%초도명회배개마리").strip()
    try:
        return float(t)
    except ValueError:
        return None


# 값 목록은 **고른 칸을 열 때만** 받는 둘째 파일로 뺀다(`stats-rows.json`).
# 다 합치면 38,335줄 1MB 라, 통계 화면을 열자마자 받게 하면 공짜 호스팅에 과하다.
# 대상(영웅·기술 이름)은 2,700가지뿐이라 한 번만 적고 **색인으로 가리킨다**.
ENTS, ENT_IX = [], {}


def ent_id(ko, nm, kind):
    key = (ko, nm, kind)
    if key not in ENT_IX:
        ENT_IX[key] = len(ENTS)
        ENTS.append([ko, nm, kind])
    return ENT_IX[key]


class Field:
    """칸 하나 — 값이 숫자면 분포를, 말이면 값별 수를 센다."""

    def __init__(self, group, name):
        self.group, self.name = group, name
        self.n = 0
        self.nums = []
        self.words = Counter()
        self.samples = []
        self.dropped = Counter()        # 뺀 까닭 → 몇 개
        self.drop_ex = []               # 뺀 보기
        self.rows = []                  # [대상 색인, 값] — 줄 세우기·그래프용

    def __init_drops(self):
        pass

    def add(self, v, ko, nm, kind="기술"):
        f = num(v)
        if f is not None:
            why = drop_reason(self.name, f)
            if why:
                self.dropped[why] += 1
                if len(self.drop_ex) < 3:
                    self.drop_ex.append([ko, nm, str(v)[:24]])
                return
        self.n += 1
        self.rows.append([ent_id(ko, nm, kind), f if f is not None else str(v)[:30]])
        if f is None:
            w = str(v)
            if len(w) <= 24:
                self.words[w] += 1
        else:
            self.nums.append(f)
        # 보기는 **그 칸다운 값**으로 남긴다. 수 칸인데 "무제한(500)" 이 보기로 나오면
        # 바로 위 '최소~최대' 와 어긋나 보인다.
        self.samples.append([ko, nm, str(v)[:28], f is not None])

    def dump(self, total):
        numeric = len(self.nums) >= max(3, self.n * 0.5)
        pool = [x for x in self.samples if x[3] == numeric] or self.samples
        # 열쇠는 **만들 때 같이** 넣는다. 밖에서 `zip(정렬된 rows, fields.values())` 로
        # 붙였더니 정렬 때문에 엉뚱한 칸에 붙어, 재사용을 눌렀는데 '대상' 이 열렸다.
        o = {"열쇠": f"{self.group}|{self.name}",
             "갈래": self.group, "이름": self.name, "수": self.n,
             "덮음": round(self.n / total, 4) if total else 0,
             "보기": [x[:3] for x in pool[:SAMPLES]]}
        if self.dropped:
            o["뺀 것"] = self.dropped.most_common()
            o["뺀 보기"] = self.drop_ex
        if numeric:                                     # 절반 넘게 숫자면 '수' 칸
            s = sorted(self.nums)
            o["꼴"] = "수"
            o["요약"] = {"최소": s[0], "중앙": s[len(s) // 2], "최대": s[-1],
                        "평균": round(sum(s) / len(s), 3), "센 것": len(s)}
            lo, hi = s[0], s[-1]
            if hi > lo:
                step = (hi - lo) / BOX
                bars = [0] * BOX
                for x in s:
                    bars[min(BOX - 1, int((x - lo) / step))] += 1
                o["막대"] = {"처음": lo, "칸": round(step, 4), "수": bars}
        else:
            o["꼴"] = "말"
            o["값"] = self.words.most_common(14)
            o["값 수"] = len(self.words)
        return o


def main():
    heroes, fields = [], {}
    tot = Counter()

    def fld(group, name):
        key = (group, name)
        if key not in fields:
            fields[key] = Field(group, name)
        return fields[key]

    for fn in sorted(SRC.glob("*.json")):
        if fn.name.startswith("_") or fn.name in ("index.json", "shapes.json", "stats.json"):
            continue
        d = json.loads(fn.read_text(encoding="utf-8"))
        if "기술" not in d:
            continue
        ko = d.get("영웅") or fn.stem
        tot["영웅"] += 1

        # ── 영웅 기본 수치 ──────────────────────────────────────────
        base = dict(d.get("기본") or {})
        wep = (base.pop("평타", None) or [{}])[0]
        row = {"id": fn.stem, "영웅": ko}
        for k, v in base.items():
            row[k] = v
            fld("기본", k).add(v, ko, "기본 수치", "영웅")
        for k, v in wep.items():
            if k in ("출처", "이름"):
                continue
            row["평타 " + k] = v
            fld("평타", k).add(v, ko, wep.get("이름") or "평타", "영웅")
        heroes.append(row)

        # ── 기술 ────────────────────────────────────────────────────
        for a in d.get("기술") or []:
            tot["기술"] += 1
            nm = a.get("이름") or ""
            for k, v in a.items():
                if k in SKIP or v in (None, "", [], {}):
                    continue
                if isinstance(v, list) and v and isinstance(v[0], dict):
                    for r in v:
                        for kk, vv in r.items():
                            if kk in SKIP or vv in (None, "", [], {}) or isinstance(vv, (list, dict)):
                                continue
                            fld("원자료", f"{k}.{kk}").add(vv, ko, nm, "기술")
                elif not isinstance(v, (list, dict)):
                    fld("기술", k).add(v, ko, nm, "기술")
            for k, v in (a.get("위키식") or {}).items():
                if k in SKIP or v in (None, "", [], {}) or isinstance(v, (list, dict)):
                    continue
                fld("위키식", k).add(v, ko, nm, "기술")

        # ── 특성 ────────────────────────────────────────────────────
        for t in d.get("특성") or []:
            tot["특성"] += 1
            nm = t.get("이름") or ""
            for k, v in t.items():
                if k in SKIP or v in (None, "", [], {}) or isinstance(v, (list, dict)):
                    continue
                fld("특성", k).add(v, ko, nm, "특성")
            for k, v in (t.get("위키식") or {}).items():
                if k in SKIP or v in (None, "", [], {}) or isinstance(v, (list, dict)):
                    continue
                fld("특성 위키식", k).add(v, ko, nm, "특성")

    # 갈래마다 '모수' 가 다르다 — 덮음(%)을 제대로 내려면 각자 세어야 한다
    DENOM = {"기본": tot["영웅"], "평타": tot["영웅"], "기술": tot["기술"],
             "위키식": tot["기술"], "원자료": tot["기술"],
             "특성": tot["특성"], "특성 위키식": tot["특성"]}
    rows = [f.dump(DENOM.get(f.group, 1)) for f in fields.values()]
    rows.sort(key=lambda r: (r["갈래"], -r["수"]))

    drops = Counter()
    for f in fields.values():
        drops.update(f.dropped)
    out = {"자료": "", "센 것": dict(tot), "칸 수": len(rows),
           "뺀 것": drops.most_common(), "영웅": heroes, "칸": rows}
    idx = SRC / "index.json"
    if idx.exists():
        out["자료"] = json.loads(idx.read_text(encoding="utf-8")).get("build", "")
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    ROWS.write_text(json.dumps(
        {"대상": ENTS, "칸": {f"{f.group}|{f.name}": f.rows for f in fields.values()}},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    kb = OUT.stat().st_size // 1024
    print(f"칸 {len(rows)}가지 · 영웅 {tot['영웅']} · 기술 {tot['기술']} · 특성 {tot['특성']}"
          f" · {kb}KB → {OUT}")
    print(f"   값 목록 {sum(len(f.rows) for f in fields.values())}줄 · 대상 {len(ENTS)}가지"
          f" · {ROWS.stat().st_size // 1024}KB → {ROWS.name}")
    by = Counter(r["갈래"] for r in rows)
    print("   " + " · ".join(f"{k} {v}" for k, v in by.most_common()))
    if drops:
        print("   뺀 것 — " + " · ".join(f"{k} {v}개" for k, v in drops.most_common()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
