"""Land terrain overlays: forest, desert, swamp and the rest, drawn on top of the land base.

Every terrain uses the same 16 tiles, numbered by which neighbours have the same terrain
(1 = north, 2 = east, 4 = south, 8 = west). Each tile is self-contained: towards a neighbour
with the same terrain the terrain runs right up to the edge, and where two such sides meet it
fills the corner too; towards a different neighbour it stops MARGIN pixels short and the land
base shows.

Carpet terrains like forest also get a seamless texture, terrain/<name>_texture, anchored to
the map like the water. Their tiles then keep only the drawn rim near the outline, with the
land base baked in around it; inside, the texture shows through, so large areas of the
terrain have no seams where tiles meet.
"""

import random
from types import SimpleNamespace

from PIL import Image

from sheets import TILE, LAND, TRANSPARENT, SPRITES

MARGIN = 4
ROUNDING = 10

# Hills don't suit it: the circles cut large smooth hills into rubble
TEXTURED = {"forest", "jungle"}
TEXTURE_TILES = 4
# How far in from the outline the drawn art is kept before the texture takes over
RIM = 6
# Canopy stamps cut from the full tile: radius, and the smallest distance between two of them
STAMP_RADIUS = 7
STAMP_SPACING = 8.5


def layout(terrain):
    return [[f"terrain/{terrain}/{mask}" for mask in range(row * 4, row * 4 + 4)] for row in range(4)]


# Is the point (x, y), in sprite pixels, covered by the terrain on tile number mask?
def is_terrain(mask, x, y):
    north, east, south, west = (bool(mask & bit) for bit in (1, 2, 4, 8))
    m = MARGIN
    if (y < m and not north) or (y > TILE - m and not south) or (x < m and not west) or (x > TILE - m and not east):
        return False
    # Round off the outside corners, where neither side continues
    for open_corner, dx, dy in [
        (not north and not west, x - m, y - m), (not north and not east, TILE - m - x, y - m),
        (not south and not west, x - m, TILE - m - y), (not south and not east, TILE - m - x, TILE - m - y),
    ]:
        if open_corner and dx < ROUNDING and dy < ROUNDING:
            if (ROUNDING - dx) ** 2 + (ROUNDING - dy) ** 2 > ROUNDING * ROUNDING:
                return False
    return True


def mask(name, size=TILE):
    number = int(name.split("/")[-1])
    image = Image.new("RGB", (size, size), TRANSPARENT)
    pixels = image.load()
    for py in range(size):
        for px in range(size):
            if is_terrain(number, (px + 0.5) * TILE / size, (py + 0.5) * TILE / size):
                pixels[px, py] = LAND
    return image


def reference_background(name):
    return Image.open(SPRITES / "terrain/land_base.png").convert("RGBA")


def fit(cell, name):
    return cell


def finish(terrain, sprites):
    if terrain not in TEXTURED:
        return sprites
    base = Image.open(SPRITES / "terrain/land_base.png").convert("RGBA")
    texture = canopy_texture(sprites[f"terrain/{terrain}/15"])
    for number in range(16):
        name = f"terrain/{terrain}/{number}"
        sprites[name] = rim(sprites[name], base)
    sprites[f"terrain/{terrain}_texture"] = texture
    return sprites


# The tile with the land base filled in around the terrain, and the inside, more than RIM
# pixels from the outline, cleared so the texture shows through
def rim(sprite, base):
    alpha = sprite.getchannel("A").load()
    distance = {}
    frontier = [(x, y) for y in range(TILE) for x in range(TILE) if not alpha[x, y]]
    for point in frontier:
        distance[point] = 0
    while frontier:
        next_frontier = []
        for x, y in frontier:
            for nx in (x - 1, x, x + 1):
                for ny in (y - 1, y, y + 1):
                    if 0 <= nx < TILE and 0 <= ny < TILE and (nx, ny) not in distance:
                        distance[(nx, ny)] = distance[(x, y)] + 1
                        next_frontier.append((nx, ny))
        frontier = next_frontier

    result = base.copy()
    result.alpha_composite(sprite)
    pixels = result.load()
    for y in range(TILE):
        for x in range(TILE):
            if distance.get((x, y), RIM + 1) > RIM:
                pixels[x, y] = (0, 0, 0, 0)
    return result


# Circles of canopy cut from the full tile around each bright tree top, scattered with
# wrap-around and drawn top to bottom so lower trees overlap higher ones
def canopy_texture(full, seed=2):
    rng = random.Random(seed)
    pixels = full.convert("RGB").load()
    bright = {(x, y): sum(pixels[x, y]) for y in range(TILE) for x in range(TILE)}
    threshold = sorted(bright.values())[int(len(bright) * 0.7)]

    tops = []
    for (x, y), value in bright.items():
        if 3 <= x < TILE - 3 and 3 <= y < TILE - 3 and value > threshold:
            if value == max(bright[(x + dx, y + dy)] for dx in range(-3, 4) for dy in range(-3, 4)):
                if all((x - tx) ** 2 + (y - ty) ** 2 > 16 for tx, ty in tops):
                    tops.append((x, y))

    r = STAMP_RADIUS
    stamps = [
        [(dx, dy, pixels[(tx + 1 + dx) % TILE, (ty + 1 + dy) % TILE])
         for dy in range(-r, r + 1) for dx in range(-r, r + 1) if dx * dx + dy * dy <= r * r + 1]
        for tx, ty in tops
    ]

    size = TILE * TEXTURE_TILES
    darkest = min(bright, key=bright.get)
    texture = Image.new("RGB", (size, size), pixels[darkest])
    out = texture.load()
    wrap = lambda a, b: min(abs(a - b), size - abs(a - b))
    trees = []
    for _ in range(30000):
        p = (rng.randrange(size), rng.randrange(size))
        if all(wrap(p[0], q[0]) ** 2 + wrap(p[1], q[1]) ** 2 > STAMP_SPACING ** 2 for q in trees):
            trees.append(p)
    for px, py in sorted(trees, key=lambda p: p[1]):
        for dx, dy, colour in rng.choice(stamps):
            out[(px + dx) % size, (py + dy) % size] = colour
    return texture.convert("RGBA")


def make(terrain):
    return SimpleNamespace(
        LAYOUT=layout(terrain), mask=mask, reference_background=reference_background, fit=fit,
        finish=lambda sprites: finish(terrain, sprites),
    )
