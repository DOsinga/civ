"""More straight river pieces, so long straight rivers don't repeat: river/5_<n> runs north to
south and river/10_<n> east to west. The game picks one of them or the plain piece per tile.
Slice the main river sheet first; these get its straight pieces' edge bands.
"""

from PIL import Image

import rivers
from sheets import SPRITES

LAYOUT = [["river/10_1", "river/10_2"], ["river/5_1", "river/5_2"]]

mask = rivers.mask
reference_background = rivers.reference_background
fit = rivers.fit


def finish(sprites):
    straight = {side: Image.open(SPRITES / f"river/{5 if side in 'ns' else 10}.png").convert("RGBA") for side in "nesw"}
    return {name: rivers.with_straight_bands(sprite, int(name.split("/")[1].split("_")[0]), straight)
            for name, sprite in sprites.items()}
