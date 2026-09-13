# -*- coding: utf-8 -*-
"""Step T3. 아직 번역이 없는 문장만 묶음으로 나누기 → raw/translate/chunks/chunk_NNN.json

번역은 순번이 아니라 **원문 문장** 으로 보관한다(raw/translate/memory.json = {원문: 번역}).
그래야 수집·파싱이 바뀌어 문장 목록이 달라져도 기존 번역이 어긋나지 않는다.

묶음마다 그 안에 실제로 나오는 공식 용어(영웅·기술·특성·전장·일반)만 골라 함께 넣는다.

  chunk_NNN.json = {"chunk": 3, "glossary": {"Envenomed Nests": "맹독 둥지", ...},
                    "items": [{"en": "…원문…"}, …]}

사용: python make_chunks.py [--chars 9000] [--all]
      --all 은 이미 번역된 문장까지 다시 묶는다(전면 재번역용)
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TR = ROOT / "raw" / "translate"
GLOSS = ROOT / "site" / "data" / "patchnotes" / "glossary.json"


def load_memory():
    f = TR / "memory.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chars", type=int, default=9000, help="묶음당 원문 글자 수 목표")
    ap.add_argument("--all", action="store_true", help="이미 번역된 문장도 포함")
    a = ap.parse_args()
    segs = json.loads((TR / "segments.json").read_text(encoding="utf-8"))["items"]
    mem = {} if a.all else load_memory()
    todo = [s for s in segs if s["en"] not in mem]
    gl = json.loads(GLOSS.read_text(encoding="utf-8"))
    terms = {}
    for sec in ("heroes", "units", "abilities", "talents", "battlegrounds", "common"):
        for en, ko in (gl.get(sec) or {}).items():
            terms.setdefault(en, ko)
    keys = sorted(terms, key=len, reverse=True)  # 긴 이름부터 (Locust Brood 가 Locust 로 잘리지 않게)

    chunks, cur, size = [], [], 0
    for s in todo:
        cur.append({"en": s["en"]})
        size += len(s["en"])
        if size >= a.chars:
            chunks.append(cur)
            cur, size = [], 0
    if cur:
        chunks.append(cur)

    out = TR / "chunks"
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob("chunk_*.json"):
        f.unlink()
    for i, items in enumerate(chunks, 1):
        blob = " ".join(x["en"] for x in items).lower()
        g = {k: terms[k] for k in keys if k.lower() in blob}
        (out / f"chunk_{i:03d}.json").write_text(json.dumps(
            {"chunk": i, "of": len(chunks), "glossary": g, "items": items}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"번역할 문장 {len(todo)} / 전체 {len(segs)} (이미 번역됨 {len(segs) - len(todo)}) → 묶음 {len(chunks)}개")


if __name__ == "__main__":
    main()
