# HotS Scrap

히어로즈 오브 더 스톰 통합 아카이브 — 원본 게임 데이터 기반의 영웅 도감, 특성 빌드 메이커, 리플레이 뷰어를 하나의 정적 사이트로 제공한다.

- **경량 데이터(JSON·아이콘)**: 이 저장소에 포함, GitHub Pages 로 서빙
- **중량 자산(m3 모델·텍스처)**: 저장소에 포함하지 않음 — 사용자가 추출 도구로 자기 게임 설치본에서 직접 추출해 로컬로 사용

## 패치 기록 (Patch Note History)

`site/patchnotes/` — 히어로즈 오브 더 스톰 패치를 한 곳에서 본다.

| 갈래 | 내용 | 범위 |
|---|---|---|
| 공식 한글 | 블리자드 뉴스 한국어판 패치 노트를 그대로 | 2017-01 ~ (185건) |
| Claude 번역 | 한국어 공식판이 **없는 회차만** 영어 원문을 번역. 노트마다 번역 고지·원문 링크·영어 원문 탭 | 2016-09 ~ (35건) |
| 데이터 변경점 | 게임 파일(HeroesToolChest)에서 뽑은 빌드 간 수치 비교 | 2019-10 ~ |

- 영웅별 이력: 능력치 / 기본 기술 / 레벨별 특성으로 나눠 보여 주고, 특성이 **생겼는지·사라졌는지·레벨이 옮겨졌는지·효과 설명이 바뀌었는지·수치만 조정됐는지**를 한눈에 정리한다. 수치는 패치 단위 꺾은선으로 그린다.
- 용어는 같은 빌드의 게임 텍스트(enus↔kokr)를 대조해 공식 한글명으로 맞춘다. 같은 영문명이 영웅마다 다른 경우(예: Cheap Shot)는 영웅별 표를 따른다.
- 구성은 영문 아카이브 [Nexus Patch Notes](https://nexus-patch-notes.github.io/) 를 참고했다. 그 사이트의 글·코드는 쓰지 않았고, 내용은 블리자드 원문과 게임 데이터에서 직접 만들었다.
- 2014~2016 상반기는 블리자드 뉴스 아카이브에 원문이 남아 있지 않아 싣지 못한다.

파이프라인은 `pipeline/steps/` 에 있다(수집→파싱→용어집→번역→데이터 비교→색인). 실행 방법과 자료 구조는 [docs/patchnotes-guide.md](docs/patchnotes-guide.md) 참고. 원문 캐시(`raw/`)와 게임 데이터 클론(`vendor/`)은 용량 때문에 저장소에 올리지 않는다.

## 외부 연동 (다른 사이트에서 쓰기)

외부 사이트가 링크 파라미터만으로 HotS Scrap 기능을 쓸 수 있는 공개 통로:

| 기능 | 주소 형식 | 조건 |
|---|---|---|
| 리플레이 열기 | `…/replay/?src=<리플레이파일 URL>` (`?replay=` 도 동일) | https 주소, 파일 서버가 CORS 허용, 출처 호스트가 허용 목록(`replay/js/main.js` 의 `SRC_ALLOW`)에 등록 |
| 특성 빌드 열기 | `…/builds/?b=[T3211224,Diablo]` | 인게임 특성 코드 |
| 영웅 선택 | `…/builds/?hero=Diablo` | hyperlinkId 또는 영문명 |

리플레이 파일은 방문자의 브라우저 안에서만 파싱되며 어디에도 업로드되지 않습니다.
연동 예: `https://sin0nis.github.io/hots-scrap/replay/?src=https://hots.herossearch.com/replays/123.StormReplay`
새 협업 요청은 GitHub 이슈로 — 허용 목록에 호스트 한 줄 추가로 연결됩니다.

## 권리 고지

비영리 팬 프로젝트입니다. Heroes of the Storm 및 관련 이미지·게임 데이터의 권리는 Blizzard Entertainment 에 있습니다. 이 사이트는 어떤 수익도 창출하지 않으며, 권리자의 요청이 있으면 해당 자료를 즉시 제거합니다.

This is a non-commercial fan project. Heroes of the Storm and all related assets are property of Blizzard Entertainment. No revenue is generated; any material will be removed promptly upon request by the rights holder.

구조와 규약은 [PLAN.md](PLAN.md) 참고. 핵심 규칙:

1. 앱은 `site/<앱>/` 폴더 하나로 완결 — 앱 간 코드 결합 금지, 이동은 URL 로만
2. 모든 앱은 `data/<빌드번호>/` 의 공통 JSON 만 읽는다 (읽기 전용)
3. 게임 패치 시 `pipeline/` 을 로컬에서 실행해 새 버전 데이터를 생성 → push → 자동 배포
