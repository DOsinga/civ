"""Cities on the map: four stages of growth, each also with city walls.

A city is drawn on top of the terrain and the roads, so it is transparent around the houses.
It grows from a hamlet in the middle of the tile to a town filling it. The game draws the
city's size in a badge over the top left corner, 10 pixels square.

Roofs and flags are drawn in the player colour, the same green as the units, which the game
swaps for the owner's colour. finish() snaps colours close to it onto it exactly, so the
shrinking and the shared palette don't push them out of reach.
"""

import json
import math

from PIL import Image

from sheets import HERE, TILE, LAND, TRANSPARENT, SPRITES

STAGES = [1, 2, 3, 4]
LAYOUT = [[f"city/{stage}" for stage in STAGES], [f"city/{stage}_walls" for stage in STAGES]]

RADIUS = {1: 8, 2: 11, 3: 13.5, 4: 16}
WALL_WIDTH = 3
WALL = (150, 150, 150)

PLAYER_COLOR = tuple(json.load(open(HERE / "sprites.json"))["playerColor"])
COLOR_TOLERANCE = 30


def in_city(stage, x, y):
    middle = TILE / 2
    radius = RADIUS[stage]
    # A squarish blob rather than a disc, so the biggest town fills the tile's corners too
    distance = (abs(x - middle) ** 4 + abs(y - middle) ** 4) ** 0.25 if stage == 4 else math.hypot(x - middle, y - middle)
    return distance <= radius, distance > radius - WALL_WIDTH


def mask(name, size=TILE):
    key = name.split("/")[-1]
    stage = int(key.split("_")[0])
    walls = key.endswith("_walls")
    image = Image.new("RGB", (size, size), TRANSPARENT)
    pixels = image.load()
    for py in range(size):
        for px in range(size):
            x, y = (px + 0.5) * TILE / size, (py + 0.5) * TILE / size
            inside, rim = in_city(stage, x, y)
            if inside:
                pixels[px, py] = WALL if walls and rim else LAND
    return image


def reference_background(name):
    return Image.open(SPRITES / "terrain/land_base.png").convert("RGBA")


def fit(cell, name):
    return cell


def snapped(sprite):
    sprite = sprite.copy()
    pixels = sprite.load()
    for y in range(TILE):
        for x in range(TILE):
            r, g, b, a = pixels[x, y]
            if a and all(abs(c - p) < COLOR_TOLERANCE for c, p in zip((r, g, b), PLAYER_COLOR)):
                pixels[x, y] = PLAYER_COLOR + (255,)
    return sprite


def finish(sprites):
    return {name: snapped(sprite) for name, sprite in sprites.items()}
