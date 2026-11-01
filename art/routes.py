"""Roads and railroads: a middle piece plus a piece from the middle of the tile to each of the
eight neighbours. The game draws the middle on every tile with a road and a piece towards
every neighbour with a road (or a city), all on top of each other.

The sheet is laid out the way the pieces sit on the map: north-west top left, the middle in
the middle. A straight piece meets the edge at its midpoint and a diagonal one at the corner,
always WIDTH wide, so it continues into the neighbour's piece pointing back.
"""

import math
from types import SimpleNamespace

from PIL import Image

from sheets import TILE, LAND, TRANSPARENT, SPRITES

TARGETS = {
    "nw": (0, 0), "n": (TILE / 2, 0), "ne": (TILE, 0),
    "w": (0, TILE / 2), "e": (TILE, TILE / 2),
    "sw": (0, TILE), "s": (TILE / 2, TILE), "se": (TILE, TILE),
}
GRID = [["nw", "n", "ne"], ["w", "center", "e"], ["sw", "s", "se"]]
WIDTH = {"road": 4, "rail": 6}
PREFIX = {"roads": "road", "railroads": "rail"}


def distance_to_segment(x, y, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - ax - t * dx, y - ay - t * dy)


# Is (x, y) on the piece? Every piece includes the round middle, so pieces drawn together join.
# The middle piece itself is a little wider, so a road tile with no road next to it still shows.
def on_piece(key, width, x, y):
    half = width / 2
    middle = TILE / 2
    if key == "center":
        return math.hypot(x - middle, y - middle) <= width * 0.75
    if math.hypot(x - middle, y - middle) <= half:
        return True
    tx, ty = TARGETS[key]
    return distance_to_segment(x, y, middle, middle, tx, ty) <= half


def make(set_name):
    prefix = PREFIX[set_name]
    width = WIDTH[prefix]

    def mask(name, size=TILE):
        key = name.split("/")[-1]
        image = Image.new("RGB", (size, size), TRANSPARENT)
        pixels = image.load()
        for py in range(size):
            for px in range(size):
                if on_piece(key, width, (px + 0.5) * TILE / size, (py + 0.5) * TILE / size):
                    pixels[px, py] = LAND
        return image

    def reference_background(name):
        return Image.open(SPRITES / "terrain/land_base.png").convert("RGBA")

    return SimpleNamespace(
        LAYOUT=[[f"{prefix}/{key}" for key in row] for row in GRID],
        mask=mask, reference_background=reference_background,
        fit=lambda cell, name: cell, finish=lambda sprites: sprites,
    )
