"""Extract versioned transparent Shuangfu brand assets from the supplied artwork."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


SOURCE = Path("/Users/jay/Downloads/微信图片_2026-07-27_173600_513.jpg")
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "public" / "images"
PREVIEW = Path("/private/tmp/shuangfu-logo-assets-preview-v1.png")

# The source artwork contains three separated rows: symbol, English wordmark,
# and Chinese wordmark. Coordinates are kept here so the extraction is
# reproducible from the original, without redrawing brand geometry.
REGIONS = {
    "shuangfu-symbol-v1.png": (145, 136, 286, 233),
    "shuangfu-wordmark-en-v1.png": (122, 236, 301, 270),
    "shuangfu-wordmark-zh-v1.png": (160, 268, 278, 313),
}


def estimate_gold(source: Image.Image) -> tuple[int, int, int]:
    pixels = [
        (red, green, blue)
        for red, green, blue in source.get_flattened_data()
        if red > 140 and green > 80 and red - green > 20 and green - blue > 20 and blue < 150
    ]
    channels = zip(*pixels, strict=True)
    medians = []
    for channel in channels:
        values = sorted(channel)
        medians.append(values[len(values) // 2])
    return tuple(medians)  # type: ignore[return-value]


def transparent_gold(source: Image.Image, gold: tuple[int, int, int]) -> Image.Image:
    white = (255, 255, 255)
    vector = tuple(white[index] - gold[index] for index in range(3))
    denominator = sum(value * value for value in vector)
    output = Image.new("RGBA", source.size)
    output_pixels = []

    for observed in source.get_flattened_data():
        alpha = sum((white[index] - observed[index]) * vector[index] for index in range(3)) / denominator
        alpha = max(0.0, min(1.0, alpha))
        alpha = max(0.0, min(1.0, (alpha - 0.018) / 0.87))
        output_pixels.append((*gold, round(alpha * 255)))

    output.putdata(output_pixels)
    return output


def trim(image: Image.Image, padding: int = 2) -> Image.Image:
    alpha = image.getchannel("A")
    box = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    if box is None:
        raise ValueError("No logo pixels were found in the configured region")
    left, top, right, bottom = box
    return image.crop(
        (
            max(0, left - padding),
            max(0, top - padding),
            min(image.width, right + padding),
            min(image.height, bottom + padding),
        )
    )


def make_preview(assets: dict[str, Image.Image]) -> None:
    preview = Image.new("RGB", (920, 360), "#fffdfc")
    draw = ImageDraw.Draw(preview)
    draw.rectangle((460, 0, 920, 360), fill="#241d1f")

    for offset in (0, 460):
        symbol = assets["shuangfu-symbol-v1.png"]
        zh = assets["shuangfu-wordmark-zh-v1.png"]
        en = assets["shuangfu-wordmark-en-v1.png"]
        preview.paste(symbol, (offset + 54, 58), symbol)
        preview.paste(zh, (offset + 220, 78), zh)
        preview.paste(symbol, (offset + 54, 208), symbol)
        preview.paste(en, (offset + 220, 236), en)

    preview.save(PREVIEW)


def main() -> None:
    source = Image.open(SOURCE).convert("RGB")
    gold = estimate_gold(source)
    transparent = transparent_gold(source, gold)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    assets: dict[str, Image.Image] = {}
    for filename, region in REGIONS.items():
        asset = trim(transparent.crop(region))
        asset.save(OUTPUT_DIR / filename, optimize=True)
        assets[filename] = asset

    make_preview(assets)
    print(f"gold={gold}")
    for filename, asset in assets.items():
        print(f"{filename}: {asset.width}x{asset.height}")
    print(f"preview={PREVIEW}")


if __name__ == "__main__":
    main()
