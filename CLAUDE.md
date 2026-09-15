# HotS Scrap — 작업 규약 (Claude 용)

배포 사이트: https://sin0nis.github.io/hots-scrap/ (GitHub `SIN0NIS/hots-scrap`, `main` push 시 Actions 가 `site/` 를 Pages 루트로 자동 배포)

## 작업 흐름: 로컬 테스트 → 이상 없음 → 커밋 → push

1. **로컬 dev 서버**: `python tools/devserver.py 8801` → http://localhost:8801/site/ (no-cache 헤더. 8800 은 캐시 오염으로 폐기).
   Claude 는 `.claude/launch.json` 의 `hots-scrap` 구성으로 브라우저 미리보기를 연다.
2. **검증**: 허브(`/site/`) + 수정한 앱 페이지를 열어 콘솔 오류 0 확인, 다크/라이트 양쪽, 모바일 폭 확인.
   - 스크립트를 손댔으면 **반드시 브라우저 콘솔로 확인한다.** 파이썬 `esprima` 는 느슨한 모드라 `const` 중복 선언 같은 정적 의미 오류를 못 잡고, `?.`·`??`·`||=` 를 오탐으로 뱉는다.
   - 스크립트를 통째로 바꿔치기하는 수정 스크립트를 쓴 뒤에는 블록이 두 벌 남지 않았는지 함수·상수 이름 중복을 센다.
3. **커밋**: 검증이 끝난 뒤에만 `git commit` (한국어 제목, `앱: 내용` 형식). **push 는 사용자가 지시할 때만.**
   push = 즉시 배포이므로 절대 임의로 하지 않는다.

## 구조

- `site/index.html` 허브 — `site/apps.json` 을 읽어 앱 카드 자동 나열 (앱 추가 = apps.json 등록)
- `site/builds/index.html` 특성 빌드 — 64KB. 영웅 데이터는 `site/data/builds/` 로 분리
  (`index.json` 6KB + `<live|ptr>.<ko|en>.json` 약 1.5MB, 화면이 고른 판·언어 하나만 받는다).
  자료 생성은 `pipeline/steps/build_talent_data.py`
- `site/encyclopedia/index.html` 영웅 도감 — **단일 파일(6MB, 데이터 내장)**, 직접 편집
- `site/replay/` 리플레이 뷰어 — `index.html` + `css/` + `js/`(클래식 스크립트, ES 모듈 아님). `js/data_*.js` 는 생성 파일
- `site/shared/scrap.js` 전역 바+테마(한 줄 로드), `scrap.css` 토큰 `--scrap-*`. 여기 수정 = 전 앱 영향 → 전 앱 회귀 확인
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
- 인코딩 UTF-8(BOM 없음). 큰 단일 파일 HTML 은 Edit 로 부분 수정만 (통째로 다시 쓰지 않기)

## 외부 연동 통로 (깨뜨리면 안 되는 공개 API)

- 리플레이: `replay/?src=<URL>` (`?replay=` 동일), 허용 호스트는 `replay/js/main.js` 의 `SRC_ALLOW`
- 빌드: `builds/?b=[T코드,영웅]`, `builds/?hero=<hyperlinkId>` (자료 적재 뒤에 실행되도록 `__bootQuery` 로 미뤄 둠)

## 갱신 확인

`python pipeline/steps/check_updates.py` — 블리자드 뉴스(한/영)·HeroesToolChest 새 빌드·참고 사이트를 싸게 확인한다.
할 일이 있으면 종료 코드 1. 새 영문 노트가 있으면 fetch --en --id → parse --en → extract_strings →
make_chunks → (번역) → merge_translation → verify → apply_translation → build_patch_index 순으로 돌린다.
