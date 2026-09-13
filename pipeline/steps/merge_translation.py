# -*- coding: utf-8 -*-
"""Step T3b. 번역 묶음 결과(raw/translate/out/chunk_*.json)를 번역 메모리에 합친다.

out 파일 형식: {"chunk": N, "items": [{"en": "원문", "ko": "번역"}, …]}
메모리 형식  : raw/translate/memory.json = {"원문": "번역"}

태그(<b>·<span class="pn-new"> 등)의 종류·개수가 원문과 다른 번역은 넣지 않고 따로 보고한다.
원문 기준이라 문장 목록이 바뀌어도 기존 번역이 어긋나지 않는다.

사용: python merge_translation.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TR = ROOT / "raw" / "translate"
TAG = re.compile(r"<\s*/?\s*([a-zA-Z0-9]+)")


def tags(s):
    return [t.lower() for t in TAG.findall(s or "")]


def main():
    mem_f = TR / "memory.json"
    mem = json.loads(mem_f.read_text(encoding="utf-8")) if mem_f.exists() else {}
    before = len(mem)
    added = updated = skipped = 0
    problems = []
    for f in sorted((TR / "out").glob("chunk_*.json")):
        try:
            d = json.loads(f.read_text(encoding="utf-8-sig"))
        except Exception as e:
            problems.append({"file": f.name, "why": f"읽기 실패: {e}"})
            continue
        for it in d.get("items", []):
            en, ko = (it.get("en") or "").strip(), (it.get("ko") or "").strip()
            if not en or not ko:
                skipped += 1
                continue
            if tags(en) != tags(ko):
                skipped += 1
                problems.append({"file": f.name, "en": en[:120], "ko": ko[:120], "why": "태그 불일치"})
                continue
            if en in mem:
                if mem[en] != ko:
                    mem[en] = ko
                    updated += 1
            else:
                mem[en] = ko
                added += 1
    mem_f.write_text(json.dumps(mem, ensure_ascii=False, indent=1), encoding="utf-8")
    (TR / "merge_report.json").write_text(json.dumps(problems, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"번역 메모리 {before} → {len(mem)} (새로 {added}, 고침 {updated}, 넘김 {skipped})")
    if problems:
        print(f"  문제 {len(problems)}건 → {TR / 'merge_report.json'}")


if __name__ == "__main__":
    main()
