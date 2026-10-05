/* ==================================
   RENDU - FOR2D ROYAL
   Caméra, sol pré-dessiné en chunks (avec cache) et
   affichage des couches : sol, joueur, feuillages, toits.

   Performance :
   - les chunks de sol sont construits PETIT À PETIT (quelques lignes par image,
     dans un budget de temps), les visibles d'abord, puis la marge et la direction
     du mouvement : plus de grosse saccade quand on découvre une zone ;
   - tant qu'un chunk visible n'est pas prêt, on affiche un aperçu basse résolution
     de toute l'île (calculé une fois) ;
   - le cache garde toujours au moins tous les chunks visibles + la marge,
     même en vue dézoomée (vaisseau) ;
   - la résolution interne du canvas est plafonnée (écrans à fort devicePixelRatio).
   ================================== */

import {
    WORLD_SIZE, CHUNK_SIZE, GROUND_RES, GRID_STEP, VIEW, ZOOM, OCEAN_DEEP, RENDER
} from './config.js';
import { sampleGround } from './world.js';
import { clamp, rectsOverlap, frameView } from './utils.js';
import {
    groundRGB, drawRoads, drawPlaza, drawField, drawBuildingBase, drawRoof,
    castsShadow, drawShadow, drawObject, drawPlayer, drawDoorMarkers
} from './draw.js';
import {
    circleClass, rectClass, clipOutside, recolor, drawCorruptDetails, drawCorruptObject, drawCorruptRoof
} from './corrupt-look.js';

const NCHUNKS = Math.ceil(WORLD_SIZE / CHUNK_SIZE); // chunks par côté
const ALL_CHUNKS = NCHUNKS * NCHUNKS;
const GROUND_N = CHUNK_SIZE / GROUND_RES + 2;       // pixels de sol par côté (1 px de marge de chaque côté)
const OVERVIEW_RES = 30;                            // aperçu de l'île : 1 pixel = 30 unités
const MAX_JOBS = 4;                                 // chunks à moitié construits gardés en mémoire
const MAX_SPEED = 3000;                             // vitesse caméra max prise en compte (unités / s)
const byId = (a, b) => a.id - b.id;
const now = () => performance.now();

function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

// Surface de composition réutilisable : un OffscreenCanvas dont on "détache" l'image
// (ImageBitmap, rapide à dessiner). Sinon (vieux navigateur) : un canvas par chunk.
function makeComposer() {
    if (typeof OffscreenCanvas === 'undefined' ||
        typeof OffscreenCanvas.prototype.transferToImageBitmap !== 'function') return null;
    try {
        const canvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE);
        const ctx = canvas.getContext('2d');
        return ctx ? { canvas, ctx } : null;
    } catch {
        return null;
    }
}

// Morceaux de routes qui passent près de la zone : inutile de tracer les kilomètres
// de route hors du chunk. On garde 1 point de plus de chaque côté ; ces points sont
// à plus de "m" du chunk, donc les bouts arrondis coupés ne s'y voient pas.
function roadPieces(roads, x0, y0, x1, y1) {
    const out = [];
    for (const r of roads) {
        const bb = r.bbox;
        if (bb.maxX < x0 || bb.minX > x1 || bb.maxY < y0 || bb.minY > y1) continue;
        const m = r.width + 20;
        const ax = x0 - m;
        const ay = y0 - m;
        const bx = x1 + m;
        const by = y1 + m;
        const p = r.points;
        const n = p.length / 2;
        let start = -1;
        for (let i = 0; i <= n; i++) {
            const inside = i < n &&
                p[i * 2] >= ax && p[i * 2] <= bx && p[i * 2 + 1] >= ay && p[i * 2 + 1] <= by;
            if (inside) {
                if (start < 0) start = i;
            } else if (start >= 0) {
                const a = Math.max(0, start - 1);
                const b = Math.min(n - 1, i);
                out.push({ points: p.slice(a * 2, b * 2 + 2), width: r.width });
                start = -1;
            }
        }
    }
    return out;
}

export class Renderer {
    constructor(canvas, world) {
        this.canvas = canvas;
        // Canvas opaque (tout est repeint à chaque image) : le navigateur n'a pas à le
        // mélanger avec la page derrière, composition plus rapide
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.world = world;
        this.cam = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
        this.zoomMul = 1;
        this.zoomTarget = 1;
        this.baseZoom = 1;
        this.dpr = 1;
        this.cssW = 1;
        this.cssH = 1;

        // Cache des chunks : clé -> { img, used } (used = dernière image où il a servi)
        this.chunks = new Map();
        this.jobs = new Map();          // chunks en cours de construction : clé -> travail
        this.frame = 0;
        this.limit = RENDER.minChunks;  // taille du cache (s'adapte à la vue)
        this.overview = null;           // aperçu basse résolution de l'île (placeholder)

        // Surfaces réutilisées pour construire les chunks
        this.small = makeCanvas(GROUND_N, GROUND_N);
        this.smallCtx = this.small.getContext('2d');
        this.composer = makeComposer();

        // Vitesse de la caméra (pour anticiper les chunks devant)
        this.vel = { x: 0, y: 0 };
        this._lastCam = null;

        this._tmp = [];
        // Corruption : chunks recolorés (clé -> { img, used }) + listes réutilisées
        this.zone = null;
        this.cchunks = new Map();
        this._crossChunks = [];
        this._crossObjs = [];
        this._crossBuildings = [];
        this.resize();
    }

    /* ----- Écran / caméra ----- */

    resize() {
        this.cssW = window.innerWidth;
        this.cssH = window.innerHeight;
        // Résolution interne plafonnée : DPR max, puis nombre de pixels max
        const css = Math.max(1, this.cssW * this.cssH);
        let dpr = Math.min(window.devicePixelRatio || 1, RENDER.maxDpr);
        if (css * dpr * dpr > RENDER.maxPixels) {
            dpr = Math.min(dpr, Math.max(RENDER.minDpr, Math.sqrt(RENDER.maxPixels / css)));
        }
        this.dpr = dpr;
        this.canvas.width = Math.max(1, Math.floor(this.cssW * dpr));
        this.canvas.height = Math.max(1, Math.floor(this.cssH * dpr));
        this.canvas.style.width = this.cssW + 'px';
        this.canvas.style.height = this.cssH + 'px';
        this.baseZoom = Math.sqrt((this.cssW * this.cssH) / (VIEW.width * VIEW.height));
        // Changer la taille du canvas remet son état à zéro : lissage bilinéaire simple
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'low';
    }

    // Échelle du SOL à l'écran. flightMul = 1 / hauteur de la caméra : en altitude la carte
    // est plus loin donc plus petite. Les objets en l'air (vaisseau, joueurs en chute) sont
    // agrandis à part (voir utils.airProject) et gardent leur taille normale.
    get zoom() {
        return this.baseZoom * Math.max(0.38, this.zoomMul * (this.flightMul ?? 1));
    }

    // Hauteur de la caméra (1 = au sol). snap : suit exactement l'altitude (pendant le vol),
    // sinon transition douce.
    setFlightView(target, dt, snap = false) {
        this.flightMul = this.flightMul ?? target;
        if (snap) this.flightMul = target;
        else this.flightMul += (target - this.flightMul) * Math.min(1, dt * 1.5);
    }

    setZoomTarget(target, min = ZOOM.min) {
        const floor = Math.max(ZOOM.min, Math.min(Number(min) || ZOOM.min, ZOOM.max));
        this.zoomTarget = clamp(Number(target) || 1, floor, ZOOM.max);
    }

    updateZoom(dt) {
        const alpha = 1 - Math.exp(-Math.max(0, dt) * 10);
        this.zoomMul += (this.zoomTarget - this.zoomMul) * alpha;
    }

    setZoomMin(min = ZOOM.min) {
        const floor = Math.max(ZOOM.min, Math.min(Number(min) || ZOOM.min, ZOOM.max));
        this.zoomTarget = clamp(this.zoomTarget, floor, ZOOM.max);
        this.zoomMul = clamp(this.zoomMul, floor, ZOOM.max);
    }

    zoomBy(f, min = ZOOM.min) {
        const floor = Math.max(ZOOM.min, Math.min(Number(min) || ZOOM.min, ZOOM.max));
        this.zoomTarget = clamp(this.zoomTarget * f, floor, ZOOM.max);
    }

    // Coordonnées écran (CSS) -> coordonnées monde
    screenToWorld(sx, sy) {
        const z = this.zoom;
        return {
            x: this.cam.x + (sx - this.cssW / 2) / z,
            y: this.cam.y + (sy - this.cssH / 2) / z
        };
    }

    // Coordonnées monde -> coordonnées écran (CSS)
    worldToScreen(wx, wy) {
        const z = this.zoom;
        return {
            x: (wx - this.cam.x) * z + this.cssW / 2,
            y: (wy - this.cam.y) * z + this.cssH / 2
        };
    }

    // Secoue la caméra (amount en unités monde, ex. 4 = léger, 14 = fort)
    shake(amount) {
        this.shakeAmt = Math.min(22, Math.max(this.shakeAmt || 0, amount));
    }

    follow(player, dt, snap = false) {
        const t = snap ? 1 : Math.min(1, dt * 8);
        this.cam.x += (player.x - this.cam.x) * t;
        this.cam.y += (player.y - this.cam.y) * t;
    }

    // Zone du monde visible à l'écran
    _viewBounds() {
        const z = this.zoom;
        const hw = this.cssW / 2 / z;
        const hh = this.cssH / 2 / z;
        return {
            minX: this.cam.x - hw, minY: this.cam.y - hh,
            maxX: this.cam.x + hw, maxY: this.cam.y + hh
        };
    }

    // Plage de chunks couvrant la vue (+ marge), bornée au monde. dx, dy : décalage de la vue
    _chunkRange(v, margin, dx = 0, dy = 0) {
        return {
            x0: clamp(Math.floor((v.minX + dx) / CHUNK_SIZE) - margin, 0, NCHUNKS - 1),
            y0: clamp(Math.floor((v.minY + dy) / CHUNK_SIZE) - margin, 0, NCHUNKS - 1),
            x1: clamp(Math.floor((v.maxX + dx) / CHUNK_SIZE) + margin, 0, NCHUNKS - 1),
            y1: clamp(Math.floor((v.maxY + dy) / CHUNK_SIZE) + margin, 0, NCHUNKS - 1)
        };
    }

    // Chunks à garder prêts : la vue + 1 chunk de marge, étendue dans le sens du mouvement
    _wantedRange(v) {
        const ring = this._chunkRange(v, 1);
        const la = RENDER.lookahead;
        const ahead = this._chunkRange(v, 0, this.vel.x * la, this.vel.y * la);
        return {
            x0: Math.min(ring.x0, ahead.x0), y0: Math.min(ring.y0, ahead.y0),
            x1: Math.max(ring.x1, ahead.x1), y1: Math.max(ring.y1, ahead.y1)
        };
    }

    // Construit l'aperçu + tous les chunks visibles et 1 de marge (au chargement)
    warmup() {
        if (!this.overview) this._buildOverview();
        const r = this._chunkRange(this._viewBounds(), 1);
        const count = (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
        this.limit = Math.min(ALL_CHUNKS, Math.max(this.limit, count + 8));
        for (let cy = r.y0; cy <= r.y1; cy++) {
            for (let cx = r.x0; cx <= r.x1; cx++) {
                const key = cy * NCHUNKS + cx;
                if (this.chunks.has(key)) continue;
                const job = this.jobs.get(key) || this._newJob(key);
                this.jobs.delete(key);
                this._stepJob(job, Infinity);
                this._store(key, this._compose(job));
            }
        }
    }

    /* ----- Aperçu basse résolution (placeholder) ----- */

    _buildOverview() {
        const n = Math.ceil(WORLD_SIZE / OVERVIEW_RES);
        const c = makeCanvas(n, n);
        const cctx = c.getContext('2d');
        const img = cctx.createImageData(n, n);
        const data = img.data;
        for (let j = 0; j < n; j++) {
            const wy = (j + 0.5) * OVERVIEW_RES;
            for (let i = 0; i < n; i++) {
                groundRGB(data, (j * n + i) * 4, sampleGround((i + 0.5) * OVERVIEW_RES, wy));
            }
        }
        cctx.putImageData(img, 0, 0);
        this.overview = c;
    }

    // Couleur du sol (floue) à la place d'un chunk pas encore prêt
    _drawPlaceholder(ctx, cx, cy) {
        if (!this.overview) this._buildOverview();
        const k = CHUNK_SIZE / OVERVIEW_RES;
        ctx.drawImage(this.overview, cx * k, cy * k, k, k,
            cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE + 0.5, CHUNK_SIZE + 0.5);
    }

    /* ----- Chunks de sol ----- */

    _newJob(key) {
        return {
            cx: key % NCHUNKS,
            cy: Math.floor(key / NCHUNKS),
            row: 0,
            img: new ImageData(GROUND_N, GROUND_N)
        };
    }

    // Calcule des lignes de sol jusqu'à "deadline" (au moins une). true = terminé
    _stepJob(job, deadline) {
        const n = GROUND_N;
        const x0 = job.cx * CHUNK_SIZE;
        const y0 = job.cy * CHUNK_SIZE;
        const data = job.img.data;
        while (job.row < n) {
            const j = job.row++;
            const wy = y0 + (j - 0.5) * GROUND_RES;
            let k = j * n * 4;
            for (let i = 0; i < n; i++, k += 4) {
                groundRGB(data, k, sampleGround(x0 + (i - 0.5) * GROUND_RES, wy));
            }
            if (now() >= deadline) break;
        }
        return job.row >= n;
    }

    // Image finale du chunk : sol agrandi + routes, places, champs, bâtiments, objets au sol
    _compose(job) {
        const x0 = job.cx * CHUNK_SIZE;
        const y0 = job.cy * CHUNK_SIZE;
        const n = GROUND_N;

        // 1) Petite image du sol (surface partagée : réécrite en entier à chaque fois)
        this.smallCtx.putImageData(job.img, 0, 0);

        // 2) Agrandissement lissé (la marge sert à l'interpolation des bords)
        let canvas;
        let ctx;
        if (this.composer) {
            ({ canvas, ctx } = this.composer);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
        } else {
            canvas = makeCanvas(CHUNK_SIZE, CHUNK_SIZE);
            ctx = canvas.getContext('2d');
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.small, -GROUND_RES, -GROUND_RES, n * GROUND_RES, n * GROUND_RES);

        // 3) Détails en coordonnées monde
        this._drawDetails(ctx, x0, y0);

        return this.composer ? canvas.transferToImageBitmap() : canvas;
    }

    _drawDetails(ctx, x0, y0) {
        const x1 = x0 + CHUNK_SIZE;
        const y1 = y0 + CHUNK_SIZE;
        ctx.save();
        ctx.translate(-x0, -y0);
        const w = this.world;
        const area = { x: x0, y: y0, w: CHUNK_SIZE, h: CHUNK_SIZE };

        // Routes (seulement les morceaux proches du chunk)
        drawRoads(ctx, roadPieces(w.roads, x0, y0, x1, y1));

        // Places des villes
        for (const t of w.towns) {
            const R = t.plazaR + 10;
            if (t.x + R >= x0 && t.x - R <= x1 && t.y + R >= y0 && t.y - R <= y1) drawPlaza(ctx, t);
        }

        // Champs
        for (const f of w.fields) {
            if (rectsOverlap(f, area, 10)) drawField(ctx, f);
        }

        // Quadrillage
        ctx.strokeStyle = 'rgba(0,0,0,0.07)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = Math.ceil(x0 / GRID_STEP) * GRID_STEP; x <= x1; x += GRID_STEP) {
            ctx.moveTo(x, y0);
            ctx.lineTo(x, y1);
        }
        for (let y = Math.ceil(y0 / GRID_STEP) * GRID_STEP; y <= y1; y += GRID_STEP) {
            ctx.moveTo(x0, y);
            ctx.lineTo(x1, y);
        }
        ctx.stroke();

        // Bases des bâtiments (marge pour l'ombre et la marche devant les portes)
        for (const b of w.buildings) {
            if (rectsOverlap(b, area, 64)) drawBuildingBase(ctx, b);
        }

        // Ombres puis objets au sol
        const objs = w.render.query(x0, y0, x1, y1, []).sort(byId);
        for (const o of objs) {
            if (castsShadow(o)) drawShadow(ctx, o);
        }
        for (const o of objs) {
            if (o.layer === 'ground') drawObject(ctx, o);
        }
        ctx.restore();
    }

    // Range un chunk terminé dans le cache (et libère les plus anciens si besoin)
    _store(key, img) {
        this.chunks.set(key, { img, used: this.frame });
        while (this.chunks.size > this.limit && this._evictOne());
    }

    // Retire le chunk inutilisé depuis le plus longtemps (jamais un chunk voulu cette image)
    _evictOne() {
        let oldKey = -1;
        let oldUsed = this.frame;
        this.chunks.forEach((c, k) => {
            if (c.used < oldUsed) {
                oldUsed = c.used;
                oldKey = k;
            }
        });
        if (oldKey < 0) return false;
        const c = this.chunks.get(oldKey);
        if (c.img.close) c.img.close(); // ImageBitmap : libère la mémoire tout de suite
        this.chunks.delete(oldKey);
        return true;
    }

    // Vitesse de la caméra, lissée (sert à anticiper les chunks devant)
    _trackMotion(dt) {
        const last = this._lastCam;
        if (last && dt > 0) {
            let ix = (this.cam.x - last.x) / dt;
            let iy = (this.cam.y - last.y) / dt;
            const sp = Math.hypot(ix, iy);
            if (sp > MAX_SPEED) {
                ix *= MAX_SPEED / sp;
                iy *= MAX_SPEED / sp;
            }
            const k = Math.min(1, dt * 4);
            this.vel.x += (ix - this.vel.x) * k;
            this.vel.y += (iy - this.vel.y) * k;
        }
        if (last) {
            last.x = this.cam.x;
            last.y = this.cam.y;
        } else {
            this._lastCam = { x: this.cam.x, y: this.cam.y };
        }
    }

    // Chunk manquant le plus urgent : les visibles du centre vers les bords,
    // puis la marge en commençant par ce qui est devant (sens du mouvement)
    _pickMissing(W, r, v) {
        const la = RENDER.lookahead;
        const vx = (v.minX + v.maxX) / 2;
        const vy = (v.minY + v.maxY) / 2;
        const ax = vx + this.vel.x * la;
        const ay = vy + this.vel.y * la;
        let best = -1;
        let bestD = Infinity;
        for (let cy = W.y0; cy <= W.y1; cy++) {
            for (let cx = W.x0; cx <= W.x1; cx++) {
                const key = cy * NCHUNKS + cx;
                if (this.chunks.has(key)) continue;
                const mx = (cx + 0.5) * CHUNK_SIZE;
                const my = (cy + 0.5) * CHUNK_SIZE;
                const visible = cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1;
                const d = visible
                    ? (mx - vx) * (mx - vx) + (my - vy) * (my - vy)
                    : 1e12 + (mx - ax) * (mx - ax) + (my - ay) * (my - ay);
                if (d < bestD) {
                    bestD = d;
                    best = key;
                }
            }
        }
        return best;
    }

    // Construction progressive des chunks, dans un budget de temps par image
    _updateChunks(v, r, urgent) {
        const W = this._wantedRange(v);
        const f = this.frame;

        // Tout ce qui est voulu est marqué "utilisé" : jamais jeté puis reconstruit en boucle
        for (let cy = W.y0; cy <= W.y1; cy++) {
            for (let cx = W.x0; cx <= W.x1; cx++) {
                const c = this.chunks.get(cy * NCHUNKS + cx);
                if (c) c.used = f;
            }
        }
        const count = (W.x1 - W.x0 + 1) * (W.y1 - W.y0 + 1);
        this.limit = Math.min(ALL_CHUNKS, Math.max(RENDER.minChunks, count + 8));
        // La vue a rétréci (atterrissage) : on libère la mémoire petit à petit
        if (this.chunks.size > this.limit) this._evictOne();

        const deadline = now() + (urgent ? RENDER.urgentBuildMs : RENDER.buildMs);
        let composed = 0;
        while (composed < 2) {
            const key = this._pickMissing(W, r, v);
            if (key < 0) break;
            let job = this.jobs.get(key);
            if (!job) {
                job = this._newJob(key);
                this.jobs.set(key, job);
            }
            if (!this._stepJob(job, deadline)) break; // on reprendra à l'image suivante
            this.jobs.delete(key);
            this._store(key, this._compose(job));
            composed++;
            if (now() >= deadline) break;
        }

        // Travaux commencés puis sortis de la zone : on les oublie
        if (this.jobs.size > MAX_JOBS) {
            this.jobs.forEach((j, k) => {
                if (j.cx < W.x0 || j.cx > W.x1 || j.cy < W.y0 || j.cy > W.y1) this.jobs.delete(k);
            });
        }
    }

    /* ----- Image complète ----- */

    /*
       hooks (tous optionnels, reçoivent (ctx, vue) en coordonnées monde) :
       - under    : au sol, sous les personnages (coffres, objets)
       - entities : les personnages et les balles (sous les feuillages et les toits)
       - overlay  : tout en haut (vaisseau, chutes, pseudos, dégâts)
    */
    render(player, dt, time, hooks = {}) {
        const ctx = this.ctx;
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        this.frame++;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = OCEAN_DEEP;
        ctx.fillRect(0, 0, cw, ch);

        // Tremblement de caméra (décroît tout seul)
        this.shakeAmt = Math.max(0, (this.shakeAmt || 0) - dt * 40);
        const sa = this.shakeAmt;
        const shx = sa ? (Math.random() - 0.5) * 2 * sa : 0;
        const shy = sa ? (Math.random() - 0.5) * 2 * sa : 0;

        // Caméra (translation arrondie au pixel pour éviter le flou)
        const s = this.zoom * this.dpr;
        const tx = Math.round(cw / 2 - (this.cam.x + shx) * s);
        const ty = Math.round(ch / 2 - (this.cam.y + shy) * s);
        ctx.setTransform(s, 0, 0, s, tx, ty);

        const v = this._viewBounds();
        // Bornes partagées (culling dans les fonctions qui ne reçoivent pas "v")
        frameView.minX = v.minX;
        frameView.minY = v.minY;
        frameView.maxX = v.maxX;
        frameView.maxY = v.maxY;
        // Hauteur de la caméra : flightMul = 1 / hauteur (sol 2x plus loin = carte 2x plus petite)
        frameView.camX = this.cam.x;
        frameView.camY = this.cam.y;
        frameView.camH = 1 / (this.flightMul ?? 1);
        this._trackMotion(dt);

        // Zone saine de la corruption (null si pas de corruption, ou vue entièrement saine)
        const zc = this._zoneForView(v);

        // Sol : chunks visibles (aperçu flou pour ceux qui ne sont pas encore prêts).
        // Dans la corruption : version recolorée violet / noir du chunk ; sur le bord,
        // chunk normal puis version corrompue découpée hors du cercle (frontière nette).
        const r = this._chunkRange(v, 0);
        const f = this.frame;
        const cross = this._crossChunks;
        cross.length = 0;
        let missing = 0;
        for (let cy = r.y0; cy <= r.y1; cy++) {
            for (let cx = r.x0; cx <= r.x1; cx++) {
                const key = cy * NCHUNKS + cx;
                const c = this.chunks.get(key);
                const cls = zc ? rectClass(zc.x, zc.y, zc.r, cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE) : 0;
                const cc = cls ? this.cchunks.get(key) : null;
                if (cc) cc.used = f;
                if (cls === 2 && cc) {
                    ctx.drawImage(cc.img, cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE + 0.5, CHUNK_SIZE + 0.5);
                    continue;
                }
                if (c) {
                    c.used = f;
                    ctx.drawImage(c.img, cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE + 0.5, CHUNK_SIZE + 0.5);
                } else {
                    missing++;
                    this._drawPlaceholder(ctx, cx, cy);
                }
                if (cls) cross.push(key);
            }
        }
        if (cross.length) {
            ctx.save();
            clipOutside(ctx, v, zc);
            for (const key of cross) {
                const x = (key % NCHUNKS) * CHUNK_SIZE;
                const y = Math.floor(key / NCHUNKS) * CHUNK_SIZE;
                const cc = this.cchunks.get(key);
                if (cc) {
                    ctx.drawImage(cc.img, x, y, CHUNK_SIZE + 0.5, CHUNK_SIZE + 0.5);
                } else {
                    // Version corrompue pas encore prête : voile sombre en attendant
                    ctx.fillStyle = 'rgba(26, 4, 44, 0.78)';
                    ctx.fillRect(x, y, CHUNK_SIZE + 0.5, CHUNK_SIZE + 0.5);
                }
            }
            ctx.restore();
        }

        hooks.under?.(ctx, v);

        // Personnages au sol (en vol ils sont dessinés par-dessus tout)
        if (hooks.entities) hooks.entities(ctx, v);
        else if (player.phase === 'ground') drawPlayer(ctx, player, time);

        // Feuillages (deviennent transparents quand le joueur est dessous)
        const k = Math.min(1, dt * 10);
        const onGround = player.phase === 'ground';
        const objs = this.world.render.query(v.minX, v.minY, v.maxX, v.maxY, this._tmp);
        // On ne garde que les feuillages avant de trier (liste plus courte)
        let n = 0;
        for (let i = 0; i < objs.length; i++) {
            if (objs[i].layer === 'top') objs[n++] = objs[i];
        }
        objs.length = n;
        objs.sort(byId);
        const crossObjs = this._crossObjs;
        crossObjs.length = 0;
        for (let i = 0; i < n; i++) {
            const o = objs[i];
            const under = onGround && Math.hypot(o.x - player.x, o.y - player.y) < o.r * 0.9 + player.r * 0.4;
            o.alpha += ((under ? 0.42 : 1) - o.alpha) * k;
            // La grille renvoie des cases entières : on saute ce qui est hors écran
            const m = o.r * 1.25 + 4;
            if (o.x + m < v.minX || o.x - m > v.maxX || o.y + m < v.minY || o.y - m > v.maxY) continue;
            ctx.globalAlpha = o.alpha;
            const cls = zc ? circleClass(zc.x, zc.y, zc.r, o.x, o.y, m) : 0;
            if (cls === 2) {
                drawCorruptObject(ctx, o); // arbre entièrement corrompu
            } else {
                drawObject(ctx, o);
                if (cls === 1) crossObjs.push(o);
            }
        }
        // Arbres traversés par le bord : moitié corrompue par-dessus, découpée
        if (crossObjs.length) {
            ctx.save();
            clipOutside(ctx, v, zc);
            for (const o of crossObjs) {
                ctx.globalAlpha = o.alpha;
                drawCorruptObject(ctx, o);
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        // Toits (disparaissent quand le joueur est à l'intérieur)
        // + auvents d'entrée par-dessus (ils dépassent d'environ 45 unités avec l'ombre : marge 55)
        const view = { x: v.minX, y: v.minY, w: v.maxX - v.minX, h: v.maxY - v.minY };
        const crossB = this._crossBuildings;
        crossB.length = 0;
        for (const b of this.world.buildings) {
            if (!rectsOverlap(b, view, 55)) continue;
            const inside = onGround &&
                           player.x > b.x && player.x < b.x + b.w &&
                           player.y > b.y && player.y < b.y + b.h;
            b.alpha += ((inside ? 0 : 1) - b.alpha) * k;
            const cls = zc ? rectClass(zc.x, zc.y, zc.r, b.x - 55, b.y - 55, b.w + 110, b.h + 110) : 0;
            if (cls === 2) {
                drawCorruptRoof(ctx, b); // maison en ruine, violet / noir
                drawDoorMarkers(ctx, b, time, true);
            } else {
                drawRoof(ctx, b);
                drawDoorMarkers(ctx, b, time);
                if (cls === 1) crossB.push(b);
            }
        }
        if (crossB.length) {
            ctx.save();
            clipOutside(ctx, v, zc);
            for (const b of crossB) {
                drawCorruptRoof(ctx, b);
                drawDoorMarkers(ctx, b, time, true);
            }
            ctx.restore();
        }
        ctx.globalAlpha = 1;

        hooks.overlay?.(ctx, v);

        // Construction des chunks manquants (budget plus large si un chunk visible manque)
        this._updateChunks(v, r, missing > 0);
        if (this.zone) this._updateCorruptChunks(v, r);
    }

    /* ----- Corruption : version violet / noir des chunks ----- */

    // Zone de corruption (lecture seule : cur, state), donnée une fois par main.js
    setZone(zone) {
        this.zone = zone || null;
    }

    // Cercle sain si une partie de la vue est corrompue, sinon null (rien à faire)
    _zoneForView(v) {
        const z = this.zone;
        if (!z || z.state === 'idle' || !z.cur) return null;
        const c = z.cur;
        if (rectClass(c.x, c.y, c.r, v.minX - 60, v.minY - 60, v.maxX - v.minX + 120, v.maxY - v.minY + 120) === 0) return null;
        return c;
    }

    // Surface où l'on relit les pixels (willReadFrequently : lecture rapide)
    _corruptSurface() {
        if (this._cs) return this._cs;
        let canvas;
        if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE);
        else canvas = makeCanvas(CHUNK_SIZE, CHUNK_SIZE);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        this._cs = { canvas, ctx };
        return this._cs;
    }

    // Chunk corrompu = chunk normal recoloré + fissures, cristaux, bâtiments en ruine
    _buildCorrupt(key, src) {
        const { canvas, ctx } = this._corruptSurface();
        const x0 = (key % NCHUNKS) * CHUNK_SIZE;
        const y0 = Math.floor(key / NCHUNKS) * CHUNK_SIZE;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, CHUNK_SIZE, CHUNK_SIZE);
        ctx.drawImage(src, 0, 0);
        const img = ctx.getImageData(0, 0, CHUNK_SIZE, CHUNK_SIZE);
        recolor(img.data);
        ctx.putImageData(img, 0, 0);
        ctx.save();
        ctx.translate(-x0, -y0);
        drawCorruptDetails(ctx, this.world, x0, y0, CHUNK_SIZE);
        ctx.restore();

        let out;
        if (typeof canvas.transferToImageBitmap === 'function') {
            out = canvas.transferToImageBitmap();
        } else {
            out = makeCanvas(CHUNK_SIZE, CHUNK_SIZE);
            out.getContext('2d').drawImage(canvas, 0, 0);
        }
        this.cchunks.set(key, { img: out, used: this.frame });
        // Cache limité comme celui des chunks normaux (le plus ancien part)
        while (this.cchunks.size > this.limit) {
            let oldKey = -1;
            let oldUsed = this.frame;
            this.cchunks.forEach((c, k) => {
                if (c.used < oldUsed) { oldUsed = c.used; oldKey = k; }
            });
            if (oldKey < 0) break;
            const c = this.cchunks.get(oldKey);
            if (c.img.close) c.img.close();
            this.cchunks.delete(oldKey);
        }
    }

    // Construit les chunks corrompus manquants : les visibles d'abord, puis la marge
    // (en anticipant un peu l'avancée du bord). ~1 par image, 2 si un visible manque.
    _updateCorruptChunks(v, r) {
        const z = this.zone;
        if (z.state === 'idle' || !z.cur) return;
        const c = z.cur;
        const ahead = Math.max(0, c.r - 350); // le bord va arriver : on prépare un peu avant
        const t0 = now();
        let built = 0;
        for (let pass = 0; pass < 2 && built < 2; pass++) {
            const m = pass === 0 ? 0 : 1;
            const x0 = Math.max(0, r.x0 - m);
            const y0 = Math.max(0, r.y0 - m);
            const x1 = Math.min(NCHUNKS - 1, r.x1 + m);
            const y1 = Math.min(NCHUNKS - 1, r.y1 + m);
            for (let cy = y0; cy <= y1 && built < 2; cy++) {
                for (let cx = x0; cx <= x1 && built < 2; cx++) {
                    const key = cy * NCHUNKS + cx;
                    const cc = this.cchunks.get(key);
                    if (cc) { cc.used = this.frame; continue; }
                    const rad = pass === 0 ? c.r : ahead;
                    if (rectClass(c.x, c.y, rad, cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE) === 0) continue;
                    const src = this.chunks.get(key);
                    if (!src) continue; // le chunk normal d'abord
                    this._buildCorrupt(key, src.img);
                    built++;
                    // Un 2e seulement si c'est un visible et qu'il reste du temps
                    if (pass > 0 || now() - t0 > RENDER.buildMs) return;
                }
            }
        }
    }
}
