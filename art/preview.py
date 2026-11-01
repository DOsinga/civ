"""Draw a small test map with the sprites, to check that tiles join up.

The coast map has every kind of coast: bays, a one tile channel, a lake, islets and land that
only touches diagonally. The land map puts one terrain (T) in every arrangement: a big block,
single tiles, lines, an L, a ring round a clearing, tiles touching only diagonally and terrain
running into the sea. The routes map has rivers (r) running into the sea, roads (=) in every
direction, a road crossing a river (x) and railroads (+). The world map is a whole map from
the game's own generator, drawn at 1x. Tiles are drawn the way view.js draws them.

    python preview.py                           # coast map with the current sprites
    python preview.py land --terrain forest     # land map with forest
    python preview.py land --terrain forest --sprites new/   # sprites from new/ first
    python preview.py routes                    # rivers, roads and railroads
    python preview.py world --seed 7            # a whole generated map
"""

import argparse
import json
import random
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
TILE = 32
VIEW_SCALE = 2

MAPS = {
    "coast": """
..........................
..######.......#..........
.#########....#.#...###...
.###...####........#####..
.##..#..###..#.....##.##..
.###...####.......######..
..##########.#.....####...
...###..####......#.......
...###..###...#..#.#......
....##..##.......#........
.....#..#....#............
..........................
""",
    "land": """
..........................
.########################.
.#TTTTT###T###TT##T#T####.
.#TTTTT###TT##TT###T#####.
.#TT#TT##############TTT#.
.#TTTTT##TTTTTT##T###T#T#.
.#TTTTT##T####T###T##TTT#.
.######TTT#TT#T##T#######.
.#######T##TT#T##########.
..######TTTTTTT#########..
.....TTTT####......TTT....
....TTTT####......TTTTT...
..........................
""",
    "routes": """
..........................
.....######.......#####...
...##rrr####=====######...
..###r#####=####+++++###..
..##rr##===x====+###+###..
...#r###=##r###++##=+###..
...#r#=#=##r##++###=####..
....r####==r#+#######.....
....r.####.r+######.......
...........r..............
..........................
""",
}

ROAD_DIRECTIONS = {
    "n": (0, -1), "ne": (1, -1), "e": (1, 0), "se": (1, 1),
    "s": (0, 1), "sw": (-1, 1), "w": (-1, 0), "nw": (-1, -1),
}

SIDES = {"n": (0, -1), "e": (1, 0), "s": (0, 1), "w": (-1, 0)}

# Terrains in one group run up to the edge towards each other, as in view.js
TERRAIN_GROUPS = [{"grassland", "plains", "desert", "tundra", "arctic"}, {"forest", "jungle", "swamp"}, {"hills", "mountains"}]


def related(a, b):
    return a == b or any(a in group and b in group for group in TERRAIN_GROUPS)


MISSING = {name for name, info in json.loads((HERE / "sprites.json").read_text())["sprites"].items() if info.get("missing")}


# Installed sprites the manifest marks as missing are skipped, as in the game; sprites being
# tried out in another directory are always used
def find(name, sprite_dirs):
    for directory in sprite_dirs:
        if directory == HERE / "sprites" and name in MISSING:
            continue
        path = directory / f"{name}.png"
        if path.exists():
            return Image.open(path).convert("RGBA")
    return None


# Turn a test map into terrain names (None for sea), river masks and routes ("road" or "rail")
def parse(map_text, terrain, sprite_dirs):
    rows = map_text.strip("\n").split("\n")
    height, width = len(rows), len(rows[0])
    assert all(len(r) == width for r in rows), "map rows differ in length"

    def at(x, y):
        return rows[y][x] if 0 <= y < height and 0 <= x < width else "."

    def land(x, y):
        return at(x, y) != "."

    def river(x, y):
        return at(x, y) in "rx"

    # The end of a river flows into the sea straight ahead, away from the river tile it comes from
    def into_sea(x, y, dx, dy):
        return river(x - dx, y - dy) and not land(x + dx, y + dy) and \
            sum(river(x + ox, y + oy) for ox, oy in [(0, -1), (1, 0), (0, 1), (-1, 0)]) == 1

    def river_mask(x, y):
        if not river(x, y):
            return 0
        flows = lambda dx, dy: river(x + dx, y + dy) or into_sea(x, y, dx, dy)
        return flows(0, -1) | flows(1, 0) << 1 | flows(0, 1) << 2 | flows(-1, 0) << 3

    rail_art = find("rail/center", sprite_dirs) is not None
    names = {".": None, "T": terrain}
    routes = {"=": "road", "x": "road", "+": "rail" if rail_art else "road"}
    terrain_grid = [[names.get(c, "grassland") for c in row] for row in rows]
    rivers = [[river_mask(x, y) for x in range(width)] for y in range(height)]
    route_grid = [[routes.get(c) for c in row] for row in rows]
    return terrain_grid, rivers, route_grid


def render(terrain, rivers, routes, sprite_dirs, resources=None, wrap=False, scale=VIEW_SCALE):
    height, width = len(terrain), len(terrain[0])

    def get(grid, x, y, outside):
        if wrap:
            x %= width
        return grid[y][x] if 0 <= y < height and 0 <= x < width else outside

    def land(x, y):
        return get(terrain, x, y, None) is not None

    water = find("terrain/water", sprite_dirs)
    image = Image.new("RGBA", (width * TILE, height * TILE))
    for y in range(height):
        for x in range(width):
            tile = Image.new("RGBA", (TILE, TILE))
            name = terrain[y][x]
            if name:
                tile.alpha_composite(find("terrain/land_base", sprite_dirs))
                neighbours = {side: get(terrain, x + dx, y + dy, None) for side, (dx, dy) in SIDES.items()}
                n, e, s, w = (related(name, neighbours[side]) for side in "nesw")
                texture = find(f"terrain/{name}_texture", sprite_dirs)
                if texture:
                    k = texture.width // TILE
                    tile.alpha_composite(texture.crop(((x % k) * TILE, (y % k) * TILE, (x % k + 1) * TILE, (y % k + 1) * TILE)))
                layers = [f"terrain/{name}/{n | e << 1 | s << 2 | w << 3}"]
                layers += [f"terrain/{other}_edge/{side}" for side, other in neighbours.items()
                           if other != name and related(name, other)]
                if rivers[y][x]:
                    variant = (x + y) % 3
                    straight = rivers[y][x] in (5, 10)
                    layers.append(f"river/{rivers[y][x]}_{variant}" if straight and variant else f"river/{rivers[y][x]}")
                route = routes[y][x]
                if route:
                    layers.append(f"{route}/center")
                    for piece, (dx, dy) in ROAD_DIRECTIONS.items():
                        neighbour = get(routes, x + dx, y + dy, None)
                        if neighbour:
                            layers.append(f"{'rail' if route == neighbour == 'rail' else 'road'}/{piece}")
            else:
                if water:
                    k = water.width // TILE
                    tile.alpha_composite(water.crop(((x % k) * TILE, (y % k) * TILE, (x % k + 1) * TILE, (y % k + 1) * TILE)))
                n, e, s, w = land(x, y - 1), land(x + 1, y), land(x, y + 1), land(x - 1, y)
                mask = n | e << 1 | s << 2 | w << 3
                # With a water texture, open sea has no sprite of its own
                layers = [f"terrain/ocean/{mask}"] if mask or not water else []
                for corner, open_sides, dx, dy in [
                    ("nw", not n and not w, -1, -1), ("ne", not n and not e, 1, -1),
                    ("sw", not s and not w, -1, 1), ("se", not s and not e, 1, 1),
                ]:
                    if open_sides and land(x + dx, y + dy):
                        layers.append(f"terrain/ocean_corner/{corner}")
                # A mouth is named after the side the river comes in from, as in view.js
                for (side, (dx, dy)), towards_here in zip(SIDES.items(), [4, 8, 1, 2]):
                    if land(x + dx, y + dy) and get(rivers, x + dx, y + dy, 0) & towards_here:
                        layers.append(f"terrain/river_mouth/{side}")
            if resources and resources[y][x] and not rivers[y][x]:
                layers.append(f"resource/{resources[y][x]}")
            for layer in layers:
                sprite = find(layer, sprite_dirs)
                if sprite:
                    tile.alpha_composite(sprite)
            image.paste(tile, (x * TILE, y * TILE))
    return image.resize((image.width * scale, image.height * scale), Image.NEAREST)


# As distributeResources in world.js: each terrain has a 1 in 16 chance of its resource
RESOURCES = {"desert": "oasis", "plains": "horses", "tundra": "tundra_game", "grassland": "grassland_shield",
             "mountains": "gold", "forest": "game", "arctic": "seals", "hills": "coal", "jungle": "gems",
             None: "fish", "swamp": "oil"}


def world_map(seed):
    sys.path.insert(0, str(HERE.parents[2]))
    from projects.civ import civ
    terrain, rivers = civ.generate_map(seed)
    names = {getattr(civ, f"TERRAIN_{name.upper()}"): name for name in
             ["grassland", "plains", "desert", "forest", "hills", "mountains", "tundra", "arctic", "swamp", "jungle"]}
    bits = {"N": 1, "E": 2, "S": 4, "W": 8}
    terrain_grid = [[names.get(t) for t in row] for row in terrain]
    river_grid = [[sum(bits[d] for d in cell) for cell in row] for row in rivers]
    rng = random.Random(seed)
    resources = [[RESOURCES[name] if rng.random() < 1 / 16 else None for name in row] for row in terrain_grid]
    return terrain_grid, river_grid, [[None] * len(row) for row in terrain], resources


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("map", nargs="?", default="coast", choices=sorted(MAPS) + ["world"])
    parser.add_argument("--terrain", default="forest", help="the terrain T stands for on the land map")
    parser.add_argument("--sprites", type=Path, help="directory with new sprites to try")
    parser.add_argument("--seed", type=int, help="seed for the world map; random if left out")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    sprite_dirs = ([args.sprites] if args.sprites else []) + [HERE / "sprites"]
    out = args.out or HERE / "sheets" / f"{args.terrain if args.map == 'land' else args.map}_preview.png"
    out.parent.mkdir(exist_ok=True)
    if args.map == "world":
        seed = args.seed if args.seed is not None else random.randrange(2 ** 31)
        terrain, rivers, routes, resources = world_map(seed)
        image = render(terrain, rivers, routes, sprite_dirs, resources, wrap=True, scale=1)
        print(f"seed {seed}")
    else:
        image = render(*parse(MAPS[args.map], args.terrain, sprite_dirs), sprite_dirs)
    image.save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
