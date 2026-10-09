/* ==================================
   ASPECT CORROMPU DE LA CARTE - FOR2D ROYAL
   Ce qui est dans la corruption CHANGE vraiment :
   - le sol (chunks) est recoloré en violet / noir, avec fissures lumineuses,
     taches noires et cristaux violets ;
   - les bâtiments sont abîmés : gravats, sol fissuré, toits troués ;
   - les arbres et buissons deviennent violet sombre.
   Le Renderer dessine la version corrompue exactement hors du cercle sain
   (clip), donc la frontière se voit nettement et avance avec la zone.
   ================================== */

import { drawObject, drawRoof } from './draw.js?v=13';

const TAU = Math.PI * 2;

/* ===================== OUTILS ===================== */

// Hash déterministe 0..1 (mêmes détails à chaque reconstruction d'un chunk)
function hash2(i, j, s) {
    let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// Petit générateur pseudo-aléatoire à partir d'une graine
function rng(seed) {
    let s = (seed * 2654435761) >>> 0 || 1;
    return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return (s >>> 0) / 4294967296;
    };
}

/*
   Position d'une forme par rapport au cercle sain (cx, cy, r) :
   0 = entièrement saine, 1 = traversée par le bord, 2 = entièrement corrompue
*/
export function circleClass(cx, cy, r, x, y, rad) {
    if (r <= 0) return 2;
    const d = Math.hypot(x - cx, y - cy);
    if (d + rad <= r) return 0;
    if (d - rad >= r) return 2;
    return 1;
}

export function rectClass(cx, cy, r, x, y, w, h) {
    if (r <= 0) return 2;
    const nx = cx < x ? x : cx > x + w ? x + w : cx;
    const ny = cy < y ? y : cy > y + h ? y + h : cy;
    const near = (nx - cx) * (nx - cx) + (ny - cy) * (ny - cy);
    if (near >= r * r) return 2;
    const fx = Math.max(Math.abs(cx - x), Math.abs(cx - x - w));
    const fy = Math.max(Math.abs(cy - y), Math.abs(cy - y - h));
    if (fx * fx + fy * fy <= r * r) return 0;
    return 1;
}

// Limite le dessin à la partie corrompue de la vue (rectangle de vue moins le cercle sain)
export function clipOutside(ctx, v, zone) {
    ctx.beginPath();
    ctx.rect(v.minX - 60, v.minY - 60, v.maxX - v.minX + 120, v.maxY - v.minY + 120);
    if (zone.r > 0) {
        ctx.moveTo(zone.x + zone.r, zone.y);
        ctx.arc(zone.x, zone.y, zone.r, 0, TAU);
    }
    ctx.clip('evenodd');
}

/* ===================== SOL : RECOLORATION ===================== */

// Table luminosité -> couleur corrompue (du noir au violet vif), calculée une fois
const LUT = (() => {
    const stops = [
        [0, 6, 0, 12], [0.3, 30, 6, 50], [0.55, 66, 18, 104], [0.78, 118, 44, 176], [1, 186, 120, 250]
    ];
    const t = new Uint8Array(256 * 3);
    for (let i = 0; i < 256; i++) {
        const v = i / 255;
        let k = 1;
        while (k < stops.length - 1 && stops[k][0] < v) k++;
        const a = stops[k - 1];
        const b = stops[k];
        const f = (v - a[0]) / (b[0] - a[0] || 1);
        for (let c = 0; c < 3; c++) t[i * 3 + c] = Math.round(a[c + 1] + (b[c + 1] - a[c + 1]) * f);
    }
    return t;
})();

// Recolore une image (RGBA) en violet / noir en gardant la texture (luminosité)
export function recolor(data) {
    for (let i = 0; i < data.length; i += 4) {
        // Luminosité un peu écrasée : le sol corrompu est globalement sombre
        const l = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
        const k = ((l * l) >> 8) * 3;
        data[i] = LUT[k];
        data[i + 1] = LUT[k + 1];
        data[i + 2] = LUT[k + 2];
    }
}

/* ===================== SOL : DÉTAILS ===================== */

const DETAIL_CELL = 260;   // une case de détails ; les cases dépassant du chunk sont aussi
const DETAIL_PAD = 110;    // dessinées (mêmes données) : pas de coupure visible entre chunks

function crack(ctx, x, y, a, n, len, r) {
    ctx.moveTo(x, y);
    for (let s = 0; s < n; s++) {
        a += (r() - 0.5) * 1.3;
        x += Math.cos(a) * len * (0.6 + r() * 0.6);
        y += Math.sin(a) * len * (0.6 + r() * 0.6);
        ctx.lineTo(x, y);
        // Petite branche
        if (r() < 0.3) {
            const b = a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6);
            ctx.lineTo(x + Math.cos(b) * len * 0.6, y + Math.sin(b) * len * 0.6);
            ctx.moveTo(x, y);
        }
    }
}

function crystal(ctx, x, y, size, r) {
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (r() - 0.5) * 2.2;
        const len = size * (0.6 + r() * 0.7);
        const w = size * (0.22 + r() * 0.12);
        const px = Math.cos(a + Math.PI / 2) * w;
        const py = Math.sin(a + Math.PI / 2) * w;
        const tx = x + Math.cos(a) * len;
        const ty = y + Math.sin(a) * len;
        ctx.beginPath();
        ctx.moveTo(x - px, y - py);
        ctx.lineTo(tx, ty);
        ctx.lineTo(x + px, y + py);
        ctx.closePath();
        ctx.fillStyle = '#7b2fe0';
        ctx.fill();
        ctx.strokeStyle = '#10001c';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // Facette claire
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tx, ty);
        ctx.lineTo(x + px * 0.8, y + py * 0.8);
        ctx.closePath();
        ctx.fillStyle = 'rgba(220, 170, 255, 0.55)';
        ctx.fill();
    }
}

// Gravats + fissures dans un bâtiment (déterministe par bâtiment)
function ruinBuilding(ctx, b) {
    const r = rng(b.id * 7 + 101);
    // Sol fissuré
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
        crack(ctx, b.x + b.w * (0.2 + r() * 0.6), b.y + b.h * (0.2 + r() * 0.6), r() * TAU, 5, 26, r);
    }
    ctx.strokeStyle = '#05000a';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = '#b04cff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Gravats le long des murs
    for (let i = 0; i < 12; i++) {
        const side = Math.floor(r() * 4);
        const t = r();
        let x = side < 2 ? b.x + t * b.w : side === 2 ? b.x : b.x + b.w;
        let y = side >= 2 ? b.y + t * b.h : side === 0 ? b.y : b.y + b.h;
        x += (r() - 0.5) * 40;
        y += (r() - 0.5) * 40;
        const s = 7 + r() * 13;
        ctx.beginPath();
        const n = 5;
        for (let k = 0; k < n; k++) {
            const a = (k / n) * TAU + r() * 0.8;
            const rr = s * (0.6 + r() * 0.5);
            if (k === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
            else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = r() < 0.5 ? '#2b1a3a' : '#3d2653';
        ctx.fill();
        ctx.strokeStyle = '#0a0012';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

/*
   Détails du sol corrompu en coordonnées monde, pour le chunk [x0, x0+size] :
   taches noires, fissures lumineuses, cristaux, et bâtiments en ruine.
*/
export function drawCorruptDetails(ctx, world, x0, y0, size) {
    const x1 = x0 + size;
    const y1 = y0 + size;
    const i0 = Math.floor((x0 - DETAIL_PAD) / DETAIL_CELL);
    const j0 = Math.floor((y0 - DETAIL_PAD) / DETAIL_CELL);
    const i1 = Math.floor((x1 + DETAIL_PAD) / DETAIL_CELL);
    const j1 = Math.floor((y1 + DETAIL_PAD) / DETAIL_CELL);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1) Taches noires (un seul remplissage)
    ctx.beginPath();
    for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
            const x = (i + hash2(i, j, 1)) * DETAIL_CELL;
            const y = (j + hash2(i, j, 2)) * DETAIL_CELL;
            const rr = 30 + hash2(i, j, 3) * 70;
            ctx.moveTo(x + rr, y);
            ctx.ellipse(x, y, rr, rr * (0.6 + hash2(i, j, 4) * 0.4), hash2(i, j, 5) * TAU, 0, TAU);
        }
    }
    ctx.fillStyle = 'rgba(4, 0, 10, 0.35)';
    ctx.fill();

    // 2) Fissures : trait noir épais puis cœur violet lumineux
    ctx.beginPath();
    for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
            if (hash2(i, j, 6) > 0.75) continue;
            const r = rng((i * 92821) ^ (j * 68917) ^ 7);
            crack(ctx, (i + r()) * DETAIL_CELL, (j + r()) * DETAIL_CELL, r() * TAU, 5 + Math.floor(r() * 4), 24, r);
        }
    }
    ctx.strokeStyle = '#05000a';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(176, 76, 255, 0.95)';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // 3) Bâtiments en ruine
    for (const b of world.buildings) {
        if (b.x + b.w + 60 < x0 || b.x - 60 > x1 || b.y + b.h + 60 < y0 || b.y - 60 > y1) continue;
        ruinBuilding(ctx, b);
    }

    // 4) Cristaux violets (une case sur trois environ)
    for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
            if (hash2(i, j, 8) > 0.35) continue;
            const x = (i + 0.2 + hash2(i, j, 9) * 0.6) * DETAIL_CELL;
            const y = (j + 0.2 + hash2(i, j, 10) * 0.6) * DETAIL_CELL;
            // Pas au milieu d'une maison (les gravats y sont déjà)
            if (world.buildings.some(b => x > b.x - 20 && x < b.x + b.w + 20 && y > b.y - 20 && y < b.y + b.h + 20)) continue;
            crystal(ctx, x, y, 18 + hash2(i, j, 11) * 16, rng((i * 131) ^ (j * 977) ^ 3));
        }
    }
    ctx.restore();
}

/* ===================== ARBRES ET BUISSONS ===================== */

const TREE_BASE = '#3a1454';
const TREE_DARK = '#0d0318';
const TREE_LIGHT = '#6d2a99';

// Même dessin que l'objet normal, avec la palette corrompue (+ quelques points lumineux)
export function drawCorruptObject(ctx, o) {
    const base = o.base;
    const dark = o.dark;
    const light = o.light;
    const snowy = o.snowy;
    o.base = TREE_BASE;
    o.dark = TREE_DARK;
    o.light = TREE_LIGHT;
    o.snowy = false;
    drawObject(ctx, o);
    o.base = base;
    o.dark = dark;
    o.light = light;
    o.snowy = snowy;

    // Spores violettes sur le feuillage
    if (o.layer === 'top') {
        const r = o.r;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
            const a = hash2(o.id, k, 21) * TAU;
            const d = r * (0.2 + hash2(o.id, k, 22) * 0.55);
            const s = 2.5 + hash2(o.id, k, 23) * 3;
            const x = o.x + Math.cos(a) * d;
            const y = o.y + Math.sin(a) * d;
            ctx.moveTo(x + s, y);
            ctx.arc(x, y, s, 0, TAU);
        }
        ctx.fillStyle = '#c77dff';
        ctx.fill();
    }
}

/* ===================== TOITS ===================== */

// Trous et fissures d'un toit (calculés une fois par bâtiment)
function roofDamage(b) {
    if (b._roofDmg) return b._roofDmg;
    const r = rng(b.id * 13 + 57);
    const holes = [];
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
        const cx = b.x + b.w * (0.2 + r() * 0.6);
        const cy = b.y + b.h * (0.2 + r() * 0.6);
        const size = Math.min(b.w, b.h) * (0.12 + r() * 0.1);
        const pts = [];
        const k = 9;
        for (let j = 0; j < k; j++) {
            const a = (j / k) * TAU;
            const rr = size * (j % 2 ? 0.55 + r() * 0.3 : 0.9 + r() * 0.4);
            pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        holes.push(pts);
    }
    const cracks = [];
    for (let i = 0; i < 3; i++) {
        cracks.push({ x: b.x + b.w * r(), y: b.y + b.h * r(), a: r() * TAU, seed: Math.floor(r() * 1e6) });
    }
    b._roofDmg = { holes, cracks };
    return b._roofDmg;
}

function holePath(ctx, pts, scale, cx, cy) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
        const x = cx + (pts[i] - cx) * scale;
        const y = cy + (pts[i + 1] - cy) * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

// Toit corrompu : couleurs violet / noir, trous qui laissent voir l'intérieur, fissures
export function drawCorruptRoof(ctx, b) {
    if (b.alpha < 0.02) return;
    const keep = [b.roof, b.roofLight, b.roofDark, b.snow];
    b.roof = '#2b0f3f';
    b.roofLight = '#43195f';
    b.roofDark = '#0c0214';
    b.snow = false;
    drawRoof(ctx, b);
    [b.roof, b.roofLight, b.roofDark, b.snow] = keep;

    const dmg = roofDamage(b);
    ctx.save();
    ctx.globalAlpha = b.alpha;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const pts of dmg.holes) {
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i + 1]; }
        cx /= pts.length / 2;
        cy /= pts.length / 2;
        // Bord arraché (lueur violette), puis le trou noir
        holePath(ctx, pts, 1.18, cx, cy);
        ctx.fillStyle = '#8b3dff';
        ctx.fill();
        holePath(ctx, pts, 1, cx, cy);
        ctx.fillStyle = '#05000a';
        ctx.fill();
        ctx.strokeStyle = '#1a0628';
        ctx.lineWidth = 3;
        ctx.stroke();
    }
    ctx.beginPath();
    for (const c of dmg.cracks) crack(ctx, c.x, c.y, c.a, 4, 22, rng(c.seed));
    ctx.strokeStyle = '#05000a';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = '#b04cff';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();
}
