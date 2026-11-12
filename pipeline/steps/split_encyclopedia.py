# -*- coding: utf-8 -*-
"""번역 도감(site/encyclopedia/index.html)을 영웅마다 나눠 가볍게 만든다.

예전에는 91명의 기술·특성(dataKO 의 abilities·talents·subAbilities)과 위키 상세 칸(wikiFields.rows)을
한 파일(4.2MB, 압축해도 0.8MB)에 다 넣어, 영웅 하나를 보려 해도 전부 받았다.
이 단계는 그 둘을 site/encyclopedia/hero/<id>.json 으로 옮기고, 화면은 영웅을 열 때 그 영웅 것만 받는다
(index.html 안의 hero-split 코드 — renderHeroPage 를 감싸 받은 뒤 그린다).

  python pipeline/steps/split_encyclopedia.py         나누기(이미 나눠져 있으면 아무것도 안 한다)

· 어느 영웅도 부르지 않는 위키 행은 index.html 에 남긴다(빼면 화면에서 사라질 수 있다).
· 별칭(wikiFields.alias)·목록(heroList)·초상화 등 홈 화면이 쓰는 칸은 그대로 둔다.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENC = ROOT / "site" / "encyclopedia"
HTML = ENC / "index.html"
HEAVY = ("abilities", "talents", "subAbilities")


def grab(text, name):
    m = re.search(r"^const " + name + r" *= *", text, re.M)
    e = text.index("\n", m.end())
    body = text[m.end():e].rstrip()
    return m.start(), e, json.loads(body[:-1] if body.endswith(";") else body)


def ids_in(o, out):
    """기술·특성 자료 안의 모든 nameId·buttonId·연결 id"""
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ("nameId", "buttonId") and isinstance(v, str):
                out.add(v)
            elif k == "abilityTalentLinkIds" and isinstance(v, list):
                out.update(x for x in v if isinstance(x, str))
            else:
                ids_in(v, out)
    elif isinstance(o, list):
        for x in o:
            ids_in(x, out)
    return out


def main():
    t = HTML.read_text(encoding="utf-8")
    s0, e0, data = grab(t, "dataKO")
    if not any(k in h for h in data.values() for k in HEAVY):
        print("이미 나눠져 있음 — 할 일 없음")
        return
    s1, e1, wf = grab(t, "wikiFields")
    rows, alias = wf["rows"], wf["alias"]
    used = set()
    (ENC / "hero").mkdir(exist_ok=True)
    for hid, h in data.items():
        part = {k: h.pop(k) for k in HEAVY if k in h}
        want = ids_in(part, set())
        want |= {v for k, v in alias.items() if k.split("|", 1)[0] == hid}
        part["wiki"] = {k: rows[k] for k in sorted(want) if k in rows}
        used |= set(part["wiki"])
        (ENC / "hero" / f"{hid}.json").write_text(json.dumps(part, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    wf["rows"] = {k: v for k, v in rows.items() if k not in used}
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":"))
    # 뒤쪽(wikiFields)부터 바꿔야 앞쪽 자리가 안 흔들린다
    t = t[:s1] + "const wikiFields = " + dump(wf) + ";" + t[e1:]
    t = t[:s0] + "const dataKO = " + dump(data) + ";" + t[e0:]
    HTML.write_text(t, encoding="utf-8", newline="")
    print(f"영웅 {len(data)}명 → hero/*.json · 위키 행 {len(used)}개 옮김, {len(wf['rows'])}개 남김 · index.html {HTML.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    sys.exit(main())
