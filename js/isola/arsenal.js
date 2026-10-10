/* ==================================
   ISOLA - ARMES ET SOINS (règles, sans rendu)
   Les armes de FOR2D ROYAL (mêmes dégâts, cadences, chargeurs et raretés)
   avec les mécaniques de Battlelands Royale :
   - 2 emplacements d'arme (touches 1 et 2), pas de pioche ;
   - portée limitée et visible au sol (ligne de points) : la balle s'arrête
     au premier obstacle (mur, tronc, rocher...), les buissons ne protègent pas ;
   - une arme qui n'a plus aucune munition (chargeur ET réserve) disparaît ;
   - coups critiques (chiffre rouge), bouclier bleu au-dessus de la vie ;
   - soins rangés à part (pochette) : Bandage, Potion de bouclier, Kit de soin.
     On peut marcher en se soignant (plus lentement) ; tirer annule le soin.

   Les « combattants » sont des objets Player (ou tout objet avec x, y, r, angle,
   health, shield, alive, phase) : les bots pourront utiliser la même classe.
   ================================== */

import { WEAPONS, HEALS, RARITIES, weaponDamage } from '../game/weapons.js';

export { RARITIES };

export const MAX_HEALTH = 100;
export const MAX_SHIELD = 100;
export const CRIT_CHANCE = 0.1;
export const CRIT_MUL = 1.5;
export const HEAL_SPEED_MUL = 0.55;   // vitesse de marche pendant un soin
export const BULLET_HEIGHT = 52;      // hauteur des balles (bout du canon)

// Armes de base d'ISOLA. Portées et vitesses ajustées à la vue de dessus :
// la portée tient dans l'écran, comme dans Battlelands.
export const ISO_WEAPON_IDS = ['ar', 'smg', 'pistol', 'shotgun'];
const TUNING = {
    ar:      { range: 660, bulletSpeed: 1750 },
    smg:     { range: 480, bulletSpeed: 1600 },
    pistol:  { range: 580, bulletSpeed: 1600 },
    shotgun: { range: 340, bulletSpeed: 1400, spread: 0.24 }
};
export const ISO_WEAPONS = Object.fromEntries(ISO_WEAPON_IDS.map(id => [id, { ...WEAPONS[id], ...TUNING[id] }]));

// Soins d'ISOLA (valeurs du jeu 2D), dans l'ordre des touches 3, 4, 5
export const ISO_HEAL_IDS = ['bandage', 'shieldPotion', 'medkit'];
export const ISO_HEALS = {
    bandage: { ...HEALS.bandage, short: 'Bandage' },
    shieldPotion: { ...HEALS.shieldPotion, name: 'Potion de bouclier', short: 'Potion' },
    medkit: { ...HEALS.medkit, name: 'Kit de soin', short: 'Kit' }
};

// Réserve maximale par type de munitions
export const AMMO_CAP = { light: 180, medium: 180, shells: 40 };
export const AMMO_NAMES = { light: 'Munitions légères', medium: 'Munitions moyennes', shells: 'Cartouches' };
export const AMMO_COLORS = { light: '#e8d9a8', medium: '#7fd3ff', shells: '#ff5470' };

const SUB_STEP = 16;  // pas des balles (unités)
const HIT_PAD = 6;    // marge de touche autour d'un combattant
const RAY_STEP = 10;  // pas du calcul « jusqu'où va la balle » (ligne de visée)

export const rarityColor = (r) => (RARITIES[r] || RARITIES[0]).color;
export const rarityName = (r) => (RARITIES[r] || RARITIES[0]).name;

// Prépare un combattant pour ISOLA (inventaire Battlelands)
export function equipFighter(f) {
    f.weapons = [null, null];
    f.wslot = 0;
    f.pouch = { bandage: 0, shieldPotion: 0, medkit: 0 };
    f.ammo = { light: 0, medium: 0, shells: 0 };
    f.heal = null;          // { id, t, total } pendant un soin
    f.reloadTimer = 0;
    f.reloadTotal = 0;
    f.fireCooldown = 0;
    f.kick = 0;             // recul visuel (1 -> 0)
    f.speedMul = 1;
    f.health = MAX_HEALTH;
    f.shield = 0;
    f.alive = true;
    return f;
}

export class Arsenal {
    constructor(world, fighters, events = {}) {
        this.world = world;
        this.fighters = fighters;   // tableau partagé (joueur, mannequins, bots plus tard)
        this.events = events;
        this.bullets = [];
        this._free = [];
        this._walls = [];
        this._targets = [];
        this._q = [];
    }

    /* ----- Inventaire ----- */

    held(f) {
        return f.weapons?.[f.wslot] || null;
    }

    stats(item) {
        return item ? ISO_WEAPONS[item.weaponId] || null : null;
    }

    heldStats(f) {
        return this.stats(this.held(f));
    }

    select(f, i) {
        if (!f.weapons || i < 0 || i >= f.weapons.length || i === f.wslot) return false;
        f.wslot = i;
        f.reloadTimer = 0;  // changer d'arme annule le rechargement
        f.fireCooldown = Math.max(f.fireCooldown, 0.18);
        this.events.onSwitch?.(f, this.held(f));
        return true;
    }

    // Plus aucune munition (chargeur vide et réserve vide) : l'arme disparaît
    _discardIfEmpty(f, slot) {
        const it = f.weapons[slot];
        const w = this.stats(it);
        if (!it || !w) return false;
        if ((it.mag || 0) > 0 || (f.ammo[w.ammo] || 0) > 0) return false;
        f.weapons[slot] = null;
        if (f.wslot === slot) {
            f.reloadTimer = 0;
            // On reprend l'autre arme s'il y en a une
            const other = f.weapons.findIndex(Boolean);
            if (other >= 0) f.wslot = other;
        }
        this.events.onWeaponGone?.(f, it, w);
        return true;
    }

    /* ----- Tir ----- */

    tryFire(f, justPressed) {
        if (!f.alive || f.phase !== 'ground') return false;
        if (f.reloadTimer > 0 || f.fireCooldown > 0) return false;
        const it = this.held(f);
        const w = this.stats(it);
        if (!w) return false;
        if (!w.auto && !justPressed) return false;

        if (!((it.mag || 0) > 0)) {
            if (!this.reload(f)) {
                if (justPressed) this.events.onDryFire?.(f, w);
                this._discardIfEmpty(f, f.wslot);
            }
            return false;
        }

        // Tirer annule le soin en cours
        if (f.heal) this.cancelHeal(f);

        const base = weaponDamage(w.id, it.rarity);
        const muzzle = f.r + 26;
        const n = w.pellets || 1;
        for (let i = 0; i < n; i++) {
            const a = f.angle + (Math.random() - 0.5) * 2 * (w.spread || 0);
            const crit = Math.random() < CRIT_CHANCE;
            const b = this._free.pop() || {};
            b.x = f.x;
            b.y = f.y;
            b.ux = Math.cos(a);
            b.uy = Math.sin(a);
            b.speed = w.bulletSpeed;
            b.dist = 0;
            b.range = w.range;
            b.damage = crit ? base * CRIT_MUL : base;
            b.crit = crit;
            b.owner = f;
            b.weaponId = w.id;
            b.age = 0;
            // Du centre jusqu'au bout du canon en testant les obstacles (pas de tir à travers un mur collé)
            if (this._travel(b, muzzle)) {
                b.dist = muzzle;
                this.bullets.push(b);
            } else {
                this._recycle(b);
            }
        }
        it.mag--;
        f.fireCooldown = 1 / w.fireRate;
        f.kick = 1;
        this.events.onFire?.(f, w, it);
        if (it.mag <= 0 && !this.reload(f)) this._discardIfEmpty(f, f.wslot);
        return true;
    }

    reload(f) {
        if (!f.alive || f.reloadTimer > 0) return false;
        const it = this.held(f);
        const w = this.stats(it);
        if (!w) return false;
        if ((it.mag || 0) >= w.magSize) return false;
        if (!((f.ammo[w.ammo] || 0) > 0)) return false;
        f.reloadTimer = w.reloadTime;
        f.reloadTotal = w.reloadTime;
        f._reloadItem = it;
        this.events.onReload?.(f, w);
        return true;
    }

    /* ----- Soins ----- */

    healUseful(f, id) {
        const h = ISO_HEALS[id];
        if (!h) return false;
        if (h.shield > 0) return f.shield < (h.shieldCap ?? MAX_SHIELD);
        return f.health < (h.healCap ?? MAX_HEALTH);
    }

    // Renvoie '' si le soin démarre, sinon la raison (texte du HUD)
    startHeal(f, id) {
        const h = ISO_HEALS[id];
        if (!h || !f.alive || f.phase !== 'ground') return 'Impossible maintenant';
        if (!(f.pouch?.[id] > 0)) return `Aucun ${h.short.toLowerCase()}`;
        if (f.heal?.id === id) return 'Déjà en cours';
        if (!this.healUseful(f, id)) {
            if (h.shield > 0) return 'Bouclier déjà plein';
            return h.healCap < MAX_HEALTH ? `Les bandages soignent jusqu'à ${h.healCap} PV` : 'Vie déjà pleine';
        }
        f.heal = { id, t: 0, total: h.useTime };
        f.reloadTimer = 0;
        this.events.onHealStart?.(f, h);
        return '';
    }

    cancelHeal(f) {
        if (!f.heal) return;
        const h = ISO_HEALS[f.heal.id];
        f.heal = null;
        this.events.onHealCancel?.(f, h);
    }

    /* ----- Dégâts : bouclier d'abord, puis la vie ----- */

    damage(victim, amount, attacker, weaponId, crit = false) {
        if (!victim.alive || !(amount > 0)) return;
        let left = amount;
        let shieldPart = 0;
        if (victim.shield > 0) {
            shieldPart = Math.min(victim.shield, left);
            victim.shield -= shieldPart;
            left -= shieldPart;
        }
        victim.health -= left;
        if (victim.heal) this.cancelHeal(victim);
        this.events.onDamage?.(victim, amount, attacker, { shieldPart, healthPart: left, crit, weaponId });
        if (victim.health <= 0) {
            victim.health = 0;
            victim.alive = false;
            victim.heal = null;
            victim.reloadTimer = 0;
            if (attacker && attacker !== victim) attacker.kills = (attacker.kills || 0) + 1;
            this.events.onKill?.(attacker, victim, weaponId);
        }
    }

    /* ----- Mise à jour ----- */

    update(dt) {
        for (const f of this.fighters) {
            if (!f.weapons) continue;
            this._updateFighter(f, dt);
        }
        this._updateBullets(dt);
    }

    _updateFighter(f, dt) {
        if (f.fireCooldown > 0) f.fireCooldown = Math.max(0, f.fireCooldown - dt);
        if (f.kick > 0) f.kick = Math.max(0, f.kick - dt * 9);

        if (f.reloadTimer > 0) {
            const it = this.held(f);
            const w = this.stats(it);
            if (!f.alive || !w || it !== f._reloadItem) {
                f.reloadTimer = 0;
            } else {
                f.reloadTimer -= dt;
                if (f.reloadTimer <= 0) {
                    f.reloadTimer = 0;
                    const need = Math.max(0, w.magSize - (it.mag || 0));
                    const take = Math.min(need, f.ammo[w.ammo] || 0);
                    it.mag = (it.mag || 0) + take;
                    f.ammo[w.ammo] -= take;
                    this.events.onReloaded?.(f, w);
                }
            }
        }

        const u = f.heal;
        if (u) {
            const h = ISO_HEALS[u.id];
            if (!f.alive || !h || !(f.pouch[u.id] > 0)) {
                f.heal = null;
            } else {
                u.t += dt;
                if (u.t >= u.total) {
                    if (h.heal > 0) f.health = Math.max(f.health, Math.min(h.healCap ?? MAX_HEALTH, f.health + h.heal));
                    if (h.shield > 0) f.shield = Math.max(f.shield, Math.min(h.shieldCap ?? MAX_SHIELD, f.shield + h.shield));
                    f.pouch[u.id]--;
                    f.heal = null;
                    this.events.onHealed?.(f, h);
                }
            }
        }
        f.speedMul = f.heal ? HEAL_SPEED_MUL : 1;
    }

    _updateBullets(dt) {
        const list = this.bullets;
        let n = 0;
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            b.age += dt;
            const step = Math.min(b.speed * dt, b.range - b.dist);
            let alive = step > 0 && this._travel(b, step);
            b.dist += Math.max(0, step);
            if (alive && b.dist >= b.range) {
                alive = false;
                this.events.onExpire?.(b);   // fin de portée : petite poussière au sol
            }
            if (alive) list[n++] = b;
            else this._recycle(b);
        }
        list.length = n;
    }

    _recycle(b) {
        b.owner = null;
        this._free.push(b);
    }

    /*
       Avance une balle de len unités par petits pas. Renvoie false si elle a
       touché quelque chose. Obstacles et cibles proches cherchés une fois par appel.
    */
    _travel(b, len) {
        const ux = b.ux;
        const uy = b.uy;
        const steps = Math.max(1, Math.ceil(len / SUB_STEP));
        const s = len / steps;
        const ex = b.x + ux * len;
        const ey = b.y + uy * len;
        const minX = Math.min(b.x, ex);
        const maxX = Math.max(b.x, ex);
        const minY = Math.min(b.y, ey);
        const maxY = Math.max(b.y, ey);
        const walls = this.world.collide.query(minX - 1, minY - 1, maxX + 1, maxY + 1, this._walls);

        const targets = this._targets;
        targets.length = 0;
        for (const t of this.fighters) {
            if (t === b.owner || !t.alive || t.phase !== 'ground') continue;
            const rr = t.r + HIT_PAD;
            if (t.x + rr < minX || t.x - rr > maxX || t.y + rr < minY || t.y - rr > maxY) continue;
            targets.push(t);
        }

        for (let k = 0; k < steps; k++) {
            b.x += ux * s;
            b.y += uy * s;
            for (let i = 0; i < targets.length; i++) {
                const t = targets[i];
                if (!t.alive) continue;
                const rr = t.r + HIT_PAD;
                const dx = b.x - t.x;
                const dy = b.y - t.y;
                if (dx * dx + dy * dy < rr * rr) {
                    const kind = t.shield > 0 ? 'shield' : 'health';
                    this.events.onImpact?.(b.x, b.y, Math.atan2(uy, ux), kind, t, b);
                    this.damage(t, b.damage, b.owner, b.weaponId, b.crit);
                    return false;
                }
            }
            if (walls.length && wallAt(walls, b.x, b.y)) {
                this.events.onImpact?.(b.x, b.y, Math.atan2(uy, ux), 'wall', null, b);
                return false;
            }
        }
        return true;
    }

    // Distance jusqu'au premier obstacle dans la direction (ux, uy), au plus max
    obstacleDistance(x, y, ux, uy, max) {
        const ex = x + ux * max;
        const ey = y + uy * max;
        const walls = this.world.collide.query(
            Math.min(x, ex) - 1, Math.min(y, ey) - 1, Math.max(x, ex) + 1, Math.max(y, ey) + 1, this._q);
        if (!walls.length) return max;
        for (let d = RAY_STEP; d < max; d += RAY_STEP) {
            if (wallAt(walls, x + ux * d, y + uy * d)) return d;
        }
        return max;
    }
}

// Le point (x, y) est-il dans un obstacle de la liste ? (cercles et rectangles de world.collide)
export function wallAt(list, x, y) {
    for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.kind === 'circle') {
            const dx = x - c.x;
            const dy = y - c.y;
            if (dx * dx + dy * dy < c.r * c.r) return true;
        } else if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
            return true;
        }
    }
    return false;
}
