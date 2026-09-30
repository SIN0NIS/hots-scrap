# 운영 안내 — 내가 하는 법

> **평소에는 아무것도 안 해도 됩니다.** 새 패치는 서버가 알아서 받아 올립니다.
> 이 문서는 "지금 바로 반영하고 싶을 때"와 "뭔가 안 나올 때"를 위한 것입니다.

사이트: <https://sin0nis.github.io/hots-scrap/>

---

## 0. 저절로 도는 것들

| 언제 | 무엇이 | 어디서 |
|---|---|---|
| **6시간마다** (09:10·15:10·21:10·03:10) | 새 한국어 패치 노트 · 새 게임 빌드 · 아이콘 목록 맞추기 → 반영하고 배포 | GitHub (PC 꺼져 있어도 됨) |
| **6시간마다** (09:50·15:50·21:50·03:50) | 사이트가 부르는데 없는 아이콘을 게임에서 꺼내 채움 | GitHub (images 저장소) |
| **토요일 12:00** | 인게임 원본 자료를 내 PC 보관소에 쌓기 | 내 PC (윈도우 작업 스케줄러) |
| **월·금 10:00** | 한국어판 없는 영문 노트 번역 등 | 내 PC (Claude 앱이 켜져 있을 때) |

확인할 곳: [사이트 자동 갱신 기록](https://github.com/SIN0NIS/hots-scrap/actions/workflows/update-patchnotes.yml) ·
[아이콘 채우기 기록](https://github.com/SIN0NIS/images/actions/workflows/pick-icons.yml)

---

## 1. 수동 갱신 버튼 (나만 쓰는 것)

6시간을 안 기다리고 **지금 바로** 갱신을 돌립니다. 허브(사이트 첫 화면)에 숨겨져 있습니다.

### 여는 법

**왼쪽 위 로고(또는 "HotS Scrap" 글자)를 빠르게 다섯 번** 두드립니다.
네 번까지는 아무 일도 없고, 두드림 사이가 1.2초를 넘으면 처음부터 다시 셉니다.
주소 끝에 `#admin` 을 붙여 열어도 같습니다.

### 처음 한 번 — ① GitHub 토큰 만들기

1. <https://github.com/settings/personal-access-tokens> → **Generate new token**
2. **Repository access** → *Only select repositories* → `SIN0NIS/hots-scrap` 와 `SIN0NIS/images` 두 개
3. **Permissions** → *Repository permissions* → **Actions** 를 **Read and write** 로
   (나머지는 건드리지 않습니다. 이 토큰으로 할 수 있는 일은 "갱신 작업 돌리기"뿐입니다)
4. 만료일은 원하는 대로. 만료되면 새로 만들어 다시 넣으면 됩니다
5. 만들어진 `github_pat_...` 문자열을 복사

### 처음 한 번 — ② 사이트에 넣기

1. 로고 다섯 번 두드리기
2. **비밀번호**(내가 정하는 것)와 **토큰**을 넣고 **저장**
3. "저장했습니다." 가 나오면 끝

> 토큰이 진짜 되는지 먼저 확인하고, 안 되면 저장하지 않습니다.

### 그다음부터

**로고 다섯 번 → 비밀번호 → ⟳ 지금 갱신**

두 작업(패치 자료·아이콘)이 함께 시작되고, 끝날 때까지 상태가 보입니다.
끝나면 *새로고침* 링크가 나옵니다. 보통 1~3분.

- **잠그기** — 토큰은 그대로 두고 다시 잠급니다
- **토큰 지우기** — 이 브라우저에서 토큰을 없앱니다

### 알아 둘 것

- **숨긴 입구는 가림막일 뿐입니다.** 사이트 소스를 읽으면 "로고 다섯 번"인 걸 알 수 있습니다.
  진짜 자물쇠는 **비밀번호**입니다 — 비밀번호로 만든 열쇠로 토큰을 잠가서 저장하기 때문에,
  비밀번호를 모르면 토큰을 꺼낼 수 없습니다(이 브라우저를 통째로 가져가도 마찬가지).
- **비밀번호는 어디에도 저장되지 않습니다.** 잊어버리면 되찾을 방법이 없습니다 →
  *토큰 지우기* 로 지우고, GitHub 에서 그 토큰을 **Revoke** 한 뒤 새로 만들어 넣으세요.
- **브라우저마다 따로입니다.** 폰에서도 쓰려면 폰에서 한 번 더 설정해야 합니다.
- 새로고침하면 다시 잠깁니다(비밀번호를 다시 물어봅니다).
- `http://` 로 열면 브라우저가 잠금 기능을 막습니다. `https://` 또는 `localhost` 에서만 됩니다.

---

## 2. 새 패치가 났을 때

### 보통 — 그냥 기다리면 됩니다

게임 자료의 원본(HeroesToolChest)이 올라오면 서버가 알아서 반영합니다. 보통 하루 이틀 걸립니다.
한국어 공식 패치 노트는 블리자드 뉴스에 뜨는 대로 6시간 안에 올라갑니다.

### 당일 바로 반영하고 싶으면 — 내 PC 설치본에서 직접 뽑기

원본이 늦어도 **내 컴퓨터에 받아 둔 게임 파일**에서 같은 자료를 만들 수 있습니다.
원본과 값이 똑같이 나오는지 대조해 확인해 둔 방법입니다.

**Claude 에게 "새 버전 나왔어, 로컬로 데이터 뽑아줘" 라고 하면 아래를 대신 해 줍니다.**

0. **먼저 배틀넷을 켜서 게임을 최신으로 받습니다.** (설치본이 옛 버전이면 옛 자료가 나옵니다)
1. 순서대로 돌립니다

   ```bash
   cd D:/03-Fun/01_Game/03_claude/hots_scrap
   python pipeline/steps/extract_local_build.py --date 2026-09-28   # 본 서버 (테스트 서버는 --ptr)
   python pipeline/steps/diff_heroes_data.py
   python pipeline/steps/build_talent_data.py
   python pipeline/steps/fetch_missing_icons.py
   python pipeline/steps/build_patch_index.py
   python pipeline/steps/build_status.py
   ```

   `--date` 는 그 패치가 나온 날입니다(안 적으면 오늘).
2. 로컬에서 확인 — `python tools/devserver.py 8801` → <http://localhost:8801/site/>
3. 괜찮으면 커밋·푸시 (Claude 에게 "푸쉬해줘")

> 한글이 깨져 보이면 명령 앞에 `PYTHONIOENCODING=utf-8` 을 붙이세요.
> (PowerShell 은 `$env:PYTHONIOENCODING='utf-8'` 을 한 번 실행)

### 새 영웅 아이콘이 안 보이면

images 저장소가 6시간 안에 게임에서 꺼내 채웁니다. 급하면 **⟳ 지금 갱신** 을 누르세요.

---

## 3. 한국어판이 없는 영문 패치 노트

블리자드가 영어로만 낸 회차는 자동으로 올리지 않고 **GitHub 이슈로 알립니다**(라벨 `auto-update`).
번역은 내 PC 에서 Claude 가 합니다(월·금 예약 작업). 급하면 Claude 에게
**"영문 노트 번역해서 올려줘"** 라고 하면 됩니다.

---

## 4. 뭔가 안 나올 때 — 보는 순서

| 증상 | 먼저 볼 곳 | 손으로 하는 법 |
|---|---|---|
| 사이트 내용이 안 바뀐다 | [Actions → Deploy Pages](https://github.com/SIN0NIS/hots-scrap/actions) 가 성공했나 | 브라우저 새로고침(Ctrl+F5). GitHub 쪽 캐시로 한 번은 옛 화면이 뜰 수 있습니다 |
| 빌드가 옛 것이다 | `python pipeline/steps/check_updates.py` (요청 3개) | ⟳ 지금 갱신, 또는 위 2번(로컬로 직접 뽑기) |
| 아이콘이 비어 보인다 | `site/images/index.json` 의 `need`·`missing` | [images Actions](https://github.com/SIN0NIS/images/actions) 실행 기록 확인 |
| 실패 메일이 왔다 | [열린 이슈](https://github.com/SIN0NIS/hots-scrap/issues?q=is%3Aopen+label%3Aauto-update) | 이슈 내용대로. 대개 Claude 에게 그대로 보여 주면 됩니다 |
| 버튼이 안 열린다 | 주소가 `https://` 인가 | 로고를 **빠르게** 다섯 번(1.2초 안에 이어서) |

---

## 5. 주소·자리 모음

| 무엇 | 어디 |
|---|---|
| 사이트 | <https://sin0nis.github.io/hots-scrap/> |
| 사이트 저장소 | <https://github.com/SIN0NIS/hots-scrap> |
| 아이콘 저장소 | <https://github.com/SIN0NIS/images> (Pages: `sin0nis.github.io/images/...`) |
| 내 PC 작업본 | `D:\03-Fun\01_Game\03_claude\hots_scrap` |
| 아이콘 저장소 작업본 | `D:\03-Fun\01_Game\03_claude\hots_images` (그림은 안 받은 가벼운 사본) |
| 인게임 자료 보관소 | `D:\03-Fun\01_Game\03_claude\hots_archive` (저장소 **밖**, GitHub 에 안 올라감) |
| 게임 설치본 | `C:\Program Files (x86)\Heroes of the Storm` · `… Public Test` |

---

## 6. 내 PC 에서 저절로 도는 것 (확인만)

- **보관소 쌓기** — 윈도우 작업 스케줄러 `\HotS Scrap\Archive game data (weekly)`, 토요일 12:00.
  PC 가 꺼져 있었으면 다음에 켰을 때 돕니다. 결과는 `hots_archive\archive.log` 에 남습니다.
- **Claude 예약 작업** `hots-scrap-patch-update` — 월·금 10:00, Claude 앱이 켜져 있을 때만.

지금 쌓인 것 보기: `python pipeline/steps/archive_builds.py --status`
