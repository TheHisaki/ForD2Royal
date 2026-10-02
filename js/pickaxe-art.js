/* ==================================
   DESSIN DES PIOCHES - FOR2D ROYAL
   Un seul dessin (canvas 2D) par pioche, utilisé partout pour qu'elle soit
   identique en main, dans la hotbar et dans le casier :
   - en main pendant la partie (js/game/weapons.js),
   - icônes de la hotbar / de l'inventaire (js/game/icons.js),
   - casier, boutique et passe (js/item-art.js, converti en image).
   Repère : manche le long de +x, de la poignée (x = 0) à la tête (x ≈ 100).
   Style cartoon : contour sombre épais, dégradés, reflets.
   ================================== */

const OUTLINE = '#0a1030';
const TAU = Math.PI * 2;

// Identifiant du casier -> motif de dessin (le casier donne aussi directement le motif)
const MOTIF_OF = {
    'pioche-defaut': 'classic',
    'pioche-laser': 'laser',
    'pioche-royale': 'royal',
    'pioche-cosmique': 'cosmic',
    'pioche-maudite': 'void',
    'pioche-bonbon': 'candy'
};

export function pickaxeMotif(skin) {
    if (skin && MOTIF_OF[skin]) return MOTIF_OF[skin];
    if (skin && DRAW[skin]) return skin;
    return 'classic';
}

/* ===================== OUTILS ===================== */

// Rectangle arrondi (sans ctx.roundRect, pour les vieux navigateurs)
function rr(ctx, x, y, w, h, r) {
    const q = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + q, y);
    ctx.arcTo(x + w, y, x + w, y + h, q);
    ctx.arcTo(x + w, y + h, x, y + h, q);
    ctx.arcTo(x, y + h, x, y, q);
    ctx.arcTo(x, y, x + w, y, q);
    ctx.closePath();
}

function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
}

// Remplit le chemin courant puis trace le contour sombre
function ink(ctx, fill, W) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = W;
    ctx.stroke();
}

// Dégradé linéaire régulier entre plusieurs couleurs
function lin(ctx, x0, y0, x1, y1, colors) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
    return g;
}

// Dégradé radial (sphère éclairée en haut à gauche)
function orb(ctx, x, y, r, colors) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
    return g;
}

// Trait clair (reflet)
function gloss(ctx, x0, y0, x1, y1, w, a = 0.5) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = `rgba(255, 255, 255, ${a})`;
    ctx.lineWidth = w;
    ctx.stroke();
}

// Manche : tube arrondi, clair en haut et sombre en bas, avec un reflet
function shaft(ctx, W, x1, t, colors) {
    rr(ctx, 0, -t / 2, x1, t, t / 2);
    ink(ctx, lin(ctx, 0, -t / 2, 0, t / 2, colors), W);
    gloss(ctx, 32, -t * 0.22, x1 - 6, -t * 0.22, t * 0.18, 0.35);
}

// Poignée enroulée (bandes diagonales)
function grip(ctx, W, colors, wrap) {
    rr(ctx, -2, -6.5, 32, 13, 5);
    ink(ctx, lin(ctx, 0, -6.5, 0, 6.5, colors), W);
    ctx.beginPath();
    for (let x = 2; x <= 26; x += 5) {
        ctx.moveTo(x, -5.5);
        ctx.lineTo(x + 3.5, 5.5);
    }
    ctx.strokeStyle = wrap;
    ctx.lineWidth = 1.8;
    ctx.stroke();
}

// Croissant à deux pointes (tête de pioche classique)
function crescent(ctx) {
    ctx.beginPath();
    ctx.moveTo(62, -50);
    ctx.quadraticCurveTo(88, -34, 97, -7);
    ctx.lineTo(97, 7);
    ctx.quadraticCurveTo(88, 34, 62, 50);
    ctx.quadraticCurveTo(78, 26, 80, 7);
    ctx.lineTo(80, -7);
    ctx.quadraticCurveTo(78, -26, 62, -50);
    ctx.closePath();
}

/* ===================== LES PIOCHES ===================== */

const DRAW = {
    // Pioche Classique : bois veiné, cuir enroulé, tête en acier trempé
    classic(ctx, W) {
        shaft(ctx, W, 102, 9, ['#e0a865', '#a5683a', '#6a3f20']);
        // Veines du bois
        ctx.beginPath();
        ctx.moveTo(36, 1.5);
        ctx.quadraticCurveTo(52, 3, 70, 1);
        ctx.moveTo(50, -0.5);
        ctx.quadraticCurveTo(62, -2, 76, 0);
        ctx.strokeStyle = 'rgba(80, 42, 18, 0.5)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        grip(ctx, W, ['#7a4a2a', '#4a2a16', '#2c170a'], 'rgba(255, 214, 170, 0.3)');
        // Pommeau en acier
        rr(ctx, -7, -5.5, 7, 11, 2.5);
        ink(ctx, lin(ctx, 0, -5.5, 0, 5.5, ['#cbd5e1', '#7c879b', '#3a4252']), W);

        // Tête en acier, plus sombre près du manche
        crescent(ctx);
        ink(ctx, lin(ctx, 62, 0, 98, 0, ['#6f7a8c', '#c9d2dd', '#f1f5f9', '#9aa6b8']), W);
        // Fil de la lame (bord extérieur brillant)
        ctx.beginPath();
        ctx.moveTo(67, -43);
        ctx.quadraticCurveTo(87, -29, 93, -9);
        ctx.moveTo(67, 43);
        ctx.quadraticCurveTo(87, 29, 93, 9);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 2.2;
        ctx.stroke();
        // Œil de la tête (bague de fixation) + rivet
        rr(ctx, 78, -10, 22, 20, 5);
        ink(ctx, lin(ctx, 0, -10, 0, 10, ['#a3aebf', '#5b6577', '#2f3644']), W);
        circle(ctx, 89, 0, 3.4);
        ink(ctx, orb(ctx, 89, 0, 3.4, ['#ffffff', '#cbd5e1', '#64748b']), W * 0.55);
        gloss(ctx, 81, -6, 97, -6, 1.6, 0.45);
    },

    // Faux Néon : manche en carbone, anneaux néon, lame plasma cyan et pointe magenta
    laser(ctx, W) {
        shaft(ctx, W, 96, 8, ['#41477a', '#1d2038', '#0b0d1c']);
        for (const x of [38, 52, 66]) {
            rr(ctx, x, -4.6, 3.4, 9.2, 1);
            ctx.fillStyle = '#00f0ff';
            ctx.fill();
        }
        grip(ctx, W, ['#2b2f4f', '#15172b', '#08091a'], 'rgba(255, 0, 127, 0.55)');
        rr(ctx, -7, -5, 7, 10, 2.5);
        ink(ctx, lin(ctx, 0, -5, 0, 5, ['#ff5fb0', '#ff007f', '#8a0045']), W);

        const blade = () => {
            ctx.beginPath();
            ctx.moveTo(78, -6);
            ctx.bezierCurveTo(100, -14, 98, -48, 36, -57);
            ctx.bezierCurveTo(74, -43, 82, -25, 74, -8);
            ctx.closePath();
        };
        // Lueur autour de la lame
        blade();
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = W * 3.4;
        ctx.stroke();
        ctx.restore();
        // Lame plasma + cœur blanc
        blade();
        ink(ctx, lin(ctx, 40, -56, 92, -4, ['#f0ffff', '#47f5ff', '#00b4e6', '#0077b6']), W);
        ctx.beginPath();
        ctx.moveTo(80, -9);
        ctx.bezierCurveTo(90, -18, 86, -42, 48, -52);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2.6;
        ctx.stroke();

        // Contre-pointe magenta
        ctx.beginPath();
        ctx.moveTo(80, 5);
        ctx.lineTo(104, 24);
        ctx.lineTo(77, 15);
        ctx.closePath();
        ink(ctx, lin(ctx, 78, 5, 104, 24, ['#ff8cc6', '#ff007f', '#a0004f']), W);

        // Émetteur + noyau d'énergie
        rr(ctx, 74, -10, 24, 20, 6);
        ink(ctx, lin(ctx, 0, -10, 0, 10, ['#3a3f66', '#1d2038', '#0b0d1c']), W);
        rr(ctx, 76, -3, 20, 2.4, 1);
        ctx.fillStyle = '#ff007f';
        ctx.fill();
        circle(ctx, 86, 3, 4.4);
        ink(ctx, orb(ctx, 86, 3, 4.4, ['#ffffff', '#7ff9ff', '#00b4e6']), W * 0.55);
    },

    // Hache du Lion : velours pourpre, anneaux d'or, double lame dorée et rubis
    royal(ctx, W) {
        shaft(ctx, W, 98, 9, ['#b366d6', '#5e1f7a', '#2e0d42']);
        for (const x of [40, 62]) {
            rr(ctx, x, -5.6, 4.2, 11.2, 1.5);
            ink(ctx, lin(ctx, 0, -5.6, 0, 5.6, ['#fff1a8', '#ffcc33', '#b07a10']), W * 0.6);
        }
        grip(ctx, W, ['#7a2d99', '#4a1260', '#26062f'], 'rgba(255, 210, 74, 0.55)');
        // Pommeau doré serti
        circle(ctx, -4, 0, 7);
        ink(ctx, orb(ctx, -4, 0, 7, ['#fff6c8', '#ffcc33', '#9c6a0c']), W);
        circle(ctx, -4, 0, 2.8);
        ctx.fillStyle = '#e11d48';
        ctx.fill();

        // Pointe de lance au bout du manche
        ctx.beginPath();
        ctx.moveTo(95, -6);
        ctx.lineTo(114, 0);
        ctx.lineTo(95, 6);
        ctx.closePath();
        ink(ctx, lin(ctx, 95, -6, 95, 6, ['#fff6c8', '#ffcc33', '#b07a10']), W);

        // Deux lames en éventail
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(78, 6 * s);
            ctx.quadraticCurveTo(76, 26 * s, 60, 44 * s);
            ctx.quadraticCurveTo(84, 59 * s, 108, 44 * s);
            ctx.quadraticCurveTo(94, 26 * s, 94, 6 * s);
            ctx.closePath();
            ink(ctx, lin(ctx, 60, 0, 108, 0, ['#b9790c', '#ffd54a', '#fff6c8', '#e0a52a']), W);
            // Tranchant brillant
            ctx.beginPath();
            ctx.moveTo(65, 46 * s);
            ctx.quadraticCurveTo(84, 55 * s, 103, 46 * s);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.lineWidth = 2.2;
            ctx.stroke();
            // Gravure
            ctx.beginPath();
            ctx.moveTo(84, 12 * s);
            ctx.quadraticCurveTo(84, 28 * s, 74, 39 * s);
            ctx.moveTo(89, 12 * s);
            ctx.quadraticCurveTo(90, 28 * s, 98, 39 * s);
            ctx.strokeStyle = 'rgba(130, 74, 0, 0.55)';
            ctx.lineWidth = 1.6;
            ctx.stroke();
        }

        // Bloc central + rubis taillé
        rr(ctx, 74, -11, 24, 22, 6);
        ink(ctx, lin(ctx, 0, -11, 0, 11, ['#ffe27a', '#d9a02a', '#8f5f08']), W);
        ctx.beginPath();
        ctx.moveTo(86, -8);
        ctx.lineTo(94, 0);
        ctx.lineTo(86, 8);
        ctx.lineTo(78, 0);
        ctx.closePath();
        ink(ctx, lin(ctx, 78, -8, 94, 8, ['#ffa3b5', '#e11d48', '#7a0820']), W * 0.6);
        circle(ctx, 84, -2.5, 1.6);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    },

    // Sonde Stellaire : céramique blanche, sonde effilée, réacteur orange, orbe bleu
    cosmic(ctx, W) {
        shaft(ctx, W, 98, 9, ['#ffffff', '#e2e8f0', '#8794a8']);
        for (const x of [40, 62]) {
            rr(ctx, x, -4.6, 5, 9.2, 1.2);
            ctx.fillStyle = '#38bdf8';
            ctx.fill();
        }
        grip(ctx, W, ['#64748b', '#3a4252', '#1c212b'], 'rgba(56, 189, 248, 0.55)');
        rr(ctx, -7, -5.5, 7, 11, 2.5);
        ink(ctx, lin(ctx, 0, -5.5, 0, 5.5, ['#ffd08a', '#ff7700', '#a34a00']), W);

        // Flamme du réacteur (sous la buse)
        ctx.beginPath();
        ctx.moveTo(78, 26);
        ctx.quadraticCurveTo(87, 56, 96, 26);
        ctx.closePath();
        ctx.fillStyle = lin(ctx, 0, 26, 0, 50, ['#fff3b0', '#ffb703', 'rgba(255, 119, 0, 0.2)']);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(83, 26);
        ctx.quadraticCurveTo(87, 42, 91, 26);
        ctx.closePath();
        ctx.fillStyle = '#fffbe6';
        ctx.fill();
        // Buse du réacteur
        ctx.beginPath();
        ctx.moveTo(80, 8);
        ctx.lineTo(94, 8);
        ctx.lineTo(99, 26);
        ctx.lineTo(75, 26);
        ctx.closePath();
        ink(ctx, lin(ctx, 75, 0, 99, 0, ['#64748b', '#cbd5e1', '#475569']), W);
        rr(ctx, 74, 22, 26, 6, 2.5);
        ink(ctx, lin(ctx, 0, 22, 0, 28, ['#ffb35c', '#ff7700', '#a34a00']), W * 0.7);

        // Sonde effilée
        ctx.beginPath();
        ctx.moveTo(78, -8);
        ctx.lineTo(80, -30);
        ctx.lineTo(87, -58);
        ctx.lineTo(94, -30);
        ctx.lineTo(96, -8);
        ctx.closePath();
        ink(ctx, lin(ctx, 78, 0, 96, 0, ['#b6c2d2', '#ffffff', '#8794a8']), W);
        ctx.beginPath();
        ctx.moveTo(80.6, -24);
        ctx.lineTo(93.4, -24);
        ctx.lineTo(92.2, -31);
        ctx.lineTo(81.8, -31);
        ctx.closePath();
        ctx.fillStyle = '#38bdf8';
        ctx.fill();
        gloss(ctx, 84, -12, 87, -50, 1.6, 0.8);

        // Moyeu + orbe d'énergie + anneau orbital
        circle(ctx, 87, 0, 11.5);
        ink(ctx, lin(ctx, 0, -11.5, 0, 11.5, ['#f1f5f9', '#94a3b8', '#3a4252']), W);
        circle(ctx, 87, 0, 6.4);
        ink(ctx, orb(ctx, 87, 0, 6.4, ['#e0f7ff', '#38bdf8', '#075985']), W * 0.6);
        circle(ctx, 85, -2, 1.7);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(87, 0, 18, 5, -0.5, 0, TAU);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
    },

    // Faux du Néant : os sombre veiné de violet, lame de cristal dentelée, œil corrompu
    void(ctx, W) {
        shaft(ctx, W, 96, 8.5, ['#6b4a9c', '#2a1745', '#120822']);
        // Veines lumineuses
        ctx.beginPath();
        ctx.moveTo(30, 1);
        ctx.quadraticCurveTo(44, -2.5, 56, 1);
        ctx.quadraticCurveTo(68, 3.5, 82, 0);
        ctx.strokeStyle = 'rgba(214, 140, 255, 0.85)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        // Nœuds d'os à épines
        for (const x of [42, 64]) {
            ctx.beginPath();
            ctx.moveTo(x - 4, -4);
            ctx.lineTo(x, -12);
            ctx.lineTo(x + 3, -4);
            ctx.closePath();
            ink(ctx, '#3b1d5c', W * 0.6);
            circle(ctx, x, 0, 5.2);
            ink(ctx, orb(ctx, x, 0, 5.2, ['#7a52b3', '#3b1d5c', '#1a0c2c']), W * 0.6);
        }
        grip(ctx, W, ['#3b1d5c', '#1e102f', '#0b0515'], 'rgba(176, 76, 255, 0.5)');
        // Pommeau : éclat de cristal
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(-11, 0);
        ctx.lineTo(0, 6);
        ctx.closePath();
        ink(ctx, lin(ctx, -11, 0, 0, 0, ['#f0c2ff', '#a855f7', '#4c1d95']), W);

        const blade = () => {
            ctx.beginPath();
            ctx.moveTo(78, -6);
            ctx.bezierCurveTo(101, -16, 99, -50, 33, -59);
            ctx.lineTo(52, -50);
            ctx.lineTo(56, -44);
            ctx.lineTo(65, -43);
            ctx.lineTo(68, -35);
            ctx.lineTo(76, -31);
            ctx.lineTo(76, -21);
            ctx.lineTo(72, -8);
            ctx.closePath();
        };
        // Aura sombre
        blade();
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = W * 3.2;
        ctx.stroke();
        ctx.restore();
        // Lame de cristal + facettes
        blade();
        ink(ctx, lin(ctx, 34, -58, 96, -2, ['#f5d6ff', '#c06bff', '#7a24c9', '#3b0d6b']), W);
        ctx.beginPath();
        ctx.moveTo(86, -10);
        ctx.lineTo(62, -50);
        ctx.moveTo(92, -22);
        ctx.lineTo(76, -50);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(84, -12);
        ctx.bezierCurveTo(94, -22, 90, -44, 50, -54);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Éclats de cristal (côté opposé)
        for (const [ax, tipX, tipY, bx] of [[78, 82, 30, 88], [88, 102, 22, 96]]) {
            ctx.beginPath();
            ctx.moveTo(ax, 6);
            ctx.lineTo(tipX, tipY);
            ctx.lineTo(bx, 6);
            ctx.closePath();
            ink(ctx, lin(ctx, ax, 6, tipX, tipY, ['#c06bff', '#6d1fb0', '#2e0a57']), W);
        }

        // Œil corrompu
        ctx.beginPath();
        ctx.ellipse(86, 0, 10, 7, 0, 0, TAU);
        ink(ctx, '#180e29', W);
        circle(ctx, 86, 0, 4.2);
        ctx.fillStyle = orb(ctx, 86, 0, 4.2, ['#ffe6ff', '#df70ff', '#7a24c9']);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(86, 0, 1.1, 3.4, 0, 0, TAU);
        ctx.fillStyle = '#180e29';
        ctx.fill();
    },

    // Sucre d'Orge Piquant : torsade rouge et blanche, poignée menthe, nœud vert
    candy(ctx, W) {
        const stripes = (x0, x1, y0, y1, step, tilt, width) => {
            ctx.beginPath();
            for (let x = x0; x <= x1; x += step) {
                ctx.moveTo(x, y0);
                ctx.lineTo(x + tilt, y1);
            }
            ctx.strokeStyle = '#ef2b3c';
            ctx.lineWidth = width;
            ctx.stroke();
        };

        // Manche torsadé
        rr(ctx, 0, -4.8, 100, 9.6, 4.8);
        ctx.fillStyle = lin(ctx, 0, -4.8, 0, 4.8, ['#ffffff', '#f8fafc', '#cbd5e1']);
        ctx.fill();
        ctx.save();
        ctx.clip();
        stripes(-10, 104, -6, 6, 10, 9, 4.2);
        ctx.restore();
        rr(ctx, 0, -4.8, 100, 9.6, 4.8);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = W;
        ctx.stroke();
        gloss(ctx, 32, -2.2, 94, -2.2, 1.6, 0.6);

        grip(ctx, W, ['#a7f3d0', '#10b981', '#046c4e'], 'rgba(255, 255, 255, 0.6)');
        // Pommeau : bonbon rond
        circle(ctx, -4, 0, 7);
        ink(ctx, orb(ctx, -4, 0, 7, ['#ffe4ef', '#ff7eb6', '#d61f69']), W);
        ctx.beginPath();
        ctx.arc(-4, 0, 3.6, 0.4, 4.6);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Tête en sucre d'orge (rayures dans la forme, puis contour)
        crescent(ctx);
        ctx.fillStyle = lin(ctx, 62, 0, 98, 0, ['#e2e8f0', '#ffffff', '#f1f5f9']);
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        for (let y = -76; y <= 60; y += 13) {
            ctx.moveTo(56, y);
            ctx.lineTo(104, y + 26);
        }
        ctx.strokeStyle = '#ef2b3c';
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.restore();
        crescent(ctx);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = W;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(67, -43);
        ctx.quadraticCurveTo(87, -29, 93, -9);
        ctx.moveTo(67, 43);
        ctx.quadraticCurveTo(87, 29, 93, 9);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        // Nœud vert menthe
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(88, 0);
            ctx.quadraticCurveTo(76, 14 * s, 80, 17 * s);
            ctx.quadraticCurveTo(88, 19 * s, 97, 16 * s);
            ctx.quadraticCurveTo(100, 12 * s, 88, 0);
            ctx.closePath();
            ink(ctx, lin(ctx, 0, 0, 0, 18 * s, ['#6ee7b7', '#10b981', '#047857']), W * 0.8);
        }
        circle(ctx, 88, 0, 5);
        ink(ctx, orb(ctx, 88, 0, 5, ['#d1fae5', '#34d399', '#047857']), W * 0.8);
    }
};

/*
   Dessine la pioche dans le repère courant : poignée en x = 0, tête vers +x.
   L  = longueur voulue du manche (unités du repère courant),
   lw = épaisseur du contour (unités du repère courant).
*/
export function drawPickaxeArt(ctx, skin, L = 100, lw = 2.5) {
    const k = L / 100;
    ctx.save();
    ctx.scale(k, k);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    DRAW[pickaxeMotif(skin)](ctx, lw / k);
    ctx.restore();
}

/* ===================== ICÔNES (hotbar, casier) ===================== */

const canvasCache = new Map();
const urlCache = new Map();

/*
   Icône carrée de la pioche, inclinée (tête en haut à droite) et cadrée au plus juste :
   le dessin est fait en grand sur une toile temporaire, puis recadré sur ses pixels.
   pad = part de la case occupée par le dessin.
*/
export function pickaxeCanvas(skin, size = 96, pad = 0.88) {
    const motif = pickaxeMotif(skin);
    const key = `${motif}|${size}|${pad}`;
    const cached = canvasCache.get(key);
    if (cached) return cached;
    if (typeof document === 'undefined') return null;

    const sc = Math.max(1.5, size / 110);
    const S = Math.ceil(250 * sc);
    const tmp = document.createElement('canvas');
    tmp.width = S;
    tmp.height = S;
    const t = tmp.getContext('2d');
    t.translate(S / 2, S / 2);
    t.scale(sc, sc);
    t.rotate(-0.75);
    t.translate(-50, 0);
    drawPickaxeArt(t, motif, 100, 4.6);

    // Cadre réel du dessin (pixels non transparents)
    const data = t.getImageData(0, 0, S, S).data;
    let x0 = S; let y0 = S; let x1 = -1; let y1 = -1;
    for (let y = 0; y < S; y++) {
        const row = y * S * 4;
        for (let x = 0; x < S; x++) {
            if (data[row + x * 4 + 3] > 10) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
    }

    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    if (x1 >= x0) {
        const c = cv.getContext('2d');
        const bw = x1 - x0 + 1;
        const bh = y1 - y0 + 1;
        const k = (size * pad) / Math.max(bw, bh);
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(tmp, x0, y0, bw, bh, (size - bw * k) / 2, (size - bh * k) / 2, bw * k, bh * k);
    }
    canvasCache.set(key, cv);
    return cv;
}

// Même icône en image (data URL PNG)
export function pickaxeUrl(skin, size = 96, pad = 0.88) {
    const key = `${pickaxeMotif(skin)}|${size}|${pad}`;
    const cached = urlCache.get(key);
    if (cached) return cached;
    const cv = pickaxeCanvas(skin, size, pad);
    const url = cv ? cv.toDataURL('image/png') : '';
    urlCache.set(key, url);
    return url;
}
