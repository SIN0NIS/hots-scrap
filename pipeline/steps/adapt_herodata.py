"""HeroesDataParser 5.x 출력을 백과사전 생성기가 기대하는 형태로 옮긴다.

백과사전(make_encyclopedia.py)과 그 템플릿의 JS 는 구형 HDP(4.x) 필드 이름을 쓴다.
5.x 는 같은 내용을 다른 이름으로 낸다 - 내용이 아니라 표기만 달라진 것이라
기계적으로 옮길 수 있다.

  abilities.Basic   -> abilities.basic        그룹 키를 소문자로
  talents.Level1    -> talents.level1
  abilityId/talentId-> nameId
  fullText          -> fullTooltip            (shortText/energyText/cooldownText 도 같은 식)
  tooltipAbilityLinkIds -> abilityTalentLinkIds   "A|B|Q" 에서 A 만 남긴다
  isMelee(bool)     -> type("근접"/"원거리")
  playstyles        -> descriptors            그 밖 *Ids 계열도 옛 이름으로

또 5.x 는 {"meta":…, "items":{…}} 로 감싸는데 생성기는 영웅 사전을 통째로 기대하므로
items 만 꺼내 쓴다.

  python hots_kr/adapt_herodata.py <입력.json> <출력.json>
"""
import json
import os
import re
import sys


# 영웅 단위 이름 변경 (5.x -> 백과사전)
HERO_RENAMES = {
    "playstyles": "descriptors",
    "summonedUnitIds": "units",
    "skinIds": "skins",
    "variationSkinIds": "variationSkins",
    "voiceLineIds": "voiceLines",
    "mountCategoryIds": "mountCategories",
}
# 백과사전이 쓰지 않는 5.x 신규 필드
HERO_DROP = {"attributes", "isMelee", "scalingLinkIds"}

# 스킬·특성 단위 이름 변경
ENTRY_RENAMES = {
    "abilityId": "nameId",
    "talentId": "nameId",
    "energyText": "energyTooltip",
    "cooldownText": "cooldownTooltip",
    "lifeText": "lifeTooltip",
    "shortText": "shortTooltip",
    "fullText": "fullTooltip",
}
ENTRY_DROP = {"linkId", "tooltipAbilityLinkIds"}

WEAPON_KEEP = ("nameId", "range", "period", "damage", "damageScale")

MELEE = {"kokr": "근접", "enus": "Melee"}
RANGED = {"kokr": "원거리", "enus": "Ranged"}


def first_segment(link_id):
    """\"JainaFrostbolt|JainaFrostbolt|Q\" 처럼 파이프로 이어진 앞부분만 쓴다."""
    return link_id.split("|", 1)[0]


PASSIVE_MARKER = ":PASSIVE:"

# 백과사전 템플릿은 레벨 성장 표기를 영문 문구로 찾는다.
#   /(\d+(?:\.\d+)?)\s*\(\+(\d+(?:\.\d+)?)%\s*per level\)/g
# 구형 HDP 는 한국어로 뽑아도 이 문구를 영문 그대로 두었는데 5.x 는 번역한다.
# 번역된 문구를 그대로 두면 레벨별 수치 계산이 통째로 죽으므로 되돌린다.
SCALING_KO = re.compile(r"\(레벨당 \+(\d+(?:\.\d+)?)%\)")
TOOLTIP_FIELDS = ("fullTooltip", "shortTooltip", "energyTooltip",
                  "cooldownTooltip", "lifeTooltip")


def normalize_scaling(text):
    if not isinstance(text, str):
        return text
    return SCALING_KO.sub(r"(+\1% per level)", text)


def adapt_charges(charges):
    """충전 정보. 5.x 는 isCountHidden, 백과사전은 hideCount 를 본다."""
    out = dict(charges)
    if "isCountHidden" in out:
        hidden = out.pop("isCountHidden")
        if hidden:
            out["hideCount"] = True
    return out


def adapt_entry(entry, passives, talent=False):
    out = {}
    for key, value in entry.items():
        if key in ENTRY_DROP:
            continue
        out[ENTRY_RENAMES.get(key, key)] = adapt_charges(value) if key == "charges" else value

    for field in TOOLTIP_FIELDS:
        if field in out:
            out[field] = normalize_scaling(out[field])

    links = entry.get("tooltipAbilityLinkIds")
    if links:
        out["abilityTalentLinkIds"] = [first_segment(link) for link in links]

    # 5.x 는 패시브를 abilityId 자리에 :PASSIVE: 로 표시한다. 백과사전은 실제 id 를
    # 기대하므로 buttonId 로 되돌리고, 패시브 여부는 따로 남긴다.
    if out.get("nameId") == PASSIVE_MARKER:
        out["nameId"] = entry.get("buttonId")
        if not talent:
            # 특성 카드는 액티브/패시브 배지를 그리지 않는다. 표시를 붙이면
            # 옛 데이터와 어긋나기만 하므로 스킬에만 붙인다.
            out["isPassive"] = True

    # 5.x 가 더는 내지 않는 isActive/isPassive 는 직전 백과사전에서 뜬 표를 쓴다
    flag = passives.get(flag_key(out))
    if flag is not None:
        out.update(flag)
    return out


def flag_key(entry):
    """buttonId 만으로는 드물게 겹치므로 표시 이름까지 묶어 키를 만든다.

    nameId 는 쓸 수 없다. 5.x 가 패시브의 abilityId 를 :PASSIVE: 로 바꿔 버려
    옛 백과사전의 nameId 와 짝이 맞지 않기 때문이다.
    """
    return "%s|%s" % (entry.get("buttonId") or "", entry.get("abilityType") or "")





def lower_groups(groups, passives, talent=False):
    """{"Basic": [...]} -> {"basic": [...]}"""
    return {name.lower(): [adapt_entry(e, passives, talent) for e in entries]
            for name, entries in (groups or {}).items()}


def adapt_hero(hero, locale, passives):
    out = {}
    for key, value in hero.items():
        if key in HERO_DROP or key in ("abilities", "subAbilities", "talents",
                                       "weapons", "heroUnits"):
            continue
        out[HERO_RENAMES.get(key, value if False else key)] = value

    if "isMelee" in hero:
        table = MELEE if hero["isMelee"] else RANGED
        out["type"] = table.get(locale, table["enus"])
    if hero.get("scalingLinkIds"):
        out["scalingLinkId"] = hero["scalingLinkIds"][0]

    out["abilities"] = lower_groups(hero.get("abilities"), passives)
    out["talents"] = lower_groups(hero.get("talents"), passives, talent=True)
    if hero.get("weapons"):
        out["weapons"] = [{k: w[k] for k in WEAPON_KEEP if k in w}
                          for w in hero["weapons"]]
    # 5.x 는 부모별 사전, 백과사전은 사전 하나짜리 항목들의 목록을 기대한다
    if hero.get("subAbilities"):
        out["subAbilities"] = [{parent: lower_groups(groups, passives)}
                               for parent, groups in hero["subAbilities"].items()]
    # 하위 유닛도 같은 사정이다. 사전 그대로 두면 백과사전이 forEach 를 부르다 죽어
    # 아바투르·알렉스트라자 같은 영웅 페이지가 통째로 안 그려진다.
    if hero.get("heroUnits"):
        out["heroUnits"] = [{unit_id: adapt_hero(unit, locale, passives)}
                            for unit_id, unit in hero["heroUnits"].items()]
    return out


def locale_of(raw, path):
    text = ((raw.get("meta") or {}).get("gameStringText") or {}).get("locale")
    if text:
        return text.lower()
    name = os.path.basename(path).lower()
    return "kokr" if "kokr" in name else "enus"


def alternate_forms(items):
    """다른 영웅의 변신·은신 형태로 들어온 항목.

    5.x 는 AbathurSymbiote(공생체 조종 중), ValeeraStealthed(은신 중) 를 별도
    영웅처럼 내보낸다. hyperlinkId 가 자기 키가 아니라 원래 영웅을 가리키므로
    그걸로 가려낸다. 스킬·특성이 원본과 한 글자도 다르지 않아 목록에 두면
    같은 영웅이 두 번 나올 뿐이다.
    """
    keys = set(items)
    return {key for key, hero in items.items()
            if hero.get("hyperlinkId") and hero["hyperlinkId"] != key
            and hero["hyperlinkId"] in keys}


def adapt(raw, path, passives=None):
    items = raw.get("items", raw)
    locale = locale_of(raw, path)
    passives = passives or {}
    duplicates = alternate_forms(items)
    if duplicates:
        print("  대체 형태 제외: %s" % ", ".join(sorted(duplicates)))
    return {key: adapt_hero(hero, locale, passives)
            for key, hero in items.items() if key not in duplicates}


# 액티브/패시브 표시 스냅숏. 5.x 가 더는 내지 않아 옛 백과사전에서 떠 둔 것이다.
PASSIVE_TABLE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "passive_flags.json")


def load_passives():
    """buttonId -> {"isActive": False} 같은 표.

    5.x 는 이 표시를 더는 내지 않는다. 마지막으로 제대로 된 백과사전에서 떠 둔
    스냅숏이라 새로 나온 영웅은 여기에 없다 (그 경우 액티브로 보인다).
    scripts: python hots_kr/adapt_herodata.py --dump-passives <백과사전.html>
    """
    if not os.path.isfile(PASSIVE_TABLE):
        return {}
    return json.load(open(PASSIVE_TABLE, encoding="utf-8"))


def dump_passives(html_path):
    """기존 백과사전에서 isActive/isPassive 표시를 떠서 표로 저장한다."""
    text = open(html_path, encoding="utf-8").read()
    start = text.index("const dataEN = ") + len("const dataEN = ")
    data = json.loads(text[start:text.index("\n", start)].rstrip(";"))

    table = {}

    def scan(entries):
        for entry in entries:
            flags = {k: entry[k] for k in ("isActive", "isPassive") if k in entry}
            if flags:
                table[flag_key(entry)] = flags

    for hero in data.values():
        for groups in (hero.get("abilities"), hero.get("talents")):
            for entries in (groups or {}).values():
                scan(entries)
        for sub in (hero.get("subAbilities") or []):
            for groups in sub.values():
                for entries in groups.values():
                    scan(entries)

    with open(PASSIVE_TABLE, "w", encoding="utf-8") as fh:
        json.dump(table, fh, ensure_ascii=False, indent=1, sort_keys=True)
    print("패시브 표시 %d건 -> %s" % (len(table), PASSIVE_TABLE))


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "--dump-passives":
        return dump_passives(sys.argv[2])
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    source, target = sys.argv[1], sys.argv[2]
    raw = json.load(open(source, encoding="utf-8"))
    result = adapt(raw, source, load_passives())
    os.makedirs(os.path.dirname(os.path.abspath(target)), exist_ok=True)
    with open(target, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False)
    print("%d명 -> %s" % (len(result), target))


if __name__ == "__main__":
    main()
