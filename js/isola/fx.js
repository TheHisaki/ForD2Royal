/* ==================================
   ISOLA - RENDU DES ARMES, DU BUTIN ET DES EFFETS
   - butin au sol : objet qui flotte et tourne sur un disque à la couleur de
     sa rareté (faisceau lumineux à partir de Rare), anneau de ramassage ;
   - traceurs des balles, flash au bout du canon (+ lumière), éclats d'impact,
     poussière en fin de portée, « + » de soin ;
   - chiffres de dégâts et barres de vie au-dessus des têtes (HTML projeté :
     texte net à toutes les tailles d'écran).
   Tout est recyclé (aucune allocation pendant les combats).
   ================================== */

import * as THREE from '../vendor/three/three.module.js';
import { buildGun, buildHeal, buildAmmo } from './items.js?v=1';
import { BULLET_HEIGHT, ISO_HEALS, AMMO_COLORS, rarityColor } from './arsenal.js?v=1';

const TAU = Math.PI * 2;
const MAX_TRACERS = 160;
const MAX_PARTS = 320;
const TRACER_LEN = 46;
const RING_SEGS = 28;
const VIEW_RANGE = 1500;   // animation du butin seulement près de la caméra

const basicCache = new Map();
function basic(color, opacity = 1, additive = false) {
    const k = `${color}|${opacity}|${additive}`;
    let m = basicCache.get(k);
    if (!m) {
        m = new THREE.MeshBasicMaterial({
            color,
            transparent: opacity < 1 || additive,
            opacity,
            depthWrite: false,
            blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
        });
        basicCache.set(k, m);
    }
    return m;
}

const DISK_GEO = new THREE.CircleGeometry(26, 24).rotateX(-Math.PI / 2);
const RING_GEO = new THREE.RingGeometry(23, 27.5, 32).rotateX(-Math.PI / 2);
const BEAM_GEO = new THREE.CylinderGeometry(9, 14, 150, 10, 1, true).translate(0, 75, 0);

/* ===================== BUTIN AU SOL ===================== */

export class LootView {
    constructor(scene) {
        this.scene = scene;
        this.list = [];
        // Anneau de ramassage : RING_SEGS segments, on n'affiche que ceux déjà remplis
        const seg = new THREE.RingGeometry(31, 38, 3, 1, 0, (TAU / RING_SEGS) * 0.78).rotateX(-Math.PI / 2);
        this.ring = new THREE.InstancedMesh(seg, basic('#ffe03d', 0.95), RING_SEGS);
        this.ring.renderOrder = 7;
        this.ring.frustumCulled = false;
        const d = new THREE.Object3D();
        for (let i = 0; i < RING_SEGS; i++) {
            d.rotation.set(0, (i / RING_SEGS) * TAU + Math.PI / 2, 0);
            d.updateMatrix();
            this.ring.setMatrixAt(i, d.matrix);
        }
        this.ring.count = 0;
        scene.add(this.ring);
    }

    add(it) {
        const g = new THREE.Group();
        const color = it.kind === 'weapon' ? rarityColor(it.rarity)
            : it.kind === 'heal' ? (ISO_HEALS[it.itemId]?.color || '#6fdc70')
                : (AMMO_COLORS[it.ammoType] || '#ffffff');
        const disk = new THREE.Mesh(DISK_GEO, basic(color, 0.26));
        disk.position.y = 1.4;
        disk.renderOrder = 3;
        const ring = new THREE.Mesh(RING_GEO, basic(color, 0.9));
        ring.position.y = 1.6;
        ring.renderOrder = 3;
        g.add(disk, ring);
        let model;
        let h;
        if (it.kind === 'weapon') {
            model = buildGun(it.weaponId, it.rarity);
            model.scale.setScalar(1.15);
            h = 20;
            if (it.rarity >= 2) {
                const beam = new THREE.Mesh(BEAM_GEO, basic(color, 0.16, true));
                beam.renderOrder = 4;
                g.add(beam);
            }
        } else if (it.kind === 'heal') {
            model = buildHeal(it.itemId);
            model.scale.setScalar(1.2);
            h = 16;
        } else {
            model = buildAmmo(color);
            h = 9;
        }
        g.add(model);
        g.position.set(it.x, 0, it.y);
        g.userData = { model, h };
        this.scene.add(g);
        it.view = g;
        this.list.push(it);
    }

    remove(it) {
        if (!it.view) return;
        this.scene.remove(it.view);
        it.view = null;
        const i = this.list.indexOf(it);
        if (i >= 0) this.list.splice(i, 1);
    }

    // progress : 0..1 de l'anneau autour de target (null = caché)
    update(time, cx, cz, target, progress) {
        const r2 = VIEW_RANGE * VIEW_RANGE;
        for (const it of this.list) {
            const g = it.view;
            const dx = it.x - cx;
            const dz = it.y - cz;
            const near = dx * dx + dz * dz < r2;
            g.visible = near;
            if (!near) continue;
            const { model, h } = g.userData;
            model.position.y = h + Math.sin(time * 2.4 + it.phase) * 3;
            model.rotation.y = time * 0.9 + it.phase;
        }
        if (target && progress > 0) {
            this.ring.count = Math.max(1, Math.round(progress * RING_SEGS));
            this.ring.position.set(target.x, 2.5, target.y);
        } else {
            this.ring.count = 0;
        }
    }
}

/* ===================== BALLES ET PARTICULES ===================== */

export class CombatFx {
    constructor(scene, camera, overlay) {
        this.scene = scene;
        this.camera = camera;
        this.overlay = overlay;
        this._d = new THREE.Object3D();
        this._v = new THREE.Vector3();
        this._c = new THREE.Color();

        // Traceurs
        this.tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(2.8, 2.8, 1), basic('#fff3a8'), MAX_TRACERS);
        this.tracers.frustumCulled = false;
        this.tracers.count = 0;
        this.tracers.renderOrder = 8;
        scene.add(this.tracers);

        // Particules (cubes colorés)
        this.parts = [];
        for (let i = 0; i < MAX_PARTS; i++) this.parts.push({ age: 1, life: 0, c: new THREE.Color() });
        this._head = 0;
        this.partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), MAX_PARTS);
        this.partMesh.frustumCulled = false;
        this.partMesh.count = 0;
        for (let i = 0; i < MAX_PARTS; i++) this.partMesh.setColorAt(i, this._c.set('#ffffff'));
        scene.add(this.partMesh);

        // Flashs de tir (étoile orange + cœur blanc), petite réserve recyclée
        this.flashes = [];
        const outer = new THREE.OctahedronGeometry(1, 0);
        for (let i = 0; i < 6; i++) {
            const g = new THREE.Group();
            const a = new THREE.Mesh(outer, basic('#ffb627', 0.95));
            a.scale.set(7, 7, 18);
            a.position.z = 10;
            const b = new THREE.Mesh(outer, basic('#ffffff'));
            b.scale.set(3.5, 3.5, 9);
            b.position.z = 8;
            g.add(a, b);
            g.visible = false;
            g.renderOrder = 9;
            scene.add(g);
            this.flashes.push({ g, t: 1 });
        }
        this._flashI = 0;
        // Lumière du flash (atténuation 1/d : ~2 au sol sous le canon, nulle à 380)
        this.light = new THREE.PointLight('#ffc860', 0, 380, 1);
        scene.add(this.light);
        this._lightT = 0;

        // Chiffres de dégâts et barres de vie (HTML)
        this.numbers = [];
        for (let i = 0; i < 36; i++) {
            const el = document.createElement('span');
            el.className = 'iso-dmg';
            el.hidden = true;
            overlay.appendChild(el);
            this.numbers.push({ el, age: 1, life: 0, x: 0, y: 0, z: 0, dx: 0 });
        }
        this._numI = 0;
        this.bars = new Map();
    }

    /* ----- Projection monde -> écran ----- */

    project(x, h, z) {
        const v = this._v.set(x, h, z).project(this.camera);
        return { sx: (v.x + 1) * 0.5 * innerWidth, sy: (1 - v.y) * 0.5 * innerHeight, on: v.z < 1 && v.z > -1 };
    }

    /* ----- Effets ponctuels ----- */

    _part(x, y, z, vx, vy, vz, life, size, color, grav = -900) {
        const p = this.parts[this._head];
        this._head = (this._head + 1) % MAX_PARTS;
        p.x = x; p.y = y; p.z = z;
        p.vx = vx; p.vy = vy; p.vz = vz;
        p.age = 0; p.life = life; p.size = size; p.grav = grav;
        p.rot = Math.random() * TAU;
        p.c.set(color);
        return p;
    }

    // (x, y) : position monde 2D ; angle : direction du tir
    muzzle(x, y, angle, big = false) {
        const f = this.flashes[this._flashI];
        this._flashI = (this._flashI + 1) % this.flashes.length;
        f.t = 0;
        f.big = big;
        f.g.visible = true;
        f.g.position.set(x, BULLET_HEIGHT, y);
        f.g.rotation.set(0, Math.atan2(Math.cos(angle), Math.sin(angle)), Math.random() * TAU);
        this.light.position.set(x, BULLET_HEIGHT + 20, y);
        this._lightT = big ? 0.09 : 0.06;
        this.light.intensity = big ? 220 : 140;
        // Fumée légère
        for (let i = 0; i < (big ? 4 : 1); i++) {
            const a = angle + (Math.random() - 0.5) * 0.8;
            const s = 40 + Math.random() * 60;
            this._part(x, BULLET_HEIGHT, y, Math.cos(a) * s, 20 + Math.random() * 20, Math.sin(a) * s, 0.45, 5, '#e3e6ec', 30);
        }
    }

    impact(x, y, angle, kind) {
        const back = angle + Math.PI;
        const colors = kind === 'shield' ? ['#7cc4ff', '#ffffff', '#4aa8ff']
            : kind === 'health' ? ['#ff5470', '#ffffff', '#ff8095']
                : ['#b7a98c', '#8f8574', '#d8cdb3'];
        const n = kind === 'wall' ? 6 : 8;
        for (let i = 0; i < n; i++) {
            const a = back + (Math.random() - 0.5) * 1.8;
            const s = 120 + Math.random() * 200;
            this._part(x, 38 + Math.random() * 20, y, Math.cos(a) * s, 120 + Math.random() * 220, Math.sin(a) * s,
                0.35 + Math.random() * 0.25, 2.5 + Math.random() * 2.5, colors[i % colors.length]);
        }
    }

    dust(x, y) {
        for (let i = 0; i < 3; i++) {
            const a = Math.random() * TAU;
            this._part(x, 6, y, Math.cos(a) * 40, 30, Math.sin(a) * 40, 0.4, 4, '#d8cdb3', 0);
        }
    }

    burst(x, y, color, n = 10) {
        for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU;
            this._part(x, 14, y, Math.cos(a) * 90, 160 + Math.random() * 120, Math.sin(a) * 90, 0.6, 4, color, -300);
        }
    }

    // « + » de soin qui montent autour du joueur
    healTick(x, y, shield) {
        const a = Math.random() * TAU;
        this._part(x + Math.cos(a) * 26, 30, y + Math.sin(a) * 26, 0, 90, 0, 0.7, 6, shield ? '#4aa8ff' : '#6fdc70', 0);
    }

    damageNumber(x, y, amount, { shield = false, crit = false } = {}) {
        const n = this.numbers[this._numI];
        this._numI = (this._numI + 1) % this.numbers.length;
        n.x = x + (Math.random() - 0.5) * 24;
        n.z = y;
        n.y = 140;   // au-dessus de la barre de vie
        n.age = 0;
        n.life = crit ? 1.05 : 0.85;
        n.dx = (Math.random() - 0.5) * 40;
        n.el.textContent = String(Math.max(1, Math.round(amount)));
        n.el.className = `iso-dmg${shield ? ' shield' : ''}${crit ? ' crit' : ''}`;
        n.el.hidden = false;
    }

    /* ----- Barres de vie au-dessus des têtes ----- */

    bar(entity, opts = {}) {
        if (this.bars.has(entity)) return;
        const el = document.createElement('div');
        el.className = `iso-hp${opts.self ? ' self' : ''}`;
        el.innerHTML = '<span class="iso-hp-shield"><i></i></span><span class="iso-hp-health"><i></i></span>';
        this.overlay.appendChild(el);
        const [s, h] = el.querySelectorAll('i');
        this.bars.set(entity, { el, s, h, height: opts.height || 112, last: '' });
    }

    /* ----- Mise à jour ----- */

    update(dt, bullets) {
        // Traceurs : du bout de la balle vers l'arrière
        const d = this._d;
        let n = 0;
        for (let i = 0; i < bullets.length && n < MAX_TRACERS; i++) {
            const b = bullets[i];
            const len = Math.min(TRACER_LEN, b.dist);
            if (len < 4) continue;
            d.position.set(b.x - b.ux * len * 0.5, BULLET_HEIGHT, b.y - b.uy * len * 0.5);
            d.rotation.set(0, Math.atan2(b.ux, b.uy), 0);
            d.scale.set(b.weaponId === 'shotgun' ? 0.8 : 1, 1, len);
            d.updateMatrix();
            this.tracers.setMatrixAt(n++, d.matrix);
        }
        this.tracers.count = n;
        this.tracers.instanceMatrix.needsUpdate = true;

        // Particules
        let colorDirty = false;
        let m = 0;
        for (let i = 0; i < MAX_PARTS; i++) {
            const p = this.parts[i];
            if (p.age >= p.life) continue;
            p.age += dt;
            if (p.age >= p.life) continue;
            p.vy += p.grav * dt;
            p.x += p.vx * dt;
            p.y = Math.max(1, p.y + p.vy * dt);
            p.z += p.vz * dt;
            if (p.y <= 1) { p.vx *= 0.6; p.vz *= 0.6; p.vy = 0; }
            p.rot += dt * 8;
            const t = p.age / p.life;
            const s = p.size * (1 - t * t);
            d.position.set(p.x, p.y, p.z);
            d.rotation.set(p.rot, p.rot * 0.7, 0);
            d.scale.setScalar(Math.max(0.01, s));
            d.updateMatrix();
            this.partMesh.setMatrixAt(m, d.matrix);
            this.partMesh.setColorAt(m, p.c);
            colorDirty = true;
            m++;
        }
        this.partMesh.count = m;
        this.partMesh.instanceMatrix.needsUpdate = true;
        if (colorDirty && this.partMesh.instanceColor) this.partMesh.instanceColor.needsUpdate = true;

        // Flashs
        for (const f of this.flashes) {
            if (!f.g.visible) continue;
            f.t += dt;
            const life = f.big ? 0.07 : 0.05;
            if (f.t >= life) { f.g.visible = false; continue; }
            const k = (f.big ? 1.5 : 1) * (1 - 0.4 * (f.t / life));
            f.g.scale.setScalar(k);
        }
        if (this._lightT > 0) {
            this._lightT -= dt;
            if (this._lightT <= 0) this.light.intensity = 0;
        }

        // Chiffres de dégâts : montent un peu, « pop » puis s'effacent
        for (const num of this.numbers) {
            if (num.age >= num.life) continue;
            num.age += dt;
            if (num.age >= num.life) { num.el.hidden = true; continue; }
            const t = num.age / num.life;
            const p = this.project(num.x, num.y + t * 40, num.z);
            if (!p.on) { num.el.hidden = true; continue; }
            const pop = num.age < 0.08 ? 0.6 + 5 * num.age : num.age < 0.2 ? 1.4 - 3.3 * (num.age - 0.08) : 1;
            const a = t > 0.65 ? 1 - ((t - 0.65) / 0.35) ** 2 : 1;
            num.el.hidden = false;
            num.el.style.opacity = a.toFixed(2);
            num.el.style.transform = `translate(${(p.sx + num.dx * t).toFixed(1)}px, ${p.sy.toFixed(1)}px) translate(-50%, -50%) scale(${pop.toFixed(2)})`;
        }
    }

    // Barres au-dessus des têtes (après la caméra)
    updateBars() {
        for (const [e, bar] of this.bars) {
            const show = e.alive && e.phase === 'ground' && e.showBar !== false;
            if (!show) {
                if (!bar.el.hidden) bar.el.hidden = true;
                continue;
            }
            const p = this.project(e.x, bar.height, e.y);
            if (!p.on) { bar.el.hidden = true; continue; }
            bar.el.hidden = false;
            bar.el.style.transform = `translate(${p.sx.toFixed(1)}px, ${p.sy.toFixed(1)}px) translate(-50%, -100%)`;
            const key = `${Math.round(e.shield)}|${Math.round(e.health)}`;
            if (key !== bar.last) {
                bar.last = key;
                bar.s.style.width = `${Math.max(0, Math.min(100, e.shield))}%`;
                bar.h.style.width = `${Math.max(0, Math.min(100, e.health))}%`;
                bar.el.classList.toggle('no-shield', e.shield <= 0);
            }
        }
    }
}
