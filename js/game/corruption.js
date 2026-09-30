/* ==================================
   LA CORRUPTION - FOR2D ROYAL
   Équivalent de la tempête de Fortnite : la carte est corrompue petit à petit,
   par cercles successifs qui rétrécissent. Hors de la zone saine, on perd de la vie
   (le bouclier ne protège pas), et de plus en plus au fil de la partie.
   ================================== */

import { WORLD_SIZE, isWater } from './config.js';
import { sampleGround } from './world.js';

/* ===================== RÉGLAGES ===================== */

// Rayon de départ : couvre toute l'île, coins compris (demi-diagonale de 6000 ≈ 4243)
const START_RADIUS = 4400;

/*
   Une ligne par phase :
   - wait   : secondes d'attente, la zone suivante est annoncée (compte à rebours)
   - shrink : secondes pendant lesquelles la corruption avance
   - r      : rayon de la zone saine à la fin de la phase (0 = tout est corrompu)
   - dps    : dégâts par seconde hors zone pendant la phase
   Total ≈ 195 s d'attente + 172 s d'avancée ≈ 6 min 07.
*/
const PHASES = [
    { wait: 45, shrink: 40, r: 2400, dps: 1 },
    { wait: 40, shrink: 35, r: 1500, dps: 2 },
    { wait: 35, shrink: 30, r: 950,  dps: 4 },
    { wait: 30, shrink: 25, r: 550,  dps: 6 },
    { wait: 25, shrink: 22, r: 250,  dps: 8 },
    { wait: 20, shrink: 20, r: 0,    dps: 10 }
];
const DONE_DPS = 12;          // dégâts par seconde une fois la zone finale fermée
const DPS_BONUS_EVERY = 90;   // +1 dégât par seconde toutes les 90 s de partie
const TICK = 1;               // un tick de dégâts par seconde et par combattant

// Choix du centre de la zone suivante
const CENTER_TRIES = 16;      // essais pour trouver un centre sur la terre ferme
const ISLAND_MIN = 900;       // on préfère un centre dans cette bande (pas au large)
const ISLAND_MAX = WORLD_SIZE - 900;

/* ----- Rendu (tout est en unités monde) ----- */
// Voile léger : la carte elle-même est déjà recolorée (renderer + corrupt-look.js)
const FILL_COLOR = 'rgba(24, 0, 40, 0.22)';
const EDGE_MARGIN = 40;       // demi-épaisseur max de l'anneau lumineux (pour le culling)
const VIEW_PAD = 30;          // la vue est un peu agrandie (tremblement de caméra)
const CELL = 300;             // grille de la texture animée (une tache par case)
const MAX_CELLS = 110;        // nombre max de cases de texture par image
const SPARK_STEP = 55;        // une flammèche tous les 55 unités de bord
const MAX_SPARKS = 90;
const SPARK_RISE = 70;        // hauteur de montée d'une flammèche

const TAU = Math.PI * 2;

/* ===================== OUTILS ===================== */

// Petit hachage entier → [0, 1) (texture stable, sans Math.random à chaque image)
function hash(n) {
    n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    n ^= n >>> 13;
    n = Math.imul(n, 0xc2b2ae35);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
}

const hash2 = (i, j, k) => hash(Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(k, 83492791));

// Transition douce 0 → 1 (lente au début et à la fin)
const easeInOut = (t) => (1 - Math.cos(Math.PI * t)) / 2;

/*
   Portion d'angle du cercle (cx, cy, r) susceptible d'être dans le rectangle de vue.
   Renvoie null si le cercle ne touche pas la vue, sinon [a0, a1] (a1 > a0).
   Si le centre est dans la vue : cercle entier.
*/
function visibleArc(cx, cy, r, minX, minY, maxX, maxY) {
    // Distance du centre au rectangle
    const nx = cx < minX ? minX : cx > maxX ? maxX : cx;
    const ny = cy < minY ? minY : cy > maxY ? maxY : cy;
    const dNear = Math.hypot(cx - nx, cy - ny);
    if (dNear > r) return null; // cercle entièrement hors de la vue
    // Coin le plus éloigné : si même lui est dans le cercle, le bord n'est pas visible
    const fx = Math.max(Math.abs(cx - minX), Math.abs(cx - maxX));
    const fy = Math.max(Math.abs(cy - minY), Math.abs(cy - maxY));
    if (Math.hypot(fx, fy) < r) return null;
    if (dNear === 0) return [0, TAU];

    // Centre hors de la vue : le rectangle est vu sous un angle < PI depuis le centre.
    // On prend l'écart min / max des 4 coins par rapport à la direction du milieu de la vue.
    const base = Math.atan2((minY + maxY) / 2 - cy, (minX + maxX) / 2 - cx);
    let lo = 0;
    let hi = 0;
    const corners = [minX, minY, maxX, minY, minX, maxY, maxX, maxY];
    for (let i = 0; i < 8; i += 2) {
        let d = Math.atan2(corners[i + 1] - cy, corners[i] - cx) - base;
        if (d > Math.PI) d -= TAU;
        if (d < -Math.PI) d += TAU;
        if (d < lo) lo = d;
        if (d > hi) hi = d;
    }
    return [base + lo, base + hi];
}

/* ===================== CLASSE ===================== */

export class Corruption {
    constructor(world) {
        this.world = world;
        this.phaseCount = PHASES.length;
        this.state = 'idle';
        this.phase = 0;
        this.cur = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, r: START_RADIUS };
        this.next = null;
        this.timeLeft = 0;
        this.dps = PHASES[0].dps;
        this.elapsed = 0;
        this.onEvent = null;      // callback optionnel (type, data)

        this._from = { x: this.cur.x, y: this.cur.y, r: this.cur.r }; // cercle au début de l'avancée
        this._timers = new WeakMap(); // minuteur de tick par combattant
        // Tableaux de travail du rendu, réutilisés à chaque image (pas d'allocation)
        this._veins = [];
        this._sparks = [[], [], []];
    }

    /* ----- Déroulement ----- */

    start() {
        if (this.state !== 'idle') return;
        this.elapsed = 0;
        this.phase = 1;
        this._announce();
    }

    // Début d'une phase : la zone suivante est annoncée
    _announce() {
        const p = PHASES[this.phase - 1];
        this.state = 'wait';
        this.next = this._pickNext(p.r);
        this.timeLeft += p.wait; // += : garde le petit reste de l'image précédente
        if (this.timeLeft <= 0) this.timeLeft = p.wait;
        this._emit('warn', { phase: this.phase, next: this.next, time: p.wait });
    }

    // Prochaine zone : entièrement dans l'actuelle, de préférence sur la terre ferme
    _pickNext(r) {
        const c = this.cur;
        const room = Math.max(0, c.r - r); // distance max entre les deux centres
        let fallback = null;
        for (let i = 0; i < CENTER_TRIES; i++) {
            const a = Math.random() * TAU;
            const d = Math.sqrt(Math.random()) * room; // répartition uniforme dans le disque
            const x = c.x + Math.cos(a) * d;
            const y = c.y + Math.sin(a) * d;
            if (!fallback) fallback = { x, y, r };
            const onIsland = x > ISLAND_MIN && x < ISLAND_MAX && y > ISLAND_MIN && y < ISLAND_MAX;
            if (onIsland && !isWater(sampleGround(x, y).biome)) return { x, y, r };
        }
        return fallback; // quelques essais ratés : on accepte le premier
    }

    _advance() {
        if (this.state === 'wait') {
            // La corruption se met à avancer
            const p = PHASES[this.phase - 1];
            this.state = 'shrink';
            this._from.x = this.cur.x;
            this._from.y = this.cur.y;
            this._from.r = this.cur.r;
            this.timeLeft += p.shrink;
            if (this.timeLeft <= 0) this.timeLeft = p.shrink;
            this._emit('shrink', { phase: this.phase, next: this.next, time: p.shrink });
        } else if (this.state === 'shrink') {
            // Zone suivante atteinte
            this.cur.x = this.next.x;
            this.cur.y = this.next.y;
            this.cur.r = this.next.r;
            if (this.phase < this.phaseCount) {
                this.phase++;
                this._announce();
            } else {
                this.state = 'done';
                this.next = null;
                this.timeLeft = 0;
                this._emit('done', { phase: this.phase });
            }
        }
    }

    _emit(type, data) {
        this.onEvent?.(type, data);
    }

    update(dt, fighters, combat) {
        if (this.state === 'idle') return;
        this.elapsed += dt;

        if (this.state !== 'done') {
            this.timeLeft -= dt;
            // "while" : un gros dt ne saute pas d'étape (au pire plusieurs à la même image)
            while (this.timeLeft <= 0 && this.state !== 'done') this._advance();
            if (this.state === 'shrink') {
                const total = PHASES[this.phase - 1].shrink;
                const e = easeInOut(Math.min(1, Math.max(0, 1 - this.timeLeft / total)));
                const f = this._from;
                const n = this.next;
                this.cur.x = f.x + (n.x - f.x) * e;
                this.cur.y = f.y + (n.y - f.y) * e;
                this.cur.r = f.r + (n.r - f.r) * e;
            }
        }

        const base = this.state === 'done' ? DONE_DPS : PHASES[this.phase - 1].dps;
        this.dps = base + Math.floor(this.elapsed / DPS_BONUS_EVERY);

        if (fighters) this._hurt(dt, fighters, combat);
    }

    // Un tick par seconde et par combattant hors zone (au sol ou en l'air, pas dans le vaisseau)
    _hurt(dt, fighters, combat) {
        const timers = this._timers;
        for (let i = 0; i < fighters.length; i++) {
            const f = fighters[i];
            if (!f.alive || f.phase === 'ship') continue;
            let t = timers.get(f);
            // Décalage au hasard : tout le monde ne prend pas ses dégâts à la même image
            if (t === undefined) t = Math.random() * TICK;
            t -= dt;
            if (t <= 0) {
                t += TICK;
                if (t <= 0) t = TICK;
                if (!this.isSafe(f.x, f.y)) {
                    combat?.damage(f, this.dps, null, 'corruption', { ignoreShield: true });
                }
            }
            timers.set(f, t);
        }
    }

    /* ----- Requêtes ----- */

    isSafe(x, y) {
        const dx = x - this.cur.x;
        const dy = y - this.cur.y;
        return dx * dx + dy * dy < this.cur.r * this.cur.r;
    }

    depth(x, y) {
        return Math.max(0, Math.hypot(x - this.cur.x, y - this.cur.y) - this.cur.r);
    }

    /* ===================== RENDU ===================== */

    // Coordonnées monde (ctx déjà transformé par la caméra), v = bornes de la vue
    drawWorld(ctx, v, time) {
        if (this.state === 'idle') return;
        const minX = v.minX - VIEW_PAD;
        const minY = v.minY - VIEW_PAD;
        const maxX = v.maxX + VIEW_PAD;
        const maxY = v.maxY + VIEW_PAD;
        const { x: cx, y: cy, r } = this.cur;

        // Où est la vue par rapport au cercle ?
        const nx = cx < minX ? minX : cx > maxX ? maxX : cx;
        const ny = cy < minY ? minY : cy > maxY ? maxY : cy;
        const near = Math.hypot(cx - nx, cy - ny);
        const fx = Math.max(Math.abs(cx - minX), Math.abs(cx - maxX));
        const fy = Math.max(Math.abs(cy - minY), Math.abs(cy - maxY));
        const far = Math.hypot(fx, fy);
        const allInside = far < r - EDGE_MARGIN;    // vue entièrement saine
        const allOutside = near > r + EDGE_MARGIN;  // vue entièrement corrompue

        ctx.save();
        if (!allInside) {
            // 1) Voile violet sombre : rectangle de vue moins le cercle (un seul chemin)
            ctx.beginPath();
            ctx.rect(minX, minY, maxX - minX, maxY - minY);
            if (!allOutside && r > 0) {
                ctx.moveTo(cx + r, cy);
                ctx.arc(cx, cy, r, 0, TAU);
            }
            ctx.fillStyle = FILL_COLOR;
            ctx.fill('evenodd');

            // 2) Texture animée (taches et veines qui dérivent)
            this._drawTexture(ctx, minX, minY, maxX, maxY, cx, cy, r, time);

            // 3) Bord lumineux + flammèches
            if (!allOutside && r > 0) this._drawEdge(ctx, minX, minY, maxX, maxY, cx, cy, r, time);
        }

        // 4) Prochaine zone : cercle blanc en pointillés
        const n = this.next;
        if (n && n.r > 0) {
            const arc = visibleArc(n.x, n.y, n.r, minX, minY, maxX, maxY);
            if (arc) {
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.r, arc[0], arc[1]);
                ctx.setLineDash([26, 18]);
                ctx.lineDashOffset = -time * 24;
                ctx.lineCap = 'butt';
                ctx.strokeStyle = 'rgba(20, 0, 30, 0.45)';
                ctx.lineWidth = 7;
                ctx.stroke();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.lineWidth = 3.5;
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        ctx.restore();
    }

    // Une tache (et parfois une veine) par case de grille visible, seulement hors du cercle
    _drawTexture(ctx, minX, minY, maxX, maxY, cx, cy, r, time) {
        let i0 = Math.floor(minX / CELL);
        let j0 = Math.floor(minY / CELL);
        const i1 = Math.floor(maxX / CELL);
        const j1 = Math.floor(maxY / CELL);
        // Nombre de cases borné : au besoin, on n'en prend qu'une sur "stride"
        const count = (i1 - i0 + 1) * (j1 - j0 + 1);
        const stride = count > MAX_CELLS ? Math.ceil(Math.sqrt(count / MAX_CELLS)) : 1;
        if (stride > 1) {
            i0 -= ((i0 % stride) + stride) % stride; // grille stable quand la vue bouge
            j0 -= ((j0 % stride) + stride) % stride;
        }
        const cellR = CELL * stride * 0.75; // demi-diagonale (arrondie) d'une case
        const r2 = r * r;

        ctx.beginPath(); // taches claires
        let blobs = 0;
        const veins = this._veins;
        veins.length = 0;
        for (let j = j0; j <= j1; j += stride) {
            for (let i = i0; i <= i1; i += stride) {
                // Case entièrement dans la zone saine : rien à dessiner
                const mx = (i + stride / 2) * CELL - cx;
                const my = (j + stride / 2) * CELL - cy;
                const dc = Math.sqrt(mx * mx + my * my);
                if (dc + cellR < r) continue;

                const h1 = hash2(i, j, 1);
                const h2 = hash2(i, j, 2);
                const h3 = hash2(i, j, 3);
                const h4 = hash2(i, j, 4);
                const bx = (i + 0.15 + h1 * 0.7 * stride) * CELL + Math.sin(time * 0.35 + h2 * TAU) * 50;
                const by = (j + 0.15 + h2 * 0.7 * stride) * CELL + Math.cos(time * 0.3 + h1 * TAU) * 50;
                const br = 28 + h3 * 46 + Math.sin(time * 1.1 + h4 * TAU) * 8;
                const dx = bx - cx;
                const dy = by - cy;
                const d2 = dx * dx + dy * dy;
                const lim = r + br;
                if (d2 < lim * lim && r2 > 0) continue; // la tache déborderait sur la zone saine
                ctx.moveTo(bx + br, by);
                ctx.arc(bx, by, br, 0, TAU);
                blobs++;
                // Veine : une ligne brisée qui part de la tache, loin du bord seulement
                const vl = r + br + 150;
                if (h4 < 0.6 && (d2 >= vl * vl || r2 === 0)) veins.push(bx, by, h1 * TAU, h3);
            }
        }
        if (blobs) {
            ctx.fillStyle = 'rgba(150, 50, 230, 0.16)';
            ctx.fill();
        }
        if (veins.length) {
            ctx.beginPath();
            for (let k = 0; k < veins.length; k += 4) {
                let x = veins[k];
                let y = veins[k + 1];
                let a = veins[k + 2] + Math.sin(time * 0.5 + veins[k + 3] * 9) * 0.25;
                ctx.moveTo(x, y);
                for (let s = 0; s < 3; s++) {
                    const len = 40 + veins[k + 3] * 40;
                    x += Math.cos(a) * len;
                    y += Math.sin(a) * len;
                    ctx.lineTo(x, y);
                    a += (s % 2 ? 0.7 : -0.7);
                }
            }
            ctx.globalAlpha = 0.55 + 0.35 * Math.sin(time * 1.6);
            ctx.strokeStyle = '#a040ff';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    // Anneau lumineux qui pulse + flammèches qui montent, sur la partie visible du bord
    _drawEdge(ctx, minX, minY, maxX, maxY, cx, cy, r, time) {
        const arc = visibleArc(cx, cy, r, minX - EDGE_MARGIN, minY - EDGE_MARGIN, maxX + EDGE_MARGIN, maxY + EDGE_MARGIN);
        if (!arc) return;
        const [a0, a1] = arc;
        const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);

        ctx.lineCap = 'butt';
        // Mur de corruption côté violet : bande sombre épaisse (la frontière se voit de loin)
        ctx.beginPath();
        ctx.arc(cx, cy, r + 26, a0, a1);
        ctx.strokeStyle = 'rgba(8, 0, 16, 0.55)';
        ctx.lineWidth = 40;
        ctx.stroke();
        // Halo large (sans shadowBlur : un trait large et transparent)
        ctx.beginPath();
        ctx.arc(cx, cy, r + 6, a0, a1);
        ctx.strokeStyle = 'rgba(122, 31, 214, 0.4)';
        ctx.lineWidth = 36 + pulse * 12;
        ctx.stroke();
        // Anneau principal
        ctx.beginPath();
        ctx.arc(cx, cy, r, a0, a1);
        ctx.globalAlpha = 0.85 + pulse * 0.15;
        ctx.strokeStyle = '#b04cff';
        ctx.lineWidth = 12 + pulse * 4;
        ctx.stroke();
        // Filet clair au centre de l'anneau
        ctx.strokeStyle = '#e8c8ff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Trait noir fin côté corrompu
        ctx.beginPath();
        ctx.arc(cx, cy, r + 7 + pulse * 1.5, a0, a1);
        ctx.strokeStyle = '#0a0012';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Flammèches : positions fixes sur le bord (angles absolus), cycle de vie animé
        if (r < 30) return;
        let step = SPARK_STEP / r;
        if ((a1 - a0) / step > MAX_SPARKS) step = (a1 - a0) / MAX_SPARKS;
        const k0 = Math.ceil(a0 / step);
        const k1 = Math.floor(a1 / step);
        // 3 niveaux de transparence = 3 chemins seulement
        const paths = this._sparks;
        for (let p = 0; p < 3; p++) paths[p].length = 0;
        for (let k = k0; k <= k1; k++) {
            const h = hash(k * 7919 + 13);
            const life = (time * (0.35 + h * 0.4) + h * 10) % 1;
            const a = k * step + (h - 0.5) * step;
            const out = 4 + h * 22;                         // un peu côté corrompu
            const x = cx + Math.cos(a) * (r + out) + Math.sin(time * 2 + h * 20) * 6;
            const y = cy + Math.sin(a) * (r + out) - life * SPARK_RISE;
            const size = 3 + (1 - life) * 6 * (0.6 + h * 0.6);
            paths[Math.min(2, Math.floor(life * 3))].push(x - size / 2, y - size / 2, size);
        }
        const alphas = [0.9, 0.6, 0.3];
        ctx.fillStyle = '#c77dff';
        for (let p = 0; p < 3; p++) {
            const list = paths[p];
            if (!list.length) continue;
            ctx.beginPath();
            for (let i = 0; i < list.length; i += 3) ctx.rect(list[i], list[i + 1], list[i + 2], list[i + 2]);
            ctx.globalAlpha = alphas[p];
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
}
