#!/usr/bin/env python3
"""Render teacher-login (lgnRoot) frame to JPEG from Teacher-portal.pen layout."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "pen-files" / "exports"
OUT_PATH = OUT_DIR / "teacher-login.jpg"

W, H = 1440, 900
LEFT_W = 945
RIGHT_W = W - LEFT_W
TEAL = "#00A99D"
WHITE = "#FFFFFF"


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc" if bold else "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def rounded_rect(draw, xy, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def draw_left_panel(img: Image.Image, draw: ImageDraw.ImageDraw):
    # Background gradient placeholder (character image asset not in repo)
    for y in range(H):
        t = y / H
        r = int(224 + (240 - 224) * t)
        g = int(247 + (253 - 247) * t)
        b = int(245 + (250 - 245) * t)
        draw.line([(0, y), (LEFT_W, y)], fill=(r, g, b))

    pad_x, pad_y = 56, 40
    y = pad_y

    draw.text((pad_x, y), "Orenda School", fill=hex_rgb("#111827"), font=load_font(38, True))
    y += 52
    draw.text((pad_x, y), "教員ポータルへようこそ", fill=hex_rgb(TEAL), font=load_font(20, True))
    y += 36
    desc = "生徒一人ひとりの学びと成長を支えるために、日々の業務をもっと簡単に、もっとつながりやすく。"
    for line in desc.split("。"):
        if line:
            draw.text((pad_x, y), line + "。", fill=hex_rgb("#64748B"), font=load_font(14))
            y += 22

    # Feature cards at bottom
    feat_y = H - 180
    features = [
        ("⏱", "業務をもっと効率的に", "授業・成績・連絡などの\n業務をスムーズにサポートします。"),
        ("🤝", "つながる学校づくり", "生徒・保護者・教職員が\n情報を共有しやすくなります。"),
    ]
    x_positions = [pad_x + 80, pad_x + 80 + 280]
    for (icon, title, body), fx in zip(features, x_positions):
        cx = fx + 22
        rounded_rect(draw, (fx, feat_y, fx + 44, feat_y + 44), 22, fill=WHITE, outline=hex_rgb("#B2DFDB"), width=2)
        draw.text((fx + 12, feat_y + 8), icon, fill=hex_rgb(TEAL), font=load_font(20))
        tw = draw.textlength(title, font=load_font(13, True))
        draw.text((fx + 22 - tw / 2, feat_y + 54), title, fill=hex_rgb("#1F2937"), font=load_font(13, True))
        by = feat_y + 74
        for line in body.split("\n"):
            draw.text((fx - 20, by), line, fill=hex_rgb("#64748B"), font=load_font(11))
            by += 16


def draw_right_panel(img: Image.Image, draw: ImageDraw.ImageDraw):
    draw.rectangle((LEFT_W, 0, W, H), fill=hex_rgb("#EEF2F6"))

    card_w = 420
    card_x = LEFT_W + (RIGHT_W - card_w) // 2
    card_y = (H - 520) // 2

    rounded_rect(draw, (card_x + 2, card_y + 10, card_x + card_w + 2, card_y + 530), 20, fill=hex_rgb("#CBD5E1"))
    rounded_rect(draw, (card_x, card_y, card_x + card_w, card_y + 520), 20, fill=WHITE)

    cx = card_x + card_w // 2
    y = card_y + 40

    # Lock icon circle
    rounded_rect(draw, (cx - 32, y, cx + 32, y + 64), 32, fill=hex_rgb("#E0F7F5"))
    draw.text((cx - 14, y + 14), "🔒", fill=hex_rgb(TEAL), font=load_font(26))
    y += 84

    title = "教員ログイン"
    tw = draw.textlength(title, font=load_font(24, True))
    draw.text((cx - tw / 2, y), title, fill=hex_rgb("#111827"), font=load_font(24, True))
    y += 36

    sub = "ユーザー名とパスワードでログインしてください"
    sw = draw.textlength(sub, font=load_font(13))
    draw.text((cx - sw / 2, y), sub, fill=hex_rgb("#64748B"), font=load_font(13))
    y += 40

    field_x = card_x + 44
    field_w = card_w - 88

    for label, placeholder, left_icon, right_icon in [
        ("ユーザー名", "ユーザー名を入力", "👤", None),
        ("パスワード", "パスワードを入力", "🔒", "👁"),
    ]:
        draw.text((field_x, y), label, fill=hex_rgb("#374151"), font=load_font(13, True))
        y += 22
        rounded_rect(draw, (field_x, y, field_x + field_w, y + 48), 12, fill=WHITE, outline=hex_rgb("#E2E8F0"))
        draw.text((field_x + 16, y + 14), left_icon, fill=hex_rgb("#94A3B8"), font=load_font(14))
        draw.text((field_x + 40, y + 14), placeholder, fill=hex_rgb("#94A3B8"), font=load_font(14))
        if right_icon:
            draw.text((field_x + field_w - 28, y + 14), right_icon, fill=hex_rgb("#94A3B8"), font=load_font(14))
        y += 64

    # Remember + forgot
    rounded_rect(draw, (field_x, y + 2, field_x + 20, y + 22), 5, fill=hex_rgb(TEAL))
    draw.text((field_x + 4, y), "✓", fill=WHITE, font=load_font(12, True))
    draw.text((field_x + 30, y + 1), "ログインしたままにする", fill=hex_rgb("#374151"), font=load_font(13))
    forgot = "パスワードを忘れた場合"
    fw = draw.textlength(forgot, font=load_font(13, True))
    draw.text((field_x + field_w - fw, y + 1), forgot, fill=hex_rgb(TEAL), font=load_font(13, True))
    y += 36

    # Login button
    rounded_rect(draw, (field_x, y, field_x + field_w, y + 50), 12, fill=hex_rgb(TEAL))
    btn = "ログイン"
    bw = draw.textlength(btn, font=load_font(16, True))
    draw.text((cx - bw / 2, y + 14), btn, fill=WHITE, font=load_font(16, True))


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(img)
    draw_left_panel(img, draw)
    draw_right_panel(img, draw)
    img.save(OUT_PATH, "JPEG", quality=95, subsampling=0)
    print(f"Saved: {OUT_PATH}")


if __name__ == "__main__":
    main()
