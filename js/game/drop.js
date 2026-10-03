/* ==================================
   VAISSEAU DE DÉPART - FOR2D ROYAL
   Le vaisseau traverse l'île sur un trajet aléatoire (différent à chaque partie).
   ESPACE pour sauter, puis on plane jusqu'au sol en se dirigeant.
   ================================== */

import { WORLD_SIZE } from './config.js';
import { clamp, inFrameView, fighterSeed } from './utils.js';
import { drawPlayer, drawStyledHead } from './draw.js';

const SHIP_EXTENT = 320;     // rayon (unités) couvrant le vaisseau et son ombre, pour le culling
const SHIP_SPEED = 620;      // unités / s
const FALL_TIME = 4;         // secondes de chute
const AIR_SPEED = 520;       // on se dirige plus vite en l'air qu'au sol
const ISLAND_MARGIN = 450;   // on ne peut sauter qu'au-dessus de l'île
const AUTO_JUMP_GRACE = 0.16; // laisse le compteur afficher « 0 s » avant l'éjection
const OUTLINE = '#0a1030';

function seededRandom(seed) {
    let s = (Math.abs(seed) % 2147483647) || 12345;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

export class Drop {
    constructor(seed = null) {
        // Trajet : une droite qui passe près du centre, avec un angle au hasard
        // (utilise la graine si en multijoueur pour synchroniser tous les joueurs)
        const rng = seed ? seededRandom(seed) : Math.random;
        const angle = rng() * Math.PI * 2;
        const cx = WORLD_SIZE / 2 + (rng() - 0.5) * 2400;
        const cy = WORLD_SIZE / 2 + (rng() - 0.5) * 2400;
        const L = 4600;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        this.path = { ax: cx - dx * L, ay: cy - dy * L, bx: cx + dx * L, by: cy + dy * L };
        this.length = L * 2;
        this.angle = angle;

        // Portion du trajet au-dessus de l'île (dist = distance parcourue)
        this.enterAt = null;
        this.exitAt = null;
        for (let d = 0; d <= this.length; d += 50) {
            const p = this.pointAt(d);
            const inside = p.x > ISLAND_MARGIN && p.x < WORLD_SIZE - ISLAND_MARGIN &&
                           p.y > ISLAND_MARGIN && p.y < WORLD_SIZE - ISLAND_MARGIN;
            if (inside) {
                if (this.enterAt === null) this.enterAt = d;
                this.exitAt = d;
            }
        }

        this.dist = 0;
        this.ship = { ...this.pointAt(0), angle, active: true };
        this.trail = [];
        this.trailTimer = 0;
    }

    pointAt(d) {
        const t = d / this.length;
        return {
            x: this.path.ax + (this.path.bx - this.path.ax) * t,
            y: this.path.ay + (this.path.by - this.path.ay) * t
        };
    }

    get autoJumpAt() {
        return this.exitAt + SHIP_SPEED * AUTO_JUMP_GRACE;
    }

    get canJump() {
        return this.dist >= this.enterAt && this.dist <= this.autoJumpAt;
    }

    // Secondes avant le saut automatique
    get timeLeft() {
        return Math.max(0, (this.exitAt - this.dist) / SHIP_SPEED);
    }

    // Multijoueur : recale le vaisseau sur la distance parcourue chez l'hôte
    syncTo(dist, tolerance = 40) {
        if (!Number.isFinite(dist) || Math.abs(dist - this.dist) <= tolerance) return;
        this.dist = Math.max(0, dist);
        Object.assign(this.ship, this.pointAt(this.dist));
        this.ship.active = this.dist <= this.length;
    }

    jump(player) {
        if (player.phase !== 'ship' || !this.canJump) return false;
        player.phase = 'air';
        player.altitude = 1;
        player.vx = Math.cos(this.angle) * 200; // garde un peu l'élan du vaisseau
        player.vy = Math.sin(this.angle) * 200;
        return true;
    }

    update(dt, player, input, aimX, aimY) {
        // ----- Vaisseau (continue sa route même après le saut) -----
        if (this.ship.active) {
            this.dist += SHIP_SPEED * dt;
            Object.assign(this.ship, this.pointAt(this.dist));
            if (this.dist > this.length) this.ship.active = false;

            // Traînée de fumée
            this.trailTimer += dt;
            if (this.trailTimer > 0.05) {
                this.trailTimer = 0;
                const back = 150;
                const nx = -Math.sin(this.angle) * 36;
                const ny = Math.cos(this.angle) * 36;
                const bx = this.ship.x - Math.cos(this.angle) * back;
                const by = this.ship.y - Math.sin(this.angle) * back;
                this.trail.push({ x: bx + nx, y: by + ny, life: 1 }, { x: bx - nx, y: by - ny, life: 1 });
            }
        }
        // Vieillissement + retrait des bouffées éteintes, sur place (pas de nouveau tableau)
        const trail = this.trail;
        let n = 0;
        for (let i = 0; i < trail.length; i++) {
            const t = trail[i];
            t.life -= dt / 1.4;
            if (t.life > 0) trail[n++] = t;
        }
        trail.length = n;

        // ----- Joueur -----
        if (player.phase === 'ship') {
            player.x = clamp(this.ship.x, 0, WORLD_SIZE);
            player.y = clamp(this.ship.y, 0, WORLD_SIZE);
            player.angle = this.angle;
            // Saut automatique après 0 s : on laisse le HUD afficher la dernière valeur avant l'éjection.
            if (this.dist >= this.autoJumpAt) this.jump(player);
        } else if (player.phase === 'air') {
            const a = input.axis();
            const len = Math.hypot(a.x, a.y);
            const k = Math.min(1, dt * 4);
            player.vx += ((len ? a.x / len : 0) * AIR_SPEED - player.vx) * k;
            player.vy += ((len ? a.y / len : 0) * AIR_SPEED - player.vy) * k;
            player.x = clamp(player.x + player.vx * dt, player.r, WORLD_SIZE - player.r);
            player.y = clamp(player.y + player.vy * dt, player.r, WORLD_SIZE - player.r);
            player.angle = Math.atan2(aimY - player.y, aimX - player.x);
            player.moving = false;
            player.altitude -= dt / FALL_TIME;

            if (player.altitude <= 0) {
                // Atterrissage : on se dégage si on tombe sur un arbre ou un mur
                player.altitude = 0;
                player.phase = 'ground';
                player.vx *= 0.3;
                player.vy *= 0.3;
            }
        }
    }

    /* ===================== DESSIN (coordonnées monde) ===================== */

    // Au-dessus de tout le reste
    draw(ctx, player, time) {
        // Fumée (les bouffées hors écran sont sautées)
        ctx.fillStyle = '#ffffff';
        for (const t of this.trail) {
            const rad = 14 + (1 - t.life) * 26;
            if (!inFrameView(t.x, t.y, rad)) continue;
            ctx.globalAlpha = t.life * 0.55;
            ctx.beginPath();
            ctx.arc(t.x, t.y, rad, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        if (player.phase === 'air') drawFalling(ctx, player, time);
        // Vaisseau + ombre : ~300 unités autour de son centre
        if (this.ship.active && inFrameView(this.ship.x, this.ship.y, SHIP_EXTENT)) {
            drawShip(ctx, this.ship, time);
        }
    }
}

/* ===================== CHUTE & PLANEUR ===================== */
// Tout est calculé à partir de p.altitude, p.vx, p.vy, p.angle et time :
// aucun état à mémoriser par combattant.
// Performance : ce dessin est fait pour CHAQUE combattant en l'air (jusqu'à 25 à la fois) :
// pas de tableau temporaire, opacités via globalAlpha (pas de couleur "rgba(...)" recréée),
// contours d'aile précalculés, et rien n'est dessiné hors écran.

const TAU = Math.PI * 2;
const OPEN_ALT = 0.45;    // le planeur s'ouvre sous cette altitude
const DEPLOY_ALT = 0.07;  // "durée" du déploiement, mesurée en altitude
const FOLD_ALT = 0.035;   // il se replie juste avant de toucher le sol
const PANELS = 3;         // panneaux colorés par demi-aile
const FRAME = '#1d2440';  // armature sombre du planeur
const SHADOW = 'rgb(12, 24, 40)';
const SIDES = [-1, 1];      // gauche puis droite
const WING_SIDES = [1, -1]; // aile droite puis aile gauche

function smoothstep(a, b, v) {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
}

// Dépasse un peu la taille finale puis revient (effet rebond)
function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const u = t - 1;
    return 1 + c3 * u * u * u + c1 * u * u;
}

// Écart entre 2 angles ramené dans [-π, π]
function angleDiff(a, b) {
    return ((((a - b) % TAU) + TAU * 1.5) % TAU) - Math.PI;
}

function fillStroke(ctx, fill, lw = 3) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = lw;
    ctx.stroke();
}

// Membre en trait épais arrondi (hanche → genou → pied) : contour sombre puis couleur par-dessus
function limb(ctx, x0, y0, x1, y1, x2, y2, width, color) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = width + 6;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
}

function hexRGB(c) {
    if (typeof c !== 'string' || c[0] !== '#') return null;
    let h = c.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return null;
    const n = parseInt(h, 16);
    return Number.isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 2 couleurs de panneaux : jaune + couleur du sac, ou couleur du sac + bleu si le sac est clair
// (mémorisées par couleur de sac : calculées une seule fois)
const gliderCache = new Map();
function gliderColors(pack) {
    let res = gliderCache.get(pack);
    if (res) return res;
    const c = hexRGB(pack);
    if (!c) {
        res = ['#ffe03d', '#3a8dff'];
    } else {
        const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
        res = lum > 0.6 ? [pack, '#3a8dff'] : ['#ffe03d', pack];
    }
    if (gliderCache.size < 64) gliderCache.set(pack, res);
    return res;
}

// Joueur (ou bot) en chute : chute libre en étoile, puis planeur façon Fortnite
export function drawFalling(ctx, p, time) {
    const alt = clamp(p.altitude || 0, 0, 1);
    const r = p.r || 26;
    const s = 1 + alt * 0.9;             // plus gros quand il est haut
    // Hors de la vue de l'image en cours (voir utils.frameView) : rien à dessiner.
    // Marge : envergure + lignes de vent + traînées + décalage de l'ombre.
    if (!inFrameView(p.x, p.y, r * s * 6 + 80)) return;

    const f = {
        t: time || 0,
        alt,
        r,
        vx: p.vx || 0,
        vy: p.vy || 0,
        speed: Math.hypot(p.vx || 0, p.vy || 0),
        s,
        sh: 0.45 + 0.55 * (1 - alt),     // l'ombre grossit en se rapprochant...
        shA: 0.1 + (1 - alt) * 0.16,     // ... et devient plus nette
        shx: p.x + alt * 40,             // décalage de l'ombre (soleil en haut à gauche)
        shy: p.y + alt * 55
    };

    ctx.save();
    ctx.lineJoin = 'round';
    if (alt > OPEN_ALT) drawSkydiver(ctx, p, f);
    else drawGliding(ctx, p, f);
    ctx.restore();
}

/* ----- Chute libre ----- */

// Orientation : sens du déplacement si on va assez vite, sinon la visée (transition douce)
function fallHeading(p, speed) {
    const aim = p.angle || 0;
    if (speed < 1) return aim;
    const w = smoothstep(40, 140, speed);
    return aim + angleDiff(Math.atan2(p.vy, p.vx), aim) * w;
}

// Petit battement des membres dans le vent
function flutter(t, seed, i, freq) {
    return Math.sin(t * freq + seed + i * 1.9);
}

function drawSkydiver(ctx, p, f) {
    const { t, r, s } = f;
    const heading = fallHeading(p, f.speed);
    const seed = fighterSeed(p) * 1.37;
    const col = p.colors || {};
    const skin = col.skin || '#f2c29b';
    const hair = col.hair || '#5a3419';
    const outfit = col.outfit || '#ff7a1a';
    const pack = col.pack || '#3a8dff';

    // Ombre au sol
    const ga = ctx.globalAlpha;
    ctx.fillStyle = SHADOW;
    ctx.globalAlpha = ga * f.shA;
    ctx.beginPath();
    ctx.ellipse(f.shx, f.shy, r * 1.45 * f.sh, r * 1.3 * f.sh, heading, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = ga;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    ctx.lineCap = 'round';
    drawWind(ctx, f, false); // lignes de vent derrière le personnage

    ctx.save();
    // Léger roulis du corps dans le vent
    ctx.rotate(heading + Math.sin(t * 2.1 + seed) * 0.07);

    // Jambes écartées vers l'arrière (hanche → genou → pied)
    for (const sd of SIDES) {
        const i = sd > 0 ? 0 : 2;
        const hx = -r * 0.5;
        const hy = sd * r * 0.26;
        const a1 = sd * (2.45 + flutter(t, seed, i, 7.5) * 0.1);
        const kx = hx + Math.cos(a1) * r * 0.62;
        const ky = hy + Math.sin(a1) * r * 0.62;
        const a2 = sd * (2.8 + flutter(t, seed, i + 1, 9.3) * 0.14);
        const fx = kx + Math.cos(a2) * r * 0.58;
        const fy = ky + Math.sin(a2) * r * 0.58;
        limb(ctx, hx, hy, kx, ky, fx, fy, r * 0.4, outfit);
        ctx.beginPath();
        ctx.ellipse(fx, fy, r * 0.25, r * 0.17, a2, 0, TAU);
        fillStroke(ctx, skin);
    }

    // Bras écartés, coudes pliés vers l'avant (épaule → coude → main)
    for (const sd of SIDES) {
        const i = sd > 0 ? 4 : 6;
        const sx = r * 0.28;
        const sy = sd * r * 0.4;
        const a1 = sd * (1.35 + flutter(t, seed, i, 8.1) * 0.12);
        const ex = sx + Math.cos(a1) * r * 0.6;
        const ey = sy + Math.sin(a1) * r * 0.6;
        const a2 = sd * (0.6 + flutter(t, seed, i + 1, 10.2) * 0.16);
        const hx = ex + Math.cos(a2) * r * 0.58;
        const hy = ey + Math.sin(a2) * r * 0.58;
        limb(ctx, sx, sy, ex, ey, hx, hy, r * 0.34, outfit);
        ctx.beginPath();
        ctx.arc(hx, hy, r * 0.24, 0, TAU);
        fillStroke(ctx, skin);
    }

    // Torse
    ctx.beginPath();
    ctx.ellipse(-r * 0.05, 0, r * 0.7, r * 0.52, 0, 0, TAU);
    fillStroke(ctx, outfit);

    // Sac à dos (on le voit de dos) + petit reflet
    ctx.beginPath();
    ctx.roundRect(-r * 0.52, -r * 0.38, r * 0.72, r * 0.76, r * 0.2);
    fillStroke(ctx, pack);
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.18, r * 0.14, r * 0.08, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fill();

    // Tête : skin (heaume, crâne, cagoule, casque) si le combattant en porte un...
    if (!drawStyledHead(ctx, p, r * 0.4, t, r * 0.8)) {
        // ... sinon tête vue de dos : surtout les cheveux, un peu de peau à l'avant
        ctx.beginPath();
        ctx.arc(r * 0.8, 0, r * 0.4, 0, TAU);
        ctx.fillStyle = skin;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        ctx.arc(r * 0.68, 0, r * 0.42, 0, TAU);
        ctx.fillStyle = hair;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(r * 0.8, 0, r * 0.4, 0, TAU);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 3;
        ctx.stroke();
    }
    ctx.restore();

    drawWind(ctx, f, true); // lignes de vent devant le personnage
    ctx.restore();
}

// Lignes de vent : l'air remonte vers la caméra (elles s'écartent du personnage)
// et part à l'opposé du déplacement horizontal. front = moitié dessinée par-dessus.
function drawWind(ctx, f, front) {
    const { t, r, speed } = f;
    const k = Math.min(1, speed / AIR_SPEED);
    const bx = speed > 1 ? (-f.vx / speed) * k : 0;
    const by = speed > 1 ? (-f.vy / speed) * k : 0;
    const ga = ctx.globalAlpha;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    for (let i = front ? 1 : 0; i < 14; i += 2) {
        const cyc = t * 1.6 + i * 0.618;
        const ph = cyc % 1;
        // Nouvel angle à chaque passage pour éviter un motif répétitif
        const a = i * 2.39996 + Math.floor(cyc) * 1.1;
        const ox = Math.cos(a);
        const oy = Math.sin(a);
        const dist = r * (1.2 + ph * 2.4);
        const cx = ox * dist + bx * ph * r * 2.5;
        const cy = oy * dist + by * ph * r * 2.5;
        let mx = ox + bx * 2;
        let my = oy + by * 2;
        const ml = Math.hypot(mx, my) || 1;
        mx /= ml;
        my /= ml;
        const len = r * (0.45 + ph * 0.8);
        ctx.globalAlpha = ga * Math.sin(ph * Math.PI) * 0.55;
        ctx.beginPath();
        ctx.moveTo(cx - mx * len * 0.5, cy - my * len * 0.5);
        ctx.lineTo(cx + mx * len * 0.5, cy + my * len * 0.5);
        ctx.stroke();
    }
    ctx.globalAlpha = ga;
}

/* ----- Planeur ----- */

// Point de l'aile (repère du planeur, +x = avant), EN RAYONS, pour l'aile droite à envergure 1.
// u = 0 au centre → 1 au bout de l'aile, lead = bord d'attaque (sinon bord de fuite).
// Point réel : x = r * wingX(u, lead), y = side * span * r * wingY(u, lead)
// (side = +1 aile droite / -1 aile gauche ; demi-envergure ≈ 2,25 × r)
function wingX(u, lead) {
    return lead
        ? 1.65 - 2.0 * u + Math.sin(u * Math.PI) * 0.22
        : 0.7 - 1.45 * u + Math.sin(u * Math.PI) * 0.1;
}

function wingY(u, lead) {
    return lead ? 2.25 * u : 2.25 * u * 0.94;
}

// Contour d'un morceau de demi-aile (panneaux j0 à j1 exclu), en rayons : [x0, y0, x1, y1, ...]
// Le bord de fuite est festonné (petit creux entre deux nervures, comme une toile tendue).
// Tout est linéaire en r (x) et en side × span × r (y) : calculé UNE fois, puis mis à l'échelle.
function unitWingPoly(j0, j1) {
    const pts = [];
    const steps = (j1 - j0) * 3;
    for (let i = 0; i <= steps; i++) {
        const u = (j0 + ((j1 - j0) * i) / steps) / PANELS;
        pts.push(wingX(u, true), wingY(u, true));
    }
    for (let j = j1; j > j0; j--) {
        const ax = wingX(j / PANELS, false);
        const ay = wingY(j / PANELS, false);
        const bx = wingX((j - 1) / PANELS, false);
        const by = wingY((j - 1) / PANELS, false);
        const cx = (ax + bx) / 2 + 0.16;
        const cy = (ay + by) / 2;
        for (let k = j === j1 ? 0 : 1; k <= 4; k++) {
            const s = k / 4;
            const m = 1 - s;
            pts.push(m * m * ax + 2 * m * s * cx + s * s * bx, m * m * ay + 2 * m * s * cy + s * s * by);
        }
    }
    return new Float32Array(pts);
}

const WING_HALF = unitWingPoly(0, PANELS);
const WING_PANELS = [];
for (let j = 0; j < PANELS; j++) WING_PANELS.push(unitWingPoly(j, j + 1));

// Ajoute le polygone (mis à l'échelle sx, sy) au chemin en cours. L'aile gauche est parcourue
// à l'envers pour que tout tourne dans le même sens (union propre avec d'autres formes).
function tracePoly(ctx, pts, sx, sy, reverse) {
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) {
        const k = reverse ? n - 1 - i : i;
        const x = pts[k * 2] * sx;
        const y = pts[k * 2 + 1] * sy;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

function drawGliding(ctx, p, f) {
    const { t, alt, r, s } = f;
    const aim = p.angle || 0;
    const seed = fighterSeed(p) * 1.37;

    // Déploiement avec rebond, puis repli juste avant le sol
    const dp = clamp((OPEN_ALT - alt) / DEPLOY_ALT, 0, 1);
    const gs = Math.max(0, easeOutBack(dp)) * smoothstep(0, FOLD_ALT, alt);

    // Inclinaison : vitesse latérale par rapport à la visée (+ = vers la droite)
    const lat = -f.vx * Math.sin(aim) + f.vy * Math.cos(aim);
    const bank = clamp(lat / AIR_SPEED, -1, 1);
    const sway = Math.sin(t * 2.2 + seed) * 0.045;                        // balancement
    const yaw = bank * 0.22 + sway;                                       // le nez suit le virage
    const off = bank * r * 0.25 + Math.sin(t * 1.7 + seed) * r * 0.05;    // glisse vers l'intérieur
    // Perspective : l'aile qui descend paraît plus courte, celle qui monte plus longue
    const flat = 1 - 0.08 * Math.abs(bank);
    const spanR = (1 - 0.2 * bank) * flat;
    const spanL = (1 + 0.2 * bank) * flat;
    // Planeur choisi dans le casier (joueur), sinon couleurs tirées du sac
    const colors = p.gliderColors || gliderColors(p.colors && p.colors.pack);

    // ----- Ombre au sol : personnage + aile, en un seul bloc -----
    ctx.save();
    ctx.translate(f.shx, f.shy);
    ctx.rotate(aim + yaw);
    ctx.scale(f.sh, f.sh);
    ctx.beginPath();
    ctx.moveTo(r * 0.95, 0);
    ctx.ellipse(0, 0, r * 0.95, r * 0.9, 0, 0, TAU);
    if (gs > 0.01) {
        tracePoly(ctx, WING_HALF, r * gs, r * gs * spanR, false);
        tracePoly(ctx, WING_HALF, r * gs, -r * gs * spanL, true);
    }
    ctx.fillStyle = SHADOW;
    ctx.globalAlpha *= f.shA;
    ctx.fill();
    ctx.restore();

    // ----- Personnage (sous le planeur) -----
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    ctx.translate(-p.x, -p.y);
    drawPlayer(ctx, p, t);
    ctx.restore();

    if (gs <= 0.01 && dp >= 1) return;

    // ----- Planeur -----
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(s, s);
    ctx.rotate(aim + yaw);
    ctx.translate(0, off);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (gs > 0.01) {
        // Câbles : des épaules du personnage (repère du perso) vers le bord de fuite
        const c = Math.cos(-yaw);
        const sn = Math.sin(-yaw);
        ctx.beginPath();
        for (const side of WING_SIDES) {
            const ax = r * 0.25;
            const ay = side * r * 0.55;
            const gx = ax * c - ay * sn;
            const gy = ax * sn + ay * c - off;
            const sy = side * (side > 0 ? spanR : spanL) * r * gs;
            for (let q = 0; q < 2; q++) {
                const u = q === 0 ? 0.3 : 0.62;
                ctx.moveTo(gx, gy);
                ctx.lineTo(r * wingX(u, false) * gs, wingY(u, false) * sy);
            }
        }
        ctx.strokeStyle = 'rgba(10, 16, 48, 0.75)';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.save();
        ctx.scale(gs, gs);
        drawWingTrails(ctx, f, aim + yaw, spanR, spanL);
        drawWing(ctx, r, bank, colors, spanR, spanL);
        ctx.restore();
    }

    // Petit nuage blanc pendant l'ouverture
    if (dp < 1) {
        const k = 1 - dp;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + 0.3;
            const px = r * 0.5 + Math.cos(a) * r * (0.4 + dp * 0.9);
            const py = Math.sin(a) * r * (0.7 + dp * 2.1);
            const pr = r * (0.28 + dp * 0.14);
            ctx.moveTo(px + pr, py);
            ctx.arc(px, py, pr, 0, TAU);
        }
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha *= k * 0.75; // remis par le restore juste après
        ctx.fill();
    }
    ctx.restore();
}

// Traînées blanches au bout des ailes, à l'opposé du déplacement (sinon vers l'arrière)
function drawWingTrails(ctx, f, rot, spanR, spanL) {
    const { t, r } = f;
    const c = Math.cos(-rot);
    const sn = Math.sin(-rot);
    const lx = f.vx * c - f.vy * sn; // vitesse dans le repère du planeur
    const ly = f.vx * sn + f.vy * c;
    let dx = -lx / AIR_SPEED - 0.6;
    let dy = -ly / AIR_SPEED;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    const len = r * (1 + Math.min(1, f.speed / AIR_SPEED) * 1.8);
    const ga = ctx.globalAlpha;

    for (const side of WING_SIDES) {
        const sy = side * (side > 0 ? spanR : spanL) * r;
        // Milieu du bout d'aile (entre bord d'attaque et bord de fuite)
        const tx = (r * wingX(1, true) + r * wingX(1, false)) / 2;
        const ty = (wingY(1, true) * sy + wingY(1, false) * sy) / 2;
        // Filet continu très léger
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + dx * len * 0.7, ty + dy * len * 0.7);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Tirets qui défilent vers l'arrière
        ctx.strokeStyle = '#ffffff';
        for (let i = 0; i < 3; i++) {
            const ph = (t * 2.4 + i / 3 + (side > 0 ? 0 : 0.17)) % 1;
            const d0 = ph * len;
            const d1 = Math.min(len, d0 + len * 0.3);
            ctx.beginPath();
            ctx.moveTo(tx + dx * d0, ty + dy * d0);
            ctx.lineTo(tx + dx * d1, ty + dy * d1);
            ctx.globalAlpha = ga * (1 - ph) * 0.65;
            ctx.lineWidth = 3 - ph * 1.5;
            ctx.stroke();
        }
        ctx.globalAlpha = ga;
    }
}

// Aile en chevron vue de dessus : panneaux colorés, armature sombre, reflet
function drawWing(ctx, r, bank, colors, spanR, spanL) {
    const ga = ctx.globalAlpha;
    for (const side of WING_SIDES) {
        const span = side > 0 ? spanR : spanL;
        const sy = side * span * r; // échelle verticale de cette demi-aile
        const rev = side < 0;

        // Panneaux en alternance (symétriques des 2 côtés)
        for (let j = 0; j < PANELS; j++) {
            ctx.beginPath();
            tracePoly(ctx, WING_PANELS[j], r, sy, rev);
            ctx.fillStyle = colors[j % 2];
            ctx.fill();
        }

        // Dans le virage : l'aile qui descend s'assombrit, celle qui monte s'éclaircit
        const tilt = bank * side;
        if (Math.abs(tilt) > 0.02) {
            ctx.beginPath();
            tracePoly(ctx, WING_HALF, r, sy, rev);
            ctx.fillStyle = tilt > 0 ? 'rgb(10, 16, 48)' : '#ffffff';
            ctx.globalAlpha = ga * (tilt > 0 ? 0.25 * tilt : -0.18 * tilt);
            ctx.fill();
            ctx.globalAlpha = ga;
        }

        // Reflet le long du bord d'attaque
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) {
            const u = 0.06 + (i / 6) * 0.8;
            const x = r * wingX(u, true) - r * 0.16;
            const y = wingY(u, true) * sy * 0.97;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Nervures
        ctx.beginPath();
        for (let j = 1; j < PANELS; j++) {
            const u = j / PANELS;
            ctx.moveTo(r * wingX(u, true), wingY(u, true) * sy);
            ctx.lineTo(r * wingX(u, false), wingY(u, false) * sy);
        }
        ctx.strokeStyle = FRAME;
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Contour de la demi-aile
        ctx.beginPath();
        tracePoly(ctx, WING_HALF, r, sy, rev);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 3.5;
        ctx.stroke();
    }

    // Armature : barre du bord d'attaque d'un bout à l'autre + épine centrale
    const syL = -spanL * r;
    const syR = spanR * r;
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
        const u = 1 - i / 10;
        const x = r * wingX(u, true);
        const y = wingY(u, true) * syL;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    for (let i = 1; i <= 10; i++) {
        const u = i / 10;
        ctx.lineTo(r * wingX(u, true), wingY(u, true) * syR);
    }
    const noseX = r * wingX(0, true);
    const tailX = r * wingX(0, false);
    ctx.moveTo(noseX, 0);
    ctx.lineTo(tailX, 0);
    ctx.strokeStyle = FRAME;
    ctx.lineWidth = 5;
    ctx.stroke();

    // Embouts ronds au bout des ailes et au nez
    ctx.fillStyle = FRAME;
    ctx.beginPath();
    const tipX = r * wingX(1, true);
    const tipR = wingY(1, true) * syR;
    const tipL = wingY(1, true) * syL;
    ctx.moveTo(tipX + r * 0.12, tipR);
    ctx.arc(tipX, tipR, r * 0.12, 0, TAU);
    ctx.moveTo(tipX + r * 0.12, tipL);
    ctx.arc(tipX, tipL, r * 0.12, 0, TAU);
    ctx.moveTo(noseX + r * 0.13, 0);
    ctx.arc(noseX, 0, r * 0.13, 0, TAU);
    ctx.fill();
}

// Vaisseau vu de dessus, orienté vers la droite puis tourné selon son angle
function drawShip(ctx, ship, time) {
    // Ombre sur le sol (le vaisseau vole haut)
    ctx.save();
    ctx.translate(ship.x + 90, ship.y + 120);
    ctx.rotate(ship.angle);
    ctx.fillStyle = 'rgba(12, 24, 40, 0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 150, 110, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = OUTLINE;

    // Flammes des réacteurs
    const flick = 1 + Math.sin(time * 40) * 0.12;
    for (const side of SIDES) {
        ctx.fillStyle = '#ff9d00';
        ctx.beginPath();
        ctx.ellipse(-150 - 22 * flick, side * 36, 34 * flick, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffe03d';
        ctx.beginPath();
        ctx.ellipse(-140 - 12 * flick, side * 36, 20 * flick, 9, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Ailes
    for (const side of SIDES) {
        ctx.fillStyle = '#3a8dff';
        ctx.beginPath();
        ctx.moveTo(30, side * 30);
        ctx.lineTo(-70, side * 125);
        ctx.lineTo(-115, side * 125);
        ctx.lineTo(-95, side * 30);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Feu de bout d'aile qui clignote
        ctx.fillStyle = Math.sin(time * 6 + side) > 0 ? (side < 0 ? '#ff5470' : '#3dff8b') : '#ffffff';
        ctx.beginPath();
        ctx.arc(-92, side * 120, 8, 0, Math.PI * 2);
        ctx.fill();
    }

    // Réacteurs
    ctx.fillStyle = '#5b6680';
    for (const side of SIDES) {
        ctx.beginPath();
        ctx.roundRect(-150, side * 36 - 17, 70, 34, 10);
        ctx.fill();
        ctx.stroke();
    }

    // Coque
    ctx.fillStyle = '#e8eef7';
    ctx.beginPath();
    ctx.ellipse(0, 0, 140, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Bande orange
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.ellipse(-10, 0, 112, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cockpit
    ctx.fillStyle = '#4fd8ff';
    ctx.beginPath();
    ctx.ellipse(78, 0, 38, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.ellipse(88, -8, 14, 7, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}
