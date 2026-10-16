/* ==================================
   ISOLA - CARTE TACTIQUE
   Tab maintenu ouvre une carte plein écran, M la bascule aussi.
   Le fond reprend exactement la carte de l'île ; les marqueurs restent sobres :
   joueur, trajet du dirigeable et bots encore en vie.
   ================================== */

import * as THREE from '../vendor/three/three.module.js';

const TAU = Math.PI * 2;
const YELLOW = '#ffe03d';
const NAVY = '#0b1d4a';

export class IsoMap {
    constructor({ world, player, fighters, mapImage, route }) {
        this.world = world;
        this.player = player;
        this.fighters = fighters;
        this.mapImage = mapImage;
        this.route = route;
        this.open = false;
        this.overlay = document.getElementById('isoMap');
        this.canvas = document.getElementById('isoFullMap');
        this.ctx = this.canvas?.getContext('2d');
        this.closeButton = document.getElementById('isoMapClose');
        this.last = -1;
        this.closeButton?.addEventListener('click', () => this.setOpen(false));
        this.overlay?.addEventListener('click', (event) => {
            if (event.target === this.overlay) this.setOpen(false);
        });
        addEventListener('resize', () => { if (this.open) this.resize(); });
    }

    setOpen(value) {
        const next = Boolean(value);
        if (this.open === next) return;
        this.open = next;
        if (this.overlay) this.overlay.hidden = !next;
        document.body.classList.toggle('iso-map-open', next);
        if (next) {
            this.resize();
            this.draw(performance.now() / 1000, true);
        }
    }

    toggle() { this.setOpen(!this.open); }

    resize() {
        if (!this.canvas) return;
        const css = Math.max(260, Math.floor(Math.min(innerWidth, innerHeight) * 0.86));
        const dpr = Math.min(devicePixelRatio || 1, 2);
        this.canvas.style.width = `${css}px`;
        this.canvas.style.height = `${css}px`;
        const size = Math.round(css * dpr);
        if (this.canvas.width !== size || this.canvas.height !== size) {
            this.canvas.width = size;
            this.canvas.height = size;
        }
        this.last = -1;
    }

    worldToMap(x, y, size) {
        return [x / this.world.width * size, y / this.world.height * size];
    }

    drawGrid(ctx, size) {
        const cell = size / 8;
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = Math.max(1, size / 650);
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        for (let i = 1; i < 8; i++) {
            ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size);
            ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `${Math.max(13, size * 0.026)}px "Bebas Neue", Impact, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 8; i++) {
            ctx.fillText(String.fromCharCode(65 + i), (i + 0.5) * cell, cell * 0.12);
            ctx.fillText(String(i + 1), cell * 0.12, (i + 0.5) * cell);
        }
        for (const town of this.world.towns) {
            const [x, y] = this.worldToMap(town.x, town.y, size);
            ctx.font = `${Math.max(11, size * 0.019)}px "Bebas Neue", Impact, sans-serif`;
            ctx.lineWidth = 4;
            ctx.strokeStyle = NAVY;
            ctx.strokeText(town.name.toUpperCase(), x, y - Math.max(18, size * 0.025));
            ctx.fillStyle = '#ffffff';
            ctx.fillText(town.name.toUpperCase(), x, y - Math.max(18, size * 0.025));
        }
    }

    marker(ctx, x, y, color, radius, angle = 0) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, TAU);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = Math.max(2, radius * 0.22);
        ctx.strokeStyle = NAVY;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(radius * 1.8, 0);
        ctx.lineTo(-radius * 0.65, -radius * 0.65);
        ctx.lineTo(-radius * 0.35, 0);
        ctx.lineTo(-radius * 0.65, radius * 0.65);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    draw(time = 0, force = false) {
        if (!this.open || !this.ctx || !this.canvas) return;
        const bucket = Math.floor(time * 12);
        if (!force && bucket === this.last) return;
        this.last = bucket;
        const ctx = this.ctx;
        const size = this.canvas.width;
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = '#1d5fae';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(this.mapImage, 0, 0, size, size);
        this.drawGrid(ctx, size);

        if (this.player.phase === 'ship' || this.player.phase === 'air') {
            const [ax, ay] = this.worldToMap(this.route.ax, this.route.ay, size);
            const [bx, by] = this.worldToMap(this.route.bx, this.route.by, size);
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = Math.max(2, size / 500);
            ctx.setLineDash([10, 8]);
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
            ctx.restore();
        }

        // Bots en vie : points rouges discrets, pour suivre les combats sans révéler la carte au joueur.
        for (const f of this.fighters) {
            if (!f.isBot || !f.alive || f.phase !== 'ground') continue;
            const [x, y] = this.worldToMap(f.x, f.y, size);
            ctx.beginPath();
            ctx.arc(x, y, Math.max(3, size / 190), 0, TAU);
            ctx.fillStyle = '#ff6474';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = NAVY;
            ctx.stroke();
        }
        const [px, py] = this.worldToMap(this.player.x, this.player.y, size);
        this.marker(ctx, px, py, YELLOW, Math.max(6, size / 110), this.player.angle || 0);
    }

    update(time) { if (this.open) this.draw(time); }
}
