# The hero film ("the core")

`scene.py` builds the whole Blender scene by script (model, materials, lights, haze, camera path, the power-on) and
renders it as a frame sequence. Frame i of N is the film at scroll progress t = i / (N - 1). Storyboard and the vault
copy of this script: `output/widem-website/design/hero-cinematic/` in the Obsidian vault.

Render the masters (Blender 5.2, Cycles on the GPU; ignored by git), then export the web files:

    blender -b --factory-startup -P art/cinematic/scene.py -- --variant wide --frames 96 --samples 32 --scale 0.8 --out art/cinematic/frames
    blender -b --factory-startup -P art/cinematic/scene.py -- --variant tall --frames 72 --samples 32 --scale 0.75 --out art/cinematic/frames
    python art/export.py

Look at a few frames before a full render: `--only 0,0.45,0.8 --samples 32 --scale 0.5`. `--first K` resumes a sequence.
`--save scene.blend` keeps the built scene to open in Blender. If the frame count changes, change `FILM` in
`src/sections/heroFilm.ts`, `FILMS` in `art/export.py` and `FILM_SETS` in `scripts/check.mjs` together (the check
fails when they disagree with the files).
