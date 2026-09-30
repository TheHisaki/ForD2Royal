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

/* ===================== PIOCHES ===================== */

function pickaxe(it) {
    const motif = it.motif || 'classic';
    let s = '';

    if (motif === 'laser') {
        // Faux Néon : manche cyberpunk sombre + longue lame courbée néon cyan & magenta
        s +=
            // Manche tech sombre
            `<path d="M24 96 L74 46" fill="none" stroke="#121324" stroke-width="8"/>` +
            `<path d="M24 96 L74 46" fill="none" stroke="#252a48" stroke-width="4"/>` +
            // Anneaux néon sur le manche
            `<path d="M38 82 L42 86 M52 68 L56 72" fill="none" stroke="#00e5ff" stroke-width="3"/>` +
            // Émetteur / Tête tech
            `<rect x="68" y="38" width="14" height="14" rx="3" fill="#ff007f" transform="rotate(45 75 45)"/>` +
            `<circle cx="75" cy="45" r="4" fill="#00e5ff"/>` +
            // Lame de faux énergétique cyan lumineuse
            `<path d="M72 42 Q86 16 108 20 Q92 38 78 52 Z" fill="#00e5ff"/>` +
            `<path d="M74 40 Q84 20 102 22 Q90 36 80 48 Z" fill="#e0ffff" stroke="none"/>` +
            // Contre-pointe énergétique
            `<path d="M68 48 Q54 58 48 52 Q60 42 70 44 Z" fill="#ff007f"/>` +
            shine('M78 36 Q88 22 102 22', 2.5, 0.7) +
            // Étincelles
            `<circle cx="106" cy="18" r="2.5" fill="#fff" stroke="none"/>` +
            `<circle cx="46" cy="52" r="2" fill="#00e5ff" stroke="none"/>`;
    } else if (motif === 'royal') {
        // Hache du Lion : manche velours pourpre, double hache dorée ouvragée, rubis flamboyant
        s +=
            // Manche orné pourpre
            `<path d="M22 98 L76 44" fill="none" stroke="#3b0f44" stroke-width="8"/>` +
            `<path d="M22 98 L76 44" fill="none" stroke="#6b2180" stroke-width="4"/>` +
            // Anneaux or sur manche et pommeau
            `<circle cx="20" cy="100" r="5" fill="#ffd24a"/>` +
            `<path d="M36 84 L40 88 M54 66 L58 70" fill="none" stroke="#ffd24a" stroke-width="3"/>` +
            // Lame avant dorée large et incurvée
            `<path d="M74 42 Q92 24 106 32 Q96 52 82 50 Z" fill="#ffd24a"/>` +
            `<path d="M77 44 Q90 30 100 36 Q93 48 83 47 Z" fill="#ffeaa7" stroke="none"/>` +
            // Lame arrière en pic royal
            `<path d="M70 46 Q56 36 48 44 Q60 56 72 52 Z" fill="#ffd24a"/>` +
            // Bague centrale sertie
            `<rect x="68" y="38" width="14" height="14" rx="3" fill="#ffd24a" transform="rotate(45 75 45)"/>` +
            // Rubis étincelant au cœur
            `<rect x="71" y="41" width="8" height="8" rx="2" fill="#e82845" transform="rotate(45 75 45)"/>` +
            `<circle cx="75" cy="45" r="1.5" fill="#fff" stroke="none"/>` +
            shine('M78 38 Q90 28 100 34', 2.5, 0.6);
    } else if (motif === 'cosmic') {
        // Sonde Stellaire : manche aérospatial blanc et gris, réacteur orbital orange, pointeur frontal
        s +=
            // Manche céramique spatial
            `<path d="M24 96 L74 46" fill="none" stroke="#64748b" stroke-width="8"/>` +
            `<path d="M24 96 L74 46" fill="none" stroke="#f8fafc" stroke-width="5"/>` +
            // Bandes techniques bleu ciel
            `<path d="M38 82 L42 86 M52 68 L56 72" fill="none" stroke="#38bdf8" stroke-width="3.5"/>` +
            // Module orbital / buse arrière réacteur
            `<path d="M68 52 L54 62 L60 68 L74 58 Z" fill="#ff7700"/>` +
            // Flamme de propulsion ionique
            `<path d="M54 62 Q42 72 38 78 Q50 68 60 68 Z" fill="#ffb703" stroke="none"/>` +
            // Tête de sonde / pointeur d'astéroïde
            `<path d="M70 42 L94 18 L104 28 L80 52 Z" fill="#e2e8f0"/>` +
            `<path d="M94 18 L108 22 L104 28 Z" fill="#38bdf8"/>` +
            // Pointeur laser frontal orange
            `<path d="M102 24 L114 16" fill="none" stroke="#ff7700" stroke-width="4"/>` +
            `<circle cx="114" cy="16" r="2" fill="#fff" stroke="none"/>` +
            // Noyau énergie orbital
            `<circle cx="82" cy="38" r="4.5" fill="#38bdf8"/>` +
            shine('M76 44 L92 24', 2.5, 0.7);
    } else if (motif === 'void') {
        // Faux du Néant : manche os sombre corrompu, lame de faux en cristal violet déchiqueté
        s +=
            // Manche en os sombre torturé
            `<path d="M22 98 Q46 74 74 46" fill="none" stroke="#180e29" stroke-width="8"/>` +
            `<path d="M22 98 Q46 74 74 46" fill="none" stroke="#3b1d5c" stroke-width="4"/>` +
            // Nœuds d'os et pointes
            `<path d="M36 86 L32 92 M52 70 L48 76" fill="none" stroke="#b04cff" stroke-width="3"/>` +
            // Tête de faux en cristal déchiqueté
            `<path d="M70 46 Q84 14 108 14 Q94 36 78 52 L82 42 Z" fill="#b04cff"/>` +
            `<path d="M72 44 Q84 20 102 20 Q92 34 80 46 Z" fill="#df70ff" stroke="none"/>` +
            // Pointes secondaires de cristal corrompu
            `<path d="M84 40 L96 46 L86 48 Z" fill="#801dbf"/>` +
            `<path d="M68 48 Q54 44 46 36 Q60 54 72 54 Z" fill="#801dbf"/>` +
            // Œil / Cœur de corruption
            `<circle cx="74" cy="46" r="4" fill="#180e29"/>` +
            `<circle cx="74" cy="46" r="2" fill="#df70ff" stroke="none"/>` +
            shine('M76 38 Q86 22 100 20', 2.5, 0.6) +
            // Particules de fumée sombre / étincelles
            `<circle cx="108" cy="12" r="2" fill="#df70ff" stroke="none"/>` +
            `<circle cx="44" cy="34" r="1.8" fill="#b04cff" stroke="none"/>`;
    } else if (motif === 'candy') {
        // Sucre d'Orge Piquant : torsade festive rouge et blanche, crochet en pointe acérée, ruban vert
        s +=
            // Manche torsadé rouge et blanc
            `<path d="M24 96 L76 44" fill="none" stroke="#ffffff" stroke-width="9"/>` +
            // Torsades rouges
            `<path d="M26 94 L32 100 M38 82 L44 88 M50 70 L56 76 M62 58 L68 64" fill="none" stroke="#ef4444" stroke-width="4.5"/>` +
            // Crochet du sucre d'orge vers le haut et la droite, se terminant en biseau tranchant
            `<path d="M74 46 Q86 34 98 42 Q108 52 102 66 L94 62 Q98 52 92 46 Q84 40 76 48 Z" fill="#ffffff"/>` +
            `<path d="M82 40 L88 44 M94 44 L98 50 M98 56 L94 60" fill="none" stroke="#ef4444" stroke-width="3"/>` +
            // Pointe acérée biseautée
            `<path d="M102 66 L108 72 L94 62 Z" fill="#ef4444"/>` +
            // Nœud papillon festif vert menthe
            `<polygon points="68,52 60,42 62,56" fill="#10b981"/>` +
            `<polygon points="76,44 86,52 74,54" fill="#10b981"/>` +
            `<circle cx="71" cy="49" r="3.5" fill="#34d399"/>` +
            shine('M30 88 L68 50', 2, 0.5);
    } else {
        // Pioche Classique : manche en bois avec poignée sombre, tête double en acier trempé
        s +=
            // Manche en bois chaleureux
            `<path d="M22 98 L76 44" fill="none" stroke="#784920" stroke-width="8"/>` +
            `<path d="M22 98 L76 44" fill="none" stroke="#a1622b" stroke-width="4.5"/>` +
            // Poignée en cuir foncé
            `<path d="M22 98 L40 80" fill="none" stroke="#452712" stroke-width="8.5"/>` +
            `<path d="M26 94 L29 97 M32 88 L35 91 M38 82 L41 85" fill="none" stroke="#784920" stroke-width="2"/>` +
            // Collerette en métal
            `<rect x="68" y="38" width="12" height="12" rx="2" fill="#64748b" transform="rotate(45 74 44)"/>` +
            // Tête de pioche incurvée en croissant d'acier
            `<path d="M50 32 Q74 38 98 22 Q92 42 78 52 Q66 44 50 32 Z" fill="#94a3b8"/>` +
            `<path d="M52 34 Q74 40 94 26 Q88 40 78 48 Q68 42 52 34 Z" fill="#cbd5e1" stroke="none"/>` +
            // Contre-pointe
            `<path d="M50 32 L44 38 L54 44 Z" fill="#64748b"/>` +
            // Pointe acérée avant
            `<path d="M98 22 L106 20 L96 28 Z" fill="#e2e8f0"/>` +
            shine('M60 38 Q74 42 90 28', 2.5, 0.7);
    }

    return svg(s, 'item-pickaxe');
}

/* ===================== API ===================== */

export function itemArt(it) {
    if (!it) return '';
    if (it.type === 'backpack') return backpack(it);
    if (it.type === 'glider') return glider(it);
    if (it.type === 'emote') return emote(it);
    if (it.type === 'pickaxe') return pickaxe(it);
    return '';
}
