/* ==================================
   PARAMÈTRES - FOR2D ROYAL
   Options du joueur, gardées dans le navigateur (localStorage),
   partagées entre le lobby et le jeu.

   API :
   - Settings.get(nom)          : valeur de l'option
   - Settings.set(nom, valeur)  : change et sauvegarde l'option
   - Settings.onChange(fn)      : fn(nom, valeur) à chaque changement
   Module ES, aussi disponible en window.FOR2D_SETTINGS (scripts classiques du lobby).
   ================================== */

const STORAGE_KEY = 'for2d-settings';

// Valeurs par défaut (une option inconnue dans le stockage est ignorée)
const DEFAULTS = {
    autoAmmo: true   // ramasser les munitions automatiquement en passant dessus
};

const values = { ...DEFAULTS };
const listeners = [];

function load() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        for (const k of Object.keys(DEFAULTS)) {
            if (typeof saved[k] === typeof DEFAULTS[k]) values[k] = saved[k];
        }
    } catch {
        /* stockage indisponible ou corrompu : valeurs par défaut */
    }
}

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch {
        /* stockage indisponible : l'option reste valable pour cette page */
    }
}

load();

export const Settings = {
    get(name) {
        return values[name];
    },

    set(name, value) {
        if (!(name in DEFAULTS) || typeof value !== typeof DEFAULTS[name]) return;
        if (values[name] === value) return;
        values[name] = value;
        save();
        for (const fn of listeners) {
            try { fn(name, value); } catch { /* un écouteur raté ne bloque pas les autres */ }
        }
    },

    onChange(fn) {
        if (typeof fn === 'function') listeners.push(fn);
    }
};

/* ----- Interrupteurs de la page : <button role="switch" data-setting="nom"> ----- */

function syncSwitches() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-setting]').forEach((el) => {
        const on = !!values[el.dataset.setting];
        el.setAttribute('aria-checked', String(on));
        el.classList.toggle('on', on);
    });
}

function bindSwitches() {
    document.addEventListener('click', (e) => {
        const el = e.target instanceof Element ? e.target.closest('[data-setting]') : null;
        if (!el) return;
        const name = el.dataset.setting;
        if (typeof DEFAULTS[name] !== 'boolean') return;
        Settings.set(name, !values[name]);
        window.SFX?.play('click');
    });
    syncSwitches();
}

Settings.onChange(syncSwitches);

// Changement fait dans un autre onglet (ex. lobby ouvert à côté du jeu)
if (typeof window !== 'undefined') {
    window.FOR2D_SETTINGS = Settings;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindSwitches);
    else bindSwitches();
    window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY) return;
        const before = { ...values };
        load();
        for (const k of Object.keys(DEFAULTS)) {
            if (before[k] !== values[k]) for (const fn of listeners) fn(k, values[k]);
        }
    });
}

export default Settings;
