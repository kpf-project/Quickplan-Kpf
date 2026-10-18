from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "manuals"
OUT.mkdir(parents=True, exist_ok=True)
PDF_OUT = ROOT / "output" / "pdf"
PDF_OUT.mkdir(parents=True, exist_ok=True)

IMAGES = [
    Path(r"C:\Users\Riew\AppData\Local\Temp\codex-clipboard-94417a1b-196c-4c60-9404-f984143144d5.png"),
    Path(r"C:\Users\Riew\AppData\Local\Temp\codex-clipboard-45ba5230-7186-444b-8e5d-1db4feaa407c.png"),
    Path(r"C:\Users\Riew\AppData\Local\Temp\codex-clipboard-b567c4ab-8fb4-49b7-ab9a-d61a46aa94e5.png"),
    Path(r"C:\Users\Riew\AppData\Local\Temp\codex-clipboard-a63e3c34-a009-4c02-940e-7e4b411715fd.png"),
]

NAVY = "#0D2E5B"
NAVY_2 = "#173D70"
GOLD = "#E1B52D"
CREAM = "#F7F5EF"
INK = "#10233F"
MUTED = "#61718A"
GREEN = "#0C7A5A"
WHITE = "#FFFFFF"

FONT = r"C:\Windows\Fonts\LeelawUI.ttf"
FONT_BOLD = r"C:\Windows\Fonts\LeelaUIb.ttf"


def font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)


def cover(image, box):
    x, y, w, h = box
    scale = max(w / image.width, h / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - w) // 2
    top = (resized.height - h) // 2
    return resized.crop((left, top, left + w, top + h))


def contain(image, box, background=WHITE):
    x, y, w, h = box
    scale = min(w / image.width, h / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    panel = Image.new("RGB", (w, h), background)
    panel.paste(resized, ((w - resized.width) // 2, (h - resized.height) // 2))
    return panel


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def add_step(canvas, box, number, title, body, screenshot, mode="cover"):
    draw = ImageDraw.Draw(canvas)
    x, y, w, h = box
    rounded(draw, (x, y, x + w, y + h), 30, WHITE, "#DCE3EC", 3)

    image_h = 510
    image_box = (x + 22, y + 22, w - 44, image_h)
    panel = cover(screenshot, image_box) if mode == "cover" else contain(screenshot, image_box)
    mask = Image.new("L", panel.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, panel.width, panel.height), radius=22, fill=255)
    canvas.paste(panel, (image_box[0], image_box[1]), mask)

    badge_x, badge_y = x + 38, y + image_h - 10
    draw.ellipse((badge_x, badge_y, badge_x + 94, badge_y + 94), fill=GOLD, outline=WHITE, width=8)
    n = str(number)
    nb = draw.textbbox((0, 0), n, font=font(50, True))
    draw.text((badge_x + 47 - (nb[2] - nb[0]) / 2, badge_y + 44 - (nb[3] - nb[1]) / 2), n, fill=NAVY, font=font(50, True))

    text_x = x + 150
    draw.text((text_x, y + 570), title, fill=INK, font=font(46, True))
    draw.multiline_text((text_x, y + 635), body, fill=MUTED, font=font(31), spacing=10)


canvas = Image.new("RGB", (3508, 2480), CREAM)
draw = ImageDraw.Draw(canvas)

draw.rectangle((0, 0, 3508, 290), fill=NAVY)
draw.rectangle((0, 290, 3508, 306), fill=GOLD)
draw.ellipse((150, 74, 296, 220), fill=GOLD)
draw.text((178, 115), "KPF", fill=NAVY, font=font(34, True))
draw.text((345, 64), "คู่มือการตรวจเช็คยอดงานประจำวัน", fill=WHITE, font=font(78, True))
draw.text((348, 168), "ตรวจสอบยอดเปลือก แยม และผลผลิตให้ถูกต้องก่อนจบงาน", fill="#C8D6E8", font=font(34))

pill = (2780, 82, 3335, 215)
rounded(draw, pill, 66, NAVY_2, "#52719B", 2)
draw.text((2890, 111), "KPF QUICKPLAN", fill=GOLD, font=font(36, True))

screens = [Image.open(path).convert("RGB") for path in IMAGES]

# Focus each screenshot on the relevant control while preserving the original UI.
screens[0] = screens[0].crop((0, 0, 1220, 620))
screens[1] = screens[1].crop((120, 0, 1470, 640))
screens[2] = screens[2].crop((130, 165, 1810, 830))
screens[3] = screens[3].crop((0, 70, 1816, 452))

cards = [
    (115, 385, 1580, 910),
    (1813, 385, 1580, 910),
    (115, 1390, 1580, 910),
    (1813, 1390, 1580, 910),
]

add_step(canvas, cards[0], 1, "เข้าเมนูชั่งน้ำหนักผลิตภัณฑ์", "เมื่อเข้าโปรแกรมแล้ว เลือกเมนู\n“ชั่งน้ำหนักผลิตภัณฑ์”", screens[0])
add_step(canvas, cards[1], 2, "เปิดรายงานวัตถุดิบและผลผลิต", "เลือก “รายงาน” จากนั้นเลือก\n“รายงานวัตถุดิบและผลผลิต”", screens[1])
add_step(canvas, cards[2], 3, "เลือกวันที่วันนี้ แล้วค้นหา", "กำหนด “จากวันที่” และ “ถึงวันที่”\nเป็นวันนี้ จากนั้นกด “แสดงรายงาน”", screens[2])
add_step(canvas, cards[3], 4, "ตรวจสอบยอดก่อนจบงาน", "ตรวจเช็คจำนวนและน้ำหนักของ\nเปลือก แยม และผลผลิตให้ถูกต้อง", screens[3])

# Add clear action highlights after composition.
draw = ImageDraw.Draw(canvas, "RGBA")
draw.rounded_rectangle((125, 735, 560, 855), radius=18, outline=(225, 181, 45, 255), width=12, fill=(225, 181, 45, 30))
draw.rounded_rectangle((2275, 505, 3260, 850), radius=18, outline=(225, 181, 45, 255), width=12, fill=(225, 181, 45, 28))
draw.rounded_rectangle((210, 1435, 1600, 1665), radius=18, outline=(225, 181, 45, 255), width=12, fill=(225, 181, 45, 25))
draw.rounded_rectangle((1860, 1435, 3330, 1900), radius=18, outline=(12, 122, 90, 255), width=12, fill=(12, 122, 90, 20))

# Footer reminder.
draw = ImageDraw.Draw(canvas)
rounded(draw, (650, 2325, 2858, 2425), 50, "#E8EEF5")
draw.text((795, 2348), "จุดตรวจสำคัญ: ตรวจยอดเปลือก แยม และผลผลิตให้ครบก่อนจบงานทุกวัน", fill=NAVY, font=font(32, True))

png_path = OUT / "คู่มือการตรวจเช็คยอดงานประจำวัน-A4-แนวนอน.png"
pdf_path = PDF_OUT / "คู่มือการตรวจเช็คยอดงานประจำวัน-A4-แนวนอน.pdf"
canvas.save(png_path, dpi=(300, 300), optimize=True)
canvas.save(pdf_path, "PDF", resolution=300.0)
print("Created PNG and PDF in docs/manuals")
