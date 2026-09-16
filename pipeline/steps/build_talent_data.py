# -*- coding: utf-8 -*-
"""Step E. 빌드메이커(특성 찍기)용 영웅 데이터 만들기 — 본 서버 판과 공개 테스트 서버 판.

heroes-data2 는 글(gamestrings)과 수치(herodata)를 따로 두고, 빌드마다 JSON Patch 로만 올린다.
여기서 하는 일:
  1) 고른 빌드의 herodata + gamestrings(kokr·enus)를 패치 사슬로 복원
  2) 글을 수치에 끼워 넣어 HeroesDataParser 5.x 의 '번역된 출력' 모양으로 되돌림
  3) scripts/adapt_herodata.py 와 같은 규칙으로 빌드메이커가 쓰는 4.x 모양으로 옮김
  4) site/data/builds/<live|ptr>.json 으로 저장 (ko·en 한 파일에 같이)

한 화면에 한 파일만 받으면 되도록 묶어 둔다. 무료 호스팅이라 요청 수를 줄이는 게 중요하다.

사용:
  python build_talent_data.py                  # 본 서버·테스트 서버 최신 빌드 둘 다
  python build_talent_data.py --only live
  python build_talent_data.py --check 97039    # 이미 있는 herodata_97039_kokr.json 과 대조(검증용)
"""
import argparse
import json
import re
import sys
from pathlib import Path

import jsonpatch

ROOT = Path(__file__).resolve().parents[2]
HD2 = ROOT / "vendor" / "heroes-data2" / "heroesdata"
BUILDS = ROOT / "site" / "data" / "patchnotes" / "builds.json"
OUT = ROOT / "site" / "data" / "builds"

# ---------- 5.x → 4.x 이름 옮기기 (scripts/adapt_herodata.py 와 같은 규칙) ----------
HERO_RENAMES = {"playstyles": "descriptors", "summonedUnitIds": "units", "skinIds": "skins",
                "variationSkinIds": "variationSkins", "voiceLineIds": "voiceLines",
                "mountCategoryIds": "mountCategories", "heroUnitIds": "heroUnits"}
HERO_DROP = {"attributes", "isMelee", "scalingLinkIds"}
ENTRY_RENAMES = {"abilityId": "nameId", "talentId": "nameId", "energyText": "energyTooltip",
                 "cooldownText": "cooldownTooltip", "lifeText": "lifeTooltip",
                 "shortText": "shortTooltip", "fullText": "fullTooltip"}
ENTRY_DROP = {"linkId", "tooltipAbilityLinkIds"}
TEXT_FIELDS = ("name", "fullText", "shortText", "cooldownText", "energyText", "lifeText")


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8-sig"))


def hdp(vdir):
    return load(vdir / ".hdp.json")


def chain(version):
    """root-version 까지 거슬러 올라가는 폴더 목록(오래된 것부터)."""
    out, seen = [], set()
    cur = version
    while cur and cur not in seen:
        seen.add(cur)
        vdir = HD2 / cur
        if not vdir.is_dir():
            raise SystemExit(f"빌드 폴더가 없습니다: {cur}")
        out.append(vdir)
        m = hdp(vdir)
        cur = m.get("depends-on") if m.get("json") == "patch" else None
    return list(reversed(out))


def resolve(version, locale):
    """herodata 와 gamestrings 를 패치 사슬로 복원해 (herodata, gamestrings) 로."""
    hero = strings = None
    for vdir in chain(version):
        m = hdp(vdir)
        files = m.get("files") or {}
        hname = (files.get("[data]") or {}).get("herodata")
        gname = (files.get("[gamestrings]") or {}).get(locale)
        if not hname:
            cand = list((vdir / "data").glob("herodata_*"))
            hname = cand[0].name if cand else None
        if not gname:
            cand = list((vdir / "gamestrings").glob(f"gamestrings_*_{locale}.json"))
            gname = cand[0].name if cand else None
        if not hname or not gname:
            raise SystemExit(f"{vdir.name}: herodata/{locale} 파일을 못 찾았습니다")
        hp, gp = vdir / "data" / hname, vdir / "gamestrings" / gname
        if m.get("json") == "patch":
            hero = jsonpatch.apply_patch(hero, load(hp), in_place=False)
            strings = jsonpatch.apply_patch(strings, load(gp), in_place=False)
        else:
            hero, strings = load(hp), load(gp)
    return hero, strings


# ---------- 툴팁 다듬기 ----------
# HeroesDataParser 가 내보낼 때 하는 후처리를 그대로 흉내 낸다.
#  · hlt-name 속성은 빼고
#  · 레벨 성장치 <c val=..>153</c><c val=..>~~0.04~~</c> 를 153 (+4% per level) 로 접는다
HLT = re.compile(r'\s+hlt-name\s*=\s*"([^"]*)"')
SCALE_PAIR = re.compile(r'<c val="([0-9a-fA-F]{6})">([\d.,]+)</c>\s*<c val="[0-9a-fA-F]{6}">~~(-?[\d.]+)~~</c>')
SCALE_BARE = re.compile(r'([\d.,]+)~~(-?[\d.]+)~~')


def pct(x):
    v = float(x) * 100
    return f"{v:g}"


def clean_tip(t):
    if not isinstance(t, str):
        return t
    # hlt-name 은 값이 # 로 시작하면 버리고(색 이름), 아니면 name 으로 이름만 바꾼다
    t = HLT.sub(lambda m: "" if m.group(1).startswith("#") else f' name="{m.group(1)}"', t)
    t = SCALE_PAIR.sub(lambda m: f'<c val="{m.group(1)}">{m.group(2)} (+{pct(m.group(3))}% per level)</c>', t)
    t = SCALE_BARE.sub(lambda m: f"{m.group(1)} (+{pct(m.group(2))}% per level)", t)
    return t.rstrip(" 	")


# ---------- 글을 수치에 끼워 넣기 ----------
def key_of(entry, level=None):
    """gamestrings 키. herodata 의 linkId 가 그대로 키다(특성은 뒤에 |LevelN 이 붙는다)."""
    if entry.get("linkId"):
        return entry["linkId"]
    nid = entry.get("talentId") or entry.get("abilityId") or ""
    base = f"{nid}|{entry.get('buttonId', '')}|{entry.get('abilityType', '')}"
    return f"{base}|{level}" if level else base


def pick(table, key):
    """정확히 맞는 키가 없으면 접미(|False 등)가 붙은 것까지 본다."""
    if key in table:
        return table[key]
    pre = key + "|"
    for k in table:
        if k.startswith(pre):
            return table[k]
    return None


def localize(hero_raw, gs_raw, fallback=None):
    """HeroesDataParser 5.x 의 '번역된 출력' 모양으로 되돌린다.

    fallback 을 주면 그 언어로 빈 자리를 메운다. 테스트 서버 자료는 새 영웅이
    아직 번역되지 않은 채로 올라오는 일이 잦아서(빈 문자열), 그대로 두면
    이름 없는 특성이 줄줄이 생긴다. 한국어가 비면 영어라도 보여 주는 게 낫다.
    """
    heroes = hero_raw.get("items", hero_raw)
    g = gs_raw.get("items", gs_raw)
    fb = (fallback or {}).get("items", fallback or {})
    ab, tl = g.get("ability", {}), g.get("talent", {})
    fab, ftl = fb.get("ability", {}), fb.get("talent", {})
    hero_t, unit_t = g.get("hero", {}), g.get("unit", {})
    fhero_t = fb.get("hero", {})
    out = {}
    for hid, h in heroes.items():
        if not isinstance(h, dict):
            continue
        n = json.loads(json.dumps(h))   # 원본을 건드리지 않는다
        for f, tab in hero_t.items():
            v = tab.get(hid)
            if not v:
                v = (fhero_t.get(f) or {}).get(hid)
            if v:
                n[f] = v
        if "name" not in n:
            n["name"] = unit_t.get("name", {}).get(h.get("unitId", ""), hid)
        n["type"] = "근접" if h.get("isMelee") else "원거리"
        # HDP 는 자원·생명력 종류를 그 객체 안에 넣는다 (energyType → energy.type)
        for src, dst in (("energyType", "energy"), ("lifeType", "life"), ("shieldType", "shield")):
            v = n.pop(src, None)
            if v and isinstance(n.get(dst), dict):
                n[dst]["type"] = v
        # 로스트 바이킹처럼 기본 기술이 하위 유닛에만 있는 영웅은 거기서 가져온다
        ab_groups = n.get("abilities") or {}
        if not ab_groups.get("Basic"):
            for _u in (n.get("heroUnits") or {}).values():
                basic = (_u.get("abilities") or {}).get("Basic")
                if basic:
                    ab_groups["Basic"] = json.loads(json.dumps(basic))
                    n["abilities"] = ab_groups
                    break
        for grp, lst in (n.get("abilities") or {}).items():
            for e in lst:
                k = key_of(e)
                for f in TEXT_FIELDS:
                    v = pick(ab.get(f, {}), k)
                    if not v:
                        v = pick(fab.get(f, {}), k)
                    if v is not None:
                        e[f] = clean_tip(v)
        for grp, lst in (n.get("talents") or {}).items():
            for e in lst:
                k = key_of(e, grp)
                for f in TEXT_FIELDS:
                    v = (pick(tl.get(f, {}), k) or pick(ab.get(f, {}), key_of(e))
                         or pick(ftl.get(f, {}), k) or pick(fab.get(f, {}), key_of(e)))
                    if v is not None:
                        e[f] = clean_tip(v)
        out[hid] = n
    return out


# ---------- 4.x 모양으로 ----------
# 빌드메이커·백과사전이 쓰는 모양으로 옮기는 일은 이미 검증된 어댑터가 한다.
# (Hots_talent_build/scripts/adapt_herodata.py 를 그대로 들여왔다)
import adapt_herodata  # noqa: E402

_PASSIVES = None


def adapt(loc, locale):
    global _PASSIVES
    if _PASSIVES is None:
        _PASSIVES = adapt_herodata.load_passives()
    raw = {"meta": {"gameStringText": {"locale": locale}}, "items": loc}
    return adapt_herodata.adapt(raw, f"x_{locale}.json", _PASSIVES)


# ---------- 화면이 실제로 쓰는 것만 남기기 ----------
# 무료 호스팅이라 내려받는 양이 곧 비용이다. 빌드메이커가 읽지 않는 필드는 버린다.
HERO_KEEP = {"name", "title", "type", "hyperlinkId", "expandedRole", "roles", "description",
             "infoText", "searchText", "difficulty", "franchise", "releaseDate", "rarity",
             "life", "energy", "shield", "weapons", "speed", "sight", "radius", "innerRadius",
             "ratings", "portraits", "abilities", "talents"}
ENTRY_KEEP = {"nameId", "buttonId", "name", "icon", "abilityType", "fullTooltip", "shortTooltip",
              "cooldownTooltip", "energyTooltip", "lifeTooltip", "sort", "charges", "isQuest",
              "isPassive", "isActive", "abilityTalentLinkIds"}
AB_GROUPS = ("basic", "heroic", "trait", "activable")


def slim(data):
    out = {}
    for hid, h in data.items():
        o = {k: v for k, v in h.items() if k in HERO_KEEP}
        if isinstance(o.get("portraits"), dict):
            o["portraits"] = {k: v for k, v in o["portraits"].items() if k == "heroSelect"}
        for grp in ("abilities", "talents"):
            src = o.get(grp) or {}
            o[grp] = {g: [{k: v for k, v in e.items() if k in ENTRY_KEEP} for e in lst]
                      for g, lst in src.items() if grp == "talents" or g in AB_GROUPS}
        out[hid] = o
    return out


def build_rows():
    rows = load(BUILDS)
    live = [b for b in rows if not b["isPtr"]]
    ptr = [b for b in rows if b["isPtr"]]
    live.sort(key=lambda b: b["build"])
    ptr.sort(key=lambda b: b["build"])
    return (live[-1] if live else None), (ptr[-1] if ptr else None)


def make(row):
    ver = row["version"] + ("_ptr" if row["isPtr"] else "")
    hero_raw, ko_raw = resolve(ver, "kokr")
    _, en_raw = resolve(ver, "enus")
    ko = slim(adapt(localize(hero_raw, ko_raw, en_raw), "kokr"))   # 한국어가 비면 영어로 메운다
    en = slim(adapt(localize(hero_raw, en_raw), "enus"))
    heroes = sorted(
        ({"id": hid, "name_ko": ko[hid].get("name", hid), "name_en": en.get(hid, {}).get("name", hid),
          "hId": ko[hid].get("hyperlinkId", hid)} for hid in ko),
        key=lambda x: x["name_ko"])
    meta = {"build": row["build"], "version": row["version"], "date": row["date"], "isPtr": row["isPtr"]}
    return meta, heroes, ko, en


def check(build):
    """이미 검증된 herodata_<build>_kokr.json 과 대조한다."""
    ref_p = ROOT.parent / "Hots_talent_build" / f"herodata_{build}_kokr.json"
    if not ref_p.exists():
        raise SystemExit(f"대조할 파일이 없습니다: {ref_p}")
    ref = load(ref_p)
    rows = load(BUILDS)
    row = next(b for b in rows if str(b["build"]) == str(build))
    ver = row["version"] + ("_ptr" if row["isPtr"] else "")
    hero_raw, ko_raw = resolve(ver, "kokr")
    mine = adapt(localize(hero_raw, ko_raw), "kokr")   # 대조는 메우지 않은 상태로
    miss = sorted(set(ref) - set(mine))
    extra = sorted(set(mine) - set(ref))
    print(f"영웅 수: 기준 {len(ref)} · 만든 것 {len(mine)}" + (f" · 빠짐 {miss}" if miss else "") + (f" · 더 있음 {extra}" if extra else ""))
    bad = []
    for hid in sorted(set(ref) & set(mine)):
        a, b = ref[hid], mine[hid]
        for f in ("name", "title", "type", "difficulty", "expandedRole"):
            if a.get(f) != b.get(f):
                bad.append(f"{hid}.{f}: 기준={a.get(f)!r} 만든것={b.get(f)!r}")
        for grp in ("basic", "heroic", "trait"):
            ra, rb = a["abilities"].get(grp, []), b["abilities"].get(grp, [])
            if len(ra) != len(rb):
                bad.append(f"{hid}.abilities.{grp}: 개수 {len(ra)} vs {len(rb)}")
                continue
            for x, y in zip(ra, rb):
                for f in ("name", "fullTooltip", "icon", "abilityType"):
                    if x.get(f) != y.get(f):
                        bad.append(f"{hid}.{grp}.{x.get('nameId')}.{f} 다름")
        for lv in ("level1", "level4", "level7", "level10", "level13", "level16", "level20"):
            ra, rb = a["talents"].get(lv, []), b["talents"].get(lv, [])
            if len(ra) != len(rb):
                bad.append(f"{hid}.talents.{lv}: 개수 {len(ra)} vs {len(rb)}")
                continue
            for x, y in zip(ra, rb):
                for f in ("name", "fullTooltip", "icon", "sort"):
                    if x.get(f) != y.get(f):
                        bad.append(f"{hid}.{lv}.{x.get('nameId')}.{f} 다름")
    print(f"어긋난 항목: {len(bad)}")
    for m in bad[:25]:
        print("   ", m)
    return 0 if not bad and not miss else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["live", "ptr"])
    ap.add_argument("--check", help="이 빌드 번호로 기존 파일과 대조만 한다")
    a = ap.parse_args()
    if a.check:
        return check(a.check)
    live, ptr = build_rows()
    OUT.mkdir(parents=True, exist_ok=True)
    index, made = {"heroes": [], "channels": {}}, []
    by_id = {}
    for tag, row in (("live", live), ("ptr", ptr)):
        if not row or (a.only and a.only != tag):
            continue
        meta, heroes, ko, en = make(row)
        index["channels"][tag] = meta
        for h in heroes:
            cur = by_id.setdefault(h["id"], {**h, "ch": []})
            if tag not in cur["ch"]:
                cur["ch"].append(tag)
            if tag == "live":           # 이름은 본 서버 쪽을 기준으로 둔다
                cur.update({k: h[k] for k in ("name_ko", "name_en", "hId")})
        for loc, data in (("ko", ko), ("en", en)):
            p = OUT / f"{tag}.{loc}.json"
            p.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            made.append((f"{tag}.{loc}", meta, p.stat().st_size))
    # 목록·판 정보만 담은 작은 파일. 화면은 이것 하나와 고른 판 하나만 받는다.
    ip = OUT / "index.json"
    if index["channels"]:
        if ip.exists():                 # --only 로 한쪽만 만들었으면 나머지는 남겨 둔다
            old = json.loads(ip.read_text(encoding="utf-8"))
            merged = old.get("channels", {})
            merged.update(index["channels"])
            index["channels"] = merged
            for h in old.get("heroes", []):
                cur = by_id.setdefault(h["id"], {**h, "ch": h.get("ch", [])})
                for c in h.get("ch", []):
                    if c not in cur["ch"] and c not in index["channels"]:
                        cur["ch"].append(c)
        index["heroes"] = sorted(by_id.values(), key=lambda x: x["name_ko"])
        ip.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for tag, meta, size in made:
        print(f"{tag}: {meta['version']} ({meta['date']}) · {size // 1024}KB")
    if index["channels"]:
        print(f"index.json: 영웅 {len(index['heroes'])}명 · {ip.stat().st_size // 1024}KB")
    else:
        print("만든 것이 없습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
