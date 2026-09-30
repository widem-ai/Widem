# Turns the hero poster masters in art/ into the web files in public/hero/. The masters are stills rendered from the
# three.js scene itself at rest (`node scripts/poster.mjs`, after `npm run build`); re-render them when the scene changes.
# Run by hand when a master changes: `python art/export.py` (needs Pillow with AVIF support).
# Masters are kept in the repo so the web files can always be rebuilt; only public/hero/ is served.
from pathlib import Path
from PIL import Image

ART = Path(__file__).parent
OUT = ART.parent / "public" / "hero"
OUT.mkdir(parents=True, exist_ok=True)

# name, master file, output width, AVIF quality, WebP quality
JOBS = [
    ("scene-wide", "scene-wide.png", 1680, 70, 82),
    ("scene-tall", "scene-tall.png", 900, 70, 82),
]

for name, master, width, avif_q, webp_q in JOBS:
    im = Image.open(ART / master).convert("RGB")
    if im.width != width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(OUT / f"{name}.avif", quality=avif_q, speed=2)
    im.save(OUT / f"{name}.webp", quality=webp_q, method=6)
    sizes = {ext: (OUT / f"{name}.{ext}").stat().st_size // 1024 for ext in ("avif", "webp")}
    print(f"{name}: {im.width}x{im.height}  avif {sizes['avif']} KB  webp {sizes['webp']} KB")
