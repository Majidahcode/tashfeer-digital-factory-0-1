"""
Tashfeer's 3D character, prepared for the browser from the owner's Meshy model (never modified: read from MESHY).

  python3 blender/tashfeer/build.py <meshy.glb> [--ratio 0.08]

1. decimate the 1M-triangle scan to a browser size (face, visor stripes and fingers are mostly in the textures);
2. a skeleton placed on the measured body (A-pose, faces −Y in Blender): hips, spine, chest, neck, head; clavicle,
   upper arm, forearm, hand; thigh, shin, foot, toes — no finger bones (the fingers are one sculpted piece);
3. rigid skinning, as a robot's plates are: every vertex follows the nearest bone, blended only in a thin band (≈1 cm)
   where two bones meet, so plates never stretch like rubber;
4. the name «تشفير» on the chest as a thin decal that follows the chest bone (the model has none; the old image had it);
5. textures down to web sizes, an emissive map from the orange lines of the colour map (they glow in the browser);
6. writes public/models/tashfeer/tashfeer.glb, blender/tashfeer/tashfeer.blend and pose test renders.
"""
import bpy  # noqa: F401  (must come before bmesh / mathutils)
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
MESHY = args[0]
RATIO = float(args[args.index("--ratio") + 1]) if "--ratio" in args else 0.08
OUT_GLB = os.path.join(ROOT, "public/models/tashfeer/tashfeer.glb")
OUT_BLEND = os.path.join(ROOT, "blender/tashfeer/tashfeer.blend")
NAME_PNG = os.path.join(ROOT, "blender/tashfeer/name.png")
WORK = os.path.join(ROOT, "blender/tashfeer/.work")
os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
os.makedirs(WORK, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=MESHY)
body = [o for o in bpy.data.objects if o.type == "MESH"][0]
body.name = "Tashfeer"
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ── 1. decimate ────────────────────────────────────────────────────────────────────────────────────────────────
dec = body.modifiers.new("dec", "DECIMATE")
dec.ratio = RATIO
dec.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier="dec")
print("triangles after decimate:", len(body.data.polygons))
# the scan's normal map was baked for its million triangles: on the lighter mesh it draws facets. Smooth normals
# instead (the plates' edges are in the colour map), and the normal map is left out
bpy.ops.object.shade_smooth()

# ── 2. skeleton (Blender coordinates: x = the character's left, −y = front, z = up; metres) ────────────────────
J = {
    "hips": (0, 0.03, -0.05), "spine": (0, 0.03, 0.12), "chest": (0, 0.04, 0.33), "neck": (0, 0.04, 0.63),
    "head": (0, 0.03, 0.72), "head_end": (0, 0.03, 0.95),
}
SIDE = {
    "clavicle": (0.06, 0.05, 0.58), "shoulder": (0.25, 0.07, 0.50), "elbow": (0.36, 0.06, 0.27),
    "wrist": (0.475, -0.04, 0.10), "hand_end": (0.53, -0.095, -0.075),
    "hip": (0.11, 0.03, -0.08), "knee": (0.155, 0.03, -0.33), "ankle": (0.205, 0.06, -0.79),
    "ball": (0.215, -0.10, -0.92), "toe": (0.22, -0.20, -0.93),
}
arm_data = bpy.data.armatures.new("TashfeerRig")
rig = bpy.data.objects.new("TashfeerRig", arm_data)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones


def bone(name, head, tail, parent=None, roll_up=Vector((0, -1, 0))):
    b = eb.new(name)
    b.head = Vector(head)
    b.tail = Vector(tail)
    if parent:
        b.parent = eb[parent]
    b.align_roll(roll_up)
    return b


bone("hips", J["hips"], J["spine"])
bone("spine", J["spine"], J["chest"], "hips")
bone("chest", J["chest"], J["neck"], "spine")
bone("neck", J["neck"], J["head"], "chest")
bone("head", J["head"], J["head_end"], "neck")
for s, sx in (("L", 1), ("R", -1)):
    P = {k: (v[0] * sx, v[1], v[2]) for k, v in SIDE.items()}
    bone(f"clavicle_{s}", P["clavicle"], P["shoulder"], "chest", Vector((0, 0, 1)))
    bone(f"upper_arm_{s}", P["shoulder"], P["elbow"], f"clavicle_{s}")
    bone(f"forearm_{s}", P["elbow"], P["wrist"], f"upper_arm_{s}")
    bone(f"hand_{s}", P["wrist"], P["hand_end"], f"forearm_{s}")
    bone(f"thigh_{s}", P["hip"], P["knee"], "hips")
    bone(f"shin_{s}", P["knee"], P["ankle"], f"thigh_{s}")
    bone(f"foot_{s}", P["ankle"], P["ball"], f"shin_{s}", Vector((0, 0, 1)))
    bone(f"toes_{s}", P["ball"], P["toe"], f"foot_{s}", Vector((0, 0, 1)))
segs = {b.name: (b.head.copy(), b.tail.copy()) for b in eb}
bpy.ops.object.mode_set(mode="OBJECT")

# ── 3. rigid skinning ──────────────────────────────────────────────────────────────────────────────────────────
n = len(body.data.vertices)
co = np.empty(n * 3)
body.data.vertices.foreach_get("co", co)
co = co.reshape(-1, 3)
names = list(segs)


def seg_dist(p, a, b):
    a = np.array(a)
    b = np.array(b)
    ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)


D = np.stack([seg_dist(co, *segs[nm]) for nm in names], axis=1)
x, y, z = co.T
side = np.where(x >= 0, "L", "R")
# gates: a bone may take only vertices of its own region (arms beside the torso, legs below the pelvis, the head
# above the neck) — otherwise a hand would grab a thigh, or the chest an upper arm
BIG = 9.0
for k, nm in enumerate(names):
    base, _, s = nm.rpartition("_") if nm.endswith(("_L", "_R")) else (nm, "", "")
    gate = np.ones(n, bool)
    if s:
        gate &= side == s
    if base in ("upper_arm", "forearm", "hand"):
        gate &= (np.abs(x) > 0.20) & (z > -0.15)
    if base == "clavicle":
        gate &= (z > 0.40) & (np.abs(x) > 0.04)
    if base in ("thigh", "shin", "foot", "toes"):
        gate &= (z < -0.02) & (np.abs(x) < 0.36)
    if base == "head":
        gate &= z > 0.66
    if base == "neck":
        gate &= (z > 0.58) & (np.abs(x) < 0.15)
    if base in ("hips", "spine", "chest"):
        gate &= np.abs(x) < 0.30
    D[~gate, k] = BIG
SIGMA = 0.008  # the blend band: only where two bones are within ~1 cm of the same distance
order = np.argsort(D, axis=1)
d0 = D[np.arange(n), order[:, 0]]
d1 = D[np.arange(n), order[:, 1]]
w1 = np.exp(-(d1 - d0) / SIGMA)
w0 = 1 / (1 + w1)
w1 = w1 / (1 + w1)
groups = {nm: body.vertex_groups.new(name=nm) for nm in names}
for i in range(n):
    groups[names[order[i, 0]]].add([i], float(w0[i]), "REPLACE")
    if w1[i] > 0.02:
        groups[names[order[i, 1]]].add([i], float(w1[i]), "REPLACE")
body.parent = rig
mod = body.modifiers.new("rig", "ARMATURE")
mod.object = rig
print("skinned", n, "vertices; blended", int((w1 > 0.02).sum()))

# ── 4. the name on the chest ───────────────────────────────────────────────────────────────────────────────────
if os.path.exists(NAME_PNG):
    W, H = 0.22, 0.077  # metres on the chest
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=24, y_subdivisions=10, size=1)
    decal = bpy.context.active_object
    decal.name = "TashfeerName"
    decal.scale = (W, H, 1)
    decal.rotation_euler = (math.radians(90), 0, 0)  # faces −Y (the front)
    decal.location = (0, -0.30, 0.47)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    sw = decal.modifiers.new("onto", "SHRINKWRAP")
    sw.target = body
    sw.wrap_method = "PROJECT"
    sw.use_project_y = True
    sw.use_negative_direction = True
    sw.use_positive_direction = True
    sw.offset = 0.004
    bpy.context.view_layer.objects.active = decal
    bpy.ops.object.modifier_apply(modifier="onto")
    img = bpy.data.images.load(NAME_PNG)
    m = bpy.data.materials.new("TashfeerNameMat")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.6
    bsdf.inputs["Roughness"].default_value = 0.5
    m.blend_method = "BLEND" if hasattr(m, "blend_method") else m.blend_method
    decal.data.materials.append(m)
    vg = decal.vertex_groups.new(name="chest")
    vg.add(list(range(len(decal.data.vertices))), 1.0, "REPLACE")
    decal.parent = rig
    dm = decal.modifiers.new("rig", "ARMATURE")
    dm.object = rig

# ── 5. textures for the web, and the glow of the orange lines ─────────────────────────────────────────────────
mat = body.material_slots[0].material
nt = mat.node_tree
bsdf = [nd for nd in nt.nodes if nd.type == "BSDF_PRINCIPLED"][0]
base_img = None
for nd in list(nt.nodes):
    if nd.type == "NORMAL_MAP":
        nt.nodes.remove(nd)
        continue
for nd in list(nt.nodes):
    if nd.type != "TEX_IMAGE" or not nd.image:
        continue
    if not nd.outputs[0].links:
        nt.nodes.remove(nd)  # the normal map's texture, now unused
        continue
    im = nd.image
    target = 2048 if im.size[0] >= 4096 else 1024
    if im.size[0] > target:
        im.scale(target, target)
    im.file_format = "JPEG"
    links = [l.to_socket.name for l in nd.outputs[0].links]
    if "Base Color" in links:
        base_img = im
if base_img is not None:
    w, h = base_img.size
    px = np.array(base_img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    orange = (r > 0.35) & (r > g * 1.25) & (g > b * 1.4)
    em = np.zeros_like(px)
    em[..., 3] = 1
    em[orange, 0:3] = px[orange, 0:3] * 1.0
    emi = bpy.data.images.new("Tashfeer_emissive", w, h)
    emi.pixels = em.ravel()
    emi.filepath_raw = os.path.join(WORK, "emissive.png")
    emi.file_format = "PNG"
    emi.save()
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = emi
    nt.links.new(t.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
    print("orange texels:", int(orange.sum()))

# ── 6. write ───────────────────────────────────────────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format="GLB",
    use_selection=True,
    export_skins=True,
    export_animations=False,
    export_image_format="JPEG",
    export_jpeg_quality=86,
    export_apply=False,
    export_yup=True,
)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
print("wrote", OUT_GLB, os.path.getsize(OUT_GLB) // 1024, "KB")
