// Sprite atlas: one PNG with every sprite plus atlas.json with where each one is.
// Built from art/sprites/ by art/pack_atlas.py.
//
// Positions and sizes passed to the draw functions are in screen units, where a map tile is
// TILE_SIZE units. The atlas is drawn at tileSize pixels per tile, so a sprite of w pixels
// takes w / scale units.

import { TILE_SIZE } from './view.js';

let image = null;
let meta = null;
let scale = 1;
const recolored = new Map();

export async function loadAtlas(imageUrl, metaUrl) {
    const [img, json] = await Promise.all([
        new Promise((resolve, reject) => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = imageUrl;
        }),
        fetch(metaUrl).then(r => r.json()),
    ]);
    image = img;
    meta = json;
    scale = meta.tileSize / TILE_SIZE;
}

export function isAtlasLoaded() {
    return image !== null;
}

export function hasSprite(name) {
    return !!meta?.sprites[name];
}

// Size of a sprite in screen units
export function spriteSize(name) {
    const s = meta.sprites[name];
    return { w: s.w / scale, h: s.h / scale };
}

export function drawSprite(ctx, name, x, y) {
    const s = meta?.sprites[name];
    if (!s) return;
    ctx.drawImage(image, s.x, s.y, s.w, s.h, x, y, s.w / scale, s.h / scale);
}

// Draw the part of a sprite starting px, py units into it, w by h units in size
export function drawSpritePart(ctx, name, px, py, w, h, x, y) {
    const s = meta?.sprites[name];
    if (!s) return;
    ctx.drawImage(image, s.x + px * scale, s.y + py * scale, w * scale, h * scale, x, y, w, h);
}

// Draw a sprite with its player-colour pixels painted in the given colour
export function drawSpriteInColor(ctx, name, x, y, colorHex) {
    const s = meta?.sprites[name];
    if (!s) return;
    if (!s.recolor) {
        drawSprite(ctx, name, x, y);
        return;
    }
    const key = `${name}|${colorHex}`;
    if (!recolored.has(key)) {
        recolored.set(key, recolor(s, colorHex));
    }
    ctx.drawImage(recolored.get(key), x, y, s.w / scale, s.h / scale);
}

// Repeat a sprite to fill a rectangle, cutting off the last row and column
export function drawTexture(ctx, name, x, y, width, height) {
    const s = meta?.sprites[name];
    if (!s) return;
    const tw = s.w / scale;
    const th = s.h / scale;
    for (let ty = y; ty < y + height; ty += th) {
        for (let tx = x; tx < x + width; tx += tw) {
            const w = Math.min(tw, x + width - tx);
            const h = Math.min(th, y + height - ty);
            ctx.drawImage(image, s.x, s.y, w * scale, h * scale, tx, ty, w, h);
        }
    }
}

const COLOR_TOLERANCE = 30;

function spriteCanvas(s) {
    const canvas = document.createElement('canvas');
    canvas.width = s.w;
    canvas.height = s.h;
    canvas.getContext('2d', { willReadFrequently: true }).drawImage(image, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
    return canvas;
}

// The sprite's pixels at atlas resolution
export function spritePixels(name) {
    const s = meta.sprites[name];
    return spriteCanvas(s).getContext('2d').getImageData(0, 0, s.w, s.h);
}

function recolor(s, colorHex) {
    const canvas = spriteCanvas(s);
    const c = canvas.getContext('2d');

    const [mr, mg, mb] = meta.playerColor;
    const r = parseInt(colorHex.slice(1, 3), 16);
    const g = parseInt(colorHex.slice(3, 5), 16);
    const b = parseInt(colorHex.slice(5, 7), 16);
    const pixels = c.getImageData(0, 0, s.w, s.h);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
        if (Math.abs(d[i] - mr) < COLOR_TOLERANCE && Math.abs(d[i + 1] - mg) < COLOR_TOLERANCE &&
            Math.abs(d[i + 2] - mb) < COLOR_TOLERANCE) {
            d[i] = r;
            d[i + 1] = g;
            d[i + 2] = b;
        }
    }
    c.putImageData(pixels, 0, 0);
    return canvas;
}
