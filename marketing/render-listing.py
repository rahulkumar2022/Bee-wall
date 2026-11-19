#!/usr/bin/env python3
"""Render Bee Wall listing art offline with Playwright Chromium and Pillow.

From the repo: python3 marketing/render-listing.py
To adapt to portal fields: --ratio 5x7 --size WIDTHxHEIGHT [--format jpeg]
Setup if not cached: pip install playwright Pillow; python3 -m playwright install chromium
"""

import argparse
from base64 import b64decode
from io import BytesIO
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "marketing" / "bee-wall-meadow.svg"
OUTPUT = ROOT / "release" / "listing"
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

# SVG scene, logical canvas, default raster size. Canvas sizes are not portal specs.
VARIANTS = {
    "16x9": ("wide", (1200, 675), (1920, 1080)),
    "1x1": ("square", (800, 800), (1080, 1080)),
    "5x7": ("portrait", (700, 980), (1000, 1400)),
    "4x3": ("four-three", (960, 720), (1600, 1200)),
}


def parse_size(value):
    try:
        width, height = (int(n) for n in value.lower().split("x"))
        if width > 0 and height > 0:
            return width, height
    except ValueError:
        pass
    raise argparse.ArgumentTypeError("size must be WIDTHxHEIGHT in positive pixels")


def arrange(scene, canvas, pixels):
    svg = ET.parse(SOURCE).getroot()
    nodes = list(svg.iter())
    if any(x.tag.rsplit("}", 1)[-1] in {"text", "tspan", "image", "script", "foreignObject"}
           or ("href" in x.attrib and not x.get("href").startswith("#")) for x in nodes):
        raise ValueError("The source must remain local vector art with no visible text")
    next(x for x in nodes if x.get("id") == "composition").set("href", f"#scene-{scene}")
    svg.set("viewBox", f"0 0 {canvas[0]} {canvas[1]}")
    svg.set("width", str(pixels[0]))
    svg.set("height", str(pixels[1]))
    return ET.tostring(svg, encoding="unicode")


def render(page, ratio, variant, pixels, fmt):
    scene, canvas, _ = variant
    svg = arrange(scene, canvas, pixels)
    png = b64decode(page.evaluate("""async ([svg, width, height]) => {
        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
        await image.decode();
        if (image.naturalWidth !== width || image.naturalHeight !== height) {
            throw new Error('Unexpected SVG raster dimensions');
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(image, 0, 0);
        return canvas.toDataURL('image/png').split(',')[1];
    }""", [svg, *pixels]))
    extension = "jpg" if fmt == "jpeg" else "png"
    path = OUTPUT / f"bee-wall-thumbnail-{ratio}.{extension}"
    with Image.open(BytesIO(png)) as frame:
        if frame.size != pixels or frame.convert("RGBA").getchannel("A").getextrema() != (255, 255):
            raise ValueError(f"Expected an opaque {pixels[0]}×{pixels[1]} raster for {ratio}")
        options = {"quality": 94, "subsampling": 0} if fmt == "jpeg" else {}
        frame.convert("RGB").save(path, format=fmt.upper(), optimize=True, **options)
    with Image.open(path) as output:
        if output.size != pixels or output.format != fmt.upper() or output.mode != "RGB":
            raise ValueError(f"Unexpected format, mode or dimensions: {path}")
        output.verify()
    print(f"{path.relative_to(ROOT)}: {fmt.upper()} {pixels[0]}×{pixels[1]}, {path.stat().st_size:,} bytes")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ratio", choices=VARIANTS, help="render one ratio; default: all")
    parser.add_argument("--size", type=parse_size, help="override pixels for the selected ratio")
    parser.add_argument("--format", choices=("png", "jpeg"), default="png")
    args = parser.parse_args()
    if args.size and not args.ratio:
        parser.error("--size requires --ratio")
    if args.size:
        w, h = args.size
        cw, ch = VARIANTS[args.ratio][1]
        if w * ch != h * cw:
            parser.error("--size must preserve the selected aspect ratio")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(device_scale_factor=1, offline=True)
        for ratio in (args.ratio,) if args.ratio else VARIANTS:
            variant = VARIANTS[ratio]
            render(page, ratio, variant, args.size or variant[2], args.format)
        browser.close()


if __name__ == "__main__":
    main()
