# Civilization 1 Web Clone - Design Document

## Overview

A browser-based recreation of Sid Meier's Civilization 1 (1991). Build cities, research technologies, train military units, and compete against AI civilizations to dominate the world or reach the stars.

The game draws 32 pixel tiles on a 960x600 canvas, from a sprite atlas of new art in the style of the original (see Sprites). All game logic runs client-side in JavaScript.

**Reference Implementation:** OpenCiv (`/Users/douwe/checkout/OpenCiv`) - C# port with reverse-engineered game logic from the original 16-bit x86 assembly.

---

## TODO

Rules data (techs, units, buildings, wonders, terrain, governments) follows the FreeCiv
`civ1` ruleset.

- [ ] AI naval expansion and invasions
- [ ] Difficulty levels (content citizens, research cost, combat modifiers)
- [ ] Railroads, fortresses, pollution and global warming
- [ ] Caravan trade routes, diplomats, diplomacy between civilizations
- [ ] Barbarians and huts
- [ ] Space race (Apollo Program is in, spaceship parts are not)
- [ ] Civil war when a capital falls
- [ ] Diagonal movement (two arrow keys held)

---

## File Structure

```
static/projects/civ/
├── game.js           # Entry point, input handling, combat execution
├── uistate.js        # UI state machine (single source of truth)
├── view.js           # Main canvas rendering (map, sidebar, dialogs)
├── city_view.js      # City screen rendering
├── world.js          # World state, map, turn processing
├── player.js         # Player class (units, cities, gold, research)
├── units.js          # Unit class, UnitStatus, GameEventType, combat
├── aiplayer.js       # AI decision making and movement
├── terrain.js        # TERRAIN constants, yields, defense bonuses
├── tech.js           # Technology definitions, research functions
├── nations.js        # Nation definitions (colors, city names)
├── government.js     # Government definitions
├── improvements.js   # City improvement and wonder definitions
├── citymanagement.js # City yields, production, citizen assignment
├── sprites.js        # Loads the sprite atlas, draws sprites by name
└── assets/
    ├── atlas.png     # Every sprite, packed by art/pack_atlas.py
    └── atlas.json    # Name, position and size of each sprite in atlas.png

projects/civ/art/     # Not served
├── sprites.json      # Every sprite the game draws: name, size, description
├── sprites/          # One PNG per sprite, e.g. unit/settler.png, terrain/hills/5.png
├── pack_atlas.py     # Builds static/assets/atlas.png and atlas.json from sprites/
├── extract_originals.py  # One-shot: cut the original Civ 1 sheets into sprites/
└── originals/        # The original DOS sheets
```

### Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| `game.js` | Entry point, input handling, combat execution, coordinates modules |
| `uistate.js` | UI state machine, state transitions, event queue processing |
| `view.js` | Canvas rendering (map, sidebar, tech/research screens) |
| `city_view.js` | City screen rendering (reads from uiState, no local state) |
| `world.js` | World state, map, movement, combat, city capture, turn processing via `world.step()` |
| `government.js` | Government effects: rate limits, corruption, unit support, martial law |
| `player.js` | Player state, units array, cities array, research progress |
| `units.js` | Unit class, UnitStatus enum, GameEventType enum, `resolveCombat()` |
| `aiplayer.js` | AI turn processing, unit movement, target selection |
| `terrain.js` | Terrain types, yields, movement costs, defense bonuses |
| `tech.js` | Tech tree definitions, `checkTechDiscovery()`, `getAvailableResearch()` |
| `nations.js` | Nation colors, adjectives, city name lists |
| `improvements.js` | City improvement definitions (cost, effects, maintenance) |
| `citymanagement.js` | City yields calculation, production, citizen assignment |

### Module Dependencies

```
terrain.js  (no dependencies - base module)
    │
    ├─► nations.js
    ├─► tech.js
    │       │
    │       ▼
    ├─► units.js (UnitStatus, GameEventType, Unit class, resolveCombat)
    │       │
    │       ▼
    └─► player.js
            │
            ▼
        world.js ◄── citymanagement.js
            │
            ├─► aiplayer.js
            │
            ▼
        uistate.js
            │
            ├─► view.js ◄── city_view.js
            │
            ▼
        game.js (entry point)
```

---

## Architecture

### UI State Machine

The game uses a centralized state machine (`uistate.js`) as the **single source of truth** for UI state. View modules read from it; they don't maintain their own state copies.

```javascript
// uistate.js owns the current state
const state = uiState.getState();
// { type: UIStateType.CITY_SCREEN, data: { city: {...} } }

// View modules check state type to decide what to render
if (state.type === UIStateType.CITY_SCREEN) {
    renderCityScreen(state.data.city);
}
```

#### UI State Types

| State Type | Data | Description |
|------------|------|-------------|
| TURN_ENDED | {} | Waiting for Enter to start next turn |
| UNIT_ACTIVE | { unit } | Unit selected, awaiting orders |
| CITY_SCREEN | { city } | City management screen |
| TECH_DISCOVERY | { tech } | Tech discovered popup |
| RESEARCH_SELECTION | { options } | Choose next research |
| CHANGE_PRODUCTION | { city, options } | Change city production |
| BUY_CONFIRM | { city, item, cost } | Confirm purchase dialog |
| INFO_DIALOG | { message } | Generic info popup |

#### State Transitions

```
┌──────────────┐
│  TURN_ENDED  │◄─────────────────────────┐
└──────┬───────┘                          │
       │ Enter                            │
       ▼                                  │
┌──────────────┐                          │
│ world.step() │ → returns events         │
└──────┬───────┘                          │
       │                                  │
       ▼ process events                   │
┌──────────────┐  ┌──────────────┐        │
│ TECH_DISCOVERY│  │ INFO_DIALOG │        │
└──────┬───────┘  └──────┬───────┘        │
       │ dismiss         │ dismiss        │
       ▼                 ▼                │
┌─────────────────────────┐               │
│    selectNextUnit()     │               │
└────────────┬────────────┘               │
             │                            │
    ┌────────┴────────┐                   │
    ▼                 ▼                   │
┌──────────┐    ┌──────────┐              │
│UNIT_ACTIVE│    │(no units)│─────────────┘
└────┬─────┘    └──────────┘
     │ move/skip/fortify
     ▼
selectNextUnit() → ...
```

### Architecture Rules

1. **uistate.js** - Owns all UI state
   - Defines UIStateType enum
   - Stores current state type and data
   - Handles input routing based on current state
   - Triggers state transitions

2. **view.js / city_view.js** - Pure rendering
   - Read-only access to uiState
   - No local screen state variables
   - Render functions check `uiState.getState().type`

3. **game.js** - Triggers transitions
   - Calls `uiState.showTechDiscovery()`, `uiState.openCity()`, etc.
   - Handles combat execution
   - Doesn't store UI state, only game state (selectedUnit)

---

## Game Loop

### Turn Processing

```
EndTurn (Enter key):
1. world.step() processes all players:
   a. Check tech discovery → TECH_DISCOVERED event
   b. Check no research → NO_RESEARCH event
   c. Process cities → yields, growth, production completion
   d. Reset unit movement points
   e. AI players: processAITurn()

2. Human player events queued for UI

3. Process event queue:
   - TECH_DISCOVERED → show discovery screen
   - NO_RESEARCH → show research selection
   - UNIT_BUILT → notification
   - CITY_GREW → notification

4. selectNextUnit() or TURN_ENDED state
```

### City Processing (per turn)

`calculateCity(city)` in `citymanagement.js` computes everything a city produces:

1. Tile yields, with the Despotism/Anarchy penalty (-1 on any yield above 2) or the
   Republic/Democracy trade bonus. The city centre gets free irrigation and road.
2. Food: 2 per citizen plus 1 or 2 per supported settler. The food box is `(size + 1) * 10`.
3. Shields: factory and power bonuses, minus 1 per supported unit beyond the free ones.
4. Trade: corruption grows with distance from the palace, then the rest is split into
   tax, luxury and science by the player's rates. Marketplace/bank, library/university and
   science wonders multiply.
5. Happiness in Civ 1 order: 4 content base (fewer for big empires), luxuries, buildings,
   martial law or unhappiness from units abroad, then wonders. More unhappy than happy
   citizens means disorder: no shields, tax or science.

`processCityTurn` then grows or starves the city, adds shields (bought items complete
here), pays building upkeep and tracks disorder and "We Love the King Day".

### Unit Status

```javascript
UnitStatus = {
    WAITING_ORDERS: 'waiting',  // Has moves, needs orders
    DONE: 'done',               // Finished this turn
    FORTIFIED: 'fortified',     // Fortified until clicked
    BUILDING: 'building',       // Settler working on a tile improvement
    SENTRY: 'sentry',           // On a ship, woken when the ship reaches land
}
```

Moves are counted in thirds (`MOVE_FRAGS`), so a road costs 1 and hills cost 6.

- `WAITING_ORDERS`: Eligible for `selectNextUnit()`
- `DONE`: Reset to WAITING_ORDERS next turn
- `FORTIFIED`: Stays fortified across turns, +50% defense

---

## Combat System

`world.attack()` follows Civ 1: there are no hit points. Each side rolls a random number up
to its strength and the higher roll wins. The loser dies; a defender beaten outside a city
takes every unit on its tile with it.

Defense strength is `defense × veteran × terrain × river`, then either ×3 for City Walls
(or the Great Wall), or ×1.5 when fortified or inside a city. Artillery and bombers ignore
walls. The winner becomes a veteran half the time.

### Terrain Defense Bonuses

| Terrain | Defense Bonus |
|---------|---------------|
| Grassland, Plains, Desert, Tundra, Arctic | +0% |
| Forest, Jungle, Swamp | +50% |
| Hills | +100% |
| Mountains | +200% |

Rivers add another +50%.

---

## AI System

`processAITurn(player, world)` in `aiplayer.js` runs after the player's cities each turn:

1. **Government and rates:** revolt to the best known of Monarchy, Communism and Republic
   (never Democracy). Science as high as the government allows; more tax while the
   treasury is under 100 gold, and luxury goes up while cities riot.
2. **Production**, decided whenever a city has just finished something:
   - defenders until the garrison is big enough (1, 2 from size 6, +1 with enemies near),
     or when every defender is obsolete;
   - settlers while there is a free site within reach (first 6 cities before anything else);
   - buildings from `BUILDING_PLAN`, each with a condition (temple when unhappy, courthouse
     when corruption is high, walls when threatened, ...);
   - spare settlers to improve land, attackers up to two military units per city while
     upkeep stays below half the shields, then wonders, then the cheapest building.
3. **Disorder:** workers become entertainers until the city is calm.
4. **Gold:** above a 100 gold reserve the AI buys the cheapest item to finish, defenders for
   empty cities first.
5. **Units:**
   - garrisons fortify; obsolete units the city doesn't need are disbanded;
   - settlers walk to the best city site (`siteScore`: food ×3, shields ×2, trade, the centre
     tile triple, coast and river bonus) at least 4 tiles from other cities, or improve
     worked tiles (mines on hills, irrigation, roads) when there is no site;
   - military units attack adjacent enemies with reasonable odds, take empty cities, and
     otherwise head for the nearest enemy (attackers) or the nearest city short of defenders.

Movement uses a breadth-first search over land (`exploreLand`). The AI does not use ships,
so a civ that starts on a small island stays there.

### Simulating

All game logic runs without the DOM, so whole AI games can run headless in Node: set up a
`world` from a generated map, mark every player as AI and call `world.step()` in a loop.
A 400 turn, four civ game takes a few seconds.

---

## Rendering System

### Screen Layout

Everything is laid out in screen units: 480x296 for the whole screen (a 25 by 18 tile map under the menu bar), 16 units per map tile.
The canvas has 2 pixels per unit (4 on high density screens), so the 32 pixel sprites are
drawn pixel for pixel. It is shown at 960x600.

```
+--------------------------------------------------+ y=0
|                    MENU BAR                       | 8
+--------+-----------------------------------------+ y=8
|        |                                         |
| SIDE   |              MAP VIEW                   |
| BAR    |           (400 x 288 units)             |
| 80     |           25 x 18 tiles                 |
|        |                                         |
+--------+-----------------------------------------+ y=300
x=0     x=80                                    x=480
```

Full-screen panels (city screen, science advisor, production list, tech discovery) still
use the original 320x200 layout and are drawn centred. `toScreenUnits` and `toPanelUnits`
in `view.js` turn mouse positions into those coordinates.

### Sidebar

1. **Minimap** (80 x 50) - Green=land, Blue=ocean, white viewport rect
2. **Cyan bar** (8) - Separator
3. **Stats area** - Population, year, gold and tax.lux.sci rates
4. **Unit info** - Government, selected unit details or "Press Enter", research progress

### Sprites

All art lives in `art/sprites/` as one PNG per sprite, listed in `art/sprites.json` with its
size in pixels (32 per tile) and a description. `art/pack_atlas.py` packs them into
`static/assets/atlas.png` plus `atlas.json`, and the game draws them by name with
`drawSprite(ctx, 'unit/settler', x, y)` from `sprites.js`.

To replace a sprite, overwrite its PNG at the same size and run `python art/pack_atlas.py`.
Sprites marked `"missing": true` have no art yet; add the PNG and remove the flag.

Conventions:
- Real transparency (alpha channel), no colour keys.
- Sprites marked `recolor` (units) are painted in the owner's colour: every pixel close to
  the manifest's `playerColor` (97, 226, 101) is replaced.
- Terrain, rivers and roads come in sets keyed by a 4-bit neighbour mask (see `sets` in
  `sprites.json`): bit 0 = north, 1 = east, 2 = south, 3 = west. A land tile is
  `terrain/land_base` with `terrain/<terrain>/<mask>` on top, where the mask says which
  neighbours the terrain continues into: the sea, or a terrain in the same group (flat:
  grassland, plains, desert, tundra, arctic; vegetation: forest, jungle, swamp; relief: hills,
  mountains). Each overlay runs to those edges and stops short elsewhere. Grassland has no
  overlay; it is the base. Where a related but different terrain is next door, the tile also
  draws that neighbour's `terrain/<name>_edge/<side>`, speckles of it thinning out from the
  edge, so the two terrains speckle into each other instead of meeting in a straight line.
  `art/edges.py` makes these from the installed sprites. Carpet terrains (forest, jungle) also have `terrain/<name>_texture`, a seamless
  map-anchored texture drawn under the overlay; their overlay tiles keep only the drawn rim
  with the land base baked in around it, and are transparent inside, so large areas show no
  seams. Re-slice them if the land base changes.
- The open sea is one seamless texture, `terrain/water` (8x8 tiles), anchored to the map so
  there is no visible tile grid; its width divides the map width so it joins where the map
  wraps. Ocean tiles draw their piece of it, then the strip of land behind the beach, then the
  beach and surf `terrain/ocean/<mask>` (sides with land; there is no mask 0), then
  `terrain/ocean_corner/*` for land that only touches a corner.
- The strip of land behind the beach, `terrain/coast_land/<mask or corner>`, is the grass
  `coast.py` splits off the drawn coast. The game only uses it as a mask: each of its pixels
  is painted with the terrain of the nearest side or corner with land (land base, texture and
  the full overlay, mask 15), so forest, desert or ice runs on into the beach. Land tiles count
  the sea as a related neighbour, so they run to the tile edge towards it and leave no gap.

### Getting new art drawn

`art/sheets.py` makes a template and a reference sheet for a set of sprites, to hand to an
image generator, and slices the drawn sheet back into sprites. Each set has its rules in its
own module (`art/coast.py`): the template, corrections applied to drawn cells, and how the
sliced sprites become the game's sprites. For the coast that means sliding the corner pieces
until they meet the tile edges at the shore depth, turning the open-sea tile's waves into the
water texture, and cutting the open sea out of the coast tiles. The land terrains share
`art/overlay.py`: 16 self-contained tiles each, so one template serves them all, briefed in
`art/sheets/land_terrain_instructions.md`. `art/preview.py` draws a test map (coast, land
with one terrain in every arrangement, or routes) to check the joins, or a whole generated
map (`python preview.py world --seed N`) to see it all together, resources included.
`art/land_base.py --generate` makes the plain land base from the coast's greens.

Cities (`art/cities.py`, briefed in `art/sheets/cities_instructions.md`) are four stages,
`city/1` to `city/4` for sizes 1-3, 4-7, 8-11 and 12 and up, each also as `city/<stage>_walls`,
with roofs in the player colour. They are in the manifest as missing; the first sheet
(`cities_01`) came out as small mounds of houses that don't read at 32x32.

Irrigation, mine, pollution, hut and fortress (`tile/<name>`) come from `art/tiles.py`, which
runs the irrigation out to the tile edges so neighbouring irrigated tiles join into one field.
Only irrigation and mines are drawn so far; the game has no pollution, huts or fortresses yet.

Instead of city sprites, `drawCity` in `view.js` draws a city from code: three small blocks of houses (2 by 2
to 4 pixels) per citizen in the player colour, on streets in a dark shade of it, with a stone
wall and corner towers around the town's bounding box once it has city walls. Each city gets
its own layout from a seed, built block by block from the middle outwards, so it grows
rather than reshuffles; it fills the tile at about size 16. The size is in a badge top left.

---

## City Screen

### Layout (320x200)

```
+--------------------------------------------------+ y=0
| [citizens]  THEBES (POP:60,000)                  | 20px title
+--------------------------+-----------------------+ y=20
| CITY RESOURCES (45px)    |                       |
| food/shields/trade icons |      5x5 CITY MAP     | y=20-103
+--------------------------+      (terrain tiles)  |
| UNITS SUPPORTED (38px)   |                       |
| [militia] [settler]      |                       |
+--------------------------+-----------------------+ y=103
| FOOD STORAGE (97px)                              |
| [grain fill area]                                |
+--------------------------------------------------+ y=200
```

Right panel (x=210-320):
- Improvements list with building sprites, 16 to a page; clicking the list turns the page
- Production area with progress
- CHANGE / BUY buttons
- RENAME / EXIT buttons

The city map draws each tile with `drawMapTile` from `view.js`, the same as the main map, plus
the city itself in the middle. Rows of icons that don't fit are pushed closer together rather
than cut off, as in Civ 1: tile yields stay within two rows inside the tile, and the food and
production boxes are framed to the full amount needed, with the rows squeezed so a 300-shield
wonder still fits. Every redraw goes through `render()`, which shifts the panel to the middle
of the screen; drawing the panel directly puts it in the top left corner.

---

## Future Features

Not yet started:
- Diplomacy between civilizations
- Victory conditions (Conquest, Space Race)
- Multiplayer (turn-based networking)

---

## Map Generation & Rivers

### Map Generation (civ.py)

The server generates maps using a climate-based terrain system:

1. **Continent Placement**: 12 continent centers placed with spacing constraints
2. **Elevation**: Distance from continent centers + noise determines land/ocean
3. **Mountains/Hills**: Separate noise layer for elevation features
4. **Climate-Based Terrain**: Temperature (from latitude) + moisture determines biome
5. **Rivers**: Flow from high elevation to ocean, boost moisture nearby
6. **Terrain Assignment**: Probabilistic based on climate preferences, then two majority
   passes (`smooth_terrain`) so terrain comes in patches rather than single tiles

```python
# Climate preferences: (temperature, moisture)
TERRAIN_CLIMATE = {
    TERRAIN_ARCTIC: (0.0, 0.5),     # Cold, any moisture
    TERRAIN_TUNDRA: (0.2, 0.4),     # Cold, dry
    TERRAIN_DESERT: (0.7, 0.1),     # Hot, very dry
    TERRAIN_PLAINS: (0.5, 0.25),    # Temperate, dry
    TERRAIN_GRASSLAND: (0.5, 0.45), # Temperate, medium
    TERRAIN_FOREST: (0.5, 0.65),    # Temperate, wet
    TERRAIN_SWAMP: (0.6, 0.85),     # Warm, very wet
    TERRAIN_JUNGLE: (0.9, 0.9),     # Hot, very wet
}
```

### River Generation

Rivers are generated per-continent:
1. Find coastline tiles adjacent to continent
2. Pick random coast tile as river mouth
3. Trace river inland following elevation gradient
4. Branch when two paths have similar elevation
5. Remove nearby coast candidates (spacing varies by moisture: wet=5, dry=12 tiles)

Rivers are stored as direction sets per tile: `{'N', 'S', 'E', 'W'}`

### Packed Data Formats

**Terrain**: Single char per tile
```
o=Ocean, G=Grassland, P=Plains, D=Desert, F=Forest,
H=Hills, M=Mountains, T=Tundra, A=Arctic, S=Swamp, J=Jungle
```

**Rivers**: Hex digit per tile (4-bit encoding)
```
Bit 0 = N (1), Bit 1 = E (2), Bit 2 = S (4), Bit 3 = W (8)
Example: "5" = N+S = river flows north-south through tile
```

### River Rendering

**Land tiles**: `river/<mask>` sprites, the mask being the rivers' 4-bit value; the straight
pieces (5 and 10) also have variants `river/<mask>_1` and `_2`, picked by `(x + y) % 3`, so
long straight rivers meander. `art/rivers.py` bends the last stretch of every drawn piece
sideways onto the straight pieces' edge bands so crossings line up without a step, and slides each mouth until it ends just past the beach.

**River mouths**: `terrain/river_mouth/<side>` sprites drawn on the ocean tile, named after
the side the river comes in from (`n`: the river is on the tile to the north).

**Resources**: Not drawn on river tiles (rivers are special terrain)

---

## Map Wrapping

The world wraps horizontally (like a cylinder):

### Coordinate Wrapping

```javascript
// All terrain/river queries wrap X coordinate
getTerrainAt(x, y) {
    if (y < 0 || y >= MAP_HEIGHT) return TERRAIN.OCEAN;
    const wrappedX = ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
    return this.terrain[y][wrappedX];
}
```

### View Wrapping

```javascript
setView(x, y) {
    viewX = ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;  // X wraps
    viewY = Math.max(0, Math.min(MAP_HEIGHT - VIEW_TILES_Y, y));  // Y clamps
}
```

### Minimap Centering

The minimap is drawn with the viewport always centered horizontally:

```javascript
// Calculate offset to center viewport in minimap
const centerOffset = Math.floor(MAP_WIDTH / 2) - Math.floor(VIEW_TILES_X / 2);
const mapOffset = (viewX - centerOffset + MAP_WIDTH) % MAP_WIDTH;

// Draw terrain with offset
for (let mx = 0; mx < MAP_WIDTH; mx++) {
    const worldX = (mx + mapOffset) % MAP_WIDTH;
    drawPixel(mx, getMinimapColor(world.getTerrainAt(worldX, my)));
}

// Viewport rectangle always at center
const vx = x + centerOffset;
```

This makes scrolling feel natural - the viewport stays centered while the world rotates beneath it.
