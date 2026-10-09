/* ==================================
   HUD - FOR2D ROYAL
   Minimap, carte plein écran, nom du lieu, barres de vie, inventaire.
   ================================== */

import { B, BIOME_NAMES, OCEAN_DEEP, SEED, isWater } from './config.js?v=12';
import { nearestLake, distToRoads } from './world.js?v=12';
import { groundRGB, drawPlaza, drawField } from './draw.js?v=13';
import { fbm, valueNoise } from './noise.js';
import { SFX } from '../sfx.js';

const VEGETATION = new Set(['tree', 'bush', 'pine', 'palm']);
const MINIMAP_VIEW = 2000;          // unités de monde visibles sur la minimap
const GRID = 8;                     // quadrillage 8 x 8 de la grande carte
const LETTERS = 'ABCDEFGH';
const DARK = 'rgba(11, 29, 74, 0.9)';
const YELLOW = '#ffe03d';

// Fréquences de mise à jour (secondes) : inutile de tout refaire à chaque image
const MINIMAP_STEP = 1 / 20;        // minimap : 20 fois par seconde au plus
const FULLMAP_STEP = 1 / 30;        // carte plein écran : 30 fois par seconde (cercle qui pulse)
const LOCATION_STEP = 0.15;         // recherche du lieu survolé
const COORDS_STEP = 0.1;            // coordonnées affichées

// Corruption (zone qui rétrécit) sur les cartes
const CORRUPT_FILL = 'rgba(30, 0, 52, 0.72)';     // hors zone : violet sombre (comme la carte en jeu)
const CORRUPT_GLOW = 'rgba(176, 76, 255, 0.35)';  // halo autour du bord
const CORRUPT_EDGE = '#b04cff';                   // bord lumineux de la zone saine
const TAU = Math.PI * 2;

// La zone est-elle en cours (annoncée, en mouvement ou finale) ?
function zoneActive(z) {
    return !!(z && z.cur && z.state && z.state !== 'idle');
}

function drawEnemyDot(ctx, x, y, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius + 1.5, 0, TAU);
    ctx.fillStyle = '#0b1438';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fillStyle = '#ff3f52';
    ctx.fill();
    ctx.strokeStyle = '#ffb0b9';
    ctx.lineWidth = Math.max(1, radius * 0.22);
    ctx.stroke();
    ctx.restore();
}

/* ===================== IMAGE DE LA CARTE ===================== */

// Sol de la carte : couleurs des biomes + relief des montagnes + trait de côte net
function mapGround(world, RES) {
    const small = document.createElement('canvas');
    small.width = RES;
    small.height = RES;
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(RES, RES);
    const data = img.data;
    const stepX = world.width / RES;
    const stepY = world.height / RES;
    const N = RES * RES;
    const biomes = new Uint8Array(N);
    const height = new Float32Array(N);
    const terrainSeed = world.map?.terrainSeed ?? SEED;

    for (let py = 0; py < RES; py++) {
        const y = (py + 0.5) * stepY;
        for (let px = 0; px < RES; px++) {
            const x = (px + 0.5) * stepX;
            const i = py * RES + px;
            const s = world.sampleGround(x, y);
            biomes[i] = s.biome;
            groundRGB(data, i * 4, s, world.theme?.colors);
            // Altitude (bruit) : seulement là où l'on dessine du relief
            if (s.biome === B.MONTAGNE || s.biome === B.NEIGE) height[i] = fbm(x * 0.0022, y * 0.0022, terrainSeed + 11, 4);
        }
    }

    const scale = (i, f) => {
        data[i * 4] *= f;
        data[i * 4 + 1] *= f;
        data[i * 4 + 2] *= f;
    };
    const mix = (i, r, g, b, a) => {
        data[i * 4] += (r - data[i * 4]) * a;
        data[i * 4 + 1] += (g - data[i * 4 + 1]) * a;
        data[i * 4 + 2] += (b - data[i * 4 + 2]) * a;
    };

    for (let py = 1; py < RES - 1; py++) {
        for (let px = 1; px < RES - 1; px++) {
            const i = py * RES + px;
            const b = biomes[i];
            const water = isWater(b);

            // Relief : lumière venant du nord-ouest
            if (b === B.MONTAGNE || b === B.NEIGE) {
                const a = i - RES - 1;
                const c = i + RES + 1;
                const ha = biomes[a] === B.MONTAGNE || biomes[a] === B.NEIGE ? height[a] : height[i];
                const hc = biomes[c] === B.MONTAGNE || biomes[c] === B.NEIGE ? height[c] : height[i];
                const f = 1 + (ha - hc) * 7;
                scale(i, f < 0.72 ? 0.72 : f > 1.22 ? 1.22 : f);
            }

            // Côte : sable plus sombre côté terre, écume blanche côté eau
            const n = [biomes[i - 1], biomes[i + 1], biomes[i - RES], biomes[i + RES]];
            if (!water && n.some(isWater)) scale(i, 0.78);
            else if (water && n.some(v => !isWater(v))) mix(i, 255, 255, 255, 0.5);
        }
    }
    sctx.putImageData(img, 0, 0);
    return small;
}

// Petit massif montagneux (2 sommets) : repères sur la carte, comme une carte au trésor
function drawPeaks(ctx, x, y, s, snowy) {
    const peak = (cx, h, w) => {
        ctx.beginPath();
        ctx.moveTo(cx - w, y);
        ctx.lineTo(cx, y - h);
        ctx.lineTo(cx + w, y);
        ctx.closePath();
        ctx.fillStyle = snowy ? '#dfe7ef' : '#7b756b';
        ctx.fill();
        // Versant à l'ombre
        ctx.beginPath();
        ctx.moveTo(cx, y - h);
        ctx.lineTo(cx + w, y);
        ctx.lineTo(cx + w * 0.15, y);
        ctx.closePath();
        ctx.fillStyle = snowy ? 'rgba(120, 140, 165, 0.45)' : 'rgba(40, 34, 28, 0.35)';
        ctx.fill();
        // Neige au sommet
        if (!snowy) {
            ctx.beginPath();
            ctx.moveTo(cx - w * 0.32, y - h * 0.68);
            ctx.lineTo(cx, y - h);
            ctx.lineTo(cx + w * 0.32, y - h * 0.68);
            ctx.lineTo(cx + w * 0.1, y - h * 0.74);
            ctx.lineTo(cx - w * 0.08, y - h * 0.62);
            ctx.closePath();
            ctx.fillStyle = '#f4f7fb';
            ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(cx - w, y);
        ctx.lineTo(cx, y - h);
        ctx.lineTo(cx + w, y);
        ctx.strokeStyle = 'rgba(30, 26, 22, 0.75)';
        ctx.lineWidth = s * 0.09;
        ctx.lineJoin = 'round';
        ctx.stroke();
    };
    peak(x + s * 0.45, s * 0.8, s * 0.55);
    peak(x - s * 0.2, s, s * 0.7);
}

// Construit une fois pour toutes l'image de l'île entière (vue du dessus).
// Sert aussi de fond à la minimap.
export function buildMapImage(world, size = 1024) {
    const terrainSeed = world.map?.terrainSeed ?? SEED;
    // 1) Sol calculé en basse résolution, agrandi avec lissage
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(mapGround(world, 512), 0, 0, size, size);

    // Océan plus profond vers les bords
    const deep = ctx.createRadialGradient(size / 2, size / 2, size * 0.5, size / 2, size / 2, size * 0.74);
    deep.addColorStop(0, 'rgba(6, 24, 70, 0)');
    deep.addColorStop(1, 'rgba(6, 24, 70, 0.5)');
    ctx.fillStyle = deep;
    ctx.fillRect(0, 0, size, size);

    // 2) Détails dessinés en coordonnées monde
    const k = size / world.width;
    const px = 1 / k; // un pixel de la carte, en unités monde
    ctx.save();
    ctx.scale(k, k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Champs (cultures en rangées)
    for (const f of world.fields) drawField(ctx, f);

    // Chemins : bordure sombre, terre claire, pointillés au milieu
    const roadLine = (r) => {
        ctx.beginPath();
        ctx.moveTo(r.points[0], r.points[1]);
        for (let i = 2; i < r.points.length; i += 2) ctx.lineTo(r.points[i], r.points[i + 1]);
    };
    const roadLook = world.theme?.mapRoad || null;
    ctx.strokeStyle = roadLook?.edge || 'rgba(92, 62, 34, 0.9)';
    ctx.lineWidth = 9 * px;
    for (const r of world.roads) { roadLine(r); ctx.stroke(); }
    ctx.strokeStyle = roadLook?.fill || '#d9b47c';
    ctx.lineWidth = 6 * px;
    for (const r of world.roads) { roadLine(r); ctx.stroke(); }
    ctx.strokeStyle = roadLook?.dash || 'rgba(255, 246, 220, 0.75)';
    ctx.lineWidth = 1.2 * px;
    ctx.setLineDash([5 * px, 6 * px]);
    for (const r of world.roads) { roadLine(r); ctx.stroke(); }
    ctx.setLineDash([]);

    // Places des villes
    for (const town of world.towns) drawPlaza(ctx, town);

    // Cactus du désert : petits points verts cerclés
    for (const o of world.objects) {
        if (o.type !== 'cactus') continue;
        ctx.beginPath();
        ctx.arc(o.x, o.y, Math.max(o.r * 0.8, 1.3 * px), 0, TAU);
        ctx.fillStyle = o.base;
        ctx.fill();
        ctx.strokeStyle = o.dark;
        ctx.lineWidth = 0.7 * px;
        ctx.stroke();
    }

    // Rochers (seulement les très gros, plus petits : les autres faisaient des taches)
    for (const o of world.objects) {
        if (o.type !== 'rock' || o.r < 70) continue;
        const r = Math.max(o.r * 0.45, 1.4 * px);
        ctx.beginPath();
        ctx.arc(o.x, o.y, r, 0, TAU);
        ctx.fillStyle = o.base;
        ctx.fill();
        ctx.strokeStyle = o.dark;
        ctx.lineWidth = 0.8 * px;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(o.x - r * 0.3, o.y - r * 0.3, r * 0.35, 0, TAU);
        ctx.fillStyle = o.light;
        ctx.fill();
    }

    // Arbres : ombre, puis bord sombre, puis feuillage éclairé (les forêts forment des masses)
    const trees = world.objects.filter(o => VEGETATION.has(o.type) && o.type !== 'bush');
    const tr = o => Math.max(o.r * 0.72, 1.6 * px);
    ctx.fillStyle = 'rgba(8, 24, 12, 0.28)';
    for (const o of trees) {
        const r = tr(o);
        ctx.beginPath();
        ctx.arc(o.x + r * 0.3, o.y + r * 0.38, r, 0, TAU);
        ctx.fill();
    }
    for (const o of trees) {
        ctx.beginPath();
        ctx.arc(o.x, o.y, tr(o), 0, TAU);
        ctx.fillStyle = o.dark;
        ctx.fill();
    }
    for (const o of trees) {
        const r = tr(o);
        ctx.beginPath();
        ctx.arc(o.x - r * 0.12, o.y - r * 0.14, r * 0.78, 0, TAU);
        ctx.fillStyle = o.base;
        ctx.fill();
        // Reflet (sapins enneigés : neige sur le dessus)
        ctx.beginPath();
        ctx.arc(o.x - r * 0.3, o.y - r * 0.32, r * (o.snowy ? 0.42 : 0.3), 0, TAU);
        ctx.fillStyle = o.snowy ? '#f4f8fc' : o.light;
        ctx.fill();
    }

    // Bâtiments : ombre portée, toit à deux pans (ou plat), contour
    for (const b of world.buildings) {
        ctx.fillStyle = 'rgba(10, 18, 30, 0.35)';
        ctx.fillRect(b.x + 2.5 * px, b.y + 3 * px, b.w, b.h);
    }
    for (const b of world.buildings) {
        ctx.fillStyle = b.snow ? '#eef3f8' : b.roof;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        if (b.roofType === 'flat') {
            // Toit plat : rebord clair
            ctx.strokeStyle = b.roofLight;
            ctx.lineWidth = 2 * px;
            ctx.strokeRect(b.x + 2.5 * px, b.y + 2.5 * px, b.w - 5 * px, b.h - 5 * px);
        } else {
            // Deux pans : celui du haut / de gauche éclairé, faîtage au milieu
            const along = b.w >= b.h;
            ctx.fillStyle = b.snow ? '#ffffff' : b.roofLight;
            if (along) ctx.fillRect(b.x, b.y, b.w, b.h / 2);
            else ctx.fillRect(b.x, b.y, b.w / 2, b.h);
            ctx.beginPath();
            if (along) { ctx.moveTo(b.x, b.y + b.h / 2); ctx.lineTo(b.x + b.w, b.y + b.h / 2); }
            else { ctx.moveTo(b.x + b.w / 2, b.y); ctx.lineTo(b.x + b.w / 2, b.y + b.h); }
            ctx.strokeStyle = b.roofDark;
            ctx.lineWidth = 1.2 * px;
            ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(11, 20, 40, 0.85)';
        ctx.lineWidth = 1.3 * px;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
    }

    // Couvertures (carte Gun Game) : conteneurs colorés, caisses, barrières
    for (const o of world.objects) {
        if (!o.cover) continue;
        const x0 = o.x - o.w / 2;
        const y0 = o.y - o.h / 2;
        ctx.fillStyle = 'rgba(10, 18, 30, 0.3)';
        ctx.fillRect(x0 + 1.5 * px, y0 + 2 * px, o.w, o.h);
        ctx.fillStyle = o.type === 'barrier' ? '#d6dbe0' : o.base;
        ctx.fillRect(x0, y0, o.w, o.h);
        ctx.strokeStyle = 'rgba(11, 20, 40, 0.75)';
        ctx.lineWidth = 0.9 * px;
        ctx.strokeRect(x0, y0, o.w, o.h);
    }

    // Fontaine, puits
    for (const o of world.objects) {
        if (o.type !== 'fountain' && o.type !== 'well') continue;
        const r = Math.max(o.r * (o.type === 'fountain' ? 0.9 : 1.1), 3 * px);
        ctx.beginPath();
        ctx.arc(o.x, o.y, r, 0, TAU);
        ctx.fillStyle = '#d8dde4';
        ctx.fill();
        ctx.strokeStyle = 'rgba(11, 20, 40, 0.8)';
        ctx.lineWidth = 1 * px;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(o.x, o.y, r * 0.65, 0, TAU);
        ctx.fillStyle = '#4fb3f0';
        ctx.fill();
    }

    // Massifs dessinés dans les montagnes (grille régulière, loin des villes et chemins)
    const cell = 420;
    for (let gy = cell / 2; gy < world.height; gy += cell) {
        for (let gx = cell / 2; gx < world.width; gx += cell) {
            const j = valueNoise(gx * 0.01, gy * 0.01, terrainSeed + 21);
            const x = gx + (j - 0.5) * cell * 0.6;
            const y = gy + (valueNoise(gx * 0.01, gy * 0.01, terrainSeed + 22) - 0.5) * cell * 0.6;
            const bio = world.sampleGround(x, y).biome;
            if (bio !== B.MONTAGNE && bio !== B.NEIGE) continue;
            if (world.towns.some(t => Math.hypot(x - t.x, y - t.y) < t.radius + 60)) continue;
            if (world.roadGrid && distToRoads(world, x, y, 160) < 130) continue;
            drawPeaks(ctx, x, y, (12 + j * 5) * px, bio === B.NEIGE);
        }
    }

    ctx.restore();
    return canvas;
}

/* ===================== OUTILS DE DESSIN ===================== */

// Flèche du joueur, pointe dans la direction "angle"
function drawArrow(ctx, x, y, angle, size, color = YELLOW) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.65);
    ctx.lineTo(-size * 0.35, 0);
    ctx.lineTo(-size * 0.7, -size * 0.65);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.strokeStyle = DARK;
    ctx.lineWidth = Math.max(1.5, size * 0.18);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fill();
    ctx.restore();
}

// Texte blanc avec contour sombre
function outlinedText(ctx, text, x, y, px, font = '"Bebas Neue", Impact, sans-serif') {
    ctx.font = `${Math.round(px)}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, px * 0.2);
    ctx.strokeStyle = DARK;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x, y);
}

/* ===================== HUD ===================== */

export class Hud {
    constructor(world, player, fighters = [], options = {}) {
        this.world = world;
        this.player = player;
        this.fighters = fighters;
        this.showEnemyDots = options.showEnemyDots === true;
        this.mapImage = buildMapImage(world, 1024); // une seule fois (jamais reconstruite)
        this.mapOpen = false;
        this.slot = 0;
        this.dpr = 1;
        this.time = 0;

        const $ = id => document.getElementById(id);
        this.el = {
            location: $('hudLocation'),
            coords: $('hudCoords'),
            name: $('hudName'),
            minimapBtn: $('minimapBtn'),
            fullMap: $('fullMap'),
            fullMapClose: $('fullMapClose'),
            fullscreenBtn: $('fullscreenBtn'),
            shieldFill: $('shieldFill'),
            shieldText: $('shieldText'),
            healthFill: $('healthFill'),
            healthText: $('healthText')
        };
        this.el.locName = this.el.location.querySelector('.loc-name');
        this.el.locBiome = this.el.location.querySelector('.loc-biome');
        this.el.shieldBar = this.el.shieldFill.parentElement;
        this.el.healthBar = this.el.healthFill.parentElement;
        this.slots = [...document.querySelectorAll('#hotbar .slot')];

        this.minimap = $('minimap');
        this.mctx = this.minimap.getContext('2d');
        this.fullCanvas = $('fullMapCanvas');
        this.fctx = this.fullCanvas.getContext('2d');

        // Couches statiques pré-rendues (reconstruites seulement si la taille change)
        this._mmBase = null;       // carte + noms des villes à l'échelle de la minimap
        this._mmScale = 1;         // pixels de minimap par unité de monde
        this._mmKey = '';          // état du dernier dessin (on ne redessine pas si rien n'a bougé)
        this._fullBase = null;     // carte + quadrillage + noms, à la taille de la grande carte
        this._fullCss = 0;

        // Accumulateurs de temps (valeur de départ = dessin dès la première image)
        this._mmT = MINIMAP_STEP;
        this._fullT = FULLMAP_STEP;
        this._locT = LOCATION_STEP;
        this._coordsT = COORDS_STEP;

        // Valeurs affichées (pour ne toucher au DOM que si ça change)
        this._locKey = '';
        this._locPop = '';
        this._coords = '';
        this._health = -1;
        this._shield = -1;
        this._inShip = null;
        this._corrupt = false;     // barre de vie en violet (joueur dans la corruption)

        // Corruption : donnée par main.js via setZone() (tout marche sans)
        this.zone = null;

        this.el.name.textContent = player.name || 'Joueur';

        // ----- Événements -----
        this.el.minimapBtn.addEventListener('click', () => this.toggleMap(true));
        this.el.fullMapClose.addEventListener('click', () => this.toggleMap(false));
        this.el.fullMap.addEventListener('click', e => {
            if (e.target === this.el.fullMap) this.toggleMap(false);
        });
        window.addEventListener('keydown', e => {
            if (e.key === 'Escape' && this.mapOpen) this.toggleMap(false);
        });
        this.el.fullscreenBtn.addEventListener('click', () => {
            // js/mobile-screen.js gère aussi Safari (préfixe webkit) et l'orientation paysage
            if (window.FOR2D_SCREEN) window.FOR2D_SCREEN.toggleFullscreen();
            else if (document.fullscreenElement) document.exitFullscreen?.();
            else document.documentElement.requestFullscreen?.().catch(() => {});
        });
        this.slots.forEach((btn, i) => btn.addEventListener('click', () => this.selectSlot(i)));
        // Les raccourcis ne s'affichent plus d'eux-mêmes : bouton « ? » (voir main.js)

        this.resize();
    }

    setSupplyDrops(supplyDrops) {
        this.supplyDrops = supplyDrops || null;
        this._mmKey = '';
    }

    // Appelé au démarrage et quand la fenêtre change de taille (lectures de layout ici seulement)
    resize() {
        // Le HUD est agrandi (zoom CSS --hud-zoom) : la minimap est dessinée à sa taille réelle
        // à l'écran, et les textes / flèches suivent le même agrandissement
        const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-zoom')) || 1;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.dpr = dpr * zoom;
        const rect = this.minimap.getBoundingClientRect();
        const w = Math.round((rect.width || 150 * zoom) * dpr);
        const h = Math.round((rect.height || rect.width || 150 * zoom) * dpr);
        // Changer width/height vide et réalloue le canvas : seulement si nécessaire
        if (w !== this.minimap.width || h !== this.minimap.height || !this._mmBase) {
            this.minimap.width = w;
            this.minimap.height = h;
            this.buildMinimapBase();
        }
        this._mmKey = '';
        this._mmT = MINIMAP_STEP;

        if (this.mapOpen) this.resizeFullMap();
        this.syncLocationLayout();
    }

    syncLocationLayout() {
        const height = this.el.location?.getBoundingClientRect().height || 0;
        document.documentElement.style.setProperty('--hud-location-height', `${Math.ceil(height)}px`);
    }

    resizeFullMap() {
        const css = Math.floor(Math.min(window.innerWidth, window.innerHeight) * 0.9);
        if (css !== this._fullCss) {
            this._fullCss = css;
            this.fullCanvas.style.width = `${css}px`;
            this.fullCanvas.style.height = `${css}px`;
        }
        const size = Math.max(1, Math.round(css * this.dpr));
        if (size !== this.fullCanvas.width || !this._fullBase || this._fullBase.width !== size) {
            this.fullCanvas.width = size;
            this.fullCanvas.height = size;
            this.buildFullBase(size);
        }
        this._fullT = FULLMAP_STEP;
    }

    toggleMap(force) {
        const was = this.mapOpen;
        this.mapOpen = typeof force === 'boolean' ? force : !this.mapOpen;
        if (this.mapOpen === was) return; // rien à faire si l'état ne change pas
        SFX.play('map', { open: this.mapOpen });
        this.el.fullMap.hidden = !this.mapOpen;
        // Tous les messages flottants passent sous la carte tant qu'elle est ouverte (game.css)
        document.body.classList.toggle('map-open', this.mapOpen);
        if (this.mapOpen) {
            this.resizeFullMap();
            this.drawFullMap(this.time); // tout de suite : pas d'image vide à l'ouverture
            this._fullT = 0;
        } else {
            this._mmKey = ''; // la minimap n'était plus mise à jour sous la carte
            this._mmT = MINIMAP_STEP;
        }
    }

    selectSlot(i) {
        if (i < 0 || i >= this.slots.length) return;
        this.slot = i;
        this.slots.forEach((btn, j) => {
            btn.classList.toggle('active', j === i);
            btn.setAttribute('aria-pressed', j === i ? 'true' : 'false');
        });
    }

    // Zone de corruption (lecture seule) : dessinée sur la minimap et la grande carte
    setZone(zone) {
        this.zone = zone || null;
        this._mmKey = '';
        this._mmT = MINIMAP_STEP;
    }

    // Le joueur est-il en train de se corrompre (hors de la zone saine) ?
    isCorrupted() {
        const z = this.zone;
        const p = this.player;
        return zoneActive(z) && p.alive && p.phase !== 'ship' && !z.isSafe(p.x, p.y);
    }

    // Corruption hors de la zone saine + bord lumineux + prochaine zone en pointillés.
    // ctx en coordonnées monde, k = pixels par unité, (x0, y0, w, h) = rectangle monde à couvrir.
    // Un seul chemin rectangle + cercle rempli en "evenodd" : le cercle reste troué.
    drawZone(ctx, k, x0, y0, w, h) {
        const z = this.zone;
        if (!zoneActive(z)) return;
        const cur = z.cur;
        const px = this.dpr / k; // un pixel CSS en unités monde
        const hasCur = cur.r > 0;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, y0, w, h);
        if (hasCur) {
            ctx.moveTo(cur.x + cur.r, cur.y); // sinon arc() relierait le coin du rectangle au cercle
            ctx.arc(cur.x, cur.y, cur.r, 0, TAU);
        }
        ctx.fillStyle = CORRUPT_FILL;
        ctx.fill('evenodd');

        if (hasCur) {
            ctx.beginPath();
            ctx.arc(cur.x, cur.y, cur.r, 0, TAU);
            ctx.lineWidth = 5 * px;
            ctx.strokeStyle = CORRUPT_GLOW;
            ctx.stroke();
            ctx.lineWidth = 2 * px;
            ctx.strokeStyle = CORRUPT_EDGE;
            ctx.stroke();
        }

        // Prochaine zone : cercle blanc pointillé
        const nx = z.next;
        if (nx && z.state !== 'done') {
            ctx.beginPath();
            // Dernière zone (rayon 0) : petit point de fermeture au lieu d'un cercle
            ctx.arc(nx.x, nx.y, nx.r > 0 ? nx.r : 4 * px, 0, TAU);
            ctx.setLineDash(nx.r > 0 ? [7 * px, 5 * px] : []);
            ctx.lineWidth = 1.6 * px;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    // Joueur hors zone : trait pointillé vers le bord de la zone saine + chevron
    // (comme Fortnite). maxLen = distance (monde) max du chevron depuis le joueur.
    drawSafeGuide(ctx, k, maxLen) {
        if (!this.isCorrupted()) return;
        const cur = this.zone.cur;
        const p = this.player;
        const dx = cur.x - p.x;
        const dy = cur.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 1) return;
        const ux = dx / d;
        const uy = dy / d;
        const depth = Math.max(0, d - Math.max(0, cur.r));
        const px = this.dpr / k;
        const start = 12 * px; // on part du bord de la flèche du joueur
        if (depth <= start) return;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x + ux * start, p.y + uy * start);
        ctx.lineTo(p.x + ux * depth, p.y + uy * depth);
        ctx.setLineDash([5 * px, 4 * px]);
        ctx.lineWidth = 4 * px;
        ctx.strokeStyle = 'rgba(38, 0, 66, 0.85)';
        ctx.stroke();
        ctx.lineWidth = 2 * px;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.setLineDash([]);

        // Chevron qui pointe vers la zone saine
        const a = Math.max(start + 8 * px, Math.min(depth, maxLen));
        const cx = p.x + ux * a;
        const cy = p.y + uy * a;
        const s = 6 * px;
        ctx.beginPath();
        ctx.moveTo(cx + ux * s, cy + uy * s);
        ctx.lineTo(cx - ux * s - uy * s, cy - uy * s + ux * s);
        ctx.lineTo(cx - ux * s * 0.4, cy - uy * s * 0.4);
        ctx.lineTo(cx - ux * s + uy * s, cy - uy * s - ux * s);
        ctx.closePath();
        ctx.fillStyle = CORRUPT_EDGE;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5 * px;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.fill();
        ctx.restore();
    }

    // Trajet du vaisseau (affiché sur les cartes) + message "ESPACE pour sauter"
    setFlight(drop) {
        this.drop = drop;
        this.el.dropPrompt = document.getElementById('dropPrompt');
        this.el.dropText = this.el.dropPrompt.querySelector('.drop-text');
        this.el.dropTimer = this.el.dropPrompt.querySelector('.drop-timer');
        this._dropMsg = '';
        this._inShip = null;
    }

    updateDropPrompt() {
        const d = this.drop;
        if (!d) return;
        // 1V1 : pas de saut libre, le compte à rebours central remplace ce message
        const inShip = this.player.phase === 'ship' && !d.duelMode;
        if (inShip !== this._inShip) {
            this._inShip = inShip;
            this.el.dropPrompt.hidden = !inShip;
        }
        if (!inShip) return;

        // Au doigt : pas de touche ESPACE, on renvoie vers le bouton SAUTER (css : .touch-ui)
        const touch = document.documentElement.classList.contains('touch-ui');
        const msg = d.dist >= d.enterAt
            ? `${touch ? 'Touche SAUTER pour sauter' : 'pour sauter'}|Saut auto dans ${Math.max(0, Math.floor(d.timeLeft))} s`
            : `Arrivée au-dessus de l'île...|`;
        if (msg === this._dropMsg) return;
        this._dropMsg = msg;
        const [text, timer] = msg.split('|');
        this.el.dropText.textContent = text;
        this.el.dropTimer.textContent = timer;
        this.el.dropPrompt.classList.toggle('waiting', !d.canJump);
    }

    // Ligne pointillée du trajet (ctx déjà en coordonnées monde, k = pixels par unité)
    // Simple tracé vectoriel (2 traits) : le trajet sort largement de l'île, un canvas statique
    // qui le contiendrait coûterait plus de mémoire que ce tracé ne coûte de temps.
    drawFlightPath(ctx, k) {
        const d = this.drop;
        if (!d || !d.ship.active) return;
        if (d.duelMode) {
            // 1V1 : pas de trajet, un repère rouge sur chaque bus en panne
            for (const s of d.ships) {
                if (!s.active) continue;
                ctx.beginPath();
                ctx.arc(s.x, s.y, 13 / k, 0, TAU);
                ctx.fillStyle = '#ff334b';
                ctx.fill();
                ctx.lineWidth = 3 / k;
                ctx.strokeStyle = '#ffffff';
                ctx.stroke();
            }
            return;
        }
        const { ax, ay, bx, by } = d.path;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.setLineDash([22 / k, 16 / k]);
        // Pointillés accrochés au trajet (sinon ils "glissent" avec le vaisseau)
        ctx.lineDashOffset = d.dist || 0;
        ctx.lineWidth = 7 / k;
        ctx.strokeStyle = 'rgba(11, 29, 74, 0.6)';
        ctx.beginPath();
        ctx.moveTo(d.ship.x, d.ship.y);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.lineWidth = 4 / k;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.setLineDash([]);
        // Départ
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ax, ay, 8 / k, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Vaisseau : flèche blanche sur le trajet (si le joueur a déjà sauté)
        if (this.player.phase !== 'ship') {
            drawArrow(ctx, d.ship.x, d.ship.y, d.angle, 12 / k, '#ffffff');
        }
    }

    update(dt, time) {
        this.time = time || 0;
        this.updateDropPrompt();

        this._locT += dt;
        if (this._locT >= LOCATION_STEP) {
            this._locT = 0;
            this.updateLocation();
        }

        this._coordsT += dt;
        if (this._coordsT >= COORDS_STEP) {
            this._coordsT = 0;
            this.updateCoords();
        }

        if (this.mapOpen) {
            // La minimap est cachée sous la carte : seule la grande carte est redessinée
            this._fullT += dt;
            if (this._fullT >= FULLMAP_STEP) {
                this._fullT = 0;
                this.drawFullMap(this.time);
            }
        } else {
            this._mmT += dt;
            if (this._mmT >= MINIMAP_STEP) {
                this._mmT = 0;
                this.drawMinimap();
            }
        }

        this.updateBars();
    }

    /* ----- Nom du lieu ----- */
    updateLocation() {
        const p = this.player;
        // En vol, le joueur ne met pas son biome à jour : on regarde ce qu'on survole
        if (p.phase !== 'ground') p.biome = this.world.sampleGround(p.x, p.y).biome;
        let name;
        let sub;
        const names = this.world.theme?.biomeNames || BIOME_NAMES;
        const town = this.world.towns.find(t => Math.hypot(p.x - t.x, p.y - t.y) < t.radius);
        if (town) {
            name = town.name;
            sub = names[town.biome] || '';
        } else if (p.biome === B.LAC) {
            name = nearestLake(this.world, p.x, p.y).name;
            sub = names[B.LAC];
        } else {
            name = names[p.biome] || '';
            sub = '';
        }

        const key = `${name}|${sub}`;
        if (key === this._locKey) return;
        this._locKey = key;
        this.el.locName.textContent = name;
        this.el.locBiome.textContent = sub;
        this.syncLocationLayout();
        // Relance l'animation d'apparition en alternant 2 classes aux animations identiques
        // (pas de lecture de offsetWidth qui forcerait un recalcul de la mise en page)
        const loc = this.el.location;
        const next = this._locPop === 'pop' ? 'pop-b' : 'pop';
        if (this._locPop) loc.classList.remove(this._locPop);
        loc.classList.add(next);
        this._locPop = next;
    }

    updateCoords() {
        const txt = `X ${Math.round(this.player.x)} · Y ${Math.round(this.player.y)}`;
        if (txt !== this._coords) {
            this._coords = txt;
            this.el.coords.textContent = txt;
        }
    }

    /* ----- Minimap ----- */

    // Couche statique : l'île à l'échelle exacte de la minimap + noms des villes.
    // Ensuite, chaque dessin n'est qu'une copie 1:1 d'un rectangle (aucune mise à l'échelle).
    buildMinimapBase() {
        const k = this.minimap.width / MINIMAP_VIEW;
        const size = Math.max(1, Math.round(this.world.width * k));
        const c = this._mmBase || document.createElement('canvas');
        c.width = size;
        c.height = size;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.mapImage, 0, 0, size, size);
        const ks = size / this.world.width;
        for (const t of this.world.towns) {
            outlinedText(ctx, t.name.toUpperCase(), t.x * ks, t.y * ks, 13 * this.dpr);
        }
        this._mmBase = c;
        this._mmScale = ks;
    }

    /* ----- Repères de ravitaillement (minimap et grande carte) -----
       Épingle orange ancrée sur le point d'atterrissage : parachute pendant la descente
       (avec anneau de progression), caisse une fois livrée. Le corps de l'épingle est
       peint une fois par taille dans un petit canvas, le reste (ondes, anneau) à chaque image. */

    supplySprite(kind, state, s) {
        const key = `${kind}|${state}|${Math.round(s * 20)}`;
        this._supplySprites = this._supplySprites || new Map();
        let c = this._supplySprites.get(key);
        if (c) return c;

        const R = 11 * s;          // rayon de la tête
        const tail = 10 * s;       // pointe sous la tête (épingle seulement)
        const pad = 3 * s;
        const pin = kind === 'pin';
        c = document.createElement('canvas');
        c.width = Math.ceil((R + pad) * 2);
        c.height = Math.ceil(pin ? R * 2 + tail + pad * 2 : (R + pad) * 2);
        const ctx = c.getContext('2d');
        const cx = c.width / 2;
        const cy = pad + R;
        c.headY = cy;              // centre de la tête dans le sprite
        c.tipY = pin ? cy + R + tail : cy;

        // Silhouette : disque, prolongé d'une pointe pour l'épingle
        const shape = () => {
            ctx.beginPath();
            if (pin) {
                const a = 0.62;
                ctx.arc(cx, cy, R, Math.PI / 2 + a, Math.PI / 2 - a);
                ctx.lineTo(cx, c.tipY - 0.5 * s);
            } else {
                ctx.arc(cx, cy, R, 0, TAU);
            }
            ctx.closePath();
        };
        const grad = ctx.createLinearGradient(0, cy - R, 0, c.tipY);
        grad.addColorStop(0, '#ffc54d');
        grad.addColorStop(0.55, '#ff8a1f');
        grad.addColorStop(1, '#e8550f');
        shape();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2 * s;
        ctx.strokeStyle = '#0b1438';
        ctx.stroke();
        // Reflet en haut de la tête
        ctx.beginPath();
        ctx.arc(cx, cy, R - 2.6 * s, Math.PI * 1.18, Math.PI * 1.82);
        ctx.lineWidth = 1.4 * s;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.stroke();

        // Pictogramme blanc
        ctx.save();
        ctx.translate(cx, cy);
        const g = s;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ffffff';
        if (state === 'falling') {
            // Voile festonnée
            ctx.beginPath();
            ctx.moveTo(-7 * g, -1 * g);
            ctx.bezierCurveTo(-7 * g, -7.6 * g, 7 * g, -7.6 * g, 7 * g, -1 * g);
            ctx.quadraticCurveTo(4.7 * g, -2.9 * g, 2.35 * g, -1 * g);
            ctx.quadraticCurveTo(0, -2.9 * g, -2.35 * g, -1 * g);
            ctx.quadraticCurveTo(-4.7 * g, -2.9 * g, -7 * g, -1 * g);
            ctx.closePath();
            ctx.fill();
            // Suspentes
            ctx.lineWidth = 1.1 * g;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-6.4 * g, -0.6 * g); ctx.lineTo(-2.4 * g, 3 * g);
            ctx.moveTo(6.4 * g, -0.6 * g); ctx.lineTo(2.4 * g, 3 * g);
            ctx.moveTo(0, -1.6 * g); ctx.lineTo(0, 3 * g);
            ctx.stroke();
            // Caisse
            ctx.beginPath();
            ctx.roundRect(-3.4 * g, 2.8 * g, 6.8 * g, 5 * g, 1 * g);
            ctx.fill();
            ctx.fillStyle = '#0b1438';
            ctx.fillRect(-0.6 * g, 2.8 * g, 1.2 * g, 5 * g);
        } else {
            // Caisse avec sangles en croix
            ctx.beginPath();
            ctx.roundRect(-6.2 * g, -5.2 * g, 12.4 * g, 10.4 * g, 1.8 * g);
            ctx.fill();
            ctx.fillStyle = '#0b1438';
            ctx.fillRect(-6.2 * g, -1 * g, 12.4 * g, 2 * g);
            ctx.fillRect(-1 * g, -5.2 * g, 2 * g, 10.4 * g);
            ctx.beginPath();
            ctx.arc(0, 0, 2.1 * g, 0, TAU);
            ctx.fillStyle = '#ffb21f';
            ctx.fill();
        }
        ctx.restore();

        this._supplySprites.set(key, c);
        return c;
    }

    // Anneau de progression autour de la tête (descente : 0 -> 1)
    drawSupplyProgress(ctx, cx, cy, s, prog) {
        const r = 13.4 * s;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.lineWidth = 3 * s;
        ctx.strokeStyle = 'rgba(11, 20, 56, 0.8)';
        ctx.stroke();
        if (prog <= 0) return;
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, prog));
        ctx.lineWidth = 2 * s;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.lineCap = 'butt';
    }

    // Épingle posée sur le point d'atterrissage (x, y)
    drawSupplyMarker(ctx, x, y, scale, d, time) {
        const s = scale * (this.dpr || 1);
        const falling = d.state === 'falling';
        ctx.save();
        ctx.translate(x, y);

        // Point d'impact : onde qui se resserre (descente) ou qui s'élargit (livré)
        if (falling) {
            for (let i = 0; i < 2; i++) {
                const ph = (time * 0.9 + i * 0.5) % 1;
                ctx.beginPath();
                ctx.arc(0, 0, (22 - ph * 15) * s, 0, TAU);
                ctx.lineWidth = 1.8 * s;
                ctx.strokeStyle = `rgba(255, 170, 60, ${(Math.sin(ph * Math.PI) * 0.85).toFixed(3)})`;
                ctx.stroke();
            }
        } else {
            const ph = (time * 0.8) % 1;
            ctx.beginPath();
            ctx.arc(0, 0, (6 + ph * 18) * s, 0, TAU);
            ctx.lineWidth = 2.2 * s;
            ctx.strokeStyle = `rgba(255, 178, 31, ${((1 - ph) * 0.85).toFixed(3)})`;
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.ellipse(0, 0, 5.5 * s, 2.4 * s, 0, 0, TAU);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fill();

        // Épingle (petit rebond une fois livrée)
        const spr = this.supplySprite('pin', d.state, s);
        const bob = falling ? 0 : -Math.abs(Math.sin(time * 3.2)) * 2.2 * s;
        const sx = -spr.width / 2;
        const sy = -spr.tipY + bob;
        if (falling) this.drawSupplyProgress(ctx, 0, sy + spr.headY, s, this.supplyDrops?.progress?.(d) ?? 0);
        ctx.drawImage(spr, sx, sy);
        ctx.restore();
    }

    // Hors du champ de la minimap : pastille au bord + chevron vers le largage
    drawSupplyEdge(ctx, x, y, angle, scale, d, time) {
        const s = scale * (this.dpr || 1);
        const falling = d.state === 'falling';
        const spr = this.supplySprite('disc', d.state, s);
        ctx.save();
        ctx.translate(x, y);
        // Chevron (pulse doucement vers l'extérieur)
        const push = (15 + Math.sin(time * 5) * 1.2) * s;
        ctx.save();
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(push + 6 * s, 0);
        ctx.lineTo(push, -5 * s);
        ctx.lineTo(push, 5 * s);
        ctx.closePath();
        ctx.fillStyle = '#ffb21f';
        ctx.fill();
        ctx.lineWidth = 1.4 * s;
        ctx.strokeStyle = '#0b1438';
        ctx.stroke();
        ctx.restore();
        if (falling) this.drawSupplyProgress(ctx, 0, 0, s, this.supplyDrops?.progress?.(d) ?? 0);
        ctx.drawImage(spr, -spr.width / 2, -spr.headY);
        ctx.restore();
    }

    // Étiquette sous l'épingle de la grande carte (compte à rebours ou « LIVRÉ »)
    drawSupplyLabel(ctx, x, y, text, s) {
        const px = 11 * s;
        ctx.font = `${Math.round(px)}px "Bebas Neue", Impact, sans-serif`;
        const w = ctx.measureText(text).width + px;
        const h = px * 1.35;
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y, w, h, h / 2);
        ctx.fillStyle = 'rgba(8, 20, 56, 0.92)';
        ctx.fill();
        ctx.lineWidth = 1.2 * s;
        ctx.strokeStyle = '#ffb21f';
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y + h / 2 + 0.6 * s);
    }

    drawMinimap() {
        const base = this._mmBase;
        if (!base) return;
        const w = this.minimap.width;
        const h = this.minimap.height;
        const p = this.player;
        const d = this.drop;
        const k = this._mmScale;

        // Coin haut-gauche de la vue dans la couche statique (arrondi au pixel : copie nette)
        const sx = Math.round(p.x * k - w / 2);
        const sy = Math.round(p.y * k - h / 2);
        const ship = d && d.ship.active ? `${Math.round(d.ship.x * k)},${Math.round(d.ship.y * k)}` : '-';
        // Corruption : centre / rayon arrondis au pixel de minimap (redessin quand elle avance)
        const z = this.zone;
        const zoneOn = zoneActive(z);
        let zk = '-';
        if (zoneOn) {
            const c = z.cur;
            const n = z.next;
            zk = `${z.state},${Math.round(c.x * k)},${Math.round(c.y * k)},${Math.round(c.r * k)}`;
            if (n) zk += `,${Math.round(n.x * k)},${Math.round(n.y * k)},${Math.round(n.r * k)}`;
        }
        const mateKey = this.fighters ? this.fighters.filter(f => f !== p && f.alive && f.team === p.team).map(f => `${Math.round(f.x * k)},${Math.round(f.y * k)},${f.dbno ? 1 : 0}`).join(';') : '';
        const enemyKey = this.showEnemyDots && this.fighters
            ? this.fighters.filter(f => f !== p && f.alive && f.phase !== 'ship')
                .map(f => `${Math.round(f.x * k)},${Math.round(f.y * k)},${f.dbno ? 1 : 0}`).join(';')
            : '';
        // Ravitaillements animés (ondes, anneau de progression) : ~12 images par seconde
        const supplyKey = this.supplyDrops?.activeDrops?.().map(d => `${d.id},${d.state},${Math.floor(d.age * 12)}`).join(';') || '';
        const key = `${sx},${sy},${Math.round((p.angle || 0) * 20)},${p.phase},${p.alive ? 1 : 0},${ship},${zk},${supplyKey},${mateKey},${enemyKey}`;
        if (key === this._mmKey) return; // rien n'a bougé à l'échelle de la minimap
        this._mmKey = key;

        const ctx = this.mctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Partie visible de la couche statique
        const x0 = Math.max(0, sx);
        const y0 = Math.max(0, sy);
        const x1 = Math.min(base.width, sx + w);
        const y1 = Math.min(base.height, sy + h);
        // Océan autour de l'île, seulement si le bord du monde est dans la vue
        if (x0 > sx || y0 > sy || x1 < sx + w || y1 < sy + h) {
            ctx.fillStyle = this.world.theme?.oceanDeep || OCEAN_DEEP;
            ctx.fillRect(0, 0, w, h);
        }
        if (x1 > x0 && y1 > y0) {
            ctx.drawImage(base, x0, y0, x1 - x0, y1 - y0, x0 - sx, y0 - sy, x1 - x0, y1 - y0);
        }

        // Corruption puis trajet du vaisseau (coordonnées monde)
        const shipOn = d && d.ship.active;
        if (zoneOn || shipOn) {
            ctx.setTransform(k, 0, 0, k, -sx, -sy);
            if (zoneOn) {
                this.drawZone(ctx, k, sx / k, sy / k, w / k, h / k);
                // Chevron gardé à l'intérieur de la minimap (le joueur est au centre)
                this.drawSafeGuide(ctx, k, (Math.min(w, h) / 2 - 12 * this.dpr) / k);
            }
            if (shipOn) this.drawFlightPath(ctx, k);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }

        // Ravitaillements : épingle sur la minimap, ou pastille au bord avec un chevron vers le largage
        const drops = this.supplyDrops?.activeDrops?.() || [];
        if (drops.length) {
            const dpr = this.dpr;
            const side = 13 * dpr;  // demi-largeur de l'épingle
            const top = 34 * dpr;   // hauteur de l'épingle au-dessus du point
            const inset = 22 * dpr; // pastille + chevron gardés dans la minimap
            for (const d of drops) {
                const mx = d.x * k - sx;
                const my = d.y * k - sy;
                if (mx >= side && mx <= w - side && my >= top && my <= h - 6 * dpr) {
                    this.drawSupplyMarker(ctx, mx, my, 0.9, d, this.time);
                    continue;
                }
                const cx = w / 2;
                const cy = h / 2;
                const ang = Math.atan2(my - cy, mx - cx);
                const cos = Math.cos(ang);
                const sin = Math.sin(ang);
                const f = Math.min(Math.abs((w / 2 - inset) / (cos || 1e-5)), Math.abs((h / 2 - inset) / (sin || 1e-5)));
                this.drawSupplyEdge(ctx, cx + cos * f, cy + sin * f, ang, 0.8, d, this.time);
            }
        }

        // Dessiner les coéquipiers sur la minimap
        if (this.fighters) {
            const SQUAD_COLORS = { 1: '#00e5ff', 2: '#ffd21e', 3: '#ff4fd8', 4: '#00ff88' };
            for (const f of this.fighters) {
                if (f === p || !f.alive || f.team !== p.team) continue;
                const fx = f.x * k - sx;
                const fy = f.y * k - sy;
                if (fx >= -20 && fx <= w + 20 && fy >= -20 && fy <= h + 20) {
                    const teamCol = SQUAD_COLORS[f.squadSlot || 2] || '#ffd21e';
                    const col = f.dbno ? '#ff334b' : teamCol;
                    drawArrow(ctx, fx, fy, f.angle || 0, 7.5 * this.dpr, col);
                }
            }
        }

        // Gun Game : positions adverses visibles comme de petits points rouges
        if (this.showEnemyDots && this.fighters) {
            for (const f of this.fighters) {
                if (f === p || !f.alive || f.phase === 'ship') continue;
                const fx = f.x * k - sx;
                const fy = f.y * k - sy;
                if (fx >= -12 && fx <= w + 12 && fy >= -12 && fy <= h + 12) {
                    drawEnemyDot(ctx, fx, fy, 4.5 * this.dpr);
                }
            }
        }

        drawArrow(ctx, p.x * k - sx, p.y * k - sy, p.angle || 0, 9 * this.dpr);
    }

    /* ----- Carte plein écran ----- */

    // Couche statique : île, quadrillage, lettres/chiffres, villes et lacs
    buildFullBase(size) {
        const c = this._fullBase || document.createElement('canvas');
        c.width = size;
        c.height = size;
        const ctx = c.getContext('2d');
        const k = size / this.world.width;
        const dpr = this.dpr;

        ctx.fillStyle = this.world.theme?.oceanDeep || OCEAN_DEEP;
        ctx.fillRect(0, 0, size, size);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.mapImage, 0, 0, size, size);

        // Quadrillage 8 x 8 : traits fins et discrets
        const cell = size / GRID;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = Math.max(1, dpr);
        ctx.setLineDash([6 * dpr, 5 * dpr]);
        ctx.beginPath();
        for (let i = 1; i < GRID; i++) {
            const v = Math.round(i * cell) + 0.5;
            ctx.moveTo(v, 0); ctx.lineTo(v, size);
            ctx.moveTo(0, v); ctx.lineTo(size, v);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Bandeaux des coordonnées (haut et gauche) : lettres et chiffres sur fond sombre
        const labelPx = Math.max(11, size * 0.022);
        const band = labelPx * 1.7;
        ctx.fillStyle = 'rgba(8, 20, 56, 0.72)';
        ctx.fillRect(0, 0, size, band);
        ctx.fillRect(0, band, band, size - band);
        ctx.fillStyle = 'rgba(255, 224, 61, 0.9)';
        ctx.fillRect(0, band - Math.max(1, dpr), size, Math.max(1, dpr));
        ctx.fillRect(band - Math.max(1, dpr), band, Math.max(1, dpr), size - band);
        ctx.font = `${Math.round(labelPx)}px "Bebas Neue", Impact, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < GRID; i++) {
            ctx.fillText(LETTERS[i], (i + 0.5) * cell, band / 2 + labelPx * 0.05);
            ctx.fillText(String(i + 1), band / 2, (i + 0.5) * cell);
        }

        // Lacs : nom en italique, dans l'eau
        const lakePx = Math.max(10, size * 0.019);
        for (const l of this.world.lakes) {
            ctx.font = `italic 600 ${Math.round(lakePx)}px "Rubik", "Segoe UI", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            ctx.lineWidth = Math.max(2, lakePx * 0.28);
            ctx.strokeStyle = 'rgba(14, 60, 130, 0.9)';
            ctx.strokeText(l.name, l.x * k, l.y * k);
            ctx.fillStyle = '#e8f6ff';
            ctx.fillText(l.name, l.x * k, l.y * k);
        }

        // Villes : repère sur la place + étiquette (plaque sombre, liseré jaune) au-dessus
        const townPx = Math.max(13, size * 0.03);
        for (const t of this.world.towns) {
            const tx = t.x * k;
            const ty = t.y * k;
            const name = t.name.toUpperCase();
            ctx.font = `${Math.round(townPx)}px "Bebas Neue", Impact, sans-serif`;
            const tw = ctx.measureText(name).width;
            const padX = townPx * 0.5;
            const h = townPx * 1.35;
            const w = tw + padX * 2;
            const gap = Math.max(10 * dpr, (t.plazaR || 120) * k * 0.6);
            const bx = Math.min(Math.max(tx - w / 2, band + 4 * dpr), size - w - 4 * dpr);
            const by = Math.max(ty - gap - h, band + 4 * dpr);

            // Pointe vers le centre de la ville + point blanc
            ctx.beginPath();
            ctx.moveTo(tx - townPx * 0.28, by + h - 1);
            ctx.lineTo(tx, ty - 4 * dpr);
            ctx.lineTo(tx + townPx * 0.28, by + h - 1);
            ctx.closePath();
            ctx.fillStyle = 'rgba(8, 20, 56, 0.88)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(tx, ty, 4 * dpr, 0, TAU);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineWidth = 2 * dpr;
            ctx.strokeStyle = 'rgba(8, 20, 56, 0.9)';
            ctx.stroke();

            // Plaque
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            ctx.shadowBlur = 6 * dpr;
            ctx.shadowOffsetY = 2 * dpr;
            ctx.beginPath();
            ctx.roundRect(bx, by, w, h, h * 0.22);
            ctx.fillStyle = 'rgba(8, 20, 56, 0.88)';
            ctx.fill();
            ctx.restore();
            ctx.beginPath();
            ctx.roundRect(bx, by, w, h, h * 0.22);
            ctx.lineWidth = Math.max(1.5, 1.5 * dpr);
            ctx.strokeStyle = YELLOW;
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(name, bx + w / 2, by + h / 2 + townPx * 0.04);
        }

        // Rose des vents (coin bas droit)
        const cr = Math.max(16, size * 0.035);
        const cx = size - cr * 1.6;
        const cy = size - cr * 1.6;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.beginPath();
        ctx.arc(0, 0, cr, 0, TAU);
        ctx.fillStyle = 'rgba(8, 20, 56, 0.75)';
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, 1.5 * dpr);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.stroke();
        for (const [a, col] of [[0, YELLOW], [Math.PI, '#ffffff'], [Math.PI / 2, 'rgba(255,255,255,0.55)'], [-Math.PI / 2, 'rgba(255,255,255,0.55)']]) {
            ctx.save();
            ctx.rotate(a);
            ctx.beginPath();
            ctx.moveTo(0, -cr * 0.78);
            ctx.lineTo(cr * 0.2, 0);
            ctx.lineTo(-cr * 0.2, 0);
            ctx.closePath();
            ctx.fillStyle = col;
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
        outlinedText(ctx, 'N', cx, cy - cr * 1.25, cr * 0.6);

        // Cadre
        ctx.lineWidth = Math.max(2, 2 * dpr);
        ctx.strokeStyle = 'rgba(8, 20, 56, 0.9)';
        ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
        this._fullBase = c;
    }

    drawFullMap(time) {
        const base = this._fullBase;
        if (!base) return;
        const ctx = this.fctx;
        const size = this.fullCanvas.width;
        const k = size / this.world.width;
        const dpr = this.dpr;
        const p = this.player;

        // Couche statique copiée telle quelle (elle couvre tout le canvas)
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(base, 0, 0);

        // Corruption + trajet du vaisseau (coordonnées monde)
        const zoneOn = zoneActive(this.zone);
        const shipOn = this.drop && this.drop.ship.active;
        if (zoneOn || shipOn) {
            ctx.save();
            ctx.scale(k, k);
            if (zoneOn) {
                this.drawZone(ctx, k, 0, 0, this.world.width, this.world.height);
                this.drawSafeGuide(ctx, k, Infinity);
            }
            if (shipOn) this.drawFlightPath(ctx, k);
            ctx.restore();
        }

        // Ravitaillements sur la grande carte : épingle + compte à rebours (ou « LIVRÉ »)
        const drops = this.supplyDrops?.activeDrops?.() || [];
        for (const d of drops) {
            const dx = d.x * k;
            const dy = d.y * k;
            this.drawSupplyMarker(ctx, dx, dy, 1.35, d, time || this.time);
            const label = d.state === 'falling'
                ? `${Math.max(1, Math.ceil(this.supplyDrops.remaining(d)))} S`
                : 'LIVRÉ';
            this.drawSupplyLabel(ctx, dx, dy + 6 * dpr, label, 1.1 * dpr);
        }

        // Coéquipiers sur la grande carte
        if (this.fighters) {
            const SQUAD_COLORS = { 1: '#00e5ff', 2: '#ffd21e', 3: '#ff4fd8', 4: '#00ff88' };
            for (const f of this.fighters) {
                if (f === p || !f.alive || f.team !== p.team) continue;
                const fx = f.x * k;
                const fy = f.y * k;
                const teamCol = SQUAD_COLORS[f.squadSlot || 2] || '#ffd21e';
                const col = f.dbno ? '#ff334b' : teamCol;
                drawArrow(ctx, fx, fy, f.angle || 0, 8.5 * dpr, col);
            }
        }

        // Gun Game : tous les adversaires sont indiqués par un point rouge
        if (this.showEnemyDots && this.fighters) {
            for (const f of this.fighters) {
                if (f === p || !f.alive || f.phase === 'ship') continue;
                drawEnemyDot(ctx, f.x * k, f.y * k, 6 * dpr);
            }
        }

        // Joueur : cercle qui pulse + flèche
        const px = p.x * k;
        const py = p.y * k;
        const phase = ((time || 0) % 1.4) / 1.4;
        ctx.beginPath();
        ctx.arc(px, py, (10 + phase * 26) * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 224, 61, ${(1 - phase).toFixed(3)})`;
        ctx.lineWidth = 3 * dpr;
        ctx.stroke();
        drawArrow(ctx, px, py, p.angle || 0, 11 * dpr);
    }

    /* ----- Vie / bouclier ----- */
    // transform: scaleX (composité par le GPU) plutôt que width (recalcul de mise en page)
    updateBars() {
        const hp = Math.max(0, Math.min(100, Math.ceil(this.player.health ?? 0)));
        const sh = Math.max(0, Math.min(100, Math.ceil(this.player.shield ?? 0)));
        if (hp !== this._health) {
            this._health = hp;
            this.el.healthFill.style.transform = `scaleX(${hp / 100})`;
            this.el.healthText.textContent = `${hp} / 100`;
            this.el.healthBar.setAttribute('aria-valuenow', hp);
        }
        if (sh !== this._shield) {
            this._shield = sh;
            this.el.shieldFill.style.transform = `scaleX(${sh / 100})`;
            this.el.shieldText.textContent = `${sh} / 100`;
            this.el.shieldBar.setAttribute('aria-valuenow', sh);
        }

        // Corruption : barre de vie violette, bouclier atténué (la corruption l'ignore)
        const corrupt = this.isCorrupted();
        if (corrupt !== this._corrupt) {
            this._corrupt = corrupt;
            this.el.healthBar.classList.toggle('corrupt', corrupt);
            this.el.shieldBar.classList.toggle('bypassed', corrupt);
        }
    }
}
