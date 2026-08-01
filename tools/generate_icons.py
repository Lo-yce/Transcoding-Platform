# -*- coding: utf-8 -*-
"""一次性工具：根据 assets/icons/icon.svg 的设计，用 PIL 生成各尺寸 PNG 图标。
   - icon-180.png  → iOS apple-touch-icon
   - icon-192.png  → PWA manifest
   - icon-512.png  → PWA manifest
   说明：采用方形全出血背景（无圆角、无透明），兼容 iOS（系统自加圆角）与 Android。
"""
from PIL import Image, ImageDraw

GREEN = (0, 168, 89)
WHITE = (255, 255, 255)

# SVG 设计（512 画布）的矩形： (x, y, w, h)
WHITE_RECTS = [
    (96, 96, 120, 120), (296, 96, 120, 120), (96, 296, 120, 120),
    (256, 256, 40, 40), (336, 296, 40, 40), (376, 336, 40, 40),
    (296, 376, 40, 40), (256, 376, 40, 40), (376, 256, 40, 40),
]
INNER_GREEN = [
    (128, 128, 56, 56), (328, 128, 56, 56), (128, 328, 56, 56),
]


def draw_at(canvas_size):
    """先在 512 画布上精确绘制，再缩放到目标尺寸（获得抗锯齿）。"""
    S = 512
    img = Image.new('RGBA', (S, S), GREEN + (255,))  # 方形全出血绿色背景
    d = ImageDraw.Draw(img)
    for (x, y, w, h) in WHITE_RECTS:
        d.rectangle([x, y, x + w, y + h], fill=WHITE + (255,))
    for (x, y, w, h) in INNER_GREEN:
        d.rectangle([x, y, x + w, y + h], fill=GREEN + (255,))
    if canvas_size != S:
        img = img.resize((canvas_size, canvas_size), Image.LANCZOS)
    return img


def main():
    import os
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons')
    out_dir = os.path.abspath(out_dir)
    for size in (180, 192, 512):
        img = draw_at(size).convert('RGB')  # 转 RGB 去透明，兼容性最佳
        path = os.path.join(out_dir, 'icon-%d.png' % size)
        img.save(path, 'PNG')
        print('saved', path)


if __name__ == '__main__':
    main()
