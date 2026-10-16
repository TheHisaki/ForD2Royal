/* ==================================
   NEXUS - HÉROS 5V5 (Contrôle)
   1. Sélection du héros (file par rôle, comme Overwatch).
   2. Partie au Sanctuaire de Kaïro : capture du point, pouvoirs, bots,
      manches au meilleur des 3.
   ================================== */

import { HERO_BY_ID, ROLES } from './heroes.js?v=4';
import { drawPortrait } from './sprites.js?v=3';
import { KAIRO, buildMapLayers, placeAt } from './map.js?v=2';
import { HeroSelect } from './select.js?v=5';
import { Game, RULES } from './game.js?v=4';
import { BotBrain } from './bots.js?v=3';
import { renderGame } from './render.js?v=3';
import { NexusAudio } from './audio.js?v=2';

// Sons d'interface (non spatialisés)
const SFX = { play: (name, opts = {}) => NexusAudio.play(name, { ...opts, ui: true }) };

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const STEP = 1 / 60;

// Même source que le lobby et le jeu 2D
function playerName() {
    try {
        const name = window.FOR2D_PROGRESS?.name || localStorage.getItem('for2d-player-name');
        if (name) return String(name).slice(0, 16);
    } catch { /* ignore */ }
    return 'Toi';
}

/* ----- Touches (positions physiques, comme Overwatch) ----- */

// L'ultime est sur la touche physique « Q » d'un clavier QWERTY (« A » en AZERTY)
const KEY_LABELS = { KeyQ: 'Q', KeyE: 'E', KeyR: 'R', KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D' };
async function loadKeyLabels() {
    try {
        const map = await navigator.keyboard?.getLayoutMap?.();
        if (!map) return;
        for (const code of Object.keys(KEY_LABELS)) {
            const ch = map.get(code);
            if (ch) KEY_LABELS[code] = ch.toUpperCase();
        }
    } catch { /* API absente : on garde les lettres QWERTY */ }
}
export function keyLabel(key) {
    if (key === 'Q') return KEY_LABELS.KeyQ;
    if (key === 'E') return KEY_LABELS.KeyE;
    return key;
}
function moveLabel() {
    return `${KEY_LABELS.KeyW}${KEY_LABELS.KeyA}${KEY_LABELS.KeyS}${KEY_LABELS.KeyD}`;
}

/* ----- Partie ----- */

class Match {
    constructor() {
        this.root = $('nxGame');
        this.canvas = $('nxCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.map = KAIRO;
        this.layers = buildMapLayers(this.map);
        this.keys = new Set();
        this.mouse = { x: innerWidth / 2, y: innerHeight / 2, left: false, right: false };
        this.pending = {};
        this.zoom = 1;
        this.overview = false;
        this.running = false;
        this.cam = { x: this.map.width / 2, y: this.map.height / 2, scale: 0.5 };
        this.bindInput();
        addEventListener('resize', () => this.resize());
    }

    bindInput() {
        addEventListener('keydown', (e) => {
            if (!this.running) return;
            if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
            this.keys.add(e.code);
            if (e.repeat) return;
            if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.pending.shift = true;
            if (e.code === 'KeyE') this.pending.e = true;
            if (e.code === 'KeyQ') this.pending.q = true;
            if (e.code === 'KeyR') this.pending.reload = true;
            if (e.code === 'Tab') this.showBoard(true);
            if (e.code === 'KeyH') this.toggleSwap();
            if (e.code === 'Escape' && this.swapOpen) this.closeSwap();
        });
        addEventListener('keyup', (e) => {
            this.keys.delete(e.code);
            if (e.code === 'Tab') this.showBoard(false);
        });
        addEventListener('blur', () => {
            this.keys.clear();
            this.mouse.left = this.mouse.right = false;
            this.showBoard(false);
        });
        this.canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) { this.mouse.left = true; this.pending.firePressed = true; }
            if (e.button === 2) { this.mouse.right = true; this.pending.fire2Pressed = true; }
        });
        addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.left = false;
            if (e.button === 2) this.mouse.right = false;
        });
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        // Zoom bloqué : la molette ne fait rien (et ne fait pas défiler la page)
        this.canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
    }

    start({ allies, enemies }) {
        this.game = new Game({ map: this.map, allies, enemies, events: this.events() });
        this.me = this.game.player;
        this.bots = new BotBrain(this.game);
        this.acc = 0;
        this.endShown = false;
        this.hurtFlash = 0;
        this.buildHud();
        $('nxFeed').innerHTML = '';
        this.closeSwap();
        $('nxEnd').hidden = true;
        this.root.hidden = false;
        this.resize();
        this.cam = { x: this.me.x, y: this.me.y, scale: this.followScale() };
        this.running = true;
        const token = (this.token = {});
        let last = performance.now();
        const loop = (now) => {
            if (!this.running || this.token !== token) return;
            const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
            last = now;
            this.frame(dt);
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    stop() {
        this.running = false;
        NexusAudio.stopAll();
        this.root.hidden = true;
        this.keys.clear();
        this.showBoard(false);
    }

    resize() {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        this.dpr = dpr;
        this.canvas.width = Math.round(innerWidth * dpr);
        this.canvas.height = Math.round(innerHeight * dpr);
        this.canvas.style.width = `${innerWidth}px`;
        this.canvas.style.height = `${innerHeight}px`;
    }

    // Vue rapprochée et fixe : environ 760 unités visibles sur le plus petit côté de l'écran
    followScale() { return Math.min(this.canvas.width, this.canvas.height) / 760; }

    screenToWorld(sx, sy) {
        const { x, y, scale } = this.cam;
        return {
            x: x + (sx * this.dpr - this.canvas.width / 2) / scale,
            y: y + (sy * this.dpr - this.canvas.height / 2) / scale
        };
    }

    /* ----- Évènements de la partie ----- */

    events() {
        return {
            onRoundStart: (n) => {
                this.banner(`MANCHE ${n}`, `Le point se déverrouille dans ${RULES.pointLock} s`, 'neutral');
                this.toast('Point verrouillé : préparez-vous devant le point');
                this.lastTick = null;
                SFX.play('whoosh');
            },
            onPointUnlocked: () => {
                this.banner('POINT DÉVERROUILLÉ', 'Prenez le contrôle du point !', 'neutral');
                SFX.play('pointUnlock');
            },
            onCapture: (team) => {
                const ours = team === this.me.team;
                this.banner(ours ? 'POINT CAPTURÉ' : 'POINT PERDU', ours ? 'Défendez le point !' : 'Reprenez le point !', ours ? 'good' : 'bad');
                SFX.play(ours ? 'captureAlly' : 'captureEnemy');
            },
            onOvertime: () => {
                this.banner('PROLONGATION', 'Restez sur le point !', 'warn');
                SFX.play('overtime');
            },
            onRoundEnd: (team, over) => {
                const ours = team === this.me.team;
                if (!over) {
                    this.banner(ours ? 'MANCHE GAGNÉE' : 'MANCHE PERDUE', `${this.game.roundsWon[this.me.team]} - ${this.game.roundsWon[this.me.team === 'blue' ? 'red' : 'blue']}`, ours ? 'good' : 'bad');
                    SFX.play(ours ? 'roundWin' : 'roundLose');
                }
            },
            onMatchEnd: (team) => {
                const ours = team === this.me.team;
                this.banner(ours ? 'VICTOIRE' : 'DÉFAITE', '', ours ? 'good' : 'bad');
                SFX.play(ours ? 'roundWin' : 'roundLose');
                setTimeout(() => this.showEnd(ours), 2600);
            },
            onKill: (killer, victim, how) => {
                this.addFeed(killer, victim, how);
                if (killer === this.me && victim !== this.me) { this.toast(`Élimination : ${victim.name}`); SFX.play('kill'); }
                if (victim === this.me) { this.deathBy = killer; SFX.play('death'); this.addShake(0.6); }
                else if (victim.team === this.me.team) SFX.play('allyDeath', { vol: 0.7 });
            },
            onRespawn: (f) => { if (f === this.me) SFX.play('respawn'); },
            onUltReady: (f) => {
                if (f !== this.me) return;
                SFX.play('ultReady');
                this.toast('Capacité ultime prête !');
            },
            onHeal: (target, src) => {
                if (target === this.me || src === this.me) NexusAudio.play('healTick', { x: target.x, y: target.y, src: target.id });
            },
            onExplode: (x, y, r, big) => {
                const d = Math.hypot(x - this.me.x, y - this.me.y);
                if (d < 900) this.addShake((big ? 1 : r / 260) * (1 - d / 900));
            },
            onShake: (x, y, power) => {
                const d = Math.hypot(x - this.me.x, y - this.me.y);
                if (d < 1000) this.addShake(power * (1 - d / 1000));
            },
            onStuck: (target) => {
                if (target === this.me) { this.toast('Une bombe est collée sur toi !'); this.addShake(0.4); }
            },
            onMechDown: (f) => { if (f === this.me) this.toast('Méca détruit ! Rappelle-le avec l\'ultime'); },
            onRevive: (target, src) => {
                this.addFeed(src, target, 'Résurrection', true);
                if (target === this.me) this.toast(`${src?.name || 'Un allié'} t'a ressuscité !`);
            },
            onDamage: (target, dmg, src) => {
                if (src === this.me && target !== this.me) {
                    this.game.addEffect({ type: 'number', x: target.x + (Math.random() - 0.5) * 20, y: target.y, text: String(Math.round(dmg)), color: dmg >= 100 ? '#ff5a5a' : '#ffffff', big: dmg >= 100, life: 0.7 });
                    if (!this.hitT || this.game.time - this.hitT > 0.06) { SFX.play(dmg >= 100 ? 'critHit' : 'hitmarker'); this.hitT = this.game.time; }
                    this.hitmark = 0.15;
                }
                if (target === this.me) {
                    this.hurtFlash = Math.min(1, this.hurtFlash + dmg / 120);
                    if (!this.hurtT || this.game.time - this.hurtT > 0.18) { SFX.play('hurt', { vol: Math.min(1, 0.4 + dmg / 80) }); this.hurtT = this.game.time; }
                    if (dmg >= 60) this.addShake(Math.min(0.7, dmg / 300));
                }
            },
            onUlt: (f) => {
                const h = HERO_BY_ID[f.heroId];
                const ult = h.abilities.find(a => a.ult)?.name || 'Ultime';
                this.addFeed(f, null, ult, f.team === this.me.team);
                if (f !== this.me) SFX.play(f.team === this.me.team ? 'ultAlly' : 'ultEnemy', { vol: 0.8 });
            },
            onHint: (text) => this.toast(text),
            onHeroChange: (nf, old) => {
                if (nf.isPlayer) return; // le joueur est géré par swapTo()
                this.buildHud();
                if (nf.team === this.me.team) this.addFeed(nf, null, `→ ${nf.hero.name}`, true);
            }
        };
    }

    /* ----- Boucle ----- */

    frame(dt) {
        const g = this.game;
        this.acc = Math.min(this.acc + dt, 0.25);
        while (this.acc >= STEP) {
            this.acc -= STEP;
            this.readInput();
            this.bots.update(STEP);
            g.update(STEP);
        }
        this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);
        this.hitmark = Math.max(0, (this.hitmark || 0) - dt);
        this.updateCamera(dt);
        this.updateAudio();
        // Tremblement d'écran (décroît vite)
        this.shake = Math.max(0, (this.shake || 0) - dt * 2.2);
        const s = this.shake * this.shake * 26;
        const shake = { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s };
        renderGame(this.ctx, g, this.layers, this.cam, this.me.team, this.me, this.dpr, shake);
        this.drawCrosshair();
        this.updateHud();
    }

    addShake(power) {
        this.shake = Math.min(1.2, (this.shake || 0) + power);
    }

    // Position d'écoute + boucles sonores continues (rayons, matrice, capture…)
    updateAudio() {
        const g = this.game;
        const me = this.me;
        // On écoute depuis le centre de l'écran : ce qui est hors de l'écran s'entend à peine
        NexusAudio.setListener(this.cam.x, this.cam.y, this.canvas.width / 2 / this.cam.scale, this.canvas.height / 2 / this.cam.scale);
        const loops = [];
        for (const f of g.fighters) {
            if (!f.alive) continue;
            if (f.beam) loops.push({ id: `beam${f.id}`, kind: f.beam.mode === 'heal' ? 'healBeam' : 'ampBeam', x: f.x, y: f.y });
            if (f.matrix?.on) loops.push({ id: `matrix${f.id}`, kind: 'matrix', x: f.x, y: f.y });
            if (f.boosting) loops.push({ id: `boost${f.id}`, kind: 'boost', x: f.x, y: f.y });
            if (f.charging) loops.push({ id: `charge${f.id}`, kind: 'charge', x: f.x, y: f.y });
            if (f.teslaFiring) loops.push({ id: `tesla${f.id}`, kind: 'tesla', x: f.x, y: f.y });
            if (f.spray) loops.push({ id: `spray${f.id}`, kind: 'spray', x: f.x, y: f.y });
            if (f.drain) loops.push({ id: `drain${f.id}`, kind: 'drain', x: f.x, y: f.y });
            if (f.coal) loops.push({ id: `coal${f.id}`, kind: 'coal', x: f.x, y: f.y });
            if (f.heroId === 'nox' && f.ultActive) loops.push({ id: `blossom${f.id}`, kind: 'blossom', x: f.x, y: f.y });
            if (f.heroId === 'tempo') loops.push({ id: `aura${f.id}`, kind: 'aura', x: f.x, y: f.y, vol: f === me ? 1 : 0.5, speed: f.track === 'speed', boost: f.boostT > 0 });
        }
        for (const o of g.objects) {
            if (o.kind === 'tire') loops.push({ id: `tire${o.owner.id}`, kind: 'tire', x: o.x, y: o.y });
            if (o.kind === 'mechBomb') loops.push({ id: `bomb${o.owner.id}`, kind: 'mechBomb', x: o.x, y: o.y, fuse: o.fuse });
        }
        const p = g.map.point;
        if (g.phase === 'live') {
            if (g.contested) loops.push({ id: 'contested', kind: 'contested', x: p.x, y: p.y, vol: g.onPoint(me) ? 1 : 0.5 });
            else if (g.progress.value > 0 && g.progress.team) loops.push({ id: 'capture', kind: 'capture', x: p.x, y: p.y, progress: g.progress.value, vol: g.onPoint(me) ? 1.2 : 0.6 });
        }
        NexusAudio.updateLoops(this.running ? loops : []);
        // Décompte des 3 dernières secondes avant le déverrouillage
        if (g.phase === 'setup') {
            const n = Math.ceil(g.lockLeft);
            if (n <= 3 && n >= 1 && n !== this.lastTick) { this.lastTick = n; SFX.play('countdown', { final: false }); }
        }
    }

    readInput() {
        const inp = this.me.input;
        const k = this.keys;
        inp.mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
        inp.my = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
        const aim = this.screenToWorld(this.mouse.x, this.mouse.y);
        inp.ax = aim.x; inp.ay = aim.y;
        inp.fire = this.mouse.left;
        inp.fire2 = this.mouse.right;
        const p = this.pending;
        if (p.firePressed) inp.firePressed = true;
        if (p.fire2Pressed) inp.fire2Pressed = true;
        if (p.shift) inp.shift = true;
        if (p.e) inp.e = true;
        if (p.q) inp.q = true;
        if (p.reload) inp.reload = true;
        this.pending = {};
    }

    updateCamera(dt) {
        const g = this.game;
        const W = this.canvas.width, H = this.canvas.height;
        const fit = Math.min(W / this.map.width, H / this.map.height) * 0.94;
        let fx = this.me.x, fy = this.me.y;
        if (this.me.tire) { fx = this.me.tire.x; fy = this.me.tire.y; }
        if (!this.me.alive) {
            // Mort : on regarde ce qui se passe sur le point
            fx = g.map.point.x; fy = g.map.point.y;
        }
        let target = { x: fx, y: fy, scale: Math.max(this.followScale(), fit) };
        if (g.phase === 'matchEnd') target = { x: this.map.width / 2, y: this.map.height / 2, scale: fit };
        else {
            // Petit décalage vers la souris pour voir un peu devant soi
            const mx = (this.mouse.x * this.dpr - W / 2) / target.scale, my = (this.mouse.y * this.dpr - H / 2) / target.scale;
            if (this.me.alive) { target.x += mx * 0.12; target.y += my * 0.12; }
            const hw = W / 2 / target.scale, hh = H / 2 / target.scale;
            target.x = hw * 2 >= this.map.width ? this.map.width / 2 : Math.max(hw, Math.min(this.map.width - hw, target.x));
            target.y = hh * 2 >= this.map.height ? this.map.height / 2 : Math.max(hh, Math.min(this.map.height - hh, target.y));
        }
        const a = Math.min(1, dt * 9);
        this.cam.x += (target.x - this.cam.x) * a;
        this.cam.y += (target.y - this.cam.y) * a;
        this.cam.scale += (target.scale - this.cam.scale) * a;
    }

    drawCrosshair() {
        const ctx = this.ctx;
        const d = this.dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // Vignette rouge quand on prend des dégâts
        if (this.hurtFlash > 0) {
            const W = this.canvas.width, H = this.canvas.height;
            const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
            g.addColorStop(0, 'rgba(255,0,40,0)');
            g.addColorStop(1, `rgba(255,0,40,${0.45 * this.hurtFlash})`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);
        }
        const mx = this.mouse.x * d, my = this.mouse.y * d;
        ctx.lineWidth = 2 * d;
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath(); ctx.arc(mx, my, 10 * d, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(mx, my, 1.8 * d, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
        if (this.hitmark > 0) {
            ctx.strokeStyle = '#ff4d5a';
            ctx.lineWidth = 3 * d;
            for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
                ctx.beginPath();
                ctx.moveTo(mx + sx * 8 * d, my + sy * 8 * d);
                ctx.lineTo(mx + sx * 15 * d, my + sy * 15 * d);
                ctx.stroke();
            }
        }
        // Rechargement
        const me = this.me;
        if (me.alive && me.reloadT > 0) {
            ctx.beginPath();
            ctx.arc(mx, my, 16 * d, -Math.PI / 2, -Math.PI / 2 + (1 - me.reloadT / me.reloadTime) * TAU);
            ctx.strokeStyle = '#ffe03d';
            ctx.lineWidth = 3 * d;
            ctx.stroke();
        }
    }

    /* ----- Changement de héros ----- */

    toggleSwap() {
        if (this.swapOpen) this.closeSwap();
        else this.openSwap();
    }

    openSwap() {
        const g = this.game;
        if (!this.running || !g) return;
        if (!g.canSwap(this.me)) {
            this.toast('Tu peux changer de héros quand tu es mort ou dans ta base');
            return;
        }
        const role = ROLES[this.me.role];
        $('nxSwapSub').textContent = `Rôle : ${role.name} · tu gardes 30 % de ta charge d'ultime · ${this.me.alive ? 'tu restes dans ta base' : 'tu réapparais avec le nouveau héros'}`;
        const list = $('nxSwapList');
        list.replaceChildren();
        for (const c of g.swapChoices(this.me)) {
            const h = HERO_BY_ID[c.id];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `nx-tile ${c.current ? 'is-current is-selected' : ''} ${c.taken ? 'is-unavailable is-taken' : ''}`;
            btn.disabled = c.taken || c.current;
            btn.innerHTML = `<canvas width="120" height="120"></canvas><span class="nx-tile-name">${h.name}</span><span class="nx-tile-taken">${c.current ? 'Actuel' : c.taken ? 'Pris' : ''}</span>`;
            drawPortrait(btn.querySelector('canvas'), h.id, { roleColor: role.color, zoom: 1.05 });
            btn.addEventListener('click', () => this.swapTo(c.id));
            list.appendChild(btn);
        }
        $('nxSwap').hidden = false;
        this.swapOpen = true;
        SFX.play('whoosh');
    }

    closeSwap() {
        $('nxSwap').hidden = true;
        this.swapOpen = false;
    }

    swapTo(heroId) {
        const nf = this.game.changeHero(this.me, heroId);
        this.closeSwap();
        if (!nf) { this.toast('Changement impossible maintenant'); return; }
        this.me = nf;
        this.buildHud();
        SFX.play('respawn');
        this.toast(`Tu joues maintenant ${nf.hero.name}`);
    }

    /* ----- HUD ----- */

    buildHud() {
        const me = this.me;
        const h = HERO_BY_ID[me.heroId];
        const role = ROLES[h.role];
        drawPortrait($('nxHudPortrait'), h.id, { roleColor: role.color, zoom: 1.05 });
        $('nxHudName').textContent = h.name.toUpperCase();
        $('nxHudRole').textContent = role.name;
        $('nxHudRole').className = `nx-hud-role role-${h.role}`;
        $('nxUltName').textContent = h.abilities.find(a => a.ult)?.name || 'Ultime';
        $('nxUltKey').textContent = keyLabel('Q');
        $('nxKeys').innerHTML = `<kbd>${moveLabel()}</kbd> Bouger · <kbd>Clic G</kbd>/<kbd>Clic D</kbd> Tir · <kbd>Maj</kbd> <kbd>${keyLabel('E')}</kbd> Capacités · <kbd>${keyLabel('Q')}</kbd> Ultime · <kbd>R</kbd> Recharger · <kbd>TAB</kbd> Scores`;
        const team = (side) => this.game.fighters.filter(f => (side === 'mine') === (f.team === me.team)).map(f =>
            `<li class="role-${f.role} ${f === me ? 'is-me' : ''}" data-id="${f.id}" title="${f.name} · ${f.hero.name}"><canvas width="56" height="56" data-hero="${f.heroId}"></canvas><span class="nx-dead-t"></span></li>`
        ).join('');
        $('nxHudBlue').innerHTML = team('mine');
        $('nxHudRed').innerHTML = team('theirs');
        for (const c of document.querySelectorAll('#nxHudBlue canvas, #nxHudRed canvas')) {
            const hh = HERO_BY_ID[c.dataset.hero];
            drawPortrait(c, hh.id, { roleColor: ROLES[hh.role].color, zoom: 1.1 });
        }
        this.portraitEls = [...document.querySelectorAll('#nxHudBlue li, #nxHudRed li')].map(li => ({ li, id: Number(li.dataset.id), t: li.querySelector('.nx-dead-t') }));
        this.hudCache = {};
    }

    banner(title, sub, tone) {
        const el = $('nxBanner');
        el.className = `nx-banner tone-${tone}`;
        el.innerHTML = `<strong>${title}</strong>${sub ? `<span>${sub}</span>` : ''}`;
        el.hidden = false;
        void el.offsetWidth;
        el.classList.add('is-pop');
        clearTimeout(this.bannerTimer);
        this.bannerTimer = setTimeout(() => { el.hidden = true; }, 2600);
    }

    toast(text) {
        const el = $('nxToast');
        el.textContent = text;
        el.hidden = false;
        el.classList.remove('is-pop');
        void el.offsetWidth;
        el.classList.add('is-pop');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
    }

    addFeed(killer, victim, how, friendly) {
        const el = $('nxFeed');
        const side = (f) => !f ? '' : f.team === this.me.team ? 'is-ally' : 'is-enemy';
        const name = (f) => f ? `<b class="${side(f)} ${f === this.me ? 'is-me' : ''}">${f.name}</b>` : '';
        const row = document.createElement('li');
        if (!victim) row.innerHTML = `${name(killer)}<em class="${friendly ? 'is-ally' : 'is-enemy'}">${how} !</em>`;
        else if (how === 'Résurrection') row.innerHTML = `${name(killer)}<em class="is-ally">✚ ressuscite</em>${name(victim)}`;
        else row.innerHTML = `${killer ? name(killer) : ''}<em>${how || '✖'}</em>${name(victim)}`;
        el.prepend(row);
        while (el.children.length > 6) el.lastChild.remove();
        setTimeout(() => row.remove(), 7000);
    }

    setText(id, text) {
        if (this.hudCache[id] === text) return;
        this.hudCache[id] = text;
        $(id).textContent = text;
    }

    updateHud() {
        const g = this.game;
        const me = this.me;
        const mine = me.team, theirs = mine === 'blue' ? 'red' : 'blue';

        // Objectif
        this.setText('nxPctBlue', `${Math.floor(g.score[mine])}%`);
        this.setText('nxPctRed', `${Math.floor(g.score[theirs])}%`);
        $('nxScoreBlue').classList.toggle('is-owner', g.owner === mine);
        $('nxScoreRed').classList.toggle('is-owner', g.owner === theirs);
        this.pips('nxRoundsBlue', g.roundsWon[mine]);
        this.pips('nxRoundsRed', g.roundsWon[theirs]);
        const icon = $('nxPointIcon');
        let state, sub;
        if (g.phase === 'setup') {
            state = `DÉVERROUILLAGE · 0:${String(Math.ceil(g.lockLeft)).padStart(2, '0')}`;
            sub = `Manche ${g.round} · au meilleur des 3`;
        } else if (g.phase === 'roundEnd' || g.phase === 'matchEnd') {
            state = g.roundWinner === mine ? 'MANCHE GAGNÉE' : 'MANCHE PERDUE';
            sub = `${g.roundsWon[mine]} - ${g.roundsWon[theirs]}`;
        } else if (g.overtime) {
            state = 'PROLONGATION';
            sub = 'Restez sur le point !';
        } else if (g.contested) {
            state = 'CONTESTÉ';
            sub = `${g.count?.[mine] || 0} contre ${g.count?.[theirs] || 0}`;
        } else if (g.progress.team && g.progress.value > 0) {
            state = g.progress.team === mine ? `CAPTURE ${Math.floor(g.progress.value)}%` : `L'ENNEMI CAPTURE ${Math.floor(g.progress.value)}%`;
            const n = g.count?.[mine] || 0;
            sub = g.progress.team === mine ? (n ? `${n} sur le point` : 'Retournez sur le point !') : 'Allez sur le point !';
        } else if (g.owner) {
            state = g.owner === mine ? 'POINT CONTRÔLÉ' : 'POINT ENNEMI';
            sub = g.owner === mine ? 'Défendez le point' : 'Reprenez le point !';
        } else {
            state = 'POINT NEUTRE';
            sub = 'Capturez le point !';
        }
        this.setText('nxPointState', state);
        this.setText('nxPointSub', sub);
        icon.classList.toggle('is-locked', g.phase === 'setup');
        icon.classList.toggle('is-contested', Boolean(g.contested));
        icon.dataset.owner = g.owner ? (g.owner === mine ? 'mine' : 'theirs') : '';
        const pTeam = g.progress.team ? (g.progress.team === mine ? 'var(--nx-blue)' : 'var(--nx-red)') : 'transparent';
        icon.style.setProperty('--p', `${g.progress.value}%`);
        icon.style.setProperty('--pc', pTeam);
        $('nxObjective').classList.toggle('is-overtime', Boolean(g.overtime));

        // Portraits (morts grisés avec leur temps de réapparition)
        for (const p of this.portraitEls) {
            p.f = g.fighters.find(f => f.id === p.id);
            if (!p.f) continue;
            const dead = !p.f.alive;
            p.li.classList.toggle('is-dead', dead);
            const t = dead ? String(Math.ceil(p.f.respawnT)) : '';
            if (p.t.textContent !== t) p.t.textContent = t;
            p.li.classList.toggle('has-ult', p.f.ult >= 100 && p.f.team === mine);
        }

        // Héros
        const hp = Math.max(0, Math.ceil(me.hp));
        this.setText('nxHudHpText', `${hp} / ${me.maxHp}${me.over > 0 ? ` +${Math.ceil(me.over)}` : ''}`);
        $('nxHpFill').style.width = `${(me.hp / me.maxHp) * 100}%`;
        $('nxHpOver').style.width = `${Math.min(1, me.over / me.maxHp) * 100}%`;
        $('nxHudHero').classList.toggle('is-low', me.hp < me.maxHp * 0.35);
        this.setText('nxAmmo', me.maxAmmo ? (me.reloadT > 0 ? 'RECHARGE…' : `${me.ammo} / ${me.maxAmmo}`) : '∞');

        // Capacités
        const slots = me.kit.slots(me, g);
        const key = slots.map(s => `${s.key}|${s.name}`).join(';');
        const box = $('nxHudAbilities');
        if (this.hudCache.slots !== key) {
            this.hudCache.slots = key;
            box.innerHTML = slots.map(s => `<div class="nx-ab"><span class="nx-ab-cd"></span><span class="nx-ab-name">${s.name}</span><kbd>${keyLabel(s.key)}</kbd><span class="nx-ab-charges"></span></div>`).join('');
        }
        slots.forEach((s, i) => {
            const el = box.children[i];
            if (!el) return;
            const cooling = s.cd > 0.05 && !(s.ready);
            el.classList.toggle('is-cd', cooling && !s.meter);
            el.classList.toggle('is-active', Boolean(s.active));
            el.style.setProperty('--cdk', s.max ? Math.min(1, s.cd / s.max) : 0);
            el.style.setProperty('--tint', s.tint || '');
            const cdEl = el.firstElementChild;
            const txt = s.meter !== undefined ? `${Math.round(s.meter * 100)}%` : cooling ? String(Math.ceil(s.cd)) : '';
            if (cdEl.textContent !== txt) cdEl.textContent = txt;
            const ch = el.lastElementChild;
            const ct = s.maxCharges ? '●'.repeat(s.charges) + '○'.repeat(s.maxCharges - s.charges) : '';
            if (ch.textContent !== ct) ch.textContent = ct;
        });

        // Ultime
        const ult = Math.floor(me.ult);
        const ultEl = $('nxUlt');
        ultEl.classList.toggle('is-ready', ult >= 100 && !me.ultActive);
        ultEl.classList.toggle('is-active', Boolean(me.ultActive || me.tire));
        ultEl.style.setProperty('--u', `${ult}%`);
        this.setText('nxUltPct', me.ultActive || me.tire ? 'ACTIF' : ult >= 100 ? 'PRÊT' : `${ult}%`);

        // Changement de héros possible ?
        const canSwap = g.canSwap(me);
        $('nxSpawnHint').hidden = !(canSwap && me.alive) || this.swapOpen;
        if (this.swapOpen && !canSwap) this.closeSwap();

        // Mort
        const death = $('nxDeath');
        death.hidden = me.alive || g.phase === 'matchEnd' || this.swapOpen;
        if (!me.alive) {
            const by = this.deathBy;
            this.setText('nxDeathBy', by ? `Éliminé par ${by.name} (${by.hero.name})` : 'Éliminé');
            this.setText('nxDeathT', `Réapparition dans ${Math.ceil(me.respawnT)} s`);
        }

        // Lieu
        const place = placeAt(this.map, me.x, me.y);
        if (place !== this.hudCache.place) {
            this.hudCache.place = place;
            const loc = $('nxLocation');
            loc.textContent = place;
            loc.classList.remove('is-pop');
            void loc.offsetWidth;
            loc.classList.add('is-pop');
        }
        if (this.boardOpen) this.renderBoard();
    }

    pips(id, n) {
        const el = $(id);
        [...el.children].forEach((p, i) => p.classList.toggle('on', i < n));
    }

    showBoard(open) {
        this.boardOpen = open && this.running;
        $('nxBoard').hidden = !this.boardOpen;
        if (this.boardOpen) this.renderBoard();
    }

    renderBoard(target = $('nxBoardBody')) {
        const g = this.game;
        const rows = (mine) => g.fighters.filter(f => (f.team === this.me.team) === mine).map(f => `
            <tr class="${f === this.me ? 'is-me' : ''} ${f.alive ? '' : 'is-dead'}">
                <td><span class="nx-dot role-${f.role}"></span>${f.name}</td><td>${f.hero.name}</td>
                <td>${f.stats.kills}</td><td>${f.stats.deaths}</td>
                <td>${Math.round(f.stats.damage)}</td><td>${Math.round(f.stats.healing)}</td>
                <td>${Math.round(f.stats.onPoint)} s</td>
            </tr>`).join('');
        const html = `
            <tr class="nx-board-team is-ally"><th colspan="7">Ton équipe</th></tr>${rows(true)}
            <tr class="nx-board-team is-enemy"><th colspan="7">Équipe adverse</th></tr>${rows(false)}`;
        if (this.hudCache.board !== html || target.id !== 'nxBoardBody') {
            if (target.id === 'nxBoardBody') this.hudCache.board = html;
            target.innerHTML = html;
        }
    }

    showEnd(win) {
        if (this.endShown) return;
        this.endShown = true;
        const el = $('nxEnd');
        $('nxEndTitle').textContent = win ? 'VICTOIRE' : 'DÉFAITE';
        el.classList.toggle('is-win', win);
        const g = this.game;
        $('nxEndScore').textContent = `${g.roundsWon[this.me.team]} - ${g.roundsWon[this.me.team === 'blue' ? 'red' : 'blue']}`;
        const s = this.me.stats;
        $('nxEndStats').innerHTML = `
            <div><strong>${s.kills}</strong><span>Éliminations</span></div>
            <div><strong>${s.deaths}</strong><span>Morts</span></div>
            <div><strong>${Math.round(s.damage)}</strong><span>Dégâts</span></div>
            <div><strong>${Math.round(s.healing)}</strong><span>Soins</span></div>
            <div><strong>${Math.round(s.onPoint)} s</strong><span>Sur le point</span></div>`;
        this.renderBoard($('nxEndBoard'));
        el.hidden = false;
    }
}

/* ----- Démarrage ----- */

async function boot() {
    await loadKeyLabels();
    try { await document.fonts?.load('700 40px "Bebas Neue"'); } catch { /* ignore */ }
    const match = new Match();
    const select = new HeroSelect({
        playerName: playerName(),
        keyLabel,
        onDone: (result) => match.start(result)
    });
    const backToSelect = () => { match.stop(); select.start(); };
    $('nxChangeHero')?.addEventListener('click', () => match.toggleSwap());
    $('nxSwapClose')?.addEventListener('click', () => match.closeSwap());
    $('nxReplay')?.addEventListener('click', backToSelect);
    const loading = $('nxLoading');
    loading?.classList.add('done');
    setTimeout(() => { if (loading) loading.hidden = true; }, 450);
    select.start();

    // Test : nexus.html?hero=tempo verrouille ce héros et lance directement la partie
    const qp = new URLSearchParams(location.search);
    const testHero = qp.get('hero');
    if (testHero && HERO_BY_ID[testHero]) {
        select.select(testHero);
        select.lock();
        for (let i = 0; i < 12 && select.running; i++) select.tick(1, i);

        const skip = Number(qp.get('skip')) || 0; // simuler N secondes (tests)
        for (let i = 0; i < skip * 60 && match.running; i++) { match.bots.update(STEP); match.game.update(STEP); }
        // Test : ?swap ouvre le choix de héros (le joueur est considéré mort)
        if (qp.has('swap') && match.running) {
            if (match.me.alive) match.game.kill(match.me, null);
            match.openSwap();
        }
    }
    window.NEXUS = { match, select };
}

boot();
