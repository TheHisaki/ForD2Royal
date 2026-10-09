/* ==================================
   DESSINS DES OBJETS DU CASIER - FOR2D ROYAL
   Sacs à dos, planeurs et emotes en SVG (viewBox 120 x 120), style cartoon :
   contour sombre épais, reflets, couleurs du catalogue (js/cosmetics.js).
   Les tenues sont dessinées par js/lobby-skin.js.
   ================================== */

import { pickaxeUrl } from './pickaxe-art.js';
import { GLIDER_ART, gliderUrl } from './glider-art.js';

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
    const c = it.color || '#2b7fc1';
    const d = shade(c, -0.3);
    const a = it.accent || '#8eeaff';
    const strap = shade(c, -0.5);
    let s = '';

    // Les cinq sacs principaux ont cinq silhouettes différentes : carapace, ailes,
    // cape, queue et pack technologique. Les objets du passe gardent leurs motifs.
    if (it.motif === 'shell') {
        // Blue Crab Shell : carapace ronde, anneaux segmentés et petites pattes latérales
        s += `<path d="M39 32 Q27 52 32 88 M81 32 Q93 52 88 88" fill="none" stroke="${strap}" stroke-width="11"/>` +
            `<ellipse cx="60" cy="62" rx="35" ry="43" fill="${d}"/>` +
            `<ellipse cx="60" cy="58" rx="30" ry="38" fill="${c}"/>` +
            `<path d="M60 21 V96 M31 57 H89 M38 35 Q60 47 82 35 M38 81 Q60 69 82 81" fill="none" stroke="${a}" stroke-width="3" opacity="0.8"/>` +
            `<path d="M32 47 Q19 42 18 53 Q19 61 31 58 M88 47 Q101 42 102 53 Q101 61 89 58" fill="${c}"/>` +
            `<circle cx="60" cy="58" r="8" fill="${a}"/>` +
            `<circle cx="57" cy="55" r="2.5" fill="#fff" stroke="none"/>` +
            shine('M43 39 Q50 28 62 26', 3, 0.7);
    } else if (it.motif === 'wings') {
        // Blue Fairy Wings : deux ailes séparées et un petit noyau de sac
        s += `<path d="M43 38 Q31 52 34 91 M77 38 Q89 52 86 91" fill="none" stroke="${strap}" stroke-width="9"/>` +
            `<path d="M55 58 Q38 30 22 38 Q10 46 24 65 Q33 76 55 75 Z" fill="${c}"/>` +
            `<path d="M65 58 Q82 30 98 38 Q110 46 96 65 Q87 76 65 75 Z" fill="${c}"/>` +
            `<path d="M55 64 Q39 57 25 48 M55 70 Q39 69 29 62 M65 64 Q81 57 95 48 M65 70 Q81 69 91 62" fill="none" stroke="${a}" stroke-width="3"/>` +
            `<path d="M50 56 Q60 48 70 56 L68 86 Q60 96 52 86 Z" fill="${d}"/>` +
            `<ellipse cx="60" cy="68" rx="7" ry="12" fill="${a}"/>` +
            `<circle cx="57" cy="64" r="2" fill="#fff" stroke="none"/>` +
            shine('M24 43 Q36 38 48 53', 2.5, 0.65);
    } else if (it.motif === 'cape') {
        // Blue Falcon Cape : plumes en éventail, fermoir et ailettes de faucon
        s += `<path d="M42 31 Q34 57 39 87 M78 31 Q86 57 81 87" fill="none" stroke="${strap}" stroke-width="10"/>` +
            `<path d="M47 31 Q60 22 73 31 L91 83 Q78 101 60 106 Q42 101 29 83 Z" fill="${c}"/>` +
            `<path d="M47 34 Q39 57 43 86 Q51 98 60 101 V29 Z" fill="${a}" opacity="0.72" stroke="none"/>` +
            `<path d="M73 34 Q81 57 77 86 Q69 98 60 101 V29 Z" fill="${d}" opacity="0.72" stroke="none"/>` +
            `<path d="M33 74 Q21 64 18 50 Q32 51 45 63 M87 74 Q99 64 102 50 Q88 51 75 63" fill="${a}"/>` +
            `<path d="M60 25 L66 42 L60 52 L54 42 Z" fill="${a}"/>` +
            `<circle cx="60" cy="44" r="7" fill="#ffe03d"/>` +
            `<path d="M57 41 L63 41 L60 47 Z" fill="#1d3d72" stroke="none"/>` +
            shine('M45 42 Q48 34 55 31', 3, 0.65);
    } else if (it.motif === 'fishtail') {
        // Blue Fish Tail : corps central fin et deux nageoires qui sortent du sac
        s += `<path d="M42 35 Q30 57 36 88 M78 35 Q90 57 84 88" fill="none" stroke="${strap}" stroke-width="10"/>` +
            `<path d="M44 40 Q60 29 76 40 L78 83 Q60 99 42 83 Z" fill="${c}"/>` +
            `<path d="M46 49 Q60 58 74 49 M45 61 Q60 70 75 61 M44 73 Q60 82 76 73" fill="none" stroke="${a}" stroke-width="3"/>` +
            `<path d="M45 75 Q25 83 15 101 Q38 102 59 87 Z" fill="${a}"/>` +
            `<path d="M75 75 Q95 83 105 101 Q82 102 61 87 Z" fill="${a}"/>` +
            `<path d="M60 37 V89" fill="none" stroke="${d}" stroke-width="4"/>` +
            `<circle cx="60" cy="45" r="6" fill="#d9fbff"/>` +
            `<circle cx="59" cy="44" r="2" fill="#1d3d72" stroke="none"/>` +
            shine('M49 45 Q56 37 64 36', 2.5, 0.7);
    } else if (it.motif === 'tech') {
        // Blue Pack : sac compact, coque rigide, écran cyan et modules latéraux
        s += `<path d="M40 28 Q29 51 33 93 M80 28 Q91 51 87 93" fill="none" stroke="${strap}" stroke-width="10"/>` +
            `<path d="M41 29 Q60 18 79 29 L87 88 Q84 103 60 105 Q36 103 33 88 Z" fill="${d}"/>` +
            `<path d="M45 32 Q60 24 75 32 L81 84 Q78 96 60 98 Q42 96 39 84 Z" fill="${c}"/>` +
            `<path d="M43 48 H77 M42 77 H78" fill="none" stroke="${a}" stroke-width="4"/>` +
            `<rect x="49" y="53" width="22" height="17" rx="4" fill="#08264d"/>` +
            `<path d="M54 61 H66 M60 56 V66" fill="none" stroke="${a}" stroke-width="2"/>` +
            `<rect x="28" y="51" width="12" height="25" rx="4" fill="${a}"/>` +
            `<rect x="80" y="51" width="12" height="25" rx="4" fill="${a}"/>` +
            `<circle cx="34" cy="57" r="2" fill="#fff" stroke="none"/><circle cx="86" cy="57" r="2" fill="#fff" stroke="none"/>` +
            `<path d="M60 24 V13 M55 16 H65" fill="none" stroke="${a}" stroke-width="3"/>` +
            shine('M47 37 Q55 29 65 29', 3, 0.65);
    } else if (it.motif === 'bedroll') {
        // Sac de Rando : sac à poche, duvet roulé sur le dessus tenu par 2 sangles
        s += `<path d="M40 42 Q29 62 33 96 M80 42 Q91 62 87 96" fill="none" stroke="${strap}" stroke-width="10"/>` +
            `<rect x="30" y="38" width="60" height="66" rx="16" fill="${c}"/>` +
            `<path d="M74 40 Q90 42 90 56 V90 Q90 104 76 104 Z" fill="${d}" stroke="none" opacity="0.6"/>` +
            `<rect x="30" y="38" width="60" height="66" rx="16" fill="none"/>` +
            `<rect x="42" y="64" width="36" height="28" rx="7" fill="${d}"/>` +
            `<path d="M42 72 H78" fill="none" stroke="${shade(c, 0.25)}" stroke-width="3"/>` +
            `<rect x="56" y="68" width="8" height="8" rx="2" fill="${a}" stroke-width="2"/>` +
            `<rect x="16" y="14" width="88" height="30" rx="15" fill="${a}"/>` +
            `<path d="M26 22 Q60 18 94 22" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="3"/>` +
            `<circle cx="31" cy="29" r="9" fill="${shade(a, 0.25)}" stroke-width="3"/>` +
            `<path d="M31 29 m-4 0 a4 4 0 1 1 4 4" fill="none" stroke-width="2.5"/>` +
            `<path d="M46 12 V46 M74 12 V46" fill="none" stroke="${strap}" stroke-width="6"/>` +
            shine('M37 54 Q39 46 47 44');
    } else if (it.motif === 'surfboard') {
        // Planche de Surf : planche en pointe, bandes colorées, latte centrale et leash
        s += `<path d="M40 40 Q30 62 34 92 M80 40 Q90 62 86 92" fill="none" stroke="${strap}" stroke-width="10"/>` +
            `<path d="M60 112 Q80 120 94 104 Q102 94 95 86" fill="none" stroke="${O}" stroke-width="7"/>` +
            `<path d="M60 112 Q80 120 94 104 Q102 94 95 86" fill="none" stroke="${a}" stroke-width="3"/>` +
            `<path d="M60 6 Q88 30 86 78 Q84 108 60 114 Q36 108 34 78 Q32 30 60 6 Z" fill="${c}"/>` +
            `<path d="M36 58 H84 V68 H36 Z M36 74 H84 V78 H36 Z" fill="${a}" stroke="none"/>` +
            `<path d="M60 10 V110" fill="none" stroke="${d}" stroke-width="2.5"/>` +
            `<path d="M60 6 Q88 30 86 78 Q84 108 60 114 Q36 108 34 78 Q32 30 60 6 Z" fill="none"/>` +
            `<circle cx="60" cy="38" r="8" fill="#fff" stroke-width="3"/>` +
            `<circle cx="60" cy="38" r="4" fill="${a}" stroke="none"/>` +
            shine('M44 36 Q48 20 58 13', 3, 0.6);
    } else if (it.motif === 'barrel') {
        // Tonneau du Fjord : douelles de bois, 2 cercles de fer, couvercle et bonde
        s += `<path d="M40 30 Q28 60 32 96 M80 30 Q92 60 88 96" fill="none" stroke="${strap}" stroke-width="10"/>` +
            `<path d="M34 22 Q24 64 34 106 H86 Q96 64 86 22 Z" fill="${c}"/>` +
            `<path d="M86 22 Q96 64 86 106 H74 Q82 64 74 22 Z" fill="${d}" stroke="none" opacity="0.55"/>` +
            `<path d="M48 23 Q42 64 48 105 M60 22 V106 M72 23 Q78 64 72 105" fill="none" stroke="${d}" stroke-width="2.5"/>` +
            `<path d="M34 22 Q24 64 34 106 H86 Q96 64 86 22 Z" fill="none"/>` +
            `<path d="M31 40 Q60 47 89 40 M31 88 Q60 95 89 88" fill="none" stroke="${O}" stroke-width="10"/>` +
            `<path d="M31 40 Q60 47 89 40 M31 88 Q60 95 89 88" fill="none" stroke="${a}" stroke-width="5"/>` +
            `<ellipse cx="60" cy="22" rx="26" ry="7" fill="${shade(c, 0.2)}"/>` +
            `<circle cx="60" cy="66" r="6" fill="#5a3a1a"/>` +
            shine('M38 52 Q36 64 38 78', 3, 0.5);
    } else if (it.motif === 'jack') {
        // Lanterne Citrouille : citrouille à côtes, visage sculpté lumineux, tige et feuille
        s += `<circle cx="60" cy="66" r="52" fill="${a}" opacity="0.18" stroke="none"/>` +
            `<path d="M42 34 Q30 60 34 96 M78 34 Q90 60 86 96" fill="none" stroke="${strap}" stroke-width="9"/>` +
            `<ellipse cx="38" cy="68" rx="22" ry="34" fill="${c}"/>` +
            `<ellipse cx="82" cy="68" rx="22" ry="34" fill="${c}"/>` +
            `<ellipse cx="60" cy="68" rx="24" ry="38" fill="${shade(c, 0.12)}"/>` +
            `<path d="M56 32 Q54 18 62 10 L69 15 Q62 22 64 32 Z" fill="#3fbf4a"/>` +
            `<path d="M65 22 Q78 8 92 16 Q80 28 65 22 Z" fill="#3fbf4a" stroke-width="3"/>` +
            `<path d="M38 58 L52 50 L50 66 Z M82 58 L68 50 L70 66 Z" fill="${a}" stroke-width="3"/>` +
            `<path d="M60 66 L65 74 H55 Z" fill="${a}" stroke-width="2.5"/>` +
            `<path d="M36 80 L45 84 L52 79 L60 86 L68 79 L75 84 L84 80 Q76 100 60 100 Q44 100 36 80 Z" fill="${a}" stroke-width="3"/>` +
            shine('M24 56 Q26 44 34 38', 3, 0.5);
    } else if (it.motif === 'egg') {
        // Œuf de Dragon : coque à écailles, fissures de braise, harnais en cuir, étincelles
        s += `<circle cx="60" cy="64" r="52" fill="${a}" opacity="0.16" stroke="none"/>` +
            `<path d="M40 34 Q28 60 32 96 M80 34 Q92 60 88 96" fill="none" stroke="${strap}" stroke-width="9"/>` +
            `<path d="M60 12 Q92 14 94 66 Q94 106 60 108 Q26 106 26 66 Q28 14 60 12 Z" fill="${c}"/>` +
            `<path d="M76 18 Q94 30 94 66 Q94 106 60 108 Q86 92 86 64 Q86 34 76 18 Z" fill="${d}" stroke="none" opacity="0.6"/>` +
            `<path d="M40 44 q6 6 12 0 q6 6 12 0 q6 6 12 0 M34 84 q6 6 12 0 q6 6 12 0 q6 6 12 0 q6 6 12 0 M42 98 q6 5 12 0 q6 5 12 0 q6 5 12 0" fill="none" stroke="${shade(c, 0.3)}" stroke-width="2.5"/>` +
            `<path d="M60 12 Q92 14 94 66 Q94 106 60 108 Q26 106 26 66 Q28 14 60 12 Z" fill="none"/>` +
            `<path d="M58 16 L52 30 L62 38 L55 50 M76 72 L86 80 L81 92" fill="none" stroke="${O}" stroke-width="7"/>` +
            `<path d="M58 16 L52 30 L62 38 L55 50 M76 72 L86 80 L81 92" fill="none" stroke="${a}" stroke-width="3.5"/>` +
            `<path d="M27 62 Q60 74 93 62" fill="none" stroke="${O}" stroke-width="10"/>` +
            `<path d="M27 62 Q60 74 93 62" fill="none" stroke="#6b4a2e" stroke-width="5"/>` +
            `<rect x="54" y="62" width="12" height="11" rx="2" fill="${a}" stroke-width="2.5"/>` +
            `<circle cx="16" cy="34" r="4" fill="${a}" stroke-width="2"/><circle cx="104" cy="42" r="3" fill="${a}" stroke-width="2"/><circle cx="102" cy="98" r="3.5" fill="${a}" stroke-width="2"/>` +
            shine('M38 34 Q44 20 56 16', 3, 0.55);
    } else {
        // Motifs conservés pour les objets du passe et les anciens profils.
        s += `<path d="M36 34 Q26 60 30 92 M84 34 Q94 60 90 92" fill="none" stroke="${strap}" stroke-width="11"/>` +
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
            const px = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [2, 4]];
            s += `<rect x="40" y="58" width="40" height="36" rx="6" fill="${d}"/>` +
                px.map(([x, y]) => `<rect x="${45 + x * 6}" y="${62 + y * 6}" width="6" height="6" fill="${a}" stroke="none"/>`).join('');
        } else if (it.motif === 'lantern') {
            s += `<rect x="46" y="54" width="28" height="40" rx="5" fill="#1a0a30"/>` +
                `<path d="M60 62 Q70 76 60 88 Q50 76 60 62 Z" fill="${a}" stroke-width="2.5"/>` +
                `<path d="M46 66 H74 M46 82 H74 M60 54 V58" fill="none" stroke="${shade(a, 0.2)}" stroke-width="2.5"/>`;
        }
    }
    return svg(s, 'item-backpack');
}

/* ===================== PLANEURS ===================== */

function glider(it) {
    // Planeur à forme (soucoupe, dragon, feuille...) : même dessin qu'en jeu, en image
    if (it.style && GLIDER_ART[it.style]) {
        const url = gliderUrl(it.style, it.colors, 240, 0.9);
        return svg(url ? `<image href="${url}" x="0" y="0" width="120" height="120" stroke="none"/>` : '', 'item-glider');
    }
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

// Même dessin qu'en partie (main et hotbar) : js/pickaxe-art.js, rendu en image nette
function pickaxe(it) {
    const url = pickaxeUrl(it.id || it.motif, 240, 0.9);
    const img = url ? `<image href="${url}" x="0" y="0" width="120" height="120" stroke="none"/>` : '';
    return svg(img, 'item-pickaxe');
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
