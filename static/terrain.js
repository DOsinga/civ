// Terrain type constants and data (Civ 1 rules)

// Tile improvements (bit flags, can be combined)
export const IMPROVEMENT = {
    NONE: 0,
    ROAD: 1,
    IRRIGATION: 2,
    MINE: 4,
    RAILROAD: 8,
};

export const RAILROAD_TURNS = 3;

export const TERRAIN = {
    OCEAN: 0,
    GRASSLAND: 1,
    PLAINS: 2,
    DESERT: 3,
    FOREST: 4,
    HILLS: 5,
    MOUNTAINS: 6,
    TUNDRA: 7,
    ARCTIC: 8,
    SWAMP: 9,
    JUNGLE: 10,
};

export const RESOURCE = {
    NONE: 0,
    OASIS: 1,
    HORSES: 2,
    GRASSLAND_SHIELD: 3,
    COAL: 4,
    GOLD: 5,
    SEALS: 6,
    TUNDRA_GAME: 7,
    FISH: 8,
    GAME: 9,
    GEMS: 10,
    OIL: 11,
};

// Bonus yields [food, shields, trade]
export const RESOURCE_DATA = {
    [RESOURCE.OASIS]:            { terrain: TERRAIN.DESERT,    bonus: [3, 0, 0], sprite: 'resource/oasis', name: 'Oasis' },
    [RESOURCE.HORSES]:           { terrain: TERRAIN.PLAINS,    bonus: [0, 2, 0], sprite: 'resource/horses', name: 'Horses' },
    [RESOURCE.TUNDRA_GAME]:      { terrain: TERRAIN.TUNDRA,    bonus: [2, 0, 0], sprite: 'resource/tundra_game', name: 'Game' },
    [RESOURCE.GRASSLAND_SHIELD]: { terrain: TERRAIN.GRASSLAND, bonus: [0, 1, 0], sprite: 'resource/grassland_shield', name: 'Resources' },
    [RESOURCE.GOLD]:             { terrain: TERRAIN.MOUNTAINS, bonus: [0, 0, 6], sprite: 'resource/gold', name: 'Gold' },
    [RESOURCE.GAME]:             { terrain: TERRAIN.FOREST,    bonus: [2, 0, 0], sprite: 'resource/game', name: 'Game' },
    [RESOURCE.SEALS]:            { terrain: TERRAIN.ARCTIC,    bonus: [2, 0, 0], sprite: 'resource/seals', name: 'Seals' },
    [RESOURCE.COAL]:             { terrain: TERRAIN.HILLS,     bonus: [0, 2, 0], sprite: 'resource/coal', name: 'Coal' },
    [RESOURCE.GEMS]:             { terrain: TERRAIN.JUNGLE,    bonus: [0, 0, 4], sprite: 'resource/gems', name: 'Gems' },
    [RESOURCE.FISH]:             { terrain: TERRAIN.OCEAN,     bonus: [2, 0, 0], sprite: 'resource/fish', name: 'Fish' },
    [RESOURCE.OIL]:              { terrain: TERRAIN.SWAMP,     bonus: [0, 4, 0], sprite: 'resource/oil', name: 'Oil' },
};

export const TERRAIN_RESOURCE = Object.fromEntries(
    Object.entries(RESOURCE_DATA).map(([resource, data]) => [data.terrain, Number(resource)])
);

// irrigate: food bonus, or a terrain the tile turns into. mine: shield bonus, or a terrain.
// Times are in settler turns.
export const TERRAIN_DATA = {
    [TERRAIN.OCEAN]:     { name: 'Ocean',     color: '#1a5276', yields: [1, 0, 2], move: 1, defense: 0 },
    [TERRAIN.GRASSLAND]: { name: 'Grassland', color: '#27ae60', yields: [2, 0, 0], move: 1, defense: 0,   roadTrade: true, road: 2, irrigate: 1, irrigateTime: 5, mine: TERRAIN.FOREST, mineTime: 10 },
    [TERRAIN.PLAINS]:    { name: 'Plains',    color: '#f4d03f', yields: [1, 1, 0], move: 1, defense: 0,   roadTrade: true, road: 2, irrigate: 1, irrigateTime: 5, mine: TERRAIN.FOREST, mineTime: 15 },
    [TERRAIN.DESERT]:    { name: 'Desert',    color: '#f5b041', yields: [0, 1, 0], move: 1, defense: 0,   roadTrade: true, road: 2, irrigate: 1, irrigateTime: 5, mine: 1, mineTime: 5 },
    [TERRAIN.FOREST]:    { name: 'Forest',    color: '#196f3d', yields: [1, 2, 0], move: 2, defense: 0.5, road: 4, irrigate: TERRAIN.PLAINS, irrigateTime: 5 },
    [TERRAIN.HILLS]:     { name: 'Hills',     color: '#7d6608', yields: [1, 0, 0], move: 2, defense: 1.0, road: 4, irrigate: 1, irrigateTime: 10, mine: 3, mineTime: 10 },
    [TERRAIN.MOUNTAINS]: { name: 'Mountains', color: '#5d6d7e', yields: [0, 1, 0], move: 3, defense: 2.0, road: 6, mine: 1, mineTime: 10 },
    [TERRAIN.TUNDRA]:    { name: 'Tundra',    color: '#aeb6bf', yields: [1, 0, 0], move: 1, defense: 0,   road: 2 },
    [TERRAIN.ARCTIC]:    { name: 'Arctic',    color: '#ecf0f1', yields: [0, 0, 0], move: 2, defense: 0,   road: 4 },
    [TERRAIN.SWAMP]:     { name: 'Swamp',     color: '#1e8449', yields: [1, 0, 0], move: 2, defense: 0.5, road: 4, irrigate: TERRAIN.GRASSLAND, irrigateTime: 15, mine: TERRAIN.FOREST, mineTime: 15 },
    [TERRAIN.JUNGLE]:    { name: 'Jungle',    color: '#145a32', yields: [1, 0, 0], move: 2, defense: 0.5, road: 4, irrigate: TERRAIN.GRASSLAND, irrigateTime: 15, mine: TERRAIN.FOREST, mineTime: 15 },
};

// A river adds +1 trade and +50% defense to the tile it runs through.
export const RIVER_DEFENSE = 0.5;

export function getTerrainName(type) {
    return TERRAIN_DATA[type]?.name || 'Unknown';
}

export function getTerrainColor(type) {
    return TERRAIN_DATA[type]?.color || '#000';
}

export function getMinimapColor(type) {
    return type === TERRAIN.OCEAN ? '#0000aa' : '#00aa00';
}

export function getTerrainYields(type) {
    return TERRAIN_DATA[type].yields;
}

export function getTerrainDefense(type) {
    return TERRAIN_DATA[type].defense;
}

export function getTerrainMoveCost(type) {
    return TERRAIN_DATA[type].move;
}

export function getResourceForTerrain(terrainType) {
    return TERRAIN_RESOURCE[terrainType] || RESOURCE.NONE;
}

export function getResourceBonus(resourceType) {
    return RESOURCE_DATA[resourceType]?.bonus || [0, 0, 0];
}

export function getResourceName(resourceType) {
    return RESOURCE_DATA[resourceType]?.name || '';
}

export function canIrrigate(terrainType) {
    return TERRAIN_DATA[terrainType].irrigate !== undefined;
}

export function canMine(terrainType) {
    return TERRAIN_DATA[terrainType].mine !== undefined;
}

// Irrigating forest, swamp or jungle clears it instead of adding irrigation
export function getIrrigationTransform(terrainType) {
    const data = TERRAIN_DATA[terrainType];
    return data.irrigateTime && !irrigationGivesFood(terrainType) ? data.irrigate : null;
}

// Mining grassland, plains, swamp or jungle plants a forest instead of a mine
export function getMineTransform(terrainType) {
    const data = TERRAIN_DATA[terrainType];
    return data.mineTime && !mineGivesShields(terrainType) ? data.mine : null;
}

export function irrigationGivesFood(terrainType) {
    return [TERRAIN.GRASSLAND, TERRAIN.PLAINS, TERRAIN.DESERT, TERRAIN.HILLS].includes(terrainType);
}

function mineGivesShields(terrainType) {
    return [TERRAIN.DESERT, TERRAIN.HILLS, TERRAIN.MOUNTAINS].includes(terrainType);
}

// [food, shields, trade] that improvements add to a tile
export function getImprovementBonus(terrainType, improvements) {
    const data = TERRAIN_DATA[terrainType];
    let food = 0;
    let shields = 0;
    let trade = 0;

    if ((improvements & IMPROVEMENT.IRRIGATION) && irrigationGivesFood(terrainType)) {
        food += data.irrigate;
    }
    if ((improvements & IMPROVEMENT.MINE) && mineGivesShields(terrainType)) {
        shields += data.mine;
    }
    if ((improvements & IMPROVEMENT.ROAD) && data.roadTrade) {
        trade += 1;
    }

    return [food, shields, trade];
}

export function getImprovementTurns(terrainType, improvementType) {
    const data = TERRAIN_DATA[terrainType];
    if (improvementType === IMPROVEMENT.ROAD) return data.road || 0;
    if (improvementType === IMPROVEMENT.RAILROAD) return RAILROAD_TURNS;
    if (improvementType === IMPROVEMENT.IRRIGATION) return data.irrigateTime || 0;
    if (improvementType === IMPROVEMENT.MINE) return data.mineTime || 0;
    return 0;
}
