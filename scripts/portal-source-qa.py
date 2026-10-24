#!/usr/bin/env python3
"""
Evidence about a portal reference image and its transparent derivative — read-only: nothing here changes either file.

    python3 -I scripts/portal-source-qa.py inspect <source> [--out DIR]
    python3 -I scripts/portal-source-qa.py verify <source> <derived.png> <provenance.json> --out DIR

inspect — what the file really is: its format, mode and whether it has an alpha channel; for a JPEG its estimated
quality and chroma subsampling; and whether a transparency checkerboard is baked into the pixels: the share of
neutral (grey) pixels, their two grey levels, and the cell size from the autocorrelation of the light/dark map
(a checkerboard anti-correlates at one cell and correlates again at two). With --out: an 8× zoom of the most neutral
corner, where the squares can be seen pixel by pixel.

verify — the derivative on the page's background (#030504): the full-size composite, 3× zooms of the outer glow, the
inner haze and the brightest spark, and the same composite with ×8 gain (any remnant square or rectangle in the faint
glow becomes visible). Measured:
  • edges: the derivative's outer border is fully transparent (no rectangle), and the faint glow fades without a cliff
    (largest opacity step between neighbouring pixels where α < 0.3);
  • checker signature: in tiles of the faint glow (4 cells wide), the power at the checker's spatial frequency against
    the power around it — in the source (over the checkerboard) and in the composite (should be gone).
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps, JpegImagePlugin
from scipy import ndimage as ndi

PAGE_BG = np.array([3.0, 5.0, 4.0])  # --brand-bg #030504
IJG_LUMA = np.array([16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
                     14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113,
                     92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99], float)


def jpeg_quality(im):
    """IJG-equivalent quality from the luminance table (order-independent estimate)."""
    q = getattr(im, "quantization", None) or {}
    if 0 not in q:
        return None
    s = 100.0 * np.sum(np.asarray(q[0], float)) / IJG_LUMA.sum()
    return round((200.0 - s) / 2.0 if s <= 100 else 5000.0 / s)


def acf(light, mask, axis, maxlag):
    x = np.where(mask, light - light[mask].mean(), 0.0)
    out = []
    for lag in range(1, maxlag + 1):
        if axis == 1:
            a, b, w = x[:, :-lag], x[:, lag:], mask[:, :-lag] & mask[:, lag:]
        else:
            a, b, w = x[:-lag], x[lag:], mask[:-lag] & mask[lag:]
        den = np.sqrt((a[w] ** 2).sum() * (b[w] ** 2).sum())
        out.append(float((a * b)[w].sum() / den) if den > 0 else 0.0)
    return np.array(out)


def checker_evidence(c):
    grey = c.mean(axis=2)
    chroma = c.max(axis=2) - c.min(axis=2)
    neutral = chroma < 6
    ev = {"neutralShare": round(float(neutral.mean()), 3)}
    if neutral.sum() < 1000:
        return ev | {"checkerboard": False, "reason": "almost no neutral (grey) pixels"}
    hist = np.bincount(np.clip(grey[neutral].round(), 0, 255).astype(int), minlength=256).astype(float)
    sm = ndi.gaussian_filter1d(hist, 1.5)
    ext = np.concatenate([[-1.0], sm, [-1.0]])  # the ends count too: a white square is 255
    peaks = sorted((i for i in range(256) if ext[i + 1] >= ext[i] and ext[i + 1] >= ext[i + 2] and sm[i] > 0),
                   key=lambda i: -sm[i])
    p1 = peaks[0]
    p2 = next((p for p in peaks[1:] if abs(p - p1) >= 8 and sm[p] >= 0.15 * sm[p1]), None)
    ev["greyLevels"] = sorted([p1] + ([p2] if p2 is not None else []))
    if p2 is None:
        return ev | {"checkerboard": False, "reason": "one grey level only (a flat background, not a checkerboard)"}
    mid = (p1 + p2) / 2.0
    # drop the blurred cell borders: keep pixels clearly at one level or the other
    clear = neutral & (np.abs(grey - mid) > 0.25 * abs(p1 - p2))
    light = (grey > mid).astype(float)
    maxlag = min(120, c.shape[1] // 4, c.shape[0] // 4)
    ax, ay = acf(light, clear, 1, maxlag), acf(light, clear, 0, maxlag)
    cell_x, cell_y = int(np.argmin(ax)) + 1, int(np.argmin(ay)) + 1
    ev |= {
        "cellPx": [cell_x, cell_y],
        "acfAtCell": [round(float(ax[cell_x - 1]), 2), round(float(ay[cell_y - 1]), 2)],
        "acfAtTwoCells": [round(float(ax[min(2 * cell_x, maxlag) - 1]), 2), round(float(ay[min(2 * cell_y, maxlag) - 1]), 2)],
    }
    ev["checkerboard"] = bool(ev["neutralShare"] > 0.05 and max(ev["acfAtCell"]) < -0.25)
    return ev


def inspect(path, out_dir=None):
    raw = path.read_bytes()
    im = Image.open(path)
    orientation = im.getexif().get(0x0112, 1)
    fmt, stored = im.format, list(im.size)
    q, sampling = jpeg_quality(im) if fmt == "JPEG" else None, JpegImagePlugin.get_sampling(im) if fmt == "JPEG" else -1
    info = dict(im.info)
    # what a browser or image viewer shows: the pixels turned by the EXIF orientation (CSS image-orientation default)
    im = ImageOps.exif_transpose(im)
    rep = {
        "file": str(path),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "format": fmt,
        "mode": im.mode,
        "storedSize": stored,
        "exifOrientation": int(orientation),
        "displayedSize": list(im.size),
        "alphaChannel": im.mode in ("RGBA", "LA", "PA", "La", "RGBa") or "transparency" in info,
        "iccProfile": "icc_profile" in info,
    }
    if fmt == "JPEG":
        rep["jpegQuality"] = q
        rep["chromaSubsampling"] = {0: "4:4:4", 1: "4:2:2", 2: "4:2:0"}.get(sampling, "unknown")
        rep["progressive"] = bool(info.get("progressive") or info.get("progression"))
    c = np.asarray(im.convert("RGB")).astype(np.float64)
    rep["checker"] = checker_evidence(c)
    if rep["alphaChannel"]:
        a = np.asarray(im.convert("RGBA"))[..., 3]
        rep["alpha"] = {"min": int(a.min()), "max": int(a.max()), "transparentShare": round(float((a == 0).mean()), 3)}
    if out_dir:
        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)
        h, w = c.shape[:2]
        s = min(64, h // 4, w // 4)
        neutral = (c.max(axis=2) - c.min(axis=2)) < 6
        corners = {(0, 0): None, (0, w - s): None, (h - s, 0): None, (h - s, w - s): None}
        best = max(corners, key=lambda yx: neutral[yx[0]:yx[0] + s, yx[1]:yx[1] + s].mean())
        y, x = best
        Image.fromarray(c[y:y + s, x:x + s].astype(np.uint8)).resize((s * 8, s * 8), Image.NEAREST).save(
            out / "source-corner-8x.png")
        rep["cornerZoom"] = {"at": [int(x), int(y)], "size": s, "file": str(out / "source-corner-8x.png")}
    return rep


def verify(src_path, png_path, prov_path, out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    prov = json.loads(Path(prov_path).read_text())
    src = np.asarray(ImageOps.exif_transpose(Image.open(src_path)).convert("RGB")).astype(np.float64)
    d = np.asarray(Image.open(png_path).convert("RGBA")).astype(np.float64)
    x0, y0, x1, y1 = prov["cropBox"]
    s = src[y0:y1, x0:x1]
    a = d[..., 3:] / 255.0
    comp = d[..., :3] * a + PAGE_BG * (1.0 - a)
    Image.fromarray(comp.round().astype(np.uint8)).save(out / "derived-on-page-bg.png")
    Image.fromarray(np.clip(comp * 8.0, 0, 255).round().astype(np.uint8)).save(out / "derived-on-page-bg-gain8.png")
    alpha = a[..., 0]
    rep = {"derived": str(png_path), "size": [d.shape[1], d.shape[0]], "cropBox": prov["cropBox"]}

    # edges: a transparent border all round (no rectangle), and no cliff in the faint glow
    border = np.concatenate([alpha[:2].ravel(), alpha[-2:].ravel(), alpha[:, :2].ravel(), alpha[:, -2:].ravel()])
    gy, gx = np.gradient(alpha)
    step = np.hypot(gx, gy)
    faint = (alpha > 0) & (alpha < 0.3)
    rep["edges"] = {
        "borderMaxAlpha": round(float(border.max()), 4),
        "faintGlowMaxStep": round(float(step[faint].max()), 4) if faint.any() else None,
        "faintGlowStepP999": round(float(np.percentile(step[faint], 99.9)), 4) if faint.any() else None,
        "supportEdgeMaxAlpha": round(float(alpha[(alpha > 0) & ndi.binary_dilation(alpha == 0)].max()), 4),
    }

    # zooms (3×, nearest): outer glow at the left of the ring's middle, inner haze, brightest spark
    h, w = alpha.shape
    z = 72
    rb = prov["ringBox"]
    cy = rb["y"] + rb["height"] // 2
    row = alpha[cy]
    outer_x = int(np.argmax(row > 0.02)) if (row > 0.02).any() else 0
    lum = comp.mean(axis=2)
    sy, sx = np.unravel_index(int(np.argmax(lum)), lum.shape)
    picks = {
        "outer-glow": (max(0, cy - z // 2), max(0, outer_x - z // 4)),
        "inner-haze": (max(0, cy - z // 2), rb["x"] + int(rb["width"] * 0.22)),
        "spark": (max(0, sy - z // 2), max(0, sx - z // 2)),
    }
    for name, (yy, xx) in picks.items():
        yy, xx = min(yy, h - z), min(xx, w - z)
        crop = comp[yy:yy + z, xx:xx + z]
        Image.fromarray(crop.round().astype(np.uint8)).resize((z * 3, z * 3), Image.NEAREST).save(out / f"zoom-{name}-3x.png")

    # checker signature in tiles of the faint glow: power at the checker frequency vs the power around it
    ins = checker_evidence(src)
    if ins.get("checkerboard"):
        cell = float(np.mean(ins["cellPx"]))
        t = int(round(4 * 2 * cell / 2))  # 4 cells: the fundamental (period = 2 cells) falls on bin 2
        t = max(t, 24)
        k = t / (2 * cell)
        win = np.outer(np.hanning(t), np.hanning(t))
        fy, fx = np.meshgrid(np.fft.fftfreq(t) * t, np.fft.fftfreq(t) * t, indexing="ij")
        rad = np.hypot(fx, fy)
        peak = np.zeros((t, t), bool)
        for sxs in (-1, 1):
            for sys_ in (-1, 1):
                peak |= np.hypot(fx - sxs * k, fy - sys_ * k) <= 1.0
        ring_ = (np.abs(rad - np.hypot(k, k)) <= 1.6) & ~peak
        amp = {"source": [], "composite": []}
        for yy in range(0, h - t + 1, t // 2):
            for xx in range(0, w - t + 1, t // 2):
                tile_a = alpha[yy:yy + t, xx:xx + t]
                if ((tile_a > 0.01) & (tile_a < 0.35)).mean() < 0.85:
                    continue
                for name, img in (("source", s), ("composite", comp)):
                    L = img[yy:yy + t, xx:xx + t].mean(axis=2)
                    X = np.abs(np.fft.fft2((L - L.mean()) * win))
                    # amplitude (levels) of the strongest component at the checker's frequency
                    amp[name].append(float(2.0 * X[peak].max() / win.sum()))
        med = lambda v: round(float(np.median(v)), 2) if v else None
        p95 = lambda v: round(float(np.percentile(v, 95)), 2) if v else None
        rep["checkerSignature"] = {
            "tilePx": t,
            "tiles": len(amp["source"]),
            "sourceAmplitudeLevels": {"median": med(amp["source"]), "p95": p95(amp["source"])},
            "compositeAmplitudeLevels": {"median": med(amp["composite"]), "p95": p95(amp["composite"])},
            "note": "amplitude, in 8-bit levels, of the brightness pattern at the checker's frequency in tiles of the "
            "faint glow (opacity 0.01–0.35): the source over its checkerboard vs the derivative on the page background",
        }
    (out / "verify.json").write_text(json.dumps(rep, indent=1, ensure_ascii=False) + "\n")
    return rep


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    pi = sub.add_parser("inspect")
    pi.add_argument("source")
    pi.add_argument("--out")
    pv = sub.add_parser("verify")
    pv.add_argument("source")
    pv.add_argument("derived")
    pv.add_argument("provenance")
    pv.add_argument("--out", required=True)
    args = ap.parse_args()
    if args.cmd == "inspect":
        rep = inspect(Path(args.source), args.out)
    else:
        rep = verify(Path(args.source), Path(args.derived), Path(args.provenance), args.out)
    json.dump(rep, sys.stdout, indent=1, ensure_ascii=False)
    print()


if __name__ == "__main__":
    main()
