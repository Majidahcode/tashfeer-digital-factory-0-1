# Tashfeer — the 3D character

Source: the owner's Meshy model `Meshy_AI_Tashfeer_Robot_1031010753_image-to-3d-texture.glb` (45.8 MB, sha256
`b708e2116ddddecfd2129bc6b0b4c2aa2e2adaf8de61bdcd092ec4a36c19e347`). It is **never modified** and not kept in the
repository (its size): `build.py` reads it from wherever it is.

```
python3 blender/tashfeer/build.py /path/to/Meshy_AI_Tashfeer_Robot_1031010753_image-to-3d-texture.glb
python3 blender/tashfeer/pose_test.py          # head turn, arm raise, elbow and knee bends → .work/pose_*.png
```

What the source is: one mesh, 523 008 vertices / 991 608 triangles, one material (colour 4096², metal-roughness 2048²,
normal 4096²), A-pose, facing −Y, 1.90 m tall; no skeleton, no animation, no emissive map.

What `build.py` makes (`public/models/tashfeer/tashfeer.glb`, `tashfeer.blend`):

- decimated to ≈55 k triangles (ratio 0.055) — the face (visor stripes), the lines and the fingers' detail are in the
  colour map; the scan's normal map (baked for the million triangles) is dropped because it drew facets on the lighter
  mesh: smooth normals instead;
- a skeleton on the measured body: hips, spine, chest, neck, head; clavicle, upper arm, forearm, hand; thigh, shin,
  foot, toes (both sides). **No finger bones**: the fingers are one sculpted piece with the hand;
- rigid skinning: each vertex follows its nearest bone, blended only in a ≈1–3 cm band where two bones meet — the
  plates turn as pieces, they do not stretch;
- the name «تشفير» on the chest (the model had none): a thin decal shrink-wrapped onto the chest, following the chest
  bone, drawn from `name.png` (Cairo ExtraBold, his orange);
- textures at web sizes (JPEG), and an emissive map taken from the orange lines of the colour map (they glow in the
  browser, in his orange `--tashfeer-glow`).

Movements are not baked into the file: they are posed live in the browser
(`src/components/characters/tashfeer3d/poses.ts`), each state blending into the next.
