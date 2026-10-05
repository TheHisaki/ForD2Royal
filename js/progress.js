/* ==================================
   PROGRESSION - FOR2D ROYAL
   Niveau, XP, statistiques des parties et Passe de combat du joueur,
   gardés dans le navigateur (localStorage « for2d-progress »).
   Partagé par le jeu (écran de fin : enregistre la partie) et le lobby
   (niveau, Profil, Passe de combat, Classements).

   API (module ES, aussi en window.FOR2D_PROGRESS) :
   - xpForLevel(level), applyXp(level, xp, gain)   : calculs purs
   - PASS_TIERS, PASS_PRICE, PASS_REWARDS           : contenu du passe
   - Progress.level / xp / xpMax / name / stats / history / tier
   - Progress.recordMatch(result, xpGain)          -> { before, after }
   - Progress.setName(name)                        -> nom nettoyé
   - Progress.passPremium, buyPremium()            -> { ok, reason }
   - Progress.isUnlocked(reward), isClaimed(reward), claim(reward), claimAll()
   - Progress.onChange(fn)
   ================================== */

import { Cosmetics, getItem } from './cosmetics.js';

const STORAGE_KEY = 'for2d-progress';
const HISTORY_MAX = 20;
const NAME_MAX = 16;
export const PASS_TIERS = 30;
export const PASS_PRICE = 950;

/* ===================== XP ET NIVEAUX ===================== */

// XP nécessaire pour passer le niveau "level" (100, 150, 200...)
export function xpForLevel(level) {
    return 100 + 50 * (Math.max(1, Math.floor(level)) - 1);
}

const posInt = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/*
   Ajoute "gain" XP à (level, xp). Renvoie les segments de la barre à animer :
   [{ level, from, to, max, levelUp }] (levelUp = la barre se remplit et on passe au niveau suivant),
   puis le niveau / l'XP finaux.
*/
export function applyXp(level, xp, gain) {
    const startLevel = Math.max(1, Math.floor(level) || 1);
    let lv = startLevel;
    let cur = Math.max(0, Math.min(Math.floor(xp) || 0, xpForLevel(lv) - 1));
    let left = posInt(gain);
    const segments = [];
    // Garde-fou : jamais plus de 1000 niveaux d'un coup
    for (let guard = 0; guard < 1000; guard++) {
        const max = xpForLevel(lv);
        if (cur + left >= max) {
            segments.push({ level: lv, from: cur, to: max, max, levelUp: true });
            left -= max - cur;
            cur = 0;
            lv++;
        } else {
            segments.push({ level: lv, from: cur, to: cur + left, max, levelUp: false });
            cur += left;
            break;
        }
    }
    return { segments, level: lv, xp: cur, max: xpForLevel(lv), levelsGained: lv - startLevel };
}

/* ===================== PASSE DE COMBAT ===================== */

/*
   Un palier = un niveau (niveau 7 -> palier 7, plafonné à 30).
   Deux pistes : gratuite (quelques paliers) et premium (tous les paliers, achat en Pixies).
   Récompense : { id, tier, track: 'free' | 'premium', kind: 'item' | 'pixies', item?, amount? }
*/
const PREMIUM_ITEMS = {
    1: 'pass-explo', 5: 'pass-aile-pixel', 10: 'pass-ombre', 15: 'pass-emote-couronne',
    20: 'pass-sac-couronne', 25: 'pass-aile-royale', 30: 'pass-gardien'
};
const FREE = {
    3: 50, 6: 'pass-emote-gg', 9: 50, 12: 'pass-sac-pixel', 15: 100,
    18: 50, 21: 100, 24: 50, 27: 100, 30: 200
};

export const PASS_REWARDS = (() => {
    const list = [];
    const add = (tier, track, v) => {
        const r = { id: `${track[0]}${tier}`, tier, track };
        if (typeof v === 'string') Object.assign(r, { kind: 'item', item: v });
        else Object.assign(r, { kind: 'pixies', amount: v });
        list.push(r);
    };
    for (let t = 1; t <= PASS_TIERS; t++) {
        if (FREE[t] !== undefined) add(t, 'free', FREE[t]);
        add(t, 'premium', PREMIUM_ITEMS[t] || (t % 2 === 0 ? 100 : 50));
    }
    return list;
})();

const REWARD_BY_ID = new Map(PASS_REWARDS.map(r => [r.id, r]));

/* ===================== PROFIL ===================== */

function freshStats() {
    return {
        matches: 0, wins: 0, top10: 0, top3: 0, kills: 0, deaths: 0,
        damage: 0, chests: 0, timePlayed: 0, bestKills: 0, bestPlace: 0, totalXp: 0
    };
}

function fresh() {
    return { name: 'Joueur', level: 1, xp: 0, stats: freshStats(), history: [], premium: false, claimed: [] };
}

// Nom affiché : lettres, chiffres, espaces et quelques signes, 16 caractères au plus
export function cleanName(raw) {
    const s = String(raw ?? '').normalize('NFKC')
        .replace(/[^\p{L}\p{N} _\-.]/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, NAME_MAX);
    return s || 'Joueur';
}

function load() {
    const p = fresh();
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved && typeof saved === 'object') {
            p.name = cleanName(saved.name);
            p.level = Math.max(1, posInt(saved.level) || 1);
            p.xp = Math.min(posInt(saved.xp), xpForLevel(p.level) - 1);
            if (saved.stats && typeof saved.stats === 'object') {
                for (const k of Object.keys(p.stats)) p.stats[k] = posInt(saved.stats[k]);
            }
            if (Array.isArray(saved.history)) {
                p.history = saved.history.filter(h => h && typeof h === 'object').slice(0, HISTORY_MAX).map(h => ({
                    date: posInt(h.date), win: h.win === true, place: posInt(h.place), total: posInt(h.total),
                    kills: posInt(h.kills), damage: posInt(h.damage), survival: posInt(h.survival), xp: posInt(h.xp)
                }));
            }
            p.premium = saved.premium === true;
            if (Array.isArray(saved.claimed)) p.claimed = saved.claimed.filter(id => REWARD_BY_ID.has(id));
        }
    } catch {
        /* stockage indisponible ou corrompu : progression neuve */
    }
    return p;
}

let data = load();
const listeners = [];

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
        /* stockage indisponible : la progression reste valable pour cette page */
    }
    emit();
}

function emit() {
    for (const fn of listeners) {
        try { fn(data); } catch { /* un écouteur raté ne bloque pas les autres */ }
    }
}

export const Progress = {
    get name() { return data.name; },
    get level() { return data.level; },
    get xp() { return data.xp; },
    get xpMax() { return xpForLevel(data.level); },
    get tier() { return Math.min(PASS_TIERS, data.level); },
    get stats() { return { ...data.stats }; },
    get history() { return data.history.map(h => ({ ...h })); },
    get passPremium() { return data.premium; },

    reset(name = 'Joueur') {
        data = fresh();
        data.name = cleanName(name);
        save();
        return data.name;
    },

    // Relit le stockage (profil d'un compte chargé par js/network.js) sans réécrire
    reloadFromStorage() {
        data = load();
        emit();
    },

    exportData() {
        return {
            name: data.name,
            level: data.level,
            xp: data.xp,
            stats: { ...data.stats },
            history: data.history.map((h) => ({ ...h })),
            premium: data.premium,
            claimed: [...data.claimed]
        };
    },

    importData(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return false;
        const next = fresh();
        next.name = cleanName(snapshot.name || data.name);
        next.level = Math.max(1, posInt(snapshot.level) || 1);
        next.xp = Math.min(posInt(snapshot.xp), xpForLevel(next.level) - 1);
        if (snapshot.stats && typeof snapshot.stats === 'object') {
            for (const key of Object.keys(next.stats)) next.stats[key] = posInt(snapshot.stats[key]);
        }
        if (Array.isArray(snapshot.history)) {
            next.history = snapshot.history.slice(0, HISTORY_MAX).filter((h) => h && typeof h === 'object').map((h) => ({
                date: posInt(h.date), win: h.win === true, place: posInt(h.place), total: posInt(h.total),
                kills: posInt(h.kills), damage: posInt(h.damage), survival: posInt(h.survival), xp: posInt(h.xp)
            }));
        }
        next.premium = snapshot.premium === true;
        if (Array.isArray(snapshot.claimed)) next.claimed = snapshot.claimed.filter((id) => REWARD_BY_ID.has(id));
        data = next;
        save();
        return true;
    },

    setName(raw) {
        data.name = cleanName(raw);
        save();
        return data.name;
    },

    /*
       Fin de partie (écran de fin du jeu).
       r = { win, place, total, kills, damage, chests, survival (s) }
    */
    recordMatch(r = {}, xpGain = 0) {
        const before = { level: data.level, xp: data.xp };
        const res = applyXp(data.level, data.xp, xpGain);
        data.level = res.level;
        data.xp = res.xp;

        const s = data.stats;
        const place = r.win ? 1 : posInt(r.place);
        const kills = posInt(r.kills);
        s.matches++;
        if (r.win) s.wins++;
        else s.deaths++;
        if (place && place <= 10) s.top10++;
        if (place && place <= 3) s.top3++;
        s.kills += kills;
        s.damage += posInt(r.damage);
        s.chests += posInt(r.chests);
        s.timePlayed += posInt(r.survival);
        s.bestKills = Math.max(s.bestKills, kills);
        if (place) s.bestPlace = s.bestPlace ? Math.min(s.bestPlace, place) : place;
        s.totalXp += posInt(xpGain);

        data.history.unshift({
            date: Date.now(), win: !!r.win, place, total: posInt(r.total), kills,
            damage: posInt(r.damage), survival: posInt(r.survival), xp: posInt(xpGain)
        });
        data.history.length = Math.min(data.history.length, HISTORY_MAX);
        save();
        return { before, after: { level: data.level, xp: data.xp } };
    },

    /* ----- Passe de combat ----- */

    buyPremium() {
        if (data.premium) return { ok: false, reason: 'owned' };
        if (!Cosmetics.spendPixies(PASS_PRICE)) return { ok: false, reason: 'funds' };
        data.premium = true;
        save();
        return { ok: true };
    },

    isUnlocked(r) {
        return !!r && r.tier <= this.tier && (r.track === 'free' || data.premium);
    },

    isClaimed(r) {
        return !!r && data.claimed.includes(r.id);
    },

    // Donne la récompense (objet dans le casier ou Pixies). Renvoie true si c'est fait.
    claim(r) {
        r = typeof r === 'string' ? REWARD_BY_ID.get(r) : r;
        if (!r || !this.isUnlocked(r) || this.isClaimed(r)) return false;
        if (r.kind === 'item') {
            // Déjà possédé (cas rare) : la récompense compte quand même comme récupérée
            if (getItem(r.item)) Cosmetics.grantItem(r.item);
        } else {
            Cosmetics.addPixies(r.amount);
        }
        data.claimed.push(r.id);
        save();
        return true;
    },

    claimable() {
        return PASS_REWARDS.filter(r => this.isUnlocked(r) && !this.isClaimed(r));
    },

    // Récupère tout ce qui est débloqué ; renvoie la liste des récompenses données
    claimAll() {
        const list = this.claimable();
        for (const r of list) this.claim(r);
        return list;
    },

    onChange(fn) {
        if (typeof fn === 'function') listeners.push(fn);
    }
};

if (typeof window !== 'undefined') {
    window.FOR2D_PROGRESS = Progress;
    // Une autre page (le jeu) a enregistré une partie : on relit
    window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY) return;
        data = load();
        emit();
    });
}

export default Progress;
