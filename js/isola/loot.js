/* ==================================
   ISOLA - BUTIN AU SOL (règles, sans rendu)
   Comme dans Battlelands Royale :
   - beaucoup de butin posé au sol (maisons, villes, et un peu partout sur l'île) ;
   - on le ramasse en restant dessus : un anneau se remplit puis l'objet est pris
     (pas de touche à presser). Munitions et soins vont directement dans la réserve ;
   - si les 2 emplacements d'arme sont pris, il faut appuyer sur E pour échanger ;
   - une arme identique (même rareté ou moins bonne) donne ses munitions.
   ================================== */

import { isWater } from '../game/config.js?v=12';
import {
    ISO_WEAPONS, ISO_WEAPON_IDS, ISO_HEALS, AMMO_CAP, AMMO_NAMES, AMMO_COLORS,
    rarityColor, rarityName
} from './arsenal.js?v=1';

const TAU = Math.PI * 2;
const ITEM_R = 20;          // encombrement d'un objet au sol
const CELL = 250;
const WILD_ITEMS = 110;
const WALL_T = 16;

export const PICK_RANGE = 46;                 // distance pour ramasser
export const PICK_TIME = { weapon: 0.55, heal: 0.4, ammo: 0.3 };

const RARITY_WEIGHTS = [44, 30, 17, 7, 2];
const WEAPON_WEIGHTS = { ar: 28, smg: 26, pistol: 26, shotgun: 20 };
const HEAL_WEIGHTS = { bandage: 45, shieldPotion: 32, medkit: 23 };
const HEAL_COUNT = { bandage: 3, shieldPotion: 1, medkit: 1 };
const AMMO_WEIGHTS = { light: 40, medium: 38, shells: 22 };
const AMMO_DROP = { light: 30, medium: 30, shells: 10 };

function weighted(table) {
    let total = 0;
    for (const k in table) total += table[k];
    let r = Math.random() * total;
    for (const k in table) {
        r -= table[k];
        if (r < 0) return k;
    }
    return Object.keys(table)[0];
}

function rollRarity() {
    let total = 0;
    for (const w of RARITY_WEIGHTS) total += w;
    let r = Math.random() * total;
    for (let i = 0; i < RARITY_WEIGHTS.length; i++) {
        r -= RARITY_WEIGHTS[i];
        if (r < 0) return i;
    }
    return 0;
}

function rectPointDist(o, x, y) {
    const px = Math.max(o.x, Math.min(x, o.x + o.w));
    const py = Math.max(o.y, Math.min(y, o.y + o.h));
    return Math.hypot(x - px, y - py);
}

/* ----- Description d'un objet (HUD, couleurs) ----- */

export function itemLabel(it) {
    if (it.kind === 'weapon') return ISO_WEAPONS[it.weaponId]?.name || 'Arme';
    if (it.kind === 'heal') {
        const h = ISO_HEALS[it.itemId];
        return it.count > 1 ? `${h?.name || 'Soin'} ×${it.count}` : (h?.name || 'Soin');
    }
    if (it.kind === 'ammo') return `${AMMO_NAMES[it.ammoType] || 'Munitions'} ×${it.amount}`;
    return 'Objet';
}

export function itemColor(it) {
    if (it.kind === 'weapon') return rarityColor(it.rarity);
    if (it.kind === 'heal') return ISO_HEALS[it.itemId]?.color || '#6fdc70';
    if (it.kind === 'ammo') return AMMO_COLORS[it.ammoType] || '#ffffff';
    return '#ffffff';
}

export function itemSub(it) {
    if (it.kind === 'weapon') return rarityName(it.rarity);
    if (it.kind === 'heal') return 'Soin';
    return 'Munitions';
}

export class IsoLoot {
    constructor(world, opts = {}) {
        this.world = world;
        this.items = [];
        this._nextId = 1;
        this._cols = Math.ceil(world.width / CELL);
        this._rows = Math.ceil(world.height / CELL);
        this._cells = new Map();
        this._tmp = [];
        this._q = [];
        this.onSpawn = null;    // (item) : nouvel objet (vue 3D)
        this.onRemove = null;   // (item) : objet retiré du sol
        if (opts.empty) return;
        this._generate();
    }

    /* ----- Génération ----- */

    roll() {
        const r = Math.random();
        if (r < 0.4) {
            const weaponId = weighted(WEAPON_WEIGHTS);
            return { kind: 'weapon', weaponId, rarity: rollRarity(), mag: ISO_WEAPONS[weaponId].magSize };
        }
        if (r < 0.75) {
            const itemId = weighted(HEAL_WEIGHTS);
            return { kind: 'heal', itemId, count: HEAL_COUNT[itemId] || 1 };
        }
        const ammoType = weighted(AMMO_WEIGHTS);
        return { kind: 'ammo', ammoType, amount: AMMO_DROP[ammoType] };
    }

    _ammoFor(weaponId) {
        const w = ISO_WEAPONS[weaponId];
        return { kind: 'ammo', ammoType: w.ammo, amount: Math.max(10, w.magSize * 2) };
    }

    // Pose un tirage (et les munitions de l'arme juste à côté)
    _place(x, y, bounds = null) {
        const data = this.roll();
        this.spawn(data, x, y);
        if (data.kind !== 'weapon') return;
        for (let k = 0; k < 8; k++) {
            const a = Math.random() * TAU;
            let ax = x + Math.cos(a) * 40;
            let ay = y + Math.sin(a) * 40;
            if (bounds) {
                ax = Math.max(bounds.x0, Math.min(bounds.x1, ax));
                ay = Math.max(bounds.y0, Math.min(bounds.y1, ay));
            }
            if (this.isFree(ax, ay)) {
                this.spawn(this._ammoFor(data.weaponId), ax, ay);
                return;
            }
        }
    }

    _generate() {
        const world = this.world;
        // Maisons : 2 objets (3 dans les grandes)
        for (const b of world.buildings) {
            const n = b.w * b.h > 70000 ? 3 : 2;
            const m = WALL_T + 34;
            const bounds = { x0: b.x + m, y0: b.y + m, x1: b.x + b.w - m, y1: b.y + b.h - m };
            if (bounds.x1 <= bounds.x0 || bounds.y1 <= bounds.y0) continue;
            for (let i = 0; i < n; i++) {
                for (let k = 0; k < 14; k++) {
                    const x = bounds.x0 + Math.random() * (bounds.x1 - bounds.x0);
                    const y = bounds.y0 + Math.random() * (bounds.y1 - bounds.y0);
                    if (!this.isFree(x, y)) continue;
                    this._place(x, y, bounds);
                    break;
                }
            }
        }
        // Villes : quelques objets dans les rues autour de la place
        for (const t of world.towns) {
            const r0 = (t.plazaR || 120) * 0.7;
            const r1 = (t.plazaR || 120) + 420;
            for (let i = 0; i < 6; i++) {
                for (let k = 0; k < 14; k++) {
                    const a = Math.random() * TAU;
                    const d = r0 + Math.random() * (r1 - r0);
                    const x = t.x + Math.cos(a) * d;
                    const y = t.y + Math.sin(a) * d;
                    if (!this.isFree(x, y, true)) continue;
                    this._place(x, y);
                    break;
                }
            }
        }
        // Un peu partout sur l'île
        let placed = 0;
        for (let k = 0; k < WILD_ITEMS * 30 && placed < WILD_ITEMS; k++) {
            const x = 200 + Math.random() * (world.width - 400);
            const y = 200 + Math.random() * (world.height - 400);
            if (!this.isFree(x, y, true)) continue;
            this._place(x, y);
            placed++;
        }
    }

    // Place libre : pas d'obstacle, pas dans l'eau, pas sur un autre objet
    isFree(x, y, outside = false) {
        const w = this.world;
        const r = ITEM_R;
        if (x < r || y < r || x > w.width - r || y > w.height - r) return false;
        if (isWater(w.sampleGround(x, y).biome)) return false;
        const list = w.collide.query(x - r - 6, y - r - 6, x + r + 6, y + r + 6, this._tmp);
        for (const o of list) {
            if (o.kind === 'circle') {
                if (Math.hypot(o.x - x, o.y - y) < o.r + r + 6) return false;
            } else if (rectPointDist(o, x, y) < r + 6) {
                return false;
            }
        }
        // Dehors : pas à l'intérieur d'une maison (elles ont déjà leur butin)
        if (outside) {
            for (const b of w.buildings) {
                if (x > b.x - 10 && x < b.x + b.w + 10 && y > b.y - 10 && y < b.y + b.h + 10) return false;
            }
        }
        const near = this.query(x, y, 46, this._q);
        return near.length === 0;
    }

    /* ----- Grille ----- */

    _key(x, y) {
        const cx = Math.max(0, Math.min(this._cols - 1, Math.floor(x / CELL)));
        const cy = Math.max(0, Math.min(this._rows - 1, Math.floor(y / CELL)));
        return cy * this._cols + cx;
    }

    spawn(data, x, y) {
        const it = {
            id: this._nextId++,
            kind: data.kind,
            weaponId: data.weaponId ?? null,
            rarity: data.rarity ?? 0,
            mag: data.mag ?? 0,
            itemId: data.itemId ?? null,
            count: data.count ?? 0,
            ammoType: data.ammoType ?? null,
            amount: data.amount ?? 0,
            x, y,
            phase: Math.random() * TAU,
            droppedBy: null,
            gone: false,
            view: null,
            _key: this._key(x, y)
        };
        this.items.push(it);
        let cell = this._cells.get(it._key);
        if (!cell) this._cells.set(it._key, (cell = []));
        cell.push(it);
        this.onSpawn?.(it);
        return it;
    }

    remove(it) {
        if (it.gone) return;
        it.gone = true;
        const i = this.items.indexOf(it);
        if (i >= 0) this.items.splice(i, 1);
        const cell = this._cells.get(it._key);
        if (cell) {
            const j = cell.indexOf(it);
            if (j >= 0) cell.splice(j, 1);
        }
        this.onRemove?.(it);
    }

    // Objets dans un cercle (x, y, r)
    query(x, y, r, out = []) {
        out.length = 0;
        const c0 = Math.max(0, Math.floor((x - r) / CELL));
        const c1 = Math.min(this._cols - 1, Math.floor((x + r) / CELL));
        const r0 = Math.max(0, Math.floor((y - r) / CELL));
        const r1 = Math.min(this._rows - 1, Math.floor((y + r) / CELL));
        for (let cy = r0; cy <= r1; cy++) {
            for (let cx = c0; cx <= c1; cx++) {
                const cell = this._cells.get(cy * this._cols + cx);
                if (!cell) continue;
                for (const it of cell) {
                    if ((it.x - x) ** 2 + (it.y - y) ** 2 <= r * r) out.push(it);
                }
            }
        }
        return out;
    }

    /* ----- Ramassage ----- */

    // Objet le plus proche à portée de ramassage (les objets qu'on vient de poser
    // ne comptent pas tant qu'on ne s'est pas éloigné)
    nearest(f, range = PICK_RANGE) {
        const list = this.query(f.x, f.y, range + 80, this._q);
        let best = null;
        let bestD = range;
        for (const it of list) {
            const d = Math.hypot(it.x - f.x, it.y - f.y);
            if (it.droppedBy === f) {
                if (d > range + 40) it.droppedBy = null;
                continue;
            }
            if (d < bestD) { bestD = d; best = it; }
        }
        return best;
    }

    /*
       Que se passe-t-il si f ramasse it ?
       'take' : ramassage automatique (anneau) ; 'swap' : touche E (échange d'arme) ;
       'full' : réserve pleine (rien à faire).
    */
    mode(f, it) {
        if (it.kind === 'ammo') {
            return (f.ammo[it.ammoType] || 0) < (AMMO_CAP[it.ammoType] ?? 999) ? 'take' : 'full';
        }
        if (it.kind === 'heal') {
            const cap = ISO_HEALS[it.itemId]?.stack || 1;
            return (f.pouch[it.itemId] || 0) < cap ? 'take' : 'full';
        }
        if (it.kind === 'weapon') {
            const same = f.weapons.findIndex(w => w && w.weaponId === it.weaponId);
            if (same >= 0) {
                // Même arme, pas meilleure : on prend juste ses munitions
                if (it.rarity <= f.weapons[same].rarity) {
                    const type = ISO_WEAPONS[it.weaponId].ammo;
                    return (f.ammo[type] || 0) < (AMMO_CAP[type] ?? 999) ? 'take' : 'full';
                }
                return 'swap';
            }
            return f.weapons.some(w => !w) ? 'take' : 'swap';
        }
        return 'full';
    }

    // Ramassage automatique. Renvoie un petit compte rendu pour le HUD (ou null)
    take(f, it) {
        if (it.gone) return null;
        if (it.kind === 'ammo') {
            const cap = AMMO_CAP[it.ammoType] ?? 999;
            const add = Math.min(it.amount, cap - (f.ammo[it.ammoType] || 0));
            if (add <= 0) return null;
            f.ammo[it.ammoType] = (f.ammo[it.ammoType] || 0) + add;
            it.amount -= add;
            if (it.amount <= 0) this.remove(it);
            return { text: `+${add} ${AMMO_NAMES[it.ammoType].toLowerCase()}`, color: itemColor(it), kind: 'ammo' };
        }
        if (it.kind === 'heal') {
            const h = ISO_HEALS[it.itemId];
            const cap = h?.stack || 1;
            const add = Math.min(it.count, cap - (f.pouch[it.itemId] || 0));
            if (add <= 0) return null;
            f.pouch[it.itemId] += add;
            it.count -= add;
            if (it.count <= 0) this.remove(it);
            return { text: `+${add} ${h.short.toLowerCase()}${add > 1 ? 's' : ''}`, color: itemColor(it), kind: 'heal' };
        }
        if (it.kind === 'weapon') {
            const w = ISO_WEAPONS[it.weaponId];
            const same = f.weapons.findIndex(x => x && x.weaponId === it.weaponId);
            if (same >= 0 && it.rarity <= f.weapons[same].rarity) {
                const cap = AMMO_CAP[w.ammo] ?? 999;
                const add = Math.min(it.mag || 0, cap - (f.ammo[w.ammo] || 0));
                if (add <= 0) return null;
                f.ammo[w.ammo] += add;
                this.remove(it);
                return { text: `+${add} ${AMMO_NAMES[w.ammo].toLowerCase()}`, color: AMMO_COLORS[w.ammo], kind: 'ammo' };
            }
            const slot = f.weapons.findIndex(x => !x);
            if (slot < 0) return null;
            f.weapons[slot] = { weaponId: it.weaponId, rarity: it.rarity, mag: it.mag };
            // Mains vides : on prend directement la nouvelle arme
            if (!f.weapons[f.wslot]) f.wslot = slot;
            this.remove(it);
            return { text: `${w.name} · ${rarityName(it.rarity)}`, color: rarityColor(it.rarity), kind: 'weapon', slot };
        }
        return null;
    }

    // Échange avec l'arme en main (touche E) : l'ancienne arme est posée par terre
    swap(f, it) {
        if (it.gone || it.kind !== 'weapon') return null;
        const same = f.weapons.findIndex(x => x && x.weaponId === it.weaponId);
        const slot = same >= 0 ? same : (f.weapons[f.wslot] ? f.wslot : f.weapons.findIndex(x => !x));
        if (slot < 0) return null;
        const old = f.weapons[slot];
        f.weapons[slot] = { weaponId: it.weaponId, rarity: it.rarity, mag: it.mag };
        f.wslot = slot;
        f.reloadTimer = 0;
        const x = it.x;
        const y = it.y;
        this.remove(it);
        if (old) {
            const dropped = this.spawn({ kind: 'weapon', weaponId: old.weaponId, rarity: old.rarity, mag: old.mag }, x, y);
            dropped.droppedBy = f;
        }
        const w = ISO_WEAPONS[it.weaponId];
        return { text: `${w.name} · ${rarityName(it.rarity)}`, color: rarityColor(it.rarity), kind: 'weapon', slot };
    }
}

export { ISO_WEAPON_IDS };
