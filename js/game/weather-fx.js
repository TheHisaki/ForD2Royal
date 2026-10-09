/* ==================================
   RENDU DE LA MÉTÉO - FOR2D ROYAL
   Dessiné dans le canvas du jeu (hook overlay du renderer), par-dessus le monde
   et sous le HUD HTML. Purement visuel : la règle (type, changements) est dans weather.js.

   - Nuit       : teinte bleue, obscurité qui ne laisse voir qu'un halo autour du joueur,
                  lueur chaude de lanterne, lucioles.
   - Tempête    : ciel plombé, pluie battante en 2 couches (parallaxe), éclaboussures,
                  rafales, éclairs avec flash + tonnerre, tornade qui traverse la carte.
   - Brouillard : couleurs délavées, voile blanc qui se referme au-delà du joueur,
                  grosses nappes de brume qui dérivent avec le vent.

   Transitions : chaque météo a une intensité 0 -> 1 qui monte / descend en FADE secondes.
   Performance : aucune allocation par image (tampons Float32Array, sprite de brume
   pré-rendu une fois), un seul chemin par couche de pluie.
   ================================== */

const FADE = 2.5;            // s : fondu entre deux météos
const RAIN_COUNT = 260;      // gouttes à l'écran (tempête pleine)
const SPLASH_COUNT = 48;     // éclaboussures simultanées max
const FIREFLY_COUNT = 18;
const FOG_BANKS = 16;
const GUST_COUNT = 9;
const DEBRIS_COUNT = 22;
const TAU = Math.PI * 2;

// Vent de la tempête : la pluie tombe en biais vers la droite
const WIND_X = 0.32;
const WIND_Y = 1;
const WIND_LEN = Math.hypot(WIND_X, WIND_Y);

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const rnd = (a, b) => a + Math.random() * (b - a);

export class WeatherFx {
    constructor({ seed = 1, worldWidth = 6000, worldHeight = 6000, onThunder = null } = {}) {
        this.worldW = worldWidth;
        this.worldH = worldHeight;
        this.phase = ((Number(seed) >>> 0) % 1000) / 1000 * TAU; // départ de la tornade
        this.onThunder = onThunder;
        this.target = 'clear';
        this.level = { night: 0, storm: 0, fog: 0 };
        this.lastT = null;
        this.lastMinX = null;
        this.lastMinY = null;
        this.W = 0;
        this.H = 0;

        // Pluie : x, y, profondeur (0,4 = loin, 1 = près)
        this.rain = new Float32Array(RAIN_COUNT * 3);
        // Éclaboussures : x, y, âge, durée
        this.splash = new Float32Array(SPLASH_COUNT * 4);
        this.splashHead = 0;
        this.splashAcc = 0;
        // Lucioles : x, y, phase, vitesse
        this.flies = new Float32Array(FIREFLY_COUNT * 4);
        // Nappes de brouillard : x, y, taille (unités monde), vitesse
        this.fog = new Float32Array(FOG_BANKS * 4);
        // Rafales : x, y, longueur
        this.gusts = new Float32Array(GUST_COUNT * 3);
        this.seeded = false;

        // Éclair : minuteur, âge, tracé (jusqu'à 2 x 24 points)
        this.boltNext = rnd(4, 9);
        this.boltAge = 99;
        this.bolt = new Float32Array(48 * 2);
        this.boltLen = 0;
        this.branch = new Float32Array(24 * 2);
        this.branchLen = 0;
        this.thunderAt = -1;

        this.fogSprite = null;
    }

    setType(type) {
        this.target = type || 'clear';
    }

    active() {
        return this.level.night > 0.002 || this.level.storm > 0.002 || this.level.fog > 0.002;
    }

    // Position de la tornade (même chemin sur toutes les machines : dépend du temps de partie)
    tornadoAt(time) {
        const t = time * 0.028 + this.phase;
        return {
            x: this.worldW * (0.5 + Math.cos(t) * 0.3 + Math.sin(t * 2.3) * 0.08),
            y: this.worldH * (0.5 + Math.sin(t * 1.3) * 0.3 + Math.cos(t * 1.9) * 0.07)
        };
    }

    _seedPools(W, H) {
        for (let i = 0; i < RAIN_COUNT; i++) {
            this.rain[i * 3] = Math.random() * W;
            this.rain[i * 3 + 1] = Math.random() * H;
            this.rain[i * 3 + 2] = rnd(0.4, 1);
        }
        for (let i = 0; i < FIREFLY_COUNT; i++) {
            this.flies[i * 4] = Math.random() * W;
            this.flies[i * 4 + 1] = Math.random() * H;
            this.flies[i * 4 + 2] = Math.random() * TAU;
            this.flies[i * 4 + 3] = rnd(0.6, 1.4);
        }
        for (let i = 0; i < FOG_BANKS; i++) {
            this.fog[i * 4] = Math.random() * W;
            this.fog[i * 4 + 1] = Math.random() * H;
            this.fog[i * 4 + 2] = rnd(320, 640);
            this.fog[i * 4 + 3] = rnd(10, 26);
        }
        for (let i = 0; i < GUST_COUNT; i++) {
            this.gusts[i * 3] = Math.random() * W;
            this.gusts[i * 3 + 1] = Math.random() * H;
            this.gusts[i * 3 + 2] = rnd(120, 260);
        }
        this.seeded = true;
    }

    // Sprite de brume : disque blanc très doux, rendu une seule fois puis réutilisé
    _fogSprite() {
        if (this.fogSprite || typeof document === 'undefined') return this.fogSprite;
        const S = 256;
        const cv = document.createElement('canvas');
        cv.width = S;
        cv.height = S;
        const c = cv.getContext('2d');
        const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
        g.addColorStop(0, 'rgba(244, 248, 250, 0.85)');
        g.addColorStop(0.45, 'rgba(232, 240, 244, 0.45)');
        g.addColorStop(1, 'rgba(225, 234, 240, 0)');
        c.fillStyle = g;
        c.fillRect(0, 0, S, S);
        this.fogSprite = cv;
        return cv;
    }

    _step(time) {
        const dt = this.lastT === null ? 0 : Math.max(0, Math.min(0.1, time - this.lastT));
        this.lastT = time;
        const k = dt / FADE;
        for (const id of ['night', 'storm', 'fog']) {
            const goal = this.target === id ? 1 : 0;
            const l = this.level[id];
            this.level[id] = goal > l ? Math.min(goal, l + k) : Math.max(goal, l - k);
        }
        return dt;
    }

    /* ===================== MONDE (coordonnées monde) ===================== */

    // Tornade : dessinée dans le monde, au-dessus des joueurs (hook overlay)
    drawWorld(ctx, v, time) {
        const dt = this._step(time);
        this._dt = dt;
        const L = this.level.storm;
        if (L <= 0.002) return;
        const p = this.tornadoAt(time);
        const H = 520;
        if (p.x < v.minX - 400 || p.x > v.maxX + 400 || p.y < v.minY - 120 || p.y - H > v.maxY + 200) return;
        this._drawTornado(ctx, p.x, p.y, time, L);
    }

    _drawTornado(ctx, x, y, time, L) {
        const H = 520;
        ctx.save();
        ctx.lineCap = 'round';
        // Ombre et tourbillon de poussière au sol
        ctx.globalAlpha = 0.28 * L;
        ctx.fillStyle = '#1d2433';
        ctx.beginPath();
        ctx.ellipse(x, y, 190, 62, 0, 0, TAU);
        ctx.fill();
        for (let i = 0; i < 10; i++) {
            const a = time * 2.6 + i * (TAU / 10);
            const r = 120 + Math.sin(time * 3 + i) * 22;
            ctx.globalAlpha = 0.32 * L;
            ctx.fillStyle = i % 2 ? '#b7a98c' : '#8f8572';
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.32, 26 + (i % 3) * 8, 0, TAU);
            ctx.fill();
        }
        // Entonnoir : anneaux empilés qui s'élargissent vers le haut et tournent
        const RINGS = 16;
        for (let i = RINGS; i >= 0; i--) {
            const u = i / RINGS;
            const sway = Math.sin(time * 1.7 + u * 3.6) * 34 * u + Math.sin(time * 0.9) * 12;
            const cx = x + sway;
            const cy = y - u * H;
            const rx = 26 + 170 * Math.pow(u, 1.35);
            const ry = rx * 0.3;
            // Corps (voile gris-bleu, plus dense vers le bas) + cœur sombre
            ctx.globalAlpha = (0.3 + 0.16 * (1 - u)) * L;
            ctx.fillStyle = '#6f7d93';
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
            ctx.fill();
            ctx.globalAlpha = 0.22 * L;
            ctx.fillStyle = '#3a4458';
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx * 0.55, ry * 0.55, 0, 0, TAU);
            ctx.fill();
            // Stries qui tournent (moitié avant plus claire)
            const a0 = time * (7 - u * 3) + i * 0.9;
            ctx.globalAlpha = 0.75 * L;
            ctx.strokeStyle = '#e4ecf5';
            ctx.lineWidth = 4 + u * 4;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, a0, a0 + 2.1);
            ctx.stroke();
            ctx.globalAlpha = 0.5 * L;
            ctx.strokeStyle = '#2b3446';
            ctx.lineWidth = 3 + u * 3;
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx * 0.92, ry * 0.92, 0, a0 + Math.PI, a0 + Math.PI + 1.6);
            ctx.stroke();
        }
        // Débris aspirés (planches, feuilles, cailloux) qui tournent en montant
        for (let i = 0; i < DEBRIS_COUNT; i++) {
            const h = ((i * 53 + time * (60 + (i % 4) * 18)) % (H * 0.9));
            const u = h / H;
            const r = (34 + ((i * 37) % 70)) * (0.6 + u * 1.6);
            const a = time * (3.2 + (i % 3) * 0.8) + i * 1.7;
            const dx = Math.cos(a) * r;
            const dy = Math.sin(a) * r * 0.3;
            const s = 5 + (i % 3) * 3;
            ctx.save();
            ctx.translate(x + dx + Math.sin(time * 1.7 + u * 3.6) * 34 * u, y - h + dy);
            ctx.rotate(a * 2);
            ctx.globalAlpha = 0.9 * L;
            ctx.fillStyle = i % 3 === 0 ? '#8a5a34' : i % 3 === 1 ? '#5f8f3a' : '#7c879b';
            ctx.fillRect(-s, -s * 0.4, s * 2, s * 0.8);
            ctx.strokeStyle = '#0a1030';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-s, -s * 0.4, s * 2, s * 0.8);
            ctx.restore();
        }
        // Nuage sombre au sommet
        ctx.globalAlpha = 0.5 * L;
        ctx.fillStyle = '#4a5468';
        for (let i = 0; i < 6; i++) {
            const a = time * 0.6 + i;
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * 150 + Math.sin(time * 0.9) * 12, y - H - 10 + Math.sin(a) * 34, 80, 0, TAU);
            ctx.fill();
        }
        ctx.restore();
    }

    /* ===================== ÉCRAN (pixels du canvas) ===================== */

    /*
       focus = position du joueur à l'écran (px canvas) ; zoom = px canvas par unité monde ;
       v = bornes de la vue (pour le déplacement de la caméra : la pluie et la brume suivent le monde).
    */
    drawScreen(ctx, v, focus, zoom, dpr, time) {
        if (!this.active()) {
            this.lastMinX = v.minX;
            this.lastMinY = v.minY;
            return;
        }
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        if (!this.seeded || W !== this.W || H !== this.H) {
            this.W = W;
            this.H = H;
            this._seedPools(W, H);
        }
        // Déplacement de la caméra depuis l'image précédente (px canvas)
        let camDx = 0;
        let camDy = 0;
        if (this.lastMinX !== null) {
            camDx = (v.minX - this.lastMinX) * zoom;
            camDy = (v.minY - this.lastMinY) * zoom;
            if (Math.abs(camDx) > W || Math.abs(camDy) > H) { camDx = 0; camDy = 0; } // téléportation
        }
        this.lastMinX = v.minX;
        this.lastMinY = v.minY;
        const dt = this._dt || 0;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (this.level.fog > 0.002) this._drawFog(ctx, W, H, focus, zoom, dt, camDx, camDy, time);
        if (this.level.storm > 0.002) this._drawStorm(ctx, W, H, focus, zoom, dpr, dt, camDx, camDy, time);
        if (this.level.night > 0.002) this._drawNight(ctx, W, H, focus, zoom, dpr, dt, camDx, camDy, time);
        ctx.restore();
    }

    _wrap(arr, i, W, H, m) {
        if (arr[i] < -m) arr[i] += W + m * 2;
        else if (arr[i] > W + m) arr[i] -= W + m * 2;
        if (arr[i + 1] < -m) arr[i + 1] += H + m * 2;
        else if (arr[i + 1] > H + m) arr[i + 1] -= H + m * 2;
    }

    /* ----- Nuit ----- */
    _drawNight(ctx, W, H, focus, zoom, dpr, dt, camDx, camDy, time) {
        const L = this.level.night;
        // Teinte bleu nuit (multiplie les couleurs du monde)
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.8 * L;
        ctx.fillStyle = '#3b4a86';
        ctx.fillRect(0, 0, W, H);
        // Obscurité : seul un halo autour du joueur reste lisible
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        const r0 = 170 * zoom;
        const r1 = 640 * zoom;
        const g = ctx.createRadialGradient(focus.x, focus.y, r0, focus.x, focus.y, r1);
        g.addColorStop(0, 'rgba(3, 6, 22, 0)');
        g.addColorStop(0.55, `rgba(3, 6, 22, ${0.55 * L})`);
        g.addColorStop(1, `rgba(2, 4, 16, ${0.88 * L})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // Lueur chaude de lanterne autour du joueur
        ctx.globalCompositeOperation = 'lighter';
        const flicker = 0.92 + 0.08 * Math.sin(time * 9) * Math.sin(time * 5.3);
        const lg = ctx.createRadialGradient(focus.x, focus.y, 0, focus.x, focus.y, 230 * zoom);
        lg.addColorStop(0, `rgba(255, 196, 120, ${0.16 * L * flicker})`);
        lg.addColorStop(1, 'rgba(255, 196, 120, 0)');
        ctx.fillStyle = lg;
        ctx.fillRect(focus.x - 230 * zoom, focus.y - 230 * zoom, 460 * zoom, 460 * zoom);
        // Reflet de lune en haut à gauche
        const mg = ctx.createLinearGradient(0, 0, W * 0.6, H * 0.6);
        mg.addColorStop(0, `rgba(120, 150, 255, ${0.08 * L})`);
        mg.addColorStop(1, 'rgba(120, 150, 255, 0)');
        ctx.fillStyle = mg;
        ctx.fillRect(0, 0, W, H);
        // Lucioles (suivent le monde, clignotent, tournent doucement)
        const f = this.flies;
        for (let i = 0; i < FIREFLY_COUNT; i++) {
            const j = i * 4;
            f[j + 2] += dt * f[j + 3];
            f[j] += Math.cos(f[j + 2]) * 14 * dpr * dt - camDx;
            f[j + 1] += Math.sin(f[j + 2] * 1.3) * 10 * dpr * dt - camDy;
            this._wrap(f, j, W, H, 30);
            const blink = clamp01(0.5 + 0.5 * Math.sin(time * 2.2 * f[j + 3] + i * 1.7));
            if (blink < 0.25) continue;
            const s = (1 + blink * 1.2) * dpr;
            ctx.globalAlpha = 0.18 * L * blink;
            ctx.fillStyle = '#d8ff7a';
            ctx.beginPath();
            ctx.arc(f[j], f[j + 1], s * 3.5, 0, TAU);
            ctx.fill();
            ctx.globalAlpha = 0.9 * L * blink;
            ctx.fillStyle = '#f6ffd0';
            ctx.beginPath();
            ctx.arc(f[j], f[j + 1], s, 0, TAU);
            ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
    }

    /* ----- Tempête ----- */
    _drawStorm(ctx, W, H, focus, zoom, dpr, dt, camDx, camDy, time) {
        const L = this.level.storm;
        // Ciel plombé (assombrit et refroidit les couleurs) + bords plus sombres
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.7 * L;
        ctx.fillStyle = '#66758e';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
        vg.addColorStop(0, 'rgba(10, 18, 34, 0)');
        vg.addColorStop(1, `rgba(10, 18, 34, ${0.5 * L})`);
        ctx.globalAlpha = 1;
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);

        // Rafales : longs traits pâles qui filent avec le vent
        const gs = this.gusts;
        ctx.strokeStyle = '#dbe8f5';
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.5 * dpr;
        ctx.globalAlpha = 0.12 * L;
        ctx.beginPath();
        for (let i = 0; i < GUST_COUNT; i++) {
            const j = i * 3;
            gs[j] += 900 * dpr * dt - camDx;
            gs[j + 1] += 260 * dpr * dt - camDy;
            this._wrap(gs, j, W, H, 300 * dpr);
            const len = gs[j + 2] * dpr;
            ctx.moveTo(gs[j], gs[j + 1]);
            ctx.lineTo(gs[j] - len, gs[j + 1] - len * 0.29);
        }
        ctx.stroke();

        // Pluie : 2 couches (loin = fine et pâle, près = épaisse et nette)
        const r = this.rain;
        const count = Math.round(RAIN_COUNT * L);
        const ux = WIND_X / WIND_LEN;
        const uy = WIND_Y / WIND_LEN;
        for (let layer = 0; layer < 2; layer++) {
            ctx.beginPath();
            for (let i = 0; i < count; i++) {
                const j = i * 3;
                const z = r[j + 2];
                const near = z >= 0.72;
                if (near !== (layer === 1)) continue;
                const sp = (1100 + 900 * z) * dpr;
                r[j] += ux * sp * dt - camDx * z;
                r[j + 1] += uy * sp * dt - camDy * z;
                if (r[j + 1] > H + 30) {
                    r[j + 1] -= H + 60;
                    r[j] = Math.random() * (W + 200) - 200;
                }
                this._wrap(r, j, W, H, 40);
                const len = (16 + 26 * z) * dpr;
                ctx.moveTo(r[j], r[j + 1]);
                ctx.lineTo(r[j] - ux * len, r[j + 1] - uy * len);
            }
            ctx.strokeStyle = layer ? '#e4f2ff' : '#a9c6e6';
            ctx.lineWidth = (layer ? 2.2 : 1.2) * dpr;
            ctx.globalAlpha = (layer ? 0.55 : 0.32) * L;
            ctx.stroke();
        }

        // Éclaboussures au sol (anneaux qui s'élargissent + 2 gouttelettes)
        this.splashAcc += dt * 70 * L;
        const sp = this.splash;
        while (this.splashAcc >= 1) {
            this.splashAcc -= 1;
            const j = this.splashHead * 4;
            this.splashHead = (this.splashHead + 1) % SPLASH_COUNT;
            sp[j] = Math.random() * W;
            sp[j + 1] = Math.random() * H;
            sp[j + 2] = 0;
            sp[j + 3] = rnd(0.25, 0.4);
        }
        ctx.lineWidth = 1.4 * dpr;
        ctx.strokeStyle = '#e8f4ff';
        for (let i = 0; i < SPLASH_COUNT; i++) {
            const j = i * 4;
            if (sp[j + 3] <= 0) continue;
            sp[j + 2] += dt;
            sp[j] -= camDx;
            sp[j + 1] -= camDy;
            const t = sp[j + 2] / sp[j + 3];
            if (t >= 1) { sp[j + 3] = 0; continue; }
            const rr = (2 + 9 * t) * dpr * Math.max(0.6, zoom / dpr);
            ctx.globalAlpha = 0.6 * (1 - t) * L;
            ctx.beginPath();
            ctx.ellipse(sp[j], sp[j + 1], rr, rr * 0.45, 0, 0, TAU);
            ctx.stroke();
            if (t < 0.5) {
                ctx.beginPath();
                ctx.arc(sp[j] - rr * 0.6, sp[j + 1] - rr * (1.4 - t), 1.3 * dpr, 0, TAU);
                ctx.arc(sp[j] + rr * 0.7, sp[j + 1] - rr * (1.1 - t), 1.1 * dpr, 0, TAU);
                ctx.fillStyle = '#e8f4ff';
                ctx.fill();
            }
        }

        // Éclairs : flash de tout l'écran (double clignement) + tracé en zigzag
        this.boltNext -= dt;
        this.boltAge += dt;
        if (this.boltNext <= 0 && L > 0.6) {
            this.boltNext = rnd(5, 12);
            this.boltAge = 0;
            this._makeBolt(W, H);
            this.thunderAt = rnd(0.35, 1.1);
        }
        if (this.thunderAt >= 0) {
            this.thunderAt -= dt;
            if (this.thunderAt < 0) this.onThunder?.();
        }
        if (this.boltAge < 0.7) {
            const t = this.boltAge;
            const flash = t < 0.08 ? 1 : t < 0.14 ? 0.3 : t < 0.22 ? 0.85 : Math.max(0, 1 - (t - 0.22) / 0.48);
            ctx.globalAlpha = 0.42 * flash * L;
            ctx.fillStyle = '#eef6ff';
            ctx.fillRect(0, 0, W, H);
            if (t < 0.32) {
                const a = (t < 0.1 ? 1 : 0.75) * L;
                this._strokeBolt(ctx, this.bolt, this.boltLen, dpr, a, 1);
                this._strokeBolt(ctx, this.branch, this.branchLen, dpr, a * 0.8, 0.6);
            }
        }
        ctx.globalAlpha = 1;
    }

    _makeBolt(W, H) {
        let x = rnd(0.15, 0.85) * W;
        let y = -20;
        const endY = rnd(0.35, 0.7) * H;
        const n = 22;
        const step = (endY - y) / n;
        this.boltLen = 0;
        let branchFrom = Math.floor(rnd(5, 12));
        for (let i = 0; i <= n; i++) {
            this.bolt[i * 2] = x;
            this.bolt[i * 2 + 1] = y;
            this.boltLen++;
            if (i === branchFrom) {
                // Petite branche qui part du tronc
                let bx = x;
                let by = y;
                const dir = Math.random() < 0.5 ? -1 : 1;
                this.branchLen = 0;
                for (let k = 0; k < 10; k++) {
                    this.branch[k * 2] = bx;
                    this.branch[k * 2 + 1] = by;
                    this.branchLen++;
                    bx += dir * rnd(10, 26) * (W / 1280);
                    by += step * rnd(0.5, 0.9);
                }
                branchFrom = -1;
            }
            x += rnd(-28, 28) * (W / 1280);
            y += step * rnd(0.8, 1.2);
        }
    }

    _strokeBolt(ctx, pts, n, dpr, alpha, width) {
        if (n < 2) return;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 1; i < n; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
        ctx.lineJoin = 'round';
        ctx.globalAlpha = alpha * 0.35;
        ctx.strokeStyle = '#9fd4ff';
        ctx.lineWidth = 12 * dpr * width;
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3 * dpr * width;
        ctx.stroke();
    }

    /* ----- Brouillard ----- */
    _drawFog(ctx, W, H, focus, zoom, dt, camDx, camDy, time) {
        const L = this.level.fog;
        // Couleurs délavées
        ctx.globalCompositeOperation = 'saturation';
        ctx.globalAlpha = 0.55 * L;
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        // Voile léger partout
        ctx.globalAlpha = 0.16 * L;
        ctx.fillStyle = '#dde7ec';
        ctx.fillRect(0, 0, W, H);
        // Nappes de brume qui dérivent avec le vent (suivent le monde)
        const sprite = this._fogSprite();
        const fg = this.fog;
        if (sprite) {
            for (let i = 0; i < FOG_BANKS; i++) {
                const j = i * 4;
                const size = fg[j + 2] * zoom;
                fg[j] += fg[j + 3] * zoom * dt - camDx;
                fg[j + 1] += fg[j + 3] * 0.35 * zoom * dt - camDy;
                const m = size * 0.6;
                if (fg[j] > W + m) fg[j] -= W + m * 2;
                else if (fg[j] < -m) fg[j] += W + m * 2;
                if (fg[j + 1] > H + m) fg[j + 1] -= H + m * 2;
                else if (fg[j + 1] < -m) fg[j + 1] += H + m * 2;
                const pulse = 0.85 + 0.15 * Math.sin(time * 0.4 + i * 1.3);
                ctx.globalAlpha = 0.55 * L * pulse;
                ctx.drawImage(sprite, fg[j] - size / 2, fg[j + 1] - size * 0.35, size, size * 0.7);
            }
        }
        // Le brouillard se referme au-delà du joueur
        const r0 = 150 * zoom;
        const r1 = 600 * zoom;
        const g = ctx.createRadialGradient(focus.x, focus.y, r0, focus.x, focus.y, r1);
        g.addColorStop(0, 'rgba(226, 234, 238, 0)');
        g.addColorStop(0.5, `rgba(226, 234, 238, ${0.5 * L})`);
        g.addColorStop(1, `rgba(222, 231, 236, ${0.9 * L})`);
        ctx.globalAlpha = 1;
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
    }
}
