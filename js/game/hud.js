/* ==================================
   HUD - FOR2D ROYAL
   Minimap, carte plein écran, nom du lieu, barres de vie, inventaire.
   ================================== */

import { WORLD_SIZE, B, BIOME_NAMES, LAKES, OCEAN_DEEP } from './config.js';
import { sampleGround, nearestLake } from './world.js';
import { groundRGB, drawRoads, drawPlaza, drawField } from './draw.js';
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
const HELP_TIME = 10;               // secondes d'affichage de la ligne d'aide

// Corruption (zone qui rétrécit) sur les cartes
const CORRUPT_FILL = 'rgba(30, 0, 52, 0.72)';     // hors zone : violet sombre (comme la carte en jeu)
const CORRUPT_GLOW = 'rgba(176, 76, 255, 0.35)';  // halo autour du bord
const CORRUPT_EDGE = '#b04cff';                   // bord lumineux de la zone saine
const TAU = Math.PI * 2;

// La zone est-elle en cours (annoncée, en mouvement ou finale) ?
function zoneActive(z) {
    return !!(z && z.cur && z.state && z.state !== 'idle');
}

/* ===================== IMAGE DE LA CARTE ===================== */

// Construit une fois pour toutes l'image de l'île entière (vue du dessus)
export function buildMapImage(world, size = 1024) {
    // 1) Sol calculé en basse résolution
    const RES = 512;
    const small = document.createElement('canvas');
    small.width = RES;
    small.height = RES;
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(RES, RES);
    const step = WORLD_SIZE / RES;
    for (let py = 0; py < RES; py++) {
        const y = (py + 0.5) * step;
        for (let px = 0; px < RES; px++) {
            const s = sampleGround((px + 0.5) * step, y);
            groundRGB(img.data, (py * RES + px) * 4, s);
        }
    }
    sctx.putImageData(img, 0, 0);

    // 2) Agrandi avec lissage
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, size, size);

    // 3) Détails dessinés en coordonnées monde
    const k = size / WORLD_SIZE;
    const minR = 1.2 / k; // un objet fait au moins ~1 pixel sur la carte
    ctx.save();
    ctx.scale(k, k);

    drawRoads(ctx, world.roads, 30);
    for (const town of world.towns) drawPlaza(ctx, town);
    for (const f of world.fields) drawField(ctx, f);

    ctx.lineWidth = 14;
    for (const b of world.buildings) {
        ctx.fillStyle = b.roof;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeStyle = b.roofDark;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
    }

    for (const o of world.objects) {
        let color;
        if (VEGETATION.has(o.type)) color = o.base;
        else if (o.type === 'rock') color = '#8d9199';
        else continue;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(o.x, o.y, Math.max(o.r * 0.8, minR), 0, Math.PI * 2);
        ctx.fill();
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
    constructor(world, player, fighters = []) {
        this.world = world;
        this.player = player;
        this.fighters = fighters;
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
            help: $('hudHelp'),
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
            if (document.fullscreenElement) document.exitFullscreen?.();
            else document.documentElement.requestFullscreen?.().catch(() => {});
        });
        this.slots.forEach((btn, i) => btn.addEventListener('click', () => this.selectSlot(i)));

        // Ligne d'aide : 10 s d'affichage, comptées seulement quand elle est vraiment visible
        // (elle s'efface quand un message du centre s'affiche : vaisseau, corruption, élimination)
        this._helpLeft = HELP_TIME;
        this._helpShown = null;
        this._helpBlockers = ['dropPrompt', 'zoneAlert', 'killBanner'].map(id => $(id)).filter(Boolean);

        this.resize();
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
        const inShip = this.player.phase === 'ship';
        if (inShip !== this._inShip) {
            this._inShip = inShip;
            this.el.dropPrompt.hidden = !inShip;
        }
        if (!inShip) return;

        const msg = d.canJump
            ? `pour sauter|Saut auto dans ${Math.ceil(d.timeLeft)} s`
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

    updateHelp(dt) {
        if (this._helpLeft <= 0) return;
        const p = this.player;
        const blocked = !p.alive || p.phase === 'ship' || this._helpBlockers.some(el => !el.hidden);
        if (!blocked) this._helpLeft -= dt;
        const show = !blocked && this._helpLeft > 0;
        if (show === this._helpShown) return;
        this._helpShown = show;
        this.el.help.classList.toggle('hidden', !show);
    }

    update(dt, time) {
        this.time = time || 0;
        this.updateDropPrompt();
        this.updateHelp(dt);

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
        if (p.phase !== 'ground') p.biome = sampleGround(p.x, p.y).biome;
        let name;
        let sub;
        const town = this.world.towns.find(t => Math.hypot(p.x - t.x, p.y - t.y) < t.radius);
        if (town) {
            name = town.name;
            sub = BIOME_NAMES[town.biome] || '';
        } else if (p.biome === B.LAC) {
            name = nearestLake(p.x, p.y).name;
            sub = BIOME_NAMES[B.LAC];
        } else {
            name = BIOME_NAMES[p.biome] || '';
            sub = '';
        }

        const key = `${name}|${sub}`;
        if (key === this._locKey) return;
        this._locKey = key;
        this.el.locName.textContent = name;
        this.el.locBiome.textContent = sub;
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
        const size = Math.max(1, Math.round(WORLD_SIZE * k));
        const c = this._mmBase || document.createElement('canvas');
        c.width = size;
        c.height = size;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.mapImage, 0, 0, size, size);
        const ks = size / WORLD_SIZE;
        for (const t of this.world.towns) {
            outlinedText(ctx, t.name.toUpperCase(), t.x * ks, t.y * ks, 13 * this.dpr);
        }
        this._mmBase = c;
        this._mmScale = ks;
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
        const key = `${sx},${sy},${Math.round((p.angle || 0) * 20)},${p.phase},${p.alive ? 1 : 0},${ship},${zk},${mateKey}`;
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
            ctx.fillStyle = OCEAN_DEEP;
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

        drawArrow(ctx, p.x * k - sx, p.y * k - sy, p.angle || 0, 9 * this.dpr);
    }

    /* ----- Carte plein écran ----- */

    // Couche statique : île, quadrillage, lettres/chiffres, villes et lacs
    buildFullBase(size) {
        const c = this._fullBase || document.createElement('canvas');
        c.width = size;
        c.height = size;
        const ctx = c.getContext('2d');
        const k = size / WORLD_SIZE;
        const dpr = this.dpr;

        ctx.fillStyle = OCEAN_DEEP;
        ctx.fillRect(0, 0, size, size);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.mapImage, 0, 0, size, size);

        // Quadrillage 8 x 8
        const cell = size / GRID;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
        ctx.lineWidth = Math.max(1, dpr);
        ctx.beginPath();
        for (let i = 1; i < GRID; i++) {
            const v = Math.round(i * cell) + 0.5;
            ctx.moveTo(v, 0); ctx.lineTo(v, size);
            ctx.moveTo(0, v); ctx.lineTo(size, v);
        }
        ctx.stroke();

        const labelPx = Math.max(12, size * 0.024);
        for (let i = 0; i < GRID; i++) {
            outlinedText(ctx, LETTERS[i], (i + 0.5) * cell, labelPx * 0.8, labelPx);
            outlinedText(ctx, String(i + 1), labelPx * 0.8, (i + 0.5) * cell, labelPx);
        }

        // Villes
        const townPx = Math.max(14, size * 0.034);
        for (const t of this.world.towns) {
            outlinedText(ctx, t.name.toUpperCase(), t.x * k, t.y * k, townPx);
        }
        // Lacs (plus petits, en italique)
        const lakePx = Math.max(10, size * 0.02);
        for (const l of LAKES) {
            // Sous le lac, pour ne pas chevaucher les noms de villes voisines
            outlinedText(ctx, l.name, l.x * k, (l.y + l.r) * k + lakePx, lakePx, 'italic 600 ' + '"Rubik", "Segoe UI", sans-serif');
        }
        this._fullBase = c;
    }

    drawFullMap(time) {
        const base = this._fullBase;
        if (!base) return;
        const ctx = this.fctx;
        const size = this.fullCanvas.width;
        const k = size / WORLD_SIZE;
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
                this.drawZone(ctx, k, 0, 0, WORLD_SIZE, WORLD_SIZE);
                this.drawSafeGuide(ctx, k, Infinity);
            }
            if (shipOn) this.drawFlightPath(ctx, k);
            ctx.restore();
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
