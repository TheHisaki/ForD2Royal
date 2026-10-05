/* ==================================
   ICÔNES DES ARMES ET DES SOINS - FOR2D ROYAL
   Dessins de profil façon cartoon (contour sombre, reflets, pièces
   à la couleur de la rareté), utilisés par :
   - la hotbar et l'inventaire (image PNG en data URL),
   - le butin au sol (canvas mis en cache, dessiné avec drawImage).
   Tout est dessiné en code : pas de fichier image, pas de licence.
   ================================== */

import { WEAPONS, HEALS, THROWABLES, RARITIES } from './weapons.js';
import { shadeHex } from './utils.js';
import { pickaxeCanvas, pickaxeUrl } from '../pickaxe-art.js';

const OUTLINE = '#0a1030';
const TAU = Math.PI * 2;

// Métal (du plus sombre au plus clair), bois, kaki
const M0 = '#232834';
const M1 = '#3a4252';
const M2 = '#525c6f';
const M3 = '#7c879b';
const WOOD = '#a0673a';
const WOOD_D = '#6e4424';
const OLIVE = '#5f6e44';

/* ===================== OUTILS DE DESSIN ===================== */

function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
}

function paint(ctx, fill, lw = 3) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = lw;
    ctx.stroke();
}

function part(ctx, pts, fill, lw = 3) {
    poly(ctx, pts);
    paint(ctx, fill, lw);
}

function box(ctx, x, y, w, h, r, fill, lw = 3) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
    paint(ctx, fill, lw);
}

// Reflet clair en haut d'une pièce
function shine(ctx, x, y, w, h = 2.5, a = 0.28) {
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    ctx.fillRect(x, y, w, h);
}

// Série de traits sombres (stries, nervures)
function ridges(ctx, x0, x1, step, y0, y1, color = 'rgba(10, 16, 48, 0.55)', lw = 1.5) {
    ctx.beginPath();
    for (let x = x0; x <= x1; x += step) {
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();
}

function triggerGuard(ctx, x0, x1, y) {
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.quadraticCurveTo(x0, y + 9, (x0 + x1) / 2, y + 9);
    ctx.lineTo(x1, y + 9);
    ctx.lineTo(x1, y);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 3;
    ctx.stroke();
    // Détente
    ctx.beginPath();
    ctx.moveTo(x1 - 3, y);
    ctx.quadraticCurveTo(x1 - 6, y + 4, x1 - 4, y + 7);
    ctx.lineWidth = 2.5;
    ctx.stroke();
}

/* ===================== ARMES (profil, canon vers la droite) ===================== */

// box = [x0, y0, x1, y1] : zone occupée par le dessin (pour le cadrage de l'icône)
// (la pioche est dessinée par js/pickaxe-art.js, selon la pioche équipée)
const WEAPON_ART = {
    pistol: {
        box: [6, -19, 65, 25],
        tilt: -0.25,
        draw(ctx, a) {
            // Crosse avec plaquettes à la couleur de la rareté
            part(ctx, [14, -2, 31, -2, 27, 24, 9, 24], M1);
            part(ctx, [16.5, 3, 28, 3, 25, 20, 13, 20], a.color, 2);
            ridges(ctx, 16, 25, 3, 6, 18, 'rgba(10, 16, 48, 0.35)', 1.2);
            triggerGuard(ctx, 29, 40, 2);
            box(ctx, 8, -5, 46, 8, 2, M2);
            // Culasse + stries + organes de visée
            box(ctx, 6, -15, 54, 11, 3, M3);
            ridges(ctx, 11, 20, 3, -13, -7);
            shine(ctx, 9, -13.5, 48);
            box(ctx, 38, -15, 5, 11, 0, a.color, 2);
            box(ctx, 58, -12, 7, 5, 1, M0, 2);
            box(ctx, 8, -19, 4, 4, 1, M0, 2);
            box(ctx, 54, -19, 3, 4, 1, M0, 2);
        }
    },

    smg: {
        box: [-3, -16, 81, 29],
        tilt: -0.25,
        draw(ctx, a) {
            // Crosse en fil repliée
            ctx.beginPath();
            ctx.moveTo(16, -6);
            ctx.lineTo(1, -6);
            ctx.lineTo(1, 5);
            ctx.lineTo(16, 5);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 5;
            ctx.stroke();
            ctx.strokeStyle = M2;
            ctx.lineWidth = 2.5;
            ctx.stroke();
            box(ctx, -3, -9, 5, 17, 2, M0, 2);
            // Chargeur droit + poignée
            part(ctx, [37, 2, 46, 2, 48, 28, 39, 28], M1);
            box(ctx, 39, 18, 9, 4, 0, a.color, 2);
            part(ctx, [18, 1, 28, 1, 25, 22, 15, 22], M1);
            triggerGuard(ctx, 27, 36, 2);
            // Corps, rail, fenêtre d'éjection
            box(ctx, 14, -11, 50, 14, 3, M2);
            shine(ctx, 17, -9.5, 44);
            box(ctx, 24, -11, 8, 14, 0, a.color, 2);
            box(ctx, 21, -15, 34, 4, 1, M0, 2);
            box(ctx, 41, -7, 11, 4, 1, M0, 2);
            // Canon + réducteur
            box(ctx, 62, -8, 12, 6, 1, M1, 2);
            box(ctx, 72, -9.5, 9, 9, 2.5, M0);
        }
    },

    ar: {
        box: [-3, -24, 105, 27],
        tilt: -0.22,
        draw(ctx, a) {
            // Crosse + plaque de rareté
            part(ctx, [0, -9, 24, -7, 24, 5, 5, 10, 0, 10], M1);
            part(ctx, [6, -5, 20, -4, 20, 2, 8, 5], a.color, 2);
            box(ctx, -3, -10, 5, 21, 2, M0, 2);
            // Poignée + chargeur courbe
            part(ctx, [30, 2, 39, 2, 35, 22, 26, 22], M1);
            ctx.beginPath();
            ctx.moveTo(46, 3);
            ctx.lineTo(56, 3);
            ctx.quadraticCurveTo(61, 15, 58, 26);
            ctx.lineTo(48, 26);
            ctx.quadraticCurveTo(51, 15, 46, 3);
            ctx.closePath();
            paint(ctx, M0);
            ridges(ctx, 50, 54, 4, 8, 20, 'rgba(255, 255, 255, 0.12)', 1.2);
            triggerGuard(ctx, 37, 45, 2);
            // Carcasse + poignée de transport / viseur
            box(ctx, 22, -11, 42, 14, 3, M2);
            shine(ctx, 25, -9.5, 36);
            box(ctx, 30, -19, 26, 6, 2, M1, 2.5);
            box(ctx, 30, -23, 4, 5, 1, M0, 2);
            // Garde-main à la couleur de la rareté, avec aérations
            box(ctx, 62, -9.5, 25, 12, 3, shadeHex(a.color, -0.2));
            shine(ctx, 64, -8, 21, 2, 0.3);
            ctx.fillStyle = 'rgba(10, 16, 48, 0.6)';
            for (const x of [66, 72, 78]) ctx.fillRect(x, -5, 4, 3);
            box(ctx, 80, -17, 3, 8, 1, M0, 2);
            // Canon + cache-flamme
            box(ctx, 86, -6, 14, 4.5, 1, M1, 2);
            box(ctx, 98, -7.5, 7, 7.5, 1.5, M0, 2);
        }
    },

    shotgun: {
        box: [-3, -14, 108, 13],
        tilt: -0.22,
        draw(ctx, a) {
            // Crosse en bois veiné
            part(ctx, [0, -4, 30, -7, 30, 4, 6, 12, 0, 12], WOOD);
            ctx.beginPath();
            ctx.moveTo(4, 2);
            ctx.quadraticCurveTo(14, -1, 26, -1);
            ctx.moveTo(6, 7);
            ctx.quadraticCurveTo(15, 4, 24, 3);
            ctx.strokeStyle = WOOD_D;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            box(ctx, -3, -5, 5, 18, 2, M0, 2);
            // Carcasse + bande de rareté
            box(ctx, 28, -9, 30, 13, 3, M2);
            shine(ctx, 31, -7.5, 24);
            box(ctx, 40, -9, 6, 13, 0, a.color, 2);
            triggerGuard(ctx, 34, 44, 4);
            // Canon + tube magasin
            box(ctx, 56, -9, 50, 5.5, 2, M1, 2.5);
            shine(ctx, 58, -8.2, 46, 1.5, 0.25);
            box(ctx, 56, -3, 42, 4, 2, M0, 2);
            // Pompe en bois striée
            box(ctx, 62, -4.5, 25, 9, 3, WOOD);
            ridges(ctx, 66, 83, 4, -3, 3, WOOD_D, 1.8);
            // Guidon
            box(ctx, 102, -12.5, 3.5, 3.5, 1, '#ffe03d', 1.5);
        }
    },

    sniper: {
        box: [-3, -27, 119, 13],
        tilt: -0.2,
        draw(ctx, a) {
            // Crosse kaki avec appui-joue
            part(ctx, [0, -6, 30, -8, 30, 4, 20, 4, 14, 12, 0, 12], OLIVE);
            part(ctx, [8, -10, 25, -11, 25, -7, 8, -6], shadeHex(OLIVE, -0.25), 2);
            box(ctx, -3, -7, 5, 20, 2, M0, 2);
            // Carcasse, chargeur, levier de culasse
            box(ctx, 28, -9, 32, 12, 3, M2);
            shine(ctx, 31, -7.5, 26);
            box(ctx, 40, 3, 9, 7, 1, M0, 2);
            ctx.beginPath();
            ctx.moveTo(56, 2);
            ctx.lineTo(61, 9);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 3.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(61.5, 10, 3.2, 0, TAU);
            paint(ctx, M3, 2);
            // Canon long + frein de bouche
            box(ctx, 58, -6, 54, 4.5, 1, M1, 2.5);
            box(ctx, 110, -8, 9, 8.5, 2, M0);
            ridges(ctx, 113, 116, 3, -6.5, -1.5, 'rgba(255, 255, 255, 0.25)', 1.2);
            // Lunette : montures, tube, bague de rareté, lentille
            box(ctx, 37, -15, 4, 7, 0, M1, 2);
            box(ctx, 53, -15, 4, 7, 0, M1, 2);
            box(ctx, 30, -24, 32, 9, 4, M0);
            shine(ctx, 33, -22.5, 26, 1.8, 0.25);
            box(ctx, 44, -24.5, 4, 10, 0, a.color, 2);
            box(ctx, 58, -27, 10, 14, 3, M1);
            ctx.beginPath();
            ctx.ellipse(68, -20, 2.4, 5.5, 0, 0, TAU);
            ctx.fillStyle = '#7fd3ff';
            ctx.fill();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fillRect(67.4, -23.5, 1.2, 3);
        }
    }
};

// Pistolet ricochet : même base que le pistolet, canon à bagues + bouclier de bouche bleuté
WEAPON_ART.ricochet = {
    box: [6, -21, 80, 25],
    tilt: -0.25,
    draw(ctx, a) {
        // Crosse avec plaquettes à la couleur de la rareté
        part(ctx, [14, -2, 31, -2, 27, 24, 9, 24], M1);
        part(ctx, [16.5, 3, 28, 3, 25, 20, 13, 20], a.color, 2);
        ridges(ctx, 16, 25, 3, 6, 18, 'rgba(10, 16, 48, 0.35)', 1.2);
        triggerGuard(ctx, 29, 40, 2);
        box(ctx, 8, -5, 44, 8, 2, M2);
        // Canon à ressort : tube + 3 bagues de rareté
        box(ctx, 48, -12, 26, 7, 2, M1, 2.5);
        for (const x of [52, 59, 66]) box(ctx, x, -14.5, 4, 12, 1.5, a.color, 2);
        // Bouclier de bouche (c'est lui qui « lance » le rebond)
        ctx.beginPath();
        ctx.ellipse(76, -8.5, 3.5, 8, 0, 0, TAU);
        paint(ctx, '#7fe9ff', 2.5);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillRect(75.2, -13.5, 1.3, 4);
        // Culasse arrondie, aérations, petite fenêtre d'énergie
        box(ctx, 6, -16, 46, 12, 5, M3);
        shine(ctx, 10, -14.5, 38);
        ctx.fillStyle = 'rgba(10, 16, 48, 0.55)';
        for (const x of [12, 18, 24]) ctx.fillRect(x, -11, 3.5, 3);
        box(ctx, 33, -13, 13, 6, 2, '#7fe9ff', 2);
        shine(ctx, 35, -12, 9, 1.5, 0.6);
        // Organes de visée
        box(ctx, 8, -20, 4, 4, 1, M0, 2);
        box(ctx, 45, -20, 3, 4, 1, M0, 2);
    }
};

// Arbalète : crosse en bois, rail métal, branches de l'arc à la couleur de la rareté, carreau chargé
WEAPON_ART.crossbow = {
    box: [-3, -31, 98, 31],
    tilt: -0.18,
    draw(ctx, a) {
        const limb = shadeHex(a.color, -0.15);
        // Corde (derrière tout le reste)
        ctx.beginPath();
        ctx.moveTo(63, -28);
        ctx.lineTo(38, 0);
        ctx.lineTo(63, 28);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 3.5;
        ctx.stroke();
        ctx.strokeStyle = '#f3ead2';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        // Crosse en bois veiné + plaque de couche
        part(ctx, [0, -5, 34, -7, 34, 6, 10, 10, 0, 10], WOOD);
        ctx.beginPath();
        ctx.moveTo(4, 2);
        ctx.quadraticCurveTo(14, -1, 30, -2);
        ctx.moveTo(6, 6);
        ctx.quadraticCurveTo(16, 4, 28, 3);
        ctx.strokeStyle = WOOD_D;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        box(ctx, -3, -6, 5, 17, 2, M0, 2);
        // Poignée + détente
        part(ctx, [26, 3, 35, 3, 32, 20, 23, 20], M1);
        triggerGuard(ctx, 33, 42, 4);
        // Rail + bande de rareté
        box(ctx, 30, -6, 50, 11, 3, M2);
        shine(ctx, 33, -4.5, 44);
        box(ctx, 46, -6, 6, 11, 0, a.color, 2);
        // Branches de l'arc
        ctx.beginPath();
        ctx.moveTo(63, -29);
        ctx.quadraticCurveTo(80, -16, 78, 0);
        ctx.quadraticCurveTo(80, 16, 63, 29);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 9;
        ctx.stroke();
        ctx.strokeStyle = limb;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(66, -25);
        ctx.quadraticCurveTo(77, -15, 76, -4);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        // Embouts des branches + fixation de l'arc
        box(ctx, 59, -31, 7, 5, 2, M0, 2);
        box(ctx, 59, 26, 7, 5, 2, M0, 2);
        box(ctx, 72, -8, 10, 16, 3, M1);
        // Carreau : tige, pointe en acier, empennage de rareté
        box(ctx, 40, -2.2, 48, 4.4, 2, '#c9a06a', 2);
        part(ctx, [88, -5, 98, 0, 88, 5], M3, 2);
        part(ctx, [40, -2, 48, -2, 44, -7, 38, -7], a.color, 1.8);
        part(ctx, [40, 2, 48, 2, 44, 7, 38, 7], a.color, 1.8);
    }
};

/* ===================== GRENADES (profil) ===================== */

const THROWABLE_ART = {
    // Explosive : grenade « ananas » kaki, bande rouge, cuillère et goupille
    explosive: {
        box: [-18, -30, 20, 25],
        tilt: 0.12,
        draw(ctx, t) {
            // Cuillère (levier) le long du flanc
            ctx.beginPath();
            ctx.moveTo(4, -20);
            ctx.quadraticCurveTo(19, -18, 15, 10);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 6;
            ctx.stroke();
            ctx.strokeStyle = M3;
            ctx.lineWidth = 3;
            ctx.stroke();
            // Corps quadrillé
            ctx.beginPath();
            ctx.ellipse(0, 4, 16, 20, 0, 0, TAU);
            paint(ctx, '#5f7a3a');
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(0, 4, 14.5, 18.5, 0, 0, TAU);
            ctx.clip();
            ctx.fillStyle = t.color;
            ctx.fillRect(-18, 1, 36, 6);
            ctx.beginPath();
            for (const y of [-8, 1, 7, 15]) { ctx.moveTo(-18, y); ctx.lineTo(18, y); }
            for (const x of [-8, 0, 8]) { ctx.moveTo(x, -18); ctx.lineTo(x, 26); }
            ctx.strokeStyle = 'rgba(10, 16, 48, 0.4)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
            ctx.beginPath();
            ctx.ellipse(-7, -3, 3, 7, 0.3, 0, TAU);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.fill();
            // Tête + goupille
            box(ctx, -7, -22, 14, 8, 2, M2);
            box(ctx, -4, -27, 8, 6, 1.5, M3, 2);
            ctx.beginPath();
            ctx.arc(-11, -24, 5, 0, TAU);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 4.5;
            ctx.stroke();
            ctx.strokeStyle = '#ffd24a';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    },

    // Fumigène : bidon gris, bande foncée, trous d'évacuation, bouffées de fumée
    smoke: {
        box: [-13, -35, 16, 22],
        tilt: 0.1,
        draw(ctx, t) {
            for (const [x, y, r] of [[-5, -28, 6], [4, -31, 5], [10, -25, 4]]) {
                ctx.beginPath();
                ctx.arc(x, y, r, 0, TAU);
                paint(ctx, '#e8edf3', 2);
            }
            box(ctx, -11, -17, 22, 38, 4, '#7c8797');
            box(ctx, -11, -4, 22, 9, 0, '#4b5566', 2);
            ctx.fillStyle = t.color;
            ctx.fillRect(-9.5, -1, 19, 3);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(-8, -14, 3.5, 32);
            box(ctx, -12, -21, 24, 6, 2, M2);
            ctx.fillStyle = OUTLINE;
            for (const x of [-6, 0, 6]) ctx.fillRect(x - 1.2, -19.5, 2.4, 2.4);
            part(ctx, [11, -19, 15, -17, 15, 8, 11, 6], M3, 2);
        }
    },

    // Flash : cylindre métal clair percé de trous, bande jaune, éclat lumineux
    flash: {
        box: [-12, -30, 20, 22],
        tilt: 0.1,
        draw(ctx, t) {
            box(ctx, -10, -17, 20, 38, 4, '#d2d8e0');
            ctx.fillStyle = 'rgba(10, 16, 48, 0.55)';
            for (const y of [-10, -3, 11]) {
                for (const x of [-5, 0, 5]) {
                    ctx.beginPath();
                    ctx.arc(x, y, 1.8, 0, TAU);
                    ctx.fill();
                }
            }
            box(ctx, -10, 2, 20, 6, 0, t.color, 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fillRect(-7.5, -14, 3, 32);
            box(ctx, -11, -21, 22, 6, 2, M2);
            part(ctx, [10, -19, 14, -17, 14, 8, 10, 6], M3, 2);
            // Éclat
            ctx.save();
            ctx.translate(13, -24);
            ctx.beginPath();
            ctx.moveTo(0, -7);
            ctx.quadraticCurveTo(0, 0, 7, 0);
            ctx.quadraticCurveTo(0, 0, 0, 7);
            ctx.quadraticCurveTo(0, 0, -7, 0);
            ctx.quadraticCurveTo(0, 0, 0, -7);
            ctx.fillStyle = '#fff6c8';
            ctx.fill();
            ctx.restore();
        }
    },

    // Propulsion : boule bleue à ailerons, chevrons blancs, petite tuyère
    propulsion: {
        box: [-21, -26, 21, 26],
        tilt: 0,
        draw(ctx, t) {
            part(ctx, [-12, 4, -21, 16, -10, 14], M1, 2.5);
            part(ctx, [12, 4, 21, 16, 10, 14], M1, 2.5);
            box(ctx, -6, 16, 12, 9, 2, M2);
            ctx.beginPath();
            ctx.arc(0, 2, 16, 0, TAU);
            paint(ctx, shadeHex(t.color, -0.25));
            ctx.beginPath();
            ctx.arc(0, 2, 11, 0, TAU);
            ctx.fillStyle = t.color;
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-6, 3);
            ctx.lineTo(0, -3);
            ctx.lineTo(6, 3);
            ctx.moveTo(-6, 9);
            ctx.lineTo(0, 3);
            ctx.lineTo(6, 9);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 5;
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(-7, -5, 3, 5, 0.5, 0, TAU);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.fill();
            box(ctx, -5, -18, 10, 6, 2, M3, 2);
            box(ctx, -2, -24, 4, 7, 1.5, M0, 2);
        }
    }
};

const HEAL_ART = {
    bandage: {
        box: [-27, -18, 24, 22],
        tilt: -0.2,
        draw(ctx, h) {
            // Bout déroulé qui pend
            ctx.beginPath();
            ctx.moveTo(-10, 12);
            ctx.quadraticCurveTo(-20, 18, -27, 21);
            ctx.lineTo(-24, 13);
            ctx.quadraticCurveTo(-18, 10, -14, 4);
            ctx.closePath();
            paint(ctx, '#ece0c2', 2.5);
            // Rouleau (cylindre vu de profil)
            box(ctx, -19, -14, 32, 28, 5, '#f6eed8');
            ctx.fillStyle = h.color;
            ctx.fillRect(-17.5, -3.5, 29, 7);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(-17.5, -3.5, 29, 7);
            ridges(ctx, -12, 6, 6, -12, -5, 'rgba(120, 100, 60, 0.35)', 1.2);
            ridges(ctx, -12, 6, 6, 5, 12, 'rgba(120, 100, 60, 0.35)', 1.2);
            shine(ctx, -16, -12, 26, 2.5, 0.6);
            // Tranche du rouleau + trou central
            ctx.beginPath();
            ctx.ellipse(13, 0, 7, 14, 0, 0, TAU);
            paint(ctx, '#e3d5b2', 2.5);
            ctx.beginPath();
            ctx.ellipse(13, 0, 3, 5.5, 0, 0, TAU);
            paint(ctx, '#bda77c', 1.5);
        }
    },

    medkit: {
        box: [-28, -25, 28, 22],
        tilt: -0.12,
        draw(ctx, h) {
            // Poignée
            ctx.beginPath();
            ctx.roundRect(-10, -24, 20, 13, 5);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 7;
            ctx.stroke();
            ctx.strokeStyle = shadeHex(h.color, -0.3);
            ctx.lineWidth = 3.5;
            ctx.stroke();
            // Mallette
            box(ctx, -27, -14, 54, 35, 6, h.color);
            ctx.fillStyle = shadeHex(h.color, -0.25);
            ctx.fillRect(-25.5, 12, 51, 7.5);
            shine(ctx, -23, -12, 46, 3, 0.35);
            ctx.beginPath();
            ctx.moveTo(-27, -4);
            ctx.lineTo(27, -4);
            ctx.strokeStyle = 'rgba(10, 16, 48, 0.5)';
            ctx.lineWidth = 2;
            ctx.stroke();
            // Fermoirs dorés
            box(ctx, -19, -7, 6, 6, 1.5, '#ffd24a', 2);
            box(ctx, 13, -7, 6, 6, 1.5, '#ffd24a', 2);
            // Croix blanche
            part(ctx, [-4, -2, 4, -2, 4, 4, 10, 4, 10, 12, 4, 12, 4, 18, -4, 18, -4, 12, -10, 12, -10, 4, -4, 4], '#ffffff', 2.5);
        }
    },

    shieldPotion: {
        box: [-21, -31, 21, 26],
        tilt: 0.15,
        glow: true,
        draw(ctx, h) {
            // Verre (fond clair)
            ctx.beginPath();
            ctx.arc(0, 8, 17, 0, TAU);
            ctx.fillStyle = 'rgba(215, 236, 255, 0.55)';
            ctx.fill();
            // Liquide bleu (sous la surface) + reflet de surface
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 8, 15.5, 0, TAU);
            ctx.clip();
            ctx.fillStyle = h.color;
            ctx.fillRect(-18, -1, 36, 30);
            ctx.fillStyle = shadeHex(h.color, -0.25);
            ctx.fillRect(-18, 17, 36, 12);
            ctx.beginPath();
            ctx.ellipse(0, -1, 16, 3, 0, 0, TAU);
            ctx.fillStyle = '#9fd6ff';
            ctx.fill();
            // Bulles
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            for (const [bx, by, br] of [[-6, 10, 2], [5, 5, 1.5], [2, 15, 2.5], [-2, 3, 1.2]]) {
                ctx.beginPath();
                ctx.arc(bx, by, br, 0, TAU);
                ctx.fill();
            }
            // Petit bouclier
            poly(ctx, [0, 3, 7, 6, 6, 13, 0, 18, -6, 13, -7, 6]);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.fill();
            ctx.restore();
            // Contour du verre + goulot
            ctx.beginPath();
            ctx.arc(0, 8, 17, 0, TAU);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 3;
            ctx.stroke();
            box(ctx, -6.5, -17, 13, 12, 2, '#d7ecff');
            // Bouchon en liège
            box(ctx, -8, -28, 16, 12, 3.5, '#b07a45');
            ridges(ctx, -4, 4, 4, -26, -18, 'rgba(90, 50, 20, 0.6)', 1.3);
            // Reflet sur le verre
            ctx.beginPath();
            ctx.ellipse(-8, 2, 3, 7, 0.4, 0, TAU);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.fill();
        }
    },

    // Spray de soin : bombe verte, étiquette blanche à croix, buse et brume
    healingSpray: {
        box: [-12, -34, 24, 23],
        tilt: 0.15,
        draw(ctx, h) {
            for (const [x, y, r] of [[15, -28, 4], [20, -24, 3], [19, -32, 2.5]]) {
                ctx.beginPath();
                ctx.arc(x, y, r, 0, TAU);
                paint(ctx, 'rgba(210, 255, 228, 0.9)', 1.5);
            }
            box(ctx, -11, -16, 22, 38, 6, h.color);
            ctx.fillStyle = shadeHex(h.color, -0.25);
            ctx.fillRect(-9.5, 12, 19, 8);
            box(ctx, -8, -7, 16, 15, 2, '#ffffff', 2);
            part(ctx, [-2, -4, 2, -4, 2, -2, 5, -2, 5, 2, 2, 2, 2, 5, -2, 5, -2, 2, -5, 2, -5, -2, -2, -2],
                shadeHex(h.color, -0.3), 1.5);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.fillRect(-8.5, -13, 3.5, 24);
            box(ctx, -8, -22, 16, 7, 3, M2);
            box(ctx, -4, -29, 8, 8, 2, M3, 2);
            box(ctx, 3, -28, 8, 4, 1.5, M0, 2);
        }
    },

    // Patch stimulant : stylo injecteur orange, fenêtre de liquide jaune, aiguille
    stimPatch: {
        box: [-30, -9, 32, 9],
        tilt: -0.55,
        glow: true,
        draw(ctx, h) {
            ctx.beginPath();
            ctx.moveTo(22, 0);
            ctx.lineTo(32, 0);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 3.5;
            ctx.stroke();
            ctx.strokeStyle = '#d4dde8';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            box(ctx, 16, -5, 7, 10, 2, M2, 2);
            box(ctx, -20, -8, 38, 16, 6, h.color);
            ctx.fillStyle = shadeHex(h.color, -0.25);
            ctx.fillRect(-18, 3, 34, 4);
            box(ctx, -6, -4.5, 16, 9, 3, '#fff4c2', 2);
            ctx.fillStyle = '#ffe03d';
            ctx.fillRect(-4.5, -2.5, 10, 5);
            part(ctx, [-13, -6, -16, 1, -13, 1, -15, 6, -10, -1, -13, -1], '#fff6c8', 1.5);
            shine(ctx, -16, -6, 30, 2.2, 0.4);
            box(ctx, -30, -6, 11, 12, 3, M1);
        }
    }
};

/* ===================== GÉNÉRATION DES ICÔNES ===================== */

const canvasCache = new Map();
const urlCache = new Map();

// Taille du dessin une fois tourné (pour qu'il remplisse bien l'icône)
function fit(art, size, pad) {
    const [x0, y0, x1, y1] = art.box;
    const c = Math.cos(art.tilt || 0);
    const s = Math.sin(art.tilt || 0);
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
        const rx = x * c - y * s;
        const ry = x * s + y * c;
        minX = Math.min(minX, rx); maxX = Math.max(maxX, rx);
        minY = Math.min(minY, ry); maxY = Math.max(maxY, ry);
    }
    const k = (size * pad) / Math.max(maxX - minX, maxY - minY);
    return { k, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

// Lueur derrière l'objet (armes épiques / légendaires, potion)
function glow(ctx, size, color, strength) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.5);
    g.addColorStop(0, `${color}${Math.round(strength * 255).toString(16).padStart(2, '0')}`);
    g.addColorStop(1, `${color}00`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
}

// Petites étoiles scintillantes (légendaire)
function sparkles(ctx, size) {
    ctx.fillStyle = '#fff6c8';
    for (const [fx, fy, fs] of [[0.18, 0.2, 0.07], [0.82, 0.3, 0.05], [0.72, 0.84, 0.06]]) {
        const x = fx * size;
        const y = fy * size;
        const s = fs * size;
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.quadraticCurveTo(x, y, x + s, y);
        ctx.quadraticCurveTo(x, y, x, y + s);
        ctx.quadraticCurveTo(x, y, x - s, y);
        ctx.quadraticCurveTo(x, y, x, y - s);
        ctx.fill();
    }
}

/*
   Canvas de l'icône (mis en cache).
   kind = 'weapon' | 'heal', id = weaponId / itemId, rarity pour les armes.
   fx = false : sans lueur ni étoiles (le butin au sol a déjà sa propre lueur).
*/
export function iconCanvas(kind, id, rarity = 0, size = 96, fx = true, skin = null) {
    // Pioche : le dessin de la pioche équipée (le même qu'en main et dans le casier)
    if (kind === 'weapon' && WEAPONS[id]?.type === 'melee') return pickaxeCanvas(skin, size, 0.9);

    const key = `${kind}|${id}|${rarity}|${size}|${fx ? 1 : 0}`;
    const cached = canvasCache.get(key);
    if (cached) return cached;
    if (typeof document === 'undefined') return null;

    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    let art;
    let arg;
    if (kind === 'throwable') {
        art = THROWABLE_ART[id] || THROWABLE_ART.explosive;
        arg = THROWABLES[id] || THROWABLES.explosive;
        if (fx) glow(ctx, size, arg.color, 0.3);
    } else if (kind === 'heal') {
        art = HEAL_ART[id] || HEAL_ART.bandage;
        arg = HEALS[id] || HEALS.bandage;
        if (fx && art.glow) glow(ctx, size, arg.color, 0.45);
    } else {
        art = WEAPON_ART[id] || WEAPON_ART.pistol;
        const r = RARITIES[rarity] || RARITIES[0];
        arg = { color: WEAPONS[id]?.type === 'melee' ? '#ffe03d' : r.color, rarity };
        if (fx && rarity >= 3 && WEAPONS[id]?.type !== 'melee') glow(ctx, size, r.color, rarity >= 4 ? 0.55 : 0.4);
    }

    // Dessin centré, incliné, à l'échelle de l'icône
    // Armes longues (fusils) : elles remplissent un peu plus la case
    const [bx0, , bx1] = art.box;
    const { k, cx, cy } = fit(art, size, bx1 - bx0 > 95 ? 0.95 : 0.84);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.scale(k, k);
    ctx.translate(-cx, -cy);
    ctx.rotate(art.tilt || 0);
    art.draw(ctx, arg);
    ctx.restore();

    if (fx && kind === 'weapon' && rarity >= 4) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        sparkles(ctx, size);
    }
    canvasCache.set(key, cv);
    return cv;
}

// Image (data URL PNG) pour la hotbar / l'inventaire
// skin = pioche équipée (ignoré pour les autres armes)
export function makeIcon(weaponId, rarity = 0, size = 96, skin = null) {
    if (WEAPONS[weaponId]?.type === 'melee') return pickaxeUrl(skin, size, 0.9);
    return iconUrl('weapon', weaponId, rarity, size);
}

export function makeHealIcon(itemId, size = 96) {
    return iconUrl('heal', itemId, 0, size);
}

function iconUrl(kind, id, rarity, size) {
    const key = `${kind}|${id}|${rarity}|${size}`;
    const cached = urlCache.get(key);
    if (cached) return cached;
    const cv = iconCanvas(kind, id, rarity, size, true);
    const url = cv ? cv.toDataURL('image/png') : '';
    urlCache.set(key, url);
    return url;
}

export function makeThrowableIcon(itemId, size = 96) {
    return iconUrl('throwable', itemId, 0, size);
}
