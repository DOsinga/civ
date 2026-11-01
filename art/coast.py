"""The coast sheet: ocean tiles with land on some sides, and corner pieces.

In the game the open sea is one seamless texture, terrain/water, laid over all ocean tiles and
anchored to the map. The coast sprites are drawn on top of it: beach, surf and shallow water,
transparent where the open sea shows through. The sheet still asks for a complete open-sea
tile (ocean/0); slicing turns its waves into the water texture.
"""

import random
from collections import Counter

from PIL import Image

from sheets import TILE, SHEET_SCALE, WATER, LAND, TRANSPARENT, SPRITES, slide_corner

LAYOUT = [
    [f"terrain/ocean/{mask}" for mask in range(row * 4, row * 4 + 4)] for row in range(4)
] + [
    [f"terrain/ocean_corner/{corner}" for corner in ["nw", "ne", "sw", "se"]],
]

# Width of the strip of shore along a side with land, in sprite pixels
COAST_BAND = 8
# How far the shallow water reaches beyond the shore before the open sea takes over
SHALLOW = 4
WATER_TILES = 8


# Is the point (x, y), in sprite pixels, land on a coast sprite? On an ocean tile the shore runs
# the full length of every land side, COAST_BAND deep, so it always meets the tile edge at the
# same depth and neighbours line up. Where two land sides meet, the corner of the water is
# rounded. A corner piece is a quarter circle of land, drawn on an ocean tile when land only
# touches it diagonally; it rounds off the corner the bands of its two neighbours leave.
def is_land(name, x, y):
    kind, key = name.split("/")[1:]
    r = COAST_BAND
    if kind == "ocean_corner":
        dx = x if key.endswith("w") else TILE - x
        dy = y if key.startswith("n") else TILE - y
        return dx * dx + dy * dy < r * r

    mask = int(key)
    north, east, south, west = (bool(mask & bit) for bit in (1, 2, 4, 8))
    if (north and y < r) or (south and y > TILE - r) or (west and x < r) or (east and x > TILE - r):
        return True

    fillet = COAST_BAND / 2
    for both, dx, dy in [
        (north and west, x, y), (north and east, TILE - x, y),
        (south and west, x, TILE - y), (south and east, TILE - x, TILE - y),
    ]:
        if both and r <= dx < r + fillet and r <= dy < r + fillet:
            if (dx - r - fillet) ** 2 + (dy - r - fillet) ** 2 > fillet * fillet:
                return True
    return False


# The template for one sprite, drawn at size x size pixels
def mask(name, size=TILE):
    background = TRANSPARENT if "ocean_corner" in name else WATER
    image = Image.new("RGB", (size, size), background)
    pixels = image.load()
    for py in range(size):
        for px in range(size):
            if is_land(name, (px + 0.5) * TILE / size, (py + 0.5) * TILE / size):
                pixels[px, py] = LAND
    return image


# What the game draws under a coast sprite
def reference_background(name):
    water = SPRITES / "terrain/water.png"
    if water.exists():
        return Image.open(water).convert("RGBA").crop((0, 0, TILE, TILE))
    return Image.open(SPRITES / "terrain/ocean/0.png").convert("RGBA")


# Corner pieces are slid into place so the shore meets the tile edges at the shore depth
def fit(cell, name):
    if "ocean_corner" not in name:
        return cell
    return slide_corner(cell, name.split("/")[-1], COAST_BAND * SHEET_SCALE)


# Turn the sliced sprites into what the game uses: the open-sea tile becomes the water
# texture, and the coast tiles become overlays with the open sea cut out.
def finish(sprites):
    water = water_texture(sprites.pop("terrain/ocean/0"))
    for mask_value in range(1, 16):
        name = f"terrain/ocean/{mask_value}"
        sprites[name] = cut_out_open_sea(sprites[name], name)
    sprites["terrain/water"] = water
    return sprites


def is_sea(r, g, b):
    return b > 150 and b > r + 60 and b > g + 20


def cut_out_open_sea(sprite, name):
    land = [(x, y) for y in range(TILE) for x in range(TILE) if is_land(name, x + 0.5, y + 0.5)]
    pixels = sprite.load()
    for y in range(TILE):
        for x in range(TILE):
            near_shore = any((x - lx) ** 2 + (y - ly) ** 2 <= SHALLOW * SHALLOW for lx, ly in land)
            if not near_shore and is_sea(*pixels[x, y][:3]):
                pixels[x, y] = (0, 0, 0, 0)
    return sprite


# The open sea is a mottled field of dark blues with lighter waves. The texture gets the same
# dark blues, in the same proportions, as wrap-around noise, with the drawn tile's waves
# scattered over it at random, wrapping around the edges. So it tiles seamlessly and has no grid.
def water_texture(open_sea, seed=1):
    rng = random.Random(seed)
    tile = open_sea.convert("RGB")
    size = TILE * WATER_TILES

    counts = Counter(tile.getdata())
    is_dark = lambda c: c[2] < 200 and c[1] < 92
    texture = mottled({c: n for c, n in counts.items() if is_dark(c)}, size, rng)
    pixels = texture.load()

    waves = [w for w in shapes(tile, lambda c: not is_dark(c)) if w]
    occupied = set()
    wanted = len(waves) * WATER_TILES * WATER_TILES
    placed = attempts = 0
    while placed < wanted and attempts < wanted * 40:
        attempts += 1
        wave = rng.choice(waves)
        ox, oy = rng.randrange(size), rng.randrange(size)
        spots = {((ox + x) % size, (oy + y) % size) for x, y, _ in wave}
        margin = {((sx + dx) % size, (sy + dy) % size) for sx, sy in spots for dx in (-2, 0, 2) for dy in (-2, 0, 2)}
        if margin & occupied:
            continue
        for x, y, colour in wave:
            pixels[(ox + x) % size, (oy + y) % size] = colour
        occupied |= spots
        placed += 1
    return texture.convert("RGBA")


# A size x size square filled with the given colours in the same proportions as their counts,
# laid out as smooth wrap-around noise from dark to light, so it tiles seamlessly
def mottled(colour_counts, size, rng, cell=4):
    colours = sorted(colour_counts, key=sum)
    total = sum(colour_counts.values())
    noise = wrapping_noise(size, cell=cell, rng=rng)
    order = sorted(range(size * size), key=lambda i: noise[i])
    image = Image.new("RGB", (size, size))
    pixels = image.load()
    position = 0
    for colour in colours:
        share = round(colour_counts[colour] / total * size * size)
        for i in order[position:position + share]:
            pixels[i % size, i // size] = colour
        position += share
    for i in order[position:]:
        pixels[i % size, i // size] = colours[-1]
    return image


# Smooth random values on a grid of cell x cell pixel squares, wrapping at the edges
def wrapping_noise(size, cell, rng):
    grid = size // cell
    values = [[rng.random() for _ in range(grid)] for _ in range(grid)]
    noise = []
    for y in range(size):
        for x in range(size):
            gx, gy = x / cell, y / cell
            x0, y0 = int(gx), int(gy)
            fx, fy = gx - x0, gy - y0
            v = lambda i, j: values[j % grid][i % grid]
            top = v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx
            bottom = v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx
            noise.append(top * (1 - fy) + bottom * fy + rng.random() * 0.15)
    return noise


# Connected groups of pixels for which wanted(colour) holds, as lists of (x, y, colour)
# relative to their top left. Groups touching the tile border are cut off and skipped.
def shapes(tile, wanted):
    pixels = tile.load()
    seen = set()
    found = []
    for sy in range(TILE):
        for sx in range(TILE):
            if (sx, sy) in seen or not wanted(pixels[sx, sy]):
                continue
            group, stack = [], [(sx, sy)]
            seen.add((sx, sy))
            while stack:
                x, y = stack.pop()
                group.append((x, y))
                for nx in (x - 1, x, x + 1):
                    for ny in (y - 1, y, y + 1):
                        if 0 <= nx < TILE and 0 <= ny < TILE and (nx, ny) not in seen and wanted(pixels[nx, ny]):
                            seen.add((nx, ny))
                            stack.append((nx, ny))
            if any(x in (0, TILE - 1) or y in (0, TILE - 1) for x, y in group):
                continue
            left = min(x for x, _ in group)
            top = min(y for _, y in group)
            found.append([(x - left, y - top, pixels[x, y]) for x, y in group])
    return found
