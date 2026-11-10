# -*- coding: utf-8 -*-
"""Step T2b. 사람·Claude 손을 거치기 전의 **자동 초벌 번역** → raw/translate/auto.json

공식 한글판이 없는 영문 노트(라이브·테스트 서버)를 바로 한국어로 보여 주기 위한 것.
기계 번역기를 부르지 않는다 — 이미 아는 것만 옮긴다:
  1. 번역 메모리(raw/translate/memory.json)에 같은 문장이 있으면 그대로
  2. 이름만 있는 줄(기술·특성·영웅·전장) → 공식 용어집(glossary.json, 게임 enus↔kokr)
     <strong>이름 [Q]</strong> 처럼 태그·단축키가 붙은 것도
  3. 정형 수치 문장 — "X increased/reduced from A to B[ seconds]." · "X increased/reduced by N%."
     X 의 한국어는 메모리 속 같은 꼴 문장들에서 **배워 온다**(예: Detonation damage → 폭발 피해량).
     못 배운 X 는 용어집으로, 그래도 모르면 옮기지 않는다.
모르는 문장은 비워 둔다(영어 원문이 그대로 보인다). 틀린 한국어보다 영어가 낫다.

결과는 번역 메모리에 **섞지 않는다**(out/ 밖에 둔다). apply_translation 이 메모리에 없는 문장만 이것으로
채우고 문서에 "auto" 수를 적는다. 그래서 Claude 번역 차례(make_chunks)에는 이 문장들이 여전히 할 일로 잡히고,
Claude 가 옮기면 메모리 번역이 초벌을 이긴다. 매번 새로 만든다.

사용: python pretranslate.py            (make_chunks 가 만든 chunks/*.json 의 문장을 대상으로)
      python pretranslate.py --report   (무엇을 옮겼고 무엇을 남겼는지 출력)
"""
import argparse
import glob
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TR = ROOT / "raw" / "translate"
GLOSS = ROOT / "site" / "data" / "patchnotes" / "glossary.json"
OUT = TR / "auto.json"  # out/ 밖 — merge_translation 이 메모리에 섞지 않게

NUM = r"(-?\d+(?:\.\d+)?)"
UNIT_EN = r"(%| seconds?| second)?"
RX_FROM = re.compile(rf"^(.+?) (increased|reduced|decreased) from {NUM}{UNIT_EN} to {NUM}{UNIT_EN}\.$")
RX_BY = re.compile(rf"^(.+?) (increased|reduced|decreased) by {NUM}(%| seconds?)\.$")
RX_KO_FROM = re.compile(r"^(.+?)[이가] (-?[\d.]+)(%|초)?에서 (-?[\d.]+)(%|초)?(?:으로|로) (증가|감소)했습니다\.$")
RX_KO_BY = re.compile(r"^(.+?)[이가] (-?[\d.]+)(%|초) (증가|감소)했습니다\.$")
NAME_TAG = re.compile(r"^(<strong(?: class=\"[^\"]*\")?>)(.+?)(?: \[([A-Z]|Heroic|Trait|D|1|2|3|4|5)\])?(</strong>)$")
KEYS = {"Q": "Q", "W": "W", "E": "E", "R": "R", "D": "D", "Heroic": "R", "Trait": "D"}


def has_batchim(word):
    """마지막 글자의 받침 유무. 한글이 아니면(숫자·영문) 숫자 읽기로 본다."""
    for ch in reversed(word.strip()):
        if "가" <= ch <= "힣":
            return (ord(ch) - 0xAC00) % 28 != 0
        if ch.isdigit():
            return ch in "0136" if ch != "0" else True
        if ch in "%":
            return False  # 퍼센트
        if ch.isalpha():
            return False
    return False


def rieul(word):
    for ch in reversed(word.strip()):
        if "가" <= ch <= "힣":
            return (ord(ch) - 0xAC00) % 28 == 8
        if ch.isdigit():
            return ch in "178"
    return False


def i_ga(w):
    return w + ("이" if has_batchim(w) else "가")


def ro(w):
    """(으)로 — 받침 없거나 ㄹ 받침이면 '로'."""
    return w + ("으로" if has_batchim(w) and not rieul(w) else "로")


def num_ko(n, unit):
    u = (unit or "").strip()
    if u.startswith("second"):
        return n + "초"
    return n + ("%" if u == "%" else "")


def learn_subjects(mem):
    """메모리 속 정형 문장 짝에서 X(영) → X(한) 을 배운다. 여러 번 본 것 중 가장 흔한 것."""
    seen = {}
    for en, ko in mem.items():
        m, k = RX_FROM.match(en), RX_KO_FROM.match(ko)
        if not (m and k):
            m, k = RX_BY.match(en), RX_KO_BY.match(ko)
        if not (m and k):
            continue
        x_en, x_ko = m.group(1).strip(), k.group(1).strip()
        if "<" in x_en or len(x_ko) > 40:
            continue
        seen.setdefault(x_en.lower(), {}).setdefault(x_ko, 0)
        seen[x_en.lower()][x_ko] += 1
    return {x: max(c.items(), key=lambda kv: kv[1])[0] for x, c in seen.items()}


def subject_ko(x, subj, gloss_l):
    x0 = x.strip()
    if x0.lower() in subj:
        return subj[x0.lower()]
    if x0.lower() in gloss_l:
        return gloss_l[x0.lower()]
    # "Shadow Mark damage" 처럼 이름 + 아는 꼬리
    for i in range(len(x0.split()) - 1, 0, -1):
        head, tail = " ".join(x0.split()[:i]), " ".join(x0.split()[i:])
        if head.lower() in gloss_l and tail.lower() in subj:
            return f"{gloss_l[head.lower()]}의 {subj[tail.lower()]}"
    return None


ATTR = re.compile(r"<([a-zA-Z0-9]+)(\s[^>]*)?>")
MONTHS = {m: i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August",
                                       "September", "October", "November", "December"], 1)}
RX_TITLE = re.compile(r"^Heroes of the Storm (PTR |Live |Balance )?Patch Notes\s*[-–—]\s*([A-Z][a-z]+) (\d{1,2}), (\d{4})$")
TITLE_KO = {"PTR ": "공개 테스트 서버 패치 노트", "Live ": "라이브 패치 노트", "Balance ": "밸런스 패치 노트", None: "패치 노트"}


def strip_attrs(s):
    return ATTR.sub(lambda m: f"<{m.group(1)}>", s)


def attrs_of(s):
    return [m.group(2) or "" for m in ATTR.finditer(s)]


def mem_by_shape(mem):
    """태그 속성(링크 주소·class)을 뺀 꼴 → 번역. 주소만 바뀐 상투 문장(포럼 안내 등)을 다시 쓰려고."""
    out = {}
    for en, ko in mem.items():
        if "<" in en and len(attrs_of(en)) == len(attrs_of(ko)):
            out.setdefault(strip_attrs(en), ko)
    return out


def from_shape(s, shape):
    ko = shape.get(strip_attrs(s))
    if not ko:
        return None
    want = iter(attrs_of(s))
    return ATTR.sub(lambda m: f"<{m.group(1)}{next(want, '')}>", ko)


def translate(en, mem, subj, gloss_l, shape=None):
    s = en.strip()
    if s in mem:
        return None  # 이미 번역이 있다 — 여기서 손대지 않는다
    if shape is not None and "<" in s:
        ko = from_shape(s, shape)
        if ko:
            return ko
    m = RX_TITLE.match(s)
    if m and m.group(2) in MONTHS:
        return f"히어로즈 오브 더 스톰 {TITLE_KO[m.group(1)]} - {m.group(4)}년 {MONTHS[m.group(2)]}월 {int(m.group(3))}일"
    if s.lower() in gloss_l:
        return gloss_l[s.lower()]
    m = NAME_TAG.match(s)
    if m and m.group(2).lower() in gloss_l:
        key = f" [{m.group(3)}]" if m.group(3) else ""
        return f"{m.group(1)}{gloss_l[m.group(2).lower()]}{key}{m.group(4)}"
    m = RX_FROM.match(s)
    if m:
        x, verb, a, ua, b, ub = m.groups()
        xk = subject_ko(x, subj, gloss_l)
        if not xk:
            return None
        ua = ua or ub if (ub or "").strip().startswith("second") else ua
        a_k, b_k = num_ko(a, ua), num_ko(b, ub)
        v = "증가" if verb == "increased" else "감소"
        return f"{i_ga(xk)} {a_k}에서 {ro(b_k)} {v}했습니다."
    m = RX_BY.match(s)
    if m:
        x, verb, n, u = m.groups()
        xk = subject_ko(x, subj, gloss_l)
        if not xk:
            return None
        v = "증가" if verb == "increased" else "감소"
        return f"{i_ga(xk)} {num_ko(n, u)} {v}했습니다."
    return None


def game_names():
    """가장 최신 빌드(테스트 서버 포함)의 게임 문자열에서 이름 영↔한 짝. 새 영웅도 여기서 잡힌다.
    용어집(glossary.json)은 옛 자료로 만들어 새 영웅이 없다. 빌드 원본이 없으면(서버 등) 빈 사전."""
    try:
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import build_talent_data as B
        rows = json.loads((ROOT / "site" / "data" / "patchnotes" / "builds.json").read_text(encoding="utf-8-sig"))
        latest = max(rows, key=lambda b: (b["build"], b["isPtr"]))
        ver = latest["version"] + ("_ptr" if latest["isPtr"] else "")
        _, en = B.resolve(ver, "enus")
        _, ko = B.resolve(ver, "kokr")
    except BaseException as e:  # resolve 는 SystemExit 로 멈춘다
        print(f"  (게임 이름 사전 없이 진행: {e})")
        return {}
    out = {}
    for sec in ("hero", "ability", "talent", "unit"):
        ne = ((en.get("items") or {}).get(sec) or {}).get("name") or {}
        nk = ((ko.get("items") or {}).get(sec) or {}).get("name") or {}
        for key, e in ne.items():
            k = nk.get(key)
            if isinstance(e, str) and isinstance(k, str) and e and k and "<" not in e:
                out.setdefault(e.lower(), {}).setdefault(k, 0)
                out[e.lower()][k] += 1
    # 같은 영어 이름이 여러 한국어로 갈리면(다른 영웅의 같은 이름 기술) 쓰지 않는다 — 틀린 이름보다 영어가 낫다
    return {e: next(iter(c)) for e, c in out.items() if len(c) == 1}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true")
    a = ap.parse_args()
    mem = json.loads((TR / "memory.json").read_text(encoding="utf-8")) if (TR / "memory.json").exists() else {}
    gl = json.loads(GLOSS.read_text(encoding="utf-8-sig")) if GLOSS.exists() else {}
    gloss_l = game_names()  # 최신 게임 이름이 먼저
    for sec in ("heroes", "units", "abilities", "talents", "battlegrounds", "common"):
        for k, v in (gl.get(sec) or {}).items():
            if isinstance(v, str) and v:
                gloss_l.setdefault(k.lower(), v)
    subj = learn_subjects(mem)
    shape = mem_by_shape(mem)
    want = []
    for f in sorted(glob.glob(str(TR / "chunks" / "chunk_*.json"))):
        d = json.loads(Path(f).read_text(encoding="utf-8"))
        want += [it["en"] for it in d.get("items", [])]
    items, left = [], []
    for en in dict.fromkeys(want):
        ko = translate(en, mem, subj, gloss_l, shape)
        (items if ko else left).append({"en": en, "ko": ko} if ko else en)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"by": "pretranslate.py", "items": items},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"초벌 번역 {len(items)} / 대상 {len(items) + len(left)} (배운 수치 문장 주어 {len(subj)}개) → {OUT}")
    if a.report:
        for it in items:
            print("  +", it["en"][:70], "=>", it["ko"][:70])
        for en in left:
            print("  -", en[:110])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
