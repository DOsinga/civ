# UI Setup - Civilization 1 Web Clone

## Overview

This document describes the UI rendering system for the Civ 1 clone. The goal is to match the original 320x200 VGA resolution, scaled 3x for modern displays (960x600 CSS pixels).

---

## Asset Sources

### Terrain Tileset: `tiles_native.png`

**Source**: Created from `TER257.png` (original DOS terrain) via `create_tileset.py`

**Format**: Horizontal strip of 16x16 tiles (native resolution)

**Tile Layout**:
```
Index   | Content
--------|------------------------------------------
0       | Ocean (solid blue)
1-10    | Base terrain tiles (currently just grassland base)
11-26   | Coastal ocean tiles (16 variants, 4-bit neighbor mask)
27-30   | Corner overlays (NW, NE, SW, SE diagonal land)
31-46   | Grassland overlays (16 variants)
47-62   | Plains overlays (16 variants)
63-78   | Desert overlays (16 variants)
79-94   | Forest overlays (16 variants)
95-110  | Hills overlays (16 variants)
111-126 | Mountains overlays (16 variants)
127-142 | Tundra overlays (16 variants)
143-158 | Arctic overlays (16 variants)
159-174 | Swamp overlays (16 variants)
175-190 | Jungle overlays (16 variants)
```

**4-bit neighbor mask**: `N | E<<1 | S<<2 | W<<3` (North=bit0, East=bit1, South=bit2, West=bit3)

**How to read a tile**:
```javascript
const srcX = tileIndex * 16;  // All tiles at y=0 in horizontal strip
ctx.drawImage(terrainImg, srcX, 0, 16, 16, destX, destY, 16, 16);
```

### Sprite Sheet: `SP257.png`

**Source**: Original DOS sprites, 320x200 pixels (20x12 tiles at 16x16)

**Layout** (row = y/16):
```
Row | Content
----|------------------------------------------
0   | Terrain decorations, icons
1   | More terrain/icons
2   | Small icons (food, shields, trade at right side)
    | - Food icon: col 8, offset (1,1), size 5x5
    | - Shield icon: col 8, offset (9,1), size 5x5
    | - Trade icon: col 9, offset (1,1), size 5x5
3   | City improvements/buildings
4   | Palace tiles (yellow)
5   | Palace tiles (gray/white)
6   | Rivers (blue)
7   | Bonus resources (oasis, horse, deer, buffalo, gold, game, seal, coal, gems, fish)
8   | Citizen sprites (8x12 each): happy, content, unhappy, entertainer, scientist, taxman
9   | More UI elements
10  | Unit sprites (militia, phalanx, settler, etc.)
11  | More units, gray texture pattern at far right (cols 18-19)
```

**Gray texture tile**: Located at approximately (288, 176) - tile position (18, 11)
- This is the dithered gray pattern used for sidebar backgrounds
- Colors: RGB(137,137,141) and RGB(153,153,153)

**Unit sprite row**: Row 10 (y=160)

**Cyan transparency color**: RGB(0, 170, 170) or similar - used as transparency key

### Font: Press Start 2P

**Source**: Google Fonts - https://fonts.googleapis.com/css2?family=Press+Start+2P

**Usage**: Pixel-perfect retro font for all game text. No anti-aliasing artifacts at small sizes.

**Load in HTML**:
```html
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
```

**Use in Canvas**:
```javascript
ctx.font = '8px "Press Start 2P", monospace';
```

---

## Screen Layout

### Native Resolution: 320x200

Everything is rendered at 320x200 native, then CSS-scaled 3x to 960x600.

### Main Game Screen

```
+--------------------------------------------------+ y=0
|                    MENU BAR                       | 14px high
|  GAME   ORDERS   ADVISORS   WORLD   CIVILOPEDIA  |
+--------+-----------------------------------------+ y=14
|        |                                         |
| SIDE   |              MAP VIEW                   |
| BAR    |           (240 x 186 px)                |
| 80px   |           15 x 11 tiles                 |
| wide   |                                         |
|        |                                         |
+--------+-----------------------------------------+ y=200
x=0     x=80                                    x=320
```

#### Menu Bar (0, 0) - (320, 14)
- Black background
- Text: First letter WHITE, rest GRAY
- Menu items: GAME, ORDERS, ADVISORS, WORLD, CIVILOPEDIA
- Font: 8px high
- Clicking a title drops down its menu, as in Civ 1; arrow keys move through the items and
  across menus, Enter picks, Escape closes. Each item shows its keyboard shortcut.
  - Game: Tax Rate, Luxuries Rate, FindCity, REVOLUTION!, Quit
  - Orders: only the orders the active unit can carry out (space, b, r, i, m, f, w, s, h, D)
  - Advisors: City Status (F1), Military (F2), Intelligence (F3), Attitude (F4), Trade (F5), Science (F6)
  - World: Wonders of the World (F7), Top 5 Cities (F8), Civilization Score (F9), World Map (F10)
  - Civilopedia: Advances, City Improvements, Military Units, Terrain Types
- Menus are built in `game.js` (`buildMenus`, `unitOrders`), reports in `reports.js`

#### Sidebar (0, 14) - (80, 200)
From top to bottom:

1**Minimap** (80 x 50 px)
   - Green = land, Blue = ocean, Black = unexplored
   - Colored dots for cities (player color)
   - White rectangle for viewport

2**Cyan/Light blue bar** (~8px)
   - Progress bar or separator

3**Stats Area** (gray texture background)
   - Row 1: Population with person icon, e.g. "60,000"
   - Row 2: Year with lightbulb icon, e.g. "2920 BC"
   - Row 3: Other stats, e.g. "830 0.5.5"
   - Text: 8px high, BLACK on gray texture

4**Unit Info Area** (gray texture background)
   - Nation name (e.g. "Egyptian")
   - Unit type (e.g. "Militia")
   - Moves remaining (e.g. "Moves: 1")
   - Location (e.g. "Thebes")
   - Terrain (e.g. "(Plains)")
   - Text: 8px high, BLACK on gray texture

#### Map View (80, 14) - (320, 200)
- 240 x 186 pixels = 15 x 11 tiles (with 6px unused at bottom)
- Terrain tiles from `tiles_native.png`
- Cities: White/cream box with black size number, cyan name below
- Units: Sprite with nation color replacement
- Selected unit: White border

### City Screen (Full 320x200 Canvas)

The city screen is rendered to the same 320x200 canvas, replacing the main game view.
Reference: screenshots/cityoverview.png

```
+--------------------------------------------------+ y=0
| [citizens]  THEBES (POP:60,000)                  | y=0-20 (20px)
+--------------------------+-----------------------+
| CITY RESOURCES (45px)    |                       |
| 🌾🌾🌾🌾🌾🌾🌾          |      MINI MAP         | y=20-65
| 🛡️🛡️🛡️🛡️                |      (85x83px)        |
| ↗️↗️  💰💰 💡            |                       |
+--------------------------+      terrain +        | y=65
| UNITS SUPPORTED (38px)   |      cities           |
| [militia] [settler]      |                       | y=65-103
+--------------------------+-----------------------+ y=103
| FOOD STORAGE (title 9px)                         |
| [fill area with grain]     [blue background]     |
|                                                  |
+--------------------------------------------------+ y=200
x=0                      x=125                  x=210

RIGHT COLUMN (x=210-320):
- Improvements list (PALACE, GRANARY, BARRACKS)
- Production area with shield progress
- CHANGE / BUY buttons
- RENAME / EXIT buttons
```

---

## State Management

The UI state machine (uistate.js) is the **single source of truth** for what the UI should display:

- `uiState.getState().type` determines which screen is active
- `uiState.getState().data` contains context for the current state (e.g., city object for city screen)
- View modules read from uiState, they don't maintain their own copies of state

Example: city_view.js gets the city to render via:
```javascript
const state = uiState.getState();
if (state.type === UIStateType.CITY_SCREEN) {
    const city = state.data.city;  // Single source of truth
    // ... render city screen
}
```

### UI State Types

All modal screens/dialogs must be represented as UIStateType values:

| State Type | Data | Description |
|------------|------|-------------|
| UNIT_ACTIVE | { unit } | Normal gameplay, unit selected |
| TURN_ENDED | {} | Waiting for next turn |
| CITY_SCREEN | { city } | City management screen |
| TECH_DISCOVERY | { tech, onClose } | Tech discovered popup |
| RESEARCH_SELECTION | { options, onSelect } | Choose next research |
| CHANGE_PRODUCTION | { city, options, onSelect } | Change city production |
| BUY_CONFIRM | { city, cost, onConfirm } | Confirm purchase dialog |
| INFO_DIALOG | { message, onDismiss } | Generic info popup |
| CHOICE_DIALOG | { message, choices, onChoice } | Generic choice popup |
| MENU | { menus, index, selectedIndex } | Drop-down menu from the menu bar |
| REPORT | { title, lines, items?, onSelect?, onClose?, worldMap? } | Full-screen advisor, world or Civilopedia report |

### Architecture Rules

1. **uistate.js** - Owns all UI state
   - Defines UIStateType enum
   - UIStateMachine class with transition methods
   - Stores current state type and data
   - Handles input routing based on current state

2. **view.js / city_view.js** - Pure rendering
   - Read-only access to uiState
   - No local `let xxxScreen = null` variables
   - Render functions check `uiState.getState().type` to decide what to draw
   - `isXxxOpen()` functions just check uiState, don't maintain separate state

3. **game.js** - Triggers transitions
   - Calls `uiState.showTechDiscovery(tech, cb)` not `view.showTechDiscovery()`
   - Doesn't store UI state, only game state (selectedUnit, etc.)
