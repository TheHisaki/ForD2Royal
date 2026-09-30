/* ==================================
   HUD DE COMBAT - FOR2D ROYAL
   Inventaire, munitions, rechargement / soin, message d'interaction,
   fil des éliminations, dégâts subis et écran de fin.
   ================================== */

import { WEAPONS, HEALS, RARITIES } from './weapons.js';
import { makeIcon, makeHealIcon } from './icons.js';

// Corruption (zone qui rétrécit)
const ZONE_ALERT_TIME = 3200;  // ms d'affichage de l'alerte au centre-haut
const CFX_FADE = 0.45;         // s : durée du fondu de sortie avant de couper les animations
const CFX_DEPTH = 600;         // profondeur (monde) pour une corruption au maximum
const HIT_MIN_GAP = 0.35;      // s entre deux flashs de dégâts de corruption
const REDUCED_MOTION = typeof matchMedia === 'function'
    ? matchMedia('(prefers-reduced-motion: reduce)')
    : null;

const q05 = (v) => Math.round(v * 20) / 20; // arrondi par pas de 0.05 (styles écrits rarement)
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Temps "m:ss" (arrondi à la seconde supérieure)
function fmtTime(s) {
    const t = Math.max(0, Math.ceil(s || 0));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// Dégâts par seconde, virgule française ("2,5")
function fmtDps(dps) {
    const v = Math.round(dps * 10) / 10;
    return String(v).replace('.', ',');
}

const FEED_MAX = 5;
const FEED_TIME = 6; // secondes d'affichage d'une élimination

// Altimètre (1 d'altitude = 1000 m pour l'affichage)
const ALT_METERS = 1000;
const ALT_STEP = 10;       // pas d'affichage en mètres (la chute est rapide : ~25 changements / s)
const GLIDER_ALT = 0.45;   // le planeur s'ouvre sous cette altitude (voir drop.js)
const LAND_ALT = 0.1;      // en dessous : "Atterrissage"
const ALT_HINTS = {
    fall: `Chute libre · planeur à ${Math.round(GLIDER_ALT * ALT_METERS)} m`,
    glide: 'Planeur ouvert',
    land: 'Atterrissage'
};

export class CombatHud {
    constructor(player, fighters, loot) {
        this.player = player;
        this.fighters = fighters;
        this.loot = loot;

        const $ = (id) => document.getElementById(id);
        const alt = $('altMeter');
        this.slots = [...document.querySelectorAll('#hotbar .slot')];
        this.el = {
            feed: $('killFeed'),
            ammo: $('ammoBox'),
            mag: $('ammoMag'),
            reserve: $('ammoReserve'),
            action: $('actionBar'),
            actionLabel: $('actionBar').querySelector('.action-label'),
            actionFill: $('actionBar').querySelector('.action-fill'),
            interact: $('interactPrompt'),
            interactText: $('interactPrompt').querySelector('.interact-text'),
            vignette: $('damageVignette'),
            alive: $('statAlive'),
            kills: $('statKills'),
            end: $('endScreen'),
            equip: {
                box: $('equipName'),
                name: $('equipName').querySelector('.eq-name'),
                sub: $('equipName').querySelector('.eq-rarity')
            },
            // Altimètre : éléments mis en cache une fois pour toutes
            alt: {
                box: alt,
                value: alt.querySelector('.alt-value'),
                fill: alt.querySelector('.alt-fill'),
                hint: alt.querySelector('.alt-hint')
            }
        };

        // Chaque case contient une zone "compteur" (chargeur ou nombre de soins)
        // et on garde ses éléments pour ne pas les rechercher à chaque mise à jour
        this.slotEls = this.slots.map((btn) => {
            const c = document.createElement('span');
            c.className = 'slot-count';
            btn.appendChild(c);
            return { btn, icon: btn.querySelector('.slot-icon'), count: c, sig: null, countTxt: '' };
        });

        this.feed = [];
        this.vignette = 0;
        this._slotSel = -1;
        this._txt = {};
        this._shown = {};
        this._actionPct = -1;
        this._low = false;
        this._altM = -1;
        this._altState = '';

        // Corruption : rien n'est fait tant que setZone() n'a pas été appelé
        this.zone = null;
        this.zel = null;           // éléments DOM du minuteur, de l'alerte et du calque
        this._zState = '';         // dernier état vu (pour les alertes)
        this._zWarnPhase = 0;      // dernière phase annoncée
        this._zClass = '';
        this._zOutside = false;
        this._alertPop = '';
        this._fxOn = false;        // calque actif (animations en cours)
        this._fxOff = 0;           // compte à rebours du fondu de sortie
        this._fxOp = '';           // opacité écrite (pas de 0.05)
        this._fxDeep = '';
        this._fxHit = '';
        this._hitT = 0;
        this._glitchT = 0.5;
        this._glitchN = 0;
        this._lastHp = null;
        this._lastSh = 0;

        $('replayBtn').addEventListener('click', () => location.reload());
    }

    // Change un texte seulement s'il a changé (évite de toucher le DOM à chaque image)
    _set(el, key, value) {
        if (this._txt[key] === value) return;
        this._txt[key] = value;
        el.textContent = value;
    }

    // Affiche / cache un élément seulement si son état change
    _show(el, key, visible) {
        if (this._shown[key] === visible) return;
        this._shown[key] = visible;
        el.hidden = !visible;
    }

    update(dt) {
        const p = this.player;
        this.updateSlots();
        this.updateAmmo();

        // Rechargement ou soin en cours
        let label = '';
        let progress = 0;
        const held = p.inventory[p.slot];
        if (p.alive && p.reloadTimer > 0 && held?.kind === 'weapon') {
            const w = WEAPONS[held.weaponId];
            label = 'Rechargement';
            progress = 1 - p.reloadTimer / (w?.reloadTime || 1);
        } else if (p.alive && p.usingItem) {
            const it = p.inventory[p.usingItem.slot];
            label = HEALS[it?.itemId]?.name || 'Soin';
            progress = p.usingItem.t / p.usingItem.total;
        }
        this._show(this.el.action, 'action', !!label);
        if (label) {
            this._set(this.el.actionLabel, 'action', label);
            // transform (composité) plutôt que width, et seulement si le pourcentage change
            const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
            if (pct !== this._actionPct) {
                this._actionPct = pct;
                this.el.actionFill.style.transform = `scaleX(${pct / 100})`;
            }
        }

        // Coffre ou objet à portée
        const near = p.alive && p.phase === 'ground' ? this.loot.nearestInteractable(p) : null;
        this._show(this.el.interact, 'interact', !!near);
        if (near) {
            let txt = this.loot.describe(near);
            // Inventaire plein : on prévient que l'objet en main sera posé au sol
            const out = near.kind === 'item' ? this.loot.swapTarget(p, near.target) : null;
            if (out) {
                const outName = out.kind === 'weapon' ? WEAPONS[out.weaponId]?.name : HEALS[out.itemId]?.name;
                txt += ` · échanger avec ${outName || 'l\'objet en main'}`;
            }
            this._set(this.el.interactText, 'interact', txt);
        }

        // Compteurs
        this._set(this.el.alive, 'alive', String(this.aliveCount()));
        this._set(this.el.kills, 'kills', String(p.kills));

        // Bords rouges : pic quand on est touché, et pulsation permanente si la vie est basse
        const low = p.alive && p.health < 30;
        const floor = low ? 0.45 : 0;
        this.vignette = Math.max(floor, this.vignette - dt * 1.5);
        const op = this.vignette.toFixed(2);
        if (op !== this._vig) {
            this._vig = op;
            this.el.vignette.style.opacity = op;
        }
        if (low !== this._low) {
            this._low = low;
            this.el.vignette.classList.toggle('low', low);
        }

        this.updateAltimeter();

        if (this.zone && this.zel) {
            this.updateZoneTimer();
            this.updateCorruptionFx(dt);
        }

        // Fil des éliminations
        for (const f of this.feed) {
            f.t -= dt;
            if (f.t < 0.5) f.el.classList.add('fade');
        }
        while (this.feed.length && this.feed[0].t <= 0) this.feed.shift().el.remove();
    }

    aliveCount() {
        let n = 0;
        for (const f of this.fighters) if (f.alive) n++;
        return n;
    }

    // Case par case : l'icône n'est reconstruite que si l'objet change (pas à chaque tir),
    // le compteur (chargeur / nombre de soins) est un simple texte mis à jour à part
    updateSlots() {
        const p = this.player;

        if (p.slot !== this._slotSel) {
            this._slotSel = p.slot;
            this.slotEls.forEach(({ btn }, i) => {
                btn.classList.toggle('active', i === p.slot);
                btn.setAttribute('aria-pressed', i === p.slot ? 'true' : 'false');
            });
        }

        for (let i = 0; i < this.slotEls.length; i++) {
            const se = this.slotEls[i];
            const s = p.inventory[i];
            const w = s?.kind === 'weapon' ? WEAPONS[s.weaponId] : null;

            // Compteur : munitions TOTALES pour une arme (chargeur + réserve), nombre pour un soin
            let countTxt = '';
            if (s?.kind === 'weapon') {
                if (w?.type === 'gun') countTxt = String((s.mag || 0) + (p.ammo?.[w.ammo] || 0));
            } else if (s) {
                countTxt = `×${s.count}`;
            }
            if (countTxt !== se.countTxt) {
                se.countTxt = countTxt;
                se.count.textContent = countTxt;
                se.count.classList.toggle('empty', countTxt === '0'); // plus une seule balle
            }

            // Contenu de la case (le nombre de soins fait partie de l'étiquette accessible)
            const sig = s ? `${s.kind}|${s.weaponId || s.itemId}|${s.rarity || 0}|${s.kind === 'heal' ? s.count : ''}` : '-';
            if (sig === se.sig) continue;
            se.sig = sig;
            this.fillSlot(se, i, s, w);
        }

        this.updateEquipName();
    }

    // Nom de l'objet en main, au-dessus de l'inventaire (couleur de rareté pour les armes)
    updateEquipName() {
        const p = this.player;
        const s = p.alive ? p.inventory[p.slot] : null;
        let name = '';
        let sub = '';
        let color = '#ffffff';
        if (s?.kind === 'weapon') {
            const w = WEAPONS[s.weaponId];
            name = w?.name || s.weaponId;
            if (w?.type !== 'melee') {
                const r = RARITIES[s.rarity] || RARITIES[0];
                // Pas de texte de rareté : seul le trait sous le nom en prend la couleur
                sub = '';
                color = r.color;
            }
        } else if (s?.kind === 'heal') {
            const h = HEALS[s.itemId];
            name = h?.name || s.itemId;
            color = h?.color || '#6fdc70';
        }
        const key = `${p.slot}|${name}|${sub}|${color}`; // la couleur change avec la rareté
        if (key === this._equipKey) return;
        const slotChanged = this._equipSlot !== p.slot || this._equipName !== name;
        this._equipKey = key;
        this._equipSlot = p.slot;
        this._equipName = name;

        const el = this.el.equip;
        el.name.textContent = name;
        el.sub.textContent = sub;
        el.box.style.setProperty('--equip-color', color);
        el.box.classList.toggle('is-empty', !name);
        // Petite animation seulement quand on change réellement d'objet
        if (slotChanged && name) {
            const next = this._equipPop === 'pop' ? 'pop-b' : 'pop';
            if (this._equipPop) el.box.classList.remove(this._equipPop);
            el.box.classList.add(next);
            this._equipPop = next;
        }
    }

    // Contenu d'une case : la couleur (rareté ou soin) passe par la variable CSS --rar,
    // le rendu (dégradé plein + bordure de la même teinte) est entièrement dans game.css
    fillSlot({ btn, icon }, i, s, w) {
        icon.replaceChildren();
        btn.style.removeProperty('--rar');
        btn.classList.toggle('has-item', !!s);
        btn.classList.toggle('is-melee', w?.type === 'melee');

        if (!s) {
            btn.setAttribute('aria-label', `Emplacement ${i + 1} : vide`);
            return;
        }
        if (s.kind === 'weapon') {
            const img = document.createElement('img');
            img.src = makeIcon(s.weaponId, s.rarity, 96);
            img.alt = '';
            img.draggable = false;          // pas de glisser natif : c'est inventory-ui.js qui gère
            icon.appendChild(img);
            const rar = RARITIES[s.rarity] || RARITIES[0];
            // Pioche : pas de rareté, couleur neutre définie en CSS (.slot.is-melee)
            if (w?.type === 'melee') {
                btn.setAttribute('aria-label', `Emplacement ${i + 1} : ${w?.name || s.weaponId}`);
            } else {
                btn.style.setProperty('--rar', rar.color);
                btn.setAttribute('aria-label', `Emplacement ${i + 1} : ${w?.name || s.weaponId} (${rar.name})`);
            }
        } else {
            const h = HEALS[s.itemId];
            const img = document.createElement('img');
            img.src = makeHealIcon(s.itemId, 96);
            img.alt = '';
            img.draggable = false;
            icon.appendChild(img);
            btn.style.setProperty('--rar', h?.color || '#6fdc70');
            btn.setAttribute('aria-label', `Emplacement ${i + 1} : ${h?.name || s.itemId} ×${s.count}`);
        }
    }

    updateAmmo() {
        const p = this.player;
        const s = p.inventory[p.slot];
        const w = s?.kind === 'weapon' ? WEAPONS[s.weaponId] : null;
        const show = p.alive && w?.type === 'gun';
        this._show(this.el.ammo, 'ammo', show);
        if (!show) return;
        this._set(this.el.mag, 'mag', String(s.mag));
        this._set(this.el.reserve, 'reserve', `/ ${p.ammo[w.ammo] || 0}`);
        this.el.mag.classList.toggle('empty', s.mag === 0);
    }

    // Nouvelle ligne dans le fil des éliminations
    addKill(killer, victim, weaponId) {
        const el = document.createElement('div');
        el.className = 'kill-entry';
        if (killer === this.player || victim === this.player) el.classList.add('me');

        const name = (f) => {
            const s = document.createElement('span');
            s.className = 'k-name';
            s.textContent = f === this.player ? (f === killer ? 'Tu' : 'toi') : f.name;
            return s;
        };
        if (weaponId === 'knockout') {
            el.classList.add('knockout');
            if (killer && killer !== victim) {
                el.append(name(killer), killer === this.player ? ' as mis K.O. ' : ' a mis K.O. ', name(victim));
            } else {
                el.append(name(victim), ' est à terre');
            }
        } else if (weaponId === 'bleedout') {
            el.append(name(victim), ' a succombé à ses blessures');
        } else if (weaponId === 'corruption') {
            // Mort dans la corruption (pas de tueur)
            el.classList.add('corrupt');
            if (victim === this.player) {
                el.append('Tu as été corrompu');
            } else {
                el.append(name(victim), ' a été corrompu');
            }
        } else if (killer && killer !== victim) {
            el.append(name(killer), killer === this.player ? ' as éliminé ' : ' a éliminé ', name(victim));
            const wp = document.createElement('span');
            wp.className = 'k-weapon';
            wp.textContent = ` (${WEAPONS[weaponId]?.name || '?'})`;
            el.append(wp);
        } else {
            el.append(victim === this.player ? 'Tu es éliminé' : `${victim.name} est éliminé`);
        }

        this.el.feed.appendChild(el);
        this.feed.push({ el, t: FEED_TIME });
        while (this.feed.length > FEED_MAX) this.feed.shift().el.remove();
    }

    // Altimètre sous le personnage (centre de l'écran) pendant la chute.
    // Le DOM n'est touché que quand la valeur affichée (pas de 10 m) ou l'état change.
    updateAltimeter() {
        const p = this.player;
        const a = this.el.alt;
        const falling = p.phase === 'air';
        this._show(a.box, 'alt', falling);
        if (!falling) {
            this._altM = -1; // valeur réécrite au prochain saut
            return;
        }
        const alt = Math.max(0, Math.min(1, p.altitude ?? 0));
        const m = Math.round((alt * ALT_METERS) / ALT_STEP) * ALT_STEP;
        if (m === this._altM) return;
        this._altM = m;
        a.value.textContent = String(m);
        a.fill.style.transform = `scaleX(${(m / ALT_METERS).toFixed(3)})`;

        // État : chute libre → planeur ouvert → atterrissage (couleurs gérées par le CSS)
        const state = alt > GLIDER_ALT ? 'fall' : alt > LAND_ALT ? 'glide' : 'land';
        if (state === this._altState) return;
        if (this._altState) a.box.classList.remove(this._altState);
        a.box.classList.add(state);
        this._altState = state;
        a.hint.textContent = ALT_HINTS[state];
    }

    // Grande confirmation "ÉLIMINATION" au centre (animation relancée à chaque kill)
    killBanner(name) {
        const el = this._kb || (this._kb = document.getElementById('killBanner'));
        el.querySelector('.kb-name').textContent = name;
        el.hidden = false;
        el.classList.remove('show');
        void el.offsetWidth;
        el.classList.add('show');
        clearTimeout(this._kbTimer);
        this._kbTimer = setTimeout(() => { el.hidden = true; }, 1800);
    }

    // Bords rouges plus forts selon les dégâts
    hurt(amount) {
        this.vignette = Math.min(1, this.vignette + amount / 35);
    }

    /* ===================== CORRUPTION ===================== */

    // Zone de corruption (lecture seule), donnée une fois par main.js
    setZone(zone) {
        this.zone = zone || null;
        const $ = (id) => document.getElementById(id);
        const timer = $('zoneTimer');
        const fx = $('corruptionFx');
        if (!this.zone || !timer || !fx) {
            this.zel = null; // HTML absent : on ne fait rien plutôt que de planter
            return;
        }
        const alert = $('zoneAlert');
        this.zel = {
            timer,
            label: timer.querySelector('.zt-label'),
            time: timer.querySelector('.zt-time'),
            sub: timer.querySelector('.zt-sub'),
            alert,
            alertTitle: alert?.querySelector('.za-title'),
            alertSub: alert?.querySelector('.za-sub'),
            fx,
            deep: fx.querySelector('.cfx-deep'),
            glitch: [...fx.querySelectorAll('.cfx-glitch')].map((el) => ({ el, cls: '' }))
        };
        this._zState = '';
        this._zWarnPhase = 0;
    }

    // Minuteur sous la minimap + alertes quand l'état de la zone change.
    // Les textes ne sont réécrits que s'ils changent (en pratique une fois par seconde).
    updateZoneTimer() {
        const z = this.zone;
        const e = this.zel;
        const st = z.state || 'idle';

        // Alertes au changement d'état
        if (st !== this._zState) {
            this._zState = st;
            if (st === 'wait' && z.phase !== this._zWarnPhase) {
                this._zWarnPhase = z.phase;
                const sub = z.phaseCount ? `Phase ${z.phase}/${z.phaseCount} · rejoins la zone saine` : 'Rejoins la zone saine';
                this.showZoneAlert('La corruption se propage !', sub, 'warn');
            } else if (st === 'shrink') {
                this.showZoneAlert('La corruption avance', 'Ne reste pas dans le violet', 'shrink');
            }
            // Les sons ('zoneWarn' / 'zoneShrink') sont joués par main.js (corruption.onEvent)
        }

        const visible = st === 'wait' || st === 'shrink' || st === 'done';
        this._show(e.timer, 'zone', visible);
        if (!visible) return;

        // Classe d'état (couleurs / pulsation gérées par le CSS)
        if (st !== this._zClass) {
            if (this._zClass) e.timer.classList.remove(`is-${this._zClass}`);
            e.timer.classList.add(`is-${st}`);
            this._zClass = st;
        }
        const p = this.player;
        const outside = p.alive && p.phase !== 'ship' && !z.isSafe(p.x, p.y);
        if (outside !== this._zOutside) {
            this._zOutside = outside;
            e.timer.classList.toggle('outside', outside);
        }

        let label = 'Zone finale';
        let time = '';
        if (st === 'wait') {
            label = 'Corruption dans';
            time = fmtTime(z.timeLeft);
        } else if (st === 'shrink') {
            label = 'La corruption avance';
            time = fmtTime(z.timeLeft);
        }
        this._set(e.label, 'zLabel', label);
        this._set(e.time, 'zTime', time);

        let sub = z.phaseCount ? `Phase ${z.phase}/${z.phaseCount}` : '';
        if (z.dps > 0) sub += `${sub ? ' · ' : ''}${fmtDps(z.dps)} PV/s`;
        if (outside) sub = `Hors zone${sub ? ' · ' : ''}${sub}`;
        this._set(e.sub, 'zSub', sub);
    }

    // Message discret au centre-haut (animation relancée en alternant 2 classes)
    showZoneAlert(title, sub, kind) {
        const e = this.zel;
        if (!e.alert || !e.alertTitle) return;
        e.alertTitle.textContent = title;
        if (e.alertSub) e.alertSub.textContent = sub;
        e.alert.classList.toggle('is-shrink', kind === 'shrink');
        e.alert.hidden = false;
        const next = this._alertPop === 'show-a' ? 'show-b' : 'show-a';
        if (this._alertPop) e.alert.classList.remove(this._alertPop);
        e.alert.classList.add(next);
        this._alertPop = next;
        clearTimeout(this._alertTimer);
        this._alertTimer = setTimeout(() => { e.alert.hidden = true; }, ZONE_ALERT_TIME);
    }

    // Effet "joueur corrompu" : calque plein écran sous le HUD.
    // Seules des opacités (arrondies par pas de 0.05) et des classes sont écrites, et
    // seulement quand elles changent ; les animations CSS ne tournent que calque actif.
    updateCorruptionFx(dt) {
        const z = this.zone;
        const e = this.zel;
        const p = this.player;
        const on = z.state !== 'idle' && !!z.cur && p.alive && p.phase !== 'ship' && !z.isSafe(p.x, p.y);

        let level = 0;
        let deep = 0;
        if (on) {
            const df = clamp01((z.depth(p.x, p.y) || 0) / CFX_DEPTH);
            level = 0.6 + 0.4 * df;
            // Calque "profond" : plus fort quand la corruption fait mal (fin de partie) ou qu'on s'enfonce
            const dpsF = clamp01(((z.dps || 0) - 1) / 9);
            deep = clamp01(dpsF * 0.75 + df * 0.35);
        }

        // Activation immédiate, désactivation après le fondu de sortie (~0,4 s)
        if (on) {
            this._fxOff = CFX_FADE;
            if (!this._fxOn) {
                this._fxOn = true;
                e.fx.classList.add('active');
            }
        } else if (this._fxOn) {
            this._fxOff -= dt;
            if (this._fxOff <= 0) {
                this._fxOn = false;
                e.fx.classList.remove('active');
                // Sinon flash / glitch rejoués au prochain retour dans la corruption
                if (this._fxHit) e.fx.classList.remove(this._fxHit);
                this._fxHit = '';
                for (const b of e.glitch) {
                    if (b.cls) b.el.classList.remove(b.cls);
                    b.cls = '';
                }
            }
        }

        const op = q05(level).toFixed(2);
        if (op !== this._fxOp) {
            this._fxOp = op;
            e.fx.style.opacity = op; // transition CSS de 0,4 s
        }
        if (on && e.deep) {
            const dp = q05(deep).toFixed(2);
            if (dp !== this._fxDeep) {
                this._fxDeep = dp;
                e.deep.style.opacity = dp;
            }
        }

        // Tick de dégâts : la vie baisse sans que le bouclier baisse (la corruption l'ignore)
        this._hitT -= dt;
        const hp = p.health ?? 0;
        const sh = p.shield ?? 0;
        if (on && this._lastHp !== null && hp < this._lastHp - 0.01 && sh >= this._lastSh - 0.01 && this._hitT <= 0) {
            this._hitT = HIT_MIN_GAP;
            this.corruptHit();
        }
        this._lastHp = hp;
        this._lastSh = sh;

        // Glitchs à intervalle aléatoire, plus fréquents en profondeur
        if (on && !REDUCED_MOTION?.matches) {
            this._glitchT -= dt;
            if (this._glitchT <= 0) {
                this._glitchT = (0.4 + Math.random() * 1.8) / (0.6 + level);
                this.glitch();
            }
        }
        // Sons : le drone ('corruption') et 'corruptHit' sont pilotés par main.js
    }

    // Flash violet + pulsation de la vignette à chaque tick de dégâts
    corruptHit() {
        const fx = this.zel.fx;
        const next = this._fxHit === 'hit-a' ? 'hit-b' : 'hit-a';
        if (this._fxHit) fx.classList.remove(this._fxHit);
        fx.classList.add(next);
        this._fxHit = next;
    }

    // Une bande horizontale décalée apparaît brièvement (position / épaisseur aléatoires)
    glitch() {
        const bands = this.zel.glitch;
        if (!bands.length) return;
        const b = bands[this._glitchN++ % bands.length];
        b.el.style.setProperty('--gy', `${Math.round(Math.random() * 88)}vh`);
        b.el.style.setProperty('--gs', (0.25 + Math.random() * 1.1).toFixed(2));
        const next = b.cls === 'ga' ? 'gb' : 'ga';
        if (b.cls) b.el.classList.remove(b.cls);
        b.el.classList.add(next);
        b.cls = next;
    }

    showEnd(win, place, kills, killerName = '') {
        this.el.end.querySelector('.end-killer').textContent = killerName ? `Éliminé par ${killerName}` : '';
        const title = this.el.end.querySelector('.end-title');
        title.textContent = win ? 'Victoire Royale' : 'Éliminé';
        title.classList.toggle('lost', !win);
        this.el.end.querySelector('.end-place').textContent = `#${place}`;
        this.el.end.querySelector('.end-kills').textContent = `${kills} élimination${kills > 1 ? 's' : ''}`;
        this.el.end.hidden = false;
        document.getElementById('replayBtn').focus();
    }
}
