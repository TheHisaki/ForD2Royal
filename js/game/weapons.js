/* ==================================
   ARMES & OBJETS - FOR2D ROYAL
   Caractéristiques des armes, munitions et soins,
   + dessin des armes (vue de dessus, style cartoon).
   Ce fichier n'importe que le dessin des pioches (pas de dépendance circulaire avec draw.js).
   ================================== */

import { drawPickaxeArt } from '../pickaxe-art.js';

/* ===================== RARETÉS ===================== */

export const RARITIES = [
    { name: 'Commun',     color: '#9aa3ad' },
    { name: 'Peu commun', color: '#3fbf4a' },
    { name: 'Rare',       color: '#3a8dff' },
    { name: 'Épique',     color: '#b05cff' },
    { name: 'Légendaire', color: '#ffb21f' }
];

/* ===================== MUNITIONS ===================== */

export const INVENTORY_SLOTS = 6;

export const AMMO_TYPES = {
    light:  { name: 'Munitions légères',  color: '#e8d9a8' },
    medium: { name: 'Munitions moyennes', color: '#7fd3ff' },
    heavy:  { name: 'Munitions lourdes',  color: '#ff8a65' },
    shells: { name: 'Cartouches',         color: '#ff5470' },
    bolts:  { name: 'Carreaux',           color: '#d59cff' }
};

/* ===================== ARMES ===================== */

// Arme à feu : valeurs par défaut communes
function gun(def) {
    return { type: 'gun', pellets: 1, ...def };
}

export const WEAPONS = {
    pickaxe: {
        id: 'pickaxe', name: 'Pioche', short: 'Pioche', type: 'melee', ammo: null,
        damage: 20, fireRate: 1.6, auto: true, magSize: 0, reloadTime: 0,
        bulletSpeed: 0, range: 70, spread: 0, pellets: 1, length: 44
    },
    pistol: gun({
        id: 'pistol', name: 'Pistolet', short: 'Pistolet', ammo: 'light',
        damage: 22, fireRate: 5, auto: false, magSize: 12, reloadTime: 1.3,
        bulletSpeed: 1500, range: 900, spread: 0.04, length: 32
    }),
    crossbow: gun({
        id: 'crossbow', name: 'Arbalète', short: 'Arbalète', ammo: 'bolts',
        damage: 58, fireRate: 1.8, auto: false, magSize: 1, reloadTime: 1.8,
        bulletSpeed: 2200, range: 1500, spread: 0, length: 58, projectile: 'bolt'
    }),
    ricochet: gun({
        id: 'ricochet', name: 'Pistolet ricochet', short: 'Ricochet', ammo: 'light',
        damage: 18, fireRate: 3.4, auto: false, magSize: 8, reloadTime: 1.5,
        bulletSpeed: 1450, range: 1050, spread: 0.025, length: 34, bounces: 2
    }),
    smg: gun({
        id: 'smg', name: 'Mitraillette', short: 'Mitraillette', ammo: 'light',
        damage: 14, fireRate: 11, auto: true, magSize: 30, reloadTime: 2,
        bulletSpeed: 1500, range: 750, spread: 0.1, length: 44
    }),
    ar: gun({
        id: 'ar', name: "Fusil d'assaut", short: 'Fusil AR', ammo: 'medium',
        damage: 28, fireRate: 5.5, auto: true, magSize: 30, reloadTime: 2.2,
        bulletSpeed: 1800, range: 1200, spread: 0.05, length: 60
    }),
    shotgun: gun({
        id: 'shotgun', name: 'Fusil à pompe', short: 'Pompe', ammo: 'shells',
        damage: 11, pellets: 8, fireRate: 1.1, auto: false, magSize: 5, reloadTime: 4,
        bulletSpeed: 1400, range: 500, spread: 0.28, length: 56
    }),
    sniper: gun({
        id: 'sniper', name: 'Fusil de précision', short: 'Sniper', ammo: 'heavy',
        damage: 95, fireRate: 0.8, auto: false, magSize: 1, reloadTime: 2.5,
        bulletSpeed: 3200, range: 2400, spread: 0.005, length: 74
    })
};

// Armes qu'on peut trouver au sol (la pioche n'en fait pas partie)
export const LOOT_WEAPONS = ['pistol', 'crossbow', 'ricochet', 'smg', 'ar', 'shotgun', 'sniper'];

/* ===================== LANÇABLES ===================== */
export const THROWABLES = {
    smoke: { id: 'smoke', name: 'Grenade fumigène', short: 'Fumigène', icon: '💨', color: '#a9b8c8', fuse: 1.2, duration: 8, radius: 150, throwRange: 500, damage: 0 },
    explosive: { id: 'explosive', name: 'Grenade explosive', short: 'Explosive', icon: '💣', color: '#ff704d', fuse: 1.4, radius: 150, throwRange: 480, damage: 72 },
    flash: { id: 'flash', name: 'Grenade flash', short: 'Flash', icon: '✦', color: '#fff0a0', fuse: 1.1, radius: 190, throwRange: 460, damage: 0, duration: 3 },
    propulsion: { id: 'propulsion', name: 'Grenade de propulsion', short: 'Propulsion', icon: '↗', color: '#62d8ff', fuse: 0.8, radius: 120, throwRange: 440, damage: 0, impulse: 720 }
};
// Le légendaire est le plus dézoomé, au plancher technique global.
export const SNIPER_ZOOM_BY_RARITY = [0.92, 0.84, 0.76, 0.66, 0.55];

export function sniperZoomForRarity(rarity) {
    const index = Math.max(0, Math.min(SNIPER_ZOOM_BY_RARITY.length - 1, Number(rarity) | 0));
    return SNIPER_ZOOM_BY_RARITY[index];
}

/* ===================== SOINS ===================== */

export const HEALS = {
    bandage: {
        id: 'bandage', name: 'Bandage', icon: '🩹',
        heal: 15, healCap: 75, shield: 0, useTime: 2, stack: 10, color: '#6fdc70'
    },
    medkit: {
        id: 'medkit', name: 'Trousse de soins', icon: '💊',
        heal: 100, healCap: 100, shield: 0, useTime: 5, stack: 3, color: '#ff5470'
    },
    shieldPotion: {
        id: 'shieldPotion', name: 'Potion de bouclier', icon: '🧪',
        heal: 0, shield: 50, shieldCap: 100, useTime: 3, stack: 3, color: '#4aa8ff'
    },
    healingSpray: {
        id: 'healingSpray', name: 'Spray de soin', icon: '🧴',
        heal: 36, healCap: 100, shield: 0, useTime: 2.4, tickInterval: 0.4, tickHeal: 6, stack: 2, color: '#67e8a0', mode: 'spray'
    },
    stimPatch: {
        id: 'stimPatch', name: 'Patch stimulant', icon: '⚡',
        heal: 0, shield: 0, useTime: 1.2, stack: 2, color: '#ffbd4a', mode: 'stim', speedMultiplier: 1.35, duration: 8
    }
};

// Dégâts d'une arme selon sa rareté (+10 % par niveau)
export function weaponDamage(weaponId, rarity) {
    const w = WEAPONS[weaponId];
    return (w ? w.damage : 0) * (1 + 0.1 * (rarity || 0));
}

/* ===================== DESSIN ===================== */

const OUTLINE = '#0a1030';
const LW = 2.5;
const METAL = '#3b4150';
const METAL_DARK = '#272c37';
const METAL_LIGHT = '#59616f';
const WOOD = '#8a5a34';
const OLIVE = '#4f5e3c';

// Plan de chaque arme : pièces [x, longueur, épaisseur, couleur] dessinées dans l'ordre,
// "band" = bande de rareté [x, largeur] posée sur la pièce "body"
const PLANS = {
    pistol: {
        parts: [[14, 18, 6, METAL_LIGHT], [0, 21, 11, METAL]],
        body: 1, band: [12, 4]
    },
    smg: {
        parts: [[26, 18, 5, METAL_LIGHT], [0, 11, 7, METAL_DARK], [6, 24, 12, METAL]],
        body: 2, band: [21, 4]
    },
    ar: {
        parts: [[38, 22, 5, METAL_LIGHT], [30, 17, 9, METAL_DARK], [0, 16, 10, METAL_DARK],
            [12, 25, 12, METAL]],
        body: 3, band: [28, 4],
        extra: [[16, 9, 4, METAL_LIGHT]] // petit viseur
    },
    shotgun: {
        parts: [[30, 26, 7, METAL_LIGHT], [34, 13, 11, WOOD], [0, 16, 10, WOOD], [12, 23, 11, METAL]],
        body: 3, band: [26, 4]
    },
    sniper: {
        parts: [[40, 34, 4, METAL_LIGHT], [67, 7, 6, METAL_DARK], [0, 18, 10, OLIVE], [14, 29, 10, METAL]],
        body: 3, band: [38, 3],
        extra: [[17, 20, 7, '#1c2230'], [17, 3, 7, '#7fd3ff']] // lunette + lentille
    }
};

// Armes qui ne tiennent pas dans un simple plan de pièces alignées (vue de dessus)
const CUSTOM_DRAW = {
    // Arbalète : crosse en bois, rail, arc perpendiculaire à la couleur de la rareté, carreau
    crossbow(ctx, band) {
        part(ctx, 0, 22, 9, WOOD);
        part(ctx, 18, 34, 7, METAL);
        ctx.fillStyle = band;
        ctx.fillRect(9, -3, 4, 6);
        // Corde
        ctx.beginPath();
        ctx.moveTo(41, -18);
        ctx.lineTo(25, 0);
        ctx.lineTo(41, 18);
        ctx.strokeStyle = '#f3ead2';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        // Arc
        ctx.beginPath();
        ctx.moveTo(40, -19);
        ctx.quadraticCurveTo(52, -10, 50, 0);
        ctx.quadraticCurveTo(52, 10, 40, 19);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.strokeStyle = band;
        ctx.lineWidth = 3.5;
        ctx.stroke();
        part(ctx, 46, 7, 8, METAL_DARK);
        // Carreau chargé
        part(ctx, 24, 32, 3, '#c9a06a');
        ctx.beginPath();
        ctx.moveTo(56, -3.5);
        ctx.lineTo(62, 0);
        ctx.lineTo(56, 3.5);
        ctx.closePath();
        ctx.fillStyle = METAL_LIGHT;
        ctx.fill();
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 2;
        ctx.stroke();
    },
    // Pistolet ricochet : canon à bagues de rareté + bouclier de bouche bleuté
    ricochet(ctx, band) {
        part(ctx, 14, 20, 6, METAL_DARK);
        for (const x of [18, 24]) part(ctx, x, 3.5, 9, band);
        part(ctx, 31, 4, 12, '#7fe9ff');
        part(ctx, 0, 20, 12, METAL_LIGHT);
        ctx.fillStyle = band;
        ctx.fillRect(11, -4.5, 4, 9);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(3, -4, 7, 2.5);
    }
};

// Plan générique d'une arme sans plan dédié (créé une fois puis mis en cache)
const DEFAULT_PLANS = new Map();
function defaultPlan(weaponId, L) {
    let plan = DEFAULT_PLANS.get(weaponId);
    if (!plan) {
        plan = {
            parts: [[L * 0.55, L * 0.45, 5, METAL_LIGHT], [0, L * 0.6, 11, METAL]],
            body: 1, band: [L * 0.4, 4]
        };
        DEFAULT_PLANS.set(weaponId, plan);
    }
    return plan;
}

function roundRect(ctx, x, y, w, h, rad) {
    const rr = Math.min(rad, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.arcTo(x + w, y, x + w, y + rr, rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);
    ctx.lineTo(x + rr, y + h);
    ctx.arcTo(x, y + h, x, y + h - rr, rr);
    ctx.lineTo(x, y + rr);
    ctx.arcTo(x, y, x + rr, y, rr);
    ctx.closePath();
}

// Pièce centrée sur l'axe du canon (y = 0)
function part(ctx, x, len, thick, color, stroke = true) {
    roundRect(ctx, x, -thick / 2, len, thick, 3);
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = LW;
        ctx.stroke();
    }
}

// Pioche en main : même dessin que l'icône de la hotbar et le casier (js/pickaxe-art.js)
function drawPickaxe(ctx, L, skinId = null) {
    drawPickaxeArt(ctx, skinId, L, LW);
}

// Dessine l'arme en coordonnées locales : poignée en x = 0, canon vers +x
export function drawWeapon(ctx, weaponId, rarity = 0, pickaxeSkin = null) {
    const w = WEAPONS[weaponId];
    const L = w ? w.length : 44;
    const bandColor = (RARITIES[rarity] || RARITIES[0]).color;
    ctx.save();
    ctx.lineJoin = 'round';

    if (!w || w.type === 'melee') {
        drawPickaxe(ctx, L, pickaxeSkin);
        ctx.restore();
        return;
    }

    const custom = CUSTOM_DRAW[weaponId];
    if (custom) {
        custom(ctx, bandColor);
        ctx.restore();
        return;
    }

    const plan = PLANS[weaponId] || defaultPlan(weaponId, L);

    // Accès par index (pas de déstructuration : appelé pour chaque arme visible à chaque image)
    const parts = plan.parts;
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        part(ctx, p[0], p[1], p[2], p[3]);
    }

    // Bande de rareté sur le corps
    const body = parts[plan.body];
    const bx = plan.band[0];
    const bw = plan.band[1];
    ctx.fillStyle = bandColor;
    ctx.fillRect(bx, -body[2] / 2 + 1.5, bw, body[2] - 3);

    // Reflet sur le corps
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(body[0] + 3, -body[2] / 2 + 2, Math.max(0, bx - body[0] - 5), 2.5);

    const extra = plan.extra;
    if (extra) {
        const s = extra[0];
        const sl = s[1];
        part(ctx, s[0], sl, s[2], s[3]);
        for (let i = 1; i < extra.length; i++) {
            const e = extra[i];
            part(ctx, e[0] + sl - e[1], e[1], e[2], e[3], false); // lentille au bout de la lunette
        }
    }
    ctx.restore();
}

/* ===================== ICÔNES =====================
   Les icônes de la hotbar / de l'inventaire / du butin au sol sont dessinées
   de profil dans icons.js (makeIcon, makeHealIcon, iconCanvas). */
