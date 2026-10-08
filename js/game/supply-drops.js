/* ==================================
   RAVITAILLEMENTS - FOR2D ROYAL
   Apparition périodique, parachute, caisse, contenu garanti et synchronisation.
   Rendu en 2 couches :
   - drawGround (sous les joueurs) : zone d'atterrissage, caisse posée, caisse ouverte ;
   - draw (au-dessus des arbres et des toits) : parachute en descente, fumigène de la caisse.
   ================================== */

import { isWater } from './config.js?v=12';
import { airProject, inFrameView } from './utils.js';
import { LOOT_WEAPONS, WEAPONS, RARITIES, HEALS, THROWABLES } from './weapons.js';

export const SUPPLY_FALL_TIME = 15;     // s : durée de la descente (annonce comprise)
const DROP_INTERVAL = 30;
const FALL_TIME = SUPPLY_FALL_TIME;
const INTERACT_RANGE = 105;
const OPENED_KEEP = 20;                 // s : la caisse vide reste au sol...
const OPENED_FADE = 4;                  // ... puis s'efface sur ces dernières secondes
const TAU = Math.PI * 2;

// Descente (hauteur : 1 = caméra quand le joueur est au sol, comme les chutes des joueurs)
const START_H = 0.45;                   // le parachute sort du ciel au-dessus de la zone
const CANOPY_DH = 0.075;                // la voile est un peu au-dessus de la caisse (parallaxe)
const CANOPY_R = 58;
const CANOPY_GORES = 10;
const COLLAPSE_TIME = 1.4;              // s : la voile s'affaisse au sol après l'impact
const TARGET_R = 118;                   // zone d'atterrissage marquée au sol

// Caisse vue de dessus : couvercle en haut, face avant (bandes de danger) vers +y
const CRATE_W = 84;
const CRATE_H = 66;
const CRATE_FRONT = 16;
const LID_W = CRATE_W - 6;
const LID_H = CRATE_H - CRATE_FRONT - 3;

const COL = {
    orange: '#ff7a1a',
    cream: '#fff4e2',
    navy: '#0b1438',
    navySoft: '#16204a',
    front: '#14306f',
    gold: '#ffc93c',
    interior: '#08102a',
    legend: RARITIES[RARITIES.length - 1]?.color || '#ffb21f'
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - (1 - t) * (1 - t);

const seeded = (seed) => {
    let a = (Number(seed) >>> 0) || 1;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// Petit nombre stable par identifiant (décale le balancement de chaque caisse)
function idSeed(id) {
    let h = 7;
    const s = String(id);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003;
    return (h % 1000) / 100;
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

function circle(ctx, r) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
}

function starPath(ctx, x, y, rOut, rIn, n = 5) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
        const r = i % 2 ? rIn : rOut;
        const a = -Math.PI / 2 + (i * Math.PI) / n;
        if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
}

export class SupplyDrops {
    constructor({
        world, loot, seed = 1, isHost = () => false, send = () => {},
        onAnnounce = () => {}, onLand = () => {}, onOpen = () => {}, idPrefix = ''
    } = {}) {
        this.world = world;
        this.loot = loot;
        this.isHost = isHost;
        this.send = send;
        this.onAnnounce = onAnnounce;
        this.onLand = onLand;
        this.onOpen = onOpen;
        this.rng = seeded(seed ^ 0x51f15e);
        this.idPrefix = idPrefix;
        this.drops = [];
        this.nextAt = DROP_INTERVAL;
        this.counter = 0;
        this.time = 0;
        this._tmp = [];
        this._tmp2 = [];
        this._pk = {};   // projections réutilisées (voile, caisse, fumée)
        this._pb = {};
        this._pf = {};
        this._gctx = null;
        this._g = null;
    }

    activeDrops() {
        return this.drops.filter(d => !d.opened && (d.state === 'falling' || d.state === 'landed'));
    }

    // Avancement de la descente (0 -> 1) et secondes restantes avant l'impact
    progress(drop) {
        return clamp01((drop?.age || 0) / FALL_TIME);
    }

    remaining(drop) {
        return Math.max(0, FALL_TIME - (drop?.age || 0));
    }

    _randomContent() {
        const weaponId = LOOT_WEAPONS[Math.floor(this.rng() * LOOT_WEAPONS.length)] || LOOT_WEAPONS[0];
        const legendary = Math.max(0, RARITIES.length - 1);
        const wDef = WEAPONS[weaponId];
        const weapon = { kind: 'weapon', weaponId, rarity: legendary, mag: wDef?.magSize || 0 };

        let ammo = null;
        if (wDef && wDef.ammo) {
            let ammoAmount = 30;
            switch (wDef.ammo) {
                case 'light':
                    ammoAmount = 60;
                    break;
                case 'medium':
                    ammoAmount = 60;
                    break;
                case 'shells':
                    ammoAmount = 16;
                    break;
                case 'heavy':
                    ammoAmount = 10;
                    break;
                case 'bolts':
                    ammoAmount = 12;
                    break;
                default:
                    ammoAmount = Math.max(12, (wDef.magSize || 10) * 2);
            }
            ammo = { kind: 'ammo', ammoType: wDef.ammo, amount: ammoAmount };
        }

        const useThrowable = this.rng() < 0.35;
        const item = useThrowable
            ? { kind: 'throwable', itemId: Object.keys(THROWABLES)[Math.floor(this.rng() * Object.keys(THROWABLES).length)], count: 2 }
            : { kind: 'heal', itemId: Object.keys(HEALS)[Math.floor(this.rng() * Object.keys(HEALS).length)], count: 2 };
        return [weapon, ammo, item].filter(Boolean);
    }

    // strict : la caisse ne doit pas tomber sous un feuillage, sur un rocher ou un coffre
    _isLand(x, y, strict = true) {
        if (x < 90 || y < 90 || x > this.world.width - 90 || y > this.world.height - 90) return false;
        if (isWater(this.world.sampleGround(x, y).biome)) return false;
        if (this.world.buildings.some(b => x > b.x - 90 && x < b.x + b.w + 90 && y > b.y - 90 && y < b.y + b.h + 90)) return false;
        if (!strict) return true;

        const grid = this.world.render;
        if (grid?.query) {
            const near = grid.query(x - 170, y - 170, x + 170, y + 170, this._tmp);
            for (const o of near) {
                if (!o || !(o.layer === 'top' || o.cr > 0)) continue;
                if (Math.hypot(o.x - x, o.y - y) < (o.r || 0) + 70) return false;
            }
        }
        if (this.loot?.queryChests) {
            const chests = this.loot.queryChests(x - 100, y - 100, x + 100, y + 100, this._tmp2);
            for (const c of chests) {
                if (Math.hypot(c.x - x, c.y - y) < 100) return false;
            }
        }
        return true;
    }

    _randomPosition() {
        for (let i = 0; i < 900; i++) {
            const x = 120 + this.rng() * (this.world.width - 240);
            const y = 120 + this.rng() * (this.world.height - 240);
            // Les 600 premiers essais cherchent un endroit dégagé, ensuite on se contente de la terre ferme
            if (this._isLand(x, y, i < 600)) return { x: Math.round(x), y: Math.round(y) };
        }
        return { x: this.world.width / 2, y: this.world.height / 2 };
    }

    _payload(drop) {
        return {
            type: 'supply_spawn',
            dropId: drop.id,
            x: drop.x,
            y: drop.y,
            at: drop.at,
            contents: drop.contents
        };
    }

    _create(id, x, y, at, contents) {
        const age = Math.max(0, this.time - Number(at || this.time));
        const drop = {
            id, x, y, at: Number(at || this.time), age,
            seed: idSeed(id),
            state: age >= FALL_TIME ? 'landed' : 'falling',
            opened: false,
            contents: Array.isArray(contents) ? contents.map(c => ({ ...c })) : this._randomContent()
        };
        this.drops.push(drop);
        this.onAnnounce(drop, Math.max(0, FALL_TIME - age));
        return drop;
    }

    spawn() {
        const p = this._randomPosition();
        const id = `${this.idPrefix}supply-${++this.counter}`;
        const drop = this._create(id, p.x, p.y, this.time, this._randomContent());
        this.send(this._payload(drop));
    }

    addRemote(msg) {
        if (!msg?.dropId || this.drops.some(d => d.id === msg.dropId)) return;
        this._create(msg.dropId, Number(msg.x) || 0, Number(msg.y) || 0, msg.at, msg.contents);
    }

    update(dt, time) {
        this.time = time;
        if (this.isHost()) {
            while (time >= this.nextAt) {
                this.spawn();
                this.nextAt += DROP_INTERVAL;
            }
        }
        let expired = false;
        for (const d of this.drops) {
            d.age = Math.max(0, time - d.at);
            if (d.state === 'falling' && d.age >= FALL_TIME) {
                d.state = 'landed';
                this.onLand(d);
            }
            if (d.opened && d.openedAt !== undefined && time - d.openedAt >= OPENED_KEEP) expired = true;
        }
        if (expired) this.drops = this.drops.filter(d => !d.opened || d.openedAt === undefined || time - d.openedAt < OPENED_KEEP);
    }

    nearest(fighter) {
        if (!fighter || fighter.phase !== 'ground' || !fighter.alive) return null;
        let best = null;
        let distance = INTERACT_RANGE;
        for (const d of this.drops) {
            if (d.opened || d.state !== 'landed') continue;
            const dd = Math.hypot(d.x - fighter.x, d.y - fighter.y);
            if (dd < distance) { distance = dd; best = d; }
        }
        return best ? { kind: 'supply', target: best } : null;
    }

    describe(drop) {
        return drop?.state === 'landed' ? 'Ouvrir le ravitaillement' : 'Ravitaillement en approche';
    }

    interact(fighter) {
        const near = this.nearest(fighter);
        if (!near) return false;
        if (!this.isHost()) {
            this.send({ type: 'supply_open_request', dropId: near.target.id });
            return true;
        }
        this.open(near.target.id);
        return true;
    }

    handleOpenRequest(dropId) {
        if (this.isHost()) this.open(dropId);
    }

    open(dropId) {
        const drop = this.drops.find(d => d.id === dropId);
        if (!drop || drop.opened || drop.state !== 'landed') return false;
        drop.opened = true;
        drop.openedAt = this.time;
        const count = drop.contents.length;
        drop.contents.forEach((data, i) => {
            const angle = -Math.PI / 2 + (i - (count - 1) / 2) * 0.75;
            const x = drop.x + Math.cos(angle) * 42;
            const y = drop.y + Math.sin(angle) * 42;
            this.loot.drop(data, x, y, drop.x, drop.y);
        });
        this.send({ type: 'supply_open', dropId });
        this.onOpen(drop);
        return true;
    }

    openRemote(dropId) {
        const drop = this.drops.find(d => d.id === dropId);
        if (!drop || drop.opened) return;
        drop.opened = true;
        drop.openedAt = this.time;
        this.onOpen(drop);
    }

    /* ===================== RENDU ===================== */

    // Dégradés créés une fois par contexte (mis à l'échelle au dessin)
    _prep(ctx) {
        if (this._gctx === ctx && this._g) return;
        this._gctx = ctx;
        const g = {};

        // Lueur légendaire (rayon 1)
        g.glow = ctx.createRadialGradient(0, 0, 0.08, 0, 0, 1);
        g.glow.addColorStop(0, 'rgba(255, 196, 80, 0.9)');
        g.glow.addColorStop(0.45, 'rgba(255, 146, 34, 0.34)');
        g.glow.addColorStop(1, 'rgba(255, 120, 20, 0)');

        // Volume de la voile : lumière en haut à gauche, bord plus sombre
        const R = CANOPY_R;
        g.dome = ctx.createRadialGradient(-R * 0.32, -R * 0.38, R * 0.05, 0, 0, R * 1.12);
        g.dome.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        g.dome.addColorStop(0.42, 'rgba(255, 255, 255, 0.04)');
        g.dome.addColorStop(1, 'rgba(10, 16, 48, 0.4)');

        // Couvercle bleu acier (centré sur l'origine)
        g.lid = ctx.createLinearGradient(0, -LID_H / 2, 0, LID_H / 2);
        g.lid.addColorStop(0, '#4f8fff');
        g.lid.addColorStop(0.55, '#2f6fe0');
        g.lid.addColorStop(1, '#1c4aa8');

        // Fumigène : bouffées chaudes (orange) puis grises (rayon 1)
        g.smokeHot = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.smokeHot.addColorStop(0, 'rgba(255, 128, 52, 0.95)');
        g.smokeHot.addColorStop(0.6, 'rgba(255, 96, 36, 0.45)');
        g.smokeHot.addColorStop(1, 'rgba(255, 80, 30, 0)');
        g.smokeCold = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.smokeCold.addColorStop(0, 'rgba(238, 230, 222, 0.9)');
        g.smokeCold.addColorStop(0.6, 'rgba(214, 206, 200, 0.4)');
        g.smokeCold.addColorStop(1, 'rgba(200, 194, 188, 0)');

        this._g = g;
    }

    // Couche du sol (sous les joueurs et les objets)
    drawGround(ctx, time, view) {
        if (!this.drops.length) return;
        this._prep(ctx);
        for (const d of this.drops) {
            if (view && (d.x < view.minX - 260 || d.x > view.maxX + 260 || d.y < view.minY - 260 || d.y > view.maxY + 260)) continue;
            if (d.opened) this._drawOpened(ctx, d);
            else if (d.state === 'falling') this._drawTarget(ctx, d, time);
            else this._drawLanded(ctx, d, time);
        }
    }

    // Couche aérienne (au-dessus des arbres et des toits)
    draw(ctx, time) {
        if (!this.drops.length) return;
        this._prep(ctx);
        for (const d of this.drops) {
            if (d.opened) continue;
            if (d.state === 'falling') this._drawFalling(ctx, d, time);
            else this._drawFlare(ctx, d, time);
        }
    }

    /* ----- Au sol : zone d'atterrissage pendant la descente ----- */
    _drawTarget(ctx, d, time) {
        const t = this.progress(d);
        const appear = clamp01(d.age / 0.6);
        ctx.save();
        ctx.translate(d.x, d.y);

        // Zone teintée + contour
        ctx.globalAlpha = appear * (0.08 + 0.1 * t);
        ctx.fillStyle = COL.orange;
        circle(ctx, TARGET_R);
        ctx.fill();
        ctx.globalAlpha = appear * (0.5 + 0.35 * t);
        ctx.strokeStyle = COL.orange;
        ctx.lineWidth = 3;
        ctx.stroke();

        // 4 crochets de visée qui tournent
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#ffd36b';
        ctx.lineWidth = 6;
        const rot = time * 0.7;
        const rr = TARGET_R + 13;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const a = rot + (i * TAU) / 4;
            ctx.moveTo(Math.cos(a - 0.3) * rr, Math.sin(a - 0.3) * rr);
            ctx.arc(0, 0, rr, a - 0.3, a + 0.3);
        }
        ctx.stroke();

        // Onde qui se resserre vers le point d'impact
        const ph = (time * 0.85) % 1;
        ctx.globalAlpha = appear * 0.6 * Math.sin(ph * Math.PI);
        ctx.lineWidth = 2.5;
        circle(ctx, TARGET_R - (TARGET_R - 26) * ph);
        ctx.stroke();

        // Ombre de la caisse : plus nette et plus sombre à l'approche du sol
        const spread = 1 + (1 - t) * 0.8;
        ctx.globalAlpha = appear * (0.14 + 0.3 * t);
        ctx.fillStyle = '#050a1c';
        ctx.beginPath();
        ctx.ellipse(4, 6, 46 * spread, 36 * spread, 0, 0, TAU);
        ctx.fill();

        // Compte à rebours peint au sol
        const secs = String(Math.max(0, Math.ceil(FALL_TIME - d.age)));
        ctx.globalAlpha = appear * 0.92;
        ctx.font = '46px "Bebas Neue", Impact, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(11, 20, 56, 0.85)';
        ctx.strokeText(secs, 0, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(secs, 0, 3);
        ctx.restore();
    }

    /* ----- Au sol : caisse posée, prête à être ouverte ----- */
    _drawLanded(ctx, d, time) {
        const tl = d.age - FALL_TIME;
        ctx.save();
        ctx.translate(d.x, d.y);

        // Lueur légendaire qui pulse
        const pulse = 0.5 + 0.5 * Math.sin(time * 3 + d.seed);
        const R = 92 + 12 * pulse;
        ctx.save();
        ctx.globalAlpha = 0.45 + 0.2 * pulse;
        ctx.scale(R, R * 0.82);
        ctx.fillStyle = this._g.glow;
        circle(ctx, 1);
        ctx.fill();
        ctx.restore();

        // Onde d'impact juste après l'atterrissage
        if (tl < 0.8) {
            const e = easeOut(clamp01(tl / 0.8));
            ctx.globalAlpha = (1 - e) * 0.85;
            ctx.strokeStyle = COL.legend;
            ctx.lineWidth = 5 - 3 * e;
            circle(ctx, 50 + 120 * e);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // Voile qui s'affaisse à côté de la caisse
        if (tl < COLLAPSE_TIME) this._drawCollapsed(ctx, d, clamp01(tl / COLLAPSE_TIME));

        // Ombre portée
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        roundRect(ctx, -CRATE_W / 2 + 5, -CRATE_H / 2 + 7, CRATE_W, CRATE_H, 8);
        ctx.fill();

        // Petit tassement à l'impact
        const squash = tl < 0.35 ? Math.sin(clamp01(tl / 0.35) * Math.PI) * 0.08 : 0;
        if (squash) ctx.scale(1 + squash, 1 - squash);
        this._drawCrateBody(ctx);
        this._drawBeacon(ctx, time, d);
        ctx.restore();
    }

    /* ----- Au sol : caisse ouverte (couvercle posé à côté), puis fondu ----- */
    _drawOpened(ctx, d) {
        const since = this.time - (d.openedAt ?? this.time);
        const alpha = clamp01((OPENED_KEEP - since) / OPENED_FADE);
        if (alpha <= 0) return;
        const slide = easeOut(clamp01(since / 0.35));
        const x0 = -CRATE_W / 2;
        const y0 = -CRATE_H / 2;
        const yF = CRATE_H / 2 - CRATE_FRONT;

        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.globalAlpha = alpha;

        // Ombre portée
        ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
        roundRect(ctx, x0 + 5, y0 + 7, CRATE_W, CRATE_H, 8);
        ctx.fill();

        // Couvercle éjecté, posé au sol à gauche
        ctx.save();
        ctx.translate(-CRATE_W * 0.88 * slide, 12 * slide);
        ctx.rotate(-0.42 * slide);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        roundRect(ctx, -LID_W / 2 + 4, -LID_H / 2 + 5, LID_W, LID_H, 6);
        ctx.fill();
        this._drawLid(ctx);
        ctx.strokeStyle = COL.navy;
        ctx.lineWidth = 3;
        roundRect(ctx, -LID_W / 2, -LID_H / 2, LID_W, LID_H, 6);
        ctx.stroke();
        ctx.restore();

        // Caisse vide : face avant + intérieur sombre
        this._drawFront(ctx);
        ctx.fillStyle = COL.interior;
        roundRect(ctx, x0 + 3, y0 + 3, LID_W, LID_H, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(79, 143, 255, 0.35)';
        ctx.lineWidth = 3;
        roundRect(ctx, x0 + 8, y0 + 8, LID_W - 10, LID_H - 10, 4);
        ctx.stroke();
        ctx.strokeStyle = COL.navy;
        ctx.lineWidth = 3.5;
        roundRect(ctx, x0, y0, CRATE_W, CRATE_H, 8);
        ctx.stroke();
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x0 + 2, yF);
        ctx.lineTo(-x0 - 2, yF);
        ctx.stroke();
        ctx.restore();
    }

    /* ----- En l'air : caisse suspendue sous sa voile ----- */
    _drawFalling(ctx, d, time) {
        const t = this.progress(d);
        const h = START_H * (1 - t);
        // Balancement : fort en haut, presque nul à l'arrivée
        const swing = 0.35 + 0.65 * (1 - t);
        const sx = Math.sin(time * 1.6 + d.seed) * 9 * swing;
        const sy = Math.cos(time * 1.1 + d.seed * 1.7) * 5 * swing;
        const cp = airProject(d.x + sx, d.y + sy, h + CANOPY_DH, this._pk);
        const bp = airProject(d.x - sx * 0.5, d.y - sy * 0.5, h, this._pb);
        const alpha = Math.min(cp.alpha, bp.alpha) * clamp01(d.age / 0.8);
        if (alpha <= 0.01) return;
        const R = CANOPY_R * cp.k;
        if (!inFrameView(cp.x, cp.y, R * 1.3) && !inFrameView(bp.x, bp.y, 70 * bp.k)) return;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Caisse (légèrement inclinée par le balancement)
        ctx.save();
        ctx.translate(bp.x, bp.y);
        ctx.scale(bp.k, bp.k);
        ctx.rotate(Math.sin(time * 1.6 + d.seed) * 0.08 * swing);
        this._drawCrateBody(ctx);
        ctx.restore();

        // Suspentes : des coins de la caisse jusqu'au bord de la voile
        const cw = CRATE_W * 0.42 * bp.k;
        const ch = CRATE_H * 0.36 * bp.k;
        ctx.strokeStyle = 'rgba(240, 244, 255, 0.85)';
        ctx.lineWidth = 1.6 * bp.k;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const ox = i === 0 || i === 3 ? -cw : cw;
            const oy = i < 2 ? -ch : ch;
            const a = Math.atan2(oy, ox);
            ctx.moveTo(bp.x + ox, bp.y + oy);
            ctx.lineTo(cp.x + Math.cos(a) * R * 0.9, cp.y + Math.sin(a) * R * 0.9);
        }
        ctx.stroke();

        // Voile vue de dessus (elle « respire » un peu)
        ctx.translate(cp.x, cp.y);
        const breathe = cp.k * (1 + Math.sin(time * 2.3 + d.seed) * 0.025);
        ctx.scale(breathe, breathe);
        this._drawCanopy(ctx, time * 0.35 + d.seed);
        ctx.restore();
    }

    /* ----- En l'air : fumigène orange qui s'élève de la balise ----- */
    _drawFlare(ctx, d, time) {
        const tl = d.age - FALL_TIME;
        const fade = clamp01((tl - 0.3) / 1.2);
        if (fade <= 0) return;
        const ox = d.x + CRATE_W / 2 - 12;
        const oy = d.y - CRATE_H / 2 + 12;
        const p = this._pf;
        const g = this._g;
        const N = 11;
        for (let i = 0; i < N; i++) {
            const ph = (time * 0.3 + i / N + d.seed * 0.1) % 1;
            const drift = ph * ph;
            const wx = ox + drift * 90 + Math.sin(time * 0.9 + i * 1.7) * 10 * ph;
            const wy = oy - drift * 30 + Math.cos(time * 0.7 + i) * 6 * ph;
            airProject(wx, wy, 0.03 + ph * 0.45, p);
            const r = (11 + ph * 46) * p.k;
            if (!inFrameView(p.x, p.y, r)) continue;
            const a = fade * p.alpha * Math.min(1, ph / 0.08) * (1 - ph * ph) * 0.95;
            if (a <= 0.01) continue;
            const hot = clamp01(1 - ph * 1.5); // les bouffées jeunes sont orange, puis grises
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.scale(r, r);
            if (hot > 0) {
                ctx.globalAlpha = a * hot;
                ctx.fillStyle = g.smokeHot;
                circle(ctx, 1);
                ctx.fill();
            }
            if (hot < 1) {
                ctx.globalAlpha = a * (1 - hot) * 0.85;
                ctx.fillStyle = g.smokeCold;
                circle(ctx, 1);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    /* ----- Pièces de dessin (repère local) ----- */

    // Contour festonné de la voile (un arrondi par fuseau)
    _canopyPath(ctx, R) {
        const n = CANOPY_GORES;
        ctx.beginPath();
        ctx.moveTo(R, 0);
        for (let i = 0; i < n; i++) {
            const a1 = ((i + 1) / n) * TAU;
            const am = ((i + 0.5) / n) * TAU;
            ctx.quadraticCurveTo(Math.cos(am) * R * 1.13, Math.sin(am) * R * 1.13, Math.cos(a1) * R, Math.sin(a1) * R);
        }
        ctx.closePath();
    }

    _drawCanopy(ctx, rot) {
        const R = CANOPY_R;
        const n = CANOPY_GORES;

        // Ombre sous le bord (fixe : ne tourne pas avec la voile)
        ctx.save();
        ctx.translate(5, 7);
        this._canopyPath(ctx, R);
        ctx.fillStyle = 'rgba(5, 10, 28, 0.22)';
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.rotate(rot);
        // Fuseaux alternés orange / crème (2 remplissages)
        for (let pass = 0; pass < 2; pass++) {
            ctx.beginPath();
            for (let i = pass; i < n; i += 2) {
                const a0 = (i / n) * TAU;
                const a1 = ((i + 1) / n) * TAU;
                const am = ((i + 0.5) / n) * TAU;
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(a0) * R, Math.sin(a0) * R);
                ctx.quadraticCurveTo(Math.cos(am) * R * 1.13, Math.sin(am) * R * 1.13, Math.cos(a1) * R, Math.sin(a1) * R);
                ctx.closePath();
            }
            ctx.fillStyle = pass ? COL.cream : COL.orange;
            ctx.fill();
        }
        // Coutures
        ctx.strokeStyle = 'rgba(20, 28, 70, 0.28)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            ctx.moveTo(Math.cos(a) * R * 0.16, Math.sin(a) * R * 0.16);
            ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        }
        ctx.stroke();
        // Chemin du contour construit dans le repère tourné...
        this._canopyPath(ctx, R);
        ctx.restore();
        // ... mais le volume est éclairé dans le repère fixe (la lumière ne tourne pas)
        ctx.fillStyle = this._g.dome;
        ctx.fill();
        ctx.strokeStyle = COL.navySoft;
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Cheminée centrale
        circle(ctx, R * 0.15);
        ctx.fillStyle = COL.navySoft;
        ctx.fill();
        ctx.strokeStyle = COL.cream;
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }

    // Voile tombée au sol : s'aplatit, glisse avec le vent et s'efface
    _drawCollapsed(ctx, d, e) {
        ctx.save();
        ctx.globalAlpha = (1 - e) * (1 - e);
        ctx.translate(48 + 30 * e, -10);
        ctx.scale(0.95 - 0.2 * e, 0.62 - 0.4 * e);
        this._drawCanopy(ctx, d.seed);
        ctx.restore();
    }

    // Face avant avec bandes de danger (sous le couvercle)
    _drawFront(ctx) {
        const x0 = -CRATE_W / 2;
        const y0 = -CRATE_H / 2;
        const yF = CRATE_H / 2 - CRATE_FRONT;
        const F = CRATE_FRONT;
        ctx.fillStyle = COL.front;
        roundRect(ctx, x0, y0, CRATE_W, CRATE_H, 8);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0 + 6, yF + 4, CRATE_W - 12, F - 8);
        ctx.clip();
        ctx.fillStyle = COL.gold;
        ctx.fillRect(x0 + 6, yF + 4, CRATE_W - 12, F - 8);
        ctx.fillStyle = COL.navy;
        ctx.beginPath();
        for (let x = x0 - F; x < -x0 + F; x += 12) {
            ctx.moveTo(x, yF + F);
            ctx.lineTo(x + 6, yF + F);
            ctx.lineTo(x + 6 + F, yF);
            ctx.lineTo(x + F, yF);
            ctx.closePath();
        }
        ctx.fill();
        ctx.restore();
    }

    // Couvercle centré sur l'origine : acier bleu, cadre doré, sangle et médaillon légendaire
    _drawLid(ctx) {
        const w = LID_W;
        const h = LID_H;
        ctx.fillStyle = this._g.lid;
        roundRect(ctx, -w / 2, -h / 2, w, h, 6);
        ctx.fill();
        ctx.strokeStyle = COL.gold;
        ctx.lineWidth = 3;
        roundRect(ctx, -w / 2 + 3.5, -h / 2 + 3.5, w - 7, h - 7, 4);
        ctx.stroke();
        ctx.fillStyle = COL.navy;
        ctx.fillRect(-6, -h / 2, 12, h);
        // Médaillon + étoile
        circle(ctx, 13);
        ctx.fillStyle = COL.cream;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = COL.gold;
        ctx.stroke();
        starPath(ctx, 0, 0.5, 9, 4);
        ctx.fillStyle = COL.orange;
        ctx.fill();
        // Reflet
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        roundRect(ctx, -w / 2 + 8, -h / 2 + 1.5, w - 16, 2.5, 1.2);
        ctx.fill();
    }

    _drawCrateBody(ctx) {
        const x0 = -CRATE_W / 2;
        const y0 = -CRATE_H / 2;
        const yF = CRATE_H / 2 - CRATE_FRONT;
        this._drawFront(ctx);
        ctx.save();
        ctx.translate(0, y0 + 3 + LID_H / 2);
        this._drawLid(ctx);
        ctx.restore();
        ctx.strokeStyle = COL.navy;
        ctx.lineWidth = 3.5;
        roundRect(ctx, x0, y0, CRATE_W, CRATE_H, 8);
        ctx.stroke();
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(x0 + 2, yF);
        ctx.lineTo(-x0 - 2, yF);
        ctx.stroke();
    }

    // Balise lumineuse qui clignote dans le coin du couvercle
    _drawBeacon(ctx, time, d) {
        const bx = CRATE_W / 2 - 12;
        const by = -CRATE_H / 2 + 12;
        const blink = 0.5 + 0.5 * Math.sin(time * 6 + d.seed);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.3 + 0.5 * blink;
        ctx.translate(bx, by);
        ctx.scale(22, 22);
        ctx.fillStyle = this._g.glow;
        circle(ctx, 1);
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(bx, by, 4.5, 0, TAU);
        ctx.fillStyle = blink > 0.5 ? '#fff6cf' : '#ff8a1f';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = COL.navy;
        ctx.stroke();
    }
}
