// Player class - represents a civilization in the game

import { NATIONS, getNation, getNextCityName } from './nations.js';
import { Unit, createUnit } from './units.js';
import { IMPROVEMENTS } from './improvements.js';
import { GOVERNMENTS } from './government.js';

let nextPlayerId = 0;

export class Player {
    constructor(nationId, isHuman = false) {
        this.id = nextPlayerId++;
        this.nationId = nationId;
        this.leaderName = getNation(nationId).leader;
        this.isHuman = isHuman;
        this.units = [];
        this.cities = [];
        this.gold = 50;
        this.science = 0;
        this.discoveredTechs = [];
        this.currentResearch = null;
        this.government = 'despotism';
        this.rates = { tax: 4, lux: 0, sci: 6 };  // tenths of trade
        this.revolutionTurns = 0;
        this.nextGovernment = null;
        this.alive = true;
    }

    get gov() {
        return GOVERNMENTS[this.government];
    }

    // Under anarchy all trade becomes luxury
    get effectiveRates() {
        return this.government === 'anarchy' ? { tax: 0, lux: 10, sci: 0 } : this.rates;
    }

    get nation() {
        return getNation(this.nationId);
    }

    get name() {
        return this.nation?.name || 'Unknown';
    }

    get leader() {
        return this.nation?.leader || 'Unknown';
    }

    get color() {
        return this.nation?.color || '#FFFFFF';
    }

    get adjective() {
        return this.nation?.adjective || 'Unknown';
    }

    // Units
    addUnit(unit) {
        unit.player = this.id;
        this.units.push(unit);
        return unit;
    }

    createUnit(typeId, x, y) {
        const unit = createUnit(typeId, x, y, this.id);
        this.units.push(unit);
        return unit;
    }

    removeUnit(unit) {
        const idx = this.units.indexOf(unit);
        if (idx >= 0) {
            this.units.splice(idx, 1);
        }
    }

    getUnitsAt(x, y) {
        return this.units.filter(u => u.x === x && u.y === y);
    }

    // Cities
    addCity(city) {
        city.player = this.id;
        this.cities.push(city);
        return city;
    }

    removeCity(city) {
        const idx = this.cities.indexOf(city);
        if (idx >= 0) {
            this.cities.splice(idx, 1);
        }
    }

    getCityAt(x, y) {
        return this.cities.find(c => c.x === x && c.y === y);
    }

    getNextCityName() {
        return getNextCityName(this.nationId, this.cities);
    }

    // Technology
    hasTech(techId) {
        return this.discoveredTechs.includes(techId);
    }

    discoverTech(techId) {
        if (!this.discoveredTechs.includes(techId)) {
            this.discoveredTechs.push(techId);
        }
    }

    // Wonders

    hasWonder(wonderId) {
        return this.cities.some(c => c.improvements.includes(wonderId));
    }

    hasActiveWonder(wonderId) {
        const obsoleteBy = IMPROVEMENTS[wonderId].obsoleteBy;
        return this.hasWonder(wonderId) && !(obsoleteBy && this.hasTech(obsoleteBy));
    }

    get capital() {
        return this.cities.find(c => c.improvements.includes('palace')) || null;
    }

    // Science gets whatever tax and luxury leave over
    canSetRates(tax, lux) {
        const max = this.gov.maxRate / 10;
        const sci = 10 - tax - lux;
        return tax >= 0 && lux >= 0 && sci >= 0 && tax <= max && lux <= max && sci <= max;
    }

    setRates(tax, lux) {
        this.rates = { tax, lux, sci: 10 - tax - lux };
    }

    clampRates() {
        if (this.government === 'anarchy' || this.canSetRates(this.rates.tax, this.rates.lux)) return;
        const max = this.gov.maxRate / 10;
        this.setRates(10 - max, 0);
    }

    // Check if player is defeated
    checkDefeat() {
        if (this.cities.length === 0 && this.units.length === 0) {
            this.alive = false;
        }
        return !this.alive;
    }

    toJSON() {
        return { ...this, units: this.units.map(u => u.toJSON()) };
    }

    static fromJSON(data) {
        const player = Object.assign(new Player(data.nationId, data.isHuman), data, { units: data.units.map(u => Unit.fromJSON(u)) });
        nextPlayerId = Math.max(nextPlayerId, data.id + 1);
        return player;
    }
}
