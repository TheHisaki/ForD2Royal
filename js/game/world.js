/* ==================================
   GÉNÉRATION DU MONDE - FOR2D ROYAL
   Île, biomes, lacs, chemins, villes et végétation.
   ================================== */

import {
    SEED, WORLD_SIZE, B, REGION_SEEDS, SNOW_PEAK, LAKES, TOWNS,
    ROAD_LINKS, ROAD_WIDTH, isWater
} from './config.js';
import { fbm, valueNoise, mulberry32 } from './noise.js';
import { SpatialGrid, shadeHex, pick, rectsOverlap, rectPointDist, segDist } from './utils.js';

/* ===================== SOL ===================== */

// Résultat réutilisé à chaque appel (évite de créer des millions d'objets)
export const ground = { biome: B.PLAINE, edge: 0, shade: 0.5 };

// Au-delà de cette distance (en rayons de lac), ni lac ni plage : 1,14 + 0,175 de bruit max (+ marge)
const LAKE_REACH = 1.14 + 0.175 + 0.01;

/*
   Que trouve-t-on au sol en (x, y) ?
   - ground.biome : le biome
   - ground.edge  : > 0 = bordure sombre entre deux biomes, < 0 = écume claire au bord de l'eau
   - ground.shade : petite variation de couleur (texture)
*/
export function sampleGround(x, y) {
    ground.edge = 0;
    ground.shade = valueNoise(x * 0.012, y * 0.012, SEED + 9);

    // Forme de l'île : un carré aux coins arrondis, avec une côte irrégulière
    const half = WORLD_SIZE / 2;
    const dx = (x - half) / half;
    const dy = (y - half) / half;
    let d = Math.sqrt(Math.sqrt(dx * dx * dx * dx + dy * dy * dy * dy));
    d += (fbm(x * 0.0011, y * 0.0011, SEED + 1, 3) - 0.5) * 0.14;

    if (d > 0.93) { ground.biome = B.OCEAN; return ground; }
    if (d > 0.895) {
        ground.biome = B.SHALLOW;
        if (d < 0.902) ground.edge = -1;
        return ground;
    }
    if (d > 0.86) { ground.biome = B.BEACH; return ground; }

    // Lacs (avec une petite plage autour)
    // Optimisation (résultat identique) : le bruit ne décale "ld" que de ±0,175 au plus,
    // donc au-delà de LAKE_REACH × rayon on n'est ni dans le lac ni sur sa plage :
    // on évite alors de calculer le bruit. Il ne dépend pas du lac : calculé une seule fois.
    let lakeNoise = NaN;
    for (const lake of LAKES) {
        const lx = x - lake.x;
        const ly = y - lake.y;
        const reach = lake.r * LAKE_REACH;
        if (lx * lx + ly * ly >= reach * reach) continue;
        if (lakeNoise !== lakeNoise) lakeNoise = (fbm(x * 0.004, y * 0.004, SEED + 4, 2) - 0.5) * 0.35;
        const ld = Math.hypot(lx, ly) / lake.r + lakeNoise;
        if (ld < 1) {
            ground.biome = B.LAC;
            if (ld > 0.95) ground.edge = -1;
            return ground;
        }
        if (ld < 1.14) { ground.biome = B.BEACH; return ground; }
    }

    // Régions : on déforme les coordonnées pour des frontières ondulées
    const wx = x + (fbm(x * 0.0008, y * 0.0008, SEED + 2, 3) - 0.5) * 900;
    const wy = y + (fbm(x * 0.0008, y * 0.0008, SEED + 3, 3) - 0.5) * 900;

    // Graine la plus proche, puis la plus proche d'un AUTRE biome.
    // On compare les distances au carré (même ordre, sans racine) et on ne calcule
    // la vraie distance que pour les 2 graines retenues.
    let q1 = Infinity;
    let s1 = null;
    for (const s of REGION_SEEDS) {
        const ex = wx - s.x;
        const ey = wy - s.y;
        const q = ex * ex + ey * ey;
        if (q < q1) { q1 = q; s1 = s; }
    }
    const b1 = s1 ? s1.b : B.PLAINE;
    let q2 = Infinity;
    let s2 = null;
    for (const s of REGION_SEEDS) {
        if (s.b === b1) continue;
        const ex = wx - s.x;
        const ey = wy - s.y;
        const q = ex * ex + ey * ey;
        if (q < q2) { q2 = q; s2 = s; }
    }
    const d1 = s1 ? Math.hypot(wx - s1.x, wy - s1.y) : Infinity;
    const d2 = s2 ? Math.hypot(wx - s2.x, wy - s2.y) : Infinity;
    const gap = d2 - d1; // 0 pile sur la frontière
    if (gap < 22) ground.edge = 1 - gap / 22;
    ground.biome = b1;

    if (b1 === B.MONTAGNE) {
        const sd = Math.hypot(x - SNOW_PEAK.x, y - SNOW_PEAK.y) / SNOW_PEAK.radius +
                   (fbm(x * 0.003, y * 0.003, SEED + 5, 2) - 0.5) * 0.5;
        if (sd < 1) {
            ground.biome = B.NEIGE;
            if (sd > 0.96) ground.edge = Math.max(ground.edge, 0.6);
        }
    } else if (b1 === B.DESERT) {
        // Dunes : bandes ondulées
        ground.shade = 0.5 + 0.5 * Math.sin(x * 0.011 + y * 0.005 +
                       fbm(x * 0.002, y * 0.002, SEED + 7, 2) * 9);
    }
    return ground;
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
    const b = sampleGround(x, y).biome;
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

export function nearestLake(x, y) {
    let best = LAKES[0];
    let bestD = Infinity;
    for (const l of LAKES) {
        const d = Math.hypot(x - l.x, y - l.y);
        if (d < bestD) { bestD = d; best = l; }
    }
    return best;
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

export function generateWorld() {
    const rng = mulberry32(SEED);
    const world = {
        towns: TOWNS.map(t => ({ ...t })),
        roads: [],
        buildings: [],
        fields: [],
        objects: [],
        roadGrid: new SpatialGrid(300),
        collide: new SpatialGrid(250),  // ce qui bloque le joueur
        render: new SpatialGrid(250),   // ce qui se dessine
        _segTmp: []
    };

    buildRoads(world, rng);
    for (const town of world.towns) buildTown(world, town, rng);
    scatterNature(world, rng);
    return world;
}

/* ----- Chemins ----- */

function buildRoads(world, rng) {
    const byId = id => world.towns.find(t => t.id === id);

    for (const [a, b] of ROAD_LINKS) {
        const A = byId(a);
        const C = byId(b);
        const len = Math.hypot(C.x - A.x, C.y - A.y);
        const nx = -(C.y - A.y) / len;
        const ny = (C.x - A.x) / len;
        // Point de contrôle décalé sur le côté : chemin courbe
        const off = (rng() - 0.5) * 0.32 * len;
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
        world.roads.push({
            points,
            width: ROAD_WIDTH,
            bbox: { minX: minX - m, minY: minY - m, maxX: maxX + m, maxY: maxY + m }
        });

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
    }
};

function buildTown(world, town, rng) {
    const st = STYLES[town.style];
    town.plazaR = Math.round(town.radius * 0.3);
    town.plaza = st.plaza;
    town.plazaEdge = st.plazaEdge;
    const taken = [];

    // Élément central de la place
    if (town.style === 'city') addProp(world, 'fountain', town.x, town.y, 75);
    if (town.style === 'desert') addProp(world, 'well', town.x, town.y, 42);

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
        if (rectTouchesWater(rect)) continue;

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

function rectTouchesWater(r) {
    const pts = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h], [r.x + r.w / 2, r.y + r.h / 2]];
    return pts.some(([x, y]) => {
        const b = sampleGround(x, y).biome;
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

function addProp(world, type, x, y, r) {
    const base = PROP_COLORS[type];
    addObject(world, {
        type, x, y, r, cr: r, layer: 'ground', nature: false,
        base, dark: shadeHex(base, -0.35), light: shadeHex(base, 0.2)
    });
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
        if (isWater(sampleGround(o.x + dx * foot, o.y + dy * foot).biome)) return false;
    }

    const near = world.render.query(o.x - o.r - 110, o.y - o.r - 110, o.x + o.r + 110, o.y + o.r + 110, world._segTmp);
    for (const n of near) {
        const d = Math.hypot(n.x - o.x, n.y - o.y);
        // En forêt, les feuillages se chevauchent pour faire un bois dense
        const dense = biome === B.FORET && n.type === 'tree' && o.type === 'tree';
        const min = dense ? (n.r + o.r) * 0.7 : (n.r + o.r) * 0.95 + 8;
        if (d < min) return false;
    }
    return true;
}

function scatterNature(world, rng) {
    const attempts = 30000;
    for (let i = 0; i < attempts; i++) {
        const x = 150 + rng() * (WORLD_SIZE - 300);
        const y = 150 + rng() * (WORLD_SIZE - 300);
        const biome = sampleGround(x, y).biome;
        const rule = NATURE[biome];
        if (!rule || rng() > rule.rate) continue;

        const type = rule.pick(rng());

        // En ville : peu de végétation, jamais sur la place
        const town = townAt(world, x, y, 40);
        if (town) {
            if (rng() < 0.75) continue;
            if (!['tree', 'bush', 'pine', 'cactus'].includes(type)) continue;
            if (Math.hypot(x - town.x, y - town.y) < town.plazaR + 80) continue;
        }

        const o = makeNature(type, x, y, biome, rng);
        if (canPlace(world, o, biome)) addObject(world, o);
    }
}
