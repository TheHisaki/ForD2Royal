/* ==================================
   ARMES & OBJETS - FOR2D ROYAL
   Caractéristiques des armes, munitions et soins,
   + dessin des armes (vue de dessus, style cartoon).
   Ce fichier n'importe rien (pas de dépendance circulaire avec draw.js).
   ================================== */

/* ===================== RARETÉS ===================== */

export const RARITIES = [
    { name: 'Commun',     color: '#9aa3ad' },
    { name: 'Peu commun', color: '#3fbf4a' },
    { name: 'Rare',       color: '#3a8dff' },
    { name: 'Épique',     color: '#b05cff' },
    { name: 'Légendaire', color: '#ffb21f' }
];

/* ===================== MUNITIONS ===================== */

export const AMMO_TYPES = {
    light:  { name: 'Munitions légères',  color: '#e8d9a8' },
    medium: { name: 'Munitions moyennes', color: '#7fd3ff' },
    heavy:  { name: 'Munitions lourdes',  color: '#ff8a65' },
    shells: { name: 'Cartouches',         color: '#ff5470' }
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
export const LOOT_WEAPONS = ['pistol', 'smg', 'ar', 'shotgun', 'sniper'];

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

function drawPickaxe(ctx, L, bandColor) {
    // Manche en bois
    part(ctx, 0, L - 6, 7, '#9a6a3a');
    // Poignée enroulée
    part(ctx, 0, 11, 8, '#5a3a22');
    // Bande de rareté près de la tête
    roundRect(ctx, L - 20, -2.5, 4, 5, 1);
    ctx.fillStyle = bandColor;
    ctx.fill();

    // Tête métallique en T (croissant)
    ctx.beginPath();
    ctx.moveTo(L - 12, -17);
    ctx.quadraticCurveTo(L + 8, 0, L - 12, 17);
    ctx.lineTo(L - 15, 12);
    ctx.quadraticCurveTo(L - 7, 0, L - 15, -12);
    ctx.closePath();
    ctx.fillStyle = '#c3ccd6';
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = LW;
    ctx.lineJoin = 'round';
    ctx.stroke();
    // Reflet
    ctx.beginPath();
    ctx.moveTo(L - 9, -9);
    ctx.quadraticCurveTo(L - 3, 0, L - 9, 9);
    ctx.strokeStyle = '#eef3f8';
    ctx.lineWidth = 2;
    ctx.stroke();
}

// Dessine l'arme en coordonnées locales : poignée en x = 0, canon vers +x
export function drawWeapon(ctx, weaponId, rarity = 0) {
    const w = WEAPONS[weaponId];
    const L = w ? w.length : 44;
    const bandColor = (RARITIES[rarity] || RARITIES[0]).color;
    ctx.save();
    ctx.lineJoin = 'round';

    if (!w || w.type === 'melee') {
        drawPickaxe(ctx, L, bandColor);
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
