/* ==================================
   INVENTAIRE DÉTAILLÉ - FOR2D ROYAL
   Clic molette (ou touche I) : petit panneau au-dessus de la hotbar pour
   - déplacer les objets (glisser une case sur une autre, ou boutons ◀ ▶) ;
     le glisser marche aussi directement dans la hotbar, et lâcher l'objet loin
     de la hotbar le jette (une marge autour d'elle évite les jets par erreur),
   - jeter un objet (bouton, ou glisser la case hors du panneau),
   - voir les statistiques de l'arme / du soin choisi,
   - jeter des munitions.
   La case 1 (pioche) ne se déplace pas et ne se jette pas.
   ================================== */

import { WEAPONS, HEALS, THROWABLES, INVENTORY_SLOTS, RARITIES, AMMO_TYPES, weaponDamage } from './weapons.js';
import { makeIcon, makeHealIcon, makeThrowableIcon } from './icons.js';
import { hudIconSvg } from './hud-icons.js';

const SLOTS = INVENTORY_SLOTS;
const DRAG_START = 6;       // pixels avant qu'un clic devienne un glisser
const AMMO_DROP = 30;       // munitions jetées par clic

// Maximums pour les barres de statistiques (les meilleures armes du jeu ≈ 100 %)
const MAX = { damage: 110, dps: 170, fireRate: 11, range: 2400, mag: 30, reload: 4 };

const HOTBAR_SAFE = 90;     // marge (px) autour de la hotbar : y lâcher un objet ne le jette pas

const isFixed = (i) => i === 0; // la pioche reste en case 1

function fmt(n, d = 0) {
    return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });
}

export class InventoryUI {
    constructor({ player, loot, onSelect, sfx }) {
        this.player = player;
        this.loot = loot;
        this.onSelect = onSelect;
        this.sfx = sfx;
        this.open = false;
        this.sel = -1;          // case dont on affiche les détails
        this._sig = '';
        this._drag = null;

        const $ = (id) => document.getElementById(id);
        this.el = {
            box: $('invPanel'),
            slots: $('invSlots'),
            details: $('invDetails'),
            ammo: $('invAmmo'),
            close: $('invClose')
        };
        if (!this.el.box) return;

        // Cases du panneau (créées une fois)
        this.slotEls = [];
        for (let i = 0; i < SLOTS; i++) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'inv-slot';
            b.dataset.slot = String(i);
            b.innerHTML = '<span class="inv-icon" aria-hidden="true"></span><span class="inv-count"></span><span class="inv-key" aria-hidden="true"></span>';
            b.querySelector('.inv-key').textContent = String(i + 1);
            this.el.slots.appendChild(b);
            this.slotEls.push(b);
        }

        this.el.close.addEventListener('click', () => this.toggle(false));
        // Clic (ou Entrée / Espace) sur une case : ses détails
        this.el.slots.addEventListener('click', (e) => {
            const btn = e.target instanceof Element ? e.target.closest('.inv-slot') : null;
            if (btn) this.select(Number(btn.dataset.slot));
        });
        this.el.slots.addEventListener('pointerdown', (e) => this._down(e));
        // Glisser-déposer aussi directement depuis la hotbar (sans ouvrir l'inventaire)
        this.hotbar = document.getElementById('hotbar');
        this.hotSlots = this.hotbar ? [...this.hotbar.querySelectorAll('.slot')] : [];
        this.hotbar?.addEventListener('pointerdown', (e) => this._down(e));
        addEventListener('pointermove', (e) => this._move(e));
        addEventListener('pointerup', (e) => this._up(e));
        addEventListener('pointercancel', () => this._endDrag());

        // Boutons des détails et des munitions (délégation)
        this.el.box.addEventListener('click', (e) => {
            const t = e.target instanceof Element ? e.target.closest('[data-act]') : null;
            if (!t) return;
            const act = t.dataset.act;
            if (act === 'drop') this.dropSlot(this.sel);
            else if (act === 'dropHalf') this.dropSlot(this.sel, true);
            else if (act === 'left') this.moveSlot(this.sel, this.sel - 1);
            else if (act === 'right') this.moveSlot(this.sel, this.sel + 1);
            else if (act === 'equip') this.onSelect?.(this.sel);
            else if (act === 'ammo') this.dropAmmo(t.dataset.type);
        });
        // Clavier : flèches pour choisir une case, Suppr pour jeter
        this.el.box.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                this.dropSlot(this.sel);
            }
        });
    }

    get available() {
        return !!this.el.box;
    }

    toggle(force) {
        if (!this.available) return;
        const p = this.player;
        let open = typeof force === 'boolean' ? force : !this.open;
        if (open && (!p.alive || p.dbno || p.phase !== 'ground')) open = false;
        if (open === this.open) return;
        this.open = open;
        this.el.box.hidden = !open;
        this.sfx?.play('map', { open });
        this._endDrag();
        if (open) {
            this.sel = p.slot;
            this._sig = '';
            this.refresh();
            this.slotEls[this.sel]?.focus();
        } else if (this.el.box.contains(document.activeElement)) {
            document.activeElement.blur();
        }
    }

    // Appelé à chaque image : ferme si on ne peut plus l'utiliser, redessine si l'inventaire a changé
    update() {
        if (!this.open) return;
        const p = this.player;
        if (!p.alive || p.dbno || p.phase !== 'ground') {
            this.toggle(false);
            return;
        }
        const sig = this._signature();
        if (sig !== this._sig) this.refresh();
    }

    _signature() {
        const p = this.player;
        const inv = p.inventory.map(s => s ? `${s.kind}:${s.weaponId || s.itemId}:${s.rarity || 0}:${s.mag ?? ''}:${s.count ?? ''}` : '-').join('|');
        const ammo = Object.keys(AMMO_TYPES).map(k => p.ammo?.[k] || 0).join(',');
        return `${inv}#${ammo}#${p.slot}#${this.sel}`;
    }

    /* ===================== ACTIONS ===================== */

    select(i) {
        if (i < 0 || i >= SLOTS) return;
        this.sel = i;
        this.refresh();
    }

    // Échange le contenu de 2 cases (la pioche ne bouge pas). L'objet en main reste en main.
    moveSlot(from, to) {
        const p = this.player;
        const inv = p.inventory;
        if (from === to || from < 1 || to < 1 || from >= SLOTS || to >= SLOTS || !inv[from]) return;
        [inv[from], inv[to]] = [inv[to], inv[from]];
        // Soin en cours : il suit sa case
        if (p.usingItem) {
            if (p.usingItem.slot === from) p.usingItem.slot = to;
            else if (p.usingItem.slot === to) p.usingItem.slot = from;
        }
        if (p.slot === from) this.onSelect?.(to);
        else if (p.slot === to) this.onSelect?.(from);
        this.sel = to;
        this.sfx?.play('slot');
        this.refresh();
    }

    // Jette la case (ou la moitié d'une pile de soins)
    dropSlot(i, half = false) {
        const p = this.player;
        const s = p.inventory[i];
        if (!s || isFixed(i)) return;
        let data = s;
        if (half && s.kind === 'heal' && s.count > 1) {
            const n = Math.floor(s.count / 2);
            s.count -= n;
            data = { kind: 'heal', itemId: s.itemId, count: n };
        } else {
            p.inventory[i] = null;
            if (p.usingItem && p.usingItem.slot === i) p.usingItem = null;
            // L'arme jetée était en train d'être rechargée : Combat annule tout seul
        }
        this.loot.throwItem(p, data);
        this.sfx?.play('pickup', { kind: s.kind });
        this.refresh();
    }

    dropAmmo(type) {
        const p = this.player;
        const have = p.ammo?.[type] || 0;
        if (have <= 0) return;
        const n = Math.min(AMMO_DROP, have);
        p.ammo[type] = have - n;
        this.loot.throwItem(p, { kind: 'ammo', ammoType: type, amount: n });
        this.sfx?.play('pickup', { kind: 'ammo' });
        this.refresh();
    }

    /* ===================== GLISSER-DÉPOSER ===================== */

    /*
       Rectangles mesurés une seule fois au début du glisser : ensuite, aucun
       calcul de mise en page pendant le mouvement (c'est ce qui ralentissait).
    */
    _measure() {
        const rect = (el) => (el && !el.hidden ? el.getBoundingClientRect() : null);
        const slots = [];
        const add = (b, i) => {
            const r = rect(b);
            if (r && r.width > 0) slots.push({ i, r });
        };
        if (this.open) this.slotEls.forEach(add);
        this.hotSlots.forEach(add);
        return { slots, box: this.open ? rect(this.el.box) : null, hotbar: rect(this.hotbar) };
    }

    // Numéro de la case (inventaire ou hotbar) sous le point, ou -1
    _slotAt(x, y) {
        const m = this._drag?.rects;
        if (!m) return -1;
        for (const { i, r } of m.slots) {
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
        }
        return -1;
    }

    // Le point est-il dans le rectangle, agrandi de "margin" pixels ?
    _near(r, x, y, margin = 0) {
        return !!r && x >= r.left - margin && x <= r.right + margin && y >= r.top - margin && y <= r.bottom + margin;
    }

    _down(e) {
        if (e.button !== 0) return;
        const t = e.target instanceof Element ? e.target : null;
        const inv = t?.closest('.inv-slot');
        const hot = inv ? null : t?.closest('#hotbar .slot');
        if (!inv && !hot) return;
        const p = this.player;
        if (!p.alive || p.dbno || p.phase !== 'ground') return;
        const i = inv ? Number(inv.dataset.slot) : this.hotSlots.indexOf(hot);
        if (i < 0) return;
        // Hotbar : pas de sélection de texte ni de glisser natif du navigateur (le clic reste géré)
        if (hot) e.preventDefault();
        this._drag = {
            from: i, src: inv ? 'inv' : 'hotbar', x: e.clientX, y: e.clientY,
            px: e.clientX, py: e.clientY, moving: false, ghost: null, raf: 0, over: -1, outside: false, rects: null
        };
    }

    // Le mouvement est seulement noté ; il est appliqué une fois par image (_frame)
    _move(e) {
        const d = this._drag;
        if (!d) return;
        const p = this.player;
        if (!p.alive || p.phase !== 'ground') {
            this._endDrag();
            return;
        }
        d.px = e.clientX;
        d.py = e.clientY;
        if (!d.moving) {
            if (Math.hypot(d.px - d.x, d.py - d.y) < DRAG_START) return;
            if (isFixed(d.from) || !p.inventory[d.from]) return; // rien à glisser
            this._startDrag(d);
        }
        if (!d.raf) d.raf = requestAnimationFrame(() => this._frame());
    }

    _startDrag(d) {
        d.moving = true;
        d.rects = this._measure();
        // Fantôme qui suit la souris (copie de la case d'où part l'objet, sans animation)
        const srcEl = d.src === 'hotbar' ? this.hotSlots[d.from] : this.slotEls[d.from];
        const g = srcEl.cloneNode(true);
        g.classList.remove('active', 'selected', 'drag-over', 'equipped');
        g.classList.add('inv-ghost');
        g.removeAttribute('id');
        g.setAttribute('aria-hidden', 'true');
        g.style.transform = `translate3d(${d.px - 32}px, ${d.py - 32}px, 0)`;
        document.body.appendChild(g);
        d.ghost = g;
        d.srcEl = srcEl;
        srcEl.classList.add('drag-from');
        this.el.box.classList.add('dragging');
        this.hotbar?.classList.add('dragging');
        document.body.classList.add('item-dragging');
    }

    _frame() {
        const d = this._drag;
        if (!d || !d.moving) return;
        d.raf = 0;
        const x = d.px;
        const y = d.py;
        d.ghost.style.transform = `translate3d(${x - 32}px, ${y - 32}px, 0)`;

        const over = this._slotAt(x, y);
        if (over !== d.over) {
            const mark = (b, i) => b.classList.toggle('drag-over', i === over && i !== d.from && !isFixed(i));
            this.slotEls.forEach(mark);
            this.hotSlots.forEach(mark);
            d.over = over;
        }
        const outside = this._isOutside(x, y, over);
        if (outside !== d.outside) {
            d.ghost.classList.toggle('will-drop', outside);
            d.outside = outside;
        }
    }

    // On jette seulement loin de tout : ni sur une case, ni sur le panneau,
    // ni dans la marge de sécurité autour de la hotbar (lâcher par erreur = rien)
    _isOutside(x, y, over) {
        const m = this._drag?.rects;
        if (!m || over >= 0) return false;
        return !this._near(m.box, x, y, 10) && !this._near(m.hotbar, x, y, HOTBAR_SAFE);
    }

    _up(e) {
        const d = this._drag;
        if (!d) return;
        if (!d.moving) {
            this._drag = null; // simple clic : géré par l'événement "click" (souris et clavier)
            return;
        }
        const to = this._slotAt(e.clientX, e.clientY);
        const outside = this._isOutside(e.clientX, e.clientY, to);
        const from = d.from;
        this._endDrag();
        if (outside) this.dropSlot(from);
        else if (to >= 1 && to !== from) this.moveSlot(from, to);
    }

    _endDrag() {
        const d = this._drag;
        this._drag = null;
        if (!d) return;
        if (d.raf) cancelAnimationFrame(d.raf);
        d.ghost?.remove();
        this.el.box?.classList.remove('dragging');
        this.hotbar?.classList.remove('dragging');
        document.body.classList.remove('item-dragging');
        this.slotEls?.forEach(b => b.classList.remove('drag-over', 'drag-from'));
        this.hotSlots?.forEach(b => b.classList.remove('drag-over', 'drag-from'));
    }

    /* ===================== AFFICHAGE ===================== */

    refresh() {
        if (!this.open) return;
        const p = this.player;
        this._sig = this._signature();

        for (let i = 0; i < SLOTS; i++) {
            const b = this.slotEls[i];
            const s = p.inventory[i];
            const icon = b.querySelector('.inv-icon');
            const count = b.querySelector('.inv-count');
            icon.replaceChildren();
            count.textContent = '';
            b.style.removeProperty('--rar');
            let label = `Case ${i + 1} : vide`;
            if (s?.kind === 'weapon') {
                const w = WEAPONS[s.weaponId];
                const img = document.createElement('img');
                img.src = makeIcon(s.weaponId, s.rarity, 96, s.pickaxeSkin || p.pickaxeSkin);
                img.alt = '';
                img.draggable = false;
                icon.appendChild(img);
                const rar = RARITIES[s.rarity] || RARITIES[0];
                if (w?.type !== 'melee') b.style.setProperty('--rar', rar.color);
                if (w?.type === 'gun') count.textContent = String((s.mag || 0) + (p.ammo?.[w.ammo] || 0));
                label = `Case ${i + 1} : ${w?.name || s.weaponId}${w?.type === 'melee' ? '' : ` (${rar.name})`}`;
            } else if (s?.kind === 'heal') {
                const h = HEALS[s.itemId];
                const img = document.createElement('img');
                img.src = makeHealIcon(s.itemId, 96);
                img.alt = '';
                img.draggable = false;
                icon.appendChild(img);
                count.textContent = `×${s.count}`;
                b.style.setProperty('--rar', h?.color || '#6fdc70');
                label = `Case ${i + 1} : ${h?.name || s.itemId} ×${s.count}`;
            } else if (s?.kind === 'throwable') {
                const t = THROWABLES[s.itemId];
                const img = document.createElement('img');
                img.src = makeThrowableIcon(s.itemId, 96);
                img.alt = '';
                img.draggable = false;
                icon.appendChild(img);
                count.textContent = `×${s.count}`;
                b.style.setProperty('--rar', t?.color || '#fff0a0');
                label = `Case ${i + 1} : ${t?.name || s.itemId} ×${s.count}`;
            }
            b.setAttribute('aria-label', label);
            b.classList.toggle('selected', i === this.sel);
            b.classList.toggle('equipped', i === p.slot);
            b.classList.toggle('empty', !s);
        }

        this._renderDetails();
        this._renderAmmo();
    }

    _renderDetails() {
        const p = this.player;
        const i = this.sel;
        const s = p.inventory[i];
        const el = this.el.details;
        el.replaceChildren();

        if (!s) {
            el.innerHTML = '<p class="inv-empty">Case vide. Glisse un objet ici pour le ranger.</p>';
            return;
        }

        const head = document.createElement('div');
        head.className = 'inv-head';
        const title = document.createElement('div');
        title.className = 'inv-title';
        const rows = [];
        let color = '#ffffff';
        let sub = '';

        if (s.kind === 'weapon') {
            const w = WEAPONS[s.weaponId];
            title.textContent = w?.name || s.weaponId;
            if (w?.type === 'melee') {
                sub = 'Outil de récolte · ne se jette pas';
                rows.push(['Dégâts', fmt(weaponDamage(w.id, s.rarity)), weaponDamage(w.id, s.rarity) / MAX.damage]);
                rows.push(['Coups / s', fmt(w.fireRate, 1), w.fireRate / MAX.fireRate]);
            } else if (w) {
                const rar = RARITIES[s.rarity] || RARITIES[0];
                color = rar.color;
                sub = `${rar.name} · ${AMMO_TYPES[w.ammo]?.name || ''}`;
                const dmg = weaponDamage(w.id, s.rarity) * (w.pellets || 1);
                const dps = dmg * w.fireRate;
                rows.push(['Dégâts', w.pellets > 1 ? `${fmt(weaponDamage(w.id, s.rarity))} × ${w.pellets}` : fmt(dmg), dmg / MAX.damage]);
                rows.push(['DPS', fmt(dps), dps / MAX.dps]);
                rows.push(['Cadence', `${fmt(w.fireRate, 1)} tirs/s`, w.fireRate / MAX.fireRate]);
                rows.push(['Chargeur', `${s.mag || 0} / ${w.magSize}`, w.magSize / MAX.mag]);
                rows.push(['Rechargement', `${fmt(w.reloadTime, 1)} s`, 1 - w.reloadTime / MAX.reload]);
                rows.push(['Portée', fmt(w.range), w.range / MAX.range]);
                rows.push(['Précision', `${Math.round((1 - Math.min(1, w.spread / 0.3)) * 100)} %`, 1 - Math.min(1, w.spread / 0.3)]);
                rows.push(['Mode', w.auto ? 'Automatique' : 'Coup par coup', null]);
            }
        } else if (s.kind === 'heal') {
            const h = HEALS[s.itemId];
            title.textContent = h?.name || s.itemId;
            color = h?.color || '#6fdc70';
            sub = `${s.count} / ${h?.stack || 1} dans la pile`;
            if (h?.heal) rows.push(['Soin', `+${h.heal} PV (max ${h.healCap ?? 100})`, h.heal / 100]);
            if (h?.shield) rows.push(['Bouclier', `+${h.shield} (max ${h.shieldCap ?? 100})`, h.shield / 100]);
            rows.push(['Utilisation', `${fmt(h?.useTime || 0, 1)} s`, 1 - (h?.useTime || 0) / 6]);
        } else if (s.kind === 'throwable') {
            const t = THROWABLES[s.itemId];
            title.textContent = t?.name || s.itemId;
            color = t?.color || '#fff0a0';
            sub = `${s.count} charge${s.count > 1 ? 's' : ''}`;
            rows.push(['Effet', t?.damage ? `${t.damage} dégâts dans ${t.radius} unités` : t?.short || 'Effet spécial', null]);
            rows.push(['Maintenir', 'Prévisualiser la trajectoire', null]);
        }

        head.style.setProperty('--rar', color);
        const subEl = document.createElement('div');
        subEl.className = 'inv-sub';
        subEl.textContent = sub;
        head.append(title, subEl);
        el.appendChild(head);

        const list = document.createElement('dl');
        list.className = 'inv-stats';
        for (const [name, value, bar] of rows) {
            const row = document.createElement('div');
            row.className = 'inv-stat';
            const dt = document.createElement('dt');
            dt.textContent = name;
            const dd = document.createElement('dd');
            dd.textContent = value;
            row.append(dt, dd);
            if (bar !== null && bar !== undefined) {
                const track = document.createElement('span');
                track.className = 'inv-bar';
                track.setAttribute('aria-hidden', 'true');
                const fill = document.createElement('span');
                fill.style.transform = `scaleX(${Math.max(0.04, Math.min(1, bar)).toFixed(3)})`;
                track.appendChild(fill);
                row.appendChild(track);
            }
            list.appendChild(row);
        }
        el.appendChild(list);

        // Actions
        const acts = document.createElement('div');
        acts.className = 'inv-actions';
        const add = (act, text, label, disabled = false) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.dataset.act = act;
            b.textContent = text;
            if (label) b.setAttribute('aria-label', label);
            b.disabled = disabled;
            acts.appendChild(b);
        };
        if (i !== p.slot) add('equip', 'Équiper');
        if (!isFixed(i)) {
            add('left', '◀', 'Déplacer vers la gauche', i <= 1);
            add('right', '▶', 'Déplacer vers la droite', i >= SLOTS - 1);
            if (s.kind === 'heal' && s.count > 1) add('dropHalf', 'Jeter la moitié');
            add('drop', 'Jeter', 'Jeter l\'objet (Suppr)');
        }
        el.appendChild(acts);
    }

    _renderAmmo() {
        const p = this.player;
        const el = this.el.ammo;
        el.replaceChildren();
        for (const [type, info] of Object.entries(AMMO_TYPES)) {
            const n = p.ammo?.[type] || 0;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'inv-ammo';
            b.dataset.act = 'ammo';
            b.dataset.type = type;
            b.disabled = n <= 0;
            b.style.setProperty('--ammo', info.color);
            b.title = n > 0 ? `Jeter ${Math.min(AMMO_DROP, n)} ${info.name.toLowerCase()}` : info.name;
            b.setAttribute('aria-label', `${info.name} : ${n}${n > 0 ? `, jeter ${Math.min(AMMO_DROP, n)}` : ''}`);
            // Balle (ou cartouche) SVG à la couleur du type de munitions
            const ico = hudIconSvg(type === 'shells' ? 'shell' : 'ammo', { color: info.color });
            b.innerHTML = `<span class="inv-ammo-dot hud-ico" aria-hidden="true">${ico}</span><span class="inv-ammo-n"></span>`;
            b.querySelector('.inv-ammo-n').textContent = String(n);
            el.appendChild(b);
        }
    }
}
