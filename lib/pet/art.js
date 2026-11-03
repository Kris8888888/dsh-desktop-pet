import { drawPet, drawParticles, mapPose, headTop, PERCH_EDGE, GROUND } from "./sprite.js";
/**
 * Pixel-art renderer for the two DSH desktop pets.
 *
 * Everything is drawn into a 190x150 low-resolution buffer and then blitted
 * to the 380x300 canvas with smoothing disabled. That keeps the chunky pixel
 * look while paying for only a quarter of the pixels.
 */

const BUF_W = 190;
const BUF_H = 150;

export const CHARACTERS = {
  whale: {
    name: "小鲸鱼",
    full: "DeepSeek 的小鲸鱼",
    body: "#5B7CFF",
    bodyDeep: "#3E5BDB",
    bodyLight: "#8FA7FF",
    belly: "#E8EEFF",
    fin: "#4665E8",
    blush: "#FF9FB2",
    ink: "#141C3A",
    accent: "#4DC3FF",
  },
  crab: {
    name: "小螃蟹",
    full: "Claude Code 的橙色小螃蟹",
    body: "#FF8A4C",
    bodyDeep: "#E5662E",
    bodyLight: "#FFB27A",
    belly: "#FFE2C6",
    fin: "#F2743A",
    blush: "#FF7E93",
    ink: "#3A1C14",
    accent: "#FFD166",
  },
};

const INK = "#1E2230";

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

function ellipse(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  const x0 = Math.round(cx - rx);
  const y0 = Math.round(cy - ry);
  for (let y = 0; y <= Math.round(ry * 2); y++) {
    const dy = y - ry;
    const ratio = 1 - (dy * dy) / (ry * ry);
    if (ratio <= 0) continue;
    const span = Math.floor(rx * Math.sqrt(ratio));
    ctx.fillRect(x0 + Math.round(rx - span), y0 + y, Math.max(1, span * 2), 1);
  }
}

function ellipseTop(ctx, cx, cy, rx, ry, color, fraction = 0.55) {
  ctx.fillStyle = color;
  const rows = Math.round(ry * 2 * fraction);
  for (let y = 0; y <= rows; y++) {
    const dy = y - ry;
    const ratio = 1 - (dy * dy) / (ry * ry);
    if (ratio <= 0) continue;
    const span = Math.floor(rx * Math.sqrt(ratio));
    ctx.fillRect(Math.round(cx - span), Math.round(cy - ry + y), Math.max(1, span * 2), 1);
  }
}

function roundRect(ctx, x, y, w, h, r, color) {
  px(ctx, x + r, y, w - r * 2, h, color);
  px(ctx, x, y + r, r, h - r * 2, color);
  px(ctx, x + w - r, y + r, r, h - r * 2, color);
  ellipse(ctx, x + r, y + r, r, r, color);
  ellipse(ctx, x + w - r, y + r, r, r, color);
  ellipse(ctx, x + r, y + h - r, r, r, color);
  ellipse(ctx, x + w - r, y + h - r, r, r, color);
}

function line(ctx, x0, y0, x1, y1, color, width = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  let guard = 0;
  while (guard++ < 400) {
    px(ctx, x, y, width, width, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

function arcEyes(ctx, cx, cy, spread, color, flip = false) {
  // Two happy closed-eye arcs: ^ ^
  for (const dir of [-1, 1]) {
    const ex = cx + dir * spread;
    px(ctx, ex - 4, cy + 1, 3, 2, color);
    px(ctx, ex - 1, cy - 1, 2, 2, color);
    px(ctx, ex + 1, cy + 1, 3, 2, color);
  }
}

function xEyes(ctx, cx, cy, spread, color) {
  for (const dir of [-1, 1]) {
    const ex = cx + dir * spread;
    for (let i = -2; i <= 2; i++) {
      px(ctx, ex + i, cy + i, 1, 1, color);
      px(ctx, ex + i, cy - i, 1, 1, color);
    }
  }
}

function openEyes(ctx, cx, cy, spread, lookX, lookY, palette, pose) {
  const wide = pose === "poke" || pose === "drag";
  const eyeW = wide ? 4.5 : 4;
  const eyeH = wide ? 5.5 : 4.5;
  for (const dir of [-1, 1]) {
    const ex = cx + dir * spread;
    ellipse(ctx, ex, cy, eyeW + 1.2, eyeH + 1.2, palette.ink);
    ellipse(ctx, ex, cy, eyeW, eyeH, "#FFFFFF");
    const pupilX = ex + clamp(lookX, -1.6, 1.6);
    const pupilY = cy + clamp(lookY, -1.4, 1.6);
    ellipse(ctx, pupilX, pupilY, 2.1, 2.6, "#20243A");
    px(ctx, Math.round(pupilX - 1), Math.round(pupilY - 1.5), 1, 1, "#FFFFFF");
  }
}

function blush(ctx, cx, cy, spread, color) {
  px(ctx, cx - spread - 6, cy, 4, 2, color);
  px(ctx, cx + spread + 2, cy, 4, 2, color);
}

function drawHeart(ctx, x, y, s, color, alpha = 1) {
  const rows = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];
  ctx.globalAlpha = alpha;
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < rows[row].length; col++) {
      if (rows[row][col] === "1") px(ctx, x + (col - 3) * s, y + row * s, s, s, color);
    }
  }
  ctx.globalAlpha = 1;
}

function drawStar(ctx, x, y, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  px(ctx, x, y - 2, 2, 6, color);
  px(ctx, x - 2, y, 6, 2, color);
  ctx.globalAlpha = 1;
}

function drawZzz(ctx, x, y, t) {
  const bob = Math.sin(t * 2) * 1.5;
  for (let i = 0; i < 3; i++) {
    const alpha = 0.35 + (Math.sin(t * 2 + i * 0.8) + 1) * 0.22;
    ctx.globalAlpha = alpha;
    const zx = x + i * 6;
    const zy = y - i * 7 + bob;
    const size = 5 - i;
    px(ctx, zx, zy, size, 1, "#4E68C8");
    line(ctx, zx + size - 1, zy + 1, zx, zy + size - 1, "#4E68C8", 1);
    px(ctx, zx, zy + size - 1, size, 1, "#4E68C8");
  }
  ctx.globalAlpha = 1;
}

function drawSweat(ctx, x, y, t) {
  const drop = (Math.sin(t * 5) + 1) * 0.5;
  ctx.globalAlpha = 0.85;
  px(ctx, x, y, 2, 3, "#8FD8FF");
  px(ctx, x - 1, y + 2, 4, 3, "#8FD8FF");
  px(ctx, x, y + 4, 2, 1, "#5BB8EA");
  px(ctx, x + 1, y + 3, 1, 1, "#DCF5FF");
  ctx.globalAlpha = 1;
}

function drawSteam(ctx, cx, cy, t, color = "#FFD1C4") {
  for (const dir of [-1, 1]) {
    const puff = (t * 18 + (dir === 1 ? 4 : 0)) % 14;
    const alpha = 1 - puff / 14;
    ctx.globalAlpha = Math.max(0, alpha) * 0.8;
    ellipse(ctx, cx + dir * (26 + puff), cy - 34 - puff * 0.8, 3 + puff * 0.2, 2 + puff * 0.12, color);
  }
  ctx.globalAlpha = 1;
}

function drawKeyboard(ctx, cx, y, t, palette) {
  const w = 36;
  px(ctx, cx - w / 2 - 1, y - 1, w + 2, 9, palette.ink);
  px(ctx, cx - w / 2, y, w, 7, "#E8ECF5");
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 8; i++) {
      const lit = Math.sin(t * 12 + i * 1.7 + row) > 0.7;
      px(ctx, cx - w / 2 + 3 + i * 4, y + 2 + row * 3, 3, 2, lit ? palette.accent : "#B8C0D4");
    }
  }
}

function drawClawsOnEdge(ctx, cx, y, palette, t) {
  // Two rounded flippers resting on the app window's top edge. Almost the whole
  // flipper stays above the edge; only a 2px fingertip dips into the window so
  // it reads as "holding on" instead of a mushroom growing out of the titlebar.
  const tap = Math.round((Math.sin(t * 3.4) + 1) * 0.5);
  for (const dir of [-1, 1]) {
    const x = cx + dir * 29;
    ellipse(ctx, x, y - 5, 7, 6, palette.ink);
    ellipse(ctx, x, y - 5, 5.6, 4.6, palette.body);
    ellipseTop(ctx, x, y - 7, 4.2, 2.2, palette.bodyLight, 0.75);
    // Two soft knuckles on top.
    px(ctx, x - 4, y - 10, 3, 2, palette.ink);
    px(ctx, x + 1, y - 10, 3, 2, palette.ink);
    px(ctx, x - 3.6, y - 10, 2.2, 1.2, palette.bodyLight);
    px(ctx, x + 1.4, y - 10, 2.2, 1.2, palette.bodyLight);
    // Fingertip just over the edge.
    px(ctx, x - 2, y + tap, 4, 2, palette.ink);
    px(ctx, x - 1.2, y + tap, 2.4, 1.2, palette.bodyDeep);
  }
}


function drawWaitBadge(ctx, x, y, p) {
  ellipse(ctx, x, y, 9, 9, p.ink);
  ellipse(ctx, x, y, 7.5, 7.5, "#FFE08A");
  // A chunky pixel question mark.
  px(ctx, x - 3, y - 4, 6, 2, p.ink);
  px(ctx, x + 2, y - 3, 2, 3, p.ink);
  px(ctx, x, y, 2, 2, p.ink);
  px(ctx, x, y + 3, 2, 2, p.ink);
}

function drawWhaleTail(ctx, cx, cy, t, p) {
  const wag = Math.sin(t * 2.4) * 2;
  // Stem.
  line(ctx, cx + 30, cy + 12, cx + 50, cy + 14, p.ink, 10);
  line(ctx, cx + 30, cy + 12, cx + 50, cy + 14, p.bodyDeep, 6);
  // V-shaped flukes.
  line(ctx, cx + 49, cy + 13, cx + 67, cy + 3 + wag, p.ink, 10);
  line(ctx, cx + 49, cy + 13, cx + 67, cy + 3 + wag, p.bodyDeep, 6);
  line(ctx, cx + 49, cy + 14, cx + 66, cy + 27 + wag, p.ink, 10);
  line(ctx, cx + 49, cy + 14, cx + 66, cy + 27 + wag, p.bodyDeep, 6);
  px(ctx, cx + 58, cy + 13 + wag, 2, 2, p.bodyLight);
}

function drawWhaleFin(ctx, x, y, dir, p) {
  ellipse(ctx, x, y, 8, 13, p.ink);
  ellipse(ctx, x, y, 6, 11, p.fin);
  ellipseTop(ctx, x - dir, y - 2, 4, 6, p.bodyLight, 0.45);
}

function whaleMouth(ctx, cx, y, pose, t, p) {
  if (pose === "happy" || pose === "petted" || pose === "celebrate") {
    ellipse(ctx, cx, y + 1, 4.5, 3.2, p.ink);
    ellipse(ctx, cx, y + 3, 2, 1, "#FF9FB2");
  } else if (pose === "eat") {
    const open = Math.sin(t * 13) > 0;
    ellipse(ctx, cx, y + 1, open ? 4.2 : 2.2, open ? 3.2 : 1.4, p.ink);
    if (open) ellipse(ctx, cx, y + 3, 2, 1, "#FF9FB2");
  } else if (pose === "poke" || pose === "drag" || pose === "wait") {
    ellipse(ctx, cx, y + 1, 2.3, 2.6, p.ink);
  } else if (pose === "angry") {
    line(ctx, cx - 4, y + 2, cx - 1, y, p.ink, 1);
    line(ctx, cx - 1, y, cx + 1, y + 2, p.ink, 1);
    line(ctx, cx + 1, y + 2, cx + 4, y, p.ink, 1);
  } else if (pose === "sick" || pose === "hungry") {
    line(ctx, cx - 4, y, cx - 2, y + 2, p.ink, 1);
    line(ctx, cx - 2, y + 2, cx, y, p.ink, 1);
    line(ctx, cx, y, cx + 2, y + 2, p.ink, 1);
    line(ctx, cx + 2, y + 2, cx + 4, y, p.ink, 1);
  } else if (pose === "sleep") {
    px(ctx, cx - 2, y + 1, 4, 1, p.ink);
  } else {
    line(ctx, cx - 5, y, cx - 2, y + 2, p.ink, 1);
    line(ctx, cx - 2, y + 2, cx + 2, y + 2, p.ink, 1);
    line(ctx, cx + 2, y + 2, cx + 5, y, p.ink, 1);
  }
}

function drawWhale(ctx, view) {
  const { t, pose, lookX, lookY, mode, clipIn } = view;
  const p = CHARACTERS.whale;
  const bob = pose === "sleep" ? Math.sin(t * 1.1) * 1.2 : Math.sin(t * 2.1) * 1.1;
  const shake = pose === "angry" ? Math.sin(t * 46) * 1.4 : 0;
  const hop = pose === "celebrate" ? -Math.abs(Math.sin(t * 7)) * 11 : 0;
  const squish = pose === "poke" ? 0.94 : 1;
  const cx = 95 + shake;
  const cy = 92 + bob + hop;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, BUF_W, clipIn);
  ctx.clip();

  if (mode === "desk") {
    ctx.globalAlpha = 0.2;
    ellipse(ctx, 95, 140, 39, 5, "#0C1228");
    ctx.globalAlpha = 1;
  }

  if (mode === "desk") drawWhaleTail(ctx, cx, cy, t, p);

  // Side fins sit behind the body.
  drawWhaleFin(ctx, cx - 43, cy + 11, -1, p);
  drawWhaleFin(ctx, cx + 43, cy + 11, 1, p);

  // Body.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pose === "poke" ? 1.03 : 1, squish);
  ctx.translate(-cx, -cy);
  ellipse(ctx, cx, cy, 45, 37, p.ink);
  ellipse(ctx, cx, cy, 43, 35, p.body);
  // Small head spots.
  px(ctx, cx - 20, cy - 24, 3, 2, p.bodyLight);
  px(ctx, cx + 14, cy - 28, 2, 2, p.bodyLight);
  px(ctx, cx + 22, cy - 21, 2, 2, p.bodyLight);
  // Belly.
  ellipse(ctx, cx, cy + 19, 22, 12, p.belly);
  line(ctx, cx - 9, cy + 19, cx + 9, cy + 19, "#D9E2FA", 1);
  line(ctx, cx - 6, cy + 23, cx + 6, cy + 23, "#D9E2FA", 1);

  if (pose === "sick") {
    ctx.globalAlpha = 0.16;
    ellipse(ctx, cx, cy - 2, 42, 34, "#7FE0B2");
    ctx.globalAlpha = 1;
  }

  const faceY = cy - 16;
  const spread = 17;
  if (pose === "sleep" || pose === "happy" || pose === "petted" || pose === "celebrate") {
    arcEyes(ctx, cx, faceY, spread, p.ink);
  } else if (pose === "sick") {
    xEyes(ctx, cx, faceY, spread, p.ink);
  } else if (pose === "blink") {
    for (const dir of [-1, 1]) px(ctx, cx + dir * spread - 5, faceY + 1, 10, 2, p.ink);
  } else if (pose === "hungry") {
    for (const dir of [-1, 1]) {
      ellipse(ctx, cx + dir * spread, faceY, 5, 4.5, "#FFFFFF");
      ellipse(ctx, cx + dir * spread, faceY + 1, 2.6, 2.4, "#20243A");
      px(ctx, cx + dir * spread - 1, faceY - 1, 1, 1, "#FFFFFF");
      line(ctx, cx + dir * spread - 5, faceY - 5, cx + dir * spread + 2, faceY - 4, p.ink, 1);
    }
  } else {
    openEyes(ctx, cx, faceY, spread, lookX, lookY, p, pose);
  }

  if (pose === "angry" || pose === "sweat") {
    for (const dir of [-1, 1]) {
      const bx = cx + dir * spread;
      line(ctx, bx - dir * 5, faceY - 9, bx + dir * 4, faceY - 6 + (pose === "sweat" ? 1 : 0), p.ink, 2);
    }
  }

  whaleMouth(ctx, cx, faceY + (mode === "perch" ? 10 : 12), pose, t, p);
  blush(ctx, cx, faceY + 8, 25, p.blush);

  // Blowhole and spout.
  px(ctx, cx - 2, cy - 35, 5, 2, p.ink);
  if (pose !== "sleep" && pose !== "sick") {
    const spout = Math.sin(t * 3) * 2;
    ctx.globalAlpha = 0.8;
    ellipse(ctx, cx + spout, cy - 42, 2, 3, "#BFE6FF");
    ellipse(ctx, cx - 5 + spout, cy - 46, 1.6, 2, "#DCF3FF");
    ellipse(ctx, cx + 5 + spout, cy - 47, 1.6, 2, "#DCF3FF");
    ctx.globalAlpha = 1;
  }

  if (pose === "wait") drawWaitBadge(ctx, cx + 38, cy - 33, p);
  if (pose === "drag") {
    for (const dir of [-1, 1]) {
      line(ctx, cx + dir * 44, cy - 2, cx + dir * 54, cy - 10, p.ink, 3);
      line(ctx, cx + dir * 47, cy + 6, cx + dir * 56, cy + 1, p.ink, 2);
    }
  }

  // Something to chew on.
  if (pose === "eat") {
    // A little "token" biscuit at the mouth, with a bite taken out of it.
    ellipse(ctx, cx + 11, cy + 2, 6, 5, p.ink);
    ellipse(ctx, cx + 11, cy + 2, 4.6, 3.8, "#F4C25E");
    px(ctx, cx + 15, cy, 3, 4, p.body);
    px(ctx, cx + 9, cy + 1, 2, 2, "#8A5A2A");
    px(ctx, cx + 12, cy + 4, 1, 1, "#FFF0C8");
  }
  if (pose === "type" && mode === "desk") {
    drawKeyboard(ctx, cx, cy + 28, t, p);
    const tap = Math.round((Math.sin(t * 9) + 1) * 0.5);
    ellipse(ctx, cx - 19, cy + 24 - tap, 6, 4, p.ink);
    ellipse(ctx, cx - 19, cy + 24 - tap, 4.5, 2.5, p.bodyLight);
    ellipse(ctx, cx + 19, cy + 24 + tap, 6, 4, p.ink);
    ellipse(ctx, cx + 19, cy + 24 + tap, 4.5, 2.5, p.bodyLight);
  }
  if (mode === "perch") drawClawsOnEdge(ctx, cx, clipIn - 3, p, t);

  ctx.restore();
}

function crabEyes(ctx, cx, cy, pose, lookX, lookY, p, t) {
  const eyes = [[-20, -47], [20, -47]];
  for (let i = 0; i < 2; i++) {
    const [dx, dy] = eyes[i];
    const ex = cx + dx;
    const ey = cy + dy - (pose === "sick" ? 2 : 0);
    px(ctx, ex - 1, ey + 5, 2, 6, p.ink);
    if (pose === "sleep" || pose === "petted" || pose === "happy" || pose === "celebrate") {
      // Closed, content eyes.
      px(ctx, ex - 4, ey + 1, 3, 2, p.ink);
      px(ctx, ex - 1, ey - 1, 2, 2, p.ink);
      px(ctx, ex + 1, ey + 1, 3, 2, p.ink);
      continue;
    }
    if (pose === "blink") {
      px(ctx, ex - 5, ey - 1, 10, 2, p.ink);
      px(ctx, ex - 1, ey + 1, 2, 4, p.ink);
      continue;
    }
    if (pose === "sick") {
      for (let k = -2; k <= 2; k++) {
        px(ctx, ex + k, ey + k, 1, 1, p.ink);
        px(ctx, ex + k, ey - k, 1, 1, p.ink);
      }
      continue;
    }
    ellipse(ctx, ex, ey, 7.5, 8, p.ink);
    ellipse(ctx, ex, ey, 6.5, 7, "#FFFFFF");
    const pxo = clamp(lookX, -2, 2);
    const pyo = clamp(lookY, -2, 2);
    ellipse(ctx, ex + pxo, ey + pyo, 3, 3.5, "#20120E");
    px(ctx, ex + pxo - 1, ey + pyo - 2, 1, 1, "#FFFFFF");
    if (pose === "angry" || pose === "sweat") {
      line(ctx, ex - 6, ey - 10, ex + 4, ey - 7, p.ink, 2);
    }
  }
}

function crabMouth(ctx, cx, y, pose, t, p) {
  if (pose === "happy" || pose === "petted" || pose === "celebrate") {
    line(ctx, cx - 5, y - 1, cx - 2, y + 2, p.ink, 2);
    line(ctx, cx - 2, y + 2, cx + 2, y + 2, p.ink, 2);
    line(ctx, cx + 2, y + 2, cx + 5, y - 1, p.ink, 2);
    px(ctx, cx - 1, y + 3, 2, 1, "#FF9FB2");
  } else if (pose === "eat") {
    const open = Math.sin(t * 13) > 0;
    ellipse(ctx, cx, y + 1, open ? 4 : 2, open ? 3 : 1.4, p.ink);
  } else if (pose === "hungry" || pose === "sick") {
    line(ctx, cx - 4, y, cx - 2, y + 2, p.ink, 1);
    line(ctx, cx - 2, y + 2, cx, y, p.ink, 1);
    line(ctx, cx, y, cx + 2, y + 2, p.ink, 1);
    line(ctx, cx + 2, y + 2, cx + 4, y, p.ink, 1);
  } else if (pose === "angry") {
    px(ctx, cx - 3, y + 2, 7, 2, p.ink);
  } else if (pose === "poke" || pose === "drag" || pose === "wait") {
    ellipse(ctx, cx, y + 1, 2, 2.4, p.ink);
  } else if (pose === "sleep") {
    px(ctx, cx - 2, y + 1, 4, 1, p.ink);
  } else {
    line(ctx, cx - 4, y, cx - 1, y + 2, p.ink, 1);
    line(ctx, cx - 1, y + 2, cx + 1, y + 2, p.ink, 1);
    line(ctx, cx + 1, y + 2, cx + 4, y, p.ink, 1);
  }
}

function drawCrabLegs(ctx, cx, cy, t, p) {
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const baseX = cx + dir * (20 + i * 4);
      const baseY = cy + 17 + i * 3;
      const kneeX = baseX + dir * (8 + i * 2);
      const kneeY = baseY + 7;
      const footX = kneeX + dir * (4 + i * 2);
      const footY = kneeY + 6 + Math.sin(t * 5 + i) * 1.2;
      line(ctx, baseX, baseY, kneeX, kneeY, p.ink, 4);
      line(ctx, kneeX, kneeY, footX, footY, p.ink, 3);
      line(ctx, baseX, baseY, kneeX, kneeY, p.bodyDeep, 2);
      line(ctx, kneeX, kneeY, footX, footY, p.body, 1);
      px(ctx, footX - 1, footY, 3, 2, p.ink);
    }
  }
}

function drawCrabClaw(ctx, cx, cy, dir, pose, t, p, mode) {
  const pinch = pose === "angry" || pose === "celebrate" ? 2.5 : Math.sin(t * 2.2 + (dir > 0 ? 1.4 : 0)) * 1.2;
  const typing = pose === "type" && mode === "desk";
  const wx = cx + dir * (typing ? 31 : 48);
  const wy = mode === "perch" ? cy - 17 : typing ? cy + 27 : cy - 8;
  // Arm from shell to claw.
  line(ctx, cx + dir * 28, cy + 6, wx - dir * 7, wy + 3, p.ink, 5);
  line(ctx, cx + dir * 28, cy + 6, wx - dir * 7, wy + 3, p.bodyDeep, 3);
  // Palm.
  ellipse(ctx, wx, wy, 13, 11, p.ink);
  ellipse(ctx, wx, wy, 11, 9, p.body);
  ellipseTop(ctx, wx, wy - 2, 8, 5, p.bodyLight, 0.5);
  // Two pincer fingers opening outward, with a V-shaped gap.
  line(ctx, wx + dir * 2, wy - 2, wx + dir * 13, wy - 7 - pinch, p.ink, 10);
  line(ctx, wx + dir * 2, wy - 2, wx + dir * 13, wy - 7 - pinch, p.body, 7);
  line(ctx, wx + dir * 2, wy + 3, wx + dir * 13, wy + 8 + pinch, p.ink, 10);
  line(ctx, wx + dir * 2, wy + 3, wx + dir * 13, wy + 8 + pinch, p.body, 7);
  line(ctx, wx + dir * 4, wy + 1, wx + dir * 10, wy + 1, "#6E2B16", 2);
  px(ctx, wx + dir * 12, wy - 9 - pinch, 2, 2, p.bodyLight);
  px(ctx, wx + dir * 12, wy + 10 + pinch, 2, 2, p.bodyLight);
}

function drawCrab(ctx, view) {
  const { t, pose, lookX, lookY, mode, clipIn } = view;
  const p = CHARACTERS.crab;
  const bob = pose === "sleep" ? Math.sin(t * 1.1) : Math.sin(t * 2.3);
  const shake = pose === "angry" ? Math.sin(t * 50) * 1.4 : 0;
  const hop = pose === "celebrate" ? -Math.abs(Math.sin(t * 7)) * 10 : 0;
  const cx = 95 + shake;
  const cy = 98 + bob + hop;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, BUF_W, clipIn);
  ctx.clip();

  if (mode === "desk") {
    ctx.globalAlpha = 0.2;
    ellipse(ctx, 95, 142, 38, 4.5, "#2A160E");
    ctx.globalAlpha = 1;
  }

  if (mode === "desk") drawCrabLegs(ctx, cx, cy, t, p);

  // Claws behind the shell.
  drawCrabClaw(ctx, cx, cy, -1, pose, t, p, mode);
  drawCrabClaw(ctx, cx, cy, 1, pose, t, p, mode);

  // Shell.
  ellipse(ctx, cx, cy, 35, 28, p.ink);
  ellipse(ctx, cx, cy, 33, 26, p.body);
  ctx.globalAlpha = 0.5;
  ellipse(ctx, cx - 12, cy - 14, 14, 6, p.bodyLight);
  ctx.globalAlpha = 1;
  // Shell spikes.
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const sx = cx + dir * 32;
      const sy = cy - 10 + i * 9;
      line(ctx, sx, sy, sx + dir * 6, sy - 1, p.ink, 3);
      line(ctx, sx, sy, sx + dir * 5, sy - 1, p.bodyDeep, 1);
    }
  }
  // Shell top highlights.
  ctx.globalAlpha = 0.5;
  px(ctx, cx - 18, cy - 20, 8, 2, p.bodyLight);
  px(ctx, cx + 6, cy - 23, 10, 2, p.bodyLight);
  ctx.globalAlpha = 1;
  // Shell texture.
  for (const [dx, dy] of [[-16, -10], [12, -14], [-7, -18], [19, 1], [-22, 1]]) {
    px(ctx, cx + dx, cy + dy, 2, 2, p.bodyDeep);
  }
  // Belly.
  ellipse(ctx, cx, cy + 15, 22, 12, p.belly);
  ellipseTop(ctx, cx, cy + 11, 20, 7, "#FFF1E2", 0.6);

  if (pose === "sick") {
    ctx.globalAlpha = 0.16;
    ellipse(ctx, cx, cy - 1, 33, 26, "#7FE0B2");
    ctx.globalAlpha = 1;
  }

  // Eye stalks.
  for (const dir of [-1, 1]) {
    const sx = cx + dir * 14;
    const ex = cx + dir * 20;
    line(ctx, sx, cy - 20, ex, cy - 42, p.ink, 4);
    line(ctx, sx, cy - 20, ex, cy - 42, p.bodyDeep, 2);
  }
  crabEyes(ctx, cx, cy, pose, lookX, lookY, p, t);
  crabMouth(ctx, cx, cy - (mode === "perch" ? 16 : 14), pose, t, p);
  for (const dir of [-1, 1]) px(ctx, cx + dir * 24, cy - (mode === "perch" ? 18 : 10), 4, 2, p.blush);

  if (pose === "eat") {
    ellipse(ctx, cx + 12, cy - 2, 5.5, 4.5, p.ink);
    ellipse(ctx, cx + 12, cy - 2, 4.2, 3.4, "#F4C25E");
    px(ctx, cx + 15, cy - 3, 2, 3, p.body);
    px(ctx, cx + 10, cy - 3, 1, 1, "#8A5A2A");
  }

  if (pose === "type" && mode === "desk") {
    drawKeyboard(ctx, cx, cy + 30, t, p);
  }
  if (pose === "wait") drawWaitBadge(ctx, cx + 34, cy - 57, p);
  if (pose === "drag") {
    for (const dir of [-1, 1]) {
      line(ctx, cx + dir * 42, cy - 4, cx + dir * 54, cy - 12, p.ink, 3);
    }
  }

  ctx.restore();
}

function drawEffects(ctx, view) {
  const { t, pose, particles, mode, clipIn, character } = view;
  const p = CHARACTERS[character];

  if (pose === "angry") drawSteam(ctx, 95, 100, t, "#FFD1C4");
  if (pose === "sweat" || pose === "sick") drawSweat(ctx, 130, 55, t);
  if (pose === "sleep") drawZzz(ctx, 124, 62, t);

  for (const particle of particles) {
    if (particle.y > clipIn + 6) continue;
    const life = particle.life / particle.maxLife;
    if (particle.kind === "heart") {
      drawHeart(ctx, particle.x, particle.y, 2, particle.color ?? "#FF7E93", Math.min(1, life * 2));
    } else if (particle.kind === "star") {
      drawStar(ctx, particle.x, particle.y, particle.color ?? "#FFE08A", Math.min(1, life * 2));
    } else if (particle.kind === "token") {
      ctx.globalAlpha = Math.min(1, life * 2);
      px(ctx, particle.x, particle.y, 3, 3, particle.color ?? "#FFD75E");
      px(ctx, particle.x + 1, particle.y + 1, 1, 1, "#FFF7D6");
      ctx.globalAlpha = 1;
    } else if (particle.kind === "confetti") {
      ctx.globalAlpha = Math.min(1, life * 2.2);
      px(ctx, particle.x, particle.y, 2, 3, particle.color);
      ctx.globalAlpha = 1;
    } else if (particle.kind === "crumb") {
      px(ctx, particle.x, particle.y, 2, 2, particle.color ?? "#D9A66A");
    } else if (particle.kind === "sweat") {
      drawSweat(ctx, particle.x, particle.y, t);
    } else if (particle.kind === "sparkle") {
      drawStar(ctx, particle.x, particle.y, particle.color ?? "#FFFFFF", Math.min(1, life * 1.6));
    }
  }

  // Little ground-level doodads while typing.
  if (pose === "type" && mode === "perch") {
    const glyphs = ["0", "1", "{", "}", ">", "_"];
    for (let i = 0; i < 3; i++) {
      const gx = 70 + ((t * 9 + i * 17) % 50);
      const gy = 60 - ((t * 7 + i * 11) % 18);
      ctx.globalAlpha = 0.32;
      px(ctx, gx, gy, 1, 1, p.accent);
      ctx.globalAlpha = 1;
    }
  }

  // Contact shadow at the window edge while perched: a short gradient that
  // lands on the app window underneath, grounding the pet.
  if (mode === "perch") {
    for (let i = 0; i < 8; i++) {
      const fade = 1 - i / 8;
      ctx.globalAlpha = 0.055 * fade * fade;
      const w = 92 - i * 7;
      px(ctx, 95 - w / 2, clipIn + i * 1.6, w, 2, "#000000");
    }
    ctx.globalAlpha = 1;
  }
}

/* ------------------------------------------------------------------ */
/* V2 character art: closer to the two original logos, more expressive. */
/* ------------------------------------------------------------------ */

function poly(ctx, points, color) {
  if (!points.length) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(Math.round(points[0][0]), Math.round(points[0][1]));
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(Math.round(points[i][0]), Math.round(points[i][1]));
  }
  ctx.closePath();
  ctx.fill();
}

function plate(ctx, x, y, w, h, r, ink, fill) {
  roundRect(ctx, x - 1, y - 1, w + 2, h + 2, r + 1, ink);
  roundRect(ctx, x, y, w, h, r, fill);
}

function whaleEyeV2(ctx, ex, ey, p, pose, lookX, lookY, wide, side) {
  if (pose === "sleep" || pose === "happy" || pose === "petted" || pose === "celebrate") {
    // Content closed eye: a soft upside-down U.
    px(ctx, ex - 4, ey + 1, 3, 1, p.ink);
    px(ctx, ex - 1, ey - 1, 2, 2, p.ink);
    px(ctx, ex + 1, ey + 1, 3, 1, p.ink);
    return;
  }
  if (pose === "blink") {
    px(ctx, ex - 5, ey, 10, 2, p.ink);
    return;
  }
  if (pose === "sick") {
    for (let i = -3; i <= 3; i++) {
      px(ctx, ex + i, ey + i, 1, 1, p.ink);
      px(ctx, ex + i, ey - i, 1, 1, p.ink);
    }
    return;
  }
  // The logo's eye is a white ring with a dark pearl. Two of them make the
  // whale read as a character instead of a side-profile mark.
  const w = wide ? 6.4 : 5.5;
  const h = wide ? 7.2 : 6.2;
  ellipse(ctx, ex, ey, w, h, p.ink);
  ellipse(ctx, ex, ey, w - 1.4, h - 1.4, "#FFFFFF");
  const pxo = clamp(lookX, -1.2, 1.2);
  const pyo = clamp(lookY, -1.1, 1.1);
  ellipse(ctx, ex + pxo, ey + pyo + 0.4, 2.1, 2.7, "#18213F");
  px(ctx, Math.round(ex + pxo - 1.2), Math.round(ey + pyo - 1.5), 1, 1, "#FFFFFF");
  // A tiny blue reflection ties the eye back to the body.
  px(ctx, Math.round(ex + pxo + 1.5), Math.round(ey + pyo + 1), 1, 1, "#8FA6FF");
  if (pose === "angry") {
    const outer = ex + side * 6;
    const inner = ex - side * 4;
    line(ctx, outer, ey - 8, inner, ey - 5, p.ink, 2);
    px(ctx, inner - 1, ey - 6, 2, 1, p.ink);
  } else if (pose === "hungry") {
    px(ctx, ex - 6, ey - 6, 12, 2, p.ink);
    px(ctx, ex - 5, ey - 5, 10, 1, p.body);
  } else if (pose === "sweat") {
    line(ctx, ex - 6, ey - 8, ex + 4, ey - 6, p.ink, 2);
  }
}

function whaleMouthV2(ctx, cx, y, pose, t, p) {
  if (pose === "happy" || pose === "petted" || pose === "celebrate") {
    line(ctx, cx - 6, y - 1, cx - 3, y + 2, p.ink, 2);
    line(ctx, cx - 3, y + 2, cx + 3, y + 2, p.ink, 2);
    line(ctx, cx + 3, y + 2, cx + 6, y - 1, p.ink, 2);
    px(ctx, cx - 1, y + 3, 3, 1, "#FF9FB2");
  } else if (pose === "eat") {
    const open = Math.sin(t * 13) > 0;
    ellipse(ctx, cx, y + 1, open ? 4.4 : 2.4, open ? 3.4 : 1.4, p.ink);
    if (open) ellipse(ctx, cx, y + 3.2, 2, 1, "#FF9FB2");
  } else if (pose === "angry") {
    line(ctx, cx - 5, y + 2, cx - 1, y, p.ink, 2);
    line(ctx, cx - 1, y, cx + 5, y + 2, p.ink, 2);
  } else if (pose === "sick" || pose === "hungry") {
    line(ctx, cx - 5, y, cx - 2, y + 2, p.ink, 1);
    line(ctx, cx - 2, y + 2, cx + 1, y, p.ink, 1);
    line(ctx, cx + 1, y, cx + 4, y + 2, p.ink, 1);
  } else if (pose === "sleep") {
    px(ctx, cx - 3, y + 1, 6, 1, p.ink);
  } else if (pose === "poke" || pose === "drag" || pose === "wait") {
    ellipse(ctx, cx, y + 1, 2.2, 2.6, p.ink);
  } else {
    line(ctx, cx - 6, y, cx - 3, y + 2, p.ink, 1);
    line(ctx, cx - 3, y + 2, cx + 3, y + 2, p.ink, 1);
    line(ctx, cx + 3, y + 2, cx + 6, y, p.ink, 1);
  }
}

function drawWhaleTailV2(ctx, cx, cy, t, p) {
  const wag = Math.sin(t * 2.2) * 2;
  // Stem.
  poly(ctx, [[cx + 33, cy + 3], [cx + 45, cy - 3], [cx + 54, cy - 1], [cx + 52, cy + 7], [cx + 42, cy + 10]], p.ink);
  poly(ctx, [[cx + 35, cy + 3], [cx + 45, cy], [cx + 51, cy + 1], [cx + 49, cy + 5], [cx + 42, cy + 8]], p.bodyDeep);
  // Outer fluke silhouette: upper lobe, a V notch at the middle, lower lobe.
  const outer = [
    [cx + 43, cy + 2], [cx + 51, cy - 5], [cx + 58, cy - 19 + wag], [cx + 69, cy - 20 + wag],
    [cx + 70, cy - 10 + wag], [cx + 61, cy - 1], [cx + 70, cy + 10 + wag],
    [cx + 67, cy + 18 + wag], [cx + 57, cy + 16 + wag], [cx + 49, cy + 5], [cx + 44, cy + 8],
  ];
  poly(ctx, outer, p.ink);
  const inner = [
    [cx + 45, cy + 3], [cx + 52, cy - 2], [cx + 59, cy - 15 + wag], [cx + 66, cy - 16 + wag],
    [cx + 66, cy - 9 + wag], [cx + 58, cy - 1], [cx + 66, cy + 8 + wag],
    [cx + 64, cy + 14 + wag], [cx + 57, cy + 12 + wag], [cx + 51, cy + 5], [cx + 45, cy + 7],
  ];
  poly(ctx, inner, p.body);
  px(ctx, cx + 60, cy - 10 + wag, 2, 2, p.bodyLight);
  px(ctx, cx + 61, cy + 6 + wag, 2, 2, p.bodyLight);
}

function drawWhaleFlipperV2(ctx, x, y, dir, p, wag) {
  poly(ctx, [
    [x, y - 3], [x + dir * 10, y + 2], [x + dir * 14, y + 10], [x + dir * 8, y + 15],
    [x - dir * 1, y + 11], [x - dir * 4, y + 5],
  ], p.ink);
  poly(ctx, [
    [x, y - 1], [x + dir * 8, y + 3], [x + dir * 11, y + 9], [x + dir * 6, y + 12],
    [x + dir * 1, y + 9], [x - dir * 2, y + 4],
  ], p.fin);
  px(ctx, x + dir * 4, y + 4 + wag, 2, 2, p.bodyLight);
}

function drawWhaleHandV2(ctx, x, y, p, dir, tap) {
  // A compact flipper resting on the edge. One pointed outer tip and a soft
  // inner curve keep it a fin, not a second little face.
  const yy = y + tap * 0.6;
  poly(ctx, [
    [x - 8, yy - 7], [x - 4, yy - 10], [x + 3, yy - 10], [x + 8, yy - 6],
    [x + 7, yy - 1], [x - 3, yy], [x - 8, yy - 4],
  ], p.ink);
  poly(ctx, [
    [x - 6, yy - 7], [x - 3, yy - 8], [x + 3, yy - 8], [x + 6, yy - 5],
    [x + 5, yy - 2], [x - 2, yy - 2], [x - 6, yy - 4],
  ], p.body);
  px(ctx, x + dir * 5, yy - 5, 1, 1, p.bodyLight);
  px(ctx, x - 4, yy - 7, 3, 1, p.bodyLight);
  px(ctx, x + 1, yy - 8, 2, 1, p.bodyLight);
}

function drawWhaleV2(ctx, view) {
  const { t, pose, lookX, lookY, mode, clipIn } = view;
  const p = CHARACTERS.whale;
  const bob = pose === "sleep" ? Math.sin(t * 1.1) * 1.2 : Math.sin(t * 2.1) * 1.1;
  const shake = pose === "angry" ? Math.sin(t * 46) * 1.4 : 0;
  const hop = pose === "celebrate" ? -Math.abs(Math.sin(t * 7)) * 10 : 0;
  const squash = pose === "poke" ? 0.96 : 1;
  const cx = 92 + shake;
  const cy = (mode === "perch" ? 79 : 77) + bob + hop;
  const wide = pose === "poke" || pose === "drag" || pose === "sweat";
  const faceY = cy - 8;
  const gazeX = pose === "idle" ? 0 : lookX;
  const gazeY = pose === "idle" ? 0 : lookY;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, BUF_W, clipIn);
  ctx.clip();

  if (mode === "desk") {
    ctx.globalAlpha = 0.18;
    ellipse(ctx, cx + 2, cy + 35, 43, 4.5, "#0C1228");
    ctx.globalAlpha = 1;
    drawWhaleTailV2(ctx, cx, cy, t, p);
    drawWhaleFlipperV2(ctx, cx - 36, cy + 13, -1, p, Math.sin(t * 2.4));
    drawWhaleFlipperV2(ctx, cx + 37, cy + 13, 1, p, Math.sin(t * 2.4 + 1.2));
  }

  // Main bean-shaped body, wider at the head and tapering toward the tail.
  ellipse(ctx, cx, cy, 44, 31, p.ink);
  ellipse(ctx, cx, cy, 42, 29, p.body);
  ctx.globalAlpha = 0.28;
  ellipseTop(ctx, cx - 8, cy - 7, 30, 21, p.bodyLight, 0.45);
  ctx.globalAlpha = 1;
  // A blue rim reading as a highlight from the upper left.
  ctx.globalAlpha = 0.55;
  ellipseTop(ctx, cx - 13, cy - 8, 28, 20, p.bodyLight, 0.35);
  ctx.globalAlpha = 1;

  // Big white belly, shaped like the logo's crescent and kept inside the body.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, 42, 29, 0, 0, Math.PI * 2);
  ctx.clip();
  ellipse(ctx, cx - 8, cy + 16, 30, 16, p.belly);
  ctx.globalAlpha = 0.35;
  px(ctx, cx - 18, cy + 25, 18, 1, "#C8D5F7");
  px(ctx, cx - 10, cy + 28, 13, 1, "#C8D5F7");
  ctx.globalAlpha = 1;
  ctx.restore();

  // Body spots and the blowhole.
  px(ctx, cx - 24, cy - 18, 3, 2, p.bodyLight);
  px(ctx, cx + 10, cy - 23, 2, 2, p.bodyLight);
  px(ctx, cx + 21, cy - 14, 3, 2, p.bodyLight);
  px(ctx, cx + 3, cy - 29, 5, 2, p.ink);
  px(ctx, cx + 4, cy - 28, 3, 1, p.bodyDeep);

  // Face.
  const spread = 15;
  whaleEyeV2(ctx, cx - spread, faceY, p, pose, gazeX, gazeY, wide, -1);
  whaleEyeV2(ctx, cx + spread, faceY, p, pose, gazeX, gazeY, wide, 1);
  whaleMouthV2(ctx, cx, faceY + 16, pose, t, p);
  blush(ctx, cx, faceY + 12, 26, p.blush);

  // Spout. The three droplets are deliberately uneven.
  if (pose !== "sleep" && pose !== "sick") {
    const s = Math.sin(t * 3) * 2;
    ctx.globalAlpha = 0.8;
    ellipse(ctx, cx + 4 + s, cy - 36, 2, 3, "#BFE6FF");
    ellipse(ctx, cx - 3 + s, cy - 41, 1.6, 2.2, "#DCF3FF");
    ellipse(ctx, cx + 10 + s, cy - 42, 1.8, 2.2, "#DCF3FF");
    px(ctx, cx + 1 + s, cy - 44, 1, 1, "#FFFFFF");
    ctx.globalAlpha = 1;
  }

  if (pose === "wave") {
    line(ctx, cx + 32, cy - 1, cx + 38, cy - 13, p.ink, 5);
    line(ctx, cx + 32, cy - 1, cx + 38, cy - 13, p.body, 3);
    drawWhaleHandV2(ctx, cx + 38, cy - 14, p, 1, Math.sin(t * 9) > 0 ? 1 : 0);
    ctx.globalAlpha = 0.55;
    px(ctx, cx + 51, cy - 27, 2, 1, p.accent);
    px(ctx, cx + 54, cy - 24, 2, 1, p.accent);
    px(ctx, cx + 50, cy - 21, 1, 1, p.accent);
    ctx.globalAlpha = 1;
  }

  if (pose === "wait") drawWaitBadge(ctx, cx + 37, cy - 31, p);

  if (pose === "drag") {
    for (const dir of [-1, 1]) {
      line(ctx, cx + dir * 43, cy + 1, cx + dir * 54, cy - 8, p.ink, 3);
      line(ctx, cx + dir * 46, cy + 7, cx + dir * 56, cy + 2, p.ink, 2);
    }
  }

  if (pose === "eat") {
    ellipse(ctx, cx + 12, cy + 10, 6, 4.8, p.ink);
    ellipse(ctx, cx + 12, cy + 10, 4.6, 3.6, "#F4C25E");
    px(ctx, cx + 16, cy + 8, 3, 4, p.body);
    px(ctx, cx + 10, cy + 9, 2, 2, "#8A5A2A");
    px(ctx, cx + 13, cy + 12, 1, 1, "#FFF0C8");
  }

  if (pose === "type" && mode === "desk") {
    drawKeyboard(ctx, cx - 1, cy + 33, t, p);
    const tap = Math.round((Math.sin(t * 9) + 1) * 0.5);
    drawWhaleHandV2(ctx, cx - 16, cy + 35 - tap, p, -1, tap);
    drawWhaleHandV2(ctx, cx + 16, cy + 35 + tap, p, 1, tap);
  }

  if (mode === "perch") {
    const tap = Math.sin(t * 3.2) > 0 ? 1 : 0;
    drawWhaleHandV2(ctx, cx - 30, clipIn - 1, p, -1, tap);
    drawWhaleHandV2(ctx, cx + 30, clipIn - 1, p, 1, tap);
  }

  ctx.restore();
}

/* ------------------------------- crab ------------------------------- */

function crabEyeV2(ctx, ex, ey, p, pose, lookX, lookY, wide, side) {
  if (pose === "sleep" || pose === "happy" || pose === "petted" || pose === "celebrate") {
    px(ctx, ex - 5, ey, 10, 2, p.ink);
    px(ctx, ex - 2, ey - 2, 4, 1, p.ink);
    return;
  }
  if (pose === "blink") {
    px(ctx, ex - 5, ey, 10, 2, p.ink);
    return;
  }
  if (pose === "sick") {
    for (let k = -3; k <= 3; k++) {
      px(ctx, ex + k, ey + k, 1, 1, p.ink);
      px(ctx, ex + k, ey - k, 1, 1, p.ink);
    }
    return;
  }
  // Square pixel eyes, like the reference crab, with a little life in them.
  const w = wide ? 10 : 9;
  const h = wide ? 12 : 11;
  plate(ctx, ex - w / 2, ey - h / 2, w, h, 3, p.ink, "#FFF9EE");
  const pxo = clamp(Math.round(lookX), -1.6, 1.6);
  const pyo = clamp(Math.round(lookY), -1.4, 1.4);
  px(ctx, ex - 2 + pxo, ey - 2 + pyo, 4, 5, "#2B1710");
  px(ctx, ex - 1 + pxo, ey - 1 + pyo, 1, 1, "#FFFFFF");
  if (pose === "angry") {
    px(ctx, ex - 5, ey - 7, 10, 2, p.ink);
    const outer = ex + side * 7;
    const inner = ex - side * 5;
    line(ctx, outer, ey - 9, inner, ey - 5, p.ink, 2);
    px(ctx, inner - 1, ey - 6, 3, 1, p.ink);
  } else if (pose === "hungry") {
    px(ctx, ex - 6, ey - 7, 12, 2, p.ink);
    px(ctx, ex - 5, ey - 6, 10, 1, p.body);
  } else if (pose === "sweat") {
    line(ctx, ex - 7, ey - 9, ex + 3, ey - 7, p.ink, 2);
  }
}

function crabMouthV2(ctx, cx, y, pose, t, p) {
  if (pose === "happy" || pose === "petted" || pose === "celebrate") {
    line(ctx, cx - 5, y - 1, cx - 2, y + 2, p.ink, 2);
    line(ctx, cx - 2, y + 2, cx + 2, y + 2, p.ink, 2);
    line(ctx, cx + 2, y + 2, cx + 5, y - 1, p.ink, 2);
    px(ctx, cx - 1, y + 3, 2, 1, "#FF9FB2");
  } else if (pose === "eat") {
    const open = Math.sin(t * 13) > 0;
    ellipse(ctx, cx, y + 1, open ? 4 : 2, open ? 3 : 1.2, p.ink);
  } else if (pose === "angry") {
    line(ctx, cx - 5, y + 3, cx - 2, y + 1, p.ink, 2);
    line(ctx, cx - 2, y + 1, cx + 2, y + 1, p.ink, 2);
    line(ctx, cx + 2, y + 1, cx + 5, y + 3, p.ink, 2);
  } else if (pose === "sick" || pose === "hungry") {
    line(ctx, cx - 4, y, cx - 2, y + 2, p.ink, 1);
    line(ctx, cx - 2, y + 2, cx, y, p.ink, 1);
    line(ctx, cx, y, cx + 2, y + 2, p.ink, 1);
    line(ctx, cx + 2, y + 2, cx + 4, y, p.ink, 1);
  } else if (pose === "poke" || pose === "drag" || pose === "wait") {
    ellipse(ctx, cx, y + 1, 2, 2.4, p.ink);
  } else if (pose === "sleep") {
    px(ctx, cx - 3, y + 1, 6, 1, p.ink);
  } else {
    line(ctx, cx - 5, y, cx - 2, y + 2, p.ink, 1);
    line(ctx, cx - 2, y + 2, cx + 2, y + 2, p.ink, 1);
    line(ctx, cx + 2, y + 2, cx + 5, y, p.ink, 1);
  }
}

function drawCrabClawV2(ctx, bodyX, bodyY, dir, p, pose, t, mode) {
  const typing = pose === "type" && mode === "desk";
  const perch = mode === "perch";
  const angry = pose === "angry" || pose === "celebrate";
  const open = angry ? 4 : Math.sin(t * 2.2 + (dir > 0 ? 1.3 : 0)) > 0 ? 2 : 0;
  const wx = perch ? bodyX + dir * 36 : typing ? bodyX + dir * 28 : bodyX + dir * 43;
  const wy = perch ? bodyY + 6 : typing ? bodyY + 30 : bodyY - 2;
  // Blocky arm from the shell to the palm.
  const armStart = bodyX + dir * 24;
  px(ctx, Math.min(armStart, wx), wy - 2, Math.abs(wx - armStart) + 2, 4, p.ink);
  px(ctx, Math.min(armStart, wx + dir * 2), wy - 1, Math.abs(wx - armStart), 2, p.bodyDeep);
  // Palm, cut off at the outside so the pincer gap is real empty space.
  plate(ctx, wx - 7, wy - 7, 14, 14, 3, p.ink, p.body);
  px(ctx, wx - 4, wy - 5, 6, 2, p.bodyLight);
  // Two fingers reaching outward. The gap between them gets wider when the
  // crab is angry or cheering.
  const fx = dir > 0 ? wx + 5 : wx - 17;
  plate(ctx, fx, wy - 9 - open, 12, 6, 2, p.ink, p.body);
  plate(ctx, fx, wy + 3 + open, 12, 6, 2, p.ink, p.body);
  // Dark inner edge makes the V-shaped bite read at 1x.
  const inner = dir > 0 ? fx + 1 : fx + 10;
  px(ctx, inner, wy - 4 - open, 2, 3, p.ink);
  px(ctx, inner, wy + 2 + open, 2, 3, p.ink);
  px(ctx, fx + (dir > 0 ? 8 : 2), wy - 8 - open, 2, 2, p.bodyLight);
  px(ctx, fx + (dir > 0 ? 8 : 2), wy + 6 + open, 2, 2, p.bodyLight);
}

function drawCrabLegsV2(ctx, cx, cy, t, p) {
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const x = cx + dir * (17 + i * 9);
      const y = cy + 19;
      const step = Math.sin(t * 5 + i + (dir > 0 ? 1 : 0)) > 0 ? 1 : 0;
      px(ctx, x - 1, y, 3, 7, p.ink);
      px(ctx, x + dir * 2, y + 5 + step, 5, 3, p.ink);
      px(ctx, x, y + 1, 1, 5, p.bodyDeep);
      px(ctx, x + dir * 2, y + 6 + step, 4, 1, p.body);
    }
  }
}

function drawCrabV2(ctx, view) {
  const { t, pose, lookX, lookY, mode, clipIn } = view;
  const p = CHARACTERS.crab;
  const bob = pose === "sleep" ? Math.sin(t * 1.1) : Math.sin(t * 2.3);
  const shake = pose === "angry" ? Math.sin(t * 50) * 1.2 : 0;
  const hop = pose === "celebrate" ? -Math.abs(Math.sin(t * 7)) * 9 : 0;
  const cx = 94 + shake;
  const cy = (mode === "perch" ? 81 : 78) + bob + hop;
  const wide = pose === "poke" || pose === "drag" || pose === "sweat";

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, BUF_W, clipIn);
  ctx.clip();

  if (mode === "desk") {
    ctx.globalAlpha = 0.18;
    ellipse(ctx, cx, cy + 29, 36, 4.5, "#2A160E");
    ctx.globalAlpha = 1;
    drawCrabLegsV2(ctx, cx, cy, t, p);
  }

  // Arms and pincers behind the shell.
  drawCrabClawV2(ctx, cx, cy, -1, p, pose, t, mode);
  drawCrabClawV2(ctx, cx, cy, 1, p, pose, t, mode);

  // Blocky shell, closer to the original pixel crab than a round plush.
  plate(ctx, cx - 32, cy - 23, 64, 47, 9, p.ink, p.body);
  px(ctx, cx - 25, cy - 19, 17, 2, p.bodyLight);
  px(ctx, cx + 6, cy - 20, 9, 2, p.bodyLight);
  ctx.globalAlpha = 0.6;
  px(ctx, cx - 22, cy - 14, 4, 2, p.bodyLight);
  px(ctx, cx + 16, cy - 15, 3, 2, p.bodyLight);
  ctx.globalAlpha = 1;
  // Shell texture: a few darker pixel freckles.
  for (const [dx, dy] of [[-20, -6], [-12, 6], [8, -8], [17, 1], [-24, 3], [21, 8]]) {
    px(ctx, cx + dx, cy + dy, 2, 2, p.bodyDeep);
  }
  // Cream belly.
  plate(ctx, cx - 18, cy + 3, 36, 19, 6, p.bodyDeep, p.belly);
  px(ctx, cx - 12, cy + 8, 8, 1, "#FFF3E5");
  // Side shell spikes.
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const sx = cx + dir * 30;
      const sy = cy - 8 + i * 11;
      px(ctx, sx, sy, 4, 3, p.ink);
      px(ctx, sx + (dir > 0 ? 3 : -3), sy + 1, 3, 2, p.bodyDeep);
    }
  }

  if (pose === "sick") {
    ctx.globalAlpha = 0.14;
    ellipse(ctx, cx, cy - 2, 32, 25, "#7FE0B2");
    ctx.globalAlpha = 1;
  }

  // Square eyes directly in the shell.
  const spread = 14;
  crabEyeV2(ctx, cx - spread, cy - 7, p, pose, lookX, lookY, wide, -1);
  crabEyeV2(ctx, cx + spread, cy - 7, p, pose, lookX, lookY, wide, 1);
  crabMouthV2(ctx, cx, cy + 12, pose, t, p);
  for (const dir of [-1, 1]) px(ctx, cx + dir * 24 - 2, cy + 7, 4, 2, p.blush);

  if (pose === "eat") {
    ellipse(ctx, cx + 13, cy + 8, 5.5, 4.5, p.ink);
    ellipse(ctx, cx + 13, cy + 8, 4.2, 3.4, "#F4C25E");
    px(ctx, cx + 16, cy + 7, 2, 3, p.body);
    px(ctx, cx + 11, cy + 7, 1, 1, "#8A5A2A");
  }

  if (pose === "type" && mode === "desk") {
    drawKeyboard(ctx, cx, cy + 35, t, p);
  }
  if (pose === "wave") {
    // One pincer lifted high, with a little open/close wave.
    const wx = cx + 36;
    const wy = cy - 21;
    line(ctx, cx + 24, cy - 10, wx - 2, wy + 4, p.ink, 7);
    line(ctx, cx + 24, cy - 10, wx - 2, wy + 4, p.body, 4);
    plate(ctx, wx - 6, wy - 6, 12, 12, 3, p.ink, p.body);
    const open = Math.sin(t * 8) > 0 ? 2 : 0;
    plate(ctx, wx + 4, wy - 9 - open, 9, 5, 2, p.ink, p.body);
    plate(ctx, wx + 4, wy + 4 + open, 9, 5, 2, p.ink, p.body);
    px(ctx, wx + 5, wy - 4 - open, 2, 3, p.ink);
    px(ctx, wx + 5, wy + 2 + open, 2, 3, p.ink);
    ctx.globalAlpha = 0.55;
    px(ctx, wx + 12, wy - 13, 2, 1, p.accent);
    px(ctx, wx + 15, wy - 10, 2, 1, p.accent);
    ctx.globalAlpha = 1;
  }

  if (pose === "wait") drawWaitBadge(ctx, cx + 35, cy - 40, p);
  if (pose === "drag") {
    for (const dir of [-1, 1]) {
      line(ctx, cx + dir * 36, cy - 6, cx + dir * 53, cy - 14, p.ink, 3);
      line(ctx, cx + dir * 38, cy - 7, cx + dir * 51, cy - 14, p.body, 1);
    }
  }

  ctx.restore();
}

export class PetArt {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.buffer = document.createElement("canvas");
    this.buffer.width = BUF_W;
    this.buffer.height = BUF_H;
    this.bctx = this.buffer.getContext("2d");
    this.bctx.imageSmoothingEnabled = false;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = STAGE_W * this.dpr;
    canvas.height = 300 * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
  }

  clear() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, STAGE_W, 300);
  }

  draw(view) {
    // 长相在 sprite.js：平涂矢量画，直接画在 2x 画布上
    const out = this.ctx;
    out.clearRect(0, 0, STAGE_W, 300);
    const perch = view.mode === "perch";
    const pose = mapPose(view.pose);
    if (pose !== this.lastPose) {
      this.lastPose = pose;
      this.poseAt = view.t;
    }
    const clipCss = perch ? view.clipCss : 300;
    const k = petScale(view.size);
    const character = view.character === "crab" ? "crab" : "whale";
    // 单位格 120×112 放大 k 倍：趴着时窗口顶边（单位 88）落在 clipCss 上；在桌面时脚底落在 DESK_GROUND
    const x0 = STAGE_W / 2 - 60 * k;
    const y0 = perch ? clipCss - PERCH_EDGE * k : DESK_GROUND - GROUND * k;
    const top = y0 + headTop(character, perch) * k;
    this.bounds = {
      left: x0 + 16 * k,
      right: x0 + 104 * k,
      top,
      bottom: perch ? clipCss : y0 + GROUND * k,
      split: y0 + 70 * k,
    };
    out.save();
    out.translate(x0, y0);
    out.scale(k, k);
    drawPet(out, {
      character,
      skin: view.skin,
      pose,
      t: view.t,
      a: Math.max(0, view.t - (this.poseAt ?? view.t)),
      look: { x: clampLook(view.lookX), y: clampLook(view.lookY) },
      perch,
      sickish: pose === "sick",
    });
    // 粒子还是旧的 190×150 半尺寸坐标，换算到当前大小
    const oldOy = perch ? clipCss - PERCH_EDGE * 2 : 14;
    out.translate(-35, -oldOy / 2);
    drawParticles(out, view.particles ?? [], clipCss / 2);
    out.restore();
  }
}

// 大小：1 = 默认尺寸（单位格 1:1），可在设置里调
export const SIZES = [
  { value: 0.8, label: "小" },
  { value: 1, label: "中" },
  { value: 1.3, label: "大" },
  { value: 1.7, label: "特大" },
];
const DESK_GROUND = 250;
// 画布（和窗口）宽 760，宠物在正中，两边留给菜单和面板
export const STAGE_W = 760;

export function petScale(size) {
  const n = Number(size);
  return Number.isFinite(n) ? Math.max(0.6, Math.min(2, n)) : 1;
}

function clampLook(v) {
  return Math.max(-1, Math.min(1, (v ?? 0) / 1.7));
}

/* ------------------------------------------------------------------ */
/* Postcards                                                           */
/* ------------------------------------------------------------------ */

export function drawPostcard(canvas, place, seed = 0) {
  const ctx = canvas.getContext("2d");
  const W = 160;
  const H = 58;
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = false;
  const p = place.palette;
  const rand = mulberry32(seed || hash(place.id));

  // Sky bands.
  px(ctx, 0, 0, W, H, p.sky);
  px(ctx, 0, 0, W, 18, p.sky);
  px(ctx, 0, 18, W, 12, p.sky2);
  px(ctx, 0, 30, W, 10, blend(p.sky2, p.far, 0.45));

  // Sun / moon.
  const sx = 118 + Math.floor(rand() * 18);
  const sy = 10 + Math.floor(rand() * 7);
  ellipse(ctx, sx, sy, 9, 9, p.sun);
  ctx.globalAlpha = 0.35;
  ellipse(ctx, sx, sy, 13, 13, p.sun);
  ctx.globalAlpha = 1;

  const horizon = 40;

  if (place.kind === "aurora") {
    for (let band = 0; band < 3; band++) {
      ctx.globalAlpha = 0.25 + band * 0.1;
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.moveTo(0, 14 + band * 5);
      for (let x = 0; x <= W; x += 8) {
        ctx.lineTo(x, 14 + band * 5 + Math.sin(x * 0.06 + band) * 6);
      }
      ctx.lineTo(W, 34 + band * 3);
      ctx.lineTo(0, 34 + band * 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Stars.
    for (let i = 0; i < 18; i++) px(ctx, rand() * W, rand() * 25, 1, 1, "#FFFFFF");
  }

  // Far layer / landmarks.
  if (place.kind === "mountain" || place.kind === "snow") {
    triangle(ctx, 20, horizon + 6, 34, 22, p.far);
    triangle(ctx, 55, horizon + 6, 32, 26, p.mid);
    triangle(ctx, 96, horizon + 6, 40, 30, p.near);
    px(ctx, 22, horizon - 10, 14, 4, "#FFFFFF");
    px(ctx, 58, horizon - 14, 10, 4, "#FFFFFF");
    px(ctx, 100, horizon - 18, 12, 4, "#FFFFFF");
  } else if (place.kind === "temple") {
    pagoda(ctx, 94, horizon + 4, p);
    hill(ctx, 0, horizon + 4, W, 12, p.far);
  } else if (place.kind === "tower") {
    tower(ctx, 80, horizon + 4, p);
    hill(ctx, 0, horizon + 5, W, 10, p.far);
  } else if (place.kind === "desert") {
    dune(ctx, 0, horizon + 3, W, 8, p.far);
    dune(ctx, 0, horizon + 9, W, 8, p.mid);
    dune(ctx, 0, horizon + 15, W, 8, p.near);
  } else if (place.kind === "island") {
    water(ctx, 0, horizon + 8, W, 18, p.water);
    for (let i = 0; i < 4; i++) {
      const x = 42 + i * 15;
      px(ctx, x, horizon - 2, 9, 8, "#FFFFFF");
      px(ctx, x + 2, horizon - 5, 5, 3, "#FFFFFF");
      px(ctx, x + 1, horizon - 3, 7, 1, p.accent);
    }
  } else if (place.kind === "canal") {
    for (let i = 0; i < 5; i++) {
      const x = 12 + i * 28;
      const h = 12 + Math.floor(rand() * 9);
      px(ctx, x, horizon - h, 16, h, p.far);
      px(ctx, x + 2, horizon - h + 3, 3, 3, p.sun);
      px(ctx, x + 9, horizon - h + 3, 3, 3, p.sun);
      px(ctx, x + 2, horizon - h + 9, 3, 3, p.sun);
    }
    water(ctx, 0, horizon + 6, W, 20, p.water);
    // Gondola.
    px(ctx, 72, horizon + 13, 18, 3, p.near);
    px(ctx, 74, horizon + 10, 2, 3, p.near);
    px(ctx, 86, horizon + 10, 2, 3, p.near);
  } else if (place.kind === "tram") {
    hill(ctx, 0, horizon + 5, W, 12, p.mid);
    px(ctx, 64, horizon - 14, 34, 17, p.accent);
    px(ctx, 67, horizon - 11, 9, 6, p.sky2);
    px(ctx, 79, horizon - 11, 9, 6, p.sky2);
    px(ctx, 68, horizon - 3, 26, 2, p.near);
    for (let i = 0; i < 2; i++) ellipse(ctx, 70 + i * 21, horizon + 3, 3, 3, p.near);
  } else if (place.kind === "bridge") {
    water(ctx, 0, horizon + 10, W, 16, p.water);
    const bx = 30;
    px(ctx, bx, horizon - 6, 4, 20, p.accent);
    px(ctx, bx + 92, horizon - 6, 4, 20, p.accent);
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, horizon - 6);
    ctx.quadraticCurveTo(80, horizon - 26, bx + 96, horizon - 6);
    ctx.stroke();
    px(ctx, bx, horizon - 1, 100, 2, p.accent);
  } else if (place.kind === "forest") {
    for (let i = 0; i < 7; i++) {
      const x = 8 + i * 24;
      const h = 20 + Math.floor(rand() * 12);
      triangle(ctx, x, horizon + 4, 10, h, p.mid);
      triangle(ctx, x + 3, horizon - 3, 4, h * 0.6, p.near);
    }
  } else if (place.kind === "harbor") {
    water(ctx, 0, horizon + 10, W, 16, p.water);
    // Opera house shells.
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = p.accent;
      ctx.beginPath();
      ctx.arc(60 + i * 16, horizon + 7, 12 - i * 2, Math.PI, 0);
      ctx.fill();
    }
    px(ctx, 40, horizon + 11, 30, 3, "#FFFFFF");
  } else if (place.kind === "skyline") {
    for (let i = 0; i < 9; i++) {
      const x = 8 + i * 17;
      const h = 14 + Math.floor(rand() * 20);
      px(ctx, x, horizon - h, 14, h, p.mid);
      for (let wy = horizon - h + 3; wy < horizon - 2; wy += 5) {
        for (let wx = x + 2; wx < x + 12; wx += 4) {
          if (rand() > 0.35) px(ctx, wx, wy, 2, 3, i % 2 ? p.sun : p.accent);
        }
      }
    }
  } else if (place.kind === "bamboo" || place.kind === "lake") {
    if (place.kind === "bamboo") {
      hill(ctx, 0, horizon + 4, W, 12, p.far);
      for (let i = 0; i < 8; i++) {
        const x = 6 + i * 20;
        px(ctx, x, horizon - 12, 3, 24, p.mid);
        px(ctx, x + 3, horizon - 8, 5, 2, p.mid);
        px(ctx, x + 3, horizon - 3, 5, 2, p.mid);
        px(ctx, x - 4, horizon - 10, 4, 2, p.far);
      }
    } else {
      hill(ctx, 0, horizon + 3, W, 10, p.mid);
      water(ctx, 0, horizon + 9, W, 17, p.water);
      px(ctx, 0, horizon + 9, W, 1, "#FFFFFF");
      // Little boat.
      px(ctx, 100, horizon + 14, 16, 3, p.near);
      px(ctx, 107, horizon + 9, 2, 5, p.near);
    }
  } else {
    // Generic city.
    for (let i = 0; i < 6; i++) {
      const x = 10 + i * 25;
      const h = 12 + Math.floor(rand() * 14);
      px(ctx, x, horizon - h, 18, h, p.far);
      px(ctx, x + 3, horizon - h + 4, 3, 3, p.sun);
      px(ctx, x + 10, horizon - h + 4, 3, 3, p.sun);
    }
  }

  // Water / ground strip.
  if (["canal", "harbor", "island", "bridge", "lake", "tram", "city", "skyline"].includes(place.kind)) {
    if (!["canal", "harbor", "island", "bridge", "lake"].includes(place.kind)) {
      px(ctx, 0, horizon + 8, W, H - horizon - 8, p.near);
      for (let i = 0; i < 20; i++) px(ctx, rand() * W, horizon + 10 + rand() * 8, 2, 1, blend(p.near, p.accent, 0.2));
    }
  } else {
    px(ctx, 0, horizon + 9, W, H - horizon - 9, p.near);
  }

  // Foreground.
  px(ctx, 0, H - 4, W, 4, blend(p.near, "#000000", 0.25));

  // A tiny pet on the postcard.
  const petColor = place.kind === "aurora" ? "#BFE6FF" : "#FFFFFF";
  px(ctx, 24, H - 9, 5, 4, petColor);
  px(ctx, 25, H - 11, 3, 2, petColor);
  px(ctx, 25, H - 8, 1, 1, INK);
  px(ctx, 28, H - 8, 1, 1, INK);

  return canvas;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function blend(a, b, amount) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - amount) + ((pb >> 16) & 255) * amount);
  const g = Math.round(((pa >> 8) & 255) * (1 - amount) + ((pb >> 8) & 255) * amount);
  const bl = Math.round((pa & 255) * (1 - amount) + (pb & 255) * amount);
  return `rgb(${r}, ${g}, ${bl})`;
}

function triangle(ctx, x, baseY, w, h, color) {
  for (let i = 0; i < h; i++) {
    const half = Math.round((w / 2) * (i / h));
    px(ctx, x + w / 2 - half, baseY - i, Math.max(1, half * 2), 1, color);
  }
}

function hill(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  for (let i = 0; i <= w; i += 8) {
    ctx.lineTo(i, y + h - 3 - Math.sin(i * 0.05) * h * 0.35);
  }
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

function water(ctx, x, y, w, h, color) {
  px(ctx, x, y, w, h, color);
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 6; i++) {
    const wy = y + 2 + i * 3;
    px(ctx, x + ((i * 13) % 30), wy, 20 - i * 2, 1, "#FFFFFF");
  }
  ctx.globalAlpha = 1;
}

function pagoda(ctx, x, baseY, p) {
  for (let i = 0; i < 3; i++) {
    const w = 26 - i * 6;
    const y = baseY - i * 9;
    px(ctx, x - w / 2, y - 3, w, 3, p.near);
    px(ctx, x - w / 2 + 1, y - 2, w - 2, 1, p.accent);
    px(ctx, x - 4, y + 1, 8, 6, p.mid);
  }
  px(ctx, x - 1, baseY - 28, 2, 5, p.near);
}

function tower(ctx, x, baseY, p) {
  px(ctx, x - 2, baseY - 28, 4, 28, p.near);
  px(ctx, x - 8, baseY - 10, 16, 2, p.near);
  px(ctx, x - 6, baseY - 18, 12, 2, p.near);
  px(ctx, x - 1, baseY - 31, 2, 3, p.accent);
  line(ctx, x - 8, baseY - 10, x, baseY - 28, p.accent, 1);
  line(ctx, x + 8, baseY - 10, x, baseY - 28, p.accent, 1);
}

function dune(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  for (let i = 0; i <= w; i += 4) {
    ctx.lineTo(i, y + h - Math.sin((i / w) * Math.PI) * h);
  }
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
}

export const ART_CONSTANTS = { BUF_W, BUF_H };
