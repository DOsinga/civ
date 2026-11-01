// Full-screen reports opened from the Advisors, World and Civilopedia menus

import { world } from './world.js';
import { calculateCity, getProductionData } from './citymanagement.js';
import { TECHNOLOGIES, getTechCost } from './tech.js';
import { IMPROVEMENTS } from './improvements.js';
import { UNIT_TYPES } from './units.js';
import { GOVERNMENTS } from './government.js';
import { TERRAIN_DATA, getTerrainName, canIrrigate, canMine, getIrrigationTransform, getMineTransform } from './terrain.js';
import { uiState } from './uistate.js';

const pad = (value, width) => String(value).padEnd(width);
const padLeft = (value, width) => String(value).padStart(width);
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const nameOf = (id) => TECHNOLOGIES[id]?.name || 'None';
const listOf = (names) => names.length ? names.join(', ') : 'None';

function columns(names, width = 25, perLine = 3) {
    const lines = [];
    for (let i = 0; i < names.length; i += perLine) {
        lines.push(names.slice(i, i + perLine).map(n => pad(n, width)).join('').trimEnd());
    }
    return lines;
}

function maintenance(player) {
    return player.cities.reduce((sum, city) =>
        sum + city.improvements.reduce((s, id) => s + (IMPROVEMENTS[id].maintenance || 0), 0), 0);
}

function noCities(title) {
    return { title, lines: ['We have no cities yet.'] };
}

// ADVISORS

export function cityStatusReport() {
    const player = world.humanPlayer;
    const title = `City Status: ${player.adjective} Empire`;
    if (!player.cities.length) return noCities(title);
    const lines = [`${pad('City', 14)}Size Food Shld Trade  Producing`];
    for (const city of player.cities) {
        const c = calculateCity(city);
        const prod = getProductionData(city.production.type);
        lines.push(`${pad(city.name, 14)}${padLeft(city.size, 4)} ${padLeft(signed(c.foodNet), 4)} ` +
            `${padLeft(c.production, 4)} ${padLeft(c.trade, 5)}  ${prod.name} (${city.production.progress}/${prod.cost})`);
    }
    return { title, lines };
}

export function militaryReport() {
    const player = world.humanPlayer;
    const lines = [`${pad('Unit', 14)} A/D/M    Active  In Production`];
    for (const [id, type] of Object.entries(UNIT_TYPES)) {
        const active = player.units.filter(u => u.typeId === id).length;
        const building = player.cities.filter(c => c.production.type === id).length;
        if (!active && !building) continue;
        const stats = `${type.attack}/${type.defense}/${type.movement}`;
        lines.push(`${pad(type.name, 14)} ${pad(stats, 8)} ${padLeft(active, 6)}  ${padLeft(building, 13)}`);
    }
    if (lines.length === 1) lines.push('We have no units, sire.');
    return { title: 'Military Advisor', lines };
}

export function intelligenceReport() {
    const lines = [];
    for (const p of world.players.filter(p => p.alive && !p.isHuman)) {
        lines.push(`${p.leader} of the ${p.name}`);
        lines.push(`  ${p.gov.name}, ${p.cities.length} cities, ${p.units.length} units, ${p.gold}$`);
        lines.push(`  ${p.discoveredTechs.length} advances, researching ${nameOf(p.currentResearch)}`);
        lines.push('');
    }
    if (!lines.length) lines.push('There are no other civilizations left.');
    return { title: 'Intelligence Advisor', lines };
}

export function attitudeReport() {
    const player = world.humanPlayer;
    const title = 'Attitude Advisor';
    if (!player.cities.length) return noCities(title);
    const lines = [`${pad('City', 14)}Size Happy Content Unhappy`];
    for (const city of player.cities) {
        const c = calculateCity(city);
        const mood = c.disorder ? '  CIVIL DISORDER' : c.celebrating ? '  Celebrating' : '';
        lines.push(`${pad(city.name, 14)}${padLeft(city.size, 4)} ${padLeft(c.happy, 5)} ${padLeft(c.content, 7)} ` +
            `${padLeft(c.unhappy, 7)}${mood}`);
    }
    return { title, lines };
}

export function tradeReport() {
    const player = world.humanPlayer;
    const title = 'Trade Advisor';
    if (!player.cities.length) return noCities(title);
    const rates = player.effectiveRates;
    const lines = [`Tax ${rates.tax * 10}%  Lux ${rates.lux * 10}%  Sci ${rates.sci * 10}%`, '',
        `${pad('City', 14)}Trade Corrupt   Tax   Lux   Sci`];
    let income = 0, science = 0;
    for (const city of player.cities) {
        const c = calculateCity(city);
        if (!c.disorder) {
            income += c.tax;
            science += c.sci;
        }
        lines.push(`${pad(city.name, 14)}${padLeft(c.trade, 5)} ${padLeft(c.corruption, 7)} ` +
            `${padLeft(c.tax, 5)} ${padLeft(c.lux, 5)} ${padLeft(c.sci, 5)}`);
    }
    const upkeep = maintenance(player);
    lines.push('', `Income: ${income}$   Maintenance: ${upkeep}$   Net: ${signed(income - upkeep)}$ per turn`,
        `Treasury: ${player.gold}$   Science: ${science} bulbs per turn`);
    return { title, lines };
}

export function scienceReport() {
    const player = world.humanPlayer;
    const known = player.discoveredTechs.map(nameOf).sort();
    return {
        title: 'Science Advisor',
        lines: [
            `Researching: ${nameOf(player.currentResearch)}`,
            `Progress: ${player.science}/${getTechCost(player)} bulbs`,
            '',
            `Advances known (${known.length}):`,
            ...columns(known),
        ],
    };
}

// WORLD

function cityOwner(city) {
    return world.getPlayer(city.player).adjective;
}

export function wondersReport() {
    const lines = [];
    for (const city of world.getAllCities()) {
        for (const id of city.improvements.filter(id => IMPROVEMENTS[id].wonder)) {
            lines.push(`${pad(IMPROVEMENTS[id].name, 26)}${city.name} (${cityOwner(city)})`);
        }
    }
    if (!lines.length) lines.push('No Wonders of the World have been built yet.');
    return { title: 'Wonders of the World', lines };
}

export function topCitiesReport() {
    const wonders = (city) => city.improvements.filter(id => IMPROVEMENTS[id].wonder).length;
    const cities = [...world.getAllCities()]
        .sort((a, b) => b.size - a.size || wonders(b) - wonders(a))
        .slice(0, 5);
    const lines = cities.map((city, i) => {
        const extra = wonders(city) ? `, ${wonders(city)} wonders` : '';
        return `${i + 1}. ${city.name} (${cityOwner(city)}), size ${city.size}${extra}`;
    });
    if (!lines.length) lines.push('No cities have been founded yet.');
    return { title: 'Top 5 Cities in the World', lines };
}

export function civScore(player) {
    let happy = 0, content = 0, wonders = 0;
    for (const city of player.cities) {
        const c = calculateCity(city);
        happy += c.happy;
        content += c.content;
        wonders += city.improvements.filter(id => IMPROVEMENTS[id].wonder).length;
    }
    return { happy, content, wonders, total: happy * 2 + content + wonders * 20 };
}

export function scoreReport() {
    const s = civScore(world.humanPlayer);
    const lines = [
        `Happy citizens:   ${padLeft(s.happy, 3)} x2  = ${padLeft(s.happy * 2, 4)}`,
        `Content citizens: ${padLeft(s.content, 3)} x1  = ${padLeft(s.content, 4)}`,
        `Wonders:          ${padLeft(s.wonders, 3)} x20 = ${padLeft(s.wonders * 20, 4)}`,
        '',
        `Total:                    ${padLeft(s.total, 4)}`,
        '',
        'Rivals:',
    ];
    for (const p of world.players.filter(p => p.alive && !p.isHuman)) {
        lines.push(`  ${pad(p.name, 20)}${padLeft(civScore(p).total, 4)}`);
    }
    return { title: `${world.humanPlayer.adjective} Civilization Score`, lines };
}

export function worldMapReport() {
    return { title: 'World Map', worldMap: true, lines: [] };
}

// CIVILOPEDIA

function pediaList(title, entries, detail) {
    const items = entries.map(([id, name]) => ({ label: name, value: id }))
        .sort((a, b) => a.label.localeCompare(b.label));
    const list = {
        title,
        items,
        onSelect: (id) => {
            const selectedIndex = items.findIndex(item => item.value === id);
            uiState.showReport({ ...detail(id), onClose: () => uiState.showReport({ ...list, selectedIndex }) });
        },
    };
    return list;
}

function advanceDetail(id) {
    const tech = TECHNOLOGIES[id];
    const allows = [
        ...Object.values(UNIT_TYPES).filter(u => u.requires === id).map(u => u.name),
        ...Object.values(IMPROVEMENTS).filter(i => i.requires === id).map(i => i.name),
        ...Object.values(GOVERNMENTS).filter(g => g.requires === id).map(g => g.name),
    ];
    return {
        title: tech.name,
        lines: [
            'Civilization Advance',
            '',
            `Requires: ${listOf(tech.requires.map(nameOf))}`,
            `Leads to: ${listOf(tech.enables.map(nameOf))}`,
            `Allows: ${listOf(allows)}`,
        ],
    };
}

function improvementDetail(id) {
    const imp = IMPROVEMENTS[id];
    const lines = [imp.wonder ? 'Wonder of the World' : 'City Improvement', '',
        `Cost: ${imp.cost} shields`, `Requires: ${nameOf(imp.requires)}`];
    if (imp.prereq) lines.push(`Needs: ${IMPROVEMENTS[imp.prereq].name}`);
    if (!imp.wonder) lines.push(`Maintenance: ${imp.maintenance}$ per turn`);
    if (imp.obsoleteBy) lines.push(`Obsolete with: ${nameOf(imp.obsoleteBy)}`);
    return { title: imp.name, lines };
}

function unitDetail(id) {
    const unit = UNIT_TYPES[id];
    const lines = [`${unit.domain[0].toUpperCase()}${unit.domain.slice(1)} Unit`, '',
        `Attack: ${unit.attack}  Defense: ${unit.defense}  Moves: ${unit.movement}`,
        `Cost: ${unit.cost} shields`, `Requires: ${nameOf(unit.requires)}`];
    if (unit.obsoleteBy) lines.push(`Obsolete with: ${UNIT_TYPES[unit.obsoleteBy].name}`);
    if (unit.capacity) lines.push(`Carries ${unit.capacity} land units`);
    if (unit.carriesAir) lines.push(`Carries ${unit.carriesAir} air units`);
    if (unit.fuel) lines.push(`Must return to a city or carrier every ${unit.fuel} turns`);
    return { title: unit.name, lines };
}

function terrainDetail(id) {
    const type = Number(id);
    const t = TERRAIN_DATA[type];
    const [food, shields, trade] = t.yields;
    const lines = ['Terrain Type', '',
        `Food: ${food}  Shields: ${shields}  Trade: ${trade}`,
        `Movement cost: ${t.move}`,
        `Defense bonus: +${t.defense * 100}%`];
    if (canIrrigate(type)) {
        const to = getIrrigationTransform(type);
        lines.push(`Irrigation: ${to === null ? `+${t.irrigate} food` : `becomes ${getTerrainName(to)}`} (${t.irrigateTime} turns)`);
    }
    if (canMine(type)) {
        const to = getMineTransform(type);
        lines.push(`Mining: ${to === null ? `+${t.mine} shields` : `becomes ${getTerrainName(to)}`} (${t.mineTime} turns)`);
    }
    if (t.road) lines.push(`Road: ${t.road} turns${t.roadTrade ? ', +1 trade' : ''}`);
    return { title: t.name, lines };
}

export function advancesPedia() {
    return pediaList('Civilization Advances', Object.entries(TECHNOLOGIES).map(([id, t]) => [id, t.name]), advanceDetail);
}

export function improvementsPedia() {
    return pediaList('City Improvements', Object.entries(IMPROVEMENTS).map(([id, i]) => [id, i.name]), improvementDetail);
}

export function unitsPedia() {
    return pediaList('Military Units', Object.entries(UNIT_TYPES).map(([id, u]) => [id, u.name]), unitDetail);
}

export function terrainPedia() {
    return pediaList('Terrain Types', Object.entries(TERRAIN_DATA).map(([id, t]) => [id, t.name]), terrainDetail);
}
