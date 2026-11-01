"""Rivers: one piece per combination of sides the river flows through, and the four mouths.

A river piece is numbered by the sides it reaches: 1 = north, 2 = east, 4 = south, 8 = west.
It crosses each of those edges at the midpoint, RIVER_WIDTH wide, so it continues into the
neighbour's piece. Number 0 would be a river that goes nowhere; the sheet asks for a small
pond there, which the game doesn't use yet.

A mouth is drawn on the sea tile next to the last river tile, on top of the coast: the river
comes in through the edge named after the side it comes from, crosses the beach and ends just
past it, MOUTH_DEPTH pixels in.

Drawn pieces never quite agree on where a river crosses an edge, so finish() bends the last
stretch of every piece sideways until it lines up with the straight piece, gives it the straight
piece's edge band, and slides each mouth until it ends at MOUTH_DEPTH.
"""

import math

from PIL import Image

from sheets import TILE, WATER, TRANSPARENT, SPRITES

LAYOUT = [[f"river/{mask}" for mask in range(row * 4, row * 4 + 4)] for row in range(4)] + [
    [f"terrain/river_mouth/{side}" for side in ["n", "e", "s", "w"]],
]

RIVER_WIDTH = 5
MOUTH_DEPTH = 13
POND_RADIUS = 6
# How far in from an edge a piece is bent to line up, and replaced by the straight piece's band
BEND = 10
BAND = 2

EDGE_MIDPOINTS = {1: (TILE / 2, 0), 2: (TILE, TILE / 2), 4: (TILE / 2, TILE), 8: (0, TILE / 2)}
SIDE_BITS = {"n": 1, "e": 2, "s": 4, "w": 8}


def distance_to_segment(x, y, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - ax - t * dx, y - ay - t * dy)


def is_water(name, x, y):
    half = RIVER_WIDTH / 2
    middle = TILE / 2
    kind, key = name.split("/")[-2:]
    if kind == "river_mouth":
        # Measured from the edge the river comes in through: along the edge, and into the tile
        bit = SIDE_BITS[key]
        along = x if bit in (1, 4) else y
        depth = {1: y, 4: TILE - y, 8: x, 2: TILE - x}[bit]
        end = MOUTH_DEPTH - half * 1.5
        return abs(along - middle) <= half and depth <= end or math.hypot(along - middle, depth - end) <= half * 1.5

    # Variants of a piece are named <number>_<variant>
    mask = int(key.split("_")[0])
    if mask == 0:
        return math.hypot(x - middle, y - middle) <= POND_RADIUS
    if math.hypot(x - middle, y - middle) <= half:
        return True
    return any(mask & bit and distance_to_segment(x, y, middle, middle, ex, ey) <= half
               for bit, (ex, ey) in EDGE_MIDPOINTS.items())


def mask(name, size=TILE):
    image = Image.new("RGB", (size, size), TRANSPARENT)
    pixels = image.load()
    for py in range(size):
        for px in range(size):
            if is_water(name, (px + 0.5) * TILE / size, (py + 0.5) * TILE / size):
                pixels[px, py] = WATER
    return image


# Rivers lie on land; a mouth lies on a sea tile with land on the side the river comes from
def reference_background(name):
    if "river_mouth" not in name:
        return Image.open(SPRITES / "terrain/land_base.png").convert("RGBA")
    background = Image.open(SPRITES / "terrain/water.png").convert("RGBA").crop((0, 0, TILE, TILE))
    coast = SPRITES / f"terrain/ocean/{SIDE_BITS[name.split('/')[-1]]}.png"
    background.alpha_composite(Image.open(coast).convert("RGBA"))
    return background


def fit(cell, name):
    return cell


def finish(sprites):
    straight = {"n": sprites["river/5"], "s": sprites["river/5"], "e": sprites["river/10"], "w": sprites["river/10"]}
    for name in list(sprites):
        if name.startswith("river/"):
            sprites[name] = with_straight_bands(sprites[name], int(name.split("/")[1].split("_")[0]), straight)
        elif "river_mouth" in name:
            side = name.split("/")[-1]
            sprites[name] = shortened_mouth(sprites[name], side, straight[side])
    return sprites


def edge_band(side):
    return {"n": (0, 0, TILE, BAND), "s": (0, TILE - BAND, TILE, TILE),
            "w": (0, 0, BAND, TILE), "e": (TILE - BAND, 0, TILE, TILE)}[side]


def with_straight_bands(sprite, mask, straight):
    for side, bit in SIDE_BITS.items():
        if mask & bit:
            angle = ROTATIONS[side]
            bent = bent_to(sprite.rotate(angle), straight[side].rotate(angle))
            sprite = bent.rotate(-angle)
            box = edge_band(side)
            sprite.paste(straight[side].crop(box), box[:2])
    return sprite


def middle_of_top_row(sprite):
    alpha = sprite.getchannel("A").load()
    xs = [x for x in range(TILE) if alpha[x, 0]]
    return (xs[0] + xs[-1]) / 2


# With the edge on top: each row shifts sideways, by the full offset at the edge and less
# further in, so the river leans over to where the neighbour's piece starts without a step
def bent_to(sprite, straight):
    offset = middle_of_top_row(straight) - middle_of_top_row(sprite)
    bent = sprite.copy()
    for y in range(BEND):
        shift = round(offset * (1 - y / BEND))
        row = sprite.crop((0, y, TILE, y + 1))
        bent.paste((0, 0, 0, 0), (0, y, TILE, y + 1))
        bent.paste(row, (shift, y))
    return bent


# Turned so the river comes in from the north, the stub is pushed up until it ends at
# MOUTH_DEPTH, under the straight piece's edge band
ROTATIONS = {"n": 0, "e": 90, "s": 180, "w": 270}


def shortened_mouth(sprite, side, straight):
    angle = ROTATIONS[side]
    mouth = sprite.rotate(angle)
    river = straight.rotate(angle)
    shift = max(0, mouth.getchannel("A").getbbox()[3] - MOUTH_DEPTH)
    result = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
    result.paste(river.crop((0, 0, TILE, BAND)), (0, 0))
    result.paste(mouth.crop((0, shift + BAND, TILE, TILE)), (0, BAND))
    return result.rotate(-angle)
