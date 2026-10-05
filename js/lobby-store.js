/* ==================================
   BOUTIQUE + CASIER - FOR2D ROYAL
   Écrans du lobby branchés sur js/cosmetics.js (catalogue + profil).

   Boutique (façon Fortnite) : filtres par catégorie, sections « En vedette »,
   « Quotidien » et « Offerts à tous », tuiles de tailles différentes
   (grande tenue vedette, tenues hautes, autres objets carrés), détail + achat.
   Casier : chargement à gauche (tenue, sac à dos, planeur, 4 emotes),
   aperçu au centre, objets de la catégorie choisie à droite.

   Boutique de Pixies : clic sur le solde du header -> packs (prix en euros,
   paiement pas encore branché) + champ « code secret » vérifié par le serveur.

   API : window.FOR2D_STORE.show('lobby' | 'store' | 'locker'), window.FOR2D_STORE.openPixies()
   Adresse : #boutique / #casier ouvre directement l'écran, #pixies la boutique de Pixies.
   ================================== */

import { Cosmetics, ITEMS, RARITY, TYPES, SLOTS, getItem } from './cosmetics.js';
import { renderItemInto, renderSkinInto } from './lobby-skin.js';
import { registerHudIcons, mountHudIcons, ICON_KIT } from './game/hud-icons.js';

const { gloss, shine } = ICON_KIT;
const $ = (id) => document.getElementById(id);
// Écrans plein cadre du lobby : adresse (#...) et élément. Passe, Profil et Classements
// sont remplis par js/lobby-hub.js, qui écoute l'événement « for2d:view ».
const HASH = { store: '#boutique', locker: '#casier', pass: '#passe', profile: '#profil', ranks: '#classements' };
const SCREEN_IDS = { store: 'storeScreen', locker: 'lockerScreen', pass: 'passScreen', profile: 'profileScreen', ranks: 'ranksScreen' };
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const TYPE_ORDER = Object.keys(TYPES);
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const sfx = (name) => window.SFX?.play(name);
const rarityOf = (it) => RARITY[it.rarity] || RARITY.common;
const rank = (it) => RARITY_ORDER.indexOf(it.rarity);

/* ----- Icônes propres à la boutique ----- */
registerHudIcons({
    gift: () =>
        '<rect x="3.4" y="9.6" width="17.2" height="11.4" rx="1.6" fill="#ffe03d"/>' +
        '<rect x="2.4" y="6.4" width="19.2" height="4.4" rx="1.2" fill="#ffd21a"/>' +
        '<rect x="10.2" y="6.4" width="3.6" height="14.6" fill="#ff5470" stroke-width="1.4"/>' +
        '<path d="M12 6.4 C9 1.8 4.6 3.2 6.6 6.4 Z M12 6.4 C15 1.8 19.4 3.2 17.4 6.4 Z" fill="#ff5470" stroke-width="1.4"/>' +
        gloss('<rect x="4.6" y="11" width="4.2" height="1.2" rx="0.6"/>', 0.6),
    lock: () =>
        '<path d="M7.4 10.6 V7.6 A4.6 4.6 0 0 1 16.6 7.6 V10.6" fill="none" stroke-width="4.4"/>' +
        '<path d="M7.4 10.6 V7.6 A4.6 4.6 0 0 1 16.6 7.6 V10.6" fill="none" stroke="#b9c3d4" stroke-width="2.2"/>' +
        '<rect x="4.6" y="10.2" width="14.8" height="11" rx="2" fill="#ffc93c"/>' +
        '<circle cx="12" cy="14.6" r="1.6" fill="#0a1030" stroke="none"/>' +
        '<path d="M12 15.4 V18.2" fill="none" stroke-width="1.8"/>' +
        shine('M6.6 12.4 H10', 1.2, 0.6),
    check: () =>
        '<circle cx="12" cy="12" r="9.4" fill="#3fbf4a"/>' +
        '<path d="M7.4 12.4 L10.6 15.6 L16.8 8.6" fill="none" stroke-width="4.2"/>' +
        '<path d="M7.4 12.4 L10.6 15.6 L16.8 8.6" fill="none" stroke="#fff" stroke-width="2.2"/>',
    clock: () =>
        '<circle cx="12" cy="12" r="9" fill="#ffe03d"/>' +
        '<path d="M12 7 V12 L15.4 14" fill="none" stroke-width="2.2"/>' +
        shine('M6.4 9 A6.4 6.4 0 0 1 9.4 5.8', 1.3, 0.7),
    plus: () =>
        '<path d="M12 5 V19 M5 12 H19" fill="none" stroke-width="5"/>' +
        '<path d="M12 5 V19 M5 12 H19" fill="none" stroke="#fff" stroke-width="2.4"/>'
});

/* ===================== OUTILS ===================== */

function pixiePrice(price) {
    const el = document.createElement('span');
    el.className = 'shop-price';
    if (price <= 0) {
        el.classList.add('is-free');
        el.textContent = 'Offert';
        return el;
    }
    el.innerHTML = '<span class="currency-icon pixie" aria-hidden="true">P</span><span class="shop-price-n"></span>';
    el.querySelector('.shop-price-n').textContent = fmt(price);
    el.setAttribute('aria-label', `${fmt(price)} Pixies`);
    return el;
}

/* ----- Boutique de Pixies : packs affichés en euros (paiement pas encore branché) ----- */
const PIXIE_PACKS = [
    { amount: 1000, bonus: 0, price: '8,99 €', level: 1 },
    { amount: 2800, bonus: 300, price: '22,99 €', level: 2 },
    { amount: 5000, bonus: 1000, price: '36,99 €', level: 3, tag: 'Populaire' },
    { amount: 13500, bonus: 3500, price: '89,99 €', level: 4, tag: 'Meilleure offre' }
];

// Pile de pièces Pixies (plus le pack est gros, plus il y a de pièces). Aussi utilisée par le passe.
export function pixieCoinsSvg(level) {
    const LAYOUT = {
        1: [[60, 54, 28]],
        2: [[44, 60, 22], [74, 48, 26]],
        3: [[34, 64, 20], [86, 64, 20], [60, 46, 26]],
        4: [[26, 68, 17], [94, 68, 17], [42, 44, 19], [80, 40, 21], [60, 66, 24]]
    };
    const coin = ([x, y, r]) => {
        const t = r * 0.46;
        return `<circle cx="${x}" cy="${y + 4}" r="${r}" fill="#a3268f"/>` +
            `<circle cx="${x}" cy="${y}" r="${r}" fill="#ff7fd8"/>` +
            `<circle cx="${x}" cy="${y}" r="${r * 0.74}" fill="#ffb3ec" stroke="none"/>` +
            `<path d="M${x - t * 0.6} ${y + t} V${y - t} H${x + t * 0.2} A${t * 0.55} ${t * 0.55} 0 0 1 ${x + t * 0.2} ${y + t * 0.1} H${x - t * 0.6}" fill="none" stroke="#7a1266" stroke-width="${Math.max(3, r * 0.16)}"/>` +
            `<path d="M${x - r * 0.55} ${y - r * 0.3} A${r * 0.62} ${r * 0.62} 0 0 1 ${x - r * 0.1} ${y - r * 0.62}" fill="none" stroke="#fff" stroke-width="3" opacity="0.8"/>`;
    };
    const star = (x, y, s) =>
        `<path d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z" fill="#fff" stroke="none"/>`;
    const coins = (LAYOUT[level] || LAYOUT[1]).map(coin).join('');
    return `<svg class="ps-coins" viewBox="0 0 120 100" aria-hidden="true" focusable="false" ` +
        `stroke="#0a1030" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">` +
        coins + star(18, 22, 7) + star(104, 18, 6) + star(100, 88, 5) + '</svg>';
}

function setRarityBadge(el, it) {
    const r = rarityOf(it);
    el.textContent = r.name;
    el.style.setProperty('--rar', r.color);
}

function countTo(el, from, to, ms = 700) {
    if (REDUCED || from === to) {
        el.textContent = fmt(to);
        return;
    }
    const t0 = performance.now();
    const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        el.textContent = fmt(from + (to - from) * (1 - (1 - k) ** 3));
        if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

function icon(name, cls = '') {
    const s = document.createElement('span');
    s.className = `hud-ico ${cls}`.trim();
    s.dataset.icon = name;
    s.setAttribute('aria-hidden', 'true');
    return s;
}

/*
   Tuile d'objet : l'aperçu remplit la tuile, un bandeau sombre en bas porte
   le nom, la catégorie et le prix (ou « Possédé » / « Équipé »).
   size : 'big' (2 x 2) | 'tall' (1 x 2) | 'small' (1 x 1)
*/
function makeTile(it, { size = 'small', mode = 'store' } = {}) {
    const r = rarityOf(it);
    const owned = Cosmetics.owns(it.id);
    const equipped = Cosmetics.isEquipped(it.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `shop-card size-${size} rarity-${it.rarity} type-${it.type}`;
    b.dataset.item = it.id;
    b.style.setProperty('--rar', r.color);
    if (owned) b.classList.add('is-owned');
    if (equipped) b.classList.add('is-equipped');
    if (mode === 'locker' && !owned) b.classList.add('is-locked');

    const art = document.createElement('span');
    art.className = 'shop-card-art';
    const pic = document.createElement('span');
    pic.className = 'shop-card-skin';
    renderItemInto(pic, it.id);
    art.appendChild(pic);
    if (mode === 'locker' && !owned) art.appendChild(icon('lock', 'shop-card-lock'));

    const band = document.createElement('span');
    band.className = 'shop-card-band';
    const name = document.createElement('span');
    name.className = 'shop-card-name';
    name.textContent = it.name;
    const kind = document.createElement('span');
    kind.className = 'shop-card-rarity';
    kind.textContent = mode === 'locker' ? r.name : `${TYPES[it.type].name} · ${r.name}`;
    band.append(name, kind);

    const foot = document.createElement('span');
    foot.className = 'shop-card-foot';
    let label = `${it.name}, ${TYPES[it.type].name}, ${r.name}`;
    if (equipped) {
        foot.append(icon('check'), document.createTextNode('Équipé'));
        label += ', équipé';
    } else if (owned) {
        foot.append(icon('check'), document.createTextNode('Possédé'));
        label += ', possédé';
    } else if (it.pass) {
        foot.append(document.createTextNode('Passe'));
        foot.classList.add('is-pass');
        label += ', à gagner dans le Passe de combat';
    } else {
        foot.appendChild(pixiePrice(it.price));
        label += it.price > 0 ? `, ${fmt(it.price)} Pixies` : ', offert';
    }
    band.appendChild(foot);
    b.setAttribute('aria-label', label);
    b.append(art, band);
    return b;
}

/* ===================== ÉCRANS ===================== */

class Store {
    constructor() {
        this.view = 'lobby';
        this.filter = 'all';
        this.slot = 0;                                  // emplacement actif du chargement (index dans SLOTS)
        this.sel = Cosmetics.equippedId;                // objet affiché dans l'aperçu du casier
        this.dialogItem = null;
        this.lastFocus = null;
        this.pixies = Cosmetics.pixies;
        this.redeeming = false;

        this.el = {
            root: $('lobby-screen'),
            store: $('storeScreen'),
            locker: $('lockerScreen'),
            pixies: $('pixiesAmount'),
            pixiesBox: $('pixiesBox'),
            pixieShop: $('pixieShop'),
            psBalance: $('psBalance'),
            psPacks: $('psPacks'),
            psNote: $('psNote'),
            psForm: $('psCodeForm'),
            psCode: $('psCode'),
            psCodeBtn: $('psCodeBtn'),
            psCodeMsg: $('psCodeMsg'),
            timer: $('storeTimer'),
            filters: $('storeFilters'),
            sections: $('storeSections'),
            gift: $('storeGift'),
            giftAmount: $('giftAmount'),
            giftBtn: $('giftClaimBtn'),
            lockerCount: $('lockerCount'),
            loadoutMain: $('loadoutMain'),
            loadoutEmotes: $('loadoutEmotes'),
            lockerSkin: $('lockerSkin'),
            lockerRarity: $('lockerRarity'),
            lockerName: $('lockerName'),
            lockerSeries: $('lockerSeries'),
            lockerDesc: $('lockerDesc'),
            lockerEquip: $('lockerEquip'),
            lockerUnequip: $('lockerUnequip'),
            listTitle: $('lockerListTitle'),
            listCount: $('lockerListCount'),
            lockerGrid: $('lockerGrid'),
            dialog: $('shopDialog'),
            sdSkin: $('sdSkin'),
            sdRarity: $('sdRarity'),
            sdName: $('sdName'),
            sdSeries: $('sdSeries'),
            sdDesc: $('sdDesc'),
            sdPrice: $('sdPrice'),
            sdBalance: $('sdBalance'),
            sdMain: $('sdMain'),
            sdGiftLink: $('sdGiftLink'),
            sdMsg: $('sdMsg')
        };
        if (!this.el.store || !this.el.locker) return;

        this.buildFilters();
        this.buildPixiePacks();
        this.bind();
        this.renderPixies(true);
        this.renderAll();
        this.tickTimer();
        setInterval(() => this.tickTimer(), 1000);
        Cosmetics.onChange(() => {
            this.renderPixies();
            this.renderAll();
            if (this.dialogItem) this.fillDialog(this.dialogItem);
        });

        const fromHash = () => {
            const h = location.hash;
            if (h === '#pixies') {
                this.openPixieShop();
                return;
            }
            const view = Object.keys(HASH).find(v => HASH[v] === h) || 'lobby';
            this.show(view, false);
        };
        addEventListener('hashchange', fromHash);
        fromHash();
    }

    buildFilters() {
        const f = this.el.filters;
        if (!f) return;
        const list = [['all', 'Tout'], ...TYPE_ORDER.map(t => [t, TYPES[t].plural])];
        for (const [key, text] of list) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'shop-filter';
            b.dataset.filter = key;
            b.textContent = text;
            b.setAttribute('aria-pressed', String(key === this.filter));
            f.appendChild(b);
        }
    }

    bind() {
        const e = this.el;
        document.querySelectorAll('[data-shop-back]').forEach(b => b.addEventListener('click', () => this.show('lobby')));
        e.giftBtn?.addEventListener('click', () => this.claimGift());

        e.filters?.addEventListener('click', (ev) => {
            const b = ev.target instanceof Element ? ev.target.closest('[data-filter]') : null;
            if (!b || b.dataset.filter === this.filter) return;
            this.filter = b.dataset.filter;
            e.filters.querySelectorAll('[data-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            sfx('click');
            this.renderStore();
        });

        e.sections?.addEventListener('click', (ev) => {
            const card = ev.target instanceof Element ? ev.target.closest('.shop-card') : null;
            if (card) this.openDialog(card.dataset.item, card);
        });

        // Casier : emplacements du chargement et grille
        const onSlot = (ev) => {
            const b = ev.target instanceof Element ? ev.target.closest('[data-slot]') : null;
            if (b) this.selectSlot(Number(b.dataset.slot));
        };
        e.loadoutMain?.addEventListener('click', onSlot);
        e.loadoutEmotes?.addEventListener('click', onSlot);
        e.lockerGrid?.addEventListener('click', (ev) => {
            const card = ev.target instanceof Element ? ev.target.closest('.shop-card') : null;
            if (!card) return;
            this.sel = card.dataset.item;
            sfx('click');
            this.renderLockerGrid();
            this.renderLockerPreview();
        });
        // Double-clic sur un objet possédé : équipé directement
        e.lockerGrid?.addEventListener('dblclick', (ev) => {
            const card = ev.target instanceof Element ? ev.target.closest('.shop-card') : null;
            if (card && Cosmetics.owns(card.dataset.item)) this.lockerAction();
        });
        e.lockerEquip?.addEventListener('click', () => this.lockerAction());
        e.lockerUnequip?.addEventListener('click', () => {
            const s = SLOTS[this.slot];
            if (s.type === 'emote' && Cosmetics.unequipEmote(s.index)) sfx('unready');
        });

        // Détail d'un objet
        e.dialog?.addEventListener('click', (ev) => {
            if (ev.target === e.dialog || (ev.target instanceof Element && ev.target.closest('[data-dialog-close]'))) this.closeDialog();
        });
        e.sdMain?.addEventListener('click', () => this.dialogAction());
        e.sdGiftLink?.addEventListener('click', () => {
            this.closeDialog();
            this.claimGift();
        });

        // Boutique de Pixies (clic sur le solde du header)
        e.pixiesBox?.addEventListener('click', () => this.openPixieShop());
        e.pixieShop?.addEventListener('click', (ev) => {
            if (ev.target === e.pixieShop || (ev.target instanceof Element && ev.target.closest('[data-pixie-close]'))) {
                this.closePixieShop();
                return;
            }
            const pack = ev.target instanceof Element ? ev.target.closest('[data-pack]') : null;
            if (pack) this.pixiePackClick(pack);
        });
        e.psForm?.addEventListener('submit', (ev) => {
            ev.preventDefault();
            this.redeemCode();
        });

        document.addEventListener('keydown', (ev) => {
            const modal = [e.pixieShop, e.dialog].find(m => m && !m.hidden) || null;
            if (ev.key === 'Escape') {
                if (modal === e.pixieShop) {
                    ev.preventDefault();
                    this.closePixieShop();
                } else if (modal) {
                    ev.preventDefault();
                    this.closeDialog();
                } else if (this.view !== 'lobby' && !document.querySelector('.settings-overlay:not([hidden])')) {
                    this.show('lobby');
                }
            } else if (ev.key === 'Tab' && modal) {
                // Le focus reste dans la fenêtre ouverte
                const items = [...modal.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled])')];
                if (!items.length) return;
                const i = items.indexOf(document.activeElement);
                const next = ev.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
                ev.preventDefault();
                items[next].focus();
            }
        });
    }

    /* ----- Navigation ----- */

    show(view, updateHash = true) {
        if (view !== 'lobby' && !$(SCREEN_IDS[view])) view = 'lobby';
        const e = this.el;
        const changed = view !== this.view;
        this.view = view;
        for (const [v, id] of Object.entries(SCREEN_IDS)) {
            const el = $(id);
            if (el) el.hidden = view !== v;
        }
        e.root?.classList.toggle('shop-open', view !== 'lobby');
        document.dispatchEvent(new CustomEvent('for2d:view', { detail: { view } }));
        document.querySelectorAll('.nav-btn').forEach(b => {
            const on = (b.dataset.view || 'lobby') === view;
            b.classList.toggle('active', on);
            if (on) b.setAttribute('aria-current', 'page');
            else b.removeAttribute('aria-current');
        });
        if (updateHash) {
            const h = HASH[view] || '';
            if (location.hash !== h) history.replaceState(null, '', h || location.pathname + location.search);
        }
        if (view === 'locker' && changed) this.selectSlot(this.slot, true);
        if (changed && view !== 'lobby') {
            sfx('mode');
            $(`${view}Title`)?.focus({ preventScroll: true });
        }
    }

    /* ----- Solde, minuteur, cadeau ----- */

    renderPixies(instant = false) {
        const e = this.el;
        const v = Cosmetics.pixies;
        if (e.psBalance) e.psBalance.textContent = fmt(v);
        if (!e.pixies) return;
        e.pixiesBox?.setAttribute('aria-label', `${fmt(v)} Pixies, obtenir des Pixies`);
        if (instant) e.pixies.textContent = fmt(v);
        else if (v !== this.pixies) {
            countTo(e.pixies, this.pixies, v);
            e.pixiesBox?.classList.remove('bump');
            void e.pixiesBox?.offsetWidth;
            e.pixiesBox?.classList.add('bump');
        }
        this.pixies = v;
    }

    tickTimer() {
        const t = this.el.timer;
        if (!t) return;
        const now = new Date();
        const end = new Date(now);
        end.setHours(24, 0, 0, 0);
        const s = Math.max(0, Math.floor((end - now) / 1000));
        const hh = String(Math.floor(s / 3600)).padStart(2, '0');
        const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        t.textContent = `${hh}:${mm}:${ss}`;
        t.setAttribute('datetime', `PT${hh}H${mm}M${ss}S`);
    }

    claimGift() {
        const n = Cosmetics.claimGift();
        if (!n) return;
        sfx('ready');
        this.el.gift?.classList.add('is-claimed');
        window.lobbyManager?.showToast?.(`+${fmt(n)} Pixies ! Bonne boutique`);
        setTimeout(() => { if (this.el.gift) this.el.gift.hidden = true; }, REDUCED ? 0 : 600);
    }

    renderAll() {
        this.renderStore();
        this.renderLocker();
    }

    /* ===================== BOUTIQUE ===================== */

    renderStore() {
        const e = this.el;
        if (e.gift) {
            if (!Cosmetics.giftClaimed) {
                e.gift.hidden = false;
                e.gift.classList.remove('is-claimed');
            } else if (!e.gift.classList.contains('is-claimed')) {
                e.gift.hidden = true;
            }
            if (e.giftAmount) e.giftAmount.textContent = fmt(Cosmetics.giftAmount);
        }

        // Les objets du Passe de combat ne sont pas vendus
        const inFilter = ITEMS.filter(it => !it.pass && (this.filter === 'all' || it.type === this.filter));
        // Ordre : rareté décroissante, tenues d'abord, puis prix
        const sorted = [...inFilter].sort((a, b) =>
            rank(b) - rank(a) || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || b.price - a.price);
        const paid = sorted.filter(it => it.price > 0);
        const featured = paid.filter(it => rank(it) >= RARITY_ORDER.indexOf('epic'));
        const daily = paid.filter(it => rank(it) < RARITY_ORDER.indexOf('epic'));
        const free = sorted.filter(it => it.price <= 0);

        const sections = [];
        if (featured.length) sections.push(this.section('En vedette', 'Les objets les plus rares du moment', featured, true));
        if (daily.length) sections.push(this.section('Quotidien', 'Changent tous les jours', daily, false));
        if (free.length) sections.push(this.section('Offerts à tous', 'Déjà dans ton casier', free, false));
        if (!sections.length) {
            const p = document.createElement('p');
            p.className = 'shop-empty';
            p.textContent = 'Aucun objet dans cette catégorie pour le moment.';
            sections.push(p);
        }
        e.sections.replaceChildren(...sections);
        mountHudIcons(e.sections);
        mountHudIcons(e.store);
    }

    section(title, sub, items, featured) {
        const sec = document.createElement('section');
        sec.className = `store-section${featured ? ' is-featured' : ''}`;
        const head = document.createElement('div');
        head.className = 'store-section-head';
        const h = document.createElement('h3');
        h.className = 'store-col-title';
        h.textContent = title;
        const s = document.createElement('span');
        s.className = 'store-section-sub';
        s.textContent = sub;
        head.append(h, s);
        const grid = document.createElement('div');
        grid.className = 'store-grid';
        items.forEach((it, i) => {
            // Taille de tuile : la 1re tenue vedette est grande, les tenues sont hautes
            let size = 'small';
            if (it.type === 'outfit') size = featured && i === 0 ? 'big' : 'tall';
            grid.appendChild(makeTile(it, { size }));
        });
        sec.append(head, grid);
        return sec;
    }

    /* ===================== CASIER ===================== */

    // Objet équipé dans un emplacement du chargement (null si case d'emote vide)
    equippedIn(i) {
        const s = SLOTS[i];
        return Cosmetics.equippedOf(s.type, s.index || 0);
    }

    selectSlot(i, silent = false) {
        this.slot = Math.max(0, Math.min(SLOTS.length - 1, i));
        const eq = this.equippedIn(this.slot);
        const type = SLOTS[this.slot].type;
        this.sel = eq ? eq.id : (ITEMS.find(it => it.type === type && Cosmetics.owns(it.id)) || ITEMS.find(it => it.type === type)).id;
        if (!silent) sfx('click');
        this.renderLocker();
    }

    renderLocker() {
        const e = this.el;
        const owned = ITEMS.filter(it => Cosmetics.owns(it.id)).length;
        e.lockerCount.textContent = `${owned} / ${ITEMS.length}`;
        this.renderLoadout();
        this.renderLockerGrid();
        this.renderLockerPreview();
    }

    renderLoadout() {
        const e = this.el;
        const main = [];
        const emotes = [];
        SLOTS.forEach((s, i) => {
            const it = this.equippedIn(i);
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `loadout-slot type-${s.type}`;
            b.dataset.slot = String(i);
            b.setAttribute('aria-pressed', String(i === this.slot));
            b.classList.toggle('is-active', i === this.slot);
            const pic = document.createElement('span');
            pic.className = 'loadout-pic';
            const txt = document.createElement('span');
            txt.className = 'loadout-text';
            const cat = document.createElement('span');
            cat.className = 'loadout-cat';
            cat.textContent = s.type === 'emote' ? `Emote ${s.index + 1}` : TYPES[s.type].name;
            const name = document.createElement('span');
            name.className = 'loadout-name';
            if (it) {
                b.style.setProperty('--rar', rarityOf(it).color);
                renderItemInto(pic, it.id);
                name.textContent = it.name;
            } else {
                b.classList.add('is-empty');
                pic.appendChild(icon('plus'));
                name.textContent = 'Vide';
            }
            txt.append(cat, name);
            b.append(pic, txt);
            b.setAttribute('aria-label', `${cat.textContent} : ${it ? it.name : 'vide'}`);
            (s.type === 'emote' ? emotes : main).push(b);
        });
        e.loadoutMain.replaceChildren(...main);
        e.loadoutEmotes.replaceChildren(...emotes);
        mountHudIcons(e.loadoutMain);
        mountHudIcons(e.loadoutEmotes);
    }

    renderLockerGrid() {
        const e = this.el;
        const type = SLOTS[this.slot].type;
        const list = ITEMS.filter(it => it.type === type).sort((a, b) =>
            (Cosmetics.owns(b.id) - Cosmetics.owns(a.id)) || rank(a) - rank(b));
        const have = list.filter(it => Cosmetics.owns(it.id)).length;
        e.listTitle.textContent = TYPES[type].plural;
        e.listCount.textContent = `${have} / ${list.length} possédés`;
        e.lockerGrid.dataset.type = type;
        e.lockerGrid.replaceChildren(...list.map(it => {
            const c = makeTile(it, { size: 'small', mode: 'locker' });
            const on = it.id === this.sel;
            c.classList.toggle('is-selected', on);
            c.setAttribute('aria-pressed', String(on));
            return c;
        }));
        mountHudIcons(e.lockerGrid);
    }

    renderLockerPreview() {
        const e = this.el;
        const it = getItem(this.sel) || this.equippedIn(0);
        const slot = SLOTS[this.slot];
        const preview = e.lockerSkin.closest('.locker-preview');
        // Tenue : le personnage avec le sac équipé ; sinon l'objet en grand
        const key = `${it.id}|${Cosmetics.equippedOf('backpack').id}`;
        if (e.lockerSkin.dataset.key !== key) {
            if (it.type === 'outfit') renderSkinInto(e.lockerSkin, it.id, { pack: Cosmetics.equippedOf('backpack') });
            else renderItemInto(e.lockerSkin, it.id);
            e.lockerSkin.dataset.key = key;
            preview?.classList.remove('swap');
            void preview?.offsetWidth;
            preview?.classList.add('swap');
        }
        preview?.classList.toggle('is-item', it.type !== 'outfit');
        preview?.style.setProperty('--rar', rarityOf(it).color);
        setRarityBadge(e.lockerRarity, it);
        e.lockerName.textContent = it.name;
        e.lockerSeries.textContent = `${TYPES[it.type].name}${it.series ? ` · Série ${it.series}` : ''}`;
        let desc = it.desc || '';
        if (it.type === 'emote') desc += ' (Bientôt jouable en partie.)';
        e.lockerDesc.textContent = desc;

        const btn = e.lockerEquip;
        const label = btn.querySelector('span') || btn;
        btn.classList.remove('is-done', 'is-buy');
        btn.disabled = false;
        const inThisSlot = this.equippedIn(this.slot)?.id === it.id;
        if (inThisSlot) {
            label.textContent = 'Équipé';
            btn.classList.add('is-done');
            btn.disabled = true;
        } else if (Cosmetics.owns(it.id)) {
            label.textContent = slot.type === 'emote' ? `Équiper en emote ${slot.index + 1}` : 'Équiper';
        } else if (it.pass) {
            label.textContent = 'Voir le Passe de combat';
            btn.classList.add('is-buy');
        } else {
            label.textContent = `Voir en boutique · ${fmt(it.price)} P`;
            btn.classList.add('is-buy');
        }
        e.lockerUnequip.hidden = !(slot.type === 'emote' && this.equippedIn(this.slot));
    }

    lockerAction() {
        const it = getItem(this.sel);
        if (!it) return;
        const slot = SLOTS[this.slot];
        if (Cosmetics.owns(it.id)) {
            if (Cosmetics.equip(it.id, slot.type === 'emote' ? slot.index : undefined)) {
                sfx('ready');
                window.lobbyManager?.showToast?.(`${it.name} équipé`);
            }
        } else if (it.pass) {
            this.show('pass');
        } else {
            this.show('store');
            this.openDialog(it.id);
        }
    }

    /* ===================== DÉTAIL / ACHAT ===================== */

    openDialog(id, from = null) {
        const e = this.el;
        if (!e.dialog || !getItem(id)) return;
        this.lastFocus = from || document.activeElement;
        this.dialogItem = id;
        e.sdMsg.textContent = '';
        e.dialog.classList.remove('bought');
        this.fillDialog(id);
        e.dialog.hidden = false;
        sfx('click');
        requestAnimationFrame(() => e.sdMain.focus({ preventScroll: true }));
    }

    fillDialog(id) {
        const e = this.el;
        const it = getItem(id);
        if (!it) return;
        const box = e.dialog.querySelector('.shop-dialog');
        box?.style.setProperty('--rar', rarityOf(it).color);
        box?.classList.toggle('is-item', it.type !== 'outfit');
        renderItemInto(e.sdSkin, it.id);
        setRarityBadge(e.sdRarity, it);
        e.sdName.textContent = it.name;
        e.sdSeries.textContent = `${TYPES[it.type].name}${it.series ? ` · Série ${it.series}` : ''}`;
        e.sdDesc.textContent = it.desc || '';
        e.sdPrice.replaceChildren(pixiePrice(it.price));
        e.sdBalance.textContent = `Ton solde : ${fmt(Cosmetics.pixies)} Pixies`;

        const owned = Cosmetics.owns(it.id);
        const equipped = Cosmetics.isEquipped(it.id);
        const missing = Math.max(0, it.price - Cosmetics.pixies);
        const label = e.sdMain.querySelector('span') || e.sdMain;
        e.sdMain.disabled = false;
        e.sdMain.classList.remove('is-done');
        e.sdGiftLink.hidden = true;
        if (equipped) {
            label.textContent = 'Équipé';
            e.sdMain.disabled = true;
            e.sdMain.classList.add('is-done');
        } else if (owned) {
            label.textContent = 'Équiper';
        } else if (missing > 0) {
            label.textContent = `Il te manque ${fmt(missing)} Pixies`;
            e.sdMain.disabled = true;
            e.sdGiftLink.hidden = Cosmetics.giftClaimed;
        } else {
            label.textContent = `Acheter · ${fmt(it.price)} P`;
        }
    }

    dialogAction() {
        const e = this.el;
        const it = getItem(this.dialogItem);
        if (!it) return;
        if (Cosmetics.owns(it.id)) {
            if (Cosmetics.equip(it.id)) {
                sfx('ready');
                e.sdMsg.textContent = `${it.name} est équipé !`;
            }
            return;
        }
        const r = Cosmetics.buy(it.id);
        if (r.ok) {
            sfx('ready');
            e.dialog.classList.remove('bought');
            void e.dialog.offsetWidth;
            e.dialog.classList.add('bought');
            e.sdMsg.textContent = `${it.name} ajouté à ton casier. Équipe-le !`;
            this.fillDialog(it.id);
            e.sdMain.focus({ preventScroll: true });
        } else if (r.reason === 'funds') {
            e.sdMsg.textContent = 'Pas assez de Pixies.';
        }
    }

    closeDialog() {
        const e = this.el;
        if (!e.dialog || e.dialog.hidden) return;
        e.dialog.hidden = true;
        this.dialogItem = null;
        const back = this.lastFocus && document.contains(this.lastFocus) ? this.lastFocus : null;
        (back || $('storeTitle'))?.focus?.({ preventScroll: true });
    }

    /* ===================== BOUTIQUE DE PIXIES ===================== */

    buildPixiePacks() {
        const box = this.el.psPacks;
        if (!box) return;
        PIXIE_PACKS.forEach((p, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `ps-pack level-${p.level}${p.tag ? ' has-tag' : ''}`;
            b.dataset.pack = String(i);
            const total = p.amount;
            b.setAttribute('aria-label', `${fmt(total)} Pixies${p.bonus ? `, dont ${fmt(p.bonus)} en bonus` : ''}, ${p.price}`);
            b.innerHTML =
                (p.tag ? '<span class="ps-tag"></span>' : '') +
                `<span class="ps-art">${pixieCoinsSvg(p.level)}</span>` +
                '<span class="ps-amount"><span class="currency-icon pixie" aria-hidden="true">P</span><span class="ps-amount-n"></span></span>' +
                '<span class="ps-bonus"></span>' +
                '<span class="ps-price"></span>';
            if (p.tag) b.querySelector('.ps-tag').textContent = p.tag;
            b.querySelector('.ps-amount-n').textContent = fmt(total);
            b.querySelector('.ps-bonus').textContent = p.bonus ? `dont ${fmt(p.bonus)} en bonus` : 'Pack de départ';
            b.querySelector('.ps-price').textContent = p.price;
            box.appendChild(b);
        });
        if (this.el.pixieShop) mountHudIcons(this.el.pixieShop);
    }

    openPixieShop() {
        const e = this.el;
        if (!e.pixieShop) return;
        if (!e.dialog?.hidden) this.closeDialog();
        this.psFocus = document.activeElement;
        e.psNote.textContent = '';
        this.setCodeMsg('');
        this.renderPixies(true);
        e.pixieShop.hidden = false;
        sfx('click');
        requestAnimationFrame(() => e.psCode?.focus({ preventScroll: true }));
    }

    closePixieShop() {
        const e = this.el;
        if (!e.pixieShop || e.pixieShop.hidden) return;
        e.pixieShop.hidden = true;
        if (e.psCode) e.psCode.value = '';
        const back = this.psFocus && document.contains(this.psFocus) ? this.psFocus : e.pixiesBox;
        back?.focus?.({ preventScroll: true });
    }

    // Pas encore de système de paiement : on le dit clairement
    pixiePackClick(btn) {
        const e = this.el;
        sfx('unready');
        e.psNote.textContent = 'Le paiement n\'est pas encore disponible. Reviens bientôt !';
        e.psNote.classList.remove('flash');
        btn.classList.remove('shake');
        void btn.offsetWidth;
        btn.classList.add('shake');
        e.psNote.classList.add('flash');
    }

    setCodeMsg(text, kind = '') {
        const m = this.el.psCodeMsg;
        if (!m) return;
        m.textContent = text;
        m.classList.toggle('is-ok', kind === 'ok');
        m.classList.toggle('is-error', kind === 'error');
    }

    /*
       Code secret : vérifié uniquement par le serveur (server/server.js),
       qui ne garde que des empreintes des codes. Le navigateur n'a donc
       aucune liste de codes à cacher.
    */
    async redeemCode() {
        const e = this.el;
        if (this.redeeming || !e.psCode) return;
        const code = e.psCode.value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
        if (!code) {
            this.setCodeMsg('Entre un code.', 'error');
            e.psCode.focus();
            return;
        }
        if (code.length > 32) {
            this.setCodeMsg('Code invalide.', 'error');
            return;
        }

        this.redeeming = true;
        e.psCodeBtn.disabled = true;
        this.setCodeMsg('Vérification…');
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 10000);
        try {
            const res = await fetch('/api/redeem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
                cache: 'no-store',
                signal: ctrl.signal
            });
            // Serveur sans codes (Python, fichier ouvert directement...) : pas de réponse JSON
            if (!(res.headers.get('content-type') || '').includes('application/json')) {
                this.setCodeMsg('Codes indisponibles : lance le jeu avec LANCER_SERVEUR.bat.', 'error');
                return;
            }
            const data = await res.json();
            if (data.ok && typeof data.id === 'string' && Number.isInteger(data.reward)) {
                if (Cosmetics.hasRedeemed(data.id)) {
                    this.setCodeMsg('Tu as déjà utilisé ce code.', 'error');
                } else if (Cosmetics.redeem(data.id, data.reward)) {
                    e.psCode.value = '';
                    sfx('ready');
                    this.setCodeMsg(`Code accepté : +${fmt(data.reward)} Pixies !`, 'ok');
                    window.lobbyManager?.showToast?.(`+${fmt(data.reward)} Pixies !`);
                }
            } else if (data.reason === 'rate') {
                const min = Math.max(1, Math.ceil((Number(data.retryAfter) || 60) / 60));
                this.setCodeMsg(`Trop d'essais. Réessaie dans ${min} min.`, 'error');
            } else if (data.reason === 'busy') {
                this.setCodeMsg('Serveur occupé, réessaie dans un instant.', 'error');
            } else {
                sfx('unready');
                this.setCodeMsg('Code invalide.', 'error');
            }
        } catch {
            this.setCodeMsg('Serveur injoignable, réessaie.', 'error');
        } finally {
            clearTimeout(timer);
            this.redeeming = false;
            e.psCodeBtn.disabled = false;
        }
    }
}

function init() {
    const store = new Store();
    window.FOR2D_STORE = { show: (v) => store.show(v), openPixies: () => store.openPixieShop() };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
