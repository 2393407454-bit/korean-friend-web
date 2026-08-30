#!/usr/bin/env python3
"""生成小程序海浪背景素材：横向可无缝拼接的波浪条 PNG（带透明通道）。
四色规范：浅青 #E0F7FA / 天蓝 #B2EBF2 / 海蓝 #80DEEA / 深青 #4DB6AC
重新生成：python3 tools/gen_waves.py
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

W, H = 1500, 560  # 宽 = 波浪整数个周期，保证左右无缝拼接
OUT = os.path.join(os.path.dirname(__file__), "..", "miniprogram", "images")
os.makedirs(OUT, exist_ok=True)

# (文件名, 主色, 浪峰高光, 基线y, 大涌浪幅A, 周期k1, 小起伏幅B, 周期k2, 相位, 不透明度)
LAYERS = [
    ("wave-1.png", (77, 182, 172), (178, 235, 242), 210, 62, 1, 16, 4, 0.0, 245),  # 深青：后排大浪
    ("wave-2.png", (128, 222, 234), (224, 247, 250), 320, 52, 2, 14, 5, 2.4, 235),  # 海蓝：中排
    ("wave-3.png", (178, 235, 242), (255, 255, 255), 430, 44, 2, 12, 6, 4.6, 225),  # 天蓝：前排
]


def wave_y(x, base, a1, k1, a2, k2, phase):
    t = 2 * math.pi * x / W
    return base + a1 * math.sin(k1 * t + phase) + a2 * math.sin(k2 * t + phase * 1.7)


for name, color, crest, base, a1, k1, a2, k2, phase, alpha in LAYERS:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pts = [(x, wave_y(x, base, a1, k1, a2, k2, phase)) for x in range(W + 1)]
    d.polygon(pts + [(W, H), (0, H)], fill=color + (alpha,))

    # 浪尖泡沫高光：沿波峰画柔和浅色线
    crest_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(crest_layer)
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        cd.line([(x0, y0), (x1, y1)], fill=crest + (200,), width=5)
    crest_layer = crest_layer.filter(ImageFilter.GaussianBlur(1.2))
    img = Image.alpha_composite(img, crest_layer)

    # 波峰到底部的柔和纵向亮度渐变（用平滑渐变图合成，避免条纹）
    top_y = int(min(y for _, y in pts))
    grad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(top_y, H):
        fade = (y - top_y) / max(1, H - top_y)
        gd.line([(0, y), (W, y)], fill=(255, 255, 255, int(30 * (1 - fade))))
    grad = grad.filter(ImageFilter.GaussianBlur(6))
    img = Image.alpha_composite(img, grad)

    img.save(os.path.join(OUT, name))
    print("生成", name, f"基线y={base} 涌幅±{a1}")

print("完成 →", os.path.abspath(OUT))
