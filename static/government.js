// Governments (Civ 1 rules)
//
// maxRate:        highest tax, luxury or science rate allowed
// tilePenalty:    tiles producing more than 2 of anything lose 1
// tradeBonus:     +1 trade on tiles that already produce trade
// celebrationTrade: +1 trade per trading tile while celebrating
// waste/wastePerTile: trade lost to corruption, in percent, plus percent per tile from the palace
// freeUnits:      units each city supports without paying shields
// martialLaw:     how many units in a city can each make one unhappy citizen content
// unhappyAbroad:  unhappy citizens caused by each military unit away from home
// settlerFood:    food each settler eats from its home city
// empireBase:     number of cities before the empire size makes citizens unhappy

export const GOVERNMENTS = {
    anarchy: {
        name: 'Anarchy', requires: null, maxRate: 0, tilePenalty: true,
        waste: 25, wastePerTile: 2, freeUnits: 3, martialLaw: 100, settlerFood: 1, empireBase: 9,
    },
    despotism: {
        name: 'Despotism', requires: null, maxRate: 60, tilePenalty: true,
        waste: 37, wastePerTile: 4, freeUnits: 3, martialLaw: 100, settlerFood: 1, empireBase: 10,
    },
    monarchy: {
        name: 'Monarchy', requires: 'monarchy', maxRate: 70, celebrationTrade: true,
        waste: 15, wastePerTile: 2, freeUnits: 0, martialLaw: 3, settlerFood: 1, empireBase: 11,
    },
    communism: {
        name: 'Communism', requires: 'communism', maxRate: 80, celebrationTrade: true,
        waste: 20, wastePerTile: 0, freeUnits: 0, martialLaw: 100, settlerFood: 1, empireBase: 12,
    },
    republic: {
        name: 'Republic', requires: 'the_republic', maxRate: 80, tradeBonus: true, rapture: true,
        waste: 15, wastePerTile: 2, freeUnits: 0, martialLaw: 0, unhappyAbroad: 1, settlerFood: 2, empireBase: 13,
    },
    democracy: {
        name: 'Democracy', requires: 'democracy', maxRate: 90, tradeBonus: true, rapture: true, fallsInDisorder: true,
        waste: 0, wastePerTile: 0, freeUnits: 0, martialLaw: 0, unhappyAbroad: 2, settlerFood: 2, empireBase: 14,
    },
};

export const ANARCHY_TURNS = 2;

export function getAvailableGovernments(player) {
    const anyGovernment = player.hasActiveWonder('pyramids') || player.hasActiveWonder('united_nations');
    return Object.entries(GOVERNMENTS)
        .filter(([id, gov]) => id !== 'anarchy' && (anyGovernment || !gov.requires || player.hasTech(gov.requires)))
        .map(([id, gov]) => ({ id, ...gov }));
}
