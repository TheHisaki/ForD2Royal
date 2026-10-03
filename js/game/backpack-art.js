/* ==================================
   SACS À DOS EN JEU (vus du dessus, dans le dos) - FOR2D ROYAL
   Chaque sac « à forme » du casier (js/cosmetics.js, champ motif) a son dessin en jeu :
   ailes, cape, queue de poisson, carapace, pack techno, cœur pixel, écu.
   Les sacs classiques restent le petit sac coloré dessiné par draw.js.

   Repère : celui du combattant (regard vers +x, dos vers -x), r = rayon du personnage.
   ================================== */

import { shadeHex } from './utils.js';

const OUTLINE = '#0a1030';
const TAU = Math.PI * 2;
const HEX6 = /^#[0-9a-f]{6}$/i;

const sh = (c, k, fb) => (HEX6.test(c) ? shadeHex(c, k) : fb);

function ink(ctx, fill, lw = 3) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = lw;
    ctx.stroke();
}

function ellipse(ctx, x, y, rx, ry, rot = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}

function roundRect(ctx, x, y, w, h, rad) {
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
}

const DRAW = {
    // Carapace de crabe : coque ronde segmentée, petites pattes, gemme au centre
    shell(ctx, r, c, a) {
        for (const s of [1, -1]) {
            ctx.beginPath();
            ctx.moveTo(-r * 0.55, s * r * 0.45);
            ctx.quadraticCurveTo(-r * 0.6, s * r * 0.85, -r * 0.85, s * r * 0.82);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 6;
            ctx.stroke();
            ctx.strokeStyle = c;
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        ellipse(ctx, -r * 0.78, 0, r * 0.48, r * 0.64);
        ink(ctx, c);
        ellipse(ctx, -r * 0.78, -r * 0.1, r * 0.36, r * 0.42);
        ctx.fillStyle = sh(c, 0.18, c);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-r * 0.78, -r * 0.6);
        ctx.lineTo(-r * 0.78, r * 0.6);
        ctx.moveTo(-r * 1.2, 0);
        ctx.lineTo(-r * 0.35, 0);
        ctx.moveTo(-r * 1.08, -r * 0.42);
        ctx.quadraticCurveTo(-r * 0.78, -r * 0.25, -r * 0.48, -r * 0.42);
        ctx.moveTo(-r * 1.08, r * 0.42);
        ctx.quadraticCurveTo(-r * 0.78, r * 0.25, -r * 0.48, r * 0.42);
        ctx.strokeStyle = a;
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ellipse(ctx, -r * 0.78, 0, r * 0.13, r * 0.13);
        ink(ctx, a, 2);
    },

    // Ailes de fée : 4 ailes translucides qui battent, nervures claires, petit corps central
    wings(ctx, r, c, a, t, seed) {
        const flap = 1 + Math.sin(t * 6 + seed) * 0.1;
        const ga = ctx.globalAlpha;
        for (const s of [1, -1]) {
            for (const [x, y, rx, ry, rot] of [[-0.55, 0.95, 0.34, 0.66, 0.55], [-1.0, 0.72, 0.26, 0.46, -0.45]]) {
                ellipse(ctx, r * x, s * r * y * flap, r * rx, r * ry, s * rot);
                ctx.globalAlpha = ga * 0.85;
                ctx.fillStyle = c;
                ctx.fill();
                ctx.globalAlpha = ga;
                ctx.strokeStyle = OUTLINE;
                ctx.lineWidth = 2.6;
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.moveTo(-r * 0.62, s * r * 0.3);
            ctx.lineTo(-r * 0.42, s * r * 1.45 * flap);
            ctx.moveTo(-r * 0.62, s * r * 0.3);
            ctx.lineTo(-r * 0.85, s * r * 1.35 * flap);
            ctx.moveTo(-r * 0.75, s * r * 0.3);
            ctx.lineTo(-r * 1.15, s * r * 0.95 * flap);
            ctx.strokeStyle = a;
            ctx.lineWidth = 1.6;
            ctx.stroke();
        }
        ellipse(ctx, -r * 0.72, 0, r * 0.22, r * 0.32);
        ink(ctx, sh(c, -0.35, c), 2.5);
        ellipse(ctx, -r * 0.72, 0, r * 0.09, r * 0.16);
        ctx.fillStyle = a;
        ctx.fill();
    },

    // Cape de faucon : plumes en éventail vers l'arrière, rangée claire, ondule au vent
    cape(ctx, r, c, a, t, seed) {
        const sway = Math.sin(t * 3 + seed) * r * 0.08;
        ctx.beginPath();
        ctx.moveTo(-r * 0.15, -r * 0.82);
        ctx.quadraticCurveTo(-r * 0.9, -r * 1.2, -r * 1.55 + sway, -r * 0.95);
        // Bord de fuite en plumes (festons)
        const N = 6;
        for (let i = 1; i <= N; i++) {
            const y = -r * 0.95 + (r * 1.9 * i) / N;
            const ym = y - (r * 1.9) / N / 2;
            ctx.quadraticCurveTo(-r * 1.95 + sway, ym, -r * 1.55 + sway * (1 - Math.abs(y) / r), y);
        }
        ctx.quadraticCurveTo(-r * 0.9, r * 1.2, -r * 0.15, r * 0.82);
        ctx.closePath();
        ink(ctx, c);
        // Rangée de plumes claires
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const y = -r * 0.7 + (r * 1.4 * i) / 4;
            ctx.moveTo(-r * 0.75, y);
            ctx.quadraticCurveTo(-r * 1.2 + sway * 0.5, y, -r * 1.35 + sway * 0.7, y * 1.05);
        }
        ctx.strokeStyle = a;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-r * 0.4, -r * 0.7);
        ctx.quadraticCurveTo(-r * 0.6, 0, -r * 0.4, r * 0.7);
        ctx.strokeStyle = sh(c, -0.35, OUTLINE);
        ctx.lineWidth = 2;
        ctx.stroke();
    },

    // Queue de poisson : corps à écailles qui s'affine, nageoire en V, elle ondule
    fishtail(ctx, r, c, a, t, seed) {
        ctx.save();
        ctx.translate(-r * 0.5, 0);
        ctx.rotate(Math.sin(t * 4 + seed) * 0.16);
        ctx.beginPath();
        ctx.moveTo(-r * 0.75, -r * 0.12);
        ctx.quadraticCurveTo(-r * 1.15, -r * 0.65, -r * 1.45, -r * 0.85);
        ctx.quadraticCurveTo(-r * 1.25, -r * 0.3, -r * 1.3, 0);
        ctx.quadraticCurveTo(-r * 1.25, r * 0.3, -r * 1.45, r * 0.85);
        ctx.quadraticCurveTo(-r * 1.15, r * 0.65, -r * 0.75, r * 0.12);
        ctx.closePath();
        ink(ctx, a);
        ctx.beginPath();
        ctx.moveTo(-r * 0.85, -r * 0.2);
        ctx.lineTo(-r * 1.3, -r * 0.65);
        ctx.moveTo(-r * 0.85, r * 0.2);
        ctx.lineTo(-r * 1.3, r * 0.65);
        ctx.strokeStyle = 'rgba(10, 16, 48, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(r * 0.05, -r * 0.42);
        ctx.quadraticCurveTo(-r * 0.55, -r * 0.4, -r * 0.85, -r * 0.1);
        ctx.lineTo(-r * 0.85, r * 0.1);
        ctx.quadraticCurveTo(-r * 0.55, r * 0.4, r * 0.05, r * 0.42);
        ctx.closePath();
        ink(ctx, c);
        // Écailles
        ctx.beginPath();
        for (const [x, n] of [[-0.12, 3], [-0.38, 3], [-0.62, 2]]) {
            for (let k = 0; k < n; k++) {
                const y = (k - (n - 1) / 2) * r * 0.22;
                ctx.moveTo(r * x + r * 0.08, y - r * 0.1);
                ctx.quadraticCurveTo(r * x - r * 0.06, y, r * x + r * 0.08, y + r * 0.1);
            }
        }
        ctx.strokeStyle = a;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
    },

    // Pack techno : coque rigide, écran cyan, modules latéraux, antenne qui clignote
    tech(ctx, r, c, a, t, seed) {
        ctx.beginPath();
        ctx.moveTo(-r * 1.05, -r * 0.18);
        ctx.lineTo(-r * 1.38, -r * 0.18);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.strokeStyle = a;
        ctx.lineWidth = 2;
        ctx.stroke();
        ellipse(ctx, -r * 1.42, -r * 0.18, r * 0.09, r * 0.09);
        ink(ctx, Math.sin(t * 5 + seed) > 0 ? a : '#ffffff', 1.5);
        roundRect(ctx, -r * 0.62, -r * 0.82, r * 0.38, r * 0.26, r * 0.07);
        ink(ctx, a, 2.5);
        roundRect(ctx, -r * 0.62, r * 0.56, r * 0.38, r * 0.26, r * 0.07);
        ink(ctx, a, 2.5);
        roundRect(ctx, -r * 1.08, -r * 0.62, r * 0.76, r * 1.24, r * 0.22);
        ink(ctx, sh(c, -0.3, c));
        roundRect(ctx, -r * 1.0, -r * 0.54, r * 0.6, r * 1.08, r * 0.16);
        ctx.fillStyle = c;
        ctx.fill();
        roundRect(ctx, -r * 0.88, -r * 0.24, r * 0.36, r * 0.48, r * 0.06);
        ink(ctx, '#08264d', 2);
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, -r * 0.14);
        ctx.lineTo(-r * 0.7, r * 0.14);
        ctx.moveTo(-r * 0.8, 0);
        ctx.lineTo(-r * 0.6, 0);
        ctx.strokeStyle = a;
        ctx.lineWidth = 1.8;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillRect(-r * 0.98, -r * 0.48, r * 0.08, r * 0.96);
    },

    // Cœur pixel : sac carré avec un cœur en gros pixels
    pixel(ctx, r, c, a) {
        roundRect(ctx, -r * 1.05, -r * 0.62, r * 0.72, r * 1.24, r * 0.12);
        ink(ctx, c);
        const px = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [2, 4]];
        const k = r * 0.13;
        ctx.fillStyle = a;
        for (const [x, y] of px) {
            // Cœur tourné vers l'arrière (lu depuis le dessus du personnage)
            ctx.fillRect(-r * 0.35 - (y + 1) * k, -r * 0.325 + x * k, k, k);
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-r * 0.35 - 2 * k, -r * 0.325 + k, k * 0.5, k * 0.5);
    },

    // Écu : bouclier en pointe vers l'arrière, bordure dorée, croix blanche
    shield(ctx, r, c, a) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.3, -r * 0.7);
        ctx.lineTo(-r * 0.95, -r * 0.7);
        ctx.quadraticCurveTo(-r * 1.5, -r * 0.5, -r * 1.62, 0);
        ctx.quadraticCurveTo(-r * 1.5, r * 0.5, -r * 0.95, r * 0.7);
        ctx.lineTo(-r * 0.3, r * 0.7);
        ctx.closePath();
        ink(ctx, a);
        ctx.beginPath();
        ctx.moveTo(-r * 0.4, -r * 0.55);
        ctx.lineTo(-r * 0.95, -r * 0.55);
        ctx.quadraticCurveTo(-r * 1.38, -r * 0.4, -r * 1.46, 0);
        ctx.quadraticCurveTo(-r * 1.38, r * 0.4, -r * 0.95, r * 0.55);
        ctx.lineTo(-r * 0.4, r * 0.55);
        ctx.closePath();
        ctx.fillStyle = c;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-r * 0.55, 0);
        ctx.lineTo(-r * 1.3, 0);
        ctx.moveTo(-r * 0.85, -r * 0.35);
        ctx.lineTo(-r * 0.85, r * 0.35);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = r * 0.18 + 3;
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = r * 0.18;
        ctx.stroke();
    }
};

// Le sac a-t-il un dessin en jeu ? (sinon : petit sac classique)
export function hasBackpackArt(motif) {
    return !!motif && Object.prototype.hasOwnProperty.call(DRAW, motif);
}

/*
   Dessine le sac « à forme » dans le dos du combattant (repère du combattant).
   Renvoie false si le motif n'a pas de dessin : l'appelant dessine le sac classique.
*/
export function drawBackpack(ctx, motif, r, color, accent, time = 0, seed = 0) {
    if (!hasBackpackArt(motif)) return false;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    DRAW[motif](ctx, r, color || '#3a8dff', accent || '#ffffff', time, seed);
    ctx.restore();
    return true;
}
