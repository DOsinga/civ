// World - manages map, players, and game state

import {
    TERRAIN, IMPROVEMENT, RIVER_DEFENSE, getTerrainYields, getTerrainDefense, getTerrainMoveCost,
    getResourceForTerrain, getResourceBonus, getResourceName, RESOURCE, getImprovementBonus,
    getIrrigationTransform, getMineTransform,
} from './terrain.js';
import { Player } from './player.js';
import { getNationIds } from './nations.js';
import { UnitStatus, GameEventType, MOVE_FRAGS } from './units.js';
import { processCityTurn, sellBuildingsToCoverDebt } from './citymanagement.js';
import { checkTechDiscovery, getAvailableResearch, TECHNOLOGIES } from './tech.js';
import { GOVERNMENTS, ANARCHY_TURNS } from './government.js';
import { processAITurn, chooseResearch } from './aiplayer.js';

export const MAP_WIDTH = 80;
export const MAP_HEIGHT = 50;

const NEIGHBORS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

export class World {
    constructor() {
        this.terrain = [];
        this.rivers = [];         // River connections per tile (set of 'N','S','E','W')
        this.resources = [];      // Special resources on tiles
        this.improvements = [];   // Roads, irrigation, mines
        this.players = [];
        this.currentPlayerIndex = 0;
        this.turnNumber = 1;
        this.humanPlayerIndex = 0;
        this.nextCityId = 1;
    }

    // Map setup
    setTerrain(terrainMap) {
        this.terrain = terrainMap;
        this.resources = Array(MAP_HEIGHT).fill(null).map(() => Array(MAP_WIDTH).fill(null));
        this.improvements = Array(MAP_HEIGHT).fill(null).map(() => Array(MAP_WIDTH).fill(null));
    }

    // Each terrain type has a 1/16 chance to have its bonus resource
    distributeResources(seed = null) {
        const random = seed !== null
            ? (() => {
                let s = seed;
                return () => {
                    s = (s * 1103515245 + 12345) & 0x7fffffff;
                    return s / 0x7fffffff;
                };
            })()
            : () => Math.random();

        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const resourceType = getResourceForTerrain(this.terrain[y][x]);
                if (resourceType && random() < 0.0625) {
                    this.resources[y][x] = resourceType;
                }
            }
        }
    }

    getResourceAt(x, y) {
        if (y < 0 || y >= MAP_HEIGHT) {
            return RESOURCE.NONE;
        }
        const wrappedX = ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
        return this.resources[y]?.[wrappedX] ?? RESOURCE.NONE;
    }

    unpackMap(packed) {
        const charToTerrain = {
            'o': TERRAIN.OCEAN, 'G': TERRAIN.GRASSLAND, 'P': TERRAIN.PLAINS,
            'D': TERRAIN.DESERT, 'F': TERRAIN.FOREST, 'H': TERRAIN.HILLS,
            'M': TERRAIN.MOUNTAINS, 'T': TERRAIN.TUNDRA, 'A': TERRAIN.ARCTIC,
            'S': TERRAIN.SWAMP, 'J': TERRAIN.JUNGLE,
        };
        const map = [];
        let i = 0;
        for (let y = 0; y < MAP_HEIGHT; y++) {
            const row = [];
            for (let x = 0; x < MAP_WIDTH; x++) {
                row.push(charToTerrain[packed[i++]] || TERRAIN.OCEAN);
            }
            map.push(row);
        }
        this.setTerrain(map);
        return map;
    }

    // Rivers are hex-encoded, one 4-bit value per tile which matches the SP257.png river sprite
    // index: bit 0 = N, bit 1 = E, bit 2 = S, bit 3 = W
    unpackRivers(packed) {
        this.rivers = [];
        let i = 0;
        for (let y = 0; y < MAP_HEIGHT; y++) {
            const row = [];
            for (let x = 0; x < MAP_WIDTH; x++) {
                row.push(parseInt(packed[i++], 16) || 0);
            }
            this.rivers.push(row);
        }
        return this.rivers;
    }

    getRiverAt(x, y) {
        if (y < 0 || y >= MAP_HEIGHT) {
            return 0;
        }
        const wrappedX = ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
        return this.rivers[y]?.[wrappedX] ?? 0;
    }

    hasRiver(x, y) {
        return this.getRiverAt(x, y) > 0;
    }

    getImprovementAt(x, y) {
        if (y < 0 || y >= MAP_HEIGHT) {
            return IMPROVEMENT.NONE;
        }
        const wrappedX = ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
        return this.improvements[y]?.[wrappedX] ?? IMPROVEMENT.NONE;
    }

    setImprovementAt(x, y, improvement) {
        if (y < 0 || y >= MAP_HEIGHT) return;
        const wrappedX = ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
        this.improvements[y][wrappedX] = (this.improvements[y][wrappedX] || 0) | improvement;
    }

    clearImprovementAt(x, y, improvement) {
        const wrappedX = ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
        this.improvements[y][wrappedX] = (this.improvements[y][wrappedX] || 0) & ~improvement;
    }

    setTerrainAt(x, y, terrainType) {
        if (y < 0 || y >= MAP_HEIGHT) return;
        const wrappedX = ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
        this.terrain[y][wrappedX] = terrainType;
    }

    hasImprovement(x, y, improvement) {
        return (this.getImprovementAt(x, y) & improvement) !== 0;
    }

    getTerrainAt(x, y) {
        if (y < 0 || y >= MAP_HEIGHT) {
            return TERRAIN.OCEAN;
        }
        const wrappedX = ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
        return this.terrain[y]?.[wrappedX] ?? TERRAIN.OCEAN;
    }

    isLand(x, y) {
        return this.getTerrainAt(x, y) !== TERRAIN.OCEAN;
    }

    isInBounds(x, y) {
        return x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT;
    }

    isNextToLand(x, y) {
        return NEIGHBORS.some(([dx, dy]) => this.isLand(x + dx, y + dy));
    }

    // Irrigation needs water, a city or irrigation on a tile directly north, south, east or west
    hasWaterAccess(x, y) {
        return [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) =>
            !this.isLand(x + dx, y + dy) || this.hasRiver(x + dx, y + dy) ||
            this.hasImprovement(x + dx, y + dy, IMPROVEMENT.IRRIGATION) || !!this.getCityAt(x + dx, y + dy));
    }

    // Base yields of a tile before government and wonder effects
    getYieldsAt(x, y) {
        const terrainType = this.getTerrainAt(x, y);
        let [food, shields, trade] = getTerrainYields(terrainType);

        const [rf, rs, rt] = getResourceBonus(this.getResourceAt(x, y));
        const [imf, ims, imt] = getImprovementBonus(terrainType, this.getImprovementAt(x, y));
        food += rf + imf;
        shields += rs + ims;
        trade += rt + imt;

        if (this.hasRiver(x, y) && terrainType !== TERRAIN.OCEAN) {
            trade += 1;
        }

        // A railroad adds half of everything the tile produces, rounded down
        if (this.hasImprovement(x, y, IMPROVEMENT.RAILROAD)) {
            food += Math.floor(food / 2);
            shields += Math.floor(shields / 2);
            trade += Math.floor(trade / 2);
        }

        return [food, shields, trade];
    }

    getResourceNameAt(x, y) {
        return getResourceName(this.getResourceAt(x, y));
    }

    // Players
    addPlayer(nationId, isHuman = false) {
        const player = new Player(nationId, isHuman);
        this.players.push(player);
        if (isHuman) {
            this.humanPlayerIndex = this.players.length - 1;
        }
        return player;
    }

    getPlayer(playerId) {
        return this.players.find(p => p.id === playerId);
    }

    get currentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    get humanPlayer() {
        return this.players[this.humanPlayerIndex];
    }

    getAlivePlayers() {
        return this.players.filter(p => p.alive);
    }

    getAllUnits() {
        return this.players.flatMap(p => p.units);
    }

    getUnitsAt(x, y) {
        return this.getAllUnits().filter(u => u.x === x && u.y === y);
    }

    getUnitAt(x, y, playerId = null) {
        const units = this.getUnitsAt(x, y);
        if (playerId !== null) {
            return units.find(u => u.player === playerId);
        }
        return units[0] || null;
    }

    getAllCities() {
        return this.players.flatMap(p => p.cities);
    }

    getCityAt(x, y) {
        const wrappedX = ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
        return this.getAllCities().find(c => c.x === wrappedX && c.y === y);
    }

    getCityById(id) {
        return this.getAllCities().find(c => c.id === id);
    }

    // Wonders can only be built once in the whole world
    isWonderBuilt(wonderId) {
        return this.getAllCities().some(c => c.improvements.includes(wonderId));
    }

    // ============================================
    // MOVEMENT
    // ============================================

    hasEnemyAt(unit, x, y) {
        return this.getUnitsAt(x, y).some(u => u.player !== unit.player) ||
            (this.getCityAt(x, y) && this.getCityAt(x, y).player !== unit.player);
    }

    // Free cargo space on the player's ships on this tile
    cargoSpaceAt(playerId, x, y) {
        const units = this.getUnitsAt(x, y).filter(u => u.player === playerId);
        const capacity = units.reduce((sum, u) => sum + u.type.capacity, 0);
        const used = units.filter(u => u.domain === 'land').length;
        return capacity - used;
    }

    // Can the unit step onto this tile when there is no enemy on it?
    canEnter(unit, x, y) {
        if (!this.isInBounds(x, y)) return false;
        const land = this.isLand(x, y);
        const ownCity = this.getCityAt(x, y)?.player === unit.player;

        if (unit.domain === 'air') return true;
        if (unit.domain === 'sea') return !land || ownCity;
        if (land) return !this.violatesZoc(unit, x, y);
        return this.cargoSpaceAt(unit.player, x, y) > 0;
    }

    // Zones of control: a land unit may not move from a tile next to an enemy to another
    // tile next to an enemy, unless it moves into its own city or onto its own units
    violatesZoc(unit, x, y) {
        if (unit.domain !== 'land' || unit.typeId === 'diplomat' || unit.typeId === 'caravan') return false;
        if (!this.isLand(unit.x, unit.y)) return false;
        if (this.getCityAt(x, y)?.player === unit.player) return false;
        if (this.getUnitsAt(x, y).some(u => u.player === unit.player)) return false;
        return this.nextToEnemyLandUnit(unit.player, unit.x, unit.y) && this.nextToEnemyLandUnit(unit.player, x, y);
    }

    nextToEnemyLandUnit(playerId, x, y) {
        return NEIGHBORS.some(([dx, dy]) =>
            this.getUnitsAt(x + dx, y + dy).some(u => u.player !== playerId && u.domain === 'land'));
    }

    hasRoad(x, y) {
        return this.hasImprovement(x, y, IMPROVEMENT.ROAD) || !!this.getCityAt(x, y);
    }

    hasRailroad(x, y) {
        return this.hasImprovement(x, y, IMPROVEMENT.RAILROAD) || !!this.getCityAt(x, y);
    }

    moveCost(unit, x, y) {
        if (unit.domain !== 'land') return MOVE_FRAGS;
        if (this.hasRailroad(unit.x, unit.y) && this.hasRailroad(x, y)) return 0;
        if (this.hasRoad(unit.x, unit.y) && this.hasRoad(x, y)) return 1;
        return getTerrainMoveCost(this.getTerrainAt(x, y)) * MOVE_FRAGS;
    }

    // Move a unit one tile. A unit with fewer moves left than the terrain costs may still
    // move, but that uses up its turn. Boarding or leaving a ship also ends the turn.
    // Returns the captured city, if any.
    moveUnit(unit, x, y) {
        const fromLand = this.isLand(unit.x, unit.y);
        const toLand = this.isLand(x, y);
        const cost = this.moveCost(unit, x, y);

        if (unit.domain === 'sea' && !fromLand) {
            for (const cargo of this.getUnitsAt(unit.x, unit.y)) {
                if (cargo.player === unit.player && cargo.domain === 'land') {
                    cargo.x = x;
                    cargo.y = y;
                    if (cargo.status === UnitStatus.SENTRY && this.isNextToLand(x, y)) {
                        cargo.status = UnitStatus.WAITING_ORDERS;
                    }
                }
            }
        }

        unit.x = x;
        unit.y = y;
        unit.movesLeft = Math.max(0, unit.movesLeft - cost);
        if (unit.status === UnitStatus.FORTIFIED || unit.status === UnitStatus.SENTRY) {
            unit.status = UnitStatus.WAITING_ORDERS;
        }

        if (unit.domain === 'land' && fromLand !== toLand) {
            unit.movesLeft = 0;
            if (!toLand) unit.status = UnitStatus.SENTRY;
        }

        const city = this.getCityAt(x, y);
        if (city && city.player !== unit.player) {
            return this.captureCity(city, this.getPlayer(unit.player));
        }
        return null;
    }

    // Land military units can walk into an undefended enemy city
    canCaptureCity(unit, x, y) {
        const city = this.getCityAt(x, y);
        return city && city.player !== unit.player && unit.domain === 'land' && !unit.isCivilian &&
            !this.getUnitsAt(x, y).some(u => u.player !== unit.player);
    }

    captureCity(city, conqueror) {
        const loser = this.getPlayer(city.player);
        const loserSize = loser.cities.reduce((sum, c) => sum + c.size, 0);
        const plunder = Math.floor(loser.gold * city.size / loserSize);
        loser.gold -= plunder;
        conqueror.gold += plunder;

        loser.removeCity(city);
        for (const unit of loser.units) {
            if (unit.homeCity === city.id) unit.homeCity = null;
        }
        // Conquest costs a city one size; a size 1 city is destroyed
        const destroyed = city.size <= 1;
        if (!destroyed) {
            conqueror.addCity(city);
            city.size--;
            city.improvements = city.improvements.filter(id => id !== 'palace');
            city.workedTiles = null;
        }

        const stealable = loser.discoveredTechs.filter(t => !conqueror.hasTech(t));
        const stolen = stealable.length > 0 ? stealable[Math.floor(Math.random() * stealable.length)] : null;
        if (stolen) conqueror.discoverTech(stolen);

        loser.checkDefeat();
        return { city, loser, plunder, stolen, destroyed };
    }

    foundCity(unit, name) {
        const player = this.getPlayer(unit.player);
        const city = {
            id: this.nextCityId++,
            name,
            x: unit.x,
            y: unit.y,
            player: player.id,
            size: 1,
            food: 0,
            improvements: player.cities.length === 0 ? ['palace'] : [],
            production: { type: 'militia', progress: 0 },
            workedTiles: null,
            disorderTurns: 0,
        };
        player.addCity(city);
        player.removeUnit(unit);
        return city;
    }

    canFoundCityAt(x, y) {
        return this.isLand(x, y) && !this.getCityAt(x, y);
    }

    // ============================================
    // COMBAT
    // ============================================

    canAttack(attacker, x, y) {
        if (attacker.isCivilian || attacker.attack === 0) return false;
        const defenders = this.getUnitsAt(x, y).filter(u => u.player !== attacker.player);
        if (defenders.length === 0) return false;
        if (attacker.domain === 'land' && !this.isLand(x, y)) return false;
        if (defenders.every(u => u.domain === 'air') && attacker.typeId !== 'fighter') return false;
        return true;
    }

    defenseStrength(defender, attacker) {
        const x = defender.x;
        const y = defender.y;
        const city = this.getCityAt(x, y);
        let strength = defender.defense;

        if (defender.domain === 'land') {
            strength *= 1 + getTerrainDefense(this.getTerrainAt(x, y));
            if (this.hasRiver(x, y)) strength *= 1 + RIVER_DEFENSE;
        }

        const owner = this.getPlayer(defender.player);
        const walls = city && (city.improvements.includes('walls') || owner.hasActiveWonder('great_wall'));
        if (walls && !attacker.type.ignoresWalls) {
            strength *= 3;
        } else if (defender.status === UnitStatus.FORTIFIED || city) {
            strength *= 1.5;
        }
        return strength;
    }

    // The defender with the best defense against this attacker
    bestDefender(attacker, x, y) {
        const defenders = this.getUnitsAt(x, y).filter(u => u.player !== attacker.player);
        return defenders.reduce((best, u) =>
            this.defenseStrength(u, attacker) > this.defenseStrength(best, attacker) ? u : best);
    }

    // Civ 1 combat is a single roll: each side rolls up to its strength, highest wins.
    // A defender that loses outside a city takes every unit on its tile with it.
    attack(attacker, x, y) {
        if (attacker.type.nuclear) return this.detonateNuke(attacker, x, y);

        const defender = this.bestDefender(attacker, x, y);
        const attackStrength = attacker.attack;
        const defenseStrength = this.defenseStrength(defender, attacker);
        const attackerWins = Math.random() * attackStrength > Math.random() * defenseStrength;
        const city = this.getCityAt(x, y);

        let killed;
        if (attackerWins) {
            killed = city ? [defender] : this.getUnitsAt(x, y).filter(u => u.player === defender.player);
            if (city && city.size > 1 && !city.improvements.includes('walls')) {
                city.size--;
                city.workedTiles = null;
            }
        } else {
            killed = [attacker];
        }
        for (const unit of killed) {
            this.getPlayer(unit.player).removeUnit(unit);
        }

        const winner = attackerWins ? attacker : defender;
        if (Math.random() < 0.5) winner.makeVeteran();

        attacker.movesLeft = attacker.typeId === 'bomber' ? 0 : Math.max(0, attacker.movesLeft - MOVE_FRAGS);

        this.getPlayer(defender.player).checkDefeat();
        return { attackerWins, attacker, defender, killed };
    }

    // A nuclear attack destroys every unit around the target and halves the cities there
    detonateNuke(nuke, x, y) {
        const killed = [nuke];
        for (const [dx, dy] of [[0, 0], ...NEIGHBORS]) {
            const tx = x + dx;
            const ty = y + dy;
            killed.push(...this.getUnitsAt(tx, ty));
            const city = this.getCityAt(tx, ty);
            if (city) {
                city.size = Math.max(1, Math.floor(city.size / 2));
                city.workedTiles = null;
            }
        }
        for (const unit of killed) {
            this.getPlayer(unit.player).removeUnit(unit);
        }
        return { attackerWins: true, attacker: nuke, defender: null, killed, nuclear: true };
    }

    // ============================================
    // GOVERNMENT
    // ============================================

    startRevolution(player, governmentId) {
        if (player.hasActiveWonder('pyramids') || player.hasActiveWonder('united_nations')) {
            player.government = governmentId;
            player.clampRates();
            return;
        }
        player.government = 'anarchy';
        player.revolutionTurns = ANARCHY_TURNS;
        player.nextGovernment = governmentId;
    }

    grantFreeTech(player) {
        const available = getAvailableResearch(player);
        if (available.length === 0) return null;
        const tech = available.find(t => t.id === player.currentResearch) ||
            available[Math.floor(Math.random() * available.length)];
        player.discoverTech(tech.id);
        if (player.currentResearch === tech.id) player.currentResearch = null;
        return tech;
    }

    // ============================================
    // TURN PROCESSING
    // ============================================

    // Process every player's turn and return the events the human player needs to see
    step() {
        const events = [];
        this.turnNumber++;

        for (const player of this.players.filter(p => !p.checkDefeat())) {
            const playerEvents = this.processPlayerTurn(player);
            if (player.isHuman) {
                events.push(...playerEvents);
            }
        }

        return events;
    }

    processPlayerTurn(player) {
        const events = [];
        const message = (text) => events.push({ type: GameEventType.MESSAGE, message: text });

        if (player.revolutionTurns > 0) {
            player.revolutionTurns--;
            if (player.revolutionTurns === 0) {
                player.government = player.nextGovernment;
                player.nextGovernment = null;
                player.clampRates();
                events.push({ type: GameEventType.GOVERNMENT_CHANGED, government: player.gov.name });
            }
        }

        for (const city of [...player.cities]) {
            events.push(...processCityTurn(city, player));
        }

        for (const sold of sellBuildingsToCoverDebt(player)) {
            message(`${sold.city.name} sells its ${sold.name} to pay the bills.`);
        }

        if (player.gov.fallsInDisorder && player.cities.some(c => c.disorderTurns >= 2)) {
            this.startRevolution(player, 'democracy');
            message('Civil disorder brings down the government. Anarchy!');
        }

        const discoveredTech = checkTechDiscovery(player);
        if (discoveredTech) {
            events.push({ type: GameEventType.TECH_DISCOVERED, tech: discoveredTech });
        }

        if (player.hasActiveWonder('great_library')) {
            const others = this.players.filter(p => p !== player && p.alive);
            for (const techId of Object.keys(TECHNOLOGIES)) {
                if (!player.hasTech(techId) && others.filter(p => p.hasTech(techId)).length >= 2) {
                    player.discoverTech(techId);
                    message(`The Great Library teaches us ${TECHNOLOGIES[techId].name}.`);
                    break;
                }
            }
        }

        if (!player.currentResearch) {
            if (player.isHuman) {
                events.push({ type: GameEventType.NO_RESEARCH });
            } else {
                player.currentResearch = chooseResearch(player);
            }
        }

        for (const unit of player.units) {
            const completed = unit.processBuildingTurn();
            if (completed) {
                this.completeTileImprovement(unit.x, unit.y, completed);
                events.push({
                    type: GameEventType.IMPROVEMENT_COMPLETE,
                    unit,
                    improvement: completed,
                    x: unit.x,
                    y: unit.y,
                });
            }
        }

        for (const lost of this.loseStrandedUnits(player)) {
            message(`Our ${lost.name} was lost at sea.`);
        }

        for (const unit of player.units) {
            if (unit.status !== UnitStatus.BUILDING) {
                unit.resetMoves(this.maxMovesFor(unit, player));
            }
        }

        if (!player.isHuman) {
            processAITurn(player, this);
        }

        return events;
    }

    completeTileImprovement(x, y, improvement) {
        const terrain = this.getTerrainAt(x, y);
        if (improvement === IMPROVEMENT.IRRIGATION && getIrrigationTransform(terrain) !== null) {
            this.setTerrainAt(x, y, getIrrigationTransform(terrain));
        } else if (improvement === IMPROVEMENT.MINE && getMineTransform(terrain) !== null) {
            this.setTerrainAt(x, y, getMineTransform(terrain));
            this.clearImprovementAt(x, y, IMPROVEMENT.IRRIGATION);
        } else {
            if (improvement === IMPROVEMENT.MINE) this.clearImprovementAt(x, y, IMPROVEMENT.IRRIGATION);
            if (improvement === IMPROVEMENT.IRRIGATION) this.clearImprovementAt(x, y, IMPROVEMENT.MINE);
            this.setImprovementAt(x, y, improvement);
        }
    }

    maxMovesFor(unit, player) {
        let moves = unit.maxMoves;
        if (unit.domain === 'sea') {
            if (player.hasActiveWonder('lighthouse')) moves += MOVE_FRAGS;
            if (player.hasActiveWonder('magellans')) moves += MOVE_FRAGS;
        }
        return moves;
    }

    // Aircraft run out of fuel away from a city or carrier, and triremes that end their
    // turn out of sight of land may sink. Returns the lost units.
    loseStrandedUnits(player) {
        const lost = [];
        for (const unit of player.units) {
            const inCity = this.getCityAt(unit.x, unit.y)?.player === player.id;
            if (unit.domain === 'air') {
                const onCarrier = this.getUnitsAt(unit.x, unit.y).some(u => u.player === player.id && u.type.carriesAir);
                if (inCity || onCarrier) {
                    unit.fuelLeft = unit.type.fuel;
                } else if (--unit.fuelLeft <= 0) {
                    lost.push(unit);
                }
            } else if (unit.type.coastal && !inCity && !this.isNextToLand(unit.x, unit.y) &&
                       !player.hasActiveWonder('lighthouse') && Math.random() < 0.5) {
                lost.push(unit, ...this.getUnitsAt(unit.x, unit.y).filter(u => u.player === player.id && u.domain === 'land'));
            }
        }
        for (const unit of lost) {
            player.removeUnit(unit);
        }
        return lost.filter(u => u.domain !== 'land');
    }

    // Year calculation (Civ 1 style)
    getYear() {
        const turn = this.turnNumber;
        const baseYear = -4000;
        let year;

        if (turn <= 250) {
            year = baseYear + (turn - 1) * 20;
        } else if (turn <= 300) {
            year = baseYear + 250 * 20 + (turn - 251) * 10;
        } else if (turn <= 400) {
            year = baseYear + 250 * 20 + 50 * 10 + (turn - 301) * 5;
        } else {
            year = baseYear + 250 * 20 + 50 * 10 + 100 * 5 + (turn - 401) * 2;
        }

        if (year < 0) {
            return Math.abs(year) + ' BC';
        } else if (year === 0) {
            return '1 AD';
        } else {
            return year + ' AD';
        }
    }

    setupGame(humanNationId, numAIPlayers = 3) {
        this.addPlayer(humanNationId, true);

        const availableNations = getNationIds().filter(n => n !== humanNationId);
        for (let i = 0; i < numAIPlayers && i < availableNations.length; i++) {
            const randomIndex = Math.floor(Math.random() * availableNations.length);
            const nationId = availableNations.splice(randomIndex, 1)[0];
            this.addPlayer(nationId, false);
        }
    }

    toJSON() {
        return {
            terrain: this.terrain,
            resources: this.resources,
            improvements: this.improvements,
            players: this.players.map(p => p.toJSON()),
            currentPlayerIndex: this.currentPlayerIndex,
            turnNumber: this.turnNumber,
            humanPlayerIndex: this.humanPlayerIndex,
            nextCityId: this.nextCityId,
        };
    }

    static fromJSON(data) {
        const world = new World();
        world.terrain = data.terrain;
        world.resources = data.resources;
        world.improvements = data.improvements;
        world.players = data.players.map(p => Player.fromJSON(p));
        world.currentPlayerIndex = data.currentPlayerIndex;
        world.turnNumber = data.turnNumber;
        world.humanPlayerIndex = data.humanPlayerIndex;
        world.nextCityId = data.nextCityId;
        return world;
    }
}

export const world = new World();
