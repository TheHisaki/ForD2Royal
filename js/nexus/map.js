/* ==================================
   NEXUS - CARTE « SANCTUAIRE DE KAÏRO » (Contrôle)
   Carte symétrique gauche / droite, comme une carte de Contrôle d'Overwatch :
   - une base par équipe (salle d'apparition, 3 sorties),
   - un point de contrôle au centre, sur le parvis du sanctuaire,
   - 3 chemins vers le point : le marché nocturne (nord), la cour des
     lanternes (centre) et le jardin zen (sud, avec étang et pont).
   Seule la moitié gauche est décrite : la moitié droite est son miroir.
   ================================== */

const INK = '#0b1430';
const TAU = Math.PI * 2;

export const MAP_W = 3600;
export const MAP_H = 2200;
const MID = MAP_W / 2;

/* ----- Moitié gauche (équipe bleue) ----- */

// Sols (peints dans l'ordre)
const ZONES_LEFT = [
    { kind: 'market', name: 'Marché nocturne', x: 60, y: 60, w: MID - 60, h: 520 },
    { kind: 'garden', name: 'Jardin zen', x: 60, y: 1620, w: MID - 60, h: 520 },
    { kind: 'court', name: 'Cour des lanternes', x: 60, y: 580, w: 1240, h: 1040 },
    { kind: 'plaza', name: 'Parvis du sanctuaire', x: 1300, y: 580, w: MID - 1300, h: 1040 },
    { kind: 'spawn', name: 'Base', x: 60, y: 790, w: 370, h: 620 }
];

// Obstacles rectangulaires (bloquent le passage)
const RECTS_LEFT = [
    // Maisons à toit de pagode dans les coins
    { kind: 'building', x: 60, y: 60, w: 260, h: 470, neon: '#ff4fd8' },
    { kind: 'building', x: 60, y: 1670, w: 260, h: 470, neon: '#38e1ff' },
    // Salle d'apparition : 3 sorties (nord, sud, et grande porte à l'est)
    { kind: 'wall', x: 60, y: 760, w: 170, h: 30 },
    { kind: 'wall', x: 350, y: 760, w: 110, h: 30 },
    { kind: 'wall', x: 60, y: 1410, w: 170, h: 30 },
    { kind: 'wall', x: 350, y: 1410, w: 110, h: 30 },
    { kind: 'wall', x: 430, y: 790, w: 30, h: 170 },
    { kind: 'wall', x: 430, y: 1240, w: 30, h: 170 },
    // Murets entre le marché et la cour (une arche au milieu)
    { kind: 'wall', x: 320, y: 560, w: 380, h: 40 },
    { kind: 'wall', x: 820, y: 560, w: 680, h: 40 },
    // Murets entre la cour et le jardin
    { kind: 'wall', x: 320, y: 1600, w: 380, h: 40 },
    { kind: 'wall', x: 820, y: 1600, w: 680, h: 40 },
    // Étals du marché (couverture)
    { kind: 'stall', x: 520, y: 180, w: 150, h: 80, color: '#e8473c' },
    { kind: 'stall', x: 920, y: 330, w: 170, h: 70, color: '#2f7dff' },
    { kind: 'stall', x: 1250, y: 170, w: 130, h: 110, color: '#ffb02e' },
    { kind: 'stall', x: 1560, y: 340, w: 120, h: 70, color: '#8b5cf6' },
    // Couverture dans la cour
    { kind: 'crate', x: 640, y: 880, w: 70, h: 70 },
    { kind: 'crate', x: 640, y: 1250, w: 70, h: 70 },
    { kind: 'cover', x: 1080, y: 1020, w: 80, h: 160 },
    // Muret bas devant le point
    { kind: 'cover', x: 1420, y: 1040, w: 36, h: 120 },
    // Étang du jardin, coupé par un pont
    { kind: 'water', x: 560, y: 1760, w: 240, h: 260 },
    { kind: 'water', x: 920, y: 1760, w: 240, h: 260 }
];

// Obstacles ronds
const CIRCLES_LEFT = [
    // Piliers du portail (torii) de la cour
    { kind: 'pillar', x: 900, y: 790, r: 26 },
    { kind: 'pillar', x: 900, y: 1410, r: 26 },
    // Piliers autour du point
    { kind: 'pillar', x: 1600, y: 890, r: 36 },
    { kind: 'pillar', x: 1600, y: 1310, r: 36 },
    // Cerisiers (seul le tronc bloque)
    { kind: 'tree', x: 430, y: 1820, r: 44 },
    { kind: 'tree', x: 1350, y: 1830, r: 50 },
    { kind: 'tree', x: 1520, y: 2030, r: 40 },
    { kind: 'tree', x: 760, y: 420, r: 38 },
    // Rochers du jardin zen
    { kind: 'rock', x: 1240, y: 1700, r: 24 },
    { kind: 'rock', x: 1210, y: 2060, r: 30 }
];

// Décor sans collision
const DECOR_LEFT = [
    // Étang visuel d'un seul tenant (les collisions sont les 2 rectangles « water »)
    { kind: 'pond', x: 560, y: 1760, w: 600, h: 260 },
    { kind: 'bridge', x: 800, y: 1740, w: 120, h: 300 },
    { kind: 'torii', x: 900, y: 790, w: 0, h: 620 },
    // Inscription au sol, le long du mur du fond (les héros apparaissent plus à l'est)
    { kind: 'sign', x: 105, y: 1100, text: 'BASE' }
];

const LANTERNS_LEFT = [
    [520, 640], [520, 1560], [1180, 640], [1180, 1560], [380, 120], [1100, 120],
    [1700, 120], [1460, 520], [1460, 1680], [700, 2080], [1700, 2080]
];

/* ----- Miroir ----- */

const mirrorRect = (r) => ({ ...r, x: MAP_W - r.x - r.w, mirrored: true });
const mirrorCircle = (c) => ({ ...c, x: MAP_W - c.x, mirrored: true });

function both(list, mirror) {
    return [...list.map(o => ({ ...o, team: 'blue' })), ...list.map(o => ({ ...mirror(o), team: 'red' }))];
}

const BORDERS = [
    { kind: 'border', x: 0, y: 0, w: MAP_W, h: 60 },
    { kind: 'border', x: 0, y: MAP_H - 60, w: MAP_W, h: 60 },
    { kind: 'border', x: 0, y: 0, w: 60, h: MAP_H },
    { kind: 'border', x: MAP_W - 60, y: 0, w: 60, h: MAP_H }
];

export const KAIRO = {
    id: 'kairo',
    name: 'Sanctuaire de Kaïro',
    mode: 'control',
    modeName: 'Contrôle',
    color: '#ff4fd8',
    width: MAP_W,
    height: MAP_H,
    point: { x: MID, y: MAP_H / 2, r: 200, name: 'Point de contrôle' },
    spawns: {
        blue: [[200, 1000], [200, 1200], [300, 900], [300, 1100], [300, 1300]].map(([x, y]) => ({ x, y })),
        red: [[200, 1000], [200, 1200], [300, 900], [300, 1100], [300, 1300]].map(([x, y]) => ({ x: MAP_W - x, y }))
    },
    zones: both(ZONES_LEFT, mirrorRect),
    rects: [...BORDERS, ...both(RECTS_LEFT, mirrorRect)],
    circles: both(CIRCLES_LEFT, mirrorCircle),
    decor: both(DECOR_LEFT, (d) => d.kind === 'sign' || d.kind === 'torii' ? mirrorCircle(d) : mirrorRect(d)),
    lanterns: both(LANTERNS_LEFT.map(([x, y]) => ({ x, y })), mirrorCircle)
};

/* ----- Collisions ----- */

// Rayon de collision des obstacles ronds (le tronc d'un arbre, pas son feuillage)
function solidRadius(c) {
    return c.kind === 'tree' ? c.r * 0.38 : c.r;
}

/** Repousse un cercle (x, y, r) hors des obstacles. Renvoie la position corrigée. */
export function collide(map, x, y, r) {
    for (let pass = 0; pass < 2; pass++) {
        for (const o of map.rects) {
            const cx = Math.max(o.x, Math.min(x, o.x + o.w));
            const cy = Math.max(o.y, Math.min(y, o.y + o.h));
            const dx = x - cx;
            const dy = y - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 >= r * r) continue;
            if (d2 > 1e-6) {
                const d = Math.sqrt(d2);
                x = cx + (dx / d) * r;
                y = cy + (dy / d) * r;
            } else {
                // Centre dans le rectangle : sortir par le bord le plus proche
                const left = x - o.x, right = o.x + o.w - x, top = y - o.y, bottom = o.y + o.h - y;
                const m = Math.min(left, right, top, bottom);
                if (m === left) x = o.x - r;
                else if (m === right) x = o.x + o.w + r;
                else if (m === top) y = o.y - r;
                else y = o.y + o.h + r;
            }
        }
        for (const c of map.circles) {
            const sr = solidRadius(c) + r;
            const dx = x - c.x;
            const dy = y - c.y;
            const d2 = dx * dx + dy * dy;
            if (d2 >= sr * sr || d2 < 1e-6) continue;
            const d = Math.sqrt(d2);
            x = c.x + (dx / d) * sr;
            y = c.y + (dy / d) * sr;
        }
    }
    return { x, y };
}

/** Nom du lieu sous une position (pour le HUD). */
export function placeAt(map, x, y) {
    const p = map.point;
    if (Math.hypot(x - p.x, y - p.y) <= p.r) return p.name;
    for (let i = map.zones.length - 1; i >= 0; i--) {
        const z = map.zones[i];
        if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
            if (z.kind === 'spawn') return z.team ? (z.team === 'blue' ? 'Base bleue' : 'Base rouge') : z.name;
            return z.name;
        }
    }
    return map.name;
}

/* ----- Rendu statique (dessiné une seule fois) ----- */

// Petit générateur déterministe : le décor est le même à chaque chargement
function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function clipRect(ctx, z, fn) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(z.x, z.y, z.w, z.h);
    ctx.clip();
    fn();
    ctx.restore();
}

function paintZone(ctx, z, rnd) {
    clipRect(ctx, z, () => {
        if (z.kind === 'market') {
            // Dalles de terre cuite
            ctx.fillStyle = '#b86a43';
            ctx.fillRect(z.x, z.y, z.w, z.h);
            ctx.strokeStyle = 'rgba(70, 30, 15, 0.35)';
            ctx.lineWidth = 3;
            for (let x = z.x; x < z.x + z.w; x += 70) { ctx.beginPath(); ctx.moveTo(x, z.y); ctx.lineTo(x, z.y + z.h); ctx.stroke(); }
            for (let y = z.y; y < z.y + z.h; y += 70) { ctx.beginPath(); ctx.moveTo(z.x, y); ctx.lineTo(z.x + z.w, y); ctx.stroke(); }
            for (let i = 0; i < 90; i++) {
                ctx.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
                ctx.fillRect(z.x + Math.floor(rnd() * z.w / 70) * 70, z.y + Math.floor(rnd() * z.h / 70) * 70, 70, 70);
            }
        } else if (z.kind === 'garden') {
            // Herbe + allée de gravier ratissé
            ctx.fillStyle = '#5aa354';
            ctx.fillRect(z.x, z.y, z.w, z.h);
            for (let i = 0; i < 700; i++) {
                ctx.fillStyle = rnd() < 0.5 ? 'rgba(20, 70, 30, 0.35)' : 'rgba(170, 230, 120, 0.25)';
                ctx.fillRect(z.x + rnd() * z.w, z.y + rnd() * z.h, 4, 9);
            }
            const gy = z.y + 75; // allée entre le muret et l'étang
            ctx.fillStyle = '#d9cfb8';
            ctx.fillRect(z.x, gy - 50, z.w, 100);
            ctx.strokeStyle = 'rgba(120, 100, 70, 0.35)';
            ctx.lineWidth = 2;
            for (let k = -40; k <= 40; k += 14) {
                ctx.beginPath(); ctx.moveTo(z.x, gy + k); ctx.lineTo(z.x + z.w, gy + k); ctx.stroke();
            }
        } else if (z.kind === 'court') {
            // Pavés en quinconce
            ctx.fillStyle = '#a9a294';
            ctx.fillRect(z.x, z.y, z.w, z.h);
            ctx.strokeStyle = 'rgba(40, 35, 30, 0.28)';
            ctx.lineWidth = 3;
            let row = 0;
            for (let y = z.y; y < z.y + z.h; y += 46, row++) {
                ctx.beginPath(); ctx.moveTo(z.x, y); ctx.lineTo(z.x + z.w, y); ctx.stroke();
                for (let x = z.x + (row % 2) * 46; x < z.x + z.w; x += 92) {
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 46); ctx.stroke();
                }
            }
            // Chemin central rouge vers le point
            ctx.fillStyle = 'rgba(176, 50, 45, 0.55)';
            ctx.fillRect(z.x, z.y + z.h / 2 - 70, z.w, 140);
            ctx.strokeStyle = 'rgba(255, 210, 120, 0.55)';
            ctx.lineWidth = 4;
            ctx.strokeRect(z.x - 10, z.y + z.h / 2 - 70, z.w + 20, 140);
        } else if (z.kind === 'plaza') {
            // Grandes dalles claires du parvis
            ctx.fillStyle = '#d6cdbb';
            ctx.fillRect(z.x, z.y, z.w, z.h);
            ctx.strokeStyle = 'rgba(80, 70, 55, 0.25)';
            ctx.lineWidth = 3;
            for (let x = z.x; x < z.x + z.w; x += 100) { ctx.beginPath(); ctx.moveTo(x, z.y); ctx.lineTo(x, z.y + z.h); ctx.stroke(); }
            for (let y = z.y; y < z.y + z.h; y += 100) { ctx.beginPath(); ctx.moveTo(z.x, y); ctx.lineTo(z.x + z.w, y); ctx.stroke(); }
        } else if (z.kind === 'spawn') {
            // Plancher de la base, teinté aux couleurs de l'équipe
            ctx.fillStyle = '#6f4a30';
            ctx.fillRect(z.x, z.y, z.w, z.h);
            ctx.strokeStyle = 'rgba(30, 15, 5, 0.45)';
            ctx.lineWidth = 3;
            for (let y = z.y; y < z.y + z.h; y += 34) { ctx.beginPath(); ctx.moveTo(z.x, y); ctx.lineTo(z.x + z.w, y); ctx.stroke(); }
            ctx.fillStyle = z.team === 'blue' ? 'rgba(56, 189, 248, 0.18)' : 'rgba(244, 63, 94, 0.18)';
            ctx.fillRect(z.x, z.y, z.w, z.h);
        }
    });
}

function shadowOf(ctx, o) {
    ctx.fillStyle = 'rgba(5, 10, 30, 0.28)';
    if (o.r) {
        ctx.beginPath();
        ctx.arc(o.x + 10, o.y + 14, (o.kind === 'tree' ? o.r * 0.9 : o.r), 0, TAU);
        ctx.fill();
    } else {
        ctx.fillRect(o.x + 12, o.y + 16, o.w, o.h);
    }
}

function drawBuilding(ctx, o) {
    // Murs, puis toit de pagode qui déborde
    ctx.fillStyle = '#efe4cc';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    const over = 16;
    const rx = o.x - over, ry = o.y - over, rw = o.w + over * 2, rh = o.h + over * 2;
    ctx.beginPath();
    ctx.roundRect(rx, ry, rw, rh, 22);
    ctx.fillStyle = '#2f3d66';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // Rangées de tuiles
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(rx, ry, rw, rh, 22);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 3;
    for (let y = ry + 18; y < ry + rh; y += 22) {
        ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx + rw, y); ctx.stroke();
    }
    ctx.restore();
    // Bordure rouge laquée + faîtage doré
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#c0392b';
    ctx.beginPath();
    ctx.roundRect(rx + 6, ry + 6, rw - 12, rh - 12, 18);
    ctx.stroke();
    ctx.lineWidth = 10;
    ctx.strokeStyle = INK;
    const cx = o.x + o.w / 2;
    ctx.beginPath(); ctx.moveTo(cx, ry + 30); ctx.lineTo(cx, ry + rh - 30); ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#e8b931';
    ctx.stroke();
    for (const yy of [ry + 30, ry + rh - 30]) {
        ctx.beginPath(); ctx.arc(cx, yy, 9, 0, TAU);
        ctx.fillStyle = '#e8b931'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    }
    // Enseigne néon côté rue
    if (o.neon) {
        const nx = o.mirrored ? o.x - 6 : o.x + o.w - 2;
        ctx.save();
        ctx.shadowColor = o.neon;
        ctx.shadowBlur = 24;
        ctx.fillStyle = o.neon;
        ctx.fillRect(nx - 4, o.y + o.h * 0.3, 12, o.h * 0.4);
        ctx.restore();
    }
}

function drawStall(ctx, o) {
    // Comptoir en bois sous un auvent rayé
    ctx.fillStyle = '#7a5236';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(o.x - 8, o.y - 8, o.w + 16, o.h + 16);
    ctx.clip();
    for (let x = o.x - 8, i = 0; x < o.x + o.w + 8; x += 22, i++) {
        ctx.fillStyle = i % 2 ? '#f6efe1' : o.color;
        ctx.fillRect(x, o.y - 8, 22, o.h + 16);
    }
    ctx.restore();
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.strokeRect(o.x - 8, o.y - 8, o.w + 16, o.h + 16);
}

function drawCrate(ctx, o) {
    ctx.fillStyle = '#b07a3e';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.strokeRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = '#7a4f22';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(o.x + 8, o.y + 8); ctx.lineTo(o.x + o.w - 8, o.y + o.h - 8);
    ctx.moveTo(o.x + o.w - 8, o.y + 8); ctx.lineTo(o.x + 8, o.y + o.h - 8);
    ctx.stroke();
    ctx.strokeRect(o.x + 6, o.y + 6, o.w - 12, o.h - 12);
}

function drawWall(ctx, o, color = '#8d8f99', top = '#b4b6c0') {
    ctx.fillStyle = color;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = top;
    ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, Math.max(4, o.h * 0.35));
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.strokeRect(o.x, o.y, o.w, o.h);
}

function drawWater(ctx, o, rnd) {
    ctx.fillStyle = '#c9c0ad';
    ctx.beginPath(); ctx.roundRect(o.x - 12, o.y - 12, o.w + 24, o.h + 24, 30); ctx.fill();
    ctx.beginPath(); ctx.roundRect(o.x, o.y, o.w, o.h, 24);
    const g = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
    g.addColorStop(0, '#3aa0e8');
    g.addColorStop(1, '#1f6fc0');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    // Nénuphars et reflets
    for (let i = 0; i < 5; i++) {
        const x = o.x + 30 + rnd() * (o.w - 60);
        const y = o.y + 30 + rnd() * (o.h - 60);
        ctx.beginPath(); ctx.arc(x, y, 12, 0.4, TAU - 0.2);
        ctx.lineTo(x, y);
        ctx.fillStyle = '#4fbf5a'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
        const x = o.x + 20 + rnd() * (o.w - 70);
        const y = o.y + 20 + rnd() * (o.h - 40);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34, y); ctx.stroke();
    }
}

function drawBridge(ctx, o) {
    // Pont rouge nord-sud au-dessus de l'étang : planches en travers, rambardes sur les côtés
    ctx.fillStyle = 'rgba(5, 10, 30, 0.3)';
    ctx.fillRect(o.x + 8, o.y + 10, o.w, o.h);
    ctx.fillStyle = '#c8473c';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 3;
    for (let y = o.y + 14; y < o.y + o.h; y += 18) { ctx.beginPath(); ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); ctx.stroke(); }
    for (const x of [o.x - 4, o.x + o.w - 6]) {
        ctx.fillStyle = '#8f1f1a';
        ctx.fillRect(x, o.y - 6, 10, o.h + 12);
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(x, o.y - 6, 10, o.h + 12);
    }
}

function drawPillar(ctx, o) {
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU);
    ctx.fillStyle = '#c0392b'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.62, 0, TAU);
    ctx.fillStyle = '#e8b931'; ctx.fill();
    ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(o.x - o.r * 0.25, o.y - o.r * 0.25, o.r * 0.2, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
}

function drawRock(ctx, o) {
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        const rr = o.r * (0.85 + 0.15 * Math.sin(i * 2.7 + o.x));
        const px = o.x + Math.cos(a) * rr, py = o.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#8c8a86'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    ctx.strokeStyle = 'rgba(120, 100, 70, 0.4)'; ctx.lineWidth = 2;
    for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(o.x, o.y, o.r + k * 12, 0, TAU); ctx.stroke(); }
}

function drawTrunk(ctx, o) {
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.38, 0, TAU);
    ctx.fillStyle = '#5b3a24'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
}

// Feuillage de cerisier, dessiné AU-DESSUS des héros (calque séparé, semi-transparent)
function drawCanopy(ctx, o, rnd) {
    const blobs = 7;
    for (let i = 0; i < blobs; i++) {
        const a = (i / blobs) * TAU + rnd() * 0.4;
        const d = o.r * 0.55;
        const r = o.r * (0.55 + rnd() * 0.15);
        ctx.beginPath(); ctx.arc(o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, r, 0, TAU);
        ctx.fillStyle = '#f7a8c8'; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.7, 0, TAU);
    ctx.fillStyle = '#ffc6dc'; ctx.fill();
    for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        ctx.arc(o.x + (rnd() - 0.5) * o.r * 1.8, o.y + (rnd() - 0.5) * o.r * 1.8, 4, 0, TAU);
        ctx.fillStyle = '#fff0f6'; ctx.fill();
    }
}

function drawTorii(ctx, o) {
    // Poutre du portail au-dessus de l'allée (vue de dessus)
    const y1 = o.y, y2 = o.y + o.h;
    ctx.fillStyle = '#1d1d24';
    ctx.fillRect(o.x - 22, y1 - 10, 44, y2 - y1 + 20);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(o.x - 16, y1 - 4, 32, y2 - y1 + 8);
    ctx.lineWidth = 4; ctx.strokeStyle = INK;
    ctx.strokeRect(o.x - 22, y1 - 10, 44, y2 - y1 + 20);
}

function drawPointBase(ctx, p) {
    // Dais octogonal du sanctuaire
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + Math.PI / 8;
        const px = p.x + Math.cos(a) * (p.r + 40), py = p.y + Math.sin(a) * (p.r + 40);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#e9e2d2'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
    // Gravures concentriques
    ctx.strokeStyle = 'rgba(80, 60, 30, 0.35)';
    ctx.lineWidth = 3;
    for (const k of [0.35, 0.6, 0.85]) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k, 0, TAU); ctx.stroke(); }
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(a) * p.r * 0.35, p.y + Math.sin(a) * p.r * 0.35);
        ctx.lineTo(p.x + Math.cos(a) * p.r * 0.85, p.y + Math.sin(a) * p.r * 0.85);
        ctx.stroke();
    }
}

/** Construit les calques statiques de la carte (sol + obstacles, et feuillage). */
export function buildMapLayers(map) {
    const ground = document.createElement('canvas');
    ground.width = map.width;
    ground.height = map.height;
    const ctx = ground.getContext('2d');
    ctx.lineJoin = 'round';
    const rnd = rng(7331);

    ctx.fillStyle = '#1b2440';
    ctx.fillRect(0, 0, map.width, map.height);
    for (const z of map.zones) paintZone(ctx, z, rnd);
    drawPointBase(ctx, map.point);

    // Ombres portées, puis objets
    for (const o of map.rects) if (o.kind !== 'water' && o.kind !== 'border') shadowOf(ctx, o);
    for (const c of map.circles) if (c.kind !== 'tree') shadowOf(ctx, c);

    for (const d of map.decor) if (d.kind === 'pond') drawWater(ctx, d, rnd);
    for (const d of map.decor) if (d.kind === 'bridge') drawBridge(ctx, d);
    for (const d of map.decor) {
        if (d.kind !== 'sign') continue;
        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.team === 'blue' ? -Math.PI / 2 : Math.PI / 2);
        ctx.font = '700 64px "Bebas Neue", Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = d.team === 'blue' ? 'rgba(56, 189, 248, 0.22)' : 'rgba(244, 63, 94, 0.22)';
        ctx.fillText(d.team === 'blue' ? 'BASE BLEUE' : 'BASE ROUGE', 0, 0);
        ctx.restore();
    }
    for (const o of map.rects) {
        if (o.kind === 'building') drawBuilding(ctx, o);
        else if (o.kind === 'stall') drawStall(ctx, o);
        else if (o.kind === 'crate') drawCrate(ctx, o);
        else if (o.kind === 'cover') drawWall(ctx, o, '#9a7b55', '#c49d6e');
        else if (o.kind === 'wall') drawWall(ctx, o);
        else if (o.kind === 'border') drawWall(ctx, o, '#232c48', '#2f3a5c');
    }
    for (const c of map.circles) {
        if (c.kind === 'pillar') drawPillar(ctx, c);
        else if (c.kind === 'rock') drawRock(ctx, c);
        else if (c.kind === 'tree') drawTrunk(ctx, c);
    }
    for (const d of map.decor) if (d.kind === 'torii') drawTorii(ctx, d);

    // Calque du feuillage (au-dessus des héros)
    const canopy = document.createElement('canvas');
    canopy.width = map.width;
    canopy.height = map.height;
    const cctx = canopy.getContext('2d');
    for (const c of map.circles) if (c.kind === 'tree') drawCanopy(cctx, c, rnd);

    return { ground, canopy };
}

/* ----- Rendu animé (chaque image) ----- */

/** Point de contrôle : verrouillé tant que `lockLeft` > 0, sinon neutre. */
export function drawControlPoint(ctx, map, t, lockLeft) {
    const p = map.point;
    const locked = lockLeft > 0;
    ctx.save();
    // Zone de capture
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fillStyle = locked ? 'rgba(255, 255, 255, 0.10)' : 'rgba(255, 255, 255, 0.2)';
    ctx.fill();
    ctx.setLineDash([26, 16]);
    ctx.lineDashOffset = -t * 30;
    ctx.lineWidth = 8;
    ctx.strokeStyle = locked ? 'rgba(255, 255, 255, 0.55)' : '#ffffff';
    ctx.stroke();
    ctx.setLineDash([]);
    // Onde qui part du centre
    const k = (t * 0.5) % 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k, 0, TAU);
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 * (1 - k)})`;
    ctx.stroke();
    // Emblème central
    ctx.beginPath(); ctx.arc(p.x, p.y, 46, 0, TAU);
    ctx.fillStyle = INK; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.font = '700 54px "Bebas Neue", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    if (locked) {
        // Cadenas
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(p.x, p.y - 8, 12, Math.PI, 0); ctx.stroke();
        ctx.fillRect(p.x - 17, p.y - 8, 34, 26);
    } else {
        ctx.fillText('A', p.x, p.y + 3);
    }
    ctx.restore();
}

/** Lanternes et barrières des bases (scintillement). */
export function drawAnimatedDecor(ctx, map, t) {
    for (const [i, l] of map.lanterns.entries()) {
        const f = 0.75 + 0.25 * Math.sin(t * 3 + i * 1.7);
        const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 90);
        g.addColorStop(0, `rgba(255, 170, 60, ${0.45 * f})`);
        g.addColorStop(1, 'rgba(255, 170, 60, 0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(l.x, l.y, 90, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(l.x, l.y, 14, 18, 0, 0, TAU);
        ctx.fillStyle = '#e8473c'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(l.x, l.y, 6, 9, 0, 0, TAU);
        ctx.fillStyle = `rgba(255, 230, 140, ${f})`; ctx.fill();
    }
    // Barrière lumineuse aux sorties des bases
    for (const team of ['blue', 'red']) {
        const col = team === 'blue' ? '56, 189, 248' : '244, 63, 94';
        const a = 0.35 + 0.2 * Math.sin(t * 4);
        const doors = team === 'blue'
            ? [[445, 960, 445, 1240], [230, 775, 350, 775], [230, 1425, 350, 1425]]
            : [[MAP_W - 445, 960, MAP_W - 445, 1240], [MAP_W - 230, 775, MAP_W - 350, 775], [MAP_W - 230, 1425, MAP_W - 350, 1425]];
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(${col}, ${a})`;
        for (const [ax, ay, bx, by] of doors) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
    }
}
