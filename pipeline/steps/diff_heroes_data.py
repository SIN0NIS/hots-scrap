# -*- coding: utf-8 -*-
"""Step D. 연속된 두 빌드의 herodata + kokr gamestrings 를 비교 → data/patchnotes/diff/{from}-{to}.json

두 스키마(hdp 4.x = heroes-data, hdp 5.x = heroes-data2)를 어댑터로 같은 모양으로 맞춘 뒤 비교한다.
정규화 모양:
  {heroId: {name, life{amount,scale,regenRate,regenScale}, energy{amount,regenRate}, shield{…}, speed,
            weapons{nameId: {range,period,damage,damageScale}},          ← isDisabled 무기는 뺀다
            abilities{buttonId|type: rec}, talents{talentId: rec},
            units{unitId: {name, life, energy, speed, weapons, abilities{buttonId|type: rec}}},   ← heroUnits(공생체·조종사·용암 거인…)
            subs{buttonId|type: rec + parent, parentKind},               ← subAbilities(기술·특성이 주는 버튼)
            flat: set(buttonId|type 전부)}}                               ← 배치 이동 판정용
  rec = {id, button, name, type, full, cooldown, energy, life, icon, (level, sort, quest), raw{field: 원문}, unread[field…]}
  기술 키는 buttonId|type — nameId/abilityId 는 HDP 판마다 부모/자식 선택이 바뀌지만(이렐) buttonId 는 같다.

값 못 읽음(unread): 원본(HDP)이 수식을 못 풀면 숫자 자리를 0 으로 뱉는다. 7년치 diff 에서 진짜 "→0" 변경은 0건이다.
  5.x 는 따옴표 없는 마크업 <c val=#TooltipNumbers>0</c> 이 표식(정상은 <c val="bfd4fd" hlt-name=…>), 그 문자열의 0 아닌 숫자도 낡은 값.
  4.x 는 91093 까지 ##ERROR## 표식, 그 뒤로는 표식 없이 <c val="bfd4fd">0</c> 뿐이라 앞 빌드와 문장 골격을 맞춰 잡는다.
  잡은 자리는 앞 빌드 값을 이어 쓰고(carry-forward) 그 결과를 다음 비교의 base 로 쓴다. 이어 쓴 자리는 fills/<version>.json 에 남겨
  서버(Actions, 직전 라이브 + 최신 두 빌드만 복원)도 같은 base 를 만들 수 있게 한다 → load_norm().
비교 순서: 빌드 오름차순, 기본은 PTR 제외(--ptr 로 포함). 각 빌드는 "직전 라이브 빌드"와 비교.

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
FILLS = ROOT / "site" / "data" / "patchnotes" / "fills"
TAG_RE = re.compile(r"<[^>]+>")
NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")
# 숫자 토큰 = 숫자(+선택적 성장 접미) 또는 못 읽은 자리 '?'. 골격은 이것을 # 로 바꾼 문장.
TOK_RE = re.compile(r"(-?\d+(?:\.\d+)?|\?)(\(\+-?[\d.]+%\))?")
SCALE_RE = re.compile(r"(-?\d+(?:\.\d+)?)(%?)~~(-?[\d.]+)~~")   # 58~~0.04~~ → 58(+4%), 2%~~-0.038~~ → 2%(-3.8%)
UNREAD5_RE = re.compile(r'<[cs]\s+val=(?!")')                  # 5.x 못 읽은 문자열: 따옴표 없는 속성
UNREAD5_ZERO_RE = re.compile(r"<([cs])\s+val=[^>\"]*>\s*([+-]?0%?)\s*</\1>")   # 그 안의 0 → ?
ERR4 = "##ERROR##"
INT_ZERO_RE = re.compile(r"^-?0%?$")
SUSPECT_RE = re.compile(r"\?|-\d+(?:\.\d+)?(?:초|%|회|마리|의|명|개)|\b9999\b|~~|##ERROR##")
SKIP_GROUPS = {"spray", "voice", "mount", "hearth"}
TEXT_FIELDS = ("name", "full", "cooldown", "energy", "life")
NUMERIC_FIELDS = ("cooldown", "energy", "life")   # 라벨(마나/기력)이 아니라 숫자만 비교한다
ABILITY_FIELDS = ("name", "full", "cooldown", "energy", "life")
TALENT_FIELDS = ("name", "full", "cooldown", "energy", "quest")
NOISE_NAME_RE = re.compile(r"취소|해제|비활성|내립니다|중단|Cancel|Dismount")
# 유닛 이름이 영웅 이름과 같아 구분이 안 되는 것(용암 거인 = "라그나로스")은 화면용 이름을 따로 둔다
UNIT_LABEL = {"RagnarosBigRag": "용암 거인(화산 심장부)", "HeroAlexstraszaDragon": "용 형태(용의 여왕)", "HeroDVaPilot": "조종사 모드",
              "HeroMedivhRaven": "까마귀 형태", "FirebatBunkerDropBunkerUnit": "벙커", "MedicMedivacDropship": "의료선"}


def load(p):
    return json.loads((ROOT / p).read_text(encoding="utf-8-sig"))


def is_unread(raw):
    return bool(raw) and (ERR4 in raw or bool(UNREAD5_RE.search(raw)))


def plain(s):
    """툴팁 마크업 → 평문. <n/> 줄바꿈, <c val=..>숫자</c> 등 태그 제거. 못 읽은 0 은 ? 로."""
    if not s:
        return ""
    s = s.replace("<n/>", "\n").replace("<n />", "\n")
    if UNREAD5_RE.search(s):
        s = UNREAD5_ZERO_RE.sub("?", s)
    if ERR4 in s:
        s = re.sub(r"-?0" + ERR4, "?", s).replace(ERR4, "")
    s = TAG_RE.sub("", s)
    s = html.unescape(s)
    s = SCALE_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}(+{round(float(m.group(3)) * 100, 2):g}%)", s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


def squash(s):
    """등가 판정용 정규형(공백·줄바꿈 차이 무시). 표시는 plain 결과를 그대로 쓴다."""
    return re.sub(r"\s+", " ", s or "").strip()


def num(v, nd=4):
    if isinstance(v, float):
        return int(v) if v.is_integer() else round(v, nd)
    return v


def skel(s):
    return TOK_RE.sub("#", s or "")


# ---------- 어댑터 ----------
def normalize(herodata, kokr):
    if "items" in herodata and "meta" in herodata:
        out = norm5(herodata["items"], kokr["items"])
    else:
        out = norm4(herodata, kokr["gamestrings"])
    for h in out.values():
        finish_hero(h)
    return out


def make_rec(raws, **extra):
    r = {f: plain(raws.get(f) or "") for f in TEXT_FIELDS}
    r["raw"] = {f: v for f, v in raws.items() if v}
    unread = [f for f in TEXT_FIELDS if is_unread(raws.get(f))]
    if unread:
        r["unread"] = unread
    r.update(extra)
    return r


def stats(h):
    life = h.get("life") or {}
    en = h.get("energy") or {}
    sh = h.get("shield") or {}
    weapons = {}
    for w in h.get("weapons") or []:
        if w.get("isDisabled"):          # 5.x 가 비활성 무기(예: 초의 크툰의 선물)를 같이 싣는다
            continue
        weapons[w.get("nameId") or f"w{len(weapons)}"] = {k: num(w.get(k)) for k in ("range", "period", "damage", "damageScale") if w.get(k) is not None}
    def pick(d, keys):
        # 재생량은 HDP 판마다 반올림 자리가 달라(8.8437↔8.8438) 3자리로 맞춘다
        return {k: num(d.get(k), 3 if "regen" in k else 4) for k in keys if d.get(k) is not None}
    return {
        "life": pick(life, ("amount", "scale", "regenRate", "regenScale")),
        "energy": pick(en, ("amount", "regenRate")),
        "shield": pick(sh, ("amount", "scale", "regenDelay", "regenRate", "regenScale")),
        "speed": num(h.get("speed")),
        "weapons": weapons,
    }


def norm4(hd, gs):
    at = gs["abiltalent"]
    unit_name = gs.get("unit", {}).get("name", {})

    def raws(a, passive):
        out = {}
        for f in TEXT_FIELDS:
            d = at.get(f, {})
            v = None
            for suf in (passive, not passive):
                v = d.get(f"{a['nameId']}|{a['buttonId']}|{a['abilityType']}|{suf}")
                if v is not None:
                    break
            out[f] = v or ""
        return out

    def ability_recs(container, dest):
        for group, lst in (container or {}).items():
            if group.lower() in SKIP_GROUPS:
                continue
            for a in lst:
                dest[f"{a['buttonId']}|{a['abilityType']}"] = make_rec(raws(a, bool(a.get("isPassive"))), id=a["nameId"], button=a["buttonId"], type=a["abilityType"], icon=a.get("icon"))

    def subs_of(container):
        """4.x subAbilities = [{부모키: {그룹: [..]}}]. 부모키는 기술이면 3부분, 특성이면 2부분, 패시브 기술이면 …|Trait|True."""
        out = {}
        for ent in container or []:
            for parent, groups in ent.items():
                parts = parent.split("|")
                for group, lst in groups.items():
                    if group.lower() in SKIP_GROUPS:
                        continue
                    for a in lst:
                        out[f"{a['buttonId']}|{a['abilityType']}"] = make_rec(raws(a, bool(a.get("isPassive"))), id=a["nameId"], button=a["buttonId"], type=a["abilityType"], icon=a.get("icon"),
                                                                             parent="|".join(parts[:2]), parentKind="talent" if len(parts) == 2 else "ability")
        return out

    out = {}
    for hid, h in hd.items():
        if not isinstance(h, dict) or "abilities" not in h:
            continue
        abilities, talents, units = {}, {}, {}
        ability_recs(h.get("abilities"), abilities)
        for lv, lst in h.get("talents", {}).items():
            level = int(re.sub(r"\D", "", lv) or 0)
            for t in lst:
                talents[t["nameId"]] = make_rec(raws(t, bool(t.get("isPassive"))), id=t["nameId"], button=t["buttonId"], type=t["abilityType"], icon=t.get("icon"),
                                                level=level, sort=t.get("sort"), quest=bool(t.get("isQuest")))
        for ent in h.get("heroUnits") or []:
            for uid, u in ent.items():
                ua = {}
                ability_recs(u.get("abilities"), ua)
                ua.update(subs_of(u.get("subAbilities")))   # 유닛 안 하위 버튼(취소·해제)은 유닛 기술에 합친다
                units[uid] = {"name": unit_name.get(uid, uid), **stats(u), "abilities": ua}
        out[hid] = {"name": unit_name.get(hid, hid), **stats(h), "abilities": abilities, "talents": talents, "units": units, "subs": subs_of(h.get("subAbilities"))}
    return out


def norm5(hd, gs):
    ab, tl = gs["ability"], gs["talent"]
    hero_name = gs["hero"]["name"]
    unit_name = gs.get("unit", {}).get("name", {})
    F5 = {"name": "name", "full": "fullText", "cooldown": "cooldownText", "energy": "energyText", "life": "lifeText"}

    def raws(table, k):
        return {f: table.get(F5[f], {}).get(k, "") for f in TEXT_FIELDS}

    def ability_recs(container, dest):
        for group, lst in (container or {}).items():
            if group.lower() in SKIP_GROUPS:
                continue
            for a in lst:
                dest[f"{a['buttonId']}|{a['abilityType']}"] = make_rec(raws(ab, a["linkId"]), id=a["abilityId"], button=a["buttonId"], type=a["abilityType"], icon=a.get("icon"))

    def subs_of(container):
        """5.x subAbilities = {부모linkId: {그룹: [..]}}. 특성이 부모면 …|type|LevelN."""
        out = {}
        for parent, groups in (container or {}).items():
            parts = parent.split("|")
            kind = "talent" if len(parts) >= 4 and parts[3].startswith("Level") else "ability"
            for group, lst in groups.items():
                if group.lower() in SKIP_GROUPS:
                    continue
                for a in lst:
                    out[f"{a['buttonId']}|{a['abilityType']}"] = make_rec(raws(ab, a["linkId"]), id=a["abilityId"], button=a["buttonId"], type=a["abilityType"], icon=a.get("icon"),
                                                                         parent="|".join(parts[:2]), parentKind=kind)
        return out

    out = {}
    for hid, h in hd.items():
        if not isinstance(h, dict) or "abilities" not in h:
            continue
        abilities, talents, units = {}, {}, {}
        ability_recs(h.get("abilities"), abilities)
        for lv, lst in h.get("talents", {}).items():
            level = int(re.sub(r"\D", "", lv) or 0)
            for t in lst:
                talents[t["talentId"]] = make_rec(raws(tl, t["linkId"]), id=t["talentId"], button=t["buttonId"], type=t["abilityType"], icon=t.get("icon"),
                                                  level=level, sort=t.get("sort"), quest=bool(t.get("isQuest")))
        for uid, u in (h.get("heroUnits") or {}).items():
            ua = {}
            ability_recs(u.get("abilities"), ua)
            ua.update(subs_of(u.get("subAbilities")))
            units[uid] = {"name": unit_name.get(uid, uid), **stats(u), "abilities": ua}
        out[hid] = {"name": hero_name.get(hid, hid), **stats(h), "abilities": abilities, "talents": talents, "units": units, "subs": subs_of(h.get("subAbilities"))}
    return out


def finish_hero(h):
    """펼친 색인을 만들고(배치 이동 판정용) 하위 기술의 잡음을 뺀다."""
    for uid, u in h["units"].items():
        if uid in UNIT_LABEL and (not u["name"] or u["name"] == h["name"] or u["name"] == uid):
            u["name"] = UNIT_LABEL[uid]
    flat = set(h["abilities"]) | set(h["subs"])
    for u in h["units"].values():
        flat |= set(u["abilities"])
    h["flat"] = flat
    own = {(r["name"], squash(r["full"]), r["cooldown"], r["energy"]) for r in list(h["abilities"].values()) + list(h["talents"].values())}
    for k, r in list(h["subs"].items()):
        sig = (r["name"], squash(r["full"]), r["cooldown"], r["energy"])
        if sig in own:                                   # 본체 기술·특성 툴팁 그대로인 버튼(5.x 특성 활성기 84%)
            del h["subs"][k]
        elif r["parent"].startswith("Mount|SummonMount"):
            del h["subs"][k]
        elif not NUM_RE.search(r["full"]) and (not r["full"] or NOISE_NAME_RE.search(r["name"] or "")):
            del h["subs"][k]                             # "탈것에서 내립니다" 류
    for u in h["units"].values():
        for k, r in list(u["abilities"].items()):
            o = h["abilities"].get(k)
            if o is not None and (o["name"], squash(o["full"])) == (r["name"], squash(r["full"])):
                del u["abilities"][k]                    # 잃어버린 바이킹처럼 본체와 같은 기술을 유닛이 공유
            elif not NUM_RE.search(r["full"]) and (not r["full"] or NOISE_NAME_RE.search(r["name"] or "")):
                del u["abilities"][k]


# ---------- 못 읽은 값 이어 쓰기 ----------
def apply_fills(norm, fills):
    for hid, secs in (fills or {}).items():
        h = norm.get(hid)
        if not h:
            continue
        for sec, keys in secs.items():
            if sec.startswith("units."):
                table = (h["units"].get(sec[6:]) or {}).get("abilities", {})
            else:
                table = h.get(sec, {})
            for key, fields in keys.items():
                r = table.get(key)
                if r is None:
                    continue
                for f, v in fields.items():
                    if f == "raw":
                        for rf, rv in v.items():
                            r.setdefault("raw", {})[rf] = rv
                    else:
                        r[f] = v
                if "unread" in r:
                    r["unread"] = [f for f in r["unread"] if f not in fields]
                    if not r["unread"]:
                        del r["unread"]
    return norm


def load_norm(build):
    """builds.json 항목 → 정규화 + 그 빌드의 fills 적용. series·index·빌드메이커도 이것을 쓴다."""
    norm = normalize(load(build["herodata"]), load(build["kokr"]))
    fp = FILLS / f"{build['version']}{'_ptr' if build.get('isPtr') else ''}.json"
    if fp.exists():
        apply_fills(norm, json.loads(fp.read_text(encoding="utf-8")))
    return norm


def carry(before, after):
    """골격이 같으면 '값→정수 0' 또는 '?' 자리에 앞 빌드 토큰을 도로 넣는다. (채운 문장, 채운 자리 목록)"""
    if skel(before) != skel(after):
        return after, []
    bt = list(TOK_RE.finditer(before))
    at = list(TOK_RE.finditer(after))
    if len(bt) != len(at):
        return after, []
    out, pos, carried = [], 0, []
    for i, (mb, ma) in enumerate(zip(bt, at)):
        out.append(after[pos:ma.start()])
        b_tok, a_tok = mb.group(1), ma.group(1)
        if (a_tok == "?" or (INT_ZERO_RE.match(a_tok) and not INT_ZERO_RE.match(b_tok))):
            out.append(mb.group(0))
            carried.append(i)
        else:
            out.append(ma.group(0))
        pos = ma.end()
    out.append(after[pos:])
    return "".join(out), carried


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


class Fills:
    """이번 빌드에서 앞 빌드 값을 이어 쓴 자리. {hero: {section: {key: {field: 채운값, raw: {field: 원문}}}}}"""

    def __init__(self):
        self.d = {}

    def put(self, hid, sec, key, field, value, raw=None):
        e = self.d.setdefault(hid, {}).setdefault(sec, {}).setdefault(key, {})
        e[field] = value
        if raw is not None:
            e.setdefault("raw", {})[field] = raw


def field_changes(x, y, fields, talent=False, sink=None):
    """x(앞) → y(뒤). y 의 못 읽은 자리를 x 값으로 채워 넣고(y 를 고친다) 진짜 변경만 돌려준다."""
    ch = []
    for f in fields:
        va, vb = x.get(f), y.get(f)
        if f in ("quest", "level"):
            if va != vb:
                ch.append({"field": f, "before": va, "after": vb})
            continue
        va, vb = va or "", vb or ""
        unread = f in (y.get("unread") or ())
        label_only = f in NUMERIC_FIELDS and va and vb and NUM_RE.search(va) and not NUM_RE.search(vb)   # "재사용 대기시간:" 처럼 숫자만 빠진 라벨
        carried = []
        if vb != va:
            # 못 읽은 문자열은 0 아닌 숫자도 낡은 값이라, 골격이 같거나 글자 몇 개만 다른 변형(갈 '적 영웅')이면 필드 전체를 앞 빌드 것으로.
            # 문장이 실제로 바뀐 개편(아서스 0.88)은 ? 를 남기고 '값 불확실'로 보인다.
            if label_only or (unread and va and (skel(va) == skel(vb) or similarity(va, vb) >= 0.95)):
                # 못 읽은 문자열은 0 아닌 숫자도 낡은 값 → 골격이 같으면 필드 전체를 앞 빌드 것으로
                vb = va
                carried = ["*"]
                y[f] = va
                y.setdefault("raw", {})[f] = (x.get("raw") or {}).get(f, "")
                if sink:
                    sink(f, va, (x.get("raw") or {}).get(f))
            else:
                filled, carried = carry(va, vb)
                if carried:
                    vb = filled
                    y[f] = filled
                    if sink:
                        sink(f, filled, None)
        if squash(va) == squash(vb):
            continue
        if f in NUMERIC_FIELDS:
            if talent and (not va or not vb):
                continue                                   # 4.x 는 특성에 재사용 대기시간을 안 싣는다(""→값 전이는 형식 산물)
            if NUM_RE.findall(va) == NUM_RE.findall(vb) and "?" not in vb:
                continue                                   # "마나: 10" → "기력: 10" 같은 라벨 차이
        item = {"field": f, "before": va, "after": vb, "diff": text_diff(va, vb)}
        if carried:
            item["carried"] = carried
        if unread or label_only or SUSPECT_RE.search(vb) or zero_slots(vb) > zero_slots(va):
            item["suspect"] = True   # 진짜 정수 0 은 앞뒤 빌드에 같이 있어 늘어나지 않는다
        ch.append(item)
    return ch


def stat_change(field, a, b, unit=None):
    def show(v):
        if field == "weapons":
            return [v[k] for k in sorted(v)] if v else []
        return v
    c = {"type": "stat", "field": field, "before": show(a), "after": show(b)}
    if unit:
        c["unit"] = unit
    return c


def zero_slots(s):
    return sum(1 for m in TOK_RE.finditer(s or "") if INT_ZERO_RE.match(m.group(1)))


def similarity(a, b):
    return difflib.SequenceMatcher(None, squash(a), squash(b), autojunk=False).ratio()


def diff_stats(a, b, unit=None):
    return [stat_change(f, a.get(f), b.get(f), unit) for f in ("life", "energy", "shield", "speed", "weapons") if a.get(f) != b.get(f)]


def diff_abilities(xa, xb, flat_a, flat_b, sink, addrm=True, unit=None, parent_of=None):
    """기술 표 둘을 비교. 사라진/생긴 키가 상대 빌드 어딘가(펼친 색인)에 있으면 배치 이동이라 보고하지 않는다."""
    out = []
    for k in sorted(set(xa) & set(xb)):
        fc = field_changes(xa[k], xb[k], ABILITY_FIELDS, sink=sink(k))
        if fc:
            out.append(decorate({"type": "ability", "id": k, "name": xb[k]["name"], "abilityType": xb[k]["type"], "changes": fc}, xb[k], unit, parent_of))
    removed = {k: xa[k] for k in xa if k not in xb and k not in flat_b}
    added = {k: xb[k] for k in xb if k not in xa and k not in flat_a}
    # 1) buttonId 같고 슬롯(type)만 다름 → 슬롯 이동
    for k, x in list(removed.items()):
        for k2, y in list(added.items()):
            if x["button"] == y["button"]:
                fc = field_changes(x, y, ABILITY_FIELDS, sink=sink(k2))
                out.append(decorate({"type": "ability_moved", "id": k2, "name": y["name"], "typeFrom": x["type"], "typeTo": y["type"], "changes": fc}, y, unit, parent_of))
                del removed[k], added[k2]
                break
    # 2) 이름 같음 → 개편(ID 변경)
    for k, x in list(removed.items()):
        cands = [(k2, y) for k2, y in added.items() if x["name"] and y["name"] == x["name"]]
        if not cands:
            continue
        cands.sort(key=lambda c: (c[1]["type"] != x["type"], c[1].get("icon") != x.get("icon"), -similarity(x["full"], c[1]["full"])))
        k2, y = cands[0]
        fc = field_changes(x, y, ABILITY_FIELDS, sink=sink(k2))
        if fc or x["type"] != y["type"]:
            item = {"type": "ability", "id": k2, "idFrom": k, "idTo": k2, "renamed": True, "name": y["name"], "abilityType": y["type"], "changes": fc}
            if x["type"] != y["type"]:
                item["typeFrom"] = x["type"]
            out.append(decorate(item, y, unit, parent_of))
        del removed[k], added[k2]
    # 3) 같은 슬롯에서 removed 1 · added 1 → 교체(추정). 특성이 주는 활성기(Active)는 제외
    for typ in sorted({x["type"] for x in removed.values()}):
        if typ.lower() in ("active", "activable"):
            continue
        rs = [(k, x) for k, x in removed.items() if x["type"] == typ]
        as_ = [(k, y) for k, y in added.items() if y["type"] == typ]
        if len(rs) == 1 and len(as_) == 1:
            (k, x), (k2, y) = rs[0], as_[0]
            out.append(decorate({"type": "ability_replaced", "abilityType": typ, "idFrom": k, "idTo": k2, "nameFrom": x["name"], "nameTo": y["name"],
                                 "fullBefore": x["full"], "fullAfter": y["full"], "cooldownBefore": x["cooldown"], "cooldownAfter": y["cooldown"], "match": "slot", "confidence": "low"}, y, unit, parent_of))
            del removed[k], added[k2]
    if addrm:
        for k, x in removed.items():
            out.append(decorate({"type": "ability_removed", "id": k, "name": x["name"], "abilityType": x["type"], "full": x["full"]}, x, unit, parent_of))
        for k, y in added.items():
            out.append(decorate({"type": "ability_added", "id": k, "name": y["name"], "abilityType": y["type"], "full": y["full"], "cooldown": y["cooldown"]}, y, unit, parent_of))
    return out


def decorate(item, rec, unit, parent_of):
    if unit:
        item["unit"] = unit
    if parent_of and rec.get("parent"):
        item["parent"] = parent_of(rec["parent"])
    if any(c.get("suspect") for c in item.get("changes") or []) or (rec.get("unread") and item["type"] in ("ability_added", "talent_added")):
        item["suspect"] = True
    return item


def moved_kind(x, y):
    if squash(x["full"]) == squash(y["full"]):
        return "moved"
    return "tweak" if skel(x["full"]) == skel(y["full"]) else "redesign"


def diff_talents(ta, tb, sink):
    out = []
    for k in sorted(set(ta) & set(tb)):
        x, y = ta[k], tb[k]
        fc = field_changes(x, y, TALENT_FIELDS, talent=True, sink=sink(k))
        item = None
        if x["level"] != y["level"]:
            fc.insert(0, {"field": "level", "before": x["level"], "after": y["level"]})
            item = {"type": "talent", "id": k, "name": y["name"], "level": y["level"], "changes": fc, "moved": {"from": x["level"], "to": y["level"], "kind": moved_kind(x, y)}}
        elif fc:
            item = {"type": "talent", "id": k, "name": y["name"], "level": y["level"], "changes": fc}
        if item:
            out.append(decorate(item, y, None, None))
    removed = {k: ta[k] for k in ta if k not in tb}
    added = {k: tb[k] for k in tb if k not in ta}
    # 1) 이름 같음 → 개편(ID 변경). 후보 여럿이면 레벨 같음 > 아이콘 같음 > buttonId 같음 > 설명 유사도
    for k, x in list(removed.items()):
        cands = [(k2, y) for k2, y in added.items() if x["name"] and y["name"] == x["name"]]
        if not cands:
            continue
        cands.sort(key=lambda c: (c[1]["level"] != x["level"], c[1].get("icon") != x.get("icon"), c[1]["button"] != x["button"], -similarity(x["full"], c[1]["full"])))
        k2, y = cands[0]
        fc = field_changes(x, y, TALENT_FIELDS, talent=True, sink=sink(k2))
        if x["level"] != y["level"]:
            fc.insert(0, {"field": "level", "before": x["level"], "after": y["level"]})
        if fc:   # 설명·레벨까지 같은 순수 개명(케리건 '흉포한 강습')은 변경이 아니다
            item = {"type": "talent", "id": k2, "idFrom": k, "idTo": k2, "renamed": True, "name": y["name"], "level": y["level"], "changes": fc}
            if x["level"] != y["level"]:
                item["moved"] = {"from": x["level"], "to": y["level"], "kind": moved_kind(x, y)}
            out.append(decorate(item, y, None, None))
        del removed[k], added[k2]
    # 2) 같은 단계에서 removed 1 · added 1 → 칸 교체(추정). 여럿이면 아이콘 같고 설명 유사도 0.5 이상일 때만
    for lv in sorted({x["level"] for x in removed.values()}):
        rs = [(k, x) for k, x in removed.items() if x["level"] == lv]
        as_ = [(k, y) for k, y in added.items() if y["level"] == lv]
        pairs = []
        if len(rs) == 1 and len(as_) == 1:
            pairs = [(rs[0], as_[0], "slot")]
        else:
            for r in rs:
                best = None
                for a in as_:
                    if a[1].get("icon") == r[1].get("icon") and r[1]["full"] and a[1]["full"]:
                        s = similarity(r[1]["full"], a[1]["full"])
                        if s >= 0.5 and (best is None or s > best[0]):
                            best = (s, a)
                if best:
                    pairs.append((r, best[1], "icon+text"))
                    as_ = [a for a in as_ if a[0] != best[1][0]]
        for (k, x), (k2, y), match in pairs:
            out.append(decorate({"type": "talent_replaced", "level": lv, "idFrom": k, "idTo": k2, "nameFrom": x["name"], "nameTo": y["name"],
                                 "fullBefore": x["full"], "fullAfter": y["full"], "cooldownBefore": x["cooldown"], "cooldownAfter": y["cooldown"],
                                 "match": match, "confidence": "low"}, y, None, None))
            del removed[k], added[k2]
    for k, x in removed.items():
        out.append({"type": "talent_removed", "id": k, "name": x["name"], "level": x["level"], "full": x["full"], "cooldown": x["cooldown"], "icon": x.get("icon")})
    for k, y in added.items():
        out.append(decorate({"type": "talent_added", "id": k, "name": y["name"], "level": y["level"], "full": y["full"], "cooldown": y["cooldown"], "icon": y.get("icon")}, y, None, None))
    return out


def parent_name_of(h):
    """subAbilities 의 부모키 'nameId|buttonId' → 화면에 적을 부모 기술·특성 이름"""
    def f(parent):
        nid, _, btn = parent.partition("|")
        for table in (h["abilities"], h["talents"]):
            for r in table.values():
                if r["button"] == btn or r["id"] == nid:
                    return r["name"] or nid
        return nid
    return f


def diff_hero(hid, a, b, same_gen, fills):
    ch = []
    if a.get("name") != b.get("name"):
        ch.append({"type": "rename", "before": a.get("name"), "after": b.get("name")})
    ch += diff_stats(a, b)

    def sink_for(sec):
        def mk(key):
            def s(field, value, raw):
                fills.put(hid, sec, key, field, value, raw)
            return s
        return mk

    ch += diff_abilities(a["abilities"], b["abilities"], a["flat"], b["flat"], sink_for("abilities"))
    ch += diff_talents(a["talents"], b["talents"], sink_for("talents"))
    # 진짜 변경으로 이미 오른 본체 문장. 유닛·하위 기술이 같은 문장을 반복하면(이렐 13건) 뺀다
    seen_after = {squash(c["after"]) for it in ch for c in it.get("changes") or [] if c["field"] == "full"}
    extra = []
    for uid in sorted(set(a["units"]) | set(b["units"])):
        ua, ub = a["units"].get(uid), b["units"].get(uid)
        if ua is None or ub is None:
            if same_gen:   # 형식 경계에서는 5.x 만 유닛으로 잡는 것(벙커·의료선·까마귀)이 있어 보고하지 않는다
                extra.append({"type": "unit_removed" if ub is None else "unit_added", "unit": (ua or ub)["name"], "unitId": uid})
            continue
        extra += diff_stats(ua, ub, unit=ub["name"])
        extra += diff_abilities(ua["abilities"], ub["abilities"], a["flat"], b["flat"], sink_for(f"units.{uid}"), addrm=same_gen, unit=ub["name"])
    if same_gen:   # 하위 버튼의 부모 귀속·재사용 대기시간 표기가 형식마다 달라 경계에서는 비교하지 않는다
        extra += diff_abilities(a["subs"], b["subs"], a["flat"], b["flat"], sink_for("subs"), parent_of=parent_name_of(b))
    for it in extra:
        fulls = [squash(c["after"]) for c in it.get("changes") or [] if c["field"] == "full"]
        if fulls and all(f in seen_after for f in fulls) and len(it["changes"]) == len(fulls):
            continue
        ch.append(it)
    return ch


def diff_builds(na, nb, same_gen=True, fills=None):
    fills = fills or Fills()
    heroes = {}
    for hid in sorted(set(na) | set(nb)):
        if hid not in na:
            heroes[hid] = {"name": nb[hid]["name"], "added": True, "changes": []}
        elif hid not in nb:
            heroes[hid] = {"name": na[hid]["name"], "removed": True, "changes": []}
        else:
            ch = diff_hero(hid, na[hid], nb[hid], same_gen, fills)
            if ch:
                heroes[hid] = {"name": nb[hid]["name"], "changes": ch}
    return heroes


def summarize(heroes):
    items = [c for h in heroes.values() for c in h["changes"]]
    s = {"heroes": len(heroes), "changes": len(items)}
    for key, pred in (("renamed", lambda c: c.get("renamed")), ("replaced", lambda c: c["type"].endswith("_replaced")),
                      ("moved", lambda c: c.get("moved") or c["type"] == "ability_moved"), ("units", lambda c: c.get("unit")),
                      ("subs", lambda c: c.get("parent")), ("suspect", lambda c: c.get("suspect"))):
        n = sum(1 for c in items if pred(c))
        if n:
            s[key] = n
    return s


def write_fills(build, fills):
    FILLS.mkdir(parents=True, exist_ok=True)
    fp = FILLS / f"{build['version']}{'_ptr' if build.get('isPtr') else ''}.json"
    if fills.d:
        fp.write_text(json.dumps(fills.d, ensure_ascii=False, indent=1), encoding="utf-8")
    elif fp.exists():
        fp.unlink()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--ptr", action="store_true")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    builds = load(BUILDS)
    # 비-PTR 은 직전 비-PTR 과, PTR 은 직전 비-PTR(라이브)과 비교. base 는 이어 쓴 값이 반영된 정규화본 하나만 메모리에 둔다
    prev, base, done = None, None, 0
    for b in builds:
        if b["isPtr"] and not a.ptr:
            continue
        if prev is None:
            prev = b
            continue
        out = OUT / f"{prev['build']}-{b['build']}{'_ptr' if b['isPtr'] else ''}.json"
        if not (out.exists() and not a.force):
            if base is None:
                base = load_norm(prev)
            cur = normalize(load(b["herodata"]), load(b["kokr"]))
            fills = Fills()
            same_gen = prev.get("repo") == b.get("repo")
            heroes = diff_builds(base, cur, same_gen, fills)
            summary = summarize(heroes)
            doc = {"from": prev["version"], "to": b["version"], "fromBuild": prev["build"], "toBuild": b["build"],
                   "fromDate": prev["date"], "toDate": b["date"], "toPtr": b["isPtr"], "fromRepo": prev.get("repo"), "toRepo": b.get("repo"),
                   "heroes": heroes, "summary": summary}
            if not same_gen:
                doc["schemaBoundary"] = True
            out.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
            write_fills(b, fills)
            done += 1
            nf = sum(len(k) for secs in fills.d.values() for k in secs.values())
            print(f"{out.name:24s} 영웅 {len(heroes):3d} 변경 {summary['changes']:4d}  ({prev['date']} → {b['date']})" + (f"  이어 쓴 자리 {nf}" if nf else "") + ("  [형식 경계]" if not same_gen else ""))
            if not b["isPtr"]:
                base = cur          # 이어 쓴 값이 들어간 정규화본이 다음 base
        elif not b["isPtr"]:
            base = None             # 건너뛴 라이브 빌드: 다음에 필요하면 fills 를 적용해 다시 만든다
        if not b["isPtr"]:
            prev = b
    print(f"완료 {done}개 diff → {OUT}")


if __name__ == "__main__":
    main()
