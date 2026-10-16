/* ==================================
   NEXUS - POUVOIRS DES HÉROS
   Chaque kit lit l'entrée du héros (joueur ou bot, même format) :
     fire / fire2 (maintenus), firePressed / fire2Pressed, shift, e, q, reload,
     mx, my (déplacement), ax, ay (point visé dans le monde).
   Tout passe par le moteur (game.js) : dégâts, soins, projectiles, explosions.
   ================================== */

import { collide } from './map.js?v=2';
import { castWall } from './geom.js?v=1';

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
    hp: 650,
    fxColor: '#ffb347',
    ultCost: 1500,
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
            f.fireT = 0.9;
            f.swingLock = 0.35;
            f.swing = { t: 0, dir: (f.swingDir = -(f.swingDir || 1)) };
            g.sound('hammerSwing', { x: f.x, y: f.y });
            let hit = false;
            g.cone(f, 130, 1.05, (t) => {
                if (!hit) { hit = true; g.sound('hammerHit', { x: t.x, y: t.y }); }
                g.damage(t, 95, f, { how: 'Marteau-fusée', x: t.x, y: t.y });
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
            const p = front(f, f.r + 10);
            g.spawnProjectile({
                kind: 'firestrike', owner: f, x: p.x, y: p.y, angle: f.angle, speed: 950, r: 28, life: 1.2,
                pierce: true, ignoreBarrier: true, eatable: false, color: '#ff7a1f',
                onHit: (pr, t) => g.damage(t, 100, f, { how: 'Frappe de feu' })
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
                g.damage(t, 170, f, { how: 'Fracas' });
                g.stunTarget(t, 2.4);
            });
            g.addEffect({ type: 'shatter', x: f.x, y: f.y, angle: f.angle, range: 440, half: 0.62, life: 1.1, seed: Math.random() * 1000 });
            g.sound('earthshatter', { x: f.x, y: f.y });
            g.emit('onShake', f.x, f.y, 1.2);
        }
    },
    startCharge(f, g) {
        f.cd.shift = 8;
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
                    g.damage(c.pinned, 300, ff, { how: 'Charge' });
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
    hp: 650,
    fxColor: '#7ff6ff',
    ultCost: 2000,
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
        f.maxHp = 650;
        f.hp = 650;
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
                const m = front(f, 14);
                g.hitscan(f, m.x, m.y, f.angle + (Math.random() - 0.5) * 0.05, 700, (d) => (d < 250 ? 14 : 9), { color: '#ff9bd0', width: 2, how: 'Pistolet' });
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
                const m = front(f, 44, side * 30);
                for (let i = 0; i < 2; i++) {
                    g.hitscan(f, m.x, m.y, f.angle + (Math.random() - 0.5) * 0.3, 420,
                        (d) => 6 * Math.max(0.3, 1 - Math.max(0, d - 150) / 360),
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
                const m = front(f, 10, side * 24);
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
        f.ult = Math.min(100, f.ult + 25);
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
    ultCost: 1100,
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
            const m = front(f, 26, side);
            g.hitscan(f, m.x, m.y, f.angle + (Math.random() - 0.5) * 0.09, 520,
                (d) => 6 * Math.max(0.35, 1 - Math.max(0, d - 220) / 300),
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
            const m = front(f, 20);
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
    ultCost: 2100,
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
            onHit: (p, t) => { g.damage(t, 40, f, { how: 'Lance-grenades' }); g.explode(p.x, p.y, 80, 45, f, { how: 'Lance-grenades' }); },
            onExpire: (p) => g.explode(p.x, p.y, 80, 55, f, { how: 'Lance-grenades' }),
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
            f.fireT = 0.72;
            f.ammo--;
            const m = front(f, 30, 6);
            this.grenade(f, g, m.x, m.y, f.angle);
            g.addEffect({ type: 'muzzle', x: m.x, y: m.y, angle: f.angle, color: '#ffb03a', size: 1.8, smoke: true, life: 0.3 });
            g.sound('grenadeLaunch', { x: f.x, y: f.y });
        }

        // Mine commotion (Clic D) : lancer, puis Clic D pour faire exploser
        if (inp.fire2Pressed) {
            const mines = g.objects.filter(o => o.kind === 'mine' && o.owner === f && o.alive);
            if (mines.length) {
                for (const mine of mines) this.detonateMine(mine, g);
            } else if (f.mineCharges > 0) {
                f.mineCharges--;
                const m = front(f, 24);
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
            const m = front(f, f.r + 20);
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
    hp: 225,
    fxColor: '#ffe27a',
    healColor: '#ffe27a',
    ultCost: 1500,
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
    hp: 225,
    fxColor: '#7ee34f',
    healColor: '#7ee34f',
    ultCost: 1800,
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
                const rate = (boosted ? 60 : 18) * (a === f ? 0.6 : 1);
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
                const m = front(f, 32, -8);
                g.spawnProjectile({
                    kind: 'sonic', owner: f, x: m.x, y: m.y, angle: f.angle + (Math.random() - 0.5) * 0.04, speed: 1150, r: 7, life: 0.65,
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
                g.damage(t, 35, f, { how: 'Onde de choc' });
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
                a.over = 650;
                a.overDecay = 95;
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

export const KITS = { gorvald, volta, zephyr, kraz, seraphine, tempo };

// Utilisé par les bots et l'interface
export { front, angleDiff, castWall };
