/* ==================================
   DESSINS DES OBJETS DU CASIER - FOR2D ROYAL
   Sacs à dos, planeurs et emotes en SVG (viewBox 120 x 120), style cartoon :
   contour sombre épais, reflets, couleurs du catalogue (js/cosmetics.js).
   Les tenues sont dessinées par js/lobby-skin.js.
   ================================== */

const O = '#0a1030';

// Éclaircit (k > 0) ou assombrit (k < 0) une couleur #rrggbb
function shade(hex, k) {
    const n = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0x888888;
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map(c => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k));
    return `#${ch.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

const svg = (body, cls) =>
    `<svg class="item-svg ${cls}" viewBox="0 0 120 120" aria-hidden="true" focusable="false" ` +
    `stroke="${O}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

const shine = (d, w = 3, a = 0.55) => `<path d="${d}" fill="none" stroke="#fff" stroke-opacity="${a}" stroke-width="${w}"/>`;

/* ===================== SACS À DOS ===================== */

function backpack(it) {
    const c = it.color;
    const d = shade(c, -0.3);
    const a = it.accent;
    // Bretelles (derrière) + corps + rabat
    let s =
        `<path d="M36 34 Q26 60 30 92 M84 34 Q94 60 90 92" fill="none" stroke-width="11"/>` +
        `<path d="M36 34 Q26 60 30 92 M84 34 Q94 60 90 92" fill="none" stroke="${shade(a, -0.2)}" stroke-width="5"/>` +
        `<rect x="28" y="26" width="64" height="80" rx="18" fill="${c}"/>` +
        `<path d="M72 28 Q92 30 92 50 V88 Q92 104 76 106 H70 Z" fill="${d}" stroke="none" opacity="0.55"/>` +
        `<rect x="28" y="26" width="64" height="80" rx="18" fill="none"/>` +
        `<path d="M44 18 Q60 10 76 18 L76 30 H44 Z" fill="${d}"/>` +
        `<path d="M28 50 Q60 60 92 50 L92 44 Q60 54 28 44 Z" fill="${d}"/>` +
        shine('M36 42 Q38 34 46 32');
    if (it.motif === 'rocket') {
        s += `<path d="M60 52 Q74 64 72 90 H48 Q46 64 60 52 Z" fill="${a}"/>` +
            `<circle cx="60" cy="72" r="6" fill="#6fd0ff"/>` +
            `<path d="M48 82 L40 96 L50 92 Z M72 82 L80 96 L70 92 Z" fill="${shade(c, 0.3)}"/>` +
            `<path d="M52 92 Q60 108 68 92 Z" fill="#ffe03d"/>`;
    } else if (it.motif === 'shield') {
        s += `<path d="M42 56 H78 V76 Q78 92 60 100 Q42 92 42 76 Z" fill="${a}"/>` +
            `<path d="M48 61 H72 V76 Q72 88 60 94 Q48 88 48 76 Z" fill="${c}" stroke-width="2.5"/>` +
            `<path d="M57 64 H63 V72 H70 V78 H63 V88 H57 V78 H50 V72 H57 Z" fill="#fff" stroke-width="2"/>`;
    } else if (it.motif === 'pixel') {
        // Cœur en gros pixels (Passe de combat)
        const px = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [2, 4]];
        s += `<rect x="40" y="58" width="40" height="36" rx="6" fill="${d}"/>` +
            px.map(([x, y]) => `<rect x="${45 + x * 6}" y="${62 + y * 6}" width="6" height="6" fill="${a}" stroke="none"/>`).join('') +
            `<rect x="47" y="64" width="3" height="3" fill="#fff" stroke="none" opacity="0.8"/>`;
    } else if (it.motif === 'lantern') {
        s += `<rect x="46" y="54" width="28" height="40" rx="5" fill="#1a0a30"/>` +
            `<path d="M60 62 Q70 76 60 88 Q50 76 60 62 Z" fill="${a}" stroke-width="2.5"/>` +
            `<path d="M60 70 Q64 78 60 84 Q56 78 60 70 Z" fill="#f1d9ff" stroke="none"/>` +
            `<path d="M46 66 H74 M46 82 H74 M60 54 V58" fill="none" stroke="${shade(a, 0.2)}" stroke-width="2.5"/>` +
            `<rect x="42" y="50" width="36" height="7" rx="3" fill="${a}"/>` +
            `<rect x="42" y="91" width="36" height="7" rx="3" fill="${a}"/>`;
    } else {
        s += `<rect x="40" y="62" width="40" height="30" rx="8" fill="${d}"/>` +
            `<rect x="53" y="58" width="14" height="10" rx="3" fill="${a}"/>` +
            shine('M46 70 H58', 2.5, 0.4);
    }
    return svg(s, 'item-backpack');
}

/* ===================== PLANEURS ===================== */

function glider(it) {
    const [c1, c2] = it.colors;
    const frame = '#1d2440';
    // 6 panneaux (3 par demi-aile) entre le bord d'attaque et le bord de fuite
    const lead = [[6, 74], [23, 60], [41, 45], [60, 30], [79, 45], [97, 60], [114, 74]];
    const trail = [[14, 86], [30, 78], [46, 70], [60, 62], [74, 70], [90, 78], [106, 86]];
    let s = `<path d="M60 64 L60 104" fill="none" stroke-width="3"/>` +
        `<path d="M46 72 L56 100 M74 72 L64 100" fill="none" stroke-width="1.8" stroke-opacity="0.7"/>`;
    for (let i = 0; i < 6; i++) {
        const [ax, ay] = lead[i];
        const [bx, by] = lead[i + 1];
        const [cx, cy] = trail[i + 1];
        const [dx, dy] = trail[i];
        const mx = (cx + dx) / 2;
        const my = (cy + dy) / 2 + 6;
        const col = (i < 3 ? i : 5 - i) % 2 ? c2 : c1;
        s += `<path d="M${ax} ${ay} L${bx} ${by} L${cx} ${cy} Q${mx} ${my} ${dx} ${dy} Z" fill="${col}" stroke-width="2.5"/>`;
    }
    // Armature : bord d'attaque + épine + reflet
    s += `<path d="M6 74 L60 30 L114 74" fill="none" stroke="${frame}" stroke-width="6"/>` +
        `<path d="M60 30 V62" fill="none" stroke="${frame}" stroke-width="5"/>` +
        shine('M20 66 L58 36', 2.5, 0.5) +
        `<circle cx="6" cy="74" r="4" fill="${frame}"/><circle cx="114" cy="74" r="4" fill="${frame}"/>` +
        `<circle cx="60" cy="30" r="4.5" fill="${frame}"/>` +
        // Petit personnage suspendu dessous
        `<circle cx="60" cy="100" r="8" fill="#f2c29b"/>` +
        `<path d="M53 97 Q60 90 67 97 Z" fill="#3b2415" stroke-width="2.5"/>`;
    return svg(s, 'item-glider');
}

/* ===================== EMOTES ===================== */

const EMOTE_ICON = {
    // Main qui salue + traits de mouvement
    wave: () =>
        `<path d="M44 84 Q34 66 40 54 Q44 50 48 56 L50 62 L48 36 Q48 30 54 30 Q59 30 59 36 L60 56 L60 30 Q60 24 66 24 Q72 24 72 30 L72 56 L74 36 Q74 30 80 31 Q85 32 84 38 L82 70 Q80 92 62 94 Q50 94 44 84 Z" fill="#f2c29b"/>` +
        shine('M52 40 L52 56') +
        `<path d="M26 40 Q22 30 28 22 M92 30 Q98 38 96 48" fill="none" stroke="#fff" stroke-width="4"/>`,
    // Pouce levé
    thumb: () =>
        `<path d="M40 60 H56 L62 30 Q64 22 72 24 Q78 26 76 36 L72 56 H86 Q94 56 92 66 L88 88 Q86 96 78 96 H40 Z" fill="#f2c29b"/>` +
        `<rect x="26" y="56" width="16" height="42" rx="4" fill="#3a8dff"/>` +
        shine('M64 34 L62 46') +
        `<path d="M74 70 H90 M74 82 H86" fill="none" stroke-width="3" stroke-opacity="0.5"/>`,
    // Tête de robot
    robot: () =>
        `<path d="M60 22 V32" fill="none"/><circle cx="60" cy="20" r="5" fill="#ff5470"/>` +
        `<rect x="30" y="32" width="60" height="50" rx="10" fill="#b9c3d4"/>` +
        `<rect x="38" y="42" width="44" height="22" rx="6" fill="#0e1a3a"/>` +
        `<circle cx="50" cy="53" r="5" fill="#4fd8ff" stroke="none"/><circle cx="70" cy="53" r="5" fill="#4fd8ff" stroke="none"/>` +
        `<rect x="46" y="70" width="28" height="6" rx="2" fill="#6b7a8e"/>` +
        `<rect x="22" y="48" width="8" height="18" rx="3" fill="#6b7a8e"/><rect x="90" y="48" width="8" height="18" rx="3" fill="#6b7a8e"/>` +
        `<path d="M36 90 L28 100 M84 90 L92 100" fill="none" stroke="#fff" stroke-width="4"/>` +
        shine('M36 40 H48'),
    // Bras musclé
    flex: () =>
        `<path d="M26 96 Q24 70 42 62 L50 40 Q52 30 62 30 Q72 32 70 42 L64 60 Q84 56 92 72 Q98 90 80 98 Z" fill="#f2c29b"/>` +
        `<path d="M58 36 Q66 32 68 40" fill="none" stroke-width="3"/>` +
        shine('M70 66 Q82 66 86 76') +
        `<path d="M80 30 L86 22 M92 42 L100 38 M88 34 L96 28" fill="none" stroke="#fff" stroke-width="4"/>`,
    // Couronne dorée + étincelles
    crown: () =>
        `<path d="M28 84 L24 42 L44 60 L60 32 L76 60 L96 42 L92 84 Z" fill="#ffd24a"/>` +
        `<path d="M76 60 L96 42 L92 84 H78 Z" fill="#e0a51c" stroke="none" opacity="0.7"/>` +
        `<path d="M28 84 L24 42 L44 60 L60 32 L76 60 L96 42 L92 84 Z" fill="none"/>` +
        `<rect x="26" y="82" width="68" height="12" rx="4" fill="#e0a51c"/>` +
        `<circle cx="60" cy="66" r="7" fill="#ff5ad6"/><circle cx="40" cy="72" r="5" fill="#3a8dff"/><circle cx="80" cy="72" r="5" fill="#3fbf4a"/>` +
        `<circle cx="24" cy="42" r="4" fill="#ffd24a"/><circle cx="60" cy="32" r="4" fill="#ffd24a"/><circle cx="96" cy="42" r="4" fill="#ffd24a"/>` +
        shine('M34 76 L32 56') +
        `<path d="M98 24 V32 M94 28 H102 M20 22 V28 M17 25 H23" fill="none" stroke="#fff" stroke-width="3"/>`,
    // Bulle « GG »
    gg: () =>
        `<path d="M22 30 H98 Q106 30 106 38 V74 Q106 82 98 82 H56 L40 98 L42 82 H22 Q14 82 14 74 V38 Q14 30 22 30 Z" fill="#fff"/>` +
        `<path d="M50 44 H36 Q30 44 30 50 V62 Q30 68 36 68 H50 V56 H42" fill="none" stroke="#3a8dff" stroke-width="7"/>` +
        `<path d="M84 44 H70 Q64 44 64 50 V62 Q64 68 70 68 H84 V56 H76" fill="none" stroke="#3a8dff" stroke-width="7"/>` +
        shine('M24 40 H40', 3, 0.35),
    // Pluie de Pixies : pièces roses marquées d'un « P »
    rain: () => {
        const coin = (x, y, r) => {
            const t = r * 0.45;
            return `<circle cx="${x}" cy="${y}" r="${r}" fill="#ff7fd8"/>` +
                `<path d="M${x - t * 0.6} ${y + t} V${y - t} H${x + t * 0.2} A${t * 0.55} ${t * 0.55} 0 0 1 ${x + t * 0.2} ${y + t * 0.1} H${x - t * 0.6}" fill="none" stroke-width="3"/>`;
        };
        return coin(40, 38, 13) + coin(78, 30, 11) + coin(62, 66, 15) + coin(32, 82, 10) + coin(88, 76, 12) +
            `<path d="M40 16 V22 M78 12 V16 M98 50 V56" fill="none" stroke="#fff" stroke-width="3"/>`;
    }
};

function emote(it) {
    const c = it.color || '#ffe03d';
    const body =
        `<circle cx="60" cy="60" r="54" fill="${shade(c, -0.35)}"/>` +
        `<circle cx="60" cy="60" r="46" fill="${c}" stroke="none" opacity="0.35"/>` +
        (EMOTE_ICON[it.icon] || EMOTE_ICON.wave)();
    return svg(body, 'item-emote');
}

/* ===================== API ===================== */

export function itemArt(it) {
    if (!it) return '';
    if (it.type === 'backpack') return backpack(it);
    if (it.type === 'glider') return glider(it);
    if (it.type === 'emote') return emote(it);
    return '';
}
