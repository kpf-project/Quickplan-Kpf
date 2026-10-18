from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PNG_OUT = ROOT / "docs" / "manuals"
PDF_OUT = ROOT / "output" / "pdf"
PNG_OUT.mkdir(parents=True, exist_ok=True)
PDF_OUT.mkdir(parents=True, exist_ok=True)

SOURCES = [
    Path(r"C:\Users\Riew\AppData\Local\Temp\codex-clipboard-3cd973d0-b441-4b2f-b149-35999f148840.png"),
    Path(r"C:\Users\Riew\AppData\Local\Temp\codex-clipboard-2ea46ea0-ae13-4f8d-8ac0-1fe45aa637b8.png"),
    Path(r"C:\Users\Riew\AppData\Local\Temp\codex-clipboard-388b03ff-0284-4bec-b0dd-31c591da26f5.png"),
    Path(r"C:\Users\Riew\AppData\Local\Temp\codex-clipboard-d17a8ce5-7733-4ac7-a4c7-35876d8917f6.png"),
]

NAVY = "#0D2E5B"
GOLD = "#E3B72E"
WHITE = "#FFFFFF"
PAPER = "#F4F6F8"
INK = "#10233F"
MUTED = "#52647D"
GREEN = "#07815D"
FONT = r"C:\Windows\Fonts\LeelawUI.ttf"
FONT_BOLD = r"C:\Windows\Fonts\LeelaUIb.ttf"


def f(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT, size)


def fit_cover(image, width, height):
    scale = max(width / image.width, height / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - width) // 2
    top = (resized.height - height) // 2
    return resized.crop((left, top, left + width, top + height))


def add_step(page, y, number, title, instruction, image):
    draw = ImageDraw.Draw(page)
    draw.rounded_rectangle((90, y, 2390, y + 690), radius=28, fill=WHITE, outline="#D5DEE9", width=3)
    draw.ellipse((125, y + 26, 245, y + 146), fill=GOLD)
    text = str(number)
    box = draw.textbbox((0, 0), text, font=f(62, True))
    draw.text((185 - (box[2] - box[0]) / 2, y + 82 - (box[3] - box[1]) / 2), text, fill=NAVY, font=f(62, True))
    draw.text((285, y + 28), title, fill=INK, font=f(47, True))
    draw.text((1180, y + 44), instruction, fill=MUTED, font=f(29))

    screenshot = fit_cover(image, 2180, 500)
    mask = Image.new("L", screenshot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, screenshot.width, screenshot.height), radius=18, fill=255)
    page.paste(screenshot, (150, y + 165), mask)


page = Image.new("RGB", (2480, 3508), PAPER)
draw = ImageDraw.Draw(page)

# Header
draw.rectangle((0, 0, 2480, 285), fill=NAVY)
draw.rectangle((0, 285, 2480, 300), fill=GOLD)
logo_source = Image.open(SOURCES[0]).convert("RGB").crop((0, 0, 86, 86)).resize((145, 145), Image.Resampling.LANCZOS)
logo_mask = Image.new("L", (145, 145), 0)
ImageDraw.Draw(logo_mask).ellipse((0, 0, 145, 145), fill=255)
page.paste(logo_source, (105, 62), logo_mask)
draw.text((300, 52), "คู่มือการตรวจเช็คยอดงานประจำวัน", fill=WHITE, font=f(67, True))
draw.text((305, 150), "WORK INSTRUCTION • KPF QUICKPLAN", fill="#C8D7EA", font=f(30, True))
draw.rounded_rectangle((1850, 70, 2340, 205), radius=20, fill="#173F73", outline="#6481A6", width=2)
draw.text((1915, 91), "WI-PD-001", fill=GOLD, font=f(31, True))
draw.text((1915, 145), "4 ขั้นตอน • A4", fill=WHITE, font=f(25))

images = [Image.open(path).convert("RGB") for path in SOURCES]
images[0] = images[0].crop((0, 250, 1150, 520))
images[1] = images[1].crop((100, 70, 1516, 400))
images[2] = images[2].crop((150, 260, 1810, 620))
images[3] = images[3].crop((0, 70, 1816, 452))

steps = [
    (330, 1, "เข้าเมนูชั่งน้ำหนักผลิตภัณฑ์", "เลือกเมนู “ชั่งน้ำหนักผลิตภัณฑ์”", images[0]),
    (1060, 2, "เปิดรายงานวัตถุดิบและผลผลิต", "กด “รายงาน” แล้วเลือกรายงานวัตถุดิบและผลผลิต", images[1]),
    (1790, 3, "เลือกวันที่วันนี้ แล้วค้นหา", "กำหนดวันที่ทั้ง 2 ช่องเป็นวันนี้ แล้วกด “แสดงรายงาน”", images[2]),
    (2520, 4, "ตรวจเช็คยอดก่อนจบงาน", "ตรวจจำนวนและน้ำหนักของเปลือก แยม และผลผลิต", images[3]),
]

for step in steps:
    add_step(page, *step)

# Precise, high-contrast callouts.
overlay = ImageDraw.Draw(page, "RGBA")
overlay.rounded_rectangle((145, 330 + 420, 700, 330 + 575), radius=20, outline=(227, 183, 46, 255), width=14, fill=(227, 183, 46, 28))
overlay.rounded_rectangle((950, 1060 + 300, 1710, 1060 + 520), radius=20, outline=(227, 183, 46, 255), width=14, fill=(227, 183, 46, 28))
overlay.rounded_rectangle((170, 1790 + 205, 2300, 1790 + 410), radius=20, outline=(227, 183, 46, 255), width=14, fill=(227, 183, 46, 25))
overlay.rounded_rectangle((155, 2520 + 250, 905, 2520 + 635), radius=18, outline=(227, 183, 46, 255), width=12, fill=(227, 183, 46, 18))
overlay.rounded_rectangle((905, 2520 + 250, 1555, 2520 + 635), radius=18, outline=(25, 121, 180, 255), width=12, fill=(25, 121, 180, 16))
overlay.rounded_rectangle((1555, 2520 + 250, 2325, 2520 + 635), radius=18, outline=(7, 129, 93, 255), width=12, fill=(7, 129, 93, 16))

# Footer
draw = ImageDraw.Draw(page)
draw.rectangle((0, 3435, 2480, 3508), fill=NAVY)
draw.text((100, 3451), "จุดตรวจสำคัญ", fill=GOLD, font=f(27, True))
draw.text((360, 3451), "วันที่ถูกต้อง • ยอดเปลือกครบ • ยอดแยมครบ • ยอดผลผลิตถูกต้อง", fill=WHITE, font=f(27, True))

png_path = PNG_OUT / "คู่มือการตรวจเช็คยอดงานประจำวัน-A4-แนวตั้ง.png"
pdf_path = PDF_OUT / "คู่มือการตรวจเช็คยอดงานประจำวัน-A4-แนวตั้ง.pdf"
page.save(png_path, dpi=(300, 300), optimize=True)
page.save(pdf_path, "PDF", resolution=300.0)
print("Created portrait daily work guide")
