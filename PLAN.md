# HotS Scrap 통합 계획 (hots-scrap)

히오스 통합 아카이브 — 파편화된 세 프로젝트(도감·빌드·리플레이)를 하나의 모노레포/Pages 사이트로 통합한다.

## 원칙

1. **데이터 원천 일원화**: 자체 파서(hots_xml_parser, build 97650) 산출물 한 벌을 모든 앱이 공유. 외부 도구(HeroesDataParser) 의존 제거.
2. **2계층 자산 정책**:
   - 경량(GitHub, 자동 배포): JSON, 아이콘 webp, 맵 SVG, 사이트 코드
   - 중량(로컬 전용): m3, 텍스처, 고화질 맵, 애니메이션 — 저장소에 올리지 않음(용량 + 저작권). 사용자는 추출 도구로 자기 설치본에서 직접 추출, 사이트는 File System Access API로 로컬 폴더 참조.
3. **버전별 데이터 보존**: `data/<빌드번호>/` 로 보관, `latest` 포인터. 패치 시 diff 리포트 = 자동 패치노트.
4. **부분 갱신**: 전체 재생성 금지(PC 과부하 이력). 파이프라인은 단계별 캐시, 바뀐 stormmod만 재처리.

## 통합 전 상태 (2026-08-28 인벤토리)

| 로컬 폴더 | GitHub | 데이터 원천 | 비고 |
|---|---|---|---|
| hots_hero_web | SIN0NIS/hots_hero_m3 | heroes.js (m3 슬러그) | 모델 뷰어 |
| Hots_talent_build | SIN0NIS/hots_talent_build_auto_git | herodata_97039 (HDP 계열) | **버전 뒤처짐 + 외부 의존** |
| hots_map_replay_viewer | SIN0NIS/hots_map | js/data_*.js (자동 생성) | build_talents.py 등 생성기 보유 |
| hots_xml_parser | (로컬) | mods 97650 자체 추출 | 통합 데이터의 원천이 될 것 |

자동화 근거: 세 앱 모두 게임 내부 ID(CHero id / talentId / m3 내부명)로 수렴하고, 프로젝트별 생성 스크립트가 이미 존재. 통합 = 생성기들의 입력을 `data/` 한 벌로 교체하는 작업.

## 구조

```
hots_scrap/
├─ pipeline/        # 추출→파싱→조립 (로컬 실행, 단계별 캐시)
│   └─ steps/       # 단계 = 독립 스크립트 (스텝 추가로 확장)
├─ site/            # ★ Pages 배포 루트 — 주소가 짧아진다 (…github.io/hots-scrap/도감/)
│   ├─ data/
│   │   ├─ 97650/   # 통합 JSON (heroes, talents, abilities, maps, strings)
│   │   └─ latest.json # 최신 버전 포인터 {"build": 97650}
│   ├─ index.html   # 허브 랜딩 — apps.json 을 읽어 앱 카드 자동 나열
│   ├─ apps.json    # 앱 레지스트리 (등록만 하면 허브에 노출)
│   ├─ shared/      # 공통 JS/CSS, 데이터 로더, ID 매핑
│   ├─ encyclopedia/ # 도감 (hots_xml_parser out/app + hots_hero_skill)
│   ├─ builds/      # 빌드 메이커 (Hots_talent_build)
│   └─ replay/      # 리플레이 뷰어 (hots_map_replay_viewer)
└─ .github/workflows/ # push 시 Pages 배포 (추후)
```

## 확장 규약 — 앱은 계속 추가된다는 전제

새 앱(사이트 탭) 추가 시 지켜야 할 계약. 이것만 지키면 기존 앱을 건드리지 않고 추가된다:

1. **폴더 하나 = 앱 하나**: `site/<앱이름>/index.html`. 다른 앱 폴더를 직접 import 하지 않는다.
2. **데이터는 `data/latest`(또는 지정 버전)만 참조**: 앱 전용 데이터가 필요하면 pipeline/steps 에 생성 스텝을 추가해 `data/<빌드>/<앱이름>.json` 으로 산출. 앱 폴더 안에 데이터 사본을 두지 않는다.
3. **`site/apps.json` 에 등록**: `{id, 이름, 경로, 설명, requires: "light"|"heavy"}` — 허브 랜딩이 이 파일만 읽어 자동 나열. `heavy` 앱은 로컬 자산 폴더 미지정 시 안내 화면을 띄운다.
4. **공통 로더 사용**: 데이터 로드·ID 매핑·아이콘 경로는 `site/shared/` 의 로더를 거친다 (버전 전환·로컬 자산 감지를 한 곳에서 처리).
5. **중량 자산은 규약 2계층대로**: 저장소에 넣지 않고 File System Access API 로 로컬 참조.

### 격리 원칙 — 앱끼리 작동 간섭 금지

공통 데이터(`data/`)만 망가지지 않으면, 한 앱이 죽거나 뜯어고쳐져도 다른 앱은 무사해야 한다:

- **읽기 전용 공유**: 앱이 공유하는 것은 `data/`(JSON)와 `shared/`(로더) **읽기뿐**. 앱 간 함수 호출·전역 변수·이벤트 공유 금지. 앱끼리는 서로의 존재를 모른다.
- **이동은 URL 로만**: 교차 기능(예: 리플레이→빌드 링크)은 쿼리 파라미터가 붙은 일반 링크(`../builds/?hero=Amazon&talents=...`)로 구현. 코드 결합 없이 주소 규약만 공유.
- **CSS/JS 스코프 격리**: 앱의 CSS·JS 는 자기 폴더 안에만. 전역 스타일 주입 금지 (허브와 shared 는 최소한의 것만).
- **`shared/` 는 동결 계약**: 로더 함수 시그니처는 안정 API 로 취급 — 바꿀 때는 추가만 하고 기존 시그니처는 유지. shared 수정이 전 앱 회귀 테스트를 의미하므로 가능한 한 작게 유지한다.
- **저장 공간 분리**: localStorage 키는 `앱id.` 접두사 필수 (예: `builds.saved`, `replay.recent`).
- **데이터 스키마는 추가 전용**: `data/` JSON 에 필드 추가는 자유, 기존 필드 이름 변경·삭제는 전체 앱 영향이므로 버전 번호를 올리고 마이그레이션으로만.

예상 후보 앱 (지금 로컬에 이미 씨앗이 있는 것들):

| 후보 | 씨앗 | 계층 |
|---|---|---|
| 3D 모델 뷰어 | hots_hero_web (m3 슬러그 데이터) | heavy |
| 3D 리플레이 관전 | replay + m3 로더 (three.js 트랙) | heavy |
| 스킬/이펙트 상세 | hots_hero_skill | light |
| 맵 도감 | hots_maps, hots_svg_out | light |
| 패치노트(버전 diff) | data/ 버전 보관 구조에서 자동 | light |
| 스타2 이식 변환기 | hots_xml_parser (별도 트랙, pipeline 공유) | tool |

## 로드맵

- [ ] **P1. 통합 데이터 스키마**: `data/97650/` 정의. 기존 파서 산출물(out/final, out/app) 재활용 — 재추출 아님.
  - [x] heroes.json 경량 인덱스 + heroes/<Id>.json 상세 92명 (12.9MB) — pipeline/steps/step10
  - [x] talents.json (talentId → 항목 리스트. 공용 특성 6개는 다중 영웅, 하위유닛 AbathurSymbiote·ValeeraStealthed 는 색인 제외) — 리플레이 TalentChosen 과 일치 확인
  - [ ] maps.json (hots_maps index.json + 리플레이 뷰어 data_maps.js 병합)
  - [ ] 아이콘·m3 슬러그·내부명 매핑을 heroes.json 에 추가 (hots_hero_web heroes.js + replay data_heroes.js)
- [ ] **P2. 리플레이 뷰어 이사**: 생성기(build_talents.py 등)의 입력을 통합 데이터로 교체 → site/replay
- [ ] **P3. 빌드 메이커 이사**: herodata_* (HDP) → 통합 데이터로 교체. make_build.py 수정 → site/builds
- [ ] **P4. 도감 이사**: out/app HTML들을 site/encyclopedia 로, 데이터 참조 통일
- [ ] **P5. 교차 기능**: 리플레이 특성픽 → 빌드 링크, 영웅 클릭 → 도감
- [ ] **P6. 배포**: 새 GitHub 저장소 + Pages + Actions. 기존 저장소 3개는 보존(README 에 이전 안내)
- [ ] **P7. 추출 도구 정리판 + manifest**: 로컬 중량 자산용 (3D 뷰어 대비)

## 주의

- **GitHub 제한 예방 규칙** (2026-08 점검): 수익화 금지(DMCA 트리거 1순위) · 단일 파일 100MB 초과 금지(push 거부됨 — 큰 파일은 Release 첨부로) · 저장소당 1GB 근처면 assets 저장소 분리 · Git LFS 금지(무료 대역폭 월 1GB 뿐) · Pages 대역폭 월 100GB 소프트리밋 · 스케줄 워크플로는 저장소 60일 무활동 시 자동 꺼짐
- 아이콘은 Pages 로 서빙 (raw.githubusercontent 는 429 남 — talent_build 에서 확인된 사항)
- Hots_talent_build 폴더의 Git-2.54.0-64-bit.exe(62MB) 등 잡파일은 이사에서 제외
- 인코딩: 모든 JSON/JS 는 UTF-8(BOM 없음) 통일
