/* ==================================
   COMBAT - FOR2D ROYAL
   Tirs, balles, coups de pioche, rechargement, soins et dégâts.
   Fonctionne pour tous les combattants (joueur ET bots).
   ================================== */

import { WEAPONS, HEALS, THROWABLES, weaponDamage } from './weapons.js';

const MELEE_ARC = (40 * Math.PI) / 180; // la pioche touche à ±40° devant soi
const SWING_TIME = 0.25;                // durée de l'animation de coup (s)
const SUB_STEP = 20;                    // les balles avancent par pas de 20 unités max
const HIT_PAD = 4;                      // marge de collision balle / combattant
const TRACER = 26;                      // longueur du traceur
const THROW_SPEED = 430;
const THROW_GRAVITY = 360;
const THROW_RANGE = 620;

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
        this.throwables = [];
        this._freeThrowables = [];
        this.smokeZones = [];
        this.teamMode = false; // set by main.js for duo/trio/section
        /*
           Multijoueur : chaque combattant a UN seul « propriétaire » qui décide de
           ses dégâts, de son K.O. et de sa mort (le joueur pour lui-même, l'hôte pour
           les bots). Ailleurs, un coup sur ce combattant est seulement signalé
           (events.onRemoteHit) au propriétaire, qui l'applique puis le diffuse.
           En solo, tout est possédé localement.
        */
        this.owns = () => true;
    }

    // Arme de la case choisie (ou null) ; l'objet d'inventaire est f.inventory[f.slot]
    _heldWeapon(f) {
        const it = f.inventory?.[f.slot];
        if (!it || it.kind !== 'weapon') return null;
        return WEAPONS[it.weaponId] || null;
    }

    _heldThrowable(f) {
        const it = f.inventory?.[f.slot];
        if (!it || it.kind !== 'throwable' || !(it.count > 0)) return null;
        return THROWABLES[it.itemId] || null;
    }

    beginThrow(f) {
        const t = this._heldThrowable(f);
        if (!t || f.throwState?.slot === f.slot) return Boolean(f.throwState);
        f.throwState = { slot: f.slot, itemId: t.id, t: 0 };
        f.usingItem = null;
        return true;
    }

    isThrowing(f) {
        return Boolean(f.throwState && f.throwState.slot === f.slot && this._heldThrowable(f));
    }

    throwNow(f, angle, visual = false) {
        if (!f?.alive || f.dbno || f.phase !== 'ground') return false;
        const state = f.throwState;
        const t = this._heldThrowable(f);
        if (!t || (state && state.slot !== f.slot)) return false;
        if (!visual) {
            const item = f.inventory[f.slot];
            item.count--;
            if (item.count <= 0) f.inventory[f.slot] = null;
        }
        f.throwState = null;
        const p = this._freeThrowables.pop() || {};
        const a = Number.isFinite(angle) ? angle : f.angle;
        p.x = f.x + Math.cos(a) * (f.r + 8);
        p.y = f.y + Math.sin(a) * (f.r + 8);
        p.vx = Math.cos(a) * THROW_SPEED;
        p.vy = Math.sin(a) * THROW_SPEED;
        p.age = 0;
        p.dist = 0;
        p.range = THROW_RANGE;
        p.itemId = t.id;
        p.owner = f;
        p.visual = visual;
        p.done = false;
        this.throwables.push(p);
        this.events.onThrow?.(f, t, a, visual);
        return true;
    }

    ghostThrow(f, itemId, angle) {
        if (!f) return false;
        const had = f.inventory?.[f.slot];
        const old = f.slot;
        if (!had || had.kind !== 'throwable' || had.itemId !== itemId) {
            f.inventory = f.inventory || [];
            f.inventory[old] = { kind: 'throwable', itemId, count: 1 };
        }
        return this.throwNow(f, angle, true);
    }

    throwPreview(f, angle) {
        const t = this._heldThrowable(f);
        if (!t || !f?.alive || f.dbno) return null;
        const a = Number.isFinite(angle) ? angle : f.angle;
        const points = [];
        const ox = f.x + Math.cos(a) * (f.r + 8);
        const oy = f.y + Math.sin(a) * (f.r + 8);
        for (let i = 0; i <= 14; i++) {
            const time = i * 0.09;
            const x = ox + Math.cos(a) * THROW_SPEED * time;
            const y = oy + Math.sin(a) * THROW_SPEED * time + 0.5 * THROW_GRAVITY * time * time;
            points.push({ x, y });
            if (this._hitWall(x, y)) break;
        }
        return points;
    }

    _explode(p) {
        const t = THROWABLES[p.itemId];
        if (!t || p.done) return;
        p.done = true;
        if (t.id === 'smoke') this.smokeZones.push({ x: p.x, y: p.y, r: t.radius, age: 0, duration: t.duration || 8 });
        if (!p.visual) {
            for (const target of this.fighters) {
                if (!target.alive || target.phase !== 'ground') continue;
                const d = Math.hypot(target.x - p.x, target.y - p.y);
                if (d > t.radius) continue;
                const factor = 1 - d / t.radius;
                if (t.damage > 0) this.damage(target, Math.max(1, t.damage * factor), p.owner, t.id);
                if (t.id === 'flash') target.flashTimer = Math.max(target.flashTimer || 0, t.duration * factor);
                if (t.id === 'propulsion') {
                    const dx = target.x - p.x;
                    const dy = target.y - p.y;
                    const len = Math.hypot(dx, dy) || 1;
                    target.propelX = (target.propelX || 0) + (dx / len) * t.impulse * factor;
                    target.propelY = (target.propelY || 0) + (dy / len) * t.impulse * factor;
                }
                this.events.onEffect?.(target, t.id, factor, p.x, p.y, p.visual);
            }
        }
        this.events.onExplode?.(p.x, p.y, t, p.owner, p.visual);
        this._freeThrowables.push(p);
    }

    _updateThrowables(dt) {
        for (let i = this.throwables.length - 1; i >= 0; i--) {
            const p = this.throwables[i];
            p.age += dt;
            p.vy += THROW_GRAVITY * dt;
            const nx = p.x + p.vx * dt;
            const ny = p.y + p.vy * dt;
            if (this._hitWall(nx, ny) || p.dist + Math.hypot(nx - p.x, ny - p.y) >= p.range) {
                p.x = nx; p.y = ny;
                this._explode(p);
                this.throwables.splice(i, 1);
                continue;
            }
            p.x = nx; p.y = ny;
            p.dist += Math.hypot(p.vx * dt, p.vy * dt);
            const fuse = THROWABLES[p.itemId]?.fuse || 1;
            if (p.age >= fuse) {
                this._explode(p);
                this.throwables.splice(i, 1);
            }
        }
    }

    drawThrowPreview(ctx, f, angle) {
        const points = this.throwPreview(f, angle);
        if (!points?.length) return;
        ctx.save();
        ctx.setLineDash([8, 8]);
        ctx.strokeStyle = 'rgba(255, 232, 130, 0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(f.x, f.y);
        for (const p of points) ctx.lineTo(p.x, p.y);
        ctx.stroke();
        const end = points[points.length - 1];
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255, 224, 61, 0.9)';
        ctx.beginPath(); ctx.arc(end.x, end.y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }


    _newBullet() {
        return this._free.pop() || {
            x: 0, y: 0, vx: 0, vy: 0, ux: 0, uy: 0, speed: 0,
            dist: 0, range: 0, damage: 0, owner: null, weaponId: null, visual: false, bounces: 0
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
            b.visual = false;
            b.bounces = w.bounces || 0;
            // La balle part du centre et va jusqu'au bout du canon en vérifiant
            // les collisions : pas de tir à travers un mur collé, et on touche à bout portant.
            if (this._travel(b, muzzle)) this.bullets.push(b);
            else this._recycle(b);
        }
        it.mag--;
        if (it.mag <= 0) this.startReload(f); // recharge automatiquement après la dernière balle
        f.fireCooldown = 1 / w.fireRate;
        f.usingItem = null;
        const mx = f.x + Math.cos(f.angle) * muzzle;
        const my = f.y + Math.sin(f.angle) * muzzle;
        this.events.onFire?.(f, w, mx, my);
        return true;
    }

    /*
       Tir d'un combattant simulé sur une autre machine (coéquipier distant, bot de
       l'hôte) : mêmes balles à l'écran, mais SANS dégâts (le tireur les calcule
       chez lui). Pas de munitions ni de cadence : on rejoue juste ce qui a été tiré.
    */
    ghostFire(f, weaponId, angle) {
        const w = WEAPONS[weaponId];
        if (!w || !f) return;
        if (Number.isFinite(angle)) f.angle = angle;
        if (w.type === 'melee') {
            f.swingT = 1;
            return;
        }
        const muzzle = f.r + w.length * 0.8;
        const n = w.pellets || 1;
        for (let i = 0; i < n; i++) {
            const a = f.angle + (Math.random() - 0.5) * 2 * (w.spread || 0);
            const b = this._newBullet();
            b.x = f.x;
            b.y = f.y;
            b.ux = Math.cos(a);
            b.uy = Math.sin(a);
            b.speed = w.bulletSpeed;
            b.vx = b.ux * w.bulletSpeed;
            b.vy = b.uy * w.bulletSpeed;
            b.dist = 0;
            b.range = w.range;
            b.damage = 0;
            b.owner = f;
            b.weaponId = w.id;
            b.visual = true;
            b.bounces = w.bounces || 0;
            if (this._travel(b, muzzle)) this.bullets.push(b);
            else this._recycle(b);
        }
        f.usingItem = null;
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
        const useful = h.mode === 'stim'
            ? !(f.stimTimer > 0)
            : (h.heal > 0 && f.health < (h.healCap ?? 100)) ||
              (h.shield > 0 && f.shield < (h.shieldCap ?? 100));
        if (!useful) return false;
        f.usingItem = { slot: f.slot, t: 0, total: h.useTime };
        f.reloadTimer = 0;
        this.events.onUseStart?.(f, h);
        return true;
    }

    adminHeal(f, kind) {
        if (!f?.alive) return false;
        if (kind === 'health') f.health = 100;
        else if (kind === 'shield') f.shield = 100;
        else return false;
        this.events.onHealed?.(f, { id: kind, heal: kind === 'health' ? 100 : 0, shield: kind === 'shield' ? 100 : 0 });
        return true;
    }

    adminKill(victim, attacker = null) {
        if (!victim?.alive || !this.owns(victim)) return false;
        victim.health = 0;
        victim.shield = 0;
        victim.alive = false;
        victim.dbno = false;
        victim.usingItem = null;
        victim.reloadTimer = 0;
        this.events.onKill?.(attacker, victim, 'admin');
        return true;
    }

    /*
       Bouclier d'abord, puis la vie.
       opts (optionnel) : { ignoreShield: true } → tout va directement dans la vie
       (ex : la corruption, comme la tempête de Fortnite).
    */
    damage(victim, amount, attacker, weaponId, opts) {
        if (!victim.alive || !(amount > 0)) return;
        // Les coéquipiers restent protégés, mais une explosion peut blesser son propriétaire.
        if (attacker && attacker !== victim && attacker.team && victim.team && attacker.team === victim.team) return;

        // Combattant géré par une autre machine : on lui signale le coup, il l'appliquera.
        // (corruption et hémorragie : chaque propriétaire les calcule déjà lui-même)
        if (!this.owns(victim)) {
            if (weaponId !== 'corruption' && weaponId !== 'bleedout') {
                this.events.onRemoteHit?.(victim, amount, attacker, weaponId);
            }
            return;
        }

        // God mode admin : l’impact reste visible (flash, son, hitmarker),
        // mais aucune vie/bouclier/DBNO ne change.
        if (victim.adminInvincible) {
            this.events.onDamage?.(victim, amount, attacker, victim.shield > 0, weaponId);
            return;
        }

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
                        // Les coéquipiers gérés ailleurs s'éliminent chez eux (même règle)
                        if (f.alive && f.dbno && f.team === victim.team && this.owns(f)) {
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
        for (let i = this.smokeZones.length - 1; i >= 0; i--) {
            this.smokeZones[i].age += dt;
            if (this.smokeZones[i].age >= this.smokeZones[i].duration) this.smokeZones.splice(i, 1);
        }
        for (const f of this.fighters) this._updateFighter(f, dt);
        this._updateBullets(dt);
        this._updateThrowables(dt);
    }

    _updateFighter(f, dt) {
        // ----- DBNO bleedout & squad wipe check -----
        if (f.dbno && f.alive && f.adminInvincible) {
            f.dbnoTimer = 35;
            f.health = 100;
        } else if (f.dbno && f.alive && !this.owns(f)) {
            // Copie d'un combattant distant : seul le compte à rebours avance (affichage)
            f.dbnoTimer = Math.max(0, (f.dbnoTimer || 0) - dt);
        } else if (f.dbno && f.alive) {
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

        // ----- Soins / stimulation en cours -----
        const u = f.usingItem;
        if (u) {
            const it = f.inventory?.[u.slot];
            const h = it && it.kind === 'heal' ? HEALS[it.itemId] : null;
            if (!f.alive || f.slot !== u.slot || !h || !(it.count > 0)) {
                f.usingItem = null;
            } else {
                u.t += dt;
                if (h.mode === 'spray') {
                    u.tick = (u.tick || 0) + dt;
                    while (u.tick >= (h.tickInterval || 0.4) && u.t < u.total) {
                        u.tick -= h.tickInterval || 0.4;
                        f.health = Math.min(h.healCap ?? 100, f.health + (h.tickHeal || 1));
                        this.events.onHealed?.(f, { ...h, heal: h.tickHeal || 1, tick: true });
                    }
                }
                if (u.t >= u.total) {
                    if (h.mode === 'stim') {
                        f.stimTimer = h.duration || 8;
                        f.stimSpeedMul = h.speedMultiplier || 1.25;
                    } else if (h.mode !== 'spray') {
                        if (h.heal > 0) {
                            const cap = h.healCap ?? 100;
                            f.health = Math.max(f.health, Math.min(cap, f.health + h.heal));
                        }
                        if (h.shield > 0) {
                            const cap = h.shieldCap ?? 100;
                            f.shield = Math.max(f.shield, Math.min(cap, f.shield + h.shield));
                        }
                        this.events.onHealed?.(f, h);
                    }
                    it.count--;
                    if (it.count <= 0) f.inventory[u.slot] = null;
                    f.usingItem = null;
                }
            }
        }
        if (f.stimTimer > 0) f.stimTimer = Math.max(0, f.stimTimer - dt);
        if (f.flashTimer > 0) f.flashTimer = Math.max(0, f.flashTimer - dt);
        const stim = f.stimTimer > 0 ? (f.stimSpeedMul || 1.25) : 1;
        f.speedMul = f.dbno ? 0.35 : (f.usingItem ? 0.5 : stim); // soin lent, stimulant rapide
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
                if (b.bounces > 0) {
                    const oldUx = b.ux;
                    const hitX = this._wallAt(walls, b.x + oldUx * 3, b.y);
                    const hitY = this._wallAt(walls, b.x, b.y + b.uy * 3);
                    if (hitX) b.ux = -b.ux;
                    if (hitY) b.uy = -b.uy;
                    if (!hitX && !hitY) b.ux = -b.ux;
                    b.vx = b.ux * b.speed;
                    b.vy = b.uy * b.speed;
                    b.bounces--;
                    b.x -= oldUx * 3;
                    b.y -= b.uy * 3;
                    this.events.onImpact?.(b.x, b.y, Math.atan2(b.vy, b.vx), 'ricochet', null);
                    continue;
                }
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
                    this.events.onImpact?.(b.x, b.y, Math.atan2(uy, ux), t.shield > 0 ? 'shield' : 'health', b.visual ? null : t);
                    if (!b.visual) this.damage(t, b.damage, b.owner, b.weaponId);
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
        if (!this.bullets.length && !this.throwables.length && !this.smokeZones.length) return;
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
        for (const p of this.throwables) {
            const t = THROWABLES[p.itemId];
            ctx.fillStyle = t?.color || '#fff0a0';
            ctx.strokeStyle = '#0a1030';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        for (const zone of this.smokeZones) {
            const fade = Math.max(0, 1 - zone.age / zone.duration);
            ctx.fillStyle = `rgba(185, 195, 210, ${0.26 * fade})`;
            ctx.beginPath(); ctx.arc(zone.x, zone.y, zone.r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(230, 235, 245, ${0.35 * fade})`;
            ctx.lineWidth = 4; ctx.stroke();
        }
        ctx.restore();
    }
}
