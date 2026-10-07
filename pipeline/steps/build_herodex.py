# -*- coding: utf-8 -*-
"""영웅 도감 자료 만들기 — `hots_xml` 이 게임 XML 에서 뽑아 둔 상세를 사이트용으로 옮긴다.

    (1) hots_xml 에서  python tools/hero_detail.py --all     # XML → out/<영웅>.json
    (2) 여기서        python pipeline/steps/build_herodex.py # → site/data/herodex/

왜 쪼개 두나: 무료 호스팅이라 **화면이 실제로 쓰는 것만** 받아야 한다. 영웅 하나가 20~40KB 라,
목록(index.json 6KB)만 먼저 받고 **고른 영웅 하나**만 더 받는다(한 장짜리 2.4MB 를 통째로 받지 않는다).

hots_xml 은 저장소 **밖**이다(게임 자산이라 GitHub 에 안 올린다). 그래서 이 단계는 로컬 전용이고,
서버(Actions)는 여기서 만들어 커밋한 JSON 을 그대로 쓴다.
"""
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT.parent / "hots_xml" / "out"
OUT = ROOT / "site" / "data" / "herodex"

# 화면이 쓰는 것만 남긴다(내부 디버그용 칸은 뺀다)
KEEP_AB = ("이름", "칸", "id", "설명", "아이콘", "위키식", "자원(Energy)", "자원(Life)", "재사용 대기시간",
           "연타 제한", "충전 개수", "충전 회복", "사거리", "최소 사거리", "부채꼴", "시전 시간",
           "마무리 시간", "이동 거리(추정)", "대상", "피해", "회복", "범위", "투사체",
           "재사용 조정", "지속 효과", "거는 효과", "위키", "예외")
CAP = {"지속 효과": 6, "거는 효과": 8, "투사체": 5, "범위": 6, "피해": 8, "회복": 6, "재사용 조정": 4}
TIER_LEVEL = {1: 1, 2: 4, 3: 7, 4: 10, 5: 13, 6: 16, 7: 20}


def level_of(t):
    try:
        return TIER_LEVEL.get(int(float(str(t.get("단계")))))
    except (TypeError, ValueError):
        return None


# 영웅 초상화는 이미 사이트가 가지고 있는 목록에서 가져온다(두 군데서 만들지 않는다)
PORTRAITS = ROOT / "site" / "data" / "patchnotes" / "heroes.json"


def slim(d, hid, portraits):
    o = {"영웅": d["영웅"], "자료": d["자료"], "기본": d["기본 수치"],
         "초상화": (portraits.get(hid) or {}).get("portrait"), "기술": [], "특성": []}
    for a in d["기술"]:
        x = {}
        for k in KEEP_AB:
            v = a.get(k)
            if v in (None, [], {}):
                continue
            x[k] = v[:CAP[k]] if k in CAP else v
        o["기술"].append(x)
    for t in sorted(d["특성"], key=lambda x: (level_of(x) or 99, str(x.get("칸")))):
        up = t.get("강화 기술")
        o["특성"].append({
            "레벨": level_of(t), "이름": t.get("이름", t["id"]), "아이콘": t.get("아이콘"),
            "설명": t.get("설명"),
            "강화": (f"[{up['칸']}] {up['이름']}" if up else None),
            "바뀌는 값": ([f"효과 켬 → {m['켜는 것']}" for m in t.get("칸 수정", []) if m.get("켜는 것")]
                      + (t.get("바뀌는 값") or []))[:6],
            "위키식": t.get("위키식") or {}, "위키": t.get("위키"), "예외": t.get("예외"),
        })
    return o


def main():
    if not SRC.is_dir():
        raise SystemExit(f"{SRC} 가 없습니다. 먼저 hots_xml 에서 `python tools/hero_detail.py --all` 을 돌리세요.")
    files = sorted(p for p in SRC.glob("*.json") if not p.name.startswith("_"))
    if not files:
        raise SystemExit("hots_xml/out 에 영웅 JSON 이 없습니다.")
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    portraits = json.loads(PORTRAITS.read_text(encoding="utf-8")) if PORTRAITS.exists() else {}
    index, total = [], 0
    build = ""
    for f in files:
        d = json.loads(f.read_text(encoding="utf-8"))
        o = slim(d, f.stem, portraits)
        build = o["자료"]
        blob = json.dumps(o, ensure_ascii=False, separators=(",", ":"))
        (OUT / f.name).write_text(blob, encoding="utf-8")
        total += len(blob.encode("utf-8"))
        index.append({"id": f.stem, "name": o["영웅"], "초상화": o["초상화"],
                      "기술": len(o["기술"]), "특성": len(o["특성"])})
    index.sort(key=lambda x: x["name"])
    (OUT / "index.json").write_text(
        json.dumps({"build": build, "heroes": index}, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8")
    print(f"영웅 {len(index)}명 · {total / 1e6:.1f}MB → {OUT}  (한 영웅 평균 {total / len(index) / 1024:.0f}KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
