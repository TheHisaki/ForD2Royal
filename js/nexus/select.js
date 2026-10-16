/* ==================================
   NEXUS - SÉLECTION DES HÉROS
   Même principe que la sélection d'Overwatch en file par rôle :
   - composition imposée : 1 Tank, 2 Dégâts, 2 Soutiens,
   - un héros ne peut être pris qu'une fois par équipe (l'adversaire peut avoir le même),
   - minuteur : à 0, le héros survolé (ou un héros libre) est verrouillé automatiquement,
   - l'équipe adverse reste cachée jusqu'au début du match.
   Les coéquipiers sont des bots : 2 d'entre eux choisissent tout de suite,
   les autres complètent la composition après le choix du joueur.
   ================================== */

import { HEROES, HERO_BY_ID, ROLES, ROLE_ORDER, TEAM_COMPOSITION, heroesOfRole, isValidTeam } from './heroes.js?v=4';
import { drawPortrait } from './sprites.js?v=3';
import { SelectMusic } from './music.js?v=1';

const SELECT_TIME = 30;
const BOT_NAMES = ['Kestrel', 'Nova', 'Bjorn', 'Lynx', 'Orion', 'Mako', 'Sable', 'Rook', 'Vex', 'Iris', 'Tako', 'Juno'];

const $ = (id) => document.getElementById(id);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const shuffle = (list) => list.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(v => v[1]);

function roleIcon(role) {
    // Pictogrammes simples façon Overwatch : bouclier, viseur, croix
    if (role === 'tank') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.4 9-8 11-4.6-2-8-6-8-11V5z"/></svg>';
    if (role === 'damage') return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h3v9H7zM14 3h3v9h-3zM5 14h14v3H5zM8 18h8v3H8z"/></svg>';
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/></svg>';
}

function statBar(label, value) {
    const pips = Array.from({ length: 5 }, (_, i) => `<i class="${i < value ? 'on' : ''}"></i>`).join('');
    return `<div class="nx-stat"><span>${label}</span><span class="nx-pips" aria-label="${value} sur 5">${pips}</span></div>`;
}

export class HeroSelect {
    constructor({ playerName = 'Toi', onDone, keyLabel = (k) => k }) {
        this.onDone = onDone;
        this.keyLabel = keyLabel;
        this.root = $('nxSelect');
        this.timerEl = $('nxTimer');
        this.hintEl = $('nxSelHint');
        this.lockBtn = $('nxLock');
        this.showcase = $('nxShowcase');
        this.playerName = playerName;
        this.tiles = new Map();
        this.portraits = [];
        this.running = false;
        this.raf = 0;

        this.buildRoster();
        this.lockBtn.addEventListener('click', () => this.lock());
        this.keyHandler = (e) => {
            if (!this.running) return;
            if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); this.lock(); }
        };
        addEventListener('keydown', this.keyHandler);
    }

    /* ----- Construction de l'interface ----- */

    buildRoster() {
        const roster = $('nxRoster');
        roster.replaceChildren();
        for (const role of ROLE_ORDER) {
            const r = ROLES[role];
            const group = document.createElement('div');
            group.className = `nx-role-group role-${role}`;
            group.innerHTML = `<div class="nx-role-head">${roleIcon(role)}<span>${r.name}</span><em data-count="${role}">0/${r.slots}</em></div>`;
            const row = document.createElement('div');
            row.className = 'nx-role-row';
            for (const h of heroesOfRole(role)) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'nx-tile';
                btn.dataset.hero = h.id;
                btn.setAttribute('aria-label', `${h.name}, ${r.name}`);
                btn.innerHTML = `<canvas width="120" height="120"></canvas><span class="nx-tile-name">${h.name}</span><span class="nx-tile-taken"></span>`;
                btn.addEventListener('mouseenter', () => this.hover(h.id));
                btn.addEventListener('focus', () => this.hover(h.id));
                btn.addEventListener('click', () => { this.hover(h.id); this.select(h.id); });
                btn.addEventListener('dblclick', () => { this.select(h.id); this.lock(); });
                row.appendChild(btn);
                this.tiles.set(h.id, btn);
                this.portraits.push({ canvas: btn.querySelector('canvas'), hero: h });
            }
            group.appendChild(row);
            roster.appendChild(group);
        }
    }

    /* ----- Déroulement ----- */

    start() {
        this.allies = [
            { name: this.playerName, isPlayer: true, heroId: null, locked: false },
            ...shuffle(BOT_NAMES).slice(0, 4).map(name => ({ name, isBot: true, heroId: null, locked: false }))
        ];
        this.enemyNames = shuffle(BOT_NAMES.filter(n => !this.allies.some(a => a.name === n))).slice(0, 5);
        this.selected = null;
        this.hovered = HEROES[0].id;
        this.timeLeft = SELECT_TIME;
        this.phase = 'pick';      // pick → filling → done
        this.events = [];
        this.elapsed = 0;

        // 2 bots choisissent tout de suite (un Dégâts, un Soutien), comme des joueurs rapides
        this.events.push({ at: 1.4, run: () => this.botLock(1, pick(heroesOfRole('damage')).id) });
        this.events.push({ at: 3.1, run: () => this.botLock(2, pick(heroesOfRole('support')).id) });

        this.root.hidden = false;
        this.root.classList.add('is-open');
        this.running = true;
        // Musique « Apex Vanguard » pendant le choix des héros
        SelectMusic.start();
        this.render();
        this.hover(this.hovered);
        let last = performance.now();
        const loop = (now) => {
            if (!this.running) return;
            const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
            last = now;
            this.tick(dt, now / 1000);
            this.raf = requestAnimationFrame(loop);
        };
        this.raf = requestAnimationFrame(loop);
    }

    stop() {
        this.running = false;
        SelectMusic.fadeOut(3); // sans effet si le fondu est déjà lancé
        cancelAnimationFrame(this.raf);
        this.root.classList.remove('is-open');
        this.root.hidden = true;
    }

    tick(dt, time) {
        this.elapsed += dt;
        if (this.phase === 'pick') SelectMusic.syncMute();
        for (const ev of this.events) {
            if (!ev.done && this.elapsed >= ev.at) { ev.done = true; ev.run(); }
        }
        if (this.phase === 'pick') {
            this.timeLeft = Math.max(0, this.timeLeft - dt);
            if (this.timeLeft <= 0) this.autoLock();
        }
        const shown = this.phase === 'pick' ? Math.ceil(this.timeLeft) : this.phase === 'filling' ? '…' : 'GO';
        if (this.timerEl.textContent !== String(shown)) this.timerEl.textContent = String(shown);
        this.timerEl.parentElement.classList.toggle('is-urgent', this.phase === 'pick' && this.timeLeft <= 5);

        // Portraits animés (respiration légère) et vitrine qui tourne doucement
        for (const p of this.portraits) {
            drawPortrait(p.canvas, p.hero.id, { roleColor: ROLES[p.hero.role].color, t: time, zoom: 1.05 });
        }
        const id = this.infoHero;
        if (id) {
            const h = HERO_BY_ID[id];
            const angle = -Math.PI / 2 + Math.sin(time * 0.7) * 0.5;
            drawPortrait(this.showcase, id, { roleColor: ROLES[h.role].color, t: time, angle, zoom: 0.82 });
        }
    }

    /* ----- Règles ----- */

    takenBy(heroId) {
        return this.allies.find(a => a.heroId === heroId && (a.locked || a.isPlayer)) || null;
    }

    roleCount(role, { lockedOnly = true } = {}) {
        return this.allies.filter(a => a.heroId && (!lockedOnly || a.locked) && HERO_BY_ID[a.heroId].role === role).length;
    }

    // Pourquoi ce héros n'est pas disponible (ou null s'il l'est)
    unavailable(heroId) {
        const h = HERO_BY_ID[heroId];
        const owner = this.allies.find(a => a.locked && a.heroId === heroId);
        if (owner && !owner.isPlayer) return `Pris par ${owner.name}`;
        const others = this.allies.filter(a => a.locked && !a.isPlayer && HERO_BY_ID[a.heroId].role === h.role).length;
        if (others >= TEAM_COMPOSITION[h.role]) return 'Rôle complet';
        return null;
    }

    hover(heroId) {
        if (!this.running) return;
        this.hovered = heroId;
        // Une fois verrouillé, la fiche reste sur le héros choisi
        if (this.phase === 'pick') this.renderInfo(heroId);
    }

    select(heroId) {
        if (this.phase !== 'pick') return;
        const why = this.unavailable(heroId);
        if (why) { this.flashHint(why); return; }
        this.selected = heroId;
        this.allies[0].heroId = heroId;
        window.SFX?.play?.('click');
        this.render();
    }

    lock() {
        if (this.phase !== 'pick') return;
        const id = this.selected || this.hovered;
        if (!id || this.unavailable(id)) { this.flashHint('Choisis un héros disponible'); return; }
        this.selected = id;
        this.allies[0].heroId = id;
        this.allies[0].locked = true;
        this.phase = 'filling';
        window.SFX?.play?.('ready');
        this.fillBots();
        this.render();
    }

    autoLock() {
        let id = this.selected || this.hovered;
        if (!id || this.unavailable(id)) id = HEROES.find(h => !this.unavailable(h.id))?.id;
        this.selected = id;
        this.lock();
    }

    botLock(index, heroId) {
        const bot = this.allies[index];
        // Après le verrouillage du joueur, c'est fillBots() qui complète l'équipe
        if (!bot || bot.locked || this.phase !== 'pick') return;
        // Le bot ne vole jamais le héros déjà choisi par le joueur
        if (this.allies[0].heroId === heroId) {
            const alt = shuffle(heroesOfRole(HERO_BY_ID[heroId].role)).find(h => h.id !== heroId && !this.takenBy(h.id));
            if (!alt) return;
            heroId = alt.id;
        }
        bot.heroId = heroId;
        bot.locked = true;
        this.render();
        if (this.selected && this.unavailable(this.selected) && this.phase === 'pick') {
            this.selected = null;
            this.allies[0].heroId = null;
            this.flashHint('Ton héros a été pris, choisis-en un autre');
        }
    }

    // Les bots restants prennent exactement ce qu'il manque à la composition
    fillBots() {
        const missing = [];
        for (const role of ROLE_ORDER) {
            const free = shuffle(heroesOfRole(role).filter(h => !this.allies.some(a => a.locked && a.heroId === h.id)));
            const need = TEAM_COMPOSITION[role] - this.roleCount(role);
            missing.push(...free.slice(0, need).map(h => h.id));
        }
        const waiting = this.allies.filter(a => !a.locked);
        waiting.forEach((bot, i) => {
            this.events.push({ at: this.elapsed + 0.6 + i * 0.6, run: () => { bot.heroId = missing[i]; bot.locked = true; this.render(); } });
        });
        this.events.push({
            at: this.elapsed + 0.8 + waiting.length * 0.6,
            run: () => {
                this.phase = 'done';
                // Tous les choix sont faits : la musique s'éteint en fondu
                SelectMusic.fadeOut(3);
                this.render();
                this.events.push({ at: this.elapsed + 1.6, run: () => this.finish() });
            }
        });
    }

    finish() {
        const allies = this.allies.map(a => ({ name: a.name, heroId: a.heroId, isPlayer: Boolean(a.isPlayer) }));
        // Équipe adverse : composition valide tirée au hasard
        const enemyHeroes = ROLE_ORDER.flatMap(role => shuffle(heroesOfRole(role)).slice(0, TEAM_COMPOSITION[role]).map(h => h.id));
        const enemies = enemyHeroes.map((heroId, i) => ({ name: this.enemyNames[i], heroId, isPlayer: false }));
        if (!isValidTeam(allies.map(a => a.heroId)) || !isValidTeam(enemies.map(e => e.heroId))) {
            console.warn('[NEXUS] Composition invalide', allies, enemies);
        }
        this.stop();
        this.onDone?.({ allies, enemies, myHero: this.allies[0].heroId });
    }

    /* ----- Affichage ----- */

    flashHint(text) {
        this.hintEl.textContent = text;
        this.hintEl.classList.remove('is-flash');
        void this.hintEl.offsetWidth;
        this.hintEl.classList.add('is-flash');
        clearTimeout(this.hintTimer);
        this.hintTimer = setTimeout(() => this.renderHint(), 1800);
    }

    renderHint() {
        this.hintEl.classList.remove('is-flash');
        this.hintEl.textContent = this.phase === 'pick'
            ? 'Composition imposée : 1 Tank · 2 Dégâts · 2 Soutiens. Un héros par équipe. Double-clic ou Entrée pour verrouiller.'
            : this.phase === 'filling' ? 'Ton équipe termine sa composition…' : 'Composition validée ! Préparez-vous…';
    }

    render() {
        this.renderHint();
        // Compteurs de rôles
        for (const role of ROLE_ORDER) {
            const el = this.root.querySelector(`[data-count="${role}"]`);
            if (el) el.textContent = `${this.roleCount(role, { lockedOnly: false })}/${ROLES[role].slots}`;
        }
        // Tuiles
        for (const [id, btn] of this.tiles) {
            const why = this.unavailable(id);
            const owner = this.allies.find(a => a.heroId === id && a.locked && !a.isPlayer);
            btn.classList.toggle('is-selected', this.selected === id);
            btn.classList.toggle('is-locked', this.selected === id && this.allies[0].locked);
            btn.classList.toggle('is-taken', Boolean(owner));
            btn.classList.toggle('is-unavailable', Boolean(why));
            btn.disabled = this.phase !== 'pick' && this.selected !== id;
            btn.querySelector('.nx-tile-taken').textContent = owner ? owner.name : why ? why : '';
        }
        this.lockBtn.disabled = this.phase !== 'pick';
        this.lockBtn.textContent = this.phase === 'pick' ? 'VERROUILLER' : 'VERROUILLÉ';

        // Mon équipe
        const allies = $('nxAllies');
        allies.innerHTML = this.allies.map(a => {
            const h = a.heroId ? HERO_BY_ID[a.heroId] : null;
            const state = a.locked ? 'is-locked' : a.heroId ? 'is-picking' : 'is-waiting';
            const role = h ? h.role : '';
            return `<li class="nx-slot ${state} ${a.isPlayer ? 'is-me' : ''} ${role ? 'role-' + role : ''}">
                <span class="nx-slot-icon">${h ? roleIcon(h.role) : '<b>?</b>'}</span>
                <span class="nx-slot-text"><strong>${h ? h.name : a.locked ? '' : 'Sélection…'}</strong><small>${a.isPlayer ? 'TOI' : 'Bot · ' + a.name}</small></span>
                <span class="nx-slot-state">${a.locked ? '✔' : ''}</span>
            </li>`;
        }).join('');

        // Équipe adverse cachée (rôles connus, héros révélés au début du match)
        const enemies = $('nxEnemies');
        const roles = ['tank', 'damage', 'damage', 'support', 'support'];
        enemies.innerHTML = roles.map(role => `<li class="nx-slot is-hidden role-${role}">
            <span class="nx-slot-icon">${roleIcon(role)}</span>
            <span class="nx-slot-text"><strong>???</strong><small>${ROLES[role].name}</small></span>
        </li>`).join('');

        this.renderInfo(this.selected || this.hovered);
    }

    renderInfo(heroId) {
        const h = HERO_BY_ID[heroId];
        if (!h) return;
        this.infoHero = heroId;
        const role = ROLES[h.role];
        const badge = $('nxHeroRole');
        badge.innerHTML = `${roleIcon(h.role)}<span>${role.name}</span>`;
        badge.className = `nx-role-badge role-${h.role}`;
        $('nxHeroName').textContent = h.name.toUpperCase();
        $('nxHeroTitle').textContent = h.title;
        $('nxHeroLore').textContent = h.lore;
        $('nxHeroInspired').textContent = `Inspiré de ${h.inspiredBy} (Overwatch) · ${h.health} PV`;
        $('nxHeroStats').innerHTML = statBar('Résistance', h.stats.health) + statBar('Mobilité', h.stats.mobility) + statBar('Difficulté', h.stats.difficulty);
        $('nxHeroAbilities').innerHTML = h.abilities.map(a => `<li class="${a.ult ? 'is-ult' : ''}">
            <kbd>${this.keyLabel(a.key)}</kbd><div><strong>${a.name}</strong><span>${a.text}</span></div>
        </li>`).join('');
        $('nxRolePassive').innerHTML = `<strong>Passif de rôle · ${role.name}</strong> ${role.passive}`;
        const why = this.phase === 'pick' ? this.unavailable(heroId) : null;
        this.root.classList.toggle('is-preview-unavailable', Boolean(why));
    }
}
