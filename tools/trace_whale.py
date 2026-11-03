#!/usr/bin/env python3
"""从三视图（docs/whale-assets/三视图.png）描出正面鲸鱼，输出 sprite.js 里 WHALE_FRONT 的四条路径。
侧面轮廓见 trace_logo.py。需要 opencv-python-headless。
正面图的白肚皮右下有一道缝通到外面，用 71px 闭运算把缝合上才能单独描出肚皮。"""
import json, sys
import cv2, numpy as np

im = cv2.imread(sys.argv[1]).astype(int)
x0, y0 = 130, 440
c = im[y0:1150, x0:920]
blue = np.clip((c[:, :, 0] - c[:, :, 2] - 60) * 3, 0, 255).astype(np.uint8)
_, m = cv2.threshold(cv2.GaussianBlur(blue, (0, 0), 2), 127, 255, cv2.THRESH_BINARY)
cs, h = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
closed = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (71, 71)))
cs2, h2 = cv2.findContours(closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
belly = max([cc for i, cc in enumerate(cs2) if h2[0][i][3] >= 0], key=cv2.contourArea)
X, Y, W, H = cv2.boundingRect(cs[0]); s = 78 / W
U = lambda x, y: (60 - W * s / 2 + (x - X) * s, 100 - (Y + H - y) * s)
d = lambda cc, eps=1.0: "M" + "L".join("%.2f %.2f" % U(x, y) for x, y in cv2.approxPolyDP(cc, eps, True)[:, 0, :]) + "Z"
inner = [cc for i, cc in enumerate(cs) if h[0][i][3] == 0]
print(json.dumps({"body": d(cs[0]), "belly": d(belly), "eyeWhite": d(max(inner, key=cv2.contourArea)), "glint": d(min(inner, key=cv2.contourArea), 0.6)}))
