/* ==================================
   NEXUS - VOTE DE LA CARTE (avant la sélection des héros)
   - une carte par terrain avec son mode (Contrôle, Escorte),
   - le joueur et les 9 bots votent pendant 15 s (on peut changer son vote),
   - la carte qui a le plus de votes gagne, égalité = tirage au sort,
   - un administrateur peut trancher : son vote choisit la prochaine carte.
   ================================== */

const VOTE_TIME = 15;
const BOTS = 9;

const $ = (id) => document.getElementById(id);

const MODE_INFO = {
    control: {
        label: 'Contrôle',
        desc: 'Capturez le point central et tenez-le jusqu\'à 100 %. Au meilleur des 3 manches.'
    },
    escort: {
        label: 'Escorte',
        desc: 'Escortez le convoi jusqu\'au terminal en passant par A et B. Chaque équipe attaque une fois.'
    }
};

// L'administrateur est connu grâce à la configuration enregistrée par le lobby
export function isAdminPlayer() {
    try {
        const raw = sessionStorage.getItem('for2d-game-mode') || localStorage.getItem('for2d-game-mode');
        return Boolean(raw && JSON.parse(raw)?.isAdmin);
    } catch { return false; }
}

export class MapVote {
    /**
     * maps : cartes proposées · preview(map) : calque du sol à miniaturiser
     * onDone(map) : appelé avec la carte choisie
     */
    constructor({ maps, preview, onDone, isAdmin = false, sfx = () => {} }) {
        this.maps = maps;
        this.preview = preview;
        this.onDone = onDone;
        this.isAdmin = isAdmin;
        this.sfx = sfx;
        this.root = $('nxVote');
        this.list = $('nxVoteMaps');
        this.timerEl = $('nxVoteTimer');
        this.infoEl = $('nxVoteInfo');
        this.adminBtn = $('nxVoteAdmin');
        this.adminBtn.addEventListener('click', () => this.adminDecide());
        this.buildCards();
    }

    buildCards() {
        this.list.replaceChildren();
        this.cards = {};
        for (const map of this.maps) {
            const info = MODE_INFO[map.mode] || { label: map.modeName || '', desc: '' };
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `nx-vote-card mode-${map.mode}`;
            btn.dataset.id = map.id;
            btn.setAttribute('aria-pressed', 'false');
            btn.innerHTML = `
                <span class="nx-vote-art"><canvas width="560" height="300" aria-hidden="true"></canvas></span>
                <span class="nx-vote-mode">${info.label}</span>
                <strong class="nx-vote-name">${map.name}</strong>
                <span class="nx-vote-desc">${info.desc}</span>
                <span class="nx-vote-tally"><b>0</b><em>vote</em></span>
                <span class="nx-vote-dots" aria-hidden="true"></span>
                <span class="nx-vote-badge">Ton vote</span>`;
            btn.addEventListener('click', () => this.vote(map.id));
            this.list.appendChild(btn);
            this.cards[map.id] = btn;
            this.drawPreview(btn.querySelector('canvas'), map);
        }
    }

    // Miniature : le sol de la carte réduit, avec un vignettage
    drawPreview(canvas, map) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;
        ctx.fillStyle = '#0b1430';
        ctx.fillRect(0, 0, W, H);
        try {
            const layers = this.preview(map);
            const k = Math.max(W / map.width, H / map.height);
            const dw = map.width * k, dh = map.height * k;
            ctx.drawImage(layers.ground, (W - dw) / 2, (H - dh) / 2, dw, dh);
            ctx.globalAlpha = 0.8;
            ctx.drawImage(layers.canopy, (W - dw) / 2, (H - dh) / 2, dw, dh);
            ctx.globalAlpha = 1;
        } catch { /* aperçu facultatif */ }
        const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
        g.addColorStop(0, 'rgba(11, 20, 48, 0)');
        g.addColorStop(1, 'rgba(11, 20, 48, 0.85)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    start() {
        this.votes = { player: null, bots: [] };
        this.timeLeft = VOTE_TIME;
        this.decided = null;
        this.events = Array.from({ length: BOTS }, () => ({ at: 1 + Math.random() * 9, done: false }));
        this.root.hidden = false;
        this.running = true;
        this.adminBtn.hidden = !this.isAdmin;
        this.root.classList.toggle('is-admin', this.isAdmin);
        for (const c of Object.values(this.cards)) c.classList.remove('is-winner', 'is-loser');
        this.render();
        let last = performance.now();
        const loop = (now) => {
            if (!this.running) return;
            const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
            last = now;
            this.tick(dt);
            this.raf = requestAnimationFrame(loop);
        };
        this.raf = requestAnimationFrame(loop);
    }

    stop() {
        this.running = false;
        cancelAnimationFrame(this.raf);
        this.root.hidden = true;
    }

    tick(dt) {
        if (this.decided) return;
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        const elapsed = VOTE_TIME - this.timeLeft;
        for (const ev of this.events) {
            if (ev.done || elapsed < ev.at) continue;
            ev.done = true;
            this.votes.bots.push(this.maps[Math.floor(Math.random() * this.maps.length)].id);
            this.render();
        }
        const shown = String(Math.ceil(this.timeLeft));
        if (this.timerEl.textContent !== shown) this.timerEl.textContent = shown;
        this.timerEl.parentElement.classList.toggle('is-urgent', this.timeLeft <= 5);
        if (this.timeLeft <= 0) this.close();
    }

    vote(id) {
        if (this.decided || !this.running) return;
        if (this.votes.player === id) return;
        this.votes.player = id;
        this.sfx('click');
        this.render();
    }

    tally() {
        const t = Object.fromEntries(this.maps.map(m => [m.id, 0]));
        for (const id of this.votes.bots) t[id]++;
        if (this.votes.player) t[this.votes.player]++;
        return t;
    }

    render() {
        const t = this.tally();
        for (const map of this.maps) {
            const c = this.cards[map.id];
            const n = t[map.id];
            c.querySelector('.nx-vote-tally b').textContent = String(n);
            c.querySelector('.nx-vote-tally em').textContent = n > 1 ? 'votes' : 'vote';
            const mine = this.votes.player === map.id;
            c.classList.toggle('is-voted', mine);
            c.setAttribute('aria-pressed', String(mine));
            const dots = c.querySelector('.nx-vote-dots');
            const bots = this.votes.bots.filter(id => id === map.id).length;
            dots.innerHTML = (mine ? '<i class="is-me"></i>' : '') + '<i></i>'.repeat(bots);
            c.disabled = Boolean(this.decided);
        }
        if (this.decided) return;
        const voted = this.votes.bots.length + (this.votes.player ? 1 : 0);
        this.infoEl.textContent = this.isAdmin
            ? (this.votes.player ? 'Administrateur : appuie sur « Décision admin » pour imposer ton choix.' : 'Administrateur : vote pour une carte, puis impose ton choix.')
            : `${voted} / ${BOTS + 1} votes · la carte la plus votée sera jouée (égalité : tirage au sort)`;
        this.adminBtn.disabled = !this.votes.player;
    }

    // Vote de l'admin = choix final
    adminDecide() {
        if (!this.isAdmin || this.decided || !this.votes.player) return;
        this.close(this.votes.player, true);
    }

    close(forced = null, byAdmin = false) {
        if (this.decided) return;
        let id = forced;
        let how = byAdmin ? 'admin' : 'vote';
        if (!id) {
            const t = this.tally();
            const best = Math.max(...Object.values(t));
            const top = this.maps.filter(m => t[m.id] === best);
            id = top[Math.floor(Math.random() * top.length)].id;
            if (top.length > 1) how = 'tie';
        }
        this.decided = id;
        const map = this.maps.find(m => m.id === id);
        for (const m of this.maps) {
            this.cards[m.id].classList.toggle('is-winner', m.id === id);
            this.cards[m.id].classList.toggle('is-loser', m.id !== id);
        }
        this.render();
        this.adminBtn.disabled = true;
        this.timerEl.textContent = 'GO';
        this.timerEl.parentElement.classList.remove('is-urgent');
        const mode = MODE_INFO[map.mode]?.label || map.modeName;
        this.infoEl.textContent = how === 'admin' ? `Décision de l'administrateur : ${map.name} · ${mode}`
            : how === 'tie' ? `Égalité, tirage au sort : ${map.name} · ${mode}`
                : `Carte choisie : ${map.name} · ${mode}`;
        this.sfx('ready');
        setTimeout(() => {
            this.stop();
            this.onDone?.(map);
        }, 2000);
    }
}
