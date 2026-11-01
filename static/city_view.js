// City View - handles city screen rendering
// Gets city data from UI state machine (uiState) - no local city state

import { TERRAIN } from './terrain.js';
import { UNIT_TYPES } from './units.js';
import { getProductionData, getFoodToGrow } from './citymanagement.js';
import { world } from './world.js';
import { uiState, UIStateType } from './uistate.js';
import { IMPROVEMENTS } from './improvements.js';
import { drawSprite, drawSpriteInColor, drawTexture, hasSprite } from './sprites.js';

// ============================================
// CONSTANTS - city screen layout (320x200)
// ============================================

const SCREEN_WIDTH = 320;
const SCREEN_HEIGHT = 200;
const TILE_SIZE = 16;

// Column widths (left to right)
const COL1_W = 128;  // Resources, Units, Food
const COL2_W = 82;   // City Map, Garrison
const COL3_W = SCREEN_WIDTH - COL1_W - COL2_W;  // Right panel (110)

// Row heights (top to bottom)
const ROW1_H = 20;   // Title bar
const ROW2_H = 45;   // Resources / top of city map
const ROW3_H = 37;   // Units / bottom of city map
const ROW4_H = SCREEN_HEIGHT - ROW1_H - ROW2_H - ROW3_H;  // Food, Garrison, Production (98)

// Derived positions
const COL2_X = COL1_W;
const COL3_X = COL1_W + COL2_W;
const ROW2_Y = ROW1_H;
const ROW3_Y = ROW1_H + ROW2_H;
const ROW4_Y = ROW1_H + ROW2_H + ROW3_H;

// Right panel section heights
const RP_BUILDINGS_H = 102;
const RP_PRODUCTION_H = 22;
const RP_BUTTONS_H = 14;
const RP_PROGRESS_H = SCREEN_HEIGHT - RP_BUILDINGS_H - RP_PRODUCTION_H - RP_BUTTONS_H;

// Layout boxes: { x, y, w, h }
const LAYOUT = {
    title:     { x: 0,      y: 0,      w: COL1_W + COL2_W, h: ROW1_H },
    resources: { x: 0,      y: ROW2_Y, w: COL1_W,          h: ROW2_H },
    units:     { x: 0,      y: ROW3_Y, w: COL1_W,          h: ROW3_H },
    cityMap:   { x: COL2_X, y: ROW2_Y, w: COL2_W,          h: ROW2_H + ROW3_H },
    food:      { x: 0,      y: ROW4_Y, w: COL1_W,          h: ROW4_H },
    garrison:  { x: COL2_X, y: ROW4_Y, w: COL2_W,          h: ROW4_H },
    rightPanel:{ x: COL3_X, y: 0,      w: COL3_W,          h: SCREEN_HEIGHT },
    // Right panel sub-sections
    rpBuildings: { x: COL3_X, y: 0,                                      w: COL3_W, h: RP_BUILDINGS_H },
    rpProduction:{ x: COL3_X, y: RP_BUILDINGS_H,                         w: COL3_W, h: RP_PRODUCTION_H },
    rpProgress:  { x: COL3_X, y: RP_BUILDINGS_H + RP_PRODUCTION_H,       w: COL3_W, h: RP_PROGRESS_H },
    rpButtons:   { x: COL3_X, y: RP_BUILDINGS_H + RP_PRODUCTION_H + RP_PROGRESS_H, w: COL3_W, h: RP_BUTTONS_H },
};

const BUILDING_ROW = 5.5;
const BUILDINGS_PER_PAGE = 16;

// Solid blue color
const SOLID_BLUE = '#364CAC';

// Draw 1px black border around a box (doesn't fill interior)
function drawBoxBorder(x, y, w, h) {
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, w, 1);           // top
    ctx.fillRect(x, y + h - 1, w, 1);   // bottom
    ctx.fillRect(x, y, 1, h);           // left
    ctx.fillRect(x + w - 1, y, 1, h);   // right
}

// ============================================
// EXTERNAL DEPENDENCIES (set by init)
// ============================================

let ctx = null;

// Drawing functions from view.js (set during init)
let drawMapTileFn = null;
let drawCityFn = null;

export function initCityView(viewCtx, drawFns) {
    ctx = viewCtx;
    drawMapTileFn = drawFns.drawMapTile;
    drawCityFn = drawFns.drawCity;
}

// ============================================
// STATE - city screen data (passed separately)
// ============================================

let cityScreenData = null;
let cityGarrisonUnits = [];
let buildingsPage = 0;
let buildingsCity = null;

export function setCityScreenData(data) {
    cityScreenData = data;
}

// ============================================
// HELPER: Get current city from UI state
// ============================================

function getCurrentCity() {
    const state = uiState.getState();
    if (state.type === UIStateType.CITY_SCREEN) {
        return state.data?.city || null;
    }
    return null;
}

// ============================================
// CITY SCREEN CHECK
// ============================================

export function isCityScreenOpen() {
    return uiState.getState().type === UIStateType.CITY_SCREEN;
}

// ============================================
// SPRITES
// ============================================

const ICON_SIZE = 7;
const ICON_SPACING = 8;

// Icons in a row, pushed closer together when there are too many to fit in width, as in Civ 1
function drawIconRow(icons, x, y, width, spacing = ICON_SPACING) {
    const step = icons.length > 1 ? Math.min(spacing, (width - ICON_SIZE) / (icons.length - 1)) : spacing;
    icons.forEach((icon, i) => drawSprite(ctx, icon, x + i * step, y));
}

function repeat(icon, count) {
    return Array(Math.max(count, 0)).fill(icon);
}

export function drawBuildingSprite(x, y, buildingType) {
    drawSprite(ctx, `building/${buildingType}`, x, y);
}

// ============================================
// BUTTONS
// ============================================

const BUTTON_COLORS = {
    blue: {
        bg: '#7D8DF7',
        text: '#364CAC',
        highlight: '#9DA8FF',
        shadow: '#4A5AAA',
    },
    red: {
        bg: '#C04040',
        text: '#FF6060',
        highlight: '#E06060',
        shadow: '#802020',
    },
};

function drawButton(text, x, y, w, h, colorScheme = 'blue') {
    const colors = BUTTON_COLORS[colorScheme] || BUTTON_COLORS.blue;

    ctx.fillStyle = colors.bg;
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = colors.highlight;
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y, 1, h);

    ctx.fillStyle = colors.shadow;
    ctx.fillRect(x, y + h - 1, w, 1);
    ctx.fillRect(x + w - 1, y, 1, h);

    ctx.fillStyle = colors.text;
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
}

// ============================================
// CITY SCREEN SECTIONS
// ============================================

function drawCityTitleBar(city, data, box) {
    const { x, y, w, h } = box;

    drawBoxBorder(x, y, w, h);

    const { happy = 0, content = city.size, unhappy = 0, entertainers = 0 } = data;
    const workers = [...repeat('happy', happy), ...repeat('content', content), ...repeat('unhappy', unhappy)];
    const citizens = [
        ...workers.map((mood, i) => `citizen/${mood}_${i % 2 ? 'woman' : 'man'}`),
        ...repeat('citizen/entertainer', entertainers),
    ];
    drawIconRow(citizens, x + 4, y + h - 1 - 13, w - 8, 9);

    const pop = (city.size || 1) * 10000;
    const text = `${city.name.toUpperCase()} (POP:${pop.toLocaleString()})`;

    ctx.fillStyle = '#fff';
    ctx.font = '5px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(text, x + w / 2, y + 1);
}

function drawCityResourcesBox(city, data, box) {
    const { x, y, w, h } = box;
    const titleH = 9;

    drawBoxBorder(x, y, w, h);

    // Title bar (solid blue, not textured)
    ctx.fillStyle = SOLID_BLUE;
    ctx.fillRect(x + 1, y + 1, w - 2, titleH);

    ctx.fillStyle = '#fff';
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('CITY RESOURCES', x + 4, y + 2);

    const contentY = y + titleH + 1;
    const rowHeight = 8;
    const iconsX = x + 4;
    // The numbers take the right of each row, the last row's the most
    const iconsW = w - 8 - 28;
    const taxRowW = w - 8 - 44;

    drawIconRow(repeat('icon/food', data.food), iconsX, contentY + 2, iconsW);
    drawIconRow(repeat('icon/shield', data.production), iconsX, contentY + 2 + rowHeight, iconsW);
    drawIconRow(repeat('icon/trade', data.trade - data.corruption), iconsX, contentY + 2 + rowHeight * 2, iconsW);
    drawIconRow([...repeat('icon/gold', data.tax), ...repeat('icon/science', data.sci)], iconsX, contentY + 2 + rowHeight * 3, taxRowW);

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.font = '5px "Press Start 2P", monospace';
    const right = x + w - 3;
    ctx.fillText(`${data.food}-${data.foodConsumed}`, right, contentY + 3);
    ctx.fillText(data.unitUpkeep ? `${data.shields}-${data.unitUpkeep}` : `${data.shields}`, right, contentY + 3 + rowHeight);
    ctx.fillText(data.corruption ? `${data.trade}-${data.corruption}` : `${data.trade}`, right, contentY + 3 + rowHeight * 2);
    ctx.fillText(`${data.tax}$ ${data.lux}L ${data.sci}S`, right, contentY + 3 + rowHeight * 3);
    ctx.textAlign = 'left';
}

function drawCityUnitsBox(city, data, box) {
    const { x, y, w, h } = box;

    drawBoxBorder(x, y, w, h);

    const unitsX = x + 4;
    const unitsY = y + 4;

    const player = world.getPlayer(city.player);
    const playerColor = player?.color || '#fff';

    const supportedUnits = player?.units?.filter(u => u.homeCity === city.id) || [];

    let ux = unitsX;
    for (let i = 0; i < Math.min(supportedUnits.length, 6); i++) {
        const unit = supportedUnits[i];
        drawSpriteInColor(ctx, `unit/${unit.typeId}`, ux, unitsY, playerColor);
        ux += 18;
    }
}

function drawCityMap(city, box) {
    const { x, y, w, h } = box;

    drawBoxBorder(x, y, w, h);

    const tiles = cityScreenData?.tiles || [];

    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;

            const worldX = city.x + dx;
            const worldY = city.y + dy;
            const tileX = x + 1 + (dx + 2) * TILE_SIZE;
            const tileY = y + 1 + (dy + 2) * TILE_SIZE;

            drawMapTileFn(worldX, worldY, tileX, tileY);
            if (dx === 0 && dy === 0) {
                drawCityFn(city, tileX, tileY);
            }

            const worked = tiles.find(t => t.dx === dx && t.dy === dy);
            if (worked) {
                drawTileYields(worked.yields, tileX, tileY);
            }
        }
    }
}

// Two rows at most, so the icons stay inside the tile however many there are
function drawTileYields(yields, tileX, tileY) {
    const [food, prod, trade] = yields;
    const icons = [...repeat('icon/food', food), ...repeat('icon/shield', prod), ...repeat('icon/trade', trade)];
    const perRow = Math.max(2, Math.ceil(icons.length / 2));
    drawIconRow(icons.slice(0, perRow), tileX + 1, tileY + 1, TILE_SIZE - 2);
    drawIconRow(icons.slice(perRow), tileX + 1, tileY + 8, TILE_SIZE - 2);
}

// Icons filling a box row by row; when the total wouldn't fit, the rows are squeezed together,
// so how full the box is still shows how far along it is
function drawIconBox(icon, filled, total, x, y, w, h) {
    const perRow = Math.floor((w - ICON_SIZE) / ICON_SPACING) + 1;
    const rows = Math.ceil(total / perRow);
    const rowStep = rows > 1 ? Math.min(ICON_SPACING + 1, (h - ICON_SIZE) / (rows - 1)) : 0;
    for (let i = 0; i < Math.min(filled, total); i++) {
        drawSprite(ctx, icon, x + (i % perRow) * ICON_SPACING, y + Math.floor(i / perRow) * rowStep);
    }
    drawBoxBorder(x - 2, y - 2, (perRow - 1) * ICON_SPACING + ICON_SIZE + 4, (rows - 1) * rowStep + ICON_SIZE + 4);
}

function drawFoodStorageBox(city, box) {
    const { x, y, w, h } = box;
    const titleH = 9;

    drawBoxBorder(x, y, w, h);

    // Title bar (solid blue, not textured)
    ctx.fillStyle = SOLID_BLUE;
    ctx.fillRect(x + 1, y + 1, w - 2, titleH);

    ctx.fillStyle = '#fff';
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('FOOD STORAGE', x + 4, y + 2);

    const contentY = y + titleH + 1;
    const contentH = h - titleH - 2;

    drawIconBox('icon/food', city.food || 0, getFoodToGrow(city.size), x + 4, contentY + 3, w - 8, contentH - 5);
}

function drawGarrisonBox(city, box) {
    const { x, y, w, h } = box;
    const titleH = 9;

    drawBoxBorder(x, y, w, h);

    // Title bar (solid blue, not textured)
    ctx.fillStyle = SOLID_BLUE;
    ctx.fillRect(x + 1, y + 1, w - 2, titleH);

    ctx.fillStyle = '#fff';
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('GARRISON', x + 4, y + 2);

    const contentY = y + titleH + 1;
    const contentH = h - titleH - 2;

    const garrisonedUnits = world.getUnitsAt(city.x, city.y) || [];
    cityGarrisonUnits = garrisonedUnits;

    const unitsPerRow = 3;
    const unitSpacing = 20;
    const startX = x + 8;
    const startY = contentY + 6;

    const player = world.getPlayer(city.player);
    const playerColor = player?.color || '#fff';

    for (let i = 0; i < garrisonedUnits.length; i++) {
        const unit = garrisonedUnits[i];
        const row = Math.floor(i / unitsPerRow);
        const col = i % unitsPerRow;
        const ux = startX + col * unitSpacing;
        const uy = startY + row * unitSpacing;

        if (uy + 16 > contentY + contentH) break;

        drawSpriteInColor(ctx, `unit/${unit.typeId}`, ux, uy, playerColor);
    }
}

function drawCityRightPanel(city, data, box) {
    const buildings = LAYOUT.rpBuildings;
    const production = LAYOUT.rpProduction;
    const progress = LAYOUT.rpProgress;
    const buttons = LAYOUT.rpButtons;

    // 1. Buildings box
    drawBoxBorder(buildings.x, buildings.y, buildings.w, buildings.h);

    const improvements = city.improvements || [];
    const pages = Math.ceil(improvements.length / BUILDINGS_PER_PAGE);
    buildingsPage %= Math.max(pages, 1);
    ctx.font = '5px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Pictures alternate between two columns, so each can be taller than a line of text
    const col1X = buildings.x + 2;
    const col2X = col1X + 20;
    const labelX = col2X + 20;
    const labelW = buildings.x + buildings.w - 2 - labelX;
    const page = improvements.slice(buildingsPage * BUILDINGS_PER_PAGE, (buildingsPage + 1) * BUILDINGS_PER_PAGE);
    page.forEach((imp, i) => {
        const iy = buildings.y + 2 + i * BUILDING_ROW;
        drawBuildingSprite(i % 2 === 0 ? col1X : col2X, iy, imp);
        ctx.fillStyle = IMPROVEMENTS[imp].wonder ? '#ff0' : '#fff';
        ctx.fillText(IMPROVEMENTS[imp].name.toUpperCase(), labelX, iy + 2, labelW);
    });
    if (pages > 1) {
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'right';
        ctx.fillText(`${buildingsPage + 1}/${pages}`, buildings.x + buildings.w - 3, buildings.y + buildings.h - 7);
        ctx.textAlign = 'left';
    }

    // 2. Production row (CHANGE / icon / BUY)
    drawBoxBorder(production.x, production.y, production.w, production.h);

    const btnH = 12;
    const btnY = production.y + (production.h - btnH) / 2;
    drawButton('CHANGE', production.x + 2, btnY, 38, btnH, 'blue');
    drawButton('BUY', production.x + production.w - 38 - 2, btnY, 38, btnH, 'blue');

    if (city.production) {
        const prodType = city.production.type;
        const unitInfo = UNIT_TYPES[prodType];
        const iconX = production.x + (production.w - 16) / 2;

        if (unitInfo) {
            const player = world.getPlayer(city.player);
            const playerColor = player?.color || '#fff';
            drawSpriteInColor(ctx, `unit/${prodType}`, iconX, production.y + 3, playerColor);
        } else if (hasSprite(`building/${prodType}`)) {
            drawBuildingSprite(iconX, production.y + 6, prodType);
        }
    }

    // 3. Progress box
    drawBoxBorder(progress.x, progress.y, progress.w, progress.h);

    if (city.production) {
        const prog = city.production.progress || 0;
        const prodData = getProductionData(city.production.type);
        ctx.fillStyle = '#fff';
        ctx.font = '5px "Press Start 2P", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${prodData.name.toUpperCase()} ${prog}/${prodData.cost}`, progress.x + 3, progress.y + progress.h - 8, progress.w - 6);
        drawIconBox('icon/shield', prog, prodData.cost, progress.x + 4, progress.y + 4, progress.w - 8, progress.h - 16);
    }

    // 4. Bottom buttons row
    drawBoxBorder(buttons.x, buttons.y, buttons.w, buttons.h);

    const bottomBtnH = 10;
    const bottomBtnY = buttons.y + (buttons.h - bottomBtnH) / 2;
    drawButton('RENAME', buttons.x + 2, bottomBtnY, 52, bottomBtnH, 'blue');
    drawButton('EXIT', buttons.x + buttons.w - 52 - 2, bottomBtnY, 52, bottomBtnH, 'red');
}

// ============================================
// MAIN RENDER
// ============================================

export function renderCityScreen() {
    const city = getCurrentCity();
    if (!ctx || !city) return;

    const data = cityScreenData || {};
    if (city !== buildingsCity) {
        buildingsCity = city;
        buildingsPage = 0;
    }

    // Draw blue texture background once for entire screen
    drawTexture(ctx, 'ui/blue_texture', 0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Draw each section with its layout box
    drawCityTitleBar(city, data, LAYOUT.title);
    drawCityResourcesBox(city, data, LAYOUT.resources);
    drawCityUnitsBox(city, data, LAYOUT.units);
    drawCityMap(city, LAYOUT.cityMap);
    drawFoodStorageBox(city, LAYOUT.food);
    drawGarrisonBox(city, LAYOUT.garrison);
    drawCityRightPanel(city, data, LAYOUT.rightPanel);
}

// ============================================
// CLICK HANDLING
// ============================================

// x and y are in panel units
export function handleCityScreenClick(x, y) {
    const city = getCurrentCity();
    if (!city) return null;

    const production = LAYOUT.rpProduction;
    const buttons = LAYOUT.rpButtons;

    // Button dimensions (must match drawing code)
    const btnH = 12;
    const btnY = production.y + (production.h - btnH) / 2;
    const bottomBtnH = 10;
    const bottomBtnY = buttons.y + (buttons.h - bottomBtnH) / 2;

    // CHANGE button
    if (x >= production.x + 2 && x <= production.x + 2 + 38 &&
        y >= btnY && y <= btnY + btnH) {
        return 'change';
    }

    // BUY button
    if (x >= production.x + production.w - 38 - 2 && x <= production.x + production.w - 2 &&
        y >= btnY && y <= btnY + btnH) {
        return 'buy';
    }

    // RENAME button
    if (x >= buttons.x + 2 && x <= buttons.x + 2 + 52 &&
        y >= bottomBtnY && y <= bottomBtnY + bottomBtnH) {
        return 'rename';
    }

    // EXIT button
    if (x >= buttons.x + buttons.w - 52 - 2 && x <= buttons.x + buttons.w - 2 &&
        y >= bottomBtnY && y <= bottomBtnY + bottomBtnH) {
        return 'exit';
    }

    const rb = LAYOUT.rpBuildings;
    if (x >= rb.x && x < rb.x + rb.w && y >= rb.y && y < rb.y + rb.h) {
        buildingsPage++;
        return 'buildings';
    }

    // City map click (5x5 grid)
    const cm = LAYOUT.cityMap;
    const cityMapX = cm.x + 1;
    const cityMapY = cm.y + 1;
    const cityMapSize = 5 * TILE_SIZE;
    if (x >= cityMapX && x < cityMapX + cityMapSize && y >= cityMapY && y < cityMapY + cityMapSize) {
        const tileX = Math.floor((x - cityMapX) / TILE_SIZE) - 2;
        const tileY = Math.floor((y - cityMapY) / TILE_SIZE) - 2;
        if (Math.abs(tileX) === 2 && Math.abs(tileY) === 2) return null;
        if (tileX === 0 && tileY === 0) return null;
        return { type: 'tile', dx: tileX, dy: tileY };
    }

    // Garrison box click
    const gb = LAYOUT.garrison;
    const titleH = 9;
    const garrisonContentY = gb.y + titleH + 1;
    const garrisonStartX = gb.x + 8;
    const garrisonStartY = garrisonContentY + 6;
    const unitsPerRow = 3;
    const unitSpacing = 20;

    if (x >= gb.x && x < gb.x + gb.w && y >= garrisonStartY && y < gb.y + gb.h) {
        const col = Math.floor((x - garrisonStartX) / unitSpacing);
        const row = Math.floor((y - garrisonStartY) / unitSpacing);
        const unitIndex = row * unitsPerRow + col;

        if (col >= 0 && col < unitsPerRow && unitIndex < cityGarrisonUnits.length) {
            return { type: 'garrison', unit: cityGarrisonUnits[unitIndex] };
        }
    }

    return null;
}

// ============================================
// POSITION EXPORTS
// ============================================

export function getCityMapPosition() {
    const cm = LAYOUT.cityMap;
    return { x: cm.x + 1, y: cm.y + 1, size: 5 * TILE_SIZE, tileSize: TILE_SIZE };
}

export function getCityResourcesBoxPosition() {
    const r = LAYOUT.resources;
    return { x: r.x + 2, y: r.y, w: r.w };
}
