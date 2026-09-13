# -*- coding: utf-8 -*-
"""Step T4. 번역 결과 점검 → raw/translate/report.json (+ 문제 항목 재번역 묶음)

확인하는 것
  누락      : segments 에 있는데 번역이 없는 id
  빈 값     : ko 가 비었거나 공백
  태그 불일치: 원문과 태그 이름/개수가 다름 (<span class="pn-new"> 같은 구조가 깨지면 화면이 무너진다)
  숫자 불일치: 원문에 있던 숫자 집합이 번역에 없음 (수치 오역 방지)
  미번역    : 한글이 하나도 없음 (영문 그대로 복사)
문제 항목은 raw/translate/chunks_fix/chunk_fixNNN.json 으로 다시 묶어 재번역할 수 있게 한다.

사용: python verify_translation.py [--fix-chars 6000]
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TR = ROOT / "raw" / "translate"
GLOSS = ROOT / "site" / "data" / "patchnotes" / "glossary.json"
TAG = re.compile(r"<\s*/?\s*([a-zA-Z0-9]+)")
NUM = re.compile(r"\d+(?:\.\d+)?")
HANGUL = re.compile(r"[가-힣]")


def tags(s):
    return [t.lower() for t in TAG.findall(s or "")]


def nums(s):
    """비교용 숫자 집합. .5 → 0.5, 1,000 → 1000 처럼 표기 차이는 같게 본다."""
    t = re.sub(r"(\d),(\d{3})", r"\1\2", s or "")
    t = re.sub(r"(?<![\d.])\.(\d)", r"0.\1", t)
    out = set()
    for v in NUM.findall(t):
        f = float(v)
        out.add(str(int(f)) if f.is_integer() else str(f))
    return out


def load_out():
    """번역 메모리(원문 → 번역)"""
    f = TR / "memory.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix-chars", type=int, default=6000)
    a = ap.parse_args()
    segs = json.loads((TR / "segments.json").read_text(encoding="utf-8"))["items"]
    table = load_out()
    gl = json.loads(GLOSS.read_text(encoding="utf-8")) if GLOSS.exists() else {}
    terms = {}
    for sec in ("heroes", "abilities", "talents", "battlegrounds"):
        for en, ko in (gl.get(sec) or {}).items():
            terms.setdefault(en, ko)

    bad, reasons = [], {"missing": 0, "empty": 0, "tags": 0, "nums": 0, "nohangul": 0, "glossary": 0}
    gl_hits = []
    for s in segs:
        i, en = s["id"], s["en"]
        ko = table.get(en)
        why = None
        if ko is None:
            why = "missing"
        elif not ko:
            why = "empty"
        elif tags(en) != tags(ko):
            why = "tags"
        elif nums(en) - nums(ko):  # 원문 숫자가 번역에서 빠진 경우만 (번역이 숫자를 더 쓰는 건 정상: twice→2배)
            why = "nums"
        elif not HANGUL.search(ko) and HANGUL.search("") is None and re.search(r"[A-Za-z]{3,}", en):
            why = "nohangul"
        if why:
            reasons[why] += 1
            bad.append({"id": i, "en": en, "why": why, "ko": ko})
            continue
        # 용어집 준수(경고만): 원문에 공식 이름이 있으면 번역에도 그 한글이 있어야 자연스럽다
        for t, kot in terms.items():  # 여러 단어로 된 고유명사만 (Storm, Charge 같은 일반 단어 제외)
            if (" " in t or len(t) >= 9) and t in en and kot not in ko:
                gl_hits.append({"id": i, "term": t, "ko_term": kot})
                break

    ok = len(segs) - len(bad)
    print(f"점검: 전체 {len(segs)} · 정상 {ok} · 문제 {len(bad)}  {reasons}")
    print(f"용어집과 다르게 옮긴 듯한 항목(경고) {len(gl_hits)}건")
    (TR / "report.json").write_text(json.dumps({
        "total": len(segs), "ok": ok, "bad": len(bad), "reasons": reasons,
        "glossary_warnings": gl_hits[:200], "items": bad}, ensure_ascii=False, indent=1), encoding="utf-8")

    fix = TR / "chunks_fix"
    fix.mkdir(exist_ok=True)
    for f in fix.glob("*.json"):
        f.unlink()
    if bad:
        keys = sorted(terms, key=len, reverse=True)
        cur, size, n = [], 0, 0
        def flush():
            nonlocal cur, size, n
            if not cur:
                return
            n += 1
            blob = " ".join(x["en"] for x in cur).lower()
            g = {k: terms[k] for k in keys if k.lower() in blob}
            (fix / f"chunk_fix{n:03d}.json").write_text(json.dumps(
                {"chunk": f"fix{n:03d}", "glossary": g,
                 "items": [{"id": x["id"], "en": x["en"], "problem": x["why"], "previous": x["ko"]} for x in cur]},
                ensure_ascii=False, indent=1), encoding="utf-8")
            cur, size = [], 0
        for b in bad:
            cur.append(b)
            size += len(b["en"])
            if size >= a.fix_chars:
                flush()
        flush()
        print(f"재번역 묶음 {n}개 → {fix}")


if __name__ == "__main__":
    main()
