"""Speckled edges where two related terrains meet, like grassland and desert or forest and jungle.

Related terrains run up to the edge towards each other. To soften the seam, a tile draws its
neighbour's edge piece, terrain/<name>_edge/<side>, along the side that neighbour is on: the
neighbour's terrain in chunky speckles, half covering at the edge and thinning out to nothing
DEPTH pixels in. The neighbour does the same the other way, so the two speckle into each other.

The pieces are made from the installed sprites, so run this again after replacing a terrain:

    python edges.py
"""

import random

from PIL import Image

from sheets import TILE, SPRITES, LAND_TERRAINS

DEPTH = 12
SPECKLE = 2


def full_tile(name):
    tile = Image.open(SPRITES / "terrain/land_base.png").convert("RGBA")
    texture = SPRITES / f"terrain/{name}_texture.png"
    if texture.exists():
        tile.alpha_composite(Image.open(texture).convert("RGBA").crop((0, 0, TILE, TILE)))
    overlay = SPRITES / f"terrain/{name}/15.png"
    if overlay.exists():
        tile.alpha_composite(Image.open(overlay).convert("RGBA"))
    return tile


def speckles(side, seed):
    rng = random.Random(seed)
    alpha = Image.new("L", (TILE, TILE), 0)
    pixels = alpha.load()
    for by in range(0, TILE, SPECKLE):
        for bx in range(0, TILE, SPECKLE):
            depth = {"n": by, "s": TILE - SPECKLE - by, "w": bx, "e": TILE - SPECKLE - bx}[side]
            if rng.random() < 0.5 * (1 - depth / DEPTH):
                for y in range(by, by + SPECKLE):
                    for x in range(bx, bx + SPECKLE):
                        pixels[x, y] = 255
    return alpha


def main():
    for number, name in enumerate(["grassland"] + LAND_TERRAINS):
        tile = full_tile(name)
        (SPRITES / f"terrain/{name}_edge").mkdir(exist_ok=True)
        for side in "nesw":
            edge = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
            edge.paste(tile, mask=speckles(side, f"{name}{side}"))
            edge.save(SPRITES / f"terrain/{name}_edge/{side}.png")
        print(f"wrote terrain/{name}_edge")


if __name__ == "__main__":
    main()
