# Spike: export beat 1 chip to GLB (Draco) + dump camera/lights to JSON.
# blender -b widem_chip.blend --python export_glb.py -- OUT_DIR
import bpy, json, sys, math, os
out = sys.argv[sys.argv.index("--") + 1]
os.makedirs(out, exist_ok=True)
scn = bpy.context.scene
info = {"objects": [], "lights": [], "camera": None, "world": None}
for ob in scn.objects:
    if ob.hide_render: continue
    e = {"name": ob.name, "type": ob.type, "loc": list(ob.matrix_world.translation),
         "rot": [math.degrees(a) for a in ob.matrix_world.to_euler()]}
    if ob.type == "LIGHT":
        L = ob.data
        e.update(kind=L.type, energy=L.energy, color=list(L.color),
                 spot_size=math.degrees(getattr(L, "spot_size", 0)), blend=getattr(L, "spot_blend", 0),
                 size=getattr(L, "size", getattr(L, "shadow_soft_size", 0)))
        info["lights"].append(e)
    elif ob.type == "CAMERA":
        c = ob.data
        e.update(lens=c.lens, sensor=c.sensor_width, fov_deg=math.degrees(c.angle_x), fov_y=math.degrees(c.angle_y))
        info["camera"] = e
    else:
        e["mats"] = [s.material.name for s in getattr(ob, "material_slots", []) if s.material]
        e["dims"] = list(ob.dimensions)
        info["objects"].append(e)
info["render"] = [scn.render.resolution_x, scn.render.resolution_y, scn.render.engine]
info["view_transform"] = scn.view_settings.view_transform + " / " + scn.view_settings.look
w = scn.world
if w and w.use_nodes:
    bg = w.node_tree.nodes.get("Background")
    if bg: info["world"] = [list(bg.inputs[0].default_value), bg.inputs[1].default_value]
json.dump(info, open(os.path.join(out, "scene-info.json"), "w"), indent=1)
bpy.ops.export_scene.gltf(filepath=os.path.join(out, "chip.glb"), export_format="GLB",
    use_visible=True, export_apply=True, export_cameras=True, export_lights=True,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
    export_draco_position_quantization=14, export_draco_normal_quantization=10,
    export_image_format="WEBP" if hasattr(bpy.types, "Image") else "AUTO")
print("EXPORTED", os.path.getsize(os.path.join(out, "chip.glb")))
