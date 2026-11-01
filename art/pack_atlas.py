"""Pack art/sprites/*.png into static/assets/atlas.png and atlas.json.

sprites.json lists every sprite the game draws and its size in pixels. Each sprite is a PNG
at art/sprites/<name>.png with real transparency. To replace a sprite, overwrite its PNG
(same size) and run this script again.

Usage: python pack_atlas.py
"""

import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
SPRITES = HERE / "sprites"
OUTPUT = HERE.parent / "static" / "assets"
ATLAS_WIDTH = 1024
PADDING = 1


def main():
    manifest = json.loads((HERE / "sprites.json").read_text())
    images = {}
    for name, info in manifest["sprites"].items():
        if info.get("missing"):
            continue
        image = Image.open(SPRITES / f"{name}.png").convert("RGBA")
        if list(image.size) != info["size"]:
            raise SystemExit(f"{name}.png is {image.size[0]}x{image.size[1]}, sprites.json says {info['size']}")
        images[name] = image

    # Shelf packing: tallest first, left to right, new row when the current one is full
    placements = {}
    x = y = row_height = 0
    for name, image in sorted(images.items(), key=lambda item: (-item[1].height, item[0])):
        if x + image.width > ATLAS_WIDTH:
            x = 0
            y += row_height + PADDING
            row_height = 0
        placements[name] = (x, y)
        x += image.width + PADDING
        row_height = max(row_height, image.height)

    atlas = Image.new("RGBA", (ATLAS_WIDTH, y + row_height), (0, 0, 0, 0))
    sprites = {}
    for name, (px, py) in sorted(placements.items()):
        image = images[name]
        atlas.paste(image, (px, py))
        sprites[name] = {"x": px, "y": py, "w": image.width, "h": image.height}
        if manifest["sprites"][name].get("recolor"):
            sprites[name]["recolor"] = True

    atlas.save(OUTPUT / "atlas.png")
    meta = {"tileSize": manifest["tileSize"], "playerColor": manifest["playerColor"], "sprites": sprites}
    (OUTPUT / "atlas.json").write_text(json.dumps(meta, separators=(",", ":")))
    print(f"packed {len(sprites)} sprites into {atlas.width}x{atlas.height}")


if __name__ == "__main__":
    main()
