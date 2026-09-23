# HotS Scrap — 작업 규약 (Claude 용)

배포 사이트: https://sin0nis.github.io/hots-scrap/ (GitHub `SIN0NIS/hots-scrap`, `main` push 시 Actions 가 `site/` 를 Pages 루트로 자동 배포)

## 작업 흐름: 로컬 테스트 → 이상 없음 → 커밋 → push

1. **로컬 dev 서버**: `python tools/devserver.py 8801` → http://localhost:8801/site/ (no-cache 헤더. 8800 은 캐시 오염으로 폐기).
   Claude 는 `.claude/launch.json` 의 `hots-scrap` 구성으로 브라우저 미리보기를 연다.
2. **검증**: 허브(`/site/`) + 수정한 앱 페이지를 열어 콘솔 오류 0 확인, 다크/라이트 양쪽, 모바일 폭 확인.
   - 콘솔은 **새 탭에서** 본다. 같은 탭을 계속 쓰면 앞 페이지의 오류가 남아 있어 오해한다.
   - 스크립트를 손댔으면 **반드시 브라우저 콘솔로 확인한다.** 파이썬 `esprima` 는 느슨한 모드라 `const` 중복 선언 같은 정적 의미 오류를 못 잡고, `?.`·`??`·`||=` 를 오탐으로 뱉는다.
   - 스크립트를 통째로 바꿔치기하는 수정 스크립트를 쓴 뒤에는 블록이 두 벌 남지 않았는지 함수·상수 이름 중복을 센다.
3. **커밋**: 검증이 끝난 뒤에만 `git commit` (한국어 제목, `앱: 내용` 형식). **push 는 사용자가 지시할 때만.**
   push = 즉시 배포이므로 절대 임의로 하지 않는다.

## 구조

- `site/index.html` 허브 — **`site/data/hub.json` 하나만** 읽는다(요청 1개).
  앱 추가는 `site/apps.json` 에 적고 `pipeline/steps/build_status.py` 를 돌린다 (hub.json 은 생성 파일).
  카드에는 **기준만** 적는다(빌드 번호·회차 수). 갱신 날짜를 앱마다 늘어놓으면 기록처럼 보여서,
  가장 최근 것 하나만 위에 "마지막 업데이트 <날짜>" 로 둔다. hub.json 에는 앱별 시각이 그대로 있다.
  로고는 파일이 아니라 HTML 안에 박혀 있다.
- `site/builds/index.html` 특성 빌드 — 64KB. 영웅 데이터는 `site/data/builds/` 로 분리
  (`index.json` 6KB + `<live|ptr>.<ko|en>.json` 약 1.5MB, 화면이 고른 판·언어 하나만 받는다).
  자료 생성은 `pipeline/steps/build_talent_data.py`
  - 테스트 서버 새 영웅은 번역이 덜 된 채 올라온다. 빈 칸은 영어로 메운다.
  - **빈 칸보다 고약한 것**: 기존 기술을 복사해 만든 기술은 한국어 칸에 *원본 기술의 설명이
    그대로 남아* 있기도 하다(잘아타스 '어둠의 심장 의식' ← 레가르 '속박의 토템').
    `stale_keys()` 가 걸러 낸다 — **이름이 비었는데 설명이 다른 자리와 글자까지 같으면** 찌꺼기로 본다.
    이 판정을 느슨하게 바꾸지 마라(2.57.0.98126 기준 오탐 0, 정탐 1).
- `site/encyclopedia/index.html` 영웅 도감 — **단일 파일(6MB, 데이터 내장)**, 직접 편집
- `site/replay/` 리플레이 뷰어 — `index.html` + `css/` + `js/`(클래식 스크립트, ES 모듈 아님). `js/data_*.js` 는 생성 파일
- `site/shared/scrap.js` 전역 바+테마(한 줄 로드). **`scrap.css` 도 이 스크립트가 스스로 끌어온다** —
  앱은 `scrap.js` 한 줄만 부르면 된다(예전에는 CSS 를 `<link>` 로 부르는 앱이 패치 기록 하나뿐이라
  공통 계층에 규칙을 넣어도 나머지 네 앱에 안 닿았다). 여기 수정 = 전 앱 영향 → 전 앱 회귀 확인
- `site/shared/search.js` **한글 검색기** — 네 앱(빌드·도감·패치 기록·리플레이)이 같이 쓴다. 여기 수정 = 전 앱 회귀 확인
  - `scrapSearch.filter(목록, 검색어, 항목 => [이름들])` · `.score(검색어, 이름들)` · `.mark(이름, 검색어)`
  - **다 친 글자는 글자대로, 자음만 친 것은 그 자리 초성으로** 맞춘다 → `줄ㅈ` 은 줄진만 걸린다.
    검색어를 통째로 초성으로 바꾸는 옛 방식으로 되돌리지 마라(글자를 더 쳐도 안 좁혀진다).
  - 치는 중인 마지막 글자는 받침을 안 따진다(`줄지`→줄진). 앞 글자 받침으로도 본다(`바ㄹ`→발라).
    띄어쓰기·문장부호는 무시(`dva`→D.Va). 사람들이 실제로 치는 표기는 `ALIAS` 에(`디바`→D.Va).
  - **읽는 순서 주의**: 앱의 시동 코드보다 먼저 실려야 한다(도감은 `<head>`, 리플레이는 `js/` 앞).
  - 검색창 접기 상태는 앱별 `localStorage`(`builds.searchHidden` 등). `/` 로 열고 `Esc` 로 지우거나 접는다.
  - 걸린 자리 강조색은 `--hit`(라이트 #8a6414 / 다크 #f0c46a). `--gold` 는 흰 바탕에서 3.7:1 이라 쓰면 안 된다.
- `site/data/97650/` 공통 JSON(heroes.json, heroes/<Id>.json, talents.json), `latest.json` 포인터
- `pipeline/steps/` 데이터 생성 스텝(로컬 실행), `tools/devserver.py`

## 격리 규약 (PLAN.md 요약)

- 앱은 자기 폴더 안에서 완결. 앱 간 함수·전역·이벤트 공유 금지, 이동은 URL 쿼리로만
- localStorage 키는 `앱id.` 접두사 (`builds.*`, `replay.*`, 전역 테마만 `scrap.theme`)
- `data/` JSON 스키마는 추가 전용 (필드 개명·삭제 금지)
- 중량 자산(m3·dds·고화질 맵)은 저장소에 넣지 않음. 단일 파일 100MB 초과 금지
- 아이콘 CDN 은 Pages 주소(`sin0nis.github.io/images/...`), raw.githubusercontent 금지(429)
- **무료 호스팅이라 요청 수와 내려받는 양을 아낀다.** 이미지 주소는 첫 시도가 맞는 것으로 둔다
  (실패 후 폴백은 아이콘 수만큼 404 를 낳는다). 큰 데이터는 화면이 실제로 쓰는 것만, 언어·판별로 쪼개 둔다
  - 없을 수도 있는 파일은 **부르기 전에 알 수 있게** 해 둔다(`heroes.json` 의 `noSeries`, `images/index.json` 의 `missing`)
  - 지금 안 쓰는 것은 받지 않는다: 탭은 보고 있는 탭만, 외부 CDN 은 그 기능을 쓸 때만 (`needHtml2Canvas`)
  - 같은 정보를 두 파일에서 받지 않는다. 받는 중인 요청도 기억해 두 번 나가지 않게 한다
  - 테마별로 파일을 둘 받지 말고, 한 파일을 CSS 로 바꿔 쓴다
- 인코딩 UTF-8(BOM 없음). 큰 단일 파일 HTML 은 Edit 로 부분 수정만 (통째로 다시 쓰지 않기)

## 화면 비율 (폰·태블릿·PC 다 나오게)

- **점검기**: `tools/responsive_probe.js` (개발용, `site/` 밖이라 배포 안 됨).
  브라우저에서 `eval(await (await fetch('/tools/responsive_probe.js')).text()); __probe()` →
  가로 넘침·화면 밖 요소·작은 누름 자리·작은 글자·화면보다 큰 고정 요소를 한 번에 센다.
- **재는 기준 크기**: 320x568 · 360x740 · 414x896 · 768x1024 · 812x375(가로 폰) · 1440x900.
  세로가 짧은 비율(가로로 눕힌 폰)에서 자주 깨지므로 빼지 마라.
- **앱을 '쓰는 상태'로 재라.** 리플레이 뷰어는 `body.mode-map` 이 재생 막대·옆 칸을 숨기므로
  **리플레이를 실제로 불러(예제 선택) 재야** 한다. 안 그러면 320px 에서 402px 넘치는 것을 못 본다.
- **누를 크기 44px** 는 `@media (any-pointer:coarse)` 에서 `min-height` 로 준다.
  `::after` 띠로 넓히지 마라 — 단추가 줄바꿈되면 윗줄 띠가 아랫줄 단추를 덮어 **엉뚱한 것이 눌린다**
  (빌드메이커에서 '본 서버' 아래를 누르면 KO/EN 이 실행됐다).
  `pointer:coarse` 말고 `any-pointer:coarse` 를 쓴다(트랙패드 붙인 태블릿이 빠져나간다).
- **칸이 많은 표는 줄이지 말고 밀어 보게 한다.** 달력은 700px 이하에서 `.cal-scroll` 로 감싸
  칸 34px 을 지키고 연도 칸을 `position:sticky` 로 왼쪽에 붙인다(칸을 욱여넣으면 22px·글자 9px 이 된다).
- **경계 바로 위가 더 좁아지지 않는지** 확인해라. 600px 경계였을 때 601px 에서 칸이 34→24px 로 되레 줄었다.

## 외부 연동 통로 (깨뜨리면 안 되는 공개 API)

- 리플레이: `replay/?src=<URL>` (`?replay=` 동일), 허용 호스트는 `replay/js/main.js` 의 `SRC_ALLOW`
- 빌드: `builds/?b=[T코드,영웅]`, `builds/?hero=<hyperlinkId>` (자료 적재 뒤에 실행되도록 `__bootQuery` 로 미뤄 둠)

## 자동 갱신

**서버(GitHub Actions)가 하는 일** — `.github/workflows/update-patchnotes.yml`, **6시간마다** — cron 은 UTC 00:10·06:10·12:10·18:10 = 한국 09:10·15:10·21:10·03:10
- 확인은 요청 **3개**로 끝난다(한국어 뉴스 1 + 영어 뉴스 1 + GitHub 빌드 목록 1). 새 것이 없으면 그대로 끝난다.
- 블리자드 뉴스에 **한국어 공식 노트**가 새로 뜨면 받아서 파싱하고 색인을 다시 만든 뒤 바로 커밋·푸시한다.
  PC 가 꺼져 있어도 돈다.
- **배포는 직접 깨워야 한다.** `GITHUB_TOKEN` 으로 한 푸시는 다른 워크플로를 깨우지 못한다(재귀 방지 규칙).
  `pages.yml` 은 `push` 로 도는데 봇 푸시는 무시되므로, 커밋한 뒤 `gh workflow run pages.yml` 로 배포를 깨운다.
  (`workflow_dispatch` 와 `repository_dispatch` 만 그 규칙의 예외다.)
- 색인 생성에 필요한 빌드 자료는 **두 개뿐**이라 `ci_prepare.py` 가 heroes-data2 를 얕게 받아 그 둘만 복원한다
  (vendor 전체를 받지 않는다). `vendor/full` 은 캐시한다.
- **새 게임 빌드도 서버가 반영한다.** 변경점(diff) · 빌드메이커 자료 · 아이콘 · 색인 · 허브 상태.
  - 테스트 서버 빌드는 가벼운 길: `fetch_heroes_data.py --data2-only` (옛 저장소 614MB 를 안 받는다.
    옛 저장소는 2026-07 에 멈춰서 builds.json 에 적힌 것을 이어 쓰면 된다 — 전체 경로와 결과가 글자까지 같다)
  - 본 서버 빌드는 변천도(`build_series.py`)가 본 서버 빌드 전부를 훑어야 해서 옛 저장소까지 받는다(한 달에 한두 번).
    러너 안에서 도는 일이라 내 Pages 에는 요청이 가지 않는다.
  - 실패하면 이슈에 "자동 반영 실패"를 적고 그 실행을 실패로 남긴다(메일). 다 끝나 할 일이 없으면 열린 이슈를 닫는다.
- 번역이 필요한 영문 노트만 **이슈로 알린다**(라벨 `auto-update`). 번역은 로컬 예약 작업이 한다.
- **빌드 날짜는 커밋 기록에서 뽑는다 → 얕은 클론이면 날짜가 한 날로 뭉개진다.**
  `fetch_heroes_data.py` 가 얕은 클론을 보면 스스로 `--unshallow` 하고, 못 하면 멈춘다. 이 보호 장치를 빼지 마라
  (2026-09-20: 빌드 7개가 전부 같은 날로 찍혀 공식 노트 3건의 짝이 풀렸었다. `ci_prepare.py` 의 `--depth 1` 클론이 원인).

**저장소는 이것 하나다.** 옛 작업 저장소(`hots_nexus_kor_date260912`)는 은퇴했다 — 번역 작업 파일 `raw/`(git 무시)도 여기로 옮겼다.
거기 자료는 뒤처져 있으니 거기서 파이프라인을 돌리거나 파일을 맞춰 넣지 마라.

**로컬에서 하는 일** — Claude 예약 작업 `hots-scrap-patch-update` (월·금 10:00, 앱이 켜져 있을 때)
- 한국어판이 없는 영문 노트 번역
- 내 PC 보관소 쌓기(`archive_builds.py`)
- 서버가 새 게임 빌드 반영에 실패했을 때만 대신 돌리기

**내 PC 보관소** — `python pipeline/steps/archive_builds.py` → `D:/03-Fun/01_Game/03_claude/hots_archive` (저장소 **밖**, GitHub 에 안 올라간다)
- `mirrors/*.git` 원본 저장소 통째 거울(모든 언어·전 기록, 약 200MB). 지우는 동기화(prune)를 하지 않고,
  받을 때마다 `refs/archive/<커밋>` 을 남겨 원본이 기록을 갈아엎어도 옛 커밋이 안 버려진다.
- `builds/hdp4/<버전>/` 옛 형식(2019-10~2026-07) 원본 그대로 · `builds/hdp5/<버전>/` 새 형식은 JSON Patch 사슬을 붙인 **완성본**.
  `2.55.16.97039` 는 두 형식 모두에 있어서 세대별로 폴더를 나눴다. 기본 언어는 kokr + enus.
- 원본이 `"duplicate"` 로 다른 빌드를 가리키면 그 빌드 파일을 담고 `sameAs` 를 적는다. `extracted:false` 는 `noData` 에 적고 다시 안 찾는다.
- 이미 쌓인 것은 건너뛴다(다시 돌려도 0개). `--status` · `--verify` · `--limit N` · `--locales`(원본에 없는 언어는 막는다).
- **원본은 이미 올린 빌드를 나중에 고치기도 한다**(2026-06-13·07-25 에 뿌리 빌드를 고친 전례). 빌드마다 원본 폴더 지문
  (git tree id, 새 형식은 뿌리~여기까지의 `chainId`)을 적어 두고, 달라지면 그 빌드와 **거기 기대는 뒤 빌드**를 다시 만든다.
- 옛 형식은 **원본 바이트 그대로**다. `git archive` 는 윈도우 기본 설정(autocrlf)대로 줄바꿈을 CRLF 로 바꾸므로
  반드시 `-c core.autocrlf=false` 로 꺼낸다. `--verify` 가 파일마다 git blob id 까지 대조한다(2,451개 일치).
- 새 형식의 정확성은 `vendor/full` 복원본과 JSON 대조로 확인했다(9/9 일치). 복원 로직을 바꾸면 다시 대조해라.
- 한 저장소가 막혀도 다른 저장소는 계속 쌓고, 색인은 '다 쓴 뒤 바꿔치기'(+`.bak`)로 저장한다.
- **윈도우 작업 스케줄러에도 물려 있다** — `\HotS Scrap\Archive game data (weekly)`, 토요일 12:00
  (놓치면 다음에 PC 가 켜졌을 때 돈다). Claude 앱이 꺼져 있어도 쌓인다. 관리자 권한 없이 사용자 계정으로만 돈다.
  `pythonw.exe archive_builds.py --log <보관소>/archive.log` — 창 없이 돌므로 결과는 그 기록 파일에 남는다(1MB 넘으면 스스로 줄인다).
  창 없는 프로세스가 git 을 부르면 콘솔 창이 번쩍이므로 `CREATE_NO_WINDOW` 로 부른다. 이 둘을 빼지 마라.
  파이썬을 새로 깔아 경로가 바뀌면 작업의 실행 파일 경로도 고쳐야 한다(`pythoncore-3.14-64\pythonw.exe`).

**데이터 변경점(diff) 엔진** — `pipeline/steps/diff_heroes_data.py` (2026-09-21 재작성, 조사 근거는 계획 파일에)
- 기술 키는 `buttonId|type` 이다. nameId/abilityId 는 HDP 판마다 부모/자식 선택이 바뀌지만(이렐 응징의 격노) buttonId 는 같다.
- **원본(HDP)이 수식을 못 풀면 숫자 자리에 0 을 뱉는다.** 7년치 diff 에서 진짜 "→0" 변경은 0건이었다.
  5.x 는 따옴표 없는 마크업(`<c val=#TooltipNumbers>0</c>`)이 표식이고 그 문자열의 0 아닌 숫자도 낡은 값이다(라그나로스 90≠정상 110).
  4.x 는 91093 까지 `##ERROR##`, 그 뒤로는 표식이 없어 앞 빌드와 문장 골격을 맞춰 잡는다. 잡은 자리는 **앞 빌드 값을 이어 쓴다**(carry-forward).
  이어 쓴 자리는 `site/data/patchnotes/fills/<version>[_ptr].json` 에 남고 `load_norm()` 이 적용한다 — series·index·빌드메이커가 모두 이것을 쓴다.
  서버(Actions)는 직전 라이브 + 최신 두 빌드만 복원하므로 **fills 는 커밋 대상**이다(없으면 서버 diff 가 로컬과 달라진다).
  이어 쓸 값이 없으면 `?` 로 두고 항목에 `suspect` 를 단다(화면 "값 불확실"). 0 을 그대로 찍지 않는다.
- `heroUnits`(공생체·조종사·용암 거인·바이킹…)와 `subAbilities`(기술·특성이 주는 버튼)도 비교한다. 본체와 글자까지 같은 버튼·탈것 해제류는 뺀다.
- **삭제/신규는 상대 빌드의 펼친 색인(본체+유닛+하위)에 없을 때만** 보고한다(데스윙 맹격↔용암 폭발 같은 배치 이동은 변경이 아니다).
- **형식 경계(heroes-data → heroes-data2, 96881→97039)에서는 유닛·하위 기술의 삭제/신규와 하위 기술 비교를 하지 않는다**(5.x 만 특성 활성기를 하위에 넣어 +243 이 뜬다). diff 문서에 `schemaBoundary` 가 붙는다.
- 이름이 같은 removed/added 는 `renamed`(개편, ID 변경)로 묶고, 같은 단계에 removed 1·added 1 이면 `*_replaced`(칸 교체, 추정)로 묶는다. ID 공통 접두 규칙은 정탐 0 이라 넣지 않았다.
- 재사용 대기시간·자원은 숫자만 비교한다("마나: 10"→"기력: 10" 은 라벨 오류). 특성은 양쪽 다 값이 있을 때만. 무기는 `isDisabled` 를 빼고 nameId 로 비교.
- 전체 재생성은 `--force --ptr` 로 한 번에, **단독으로** 돌린다(빌드 136개 순차, 수 분).

**아이콘**: 내 이미지 저장소 `SIN0NIS/images`(Pages) 가 맡고, **그 저장소가 스스로 채운다.**
```
hots-scrap  (6시간마다 :10)  fetch_missing_icons.py → site/images/index.json 의 need 에 "부르는데 없는 것"을 적는다
     ↓ (40분 뒤)
images      (6시간마다 :50)  tools/pick_icons.py → need 만 블리자드 서버(CASC)에서 콕 집어 꺼내 넣는다
     ↓ (다음 회차)
hots-scrap  들어온 것은 site/images/ 임시본을 지우고 missing 에서 뺀다
```
- **전부 다시 뽑지 않는다.** 목록에 없는 것만. 빠진 게 없으면 블리자드에 요청 0개.
  전체 추출(`online -e hero:images`)은 게임 데이터까지 읽어야 해서 10분에 1GB 를 넘기고도 안 끝난다 — 쓰지 마라.
  이름으로 콕 집는 `casc-extract online -i` 는 파일 목록 약 250MB + 아이콘 몇 KB, 1~2분.
- **"어디에도 없다"던 옛 특성 아이콘도 게임 파일 속에는 남아 있다**(현재 데이터가 안 부를 뿐이라 다른 추출본에 없던 것).
  2026-09-23 에 21장을 이렇게 되살렸다. HeroesToolChest 에 없다고 게임에 없는 게 아니다.
- 게임에도 없는 이름은 images 의 `manifest.json` → `absent` 에 **서버별로** 빌드와 함께 적고, 그 서버 빌드가 바뀔 때까지 안 찾는다
  (안 그러면 없는 이름 하나 때문에 6시간마다 250MB 를 헛받는다. 한쪽 빌드만 바뀌면 그쪽만 다시 찾는다).
- 한쪽 서버를 못 봐도 다른 쪽은 계속하고, 받아 놓은 것은 올린다. 못 본 서버에는 '없다'고 적지 않는다(다음에 다시 찾게).
- **예약은 스스로 깨워 둔다.** GitHub 은 공개 저장소의 예약 작업을 60일 무활동이면 끈다. images 는 채울 게 있을 때만
  커밋하므로 새 영웅이 몇 달 안 나오면 조용히 멈춘다 — 매 회차 workflow enable API 를 불러 살려 둔다.
- images 쪽은 있는 파일을 **지우지도 덮어쓰지도 않는다.** 이름이 같고 그림만 바뀐 경우는 잡지 않는다(2026-01~09 실측 0건).
  필요하면 PC 설치본으로 전체를 뽑아(18초) 픽셀로 대조한다 — 바이트 비교는 안 된다(같은 그림도 인코더 따라 1바이트 다르다).
- 저장소끼리 넘나드는 토큰이 필요 없게, 꺼내는 일은 images 저장소 **자기 워크플로**가 한다.
- PC 는 거울만 뜬다: 주간 보관소 작업(`archive_builds.py`)이 `hots_archive/mirrors/images.git` 을 갱신한다.
- 작업용 사본: `D:\03-Fun\01_Game\03_claude\hots_images` (그림은 안 받은 sparse·blobless 사본 — 도구·워크플로만 고친다).

`python pipeline/steps/fetch_missing_icons.py` 가 여기서 하는 일:
- **확인은 요청 3~5개로 끝낸다.** Pages 가 마지막으로 성공한 배포(deployments+statuses)를 찾고, **그 커밋**의
  파일 목록을 트리 API 로 통째로 받아 대조한다. 절대로 아이콘을 하나씩 HEAD 로 찔러 보지 마라(예전 방식 = 내 Pages 에 요청 1,100개).
- **'올라갔다'와 '서빙된다'는 다르다.** Pages 굽기가 실패하면 git 에는 있는데 404 다. 그래서 임시본을 지우는 판단은
  **배포가 확인됐을 때만** 한다(확인 못 하면 그대로 둔다). 안 그러면 그 아이콘이 통째로 사라진다.
- `site/images/index.json` 에 세 목록을 적는다 — `files`(여기 있는 임시본), `missing`(이미지 저장소에도 여기에도 없는 것 —
  앱은 **아예 안 부른다**), `need`(이미지 저장소가 채워 줄 것).
- **이미지 저장소에 들어온 이름은 `missing` 에서 반드시 뺀다.** 안 빼면 들어온 그림이 영영 안 보인다.
- 급한 임시본: 이미지 저장소가 채우기 전에도 그림이 비지 않게 HeroesToolChest/heroes-images(MIT)에서 받아 `site/images/` 에 둔다.
  이미지 저장소가 내주기 시작하면(또는 아무도 그 이름을 안 부르게 되면) 임시본은 **지운다**(남으면 화면이 계속 임시본을 먼저 부른다).
- 목록은 내려받은 게 없어도 **항상** 다시 쓴다(안 그러면 파일을 지운 뒤 유령 목록이 남는다).
- `missing` 에는 **404 만** 적는다. 429·5xx 같은 일시 오류까지 적으면 그 아이콘은 영영 안 받아진다(종료 코드 3 = 일부 못 받음, 다시 돌리면 된다).

**허브 상태 파일**: `python pipeline/steps/build_status.py`
`site/data/hub.json` 을 만든다. 앱마다 자료 파일 지문을 재서 **바뀐 앱만** 갱신 시각이 움직이므로
가만히 두면 파일이 한 글자도 안 바뀐다(쓸데없는 커밋·배포가 안 생긴다).

**손으로 확인**: `python pipeline/steps/check_updates.py` (할 일이 있으면 종료 코드 1, 요청 3개)
새 영문 노트: fetch --en --id → parse --en → extract_strings → make_chunks → (번역) →
merge_translation → verify → apply_translation → build_patch_index
