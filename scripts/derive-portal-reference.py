#!/usr/bin/env python3
"""
Derive the transparent portal from the owner's reference image (2026-10-23) — the original is never modified.

    python3 -I scripts/derive-portal-reference.py [--debug DIR]

Source:  assets/originals/portal/luminous-portal-reference-2026-10-23.jpg — the file exactly as the owner attached
         it: a 1264×842 JPEG whose EXIF orientation (6) shows it upright as 842×1264, as every browser and viewer
         does; no alpha channel.
Output:  assets/derived/portal/luminous-portal-reference.png            RGBA: the ring and its glow, upright
         assets/derived/portal/luminous-portal-reference.webp           the same pixels, lossless — what the page serves
         assets/derived/portal/luminous-portal-reference-hole-mask.png  soft mask of the opening (the chat's glass)
         assets/derived/portal/luminous-portal-reference.json           provenance + the measured geometry

What the file contains (python3 -I scripts/portal-source-qa.py inspect <file>): the transparency checkerboard is
painted into the pixels — white (255) and light-grey (≈203) squares of 15–17 px, laid out irregularly (cell sizes
drift, rows shift, some neighbours share a shade, a seam crosses two rows) — and the ring was composited onto it: a
dense band of light trails that hides the squares completely, a translucent dark-green haze around it through which
they stay visible, and sparks and small flares in that haze.

Method — remove only what the checkerboard contributes:
  1. The ring's body. Where the darkest channel stays low at a large scale (a grey opening with a 25 px disk takes the
     bright trails and sparks out of the measure), the band hides the squares: those pixels are kept exactly as they
     are (opacity 1, colour unchanged). Thin outgrowths of that mask (the small flares out in the haze) are not band,
     and holes in it (the large flares on the band) are, so the band is one solid ring.
  2. The haze. The squares are neutral and the haze is a dark green film (it absorbs red and blue), so wherever the
     squares show through, their contribution is the pixel's neutral floor — its darkest channel. Removing it leaves
     the haze's own colour, premultiplied, exactly, whichever square lies under the pixel: A = C − min(C). Its
     opacity is how much of the white squares no longer shows: α = 1 − U/255, U being the level of the nearest white
     squares (a local maximum of the median-filtered darkest channel, measured on haze pixels only).
  3. Sparks and flares in the haze are brighter than any square could make them: only the squares' level (U plus a
     noise margin) is removed from them, so they keep their own light.
  4. Between band and haze the two treatments blend over the measure of step 1: no cut edge, no halo.
  5. The source's frame cuts the faint outer haze (it reaches the left and right borders): there the haze fades to
     zero over the last 40 px, so the glow ends softly instead of in a straight line. The band is never touched.
  6. Colour: F = A / α, with α raised where needed so that F stays inside RGB — the premultiplied colour, which is
     what the page shows, stays exactly A.

Nothing is recoloured, sharpened, blurred or stretched: the band's pixels are the original's, and elsewhere only the
checkerboard's neutral contribution is subtracted. python3 -I scripts/portal-source-qa.py verify … shows the result on
the page background (#030504) at full size and with ×8 gain, and measures remnant squares, rectangles and hard edges.

Also written, for the chat layout: the band's box and the opening's per-row profile at three opacity contours, and a
soft mask of the opening for the chat's glass.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/originals/portal/luminous-portal-reference-2026-10-23.jpg"
OUT_DIR = ROOT / "assets/derived/portal"
NAME = "luminous-portal-reference"
OUT_PNG = OUT_DIR / f"{NAME}.png"
OUT_WEBP = OUT_DIR / f"{NAME}.webp"
OUT_MASK = OUT_DIR / f"{NAME}-hole-mask.png"
OUT_JSON = OUT_DIR / f"{NAME}.json"

# parameters (recorded in the provenance file)
BAND_DISK = 12  # px radius of the grey opening that measures the band (bright trails and sparks < 25 px drop out)
SPARK_DISK = 24  # px radius of the wider opening that also takes out the largest sparks (up to 49 px)
BAND_RAMP = (25.0, 55.0)  # that measure's darkest channel: below → the band (kept as is), above → haze or background
#   (measured: ≈11–19 deep in the band, 51–60 in its outer 6 px — translucent strands the squares show through —
#   70–80 just outside, 110+ beyond 10 px)
FLARE_RAMP = (40.0, 90.0)  # the same measure, band including those strands: its small holes are flares on the band
BAND_SPUR = 6  # px radius: outgrowths of the band mask thinner than twice this are flares in the haze, not band
BAND_HOLE = 4000  # px²: holes in the band mask smaller than this are flares on the band
SQUARE_OPEN = 4  # px radius of the opening that keeps sparks and the squares' light borders out of their level
WHITE_REACH = 21  # px window in which the nearest white squares' level is taken
WHITE_SMOOTH = 3.0  # σ (px) of that level
SPARK_MARGIN = (6.0, 0.06)  # brighter than the white squares by more than max(6 levels, 6 %) → the pixel's own light
HAZE_SIGMA = 5.0  # σ (px) of the faint haze's local mean
HAZE_SHRINK = 3.0  # levels: smaller deviations from it in the faint haze are the squares' tint, not detail
HAZE_SHRINK_RAMP = (0.25, 0.45)  # haze opacity over which that threshold fades out (denser haze: untouched)
EDGE_FADE = 40.0  # px: the haze fades to zero toward the source's frame
NOISE_RAMP = (0.01, 0.04)  # haze opacity ramp: below it the white squares show at full strength (no haze, only noise)
NOISE_SMOOTH = 6.0  # σ (px) of the opacity that ramp is read on, so the glow's faint end is round, not cell-shaped
NOISE_FLOOR = 0.004  # opacity below this is JPEG noise
OPENINGS = (0.25, 0.4, 0.5)  # opening contours exported for the layout (ring opacity below each)
CONTENT_OPENING = 0.25  # the chat's controls stay inside this contour (with the layout's margin), clear of the inner glow
GLASS_OPENING = 0.5  # the chat's glass fills this contour (drawn below the ring, framed by its inner glow)


def gauss(x, s):
    return ndi.gaussian_filter(x, s, mode="nearest")


def norm_conv(values, weights, s):
    return gauss(values * weights, s) / np.maximum(gauss(weights, s), 1e-6)


def smoothstep(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def disk(r):
    y, x = np.mgrid[-r : r + 1, -r : r + 1]
    return np.hypot(x, y) <= r + 0.01


def load():
    raw = SRC.read_bytes()
    im = Image.open(SRC)
    orientation = int(im.getexif().get(0x0112, 1))
    stored = list(im.size)
    upright = ImageOps.exif_transpose(im).convert("RGB")
    return raw, orientation, stored, np.asarray(upright).astype(np.float64)


def ring_mask(haze):
    """The one ring-shaped region where haze < 0.5, without thin outgrowths; and its small holes (flares)."""
    band = ndi.binary_opening(haze < 0.5, structure=disk(BAND_SPUR))
    labels, count = ndi.label(band)
    if count:
        sizes = ndi.sum(band, labels, range(1, count + 1))
        band = labels == 1 + int(np.argmax(sizes))
    holes = ndi.binary_fill_holes(band) & ~band
    labels, count = ndi.label(holes)
    small = np.zeros_like(band)
    if count:
        sizes = ndi.sum(holes, labels, range(1, count + 1))
        small = np.isin(labels, [i + 1 for i, s in enumerate(sizes) if s < BAND_HOLE])
    return band, small


def band_weight(n):
    """
    weight: 1 where the squares show through (haze, background), 0 on the ring's body. sure: haze for certain — what
    the white squares' level is measured on. Also returns the band mask and the band measure (for --debug).
    """
    measure = ndi.grey_opening(n, footprint=disk(BAND_DISK))
    haze = gauss(smoothstep(measure, *BAND_RAMP), 1.5)
    band, _ = ring_mask(haze)
    # the large flares on the band are found as holes of the band *with* its translucent edge strands, which
    # surround them; the band without those strands can be open there
    _, flares = ring_mask(gauss(smoothstep(measure, *FLARE_RAMP), 1.5))
    flares = ndi.binary_dilation(flares, structure=disk(2))
    band = band | flares
    weight = np.maximum(haze, 1.0 - gauss(band.astype(float), 2.0))  # outside the solid band: haze
    weight = np.minimum(weight, 1.0 - gauss(flares.astype(float), 2.0))  # flares on the band: band
    # with a disk large enough to take out the largest sparks too, what still reads as haze is haze for certain:
    # a spark the small measure lets through is not, so it never sets the squares' level it is compared with
    wide = gauss(smoothstep(ndi.grey_opening(n, footprint=disk(SPARK_DISK)), *BAND_RAMP), 1.5)
    sure = (wide > 0.5) & (weight > 0.5)
    return np.clip(weight, 0.0, 1.0), sure, band, measure


def derive(debug_dir=None):
    raw, orientation, stored, c = load()
    h, w = c.shape[:2]
    n = c.min(axis=2)

    weight, sure, band, measure = band_weight(n)

    # the nearest white squares' level, from certain haze/background only; a small opening takes out the sparks and
    # the light lines between squares, never the squares themselves (15–17 px)
    level = ndi.grey_opening(n, footprint=disk(SQUARE_OPEN))
    white = ndi.maximum_filter(np.where(sure, level, 0.0), size=WHITE_REACH)
    white = np.clip(gauss(white, WHITE_SMOOTH), 1.0, 255.0)

    # the squares' contribution: the neutral floor, but never more than the squares' level (sparks keep their light)
    cap = white + np.maximum(SPARK_MARGIN[0], SPARK_MARGIN[1] * white)
    floor = np.minimum(n, cap)
    premult = np.clip(c - (weight * floor)[..., None], 0.0, 255.0)
    alpha = np.clip(1.0 - weight * white / 255.0, 0.0, 1.0)

    # the faint haze was painted with a slightly different tint over each square (±1–2 levels, measured): in the faint
    # haze only, deviations from the local mean smaller than a few levels are dropped (soft threshold). Sparks, flares
    # and trails, far above that, keep their contrast less the threshold; the denser haze and the band are untouched.
    shrink = HAZE_SHRINK * weight * (1.0 - smoothstep(alpha, *HAZE_SHRINK_RAMP))
    base = np.stack([norm_conv(premult[..., k], weight, HAZE_SIGMA) for k in range(3)], axis=2)
    dev = premult - base
    premult = np.clip(base + np.sign(dev) * np.maximum(np.abs(dev) - shrink[..., None], 0.0), 0.0, 255.0)

    # the source's frame cuts the faint haze: fade it there (never the band)
    yy, xx = np.mgrid[0:h, 0:w]
    edge = smoothstep(np.minimum.reduce([xx, w - 1 - xx, yy, h - 1 - yy]).astype(float), 0.0, EDGE_FADE)
    keep = np.maximum(edge, 1.0 - weight)
    alpha = alpha * keep
    premult = premult * keep[..., None]

    # where the white squares show at (almost) full strength there is no haze: what remains is JPEG chroma noise of a
    # few levels at the squares' edges — faded out below the haze's faintest visible opacity
    clear = smoothstep(gauss(alpha, NOISE_SMOOTH), *NOISE_RAMP)
    alpha = alpha * clear
    premult = premult * clear[..., None]

    # F inside RGB: α ≥ max(A) / 255 keeps the premultiplied colour exact
    alpha = np.maximum(alpha, premult.max(axis=2) / 255.0)
    noise = alpha < NOISE_FLOOR
    alpha[noise] = 0.0
    premult[noise] = 0.0
    f = np.where(alpha[..., None] > 0, premult / np.maximum(alpha[..., None], 1e-6), 0.0)
    rgba = np.dstack([np.clip(f, 0, 255), alpha * 255.0]).round().astype(np.uint8)

    ys, xs = np.nonzero(rgba[..., 3] > 0)
    m = 8
    y0, y1 = max(0, ys.min() - m), min(h, ys.max() + 1 + m)
    x0, x1 = max(0, xs.min() - m), min(w, xs.max() + 1 + m)
    crop = rgba[y0:y1, x0:x1]

    if debug_dir:
        d = Path(debug_dir)
        d.mkdir(parents=True, exist_ok=True)
        Image.fromarray((weight * 255).round().astype(np.uint8)).save(d / "weight.png")
        Image.fromarray((band * 255).astype(np.uint8)).save(d / "band.png")
        Image.fromarray(np.clip(measure, 0, 255).astype(np.uint8)).save(d / "band-measure.png")
        Image.fromarray(white.round().astype(np.uint8)).save(d / "white-level.png")
        Image.fromarray((sure * 255).astype(np.uint8)).save(d / "sure-haze.png")

    return raw, orientation, stored, (w, h), crop, (int(x0), int(y0), int(x1), int(y1)), band[y0:y1, x0:x1]


def geometry(crop_rgba, band):
    """
    The band's box and the opening's contours (fractions of the band box), plus a soft mask of the glass opening.
    rows: 201 samples [y, left, right] from the band's top (0) to its bottom (1); null where the contour is closed.
    """
    a = crop_rgba[..., 3].astype(float) / 255.0
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", help="write intermediate maps to this directory")
    args = ap.parse_args()
    raw, orientation, stored, upright, crop, box, band = derive(args.debug)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray(crop, "RGBA").save(OUT_PNG, optimize=True)
    # served as-is (no re-encoding): a lossy encoder would smear the fine trails and sparks
    Image.fromarray(crop, "RGBA").save(OUT_WEBP, lossless=True, quality=100, method=6, exact=True)
    geo, mask = geometry(crop, band)
    Image.fromarray(mask, "RGBA").save(OUT_MASK, optimize=True)
    meta = {
        "note": "Derived by scripts/derive-portal-reference.py from the owner's reference image; the original is unchanged.",
        "script": "scripts/derive-portal-reference.py",
        "source": str(SRC.relative_to(ROOT)),
        "sourceSha256": hashlib.sha256(raw).hexdigest(),
        "sourceStoredSize": stored,
        "sourceExifOrientation": orientation,
        "sourceSize": list(upright),
        "cropBox": list(box),
        "size": [int(crop.shape[1]), int(crop.shape[0])],
        "method": "the ring's body kept as is (where the checkerboard is hidden); in the haze the checkerboard's neutral "
        "floor (darkest channel) removed, opacity from the nearest white squares' level; sparks keep their own light; "
        "soft fade of the haze at the source's frame",
        "parameters": {
            "bandDisk": BAND_DISK,
            "sparkDisk": SPARK_DISK,
            "bandRamp": BAND_RAMP,
            "flareRamp": FLARE_RAMP,
            "bandSpur": BAND_SPUR,
            "bandHole": BAND_HOLE,
            "squareOpen": SQUARE_OPEN,
            "whiteReach": WHITE_REACH,
            "whiteSmooth": WHITE_SMOOTH,
            "sparkMargin": SPARK_MARGIN,
            "hazeSigma": HAZE_SIGMA,
            "hazeShrink": HAZE_SHRINK,
            "hazeShrinkRamp": HAZE_SHRINK_RAMP,
            "edgeFade": EDGE_FADE,
            "noiseRamp": NOISE_RAMP,
            "noiseSmooth": NOISE_SMOOTH,
            "noiseFloor": NOISE_FLOOR,
        },
        **geo,
    }
    OUT_JSON.write_text(json.dumps(meta, indent=1) + "\n")
    print(f"wrote {OUT_PNG.relative_to(ROOT)} {meta['size'][0]}x{meta['size'][1]} from crop {meta['cropBox']} "
          f"of the upright {upright[0]}x{upright[1]} source")
    print(f"wrote {OUT_WEBP.relative_to(ROOT)} (lossless, identical pixels), {OUT_MASK.name}, {OUT_JSON.name}")
    print("band box", geo["ringBox"], "aspect", round(geo["ringBox"]["width"] / geo["ringBox"]["height"], 4))


if __name__ == "__main__":
    main()
