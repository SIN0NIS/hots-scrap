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
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT.parent / "hots_xml" / "out"
OUT = ROOT / "site" / "data" / "herodex"

# 화면이 쓰는 것만 남긴다(내부 디버그용 칸은 뺀다)
# 자원 칸 이름은 **영웅마다 다르다** — 소냐는 분노, 가즈로는 고철, 들창코는 광기다.
# '자원' 만 통과시키면 비용 칩이 통째로 사라진다.
RES_WORDS = ("자원", "마나", "분노", "고철", "광기", "취기", "기력", "탄약", "에너지",
             "충전", "치유 에너지", "역병", "혼돈", "열기")
KEEP_AB = RES_WORDS + (
           "이름", "칸", "모드", "id", "설명", "아이콘", "위키식", "생명력 소모", "재사용 대기시간",
           "연타 제한", "충전 개수", "충전 회복", "사거리", "최소 사거리", "부채꼴", "시전 시간",
           "마무리 시간", "이동 거리(추정)", "대상", "피해", "회복", "범위", "투사체",
           "재사용 조정", "지속 효과", "거는 효과", "위키", "예외", "특성 강화", "퀘스트",
           "툴팁 수치", "퀘스트로 바뀜", "보상 갈래",
           # **기술 사이의 관계** — 같은 칸을 나눠 쓰는 다른 모습(발리라 매복 ↔ 사악한
           # 일격)과 딸린 단계. 목록 차례도 이 관계대로 서 있다.
           "같은 칸", "딸린 곳", "이어짐", "이어받음", "탈것",
           # 새로 읽기 시작한 장치들 (소환·밀침·자리잡기·버프 늘림·퀘스트 걸음)
           "소환", "밀침", "순간이동", "지속 시간 조정", "퀘스트 점수")
CAP = {"지속 효과": 6, "거는 효과": 8, "투사체": 5, "범위": 6, "피해": 8, "회복": 6,
       "재사용 조정": 4, "툴팁 수치": 8,
       "소환": 4, "밀침": 3, "순간이동": 2, "지속 시간 조정": 3, "퀘스트 점수": 3}
TIER_LEVEL = {1: 1, 2: 4, 3: 7, 4: 10, 5: 13, 6: 16, 7: 20}


def level_of(t):
    # 해석기가 영웅의 TalentTierArray 로 정한 레벨이 있으면 그것 — 크로미는 2·5·8·11·14·18
    if t.get("레벨"):
        return t["레벨"]
    try:
        return TIER_LEVEL.get(int(float(str(t.get("단계")))))
    except (TypeError, ValueError):
        return None


# 영웅 초상화는 이미 사이트가 가지고 있는 목록에서 가져온다(두 군데서 만들지 않는다)
PORTRAITS = ROOT / "site" / "data" / "patchnotes" / "heroes.json"

# **작은 아이콘은 리플레이 앱의 표에서 가져온다.** 원본 XML 에도 미니맵 아이콘이 있지만
# 액터 안에 중첩돼 있어 상속으로 안 닿고, 파일명 대소문자도 제각각이다(`..._Junkrat.dds`).
# 리플레이 쪽 표는 91명이 실제로 화면에 떠 있는 **검증된** 이름이라 그걸 쓴다 —
# 무료 호스팅이라 404 를 영웅 수만큼 내면 안 되는 자리다.
# 읽는 것은 **빌드 때 한 번**이고, 화면은 제 data 파일만 본다(앱 격리는 지킨다).
MINIMAP = ROOT / "site" / "replay" / "js" / "data_heroes.js"

ROLE_KO = {"Tank": "전사", "Bruiser": "투사", "Healer": "치유사",
           "Support": "지원가", "MeleeAssassin": "근접 암살자",
           "RangedAssassin": "원거리 암살자"}


def minimap_icons():
    """리플레이 표 → {한국어 이름: 작은 아이콘}."""
    if not MINIMAP.exists():
        return {}
    t = MINIMAP.read_text(encoding="utf-8")
    return {m.group(2): m.group(1) for m in re.finditer(
        r'\{icon:"([^"]+)",\s*ko:"([^"]+)"', t)}


# 특성 강화 줄에서 **속 사정**을 가린다 — 화면에 쓸 말이 아니다
NOISE = ("(특성 검사로 열림)", "(검사로 열림)")


def clean(t):
    if not t:
        return t
    for w in NOISE:
        t = t.replace(w, "")
    return " · ".join(x.strip() for x in t.split("·") if x.strip()) or None


def slim(d, hid, portraits):
    # 특성 그림은 특성 칸에만 실려 있다 — 기술에 붙는 '강화' 줄에서도 쓰려고 미리 모은다
    icons = {t.get("id"): t.get("아이콘") for t in d.get("특성", []) if t.get("아이콘")}
    o = {"영웅": d["영웅"], "자료": d["자료"], "기본": d["기본 수치"],
         "초상화": (portraits.get(hid) or {}).get("portrait"), "기술": [], "특성": []}
    # 새 판에서도 바로 쓰도록 XML 에서 읽은 칸을 덧붙인다(추가 칸 — 도감 화면은 안 쓴다, 위키가 쓴다)
    for k in ("세계관", "레벨 성장", "역할(XML)", "초상화(XML)", "작은아이콘(XML)"):
        if d.get(k):
            o[k] = d[k]
    if d.get("다른 모습"):          # 디바 메카처럼 영웅 몸과 다른 몸의 생명력·무기(추가 칸)
        o["다른 모습"] = [{k: v for k, v in f.items() if not str(k).startswith("_")} for f in d["다른 모습"]]
    def clean(v):
        """**밑줄로 시작하는 칸은 우리끼리 쓰는 표식**이라 내보내지 않는다 —
        원자료 줄에 `_쏜자리 true` · `_찾기 true` 가 그대로 보이고 있었다.
        속이 또 사전인 칸(`_나오는 상자`)은 화면에서 `[object Object]` 가 된다."""
        if isinstance(v, dict):
            return {k2: clean(v2) for k2, v2 in v.items() if not str(k2).startswith("_")}
        if isinstance(v, list):
            return [clean(x2) for x2 in v]
        return v

    for a in d["기술"]:
        x = {}
        for k in KEEP_AB:
            v = clean(a.get(k))
            if v in (None, [], {}):
                continue
            x[k] = v[:CAP[k]] if k in CAP else v
        # 밑줄로 시작하는 칸은 **안에서만 쓰는 것**이라 내보내지 않는다(바이트도 아낀다)
        if isinstance(x.get("위키식"), dict):
            x["위키식"] = {k: v for k, v in x["위키식"].items() if not str(k).startswith("_")}
        # 기술 하나에 특성이 넷씩 붙는다. 최종 모습만 보면 **어느 특성이 무엇을 바꿨는지**
        # 가 사라지므로, 특성마다 제 몫만 따로 실어 보낸다(설명은 특성 칸에 이미 있다).
        # 툴팁 수치의 `출처`(Behavior,…,Modification[0].…)는 내부 이름이라 화면에 안 쓴다.
        # 한 영웅이 31KB 까지 커져서, 안 쓰는 칸은 보내지 않는다.
        if x.get("툴팁 수치"):
            x["툴팁 수치"] = [{k: v for k, v in r.items() if k != "출처"} for r in x["툴팁 수치"]]
        if x.get("특성 강화"):
            # `id` 를 남긴다 — 체크/메모를 내보냈을 때 **어느 특성인지 정확히** 집어야 한다
            x["특성 강화"] = [{"단계": t.get("단계"), "이름": t.get("이름"), "id": t.get("id"),
                            "아이콘": t.get("아이콘") or icons.get(t.get("id")),
                            "바뀌는 값": (t.get("바뀌는 값") or [])[:4],
                            "내용": clean(t.get("내용"))}
                           for t in x["특성 강화"][:8]]
        o["기술"].append(x)
    for t in sorted(d["특성"], key=lambda x: (level_of(x) or 99, str(x.get("칸")))):
        up = t.get("강화 기술")
        o["특성"].append({
            "레벨": level_of(t), "이름": t.get("이름", t["id"]), "id": t["id"],
            "아이콘": t.get("아이콘"),
            "설명": t.get("설명"),
            "강화": (f"[{up['칸']}] {up['이름']}" if up else None),
            "바뀌는 값": ([f"효과 켬 → {m['켜는 것']}" for m in t.get("칸 수정", []) if m.get("켜는 것")]
                      + (t.get("바뀌는 값") or []))[:6],
            "위키식": {k: v for k, v in (t.get("위키식") or {}).items()
                     if not str(k).startswith("_")}, "위키": t.get("위키"), "예외": t.get("예외"),
            "퀘스트": t.get("퀘스트"), "보상 갈래": t.get("보상 갈래"),
            "툴팁 수치": [{k: v for k, v in r.items() if k != "출처"}
                      for r in (t.get("툴팁 수치") or [])[:8]] or None,
        })
    return o


# 범위 그림에 깔아 두는 **눈금**. 숫자를 여기 적지 않고 그 영웅 자료에서 읽는다
# (평타 사거리가 패치로 바뀌면 그림도 같이 따라간다).
YARDSTICK = (("Raynor", "공격 사거리", "레이너 평타"),
             ("SgtHammer", "공격 사거리(최대)", "해머 공성 모드"))


def yardsticks(files):
    have = {p.stem: p for p in files}
    o = {}
    for hid, key, label in YARDSTICK:
        p = have.get(hid)
        if not p:
            continue
        v = (json.loads(p.read_text(encoding="utf-8")).get("기본 수치") or {}).get(key)
        if v:
            o[label] = v
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
    small = minimap_icons()
    index, total = [], 0
    build = ""
    for f in files:
        # **영웅이 아닌 JSON 이 섞여 있을 수 있다.** 뽑기 폴더(`hots_xml/out/`)에는 사전
        # 점검 같은 딴 도구의 결과도 떨어진다(`fields.json`). 통째로 멎지 말고 건너뛰되,
        # 무엇을 건너뛰었는지는 **말한다** — 조용히 빠지면 영웅 하나가 사라져도 모른다.
        try:
            _d0 = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            print(f"   !! {f.name} — 못 읽어 건너뛴다")
            continue
        if not isinstance(_d0, dict) or "영웅" not in _d0:
            print(f"   !! {f.name} — 영웅 자료가 아니라 건너뛴다")
            continue
        d = _d0
        o = slim(d, f.stem, portraits)
        build = o["자료"]
        blob = json.dumps(o, ensure_ascii=False, separators=(",", ":"))
        (OUT / f.name).write_text(blob, encoding="utf-8")
        total += len(blob.encode("utf-8"))
        row = {"id": f.stem, "name": o["영웅"], "초상화": o["초상화"],
               "기술": len(o["기술"]), "특성": len(o["특성"])}
        role = (portraits.get(f.stem) or {}).get("role") or d.get("역할(XML)")   # 패치노트 목록에 아직 없는 새 영웅
        if ROLE_KO.get(role):
            row["역할"] = ROLE_KO[role]
        if small.get(o["영웅"]):
            row["작은아이콘"] = small[o["영웅"]]
        index.append(row)
    index.sort(key=lambda x: x["name"])
    _nr = [x["name"] for x in index if not x.get("역할")]
    _ni = [x["name"] for x in index if not x.get("작은아이콘")]
    if _nr or _ni:        # 하나라도 비면 화면에서 티가 난다 — 빌드 때 바로 말한다
        print(f"   !! 역할 없음 {len(_nr)}명 {_nr[:5]} · 작은아이콘 없음 {len(_ni)}명 {_ni[:5]}")
    (OUT / "index.json").write_text(
        json.dumps({"build": build, "heroes": index, "기준": yardsticks(files)}, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8")
    print(f"영웅 {len(index)}명 · {total / 1e6:.1f}MB → {OUT}  (한 영웅 평균 {total / len(index) / 1024:.0f}KB)")
    # 범위 구경 화면이 읽는 shapes.json 도 이 폴더에 산다. 위에서 폴더를 통째로 비우므로
    # **여기서 바로 이어 만들어야** 한다 — 따로 돌리는 걸 잊으면 그 화면이 404 가 된다.
    import build_shapes
    build_shapes.main()
    # 통계도 여기서 이어 만든다 — 이 함수가 폴더를 통째로 비우므로 따로 돌리면 잊는다
    import build_stats
    build_stats.main()
    return 0


if __name__ == "__main__":
    sys.exit(main())
