/* ==================================
   EFFETS VISUELS - FOR2D ROYAL
   Particules et petits effets : flash de tir, douilles, impacts, chiffres de
   dégâts, coups de pioche, éliminations, coffres, ramassage, atterrissage,
   pas et soins.

   Performance :
   - un seul tableau circulaire de MAX_PARTICLES objets créés une fois pour
     toutes (aucune allocation pendant la partie, les objets sont recyclés) ;
   - quand le tableau est plein, la nouvelle particule remplace la plus vieille ;
   - la mise à jour et le dessin ne parcourent que la zone du tableau où il
     reste des particules vivantes (pas les 1500 cases à chaque image) ;
   - les effets lancés loin de la vue ne sont pas créés du tout ;
   - on ne dessine que ce qui est dans la vue ;
   - un seul dégradé radial (faisceau d'élimination), créé une fois et mis en cache.

   Tout se dessine en coordonnées monde (le ctx est déjà transformé par la caméra).
   Ce fichier n'importe rien.
   ================================== */

const MAX_PARTICLES = 1500;
// Un effet qui démarre à plus de SPAWN_MARGIN unités de la dernière vue dessinée
// n'est pas créé (combats de bots à l'autre bout de la carte : invisible de toute façon)
const SPAWN_MARGIN = 700;
const OUTLINE = '#0a1030';
const TAU = Math.PI * 2;

const FONT_FAMILY = '"Bebas Neue", Impact, sans-serif';
const FONT_NORMAL = `30px ${FONT_FAMILY}`;
const FONT_BIG = `42px ${FONT_FAMILY}`;

// Couches de dessin
const GROUND = 0; // au sol, sous les personnages
const TOP = 1;    // au-dessus de tout

// Types de particules
const DOT = 0;    // rond (poussière, fumée, paillettes)
const SPARK = 1;  // étincelle étirée dans le sens de sa vitesse
const CUBE = 2;   // petit carré qui tourne (désintégration, éclats de mur)
const STAR = 3;   // étoile scintillante à 4 branches
const PLUS = 4;   // "+" de soin
const RING = 5;   // anneau qui s'élargit
const SHELL = 6;  // douille
const FLASH = 7;  // flash de tir
const ARC = 8;    // arc du coup de pioche
const BEAM = 9;   // faisceau lumineux (dégradé radial)
const TEXT = 10;  // chiffre de dégâts

// Options (champ flags)
const GLOW = 1;    // anneau : halo large et transparent en plus
const TWINKLE = 2; // étoile : scintille en continu au lieu de "pop" puis rétrécir

// Palettes (tableaux constants : pas d'allocation à chaque effet)
const DUST = ['#eadfbf', '#dccb9f', '#d2bf8c'];
const SMOKE = ['#dfe2e7', '#c4c9d1', '#b3b9c2'];
const CHIPS = ['#9aa1ad', '#c2c8d1', '#7d8592'];
const GOLD = ['#ffd23c', '#fff3a8', '#ffd23c'];
const FLASH_SPARKS = ['#ffe03d', '#fff3a8', '#ffffff'];
const SHIELD_SPARKS = ['#7cc4ff', '#7cc4ff', '#ffffff'];
const HEALTH_SPARKS = ['#ffffff', '#ff5470', '#ffffff', '#ff8095'];
const HEALTH_STARS = ['#ffffff', '#ff8095'];
const DEATH_STARS = ['#ffffff', '#cfeaff'];

// Réglages du tir par arme :
// flash = taille du flash, smoke = nb de bouffées, shell = demi-longueur de la douille,
// back = distance entre le bout du canon et la fenêtre d'éjection
const MUZZLE = {
    pistol:  { flash: 15, smoke: 2, shell: 3.2, back: 14, big: false },
    smg:     { flash: 13, smoke: 1, shell: 3.2, back: 22, big: false },
    ar:      { flash: 17, smoke: 2, shell: 3.8, back: 30, big: false },
    shotgun: { flash: 27, smoke: 5, shell: 4.6, back: 26, big: true },
    sniper:  { flash: 30, smoke: 5, shell: 4.8, back: 38, big: true }
};

/* ===================== FORMES UNITAIRES (précalculées) ===================== */

// Étoile à 4 branches : pointe, point de contrôle (près du centre), pointe...
// Les côtés sont des courbes creuses (quadraticCurveTo) => effet "scintillement"
const STAR_PTS = new Float32Array(16);
for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 - Math.PI / 2;
    const r = i % 2 === 0 ? 1 : 0.12;
    STAR_PTS[i * 2] = Math.cos(a) * r;
    STAR_PTS[i * 2 + 1] = Math.sin(a) * r;
}

// Flash de tir : étoile allongée vers l'avant (+x). [angle, longueur] de chaque pointe
const FLASH_SPIKES = [
    [-2.4, 0.22], [-1.4, 0.42], [-0.6, 0.62], [0, 1],
    [0.6, 0.62], [1.4, 0.42], [2.4, 0.22], [Math.PI, 0.18]
];
const FLASH_PTS = buildFlash(FLASH_SPIKES, 0.17, 0.22);

// Polygone pointe / creux / pointe / creux..., décalé vers l'avant de "shift"
function buildFlash(spikes, inner, shift) {
    const n = spikes.length;
    const pts = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
        const a = spikes[i][0];
        const len = spikes[i][1];
        const next = i + 1 < n ? spikes[i + 1][0] : spikes[0][0] + TAU;
        const mid = (a + next) / 2;
        pts[i * 4] = Math.cos(a) * len + shift;
        pts[i * 4 + 1] = Math.sin(a) * len;
        pts[i * 4 + 2] = Math.cos(mid) * inner + shift;
        pts[i * 4 + 3] = Math.sin(mid) * inner;
    }
    return pts;
}

// Croix "+" : bras de demi-épaisseur Q, longueur 1
const Q = 0.34;
const PLUS_PTS = new Float32Array([
    -Q, -1, Q, -1, Q, -Q, 1, -Q, 1, Q, Q, Q,
    Q, 1, -Q, 1, -Q, Q, -1, Q, -1, -Q, -Q, -Q
]);

/* ===================== OUTILS ===================== */

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const sign = () => (Math.random() < 0.5 ? -1 : 1);

// Courbes d'animation (t entre 0 et 1)
const easeOutQuad = (t) => t * (2 - t);
const easeOutCubic = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
const easeInQuad = (t) => t * t;
const easeInOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
// Dépasse un peu 1 avant d'y revenir (effet "pop")
const easeOutBack = (t) => {
    const c = 1.70158;
    const u = t - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
};

/* ===================== PARTICULE ===================== */

// Toutes les particules ont les mêmes champs (forme d'objet stable => rapide)
class Particle {
    constructor() {
        this.alive = false;
        this.reset();
    }

    reset() {
        this.kind = DOT;
        this.layer = TOP;
        this.x = 0;
        this.y = 0;
        this.z = 0;         // hauteur (dessinée en remontant à l'écran)
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.gy = 0;        // accélération verticale à l'écran (négatif = monte)
        this.gz = 0;        // gravité sur la hauteur z
        this.drag = 0;      // freinage (par seconde)
        this.bounce = 0;    // restitution au rebond
        this.bounces = 0;   // rebonds restants
        this.age = 0;       // négatif = pas encore apparue (délai)
        this.life = 1;
        this.size = 1;      // taille de départ
        this.size2 = 1;     // taille d'arrivée
        this.width = 1;     // épaisseur de trait (ou échelle secondaire)
        this.width2 = 1;
        this.rot = 0;
        this.vrot = 0;
        this.ang = 0;       // orientation fixe (flash, arc)
        this.alpha = 1;
        this.color = '#ffffff';
        this.color2 = '';   // contour / couleur secondaire ('' = aucun)
        this.flags = 0;
        this.reach = 24;    // rayon d'encombrement pour tester la vue
        this.text = '';
        this.font = '';
        this.seed = 0;
    }
}

/* ===================== DESSIN DES PARTICULES ===================== */

function drawDot(ctx, p, t, x, y) {
    const s = p.size + (p.size2 - p.size) * easeOutQuad(t);
    const a = p.alpha * (1 - t * t);
    if (a <= 0.01 || s <= 0.1) return;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, TAU);
    ctx.fillStyle = p.color;
    ctx.fill();
    if (p.color2) {
        ctx.lineWidth = p.width;
        ctx.strokeStyle = p.color2;
        ctx.stroke();
    }
}

// Traînée : segment entre la position et la position "il y a size secondes"
function drawSpark(ctx, p, t, x, y) {
    const a = p.alpha * (1 - t);
    if (a <= 0.01) return;
    const k = p.size;
    ctx.globalAlpha = a;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.width * (1 - 0.6 * t);
    ctx.beginPath();
    ctx.moveTo(x - p.vx * k, y - p.vy * k);
    ctx.lineTo(x, y);
    ctx.stroke();
}

// Carré tourné, coins calculés à la main (pas de save/rotate/restore)
function drawCube(ctx, p, t, x, y) {
    const h = p.size + (p.size2 - p.size) * easeInQuad(t);
    const a = p.alpha * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    if (h <= 0.2 || a <= 0.01) return;
    const c = Math.cos(p.rot) * h;
    const s = Math.sin(p.rot) * h;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(x + c - s, y + s + c);
    ctx.lineTo(x - c - s, y - s + c);
    ctx.lineTo(x - c + s, y - s - c);
    ctx.lineTo(x + c + s, y + s - c);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    if (p.color2) {
        ctx.lineWidth = p.width;
        ctx.strokeStyle = p.color2;
        ctx.stroke();
    }
}

function drawStar(ctx, p, t, x, y) {
    let s;
    let a = p.alpha;
    if (p.flags & TWINKLE) {
        s = p.size * (0.7 + 0.3 * Math.sin(p.age * 24 + p.seed));
        if (t > 0.7) a *= 1 - (t - 0.7) / 0.3;
    } else {
        // "pop" rapide puis rétrécit jusqu'à disparaître
        s = p.size * (t < 0.25 ? easeOutBack(t / 0.25) : 1 - easeInQuad((t - 0.25) / 0.75));
    }
    if (s <= 0.2 || a <= 0.01) return;
    const c = Math.cos(p.rot) * s;
    const sn = Math.sin(p.rot) * s;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(x + STAR_PTS[0] * c - STAR_PTS[1] * sn, y + STAR_PTS[0] * sn + STAR_PTS[1] * c);
    for (let k = 2; k < 16; k += 4) {
        const cx = STAR_PTS[k];
        const cy = STAR_PTS[k + 1];
        const k2 = (k + 2) % 16;
        const ox = STAR_PTS[k2];
        const oy = STAR_PTS[k2 + 1];
        ctx.quadraticCurveTo(
            x + cx * c - cy * sn, y + cx * sn + cy * c,
            x + ox * c - oy * sn, y + ox * sn + oy * c
        );
    }
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
}

function drawPlus(ctx, p, t, x, y) {
    const s = p.size * (t < 0.2 ? easeOutBack(t / 0.2) : 1);
    const a = p.alpha * (t < 0.55 ? 1 : 1 - easeInQuad((t - 0.55) / 0.45));
    if (s <= 0.2 || a <= 0.01) return;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(x + PLUS_PTS[0] * s, y + PLUS_PTS[1] * s);
    for (let k = 2; k < PLUS_PTS.length; k += 2) {
        ctx.lineTo(x + PLUS_PTS[k] * s, y + PLUS_PTS[k + 1] * s);
    }
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
}

function drawRing(ctx, p, t, x, y) {
    const e = easeOutCubic(t);
    const r = p.size + (p.size2 - p.size) * e;
    const lw = p.width + (p.width2 - p.width) * e;
    const a = p.alpha * (1 - easeInQuad(t));
    if (a <= 0.01 || r <= 0) return;
    ctx.strokeStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    if (p.flags & GLOW) {
        // Halo large et léger sous l'anneau
        ctx.globalAlpha = a * 0.3;
        ctx.lineWidth = lw * 3;
        ctx.stroke();
    }
    ctx.globalAlpha = a;
    ctx.lineWidth = lw;
    ctx.stroke();
}

// Douille : petit rectangle doré tourné, avec ombre quand elle est en l'air
function drawShell(ctx, p, x, y) {
    const remain = p.life - p.age;
    const a = remain < 0.35 ? remain / 0.35 : 1;
    if (a <= 0.01) return;
    if (p.z > 0.5) {
        ctx.globalAlpha = 0.2 * a;
        ctx.fillStyle = OUTLINE;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.8, 0, TAU);
        ctx.fill();
    }
    const sc = 1 + p.z / 100; // un peu plus grosse quand elle est haute
    const c = Math.cos(p.rot);
    const s = Math.sin(p.rot);
    const ax = c * p.size * sc;   // demi-longueur
    const ay = s * p.size * sc;
    const bx = -s * p.width * sc; // demi-épaisseur
    const by = c * p.width * sc;
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.moveTo(x + ax + bx, y + ay + by);
    ctx.lineTo(x - ax + bx, y - ay + by);
    ctx.lineTo(x - ax - bx, y - ay - by);
    ctx.lineTo(x + ax - bx, y + ay - by);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    // Culot plus foncé
    ctx.beginPath();
    ctx.moveTo(x - ax * 0.45 + bx * 0.6, y - ay * 0.45 + by * 0.6);
    ctx.lineTo(x - ax * 0.45 - bx * 0.6, y - ay * 0.45 - by * 0.6);
    ctx.strokeStyle = p.color2;
    ctx.stroke();
}

function flashPath(ctx, k) {
    ctx.beginPath();
    ctx.moveTo(FLASH_PTS[0] * k, FLASH_PTS[1] * k);
    for (let i = 2; i < FLASH_PTS.length; i += 2) {
        ctx.lineTo(FLASH_PTS[i] * k, FLASH_PTS[i + 1] * k);
    }
    ctx.closePath();
}

// Flash de tir : 3 étoiles emboîtées (orange, jaune, blanc) + halo
function drawFlash(ctx, p, t, x, y, base) {
    const grow = t < 0.3 ? 0.7 + 0.3 * easeOutQuad(t / 0.3) : 1 - 0.4 * (t - 0.3) / 0.7;
    const s = p.size * grow;
    const a = p.alpha * (1 - 0.4 * t);
    ctx.translate(x, y);
    ctx.rotate(p.ang + p.rot);
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = '#fff3a8';
    ctx.beginPath();
    ctx.arc(s * 0.3, 0, s * 0.6, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = a;
    ctx.scale(s, s * p.width); // width = échelle latérale (variation + miroir)
    flashPath(ctx, 1);
    ctx.fillStyle = '#ffb627';
    ctx.fill();
    flashPath(ctx, 0.68);
    ctx.fillStyle = '#ffe03d';
    ctx.fill();
    flashPath(ctx, 0.4);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.setTransform(base);
}

// Contour d'un arc effilé : fin à la queue, épais à la tête
function slashPath(ctx, x, y, R, tail, len, wOut, wIn) {
    const N = 12;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
        const u = i / N;
        const a = tail + len * u;
        const rr = R + wOut * Math.sqrt(u);
        if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    for (let i = N; i >= 0; i--) {
        const u = i / N;
        const a = tail + len * u;
        const rr = R - wIn * Math.sqrt(u);
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
}

// Coup de pioche : la tête balaie de +45° à -45° (même sens que la pioche dans draw.js,
// qui part du côté de la main droite), la queue la rattrape
function drawArc(ctx, p, t, x, y) {
    const span = Math.PI / 2;
    const a0 = p.ang + span / 2;
    const head = a0 - span * easeOutCubic(Math.min(1, t / 0.65));
    const tail = a0 - span * easeInQuad(t);
    const len = head - tail; // négatif : l'arc tourne dans le sens inverse des aiguilles
    if (len > -0.02) return;
    const R = p.size;
    const w = p.width;
    const a = p.alpha * (1 - 0.5 * t);
    ctx.fillStyle = '#ffffff';
    // Traînée large et floue
    ctx.globalAlpha = a * 0.3;
    slashPath(ctx, x, y, R, tail, len, w * 1.1, w * 0.9);
    ctx.fill();
    // Lame nette
    ctx.globalAlpha = a;
    slashPath(ctx, x, y, R, tail, len, w * 0.55, w * 0.3);
    ctx.fill();
}

// Faisceau d'élimination : disque en dégradé radial (additif) qui pulse
function drawBeam(ctx, p, t, x, y, grad, base) {
    const age = p.age;
    const grow = easeOutCubic(Math.min(1, age / 0.2));
    const fade = t < 0.5 ? 1 : 1 - easeInQuad((t - 0.5) / 0.5);
    const wave = Math.sin(age * 15);
    const I = Math.min(1, p.alpha * grow * fade * (1 + 0.18 * wave));
    if (I <= 0.01) return;
    const R = p.size * (0.5 + 0.5 * grow) * (1 + 0.05 * wave);
    ctx.translate(x, y);
    ctx.scale(R, R); // le dégradé est en rayon 1
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = I;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, TAU);
    ctx.fill();
    // Liseré clair qui pulse
    ctx.globalAlpha = I * 0.5;
    ctx.strokeStyle = '#dff1ff';
    ctx.lineWidth = 3 / R;
    ctx.beginPath();
    ctx.arc(0, 0, 0.62 + 0.04 * wave, 0, TAU);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(base);
}

// Chiffre de dégâts : "pop" 1,4 -> 1, puis s'efface en rétrécissant un peu
function drawText(ctx, p, t, x, y, base) {
    const age = p.age;
    let sc;
    if (age < 0.08) sc = 0.5 + 0.9 * easeOutQuad(age / 0.08);
    else if (age < 0.22) sc = 1.4 - 0.4 * easeInOutQuad((age - 0.08) / 0.14);
    else sc = 1;
    let a = p.alpha;
    if (t > 0.65) {
        const f = (t - 0.65) / 0.35;
        a *= 1 - f * f;
        sc *= 1 - 0.2 * f;
    }
    if (a <= 0.01) return;
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    if (p.rot) ctx.rotate(p.rot);
    ctx.scale(sc, sc);
    ctx.lineWidth = p.width;
    ctx.strokeStyle = OUTLINE;
    ctx.strokeText(p.text, 0, 2);  // épaisseur en bas (relief cartoon)
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, 0, 0);
    ctx.setTransform(base);
}

/* ===================== SYSTÈME D'EFFETS ===================== */

export class Effects {
    constructor() {
        // Tableau circulaire : "head" pointe toujours sur la particule la plus vieille
        this.pool = new Array(MAX_PARTICLES);
        for (let i = 0; i < MAX_PARTICLES; i++) this.pool[i] = new Particle();
        this.head = 0;
        this.count = 0; // particules vivantes
        this._grad = null;
        this._gradCtx = null;
        // Dernière vue dessinée (agrandie de SPAWN_MARGIN) : infinie tant qu'on n'a rien dessiné
        this._vMinX = -Infinity;
        this._vMinY = -Infinity;
        this._vMaxX = Infinity;
        this._vMaxY = Infinity;
    }

    // Vrai si (x, y) est trop loin de la vue pour qu'un effet qui y démarre soit vu
    _far(x, y) {
        return x < this._vMinX || x > this._vMaxX || y < this._vMinY || y > this._vMaxY;
    }

    // Plus vieil emplacement encore vivant (le dessin part de là pour garder l'ordre)
    _oldest() {
        const pool = this.pool;
        let left = this.count;
        let i = this.head;
        let oldest = this.head;
        for (let k = 0; k < MAX_PARTICLES && left > 0; k++) {
            i = i === 0 ? MAX_PARTICLES - 1 : i - 1;
            if (pool[i].alive) {
                left--;
                oldest = i;
            }
        }
        return oldest;
    }

    // Réutilise l'emplacement le plus ancien (écrase la plus vieille si tout est plein)
    _spawn(kind, layer, x, y, life, delay = 0) {
        const p = this.pool[this.head];
        this.head = this.head + 1 === MAX_PARTICLES ? 0 : this.head + 1;
        if (p.alive) this.count--;
        p.reset();
        p.alive = true;
        this.count++;
        p.kind = kind;
        p.layer = layer;
        p.x = x;
        p.y = y;
        p.life = life;
        p.age = -delay;
        return p;
    }

    // Gerbe d'étincelles dans un cône autour de dir
    _sparks(x, y, dir, cone, n, spMin, spMax, colors, lifeMin, lifeMax, width) {
        for (let i = 0; i < n; i++) {
            const a = dir + rand(-cone, cone);
            const sp = rand(spMin, spMax);
            const p = this._spawn(SPARK, TOP, x, y, rand(lifeMin, lifeMax));
            p.vx = Math.cos(a) * sp;
            p.vy = Math.sin(a) * sp;
            p.drag = 7;
            p.size = 0.032; // longueur de la traînée (en secondes de vitesse)
            p.width = width;
            p.color = pick(colors);
            p.reach = sp * p.size + 8;
        }
    }

    // Dégradé du faisceau (rayon 1), créé une seule fois par contexte
    _beamGradient(ctx) {
        if (this._gradCtx !== ctx) {
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
            g.addColorStop(0, 'rgba(255,255,255,0.95)');
            g.addColorStop(0.3, 'rgba(200,235,255,0.75)');
            g.addColorStop(0.65, 'rgba(110,180,255,0.35)');
            g.addColorStop(1, 'rgba(80,150,255,0)');
            this._grad = g;
            this._gradCtx = ctx;
        }
        return this._grad;
    }

    /* ---------- Mise à jour ---------- */

    update(dt) {
        if (!(dt > 0) || this.count === 0) return;
        dt = Math.min(dt, 0.1); // évite les grands sauts (onglet en pause...)
        const pool = this.pool;
        // De la plus récente à la plus vieille : on s'arrête dès qu'on a vu toutes les vivantes
        let left = this.count;
        let i = this.head;
        for (let k = 0; k < MAX_PARTICLES && left > 0; k++) {
            i = i === 0 ? MAX_PARTICLES - 1 : i - 1;
            const p = pool[i];
            if (!p.alive) continue;
            left--;
            p.age += dt;
            if (p.age < 0) continue; // encore en attente (délai)
            if (p.age >= p.life) {
                p.alive = false;
                this.count--;
                continue;
            }
            if (p.drag > 0) {
                const f = Math.max(0, 1 - p.drag * dt);
                p.vx *= f;
                p.vy *= f;
            }
            p.vy += p.gy * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.vrot * dt;

            // Hauteur : gravité, rebond puis immobile au sol
            if (p.gz !== 0) {
                p.vz -= p.gz * dt;
                p.z += p.vz * dt;
                if (p.z <= 0) {
                    p.z = 0;
                    if (p.bounces > 0) {
                        p.bounces--;
                        p.vz = -p.vz * p.bounce;
                        p.vx *= 0.5;
                        p.vy *= 0.5;
                        p.vrot *= 0.5;
                    } else {
                        p.vz = 0;
                        p.gz = 0;
                        p.vx = 0;
                        p.vy = 0;
                        p.vrot = 0;
                    }
                }
            }
        }
    }

    /* ---------- Dessin ---------- */

    // Au sol, sous les personnages
    drawGround(ctx, view) {
        this._draw(ctx, view, GROUND);
    }

    // Au-dessus de tout
    drawTop(ctx, view) {
        this._draw(ctx, view, TOP);
    }

    _draw(ctx, view, layer) {
        const minX = view ? view.minX : -Infinity;
        const minY = view ? view.minY : -Infinity;
        const maxX = view ? view.maxX : Infinity;
        const maxY = view ? view.maxY : Infinity;
        // Mémorise la vue pour ne pas créer d'effets loin de l'écran
        this._vMinX = minX - SPAWN_MARGIN;
        this._vMinY = minY - SPAWN_MARGIN;
        this._vMaxX = maxX + SPAWN_MARGIN;
        this._vMaxY = maxY + SPAWN_MARGIN;
        if (this.count === 0) return;
        const pool = this.pool;
        let base = null;   // transformation caméra (lue seulement si besoin)
        let font = '';
        let started = false;
        let seen = 0;
        let i = this._oldest(); // de la plus vieille vivante à la plus récente

        for (let k = 0; k < MAX_PARTICLES && seen < this.count; k++) {
            const p = pool[i];
            i = i + 1 === MAX_PARTICLES ? 0 : i + 1;
            if (!p.alive) continue;
            seen++;
            if (p.layer !== layer || p.age < 0) continue;

            const x = p.x;
            const y = p.y - p.z;
            const r = p.reach;
            if (x + r < minX || x - r > maxX || y + r < minY || y - r > maxY) continue;

            if (!started) {
                ctx.save();
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                started = true;
            }
            const t = p.age / p.life;

            switch (p.kind) {
                case DOT: drawDot(ctx, p, t, x, y); break;
                case SPARK: drawSpark(ctx, p, t, x, y); break;
                case CUBE: drawCube(ctx, p, t, x, y); break;
                case STAR: drawStar(ctx, p, t, x, y); break;
                case PLUS: drawPlus(ctx, p, t, x, y); break;
                case RING: drawRing(ctx, p, t, x, y); break;
                case SHELL: drawShell(ctx, p, x, y); break;
                case ARC: drawArc(ctx, p, t, x, y); break;
                case FLASH:
                    if (!base) base = ctx.getTransform();
                    drawFlash(ctx, p, t, x, y, base);
                    break;
                case BEAM:
                    if (!base) base = ctx.getTransform();
                    drawBeam(ctx, p, t, x, y, this._beamGradient(ctx), base);
                    break;
                case TEXT:
                    if (!base) base = ctx.getTransform();
                    if (p.font !== font) {
                        ctx.font = p.font;
                        font = p.font;
                    }
                    drawText(ctx, p, t, x, y, base);
                    break;
            }
        }
        if (started) ctx.restore();
    }

    /* ---------- Effets appelés par le jeu ---------- */

    // Tir : (x, y) = bout du canon
    muzzle(x, y, angle, weaponId) {
        if (weaponId === 'pickaxe' || this._far(x, y)) return;
        const cfg = MUZZLE[weaponId] || MUZZLE.pistol;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const rx = -dy; // côté droit de l'arme (écran : y vers le bas)
        const ry = dx;

        // Flash en étoile, très court
        const f = this._spawn(FLASH, TOP, x, y, cfg.big ? 0.075 : 0.06);
        f.ang = angle;
        f.rot = rand(-0.12, 0.12);
        f.size = cfg.flash * rand(0.9, 1.1);
        f.width = sign() * rand(0.8, 1.05);
        f.reach = f.size * 1.4;

        // Petite fumée grise qui se dissipe
        for (let i = 0; i < cfg.smoke; i++) {
            const p = this._spawn(DOT, TOP, x + dx * rand(0, 6), y + dy * rand(0, 6), rand(0.45, 0.8), 0.02);
            const sp = rand(20, 70) * (cfg.big ? 1.4 : 1);
            p.vx = dx * sp + rand(-15, 15);
            p.vy = dy * sp + rand(-15, 15);
            p.drag = 2.5;
            p.gy = -12;
            p.size = rand(2.5, 4);
            p.size2 = rand(9, 13) * (cfg.big ? 1.3 : 1);
            p.alpha = rand(0.22, 0.38);
            p.color = pick(SMOKE);
        }

        // Quelques étincelles vers l'avant pour les grosses armes
        if (cfg.big) this._sparks(x, y, angle, 0.3, 4, 280, 480, FLASH_SPARKS, 0.08, 0.14, 2.2);

        // Douille éjectée à droite : tourne, rebondit une fois, reste ~1,5 s au sol
        const s = this._spawn(SHELL, GROUND,
            x - dx * cfg.back + rx * 4, y - dy * cfg.back + ry * 4, rand(1.9, 2.1));
        const side = rand(90, 150);
        const backSp = rand(10, 45);
        s.vx = rx * side - dx * backSp + rand(-12, 12);
        s.vy = ry * side - dy * backSp + rand(-12, 12);
        s.z = 6;
        s.vz = rand(90, 150);
        s.gz = 900;
        s.bounce = 0.4;
        s.bounces = 1;
        s.rot = angle + Math.PI / 2 + rand(-0.5, 0.5);
        s.vrot = rand(14, 24) * sign();
        s.size = cfg.shell;
        s.width = cfg.shell * 0.42;
        s.color = '#f2b632';
        s.color2 = '#b8801a';
        s.reach = 12;
    }

    // Impact de balle : kind = 'wall' | 'shield' | 'health'
    impact(x, y, angle, kind) {
        if (this._far(x, y)) return;
        const back = angle + Math.PI; // les débris repartent vers le tireur

        if (kind === 'shield' || kind === 'health') {
            const shield = kind === 'shield';
            this._sparks(x, y, back, 1.1, shield ? 9 : 7, 160, 400,
                shield ? SHIELD_SPARKS : HEALTH_SPARKS, 0.2, 0.36, 2.2);

            // Petit éclair blanc au point d'impact
            const fl = this._spawn(DOT, TOP, x, y, 0.1);
            fl.size = 8;
            fl.size2 = 2;
            fl.alpha = 0.9;
            fl.color = '#ffffff';

            if (shield) {
                const r = this._spawn(RING, TOP, x, y, 0.22);
                r.size = 4;
                r.size2 = 16;
                r.width = 3;
                r.width2 = 1;
                r.alpha = 0.8;
                r.color = '#7cc4ff';
            } else {
                // Petites étoiles
                for (let i = 0; i < 3; i++) {
                    const a = back + rand(-1, 1);
                    const sp = rand(40, 110);
                    const p = this._spawn(STAR, TOP, x, y, rand(0.3, 0.45));
                    p.vx = Math.cos(a) * sp;
                    p.vy = Math.sin(a) * sp;
                    p.drag = 3;
                    p.size = rand(4, 6);
                    p.rot = rand(0, TAU);
                    p.color = pick(HEALTH_STARS);
                }
            }
            return;
        }

        // ----- Mur / décor -----
        // Poussière beige
        for (let i = 0; i < 5; i++) {
            const a = back + rand(-0.8, 0.8);
            const sp = rand(40, 130);
            const p = this._spawn(DOT, TOP, x, y, rand(0.4, 0.6));
            p.vx = Math.cos(a) * sp;
            p.vy = Math.sin(a) * sp;
            p.drag = 4.5;
            p.size = rand(2.5, 4);
            p.size2 = rand(8, 12);
            p.alpha = rand(0.45, 0.65);
            p.color = pick(DUST);
        }
        // Éclats gris qui sautent et retombent
        for (let i = 0; i < 4; i++) {
            const a = back + rand(-0.7, 0.7);
            const sp = rand(120, 260);
            const p = this._spawn(CUBE, TOP, x, y, rand(0.35, 0.55));
            p.vx = Math.cos(a) * sp;
            p.vy = Math.sin(a) * sp;
            p.drag = 3;
            p.z = 2;
            p.vz = rand(60, 140);
            p.gz = 700;
            p.size = rand(1.4, 2.4);
            p.size2 = p.size * 0.8;
            p.rot = rand(0, TAU);
            p.vrot = rand(8, 16) * sign();
            p.color = pick(CHIPS);
            p.color2 = OUTLINE;
            p.width = 1;
        }
        // Petite étincelle
        const st = this._spawn(STAR, TOP, x, y, 0.09);
        st.size = 7;
        st.rot = rand(0, TAU);
        st.color = '#fff3a8';
    }

    // Chiffre de dégâts façon Fortnite
    damageNumber(x, y, amount, shield, big) {
        if (!(amount > 0) || this._far(x, y)) return;
        const p = this._spawn(TEXT, TOP, x + rand(-10, 10), y + rand(-6, 4), 0.9);
        p.text = String(Math.max(1, Math.round(amount)));
        p.font = big ? FONT_BIG : FONT_NORMAL;
        p.width = big ? 7 : 5.5;
        p.color = big ? '#ffe03d' : shield ? '#7cc4ff' : '#ffffff';
        p.vx = rand(25, 70) * sign();         // dérive sur le côté
        p.vy = -rand(170, 210) * (big ? 1.15 : 1); // monte en ralentissant
        p.drag = 3.2;
        p.rot = big ? rand(-0.12, 0.12) : rand(-0.05, 0.05);
        p.reach = 90;
    }

    // Coup de pioche : arc blanc qui balaie ±45° autour de angle
    swing(x, y, angle, r) {
        if (this._far(x, y)) return;
        const p = this._spawn(ARC, TOP, x, y, 0.18);
        p.ang = angle;
        p.size = (r || 26) + 40;
        p.width = 10;
        p.alpha = 0.75;
        p.reach = p.size + 14;
    }

    // Élimination : désintégration en cubes + onde de choc + faisceau lumineux
    death(x, y, colors) {
        if (this._far(x, y)) return;
        const c = colors || {};
        const outfit = c.outfit || '#3a8dff';
        const pack = c.pack || outfit;
        const hair = c.hair || outfit;

        // Faisceau : grand disque au sol + halo plus petit par-dessus
        const b = this._spawn(BEAM, GROUND, x, y, 1.2);
        b.size = 90;
        b.reach = 110;
        const g = this._spawn(BEAM, TOP, x, y, 1.2);
        g.size = 46;
        g.alpha = 0.45;
        g.reach = 60;

        // Onde de choc blanche au sol + second anneau bleuté
        const w = this._spawn(RING, GROUND, x, y, 0.55);
        w.size = 18;
        w.size2 = 140;
        w.width = 8;
        w.width2 = 1;
        w.alpha = 0.9;
        w.color = '#ffffff';
        w.flags = GLOW;
        w.reach = 170;
        const w2 = this._spawn(RING, GROUND, x, y, 0.5, 0.08);
        w2.size = 10;
        w2.size2 = 95;
        w2.width = 4;
        w2.width2 = 1;
        w2.alpha = 0.7;
        w2.color = '#bfe4ff';
        w2.reach = 110;

        // ~40 cubes : éventail, puis montent et rétrécissent en tournant
        for (let i = 0; i < 40; i++) {
            const a = Math.random() * TAU;
            const d = rand(0, 16);
            const sp = rand(90, 300);
            const p = this._spawn(CUBE, TOP, x + Math.cos(a) * d, y + Math.sin(a) * d,
                rand(0.9, 1.4), rand(0, 0.06));
            p.vx = Math.cos(a) * sp;
            p.vy = Math.sin(a) * sp - rand(20, 60);
            p.drag = 3;
            p.gy = -rand(220, 380);
            p.rot = rand(0, TAU);
            p.vrot = rand(4, 11) * sign();
            p.size = rand(3, 5.5);
            p.size2 = 0;
            const k = Math.random();
            p.color = k < 0.5 ? outfit : k < 0.78 ? pack : hair;
            p.color2 = OUTLINE;
            p.width = 1.5;
        }

        // Quelques étoiles blanches
        for (let i = 0; i < 6; i++) {
            const a = Math.random() * TAU;
            const sp = rand(40, 110);
            const p = this._spawn(STAR, TOP, x + Math.cos(a) * 10, y + Math.sin(a) * 10,
                rand(0.6, 1), rand(0, 0.2));
            p.vx = Math.cos(a) * sp;
            p.vy = Math.sin(a) * sp;
            p.drag = 2;
            p.gy = -40;
            p.size = rand(6, 10);
            p.rot = rand(-0.4, 0.4);
            p.color = pick(DEATH_STARS);
        }
    }

    // Ouverture de coffre : fontaine dorée + éclats blancs
    chestOpen(x, y) {
        if (this._far(x, y)) return;
        const g = 950;
        const z0 = 12;
        for (let i = 0; i < 30; i++) {
            const star = i % 3 === 0;
            const a = Math.random() * TAU;
            const sp = rand(25, 130);
            const vz = rand(260, 440);
            const flight = (vz + Math.sqrt(vz * vz + 2 * g * z0)) / g; // durée avant de toucher le sol
            const p = this._spawn(star ? STAR : DOT, TOP, x + rand(-10, 10), y + rand(-6, 6),
                flight + rand(0.25, 0.45), rand(0, 0.12));
            p.vx = Math.cos(a) * sp;
            p.vy = Math.sin(a) * sp * 0.6;
            p.z = z0;
            p.vz = vz;
            p.gz = g;
            p.bounce = 0.3;
            p.bounces = 1;
            p.color = pick(GOLD);
            p.reach = 12;
            if (star) {
                p.size = rand(4, 6.5);
                p.flags = TWINKLE;
                p.rot = rand(0, TAU);
                p.seed = rand(0, TAU);
            } else {
                p.size = rand(2.2, 3.8);
                p.size2 = p.size * 0.7;
                p.color2 = OUTLINE;
                p.width = 1.2;
            }
        }

        // 2 ou 3 éclats blancs
        const n = Math.random() < 0.5 ? 2 : 3;
        for (let i = 0; i < n; i++) {
            const p = this._spawn(STAR, TOP, x + rand(-20, 20), y + rand(-24, 4),
                rand(0.3, 0.4), i * rand(0.05, 0.1));
            p.size = rand(14, 22);
            p.rot = rand(-0.3, 0.3);
            p.color = '#ffffff';
            p.reach = 26;
        }

        // Léger anneau doré au sol
        const r = this._spawn(RING, GROUND, x, y, 0.5);
        r.size = 14;
        r.size2 = 60;
        r.width = 6;
        r.width2 = 1;
        r.alpha = 0.6;
        r.color = '#ffd23c';
        r.flags = GLOW;
        r.reach = 80;
    }

    // Ramassage d'objet : petit anneau + 6 étincelles qui montent
    pickup(x, y, color) {
        if (this._far(x, y)) return;
        const col = color || '#ffffff';
        const r = this._spawn(RING, TOP, x, y, 0.4);
        r.size = 8;
        r.size2 = 36;
        r.width = 4;
        r.width2 = 1;
        r.alpha = 0.9;
        r.color = col;
        r.flags = GLOW;
        r.reach = 50;
        for (let i = 0; i < 6; i++) {
            const p = this._spawn(SPARK, TOP, x + rand(-14, 14), y + rand(-8, 8),
                rand(0.3, 0.4), i * 0.015);
            p.vx = rand(-40, 40);
            p.vy = -rand(110, 190);
            p.drag = 2.5;
            p.size = 0.05;
            p.width = 2.4;
            p.color = i % 2 ? '#ffffff' : col;
        }
    }

    // Atterrissage : anneau de poussière (30 -> 90) + ~12 petits nuages
    landing(x, y) {
        if (this._far(x, y)) return;
        const r = this._spawn(RING, GROUND, x, y, 0.6);
        r.size = 30;
        r.size2 = 90;
        r.width = 12;
        r.width2 = 2;
        r.alpha = 0.55;
        r.color = '#e3d3a8';
        r.reach = 110;
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * TAU + rand(-0.2, 0.2);
            const d = rand(18, 26);
            const sp = rand(120, 200);
            const p = this._spawn(DOT, GROUND, x + Math.cos(a) * d, y + Math.sin(a) * d, rand(0.6, 0.9));
            p.vx = Math.cos(a) * sp;
            p.vy = Math.sin(a) * sp;
            p.drag = 4;
            p.size = rand(7, 10);
            p.size2 = rand(14, 19);
            p.alpha = rand(0.5, 0.7);
            p.color = pick(DUST);
            p.color2 = '#c7b184';
            p.width = 2;
        }
    }

    // Pas : poussière discrète sur terre, ondulation dans l'eau
    footstep(x, y, inWater) {
        if (this._far(x, y)) return;
        if (inWater) {
            const r = this._spawn(RING, GROUND, x, y, 0.7);
            r.size = 5;
            r.size2 = 30;
            r.width = 2.6;
            r.width2 = 0.6;
            r.alpha = 0.6;
            r.color = '#ffffff';
            r.reach = 36;
            const r2 = this._spawn(RING, GROUND, x, y, 0.55, 0.12);
            r2.size = 3;
            r2.size2 = 18;
            r2.width = 2;
            r2.width2 = 0.5;
            r2.alpha = 0.45;
            r2.color = '#ffffff';
            return;
        }
        const p = this._spawn(DOT, GROUND, x + rand(-3, 3), y + rand(-3, 3), 0.4);
        p.vx = rand(-14, 14);
        p.vy = rand(-14, 6);
        p.drag = 3;
        p.size = rand(2.5, 3.5);
        p.size2 = rand(7, 9);
        p.alpha = 0.22;
        p.color = pick(DUST);
    }

    // Soin en cours : 1 ou 2 "+" qui montent autour du joueur
    healTick(x, y, shield) {
        if (this._far(x, y)) return;
        const col = shield ? '#4aa8ff' : '#6fdc70';
        const n = Math.random() < 0.5 ? 1 : 2;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU;
            const d = rand(8, 30);
            const p = this._spawn(PLUS, TOP, x + Math.cos(a) * d, y + Math.sin(a) * d,
                rand(0.75, 0.95), i * 0.08);
            p.vx = rand(-8, 8);
            p.vy = -rand(60, 85);
            p.drag = 1.5;
            p.size = rand(6, 8.5);
            p.color = col;
        }
    }

    // Soin terminé : anneau lumineux + quelques "+"
    healDone(x, y, shield) {
        if (this._far(x, y)) return;
        const col = shield ? '#4aa8ff' : '#6fdc70';
        const r = this._spawn(RING, GROUND, x, y, 0.6);
        r.size = 18;
        r.size2 = 78;
        r.width = 7;
        r.width2 = 1.5;
        r.alpha = 0.9;
        r.color = col;
        r.flags = GLOW;
        r.reach = 100;
        const r2 = this._spawn(RING, GROUND, x, y, 0.5, 0.06);
        r2.size = 14;
        r2.size2 = 60;
        r2.width = 3;
        r2.width2 = 1;
        r2.alpha = 0.7;
        r2.color = '#ffffff';
        r2.reach = 70;
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * TAU + rand(-0.3, 0.3);
            const d = rand(18, 34);
            const p = this._spawn(PLUS, TOP, x + Math.cos(a) * d, y + Math.sin(a) * d,
                rand(0.8, 1), rand(0, 0.15));
            p.vx = rand(-10, 10);
            p.vy = -rand(80, 110);
            p.drag = 1.5;
            p.size = rand(7, 9.5);
            p.color = col;
        }
    }
}
