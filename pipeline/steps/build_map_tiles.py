# Cuts the high-quality battleground pictures (16000px JPG, 35-80 MB each - too big for Cloudflare Pages' 25 MB and
# for anyone's phone) into a zoomable tile pyramid for the library's map viewer (site/library/maps.html).
#   python pipeline/steps/build_map_tiles.py [--src DIR] [--out DIR] [--max 8000] [--only slug,slug] [--force]
# Output (heavy asset, never in this repo): <out>/<slug>/<z>/<x>_<y>.webp + <out>/index.json
#   z = 0 .. top, 512px tiles; at z = top the picture is --max px wide (8000 keeps the whole site under
#   Cloudflare's 20,000 files: ~300 tiles a map). Served as /cdn/assets/maps_hires/ through cloudflare/build_cf.py.
# One picture at a time, decoded at half size straight from the JPEG (draft), so memory stays ~200 MB.
import argparse, json, math, os, pathlib, time
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = pathlib.Path(__file__).resolve().parents[3]          # 03_claude
SRC = ROOT / "02_뷰어/best_qual_m3_date260829/02_work/map/imag_map_hires"
OUT = ROOT / "hotscrap_xyz/_src/hots-scrap-assets/maps_hires"
TILE, QUALITY = 512, 80


def cut(jpg, dst, max_w):
    im = Image.open(jpg)
    full_w, full_h = im.size
    im.draft("RGB", (max_w, max_w * full_h // full_w))       # JPEG decodes at 1/2, 1/4 ... directly
    im = im.convert("RGB")
    w = min(max_w, full_w)
    h = round(full_h * w / full_w)
    if im.size != (w, h):
        im = im.resize((w, h), Image.LANCZOS)
    top = max(0, math.ceil(math.log2(max(w, h) / TILE)))
    n = 0
    for z in range(top, -1, -1):
        if z < top:
            im = im.resize((max(1, math.ceil(im.width / 2)), max(1, math.ceil(im.height / 2))), Image.LANCZOS)
        (dst / str(z)).mkdir(parents=True, exist_ok=True)
        for x in range(math.ceil(im.width / TILE)):
            for y in range(math.ceil(im.height / TILE)):
                part = im.crop((x * TILE, y * TILE, min(im.width, (x + 1) * TILE), min(im.height, (y + 1) * TILE)))
                if part.size != (TILE, TILE):   # edge tile: the viewer draws every tile 512x512, so pad, don't stretch
                    pad = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
                    pad.paste(part, (0, 0))
                    part = pad
                part.save(dst / str(z) / f"{x}_{y}.webp", "WEBP", quality=QUALITY, method=4)
                n += 1
    return {"w": w, "h": h, "top": top, "tile": TILE, "tiles": n}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=pathlib.Path, default=SRC)
    ap.add_argument("--out", type=pathlib.Path, default=OUT)
    ap.add_argument("--max", type=int, default=8000, help="width at the top zoom level")
    ap.add_argument("--only", help="comma-separated slugs")
    ap.add_argument("--force", action="store_true", help="cut again even if the source is older than the tiles")
    a = ap.parse_args()
    try:
        os.nice(10)
    except (AttributeError, OSError):
        pass
    idx_path = a.out / "index.json"
    idx = json.loads(idx_path.read_text(encoding="utf-8")) if idx_path.exists() else {}
    only = set(a.only.split(",")) if a.only else None
    for jpg in sorted(a.src.glob("*.jpg")):
        slug = jpg.stem
        if only and slug not in only:
            continue
        dst = a.out / slug
        if not a.force and slug in idx and idx[slug].get("max") == a.max and dst.exists() \
                and dst.stat().st_mtime >= jpg.stat().st_mtime:
            continue
        t = time.time()
        if dst.exists():
            for f in sorted(dst.rglob("*"), reverse=True):
                f.unlink() if f.is_file() else f.rmdir()
        info = cut(jpg, dst, a.max)
        info["max"] = a.max
        idx[slug] = info
        a.out.mkdir(parents=True, exist_ok=True)
        idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")
        size = sum(f.stat().st_size for f in dst.rglob("*.webp"))
        print(f"{slug}: {info['w']}x{info['h']} z0-{info['top']} {info['tiles']} tiles {size / 2**20:.1f} MB "
              f"({time.time() - t:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
