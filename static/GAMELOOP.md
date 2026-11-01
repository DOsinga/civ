# Game Loop - Civilization 1 Web Clone

## Overview

The game loop processes each turn by iterating through all players, updating their cities, and handling discoveries. This design works for both human and AI players.

---

## Turn Structure

```
EndTurn:
1. For each player (human first, then AI):
   a. Process all cities → yields (food, production, trade, gold, science)
   b. Check for production completion → spawn units/buildings
   c. Check for city growth → increase size
   d. Accumulate science points
   e. Reset unit movement points

2. For AI players specifically:
   a. Decide unit moves
   b. Execute unit actions

3. Check for tech discovery:
   a. If player.science >= techCost → discover tech
   b. Show discovery dialog
   c. Ask what to research next

4. Advance turn counter
5. Update year display
```

---

## City Processing (per city, per turn)

### Input: City state
### Output: Updated city + player resources

```javascript
processCityTurn(city, player):
    yields = calculateCityYields(city)

    // 1. FOOD
    city.food += yields.foodNet  // foodNet = food - consumption
    if city.food >= getFoodToGrow(city.size):
        growCity(city)  // size++, reset food (granary keeps 50%)
    else if city.food < 0:
        starveCity(city)  // size--, release worker

    // 2. PRODUCTION (if not in unrest)
    if not inUnrest:
        city.production.progress += yields.production
        if city.production.progress >= productionCost:
            completeProduction(city, player)  // spawn unit or add improvement

    // 3. TRADE → split into gold + science
    gold = floor(yields.trade * player.taxRate)
    science = floor(yields.trade * player.scienceRate)
    // luxuryRate = 1 - taxRate - scienceRate (for happiness)

    player.gold += gold
    player.science += science

    // 4. MAINTENANCE
    for improvement in city.improvements:
        player.gold -= improvement.maintenance
```

---

## Science & Discovery

### Accumulation
- Trade from cities is split: tax rate → gold, science rate → science
- Default rates: 50% tax, 50% science (adjustable by player)
- Science points accumulate in `player.science`

### Tech Discovery
```javascript
checkTechDiscovery(player):
    if player.currentResearch == null:
        return  // nothing being researched

    tech = TECHNOLOGIES[player.currentResearch]
    if player.science >= tech.cost:
        // Discover!
        player.discoveredTechs.push(player.currentResearch)
        player.science -= tech.cost  // or reset to 0?

        // Unlock units/improvements
        unlockTechBenefits(player, tech)

        // Show dialog
        showTechDiscoveredDialog(tech)

        // Ask what to research next
        player.currentResearch = null
        showChooseResearchDialog(player)
```

### Available Technologies
```javascript
getAvailableResearch(player):
    return TECHNOLOGIES.filter(tech =>
        !player.discoveredTechs.includes(tech.id) &&
        tech.requires.every(req => player.discoveredTechs.includes(req))
    )
```

---

## Production Completion

When `city.production.progress >= cost`:

### Units
```javascript
completeUnitProduction(city, player):
    unitType = city.production.type
    unit = player.createUnit(unitType, city.x, city.y)
    city.production = { type: null, progress: 0 }
    showUnitCompletedDialog(city, unit)
```

### Improvements
```javascript
completeImprovementProduction(city, player):
    impType = city.production.type
    city.improvements.push(impType)
    city.production = { type: null, progress: 0 }
    showImprovementCompletedDialog(city, impType)
```

---

## City Growth

```javascript
growCity(city):
    // Check aqueduct requirement for size 10+
    if city.size >= 10 && !city.improvements.includes('aqueduct'):
        city.food = getFoodToGrow(city.size)  // cap
        return

    city.size++

    // Granary keeps 50% food
    if city.improvements.includes('granary'):
        city.food = floor(getFoodToGrow(city.size) / 2)
    else:
        city.food = 0

    // Auto-assign new worker to best tile
    autoAssignWorker(city)
```

---

## AI Turn Processing

```javascript
processAITurn(player):
    // 1. Choose research if none selected
    if player.currentResearch == null:
        available = getAvailableResearch(player)
        player.currentResearch = pickBestTech(available, player.personality)

    // 2. Manage city production
    for city in player.cities:
        if city.production.type == null:
            city.production.type = decideCityProduction(city, player)

    // 3. Move units
    for unit in player.units:
        if unit.movesLeft > 0:
            decideAndExecuteUnitAction(unit, player)
```

---

## Files

| File | Responsibility |
|------|----------------|
| `game.js` | `endTurn()` - main turn loop, calls other modules |
| `citymanagement.js` | `processCityTurn()`, yields, growth, production |
| `player.js` | Player state (gold, science, techs) |
| `tech.js` | (new) Technology definitions, research logic |
| `ai.js` | (future) AI decision making |

---

## Current State

### Implemented
- [x] `processCityTurn()` - food, production, gold, maintenance
- [x] `calculateCityYields()` - food, production, trade from worked tiles
- [x] `growCity()` / `starveCity()` - size changes
- [x] `completeProduction()` - spawns units/improvements
- [x] `calculateCityHappiness()` - happy/content/unhappy citizens
- [x] Player class with gold, science, discoveredTechs fields

### TODO
- [ ] Science accumulation from trade
- [ ] Tech discovery checking
- [ ] Choose research dialog
- [ ] Tech discovery dialog
- [ ] AI turn processing
- [ ] Tax/science rate slider

---

## Test Scenario (Thebes)

To test the full loop, set up Thebes with:
- **Size**: 3
- **Improvements**: `['granary']` only
- **Food**: 29 (needs 30 to grow, so 1 turn from growth)
- **Production**: settler at 39/40 shields (1 turn from completion)
- **Player science**: 9 (needs 10 for first tech, 1 turn from discovery)
- **Current research**: 'pottery' (cost 10)

This lets us test:
1. City growth (with granary keeping 50% food)
2. Unit completion (settler spawns)
3. Tech discovery (pottery discovered, choose next)
