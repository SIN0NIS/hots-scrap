# -*- coding: utf-8 -*-
"""Step T1. 한·영 공식 용어집 → site/data/patchnotes/glossary.json

원천: 같은 빌드의 gamestrings enus / kokr (HeroesToolChest, 공식 게임 텍스트).
같은 키(영웅 id, 기술·특성 linkId)의 영문 이름 → 한글 이름을 그대로 대응시킨다.
번역할 때 이 표에 있는 이름은 반드시 이 번역을 쓴다(공식 한글명과 어긋나지 않게).

추가로 패치 노트에 자주 나오는 일반 용어(고정 표현)를 손으로 정리해 함께 싣는다.

사용: python build_glossary.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PN = ROOT / "site" / "data" / "patchnotes"
EN = ROOT / "raw" / "gamestrings_enus.json"
KO_FALLBACK = ROOT / "vendor" / "full" / "2.55.16.97039" / "gamestrings_kokr.json"
HERODATA = ROOT / "vendor" / "full" / "2.55.16.97039" / "herodata.json"
OUT = PN / "glossary.json"

# 패치 노트 고정 표현 (공식 한글 노트에서 쓰이는 말투)
COMMON = {
    "Patch Notes": "패치 노트", "Live Patch Notes": "라이브 패치 노트", "PTR Patch Notes": "공개 테스트 서버 패치 노트",
    "Balance Patch Notes": "밸런스 패치 노트", "Hotfix Notes": "긴급 수정 노트", "Balance Update": "밸런스 업데이트",
    "General": "일반", "Battlegrounds": "전장", "Battleground": "전장", "Heroes": "영웅", "Hero": "영웅",
    "Bug Fixes": "버그 수정", "New Hero": "새로운 영웅", "Art": "아트", "Design": "디자인", "Sound": "사운드",
    "User Interface": "사용자 인터페이스", "Collection": "수집품", "Shop": "상점", "Developer Comment": "개발자의 의견",
    "Developer Comments": "개발자의 의견", "Return to Top": "맨 위로 돌아가기", "Quick Navigation": "빠른 탐색",
    "Stats": "능력치", "Abilities": "기술", "Talents": "특성", "Trait": "고유 능력", "Base": "기본",
    "Level": "레벨", "Tier": "티어", "Quest": "퀘스트", "Reward": "보상", "Mythic Reward": "신화 보상",
    "Cooldown": "재사용 대기시간", "Mana": "마나", "Mana cost": "마나 소모량", "Energy": "기력", "Brew": "취기", "Fury": "분노",
    "Health": "생명력", "Maximum Health": "최대 생명력", "Health Regeneration": "생명력 재생",
    "Basic Attack": "일반 공격", "Basic Attacks": "일반 공격", "Attack Speed": "공격 속도", "Attack Damage": "공격력",
    "Attack Range": "사거리", "Movement Speed": "이동 속도", "Damage": "피해량", "Healing": "치유량",
    "Shield": "보호막", "Armor": "방어력", "Spell Armor": "기술 방어력", "Physical Armor": "물리 방어력",
    "Spell Power": "기술 위력", "Duration": "지속시간", "Radius": "반경", "Range": "사거리", "Cast Range": "시전 거리",
    "Cast time": "시전 시간", "Channel": "정신 집중", "Charge": "충전", "Charges": "충전 횟수",
    "Slow": "감속", "Slowed": "감속", "Root": "이동 불가", "Rooted": "이동 불가", "Stun": "기절", "Stunned": "기절",
    "Silence": "침묵", "Blind": "실명", "Blinded": "실명", "Polymorph": "변이", "Knockback": "밀쳐내기",
    "Unstoppable": "정지 불가", "Invulnerable": "무적", "Protected": "보호", "Cleanse": "정화", "Reveal": "드러내기",
    "Revealed": "드러남", "Stealth": "은신", "Vision": "시야", "Minion": "돌격병", "Minions": "돌격병",
    "Mercenary": "용병", "Mercenaries": "용병", "Camp": "캠프", "Boss": "우두머리", "Structure": "구조물",
    "Structures": "구조물", "Fort": "요새", "Keep": "성채", "Core": "핵", "Tower": "포탑", "Gate": "성문",
    "Wall": "성벽", "Healing Fountain": "치유의 샘", "Watch Tower": "감시탑", "Regeneration Globe": "재생의 구슬",
    "Experience": "경험치", "Experience Globe": "경험치 구슬", "Lane": "공격로", "Objective": "목표",
    "Map Rotation": "전장 로테이션", "Ranked": "등급전", "Quick Match": "빠른 대전", "Storm League": "폭풍 리그",
    "Unranked Draft": "일반 선발전", "Aram": "무작위 영웅 대전", "ARAM": "무작위 영웅 대전", "Brawl": "난투",
    "Try Mode": "체험하기 모드", "Custom Game": "사용자 지정 게임", "Spectator": "관전자", "Draft": "선발전",
    "Skin": "스킨", "Mount": "탈것", "Portrait": "초상화", "Spray": "스프레이", "Banner": "현수막",
    "Emoji": "이모티콘", "Voice Line": "음성 대사", "Announcer": "해설자", "Bundle": "묶음 상품",
    "Loot Chest": "전리품 상자", "Gems": "보석", "Gold": "금화", "Shard": "파편",
    "Increased from": "에서 증가", "Decreased from": "에서 감소", "Reduced from": "에서 감소",
    "Additional functionality": "추가된 기능", "New functionality": "새로운 기능", "Rework": "개편",
    "Reworked": "개편", "Removed": "삭제", "Moved from": "에서 옮겨짐", "New Talent": "신규 특성",
    "Fixed an issue": "문제를 수정했습니다", "no longer": "더 이상 ~하지 않습니다",
}


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8-sig"))


def strip_tags(s):
    return re.sub(r"<[^>]+>", "", s or "").strip()


def main():
    en = load(EN)["items"]
    ko_src = KO_FALLBACK if KO_FALLBACK.exists() else None
    if ko_src is None:
        raise SystemExit("kokr gamestrings 없음 — fetch_heroes_data.py 를 먼저 실행")
    ko = load(ko_src)["items"]

    def pair(section, field):
        out = {}
        e, k = en.get(section, {}).get(field, {}), ko.get(section, {}).get(field, {})
        for key, ev in e.items():
            kv = k.get(key)
            if not kv:
                continue
            ev, kv = strip_tags(ev), strip_tags(kv)
            if ev and kv and ev != kv and len(ev) < 60:
                out.setdefault(ev, kv)
        return out

    # 영웅별 표: linkId 앞부분이 그 영웅의 기술·특성이다. herodata 로 영웅↔linkId 를 잇는다.
    by_hero = {}
    if HERODATA.exists():
        hd = load(HERODATA)
        items = hd.get("items") or hd
        en_ab, ko_ab = en.get("ability", {}), ko.get("ability", {})
        en_tl, ko_tl = en.get("talent", {}), ko.get("talent", {})
        for hid, h in items.items():
            if not isinstance(h, dict):
                continue
            t = {}
            for group in (h.get("abilities") or {}).values():
                for a in group:
                    k = a.get("linkId")
                    e, kk = strip_tags(en_ab.get("name", {}).get(k)), strip_tags(ko_ab.get("name", {}).get(k))
                    if e and kk and e != kk:
                        t[e] = kk
            for group in (h.get("talents") or {}).values():
                for a in group:
                    k = a.get("linkId")
                    e, kk = strip_tags(en_tl.get("name", {}).get(k)), strip_tags(ko_tl.get("name", {}).get(k))
                    if e and kk and e != kk:
                        t[e] = kk
            for uid, u in (h.get("heroUnits") or {}).items():
                e, kk = strip_tags(en.get("unit", {}).get("name", {}).get(uid)), strip_tags(ko.get("unit", {}).get("name", {}).get(uid))
                if e and kk and e != kk:
                    t[e] = kk
            if t:
                by_hero[hid] = t

    heroes = pair("hero", "name")
    units = pair("unit", "name")
    abilities = pair("ability", "name")
    talents = pair("talent", "name")
    # 특수문자 표기(아포스트로피·악센트)가 다른 영웅 이름도 한글명으로 이어 준다
    for e, k in list(heroes.items()):
        for v in (e.replace("'", "’"), e.replace("’", "'")):
            heroes.setdefault(v, k)
    maps = {}
    mj = ROOT.parent / "hots_scrap" / "site" / "replay" / "js" / "data_maps.js"
    if mj.exists():
        for m in re.finditer(r'"ko": "([^"]+)", "en": "([^"]+)"', mj.read_text(encoding="utf-8")):
            maps[m.group(2)] = m.group(1)
    alias = {  # 노트 표기 흔들림(아포스트로피·악센트·띄어쓰기) → 영웅 id
        "D.Va": "DVa", "DVa": "DVa", "Lucio": "Lucio", "Lúcio": "Lucio",
        "Anubarak": "Anubarak", "Anub'arak": "Anubarak", "Anub’arak": "Anubarak",
        "Guldan": "Guldan", "Gul'dan": "Guldan", "Gul’dan": "Guldan",
        "Kaelthas": "Kaelthas", "Kael'thas": "Kaelthas", "Kael’thas": "Kaelthas",
        "Zuljin": "Zuljin", "Zul'jin": "Zuljin", "Zul’jin": "Zuljin",
        "Greymane": "Greymane", "Graymane": "Greymane", "Genn Greymane": "Greymane",
        "Cho'Gall": ["Cho", "Gall"], "Cho'gall": ["Cho", "Gall"], "ChoGall": ["Cho", "Gall"], "Cho’Gall": ["Cho", "Gall"],
        "The Lost Vikings": "LostVikings", "Lost Vikings": "LostVikings",
        "E.T.C.": "L90ETC", "ETC": "L90ETC", "Sgt. Hammer": "SgtHammer", "Sgt Hammer": "SgtHammer",
        "Li-Ming": "Wizard", "Li Li": "LiLi", "Lt. Morales": "Medic", "Mal'Ganis": "MalGanis", "MalGanis": "MalGanis",
        "Deckard Cain": "Deckard", "The Butcher": "Butcher", "Kel'Thuzad": "KelThuzad", "KelThuzad": "KelThuzad",
        "Junkrat": "Junkrat", "Qhira": "Qhira", "Imperius": "Imperius", "Mei": "Mei", "Hogger": "Hogger",
    }
    alias_bg = {"Volskaya": "volskaya_foundry", "Hanamura": "hanamura_temple", "Braxis": "braxis_holdout",
                "Blackheart": "blackheart_s_bay", "Mines": "haunted_mines", "Death Mines": "haunted_mines"}
    # 여러 영웅이 같은 영문 이름을 다른 한글로 쓰는 경우 목록 (전체 표만 믿으면 틀리는 자리)
    conflicts = {}
    for hid, t in by_hero.items():
        for e, kk in t.items():
            conflicts.setdefault(e, set()).add(kk)
    conflicts = sorted(e for e, v in conflicts.items() if len(v) > 1)
    doc = {
        "alias_heroes": alias, "alias_battlegrounds": alias_bg,
        "byHero": by_hero, "ambiguous": conflicts,
        "source": "HeroesToolChest gamestrings 2.55.16.97039 (enus ↔ kokr) + hots_scrap 맵 이름표",
        "heroes": heroes, "units": units, "abilities": abilities, "talents": talents,
        "battlegrounds": maps, "common": COMMON,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"용어집: 영웅 {len(heroes)} · 유닛 {len(units)} · 기술 {len(abilities)} · 특성 {len(talents)} · 전장 {len(maps)} · 일반 {len(COMMON)}")
    print(f"        영웅별 표 {len(by_hero)}명 (항목 {sum(len(v) for v in by_hero.values())}) · 영웅마다 뜻이 갈리는 이름 {len(conflicts)}개 → {OUT}")


if __name__ == "__main__":
    main()
