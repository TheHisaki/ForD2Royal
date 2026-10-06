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

// Carte dédiée au duel : même terrain, rendu et règles que la carte principale,
// mais deux villes opposées pour donner à chaque combattant un point d'intérêt.
export const DUEL_MAP_ID = 'duel-two-towns';
export const TOWNS_DUEL = [
    { id: 'aube',      name: 'Bastion-Aube',    x: 1450, y: 2900, radius: 520, style: 'city',   biome: B.PLAINE },
    { id: 'crepuscule', name: 'Port-Crépuscule', x: 4550, y: 3100, radius: 520, style: 'forest', biome: B.PLAINE }
];
export const ROAD_LINKS_DUEL = [['aube', 'crepuscule']];

export const MAP_PRESETS = {
    default: { towns: TOWNS, roadLinks: ROAD_LINKS },
    [DUEL_MAP_ID]: { towns: TOWNS_DUEL, roadLinks: ROAD_LINKS_DUEL }
};

export function getMapPreset(mapId = 'default') {
    return MAP_PRESETS[mapId] || MAP_PRESETS.default;
}

export const ROAD_WIDTH = 72;
