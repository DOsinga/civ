// Technology definitions and research logic (the 67 Civ 1 advances)

const TECH_LIST = [
    ['advanced_flight', 'Advanced Flight', ['flight', 'electricity']],
    ['alphabet', 'Alphabet', []],
    ['astronomy', 'Astronomy', ['mysticism', 'mathematics']],
    ['atomic_theory', 'Atomic Theory', ['theory_of_gravity', 'physics']],
    ['automobile', 'Automobile', ['combustion', 'steel']],
    ['banking', 'Banking', ['trade', 'the_republic']],
    ['bridge_building', 'Bridge Building', ['iron_working', 'construction']],
    ['bronze_working', 'Bronze Working', []],
    ['ceremonial_burial', 'Ceremonial Burial', []],
    ['chemistry', 'Chemistry', ['university', 'medicine']],
    ['chivalry', 'Chivalry', ['feudalism', 'horseback_riding']],
    ['code_of_laws', 'Code of Laws', ['alphabet']],
    ['combustion', 'Combustion', ['refining', 'explosives']],
    ['communism', 'Communism', ['philosophy', 'industrialization']],
    ['computers', 'Computers', ['mathematics', 'electronics']],
    ['conscription', 'Conscription', ['the_republic', 'explosives']],
    ['construction', 'Construction', ['masonry', 'currency']],
    ['currency', 'Currency', ['bronze_working']],
    ['democracy', 'Democracy', ['philosophy', 'literacy']],
    ['electricity', 'Electricity', ['metallurgy', 'magnetism']],
    ['electronics', 'Electronics', ['engineering', 'electricity']],
    ['engineering', 'Engineering', ['wheel', 'construction']],
    ['explosives', 'Explosives', ['gunpowder', 'chemistry']],
    ['feudalism', 'Feudalism', ['masonry', 'monarchy']],
    ['flight', 'Flight', ['combustion', 'physics']],
    ['fusion_power', 'Fusion Power', ['nuclear_power', 'superconductors']],
    ['genetic_engineering', 'Genetic Engineering', ['medicine', 'the_corporation']],
    ['gunpowder', 'Gunpowder', ['invention', 'iron_working']],
    ['horseback_riding', 'Horseback Riding', []],
    ['industrialization', 'Industrialization', ['railroad', 'banking']],
    ['invention', 'Invention', ['engineering', 'literacy']],
    ['iron_working', 'Iron Working', ['bronze_working']],
    ['labor_union', 'Labor Union', ['mass_production', 'communism']],
    ['literacy', 'Literacy', ['writing', 'code_of_laws']],
    ['magnetism', 'Magnetism', ['navigation', 'physics']],
    ['map_making', 'Map Making', ['alphabet']],
    ['masonry', 'Masonry', []],
    ['mass_production', 'Mass Production', ['automobile', 'the_corporation']],
    ['mathematics', 'Mathematics', ['alphabet', 'masonry']],
    ['medicine', 'Medicine', ['philosophy', 'trade']],
    ['metallurgy', 'Metallurgy', ['gunpowder', 'university']],
    ['monarchy', 'Monarchy', ['ceremonial_burial', 'code_of_laws']],
    ['mysticism', 'Mysticism', ['ceremonial_burial']],
    ['navigation', 'Navigation', ['map_making', 'astronomy']],
    ['nuclear_fission', 'Nuclear Fission', ['mass_production', 'atomic_theory']],
    ['nuclear_power', 'Nuclear Power', ['nuclear_fission', 'electronics']],
    ['philosophy', 'Philosophy', ['mysticism', 'literacy']],
    ['physics', 'Physics', ['mathematics', 'navigation']],
    ['plastics', 'Plastics', ['refining', 'space_flight']],
    ['pottery', 'Pottery', []],
    ['railroad', 'Railroad', ['steam_engine', 'bridge_building']],
    ['recycling', 'Recycling', ['mass_production', 'democracy']],
    ['refining', 'Refining', ['chemistry', 'the_corporation']],
    ['religion', 'Religion', ['philosophy', 'writing']],
    ['robotics', 'Robotics', ['plastics', 'computers']],
    ['rocketry', 'Rocketry', ['advanced_flight', 'electronics']],
    ['space_flight', 'Space Flight', ['computers', 'rocketry']],
    ['steam_engine', 'Steam Engine', ['physics', 'invention']],
    ['steel', 'Steel', ['metallurgy', 'industrialization']],
    ['superconductors', 'Superconductors', ['plastics', 'mass_production']],
    ['the_corporation', 'The Corporation', ['banking', 'industrialization']],
    ['the_republic', 'The Republic', ['code_of_laws', 'literacy']],
    ['wheel', 'The Wheel', []],
    ['theory_of_gravity', 'Theory of Gravity', ['astronomy', 'university']],
    ['trade', 'Trade', ['currency', 'code_of_laws']],
    ['university', 'University', ['mathematics', 'philosophy']],
    ['writing', 'Writing', ['alphabet']],
];

export const TECHNOLOGIES = Object.fromEntries(
    TECH_LIST.map(([id, name, requires]) => [id, {
        name,
        requires,
        enables: TECH_LIST.filter(([, , reqs]) => reqs.includes(id)).map(([otherId]) => otherId),
    }])
);

export function getAvailableResearch(player) {
    return Object.entries(TECHNOLOGIES)
        .filter(([id, tech]) => !player.hasTech(id) && tech.requires.every(req => player.hasTech(req)))
        .map(([id, tech]) => ({ id, ...tech }));
}

// Each advance costs 10 bulbs more than the previous one
export function getTechCost(player) {
    return 10 * (player.discoveredTechs.length + 1);
}

export function checkTechDiscovery(player) {
    if (!player.currentResearch) return null;

    const cost = getTechCost(player);
    if (player.science < cost) return null;

    player.science -= cost;
    const id = player.currentResearch;
    player.discoverTech(id);
    player.currentResearch = null;
    return { id, ...TECHNOLOGIES[id] };
}
