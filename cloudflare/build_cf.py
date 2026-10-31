# Builds cloudflare/public/ - the whole HotS Scrap site as one folder for Cloudflare Pages (hotscrap.com).
# On GitHub it was four Pages sites plus release downloads; here they sit under one origin:
#   sin0nis.github.io/hots-scrap/        -> /             (site/ of this repo)
#   sin0nis.github.io/images/            -> /cdn/images/  (<src>/images, a clone of SIN0NIS/images)
#   sin0nis.github.io/hots-scrap-assets/ -> /cdn/assets/  (<src>/hots-scrap-assets)
#   sin0nis.github.io/hots_hero_m3/      -> /hero3d/      (<src>/hots_hero_m3, or ../hots_hero_web beside the repo)
#   release files (viewer exe, obs interfaces) -> /downloads/ (<src>/releases)
#   extra/ (only this host: admin/, _headers) -> /; server code is functions/, deployed beside public/
# Text files get those addresses rewritten to the new origin; everything else is copied as is. Sources are never
# changed: edit them, then run this again. Used the same way by the PC (hotscrap_xyz/auto_update.py) and by GitHub
# Actions (.github/workflows/pages.yml), then deployed from this folder: npx wrangler pages deploy
#   python cloudflare/build_cf.py [--src DIR] [--origin https://hotscrap.com] [--by local|github-actions]
import argparse, datetime, json, pathlib, re, shutil

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
OUT = HERE / "public"
LOCAL_SRC = REPO.parent / "hotscrap_xyz" / "_src"   # the PC keeps its clones and release files here


def sources(src):
    hero3d = src / "hots_hero_m3"
    return [   # (source folder, place under public/)
        (REPO / "site", ""),
        (src / "images", "cdn/images"),
        (src / "hots-scrap-assets", "cdn/assets"),
        (hero3d if hero3d.is_dir() else REPO.parent / "hots_hero_web", "hero3d"),
        (src / "releases", "downloads"),
        (HERE / "extra", ""),
    ]


SKIP = {".git", ".github", "tools", "__pycache__"}   # repo plumbing, not site content
TEXT = {".html", ".js", ".json", ".css", ".md", ".txt", ".webmanifest"}
LIMITS = (20_000, 25 * 1024 * 1024)   # Cloudflare Pages: files per site, bytes per file


def rewrites(origin):
    gh = r"https://sin0nis\.github\.io/"
    host = re.sub(r"^https?://|:\d+$", "", origin)
    return [
        (re.compile(gh + r"hots-scrap-assets(?![-\w])/?"), origin + "/cdn/assets/"),
        (re.compile(gh + r"images(?![-\w])/?"), origin + "/cdn/images/"),
        (re.compile(gh + r"hots_hero_m3(?![-\w])/?"), origin + "/hero3d/"),
        (re.compile(gh + r"hots-scrap(?![-\w])/?"), origin + "/"),
        (re.compile(r"https://github\.com/SIN0NIS/hots-scrap-custom-viewer/releases/latest/download/"),
         origin + "/downloads/"),
        (re.compile(r"https://github\.com/SIN0NIS/hots-scrap-obs/releases/latest/download/"), origin + "/downloads/"),
        # the global bar marks the 3D viewer's pages by their old path
        (re.compile(re.escape("[/hots_hero_m3/, 'viewer']")), r"[/\\/hero3d\\//, 'viewer']"),
        # the replay viewer's ?replay= link allow-list: the new host too
        (re.compile(re.escape("'sin0nis.github.io',")), f"'sin0nis.github.io', '{host}',"),
    ]


def build(origin, by=None, src=LOCAL_SRC):
    """Brings public/ up to date and returns how many files it wrote. Only files whose source is newer are
    rewritten (a full copy is 1.3 GB); everything is redone when the origin or this script changed. Files no source
    gives any more are removed. by: who deploys ("local" / "github-actions"), written to /deploy.json with the time
    so the local updater can tell whether GitHub is keeping the site up to date."""
    rules = rewrites(origin.rstrip("/"))
    stamp = HERE / ".build_origin"
    full = (not stamp.exists() or stamp.read_text(encoding="utf-8") != origin
            or stamp.stat().st_mtime < pathlib.Path(__file__).stat().st_mtime)
    if full and OUT.exists():
        shutil.rmtree(OUT)
    files = wrote = 0
    made = set()
    for root, place in sources(src):
        if not root.is_dir():
            raise SystemExit(f"missing source: {root}")
        for f in root.rglob("*"):
            rel = f.relative_to(root)
            if not f.is_file() or SKIP & set(rel.parts[:-1]) or f.name.startswith(".git"):
                continue
            dst = OUT / place / rel
            made.add(dst)
            files += 1
            if dst.exists() and dst.stat().st_mtime >= f.stat().st_mtime:
                continue
            dst.parent.mkdir(parents=True, exist_ok=True)
            if f.suffix.lower() in TEXT:
                text = f.read_text(encoding="utf-8", errors="surrogateescape")
                for pattern, repl in rules:
                    text = pattern.sub(repl, text)
                dst.write_text(text, encoding="utf-8", errors="surrogateescape", newline="")
            else:
                shutil.copyfile(f, dst)
            if dst.stat().st_size > LIMITS[1]:
                raise SystemExit(f"over 25 MB (Cloudflare Pages limit): {dst}")
            wrote += 1
    if by:
        info = OUT / "deploy.json"
        info.write_text(json.dumps({"by": by, "at": datetime.datetime.now(datetime.timezone.utc).isoformat(
            timespec="seconds")}), encoding="utf-8")
        made.add(info)
        files += 1
    gone = [p for p in OUT.rglob("*") if p.is_file() and p not in made]
    for p in gone:
        p.unlink()
    if files > LIMITS[0]:
        raise SystemExit(f"{files} files, over Cloudflare Pages' {LIMITS[0]}")
    stamp.write_text(origin, encoding="utf-8")
    print(f"public/: {files} files, {wrote} written{' (full rebuild)' if full else ''}, {len(gone)} removed, for {origin}")
    return wrote + len(gone)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--origin", default="https://hotscrap.com")
    ap.add_argument("--by", help="write /deploy.json saying who deploys (local / github-actions)")
    ap.add_argument("--src", type=pathlib.Path, default=LOCAL_SRC, help="folder with images, hots-scrap-assets, releases")
    a = ap.parse_args()
    build(a.origin, a.by, a.src)
