"""Pose tests on the prepared rig (head turn, arm raise, elbow and knee bends): renders to blender/tashfeer/.work."""
import bpy  # noqa: F401
import math
import os
import sys
from mathutils import Vector, Euler

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "blender/tashfeer/.work")
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "blender/tashfeer/tashfeer.blend"))
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.samples = 20
sc.render.resolution_x, sc.render.resolution_y = 420, 760
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.42, 0.44, 1)
cam = bpy.data.objects.new("c", bpy.data.cameras.new("c")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.1
sun = bpy.data.objects.new("s", bpy.data.lights.new("s", "SUN")); sun.data.energy = 3
sun.rotation_euler = (math.radians(50), 0, math.radians(30)); sc.collection.objects.link(sun)
rig = bpy.data.objects["TashfeerRig"]
pb = rig.pose.bones
for b in pb:
    b.rotation_mode = "XYZ"


def reset():
    for b in pb:
        b.rotation_euler = (0, 0, 0)


def look(ang, scale=2.1, target=(0, 0, 0)):
    a = math.radians(ang)
    cam.data.ortho_scale = scale
    t = Vector(target)
    cam.location = t + Vector((math.sin(a) * 6, -math.cos(a) * 6, 0))
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()


def shot(name):
    sc.render.filepath = os.path.join(OUT, f"pose_{name}.png")
    bpy.ops.render.render(write_still=True)


poses = {
    # bone-local rotations (radians); bones point along their own +Y
    "head": {"head": (0, math.radians(35), 0), "neck": (0, math.radians(10), 0)},
    "arm": {"upper_arm_L": (math.radians(-10), 0, math.radians(-70)), "forearm_L": (math.radians(60), 0, 0)},
    "elbow": {"forearm_L": (math.radians(80), 0, 0), "forearm_R": (math.radians(80), 0, 0)},
    "knee": {"thigh_L": (math.radians(45), 0, 0), "shin_L": (math.radians(-70), 0, 0), "foot_L": (math.radians(20), 0, 0)},
}
which = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else list(poses)
for name in which:
    reset()
    for b, r in poses[name].items():
        pb[b].rotation_euler = r
    bpy.context.view_layer.update()
    look(0); shot(f"{name}_front")
    look(90); shot(f"{name}_side")
reset()
look(0, 0.7, (0, 0, 0.5)); shot("chest_close")
print("done")
