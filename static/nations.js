// Nations/Civilizations data
// Based on original Civ 1

export const NATIONS = {
    romans: {
        name: 'Romans',
        adjective: 'Roman',
        leader: 'Caesar',
        color: '#FFFFFF',
        cities: [
            'Rome', 'Caesarea', 'Pompeii', 'Neapolis', 'Ravenna',
            'Antium', 'Tarentum', 'Veii', 'Mediolanum', 'Aquileia',
            'Hispalis', 'Brundisium', 'Syracusae', 'Messana', 'Panormus',
        ],
    },
    babylonians: {
        name: 'Babylonians',
        adjective: 'Babylonian',
        leader: 'Hammurabi',
        color: '#40E0D0',
        cities: [
            'Babylon', 'Ur', 'Nineveh', 'Ashur', 'Ellipi',
            'Akkad', 'Eridu', 'Kish', 'Nippur', 'Lagash',
            'Sippar', 'Larsa', 'Isin', 'Umma', 'Susa',
        ],
    },
    germans: {
        name: 'Germans',
        adjective: 'German',
        leader: 'Frederick',
        color: '#4040E0',
        cities: [
            'Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt',
            'Leipzig', 'Dresden', 'Bonn', 'Konigsberg', 'Stuttgart',
            'Hannover', 'Bremen', 'Dusseldorf', 'Nuremberg', 'Vienna',
        ],
    },
    egyptians: {
        name: 'Egyptians',
        adjective: 'Egyptian',
        leader: 'Ramesses',
        color: '#E0E000',
        cities: [
            'Thebes', 'Memphis', 'Alexandria', 'Giza', 'Heliopolis',
            'Pi-Ramesses', 'Elephantine', 'Edfu', 'Abydos', 'Avaris',
            'Amarna', 'Karnak', 'Luxor', 'Aswan', 'Buto',
        ],
    },
    americans: {
        name: 'Americans',
        adjective: 'American',
        leader: 'Lincoln',
        color: '#00E000',
        cities: [
            'Washington', 'New York', 'Los Angeles', 'Chicago', 'Philadelphia',
            'Boston', 'Atlanta', 'San Francisco', 'Detroit', 'Seattle',
            'Dallas', 'Houston', 'Denver', 'Miami', 'New Orleans',
        ],
    },
    greeks: {
        name: 'Greeks',
        adjective: 'Greek',
        leader: 'Alexander',
        color: '#E08000',
        cities: [
            'Athens', 'Sparta', 'Corinth', 'Delphi', 'Argos',
            'Mycenae', 'Thebes', 'Rhodes', 'Olympia', 'Thessalonica',
            'Knossos', 'Ephesus', 'Pergamon', 'Miletus', 'Pharsalos',
        ],
    },
    indians: {
        name: 'Indians',
        adjective: 'Indian',
        leader: 'Gandhi',
        color: '#E02020',
        cities: [
            'Delhi', 'Bombay', 'Madras', 'Calcutta', 'Bangalore',
            'Hyderabad', 'Lahore', 'Karachi', 'Jaipur', 'Lucknow',
            'Varanasi', 'Agra', 'Pune', 'Patna', 'Surat',
        ],
    },
    russians: {
        name: 'Russians',
        adjective: 'Russian',
        leader: 'Stalin',
        color: '#00E0E0',
        cities: [
            'Moscow', 'Leningrad', 'Kiev', 'Minsk', 'Smolensk',
            'Odessa', 'Sevastopol', 'Tiflis', 'Sverdlovsk', 'Yakutsk',
            'Vladivostok', 'Novgorod', 'Rostov', 'Kharkov', 'Stalingrad',
        ],
    },
    zulus: {
        name: 'Zulus',
        adjective: 'Zulu',
        leader: 'Shaka',
        color: '#E000E0',
        cities: [
            'Zimbabwe', 'Ulundi', 'Bapedi', 'Hlobane', 'Isandhlwana',
            'Intombe', 'Mpondo', 'Ngome', 'Ondini', 'Nodwengu',
            'Tugela', 'Umgungundlovu', 'Umfolozi', 'Eshowe', 'Nkandla',
        ],
    },
    french: {
        name: 'French',
        adjective: 'French',
        leader: 'Napoleon',
        color: '#8080FF',
        cities: [
            'Paris', 'Lyon', 'Marseilles', 'Tours', 'Orleans',
            'Chartres', 'Bordeaux', 'Reims', 'Avignon', 'Rouen',
            'Toulouse', 'Nice', 'Grenoble', 'Dijon', 'Nancy',
        ],
    },
    aztecs: {
        name: 'Aztecs',
        adjective: 'Aztec',
        leader: 'Montezuma',
        color: '#FF8040',
        cities: [
            'Tenochtitlan', 'Teotihuacan', 'Tlatelolco', 'Texcoco', 'Tlaxcala',
            'Calixtlahuaca', 'Malinalco', 'Tula', 'Atzcapotzalco', 'Tzintzuntzan',
            'Chalco', 'Xochimilco', 'Ixtapalapa', 'Coyoacan', 'Tacuba',
        ],
    },
    chinese: {
        name: 'Chinese',
        adjective: 'Chinese',
        leader: 'Mao',
        color: '#40FF40',
        cities: [
            'Peking', 'Shanghai', 'Canton', 'Nanking', 'Tsingtao',
            'Hangchow', 'Tientsin', 'Sian', 'Chengdu', 'Anyang',
            'Kaifeng', 'Wuhan', 'Chungking', 'Harbin', 'Shenyang',
        ],
    },
    english: {
        name: 'English',
        adjective: 'English',
        leader: 'Elizabeth',
        color: '#FF4040',
        cities: [
            'London', 'York', 'Nottingham', 'Hastings', 'Canterbury',
            'Coventry', 'Warwick', 'Newcastle', 'Oxford', 'Liverpool',
            'Dover', 'Brighton', 'Norwich', 'Leeds', 'Birmingham',
        ],
    },
    mongols: {
        name: 'Mongols',
        adjective: 'Mongol',
        leader: 'Genghis Khan',
        color: '#804000',
        cities: [
            'Karakorum', 'Samarkand', 'Bokhara', 'Nishapur', 'Kashgar',
            'Tabriz', 'Aleppo', 'Kabul', 'Ormuz', 'Basra',
            'Khanbalik', 'Shangdu', 'Dalandzadgad', 'Ulaanbaatar', 'Hovd',
        ],
    },
};

// Get list of nation IDs
export function getNationIds() {
    return Object.keys(NATIONS);
}

// Get nation by ID
export function getNation(nationId) {
    return NATIONS[nationId] || null;
}

// Get next city name for a nation
export function getNextCityName(nationId, existingCities) {
    const nation = NATIONS[nationId];
    if (!nation) return 'City';

    const usedNames = new Set(existingCities.map(c => c.name));
    for (const name of nation.cities) {
        if (!usedNames.has(name)) {
            return name;
        }
    }
    // All names used, add number
    return `${nation.cities[0]} ${existingCities.length + 1}`;
}
