#!/usr/bin/env python3
"""把设计稿里的鲸鱼一只只切成透明底 PNG（连同旗子、铃铛、红点、弧线这些道具），去掉背景和地上的影子。
用法: python3 tools/cut_sprites.py docs/whale-assets pet/sprites
输出 pet/sprites/whale-<名字>[-deep|-light].png 和 pet/sprites-meta.js（每张图的脚底、中心、眼睛位置，单位：图片像素）。需要 opencv-python-headless。"""
import json, sys, pathlib
import cv2, numpy as np

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)

# 图 → 从左到右（再从上到下）每只鲸鱼的名字
SHEETS = {
    "陪伴状态.png": ["idle", "working", "done", "error", "waiting"],
    "动作.png": ["sit", "wave", "lean", "hop", "nap", "sleep"],
}

def fg_mask(im):
    r, g, b = [im[:, :, i].astype(int) for i in (2, 1, 0)]
    white = (r > 238) & (g > 238) & (b > 238)
    blue = (r < 150) & (b - r > 40)
    dark = (r + g + b) < 360
    red = (r > 170) & (r - g > 60)
    return (white | blue | dark | red).astype(np.uint8) * 255

# 缩到实际用得到的分辨率（「特大」+ 2 倍屏时 idle 身宽约 290px）
SCALE = 0.62
# 动作图比陪伴图画得大一圈，统一到同一个大小
SHEET_FIT = {"陪伴状态.png": 1.0, "动作.png": 0.87}
# 配色皮肤：把身体的蓝按深浅映射到皮肤的上下两色；白肚皮、深色线条、红色不动
SKINS = {"deep": ((0x0F, 0x3B, 0x68), (0x06, 0x24, 0x43)), "light": ((0xC7, 0xE6, 0xFE), (0xA8, 0xD2, 0xF6))}

def recolor(rgba, top, bottom):
    """身体的蓝按「有多蓝」连续地换成皮肤色：白肚皮、深色线条（蓝得不够）、红色都不动。"""
    out = rgba.copy()
    b, g, r = [rgba[:, :, i].astype(float) for i in (0, 1, 2)]
    weight = np.clip((b - r - 70) / 60, 0, 1)
    t = np.clip((b - 150) / 70, 0, 1)
    for ch, (ti, bi) in zip((2, 1, 0), zip(top, bottom)):
        skin = bi + (ti - bi) * t
        out[:, :, ch] = np.clip(rgba[:, :, ch] * (1 - weight) + skin * weight, 0, 255).astype(np.uint8)
    return out

meta = {}
for sheet, names in SHEETS.items():
    im = cv2.imread(str(src / sheet))
    bg = np.median(im[:40, :40].reshape(-1, 3), axis=0)
    m = fg_mask(im)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, stats, cent = cv2.connectedComponentsWithStats(m)
    big = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] > 15000]
    # 按行再按列排序（动作图是 2 列 3 行）
    big.sort(key=lambda i: (round(cent[i][1] / 380), cent[i][0]))
    assert len(big) == len(names), (sheet, len(big))
    for name, i in zip(names, big):
        x, y, w, h = stats[i, :4]
        # 道具：离这只鲸鱼最近、且就在它上方或旁边的小连通块（旗子、铃铛、红点、弧线）
        def gap(j, k):
            jx, jy, jw, jh = stats[j, :4]; kx, ky, kw, kh = stats[k, :4]
            dx = max(kx - (jx + jw), jx - (kx + kw), 0); dy = max(ky - (jy + jh), jy - (ky + kh), 0)
            return (dx * dx + dy * dy) ** 0.5
        keep = np.zeros(lab.shape, bool)
        for j in [i] + [j for j in range(1, n) if j not in big and stats[j, cv2.CC_STAT_AREA] >= 40]:
            if j != i and (min(big, key=lambda k: gap(j, k)) != i or gap(j, i) > 140): continue
            # 连通块外轮廓里面整块填满：白肚皮、眼睛和蓝色交界处的过渡色不会漏成透明斑点
            comp = (lab == j).astype(np.uint8)
            cs, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            filled = np.zeros_like(comp)
            cv2.drawContours(filled, cs, -1, 1, -1)
            keep |= filled.astype(bool)
        ys, xs = np.nonzero(keep)
        x0, x1, y0, y1 = xs.min() - 6, xs.max() + 7, ys.min() - 6, ys.max() + 7
        crop = im[y0:y1, x0:x1].astype(float)
        a = cv2.GaussianBlur(keep[y0:y1, x0:x1].astype(np.float32), (0, 0), 0.9)
        a = np.clip(a * 1.25, 0, 1)
        safe = np.maximum(a, 1e-3)[..., None]
        rgb = np.clip((crop - (1 - a[..., None]) * bg) / safe, 0, 255)
        rgba = np.dstack([rgb, a * 255]).astype(np.uint8)
        fit = SCALE * SHEET_FIT[sheet]
        small = cv2.resize(rgba, (round(rgba.shape[1] * fit), round(rgba.shape[0] * fit)), interpolation=cv2.INTER_AREA)
        cv2.imwrite(str(out / f"whale-{name}.png"), small)
        # 纯插件版用的经典蓝 WebP（构建时内嵌进 client.js），放在仓库根的 sprites/
        webp_dir = out.parent.parent / "sprites"
        webp_dir.mkdir(exist_ok=True)
        cv2.imwrite(str(webp_dir / f"whale-{name}.webp"), small, [cv2.IMWRITE_WEBP_QUALITY, 88])
        for skin, (top, bottom) in SKINS.items():
            cv2.imwrite(str(out / f"whale-{name}-{skin}.png"), recolor(small, top, bottom))
        # 眼睛：鲸鱼身上中等大小的白块里最靠右上的
        body = (lab[y0:y1, x0:x1] == i).astype(np.uint8)
        holes = cv2.morphologyEx(body, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8)) - body
        c = crop.astype(int)
        whitepx = ((c[:, :, 0] > 230) & (c[:, :, 1] > 230) & (c[:, :, 2] > 230)).astype(np.uint8)
        k, wl, ws, wc = cv2.connectedComponentsWithStats(whitepx)
        eyes = [q for q in range(1, k) if 400 < ws[q, cv2.CC_STAT_AREA] < 9000]
        eye = None
        if eyes:
            q = max(eyes, key=lambda q: wc[q][0] - wc[q][1] * 0.5)
            ex, ey, ew, eh = ws[q, :4]
            eye = [int(ex), int(ey), int(ew), int(eh)]
        q = lambda v: round(float(v) * fit, 1)
        meta[name] = {
            "w": int(small.shape[1]), "h": int(small.shape[0]),
            "foot": q(y + h - y0),            # 鲸鱼身体最低点（脚底）
            "cx": q(x + w / 2 - x0),           # 身体横向中心
            "eye": [q(v) for v in eye] if eye else None,
        }
        print(name, meta[name])
# 给 sprite.js 直接 import 的尺寸表
(out.parent / "sprites-meta.js").write_text("// tools/cut_sprites.py 生成，别手改\nexport const SPRITE_META = " + json.dumps(meta, ensure_ascii=False) + ";\n")
