"""Sheets for asking an image generator to draw a set of sprites, and for reading its answer back.

A sheet is a grid of cells, one per sprite, drawn at SHEET_SCALE times the sprite size with
separator lines between the cells.

    python sheets.py template coast         # colour-coded mask of what goes where
    python sheets.py reference coast        # the same layout filled with the current sprites
    python sheets.py slice coast drawn.png  # cut a drawn sheet back into art/sprites/

Template colours: water, land, and magenta for parts of a sprite that must stay transparent.

Each set lives in its own module (coast.py, land_base.py, rivers.py; the land terrains share overlay.py, roads and railroads routes.py, cities.py, tiles.py) with LAYOUT, mask(name, size) for the template,
reference_background(name), fit(cell, name) to correct a drawn cell before it is shrunk, and
finish(sprites) to turn the sliced sprites into the ones the game uses.
"""

import argparse
import importlib
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
SPRITES = HERE / "sprites"
SHEETS = HERE / "sheets"

TILE = 32
SHEET_SCALE = 4
SEPARATOR = 2 * SHEET_SCALE
PALETTE_SIZE = 48

SEPARATOR_COLOR = (34, 34, 34)
WATER = (32, 96, 192)
LAND = (64, 160, 64)
TRANSPARENT = (255, 0, 255)

LAND_TERRAINS = ["plains", "desert", "forest", "hills", "mountains", "tundra", "arctic", "swamp", "jungle"]
SETS = ["coast", "land_base", "rivers", "river_variants", "roads", "railroads", "cities", "tiles"] + LAND_TERRAINS


def load_set(name):
    if name in LAND_TERRAINS:
        return importlib.import_module("overlay").make(name)
    if name in ("roads", "railroads"):
        return importlib.import_module("routes").make(name)
    return importlib.import_module(name)


def cell_origin(row, col):
    size = TILE * SHEET_SCALE
    return SEPARATOR + col * (size + SEPARATOR), SEPARATOR + row * (size + SEPARATOR)


def sheet_size(layout):
    rows = len(layout)
    cols = max(len(r) for r in layout)
    size = TILE * SHEET_SCALE
    return cols * size + (cols + 1) * SEPARATOR, rows * size + (rows + 1) * SEPARATOR


def cells(layout):
    for row, names in enumerate(layout):
        for col, name in enumerate(names):
            yield name, cell_origin(row, col)


def new_sheet(layout):
    return Image.new("RGB", sheet_size(layout), SEPARATOR_COLOR)


def make_template(set_name):
    sprite_set = load_set(set_name)
    sheet = new_sheet(sprite_set.LAYOUT)
    for name, origin in cells(sprite_set.LAYOUT):
        sheet.paste(sprite_set.mask(name, TILE * SHEET_SCALE), origin)
    return sheet


# Sprites are shown on top of what the game draws under them
def make_reference(set_name):
    sprite_set = load_set(set_name)
    sheet = new_sheet(sprite_set.LAYOUT)
    for name, origin in cells(sprite_set.LAYOUT):
        cell = sprite_set.reference_background(name)
        path = SPRITES / f"{name}.png"
        if path.exists():
            cell.alpha_composite(Image.open(path).convert("RGBA"))
        sheet.paste(cell.convert("RGB").resize((TILE * SHEET_SCALE,) * 2, Image.NEAREST), origin)
    return sheet


def is_magenta(r, g, b):
    return r > 160 and b > 160 and g < 110


# Slide a corner piece (nw, ne, sw or se) towards its corner until what is drawn meets both tile
# edges target pixels from the corner, so it lines up with the pieces next to it. Sliding keeps
# the pixel scale of the art, unlike shrinking it.
def slide_corner(cell, corner, target):
    size = cell.width
    inset = 2
    west = corner.endswith("w")
    north = corner.startswith("n")
    pixels = cell.load()

    def at(along, away):
        x = along if west else size - 1 - along
        y = away if north else size - 1 - away
        return pixels[x, y]

    def reach(get):
        d = 0
        while d < size and not is_magenta(*get(d)):
            d += 1
        return d

    # How far the drawing reaches along each row and column, counted from the corner
    along_rows = [reach(lambda d: at(d, k)) for k in range(size)]
    along_cols = [reach(lambda d: at(k, d)) for k in range(size)]
    dx, dy = min(
        ((dx, dy) for dx in range(size // 2) for dy in range(size // 2)),
        key=lambda s: abs(along_rows[inset + s[1]] - s[0] - target) + abs(along_cols[inset + s[0]] - s[1] - target),
    )
    slid = Image.new("RGB", (size, size), TRANSPARENT)
    slid.paste(cell, (-dx if west else dx, -dy if north else dy))
    return slid


# Separator lines are dark runs across the whole sheet. Returns the cells between them as
# (start, end) pairs, or None when the count doesn't match the layout.
def find_cells(drawn, axis, expected):
    w, h = drawn.size
    gray = drawn.convert("L").load()
    length, across = (w, h) if axis == "x" else (h, w)
    runs, start = [], None
    for i in range(length):
        samples = [gray[i, k] if axis == "x" else gray[k, i] for k in range(0, across, 3)]
        dark = sum(samples) / len(samples) < 45
        if dark and start is None:
            start = i
        elif not dark and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, length))
    if len(runs) != expected + 1:
        return None
    return [(runs[k][1], runs[k + 1][0]) for k in range(expected)]


def cell_boxes(drawn, layout):
    rows = len(layout)
    cols = max(len(r) for r in layout)
    xs = find_cells(drawn, "x", cols)
    ys = find_cells(drawn, "y", rows)
    if (xs is None or ys is None) and rows == cols == 1:
        return {layout[0][0]: (0, 0, drawn.width, drawn.height)}
    if xs is None or ys is None:
        scale_x = drawn.width / sheet_size(layout)[0]
        scale_y = drawn.height / sheet_size(layout)[1]
        size = TILE * SHEET_SCALE
        return {name: (x * scale_x, y * scale_y, (x + size) * scale_x, (y + size) * scale_y)
                for name, (x, y) in cells(layout)}
    return {name: (xs[col][0], ys[row][0], xs[col][1], ys[row][1])
            for row, names in enumerate(layout) for col, name in enumerate(names)}


# Magenta and the blend of magenta with an edge colour that resizing the drawing creates
def is_magentaish(r, g, b):
    return r > 120 and b > 120 and g < 0.6 * min(r, b)


# Shrink a cell to sprite size. Where the template has transparent parts, transparency is
# worked out at full size first and only the drawn pixels are averaged, so the magenta
# background doesn't bleed into the edges as a pink fringe.
def shrink(cell, transparent):
    if not transparent:
        return cell.resize((TILE, TILE), Image.BOX).convert("RGBA")
    rgba = cell.convert("RGBA")
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            if is_magentaish(*pixels[x, y][:3]):
                pixels[x, y] = (0, 0, 0, 0)
    small = rgba.convert("RGBa").resize((TILE, TILE), Image.BOX).convert("RGBA")
    alpha = small.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
    small.putalpha(alpha)
    return small


# Cut a drawn sheet into sprites. Cells are found from the separator lines, scaled to the
# template cell size, fitted where needed, shrunk to sprite size and given one shared palette.
def slice_sheet(set_name, drawn_path, out_dir):
    sprite_set = load_set(set_name)
    drawn = Image.open(drawn_path).convert("RGB")
    size = TILE * SHEET_SCALE

    shrunk = {}
    for name, box in cell_boxes(drawn, sprite_set.LAYOUT).items():
        # Trim the blurred rim of the separator lines off the cell
        left, top, right, bottom = box
        trim = max(1, round((right - left) / 128))
        cell = drawn.crop((round(left) + trim, round(top) + trim, round(right) - trim, round(bottom) - trim))
        cell = sprite_set.fit(cell.resize((size, size), Image.LANCZOS), name)
        transparent = any(color == TRANSPARENT for _, color in sprite_set.mask(name).getcolors())
        shrunk[name] = shrink(cell, transparent)

    # The palette comes from the drawn pixels only
    opaque = [p[:3] for cell in shrunk.values() for p in cell.getdata() if p[3]]
    strip = Image.new("RGB", (len(opaque), 1))
    strip.putdata(opaque)
    palette = strip.quantize(colors=PALETTE_SIZE, method=Image.Quantize.MEDIANCUT)

    sprites = {}
    for name, cell in shrunk.items():
        sprite = cell.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE).convert("RGBA")
        sprite.putalpha(cell.getchannel("A"))
        sprites[name] = sprite

    sprites = sprite_set.finish(sprites)
    for name, sprite in sprites.items():
        path = out_dir / f"{name}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        sprite.save(path)
    return list(sprites)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["template", "reference", "slice"])
    parser.add_argument("set", choices=SETS)
    parser.add_argument("drawn", nargs="?", help="the drawn sheet, for slice")
    parser.add_argument("--out", type=Path, default=SPRITES, help="where slice writes sprites")
    args = parser.parse_args()

    SHEETS.mkdir(exist_ok=True)
    if args.command == "template":
        path = SHEETS / f"{args.set}_template.png"
        make_template(args.set).save(path)
        print(f"wrote {path}")
    elif args.command == "reference":
        path = SHEETS / f"{args.set}_reference.png"
        make_reference(args.set).save(path)
        print(f"wrote {path}")
    else:
        names = slice_sheet(args.set, args.drawn, args.out)
        print(f"wrote {len(names)} sprites to {args.out}")


if __name__ == "__main__":
    main()
