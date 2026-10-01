# Widem cinematic hero, "the core": the whole Blender scene, built by script so it is reproducible.
# Storyboard: ../storyboard.md. Version 1, 2026-10-01 (motion-engineer).
#
# Run headless (Blender 5.2):
#   blender.exe -b --factory-startup -P scene.py -- --variant wide --frames 120 --out <dir>
#   blender.exe -b --factory-startup -P scene.py -- --variant wide --only 0,0.45,0.8 --out <dir> --samples 32 --scale 0.5
#   add --save <file.blend> to keep the built scene for opening in the Blender UI.
# Each frame i of N is the film at scroll progress t = i / (N - 1); the web page draws frame round(t * (N - 1)).
# Everything that moves (camera, focus, power, light, exposure) is a function of t below, not keyframes, so the
# wide and the tall (phone) films are the same story with their own camera.
import argparse, math, random, sys, time
from pathlib import Path

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--variant", choices=["wide", "tall"], default="wide")
ap.add_argument("--frames", type=int, default=120)
ap.add_argument("--only", default="", help="comma list of t values (0..1) to render instead of the sequence")
ap.add_argument("--first", type=int, default=0, help="first frame index to render (resume)")
ap.add_argument("--out", default=str(Path(__file__).parent / "out"))
ap.add_argument("--samples", type=int, default=64)
ap.add_argument("--scale", type=float, default=1.0, help="resolution scale (1 = 1600x900 wide / 720x1280 tall)")
ap.add_argument("--device", default="HIP", help="HIP, CUDA, OPTIX, ONEAPI or CPU")
ap.add_argument("--save", default="")
args = ap.parse_args(argv)

MM = 0.001
random.seed(7)
EMERALD = (0.18, 0.83, 0.62)            # the brand emerald (#2FD39E), linear-ish
WARM = (1.0, 0.70, 0.42)                # tungsten key, about 3200 K

# ---------------------------------------------------------------- reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection


def node_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    return m, nt, bsdf


def setin(node, name, value):
    if name in node.inputs:
        node.inputs[name].default_value = value


def add_box(name, size, loc, mat=None, bevel=0.0, segs=3, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        b = o.modifiers.new("bevel", "BEVEL")
        b.width = bevel
        b.segments = segs
        b.limit_method = "ANGLE"
    if mat:
        o.data.materials.append(mat)
    return o


def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- materials
# Board: dark green-black solder mask with a clear coat and a faint glass-weave bump.
board_m, nt, b = node_mat("solder_mask")
setin(b, "Base Color", (0.006, 0.022, 0.016, 1))
setin(b, "Roughness", 0.6)
setin(b, "Coat Weight", 0.45)
setin(b, "Coat Roughness", 0.22)
weave = nt.nodes.new("ShaderNodeTexWave"); weave.wave_type = "BANDS"; weave.inputs["Scale"].default_value = 900
weave.inputs["Distortion"].default_value = 2.0
noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 400
bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.05
mix = nt.nodes.new("ShaderNodeMath"); mix.operation = "ADD"
nt.links.new(weave.outputs["Fac"], mix.inputs[0]); nt.links.new(noise.outputs["Fac"], mix.inputs[1])
nt.links.new(mix.outputs[0], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])

# Gold lid: polished gold, anisotropic along concentric machining rings, with the rings etched in as a fine bump.
gold_m, nt, b = node_mat("gold_lid")
setin(b, "Base Color", (1.0, 0.70, 0.32, 1))
setin(b, "Metallic", 1.0)
setin(b, "Roughness", 0.22)
setin(b, "Anisotropic", 0.7)
tan = nt.nodes.new("ShaderNodeTangent"); tan.direction_type = "RADIAL"; tan.axis = "Z"
nt.links.new(tan.outputs["Tangent"], b.inputs["Tangent"])
tc = nt.nodes.new("ShaderNodeTexCoord")
rings = nt.nodes.new("ShaderNodeTexWave"); rings.wave_type = "RINGS"; rings.inputs["Scale"].default_value = 260
rings.inputs["Distortion"].default_value = 0.0
nt.links.new(tc.outputs["Object"], rings.inputs["Vector"])
rbump = nt.nodes.new("ShaderNodeBump"); rbump.inputs["Strength"].default_value = 0.12; rbump.inputs["Distance"].default_value = 0.0002
nt.links.new(rings.outputs["Fac"], rbump.inputs["Height"]); nt.links.new(rbump.outputs["Normal"], b.inputs["Normal"])
rough_n = nt.nodes.new("ShaderNodeTexNoise"); rough_n.inputs["Scale"].default_value = 120
rmap = nt.nodes.new("ShaderNodeMapRange"); rmap.inputs["To Min"].default_value = 0.16; rmap.inputs["To Max"].default_value = 0.32
nt.links.new(rough_n.outputs["Fac"], rmap.inputs["Value"]); nt.links.new(rmap.outputs["Result"], b.inputs["Roughness"])

# Plain gold for the legs and pads (no rings).
leg_m, nt, b = node_mat("gold_plain")
setin(b, "Base Color", (1.0, 0.72, 0.36, 1)); setin(b, "Metallic", 1.0); setin(b, "Roughness", 0.3)

# Ceramic carrier: matte black.
cer_m, nt, b = node_mat("ceramic")
setin(b, "Base Color", (0.012, 0.012, 0.013, 1)); setin(b, "Roughness", 0.62)
cn = nt.nodes.new("ShaderNodeTexNoise"); cn.inputs["Scale"].default_value = 2500
cb = nt.nodes.new("ShaderNodeBump"); cb.inputs["Strength"].default_value = 0.08
nt.links.new(cn.outputs["Fac"], cb.inputs["Height"]); nt.links.new(cb.outputs["Normal"], b.inputs["Normal"])

# Glass window.
glass_m, nt, b = node_mat("glass")
setin(b, "Base Color", (0.9, 0.97, 0.95, 1)); setin(b, "Roughness", 0.02)
setin(b, "Transmission Weight", 1.0); setin(b, "IOR", 1.5)

# The die: dark silicon with an oil-film shimmer and a grid of circuitry that glows emerald with `die_power`.
die_m, nt, b = node_mat("die")
setin(b, "Base Color", (0.05, 0.06, 0.08, 1)); setin(b, "Metallic", 0.9); setin(b, "Roughness", 0.18)
setin(b, "Thin Film Thickness", 520.0); setin(b, "Thin Film IOR", 1.45)
dtc = nt.nodes.new("ShaderNodeTexCoord")
brick = nt.nodes.new("ShaderNodeTexBrick"); brick.inputs["Scale"].default_value = 320
brick.inputs["Mortar Size"].default_value = 0.04; brick.inputs["Color1"].default_value = (1, 1, 1, 1)
brick.inputs["Color2"].default_value = (0.25, 0.25, 0.25, 1); brick.inputs["Mortar"].default_value = (0, 0, 0, 1)
nt.links.new(dtc.outputs["Object"], brick.inputs["Vector"])
die_power = nt.nodes.new("ShaderNodeValue"); die_power.name = "power"
dm = nt.nodes.new("ShaderNodeMath"); dm.operation = "MULTIPLY"
brick2 = nt.nodes.new("ShaderNodeTexBrick"); brick2.inputs["Scale"].default_value = 1100
brick2.inputs["Mortar Size"].default_value = 0.08; brick2.inputs["Color1"].default_value = (1, 1, 1, 1)
brick2.inputs["Color2"].default_value = (0.1, 0.1, 0.1, 1); brick2.inputs["Mortar"].default_value = (0, 0, 0, 1)
nt.links.new(dtc.outputs["Object"], brick2.inputs["Vector"])
lines = nt.nodes.new("ShaderNodeMath"); lines.operation = "MAXIMUM"   # the mortar of two grids = circuit lines
nt.links.new(brick.outputs["Fac"], lines.inputs[0]); nt.links.new(brick2.outputs["Fac"], lines.inputs[1])
nt.links.new(lines.outputs[0], dm.inputs[0]); nt.links.new(die_power.outputs[0], dm.inputs[1])
dm2 = nt.nodes.new("ShaderNodeMath"); dm2.operation = "MULTIPLY"; dm2.inputs[1].default_value = 3.0
nt.links.new(dm.outputs[0], dm2.inputs[0])
setin(b, "Emission Color", (*EMERALD, 1))
nt.links.new(dm2.outputs[0], b.inputs["Emission Strength"])

# Copper traces: copper metal; lit emerald behind a front that runs outward from the core (`front`, metres).
trace_m, nt, b = node_mat("trace")
setin(b, "Base Color", (0.93, 0.52, 0.34, 1)); setin(b, "Metallic", 1.0); setin(b, "Roughness", 0.35)
setin(b, "Emission Color", (*EMERALD, 1))
geo = nt.nodes.new("ShaderNodeNewGeometry")
sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(geo.outputs["Position"], sep.inputs[0])
cxy = nt.nodes.new("ShaderNodeCombineXYZ"); nt.links.new(sep.outputs["X"], cxy.inputs["X"]); nt.links.new(sep.outputs["Y"], cxy.inputs["Y"])
dist = nt.nodes.new("ShaderNodeVectorMath"); dist.operation = "LENGTH"; nt.links.new(cxy.outputs[0], dist.inputs[0])
DIST = dist.outputs["Value"]   # LENGTH writes its float to "Value", not to the vector output
front = nt.nodes.new("ShaderNodeValue"); front.name = "front"
# lit = 1 behind the front (dist < front), with a soft 6 mm edge; band = a bright 4 mm head at the front itself.
sub = nt.nodes.new("ShaderNodeMath"); sub.operation = "SUBTRACT"
nt.links.new(front.outputs[0], sub.inputs[0]); nt.links.new(DIST, sub.inputs[1])        # front - dist
lit = nt.nodes.new("ShaderNodeMapRange"); lit.inputs["From Min"].default_value = -0.001; lit.inputs["From Max"].default_value = 0.006
nt.links.new(sub.outputs[0], lit.inputs["Value"])
absn = nt.nodes.new("ShaderNodeMath"); absn.operation = "ABSOLUTE"; nt.links.new(sub.outputs[0], absn.inputs[0])
band = nt.nodes.new("ShaderNodeMapRange"); band.inputs["From Min"].default_value = 0.004; band.inputs["From Max"].default_value = 0.0
nt.links.new(absn.outputs[0], band.inputs["Value"])
fall = nt.nodes.new("ShaderNodeMapRange")   # the glow fades a little with distance, so the core stays the brightest
fall.inputs["From Min"].default_value = 0.02; fall.inputs["From Max"].default_value = 0.25
fall.inputs["To Min"].default_value = 1.0; fall.inputs["To Max"].default_value = 0.35
nt.links.new(DIST, fall.inputs["Value"])
lb = nt.nodes.new("ShaderNodeMath"); lb.operation = "MULTIPLY"; nt.links.new(lit.outputs[0], lb.inputs[0]); nt.links.new(fall.outputs[0], lb.inputs[1])
bb = nt.nodes.new("ShaderNodeMath"); bb.operation = "MULTIPLY"; bb.inputs[1].default_value = 1.2; nt.links.new(band.outputs[0], bb.inputs[0])
tot = nt.nodes.new("ShaderNodeMath"); tot.operation = "ADD"; nt.links.new(lb.outputs[0], tot.inputs[0]); nt.links.new(bb.outputs[0], tot.inputs[1])
gain = nt.nodes.new("ShaderNodeMath"); gain.operation = "MULTIPLY"; gain.inputs[1].default_value = 1.3
nt.links.new(tot.outputs[0], gain.inputs[0]); nt.links.new(gain.outputs[0], b.inputs["Emission Strength"])

# Small parts: ceramic capacitor bodies and tin end caps.
capb_m, nt, b = node_mat("cap_body"); setin(b, "Base Color", (0.30, 0.22, 0.15, 1)); setin(b, "Roughness", 0.55)
tin_m, nt, b = node_mat("tin"); setin(b, "Base Color", (0.82, 0.83, 0.85, 1)); setin(b, "Metallic", 1.0); setin(b, "Roughness", 0.3)
res_m, nt, b = node_mat("res_body"); setin(b, "Base Color", (0.015, 0.015, 0.016, 1)); setin(b, "Roughness", 0.4)

# ---------------------------------------------------------------- geometry (metres; the core is 44 mm across)
add_box("board", (0.6, 0.6, 1.6 * MM), (0, 0, -0.8 * MM), board_m)
carrier = add_box("carrier", (44 * MM, 44 * MM, 2.4 * MM), (0, 0, 1.2 * MM), cer_m, bevel=0.5 * MM, segs=3)
lid = add_box("lid", (34 * MM, 34 * MM, 3.6 * MM), (0, 0, 2.4 * MM + 1.8 * MM), gold_m, bevel=1.4 * MM, segs=1)
cut = add_box("window_cut", (12 * MM, 12 * MM, 10 * MM), (0, 0, 4 * MM))
bo = lid.modifiers.new("window", "BOOLEAN"); bo.operation = "DIFFERENCE"; bo.object = cut
lid.modifiers.move(lid.modifiers.find("window"), 0)     # cut first, then bevel the window's edges too
cut.hide_render = True; cut.hide_viewport = True
add_box("glass", (12.6 * MM, 12.6 * MM, 0.7 * MM), (0, 0, 5.3 * MM), glass_m, bevel=0.15 * MM)
add_box("die", (10.4 * MM, 10.4 * MM, 0.5 * MM), (0, 0, 2.4 * MM + 0.25 * MM), die_m, bevel=0.1 * MM)
add_box("die_bed", (11.6 * MM, 11.6 * MM, 0.3 * MM), (0, 0, 2.4 * MM + 0.1 * MM), leg_m)

# Legs (gull-wing, drawn as a shoulder, a slope and a foot) and the fan-out traces, 14 per side.
N_PER, PITCH, FAN = 14, 2.2 * MM, 2.0
LEG_W = 0.6 * MM
trace_segments = []   # (x0, y0, x1, y1, width)


def side_xf(side, u, v):
    """Map (outward u, lateral v) on a side to board x, y. side 0:+x 1:+y 2:-x 3:-y."""
    return [(u, v), (-v, u), (-u, -v), (v, -u)][side]


def seg_box(name, p0, p1, w, h, z, mat):
    (x0, y0), (x1, y1) = p0, p1
    L = math.hypot(x1 - x0, y1 - y0)
    ang = math.atan2(y1 - y0, x1 - x0)
    return add_box(name, (L + w, w, h), ((x0 + x1) / 2, (y0 + y1) / 2, z), mat, rot=(0, 0, ang))


legs = []
for side in range(4):
    for k in range(N_PER):
        v = (k - (N_PER - 1) / 2) * PITCH
        sh = side_xf(side, 23.4 * MM, v)
        # shoulder (leaves the carrier at mid-height), slope down, foot on the board
        legs.append(seg_box("leg", side_xf(side, 21.5 * MM, v), side_xf(side, 23.6 * MM, v), LEG_W, 0.25 * MM, 1.3 * MM, leg_m))
        p0 = Vector((*side_xf(side, 23.6 * MM, v), 1.3 * MM)); p1 = Vector((*side_xf(side, 25.0 * MM, v), 0.15 * MM))
        mid = (p0 + p1) / 2; d = p1 - p0
        o = add_box("leg", (d.length, LEG_W, 0.25 * MM), mid, leg_m)
        o.rotation_euler = (0, 0, 0)
        o.rotation_mode = "XYZ"
        horiz = math.atan2(d.y, d.x); pitch = -math.atan2(d.z, math.hypot(d.x, d.y))
        o.rotation_euler = (0, pitch, horiz)
        legs.append(o)
        legs.append(seg_box("leg", side_xf(side, 25.0 * MM, v), side_xf(side, 27.0 * MM, v), LEG_W, 0.25 * MM, 0.12 * MM, leg_m))
        # trace: straight out, 45 degrees outward (fan), then straight to the board's edge
        r1 = 30 * MM + random.uniform(0, 1.5) * MM
        a = (27 * MM, v)
        bpt = (r1, v)
        c = (r1 + abs(v) * (FAN - 1), v * FAN)
        d_ = (0.3, v * FAN)
        w = random.choice([0.45, 0.55, 0.7]) * MM
        for (s0, s1) in ((a, bpt), (bpt, c), (c, d_)):
            if math.dist(s0, s1) > 1e-6:
                trace_segments.append((side_xf(side, *s0), side_xf(side, *s1), w))

for i, (p0, p1, w) in enumerate(trace_segments):
    seg_box(f"trace{i}", p0, p1, w, 0.07 * MM, 0.035 * MM, trace_m)

# Vias at some trace bends.
for (p0, p1, w) in trace_segments[1::7]:
    bpy.ops.mesh.primitive_cylinder_add(radius=0.6 * MM, depth=0.09 * MM, location=(p1[0], p1[1], 0.045 * MM), vertices=24)
    bpy.context.active_object.data.materials.append(leg_m)

# Small parts: decoupling capacitors in tidy 3 x 3 blocks at the core's corners (no traces run there), and a few
# larger parts in rows further out. (A random scatter read as crumbs on the board.)
def part(x, y, L, W_, H, rot, body):
    add_box("part", (L * 0.68 * MM, W_ * MM, H * MM), (x, y, H / 2 * MM), body, bevel=0.08 * MM, rot=(0, 0, rot))
    for s_ in (-1, 1):
        ox, oy = (s_ * L * 0.42 * MM * math.cos(rot), s_ * L * 0.42 * MM * math.sin(rot))
        add_box("cap_end", (L * 0.18 * MM, W_ * 1.02 * MM, H * 1.02 * MM), (x + ox, y + oy, H / 2 * MM), tin_m,
                bevel=0.06 * MM, rot=(0, 0, rot))


for qx in (1, -1):
    for qy in (1, -1):
        for i in range(3):
            for j in range(3):
                part(qx * (34 + i * 4.2) * MM, qy * (34 + j * 3.2) * MM, 2.0, 1.25, 0.9, 0.0, capb_m)
        for i in range(4):
            part(qx * (62 + i * 6) * MM, qy * (64 + (i % 2) * 2) * MM, 3.2, 1.6, 1.1, math.pi / 4 * qx * qy, res_m)

# Haze: a box of thin volume around the scene so the key light draws a beam.
haze_m = bpy.data.materials.new("haze"); haze_m.use_nodes = True
hn = haze_m.node_tree
hn.nodes.remove(hn.nodes.get("Principled BSDF"))
vol = hn.nodes.new("ShaderNodeVolumePrincipled")
vol.inputs["Density"].default_value = 0.14
vol.inputs["Anisotropy"].default_value = 0.35
vol.inputs["Color"].default_value = (0.9, 0.92, 0.95, 1)
hn.links.new(vol.outputs[0], hn.nodes.get("Material Output").inputs["Volume"])
add_box("haze", (0.7, 0.7, 0.5), (0, 0, 0.25), haze_m)

# ---------------------------------------------------------------- lights and world
world = bpy.data.worlds.new("dark"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.0008, 0.0012, 0.0011, 1)

key_d = bpy.data.lights.new("key", "SPOT"); key_d.color = WARM; key_d.spot_size = math.radians(18); key_d.spot_blend = 0.6
key_d.shadow_soft_size = 0.025
key = bpy.data.objects.new("key", key_d); col.objects.link(key)
key.location = (-0.34, 0.10, 0.30)

rim_d = bpy.data.lights.new("rim", "AREA"); rim_d.color = (0.55, 1.0, 0.85); rim_d.size = 0.08; rim_d.energy = 0.045; rim_d.spread = math.radians(40)
rim = bpy.data.objects.new("rim", rim_d); col.objects.link(rim)
rim.location = (0.18, 0.32, 0.10)

fill_d = bpy.data.lights.new("fill", "AREA"); fill_d.color = (0.75, 0.82, 1.0); fill_d.size = 0.4; fill_d.energy = 0.0
fill = bpy.data.objects.new("fill", fill_d); col.objects.link(fill)
fill.location = (0.1, -0.35, 0.3)


def aim(obj, target):
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = (Vector(target) - obj.location).to_track_quat("-Z", "Y")


aim(key, (0.0, 0.0, 0.0)); aim(rim, (0.0, 0.0, 0.005)); aim(fill, (0, 0, 0))
for o in (key, rim, fill):   # lights light the scene; the camera never sees the lamp itself
    o.visible_camera = False

# ---------------------------------------------------------------- camera and the story as a function of t
cam_d = bpy.data.cameras.new("cam"); cam_d.clip_start = 0.002; cam_d.clip_end = 5
cam = bpy.data.objects.new("cam", cam_d); col.objects.link(cam); scene.camera = cam
cam_d.dof.use_dof = True
cam_d.dof.aperture_fstop = 4.0
cam_d.dof.aperture_blades = 7
cam_d.dof.aperture_ratio = 1.0

# (t, camera position, aim point). Wide = desktop film; tall = phone film (own framing, chip lower in frame).
KEYS = {
    "wide": [
        (0.00, (-0.020, -0.180, 0.140), (0.0, 0.056, 0.0)),
        (0.22, (0.030, -0.150, 0.070), (0.0, 0.012, 0.004)),
        (0.42, (0.078, -0.088, 0.020), (0.0, 0.000, 0.004)),
        (0.60, (0.086, -0.012, 0.030), (-0.004, 0.000, 0.004)),
        (0.80, (0.010, -0.130, 0.125), (0.0, 0.040, 0.0)),
        (1.00, (0.000, -0.165, 0.190), (0.0, 0.062, 0.0)),
    ],
    "tall": [
        (0.00, (-0.030, -0.250, 0.230), (0.0, 0.104, 0.0)),
        (0.22, (0.030, -0.170, 0.090), (0.0, 0.020, 0.006)),
        (0.42, (0.070, -0.095, 0.026), (0.0, 0.000, 0.004)),
        (0.60, (0.080, -0.010, 0.036), (-0.004, 0.000, 0.004)),
        (0.80, (0.010, -0.170, 0.200), (0.0, 0.098, 0.0)),
        (1.00, (0.000, -0.200, 0.290), (0.0, 0.108, 0.0)),
    ],
}[args.variant]


def catmull(p0, p1, p2, p3, u):
    u2, u3 = u * u, u * u * u
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)


def path(t, idx):
    ks = KEYS
    t = min(1.0, max(0.0, t))
    i = max(0, min(len(ks) - 2, next((j for j in range(len(ks) - 1) if ks[j][0] <= t <= ks[j + 1][0]), 0)))
    u = (t - ks[i][0]) / (ks[i + 1][0] - ks[i][0])
    P = [Vector(ks[max(0, min(len(ks) - 1, j))][idx]) for j in (i - 1, i, i + 1, i + 2)]
    return catmull(*P, u)


def ease_t(t):
    # the playhead is the scroll itself: linear (the camera path's own end segments give the gentle start and stop)
    return t


trace_mat_front = trace_m.node_tree.nodes["front"].outputs[0]
die_mat_power = die_m.node_tree.nodes["power"].outputs[0]
CORE = Vector((0, 0, 0.005))


def apply(t):
    tt = ease_t(t)
    cam.location = path(tt, 1)
    aim(cam, path(tt, 2))
    cam_d.lens = 40 if args.variant == "wide" else 30
    cam_d.dof.focus_distance = (cam.location - CORE).length
    # power: the die wakes, then the front leaves the legs (r = 27 mm) and runs to the board's edge
    die_mat_power.default_value = smooth(0.04, 0.2, t)
    trace_mat_front.default_value = 0.022 + 0.30 * smooth(0.14, 0.66, t) if t > 0.14 else 0.0
    # the key light: full from the start, the beam a touch stronger at the reveal, then the frame falls dark
    key_d.energy = 12.0 * (1 + 0.25 * smooth(0.6, 0.8, t))
    scene.view_settings.exposure = -4.5 * smooth(0.86, 1.0, t)


# ---------------------------------------------------------------- render settings
scene.render.engine = "CYCLES"
cy = scene.cycles
if args.device != "CPU":
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = args.device
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == args.device
    cy.device = "GPU"
cy.samples = args.samples
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.02
cy.use_denoising = True
for attr, val in (("denoiser", "OPENIMAGEDENOISE"), ("max_bounces", 8), ("diffuse_bounces", 3), ("glossy_bounces", 4),
                  ("transmission_bounces", 6), ("volume_bounces", 1), ("volume_step_rate", 2.0), ("volume_max_steps", 256),
                  ("blur_glossy", 0.5), ("sample_clamp_indirect", 6.0)):
    if hasattr(cy, attr):
        setattr(cy, attr, val)
W, H = (1600, 900) if args.variant == "wide" else (720, 1280)
scene.render.resolution_x = round(W * args.scale)
scene.render.resolution_y = round(H * args.scale)
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_depth = "8"
try:
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Punchy"
except Exception as e:  # noqa: BLE001
    print("look not set:", e)

if args.save:
    apply(0.0)
    bpy.ops.wm.save_as_mainfile(filepath=args.save)

out = Path(args.out).resolve(); out.mkdir(parents=True, exist_ok=True)   # absolute: Blender resolves a relative render path against the drive root, not the cwd
ts = [float(x) for x in args.only.split(",")] if args.only else [i / (args.frames - 1) for i in range(args.first, args.frames)]
names = [f"t{t:.2f}" for t in ts] if args.only else [f"{i:03d}" for i in range(args.first, args.frames)]
times = []
for t, name in zip(ts, names):
    apply(t)
    scene.render.filepath = str(out / f"{args.variant}-{name}.png")
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    times.append(time.time() - t0)
    print(f"FRAME {name} t={t:.3f} {times[-1]:.1f}s", flush=True)
print(f"DONE {len(times)} frames, mean {sum(times) / max(1, len(times)):.1f}s, max {max(times or [0]):.1f}s", flush=True)
