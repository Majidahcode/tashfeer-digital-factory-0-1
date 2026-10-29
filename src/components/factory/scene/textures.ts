/**
 * Textures drawn on canvases: the product's screen (the approved model's example page, built up as production
 * advances), the stations' labels, and the factory's sign. Arabic text is laid out by the browser (direction rtl).
 */
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { ICON_PATHS, type IconName } from "@/components/icons/Icon";
import type { ModelId } from "@/lib/project-store";
import type { ScenePalette } from "./palette";

const FONT = `"Cairo", system-ui, sans-serif`;

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.direction = "rtl";
  return { c, ctx };
}

function texture(c: HTMLCanvasElement) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/* ── the product's screen ── */

export const SCREEN = { w: 1024, h: 640 };

/**
 * The approved model's example page (the same sections as the prototypes review), drawn to `build` (0..1): the
 * sections already built are filled in the model's colours; the rest are outlines of what is still to come.
 */
export function drawProductScreen(
  target: HTMLCanvasElement,
  model: ModelId,
  build: number,
  pal: ScenePalette,
) {
  const ctx = target.getContext("2d")!;
  // drawn in SCREEN units, at the canvas's own resolution (2× for the large, readable screen)
  ctx.setTransform(target.width / SCREEN.w, 0, 0, target.height / SCREEN.h, 0, 0);
  ctx.direction = "rtl";
  const k = pal.css;
  const light = model === "A";
  const C = light
    ? { bg: k.aBg, surface: k.aSurface, line: k.aLine, text: k.aText, muted: k.aMuted, accent: k.aAccent, ink: k.aInk }
    : { bg: k.bBg, surface: k.bSurface, line: k.bLine, text: k.bText, muted: k.bMuted, accent: k.bAccent, ink: k.bInk };
  const W = SCREEN.w;
  const H = SCREEN.h;
  const pad = 44;
  // sections: header, hero, features, services, footer — built in this order
  const sections = [
    { y: 26, h: 54 },
    { y: 96, h: 236 },
    { y: 350, h: 60 },
    { y: 426, h: 128 },
    { y: 570, h: 46 },
  ];
  const built = Math.floor(build * sections.length + 1e-6);
  const partial = build * sections.length - built;

  // the screen itself: the model's background once anything is built, a dark blueprint before
  ctx.fillStyle = built > 0 ? C.bg : k.bg;
  ctx.fillRect(0, 0, W, H);

  const outline = (y: number, h: number) => {
    ctx.save();
    ctx.setLineDash([14, 10]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = k.neon;
    ctx.globalAlpha = 0.55;
    rr(ctx, pad, y, W - pad * 2, h, 14);
    ctx.stroke();
    ctx.restore();
  };

  sections.forEach((s, i) => {
    if (i >= built) {
      outline(s.y, s.h);
      if (i === built && partial > 0) {
        // the section being built: filled from the right (the reading side) as far as it has gone
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = C.surface;
        const w = (W - pad * 2) * partial;
        rr(ctx, W - pad - w, s.y, w, s.h, 14);
        ctx.fill();
        ctx.restore();
      }
      return;
    }
    switch (i) {
      case 0: {
        ctx.fillStyle = C.accent;
        rr(ctx, W - pad - 34, s.y + 12, 30, 30, 8);
        ctx.fill();
        ctx.fillStyle = C.text;
        ctx.font = `800 26px ${FONT}`;
        ctx.textAlign = "right";
        ctx.fillText("اسم مشروعك", W - pad - 48, s.y + 38);
        ctx.font = `500 18px ${FONT}`;
        ctx.fillStyle = C.muted;
        ["الرئيسية", "الخدمات", "من نحن", "تواصل معنا"].forEach((t, j) => ctx.fillText(t, W - 330 - j * 100, s.y + 36));
        ctx.fillStyle = C.accent;
        rr(ctx, pad, s.y + 8, 130, 40, 10);
        ctx.fill();
        ctx.fillStyle = C.ink;
        ctx.textAlign = "center";
        ctx.font = `800 18px ${FONT}`;
        ctx.fillText("ابدأ الآن", pad + 65, s.y + 34);
        break;
      }
      case 1: {
        ctx.fillStyle = C.surface;
        rr(ctx, pad, s.y, W - pad * 2, s.h, 18);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillStyle = C.text;
        ctx.font = `800 44px ${FONT}`;
        ctx.fillText("عنوان رئيسي يعرّف", W - pad - 36, s.y + 74);
        ctx.fillText("بمشروعك", W - pad - 36, s.y + 128);
        ctx.font = `500 19px ${FONT}`;
        ctx.fillStyle = C.muted;
        ctx.fillText("وصف قصير لما يقدّمه مشروعك لعملائه.", W - pad - 36, s.y + 168);
        ctx.fillStyle = C.accent;
        rr(ctx, W - pad - 186, s.y + 186, 150, 36, 10);
        ctx.fill();
        ctx.fillStyle = C.ink;
        ctx.textAlign = "center";
        ctx.font = `800 17px ${FONT}`;
        ctx.fillText("ابدأ الآن", W - pad - 111, s.y + 210);
        // the hero's abstract art: blocks, no implied subject
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = C.bg;
        rr(ctx, pad + 40, s.y + 30, 300, 150, 16);
        ctx.fill();
        ctx.fillStyle = C.accent;
        ctx.globalAlpha = 0.45;
        rr(ctx, pad + 160, s.y + 50, 160, 70, 14);
        ctx.fill();
        ctx.globalAlpha = 0.3;
        rr(ctx, pad + 24, s.y + 110, 200, 100, 14);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 2: {
        const cw = (W - pad * 2 - 3 * 18) / 4;
        for (let j = 0; j < 4; j++) {
          const x = W - pad - cw - j * (cw + 18);
          ctx.fillStyle = C.accent;
          ctx.beginPath();
          ctx.arc(x + cw - 20, s.y + 30, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.textAlign = "right";
          ctx.fillStyle = C.text;
          ctx.font = `800 18px ${FONT}`;
          ctx.fillText(["ميزة أولى", "ميزة ثانية", "ميزة ثالثة", "ميزة رابعة"][j]!, x + cw - 44, s.y + 26);
          ctx.fillStyle = C.muted;
          ctx.font = `500 15px ${FONT}`;
          ctx.fillText("وصف قصير للميزة", x + cw - 44, s.y + 50);
        }
        break;
      }
      case 3: {
        ctx.textAlign = "center";
        ctx.fillStyle = C.text;
        ctx.font = `800 22px ${FONT}`;
        ctx.fillText("خدماتنا", W / 2, s.y + 20);
        const cw = (W - pad * 2 - 5 * 14) / 6;
        for (let j = 0; j < 6; j++) {
          const x = W - pad - cw - j * (cw + 14);
          ctx.fillStyle = C.surface;
          rr(ctx, x, s.y + 36, cw, 88, 12);
          ctx.fill();
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = C.accent;
          rr(ctx, x + cw / 2 - 12, s.y + 52, 24, 24, 6);
          ctx.fill();
          ctx.fillStyle = C.text;
          ctx.font = `600 15px ${FONT}`;
          ctx.fillText(`خدمة ${["أولى", "ثانية", "ثالثة", "رابعة", "خامسة", "سادسة"][j]}`, x + cw / 2, s.y + 108);
        }
        break;
      }
      case 4: {
        ctx.fillStyle = C.surface;
        rr(ctx, pad, s.y, W - pad * 2, s.h, 12);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillStyle = C.text;
        ctx.font = `800 17px ${FONT}`;
        ctx.fillText("اسم مشروعك", W - pad - 20, s.y + 29);
        ctx.textAlign = "left";
        ctx.fillStyle = C.muted;
        ctx.font = `500 15px ${FONT}`;
        ctx.fillText("روابط سريعة · تواصل معنا", pad + 20, s.y + 29);
        break;
      }
    }
  });
}

export function productScreenTexture(model: ModelId, build: number, pal: ScenePalette, scale = 1) {
  const { c } = canvas(SCREEN.w * scale, SCREEN.h * scale);
  drawProductScreen(c, model, build, pal);
  return { canvas: c, texture: texture(c) };
}

/* ── labels ── */

/** A station's label: its number and name, on a dark glass plate with a fine edge. */
export function stationLabel(num: number, name: string, pal: ScenePalette) {
  const { c, ctx } = canvas(640, 200);
  const k = pal.css;
  ctx.fillStyle = k.bg;
  ctx.globalAlpha = 0.86;
  rr(ctx, 6, 6, 628, 188, 26);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = k.neon;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.fillStyle = k.text;
  ctx.font = `800 66px ${FONT}`;
  ctx.fillText(name, 320, 100);
  ctx.fillStyle = k.neon;
  ctx.font = `800 46px ${FONT}`;
  ctx.fillText(String(num).padStart(2, "0"), 320, 164);
  return texture(c);
}

/** A station's icon (the same line icons as the rest of the site), lit, for its glass block. */
export function iconTexture(name: IconName, pal: ScenePalette) {
  const { c, ctx } = canvas(256, 256);
  ctx.translate(28, 28);
  ctx.scale(200 / 24, 200 / 24);
  ctx.strokeStyle = pal.css.neon;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = pal.css.neon;
  ctx.shadowBlur = 2;
  ctx.stroke(new Path2D(ICON_PATHS[name]));
  return texture(c);
}

/** The factory's sign, far back: the name, in the main light. */
export function signTexture(pal: ScenePalette) {
  const { c, ctx } = canvas(1024, 300);
  ctx.textAlign = "center";
  ctx.fillStyle = pal.css.neon;
  ctx.font = `800 200px ${FONT}`;
  ctx.fillText("تشفير", 512, 220);
  return texture(c);
}

/** A one-sided glow: bright at one edge of a strip (v = 0, or v = 1 when `flip`), gone at the other — light at a foot. */
export function fadeTexture(pal: ScenePalette, flip = false) {
  const { c, ctx } = canvas(4, 256);
  const g = ctx.createLinearGradient(0, flip ? 256 : 0, 0, flip ? 0 : 256);
  g.addColorStop(0, pal.css.neon);
  g.addColorStop(0.35, pal.css.emerald);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  return texture(c);
}

/* ── the sample station's and the product case's details (the reference image) ── */

/**
 * The belt's running surface: a dark perforated metal plate, tiled along the line. Used as the colour map and as the
 * bump map (the holes read as holes).
 */
export function perforatedTexture(pal: ScenePalette) {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = pal.css.glassBase;
  ctx.fillRect(0, 0, 256, 256);
  const step = 16;
  for (let y = step / 2; y < 256; y += step)
    for (let x = (y / step) % 2 ? step : step / 2; x < 256; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = pal.css.bg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - 0.8, y - 0.8, 4.2, Math.PI * 0.9, Math.PI * 1.6);
      ctx.strokeStyle = pal.css.muted;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  const t = texture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** A floating name tag: dark glass, a fine bright edge, the name. */
export function tagTexture(text: string, pal: ScenePalette) {
  const { c, ctx } = canvas(720, 180);
  ctx.fillStyle = pal.css.bg;
  ctx.globalAlpha = 0.78;
  rr(ctx, 6, 6, 708, 168, 30);
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = pal.css.text;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.fillStyle = pal.css.text;
  ctx.font = `700 76px ${FONT}`;
  ctx.fillText(text, 360, 116);
  return texture(c);
}

/** The ⊕ badge on a glass case's corner. */
export function plusTexture(pal: ScenePalette) {
  const { c, ctx } = canvas(256, 256);
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.fillStyle = pal.css.bg;
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = pal.css.neon;
  ctx.stroke();
  ctx.lineCap = "round";
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(128, 74);
  ctx.lineTo(128, 182);
  ctx.moveTo(74, 128);
  ctx.lineTo(182, 128);
  ctx.strokeStyle = pal.css.text;
  ctx.stroke();
  return texture(c);
}

/** The number plate on a base's front: «01 —». */
export function numberTexture(num: number, pal: ScenePalette) {
  const { c, ctx } = canvas(400, 140);
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = pal.css.text;
  ctx.font = `800 96px ${FONT}`;
  ctx.fillText(String(num).padStart(2, "0"), 20, 106);
  ctx.fillRect(170, 64, 64, 9);
  return texture(c);
}

/** The small screen inside the sample station's case: the project's structure being set up. */
export function setupPanelTexture(pal: ScenePalette) {
  const { c, ctx } = canvas(512, 640);
  const k = pal.css;
  ctx.fillStyle = k.bg;
  ctx.globalAlpha = 0.8;
  rr(ctx, 8, 8, 496, 624, 28);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = k.neon;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.textAlign = "right";
  ctx.fillStyle = k.neon;
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText("هيكل المشروع", 470, 84);
  const rows = ["الصفحات", "المكوّنات", "الإعدادات", "الهوية"];
  rows.forEach((r, i) => {
    const y = 170 + i * 108;
    ctx.fillStyle = k.text;
    ctx.font = `600 34px ${FONT}`;
    ctx.fillText(r, 470, y);
    ctx.fillStyle = k.emerald;
    rr(ctx, 48, y - 28, 200, 14, 7);
    ctx.fill();
    ctx.fillStyle = k.neon;
    rr(ctx, 48, y - 28, 200 * (1 - i * 0.22), 14, 7);
    ctx.fill();
  });
  return texture(c);
}
