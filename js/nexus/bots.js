/* ==================================
   NEXUS - BOTS
   Chaque bot remplit la même entrée qu'un joueur (déplacement, visée, touches).
   Objectif : aller sur le point (le prendre, le contester, le défendre),
   se battre à la bonne distance selon son héros, et utiliser ses pouvoirs.
   ================================== */

import { NavGrid } from './geom.js?v=1';

const TAU = Math.PI * 2;
const THINK = 0.12;

// Distance de combat préférée et portée d'engagement de chaque héros
const STYLE = {
    gorvald: { range: 95, engage: 650, aimErr: 0.05 },
    volta: { range: 200, engage: 600, aimErr: 0.08 },
    zephyr: { range: 190, engage: 560, aimErr: 0.07 },
    kraz: { range: 380, engage: 760, aimErr: 0.06 },
    seraphine: { range: 230, engage: 0, aimErr: 0.02 },
    tempo: { range: 240, engage: 520, aimErr: 0.07 }
};

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class BotBrain {
    constructor(game) {
        this.game = game;
        const g = game;
        // Une grille par équipe : la base adverse est interdite
        this.nav = {
            blue: new NavGrid(g.map, [g.spawnRooms.red]),
            red: new NavGrid(g.map, [g.spawnRooms.blue])
        };
        for (const f of g.fighters) {
            if (!f.isBot) continue;
            f.brain = {
                think: Math.random() * THINK, target: null, goal: null, wp: null, wpT: 0,
                strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rand(0.5, 1.4),
                spot: { a: Math.random() * TAU, d: rand(0.25, 0.8) }, // place sur le point
                reaction: rand(0.25, 0.5), seen: null, err: 0, errT: 0,
                mineT: 0
            };
        }
    }

    update(dt) {
        for (const f of this.game.fighters) {
            if (!f.isBot) continue;
            if (!f.alive) { f.input.fire = f.input.fire2 = false; continue; }
            const b = f.brain;
            b.think -= dt;
            if (b.think <= 0) {
                b.think += THINK;
                this.think(f, THINK);
            }
            this.steer(f, dt);
        }
    }

    /* ----- Décision ----- */

    // Ennemi visible le plus intéressant (proche, peu de vie, sur le point)
    pickTarget(f, range) {
        const g = this.game;
        let best = null, score = -Infinity;
        for (const t of g.targetsFor(f.team)) {
            if (t.isTarget && t.kind !== 'tire') continue;
            const d = dist(f, t);
            if (d > range) continue;
            if (!g.los(f.x, f.y, t.x, t.y)) continue;
            let s = -d;
            if (!t.isTarget) s += (1 - t.hp / t.maxHp) * 220;
            if (t.kind === 'tire') s += 500; // le pneu doit être abattu vite
            if (g.onPoint(t)) s += 120;
            if (t.role === 'support') s += 60;
            if (s > score) { score = s; best = t; }
        }
        return best;
    }

    // Où se placer pour l'objectif
    objective(f) {
        const g = this.game;
        const p = g.map.point;
        const side = f.team === 'blue' ? -1 : 1;
        if (g.phase === 'setup') {
            // On attend devant le point, de son côté
            return { x: p.x + side * (p.r + 160) + Math.cos(f.brain.spot.a) * 60, y: p.y + Math.sin(f.brain.spot.a) * 220 };
        }
        const s = f.brain.spot;
        return { x: p.x + Math.cos(s.a) * p.r * s.d, y: p.y + Math.sin(s.a) * p.r * s.d };
    }

    think(f, dt) {
        const g = this.game;
        const b = f.brain;
        const st = STYLE[f.heroId];
        const inp = f.input;
        const enemy = this.pickTarget(f, 900);
        if (enemy !== b.seen) { b.seen = enemy; b.reaction = rand(0.2, 0.45); }
        b.reaction = Math.max(0, b.reaction - dt);
        b.target = b.reaction <= 0 ? enemy : null;
        b.errT -= dt;
        if (b.errT <= 0) { b.errT = rand(0.3, 0.7); b.err = rand(-1, 1) * st.aimErr; }

        // Retour en base pour se soigner si très blessé et loin de l'action
        const hpRatio = f.hp / f.maxHp;
        let goal = this.objective(f);
        const t = b.target;
        if (t && g.phase !== 'setup') {
            const d = dist(f, t);
            const onObj = g.onPoint(f);
            // Rester proche du point : on ne poursuit pas trop loin
            const chase = dist(t, g.map.point) < g.map.point.r + 500;
            if (chase || d < st.range * 1.5) {
                const a = Math.atan2(f.y - t.y, f.x - t.x);
                goal = { x: t.x + Math.cos(a) * st.range, y: t.y + Math.sin(a) * st.range };
                // Si personne ne tient le point, on s'y bat de préférence
                if (!onObj && g.owner !== f.team && f.role !== 'support') {
                    const o = this.objective(f);
                    goal = { x: (goal.x + o.x) / 2, y: (goal.y + o.y) / 2 };
                }
            }
        }
        if (f.role === 'support') goal = this.supportGoal(f, goal);
        if (hpRatio < 0.25 && f.role !== 'tank' && !g.onPoint(f) && t) {
            // Fuite vers l'arrière
            const home = g.map.spawns[f.team][f.index];
            goal = { x: (f.x + home.x) / 2, y: (f.y + home.y) / 2 };
        }
        b.goal = goal;

        // Visée par défaut : la cible, sinon là où on va
        if (t) {
            const lead = this.leadFor(f, t);
            const a = Math.atan2(lead.y - f.y, lead.x - f.x) + b.err;
            const d = dist(f, t);
            inp.ax = f.x + Math.cos(a) * d;
            inp.ay = f.y + Math.sin(a) * d;
        } else if (b.wp) {
            inp.ax = b.wp.x; inp.ay = b.wp.y;
        }
        inp.fire = false;
        inp.fire2 = false;
        this.useKit(f, t, dt);
    }

    // Les soutiens restent derrière leurs alliés
    supportGoal(f, fallback) {
        const g = this.game;
        const allies = g.alliesOf(f, false);
        if (!allies.length) return fallback;
        const hurt = allies.filter(a => a.hp < a.maxHp * 0.9).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        const tank = allies.find(a => a.role === 'tank');
        const anchor = hurt || tank || allies[0];
        const p = g.map.point;
        const side = f.team === 'blue' ? -1 : 1;
        const back = Math.atan2(anchor.y - (p.y), anchor.x - (p.x + side * 600));
        return { x: anchor.x - Math.cos(back) * 170, y: anchor.y - Math.sin(back) * 170 };
    }

    leadFor(f, t) {
        // Anticipation simple pour les projectiles lents (grenades, sons)
        const speed = f.heroId === 'kraz' ? 700 : f.heroId === 'tempo' ? 1100 : 0;
        if (!speed || !t.input) return t;
        const d = dist(f, t);
        const k = d / speed;
        const sp = t.kit ? t.kit.speed(t) : 0;
        return { x: t.x + (t.input.mx || 0) * sp * k * 0.6, y: t.y + (t.input.my || 0) * sp * k * 0.6 };
    }

    /* ----- Pouvoirs ----- */

    useKit(f, t, dt) {
        const g = this.game;
        const inp = f.input;
        const d = t ? dist(f, t) : Infinity;
        const enemiesNear = (r, from = f) => g.enemiesOf(f).filter(e => dist(e, from) < r && g.los(from.x, from.y, e.x, e.y)).length;
        const ult = f.ult >= 100;
        switch (f.heroId) {
            case 'gorvald': {
                const bar = f.barrier;
                const threats = g.enemiesOf(f).filter(e => dist(e, f) < 800 && dist(e, f) > 170 && g.los(f.x, f.y, e.x, e.y)).length;
                if (t && d < 150) inp.fire = true;
                else if (threats && bar.hp > 250 && !f.charging) inp.fire2 = true;
                if (t && d < 700 && d > 200 && Math.random() < 0.08) inp.e = true;
                if (t && d < 420 && d > 140 && f.hp > f.maxHp * 0.4 && Math.random() < 0.03) inp.shift = true;
                if (ult && this.coneCount(f, 420, 0.6) >= 2) inp.q = true;
                break;
            }
            case 'volta': {
                if (!f.mech) {
                    if (t && d < 650) inp.fire = true;
                    if (ult) inp.q = true;
                    break;
                }
                const incoming = g.projectiles.some(p => p.team !== f.team && p.eatable && Math.hypot(p.x - f.x, p.y - f.y) < 260);
                if (incoming && f.matrix.meter > 15) inp.fire2 = true;
                else if (t && d < 420) inp.fire = true;
                if (t && d < 450 && Math.random() < 0.06) inp.e = true;
                if (!f.boosting && !t && dist(f, g.map.point) > 900 && Math.random() < 0.05) inp.shift = true;
                if (f.boosting && (t || dist(f, g.map.point) < 300)) inp.shift = true; // on coupe
                if (ult && enemiesNear(380) >= 2) inp.q = true;
                break;
            }
            case 'zephyr': {
                if (t && d < 480) inp.fire = true;
                if (t && f.blinks > 0 && (d > 300 || (f.hp < f.maxHp * 0.6 && Math.random() < 0.15)) && Math.random() < 0.12) inp.shift = true;
                if (f.hp < f.maxHp * 0.4 && f.history.length > 20) inp.e = true;
                if (ult && t && d < 260) inp.q = true;
                break;
            }
            case 'kraz': {
                if (t && d < 760) inp.fire = true;
                const b = f.brain;
                const mine = g.objects.find(o => o.kind === 'mine' && o.owner === f && o.alive && o.flight <= 0);
                if (mine) {
                    b.mineT += dt;
                    if (g.enemiesOf(f).some(e => dist(e, mine) < 110) || b.mineT > 1.5) { inp.fire2Pressed = true; b.mineT = 0; }
                } else if (t && d < 260 && f.mineCharges > 0 && Math.random() < 0.2) {
                    inp.fire2Pressed = true;
                    b.mineT = 0;
                }
                if (!t && g.phase !== 'setup' && dist(f, g.map.point) < 400) {
                    inp.ax = g.map.point.x + rand(-60, 60); inp.ay = g.map.point.y + rand(-60, 60);
                    inp.e = true;
                }
                if (f.tire) {
                    const near = g.enemiesOf(f).sort((a, b2) => dist(a, f.tire) - dist(b2, f.tire))[0];
                    if (near) { inp.ax = near.x; inp.ay = near.y; if (dist(near, f.tire) < 90) inp.firePressed = true; }
                } else if (ult && g.enemiesOf(f).filter(e => dist(e, f) < 900).length >= 2) inp.q = true;
                break;
            }
            case 'seraphine': {
                const allies = g.alliesOf(f, false).filter(a => dist(a, f) < 400 && g.los(f.x, f.y, a.x, a.y));
                const hurt = allies.filter(a => a.hp < a.maxHp * 0.95).sort((a, b2) => a.hp / a.maxHp - b2.hp / b2.maxHp)[0];
                const fighter = allies.find(a => a.role === 'damage' && this.pickTarget(a, 700));
                const beamT = hurt || fighter || null;
                if (beamT) {
                    inp.ax = beamT.x; inp.ay = beamT.y;
                    if (hurt) inp.fire = true; else inp.fire2 = true;
                }
                const anchor = beamT || g.alliesOf(f, false).sort((a, b2) => dist(a, f) - dist(b2, f))[0];
                if (anchor && dist(anchor, f) > 380 && dist(anchor, f) < 450) { inp.ax = anchor.x; inp.ay = anchor.y; inp.shift = true; }
                const soul = g.objects.find(o => o.kind === 'soul' && o.team === f.team && o.alive && dist(o, f) < 200);
                if (soul && !t) inp.e = true;
                if (ult && g.alliesOf(f, false).filter(a => a.hp < a.maxHp * 0.7 && dist(a, f) < 500).length >= 2) inp.q = true;
                break;
            }
            case 'tempo': {
                if (t && d < 600) inp.fire = true;
                if (t && d < 210) inp.fire2Pressed = true;
                const allies = g.alliesOf(f, true).filter(a => dist(a, f) < 280);
                const hurt = allies.filter(a => a.hp < a.maxHp * 0.8).length;
                const wantSpeed = !t && dist(f, g.map.point) > 800 && g.phase !== 'setup';
                if ((wantSpeed && f.track === 'heal') || (!wantSpeed && f.track === 'speed')) inp.shift = true;
                if (hurt >= 2 && f.track === 'heal') inp.e = true;
                if (ult && t && allies.length >= 3 && hurt >= 2) inp.q = true;
                break;
            }
        }
    }

    coneCount(f, range, half) {
        let n = 0;
        this.game.cone(f, range, half, (t) => { if (!t.isTarget) n++; });
        return n;
    }

    /* ----- Déplacement ----- */

    steer(f, dt) {
        const g = this.game;
        const b = f.brain;
        const inp = f.input;
        if (!b.goal) { inp.mx = inp.my = 0; return; }
        b.wpT -= dt;
        if (b.wpT <= 0 || !b.wp) {
            b.wpT = 0.35;
            b.wp = this.nav[f.team].next(f.x, f.y, b.goal.x, b.goal.y, f.r);
        }
        let dx = b.wp.x - f.x, dy = b.wp.y - f.y;
        const l = Math.hypot(dx, dy);
        if (l < 12) { dx = 0; dy = 0; } else { dx /= l; dy /= l; }
        // Pas de côté pendant le combat
        b.strafeT -= dt;
        if (b.strafeT <= 0) { b.strafe *= -1; b.strafeT = rand(0.5, 1.3); }
        if (b.target && f.role !== 'tank') {
            const a = Math.atan2(b.target.y - f.y, b.target.x - f.x);
            const s = l < 40 ? 0.9 : 0.45;
            dx += -Math.sin(a) * b.strafe * s;
            dy += Math.cos(a) * b.strafe * s;
        }
        const n = Math.hypot(dx, dy);
        inp.mx = n > 1 ? dx / n : dx;
        inp.my = n > 1 ? dy / n : dy;
        // Sans cible, on regarde devant soi (sauf si un pouvoir vient de viser quelque part)
        const aiming = inp.e || inp.shift || inp.q || inp.fire2Pressed || f.tire;
        if (!b.target && !f.beam && b.wp && !aiming) { inp.ax = f.x + inp.mx * 100; inp.ay = f.y + inp.my * 100; }
    }
}
