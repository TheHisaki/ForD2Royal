/* ==================================
   NEXUS - MODE ESCORTE (convoi)
   Règles reprises du mode Escorte d'Overwatch :
   - les attaquants proches du convoi le font avancer (plus vite à 2 et à 3 :
     +16,5 % puis +33 %, au-delà de 3 ça ne change plus rien),
   - un seul défenseur à portée suffit à l'arrêter (convoi contesté),
   - 10 s sans attaquant à portée : le convoi recule lentement, mais jamais
     derrière le dernier point de passage atteint,
   - chaque point de passage ajoute du temps et fait avancer les bases,
   - temps écoulé avec un attaquant sur le convoi : PROLONGATION,
   - réapparition en 10 s (13 s pendant la prolongation).
   Partie en 2 manches : chaque équipe attaque une fois. En manche 2, les
   attaquants gagnent dès qu'ils dépassent la distance adverse ; si les deux
   équipes livrent le convoi, celle qui a gardé le plus de temps gagne.
   ================================== */

import { pathAt } from './docks.js?v=1';

export const ESCORT = {
    setup: 25,                  // les attaquants attendent dans leur base
    startTime: 160,             // temps pour atteindre le point de passage A
    checkpointBonus: [80, 70],  // temps ajouté en A, puis en B
    radius: 150,                // portée du convoi
    speed: 58,                  // unités / s avec 1 attaquant (≈ 1/5 de la vitesse d'un héros)
    speedMul: [0, 1, 1.165, 1.33],
    rollbackDelay: 10,
    rollbackSpeed: 30,
    overtimeGrace: 3.5,         // prolongation : temps avant la fin quand plus personne ne pousse
    respawn: 10,
    respawnOvertime: 13,
    roundEndTime: 7,
    body: 46                    // rayon solide du véhicule
};

const other = (t) => (t === 'blue' ? 'red' : 'blue');

export class Escort {
    constructor(game) {
        this.g = game;
        this.map = game.map;
        this.results = [];
        // Comme Overwatch : l'équipe qui attaque en premier est tirée au sort
        this.firstAttack = Math.random() < 0.5 ? 'blue' : 'red';
        this.attack = this.firstAttack;
        this.s = 0;
        this.stage = 0;
        this.pos = pathAt(this.map, 0);
    }

    get defend() { return other(this.attack); }
    get length() { return this.map.pathLength; }
    get progress() { return this.s / this.length; }
    get floor() { return this.stage > 0 ? this.map.checkpoints[this.stage - 1] : 0; }
    get next() { return this.map.checkpoints[Math.min(this.stage, this.map.checkpoints.length - 1)]; }
    // Distance à battre en manche 2 (null en manche 1)
    get target() { return this.results.length === 1 ? this.results[0] : null; }

    roomOf(team) {
        const plan = team === this.attack ? this.map.spawnPlan.attack : this.map.spawnPlan.defend;
        return plan[Math.min(this.stage, plan.length - 1)];
    }

    spotsFor(team) { return this.roomOf(team).spots; }

    applyRooms() {
        const g = this.g;
        g.spawnRooms = { blue: this.roomOf('blue').zone, red: this.roomOf('red').zone };
    }

    startRound(round) {
        const g = this.g;
        this.attack = round % 2 === 1 ? this.firstAttack : other(this.firstAttack);
        this.s = 0;
        this.stage = 0;
        this.timeLeft = ESCORT.startTime;
        this.setupLeft = ESCORT.setup;
        this.idle = 0;
        this.state = 'idle';
        this.overtime = false;
        this.grace = ESCORT.overtimeGrace;
        this.count = { blue: 0, red: 0 };
        this.applyRooms();
        this.place();
        g.phase = 'setup';
        g.lockLeft = this.setupLeft;
        // Pour les bots : l'équipe qui défend « tient » l'objectif
        g.owner = this.defend;
        g.overtime = false;
        g.contested = false;
        g.score = { blue: 0, red: 0 };
        g.progress = { team: null, value: 0 };
    }

    place() {
        this.pos = pathAt(this.map, this.s);
        const p = this.map.point;
        p.x = this.pos.x;
        p.y = this.pos.y;
    }

    respawnTime() { return this.overtime ? ESCORT.respawnOvertime : ESCORT.respawn; }

    inRange(f) {
        return f.alive && Math.hypot(f.x - this.pos.x, f.y - this.pos.y) <= ESCORT.radius;
    }

    // Le véhicule est solide ; les attaquants restent enfermés pendant la préparation
    constrain(f, c) {
        const g = this.g;
        if (g.phase === 'setup' && f.team === this.attack) {
            const z = this.roomOf(f.team).zone;
            c = { x: Math.max(z.x + f.r, Math.min(z.x + z.w - f.r, c.x)), y: Math.max(z.y + f.r, Math.min(z.y + z.h - f.r, c.y)) };
        }
        const dx = c.x - this.pos.x, dy = c.y - this.pos.y;
        const min = ESCORT.body + f.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min) {
            const d = Math.sqrt(d2) || 1;
            const ux = d2 > 1e-6 ? dx / d : 0, uy = d2 > 1e-6 ? dy / d : 1;
            c = { x: this.pos.x + ux * min, y: this.pos.y + uy * min };
        }
        return c;
    }

    update(dt) {
        const g = this.g;
        if (g.phase === 'setup') {
            this.setupLeft -= dt;
            g.lockLeft = Math.max(0, this.setupLeft);
            if (this.setupLeft <= 0) {
                g.phase = 'live';
                g.emit('onPointUnlocked');
            }
            return;
        }
        if (g.phase !== 'live') return;

        const count = { blue: 0, red: 0 };
        for (const f of g.fighters) {
            if (!this.inRange(f)) continue;
            count[f.team]++;
            f.stats.onPoint += dt;
        }
        this.count = count;
        g.count = count;
        const nA = count[this.attack], nD = count[this.defend];
        g.contested = nA > 0 && nD > 0;

        // Déplacement du convoi
        if (nA > 0) {
            this.idle = 0;
            if (nD === 0) {
                this.s = Math.min(this.length, this.s + ESCORT.speed * ESCORT.speedMul[Math.min(3, nA)] * dt);
                this.state = 'push';
            } else this.state = 'contested';
        } else {
            this.idle += dt;
            if (this.idle >= ESCORT.rollbackDelay && this.s > this.floor) {
                this.s = Math.max(this.floor, this.s - ESCORT.rollbackSpeed * dt);
                this.state = 'back';
            } else this.state = nD > 0 ? 'blocked' : 'idle';
        }
        this.place();
        // Pour les bots : « score » de la défense = temps écoulé (urgence de fin)
        g.score[this.defend] = Math.max(0, 100 - this.timeLeft);

        // Points de passage
        if (this.stage < this.map.checkpoints.length && this.s >= this.map.checkpoints[this.stage]) {
            this.stage++;
            if (this.stage >= this.map.checkpoints.length) {
                this.s = this.length;
                this.place();
                this.endRound(true);
                return;
            }
            this.timeLeft += ESCORT.checkpointBonus[this.stage - 1] || 0;
            this.overtime = false;
            g.overtime = false;
            this.applyRooms();
            g.addEffect({ type: 'capture', x: this.pos.x, y: this.pos.y, team: this.attack, r: ESCORT.radius + 40, life: 1.4 });
            g.emit('onCheckpoint', this.attack, this.stage);
        }

        // Manche 2 : dépasser la distance de l'adversaire suffit pour gagner
        const t = this.target;
        if (t && !t.complete && this.s > t.s + 0.5) {
            this.endRound(false);
            return;
        }

        // Temps
        if (!this.overtime) {
            this.timeLeft = Math.max(0, this.timeLeft - dt);
            if (this.timeLeft <= 0) {
                if (nA > 0) {
                    this.overtime = true;
                    g.overtime = true;
                    this.grace = ESCORT.overtimeGrace;
                    g.emit('onOvertime');
                } else this.endRound(false);
            }
        } else {
            // Prolongation : tant qu'un attaquant touche le convoi, ça continue
            if (nA > 0) this.grace = ESCORT.overtimeGrace;
            else this.grace -= dt;
            if (this.grace <= 0) this.endRound(false);
        }
    }

    endRound(complete) {
        const g = this.g;
        const res = { team: this.attack, s: this.s, stage: this.stage, timeLeft: this.timeLeft, complete };
        this.results.push(res);
        this.overtime = false;
        g.overtime = false;
        g.phase = 'roundEnd';
        g.roundEndLeft = ESCORT.roundEndTime;
        if (this.results.length < 2) {
            g.roundWinner = null;
            g.emit('onEscortRoundEnd', res, false);
            return;
        }
        const [a, b] = this.results;
        let winner;
        if (a.complete && b.complete) winner = b.timeLeft > a.timeLeft ? b.team : b.timeLeft < a.timeLeft ? a.team : 'draw';
        else if (Math.abs(b.s - a.s) < 0.5) winner = 'draw';
        else winner = b.s > a.s ? b.team : a.team;
        g.roundWinner = winner;
        g.emit('onEscortRoundEnd', res, true);
        g.phase = 'matchEnd';
        g.winner = winner;
        g.emit('onMatchEnd', winner);
    }

    // Résumé pour l'écran de fin : progression de chaque équipe (0 à 1)
    progressOf(team) {
        const r = this.results.find(x => x.team === team);
        if (r) return r.s / this.length;
        return team === this.attack && this.g.phase !== 'matchEnd' ? this.progress : 0;
    }
}
