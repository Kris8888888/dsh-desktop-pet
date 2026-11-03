#!/usr/bin/env python3
"""从 DeepSeek 图标原图描出鲸鱼轮廓，输出 sprite.js 里 WHALE 用的四条路径（单位格坐标）。
用法: python3 tools/trace_logo.py docs/deepseek-logo.png > /tmp/paths.json   （需要 opencv-python-headless）
原图右边尾巴尖被裁平了，这里补成尖角。"""
import json, sys
import cv2, numpy as np

im = cv2.imread(sys.argv[1]).astype(int)
blue = np.clip((im[:, :, 0] - im[:, :, 2] - 20) * 4, 0, 255).astype(np.uint8)
blue = cv2.GaussianBlur(blue, (0, 0), 3)
_, m = cv2.threshold(blue, 127, 255, cv2.THRESH_BINARY)
cs, _ = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
s = 84 / 1414
U = lambda x, y: (18 + (x - 220) * s, 100 - (1387 - y) * s)
pts = lambda c, eps=1.0: [tuple(map(int, p)) for p in cv2.approxPolyDP(c, eps, True)[:, 0, :]]
body = []
for p in pts(cs[0]):
    if p == (1633, 536): body += [(1638, 525), (1648, 490), (1658, 440), (1664, 395), (1662, 374)]
    elif p == (1633, 382): body += [(1652, 372), (1640, 377)]
    else: body.append(p)
d = lambda ps: "M" + "L".join("%.2f %.2f" % U(x, y) for x, y in ps) + "Z"
print(json.dumps({"body": d(body), "belly": d(pts(cs[3])), "eyeWhite": d(pts(cs[2])), "glint": d(pts(cs[1], 0.6))}))
