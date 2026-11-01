// View - handles all rendering to the game canvas
// See UI_SETUP.md for layout documentation

import { TERRAIN, IMPROVEMENT, getTerrainColor, getTerrainName, getMinimapColor, RESOURCE, RESOURCE_DATA } from './terrain.js';
import { UNIT_TYPES, UnitStatus } from './units.js';
import { world, MAP_WIDTH, MAP_HEIGHT } from './world.js';
import { TECHNOLOGIES, getTechCost } from './tech.js';
import { GOVERNMENTS } from './government.js';
import { IMPROVEMENTS } from './improvements.js';
import { uiState, UIStateType } from './uistate.js';
import {
    initCityView, setCityScreenData, isCityScreenOpen, renderCityScreen, drawBuildingSprite
} from './city_view.js';
import { loadAtlas, isAtlasLoaded, hasSprite, spriteSize, spritePixels, drawSprite, drawSpritePart, drawSpriteInColor, drawTexture } from './sprites.js';

// ============================================
// CONSTANTS - see UI_SETUP.md
// ============================================

// Everything is laid out in screen units; the canvas has PIXEL_SCALE pixels per unit so that
// 32 pixel sprites fill a 16 unit tile
export const VIEW_WIDTH = 480;
export const VIEW_HEIGHT = 296;
export const PIXEL_SCALE = 2;
export const TILE_SIZE = 16;

// Full-screen panels (city screen, advisors) keep the original 320x200 layout, centred
export const PANEL_WIDTH = 320;
export const PANEL_HEIGHT = 200;
const PANEL_X = (VIEW_WIDTH - PANEL_WIDTH) / 2;
const PANEL_Y = (VIEW_HEIGHT - PANEL_HEIGHT) / 2;

// Layout regions
const MENU_HEIGHT = 8;
const SIDEBAR_WIDTH = 80;
const MAP_X = SIDEBAR_WIDTH;          // 80
const MAP_Y = MENU_HEIGHT;            // 8
const MAP_WIDTH_PX = VIEW_WIDTH - SIDEBAR_WIDTH;
const MAP_HEIGHT_PX = VIEW_HEIGHT - MENU_HEIGHT;

// Map view in tiles
export const VIEW_TILES_X = Math.floor(MAP_WIDTH_PX / TILE_SIZE);
export const VIEW_TILES_Y = Math.floor(MAP_HEIGHT_PX / TILE_SIZE);

// Sidebar layout (y positions relative to MENU_HEIGHT)
const MINIMAP_WIDTH = 80;
const MINIMAP_HEIGHT = 50;
const CYAN_BAR_HEIGHT = 8;

// ============================================
// STATE
// ============================================

let canvas, ctx;

// View position (which part of the map is visible)
export let viewX = 0;
export let viewY = 0;

// Callback for external modules needing images
let onImagesLoadedCallback = null;

// Animation state for smooth unit movement
let animatingUnitId = null;
let animVisualX = 0;  // Visual position in tiles (can be fractional)
let animVisualY = 0;

// ============================================
// INITIALIZATION
// ============================================

export function initCanvas() {
    // On high density screens use every device pixel: sprites stay exact and text gets sharper
    const scale = PIXEL_SCALE * Math.max(1, Math.round(window.devicePixelRatio));
    canvas = document.getElementById('game-canvas');
    canvas.width = VIEW_WIDTH * scale;
    canvas.height = VIEW_HEIGHT * scale;
    ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    initCityView(ctx, { drawMapTile, drawCity });
    return { mainCanvas: canvas, minimapCanvas: canvas };
}

export async function loadSprites(imageUrl, metaUrl) {
    await loadAtlas(imageUrl, metaUrl);
    onImagesLoadedCallback();
}

export function setOnImagesLoaded(callback) {
    onImagesLoadedCallback = callback;
}

// ============================================
// VIEW CONTROL
// ============================================

export function setView(x, y) {
    // X wraps around, Y is clamped
    viewX = ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
    viewY = Math.max(0, Math.min(MAP_HEIGHT - VIEW_TILES_Y, y));
}

export function centerViewOn(x, y) {
    setView(x - Math.floor(VIEW_TILES_X / 2), y - Math.floor(VIEW_TILES_Y / 2));
}

export function scrollView(dx, dy) {
    setView(viewX + dx, viewY + dy);
}

// ============================================
// DRAWING PRIMITIVES
// ============================================

function drawGrayTexture(x, y, width, height) {
    drawTexture(ctx, 'ui/gray_texture', x, y, width, height);
}

// ============================================
// TERRAIN RENDERING
// ============================================

function drawTerrainTile(terrainType, destX, destY, mapX, mapY) {
    if (!isAtlasLoaded()) {
        ctx.fillStyle = getTerrainColor(terrainType);
        ctx.fillRect(destX, destY, TILE_SIZE, TILE_SIZE);
        return;
    }

    if (terrainType === TERRAIN.OCEAN) {
        const hasN = world.isLand(mapX, mapY - 1) ? 1 : 0;
        const hasE = world.isLand(mapX + 1, mapY) ? 1 : 0;
        const hasS = world.isLand(mapX, mapY + 1) ? 1 : 0;
        const hasW = world.isLand(mapX - 1, mapY) ? 1 : 0;
        const mask = hasN | (hasE << 1) | (hasS << 2) | (hasW << 3);
        const shore = [['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]]
            .filter(([, dx, dy]) => world.isLand(mapX + dx, mapY + dy));
        // Land that only touches a corner
        const corners = [['nw', -1, -1, !hasN && !hasW], ['ne', 1, -1, !hasN && !hasE],
                         ['sw', -1, 1, !hasS && !hasW], ['se', 1, 1, !hasS && !hasE]]
            .filter(([, dx, dy, open]) => open && world.isLand(mapX + dx, mapY + dy));
        shore.push(...corners);

        drawMapTexture(ctx, 'terrain/water', mapX, mapY, destX, destY);
        if (shore.length) drawCoastLand(shore, mask, mapX, mapY, destX, destY);
        drawSprite(ctx, `terrain/ocean/${mask}`, destX, destY);
        for (const [corner] of corners) drawSprite(ctx, `terrain/ocean_corner/${corner}`, destX, destY);

        drawRiverMouths(destX, destY, mapX, mapY);
    } else {
        const name = getTerrainName(terrainType).toLowerCase();
        const neighbours = [['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0]]
            .map(([side, dx, dy]) => [side, world.getTerrainAt(mapX + dx, mapY + dy)]);
        // Towards the sea the land runs to the edge of the tile, up to the beach on the ocean tile
        const mask = neighbours.reduce((m, [, other], i) =>
            m | (other === TERRAIN.OCEAN || relatedTerrain(terrainType, other) ? 1 << i : 0), 0);
        drawLand(ctx, name, mask, mapX, mapY, destX, destY);
        for (const [side, other] of neighbours) {
            if (other !== terrainType && relatedTerrain(terrainType, other)) {
                drawSprite(ctx, `terrain/${getTerrainName(other).toLowerCase()}_edge/${side}`, destX, destY);
            }
        }
    }
}

// Terrains in one group run up to the edge towards each other and speckle into each other there
const TERRAIN_GROUPS = [
    [TERRAIN.GRASSLAND, TERRAIN.PLAINS, TERRAIN.DESERT, TERRAIN.TUNDRA, TERRAIN.ARCTIC],
    [TERRAIN.FOREST, TERRAIN.JUNGLE, TERRAIN.SWAMP],
    [TERRAIN.HILLS, TERRAIN.MOUNTAINS],
];

function relatedTerrain(a, b) {
    return a === b || TERRAIN_GROUPS.some(group => group.includes(a) && group.includes(b));
}

function drawLand(c, name, mask, mapX, mapY, destX, destY) {
    drawSprite(c, 'terrain/land_base', destX, destY);
    drawMapTexture(c, `terrain/${name}_texture`, mapX, mapY, destX, destY);
    drawSprite(c, `terrain/${name}/${mask}`, destX, destY);
}

// The open sea and carpet terrains like forest are seamless textures anchored to the map, so
// they show no tile grid. A texture's width in tiles divides the map width, so it also joins up
// where the map wraps around. The tile drawn on top leaves a hole where the texture shows.
function drawMapTexture(c, name, mapX, mapY, destX, destY) {
    if (!hasSprite(name)) return;
    const tiles = spriteSize(name).w / TILE_SIZE;
    const px = (((mapX % tiles) + tiles) % tiles) * TILE_SIZE;
    const py = (((mapY % tiles) + tiles) % tiles) * TILE_SIZE;
    drawSpritePart(c, name, px, py, TILE_SIZE, TILE_SIZE, destX, destY);
}

// Behind the beach on an ocean tile is a strip of land, terrain/coast_land, painted with the
// terrain of the land next to it so the land runs on into the beach. Each pixel of the strip
// takes the terrain of the nearest side or corner with land.
const coastMasks = new Map();
let coastCanvas = null;

function coastPartMasks(parts, mask) {
    const key = `${mask}|${parts.join()}`;
    if (coastMasks.has(key)) return coastMasks.get(key);
    const strips = [...(mask ? [String(mask)] : []), ...parts.filter(part => part.length === 2)]
        .map(name => spritePixels(`terrain/coast_land/${name}`));
    const size = strips[0].width;
    const masks = new Map(parts.map(part => [part, new ImageData(size, size)]));
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            if (!strips.some(strip => strip.data[i + 3])) continue;
            const distance = part => {
                const dx = part.includes('w') ? x + 0.5 : size - x - 0.5;
                const dy = part.includes('n') ? y + 0.5 : size - y - 0.5;
                return part.length === 2 ? Math.hypot(dx, dy) : (part === 'w' || part === 'e' ? dx : dy);
            };
            const nearest = parts.reduce((a, b) => distance(b) < distance(a) ? b : a);
            masks.get(nearest).data[i + 3] = 255;
        }
    }
    const canvases = new Map();
    for (const [part, data] of masks) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').putImageData(data, 0, 0);
        canvases.set(part, canvas);
    }
    coastMasks.set(key, canvases);
    return canvases;
}

function drawCoastLand(shore, mask, mapX, mapY, destX, destY) {
    const masks = coastPartMasks(shore.map(([part]) => part), mask);
    const size = masks.values().next().value.width;
    if (!coastCanvas) {
        coastCanvas = document.createElement('canvas');
        coastCanvas.width = coastCanvas.height = size;
    }
    const c = coastCanvas.getContext('2d');
    c.setTransform(size / TILE_SIZE, 0, 0, size / TILE_SIZE, 0, 0);
    c.imageSmoothingEnabled = false;
    for (const [part, dx, dy] of shore) {
        const name = getTerrainName(world.getTerrainAt(mapX + dx, mapY + dy)).toLowerCase();
        c.globalCompositeOperation = 'source-over';
        c.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
        drawLand(c, name, 15, mapX, mapY, 0, 0);
        c.globalCompositeOperation = 'destination-in';
        c.drawImage(masks.get(part), 0, 0, TILE_SIZE, TILE_SIZE);
        ctx.drawImage(coastCanvas, destX, destY, TILE_SIZE, TILE_SIZE);
    }
}

// Rivers: riverIndex is a 4-bit value, N=1, E=2, S=4, W=8. Straight pieces come in three
// variants, so long straight rivers don't repeat.
function drawRiver(destX, destY, riverIndex, mapX, mapY) {
    const variant = (mapX + mapY) % 3;
    const straight = riverIndex === 5 || riverIndex === 10;
    drawSprite(ctx, straight && variant ? `river/${riverIndex}_${variant}` : `river/${riverIndex}`, destX, destY);
}

// Draw river mouths on ocean tiles where adjacent land has rivers flowing in
// River bit encoding: N=1, E=2, S=4, W=8
// A river mouth is named after the side the river comes in from
function drawRiverMouths(destX, destY, mapX, mapY) {
    if (world.getRiverAt(mapX, mapY - 1) & 4) drawSprite(ctx, 'terrain/river_mouth/n', destX, destY);
    if (world.getRiverAt(mapX + 1, mapY) & 8) drawSprite(ctx, 'terrain/river_mouth/e', destX, destY);
    if (world.getRiverAt(mapX, mapY + 1) & 1) drawSprite(ctx, 'terrain/river_mouth/s', destX, destY);
    if (world.getRiverAt(mapX - 1, mapY) & 2) drawSprite(ctx, 'terrain/river_mouth/w', destX, destY);
}

// ============================================
// ENTITY RENDERING
// ============================================

// A city is drawn as small blocks of houses, 2 pixels by 2 to 4, BLOCKS_PER_CITIZEN for every
// citizen, on a 32x32 grid of half units. Each city has its own layout: each block is added next
// to the town so far, as close to the middle as fits, with a street between blocks. The layout is fixed per city, so the
// town grows rather than reshuffles.
const CITY_GRID = 32;
// Room for the street round the town and a wall with corner towers
const CITY_MARGIN = 4;
const BLOCKS_PER_CITIZEN = 3;
const cityLayouts = new Map();

function cityRandom(seed) {
    return () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
}

function cityLayout(city) {
    if (cityLayouts.has(city.id)) return cityLayouts.get(city.id);
    const random = cityRandom(city.id * 7919 + city.x * 31 + city.y);
    const size = () => {
        const long = 2 + Math.floor(random() * 3);
        return random() < 0.5 ? [2, long] : [long, 2];
    };
    const middle = CITY_GRID / 2;
    const fits = (b) => b.x >= CITY_MARGIN && b.y >= CITY_MARGIN &&
        b.x + b.w <= CITY_GRID - CITY_MARGIN && b.y + b.h <= CITY_GRID - CITY_MARGIN &&
        blocks.every(o => b.x + b.w + 1 <= o.x || o.x + o.w + 1 <= b.x || b.y + b.h + 1 <= o.y || o.y + o.h + 1 <= b.y);
    const [w, h] = size();
    const blocks = [{ x: Math.round(middle - w / 2), y: Math.round(middle - h / 2), w, h }];
    for (;;) {
        const candidates = [];
        for (const o of blocks) {
            for (let k = 0; k < 6; k++) {
                const [w, h] = size();
                const alongX = o.x - w + 1 + Math.floor(random() * (o.w + w - 1));
                const alongY = o.y - h + 1 + Math.floor(random() * (o.h + h - 1));
                candidates.push(
                    { x: alongX, y: o.y - h - 1, w, h }, { x: alongX, y: o.y + o.h + 1, w, h },
                    { x: o.x - w - 1, y: alongY, w, h }, { x: o.x + o.w + 1, y: alongY, w, h });
            }
        }
        const scored = candidates.filter(fits)
            .map(b => [Math.hypot(b.x + b.w / 2 - middle, b.y + b.h / 2 - middle) + random() * 3, b]);
        if (scored.length === 0) break;
        blocks.push(scored.reduce((best, c) => c[0] < best[0] ? c : best)[1]);
    }
    cityLayouts.set(city.id, blocks);
    return blocks;
}

function shade(hex, amount) {
    const target = amount > 0 ? 255 : 0;
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return `rgb(${channels.map(c => Math.round(c + (target - c) * Math.abs(amount))).join(',')})`;
}

function drawCity(city, destX, destY) {
    const player = world.getPlayer(city.player);
    const playerColor = player?.color || '#ffff00';
    const layout = cityLayout(city);
    const blocks = layout.slice(0, Math.max(1, city.size) * BLOCKS_PER_CITIZEN);
    const rect = (x, y, w, h, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(destX + x / 2, destY + y / 2, w / 2, h / 2);
    };

    const left = Math.min(...blocks.map(b => b.x)) - 1;
    const top = Math.min(...blocks.map(b => b.y)) - 1;
    const right = Math.max(...blocks.map(b => b.x + b.w)) + 1;
    const bottom = Math.max(...blocks.map(b => b.y + b.h)) + 1;

    if (city.improvements.includes('walls')) {
        const stone = '#d8d0bc';
        const dark = '#4a4640';
        rect(left - 3, top - 3, right - left + 6, bottom - top + 6, dark);
        rect(left - 2, top - 2, right - left + 4, bottom - top + 4, stone);
        for (const [x, y] of [[left - 3, top - 3], [right - 1, top - 3], [left - 3, bottom - 1], [right - 1, bottom - 1]]) {
            rect(x, y, 4, 4, dark);
            rect(x + 1, y + 1, 2, 2, stone);
        }
    }
    rect(left, top, right - left, bottom - top, shade(playerColor, -0.6));
    for (const b of blocks) {
        rect(b.x, b.y, b.w, b.h, playerColor);
        rect(b.x, b.y, b.w, 1, shade(playerColor, 0.45));
    }

    const label = String(city.size || 1);
    ctx.font = '4px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const badgeW = ctx.measureText(label).width + 2;
    ctx.fillStyle = '#000';
    ctx.fillRect(destX, destY, badgeW, 6);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, destX + 1, destY + 1);

    ctx.font = '6px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0ff';
    ctx.fillText(city.name, destX + TILE_SIZE / 2, destY + TILE_SIZE + 1);
}

// Blink state for selected unit
let blinkOn = true;
let blinkInterval = null;

export function startBlinking(callback) {
    if (blinkInterval) clearInterval(blinkInterval);
    blinkOn = true;
    blinkInterval = setInterval(() => {
        blinkOn = !blinkOn;
        if (callback) callback();
    }, 300);  // Blink every 300ms
}

export function stopBlinking() {
    if (blinkInterval) {
        clearInterval(blinkInterval);
        blinkInterval = null;
    }
    blinkOn = true;
}

// Set animation state for smooth unit movement
export function setUnitAnimation(unitId, visualX, visualY) {
    animatingUnitId = unitId;
    animVisualX = visualX;
    animVisualY = visualY;
}

export function clearUnitAnimation() {
    animatingUnitId = null;
}

function drawUnit(unit, destX, destY, isSelected) {
    // If selected and blink is off, don't draw the unit (makes it blink)
    // But always draw if unit is animating (moving)
    const isAnimating = animatingUnitId === unit.id;
    if (isSelected && !blinkOn && !isAnimating) {
        return;
    }

    drawSpriteInColor(ctx, `unit/${unit.typeId}`, destX, destY, world.getPlayer(unit.player).color);

    // Draw "F" indicator for fortified units
    if (unit.status === UnitStatus.FORTIFIED) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('F', destX + 1, destY + 1);
    }

    // Draw building indicator for settlers (R=road, I=irrigation, M=mine)
    if (unit.status === UnitStatus.BUILDING && unit.buildingImprovement) {
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        let letter = '?';
        let color = '#fff';
        if (unit.buildingImprovement === IMPROVEMENT.ROAD) {
            letter = 'R';
            color = '#8B4513';  // Brown
        } else if (unit.buildingImprovement === IMPROVEMENT.RAILROAD) {
            letter = 'RR';
            color = '#333';
        } else if (unit.buildingImprovement === IMPROVEMENT.IRRIGATION) {
            letter = 'I';
            color = '#4169E1';  // Blue
        } else if (unit.buildingImprovement === IMPROVEMENT.MINE) {
            letter = 'M';
            color = '#666';     // Gray
        }
        ctx.fillStyle = color;
        ctx.fillText(letter, destX + 1, destY + 1);
    }

    // Don't draw selection box while animating
    if (isSelected && !isAnimating) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(destX + 1, destY + 1, TILE_SIZE - 2, TILE_SIZE - 2);
    }
}

// ============================================
// SCREEN SECTIONS
// ============================================

// Press Start 2P is monospaced: every character is as wide as the font size
const MENU_TITLES = ['Game', 'Orders', 'Advisors', 'World', 'Civilopedia'];
const MENU_CHAR = 8;
const MENU_TITLE_X = MENU_TITLES.map((_, i) =>
    2 + MENU_TITLES.slice(0, i).reduce((x, title) => x + (title.length + 1) * MENU_CHAR, 0));
const DROPDOWN_CHAR = 6;
const DROPDOWN_LINE = 9;

function keyLabel(key) {
    return key === ' ' ? 'space' : key || '';
}

function dropdownBox(menu, index) {
    const chars = Math.max(...menu.items.map(item => item.label.length + (item.key ? keyLabel(item.key).length + 2 : 0)));
    const w = chars * DROPDOWN_CHAR + 12;
    const x = Math.min(MENU_TITLE_X[index] - 2, VIEW_WIDTH - w);
    return { x, y: MENU_HEIGHT, w, h: menu.items.length * DROPDOWN_LINE + 6 };
}

function drawMenuBar(openIndex = -1) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_WIDTH, MENU_HEIGHT);

    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    MENU_TITLES.forEach((title, i) => {
        const x = MENU_TITLE_X[i];
        if (i === openIndex) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(x - 2, 0, title.length * MENU_CHAR + 4, MENU_HEIGHT);
            ctx.fillStyle = '#000';
            ctx.fillText(title, x, 0);
            return;
        }
        ctx.fillStyle = '#fff';
        ctx.fillText(title[0], x, 0);
        ctx.fillStyle = '#888';
        ctx.fillText(title.slice(1), x + MENU_CHAR, 0);
    });
}

function drawDropdown({ menus, index, selectedIndex }) {
    const menu = menus[index];
    const box = dropdownBox(menu, index);
    drawGrayTexture(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);

    ctx.font = '6px "Press Start 2P", monospace';
    ctx.textBaseline = 'top';
    menu.items.forEach((item, i) => {
        const y = box.y + 3 + i * DROPDOWN_LINE;
        if (i === selectedIndex) {
            ctx.fillStyle = '#0aa';
            ctx.fillRect(box.x + 2, y, box.w - 4, DROPDOWN_LINE);
        }
        ctx.fillStyle = item.disabled ? '#555' : i === selectedIndex ? '#fff' : '#000';
        ctx.textAlign = 'left';
        ctx.fillText(item.label, box.x + 6, y + 2);
        if (item.key) {
            ctx.textAlign = 'right';
            ctx.fillText(keyLabel(item.key), box.x + box.w - 6, y + 2);
        }
    });
    ctx.textAlign = 'left';
}

// What a click hits while the menu bar is visible: { title } for a menu title, { item } for an
// entry of the open menu, or null
export function menuHitAt(screenX, screenY) {
    const { x, y } = toScreenUnits(screenX, screenY);
    if (y < MENU_HEIGHT) {
        const title = MENU_TITLE_X.findLastIndex(tx => x >= tx - 2);
        return title >= 0 && x < MENU_TITLE_X[title] + MENU_TITLES[title].length * MENU_CHAR + 2 ? { title } : null;
    }
    const state = uiState.getState();
    if (state.type !== UIStateType.MENU) return null;
    const box = dropdownBox(state.data.menus[state.data.index], state.data.index);
    const item = Math.floor((y - box.y - 3) / DROPDOWN_LINE);
    const inside = x >= box.x && x < box.x + box.w && item >= 0 && item < state.data.menus[state.data.index].items.length;
    return inside ? { item } : null;
}

function drawSidebar(selectedUnit, gameState) {
    const sidebarY = MENU_HEIGHT;

    // Fill entire sidebar with gray first to eliminate any gaps
    ctx.fillStyle = '#888';
    ctx.fillRect(0, sidebarY, SIDEBAR_WIDTH, VIEW_HEIGHT - sidebarY);

    // 1. Minimap at top
    drawMinimap(0, sidebarY);

    // 2. Cyan bar below minimap
    const cyanBarY = sidebarY + MINIMAP_HEIGHT;
    ctx.fillStyle = '#0aa';
    ctx.fillRect(0, cyanBarY, SIDEBAR_WIDTH, CYAN_BAR_HEIGHT);

    // 3. Stats area with gray texture
    const statsY = cyanBarY + CYAN_BAR_HEIGHT;
    const statsHeight = 36;
    drawGrayTexture(0, statsY, SIDEBAR_WIDTH, statsHeight);

    // Stats text - use pixel font
    ctx.fillStyle = '#000';
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Row 1: Population (TODO: add person icon)
    // Calculate from city sizes: each pop point = 10,000 people
    let totalPop = 0;
    if (world.humanPlayer?.cities) {
        for (const city of world.humanPlayer.cities) {
            totalPop += (city.size || 1) * 10000;
        }
    }
    ctx.fillText(`${totalPop.toLocaleString()}`, 4, statsY + 4);

    // Row 2: Year (TODO: add lightbulb icon)
    const year = world.getYear?.() ?? '4000 BC';
    ctx.fillText(year, 4, statsY + 14);

    const player = world.humanPlayer;
    const { tax, lux, sci } = player.effectiveRates;
    ctx.fillText(`${player.gold}$ ${tax}.${lux}.${sci}`, 4, statsY + 24);

    // 4. Unit info area with gray texture
    const infoY = statsY + statsHeight;
    const infoHeight = VIEW_HEIGHT - infoY;
    drawGrayTexture(0, infoY, SIDEBAR_WIDTH, infoHeight);

    ctx.fillStyle = '#000';
    ctx.fillText(player.gov.name, 4, infoY + 4);
    if (player.currentResearch) {
        ctx.fillText(`${TECHNOLOGIES[player.currentResearch].name}`.slice(0, 12), 4, infoY + 64);
        ctx.fillText(`${player.science}/${getTechCost(player)}`, 4, infoY + 74);
    }

    // Unit info text based on UI state
    ctx.fillStyle = '#000';
    if ((gameState?.type === UIStateType.UNIT_ACTIVE || gameState?.type === UIStateType.MENU) && selectedUnit) {
        const player = world.getPlayer(selectedUnit.player);
        ctx.fillText(player?.adjective || 'Unknown', 4, infoY + 14);
        ctx.fillText(selectedUnit.name, 4, infoY + 24);

        // Show building status for settlers
        if (selectedUnit.status === UnitStatus.BUILDING) {
            const improvementNames = { 1: 'Road', 2: 'Irrigating', 4: 'Mine', 8: 'Railroad' };
            const impName = improvementNames[selectedUnit.buildingImprovement] || '?';
            ctx.fillText(impName, 4, infoY + 34);
            ctx.fillText(`${selectedUnit.buildingTurnsLeft} turns`, 4, infoY + 44);
        } else {
            ctx.fillText(`Moves: ${selectedUnit.movesText}`, 4, infoY + 34);
            ctx.fillText(`(${getTerrainName(world.getTerrainAt(selectedUnit.x, selectedUnit.y))})`, 4, infoY + 44);
            if (selectedUnit.veteran) ctx.fillText('Veteran', 4, infoY + 54);
        }
    } else {
        // Any other state: show "Press Enter"
        ctx.fillText('Press Enter', 4, infoY + 14);
        ctx.fillText('to continue', 4, infoY + 24);
    }
}

function drawMinimap(x, y) {
    // Black background (unexplored)
    ctx.fillStyle = '#000';
    ctx.fillRect(x, y, MINIMAP_WIDTH, MINIMAP_HEIGHT);

    // Terrain - simple non-wrapped view
    for (let my = 0; my < MAP_HEIGHT; my++) {
        for (let mx = 0; mx < MAP_WIDTH; mx++) {
            if (!world.isExplored(mx, my)) continue;
            ctx.fillStyle = getMinimapColor(world.getTerrainAt(mx, my));
            ctx.fillRect(x + mx, y + my, 1, 1);
        }
    }

    // Cities (1x1 colored dots)
    for (const city of world.getAllCities().filter(c => world.isExplored(c.x, c.y))) {
        const player = world.getPlayer(city.player);
        ctx.fillStyle = player?.color || '#f00';
        ctx.fillRect(x + city.x, y + city.y, 1, 1);
    }

    // Units
    for (const unit of world.getAllUnits().filter(u => u.player === world.humanPlayer.id || world.humanSees(u.x, u.y))) {
        const player = world.getPlayer(unit.player);
        ctx.fillStyle = player?.color || '#fff';
        ctx.fillRect(x + unit.x, y + unit.y, 1, 1);
    }

    // Viewport rectangle - viewX wraps, so we might need to draw it twice
    ctx.fillStyle = '#fff';
    const vw = VIEW_TILES_X;
    const vh = VIEW_TILES_Y;

    // Draw viewport rectangle (may wrap around right edge)
    const vx1 = x + viewX;
    const vy = y + viewY;

    if (viewX + vw <= MAP_WIDTH) {
        // Viewport fits without wrapping
        ctx.fillRect(vx1, vy, vw, 1);           // Top
        ctx.fillRect(vx1, vy + vh - 1, vw, 1);  // Bottom
        ctx.fillRect(vx1, vy, 1, vh);           // Left
        ctx.fillRect(vx1 + vw - 1, vy, 1, vh);  // Right
    } else {
        // Viewport wraps around - draw two parts
        const rightPart = MAP_WIDTH - viewX;
        const leftPart = vw - rightPart;

        // Right part (at viewX to edge)
        ctx.fillRect(vx1, vy, rightPart, 1);           // Top
        ctx.fillRect(vx1, vy + vh - 1, rightPart, 1);  // Bottom
        ctx.fillRect(vx1, vy, 1, vh);                  // Left edge

        // Left part (from 0)
        ctx.fillRect(x, vy, leftPart, 1);              // Top
        ctx.fillRect(x, vy + vh - 1, leftPart, 1);     // Bottom
        ctx.fillRect(x + leftPart - 1, vy, 1, vh);     // Right edge
    }
}

// Each road sprite runs from the centre of the tile towards one neighbour
const ROAD_DIRECTIONS = [
    { dx: 0, dy: -1, name: 'n' },
    { dx: 1, dy: -1, name: 'ne' },
    { dx: 1, dy: 0, name: 'e' },
    { dx: 1, dy: 1, name: 'se' },
    { dx: 0, dy: 1, name: 's' },
    { dx: -1, dy: 1, name: 'sw' },
    { dx: -1, dy: 0, name: 'w' },
    { dx: -1, dy: -1, name: 'nw' },
];

// A railroad tile draws rails towards railroads and cities, and road towards plain roads.
// Until there is railroad art, railroads are drawn as roads.
function drawRoads(destX, destY, mapX, mapY) {
    const rail = world.hasImprovement(mapX, mapY, IMPROVEMENT.RAILROAD) && hasSprite('rail/center');
    drawSprite(ctx, rail ? 'rail/center' : 'road/center', destX, destY);
    for (const dir of ROAD_DIRECTIONS) {
        const x = mapX + dir.dx;
        const y = mapY + dir.dy;
        const city = world.getCityAt(x, y);
        if (rail && (city || world.hasImprovement(x, y, IMPROVEMENT.RAILROAD))) {
            drawSprite(ctx, `rail/${dir.name}`, destX, destY);
        } else if (city || world.hasImprovement(x, y, IMPROVEMENT.ROAD)) {
            drawSprite(ctx, `road/${dir.name}`, destX, destY);
        }
    }
}

function drawMapArea(selectedUnit) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(MAP_X, MAP_Y, VIEW_TILES_X * TILE_SIZE, VIEW_TILES_Y * TILE_SIZE);
    ctx.clip();
    drawMapTiles(selectedUnit);
    ctx.restore();
}

// Terrain plus everything on it that isn't a city or a unit
function drawMapTile(mapX, mapY, destX, destY) {
    drawTerrainTile(world.getTerrainAt(mapX, mapY), destX, destY, mapX, mapY);

    const riverIndex = world.getRiverAt(mapX, mapY);
    const improvements = world.getImprovementAt(mapX, mapY);

    // Draw irrigation BEFORE rivers (as base layer)
    if (riverIndex === 0 && (improvements & IMPROVEMENT.IRRIGATION)) {
        drawSprite(ctx, 'tile/irrigation', destX, destY);
    }

    if (riverIndex > 0) {
        drawRiver(destX, destY, riverIndex, mapX, mapY);
    }

    // Roads cross rivers on top of them
    if (improvements & IMPROVEMENT.ROAD) {
        drawRoads(destX, destY, mapX, mapY);
    }
    if (riverIndex === 0 && (improvements & IMPROVEMENT.MINE)) {
        drawSprite(ctx, 'tile/mine', destX, destY);
    }

    if (riverIndex === 0) {
        const resource = world.getResourceAt(mapX, mapY);
        if (resource) {
            drawSprite(ctx, RESOURCE_DATA[resource].sprite, destX, destY);
        }
    }
}

function drawMapTiles(selectedUnit) {
    // Draw terrain tiles
    for (let dy = 0; dy < VIEW_TILES_Y; dy++) {
        for (let dx = 0; dx < VIEW_TILES_X; dx++) {
            // Wrap X coordinate
            const mapX = (viewX + dx) % MAP_WIDTH;
            const mapY = viewY + dy;
            const destX = MAP_X + dx * TILE_SIZE;
            const destY = MAP_Y + dy * TILE_SIZE;

            if (world.isExplored(mapX, mapY)) drawMapTile(mapX, mapY, destX, destY);
        }
    }

    // Helper to get screen X position with wrapping
    function getScreenX(worldX) {
        let sx = worldX - viewX;
        // Handle wrapping - if off screen to the left, try wrapping around
        if (sx < 0) sx += MAP_WIDTH;
        // If off screen to the right, try wrapping the other way
        if (sx >= MAP_WIDTH) sx -= MAP_WIDTH;
        return sx;
    }

    // Draw cities
    for (const city of world.getAllCities().filter(c => world.isExplored(c.x, c.y))) {
        const sx = getScreenX(city.x);
        const sy = city.y - viewY;
        if (sx >= 0 && sx < VIEW_TILES_X && sy >= 0 && sy < VIEW_TILES_Y) {
            drawCity(city, MAP_X + sx * TILE_SIZE, MAP_Y + sy * TILE_SIZE);
        }
    }

    // Draw units (skip garrisoned units in cities)
    for (const unit of world.getAllUnits()) {
        const isSelected = selectedUnit && selectedUnit.id === unit.id;

        // The selected unit hides the others on its tile, so it is on top and blinks over the terrain
        if (!isSelected && selectedUnit && unit.x === selectedUnit.x && unit.y === selectedUnit.y) continue;
        if (unit.player !== world.humanPlayer.id && !world.humanSees(unit.x, unit.y)) continue;

        // Skip units that are inside a city (garrisoned)
        // Only draw selected unit at city if explicitly activated from garrison
        const cityAtUnit = world.getCityAt(unit.x, unit.y);
        if (cityAtUnit) {
            const activatedFromGarrison = window.isUnitActivatedFromGarrison?.() ?? false;
            if (!isSelected || !activatedFromGarrison) {
                continue;  // Unit is garrisoned in city, don't draw on map
            }
        }

        // Use animated position if this unit is animating
        let sx, sy;
        if (animatingUnitId === unit.id) {
            sx = getScreenX(animVisualX);
            sy = animVisualY - viewY;
        } else {
            sx = getScreenX(unit.x);
            sy = unit.y - viewY;
        }

        // Check if visible (with some margin for animation)
        if (sx >= -1 && sx < VIEW_TILES_X + 1 && sy >= -1 && sy < VIEW_TILES_Y + 1) {
            drawUnit(unit, MAP_X + sx * TILE_SIZE, MAP_Y + sy * TILE_SIZE, isSelected);
        }
    }
}

// ============================================
// MAIN RENDER
// ============================================

export function render(selectedUnit = null, gameState = null) {
    if (!ctx) return;

    const state = uiState.getState();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    const panel = PANELS[state.type];
    if (panel) {
        ctx.save();
        ctx.translate(PANEL_X, PANEL_Y);
        panel();
        ctx.restore();
        return;
    }

    if (state.type === UIStateType.REPORT) {
        drawReport(state.data);
        return;
    }

    // Before there is a world: the title screen with the start-up questions
    if (state.type === UIStateType.CHOICE_DIALOG && state.data.setup) {
        drawTitleScreen();
        drawDialog(state.data.title, state.data.options.map(o => o.label), state.data.selectedIndex, SETUP_DIALOG_X);
        return;
    }

    drawMenuBar(state.type === UIStateType.MENU ? state.data.index : -1);
    drawSidebar(selectedUnit, gameState);
    drawMapArea(selectedUnit);

    if (state.type === UIStateType.MENU) {
        drawDropdown(state.data);
    } else if (state.type === UIStateType.INFO_DIALOG) {
        drawDialog(null, wrapText(state.data.message, DIALOG_CHARS), -1);
    } else if (state.type === UIStateType.CHOICE_DIALOG) {
        drawDialog(state.data.title, state.data.options.map(o => o.label), state.data.selectedIndex);
    }
}

const PANELS = {
    [UIStateType.CITY_SCREEN]: () => renderCityScreen(),
    [UIStateType.TECH_DISCOVERY]: () => renderTechDiscoveryScreen(),
    [UIStateType.RESEARCH_SELECTION]: () => renderResearchScreen(),
    [UIStateType.CHANGE_PRODUCTION]: () => renderChangeProductionScreen(),
    [UIStateType.BUY_CONFIRM]: () => {
        renderCityScreen();
        renderBuyConfirmScreen();
    },
};

// ============================================
// DIALOGS
// ============================================

const DIALOG_W = 240;
const DIALOG_X = MAP_X + (MAP_WIDTH_PX - DIALOG_W) / 2;
const SETUP_DIALOG_X = (VIEW_WIDTH - DIALOG_W) / 2;
const DIALOG_Y = MAP_Y + 40;
const DIALOG_LINE = 10;
const DIALOG_CHARS = Math.floor((DIALOG_W - 12) / 6);

function wrapText(text, maxChars) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
        if (line && (line + ' ' + word).length > maxChars) {
            lines.push(line);
            line = word;
        } else {
            line = line ? line + ' ' + word : word;
        }
    }
    if (line) lines.push(line);
    return lines;
}

function dialogFirstLineY(title) {
    return DIALOG_Y + 6 + (title ? DIALOG_LINE + 4 : 0);
}

function drawTitleScreen() {
    drawTexture(ctx, 'terrain/water', 0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.font = '16px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000';
    ctx.fillText('CIVILIZATION', VIEW_WIDTH / 2 + 1, 15);
    ctx.fillStyle = '#ff0';
    ctx.fillText('CIVILIZATION', VIEW_WIDTH / 2, 14);
}

function drawDialog(title, lines, selectedIndex, x = DIALOG_X) {
    const height = 12 + (title ? DIALOG_LINE + 4 : 0) + lines.length * DIALOG_LINE;
    drawGrayTexture(x, DIALOG_Y, DIALOG_W, height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, DIALOG_Y + 0.5, DIALOG_W - 1, height - 1);

    ctx.font = '6px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    if (title) {
        ctx.fillStyle = '#000';
        ctx.fillText(title, x + 6, DIALOG_Y + 6);
        ctx.fillStyle = '#0ff';
        ctx.fillRect(x + 6, DIALOG_Y + 6 + DIALOG_LINE, DIALOG_W - 12, 1);
    }
    const firstY = dialogFirstLineY(title);
    lines.forEach((line, i) => {
        const y = firstY + i * DIALOG_LINE;
        if (i === selectedIndex) {
            ctx.fillStyle = '#0aa';
            ctx.fillRect(x + 4, y - 2, DIALOG_W - 8, DIALOG_LINE);
        }
        ctx.fillStyle = '#000';
        ctx.fillText(line, x + 6, y);
    });
}

// ============================================
// REPORTS (advisors, world, Civilopedia)
// ============================================

const REPORT_MARGIN = 8;
const REPORT_TOP = 26;
const REPORT_LINE = 9;
const REPORT_ROWS = Math.floor((VIEW_HEIGHT - REPORT_TOP - REPORT_MARGIN) / REPORT_LINE);
const REPORT_CHARS = Math.floor((VIEW_WIDTH - 2 * REPORT_MARGIN) / 6);

function reportColumns(count) {
    return Math.ceil(count / REPORT_ROWS);
}

function drawReport(report) {
    if (report.worldMap) {
        drawWorldMap();
        return;
    }
    drawGrayTexture(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillText(report.title, REPORT_MARGIN, REPORT_MARGIN);
    ctx.fillStyle = '#0ff';
    ctx.fillRect(REPORT_MARGIN, REPORT_MARGIN + 11, VIEW_WIDTH - 2 * REPORT_MARGIN, 1);

    ctx.font = '6px "Press Start 2P", monospace';
    if (report.items) {
        const colW = (VIEW_WIDTH - 2 * REPORT_MARGIN) / reportColumns(report.items.length);
        report.items.forEach((item, i) => {
            const x = REPORT_MARGIN + Math.floor(i / REPORT_ROWS) * colW;
            const y = REPORT_TOP + (i % REPORT_ROWS) * REPORT_LINE;
            if (i === report.selectedIndex) {
                ctx.fillStyle = '#0aa';
                ctx.fillRect(x - 2, y - 2, colW - 4, REPORT_LINE);
            }
            ctx.fillStyle = '#000';
            ctx.fillText(item.label, x, y);
        });
        return;
    }
    const lines = report.lines.flatMap(line => line.length > REPORT_CHARS ? wrapText(line, REPORT_CHARS) : [line]);
    ctx.fillStyle = '#000';
    lines.slice(0, REPORT_ROWS).forEach((line, i) => {
        ctx.fillText(line, REPORT_MARGIN, REPORT_TOP + i * REPORT_LINE);
    });
}

// The whole world at 6 screen units per tile, which exactly fills the screen
function drawWorldMap() {
    const size = Math.min(VIEW_WIDTH / MAP_WIDTH, VIEW_HEIGHT / MAP_HEIGHT);
    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (!world.isExplored(x, y)) continue;
            ctx.fillStyle = getMinimapColor(world.getTerrainAt(x, y));
            ctx.fillRect(x * size, y * size, size, size);
        }
    }
    for (const city of world.getAllCities().filter(c => world.isExplored(c.x, c.y))) {
        ctx.fillStyle = world.getPlayer(city.player).color;
        ctx.fillRect(city.x * size, city.y * size, size, size);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(city.x * size + 0.5, city.y * size + 0.5, size - 1, size - 1);
    }
    for (const unit of world.getAllUnits().filter(u => u.player === world.humanPlayer.id || world.humanSees(u.x, u.y))) {
        ctx.fillStyle = world.getPlayer(unit.player).color;
        ctx.fillRect(unit.x * size + size / 3, unit.y * size + size / 3, size / 3, size / 3);
    }
}

// Index of the clicked entry of a report list, or -1
export function reportItemAt(screenX, screenY) {
    const state = uiState.getState();
    const items = state.data.items;
    if (!items) return -1;
    const { x, y } = toScreenUnits(screenX, screenY);
    const colW = (VIEW_WIDTH - 2 * REPORT_MARGIN) / reportColumns(items.length);
    const col = Math.floor((x - REPORT_MARGIN + 2) / colW);
    const row = Math.floor((y - REPORT_TOP + 2) / REPORT_LINE);
    const index = col * REPORT_ROWS + row;
    return row >= 0 && row < REPORT_ROWS && col >= 0 && index < items.length ? index : -1;
}

// Index of the clicked option in the choice dialog, or -1 for a click outside it
export function choiceDialogOptionAt(screenX, screenY) {
    const state = uiState.getState();
    const { x, y } = toScreenUnits(screenX, screenY);
    const index = Math.floor((y - dialogFirstLineY(state.data.title) + 2) / DIALOG_LINE);
    const left = state.data.setup ? SETUP_DIALOG_X : DIALOG_X;
    const inside = x >= left && x <= left + DIALOG_W;
    return inside && index >= 0 && index < state.data.options.length ? index : -1;
}

// ============================================
// COORDINATE CONVERSION
// ============================================

// Position of a mouse event in screen units
export function toScreenUnits(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (clientX - rect.left) * VIEW_WIDTH / rect.width,
        y: (clientY - rect.top) * VIEW_HEIGHT / rect.height,
    };
}

// Position of a mouse event within the centred full-screen panel
export function toPanelUnits(clientX, clientY) {
    const { x, y } = toScreenUnits(clientX, clientY);
    return { x: x - PANEL_X, y: y - PANEL_Y };
}

export function screenToMap(screenX, screenY) {
    const { x: canvasX, y: canvasY } = toScreenUnits(screenX, screenY);

    if (canvasY < MENU_HEIGHT) {
        return { mapX: -1, mapY: -1, inMap: false, inMinimap: false, inMenu: true };
    }

    // Check if click is in minimap (now at top of sidebar)
    const minimapY = MENU_HEIGHT;
    const inMinimap = canvasX < SIDEBAR_WIDTH && canvasY >= minimapY && canvasY < minimapY + MINIMAP_HEIGHT;

    // Check if click is in map area
    if (canvasX < MAP_X || canvasY < MAP_Y) {
        return { mapX: -1, mapY: -1, inMap: false, inMinimap };
    }

    const tileX = Math.floor((canvasX - MAP_X) / TILE_SIZE);
    const tileY = Math.floor((canvasY - MAP_Y) / TILE_SIZE);

    return {
        mapX: viewX + tileX,
        mapY: viewY + tileY,
        inMap: tileX >= 0 && tileX < VIEW_TILES_X && tileY >= 0 && tileY < VIEW_TILES_Y,
        inMinimap: false
    };
}

export function minimapToMap(screenX, screenY) {
    const { x, y } = toScreenUnits(screenX, screenY);
    return { mapX: Math.floor(x), mapY: Math.floor(y - MENU_HEIGHT) };
}

// ============================================
// CITY SCREEN (delegated to city_view.js)
// ============================================

export function openCityScreen(data) {
    setCityScreenData(data);
    render();
}

export function getCtx() {
    return ctx;
}

// ============================================
// TECH DISCOVERY SCREEN
// ============================================

export function isTechDiscoveryOpen() {
    return uiState.getState().type === UIStateType.TECH_DISCOVERY;
}

function renderTechDiscoveryScreen() {
    const state = uiState.getState();
    if (state.type !== UIStateType.TECH_DISCOVERY || !ctx) return;

    const tech = state.data.tech;

    // Fill background with light gray
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

    // Draw decorative border (green/yellow checkered pattern)
    drawCheckerBorder();

    // Inner content area
    const margin = 8;
    const contentX = margin;
    const contentY = margin;
    const contentW = PANEL_WIDTH - margin * 2;
    const contentH = PANEL_HEIGHT - margin * 2;

    // Tech name - large, right side
    ctx.fillStyle = '#000';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(tech.name.toUpperCase(), PANEL_WIDTH - margin - 4, contentY + 8);

    // "Civilization Advance (Discovered)"
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillStyle = '#444';
    ctx.fillText('Civilization Advance', PANEL_WIDTH - margin - 4, contentY + 24);
    ctx.fillText('(Discovered)', PANEL_WIDTH - margin - 4, contentY + 34);

    ctx.textAlign = 'left';

    // Requires section
    let infoY = contentY + 55;
    ctx.fillStyle = '#000';
    ctx.font = '6px "Press Start 2P", monospace';

    if (tech.requires && tech.requires.length > 0) {
        const reqNames = tech.requires.map(r => TECHNOLOGIES[r]?.name || r).join(', ');
        ctx.fillText(`Requires ${reqNames}`, contentX + 4, infoY);
        infoY += 14;
    }

    // Allows section
    ctx.fillText('Allows:', contentX + 4, infoY);
    infoY += 12;

    // Enabled techs
    ctx.fillStyle = '#00a';
    if (tech.enables && tech.enables.length > 0) {
        for (const enabledId of tech.enables) {
            const enabledTech = TECHNOLOGIES[enabledId];
            if (!enabledTech) continue;

            let text = '  ' + enabledTech.name;
            // Show other requirements
            const otherReqs = enabledTech.requires.filter(r => r !== tech.id);
            if (otherReqs.length > 0) {
                const otherNames = otherReqs.map(r => TECHNOLOGIES[r]?.name || r).join(', ');
                text += ` (with ${otherNames})`;
            }
            ctx.fillText(text, contentX + 4, infoY);
            infoY += 10;
        }
    }

    ctx.fillStyle = '#080';
    for (const [unitId, unitType] of Object.entries(UNIT_TYPES).filter(([, u]) => u.requires === tech.id)) {
        drawSpriteInColor(ctx, `unit/${unitId}`, contentX + 8, infoY - 4, world.humanPlayer.color);
        ctx.fillText(unitType.name + ' unit', contentX + 28, infoY + 4);
        infoY += 18;
    }

    ctx.fillStyle = '#088';
    for (const [impId, imp] of Object.entries(IMPROVEMENTS).filter(([, i]) => i.requires === tech.id)) {
        drawBuildingSprite(contentX + 8, infoY, impId);
        ctx.fillText(imp.name + (imp.wonder ? ' wonder' : ' improvement'), contentX + 28, infoY + 4);
        infoY += 14;
    }

    ctx.fillStyle = '#800';
    for (const gov of Object.values(GOVERNMENTS).filter(g => g.requires === tech.id)) {
        ctx.fillText(gov.name + ' government', contentX + 28, infoY + 4);
        infoY += 14;
    }

    // Click to continue
    ctx.fillStyle = '#666';
    ctx.textAlign = 'center';
    ctx.fillText('Click to continue', PANEL_WIDTH / 2, PANEL_HEIGHT - margin - 6);
    ctx.textAlign = 'left';
}

function drawCheckerBorder() {
    const borderSize = 6;
    const checkerSize = 3;

    // Draw border pattern
    for (let y = 0; y < PANEL_HEIGHT; y += checkerSize) {
        for (let x = 0; x < PANEL_WIDTH; x += checkerSize) {
            // Only draw on the border edges
            const onLeft = x < borderSize;
            const onRight = x >= PANEL_WIDTH - borderSize;
            const onTop = y < borderSize;
            const onBottom = y >= PANEL_HEIGHT - borderSize;

            if (onLeft || onRight || onTop || onBottom) {
                const isEven = ((x / checkerSize) + (y / checkerSize)) % 2 === 0;
                ctx.fillStyle = isEven ? '#080' : '#cc0';
                ctx.fillRect(x, y, checkerSize, checkerSize);
            }
        }
    }
}

// ============================================
// RESEARCH SELECTION SCREEN
// ============================================

let researchSelectedIndex = 0;  // Local UI state for keyboard navigation

export function isResearchScreenOpen() {
    return uiState.getState().type === UIStateType.RESEARCH_SELECTION;
}

export function handleResearchScreenClick(screenX, screenY) {
    const state = uiState.getState();
    if (state.type !== UIStateType.RESEARCH_SELECTION) return false;

    const { x, y } = toPanelUnits(screenX, screenY);

    // Check if click is on a tech option
    const listStartY = 70;
    const itemHeight = 12;
    const listX = 80;
    const listW = 200;

    const options = state.data.options;
    for (let i = 0; i < options.length; i++) {
        const itemY = listStartY + i * itemHeight;
        if (x >= listX && x <= listX + listW && y >= itemY && y <= itemY + itemHeight) {
            uiState.selectResearch(options[i]);
            researchSelectedIndex = 0;  // Reset for next time
            return true;
        }
    }

    return true;  // Consume click even if not on an item
}

export function handleResearchScreenKey(key) {
    const state = uiState.getState();
    if (state.type !== UIStateType.RESEARCH_SELECTION) return false;

    const options = state.data.options;

    if (key === 'ArrowUp') {
        researchSelectedIndex = Math.max(0, researchSelectedIndex - 1);
        render();
        return true;
    }
    if (key === 'ArrowDown') {
        researchSelectedIndex = Math.min(options.length - 1, researchSelectedIndex + 1);
        render();
        return true;
    }
    if (key === 'Enter' || key === ' ') {
        uiState.selectResearch(options[researchSelectedIndex]);
        researchSelectedIndex = 0;  // Reset for next time
        return true;
    }

    return true;  // Consume all keys while open
}

function renderResearchScreen() {
    const state = uiState.getState();
    if (state.type !== UIStateType.RESEARCH_SELECTION || !ctx) return;

    const options = state.data.options;

    // Fill with gray texture
    drawGrayTexture(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

    // Title area
    ctx.fillStyle = '#000';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const titleX = 85;
    ctx.fillText('Science Advisor:', titleX, 12);

    // Cyan underline
    ctx.fillStyle = '#0ff';
    ctx.fillRect(titleX, 24, 140, 2);

    // Prompt text
    ctx.fillStyle = '#000';
    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillText('Which discovery should our', titleX, 32);
    ctx.fillText('wise men be pursuing, sire?', titleX, 42);
    ctx.fillText('Pick one...', titleX, 52);

    // List of techs
    const listStartY = 70;
    const itemHeight = 12;
    const listX = 85;

    for (let i = 0; i < options.length; i++) {
        const tech = options[i];
        const itemY = listStartY + i * itemHeight;

        // Highlight selected
        if (i === researchSelectedIndex) {
            ctx.fillStyle = '#0aa';
            ctx.fillRect(listX - 2, itemY - 1, 160, itemHeight);
            ctx.fillStyle = '#000';
        } else {
            ctx.fillStyle = '#000';
        }

        ctx.fillText(tech.name, listX, itemY);
    }

    // Help text at bottom
    ctx.fillStyle = '#0a0';
    ctx.textAlign = 'right';
    ctx.fillText('Click or Enter to select', PANEL_WIDTH - 10, PANEL_HEIGHT - 10);
    ctx.textAlign = 'left';
}

// ============================================
// CHANGE PRODUCTION SCREEN
// ============================================

let changeProductionSelectedIndex = 0;  // Local UI state for keyboard navigation

const PRODUCTION_LIST_X = 12;
const PRODUCTION_LIST_Y = 30;
const PRODUCTION_ITEM_H = 8;
const PRODUCTION_COL_W = 150;
const PRODUCTION_ROWS = 18;
const PRODUCTION_PAGE = PRODUCTION_ROWS * 2;

export function isChangeProductionScreenOpen() {
    return uiState.getState().type === UIStateType.CHANGE_PRODUCTION;
}

export function handleChangeProductionClick(screenX, screenY) {
    const state = uiState.getState();
    if (state.type !== UIStateType.CHANGE_PRODUCTION) return false;

    const { x, y } = toPanelUnits(screenX, screenY);

    // Check cancel button
    if (x >= 240 && x <= 300 && y >= 180 && y <= 195) {
        uiState.cancelChangeProduction();
        changeProductionSelectedIndex = 0;
        return true;
    }

    const options = state.data.options;
    const page = Math.floor(changeProductionSelectedIndex / PRODUCTION_PAGE);
    const col = Math.floor((x - PRODUCTION_LIST_X) / PRODUCTION_COL_W);
    const row = Math.floor((y - PRODUCTION_LIST_Y) / PRODUCTION_ITEM_H);
    const index = page * PRODUCTION_PAGE + col * PRODUCTION_ROWS + row;
    if (col >= 0 && col < 2 && row >= 0 && row < PRODUCTION_ROWS && index < options.length) {
        uiState.selectProduction(options[index].id);
        changeProductionSelectedIndex = 0;
    }
    return true;
}

export function handleChangeProductionKey(key) {
    const state = uiState.getState();
    if (state.type !== UIStateType.CHANGE_PRODUCTION) return false;

    const options = state.data.options;

    if (key === 'ArrowUp') {
        changeProductionSelectedIndex = Math.max(0, changeProductionSelectedIndex - 1);
        render();
        return true;
    }
    if (key === 'ArrowDown') {
        changeProductionSelectedIndex = Math.min(options.length - 1, changeProductionSelectedIndex + 1);
        render();
        return true;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const step = key === 'ArrowLeft' ? -PRODUCTION_ROWS : PRODUCTION_ROWS;
        changeProductionSelectedIndex = Math.max(0, Math.min(options.length - 1, changeProductionSelectedIndex + step));
        render();
        return true;
    }
    if (key === 'Enter' || key === ' ') {
        uiState.selectProduction(options[changeProductionSelectedIndex].id);
        changeProductionSelectedIndex = 0;
        return true;
    }
    if (key === 'Escape') {
        uiState.cancelChangeProduction();
        changeProductionSelectedIndex = 0;
        return true;
    }

    return true;
}

function renderChangeProductionScreen() {
    const state = uiState.getState();
    if (state.type !== UIStateType.CHANGE_PRODUCTION || !ctx) return;

    const options = state.data.options;

    // Fill with gray texture
    drawGrayTexture(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

    // Title
    ctx.fillStyle = '#000';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('What shall we build?', PANEL_WIDTH / 2, 10);

    // Cyan underline
    ctx.fillStyle = '#0ff';
    ctx.fillRect(60, 22, 200, 2);

    ctx.font = '5px "Press Start 2P", monospace';
    ctx.textAlign = 'left';
    const page = Math.floor(changeProductionSelectedIndex / PRODUCTION_PAGE);
    const pageOptions = options.slice(page * PRODUCTION_PAGE, (page + 1) * PRODUCTION_PAGE);

    pageOptions.forEach((opt, i) => {
        const x = PRODUCTION_LIST_X + Math.floor(i / PRODUCTION_ROWS) * PRODUCTION_COL_W;
        const y = PRODUCTION_LIST_Y + (i % PRODUCTION_ROWS) * PRODUCTION_ITEM_H;
        if (page * PRODUCTION_PAGE + i === changeProductionSelectedIndex) {
            ctx.fillStyle = '#0aa';
            ctx.fillRect(x - 2, y - 1, PRODUCTION_COL_W - 4, PRODUCTION_ITEM_H);
        }
        ctx.fillStyle = opt.isUnit ? '#000' : opt.isWonder ? '#800' : '#008';
        ctx.fillText(`${opt.name} (${opt.cost})`, x, y + 1);
    });

    if (options.length > PRODUCTION_PAGE) {
        ctx.fillStyle = '#000';
        ctx.fillText(`Page ${page + 1}/${Math.ceil(options.length / PRODUCTION_PAGE)} - arrows for more`, PRODUCTION_LIST_X, 184);
    }

    // Cancel button
    ctx.fillStyle = '#a00';
    ctx.fillRect(240, 180, 60, 15);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('CANCEL', 270, 183);
    ctx.textAlign = 'left';
}

// ============================================
// BUY PRODUCTION CONFIRMATION
// ============================================

export function isBuyConfirmScreenOpen() {
    return uiState.getState().type === UIStateType.BUY_CONFIRM;
}

export function handleBuyConfirmClick(screenX, screenY) {
    const state = uiState.getState();
    if (state.type !== UIStateType.BUY_CONFIRM) return false;

    const { x, y } = toPanelUnits(screenX, screenY);

    const playerGold = world.humanPlayer?.gold || 0;
    const canAfford = playerGold >= state.data.cost;

    if (canAfford) {
        // Yes button
        if (x >= 80 && x <= 140 && y >= 130 && y <= 150) {
            uiState.confirmBuy();
            return true;
        }

        // No button
        if (x >= 180 && x <= 240 && y >= 130 && y <= 150) {
            uiState.cancelBuy();
            return true;
        }
    } else {
        // OK button (can't afford)
        if (x >= 130 && x <= 190 && y >= 130 && y <= 150) {
            uiState.cancelBuy();
            return true;
        }
    }

    return true;
}

export function handleBuyConfirmKey(key) {
    const state = uiState.getState();
    if (state.type !== UIStateType.BUY_CONFIRM) return false;

    const playerGold = world.humanPlayer?.gold || 0;
    const canAfford = playerGold >= state.data.cost;

    if (canAfford && (key === 'y' || key === 'Y' || key === 'Enter')) {
        uiState.confirmBuy();
        return true;
    }
    if (key === 'n' || key === 'N' || key === 'Escape') {
        uiState.cancelBuy();
        return true;
    }

    return true;
}

function renderBuyConfirmScreen() {
    const state = uiState.getState();
    if (state.type !== UIStateType.BUY_CONFIRM || !ctx) return;

    const { item, cost } = state.data;
    const playerGold = world.humanPlayer?.gold || 0;
    const canAfford = playerGold >= cost;

    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

    // Dialog box
    const boxX = 40;
    const boxY = 60;
    const boxW = 240;
    const boxH = 100;

    ctx.fillStyle = '#888';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.font = '7px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    if (canAfford) {
        // Can afford - show confirmation
        ctx.fillStyle = '#000';
        ctx.fillText('Buy Production?', PANEL_WIDTH / 2, boxY + 10);

        ctx.font = '6px "Press Start 2P", monospace';
        ctx.fillText(`Buy ${item}`, PANEL_WIDTH / 2, boxY + 30);
        ctx.fillText(`for ${cost} gold?`, PANEL_WIDTH / 2, boxY + 42);
        ctx.fillStyle = '#060';
        ctx.fillText(`(You have ${playerGold} gold)`, PANEL_WIDTH / 2, boxY + 56);

        // Yes button
        ctx.fillStyle = '#0a0';
        ctx.fillRect(80, 130, 60, 20);
        ctx.fillStyle = '#fff';
        ctx.fillText('YES', 110, 136);

        // No button
        ctx.fillStyle = '#a00';
        ctx.fillRect(180, 130, 60, 20);
        ctx.fillStyle = '#fff';
        ctx.fillText('NO', 210, 136);
    } else {
        // Can't afford - show error
        ctx.fillStyle = '#800';
        ctx.fillText('Not Enough Gold!', PANEL_WIDTH / 2, boxY + 10);

        ctx.font = '6px "Press Start 2P", monospace';
        ctx.fillStyle = '#000';
        ctx.fillText(`${item} costs`, PANEL_WIDTH / 2, boxY + 30);
        ctx.fillText(`${cost} gold`, PANEL_WIDTH / 2, boxY + 42);
        ctx.fillStyle = '#800';
        ctx.fillText(`(You only have ${playerGold})`, PANEL_WIDTH / 2, boxY + 56);

        // OK button only
        ctx.fillStyle = '#666';
        ctx.fillRect(130, 130, 60, 20);
        ctx.fillStyle = '#fff';
        ctx.fillText('OK', 160, 136);
    }

    ctx.textAlign = 'left';
}

export function getMainCanvas() { return canvas; }

