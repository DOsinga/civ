// City Management - city economy, production and turn processing

import { TERRAIN, IMPROVEMENT, getImprovementBonus, canIrrigate } from './terrain.js';
import { UNIT_TYPES, GameEventType } from './units.js';
import { IMPROVEMENTS } from './improvements.js';
import { world, MAP_WIDTH } from './world.js';
import {
    render,
    openCityScreen as viewOpenCityScreen,
    closeCityScreen as viewCloseCityScreen,
} from './view.js';
import { uiState, UIStateType } from './uistate.js';

const CITY_TILES = [];
for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
        if (dx === 0 && dy === 0) continue;
        CITY_TILES.push({ dx, dy });
    }
}

const BASE_CONTENT = 4;
const MAX_SIZE_WITHOUT_AQUEDUCT = 10;

export function getFoodToGrow(size) {
    return (size + 1) * 10;
}

function cityHasWonder(city, player, wonderId) {
    return city.improvements.includes(wonderId) && player.hasActiveWonder(wonderId);
}

// ============================================
// TILES
// ============================================

// Yields of a tile as worked by this city, including government effects. The city centre
// gets free irrigation and a free road.
export function getTileYields(city, player, x, y) {
    let [food, shields, trade] = world.getYieldsAt(x, y);
    const terrain = world.getTerrainAt(x, y);

    if (x === city.x && y === city.y) {
        if (canIrrigate(terrain) && !world.hasImprovement(x, y, IMPROVEMENT.IRRIGATION | IMPROVEMENT.MINE)) {
            food += getImprovementBonus(terrain, IMPROVEMENT.IRRIGATION)[0];
        }
        if (!world.hasImprovement(x, y, IMPROVEMENT.ROAD)) {
            trade += getImprovementBonus(terrain, IMPROVEMENT.ROAD)[2];
        }
        shields = Math.max(shields, 1);
    }

    const gov = player.gov;
    if (gov.tilePenalty && !city.celebrating) {
        if (food > 2) food--;
        if (shields > 2) shields--;
        if (trade > 2) trade--;
    }
    if (trade > 0 && (gov.tradeBonus || (gov.celebrationTrade && city.celebrating))) {
        trade++;
    }
    if (terrain === TERRAIN.OCEAN && cityHasWonder(city, player, 'colossus')) {
        trade++;
    }
    return [food, shields, trade];
}

function isTileAvailable(city, x, y) {
    if (y < 0 || y >= world.terrain.length) return false;
    const otherCity = world.getCityAt(x, y);
    if (otherCity && otherCity !== city) return false;
    if (world.getUnitsAt(x, y).some(u => u.player !== city.player)) return false;
    return !world.getAllCities().some(c => c !== city && c.workedTiles?.some(t => t.x === x && t.y === y));
}

export function getWorkedTiles(city) {
    if (city.workedTiles != null) {
        return city.workedTiles;
    }
    return getAutoWorkedTiles(city);
}

// Work the best tiles, food counting most, then swap in food tiles until the city has a surplus
function getAutoWorkedTiles(city) {
    const player = world.getPlayer(city.player);
    const tiles = [];
    for (const { dx, dy } of CITY_TILES) {
        const x = city.x + dx;
        const y = city.y + dy;
        if (!isTileAvailable(city, x, y)) continue;
        const [food, shields, trade] = getTileYields(city, player, x, y);
        tiles.push({ x, y, dx, dy, food, score: food * 3 + shields * 2 + trade });
    }
    tiles.sort((a, b) => b.score - a.score);
    const worked = tiles.slice(0, city.size);
    const spare = tiles.slice(city.size);

    const settlers = player.units.filter(u => u.homeCity === city.id && u.typeId === 'settler').length;
    const needed = city.size * 2 + settlers * player.gov.settlerFood + 1 - getTileYields(city, player, city.x, city.y)[0];
    let food = worked.reduce((sum, t) => sum + t.food, 0);
    while (food < needed && worked.length > 0 && spare.length > 0) {
        const best = spare.reduce((a, b) => b.food > a.food ? b : a);
        const worst = worked.reduce((a, b) => b.food < a.food || (b.food === a.food && b.score < a.score) ? b : a);
        if (best.food <= worst.food) break;
        worked[worked.indexOf(worst)] = best;
        spare[spare.indexOf(best)] = worst;
        food += best.food - worst.food;
    }
    return worked.map(({ x, y, dx, dy }) => ({ x, y, dx, dy }));
}

export function toggleCityTileWorker(city, dx, dy) {
    const x = city.x + dx;
    const y = city.y + dy;
    if (!isTileAvailable(city, x, y)) return;

    if (!city.workedTiles) {
        city.workedTiles = getAutoWorkedTiles(city);
    }
    const index = city.workedTiles.findIndex(t => t.dx === dx && t.dy === dy);
    if (index >= 0) {
        city.workedTiles.splice(index, 1);
    } else if (city.workedTiles.length < city.size) {
        city.workedTiles.push({ x, y, dx, dy });
    }
}

// ============================================
// CITY ECONOMY
// ============================================

function distanceToCapital(city, player) {
    const capital = player.capital;
    if (!capital) return 32;
    const dx = Math.abs(city.x - capital.x);
    return Math.max(Math.min(dx, MAP_WIDTH - dx), Math.abs(city.y - capital.y));
}

function isMilitary(unit) {
    return !unit.isCivilian && unit.type.attack > 0;
}

// Everything a city produces this turn, plus the mood of its citizens
export function calculateCity(city) {
    const player = world.getPlayer(city.player);
    const gov = player.gov;

    const worked = getWorkedTiles(city);
    const tiles = [{ dx: 0, dy: 0, x: city.x, y: city.y }, ...worked].map(t => ({
        ...t, yields: getTileYields(city, player, t.x, t.y),
    }));
    let food = 0, shields = 0, trade = 0;
    for (const t of tiles) {
        food += t.yields[0];
        shields += t.yields[1];
        trade += t.yields[2];
    }
    const entertainers = city.size - worked.length;

    const supported = player.units.filter(u => u.homeCity === city.id);
    const settlers = supported.filter(u => u.typeId === 'settler').length;
    const foodConsumed = city.size * 2 + settlers * gov.settlerFood;
    const unitUpkeep = Math.max(0, supported.length - gov.freeUnits);

    const has = (id) => city.improvements.includes(id);
    let shieldBonus = 0;
    if (has('factory')) {
        shieldBonus += has('mfg_plant') ? 1 : 0.5;
        if (has('power_plant') || has('hydro_plant') || has('nuclear_plant') || player.hasActiveWonder('hoover_dam')) {
            shieldBonus += 0.5;
        }
    }
    const production = Math.floor(shields * (1 + shieldBonus)) - unitUpkeep;

    let wastePct = Math.min(100, gov.waste + gov.wastePerTile * distanceToCapital(city, player));
    if (has('courthouse') || has('palace')) wastePct /= 2;
    const corruption = Math.floor(trade * wastePct / 100);
    const netTrade = trade - corruption;

    const rates = player.effectiveRates;
    let tax = Math.floor(netTrade * rates.tax / 10);
    let lux = Math.floor(netTrade * rates.lux / 10);
    let sci = netTrade - tax - lux;
    lux += entertainers * 2;

    const moneyBonus = 1 + (has('marketplace') ? 0.5 : 0) + (has('bank') ? 0.5 : 0);
    tax = Math.floor(tax * moneyBonus);
    lux = Math.floor(lux * moneyBonus);

    let sciBonus = 1;
    if (has('library')) sciBonus += 0.5;
    if (has('university')) sciBonus += 0.5;
    if (cityHasWonder(city, player, 'copernicus')) sciBonus += 1;
    if (cityHasWonder(city, player, 'isaac_newtons')) sciBonus += 1;
    if (player.hasActiveWonder('seti_program')) sciBonus += 0.5;
    sci = Math.floor(sci * sciBonus);

    const mood = calculateHappiness(city, player, lux, entertainers, supported);

    return {
        food, foodConsumed, foodNet: food - foodConsumed,
        shields, unitUpkeep, production,
        trade, corruption, tax, lux, sci,
        tiles, entertainers,
        ...mood,
    };
}

function calculateHappiness(city, player, lux, entertainers, supported) {
    const gov = player.gov;
    const working = city.size - entertainers;

    const cityCount = player.cities.length;
    const empirePenalty = cityCount > gov.empireBase ? 1 + Math.floor((cityCount - gov.empireBase - 1) / 10) : 0;
    let content = Math.max(0, Math.min(working, BASE_CONTENT - empirePenalty));
    let unhappy = working - content;
    let happy = 0;

    // Every two luxuries make a content citizen happy, or an unhappy one content
    for (let l = lux; l >= 2 && (content > 0 || unhappy > 0); l -= 2) {
        if (content > 0) {
            content--;
            happy++;
        } else {
            unhappy--;
            content++;
        }
    }

    const makeContent = (n) => {
        const k = Math.min(n, unhappy);
        unhappy -= k;
        content += k;
    };
    const has = (id) => city.improvements.includes(id);

    if (has('temple')) {
        makeContent((player.hasTech('mysticism') ? 2 : 1) * (player.hasActiveWonder('oracle') ? 2 : 1));
    }
    if (has('colosseum')) makeContent(3);
    if (has('cathedral') || player.hasActiveWonder('michelangelos')) makeContent(3);
    if (player.hasActiveWonder('hanging_gardens')) makeContent(1);
    if (player.hasActiveWonder('cure_for_cancer')) makeContent(1);

    if (gov.martialLaw) {
        const garrison = world.getUnitsAt(city.x, city.y).filter(u => u.player === player.id && isMilitary(u));
        makeContent(Math.min(garrison.length, gov.martialLaw));
    }

    if (gov.unhappyAbroad) {
        const perUnit = Math.max(0, gov.unhappyAbroad - (player.hasActiveWonder('womens_suffrage') ? 1 : 0));
        const abroad = supported.filter(u => isMilitary(u) && !world.getCityAt(u.x, u.y) &&
            Math.max(Math.abs(u.x - city.x), Math.abs(u.y - city.y)) > 3).length;
        for (let i = 0; i < abroad * perUnit; i++) {
            if (content > 0) {
                content--;
                unhappy++;
            } else if (happy > 0) {
                happy--;
                content++;
            }
        }
    }

    if (player.hasActiveWonder('js_bachs')) makeContent(2);
    if (cityHasWonder(city, player, 'shakespeares')) makeContent(unhappy);

    return {
        happy, content, unhappy,
        disorder: unhappy > happy,
        celebrating: city.size >= 3 && unhappy === 0 && happy >= working / 2,
    };
}

// ============================================
// TURN PROCESSING
// ============================================

export function processCityTurn(city, player) {
    const events = [];
    const message = (text) => events.push({ type: GameEventType.MESSAGE, message: text });
    const c = calculateCity(city);

    city.food += c.foodNet;
    const rapture = c.celebrating && player.gov.rapture && c.foodNet > 0;
    if (rapture || city.food >= getFoodToGrow(city.size)) {
        if (city.size >= MAX_SIZE_WITHOUT_AQUEDUCT && !city.improvements.includes('aqueduct')) {
            city.food = Math.min(city.food, getFoodToGrow(city.size));
        } else {
            city.size++;
            city.food = city.improvements.includes('granary') ? Math.floor(getFoodToGrow(city.size) / 2) : 0;
            city.workedTiles = null;
            events.push({ type: GameEventType.CITY_GREW, city, newSize: city.size });
        }
    } else if (city.food < 0) {
        const settler = player.units.find(u => u.homeCity === city.id && u.typeId === 'settler');
        city.food = 0;
        if (settler) {
            player.removeUnit(settler);
            message(`Famine in ${city.name}! Settlers lost.`);
        } else if (city.size > 1) {
            city.size--;
            city.workedTiles = null;
            events.push({ type: GameEventType.CITY_STARVED, city, newSize: city.size });
        }
    }

    if (c.production < 0) {
        const unit = player.units.filter(u => u.homeCity === city.id).at(-1);
        player.removeUnit(unit);
        message(`${city.name} can't support its ${unit.name}. Unit disbanded.`);
    }

    if (!c.disorder) {
        city.production.progress += Math.max(0, c.production);
        if (city.production.progress >= getProductionData(city.production.type).cost) {
            const result = completeProduction(city, player);
            if (result) events.push(...result);
        }
        player.gold += c.tax;
        player.science += c.sci;
    }

    for (const id of city.improvements) {
        player.gold -= IMPROVEMENTS[id].maintenance || 0;
    }

    city.disorderTurns = c.disorder ? (city.disorderTurns || 0) + 1 : 0;
    if (city.disorderTurns === 1) message(`Civil disorder in ${city.name}!`);
    if (c.celebrating && !city.celebrating) message(`"We Love the King Day" in ${city.name}!`);
    city.celebrating = c.celebrating;

    return events;
}

// Sell the most expensive buildings to maintain until the treasury is out of the red
export function sellBuildingsToCoverDebt(player) {
    const sold = [];
    while (player.gold < 0) {
        let best = null;
        for (const city of player.cities) {
            for (const id of city.improvements) {
                const imp = IMPROVEMENTS[id];
                if (imp.maintenance && (!best || imp.maintenance > IMPROVEMENTS[best.id].maintenance)) {
                    best = { city, id };
                }
            }
        }
        if (!best) break;
        best.city.improvements = best.city.improvements.filter(id => id !== best.id);
        player.gold += IMPROVEMENTS[best.id].cost;
        sold.push({ city: best.city, name: IMPROVEMENTS[best.id].name });
    }
    return sold;
}

// ============================================
// PRODUCTION
// ============================================

export function getProductionData(typeId) {
    const unit = UNIT_TYPES[typeId];
    if (unit) {
        return { id: typeId, name: unit.name, cost: unit.cost, isUnit: true };
    }
    const imp = IMPROVEMENTS[typeId];
    return { id: typeId, name: imp.name, cost: imp.cost, isUnit: false, isWonder: !!imp.wonder };
}

function productionCategory(typeId) {
    const data = getProductionData(typeId);
    return data.isUnit ? 'unit' : data.isWonder ? 'wonder' : 'improvement';
}

export function canBuildUnit(player, typeId) {
    const unit = UNIT_TYPES[typeId];
    if (unit.requires && !player.hasTech(unit.requires)) return false;
    if (unit.needsWonder && !world.isWonderBuilt(unit.needsWonder)) return false;
    return true;
}

function isCoastal(city) {
    return CITY_TILES.some(({ dx, dy }) =>
        Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && !world.isLand(city.x + dx, city.y + dy));
}

// Units that a better unit has replaced are no longer offered
export function getProductionOptions(city, player) {
    const options = [];
    for (const [id, unit] of Object.entries(UNIT_TYPES)) {
        if (!canBuildUnit(player, id)) continue;
        if (unit.obsoleteBy && canBuildUnit(player, unit.obsoleteBy)) continue;
        if (unit.domain === 'sea' && !isCoastal(city)) continue;
        options.push(getProductionData(id));
    }
    for (const [id, imp] of Object.entries(IMPROVEMENTS)) {
        if (city.improvements.includes(id)) continue;
        if (imp.requires && !player.hasTech(imp.requires)) continue;
        if (imp.prereq && !city.improvements.includes(imp.prereq)) continue;
        if (imp.wonder && (world.isWonderBuilt(id) || (imp.obsoleteBy && player.hasTech(imp.obsoleteBy)))) continue;
        options.push(getProductionData(id));
    }
    return options;
}

// Switching between units, improvements and wonders loses half the shields
export function changeProduction(city, typeId) {
    if (productionCategory(typeId) !== productionCategory(city.production.type)) {
        city.production.progress = Math.floor(city.production.progress / 2);
    }
    city.production.type = typeId;
}

export function getBuyCost(city) {
    const data = getProductionData(city.production.type);
    const remaining = data.cost - city.production.progress;
    if (remaining <= 0) return 0;
    let cost = 2 * remaining + Math.floor(remaining * remaining / 20);
    if (data.isUnit || data.isWonder) cost *= 2;
    if (city.production.progress === 0) cost *= 2;
    return cost;
}

// Bought items appear at the start of the next turn, like in Civ 1
export function buyProduction(city, player) {
    player.gold -= getBuyCost(city);
    city.production.progress = getProductionData(city.production.type).cost;
}

function defaultProduction(city, player) {
    const defenders = getProductionOptions(city, player).filter(o => o.isUnit && UNIT_TYPES[o.id].domain === 'land');
    return defenders.reduce((best, o) => UNIT_TYPES[o.id].defense > UNIT_TYPES[best.id].defense ? o : best).id;
}

function completeProduction(city, player) {
    const data = getProductionData(city.production.type);

    if (data.isUnit) {
        if (data.id === 'settler') {
            if (city.size <= 1) return null;
            city.size--;
            city.workedTiles = null;
        }
        const unit = player.createUnit(data.id, city.x, city.y);
        unit.homeCity = city.id;
        if (city.improvements.includes('barracks') && !unit.isCivilian) {
            unit.makeVeteran();
        }
        city.production.progress = 0;
        return [{ type: GameEventType.UNIT_BUILT, city, unit }];
    }

    if (data.isWonder && world.isWonderBuilt(data.id)) {
        city.production.type = defaultProduction(city, player);
        return [{ type: GameEventType.MESSAGE, message: `${data.name} has already been built elsewhere. ${city.name} switches production.` }];
    }

    if (data.id === 'palace') {
        for (const other of player.cities) {
            other.improvements = other.improvements.filter(id => id !== 'palace');
        }
    }
    city.improvements.push(data.id);
    city.production = { type: defaultProduction(city, player), progress: 0 };

    const events = [{ type: GameEventType.CITY_BUILT, city, building: data }];
    if (data.id === 'darwins_voyage') {
        for (let i = 0; i < 2; i++) {
            const tech = world.grantFreeTech(player);
            if (tech) events.push({ type: GameEventType.MESSAGE, message: `Darwin's Voyage reveals ${tech.name}!` });
        }
    }
    return events;
}

// A caravan adds its full cost to a wonder under construction
export function helpBuildWonder(city, caravan, player) {
    city.production.progress += caravan.cost;
    player.removeUnit(caravan);
}

// ============================================
// CITY SCREEN
// ============================================

let selectedUnitRef = null;

export function setCityScreenUnitRef(unit) {
    selectedUnitRef = unit;
}

export function isCityScreenOpen() {
    return uiState.getState().type === UIStateType.CITY_SCREEN;
}

export function getCurrentCity() {
    return uiState.getState().data?.city || null;
}

export function openCityScreen(city) {
    viewOpenCityScreen(calculateCity(city));
}

export function closeCityScreen() {
    viewCloseCityScreen();
    render(selectedUnitRef);
}

export function updateCityScreen() {
    const city = getCurrentCity();
    if (city) {
        viewOpenCityScreen(calculateCity(city));
    }
}

export function renameCity() {
    const city = getCurrentCity();
    const newName = prompt('Enter new city name:', city.name);
    if (newName?.trim()) {
        city.name = newName.trim();
        updateCityScreen();
    }
}
