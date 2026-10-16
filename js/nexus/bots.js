/* ==================================
   NEXUS - BOTS
   Deux niveaux de décision :
   1. Le « coach » de chaque équipe choisit un plan toutes les 0,5 s :
      se regrouper, pousser, tenir le point, contester (prolongation / point perdu),
      se replier quand l'équipe est en infériorité (pas d'arrivées un par un).
   2. Chaque bot joue son rôle avec sa propre personnalité :
      - tanks : en tête, sur le point, protègent l'équipe,
      - tireurs (Kade, Kraz) : restent à distance sur des positions de tir à couvert,
        reculent quand on les approche,
      - flankers (Zéphyr, Nox) : contournent par le marché (nord) ou le jardin (sud)
        et visent les soutiens adverses,
      - soutiens : derrière le tank, s'éloignent des ennemis qui plongent sur eux.
      Tous se replient pour se soigner quand ils sont très blessés.
   Chaque bot remplit la même entrée qu'un joueur (déplacement, visée, touches).
   ================================== */

import { NavGrid } from './geom.js?v=1';
import { pathAt } from './docks.js?v=1';

const TAU = Math.PI * 2;
const THINK = 0.12;
const COACH = 0.5;

// Distance de combat préférée, imprécision de visée, rôle tactique
const STYLE = {
    gorvald: { range: 95, aimErr: 0.05, arch: 'tank' },
    ragnok: { range: 170, aimErr: 0.06, arch: 'tank' },
    volta: { range: 200, aimErr: 0.08, arch: 'tank', dive: true },
    kodo: { range: 120, aimErr: 0.1, arch: 'tank', dive: true },
    zephyr: { range: 190, aimErr: 0.07, arch: 'flank' },
    nox: { range: 110, aimErr: 0.07, arch: 'flank' },
    kraz: { range: 420, aimErr: 0.06, arch: 'ranged' },
    kade: { range: 480, aimErr: 0.04, arch: 'ranged' },
    seraphine: { range: 230, aimErr: 0.02, arch: 'support' },
    tempo: { range: 220, aimErr: 0.07, arch: 'support' },
    shirin: { range: 520, aimErr: 0.03, arch: 'support', sniper: true },
    vespera: { range: 200, aimErr: 0.04, arch: 'support' }
};

// Seuil de vie sous lequel le bot va se mettre à l'abri
const RETREAT = { tank: 0.22, flank: 0.4, ranged: 0.35, support: 0.38 };

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pick = (l) => l[Math.floor(Math.random() * l.length)];

export class BotBrain {
    constructor(game) {
        this.game = game;
        const g = game;
        const p = g.map.point;
        // Une grille par équipe : la base adverse est interdite
        this.buildNav();
        this.coachT = 0;
        this.teams = {};
        for (const team of ['blue', 'red']) {
            const side = team === 'blue' ? -1 : 1;
            const mx = (x) => (team === 'blue' ? x : g.map.width - x);
            this.teams[team] = {
                side,
                plan: 'group',
                planT: 0,
                followUntil: 0,
                // Point de ralliement : la cour, devant la base
                rally: { x: mx(1050), y: p.y },
                // Couloirs de contournement (nord : marché, sud : jardin et pont)
                flanks: [
                    [{ x: mx(760), y: 330 }, { x: mx(1650), y: 420 }],
                    [{ x: mx(860), y: 1900 }, { x: mx(1650), y: 1760 }]
                ],
                vantage: this.findVantage(team)
            };
        }
        for (const f of g.fighters) if (f.isBot) this.initBrain(f);
        if (g.escort) this.escortContext(true);
    }

    buildNav() {
        const g = this.game;
        this.navRooms = { blue: g.spawnRooms.blue, red: g.spawnRooms.red };
        this.nav = {
            blue: new NavGrid(g.map, [g.spawnRooms.red].filter(Boolean)),
            red: new NavGrid(g.map, [g.spawnRooms.blue].filter(Boolean))
        };
    }

    /* ----- Escorte : repères qui suivent le convoi ----- */

    // Case libre proche d'un point (les repères calculés tombent parfois dans un mur)
    freeNear(team, x, y) {
        const nav = this.nav[team];
        const map = this.game.map;
        x = Math.max(100, Math.min(map.width - 100, x));
        y = Math.max(100, Math.min(map.height - 100, y));
        return nav.center(nav.nearestFree(nav.cellOf(x, y)));
    }

    escortContext(force = false) {
        const g = this.game;
        const e = g.escort;
        // Les bases ont avancé : nouvelles grilles de navigation
        if (g.spawnRooms.blue !== this.navRooms.blue || g.spawnRooms.red !== this.navRooms.red) { this.buildNav(); force = true; }
        const moved = Math.abs(e.s - (this.ctxS ?? -1e9)) > 220;
        const swapped = this.ctxAttack !== e.attack;
        if (!force && !moved && !swapped) return;
        this.ctxS = e.s;
        this.ctxAttack = e.attack;
        const at = (k) => pathAt(g.map, e.s + k);
        for (const team of ['blue', 'red']) {
            const T = this.teams[team];
            const attacking = team === e.attack;
            // La route va d'ouest en est : les attaquants viennent de l'ouest
            T.side = attacking ? -1 : 1;
            const c = attacking ? at(-320) : at(520);
            T.rally = this.freeNear(team, c.x, c.y);
            // Contournements : de part et d'autre de la route, un peu devant le convoi
            T.flanks = [-1, 1].map(sgn => {
                const a = attacking ? at(80) : at(380), b = attacking ? at(380) : at(120);
                const n = (p, off) => this.freeNear(team, p.x - Math.sin(p.angle) * off * sgn, p.y + Math.cos(p.angle) * off * sgn);
                return [n(a, 460), n(b, 300)];
            });
            const center = attacking ? at(0) : at(260);
            T.vantage = this.findVantage(team, center);
            for (const f of g.fighters) if (f.brain && f.team === team) { f.brain.vantage = null; f.brain.flankStep = 0; }
        }
    }

    // Positions de tir : vue sur le point, à distance, de son côté, près d'un abri si possible
    findVantage(team, center = null) {
        const g = this.game;
        const p = center || g.map.point;
        const nav = this.nav[team];
        const side = g.escort ? this.teams[team]?.side ?? -1 : team === 'blue' ? -1 : 1;
        const spots = [];
        const x0 = Math.max(300, p.x - 720), x1 = Math.min(g.map.width - 300, p.x + 720);
        const y0 = Math.max(300, p.y - 720), y1 = Math.min(g.map.height - 300, p.y + 720);
        for (let y = y0; y <= y1; y += 40) {
            for (let x = x0; x <= x1; x += 40) {
                if ((x - p.x) * side < 120) continue; // de notre côté du point
                const d = Math.hypot(x - p.x, y - p.y);
                if (d < 300 || d > 700) continue;
                if (!nav.free[nav.cellOf(x, y)]) continue;
                if (!g.los(x, y, p.x, p.y)) continue;
                // Un abri tout proche (case bloquée à côté) = meilleure position
                let cover = 0;
                for (const [dx, dy] of [[60, 0], [-60, 0], [0, 60], [0, -60]]) if (!nav.free[nav.cellOf(x + dx, y + dy)]) cover++;
                spots.push({ x, y, cover });
            }
        }
        spots.sort((a, b) => b.cover - a.cover);
        // On garde des positions variées (pas toutes collées)
        const keep = [];
        for (const s of spots) {
            if (keep.some(k => Math.hypot(k.x - s.x, k.y - s.y) < 160)) continue;
            keep.push(s);
            if (keep.length >= 10) break;
        }
        return keep.length ? keep : [{ x: p.x + side * 450, y: p.y }];
    }

    initBrain(f) {
        // Personnalité : chaque bot joue un peu différemment
        f.brain = {
            think: Math.random() * THINK, target: null, goal: null, wp: null, wpT: 0,
            strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rand(0.5, 1.4),
            spot: { a: Math.random() * TAU, d: rand(0.25, 0.8) },
            reaction: 0, seen: null, err: 0, errT: 0, mineT: 0,
            aggression: rand(0.35, 1),        // tendance à s'engager
            accuracy: rand(0.75, 1.3),        // multiplicateur d'imprécision
            reactTime: rand(0.18, 0.42),
            patience: rand(0.6, 1.4),         // attend plus ou moins son équipe
            life: 0, flank: null, flankStep: 0, vantage: null, vantageT: 0,
            mode: 'play', modeT: 0, lastHp: f.hp
        };
    }

    update(dt) {
        const g = this.game;
        this.coachT -= dt;
        if (this.coachT <= 0) { this.coachT = COACH; this.coach(); }
        for (const f of g.fighters) {
            if (!f.isBot) continue;
            if (!f.brain) this.initBrain(f);
            const b = f.brain;
            if (!f.alive) {
                f.input.fire = f.input.fire2 = false;
                b.dead = true;
                // Parfois, un bot mort change de héros (même rôle, héros libre)
                if (!b.swapDecided && f.respawnT < 8) {
                    b.swapDecided = true;
                    if (Math.random() < 0.25) {
                        const free = g.swapChoices(f).filter(c => !c.taken && !c.current);
                        if (free.length) g.changeHero(f, pick(free).id);
                    }
                }
                continue;
            }
            if (b.dead) this.newLife(f);
            b.swapDecided = false;
            b.think -= dt;
            if (b.think <= 0) {
                b.think += THINK;
                this.think(f, THINK);
            }
            this.steer(f, dt);
        }
    }

    // À chaque réapparition : nouveau couloir de contournement, nouvelle position de tir
    newLife(f) {
        const b = f.brain;
        b.dead = false;
        b.life++;
        b.flank = Math.random() < 0.5 ? 0 : 1;
        b.flankStep = 0;
        b.vantage = null;
        b.mode = 'play';
        b.spot = { a: Math.random() * TAU, d: rand(0.25, 0.8) };
        b.aggression = Math.max(0.3, Math.min(1, b.aggression + rand(-0.15, 0.15)));
    }

    /* ----- Coach d'équipe ----- */

    coach() {
        const g = this.game;
        if (g.escort) { this.escortContext(); this.coachEscort(); return; }
        for (const team of ['blue', 'red']) {
            const T = this.teams[team];
            const enemy = team === 'blue' ? 'red' : 'blue';
            const ours = g.fighters.filter(f => f.team === team && f.alive).length;
            const theirs = g.fighters.filter(f => f.team === enemy && f.alive).length;
            const enemyScore = g.score?.[enemy] || 0;
            const urgent = g.phase === 'live' && ((g.owner === enemy && (enemyScore >= 85 || g.overtime)) || (g.overtime && g.owner === enemy));
            let plan;
            if (g.phase === 'setup') plan = 'group';
            else if (urgent) plan = 'contest';                 // tout le monde sur le point
            else if (ours <= theirs - 2) plan = 'retreat';     // infériorité nette : on attend les renforts
            else if (g.owner === team) plan = ours >= theirs ? 'hold' : 'defend';
            else if (ours >= 4 || ours >= theirs + 1) plan = 'push';
            else plan = 'group';
            // Après un ultime allié décisif (Fracas, Pneu…), on suit l'engagement
            if (g.time < T.followUntil && plan !== 'retreat') plan = g.owner === team ? 'hold' : 'push';
            if (plan !== T.plan) { T.plan = plan; T.planT = 0; }
            T.planT += COACH;
            T.ours = ours; T.theirs = theirs;
        }
    }

    // Escorte : les attaquants poussent le convoi, les défenseurs se placent devant et le bloquent
    coachEscort() {
        const g = this.game;
        const e = g.escort;
        for (const team of ['blue', 'red']) {
            const T = this.teams[team];
            const enemy = team === 'blue' ? 'red' : 'blue';
            const ours = g.fighters.filter(f => f.team === team && f.alive).length;
            const theirs = g.fighters.filter(f => f.team === enemy && f.alive).length;
            const attacking = team === e.attack;
            let plan;
            if (attacking) {
                const late = g.phase === 'live' && (e.timeLeft < 25 || e.overtime);
                if (g.phase === 'setup') plan = 'group';
                else if (late) plan = 'contest';                        // tout le monde sur le convoi
                else if (ours <= theirs - 2) plan = 'retreat';
                else if (ours >= 4 || ours >= theirs) plan = 'push';
                else plan = 'group';
            } else {
                // Convoi proche du point de passage ou prolongation : on se jette dessus
                const close = g.phase === 'live' && (e.next - e.s < 380 || e.overtime || (e.target && !e.target.complete && e.target.s - e.s < 300));
                if (g.phase === 'setup') plan = 'hold';
                else if (close && ours >= theirs - 1) plan = 'contest';
                else if (ours <= theirs - 2) plan = 'retreat';
                else plan = ours >= theirs ? 'hold' : 'defend';
            }
            if (g.time < T.followUntil && plan !== 'retreat') plan = attacking ? 'push' : 'hold';
            if (plan !== T.plan) { T.plan = plan; T.planT = 0; }
            T.planT += COACH;
            T.ours = ours; T.theirs = theirs;
        }
    }

    /* ----- Décision individuelle ----- */

    // Ennemi visible le plus intéressant selon le rôle du bot
    pickTarget(f, range) {
        const g = this.game;
        const st = STYLE[f.heroId];
        let best = null, score = -Infinity;
        for (const t of g.targetsFor(f.team)) {
            if (t.isTarget && t.kind !== 'tire') continue;
            const d = dist(f, t);
            if (d > range) continue;
            if (!g.los(f.x, f.y, t.x, t.y)) continue;
            let s = -d;
            if (!t.isTarget) s += (1 - t.hp / t.maxHp) * 260;       // achever les blessés
            if (t.kind === 'tire') s += 500;                        // le pneu doit être abattu vite
            if (g.onPoint(t)) s += 120;
            if (t.role === 'support') s += st.arch === 'flank' || st.dive ? 320 : 70;
            if (t.role === 'tank' && st.arch !== 'tank') s -= 90;   // on évite de « tirer dans le tank »
            if (t === f.brain?.target) s += 80;                     // on garde sa cible (le joueur n'a pas de « cerveau »)
            if (t.sleep > 0) s -= 400;                              // ne pas réveiller un endormi
            if (s > score) { score = s; best = t; }
        }
        return best;
    }

    pointSpot(f) {
        const p = this.game.map.point;
        const s = f.brain.spot;
        return { x: p.x + Math.cos(s.a) * p.r * s.d, y: p.y + Math.sin(s.a) * p.r * s.d };
    }

    // Position voulue selon le plan de l'équipe et le rôle
    objective(f, T) {
        const g = this.game;
        const p = g.map.point;
        const st = STYLE[f.heroId];
        const b = f.brain;
        const side = T.side;
        const ally = (role) => g.alliesOf(f, false).find(a => a.role === role);

        if (T.plan === 'group' || T.plan === 'retreat') {
            // On se regroupe hors de vue, de son côté
            const r = T.rally;
            return { x: r.x + Math.cos(b.spot.a) * 140, y: r.y + Math.sin(b.spot.a) * 260 };
        }
        if (T.plan === 'contest') return this.pointSpot(f);

        switch (st.arch) {
            case 'tank': {
                // En tête, un peu du côté adverse du point quand on pousse
                const s = this.pointSpot(f);
                if (T.plan === 'push') return { x: s.x - side * 60, y: s.y };
                return { x: (s.x + p.x) / 2, y: (s.y + p.y) / 2 };
            }
            case 'ranged': {
                return this.vantageSpot(f, T);
            }
            case 'flank': {
                // Contournement par un couloir, puis on arrive par le côté du point
                const route = T.flanks[b.flank ?? 0];
                if (T.plan === 'push' && b.flankStep < route.length) {
                    const wp = route[b.flankStep];
                    if (dist(f, wp) < 120) b.flankStep++;
                    return wp;
                }
                return this.pointSpot(f);
            }
            case 'support': {
                if (st.sniper) return this.vantageSpot(f, T);
                const tank = ally('tank');
                const anchor = tank || g.alliesOf(f, false).sort((a, c) => dist(a, p) - dist(c, p))[0];
                if (!anchor) return T.rally;
                // Derrière le tank, côté base
                return { x: anchor.x + side * 190 + Math.cos(b.spot.a) * 40, y: anchor.y + Math.sin(b.spot.a) * 110 };
            }
        }
        return this.pointSpot(f);
    }

    vantageSpot(f, T) {
        const b = f.brain;
        b.vantageT -= THINK;
        // On change de position de tir de temps en temps (on ne reste pas prévisible)
        if (!b.vantage || b.vantageT <= 0) {
            const taken = this.game.fighters.filter(o => o !== f && o.brain?.vantage).map(o => o.brain.vantage);
            const free = T.vantage.filter(v => !taken.includes(v));
            b.vantage = pick(free.length ? free.slice(0, 6) : T.vantage);
            b.vantageT = rand(7, 14);
        }
        return b.vantage;
    }

    think(f, dt) {
        const g = this.game;
        const b = f.brain;
        const st = STYLE[f.heroId];
        const T = this.teams[f.team];
        const inp = f.input;

        // Perception (avec temps de réaction humain)
        const enemy = this.pickTarget(f, st.arch === 'ranged' || st.sniper ? 1100 : 900);
        if (enemy !== b.seen) { b.seen = enemy; b.reaction = b.reactTime; }
        b.reaction = Math.max(0, b.reaction - dt);
        // Escorte : trêve pendant la préparation, on se place sans tirer
        b.target = b.reaction <= 0 && !g.truce?.() ? enemy : null;
        b.errT -= dt;
        if (b.errT <= 0) { b.errT = rand(0.3, 0.7); b.err = rand(-1, 1) * st.aimErr * b.accuracy; }

        const t = b.target;
        const hp = f.hp / f.maxHp;
        const d = t ? dist(f, t) : Infinity;
        const tookBurst = b.lastHp - f.hp > f.maxHp * 0.18;
        b.lastHp = f.hp;

        // --- Mode : se mettre à l'abri quand on est très blessé ---
        b.modeT -= dt;
        if (b.mode === 'play' && hp < RETREAT[st.arch] && T.plan !== 'contest' && g.phase !== 'setup') {
            b.mode = 'heal';
            b.modeT = rand(2.5, 4);
        } else if (b.mode === 'heal' && (hp > 0.8 || b.modeT <= -6 || T.plan === 'contest')) {
            b.mode = 'play';
        }
        // Tireurs et soutiens : petit recul après une grosse rafale (on casse la ligne de vue)
        if (b.mode === 'play' && tookBurst && (st.arch === 'ranged' || st.arch === 'support') && Math.random() < 0.6) {
            b.mode = 'peek';
            b.modeT = rand(0.7, 1.3);
        } else if (b.mode === 'peek' && b.modeT <= 0) b.mode = 'play';

        let goal = this.objective(f, T);

        if (b.mode === 'heal') {
            // Vers un soutien allié, sinon vers le ralliement (récupération passive)
            const sup = g.alliesOf(f, false).filter(a => a.role === 'support').sort((a, c) => dist(a, f) - dist(c, f))[0];
            goal = sup && dist(sup, f) < 900 ? { x: sup.x + T.side * 60, y: sup.y } : T.rally;
        } else if (b.mode === 'peek' && t) {
            // Recule hors de la ligne de vue de la cible
            const a = Math.atan2(f.y - t.y, f.x - t.x) + b.strafe * 0.9;
            goal = { x: f.x + Math.cos(a) * 160, y: f.y + Math.sin(a) * 160 };
        } else if (t && g.phase !== 'setup' && T.plan !== 'group' && T.plan !== 'retreat') {
            goal = this.combatGoal(f, t, goal, T, d);
        }
        b.goal = goal;

        // Visée : la cible (avec anticipation), sinon là où on va
        if (t) {
            const lead = this.leadFor(f, t);
            const a = Math.atan2(lead.y - f.y, lead.x - f.x) + b.err;
            const dd = dist(f, lead);
            inp.ax = f.x + Math.cos(a) * dd;
            inp.ay = f.y + Math.sin(a) * dd;
        } else if (b.wp) {
            inp.ax = b.wp.x; inp.ay = b.wp.y;
        }
        inp.fire = false;
        inp.fire2 = false;
        this.useKit(f, t, dt);
        // Retraite : les tanks gardent leur bouclier / matrice levés en reculant
        if (b.mode === 'heal' && f.heroId === 'gorvald' && t && f.barrier.hp > 200) inp.fire2 = true;
    }

    // Position de combat : à bonne distance de la cible, sans trop s'éloigner de l'objectif
    combatGoal(f, t, goal, T, d) {
        const g = this.game;
        const st = STYLE[f.heroId];
        const b = f.brain;
        const range = st.range;
        const away = Math.atan2(f.y - t.y, f.x - t.x);
        switch (st.arch) {
            case 'ranged': {
                // Garde ses distances : recule si on l'approche, sinon tire depuis sa position
                if (d < range * 0.6) return { x: f.x + Math.cos(away) * 220, y: f.y + Math.sin(away) * 220 };
                if (d > range * 1.4 && b.aggression > 0.6) return { x: t.x + Math.cos(away) * range, y: t.y + Math.sin(away) * range };
                return goal;
            }
            case 'support': {
                // Un ennemi plonge dessus : s'éloigne vers ses alliés
                if (d < 220) {
                    const tank = g.alliesOf(f, false).find(a => a.role === 'tank');
                    if (tank) return { x: tank.x + T.side * 80, y: tank.y };
                    return { x: f.x + Math.cos(away) * 200, y: f.y + Math.sin(away) * 200 };
                }
                if (st.sniper && d < range * 0.6) return { x: f.x + Math.cos(away) * 200, y: f.y + Math.sin(away) * 200 };
                return goal;
            }
            case 'flank': {
                // Attend que l'équipe soit engagée avant de plonger (sauf bot agressif)
                const busy = g.alliesOf(f, false).some(a => a.role === 'tank' && g.onPoint(a)) || T.plan === 'contest';
                if (!busy && b.aggression < 0.7 && t.role !== 'support' && d > 300) return goal;
                return { x: t.x + Math.cos(away) * range, y: t.y + Math.sin(away) * range };
            }
            case 'tank': {
                // Ne poursuit pas trop loin du point
                const near = dist(t, g.map.point) < g.map.point.r + 450 * b.aggression + 150;
                if (!near && d > range * 1.6) return goal;
                const target = st.dive ? (g.enemiesOf(f).filter(e => e.role === 'support' && dist(e, f) < 600)[0] || t) : t;
                const a = Math.atan2(f.y - target.y, f.x - target.x);
                return { x: target.x + Math.cos(a) * range, y: target.y + Math.sin(a) * range };
            }
        }
        return goal;
    }

    leadFor(f, t) {
        // Anticipation pour les projectiles (grenades, sons, fléchettes, roquettes)
        const speed = { kraz: 700, tempo: 1100, shirin: 2400, kade: 0 }[f.heroId] || 0;
        if (!speed || !t.input) return t;
        const d = dist(f, t);
        const k = d / speed;
        const sp = t.kit ? t.kit.speed(t) : 0;
        return { x: t.x + (t.input.mx || 0) * sp * k * 0.7, y: t.y + (t.input.my || 0) * sp * k * 0.7 };
    }

    /* ----- Pouvoirs ----- */

    useKit(f, t, dt) {
        const g = this.game;
        const inp = f.input;
        const b = f.brain;
        const T = this.teams[f.team];
        const d = t ? dist(f, t) : Infinity;
        const enemiesNear = (r, from = f) => g.enemiesOf(f).filter(e => dist(e, from) < r && g.los(from.x, from.y, e.x, e.y)).length;
        const ult = f.ult >= 100;
        // Les bots patients gardent leur ultime pour un meilleur moment
        const ultOk = ult && (T.plan !== 'group' || T.plan === 'contest');
        // Un ultime d'engagement prépare la suite : l'équipe suit pendant 4 s
        const engage = () => { T.followUntil = g.time + 4; };
        switch (f.heroId) {
            case 'gorvald': {
                const bar = f.barrier;
                const threats = g.enemiesOf(f).filter(e => dist(e, f) < 800 && dist(e, f) > 170 && g.los(f.x, f.y, e.x, e.y)).length;
                if (t && d < 150) inp.fire = true;
                else if (threats && bar.hp > 250 && !f.charging) inp.fire2 = true;
                if (t && d < 700 && d > 200 && Math.random() < 0.08) inp.e = true;
                if (t && d < 420 && d > 140 && f.hp > f.maxHp * 0.5 && Math.random() < 0.03 * b.aggression) inp.shift = true;
                if (ultOk && this.coneCount(f, 420, 0.6) >= 2) { inp.q = true; engage(); }
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
                if (ultOk && enemiesNear(380) >= 2) { inp.q = true; engage(); }
                break;
            }
            case 'zephyr': {
                if (t && d < 480) inp.fire = true;
                if (t && f.blinks > 0 && (d > 300 || (f.hp < f.maxHp * 0.6 && Math.random() < 0.15)) && Math.random() < 0.12) inp.shift = true;
                if (f.hp < f.maxHp * 0.4 && f.history.length > 20) inp.e = true;
                if (ultOk && t && d < 260) inp.q = true;
                break;
            }
            case 'kraz': {
                if (t && d < 760) inp.fire = true;
                const mine = g.objects.find(o => o.kind === 'mine' && o.owner === f && o.alive && o.flight <= 0);
                if (mine) {
                    b.mineT += dt;
                    if (g.enemiesOf(f).some(e => dist(e, mine) < 110) || b.mineT > 1.5) { inp.fire2Pressed = true; b.mineT = 0; }
                } else if (t && d < 260 && f.mineCharges > 0 && Math.random() < 0.2) {
                    inp.fire2Pressed = true;
                    b.mineT = 0;
                }
                if (!t && g.phase !== 'setup' && dist(f, g.map.point) < 500) {
                    inp.ax = g.map.point.x + rand(-60, 60); inp.ay = g.map.point.y + rand(-60, 60);
                    inp.e = true;
                }
                if (f.tire) {
                    const near = g.enemiesOf(f).sort((a, b2) => dist(a, f.tire) - dist(b2, f.tire))[0];
                    if (near) { inp.ax = near.x; inp.ay = near.y; if (dist(near, f.tire) < 90) inp.firePressed = true; }
                } else if (ultOk && g.enemiesOf(f).filter(e => dist(e, f) < 900).length >= 2) { inp.q = true; engage(); }
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
                // Envol : vers un allié pour fuir un plongeur, ou rejoindre l'équipe
                const anchor = beamT || g.alliesOf(f, false).sort((a, b2) => dist(a, f) - dist(b2, f))[0];
                if (anchor && ((dist(anchor, f) > 380 && dist(anchor, f) < 450) || (t && d < 200))) { inp.ax = anchor.x; inp.ay = anchor.y; inp.shift = true; }
                const soul = g.objects.find(o => o.kind === 'soul' && o.team === f.team && o.alive && dist(o, f) < 200);
                if (soul && (!t || d > 400)) inp.e = true;
                if (ultOk && g.alliesOf(f, false).filter(a => a.hp < a.maxHp * 0.7 && dist(a, f) < 500).length >= 2) inp.q = true;
                break;
            }
            case 'tempo': {
                if (t && d < 600) inp.fire = true;
                if (t && d < 210) inp.fire2Pressed = true;
                const allies = g.alliesOf(f, true).filter(a => dist(a, f) < 280);
                const hurt = allies.filter(a => a.hp < a.maxHp * 0.8).length;
                const wantSpeed = (!t && dist(f, g.map.point) > 800 && g.phase !== 'setup') || T.plan === 'contest' && dist(f, g.map.point) > 500;
                if ((wantSpeed && f.track === 'heal') || (!wantSpeed && f.track === 'speed')) inp.shift = true;
                if (hurt >= 2 && f.track === 'heal') inp.e = true;
                if (ultOk && t && allies.length >= 3 && hurt >= 2) inp.q = true;
                break;
            }
            case 'ragnok': {
                if (t && d < 360) inp.fire = true;
                // Crochet sur une cible isolée et fragile en priorité
                if (t && d > 220 && d < 700 && (t.role !== 'tank' || Math.random() < 0.3) && Math.random() < 0.06) inp.shift = true;
                if (f.hp < f.maxHp * 0.45 && f.cd.e <= 0) inp.e = true;
                if (ultOk && this.coneCount(f, 500, 0.45) >= 2) { inp.q = true; engage(); }
                break;
            }
            case 'kodo': {
                if (t && d < 260) inp.fire = true;
                const back = g.enemiesOf(f).find(e => e.role === 'support' && dist(e, f) < 460 && dist(e, f) > 180 && g.los(f.x, f.y, e.x, e.y));
                const jump = back || (t && d > 200 && d < 460 ? t : null);
                if (jump && Math.random() < 0.06 * b.aggression + 0.02) { inp.ax = jump.x; inp.ay = jump.y; inp.shift = true; }
                if (t && f.hp < f.maxHp * 0.7 && enemiesNear(600) >= 2) inp.e = true;
                if (f.ultActive && t) inp.fire = d < 180;
                if (ultOk && f.hp < f.maxHp * 0.5 && t) inp.q = true;
                break;
            }
            case 'kade': {
                if (t && d < 950) inp.fire = true;
                if (t && d < 700 && Math.random() < 0.05) inp.fire2Pressed = true;
                const hurt = g.alliesOf(f, true).filter(a => dist(a, f) < 170 && a.hp < a.maxHp * 0.7).length;
                if (hurt >= 1 && f.hp < f.maxHp * 0.8) inp.e = true;
                if (!t && !f.sprinting && g.phase !== 'setup' && dist(f, b.goal || g.map.point) > 500) inp.shift = true;
                if (ultOk && enemiesNear(800) >= 2) inp.q = true;
                break;
            }
            case 'nox': {
                if (t && d < 320) inp.fire = true;
                if (f.hp < f.maxHp * 0.3 && t) inp.shift = true;
                // Pas de l'ombre derrière les soutiens adverses
                const back = g.enemiesOf(f).find(e => e.role === 'support' && dist(e, f) > 350 && dist(e, f) < 600);
                if (back && T.plan !== 'group' && Math.random() < 0.02) { inp.ax = back.x; inp.ay = back.y; inp.e = true; }
                if (ultOk && enemiesNear(240) >= 2) inp.q = true;
                break;
            }
            case 'shirin': {
                // Soigne en priorité un allié blessé visible, sinon tire sur l'ennemi
                const hurt = g.alliesOf(f, false).filter(a => a.hp < a.maxHp * 0.85 && dist(a, f) < 1200 && g.los(f.x, f.y, a.x, a.y))
                    .sort((a, b2) => a.hp / a.maxHp - b2.hp / b2.maxHp)[0];
                if (hurt) { inp.ax = hurt.x; inp.ay = hurt.y; inp.fire = true; }
                else if (t) inp.fire = true;
                // Fléchette : sur un ennemi dangereux (ultime, charge, plongeur proche)
                const diver = g.enemiesOf(f).find(e => dist(e, f) < 300 && g.los(f.x, f.y, e.x, e.y));
                const danger = t && (t.ultActive || t.charging || t.boosting || t.tire) ? t : diver;
                if (danger && dist(danger, f) < 600 && f.cd.shift <= 0) { inp.ax = danger.x; inp.ay = danger.y; inp.shift = true; }
                const group = t ? g.fighters.filter(o => o.alive && dist(o, t) < 140).length : 0;
                if (t && d < 650 && group >= 2 && Math.random() < 0.1) { inp.ax = t.x; inp.ay = t.y; inp.e = true; }
                if (ultOk) {
                    const dps = g.alliesOf(f, false).find(a => (a.role === 'damage' || a.role === 'tank') && dist(a, f) < 700 && this.pickTarget(a, 600));
                    if (dps) { inp.ax = dps.x; inp.ay = dps.y; inp.q = true; }
                }
                break;
            }
            case 'vespera': {
                const allies = g.alliesOf(f, false).filter(a => dist(a, f) < 230 && g.los(f.x, f.y, a.x, a.y));
                const hurt = allies.filter(a => a.hp < a.maxHp * 0.9).sort((a, b2) => a.hp / a.maxHp - b2.hp / b2.maxHp)[0];
                if (hurt && f.energy > 5) { inp.ax = hurt.x; inp.ay = hurt.y; inp.fire = true; }
                else if (t && d < 420) inp.fire2 = true;
                if ((f.hp < f.maxHp * 0.35 && t) || (t && d < 160 && Math.random() < 0.2)) inp.shift = true;
                if (g.alliesOf(f, false).some(a => a.hp < a.maxHp * 0.7 && dist(a, f) < 400)) inp.e = true;
                if (ultOk && (t || g.alliesOf(f, false).filter(a => a.hp < a.maxHp * 0.6).length >= 2)) inp.q = true;
                if (f.ultActive) {
                    const low = g.alliesOf(f, false).sort((a, b2) => a.hp / a.maxHp - b2.hp / b2.maxHp)[0];
                    const aimAt = t || low;
                    if (aimAt) { inp.ax = aimAt.x; inp.ay = aimAt.y; }
                }
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
        const b = f.brain;
        const inp = f.input;
        const st = STYLE[f.heroId];
        if (!b.goal) { inp.mx = inp.my = 0; return; }
        b.wpT -= dt;
        if (b.wpT <= 0 || !b.wp) {
            b.wpT = 0.3;
            b.wp = this.nav[f.team].next(f.x, f.y, b.goal.x, b.goal.y, f.r);
        }
        let dx = b.wp.x - f.x, dy = b.wp.y - f.y;
        const l = Math.hypot(dx, dy);
        if (l < 16) { dx = 0; dy = 0; } else { dx /= l; dy /= l; }
        // Pas de côté pendant le combat (rythme irrégulier, propre à chaque bot)
        b.strafeT -= dt;
        if (b.strafeT <= 0) { b.strafe *= -1; b.strafeT = rand(0.35, 1.4); }
        if (b.target && st.arch !== 'tank') {
            const a = Math.atan2(b.target.y - f.y, b.target.x - f.x);
            const s = l < 40 ? 0.85 : 0.4;
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
