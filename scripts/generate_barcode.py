#!/usr/bin/env python3
"""
Generate a Code 128-B barcode as an SVG file.

Usage:
  python scripts/generate_barcode.py
  python scripts/generate_barcode.py 1234567890
  python scripts/generate_barcode.py 1234567890 --output my-barcode.svg
"""

from __future__ import annotations

import argparse
import html
from pathlib import Path


CODE128_PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213",
    "122312", "132212", "221213", "221312", "231212", "112232", "122132",
    "122231", "113222", "123122", "123221", "223211", "221132", "221231",
    "213212", "223112", "312131", "311222", "321122", "321221", "312212",
    "322112", "322211", "212123", "212321", "232121", "111323", "131123",
    "131321", "112313", "132113", "132311", "211313", "231113", "231311",
    "112133", "112331", "132131", "113123", "113321", "133121", "313121",
    "211331", "231131", "213113", "213311", "213131", "311123", "311321",
    "331121", "312113", "312311", "332111", "314111", "221411", "431111",
    "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114",
    "413111", "241112", "134111", "111242", "121142", "121241", "114212",
    "124112", "124211", "411212", "421112", "421211", "212141", "214121",
    "412121", "111143", "111341", "131141", "114113", "114311", "411113",
    "411311", "113141", "114131", "311141", "411131", "211412", "211214",
    "211232", "2331112",
]

START_B = 104
STOP = 106


def encode_code128_b(value: str) -> list[int]:
    if not value:
        raise ValueError("Barcode value cannot be empty.")

    codes = [START_B]
    for char in value:
        ascii_code = ord(char)
        if ascii_code < 32 or ascii_code > 126:
            raise ValueError(
                "Only printable ASCII characters are supported for this barcode."
            )
        codes.append(ascii_code - 32)

    checksum = START_B
    for index, code in enumerate(codes[1:], start=1):
        checksum += code * index
    codes.append(checksum % 103)
    codes.append(STOP)
    return codes


def build_svg(value: str, bar_width: int = 3, bar_height: int = 120) -> str:
    codes = encode_code128_b(value)
    quiet_zone = 10 * bar_width
    text_height = 28
    total_modules = sum(sum(int(unit) for unit in CODE128_PATTERNS[code]) for code in codes)
    width = (total_modules * bar_width) + (quiet_zone * 2)
    height = bar_height + text_height

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" ',
        f'viewBox="0 0 {width} {height}" role="img" aria-label="Barcode for {html.escape(value)}">',
        '<rect width="100%" height="100%" fill="white"/>',
    ]

    x = quiet_zone
    for code in codes:
        pattern = CODE128_PATTERNS[code]
        for index, unit in enumerate(pattern):
            stroke = int(unit) * bar_width
            if index % 2 == 0:
                parts.append(
                    f'<rect x="{x}" y="0" width="{stroke}" height="{bar_height}" fill="black"/>'
                )
            x += stroke

    escaped_value = html.escape(value)
    parts.append(
        f'<text x="{width / 2}" y="{bar_height + 20}" font-family="monospace" '
        f'font-size="18" text-anchor="middle" fill="black">{escaped_value}</text>'
    )
    parts.append("</svg>")
    return "".join(parts)


def build_output_path(value: str, output: str | None) -> Path:
    if output:
        return Path(output).expanduser().resolve()

    safe_value = "".join(char if char.isalnum() else "_" for char in value).strip("_")
    filename = safe_value or "barcode"
    return Path.cwd() / f"{filename}.svg"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a Code 128 barcode SVG from the text or number you enter."
    )
    parser.add_argument("value", nargs="?", help="Text or number to encode")
    parser.add_argument("--output", "-o", help="Output SVG file path")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    value = (args.value or input("Enter text or number for the barcode: ")).strip()
    output_path = build_output_path(value, args.output)
    svg = build_svg(value)
    output_path.write_text(svg, encoding="utf-8")
    print(f"Barcode saved to: {output_path}")
    print("This barcode does not expire on its own. It stays valid as long as your system accepts the encoded value.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
