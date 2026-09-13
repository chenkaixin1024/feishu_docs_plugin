from PIL import Image, ImageDraw
import os

BASE = "/Users/chenkaixin/AICode/feishu_docs_plugin"
SIZES = [16, 48, 128]

def draw_icon(size):
    img = Image.new("RGBA", (size, size), (30, 30, 30, 255))  # #1E1E1E
    draw = ImageDraw.Draw(img)
    pad = int(size * 0.18)
    margin = int(size * 0.22)
    w = size - margin * 2
    h = size - margin * 2
    x, y = margin, margin
    r = int(size * 0.08)
    # 文档外形（白色描边）
    draw.rounded_rectangle([x, y, x + w, y + h], radius=r, outline=(255, 255, 255, 255), width=max(1, int(size * 0.06)))
    # 文档内横线
    line_y1 = int(y + h * 0.32)
    line_y2 = int(y + h * 0.50)
    line_y3 = int(y + h * 0.68)
    line_x_start = x + int(w * 0.22)
    line_x_end = x + w - int(w * 0.22)
    line_width = max(1, int(size * 0.045))
    draw.line([(line_x_start, line_y1), (line_x_end, line_y1)], fill=(255, 255, 255, 255), width=line_width)
    draw.line([(line_x_start, line_y2), (line_x_end, line_y2)], fill=(255, 255, 255, 255), width=line_width)
    draw.line([(line_x_start, line_y3), (line_x_end, line_y3)], fill=(255, 255, 255, 255), width=line_width)
    return img

for s in SIZES:
    icon = draw_icon(s)
    icon.save(os.path.join(BASE, f"icon{s}.png"))
    print(f"Generated icon{s}.png")
