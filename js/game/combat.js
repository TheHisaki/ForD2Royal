/* ==================================
   COMBAT - FOR2D ROYAL
   Tirs, balles, coups de pioche, rechargement, soins et dégâts.
   Fonctionne pour tous les combattants (joueur ET bots).
   ================================== */

import { WEAPONS, HEALS, weaponDamage } from './weapons.js';

const MELEE_ARC = (40 * Math.PI) / 180; // la pioche touche à ±40° devant soi
const SWING_TIME = 0.25;                // durée de l'animation de coup (s)
const SUB_STEP = 20;                    // les balles avancent par pas de 20 unités max
const HIT_PAD = 4;                      // marge de collision balle / combattant
const TRACER = 26;                      // longueur du traceur

// Écart d'angle ramené entre -PI et PI
function angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
}

export class Combat {
    constructor(world, fighters, events = {}) {
        this.world = world;
        this.fighters = fighters; // tableau partagé : d'autres modules y ajoutent des combattants
        this.events = events;
        this.bullets = [];
        this._free = [];    // balles terminées, recyclées (pas d'allocation à chaque tir)
        this._near = [];
        this._walls = [];   // obstacles proches de la trajectoire (réutilisé)
        this._targets = []; // combattants proches de la trajectoire (réutilisé)
        this.teamMode = false; // set by main.js for duo/trio/section
    }

    // Arme de la case choisie (ou null) ; l'objet d'inventaire est f.inventory[f.slot]
    _heldWeapon(f) {
        const it = f.inventory?.[f.slot];
        if (!it || it.kind !== 'weapon') return null;
        return WEAPONS[it.weaponId] || null;
    }

    // Balle recyclée (ou neuve), toujours avec les mêmes champs
    _newBullet() {
        return this._free.pop() || {
            x: 0, y: 0, vx: 0, vy: 0, ux: 0, uy: 0, speed: 0,
            dist: 0, range: 0, damage: 0, owner: null, weaponId: null
        };
    }

    _recycle(b) {
        b.owner = null; // ne garde pas de référence vers un combattant
        this._free.push(b);
    }

    /* ===================== ACTIONS ===================== */

    // Renvoie true si le combattant a tiré ou frappé
    tryFire(f, justPressed) {
        if (!f.alive || f.dbno || f.phase !== 'ground') return false;
        if (f.reloadTimer > 0 || f.fireCooldown > 0) return false;
        const w = this._heldWeapon(f);
        if (!w) return false;
        const it = f.inventory[f.slot];
        if (!w.auto && !justPressed) return false;

        if (w.type === 'melee') return this._swing(f, it, w);

        if (!((it.mag || 0) > 0)) {
            // Chargeur vide et plus de munitions : petit "clic" (seulement au clic, pas en rafale)
            if (!this.startReload(f) && justPressed) this.events.onDryFire?.(f, w);
            return false;
        }

        const dmg = weaponDamage(w.id, it.rarity);
        const muzzle = f.r + w.length * 0.8;
        const n = w.pellets || 1;
        for (let i = 0; i < n; i++) {
            const a = f.angle + (Math.random() - 0.5) * 2 * (w.spread || 0);
            const b = this._newBullet();
            b.x = f.x;
            b.y = f.y;
            b.ux = Math.cos(a); // direction unitaire (calculée une seule fois)
            b.uy = Math.sin(a);
            b.speed = w.bulletSpeed;
            b.vx = b.ux * w.bulletSpeed;
            b.vy = b.uy * w.bulletSpeed;
            b.dist = 0;
            b.range = w.range;
            b.damage = dmg;
            b.owner = f;
            b.weaponId = w.id;
            // La balle part du centre et va jusqu'au bout du canon en vérifiant
            // les collisions : pas de tir à travers un mur collé, et on touche à bout portant.
            if (this._travel(b, muzzle)) this.bullets.push(b);
            else this._recycle(b);
        }
        it.mag--;
        f.fireCooldown = 1 / w.fireRate;
        f.usingItem = null;
        const mx = f.x + Math.cos(f.angle) * muzzle;
        const my = f.y + Math.sin(f.angle) * muzzle;
        this.events.onFire?.(f, w, mx, my);
        return true;
    }

    // Coup de pioche : touche tout ce qui est devant, à portée
    _swing(f, it, w) {
        f.swingT = 1;
        f.fireCooldown = 1 / w.fireRate;
        this.events.onFire?.(f, w, f.x, f.y);
        const dmg = weaponDamage(w.id, it.rarity);
        for (const t of this.fighters) {
            if (t === f || !t.alive || t.phase !== 'ground') continue;
            if (t.team && t.team === f.team) continue; // don't hit teammates
            if (t.dbno) continue; // can't melee a downed player (they bleed out)
            const dx = t.x - f.x;
            const dy = t.y - f.y;
            const reach = w.range + f.r + t.r;
            if (dx * dx + dy * dy >= reach * reach) continue;
            if (Math.abs(angleDiff(f.angle, Math.atan2(dy, dx))) > MELEE_ARC) continue;
            this.damage(t, dmg, f, w.id);
        }
        return true;
    }

    startReload(f) {
        if (!f.alive || f.dbno || f.reloadTimer > 0) return false;
        const w = this._heldWeapon(f);
        if (!w || w.type !== 'gun') return false;
        const it = f.inventory[f.slot];
        if ((it.mag || 0) >= w.magSize) return false;
        if (!((f.ammo[w.ammo] || 0) > 0)) return false;
        f.reloadTimer = w.reloadTime;
        f._reloadItem = it; // si l'arme change pendant la recharge, on annule
        f.usingItem = null;
        this.events.onReload?.(f, w);
        return true;
    }

    // Commence à utiliser le soin de la case choisie (si c'est utile)
    startUse(f) {
        if (!f.alive || f.dbno || (f.usingItem && f.usingItem.slot === f.slot)) return false; // déjà en cours
        const it = f.inventory?.[f.slot];
        if (!it || it.kind !== 'heal' || !(it.count > 0)) return false;
        const h = HEALS[it.itemId];
        if (!h) return false;
        const useful = (h.heal > 0 && f.health < (h.healCap ?? 100)) ||
                       (h.shield > 0 && f.shield < (h.shieldCap ?? 100));
        if (!useful) return false;
        f.usingItem = { slot: f.slot, t: 0, total: h.useTime };
        f.reloadTimer = 0;
        this.events.onUseStart?.(f, h);
        return true;
    }

    /*
       Bouclier d'abord, puis la vie.
       opts (optionnel) : { ignoreShield: true } → tout va directement dans la vie
       (ex : la corruption, comme la tempête de Fortnite).
    */
    damage(victim, amount, attacker, weaponId, opts) {
        if (!victim.alive || !(amount > 0)) return;
        // Teammates can't hurt each other
        if (attacker && attacker.team && victim.team && attacker.team === victim.team) return;

        // Downed player taking damage (can be finished off by enemies or corruption)
        if (victim.dbno) {
            victim.health -= amount;
            this.events.onDamage?.(victim, amount, attacker, false, weaponId);
            if (victim.health <= 0) {
                victim.health = 0;
                victim.alive = false;
                victim.dbno = false;
                const killer = attacker || victim.dbnoAttacker;
                const killWeapon = weaponId || victim.dbnoWeapon;
                if (killer && killer !== victim) killer.kills++;
                this.events.onKill?.(killer, victim, killWeapon);
            }
            return;
        }

        let left = amount;
        let hitShield = false;
        if (victim.shield > 0 && !opts?.ignoreShield) {
            const s = Math.min(victim.shield, left);
            victim.shield -= s;
            left -= s;
            hitShield = true;
        }
        victim.health -= left;
        this.events.onDamage?.(victim, amount, attacker, hitShield, weaponId);

        if (victim.health <= 0) {
            victim.health = 0;

            // Team mode: go DBNO (Down But Not Out) if teammates are still standing
            if (this.teamMode && !victim.dbno && weaponId !== 'bleedout') {
                const hasTeamAlive = this.fighters.some(f =>
                    f !== victim && f.alive && !f.dbno && f.team === victim.team
                );
                if (hasTeamAlive) {
                    victim.dbno = true;
                    victim.dbnoTimer = 35; // 35 seconds to be revived
                    victim.health = 100;   // DBNO bleedout health
                    victim.shield = 0;
                    victim.usingItem = null;
                    victim.reloadTimer = 0;
                    victim.speedMul = 0.35; // crawl slowly
                    victim.dbnoAttacker = attacker;
                    victim.dbnoWeapon = weaponId;
                    this.events.onDBNO?.(victim, attacker, weaponId);
                    return;
                }
            }

            victim.alive = false;
            victim.dbno = false;
            victim.usingItem = null;
            victim.reloadTimer = 0;
            const killer = victim.dbnoAttacker || attacker;
            const killWeapon = victim.dbnoWeapon || weaponId;
            if (killer && killer !== victim) killer.kills++;
            this.events.onKill?.(killer, victim, killWeapon);

            // If this player died, check if any remaining downed teammates now have no standing teammates (Squad Wipe)
            if (this.teamMode && victim.team) {
                const remainingStanding = this.fighters.some(f => f.alive && !f.dbno && f.team === victim.team);
                if (!remainingStanding) {
                    // Squad wipe: kill all remaining DBNO teammates of this squad
                    for (const f of this.fighters) {
                        if (f.alive && f.dbno && f.team === victim.team) {
                            f.alive = false;
                            f.dbno = false;
                            f.health = 0;
                            const wipeKiller = f.dbnoAttacker || attacker;
                            const wipeWeapon = f.dbnoWeapon || weaponId;
                            if (wipeKiller && wipeKiller !== f) wipeKiller.kills++;
                            this.events.onKill?.(wipeKiller, f, wipeWeapon);
                        }
                    }
                }
            }
        }
    }

    // Revive a downed teammate (called each frame while reviving)
    revive(reviver, target, dt) {
        if (!reviver.alive || reviver.dbno || !target.alive || !target.dbno) return false;
        if (reviver.team !== target.team) return false;
        const dx = target.x - reviver.x;
        const dy = target.y - reviver.y;
        if (dx * dx + dy * dy > 130 * 130) return false; // must be close

        target.reviveProgress = (target.reviveProgress || 0) + dt;
        if (target.reviveProgress >= 5) { // 5 seconds to revive
            target.dbno = false;
            target.health = 30;
            target.speedMul = 1;
            target.reviveProgress = 0;
            target.dbnoAttacker = null;
            target.dbnoWeapon = null;
            this.events.onRevive?.(reviver, target);
            return true; // revive complete
        }
        return false; // still reviving
    }

    /* ===================== MISE À JOUR ===================== */

    update(dt) {
        for (const f of this.fighters) this._updateFighter(f, dt);
        this._updateBullets(dt);
    }

    _updateFighter(f, dt) {
        // ----- DBNO bleedout & squad wipe check -----
        if (f.dbno && f.alive) {
            f.dbnoTimer = Math.max(0, (f.dbnoTimer || 35) - dt);
            f.health = Math.max(0, f.health - (100 / 35) * dt);
            const hasStandingTeammate = this.fighters.some(t => t !== f && t.alive && !t.dbno && t.team === f.team);
            if (!hasStandingTeammate || f.dbnoTimer <= 0 || f.health <= 0) {
                f.alive = false;
                f.dbno = false;
                f.health = 0;
                const killer = f.dbnoAttacker || f;
                const killWeapon = f.dbnoWeapon || 'bleedout';
                if (killer && killer !== f) killer.kills++;
                this.events.onKill?.(killer, f, killWeapon);
                return;
            }
        }
        if (f.fireCooldown > 0) f.fireCooldown = Math.max(0, f.fireCooldown - dt);
        if (f.swingT > 0) f.swingT = Math.max(0, f.swingT - dt / SWING_TIME);

        // ----- Rechargement -----
        if (f.reloadTimer > 0) {
            const w = this._heldWeapon(f);
            const it = w ? f.inventory[f.slot] : null;
            const changed = f._reloadItem && w && it !== f._reloadItem;
            if (!f.alive || !w || w.type !== 'gun' || changed) {
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

        // ----- Soin en cours -----
        const u = f.usingItem;
        if (u) {
            const it = f.inventory?.[u.slot];
            const h = it && it.kind === 'heal' ? HEALS[it.itemId] : null;
            if (!f.alive || f.slot !== u.slot || !h || !(it.count > 0)) {
                f.usingItem = null;
            } else {
                u.t += dt;
                if (u.t >= u.total) {
                    if (h.heal > 0) {
                        const cap = h.healCap ?? 100;
                        f.health = Math.max(f.health, Math.min(cap, f.health + h.heal));
                    }
                    if (h.shield > 0) {
                        const cap = h.shieldCap ?? 100;
                        f.shield = Math.max(f.shield, Math.min(cap, f.shield + h.shield));
                    }
                    it.count--;
                    if (it.count <= 0) f.inventory[u.slot] = null;
                    f.usingItem = null;
                    this.events.onHealed?.(f, h);
                }
            }
        }
        f.speedMul = f.dbno ? 0.35 : (f.usingItem ? 0.5 : 1); // à terre : 0.35, soin : 0.5, normal : 1
    }

    _updateBullets(dt) {
        const list = this.bullets;
        let n = 0;
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            const step = Math.min(b.speed * dt, b.range - b.dist);
            let alive = step > 0 && this._travel(b, step);
            b.dist += Math.max(0, step);
            if (b.dist >= b.range) alive = false;
            if (alive) list[n++] = b;
            else this._recycle(b);
        }
        list.length = n;
    }

    /*
       Fait avancer une balle de "len" unités par petits pas.
       Renvoie false si elle a touché quelque chose (elle disparaît).
       Les obstacles et les combattants proches de la trajectoire sont cherchés
       UNE fois pour tout le déplacement (rectangle englobant), puis chaque petit pas
       ne teste que cette courte liste (même résultat, beaucoup moins de calculs).
    */
    _travel(b, len) {
        const ux = b.ux;
        const uy = b.uy;
        const steps = Math.max(1, Math.ceil(len / SUB_STEP));
        const s = len / steps;

        // Rectangle englobant du trajet de cette image
        const ex = b.x + ux * len;
        const ey = b.y + uy * len;
        const minX = Math.min(b.x, ex);
        const maxX = Math.max(b.x, ex);
        const minY = Math.min(b.y, ey);
        const maxY = Math.max(b.y, ey);

        const walls = this.world.collide.query(minX - 1, minY - 1, maxX + 1, maxY + 1, this._walls);

        // Combattants au sol dont le cercle touche ce rectangle (ordre du tableau conservé)
        const targets = this._targets;
        targets.length = 0;
        const fighters = this.fighters;
        for (let i = 0; i < fighters.length; i++) {
            const t = fighters[i];
            if (t === b.owner || !t.alive || t.phase !== 'ground') continue;
            // Bullets pass right through teammates
            if (b.owner?.team && t.team && b.owner.team === t.team) continue;
            const rr = t.r + HIT_PAD;
            if (t.x + rr < minX || t.x - rr > maxX || t.y + rr < minY || t.y - rr > maxY) continue;
            targets.push(t);
        }

        for (let k = 0; k < steps; k++) {
            b.x += ux * s;
            b.y += uy * s;
            if (walls.length && this._wallAt(walls, b.x, b.y)) {
                this.events.onImpact?.(b.x, b.y, Math.atan2(uy, ux), 'wall', null);
                return false;
            }
            for (let i = 0; i < targets.length; i++) {
                const t = targets[i];
                if (!t.alive) continue;
                const rr = t.r + HIT_PAD;
                const dx = b.x - t.x;
                const dy = b.y - t.y;
                if (dx * dx + dy * dy < rr * rr) {
                    this.events.onImpact?.(b.x, b.y, Math.atan2(uy, ux), t.shield > 0 ? 'shield' : 'health', t);
                    this.damage(t, b.damage, b.owner, b.weaponId);
                    return false;
                }
            }
        }
        return true;
    }

    // Le point (x, y) est-il dans un des obstacles de la liste ?
    _wallAt(list, x, y) {
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

    _hitWall(x, y) {
        return this._wallAt(this.world.collide.query(x - 1, y - 1, x + 1, y + 1, this._near), x, y);
    }

    /* ===================== DESSIN ===================== */

    // Traceurs des balles (coordonnées monde)
    draw(ctx) {
        if (!this.bullets.length) return;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.beginPath();
        const list = this.bullets;
        for (let i = 0; i < list.length; i++) {
            const b = list[i];
            const len = Math.min(TRACER, b.dist + 6);
            ctx.moveTo(b.x - b.ux * len, b.y - b.uy * len);
            ctx.lineTo(b.x, b.y);
        }
        ctx.strokeStyle = 'rgba(10,16,48,0.55)';
        ctx.lineWidth = 6.5;
        ctx.stroke();
        ctx.strokeStyle = '#fff3a8';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();
    }
}
