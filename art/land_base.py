"""The land base: one neutral ground tile drawn under every land tile, with the terrain on top.

It repeats on every land tile, so it has to tile seamlessly and stay plain; the terrain
overlays and the coast tiles' land strips are drawn against it.

    python land_base.py                   # preview of the current tile next to a coast
    python land_base.py --sprites new/    # preview of a newly sliced one
    python land_base.py --generate        # make the tile from the coast's greens and install it
"""

import argparse
import random
from collections import Counter
from pathlib import Path

from PIL import Image

import coast
from sheets import TILE, LAND, SPRITES, SHEETS

LAYOUT = [["terrain/land_base"]]


def mask(name, size=TILE):
    return Image.new("RGB", (size, size), LAND)


def reference_background(name):
    return Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))


def fit(cell, name):
    return cell


def finish(sprites):
    return sprites


# The greens of the land strips on the coast tiles, away from the beach, as a seamless mottled
# tile. Sand and shrubs are left out, so it is the plain ground the strips grow out of.
def generate(seed=1):
    greens = Counter()
    for mask_value in range(1, 16):
        name = f"terrain/ocean/{mask_value}"
        pixels = Image.open(SPRITES / f"{name}.png").convert("RGB").load()
        for y in range(TILE):
            for x in range(TILE):
                inland = all(coast.is_land(name, x + 0.5 + dx, y + 0.5 + dy) for dx in (-3, 0, 3) for dy in (-3, 0, 3))
                r, g, b = pixels[x, y]
                if inland and g > r + 30 and g > b + 60:
                    greens[(r, g, b)] += 1
    return coast.mottled(greens, TILE, random.Random(seed), cell=2).convert("RGBA")


# A 4x4 patch of the tile next to a coast tile, to judge seams and the colour match
def tiling_preview(sprite_dir=SPRITES):
    tile = Image.open(sprite_dir / "terrain/land_base.png").convert("RGBA")
    coast = Image.open(SPRITES / "terrain/ocean/8.png").convert("RGBA")
    water = Image.open(SPRITES / "terrain/water.png").convert("RGBA").crop((0, 0, TILE, TILE))
    patch = Image.new("RGBA", (TILE * 5, TILE * 4))
    for y in range(4):
        for x in range(4):
            patch.paste(tile, (x * TILE, y * TILE))
        shore = water.copy()
        shore.alpha_composite(coast)
        patch.paste(shore, (4 * TILE, y * TILE))
    return patch.resize((patch.width * 4, patch.height * 4), Image.NEAREST)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sprites", type=Path, default=SPRITES)
    parser.add_argument("--generate", action="store_true")
    args = parser.parse_args()
    if args.generate:
        generate().save(SPRITES / "terrain/land_base.png")
        print("wrote terrain/land_base.png")
    out = SHEETS / "land_base_preview.png"
    tiling_preview(args.sprites).save(out)
    print(f"wrote {out}")
