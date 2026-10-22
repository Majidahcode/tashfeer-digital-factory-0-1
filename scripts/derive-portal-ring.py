#!/usr/bin/env python3
"""
Derive a transparent portal ring from the owner's original asset — the original is never modified.

    python3 -I scripts/derive-portal-ring.py [--debug DIR]

Source:  Tashfeer_Claude_Pro_MVP_Package/.../02-assets/portal/luminous-portal-ring-original.jpg (1264x842 JPEG)
Output:  assets/derived/portal/luminous-portal-ring.png (RGBA, cropped to the ring and its glow)
         assets/derived/portal/luminous-portal-ring.json (provenance + measured hole geometry)

The JPEG has no alpha: the ring was flattened onto a grey checkerboard (two greys ≈193/227 in ≈19 px cells, drawn
irregularly — cell edges drift and some neighbours share a shade), and the checkerboard shows through the glow. A
colour key would leave squares in the haze, so the background is reconstructed and the glow is unblended from it:

  1. Background levels: the two greys are measured on clean (neutral) pixels and extended under the glow by
     normalised convolution.
  2. Which grey lies under each pixel: measured on the asset, the haze behaves as a dark, semi-transparent green
     over the checker — it only ever darkens red and blue. So for each pixel both greys are tried and the one under
     which red and blue are darkened (not brightened) is kept; when both qualify, the one needing less opacity wins.
     This per-pixel test replaced a spatial cell map, whose mistakes showed up as whitish blobs in the haze.
  3. Opacity: the smallest α for which the unblended colour stays inside RGB, per channel. Adjacent light/dark cells
     then unblend to colours that differ by ~1 level once composited on the page background. (A contrast-based
     "triangulation" estimate was tried and rejected — it produced a lattice in the haze.)
  4. Clean background: neutral pixels whose grey lies within the checker's range are background (α = 0) — this
     includes the blurred cell borders — with a smooth fade so the glow's faint tail has no edge.
  5. The haze has no detail at cell scale, so below a ramp of opacity it is rebuilt from a cell-scale low-pass
     (residual checker noise averages out); the dense ring keeps its full-resolution streaks and sparkles. In the
     faint haze (α < 0.2), which unblends to pure dark green, a neutral grey component is JPEG noise read against the
     light grey and is removed with the opacity it implies. Beyond the glow's reach, and toward the source's
     top/bottom edges (which cut the haze), the haze tapers to zero.
  6. Colour: F = (C − (1 − α)·B) / α, written un-premultiplied.

Nothing is recoloured: F is solved from the observed pixels; no hue or saturation is changed. --verify composites
the result back over the reconstructed checkerboard and reports the difference from the original per region (the
ring is reproduced; the haze differs by the noise and checker remnants that step 5 removes).

Also written: the ring band's box and the opening's per-row profile (for the chat layout) and a soft mask of the
opening (assets/derived/portal/luminous-portal-hole-mask.png) for the chat's glass.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "Tashfeer_Claude_Pro_MVP_Package/Tashfeer_Claude_Pro_MVP_Package/02-assets/portal/luminous-portal-ring-original.jpg"
OUT_DIR = ROOT / "assets/derived/portal"
OUT_PNG = OUT_DIR / "luminous-portal-ring.png"
OUT_WEBP = OUT_DIR / "luminous-portal-ring.webp"  # the same pixels, lossless: what the page serves
OUT_MASK = OUT_DIR / "luminous-portal-hole-mask.png"
OUT_JSON = OUT_DIR / "luminous-portal-ring.json"

# parameters (documented in the provenance file)
LEVEL_SIGMA = 60.0  # spatial smoothing of the two grey levels
EDGE_ERODE = 2  # px dropped at cell borders (JPEG/resampling blur) when measuring levels
DARKEN_TOLERANCE = 4.0  # levels of JPEG noise allowed when testing "red and blue are darkened"
NEUTRAL_CHROMA = (2.5, 8.0)  # chroma ramp: below → may be background
NEUTRAL_RANGE = (4.0, 12.0)  # levels outside [dark grey, light grey] ramp: inside → may be background
EDGE_TAPER = 48.0  # px over which the haze tapers to zero at the source's top/bottom edges
NOISE_FLOOR = 0.01  # residual JPEG noise
HAZE_SIGMA = 8.0  # the haze is smooth: below the ramp it is rebuilt from a cell-scale low-pass (removes checker remnants)
HAZE_RAMP = (0.3, 0.7)  # α ramp from smoothed haze to the full-resolution ring detail
FAINT_HAZE = (0.05, 0.2)  # α ramp: below it a neutral grey component is noise, not glow
GLOW_REACH = (115.0, 170.0)  # px from the dense ring: beyond this the image is background only
OPENINGS = (0.25, 0.4, 0.5)  # opening contours exported for the layout (ring opacity below each)
CONTENT_OPENING = 0.5  # chat controls stay inside this contour (drawn above the ring, so its soft inner glow may touch them)
GLASS_OPENING = 0.5  # the chat's glass fills this contour (drawn below the ring, framed by its inner glow)


def gauss(x, s):
    return ndi.gaussian_filter(x, s, mode="nearest")


def norm_conv(values, weights, s):
    return gauss(values * weights, s) / np.maximum(gauss(weights, s), 1e-6)


def smoothstep(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def min_alpha(c, b):
    """Smallest α keeping F = (C − (1 − α)·b) / α inside [0, 255] in every channel (b: grey level per pixel)."""
    B = b[..., None]
    up = np.where(c > B, (c - B) / np.maximum(255.0 - B, 1e-6), 0.0)
    down = np.where(c < B, (B - c) / np.maximum(B, 1e-6), 0.0)
    return np.clip(np.maximum(up, down).max(axis=2), 0.0, 1.0)


def levels(c):
    """The checker's two greys, measured on clean pixels and extended under the glow."""
    grey = c.mean(axis=2)
    neutral = (c.max(axis=2) - c.min(axis=2)) < 6
    mid = np.median(grey[neutral])
    light_in = ndi.binary_erosion(neutral & (grey > mid), iterations=EDGE_ERODE)
    dark_in = ndi.binary_erosion(neutral & (grey <= mid), iterations=EDGE_ERODE)
    return norm_conv(grey, light_in.astype(float), LEVEL_SIGMA), norm_conv(grey, dark_in.astype(float), LEVEL_SIGMA)


def derive(debug_dir=None):
    raw = SRC.read_bytes()
    c = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float64)
    grey = c.mean(axis=2)
    chroma = c.max(axis=2) - c.min(axis=2)
    lvl_light, lvl_dark = levels(c)

    # which grey is under each pixel: the haze only darkens red and blue
    a_l, a_d = min_alpha(c, lvl_light), min_alpha(c, lvl_dark)
    rb = c[..., [0, 2]]
    ok_l = (rb - lvl_light[..., None] <= DARKEN_TOLERANCE).all(axis=2)
    ok_d = (rb - lvl_dark[..., None] <= DARKEN_TOLERANCE).all(axis=2)
    use_light = np.where(ok_l & ok_d, a_l <= a_d, np.where(ok_l != ok_d, ok_l, a_l <= a_d))
    light = use_light
    b = np.where(use_light, lvl_light, lvl_dark)
    B = np.repeat(b[..., None], 3, axis=2)
    alpha = np.where(use_light, a_l, a_d)

    # neutral pixels whose grey lies within the checker's range are background (incl. blurred cell borders);
    # smooth ramps so the glow's faint tail has no edge
    outside = np.maximum(0.0, np.maximum(lvl_dark - grey, grey - lvl_light))
    keep = 1.0 - (1.0 - smoothstep(chroma, *NEUTRAL_CHROMA)) * (1.0 - smoothstep(outside, *NEUTRAL_RANGE))
    alpha = alpha * keep
    alpha = np.clip((alpha - NOISE_FLOOR) / (1.0 - NOISE_FLOOR), 0.0, 1.0)

    # premultiplied colour α·F = C − (1 − α)·B (exact for the observation)
    a3 = alpha[..., None]
    premult = np.clip(c - (1.0 - a3) * B, 0.0, 255.0)

    # haze: rebuild from a cell-scale low-pass (it has no detail at that scale; checker remnants do);
    # the dense ring keeps its full-resolution streaks and sparkles
    w = smoothstep(gauss(alpha, 2.0), *HAZE_RAMP)[..., None]
    alpha_s = gauss(alpha, HAZE_SIGMA)[..., None]
    premult_s = np.stack([gauss(premult[..., k], HAZE_SIGMA) for k in range(3)], axis=2)
    # faint haze only: it is pure dark green (red/blue unblend to ≈0), so a neutral grey component there is JPEG
    # noise read against the light grey (only ~28 levels of headroom) — remove it with the opacity it implies
    grey_part = premult_s.min(axis=2, keepdims=True)
    faint = 1.0 - smoothstep(alpha_s, *FAINT_HAZE)
    alpha_s = alpha_s * (1.0 - faint * grey_part / np.maximum(premult_s.max(axis=2, keepdims=True), 1e-6))
    premult_s = premult_s - faint * grey_part
    a3 = w * a3 + (1.0 - w) * alpha_s
    premult = w * premult + (1.0 - w) * premult_s

    # beyond the glow's reach there is only background. The ring band is where the unsmoothed opacity exceeds 0.5,
    # closed into one continuous band (most of the ring is 0.6–0.9 opaque once separated from the grey).
    band = ndi.binary_closing(ndi.binary_opening(alpha > 0.5, iterations=2), iterations=8)
    reach = 1.0 - smoothstep(ndi.distance_transform_edt(~band), *GLOW_REACH)
    # the source cuts the haze at its top and bottom edges: taper there instead of ending in a straight line
    rows = np.arange(c.shape[0], dtype=float)
    edge = smoothstep(np.minimum(rows, c.shape[0] - 1 - rows), 0.0, EDGE_TAPER)[:, None]
    reach = reach * np.maximum(edge, band.astype(float))
    a3 = a3 * reach[..., None]
    premult = premult * reach[..., None]

    alpha = a3[..., 0]
    f = np.clip(np.where(a3 > 1e-4, premult / np.maximum(a3, 1e-4), 0.0), 0.0, 255.0)

    rgba = np.dstack([f, alpha * 255.0]).round().astype(np.uint8)
    a_min = alpha  # kept for the debug output below

    # crop to the ring and its glow (+ margin), keeping the glow's natural falloff
    ys, xs = np.nonzero(alpha > 0.01)
    m = 12
    y0, y1 = max(0, ys.min() - m), min(c.shape[0], ys.max() + 1 + m)
    x0, x1 = max(0, xs.min() - m), min(c.shape[1], xs.max() + 1 + m)
    crop = rgba[y0:y1, x0:x1]

    if debug_dir:
        d = Path(debug_dir)
        d.mkdir(parents=True, exist_ok=True)
        Image.fromarray((light * 255).astype(np.uint8)).save(d / "cellmap.png")
        Image.fromarray((a_min * 255).astype(np.uint8)).save(d / "alpha.png")
        np.save(d / "light.npy", light)
        np.save(d / "alpha.npy", alpha)
        np.save(d / "B.npy", B[..., 0])

    return raw, rgba, crop, (x0, y0, x1, y1), alpha, B


def geometry(crop_rgba):
    """
    Ring band box and the opening's contours (fractions of the band box), plus a soft mask of the glass opening.
    rows: 201 samples [y, left, right] from the band's top (0) to bottom (1); null where the contour is closed.
    """
    a = crop_rgba[..., 3].astype(float) / 255.0
    band = ndi.binary_closing(ndi.binary_opening(a > 0.5, iterations=2), iterations=8)
    ys, xs = np.nonzero(band)
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    bw, bh = bx1 - bx0, by1 - by0
    frac = lambda v, o, s: round(float((v - o) / s), 4)

    openings, holes = {}, {}
    for thr in OPENINGS:
        labels, _ = ndi.label(a < thr)
        hole = labels == labels[(by0 + by1) // 2, (bx0 + bx1) // 2]
        holes[thr] = hole
        hy, hx = np.nonzero(hole)
        rows = []
        for i in range(0, 201):
            y = by0 + min(bh - 1, round(i / 200 * (bh - 1)))
            cols = np.nonzero(hole[y])[0]
            rows.append([round(i / 200, 3), None, None] if cols.size == 0 else
                        [round(i / 200, 3), frac(cols.min(), bx0, bw), frac(cols.max() + 1, bx0, bw)])
        openings[str(thr)] = {
            "box": {"left": frac(hx.min(), bx0, bw), "top": frac(hy.min(), by0, bh),
                    "width": frac(hx.max() + 1, hx.min(), bw), "height": frac(hy.max() + 1, hy.min(), bh)},
            "rows": rows,
        }

    # soft mask of the glass opening, cropped to its box (white = glass visible)
    hole = holes[GLASS_OPENING]
    hy, hx = np.nonzero(hole)
    mask = gauss(hole.astype(float), 3.0)[hy.min():hy.max() + 1, hx.min():hx.max() + 1]
    mask_rgba = np.zeros((*mask.shape, 4), np.uint8)
    mask_rgba[..., :3] = 255
    mask_rgba[..., 3] = (mask * 255).round().astype(np.uint8)

    return {
        "ringBox": {"x": int(bx0), "y": int(by0), "width": int(bw), "height": int(bh)},
        "contentOpening": str(CONTENT_OPENING),
        "glassOpening": str(GLASS_OPENING),
        "openings": openings,
    }, mask_rgba


def verify(c, B, crop, box):
    """Composite the result back over the reconstructed checkerboard; report the difference per region."""
    x0, y0, x1, y1 = box
    a = np.zeros(c.shape[:2])
    f = np.zeros(c.shape)
    a[y0:y1, x0:x1] = crop[..., 3] / 255.0
    f[y0:y1, x0:x1] = crop[..., :3]
    back = f * a[..., None] + B * (1.0 - a[..., None])
    err = np.abs(back - c).mean(axis=2)
    regions = {"ring (α > 0.7)": a > 0.7, "glow (0.1 < α ≤ 0.7)": (a > 0.1) & (a <= 0.7),
               "faint haze (0 < α ≤ 0.1)": (a > 0) & (a <= 0.1), "background (α = 0)": a == 0}
    for name, m in regions.items():
        print(f"  {name:26s} {m.sum():7d} px  mean |re-composite − original| {err[m].mean():5.2f}  p95 {np.percentile(err[m], 95):5.2f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", help="write intermediate maps to this directory")
    ap.add_argument("--verify", action="store_true", help="report how closely the result reproduces the original")
    args = ap.parse_args()
    raw, _, crop, box, _, B = derive(args.debug)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray(crop, "RGBA").save(OUT_PNG, optimize=True)
    # served as-is (no re-encoding): a lossy encoder smears the ring's fine sparks; lossless WebP is 37% smaller
    Image.fromarray(crop, "RGBA").save(OUT_WEBP, lossless=True, quality=100, method=6, exact=True)
    geo, mask = geometry(crop)
    Image.fromarray(mask, "RGBA").save(OUT_MASK, optimize=True)
    if args.verify:
        c = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float64)
        verify(c, B, crop, box)
    meta = {
        "note": "Derived by scripts/derive-portal-ring.py from the owner's original; the original is unchanged.",
        "source": str(SRC.relative_to(ROOT)),
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "sourceSize": [1264, 842],
        "cropBox": list(map(int, box)),
        "size": [int(crop.shape[1]), int(crop.shape[0])],
        "method": "checkerboard reconstruction (two greys from clean pixels; per-pixel choice by the haze's "
        "darkening of red/blue), minimal valid alpha unblending, neutral-background fade, cell-scale haze low-pass",
        "parameters": {
            "levelSigma": LEVEL_SIGMA,
            "edgeErode": EDGE_ERODE,
            "darkenTolerance": DARKEN_TOLERANCE,
            "neutralChroma": NEUTRAL_CHROMA,
            "neutralRange": NEUTRAL_RANGE,
            "noiseFloor": NOISE_FLOOR,
            "hazeSigma": HAZE_SIGMA,
            "hazeRamp": HAZE_RAMP,
            "faintHaze": FAINT_HAZE,
            "glowReach": GLOW_REACH,
            "edgeTaper": EDGE_TAPER,
        },
        **geo,
    }
    OUT_JSON.write_text(json.dumps(meta, indent=1) + "\n")
    print(f"wrote {OUT_PNG.relative_to(ROOT)} {meta['size'][0]}x{meta['size'][1]} from crop {meta['cropBox']}")
    print(f"wrote {OUT_WEBP.relative_to(ROOT)} (lossless, identical pixels)")


if __name__ == "__main__":
    main()
