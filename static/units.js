// Unit types and Unit class

export const UnitStatus = {
    WAITING_ORDERS: 'waiting',  // Has moves, needs player input
    DONE: 'done',               // Finished this turn (moved or skipped)
    FORTIFIED: 'fortified',     // Fortified until woken by click
    BUILDING: 'building',       // Settler building improvement (road/irrigation/mine)
    SENTRY: 'sentry',           // Riding on a ship until it reaches land
};

// Event types returned by world.step()
export const GameEventType = {
    CITY_BUILT: 'city_built',
    UNIT_BUILT: 'unit_built',
    TECH_DISCOVERED: 'tech_discovered',
    CITY_GREW: 'city_grew',
    CITY_STARVED: 'city_starved',
    IMPROVEMENT_COMPLETE: 'improvement_complete',
    NO_RESEARCH: 'no_research',
    COMBAT: 'combat',
    UNIT_DESTROYED: 'unit_destroyed',
    CITY_CAPTURED: 'city_captured',
    MESSAGE: 'message',
    GOVERNMENT_CHANGED: 'government_changed',
};

// Movement is counted in thirds so that a road costs 1/3 of a move
export const MOVE_FRAGS = 3;

// [id, name, attack, defense, moves, cost, requires, obsoleteBy, extra]
// The order matches the unit sprites in SP257.png: 20 per row, starting at row 10.
const UNIT_LIST = [
    ['settler', 'Settlers', 0, 1, 1, 40, null, null, { civilian: true, abilities: ['found_city', 'build_road', 'irrigate', 'mine'] }],
    ['militia', 'Militia', 1, 1, 1, 10, null, 'musketeer'],
    ['phalanx', 'Phalanx', 1, 2, 1, 20, 'bronze_working', 'musketeer'],
    ['legion', 'Legion', 3, 1, 1, 20, 'iron_working', 'musketeer'],
    ['musketeer', 'Musketeers', 2, 3, 1, 30, 'gunpowder', 'riflemen'],
    ['riflemen', 'Riflemen', 3, 5, 1, 30, 'conscription', null],
    ['cavalry', 'Cavalry', 2, 1, 2, 20, 'horseback_riding', 'musketeer'],
    ['knights', 'Knights', 4, 2, 2, 40, 'chivalry', 'armor'],
    ['catapult', 'Catapult', 6, 1, 1, 40, 'mathematics', 'cannon'],
    ['cannon', 'Cannon', 8, 1, 1, 40, 'metallurgy', 'artillery'],
    ['chariot', 'Chariot', 4, 1, 2, 40, 'wheel', 'knights'],
    ['armor', 'Armor', 10, 5, 3, 80, 'automobile', null],
    ['mech_inf', 'Mech. Inf.', 6, 6, 3, 50, 'labor_union', null],
    ['artillery', 'Artillery', 12, 2, 2, 60, 'robotics', null, { ignoresWalls: true }],
    ['fighter', 'Fighter', 4, 2, 10, 60, 'flight', null, { domain: 'air', fuel: 1 }],
    ['bomber', 'Bomber', 12, 1, 8, 120, 'advanced_flight', null, { domain: 'air', fuel: 2, ignoresWalls: true }],
    ['trireme', 'Trireme', 1, 0, 3, 40, 'map_making', 'sail', { domain: 'sea', capacity: 2, coastal: true }],
    ['sail', 'Sail', 1, 1, 3, 40, 'navigation', 'frigate', { domain: 'sea', capacity: 3 }],
    ['frigate', 'Frigate', 2, 2, 3, 40, 'magnetism', 'transport', { domain: 'sea', capacity: 4 }],
    ['ironclad', 'Ironclad', 4, 4, 4, 60, 'steam_engine', 'cruiser', { domain: 'sea' }],
    ['cruiser', 'Cruiser', 6, 6, 6, 80, 'combustion', null, { domain: 'sea' }],
    ['battleship', 'Battleship', 18, 12, 4, 160, 'steel', null, { domain: 'sea' }],
    ['submarine', 'Submarine', 8, 2, 3, 50, 'mass_production', null, { domain: 'sea' }],
    ['carrier', 'Carrier', 1, 12, 5, 160, 'advanced_flight', null, { domain: 'sea', carriesAir: 8 }],
    ['transport', 'Transport', 0, 3, 4, 50, 'industrialization', null, { domain: 'sea', capacity: 8 }],
    ['nuclear', 'Nuclear', 99, 0, 16, 160, 'rocketry', null, { domain: 'air', fuel: 1, nuclear: true, needsWonder: 'manhattan_project' }],
    ['diplomat', 'Diplomat', 0, 0, 2, 30, 'writing', null, { civilian: true }],
    ['caravan', 'Caravan', 0, 1, 1, 50, 'trade', null, { civilian: true, abilities: ['help_wonder'] }],
];

export const UNIT_TYPES = Object.fromEntries(
    UNIT_LIST.map(([id, name, attack, defense, movement, cost, requires, obsoleteBy, extra = {}], i) => [id, {
        name, attack, defense, movement, cost, requires, obsoleteBy,
        domain: 'land',
        civilian: false,
        capacity: 0,
        abilities: [],
        ...extra,
        spriteCol: i % 20,
        spriteRow: 10 + Math.floor(i / 20),
    }])
);

let nextUnitId = 1;

export class Unit {
    constructor(typeId, x, y, player = 0) {
        this.id = nextUnitId++;
        this.typeId = typeId;
        this.x = x;
        this.y = y;
        this.player = player;
        this.movesLeft = this.maxMoves;
        this.veteran = false;
        this.status = UnitStatus.WAITING_ORDERS;
        this.homeCity = null;
        this.buildingImprovement = null;
        this.buildingTurnsLeft = 0;
        this.fuelLeft = this.type.fuel || 0;
    }

    get type() {
        return UNIT_TYPES[this.typeId];
    }

    get name() {
        return this.type.name;
    }

    get attack() {
        return this.type.attack * (this.veteran ? 1.5 : 1);
    }

    get defense() {
        return this.type.defense * (this.veteran ? 1.5 : 1);
    }

    get maxMoves() {
        return this.type.movement * MOVE_FRAGS;
    }

    get cost() {
        return this.type.cost;
    }

    get domain() {
        return this.type.domain;
    }

    get isCivilian() {
        return this.type.civilian;
    }

    get spriteCol() {
        return this.type.spriteCol;
    }

    get spriteRow() {
        return this.type.spriteRow;
    }

    get abilities() {
        return this.type.abilities;
    }

    get movesText() {
        const whole = Math.floor(this.movesLeft / MOVE_FRAGS);
        const frac = this.movesLeft % MOVE_FRAGS;
        if (frac === 0) return `${whole}`;
        return whole > 0 ? `${whole} ${frac}/3` : `${frac}/3`;
    }

    hasAbility(ability) {
        return this.abilities.includes(ability);
    }

    canFoundCity() {
        return this.hasAbility('found_city');
    }

    canBuildRoad() {
        return this.hasAbility('build_road');
    }

    canIrrigate() {
        return this.hasAbility('irrigate');
    }

    canMine() {
        return this.hasAbility('mine');
    }

    isBuilding() {
        return this.status === UnitStatus.BUILDING;
    }

    startBuilding(improvement, turns) {
        this.buildingImprovement = improvement;
        this.buildingTurnsLeft = turns;
        this.status = UnitStatus.BUILDING;
        this.movesLeft = 0;
    }

    // Returns the finished improvement, or false while still working
    processBuildingTurn() {
        if (this.status !== UnitStatus.BUILDING) return false;
        this.buildingTurnsLeft--;
        if (this.buildingTurnsLeft <= 0) {
            const improvement = this.buildingImprovement;
            this.buildingImprovement = null;
            this.status = UnitStatus.WAITING_ORDERS;
            return improvement;
        }
        return false;
    }

    cancelBuilding() {
        if (this.status === UnitStatus.BUILDING) {
            this.buildingImprovement = null;
            this.buildingTurnsLeft = 0;
            this.status = UnitStatus.WAITING_ORDERS;
        }
    }

    canMove() {
        return this.movesLeft > 0;
    }

    resetMoves(maxMoves) {
        this.movesLeft = maxMoves;
        if (this.status === UnitStatus.DONE) {
            this.status = UnitStatus.WAITING_ORDERS;
        }
    }

    fortify() {
        this.status = UnitStatus.FORTIFIED;
        this.movesLeft = 0;
    }

    skip() {
        this.status = UnitStatus.DONE;
        this.movesLeft = 0;
    }

    wake() {
        if (this.status === UnitStatus.FORTIFIED || this.status === UnitStatus.SENTRY) {
            this.status = UnitStatus.WAITING_ORDERS;
        }
        if (this.status === UnitStatus.BUILDING) {
            this.cancelBuilding();
        }
    }

    makeVeteran() {
        this.veteran = true;
    }

    toJSON() {
        return {
            id: this.id,
            typeId: this.typeId,
            x: this.x,
            y: this.y,
            player: this.player,
            movesLeft: this.movesLeft,
            veteran: this.veteran,
            status: this.status,
            homeCity: this.homeCity,
            buildingImprovement: this.buildingImprovement,
            buildingTurnsLeft: this.buildingTurnsLeft,
            fuelLeft: this.fuelLeft,
        };
    }

    static fromJSON(data) {
        const unit = new Unit(data.typeId, data.x, data.y, data.player);
        Object.assign(unit, data);
        if (data.id >= nextUnitId) nextUnitId = data.id + 1;
        return unit;
    }
}

export function createUnit(typeId, x, y, player = 0) {
    return new Unit(typeId, x, y, player);
}
