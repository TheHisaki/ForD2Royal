/* ==================================
   ISOLA - BOTS SOLO
   IA légère pour le prototype 3D :
   - bots au sol, chacun avec une vraie instance Player ;
   - déplacement avec les collisions de l'île ;
   - ligne de vue contre murs, arbres, rochers et accessoires ;
   - tir via le même Arsenal que le joueur ;
   - loot, échanges d'armes et soins ;
   - rendu 3D avec les cosmétiques du catalogue.

   Les bots n'utilisent pas BotManager du mode 2D : celui-ci dépend du parachutage,
   du Combat 2D et des structures inventory/slot. ISOLA garde weapons/wslot/pouch.
   ================================== */

import * as THREE from '../vendor/three/three.module.js';
import { Player } from '../game/player.js?v=17';
import { Cosmetics } from '../cosmetics.js?v=10';
import { buildAvatar, loadoutFrom } from './skins.js?v=1';
import { buildGun } from './items.js?v=1';
import { equipFighter, ISO_WEAPONS, ISO_HEALS, ISO_WEAPON_IDS, ISO_HEAL_IDS } from './arsenal.js?v=1';

const TAU = Math.PI * 2;
const BOT_NAMES = [
    'PiouPiou', 'BaguetteTurbo', 'MisterPatate', 'FromageFou', 'PandaRoux',
    'LamaFâché', 'CapitaineFrite', 'Raclette2000', 'LootGoblin', 'BushCamper',
    'TurboEscargot', 'QuicheLorraine', 'Ch3vreDeGuerre', 'PixelPirate',
    'BananeFlash', 'NinjaDuDimanche'
];
const THINK_STEP = 0.24;
const SIGHT = 900;
const LOOT_RANGE = 900;
const AIM_ERROR = 0.09;
const TURN_SPEED = 7.5;
const STUCK_TIME = 1.6;
const BOT_MIN_SPAWN = 520;
const BOT_MIN_GAP = 260;
const BOT_TARGET_GAP = 90;
const BOT_SHOOT_GAP = 0.28;
const ENEMY_COLOR = '#ff6474';

function rand(min, max) { return min + Math.random() * (max - min); }
function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function angleDiff(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
}
function turnToward(a, b, step) {
    const d = angleDiff(a, b);
    return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
}

function pointSegmentDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const x = ax + t * dx;
    const y = ay + t * dy;
    return (px - x) ** 2 + (py - y) ** 2;
}

// Même logique de visibilité que le jeu 2D, sans importer ses dépendances graphiques.
function segmentClear(world, ax, ay, bx, by, pad = 0) {
    const inflate = Math.max(12.5, pad);
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    const list = world.collide.query(minX - inflate, minY - inflate, maxX + inflate, maxY + inflate, []);
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    for (const c of list) {
        if (c.kind === 'circle') {
            const r = c.r + pad;
            if (c.x + r < minX || c.x - r > maxX || c.y + r < minY || c.y - r > maxY) continue;
            if (pointSegmentDist2(c.x, c.y, ax, ay, bx, by) < r * r) return false;
        } else {
            const steps = Math.max(1, Math.ceil(length / 18));
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const x = ax + dx * t;
                const y = ay + dy * t;
                if (x > c.x - pad && x < c.x + c.w + pad && y > c.y - pad && y < c.y + c.h + pad) return false;
            }
        }
    }
    return true;
}

class BotInput {
    constructor() { this.x = 0; this.y = 0; }
    axis() { return this; }
}

function botLoadout(skin, pack, glider, pickaxe) {
    return loadoutFrom({
        equipped: skin,
        equippedOf(type) {
            if (type === 'backpack') return pack;
            if (type === 'glider') return glider;
            if (type === 'pickaxe') return pickaxe;
            return Cosmetics.equippedOf(type);
        }
    });
}

export class IsoBotManager {
    constructor({ world, player, fighters, arsenal, loot, scene, fx, xrayMaterial, count = 8 }) {
        this.world = world;
        this.player = player;
        this.fighters = fighters;
        this.arsenal = arsenal;
        this.loot = loot;
        this.scene = scene;
        this.fx = fx;
        this.xrayMaterial = xrayMaterial;
        this.bots = [];
        this.views = [];
        this.time = 0;
        this.spawned = 0;
        this.skins = Cosmetics.SKINS || [];
        this.packs = (Cosmetics.ITEMS || []).filter(i => i.type === 'backpack' && !i.none);
        this.gliders = (Cosmetics.ITEMS || []).filter(i => i.type === 'glider');
        this.pickaxes = (Cosmetics.ITEMS || []).filter(i => i.type === 'pickaxe');
        this.spawn(count);
    }

    findSpawn() {
        for (let tries = 0; tries < 800; tries++) {
            const x = rand(180, this.world.width - 180);
            const y = rand(180, this.world.height - 180);
            const ground = this.world.sampleGround(x, y);
            if (!ground || ground.biome === 0 || ground.biome === 1 || ground.biome === 8) continue;
            if (Math.hypot(x - this.player.x, y - this.player.y) < BOT_MIN_SPAWN) continue;
            if (this.bots.some(b => Math.hypot(x - b.x, y - b.y) < BOT_MIN_GAP)) continue;
            if (!this.loot.isFree(x, y, true)) continue;
            return { x, y };
        }
        return { x: this.world.width * 0.5 + rand(-700, 700), y: this.world.height * 0.5 + rand(-700, 700) };
    }

    makeLoadout(index) {
        const skin = this.skins[index % Math.max(1, this.skins.length)] || Cosmetics.equipped;
        const pack = this.packs.length && Math.random() < 0.65 ? pick(this.packs) : Cosmetics.equippedOf('backpack');
        const glider = this.gliders.length ? pick(this.gliders) : Cosmetics.equippedOf('glider');
        const pickaxe = this.pickaxes.length ? pick(this.pickaxes) : Cosmetics.equippedOf('pickaxe');
        return botLoadout(skin, pack, glider, pickaxe);
    }

    spawn(count) {
        const safeCount = Math.max(0, Math.min(16, Number(count) || 0));
        for (let i = 0; i < safeCount; i++) {
            const pos = this.findSpawn();
            const bot = new Player(pos.x, pos.y, this.world);
            bot.isBot = true;
            bot.id = `isola_bot_${i + 1}`;
            bot.name = BOT_NAMES[i % BOT_NAMES.length];
            bot.team = 100 + i;
            bot.phase = 'ground';
            bot.angle = Math.random() * TAU;
            equipFighter(bot);
            bot.loadout = this.makeLoadout(i);
            bot.colors = { ...bot.colors, ...bot.loadout.game };
            bot.skinStyle = bot.loadout.style;
            bot.health = 100;
            bot.shield = Math.random() < 0.35 ? 25 : 0;
            this.giveStarterGear(bot, i);
            this.fighters.push(bot);

            const avatar = buildAvatar(bot.loadout);
            const xray = buildAvatar(bot.loadout, this.xrayMaterial);
            avatar.root.scale.setScalar(1.12);
            xray.root.scale.setScalar(1.12);
            avatar.root.traverse(o => { o.renderOrder = 2; });
            xray.root.traverse(o => { o.renderOrder = 1; });
            this.scene.add(avatar.root, xray.root);
            this.fx.bar(bot, { height: 124 });
            const view = { avatar, xray, held: '', deadT: 0 };
            this.views.push(view);
            this.bots.push(bot);
            bot._isoView = view;
            bot._isoBrain = {
                input: new BotInput(),
                target: null,
                goal: null,
                think: Math.random() * THINK_STEP,
                roam: null,
                aim: bot.angle,
                trigger: rand(0.1, 0.5),
                strafe: Math.random() < 0.5 ? -1 : 1,
                strafeT: rand(0.6, 1.5),
                stuck: 0,
                sx: bot.x,
                sy: bot.y,
                lootT: 0,
                lootIgnore: new WeakSet(),
                reaction: 0
            };
            this.updateHeld(bot);
        }
    }

    giveStarterGear(bot, index) {
        const weaponId = ISO_WEAPON_IDS[index % ISO_WEAPON_IDS.length];
        const w = ISO_WEAPONS[weaponId];
        bot.weapons[0] = { weaponId, rarity: index % 5 === 0 ? 1 : 0, mag: w.magSize };
        bot.ammo[w.ammo] = w.ammo === 'shells' ? 15 : 60;
        if (Math.random() < 0.35) {
            const second = ISO_WEAPON_IDS[(index + 1) % ISO_WEAPON_IDS.length];
            const sw = ISO_WEAPONS[second];
            bot.weapons[1] = { weaponId: second, rarity: 0, mag: sw.magSize };
            bot.ammo[sw.ammo] = Math.max(bot.ammo[sw.ammo] || 0, sw.ammo === 'shells' ? 10 : 45);
        }
        bot.pouch.bandage = Math.random() < 0.65 ? 1 : 0;
        bot.pouch.shieldPotion = Math.random() < 0.3 ? 1 : 0;
        bot.pouch.medkit = Math.random() < 0.16 ? 1 : 0;
    }

    findTarget(bot) {
        let best = null;
        let bestD = SIGHT * SIGHT;
        for (const f of this.fighters) {
            if (f === bot || f.isDummy || !f.alive || f.phase !== 'ground') continue;
            if (f.team && bot.team && f.team === bot.team) continue;
            const d = (f.x - bot.x) ** 2 + (f.y - bot.y) ** 2;
            if (d >= bestD) continue;
            if (!segmentClear(this.world, bot.x, bot.y, f.x, f.y, 0)) continue;
            best = f;
            bestD = d;
        }
        return best;
    }

    chooseWeapon(bot, distance = Infinity) {
        let best = bot.wslot;
        let score = -1;
        for (let i = 0; i < bot.weapons.length; i++) {
            const it = bot.weapons[i];
            const w = it && ISO_WEAPONS[it.weaponId];
            if (!w) continue;
            const reserve = bot.ammo[w.ammo] || 0;
            if (it.mag <= 0 && reserve <= 0) continue;
            let s = (it.mag > 0 ? 2 : 0) + w.damage * (w.auto ? 1.5 : 1);
            if (w.id === 'shotgun') s *= distance < 300 ? 1.8 : 0.45;
            if (s > score) { score = s; best = i; }
        }
        if (best !== bot.wslot) this.arsenal.select(bot, best);
        return this.arsenal.heldStats(bot);
    }

    findHeal(bot) {
        if (bot.health > 65 && bot.shield > 45) return null;
        const order = bot.shield < 55 ? ['shieldPotion', 'medkit', 'bandage'] : ['medkit', 'bandage', 'shieldPotion'];
        return order.find(id => bot.pouch[id] > 0 && this.arsenal.healUseful(bot, id)) || null;
    }

    chooseLoot(bot) {
        const item = this.loot.nearest(bot, LOOT_RANGE);
        if (!item || bot._isoBrain.lootIgnore.has(item)) return null;
        const mode = this.loot.mode(bot, item);
        if (mode === 'take' && Math.hypot(item.x - bot.x, item.y - bot.y) < 58) {
            this.loot.take(bot, item);
            return null;
        }
        if (mode === 'swap' && Math.hypot(item.x - bot.x, item.y - bot.y) < 58 && item.kind === 'weapon') {
            this.loot.swap(bot, item);
            return null;
        }
        if (mode === 'full') bot._isoBrain.lootIgnore.add(item);
        return mode === 'take' || mode === 'swap' ? item : null;
    }

    think(bot, dt) {
        const br = bot._isoBrain;
        br.target = this.findTarget(bot);
        br.reaction = br.target ? Math.max(0, br.reaction - dt) : 0;
        const target = br.target;
        const distance = target ? Math.hypot(target.x - bot.x, target.y - bot.y) : Infinity;
        const w = this.chooseWeapon(bot, distance);

        if (!target) {
            const heal = this.findHeal(bot);
            if (heal) this.arsenal.startHeal(bot, heal);
        }
        if (!target && !bot.heal) {
            br.lootT -= dt;
            if (br.lootT <= 0) {
                br.lootT = 1.2;
                br.goal = this.chooseLoot(bot);
            }
            if (!br.goal || Math.hypot(br.goal.x - bot.x, br.goal.y - bot.y) < 70) {
                if (!br.roam || Math.hypot(br.roam.x - bot.x, br.roam.y - bot.y) < 100) br.roam = this.randomLandPoint(bot);
                br.goal = br.roam;
            }
        } else if (target) {
            br.goal = target;
        }
        if (w && target) {
            const desired = Math.atan2(target.y - bot.y, target.x - bot.x) + rand(-AIM_ERROR, AIM_ERROR);
            br.aim = turnToward(br.aim, desired, TURN_SPEED * dt);
        } else if (br.goal) {
            br.aim = turnToward(br.aim, Math.atan2(br.goal.y - bot.y, br.goal.x - bot.x), TURN_SPEED * dt);
        }
    }

    randomLandPoint(bot) {
        for (let i = 0; i < 24; i++) {
            const a = Math.random() * TAU;
            const d = rand(260, 900);
            const x = clamp(bot.x + Math.cos(a) * d, 100, this.world.width - 100);
            const y = clamp(bot.y + Math.sin(a) * d, 100, this.world.height - 100);
            const b = this.world.sampleGround(x, y).biome;
            if (b !== 0 && b !== 1 && b !== 8 && this.loot.isFree(x, y, true)) return { x, y };
        }
        return { x: this.world.width / 2, y: this.world.height / 2 };
    }

    updateBot(bot, dt, time) {
        const br = bot._isoBrain;
        if (!bot.alive) return;
        br.think -= dt;
        br.trigger -= dt;
        br.strafeT -= dt;
        if (br.think <= 0) {
            br.think += THINK_STEP + Math.random() * 0.1;
            this.think(bot, THINK_STEP);
        }
        if (br.strafeT <= 0) {
            br.strafe *= -1;
            br.strafeT = rand(0.7, 1.6);
        }

        let mx = 0;
        let my = 0;
        const t = br.target;
        if (t && t.alive) {
            const dx = t.x - bot.x;
            const dy = t.y - bot.y;
            const d = Math.hypot(dx, dy) || 1;
            const ux = dx / d;
            const uy = dy / d;
            const w = this.arsenal.heldStats(bot);
            const preferred = w?.id === 'shotgun' ? 180 : 330;
            const radial = clamp((d - preferred) / 140, -1, 1);
            mx = ux * radial - uy * br.strafe * 0.62;
            my = uy * radial + ux * br.strafe * 0.62;
            if (w && d <= w.range && br.trigger <= 0 && Math.abs(angleDiff(bot.angle, br.aim)) < 0.32 && !bot.heal) {
                this.arsenal.tryFire(bot, true);
                br.trigger = w.auto ? rand(0.08, 0.22) : BOT_SHOOT_GAP + rand(0, 0.3);
            }
            if (w && d > w.range * 0.92 && bot.reloadTimer <= 0 && bot.ammo[w.ammo] > 0) this.arsenal.reload(bot);
        } else if (br.goal && !bot.heal) {
            const dx = br.goal.x - bot.x;
            const dy = br.goal.y - bot.y;
            const d = Math.hypot(dx, dy) || 1;
            mx = dx / d;
            my = dy / d;
        }

        // Antennes simples : tester plusieurs directions libres pour contourner un mur.
        const len = Math.hypot(mx, my);
        if (len > 0.01) {
            const a = Math.atan2(my, mx);
            const options = [0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7];
            let steer = null;
            for (const off of options) {
                const aa = a + off;
                const ex = bot.x + Math.cos(aa) * 90;
                const ey = bot.y + Math.sin(aa) * 90;
                if (segmentClear(this.world, bot.x, bot.y, ex, ey, bot.r * 0.6)) { steer = aa; break; }
            }
            if (steer !== null) { mx = Math.cos(steer); my = Math.sin(steer); }
        }
        br.input.x = mx;
        br.input.y = my;
        const aimX = bot.x + Math.cos(br.aim) * 100;
        const aimY = bot.y + Math.sin(br.aim) * 100;
        bot.update(dt, br.input, this.world, aimX, aimY);

        br.stuck += dt;
        if (br.stuck > STUCK_TIME) {
            const moved = Math.hypot(bot.x - br.sx, bot.y - br.sy);
            if (moved < 35 && len > 0.05) br.roam = null;
            br.stuck = 0;
            br.sx = bot.x;
            br.sy = bot.y;
        }
        this.updateView(bot, time);
    }

    updateHeld(bot) {
        const view = bot._isoView;
        const it = this.arsenal.held(bot);
        const key = it ? `${it.weaponId}|${it.rarity}` : '';
        if (key === view.held) return;
        view.held = key;
        view.avatar.mount.clear();
        view.xray.mount.clear();
        if (!it) return;
        const gun = buildGun(it.weaponId, it.rarity);
        gun.traverse(o => { o.renderOrder = 2; });
        view.avatar.mount.add(gun);
        const ghost = buildGun(it.weaponId, it.rarity, this.xrayMaterial);
        ghost.traverse(o => { o.renderOrder = 1; });
        view.xray.mount.add(ghost);
    }

    updateView(bot, time) {
        const view = bot._isoView;
        const visible = bot.alive && bot.phase === 'ground';
        view.avatar.root.visible = visible;
        view.xray.root.visible = visible;
        if (!visible) return;
        this.updateHeld(bot);
        const aiming = Boolean(this.arsenal.held(bot)) && !bot.heal;
        for (const a of [view.avatar, view.xray]) {
            a.root.position.set(bot.x, 0, bot.y);
            a.root.rotation.y = Math.PI / 2 - bot.angle;
            a.pose(bot.walkTime * 11, bot.moving, false, aiming);
            a.animate(time);
            a.mount.visible = aiming;
        }
    }

    onKill(bot) {
        if (!bot?.isBot) return;
        const view = bot._isoView;
        if (view) {
            view.avatar.root.visible = false;
            view.xray.root.visible = false;
        }
        // Le loot du bot reste sur place comme dans un battle royale.
        for (const it of bot.weapons) {
            if (it) this.loot.spawn({ kind: 'weapon', weaponId: it.weaponId, rarity: it.rarity, mag: it.mag }, bot.x + rand(-24, 24), bot.y + rand(-24, 24));
        }
        for (const type of Object.keys(bot.ammo)) {
            if (bot.ammo[type] > 0) this.loot.spawn({ kind: 'ammo', ammoType: type, amount: bot.ammo[type] }, bot.x + rand(-30, 30), bot.y + rand(-30, 30));
        }
        for (const id of ISO_HEAL_IDS) {
            if (bot.pouch[id] > 0) this.loot.spawn({ kind: 'heal', itemId: id, count: bot.pouch[id] }, bot.x + rand(-32, 32), bot.y + rand(-32, 32));
        }
    }

    update(dt, time) {
        this.time = time;
        for (const bot of this.bots) this.updateBot(bot, dt, time);
    }
}

export { segmentClear };
