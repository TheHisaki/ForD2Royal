/* ==================================
   ICÔNES DU LOBBY - FOR2D ROYAL
   Même système que le HUD de jeu (js/game/hud-icons.js) : SVG inline posés
   dans les emplacements [data-icon] de index.html. Ajoute les pictos propres
   au lobby (passe, chat, maison, lien, groupe, île, bus) et réutilise ceux du
   HUD (son, engrenage, croix).
   lobby.js (script classique) change une icône avec window.FOR2D_ICONS.set / mount.
   ================================== */

import { mountHudIcons, setHudIcon, registerHudIcons, ICON_KIT, ICON_COLORS as C } from './game/hud-icons.js';

const { thick, shine, gloss, bust, starPath } = ICON_KIT;

registerHudIcons({
    // Passe de combat : ticket jaune avec une étoile
    ticket: () =>
        '<g transform="rotate(-12 12 12)">' +
        `<path d="M3 7.5 A1.5 1.5 0 0 1 4.5 6 H19.5 A1.5 1.5 0 0 1 21 7.5 V10 A2 2 0 0 0 21 14 V16.5 A1.5 1.5 0 0 1 19.5 18 H4.5 A1.5 1.5 0 0 1 3 16.5 V14 A2 2 0 0 0 3 10 Z" fill="${C.yellow}"/>` +
        gloss('<rect x="5" y="7.4" width="9" height="1.3" rx="0.65"/>', 0.6) +
        `<path d="M4.6 16.6 H19.4" fill="none" stroke="${C.yellowDark}" stroke-width="1.2"/>` +
        '<path d="M15.6 7.8 V16.2" fill="none" stroke-width="1.2" stroke-dasharray="1.4 1.8"/>' +
        `<path d="${starPath(9.4, 12.2, 3.6, 1.6)}" fill="${C.red}" stroke-width="1.3"/>` +
        '</g>',

    // Chat : bulle bleue avec 3 points
    chat: () =>
        `<path d="M4 5.6 A2 2 0 0 1 6 3.6 H18 A2 2 0 0 1 20 5.6 V14 A2 2 0 0 1 18 16 H10.4 L5.6 20.2 V16 H6 A2 2 0 0 1 4 14 Z" fill="${C.blue}"/>` +
        shine('M6.4 6 H12', 1.3, 0.55) +
        '<circle cx="8.4" cy="10" r="1.4" fill="#fff" stroke="none"/>' +
        '<circle cx="12" cy="10" r="1.4" fill="#fff" stroke="none"/>' +
        '<circle cx="15.6" cy="10" r="1.4" fill="#fff" stroke="none"/>',

    // Créer une salle : maison
    home: () =>
        `<rect x="15.2" y="4.6" width="2.6" height="5" fill="${C.stone}" stroke-width="1.6"/>` +
        '<rect x="5.4" y="10.4" width="13.2" height="10.2" rx="1" fill="#ffe9a8"/>' +
        `<rect x="10" y="14.4" width="4" height="6.2" rx="0.8" fill="${C.blue}" stroke-width="1.6"/>` +
        '<circle cx="13" cy="17.6" r="0.5" fill="#fff" stroke="none"/>' +
        `<path d="M2.6 12.2 L12 3.8 L21.4 12.2 Z" fill="${C.red}"/>` +
        shine('M6.4 10.4 L12 5.6', 1.3, 0.6),

    // Rejoindre : 2 maillons de chaîne
    link: () => {
        const ring = (x) => `<rect x="${x}" y="8.8" width="11" height="6.4" rx="3.2" fill="none"`;
        return '<g transform="rotate(-45 12 12)">' +
            `${ring(2.6)} stroke-width="4.8"/>${ring(10.4)} stroke-width="4.8"/>` +
            `${ring(2.6)} stroke="${C.cyan}" stroke-width="2.4"/>${ring(10.4)} stroke="${C.cyan}" stroke-width="2.4"/>` +
            shine('M5.6 9.9 H9.6', 0.9, 0.8) + shine('M13.4 9.9 H17.4', 0.9, 0.8) +
            '</g>';
    },

    // Groupe : 2 bustes
    group: () =>
        bust(C.red, C.skin, 'translate(6.9 4.66) scale(0.78)') +
        bust(C.blue, C.skin, 'translate(-2.24 2.97) scale(0.86)'),

    // Mode de jeu : île avec un palmier
    island: () =>
        `<ellipse cx="12" cy="19.4" rx="10.8" ry="3.8" fill="${C.cyan}"/>` +
        shine('M3.8 20.2 Q5.2 19.4 6.6 20.2', 1.1, 0.8) +
        shine('M17.4 21.6 Q18.8 20.8 20.2 21.6', 1.1, 0.8) +
        '<path d="M3.4 19.2 Q12 9.4 20.6 19.2 Z" fill="#ffd88a"/>' +
        gloss('<path d="M7 16.4 Q9.6 14 12.4 13.8 Q9.8 15.2 8.4 17 Z"/>', 0.6) +
        thick('M11.4 17 Q10 11 13 6.2', C.wood, 2.2) +
        `<path d="M13 6 C9.6 2.6 4.6 3 2.4 7.8 C5.6 7.4 9.4 8.2 13 6 Z" fill="${C.green}" stroke-width="1.4"/>` +
        `<path d="M13 6 C16 2.4 20.6 2.8 22 7 C19 6.4 16 7.6 13 6 Z" fill="${C.green}" stroke-width="1.4"/>` +
        `<path d="M13 6 C9.4 5.4 5.6 8 5.2 12.4 C8.6 11.4 11 9.4 13 6 Z" fill="#35b845" stroke-width="1.4"/>` +
        `<path d="M13 6 C16.8 5.6 19.8 8.4 19.8 12.4 C16.8 11 14.6 9.2 13 6 Z" fill="#35b845" stroke-width="1.4"/>` +
        shine('M5.4 5.6 Q8.4 3.8 11.2 5.2', 1, 0.65) +
        shine('M15.4 4.4 Q18 3.6 20 5.2', 1, 0.65) +
        `<circle cx="12.2" cy="7.2" r="1.2" fill="${C.woodDark}" stroke-width="1"/>` +
        `<circle cx="14.2" cy="7.4" r="1.2" fill="${C.woodDark}" stroke-width="1"/>`,

    // Décor : le bus de combat sous son ballon
    bus: () =>
        '<path d="M8.2 8.6 L5.4 11.8 M15.8 8.6 L18.6 11.8" fill="none" stroke-width="1.1"/>' +
        `<ellipse cx="12" cy="5.4" rx="5" ry="4.4" fill="${C.red}"/>` +
        `<path d="M12 1 Q9.4 5.4 12 9.8 Q14.6 5.4 12 1 Z" fill="${C.yellow}" stroke-width="1.2"/>` +
        gloss('<ellipse cx="9.2" cy="3.8" rx="1.3" ry="0.8" transform="rotate(-30 9.2 3.8)"/>', 0.7) +
        `<rect x="1.6" y="11.6" width="20.8" height="7.8" rx="2" fill="${C.blue}"/>` +
        gloss('<rect x="3.2" y="12.5" width="17.6" height="1.1" rx="0.55"/>', 0.45) +
        '<rect x="3.4" y="14.2" width="3.6" height="2.6" rx="0.6" fill="#bfeaff" stroke-width="1.2"/>' +
        '<rect x="7.9" y="14.2" width="3.6" height="2.6" rx="0.6" fill="#bfeaff" stroke-width="1.2"/>' +
        '<rect x="12.4" y="14.2" width="3.6" height="2.6" rx="0.6" fill="#bfeaff" stroke-width="1.2"/>' +
        '<rect x="17" y="14.2" width="3.8" height="2.6" rx="0.6" fill="#e8f8ff" stroke-width="1.2"/>' +
        '<circle cx="6.2" cy="19.8" r="2.2" fill="#232834"/>' +
        '<circle cx="17.6" cy="19.8" r="2.2" fill="#232834"/>' +
        `<circle cx="6.2" cy="19.8" r="0.8" fill="${C.metal}" stroke="none"/>` +
        `<circle cx="17.6" cy="19.8" r="0.8" fill="${C.metal}" stroke="none"/>`
});

// Remplit (ou rafraîchit) les emplacements [data-icon] sous root
export function mountLobbyIcons(root = document) {
    return mountHudIcons(root);
}

if (typeof window !== 'undefined') {
    // Accès pour lobby.js, qui n'est pas un module
    window.FOR2D_ICONS = { mount: mountHudIcons, set: setHudIcon };
}
if (typeof document !== 'undefined') mountLobbyIcons();
