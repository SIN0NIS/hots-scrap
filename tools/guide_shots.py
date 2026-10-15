# -*- coding: utf-8 -*-
"""사용법 페이지(site/guide/)에 들어갈 **실제 화면 사진**을 찍고, 강조할 자리를 잰다.

사진을 손으로 찍어 두면 사이트가 바뀔 때마다 낡는다. 그래서 찍는 일을 이 도구에 맡긴다 —
화면마다 '어디로 가서 → 무엇을 누르고 → 어디를 찍고 → 어디에 번호를 달지'를 아래 SHOTS 에
적어 두고, 사이트를 고친 뒤 다시 돌리면 사진과 번호 자리가 같이 새로 맞춰진다.

    python tools/devserver.py 8801          # 먼저 띄워 둔다
    python tools/guide_shots.py             # 전부
    python tools/guide_shots.py b-talent    # 몇 장만 (id)

결과
    site/guide/shots/<id>.jpg   사진
    site/guide/shots.json       { id: { w, h, marks: [[x, y, w, h], ...] } }  — 번호 차례대로
사용법 페이지의 글은 site/guide/index.html 에 손으로 쓴다. 글의 ①②③ 은 marks 의 차례다.

준비물: pip install playwright (브라우저는 따로 받지 않는다 — PC 의 크롬을 쓴다)
"""
import io
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "guide"
# **localhost 로 열지 않는다.** 도감의 ⚠·메모·메모 막대는 주소가 localhost·127.* 일 때만 켜지는
# 개발용이라, 그대로 찍으면 공개 사이트에 없는 단추가 사진에 나온다. scrap.test 를 이 PC 로
# 돌려(크롬 --host-resolver-rules) 공개 사이트와 같은 조건으로 찍는다.
BASE = "http://scrap.test:8801/site/"
W, H = 1280, 800

# 사진에 안 나와야 할 것
#   되돌아가기 단추 — 찍는 동안 기록이 쌓여 생긴다
HIDE_CSS = "#scrap-back{display:none!important}"


def scroll_inner_top(pg):
    """안쪽 칸만 스크롤되는 화면(특성 찍기)은 그 칸을 맨 위로 돌린다."""
    pg.evaluate("""() => { for (const e of document.querySelectorAll('*')) {
        const s = getComputedStyle(e);
        if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 5) e.scrollTop = 0; } }""")


def scroll_into(sel, block="start", dy=0):
    def act(pg):
        pg.locator(sel).first.evaluate(
            "(e, a) => { e.scrollIntoView({block: a[0]}); if (a[1]) { "
            "let p = e.parentElement; while (p && p !== document.body) { const s = getComputedStyle(p); "
            "if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 5) { p.scrollTop += a[1]; break; } p = p.parentElement; } "
            "if (!p || p === document.body) window.scrollBy(0, a[1]); } }", [block, dy])
        pg.wait_for_timeout(300)
    return act


def maps_open(키):
    """전장 도감 — 그 전장을 고르고 설명을 넓게(설명만) 편다"""
    def act(pg):
        pg.click(f'.mp[data-k="{키}"]')
        pg.click('.vb[data-v="full"]')
        pg.add_style_tag(content=".sidebody{scroll-behavior:auto!important}")   # 부드러운 스크롤이 끝나기 전에 찍히지 않게
        pg.wait_for_timeout(500)
    return act


def builds_pick(pg):
    """제이나: 1레벨 메인 하나, 4레벨 메인+보조, 7레벨 메인 하나"""
    pg.click(".t-row-0 >> nth=1")
    pg.click(".t-row-1 >> nth=0")
    pg.click(".t-row-1 >> nth=2")
    pg.click(".t-row-2 >> nth=1")
    pg.wait_for_timeout(300)


def tier_url():
    rows = [("S", "ff7f7f", "Jaina,Anubarak,Ana,Abathur"),
            ("A", "ffbf7f", "Rehgar,Muradin,Genji"),
            ("B", "ffdf7f", "Malthael"), ("C", "ffff7f", ""), ("D", "bfff7f", "")]
    return "tier/?t=" + "!".join(f"{a}~{c}:{ids}" for a, c, ids in rows)


def replay_demo(pg):
    pg.click("button.tab[data-mode=replay]")
    pg.wait_for_timeout(300)
    pg.select_option("#sampleSel", "__demo__")
    pg.wait_for_timeout(1500)
    pg.click("#play")
    pg.wait_for_timeout(3200)
    pg.click("#play")
    pg.wait_for_timeout(400)


# ── 찍을 화면 ──────────────────────────────────────────────────────────────
# url   : site/ 기준 주소
# do    : 찍기 전에 할 일(함수 하나 또는 여러 개)
# clip  : 찍을 범위 — 선택자(그 요소 둘레) · None(화면 전체) · (x, y, w, h)
# marks : 번호 달 자리, 차례대로. 선택자 하나 또는 [선택자, …](둘레를 합친다)
# size  : 화면 크기(기본 1280×800)
SHOTS = [
    # 처음 화면
    dict(id="hub", url="", clip=([".top", "#t-viewer", "#foot"], 24),
         marks=["#t-builds", "#t-codex .legs", "#t-replay", "#t-viewer", "#guideBtn", "#themeBtn"]),
    dict(id="bar", url="patchnotes/", clip=("#scrap-bar", 0),
         marks=["#scrap-brand", "#scrap-nav", "#scrap-theme-btn", "#scrap-gh"]),

    # 특성 찍기
    dict(id="b-home", url="builds/?ch=live",
         marks=["#hero-search", ".bh-card[title=가로쉬]", ["#ch-live", "#ch-ptr"], "button.lang-btn >> text=KO / EN"]),
    dict(id="b-stats", url="builds/?ch=live&hero=Jaina", do=[scroll_inner_top],
         marks=[["text=LV 1", "#level-slider"], "#stat-grid"]),
    dict(id="b-talent", url="builds/?ch=live&hero=Jaina", do=[builds_pick, scroll_into(".lv-list-btn", "start", -8)],
         marks=[".t-row-1 >> nth=0", ".t-row-1 >> nth=2", ".lv-list-btn >> nth=0", "#selected-summary",
                ["#code-load-input", "button >> text=불러오기"], "#build-code-box"]),
    dict(id="b-save", url="builds/?ch=live&hero=Jaina", do=[builds_pick],
         clip=("#build-code-box", 220, "up"),
         marks=[["#name-color", "#border-color"], "#footer button >> text=👁 미리보기",
                ["#undo-btn", "button >> text=🗑 초기화"], "input[type=range][min='12']", "#ft-short-wrap",
                ["button.footer-btn >> nth=0", "button.footer-btn >> nth=1"]]),
    dict(id="b-preview", url="builds/?ch=live&hero=Jaina",
         do=[builds_pick, lambda pg: (pg.click("#footer button >> text=👁 미리보기"), pg.wait_for_timeout(900))],
         marks=["#bp-card", ["#bp-name-color", "#bp-border-color", "#bp-bg-color", "#bp-font-color"],
                ["#bp-modal button >> text=Dark", "#bp-modal button >> text=Light"], "#bp-short",
                ["#bp-modal button >> text=저장", "#bp-modal button >> text=복사"]]),
    dict(id="b-list", url="builds/?ch=live&hero=Jaina",
         do=[lambda pg: (pg.click("text=⚖ 특성 나열"), pg.wait_for_timeout(700))],
         marks=["#tc-tabs", ["#tc-modal button >> nth=0", "#tc-modal button >> nth=2"], "#tc-short-lab",
                "#tc-modal .x-btn"]),

    # 위키 — 영웅 도감
    dict(id="h-home", url="herodex/", marks=["#q", ".menu", "#home-grid, .hgrid, .faces"]),
    dict(id="h-hero", url="herodex/?hero=Jaina", marks=[".menu", "#home", "#figs", "#ids"]),
    dict(id="h-card", url="herodex/?hero=Jaina", do=[scroll_into(".card", "start", -10)],
         marks=[".card .chips >> nth=0", ".card .tipv >> nth=0", ".card table >> nth=0", ".card .figz >> nth=0"]),
    dict(id="h-ups", url="herodex/?hero=Jaina", do=[scroll_into(".ups", "center")],
         marks=[".ups >> nth=0", ".goup >> nth=0", ".more >> nth=0"]),
    dict(id="h-jump", url="herodex/?hero=Jaina",
         do=[scroll_into(".ups", "center"), lambda pg: (pg.click(".goup >> nth=0"), pg.wait_for_timeout(1200))],
         marks=["#goback"]),
    dict(id="h-zoom", url="herodex/?hero=Jaina",
         do=[scroll_into(".card", "start", -10), lambda pg: (pg.click(".card .figz >> nth=0"), pg.wait_for_timeout(600))],
         marks=[".hzfig .fig > svg", ".hzfig .cvd", ".hzside", ".hzhead .go", ".hzx"]),
    dict(id="shapes", url="herodex/shapes.html",
         marks=["#q", ["#hero", "#sort"], ["button.f >> text=적", "button.f >> text=둘 다"],
                ["button.f >> text=갈래", "button.f >> text=튕김"], ["button.f >> text=기술", "button.f >> text=특성"],
                ".fig >> nth=0", ".cvd >> nth=0", "a.go >> nth=0"]),
    dict(id="stats", url="herodex/stats.html",
         do=[lambda pg: pg.evaluate("document.getElementById('termrow').open = false")],   # 용어 지도를 접어야 항목 카드가 사진에 든다
         marks=["button.tab >> text=항목 고르기", "button.pill >> nth=0", "#group", ["#q", "#onlynum"], "#termrow > summary", "button.f >> nth=0"]),
    dict(id="stats-open", url="herodex/stats.html",
         do=[lambda pg: (pg.click(".topic >> nth=1 >> button.f >> nth=0"), pg.wait_for_timeout(1200))],
         marks=[["text=큰 값부터", "text=작은 값부터"], "text=닫기", "#pane tr.go >> nth=0"]),
    dict(id="stats-term", url="herodex/stats.html",
         do=[lambda pg: (pg.fill("#q", "생명력"), pg.wait_for_timeout(300),
                         pg.click("#termall"), pg.wait_for_timeout(1500))],
         marks=[".tsec >> nth=0", "#pane button.all >> nth=0", "#pane .tsec tr.go >> nth=0"]),
    dict(id="stats-rank", url="herodex/stats.html",
         do=[lambda pg: (pg.click("button.tab >> text=수치 순위"), pg.wait_for_timeout(1200))],
         marks=["button.tab >> text=수치 순위", ".rankhow > summary", "#ranktab .plegend", "#ranktab .pch >> nth=0",
                "#ranktab .pic .pr >> nth=0"]),
    dict(id="stats-rank-open", url="herodex/stats.html",
         do=[lambda pg: (pg.click("button.tab >> text=수치 순위"), pg.wait_for_timeout(1200),
                         pg.click('.pch[data-k="순위|기술|재사용 대기시간|궁극기(R)"]'), pg.wait_for_timeout(4000))],
         marks=["#pane .pic .pr >> nth=0 >> .pv", "#pane .pic .pr >> nth=0 >> a.tk >> nth=0", "#pane .pic .pr >> nth=0 >> .pn",
                "#pane .pic .pr >> nth=0 >> .pb"]),
    dict(id="stats-table", url="herodex/stats.html",
         do=[lambda pg: (pg.click("button.tab >> text=영웅 수치표"), pg.wait_for_timeout(900))], marks=["table th >> nth=1"]),

    # 위키 번역 도감
    dict(id="ency", url="encyclopedia/",
         marks=["#hero-search", ".filter-row", ".home-hero-card >> nth=0", "button.gl-btn >> text=📘 용어집",
                ["button.set-btn >> text=⚙ 표시 설정", "button.lang-btn"]]),
    dict(id="ency-hero", url="encyclopedia/",
         do=[lambda pg: (pg.click(".home-hero-card >> nth=0"), pg.wait_for_timeout(900))], marks=[]),

    # 전장 도감 — 흐름·자리 사진은 회차 자리가 다 정해진 블랙하트로, 설명을 넓게 펴서 찍는다
    dict(id="maps", url="maps/",
         marks=["#picker", ["#t", "#tmin"], "#rstops", "#keybtn", "#atk", "#jump", "#body .glance"]),
    dict(id="maps-flow", url="maps/", do=[maps_open("blackheartsbay"), scroll_into("#s-흐름", "start", -6)],
         marks=[".ftl", ".flist"]),
    dict(id="maps-place", url="maps/", do=[maps_open("blackheartsbay"), scroll_into("#s-자리차례", "start", -6)],
         marks=[".nxt", ".nxo"]),

    # 패치 기록
    dict(id="patch", url="patchnotes/",
         marks=[["a >> text=패치 목록", "a >> text=전장별 이력"], "#q", ["button >> text=라이브", "button >> text=테스트 서버"],
                ["button >> text=공식 한글", "button >> text=데이터"], ["#heroPick", "#bgPick"], "a.rmain >> nth=1"]),
    dict(id="patch-note", url="patchnotes/",
         do=[lambda pg: (pg.click("a.rmain >> nth=1"), pg.wait_for_timeout(1200))],
         marks=[["button >> text=공식 패치 노트", "button >> text=데이터 변경점"], "text=블리자드 원문에서 직접 확인",
                ["a:has-text(\"가로쉬\") >> nth=0", "a:has-text(\"잘아타스\") >> nth=0"]]),
    dict(id="patch-cal", url="patchnotes/?view=cal", marks=[]),
    dict(id="patch-hero", url="patchnotes/?view=hero&id=Jaina", marks=[]),

    # 티어표
    dict(id="tier", url=tier_url(),
         marks=[["#ttl", "#dt"], "#tiers .tlabel >> nth=0", "#tiers .hero >> nth=0", "#tiers .tside >> nth=0",
                ["#addTier", "#share", "#png"], ["#undo", "#clear", "#reset"]]),
    dict(id="tier-pool", url=tier_url(), do=[scroll_into(".pool", "start", -10)],
         marks=[".pool .chip >> nth=0", "#q", "label.lab", ".pool .hero >> nth=0"]),

    # 리플레이
    dict(id="r-map", url="replay/",
         marks=["#modebar .tabs", ["#mapSel", "#bgLabel"], "#zbar", "#tgl", ["#bgAlpha", "#heroSz", "#uiFs"]]),
    dict(id="r-tool", url="replay/", do=[lambda pg: (pg.click("#tgl"), pg.wait_for_timeout(600))],
         clip=(["#tgl", "#clrAll", "#imgbtn"], 40),
         marks=["button.it >> nth=0", ["button.it >> nth=1", "button.it >> nth=2"], ["button.it >> nth=3", "button.it >> nth=4"],
                "#imgbtn", ["#stage #undo", "#clrAll"]]),
    dict(id="r-play", url="replay/", do=[replay_demo],
         marks=[["#sampleSel", "#repLoadLabel"], "#board", "#stage", "#side", "#controls", ["#tl0", "#tl1"]]),
    dict(id="r-span", url="replay/", do=[replay_demo], clip=("#timeline", 6),
         marks=[["#evPrev", "#play", "#evNext"], [".spd >> nth=0", ".spd >> nth=3"], ["#spanA", "#spanB"],
                ["#spanGo", "#spanLive"]]),
]


def box(pg, sel):
    sels = sel if isinstance(sel, list) else [sel]
    rs = []
    for s in sels:
        loc = pg.locator(s).first
        try:
            r = loc.bounding_box(timeout=2500)
        except Exception:
            r = None
        if r and r["width"] > 0:
            rs.append(r)
        else:
            print(f"    ! 못 찾음: {s}")
    if not rs:
        return None
    x0 = min(r["x"] for r in rs); y0 = min(r["y"] for r in rs)
    x1 = max(r["x"] + r["width"] for r in rs); y1 = max(r["y"] + r["height"] for r in rs)
    return x0, y0, x1 - x0, y1 - y0


def shoot(pw, spec):
    size = spec.get("size", (W, H))
    br = pw.chromium.launch(channel="chrome", args=["--host-resolver-rules=MAP scrap.test 127.0.0.1"])
    ctx = br.new_context(viewport={"width": size[0], "height": size[1]}, color_scheme="light", locale="ko-KR")
    ctx.add_init_script("try{localStorage.setItem('scrap.theme','light')}catch(e){};"
                        "document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');"
                        f"s.textContent={json.dumps(HIDE_CSS)};document.head.appendChild(s)}});")
    pg = ctx.new_page()
    pg.goto(BASE + spec["url"])
    pg.wait_for_load_state("networkidle")
    pg.wait_for_timeout(900)
    for f in (spec.get("do") or []):
        f(pg)
    pg.wait_for_timeout(400)

    clip = spec.get("clip")
    if clip is None:
        cx, cy, cw, ch = 0, 0, size[0], size[1]
    elif isinstance(clip[0], (str, list)):
        b = box(pg, clip[0])
        pad = clip[1]
        if len(clip) > 2 and clip[2] == "up":       # 그 요소부터 화면 아래 끝까지
            cx, cy, cw, ch = 0, max(0, b[1] - pad), size[0], size[1] - max(0, b[1] - pad)
        else:
            cx, cy = max(0, b[0] - pad), max(0, b[1] - pad)
            cw, ch = min(size[0] - cx, b[2] + 2 * pad), min(size[1] - cy, b[3] + 2 * pad)
    else:
        cx, cy, cw, ch = clip
    cx, cy, cw, ch = (round(v) for v in (cx, cy, cw, ch))

    marks = []
    for m in spec.get("marks", []):
        b = box(pg, m)
        if not b:
            marks.append(None)
            continue
        P = 4
        x0 = max(0, b[0] - P - cx); y0 = max(0, b[1] - P - cy)
        x1 = min(cw, b[0] + b[2] + P - cx); y1 = min(ch, b[1] + b[3] + P - cy)
        if x1 - x0 < 6 or y1 - y0 < 6:              # 찍는 범위 밖이다 — 번호를 달 수 없다
            print(f"    ! 사진 밖: {m}")
            marks.append(None)
            continue
        marks.append([round(x0), round(y0), round(x1 - x0), round(y1 - y0)])

    (OUT / "shots").mkdir(parents=True, exist_ok=True)
    pg.screenshot(path=str(OUT / "shots" / f"{spec['id']}.jpg"), type="jpeg", quality=82,
                  clip={"x": cx, "y": cy, "width": cw, "height": ch})
    br.close()
    return {"w": cw, "h": ch, "marks": marks}


def main():
    want = set(sys.argv[1:])
    path = OUT / "shots.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    with sync_playwright() as pw:
        for spec in SHOTS:
            if want and spec["id"] not in want:
                continue
            print("•", spec["id"])
            data[spec["id"]] = shoot(pw, spec)
    order = [s["id"] for s in SHOTS]
    data = {k: data[k] for k in order if k in data}
    io.open(path, "w", encoding="utf-8", newline="\n").write(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print("→", path)


if __name__ == "__main__":
    main()
