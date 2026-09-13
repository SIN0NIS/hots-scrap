# 히오스 한글 패치노트 + 데이터 diff 작업 가이드

hots-scrap 사이트에 "한글 패치노트 아카이브 + 버전별 인게임 데이터 변경점" 페이지를 추가하기 위한 로컬 작업 가이드입니다. Claude Code(또는 직접) 작업 시 이 문서를 그대로 지시서로 쓰면 됩니다.

참고 사이트(영문): https://nexus-patch-notes.github.io/ — All rights reserved. 콘텐츠·코드 사용 금지, 구성만 참고.

---

## 0. 탐색 결과 요약

### 공식 한글 패치노트
- 출처: `https://news.blizzard.com/ko-kr/heroes-of-the-storm` (블리자드 코리아 공식)
- 글 URL 형식: `https://news.blizzard.com/ko-kr/article/{articleId}/{slug}`
  - 예: `/ko-kr/article/24291432/2026-7-21` (라이브 패치 노트 2026-07-21)
  - 예: `/ko-kr/article/24276959/2026-5-12` (밸런스 패치 노트 2026-05-12)
- 본문 구조 (파싱 기준):
  - 제목: `히어로즈 오브 더 스톰 {라이브|밸런스|PTR} 패치 노트 – YYYY년 M월 D일`
  - 상위 섹션: `일반` / `전장 업데이트` / `밸런스 업데이트` / `버그 수정`
  - 밸런스 업데이트 안에서 영웅별 h4 (`아바투르`), 그 아래 `기본` / 특성 / 기술별 항목
- 주의: **버전 번호 없음**(날짜만). 버전 매칭은 아래 heroes-data 저장소의 빌드 번호와 날짜로 맞춘다.
- **[2026-09-12 확인] 목록은 RSS 없음(404). 내부 API 사용:**
  - 첫 페이지 `GET /ko-kr/api/news/heroes-of-the-storm?` → `feed.contentItems`, `feed.pagination`
  - 이후 `GET /ko-kr/api/feed/heroes-of-the-storm?offset=N` → `contentItems`, `pagination.hasNextPage`
  - category 는 일관성이 없어(패치 노트가 '새소식'으로 분류된 게 다수) 제목 정규식 `패치\s*노트|^히어로즈 오브 더 스톰 밸런스 업데이트` 로 필터
  - 한글 아카이브 최고(最古) 글은 2017-01-13. 그 이전(2014~2016)은 "데이터 diff만" 제공.
- 팬 번역(루리웹/아카라이브)은 사용하지 않음(사용자 결정: 공식 데이터만).

### 버전별 인게임 데이터 (한글 포함) — 있음
**HeroesToolChest** 조직의 저장소가 정확히 원하는 형태다. MIT 라이선스.

| 저장소 | 범위 | 비고 |
|---|---|---|
| `HeroesToolChest/heroes-data` | 2.47.2.76003 ~ 2.55.16.97039 (133개 버전 폴더) | 2026-07 아카이브(읽기 전용). 각 버전 = full JSON |
| `HeroesToolChest/heroes-data2` | 2.55.16.97039 ~ 2.55.17.97771 (최신) | 신규 저장소. JSON Patch 형식(아래 참고) |
| `HeroesToolChest/heroes-images` | 아이콘 이미지 | 필요시 |
| `HeroesToolChest/HeroesDataParser` | 추출 도구(.NET) | `json patch apply` 명령 포함 |

- 폴더 구조: `heroesdata/{version}/data/*.json` + `heroesdata/{version}/gamestrings/gamestrings_{build}_{locale}.json`
- **로케일 12개 포함: `kokr` 있음** (dede, enus, eses, esmx, frfr, itit, kokr, plpl, ptbr, ruru, zhcn, zhtw)
- kokr gamestrings 구조:
  ```json
  {
    "meta": {"version": "97039", "locale": "kokr"},
    "gamestrings": {
      "unit": {"name": {"Abathur": "아바투르"}, "description": {...}, "role": {...}, ...},
      "abiltalent": {"name": {"AbathurSymbiote|...": "공생체"}, "full": {...}, "short": {...}, "cooldown": {...}, "energy": {...}, "life": {...}},
      "announcer": ..., "heroskin": ..., "mount": ..., "voiceline": ..., ...
    }
  }
  ```
- 한 버전의 gamestrings 폴더가 약 46 MB(12개 로케일 합계). kokr 하나는 ~4 MB.
- PTR 버전은 폴더명에 `_ptr` 접미사.
- heroes-data2는 "patch" 형식: `.hdp.json`의 `depends-on`을 따라 root-version부터 JSON Patch를 순서대로 적용해야 full JSON이 됨. `.version.json`에 `latest`, `latest-full`, `versions[]` 목록이 있다.

---

## 1. 목표 산출물

```
site/patchnotes/                 # 새 앱
  index.html                     # 패치 목록 + 영웅/전장 필터
  patch.html?v=YYYY-MM-DD        # 개별 패치 페이지 (공식 노트 + 데이터 diff 탭)
data/patchnotes/
  index.json                     # 전체 패치 목록 (날짜, 종류, 버전, 관련 영웅/전장)
  official/{YYYY-MM-DD}.json     # 공식 한글 패치노트 파싱 결과
  diff/{fromBuild}-{toBuild}.json# 인게임 데이터 변경점(한글)
pipeline/steps/
  fetch_official_patchnotes.py
  parse_official_patchnotes.py
  fetch_heroes_data.py
  diff_heroes_data.py
  build_patch_index.py
```

---

## 2. 단계별 작업

### Step A. 공식 한글 패치노트 수집 (`fetch_official_patchnotes.py`)

1. 목록 확보 — 위 0절의 내부 API 로 `offset` 페이지네이션. 제목에 `패치 노트`(또는 2017년식 `밸런스 업데이트`) 포함된 글만.
2. 개별 글 다운로드
   - `raw/official/{articleId}.html`로 원본 저장(재파싱 대비, 재요청 방지).
   - 요청 간 1~2초 sleep, User-Agent 지정, 이미 있는 파일은 skip.
3. 결과: `raw/official/list.json` = `[{newsId, url, title, published, category, isPatchNote}]`

### Step B. 파싱 (`parse_official_patchnotes.py`)

입력: raw HTML → 출력: `data/patchnotes/official/{date}.json`

```json
{
  "date": "2026-07-21",
  "kind": "live",             // live | balance | ptr | hotfix | patch
  "title": "히어로즈 오브 더 스톰 라이브 패치 노트 – 2026년 7월 21일",
  "source": "https://news.blizzard.com/ko-kr/article/24291432/2026-7-21",
  "sections": [
    {"name": "일반", "key": "general", "html": "..."},
    {"name": "전장 업데이트", "key": "battlegrounds", "html": "...", "items": [{"name": "하나무라 사원", "battleground": "hanamura_temple", "html": "..."}]},
    {"name": "밸런스 업데이트", "key": "balance", "html": "...", "heroes": [
      {"name": "아바투르", "heroId": "Abathur", "html": "...",
       "changes": [{"group": "base|talent", "level": 1, "name": "맹독 둥지", "key": "Q", "new": false,
                    "lines": [{"text": "…", "html": "…", "added": false}]}]}
    ]},
    {"name": "버그 수정", "key": "bugs", "html": "...", "items": [...]}
  ],
  "heroes": ["Abathur", "..."],
  "battlegrounds": ["hanamura_temple", "..."]
}
```

- 파서는 BeautifulSoup 사용. 본문 컨테이너는 `section.blog`.
- 색상 인라인 스타일은 의미 클래스로 치환: 주황(추가 텍스트)=`pn-new`, 보라(소제목/전장/영웅)=`pn-h`, 파랑(기술·특성명)=`pn-name`. `<s>`(삭제 텍스트)는 text 에서 `~~…~~`.
- 영웅 이름 → heroId 매핑: hots_scrap `site/data/97650/heroes.json` 의 name 역인덱스. 전장은 `site/replay/js/data_maps.js`. 실패는 `data/patchnotes/unmatched.json` 으로 뽑아 `pipeline/aliases.json` 에 수동 별칭 추가.
- 제목의 날짜에서 `date` 추출. 한글 날짜와 실제 패치 날짜(미국 기준)가 하루 차이 나는 경우 있음 → 버전 매칭 시 ±2일 허용.

### Step C. 인게임 데이터 수집 (`fetch_heroes_data.py`)

전체 clone은 크므로 sparse checkout으로 필요한 것만.

```bash
# 구버전(≤2.55.16.97039)
git clone --depth 1 --filter=blob:none --sparse https://github.com/HeroesToolChest/heroes-data.git vendor/heroes-data
cd vendor/heroes-data
git sparse-checkout set $(git ls-tree --name-only HEAD heroesdata/ | sed 's#$#/data#; p; s#/data$#/gamestrings#' | tr '\n' ' ')
# → 이후 gamestrings 폴더에서 *_kokr.json 외는 삭제 또는 무시

# 신버전(≥2.55.16.97039)
git clone --depth 1 --filter=blob:none --sparse https://github.com/HeroesToolChest/heroes-data2.git vendor/heroes-data2
git -C vendor/heroes-data2 sparse-checkout set heroesdata
```

- heroes-data2의 patch 형식 처리: `.version.json`의 `versions` 순서대로, `.hdp.json`의 `depends-on`을 따라 JSON Patch(RFC 6902) 적용해 full JSON 생성. Python은 `jsonpatch` 패키지로 가능(HeroesDataParser 설치 불필요).
- 버전 폴더명 → 빌드 번호(마지막 숫자) → `data/patchnotes/builds.json`에 `{build, version, isPtr, date}` 저장. 날짜는 git log 또는 `.hdp.json`/릴리스 노트에서 취득.
- 이미 hots-scrap 파이프라인이 자체 추출 데이터를 쓰고 있다면, **최신 버전은 자체 파이프라인, 과거 버전은 heroes-data**로 소스를 나누고 스키마를 통일하는 어댑터를 하나 둔다.

### Step D. 버전 간 diff (`diff_heroes_data.py`)

연속된 두 버전(PTR 제외 옵션)의 `data/*.json` + `gamestrings_*_kokr.json`을 비교.

- 비교 대상: 영웅 기본 스탯(체력/공격력/사거리 등), 기술/특성 수치(쿨다운, 마나), 툴팁 텍스트(kokr `abiltalent.full`), 특성 추가/삭제/티어 이동.
- 출력 `data/patchnotes/diff/{from}-{to}.json`:
  ```json
  {"from": "2.55.17.97605", "to": "2.55.17.97771",
   "heroes": {"Abathur": [
     {"type": "stat", "path": "life.amount", "before": 685, "after": 700},
     {"type": "talent", "id": "AbathurPressurizedGlands", "name": "압축 분비샘",
      "field": "tooltip", "before": "…", "after": "…"},
     {"type": "talent_added", "id": "...", "name": "...", "tier": 4}
   ]}}
  ```
- 텍스트 diff는 문장 단위로 `difflib`로 변경 부분만 하이라이트할 수 있게 `[[-old-]]{{+new+}}` 마킹 저장.
- 노이즈 필터: 숫자 포맷만 바뀐 경우, 순서만 바뀐 배열 등은 정규화 후 비교.

### Step E. 인덱스 통합 (`build_patch_index.py`)

- 공식 노트(날짜) ↔ 빌드(날짜) 매칭 → `index.json`
  ```json
  [{"date": "2026-07-21", "kind": "live", "build": "97605", "version": "2.55.17.97605",
    "official": "official/2026-07-21.json", "diff": "diff/97039-97605.json",
    "heroes": [...], "battlegrounds": [...]}]
  ```
- 매칭 안 되는 항목은 한쪽만 있는 채로 유지(공식만 / diff만).

### Step F. 프론트엔드

- 기존 site/ 앱들과 같은 스타일/공통 데이터 레이어 재사용.
- 목록: 날짜순, 종류 뱃지(라이브/밸런스/PTR/핫픽스), 영웅·전장 필터(다중 선택, URL 파라미터로 공유 가능 — 기존 빌드 공유 URL 방식과 동일하게).
- 개별 페이지: 탭 2개 — "공식 패치노트" / "데이터 변경점". 데이터 변경점 탭은 영웅별 접기, 텍스트 diff 하이라이트.
- 연동: 빌드 메이커 특성 툴팁에 "변경 이력" 링크(`patch.html?hero=Abathur&talent=...`) 추가.
- 출처 표기: 각 공식 노트 하단에 원문 링크, 페이지 하단에 HeroesToolChest(MIT) 크레딧.

### Step G. 자동화

- `.github/workflows/patchnotes.yml`: 주 1회 + 수동 트리거. Step A→E 실행 후 변경 있으면 커밋.
- heroes-data2는 새 빌드가 올라오면 자동 반영되도록 `.version.json`의 `latest`를 비교.

---

## 3. 검증 체크리스트

- [x] 공식 노트 1개를 파싱했을 때 영웅 목록이 원문과 일치하는가 (2026-07-21 라이브: 밸런스 h4 16명 = 파싱 16명, 버그 수정 포함 32명)
- [x] 영웅 이름 매핑 실패 0건 (alias 테이블 포함) — 166건 전체 0건 (전장 후보 15개는 로테이션 안내 등 비전장 라벨)
- [x] heroes-data2 patch 체인 적용(jsonpatch) — 97039→97605 diff 가 2026-07-21 공식 노트와 일치(아바투르 등) 확인
- [x] diff 결과를 공식 노트와 대조 — 2026-07-21 아바투르(식충 번식 16→1·45→75초, 맹독 둥지 10→15, 생존 본능 1→16) 일치
- [x] 모바일 폭(375px)·다크 모드에서 필터/탭 동작 확인
- [x] 총 데이터 용량: 사이트 배포분은 official 14MB + diff 2.5MB + index 112KB. 원본(vendor 727MB)은 로컬 캐시. kokr만 유지 시 버전당 ~4 MB × 140 = 약 560 MB → 사이트에는 diff 결과만 배포하고 원본은 파이프라인 캐시로만 보관

---

## 4. 라이선스/출처 메모

- 공식 패치노트: 블리자드 저작물. 팬 사이트 비상업 인용 + 원문 링크 필수. 전체 전재보다 "요약 + 원문 링크" 형태를 권장하며, 삭제 요청 시 즉시 제거 문구 유지.
- HeroesToolChest/heroes-data, heroes-data2: MIT. 크레딧 표기.
- nexus-patch-notes.github.io: All rights reserved → 콘텐츠/코드 사용 금지, 참고만.

---

## 5. 작업 순서 (합의)

1. 2026-07-21 라이브 패치 1개를 end-to-end(수집→파싱→JSON)로 만들어 확인 ← **완료(2026-09-12)**
2. 전체 166건 확장 ← **완료**
3. Step C~E (heroes-data) ← **완료**
4. Step F 프론트 → 로컬 8802 테스트 ← **완료(2026-09-12)**
5. `hots_scrap/site/patchnotes/` 로 이사 → 8801 재검증 → 커밋 ← 대기
6. Step G 자동화(workflow) ← 대기
