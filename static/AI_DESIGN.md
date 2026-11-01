# AI Player Design

## Overview

The AI system handles non-human player decision making during their turns. Based on analysis of OpenCiv (C# port of original Civ 1), we implement similar patterns adapted for JavaScript.

## Reference: OpenCiv Implementation

From `/Users/douwe/checkout/OpenCiv`:
- **AI Logic**: `src/Game/Objects/Segment_25fb.cs` - main AI decision function
- **Combat**: `src/Game/Objects/Segment_29f3.cs` - combat resolution
- **Turn Processing**: `src/Game/Objects/CheckPlayerTurn.cs` - turn loop

## Architecture

```
world.js                    aiplayer.js
   │                            │
   │  processPlayerTurn()       │
   │         │                  │
   │         └──────────────────┼──> processAITurn(player)
   │                            │         │
   │                            │         ├── processUnitAI(unit)
   │                            │         │      ├── by AIRole
   │                            │         │      └── GoToDestination
   │                            │         └── (future: city production)
```

## Unit AI Roles (from OpenCiv)

```javascript
const AIRole = {
    SETTLER: 0,        // Found cities, build improvements
    LAND_ATTACK: 1,    // Offensive ground units
    DEFENSE: 2,        // Garrison and protect cities
    SEA_ATTACK: 3,     // Naval combat
    AIR_ATTACK: 4,     // Aircraft
    SEA_TRANSPORT: 5,  // Carry units
    CIVILIAN: 6,       // Diplomats, caravans
};
```

## AI Decision Logic (from OpenCiv F0_25fb_0c9d)

OpenCiv AI is **human-centric** - it specifically targets human player units:

1. **Find targets**: Loop through human player's units and cities
2. **Calculate distance**: Use shortest-path distance to each target
3. **Select closest**: Pick the nearest reachable target
4. **Set GoToDestination**: Track multi-turn movement path

```javascript
// Simplified from OpenCiv pattern
function selectTarget(unit, humanPlayer, world) {
    let bestTarget = null;
    let bestDistance = Infinity;

    // Check human units (prioritize settlers)
    for (const enemyUnit of humanPlayer.units) {
        const dist = getDistance(unit, enemyUnit);
        if (dist < bestDistance) {
            bestDistance = dist;
            bestTarget = { x: enemyUnit.x, y: enemyUnit.y, type: 'unit' };
        }
    }

    // Check human cities
    for (const city of humanPlayer.cities) {
        const dist = getDistance(unit, city);
        if (dist < bestDistance) {
            bestDistance = dist;
            bestTarget = { x: city.x, y: city.y, type: 'city' };
        }
    }

    return bestTarget;
}
```

## GoToDestination (Multi-turn Movement)

OpenCiv uses `GoToDestination` to track movement goals across turns:

```javascript
// Unit gains a destination field
unit.goToDestination = { x: targetX, y: targetY };

// Each turn, move one step toward destination
function processGoTo(unit, world) {
    if (!unit.goToDestination) return false;

    const { x: destX, y: destY } = unit.goToDestination;

    // Arrived?
    if (unit.x === destX && unit.y === destY) {
        unit.goToDestination = null;
        return false;
    }

    // Move toward destination
    return moveToward(unit, destX, destY, world);
}
```

## Combat System (from OpenCiv Segment_29f3)

### Strength Calculation

```javascript
// OpenCiv formula (simplified)
function calculateCombatStrength(unit, isAttacker, terrain, inCity) {
    const baseMultiplier = 8;  // OpenCiv uses * 8

    if (isAttacker) {
        return unit.attack * baseMultiplier;
    } else {
        let strength = unit.defense * baseMultiplier;

        // Terrain bonus
        const terrainBonus = getTerrainDefense(terrain);
        strength *= (1 + terrainBonus);

        // Fortification bonus (OpenCiv uses * 1.5 for fortified)
        if (unit.status === UnitStatus.FORTIFIED) {
            strength *= 1.5;
        }

        // City walls (OpenCiv uses * 1.5 for cities with walls)
        if (inCity && cityHasWalls) {
            strength *= 1.5;
        }

        return strength;
    }
}
```

### Combat Resolution

```javascript
// Round-based combat (matches our current implementation)
function resolveCombat(attacker, defender, terrain) {
    const attackStrength = calculateCombatStrength(attacker, true, terrain, false);
    const defenseStrength = calculateCombatStrength(defender, false, terrain, inCity);

    let attackerHP = attacker.hp;
    let defenderHP = defender.hp;

    while (attackerHP > 0 && defenderHP > 0) {
        const total = attackStrength + defenseStrength;
        if (Math.random() < attackStrength / total) {
            defenderHP--;
        } else {
            attackerHP--;
        }
    }

    return { attackerWins: defenderHP <= 0, attackerHP, defenderHP };
}
```

### Difficulty Scaling (OpenCiv)

OpenCiv applies asymmetric bonuses based on difficulty:

```javascript
// Human attacking AI: attack *= (difficulty + 1)
// AI attacking human: attack /= 2

function applyDifficultyModifier(strength, attackerIsHuman, difficulty) {
    if (attackerIsHuman) {
        return strength * (difficulty + 1);
    } else {
        return strength / 2;
    }
}
```

## Continent-Based Strategy (OpenCiv)

OpenCiv tracks military capability per continent:

```javascript
class PlayerContinent {
    constructor() {
        this.cityCount = 0;
        this.totalAttack = 0;
        this.totalDefense = 0;
    }
}

// Aggregated each turn from all units on continent
function updateContinentStats(player, world) {
    // Reset
    player.continents = {};

    for (const unit of player.units) {
        const continent = world.getContinentAt(unit.x, unit.y);
        if (!player.continents[continent]) {
            player.continents[continent] = new PlayerContinent();
        }
        player.continents[continent].totalAttack += unit.attack;
        player.continents[continent].totalDefense += unit.defense;
    }
}
```

## Implementation Plan

### Phase 1: Current (Basic AI) ✓
- [x] Simple nearest-enemy targeting
- [x] Greedy movement toward target
- [x] Basic combat resolution

### Phase 2: OpenCiv-style AI
- [ ] Add AIRole to unit definitions
- [ ] Implement GoToDestination for multi-turn movement
- [ ] Human-centric targeting (prioritize human player)
- [ ] Role-based behavior (settlers vs military)

### Phase 3: Enhanced Combat
- [ ] Difficulty-based modifiers
- [ ] City walls defense bonus
- [ ] Continental strategy tracking

### Phase 4: City AI
- [ ] Production decisions based on threats
- [ ] Build military if under attack
- [ ] Build infrastructure if safe

## API

```javascript
// aiplayer.js exports
export function processAITurn(player, world);
export function selectTarget(unit, world);
export function processGoTo(unit, world);
```
