// AI Player Logic
// Handles decision making for non-human players

import { UNIT_TYPES, UnitStatus } from './units.js';
import {
    IMPROVEMENT, canIrrigate, canMine, getIrrigationTransform, getMineTransform, getImprovementTurns,
    irrigationGivesFood, TERRAIN_DATA, TERRAIN,
} from './terrain.js';
import {
    getProductionOptions, changeProduction, calculateCity, getWorkedTiles, getBuyCost, buyProduction, canBuildUnit,
} from './citymanagement.js';
import { getAvailableGovernments } from './government.js';
import { getAvailableResearch } from './tech.js';

const MIN_CITY_DISTANCE = 4;
const MAX_CITIES = 16;
const SITE_RADIUS = 10;
const MIN_SITE_SCORE = 90;
const PATH_RADIUS = 20;
const GOLD_RESERVE = 100;
const POOR_CITY_CENTERS = [TERRAIN.ARCTIC, TERRAIN.TUNDRA, TERRAIN.MOUNTAINS];
const NEIGHBORS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

const GOVERNMENT_PREFERENCE = ['despotism', 'monarchy', 'communism', 'republic'];

const RESEARCH_PREFERENCE = [
    'bronze_working', 'alphabet', 'ceremonial_burial', 'code_of_laws', 'monarchy', 'pottery',
    'masonry', 'writing', 'currency', 'iron_working', 'mathematics', 'mysticism', 'literacy',
    'trade', 'philosophy', 'construction', 'the_republic', 'horseback_riding', 'wheel',
    'feudalism', 'chivalry', 'banking', 'university', 'astronomy', 'invention', 'gunpowder',
];

export function processAITurn(player, world) {
    const ctx = {
        enemyAt: buildEnemyMap(player, world),
        siteScores: new Map(),
    };

    chooseGovernment(player, world);
    setRates(player);

    for (const city of player.cities) {
        if (city.production.progress === 0) {
            changeProduction(city, chooseProduction(city, player, world, ctx));
        }
        avoidDisorder(city);
    }
    buyWithSpareGold(player, world);

    const handled = garrisonCities(player, world);
    for (const unit of [...player.units]) {
        if (handled.has(unit) || unit.movesLeft <= 0 || unit.status === UnitStatus.BUILDING) continue;
        if (!player.units.includes(unit)) continue;
        if (unit.canFoundCity()) {
            processSettler(unit, player, world, ctx);
        } else if (unit.isCivilian || unit.domain !== 'land') {
            unit.skip();
        } else {
            processMilitaryUnit(unit, player, world, ctx);
        }
    }
}

export function chooseResearch(player) {
    const available = getAvailableResearch(player);
    if (available.length === 0) return null;
    const preferred = RESEARCH_PREFERENCE.find(id => available.some(t => t.id === id));
    return preferred || available[Math.floor(Math.random() * available.length)].id;
}

// ============================================
// EMPIRE MANAGEMENT
// ============================================

function chooseGovernment(player, world) {
    if (player.government === 'anarchy') return;
    const rank = (id) => GOVERNMENT_PREFERENCE.indexOf(id);
    const best = getAvailableGovernments(player)
        .filter(g => rank(g.id) > rank(player.government))
        .sort((a, b) => rank(b.id) - rank(a.id))[0];
    if (best) world.startRevolution(player, best.id);
}

// Science as high as allowed, with more tax while the treasury is low and more luxury while
// cities riot despite their entertainers
function setRates(player) {
    if (player.government === 'anarchy') return;
    const max = player.gov.maxRate / 10;
    const unrest = player.cities.some(c => c.disorderTurns > 0);
    const lux = Math.min(max, Math.max(0, player.rates.lux + (unrest ? 1 : -1)));
    const wanted = player.gold < GOLD_RESERVE ? 5 : player.gold < 3 * GOLD_RESERVE ? 3 : 0;
    const tax = Math.min(max, 10 - lux, Math.max(10 - max - lux, wanted));
    if (player.canSetRates(tax, lux)) player.setRates(tax, lux);
}

// Finish the cheapest item to complete, defenders for threatened cities first
function buyWithSpareGold(player, world) {
    const candidates = player.cities
        .map(c => ({ city: c, cost: getBuyCost(c), urgent: garrisonOf(c, player, world).length === 0 }))
        .filter(o => o.city.production.progress > 0 || o.urgent)
        .filter(o => o.cost > 0 && o.cost <= player.gold - GOLD_RESERVE)
        .sort((a, b) => (b.urgent - a.urgent) || (a.cost - b.cost));
    if (candidates.length > 0) buyProduction(candidates[0].city, player);
}

// Turn workers into entertainers until the city is calm again
function avoidDisorder(city) {
    city.workedTiles = null;
    let c = calculateCity(city);
    while (c.disorder && getWorkedTiles(city).length > 0) {
        city.workedTiles = getWorkedTiles(city).slice(0, -1);
        c = calculateCity(city);
    }
}

// ============================================
// PRODUCTION
// ============================================

function isMilitary(unit) {
    return !unit.isCivilian && unit.type.attack > 0 && unit.domain === 'land';
}

function garrisonOf(city, player, world) {
    return world.getUnitsAt(city.x, city.y).filter(u => u.player === player.id && isMilitary(u));
}

function enemyNear(city, player, world, radius) {
    return world.getAllUnits().some(u => u.player !== player.id && !u.isCivilian &&
        distance(u, city) <= radius);
}

function requiredDefenders(city, player, world) {
    let need = city.size >= 6 ? 2 : 1;
    if (enemyNear(city, player, world, 3)) need++;
    return need;
}

function bestUnit(options, stat) {
    const units = options.filter(o => o.isUnit && UNIT_TYPES[o.id].domain === 'land' && !UNIT_TYPES[o.id].civilian);
    const other = stat === 'attack' ? 'defense' : 'attack';
    return units.reduce((best, o) => {
        const u = UNIT_TYPES[o.id];
        const b = UNIT_TYPES[best.id];
        return u[stat] > b[stat] || (u[stat] === b[stat] && u[other] > b[other]) ? o : best;
    }).id;
}

// Buildings in the order the AI wants them, each with the condition that makes it worth building
const BUILDING_PLAN = [
    ['temple', (city, c) => c.unhappy > 0 || city.size >= 4],
    ['walls', (city, c, threatened) => threatened],
    ['library', (city) => city.size >= 3],
    ['marketplace', (city) => city.size >= 4],
    ['courthouse', (city, c) => c.corruption >= 3],
    ['granary', (city) => city.size >= 4],
    ['colosseum', (city, c) => c.unhappy > 0 && city.size >= 5],
    ['aqueduct', (city) => city.size >= 9],
    ['cathedral', (city, c) => c.unhappy > 0 && city.size >= 7],
    ['university', (city) => city.size >= 6],
    ['bank', (city) => city.size >= 7],
    ['factory', (city) => city.size >= 8],
    ['power_plant', (city) => city.size >= 8],
];

function chooseProduction(city, player, world, ctx) {
    const options = getProductionOptions(city, player);
    const available = (id) => options.some(o => o.id === id);
    const c = calculateCity(city);
    const threatened = enemyNear(city, player, world, 5);

    const garrison = garrisonOf(city, player, world);
    const bestDefender = bestUnit(options, 'defense');
    if (garrison.length < requiredDefenders(city, player, world) ||
        garrison.every(u => isObsolete(player, u.typeId) && u.typeId !== bestDefender)) {
        return bestDefender;
    }

    const wantsSettler = city.size >= 2 && available('settler') && player.cities.length < MAX_CITIES &&
        !player.units.some(u => u.homeCity === city.id && u.canFoundCity()) &&
        findSite(world, player, city, ctx) !== null;
    if (wantsSettler && (player.cities.length < 6 || city.size >= 4)) {
        return 'settler';
    }

    for (const [id, worthIt] of BUILDING_PLAN) {
        if (available(id) && worthIt(city, c, threatened)) return id;
    }

    if (wantsSettler) return 'settler';

    const workers = player.units.filter(u => u.canFoundCity() && !u.aiSite).length;
    if (city.size >= 4 && available('settler') && workers < player.cities.length / 2) return 'settler';

    const military = player.units.filter(isMilitary).length;
    if (military < player.cities.length * 2 && c.unitUpkeep < c.shields / 2) {
        return bestUnit(options, 'attack');
    }

    const wonder = options.filter(o => o.isWonder).sort((a, b) => a.cost - b.cost)[0];
    if (wonder && c.production >= 4) return wonder.id;

    const building = options.filter(o => !o.isUnit && !o.isWonder).sort((a, b) => a.cost - b.cost)[0];
    return building ? building.id : bestUnit(options, 'attack');
}

// ============================================
// PATHFINDING
// ============================================

function distance(a, b) {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function key(x, y) {
    return `${x},${y}`;
}

function buildEnemyMap(player, world) {
    const enemyAt = new Set();
    for (const other of world.players) {
        if (other.id === player.id) continue;
        for (const thing of [...other.units, ...other.cities]) {
            enemyAt.add(key(thing.x, thing.y));
        }
    }
    return enemyAt;
}

// Breadth-first search over land from (x, y). Returns every reachable tile with its distance
// and the first step to take towards it. Enemy tiles are reachable but not passed through.
function exploreLand(world, x, y, radius, ctx) {
    const start = { x, y, dist: 0, first: null };
    const reached = new Map([[key(x, y), start]]);
    const queue = [start];
    while (queue.length > 0) {
        const tile = queue.shift();
        if (tile.dist >= radius || (tile.dist > 0 && ctx.enemyAt.has(key(tile.x, tile.y)))) continue;
        for (const [dx, dy] of NEIGHBORS) {
            const nx = tile.x + dx;
            const ny = tile.y + dy;
            if (!world.isInBounds(nx, ny) || !world.isLand(nx, ny) || reached.has(key(nx, ny))) continue;
            const next = { x: nx, y: ny, dist: tile.dist + 1, first: tile.first || { x: nx, y: ny } };
            reached.set(key(nx, ny), next);
            queue.push(next);
        }
    }
    return reached;
}

// Take one step towards the target. Returns false when the unit can't get any closer.
function stepToward(unit, target, world, ctx) {
    const tile = exploreLand(world, unit.x, unit.y, PATH_RADIUS, ctx).get(key(target.x, target.y));
    if (!tile || !tile.first) return false;
    const { x, y } = tile.first;
    if (world.hasEnemyAt(unit, x, y)) {
        if (world.canAttack(unit, x, y)) {
            world.attack(unit, x, y);
            return true;
        }
        if (world.canCaptureCity(unit, x, y)) {
            world.moveUnit(unit, x, y);
            return true;
        }
        return false;
    }
    if (!world.canEnter(unit, x, y)) return false;
    world.moveUnit(unit, x, y);
    return true;
}

// ============================================
// SETTLERS
// ============================================

// How good a city would be here: food counts most, then shields, then trade. The centre tile
// is worked for free forever, so it counts three times.
function siteScore(world, x, y, ctx) {
    const k = key(x, y);
    if (ctx.siteScores.has(k)) return ctx.siteScores.get(k);
    if (POOR_CITY_CENTERS.includes(world.getTerrainAt(x, y))) {
        ctx.siteScores.set(k, 0);
        return 0;
    }
    const [cf, cs, ct] = world.getYieldsAt(x, y);
    let score = 2 * (cf * 3 + cs * 2 + ct);
    let coastal = false;
    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            if (Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
            const [food, shields, trade] = world.getYieldsAt(x + dx, y + dy);
            score += food * 3 + shields * 2 + trade;
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && !world.isLand(x + dx, y + dy)) coastal = true;
        }
    }
    if (coastal) score += 5;
    if (world.hasRiver(x, y)) score += 4;
    ctx.siteScores.set(k, score);
    return score;
}

function isFreeSite(world, player, x, y, claimant) {
    return world.canFoundCityAt(x, y) &&
        world.getAllCities().every(c => distance(c, { x, y }) >= MIN_CITY_DISTANCE) &&
        !player.units.some(u => u !== claimant && u.aiSite && distance(u.aiSite, { x, y }) < MIN_CITY_DISTANCE);
}

function findSite(world, player, from, ctx, claimant = null) {
    let best = null;
    let bestValue = -Infinity;
    for (const tile of exploreLand(world, from.x, from.y, SITE_RADIUS, ctx).values()) {
        if (ctx.enemyAt.has(key(tile.x, tile.y))) continue;
        const score = siteScore(world, tile.x, tile.y, ctx);
        if (score < MIN_SITE_SCORE || !isFreeSite(world, player, tile.x, tile.y, claimant)) continue;
        const value = score - tile.dist * 3;
        if (value > bestValue) {
            bestValue = value;
            best = { x: tile.x, y: tile.y };
        }
    }
    return best;
}

function processSettler(unit, player, world, ctx) {
    if (player.cities.length === 0 && world.canFoundCityAt(unit.x, unit.y) &&
        siteScore(world, unit.x, unit.y, ctx) >= MIN_SITE_SCORE) {
        world.foundCity(unit, player.getNextCityName());
        return;
    }
    if (!unit.aiSite || !isFreeSite(world, player, unit.aiSite.x, unit.aiSite.y, unit)) {
        unit.aiSite = player.cities.length < MAX_CITIES ? findSite(world, player, unit, ctx, unit) : null;
    }

    if (unit.aiSite) {
        while (unit.movesLeft > 0) {
            if (unit.x === unit.aiSite.x && unit.y === unit.aiSite.y) {
                world.foundCity(unit, player.getNextCityName());
                return;
            }
            if (!stepToward(unit, unit.aiSite, world, ctx)) break;
        }
        unit.skip();
        return;
    }

    improveLand(unit, player, world, ctx);
}

// The improvement this tile would benefit from most, if any
function wantedImprovement(world, x, y) {
    const terrain = world.getTerrainAt(x, y);
    const has = (imp) => world.hasImprovement(x, y, imp);
    if (canMine(terrain) && getMineTransform(terrain) === null && !has(IMPROVEMENT.MINE) &&
        TERRAIN_DATA[terrain].mine >= 3) return IMPROVEMENT.MINE;
    if (canIrrigate(terrain) && irrigationGivesFood(terrain) && getIrrigationTransform(terrain) === null &&
        !has(IMPROVEMENT.IRRIGATION) && !has(IMPROVEMENT.MINE) && world.hasWaterAccess(x, y)) return IMPROVEMENT.IRRIGATION;
    if (TERRAIN_DATA[terrain].roadTrade && !has(IMPROVEMENT.ROAD)) return IMPROVEMENT.ROAD;
    return null;
}

function improveLand(unit, player, world, ctx) {
    const here = wantedImprovement(world, unit.x, unit.y);
    if (here !== null && isWorkedByOwnCity(unit.x, unit.y, player, ctx)) {
        unit.startBuilding(here, getImprovementTurns(world.getTerrainAt(unit.x, unit.y), here));
        return;
    }

    let best = null;
    for (const tile of exploreLand(world, unit.x, unit.y, SITE_RADIUS, ctx).values()) {
        if (wantedImprovement(world, tile.x, tile.y) === null || !isWorkedByOwnCity(tile.x, tile.y, player, ctx)) continue;
        if (player.units.some(u => u !== unit && u.x === tile.x && u.y === tile.y && u.status === UnitStatus.BUILDING)) continue;
        if (!best || tile.dist < best.dist) best = tile;
    }
    if (best) {
        while (unit.movesLeft > 0 && (unit.x !== best.x || unit.y !== best.y)) {
            if (!stepToward(unit, best, world, ctx)) break;
        }
    }
    if (unit.movesLeft > 0) unit.skip();
}

function isWorkedByOwnCity(x, y, player, ctx) {
    if (!ctx.worked) {
        ctx.worked = new Set(player.cities.flatMap(city =>
            [city, ...getWorkedTiles(city)].map(t => key(t.x, t.y))));
    }
    return ctx.worked.has(key(x, y));
}

// ============================================
// MILITARY
// ============================================

function isObsolete(player, typeId) {
    const replacement = UNIT_TYPES[typeId].obsoleteBy;
    return !!replacement && canBuildUnit(player, replacement);
}

// Keep the best defenders fortified in every city and disband obsolete units it doesn't need.
// Returns the units that stay put.
function garrisonCities(player, world) {
    const handled = new Set();
    for (const city of player.cities) {
        const need = requiredDefenders(city, player, world);
        const garrison = garrisonOf(city, player, world).sort((a, b) => b.defense - a.defense);
        for (const unit of garrison.slice(0, need)) {
            unit.fortify();
            handled.add(unit);
        }
        for (const unit of garrison.slice(need)) {
            if (isObsolete(player, unit.typeId)) {
                player.removeUnit(unit);
                handled.add(unit);
            }
        }
    }
    return handled;
}

function shouldAttack(attacker, target, world) {
    const defender = world.bestDefender(attacker, target.x, target.y);
    return attacker.attack >= world.defenseStrength(defender, attacker) * 0.7;
}

function processMilitaryUnit(unit, player, world, ctx) {
    while (unit.movesLeft > 0 && player.units.includes(unit)) {
        const adjacent = NEIGHBORS.map(([dx, dy]) => ({ x: unit.x + dx, y: unit.y + dy }));
        const target = adjacent.find(p => world.canAttack(unit, p.x, p.y) && shouldAttack(unit, p, world));
        if (target) {
            if (!world.attack(unit, target.x, target.y).attackerWins) return;
            continue;
        }
        const capture = adjacent.find(p => world.canCaptureCity(unit, p.x, p.y));
        if (capture) {
            world.moveUnit(unit, capture.x, capture.y);
        } else {
            const destination = unit.attack > unit.defense
                ? nearestEnemyTarget(unit, player, world, ctx) || nearestCityNeedingDefense(unit, player, world, ctx)
                : nearestCityNeedingDefense(unit, player, world, ctx) || nearestEnemyTarget(unit, player, world, ctx);
            if (!destination || !stepToward(unit, destination, world, ctx)) {
                unit.fortify();
                return;
            }
        }

        const city = world.getCityAt(unit.x, unit.y);
        if (city?.player === player.id && garrisonOf(city, player, world).length <= requiredDefenders(city, player, world)) {
            unit.fortify();
            return;
        }
    }
}

function nearestEnemyTarget(unit, player, world, ctx) {
    let best = null;
    for (const tile of exploreLand(world, unit.x, unit.y, PATH_RADIUS, ctx).values()) {
        if (!ctx.enemyAt.has(key(tile.x, tile.y))) continue;
        if (!best || tile.dist < best.dist) best = tile;
    }
    return best;
}

function nearestCityNeedingDefense(unit, player, world, ctx) {
    const reachable = exploreLand(world, unit.x, unit.y, PATH_RADIUS, ctx);
    let best = null;
    for (const city of player.cities) {
        if (city.x === unit.x && city.y === unit.y) continue;
        if (garrisonOf(city, player, world).length >= requiredDefenders(city, player, world)) continue;
        const tile = reachable.get(key(city.x, city.y));
        if (tile && (!best || tile.dist < best.dist)) best = tile;
    }
    return best;
}
