/* ==================================
   CONFIGURATION DE LA CARTE - FOR2D ROYAL
   Toutes les valeurs "réglables" sont ici.
   ================================== */

// Graine : même graine = même carte pour tout le monde (utile pour le multijoueur plus tard)
export const SEED = 20260928;

// Taille du monde en unités (1 unité = 1 pixel au zoom 1)
export const WORLD_SIZE = 6000;

// Le sol est pré-dessiné par morceaux ("chunks") pour que le rendu reste fluide
export const CHUNK_SIZE = 500;
export const GROUND_RES = 4;   // 1 pixel de sol calculé = 4 unités (lissé ensuite)
export const GRID_STEP = 100;  // quadrillage au sol façon ZombsRoyale

// Réglages de performance du rendu
export const RENDER = {
    maxDpr: 1.5,          // résolution interne max (écrans "retina")
    maxPixels: 2.6e6,     // pixels max du canvas (≈ 1080p + 25 %)
    minDpr: 0.75,         // on ne descend pas en dessous (sinon trop flou)
    buildMs: 3,           // temps max par image pour pré-construire les chunks hors écran
    urgentBuildMs: 7,     // ... quand un chunk VISIBLE manque encore
    lookahead: 0.8,       // secondes d'anticipation dans le sens du mouvement
    minChunks: 48         // taille min du cache de chunks (il grandit avec la vue)
};

export const PLAYER = {
    radius: 26,
    speed: 340,          // unités par seconde
    waterFactor: 0.55,   // on avance moins vite dans l'eau
    name: 'Joueur 1'
};

// Surface de monde visible à l'écran (adaptée automatiquement à la taille de la fenêtre)
export const VIEW = { width: 1500, height: 850 };
export const ZOOM = { min: 0.55, max: 1.6 };

// ===== Biomes =====
export const B = {
    OCEAN: 0,
    SHALLOW: 1,
    BEACH: 2,
    PLAINE: 3,
    FORET: 4,
    DESERT: 5,
    MONTAGNE: 6,
    NEIGE: 7,
    LAC: 8
};

export const BIOME_NAMES = [
    'Océan', 'Eaux peu profondes', 'Plage', 'Plaine', 'Forêt',
    'Désert', 'Montagnes', 'Sommet enneigé', 'Lac'
];

// Couleurs du sol [r, g, b]
export const BIOME_COLORS = [
    [40, 116, 204],   // océan
    [76, 160, 230],   // eaux peu profondes
    [238, 216, 152],  // plage
    [108, 172, 74],   // plaine
    [62, 126, 62],    // forêt
    [233, 198, 124],  // désert
    [146, 139, 126],  // montagnes
    [236, 242, 248],  // neige
    [76, 160, 230]    // lac
];

export const OCEAN_DEEP = 'rgb(40, 116, 204)';

export const isWater = (b) => b === B.OCEAN || b === B.SHALLOW || b === B.LAC;

// Chaque biome "possède" la zone la plus proche de son point (bords déformés par du bruit)
export const REGION_SEEDS = [
    { b: B.MONTAGNE, x: 1250, y: 1250 },
    { b: B.FORET,    x: 4750, y: 1250 },
    { b: B.DESERT,   x: 1250, y: 4750 },
    { b: B.PLAINE,   x: 3000, y: 3000 },
    { b: B.PLAINE,   x: 4750, y: 4750 }
];

// Sommet enneigé au cœur des montagnes
export const SNOW_PEAK = { x: 1200, y: 1200, radius: 500 };

export const LAKES = [
    { x: 4300, y: 2900, r: 320, name: 'Lac Bleu' },
    { x: 1900, y: 3000, r: 170, name: 'Étang des Saules' }
];

// ===== Villes =====
export const TOWNS = [
    { id: 'cite',  name: 'Cité-Centrale', x: 3000, y: 3000, radius: 520, style: 'city',     biome: B.PLAINE },
    { id: 'pic',   name: 'Pic-Glacé',     x: 1600, y: 1500, radius: 400, style: 'mountain', biome: B.MONTAGNE },
    { id: 'bois',  name: 'Bois-Sombre',   x: 4500, y: 1450, radius: 420, style: 'forest',   biome: B.FORET },
    { id: 'dune',  name: 'Dune-Rouge',    x: 1450, y: 4500, radius: 460, style: 'desert',   biome: B.DESERT },
    { id: 'ferme', name: 'Ferme-Dorée',   x: 4450, y: 4450, radius: 480, style: 'farm',     biome: B.PLAINE }
];

// Chemins de terre entre les villes
export const ROAD_LINKS = [
    ['cite', 'pic'], ['cite', 'bois'], ['cite', 'dune'], ['cite', 'ferme'],
    ['pic', 'bois'], ['dune', 'ferme'], ['pic', 'dune']
];

/*
   Carte dédiée au duel : « L'Île Jumelle ».
   Deux îles rondes reliées par un isthme, en diagonale (nord-ouest / sud-est),
   symétriques par rapport au centre pour que le 1v1 reste équitable :
   - rive nord-ouest : bois d'automne, monts ardoise et cimes givrées ;
   - rive sud-est : canyon écarlate et prairie dorée ;
   - deux îlots isolés dans les coins vides.
   Thème visuel propre (couleurs du sol, végétation, routes, villes, noms des zones).
*/
export const DUEL_MAP_ID = 'duel-two-towns';
export const GUNGAME_MAP_ID = 'gun-game-arena';
/*
   Carte Gun Game « Baie Cargo » (4500 x 4500, 75 % de la largeur classique).
   Île presque carrée aux bords francs, port de commerce en plein été :
   - au centre, le Plateau Central (dalle de béton peinte, ceinture de barrières) ;
   - deux parcs à conteneurs en diagonale (Docks Rouges, Terminal Bleu) ;
   - les Hangars Nord et les Cabanes du Lagon dans les deux autres coins ;
   - entre les zones : prairie fleurie ouverte, quelques bosquets, caisses et barrières.
   Routes en béton presque droites : de longues lignes de tir entre les zones.
*/
export const GUNGAME_THEME = {
    id: 'cargo',
    colors: [
        [18, 92, 140],    // océan : bleu port
        [38, 168, 190],   // lagon turquoise
        [240, 222, 172],  // sable clair
        [104, 176, 122],  // prairie menthe
        [52, 128, 98],    // bosquets vert sapin
        [222, 176, 112],  // sable chaud (sol des parcs à conteneurs)
        [126, 128, 140],  // rochers
        [236, 240, 246],  // neige (absente)
        [44, 168, 196]    // bassins
    ],
    oceanDeep: 'rgb(18, 92, 140)',
    haze: '#d6f1ff',
    grid: 'rgba(10, 50, 60, 0.07)',
    biomeNames: ['Océan', 'Lagon', 'Plage', 'Prairie', 'Bosquet', 'Sable chaud', 'Rochers', 'Neige', 'Bassin'],
    // Routes en béton avec marquage central
    road: { edge: '#4b5767', fill: '#a7b1ba', dash: 'rgba(255, 255, 255, 0.55)' },
    mapRoad: { edge: 'rgba(40, 52, 66, 0.92)', fill: '#c7d0d8', dash: 'rgba(255, 255, 255, 0.85)' }
};

export const TOWNS_GUNGAME = [
    { id: 'plateau',  name: 'Plateau Central',  x: 2250, y: 2250, radius: 500, style: 'plateau', biome: B.PLAINE },
    { id: 'docks',    name: 'Docks Rouges',     x: 1080, y: 1120, radius: 470, style: 'yard',    biome: B.DESERT },
    { id: 'terminal', name: 'Terminal Bleu',    x: 3420, y: 3380, radius: 470, style: 'yard',    biome: B.DESERT },
    { id: 'hangars',  name: 'Hangars Nord',     x: 3400, y: 1100, radius: 430, style: 'hangar',  biome: B.PLAINE },
    { id: 'cabanes',  name: 'Cabanes du Lagon', x: 1100, y: 3400, radius: 420, style: 'shack',   biome: B.PLAINE }
];
export const ROAD_LINKS_GUNGAME = [
    ['plateau', 'docks'], ['plateau', 'terminal'], ['plateau', 'hangars'], ['plateau', 'cabanes']
];

export const TOWNS_DUEL = [
    { id: 'erables',  name: 'Hameau des Érables', x: 1040, y: 960,  radius: 440, style: 'maple', biome: B.FORET },
    { id: 'ecarlate', name: 'Comptoir Écarlate',  x: 1960, y: 2040, radius: 440, style: 'mesa',  biome: B.DESERT }
];
export const ROAD_LINKS_DUEL = [['erables', 'ecarlate']];

// Thème « automne crépusculaire » : couleurs du sol dans l'ordre des biomes (B)
export const DUEL_THEME = {
    id: 'autumn',
    colors: [
        [24, 84, 118],    // océan : bleu pétrole
        [46, 150, 158],   // lagon turquoise
        [238, 206, 170],  // grève rosée
        [186, 170, 84],   // prairie dorée
        [124, 86, 54],    // sous-bois roux (tapis de feuilles)
        [200, 104, 68],   // canyon écarlate
        [110, 102, 122],  // monts ardoise
        [234, 232, 246],  // cimes givrées
        [52, 160, 166]    // lacs turquoise
    ],
    oceanDeep: 'rgb(24, 84, 118)',
    haze: '#ffd9b8',                       // voile d'altitude chaud (heure dorée)
    grid: 'rgba(60, 20, 0, 0.06)',
    biomeNames: [
        'Mer d’Ardoise', 'Lagon', 'Grève rosée', 'Prairie dorée', 'Bois d’automne',
        'Canyon écarlate', 'Monts ardoise', 'Cimes givrées', 'Lac'
    ],
    // Routes pavées gris-lavande (au lieu des chemins de terre)
    road: { edge: '#4f4256', fill: '#9d90a6', cobble: 'rgba(40, 24, 48, 0.18)' },
    mapRoad: { edge: 'rgba(52, 38, 60, 0.9)', fill: '#c4b8cc', dash: 'rgba(255, 244, 230, 0.7)' }
};

// Les profils sont immuables côté configuration : generateWorld clone les données
// géographiques avant de construire les grilles et les objets de la partie.
export const MAP_PRESETS = {
    default: {
        width: WORLD_SIZE,
        height: WORLD_SIZE,
        terrainSeed: SEED,
        regionSeeds: REGION_SEEDS,
        snowPeak: SNOW_PEAK,
        lakes: LAKES,
        towns: TOWNS,
        roadLinks: ROAD_LINKS,
        natureAttempts: 30000
    },
    [GUNGAME_MAP_ID]: {
        width: 4500,
        height: 4500,
        terrainSeed: 428731,
        // Île presque carrée (super-ellipse) : grande surface jouable, côte peu découpée
        shape: { type: 'superellipse', power: 7, noise: 0.06 },
        regionSeeds: [
            { b: B.PLAINE, x: 2250, y: 2250 },
            { b: B.PLAINE, x: 2250, y: 650 },
            { b: B.PLAINE, x: 650, y: 2250 },
            { b: B.PLAINE, x: 3850, y: 2250 },
            { b: B.PLAINE, x: 2250, y: 3850 },
            { b: B.DESERT, x: 1080, y: 1120 },
            { b: B.DESERT, x: 3420, y: 3380 },
            { b: B.FORET, x: 2950, y: 1700 },
            { b: B.FORET, x: 1550, y: 2800 },
            { b: B.FORET, x: 3700, y: 2650 },
            { b: B.FORET, x: 800, y: 1850 }
        ],
        snowPeak: { x: -10000, y: -10000, radius: 1 },   // pas de sommet enneigé
        lakes: [
            { x: 1700, y: 3000, r: 110, name: 'Bassin Sud' },
            { x: 2850, y: 1500, r: 100, name: 'Bassin Nord' }
        ],
        towns: TOWNS_GUNGAME,
        roadLinks: ROAD_LINKS_GUNGAME,
        roadCurve: 0.08,     // routes presque droites : de longues lignes de tir
        natureAttempts: 9000,
        openCovers: 46,      // caisses et barrières posées dans les espaces ouverts
        theme: GUNGAME_THEME
    },
    [DUEL_MAP_ID]: {
        width: 3000,
        height: 3000,
        terrainSeed: 773421,
        // Forme : deux disques fondus (isthme au centre) + îlots
        shape: {
            type: 'twin',
            lobes: [{ x: 960, y: 960, r: 780 }, { x: 2040, y: 2040, r: 780 }],
            islets: [{ x: 2390, y: 610, r: 150 }, { x: 610, y: 2390, r: 150 }],
            blend: 160,        // rondeur de l'isthme
            coastNoise: 240,   // côte découpée (unités)
            coastScale: 2200   // largeur des bandes plage / lagon
        },
        // Biomes symétriques par rapport au centre (1500, 1500)
        regionSeeds: [
            { b: B.MONTAGNE, x: 480, y: 520 },
            { b: B.FORET, x: 1380, y: 760 },
            { b: B.FORET, x: 700, y: 1380 },
            { b: B.PLAINE, x: 1040, y: 960 },
            { b: B.PLAINE, x: 1500, y: 1500 },
            { b: B.PLAINE, x: 1620, y: 2240 },
            { b: B.FORET, x: 2300, y: 1620 },
            { b: B.DESERT, x: 1960, y: 2040 },
            { b: B.DESERT, x: 2520, y: 2480 }
        ],
        snowPeak: { x: 470, y: 500, radius: 210 },
        lakes: [
            { x: 560, y: 1250, r: 130, name: 'Lac des Érables' },
            { x: 760, y: 470, r: 95, name: 'Lac Givré' },
            { x: 2440, y: 1750, r: 130, name: 'Bassin Pourpre' },
            { x: 2240, y: 2530, r: 95, name: 'Oasis Rouge' }
        ],
        towns: TOWNS_DUEL,
        roadLinks: ROAD_LINKS_DUEL,
        roadCurve: 0.12,   // route presque droite : elle reste sur l'isthme
        natureAttempts: 20000,
        theme: DUEL_THEME
    }
};

export function getMapProfile(mapId = 'default') {
    return MAP_PRESETS[mapId] || MAP_PRESETS.default;
}

// Compatibilité avec les appelants qui ne demandent que villes et routes.
export function getMapPreset(mapId = 'default') {
    const profile = getMapProfile(mapId);
    return { towns: profile.towns, roadLinks: profile.roadLinks };
}

export const ROAD_WIDTH = 72;
