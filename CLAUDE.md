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
- `site/encyclopedia/index.html` 영웅 도감 — **단일 파일(6MB, 데이터 내장)**, 직접 편집
- `site/replay/` 리플레이 뷰어 — `index.html` + `css/` + `js/`(클래식 스크립트, ES 모듈 아님). `js/data_*.js` 는 생성 파일
- `site/shared/scrap.js` 전역 바+테마(한 줄 로드), `scrap.css` 토큰 `--scrap-*`. 여기 수정 = 전 앱 영향 → 전 앱 회귀 확인
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
- 번역이 필요한 영문 노트, 새 게임 빌드는 **이슈로 알리기만** 한다(라벨 `auto-update`). 사람이 처리한다.

**로컬에서 하는 일** — Claude 예약 작업 `hots-scrap-patch-update` (월·금 10:00, 앱이 켜져 있을 때)
- 한국어판이 없는 영문 노트 번역
- 새 게임 빌드 반영(diff·series·빌드메이커 자료) — 전체 vendor 가 필요해 무겁다

**새 영웅 아이콘**: `python pipeline/steps/fetch_missing_icons.py`
화면이 부르는 아이콘 중 내 이미지 저장소(`SIN0NIS/images`)에 없는 것을
HeroesToolChest/heroes-images(MIT)에서 받아 `site/images/` 에 둔다.
- **확인에 요청 1개만 쓴다.** GitHub 트리 API 로 저장소 파일 목록을 통째로 받아 대조한다.
  절대로 아이콘을 하나씩 HEAD 로 찔러 보지 마라(예전 방식 = 내 Pages 에 요청 1,100개).
- `site/images/index.json` 에 두 목록을 적는다 — `files`(여기 있는 것)와
  `missing`(내 저장소에도 원본에도 없는 것, 게임에서 지워진 옛 특성 아이콘). 앱은 `missing` 은 **아예 안 부른다**.
- 목록은 내려받은 게 없어도 **항상** 다시 쓴다(안 그러면 파일을 지운 뒤 유령 목록이 남는다).
- 나중에 내 저장소에 같은 파일을 올리면 `site/images/` 에서 지우면 된다(스크립트가 지워도 되는 것을 알려 준다).

**허브 상태 파일**: `python pipeline/steps/build_status.py`
`site/data/hub.json` 을 만든다. 앱마다 자료 파일 지문을 재서 **바뀐 앱만** 갱신 시각이 움직이므로
가만히 두면 파일이 한 글자도 안 바뀐다(쓸데없는 커밋·배포가 안 생긴다).

**손으로 확인**: `python pipeline/steps/check_updates.py` (할 일이 있으면 종료 코드 1, 요청 3개)
새 영문 노트: fetch --en --id → parse --en → extract_strings → make_chunks → (번역) →
merge_translation → verify → apply_translation → build_patch_index
