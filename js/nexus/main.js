/* ==================================
   NEXUS - HÉROS 5V5 (aperçu)
   1. Sélection du héros (règles de la file par rôle d'Overwatch).
   2. Aperçu de la carte « Sanctuaire de Kaïro » : les 10 héros sont dans leurs bases,
      le joueur peut se promener pour découvrir la carte et le style des héros.
   Prochaine étape : capture du point (Contrôle) et pouvoirs des héros.
   ================================== */

import { HERO_BY_ID, ROLES } from './heroes.js?v=1';
import { drawHero, drawPortrait, HERO_RADIUS, TEAM_COLORS } from './sprites.js?v=1';
import { KAIRO, buildMapLayers, collide, placeAt, drawControlPoint, drawAnimatedDecor } from './map.js?v=1';
import { HeroSelect } from './select.js?v=1';

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;

// Vitesse de déplacement (unités / s), à équilibrer avec les pouvoirs plus tard
const SPEED = { gorvald: 250, volta: 290, zephyr: 330, kraz: 290, seraphine: 300, tempo: 345 };
// Le point se déverrouille 30 s après le début de la manche (comme en Contrôle)
const POINT_LOCK = 30;

// Même source que le lobby et le jeu 2D
function playerName() {
    try {
        const name = window.FOR2D_PROGRESS?.name || localStorage.getItem('for2d-player-name');
        if (name) return String(name).slice(0, 16);
    } catch { /* ignore */ }
    return 'Toi';
}

/* ----- Partie (aperçu) ----- */

class Preview {
    constructor() {
        this.root = $('nxGame');
        this.canvas = $('nxCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.map = KAIRO;
        this.layers = buildMapLayers(this.map);
        this.keys = new Set();
        this.mouse = { x: innerWidth / 2, y: innerHeight / 2 };
        this.zoom = 1;
        this.overview = false;
        this.running = false;
        this.entities = [];
        this.cam = { x: 0, y: 0, scale: 1 };

        addEventListener('resize', () => this.resize());
        addEventListener('keydown', (e) => {
            if (!this.running) return;
            if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
            this.keys.add(e.code);
            if (e.code === 'Tab') this.overview = true;
            if (!e.repeat && e.key.toLowerCase() === 'm') this.overviewToggle = !this.overviewToggle;
        });
        addEventListener('keyup', (e) => {
            this.keys.delete(e.code);
            if (e.code === 'Tab') this.overview = false;
        });
        addEventListener('blur', () => { this.keys.clear(); this.overview = false; });
        this.canvas.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.zoom = Math.max(0.6, Math.min(1.6, this.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
        }, { passive: false });
        this.canvas.addEventListener('mousedown', () => {
            if (this.running) this.toast('Les pouvoirs arrivent dans la prochaine étape');
        });
    }

    start({ allies, enemies, myHero }) {
        this.entities = [];
        const add = (list, team) => list.forEach((m, i) => {
            const s = this.map.spawns[team][i];
            this.entities.push({
                ...m, team, x: s.x, y: s.y,
                angle: team === 'blue' ? 0 : Math.PI,
                r: HERO_RADIUS[m.heroId] || 20,
                moving: false, t: Math.random() * 10
            });
        });
        add(allies, 'blue');
        add(enemies, 'red');
        this.me = this.entities.find(e => e.isPlayer);
        this.time = 0;
        this.lockLeft = POINT_LOCK;
        this.lastPlace = '';
        this.overviewToggle = false;
        this.buildHud(myHero, allies, enemies);
        this.root.hidden = false;
        this.resize();
        this.running = true;
        this.toast('Aperçu : découvre la carte avec ton héros');
        let last = performance.now();
        const loop = (now) => {
            if (!this.running) return;
            // Jamais négatif (horloge qui recule) ni trop grand (onglet en arrière-plan)
            const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
            last = now;
            this.update(dt);
            this.draw();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    stop() {
        this.running = false;
        this.root.hidden = true;
        this.keys.clear();
    }

    resize() {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        this.dpr = dpr;
        this.canvas.width = Math.round(innerWidth * dpr);
        this.canvas.height = Math.round(innerHeight * dpr);
        this.canvas.style.width = `${innerWidth}px`;
        this.canvas.style.height = `${innerHeight}px`;
    }

    /* ----- HUD ----- */

    buildHud(myHero, allies, enemies) {
        const h = HERO_BY_ID[myHero];
        const role = ROLES[h.role];
        drawPortrait($('nxHudPortrait'), h.id, { roleColor: role.color, zoom: 1.05 });
        $('nxHudName').textContent = h.name.toUpperCase();
        $('nxHudRole').textContent = role.name;
        $('nxHudRole').className = `nx-hud-role role-${h.role}`;
        $('nxHudHpText').textContent = `${h.health} / ${h.health}`;
        $('nxHudAbilities').innerHTML = h.abilities.filter(a => a.key !== 'Clic G' && a.key !== 'Passif').map(a => `
            <div class="nx-ab ${a.ult ? 'is-ult' : ''}" title="${a.name} : ${a.text}">
                <span class="nx-ab-name">${a.name}</span><kbd>${a.key}</kbd>
                ${a.ult ? '<span class="nx-ab-ult">0%</span>' : ''}
            </div>`).join('');

        // Bandeau des équipes (révélées au début du match, comme en Overwatch)
        const team = (list, side) => list.map(m => {
            const hh = HERO_BY_ID[m.heroId];
            return `<li class="role-${hh.role} ${m.isPlayer ? 'is-me' : ''}" title="${m.name} · ${hh.name}"><canvas width="56" height="56" data-hero="${hh.id}"></canvas></li>`;
        }).join('');
        $('nxHudBlue').innerHTML = team(allies, 'blue');
        $('nxHudRed').innerHTML = team(enemies, 'red');
        for (const c of document.querySelectorAll('#nxHudBlue canvas, #nxHudRed canvas')) {
            const hh = HERO_BY_ID[c.dataset.hero];
            drawPortrait(c, hh.id, { roleColor: ROLES[hh.role].color, zoom: 1.1 });
        }
    }

    toast(text) {
        const el = $('nxToast');
        el.textContent = text;
        el.hidden = false;
        el.classList.remove('is-pop');
        void el.offsetWidth;
        el.classList.add('is-pop');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
    }

    updateHud() {
        const s = Math.ceil(this.lockLeft);
        const label = this.lockLeft > 0
            ? `POINT VERROUILLÉ · 0:${String(s).padStart(2, '0')}`
            : 'APERÇU · CAPTURE BIENTÔT';
        const el = $('nxPointState');
        if (el.textContent !== label) el.textContent = label;
        $('nxPointIcon').classList.toggle('is-locked', this.lockLeft > 0);
        const place = placeAt(this.map, this.me.x, this.me.y);
        if (place !== this.lastPlace) {
            this.lastPlace = place;
            const loc = $('nxLocation');
            loc.textContent = place;
            loc.classList.remove('is-pop');
            void loc.offsetWidth;
            loc.classList.add('is-pop');
        }
    }

    /* ----- Simulation ----- */

    screenToWorld(sx, sy) {
        const { x, y, scale } = this.cam;
        return {
            x: x + (sx * this.dpr - this.canvas.width / 2) / scale,
            y: y + (sy * this.dpr - this.canvas.height / 2) / scale
        };
    }

    update(dt) {
        this.time += dt;
        this.lockLeft = Math.max(0, this.lockLeft - dt);
        const me = this.me;
        const k = this.keys;
        // Codes physiques : ZQSD (AZERTY) et WASD (QWERTY) sont les mêmes touches
        let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
        let my = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
        const len = Math.hypot(mx, my);
        me.moving = len > 0;
        if (len > 0) {
            mx /= len; my /= len;
            const sp = SPEED[me.heroId] || 280;
            const next = collide(this.map, me.x + mx * sp * dt, me.y + my * sp * dt, me.r);
            me.x = next.x;
            me.y = next.y;
        }
        const aim = this.screenToWorld(this.mouse.x, this.mouse.y);
        me.angle = Math.atan2(aim.y - me.y, aim.x - me.x);

        // Les bots attendent dans leur base, tournés vers le point
        for (const e of this.entities) {
            e.t += dt;
            if (e === me) continue;
            const target = Math.atan2(this.map.point.y - e.y, this.map.point.x - e.x) + Math.sin(e.t * 0.6) * 0.35;
            let d = target - e.angle;
            while (d > Math.PI) d -= TAU;
            while (d < -Math.PI) d += TAU;
            e.angle += d * Math.min(1, dt * 3);
        }

        // Caméra : suit le joueur, ou montre toute la carte (Tab maintenu / M)
        const W = this.canvas.width, H = this.canvas.height;
        const fit = Math.min(W / this.map.width, H / this.map.height) * 0.94;
        const follow = (Math.min(W, H) / 1100) * this.zoom;
        const wantOverview = this.overview || this.overviewToggle;
        const target = wantOverview
            ? { x: this.map.width / 2, y: this.map.height / 2, scale: fit }
            : { x: me.x, y: me.y, scale: Math.max(follow, fit) };
        if (!wantOverview) {
            // La caméra ne montre jamais le vide autour de la carte
            const hw = W / 2 / target.scale, hh = H / 2 / target.scale;
            target.x = hw * 2 >= this.map.width ? this.map.width / 2 : Math.max(hw, Math.min(this.map.width - hw, target.x));
            target.y = hh * 2 >= this.map.height ? this.map.height / 2 : Math.max(hh, Math.min(this.map.height - hh, target.y));
        }
        const a = Math.min(1, dt * 8);
        this.cam.x += (target.x - this.cam.x) * a;
        this.cam.y += (target.y - this.cam.y) * a;
        this.cam.scale += (target.scale - this.cam.scale) * a;
        this.updateHud();
    }

    /* ----- Rendu ----- */

    draw() {
        const ctx = this.ctx;
        const { x, y, scale } = this.cam;
        const W = this.canvas.width, H = this.canvas.height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#0d1430';
        ctx.fillRect(0, 0, W, H);
        ctx.setTransform(scale, 0, 0, scale, W / 2 - x * scale, H / 2 - y * scale);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.layers.ground, 0, 0);
        drawControlPoint(ctx, this.map, this.time, this.lockLeft);
        drawAnimatedDecor(ctx, this.map, this.time);

        // Héros, triés de haut en bas
        const list = [...this.entities].sort((a, b) => a.y - b.y);
        for (const e of list) {
            drawHero(ctx, e.heroId, { x: e.x, y: e.y, angle: e.angle, team: e.team, t: e.t, moving: e.moving });
        }
        // Feuillage des cerisiers au-dessus (plus transparent si le joueur est dessous)
        ctx.globalAlpha = 0.82;
        ctx.drawImage(this.layers.canopy, 0, 0);
        ctx.globalAlpha = 1;

        // Noms au-dessus des têtes
        const inv = 1 / scale;
        ctx.font = `700 ${Math.round(15 * this.dpr * inv)}px Rubik, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (const e of list) {
            const label = e.isPlayer ? HERO_BY_ID[e.heroId].name : e.name;
            const ty = e.y - e.r - 16;
            ctx.lineWidth = 4 * this.dpr * inv;
            ctx.strokeStyle = '#0b1430';
            ctx.strokeText(label, e.x, ty);
            ctx.fillStyle = e.isPlayer ? '#ffe03d' : TEAM_COLORS[e.team];
            ctx.fillText(label, e.x, ty);
        }

        // Réticule
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const mx = this.mouse.x * this.dpr, my = this.mouse.y * this.dpr;
        ctx.lineWidth = 2 * this.dpr;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath(); ctx.arc(mx, my, 9 * this.dpr, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.arc(mx, my, 1.8 * this.dpr, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    }
}

/* ----- Démarrage ----- */

async function boot() {
    // Attendre la police d'affichage pour que les noms de la carte soient dessinés avec
    try { await document.fonts?.load('700 40px "Bebas Neue"'); } catch { /* ignore */ }
    const preview = new Preview();
    const select = new HeroSelect({
        playerName: playerName(),
        onDone: (result) => preview.start(result)
    });
    $('nxChangeHero')?.addEventListener('click', () => {
        preview.stop();
        select.start();
    });
    const loading = $('nxLoading');
    loading?.classList.add('done');
    setTimeout(() => { if (loading) loading.hidden = true; }, 450);
    select.start();
    // Test : nexus.html?hero=tempo verrouille ce héros et saute directement à la carte
    const testHero = new URLSearchParams(location.search).get('hero');
    if (testHero && HERO_BY_ID[testHero]) {
        select.select(testHero);
        select.lock();
        for (let i = 0; i < 12 && select.running; i++) select.tick(1, i);
        if (new URLSearchParams(location.search).has('overview')) preview.overviewToggle = true;
    }
    window.NEXUS = { preview, select };
}

boot();
