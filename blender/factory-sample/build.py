"""
The factory's visual sample, built in Blender from code: the belt, station 01's base and glass case, and the product's
base, case and screen device. Run (Blender as a Python module, `pip install bpy==5.2.3`, or inside Blender):

    node --experimental-strip-types blender/factory-sample/export-line.mts     # the line's path, from layout.ts
    python3 blender/factory-sample/build.py [--render]

Writes:
    blender/factory-sample/factory-sample.blend     the scene: models, materials, lights, the reference camera
    public/models/factory/sample.glb                 what the site loads (models, UVs, materials, plate textures)
    blender/factory-sample/textures/*.png            the plate's textures (also packed in the GLB)
    blender/factory-sample/reference-render.jpg      with --render: a Cycles render from the reference camera

Units are metres. Blender is Z-up; the GLB is exported Y-up, so three.js's (x, y, z) is Blender's (x, -z, y). A model's
front faces Blender's -Y (three.js's +z): the site turns it to the camera side of the line.

What is geometry and what is texture: shapes that change the silhouette or catch light (rounded edges, the rims, the
glass walls and their thickness, the neon tubes) are geometry; the belt's perforations are a texture (normal,
colour, roughness) — thousands of real holes would cost the browser and add nothing at viewing distance.
"""

import json
import math
import os
import sys

import bpy  # first: it makes Blender's other modules (bmesh, mathutils) importable
import bmesh  # noqa: E402
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
LINE = json.load(open(os.path.join(HERE, "line.json")))
TEX_DIR = os.path.join(HERE, "textures")
GLB = os.path.join(ROOT, "public", "models", "factory", "sample.glb")
BLEND = os.path.join(HERE, "factory-sample.blend")
os.makedirs(TEX_DIR, exist_ok=True)
os.makedirs(os.path.dirname(GLB), exist_ok=True)

# ── dimensions (metres), shared with the site's layout ──────────────────────────────────────────────────────────────
TRACK = LINE["track"]  # width 4.6, top 0.42 (the running surface), rim 0.22
W = TRACK["width"] / 2
TOP = TRACK["top"]
RIM_R = TRACK["rim"]
RIM_RISE = 0.04  # the rims stand this much above the plate
STATION = dict(w=2.75, d=1.95, h=0.5, r=0.55, glass=(2.3, 1.3, 1.45), glass_r=0.2)  # glass: width, depth, height
PRODUCT = dict(w=3.8, d=2.2, h=0.42, r=0.95, glass=(3.3, 1.55, 1.95), glass_r=0.22)
GLASS_WALL = 0.035  # wall thickness: inner and outer faces
SCREEN = dict(w=2.8, h=2.8 * 640 / 1024)  # the product's screen (the site draws the page on it; 1024×640)
NEON_R = 0.014  # the neon tube's radius
NEON_INSET = 0.07  # from the base's outer edge, on its top

# ── colours (linear) — the site's palette, for the Blender scene; the site sets the neon's state colours itself ───────
LIME = (0.49, 1.0, 0.018)  # --brand-lime #baff24
SILVER = (0.58, 0.62, 0.60)  # --brand-text-silver #c9ceca


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def link(obj, coll):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    coll.objects.link(obj)


def to_blender(x, y, z):
    """three.js (y up) → Blender (z up)"""
    return (x, -z, y)


# ── materials ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def principled(name, base, rough, metal, coat=0.0, coat_rough=0.1, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*base, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Coat Roughness"].default_value = coat_rough
    p.inputs["Specular IOR Level"].default_value = spec
    return m


def glass_material():
    # clear glass: full transmission, opaque alpha (alpha < 1 would also fade the reflections — see the review notes)
    m = principled("Glass", (1, 1, 1), 0.02, 0.0, spec=0.5)
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Transmission Weight"].default_value = 1.0
    p.inputs["IOR"].default_value = 1.5
    return m


def neon_material(name, strength=6.0):
    m = principled(name, (0.02, 0.03, 0.01), 0.4, 0.0)
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Emission Color"].default_value = (*LIME, 1)
    p.inputs["Emission Strength"].default_value = strength
    return m


def image(name, arr, non_color):
    """a float RGB(A) array (h, w, 3|4), 0..1 → a Blender image saved as PNG next to this script"""
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), np.float32)], axis=2)
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    # Blender's pixel rows run bottom-up
    img.pixels.foreach_set(np.flipud(arr).astype(np.float32).ravel())
    img.filepath_raw = os.path.join(TEX_DIR, name + ".png")
    img.file_format = "PNG"
    img.save()
    return img


def plate_textures(px=512, holes=16):
    """
    The belt's perforated steel plate, one 0.9 m tile: staggered round holes with a soft chamfer. Returns the colour,
    normal and ORM (occlusion, roughness, metalness) maps. Tileable: the holes repeat across the tile's edges.
    """
    pitch = px / holes
    y, x = np.mgrid[0:px, 0:px].astype(np.float32) + 0.5
    row = np.floor(y / pitch)
    xo = x - (row % 2) * pitch / 2  # every other row shifted half a pitch
    cx = (np.floor(xo / pitch) + 0.5) * pitch + (row % 2) * pitch / 2
    cy = (row + 0.5) * pitch
    dx = (x - cx + px / 2) % px - px / 2
    dy = (y - cy + px / 2) % px - px / 2
    d = np.sqrt(dx * dx + dy * dy)
    r_hole, chamfer = pitch * 0.27, pitch * 0.09
    height = np.clip((d - r_hole) / chamfer, 0, 1)  # 0 in the hole, 1 on the plate
    height = height * height * (3 - 2 * height)
    # fine brushing along the line (u), a little variation
    rng = np.random.default_rng(7)
    brush = np.repeat(rng.normal(0, 1, (px, 1)).astype(np.float32), px, axis=1)
    brush = np.roll(brush, 0, axis=0)
    # normal from the height's slopes (wrapping, so the tile stays seamless)
    k = 2.2
    gx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * k
    gy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * k
    n = np.stack([-gx, gy, np.ones_like(gx)], axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    normal = n * 0.5 + 0.5
    # colour: dark steel, the holes black (values are sRGB: a byte image's pixels are stored as they are)
    steel = 0.42 + 0.03 * brush
    col = np.clip(steel * (0.15 + 0.85 * height), 0, 1)
    color = np.stack([col, col * 1.02, col * 1.0], axis=2)
    # ORM: occlusion darker in the holes, rough holes, metal plate
    occ = 0.35 + 0.65 * height
    rough = 0.42 + 0.06 * brush * 0.2 + (1 - height) * 0.45
    metal = 0.25 * height  # mostly diffuse: lit by the key light, not a mirror of the dark
    orm = np.stack([occ, np.clip(rough, 0, 1), metal], axis=2)
    return (
        image("plate_color", color, False),
        image("plate_normal", normal, True),
        image("plate_orm", orm, True),
    )


def plate_material():
    color, normal, orm = plate_textures()
    m = bpy.data.materials.new("BeltPlate")
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexImage")
    tc.image = color
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = normal
    to = nt.nodes.new("ShaderNodeTexImage")
    to.image = orm
    nm = nt.nodes.new("ShaderNodeNormalMap")
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(tc.outputs["Color"], p.inputs["Base Color"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], p.inputs["Normal"])
    nt.links.new(to.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], p.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], p.inputs["Metallic"])
    return m


# ── shapes ────────────────────────────────────────────────────────────────────────────────────────────────────────────
def rounded_rect(w, d, r, seg=10):
    """the outline of a w × d rectangle with corners of radius r, counter-clockwise, centred on the origin"""
    pts = []
    for cx, cy, a0 in ((w / 2 - r, -d / 2 + r, -90), (w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def mesh_object(name, bm, material, smooth_angle=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(material)
    if smooth_angle is not None:
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_angle))
        o.select_set(False)
    return o


def apply_modifiers(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def slab(name, w, d, h, r, material, bevel=0.04):
    """a base: a rounded rectangle extruded to h, its top and bottom edges rounded"""
    bm = bmesh.new()
    verts = [bm.verts.new((x, y, 0)) for x, y in rounded_rect(w, d, r, 14)]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    top = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top, vec=(0, 0, h))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_object(name, bm, material)
    b = o.modifiers.new("edges", "BEVEL")
    b.width, b.segments, b.limit_method, b.angle_limit = bevel, 5, "ANGLE", math.radians(50)
    b.harden_normals = False
    apply_modifiers(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    o.select_set(False)
    return o


def neon_loop(name, w, d, r, z, material, inset=NEON_INSET):
    """a neon tube along a base's top, following its rounded outline"""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = NEON_R
    cu.bevel_resolution = 3
    sp = cu.splines.new("POLY")
    pts = rounded_rect(w - 2 * inset, d - 2 * inset, max(0.05, r - inset), 16)
    sp.points.add(len(pts) - 1)
    for p, (x, y) in zip(sp.points, pts):
        p.co = (x, y, z, 1)
    sp.use_cyclic_u = True
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    cu.materials.append(material)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.shade_smooth()
    o.select_set(False)
    return o


def glass_case(name, w, d, h, r, material):
    """a hollow glass case: rounded outer walls and inner walls GLASS_WALL inside them"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    o = mesh_object(name, bm, material)
    b = o.modifiers.new("round", "BEVEL")
    b.width, b.segments, b.limit_method = r, 10, "NONE"
    s = o.modifiers.new("wall", "SOLIDIFY")
    s.thickness, s.offset, s.use_even_offset = GLASS_WALL, -1.0, True
    apply_modifiers(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.shade_smooth()
    o.select_set(False)
    return o


def device(name, w, h, t, material):
    """the product's screen device: a thin slab with rounded corners and rounded edges, standing upright"""
    bm = bmesh.new()
    verts = [bm.verts.new((x, 0, z)) for x, z in rounded_rect(w, h, 0.07, 8)]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    back = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=back, vec=(0, t, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_object(name, bm, material)
    b = o.modifiers.new("edges", "BEVEL")
    b.width, b.segments, b.limit_method, b.angle_limit = 0.012, 3, "ANGLE", math.radians(50)
    apply_modifiers(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    o.select_set(False)
    return o


def screen_plane(name, w, h, material):
    """the screen's face: a plane with UVs 0..1 (the site draws the approved page on it)"""
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    vs = [bm.verts.new(p) for p in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    f = bm.faces.new(vs)
    for loop, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = (u, v)
    f.normal_update()
    if f.normal.y > 0:  # face the front (-Y)
        f.normal_flip()
    return mesh_object(name, bm, material)


# ── the belt ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def belt_profile():
    """
    The belt's cross-section, as strips (each its own vertex rows, so the edges between strips stay crisp), from the
    near outer foot to the far one. a: across (+ the camera side), z: up.
    """
    rim_top = TOP + RIM_RISE
    cy = rim_top - RIM_R
    def quarter(side):
        cx = side * (W - RIM_R)
        pts = [(cx + side * RIM_R * math.cos(math.radians(a)), cy + RIM_R * math.sin(math.radians(a))) for a in range(0, 91, 10)]
        return pts if side > 0 else pts[::-1]
    inner = W - RIM_R
    lip = 0.05
    return [
        # (name, points, material key, u-tile)
        ("near_face", [(W, 0.0), (W, cy)], "rim"),
        ("near_round", quarter(1), "rim"),
        ("near_top", [(inner, rim_top), (inner - lip, rim_top)], "rim"),
        ("near_lip", [(inner - lip, rim_top), (inner - lip - 0.04, TOP)], "rim"),
        ("plate", [(inner - lip - 0.04, TOP), (-(inner - lip - 0.04), TOP)], "plate"),
        ("far_lip", [(-(inner - lip - 0.04), TOP), (-(inner - lip), rim_top)], "rim"),
        ("far_top", [(-(inner - lip), rim_top), (-inner, rim_top)], "rim"),
        ("far_round", quarter(-1), "rim"),
        ("far_face", [(-W, cy), (-W, 0.0)], "rim"),
    ]


def belt(materials):
    samples = LINE["samples"]
    objs = []
    by_mat = {}
    for name, prof, key in belt_profile():
        by_mat.setdefault(key, []).append(prof)

    def build(name, profiles, material, plate_uv=False):
        bm = bmesh.new()
        uv = bm.loops.layers.uv.new("UVMap")
        for prof in profiles:
            rows = []
            # v along the section, in metres
            acc = [0.0]
            for i in range(1, len(prof)):
                acc.append(acc[-1] + math.dist(prof[i - 1], prof[i]))
            for s in samples:
                rows.append([bm.verts.new(to_blender(s["x"] + s["nx"] * a, z, s["z"] + s["nz"] * a)) for a, z in prof])
            for i in range(len(samples) - 1):
                for j in range(len(prof) - 1):
                    f = bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
                    for loop in f.loops:
                        ii = i if loop.vert in (rows[i][j], rows[i][j + 1]) else i + 1
                        jj = j if loop.vert in (rows[i][j], rows[i + 1][j]) else j + 1
                        s_m = samples[ii]["s"]
                        if plate_uv:
                            loop[uv].uv = (s_m / 0.9, prof[jj][0] / 0.9)
                        else:
                            loop[uv].uv = (s_m / 2.0, acc[jj] / 2.0)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        o = mesh_object(name, bm, material)
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.shade_smooth()
        o.select_set(False)
        return o

    objs.append(build("Belt_Plate", by_mat["plate"], materials["plate"], plate_uv=True))
    objs.append(build("Belt_Rim", by_mat["rim"], materials["rim"]))
    # end caps: the section's outline, closed, at both ends of the line
    outline = [p for _, prof, _ in belt_profile() for p in prof]
    bm = bmesh.new()
    for s in (samples[0], samples[-1]):
        # the outline's points in order, without repeats where strips meet
        bm2_pts = []
        for a, z in outline:
            if not bm2_pts or math.dist(bm2_pts[-1], (a, z)) > 1e-5:
                bm2_pts.append((a, z))
        vs = [bm.verts.new(to_blender(s["x"] + s["nx"] * a, z, s["z"] + s["nz"] * a)) for a, z in bm2_pts]
        bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    objs.append(mesh_object("Belt_Caps", bm, materials["rim"]))
    # the neon lines along the outer faces, just under the rounded rim (near brighter: the site sets their light)
    for side, nm in ((1, "Belt_NeonNear"), (-1, "Belt_NeonFar")):
        a = side * (W + 0.006)
        # a band 6 cm high on the outer face, under the rounded rim (the reference's line is broad and bright)
        prof = [(a, TOP + RIM_RISE - RIM_R - 0.05), (a, TOP + RIM_RISE - RIM_R + 0.01)]
        if side < 0:
            prof = prof[::-1]
        objs.append(build(nm, [prof], materials["neon_" + ("near" if side > 0 else "far")]))
    return objs


# ── the scene ─────────────────────────────────────────────────────────────────────────────────────────────────────────
def place(obj, at):
    obj.location = to_blender(at["x"], at["y"], at["z"])
    obj.rotation_euler = (0, 0, at["yaw"])


def build_scene():
    reset()
    mats = {
        "plate": plate_material(),
        "rim": principled("BeltRim", (0.006, 0.007, 0.007), 0.2, 0.5, coat=1.0, coat_rough=0.08),
        "base": principled("BaseDark", (0.055, 0.058, 0.057), 0.3, 0.15, coat=1.0, coat_rough=0.1),
        "glass": glass_material(),
        "neon": neon_material("Neon"),
        "neon_near": neon_material("NeonNear", 8),
        "neon_far": neon_material("NeonFar", 5),
        "device": principled("Device", (0.01, 0.011, 0.011), 0.25, 0.6, coat=1.0, coat_rough=0.05),
        "screen": principled("Screen", (0.02, 0.03, 0.02), 0.3, 0.0),
    }

    belt_c = collection("Belt")
    for o in belt(mats):
        link(o, belt_c)

    # station 01: the base, the neon round its top, the glass case on it (origin: the base's foot, on the belt)
    st = STATION
    st_c = collection("Station01")
    st_root = bpy.data.objects.new("Station01", None)
    st_c.objects.link(st_root)
    parts = [
        slab("Station01_Base", st["w"], st["d"], st["h"], st["r"], mats["base"]),
        neon_loop("Station01_Neon", st["w"], st["d"], st["r"], st["h"] + 0.004, mats["neon"]),
        glass_case("Station01_Glass", *st["glass"], st["glass_r"], mats["glass"]),
    ]
    parts[2].location.z = st["h"] + st["glass"][2] / 2 + 0.01
    for p in parts:
        link(p, st_c)
        p.parent = st_root
    place(st_root, LINE["station01"])

    # the product: its base, the neon, the large case, and the screen device inside (origin: the base's foot)
    pr = PRODUCT
    pr_c = collection("Product")
    pr_root = bpy.data.objects.new("Product", None)
    pr_c.objects.link(pr_root)
    gw, gd, gh = pr["glass"]
    centre_z = pr["h"] + gh / 2 + 0.01
    dev = device("Product_Device", SCREEN["w"] + 0.08, SCREEN["h"] + 0.08, 0.05, mats["device"])
    scr = screen_plane("Product_Screen", SCREEN["w"], SCREEN["h"], mats["screen"])
    for o in (dev, scr):
        # a little behind the case's middle, leaning back slightly (as on the site before)
        o.rotation_euler = (math.radians(-2.3), 0, 0)
    dev.location = (0, 0.12 - 0.025, centre_z)
    scr.location = (0, 0.12 - 0.025 - 0.002, centre_z)
    parts = [
        slab("Product_Base", pr["w"], pr["d"], pr["h"], pr["r"], mats["base"]),
        neon_loop("Product_Neon", pr["w"], pr["d"], pr["r"], pr["h"] + 0.004, mats["neon"]),
        glass_case("Product_Glass", gw, gd, gh, pr["glass_r"], mats["glass"]),
        dev,
        scr,
    ]
    parts[2].location.z = centre_z
    for p in parts:
        link(p, pr_c)
        p.parent = pr_root
    place(pr_root, LINE["productEntry"])
    return mats


def stage(mats):
    """for the .blend only (not exported): the floor, the world, lights and the reference camera"""
    stage_c = collection("Stage (not exported)")
    bpy.ops.mesh.primitive_plane_add(size=80)
    floor = bpy.context.active_object
    floor.name = "Floor"
    floor.data.materials.append(principled("Floor", (0.008, 0.009, 0.009), 0.18, 0.3, coat=0.6, coat_rough=0.15))
    link(floor, stage_c)
    world = bpy.data.worlds.new("Dark factory")
    bpy.context.scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.0015, 0.002, 0.0018, 1)
    # key light (front left, high), a soft fill, and a warm lamp far behind — as on the site
    for name, loc, energy, size, color in (
        ("Key", to_blender(-10, 14, 12), 9000, 8, (1, 1, 1)),
        ("Fill", to_blender(4, 6, 10), 900, 10, SILVER),
        ("Warm", to_blender(2, 6.2, -16), 1500, 1, (1, 0.8, 0.45)),
    ):
        bpy.ops.object.light_add(type="AREA", location=loc)
        l = bpy.context.active_object
        l.name = name
        l.data.energy, l.data.size, l.data.color = energy, size, color
        tgt = to_blender(-8, 0.5, 4)
        d = (tgt[0] - loc[0], tgt[1] - loc[1], tgt[2] - loc[2])
        l.rotation_euler = _look(d)
        link(l, stage_c)
    cam = LINE["camera"]
    bpy.ops.object.camera_add(location=to_blender(*cam["pos"]))
    c = bpy.context.active_object
    c.name = "ReferenceCamera"
    c.data.sensor_fit = "VERTICAL"
    c.data.angle = math.radians(cam["fovVertical"])
    t = to_blender(*cam["target"])
    c.rotation_euler = _look((t[0] - c.location.x, t[1] - c.location.y, t[2] - c.location.z))
    link(c, stage_c)
    sc = bpy.context.scene
    sc.camera = c
    sc.render.resolution_x, sc.render.resolution_y = 1672, 941
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 32
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = "AgX"
    # the glass's lit edges in the render: bloom-like glare comes from the compositor in Blender; left out here
    return c


def _look(d):
    from mathutils import Vector
    return Vector(d).to_track_quat("-Z", "Y").to_euler()


def export():
    # only the belt, the station and the product: hide the stage while exporting
    for o in bpy.data.objects:
        o.select_set(o.users_collection[0].name in ("Belt", "Station01", "Product"))
    bpy.ops.export_scene.gltf(
        filepath=GLB,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_lights=False,
        export_cameras=False,
        export_image_format="AUTO",
        export_texcoords=True,
        export_normals=True,
    )


if __name__ == "__main__":
    mats = build_scene()
    stage(mats)
    export()
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
    if "--render" in sys.argv:
        sc = bpy.context.scene
        sc.render.image_settings.file_format = "JPEG"
        sc.render.image_settings.quality = 88
        sc.render.filepath = os.path.join(HERE, "reference-render.jpg")
        bpy.ops.render.render(write_still=True)
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.users_collection[0].name != "Stage (not exported)"]
    print("exported:", os.path.relpath(GLB, ROOT), f"{os.path.getsize(GLB) / 1024:.0f} KB")
    for o in meshes:
        print(f"  {o.name:18s} {len(o.data.vertices):6d} verts {len(o.data.polygons):6d} faces")
