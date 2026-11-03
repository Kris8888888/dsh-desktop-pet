/**
 * 宠物的长相：平涂色块、不描边，表情和小道具用同一套简洁画法。
 *
 * - 小螃蟹：Claude Code 欢迎界面那只像素小螃蟹（Clawd），一格一格画
 * - 小鲸鱼：DeepSeek 图标的鲸鱼剪影，圆身子、白肚皮、上翘的尾巴
 *
 * 坐标用 120×112 的「单位格」，地面在 y=100，趴窗口时窗口顶边在 y=88。
 * PetArt 负责把单位格放大 2 倍贴进 380×300 的浮窗。
 */

import { SPRITE_META } from "./sprites-meta.js";
import { spriteData } from "runtime";

export const UNIT_W = 120;
export const GROUND = 100;
export const PERCH_EDGE = 88;

export const INK = {
  line: "#0E3B43",
  teal: "#1F6F78",
  amber: "#F2B33D",
  cheek: "#F29C85",
  mouth: "#C65D4A",
  cool: "#A8D8EA",
  // 小螃蟹：Claude Code 像素小螃蟹的橙色
  crab: "#D97757",
  crabShade: "#BD6144",
  crabSick: "#CC9985",
  crabEye: "#1E1410",
  // 小鲸鱼：DeepSeek 图标的蓝
  whale: "#4D6BFE",
  whaleShade: "#3B57E0",
  whaleSick: "#8E9BD6",
  whaleBelly: "#EEF2FF",
  whaleEye: "#172463",
};

const FONT = `-apple-system, "SF Pro Rounded", "PingFang SC", sans-serif`;
const MONO = `"SF Mono", Menlo, monospace`;

// DSH 的姿势名 → 画法里的姿势
const POSE = {
  idle: "idle",
  blink: "blink",
  happy: "happy",
  petted: "petted",
  poke: "poked",
  angry: "pout",
  eat: "eating",
  hungry: "hungry",
  sick: "sick",
  sleep: "sleeping",
  celebrate: "celebrate",
  sweat: "oops",
  type: "working",
  wave: "wave",
  wait: "waiting",
  drag: "dragged",
};

export function mapPose(pose) {
  return POSE[pose] ?? "idle";
}

/** 头顶在单位格里的高度（气泡、头部点击区按这个放） */
export function headTop(character, perch) {
  return character === "crab" ? 48 + (perch ? 14 : 0) : perch ? 41 : 35;
}

/* ------------------------------------------------------------------ */
/* 画笔小工具                                                          */
/* ------------------------------------------------------------------ */

function rect(g, x, y, w, h, color) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

function oval(g, cx, cy, rx, ry, color) {
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

function strokePath(g, points, color, width, cap = "square") {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = cap;
  g.lineJoin = "miter";
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
  g.stroke();
}

function text(g, s, size, weight, color, x, y, mono = false) {
  g.fillStyle = color;
  g.font = `${weight} ${size}px ${mono ? MONO : FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(s, x, y);
}

function withAlpha(g, alpha, body) {
  const old = g.globalAlpha;
  g.globalAlpha = old * Math.max(0, Math.min(1, alpha));
  body();
  g.globalAlpha = old;
}

/* ------------------------------------------------------------------ */
/* 入口                                                                */
/* ------------------------------------------------------------------ */

/**
 * f: { character, pose(画法姿势), t, a(这个姿势开始了多久), look:{x,y}, perch }
 * g 已经变换到单位格坐标。
 */
export function drawPet(g, f) {
  if (!f.perch) {
    drawCharacter(g, f);
    return;
  }
  // 趴在窗口顶边：身子往下沉，边线以下剪掉（像躲在窗口后面），再把两只手搭在边上
  g.save();
  g.beginPath();
  g.rect(-60, -200, 240, 200 + PERCH_EDGE);
  g.clip();
  g.translate(0, f.character === "crab" ? 14 : WHALE_PERCH_SINK);
  drawCharacter(g, f);
  g.restore();
  paws(g, f);
}

function drawCharacter(g, f) {
  if (f.character === "crab") drawCrab(g, f);
  else drawWhale(g, f);
}

/** 哪只手举着（举着的手不搭在窗口边上） */
function raised(p, crab) {
  switch (p) {
    case "celebrate":
      return crab ? { l: true, r: true } : { l: true, r: false };
    case "dragged":
      return { l: true, r: true };
    case "wave":
      return crab ? { l: false, r: true } : { l: true, r: false };
    case "waiting":
      return { l: false, r: crab };
    default:
      return { l: false, r: false };
  }
}

function paws(g, f) {
  const up = raised(f.pose, f.character === "crab");
  const y = PERCH_EDGE;
  if (f.character === "crab") g.filter = f.sickish ? "saturate(35%) brightness(1.08)" : "none";
  if (f.character === "crab") {
    // 两只钳子从身体两侧伸出来，搭在窗口边上
    const c = CRAB_CELL;
    const half = (CRAB_W / 2) * c;
    const xs = [60 - half - 1.6 * c, 60 + half - 0.6 * c];
    xs.forEach((x, i) => {
      if (i === 0 ? up.l : up.r) return;
      const r = { x, y: y - 1.3 * c, w: 2.2 * c, h: 1.6 * c };
      const sk = skinOf("crab", f.skin);
      rect(g, r.x, r.y, r.w, r.h, sk.body);
      rect(g, r.x, r.y + r.h - 0.5 * c, r.w, 0.5 * c, sk.shade);
      rect(g, r.x + r.w / 2 - 0.12 * c, r.y, 0.24 * c, 0.7 * c, sk.shade);
    });
  }
  g.filter = "none";
  if (f.character !== "crab") {
    // 两只鱼鳍扒在窗口边上（举起来的那只不画）
    const sk = skinOf("whale", f.skin);
    if (f.sickish) g.filter = "saturate(35%) brightness(1.08)";
    const paw = (x, ang) => {
      g.save();
      g.translate(0.8, 1);
      withAlpha(g, 0.25, () => flipper(g, x, y - 2, ang, 16, "#000000"));
      g.restore();
      flipper(g, x, y - 2, ang, 16, sk.top);
    };
    if (!up.l) paw(28, 0.42);
    if (!up.r) paw(66, 0.32);
    g.filter = "none";
  }
  // 贴在窗口边上的一道淡影子，让它像真的趴在上面
  const grad = g.createLinearGradient(0, y, 0, y + 7);
  grad.addColorStop(0, "rgba(0,0,0,0.10)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(24, y, 72, 7);
}

/* ------------------------------------------------------------------ */
/* 小螃蟹：像素风，一格一格画                                          */
/* ------------------------------------------------------------------ */

const CRAB_CELL = 5.2;
const CRAB_W = 12;

function drawCrab(g, f) {
  const p = f.pose;
  const t = f.t;
  const a = f.a;
  const c = CRAB_CELL;
  const W = CRAB_W;
  let bob = 0;
  let dx = 0;
  switch (p) {
    case "working": bob = -(Math.floor(t * 6) % 2); break;
    case "waiting": bob = -8 * Math.max(0, Math.sin(t * 5.5)); break;
    case "celebrate":
    case "wave": bob = -12 * Math.abs(Math.sin(a * 7)) * Math.max(0, 1 - a / 2.6); break;
    case "happy": bob = -5 * Math.abs(Math.sin(a * 7)) * Math.max(0, 1 - a / 1.2); break;
    case "poked": bob = a < 0.3 ? 3 : 0; break;
    case "dragged": bob = -4; break;
    case "pout": dx = a < 0.45 ? 2 * Math.sin(a * 45) : 0; break;
    case "sick": dx = t % 5 < 0.5 ? 0.8 * Math.sin(t * 40) : 0; break;
    case "sleeping": bob = Math.sin((t * 2 * Math.PI) / 4.5) > 0 ? 1 : 2; break;
    default: bob = Math.sin((t * 2 * Math.PI) / 3.2) > 0.55 ? -1 : 0; // 发呆时像素式地起伏一格
  }
  const x0 = 60 - (W / 2) * c + dx;
  const y0 = GROUND - 10 * c + bob;
  const body = { minX: x0, minY: y0, maxX: x0 + W * c, maxY: y0 + 8 * c, midX: x0 + (W * c) / 2 };
  const sick = p === "sick";
  const sk = skinOf("crab", f.skin);
  const orange = sk.body;
  const shade = sk.shade;
  const eye = sk.eye;
  const cell = (x, y, w, h, color) => rect(g, x, y, w, h, color);

  // 影子
  if (!f.perch) {
    const lift = Math.min(0.45, -bob / 30);
    const sw = 64 * (1 - lift) * (p === "dragged" ? 0.6 : 1);
    oval(g, 60, GROUND + 4, sw / 2, 3, `rgba(0,0,0,${p === "dragged" ? 0.06 : 0.12})`);
  }

  // 四条腿（生病时整只褪色）
  if (sick) g.filter = "saturate(35%) brightness(1.08)";
  [1, 3, W - 4, W - 2].forEach((col, i) => {
    let len = 2 * c;
    if (p === "dragged") len = i % 2 === Math.floor(t * 4) % 2 ? 3 * c : 2.4 * c;
    cell(x0 + col * c, body.maxY, c, len, shade);
  });

  // 两只钳子：默认在身体两边；干活时轮流敲键盘，举手、挥手、等你时举起来
  const up = raised(p, true);
  let ly = y0 + 4 * c;
  let ry = y0 + 4 * c;
  if (p === "working") {
    const k = Math.floor(t * 8) % 2;
    ly += k * 0.6 * c;
    ry += (1 - k) * 0.6 * c;
  }
  if (up.l) ly = y0 + 0.5 * c - (p === "celebrate" ? (Math.floor(a * 6) % 2) * c : 0);
  if (up.r) {
    ry = y0 + 0.5 * c;
    if (p === "wave" || p === "waiting") ry -= (Math.floor((p === "wave" ? a : t) * 5) % 2) * c;
    if (p === "celebrate") ry -= (1 - (Math.floor(a * 6) % 2)) * c;
  }
  // 趴着时放下的手搭在窗口边上（paws 画），这里不画
  if (!f.perch || up.l) { cell(x0 - 2 * c, ly, 2 * c, 2 * c, orange); cell(x0 - 2 * c, ly + 1.4 * c, 2 * c, 0.6 * c, shade); }
  if (!f.perch || up.r) { cell(x0 + W * c, ry, 2 * c, 2 * c, orange); cell(x0 + W * c, ry + 1.4 * c, 2 * c, 0.6 * c, shade); }

  // 身体：顶上两个角缺一格，底下一排深一点
  cell(x0 + c, y0, (W - 2) * c, c + 0.3, orange);
  cell(x0, y0 + c, W * c, 7 * c, orange);
  cell(x0, y0 + 7 * c, W * c, c, sick ? orange : shade);

  g.filter = "none";
  // 眼睛
  let look = f.look;
  if (p === "working") look = { x: look.x * 0.5, y: 0.9 };
  if (p === "waiting") look = { x: 0, y: -0.8 };
  const lx = Math.round(look.x * 0.45 * c);
  const ly2 = Math.round(look.y * 0.35 * c);
  [3, W - 4].forEach((col, i) => {
    const ex = x0 + col * c + lx;
    const ey = y0 + 2 * c + ly2;
    const s = i === 0 ? -1 : 1;
    switch (p) {
      case "petted":
      case "happy":
      case "celebrate":
      case "wave":
      case "eating":
        strokePath(g, [[ex - 0.3 * c, ey + 1.7 * c], [ex + 0.5 * c, ey + 0.8 * c], [ex + 1.3 * c, ey + 1.7 * c]], eye, 0.95 * c);
        break;
      case "sleeping":
        cell(ex - 0.3 * c, ey + 1.3 * c, 1.6 * c, 0.6 * c, eye);
        break;
      case "pout":
      case "poked":
      case "dragged": {
        const x1 = s < 0 ? ex - 0.1 * c : ex + 1.1 * c;
        const x2 = s < 0 ? ex + 1.0 * c : ex;
        strokePath(g, [[x1, ey + 0.3 * c], [x2, ey + 1.1 * c], [x1, ey + 1.9 * c]], eye, 0.7 * c);
        break;
      }
      case "sick":
      case "hungry":
        cell(ex, ey + 0.9 * c, c, 1.1 * c, eye);
        strokePath(g, [[ex - 0.3 * c, ey + (s < 0 ? 0.55 : 0.05) * c], [ex + 1.3 * c, ey + (s < 0 ? 0.05 : 0.55) * c]], eye, 0.4 * c);
        break;
      default:
        if (p === "blink" || t % 4.7 < 0.13) {
          cell(ex, ey + 1.2 * c, c, 0.6 * c, eye);
        } else {
          const tall = p === "waiting" || p === "oops" ? 2.4 : 2;
          cell(ex, ey - (tall - 2) * c, c, tall * c, eye);
        }
    }
  });
  if (["petted", "happy", "pout", "sick", "celebrate", "eating"].includes(p)) {
    withAlpha(g, 0.9, () => {
      cell(x0 + 1.4 * c, y0 + 4.6 * c, 1.2 * c, 0.6 * c, INK.cheek);
      cell(x0 + (W - 2.6) * c, y0 + 4.6 * c, 1.2 * c, 0.6 * c, INK.cheek);
    });
  }
  const mouth = { x: body.midX, y: y0 + 5.2 * c };
  if (p === "eating") {
    const o = Math.floor(a * 8) % 2 === 0;
    cell(mouth.x - 0.6 * c, mouth.y - (o ? 0.5 : 0.2) * c, 1.2 * c, (o ? 1.0 : 0.4) * c, eye);
  } else if (p === "waiting" || p === "oops" || p === "poked") {
    cell(mouth.x - 0.4 * c, mouth.y - 0.4 * c, 0.8 * c, 0.8 * c, eye);
  }
  if (sick) icePack(g, x0 + 1.6 * c, y0 - 0.3 * c, 4.2 * c, 1.3 * c);

  props(g, f, body, mouth);
}

/* ------------------------------------------------------------------ */
/* 小鲸鱼：轮廓全部从设计稿描出来（tools/trace_whale.py）               */
/*   桌面上 = 侧面（DeepSeek 图标原样），趴窗口边 = 正面（三视图左一）    */
/*   表情照表情资产：眼皮、圆眼、爱心眼、闭眼弧、眉毛、肚皮上的嘴          */
/* ------------------------------------------------------------------ */

const WHALE_SIDE = {
  body: new Path2D("M103.07 39.70L102.36 40.00L101.58 40.42L99.68 42.50L99.21 42.85L97.96 43.50L96.42 43.74L94.63 43.74L91.96 44.22L90.59 44.75L89.41 45.52L88.51 46.42L88.04 46.53L87.68 46.00L87.50 45.35L87.03 44.28L86.50 43.39L85.84 42.73L84.77 41.90L82.28 40.77L81.62 40.36L80.55 39.47L80.20 39.05L79.66 38.16L79.01 36.50L78.89 35.84L78.53 35.25L78.30 35.01L77.94 34.89L77.23 35.01L76.75 35.54L76.10 36.85L75.74 37.80L75.33 39.41L75.21 40.12L75.15 42.02L75.27 44.51L75.62 46.53L76.04 47.60L76.10 48.02L77.23 50.40L78.48 52.18L79.60 53.43L81.39 54.85L82.16 55.68L82.10 56.46L81.80 57.17L81.68 57.88L81.33 58.77L81.21 59.37L81.03 59.66L80.67 59.90L80.02 59.84L78.12 58.89L76.40 57.82L73.96 55.68L70.75 52.18L69.68 51.11L68.50 50.10L67.25 48.79L65.47 47.25L64.99 46.71L62.20 44.69L61.43 43.92L60.83 42.91L60.71 42.44L60.71 40.95L60.89 40.48L61.43 39.70L63.68 37.56L63.62 37.03L62.91 36.55L61.37 36.32L59.88 36.38L57.45 36.73L53.35 37.80L50.97 38.87L49.90 39.17L48.77 39.17L47.70 38.93L44.02 38.69L40.99 38.75L38.73 38.99L38.02 39.17L36.89 39.29L34.22 39.88L31.66 40.95L30.83 41.49L30.18 41.78L29.58 42.26L27.80 43.39L25.37 45.70L22.75 49.15L22.51 49.68L22.16 50.10L21.39 51.58L21.03 52.00L20.55 53.01L20.44 53.54L19.96 54.44L19.49 55.98L19.13 56.63L18.77 58.24L18.53 58.89L18.53 59.25L18.06 61.50L18.00 62.28L18.00 67.27L18.24 68.46L18.30 69.58L18.53 70.48L19.01 73.39L19.49 74.75L19.84 76.24L20.85 78.91L22.28 81.94L24.30 85.21L26.02 87.47L27.15 88.71L29.05 90.55L32.26 93.35L34.34 94.83L36.12 95.96L38.67 97.27L41.82 98.51L44.55 99.23L45.80 99.41L46.34 99.58L49.19 99.88L51.98 99.94L56.26 99.76L59.11 99.35L59.52 99.17L62.02 98.57L63.39 97.98L63.74 97.92L66.06 96.79L67.72 95.84L68.61 95.13L69.39 94.65L70.46 93.70L71.17 93.23L71.52 93.11L71.76 93.11L72.59 93.47L73.66 93.70L74.61 94.06L75.92 94.30L77.35 94.36L77.88 94.48L80.44 94.48L81.86 94.36L84.06 93.94L84.65 93.70L85.72 92.75L85.84 92.40L85.90 91.15L85.54 90.55L85.07 90.20L81.92 88.71L78.77 87.52L78.30 87.29L78.12 87.11L78.06 86.81L78.42 86.22L79.19 85.45L79.72 84.67L80.38 84.02L83.23 80.34L83.58 79.62L84.06 79.03L84.71 77.72L85.07 77.25L86.44 74.51L87.92 70.48L88.63 67.39L89.05 66.14L89.52 63.35L89.70 62.93L89.94 61.27L90.00 57.47L90.53 57.17L91.43 56.99L91.84 56.81L93.39 56.57L94.51 56.16L96.06 55.39L97.96 54.20L99.98 52.24L100.69 51.23L101.17 50.75L101.70 49.68L102.24 48.79L102.83 46.71L103.43 43.74L103.78 41.07L103.66 39.82Z"),
  belly: new Path2D("M24.12 59.01L24.71 58.53L26.20 58.18L26.73 58.18L27.68 58.00L30.24 58.06L33.68 58.65L34.46 58.95L34.99 59.01L35.76 59.31L36.48 59.43L37.37 59.84L38.14 60.02L40.16 60.91L43.90 62.93L45.68 64.30L46.22 64.59L46.93 65.13L47.35 65.60L49.19 67.21L50.61 68.69L51.27 69.52L51.74 69.94L53.17 71.78L53.76 72.38L54.36 73.33L56.73 76.53L56.97 77.07L57.68 78.08L57.98 78.73L59.58 81.23L62.67 85.27L63.09 85.62L66.30 89.19L67.78 90.50L69.56 91.86L69.62 92.10L69.39 92.34L69.15 92.40L65.94 92.40L64.87 92.28L63.27 91.98L61.19 91.15L59.58 90.20L58.81 89.43L56.55 87.76L55.96 87.23L54.24 85.98L53.76 85.74L53.29 85.33L52.10 84.61L50.67 83.54L48.48 82.36L47.29 82.06L46.75 82.06L46.34 82.18L45.98 82.48L45.68 83.13L45.68 83.96L46.04 85.21L46.69 86.69L47.47 88.00L47.58 88.42L47.47 89.13L46.99 89.72L45.92 90.26L45.27 90.38L44.02 90.38L42.53 90.14L40.04 89.19L39.03 88.48L38.44 88.18L37.54 87.41L36.12 86.46L35.23 85.56L34.93 85.39L33.09 83.49L32.38 82.89L32.02 82.36L31.66 82.06L30.24 80.16L29.58 79.15L28.93 77.90L28.34 77.13L27.03 74.51L26.91 74.04L26.20 72.55L26.02 71.84L25.66 71.01L25.49 70.18L25.25 69.64L25.13 68.99L24.71 67.74L24.48 66.32L24.24 65.49L23.88 62.93L23.70 60.50L23.76 59.66Z"),
  eyeWhite: new Path2D("M62.73 61.74L63.39 61.09L64.69 60.61L65.64 60.55L66.65 60.85L67.96 61.45L69.62 62.69L70.81 63.82L71.70 64.83L73.37 67.21L74.44 69.17L74.91 70.36L75.03 71.01L74.97 71.31L74.67 71.78L73.54 72.38L72.36 72.73L70.87 72.67L69.03 71.84L67.90 70.71L67.66 70.36L67.37 69.52L67.13 68.57L67.13 67.21L67.31 66.44L67.31 65.78L66.89 64.77L66.36 64.24L65.58 63.76L64.81 63.52L63.56 63.41L62.91 63.17L62.50 62.63L62.50 62.22Z"),
  glint: new Path2D("M63.98 65.19L64.34 65.19L64.57 65.31L64.99 65.66L65.11 65.90L65.11 66.55L64.99 66.85L64.75 67.09L64.28 67.33L63.92 67.33L63.39 67.09L63.15 66.85L63.03 66.55L63.03 66.14L63.21 65.78L63.56 65.43Z"),
  eye: { x: 68.8, y: 66.7, rx: 6.3, ry: 6.1 },
  glintAt: { x: 64.1, y: 66.3 },
  mouth: { x: 63, y: 81 },   // 嘴画在白肚皮靠脸那头（跟陪伴状态组一样）
  box: { minX: 18, minY: 36, maxX: 102, maxY: 100, midX: 46 },
  props: { sweat: { x: 97, y: 70 }, vein: { x: 58, y: 46 }, zees: { x: 97, y: 76 }, glyphs: { x: 99, y: 82 } },
};
const WHALE_FRONT = {
  body: new Path2D("M84.98 51.42L82.84 48.75L80.49 46.29L76.10 43.08L72.79 41.37L70.00 40.30L68.19 39.76L63.91 38.91L63.26 37.94L62.51 35.70L62.19 33.77L62.19 32.49L61.98 32.06L61.44 31.63L60.80 31.63L60.27 31.95L57.70 34.41L54.38 39.01L53.95 39.23L53.31 39.23L50.32 39.87L46.57 41.15L43.36 42.76L41.12 44.26L39.08 45.86L36.73 48.21L34.91 50.46L32.56 54.31L30.63 58.49L29.77 60.84L28.92 64.26L28.06 69.19L27.74 73.57L27.85 77.96L24.64 84.59L22.07 91.01L21.00 94.97L21.00 96.47L21.32 97.22L22.18 97.86L23.25 97.86L25.07 97.33L26.88 96.47L29.35 94.76L32.02 92.08L33.20 90.58L33.63 90.69L35.02 92.40L37.16 94.44L40.69 96.79L43.04 97.86L45.29 98.61L47.75 99.14L50.96 99.57L57.38 99.89L63.48 99.89L71.50 99.36L73.96 98.93L78.03 97.75L80.92 96.26L82.20 95.40L83.06 94.44L82.09 94.65L81.02 94.65L80.49 94.44L79.95 93.90L78.99 92.08L77.92 88.98L76.32 86.09L74.60 84.27L72.68 83.20L72.14 83.20L71.72 83.42L71.29 83.95L71.07 84.81L71.07 87.91L70.86 88.77L70.33 89.94L69.47 91.12L67.86 92.51L65.83 93.58L63.80 94.22L61.44 94.65L57.16 94.65L54.81 94.33L51.81 93.47L47.86 91.55L45.72 89.94L43.04 87.16L42.08 85.77L39.94 81.81L39.19 79.35L38.76 76.89L38.76 73.89L38.98 72.72L39.62 70.68L40.47 68.97L41.54 67.47L43.68 65.33L46.04 63.73L48.28 62.66L51.49 61.59L53.95 61.05L57.06 60.73L59.41 60.73L63.69 61.27L67.54 62.44L70.75 63.94L73.96 66.19L76.42 68.65L77.60 70.26L79.53 73.79L81.13 78.60L82.09 84.27L82.84 87.59L83.59 89.94L84.34 91.44L84.88 91.98L85.41 92.19L86.59 90.91L86.91 90.80L88.84 93.05L90.98 94.97L92.58 96.15L94.40 97.11L96.86 97.86L97.61 97.86L98.14 97.65L98.79 96.68L98.89 95.61L98.79 94.33L98.14 91.76L95.90 85.98L91.94 77.74L91.94 71.43L91.51 69.40L91.51 68.44L91.19 66.62L90.98 66.19L90.44 63.41L89.58 60.63L87.87 56.35Z"),
  belly: new Path2D("M46.04 63.73L49.14 62.34L52.35 61.37L55.56 60.84L59.41 60.73L62.62 61.05L64.55 61.48L67.54 62.44L70.75 63.94L73.96 66.19L76.42 68.65L78.67 72.07L80.28 75.71L81.35 79.56L81.67 81.28L81.67 82.67L81.24 83.95L79.95 85.34L79.10 85.77L77.81 85.98L76.53 85.77L75.67 85.34L74.60 84.27L73.00 83.31L72.14 83.20L71.72 83.42L71.29 83.95L71.07 84.81L71.07 87.70L70.86 88.77L69.79 90.69L68.29 92.19L67.33 92.83L65.83 93.58L63.80 94.22L61.44 94.65L57.16 94.65L55.45 94.44L51.81 93.47L47.86 91.55L45.72 89.94L43.79 88.02L41.54 84.91L40.26 82.56L39.62 80.85L38.98 78.39L38.76 76.89L38.76 73.89L38.98 72.72L39.51 71.00L40.37 69.19L41.54 67.47L43.68 65.33Z"),
  eyeWhite: new Path2D("M82.63 60.20L83.38 59.98L84.45 59.98L86.05 60.63L87.98 62.34L89.26 64.05L89.91 65.23L91.51 69.29L91.30 70.79L90.87 71.43L90.12 72.07L88.30 72.07L87.44 71.54L86.37 70.26L85.84 69.08L85.73 68.44L85.84 65.76L85.41 64.26L84.77 63.51L84.13 63.09L81.99 62.98L81.45 62.34L81.56 61.27Z"),
  glint: new Path2D("M83.06 64.37L83.81 64.37L84.45 64.91L84.66 65.33L84.66 66.19L84.56 66.30L84.56 66.51L83.91 67.15L83.06 67.15L82.84 67.05L82.31 66.40L82.31 65.12Z"),
  eye: { x: 86.5, y: 66.1, rx: 5.1, ry: 6.1 },
  glintAt: { x: 83.5, y: 65.8 },
  leftEye: { x: 33.5, y: 66.1 },   // 正面图只画了一只眼；闭眼类表情另一只用线画出来
  mouth: { x: 55, y: 71 },
  box: { minX: 21, minY: 38, maxX: 99, maxY: 100, midX: 60 },
  props: { sweat: { x: 98, y: 56 }, vein: { x: 74, y: 47 }, zees: { x: 94, y: 50 }, glyphs: { x: 100, y: 58 } },
};
// 趴在窗口边用侧面：往下沉一点，边线切在肚皮下沿，两片鱼鳍扒在边上（paws 画）
export const WHALE_PERCH_SINK = 6;

// 配色皮肤（照配色皮肤组）；线条分两种：画在身上的、画在白肚皮上的
export const SKINS = {
  whale: {
    classic: { label: "经典蓝", top: "#195BD3", bottom: "#0C4AB2", lineOnBody: "#0A2259", lineOnBelly: "#0A2259" },
    deep: { label: "深海", top: "#0F3B68", bottom: "#062443", lineOnBody: "#CFE0F7", lineOnBelly: "#062443", sparkle: true },
    light: { label: "浅蓝", top: "#C7E6FE", bottom: "#A8D2F6", lineOnBody: "#2B5C9E", lineOnBelly: "#2B5C9E", dots: "#8EC0EC" },
  },
  crab: {
    classic: { label: "经典橙", body: "#D97757", shade: "#BD6144", eye: "#1E1410" },
    night: { label: "夜色", body: "#4B4F5E", shade: "#363946", eye: "#F2B33D" },
    peach: { label: "蜜桃", body: "#F2B097", shade: "#DD927A", eye: "#4A2A20" },
  },
};

export function skinOf(character, key) {
  const set = SKINS[character === "crab" ? "crab" : "whale"];
  return set[key] ?? Object.values(set)[0];
}

/* 每个姿势用哪套表情（参照表情资产九宫格）
 * eye: open 原样 | closed 闭眼弧 | lid 半垂眼皮 | round 圆眼吃惊 | heart 爱心眼 | side 斜眼
 * left: 正面另一只眼（闭眼线）| brow: none/up/sad/angry | mouth: 正面肚皮上的嘴 */
const FACES = {
  idle: { eye: "open" },
  blink: { eye: "closed", left: true },
  happy: { eye: "open", brow: "up", mouth: "smile", cheek: true },
  celebrate: { eye: "open", mouth: "open", cheek: true },
  wave: { eye: "open", brow: "up", mouth: "smile" },
  petted: { eye: "heart", left: true, mouth: "soft", cheek: true },
  eating: { eye: "closed", left: true, mouth: "chew", cheek: true },
  working: { eye: "open", look: { x: 0.6, y: 1 }, brow: "flat" },
  waiting: { eye: "open", look: { x: 0.2, y: -0.9 } },
  poked: { eye: "round", mouth: "o" },
  oops: { eye: "closed", brow: "sad", mouth: "frown" },
  dragged: { eye: "round", mouth: "o" },
  hungry: { eye: "side", left: true, brow: "sad", mouth: "frown" },
  pout: { eye: "lid", lid: 0.42, brow: "angry", mouth: "frown" },
  sick: { eye: "lid", lid: 0.5, left: true, brow: "sad", mouth: "frown" },
  sleeping: { eye: "closed", left: true, brow: "flat" },
};

function drawWhaleVector(g, f) {
  const p = f.pose;
  const t = f.t;
  const a = f.a;
  // 被拎起来时用正面（动作资产里那只坐着的），其余都是侧面
  const front = p === "dragged";
  const V = front ? WHALE_FRONT : WHALE_SIDE;
  const skin = skinOf("whale", f.skin);
  // 动作只用整体位移和转动，不做非等比拉伸（拖动时不会被拉长/压扁）
  let bob = 0;
  let dx = 0;
  let tilt = 0;
  switch (p) {
    case "working": bob = -(Math.floor(t * 6) % 2) * 0.8; break;
    case "waiting": bob = -7 * Math.max(0, Math.sin(t * 5.5)); break;
    case "celebrate": bob = -12 * Math.abs(Math.sin(a * 7)) * Math.max(0, 1 - a / 2.6); tilt = 0.1 * Math.sin(a * 14); break;
    case "wave": bob = -6 * Math.abs(Math.sin(a * 7)) * Math.max(0, 1 - a / 2.6); tilt = 0.08 * Math.sin(a * 10); break;
    case "happy": bob = -5 * Math.abs(Math.sin(a * 7)) * Math.max(0, 1 - a / 1.2); break;
    case "petted": tilt = 0.04 * Math.sin(t * 6); break;
    case "poked": bob = a < 0.3 ? 2.5 : 0; break;
    case "dragged": tilt = 0.08 * Math.sin(t * 6); break;
    case "pout": dx = a < 0.45 ? 1.8 * Math.sin(a * 45) : 0; break;
    case "sick": dx = t % 5 < 0.5 ? 0.7 * Math.sin(t * 40) : 0; break;
    case "sleeping": bob = Math.sin((t * 2 * Math.PI) / 4.5) > 0 ? 0.6 : 1.2; break;
    default: bob = Math.sin((t * 2 * Math.PI) / 3.2) > 0.55 ? -1 : 0;
  }

  if (!f.perch) {
    const lift = Math.min(0.45, -bob / 30);
    const sw = 76 * (1 - lift) * (p === "dragged" ? 0.6 : 1);
    oval(g, 58, GROUND + 2, sw / 2, 3, `rgba(0,0,0,${p === "dragged" ? 0.06 : 0.12})`);
  }

  g.save();
  g.translate(60 + dx, 100 + bob);
  g.rotate(tilt);
  g.translate(-60, -100);

  const grad = g.createLinearGradient(0, 32, 0, 100);
  grad.addColorStop(0, skin.top);
  grad.addColorStop(1, skin.bottom);
  const sick = p === "sick";
  if (sick) g.filter = "saturate(35%) brightness(1.08)";
  g.fillStyle = grad;
  g.fill(V.body);
  // 挥手：一只鱼鳍举起来；庆祝：两只都举（画在身子前面，根部压在身上）
  if (!front && (p === "wave" || p === "celebrate")) {
    const swing = 0.35 * Math.sin(a * 12);
    flipper(g, 22, 60, -2.25 + swing, 14, skin.top);
    if (p === "celebrate") flipper(g, 84, 72, -1.0 - swing, 12, skin.top);
  }
  g.filter = "none";
  g.fillStyle = "#FFFFFF";
  g.fill(V.belly);
  if (skin.dots) {
    oval(g, front ? 28 : 24, front ? 74 : 72, 1.6, 1.6, skin.dots);
    oval(g, front ? 92 : 75, 76, 1.6, 1.6, skin.dots);
  }

  const face = FACES[p] ?? FACES.idle;
  const blinkNow = p === "idle" && t % 4.7 < 0.13;
  drawWhaleFace(g, V, skin, blinkNow ? FACES.blink : face, f, grad);

  if (skin.sparkle && (p === "idle" || p === "working")) sparkle(g, V.eye.x - 9, V.eye.y + 7, "#FFFFFF");
  if (sick) {
    g.save();
    g.translate(front ? 50 : 40, 41);
    g.rotate(front ? -0.08 : -0.28);
    icePack(g, -10, -3.2, 20, 6.4);
    g.restore();
  }
  companion(g, f, V, skin);
  props(g, f, V.box, V.mouth, V.props);
  g.restore();
}

/* ------------------------------------------------------------------ */
/* 小鲸鱼：直接用设计稿切出来的图（tools/cut_sprites.py → pet/sprites）  */
/*   陪伴状态组：发呆 / 干活 / 完成 / 出错 / 等你确认                     */
/*   动作资产：坐（被拎起来）/ 挥手 / 抱肚子 / 开心蹦 / 团成一团 / 趴着睡   */
/* ------------------------------------------------------------------ */

// 每种姿势用哪张图
const WHALE_SPRITE = {
  idle: "idle",
  blink: "idle",
  poked: "idle",
  working: "working",
  celebrate: "done",
  happy: "hop",
  petted: "hop",
  oops: "error",
  pout: "error",
  waiting: "waiting",
  wave: "wave",
  eating: "lean",
  hungry: "lean",
  sick: "nap",
  sleeping: "sleep",
  dragged: "sit",
};
// idle 那张身宽 288px（图片像素）= 84 单位，跟以前的大小一致
const UNIT_PER_PX = 84 / 288;
// 眨眼时盖住眼睛用的身体色
const LID = { classic: "#1A55C8", deep: "#0B3058", light: "#B9DDFB" };
const spriteCache = new Map();

// 换色：跟 tools/cut_sprites.py 的 recolor 同一套公式——身体的蓝按「有多蓝」连续换成皮肤色，
// 白肚皮、深色线条、红色不动
const RECOLOR = { deep: [[0x0f, 0x3b, 0x68], [0x06, 0x24, 0x43]], light: [[0xc7, 0xe6, 0xfe], [0xa8, 0xd2, 0xf6]] };

function recolor(img, skin) {
  const [top, bottom] = RECOLOR[skin];
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], b = px[i + 2];
    const w = Math.max(0, Math.min(1, (b - r - 70) / 60));
    if (w === 0) continue;
    const t = Math.max(0, Math.min(1, (b - 150) / 70));
    for (let ch = 0; ch < 3; ch++) px[i + ch] = px[i + ch] * (1 - w) + (bottom[ch] + (top[ch] - bottom[ch]) * t) * w;
  }
  g.putImageData(d, 0, 0);
  c.complete = true;
  c.naturalWidth = c.width;
  return c;
}

function spriteImage(name, skin) {
  let base = spriteCache.get(name);
  if (!base) {
    base = new Image();
    if (spriteData[name]) base.src = spriteData[name];
    spriteCache.set(name, base);
  }
  if (skin === "classic" || !RECOLOR[skin]) return base;
  const key = `${name}-${skin}`;
  let tinted = spriteCache.get(key);
  if (!tinted && base.complete && base.naturalWidth) {
    tinted = recolor(base, skin);
    spriteCache.set(key, tinted);
  }
  return tinted ?? null;
}

function drawWhale(g, f) {
  const p = f.pose;
  const t = f.t;
  const a = f.a;
  const skinKey = SKINS.whale[f.skin] ? f.skin : "classic";
  const name = WHALE_SPRITE[p] ?? "idle";
  const meta = SPRITE_META[name];
  const img = spriteImage(name, skinKey);
  // 图还没加载完：先用矢量版顶一下
  if (!meta || !img || !img.complete || !img.naturalWidth) return drawWhaleVector(g, f);

  // 动作只用整体位移和转动，不做非等比拉伸
  let bob = 0;
  let dx = 0;
  let tilt = 0;
  switch (p) {
    case "working": bob = -(Math.floor(t * 6) % 2) * 0.8; tilt = 0.03 * Math.sin(t * 6); break;
    case "waiting": tilt = 0.05 * Math.sin(t * 7); break;
    case "celebrate": bob = -10 * Math.abs(Math.sin(a * 7)) * Math.max(0, 1 - a / 2.6); break;
    case "wave": tilt = 0.06 * Math.sin(a * 9); break;
    case "happy":
    case "petted": bob = -4 - 3 * Math.abs(Math.sin(t * 4)); break;   // 开心蹦：离地飘着
    case "poked": bob = a < 0.3 ? 2.5 : 0; dx = a < 0.4 ? 1.5 * Math.sin(a * 40) : 0; break;
    case "dragged": tilt = 0.08 * Math.sin(t * 6); break;
    case "pout": dx = a < 0.45 ? 1.8 * Math.sin(a * 45) : 0; break;
    case "oops": dx = a < 0.5 ? 1.2 * Math.sin(a * 40) : 0; break;
    case "sick": dx = t % 5 < 0.5 ? 0.7 * Math.sin(t * 40) : 0; break;
    case "sleeping": bob = Math.sin((t * 2 * Math.PI) / 4.5) > 0 ? 0.5 : 1; break;
    default: bob = Math.sin((t * 2 * Math.PI) / 3.2) > 0.55 ? -1 : 0;
  }
  const u = UNIT_PER_PX;
  const w = meta.w * u;
  const h = meta.h * u;
  const x0 = 60 - meta.cx * u;
  const y0 = GROUND - meta.foot * u;
  const box = { minX: x0, maxX: x0 + w, minY: y0, maxY: GROUND, midX: x0 + w * 0.42 };

  if (!f.perch) {
    const lift = Math.min(0.45, -bob / 30);
    const sw = w * 0.8 * (1 - lift) * (p === "dragged" ? 0.7 : 1);
    oval(g, 60, GROUND + 1.5, sw / 2, 3, `rgba(0,0,0,${p === "dragged" ? 0.06 : 0.12})`);
  }

  g.save();
  g.translate(60 + dx, GROUND + bob);
  g.rotate(tilt);
  g.translate(-60, -GROUND);
  if (p === "sick") g.filter = "saturate(35%) brightness(1.08)";
  g.drawImage(img, x0, y0, w, h);
  g.filter = "none";

  // 眨眼：idle 那张图上把眼睛盖成身体色，画一道闭眼弧
  if ((p === "blink" || (p === "idle" && t % 4.7 < 0.13)) && meta.eye) {
    const [ex, ey, ew, eh] = meta.eye;
    const cx = x0 + (ex + ew / 2) * u;
    const cy = y0 + (ey + eh / 2) * u;
    oval(g, cx, cy, (ew / 2) * u + 0.8, (eh / 2) * u + 0.8, LID[skinKey]);
    g.strokeStyle = skinKey === "light" ? "#2B5C9E" : "#0A1D45";
    g.lineWidth = 1.6;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(cx - (ew / 2) * u, cy);
    g.quadraticCurveTo(cx, cy + 3, cx + (ew / 2) * u, cy);
    g.stroke();
  }

  // 图里已经画了旗子、铃铛、红点、弧线；这里只补爱心、z、金币、青筋这些
  props(g, f, box, { x: x0 + w * 0.55, y: y0 + h * 0.62 }, {
    zees: { x: box.maxX - 4, y: box.minY + h * 0.35 },
    vein: { x: box.minX + w * 0.35, y: box.minY + 6 },
    sweat: { x: box.maxX - 2, y: box.minY + h * 0.4 },
  });
  g.restore();
}

/** 举起来的鱼鳍（挥手、庆祝） */
function flipper(g, x, y, angle, len, color) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, -3.2);
  g.quadraticCurveTo(len * 0.6, -4.6, len, -1.2);
  g.quadraticCurveTo(len + 1.2, 1.4, len - 1.5, 2.2);
  g.quadraticCurveTo(len * 0.5, 3.6, 0, 3.2);
  g.closePath();
  g.fill();
  g.restore();
}

/* 陪伴状态组：干活转圈的弧线、完成插小旗、出错头顶红点、等你确认挂铃铛 */
function companion(g, f, V, skin) {
  const p = f.pose;
  const t = f.t;
  const a = f.a;
  const b = V.box;
  if (p === "working") {
    g.strokeStyle = skin.top;
    g.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const start = t * 2.4 + i * 2.1;
      withAlpha(g, 0.55 + 0.15 * i, () => {
        g.lineWidth = 1.6;
        g.beginPath();
        g.ellipse(60, 68, 47, 38, 0, start, start + 0.55);
        g.stroke();
      });
    }
  } else if (p === "waiting") {
    // 铃铛：白底描边，一直轻轻地晃
    g.save();
    g.translate(b.midX + 4, b.minY - 10);
    g.rotate(0.35 * Math.sin(t * 7));
    g.fillStyle = "#FFFFFF";
    g.strokeStyle = "#0A2259";
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-5.5, 6);
    g.quadraticCurveTo(-4.8, -5, 0, -5.4);
    g.quadraticCurveTo(4.8, -5, 5.5, 6);
    g.lineTo(6.8, 7.6);
    g.lineTo(-6.8, 7.6);
    g.closePath();
    g.fill();
    g.stroke();
    oval(g, 0, -6.6, 1.2, 1.2, "#0A2259");
    oval(g, 0, 9.2, 1.4, 1.4, "#0A2259");
    g.restore();
  } else if (p === "celebrate") {
    // 小旗插在头顶，旗面飘
    const x = b.midX + 6;
    const y = b.minY + 2;
    strokePath(g, [[x, y], [x, y - 17]], "#0A2259", 1.1, "round");
    const wave = 1.5 * Math.sin(a * 10);
    g.fillStyle = skin.top;
    g.beginPath();
    g.moveTo(x, y - 17);
    g.quadraticCurveTo(x + 5, y - 15.5 + wave, x + 10, y - 14);
    g.quadraticCurveTo(x + 5, y - 12.5 + wave, x, y - 11);
    g.closePath();
    g.fill();
  } else if (p === "oops") {
    oval(g, b.midX + 6, b.minY - 8 - 1.2 * Math.abs(Math.sin(t * 4)), 2.6, 2.6, "#F0544B");
  }
}

function drawWhaleFace(g, V, skin, face, f, bodyFill) {
  const e = V.eye;
  const line = skin.lineOnBody;
  const look = face.look ?? f.look;
  const white = "#FFFFFF";
  const fillEye = () => { g.fillStyle = white; g.fill(V.eyeWhite); };
  const closedArc = (x, y, w) => {
    g.strokeStyle = line;
    g.lineWidth = 1.9;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x - w, y - 1);
    g.quadraticCurveTo(x, y + 3, x + w, y - 1);
    g.stroke();
  };
  // 眼皮：把眼白上半截盖成身体色，眼皮边缘一道线
  const lid = (frac, droop = 0) => {
    const yEdge = e.y - e.ry + 2 * e.ry * frac;
    g.save();
    g.clip(V.eyeWhite);
    g.fillStyle = bodyFill;
    g.beginPath();
    g.moveTo(e.x - e.rx - 2, e.y - e.ry - 2);
    g.lineTo(e.x + e.rx + 2, e.y - e.ry - 2);
    g.lineTo(e.x + e.rx + 2, yEdge + droop);
    g.quadraticCurveTo(e.x, yEdge + 1.5, e.x - e.rx - 2, yEdge - droop);
    g.closePath();
    g.fill();
    g.restore();
    g.strokeStyle = line;
    g.lineWidth = 1.7;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(e.x - e.rx - 0.5, yEdge - droop);
    g.quadraticCurveTo(e.x, yEdge + 1.5, e.x + e.rx + 0.5, yEdge + droop);
    g.stroke();
  };
  const pupil = (x, y, r) => {
    oval(g, x, y, r, r, "#0A1D45");
    oval(g, x - r * 0.35, y - r * 0.4, r * 0.32, r * 0.32, white);
  };

  switch (face.eye) {
    case "closed":
      closedArc(e.x, e.y + 1, e.rx);
      break;
    case "lid":
      fillEye();
      g.save(); g.translate(look.x * 0.6, look.y * 0.5); g.fillStyle = white; g.fill(V.glint); g.restore();
      lid(face.lid ?? 0.45, 0.8);
      break;
    case "side":
      fillEye();
      pupil(e.x - e.rx * 0.45, e.y + e.ry * 0.2, 2.3);
      lid(0.42, -0.6);
      break;
    case "round":
      fillEye();
      pupil(e.x - 0.5 + look.x * 0.6, e.y + 0.6 + look.y * 0.5, 3.1);
      break;
    case "heart":
      fillEye();
      heart(g, V.glintAt.x + 0.6, V.glintAt.y + 0.4, 5.2, "#F28AA6", false);
      break;
    default:
      fillEye();
      g.save();
      g.translate(look.x * 0.9, look.y * 0.7);
      g.fillStyle = white;
      g.fill(V.glint);
      g.restore();
  }

  // 正面另一只眼：表情资产里闭眼类表情会出现一道弧线
  if (face.left && V.leftEye) closedArc(V.leftEye.x, V.leftEye.y + 1, 4);

  // 眉毛
  const bx = e.x + 0.5;
  const by = e.y - e.ry - 2.6;
  const brow = (x1, y1, x2, y2) => strokePath(g, [[x1, y1], [x2, y2]], line, 1.7, "round");
  switch (face.brow) {
    case "up": g.strokeStyle = line; g.lineWidth = 1.7; g.lineCap = "round"; g.beginPath(); g.moveTo(bx - 3.5, by + 0.6); g.quadraticCurveTo(bx, by - 1.6, bx + 3.5, by + 0.4); g.stroke(); break;
    case "sad": brow(bx - 3.5, by - 0.8, bx + 3.5, by + 1.2); if (V.leftEye) brow(V.leftEye.x + 3.5, by - 0.8, V.leftEye.x - 3.5, by + 1.2); break;
    case "angry": brow(bx - 3.5, by + 1.4, bx + 3.5, by - 0.6); break;
    case "flat": brow(bx - 3, by, bx + 3, by); break;
    default:
  }

  if (face.cheek) withAlpha(g, 0.85, () => oval(g, e.x + (V === WHALE_FRONT ? -2 : 4), e.y + e.ry + 3, 3.2, 1.7, INK.cheek));

  // 嘴：画在白肚皮上
  const m = V.mouth;
  const ink = skin.lineOnBelly;
  // 侧面只在张嘴笑、嚼东西时露嘴；其余表情全靠眼睛
  if (V !== WHALE_FRONT && face.mouth !== "open" && face.mouth !== "chew") return;
  g.strokeStyle = ink;
  g.lineWidth = 1.8;
  g.lineCap = "round";
  switch (face.mouth) {
    case "smile":
      g.beginPath(); g.moveTo(m.x - 6, m.y - 1); g.quadraticCurveTo(m.x, m.y + 4.5, m.x + 6, m.y - 1); g.stroke(); break;
    case "soft":
      g.beginPath(); g.moveTo(m.x - 3, m.y); g.quadraticCurveTo(m.x, m.y + 2, m.x + 3, m.y); g.stroke(); break;
    case "frown":
      g.beginPath(); g.moveTo(m.x - 2.5, m.y + 1); g.quadraticCurveTo(m.x, m.y - 1.2, m.x + 2.5, m.y + 1); g.stroke(); break;
    case "o":
      oval(g, m.x, m.y, 1.5, 2.2, "#0A1D45"); break;
    case "open":
      // 张嘴笑（陪伴状态组·完成）：红色半圆
      g.fillStyle = "#E8605A";
      g.beginPath();
      g.moveTo(m.x - 4.5, m.y - 2);
      g.quadraticCurveTo(m.x, m.y - 2.6, m.x + 4.5, m.y - 2);
      g.quadraticCurveTo(m.x + 4, m.y + 4.5, m.x, m.y + 4.8);
      g.quadraticCurveTo(m.x - 4, m.y + 4.5, m.x - 4.5, m.y - 2);
      g.fill();
      break;
    case "chew": {
      const o = Math.floor(f.a * 8) % 2 === 0;
      oval(g, m.x, m.y, 2.2, o ? 2.2 : 0.9, "#0A1D45");
      break;
    }
    default:
  }
}

/* ------------------------------------------------------------------ */
/* 小道具                                                              */
/* ------------------------------------------------------------------ */

function props(g, f, body, mouth, at = {}) {
  const p = f.pose;
  // 小鲸鱼这几种状态用陪伴状态组的道具（companion 画），不再叠问号/彩带/汗珠/代码符号
  if (f.character !== "crab" && ["waiting", "celebrate", "oops", "working"].includes(p)) return;
  const t = f.t;
  const a = f.a;
  switch (p) {
    case "waiting": {
      const y = body.minY - 13 - 2 * Math.abs(Math.sin(t * 5.5));
      text(g, "?", 21, 900, INK.line, body.midX + 1, y + 1);
      text(g, "?", 21, 900, INK.amber, body.midX, y);
      break;
    }
    case "petted":
      heart(g, body.midX, body.minY - 8, 12, INK.cheek, true);
      break;
    case "celebrate":
      confetti(g, body, a);
      break;
    case "eating":
      token(g, mouth, { x: body.maxX + 18, y: body.minY - 6 }, a);
      break;
    case "oops":
      sweat(g, at.sweat?.x ?? body.maxX - 6, (at.sweat?.y ?? body.minY + 8) + Math.min(a, 1.5) * 4);
      break;
    case "sick":
      sweat(g, at.sweat?.x ?? body.maxX - 6, at.sweat?.y ?? body.minY + 9);
      break;
    case "sleeping":
      zees(g, at.zees?.x ?? body.maxX - 5, at.zees?.y ?? body.minY, t);
      break;
    case "working":
      glyphs(g, at.glyphs?.x ?? body.maxX + 5, at.glyphs?.y ?? body.minY + 5, t);
      break;
    case "hungry":
      rumble(g, body, t);
      break;
    case "pout":
      vein(g, at.vein?.x ?? body.maxX - 8, at.vein?.y ?? body.minY + 2, a);
      break;
    default:
  }
}

export function heart(g, cx, cy, s, color, outline) {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.42);
  g.bezierCurveTo(cx - s * 0.18, cy + s * 0.22, cx - s * 0.5, cy + s * 0.12, cx - s * 0.5, cy - s * 0.12);
  g.arc(cx - s * 0.25, cy - s * 0.12, s * 0.25, Math.PI, 0, false);
  g.arc(cx + s * 0.25, cy - s * 0.12, s * 0.25, Math.PI, 0, false);
  g.bezierCurveTo(cx + s * 0.5, cy + s * 0.12, cx + s * 0.18, cy + s * 0.22, cx, cy + s * 0.42);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  if (outline) {
    g.strokeStyle = INK.line;
    g.lineWidth = 1.3;
    g.lineJoin = "round";
    g.stroke();
  }
}

function confetti(g, body, a) {
  const colors = [INK.amber, INK.teal, INK.cheek];
  const k = Math.min(1, a / 1.1);
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * 2 * Math.PI + 0.3;
    const r = 12 + 44 * k;
    const x = body.midX + Math.cos(ang) * r;
    const y = body.minY + 8 + Math.sin(ang) * r * 0.55 + 20 * k * k;
    g.save();
    g.globalAlpha *= Math.max(0, 1 - a / 2);
    g.translate(x, y);
    g.rotate(a * 6 + i);
    rect(g, -2.5, -1.2, 5, 2.4, colors[i % 3]);
    g.restore();
  }
}

function token(g, to, from, a) {
  const cycle = a % 1.6;
  if (cycle > 1.1) return;
  const k = Math.min(1, cycle / 0.9);
  const e = k * k * (3 - 2 * k);
  const x = from.x + (to.x - from.x) * e;
  const y = from.y + (to.y - from.y) * e - 12 * Math.sin(e * Math.PI);
  const r = 6 * (1 - 0.4 * e);
  oval(g, x, y, r, r, INK.amber);
  g.strokeStyle = INK.line;
  g.lineWidth = 1.2;
  g.stroke();
  text(g, "T", 7 * (1 - 0.4 * e), 900, INK.line, x, y + 0.4);
}

function sweat(g, x, y) {
  g.beginPath();
  g.moveTo(x, y - 6);
  g.quadraticCurveTo(x + 6.5, y + 2, x, y + 4);
  g.quadraticCurveTo(x - 6.5, y + 2, x, y - 6);
  g.closePath();
  g.fillStyle = INK.cool;
  g.fill();
  g.strokeStyle = INK.line;
  g.lineWidth = 1.2;
  g.lineJoin = "round";
  g.stroke();
}

function icePack(g, x, y, w, h) {
  rect(g, x, y, w, h, INK.cool);
  g.strokeStyle = INK.line;
  g.lineWidth = 1.2;
  g.strokeRect(x, y, w, h);
}

function zees(g, x, y, t) {
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.28 + i / 3) % 1;
    withAlpha(g, Math.sin(ph * Math.PI), () => {
      text(g, "z", 8 + 6 * ph, 800, INK.teal, x + 4 + 12 * ph, y - 26 * ph);
    });
  }
}

function glyphs(g, x, y, t) {
  const set = ["<", "/", ">", "{", "}", "_", ";"];
  for (let i = 0; i < 3; i++) {
    const v = t * 0.7 + i / 3;
    const ph = v % 1;
    withAlpha(g, 0.85 * Math.sin(ph * Math.PI), () => {
      text(g, set[(Math.floor(v) * 3 + i) % set.length], 10, 800, INK.teal, x + 6 + 5 * Math.sin(v * 3), y - 30 * ph, true);
    });
  }
}

function rumble(g, body, t) {
  if (t % 6 >= 1.2) return;
  g.strokeStyle = "rgba(14,59,67,0.6)";
  g.lineWidth = 1.4;
  g.lineCap = "round";
  for (let i = 0; i < 2; i++) {
    const x = body.maxX + 3 + i * 4;
    const y = (body.minY + body.maxY) / 2 + 6;
    g.beginPath();
    g.moveTo(x, y - 5);
    g.quadraticCurveTo(x + 4, y, x, y + 5);
    g.stroke();
  }
}

/** 生气：头角上一个「井」字小青筋，一跳一跳 */
function vein(g, x, y, a) {
  const s = 1 + 0.15 * Math.abs(Math.sin(a * 9));
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.strokeStyle = INK.mouth;
  g.lineWidth = 1.8;
  g.lineCap = "round";
  for (const [x1, y1, x2, y2] of [[-4, -1.5, -1.5, -1.5], [1.5, -1.5, 4, -1.5], [-4, 1.5, -1.5, 1.5], [1.5, 1.5, 4, 1.5], [-1.5, -4, -1.5, -1.5], [1.5, -4, 1.5, -1.5], [-1.5, 1.5, -1.5, 4], [1.5, 1.5, 1.5, 4]]) {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }
  g.restore();
}

/* ------------------------------------------------------------------ */
/* DSH 那边撒出来的粒子（坐标是旧的 190×150 半尺寸格），换成同一套画法  */
/* ------------------------------------------------------------------ */

export function drawParticles(g, particles, clipIn) {
  const colors = [INK.amber, INK.teal, INK.cheek];
  for (const q of particles) {
    if (q.y > clipIn + 6) continue;
    const life = q.life / q.maxLife;
    withAlpha(g, Math.min(1, life * 2), () => {
      switch (q.kind) {
        case "heart":
          heart(g, q.x, q.y, 5.5, INK.cheek, false);
          break;
        case "token":
          oval(g, q.x, q.y, 2.4, 2.4, INK.amber);
          g.strokeStyle = INK.line;
          g.lineWidth = 0.6;
          g.stroke();
          break;
        case "confetti":
          g.save();
          g.translate(q.x, q.y);
          g.rotate(q.x * 0.3 + q.life * 0.004);
          rect(g, -1.3, -0.6, 2.6, 1.2, colors[Math.abs(Math.round(q.x * 7)) % 3]);
          g.restore();
          break;
        case "crumb":
          rect(g, q.x, q.y, 1.6, 1.6, INK.amber);
          break;
        case "sweat":
          g.save();
          g.translate(q.x, q.y);
          g.scale(0.5, 0.5);
          sweat(g, 0, 0);
          g.restore();
          break;
        case "star":
        case "sparkle":
          sparkle(g, q.x, q.y, q.kind === "star" ? INK.amber : "#FFFFFF");
          break;
        default:
      }
    });
  }
}

function sparkle(g, x, y, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - 3);
  g.quadraticCurveTo(x, y, x + 3, y);
  g.quadraticCurveTo(x, y, x, y + 3);
  g.quadraticCurveTo(x, y, x - 3, y);
  g.quadraticCurveTo(x, y, x, y - 3);
  g.fill();
  g.strokeStyle = INK.line;
  g.lineWidth = 0.5;
  g.stroke();
}
