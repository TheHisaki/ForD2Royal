/* ==================================
   RAVITAILLEMENTS - FOR2D ROYAL
   Apparition périodique, parachute, caisse, contenu garanti et synchronisation.
   ================================== */

import { B, isWater } from './config.js?v=12';
import { frameView, airProject, inFrameView } from './utils.js';
import { LOOT_WEAPONS, WEAPONS, RARITIES, HEALS, THROWABLES } from './weapons.js';

const DROP_INTERVAL = 30;
const FALL_TIME = 15;
const INTERACT_RANGE = 105;
const CRATE_COLOR = '#d85b2b';
const CRATE_DARK = '#71301f';
const PARACHUTE = ['#ff334b', '#ffe03d', '#4fd8ff', '#ffffff'];
const TAU = Math.PI * 2;

const seeded = (seed) => {
    let a = (Number(seed) >>> 0) || 1;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

export class SupplyDrops {
    constructor({ world, loot, seed = 1, isHost = () => false, send = () => {}, onAnnounce = () => {}, idPrefix = '' } = {}) {
        this.world = world;
        this.loot = loot;
        this.isHost = isHost;
        this.send = send;
        this.onAnnounce = onAnnounce;
        this.rng = seeded(seed ^ 0x51f15e);
        this.idPrefix = idPrefix;
        this.drops = [];
        this.nextAt = DROP_INTERVAL;
        this.counter = 0;
        this.time = 0;
        this._tmp = [];
    }

    activeDrops() {
        return this.drops.filter(d => !d.opened && (d.state === 'falling' || d.state === 'landed'));
    }

    _randomContent() {
        const weaponId = LOOT_WEAPONS[Math.floor(this.rng() * LOOT_WEAPONS.length)] || LOOT_WEAPONS[0];
        const legendary = Math.max(0, RARITIES.length - 1);
        const weapon = { kind: 'weapon', weaponId, rarity: legendary, mag: WEAPONS[weaponId]?.magSize || 0 };
        const useThrowable = this.rng() < 0.35;
        const item = useThrowable
            ? { kind: 'throwable', itemId: Object.keys(THROWABLES)[Math.floor(this.rng() * Object.keys(THROWABLES).length)], count: 1 }
            : { kind: 'heal', itemId: Object.keys(HEALS)[Math.floor(this.rng() * Object.keys(HEALS).length)], count: 1 };
        return [weapon, item];
    }

    _isLand(x, y) {
        if (x < 90 || y < 90 || x > this.world.width - 90 || y > this.world.height - 90) return false;
        if (isWater(this.world.sampleGround(x, y).biome)) return false;
        if (this.world.buildings.some(b => x > b.x - 90 && x < b.x + b.w + 90 && y > b.y - 90 && y < b.y + b.h + 90)) return false;
        return true;
    }

    _randomPosition() {
        for (let i = 0; i < 700; i++) {
            const x = 120 + this.rng() * (this.world.width - 240);
            const y = 120 + this.rng() * (this.world.height - 240);
            if (this._isLand(x, y)) return { x: Math.round(x), y: Math.round(y) };
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
        for (const d of this.drops) {
            d.age = Math.max(0, time - d.at);
            if (d.state === 'falling' && d.age >= FALL_TIME) d.state = 'landed';
        }
        this.drops = this.drops.filter(d => !d.opened || d.openedAt === undefined || time - d.openedAt < 20);
    }

    nearest(fighter) {
        if (!fighter || fighter.phase !== 'ground' || !fighter.alive) return null;
        let best = null;
        let distance = INTERACT_RANGE;
        for (const d of this.activeDrops()) {
            if (d.state !== 'landed') continue;
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
        return true;
    }

    openRemote(dropId) {
        const drop = this.drops.find(d => d.id === dropId);
        if (drop) { drop.opened = true; drop.openedAt = this.time; }
    }

    draw(ctx, time, view) {
        const list = this.activeDrops();
        for (const d of list) {
            if (view && (d.x < view.minX - 300 || d.x > view.maxX + 300 || d.y < view.minY - 300 || d.y > view.maxY + 300)) continue;
            if (d.state === 'falling') this._drawFalling(ctx, d, time);
            else this._drawCrate(ctx, d.x, d.y, 1, time, false);
        }
    }

    _drawFalling(ctx, d, time) {
        const progress = Math.max(0, Math.min(1, d.age / FALL_TIME));
        const height = 0.45 + (1 - progress) * 0.85;
        const p = airProject(d.x, d.y, height, {});
        if (p.alpha <= 0 || !inFrameView(p.x, p.y, 260 * p.k)) return;
        const crate = { x: p.x, y: p.y + 36 * p.k, k: p.k };
        this._drawCrateScreen(ctx, crate.x, crate.y, crate.k, time, true);

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y - 105 * p.k);
        ctx.scale(p.k, p.k);
        ctx.strokeStyle = 'rgba(250,250,255,.8)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-80, 50); ctx.lineTo(-26, 95);
        ctx.moveTo(80, 50); ctx.lineTo(26, 95);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-92, 18);
        ctx.quadraticCurveTo(0, -62, 92, 18);
        ctx.quadraticCurveTo(0, 62, -92, 18);
        ctx.closePath();
        ctx.fillStyle = '#e5ebf5'; ctx.fill();
        ctx.strokeStyle = '#172440'; ctx.lineWidth = 5; ctx.stroke();
        ctx.save(); ctx.clip();
        for (let i = 0; i < 4; i++) {
            ctx.fillStyle = PARACHUTE[i];
            ctx.beginPath();
            ctx.moveTo(-92 + i * 46, 18);
            ctx.lineTo(-68 + i * 46, -35);
            ctx.lineTo(-22 + i * 46, -35);
            ctx.lineTo(-i * 0 + (-46 + i * 46), 18);
            ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.restore();
    }

    _drawCrate(ctx, x, y, k, time, screen = false) {
        if (screen) return this._drawCrateScreen(ctx, x, y, k, time, true);
        ctx.save();
        ctx.translate(x, y);
        this._drawCrateLocal(ctx, time, 1);
        ctx.restore();
    }

    _drawCrateScreen(ctx, x, y, k, time) {
        ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
        this._drawCrateLocal(ctx, time, k); ctx.restore();
    }

    _drawCrateLocal(ctx, time, scale = 1) {
        ctx.save();
        ctx.globalAlpha = 0.24;
        ctx.fillStyle = '#071124';
        ctx.beginPath(); ctx.ellipse(8, 22, 58, 16, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = CRATE_COLOR;
        ctx.strokeStyle = '#311822'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.roundRect(-48, -24, 96, 48, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f0aa3c'; ctx.fillRect(-45, -19, 90, 9);
        ctx.fillStyle = CRATE_DARK; ctx.fillRect(-7, -23, 14, 46);
        ctx.fillStyle = '#ffe03d'; ctx.font = 'bold 25px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('★', 0, 3);
        ctx.strokeStyle = '#ffdf53'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-36, -36); ctx.lineTo(36, -36); ctx.stroke();
        ctx.fillStyle = '#fff3a8'; ctx.beginPath(); ctx.arc(28, -36, 5 + Math.sin(time * 7) * 2, 0, TAU); ctx.fill();
        ctx.restore();
    }
}
