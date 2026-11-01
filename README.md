# Civilization

[Play it](https://douwe.com/projects/civ)

A browser clone of Sid Meier's Civilization (1991), in plain JavaScript on a canvas. Found
cities, research technologies, build units and wonders, and fight the AI civilizations for the
world. The rules follow the FreeCiv `civ1` ruleset; the art is new, drawn in the spirit of the
original.

## Layout

- `civ.html`: the page, served by [douwe.com](https://douwe.com/projects/civ)
- `static/`: the game itself (`game.js` is the entry point) and its design notes in
  `DESIGN.md`, `GAMELOOP.md`, `AI_DESIGN.md` and `UI_SETUP.md`
- `static/assets/atlas.png`: all sprites packed into one image
- `art/`: the sprite pipeline. `sprites/` holds one PNG per sprite, `sprites.json` describes
  them, and `pack_atlas.py` packs them into the atlas. `sheets.py` makes the templates the
  artist draws on and slices finished sheets back into sprites.

## Run it

The game runs entirely in the browser, but the page is a Django template, so it is easiest to
play on the site. To rebuild the atlas after changing a sprite:

```bash
cd art && python pack_atlas.py
```
