/* ==================================
   ÉCRAN DE FIN, XP ET SPECTATEUR - FOR2D ROYAL
   - Écran de fin : résultat, tueur, statistiques et XP gagnée (animée), répartis sur les
     bords de l'écran (le centre reste libre : on voit la partie derrière).
     L'XP gagnée est enregistrée dans le profil (js/progress.js : niveau, stats, passe).
   - Spectateur (défaite) : la caméra suit le tueur, puis le tueur de celui-ci, etc.
   Les fonctions de calcul (XP, niveaux, choix de la cible) sont pures et exportées
   pour pouvoir être testées sans navigateur.
   ================================== */

import { WEAPONS, RARITIES } from './weapons.js';
import { makeIcon } from './icons.js';
import { Progress, xpForLevel, applyXp } from '../progress.js';

/* ===================== BARÈME D'XP ===================== */

export const XP_RULES = {
    participation: 50,  // pour avoir joué
    perMinute: 10,      // survie : +10 par minute (au prorata)
    perKill: 25,        // par élimination
    damageStep: 10,     // +1 XP tous les 10 dégâts infligés
    perChest: 5,        // par coffre ouvert
    top10: 50,
    top3: 100,          // cumulé avec le Top 10
    victory: 250
};

// Niveau de départ d'un profil neuf (le vrai niveau vient de js/progress.js)
export const START_LEVEL = 1;
export const START_XP = 0;

// Calculs de niveaux partagés avec le lobby (js/progress.js)
export { xpForLevel, applyXp };

// Durée "m:ss" (arrondie à la seconde inférieure)
export function fmtDuration(seconds) {
    const t = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

const posInt = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/*
   Lignes d'XP de la partie. stats = { win, place, kills, damage, chests, survival (s) }.
   Les lignes à 0 ne sont pas affichées (sauf la participation).
   Renvoie { lines: [{ id, label, detail, amount }], total }.
*/
export function computeXp(stats = {}) {
    const R = XP_RULES;
    const kills = posInt(stats.kills);
    const damage = posInt(stats.damage);
    const chests = posInt(stats.chests);
    const survival = Number.isFinite(stats.survival) && stats.survival > 0 ? stats.survival : 0;
    const win = !!stats.win;
    const place = win ? 1 : (Number.isFinite(stats.place) && stats.place >= 1 ? Math.floor(stats.place) : Infinity);

    const lines = [];
    const add = (id, label, detail, amount, always = false) => {
        if (amount > 0 || always) lines.push({ id, label, detail, amount });
    };
    add('participation', 'Participation', '', R.participation, true);
    add('survival', 'Survie', fmtDuration(survival), Math.floor((survival / 60) * R.perMinute));
    add('kills', 'Éliminations', `× ${kills}`, kills * R.perKill);
    add('damage', 'Dégâts infligés', String(damage), Math.floor(damage / R.damageStep));
    add('chests', 'Coffres ouverts', `× ${chests}`, chests * R.perChest);
    if (place <= 10) add('top10', 'Top 10', `#${place}`, R.top10);
    if (place <= 3) add('top3', 'Top 3', `#${place}`, R.top3);
    if (win) add('victory', 'Victoire Royale', '', R.victory);

    const total = lines.reduce((s, l) => s + l.amount, 0);
    return { lines, total };
}

/* ===================== CHOIX DE LA CIBLE DU SPECTATEUR ===================== */

// Combattant qu'on peut regarder : vivant et pas le joueur éliminé
export function isWatchable(f, exclude = null) {
    return !!f && f.alive && f !== exclude;
}

export function nearestAlive(fighters, x, y, exclude = null) {
    let best = null;
    let bestD = Infinity;
    for (const f of fighters) {
        if (!isWatchable(f, exclude)) continue;
        const d = (f.x - x) ** 2 + (f.y - y) ** 2;
        if (d < bestD) {
            bestD = d;
            best = f;
        }
    }
    return best;
}

/*
   Qui regarder ?
   1. la cible actuelle si elle est encore vivante ;
   2. sinon "killer" (le tueur du joueur, ou le tueur de la cible qui vient de mourir) s'il est vivant ;
   3. sinon le combattant vivant le plus proche de (x, y) (par défaut : la position de la cible) ;
   4. sinon (plus personne) : on reste sur la cible actuelle.
*/
export function chooseSpectateTarget(fighters, { current = null, killer = null, exclude = null, x, y } = {}) {
    if (isWatchable(current, exclude)) return current;
    if (isWatchable(killer, exclude)) return killer;
    const rx = Number.isFinite(x) ? x : (current ? current.x : 0);
    const ry = Number.isFinite(y) ? y : (current ? current.y : 0);
    return nearestAlive(fighters, rx, ry, exclude) || current || null;
}

// Combattant vivant suivant (dir = 1) ou précédent (dir = -1), dans l'ordre de la liste
export function cycleTarget(fighters, current, dir, exclude = null) {
    const list = fighters.filter((f) => isWatchable(f, exclude));
    if (!list.length) return current;
    const i = list.indexOf(current);
    if (i < 0) return list[dir < 0 ? list.length - 1 : 0];
    return list[(i + (dir < 0 ? -1 : 1) + list.length) % list.length];
}

/* ===================== OUTILS D'ANIMATION ===================== */

const TICK_MS = 50;        // au plus un "tic" de compteur toutes les 50 ms
const LINE_GAP = 170;      // pause entre deux lignes d'XP (ms)
const START_DELAY = 950;   // laisse la cascade d'apparition se terminer
const LEVELUP_HOLD = 750;  // barre pleine + "NIVEAU SUPÉRIEUR !" avant de repartir de 0

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const fmtXp = (v) => `+${v} XP`;

function reducedMotion() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Relance une animation CSS (retire la classe, force un recalcul, la remet)
function restartClass(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
}

/* ===================== ÉCRAN DE FIN ===================== */

export class EndScreen {
    /*
       opts.sfx     : moteur de sons (SFX.play)
       opts.onOpen  : appelé quand la vue complète s'affiche (fermer carte / inventaire...)
       opts.onWatch : appelé quand on replie les panneaux pour regarder la partie
    */
    constructor({ sfx = null, onOpen = null, onWatch = null } = {}) {
        this.sfx = sfx;
        this.onOpen = onOpen;
        this.onWatch = onWatch;

        const root = document.getElementById('endScreen');
        const q = (sel) => root.querySelector(sel);
        this.root = root;
        // Rappel compact posé au-dessus de la barre du spectateur (facultatif)
        const recap = document.getElementById('spectatorBar');
        const rq = (sel) => (recap ? recap.querySelector(sel) : null);
        this.el = {
            kicker: q('.es-kicker'),
            title: q('.es-title'),
            placeNum: q('.es-place-num'),
            placeTotal: q('.es-place-total'),
            frameText: q('.es-frame-text'),
            recapNum: rq('.spec-recap-num'),
            recapTotal: rq('.spec-recap-total'),
            killer: q('.es-killer'),
            killerName: q('.es-killer-name'),
            weaponIcon: q('.es-weapon-icon'),
            weaponCorrupt: q('.es-weapon-corrupt'),
            weaponName: q('.es-weapon-name'),
            stats: {
                kills: q('[data-stat="kills"]'),
                damage: q('[data-stat="damage"]'),
                time: q('[data-stat="time"]'),
                chests: q('[data-stat="chests"]')
            },
            lines: q('.es-xp-lines'),
            total: q('.es-xp-total'),
            totalValue: q('.es-xp-total-value'),
            level: q('.es-level'),
            levelNum: q('.es-level-num'),
            levelBar: q('.es-level-bar'),
            levelFill: q('.es-level-fill'),
            levelText: q('.es-level-text'),
            levelUp: q('.es-levelup'),
            announce: q('.es-xp-announce'),
            replay: document.getElementById('replayBtn'),
            watch: document.getElementById('esWatchBtn')
        };

        this.isOpen = false;     // vue complète (panneaux sur les bords, focus piégé)
        this.canWatch = false;   // défaite : on peut replier les panneaux pour regarder
        this.shown = false;      // show() déjà appelé
        this._run = 0;           // jeton : une animation plus ancienne s'arrête d'elle-même
        this._opened = 0;

        // CombatHud recharge déjà la page sur ce bouton ; le faire deux fois est sans effet
        this.el.replay.addEventListener('click', () => location.reload());
        this.el.watch.addEventListener('click', () => this.watch());

        // Focus piégé dans l'écran de fin en vue complète (Tab est bloqué par input.js : on déplace le focus nous-mêmes)
        addEventListener('keydown', (e) => {
            if (!this.isOpen || e.key !== 'Tab') return;
            const items = this._focusables();
            if (!items.length) return;
            e.preventDefault();
            const i = items.indexOf(document.activeElement);
            const next = i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + items.length) % items.length;
            items[next].focus({ preventScroll: true });
        }, true);
    }

    _focusables() {
        return [...this.root.querySelectorAll('button, a[href]')]
            .filter((el) => !el.hidden && !el.closest('[hidden]') && !el.disabled);
    }

    _sound(name, opts) {
        // Pas de sons d'XP quand les panneaux sont repliés (on regarde la partie)
        if (this.isOpen) this.sfx?.play(name, opts);
    }

    /*
       r = { win, place, total, kills, damage, chests, survival,
             killerName, byCorruption, weaponId, weaponRarity }
    */
    show(r) {
        if (this.shown) return;
        this.shown = true;
        this.result = r;
        this.canWatch = !r.win;

        const root = this.root;
        root.classList.toggle('is-win', !!r.win);
        root.classList.toggle('is-lost', !r.win);

        const e = this.el;
        e.kicker.textContent = r.win ? `Dernier debout sur ${r.total}` : 'Partie terminée';
        e.title.textContent = r.win ? 'Victoire Royale' : 'Éliminé';
        e.placeNum.textContent = `#${r.place}`;
        e.placeTotal.textContent = String(r.total);
        e.frameText.textContent = r.win ? 'Champion' : 'En direct';
        if (e.recapNum) e.recapNum.textContent = `#${r.place}`;
        if (e.recapTotal) e.recapTotal.textContent = String(r.total);
        this._fillKiller(r);

        const s = this.el.stats;
        s.kills.textContent = String(posInt(r.kills));
        s.damage.textContent = String(posInt(Math.round(r.damage || 0)));
        s.time.textContent = fmtDuration(r.survival);
        s.chests.textContent = String(posInt(r.chests));

        this.el.watch.hidden = !this.canWatch;

        // XP : lignes préparées à l'avance (invisibles) pour éviter que la carte "saute".
        // La partie est enregistrée tout de suite (niveau, statistiques, palier du passe) :
        // l'animation part du niveau d'avant la partie.
        this.xp = computeXp(r);
        let start = { level: START_LEVEL, xp: START_XP };
        try {
            start = Progress.recordMatch(r, this.xp.total).before;
        } catch {
            /* stockage indisponible : on anime quand même depuis le niveau 1 */
        }
        this.progress = applyXp(start.level, start.xp, this.xp.total);
        this._buildLines();
        this._setLevel(start.level, start.xp, xpForLevel(start.level));

        this.open(this.el.replay);

        const run = ++this._run;
        if (reducedMotion()) this._finish();
        else this._animate(run);
    }

    _fillKiller(r) {
        const e = this.el;
        const name = r.byCorruption ? 'la corruption' : (r.killerName || '');
        e.killer.hidden = r.win || !name;
        if (e.killer.hidden) return;
        e.killer.classList.toggle('is-corrupt', !!r.byCorruption);
        e.killerName.textContent = name;

        if (r.byCorruption) {
            e.weaponIcon.hidden = true;
            e.weaponCorrupt.hidden = false;
            e.weaponName.textContent = 'Hors de la zone saine';
            e.weaponName.style.removeProperty('--rarity');
            return;
        }
        e.weaponCorrupt.hidden = true;
        const w = WEAPONS[r.weaponId];
        if (!w) {
            e.weaponIcon.hidden = true;
            e.weaponName.textContent = '';
            return;
        }
        const melee = w.type === 'melee';
        const rarity = RARITIES[r.weaponRarity] ? r.weaponRarity : 0;
        const url = makeIcon(r.weaponId, rarity, 96);
        e.weaponIcon.hidden = !url;
        if (url) e.weaponIcon.src = url;
        e.weaponName.textContent = melee ? w.name : `${w.name} · ${RARITIES[rarity].name}`;
        e.weaponName.style.setProperty('--rarity', melee ? '#ffe03d' : RARITIES[rarity].color);
    }

    _buildLines() {
        const list = this.el.lines;
        list.textContent = '';
        this.lineEls = this.xp.lines.map((line) => {
            const li = document.createElement('li');
            li.className = `es-xp-line is-pending es-line-${line.id}`;
            const label = document.createElement('span');
            label.className = 'es-xp-label';
            label.textContent = line.label;
            const detail = document.createElement('span');
            detail.className = 'es-xp-detail';
            detail.textContent = line.detail;
            const amount = document.createElement('span');
            amount.className = 'es-xp-amount';
            amount.textContent = '+0';
            li.append(label, detail, amount);
            list.appendChild(li);
            return { li, amount, line };
        });
        this.el.total.classList.add('is-pending');
        this.el.totalValue.textContent = fmtXp(0);
        this.el.levelUp.hidden = true;
    }

    _setLevel(level, value, max) {
        const e = this.el;
        e.levelNum.textContent = String(level);
        e.levelText.textContent = `${value} / ${max} XP`;
        e.levelFill.style.transform = `scaleX(${Math.max(0, Math.min(1, value / max)).toFixed(4)})`;
        e.levelBar.setAttribute('aria-valuemax', String(max));
        e.levelBar.setAttribute('aria-valuenow', String(value));
        e.levelBar.setAttribute('aria-valuetext', `Niveau ${level} : ${value} sur ${max} XP`);
    }

    // Compte de "from" à "to" en "ms" ; onValue(v) à chaque nouvelle valeur, un tic toutes les 50 ms max
    _count(from, to, ms, onValue, run) {
        return new Promise((resolve) => {
            if (to === from || ms <= 0) {
                onValue(to);
                resolve();
                return;
            }
            const t0 = performance.now();
            let lastV = null;
            let lastTick = -Infinity;
            const step = (now) => {
                if (run !== this._run) {
                    resolve();
                    return;
                }
                const k = Math.min(1, (now - t0) / ms);
                const v = Math.round(from + (to - from) * easeOut(k));
                if (v !== lastV) {
                    lastV = v;
                    onValue(v);
                    if (now - lastTick >= TICK_MS) {
                        lastTick = now;
                        this._sound('xpTick', { rise: k });
                    }
                }
                if (k < 1) requestAnimationFrame(step);
                else resolve();
            };
            requestAnimationFrame(step);
        });
    }

    async _animate(run) {
        const alive = () => run === this._run;
        await wait(START_DELAY);

        // 1. Les lignes, une par une, avec leur montant qui compte
        for (const { li, amount, line } of this.lineEls) {
            if (!alive()) return;
            li.classList.remove('is-pending');
            li.classList.add('is-shown');
            this._sound('xpLine');
            const ms = Math.min(700, 260 + line.amount * 4);
            await this._count(0, line.amount, ms, (v) => { amount.textContent = `+${v}`; }, run);
            await wait(LINE_GAP);
        }
        if (!alive()) return;

        // 2. Le total
        this.el.total.classList.remove('is-pending');
        this.el.total.classList.add('is-shown');
        this._sound('xpLine');
        const total = this.xp.total;
        await this._count(0, total, Math.min(1200, 450 + total * 2), (v) => {
            this.el.totalValue.textContent = fmtXp(v);
        }, run);
        await wait(350);

        // 3. La barre de niveau, segment par segment (un par passage de niveau)
        for (const seg of this.progress.segments) {
            if (!alive()) return;
            const span = seg.to - seg.from;
            const ms = Math.max(350, Math.min(1400, (span / seg.max) * 1300));
            await this._count(seg.from, seg.to, ms, (v) => this._setLevel(seg.level, v, seg.max), run);
            if (!alive()) return;
            if (seg.levelUp) {
                this._levelUpFx(seg.level + 1);
                await wait(LEVELUP_HOLD);
                if (!alive()) return;
                this._setLevel(seg.level + 1, 0, xpForLevel(seg.level + 1));
            }
        }
        if (alive()) this._announce();
    }

    _levelUpFx(newLevel) {
        const e = this.el;
        e.levelNum.textContent = String(newLevel);
        e.levelUp.hidden = false;
        restartClass(e.levelUp, 'is-pop');
        restartClass(e.level, 'is-flash');
        this._sound('levelUp');
    }

    // Mouvements réduits : valeurs finales directement, sans comptage
    _finish() {
        for (const { li, amount, line } of this.lineEls) {
            li.classList.remove('is-pending');
            amount.textContent = `+${line.amount}`;
        }
        this.el.total.classList.remove('is-pending');
        this.el.totalValue.textContent = fmtXp(this.xp.total);
        const p = this.progress;
        this._setLevel(p.level, p.xp, p.max);
        if (p.levelsGained > 0) {
            this.el.levelUp.hidden = false;
            this._sound('levelUp');
        }
        this._announce();
    }

    // Résumé pour les lecteurs d'écran, une fois l'animation terminée
    _announce() {
        const p = this.progress;
        const up = p.levelsGained > 0 ? ` Niveau supérieur !` : '';
        this.el.announce.textContent = `${fmtXp(this.xp.total)} gagnés.${up} Niveau ${p.level} : ${p.xp} sur ${p.max} XP.`;
    }

    // Vue complète : les panneaux (re)viennent sur les bords (focus sur "focusEl", sinon sur Rejouer)
    open(focusEl = null) {
        if (!this.shown) return;
        const root = this.root;
        // Réouverture (bouton Résultats) : les panneaux reviennent en transition, pas de nouvelle cascade
        root.classList.toggle('is-reopened', this._opened > 0);
        this._opened++;
        root.classList.remove('is-compact');
        root.inert = false;
        root.removeAttribute('aria-hidden');
        root.hidden = false;
        this.isOpen = true;
        // Résultats affichés : le HUD des coins (boutons, minimap, stats...) s'efface (css/end-screen.css)
        document.body.classList.add('results-open');
        this.onOpen?.();
        // preventScroll : le bouton arrive encore du bas de l'écran ; sans ça, le navigateur
        // ferait défiler tout l'écran de fin pour le montrer (le fond sombre "descendait")
        (focusEl || this.el.replay).focus({ preventScroll: true });
        root.scrollTop = 0;
        root.scrollLeft = 0;
    }

    /*
       Vue compacte pour regarder la partie (défaite uniquement) : les panneaux se rétractent
       vers les bords (le rappel du résultat reste au-dessus de la barre du spectateur).
       L'écran de fin reste dans la page mais devient inerte : plus de focus ni de clic dedans.
    */
    watch() {
        if (!this.isOpen || !this.canWatch) return;
        const root = this.root;
        root.classList.add('is-compact', 'is-reopened');
        root.inert = true;
        root.setAttribute('aria-hidden', 'true');
        this.isOpen = false;
        // En spectateur, on retrouve la minimap et le reste du HUD
        document.body.classList.remove('results-open');
        this.onWatch?.();
    }
}

/* ===================== SPECTATEUR ===================== */

export class Spectator {
    /*
       opts.player    : le joueur éliminé (jamais regardé)
       opts.fighters  : tous les combattants
       opts.killerOf  : Map / WeakMap victime -> tueur (rempli par main.js dans onKill)
       opts.isBlocked : () => true quand les flèches ne doivent pas changer de cible (panneau ouvert)
       opts.onResults : clic sur "Résultats"
    */
    constructor({ player, fighters, killerOf, sfx = null, isBlocked = null, onResults = null }) {
        this.player = player;
        this.fighters = fighters;
        this.killerOf = killerOf;
        this.sfx = sfx;
        this.isBlocked = isBlocked;
        this.onResults = onResults;

        const bar = document.getElementById('spectatorBar');
        const q = (sel) => bar.querySelector(sel);
        this.el = {
            bar,
            kicker: q('.spec-kicker'),
            name: q('.spec-name'),
            kills: q('.spec-kills-value'),
            shield: q('.spec-shield'),
            shieldFill: q('.spec-shield .spec-fill'),
            health: q('.spec-health'),
            healthFill: q('.spec-health .spec-fill'),
            prev: q('#specPrev'),
            next: q('#specNext'),
            results: q('#specResults')
        };

        this.active = false;
        this.target = null;
        this._txt = {};

        this.el.prev.addEventListener('click', () => this.cycle(-1));
        this.el.next.addEventListener('click', () => this.cycle(1));
        this.el.results.addEventListener('click', () => this.onResults?.());
        addEventListener('keydown', (e) => {
            if (!this.active || this.el.bar.hidden || e.repeat || this.isBlocked?.()) return;
            if (e.code === 'ArrowLeft') this.cycle(-1);
            else if (e.code === 'ArrowRight') this.cycle(1);
        });
    }

    get barVisible() {
        return !this.el.bar.hidden;
    }

    // Début du mode spectateur : on regarde le tueur (ou le plus proche)
    start(killer) {
        if (this.active) return;
        this.active = true;
        document.body.classList.add('is-spectating');
        const p = this.player;
        this.target = chooseSpectateTarget(this.fighters, { killer, exclude: p, x: p.x, y: p.y });
    }

    setBarVisible(visible) {
        if (!this.active) return;
        this.el.bar.hidden = !visible;
        if (visible) {
            this._txt = {}; // tout réécrire à la réapparition
            this._render();
        }
    }

    cycle(dir) {
        if (!this.active) return;
        const next = cycleTarget(this.fighters, this.target, dir, this.player);
        if (next && next !== this.target) {
            this.target = next;
            this.sfx?.play('slot');
        }
        this._render();
    }

    // Chaque image : suit la mort de la cible, met à jour la barre. Renvoie la cible (ou null).
    update() {
        if (!this.active) return null;
        const t = this.target;
        if (t && !t.alive) {
            // La cible vient de tomber : son tueur, sinon le plus proche ; personne : on reste
            const next = chooseSpectateTarget(this.fighters, {
                killer: this.killerOf?.get(t), exclude: this.player, x: t.x, y: t.y
            });
            if (next) this.target = next;
        }
        if (this.barVisible) this._render();
        return this.target;
    }

    _set(key, el, value) {
        if (this._txt[key] === value) return false;
        this._txt[key] = value;
        el.textContent = value;
        return true;
    }

    _bar(key, box, fill, value) {
        const v = Math.max(0, Math.min(100, Math.round(value || 0)));
        if (this._txt[key] === v) return;
        this._txt[key] = v;
        fill.style.transform = `scaleX(${v / 100})`;
        box.setAttribute('aria-valuenow', String(v));
    }

    _render() {
        const t = this.target;
        const e = this.el;
        let others = 0;
        for (const f of this.fighters) if (isWatchable(f, this.player)) others++;
        const kicker = !t ? 'Spectateur'
            : !t.alive ? 'Éliminé'
            : others === 1 ? 'Victoire Royale'
            : 'Spectateur';
        this._set('kicker', e.kicker, kicker);
        this._set('name', e.name, t ? t.name : '—');
        this._set('kills', e.kills, String(t ? t.kills : 0));
        this._bar('shield', e.shield, e.shieldFill, t ? t.shield : 0);
        this._bar('health', e.health, e.healthFill, t ? t.health : 0);
        const canCycle = others > 1 || (others === 1 && t !== null && !isWatchable(t, this.player));
        if (this._txt.cycle !== canCycle) {
            this._txt.cycle = canCycle;
            // Un bouton désactivé perd le focus : on le passe à "Résultats"
            if (!canCycle && (document.activeElement === e.prev || document.activeElement === e.next)) {
                e.results.focus({ preventScroll: true });
            }
            e.prev.disabled = !canCycle;
            e.next.disabled = !canCycle;
        }
    }
}
