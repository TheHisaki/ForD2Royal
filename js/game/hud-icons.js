/* ==================================
   ICÔNES DU HUD - FOR2D ROYAL
   Pictos d'interface en SVG inline (viewBox 24 x 24), même style que les
   icônes d'armes (js/game/icons.js) : formes pleines aux couleurs vives,
   contour sombre épais, reflets clairs. Nets à toute taille, identiques
   sur tous les navigateurs / systèmes (plus d'émojis).

   Utilisation :
   - dans le HTML : <span class="hud-ico" data-icon="wood" aria-hidden="true"></span>
     puis mountHudIcons() remplit tous les emplacements ;
   - en JS : setHudIcon(el, 'sound-off') ou hudIconSvg('ammo', { color }).
   Pas de dégradé ni d'identifiant (id) : plusieurs copies d'une même icône
   dans la page ne se gênent pas.
   ================================== */

const OUTLINE = '#0a1030';
const TAU = Math.PI * 2;

// Couleurs du jeu (mêmes teintes que le HUD et les icônes d'armes)
export const ICON_COLORS = {
    outline: OUTLINE,
    yellow: '#ffe03d',
    yellowDark: '#f5b800',
    blue: '#3a8dff',
    cyan: '#4fd8ff',
    red: '#ff5470',
    green: '#4cdc5a',
    white: '#ffffff',
    skin: '#ffd6a5',
    bone: '#ece6d3',
    wood: '#a0673a',
    woodLight: '#e8b57c',
    woodDark: '#6e4424',
    stone: '#8d9199',
    stoneLight: '#a7abb2',
    stoneDark: '#62666e',
    // Matériau "pierre" du HUD : briques marron / rouge
    brick: '#b04a2f',
    brickLight: '#d0673f',
    brickMid: '#bf5834',
    brickDark: '#6e2616',
    metal: '#9fb0c4',
    metalLight: '#d4dde8',
    metalDark: '#6b7a8e',
    brass: '#f0c14b',
    brassDark: '#b8862e',
    corrupt: '#b04cff',
    corruptLight: '#e2c4ff',
    corruptDark: '#3b0a66'
};
const C = ICON_COLORS;

/* ===================== OUTILS DE DESSIN ===================== */

// Couleur de remplissage / trait : une couleur hexadécimale, ou une variable CSS
// (écrite dans l'attribut style pour pouvoir changer au survol)
function paintAttr(prop, color) {
    return color.startsWith('var(') ? `style="${prop}:${color}"` : `${prop}="${color}"`;
}

// Trait épais façon cartoon : contour sombre large, puis la couleur par-dessus
function thick(d, color, w = 2.4, border = 2.2) {
    return `<path d="${d}" fill="none" stroke-width="${w + border}"/>` +
        `<path d="${d}" fill="none" ${paintAttr('stroke', color)} stroke-width="${w}"/>`;
}

// Reflet clair (trait blanc semi-transparent, sans contour)
function shine(d, w = 1.3, a = 0.6) {
    return `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="${a}" stroke-width="${w}"/>`;
}

// Tache de lumière pleine (forme blanche semi-transparente)
function gloss(shape, a = 0.45) {
    return shape.replace(/\/>$/, ` fill="#fff" fill-opacity="${a}" stroke="none"/>`);
}

const n2 = (v) => Number(v.toFixed(2));

// Engrenage : dents trapézoïdales, creux en arc de cercle
function gearPath(cx, cy, rOut, rIn, teeth, halfOut, halfIn) {
    const pt = (r, a) => `${n2(cx + r * Math.cos(a))} ${n2(cy + r * Math.sin(a))}`;
    const step = TAU / teeth;
    let d = `M${pt(rIn, -Math.PI / 2 - halfIn)}`;
    for (let i = 0; i < teeth; i++) {
        const a = i * step - Math.PI / 2;
        d += ` L${pt(rOut, a - halfOut)} L${pt(rOut, a + halfOut)} L${pt(rIn, a + halfIn)}`;
        d += ` A${rIn} ${rIn} 0 0 1 ${pt(rIn, a + step - halfIn)}`;
    }
    return `${d} Z`;
}

// Étoile à n branches (utilisée par le lobby)
function starPath(cx, cy, rOut, rIn, n = 5) {
    let d = '';
    for (let i = 0; i < n * 2; i++) {
        const r = i % 2 ? rIn : rOut;
        const a = -Math.PI / 2 + (i * Math.PI) / n;
        d += `${i ? 'L' : 'M'}${n2(cx + r * Math.cos(a))} ${n2(cy + r * Math.sin(a))} `;
    }
    return `${d}Z`;
}

// Buste (tête + épaules), réutilisé pour "joueurs restants" et le groupe du lobby
function bust(body, head = C.skin, transform = '') {
    const t = transform ? ` transform="${transform}"` : '';
    return `<g${t}>` +
        `<path d="M4 21.2 V19 Q4 13.6 9.6 13.6 H14.4 Q20 13.6 20 19 V21.2 Z" fill="${body}"/>` +
        shine('M7 17.4 Q7.4 15.7 9.4 15.5', 1.4, 0.5) +
        `<circle cx="12" cy="8" r="4.4" fill="${head}"/>` +
        gloss('<ellipse cx="10.4" cy="6.4" rx="1.5" ry="1" transform="rotate(-35 10.4 6.4)"/>', 0.7) +
        '</g>';
}

// Haut-parleur (commun aux icônes son actif / son coupé)
const SPEAKER =
    `<path d="M3 9 H7 L12.6 4.4 V19.6 L7 15 H3 Z" fill="${C.yellow}"/>` +
    shine('M8.4 9.4 L11 7.3', 1.4, 0.7) +
    `<path d="M3 13.2 H7 L12.6 17.8" fill="none" stroke="${C.yellowDark}" stroke-width="1.2" stroke-opacity="0.9"/>` +
    `<path d="M3 9 H7 L12.6 4.4 V19.6 L7 15 H3 Z" fill="none"/>`;

// Couleur venant de l'extérieur (munitions) : uniquement un code hexadécimal
function safeColor(color, fallback) {
    return typeof color === 'string' && /^#[0-9a-f]{3,8}$/i.test(color) ? color : fallback;
}

/* ===================== ICÔNES ===================== */

const ICONS = {
    // Retour au lobby : grosse flèche jaune
    back: () =>
        `<path d="M2.8 12 L11 4.4 V8.6 H19.8 A1.6 1.6 0 0 1 21.4 10.2 V13.8 A1.6 1.6 0 0 1 19.8 15.4 H11 V19.6 Z" fill="${C.yellow}"/>` +
        gloss('<rect x="12.2" y="9.8" width="7.6" height="1.5" rx="0.75"/>', 0.55) +
        shine('M5.8 11.4 L9.4 8', 1.4, 0.65) +
        `<path d="M11 15.4 H19.8 A1.6 1.6 0 0 0 21.4 13.8" fill="none" stroke="${C.yellowDark}" stroke-width="1.2"/>`,

    // Plein écran : 4 coins
    fullscreen: () => {
        const corner = `<path d="M3 10 V4.6 A1.6 1.6 0 0 1 4.6 3 H10 V6.6 H6.6 V10 Z" fill="${C.cyan}"/>` +
            shine('M4.8 8.4 V5.2 Q4.8 4.8 5.2 4.8 H8.4', 1.1, 0.7);
        return [0, 90, 180, 270].map(r => `<g transform="rotate(${r} 12 12)">${corner}</g>`).join('');
    },

    // Son actif : haut-parleur + 2 ondes
    'sound-on': () =>
        SPEAKER +
        thick('M15.6 9.3 Q17.2 12 15.6 14.7', C.cyan, 2.2) +
        thick('M18.4 6.6 Q21.8 12 18.4 17.4', C.cyan, 2.2),

    // Son coupé : haut-parleur + croix rouge
    'sound-off': () =>
        SPEAKER +
        thick('M15.6 9.2 L21 14.8 M21 9.2 L15.6 14.8', C.red, 2.4),

    // Paramètres : engrenage métal
    gear: () =>
        `<path d="${gearPath(12, 12, 10.4, 7.6, 8, 0.19, 0.27)}" fill="${C.metal}" stroke-width="1.8"/>` +
        shine('M5.9 10 A6.4 6.4 0 0 1 10 5.9', 1.6, 0.75) +
        `<path d="M17.6 14.6 A6.2 6.2 0 0 1 14.6 17.6" fill="none" stroke="${C.metalDark}" stroke-width="1.4"/>` +
        `<circle cx="12" cy="12" r="3.3" fill="#26335e" stroke-width="1.8"/>` +
        shine('M10.6 13.2 A1.8 1.8 0 0 1 10.9 10.8', 1, 0.35),

    // Joueurs restants : buste
    alive: () => bust(C.blue),

    // Éliminations : crâne cartoon
    kills: () =>
        `<path d="M12 2.8 C6.8 2.8 3.8 6.3 3.8 10.4 C3.8 13 5.1 14.8 7 15.7 V18.6 A1.6 1.6 0 0 0 8.6 20.2 H15.4 A1.6 1.6 0 0 0 17 18.6 V15.7 C18.9 14.8 20.2 13 20.2 10.4 C20.2 6.3 17.2 2.8 12 2.8 Z" fill="${C.bone}"/>` +
        gloss('<path d="M6.4 8.6 Q7.4 5.4 11 4.9 Q8.4 6.4 7.8 9 Z"/>', 0.9) +
        `<path d="M17 15.7 C18.9 14.8 20.2 13 20.2 10.4" fill="none" stroke="#b9b09a" stroke-width="1.3"/>` +
        `<ellipse cx="8.7" cy="11" rx="2.2" ry="2.4" fill="${OUTLINE}" stroke="none"/>` +
        `<ellipse cx="15.3" cy="11" rx="2.2" ry="2.4" fill="${OUTLINE}" stroke="none"/>` +
        `<circle cx="8" cy="10.2" r="0.7" fill="${C.red}" stroke="none"/>` +
        `<circle cx="14.6" cy="10.2" r="0.7" fill="${C.red}" stroke="none"/>` +
        `<path d="M12 13.5 L10.9 15.5 H13.1 Z" fill="${OUTLINE}" stroke-width="0.8"/>` +
        '<path d="M10.3 17.4 V20.2 M13.7 17.4 V20.2" fill="none" stroke-width="1.4"/>',

    // Carte (touche M) : carte pliée en 3 avec un repère
    map: () =>
        `<path d="M3 6 L8.6 4 V18 L3 20 Z" fill="#7fe07a"/>` +
        `<path d="M8.6 4 L15.4 6 V20 L8.6 18 Z" fill="#4fbf52"/>` +
        `<path d="M15.4 6 L21 4 V18 L15.4 20 Z" fill="#7fe07a"/>` +
        gloss('<path d="M4.4 7 L7.4 5.9 V9.4 L4.4 10.5 Z"/>', 0.4) +
        `<path d="M16.8 9.5 Q18.4 8.6 19.6 9.6 Q18.6 12 16.8 11.4 Z" fill="${C.cyan}" stroke-width="1"/>` +
        `<path d="M12 7.6 C10.3 7.6 9.4 8.8 9.4 10 C9.4 11.8 12 14.6 12 14.6 C12 14.6 14.6 11.8 14.6 10 C14.6 8.8 13.7 7.6 12 7.6 Z" fill="${C.red}" stroke-width="1.4"/>` +
        '<circle cx="12" cy="10" r="0.9" fill="#fff" stroke="none"/>',

    // Bois : 2 bûches empilées (écorce + cernes)
    wood: () => {
        const log = (x0, x1, y, h) => {
            const cy = y + h / 2;
            const rx = n2(h * 0.38);
            return `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="${h}" rx="${h / 2}" fill="${C.wood}"/>` +
                gloss(`<rect x="${x0 + 2}" y="${y + 1.3}" width="${x1 - x0 - 4}" height="1.3" rx="0.65"/>`, 0.35) +
                `<path d="M${x0 + 4} ${cy + 1.2} H${x0 + 8} M${x0 + 6.5} ${cy - 1} H${x1 - 4}" fill="none" stroke="${C.woodDark}" stroke-width="1.2"/>` +
                `<ellipse cx="${x1}" cy="${cy}" rx="${rx}" ry="${h / 2}" fill="${C.woodLight}"/>` +
                `<ellipse cx="${x1}" cy="${cy}" rx="${n2(rx * 0.5)}" ry="${n2(h * 0.25)}" fill="none" stroke="${C.wood}" stroke-width="1.1"/>` +
                `<circle cx="${x1}" cy="${cy}" r="0.6" fill="${C.woodDark}" stroke="none"/>`;
        };
        return log(2.4, 16.6, 12.4, 8.4) + log(5.2, 18.8, 3.8, 8.4);
    },

    // Pierre : pyramide de 3 briques marron / rouge
    stone: () => {
        const block = (x, y, w, h, fill) =>
            `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.6" fill="${fill}"/>` +
            gloss(`<rect x="${x + 1.4}" y="${y + 1.2}" width="${w - 2.8}" height="1.4" rx="0.7"/>`, 0.45) +
            `<path d="M${x + 1.6} ${y + h - 1.4} H${x + w - 1.6}" fill="none" stroke="${C.brickDark}" stroke-width="1.1"/>` +
            `<circle cx="${x + w * 0.3}" cy="${y + h * 0.55}" r="0.7" fill="${C.brickDark}" stroke="none"/>` +
            `<circle cx="${x + w * 0.68}" cy="${y + h * 0.48}" r="0.55" fill="${C.brickDark}" stroke="none"/>`;
        return block(2, 12.6, 10, 8, C.brickLight) + block(12, 12.6, 10, 8, C.brick) + block(6.5, 4.6, 11, 8, C.brickMid);
    },

    // Métal : plaque boulonnée avec reflets en biais
    metal: () => {
        const plate = 'M5.4 4 H18.6 A2.4 2.4 0 0 1 21 6.4 V17.6 A2.4 2.4 0 0 1 18.6 20 H5.4 A2.4 2.4 0 0 1 3 17.6 V6.4 A2.4 2.4 0 0 1 5.4 4 Z';
        const bolt = (x, y) =>
            `<circle cx="${x}" cy="${y}" r="1.7" fill="${C.metalLight}" stroke-width="1.2"/>` +
            `<path d="M${x - 0.8} ${y + 0.8} L${x + 0.8} ${y - 0.8}" fill="none" stroke-width="0.9"/>`;
        return `<path d="${plate}" fill="${C.metal}" stroke="none"/>` +
            gloss('<path d="M11 5 H15 L9 19 H5 Z"/>', 0.4) +
            gloss('<path d="M16.4 5 H18 L12 19 H10.4 Z"/>', 0.3) +
            `<path d="M4.4 17.8 Q4.6 18.8 5.6 18.8 H18.4 Q19.4 18.8 19.6 17.8" fill="none" stroke="${C.metalDark}" stroke-width="1.3"/>` +
            `<path d="${plate}" fill="none"/>` +
            bolt(6.6, 7.4) + bolt(17.4, 7.4) + bolt(6.6, 16.4) + bolt(17.4, 16.4);
    },

    // Fermer : croix épaisse (couleur réglable en CSS avec --ico-close)
    close: () => thick('M6.2 6.2 L17.8 17.8 M17.8 6.2 L6.2 17.8', 'var(--ico-close, #fff)', 3.2, 2.6),

    // Corruption : goutte violette avec un œil
    corruption: () =>
        `<path d="M12 2.4 C12 2.4 4.8 10.4 4.8 14.8 A7.2 7.2 0 0 0 19.2 14.8 C19.2 10.4 12 2.4 12 2.4 Z" fill="${C.corrupt}"/>` +
        shine('M7.8 13 Q8.2 10.6 10.2 8', 1.4, 0.6) +
        `<path d="M8 15.2 Q12 11.4 16 15.2 Q12 19 8 15.2 Z" fill="${C.corruptLight}" stroke-width="1.3"/>` +
        `<ellipse cx="12" cy="15.2" rx="1" ry="2.1" fill="${C.corruptDark}" stroke="none"/>` +
        '<circle cx="12.6" cy="14.3" r="0.45" fill="#fff" stroke="none"/>',

    // Munition : balle stylisée (pointe à la couleur du type), inclinée
    ammo: (o) => {
        const color = safeColor(o.color, C.brass);
        return '<g transform="rotate(35 12 12)">' +
            `<rect x="8.5" y="10.4" width="7" height="9" rx="1" fill="${C.brass}"/>` +
            gloss('<rect x="9.7" y="11.8" width="1.4" height="6" rx="0.7"/>', 0.55) +
            `<rect x="7.8" y="18.8" width="8.4" height="2.8" rx="0.9" fill="${C.brassDark}"/>` +
            `<path d="M8.5 11 V9 C8.5 5.4 10.3 2.6 12 2.6 C13.7 2.6 15.5 5.4 15.5 9 V11 Z" fill="${color}"/>` +
            shine('M10.3 8.6 Q10.4 6 11.6 4.6', 1.2, 0.7) +
            '</g>';
    },

    // Cartouche de fusil à pompe : corps coloré + culot en laiton
    shell: (o) => {
        const color = safeColor(o.color, C.red);
        return '<g transform="rotate(35 12 12)">' +
            `<rect x="7.6" y="2.6" width="8.8" height="13.4" rx="1.6" fill="${color}"/>` +
            gloss('<rect x="9.1" y="4.2" width="1.5" height="10" rx="0.75"/>', 0.5) +
            '<path d="M10 3.4 L12 5.2 L14 3.4" fill="none" stroke-width="1"/>' +
            `<rect x="7.2" y="15" width="9.6" height="4.8" rx="0.8" fill="${C.brass}"/>` +
            `<rect x="6.6" y="19.2" width="10.8" height="2.4" rx="0.8" fill="${C.brassDark}"/>` +
            '</g>';
    }
};

/* ===================== API ===================== */

const cache = new Map();

// Balise <svg> complète d'une icône ('' si le nom est inconnu). Options : { color }
export function hudIconSvg(name, opts = {}) {
    const make = ICONS[name];
    if (!make) return '';
    const color = opts.color || '';
    const key = `${name}|${color}`;
    let svg = cache.get(key);
    if (!svg) {
        svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" focusable="false" aria-hidden="true" ' +
            `stroke="${OUTLINE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${make({ color })}</svg>`;
        cache.set(key, svg);
    }
    return svg;
}

// Met (ou change) l'icône d'un emplacement. Couleur optionnelle : opts.color ou data-icon-color
export function setHudIcon(el, name, opts = {}) {
    if (!el || !name || !ICONS[name]) return false;
    const color = opts.color || el.dataset.iconColor || '';
    const key = `${name}|${color}`;
    el.dataset.icon = name;
    if (el.dataset.iconMounted === key) return true; // déjà la bonne icône : rien à refaire
    el.innerHTML = hudIconSvg(name, { color });
    el.dataset.iconMounted = key;
    return true;
}

// Remplit tous les emplacements [data-icon] sous root (root compris). Renvoie le nombre d'icônes posées.
export function mountHudIcons(root = document) {
    if (!root?.querySelectorAll) return 0;
    const els = [...root.querySelectorAll('[data-icon]')];
    if (root.matches?.('[data-icon]')) els.unshift(root);
    let count = 0;
    for (const el of els) if (setHudIcon(el, el.dataset.icon)) count++;
    return count;
}

// Ajoute d'autres icônes (ex. le lobby) : { nom: (opts) => 'balises SVG' }
export function registerHudIcons(map) {
    for (const [name, make] of Object.entries(map)) {
        if (typeof make !== 'function') continue;
        ICONS[name] = make;
        for (const key of cache.keys()) if (key.startsWith(`${name}|`)) cache.delete(key);
    }
}

export function hudIconNames() {
    return Object.keys(ICONS);
}

// Outils de dessin partagés (pour les icônes ajoutées avec registerHudIcons)
export const ICON_KIT = { OUTLINE, thick, shine, gloss, bust, starPath, gearPath };
