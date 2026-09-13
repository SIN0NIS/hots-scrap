# -*- coding: utf-8 -*-
"""Step D. 연속된 두 빌드의 herodata + kokr gamestrings 를 비교 → data/patchnotes/diff/{from}-{to}.json

두 스키마(hdp 4.x = heroes-data, hdp 5.x = heroes-data2)를 어댑터로 같은 모양으로 맞춘 뒤 비교한다.
정규화 모양:
  {heroId: {name, life{amount,scale,regenRate,regenScale}, energy{amount,regenRate}, speed, weapons[{range,period,damage,damageScale}],
            abilities{abilityId|type: {name, type, full, cooldown, energy, life, icon}},
            talents{talentId: {name, level, type, full, cooldown, energy, icon, sort, quest}}}}
비교 순서: 빌드 오름차순, 기본은 PTR 제외(--ptr 로 포함). 각 빌드는 "직전 빌드"와 비교.

사용:
  python diff_heroes_data.py            # 전부 (이미 있는 diff 는 건너뜀)
  python diff_heroes_data.py --force    # 다시
  python diff_heroes_data.py --ptr      # PTR 포함
"""
import argparse
import difflib
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILDS = ROOT / "site" / "data" / "patchnotes" / "builds.json"
OUT = ROOT / "site" / "data" / "patchnotes" / "diff"
TAG_RE = re.compile(r"<[^>]+>")
NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")


def load(p):
    return json.loads((ROOT / p).read_text(encoding="utf-8-sig"))


def plain(s):
    """툴팁 마크업 → 평문. <n/> 줄바꿈, <c val=..>숫자</c> 등 태그 제거."""
    if not s:
        return ""
    s = s.replace("<n/>", "\n").replace("<n />", "\n")
    s = TAG_RE.sub("", s)
    s = html.unescape(s)
    s = re.sub(r"(\d+(?:\.\d+)?)~~(-?\d+(?:\.\d+)?)~~", lambda m: f"{m.group(1)}(+{round(float(m.group(2))*100, 2):g}%)", s)  # 58~~0.04~~ → 58(+4%)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


def num(v):
    if isinstance(v, float):
        return int(v) if v.is_integer() else round(v, 4)
    return v


# ---------- 어댑터 ----------
def normalize(herodata, kokr):
    if "items" in herodata and "meta" in herodata:
        return norm5(herodata["items"], kokr["items"])
    return norm4(herodata, kokr["gamestrings"])


def norm4(hd, gs):
    at = gs["abiltalent"]
    unit_name = gs.get("unit", {}).get("name", {})
    pref = {}  # "nameId|buttonId|type" → 접미(|False/|True) 포함 전체 키
    for k in at["name"]:
        pref.setdefault(k.rsplit("|", 1)[0], k)
    out = {}
    for hid, h in hd.items():
        if not isinstance(h, dict) or "abilities" not in h:
            continue
        def txt(field, key):
            return plain(at.get(field, {}).get(key, ""))
        abilities = {}
        for typ, lst in h.get("abilities", {}).items():
            if typ in ("spray", "voice", "mount", "hearth"):
                continue
            for a in lst:
                k = pref.get(f"{a['nameId']}|{a['buttonId']}|{a['abilityType']}")
                key = f"{a['nameId']}|{a['abilityType']}"
                abilities[key] = {"name": txt("name", k), "type": a["abilityType"], "full": txt("full", k),
                                  "cooldown": txt("cooldown", k), "energy": txt("energy", k), "life": txt("life", k), "icon": a.get("icon")}
        talents = {}
        for lv, lst in h.get("talents", {}).items():
            level = int(re.sub(r"\D", "", lv) or 0)
            for t in lst:
                k = pref.get(f"{t['nameId']}|{t['buttonId']}|{t['abilityType']}")
                talents[t["nameId"]] = {"name": txt("name", k), "level": level, "type": t["abilityType"], "full": txt("full", k),
                                        "cooldown": txt("cooldown", k), "energy": txt("energy", k), "icon": t.get("icon"),
                                        "sort": t.get("sort"), "quest": bool(t.get("isQuest"))}
        out[hid] = {"name": unit_name.get(hid, hid), **stats(h), "abilities": abilities, "talents": talents}
    return out


def norm5(hd, gs):
    ab, tl, hero = gs["ability"], gs["talent"], gs["hero"]
    out = {}
    for hid, h in hd.items():
        abilities = {}
        for typ, lst in h.get("abilities", {}).items():
            if typ in ("Spray", "Voice", "Mount", "Hearth"):
                continue
            for a in lst:
                k = a["linkId"]
                aid = a["buttonId"] if a["abilityId"] == ":PASSIVE:" else a["abilityId"]  # 4.x 와 키 통일
                key = f"{aid}|{a['abilityType']}"
                abilities[key] = {"name": plain(ab["name"].get(k, "")), "type": a["abilityType"], "full": plain(ab["fullText"].get(k, "")),
                                  "cooldown": plain(ab["cooldownText"].get(k, "")), "energy": plain(ab["energyText"].get(k, "")),
                                  "life": plain(ab["lifeText"].get(k, "")), "icon": a.get("icon")}
        talents = {}
        for lv, lst in h.get("talents", {}).items():
            level = int(re.sub(r"\D", "", lv) or 0)
            for t in lst:
                k = t["linkId"]
                talents[t["talentId"]] = {"name": plain(tl["name"].get(k, "")), "level": level, "type": t["abilityType"], "full": plain(tl["fullText"].get(k, "")),
                                          "cooldown": plain(tl["cooldownText"].get(k, "")), "energy": plain(tl["energyText"].get(k, "")),
                                          "icon": t.get("icon"), "sort": t.get("sort"), "quest": bool(t.get("isQuest"))}
        out[hid] = {"name": hero["name"].get(hid, hid), **stats(h), "abilities": abilities, "talents": talents}
    return out


def stats(h):
    life = h.get("life") or {}
    en = h.get("energy") or {}
    return {
        "life": {k: num(life.get(k)) for k in ("amount", "scale", "regenRate", "regenScale") if life.get(k) is not None},
        "energy": {k: num(en.get(k)) for k in ("amount", "regenRate") if en.get(k) is not None},
        "speed": num(h.get("speed")),
        "weapons": [{k: num(w.get(k)) for k in ("range", "period", "damage", "damageScale") if w.get(k) is not None} for w in (h.get("weapons") or [])],
    }


# ---------- 비교 ----------
def text_diff(a, b):
    """단어 단위 diff → [[-old-]]{{+new+}} 마킹 문자열"""
    aw, bw = re.findall(r"\S+|\s+", a), re.findall(r"\S+|\s+", b)
    sm = difflib.SequenceMatcher(None, aw, bw, autojunk=False)
    if sm.ratio() < 0.6:  # 거의 다시 쓴 문장은 단어 섞기 대신 통째로 전/후
        return "[[-" + a + "-]]{{+" + b + "+}}"
    out = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op == "equal":
            out.append("".join(aw[i1:i2]))
        else:
            if i2 > i1:
                out.append("[[-" + "".join(aw[i1:i2]) + "-]]")
            if j2 > j1:
                out.append("{{+" + "".join(bw[j1:j2]) + "+}}")
    return "".join(out)


def field_changes(a, b, fields):
    ch = []
    for f in fields:
        va, vb = a.get(f), b.get(f)
        if va == vb:
            continue
        item = {"field": f, "before": va, "after": vb}
        if isinstance(va, str) and isinstance(vb, str):
            item["diff"] = text_diff(va, vb)
        ch.append(item)
    return ch


def diff_hero(a, b):
    ch = []
    for f in ("life", "energy", "speed", "weapons"):
        if a.get(f) != b.get(f):
            ch.append({"type": "stat", "field": f, "before": a.get(f), "after": b.get(f)})
    if a.get("name") != b.get("name"):
        ch.append({"type": "rename", "before": a.get("name"), "after": b.get("name")})
    for key in sorted(set(a["abilities"]) | set(b["abilities"])):
        x, y = a["abilities"].get(key), b["abilities"].get(key)
        if x is None:
            ch.append({"type": "ability_added", "id": key, "name": y["name"], "abilityType": y["type"], "full": y["full"]})
        elif y is None:
            ch.append({"type": "ability_removed", "id": key, "name": x["name"], "abilityType": x["type"]})
        else:
            fc = field_changes(x, y, ("name", "full", "cooldown", "energy", "life"))
            if fc:
                ch.append({"type": "ability", "id": key, "name": y["name"], "abilityType": y["type"], "changes": fc})
    for key in sorted(set(a["talents"]) | set(b["talents"])):
        x, y = a["talents"].get(key), b["talents"].get(key)
        if x is None:
            ch.append({"type": "talent_added", "id": key, "name": y["name"], "level": y["level"], "full": y["full"]})
        elif y is None:
            ch.append({"type": "talent_removed", "id": key, "name": x["name"], "level": x["level"]})
        else:
            fc = field_changes(x, y, ("name", "full", "cooldown", "energy", "quest"))
            if x["level"] != y["level"]:
                fc.insert(0, {"field": "level", "before": x["level"], "after": y["level"]})
            if fc:
                ch.append({"type": "talent", "id": key, "name": y["name"], "level": y["level"], "changes": fc})
    return ch


def diff_builds(na, nb):
    heroes = {}
    for hid in sorted(set(na) | set(nb)):
        if hid not in na:
            heroes[hid] = {"name": nb[hid]["name"], "added": True, "changes": []}
        elif hid not in nb:
            heroes[hid] = {"name": na[hid]["name"], "removed": True, "changes": []}
        else:
            ch = diff_hero(na[hid], nb[hid])
            if ch:
                heroes[hid] = {"name": nb[hid]["name"], "changes": ch}
    return heroes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--ptr", action="store_true")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    builds = load(BUILDS)
    # 비-PTR 은 직전 비-PTR 과, PTR 은 직전 비-PTR(라이브)과 비교
    prev, prev_norm, done = None, None, 0
    norm_cache = {}

    def norm_of(b):
        key = (b["build"], b["isPtr"])
        if key not in norm_cache:
            norm_cache.clear()  # 메모리: 직전 라이브 하나만 유지
            norm_cache[key] = normalize(load(b["herodata"]), load(b["kokr"]))
        return norm_cache[key]

    for b in builds:
        if b["isPtr"] and not a.ptr:
            continue
        if prev is None:
            prev = b
            continue
        out = OUT / f"{prev['build']}-{b['build']}{'_ptr' if b['isPtr'] else ''}.json"
        if not (out.exists() and not a.force):
            base = norm_of(prev)
            cur = normalize(load(b["herodata"]), load(b["kokr"]))
            heroes = diff_builds(base, cur)
            n_ch = sum(len(h["changes"]) for h in heroes.values())
            doc = {"from": prev["version"], "to": b["version"], "fromBuild": prev["build"], "toBuild": b["build"],
                   "fromDate": prev["date"], "toDate": b["date"], "toPtr": b["isPtr"], "heroes": heroes,
                   "summary": {"heroes": len(heroes), "changes": n_ch}}
            out.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
            done += 1
            print(f"{out.name:24s} 영웅 {len(heroes):3d} 변경 {n_ch:4d}  ({prev['date']} → {b['date']})")
            if not b["isPtr"]:
                norm_cache.clear()
                norm_cache[(b["build"], b["isPtr"])] = cur
        if not b["isPtr"]:
            prev = b
    print(f"완료 {done}개 diff → {OUT}")


if __name__ == "__main__":
    main()
