# -*- coding: utf-8 -*-
"""
step10: hots_xml_parser 산출물(out/final)을 통합 데이터로 조립한다.

입력:  <src>/*.json           (영웅별 파서 산출물, build 97650)
출력:  <out>/heroes/<Id>.json (영웅 상세 — 원본 그대로, 앱이 지연 로드)
       <out>/heroes.json      (경량 인덱스 — 목록·검색용)
       <out>/talents.json     (talentId -> 영웅/티어/이름 평면 색인 — 리플레이 TalentChosen 매칭용)

재실행해도 안전(멱등). 원본은 절대 수정하지 않는다.
"""
import argparse
import json
import sys
from pathlib import Path

# 본체와 특성을 공유하는 하위 유닛 — 특성 색인에서 제외 (상세 파일은 유지)
SUBUNITS = {"AbathurSymbiote", "ValeeraStealthed"}

def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))

def dump(p: Path, obj):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="hots_xml_parser out/final 경로")
    ap.add_argument("--out", required=True, help="data/<빌드> 경로")
    args = ap.parse_args()
    src, out = Path(args.src), Path(args.out)

    index = []
    talent_index = {}
    files = sorted(src.glob("*.json"))
    if not files:
        print(f"[오류] 입력 없음: {src}", file=sys.stderr)
        sys.exit(1)

    for f in files:
        hero = load(f)
        hid = hero.get("id") or f.stem
        # 1) 상세 파일: 그대로 복사(압축 직렬화만)
        dump(out / "heroes" / f"{hid}.json", hero)
        # 2) 경량 인덱스
        entry = {
            "id": hid,
            "name": hero.get("name"),
            "title": hero.get("title"),
            "role": hero.get("role"),
            "skills": len(hero.get("skill") or []),
            "talents": len(hero.get("talent") or []),
        }
        if hid in SUBUNITS:
            entry["subunit"] = True
        index.append(entry)
        # 3) 특성 평면 색인 (리플레이 TalentChosen == talent.id)
        #    공용 특성(GenericTalent*)은 여러 영웅이 공유하므로 리스트로 쌓는다.
        if hid in SUBUNITS:
            continue
        for t in hero.get("talent") or []:
            tid = t.get("id")
            if not tid:
                continue
            talent_index.setdefault(tid, []).append({
                "hero": hid,
                "tier": t.get("tier"),
                "level": t.get("level"),
                "name": t.get("name"),
                "short": t.get("short"),
            })

    build = load(files[0]).get("build")
    shared = sum(1 for v in talent_index.values() if len(v) > 1)
    dump(out / "heroes.json", {"build": build, "count": len(index), "heroes": index})
    dump(out / "talents.json", {"build": build, "count": len(talent_index), "talents": talent_index})
    print(f"[완료] 영웅 {len(index)}명, 특성 {len(talent_index)}개(공유 {shared}개) -> {out}")

if __name__ == "__main__":
    main()
