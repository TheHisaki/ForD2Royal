/* ==================================
   BUTIN - FOR2D ROYAL
   Coffres, objets au sol, ramassage et objets lâchés.
   Le contenu change à chaque partie (Math.random).
   ================================== */

import { isWater } from './config.js?v=12';
import { townAt } from './world.js?v=12';
import { rectPointDist } from './utils.js';
import { RARITIES, AMMO_TYPES, WEAPONS, LOOT_WEAPONS, HEALS, THROWABLES, INVENTORY_SLOTS, drawWeapon } from './weapons.js';
import { iconCanvas } from './icons.js';

// Icônes du butin au sol (même dessin que la hotbar)
const ICON_PX = 128;          // résolution du canvas mis en cache (net même zoomé)
const WEAPON_ICON_SIZE = 64;  // taille à l'écran, en unités monde
const HEAL_ICON_SIZE = 40;

const TAU = Math.PI * 2;
const SLOTS = INVENTORY_SLOTS;
const CHEST_R = 24;
const WALL_T = 16;            // épaisseur des murs (voir makeWalls dans world.js)
const CHEST_WALL_GAP = 56;    // espace coffre ↔ mur (le joueur, 52 de large, peut passer)
const WILD_CHESTS = 25;
const ITEM_R = 12;            // encombrement d'un objet au sol (pour ne pas le poser dans un mur)
const OPEN_TIME = 0.35;       // durée de l'ouverture d'un coffre (s)
const POP_TIME = 0.35;        // durée de l'apparition d'un objet (s)
const AUTO_AMMO_RANGE = 55;   // distance de ramassage automatique des munitions
const GRID_CELL = 300;        // taille d'une case de la grille de recherche du butin
const DRAW_MARGIN = 80;       // marge de dessin autour de la vue

// Chances de rareté, de Commun à Légendaire
const RARITY_WEIGHTS = [
    [44, 30, 17, 7, 2],   // 0 : au sol
    [14, 34, 31, 16, 5]   // 1 : dans un coffre (un peu meilleur)
];

const WEAPON_WEIGHTS = { pistol: 22, crossbow: 9, ricochet: 9, smg: 20, ar: 22, shotgun: 14, sniper: 8 };
const HEAL_WEIGHTS = { bandage: 35, medkit: 18, shieldPotion: 22, healingSpray: 15, stimPatch: 10 };
const THROWABLE_WEIGHTS = { smoke: 30, explosive: 35, flash: 20, propulsion: 15 };
const HEAL_COUNT = { bandage: 3, medkit: 1, shieldPotion: 1, healingSpray: 1, stimPatch: 1 };
const AMMO_DROP = { light: 30, medium: 30, heavy: 6, shells: 10, bolts: 6 };
const AMMO_BOX = { light: [18, 13], medium: [22, 15], heavy: [24, 17], shells: [22, 15], bolts: [20, 15] };

/* ===================== OUTILS ===================== */

// Tirage pondéré : entries = [[valeur, poids], ...]
function weighted(entries) {
    let total = 0;
    for (const e of entries) total += e[1];
    let r = Math.random() * total;
    for (const e of entries) {
        r -= e[1];
        if (r < 0) return e[0];
    }
    return entries[entries.length - 1][0];
}

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeOutBack = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

// Couleur "#rgb", "#rrggbb" ou "rgb(...)" -> [r, g, b] (mis en cache)
const rgbCache = new Map();
function parseColor(color) {
    let c = rgbCache.get(color);
    if (c) return c;
    c = [200, 200, 200];
    if (typeof color === 'string') {
        if (color[0] === '#') {
            let h = color.slice(1);
            if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
            const n = parseInt(h.slice(0, 6), 16);
            if (!Number.isNaN(n)) c = [n >> 16, (n >> 8) & 255, n & 255];
        } else {
            const m = color.match(/\d+(\.\d+)?/g);
            if (m && m.length >= 3) c = [+m[0], +m[1], +m[2]];
        }
    }
    rgbCache.set(color, c);
    return c;
}

const rgba = (color, a) => {
    const c = parseColor(color);
    return `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;
};

// k > 0 : plus clair, k < 0 : plus sombre
const shade = (color, k) => {
    const c = parseColor(color);
    const f = (v) => (k < 0 ? v * (1 + k) : v + (255 - v) * k) | 0;
    return `rgb(${f(c[0])}, ${f(c[1])}, ${f(c[2])})`;
};

function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// Petite étoile scintillante à 4 branches
function sparkle(ctx, x, y, s, a) {
    // Transparence via globalAlpha : pas de nouvelle chaîne de couleur à chaque image
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgb(255, 255, 240)';
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x, y, x + s, y);
    ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y);
    ctx.quadraticCurveTo(x, y, x, y - s);
    ctx.fill();
    ctx.globalAlpha = 1;
}

function ammoName(type) {
    const n = AMMO_TYPES[type]?.name || type;
    return /munition|cartouche/i.test(n) ? n : `Munitions ${n.toLowerCase()}`;
}

const isPickaxe = (s) => s && s.kind === 'weapon' &&
    (s.weaponId === 'pickaxe' || WEAPONS[s.weaponId]?.type === 'melee');

/*
   Grille dimensionnée par monde : une partie duel ne doit jamais utiliser une
   grille 20x20 ni des cases conçues pour 6000 unités.
*/
class PointGrid {
    constructor(width, height) {
        this.nx = Math.max(1, Math.ceil(width / GRID_CELL));
        this.ny = Math.max(1, Math.ceil(height / GRID_CELL));
        this.cells = new Array(this.nx * this.ny);
        for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    }

    cellOf(v, n) {
        const c = Math.floor(v / GRID_CELL);
        return c < 0 ? 0 : c >= n ? n - 1 : c;
    }

    add(o) {
        o._cell = this.cellOf(o.y, this.ny) * this.nx + this.cellOf(o.x, this.nx);
        this.cells[o._cell].push(o);
    }

    remove(o) {
        const list = this.cells[o._cell];
        if (!list) return;
        const i = list.indexOf(o);
        if (i < 0) return;
        list[i] = list[list.length - 1];
        list.pop();
    }

    query(minX, minY, maxX, maxY, out) {
        out.length = 0;
        const x0 = this.cellOf(minX, this.nx);
        const x1 = this.cellOf(maxX, this.nx);
        const y0 = this.cellOf(minY, this.ny);
        const y1 = this.cellOf(maxY, this.ny);
        for (let cy = y0; cy <= y1; cy++) {
            const row = cy * this.nx;
            for (let cx = x0; cx <= x1; cx++) {
                const list = this.cells[row + cx];
                for (let k = 0; k < list.length; k++) out.push(list[k]);
            }
        }
        return out;
    }
}

/* ===================== BUTIN ===================== */

export class Loot {
    constructor(world, seed = null) {
        this.world = world;
        this.seed = seed;
        this.chests = [];
        this.items = [];
        this._nextItem = 1;
        /*
           Multijoueur (branché par main.js) :
           - idPrefix : préfixe propre à ce joueur, pour que les objets créés en cours de
             partie aient un identifiant unique sur toutes les machines (le butin du
             début de partie, tiré avec la graine commune, garde des numéros identiques) ;
           - onSpawn(item) : un objet vient d'apparaître ici (à diffuser) ;
           - onTake(f, item) : f vient de ramasser tout ou partie de l'objet (à diffuser).
           Les objets reçus du réseau passent par addRemote / takeRemote (pas de rediffusion).
        */
        this.idPrefix = null;
        this.onSpawn = null;
        this.onTake = null;
        this._byId = new Map();
        this._tmp = [];
        this._q = [];                    // tableau temporaire des recherches
        this._chestGrid = new PointGrid(world.width, world.height);
        this._itemGrid = new PointGrid(world.width, world.height);
        this._opening = [];              // coffres en cours d'ouverture (animation)
        this._popping = [];              // objets en cours d'apparition (animation)
        this._styleCtx = null;           // dégradés mis en cache pour ce contexte
        this._styles = new Map();
        this._chestGlow = null;
        this._chestLid = null;

        // 1 coffre par bâtiment, 2 dans les grands (placés en diagonale)
        for (const b of world.buildings) {
            if (b.w * b.h > 70000) {
                const fx = Math.random() * 0.2;
                const fy = Math.random() * 0.2;
                const flip = Math.random() < 0.5;
                this._chestInBuilding(b, fx, flip ? 1 - fy : fy);
                this._chestInBuilding(b, 1 - fx, flip ? fy : 1 - fy);
            } else {
                this._chestInBuilding(b, Math.random(), Math.random());
            }
        }

        this._wildChests(WILD_CHESTS);

        // Un peu de butin au sol dans environ 1 bâtiment sur 2
        for (const b of world.buildings) {
            if (Math.random() < 0.5) this._floorLoot(b);
        }
    }

    /* ----- Tirages ----- */

    // bonus 0 = butin au sol, 1 = coffre
    rollWeapon(bonus = 0) {
        const table = RARITY_WEIGHTS[Math.max(0, Math.min(RARITY_WEIGHTS.length - 1, bonus | 0))];
        const rarity = weighted(table.slice(0, RARITIES.length).map((w, i) => [i, w]));
        const weaponId = weighted(LOOT_WEAPONS.map(id => [id, WEAPON_WEIGHTS[id] ?? 15]));
        return { kind: 'weapon', weaponId, rarity, mag: WEAPONS[weaponId]?.magSize ?? 0 };
    }

    rollHeal() {
        let ids = Object.keys(HEAL_WEIGHTS).filter(id => HEALS[id]);
        if (!ids.length) ids = Object.keys(HEALS);
        const itemId = weighted(ids.map(id => [id, HEAL_WEIGHTS[id] ?? 20]));
        const stack = HEALS[itemId]?.stack || 1;
        return { kind: 'heal', itemId, count: Math.min(stack, HEAL_COUNT[itemId] ?? 1) };
    }

    rollThrowable() {
        const ids = Object.keys(THROWABLE_WEIGHTS).filter(id => THROWABLES[id]);
        const itemId = weighted(ids.map(id => [id, THROWABLE_WEIGHTS[id]]));
        return { kind: 'throwable', itemId, count: 1 };
    }

    rollAmmo() {
        const types = Object.keys(AMMO_TYPES);
        const ammoType = types[Math.floor(Math.random() * types.length)];
        return { kind: 'ammo', ammoType, amount: AMMO_DROP[ammoType] ?? 20 };
    }

    // Munitions adaptées à une arme (≈ 2 chargeurs)
    _ammoFor(weaponId) {
        const w = WEAPONS[weaponId];
        if (!w || !w.ammo) return null;
        return { kind: 'ammo', ammoType: w.ammo, amount: Math.max(6, (w.magSize || 10) * 2) };
    }

    /* ----- Placement ----- */

    _addChest(x, y, rot) {
        const c = { id: this.chests.length, x, y, r: CHEST_R, opened: false, openT: 0, rot, _cell: 0 };
        this.chests.push(c);
        this._chestGrid.add(c);
        this.world.collide.insert({ kind: 'circle', x, y, r: CHEST_R },
            x - CHEST_R, y - CHEST_R, x + CHEST_R, y + CHEST_R);
        return c;
    }

    // Vrai si un cercle (x, y, r) touche un obstacle ou sort du monde
    _blocked(x, y, r) {
        if (x < r || y < r || x > this.world.width - r || y > this.world.height - r) return true;
        const list = this.world.collide.query(x - r, y - r, x + r, y + r, this._tmp);
        for (const o of list) {
            if (o.duelBoundary && !this.world.duelBoundaryActive) continue;
            if (o.kind === 'circle') {
                if (Math.hypot(o.x - x, o.y - y) < o.r + r) return true;
            } else if (rectPointDist(o, x, y) < r) {
                return true;
            }
        }
        return false;
    }

    _onLand(x, y, r) {
        if (isWater(this.world.sampleGround(x, y).biome)) return false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (isWater(this.world.sampleGround(x + dx * r, y + dy * r).biome)) return false;
        }
        return true;
    }

    // Milieux des côtés sans mur = portes
    _doors(b) {
        const mids = [
            [b.x + b.w / 2, b.y + WALL_T / 2],
            [b.x + b.w / 2, b.y + b.h - WALL_T / 2],
            [b.x + WALL_T / 2, b.y + b.h / 2],
            [b.x + b.w - WALL_T / 2, b.y + b.h / 2]
        ];
        return mids.filter(([x, y]) =>
            !b.walls.some(w => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h));
    }

    // fx, fy : position voulue (0..1) dans la zone autorisée du bâtiment
    _chestInBuilding(b, fx, fy) {
        const m = WALL_T + CHEST_R + CHEST_WALL_GAP;
        const x0 = b.x + m, x1 = b.x + b.w - m;
        const y0 = b.y + m, y1 = b.y + b.h - m;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        const doors = this._doors(b);
        const rot = Math.random() < 0.5 ? 0 : Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);

        for (let i = 0; i < 30; i++) {
            const jitter = i === 0 ? 0 : 0.1 + i * 0.03;
            const ux = Math.min(1, Math.max(0, fx + (Math.random() - 0.5) * jitter));
            const uy = Math.min(1, Math.max(0, fy + (Math.random() - 0.5) * jitter));
            const x = x1 > x0 ? x0 + ux * (x1 - x0) : cx;
            const y = y1 > y0 ? y0 + uy * (y1 - y0) : cy;
            if (doors.some(([dx, dy]) => Math.hypot(dx - x, dy - y) < 90)) continue;
            if (this.chests.some(c => Math.hypot(c.x - x, c.y - y) < 100)) continue;
            if (this._blocked(x, y, CHEST_R + 8)) continue;
            return this._addChest(x, y, rot);
        }
        return null;
    }

    // Coffres "sauvages" sur la terre ferme, hors des villes
    _wildChests(count) {
        let placed = 0;
        for (const spacing of [450, 280]) {
            for (let i = 0; i < 4000 && placed < count; i++) {
                const x = 250 + Math.random() * (this.world.width - 500);
                const y = 250 + Math.random() * (this.world.height - 500);
                if (this.chests.some(c => Math.hypot(c.x - x, c.y - y) < spacing)) continue;
                if (townAt(this.world, x, y, 80)) continue;
                if (this.world.buildings.some(b => rectPointDist(b, x, y) < CHEST_R + 80)) continue;
                if (!this._onLand(x, y, CHEST_R + 30)) continue;
                if (this._blocked(x, y, CHEST_R + 40)) continue;
                this._addChest(x, y, Math.random() * TAU);
                placed++;
            }
        }
    }

    // Point libre à l'intérieur d'un bâtiment (loin des murs, coffres et autres objets)
    _freeInside(b, m) {
        for (let i = 0; i < 25; i++) {
            const x = b.x + m + Math.random() * Math.max(0, b.w - 2 * m);
            const y = b.y + m + Math.random() * Math.max(0, b.h - 2 * m);
            if (this.chests.some(c => Math.hypot(c.x - x, c.y - y) < c.r + 45)) continue;
            if (this.items.some(it => Math.hypot(it.x - x, it.y - y) < 60)) continue;
            if (this._blocked(x, y, ITEM_R + 4)) continue;
            return { x, y };
        }
        return null;
    }

    _floorLoot(b) {
        const m = WALL_T + 36;
        const n = Math.random() < 0.35 ? 2 : 1;
        for (let i = 0; i < n; i++) {
            const p = this._freeInside(b, m);
            if (!p) continue;
            const r = Math.random();
            if (r < 0.48) {
                // Arme + ses munitions juste à côté
                const w = this.rollWeapon(0);
                this._spawn(w, p.x, p.y);
                const ammo = this._ammoFor(w.weaponId);
                if (ammo) {
                    const a = Math.random() * TAU;
                    const ax = Math.min(b.x + b.w - m, Math.max(b.x + m, p.x + Math.cos(a) * 36));
                    const ay = Math.min(b.y + b.h - m, Math.max(b.y + m, p.y + Math.sin(a) * 36));
                    this._spawn(ammo, ax, ay);
                }
            } else if (r < 0.78) {
                this._spawn(this.rollHeal(), p.x, p.y);
            } else if (r < 0.9) {
                this._spawn(this.rollThrowable(), p.x, p.y);
            } else {
                this._spawn(this.rollAmmo(), p.x, p.y);
            }
        }
    }

    // Jette un objet (case d'inventaire ou munitions) devant le combattant, avec l'animation
    // d'apparition. Les munitions jetées ne sont pas ramassées automatiquement tout de suite.
    throwItem(f, data) {
        const p = this._spot(f.x, f.y, f.angle || 0, (f.r || 26) + 40);
        const it = this.drop(data, p.x, p.y, f.x, f.y);
        if (it && it.kind === 'ammo') {
            it.droppedBy = f;
            (this._dropped || (this._dropped = [])).push(it);
        }
        return it;
    }

    // Point libre à distance "dist" de (cx, cy), le plus près possible de l'angle a
    _spot(cx, cy, a, dist) {
        for (let k = 0; k < 15; k++) {
            const aa = a + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.45;
            const x = cx + Math.cos(aa) * dist;
            const y = cy + Math.sin(aa) * dist;
            if (!this._blocked(x, y, ITEM_R)) return { x, y };
        }
        return { x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist };
    }

    // Crée un objet au sol ; (fromX, fromY) = point de départ de l'animation d'apparition
    _spawn(data, x, y, fromX, fromY, forcedId) {
        const animate = fromX !== undefined;
        const n = this._nextItem++;
        const it = {
            id: forcedId ?? (this.idPrefix ? `${this.idPrefix}${n}` : n),
            x, y,
            kind: data.kind,
            weaponId: data.weaponId ?? null,
            rarity: data.rarity ?? 0,
            mag: data.mag ?? 0,
            ammoType: data.ammoType ?? null,
            amount: data.amount ?? 0,
            itemId: data.itemId ?? null,
            count: data.count ?? 0,
            t: Math.random() * 10,      // phase du flottement (ajoutée au temps du jeu)
            pop: animate ? 0 : 1,       // 0 -> 1 pendant l'apparition
            sx: animate ? fromX : x,
            sy: animate ? (fromY ?? y) : y,
            gone: false,                // true une fois ramassé (retiré du sol)
            _cell: 0
        };
        this.items.push(it);
        this._itemGrid.add(it);
        this._byId.set(it.id, it);
        if (animate) this._popping.push(it);
        if (forcedId === undefined) this.onSpawn?.(it);
        return it;
    }

    _remove(item) {
        const i = this.items.indexOf(item);
        if (i < 0) return;
        this.items.splice(i, 1);
        this._itemGrid.remove(item);
        this._byId.delete(item.id);
        item.gone = true;
    }

    /* ----- Multijoueur ----- */

    getItem(id) {
        return this._byId.get(id) || null;
    }

    // Données à envoyer pour recréer l'objet à l'identique sur une autre machine
    serialize(it) {
        return {
            id: it.id, x: Math.round(it.x), y: Math.round(it.y),
            sx: Math.round(it.sx), sy: Math.round(it.sy), pop: it.pop < 1 ? 0 : 1,
            kind: it.kind, weaponId: it.weaponId, rarity: it.rarity, mag: it.mag,
            ammoType: it.ammoType, amount: it.amount, itemId: it.itemId, count: it.count
        };
    }

    // Objet apparu chez un autre joueur (coffre ouvert, mort, objet jeté...)
    addRemote(d) {
        if (!d || d.id == null || this._byId.has(d.id)) return null;
        if (!['weapon', 'heal', 'throwable', 'ammo'].includes(d.kind)) return null;
        const animate = d.pop === 0;
        return this._spawn(d, d.x, d.y, animate ? d.sx : undefined, animate ? d.sy : undefined, d.id);
    }

    // Objet ramassé chez un autre joueur : left = quantité restée au sol (0 = disparu)
    takeRemote(id, left) {
        const it = this._byId.get(id);
        if (!it || it.gone) return null;
        if (left > 0 && (it.kind === 'heal' || it.kind === 'throwable')) it.count = left;
        else if (left > 0 && it.kind === 'ammo') it.amount = left;
        else this._remove(it);
        return it;
    }

    /* ----- Recherche rapide (grille) ----- */

    // Coffres (ouverts ou non) dont la position est dans les cases du rectangle
    queryChests(minX, minY, maxX, maxY, out = []) {
        return this._chestGrid.query(minX, minY, maxX, maxY, out);
    }

    // Objets au sol dont la position est dans les cases du rectangle
    queryItems(minX, minY, maxX, maxY, out = []) {
        return this._itemGrid.query(minX, minY, maxX, maxY, out);
    }

    // Le coffre est-il encore fermé / l'objet encore au sol ?
    isAvailable(t) {
        if (!t) return false;
        if ('opened' in t) return !t.opened;
        return !t.gone;
    }

    /* ----- Interactions ----- */

    // Ouvre un coffre : arme, munitions et soin en éventail (vers celui qui l'ouvre)
    // spawn = false : coffre ouvert chez un autre joueur (son butin arrive par le réseau)
    openChest(chest, f = null, spawn = true) {
        if (!chest || chest.opened) return false;
        chest.opened = true;
        chest.openT = 0;
        this._opening.push(chest);
        this.onChestOpen?.(chest, f, spawn); // effets visuels (branchés par le jeu)
        if (!spawn) return true;

        const prevRand = Math.random;
        if (this.seed != null) {
            let _a = ((this.seed + chest.id * 10007) >>> 0) || 1;
            Math.random = function() {
                _a = (_a + 0x6D2B79F5) | 0;
                let t = Math.imul(_a ^ (_a >>> 15), 1 | _a);
                t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
        }

        const weapon = this.rollWeapon(1);
        const loot = [weapon, this._ammoFor(weapon.weaponId), Math.random() < 0.35 ? this.rollThrowable() : this.rollHeal()].filter(Boolean);
        const base = f ? Math.atan2(f.y - chest.y, f.x - chest.x) : chest.rot + Math.PI / 2;
        loot.forEach((data, i) => {
            const a = base + (i - (loot.length - 1) / 2) * 0.75;
            const p = this._spot(chest.x, chest.y, a, chest.r + 34);
            this._spawn(data, p.x, p.y, chest.x, chest.y);
        });

        if (this.seed != null) {
            Math.random = prevRand;
        }

        return true;
    }

    // Coffre fermé ou objet le plus proche de f
    nearestInteractable(f, range = 80) {
        if (!f || f.alive === false || (f.phase && f.phase !== 'ground')) return null;
        let best = null;
        let kind = null;
        let bestD = range;
        const q = this._q;

        // Seulement les cases autour de f (grille) au lieu de toute la carte
        const cr = range + CHEST_R;
        this._chestGrid.query(f.x - cr, f.y - cr, f.x + cr, f.y + cr, q);
        for (let i = 0; i < q.length; i++) {
            const c = q[i];
            if (c.opened) continue;
            const d = Math.hypot(c.x - f.x, c.y - f.y) - c.r; // distance au bord du coffre
            if (d < bestD) { bestD = d; best = c; kind = 'chest'; }
        }
        this._itemGrid.query(f.x - range, f.y - range, f.x + range, f.y + range, q);
        for (let i = 0; i < q.length; i++) {
            const it = q[i];
            const dx = it.x - f.x;
            const dy = it.y - f.y;
            if (dx > bestD || dx < -bestD || dy > bestD || dy < -bestD) continue;
            const d = Math.hypot(dx, dy);
            if (d < bestD) { bestD = d; best = it; kind = 'item'; }
        }
        q.length = 0;
        return best ? { kind, target: best } : null;
    }

    interact(f) {
        const n = this.nearestInteractable(f);
        if (!n) return false;
        if (n.kind === 'chest') return this.openChest(n.target, f);
        const ok = this.pickUp(f, n.target);
        if (ok) this.onPickup?.(f, n.target, this._itemColor(n.target)); // effets visuels
        return ok;
    }

    // Ramassage automatique des munitions en passant dessus (joueur, si l'option est active).
    // Renvoie le nombre de piles ramassées. Les objets encore en train d'apparaître
    // (qui volent hors d'un coffre) attendent d'être posés.
    autoPickupAmmo(f, range = AUTO_AMMO_RANGE) {
        if (!f || f.alive === false || (f.phase && f.phase !== 'ground')) return 0;
        // Munitions jetées : de nouveau ramassables une fois que leur lanceur s'est éloigné
        const dropped = this._dropped;
        if (dropped && dropped.length) {
            const far = (range + 60) * (range + 60);
            let k = 0;
            for (let i = 0; i < dropped.length; i++) {
                const it = dropped[i];
                if (it.gone || !it.droppedBy) continue;
                if (it.droppedBy === f && (it.x - f.x) ** 2 + (it.y - f.y) ** 2 > far) {
                    it.droppedBy = null;
                    continue;
                }
                dropped[k++] = it;
            }
            dropped.length = k;
        }
        const near = this.queryItems(f.x - range, f.y - range, f.x + range, f.y + range,
            this._autoTmp || (this._autoTmp = []));
        const r2 = range * range;
        let n = 0;
        for (let i = 0; i < near.length; i++) {
            const it = near[i];
            if (it.kind !== 'ammo' || it.gone || it.pop < 1) continue;
            const dx = it.x - f.x;
            const dy = it.y - f.y;
            // Munitions jetées par ce joueur : pas reprises tant qu'il ne s'est pas éloigné
            if (it.droppedBy === f) continue;
            if (dx * dx + dy * dy > r2) continue;
            if (this.pickUp(f, it)) {
                this.onPickup?.(f, it, this._itemColor(it));
                n++;
            }
        }
        return n;
    }

    pickUp(f, item) {
        const ok = this._pickUp(f, item);
        if (ok) this.onTake?.(f, item);
        return ok;
    }

    _pickUp(f, item) {
        if (!f || !item || !f.inventory) return false;
        const inv = f.inventory;

        if (item.kind === 'ammo') {
            if (!f.ammo) f.ammo = {};
            f.ammo[item.ammoType] = (f.ammo[item.ammoType] || 0) + item.amount;
            this._remove(item);
            return true;
        }

        if (item.kind === 'heal') {
            const stack = HEALS[item.itemId]?.stack || 1;
            let left = item.count;
            // D'abord compléter les piles existantes...
            for (let i = 1; i < SLOTS && left > 0; i++) {
                const s = inv[i];
                if (s && s.kind === 'heal' && s.itemId === item.itemId && s.count < stack) {
                    const add = Math.min(stack - s.count, left);
                    s.count += add;
                    left -= add;
                }
            }
            // ... puis les cases vides
            for (let i = 1; i < SLOTS && left > 0; i++) {
                if (!inv[i]) {
                    const add = Math.min(stack, left);
                    inv[i] = { kind: 'heal', itemId: item.itemId, count: add };
                    left -= add;
                }
            }
            if (left < item.count) {
                if (left > 0) item.count = left;   // le surplus reste au sol
                else this._remove(item);
                return true;
            }
            // Aucune place : échange avec l'objet en main, comme pour les armes
            const slot = this._swapSlot(f);
            const held = inv[slot];
            // Même soin en main (pile pleine) : l'échange ne servirait à rien
            if (held && held.kind === 'heal' && held.itemId === item.itemId) return false;
            this._remove(item);
            this._swapOut(f, slot, item.x, item.y);
            inv[slot] = { kind: 'heal', itemId: item.itemId, count: Math.min(stack, item.count) };
            // Plus que la taille d'une pile (ne devrait pas arriver) : le reste reste au sol
            if (item.count > stack) this.drop({ kind: 'heal', itemId: item.itemId, count: item.count - stack }, item.x, item.y);
            return true;
        }

        if (item.kind === 'throwable') {
            const stack = THROWABLES[item.itemId] ? 3 : 1;
            let slot = -1;
            for (let i = 1; i < SLOTS; i++) {
                if (inv[i]?.kind === 'throwable' && inv[i].itemId === item.itemId && inv[i].count < stack) { slot = i; break; }
                if (slot < 0 && !inv[i]) slot = i;
            }
            if (slot >= 0) {
                if (inv[slot]?.kind === 'throwable' && inv[slot].itemId === item.itemId) inv[slot].count += item.count;
                else inv[slot] = { kind: 'throwable', itemId: item.itemId, count: Math.min(stack, item.count) };
                this._remove(item);
                return true;
            }
            const swap = this._swapSlot(f);
            this._remove(item);
            this._swapOut(f, swap, item.x, item.y);
            inv[swap] = { kind: 'throwable', itemId: item.itemId, count: Math.min(stack, item.count) };
            return true;
        }

        if (item.kind === 'weapon') {
            const data = { kind: 'weapon', weaponId: item.weaponId, rarity: item.rarity, mag: item.mag };
            let slot = -1;
            for (let i = 1; i < SLOTS; i++) {
                if (!inv[i]) { slot = i; break; }
            }
            this._remove(item);
            if (slot < 0) {
                // Inventaire plein : échange avec l'objet en main
                slot = this._swapSlot(f);
                this._swapOut(f, slot, item.x, item.y);
            }
            inv[slot] = data;
            return true;
        }
        return false;
    }

    // Case échangée quand l'inventaire est plein : celle en main (la case 1 si on tient la pioche)
    _swapSlot(f) {
        return f.slot > 0 && f.slot < SLOTS ? f.slot : 1;
    }

    // Pose au sol l'objet de la case (à l'endroit de l'objet ramassé) et annule
    // le soin en cours dessus (le rechargement est déjà annulé par Combat si l'arme change)
    _swapOut(f, slot, x, y) {
        const old = f.inventory[slot];
        if (old) this.drop(old, x, y);
        f.inventory[slot] = null;
        if (f.usingItem && f.usingItem.slot === slot) f.usingItem = null;
    }

    // Ramasser cet objet ferait-il un échange avec l'objet en main ? (texte du HUD)
    // null = pas d'échange, sinon l'objet qui serait posé au sol
    swapTarget(f, item) {
        if (!f?.inventory || !item || item.kind === 'ammo' || 'opened' in item) return null;
        const inv = f.inventory;
        for (let i = 1; i < SLOTS; i++) {
            const s = inv[i];
            if (!s) return null;
            if (item.kind === 'heal' && s.kind === 'heal' && s.itemId === item.itemId &&
                s.count < (HEALS[item.itemId]?.stack || 1)) return null;
        }
        const held = inv[this._swapSlot(f)];
        if (item.kind === 'heal' && held?.kind === 'heal' && held.itemId === item.itemId) return null;
        return held || null;
    }

    // Pose au sol une case d'inventaire (arme / soin) ou des munitions {kind:'ammo', ammoType, amount}
    drop(data, x, y, fromX = x, fromY = y) {
        if (!data) return null;
        if (data.kind === 'weapon') {
            if (!data.weaponId || isPickaxe(data)) return null;
        } else if (data.kind === 'heal') {
            if (!(data.count > 0)) return null;
        } else if (data.kind === 'throwable') {
            if (!data.itemId || !(data.count > 0)) return null;
        } else if (data.kind === 'ammo') {
            if (!data.ammoType || !(data.amount > 0)) return null;
        } else {
            return null;
        }
        return this._spawn(data, x, y, fromX, fromY);
    }

    // À la mort : tout l'inventaire (sauf la pioche) et les munitions tombent en cercle
    dropAll(f) {
        const list = [];
        const inv = f.inventory || [];
        for (let i = 0; i < SLOTS; i++) {
            const s = inv[i];
            if (!s || isPickaxe(s)) continue;
            list.push(s);
            inv[i] = null;
        }
        if (f.ammo) {
            for (const type of Object.keys(f.ammo)) {
                if (f.ammo[type] > 0) {
                    list.push({ kind: 'ammo', ammoType: type, amount: f.ammo[type] });
                    f.ammo[type] = 0;
                }
            }
        }
        const n = list.length;
        if (!n) return 0;
        const start = Math.random() * TAU;
        const dist = 42 + n * 5;
        list.forEach((data, i) => {
            const p = this._spot(f.x, f.y, start + (i / n) * TAU, dist);
            this.drop(data, p.x, p.y, f.x, f.y);
        });
        return n;
    }

    // Texte du HUD pour un coffre, un objet, ou le résultat de nearestInteractable
    describe(target) {
        if (!target) return '';
        if (target.target) target = target.target;
        if ('opened' in target) return target.opened ? 'Coffre ouvert' : 'Ouvrir le coffre';
        switch (target.kind) {
            case 'weapon': {
                const w = WEAPONS[target.weaponId];
                const r = RARITIES[target.rarity];
                return `${w ? w.name : target.weaponId} (${r ? r.name : '?'})`;
            }
            case 'ammo':
                return `${ammoName(target.ammoType)} ×${target.amount}`;
            case 'heal':
                return `${HEALS[target.itemId]?.name || target.itemId} ×${target.count}`;
            case 'throwable':
                return `${THROWABLES[target.itemId]?.name || target.itemId} ×${target.count}`;
        }
        return '';
    }

    /* ----- Animation ----- */

    // Seuls les coffres qui s'ouvrent et les objets qui apparaissent sont animés ici
    // (le flottement des objets est calculé au dessin à partir du temps du jeu)
    update(dt) {
        const op = this._opening;
        let n = 0;
        for (let i = 0; i < op.length; i++) {
            const c = op[i];
            c.openT = Math.min(1, c.openT + dt / OPEN_TIME);
            if (c.openT < 1) op[n++] = c;
        }
        op.length = n;

        const pp = this._popping;
        n = 0;
        for (let i = 0; i < pp.length; i++) {
            const it = pp[i];
            it.pop = Math.min(1, it.pop + dt / POP_TIME);
            if (it.pop < 1 && !it.gone) pp[n++] = it;
        }
        pp.length = n;
    }

    /* ----- Dessin (coordonnées monde) ----- */

    draw(ctx, time, view) {
        this._prepareStyles(ctx);
        const m = DRAW_MARGIN;
        const minX = view ? view.minX - m : -Infinity;
        const minY = view ? view.minY - m : -Infinity;
        const maxX = view ? view.maxX + m : Infinity;
        const maxY = view ? view.maxY + m : Infinity;
        let base = null; // transformation caméra (lue une seule fois)

        const chests = this.chests;
        for (let i = 0; i < chests.length; i++) {
            const c = chests[i];
            if (c.x > minX && c.x < maxX && c.y > minY && c.y < maxY) this._drawChest(ctx, c, time);
        }
        const items = this.items;
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (!(it.x > minX && it.x < maxX && it.y > minY && it.y < maxY)) continue;
            if (!base) base = ctx.getTransform();
            this._drawItem(ctx, it, time, base);
        }
        ctx.globalAlpha = 1;
    }

    /* ----- Dégradés et couleurs mis en cache (au lieu d'en recréer à chaque image) ----- */

    _prepareStyles(ctx) {
        if (this._styleCtx === ctx) return;
        this._styleCtx = ctx;
        this._styles.clear();

        // Lueur dorée des coffres : dégradé de rayon 1 (mis à l'échelle au dessin),
        // l'intensité qui pulse passe par globalAlpha
        const g = ctx.createRadialGradient(0, 0, 0.14, 0, 0, 1);
        g.addColorStop(0, 'rgba(255, 222, 90, 1)');
        g.addColorStop(1, 'rgba(255, 200, 60, 0)');
        this._chestGlow = g;

        // Couvercle doré (mêmes dimensions pour tous les coffres)
        const H = CHEST_R * 1.42;
        const seam = -H / 2 + 3 + H * 0.68;
        const lg = ctx.createLinearGradient(0, -H / 2, 0, seam);
        lg.addColorStop(0, '#fff3a8');
        lg.addColorStop(0.5, '#ffd23c');
        lg.addColorStop(1, '#e39a12');
        this._chestLid = lg;
    }

    // Lueur (rayon 1), anneau et contour sombre d'une couleur d'objet
    _style(ctx, color) {
        let s = this._styles.get(color);
        if (s) return s;
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, rgba(color, 0.55));
        g.addColorStop(0.6, rgba(color, 0.22));
        g.addColorStop(1, rgba(color, 0));
        s = { glow: g, ring: rgba(color, 0.7), dark: shade(color, -0.55) };
        this._styles.set(color, s);
        return s;
    }

    _drawChest(ctx, c, time) {
        const W = c.r * 2;
        const H = c.r * 1.42;
        const lidH = H * 0.68;
        const seam = -H / 2 + 3 + lidH; // ligne couvercle / caisse (l'avant du coffre est vers +y)

        ctx.save();
        ctx.translate(c.x, c.y);

        if (!c.opened) {
            // Lueur dorée pulsante
            const pulse = 0.5 + 0.5 * Math.sin(time * 3 + c.id * 1.7);
            const R = c.r * (2 + 0.3 * pulse);
            ctx.globalAlpha = 0.42 + 0.2 * pulse;
            ctx.scale(R, R);
            ctx.fillStyle = this._chestGlow;
            ctx.beginPath();
            ctx.arc(0, 0, 1, 0, TAU);
            ctx.fill();
            ctx.scale(1 / R, 1 / R);
            ctx.globalAlpha = 1;
        } else if (c.openT < 1) {
            // Anneau qui s'agrandit à l'ouverture
            ctx.strokeStyle = `rgba(255, 225, 110, ${1 - c.openT})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, c.r * (1 + 2 * c.openT), 0, TAU);
            ctx.stroke();
        }

        // Ombre (décalée dans le sens du monde, pas du coffre)
        ctx.save();
        ctx.translate(4, 5);
        ctx.rotate(c.rot);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        roundRect(ctx, -W / 2, -H / 2, W, H, 6);
        ctx.fill();
        ctx.restore();

        ctx.rotate(c.rot);

        if (!c.opened) {
            // Caisse
            ctx.fillStyle = '#b77a12';
            roundRect(ctx, -W / 2, -H / 2, W, H, 6);
            ctx.fill();
            // Couvercle doré brillant
            ctx.fillStyle = this._chestLid;
            roundRect(ctx, -W / 2 + 3, -H / 2 + 3, W - 6, lidH, 5);
            ctx.fill();
            // Sangles métalliques
            ctx.fillStyle = '#9c6408';
            ctx.fillRect(-W * 0.3 - 3, -H / 2 + 3, 6, H - 6);
            ctx.fillRect(W * 0.3 - 3, -H / 2 + 3, 6, H - 6);
            // Reflet
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            roundRect(ctx, -W / 2 + 7, -H / 2 + 5, W - 14, 3.5, 2);
            ctx.fill();
            // Contour sombre + séparation du couvercle
            ctx.strokeStyle = '#3b2406';
            ctx.lineWidth = 3.5;
            roundRect(ctx, -W / 2, -H / 2, W, H, 6);
            ctx.stroke();
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-W / 2 + 2, seam);
            ctx.lineTo(W / 2 - 2, seam);
            ctx.stroke();
            // Serrure
            ctx.fillStyle = '#3b2406';
            roundRect(ctx, -6, seam - 5, 12, 11, 2);
            ctx.fill();
            ctx.fillStyle = '#ffd23c';
            ctx.beginPath();
            ctx.arc(0, seam, 2, 0, TAU);
            ctx.fill();
            // Scintillements
            for (let k = 0; k < 2; k++) {
                const a = Math.sin(time * 2.2 + c.id * 3.1 + k * Math.PI);
                if (a > 0.1) sparkle(ctx, (k ? 0.3 : -0.26) * W, (k ? -0.22 : 0.04) * H, 3 + 4 * a, a);
            }
        } else {
            // Couvercle qui pivote autour de la charnière (arrière, -y)
            const angle = easeOut(c.openT) * 2.1;
            const proj = lidH * Math.cos(angle);
            // Caisse terne
            ctx.fillStyle = '#9a7434';
            roundRect(ctx, -W / 2, -H / 2, W, H, 6);
            ctx.fill();
            // Intérieur vide
            ctx.fillStyle = '#2b1c0a';
            roundRect(ctx, -W / 2 + 4, -H / 2 + 4, W - 8, lidH - 2, 4);
            ctx.fill();
            // Sangles de la caisse
            ctx.fillStyle = '#6f5020';
            ctx.fillRect(-W * 0.3 - 3, seam, 6, H / 2 - seam - 2);
            ctx.fillRect(W * 0.3 - 3, seam, 6, H / 2 - seam - 2);
            if (proj > 0.5) {
                // Couvercle encore au-dessus de la caisse (pendant l'ouverture)
                ctx.fillStyle = '#d9ab3e';
                roundRect(ctx, -W / 2 + 3, -H / 2 + 3, W - 6, proj, 4);
                ctx.fill();
            } else if (proj < -0.5) {
                // Couvercle rabattu derrière
                const back = -proj;
                ctx.fillStyle = '#a8823c';
                roundRect(ctx, -W / 2 + 2, -H / 2 - back, W - 4, back + 3, 4);
                ctx.fill();
                ctx.fillStyle = '#6f5020';
                ctx.fillRect(-W * 0.3 - 3, -H / 2 - back, 6, back);
                ctx.fillRect(W * 0.3 - 3, -H / 2 - back, 6, back);
                ctx.strokeStyle = '#3b2a12';
                ctx.lineWidth = 2.5;
                roundRect(ctx, -W / 2 + 2, -H / 2 - back, W - 4, back + 3, 4);
                ctx.stroke();
            }
            ctx.strokeStyle = '#3b2a12';
            ctx.lineWidth = 3;
            roundRect(ctx, -W / 2, -H / 2, W, H, 6);
            ctx.stroke();
        }
        ctx.restore();
    }

    _itemColor(it) {
        if (it.kind === 'weapon') return RARITIES[it.rarity]?.color || '#b0b0b0';
        if (it.kind === 'ammo') return AMMO_TYPES[it.ammoType]?.color || '#d8c070';
        if (it.kind === 'throwable') return THROWABLES[it.itemId]?.color || '#fff0a0';
        return HEALS[it.itemId]?.color || (it.itemId === 'shieldPotion' ? '#4aa8ff' : '#6fdc70');
    }

    // base = transformation caméra (pour revenir après la mise à l'échelle de la lueur)
    _drawItem(ctx, it, time, base) {
        const k = easeOut(it.pop);
        const x = it.sx + (it.x - it.sx) * k;
        const y = it.sy + (it.y - it.sy) * k;
        const s = it.pop < 1 ? 0.3 + 0.7 * easeOutBack(it.pop) : 1;
        // Flottement + petit saut pendant l'apparition
        const lift = 5 + Math.sin((time + it.t) * 3) * 2.5 + Math.sin(k * Math.PI) * 18;
        const color = this._itemColor(it);
        const st = this._style(ctx, color);

        // Ombre au sol
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.beginPath();
        ctx.ellipse(x, y + 6, Math.max(1, 13 * s * (1 - lift * 0.012)), 5 * s, 0, 0, TAU);
        ctx.fill();

        // Disque de lueur (dégradé en cache, de rayon 1, mis à l'échelle)
        const R = (it.kind === 'weapon' ? 32 : 22) * s;
        ctx.translate(x, y);
        ctx.scale(R, R);
        ctx.fillStyle = st.glow;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, TAU);
        ctx.fill();
        ctx.setTransform(base);
        ctx.strokeStyle = st.ring;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, R * 0.72, 0, TAU);
        ctx.stroke();

        const dy = y - lift;
        ctx.save();
        ctx.translate(x, dy);

        if (it.kind === 'weapon') {
            // Même icône de profil que dans la hotbar (canvas mis en cache)
            const icon = iconCanvas('weapon', it.weaponId, it.rarity, ICON_PX, false);
            if (icon) {
                const sz = WEAPON_ICON_SIZE * s;
                ctx.drawImage(icon, -sz / 2, -sz / 2, sz, sz);
            } else {
                const len = WEAPONS[it.weaponId]?.length || 50;
                const sc = Math.min(1.2, Math.max(0.75, 56 / len)) * s;
                ctx.rotate(-0.5);
                ctx.scale(sc, sc);
                ctx.translate(-len / 2, 0);
                drawWeapon(ctx, it.weaponId, it.rarity);
            }
        } else if (it.kind === 'ammo') {
            const [bw, bh] = AMMO_BOX[it.ammoType] || [20, 14];
            ctx.scale(s, s);
            ctx.rotate(-0.25);
            // Balles qui dépassent de la boîte
            ctx.fillStyle = '#e8c060';
            ctx.strokeStyle = '#5a4210';
            ctx.lineWidth = 1.5;
            for (let i = 0; i < 3; i++) {
                roundRect(ctx, -bw / 2 + (bw * (i + 1)) / 4 - 2, -bh / 2 - 5, 4, 7, 2);
                ctx.fill();
                ctx.stroke();
            }
            // Boîte
            ctx.fillStyle = color;
            roundRect(ctx, -bw / 2, -bh / 2, bw, bh, 3);
            ctx.fill();
            ctx.strokeStyle = st.dark;
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.fillRect(-bw / 2 + 3, -1.5, bw - 6, 3);
        } else if (it.kind === 'heal') {
            ctx.scale(s, s);
            const icon = iconCanvas('heal', it.itemId, 0, ICON_PX, false);
            if (icon) {
                ctx.drawImage(icon, -HEAL_ICON_SIZE / 2, -HEAL_ICON_SIZE / 2, HEAL_ICON_SIZE, HEAL_ICON_SIZE);
            } else {
                ctx.font = '24px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('✚', 0, 1);
            }
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (it.count > 1) {
                ctx.font = 'bold 12px sans-serif';
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.strokeText(`×${it.count}`, 14, 11);
                ctx.fillText(`×${it.count}`, 14, 11);
            }
        } else {
            ctx.scale(s, s);
            const icon = iconCanvas('throwable', it.itemId, 0, ICON_PX, false);
            if (icon) ctx.drawImage(icon, -HEAL_ICON_SIZE / 2, -HEAL_ICON_SIZE / 2, HEAL_ICON_SIZE, HEAL_ICON_SIZE);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            if (it.count > 1) ctx.fillText(`×${it.count}`, 14, 11);
        }
        ctx.restore();
    }
}
