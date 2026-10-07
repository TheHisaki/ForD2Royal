/* ==================================
   VAISSEAU DE DÉPART - FOR2D ROYAL
   Le vaisseau traverse l'île sur un trajet aléatoire (différent à chaque partie).
   ESPACE pour sauter, puis on plane jusqu'au sol en se dirigeant.
   ================================== */

import { clamp, inFrameView, fighterSeed, airProject, frameView, rectPointDist } from './utils.js';
import { keepDuelSide } from './player.js?v=14';
import { drawPlayer, drawStyledHead } from './draw.js?v=11';
import { GLIDER_ART } from '../glider-art.js';
import { drawBackpack } from './backpack-art.js';

const SHIP_EXTENT = 320;     // rayon (unités) couvrant le vaisseau et son ombre, pour le culling
const SHIP_SPEED = 620;      // unités / s
const FALL_TIME = 12;        // secondes de chute (3x plus longtemps qu'avant)
const AIR_SPEED = 520;       // on se dirige plus vite en l'air qu'au sol
/*
   Hauteur réelle du vaisseau, en "distances caméra normales" (la caméra reste toujours à
   la même distance au-dessus de ce qu'elle suit). Depuis le vaisseau, le sol est donc
   1 + SHIP_HEIGHT fois plus loin : la carte paraît ~2,4x plus petite (on en voit beaucoup
   plus), alors que le vaisseau et le joueur gardent leur taille normale à l'écran.
*/
export const SHIP_HEIGHT = 1.4;
const SUN_X = 65;            // décalage de l'ombre au sol par unité de hauteur (soleil en haut à gauche)
const SUN_Y = 90;

// Hauteur d'un combattant en chute (altitude 1 = hauteur du vaisseau, 0 = sol)
export function fallHeight(alt) {
    return clamp(alt || 0, 0, 1) * SHIP_HEIGHT;
}

// Échelle du sol quand la caméra suit un objet à cette altitude (1 = au sol)
export function flightViewAt(alt) {
    return 1 / (1 + fallHeight(alt));
}

/*
   Distance caméra -> joueur pendant la chute (1 = distance normale au sol).
   Plus proche en vol : le parachutiste est ~1,4x plus grand à l'écran, à la même
   échelle que le vaisseau qu'il vient de quitter. Près du sol, la caméra recule
   doucement jusqu'à la distance normale (pas de saut d'échelle à l'atterrissage).
   La pente de recul reste inférieure à celle de la descente : la carte ne fait
   que grossir pendant toute la chute.
*/
const FALL_CAM_GAP = 0.7;
const LAND_BLEND = 0.35;     // sous cette altitude, la caméra revient à la normale
export function fallCameraGap(alt) {
    const a = clamp(alt || 0, 0, 1);
    if (a >= LAND_BLEND) return FALL_CAM_GAP;
    const t = 1 - a / LAND_BLEND;
    return FALL_CAM_GAP + (1 - FALL_CAM_GAP) * t * t * (3 - 2 * t);
}

const _shipProj = {};
const _fallProj = {};

/* ===================== ATTERRISSAGE SUR UN TOIT =====================
   On ne peut pas se poser sur un toit : en le touchant, le combattant glisse
   (de plus en plus vite, comme sur une pente) jusqu'au bord le plus proche,
   saute du bord et atterrit au sol à côté de la maison, sur un endroit libre.
   Pendant la glissade il reste en phase 'air' (dessiné au-dessus des toits,
   pas de tir) avec roofSlide = état de l'animation.
*/
const ROOF_ALT = 0.025;      // hauteur d'un toit (unité d'altitude : 1 = vaisseau)
const ROOF_OVERHANG = 8;     // débord du toit (voir drawRoof dans draw.js)
const SLIDE_SPEED0 = 55;     // vitesse au début de la glissade (unités / s)
const SLIDE_ACCEL = 360;     // la pente fait accélérer (~0,5 à 0,8 s sur le toit)
const DROP_TIME = 0.45;      // saut du bord du toit jusqu'au sol (s)
const EXIT_GAP = 16;         // distance au mur à l'atterrissage (en plus du rayon)
const EXIT_SHIFTS = [0, 45, -45, 90, -90, 140, -140, 200, -200];
const _near = [];

// Bâtiment dont le toit est sous ce point (null sinon)
export function roofAt(world, x, y) {
    if (!world || !world.buildings) return null;
    const o = ROOF_OVERHANG;
    for (const b of world.buildings) {
        if (x > b.x - o && x < b.x + b.w + o && y > b.y - o && y < b.y + b.h + o) return b;
    }
    return null;
}

// Endroit libre pour atterrir : hors des maisons, des murs, des arbres et des rochers
function spotFree(world, x, y, r) {
    if (x < r || y < r || x > world.width - r || y > world.height - r) return false;
    for (const b of world.buildings) if (rectPointDist(b, x, y) < r + 4) return false;
    const near = world.collide ? world.collide.query(x - r, y - r, x + r, y + r, _near) : [];
    for (let i = 0; i < near.length; i++) {
        const c = near[i];
        if (c.kind === 'circle') {
            if (Math.hypot(x - c.x, y - c.y) < r + c.r) return false;
        } else if (rectPointDist(c, x, y) < r) {
            return false;
        }
    }
    return true;
}

// Bord du toit le plus proche + point d'atterrissage libre juste à l'extérieur
function roofExit(world, b, x, y, r) {
    const o = ROOF_OVERHANG;
    const gap = r + EXIT_GAP;
    const sides = [
        { d: x - b.x, nx: -1, ny: 0 },
        { d: b.x + b.w - x, nx: 1, ny: 0 },
        { d: y - b.y, nx: 0, ny: -1 },
        { d: b.y + b.h - y, nx: 0, ny: 1 }
    ].sort((a, c) => a.d - c.d);
    let first = null;
    for (const s of sides) {
        for (const shift of EXIT_SHIFTS) {
            // Position le long du bord (bornée à la longueur du mur)
            const ax = s.nx ? x : clamp(x + shift, b.x + 10, b.x + b.w - 10);
            const ay = s.ny ? y : clamp(y + shift, b.y + 10, b.y + b.h - 10);
            const edgeX = s.nx < 0 ? b.x - o : s.nx > 0 ? b.x + b.w + o : ax;
            const edgeY = s.ny < 0 ? b.y - o : s.ny > 0 ? b.y + b.h + o : ay;
            const landX = s.nx < 0 ? b.x - gap : s.nx > 0 ? b.x + b.w + gap : ax;
            const landY = s.ny < 0 ? b.y - gap : s.ny > 0 ? b.y + b.h + gap : ay;
            const exit = { edgeX, edgeY, landX, landY };
            if (!first) first = exit;
            if (spotFree(world, landX, landY, r)) return exit;
        }
    }
    return first; // tout est encombré : bord le plus proche (les collisions au sol feront le reste)
}

// À appeler pendant la chute : true si le combattant vient de toucher un toit
export function tryRoofLanding(f, world) {
    if (f.roofSlide || f.altitude > ROOF_ALT) return false;
    const b = roofAt(world, f.x, f.y);
    if (!b) return false;
    const e = roofExit(world, b, f.x, f.y, f.r || 26);
    const len = Math.hypot(e.edgeX - f.x, e.edgeY - f.y);
    const dir = len > 0.5 ? Math.atan2(e.edgeY - f.y, e.edgeX - f.x) : Math.atan2(e.landY - f.y, e.landX - f.x);
    f.roofSlide = {
        stage: 0, t: 0, v: SLIDE_SPEED0, dist: 0, len, dir,
        sx: f.x, sy: f.y, ...e, ox: 0, oy: 0,
        color: b.snow ? '#eef3f8' : b.roof
    };
    f.altitude = ROOF_ALT;
    f.angle = dir;
    f.vx = Math.cos(dir) * SLIDE_SPEED0;
    f.vy = Math.sin(dir) * SLIDE_SPEED0;
    f.moving = false;
    return true;
}

// Avance la glissade ; renvoie true au moment où le combattant touche le sol
export function updateRoofSlide(f, dt) {
    const s = f.roofSlide;
    if (!s) return false;
    s.t += dt;
    f.moving = false;
    if (s.stage === 0) {
        // Sur le toit : accélère jusqu'au bord
        s.v += SLIDE_ACCEL * dt;
        s.dist = Math.min(s.len, s.dist + s.v * dt);
        const u = s.len > 0 ? s.dist / s.len : 1;
        f.x = s.sx + (s.edgeX - s.sx) * u;
        f.y = s.sy + (s.edgeY - s.sy) * u;
        f.vx = Math.cos(s.dir) * s.v;
        f.vy = Math.sin(s.dir) * s.v;
        f.altitude = ROOF_ALT;
        if (s.dist >= s.len) {
            s.stage = 1;
            s.t = 0;
            s.ox = f.x;
            s.oy = f.y;
            s.dir = Math.atan2(s.landY - f.y, s.landX - f.x) || s.dir;
            f.angle = s.dir;
        }
        return false;
    }
    // Saut du bord : petit bond puis chute jusqu'au sol, à côté de la maison
    const u = Math.min(1, s.t / DROP_TIME);
    const e = u * (2 - u); // freine un peu à l'arrivée
    f.x = s.ox + (s.landX - s.ox) * e;
    f.y = s.oy + (s.landY - s.oy) * e;
    f.altitude = Math.max(0, ROOF_ALT * (1 - u * u) + 0.012 * Math.sin(Math.PI * u));
    if (u < 1) return false;
    f.x = s.landX;
    f.y = s.landY;
    f.altitude = 0;
    f.phase = 'ground';
    f.vx = Math.cos(s.dir) * 80; // un pas de réception dans l'élan
    f.vy = Math.sin(s.dir) * 80;
    f.roofSlide = null;
    return true;
}

// Voile d'air entre la caméra et le sol : la carte paraît plus lointaine en altitude.
// À dessiner après le sol et avant ce qui vole (v = bornes de la vue, repère monde).
export function drawSkyHaze(ctx, v, color = '#cfe4ff') {
    const depth = clamp((frameView.camH - 1) / SHIP_HEIGHT, 0, 1);
    if (depth <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = depth * 0.22;
    ctx.fillStyle = color;
    ctx.fillRect(v.minX, v.minY, v.maxX - v.minX, v.maxY - v.minY);
    ctx.restore();
}
const AUTO_JUMP_GRACE = 0.16; // laisse le compteur afficher « 0 s » avant l'éjection
// 1V1 : bus en panne au-dessus de chaque ville
const DUEL_COUNTDOWN = 5;      // secondes avant l'expulsion des joueurs
/*
   1V1 : saut depuis 200 m (au lieu de 2000 m), planeur ouvert à 100 m.
   L'altitude interne reste 1 = bus et 2/3 = ouverture du planeur (dessins inchangés) :
   seuls la durée de chute et l'altimètre changent.
   4,5 s de chute : 1,5 s de chute libre (~67 m/s) puis 3 s sous planeur (~33 m/s),
   contre 12 s sur la carte classique.
*/
export const DUEL_DROP = { fallTime: 4.5, topMeters: 200, gliderMeters: 100 };
const BROKEN_LEAVE_TIME = 3;   // durée (s) pendant laquelle le bus abandonné part en vrille
const BROKEN_SPIN = 0.55;      // rotation du bus abandonné (rad / s)
const BROKEN_DRIFT = 150;      // vitesse de dérive du bus abandonné (unités / s)
const OUTLINE = '#0a1030';

function seededRandom(seed) {
    let s = (Math.abs(seed) % 2147483647) || 12345;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

export class Drop {
    constructor(world, seed = null, options = {}) {
        this.world = world;
        const duelTowns = options.duel && Array.isArray(options.towns) ? options.towns.filter(Boolean) : [];
        this.duelMode = duelTowns.length > 0;
        this.fallTime = this.duelMode ? DUEL_DROP.fallTime : FALL_TIME; // durée de la chute (s)
        this.duelCountdown = DUEL_COUNTDOWN;
        this.duelTime = 0;
        this.localTeam = options.localTeam ?? 1;
        const width = world?.width || 6000;
        const height = world?.height || 6000;
        const scale = Math.min(width, height) / 6000;
        const margin = 450 * scale;

        if (this.duelMode) {
            /*
               1V1 : un bus en panne immobilisé au-dessus de CHAQUE ville (~200 m).
               Chaque combattant est placé dans le bus de son camp (voir shipFor) et tout
               le monde est expulsé en même temps à la fin du compte à rebours.
               L'altitude 1 = le bus ; le planeur s'ouvre à 2/3 de la chute, soit ~100 m.
            */
            const cx = width / 2;
            const cy = height / 2;
            this.ships = duelTowns.map((town, i) => ({
                x: town.x,
                y: town.y,
                angle: Math.atan2(cy - town.y, cx - town.x), // nez tourné vers le centre de l'île
                active: true,
                broken: true,
                leave: 0,
                town,
                seed: i * 7.31 + 1.7 // décale les animations des deux bus
            }));
            const localIndex = clamp(Number(options.localIndex) || 0, 0, this.ships.length - 1);
            this.ship = this.ships[localIndex];
            this.angle = this.ship.angle;
            this.path = { ax: this.ship.x, ay: this.ship.y, bx: this.ship.x, by: this.ship.y };
            this.length = 1;
            this.enterAt = 0;
            this.exitAt = 0;
            this.dist = 0;
            this.trail = [];
            this.trailTimer = 0;
            return;
        }

        // Trajet classique : une droite qui passe près du centre, avec un angle au hasard
        // (utilise la graine si en multijoueur pour synchroniser tous les joueurs)
        const rng = seed ? seededRandom(seed) : Math.random;
        const angle = rng() * Math.PI * 2;
        const cx = width / 2 + (rng() - 0.5) * 2400 * scale;
        const cy = height / 2 + (rng() - 0.5) * 2400 * scale;
        const L = 4600 * scale;
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
            const inside = p.x > margin && p.x < width - margin &&
                           p.y > margin && p.y < height - margin;
            if (inside) {
                if (this.enterAt === null) this.enterAt = d;
                this.exitAt = d;
            }
        }

        this.dist = 0;
        this.ship = { ...this.pointAt(0), angle, active: true, broken: false };
        this.ships = [this.ship];
        this.trail = [];
        this.trailTimer = 0;
    }

    // Bus d'un combattant : le sien en 1V1 (son camp), le vaisseau unique sinon
    shipFor(f) {
        if (!this.duelMode || this.ships.length < 2) return this.ship;
        if (!f || f.team === this.localTeam) return this.ship;
        return this.ships.find(s => s !== this.ship) || this.ship;
    }

    // 1V1 : le compte à rebours est terminé, tout le monde quitte son bus
    get duelExpelled() {
        return this.duelMode && this.duelTime >= this.duelCountdown;
    }

    // 1V1 : avance (ou recale) le compte à rebours ; à 0, les bus sont abandonnés
    _setDuelTime(t) {
        let v = Math.max(0, Math.min(this.duelCountdown, t));
        if (v >= this.duelCountdown - 0.001) v = this.duelCountdown; // pas d'attente d'une image en plus
        this.duelTime = v;
        this.dist = v;
        if (v < this.duelCountdown) return;
        for (const s of this.ships) {
            if (!s.active) continue;
            s.active = false;
            s.leave = BROKEN_LEAVE_TIME;
            s.dropX = s.x; // point d'expulsion exact (le bus dérive ensuite)
            s.dropY = s.y;
        }
    }

    // Panache de fumée noire des réacteurs (gauche en feu : épais ; droit : par à-coups)
    _emitBrokenSmoke(s) {
        const c = Math.cos(s.angle);
        const n = Math.sin(s.angle);
        for (const side of SIDES) {
            if (side > 0 && Math.random() < 0.5) continue;
            const lx = -158;
            const ly = side * 36;
            this.trail.push({
                x: s.x + lx * c - ly * n,
                y: s.y + lx * n + ly * c,
                life: 1,
                span: side < 0 ? 2.6 : 1.8,
                dark: true,
                r0: side < 0 ? 18 : 12,
                vx: -c * 40 + (Math.random() - 0.5) * 30,
                vy: -n * 40 + (Math.random() - 0.5) * 30
            });
        }
    }

    pointAt(d) {
        const t = d / this.length;
        return {
            x: this.path.ax + (this.path.bx - this.path.ax) * t,
            y: this.path.ay + (this.path.by - this.path.ay) * t
        };
    }

    get autoJumpAt() {
        return this.duelMode ? this.duelCountdown : this.exitAt + SHIP_SPEED * AUTO_JUMP_GRACE;
    }

    get canJump() {
        return this.duelMode
            ? this.duelTime >= this.duelCountdown
            : this.dist >= this.enterAt && this.dist <= this.autoJumpAt;
    }

    // Secondes avant l'éjection automatique
    get timeLeft() {
        return this.duelMode
            ? Math.max(0, this.duelCountdown - this.duelTime)
            : Math.max(0, (this.exitAt - this.dist) / SHIP_SPEED);
    }

    // Multijoueur : recale le vaisseau sur la distance/horloge de l'hôte
    syncTo(dist, tolerance = 40) {
        if (this.duelMode) {
            // Après l'expulsion, on ne revient jamais en arrière (personne ne remonte dans un bus)
            if (!Number.isFinite(dist) || this.duelExpelled) return;
            if (Math.abs(dist - this.duelTime) <= 0.15) return;
            this._setDuelTime(dist);
            return;
        }
        if (!Number.isFinite(dist) || Math.abs(dist - this.dist) <= tolerance) return;
        this.dist = Math.max(0, dist);
        Object.assign(this.ship, this.pointAt(this.dist));
        this.ship.active = this.dist <= this.length;
    }

    // force : éjection automatique (même si la fenêtre de saut est déjà dépassée).
    // Avant, le saut auto exigeait aussi canJump (dist <= autoJumpAt) : comme il ne se
    // déclenche qu'à dist >= autoJumpAt, il ne marchait presque jamais et le joueur
    // restait coincé dans le vaisseau jusqu'à sa disparition.
    jump(player, force = false) {
        if (player.phase !== 'ship') return false;
        if (!force && !this.canJump) return false;
        if (!this.duelMode && force && this.exitAt !== null && this.dist > this.autoJumpAt) {
            // En retard (onglet en arrière-plan, recalage réseau) : éjecté au bord de l'île
            Object.assign(player, this.pointAt(this.autoJumpAt));
        }
        if (this.duelMode) {
            // Expulsé juste sous son bus, au-dessus de sa ville
            player.x = this.ship.dropX ?? this.ship.x;
            player.y = this.ship.dropY ?? this.ship.y;
        }
        player.phase = 'air';
        player.altitude = 1;
        player.vx = this.duelMode ? 0 : Math.cos(this.angle) * 200;
        player.vy = this.duelMode ? 0 : Math.sin(this.angle) * 200;
        return true;
    }

    update(dt, player, input, aimX, aimY) {
        // ----- Vaisseau -----
        if (this.duelMode) {
            // Bus en panne : immobiles au-dessus des villes pendant le compte à rebours,
            // puis abandonnés : ils partent en vrille en fumant et disparaissent.
            if (!this.duelExpelled) this._setDuelTime(this.duelTime + dt);
            this.trailTimer += dt;
            const emit = this.trailTimer >= 0.06;
            if (emit) this.trailTimer = 0;
            for (const s of this.ships) {
                if (s.leave > 0) {
                    s.leave = Math.max(0, s.leave - dt);
                    s.angle += BROKEN_SPIN * dt;
                    s.x += Math.cos(s.angle) * BROKEN_DRIFT * dt;
                    s.y += Math.sin(s.angle) * BROKEN_DRIFT * dt;
                }
                if (emit && (s.active || s.leave > 0)) this._emitBrokenSmoke(s);
            }
        } else if (this.ship.active) {
            // Trajet classique : le vaisseau continue sa route même après le saut.
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
            t.life -= dt / (t.span || 1.4);
            if (t.vx) {
                // Fumée du bus en panne : elle s'échappe et se disperse
                t.x += t.vx * dt;
                t.y += t.vy * dt;
            }
            if (t.life > 0) trail[n++] = t;
        }
        trail.length = n;

        // ----- Joueur -----
        if (player.phase === 'ship') {
            player.x = clamp(this.ship.x, 0, this.world.width);
            player.y = clamp(this.ship.y, 0, this.world.height);
            player.angle = this.angle;
            // Saut automatique après 0 s (ou si le vaisseau a disparu) : éjection forcée
            if (this.dist >= this.autoJumpAt || !this.ship.active) this.jump(player, true);
        } else if (player.phase === 'air' && player.roofSlide) {
            // Glissade sur un toit : pas de pilotage, on glisse jusqu'au bord puis on saute au sol
            updateRoofSlide(player, dt);
        } else if (player.phase === 'air') {
            const a = input.axis();
            const len = Math.hypot(a.x, a.y);
            const k = Math.min(1, dt * 4);
            player.vx += ((len ? a.x / len : 0) * AIR_SPEED - player.vx) * k;
            player.vy += ((len ? a.y / len : 0) * AIR_SPEED - player.vy) * k;
            player.x = clamp(player.x + player.vx * dt, player.r, this.world.width - player.r);
            player.y = clamp(player.y + player.vy * dt, player.r, this.world.height - player.r);
            keepDuelSide(player, this.world); // 1V1 : la frontière ne se survole pas
            player.angle = Math.atan2(aimY - player.y, aimX - player.x);
            player.moving = false;
            player.altitude -= dt / this.fallTime;

            // Arrivée sur un toit : on glisse jusqu'au bord et on atterrit à côté de la maison
            if (tryRoofLanding(player, this.world)) return;
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
        // Ombres des vaisseaux au sol : dessinées sous tout ce qui vole
        for (const s of this.ships) {
            const a = shipFade(s);
            if (a > 0) drawShipShadow(ctx, s, a);
        }

        // Fumée : à la hauteur du vaisseau (même perspective que lui)
        const pr = _shipProj;
        airProject(0, 0, SHIP_HEIGHT, pr);
        if (pr.alpha > 0) {
            ctx.fillStyle = '#ffffff';
            for (const t of this.trail) {
                airProject(t.x, t.y, SHIP_HEIGHT, pr);
                const rad = ((t.r0 || 14) + (1 - t.life) * (t.dark ? 46 : 26)) * pr.k;
                if (!inFrameView(pr.x, pr.y, rad)) continue;
                if (t.dark) {
                    // Fumée noire qui s'éclaircit en se dispersant
                    ctx.fillStyle = t.life > 0.6 ? '#2e2934' : t.life > 0.3 ? '#47414d' : '#655f69';
                    ctx.globalAlpha = t.life * 0.72 * pr.alpha;
                } else {
                    ctx.globalAlpha = t.life * 0.55 * pr.alpha;
                }
                ctx.beginPath();
                ctx.arc(pr.x, pr.y, rad, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        if (player.phase === 'air') drawFalling(ctx, player, time);
        for (const s of this.ships) {
            const a = shipFade(s);
            if (a <= 0) continue;
            if (s.broken) drawBrokenShip(ctx, s, time, a);
            else drawShip(ctx, s, time);
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
const OPEN_ALT = 2 / 3;   // ouverture après 1/3 de la chute : 2/3 du vol sous planeur
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
    const h = fallHeight(alt);
    // Perspective : plus proche de la caméra que le sol -> plus grand et décalé (parallaxe).
    // Celui que la caméra suit garde sa taille normale à l'écran pendant toute la chute.
    const pr = airProject(p.x, p.y, h, _fallProj);
    if (pr.alpha <= 0) return;           // au-dessus de la caméra : hors champ
    const s = pr.k;
    // L'ombre reste au sol, à la verticale (décalée par le soleil)
    const shx = p.x + h * SUN_X;
    const shy = p.y + h * SUN_Y;
    // Hors de la vue de l'image en cours (voir utils.frameView) : rien à dessiner.
    // Marge : envergure + lignes de vent + traînées.
    if (!inFrameView(pr.x, pr.y, r * s * 6) && !inFrameView(shx, shy, r * 3)) return;

    const f = {
        t: time || 0,
        alt,
        r,
        vx: p.vx || 0,
        vy: p.vy || 0,
        speed: Math.hypot(p.vx || 0, p.vy || 0),
        s,
        px: pr.x,                        // position à l'écran (projetée)
        py: pr.y,
        sh: 0.45 + 0.55 * (1 - alt),     // l'ombre grossit en se rapprochant...
        shA: 0.1 + (1 - alt) * 0.16,     // ... et devient plus nette
        shx,
        shy
    };

    ctx.save();
    ctx.globalAlpha *= pr.alpha;
    ctx.lineJoin = 'round';
    if (p.roofSlide) drawRoofSlide(ctx, p, f);
    else if (alt > OPEN_ALT) drawSkydiver(ctx, p, f);
    else drawGliding(ctx, p, f);
    ctx.restore();
}

/* ----- Glissade sur un toit ----- */
// Sur le toit : traces de glissade derrière, corps qui perd l'équilibre.
// Au bord : petit bond (le personnage grossit, son ombre se détache) puis réception.
function drawRoofSlide(ctx, p, f) {
    const s = p.roofSlide;
    const { t, r } = f;
    const hop = s.stage === 1 ? Math.sin(Math.PI * clamp(s.t / DROP_TIME, 0, 1)) : 0;
    const cx = Math.cos(s.dir);
    const cy = Math.sin(s.dir);

    // Ombre : sous les pieds sur le toit, puis décalée et plus petite pendant le bond
    ctx.save();
    ctx.globalAlpha *= 0.24 - hop * 0.08;
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.ellipse(p.x + hop * 14, p.y + hop * 20, r * (0.95 - hop * 0.2), r * (0.85 - hop * 0.2), 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // Traces de glissade sur le toit (deux sillons + traits de vitesse)
    if (s.stage === 0 && s.dist > 4) {
        const len = Math.min(s.dist, 26 + s.v * 0.09);
        const nx = -cy * r * 0.36;
        const ny = cx * r * 0.36;
        const bx = p.x - cx * r * 0.55;
        const by = p.y - cy * r * 0.55;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(10, 16, 48, 0.28)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        for (const k of SIDES) {
            ctx.moveTo(bx + nx * k, by + ny * k);
            ctx.lineTo(bx + nx * k - cx * len, by + ny * k - cy * len);
        }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const ph = (t * 3.2 + i / 3) % 1;
            const o = (i - 1) * r * 0.55;
            const d0 = r * 0.9 + ph * len * 0.8;
            ctx.moveTo(p.x - cy * o - cx * d0, p.y + cx * o - cy * d0);
            ctx.lineTo(p.x - cy * o - cx * (d0 + r * 0.7), p.y + cx * o - cy * (d0 + r * 0.7));
        }
        ctx.stroke();
        ctx.restore();
    }

    // Personnage : bascule de gauche à droite sur le toit, agrandi pendant le bond
    const wobble = s.stage === 0 ? Math.sin(t * 24) * 0.2 : (1 - hop) * 0.15;
    const sc = f.s * (1 + hop * 0.22);
    ctx.save();
    ctx.translate(f.px, f.py);
    ctx.scale(sc, sc);
    ctx.rotate(wobble);
    ctx.translate(-p.x, -p.y);
    drawPlayer(ctx, p, t);
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
    ctx.translate(f.px, f.py);
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

    // Sac à dos (on le voit de dos) : sac à forme équipé (ailes, cape...) ou sac classique
    ctx.save();
    ctx.translate(r * 0.6, 0);
    const packArt = !!p.packMotif && drawBackpack(ctx, p.packMotif, r * 0.85, pack, p.packAccent, t, seed);
    ctx.restore();
    if (!packArt) {
        ctx.beginPath();
        ctx.roundRect(-r * 0.52, -r * 0.38, r * 0.72, r * 0.76, r * 0.2);
        fillStroke(ctx, pack);
        ctx.beginPath();
        ctx.ellipse(-r * 0.3, -r * 0.18, r * 0.14, r * 0.08, 0, 0, TAU);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fill();
    }

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
    // Forme spéciale (soucoupe, dragon, feuille, dirigeable, scarabée) ou aile classique
    const art = (p.gliderStyle && GLIDER_ART[p.gliderStyle]) || null;

    // ----- Ombre au sol : personnage + aile, en un seul bloc -----
    ctx.save();
    ctx.translate(f.shx, f.shy);
    ctx.rotate(aim + yaw);
    ctx.scale(f.sh, f.sh);
    ctx.beginPath();
    ctx.moveTo(r * 0.95, 0);
    ctx.ellipse(0, 0, r * 0.95, r * 0.9, 0, 0, TAU);
    if (gs > 0.01) {
        if (art) {
            const [scx, srx, sry] = art.shadow;
            ctx.moveTo(r * (scx + srx) * gs, 0);
            ctx.ellipse(r * scx * gs, 0, r * srx * gs, r * sry * gs * flat, 0, 0, TAU);
        } else {
            tracePoly(ctx, WING_HALF, r * gs, r * gs * spanR, false);
            tracePoly(ctx, WING_HALF, r * gs, -r * gs * spanL, true);
        }
    }
    ctx.fillStyle = SHADOW;
    ctx.globalAlpha *= f.shA;
    ctx.fill();
    ctx.restore();

    // ----- Personnage (sous le planeur) -----
    ctx.save();
    ctx.translate(f.px, f.py);
    ctx.scale(s, s);
    ctx.translate(-p.x, -p.y);
    drawPlayer(ctx, p, t);
    ctx.restore();

    if (gs <= 0.01 && dp >= 1) return;

    // ----- Planeur -----
    ctx.save();
    ctx.translate(f.px, f.py);
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
                ctx.moveTo(gx, gy);
                if (art) {
                    const [ax2, ay2] = art.anchors[q];
                    ctx.lineTo(r * ax2 * gs, ay2 * sy);
                } else {
                    const u = q === 0 ? 0.3 : 0.62;
                    ctx.lineTo(r * wingX(u, false) * gs, wingY(u, false) * sy);
                }
            }
        }
        ctx.strokeStyle = 'rgba(10, 16, 48, 0.75)';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.save();
        ctx.scale(gs, gs);
        drawWingTrails(ctx, f, aim + yaw, spanR, spanL, art && art.tip);
        if (art) {
            // Perspective du virage : la forme s'aplatit un peu en largeur
            ctx.scale(1, flat);
            art.draw(ctx, r, colors, t, 3.2);
        } else {
            drawWing(ctx, r, bank, colors, spanR, spanL);
        }
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
// tip = bout d'aile [x, y] en rayons pour les planeurs à forme (sinon celui de l'aile classique)
function drawWingTrails(ctx, f, rot, spanR, spanL, tip = null) {
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
        const tx = tip ? r * tip[0] : (r * wingX(1, true) + r * wingX(1, false)) / 2;
        const ty = tip ? tip[1] * sy : (wingY(1, true) * sy + wingY(1, false) * sy) / 2;
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

// Ombre du vaisseau sur le sol : taille réelle, au niveau de la carte (donc bien plus
// petite que le vaisseau, qui est proche de la caméra) et décalée par le soleil
function drawShipShadow(ctx, ship, alpha = 1) {
    const x = ship.x + SHIP_HEIGHT * SUN_X;
    const y = ship.y + SHIP_HEIGHT * SUN_Y;
    if (!inFrameView(x, y, 160)) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    ctx.rotate(ship.angle);
    ctx.fillStyle = 'rgba(12, 24, 40, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 140, 46, 0, 0, Math.PI * 2);      // coque
    ctx.moveTo(30, 30);                                  // ailes
    ctx.lineTo(-70, 125);
    ctx.lineTo(-115, 125);
    ctx.lineTo(-95, 0);
    ctx.lineTo(-115, -125);
    ctx.lineTo(-70, -125);
    ctx.lineTo(30, -30);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// Vaisseau vu de dessus, orienté vers la droite puis tourné selon son angle.
// Dessiné à sa hauteur (perspective) : taille normale quand la caméra le suit.
function drawShip(ctx, ship, time) {
    const pr = airProject(ship.x, ship.y, SHIP_HEIGHT, _shipProj);
    if (pr.alpha <= 0 || !inFrameView(pr.x, pr.y, SHIP_EXTENT * pr.k)) return;

    ctx.save();
    ctx.globalAlpha *= pr.alpha;
    ctx.translate(pr.x, pr.y);
    ctx.scale(pr.k, pr.k);
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

/* ===================== BUS EN PANNE (1V1) ===================== */

// Opacité d'un vaisseau : 1 en service, fondu pendant qu'un bus abandonné s'éloigne
function shipFade(s) {
    if (s.active) return 1;
    return s.leave > 0 ? s.leave / BROKEN_LEAVE_TIME : 0;
}

// Petit hachage déterministe dans [0, 1) : flammes et étincelles sans Math.random au dessin
function hash01(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
}

// Taches de suie sur la coque [x, y, rx, ry, rotation]
const SOOT_SPOTS = [
    [-104, -18, 44, 22, 0.15], [-58, 28, 32, 15, -0.2], [22, -30, 28, 11, 0.1],
    [-18, 8, 18, 9, 0.4], [98, 24, 20, 9, -0.3]
];
// Trou dans la coque (polygone, centre approximatif -39, -19)
const HULL_HOLE = [-53, -25, -41, -32, -30, -26, -25, -15, -35, -8, -48, -11];
// Fissures en étoile sur la vitre du cockpit (depuis le point d'impact)
const COCKPIT_CRACKS = [[14, -8], [18, 6], [4, 16], [-12, 10], [-16, -4], [-4, -14]];

function polyFill(ctx, pts, cx = 0, cy = 0, scale = 1) {
    ctx.beginPath();
    ctx.moveTo(cx + (pts[0] - cx) * scale, cy + (pts[1] - cy) * scale);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(cx + (pts[i] - cx) * scale, cy + (pts[i + 1] - cy) * scale);
    ctx.closePath();
    ctx.fill();
}

function ellipseFill(ctx, x, y, rx, ry, rot = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
    ctx.fill();
}

/*
   Bus du 1V1 en panne, vu de dessus (même gabarit que le vaisseau classique) :
   - il tangue et tremble : il lutte pour rester en l'air ;
   - réacteur gauche en feu (flammes animées + lueur), réacteur droit mort qui tousse ;
   - aile droite arrachée (bord déchiqueté, câble qui pend, étincelles) ;
   - coque salie de suie, fissurée et trouée, bande de danger jaune / noir ;
   - cockpit fissuré avec alarme rouge, gyrophare qui balaie.
   alpha : fondu quand le bus abandonné s'éloigne après l'expulsion.
*/
function drawBrokenShip(ctx, ship, time, alpha = 1) {
    const pr = airProject(ship.x, ship.y, SHIP_HEIGHT, _shipProj);
    if (pr.alpha <= 0 || alpha <= 0 || !inFrameView(pr.x, pr.y, SHIP_EXTENT * pr.k)) return;
    const t = time + (ship.seed || 0);
    const wobble = Math.sin(t * 1.7) * 0.05 + Math.sin(t * 4.3) * 0.015;
    const step = Math.floor(t * 18); // les flammes et étincelles changent ~18 fois / s
    const alarm = Math.sin(t * 7) > 0;

    ctx.save();
    ctx.globalAlpha *= pr.alpha * alpha;
    const A = ctx.globalAlpha;
    ctx.translate(pr.x, pr.y);
    ctx.scale(pr.k, pr.k);
    ctx.rotate(ship.angle + wobble);
    ctx.translate(Math.sin(t * 23) * 1.6, Math.cos(t * 19) * 1.3); // secousses
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 6;

    // ----- 1) Réacteur gauche en feu : 3 langues de flamme qui vacillent -----
    for (let i = 0; i < 3; i++) {
        const len = 48 + hash01(step * 3 + i) * 40 - i * 10;
        const wid = 15 - i * 4;
        const off = (hash01(step * 5 + i) - 0.5) * 12;
        ctx.fillStyle = i === 0 ? '#ff3b1f' : i === 1 ? '#ff9d00' : '#ffe03d';
        ctx.beginPath();
        ctx.moveTo(-146, -36 - wid);
        ctx.quadraticCurveTo(-150 - len * 0.6, -36 - wid * 0.8 + off, -150 - len, -36 + off * 0.5);
        ctx.quadraticCurveTo(-150 - len * 0.6, -36 + wid * 0.8 + off, -146, -36 + wid);
        ctx.closePath();
        ctx.fill();
    }
    // Réacteur droit : il tousse de temps en temps (petite gerbe orange)
    if (Math.sin(t * 13) > 0.72) {
        ctx.fillStyle = '#ff9d00';
        ellipseFill(ctx, -162, 36, 15, 7);
        ctx.fillStyle = '#ffe03d';
        ellipseFill(ctx, -156, 36, 7, 4);
    }

    // ----- 2) Ailes : gauche roussie, droite arrachée -----
    ctx.fillStyle = '#2d5aa3';
    ctx.beginPath();
    ctx.moveTo(30, -30);
    ctx.lineTo(-70, -125);
    ctx.lineTo(-115, -125);
    ctx.lineTo(-95, -30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(30, 30);
    ctx.lineTo(-22, 78);
    ctx.lineTo(-37, 69);
    ctx.lineTo(-46, 93);
    ctx.lineTo(-62, 83);
    ctx.lineTo(-74, 102);
    ctx.lineTo(-86, 88);
    ctx.lineTo(-95, 30);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Brûlures
    ctx.globalAlpha = A * 0.5;
    ctx.fillStyle = '#140e16';
    ellipseFill(ctx, -64, -80, 30, 15, -0.75);
    ellipseFill(ctx, -52, 62, 19, 10, 0.6);
    ctx.globalAlpha = A;
    // Feu de bout d'aile gauche : rouge seulement (l'autre est arraché)
    ctx.fillStyle = alarm ? '#ff334b' : '#5a1620';
    ctx.beginPath();
    ctx.arc(-92, -120, 8, 0, TAU);
    ctx.fill();
    // Câble arraché qui pend au bout de l'aile droite
    ctx.strokeStyle = '#1b1620';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-74, 101);
    ctx.quadraticCurveTo(-78 + Math.sin(t * 5) * 4, 114, -90 + Math.sin(t * 4) * 6, 121);
    ctx.stroke();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 6;

    // ----- 3) Réacteurs : carcasses fissurées, le gauche rougeoie -----
    for (const side of SIDES) {
        ctx.fillStyle = side < 0 ? '#4b3a3b' : '#3b4150';
        ctx.beginPath();
        ctx.roundRect(-150, side * 36 - 17, 70, 34, 10);
        ctx.fill();
        ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const side of SIDES) {
        ctx.moveTo(-138, side * 36 - 8);
        ctx.lineTo(-125, side * 36 + 2);
        ctx.lineTo(-112, side * 36 - 6);
        ctx.lineTo(-100, side * 36 + 4);
    }
    ctx.stroke();
    ctx.globalAlpha = A * (0.55 + Math.sin(t * 11) * 0.2);
    ctx.fillStyle = '#ff5a2a';
    ellipseFill(ctx, -146, -36, 8, 13);
    ctx.globalAlpha = A;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 6;

    // ----- 4) Coque salie, bande de danger, suie, trou et fissures -----
    ctx.fillStyle = '#c1c7d1';
    ctx.beginPath();
    ctx.ellipse(0, 0, 140, 46, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(-10, 0, 112, 13, 0, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#ffd21e';
    ctx.fillRect(-125, -14, 232, 28);
    ctx.fillStyle = '#16121c';
    ctx.beginPath();
    for (let x = -132; x < 110; x += 24) {
        ctx.moveTo(x, -14);
        ctx.lineTo(x + 12, -14);
        ctx.lineTo(x + 2, 14);
        ctx.lineTo(x - 10, 14);
        ctx.closePath();
    }
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, 137, 43, 0, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = A * 0.42;
    ctx.fillStyle = '#1b1620';
    for (const [x, y, rx, ry, rot] of SOOT_SPOTS) ellipseFill(ctx, x, y, rx, ry, rot);
    ctx.restore();

    // Trou : bord rougeoyant puis intérieur noir
    ctx.globalAlpha = A * (0.75 + Math.sin(t * 9) * 0.2);
    ctx.fillStyle = '#ff7a1a';
    polyFill(ctx, HULL_HOLE, -39, -19, 1.3);
    ctx.globalAlpha = A;
    ctx.fillStyle = '#0b0710';
    polyFill(ctx, HULL_HOLE);

    ctx.strokeStyle = 'rgba(20, 14, 24, 0.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(60, -40);
    ctx.lineTo(48, -24);
    ctx.lineTo(56, -12);
    ctx.lineTo(40, 2);
    ctx.lineTo(47, 15);
    ctx.moveTo(-70, 42);
    ctx.lineTo(-80, 28);
    ctx.lineTo(-71, 19);
    ctx.lineTo(-84, 8);
    ctx.stroke();

    // ----- 5) Cockpit : vitre fissurée, alarme rouge à l'intérieur -----
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 6;
    ctx.fillStyle = '#2a8cad';
    ctx.beginPath();
    ctx.ellipse(78, 0, 38, 24, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (alarm) {
        ctx.globalAlpha = A * 0.5;
        ctx.fillStyle = '#ff2a3c';
        ellipseFill(ctx, 78, 0, 34, 20);
        ctx.globalAlpha = A;
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [dx, dy] of COCKPIT_CRACKS) {
        ctx.moveTo(90, -6);
        ctx.lineTo(90 + dx, -6 + dy);
    }
    ctx.stroke();

    // ----- 6) Gyrophare : faisceau rouge qui tourne -----
    const beam = t * 6;
    ctx.globalAlpha = A * 0.26;
    ctx.fillStyle = '#ff334b';
    ctx.beginPath();
    ctx.moveTo(40, 0);
    ctx.arc(40, 0, 130, beam - 0.32, beam + 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = A;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.fillStyle = alarm ? '#ff334b' : '#8a1626';
    ctx.beginPath();
    ctx.arc(40, 0, 10, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ellipseFill(ctx, 37, -3, 3.5, 3.5);

    // ----- 7) Étincelles : aile arrachée et réacteur mort -----
    ctx.strokeStyle = '#ffe58a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const s = step * 7 + i * 13;
        if (hash01(s) > 0.6) continue;
        const fromWing = i < 4;
        const ox = fromWing ? -74 : -112;
        const oy = fromWing ? 101 : 52;
        const a = hash01(s + 1) * TAU;
        const l = 8 + hash01(s + 2) * 18;
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.cos(a) * l, oy + Math.sin(a) * l);
    }
    ctx.stroke();

    ctx.restore();
}
