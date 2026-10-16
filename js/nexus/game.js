/* ==================================
   NEXUS - MOTEUR DE PARTIE (Contrôle 5v5)
   Règles reprises du mode Contrôle d'Overwatch :
   - le point est verrouillé au début de chaque manche,
   - une équipe seule sur le point le capture (plus vite à plusieurs),
   - l'équipe qui contrôle le point gagne +1 % par seconde, même sans être dessus,
   - à 99 %, si l'adversaire conteste ou a commencé à capturer : PROLONGATION,
   - 100 % = manche gagnée, première équipe à 2 manches = victoire.
   Combat : dégâts, soins, recharge d'ultime, passifs de rôle, réapparition en base.
   ================================== */

import { collide } from './map.js?v=2';
import { castWall, lineOfSight, rayCircle } from './geom.js?v=1';
import { HERO_BY_ID } from './heroes.js?v=2';
import { HERO_RADIUS } from './sprites.js?v=2';
import { KITS } from './kits.js?v=1';
import { SFX } from '../sfx.js?v=17';

const TAU = Math.PI * 2;

export const RULES = {
    pointLock: 20,          // secondes avant le déverrouillage du point
    captureTime: 7,         // secondes pour capturer seul
    captureMul: [0, 1, 1.5, 2, 2.2, 2.4],
    progressDecay: 8,       // % par seconde quand personne ne capture
    scoreRate: 1,           // % par seconde pour l'équipe qui contrôle
    roundsToWin: 2,
    respawn: 10,
    spawnHeal: 260,         // PV / s dans sa base
    roundEndTime: 6,
    passiveUlt: 0.35,       // % d'ultime par seconde
    woundTime: 2,           // passif Dégâts : soins reçus réduits
    woundMul: 0.75,
    supportRegenDelay: 2.5, // passif Soutien
    supportRegen: 15,
    tankKnockMul: 0.6,      // passif Tank
    tankUltMul: 0.7
};

export function emptyInput() {
    return { mx: 0, my: 0, ax: 0, ay: 0, fire: false, fire2: false, firePressed: false, fire2Pressed: false, shift: false, e: false, q: false, reload: false };
}

function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
}

// Rectangle solide contre un cercle (pour la barrière des bases adverses)
function pushOutRect(x, y, r, o) {
    const cx = Math.max(o.x, Math.min(x, o.x + o.w));
    const cy = Math.max(o.y, Math.min(y, o.y + o.h));
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return null;
    if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        return { x: cx + (dx / d) * r, y: cy + (dy / d) * r };
    }
    const l = x - o.x, rr = o.x + o.w - x, t = y - o.y, b = o.y + o.h - y;
    const m = Math.min(l, rr, t, b);
    if (m === l) return { x: o.x - r, y };
    if (m === rr) return { x: o.x + o.w + r, y };
    if (m === t) return { x, y: o.y - r };
    return { x, y: o.y + o.h + r };
}

export class Game {
    constructor({ map, allies, enemies, events = {} }) {
        this.map = map;
        this.events = events;
        this.time = 0;
        this.fighters = [];
        this.projectiles = [];
        this.objects = [];    // pièges, mines, pneu, souvenirs de mort…
        this.effects = [];    // effets visuels (traînées, explosions, chiffres)
        this.feed = [];
        this.spawnRooms = {
            blue: map.zones.find(z => z.kind === 'spawn' && z.team === 'blue'),
            red: map.zones.find(z => z.kind === 'spawn' && z.team === 'red')
        };
        let id = 0;
        const add = (list, team) => list.forEach((m, i) => this.fighters.push(this.makeFighter(m, team, i, id++)));
        add(allies, 'blue');
        add(enemies, 'red');
        this.player = this.fighters.find(f => f.isPlayer) || null;

        this.round = 1;
        this.roundsWon = { blue: 0, red: 0 };
        this.startRound();
    }

    makeFighter(m, team, index, id) {
        const kit = KITS[m.heroId];
        const f = {
            id, name: m.name, team, index, heroId: m.heroId, hero: HERO_BY_ID[m.heroId], kit,
            role: HERO_BY_ID[m.heroId].role,
            isPlayer: Boolean(m.isPlayer), isBot: !m.isPlayer,
            x: 0, y: 0, r: HERO_RADIUS[m.heroId] || 20, angle: team === 'blue' ? 0 : Math.PI,
            vx: 0, vy: 0, dash: null,
            hp: kit.hp, maxHp: kit.hp, over: 0,
            alive: true, respawnT: 0,
            ult: 0, cd: {}, charges: {},
            stun: 0, root: 0, invuln: 0, amp: 0, wound: 0, lastHurt: -99,
            slow: 1, speedBuff: 1, moving: false, t: Math.random() * 10,
            input: emptyInput(),
            stats: { kills: 0, deaths: 0, damage: 0, healing: 0, onPoint: 0 },
            sprite: null
        };
        kit.init?.(f, this);
        return f;
    }

    /* ----- Manches ----- */

    startRound() {
        this.phase = 'setup';
        this.lockLeft = RULES.pointLock;
        this.owner = null;
        this.score = { blue: 0, red: 0 };
        this.progress = { team: null, value: 0 };
        this.overtime = false;
        this.contested = false;
        this.projectiles.length = 0;
        this.objects = this.objects.filter(o => o.keepBetweenRounds);
        for (const f of this.fighters) this.respawn(f, true);
        this.emit('onRoundStart', this.round);
    }

    respawn(f, roundStart = false) {
        const spots = this.map.spawns[f.team];
        const s = spots[f.index % spots.length];
        f.x = s.x; f.y = s.y;
        f.vx = 0; f.vy = 0; f.dash = null;
        f.alive = true;
        f.respawnT = 0;
        f.stun = 0; f.root = 0; f.amp = 0; f.wound = 0; f.over = 0;
        f.invuln = roundStart ? 0 : 1;
        f.angle = f.team === 'blue' ? 0 : Math.PI;
        f.kit.reset?.(f, this, roundStart);
        f.hp = f.maxHp;
        if (roundStart) { f.cd = {}; f.kit.resetCooldowns?.(f); }
    }

    emit(name, ...args) {
        try { this.events[name]?.(...args); } catch (e) { console.error(e); }
    }

    sound(name, opts = {}) {
        try { SFX.play(name, opts); } catch { /* son facultatif */ }
    }

    /* ----- Requêtes ----- */

    enemiesOf(f) { return this.fighters.filter(o => o.alive && o.team !== f.team); }
    alliesOf(f, self = true) { return this.fighters.filter(o => o.alive && o.team === f.team && (self || o !== f)); }

    // Cibles qui peuvent prendre des dégâts (héros + objets comme le pneu de Kraz)
    targetsFor(team) {
        const list = this.fighters.filter(o => o.alive && o.team !== team && o.invuln <= 0);
        for (const o of this.objects) if (o.isTarget && o.alive && o.team !== team) list.push(o);
        return list;
    }

    onPoint(f) {
        const p = this.map.point;
        return f.alive && Math.hypot(f.x - p.x, f.y - p.y) <= p.r;
    }

    inSpawn(f, team = f.team) {
        const z = this.spawnRooms[team];
        return z && f.x >= z.x && f.x <= z.x + z.w && f.y >= z.y && f.y <= z.y + z.h;
    }

    los(ax, ay, bx, by) { return lineOfSight(this.map, ax, ay, bx, by); }

    /* ----- Barrières et matrice ----- */

    // Première barrière ennemie traversée par le segment a→b : { t, owner } ou null
    barrierHit(team, ax, ay, bx, by) {
        let best = null;
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const dx = (bx - ax) / len, dy = (by - ay) / len;
        for (const f of this.fighters) {
            const b = f.barrier;
            if (!f.alive || f.team === team || !b?.up) continue;
            // Arc de cercle autour du porteur : on teste les 2 intersections du segment avec le cercle
            const fx = ax - f.x, fy = ay - f.y;
            const B = fx * dx + fy * dy;
            const C = fx * fx + fy * fy - b.radius * b.radius;
            const disc = B * B - C;
            if (disc < 0) continue;
            const sq = Math.sqrt(disc);
            for (const t of [-B - sq, -B + sq]) {
                if (t < 0 || t > len) continue;
                const hx = ax + dx * t, hy = ay + dy * t;
                const a = Math.atan2(hy - f.y, hx - f.x);
                if (Math.abs(angleDiff(a, b.angle)) <= b.half && (!best || t < best.t)) best = { t, owner: f, x: hx, y: hy };
            }
        }
        return best;
    }

    damageBarrier(owner, amount) {
        const b = owner.barrier;
        if (!b) return;
        b.hp -= amount;
        b.lastHit = this.time;
        if (b.hp <= 0) {
            b.hp = 0;
            b.up = false;
            b.broken = owner.kit.barrierBreakTime || 5;
            this.addEffect({ type: 'ring', x: owner.x, y: owner.y, r0: 40, r1: 150, color: '#8fd3ff', life: 0.5 });
            this.sound('impact', { kind: 'shield', x: owner.x, y: owner.y });
        }
    }

    /* ----- Combat ----- */

    damage(target, amount, src, opts = {}) {
        if (!target || !target.alive || amount <= 0) return 0;
        if (target.invuln > 0) return 0;
        if (src && target.team === src.team && target !== src) return 0;
        let dmg = amount * (src?.amp > 0 ? 1.3 : 1) * (src?.dmgMul || 1);
        if (target.isTarget) {
            // Objet (pneu…) : pas de bouclier ni de passif
            target.hp -= dmg;
            if (target.hp <= 0) { target.alive = false; target.onDestroyed?.(this, src); }
            return dmg;
        }
        dmg = target.kit.onDamaged ? target.kit.onDamaged(target, dmg, src, this) : dmg;
        let left = dmg;
        if (target.over > 0) {
            const a = Math.min(target.over, left);
            target.over -= a;
            left -= a;
        }
        target.hp -= left;
        target.lastHurt = this.time;
        if (src && src !== target) {
            if (src.role === 'damage') target.wound = RULES.woundTime;
            src.stats.damage += dmg;
            this.gainUlt(src, dmg * (target.role === 'tank' ? RULES.tankUltMul : 1));
            target.lastAttacker = src;
        }
        this.emit('onDamage', target, dmg, src, opts);
        if (target.hp <= 0) {
            target.hp = 0;
            if (target.kit.onLethal?.(target, src, this)) return dmg; // ex. Volta éjectée
            this.kill(target, src, opts.how);
        }
        return dmg;
    }

    heal(target, amount, src) {
        if (!target?.alive || target.isTarget || amount <= 0) return 0;
        const mul = target.wound > 0 ? RULES.woundMul : 1;
        const before = target.hp;
        target.hp = Math.min(target.maxHp, target.hp + amount * mul);
        const done = target.hp - before;
        if (src && done > 0) {
            src.stats.healing += done;
            if (src !== target) this.gainUlt(src, done);
        }
        return done;
    }

    gainUlt(f, points) {
        if (!f || f.ultActive || f.isTarget) return;
        const cost = f.kit.ultCost || 1600;
        f.ult = Math.min(100, f.ult + (points / cost) * 100 * (f.ultMul || 1));
    }

    kill(target, src, how = '') {
        target.alive = false;
        target.hp = 0;
        target.over = 0;
        target.dash = null;
        target.barrier && (target.barrier.up = false);
        target.respawnT = RULES.respawn;
        target.stats.deaths++;
        target.ultActive = false;
        target.kit.onDeath?.(target, this);
        const killer = src && src !== target ? src : target.lastAttacker || null;
        if (killer && killer.team !== target.team) killer.stats.kills++;
        this.feed.unshift({ killer, victim: target, how, t: this.time });
        this.feed.length = Math.min(this.feed.length, 6);
        this.addEffect({ type: 'burst', x: target.x, y: target.y, color: target.team === 'blue' ? '#38bdf8' : '#f43f5e', life: 0.6 });
        // Souvenir au sol : permet la résurrection (Séraphine)
        this.objects.push({ kind: 'soul', team: target.team, fighter: target, x: target.x, y: target.y, life: RULES.respawn, alive: true });
        this.sound('eliminate', { x: target.x, y: target.y });
        this.emit('onKill', killer, target, how);
    }

    revive(target, src) {
        if (target.alive) return;
        target.alive = true;
        target.hp = target.maxHp;
        target.respawnT = 0;
        target.invuln = 0.6;
        target.kit.reset?.(target, this, false);
        target.hp = target.maxHp;
        this.objects = this.objects.filter(o => !(o.kind === 'soul' && o.fighter === target));
        this.addEffect({ type: 'ring', x: target.x, y: target.y, r0: 10, r1: 120, color: '#ffe27a', life: 0.8 });
        this.sound('healDone', { x: target.x, y: target.y });
        this.emit('onRevive', target, src);
    }

    knock(target, vx, vy) {
        if (!target?.alive || target.isTarget || target.invuln > 0) return;
        const mul = target.role === 'tank' ? RULES.tankKnockMul : 1;
        target.vx += vx * mul;
        target.vy += vy * mul;
        if (target.dash && !target.dash.unstoppable) target.dash = null;
    }

    stunTarget(target, t) {
        if (!target?.alive || target.isTarget || target.invuln > 0) return;
        target.stun = Math.max(target.stun, t);
        target.dash = null;
        target.kit.onStunned?.(target, this);
    }

    /**
     * Tir instantané. Renvoie le point d'arrivée. `dmgAt(dist)` donne les dégâts selon la distance.
     */
    hitscan(src, ox, oy, angle, range, dmgAt, opts = {}) {
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const wall = castWall(this.map, ox, oy, dx, dy, range);
        let end = wall.t;
        const bar = this.barrierHit(src.team, ox, oy, ox + dx * end, oy + dy * end);
        let hitTarget = null;
        let best = bar ? bar.t : end;
        for (const t of this.targetsFor(src.team)) {
            const d = rayCircle(ox, oy, dx, dy, t.x, t.y, t.r);
            if (d < best) { best = d; hitTarget = t; }
        }
        if (hitTarget) {
            end = best;
            this.damage(hitTarget, dmgAt(best), src, { how: opts.how, x: ox + dx * best, y: oy + dy * best });
        } else if (bar) {
            end = bar.t;
            this.damageBarrier(bar.owner, dmgAt(bar.t));
        }
        const ex = ox + dx * end, ey = oy + dy * end;
        if (opts.tracer !== false) {
            this.addEffect({ type: 'tracer', x: ox, y: oy, x2: ex, y2: ey, color: opts.color || '#fff', width: opts.width || 3, life: 0.07 });
        }
        if (!hitTarget && !bar && wall.t < range && opts.spark !== false) {
            this.addEffect({ type: 'spark', x: ex, y: ey, color: opts.color || '#fff', life: 0.18 });
        }
        return { x: ex, y: ey, target: hitTarget };
    }

    /**
     * Projectile. Options : x, y, angle, speed, r, dmg, team, owner, kind, life,
     * pierce, bounces, friction, eatable, onHit(target), onWall(hit), onExpire().
     */
    spawnProjectile(p) {
        const proj = {
            vx: Math.cos(p.angle) * p.speed, vy: Math.sin(p.angle) * p.speed,
            r: 6, life: 2, pierce: false, bounces: 0, eatable: true, hitSet: null, age: 0,
            ...p, team: p.owner?.team || p.team
        };
        if (proj.pierce) proj.hitSet = new Set();
        this.projectiles.push(proj);
        return proj;
    }

    updateProjectiles(dt) {
        const list = this.projectiles;
        for (let i = list.length - 1; i >= 0; i--) {
            const p = list[i];
            p.age += dt;
            if (p.dead) { list.splice(i, 1); continue; }
            if (p.stuckTo) {
                // Collé à une cible (bombe à impulsion)
                if (p.stuckTo.alive) { p.x = p.stuckTo.x + p.stuckOx; p.y = p.stuckTo.y + p.stuckOy; }
                p.update?.(p, this, dt);
                if (p.dead) list.splice(i, 1);
                continue;
            }
            if (p.stuck) {
                p.update?.(p, this, dt);
                if (p.dead) list.splice(i, 1);
                continue;
            }
            p.life -= dt;
            if (p.life <= 0) {
                p.onExpire?.(p, this);
                list.splice(i, 1);
                continue;
            }
            if (p.friction) {
                const k = Math.max(0, 1 - p.friction * dt);
                p.vx *= k; p.vy *= k;
            }
            const speed = Math.hypot(p.vx, p.vy);
            let step = speed * dt;
            const dx = speed > 0 ? p.vx / speed : 0, dy = speed > 0 ? p.vy / speed : 0;
            if (step < 0.01) { p.update?.(p, this, dt); continue; }
            // Murs
            const wall = castWall(this.map, p.x, p.y, dx, dy, step + p.r * 0.5);
            const wallT = wall.t < step + p.r * 0.5 ? Math.max(0, wall.t - p.r * 0.5) : Infinity;
            // Barrières ennemies
            const bar = p.ignoreBarrier ? null : this.barrierHit(p.team, p.x, p.y, p.x + dx * step, p.y + dy * step);
            // Cibles
            let hit = null, hitT = Infinity;
            for (const t of this.targetsFor(p.team)) {
                if (p.hitSet?.has(t)) continue;
                const d = rayCircle(p.x, p.y, dx, dy, t.x, t.y, t.r + p.r);
                if (d <= step && d < hitT) { hit = t; hitT = d; }
            }
            const first = Math.min(wallT, bar ? bar.t : Infinity, hitT);
            if (first === Infinity) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.update?.(p, this, dt);
                continue;
            }
            p.x += dx * first;
            p.y += dy * first;
            if (first === hitT) {
                if (p.pierce) {
                    p.hitSet.add(hit);
                    p.onHit?.(p, hit, this);
                    p.x += dx * (step - first);
                    p.y += dy * (step - first);
                } else {
                    p.onHit?.(p, hit, this);
                    if (!p.keepAlive) { list.splice(i, 1); continue; }
                }
            } else if (bar && first === bar.t) {
                if (p.onBarrier) p.onBarrier(p, bar, this);
                else this.damageBarrier(bar.owner, p.dmg || 0);
                if (!p.keepAlive) { list.splice(i, 1); continue; }
            } else {
                // Mur : rebond ou fin
                if (p.bounces > 0) {
                    p.bounces--;
                    const nx = wall.nx, ny = wall.ny;
                    const dot = p.vx * nx + p.vy * ny;
                    p.vx = (p.vx - 2 * dot * nx) * 0.7;
                    p.vy = (p.vy - 2 * dot * ny) * 0.7;
                    p.x += nx * 2; p.y += ny * 2;
                    p.onBounce?.(p, this);
                } else {
                    if (p.onWall) p.onWall(p, wall, this);
                    else this.addEffect({ type: 'spark', x: p.x, y: p.y, color: p.color || '#fff', life: 0.2 });
                    if (!p.keepAlive) { list.splice(i, 1); continue; }
                }
            }
            p.update?.(p, this, dt);
        }
    }

    /** Explosion : dégâts dans un rayon (bloqués par les murs), recul facultatif. */
    explode(x, y, radius, dmg, src, opts = {}) {
        const team = src?.team || opts.team;
        for (const t of [...this.fighters, ...this.objects.filter(o => o.isTarget)]) {
            if (!t.alive) continue;
            const d = Math.hypot(t.x - x, t.y - y);
            if (d > radius + t.r) continue;
            if (!this.los(x, y, t.x, t.y)) continue;
            const enemy = t.team !== team;
            const k = opts.falloff === false ? 1 : 1 - Math.min(1, Math.max(0, d - t.r) / radius) * 0.5;
            if (enemy && dmg > 0) this.damage(t, dmg * k, src, { how: opts.how });
            if (opts.selfDmg && t === src) this.damage(t, dmg * k * opts.selfDmg, null, { how: opts.how });
            if (opts.knock && (enemy || (opts.selfKnock && t === src))) {
                const l = d || 1;
                const power = opts.knock * (1 - Math.min(1, d / (radius + t.r)) * 0.5);
                if (t.isTarget) continue;
                if (t === src) { t.vx += ((t.x - x) / l) * power; t.vy += ((t.y - y) / l) * power; }
                else this.knock(t, ((t.x - x) / l) * power, ((t.y - y) / l) * power);
            }
        }
        this.addEffect({ type: 'explosion', x, y, r: radius, color: opts.color || '#ffb03a', life: opts.big ? 0.7 : 0.45 });
        this.sound('explosion', { kind: opts.sound || 'explosive', x, y });
    }

    /** Applique fn à chaque cible dans un cône (ligne de vue obligatoire). */
    cone(src, range, half, fn, angle = src.angle) {
        for (const t of this.targetsFor(src.team)) {
            const d = Math.hypot(t.x - src.x, t.y - src.y);
            if (d > range + t.r) continue;
            const a = Math.atan2(t.y - src.y, t.x - src.x);
            if (Math.abs(angleDiff(a, angle)) > half + Math.atan2(t.r, Math.max(d, 1))) continue;
            if (!this.los(src.x, src.y, t.x, t.y)) continue;
            // Une barrière ennemie entre les deux protège aussi
            if (this.barrierHit(src.team, src.x, src.y, t.x, t.y)) continue;
            fn(t, d);
        }
    }

    addEffect(e) {
        e.age = 0;
        this.effects.push(e);
        return e;
    }

    /* ----- Déplacement ----- */

    moveFighter(f, dt) {
        const inp = f.input;
        let mx = 0, my = 0;
        const canMove = f.stun <= 0 && f.root <= 0 && !f.anchored;
        if (f.dash) {
            const d = f.dash;
            d.t -= dt;
            mx = d.vx * dt; my = d.vy * dt;
            if (d.t <= 0) { f.dash = null; d.onEnd?.(f, this); }
        } else if (canMove) {
            let ix = inp.mx, iy = inp.my;
            const l = Math.hypot(ix, iy);
            if (l > 1) { ix /= l; iy /= l; }
            const speed = f.kit.speed(f) * f.slow * f.speedBuff;
            mx = ix * speed * dt;
            my = iy * speed * dt;
        }
        // Recul (s'amortit)
        mx += f.vx * dt;
        my += f.vy * dt;
        const k = Math.exp(-6 * dt);
        f.vx *= k; f.vy *= k;
        if (Math.abs(f.vx) < 2) f.vx = 0;
        if (Math.abs(f.vy) < 2) f.vy = 0;

        const tx = f.x + mx, ty = f.y + my;
        let c = collide(this.map, tx, ty, f.r);
        // La base adverse est infranchissable
        const enemyRoom = this.spawnRooms[f.team === 'blue' ? 'red' : 'blue'];
        if (enemyRoom) {
            const p = pushOutRect(c.x, c.y, f.r, enemyRoom);
            if (p) c = p;
        }
        const blocked = Math.hypot(c.x - tx, c.y - ty) > 0.5;
        f.moving = Math.hypot(c.x - f.x, c.y - f.y) > 20 * dt;
        f.x = c.x; f.y = c.y;
        if (blocked && f.dash?.onWall) f.dash.onWall(f, this);
        if (f.dash?.onMove) f.dash.onMove(f, this);
    }

    /* ----- Point de contrôle ----- */

    updatePoint(dt) {
        if (this.phase === 'setup') {
            this.lockLeft -= dt;
            if (this.lockLeft <= 0) {
                this.lockLeft = 0;
                this.phase = 'live';
                this.sound('ready');
                this.emit('onPointUnlocked');
            }
            return;
        }
        if (this.phase !== 'live') return;

        const count = { blue: 0, red: 0 };
        for (const f of this.fighters) {
            if (this.onPoint(f)) { count[f.team]++; f.stats.onPoint += dt; }
        }
        this.count = count;
        const both = count.blue > 0 && count.red > 0;
        this.contested = both;
        const alone = both ? null : count.blue > 0 ? 'blue' : count.red > 0 ? 'red' : null;
        const pr = this.progress;
        const rate = (100 / RULES.captureTime) * dt;

        if (alone && alone !== this.owner) {
            const mul = RULES.captureMul[Math.min(5, count[alone])];
            if (pr.team === alone || pr.value <= 0) {
                pr.team = alone;
                pr.value += rate * mul;
                if (pr.value >= 100) {
                    this.owner = alone;
                    pr.team = null;
                    pr.value = 0;
                    this.sound('ready');
                    this.emit('onCapture', alone);
                }
            } else {
                // Il faut d'abord effacer la progression adverse
                pr.value = Math.max(0, pr.value - rate * mul);
            }
        } else if (alone && alone === this.owner) {
            // L'équipe qui contrôle efface la progression adverse
            pr.value = Math.max(0, pr.value - rate * 1.5);
            if (pr.value <= 0) pr.team = null;
        } else if (!alone && !both) {
            pr.value = Math.max(0, pr.value - RULES.progressDecay * dt * (this.overtime ? 2 : 1));
            if (pr.value <= 0) pr.team = null;
        }

        if (this.owner) {
            const enemy = this.owner === 'blue' ? 'red' : 'blue';
            const threatened = count[enemy] > 0 || (pr.team === enemy && pr.value > 0);
            const s = this.score[this.owner] + RULES.scoreRate * dt;
            if (s >= 99 && threatened) {
                this.score[this.owner] = 99;
                if (!this.overtime) { this.overtime = true; this.emit('onOvertime'); }
            } else {
                this.overtime = false;
                this.score[this.owner] = Math.min(100, s);
                if (this.score[this.owner] >= 100) this.endRound(this.owner);
            }
        }
    }

    endRound(winner) {
        this.phase = 'roundEnd';
        this.roundWinner = winner;
        this.roundsWon[winner]++;
        this.roundEndLeft = RULES.roundEndTime;
        const matchOver = this.roundsWon[winner] >= RULES.roundsToWin;
        this.emit('onRoundEnd', winner, matchOver);
        if (matchOver) {
            this.phase = 'matchEnd';
            this.winner = winner;
            this.emit('onMatchEnd', winner);
        }
    }

    /* ----- Boucle ----- */

    update(dt) {
        this.time += dt;
        if (this.phase === 'matchEnd') {
            this.updateEffects(dt);
            return;
        }
        if (this.phase === 'roundEnd') {
            this.roundEndLeft -= dt;
            this.updateEffects(dt);
            if (this.roundEndLeft <= 0) {
                this.round++;
                this.startRound();
            }
            return;
        }

        for (const f of this.fighters) {
            f.t += dt;
            if (!f.alive) {
                f.respawnT -= dt;
                if (f.respawnT <= 0) this.respawn(f);
                continue;
            }
            for (const k in f.cd) if (f.cd[k] > 0) f.cd[k] = Math.max(0, f.cd[k] - dt);
            f.stun = Math.max(0, f.stun - dt);
            f.root = Math.max(0, f.root - dt);
            f.invuln = Math.max(0, f.invuln - dt);
            f.amp = Math.max(0, f.amp - dt);
            f.wound = Math.max(0, f.wound - dt);
            f.slow = 1;
            if (!f.ultActive && f.ult < 100) f.ult = Math.min(100, f.ult + RULES.passiveUlt * dt * (f.ultMul || 1));
            // Passif Soutien : récupération
            if (f.role === 'support' && this.time - f.lastHurt > RULES.supportRegenDelay) this.heal(f, RULES.supportRegen * dt, null);
            // Base : soin rapide
            if (this.inSpawn(f)) this.heal(f, RULES.spawnHeal * dt, null);
            // Surbouclier temporaire (Mur du son) qui fond
            if (f.over > 0) f.over = Math.max(0, f.over - (f.overDecay || 60) * dt);
        }
        // Auras (Tempo) : calculées avant les déplacements
        for (const f of this.fighters) f.speedBuff = 1;
        for (const f of this.fighters) if (f.alive) f.kit.aura?.(f, this, dt);

        for (const f of this.fighters) {
            if (!f.alive) continue;
            // Visée : vers le point visé, sauf pendant une charge (virage limité géré par le kit)
            if (f.stun <= 0 && !f.dash?.lockAngle) f.angle = Math.atan2(f.input.ay - f.y, f.input.ax - f.x);
            if (f.stun <= 0) f.kit.update(f, this, dt, f.input);
            else f.kit.stunnedUpdate?.(f, this, dt);
            this.moveFighter(f, dt);
            f.input.firePressed = f.input.fire2Pressed = false;
            f.input.shift = f.input.e = f.input.q = f.input.reload = false;
        }
        // Collisions entre héros de la même équipe : on se pousse un peu
        for (let i = 0; i < this.fighters.length; i++) {
            const a = this.fighters[i];
            if (!a.alive) continue;
            for (let j = i + 1; j < this.fighters.length; j++) {
                const b = this.fighters[j];
                if (!b.alive) continue;
                const dx = b.x - a.x, dy = b.y - a.y;
                const min = (a.r + b.r) * 0.8;
                const d2 = dx * dx + dy * dy;
                if (d2 >= min * min || d2 < 1e-4) continue;
                const d = Math.sqrt(d2);
                const push = (min - d) / 2;
                a.x -= (dx / d) * push; a.y -= (dy / d) * push;
                b.x += (dx / d) * push; b.y += (dy / d) * push;
            }
        }

        this.updateProjectiles(dt);
        for (let i = this.objects.length - 1; i >= 0; i--) {
            const o = this.objects[i];
            if (o.kind === 'soul') {
                o.life -= dt;
                if (o.life <= 0 || o.fighter.alive) o.alive = false;
            } else {
                o.update?.(o, this, dt);
            }
            if (!o.alive) this.objects.splice(i, 1);
        }
        this.updatePoint(dt);
        this.updateEffects(dt);
    }

    updateEffects(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const e = this.effects[i];
            e.age += dt;
            if (e.follow && e.follow.alive) { e.x = e.follow.x; e.y = e.follow.y; }
            if (e.age >= e.life) this.effects.splice(i, 1);
        }
    }
}
