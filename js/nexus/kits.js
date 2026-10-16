/* ==================================
   NEXUS - POUVOIRS DES HÉROS
   Chaque kit lit l'entrée du héros (joueur ou bot, même format) :
     fire / fire2 (maintenus), firePressed / fire2Pressed, shift, e, q, reload,
     mx, my (déplacement), ax, ay (point visé dans le monde).
   Tout passe par le moteur (game.js) : dégâts, soins, projectiles, explosions.
   ================================== */

import { collide } from './map.js?v=2';
import { castWall, rayCircle } from './geom.js?v=1';

const TAU = Math.PI * 2;

/* ----- Outils communs ----- */

function front(f, d, side = 0) {
    const c = Math.cos(f.angle), s = Math.sin(f.angle);
    return { x: f.x + c * d - s * side, y: f.y + s * d + c * side };
}

function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return d;
}

/**
 * Point de sortie d'une arme, en coordonnées du sprite (x vers l'avant, y vers la droite).
 * Si un mur se trouve entre le héros et le canon, le tir part juste devant le mur
 * (on ne tire jamais à travers un mur quand on est collé contre).
 */
function muzzle(g, f, fx, fy = 0) {
    const c = Math.cos(f.angle), s = Math.sin(f.angle);
    const x = f.x + c * fx - s * fy, y = f.y + s * fx + c * fy;
    const dx = x - f.x, dy = y - f.y;
    const len = Math.hypot(dx, dy) || 1;
    const hit = castWall(g.map, f.x, f.y, dx / len, dy / len, len);
    if (hit.t < len) {
        const k = Math.max(0, hit.t - 4);
        return { x: f.x + (dx / len) * k, y: f.y + (dy / len) * k, blocked: true };
    }
    return { x, y };
}

// Direction du tir depuis le canon vers le point visé : les tirs convergent sur le réticule
function aimFrom(f, m) {
    const lock = f.lockOn?.alive ? f.lockOn : null;
    const ax = lock ? lock.x : f.input.ax, ay = lock ? lock.y : f.input.ay;
    if (!Number.isFinite(ax) || Math.hypot(ax - f.x, ay - f.y) < 90) return f.angle;
    return Math.atan2(ay - m.y, ax - m.x);
}

function ready(f, key) { return !(f.cd[key] > 0); }

// Arme à chargeur : renvoie vrai si on peut tirer maintenant
function gunReady(f, dt, inp, g) {
    f.fireT = Math.max(0, (f.fireT || 0) - dt);
    if (f.reloadT > 0) {
        f.reloadT -= dt;
        if (f.reloadT <= 0) {
            f.reloadT = 0;
            f.ammo = f.maxAmmo;
            g.sound('reloadDone', { x: f.x, y: f.y });
        }
        return false;
    }
    if ((inp.reload && f.ammo < f.maxAmmo) || f.ammo <= 0) {
        f.reloadT = f.reloadTime;
        g.sound('reload', { x: f.x, y: f.y });
        return false;
    }
    return f.fireT <= 0;
}

// Déplacement instantané le long d'une ligne, arrêté par les murs (et l'eau)
function travel(g, f, angle, dist) {
    const steps = Math.ceil(dist / 12);
    const dx = Math.cos(angle) * (dist / steps), dy = Math.sin(angle) * (dist / steps);
    let x = f.x, y = f.y;
    for (let i = 0; i < steps; i++) {
        const c = collide(g.map, x + dx, y + dy, f.r);
        const enemy = g.spawnRooms[f.team === 'blue' ? 'red' : 'blue'];
        if (enemy && c.x > enemy.x - f.r && c.x < enemy.x + enemy.w + f.r && c.y > enemy.y - f.r && c.y < enemy.y + enemy.h + f.r) break;
        if (Math.hypot(c.x - (x + dx), c.y - (y + dy)) > 4) { x = c.x; y = c.y; break; }
        x = c.x; y = c.y;
    }
    return { x, y };
}

function moveAngle(f) {
    const l = Math.hypot(f.input.mx, f.input.my);
    return l > 0.1 ? Math.atan2(f.input.my, f.input.mx) : f.angle;
}

function useUlt(f, g) {
    if (f.ult < 100 || f.ultActive) return false;
    f.ult = 0;
    g.emit('onUlt', f);
    return true;
}

/* ===================================================================
   GORVALD (Reinhardt) : marteau, bouclier, charge, frappe de feu, Fracas
   =================================================================== */

const gorvald = {
    hp: 700,
    fxColor: '#ffb347',
    ultCost: 1680,
    barrierBreakTime: 5,
    speed(f) {
        if (f.swingLock > 0) return 200;
        return f.barrier.up ? 135 : 250;
    },
    init(f) {
        f.barrier = { up: false, hp: 1200, max: 1200, radius: 78, half: 1.0, angle: f.angle, broken: 0, lastHit: -99 };
    },
    reset(f) {
        f.barrier.up = false;
        f.barrier.hp = f.barrier.max;
        f.barrier.broken = 0;
        f.anchored = false;
        f.swingLock = 0;
        f.charging = null;
    },
    update(f, g, dt, inp) {
        const b = f.barrier;
        f.swingLock = Math.max(0, (f.swingLock || 0) - dt);
        f.fireT = Math.max(0, (f.fireT || 0) - dt);
        if (b.broken > 0) b.broken = Math.max(0, b.broken - dt);
        // Fracas : immobile pendant l'impact
        if (f.anchoredT > 0) {
            f.anchoredT -= dt;
            if (f.anchoredT <= 0) f.anchored = false;
            b.up = false;
            return;
        }
        if (f.charging) {
            b.up = false;
            if (inp.shift) this.endCharge(f, g);
            return;
        }

        // Bouclier (Clic D maintenu)
        const wasUp = b.up;
        b.up = inp.fire2 && b.broken <= 0 && b.hp > 0;
        if (b.up && !wasUp) g.sound('shieldUp', { x: f.x, y: f.y });
        else if (!b.up && wasUp && b.hp > 0) g.sound('shieldDown', { x: f.x, y: f.y });
        b.angle = f.angle;
        if (!b.up && g.time - b.lastHit > 2 && b.hp < b.max && b.broken <= 0) b.hp = Math.min(b.max, b.hp + 144 * dt);

        // Marteau (Clic G maintenu) : impossible derrière le bouclier
        if (inp.fire && !b.up && f.fireT <= 0) {
            f.fireT = 0.96;
            f.swingLock = 0.35;
            f.swing = { t: 0, dir: (f.swingDir = -(f.swingDir || 1)) };
            g.sound('hammerSwing', { x: f.x, y: f.y });
            let hit = false;
            g.cone(f, 130, 1.05, (t) => {
                if (!hit) { hit = true; g.sound('hammerHit', { x: t.x, y: t.y }); }
                g.damage(t, 85, f, { how: 'Marteau-fusée', x: t.x, y: t.y });
                const l = Math.hypot(t.x - f.x, t.y - f.y) || 1;
                g.knock(t, ((t.x - f.x) / l) * 260, ((t.y - f.y) / l) * 260);
            });
        }
        if (f.swing) { f.swing.t += dt; if (f.swing.t > 0.35) f.swing = null; }

        // Charge (Maj)
        if (inp.shift && ready(f, 'shift')) this.startCharge(f, g);

        // Frappe de feu (E) : traverse les ennemis et les boucliers
        if (inp.e && ready(f, 'e') && !b.up) {
            f.cd.e = 6;
            const p = muzzle(g, f, 40, 0);
            g.spawnProjectile({
                kind: 'firestrike', owner: f, x: p.x, y: p.y, angle: f.angle, speed: 950, r: 28, life: 1.2,
                pierce: true, ignoreBarrier: true, eatable: false, color: '#ff7a1f',
                onHit: (pr, t) => g.damage(t, 90, f, { how: 'Frappe de feu' })
            });
            g.addEffect({ type: 'muzzle', x: p.x, y: p.y, angle: f.angle, color: '#ff7a1f', size: 3, life: 0.2 });
            g.sound('firestrike', { x: f.x, y: f.y });
        }

        // Fracas (Q) : onde en cône qui renverse
        if (inp.q && useUlt(f, g)) {
            f.anchored = true;
            f.anchoredT = 0.7;
            b.up = false;
            g.cone(f, 440, 0.62, (t) => {
                g.damage(t, 250, f, { how: 'Fracas' });
                g.stunTarget(t, 2.5);
            });
            g.addEffect({ type: 'shatter', x: f.x, y: f.y, angle: f.angle, range: 440, half: 0.62, life: 1.1, seed: Math.random() * 1000 });
            g.sound('earthshatter', { x: f.x, y: f.y });
            g.emit('onShake', f.x, f.y, 1.2);
        }
    },
    startCharge(f, g) {
        f.cd.shift = 7;
        const speed = 880;
        f.charging = { pinned: null, brushed: new Set() };
        f.dash = {
            t: 2.2, vx: Math.cos(f.angle) * speed, vy: Math.sin(f.angle) * speed, unstoppable: true,
            lockAngle: true,
            onMove: (ff) => {
                // Virage lent vers la visée
                const want = Math.atan2(ff.input.ay - ff.y, ff.input.ax - ff.x);
                const cur = Math.atan2(ff.dash.vy, ff.dash.vx);
                const turn = Math.max(-1.3 / 60, Math.min(1.3 / 60, angleDiff(want, cur)));
                const a = cur + turn;
                ff.dash.vx = Math.cos(a) * speed; ff.dash.vy = Math.sin(a) * speed;
                ff.angle = a;
                const c = ff.charging;
                if (!c) return;
                for (const t of g.enemiesOf(ff)) {
                    if (t === c.pinned || c.brushed.has(t) || t.invuln > 0) continue;
                    if (Math.hypot(t.x - ff.x, t.y - ff.y) > ff.r + t.r + 6) continue;
                    if (!c.pinned) {
                        c.pinned = t;
                        t.stun = 9;
                        t.dash = null;
                        g.sound('pin', { x: t.x, y: t.y });
                    } else {
                        c.brushed.add(t);
                        g.damage(t, 50, ff, { how: 'Charge' });
                        const side = Math.sign(angleDiff(Math.atan2(t.y - ff.y, t.x - ff.x), a)) || 1;
                        g.knock(t, Math.cos(a + side * 1.4) * 700, Math.sin(a + side * 1.4) * 700);
                    }
                }
                if (c.pinned) {
                    const p = front(ff, ff.r + c.pinned.r + 2);
                    c.pinned.x = p.x; c.pinned.y = p.y;
                    c.pinned.vx = c.pinned.vy = 0;
                }
            },
            onWall: (ff) => {
                const c = ff.charging;
                if (c?.pinned) {
                    g.damage(c.pinned, 225, ff, { how: 'Charge' });
                    g.addEffect({ type: 'slam', x: c.pinned.x, y: c.pinned.y, angle: ff.angle, color: '#ffffff', life: 0.6 });
                    g.sound('slam', { x: ff.x, y: ff.y });
                    g.emit('onShake', ff.x, ff.y, 0.9);
                }
                this.endCharge(ff, g);
            },
            onEnd: (ff) => this.endCharge(ff, g)
        };
        g.sound('chargeStart', { x: f.x, y: f.y });
    },
    endCharge(f, g) {
        const c = f.charging;
        if (!c) return;
        if (c.pinned && c.pinned.alive) c.pinned.stun = Math.min(c.pinned.stun, 0.5);
        f.charging = null;
        f.dash = null;
        f.stun = Math.max(f.stun, 0.25); // petit temps de récupération
    },
    onStunned(f, g) { if (f.charging) this.endCharge(f, g); },
    slots(f) {
        return [
            { key: 'Clic D', name: 'Bastion', meter: f.barrier.hp / f.barrier.max, active: f.barrier.up, cd: f.barrier.broken, max: 5 },
            { key: 'Maj', name: 'Charge', cd: f.cd.shift || 0, max: 8, active: Boolean(f.charging) },
            { key: 'E', name: 'Frappe de feu', cd: f.cd.e || 0, max: 6 }
        ];
    }
};

/* ===================================================================
   VOLTA (D.Va) : méca, canons à fusion, matrice, propulseurs, missiles,
   Surcharge (méca qui explose) et éjection
   =================================================================== */

const volta = {
    hp: 700,
    fxColor: '#7ff6ff',
    ultCost: 1540,
    speed(f) {
        if (!f.mech) return 300;
        if (f.boosting) return 0;
        return f.input.fire ? 190 : 280;
    },
    init(f) { f.mech = true; f.matrix = { on: false, meter: 100, idle: 0 }; },
    reset(f, g, roundStart) {
        if (roundStart || !f.alive || f.hp <= 0 || f.mech) this.toMech(f);
    },
    toMech(f) {
        f.mech = true;
        f.maxHp = 700;
        f.hp = 700;
        f.r = 30;
        f.matrix.on = false;
        f.matrix.meter = 100;
        f.boosting = false;
        f.dash = null;
        f.missiles = null;
    },
    update(f, g, dt, inp) {
        f.fireT = Math.max(0, (f.fireT || 0) - dt);
        if (!f.mech) {
            // Pilote : pistolet léger, Q pour rappeler le méca
            if (inp.fire && f.fireT <= 0) {
                f.fireT = 0.14;
                const m = muzzle(g, f, 24, 7);
                g.hitscan(f, m.x, m.y, aimFrom(f, m) + (Math.random() - 0.5) * 0.05, 700, (d) => (d < 300 ? 18 : 12), { color: '#ff9bd0', width: 2, how: 'Pistolet' });
                g.sound('pilotShot', { x: f.x, y: f.y });
            }
            if (inp.q && useUlt(f, g)) {
                this.toMech(f);
                f.invuln = 0.6;
                g.addEffect({ type: 'callMech', x: f.x, y: f.y, color: '#ff6fb5', life: 0.9 });
                g.sound('callMech', { x: f.x, y: f.y });
            }
            return;
        }

        // Matrice défensive (Clic D maintenu) : jauge 3 s
        const mx = f.matrix;
        mx.on = inp.fire2 && mx.meter > 0 && !f.boosting;
        if (mx.on) {
            mx.meter = Math.max(0, mx.meter - 34 * dt);
            mx.idle = 0;
            for (const p of g.projectiles) {
                if (p.team === f.team || !p.eatable || p.dead) continue;
                const d = Math.hypot(p.x - f.x, p.y - f.y);
                if (d > 270) continue;
                if (Math.abs(angleDiff(Math.atan2(p.y - f.y, p.x - f.x), f.angle)) > 0.62) continue;
                p.dead = true;
                g.addEffect({ type: 'absorb', x: p.x, y: p.y, tx: f.x, ty: f.y, color: '#ff9bd0', life: 0.3 });
                g.sound('shieldHit', { x: p.x, y: p.y, src: f.id, vol: 0.5 });
            }
            // Les mines et le pneu ne sont pas des projectiles : la matrice ne les arrête pas
        } else {
            mx.idle += dt;
            if (mx.idle > 1) mx.meter = Math.min(100, mx.meter + 25 * dt);
        }

        // Canons à fusion (Clic G maintenu)
        if (inp.fire && !mx.on && f.fireT <= 0) {
            f.fireT = 0.15;
            for (const side of [-1, 1]) {
                const m = muzzle(g, f, 46, side * 30);
                for (let i = 0; i < 2; i++) {
                    g.hitscan(f, m.x, m.y, aimFrom(f, m) + (Math.random() - 0.5) * 0.3, 420,
                        (d) => 5.5 * Math.max(0.3, 1 - Math.max(0, d - 150) / 360),
                        { color: '#7ff6ff', width: 2.5, spark: i === 0, muzzle: i === 0, muzzleSize: 1.6, how: 'Canons à fusion' });
                }
            }
            g.sound('fusion', { x: f.x, y: f.y, src: f.id });
        }

        // Propulseurs (Maj) : vol dirigé à la souris, renverse au contact
        if (inp.shift) {
            if (f.boosting) f.boostT = 0;
            else if (ready(f, 'shift')) {
                f.boosting = true;
                f.boostT = 2;
                f.boostHit = new Set();
                g.sound('boostStart', { x: f.x, y: f.y });
            }
        }
        if (f.boosting) {
            f.boostT -= dt;
            if (f.boostT <= 0) {
                f.boosting = false;
                f.dash = null;
                f.cd.shift = 4;
            } else {
                const a = Math.atan2(inp.ay - f.y, inp.ax - f.x);
                f.dash = { t: 0.05, vx: Math.cos(a) * 560, vy: Math.sin(a) * 560 };
                for (const t of g.enemiesOf(f)) {
                    if (f.boostHit.has(t) || Math.hypot(t.x - f.x, t.y - f.y) > f.r + t.r + 4) continue;
                    f.boostHit.add(t);
                    g.damage(t, 25, f, { how: 'Propulseurs' });
                    g.sound('pin', { x: t.x, y: t.y });
                    g.knock(t, Math.cos(a) * 700, Math.sin(a) * 700);
                }
            }
        }

        // Micro-missiles (E) : 18 roquettes sur 1 seconde
        if (inp.e && ready(f, 'e')) {
            f.cd.e = 8;
            f.missiles = { n: 18, t: 0 };
        }
        if (f.missiles) {
            f.missiles.t -= dt;
            while (f.missiles.t <= 0 && f.missiles.n > 0) {
                f.missiles.t += 1 / 18;
                f.missiles.n--;
                const side = f.missiles.n % 2 ? 1 : -1;
                const m = muzzle(g, f, 4, side * 26);
                g.sound('missile', { x: f.x, y: f.y, src: f.id });
                g.spawnProjectile({
                    kind: 'missile', owner: f, x: m.x, y: m.y, angle: f.angle + (Math.random() - 0.5) * 0.22, speed: 820, r: 5, life: 0.9,
                    color: '#ffb03a',
                    onHit: (p, t) => { g.damage(t, 6, f, { how: 'Micro-missiles' }); g.explode(p.x, p.y, 45, 4, f, { how: 'Micro-missiles', color: '#ffb03a' }); },
                    onWall: (p) => g.explode(p.x, p.y, 45, 4, f, { how: 'Micro-missiles', color: '#ffb03a' })
                });
            }
            if (f.missiles.n <= 0) f.missiles = null;
        }

        // Surcharge (Q) : la pilote s'éjecte, le méca vole vers l'avant puis explose
        if (inp.q && useUlt(f, g)) {
            const a = f.angle;
            const bomb = {
                kind: 'mechBomb', team: f.team, owner: f, x: f.x, y: f.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
                fuse: 3, alive: true, r: 30, angle: a,
                update: (o, gg, ddt) => {
                    const k = Math.exp(-2.2 * ddt);
                    o.vx *= k; o.vy *= k;
                    const c = collide(gg.map, o.x + o.vx * ddt, o.y + o.vy * ddt, o.r);
                    o.x = c.x; o.y = c.y;
                    o.fuse -= ddt;
                    if (o.fuse <= 0) {
                        o.alive = false;
                        gg.explode(o.x, o.y, 430, 1000, f, { how: 'Surcharge', color: '#ff6fb5', big: true });
                    }
                }
            };
            g.objects.push(bomb);
            this.eject(f, g, a + Math.PI);
            g.sound('selfDestruct', { x: f.x, y: f.y });
        }
    },
    eject(f, g, angle) {
        f.mech = false;
        f.maxHp = 150;
        f.hp = 150;
        f.r = 15;
        f.boosting = false;
        f.dash = { t: 0.25, vx: Math.cos(angle) * 700, vy: Math.sin(angle) * 700 };
        f.matrix.on = false;
        f.missiles = null;
        f.invuln = 0.5;
        g.addEffect({ type: 'ring', x: f.x, y: f.y, r0: 10, r1: 90, color: '#ff6fb5', life: 0.4 });
        g.sound('eject', { x: f.x, y: f.y });
    },
    // Méca détruit : la pilote survit (Éjection)
    onLethal(f, src, g) {
        if (!f.mech) return false;
        g.addEffect({ type: 'explosion', x: f.x, y: f.y, r: 110, color: '#ff6fb5', life: 0.7 });
        g.addEffect({ type: 'debris', x: f.x, y: f.y, color: '#ff6fb5', life: 0.9, seed: Math.random() * 1000 });
        g.sound('mechDown', { x: f.x, y: f.y });
        this.eject(f, g, src ? Math.atan2(f.y - src.y, f.x - src.x) : f.angle + Math.PI);
        g.emit('onMechDown', f, src);
        return true;
    },
    slots(f) {
        if (!f.mech) return [{ key: 'Q', name: 'Rappel du méca', cd: 0, max: 1, info: 'Ultime' }];
        return [
            { key: 'Clic D', name: 'Matrice', meter: f.matrix.meter / 100, active: f.matrix.on },
            { key: 'Maj', name: 'Propulseurs', cd: f.cd.shift || 0, max: 4, active: f.boosting },
            { key: 'E', name: 'Micro-missiles', cd: f.cd.e || 0, max: 8 }
        ];
    }
};

/* ===================================================================
   ZÉPHYR (Tracer) : pistolets, Transfert x3, Retour, Bombe à impulsion
   =================================================================== */

const zephyr = {
    hp: 175,
    fxColor: '#5ff3ff',
    ultCost: 1260,
    speed() { return 330; },
    init(f) {
        f.maxAmmo = 40; f.ammo = 40; f.reloadTime = 1;
        f.blinks = 3; f.blinkT = 0;
        f.history = [];
        f.histT = 0;
    },
    reset(f) {
        f.ammo = f.maxAmmo; f.reloadT = 0; f.blinks = 3; f.blinkT = 0; f.history = []; f.recall = null;
    },
    update(f, g, dt, inp) {
        // Mémoire des 3 dernières secondes (pour le Retour)
        f.histT -= dt;
        if (f.histT <= 0) {
            f.histT = 0.1;
            f.history.push({ x: f.x, y: f.y, hp: f.hp });
            if (f.history.length > 30) f.history.shift();
        }
        // Recharge des Transferts
        if (f.blinks < 3) {
            f.blinkT += dt;
            if (f.blinkT >= 3) { f.blinkT = 0; f.blinks++; }
        }
        if (f.recall) {
            f.recall.t -= dt;
            if (f.recall.t <= 0) {
                const r = f.recall;
                f.x = r.x; f.y = r.y;
                f.hp = Math.max(f.hp, r.hp);
                f.recall = null;
                f.ammo = f.maxAmmo; f.reloadT = 0;
                g.addEffect({ type: 'ring', x: f.x, y: f.y, r0: 60, r1: 10, color: '#5ff3ff', life: 0.35 });
            }
            return;
        }

        if (gunReady(f, dt, inp, g) && inp.fire) {
            f.fireT = 0.05;
            f.ammo--;
            const side = f.ammo % 2 ? 9 : -9;
            const m = muzzle(g, f, 29, side);
            g.hitscan(f, m.x, m.y, aimFrom(f, m) + (Math.random() - 0.5) * 0.09, 520,
                (d) => 6 * Math.max(0.3, 1 - Math.max(0, d - 220) / 300),
                { color: '#5ff3ff', width: 2, spark: f.ammo % 3 === 0, how: 'Pistolets à impulsion' });
            g.sound('pulse', { x: f.x, y: f.y, src: f.id });
        }

        // Transfert (Maj) : dans le sens du déplacement
        if (inp.shift && f.blinks > 0) {
            f.blinks--;
            const from = { x: f.x, y: f.y };
            const to = travel(g, f, moveAngle(f), 230);
            f.x = to.x; f.y = to.y;
            g.addEffect({ type: 'blink', x: from.x, y: from.y, x2: to.x, y2: to.y, color: '#5ff3ff', life: 0.35, hero: 'zephyr', angle: f.angle });
            g.sound('blink', { x: f.x, y: f.y });
        }

        // Retour (E) : revient 3 s en arrière (position et vie)
        if (inp.e && ready(f, 'e') && f.history.length) {
            f.cd.e = 12;
            const h = f.history[0];
            f.recall = { t: 0.6, x: h.x, y: h.y, hp: Math.max(...f.history.map(s => s.hp)) };
            f.invuln = 0.6;
            g.addEffect({ type: 'recall', points: f.history.map(s => [s.x, s.y]), color: '#5ff3ff', life: 0.7 });
            g.sound('recall', { x: f.x, y: f.y });
        }

        // Bombe à impulsion (Q) : se colle à la première cible ou au mur
        if (inp.q && useUlt(f, g)) {
            const m = muzzle(g, f, 16, 0);
            g.sound('whoosh', { x: f.x, y: f.y });
            const fuse = (p) => {
                p.fuse = 1;
                p.update = (pp, gg, ddt) => {
                    pp.fuse -= ddt;
                    if (pp.fuse <= 0) {
                        pp.dead = true;
                        gg.explode(pp.x, pp.y, 170, 350, f, { how: 'Bombe à impulsion', color: '#5ff3ff', big: true });
                    }
                };
            };
            g.spawnProjectile({
                kind: 'pulse', owner: f, x: m.x, y: m.y, angle: f.angle, speed: 650, r: 9, life: 0.55, eatable: false, keepAlive: true,
                color: '#5ff3ff',
                onHit: (p, t) => {
                    if (t.isTarget) { p.stuck = true; fuse(p); return; }
                    p.stuckTo = t; p.stuckOx = p.x - t.x; p.stuckOy = p.y - t.y; fuse(p);
                    g.sound('stick', { x: p.x, y: p.y });
                    g.emit('onStuck', t, f);
                },
                onWall: (p) => { p.stuck = true; fuse(p); g.sound('stick', { x: p.x, y: p.y }); },
                onBarrier: (p) => { p.stuck = true; fuse(p); },
                onExpire: (p, gg) => {
                    const np = gg.spawnProjectile({ kind: 'pulse', owner: f, x: p.x, y: p.y, angle: 0, speed: 0, r: 9, eatable: false, stuck: true, color: '#5ff3ff' });
                    fuse(np);
                }
            });
        }
    },
    slots(f) {
        return [
            { key: 'Maj', name: 'Transfert', cd: f.blinks < 3 ? 3 - f.blinkT : 0, max: 3, charges: f.blinks, maxCharges: 3, ready: f.blinks > 0 },
            { key: 'E', name: 'Retour', cd: f.cd.e || 0, max: 12, active: Boolean(f.recall) }
        ];
    }
};

/* ===================================================================
   KRAZ (Chacal) : grenades rebondissantes, mine, piège, pneu, cadeau d'adieu
   =================================================================== */

const kraz = {
    hp: 250,
    fxColor: '#ffb03a',
    ultCost: 1925,
    speed(f) { return f.tire ? 0 : 290; },
    init(f) {
        f.maxAmmo = 5; f.ammo = 5; f.reloadTime = 1.5;
        f.mineCharges = 2; f.mineT = 0;
    },
    reset(f, g) {
        f.ammo = f.maxAmmo; f.reloadT = 0;
        if (f.tire) { f.tire.alive = false; f.tire = null; }
        f.anchored = false;
    },
    grenade(f, g, x, y, angle) {
        g.spawnProjectile({
            kind: 'grenade', owner: f, x, y, angle, speed: 760, r: 9, life: 1.5, bounces: 3, friction: 1.4, color: '#59703c',
            // Coup direct : 80 sur la cible + éclats autour ; au sol : éclats seulement
            onHit: (p, t) => { g.damage(t, 40, f, { how: 'Lance-grenades' }); g.explode(p.x, p.y, 80, 80, f, { how: 'Lance-grenades' }); },
            onExpire: (p) => g.explode(p.x, p.y, 80, 80, f, { how: 'Lance-grenades' }),
            onBounce: (p) => g.sound('bounce', { x: p.x, y: p.y })
        });
    },
    update(f, g, dt, inp) {
        // Pneu infernal en cours : on pilote le pneu, Kraz reste sur place
        if (f.tire) {
            const t = f.tire;
            if (!t.alive) { f.tire = null; f.anchored = false; return; }
            if (inp.firePressed || inp.q) this.detonateTire(f, g);
            return;
        }
        if (f.mineCharges < 2) {
            f.mineT += dt;
            if (f.mineT >= 8) { f.mineT = 0; f.mineCharges++; }
        }

        if (gunReady(f, dt, inp, g) && inp.fire) {
            f.fireT = 0.667;
            f.ammo--;
            const m = muzzle(g, f, 45, 5.5);
            const ga = aimFrom(f, m);
            this.grenade(f, g, m.x, m.y, ga);
            g.addEffect({ type: 'muzzle', x: m.x, y: m.y, angle: ga, color: '#ffb03a', size: 1.8, smoke: true, life: 0.3 });
            g.sound('grenadeLaunch', { x: f.x, y: f.y });
        }

        // Mine commotion (Clic D) : lancer, puis Clic D pour faire exploser
        if (inp.fire2Pressed) {
            const mines = g.objects.filter(o => o.kind === 'mine' && o.owner === f && o.alive);
            if (mines.length) {
                for (const mine of mines) this.detonateMine(mine, g);
            } else if (f.mineCharges > 0) {
                f.mineCharges--;
                const m = muzzle(g, f, 16, -8);
                g.sound('mineThrow', { x: f.x, y: f.y });
                g.objects.push({
                    kind: 'mine', team: f.team, owner: f, x: m.x, y: m.y, r: 10, alive: true, flight: 0.45,
                    vx: Math.cos(f.angle) * 620, vy: Math.sin(f.angle) * 620, age: 0,
                    update: (o, gg, ddt) => {
                        o.age += ddt;
                        if (o.flight > 0) {
                            o.flight -= ddt;
                            const nx = o.x + o.vx * ddt, ny = o.y + o.vy * ddt;
                            const c = collide(gg.map, nx, ny, o.r);
                            if (Math.hypot(c.x - nx, c.y - ny) > 0.5) o.flight = 0; // collée au mur
                            o.x = c.x; o.y = c.y;
                        }
                        if (o.age > 12 || !o.owner.alive) o.alive = false;
                    }
                });
            }
        }

        // Piège d'acier (E)
        if (inp.e && ready(f, 'e') && !g.objects.some(o => o.kind === 'trap' && o.owner === f && o.alive)) {
            f.cd.e = 2;
            const dist = Math.min(240, Math.hypot(inp.ax - f.x, inp.ay - f.y));
            const to = travel(g, f, f.angle, dist);
            g.sound('trapSet', { x: to.x, y: to.y });
            g.objects.push({
                kind: 'trap', team: f.team, owner: f, x: to.x, y: to.y, r: 18, alive: true, arm: 1, isTrap: true,
                update: (o, gg, ddt) => {
                    if (!o.owner.alive && o.owner.respawnT < 9.5) { o.alive = false; return; }
                    if (o.arm > 0) { o.arm -= ddt; return; }
                    for (const t of gg.enemiesOf(o.owner)) {
                        if (Math.hypot(t.x - o.x, t.y - o.y) > t.r + 18) continue;
                        t.root = 1.5;
                        t.x = o.x; t.y = o.y;
                        gg.damage(t, 80, o.owner, { how: 'Piège d\'acier' });
                        gg.sound('trapSnap', { x: o.x, y: o.y });
                        gg.addEffect({ type: 'snap', x: o.x, y: o.y, life: 0.4 });
                        o.alive = false;
                        o.owner.cd.e = 10;
                        break;
                    }
                }
            });
        }

        // Pneu infernal (Q)
        if (inp.q && useUlt(f, g)) {
            f.anchored = true;
            const m = muzzle(g, f, f.r + 20, 0);
            const tire = {
                kind: 'tire', team: f.team, owner: f, x: m.x, y: m.y, r: 18, alive: true, isTarget: true,
                hp: 100, maxHp: 100, t: 10, angle: f.angle, role: 'object',
                update: (o, gg, ddt) => {
                    if (!o.owner.alive) { o.alive = false; return; }
                    o.t -= ddt;
                    if (o.t <= 0) { this.detonateTire(o.owner, gg); return; }
                    // Le pneu roule vers le point visé
                    const want = Math.atan2(o.owner.input.ay - o.y, o.owner.input.ax - o.x);
                    const turn = Math.max(-4 * ddt, Math.min(4 * ddt, angleDiff(want, o.angle)));
                    o.angle += turn;
                    const nx = o.x + Math.cos(o.angle) * 520 * ddt, ny = o.y + Math.sin(o.angle) * 520 * ddt;
                    const c = collide(gg.map, nx, ny, o.r);
                    o.x = c.x; o.y = c.y;
                },
                onDestroyed: (gg) => {
                    gg.addEffect({ type: 'spark', x: tire.x, y: tire.y, color: '#ffb03a', life: 0.5 });
                    f.tire = null; f.anchored = false;
                }
            };
            f.tire = tire;
            g.objects.push(tire);
            g.sound('tireStart', { x: f.x, y: f.y });
        }
    },
    detonateMine(mine, g) {
        mine.alive = false;
        g.explode(mine.x, mine.y, 125, 120, mine.owner, { how: 'Mine commotion', knock: 1100, selfKnock: true, color: '#f2c14e', sound: 'mineBoom' });
        g.addEffect({ type: 'ring', x: mine.x, y: mine.y, r0: 20, r1: 170, color: '#f2c14e', life: 0.45 });
    },
    detonateTire(f, g) {
        const t = f.tire;
        if (!t) return;
        t.alive = false;
        f.tire = null;
        f.anchored = false;
        g.explode(t.x, t.y, 230, 600, f, { how: 'Pneu infernal', big: true });
        g.addEffect({ type: 'debris', x: t.x, y: t.y, color: '#2a2a2e', life: 1, seed: Math.random() * 1000 });
        g.emit('onShake', t.x, t.y, 1.3);
    },
    // Cadeau d'adieu : des grenades tombent à sa mort
    onDeath(f, g) {
        if (f.tire) { f.tire.alive = false; f.tire = null; }
        f.anchored = false;
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU;
            g.spawnProjectile({
                kind: 'grenade', owner: f, team: f.team, x: f.x, y: f.y, angle: a, speed: 220, r: 8, life: 0.55 + i * 0.04,
                friction: 3, bounces: 1, color: '#59703c',
                onHit: (p) => g.explode(p.x, p.y, 75, 40, f, { how: 'Cadeau d\'adieu' }),
                onExpire: (p) => g.explode(p.x, p.y, 75, 40, f, { how: 'Cadeau d\'adieu' })
            });
        }
    },
    slots(f, g) {
        const mineOut = g?.objects.some(o => o.kind === 'mine' && o.owner === f && o.alive);
        const trapOut = g?.objects.some(o => o.kind === 'trap' && o.owner === f && o.alive);
        return [
            { key: 'Clic D', name: mineOut ? 'Faire exploser' : 'Mine commotion', cd: f.mineCharges < 2 ? 8 - f.mineT : 0, max: 8, charges: f.mineCharges, maxCharges: 2, ready: mineOut || f.mineCharges > 0, active: mineOut },
            { key: 'E', name: 'Piège d\'acier', cd: f.cd.e || 0, max: 10, active: trapOut }
        ];
    }
};

/* ===================================================================
   SÉRAPHINE (Ange) : rayons de soin / d'amplification, Envol, Résurrection, Valkyrie
   =================================================================== */

function beamCandidates(f, g, range) {
    return g.alliesOf(f, false).filter(a => Math.hypot(a.x - f.x, a.y - f.y) <= range && g.los(f.x, f.y, a.x, a.y));
}

const seraphine = {
    hp: 250,
    fxColor: '#ffe27a',
    healColor: '#ffe27a',
    ultCost: 1820,
    speed(f) { return f.casting ? 0 : f.ultActive ? 390 : 300; },
    init(f) { f.beam = null; },
    reset(f) { f.beam = null; f.casting = null; f.ultActive = false; f.anchored = false; },
    pickTarget(f, g) {
        // Allié le plus proche de la direction visée
        const aim = Math.atan2(f.input.ay - f.y, f.input.ax - f.x);
        let best = null, bestA = 0.45;
        for (const a of beamCandidates(f, g, 400)) {
            const d = Math.abs(angleDiff(Math.atan2(a.y - f.y, a.x - f.x), aim));
            if (d < bestA) { bestA = d; best = a; }
        }
        return best;
    },
    update(f, g, dt, inp) {
        // Résurrection en cours (immobile 1 s)
        if (f.casting) {
            f.casting.t -= dt;
            if (f.casting.t <= 0) {
                const soul = f.casting.soul;
                f.casting = null;
                f.anchored = false;
                if (soul.alive && !soul.fighter.alive) g.revive(soul.fighter, f);
            }
            return;
        }
        if (f.ultActive) {
            f.ultT -= dt;
            this.heal(f, 50 * dt, f, g);
            if (f.ultT <= 0) f.ultActive = false;
        }

        const mode = inp.fire ? 'heal' : inp.fire2 ? 'amp' : null;
        if (mode) {
            const cur = f.beam?.target;
            const keep = cur && cur.alive && Math.hypot(cur.x - f.x, cur.y - f.y) < 480 && g.los(f.x, f.y, cur.x, cur.y);
            const target = keep ? cur : this.pickTarget(f, g);
            f.beam = target ? { target, mode } : null;
        } else {
            f.beam = null;
        }
        if (f.beam) {
            const targets = [f.beam.target];
            // Valkyrie : les rayons se propagent aux alliés proches de la cible
            if (f.ultActive) {
                for (const a of g.alliesOf(f, false)) {
                    if (a !== f.beam.target && Math.hypot(a.x - f.beam.target.x, a.y - f.beam.target.y) < 300 && g.los(a.x, a.y, f.beam.target.x, f.beam.target.y)) targets.push(a);
                }
            }
            f.beam.chain = targets;
            for (const t of targets) {
                if (f.beam.mode === 'heal') this.heal(t, 55 * dt, f, g);
                else {
                    t.amp = 0.25;
                    g.gainUlt(f, 30 * dt); // l'amplification charge aussi l'ultime
                }
            }
        }

        // Envol (Maj) : vers la cible du rayon, ou l'allié le plus proche de la souris
        if (inp.shift && ready(f, 'shift')) {
            let to = f.beam?.target || this.pickTarget(f, g);
            if (!to) {
                let bd = 450;
                for (const a of beamCandidates(f, g, 450)) {
                    const d = Math.hypot(a.x - inp.ax, a.y - inp.ay);
                    if (d < bd) { bd = d; to = a; }
                }
            }
            if (to) {
                f.cd.shift = 1.5;
                const d = Math.hypot(to.x - f.x, to.y - f.y);
                const t = Math.max(0.05, (d - f.r - to.r - 10) / 900);
                const a = Math.atan2(to.y - f.y, to.x - f.x);
                f.dash = { t, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, unstoppable: false };
                g.addEffect({ type: 'blink', x: f.x, y: f.y, x2: to.x, y2: to.y, color: '#ffe27a', life: 0.45, feathers: true });
                g.sound('fly', { x: f.x, y: f.y });
            }
        }

        // Résurrection (E) : allié mort à moins de 220
        if (inp.e && ready(f, 'e')) {
            const soul = g.objects.filter(o => o.kind === 'soul' && o.team === f.team && o.alive && !o.fighter.alive)
                .sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
            if (soul && Math.hypot(soul.x - f.x, soul.y - f.y) < 220 && g.los(f.x, f.y, soul.x, soul.y)) {
                f.cd.e = 30;
                f.casting = { t: 1, soul };
                f.anchored = true;
                f.beam = null;
                g.addEffect({ type: 'ring', x: soul.x, y: soul.y, r0: 90, r1: 20, color: '#ffe27a', life: 1 });
                g.sound('resurrectCast', { x: f.x, y: f.y });
            } else if (f.isPlayer) {
                g.emit('onHint', 'Aucun allié à ressusciter à proximité');
            }
        }

        // Valkyrie (Q)
        if (inp.q && useUlt(f, g)) {
            f.ultActive = true;
            f.ultT = 15;
            f.cd.shift = 0;
            g.addEffect({ type: 'ring', x: f.x, y: f.y, r0: 20, r1: 200, color: '#ffe27a', life: 0.8, follow: f });
            g.addEffect({ type: 'revive', x: f.x, y: f.y, color: '#ffe27a', life: 1.2 });
            g.sound('valkyrie', { x: f.x, y: f.y });
        }
    },
    heal(t, amount, f, g) { g.heal(t, amount, f); },
    slots(f) {
        return [
            { key: 'Maj', name: 'Envol', cd: f.cd.shift || 0, max: 1.5 },
            { key: 'E', name: 'Résurrection', cd: f.cd.e || 0, max: 30, active: Boolean(f.casting) }
        ];
    }
};

/* ===================================================================
   TEMPO (Lúcio) : ampli sonique, onde de choc, aura Soin/Vitesse, Volume, Mur du son
   =================================================================== */

const tempo = {
    hp: 250,
    fxColor: '#7ee34f',
    healColor: '#7ee34f',
    ultCost: 2690,
    speed() { return 345; },
    init(f) {
        f.maxAmmo = 20; f.ammo = 20; f.reloadTime = 1.25;
        f.track = 'heal';
        f.boostT = 0;
    },
    reset(f) { f.ammo = f.maxAmmo; f.reloadT = 0; f.boostT = 0; f.burst = null; },
    aura(f, g, dt) {
        const boosted = f.boostT > 0;
        for (const a of g.alliesOf(f, true)) {
            if (Math.hypot(a.x - f.x, a.y - f.y) > 280 || !g.los(f.x, f.y, a.x, a.y)) continue;
            if (f.track === 'heal') {
                const rate = (boosted ? 52 : 18) * (a === f ? 0.5 : 1);
                g.heal(a, rate * dt, f);
            } else {
                a.speedBuff = Math.max(a.speedBuff, boosted ? 1.6 : 1.25);
                if (a !== f) g.gainUlt(f, 10 * dt);
            }
        }
    },
    update(f, g, dt, inp) {
        f.boostT = Math.max(0, f.boostT - dt);

        // Rafale de 4 projectiles soniques
        if (f.burst) {
            f.burst.t -= dt;
            if (f.burst.t <= 0 && f.burst.n > 0) {
                f.burst.n--;
                f.burst.t = 0.06;
                const m = muzzle(g, f, 35, -10);
                g.spawnProjectile({
                    kind: 'sonic', owner: f, x: m.x, y: m.y, angle: aimFrom(f, m) + (Math.random() - 0.5) * 0.04, speed: 1150, r: 7, life: 0.65,
                    color: '#7ee34f',
                    onHit: (p, t) => g.damage(t, 20, f, { how: 'Ampli sonique' })
                });
                g.sound('sonic', { x: f.x, y: f.y, src: f.id });
            }
            if (f.burst.n <= 0) f.burst = null;
        }
        if (gunReady(f, dt, inp, g) && inp.fire && !f.burst) {
            f.fireT = 0.85;
            f.ammo = Math.max(0, f.ammo - 4);
            f.burst = { n: 4, t: 0 };
        }

        // Onde de choc (Clic D)
        if (inp.fire2Pressed && ready(f, 'rmb')) {
            f.cd.rmb = 4;
            g.cone(f, 250, 0.75, (t) => {
                g.damage(t, 25, f, { how: 'Onde de choc' });
                const l = Math.hypot(t.x - f.x, t.y - f.y) || 1;
                g.knock(t, ((t.x - f.x) / l) * 1150, ((t.y - f.y) / l) * 1150);
            });
            g.addEffect({ type: 'wave', x: f.x, y: f.y, angle: f.angle, range: 250, half: 0.75, color: '#7ee34f', life: 0.4 });
            g.sound('soundwave', { x: f.x, y: f.y });
        }

        // Changement de piste (Maj)
        if (inp.shift && ready(f, 'shift')) {
            f.cd.shift = 0.6;
            f.track = f.track === 'heal' ? 'speed' : 'heal';
            g.sound(f.track === 'heal' ? 'trackHeal' : 'trackSpeed', { x: f.x, y: f.y });
        }

        // Volume à fond (E)
        if (inp.e && ready(f, 'e')) {
            f.cd.e = 12;
            f.boostT = 3;
            g.addEffect({ type: 'ring', x: f.x, y: f.y, r0: 30, r1: 280, color: f.track === 'heal' ? '#7ee34f' : '#ffd21e', life: 0.5, follow: f });
            g.sound('ampItUp', { x: f.x, y: f.y });
        }

        // Mur du son (Q) : gros bouclier temporaire pour les alliés autour
        if (inp.q && useUlt(f, g)) {
            for (const a of g.alliesOf(f, true)) {
                if (Math.hypot(a.x - f.x, a.y - f.y) > 320 || !g.los(f.x, f.y, a.x, a.y)) continue;
                a.over = 750;
                a.overDecay = 110;
            }
            g.addEffect({ type: 'ring', x: f.x, y: f.y, r0: 20, r1: 320, color: '#d8ff7a', life: 0.8 });
            g.addEffect({ type: 'barrierDrop', x: f.x, y: f.y, color: '#d8ff7a', life: 1.2 });
            g.sound('soundBarrier', { x: f.x, y: f.y });
        }
    },
    slots(f) {
        return [
            { key: 'Clic D', name: 'Onde de choc', cd: f.cd.rmb || 0, max: 4 },
            { key: 'Maj', name: f.track === 'heal' ? 'Piste : Soin' : 'Piste : Vitesse', cd: f.cd.shift || 0, max: 0.6, active: true, tint: f.track === 'heal' ? '#7ee34f' : '#ffd21e' },
            { key: 'E', name: 'Volume à fond', cd: f.cd.e || 0, max: 12, active: f.boostT > 0 }
        ];
    }
};

/* ===================================================================
   RAGNOK (Chopper) : fusil à ferraille, crochet, bouffée d'air, Porc entier
   =================================================================== */

function pellets(g, f, n, spread, range, dmg, opts = {}) {
    const m = muzzle(g, f, opts.fx ?? f.r + 14, opts.side || 0);
    const base = aimFrom(f, m);
    for (let i = 0; i < n; i++) {
        g.hitscan(f, m.x, m.y, base + (Math.random() - 0.5) * spread, range * (0.85 + Math.random() * 0.15),
            (d) => dmg * Math.max(0.3, 1 - Math.max(0, d - range * 0.35) / range),
            { color: opts.color || '#ffd38a', width: 2, spark: i % 3 === 0, muzzle: i === 0, muzzleSize: opts.muzzle || 2, tracerLife: 0.07, how: opts.how });
    }
}

const ragnok = {
    hp: 750,
    fxColor: '#ffb03a',
    ultCost: 2240,
    speed(f) { return f.breatheT > 0 ? 200 : f.ultActive ? 160 : 245; },
    init(f) { f.maxAmmo = 6; f.ammo = 6; f.reloadTime = 1.5; f.breath = 100; f.breathIdle = 0; },
    reset(f) { f.ammo = f.maxAmmo; f.reloadT = 0; f.hook = null; f.breath = 100; f.breathing = false; },
    update(f, g, dt, inp) {
        // Porc entier : rafale continue qui repousse
        if (f.ultActive) {
            f.ultT -= dt;
            f.fireT = Math.max(0, (f.fireT || 0) - dt);
            if (f.fireT <= 0) {
                f.fireT = 0.07;
                const m = muzzle(g, f, 48, 26);
                for (let i = 0; i < 3; i++) {
                    const a = f.angle + (Math.random() - 0.5) * 0.9;
                    const res = g.hitscan(f, m.x, m.y, a, 520, () => 6, { color: '#ffd38a', width: 2.5, spark: i === 0, muzzle: i === 0, muzzleSize: 2.2, tracerLife: 0.06, how: 'Porc entier' });
                    if (res.target && !res.target.isTarget) g.knock(res.target, Math.cos(a) * 260, Math.sin(a) * 260);
                }
                g.sound('scrapgun', { x: f.x, y: f.y, src: f.id, vol: 0.6 });
            }
            if (f.ultT <= 0) f.ultActive = false;
            return;
        }
        if (f.breatheT > 0) this.heal(f, g, dt);
        if (gunReady(f, dt, inp, g) && inp.fire && !(f.breatheT > 0)) {
            f.fireT = 0.8;
            f.ammo--;
            pellets(g, f, 12, 0.3, 380, 13.3, { how: 'Fusil à ferraille', fx: 48, side: 26 });
            g.sound('scrapgun', { x: f.x, y: f.y });
        }
        // Crochet (Maj)
        if (inp.shift && ready(f, 'shift')) {
            f.cd.shift = 6;
            const m = muzzle(g, f, 34, -24);
            g.spawnProjectile({
                kind: 'hook', owner: f, x: m.x, y: m.y, angle: aimFrom(f, m), speed: 1300, r: 12, life: 0.5, eatable: false, color: '#c3ccd8',
                onHit: (p, t) => {
                    if (t.isTarget) return;
                    // Tiré jusqu'à Ragnok (s'arrête aux murs)
                    const a = Math.atan2(f.y - t.y, f.x - t.x);
                    const d = Math.max(0, Math.hypot(f.x - t.x, f.y - t.y) - f.r - t.r - 8);
                    const to = travel(g, t, a, d);
                    g.addEffect({ type: 'chain', x: f.x, y: f.y, x2: t.x, y2: t.y, life: 0.25 });
                    t.x = to.x; t.y = to.y;
                    t.vx = t.vy = 0;
                    g.stunTarget(t, 0.45);
                    g.damage(t, 30, f, { how: 'Crochet' });
                    g.sound('hookHit', { x: t.x, y: t.y });
                },
                onWall: (p) => g.sound('impactWall', { x: p.x, y: p.y })
            });
            g.sound('hookThrow', { x: f.x, y: f.y });
        }
        // Bouffée d'air (E)
        if (inp.e && ready(f, 'e')) {
            f.cd.e = 8;
            f.breatheT = 2;
            f.breatheLeft = 350;
            g.sound('breathe', { x: f.x, y: f.y });
        }
        if (inp.q && useUlt(f, g)) {
            f.ultActive = true;
            f.ultT = 6;
            g.sound('primal', { x: f.x, y: f.y });
        }
    },
    heal(f, g, dt) {
        const amount = Math.min(f.breatheLeft, 175 * dt);
        f.breatheLeft -= amount;
        g.heal(f, amount, f);
        if (g.time - (f._smokeT || 0) > 0.12) {
            f._smokeT = g.time;
            g.addEffect({ type: 'puff', x: f.x + Math.cos(f.angle) * 14, y: f.y + Math.sin(f.angle) * 14, color: '#ffb03a', life: 0.6 });
        }
    },
    slots(f) {
        return [
            { key: 'Maj', name: 'Crochet', cd: f.cd.shift || 0, max: 8 },
            { key: 'E', name: 'Bouffée d\'air', cd: f.cd.e || 0, max: 8, active: f.breatheT > 0 }
        ];
    }
};

/* ===================================================================
   KODO (Winston) : canon Tesla, Bond, Dôme, Rage primale
   =================================================================== */

const kodo = {
    hp: 625,
    fxColor: '#5ff3ff',
    ultCost: 2240,
    speed(f) { return f.ultActive ? 320 : 270; },
    init(f) { f.tesla = []; },
    reset(f) {
        f.tesla = [];
        if (f.ultActive || f.maxHp !== 625) { f.maxHp = 625; f.hp = Math.min(f.hp, 625); }
        f.ultActive = false;
        f.leap = null;
    },
    update(f, g, dt, inp) {
        f.fireT = Math.max(0, (f.fireT || 0) - dt);
        f.tesla = [];
        if (f.ultActive) {
            f.ultT -= dt;
            if (f.ultT <= 0) {
                f.ultActive = false;
                f.maxHp = 625;
                f.hp = Math.min(f.hp, 625);
            }
        }
        // Atterrissage du Bond
        if (f.leap) {
            f.leap.t -= dt;
            if (f.leap.t <= 0 || !f.dash) {
                f.leap = null;
                f.dash = null;
                g.explode(f.x, f.y, f.ultActive ? 150 : 115, f.ultActive ? 40 : 50, f, { how: 'Bond', knock: f.ultActive ? 700 : 350, falloff: false, color: '#7fd8ff', sound: 'leapLand' });
                g.emit('onShake', f.x, f.y, 0.5);
            }
            return;
        }
        if (f.ultActive) {
            // Coups de poing qui projettent
            if (inp.fire && f.fireT <= 0) {
                f.fireT = 0.6;
                f.swing = { t: 0, dir: (f.swingDir = -(f.swingDir || 1)) };
                let hit = false;
                g.cone(f, 150, 1.0, (t) => {
                    hit = true;
                    g.damage(t, 40, f, { how: 'Rage primale', x: t.x, y: t.y });
                    const l = Math.hypot(t.x - f.x, t.y - f.y) || 1;
                    g.knock(t, ((t.x - f.x) / l) * 800, ((t.y - f.y) / l) * 800);
                });
                g.sound(hit ? 'hammerHit' : 'hammerSwing', { x: f.x, y: f.y });
            }
        } else if (inp.fire) {
            // Canon Tesla : jusqu'à 3 cibles dans un cône, ignore les boucliers
            const targets = g.targetsFor(f.team)
                .filter(t => {
                    const d = Math.hypot(t.x - f.x, t.y - f.y);
                    return d < 240 + t.r && Math.abs(angleDiff(Math.atan2(t.y - f.y, t.x - f.x), f.angle)) < 0.55 && g.los(f.x, f.y, t.x, t.y);
                })
                .sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))
                .slice(0, 3);
            f.tesla = targets;
            f.teslaFiring = true;
            if (f.fireT <= 0) {
                f.fireT = 0.1;
                for (const t of targets) g.damage(t, 7, f, { how: 'Canon Tesla' });
            }
        }
        f.teslaFiring = inp.fire && !f.ultActive;

        // Bond (Maj)
        if (inp.shift && ready(f, 'shift')) {
            f.cd.shift = f.ultActive ? 2.5 : 6;
            const dist = Math.min(f.ultActive ? 520 : 440, Math.hypot(inp.ax - f.x, inp.ay - f.y));
            const t = Math.max(0.2, dist / 1000);
            f.dash = { t, vx: Math.cos(f.angle) * (dist / t), vy: Math.sin(f.angle) * (dist / t), unstoppable: true };
            f.leap = { t };
            g.sound('leap', { x: f.x, y: f.y });
        }
        // Dôme (E)
        if (inp.e && ready(f, 'e') && !f.ultActive) {
            f.cd.e = 13;
            for (const o of g.objects) if (o.kind === 'dome' && o.owner === f) o.alive = false;
            const to = travel(g, f, f.angle, 40);
            g.objects.push({
                kind: 'dome', team: f.team, owner: f, x: to.x, y: to.y, radius: 150, hp: 700, max: 700, life: 9, alive: true, flash: 0, age: 0,
                update: (o, gg, ddt) => {
                    o.age += ddt;
                    o.life -= ddt;
                    o.flash = Math.max(0, o.flash - ddt * 5);
                    if (o.life <= 0) o.alive = false;
                }
            });
            g.sound('dome', { x: f.x, y: f.y });
        }
        // Rage primale (Q)
        if (inp.q && useUlt(f, g)) {
            f.ultActive = true;
            f.ultT = 10;
            f.maxHp = 1125;
            f.hp = Math.min(1125, f.hp + 500);
            f.cd.shift = 0;
            g.addEffect({ type: 'ring', x: f.x, y: f.y, r0: 20, r1: 200, color: '#7fd8ff', life: 0.7, follow: f });
            g.sound('primal', { x: f.x, y: f.y });
            g.emit('onShake', f.x, f.y, 0.6);
        }
    },
    slots(f) {
        return [
            { key: 'Maj', name: 'Bond', cd: f.cd.shift || 0, max: f.ultActive ? 2.5 : 6 },
            { key: 'E', name: 'Dôme', cd: f.cd.e || 0, max: 13 }
        ];
    }
};

/* ===================================================================
   KADE (Soldat : 76) : fusil, roquettes, sprint, champ biotique, visière
   =================================================================== */

const kade = {
    hp: 250,
    fxColor: '#7fd8ff',
    healColor: '#7fd8ff',
    ultCost: 2310,
    speed(f) { return f.sprinting ? 300 * 1.5 : 300; },
    init(f) { f.maxAmmo = 30; f.ammo = 30; f.reloadTime = 1.5; },
    reset(f) { f.ammo = f.maxAmmo; f.reloadT = 0; f.sprinting = false; f.ultActive = false; },
    update(f, g, dt, inp) {
        if (f.ultActive) {
            f.ultT -= dt;
            if (f.ultT <= 0) f.ultActive = false;
            // Visière : verrouillage sur l'ennemi visible le plus proche
            let best = null, bd = 950;
            for (const t of g.targetsFor(f.team)) {
                const d = Math.hypot(t.x - f.x, t.y - f.y);
                if (d < bd && g.los(f.x, f.y, t.x, t.y)) { bd = d; best = t; }
            }
            f.lockOn = best;
            if (best) f.angle = Math.atan2(best.y - f.y, best.x - f.x);
        } else f.lockOn = null;

        // Le tir coupe le sprint
        if (inp.fire || inp.fire2) f.sprinting = false;
        if (inp.shift) f.sprinting = !f.sprinting;
        if (f.sprinting && Math.hypot(inp.mx, inp.my) < 0.1) f.sprinting = false;

        if (gunReady(f, dt, inp, g) && inp.fire) {
            f.fireT = 0.11;
            f.ammo--;
            const m = muzzle(g, f, 43, 4);
            const spread = f.ultActive ? 0 : 0.035;
            g.hitscan(f, m.x, m.y, aimFrom(f, m) + (Math.random() - 0.5) * spread, 950, (d) => 18 * Math.max(0.5, 1 - Math.max(0, d - 600) / 700),
                { color: f.ultActive ? '#ff5a5a' : '#7fd8ff', width: 2.5, spark: f.ammo % 2 === 0, how: f.ultActive ? 'Visière tactique' : 'Fusil à impulsion' });
            g.sound('rifle', { x: f.x, y: f.y, src: f.id });
        }
        // Roquettes hélices (Clic D)
        if (inp.fire2Pressed && ready(f, 'rmb')) {
            f.cd.rmb = 6;
            for (let i = 0; i < 3; i++) {
                const m = muzzle(g, f, 40, 4 + (i - 1) * 6);
                g.spawnProjectile({
                    kind: 'helix', owner: f, x: m.x, y: m.y, angle: aimFrom(f, m), speed: 1100, r: 8, life: 0.9, color: '#7fd8ff', phase: i * 2.1,
                    onHit: (p, t) => { g.damage(t, 13.3, f, { how: 'Roquettes hélices' }); g.explode(p.x, p.y, 70, 26.7, f, { how: 'Roquettes hélices', color: '#7fd8ff' }); },
                    onWall: (p) => g.explode(p.x, p.y, 70, 26.7, f, { how: 'Roquettes hélices', color: '#7fd8ff' })
                });
            }
            g.sound('helix', { x: f.x, y: f.y });
        }
        // Champ biotique (E)
        if (inp.e && ready(f, 'e')) {
            f.cd.e = 15;
            g.objects.push({
                kind: 'field', team: f.team, owner: f, x: f.x, y: f.y, r: 170, life: 5, alive: true, age: 0,
                update: (o, gg, ddt) => {
                    o.age += ddt;
                    o.life -= ddt;
                    if (o.life <= 0) { o.alive = false; return; }
                    for (const a of gg.fighters) {
                        if (!a.alive || a.team !== o.team || Math.hypot(a.x - o.x, a.y - o.y) > o.r || !gg.los(o.x, o.y, a.x, a.y)) continue;
                        gg.heal(a, 40 * ddt, o.owner);
                    }
                }
            });
            g.sound('field', { x: f.x, y: f.y });
        }
        // Visière tactique (Q)
        if (inp.q && useUlt(f, g)) {
            f.ultActive = true;
            f.ultT = 6;
            f.ammo = f.maxAmmo; f.reloadT = 0;
            g.sound('visor', { x: f.x, y: f.y });
        }
    },
    slots(f) {
        return [
            { key: 'Clic D', name: 'Roquettes hélices', cd: f.cd.rmb || 0, max: 6 },
            { key: 'Maj', name: 'Sprint', cd: 0, max: 1, active: f.sprinting },
            { key: 'E', name: 'Champ biotique', cd: f.cd.e || 0, max: 15 }
        ];
    }
};

/* ===================================================================
   NOX (Faucheur) : fusils à pompe, forme spectrale, pas de l'ombre, fleur de mort
   =================================================================== */

const nox = {
    hp: 300,
    fxColor: '#ff3b4f',
    ultCost: 2100,
    speed(f) { return f.wraith > 0 ? 450 : f.ultActive ? 150 : 300; },
    init(f) { f.maxAmmo = 8; f.ammo = 8; f.reloadTime = 1.5; f.wraith = 0; },
    reset(f) { f.ammo = f.maxAmmo; f.reloadT = 0; f.wraith = 0; f.step = null; f.ultActive = false; },
    // Moisson : récupère 30 % des dégâts infligés
    onDealt(f, dmg, target, g) {
        if (target.isTarget) return;
        f.hp = Math.min(f.maxHp, f.hp + dmg * 0.3);
    },
    update(f, g, dt, inp) {
        if (f.wraith > 0) {
            f.wraith -= dt;
            f.invuln = Math.max(f.invuln, 0.05);
            if (g.time - (f._smokeT || 0) > 0.06) {
                f._smokeT = g.time;
                g.addEffect({ type: 'puff', x: f.x, y: f.y, color: '#22222a', dark: true, life: 0.7 });
            }
            if (f.wraith <= 0) { f.wraith = 0; f.ammo = f.maxAmmo; f.reloadT = 0; }
            return;
        }
        // Pas de l'ombre : canalisation puis téléportation
        if (f.step) {
            f.step.t -= dt;
            if (f.step.t <= 0) {
                const s = f.step;
                f.step = null;
                f.anchored = false;
                g.addEffect({ type: 'blink', x: f.x, y: f.y, x2: s.x, y2: s.y, color: '#ff3b4f', life: 0.4 });
                f.x = s.x; f.y = s.y;
                g.addEffect({ type: 'puff', x: f.x, y: f.y, color: '#22222a', dark: true, big: true, life: 0.8 });
                g.sound('shadowStep', { x: f.x, y: f.y });
            }
            return;
        }
        if (f.ultActive) {
            f.ultT -= dt;
            if (f.ultT <= 0) { f.ultActive = false; return; }
            f.blossomT = (f.blossomT || 0) - dt;
            if (f.blossomT <= 0) {
                f.blossomT = 0.1;
                for (const t of g.targetsFor(f.team)) {
                    if (Math.hypot(t.x - f.x, t.y - f.y) > 230 + t.r || !g.los(f.x, f.y, t.x, t.y)) continue;
                    g.damage(t, 17, f, { how: 'Fleur de mort' });
                }
                for (let i = 0; i < 4; i++) {
                    const a = g.time * 9 + (i / 4) * TAU;
                    g.addEffect({ type: 'tracer', x: f.x + Math.cos(a) * 20, y: f.y + Math.sin(a) * 20, x2: f.x + Math.cos(a) * 230, y2: f.y + Math.sin(a) * 230, color: '#ff3b4f', width: 2.5, life: 0.08 });
                }
                g.sound('scrapgun', { x: f.x, y: f.y, src: f.id, vol: 0.5 });
            }
            f.angle = g.time * 9;
            return;
        }
        if (gunReady(f, dt, inp, g) && inp.fire) {
            f.fireT = 0.5;
            f.ammo--;
            const side = f.ammo % 2 ? 12 : -12;
            pellets(g, f, 14, 0.34, 300, 7.7, { how: 'Fusils infernaux', color: '#ff7b6b', side, fx: 36, muzzle: 1.8 });
            g.sound('shotgunR', { x: f.x, y: f.y });
        }
        // Forme spectrale (Maj)
        if (inp.shift && ready(f, 'shift')) {
            f.cd.shift = 8;
            f.wraith = 3;
            g.sound('wraith', { x: f.x, y: f.y });
        }
        // Pas de l'ombre (E)
        if (inp.e && ready(f, 'e')) {
            const d = Math.min(600, Math.hypot(inp.ax - f.x, inp.ay - f.y));
            const a = Math.atan2(inp.ay - f.y, inp.ax - f.x);
            const tx = f.x + Math.cos(a) * d, ty = f.y + Math.sin(a) * d;
            const c = collide(g.map, tx, ty, f.r);
            const enemyRoom = g.spawnRooms[f.team === 'blue' ? 'red' : 'blue'];
            const inEnemy = enemyRoom && c.x > enemyRoom.x && c.x < enemyRoom.x + enemyRoom.w && c.y > enemyRoom.y && c.y < enemyRoom.y + enemyRoom.h;
            if (!inEnemy && Math.hypot(c.x - tx, c.y - ty) < 40 && c.x > 60 && c.x < g.map.width - 60) {
                f.cd.e = 10;
                f.step = { t: 0.9, x: c.x, y: c.y };
                f.anchored = true;
                g.addEffect({ type: 'puff', x: c.x, y: c.y, color: '#22222a', dark: true, big: true, life: 0.9 });
                g.sound('wraith', { x: f.x, y: f.y, vol: 0.6 });
            } else if (f.isPlayer) g.emit('onHint', 'Impossible de se téléporter ici');
        }
        // Fleur de mort (Q)
        if (inp.q && useUlt(f, g)) {
            f.ultActive = true;
            f.ultT = 3;
            f.blossomT = 0;
            g.sound('blossom', { x: f.x, y: f.y });
        }
    },
    slots(f) {
        return [
            { key: 'Maj', name: 'Forme spectrale', cd: f.cd.shift || 0, max: 8, active: f.wraith > 0 },
            { key: 'E', name: 'Pas de l\'ombre', cd: f.cd.e || 0, max: 10, active: Boolean(f.step) }
        ];
    }
};

/* ===================================================================
   SHIRIN (Ana) : fusil biotique, fléchette soporifique, grenade biotique, nano-boost
   =================================================================== */

const shirin = {
    hp: 250,
    fxColor: '#c98bff',
    healColor: '#e7c2ff',
    ultCost: 2100,
    speed() { return 290; },
    init(f) { f.maxAmmo = 15; f.ammo = 15; f.reloadTime = 1.5; },
    reset(f) { f.ammo = f.maxAmmo; f.reloadT = 0; },
    // Tir qui touche alliés (soin) et ennemis (dégâts)
    shoot(f, g) {
        const m = muzzle(g, f, 50, 3.5);
        const sa = aimFrom(f, m);
        const dx = Math.cos(sa), dy = Math.sin(sa);
        const wall = castWall(g.map, m.x, m.y, dx, dy, 1800);
        let end = wall.t;
        const bar = g.barrierHit(f.team, m.x, m.y, m.x + dx * end, m.y + dy * end);
        let best = bar ? bar.t : end, hit = null;
        const cands = [...g.targetsFor(f.team), ...g.alliesOf(f, false)];
        for (const t of cands) {
            const d = rayCircle(m.x, m.y, dx, dy, t.x, t.y, t.r + 4);
            if (d < best) { best = d; hit = t; }
        }
        if (hit) {
            end = best;
            if (hit.team === f.team && !hit.isTarget) g.heal(hit, 75, f);
            else g.damage(hit, 75, f, { how: 'Fusil biotique', x: m.x + dx * best, y: m.y + dy * best });
        } else if (bar) {
            end = bar.t;
            g.damageBarrier(bar, 70);
        }
        g.addEffect({ type: 'tracer', x: m.x, y: m.y, x2: m.x + dx * end, y2: m.y + dy * end, color: '#c98bff', width: 3.5, life: 0.18 });
        g.addEffect({ type: 'muzzle', x: m.x, y: m.y, angle: sa, color: '#c98bff', size: 1.4, life: 0.1 });
        g.sound('anaRifle', { x: f.x, y: f.y });
    },
    update(f, g, dt, inp) {
        if (gunReady(f, dt, inp, g) && inp.fire) {
            f.fireT = 0.8;
            f.ammo--;
            this.shoot(f, g);
        }
        // Fléchette soporifique (Maj)
        if (inp.shift && ready(f, 'shift')) {
            f.cd.shift = 14;
            const m = muzzle(g, f, 50, 3.5);
            g.spawnProjectile({
                kind: 'dart', owner: f, x: m.x, y: m.y, angle: aimFrom(f, m), speed: 1800, r: 6, life: 0.8, eatable: true, color: '#b6ff8a',
                onHit: (p, t) => {
                    if (t.isTarget) return;
                    g.damage(t, 5, f, { how: 'Fléchette soporifique' });
                    g.stunTarget(t, 5);
                    t.sleep = 5;
                    g.sound('sleep', { x: t.x, y: t.y });
                }
            });
            g.sound('dart', { x: f.x, y: f.y });
        }
        // Grenade biotique (E)
        if (inp.e && ready(f, 'e')) {
            f.cd.e = 12;
            const d = Math.min(700, Math.hypot(inp.ax - f.x, inp.ay - f.y));
            const burst = (p) => {
                g.addEffect({ type: 'bionade', x: p.x, y: p.y, r: 130, life: 0.7 });
                g.sound('bionade', { x: p.x, y: p.y });
                for (const t of g.fighters) {
                    if (!t.alive || Math.hypot(t.x - p.x, t.y - p.y) > 130 + t.r || !g.los(p.x, p.y, t.x, t.y)) continue;
                    if (t.team === f.team) { g.heal(t, 60, f); t.healBoost = 4; }
                    else { g.damage(t, 60, f, { how: 'Grenade biotique' }); t.antiHeal = 3; }
                }
            };
            const m = muzzle(g, f, 14, -12);
            g.spawnProjectile({
                kind: 'bionade', owner: f, x: m.x, y: m.y, angle: f.angle, speed: 900, r: 9, life: Math.max(0.12, d / 900), eatable: true, color: '#c98bff',
                onHit: burst, onWall: burst, onExpire: burst, onBarrier: burst
            });
            g.sound('mineThrow', { x: f.x, y: f.y });
        }
        // Nano-boost (Q) : sur l'allié le plus proche de la souris
        if (inp.q && f.ult >= 100) {
            let best = null, bd = 0.5;
            const aim = Math.atan2(inp.ay - f.y, inp.ax - f.x);
            for (const a of g.alliesOf(f, false)) {
                if (Math.hypot(a.x - f.x, a.y - f.y) > 800 || !g.los(f.x, f.y, a.x, a.y)) continue;
                const da = Math.abs(angleDiff(Math.atan2(a.y - f.y, a.x - f.x), aim));
                if (da < bd) { bd = da; best = a; }
            }
            if (best && useUlt(f, g)) {
                best.nano = 8;
                g.heal(best, 250, f);
                g.addEffect({ type: 'ring', x: best.x, y: best.y, r0: 100, r1: 20, color: '#5ff3ff', life: 0.6, follow: best });
                g.sound('nano', { x: best.x, y: best.y });
                g.emit('onNano', best, f);
            } else if (f.isPlayer) g.emit('onHint', 'Vise un allié pour lui donner le Nano-boost');
        }
    },
    slots(f) {
        return [
            { key: 'Maj', name: 'Fléchette soporifique', cd: f.cd.shift || 0, max: 14 },
            { key: 'E', name: 'Grenade biotique', cd: f.cd.e || 0, max: 12 }
        ];
    }
};

/* ===================================================================
   VESPERA (Moira) : étreinte (soin en cône / drain), évanescence, orbe, coalescence
   =================================================================== */

const vespera = {
    hp: 250,
    fxColor: '#b35cff',
    healColor: '#ffd84a',
    ultCost: 2125,
    speed(f) { return f.fade > 0 ? 300 * 2.2 : f.ultActive ? 340 : 300; },
    init(f) { f.energy = 100; f.fade = 0; },
    reset(f) { f.energy = 100; f.fade = 0; f.spray = false; f.drain = null; f.coal = null; f.ultActive = false; },
    update(f, g, dt, inp) {
        f.spray = false;
        f.drain = null;
        f.coal = null;
        if (f.fade > 0) {
            f.fade -= dt;
            f.invuln = Math.max(f.invuln, 0.05);
            return;
        }
        if (f.ultActive) {
            f.ultT -= dt;
            if (f.ultT <= 0) f.ultActive = false;
            // Coalescence : rayon long qui soigne les alliés et blesse les ennemis
            const dx = Math.cos(f.angle), dy = Math.sin(f.angle);
            const len = castWall(g.map, f.x, f.y, dx, dy, 950).t;
            f.coal = { len };
            for (const t of g.fighters) {
                if (!t.alive || t === f) continue;
                const px = t.x - f.x, py = t.y - f.y;
                const along = px * dx + py * dy;
                if (along < 0 || along > len) continue;
                if (Math.abs(px * dy - py * dx) > 40 + t.r) continue;
                if (t.team === f.team) g.heal(t, 140 * dt, f);
                else g.damage(t, 70 * dt, f, { how: 'Coalescence' });
            }
            g.heal(f, 50 * dt, f);
            return;
        }
        // Étreinte : soin en cône (Clic G)
        if (inp.fire && f.energy > 0) {
            f.spray = true;
            f.energy = Math.max(0, f.energy - 10 * dt);
            for (const a of g.alliesOf(f, true)) {
                const d = Math.hypot(a.x - f.x, a.y - f.y);
                if (a !== f && (d > 230 + a.r || Math.abs(angleDiff(Math.atan2(a.y - f.y, a.x - f.x), f.angle)) > 0.5 || !g.los(f.x, f.y, a.x, a.y))) continue;
                g.heal(a, (a === f ? 20 : 65) * dt, f);
            }
        } else if (inp.fire2) {
            // Étreinte : drain (Clic D) sur l'ennemi le plus proche de la visée
            let best = null, bd = 0.45;
            for (const t of g.targetsFor(f.team)) {
                const d = Math.hypot(t.x - f.x, t.y - f.y);
                if (d > 420) continue;
                const da = Math.abs(angleDiff(Math.atan2(t.y - f.y, t.x - f.x), f.angle));
                if (da < bd && g.los(f.x, f.y, t.x, t.y) && !g.barrierHit(f.team, f.x, f.y, t.x, t.y)) { bd = da; best = t; }
            }
            if (best) {
                f.drain = best;
                g.damage(best, 50 * dt, f, { how: 'Étreinte : drain' });
                g.heal(f, 30 * dt, f);
                f.energy = Math.min(100, f.energy + 9 * dt);
            }
        }
        if (!inp.fire) f.energy = Math.min(100, f.energy + 3 * dt);

        // Évanescence (Maj)
        if (inp.shift && ready(f, 'shift')) {
            f.cd.shift = 6;
            f.fade = 0.8;
            g.addEffect({ type: 'puff', x: f.x, y: f.y, color: '#b35cff', big: true, life: 0.6 });
            g.sound('fade', { x: f.x, y: f.y });
        }
        // Orbe biotique (E) : rebondit et soigne les alliés croisés
        if (inp.e && ready(f, 'e')) {
            f.cd.e = 10;
            const m = muzzle(g, f, 22, -12);
            let pool = 300;
            g.spawnProjectile({
                kind: 'orb', owner: f, x: m.x, y: m.y, angle: f.angle, speed: 360, r: 14, life: 7, bounces: 4, eatable: false,
                color: '#ffd84a', pierce: true, ignoreBarrier: true,
                onHit: () => {},
                update: (p, gg, ddt) => {
                    for (const a of gg.alliesOf(f, true)) {
                        if (pool <= 0) { p.dead = true; return; }
                        if (Math.hypot(a.x - p.x, a.y - p.y) > 150 + a.r || !gg.los(p.x, p.y, a.x, a.y)) continue;
                        const h = gg.heal(a, 65 * ddt, f);
                        pool -= Math.max(h, 10 * ddt);
                    }
                }
            });
            g.sound('orb', { x: f.x, y: f.y });
        }
        if (inp.q && useUlt(f, g)) {
            f.ultActive = true;
            f.ultT = 8;
            g.sound('coalescence', { x: f.x, y: f.y });
        }
    },
    slots(f) {
        return [
            { key: 'Clic G', name: 'Énergie', meter: f.energy / 100, active: f.spray },
            { key: 'Maj', name: 'Évanescence', cd: f.cd.shift || 0, max: 6, active: f.fade > 0 },
            { key: 'E', name: 'Orbe biotique', cd: f.cd.e || 0, max: 10 }
        ];
    }
};

export const KITS = { gorvald, volta, zephyr, kraz, seraphine, tempo, ragnok, kodo, kade, nox, shirin, vespera };

// Utilisé par les bots et l'interface
export { front, angleDiff, castWall };
