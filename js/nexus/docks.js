/* ==================================
   NEXUS - CARTE « DOCKS DE NÉO-RIVAGE » (Escorte)
   Un port industriel au coucher du soleil. Les attaquants escortent le convoi
   d'ouest en est, sur la route du port, à travers 3 étapes :
     départ → point de passage A (entrepôts) → point de passage B (chantier naval) → arrivée (terminal).
   Les bases d'apparition avancent avec le convoi (comme dans Overwatch).
   ================================== */

const INK = '#0b1430';
const TAU = Math.PI * 2;
export const DOCKS_W = 4400;
export const DOCKS_H = 2400;

// Route du convoi (attaquants à l'ouest)
const PATH = [
    [560, 1150], [1300, 1150], [1500, 800], [2500, 800], [2700, 1300], [3700, 1300], [3900, 900], [4250, 900]
];
// Indices des sommets de la route qui sont des points de passage (A, B, arrivée)
const CHECKPOINTS = [3, 5, 7];

// Salle d'apparition : murs épais avec une porte large sur un côté
function room(x, y, w, h, door) {
    const T = 30, D = 170;
    const walls = [];
    const mid = (a, len) => a + len / 2;
    // Haut / bas
    const horiz = (yy, s) => {
        if (door === s) {
            const cx = mid(x, w);
            walls.push({ kind: 'wall', x, y: yy, w: cx - D / 2 - x, h: T }, { kind: 'wall', x: cx + D / 2, y: yy, w: x + w - (cx + D / 2), h: T });
        } else walls.push({ kind: 'wall', x, y: yy, w, h: T });
    };
    const vert = (xx, s) => {
        if (door === s) {
            const cy = mid(y, h);
            walls.push({ kind: 'wall', x: xx, y, w: T, h: cy - D / 2 - y }, { kind: 'wall', x: xx, y: cy + D / 2, w: T, h: y + h - (cy + D / 2) });
        } else walls.push({ kind: 'wall', x: xx, y, w: T, h });
    };
    horiz(y, 'top'); horiz(y + h - T, 'bottom'); vert(x, 'left'); vert(x + w - T, 'right');
    // Porte (pour la barrière lumineuse) et places d'apparition
    const cx = x + w / 2, cy = y + h / 2;
    const doorLine = door === 'top' ? [cx - D / 2, y + T / 2, cx + D / 2, y + T / 2]
        : door === 'bottom' ? [cx - D / 2, y + h - T / 2, cx + D / 2, y + h - T / 2]
            : door === 'left' ? [x + T / 2, cy - D / 2, x + T / 2, cy + D / 2]
                : [x + w - T / 2, cy - D / 2, x + w - T / 2, cy + D / 2];
    const spots = [[-0.25, -0.22], [0.25, -0.22], [0, 0], [-0.25, 0.22], [0.25, 0.22]].map(([u, v]) => ({ x: cx + u * (w - 90), y: cy + v * (h - 90) }));
    return { zone: { kind: 'spawn', name: 'Base', x: x + T, y: y + T, w: w - 2 * T, h: h - 2 * T }, walls, door: doorLine, spots };
}

// Bases d'apparition : la 1re de chaque liste sert au départ, puis elles avancent
const ROOMS = {
    a0: room(80, 950, 340, 400, 'right'),
    a1: room(1150, 1650, 360, 330, 'top'),
    d0: room(2400, 1650, 360, 330, 'top'),     // défense de A, puis base d'attaque après B
    d1: room(3500, 1700, 360, 330, 'top'),
    d2: room(4020, 300, 340, 320, 'bottom')
};

const BORDERS = [
    { kind: 'border', x: 0, y: 0, w: DOCKS_W, h: 60 },
    { kind: 'border', x: 0, y: DOCKS_H - 60, w: DOCKS_W, h: 60 },
    { kind: 'border', x: 0, y: 0, w: 60, h: DOCKS_H },
    { kind: 'border', x: DOCKS_W - 60, y: 0, w: 60, h: DOCKS_H }
];

const RECTS = [
    ...BORDERS,
    // Le port : l'eau au sud (infranchissable, les tirs passent au-dessus)
    { kind: 'water', x: 60, y: 2130, w: DOCKS_W - 120, h: 210 },
    // Entrepôts
    { kind: 'warehouse', x: 500, y: 300, w: 600, h: 420, color: '#4a6fa5' },
    { kind: 'warehouse', x: 560, y: 1450, w: 520, h: 420, color: '#a5584a' },
    { kind: 'warehouse', x: 1700, y: 1100, w: 500, h: 450, color: '#5f8a5a' },
    { kind: 'warehouse', x: 1600, y: 200, w: 500, h: 380, color: '#8a6aa5' },
    { kind: 'warehouse', x: 2800, y: 300, w: 520, h: 650, color: '#4a8aa5' },
    { kind: 'warehouse', x: 2900, y: 1650, w: 420, h: 380, color: '#a58a4a' },
    { kind: 'warehouse', x: 3500, y: 300, w: 300, h: 450, color: '#a54a6f' },
    { kind: 'warehouse', x: 4000, y: 1400, w: 340, h: 500, color: '#4aa58a' },
    // Conteneurs (couverture près de la route)
    { kind: 'container', x: 800, y: 920, w: 180, h: 70, color: '#e8473c' },
    { kind: 'container', x: 1000, y: 1290, w: 180, h: 70, color: '#2f7dff' },
    { kind: 'container', x: 1250, y: 600, w: 70, h: 160, color: '#ffb02e' },
    { kind: 'container', x: 1950, y: 940, w: 180, h: 70, color: '#3fbf4a' },
    { kind: 'container', x: 2280, y: 560, w: 160, h: 70, color: '#e8473c' },
    { kind: 'container', x: 2900, y: 1110, w: 180, h: 70, color: '#8b5cf6' },
    { kind: 'container', x: 3150, y: 1440, w: 180, h: 70, color: '#2f7dff' },
    { kind: 'container', x: 3450, y: 1050, w: 70, h: 120, color: '#ffb02e' },
    { kind: 'container', x: 4050, y: 1080, w: 180, h: 70, color: '#e8473c' },
    { kind: 'container', x: 4150, y: 700, w: 150, h: 70, color: '#3fbf4a' },
    // Bases (murs)
    ...Object.values(ROOMS).flatMap(r => r.walls)
];

const CIRCLES = [
    // Fûts
    { kind: 'barrel', x: 700, y: 1350, r: 22 },
    { kind: 'barrel', x: 1450, y: 600, r: 22 },
    { kind: 'barrel', x: 2450, y: 1100, r: 22 },
    { kind: 'barrel', x: 3600, y: 1550, r: 22 },
    { kind: 'barrel', x: 3950, y: 1250, r: 22 },
    { kind: 'barrel', x: 1250, y: 1450, r: 22 },
    // Bittes d'amarrage sur le quai
    { kind: 'bollard', x: 900, y: 2090, r: 16 },
    { kind: 'bollard', x: 1900, y: 2090, r: 16 },
    { kind: 'bollard', x: 2700, y: 2090, r: 16 },
    { kind: 'bollard', x: 3800, y: 2090, r: 16 }
];

// Zones nommées (pour l'affichage du lieu) et teintes du sol
const ZONES = [
    { kind: 'quay', name: 'Quai des Brumes', x: 60, y: 60, w: 1340, h: 2070 },
    { kind: 'yard', name: 'Allée des Entrepôts', x: 1400, y: 60, w: 1150, h: 2070 },
    { kind: 'shipyard', name: 'Chantier naval', x: 2550, y: 60, w: 1150, h: 2070 },
    { kind: 'terminal', name: 'Terminal Néo-Rivage', x: 3700, y: 60, w: 640, h: 2070 },
    ...Object.values(ROOMS).map(r => r.zone)
];

const LAMPS = [
    [700, 1010], [1150, 1290], [1650, 680], [2350, 920], [2600, 1180], [3050, 1180], [3550, 1420], [4050, 800],
    [400, 2050], [1500, 2050], [2600, 2050], [3700, 2050]
].map(([x, y]) => ({ x, y }));

/* ----- Route : longueurs cumulées ----- */

const SEG = [];
let total = 0;
for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, ay] = PATH[i], [bx, by] = PATH[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    SEG.push({ ax, ay, bx, by, len, s0: total });
    total += len;
}

export const DOCKS = {
    id: 'docks',
    name: 'Docks de Néo-Rivage',
    mode: 'escort',
    modeName: 'Escorte',
    width: DOCKS_W,
    height: DOCKS_H,
    point: null,
    path: PATH.map(([x, y]) => ({ x, y })),
    pathLength: total,
    checkpoints: CHECKPOINTS.map(i => SEG[i - 1].s0 + SEG[i - 1].len),
    checkpointNames: ['A', 'B', 'Arrivée'],
    // Bases d'apparition selon l'étape (0 = vers A, 1 = vers B, 2 = vers l'arrivée)
    spawnPlan: {
        attack: [ROOMS.a0, ROOMS.a1, ROOMS.d0],
        defend: [ROOMS.d0, ROOMS.d1, ROOMS.d2]
    },
    rooms: ROOMS,
    zones: ZONES,
    rects: RECTS,
    circles: CIRCLES,
    decor: [],
    lanterns: LAMPS,
    // Utilisé par l'aperçu du vote
    color: '#ff8a3c'
};

/** Position et direction sur la route à la distance s. */
export function pathAt(map, s) {
    s = Math.max(0, Math.min(map.pathLength, s));
    for (const g of SEG) {
        if (s <= g.s0 + g.len) {
            const k = (s - g.s0) / g.len;
            return { x: g.ax + (g.bx - g.ax) * k, y: g.ay + (g.by - g.ay) * k, angle: Math.atan2(g.by - g.ay, g.bx - g.ax) };
        }
    }
    const last = SEG[SEG.length - 1];
    return { x: last.bx, y: last.by, angle: Math.atan2(last.by - last.ay, last.bx - last.ax) };
}

/* ----- Rendu statique ----- */

function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function shadow(ctx, o) {
    ctx.fillStyle = 'rgba(5, 10, 30, 0.3)';
    if (o.r) { ctx.beginPath(); ctx.arc(o.x + 8, o.y + 12, o.r, 0, TAU); ctx.fill(); }
    else ctx.fillRect(o.x + 14, o.y + 18, o.w, o.h);
}

function paintGround(ctx, map, rnd) {
    // Béton du quai, une teinte par quartier
    const tint = { quay: '#8e949c', yard: '#979189', shipyard: '#8b8f86', terminal: '#949aa3' };
    for (const z of map.zones) {
        if (z.kind === 'spawn') continue;
        ctx.fillStyle = tint[z.kind] || '#8e949c';
        ctx.fillRect(z.x, z.y, z.w, z.h);
    }
    // Dalles et joints de dilatation
    ctx.strokeStyle = 'rgba(40, 45, 55, 0.25)';
    ctx.lineWidth = 3;
    for (let x = 60; x < map.width; x += 160) { ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x, 2130); ctx.stroke(); }
    for (let y = 60; y < 2130; y += 160) { ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(map.width - 60, y); ctx.stroke(); }
    // Taches d'huile et marques au sol
    for (let i = 0; i < 160; i++) {
        ctx.fillStyle = `rgba(30, 30, 40, ${0.05 + rnd() * 0.08})`;
        ctx.beginPath();
        ctx.ellipse(60 + rnd() * (map.width - 120), 60 + rnd() * 2060, 10 + rnd() * 30, 6 + rnd() * 18, rnd() * TAU, 0, TAU);
        ctx.fill();
    }
    // Bord du quai
    ctx.fillStyle = '#c9a227';
    for (let x = 60; x < map.width - 60; x += 80) ctx.fillRect(x, 2112, 40, 18);
    ctx.fillStyle = '#5b5f68';
    ctx.fillRect(60, 2124, map.width - 120, 8);
}

function paintRoad(ctx, map) {
    const pts = map.path;
    const stroke = (w, color, dash = null) => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.lineWidth = w;
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash(dash || []);
        ctx.stroke();
        ctx.setLineDash([]);
    };
    stroke(270, INK);
    stroke(258, '#3d424e');
    stroke(240, '#454b58');
    // Bandes blanches des bords + pointillés jaunes au centre
    stroke(214, 'rgba(240, 240, 240, 0.7)');
    stroke(206, '#454b58');
    stroke(8, '#ffd21e', [40, 34]);
    // Rails du convoi
    for (const off of [-34, 34]) {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
            const a = pts[Math.min(i, pts.length - 2)], b = pts[Math.min(i + 1, pts.length - 1)];
            const ang = Math.atan2(b.y - a.y, b.x - a.x);
            const nx = -Math.sin(ang) * off, ny = Math.cos(ang) * off;
            const p = pts[i];
            if (i === 0) ctx.moveTo(p.x + nx, p.y + ny); else ctx.lineTo(p.x + nx, p.y + ny);
        }
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(200, 210, 220, 0.55)';
        ctx.stroke();
    }
}

function drawCheckpoints(ctx, map) {
    map.checkpoints.forEach((s, i) => {
        const p = pathAt(map, s);
        const nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
        // Portique en travers de la route
        ctx.lineCap = 'round';
        ctx.lineWidth = 22; ctx.strokeStyle = INK;
        ctx.beginPath(); ctx.moveTo(p.x - nx * 150, p.y - ny * 150); ctx.lineTo(p.x + nx * 150, p.y + ny * 150); ctx.stroke();
        ctx.lineWidth = 14; ctx.strokeStyle = i === 2 ? '#ffd21e' : '#e8edf5';
        ctx.stroke();
        for (const k of [-150, 150]) {
            ctx.beginPath(); ctx.arc(p.x + nx * k, p.y + ny * k, 18, 0, TAU);
            ctx.fillStyle = '#5b5f68'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
        }
        // Lettre peinte au sol
        ctx.save();
        ctx.translate(p.x - Math.cos(p.angle) * 70, p.y - Math.sin(p.angle) * 70);
        ctx.font = '700 70px "Bebas Neue", Impact, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillText(map.checkpointNames[i] === 'Arrivée' ? '★' : map.checkpointNames[i], 0, 0);
        ctx.restore();
    });
}

function drawWarehouse(ctx, o, rnd) {
    // Toit en tôle ondulée + bordure + aérateurs
    ctx.fillStyle = o.color;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.save();
    ctx.beginPath(); ctx.rect(o.x, o.y, o.w, o.h); ctx.clip();
    const vertical = o.h > o.w;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 6;
    if (vertical) for (let x = o.x + 10; x < o.x + o.w; x += 22) { ctx.beginPath(); ctx.moveTo(x, o.y); ctx.lineTo(x, o.y + o.h); ctx.stroke(); }
    else for (let y = o.y + 10; y < o.y + o.h; y += 22) { ctx.beginPath(); ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 4;
    if (vertical) for (let x = o.x + 21; x < o.x + o.w; x += 22) { ctx.beginPath(); ctx.moveTo(x, o.y); ctx.lineTo(x, o.y + o.h); ctx.stroke(); }
    else for (let y = o.y + 21; y < o.y + o.h; y += 22) { ctx.beginPath(); ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); ctx.stroke(); }
    ctx.restore();
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeRect(o.x, o.y, o.w, o.h);
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.strokeRect(o.x + 8, o.y + 8, o.w - 16, o.h - 16);
    // Aérateurs et lucarnes
    const n = Math.max(2, Math.floor((o.w * o.h) / 60000));
    for (let i = 0; i < n; i++) {
        const x = o.x + 40 + rnd() * (o.w - 80), y = o.y + 40 + rnd() * (o.h - 80);
        if (rnd() < 0.5) {
            ctx.beginPath(); ctx.arc(x, y, 18, 0, TAU);
            ctx.fillStyle = '#c3ccd8'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x - 12, y); ctx.lineTo(x + 12, y); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 12);
            ctx.lineWidth = 3; ctx.stroke();
        } else {
            ctx.fillStyle = 'rgba(160, 220, 255, 0.55)';
            ctx.fillRect(x - 30, y - 18, 60, 36);
            ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeRect(x - 30, y - 18, 60, 36);
        }
    }
}

function drawContainer(ctx, o) {
    ctx.fillStyle = o.color;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    const vertical = o.h > o.w;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.lineWidth = 3;
    if (vertical) for (let y = o.y + 10; y < o.y + o.h; y += 12) { ctx.beginPath(); ctx.moveTo(o.x + 6, y); ctx.lineTo(o.x + o.w - 6, y); ctx.stroke(); }
    else for (let x = o.x + 10; x < o.x + o.w; x += 12) { ctx.beginPath(); ctx.moveTo(x, o.y + 6); ctx.lineTo(x, o.y + o.h - 6); ctx.stroke(); }
    ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.strokeRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    if (vertical) ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, 6); else ctx.fillRect(o.x + 4, o.y + 4, 6, o.h - 8);
}

function drawWall(ctx, o, color = '#6b707c', top = '#9399a5') {
    ctx.fillStyle = color;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = top;
    ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, Math.max(4, o.h * 0.35));
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(o.x, o.y, o.w, o.h);
}

function drawWater(ctx, o, rnd) {
    const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
    g.addColorStop(0, '#2a8fd0');
    g.addColorStop(1, '#1a5e9e');
    ctx.fillStyle = g;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 60; i++) {
        const x = o.x + rnd() * o.w, y = o.y + 20 + rnd() * (o.h - 30);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30 + rnd() * 30, y); ctx.stroke();
    }
    // Navire de marchandises à quai
    const sx = 1500, sy = o.y + 40;
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.moveTo(sx, sy); ctx.lineTo(sx + 1100, sy); ctx.lineTo(sx + 1220, sy + 70); ctx.lineTo(sx + 1100, sy + 140); ctx.lineTo(sx, sy + 140);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#e8edf5';
    ctx.fillRect(sx + 30, sy + 20, 1050, 100);
    const colors = ['#e8473c', '#2f7dff', '#ffb02e', '#3fbf4a', '#8b5cf6'];
    for (let i = 0; i < 12; i++) {
        ctx.fillStyle = colors[i % colors.length];
        ctx.fillRect(sx + 50 + i * 85, sy + 30, 76, 36);
        ctx.fillStyle = colors[(i + 2) % colors.length];
        ctx.fillRect(sx + 50 + i * 85, sy + 72, 76, 36);
    }
    ctx.lineWidth = 3; ctx.strokeStyle = INK;
    for (let i = 0; i < 12; i++) { ctx.strokeRect(sx + 50 + i * 85, sy + 30, 76, 36); ctx.strokeRect(sx + 50 + i * 85, sy + 72, 76, 36); }
}

function drawBarrel(ctx, o) {
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU);
    ctx.fillStyle = o.kind === 'bollard' ? '#3a3f4c' : '#2f9e5a'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.6, 0, TAU);
    ctx.lineWidth = 3; ctx.strokeStyle = o.kind === 'bollard' ? '#c9a227' : '#1d6b3c'; ctx.stroke();
}

// Grues portiques au-dessus du quai (calque supérieur, semi-transparent)
function drawCranes(ctx) {
    for (const cx of [900, 2900]) {
        ctx.fillStyle = '#ffb02e';
        ctx.fillRect(cx - 20, 1880, 40, 440);
        ctx.fillRect(cx + 340, 1880, 40, 440);
        ctx.fillRect(cx - 40, 1860, 460, 50);
        ctx.lineWidth = 5; ctx.strokeStyle = INK;
        ctx.strokeRect(cx - 20, 1880, 40, 440);
        ctx.strokeRect(cx + 340, 1880, 40, 440);
        ctx.strokeRect(cx - 40, 1860, 460, 50);
        ctx.strokeStyle = 'rgba(11,20,48,0.6)';
        ctx.lineWidth = 3;
        for (let x = cx - 30; x < cx + 410; x += 40) { ctx.beginPath(); ctx.moveTo(x, 1862); ctx.lineTo(x + 20, 1908); ctx.stroke(); }
        // Câble et conteneur suspendu
        ctx.beginPath(); ctx.moveTo(cx + 180, 1910); ctx.lineTo(cx + 180, 2010); ctx.lineWidth = 3; ctx.strokeStyle = '#1d1d24'; ctx.stroke();
        ctx.fillStyle = '#2f7dff'; ctx.fillRect(cx + 120, 2010, 120, 50);
        ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeRect(cx + 120, 2010, 120, 50);
    }
}

export function buildDocksLayers(map) {
    const ground = document.createElement('canvas');
    ground.width = map.width;
    ground.height = map.height;
    const ctx = ground.getContext('2d');
    ctx.lineJoin = 'round';
    const rnd = rng(4242);
    ctx.fillStyle = '#1b2440';
    ctx.fillRect(0, 0, map.width, map.height);
    paintGround(ctx, map, rnd);
    // Sols des bases
    for (const z of map.zones) {
        if (z.kind !== 'spawn') continue;
        ctx.fillStyle = '#5d6270';
        ctx.fillRect(z.x, z.y, z.w, z.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3;
        for (let y = z.y; y < z.y + z.h; y += 30) { ctx.beginPath(); ctx.moveTo(z.x, y); ctx.lineTo(z.x + z.w, y); ctx.stroke(); }
    }
    paintRoad(ctx, map);
    drawCheckpoints(ctx, map);
    for (const o of map.rects) if (o.kind !== 'water' && o.kind !== 'border') shadow(ctx, o);
    for (const c of map.circles) shadow(ctx, c);
    for (const o of map.rects) {
        if (o.kind === 'water') drawWater(ctx, o, rnd);
        else if (o.kind === 'warehouse') drawWarehouse(ctx, o, rnd);
        else if (o.kind === 'container') drawContainer(ctx, o);
        else if (o.kind === 'wall') drawWall(ctx, o);
        else if (o.kind === 'border') drawWall(ctx, o, '#232c48', '#2f3a5c');
    }
    for (const c of map.circles) drawBarrel(ctx, c);
    const canopy = document.createElement('canvas');
    canopy.width = map.width;
    canopy.height = map.height;
    drawCranes(canopy.getContext('2d'));
    return { ground, canopy };
}

/** Décor animé : lampadaires, barrières des bases actives. */
export function drawDocksDecor(ctx, g, viewer, teamColor) {
    const t = g.time;
    for (const [i, l] of g.map.lanterns.entries()) {
        const f = 0.8 + 0.2 * Math.sin(t * 2.5 + i * 1.3);
        const gr = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 110);
        gr.addColorStop(0, `rgba(255, 200, 120, ${0.4 * f})`);
        gr.addColorStop(1, 'rgba(255, 200, 120, 0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(l.x, l.y, 110, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(l.x, l.y, 10, 0, TAU);
        ctx.fillStyle = '#fff4c8'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    }
    // Portes des bases en service (couleur de l'équipe qui y apparaît)
    for (const team of ['blue', 'red']) {
        const room = g.escort?.roomOf(team);
        if (!room) continue;
        const [ax, ay, bx, by] = room.door;
        const col = teamColor(team, viewer);
        const closed = g.phase === 'setup' && team === g.escort.attack;
        ctx.lineCap = 'round';
        ctx.lineWidth = closed ? 16 : 10;
        ctx.strokeStyle = closed ? col : col + '80';
        ctx.globalAlpha = closed ? 0.9 : 0.4 + 0.2 * Math.sin(t * 4);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        ctx.globalAlpha = 1;
    }
}
