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
    # **꼬리로 견준다.** `k == base` 로만 보면 `투사체.최대 속도` 의 0 이 빠져나가
    # (base 가 '최대 속도' 라 '속도' 와 안 맞는다) 그레이메인 숨통을 노려라의 속도 0 이
    # 분포에 섞였다.
    if f == 0 and any(base == k or base.endswith(" " + k) for k in ZERO_KEYS):
        return "0 은 '없음' 이지 크기가 아니다"
    # **간격 0 은 '한꺼번에' 지 간격이 아니다**(갈 연발 어둠의 화살·가로쉬 대지파괴자).
    # 중앙값을 0.05 까지 끌어내리고 있었다.
    if f == 0 and base in ("간격", "주기"):
        return "0 은 '한꺼번에' 지 간격이 아니다"
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
RANK_ICON = {}                  # (영웅, 갈래, 자리 id) → 수치 순위 그림 — 기술은 아이콘 파일, 특성은 '레벨·순서'(16·3)
                                # 갈래까지 열쇠에 넣는다: 궁극기와 그 10레벨 특성은 자리 id 가 같다(특성이 아이콘을 덮었었다)
RANK_ROWS = defaultdict(list)          # 수치 순위용 — (무엇, 어떻게 나눔) → [대상 색인, 값]


# 레벨 칸(단계) 1~7 이 실제로는 1·4·7·10·13·16·20 레벨이다
TIER_LV = [1, 4, 7, 10, 13, 16, 20]


def short_tag(kind, slot, step):
    """**한눈에 알아보는 짧은 표** — 기술은 `Q`, 특성은 `16Lv3T`.

    이름만 늘어놓으면 "갈 뒤틀린 황천 기술" 처럼 길고 어느 자리 것인지도 안 보인다.
    자료에 이미 칸(`칸`)과 단계(`단계`)가 있으니 그걸 짧게 접어 앞에 세운다."""
    if kind == "기술":
        return str(slot or "")
    try:
        lv = TIER_LV[int(step) - 1]
    except (TypeError, ValueError, IndexError):
        return ""
    return f"{lv}Lv{slot}T" if slot else f"{lv}Lv"


def ent_id(ko, nm, kind, tag="", zid=""):
    """대상 한 줄 = [영웅, 이름, 갈래, 짧은 표, 도감 자리 id].
    **다섯째 칸(자리 id)은 통계 화면에서 그 줄을 눌러 도감의 그 기술·특성으로 바로 가는 데 쓴다**
    (도감 카드의 `data-zi` 와 같은 값). 앞 칸들은 그대로라 예전 읽는 쪽이 안 깨진다."""
    key = (ko, nm, kind, tag, zid)
    if key not in ENT_IX:
        ENT_IX[key] = len(ENTS)
        ENTS.append([ko, nm, kind] + ([tag, zid] if zid else ([tag] if tag else [])))
    return ENT_IX[key]


# ══ 수치 순위 — 단순하게 줄 세울 수 있는 수만 ═════════════════════════════════════
# 통계 보기의 셋째 탭. 칸 카탈로그(250가지)에는 말 칸 · 엔진 속 값 · 뜻이 섞인 칸이 다 들어 있어
# "큰 값부터" 가 뜻이 없는 것이 많다. 여기서는
#   ① 같은 단위 · 같은 뜻인 수만 남기고
#   ② 섞여 있으면 나눈다(감속 ↔ 가속 · 1회당 ↔ 한 번 · 기절 ↔ 감속 지속 · 일반 기술 ↔ 궁극기)
#   ③ 나눈 조각이 RANK_MIN 개 미만이거나 값이 RANK_KINDS 가지 미만이면 뺀다.
RANK = SRC / "stats-rank.json"
RANK_MIN, RANK_KINDS = 10, 3
# 그대로 쓰는 칸 — (갈래, 이름) → [보이는 이름, 큰 갈래, 작은 갈래, 단위]
RANK_PLAIN = [
    (("기본", "생명력"), "생명력", "생존", "생명력", ""),
    (("기본", "생명력 재생"), "생명력 재생(초당)", "생존", "생명력", ""),
    (("원자료", "거는 효과.피해 흡수"), "보호막 양", "생존", "보호막", ""),
    (("평타", "공격력"), "일반 공격 공격력", "공격", "일반 공격", ""),
    (("평타", "초당 공격"), "일반 공격 초당 횟수", "공격", "일반 공격", "회"),
    (("평타", "주기"), "일반 공격 주기", "공격", "일반 공격", "초"),
    (("평타", "사거리"), "일반 공격 사거리", "공격", "일반 공격", ""),
    (("위키식", "총 피해"), "기술 총 피해", "공격", "피해량", ""),
    (("특성 위키식", "총 피해"), "특성 총 피해", "공격", "피해량", ""),
    (("위키식", "틱당 피해"), "기술 틱당 피해", "공격", "피해량", ""),
    (("특성 위키식", "틱당 피해"), "특성 틱당 피해", "공격", "피해량", ""),
    (("위키식", "성장"), "기술 값 레벨당 성장", "공격", "레벨 성장", "%"),
    (("특성 위키식", "성장"), "특성 값 레벨당 성장", "공격", "레벨 성장", "%"),
    (("원자료", "회복.최대 생명력 비례 회복"), "최대 생명력 비례 회복", "회복", "생명력 회복", "%"),
    (("원자료", "회복.마나 회복량"), "마나 회복량", "회복", "자원 회복", ""),
    (("기술", "기력"), "기력 소모", "비용과 재사용", "자원", ""),
    (("기술", "충전 개수"), "충전 개수", "비용과 재사용", "재사용", "개"),
    (("기술", "마무리 시간"), "마무리 시간", "시간", "시전", "초"),
    (("위키식", "사거리"), "기술 사거리", "거리와 범위", "사거리", ""),
    (("특성 위키식", "사거리"), "특성 사거리", "거리와 범위", "사거리", ""),
    (("위키식", "최소 사거리"), "기술 최소 사거리", "거리와 범위", "사거리", ""),
    (("특성 위키식", "최소 사거리"), "특성 최소 사거리", "거리와 범위", "사거리", ""),
    (("위키식", "도형거리"), "기술 판정이 닿는 거리", "거리와 범위", "사거리", ""),
    (("특성 위키식", "도형거리"), "특성 판정이 닿는 거리", "거리와 범위", "사거리", ""),
    (("위키식", "끌기 범위"), "끌기 범위", "거리와 범위", "사거리", ""),
    (("위키식", "반지름"), "기술 범위 반지름", "거리와 범위", "범위 크기", ""),
    (("특성 위키식", "반지름"), "특성 범위 반지름", "거리와 범위", "범위 크기", ""),
    (("위키식", "너비"), "기술 판정 너비", "거리와 범위", "범위 크기", ""),
    (("특성 위키식", "너비"), "특성 판정 너비", "거리와 범위", "범위 크기", ""),
    (("위키식", "높이"), "기술 판정 길이", "거리와 범위", "범위 크기", ""),
    (("특성 위키식", "높이"), "특성 판정 길이", "거리와 범위", "범위 크기", ""),
    (("위키식", "각도"), "기술 부채꼴 각도", "거리와 범위", "범위 크기", "°"),
    (("특성 위키식", "각도"), "특성 부채꼴 각도", "거리와 범위", "범위 크기", "°"),
    (("위키식", "아군 반지름"), "기술 아군 범위 반지름", "거리와 범위", "범위 크기", ""),
    (("특성 위키식", "아군 반지름"), "특성 아군 범위 반지름", "거리와 범위", "범위 크기", ""),
    (("기본", "반지름"), "영웅 몸 반지름", "거리와 범위", "몸집과 시야", ""),
    (("기술", "이동 거리(추정)"), "기술 이동 거리(추정)", "움직임", "이동", ""),
    (("위키식", "질주 속도"), "질주 속도", "움직임", "이동", ""),
    (("위키식", "질주 거리"), "질주 거리", "움직임", "이동", ""),
    (("위키식", "투사체 속도"), "기술 투사체 속도", "움직임", "투사체", ""),
    (("특성 위키식", "투사체 속도"), "특성 투사체 속도", "움직임", "투사체", ""),
    (("위키식", "밀침 속도"), "기술 밀침 속도", "움직임", "밀침", ""),
    (("특성 위키식", "밀침 속도"), "특성 밀침 속도", "움직임", "밀침", ""),
    (("위키식", "밀침 지속"), "기술 밀침 시간", "움직임", "밀침", "초"),
    (("특성 위키식", "밀침 지속"), "특성 밀침 시간", "움직임", "밀침", "초"),
    (("위키식", "밀리는 거리"), "기술 밀리는 거리", "움직임", "밀침", ""),
    (("특성 위키식", "밀리는 거리"), "특성 밀리는 거리", "움직임", "밀침", ""),
    (("원자료", "순간이동.내려놓는 범위"), "순간이동 범위", "움직임", "순간이동", ""),
    (("원자료", "범위.최대 대상"), "최대 대상 수", "대상", "거르기와 수", "명"),
    (("위키식", "나오는 범위"), "기술 소환이 나오는 거리", "소환", "소환", ""),
    (("특성 위키식", "나오는 범위"), "특성 소환이 나오는 거리", "소환", "소환", ""),
]
# 기술 칸으로 나누는 칸 — 일반 기술(Q·W·E) · 궁극기(R) · 고유 능력(D) · 숫자 칸(1~4). 탈것(Z)은 뺀다
RANK_BY_SLOT = [
    (("기술", "재사용 대기시간"), "재사용 대기시간", "비용과 재사용", "재사용", "초"),
    (("기술", "마나"), "마나 소모", "비용과 재사용", "자원", ""),
]
# 고정된 양(점수)인 칸 — 1 보다 작은 값은 비율(다른 단위)이라 뺀다(안두인 0.08 · 카시아 방어력 0.625)
RANK_FLAT = {"보호막 양", "방어력 증가", "기술 총 피해", "특성 총 피해", "기술 틱당 피해", "특성 틱당 피해",
             "기술 피해량(한 번)", "기술 피해량(1회당 · 틱)", "생명력 회복량", "마나 회복량"}
# 보호막 · 회복 양의 '1' 은 실제 양을 다른 데서 셈한다는 자리값이다(줄 뼈 갑옷 · 데하카 정수 수집 · 가로쉬 피의 갈증)
RANK_PLACEHOLDER_ONE = {"보호막 양", "생명력 회복량"}
# 거는 효과 종류 → 보이는 이름
RANK_KIND_NAME = {"이동 속도": "이동 속도 증가", "방어력": "방어력 변화", "치유": "지속 치유"}


def 을를(w):
    """받침이 있으면 '을', 없으면 '를'."""
    c = ord(w[-1]) - 0xAC00
    return w + ("을" if 0 <= c < 11172 and c % 28 else "를")


def slot_group(tag):
    if tag in ("Q", "W", "E"):
        return "일반 기술(Q·W·E)"
    if tag.startswith("R"):
        return "궁극기(R)"
    if tag == "D":
        return "고유 능력(D)"
    if tag.startswith("액티브"):
        return "숫자 칸 기술(1~4)"
    return ""
# 뺀 칸과 까닭(카탈로그에는 그대로 있다)
RANK_WHY = [
    ("값이 거의 하나뿐이라 줄 세울 게 없음", ["기본|시야", "기본|이동 속도", "원자료|소환.마리 수"]),
    ("같은 값을 두 번 읽음 — 위키식 칸 하나로 셈",
     ["기술|사거리", "기술|최소 사거리", "기본|공격 사거리", "원자료|범위.반지름", "원자료|범위.가로", "원자료|범위.세로",
      "원자료|범위.부채꼴", "기술|부채꼴", "원자료|투사체.최대 속도", "원자료|투사체.속도", "원자료|투사체.최소 속도",
      "원자료|밀침.속도", "원자료|밀침.지속 시간", "원자료|밀침.거리", "원자료|소환.나오는 범위",
      "원자료|피해.툴팁 표기", "원자료|회복.툴팁 표기"]),
    ("엔진 속 값 — 견줄 뜻이 없음",
     ["원자료|거는 효과.주기", "원자료|지속 효과.반복 횟수", "원자료|지속 효과.간격", "원자료|지속 효과.유지 시간",
      "원자료|지속 효과.앞으로", "원자료|투사체.가속도", "기술|연타 제한", "원자료|범위.날아가며", "원자료|범위.방향",
      "원자료|범위.단계", "원자료|범위.부른 횟수", "원자료|범위.커지는 양", "원자료|범위.작은 반지름",
      "원자료|순간이동.내려놓는 각도", "특성|레벨", "원자료|툴팁 수치.값"]),
    ("뜻이 섞이거나 분명하지 않아 한 줄로 못 세움",
     ["원자료|재사용 조정.재사용 조정", "원자료|지속 시간 조정.지속 시간 조정", "원자료|퀘스트로 바뀜.전",
      "원자료|퀘스트로 바뀜.값", "원자료|퀘스트 점수.한 번에", "특성 위키식|전거리", "위키식|피해"]),
]


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

    def add(self, v, ko, nm, kind="기술", tag="", zid=""):
        f = num(v)
        if f is not None:
            why = drop_reason(self.name, f)
            if why:
                self.dropped[why] += 1
                if len(self.drop_ex) < 3:
                    self.drop_ex.append([ko, nm, str(v)[:24]])
                return
        self.n += 1
        self.rows.append([ent_id(ko, nm, kind, tag, zid),
                          f if f is not None else str(v)[:30]])
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
    # 역할·작은 아이콘은 도감 index 가 이미 들고 있다(두 군데서 만들지 않는다)
    _ix = SRC / "index.json"
    META = {}
    if _ix.exists():
        META = {h["id"]: h for h in json.loads(_ix.read_text(encoding="utf-8"))["heroes"]}
    heroes, fields = [], {}
    RANK_ROWS.clear()
    RANK_ICON.clear()
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
        _m = META.get(fn.stem) or {}
        if _m.get("역할"):
            row["역할"] = _m["역할"]
        if _m.get("작은아이콘"):
            row["_아이콘"] = _m["작은아이콘"]      # 화면에만 쓰는 값 — 통계로 안 센다
        for k, v in base.items():
            # **`공격 사거리(최대)` 는 표에 안 올린다.** 넷뿐이라 87칸이 '–' 로 비는데,
            # 그 넷도 보통 사거리를 따로 들고 있어 표에서는 군더더기다(카탈로그엔 남는다).
            if k != "공격 사거리(최대)":
                row[k] = v
            fld("기본", k).add(v, ko, "기본 수치", "영웅")
        for k, v in wep.items():
            if k in ("출처", "이름"):
                continue
            row["평타 " + k] = v
            fld("평타", k).add(v, ko, wep.get("이름") or "평타", "영웅")
        # **초당 피해는 자료에 없다 — 곱해서 낸다.** 공격력만으로는 주기 1.1 짜리
        # 누더기와 0.6 짜리 발라를 견줄 수 없다. 읽은 값이 아니라 **센 값**이라
        # 카탈로그(원본에서 읽히는 항목)에는 올리지 않고 표에만 둔다.
        _dmg, _aps = wep.get("공격력"), wep.get("초당 공격")
        if isinstance(_dmg, (int, float)) and isinstance(_aps, (int, float)):
            row["평타 초당 피해"] = round(_dmg * _aps, 1)
        heroes.append(row)

        # ── 기술 ────────────────────────────────────────────────────
        for a in d.get("기술") or []:
            tot["기술"] += 1
            nm = a.get("이름") or ""
            _tag = short_tag("기술", a.get("칸"), None)
            _zid = a.get("id") or ""
            if a.get("아이콘"):
                RANK_ICON[(ko, "기술", _zid)] = a["아이콘"]
            for k, v in a.items():
                if k in SKIP or v in (None, "", [], {}):
                    continue
                if isinstance(v, list) and v and isinstance(v[0], dict):
                    for r in v:
                        for kk, vv in r.items():
                            if kk in SKIP or vv in (None, "", [], {}) or isinstance(vv, (list, dict)):
                                continue
                            fld("원자료", f"{k}.{kk}").add(vv, ko, nm, "기술", _tag, _zid)
                elif not isinstance(v, (list, dict)):
                    fld("기술", k).add(v, ko, nm, "기술", _tag, _zid)
            for k, v in (a.get("위키식") or {}).items():
                if k in SKIP or v in (None, "", [], {}) or isinstance(v, (list, dict)):
                    continue
                fld("위키식", k).add(v, ko, nm, "기술", _tag, _zid)
            # ── 수치 순위용 — 같은 줄 옆 칸으로 나눈다
            for r in a.get("피해") or []:
                x = num(r.get("피해량"))
                if x and x > 0:
                    if r.get("종류") == "기술 피해":
                        RANK_ROWS[("피해", "1회당" if r.get("1회당") else "한 번")].append([ent_id(ko, nm, "기술", _tag, _zid), x])
                    else:
                        RANK_ROWS[("피해", "다른 단위:" + str(r.get("종류")))].append([ent_id(ko, nm, "기술", _tag, _zid), x])
            for r in a.get("회복") or []:
                x = num(r.get("생명력 회복량"))
                if x and x > 0:
                    RANK_ROWS[("회복", "1회당" if r.get("1회당") else "한 번")].append([ent_id(ko, nm, "기술", _tag, _zid), x])
            for r in a.get("거는 효과") or []:
                dur, kind = num(r.get("지속 시간")), r.get("종류")
                if dur and dur > 0:
                    RANK_ROWS[("지속", kind or "")].append([ent_id(ko, nm, "기술", _tag, _zid), dur])
                for k2 in ("이동 속도", "방어력", "공격 속도"):
                    x = num(r.get(k2))
                    if x:
                        RANK_ROWS[(k2, "+" if x > 0 else "-")].append([ent_id(ko, nm, "기술", _tag, _zid), abs(x)])

        # ── 특성 ────────────────────────────────────────────────────
        _lvn = Counter()                # 레벨마다 몇 번째인가 — 자료의 차례가 게임 화면의 차례다
        for t in d.get("특성") or []:
            tot["특성"] += 1
            nm = t.get("이름") or ""
            _tag = short_tag("특성", t.get("칸"), t.get("단계"))
            _zid = t.get("id") or nm
            if t.get("레벨"):
                _lvn[t["레벨"]] += 1
                RANK_ICON[(ko, "특성", _zid)] = f"{t['레벨']}·{_lvn[t['레벨']]}"
            for k, v in t.items():
                if k in SKIP or v in (None, "", [], {}) or isinstance(v, (list, dict)):
                    continue
                fld("특성", k).add(v, ko, nm, "특성", _tag, _zid)
            for k, v in (t.get("위키식") or {}).items():
                if k in SKIP or v in (None, "", [], {}) or isinstance(v, (list, dict)):
                    continue
                fld("특성 위키식", k).add(v, ko, nm, "특성", _tag, _zid)

    # 갈래마다 '모수' 가 다르다 — 덮음(%)을 제대로 내려면 각자 세어야 한다
    DENOM = {"기본": tot["영웅"], "평타": tot["영웅"], "기술": tot["기술"],
             "위키식": tot["기술"], "원자료": tot["기술"],
             "특성": tot["특성"], "특성 위키식": tot["특성"]}
    rows = [f.dump(DENOM.get(f.group, 1)) for f in fields.values()]
    # **딱 하나만 잡히는 칸은 통계가 아니다.** 최소·중앙·최대가 다 같은 수 하나고
    # 막대도 한 칸뿐이라, 카탈로그에 끼면 "볼 게 있나" 싶어 열었다가 허탕 친다.
    # 센 김에 몇 개를 뺐는지는 화면에 적어 둔다(숨긴 게 아니라 뺀 것이다).
    lone = [r["이름"] for r in rows if r["수"] <= 1]
    rows = [r for r in rows if r["수"] > 1]
    rows.sort(key=lambda r: (r["갈래"], -r["수"]))

    drops = Counter()
    for f in fields.values():
        drops.update(f.dropped)
    out = {"자료": "", "센 것": dict(tot), "칸 수": len(rows),
           "뺀 것": drops.most_common(), "하나뿐": sorted(lone),
           "영웅": heroes, "칸": rows}
    idx = SRC / "index.json"
    if idx.exists():
        out["자료"] = json.loads(idx.read_text(encoding="utf-8")).get("build", "")
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    ROWS.write_text(json.dumps(
        {"대상": ENTS, "칸": {f"{f.group}|{f.name}": f.rows for f in fields.values()
                             if len(f.rows) > 1}},
        ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    build_rank(fields, out["자료"])
    kb = OUT.stat().st_size // 1024
    print(f"   표본이 하나뿐이라 뺀 칸 {len(lone)}가지")
    print(f"칸 {len(rows)}가지 · 영웅 {tot['영웅']} · 기술 {tot['기술']} · 특성 {tot['특성']}"
          f" · {kb}KB → {OUT}")
    print(f"   값 목록 {sum(len(f.rows) for f in fields.values())}줄 · 대상 {len(ENTS)}가지"
          f" · {ROWS.stat().st_size // 1024}KB → {ROWS.name}")
    by = Counter(r["갈래"] for r in rows)
    print("   " + " · ".join(f"{k} {v}" for k, v in by.most_common()))
    if drops:
        print("   뺀 것 — " + " · ".join(f"{k} {v}개" for k, v in drops.most_common()))
    return 0


def build_rank(fields, build):
    """줄 세울 수 있는 수만 모은 `stats-rank.json`. 대상 표는 값 목록(`stats-rows.json`)의 것을 함께 쓴다."""
    out, small, splits = [], [], []

    def summary(rows):
        s = sorted(v for _, v in rows)
        o = {"최소": s[0], "중앙": s[len(s) // 2], "최대": s[-1], "평균": round(sum(s) / len(s), 3)}
        lo, hi = s[0], s[-1]
        bars = None
        if hi > lo:
            step = (hi - lo) / BOX
            b = [0] * BOX
            for x in s:
                b[min(BOX - 1, int((x - lo) / step))] += 1
            bars = {"처음": lo, "칸": round(step, 4), "수": b}
        return o, bars

    def add(key, name, big, sub, unit, how, rows):
        rows = [[e, v] for e, v in rows if isinstance(v, (int, float))]
        cut = []
        if name in RANK_FLAT:
            n0 = len(rows); rows = [r for r in rows if r[1] >= 1]
            if len(rows) < n0:
                cut.append(["1 보다 작은 값 — 비율이라 단위가 다름", n0 - len(rows)])
        if name in RANK_PLACEHOLDER_ONE:
            n0 = len(rows); rows = [r for r in rows if r[1] != 1]
            if len(rows) < n0:
                cut.append(["값 1 — 실제 양은 다른 데서 셈하는 자리값", n0 - len(rows)])
        if len(rows) < RANK_MIN or len({v for _, v in rows}) < RANK_KINDS:
            small.append([name, len(rows), len({v for _, v in rows})])
            return False
        o, bars = summary(rows)
        m = {"열쇠": "순위|" + key, "이름": name, "큰": big, "작": sub, "단위": unit, "풀이": how,
             "수": len(rows), "꼴": "수", "요약": o, "값": rows}
        if bars:
            m["막대"] = bars
        if cut:
            m["뺀 값"] = cut
        out.append(m)
        return True

    def frows(g, n):
        f = fields.get((g, n))
        return [r for r in (f.rows if f else []) if isinstance(r[1], (int, float))]

    for (g, n), name, big, sub, unit in RANK_PLAIN:
        add(f"{g}|{n}", name, big, sub, unit, "", frows(g, n))
    # 즉시 시전(0초)은 줄 세울 게 아니다 — 시간이 있는 것만
    add("기술|시전 시간>0", "시전 시간(즉시 아닌 기술)", "시간", "시전", "초", "누르자마자 나가는 0초짜리 기술은 뺐습니다.",
        [r for r in frows("기술", "시전 시간") if r[1] > 0])
    for (g, n), name, big, sub, unit in RANK_BY_SLOT:
        by = defaultdict(list)
        for e, v in frows(g, n):
            sg = slot_group(ENTS[e][3] if len(ENTS[e]) > 3 else "")
            if sg:
                by[sg].append([e, v])
        made = [k for k in by if add(f"{g}|{n}|{k}", f"{name} — {k}", big, sub, unit,
                                     f"{k}끼리만 견줍니다 — 궁극기와 일반 기술은 쓰임이 달라 칸마다 나눴습니다.", by[k])]
        splits.append([name, [f"{name} — {k}" for k in made], [f"{k} {len(by[k])}개 — 너무 작아 뺌" for k in by if k not in made] + ["탈것(Z) — 줄 세울 게 없어 뺌"]])
    # 같은 줄 옆 칸으로 나눈 것
    add("피해|한 번", "기술 피해량(한 번)", "공격", "피해량", "", "한 번에 들어가는 기술 피해입니다. 여러 번 나눠 들어가는 피해의 1회분은 따로 셉니다.", RANK_ROWS[("피해", "한 번")])
    add("피해|1회당", "기술 피해량(1회당 · 틱)", "공격", "피해량", "", "여러 번 나눠 들어가는 피해의 1회분입니다. 한 번에 들어가는 피해는 따로 셉니다.", RANK_ROWS[("피해", "1회당")])
    other = [k[1] for k in RANK_ROWS if k[0] == "피해" and k[1].startswith("다른 단위:")]
    splits.append(["기술 피해량", ["기술 피해량(한 번)", "기술 피해량(1회당 · 틱)"],
                   [f"{o.split(':', 1)[1]} {len(RANK_ROWS[('피해', o)])}개 — 기술 피해와 달라 뺌" for o in other]])
    add("회복|한 번", "생명력 회복량", "회복", "생명력 회복", "", "한 번에 채우는 양입니다. 여러 번 나눠 채우는 1회분은 너무 적어 뺐습니다.", RANK_ROWS[("회복", "한 번")])
    splits.append(["생명력 회복량", ["생명력 회복량"], [f"1회당 {len(RANK_ROWS[('회복', '1회당')])}개 — 너무 작아 뺌"]])
    kinds = sorted({k[1] for k in RANK_ROWS if k[0] == "지속"}, key=lambda x: -len(RANK_ROWS[("지속", x)]))
    made, left = [], []
    for kd in kinds:
        if not kd:
            left.append(f"종류 없는 {len(RANK_ROWS[('지속', '')])}개 — 엔진 속 버프라 뺌")
            continue
        if add(f"지속|{kd}", f"{RANK_KIND_NAME.get(kd, kd)} 지속 시간", "시간", "지속", "초",
               f"기술·특성이 거는 '{RANK_KIND_NAME.get(kd, kd)}' 효과가 걸려 있는 시간입니다. 효과 종류마다 따로 셉니다.", RANK_ROWS[("지속", kd)]):
            made.append(RANK_KIND_NAME.get(kd, kd))
        else:
            left.append(f"{kd} {len(RANK_ROWS[('지속', kd)])}개 — 너무 작아 뺌")
    splits.append(["거는 효과의 지속 시간", [f"{k} 지속 시간" for k in made], left])
    for k2, plus, minus, big, sub in (("이동 속도", "이동 속도 증가", "감속 정도", "상태 효과", "속도 변화"),
                                      ("방어력", "방어력 증가", "방어력 감소", "생존", "방어"),
                                      ("공격 속도", "공격 속도 증가", "공격 속도 감소", "상태 효과", "속도 변화")):
        a = add(f"{k2}|+", plus, big, sub, "%", f"{을를(k2)} 올리는 효과만 셉니다. 내리는 효과는 따로 셉니다.", RANK_ROWS[(k2, "+")])
        b = add(f"{k2}|-", minus, big, sub, "%", f"{을를(k2)} 내리는 효과만, 내린 크기로 셉니다.", RANK_ROWS[(k2, "-")])
        splits.append([f"{k2} 변화", [x for x, ok in ((plus, a), (minus, b)) if ok],
                       [f"{x} {len(RANK_ROWS[(k2, s)])}개 — 너무 작아 뺌" for x, ok, s in ((plus, a, "+"), (minus, b, "-")) if not ok]])
    why = [[w, ks] for w, ks in RANK_WHY]
    # **순위 줄이 쓰는 대상만 따로 싣는다.** 값 목록(923KB)을 받지 않아도 순위 탭이 선다.
    # 한 줄 = [영웅, 이름, 갈래, 짧은 표, 자리 id, 그림] — 앞 다섯 칸은 값 목록의 대상과 같은 꼴.
    # 그림은 기술이면 아이콘 파일, 특성이면 '레벨·순서'(16·3 = 16레벨 셋째), 영웅 수치면 빈칸(얼굴을 쓴다)
    used, remap = [], {}
    for m in out:
        for r in m["값"]:
            e = r[0]
            if e not in remap:
                remap[e] = len(used)
                x = (ENTS[e] + ["", ""])[:5]
                used.append(x + [RANK_ICON.get((x[0], x[2], x[4]), "")])
            r[0] = remap[e]
    RANK.write_text(json.dumps({"자료": build, "기준": {"최소 개수": RANK_MIN, "최소 값 가짓수": RANK_KINDS},
                                "대상": used, "줄": out, "나눈 것": splits, "뺀 것": why, "작아서 뺀 것": small},
                               ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"   수치 순위 {len(out)}가지 · {sum(m['수'] for m in out)}줄 · 대상 {len(used)} · {RANK.stat().st_size // 1024}KB → {RANK.name}"
          f" · 작아서 뺀 것 {len(small)}")


if __name__ == "__main__":
    raise SystemExit(main())
