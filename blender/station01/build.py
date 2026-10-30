"""
Station 01 alone, rebuilt to the reference image's proportions, for the review page (/factory/station-01). The factory
itself still uses blender/factory-sample (not touched by this script).

    python3 blender/station01/build.py [--render]

Writes:
    blender/station01/station01.blend            the station, a studio (floor, soft lights), the review camera
    public/models/factory/station01.glb           what the review page loads
    blender/station01/render.jpg                  with --render: Cycles, from the review camera (for reference only)

Read from the reference (station 01, "01 —"), relative to the base's width:
    the glass case: ~0.72 of the base's width, ~0.72 as tall as it is wide, shallow (a display case, not a box);
                    corners only slightly rounded; all its edges catch light
    the base:       about half the glass's height; strongly rounded ends; a raised lip round its top; a neon line
                    round the glass's foot; a short neon dash on the front; its number on the front
    the work:       a lit line drawing standing in the middle of the case's depth, crisp; thin interface lists at the
                    sides, further back

Blender is Z-up; the GLB is Y-up (three.js (x, y, z) = Blender (x, -z, y)); the front faces Blender's -Y.
"""

import math
import os
import sys

import bpy  # first: it makes bmesh and mathutils importable
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
GLB = os.path.join(ROOT, "public", "models", "factory", "station01.glb")
BLEND = os.path.join(HERE, "station01.blend")

# ── sizes (metres) ─────────────────────────────────────────────────────────────────────────────────────────────────
BASE = dict(w=2.75, d=1.45, h=0.62, r=0.55, edge=0.06)  # plan corner radius r; edge: the rounding of its top and foot
LIP = dict(inset=0.03, width=0.10, h=0.025)  # the raised lip round the base's top
GLASS = dict(w=2.0, h=1.42, d=0.70, r=0.10, edge=0.012, wall=0.028)  # r: the front outline's corners; edge: the small
# bevel along its edges (sharp edges catch the light as thin lines, as in the reference); wall: thickness
NEON_R = 0.012
WORK = dict(cell=0.23, n=2, tube=0.014, turn=15)  # the lattice inside: 2×2×2 cells of 23 cm, 14 mm tubes, turned 15°
PANEL = dict(w=0.46, h=0.66, x=0.70, back=0.12, turn=12)  # the interface lists: size, sideways, behind the middle

LIME = (0.49, 1.0, 0.018)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def principled(name, base, rough, metal, coat=0.0, coat_rough=0.1):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*base, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Coat Roughness"].default_value = coat_rough
    return m


def emissive(name, color, strength):
    m = principled(name, (0.02, 0.02, 0.02), 0.5, 0.0)
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Emission Color"].default_value = (*color, 1)
    p.inputs["Emission Strength"].default_value = strength
    return m


def glass_material():
    m = principled("Glass", (1, 1, 1), 0.02, 0.0)
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Transmission Weight"].default_value = 1.0
    p.inputs["IOR"].default_value = 1.5
    return m


def link_new(o):
    bpy.context.scene.collection.objects.link(o)
    return o


def mesh_from(name, bm, material):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = link_new(bpy.data.objects.new(name, me))
    me.materials.append(material)
    return o


def select_only(o):
    for x in bpy.context.selected_objects:
        x.select_set(False)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)


def apply_all(o):
    select_only(o)
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def smooth(o, angle=None):
    select_only(o)
    if angle is None:
        bpy.ops.object.shade_smooth()
    else:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    o.select_set(False)


def rounded_rect(w, d, r, seg=16):
    pts = []
    for cx, cy, a0 in ((w / 2 - r, -d / 2 + r, -90), (w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def prism(name, outline, z0, z1, material, bevel=0.0, hole=None):
    """an outline (and an optional hole) extruded from z0 to z1, its top and foot edges rounded by `bevel`"""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z0)) for x, y in outline]
    if hole:
        # a ring: bridge the outline and the hole (both loops have the same count) — faces between them
        hs = [bm.verts.new((x, y, z0)) for x, y in hole]
        n = len(vs)
        for i in range(n):
            bm.faces.new((vs[i], vs[(i + 1) % n], hs[(i + 1) % n], hs[i]))
        geom = bm.faces[:]
    else:
        geom = [bm.faces.new(vs)]
    ext = bmesh.ops.extrude_face_region(bm, geom=geom)
    top = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top, vec=(0, 0, z1 - z0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_from(name, bm, material)
    if bevel:
        b = o.modifiers.new("edges", "BEVEL")
        b.width, b.segments, b.limit_method, b.angle_limit = bevel, 6, "ANGLE", math.radians(50)
        apply_all(o)
    smooth(o, 40)
    return o


def rounded_box(name, w, d, h, r, material, flip=False, seg=10):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, d, h), verts=bm.verts)
    o = mesh_from(name, bm, material)
    b = o.modifiers.new("round", "BEVEL")
    b.width, b.segments, b.limit_method = r, seg, "NONE"
    apply_all(o)
    if flip:
        select_only(o)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.flip_normals()
        bpy.ops.object.mode_set(mode="OBJECT")
    smooth(o)
    return o


def glass_shell(name, w, h, d, r, edge, material, flip=False):
    """
    A glass shell as in the reference: the front outline a rectangle with rounded corners, extruded in depth, its edges
    only slightly bevelled (a uniformly rounded box spreads the light into broad bands instead of thin edge lines).
    """
    o = prism(name, rounded_rect(w, h, r, 14), -d / 2, d / 2, material, bevel=edge)
    # built lying (outline in XY, depth along Z): stand it up — the outline in XZ, the depth along Y
    o.rotation_euler = (math.radians(90), 0, 0)
    select_only(o)
    bpy.ops.object.transform_apply(rotation=True)
    if flip:
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.flip_normals()
        bpy.ops.object.mode_set(mode="OBJECT")
    smooth(o, 35)
    return o


def tube_loop(name, pts, z, radius, material):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for p, (x, y) in zip(sp.points, pts):
        p.co = (x, y, z, 1)
    sp.use_cyclic_u = True
    o = link_new(bpy.data.objects.new(name, cu))
    cu.materials.append(material)
    select_only(o)
    bpy.ops.object.convert(target="MESH")
    smooth(o)
    return o


def capsule(name, length, radius, material):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=radius)
    for v in bm.verts:
        v.co.x += (length / 2 - radius) * (1 if v.co.x > 0 else -1)
    o = mesh_from(name, bm, material)
    smooth(o)
    return o


def lattice(name, material):
    """the work in the case: a 2×2×2 block structure drawn with tubes (a real 3D line drawing, crisp at any size)"""
    c, n, t = WORK["cell"], WORK["n"], WORK["tube"]
    half = c * n / 2
    bm = bmesh.new()
    ticks = [-half + i * c for i in range(n + 1)]
    for a in ticks:
        for b in ticks:
            for axis in range(3):
                p0 = [0, 0, 0]
                p1 = [0, 0, 0]
                others = [i for i in range(3) if i != axis]
                p0[others[0]] = p1[others[0]] = a
                p0[others[1]] = p1[others[1]] = b
                p0[axis], p1[axis] = -half, half
                bmesh.ops.create_cone(
                    bm,
                    cap_ends=True,
                    segments=8,
                    radius1=t,
                    radius2=t,
                    depth=c * n + t * 2,
                    matrix=_segment_matrix(Vector(p0), Vector(p1)),
                )
    o = mesh_from(name, bm, material)
    smooth(o, 50)
    return o


def _segment_matrix(a, b):
    from mathutils import Matrix

    mid = (a + b) / 2
    d = (b - a).normalized()
    rot = Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
    return Matrix.Translation(mid) @ rot


def panel(name, w, h, material):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    vs = [bm.verts.new(p) for p in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    f = bm.faces.new(vs)
    for loop, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = (u, v)
    return mesh_from(name, bm, material)


def build():
    reset()
    mats = {
        "base": principled("BaseBlack", (0.012, 0.013, 0.013), 0.22, 0.2, coat=1.0, coat_rough=0.06),
        "lip": principled("BaseLip", (0.02, 0.021, 0.021), 0.18, 0.4, coat=1.0, coat_rough=0.05),
        "glass": glass_material(),
        "neon": emissive("Neon", LIME, 8),
        "work": emissive("Work", LIME, 6),
        "panel": emissive("Panel", (0.1, 0.2, 0.05), 1),
    }
    b, g = BASE, GLASS
    root = link_new(bpy.data.objects.new("Station01", None))
    parts = []
    # the base: a rounded slab
    parts.append(prism("Base", rounded_rect(b["w"], b["d"], b["r"], 20), 0, b["h"], mats["base"], bevel=b["edge"]))
    # the lip round its top: a ring, inset from the edge
    li = LIP
    outer = rounded_rect(b["w"] - 2 * li["inset"], b["d"] - 2 * li["inset"], b["r"] - li["inset"], 20)
    inner = rounded_rect(
        b["w"] - 2 * (li["inset"] + li["width"]), b["d"] - 2 * (li["inset"] + li["width"]), b["r"] - li["inset"] - li["width"], 20
    )
    parts.append(prism("Lip", outer, b["h"] - 0.002, b["h"] + li["h"], mats["lip"], bevel=0.008, hole=inner))
    # the neon round the glass's foot
    parts.append(tube_loop("Neon", rounded_rect(g["w"] + 0.07, g["d"] + 0.07, g["r"] + 0.035, 12), b["h"] + 0.012, NEON_R, mats["neon"]))
    # the dash on the base's front, left of its number
    dash = capsule("Dash", 0.3, 0.016, mats["neon"])
    dash.location = (-0.72, -b["d"] / 2 + 0.004, b["h"] * 0.5)
    parts.append(dash)
    # the glass: outer and inner shells, separate (the site lights the outer one's edges only)
    zc = b["h"] + g["h"] / 2 + 0.004
    outer_glass = glass_shell("GlassOuter", g["w"], g["h"], g["d"], g["r"], g["edge"], mats["glass"])
    w = g["wall"]
    inner_glass = glass_shell(
        "GlassInner", g["w"] - 2 * w, g["h"] - 2 * w, g["d"] - 2 * w, g["r"] - w, g["edge"] * 0.6, mats["glass"], flip=True
    )
    for o in (outer_glass, inner_glass):
        o.location.z = zc
        parts.append(o)
    # the work: the lattice in the middle of the case's depth, a little low (room for the badge above)
    work = lattice("Work", mats["work"])
    work.location = (0, 0, zc - 0.02)
    # turned so its depth shows from the front; it must stay inside the walls: its depth across, turned, is
    # w·(sin + cos) of the turn — checked below
    work.rotation_euler = (0, 0, math.radians(WORK["turn"]))
    span = WORK["cell"] * WORK["n"] + 2 * WORK["tube"]
    t = math.radians(WORK["turn"])
    assert span * (math.sin(t) + math.cos(t)) < g["d"] - 2 * g["wall"] - 0.04, "the work would cut through the glass"
    parts.append(work)
    # the interface lists, at the sides and further back
    for side, nm in ((-1, "PanelL"), (1, "PanelR")):
        p = panel(nm, PANEL["w"], PANEL["h"], mats["panel"])
        p.location = (side * PANEL["x"], PANEL["back"], zc)
        p.rotation_euler = (0, 0, math.radians(side * PANEL["turn"]))
        parts.append(p)
    for p in parts:
        p.parent = root
    return root


def studio():
    """for the .blend (not exported): a dark floor, soft neutral lights, the review camera"""
    bpy.ops.mesh.primitive_plane_add(size=30)
    fl = bpy.context.active_object
    fl.name = "Floor"
    fl.data.materials.append(principled("Floor", (0.01, 0.011, 0.011), 0.3, 0.2, coat=0.5))
    w = bpy.data.worlds.new("Studio")
    bpy.context.scene.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (0.004, 0.005, 0.005, 1)
    for name, loc, energy, size in (("Key", (-3.5, -4.5, 4.0), 900, 4), ("Fill", (4, -3, 2.5), 300, 5), ("Rim", (0, 4, 3.5), 500, 3)):
        bpy.ops.object.light_add(type="AREA", location=loc)
        l = bpy.context.active_object
        l.name = name
        l.data.energy, l.data.size = energy, size
        l.rotation_euler = (Vector((0, 0, 1.0)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.camera_add(location=(-1.6, -6.2, 2.15))
    c = bpy.context.active_object
    c.name = "ReviewCamera"
    c.data.lens = 50
    c.rotation_euler = (Vector((0, 0, 1.05)) - c.location).to_track_quat("-Z", "Y").to_euler()
    sc = bpy.context.scene
    sc.camera = c
    sc.render.resolution_x, sc.render.resolution_y = 1200, 900
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 48
    sc.view_settings.view_transform = "AgX"


def export(root):
    for o in bpy.data.objects:
        o.select_set(o == root or o.parent == root)
    bpy.ops.export_scene.gltf(filepath=GLB, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
                              export_lights=False, export_cameras=False)


if __name__ == "__main__":
    root = build()
    export(root)
    studio()
    bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
    if "--render" in sys.argv:
        sc = bpy.context.scene
        sc.render.image_settings.file_format = "JPEG"
        sc.render.filepath = os.path.join(HERE, "render.jpg")
        bpy.ops.render.render(write_still=True)
    print("exported", os.path.relpath(GLB, ROOT), f"{os.path.getsize(GLB) / 1024:.0f} KB")
    for o in root.children:
        print(f"  {o.name:12s} {len(o.data.vertices):6d} verts")
