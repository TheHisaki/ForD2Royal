/* ==================================
   GÉNÉRATION DU MONDE - FOR2D ROYAL
   Île, biomes, lacs, chemins, villes et végétation.
   ================================== */

import {
    SEED, WORLD_SIZE, B, REGION_SEEDS, SNOW_PEAK, LAKES,
    ROAD_WIDTH, getMapProfile, isWater
} from './config.js?v=12';
import { fbm, valueNoise, mulberry32 } from './noise.js';
import { SpatialGrid, shadeHex, pick, rectsOverlap, rectPointDist, segDist } from './utils.js';

/* ===================== SOL ===================== */

// Résultat réutilisé par le wrapper standard (évite de créer des millions d'objets).
export const ground = { biome: B.PLAINE, edge: 0, shade: 0.5 };

// Au-delà de cette distance (en rayons de lac), ni lac ni plage.
const LAKE_REACH = 1.14 + 0.175 + 0.01;

// Union douce de deux distances signées (k = rayon de raccord)
function smoothMin(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
}

function createGroundSampler(profile, result = { biome: B.PLAINE, edge: 0, shade: 0.5 }) {
    const scale = Math.min(profile.width, profile.height) / WORLD_SIZE;
    const invScale = 1 / scale;
    const terrainSeed = profile.terrainSeed;
    const regions = profile.regionSeeds;
    const lakes = profile.lakes;
    const peak = profile.snowPeak;
    const twin = profile.shape?.type === 'twin' ? profile.shape : null;
    const superEllipse = profile.shape?.type === 'superellipse' ? profile.shape : null;

    return function sampleProfileGround(x, y) {
        result.edge = 0;
        const nx = x * invScale;
        const ny = y * invScale;
        result.shade = valueNoise(nx * 0.012, ny * 0.012, terrainSeed + 9);

        let d;
        if (twin) {
            // Île jumelle : distance signée aux deux disques fondus + îlots, ramenée
            // sur la même échelle que la carte classique (0,86 = début de la plage).
            let sd = smoothMin(
                Math.hypot(x - twin.lobes[0].x, y - twin.lobes[0].y) - twin.lobes[0].r,
                Math.hypot(x - twin.lobes[1].x, y - twin.lobes[1].y) - twin.lobes[1].r,
                twin.blend
            );
            for (const s of twin.islets) sd = Math.min(sd, Math.hypot(x - s.x, y - s.y) - s.r);
            sd += (fbm(nx * 0.0011, ny * 0.0011, terrainSeed + 1, 3) - 0.5) * twin.coastNoise;
            d = 0.86 + sd / twin.coastScale;
        } else if (superEllipse) {
            // Île presque carrée aux bords francs (puissance élevée), côte légèrement ondulée
            const p = superEllipse.power || 6;
            const dx = Math.abs((x - profile.width / 2) / (profile.width / 2));
            const dy = Math.abs((y - profile.height / 2) / (profile.height / 2));
            d = Math.pow(Math.pow(dx, p) + Math.pow(dy, p), 1 / p);
            d += (fbm(nx * 0.0011, ny * 0.0011, terrainSeed + 1, 3) - 0.5) * (superEllipse.noise ?? 0.06);
        } else {
            // Forme de l'île : un carré aux coins arrondis, avec une côte irrégulière.
            const halfX = profile.width / 2;
            const halfY = profile.height / 2;
            const dx = (x - halfX) / halfX;
            const dy = (y - halfY) / halfY;
            d = Math.sqrt(Math.sqrt(dx * dx * dx * dx + dy * dy * dy * dy));
            d += (fbm(nx * 0.0011, ny * 0.0011, terrainSeed + 1, 3) - 0.5) * 0.14;
        }

        if (d > 0.93) { result.biome = B.OCEAN; return result; }
        if (d > 0.895) {
            result.biome = B.SHALLOW;
            if (d < 0.902) result.edge = -1;
            return result;
        }
        if (d > 0.86) { result.biome = B.BEACH; return result; }

        let lakeNoise = NaN;
        for (const lake of lakes) {
            const lx = x - lake.x;
            const ly = y - lake.y;
            const reach = lake.r * LAKE_REACH;
            if (lx * lx + ly * ly >= reach * reach) continue;
            if (lakeNoise !== lakeNoise) lakeNoise = (fbm(nx * 0.004, ny * 0.004, terrainSeed + 4, 2) - 0.5) * 0.35;
            const ld = Math.hypot(lx, ly) / lake.r + lakeNoise;
            if (ld < 1) {
                result.biome = B.LAC;
                if (ld > 0.95) result.edge = -1;
                return result;
            }
            if (ld < 1.14) { result.biome = B.BEACH; return result; }
        }

        // Régions déformées : les amplitudes suivent la taille de la carte.
        const deformation = 900 * scale;
        const wx = x + (fbm(nx * 0.0008, ny * 0.0008, terrainSeed + 2, 3) - 0.5) * deformation;
        const wy = y + (fbm(nx * 0.0008, ny * 0.0008, terrainSeed + 3, 3) - 0.5) * deformation;

        let q1 = Infinity;
        let s1 = null;
        for (const s of regions) {
            const ex = wx - s.x;
            const ey = wy - s.y;
            const q = ex * ex + ey * ey;
            if (q < q1) { q1 = q; s1 = s; }
        }
        const b1 = s1 ? s1.b : B.PLAINE;
        let q2 = Infinity;
        let s2 = null;
        for (const s of regions) {
            if (s.b === b1) continue;
            const ex = wx - s.x;
            const ey = wy - s.y;
            const q = ex * ex + ey * ey;
            if (q < q2) { q2 = q; s2 = s; }
        }
        const d1 = s1 ? Math.hypot(wx - s1.x, wy - s1.y) : Infinity;
        const d2 = s2 ? Math.hypot(wx - s2.x, wy - s2.y) : Infinity;
        const gap = d2 - d1;
        if (gap < 22 * scale) result.edge = 1 - gap / (22 * scale);
        result.biome = b1;

        if (b1 === B.MONTAGNE) {
            const sd = Math.hypot(x - peak.x, y - peak.y) / peak.radius +
                (fbm(nx * 0.003, ny * 0.003, terrainSeed + 5, 2) - 0.5) * 0.5;
            if (sd < 1) {
                result.biome = B.NEIGE;
                if (sd > 0.96) result.edge = Math.max(result.edge, 0.6);
            }
        } else if (b1 === B.DESERT) {
            result.shade = 0.5 + 0.5 * Math.sin(nx * 0.011 + ny * 0.005 +
                fbm(nx * 0.002, ny * 0.002, terrainSeed + 7, 2) * 9);
        }
        return result;
    };
}

const STANDARD_PROFILE = {
    width: WORLD_SIZE,
    height: WORLD_SIZE,
    terrainSeed: SEED,
    regionSeeds: REGION_SEEDS,
    snowPeak: SNOW_PEAK,
    lakes: LAKES
};
const standardSampler = createGroundSampler(STANDARD_PROFILE, ground);

// Compatibilité : ce wrapper conserve exactement la carte standard.
export function sampleGround(x, y) {
    return standardSampler(x, y);
}

/*
   Sur quoi marche-t-on en (x, y) ? (pour le bruit des pas, voir js/sfx.js)
   'wood' | 'tile' (intérieurs), 'stone' (place de ville), 'crops' (champs),
   'dirt' (chemins), puis selon le biome : 'grass' | 'forest' | 'sand' | 'rock' | 'snow' | 'water'
*/
export function surfaceAt(world, x, y) {
    if (world) {
        for (const b of world.buildings) {
            if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) {
                return b.roofType === 'flat' ? 'tile' : 'wood'; // maisons du désert : carrelage
            }
        }
        for (const t of world.towns) {
            const dx = x - t.x;
            const dy = y - t.y;
            if (t.plazaR && dx * dx + dy * dy < t.plazaR * t.plazaR) return 'stone';
        }
        for (const f of world.fields) {
            if (x > f.x && x < f.x + f.w && y > f.y && y < f.y + f.h) return 'crops';
        }
        if (world.roadGrid && distToRoads(world, x, y, ROAD_WIDTH) < ROAD_WIDTH / 2) return 'dirt';
    }
    const b = (world?.sampleGround || sampleGround)(x, y).biome;
    if (isWater(b)) return 'water';
    if (b === B.BEACH || b === B.DESERT) return 'sand';
    if (b === B.FORET) return 'forest';
    if (b === B.MONTAGNE) return 'rock';
    if (b === B.NEIGE) return 'snow';
    return 'grass';
}

export function townAt(world, x, y, margin = 0) {
    for (const t of world.towns) {
        if (Math.hypot(x - t.x, y - t.y) < t.radius + margin) return t;
    }
    return null;
}

function nearestLakeAt(lakes, x, y) {
    let best = lakes[0] || null;
    let bestD = Infinity;
    for (const l of lakes) {
        const d = Math.hypot(x - l.x, y - l.y);
        if (d < bestD) { bestD = d; best = l; }
    }
    return best;
}

export function nearestLake(worldOrX, xOrY, yMaybe) {
    const world = worldOrX && typeof worldOrX === 'object' ? worldOrX : null;
    const x = world ? xOrY : worldOrX;
    const y = world ? yMaybe : xOrY;
    return nearestLakeAt(world?.lakes || LAKES, x, y);
}

export function distToRoads(world, x, y, range) {
    const segs = world.roadGrid.query(x - range, y - range, x + range, y + range, world._segTmp);
    let best = Infinity;
    for (const s of segs) {
        const d = segDist(x, y, s.ax, s.ay, s.bx, s.by);
        if (d < best) best = d;
    }
    return best;
}

/* ===================== GÉNÉRATION ===================== */

export function generateWorld({ mapId = 'default' } = {}) {
    const profile = getMapProfile(mapId);
    const resolvedMapId = profile === getMapProfile('default') ? 'default' : mapId;
    const rng = mulberry32(profile.terrainSeed);
    const groundSampler = createGroundSampler(profile);
    const world = {
        mapId: resolvedMapId,
        map: {
            ...profile,
            regionSeeds: profile.regionSeeds.map(s => ({ ...s })),
            snowPeak: { ...profile.snowPeak },
            lakes: profile.lakes.map(l => ({ ...l })),
            towns: profile.towns.map(t => ({ ...t })),
            roadLinks: profile.roadLinks.map(link => [...link])
        },
        width: profile.width,
        height: profile.height,
        theme: profile.theme || null,   // null = apparence classique
        sampleGround: groundSampler,
        lakes: profile.lakes.map(l => ({ ...l })),
        towns: profile.towns.map(t => ({ ...t })),
        roads: [],
        buildings: [],
        fields: [],
        objects: [],
        roadGrid: new SpatialGrid(300),
        collide: new SpatialGrid(250),  // ce qui bloque le joueur
        render: new SpatialGrid(250),   // ce qui se dessine
        _segTmp: []
    };

    // Les routes, villes et la nature consultent tous le même sampler de profil.
    buildRoads(world, rng, profile.roadLinks, profile.roadCurve ?? 0.32);
    for (const town of world.towns) buildTown(world, town, rng);
    if (profile.openCovers) scatterCovers(world, rng, profile.openCovers);
    scatterNature(world, rng, profile.natureAttempts);
    return world;
}

/* ----- Chemins ----- */

function buildRoads(world, rng, roadLinks, curve = 0.32) {
    const look = world.theme?.road || null;
    const byId = id => world.towns.find(t => t.id === id);

    for (const [a, b] of roadLinks) {
        const A = byId(a);
        const C = byId(b);
        const len = Math.hypot(C.x - A.x, C.y - A.y);
        const nx = -(C.y - A.y) / len;
        const ny = (C.x - A.x) / len;
        // Point de contrôle décalé sur le côté : chemin courbe
        const off = (rng() - 0.5) * curve * len;
        const cx = (A.x + C.x) / 2 + nx * off;
        const cy = (A.y + C.y) / 2 + ny * off;
        const phase = rng() * Math.PI * 2;
        const steps = Math.ceil(len / 40);

        const points = [];
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const u = 1 - t;
            // Petites ondulations, nulles aux deux extrémités
            const wobble = Math.sin(t * Math.PI * 3 + phase) * 30 * Math.sin(t * Math.PI);
            const px = u * u * A.x + 2 * u * t * cx + t * t * C.x + nx * wobble;
            const py = u * u * A.y + 2 * u * t * cy + t * t * C.y + ny * wobble;
            points.push(px, py);
            minX = Math.min(minX, px); minY = Math.min(minY, py);
            maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
        }

        const m = ROAD_WIDTH;
        const road = {
            points,
            width: ROAD_WIDTH,
            bbox: { minX: minX - m, minY: minY - m, maxX: maxX + m, maxY: maxY + m }
        };
        // Thème : couleurs de la route (pavés) ; sinon chemin de terre classique
        if (look) Object.assign(road, { edge: look.edge, fill: look.fill, cobble: look.cobble, dash: look.dash });
        world.roads.push(road);

        for (let i = 0; i < points.length - 2; i += 2) {
            const seg = { ax: points[i], ay: points[i + 1], bx: points[i + 2], by: points[i + 3] };
            world.roadGrid.insert(seg,
                Math.min(seg.ax, seg.bx) - m, Math.min(seg.ay, seg.by) - m,
                Math.max(seg.ax, seg.bx) + m, Math.max(seg.ay, seg.by) + m);
        }
    }
}

/* ----- Villes ----- */

const STYLES = {
    city: {
        houses: 8,
        sizes: [[260, 200], [320, 240], [360, 260], [240, 240], [300, 300]],
        roofs: ['#3f6fd8', '#d84a3f', '#2fa38a', '#e0a32e', '#8a5ad8'],
        floor: '#cdb693', wall: '#39404f', plaza: '#bdb8ab', plazaEdge: '#8f8a80', roofType: 'gable'
    },
    mountain: {
        houses: 5,
        sizes: [[220, 190], [260, 210], [200, 200]],
        roofs: ['#7a4a2e', '#5e3a24', '#8a5a3a'],
        floor: '#b08a5f', wall: '#3d2b1f', plaza: '#a7a298', plazaEdge: '#7f7a70', roofType: 'gable',
        snowRoof: true
    },
    forest: {
        houses: 5,
        sizes: [[220, 180], [240, 210], [200, 200]],
        roofs: ['#8a5a34', '#5f7f35', '#6e4a2c'],
        floor: '#a8845a', wall: '#3d2b1f', plaza: '#9c7b50', plazaEdge: '#6f5535', roofType: 'gable'
    },
    desert: {
        houses: 6,
        sizes: [[240, 200], [280, 220], [200, 200], [320, 220]],
        roofs: ['#c9783f', '#d99a55', '#b8643a'],
        floor: '#e6c893', wall: '#8a5a34', plaza: '#d8b06b', plazaEdge: '#b88d4f', roofType: 'flat'
    },
    farm: {
        houses: 2,
        sizes: [[230, 200]],
        roofs: ['#c23b32', '#a8452e'],
        floor: '#b89468', wall: '#4a2f1f', plaza: '#a9855a', plazaEdge: '#7d6040', roofType: 'gable'
    },
    // ----- Carte Gun Game « Baie Cargo » -----
    // Plateau central : grande dalle peinte, aucune maison, ceinture de barrières
    plateau: {
        houses: 0,
        sizes: [[200, 160]],
        roofs: ['#8796a8'],
        floor: '#c9d2d6', wall: '#2c3a4a', plaza: '#b7c1c8', plazaEdge: '#4f5d6b', roofType: 'flat',
        pattern: 'arena', plazaScale: 0.46
    },
    // Parc à conteneurs : sol en asphalte, allées entre les conteneurs
    yard: {
        houses: 0,
        sizes: [[200, 160]],
        roofs: ['#8796a8'],
        floor: '#c9d2d6', wall: '#2c3a4a', plaza: '#5d6772', plazaEdge: '#f0c23a', roofType: 'flat',
        pattern: 'lanes', plazaScale: 0.26
    },
    // Hangars : grands bâtiments en tôle à toit plat
    hangar: {
        houses: 3,
        sizes: [[340, 230], [300, 220], [360, 250]],
        roofs: ['#8796a8', '#6f8aa3', '#b7c4cf'],
        floor: '#b8c0c6', wall: '#323c48', plaza: '#aab4bc', plazaEdge: '#5a6672', roofType: 'flat',
        pattern: 'tiles'
    },
    // Cabanes de plage colorées autour d'une petite place en bois
    shack: {
        houses: 4,
        sizes: [[200, 170], [220, 180], [190, 190]],
        roofs: ['#e9725a', '#3fb7c4', '#f2c14e', '#7ccf8a'],
        floor: '#d9b98a', wall: '#5a3d2a', plaza: '#e7d3a6', plazaEdge: '#b89462', roofType: 'gable',
        pattern: 'rings'
    },
    // ----- Carte 1V1 (thème automne) -----
    // Hameau forestier : toits bordeaux / sapin / ardoise, place pavée, grand érable au centre
    maple: {
        houses: 6,
        sizes: [[240, 200], [260, 220], [300, 230], [220, 220]],
        roofs: ['#8e2f3b', '#3e6b5a', '#4a5d7a', '#b8862f', '#6b3f6e'],
        floor: '#b98a5c', wall: '#3b2a24', plaza: '#b9ab98', plazaEdge: '#7d6c5c', roofType: 'gable',
        pattern: 'rings'
    },
    // Comptoir du canyon : maisons en adobe à toit plat, place dallée, puits de grès
    mesa: {
        houses: 6,
        sizes: [[240, 200], [280, 220], [220, 220], [320, 220]],
        roofs: ['#b5523b', '#c96f45', '#d99a5b', '#9c4632'],
        floor: '#e2b48a', wall: '#6e3b28', plaza: '#d6a06e', plazaEdge: '#a8653f', roofType: 'flat',
        pattern: 'tiles'
    }
};

function buildTown(world, town, rng) {
    const st = STYLES[town.style];
    town.plazaR = Math.round(town.radius * (st.plazaScale || 0.3));
    town.plaza = st.plaza;
    town.plazaEdge = st.plazaEdge;
    if (st.pattern) town.pattern = st.pattern;
    const taken = [];

    // Élément central de la place
    if (town.style === 'city') addProp(world, 'fountain', town.x, town.y, 75);
    if (town.style === 'desert') addProp(world, 'well', town.x, town.y, 42);
    if (town.style === 'mesa') addProp(world, 'well', town.x, town.y, 46, '#c58b5e');
    if (town.style === 'maple') addGreatMaple(world, town, rng);

    if (town.style === 'farm') {
        const barn = placeRect(world, town, 480, 320, taken, rng, false);
        if (barn) addBuilding(world, town, st, barn, rng, { barn: true });
        for (let i = 0; i < 3; i++) {
            const f = placeRect(world, town, 320, 220, taken, rng, true);
            if (f) world.fields.push({ ...f, crop: i % 2 ? 'green' : 'wheat', vertical: f.h > f.w });
        }
    }

    for (let i = 0; i < st.houses; i++) {
        const [w, h] = pick(rng, st.sizes);
        const r = placeRect(world, town, w, h, taken, rng, true);
        if (r) addBuilding(world, town, st, r, rng, {});
    }

    // Couvertures de la carte Gun Game (conteneurs, caisses, barrières)
    if (COVER_TOWNS[town.style]) COVER_TOWNS[town.style](world, town, rng, taken);

    // Bottes de foin autour de la ferme
    if (town.style === 'farm') {
        let placed = 0;
        for (let i = 0; i < 200 && placed < 9; i++) {
            const a = rng() * Math.PI * 2;
            const d = town.plazaR + 40 + rng() * (town.radius + 60 - town.plazaR);
            const x = town.x + Math.cos(a) * d;
            const y = town.y + Math.sin(a) * d;
            if (taken.some(t => rectPointDist(t, x, y) < 60)) continue;
            if (distToRoads(world, x, y, 120) < ROAD_WIDTH / 2 + 45) continue;
            if (world.objects.some(o => Math.hypot(o.x - x, o.y - y) < 90)) continue;
            addProp(world, 'hay', x, y, 30);
            placed++;
        }
    }
}

// Cherche un emplacement libre pour un rectangle w x h dans la ville
function placeRect(world, town, w, h, taken, rng, canRotate) {
    for (let i = 0; i < 400; i++) {
        let W = w;
        let H = h;
        if (canRotate && rng() < 0.5) { W = h; H = w; }
        const a = rng() * Math.PI * 2;
        const d = town.plazaR + 40 + rng() * (town.radius + 60 - town.plazaR);
        const cx = town.x + Math.cos(a) * d;
        const cy = town.y + Math.sin(a) * d;
        const rect = { x: Math.round(cx - W / 2), y: Math.round(cy - H / 2), w: W, h: H };

        if (rectPointDist(rect, town.x, town.y) < town.plazaR + 40) continue;
        if (taken.some(t => rectsOverlap(t, rect, 70))) continue;
        if (rectNearRoad(world, rect, ROAD_WIDTH / 2 + 45)) continue;
        if (rectTouchesWater(world, rect)) continue;

        taken.push(rect);
        return rect;
    }
    return null;
}

function rectNearRoad(world, r, dist) {
    for (let x = r.x; x <= r.x + r.w + 39; x += 40) {
        for (let y = r.y; y <= r.y + r.h + 39; y += 40) {
            const px = Math.min(x, r.x + r.w);
            const py = Math.min(y, r.y + r.h);
            if (distToRoads(world, px, py, dist) < dist) return true;
        }
    }
    return false;
}

function rectTouchesWater(world, r) {
    const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h], [r.x + r.w / 2, r.y + r.h / 2]];
    return pts.some(([x, y]) => {
        const b = world.sampleGround(x, y).biome;
        return isWater(b) || b === B.BEACH;
    });
}

function addBuilding(world, town, st, rect, rng, opts) {
    const roof = opts.barn ? '#b8322b' : pick(rng, st.roofs);
    const b = {
        ...rect,
        id: world.buildings.length,
        roof,
        roofLight: shadeHex(roof, 0.15),
        roofDark: shadeHex(roof, -0.35),
        floor: opts.barn ? '#a0784c' : st.floor,
        wall: st.wall,
        roofType: opts.barn ? 'barn' : st.roofType,
        snow: !!st.snowRoof,
        alpha: 1,
        walls: []
    };

    // Porte tournée vers la place, et une 2e porte en face pour les grands bâtiments
    const vx = town.x - (rect.x + rect.w / 2);
    const vy = town.y - (rect.y + rect.h / 2);
    const side = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'bottom' : 'top');
    const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
    const doors = [side];
    if (rect.w * rect.h >= 70000) doors.push(opposite[side]);

    const doorW = opts.barn ? 150 : 84;
    b.doors = doors.map(side => ({ side, w: doorW })); // pour dessiner les flèches d'entrée
    b.walls = makeWalls(rect, doors, doorW, 16);
    for (const w of b.walls) {
        world.collide.insert({ kind: 'rect', x: w.x, y: w.y, w: w.w, h: w.h }, w.x, w.y, w.x + w.w, w.y + w.h);
    }
    world.buildings.push(b);
}

// 4 murs, avec une ouverture (porte) au milieu des côtés choisis
function makeWalls(r, doors, doorW, T) {
    const { x, y, w, h } = r;
    const walls = [];
    const sides = {
        top:    { x, y, w, h: T, horizontal: true },
        bottom: { x, y: y + h - T, w, h: T, horizontal: true },
        left:   { x, y, w: T, h, horizontal: false },
        right:  { x: x + w - T, y, w: T, h, horizontal: false }
    };
    for (const [name, s] of Object.entries(sides)) {
        if (!doors.includes(name)) {
            walls.push({ x: s.x, y: s.y, w: s.w, h: s.h });
        } else if (s.horizontal) {
            const mid = s.x + s.w / 2;
            walls.push({ x: s.x, y: s.y, w: mid - doorW / 2 - s.x, h: s.h });
            walls.push({ x: mid + doorW / 2, y: s.y, w: s.x + s.w - (mid + doorW / 2), h: s.h });
        } else {
            const mid = s.y + s.h / 2;
            walls.push({ x: s.x, y: s.y, w: s.w, h: mid - doorW / 2 - s.y });
            walls.push({ x: s.x, y: mid + doorW / 2, w: s.w, h: s.y + s.h - (mid + doorW / 2) });
        }
    }
    return walls;
}

/* ----- Objets ----- */

function addObject(world, o) {
    o.id = world.objects.length;
    o.alpha = 1;
    world.objects.push(o);
    const m = o.r + 30; // marge pour l'ombre
    world.render.insert(o, o.x - m, o.y - m, o.x + m, o.y + m);
    if (o.cr > 0) {
        world.collide.insert({ kind: 'circle', x: o.x, y: o.y, r: o.cr }, o.x - o.cr, o.y - o.cr, o.x + o.cr, o.y + o.cr);
    }
}

const PROP_COLORS = { fountain: '#bdb8ab', well: '#9a958a', hay: '#e6c65c' };

function addProp(world, type, x, y, r, color = null) {
    const base = color || PROP_COLORS[type];
    addObject(world, {
        type, x, y, r, cr: r, layer: 'ground', nature: false,
        base, dark: shadeHex(base, -0.35), light: shadeHex(base, 0.2)
    });
}

// Grand érable rouge au milieu de la place du hameau (repère visible de loin)
function addGreatMaple(world, town, rng) {
    const r = Math.round(town.plazaR * 0.9); // la bordure pavée reste visible autour
    const base = '#c23b2e';
    addObject(world, {
        type: 'tree', x: town.x, y: town.y, r, cr: r * 0.26, layer: 'top', nature: true,
        base, dark: shadeHex(base, -0.35), light: shadeHex(base, 0.16),
        pts: blobPoints(rng, r, 9, 0.06)
    });
}

/* ----- Couvertures (carte Gun Game) -----
   Objets rectangulaires alignés sur les axes : ils bloquent les déplacements, les tirs et la
   vue des bots (collision 'rect', comme les murs) et sont cuits dans le sol (couche 'ground'). */

const CONTAINER_COLORS = ['#d8473c', '#2f7fd6', '#f08a24', '#1fa38a', '#e8b630', '#7b5bd6'];
const CRATE_COLORS = ['#b98544', '#a8743a', '#c89452'];
const METAL_CRATE = '#6f8193';
const BARRIER_COLOR = '#c5cbd0';
const CRATE_SIZE = 58;
// Formes des tas de caisses (colonne, ligne), éventuellement transposées
const CRATE_LAYOUTS = [
    [[0, 0], [1, 0]],
    [[0, 0], [1, 0], [0, 1]],
    [[0, 0], [1, 0], [1, 1]],
    [[0, 0], [1, 0], [2, 0]],
    [[0, 0], [1, 0], [0, 1], [1, 1]]
];

function addCover(world, type, rect, base, extra = {}) {
    const o = {
        type, x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, w: rect.w, h: rect.h,
        r: Math.hypot(rect.w, rect.h) / 2, cr: 0, layer: 'ground', nature: false, cover: true,
        base, dark: shadeHex(base, -0.38), light: shadeHex(base, 0.24), ...extra
    };
    addObject(world, o);
    world.collide.insert({ kind: 'rect', x: rect.x, y: rect.y, w: rect.w, h: rect.h },
        rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
    (world._coverRects || (world._coverRects = [])).push(rect);
    return o;
}

// Rectangle libre : hors routes, eau, plage, bâtiments, places (sauf autorisation) et autres couvertures
function coverFree(world, r, taken, { margin = 60, plaza = false } = {}) {
    if (r.x < 140 || r.y < 140 || r.x + r.w > world.width - 140 || r.y + r.h > world.height - 140) return false;
    if (taken.some(t => rectsOverlap(t, r, margin))) return false;
    if (world._coverRects && world._coverRects.some(t => rectsOverlap(t, r, Math.min(margin, 60)))) return false;
    if (world.buildings.some(b => rectsOverlap(b, r, 50))) return false;
    if (!plaza) {
        for (const t of world.towns) if (t.plazaR && rectPointDist(r, t.x, t.y) < t.plazaR + 20) return false;
    }
    if (rectNearRoad(world, r, ROAD_WIDTH / 2 + 30)) return false;
    if (rectTouchesWater(world, r)) return false;
    return true;
}

// Petit tas de 2 à 4 caisses en bois (parfois métalliques)
function placeCrates(world, cx, cy, rng, taken, opts) {
    const flip = rng() < 0.5;
    const cells = pick(rng, CRATE_LAYOUTS).map(([a, b]) => (flip ? [b, a] : [a, b]));
    const cols = Math.max(...cells.map(c => c[0])) + 1;
    const rows = Math.max(...cells.map(c => c[1])) + 1;
    const gap = 2;
    const W = cols * CRATE_SIZE + (cols - 1) * gap;
    const H = rows * CRATE_SIZE + (rows - 1) * gap;
    const box = { x: Math.round(cx - W / 2), y: Math.round(cy - H / 2), w: W, h: H };
    if (!coverFree(world, box, taken, opts)) return false;
    taken.push(box);
    const wood = pick(rng, CRATE_COLORS);
    for (const [c, r] of cells) {
        const metal = rng() < 0.22;
        addCover(world, 'crate', {
            x: box.x + c * (CRATE_SIZE + gap), y: box.y + r * (CRATE_SIZE + gap), w: CRATE_SIZE, h: CRATE_SIZE
        }, metal ? METAL_CRATE : wood, { metal });
    }
    return true;
}

// Barrière en béton (type « jersey »), horizontale ou verticale
function placeBarrier(world, cx, cy, vertical, taken, opts, len = 150) {
    const w = vertical ? 34 : len;
    const h = vertical ? len : 34;
    const rect = { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
    if (!coverFree(world, rect, taken, opts)) return false;
    taken.push(rect);
    addCover(world, 'barrier', rect, BARRIER_COLOR);
    return true;
}

// Conteneur maritime (240 x 96), porte d'un côté
function placeContainer(world, cx, cy, vertical, rng, taken, opts = { margin: 80 }) {
    const w = vertical ? 96 : 240;
    const h = vertical ? 240 : 96;
    const rect = { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
    if (!coverFree(world, rect, taken, opts)) return false;
    taken.push(rect);
    addCover(world, 'container', rect, pick(rng, CONTAINER_COLORS), { door: rng() < 0.5 ? 1 : -1 });
    return true;
}

// Point au hasard dans l'anneau constructible d'une zone
function townRingPoint(town, rng, extra = 60) {
    const a = rng() * Math.PI * 2;
    const d = town.plazaR + extra + rng() * Math.max(40, town.radius - town.plazaR);
    return { x: town.x + Math.cos(a) * d, y: town.y + Math.sin(a) * d };
}

const COVER_TOWNS = {
    plateau(world, town, rng, taken) {
        // Ceinture de 8 barrières autour de la dalle, entre les routes (en diagonale)
        const ring = town.plazaR + 120;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
            const vertical = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
            placeBarrier(world, town.x + Math.cos(a) * ring, town.y + Math.sin(a) * ring, vertical, taken, { margin: 30 });
        }
        // Quatre petits tas de caisses sur la dalle : on peut se couvrir au cœur de l'arène
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2;
            const d = town.plazaR * 0.55;
            placeCrates(world, town.x + Math.cos(a) * d, town.y + Math.sin(a) * d, rng, taken, { margin: 40, plaza: true });
        }
        // Puis des caisses plus loin, hors de la ceinture
        for (let i = 0, placed = 0; i < 60 && placed < 5; i++) {
            const p = townRingPoint(town, rng, 200);
            if (placeCrates(world, p.x, p.y, rng, taken, { margin: 90 })) placed++;
        }
    },
    yard(world, town, rng, taken) {
        // Conteneurs en désordre autour de l'aire d'asphalte (allées d'au moins 80)
        let placed = 0;
        for (let i = 0; i < 320 && placed < 11; i++) {
            const p = townRingPoint(town, rng, 70);
            if (placeContainer(world, p.x, p.y, rng() < 0.5, rng, taken)) placed++;
        }
        for (let i = 0, crates = 0; i < 60 && crates < 4; i++) {
            const p = townRingPoint(town, rng, 50);
            if (placeCrates(world, p.x, p.y, rng, taken, { margin: 70 })) crates++;
        }
    },
    hangar(world, town, rng, taken) {
        for (let i = 0, n = 0; i < 80 && n < 2; i++) {
            const p = townRingPoint(town, rng, 80);
            if (placeContainer(world, p.x, p.y, rng() < 0.5, rng, taken)) n++;
        }
        for (let i = 0, n = 0; i < 80 && n < 5; i++) {
            const p = townRingPoint(town, rng, 40);
            if (placeCrates(world, p.x, p.y, rng, taken, { margin: 70 })) n++;
        }
        for (let i = 0, n = 0; i < 60 && n < 2; i++) {
            const p = townRingPoint(town, rng, 60);
            if (placeBarrier(world, p.x, p.y, rng() < 0.5, taken, { margin: 70 })) n++;
        }
    },
    shack(world, town, rng, taken) {
        for (let i = 0, n = 0; i < 80 && n < 4; i++) {
            const p = townRingPoint(town, rng, 40);
            if (placeCrates(world, p.x, p.y, rng, taken, { margin: 70 })) n++;
        }
    }
};

// Couvertures dans les espaces ouverts : tas de caisses, barrières (parfois en L), conteneurs isolés
function scatterCovers(world, rng, count) {
    const taken = [];
    const spread = { margin: 240 };   // bien espacées : la carte reste ouverte
    let placed = 0;
    for (let i = 0; i < count * 40 && placed < count; i++) {
        const x = 260 + rng() * (world.width - 520);
        const y = 260 + rng() * (world.height - 520);
        if (townAt(world, x, y, 110)) continue;
        const b = world.sampleGround(x, y).biome;
        if (b !== B.PLAINE && b !== B.FORET && b !== B.DESERT) continue;
        const roll = rng();
        let ok = false;
        if (roll < 0.48) {
            ok = placeCrates(world, x, y, rng, taken, spread);
        } else if (roll < 0.86) {
            const vertical = rng() < 0.5;
            ok = placeBarrier(world, x, y, vertical, taken, spread);
            // Une fois sur deux, une 2e barrière perpendiculaire forme un coin en L
            if (ok && rng() < 0.5) {
                const sx = rng() < 0.5 ? -1 : 1;
                const sy = rng() < 0.5 ? -1 : 1;
                // Accolée au bout de la première (bord contre bord, sans chevauchement)
                const lx = vertical ? x + sx * 72 : x + sx * 58;
                const ly = vertical ? y + sy * 58 : y + sy * 72;
                placeBarrier(world, lx, ly, !vertical, [], { margin: 0 }, 110);
            }
        } else {
            ok = placeContainer(world, x, y, rng() < 0.5, rng, taken, spread);
        }
        if (ok) placed++;
    }
}

/* ----- Végétation et rochers ----- */

const NATURE = {
    [B.FORET]:    { rate: 1,     pick: r => (r < 0.72 ? 'tree' : r < 0.88 ? 'bush' : r < 0.95 ? 'rock' : 'stump') },
    [B.PLAINE]:   { rate: 0.075, pick: r => (r < 0.55 ? 'tree' : r < 0.85 ? 'bush' : 'rock') },
    [B.DESERT]:   { rate: 0.07,  pick: r => (r < 0.5 ? 'cactus' : r < 0.8 ? 'rock' : 'deadbush') },
    [B.MONTAGNE]: { rate: 0.3,   pick: r => (r < 0.5 ? 'rock' : r < 0.9 ? 'pine' : 'bush') },
    [B.NEIGE]:    { rate: 0.22,  pick: r => (r < 0.6 ? 'pine' : 'rock') },
    [B.BEACH]:    { rate: 0.05,  pick: () => 'palm' }
};

const TREE_COLORS = {
    [B.FORET]: ['#2e7a3c', '#378a44', '#26683a', '#3f8f3a'],
    [B.PLAINE]: ['#4fa34a', '#5cb14e', '#449a46', '#4fa34a', '#e08a2e']
};

/*
   Végétation par thème (la carte classique n'en a pas : NATURE / TREE_COLORS ci-dessus).
   Mêmes types d'objets (mêmes collisions), seulement d'autres couleurs, d'autres
   proportions et un décor au sol en plus : les tas de feuilles mortes ('leaves').
*/
const NATURE_THEMES = {
    autumn: {
        rules: {
            [B.FORET]:    { rate: 1,     pick: r => (r < 0.62 ? 'tree' : r < 0.75 ? 'bush' : r < 0.9 ? 'leaves' : r < 0.96 ? 'rock' : 'stump') },
            [B.PLAINE]:   { rate: 0.11,  pick: r => (r < 0.3 ? 'tree' : r < 0.55 ? 'bush' : r < 0.9 ? 'leaves' : 'rock') },
            [B.DESERT]:   { rate: 0.085, pick: r => (r < 0.55 ? 'rock' : r < 0.85 ? 'deadbush' : 'cactus') },
            [B.MONTAGNE]: { rate: 0.3,   pick: r => (r < 0.5 ? 'rock' : r < 0.9 ? 'pine' : 'bush') },
            [B.NEIGE]:    { rate: 0.22,  pick: r => (r < 0.6 ? 'pine' : 'rock') },
            [B.BEACH]:    { rate: 0.04,  pick: r => (r < 0.6 ? 'rock' : 'deadbush') }
        },
        trees: {
            [B.FORET]: ['#d9622b', '#c23b2e', '#e3a72f', '#b8452c', '#e07b2f', '#8a9a3a'],
            [B.PLAINE]: ['#e3a72f', '#d9822b', '#9aa43c', '#c9562e']
        },
        bush: { [B.FORET]: '#b5652c', [B.MONTAGNE]: '#6f7a52', default: '#a8a23e' },
        pine: '#2c5856',
        rock: { [B.DESERT]: '#b4583a', [B.MONTAGNE]: '#7a7290', [B.NEIGE]: '#bdb9d0', default: '#a39098' },
        bigRock: [B.DESERT, B.MONTAGNE, B.NEIGE],  // gros blocs (mesas du canyon)
        cactus: '#6b8f4a',
        deadbush: '#7a4f35',
        stump: '#7d4f33',
        leaves: [['#e07b2f', '#f2b04a'], ['#c23b2e', '#e3683f'], ['#e3a72f', '#f6cf63']]
    },
    // Carte Gun Game : prairie fleurie très ouverte, quelques bosquets pour casser les lignes de vue
    cargo: {
        rules: {
            [B.FORET]:    { rate: 0.5,   pick: r => (r < 0.5 ? 'tree' : r < 0.72 ? 'bush' : r < 0.93 ? 'leaves' : 'rock') },
            [B.PLAINE]:   { rate: 0.06,  pick: r => (r < 0.14 ? 'tree' : r < 0.36 ? 'bush' : r < 0.92 ? 'leaves' : 'rock') },
            [B.DESERT]:   { rate: 0.035, pick: r => (r < 0.5 ? 'rock' : r < 0.85 ? 'deadbush' : 'cactus') },
            [B.MONTAGNE]: { rate: 0.2,   pick: r => (r < 0.7 ? 'rock' : 'pine') },
            [B.NEIGE]:    { rate: 0.1,   pick: () => 'rock' },
            [B.BEACH]:    { rate: 0.025, pick: r => (r < 0.6 ? 'rock' : 'deadbush') }
        },
        trees: {
            [B.FORET]: ['#2f8f6f', '#3aa37c', '#287a63', '#45b08a'],
            [B.PLAINE]: ['#5db86f', '#4aa865', '#7cc46b']
        },
        bush: { [B.FORET]: '#2f8a62', default: '#5aa95d' },
        pine: '#2b6b5c',
        rock: { [B.DESERT]: '#c08a5a', [B.BEACH]: '#cdbb98', default: '#9aa4ad' },
        bigRock: [B.DESERT],
        cactus: '#5f9a55',
        deadbush: '#8a6a45',
        stump: '#7d5a3a',
        // Taches de fleurs sauvages (même dessin que les feuilles mortes de la carte 1V1)
        leaves: [['#f2c94c', '#fbe38a'], ['#e86a8a', '#f5a3b8'], ['#ffffff', '#dfe8ff'], ['#9b7cf0', '#c9b8ff']]
    }
};

// Variante thémée de makeNature (la carte classique garde exactement l'ancien code)
function makeThemedNature(type, x, y, biome, rng, th) {
    const o = { type, x, y, r: 30, cr: 0, layer: 'ground', nature: true, base: '#888888' };
    switch (type) {
        case 'tree':
            o.r = biome === B.FORET ? 62 + rng() * 36 : 50 + rng() * 30;
            o.base = pick(rng, th.trees[biome] || th.trees[B.PLAINE]);
            o.cr = o.r * 0.3;
            o.layer = 'top';
            o.pts = blobPoints(rng, o.r, 7 + Math.floor(rng() * 3), 0.07);
            break;
        case 'bush':
            o.r = 30 + rng() * 14;
            o.base = th.bush[biome] || th.bush.default;
            o.layer = 'top';
            o.pts = blobPoints(rng, o.r, 5, 0.1);
            break;
        case 'pine':
            o.r = 46 + rng() * 26;
            o.base = th.pine;
            o.cr = o.r * 0.28;
            o.layer = 'top';
            o.snowy = biome === B.NEIGE;
            o.pts = starPoints(rng, o.r, 10);
            break;
        case 'rock': {
            const big = th.bigRock.includes(biome);
            o.r = big ? 34 + rng() * 60 : 24 + rng() * 26;
            o.base = th.rock[biome] || th.rock.default;
            o.cr = o.r * 0.88;
            o.snowy = biome === B.NEIGE;
            o.pts = rockPoints(rng, o.r);
            break;
        }
        case 'cactus':
            o.r = 20 + rng() * 12;
            o.base = th.cactus;
            o.cr = o.r;
            o.flower = rng() < 0.3;
            break;
        case 'deadbush':
            o.r = 20 + rng() * 10;
            o.base = th.deadbush;
            o.branches = Array.from({ length: 5 }, () => rng() * Math.PI * 2);
            break;
        case 'stump':
            o.r = 20 + rng() * 8;
            o.base = th.stump;
            o.cr = o.r;
            break;
        case 'leaves': {
            // Tas de feuilles mortes : décor au sol, sans collision ni ombre
            o.r = 30 + rng() * 18;
            const [base, light] = pick(rng, th.leaves);
            o.base = base;
            o.alt = light;
            const n = 9 + Math.floor(rng() * 6);
            o.spots = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                const a = rng() * Math.PI * 2;
                const d = Math.sqrt(rng()) * o.r * 0.8;
                o.spots[i * 3] = Math.cos(a) * d;
                o.spots[i * 3 + 1] = Math.sin(a) * d;
                o.spots[i * 3 + 2] = rng() * Math.PI;
            }
            break;
        }
    }
    o.dark = shadeHex(o.base, -0.35);
    o.light = shadeHex(o.base, 0.16);
    return o;
}

// Contour "patate" d'un arbre ou buisson
function blobPoints(rng, r, bumps, amp) {
    const n = 26;
    const phase = rng() * Math.PI * 2;
    const pts = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const k = 1 + amp * Math.sin(a * bumps + phase) + amp * 0.5 * Math.sin(a * (bumps * 2 + 1) + phase * 2);
        pts[i * 2] = Math.cos(a) * r * k;
        pts[i * 2 + 1] = Math.sin(a) * r * k;
    }
    return pts;
}

function rockPoints(rng, r) {
    const n = 7 + Math.floor(rng() * 3);
    const start = rng() * Math.PI * 2;
    const pts = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
        const a = start + (i / n) * Math.PI * 2;
        const rr = r * (0.8 + rng() * 0.25);
        pts[i * 2] = Math.cos(a) * rr;
        pts[i * 2 + 1] = Math.sin(a) * rr;
    }
    return pts;
}

function starPoints(rng, r, spikes) {
    const pts = new Float32Array(spikes * 4);
    const start = rng() * Math.PI;
    for (let i = 0; i < spikes * 2; i++) {
        const a = start + (i / (spikes * 2)) * Math.PI * 2;
        const rr = (i % 2 === 0 ? r : r * 0.74) * (0.94 + rng() * 0.1);
        pts[i * 2] = Math.cos(a) * rr;
        pts[i * 2 + 1] = Math.sin(a) * rr;
    }
    return pts;
}

function makeNature(type, x, y, biome, rng) {
    const o = { type, x, y, r: 30, cr: 0, layer: 'ground', nature: true, base: '#888888' };
    switch (type) {
        case 'tree':
            o.r = biome === B.FORET ? 62 + rng() * 36 : 50 + rng() * 30;
            o.base = pick(rng, TREE_COLORS[biome] || TREE_COLORS[B.PLAINE]);
            o.cr = o.r * 0.3;
            o.layer = 'top';
            o.pts = blobPoints(rng, o.r, 7 + Math.floor(rng() * 3), 0.07);
            break;
        case 'bush':
            o.r = 30 + rng() * 14;
            o.base = biome === B.FORET ? '#4f9a3f' : biome === B.MONTAGNE ? '#6a8f4a' : '#6cbf4a';
            o.layer = 'top';
            o.pts = blobPoints(rng, o.r, 5, 0.1);
            break;
        case 'pine':
            o.r = 46 + rng() * 26;
            o.base = '#2f6b45';
            o.cr = o.r * 0.28;
            o.layer = 'top';
            o.snowy = biome === B.NEIGE;
            o.pts = starPoints(rng, o.r, 10);
            break;
        case 'palm':
            o.r = 55 + rng() * 18;
            o.base = '#5aa83c';
            o.cr = o.r * 0.22;
            o.layer = 'top';
            o.leaves = Array.from({ length: 6 }, (_, i) => (i / 6) * Math.PI * 2 + rng() * 0.4);
            break;
        case 'rock': {
            const big = biome === B.MONTAGNE || biome === B.NEIGE;
            o.r = big ? 34 + rng() * 60 : 24 + rng() * 26;
            o.base = biome === B.DESERT ? '#c99a62' : biome === B.MONTAGNE ? '#8f8a82' : biome === B.NEIGE ? '#aab4be' : '#9a9ea6';
            o.cr = o.r * 0.88;
            o.snowy = biome === B.NEIGE;
            o.pts = rockPoints(rng, o.r);
            break;
        }
        case 'cactus':
            o.r = 20 + rng() * 12;
            o.base = '#4f9a3c';
            o.cr = o.r;
            o.flower = rng() < 0.3;
            break;
        case 'deadbush':
            o.r = 20 + rng() * 10;
            o.base = '#9a7248';
            o.branches = Array.from({ length: 5 }, () => rng() * Math.PI * 2);
            break;
        case 'stump':
            o.r = 20 + rng() * 8;
            o.base = '#9a6a3c';
            o.cr = o.r;
            break;
    }
    o.dark = shadeHex(o.base, -0.35);
    o.light = shadeHex(o.base, 0.16);
    return o;
}

function canPlace(world, o, biome) {
    // Partie "au sol" : le tronc pour un arbre, tout l'objet sinon
    const foot = o.layer === 'top' ? o.r * 0.45 : o.r;

    if (distToRoads(world, o.x, o.y, foot + ROAD_WIDTH) < ROAD_WIDTH / 2 + foot + 6) return false;
    for (const b of world.buildings) {
        if (rectPointDist(b, o.x, o.y) < (o.layer === 'top' ? o.r * 0.6 : o.r) + 24) return false;
    }
    for (const f of world.fields) {
        if (rectPointDist(f, o.x, o.y) < o.r + 20) return false;
    }
    // Pas les pieds dans l'eau (sauf les palmiers, sur la plage)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (isWater(world.sampleGround(o.x + dx * foot, o.y + dy * foot).biome)) return false;
    }

    const near = world.render.query(o.x - o.r - 110, o.y - o.r - 110, o.x + o.r + 110, o.y + o.r + 110, world._segTmp);
    for (const n of near) {
        // Les feuilles mortes se glissent sous les feuillages (et inversement)
        if ((o.type === 'leaves' && n.layer === 'top') || (n.type === 'leaves' && o.layer === 'top')) continue;
        const d = Math.hypot(n.x - o.x, n.y - o.y);
        // En forêt, les feuillages se chevauchent pour faire un bois dense
        const dense = biome === B.FORET && n.type === 'tree' && o.type === 'tree';
        const min = dense ? (n.r + o.r) * 0.7 : (n.r + o.r) * 0.95 + 8;
        if (d < min) return false;
    }
    return true;
}

function scatterNature(world, rng, attempts = 30000) {
    const margin = Math.min(150, world.width * 0.05);
    const th = world.theme ? NATURE_THEMES[world.theme.id] || null : null;
    const rules = th ? th.rules : NATURE;
    for (let i = 0; i < attempts; i++) {
        const x = margin + rng() * (world.width - margin * 2);
        const y = margin + rng() * (world.height - margin * 2);
        const biome = world.sampleGround(x, y).biome;
        const rule = rules[biome];
        if (!rule || rng() > rule.rate) continue;

        const type = rule.pick(rng());

        // En ville : peu de végétation, jamais sur la place
        const town = townAt(world, x, y, 40);
        if (town) {
            if (rng() < 0.75) continue;
            if (!['tree', 'bush', 'pine', 'cactus', 'leaves'].includes(type)) continue;
            if (Math.hypot(x - town.x, y - town.y) < town.plazaR + 80) continue;
        }

        const o = th ? makeThemedNature(type, x, y, biome, rng, th) : makeNature(type, x, y, biome, rng);
        if (canPlace(world, o, biome)) addObject(world, o);
    }
}
