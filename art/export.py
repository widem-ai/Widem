# Turns the hero film's masters into the web files in public/hero/. Run by hand after a render: `python art/export.py`
# (needs Pillow with AVIF support).
# The masters are PNG frames rendered in Blender by art/cinematic/scene.py (the scene as a script; a copy and the
# storyboard live in the vault, output/widem-website/design/hero-cinematic/). They are not kept in git (about 1 MB
# each): re-render them with the commands in art/cinematic/README.md. Only public/hero/ is served.
# Frame 0 of each film is also its poster, so the canvas fading in over the poster shows no jump.
import sys
from pathlib import Path
from PIL import Image

ART = Path(__file__).parent
FRAMES = ART / "cinematic" / "frames"
OUT = ART.parent / "public" / "hero"

# set, frame count, output width, frame WebP quality; poster AVIF / WebP quality
FILMS = [("wide", 96, 1280, 72, 80, 85), ("tall", 72, 540, 72, 80, 85)]

for name, count, width, q, avif_q, webp_q in FILMS:
    if sys.argv[1:] and name not in sys.argv[1:]:   # `python art/export.py wide` exports one set
        continue
    out = OUT / "film" / name
    out.mkdir(parents=True, exist_ok=True)
    total = 0
    for i in range(count):
        im = Image.open(FRAMES / f"{name}-{i:03d}.png").convert("RGB")
        if im.width != width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        im.save(out / f"{i:03d}.webp", quality=q, method=6)
        total += (out / f"{i:03d}.webp").stat().st_size
        if i == 0:
            im.save(OUT / f"scene-{name}.avif", quality=avif_q, speed=2)
            im.save(OUT / f"scene-{name}.webp", quality=webp_q, method=6)
    sizes = {ext: (OUT / f"scene-{name}.{ext}").stat().st_size // 1024 for ext in ("avif", "webp")}
    print(f"{name}: {count} frames {width}px, {total // 1024} KB total ({total // 1024 // count} KB/frame); "
          f"poster avif {sizes['avif']} KB webp {sizes['webp']} KB")
