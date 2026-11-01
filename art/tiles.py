"""Things drawn on top of a land tile: irrigation, a mine, pollution, a hut and a fortress.

The template marks roughly where each goes: irrigation and pollution spread over the whole
tile, the mine and the hut sit in the middle, and the fortress is a ring along the edge so a
unit standing in it stays visible.

Irrigated tiles next to each other should read as one field, so finish() runs the irrigation
out to the tile edges by repeating its outermost drawn rows and columns.
"""

import math

from PIL import Image

from sheets import TILE, LAND, TRANSPARENT, SPRITES

LAYOUT = [[f"tile/{name}" for name in ["irrigation", "mine", "pollution", "hut", "fortress"]]]

INSET = 2
CENTRE_RADIUS = 9
FORTRESS_WIDTH = 4


def on_sprite(key, x, y):
    middle = TILE / 2
    if key in ("irrigation", "pollution"):
        return INSET <= x <= TILE - INSET and INSET <= y <= TILE - INSET
    if key == "fortress":
        edge = min(x, y, TILE - x, TILE - y)
        return INSET <= edge <= INSET + FORTRESS_WIDTH
    return math.hypot(x - middle, y - middle) <= CENTRE_RADIUS


def mask(name, size=TILE):
    key = name.split("/")[-1]
    image = Image.new("RGB", (size, size), TRANSPARENT)
    pixels = image.load()
    for py in range(size):
        for px in range(size):
            if on_sprite(key, (px + 0.5) * TILE / size, (py + 0.5) * TILE / size):
                pixels[px, py] = LAND
    return image


def reference_background(name):
    return Image.open(SPRITES / "terrain/land_base.png").convert("RGBA")


def fit(cell, name):
    return cell


def to_edges(sprite):
    left, top, right, bottom = sprite.getchannel("A").getbbox()
    result = Image.new("RGBA", (TILE, TILE))
    pixels = result.load()
    for y in range(TILE):
        for x in range(TILE):
            pixels[x, y] = sprite.getpixel((min(max(x, left), right - 1), min(max(y, top), bottom - 1)))
    return result


def finish(sprites):
    sprites["tile/irrigation"] = to_edges(sprites["tile/irrigation"])
    return sprites
