/* ==================================
   JOUEUR - FOR2D ROYAL
   Déplacement, visée et collisions.
   ================================== */

import { PLAYER, isWater } from './config.js?v=12';
import { INVENTORY_SLOTS } from './weapons.js';
import { sampleGround } from './world.js?v=12';
import { clamp } from './utils.js';

export class Player {
    constructor(x, y, world = null) {
        this.world = world;
        this.x = x;
        this.y = y;
        this.vx = 0;
        this.vy = 0;
        this.r = PLAYER.radius;
        this.angle = 0;
        this.moving = false;
        this.walkTime = 0;
        this.inWater = false;
        this.biome = (world?.sampleGround || sampleGround)(x, y).biome;
        this.name = PLAYER.name;
        this.health = 100;
        this.shield = 0;
        this.phase = 'ground';  // 'ship' (dans le vaisseau), 'air' (en chute) ou 'ground'
        this.altitude = 0;      // 1 = tout en haut, 0 = au sol

        // ----- Combat / inventaire (utilisé par le joueur ET les bots) -----
        this.id = 0;
        this.isBot = false;
        this.alive = true;
        this.kills = 0;
        this.colors = { skin: '#f2c29b', hair: '#5a3419', outfit: '#ff7a1a', pack: '#3a8dff' };
        // 6 cases : la 1re est toujours la pioche, les 5 suivantes sont libres
        this.inventory = [{ kind: 'weapon', weaponId: 'pickaxe', rarity: 0, mag: 0 }, ...Array(INVENTORY_SLOTS - 1).fill(null)];
        this.slot = 0;
        this.ammo = { light: 0, medium: 0, heavy: 0, shells: 0, bolts: 0 };
        this.fireCooldown = 0;
        this.reloadTimer = 0;
        this.swingT = 0;
        this.usingItem = null;
        this.speedMul = 1;
        this.adminSpeedMul = 1;
        this.adminInvisible = false;
        this.adminInvincible = false;
        this.adminNoclip = false;
        this.propelX = 0;
        this.propelY = 0;
        this.stimTimer = 0;
        this.stimSpeedMul = 1;
        this.flashTimer = 0;
    }

    update(dt, input, world, aimX, aimY) {
        const activeWorld = world || this.world;
        if (activeWorld) this.world = activeWorld;
        const a = input.axis();
        const len = Math.hypot(a.x, a.y);
        const ix = len ? a.x / len : 0; // diagonale pas plus rapide
        const iy = len ? a.y / len : 0;

        this.biome = (this.world?.sampleGround || sampleGround)(this.x, this.y).biome;
        this.inWater = isWater(this.biome);
        const speed = PLAYER.speed * (this.inWater ? PLAYER.waterFactor : 1) * (this.dbno ? 0.35 : this.speedMul) * (this.adminSpeedMul || 1);

        // Accélération douce
        const t = Math.min(1, dt * 14);
        this.vx += (ix * speed - this.vx) * t;
        this.vy += (iy * speed - this.vy) * t;

        this.x += this.vx * dt + (this.propelX || 0) * dt;
        this.y += this.vy * dt + (this.propelY || 0) * dt;
        this.propelX *= Math.max(0, 1 - dt * 4);
        this.propelY *= Math.max(0, 1 - dt * 4);

        // 2 passes : suffisant quand on frotte contre plusieurs obstacles
        this.resolveCollisions(world);
        this.resolveCollisions(world);

        this.x = clamp(this.x, this.r, (this.world?.width || 6000) - this.r);
        this.y = clamp(this.y, this.r, (this.world?.height || 6000) - this.r);

        this.moving = this.vx * this.vx + this.vy * this.vy > (this.dbno ? 150 : 900);
        if (this.moving) this.walkTime += dt * (speed / PLAYER.speed);

        // Si à terre (K.O.) : s'oriente dans le sens où il rampe à 4 pattes
        if (this.dbno) {
            if (len > 0.05) this.angle = Math.atan2(iy, ix);
        } else {
            this.angle = Math.atan2(aimY - this.y, aimX - this.x);
        }
    }

    resolveCollisions(world) {
        if (this.adminNoclip) return;
        const r = this.r;
        const near = world.collide.query(this.x - r - 4, this.y - r - 4, this.x + r + 4, this.y + r + 4, this._near);

        // 1V1 : frontière temporaire = demi-plan sur toute la carte (terre et eau).
        // On mémorise son camp : même un gros déplacement (grenade de propulsion)
        // ne peut pas faire passer de l'autre côté.
        const bd = world.duelBarrier;
        if (bd && bd.active) {
            const s = (this.x - bd.cx) * bd.tx + (this.y - bd.cy) * bd.ty;
            const min = bd.half + r;
            const side = this._barrierSide || (s < 0 ? -1 : 1);
            if (s * side < min) {
                const push = side * min - s;
                this.x += bd.tx * push;
                this.y += bd.ty * push;
            } else {
                this._barrierSide = side;
            }
        } else if (this._barrierSide) {
            this._barrierSide = 0;
        }

        for (let i = 0; i < near.length; i++) {
            const c = near[i];
            if (c.kind === 'circle') {
                const dx = this.x - c.x;
                const dy = this.y - c.y;
                const min = r + c.r;
                const d2 = dx * dx + dy * dy;
                if (d2 >= min * min) continue; // pas de contact : pas de racine carrée
                const d = Math.sqrt(d2);
                if (d > 0.0001) {
                    const push = (min - d) / d;
                    this.x += dx * push;
                    this.y += dy * push;
                }
            } else {
                // Mur rectangulaire : on repousse depuis le point du mur le plus proche
                const px = clamp(this.x, c.x, c.x + c.w);
                const py = clamp(this.y, c.y, c.y + c.h);
                const dx = this.x - px;
                const dy = this.y - py;
                const d2 = dx * dx + dy * dy;
                if (d2 >= r * r) continue;

                if (d2 > 0.0001) {
                    const d = Math.sqrt(d2);
                    const push = (r - d) / d;
                    this.x += dx * push;
                    this.y += dy * push;
                } else {
                    // Centre dans le mur : sortie par le côté le plus proche
                    const left = this.x - c.x;
                    const right = c.x + c.w - this.x;
                    const top = this.y - c.y;
                    const bottom = c.y + c.h - this.y;
                    const m = Math.min(left, right, top, bottom);
                    if (m === left) this.x = c.x - r;
                    else if (m === right) this.x = c.x + c.w + r;
                    else if (m === top) this.y = c.y - r;
                    else this.y = c.y + c.h + r;
                }
            }
        }
    }
}
