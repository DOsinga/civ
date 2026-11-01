"""Cut the original Civ 1 sheets into one PNG per sprite and write sprites.json.

One-shot: it was used to create art/sprites/ and art/sprites.json from the DOS sheets.
Running it again overwrites replaced art with the originals.

Usage: python extract_originals.py
"""

import json
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
ORIGINALS = HERE / "originals"
SPRITES = HERE / "sprites"
SCALE = 2
TILE = 16

LAND_TERRAINS = [
    "grassland", "plains", "desert", "forest", "hills",
    "mountains", "tundra", "arctic", "swamp", "jungle",
]

UNITS = [
    ("settler", "Settlers, a covered wagon"),
    ("militia", "Militia, a warrior with a club"),
    ("phalanx", "Phalanx, a hoplite with spear and round shield"),
    ("legion", "Legion, a Roman legionary"),
    ("musketeer", "Musketeers, a soldier with a musket"),
    ("riflemen", "Riflemen, a soldier with a rifle"),
    ("cavalry", "Cavalry, a rider on a horse"),
    ("knights", "Knights, an armoured knight on horseback"),
    ("catapult", "Catapult"),
    ("cannon", "Cannon"),
    ("chariot", "Chariot pulled by a horse"),
    ("armor", "Armor, a tank"),
    ("mech_inf", "Mechanized infantry, an armoured personnel carrier"),
    ("artillery", "Artillery, a big field gun"),
    ("fighter", "Fighter plane seen from above"),
    ("bomber", "Bomber plane seen from above"),
    ("trireme", "Trireme, an ancient oared galley"),
    ("sail", "Sailing ship"),
    ("frigate", "Frigate, a three-masted warship"),
    ("ironclad", "Ironclad steam warship"),
    ("cruiser", "Cruiser"),
    ("battleship", "Battleship"),
    ("submarine", "Submarine"),
    ("carrier", "Aircraft carrier"),
    ("transport", "Transport ship"),
    ("nuclear", "Nuclear missile"),
    ("diplomat", "Diplomat in a suit"),
    ("caravan", "Caravan, a camel with packs"),
]

RESOURCES = [
    ("oasis", 0, "Oasis, palm trees on desert"),
    ("horses", 1, "Horses on plains"),
    ("tundra_game", 3, "Game on tundra, a caribou"),
    ("grassland_shield", 4, "Grassland resources, a shield marker"),
    ("gold", 5, "Gold on mountains"),
    ("game", 6, "Game in a forest, a deer"),
    ("seals", 7, "Seals on arctic ice"),
    ("coal", 8, "Coal on hills"),
    ("gems", 9, "Gems in a jungle"),
    ("fish", 10, "Fish in the ocean"),
    ("oil", 8, "Oil in a swamp"),
]

ROAD_DIRECTIONS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"]

CITIZENS = [
    "happy_man", "happy_woman", "content_man", "content_woman",
    "unhappy_man", "unhappy_woman", "taxman", "scientist", "entertainer",
]

ICONS = [
    ("food", 129, 33), ("shield", 137, 33), ("trade", 145, 33),
    ("gold", 153, 33), ("science", 129, 41),
]

# SP299 holds 5 pictures per column, 19 pixels apart, starting at (161, 50)
BUILDINGS = [
    "palace", "barracks", "granary", "temple", "marketplace",
    "library", "courthouse", "walls", "aqueduct", "bank",
    "cathedral", "university", "mass_transit", "colosseum", "factory",
    "mfg_plant", "sdi_defense", "recycling", "power_plant", "hydro_plant",
    "nuclear_plant", "pyramids", "hanging_gardens", "colossus", "lighthouse",
    "great_library", "oracle", "great_wall", "magellans", "michelangelos",
    "copernicus", "shakespeares", "isaac_newtons", "js_bachs", "darwins_voyage",
    "hoover_dam", "womens_suffrage", "manhattan_project", "cure_for_cancer", "apollo_program",
]
BUILDINGS_WITHOUT_ART = ["united_nations", "seti_program"]


def black(r, g, b, limit):
    return r < limit and g < limit and b < limit


def cyan(r, g, b):
    return r < 15 and abs(g - 170) < 15 and abs(b - 170) < 15


KEYS = {
    "none": lambda r, g, b: False,
    "black": lambda r, g, b: black(r, g, b, 15),
    "black20": lambda r, g, b: black(r, g, b, 20),
    "exact_black": lambda r, g, b: (r, g, b) == (0, 0, 0),
    "black_cyan": lambda r, g, b: black(r, g, b, 15) or cyan(r, g, b),
}


class Extractor:
    def __init__(self):
        self.sheets = {
            name: Image.open(ORIGINALS / f"{name}.png").convert("RGBA")
            for name in ("SP257", "SP299", "tiles_native")
        }
        self.manifest = {}

    def cut(self, name, sheet, box, key="none", **info):
        sprite = self.sheets[sheet].crop(box)
        pixels = sprite.load()
        for y in range(sprite.height):
            for x in range(sprite.width):
                r, g, b, a = pixels[x, y]
                if KEYS[key](r, g, b):
                    pixels[x, y] = (0, 0, 0, 0)
        sprite = sprite.resize((sprite.width * SCALE, sprite.height * SCALE), Image.NEAREST)
        path = SPRITES / f"{name}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        sprite.save(path)
        self.manifest[name] = {"size": [sprite.width, sprite.height], **info}
        return sprite

    def cell(self, name, col, row, key="none", **info):
        box = (col * TILE, row * TILE, (col + 1) * TILE, (row + 1) * TILE)
        return self.cut(name, "SP257", box, key, **info)

    def terrain_tile(self, name, index, **info):
        box = (index * TILE, 0, (index + 1) * TILE, TILE)
        return self.cut(name, "tiles_native", box, **info)


SETS = {
    "ocean": "Ocean tile; the number is a bit mask of the sides with land: 1 = north, 2 = east, 4 = south, 8 = west",
    "land": "Terrain overlay drawn on terrain/land_base; the number is a bit mask of the sides with the same terrain: 1 = north, 2 = east, 4 = south, 8 = west",
    "river": "River on a land tile; the number is a bit mask of the sides it flows to: 1 = north, 2 = east, 4 = south, 8 = west",
    "road": "Road from the centre of the tile to one side or corner; several are drawn on top of each other",
}


# One sprite per line so the file stays readable and diffs stay small
def write_manifest(sprites):
    lines = [
        "{",
        f' "tileSize": {TILE * SCALE},',
        ' "playerColor": [97, 226, 101],',
        f' "sets": {json.dumps(SETS, indent=2)},'.replace("\n}", "\n }"),
        ' "sprites": {',
        ",\n".join(f"  {json.dumps(name)}: {json.dumps(info)}" for name, info in sorted(sprites.items())),
        " }",
        "}",
    ]
    (HERE / "sprites.json").write_text("\n".join(lines) + "\n")


def main():
    ex = Extractor()

    ex.terrain_tile("terrain/land_base", 1, description="Plain grassland that every land tile is drawn on")
    for mask in range(16):
        ex.terrain_tile(f"terrain/ocean/{mask}", 11 + mask, set="ocean")
    for i, corner in enumerate(["nw", "ne", "sw", "se"]):
        ex.terrain_tile(f"terrain/ocean_corner/{corner}", 27 + i,
                        description=f"Bit of land poking into the {corner} corner of an ocean tile")
    for t, terrain in enumerate(LAND_TERRAINS):
        for mask in range(16):
            ex.terrain_tile(f"terrain/{terrain}/{mask}", 31 + t * 16 + mask, set="land")
    for i, side in enumerate(["s", "w", "n", "e"]):
        ex.terrain_tile(f"terrain/river_mouth/{side}", 191 + i,
                        description=f"River flowing into an ocean tile from the {side}")

    for mask in range(1, 16):
        ex.cell(f"river/{mask}", mask, 5, "black", set="river")
    for col, direction in enumerate(ROAD_DIRECTIONS):
        ex.cell(f"road/{direction}", col, 3, "black20", set="road")
    ex.cell("tile/irrigation", 4, 2, "black20", description="Irrigation ditches on a tile")
    ex.cell("tile/mine", 5, 2, "black20", description="Mine entrance on a tile")

    for name, col, description in RESOURCES:
        ex.cell(f"resource/{name}", col, 7, "black_cyan", description=description)

    for i, (name, description) in enumerate(UNITS):
        ex.cell(f"unit/{name}", i % 20, 10 + i // 20, recolor=True, description=description)

    for name, x, y in ICONS:
        ex.cut(f"icon/{name}", "SP257", (x, y, x + 7, y + 7), "exact_black",
               description=f"Small {name} icon for the city screen")
    for i, name in enumerate(CITIZENS):
        ex.cut(f"citizen/{name}", "SP257", (i * 8, 128, i * 8 + 8, 141), "exact_black",
               description=name.replace("_", " ").capitalize())

    for i, name in enumerate(BUILDINGS):
        col, row = divmod(i, 5)
        x, y = 161 + col * 19, 50 + row * 10
        ex.cut(f"building/{name}", "SP299", (x, y, x + 18, y + 10), "black_cyan",
               description=f"{name.replace('_', ' ').capitalize()}, a small picture for the city screen")

    gray = ex.cell("ui/gray_texture", 18, 11, description="Gray stone texture behind panels")
    blue = gray.copy()
    pixels = blue.load()
    for y in range(blue.height):
        for x in range(blue.width):
            r = pixels[x, y][0]
            pixels[x, y] = (117, 117, 231, 255) if r < 145 else (125, 141, 247, 255)
    blue.save(SPRITES / "ui" / "blue_texture.png")
    ex.manifest["ui/blue_texture"] = {"size": list(blue.size), "description": "Blue texture behind the city screen"}

    building_size = ex.manifest["building/palace"]["size"]
    for name in BUILDINGS_WITHOUT_ART:
        ex.manifest[f"building/{name}"] = {
            "size": building_size, "missing": True,
            "description": f"{name.replace('_', ' ').capitalize()}, a small picture for the city screen",
        }

    write_manifest(ex.manifest)
    print(f"{len(ex.manifest)} sprites")


if __name__ == "__main__":
    main()
