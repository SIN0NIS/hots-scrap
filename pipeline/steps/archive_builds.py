# -*- coding: utf-8 -*-
"""인게임 데이터를 **내 PC 에** 빌드별로 쌓아 두는 보관소.

GitHub 에는 올리지 않는다(용량이 크고, 사이트가 쓰는 것은 가공된 작은 자료뿐이다).
보관소는 저장소 **밖**에 둔다 — 실수로 커밋될 일이 없게.

  기본 위치:  <저장소 옆>/hots_archive      (환경변수 HOTS_ARCHIVE 나 --dest 로 바꾼다)

  hots_archive/
    README.md                     ← 무엇이 어디 있는지
    index.json                    ← 쌓인 빌드 목록
    mirrors/
      heroes-data.git             ← 원본 저장소를 통째로 거울 뜬 것 (2019-10 ~ 2026-07, 약 200MB)
      heroes-data2.git            ←   〃  (2026-05 ~ 현재)
    builds/hdp4/<버전>/           ← 바로 열어 볼 수 있게 풀어 둔 것 — 옛 형식(2019-10 ~ 2026-07)
    builds/hdp5/<버전>/           ←   〃  새 형식(2026-05 ~). 2.55.16.97039 는 두 형식 모두에 있다
      data/*.json                   영웅·유닛·스킨·탈것 … 게임 데이터 전 종류
      gamestrings/*.json            글(이름·툴팁). 기본: 한국어 kokr + 영어 enus
      meta.json                     출처 커밋·원본 지문·파일별 sha256

두 겹으로 둔다:
  · **거울**  = 원본 그대로, 모든 언어·모든 종류·전 기록. 작다(git 이 비슷한 JSON 을 잘 눌러 담는다).
                HeroesToolChest 가 저장소를 지우거나 갈아엎어도 여기 것은 남는다.
  · **풀어 둔 것** = 빌드마다 완성된 JSON. 옛 형식은 **원본 바이트 그대로**,
                새 형식은 원본이 '앞 빌드와의 차이(JSON Patch)'라서 사슬을 붙인 **완성본**.
  맵 전용 덧패치(data/maps, gamestrings/maps)는 풀지 않는다 — 거울에는 들어 있다.

**원본이 이미 올린 빌드를 나중에 고치기도 한다**(2026-06-13, 07-25 에 뿌리 빌드를 고친 전례).
그래서 빌드마다 원본 폴더의 지문(git tree id)을 적어 두고, 달라졌으면 그 빌드와
**그 빌드에 기대는 뒤 빌드 전부**를 다시 만든다.

사용:
  python archive_builds.py               # 거울 갱신 + 새 빌드·바뀐 빌드만 풀어 둔다
  python archive_builds.py --status      # 무엇이 쌓여 있는지만 본다 (네트워크 안 씀)
  python archive_builds.py --verify      # 풀어 둔 파일이 온전한지 대조 (옛 형식은 원본 바이트와도 대조)
  python archive_builds.py --limit 20    # 한 번에 20개만 (PC 가 바쁠 때 나눠 돌린다)
  python archive_builds.py --offline     # 거울 갱신을 건너뛴다
  python archive_builds.py --locales kokr,enus,frfr
  pythonw archive_builds.py --log <파일>  # 창 없이(작업 스케줄러). 화면 대신 파일에 기록을 남긴다
"""
import argparse
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile
from datetime import datetime, timezone, timedelta
from pathlib import Path

import jsonpatch

# 출력이 파이프로 잡히면 윈도우는 cp949 로 쓰는데, 거기 없는 글자(— 등)에서 죽는다
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parents[2]
KST = timezone(timedelta(hours=9))
SOURCES = [
    # (이름, 세대, 주소) — 같은 빌드(2.55.16.97039)가 두 저장소에 다른 형식으로 있어서 세대별로 폴더를 나눈다
    ("heroes-data", "hdp4", "https://github.com/HeroesToolChest/heroes-data.git"),    # 빌드마다 완성된 JSON (2019-10 ~ 2026-07, 멈춤)
    ("heroes-data2", "hdp5", "https://github.com/HeroesToolChest/heroes-data2.git"),  # 앞 빌드와의 차이(JSON Patch)로 올라온다 (2026-05 ~)
]
VER_RE = re.compile(r"^(\d+\.\d+\.\d+\.(\d+))(_ptr)?$")
# gamestrings_98182_kokr(.patch).json · gamestrings_mapdata_98182_kokr(.patch).json
GS_RE = re.compile(r"^gamestrings_(?:[a-z]+_)?\d+_([a-z]{4})(?:\.patch)?\.json$")
GIT_ENV = dict(os.environ, GIT_TERMINAL_PROMPT="0")     # 자격 증명 창이 떠서 멈추는 일이 없게
# 꺼낼 때 줄바꿈을 바꾸지 않는다 — 윈도우 git 은 기본이 LF→CRLF 라 '원본 그대로'가 깨진다
GIT_RAW = ["-c", "core.autocrlf=false", "-c", "core.eol=lf"]
# 작업 스케줄러가 창 없이(pythonw) 돌릴 때, git 을 부를 때마다 검은 콘솔 창이 번쩍이지 않게 한다
NO_WINDOW = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}


def now():
    return datetime.now(KST).strftime("%Y-%m-%d %H:%M")


class _Tee:
    """화면과 기록 파일에 같이 쓴다. 창 없이 돌 때는 화면이 없으므로(None) 파일에만 쓴다."""

    def __init__(self, screen, fh):
        self.screen, self.fh = screen, fh

    def write(self, s):
        if self.screen is not None:
            try:
                self.screen.write(s)
            except Exception:
                pass
        self.fh.write(s)
        return len(s)

    def flush(self):
        for f in (self.screen, self.fh):
            try:
                f.flush()
            except Exception:
                pass


def open_log(path):
    """--log: 실행 기록을 파일에 이어 쓴다. 1MB 를 넘으면 뒤쪽 200KB 만 남긴다(끝없이 자라지 않게)."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.exists() and p.stat().st_size > 1024 * 1024:
        tail = p.read_bytes()[-200 * 1024:]
        p.write_bytes(tail[tail.find(b"\n") + 1:])
    fh = open(p, "a", encoding="utf-8", buffering=1)
    fh.write(f"\n===== {now()} =====\n")
    sys.stdout, sys.stderr = _Tee(sys.stdout, fh), _Tee(sys.stderr, fh)
    return fh


def git(gitdir, *args, binary=False, check=True, timeout=600):
    r = subprocess.run(["git", *GIT_RAW, f"--git-dir={gitdir}", *args], capture_output=True, env=GIT_ENV, timeout=timeout, **NO_WINDOW)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args[:3])} 실패: {r.stderr.decode('utf-8', 'replace')[-600:]}")
    return r.stdout if binary else r.stdout.decode("utf-8", "replace")


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def git_blob_id(b):
    """git 이 이 바이트에 매기는 blob id — 원본과 바이트까지 같은지 대조하는 데 쓴다."""
    return hashlib.sha1(b"blob " + str(len(b)).encode() + b"\0" + b).hexdigest()


# ───────────────────────── 거울 ─────────────────────────
def update_mirror(dest, name, url, offline):
    """원본 저장소를 통째로 거울 뜬다. 있으면 새 것만 더 받는다.

    지우는 동기화(prune)는 하지 않는다 — 보관소라서, 원본에서 사라진 것도 여기엔 남아야 한다.
    원본이 기록을 갈아엎어도(강제 푸시) 예전 커밋이 버려지지 않게, 받을 때마다 그때의 HEAD 에 표시를 남긴다.
    받기에 실패해도(원본이 사라졌거나 네트워크가 끊겼거나) 이미 있는 거울로 계속한다.
    """
    m = dest / "mirrors" / f"{name}.git"
    if not m.exists():
        if offline:
            raise RuntimeError(f"{name}: 거울이 아직 없습니다(--offline 을 빼고 한 번 돌려 주세요)")
        m.parent.mkdir(parents=True, exist_ok=True)
        part = m.with_name(m.name + ".part")             # 받다가 끊긴 반쪽 거울이 '있는 것'으로 남지 않게
        if part.exists():
            _rmtree(part)
        print(f"  거울 뜨는 중(처음 한 번): {name} …", flush=True)
        r = subprocess.run(["git", "clone", "--mirror", "--quiet", url, str(part)], capture_output=True, env=GIT_ENV, timeout=3600, **NO_WINDOW)
        if r.returncode != 0:
            raise RuntimeError(f"{name} 거울 실패: {r.stderr.decode('utf-8', 'replace')[-600:]}")
        part.rename(m)
    elif not offline:
        try:
            git(m, "fetch", "--quiet", "--no-prune", "origin", timeout=1800)
        except Exception as e:
            print(f"  ! {name}: 새로 받지 못했습니다 — 있는 거울로 계속합니다 ({str(e)[:160]})", file=sys.stderr)
    head = git(m, "rev-parse", "HEAD").strip()
    git(m, "update-ref", f"refs/archive/{head[:12]}", head)     # 이 커밋은 앞으로도 안 버려진다
    return m, head


def _rmtree(p):
    for x in sorted(Path(p).rglob("*"), reverse=True):
        try:
            x.chmod(0o666)
        except Exception:
            pass
        x.unlink() if (x.is_file() or x.is_symlink()) else x.rmdir()
    Path(p).rmdir()


def ls_versions(m):
    """거울의 HEAD 에 있는 버전 폴더 → {폴더 이름: 그 폴더의 지문(git tree id)}. 한 번의 호출로 전부."""
    out = {}
    for line in git(m, "ls-tree", "HEAD", "heroesdata/").splitlines():
        meta, _, path = line.partition("\t")
        parts = meta.split()
        name = path.split("/", 1)[1] if "/" in path else ""
        if len(parts) == 3 and parts[1] == "tree" and VER_RE.match(name):
            out[name] = parts[2]
    return out


def ls_files(m, folder):
    """{폴더 안 상대 경로: blob id}"""
    pre = f"heroesdata/{folder}/"
    out = {}
    for line in git(m, "ls-tree", "-r", "HEAD", pre).splitlines():
        meta, _, path = line.partition("\t")
        parts = meta.split()
        if len(parts) == 3 and parts[1] == "blob" and path.startswith(pre):
            out[path[len(pre):]] = parts[2]
    return out


def read_files(m, folder, rels):
    """한 폴더의 파일 여러 개를 한 번에 꺼낸다 (git archive 한 번 = 프로세스 하나). 바이트 그대로."""
    rels = list(rels)
    if not rels:
        return {}
    pre = f"heroesdata/{folder}/"
    raw = git(m, "archive", "--format=tar", "HEAD", *[pre + r for r in rels], binary=True)
    got = {}
    with tarfile.open(fileobj=io.BytesIO(raw)) as tf:
        for ti in tf:
            if ti.isfile() and ti.name.startswith(pre):
                got[ti.name[len(pre):]] = tf.extractfile(ti).read()
    return got


def loose_json(b):
    """원본 .hdp.json 중에는 쉼표가 빠진 불량도 있다(2.49.1.77692). 그래도 필요한 것은 읽어 낸다."""
    t = b.decode("utf-8-sig")
    try:
        return json.loads(t)
    except Exception:
        out = {}
        mm = re.search(r'"duplicate"\s*:\s*\{([^}]*)\}', t)
        if mm:
            out["duplicate"] = dict(re.findall(r'"(\w+)"\s*:\s*"([^"]+)"', mm.group(1)))
        if re.search(r'"extracted"\s*:\s*false', t):
            out["extracted"] = False
        hv = re.search(r'"hdp"\s*:\s*"([^"]+)"', t)
        if hv:
            out["hdp"] = hv.group(1)
        return out


def wanted(rel, locales):
    """풀어 둘 파일인가 — 최상위 data/*.json 과, 고른 언어의 gamestrings. 맵 덧패치(하위 폴더)는 뺀다."""
    parts = rel.split("/")
    if len(parts) != 2 or not rel.endswith(".json"):
        return False
    if parts[0] == "data":
        return True
    if parts[0] == "gamestrings":
        mm = GS_RE.match(parts[1])
        return bool(mm and mm.group(1) in locales)
    return False


def kind_of(rel):
    """파일 이름에서 빌드 번호와 .patch 를 떼어 '종류'만 남긴다 → 사슬 위에서 같은 것끼리 잇는다.
       data/herodata_98182.patch.json          → data/herodata
       gamestrings/gamestrings_98182_kokr.json → gamestrings/gamestrings_kokr
       gamestrings/gamestrings_mapdata_98182_kokr.patch.json → gamestrings/gamestrings_mapdata_kokr"""
    d, f = rel.split("/")
    f = f[:-5]                                   # .json
    if f.endswith(".patch"):
        f = f[:-6]
    f = re.sub(r"_(\d+)(?=_|$)", "", f, count=1)  # 빌드 번호
    return f"{d}/{f}"


def out_name(kind, build):
    """새 형식의 완성본 파일 이름 — 원본 이름에서 .patch 만 뗀 꼴로 되돌린다."""
    d, f = kind.split("/")
    if d == "gamestrings":
        head, loc = f.rsplit("_", 1)             # gamestrings[_mapdata] , kokr
        return f"gamestrings/{head}_{build}_{loc}.json"
    return f"data/{f}_{build}.json"


def upstream_locales(m, folder):
    got = set()
    for r in ls_files(m, folder):
        if r.startswith("gamestrings/") and r.count("/") == 1:
            mm = GS_RE.match(r.split("/", 1)[1])
            if mm:
                got.add(mm.group(1))
    return sorted(got)


# ───────────────────────── 옛 형식 ─────────────────────────
def hdp4_sources(m, folder):
    """옛 형식 한 빌드의 자료가 실제로 어느 폴더에 있는지.
    자료가 앞 빌드와 똑같으면 원본은 파일을 두지 않고 "duplicate" 로 그 빌드를 가리킨다."""
    own = ls_files(m, folder)
    hdp = loose_json(read_files(m, folder, [".hdp.json"]).get(".hdp.json", b"{}")) if ".hdp.json" in own else {}
    dup = hdp.get("duplicate") or {}
    dsrc = dup.get("data") or folder
    has_own_gs = any(r.startswith("gamestrings/") for r in own)
    gsrc = dup.get("gamestrings") or dup.get("gamestring") or (dsrc if (dup.get("data") and not has_own_gs) else folder)
    return hdp, dsrc, gsrc


# ───────────────────────── 새 형식 ─────────────────────────
class Data2:
    """HDP 5.x — 차이(JSON Patch)를 사슬로 붙여 완성본을 만든다.
    앞 빌드의 완성본은 **보관소의 것이 지금 원본과 맞을 때만** 거기서 읽는다."""

    def __init__(self, mirror, dest, locales, trees, have):
        self.m, self.dest, self.locales, self.trees, self.have = mirror, dest, locales, trees, have
        self.last = (None, None)     # 방금 만든 폴더의 완성본만 들고 있는다(메모리 아끼기)
        self._hdp, self._chain = {}, {}

    def hdp(self, folder):
        if folder not in self._hdp:
            self._hdp[folder] = json.loads(read_files(self.m, folder, [".hdp.json"])[".hdp.json"].decode("utf-8-sig"))
        return self._hdp[folder]

    def chain_id(self, folder):
        """이 빌드의 완성본을 결정하는 원본 전부(뿌리부터 여기까지)의 지문. 하나라도 바뀌면 달라진다."""
        if folder not in self._chain:
            if folder not in self.trees:
                raise RuntimeError(f"사슬이 끊겼습니다: {folder} 폴더가 원본에 없습니다")
            meta = self.hdp(folder)
            base = self.chain_id(meta["depends-on"]) if meta.get("json") == "patch" else ""
            self._chain[folder] = hashlib.sha1((base + self.trees[folder]).encode()).hexdigest()
        return self._chain[folder]

    def docs_of(self, folder):
        if self.last[0] == folder:
            return self.last[1]
        rec = self.have.get(f"hdp5/{folder}")
        bdir = self.dest / "builds" / "hdp5" / folder
        if rec and rec.get("chainId") == self.chain_id(folder) and (bdir / "meta.json").exists():
            docs = {}
            for f in json.loads((bdir / "meta.json").read_text(encoding="utf-8"))["files"]:
                k = f.get("kind")
                if k and (not k.startswith("gamestrings/") or k.rsplit("_", 1)[1] in self.locales):
                    docs[k] = json.loads((bdir / f["path"]).read_text(encoding="utf-8"))
            if {f"gamestrings/gamestrings_{l}" for l in self.locales} <= set(docs):
                return docs
        return self.resolve(folder)[0]   # 없거나 옛것이면 사슬을 거슬러 만든다

    def resolve(self, folder):
        meta = self.hdp(folder)
        rels = [r for r in ls_files(self.m, folder) if wanted(r, self.locales)]
        blobs = read_files(self.m, folder, rels)
        docs = dict(self.docs_of(meta["depends-on"])) if meta.get("json") == "patch" else {}
        for rel, b in blobs.items():
            k = kind_of(rel)
            j = json.loads(b.decode("utf-8-sig"))
            if rel.endswith(".patch.json"):
                if k not in docs:
                    raise RuntimeError(f"{folder}: {k} 의 바탕이 없는데 차이 파일만 있습니다")
                docs[k] = jsonpatch.apply_patch(docs[k], j, in_place=False)
            else:
                docs[k] = j
        self.last = (folder, docs)
        return docs, meta


# ───────────────────────── 쓰기·색인 ─────────────────────────
def write_build(dest, gen, folder, files, meta_extra):
    """files: {보관 경로: (bytes, kind, 원본 blob id 또는 None)}"""
    bdir = dest / "builds" / gen / folder
    tmp = dest / "builds" / gen / (folder + ".part")  # 도중에 끊겨도 반쪽짜리가 '완료'로 남지 않게
    if tmp.exists():
        _rmtree(tmp)
    recs = []
    for rel, (b, kind, blob) in sorted(files.items()):
        p = tmp / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b)
        rec = {"path": rel, "kind": kind, "size": len(b), "sha256": sha256(b)}
        if blob:
            rec["blob"] = blob                        # 원본의 git blob id — 바이트까지 같은지 대조할 수 있다
        recs.append(rec)
    meta = dict(meta_extra, files=recs, archivedAt=now())
    (tmp / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    if bdir.exists():
        _rmtree(bdir)
    tmp.rename(bdir)
    return meta


def dates_from_site():
    p = ROOT / "site" / "data" / "patchnotes" / "builds.json"
    if not p.exists():
        return {}
    return {(b["build"], b["isPtr"]): b.get("date") for b in json.loads(p.read_text(encoding="utf-8-sig"))}


def date_from_mirror(m, folder):
    """사이트 쪽 날짜를 아직 모를 때: 그 폴더가 원본에 처음 올라온 날."""
    out = git(m, "log", "--diff-filter=A", "--format=%cs", "--reverse", "HEAD", "--", f"heroesdata/{folder}/", check=False)
    return (out.split() or [None])[0]


def load_index(dest):
    p = dest / "index.json"
    if not p.exists():
        return {"builds": []}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        bak = dest / "index.json.bak"
        if bak.exists():
            print("  ! index.json 이 깨져 있어 직전 사본(index.json.bak)으로 되돌립니다", file=sys.stderr)
            return json.loads(bak.read_text(encoding="utf-8"))
        raise SystemExit("index.json 이 깨졌고 사본도 없습니다. index.json 을 지우고 다시 돌리면 새로 만듭니다.")


def save_index(dest, idx, locales):
    """색인은 '다 쓴 뒤 바꿔치기'로 저장한다 — 쓰는 도중 전원이 나가도 옛 색인이 남는다."""
    idx["builds"].sort(key=lambda b: (b["build"], b["isPtr"], b.get("gen", "")))
    idx.update(updatedAt=now(), locales=sorted(locales), count=len(idx["builds"]))
    p, tmp = dest / "index.json", dest / "index.json.tmp"
    tmp.write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")
    if p.exists():
        os.replace(p, dest / "index.json.bak")
    os.replace(tmp, p)


README = """# 히오스 인게임 데이터 보관소 (내 PC 전용)

`hots_scrap/pipeline/steps/archive_builds.py` 가 만든다. **GitHub 에는 올라가지 않는다.**
새 빌드가 나오면 같은 스크립트를 다시 돌리면 그 빌드만 더 쌓인다.

## 무엇이 있나

| 폴더 | 내용 |
|---|---|
| `mirrors/*.git` | HeroesToolChest 원본 저장소를 **통째로** 거울 뜬 것. 모든 언어·모든 종류·전 기록. 원본이 사라져도 여기 남는다 |
| `builds/hdp4/<버전>/` | 옛 형식 (2019-10 ~ 2026-07). **원본 바이트 그대로** |
| `builds/hdp5/<버전>/` | 새 형식 (2026-05 ~). 차이(JSON Patch)를 붙여 만든 **완성본** |
| `…/data/` | 그 빌드의 게임 데이터 — 영웅(herodata)·유닛·스킨·탈것·음성·스프레이 … |
| `…/gamestrings/` | 그 빌드의 글(이름·툴팁). 지금 풀어 둔 언어: __LOCALES__ |
| `…/meta.json` | 출처 커밋, 원본 지문, 파일별 크기·sha256 |
| `index.json` | 쌓인 빌드 목록 |

`_ptr` 이 붙은 폴더는 공개 테스트 서버 빌드다. `2.55.16.97039` 는 두 형식 모두에 있다.

## 두 시대의 차이

- **옛 형식 hdp4** : 빌드마다 완성된 JSON. 파일 이름에 `_localized` 가 붙는다(글이 데이터 안에 들어 있는 형식).
  원본이 "이 빌드는 저 빌드와 자료가 같다"고 표시한 빌드는 그 빌드의 파일을 그대로 담았다(`meta.json` 의 `sameAs`).
  원본이 아예 뽑지 않은 빌드는 `index.json` 의 `noData` 에 적혀 있다.
- **새 형식 hdp5** : 수치(`data/herodata_*.json`)와 글(`gamestrings/*.json`)이 따로이고, `linkId` 가 글을 찾는 열쇠다.
  `gamestrings_mapdata_*` 는 전장 이름·설명이다.

맵 전용 덧패치(`data/maps`, `gamestrings/maps`)는 풀어 두지 않았다 — 필요하면 거울에서 꺼낸다:

    git --git-dir=mirrors/heroes-data2.git show HEAD:heroesdata/<버전>/data/maps/<맵>/<파일>

원본에 있는 언어: __UPSTREAM__
다른 언어가 필요하면(예: 프랑스어):

    python pipeline/steps/archive_builds.py --locales kokr,enus,frfr

## 원본이 나중에 고쳐질 때

HeroesToolChest 는 이미 올린 빌드를 나중에 고치기도 한다. 빌드마다 원본 폴더의 지문을 적어 두었다가,
달라지면 그 빌드와 거기 기대는 뒤 빌드를 다시 만든다. 옛 내용은 거울의 기록에 그대로 남아 있다.

## 없는 것

2019-10 이전의 한국어 데이터는 세상에 남아 있지 않다(2026-09 조사). 영어 원본은
SC2Mapster/SC2GameData 에 2017-03 ~ 2019-09 스냅숏 18개가 있다 — 아직 여기 담지 않았다.
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dest", default=os.environ.get("HOTS_ARCHIVE") or str(ROOT.parent / "hots_archive"))
    ap.add_argument("--locales", default="kokr,enus")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--offline", action="store_true", help="거울 갱신을 건너뛴다")
    ap.add_argument("--limit", type=int, default=0, help="한 번에 풀어 둘 빌드 수(0 = 전부)")
    ap.add_argument("--log", default="", help="실행 기록을 이 파일에 이어 쓴다(작업 스케줄러가 창 없이 돌릴 때)")
    a = ap.parse_args()
    if a.log:
        open_log(a.log)
    try:
        return run(a)
    except SystemExit:
        raise
    except Exception:
        # 창 없이 돌 때는 오류가 어디에도 안 보인다 — 기록에 남기고 실패로 끝낸다
        import traceback
        traceback.print_exc()
        return 1


def run(a):
    dest = Path(a.dest)
    locales = {x.strip().lower() for x in a.locales.split(",") if x.strip()}

    # 보관소가 git 저장소 안에 들어가면 안 된다(실수로 커밋된다)
    try:
        dest.resolve().relative_to(ROOT.resolve())
        raise SystemExit(f"보관소를 저장소 안({ROOT})에 두지 마십시오: {dest}")
    except ValueError:
        pass

    idx = load_index(dest)
    have = {b["key"]: b for b in idx["builds"] if "key" in b}   # key = "hdp4/2.47.2.76003"
    nodata = set(idx.get("noData", []))                          # 원본에 자료가 아예 없는 빌드(extracted:false)

    if a.status:
        if not have:
            print(f"아직 쌓인 것이 없습니다: {dest}")
            return 0
        bs = sorted(have.values(), key=lambda b: (b["build"], b["gen"]))
        size = sum(b.get("size", 0) for b in bs)
        print(f"보관소 {dest}")
        print(f"  빌드 {len(bs)}개 · {size / 1024 / 1024:,.0f} MB · 언어 {', '.join(idx.get('locales', []))}")
        print(f"  범위 {bs[0]['version']} ({bs[0].get('date')}) ~ {bs[-1]['version']} ({bs[-1].get('date')})")
        print(f"  옛 형식(hdp4) {sum(1 for b in bs if b['gen'] == 'hdp4')}개 · 새 형식(hdp5) {sum(1 for b in bs if b['gen'] == 'hdp5')}개"
              f" · 테스트 서버 {sum(1 for b in bs if b['isPtr'])}개")
        print(f"  원본에 자료가 없는 빌드 {len(nodata)}개 · 마지막 갱신 {idx.get('updatedAt')}")
        return 0

    if a.verify:
        bad = raw_ok = 0
        for key in sorted(have):
            bdir = dest / "builds" / key
            mp = bdir / "meta.json"
            if not mp.exists():
                print(f"  !! {key}: 폴더가 없습니다(다시 돌리면 새로 풉니다)")
                bad += 1
                continue
            for f in json.loads(mp.read_text(encoding="utf-8"))["files"]:
                p = bdir / f["path"]
                b = p.read_bytes() if p.exists() else None
                if b is None or sha256(b) != f["sha256"]:
                    print(f"  !! {key}/{f['path']}")
                    bad += 1
                elif f.get("blob"):
                    if git_blob_id(b) != f["blob"]:
                        print(f"  !! {key}/{f['path']} - 원본과 바이트가 다릅니다")
                        bad += 1
                    else:
                        raw_ok += 1
        print(f"대조 끝 - 빌드 {len(have)}개 · 어긋난 파일 {bad}개 · 원본과 바이트까지 같은 파일 {raw_ok}개")
        return 1 if bad else 0

    dest.mkdir(parents=True, exist_ok=True)
    dates = dates_from_site()
    made, up_locales = 0, []
    try:
        for name, gen, url in SOURCES:
            try:
                m, head = update_mirror(dest, name, url, a.offline)
            except Exception as e:
                print(f"  ! {name}: 건너뜁니다 - {str(e)[:200]}", file=sys.stderr)
                continue                                   # 한 저장소가 막혀도 다른 저장소는 계속 쌓는다
            trees = ls_versions(m)
            # 앞 빌드가 먼저 만들어져 있어야 하므로(새 형식의 사슬) 빌드 번호순으로 돈다
            folders = sorted(trees, key=lambda f: (int(VER_RE.match(f).group(2)), f.endswith("_ptr")))
            if folders:
                up_locales = upstream_locales(m, folders[-1]) or up_locales
                unknown = locales - set(up_locales)
                if unknown and up_locales:
                    raise SystemExit(f"원본에 없는 언어입니다: {', '.join(sorted(unknown))}  (있는 언어: {', '.join(up_locales)})")
            d2 = Data2(m, dest, locales, trees, have) if gen == "hdp5" else None

            def stale(folder):
                key = f"{gen}/{folder}"
                if key in nodata and idx.get("noDataTree", {}).get(key) == trees[folder]:
                    return False                              # 원본이 여전히 '자료 없음' 그대로다
                rec = have.get(key)
                if not rec or not (dest / "builds" / key / "meta.json").exists():
                    return True                               # 없거나, 폴더가 지워졌다
                if not set(rec.get("locales", [])) >= locales:
                    return True                               # 언어를 더 달라고 했다
                if d2:
                    return rec.get("chainId") != d2.chain_id(folder)      # 뿌리~여기 중 하나라도 원본이 바뀌었다
                old = rec.get("treeIds")
                return not old or old != {f: trees.get(f) for f in old}    # 이 빌드(또는 가리키는 빌드)의 원본이 바뀌었다

            todo = [f for f in folders if stale(f)]
            redo = sum(1 for f in todo if f"{gen}/{f}" in have)
            print(f"{name}: 빌드 {len(folders)}개 · 풀어 둘 것 {len(todo)}개" + (f" (그중 다시 만드는 것 {redo}개)" if redo else ""))
            for folder in todo:
                if a.limit and made >= a.limit:
                    print(f"  --limit {a.limit} 에 닿아 멈춥니다. 다시 돌리면 이어서 합니다.")
                    break
                key = f"{gen}/{folder}"
                mm = VER_RE.match(folder)
                version, build, is_ptr = mm.group(1), int(mm.group(2)), bool(mm.group(3))
                files, extra = {}, {}
                if d2:
                    docs, hmeta = d2.resolve(folder)
                    for k, doc in docs.items():
                        blob = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
                        files[out_name(k, build)] = (blob, k, None)
                    extra = {"hdp": hmeta.get("hdp"), "upstreamFormat": hmeta.get("json"), "dependsOn": hmeta.get("depends-on") or None,
                             "chainId": d2.chain_id(folder), "treeIds": {folder: trees[folder]},
                             "note": "원본이 차이(JSON Patch)라서 사슬을 붙여 만든 완성본" if hmeta.get("json") == "patch"
                                     else "원본을 읽어 다시 쓴 완성본(내용 동일, 공백만 줄임)"}
                else:
                    hmeta, dsrc, gsrc = hdp4_sources(m, folder)
                    if hmeta.get("extracted") is False:
                        nodata.add(key)                       # 원본이 이 빌드는 뽑지 않았다 - 원본이 바뀌기 전에는 다시 찾지 않는다
                        idx.setdefault("noDataTree", {})[key] = trees[folder]
                        print(f"  ·  {folder:<22} 원본에 자료 없음(extracted:false)")
                        continue
                    nodata.discard(key)
                    for src, sub in ((dsrc, "data/"), (gsrc, "gamestrings/")):
                        listing = ls_files(m, src)
                        rels = [r for r in listing if r.startswith(sub) and wanted(r, locales)]
                        for rel, blob in read_files(m, src, rels).items():
                            files[rel] = (blob, kind_of(rel), listing[rel])
                    extra = {"hdp": hmeta.get("hdp"), "upstreamFormat": "full", "note": "원본 바이트 그대로",
                             "treeIds": {f: trees.get(f) for f in sorted({folder, dsrc, gsrc})}}
                    if dsrc != folder or gsrc != folder:
                        # 원본이 "이 빌드는 저 빌드와 자료가 같다"고 가리킨 경우 - 그 빌드의 파일을 그대로 담는다
                        extra["sameAs"] = {"data": dsrc, "gamestrings": gsrc}
                        extra["note"] = "원본이 다른 빌드와 같다고 표시한 자료(파일 이름의 빌드 번호는 그 빌드 것). 원본 바이트 그대로"
                if not files:
                    print(f"  건너뜀 {folder}: 꺼낼 파일이 없습니다")
                    continue
                date = dates.get((build, is_ptr)) or date_from_mirror(m, folder)
                meta = write_build(dest, gen, folder, files, dict(
                    version=version, build=build, isPtr=is_ptr, folder=folder, gen=gen, date=date,
                    source={"repo": url, "commit": head}, locales=sorted(locales), **extra))
                size = sum(f["size"] for f in meta["files"])
                was = key in have
                have[key] = {"key": key, "gen": gen, "folder": folder, "version": version, "build": build, "isPtr": is_ptr,
                             "date": date, "source": name, "files": len(meta["files"]), "size": size,
                             "locales": sorted(locales), "archivedAt": meta["archivedAt"], "treeIds": extra["treeIds"]}
                if extra.get("chainId"):
                    have[key]["chainId"] = extra["chainId"]
                if extra.get("sameAs"):
                    have[key]["sameAs"] = extra["sameAs"]["data"]
                made += 1
                print(f"  {'~' if was else '+'} {key:<28} 파일 {len(meta['files']):>2}개 · {size / 1024 / 1024:5.1f} MB"
                      + (f"  (= {extra['sameAs']['data']})" if extra.get("sameAs") else ""), flush=True)
                if made % 10 == 0:
                    idx["builds"], idx["noData"] = list(have.values()), sorted(nodata)
                    save_index(dest, idx, locales)            # 도중에 끊겨도 한 것은 남게
        # 날짜를 나중에 알게 된 빌드는 채워 넣는다(사이트보다 먼저 쌓인 빌드)
        for key, rec in have.items():
            d = dates.get((rec["build"], rec["isPtr"]))
            if d and d != rec.get("date"):
                rec["date"] = d
                mp = dest / "builds" / key / "meta.json"
                if mp.exists():
                    mj = json.loads(mp.read_text(encoding="utf-8"))
                    mj["date"] = d
                    mp.write_text(json.dumps(mj, ensure_ascii=False, indent=1), encoding="utf-8")
    finally:
        # 도중에 예외가 나도 여기까지 한 것은 색인에 남긴다
        idx["builds"], idx["noData"] = list(have.values()), sorted(nodata)
        save_index(dest, idx, locales)
        (dest / "README.md").write_text(
            README.replace("__LOCALES__", ", ".join(sorted(locales))).replace("__UPSTREAM__", ", ".join(up_locales) or "(확인 못 함)"),
            encoding="utf-8")
    total = sum(b.get("size", 0) for b in idx["builds"])
    print(f"끝 - 이번에 {made}개 · 모두 {len(idx['builds'])}개 빌드 · {total / 1024 / 1024:,.0f} MB → {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
