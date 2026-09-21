# -*- coding: utf-8 -*-
"""Step D2. 빌드별 수치 시계열 → site/data/patchnotes/series/<hero>.json

영웅마다, 비-PTR 빌드 순서대로 기술·특성의 수치(재사용 대기시간·자원·툴팁 안 숫자)를 뽑아 시계열로 만든다.
툴팁 숫자는 "골격"(숫자를 # 로 바꾼 문장)이 같은 구간끼리만 같은 자리로 이어 붙인다.
골격이 크게 바뀌면(리메이크·설명 재작성) 새 구간(segment)을 연다 → 프론트가 "이름 (2021-05 ~ 2023-01)" 로 나눠 그린다.

출력 모양:
  {hero, builds:[{build,date,version}], stats:{life:[..],regen:[..],damage:[..],period:[..],range:[..],speed:[..]},
   items:[{id, kind, name, type, level, icon, cooldown:[..], energy:[..], energyLabel,
           segments:[{from,to, text, slots:[{label, values:[..]}]}]}]}
  배열은 builds 와 같은 길이, 없는 빌드는 null.
"""
import difflib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from diff_heroes_data import load_norm  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
PN = ROOT / "site" / "data" / "patchnotes"
OUT = PN / "series"
NUM = re.compile(r"-?\d+(?:\.\d+)?")
SCALE = re.compile(r"\(\+[\d.]+%\)")
CD = re.compile(r"(\d+(?:\.\d+)?)\s*초")
RES = re.compile(r"^([^:：]+)[:：]\s*(\d+(?:\.\d+)?)")


def load(p):
    return json.loads((ROOT / p).read_text(encoding="utf-8-sig"))


def fnum(s):
    v = float(s)
    return int(v) if v.is_integer() else round(v, 3)


def skeleton(text):
    return NUM.sub("#", SCALE.sub("", text or ""))


def slots_of(text):
    """툴팁 → [(값, 라벨)]  라벨 = 그 숫자 자리를 'N' 으로 두고 앞뒤 문맥을 붙인 것.
       특수 기호는 글꼴에 따라 네모로 깨지므로 평범한 글자만 쓴다."""
    t = SCALE.sub("", text or "")
    out = []
    for m in NUM.finditer(t):
        a = t[max(0, m.start() - 9):m.start()]
        b = t[m.end():m.end() + 20]
        lab = re.sub(r"\s+", " ", (a + "N" + b).replace("\n", " ")).strip()
        out.append((fnum(m.group()), lab))
    return out


def cd_num(s):
    m = CD.search(s or "")
    return fnum(m.group(1)) if m else None


def res_num(s):
    m = RES.search((s or "").strip())
    return (m.group(1).strip(), fnum(m.group(2))) if m else (None, None)


class Item:
    def __init__(self, kind, key, n):
        self.kind, self.key, self.n = kind, key, n
        self.name = self.type = self.icon = None
        self.level = None
        self.cooldown = [None] * n
        self.energy = [None] * n
        self.energyLabel = None
        self.segments = []  # dict(from,to,text,skel,slots=[{label,values}])
        self.first = self.last = None
        self.levels = [None] * n

    def feed(self, i, rec, date):
        self.name, self.type, self.icon = rec["name"], rec["type"], rec.get("icon")
        if rec.get("level"):
            self.level = rec["level"]
            self.levels[i] = rec["level"]
        if self.first is None:
            self.first = i
        self.last = i
        self.cooldown[i] = cd_num(rec.get("cooldown"))
        lab, v = res_num(rec.get("energy"))
        self.energy[i] = v
        if lab:
            self.energyLabel = lab
        text = rec.get("full") or ""
        sk = skeleton(text)
        sl = slots_of(text)
        seg = self.segments[-1] if self.segments else None
        same = False
        if seg is not None:
            if seg["skel"] == sk:
                same = True
            elif len(seg["slots"]) == len(sl) and difflib.SequenceMatcher(None, seg["skel"], sk, autojunk=False).ratio() >= 0.75:
                same = True
        if not same:
            seg = {"from": i, "to": i, "text": text, "skel": sk, "name": rec["name"],
                   "slots": [{"label": lab_, "values": [None] * self.n} for _, lab_ in sl]}
            self.segments.append(seg)
        seg["to"] = i
        seg["text_last"] = text
        for k, (v, _) in enumerate(sl):
            seg["slots"][k]["values"][i] = v


def main():
    builds = sorted([b for b in load(PN / "builds.json") if not b["isPtr"]], key=lambda b: b["build"])  # 빌드 번호가 곧 시간순
    n = len(builds)
    heroes = {}  # hid → {"stats":..., "items": {key: Item}, "name":...}
    for i, b in enumerate(builds):
        norm = load_norm(b)   # 못 읽은 값을 앞 빌드 값으로 이어 쓴 정규화본(fills 적용)
        print(f"  [{i + 1}/{n}] {b['version']} {b['date']}", file=sys.stderr)
        for hid, h in norm.items():
            H = heroes.setdefault(hid, {"name": h["name"], "stats": {k: [None] * n for k in ("life", "regen", "damage", "period", "range", "speed")}, "items": {}})
            H["name"] = h["name"]
            st = H["stats"]
            st["life"][i] = (h.get("life") or {}).get("amount")
            st["regen"][i] = (h.get("life") or {}).get("regenRate")
            w = (h.get("weapons") or [{}])[0]
            st["damage"][i], st["period"][i], st["range"][i] = w.get("damage"), w.get("period"), w.get("range")
            st["speed"][i] = h.get("speed")
            for key, rec in h["abilities"].items():
                H["items"].setdefault(key, Item("ability", key, n)).feed(i, rec, b["date"])
            for key, rec in h["talents"].items():
                H["items"].setdefault(key, Item("talent", key, n)).feed(i, rec, b["date"])

    OUT.mkdir(parents=True, exist_ok=True)
    order = {"Q": 0, "W": 1, "E": 2, "Heroic": 3, "Trait": 4, "Active": 5, "Z": 6, "Hidden": 9}
    for hid, H in heroes.items():
        items = []
        for it in H["items"].values():
            segs = []
            for s in it.segments:
                segs.append({"from": s["from"], "to": s["to"], "name": s["name"], "text": s["text"], "textLast": s.get("text_last", s["text"]),
                             "slots": [{"label": sl["label"], "values": sl["values"][s["from"]:s["to"] + 1]} for sl in s["slots"]]})
            items.append({"id": it.key, "kind": it.kind, "name": it.name, "type": it.type, "level": it.level, "icon": it.icon,
                          "first": it.first, "last": it.last, "levels": it.levels,
                          "cooldown": it.cooldown, "energy": it.energy, "energyLabel": it.energyLabel, "segments": segs})
        items.sort(key=lambda x: (0 if x["kind"] == "ability" else 1, x["level"] or 0, order.get(x["type"], 7), x["name"] or ""))
        doc = {"hero": hid, "name": H["name"], "builds": [{"build": b["build"], "date": b["date"], "version": b["version"]} for b in builds],
               "stats": H["stats"], "items": items}
        (OUT / f"{hid}.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"완료: 영웅 {len(heroes)}명, 빌드 {n}개 → {OUT}")


if __name__ == "__main__":
    main()
