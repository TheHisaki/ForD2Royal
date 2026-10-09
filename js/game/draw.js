/* ==================================
   DESSIN - FOR2D ROYAL
   Toutes les fonctions qui dessinent le sol, les bâtiments,
   les objets et le joueur (style cartoon façon ZombsRoyale).
   ================================== */

import { B, BIOME_COLORS } from './config.js?v=12';
import { shadeHex, fighterSeed } from './utils.js';
import { WEAPONS, HEALS, THROWABLES, drawWeapon } from './weapons.js';
import { iconCanvas } from './icons.js';
import { drawBackpack } from './backpack-art.js';

const OUTLINE = '#0a1030';
const TAU = Math.PI * 2;

/* ===================== SOL ===================== */

// Écrit la couleur du sol (r, g, b, 255) dans "data" à l'index i
// colors : palette du thème de la carte (BIOME_COLORS par défaut)
export function groundRGB(data, i, s, colors = BIOME_COLORS) {
    const c = colors[s.biome] || colors[B.PLAINE];
    const sh = s.shade;
    let k;
    switch (s.biome) {
        case B.OCEAN:
        case B.SHALLOW:
        case B.LAC:    k = 0.97 + sh * 0.06; break;
        case B.DESERT: k = 0.94 + sh * 0.08; break;
        case B.NEIGE:  k = 0.97 + sh * 0.04; break;
        case B.BEACH:  k = 0.97 + sh * 0.05; break;
        default:       k = 0.91 + sh * 0.13;
    }
    let r = c[0] * k;
    let g = c[1] * k;
    let b = c[2] * k;
    if (s.edge > 0) {
        // Bordure sombre entre deux biomes
        const m = 1 - 0.22 * s.edge;
        r *= m; g *= m; b *= m;
    } else if (s.edge < 0) {
        // Écume : moitié blanc
        r = (r + 255) * 0.5; g = (g + 255) * 0.5; b = (b + 255) * 0.5;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
}

/* ===================== ROUTES ===================== */

function roadPath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
}

// Tous les contours d'abord, puis tous les remplissages : croisements propres
export function drawRoads(ctx, roads, extra = 0) {
    if (!roads.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const r of roads) {
        ctx.strokeStyle = r.edge || '#8b6540';
        ctx.lineWidth = r.width + 14 + extra;
        roadPath(ctx, r.points);
        ctx.stroke();
    }
    for (const r of roads) {
        ctx.strokeStyle = r.fill || '#c69d66';
        ctx.lineWidth = r.width + extra;
        roadPath(ctx, r.points);
        ctx.stroke();
    }
    // Routes pavées (thème) : rangées de pavés en pointillés
    for (const r of roads) {
        if (!r.cobble) continue;
        ctx.strokeStyle = r.cobble;
        ctx.lineCap = 'butt';
        ctx.setLineDash([14, 10]);
        for (const k of [0.62, 0.22]) {
            ctx.lineWidth = r.width * k;
            roadPath(ctx, r.points);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.lineCap = 'round';
    }
    // Routes bétonnées (thème) : marquage central blanc en tirets
    for (const r of roads) {
        if (!r.dash) continue;
        ctx.strokeStyle = r.dash;
        ctx.lineCap = 'butt';
        ctx.lineWidth = 5;
        ctx.setLineDash([26, 22]);
        roadPath(ctx, r.points);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineCap = 'round';
    }
    ctx.restore();
}

/* ===================== PLACES ===================== */

export function drawPlaza(ctx, town) {
    const R = town.plazaR;
    ctx.save();
    ctx.beginPath();
    ctx.arc(town.x, town.y, R, 0, TAU);
    ctx.fillStyle = town.plaza;
    ctx.fill();

    if (town.pattern === 'tiles') {
        // Dalles de grès : quadrillage légèrement décalé
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(80, 30, 10, 0.16)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let y = town.y - R; y <= town.y + R; y += 44) {
            ctx.moveTo(town.x - R, y);
            ctx.lineTo(town.x + R, y);
            const shift = Math.round((y - town.y + R) / 44) % 2 ? 22 : 0;
            for (let x = town.x - R + shift; x <= town.x + R; x += 44) {
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + 44);
            }
        }
        ctx.stroke();
        ctx.restore();
    }

    if (town.pattern === 'arena') {
        // Dalle centrale : grandes dalles claires, anneaux de marquage et rond central
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(40, 55, 70, 0.13)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let v = -R; v <= R; v += 64) {
            ctx.moveTo(town.x + v, town.y - R);
            ctx.lineTo(town.x + v, town.y + R);
            ctx.moveTo(town.x - R, town.y + v);
            ctx.lineTo(town.x + R, town.y + v);
        }
        ctx.stroke();
        ctx.restore();
        ctx.save();
        ctx.lineCap = 'butt';
        ctx.strokeStyle = '#f0c23a';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.arc(town.x, town.y, R * 0.72, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 6;
        ctx.setLineDash([30, 24]);
        ctx.beginPath();
        ctx.arc(town.x, town.y, R * 0.88, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(town.x, town.y, R * 0.16, 0, TAU);
        ctx.fillStyle = 'rgba(240,194,58,0.9)';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.restore();
    }

    if (town.pattern === 'lanes') {
        // Aire d'asphalte : marquages blancs en tirets
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.32)';
        ctx.lineWidth = 5;
        ctx.lineCap = 'butt';
        ctx.setLineDash([34, 26]);
        ctx.beginPath();
        for (let v = -R + 35; v < R; v += 70) {
            ctx.moveTo(town.x + v, town.y - R);
            ctx.lineTo(town.x + v, town.y + R);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    if (town.style === 'city' || town.pattern === 'rings') {
        // Pavés : cercles concentriques + lignes radiales
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = 'rgba(0,0,0,0.08)';
        ctx.lineWidth = 3;
        for (let rr = 40; rr < R; rr += 40) {
            ctx.beginPath();
            ctx.arc(town.x, town.y, rr, 0, TAU);
            ctx.stroke();
        }
        const n = 16;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            ctx.moveTo(town.x + Math.cos(a) * 40, town.y + Math.sin(a) * 40);
            ctx.lineTo(town.x + Math.cos(a) * R, town.y + Math.sin(a) * R);
        }
        ctx.stroke();
        ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(town.x, town.y, R, 0, TAU);
    ctx.strokeStyle = town.plazaEdge;
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.restore();
}

/* ===================== CHAMPS ===================== */

export function drawField(ctx, f) {
    ctx.save();
    ctx.fillStyle = '#8c6a3f';
    ctx.fillRect(f.x, f.y, f.w, f.h);

    // Rangées de cultures
    ctx.strokeStyle = f.crop === 'wheat' ? '#e4c450' : '#72b646';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    const m = 18; // marge intérieure
    ctx.beginPath();
    if (f.vertical) {
        for (let x = f.x + 24; x < f.x + f.w - 10; x += 34) {
            ctx.moveTo(x, f.y + m);
            ctx.lineTo(x, f.y + f.h - m);
        }
    } else {
        for (let y = f.y + 24; y < f.y + f.h - 10; y += 34) {
            ctx.moveTo(f.x + m, y);
            ctx.lineTo(f.x + f.w - m, y);
        }
    }
    ctx.stroke();

    // Clôture en pointillés
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#6e4a2a';
    ctx.lineWidth = 6;
    ctx.setLineDash([16, 10]);
    ctx.strokeRect(f.x, f.y, f.w, f.h);
    ctx.setLineDash([]);
    ctx.restore();
}

/* ===================== BÂTIMENTS ===================== */

export function drawBuildingBase(ctx, b) {
    ctx.save();
    // Ombre
    ctx.fillStyle = 'rgba(12,24,40,0.22)';
    ctx.fillRect(b.x + 16, b.y + 20, b.w, b.h);

    // Sol + planches
    ctx.fillStyle = b.floor;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (b.w >= b.h) {
        for (let y = b.y + 28; y < b.y + b.h; y += 28) {
            ctx.moveTo(b.x, y);
            ctx.lineTo(b.x + b.w, y);
        }
    } else {
        for (let x = b.x + 28; x < b.x + b.w; x += 28) {
            ctx.moveTo(x, b.y);
            ctx.lineTo(x, b.y + b.h);
        }
    }
    ctx.stroke();

    // Murs
    ctx.fillStyle = b.wall;
    for (const w of b.walls) ctx.fillRect(w.x, w.y, w.w, w.h);

    // Entrées au sol : marche de pierre dehors, seuil dans le mur, paillasson dedans
    if (b.doors) {
        const col = doorColors(b);
        for (const d of b.doors) {
            ctx.save();
            doorFrame(ctx, b, d);
            const dw = d.w;
            // Marche devant l'auvent
            ctx.beginPath();
            ctx.roundRect(-dw * 0.36, -AWNING_DEPTH - 24, dw * 0.72, 17, 5);
            ctx.fillStyle = col.step;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.fillStyle = col.stepLight;
            ctx.fillRect(-dw * 0.36 + 5, -AWNING_DEPTH - 21, dw * 0.72 - 10, 3);
            // Seuil (dans l'épaisseur du mur)
            ctx.fillStyle = col.step;
            ctx.fillRect(-dw / 2, 0, dw, WALL_T);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
            ctx.fillRect(-dw / 2, WALL_T - 3, dw, 3);
            // Paillasson rayé, à la couleur du bâtiment
            const mw = dw * 0.62;
            ctx.beginPath();
            ctx.roundRect(-mw / 2, WALL_T + 5, mw, 20, 4);
            ctx.fillStyle = col.mat;
            ctx.fill();
            ctx.strokeStyle = col.edge;
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.strokeStyle = col.stripe;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-mw / 2 + 6, WALL_T + 11);
            ctx.lineTo(mw / 2 - 6, WALL_T + 11);
            ctx.moveTo(-mw / 2 + 6, WALL_T + 19);
            ctx.lineTo(mw / 2 - 6, WALL_T + 19);
            ctx.stroke();
            ctx.restore();
        }
    }
    ctx.restore();
}

/* ----- Entrées des bâtiments ----- */

const WALL_T = 16;          // épaisseur des murs (voir world.js)
const AWNING_DEPTH = 30;    // l'auvent dépasse de 30 unités (+ festons) à l'extérieur du mur
const AWNING_NEAR = -2;     // il recouvre un peu le bord du toit (qui déborde de 8)

// Couleurs de l'entrée, tirées du toit et du sol du bâtiment (calculées une seule fois)
function doorColors(b) {
    if (b._doorCol) return b._doorCol;
    const roof = /^#[0-9a-f]{6}$/i.test(b.roof) ? b.roof : '#d84a3f';
    const floor = /^#[0-9a-f]{6}$/i.test(b.floor) ? b.floor : '#cdb693';
    b._doorCol = {
        awning: roof,
        stripe: shadeHex(roof, 0.6),
        edge: shadeHex(roof, -0.45),
        mat: shadeHex(roof, -0.15),
        step: shadeHex(floor, -0.22),
        stepLight: shadeHex(floor, 0.15),
        post: /^#[0-9a-f]{6}$/i.test(b.wall) ? shadeHex(b.wall, 0.25) : '#5a6070'
    };
    return b._doorCol;
}

// Tailles de l'auvent selon la largeur de la porte
function awningSize(d) {
    const near = Math.min(d.w * 0.9 + 10, 150);
    return { near, far: near - 18, n: Math.max(3, Math.round((near - 18) / 16)) };
}

// Contour de l'auvent : trapèze collé au mur, bord extérieur en festons
function awningPath(ctx, s) {
    const seg = s.far / s.n;
    ctx.beginPath();
    ctx.moveTo(-s.near / 2, AWNING_NEAR);
    ctx.lineTo(-s.far / 2, -AWNING_DEPTH);
    for (let i = 0; i < s.n; i++) {
        const x0 = -s.far / 2 + i * seg;
        ctx.quadraticCurveTo(x0 + seg / 2, -AWNING_DEPTH - 8, x0 + seg, -AWNING_DEPTH);
    }
    ctx.lineTo(s.near / 2, AWNING_NEAR);
    ctx.closePath();
}

// Place le repère local de la porte : origine au milieu de l'ouverture, sur le bord
// extérieur du mur, +y vers l'intérieur du bâtiment (-y = dehors)
const DOOR_ROT = { top: 0, bottom: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };
function doorFrame(ctx, b, d) {
    let x = b.x + b.w / 2;
    let y = b.y + b.h / 2;
    if (d.side === 'top') y = b.y;
    else if (d.side === 'bottom') y = b.y + b.h;
    else if (d.side === 'left') x = b.x;
    else x = b.x + b.w;
    ctx.translate(x, y);
    ctx.rotate(DOOR_ROT[d.side] || 0);
}

// Auvents rayés à la couleur du toit + flèche qui oscille doucement vers l'intérieur.
// Dessinés PAR-DESSUS le toit : on voit les entrées de loin, même toit fermé.
// Auvent d'un bâtiment dans la corruption : toile violet / noir
const CORRUPT_DOOR = {
    awning: '#3a1454', stripe: '#6d2a99', edge: '#0d0318', mat: '#2b0f3f',
    step: '#241433', stepLight: '#3d2653', post: '#1a0a26'
};

export function drawDoorMarkers(ctx, b, time = 0, corrupt = false) {
    if (!b.doors || !b.doors.length) return;
    const col = corrupt ? CORRUPT_DOOR : doorColors(b);
    for (let k = 0; k < b.doors.length; k++) {
        const d = b.doors[k];
        const s = awningSize(d);

        // Ombre portée (décalée en coordonnées monde, comme le reste des ombres)
        ctx.save();
        ctx.translate(6, 8);
        doorFrame(ctx, b, d);
        awningPath(ctx, s);
        ctx.fillStyle = 'rgba(12, 24, 40, 0.22)';
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        doorFrame(ctx, b, d);

        // Toile : fond couleur du toit + bandes claires qui s'évasent vers le mur
        awningPath(ctx, s);
        ctx.fillStyle = col.awning;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = col.stripe;
        ctx.beginPath();
        for (let i = 1; i < s.n; i += 2) {
            const n0 = -s.near / 2 + (i * s.near) / s.n;
            const n1 = -s.near / 2 + ((i + 1) * s.near) / s.n;
            const f0 = -s.far / 2 + (i * s.far) / s.n;
            const f1 = -s.far / 2 + ((i + 1) * s.far) / s.n;
            ctx.moveTo(n0, AWNING_NEAR + 2);
            ctx.lineTo(f0, -AWNING_DEPTH - 10);
            ctx.lineTo(f1, -AWNING_DEPTH - 10);
            ctx.lineTo(n1, AWNING_NEAR + 2);
            ctx.closePath();
        }
        ctx.fill();
        // Pli sombre contre le mur + reflet sur le bord extérieur
        ctx.fillStyle = 'rgba(10, 16, 48, 0.22)';
        ctx.fillRect(-s.near / 2, -8, s.near, 7);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(-s.far / 2, -AWNING_DEPTH - 8, s.far, 7);
        ctx.restore();

        // Neige sur le bord (villages de montagne)
        if (b.snow) {
            ctx.beginPath();
            ctx.moveTo(-s.far / 2 + 4, -AWNING_DEPTH + 1);
            ctx.lineTo(s.far / 2 - 4, -AWNING_DEPTH + 1);
            ctx.strokeStyle = '#f4f8fc';
            ctx.lineWidth = 5;
            ctx.stroke();
        }

        // Contour (couleur sombre du toit, puis trait cartoon)
        awningPath(ctx, s);
        ctx.strokeStyle = col.edge;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Montants de porte aux 2 coins (couleur des murs)
        ctx.fillStyle = col.post;
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2.5;
        for (const sx of [-1, 1]) {
            ctx.beginPath();
            ctx.roundRect(sx * s.near / 2 - 6, AWNING_NEAR - 8, 12, 12, 3);
            ctx.fill();
            ctx.stroke();
        }

        // Flèche vers l'intérieur (petit va-et-vient, décalé par bâtiment)
        const bob = Math.sin(time * 4 + (b.id || 0) * 1.7 + k * 2) * 2.5;
        const cy = -AWNING_DEPTH / 2 - 3 + bob;
        ctx.beginPath();
        ctx.moveTo(-13, cy - 7);
        ctx.lineTo(0, cy + 7);
        ctx.lineTo(13, cy - 7);
        ctx.lineTo(0, cy - 1);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
    }
}

// Toit à 2 pans (faîtage dans le sens de la plus grande dimension)
function gableRoof(ctx, b, x, y, w, h) {
    const horizontal = w >= h;
    ctx.fillStyle = b.roofLight;
    if (horizontal) ctx.fillRect(x, y, w, h / 2);
    else ctx.fillRect(x, y, w / 2, h);
    ctx.fillStyle = b.roof;
    if (horizontal) ctx.fillRect(x, y + h / 2, w, h / 2);
    else ctx.fillRect(x + w / 2, y, w / 2, h);

    // Lignes de tuiles parallèles au faîtage
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (horizontal) {
        for (let yy = y + 24; yy < y + h; yy += 24) {
            ctx.moveTo(x, yy);
            ctx.lineTo(x + w, yy);
        }
    } else {
        for (let xx = x + 24; xx < x + w; xx += 24) {
            ctx.moveTo(xx, y);
            ctx.lineTo(xx, y + h);
        }
    }
    ctx.stroke();

    // Faîtage
    ctx.fillStyle = b.roofDark;
    if (horizontal) ctx.fillRect(x, y + h / 2 - 5, w, 10);
    else ctx.fillRect(x + w / 2 - 5, y, 10, h);
}

export function drawRoof(ctx, b) {
    if (b.alpha < 0.02) return;
    ctx.save();
    ctx.globalAlpha = b.alpha;
    const o = 8; // débord du toit
    const x = b.x - o;
    const y = b.y - o;
    const w = b.w + o * 2;
    const h = b.h + o * 2;

    if (b.roofType === 'flat') {
        ctx.fillStyle = b.roof;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = b.roofLight;
        ctx.fillRect(x + 20, y + 20, w - 40, h - 40);
        // Bouches d'aération
        ctx.fillStyle = b.roofDark;
        ctx.fillRect(x + w * 0.22, y + h * 0.3, 30, 22);
        ctx.fillRect(x + w * 0.62, y + h * 0.58, 22, 30);
    } else {
        gableRoof(ctx, b, x, y, w, h);
        if (b.roofType === 'barn') {
            ctx.strokeStyle = '#f4efe6';
            ctx.lineWidth = 6;
            ctx.strokeRect(x + 16, y + 16, w - 32, h - 32);
        }
    }

    // Neige le long des bords
    if (b.snow) {
        ctx.strokeStyle = '#f4f8fc';
        ctx.lineWidth = 12;
        ctx.strokeRect(x + 9, y + 9, w - 18, h - 18);
    }

    ctx.strokeStyle = b.roofDark;
    ctx.lineWidth = 6;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
}

/* ===================== OBJETS ===================== */

export function castsShadow(o) {
    return o.type !== 'fountain' && o.type !== 'deadbush' && o.type !== 'leaves';
}

export function drawShadow(ctx, o) {
    if (o.w) {
        // Couvertures rectangulaires : ombre portée décalée
        ctx.fillStyle = 'rgba(12,24,40,0.22)';
        const off = o.type === 'barrier' ? 7 : 12;
        roundRectPath(ctx, o.x - o.w / 2 + off, o.y - o.h / 2 + off * 1.3, o.w, o.h, 6);
        ctx.fill();
        return;
    }
    const rr = o.layer === 'top' ? o.r * 0.95 : o.r;
    ctx.fillStyle = 'rgba(12,24,40,0.18)';
    ctx.beginPath();
    ctx.ellipse(o.x + o.r * 0.16, o.y + o.r * 0.22, rr, rr * 0.92, 0, 0, TAU);
    ctx.fill();
}

// Trace un polygone à partir de décalages relatifs (Float32Array x, y, ...)
function polyPath(ctx, cx, cy, pts, scale = 1) {
    ctx.beginPath();
    ctx.moveTo(cx + pts[0] * scale, cy + pts[1] * scale);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(cx + pts[i] * scale, cy + pts[i + 1] * scale);
    ctx.closePath();
}

/*
   Feuillages (couche 'top') : redessinés à chaque image, on garde leurs contours
   en Path2D (construits une seule fois, ~26 points chacun) au lieu de retracer
   les points un par un. Les objets au sol, dessinés une fois dans les chunks,
   gardent le tracé direct (pas de mémoire en plus).
   Renvoie le Path2D à utiliser, ou null si le chemin a été tracé sur ctx.
*/
const HAS_PATH2D = typeof Path2D !== 'undefined';

function polyShape(ctx, o, slot, cx, cy, pts, scale = 1) {
    if (!HAS_PATH2D || o.layer !== 'top') {
        polyPath(ctx, cx, cy, pts, scale);
        return null;
    }
    // Cache invalidé si l'objet change de place ou de taille
    if (!o._paths || o._px !== o.x || o._py !== o.y || o._pr !== o.r) {
        o._paths = [];
        o._px = o.x;
        o._py = o.y;
        o._pr = o.r;
    }
    let p = o._paths[slot];
    if (!p) {
        p = new Path2D();
        p.moveTo(cx + pts[0] * scale, cy + pts[1] * scale);
        for (let i = 2; i < pts.length; i += 2) p.lineTo(cx + pts[i] * scale, cy + pts[i + 1] * scale);
        p.closePath();
        o._paths[slot] = p;
    }
    return p;
}

function fillShape(ctx, p, fill) {
    ctx.fillStyle = fill;
    if (p) ctx.fill(p);
    else ctx.fill();
}

function fillStrokeShape(ctx, p, fill, stroke, lw) {
    ctx.fillStyle = fill;
    if (p) ctx.fill(p);
    else ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    if (p) ctx.stroke(p);
    else ctx.stroke();
}

function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
}

function fillStroke(ctx, fill, stroke, lw) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
}

/* ----- Couvertures de la carte Gun Game (vues de dessus) ----- */

// Conteneur maritime : tôle ondulée, bande claire, portes à un bout, coins en fonte
function drawContainer(ctx, o) {
    const x0 = o.x - o.w / 2;
    const y0 = o.y - o.h / 2;
    const horiz = o.w >= o.h;
    const L = horiz ? o.w : o.h;
    const S = horiz ? o.h : o.w;
    ctx.save();
    roundRectPath(ctx, x0, y0, o.w, o.h, 5);
    ctx.fillStyle = o.base;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Bande claire le long d'un grand côté (lumière venant du haut à gauche)
    ctx.fillStyle = o.light;
    if (horiz) ctx.fillRect(x0, y0, o.w, S * 0.2);
    else ctx.fillRect(x0, y0, S * 0.2, o.h);
    // Ondulations perpendiculaires au grand axe
    ctx.lineCap = 'butt';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    for (let d = 14; d < L - 10; d += 14) {
        if (horiz) {
            ctx.moveTo(x0 + d, y0 + 6);
            ctx.lineTo(x0 + d, y0 + o.h - 6);
        } else {
            ctx.moveTo(x0 + 6, y0 + d);
            ctx.lineTo(x0 + o.w - 6, y0 + d);
        }
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let d = 18; d < L - 10; d += 14) {
        if (horiz) {
            ctx.moveTo(x0 + d, y0 + 6);
            ctx.lineTo(x0 + d, y0 + o.h - 6);
        } else {
            ctx.moveTo(x0 + 6, y0 + d);
            ctx.lineTo(x0 + o.w - 6, y0 + d);
        }
    }
    ctx.stroke();
    // Portes à un bout : bande sombre + barres de verrouillage
    const band = 18;
    const atEnd = o.door === 1;
    ctx.fillStyle = o.dark;
    if (horiz) ctx.fillRect(atEnd ? x0 + o.w - band : x0, y0, band, o.h);
    else ctx.fillRect(x0, atEnd ? y0 + o.h - band : y0, o.w, band);
    ctx.strokeStyle = o.light;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const k of [0.33, 0.67]) {
        if (horiz) {
            const bx = atEnd ? x0 + o.w - band : x0;
            ctx.moveTo(bx + 4, y0 + o.h * k);
            ctx.lineTo(bx + band - 4, y0 + o.h * k);
        } else {
            const by = atEnd ? y0 + o.h - band : y0;
            ctx.moveTo(x0 + o.w * k, by + 4);
            ctx.lineTo(x0 + o.w * k, by + band - 4);
        }
    }
    ctx.stroke();
    ctx.restore();
    // Contour
    roundRectPath(ctx, x0, y0, o.w, o.h, 5);
    ctx.strokeStyle = o.dark;
    ctx.lineWidth = 5;
    ctx.stroke();
    // Coins en fonte
    ctx.fillStyle = '#2a3038';
    const c = 13;
    for (const [cx, cy] of [[x0, y0], [x0 + o.w - c, y0], [x0, y0 + o.h - c], [x0 + o.w - c, y0 + o.h - c]]) {
        ctx.fillRect(cx, cy, c, c);
    }
    ctx.restore();
}

// Caisse : bois (planches + croisillon) ou métal (panneau + rivets)
function drawCrate(ctx, o) {
    const x0 = o.x - o.w / 2;
    const y0 = o.y - o.h / 2;
    const { w, h } = o;
    const m = 7;
    ctx.save();
    ctx.lineCap = 'butt';
    roundRectPath(ctx, x0, y0, w, h, 4);
    ctx.fillStyle = o.base;
    ctx.fill();
    if (o.metal) {
        // Panneau central embouti + rivets aux coins
        roundRectPath(ctx, x0 + m + 3, y0 + m + 3, w - 2 * (m + 3), h - 2 * (m + 3), 3);
        ctx.fillStyle = o.light;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(o.x, y0 + m + 6);
        ctx.lineTo(o.x, y0 + h - m - 6);
        ctx.moveTo(x0 + m + 6, o.y);
        ctx.lineTo(x0 + w - m - 6, o.y);
        ctx.stroke();
        ctx.fillStyle = o.dark;
        for (const [rx, ry] of [[x0 + 6, y0 + 6], [x0 + w - 6, y0 + 6], [x0 + 6, y0 + h - 6], [x0 + w - 6, y0 + h - 6]]) {
            circle(ctx, rx, ry, 2.6);
            ctx.fill();
        }
    } else {
        // Planches
        ctx.strokeStyle = 'rgba(60,30,10,0.28)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const k of [1 / 3, 2 / 3]) {
            ctx.moveTo(x0 + m, y0 + h * k);
            ctx.lineTo(x0 + w - m, y0 + h * k);
        }
        ctx.stroke();
        // Cadre intérieur
        ctx.strokeStyle = o.light;
        ctx.lineWidth = 5;
        ctx.strokeRect(x0 + m / 2 + 1, y0 + m / 2 + 1, w - m - 2, h - m - 2);
        // Croisillon
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(x0 + m, y0 + m);
        ctx.lineTo(x0 + w - m, y0 + h - m);
        ctx.moveTo(x0 + w - m, y0 + m);
        ctx.lineTo(x0 + m, y0 + h - m);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(60,30,10,0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
    roundRectPath(ctx, x0, y0, w, h, 4);
    ctx.strokeStyle = o.dark;
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.restore();
}

// Barrière en béton : arête claire au sommet, bouts rayés jaune et noir
function drawBarrier(ctx, o) {
    const x0 = o.x - o.w / 2;
    const y0 = o.y - o.h / 2;
    const horiz = o.w >= o.h;
    const S = horiz ? o.h : o.w;
    const rad = S * 0.32;
    ctx.save();
    roundRectPath(ctx, x0, y0, o.w, o.h, rad);
    ctx.fillStyle = o.base;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Bouts de signalisation
    const end = 20;
    const ends = horiz
        ? [[x0, y0, end, o.h], [x0 + o.w - end, y0, end, o.h]]
        : [[x0, y0, o.w, end], [x0, y0 + o.h - end, o.w, end]];
    for (const [ex, ey, ew, eh] of ends) {
        ctx.fillStyle = '#f2c230';
        ctx.fillRect(ex, ey, ew, eh);
        ctx.save();
        ctx.beginPath();
        ctx.rect(ex, ey, ew, eh);
        ctx.clip();
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 5;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        for (let d = -40; d < 60; d += 12) {
            ctx.moveTo(ex + d, ey);
            ctx.lineTo(ex + d + 30, ey + 30);
        }
        ctx.stroke();
        ctx.restore();
    }
    // Arête supérieure
    ctx.fillStyle = o.light;
    if (horiz) ctx.fillRect(x0 + end, o.y - S * 0.16, o.w - 2 * end, S * 0.32);
    else ctx.fillRect(o.x - S * 0.16, y0 + end, S * 0.32, o.h - 2 * end);
    ctx.restore();
    roundRectPath(ctx, x0, y0, o.w, o.h, rad);
    ctx.strokeStyle = o.dark;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
}

// Ne touche pas à globalAlpha (réglé par l'appelant)
export function drawObject(ctx, o) {
    const { x, y, r } = o;
    const lw = Math.max(3, r * 0.075);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    switch (o.type) {
        case 'container':
            drawContainer(ctx, o);
            break;
        case 'crate':
            drawCrate(ctx, o);
            break;
        case 'barrier':
            drawBarrier(ctx, o);
            break;
        case 'tree':
        case 'bush': {
            fillStrokeShape(ctx, polyShape(ctx, o, 0, x, y, o.pts), o.base, o.dark, lw);
            fillShape(ctx, polyShape(ctx, o, 1, x - r * 0.14, y - r * 0.16, o.pts, 0.6), o.light);
            break;
        }
        case 'pine': {
            fillStrokeShape(ctx, polyShape(ctx, o, 0, x, y, o.pts), o.base, o.dark, lw);
            fillShape(ctx, polyShape(ctx, o, 1, x - r * 0.06, y - r * 0.08, o.pts, 0.62), o.light);
            if (o.snowy) {
                fillShape(ctx, polyShape(ctx, o, 2, x - r * 0.04, y - r * 0.05, o.pts, 0.3), '#f4f8fc');
            }
            break;
        }
        case 'palm': {
            for (const a of o.leaves) {
                ctx.beginPath();
                ctx.ellipse(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.52, r * 0.2, a, 0, TAU);
                fillStroke(ctx, o.base, o.dark, Math.max(3, r * 0.06));
                // Nervure centrale
                ctx.beginPath();
                ctx.moveTo(x + Math.cos(a) * r * 0.1, y + Math.sin(a) * r * 0.1);
                ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
                ctx.strokeStyle = o.light;
                ctx.lineWidth = 3;
                ctx.stroke();
            }
            circle(ctx, x, y, r * 0.17);
            fillStroke(ctx, '#8a5a34', '#4a2f1f', 3);
            break;
        }
        case 'rock': {
            polyPath(ctx, x, y, o.pts);
            fillStroke(ctx, o.base, o.dark, Math.max(3, r * 0.07));
            polyPath(ctx, x - r * 0.14, y - r * 0.16, o.pts, 0.55);
            ctx.fillStyle = o.light;
            ctx.fill();
            if (o.snowy) {
                polyPath(ctx, x - r * 0.12, y - r * 0.18, o.pts, 0.45);
                ctx.fillStyle = '#f4f8fc';
                ctx.fill();
            }
            break;
        }
        case 'cactus': {
            circle(ctx, x, y, r);
            fillStroke(ctx, o.base, o.dark, lw);
            // Nervures
            ctx.strokeStyle = o.dark;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * TAU;
                ctx.moveTo(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2);
                ctx.lineTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85);
            }
            ctx.stroke();
            circle(ctx, x - r * 0.25, y - r * 0.28, r * 0.28);
            ctx.fillStyle = o.light;
            ctx.fill();
            if (o.flower) {
                circle(ctx, x + r * 0.35, y - r * 0.35, r * 0.3);
                fillStroke(ctx, '#ff6fa8', '#b83a6e', 2);
                circle(ctx, x + r * 0.35, y - r * 0.35, r * 0.11);
                ctx.fillStyle = '#ffe14d';
                ctx.fill();
            }
            break;
        }
        case 'deadbush': {
            ctx.strokeStyle = o.dark;
            ctx.lineWidth = 4;
            ctx.beginPath();
            for (const a of o.branches) {
                const ex = x + Math.cos(a) * r;
                const ey = y + Math.sin(a) * r;
                ctx.moveTo(x, y);
                ctx.lineTo(ex, ey);
                // Petite ramification
                const mx = x + Math.cos(a) * r * 0.55;
                const my = y + Math.sin(a) * r * 0.55;
                ctx.moveTo(mx, my);
                ctx.lineTo(mx + Math.cos(a + 0.7) * r * 0.35, my + Math.sin(a + 0.7) * r * 0.35);
            }
            ctx.stroke();
            ctx.strokeStyle = o.base;
            ctx.lineWidth = 2;
            ctx.stroke();
            break;
        }
        case 'leaves': {
            // Feuilles mortes éparpillées (3 teintes alternées)
            const s = o.spots;
            const colors = [o.base, o.alt || o.light, o.dark];
            for (let i = 0, k = 0; i < s.length; i += 3, k++) {
                ctx.beginPath();
                ctx.ellipse(x + s[i], y + s[i + 1], r * 0.26, r * 0.12, s[i + 2], 0, TAU);
                ctx.fillStyle = colors[k % 3];
                ctx.fill();
            }
            break;
        }
        case 'stump': {
            circle(ctx, x, y, r);
            fillStroke(ctx, o.base, o.dark, lw);
            circle(ctx, x, y, r * 0.72);
            ctx.fillStyle = '#d9b27a';
            ctx.fill();
            ctx.strokeStyle = '#a57a48';
            ctx.lineWidth = 2;
            circle(ctx, x, y, r * 0.48);
            ctx.stroke();
            circle(ctx, x, y, r * 0.22);
            ctx.stroke();
            break;
        }
        case 'hay': {
            circle(ctx, x, y, r);
            fillStroke(ctx, o.base, o.dark, lw);
            // Spirale
            ctx.beginPath();
            const turns = 3;
            const steps = 48;
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const a = t * turns * TAU;
                const rr = t * r * 0.8;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
            }
            ctx.strokeStyle = o.dark;
            ctx.lineWidth = 2.5;
            ctx.stroke();
            break;
        }
        case 'fountain': {
            circle(ctx, x, y, r);
            fillStroke(ctx, o.base, o.dark, 6);
            circle(ctx, x, y, r * 0.78);
            fillStroke(ctx, '#5bb2ec', '#3a8fd0', 3);
            circle(ctx, x, y, r * 0.52);
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = 3;
            ctx.stroke();
            circle(ctx, x, y, r * 0.2);
            fillStroke(ctx, o.light, o.dark, 4);
            circle(ctx, x, y, r * 0.09);
            ctx.fillStyle = '#bfe4ff';
            ctx.fill();
            break;
        }
        case 'well': {
            circle(ctx, x, y, r);
            fillStroke(ctx, o.base, o.dark, 5);
            circle(ctx, x, y, r * 0.62);
            fillStroke(ctx, '#1f4f7a', o.dark, 3);
            // Poutre en bois + poteaux
            ctx.beginPath();
            ctx.rect(x - r * 1.1, y - r * 0.12, r * 2.2, r * 0.24);
            fillStroke(ctx, '#8a5a34', '#4a2f1f', 3);
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.rect(x + s * r * 1.1 - r * 0.15, y - r * 0.15, r * 0.3, r * 0.3);
                fillStroke(ctx, '#6e4a2a', '#4a2f1f', 3);
            }
            break;
        }
        default: {
            circle(ctx, x, y, r);
            fillStroke(ctx, o.base || '#888', o.dark || '#444', lw);
        }
    }
}

/* ===================== JOUEUR ===================== */

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function roundRectPath(ctx, x, y, w, h, rad) {
    ctx.beginPath();
    roundRectSub(ctx, x, y, w, h, rad);
}

// Ajoute un rectangle arrondi au chemin en cours (sens horaire, comme arc et ellipse :
// plusieurs formes réunies dans un même chemin se remplissent d'un seul bloc)
function roundRectSub(ctx, x, y, w, h, rad) {
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.arcTo(x + w, y, x + w, y + rad, rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
    ctx.lineTo(x + rad, y + h);
    ctx.arcTo(x, y + h, x, y + h - rad, rad);
    ctx.lineTo(x, y + rad);
    ctx.arcTo(x, y, x + rad, y, rad);
    ctx.closePath();
}

// Petit objet de soin tenu entre les mains (repère local : devant = +x)
function drawHealItem(ctx, itemId, r) {
    // Même icône que dans l'inventaire, tenue entre les mains (tournée vers l'avant)
    const icon = iconCanvas('heal', itemId, 0, 64, false);
    if (icon) {
        const sz = r * 0.95;
        ctx.save();
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(icon, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
        return;
    }
    const h = HEALS[itemId];
    const accent = h ? h.color : '#6fdc70';
    ctx.lineJoin = 'round';
    if (itemId === 'medkit') {
        // Trousse rouge avec une croix blanche
        roundRectPath(ctx, -r * 0.26, -r * 0.34, r * 0.52, r * 0.68, r * 0.1);
        fillStroke(ctx, accent, OUTLINE, 2.5);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-r * 0.06, -r * 0.2, r * 0.12, r * 0.4);
        ctx.fillRect(-r * 0.2, -r * 0.06, r * 0.4, r * 0.12);
    } else if (itemId === 'shieldPotion') {
        // Fiole ronde bleue, goulot vers l'avant
        roundRectPath(ctx, r * 0.12, -r * 0.09, r * 0.22, r * 0.18, r * 0.05);
        fillStroke(ctx, '#d9e6f2', OUTLINE, 2.5);
        circle(ctx, -r * 0.04, 0, r * 0.26);
        fillStroke(ctx, accent, OUTLINE, 2.5);
        circle(ctx, -r * 0.11, -r * 0.09, r * 0.08);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill();
    } else {
        // Bandage : rouleau blanc cassé avec une bande verte
        roundRectPath(ctx, -r * 0.2, -r * 0.34, r * 0.4, r * 0.68, r * 0.14);
        fillStroke(ctx, '#f4ead2', OUTLINE, 2.5);
        ctx.fillStyle = accent;
        ctx.fillRect(-r * 0.2 + 1.5, -r * 0.06, r * 0.4 - 3, r * 0.12);
    }
}

/* ----- Skins (voir js/cosmetics.js : style + couleurs en jeu) ----- */

const NO_COLORS = Object.freeze({});
const HEX6 = /^#[0-9a-f]{6}$/i;
const BONE_DARK = '#1a1026';     // orbites du crâne
const VISOR_SLIT = '#141a2e';    // fente du heaume
const NOZZLE = '#5b6680';        // tuyères du réacteur
const NOZZLE_IN = '#262c40';
const ANTENNA = '#c9d2e0';
const SCABBARD = '#3d3560';      // fourreau du katana
const WRAP = '#e8e2d0';          // poignée tressée
const TSUBA = '#ffd24a';         // garde dorée

const BREAD = '#d9a05b';         // baguette du chef
const BREAD_CUT = '#a8692e';
const TOQUE = '#fbfcff';
const HAT = '#1c1f33';           // tricorne du corsaire
const PARROT = '#2ec27e';
const PARROT_D = '#1f8f5a';
const HOOD_HOLE = '#0d0a24';     // ouverture sombre de la capuche de l'archimage
const MECHA_JOINT = '#2b3245';

const HELM = '#c9d2dd';          // casque du viking
const HELM_D = '#8d97a8';
const HORN = '#f4ead2';
const SHIELD_WOOD = '#b97a3c';
const FUR = '#9a7a56';           // col de fourrure
const BURLAP = '#c89a5a';        // sac de bonbons du roi citrouille
const CANDY = ['#ff5d8f', '#4fe8ff', '#ffe03d'];
const FIRE = '#ffb21f';          // souffle du dragon
const FIRE_IN = '#ffe03d';

// Style de dessin d'un combattant (tout style inconnu = rendu par défaut)
const STYLES = new Set(['knight', 'skeleton', 'ninja', 'astro', 'chef', 'pirate', 'mecha', 'mage', 'viking', 'pumpkin', 'dragon']);
function styleOf(p) {
    return STYLES.has(p.skinStyle) ? p.skinStyle : 'default';
}

// Contour arrondi « nuage » de la toque (5 bosses), sous-chemin centré en (cx, 0)
function toquePath(ctx, cx, R) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + 0.3;
        const x = cx + Math.cos(a) * R * 0.55;
        const y = Math.sin(a) * R * 0.55;
        ctx.moveTo(x + R * 0.5, y);
        ctx.arc(x, y, R * 0.5, 0, TAU);
    }
}

function safeShade(c, amt, fallback) {
    return HEX6.test(c) ? shadeHex(c, amt) : fallback;
}

// Couleurs de base + couleurs dérivées d'un skin, calculées une fois par objet "colors"
// (recalculées seulement si une des couleurs de base change)
const DERIVED = new WeakMap();
function skinColors(colObj) {
    const col = colObj || NO_COLORS;
    const skin = col.skin || '#f2c29b';
    const hair = col.hair || '#5a3419';
    const outfit = col.outfit || '#ff7a1a';
    const pack = col.pack || '#3a8dff';
    let d = colObj ? DERIVED.get(colObj) : null;
    if (d && d.skin === skin && d.hair === hair && d.outfit === outfit && d.pack === pack) return d;
    d = {
        skin, hair, outfit, pack,
        light: safeShade(skin, 0.5, '#eef2f7'),     // reflet du métal
        dark: safeShade(skin, -0.35, '#7d8898'),    // métal sombre / fêlures de l'os
        packDark: safeShade(pack, -0.6, '#2a1440'), // sac du squelette
        back: safeShade(outfit, 0.12, '#2b2940'),   // sac du ninja
        visor: safeShade(hair, -0.6, '#1c4a7a')     // visière teintée de l'astronaute
    };
    if (colObj) DERIVED.set(colObj, d);
    return d;
}

// Panache du heaume (sous-chemin, sens horaire comme arc / ellipse), repère de la tête
function plumeSub(ctx, hr) {
    ctx.moveTo(hr * 0.35, 0);
    ctx.quadraticCurveTo(hr * 0.1, hr * 0.3, -hr * 0.85, hr * 0.28);
    ctx.quadraticCurveTo(-hr * 1.5, hr * 0.22, -hr * 1.5, 0);
    ctx.quadraticCurveTo(-hr * 1.5, -hr * 0.22, -hr * 0.85, -hr * 0.28);
    ctx.quadraticCurveTo(hr * 0.1, -hr * 0.3, hr * 0.35, 0);
    ctx.closePath();
}

// Les 2 pans du bandeau ninja, qui ondulent vers l'arrière
function ninjaTailsPath(ctx, hr, time, seed) {
    const w1 = Math.sin(time * 9 + seed) * hr * 0.28;
    const w2 = Math.sin(time * 9 + seed + 1.4) * hr * 0.28;
    ctx.beginPath();
    ctx.moveTo(-hr * 0.9, -hr * 0.1);
    ctx.quadraticCurveTo(-hr * 1.6, -hr * 0.3 + w1, -hr * 2.35, -hr * 0.55 + w2);
    ctx.moveTo(-hr * 0.9, hr * 0.1);
    ctx.quadraticCurveTo(-hr * 1.7, hr * 0.3 + w2, -hr * 2.25, hr * 0.6 + w1);
}

// Contour bosselé de la citrouille (8 côtes), sous-chemins centrés sur l'origine
function pumpkinPath(ctx, H) {
    ctx.beginPath();
    ctx.moveTo(H * 0.8, 0);
    ctx.arc(0, 0, H * 0.8, 0, TAU);
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.39;
        const x = Math.cos(a) * H * 0.52;
        const y = Math.sin(a) * H * 0.52;
        ctx.moveTo(x + H * 0.48, y);
        ctx.arc(x, y, H * 0.48, 0, TAU);
    }
}

// Battement des ailes du dragon (le même pour le dessin et le flash de dégât)
function dragonFlap(time, seed) {
    return 1 + Math.sin(time * 3.2 + seed) * 0.08;
}

// Aile de chauve-souris du dragon (côté s = ±1), sous-chemin : 3 doigts, bord en festons
function dragonWingSub(ctx, r, s, flap) {
    ctx.moveTo(-r * 0.2, s * r * 0.55);
    ctx.lineTo(-r * 0.05, s * r * 1.6 * flap);
    ctx.quadraticCurveTo(-r * 0.38, s * r * 1.25 * flap, -r * 0.62, s * r * 1.5 * flap);
    ctx.quadraticCurveTo(-r * 0.85, s * r * 1.08 * flap, -r * 1.18, s * r * 1.22 * flap);
    ctx.quadraticCurveTo(-r * 1.1, s * r * 0.75, -r * 0.8, s * r * 0.32);
    ctx.closePath();
}

// Tête d'un skin, centrée sur l'origine, regard vers +x (hr = rayon de la tête)
function styledHead(ctx, style, d, hr, time, seed) {
    ctx.lineCap = 'round';
    if (style === 'knight') {
        // Heaume : métal + reflet + bande, fente de visière à l'avant, panache vers l'arrière
        circle(ctx, 0, 0, hr);
        ctx.fillStyle = d.skin;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = d.dark;
        ctx.fillRect(hr * 0.1, -hr, hr * 0.2, hr * 2);
        ctx.beginPath();
        ctx.ellipse(-hr * 0.05, -hr * 0.45, hr * 0.5, hr * 0.24, -0.25, 0, TAU);
        ctx.fillStyle = d.light;
        ctx.fill();
        ctx.restore();
        circle(ctx, 0, 0, hr);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, hr * 0.68, -0.85, 0.85);
        ctx.strokeStyle = VISOR_SLIT;
        ctx.lineWidth = hr * 0.2;
        ctx.stroke();
        ctx.beginPath();
        plumeSub(ctx, hr);
        fillStroke(ctx, d.pack, OUTLINE, 2.5);
        ctx.beginPath();
        ctx.moveTo(hr * 0.05, -hr * 0.04);
        ctx.lineTo(-hr * 1.15, -hr * 0.04);
        ctx.strokeStyle = d.hair;
        ctx.lineWidth = hr * 0.14;
        ctx.stroke();
    } else if (style === 'skeleton') {
        // Crâne : os clair, fêlure, orbites sombres avec une lueur violette vers l'avant
        circle(ctx, 0, 0, hr);
        fillStroke(ctx, d.skin, OUTLINE, 3);
        ctx.beginPath();
        ctx.moveTo(-hr * 0.62, -hr * 0.22);
        ctx.lineTo(-hr * 0.35, -hr * 0.06);
        ctx.lineTo(-hr * 0.44, hr * 0.16);
        ctx.lineTo(-hr * 0.2, hr * 0.3);
        ctx.strokeStyle = d.dark;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(hr * 0.42, -hr * 0.36, hr * 0.24, hr * 0.28, 0.35, 0, TAU);
        ctx.moveTo(hr * 0.66, hr * 0.36);
        ctx.ellipse(hr * 0.42, hr * 0.36, hr * 0.24, hr * 0.28, -0.35, 0, TAU);
        ctx.fillStyle = BONE_DARK;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hr * 0.5, -hr * 0.36, hr * 0.1, 0, TAU);
        ctx.moveTo(hr * 0.6, hr * 0.36);
        ctx.arc(hr * 0.5, hr * 0.36, hr * 0.1, 0, TAU);
        ctx.fillStyle = d.pack;
        ctx.fill();
        // Dents : petite rangée à l'avant
        ctx.beginPath();
        ctx.moveTo(hr * 0.86, -hr * 0.16);
        ctx.lineTo(hr * 0.86, hr * 0.16);
        ctx.strokeStyle = BONE_DARK;
        ctx.lineWidth = 2;
        ctx.stroke();
    } else if (style === 'ninja') {
        // Cagoule sombre, fente claire pour les yeux, bandeau néon noué derrière
        circle(ctx, 0, 0, hr);
        ctx.fillStyle = d.hair;
        ctx.fill();
        roundRectPath(ctx, hr * 0.3, -hr * 0.56, hr * 0.46, hr * 1.12, hr * 0.2);
        ctx.fillStyle = d.skin;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hr * 0.56, -hr * 0.25, hr * 0.1, 0, TAU);
        ctx.moveTo(hr * 0.66, hr * 0.25);
        ctx.arc(hr * 0.56, hr * 0.25, hr * 0.1, 0, TAU);
        ctx.fillStyle = OUTLINE;
        ctx.fill();
        circle(ctx, 0, 0, hr * 0.86);
        ctx.strokeStyle = d.pack;
        ctx.lineWidth = hr * 0.2;
        ctx.stroke();
        circle(ctx, 0, 0, hr);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 3;
        ctx.stroke();
        ninjaTailsPath(ctx, hr, time, seed);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = hr * 0.26 + 4;
        ctx.stroke();
        ctx.strokeStyle = d.pack;
        ctx.lineWidth = hr * 0.26;
        ctx.stroke();
        circle(ctx, -hr * 0.9, 0, hr * 0.2);
        fillStroke(ctx, d.pack, OUTLINE, 2.5);
    } else if (style === 'chef') {
        // Visage + grosse moustache devant, toque bouffante par-dessus (vers l'arrière)
        circle(ctx, 0, 0, hr);
        fillStroke(ctx, d.skin, OUTLINE, 3);
        ctx.beginPath();
        ctx.ellipse(hr * 0.78, -hr * 0.28, hr * 0.26, hr * 0.17, 0.5, 0, TAU);
        ctx.moveTo(hr * 1.04, hr * 0.28);
        ctx.ellipse(hr * 0.78, hr * 0.28, hr * 0.26, hr * 0.17, -0.5, 0, TAU);
        fillStroke(ctx, d.hair, OUTLINE, 2);
        circle(ctx, hr * 0.92, 0, hr * 0.16);
        fillStroke(ctx, d.skin, OUTLINE, 2);
        // Contour épais d'abord, puis remplissage par-dessus : seul le bord extérieur reste visible
        toquePath(ctx, -hr * 0.22, hr * 1.02);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.fillStyle = TOQUE;
        ctx.fill();
        circle(ctx, -hr * 0.22, 0, hr * 0.5);
        ctx.fill();
        // Plis de la toque
        ctx.beginPath();
        ctx.moveTo(-hr * 0.55, -hr * 0.25);
        ctx.lineTo(hr * 0.1, -hr * 0.15);
        ctx.moveTo(-hr * 0.55, hr * 0.25);
        ctx.lineTo(hr * 0.1, hr * 0.15);
        ctx.strokeStyle = 'rgba(10, 16, 48, 0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();
    } else if (style === 'pirate') {
        // Barbe devant, puis tricorne (pointe vers l'avant), liseré doré, tête de mort, plume
        circle(ctx, 0, 0, hr);
        fillStroke(ctx, d.skin, OUTLINE, 3);
        ctx.beginPath();
        ctx.arc(0, 0, hr * 0.92, -0.9, 0.9);
        ctx.strokeStyle = d.hair;
        ctx.lineWidth = hr * 0.32;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-hr * 0.5, -hr * 0.6);
        ctx.quadraticCurveTo(-hr * 1.5, -hr * 1.2, -hr * 1.75, -hr * 0.45);
        ctx.quadraticCurveTo(-hr * 1.2, -hr * 0.55, -hr * 0.4, -hr * 0.35);
        ctx.closePath();
        fillStroke(ctx, '#ff5470', OUTLINE, 2);
        ctx.beginPath();
        ctx.moveTo(hr * 1.2, 0);
        ctx.quadraticCurveTo(hr * 0.1, hr * 0.35, -hr * 0.8, hr * 1.1);
        ctx.quadraticCurveTo(-hr * 0.55, 0, -hr * 0.8, -hr * 1.1);
        ctx.quadraticCurveTo(hr * 0.1, -hr * 0.35, hr * 1.2, 0);
        ctx.closePath();
        fillStroke(ctx, HAT, OUTLINE, 3);
        ctx.beginPath();
        ctx.moveTo(hr * 0.95, 0);
        ctx.quadraticCurveTo(hr * 0.05, hr * 0.28, -hr * 0.62, hr * 0.88);
        ctx.moveTo(hr * 0.95, 0);
        ctx.quadraticCurveTo(hr * 0.05, -hr * 0.28, -hr * 0.62, -hr * 0.88);
        ctx.strokeStyle = d.pack;
        ctx.lineWidth = 2.2;
        ctx.stroke();
        circle(ctx, hr * 0.2, 0, hr * 0.2);
        fillStroke(ctx, TOQUE, OUTLINE, 1.5);
        ctx.beginPath();
        ctx.arc(hr * 0.24, -hr * 0.07, hr * 0.05, 0, TAU);
        ctx.moveTo(hr * 0.29, hr * 0.07);
        ctx.arc(hr * 0.24, hr * 0.07, hr * 0.05, 0, TAU);
        ctx.fillStyle = OUTLINE;
        ctx.fill();
    } else if (style === 'mecha') {
        // Casque anguleux blanc, oreillettes, visière en V lumineuse, crête jaune
        roundRectPath(ctx, -hr * 1.0, -hr * 1.18, hr * 0.5, hr * 0.36, hr * 0.08);
        roundRectSub(ctx, -hr * 1.0, hr * 0.82, hr * 0.5, hr * 0.36, hr * 0.08);
        fillStroke(ctx, d.outfit, OUTLINE, 2.5);
        roundRectPath(ctx, -hr * 0.95, -hr * 0.95, hr * 1.9, hr * 1.9, hr * 0.45);
        fillStroke(ctx, d.skin, OUTLINE, 3);
        ctx.fillStyle = d.dark;
        ctx.fillRect(-hr * 0.95, -hr * 0.08, hr * 0.85, hr * 0.16);
        ctx.beginPath();
        ctx.moveTo(hr * 0.25, -hr * 0.75);
        ctx.lineTo(hr * 0.8, -hr * 0.18);
        ctx.lineTo(hr * 0.8, hr * 0.18);
        ctx.lineTo(hr * 0.25, hr * 0.75);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = hr * 0.34 + 3;
        ctx.stroke();
        ctx.strokeStyle = d.hair;
        ctx.lineWidth = hr * 0.34;
        ctx.stroke();
        // Crête en V vers l'avant
        ctx.beginPath();
        ctx.moveTo(hr * 0.05, 0);
        ctx.lineTo(hr * 1.05, -hr * 0.55);
        ctx.lineTo(hr * 1.2, -hr * 0.42);
        ctx.lineTo(hr * 0.42, 0);
        ctx.lineTo(hr * 1.2, hr * 0.42);
        ctx.lineTo(hr * 1.05, hr * 0.55);
        ctx.closePath();
        fillStroke(ctx, d.pack, OUTLINE, 2);
    } else if (style === 'mage') {
        // Capuche pointue (vers l'arrière) + croissant de lune, ouverture sombre, yeux lumineux
        ctx.beginPath();
        ctx.moveTo(hr * 0.95, 0);
        ctx.arc(0, 0, hr * 1.05, 0, Math.PI * 0.62);
        ctx.quadraticCurveTo(-hr * 1.2, hr * 0.5, -hr * 1.9, hr * 0.3);
        ctx.quadraticCurveTo(-hr * 1.25, -hr * 0.2, -hr * 0.5, -hr * 0.95);
        ctx.arc(0, 0, hr * 1.05, -Math.PI * 0.68, 0);
        ctx.closePath();
        fillStroke(ctx, d.outfit, OUTLINE, 3);
        ctx.beginPath();
        ctx.arc(-hr * 1.92, hr * 0.3, hr * 0.26, 0.6, 5.2);
        ctx.arc(-hr * 1.8, hr * 0.25, hr * 0.18, 5.0, 0.8, true);
        ctx.closePath();
        fillStroke(ctx, d.pack, OUTLINE, 1.8);
        ctx.beginPath();
        ctx.ellipse(hr * 0.45, 0, hr * 0.42, hr * 0.62, 0, 0, TAU);
        fillStroke(ctx, HOOD_HOLE, d.pack, 2);
        const glow = 0.65 + 0.35 * Math.sin(time * 3 + seed);
        ctx.save();
        ctx.globalAlpha *= glow;
        ctx.beginPath();
        ctx.ellipse(hr * 0.6, -hr * 0.24, hr * 0.12, hr * 0.08, 0, 0, TAU);
        ctx.moveTo(hr * 0.72, hr * 0.24);
        ctx.ellipse(hr * 0.6, hr * 0.24, hr * 0.12, hr * 0.08, 0, 0, TAU);
        ctx.fillStyle = d.hair;
        ctx.fill();
        ctx.restore();
    } else if (style === 'viking') {
        // Visage + barbe tressée devant, cornes sur les côtés, casque d'acier à nasal par-dessus
        circle(ctx, 0, 0, hr);
        fillStroke(ctx, d.skin, OUTLINE, 3);
        ctx.beginPath();
        ctx.arc(0, 0, hr * 0.88, -0.85, 0.85);
        ctx.strokeStyle = d.hair;
        ctx.lineWidth = hr * 0.38;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(hr * 1.08, 0, hr * 0.3, hr * 0.17, 0, 0, TAU);
        fillStroke(ctx, d.hair, OUTLINE, 2);
        circle(ctx, hr * 1.34, 0, hr * 0.1);
        fillStroke(ctx, HELM, OUTLINE, 1.5);
        for (const s of SIDES2) {
            ctx.beginPath();
            ctx.moveTo(-hr * 0.42, s * hr * 0.6);
            ctx.quadraticCurveTo(-hr * 0.38, s * hr * 1.5, hr * 0.5, s * hr * 1.58);
            ctx.quadraticCurveTo(hr * 0.02, s * hr * 1.18, hr * 0.12, s * hr * 0.6);
            ctx.closePath();
            fillStroke(ctx, HORN, OUTLINE, 2.5);
            ctx.beginPath();
            ctx.moveTo(-hr * 0.36, s * hr * 1.02);
            ctx.lineTo(hr * 0.06, s * hr * 0.98);
            ctx.strokeStyle = HELM_D;
            ctx.lineWidth = 2.5;
            ctx.stroke();
        }
        circle(ctx, -hr * 0.12, 0, hr * 0.84);
        ctx.fillStyle = HELM;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        ctx.ellipse(-hr * 0.4, -hr * 0.4, hr * 0.42, hr * 0.2, -0.5, 0, TAU);
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha *= 0.5;
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(-hr * 0.96, 0);
        ctx.lineTo(hr * 0.72, 0);
        ctx.moveTo(-hr * 0.12, -hr * 0.84);
        ctx.lineTo(-hr * 0.12, hr * 0.84);
        ctx.strokeStyle = HELM_D;
        ctx.lineWidth = hr * 0.16;
        ctx.stroke();
        circle(ctx, -hr * 0.12, 0, hr * 0.84);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 3;
        ctx.stroke();
        roundRectPath(ctx, hr * 0.56, -hr * 0.1, hr * 0.44, hr * 0.2, hr * 0.07);
        fillStroke(ctx, HELM, OUTLINE, 2);
    } else if (style === 'pumpkin') {
        // Citrouille à côtes, visage sculpté qui vacille comme une bougie, tige et vrille
        const H = hr * 1.1;
        pumpkinPath(ctx, H);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.fillStyle = d.skin;
        ctx.fill();
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU + 0.39 + Math.PI / 8;
            ctx.moveTo(Math.cos(a) * H * 0.22, Math.sin(a) * H * 0.22);
            ctx.quadraticCurveTo(Math.cos(a + 0.18) * H * 0.62, Math.sin(a + 0.18) * H * 0.62, Math.cos(a) * H * 0.9, Math.sin(a) * H * 0.9);
        }
        ctx.strokeStyle = d.dark;
        ctx.lineWidth = 2;
        ctx.stroke();
        const glow = 0.72 + 0.28 * Math.sin(time * 7 + seed) * Math.sin(time * 3.1 + seed * 2);
        ctx.save();
        ctx.globalAlpha *= glow;
        ctx.beginPath();
        for (const s of SIDES2) {
            ctx.moveTo(H * 0.34, s * H * 0.16);
            ctx.lineTo(H * 0.7, s * H * 0.3);
            ctx.lineTo(H * 0.32, s * H * 0.5);
            ctx.closePath();
        }
        ctx.moveTo(H * 0.76, -H * 0.42);
        ctx.lineTo(H * 0.9, -H * 0.22);
        ctx.lineTo(H * 0.8, -H * 0.11);
        ctx.lineTo(H * 0.93, 0);
        ctx.lineTo(H * 0.8, H * 0.11);
        ctx.lineTo(H * 0.9, H * 0.22);
        ctx.lineTo(H * 0.76, H * 0.42);
        ctx.quadraticCurveTo(H * 0.6, 0, H * 0.76, -H * 0.42);
        ctx.closePath();
        fillStroke(ctx, d.hair, OUTLINE, 1.8);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(-H * 0.12, H * 0.26, H * 0.16, -1.2, 3.2);
        ctx.strokeStyle = d.pack;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(-H * 0.36, -H * 0.2, H * 0.2, H * 0.11, 0.6, 0, TAU);
        fillStroke(ctx, d.pack, OUTLINE, 2);
        roundRectPath(ctx, -H * 0.14, -H * 0.14, H * 0.28, H * 0.28, H * 0.08);
        fillStroke(ctx, d.pack, OUTLINE, 2.5);
    } else if (style === 'dragon') {
        // Cornes vers l'arrière, souffle de braise par moments, museau, yeux de feu, crête
        ctx.beginPath();
        for (const s of SIDES2) {
            ctx.moveTo(-hr * 0.1, s * hr * 0.45);
            ctx.quadraticCurveTo(-hr * 0.9, s * hr * 0.98, -hr * 1.65, s * hr * 0.82);
            ctx.quadraticCurveTo(-hr * 0.95, s * hr * 0.55, -hr * 0.55, s * hr * 0.12);
            ctx.closePath();
        }
        fillStroke(ctx, d.hair, OUTLINE, 2.5);
        const puff = clamp01((Math.sin(time * 1.4 + seed) - 0.55) / 0.45);
        if (puff > 0) {
            const wob = Math.sin(time * 30 + seed) * hr * 0.06;
            for (const [k, col] of [[1, FIRE], [0.6, FIRE_IN]]) {
                const L = hr * (0.5 + 1.1 * puff) * k;
                const w = hr * 0.4 * k;
                ctx.beginPath();
                ctx.moveTo(hr * 1.15, -w * 0.55);
                ctx.quadraticCurveTo(hr * 1.25 + L * 0.6, -w + wob, hr * 1.2 + L, wob);
                ctx.quadraticCurveTo(hr * 1.25 + L * 0.6, w + wob, hr * 1.15, w * 0.55);
                ctx.closePath();
                fillStroke(ctx, col, OUTLINE, 2);
            }
        }
        circle(ctx, 0, 0, hr);
        ctx.fillStyle = d.skin;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        ctx.ellipse(-hr * 0.2, -hr * 0.42, hr * 0.5, hr * 0.22, -0.2, 0, TAU);
        ctx.fillStyle = d.light;
        ctx.globalAlpha *= 0.55;
        ctx.fill();
        ctx.restore();
        circle(ctx, 0, 0, hr);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        for (const x of [-0.3, -0.7]) {
            ctx.moveTo(hr * (x + 0.2), 0);
            ctx.lineTo(hr * x, -hr * 0.13);
            ctx.lineTo(hr * (x - 0.22), 0);
            ctx.lineTo(hr * x, hr * 0.13);
            ctx.closePath();
        }
        fillStroke(ctx, d.hair, OUTLINE, 2);
        ctx.beginPath();
        ctx.ellipse(hr * 0.74, 0, hr * 0.55, hr * 0.42, 0, 0, TAU);
        fillStroke(ctx, d.skin, OUTLINE, 3);
        ctx.beginPath();
        ctx.ellipse(hr * 1.1, -hr * 0.16, hr * 0.07, hr * 0.05, 0, 0, TAU);
        ctx.moveTo(hr * 1.17, hr * 0.16);
        ctx.ellipse(hr * 1.1, hr * 0.16, hr * 0.07, hr * 0.05, 0, 0, TAU);
        ctx.fillStyle = OUTLINE;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(hr * 0.28, -hr * 0.52, hr * 0.18, hr * 0.12, 0.3, 0, TAU);
        ctx.moveTo(hr * 0.46, hr * 0.52);
        ctx.ellipse(hr * 0.28, hr * 0.52, hr * 0.18, hr * 0.12, -0.3, 0, TAU);
        fillStroke(ctx, d.pack, OUTLINE, 1.8);
        ctx.beginPath();
        ctx.ellipse(hr * 0.3, -hr * 0.52, hr * 0.035, hr * 0.09, 0.3, 0, TAU);
        ctx.moveTo(hr * 0.335, hr * 0.52);
        ctx.ellipse(hr * 0.3, hr * 0.52, hr * 0.035, hr * 0.09, -0.3, 0, TAU);
        ctx.fillStyle = OUTLINE;
        ctx.fill();
    } else {
        // Astronaute : casque rond plus gros, visière bleue teintée + reflet, antenne
        const H = hr * 1.2;
        circle(ctx, 0, 0, H);
        ctx.fillStyle = d.skin;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        ctx.ellipse(H * 0.4, 0, H * 0.55, H * 0.74, 0, 0, TAU);
        fillStroke(ctx, d.visor, OUTLINE, 2);
        ctx.beginPath();
        ctx.ellipse(H * 0.52, -H * 0.34, H * 0.22, H * 0.09, -0.7, 0, TAU);
        ctx.fillStyle = d.hair;
        ctx.fill();
        ctx.restore();
        circle(ctx, 0, 0, H);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-H * 0.4, -H * 0.8);
        ctx.lineTo(-H * 0.72, -H * 1.18);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.strokeStyle = ANTENNA;
        ctx.lineWidth = 2;
        ctx.stroke();
        circle(ctx, -H * 0.72, -H * 1.18, H * 0.13);
        // Voyant qui clignote
        fillStroke(ctx, Math.sin(time * 4 + seed) > 0 ? d.pack : '#fff1c9', OUTLINE, 2);
    }
}

/*
   Tête "skinnée" d'un combattant, centrée en (cx, 0) du repère courant, regard vers +x
   (utilisée par la chute libre dans drop.js). Renvoie false pour le style par défaut :
   l'appelant dessine alors sa tête habituelle.
*/
export function drawStyledHead(ctx, p, hr, time, cx = 0) {
    const style = styleOf(p);
    if (style === 'default') return false;
    ctx.translate(cx, 0);
    styledHead(ctx, style, skinColors(p.colors), hr, time || 0, fighterSeed(p) * 1.37);
    ctx.translate(-cx, 0);
    return true;
}

// Katana en travers du dos : fourreau puis poignée qui dépasse de l'épaule gauche
const KAT_AX = -0.95, KAT_AY = 0.7;    // bout du fourreau (en rayons)
const KAT_BX = -0.1, KAT_BY = -0.72;   // garde
const KAT_CX = 0.12, KAT_CY = -1.1;    // pommeau
function katanaLine(ctx, r) {
    ctx.beginPath();
    ctx.moveTo(r * KAT_AX, r * KAT_AY);
    ctx.lineTo(r * KAT_CX, r * KAT_CY);
}

function drawKatana(ctx, r) {
    katanaLine(ctx, r);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = r * 0.17 + 5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * KAT_AX, r * KAT_AY);
    ctx.lineTo(r * KAT_BX, r * KAT_BY);
    ctx.strokeStyle = SCABBARD;
    ctx.lineWidth = r * 0.17;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(r * KAT_BX, r * KAT_BY);
    ctx.lineTo(r * KAT_CX, r * KAT_CY);
    ctx.strokeStyle = WRAP;
    ctx.lineWidth = r * 0.13;
    ctx.stroke();
    // Garde : petit trait perpendiculaire (direction du sabre ≈ (0,51 ; -0,86))
    ctx.beginPath();
    ctx.moveTo(r * (KAT_BX - 0.19), r * (KAT_BY - 0.11));
    ctx.lineTo(r * (KAT_BX + 0.19), r * (KAT_BY + 0.11));
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = r * 0.12 + 4;
    ctx.stroke();
    ctx.strokeStyle = TSUBA;
    ctx.lineWidth = r * 0.12;
    ctx.stroke();
}

const SIDES2 = [-1, 1];

// 3 orbes de lumière qui tournent autour de l'archimage
function mageOrbs(ctx, r, time, seed, color) {
    const ga = ctx.globalAlpha;
    for (let k = 0; k < 3; k++) {
        const a = time * 1.6 + seed + k * 2.094;
        const x = Math.cos(a) * r * 1.3;
        const y = Math.sin(a) * r * 1.3;
        ctx.globalAlpha = ga * 0.35;
        circle(ctx, x, y, r * 0.2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = ga;
        circle(ctx, x, y, r * 0.1);
        fillStroke(ctx, color, OUTLINE, 1.5);
    }
    ctx.globalAlpha = ga;
}

/*
   Combattant gelé (canon à glace) : voile de givre sur la silhouette, anneau de glace au sol,
   6 cristaux qui pointent vers l'extérieur et 3 flocons qui tournent. Disparaît en fondu
   sur le dernier quart de seconde. Repère du combattant (déjà tourné).
*/
const FROST_FILL = '#bff0ff';
const FROST_LIGHT = '#e6fbff';
const FROST_RING = '#9fe8ff';
function drawFrozen(ctx, r, timer, time, seed) {
    const k = Math.min(1, timer / 0.25);
    const ga = ctx.globalAlpha;
    // Voile de givre sur le corps
    ctx.globalAlpha = ga * 0.38 * k;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.82, r * 1.1, 0, 0, TAU);
    ctx.fillStyle = FROST_FILL;
    ctx.fill();
    // Anneau de glace
    ctx.globalAlpha = ga * 0.75 * k;
    circle(ctx, 0, 0, r * 1.22);
    ctx.strokeStyle = FROST_RING;
    ctx.lineWidth = 3;
    ctx.stroke();
    // Cristaux de glace (pointes vers l'extérieur)
    ctx.globalAlpha = ga * k;
    for (let i = 0; i < 6; i++) {
        const a = seed + i * (TAU / 6);
        const len = r * (0.32 + 0.12 * ((i * 7) % 3) / 2);
        const c = Math.cos(a);
        const s = Math.sin(a);
        const bx = c * r * 0.9;
        const by = s * r * 0.9;
        const w = r * 0.11;
        ctx.beginPath();
        ctx.moveTo(bx - s * w, by + c * w);
        ctx.lineTo(bx + c * len, by + s * len);
        ctx.lineTo(bx + s * w, by - c * w);
        ctx.closePath();
        fillStroke(ctx, FROST_LIGHT, OUTLINE, 2);
    }
    // Flocons qui tournent autour
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
        const a = time * 1.8 + seed + i * (TAU / 3);
        circle(ctx, Math.cos(a) * r * 1.45, Math.sin(a) * r * 1.45, r * 0.08);
        ctx.fill();
    }
    ctx.globalAlpha = ga;
}

// Petites âmes violettes autour du squelette (3 au plus, calculées à partir de time)
function soulSparks(ctx, r, time, seed, color) {
    const ga = ctx.globalAlpha;
    ctx.fillStyle = color;
    for (let k = 0; k < 3; k++) {
        const ph = (((time * 0.7 + k / 3 + seed * 0.13) % 1) + 1) % 1;
        const a = seed + k * 2.094 + time * 0.6;
        const dist = r * (0.6 + ph * 0.8);
        circle(ctx, Math.cos(a) * dist, Math.sin(a) * dist, r * (0.11 - ph * 0.06));
        ctx.globalAlpha = ga * (1 - ph) * 0.85;
        ctx.fill();
    }
    ctx.globalAlpha = ga;
}

// Équipe du joueur de cette machine (posée par main.js) : cercle d'escouade sous ses coéquipiers.
// Variable globale car ce module peut être chargé deux fois (avec et sans ?v=).
const localTeamOf = () => globalThis.FOR2D_LOCAL_TEAM ?? 1;

// Joueur ou bot. Tolère un objet incomplet (ex. un combattant en train de mourir).
export function drawPlayer(ctx, p, time) {
    const t = time || 0;
    const hf = clamp01(p.hitFlash || 0);

    // Respiration à l'arrêt : ±2 %, décalée d'un combattant à l'autre
    const breath = p.moving ? 0 : Math.sin(t * 2.6 + fighterSeed(p) * 1.7) * 0.02;

    // Flash de dégât : blanc au moment du choc, puis rouge clair en redescendant
    // (couleur construite seulement si le flash est visible : pas de chaîne créée pour rien)
    const tintA = hf * 0.7;
    let tint = '';
    if (tintA > 0.004) {
        const k = clamp01((hf - 0.45) / 0.55);
        const gb = Math.round(125 + 130 * k);
        tint = `rgb(255,${gb},${gb})`;
    }

    paintFighter(ctx, p, t, {
        s: 1,
        // Écrasé dans le sens de la visée, étiré sur les côtés
        sx: (1 + breath * 0.6) * (1 - 0.08 * hf),
        sy: (1 + breath) * (1 + 0.12 * hf),
        tint,
        tintA,
        shadow: p.phase !== 'air' // en vol, l'ombre au sol est dessinée par drop.js
    });
}

// Animation de mort : d = {x, y, r, angle, colors, skinStyle, inventory, slot, t}, t de 0 à 1 (~0,7 s).
// Même dessin que drawPlayer, qui tourne en accélérant, rétrécit, blanchit puis s'efface.
export function drawDying(ctx, d, time) {
    const t = clamp01(d.t || 0);
    if (t >= 1) return;

    // Sens de rotation stable pendant toute la mort (déduit de la position)
    const dir = Math.floor((d.x || 0) + (d.y || 0)) & 1 ? 1 : -1;
    // Angle en t² : la vitesse de rotation augmente (≈ 2,5 tours au total)
    const spin = dir * t * t * TAU * 2.5;
    // Petit « pop » au début, puis l'échelle descend de 1 à 0,2
    const pop = 1 + 0.15 * Math.sin(clamp01(t / 0.3) * Math.PI);
    const s = (1 - 0.8 * t * t) * pop;

    const q = {
        x: d.x || 0,
        y: d.y || 0,
        r: d.r || 26,
        angle: (d.angle || 0) + spin,
        colors: d.colors,
        skinStyle: d.skinStyle,
        packMotif: d.packMotif,
        packAccent: d.packAccent,
        inventory: d.inventory,
        slot: d.slot || 0
    };

    ctx.save();
    // Visible en entier sur la 1re moitié, puis s'efface
    ctx.globalAlpha *= t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5;
    paintFighter(ctx, q, time || 0, {
        s, sx: 1, sy: 1,
        tint: '#ffffff',
        tintA: clamp01(t / 0.5), // devient tout blanc à mi-parcours
        shadow: true
    });
    ctx.restore();
}

// Dessin commun d'un combattant. fx = effets calculés par l'appelant :
//   s       : échelle globale (ombre comprise)
//   sx, sy  : écrasement / étirement dans le repère du personnage (x = visée)
//   tint, tintA : couleur et opacité du flash posé sur la silhouette
//   shadow  : ombre au sol (ou vaguelettes dans l'eau)
function paintFighter(ctx, p, time, fx) {
    const r = p.r || 26;
    const col = p.colors || NO_COLORS;
    const skin = col.skin || '#f2c29b';
    const hair = col.hair || '#5a3419';
    const outfit = col.outfit || '#ff7a1a';
    const pack = col.pack || '#3a8dff';
    // Skin : 'default' = rendu d'origine, sinon couleurs dérivées gardées en cache
    const style = styleOf(p);
    const sc = style === 'default' ? null : skinColors(p.colors);
    const seed = fighterSeed(p) * 1.37;

    // Objet tenu : arme de la case choisie (sinon mains libres)
    const held = p.inventory?.[p.slot || 0];
    const w = held && held.kind === 'weapon' ? WEAPONS[held.weaponId] : null;
    const use = p.usingItem;

    ctx.save();
    ctx.translate(p.x || 0, p.y || 0);
    if (fx.s !== 1) ctx.scale(fx.s, fx.s);
    ctx.lineJoin = 'round';

    if (fx.shadow) {
        if (p.inWater) {
            // Vaguelettes qui pulsent autour du joueur
            // (opacité via globalAlpha : pas de nouvelle couleur "rgba(...)" à analyser à chaque image)
            const ga = ctx.globalAlpha;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3;
            for (let k = 0; k < 2; k++) {
                const ph = (time * 1.2 + k * 0.5) % 1;
                circle(ctx, 0, 0, r * (1.1 + ph * 0.6));
                ctx.globalAlpha = ga * 0.55 * (1 - ph);
                ctx.stroke();
            }
            ctx.globalAlpha = ga;
        } else {
            // Ombre
            ctx.fillStyle = 'rgba(12,24,40,0.22)';
            ctx.beginPath();
            ctx.ellipse(r * 0.16, r * 0.22, r * 1.05, r * 1.0, 0, 0, TAU);
            ctx.fill();
        }
    }

    // Cercle d'escouade sous les pieds (couleur distincte par coéquipier, rouge clignotant si K.O.)
    // Seulement en équipe (duo, trio, section) : en solo, personne n'est notre coéquipier
    if (globalThis.FOR2D_TEAM_MODE && p.team === localTeamOf()) {
        ctx.save();
        const SQUAD_COLORS = { 1: '#00e5ff', 2: '#ffd21e', 3: '#ff4fd8', 4: '#00ff88' };
        const mateColor = SQUAD_COLORS[p.squadSlot || 2] || '#00e5ff';
        if (p.dbno) {
            ctx.beginPath();
            ctx.arc(0, 0, r * 1.45, 0, TAU);
            ctx.strokeStyle = '#ff334b';
            ctx.lineWidth = 4.5;
            ctx.setLineDash([8, 6]);
            ctx.stroke();
            // Pulsation d'alerte K.O.
            const pulse = 1 + Math.sin((time || 0) * 8) * 0.18;
            ctx.beginPath();
            ctx.arc(0, 0, r * 1.85 * pulse, 0, TAU);
            ctx.strokeStyle = 'rgba(255, 51, 75, 0.45)';
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.stroke();
        } else {
            // Halo néon très visible de la couleur spécifique du coéquipier
            ctx.beginPath();
            ctx.arc(0, 0, r * 1.42, 0, TAU);
            ctx.strokeStyle = mateColor;
            ctx.lineWidth = 4.5;
            ctx.stroke();
            // Anneau doux d'aura
            ctx.beginPath();
            ctx.arc(0, 0, r * 1.75, 0, TAU);
            ctx.strokeStyle = mateColor;
            ctx.globalAlpha = 0.38;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        ctx.restore();
    }

    // Cercle de réanimation en cours (chargement de 0 à 100%)
    if ((p.reviveProgress || 0) > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.75, -Math.PI / 2, -Math.PI / 2 + (p.reviveProgress / 5) * TAU);
        ctx.strokeStyle = '#4fd8ff';
        ctx.lineWidth = 5.5;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
    }

    ctx.rotate(p.angle || 0);
    if (fx.sx !== 1 || fx.sy !== 1) ctx.scale(fx.sx, fx.sy);

    // Positions des mains gardées pour le flash de dégât
    const hands = [];
    const hand = (x, y, rad = r * 0.3, col = skin) => {
        circle(ctx, x, y, rad);
        fillStroke(ctx, col, OUTLINE, 3);
        hands.push(x, y);
    };

    // ===== POSTURE À 4 PATTES (RAMPEMENT K.O. / DBNO) =====
    if (p.dbno) {
        // Corps allongé au sol (torse + pantalon)
        ctx.beginPath();
        ctx.ellipse(-r * 0.12, 0, r * 0.88, r * 0.62, 0, 0, TAU);
        fillStroke(ctx, outfit, OUTLINE, 3.5);

        // Sac à dos posé à plat sur le dos
        roundRectPath(ctx, -r * 0.65, -r * 0.42, r * 0.72, r * 0.84, r * 0.22);
        fillStroke(ctx, style === 'default' ? pack : sc?.packDark || pack, OUTLINE, 2.5);

        // Animation de reptation à 4 pattes : alternance gauche / droite
        const crawlPhase = p.moving ? Math.sin((p.walkTime || 0) * 10) : 0;
        const crawlFrontL = crawlPhase * r * 0.28;
        const crawlFrontR = -crawlPhase * r * 0.28;
        const crawlBackL = -crawlPhase * r * 0.24;
        const crawlBackR = crawlPhase * r * 0.24;

        // 2 Pattes arrières (genoux / pieds au sol qui poussent)
        hand(-r * 0.9 + crawlBackL, -r * 0.55, r * 0.28, outfit);
        hand(-r * 0.9 + crawlBackR, r * 0.55, r * 0.28, outfit);

        // 2 Pattes avants (mains posées au sol devant qui rampent)
        hand(r * 0.75 + crawlFrontL, -r * 0.6, r * 0.3, skin);
        hand(r * 0.75 + crawlFrontR, r * 0.6, r * 0.3, skin);

        // Tête baissée en avant (regarde où elle rampe)
        ctx.save();
        ctx.translate(r * 0.32, 0);
        if (style === 'default') {
            circle(ctx, 0, 0, r * 0.55);
            ctx.fillStyle = skin;
            ctx.fill();
            ctx.save();
            ctx.clip();
            circle(ctx, -r * 0.18, 0, r * 0.58);
            ctx.fillStyle = hair;
            ctx.fill();
            ctx.restore();
            circle(ctx, 0, 0, r * 0.55);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 3;
            ctx.stroke();
        } else {
            styledHead(ctx, style, sc, r * 0.55, time, seed);
        }
        ctx.restore();

        // Flash de dégât éventuel sur la silhouette K.O.
        if (fx.tint && fx.tintA > 0.005) {
            ctx.save();
            ctx.globalAlpha = fx.tintA;
            ctx.fillStyle = fx.tint;
            circle(ctx, 0, 0, r * 1.2);
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
        return;
    }

    // Dos : sac à forme équipé (ailes, cape, queue...) en priorité, sinon l'objet du skin :
    // sac (défaut), bouclier (chevalier), réacteur (astronaute)...
    const packArt = !!p.packMotif && drawBackpack(ctx, p.packMotif, r, pack, p.packAccent, time, seed);
    if (packArt) {
        // déjà dessiné
    } else if (style === 'knight') {
        circle(ctx, -r * 0.8, 0, r * 0.5);
        fillStroke(ctx, skin, OUTLINE, 3);
        circle(ctx, -r * 0.8, 0, r * 0.38);
        ctx.strokeStyle = sc.dark;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        roundRectPath(ctx, -r * 1.02, -r * 0.09, r * 0.44, r * 0.18, r * 0.06);
        ctx.fillStyle = pack;
        ctx.fill();
    } else if (style === 'astro') {
        // Tuyères qui dépassent derrière le réservoir
        ctx.beginPath();
        ctx.arc(-r * 1.02, -r * 0.3, r * 0.2, 0, TAU);
        ctx.moveTo(-r * 0.82, r * 0.3);
        ctx.arc(-r * 1.02, r * 0.3, r * 0.2, 0, TAU);
        fillStroke(ctx, NOZZLE, OUTLINE, 3);
        ctx.beginPath();
        ctx.arc(-r * 1.1, -r * 0.3, r * 0.09, 0, TAU);
        ctx.moveTo(-r * 1.01, r * 0.3);
        ctx.arc(-r * 1.1, r * 0.3, r * 0.09, 0, TAU);
        ctx.fillStyle = NOZZLE_IN;
        ctx.fill();
        roundRectPath(ctx, -r * 0.98, -r * 0.6, r * 0.66, r * 1.2, r * 0.24);
        fillStroke(ctx, pack, OUTLINE, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-r * 0.86, -r * 0.46, r * 0.12, r * 0.92);
    } else if (style === 'chef') {
        // Baguette en travers du dos (entailles dorées)
        ctx.beginPath();
        ctx.moveTo(-r * 1.05, r * 0.75);
        ctx.lineTo(r * 0.2, -r * 1.15);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = r * 0.36 + 5;
        ctx.stroke();
        ctx.strokeStyle = BREAD;
        ctx.lineWidth = r * 0.36;
        ctx.stroke();
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
            const u = 0.18 + k * 0.2;
            const x = -r * 1.05 + r * 1.25 * u;
            const y = r * 0.75 - r * 1.9 * u;
            ctx.moveTo(x - r * 0.12, y - r * 0.02);
            ctx.lineTo(x + r * 0.08, y + r * 0.12);
        }
        ctx.strokeStyle = BREAD_CUT;
        ctx.lineWidth = 2.2;
        ctx.stroke();
    } else if (style === 'mecha') {
        // Deux réacteurs + flammes cyan qui vacillent
        const fl = 0.75 + 0.25 * Math.sin(time * 26 + seed);
        ctx.beginPath();
        for (const s of SIDES2) {
            ctx.moveTo(-r * 1.08, s * r * 0.42 - r * 0.15);
            ctx.lineTo(-r * (1.3 + 0.45 * fl), s * r * 0.42);
            ctx.lineTo(-r * 1.08, s * r * 0.42 + r * 0.15);
        }
        ctx.fillStyle = sc.hair;
        ctx.fill();
        roundRectPath(ctx, -r * 1.15, -r * 0.68, r * 0.62, r * 0.5, r * 0.12);
        roundRectSub(ctx, -r * 1.15, r * 0.18, r * 0.62, r * 0.5, r * 0.12);
        fillStroke(ctx, MECHA_JOINT, OUTLINE, 3);
        ctx.fillStyle = pack;
        ctx.fillRect(-r * 0.95, -r * 0.62, r * 0.1, r * 0.38);
        ctx.fillRect(-r * 0.95, r * 0.24, r * 0.1, r * 0.38);
    } else if (style === 'mage') {
        // Cercle de runes au sol (tourne) puis pans de la robe étoilée vers l'arrière
        ctx.save();
        ctx.rotate(time * 0.8);
        ctx.globalAlpha *= 0.55;
        circle(ctx, 0, 0, r * 1.6);
        ctx.strokeStyle = sc.hair;
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            const b = ((i + 3) / 8) * TAU;
            ctx.moveTo(Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6);
            ctx.lineTo(Math.cos(b) * r * 1.6, Math.sin(b) * r * 1.6);
        }
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(r * 0.1, -r * 0.95);
        ctx.quadraticCurveTo(-r * 1.0, -r * 1.1, -r * 1.5, -r * 0.2);
        ctx.quadraticCurveTo(-r * 1.25, 0, -r * 1.5, r * 0.2);
        ctx.quadraticCurveTo(-r * 1.0, r * 1.1, r * 0.1, r * 0.95);
        ctx.closePath();
        fillStroke(ctx, sc.back, OUTLINE, 3);
        ctx.beginPath();
        ctx.moveTo(-r * 1.5, -r * 0.2);
        ctx.quadraticCurveTo(-r * 1.25, 0, -r * 1.5, r * 0.2);
        ctx.strokeStyle = pack;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        for (const [sx, sy] of [[-0.9, -0.5], [-1.15, 0.35], [-0.6, 0.65], [-0.75, -0.05]]) {
            circle(ctx, r * sx, r * sy, r * 0.05);
            ctx.fill();
        }
    } else if (style === 'viking') {
        // Bouclier rond en bois : 2 quartiers peints (couleur du sac), cerclage et umbo d'acier
        circle(ctx, -r * 0.85, 0, r * 0.66);
        fillStroke(ctx, SHIELD_WOOD, OUTLINE, 3);
        ctx.beginPath();
        ctx.moveTo(-r * 0.85, 0);
        ctx.arc(-r * 0.85, 0, r * 0.56, -Math.PI / 2, 0);
        ctx.closePath();
        ctx.moveTo(-r * 0.85, 0);
        ctx.arc(-r * 0.85, 0, r * 0.56, Math.PI / 2, Math.PI);
        ctx.closePath();
        ctx.fillStyle = pack;
        ctx.fill();
        circle(ctx, -r * 0.85, 0, r * 0.58);
        ctx.strokeStyle = HELM_D;
        ctx.lineWidth = 3;
        ctx.stroke();
        circle(ctx, -r * 0.85, 0, r * 0.17);
        fillStroke(ctx, HELM, OUTLINE, 2.5);
    } else if (style === 'pumpkin') {
        // Sac de bonbons en toile de jute : ouverture vers l'arrière, bonbons, lien de liane
        ctx.beginPath();
        ctx.ellipse(-r * 0.8, 0, r * 0.5, r * 0.62, 0, 0, TAU);
        fillStroke(ctx, BURLAP, OUTLINE, 3);
        roundRectPath(ctx, -r * 0.92, -r * 0.42, r * 0.26, r * 0.22, r * 0.05);
        fillStroke(ctx, '#a87a3e', OUTLINE, 1.5);
        ctx.beginPath();
        ctx.ellipse(-r * 1.3, 0, r * 0.16, r * 0.34, 0, 0, TAU);
        fillStroke(ctx, '#5a3a1a', OUTLINE, 2.5);
        for (let k = 0; k < 3; k++) {
            circle(ctx, -r * 1.34, (k - 1) * r * 0.17, r * 0.11);
            fillStroke(ctx, CANDY[k], OUTLINE, 2);
        }
        ctx.beginPath();
        ctx.moveTo(-r * 1.14, -r * 0.38);
        ctx.lineTo(-r * 1.14, r * 0.38);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = r * 0.14 + 4;
        ctx.stroke();
        ctx.strokeStyle = pack;
        ctx.lineWidth = r * 0.14;
        ctx.stroke();
    } else if (style === 'dragon') {
        // Queue qui fouette (pointe en losange), puis ailes de chauve-souris qui battent
        // Courbe en S (point de contrôle à l'opposé du bout), épaisseur qui s'affine
        const sway = Math.sin(time * 2.4 + seed) * r * 0.45;
        const P0x = -r * 0.55, Cx = -r * 1.25, Cy = -sway * 0.9, P1x = -r * 1.8, P1y = sway;
        const N = 8;
        const left = [], right = [];
        for (let i = 0; i <= N; i++) {
            const u = i / N, v = 1 - u;
            const x = v * v * P0x + 2 * u * v * Cx + u * u * P1x;
            const y = 2 * u * v * Cy + u * u * P1y;
            const dx = 2 * v * (Cx - P0x) + 2 * u * (P1x - Cx);
            const dy = 2 * v * Cy + 2 * u * (P1y - Cy);
            const len = Math.hypot(dx, dy) || 1;
            const w = r * (0.22 - 0.15 * u);
            left.push(x - (dy / len) * w, y + (dx / len) * w);
            right.push(x + (dy / len) * w, y - (dx / len) * w);
        }
        ctx.beginPath();
        ctx.moveTo(left[0], left[1]);
        for (let i = 2; i < left.length; i += 2) ctx.lineTo(left[i], left[i + 1]);
        for (let i = right.length - 2; i >= 0; i -= 2) ctx.lineTo(right[i], right[i + 1]);
        ctx.closePath();
        fillStroke(ctx, skin, OUTLINE, 3);
        // Pointe en losange, dans l'axe du bout de la queue
        const ta = Math.atan2(P1y - Cy, P1x - Cx);
        ctx.save();
        ctx.translate(P1x, P1y);
        ctx.rotate(ta);
        ctx.beginPath();
        ctx.moveTo(-r * 0.04, 0);
        ctx.lineTo(r * 0.14, -r * 0.17);
        ctx.lineTo(r * 0.4, 0);
        ctx.lineTo(r * 0.14, r * 0.17);
        ctx.closePath();
        fillStroke(ctx, pack, OUTLINE, 2.5);
        ctx.restore();
        const flap = dragonFlap(time, seed);
        for (const s of SIDES2) {
            ctx.beginPath();
            dragonWingSub(ctx, r, s, flap);
            fillStroke(ctx, pack, OUTLINE, 3);
            ctx.beginPath();
            ctx.moveTo(-r * 0.3, s * r * 0.55);
            ctx.lineTo(-r * 0.08, s * r * 1.5 * flap);
            ctx.moveTo(-r * 0.3, s * r * 0.55);
            ctx.lineTo(-r * 0.6, s * r * 1.4 * flap);
            ctx.moveTo(-r * 0.3, s * r * 0.55);
            ctx.lineTo(-r * 1.1, s * r * 1.14 * flap);
            ctx.strokeStyle = sc.dark;
            ctx.lineWidth = 2.2;
            ctx.stroke();
        }
    } else {
        roundRectPath(ctx, -r * 1.02, -r * 0.62, r * 0.7, r * 1.24, r * 0.25);
        fillStroke(ctx, style === 'default' ? pack : style === 'ninja' ? sc.back : sc.packDark, OUTLINE, 3);
        if (style === 'skeleton') {
            // Lanterne d'âme sur le sac
            circle(ctx, -r * 0.8, 0, r * 0.17);
            fillStroke(ctx, pack, OUTLINE, 2);
        }
    }

    // Épaules
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.62, r * 1.0, 0, 0, TAU);
    fillStroke(ctx, outfit, OUTLINE, 3);

    if (style === 'knight') {
        // Épaulières en métal + une lame gravée sur chacune
        ctx.beginPath();
        ctx.ellipse(-r * 0.05, -r * 0.8, r * 0.38, r * 0.27, 0, 0, TAU);
        ctx.moveTo(r * 0.33, r * 0.8);
        ctx.ellipse(-r * 0.05, r * 0.8, r * 0.38, r * 0.27, 0, 0, TAU);
        fillStroke(ctx, skin, OUTLINE, 3);
        ctx.beginPath();
        ctx.moveTo(-r * 0.28, -r * 0.72);
        ctx.lineTo(r * 0.18, -r * 0.72);
        ctx.moveTo(-r * 0.28, r * 0.72);
        ctx.lineTo(r * 0.18, r * 0.72);
        ctx.strokeStyle = sc.dark;
        ctx.lineWidth = 2.5;
        ctx.stroke();
    } else if (style === 'ninja') {
        drawKatana(ctx, r);
    } else if (style === 'skeleton') {
        // Os des épaules
        ctx.beginPath();
        ctx.arc(0, -r * 0.8, r * 0.15, 0, TAU);
        ctx.moveTo(r * 0.15, r * 0.8);
        ctx.arc(0, r * 0.8, r * 0.15, 0, TAU);
        fillStroke(ctx, skin, OUTLINE, 2);
    } else if (style === 'chef') {
        // Foulard rouge noué au cou
        circle(ctx, r * 0.3, r * 0.42, r * 0.17);
        fillStroke(ctx, pack, OUTLINE, 2);
    } else if (style === 'pirate') {
        // Épaulettes dorées + perroquet sur l'épaule gauche (il dodeline)
        ctx.beginPath();
        ctx.ellipse(0, r * 0.82, r * 0.22, r * 0.3, 0, 0, TAU);
        fillStroke(ctx, pack, OUTLINE, 2);
        const bob = Math.sin(time * 4 + seed) * r * 0.05;
        ctx.save();
        ctx.translate(-r * 0.05 + bob, -r * 0.85);
        ctx.beginPath();
        ctx.moveTo(-r * 0.25, -r * 0.08);
        ctx.lineTo(-r * 0.75, -r * 0.2);
        ctx.lineTo(-r * 0.7, r * 0.1);
        ctx.closePath();
        fillStroke(ctx, '#ff5470', OUTLINE, 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.32, r * 0.22, 0, 0, TAU);
        fillStroke(ctx, PARROT, OUTLINE, 2.5);
        ctx.beginPath();
        ctx.ellipse(-r * 0.05, -r * 0.1, r * 0.2, r * 0.1, -0.2, 0, TAU);
        ctx.fillStyle = PARROT_D;
        ctx.fill();
        circle(ctx, r * 0.3, 0, r * 0.17);
        fillStroke(ctx, PARROT, OUTLINE, 2);
        ctx.beginPath();
        ctx.moveTo(r * 0.42, -r * 0.07);
        ctx.quadraticCurveTo(r * 0.62, 0, r * 0.44, r * 0.09);
        ctx.closePath();
        fillStroke(ctx, TSUBA, OUTLINE, 1.5);
        circle(ctx, r * 0.33, -r * 0.07, r * 0.035);
        ctx.fillStyle = OUTLINE;
        ctx.fill();
        ctx.restore();
    } else if (style === 'mecha') {
        // Épaulières en bloc avec bande jaune
        roundRectPath(ctx, -r * 0.42, -r * 1.22, r * 0.8, r * 0.5, r * 0.12);
        roundRectSub(ctx, -r * 0.42, r * 0.72, r * 0.8, r * 0.5, r * 0.12);
        fillStroke(ctx, outfit, OUTLINE, 3);
        ctx.fillStyle = pack;
        ctx.fillRect(-r * 0.42, -r * 0.92, r * 0.8, r * 0.1);
        ctx.fillRect(-r * 0.42, r * 0.82, r * 0.8, r * 0.1);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.fillRect(-r * 0.3, -r * 1.14, r * 0.5, r * 0.06);
        ctx.fillRect(-r * 0.3, r * 1.08, r * 0.5, r * 0.06);
    } else if (style === 'mage') {
        // Col doré
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.62, -1.3, 1.3);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = pack;
        ctx.lineWidth = 3;
        ctx.stroke();
    } else if (style === 'viking') {
        // Col de fourrure sur l'arrière des épaules (contour d'abord : bord extérieur bouclé)
        ctx.beginPath();
        for (let k = 0; k < 7; k++) {
            const a = Math.PI * 0.5 + (k / 6) * Math.PI;
            const x = Math.cos(a) * r * 0.48;
            const y = Math.sin(a) * r * 0.84;
            ctx.moveTo(x + r * 0.22, y);
            ctx.arc(x, y, r * 0.22, 0, TAU);
        }
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.fillStyle = FUR;
        ctx.fill();
    } else if (style === 'pumpkin') {
        // Une feuille de citrouille sur chaque épaule
        for (const s of SIDES2) {
            ctx.beginPath();
            ctx.ellipse(-r * 0.05, s * r * 0.82, r * 0.3, r * 0.17, s * 0.5, 0, TAU);
            fillStroke(ctx, pack, OUTLINE, 2.5);
            ctx.beginPath();
            ctx.moveTo(-r * 0.27, s * r * 0.7);
            ctx.lineTo(r * 0.17, s * r * 0.94);
            ctx.strokeStyle = sc.packDark;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    } else if (style === 'dragon') {
        // Crête dorsale entre les épaules
        ctx.beginPath();
        for (const x of [-0.52, -0.22]) {
            ctx.moveTo(r * (x + 0.16), 0);
            ctx.lineTo(r * x, -r * 0.11);
            ctx.lineTo(r * (x - 0.2), 0);
            ctx.lineTo(r * x, r * 0.11);
            ctx.closePath();
        }
        fillStroke(ctx, sc.hair, OUTLINE, 2);
    }

    const swing = p.moving ? Math.sin((p.walkTime || 0) * 12) * r * 0.25 : 0;

    if (use) {
        // Soin en cours : les mains se rejoignent devant et s'activent sur l'objet
        const e = 1 - (1 - clamp01((use.t || 0) / 0.2)) ** 2; // arrivée douce (ease-out)
        const wig = Math.sin(time * 10) * r * 0.07 * e;       // va-et-vient des mains
        const squeeze = Math.sin(time * 5) * r * 0.04 * e;    // elles se serrent un peu
        const hx = r * (0.72 + 0.2 * e);
        const hy = r * (0.72 - 0.32 * e) + squeeze;
        if (e > 0.01) {
            ctx.save();
            ctx.translate(hx + r * 0.2, 0);
            ctx.rotate(Math.sin(time * 6) * 0.15);
            ctx.scale(e, e);
            drawHealItem(ctx, p.inventory?.[use.slot]?.itemId, r);
            ctx.restore();
        }
        hand(hx + wig, -hy);
        hand(hx - wig, hy);
    } else if (w && w.type === 'gun') {
        // Petit recul juste après un tir
        const max = 1 / w.fireRate;
        const since = max - (p.fireCooldown || 0);
        const win = Math.min(0.09, max);
        const kick = since >= 0 && since < win ? (1 - since / win) * r * 0.22 : 0;
        const gx = r * 0.35 - kick;
        const L = w.length;

        ctx.save();
        ctx.translate(gx, 0);
        drawWeapon(ctx, held.weaponId, held.rarity);
        ctx.restore();

        // Les 2 mains tiennent l'arme
        if (L < 40) {
            hand(gx + L * 0.45, r * 0.26);
            hand(gx + L * 0.45, -r * 0.26);
        } else {
            hand(gx + L * 0.22, r * 0.3);
            hand(gx + L * 0.62, -r * 0.08);
        }
    } else if (held?.kind === 'throwable' && THROWABLES[held.itemId]) {
        // Grenade dans la main droite ; pendant la visée (maintien), le bras recule pour lancer
        const aiming = Boolean(p.throwState);
        const hx = aiming ? r * 0.15 : r * 0.82;
        const hy = aiming ? r * 0.92 : r * 0.62;
        hand(r * 0.78 + (aiming ? r * 0.12 : swing), -r * 0.62); // l'autre main vise devant
        hand(hx, hy);
        // Grenade bien visible, tenue au bout des doigts (par-dessus la main)
        const icon = iconCanvas('throwable', held.itemId, 0, 64, false);
        if (icon) {
            const sz = r * 1.4;
            ctx.save();
            ctx.translate(hx + r * 0.32, hy + (aiming ? r * 0.08 : 0));
            ctx.rotate(aiming ? -0.6 : 0.2);
            ctx.drawImage(icon, -sz / 2, -sz / 2, sz, sz);
            ctx.restore();
        }
    } else if (w && w.type === 'melee') {
        // Pioche dans la main droite, qui pivote pendant le coup
        const st = Math.max(0, Math.min(1, p.swingT || 0));
        const sw = st > 0 ? Math.sin((1 - st) * Math.PI) : 0;
        const arm = 0.6 - sw * 1.3;
        const reach = r * (0.85 + 0.25 * sw);
        const hx = Math.cos(arm) * reach;
        const hy = r * 0.35 + Math.sin(arm) * reach;

        hand(r * 0.72 + swing, -r * 0.72); // main gauche libre
        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(arm - 0.6);
        ctx.translate(-r * 0.25, 0);
        drawWeapon(ctx, held.weaponId, held.rarity, p.pickaxeSkin || held.pickaxeSkin);
        ctx.restore();
        hand(hx, hy);
    } else {
        // Mains qui se balancent (soin tenu ou mains vides)
        hand(r * 0.72 + swing, -r * 0.72);
        hand(r * 0.72 - swing, r * 0.72);
    }

    if (style === 'default') {
        // Tête : peau devant, cheveux derrière
        circle(ctx, 0, 0, r * 0.6);
        ctx.fillStyle = skin;
        ctx.fill();
        ctx.save();
        ctx.clip();
        circle(ctx, -r * 0.2, 0, r * 0.62);
        ctx.fillStyle = hair;
        ctx.fill();
        ctx.restore();
        circle(ctx, 0, 0, r * 0.6);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 3;
        ctx.stroke();
    } else {
        styledHead(ctx, style, sc, r * 0.6, time, seed);
        if (style === 'skeleton') soulSparks(ctx, r, time, seed, pack);
        if (style === 'mage') mageOrbs(ctx, r, time, seed, sc.hair);
        if (style === 'pumpkin') soulSparks(ctx, r, time, seed, sc.hair); // lucioles
    }

    // Touché par le canon à glace : carapace de givre, cristaux et flocons autour
    if (p.iceSlowTimer > 0) drawFrozen(ctx, r, p.iceSlowTimer, time, seed);

    // Flash : toute la silhouette (sac, épaules, mains, tête) réunie dans un seul chemin,
    // remplie d'un coup pour une teinte uniforme sans surépaisseur aux chevauchements
    if (fx.tintA > 0.004) {
        ctx.beginPath();
        if (style === 'knight') {
            // Bouclier + épaulières
            ctx.moveTo(-r * 0.3, 0);
            ctx.arc(-r * 0.8, 0, r * 0.5, 0, TAU);
            ctx.moveTo(r * 0.33, -r * 0.8);
            ctx.ellipse(-r * 0.05, -r * 0.8, r * 0.38, r * 0.27, 0, 0, TAU);
            ctx.moveTo(r * 0.33, r * 0.8);
            ctx.ellipse(-r * 0.05, r * 0.8, r * 0.38, r * 0.27, 0, 0, TAU);
        } else if (style === 'mecha') {
            // Réacteurs + épaulières
            roundRectSub(ctx, -r * 1.15, -r * 0.68, r * 0.62, r * 0.5, r * 0.12);
            roundRectSub(ctx, -r * 1.15, r * 0.18, r * 0.62, r * 0.5, r * 0.12);
            roundRectSub(ctx, -r * 0.42, -r * 1.22, r * 0.8, r * 0.5, r * 0.12);
            roundRectSub(ctx, -r * 0.42, r * 0.72, r * 0.8, r * 0.5, r * 0.12);
        } else if (style === 'chef' || style === 'mage') {
            // Pas de sac (baguette / robe) : rien de plus que le corps
        } else if (style === 'viking') {
            // Bouclier rond
            ctx.moveTo(-r * 0.19, 0);
            ctx.arc(-r * 0.85, 0, r * 0.66, 0, TAU);
        } else if (style === 'pumpkin') {
            // Sac de bonbons
            ctx.moveTo(-r * 0.3, 0);
            ctx.ellipse(-r * 0.8, 0, r * 0.5, r * 0.62, 0, 0, TAU);
        } else if (style === 'dragon') {
            // Ailes
            const flap = dragonFlap(time, seed);
            for (const s of SIDES2) dragonWingSub(ctx, r, s, flap);
        } else if (style === 'astro') {
            // Réservoir + tuyères
            roundRectSub(ctx, -r * 0.98, -r * 0.6, r * 0.66, r * 1.2, r * 0.24);
            ctx.moveTo(-r * 0.82, -r * 0.3);
            ctx.arc(-r * 1.02, -r * 0.3, r * 0.2, 0, TAU);
            ctx.moveTo(-r * 0.82, r * 0.3);
            ctx.arc(-r * 1.02, r * 0.3, r * 0.2, 0, TAU);
        } else {
            roundRectSub(ctx, -r * 1.02, -r * 0.62, r * 0.7, r * 1.24, r * 0.25);
        }
        ctx.moveTo(r * 0.62, 0);
        ctx.ellipse(0, 0, r * 0.62, r * 1.0, 0, 0, TAU);
        for (let i = 0; i < hands.length; i += 2) {
            ctx.moveTo(hands[i] + r * 0.3, hands[i + 1]);
            ctx.arc(hands[i], hands[i + 1], r * 0.3, 0, TAU);
        }
        const headR = style === 'astro' ? r * 0.72 : style === 'pumpkin' ? r * 0.66 : r * 0.6;
        ctx.moveTo(headR, 0);
        ctx.arc(0, 0, headR, 0, TAU);
        if (style === 'knight') plumeSub(ctx, r * 0.6);
        ctx.globalAlpha *= fx.tintA;
        ctx.fillStyle = fx.tint;
        ctx.fill();
        if (style === 'ninja') {
            // Pans du bandeau et katana (des traits) : teintés aussi
            ctx.strokeStyle = fx.tint;
            ninjaTailsPath(ctx, r * 0.6, time, seed);
            ctx.lineWidth = r * 0.6 * 0.26 + 4;
            ctx.stroke();
            katanaLine(ctx, r);
            ctx.lineWidth = r * 0.17 + 5;
            ctx.stroke();
        }
    }

    ctx.restore();
}
