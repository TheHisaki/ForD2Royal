/* ==================================
   PASSE DE COMBAT, PROFIL, CLASSEMENTS - FOR2D ROYAL
   Écrans du lobby branchés sur js/progress.js (niveau, stats, passe)
   et js/cosmetics.js (objets, Pixies). L'affichage des écrans (onglets,
   adresse #passe / #profil / #classements) est géré par js/lobby-store.js.

   - Passe : 30 paliers (1 niveau = 1 palier), piste gratuite + premium
     (achat en Pixies, confirmation en 2 clics), récompenses à récupérer.
   - Profil : pseudo modifiable, niveau, collection, statistiques, dernières parties.
   - Classements : Victoires / Éliminations / Niveau / Top 10. Hors ligne, les
     autres joueurs sont simulés (mêmes chiffres pour toute la journée) ;
     les chiffres du joueur sont les vrais.
   - Carte « saison » du lobby : vrai niveau, XP et palier.
   ================================== */

import { Cosmetics, getItem, RARITY, TYPES, ITEMS, SKINS } from './cosmetics.js';
import { Progress, PASS_REWARDS, PASS_TIERS, PASS_PRICE, applyXp } from './progress.js';
import { renderItemInto, renderSkinInto } from './lobby-skin.js';
import { pixieCoinsSvg } from './lobby-store.js';
import { mountHudIcons } from './game/hud-icons.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('fr-FR');
const sfx = (name) => window.SFX?.play(name);
const toast = (msg) => window.lobbyManager?.showToast?.(msg);
const PIXIE_COLOR = '#ff8fdc';
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function duration(sec) {
    const t = Math.max(0, Math.floor(sec || 0));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min ${String(t % 60).padStart(2, '0')}`;
}

const mmss = (sec) => {
    const t = Math.max(0, Math.floor(sec || 0));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

function ago(ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'à l\'instant';
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    const d = Math.floor(s / 86400);
    return d === 1 ? 'hier' : `il y a ${d} jours`;
}

function setXpBar(bar, fill, xp, max) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (xp / max) * 100)) : 0;
    if (fill) fill.style.width = `${pct.toFixed(1)}%`;
    if (bar) {
        bar.setAttribute('aria-valuemax', String(max));
        bar.setAttribute('aria-valuenow', String(xp));
        bar.setAttribute('aria-valuetext', `${fmt(xp)} sur ${fmt(max)} XP`);
    }
}

const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
};

/* ===================== RÉCOMPENSES DU PASSE ===================== */

const rewardItem = (r) => (r.kind === 'item' ? getItem(r.item) : null);
const rewardName = (r) => (r.kind === 'item' ? rewardItem(r)?.name || 'Objet' : `${fmt(r.amount)} Pixies`);
const rewardColor = (r) => (r.kind === 'item' ? (RARITY[rewardItem(r)?.rarity] || RARITY.common).color : PIXIE_COLOR);

function rewardArt(target, r) {
    if (r.kind === 'item') {
        renderItemInto(target, r.item);
    } else {
        target.classList.remove('skin-render', 'item-render');
        target.classList.add('pixie-render');
        target.innerHTML = pixieCoinsSvg(r.amount >= 200 ? 3 : r.amount >= 100 ? 2 : 1);
    }
}

/* ===================== CLASSEMENT SIMULÉ ===================== */

const SEASON_START = new Date(2026, 8, 1).getTime(); // 1er septembre 2026
const BOT_COUNT = 99;
const NAMES = [
    'PixelPirate', 'NoScopeNina', 'LamaFurtif', 'CorruptedKai', 'BuildBob', 'Zyra', 'MaxiMousse', 'SkyLeo',
    'KiwiKamikaze', 'Luna.exe', 'FragTonton', 'CapitaineCrepe', 'Nox', 'RushRaph', 'SoloSam', 'MimiNinja',
    'Tacos2D', 'BaguetteSniper', 'LeGrosLoot', 'PiocheMagique', 'OrbitOscar', 'Vortex', 'ZoneZoe', 'GlitchGus',
    'HugoUltra', 'Pepito', 'Nuage', 'CrocoRoyal', 'BoucheurDeMur', 'StormyStan', 'JadeV', 'Rafale', 'Mael2D',
    'CactusKid', 'LilouOP', 'Titan', 'Ecl1pse', 'Brioche', 'SacAPixies', 'MegaMax', 'Poulpe', 'Yuna', 'Kraken',
    'LootLucas', 'NinjaNoah', 'InesTopOne', 'Ryuu', 'Choco', 'Bastion', 'Flocon', 'Zigzag', 'Ombrelune',
    'TurboTom', 'Mangue', 'Sushi_Sam', 'Comete', 'Grizzli', 'Neon', 'Papillon', 'Rocket'
];

// Générateur pseudo-aléatoire reproductible (mulberry32)
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

let botCache = null;
function simulatedPlayers() {
    const day = Math.max(1, Math.floor((Date.now() - SEASON_START) / 86400000) + 1);
    if (botCache && botCache.day === day) return botCache.list;
    const outfits = SKINS.filter(s => !s.pass);
    const list = [];
    for (let i = 0; i < BOT_COUNT; i++) {
        const base = rng(1000 + i * 7919);                  // caractère du joueur (fixe)
        const today = rng(day * 131 + i * 17);              // petite variation du jour
        const skill = base() ** 2;                          // la plupart sont des joueurs moyens
        const perDay = 0.2 + base() * 2.3;                  // parties par jour
        const matches = Math.max(1, Math.round(day * perDay * (0.9 + today() * 0.2)));
        const wins = Math.round(matches * (0.01 + skill * 0.22));
        const top10 = Math.max(wins, Math.round(matches * (0.12 + skill * 0.5)));
        const kills = Math.round(matches * (0.4 + skill * 3.4));
        const xp = Math.round(matches * (110 + skill * 420));
        const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? String(Math.floor(base() * 90) + 10) : '');
        list.push({
            name, wins, top10, kills, matches,
            level: applyXp(1, 0, xp).level,
            outfit: outfits[Math.floor(base() * outfits.length)].id
        });
    }
    botCache = { day, list };
    return list;
}

const RANK_TABS = [
    { id: 'wins', label: 'Victoires', value: (p) => p.wins },
    { id: 'kills', label: 'Éliminations', value: (p) => p.kills },
    { id: 'level', label: 'Niveau', value: (p) => p.level },
    { id: 'top10', label: 'Top 10', value: (p) => p.top10 }
];

/* ===================== ÉCRANS ===================== */

class Hub {
    constructor() {
        this.view = 'lobby';
        this.passSel = null;        // récompense affichée dans le détail du passe
        this.buyArmed = 0;          // achat du passe : 2e clic attendu avant cette date
        this.rankTab = 'wins';

        this.e = {
            // Carte saison du lobby
            season: document.querySelector('.season-info'),
            // Passe
            pass: $('passScreen'),
            tierNow: $('passTierNow'),
            tierMax: $('passTierMax'),
            claimAll: $('passClaimAll'),
            buy: $('passBuyBtn'),
            badge: $('passPremiumBadge'),
            passLevelNum: $('passLevelNum'),
            passLevelText: $('passLevelText'),
            passXpBar: $('passXpBar'),
            passXpFill: $('passXpFill'),
            passXpText: $('passXpText'),
            passMsg: $('passMsg'),
            track: $('passTrack'),
            dArt: $('passDetailArt'),
            dRarity: $('passDetailRarity'),
            dName: $('passDetailName'),
            dMeta: $('passDetailMeta'),
            dBtn: $('passDetailBtn'),
            // Profil
            profile: $('profileScreen'),
            pSkin: $('profileSkin'),
            pForm: $('profileNameForm'),
            pName: $('profileName'),
            pNameMsg: $('profileNameMsg'),
            pLevelNum: $('profileLevelNum'),
            pLevelText: $('profileLevelText'),
            pXpBar: $('profileXpBar'),
            pXpFill: $('profileXpFill'),
            pXpText: $('profileXpText'),
            pCollection: $('profileCollection'),
            pStats: $('profileStats'),
            pHistory: $('profileHistory'),
            pHistoryCount: $('profileHistoryCount'),
            // Classements
            ranks: $('ranksScreen'),
            rTabs: $('ranksTabs'),
            rPodium: $('ranksPodium'),
            rList: $('ranksList'),
            rMe: $('ranksMe'),
            rValueHead: $('ranksValueHead')
        };

        this.bind();
        this.renderSeason();
        this.syncLobbyName();
        Progress.onChange(() => this.refresh());
        Cosmetics.onChange(() => this.refresh());
        // L'écran affiché au chargement (#passe...) a pu être choisi avant ce module
        const current = Object.entries({ pass: this.e.pass, profile: this.e.profile, ranks: this.e.ranks })
            .find(([, s]) => s && !s.hidden);
        if (current) this.onView(current[0]);
    }

    bind() {
        const e = this.e;
        document.addEventListener('for2d:view', (ev) => this.onView(ev.detail?.view));
        document.addEventListener('click', (ev) => {
            const b = ev.target instanceof Element ? ev.target.closest('[data-open-view]') : null;
            if (b) window.FOR2D_STORE?.show(b.dataset.openView);
        });

        // Passe
        e.track?.addEventListener('click', (ev) => {
            const card = ev.target instanceof Element ? ev.target.closest('[data-reward]') : null;
            if (!card) return;
            this.passSel = card.dataset.reward;
            sfx('click');
            this.renderPassTrack();
            this.renderPassDetail();
        });
        e.track?.addEventListener('dblclick', (ev) => {
            const card = ev.target instanceof Element ? ev.target.closest('[data-reward]') : null;
            if (card) this.claim(card.dataset.reward);
        });
        // Molette verticale -> défilement horizontal des paliers
        e.track?.addEventListener('wheel', (ev) => {
            if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return;
            ev.preventDefault();
            e.track.scrollLeft += ev.deltaY;
        }, { passive: false });
        e.dBtn?.addEventListener('click', () => this.passDetailAction());
        e.claimAll?.addEventListener('click', () => this.claimAll());
        e.buy?.addEventListener('click', () => this.buyPremium());

        // Profil
        e.pForm?.addEventListener('submit', (ev) => {
            ev.preventDefault();
            const name = Progress.setName(e.pName.value);
            e.pName.value = name;
            e.pNameMsg.textContent = `Pseudo enregistré : ${name}`;
            sfx('ready');
            this.syncLobbyName();
        });

        // Classements
        if (e.rTabs) {
            for (const t of RANK_TABS) {
                const b = el('button', 'shop-filter', t.label);
                b.type = 'button';
                b.dataset.rank = t.id;
                b.setAttribute('aria-pressed', String(t.id === this.rankTab));
                e.rTabs.appendChild(b);
            }
            e.rTabs.addEventListener('click', (ev) => {
                const b = ev.target instanceof Element ? ev.target.closest('[data-rank]') : null;
                if (!b || b.dataset.rank === this.rankTab) return;
                this.rankTab = b.dataset.rank;
                e.rTabs.querySelectorAll('[data-rank]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
                sfx('click');
                this.renderRanks();
            });
        }
    }

    onView(view) {
        const was = this.view;
        this.view = view || 'lobby';
        if (this.view === 'pass') {
            this.renderPass();
            if (was !== 'pass') this.scrollToTier();
        } else if (this.view === 'profile') {
            this.renderProfile();
        } else if (this.view === 'ranks') {
            this.renderRanks();
        }
    }

    // Données changées (partie jouée dans un autre onglet, achat, récompense...)
    refresh() {
        this.renderSeason();
        if (this.view === 'pass') this.renderPass();
        else if (this.view === 'profile') this.renderProfile();
        else if (this.view === 'ranks') this.renderRanks();
    }

    /* ----- Lobby : carte de saison + pseudo ----- */

    renderSeason() {
        const c = this.e.season;
        if (!c) return;
        const lv = Progress.level;
        const xp = Progress.xp;
        const max = Progress.xpMax;
        c.querySelectorAll('.level-number, .level-number-text').forEach(n => { n.textContent = String(lv); });
        setXpBar(c.querySelector('.xp-bar'), c.querySelector('.xp-progress'), xp, max);
        const t = c.querySelector('.xp-text');
        if (t) t.textContent = `${fmt(xp)} / ${fmt(max)} XP`;
        const pt = c.querySelector('.pass-text');
        if (pt) pt.textContent = Progress.passPremium ? 'Passe premium' : 'Passe gratuit';
        const tier = c.querySelector('.pass-tier');
        if (tier) tier.textContent = `Palier ${Progress.tier}`;
        const info = c.querySelector('.pass-info');
        const n = Progress.claimable().length;
        if (info) {
            info.textContent = n ? `${n} récompense${n > 1 ? 's' : ''} à récupérer !` : 'Joue des parties pour gagner de l\'XP.';
            info.classList.toggle('has-rewards', n > 0);
        }
    }

    syncLobbyName() {
        const apply = () => {
            const lm = window.lobbyManager;
            if (!lm?.players?.[0]) return;
            lm.players[0].name = Progress.name;
            lm.updateUI?.();
        };
        if (window.lobbyManager) apply();
        else document.addEventListener('DOMContentLoaded', apply, { once: true });
    }

    /* ===================== PASSE ===================== */

    renderPass() {
        const e = this.e;
        if (!e.pass) return;
        const lv = Progress.level;
        e.tierNow.textContent = String(Progress.tier);
        e.tierMax.textContent = String(PASS_TIERS);
        e.passLevelNum.textContent = String(lv);
        e.passLevelText.textContent = String(lv);
        setXpBar(e.passXpBar, e.passXpFill, Progress.xp, Progress.xpMax);
        e.passXpText.textContent = lv >= PASS_TIERS
            ? `${fmt(Progress.xp)} / ${fmt(Progress.xpMax)} XP · passe terminé !`
            : `${fmt(Progress.xp)} / ${fmt(Progress.xpMax)} XP`;

        const n = Progress.claimable().length;
        e.claimAll.disabled = n === 0;
        (e.claimAll.querySelector('span') || e.claimAll).textContent = n ? `Tout récupérer (${n})` : 'Tout récupérer';

        const premium = Progress.passPremium;
        e.buy.hidden = premium;
        e.badge.hidden = !premium;
        if (!premium) {
            const armed = Date.now() < this.buyArmed;
            (e.buy.querySelector('span') || e.buy).textContent = armed
                ? `Confirmer · ${fmt(PASS_PRICE)} P`
                : `Passe premium · ${fmt(PASS_PRICE)} P`;
            e.buy.classList.toggle('is-armed', armed);
        }

        if (!this.passSel || !PASS_REWARDS.some(r => r.id === this.passSel)) this.passSel = this.defaultReward().id;
        this.renderPassTrack();
        this.renderPassDetail();
    }

    // À montrer d'abord : une récompense à récupérer, sinon la prochaine à débloquer
    defaultReward() {
        return Progress.claimable()[0]
            || PASS_REWARDS.find(r => r.tier > Progress.tier && r.track === 'premium')
            || PASS_REWARDS[PASS_REWARDS.length - 1];
    }

    card(r) {
        const b = el('button', `pass-card track-${r.track}`);
        b.type = 'button';
        b.dataset.reward = r.id;
        b.style.setProperty('--rar', rewardColor(r));
        const unlocked = Progress.isUnlocked(r);
        const claimed = Progress.isClaimed(r);
        b.classList.toggle('is-claimed', claimed);
        b.classList.toggle('is-claimable', unlocked && !claimed);
        b.classList.toggle('is-locked', !unlocked);
        b.classList.toggle('is-selected', r.id === this.passSel);
        b.setAttribute('aria-pressed', String(r.id === this.passSel));

        const art = el('span', 'pass-card-art');
        rewardArt(art, r);
        const name = el('span', 'pass-card-name', rewardName(r));
        b.append(art, name);
        if (claimed || !unlocked) {
            const s = el('span', 'hud-ico pass-card-state');
            s.dataset.icon = claimed ? 'check' : 'lock';
            s.setAttribute('aria-hidden', 'true');
            b.appendChild(s);
        }
        const state = claimed ? 'récupéré' : unlocked ? 'à récupérer' : r.track === 'premium' && !Progress.passPremium && r.tier <= Progress.tier ? 'passe premium requis' : `niveau ${r.tier} requis`;
        b.setAttribute('aria-label', `Palier ${r.tier}, ${r.track === 'free' ? 'gratuit' : 'premium'} : ${rewardName(r)}, ${state}`);
        return b;
    }

    renderPassTrack() {
        const e = this.e;
        const tier = Progress.tier;
        const cols = [];
        for (let t = 1; t <= PASS_TIERS; t++) {
            const col = el('div', 'pass-col');
            col.setAttribute('role', 'listitem');
            col.dataset.tier = String(t);
            col.classList.toggle('is-reached', t <= tier);
            col.classList.toggle('is-current', t === tier);
            const num = el('span', 'pass-col-num', String(t));
            const free = PASS_REWARDS.find(r => r.tier === t && r.track === 'free');
            const prem = PASS_REWARDS.find(r => r.tier === t && r.track === 'premium');
            col.append(num, free ? this.card(free) : el('span', 'pass-card is-empty'), prem ? this.card(prem) : el('span', 'pass-card is-empty'));
            cols.push(col);
        }
        const left = e.track.scrollLeft;
        e.track.replaceChildren(...cols);
        e.track.scrollLeft = left;
        mountHudIcons(e.track);
    }

    scrollToTier() {
        const col = this.e.track?.querySelector(`[data-tier="${Math.max(1, Progress.tier - 2)}"]`);
        if (col) this.e.track.scrollLeft = col.offsetLeft - this.e.track.offsetLeft;
    }

    renderPassDetail() {
        const e = this.e;
        const r = PASS_REWARDS.find(x => x.id === this.passSel);
        if (!r) return;
        const it = rewardItem(r);
        const detail = e.dArt.closest('.pass-detail');
        detail?.style.setProperty('--rar', rewardColor(r));
        detail?.classList.toggle('is-outfit', it?.type === 'outfit');
        rewardArt(e.dArt, r);
        if (it) {
            e.dRarity.textContent = (RARITY[it.rarity] || RARITY.common).name;
            e.dRarity.style.setProperty('--rar', rewardColor(r));
        } else {
            e.dRarity.textContent = 'Pixies';
            e.dRarity.style.setProperty('--rar', PIXIE_COLOR);
        }
        e.dName.textContent = rewardName(r);
        const kind = it ? TYPES[it.type].name : 'Monnaie';
        e.dMeta.textContent = `${kind} · Palier ${r.tier} · ${r.track === 'free' ? 'Gratuit' : 'Premium'}${it?.desc ? ` — ${it.desc}` : ''}`;

        const btn = e.dBtn;
        const label = btn.querySelector('span') || btn;
        btn.disabled = false;
        btn.classList.remove('is-done', 'is-premium');
        if (Progress.isClaimed(r)) {
            if (it) {
                label.textContent = 'Voir dans le casier';
            } else {
                label.textContent = 'Récupéré';
                btn.disabled = true;
                btn.classList.add('is-done');
            }
        } else if (Progress.isUnlocked(r)) {
            label.textContent = 'Récupérer';
        } else if (r.tier > Progress.tier) {
            label.textContent = `Niveau ${r.tier} requis`;
            btn.disabled = true;
        } else {
            label.textContent = `Débloquer le premium · ${fmt(PASS_PRICE)} P`;
            btn.classList.add('is-premium');
        }
    }

    passDetailAction() {
        const r = PASS_REWARDS.find(x => x.id === this.passSel);
        if (!r) return;
        if (Progress.isClaimed(r)) {
            if (r.kind === 'item') window.FOR2D_STORE?.show('locker');
        } else if (Progress.isUnlocked(r)) {
            this.claim(r.id);
        } else if (r.tier <= Progress.tier) {
            this.buyPremium();
        }
    }

    claim(id) {
        const r = PASS_REWARDS.find(x => x.id === id);
        if (!r || !Progress.claim(r)) return;
        sfx('ready');
        this.e.passMsg.textContent = r.kind === 'item'
            ? `${rewardName(r)} ajouté à ton casier !`
            : `+${fmt(r.amount)} Pixies !`;
        toast(r.kind === 'item' ? `${rewardName(r)} débloqué` : `+${fmt(r.amount)} Pixies`);
        this.pop(id);
    }

    claimAll() {
        const list = Progress.claimAll();
        if (!list.length) return;
        sfx('ready');
        const pixies = list.filter(r => r.kind === 'pixies').reduce((s, r) => s + r.amount, 0);
        const items = list.filter(r => r.kind === 'item').length;
        const parts = [];
        if (items) parts.push(`${items} objet${items > 1 ? 's' : ''}`);
        if (pixies) parts.push(`${fmt(pixies)} Pixies`);
        this.e.passMsg.textContent = `Récupéré : ${parts.join(' et ')} !`;
        toast(`Passe : ${parts.join(' + ')}`);
    }

    // Petit effet sur la carte récupérée (après le nouveau rendu)
    pop(id) {
        if (REDUCED) return;
        requestAnimationFrame(() => this.e.track?.querySelector(`[data-reward="${id}"]`)?.classList.add('pop'));
    }

    // Achat en 2 clics : le premier arme le bouton pendant 4 s
    buyPremium() {
        const e = this.e;
        if (Progress.passPremium) return;
        if (Cosmetics.pixies < PASS_PRICE) {
            sfx('unready');
            e.passMsg.textContent = `Il te manque ${fmt(PASS_PRICE - Cosmetics.pixies)} Pixies pour le passe premium.`;
            window.FOR2D_STORE?.openPixies?.();
            return;
        }
        if (Date.now() >= this.buyArmed) {
            this.buyArmed = Date.now() + 4000;
            e.passMsg.textContent = `Clique encore pour dépenser ${fmt(PASS_PRICE)} Pixies.`;
            this.renderPass();
            clearTimeout(this.buyTimer);
            this.buyTimer = setTimeout(() => {
                this.buyArmed = 0;
                if (this.view === 'pass') this.renderPass();
            }, 4000);
            return;
        }
        this.buyArmed = 0;
        clearTimeout(this.buyTimer);
        const res = Progress.buyPremium();
        if (res.ok) {
            sfx('victory');
            const n = Progress.claimable().length;
            e.passMsg.textContent = `Passe premium débloqué !${n ? ` ${n} récompense${n > 1 ? 's' : ''} t'attend${n > 1 ? 'ent' : ''}.` : ''}`;
            toast('Passe premium débloqué');
        } else if (res.reason === 'funds') {
            e.passMsg.textContent = 'Pas assez de Pixies.';
        }
        this.renderPass();
    }

    /* ===================== PROFIL ===================== */

    renderProfile() {
        const e = this.e;
        if (!e.profile) return;
        renderSkinInto(e.pSkin, Cosmetics.equippedId, { pack: Cosmetics.equippedOf('backpack') });
        if (document.activeElement !== e.pName) e.pName.value = Progress.name;

        e.pLevelNum.textContent = String(Progress.level);
        e.pLevelText.textContent = String(Progress.level);
        setXpBar(e.pXpBar, e.pXpFill, Progress.xp, Progress.xpMax);
        e.pXpText.textContent = `${fmt(Progress.xp)} / ${fmt(Progress.xpMax)} XP · Palier ${Progress.tier}${Progress.passPremium ? ' · Premium' : ''}`;

        // Collection par catégorie
        e.pCollection.replaceChildren(...Object.keys(TYPES).map(t => {
            const all = ITEMS.filter(it => it.type === t);
            const have = all.filter(it => Cosmetics.owns(it.id)).length;
            const li = el('li', 'profile-coll');
            li.append(el('span', 'profile-coll-name', TYPES[t].plural), el('span', 'profile-coll-n', `${have} / ${all.length}`));
            const bar = el('span', 'profile-coll-bar');
            bar.setAttribute('aria-hidden', 'true');
            const fill = el('span');
            fill.style.width = `${(have / Math.max(1, all.length)) * 100}%`;
            bar.appendChild(fill);
            li.appendChild(bar);
            return li;
        }));

        // Statistiques
        const s = Progress.stats;
        const pct = (a, b) => (b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString('fr-FR')} %` : '—');
        const ratio = (a, b) => (b ? (Math.round((a / b) * 100) / 100).toLocaleString('fr-FR') : a ? fmt(a) : '—');
        const tiles = [
            ['Parties jouées', fmt(s.matches), ''],
            ['Victoires Royales', fmt(s.wins), 'is-gold'],
            ['% de victoire', pct(s.wins, s.matches), ''],
            ['Top 10', fmt(s.top10), ''],
            ['Top 3', fmt(s.top3), ''],
            ['Éliminations', fmt(s.kills), 'is-red'],
            ['Élim. / partie', ratio(s.kills, s.matches), ''],
            ['K/D', ratio(s.kills, s.deaths), ''],
            ['Dégâts infligés', fmt(s.damage), ''],
            ['Coffres ouverts', fmt(s.chests), ''],
            ['Temps de jeu', duration(s.timePlayed), ''],
            ['Record d\'élim.', fmt(s.bestKills), ''],
            ['Meilleure place', s.bestPlace ? `#${s.bestPlace}` : '—', ''],
            ['XP gagnée', fmt(s.totalXp), '']
        ];
        e.pStats.replaceChildren(...tiles.map(([k, v, cls]) => {
            const d = el('div', `profile-stat ${cls}`.trim());
            d.append(el('dt', '', k), el('dd', '', v));
            return d;
        }));

        // Dernières parties
        const h = Progress.history;
        e.pHistoryCount.textContent = h.length ? `${h.length} dernière${h.length > 1 ? 's' : ''}` : '';
        if (!h.length) {
            const li = el('li', 'profile-history-empty', 'Aucune partie pour l\'instant. Clique sur « Prêt » dans le lobby pour lancer ta première partie !');
            e.pHistory.replaceChildren(li);
            return;
        }
        e.pHistory.replaceChildren(...h.map(m => {
            const li = el('li', `profile-match${m.win ? ' is-win' : ''}`);
            const res = el('span', 'pm-place', m.win ? 'Victoire' : `#${m.place || '?'}`);
            const total = el('span', 'pm-total', m.total ? `sur ${m.total}` : '');
            const k = el('span', 'pm-stat', `${m.kills} élim.`);
            const d = el('span', 'pm-stat', `${fmt(m.damage)} dégâts`);
            const t = el('span', 'pm-stat', mmss(m.survival));
            const x = el('span', 'pm-xp', `+${fmt(m.xp)} XP`);
            const when = el('span', 'pm-date', m.date ? ago(m.date) : '');
            li.append(res, total, k, d, t, x, when);
            return li;
        }));
    }

    /* ===================== CLASSEMENTS ===================== */

    renderRanks() {
        const e = this.e;
        if (!e.ranks) return;
        const tab = RANK_TABS.find(t => t.id === this.rankTab) || RANK_TABS[0];
        const s = Progress.stats;
        const me = {
            name: Progress.name, me: true, wins: s.wins, top10: s.top10, kills: s.kills,
            level: Progress.level, outfit: Cosmetics.equippedId
        };
        const all = [...simulatedPlayers(), me].sort((a, b) =>
            tab.value(b) - tab.value(a) || b.level - a.level || (a.me ? -1 : b.me ? 1 : a.name.localeCompare(b.name)));
        const myRank = all.indexOf(me) + 1;
        e.rValueHead.textContent = tab.label;

        const row = (p, i, tag = 'li') => {
            const r = el(tag, `ranks-row${p.me ? ' is-me' : ''}${i < 3 ? ` is-top is-top${i + 1}` : ''}`);
            r.append(
                el('span', 'rk-pos', `#${i + 1}`),
                el('span', 'rk-name', p.me ? `${p.name} (toi)` : p.name),
                el('span', 'rk-level', String(p.level)),
                el('span', 'rk-value', fmt(tab.value(p)))
            );
            return r;
        };
        e.rList.replaceChildren(...all.map((p, i) => row(p, i)));
        const meRow = row(me, myRank - 1, 'div');
        e.rMe.replaceChildren(...meRow.childNodes);
        e.rMe.setAttribute('aria-label', `Ta place : ${myRank} sur ${all.length}`);

        // Podium : 2e, 1er, 3e
        e.rPodium.replaceChildren(...[1, 0, 2].map(i => {
            const p = all[i];
            const box = el('div', `podium-spot place-${i + 1}${p.me ? ' is-me' : ''}`);
            const pic = el('div', 'podium-skin');
            pic.setAttribute('aria-hidden', 'true');
            renderSkinInto(pic, p.outfit, p.me ? { pack: Cosmetics.equippedOf('backpack') } : {});
            const stand = el('div', 'podium-stand');
            stand.append(
                el('span', 'podium-rank', String(i + 1)),
                el('span', 'podium-name', p.me ? `${p.name} (toi)` : p.name),
                el('span', 'podium-value', `${fmt(tab.value(p))} ${tab.label.toLowerCase()}`)
            );
            box.append(pic, stand);
            return box;
        }));
    }
}

function init() {
    const hub = new Hub();
    window.FOR2D_HUB = { refresh: () => hub.refresh() };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
