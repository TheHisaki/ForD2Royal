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
    'pioche-bonbon': 'candy',
    'pioche-pelle': 'shovel',
    'pioche-guitare': 'guitar',
    'pioche-trident': 'trident',
    'pioche-orage': 'hammer',
    'pioche-phenix': 'phoenix'
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
    },

    /* ----- Nouvelles pioches : une par rareté, de plus en plus travaillées ----- */

    // Pelle de Plage (commun) : plastique jaune et bleu, poignée en T, sable et étoile de mer
    shovel(ctx, W) {
        shaft(ctx, W, 84, 8, ['#fff1a8', '#ffcc33', '#c98a12']);
        rr(ctx, -8, -15, 10, 30, 5);
        ink(ctx, lin(ctx, 0, -15, 0, 15, ['#a5e3ff', '#3a8dff', '#1d4f9e']), W);
        rr(ctx, 76, -8, 12, 16, 4);
        ink(ctx, lin(ctx, 0, -8, 0, 8, ['#a5e3ff', '#3a8dff', '#1d4f9e']), W);
        // Lame arrondie
        ctx.beginPath();
        ctx.moveTo(84, -13);
        ctx.quadraticCurveTo(92, -20, 102, -19);
        ctx.quadraticCurveTo(116, -14, 124, 0);
        ctx.quadraticCurveTo(116, 14, 102, 19);
        ctx.quadraticCurveTo(92, 20, 84, 13);
        ctx.closePath();
        ink(ctx, lin(ctx, 84, -20, 84, 20, ['#a5e3ff', '#3a8dff', '#1d4f9e']), W);
        ctx.beginPath();
        ctx.moveTo(88, 0);
        ctx.lineTo(112, 0);
        ctx.strokeStyle = 'rgba(10, 16, 48, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        gloss(ctx, 90, -12, 108, -14, 2, 0.6);
        // Sable collé
        ctx.fillStyle = '#f5d78e';
        for (const [x, y] of [[104, 9], [110, 12], [98, 13], [113, 5], [106, 15]]) {
            circle(ctx, x, y, 1.7);
            ctx.fill();
        }
        // Autocollant étoile de mer
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i / 10) * TAU;
            const rad = i % 2 ? 2.6 : 6.2;
            const x = 100 + Math.cos(a) * rad;
            const y = -6 + Math.sin(a) * rad;
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ink(ctx, '#ff8a3d', W * 0.5);
        circle(ctx, 100, -6, 1.2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    },

    // Gratte Électrique (peu commun) : guitare en V, manche à frettes, cordes, éclair sur le corps
    guitar(ctx, W) {
        // Tête du manche (côté poignée) + mécaniques
        ctx.beginPath();
        ctx.moveTo(-16, -9);
        ctx.lineTo(4, -6);
        ctx.lineTo(4, 6);
        ctx.lineTo(-16, 9);
        ctx.lineTo(-20, 0);
        ctx.closePath();
        ink(ctx, lin(ctx, 0, -9, 0, 9, ['#3a2a3f', '#1c1426', '#0b0712']), W);
        for (const x of [-13, -7, -1]) {
            for (const s of [-1, 1]) {
                circle(ctx, x, s * 10.5, 2.4);
                ink(ctx, '#dfe5ee', W * 0.5);
            }
        }
        // Manche + frettes + repères
        rr(ctx, 2, -5, 72, 10, 3);
        ink(ctx, lin(ctx, 0, -5, 0, 5, ['#8a5a32', '#5a3419', '#2e1a0c']), W);
        ctx.beginPath();
        for (let x = 12; x <= 70; x += 8) {
            ctx.moveTo(x, -4.4);
            ctx.lineTo(x, 4.4);
        }
        ctx.strokeStyle = '#c9d2dd';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (const x of [24, 40, 56]) {
            circle(ctx, x, 0, 1.3);
            ctx.fill();
        }
        // Corps en V
        ctx.beginPath();
        ctx.moveTo(70, -7);
        ctx.lineTo(110, -40);
        ctx.quadraticCurveTo(118, -38, 114, -29);
        ctx.lineTo(90, 0);
        ctx.lineTo(114, 29);
        ctx.quadraticCurveTo(118, 38, 110, 40);
        ctx.lineTo(70, 7);
        ctx.quadraticCurveTo(64, 0, 70, -7);
        ctx.closePath();
        ink(ctx, lin(ctx, 66, -40, 116, 40, ['#ff8a8a', '#e8323c', '#8f1420']), W);
        gloss(ctx, 76, -11, 104, -34, 2, 0.5);
        // Plaque blanche, micros, chevalet
        ctx.beginPath();
        ctx.moveTo(74, -5);
        ctx.lineTo(96, -21);
        ctx.lineTo(86, -3);
        ctx.lineTo(86, 3);
        ctx.lineTo(96, 21);
        ctx.lineTo(74, 5);
        ctx.closePath();
        ink(ctx, '#f4f6fb', W * 0.6);
        for (const x of [75, 80]) {
            rr(ctx, x, -5, 4, 10, 1.2);
            ink(ctx, '#1c1426', W * 0.4);
        }
        rr(ctx, 84, -5, 3.5, 10, 1);
        ink(ctx, '#c9d2dd', W * 0.4);
        // Cordes
        ctx.beginPath();
        for (const y of [-3, -1, 1, 3]) {
            ctx.moveTo(-14, y * 1.6);
            ctx.lineTo(86, y);
        }
        ctx.strokeStyle = 'rgba(240, 244, 250, 0.85)';
        ctx.lineWidth = 0.7;
        ctx.stroke();
        // Boutons dorés + éclair sur la branche du bas
        for (const [x, y] of [[100, -27], [105, -32]]) {
            circle(ctx, x, y, 2.6);
            ink(ctx, orb(ctx, x, y, 2.6, ['#fff6c8', '#ffcc33', '#9c6a0c']), W * 0.45);
        }
        ctx.beginPath();
        ctx.moveTo(96, 14);
        ctx.lineTo(104, 22);
        ctx.lineTo(100, 23);
        ctx.lineTo(108, 33);
        ctx.lineTo(97, 24);
        ctx.lineTo(101, 23);
        ctx.closePath();
        ink(ctx, '#ffe03d', W * 0.45);
    },

    // Trident des Abysses (rare) : bronze patiné, algue enroulée, corail, perle qui scintille,
    // bulles qui remontent des pointes
    trident(ctx, W, t) {
        shaft(ctx, W, 84, 8, ['#7fe0d2', '#2a9d8f', '#0f4c45']);
        // Algue enroulée autour du manche
        ctx.beginPath();
        for (let x = 30; x <= 76; x += 2) {
            const y = Math.sin(x * 0.35) * 4.6;
            if (x === 30) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 4.6;
        ctx.stroke();
        ctx.strokeStyle = '#3fbf4a';
        ctx.lineWidth = 2.4;
        ctx.stroke();
        // Corail rose sur le manche
        const coral = (pts) => {
            ctx.beginPath();
            ctx.moveTo(pts[0], pts[1]);
            for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 4.4;
            ctx.stroke();
            ctx.strokeStyle = '#ff7a9a';
            ctx.lineWidth = 2.4;
            ctx.stroke();
        };
        coral([60, -3, 56, -11, 52, -15]);
        coral([56, -11, 60, -17]);
        coral([66, 3, 69, 10]);
        grip(ctx, W, ['#e9c46a', '#b07a10', '#5c3d05'], 'rgba(255, 255, 255, 0.35)');
        // Pommeau : coquillage
        ctx.beginPath();
        ctx.moveTo(-2, -8);
        ctx.quadraticCurveTo(-17, -9, -17, 0);
        ctx.quadraticCurveTo(-17, 9, -2, 8);
        ctx.closePath();
        ink(ctx, lin(ctx, -17, 0, -2, 0, ['#ffd6e4', '#ff9fbf', '#d9668f']), W);
        ctx.beginPath();
        for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
            ctx.moveTo(-2, 0);
            ctx.lineTo(-2 - Math.cos(a) * 13, Math.sin(a) * 8);
        }
        ctx.strokeStyle = 'rgba(122, 30, 70, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        const bronze = (x0, y0, x1, y1) => lin(ctx, x0, y0, x1, y1, ['#f6e3a1', '#d4a537', '#7a5410']);
        // Dents latérales (crochets)
        for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(82, 5 * s);
            ctx.quadraticCurveTo(84, 26 * s, 100, 27 * s);
            ctx.lineTo(108, 24 * s);
            ctx.lineTo(121, 31 * s);
            ctx.lineTo(106, 34 * s);
            ctx.quadraticCurveTo(80, 35 * s, 77, 6 * s);
            ctx.closePath();
            ink(ctx, bronze(80, 0, 120, 34 * s), W);
        }
        // Dent centrale
        rr(ctx, 84, -4.5, 26, 9, 3);
        ink(ctx, bronze(84, -4.5, 84, 4.5), W);
        ctx.beginPath();
        ctx.moveTo(108, -5);
        ctx.lineTo(112, -10);
        ctx.lineTo(129, 0);
        ctx.lineTo(112, 10);
        ctx.lineTo(108, 5);
        ctx.closePath();
        ink(ctx, bronze(108, -10, 129, 10), W);
        gloss(ctx, 112, -2.5, 124, -1, 1.6, 0.7);
        // Taches de patine
        ctx.fillStyle = 'rgba(79, 209, 197, 0.7)';
        for (const [x, y, rad] of [[92, 22, 2.4], [99, -29, 2], [114, 2.5, 1.6], [88, -16, 1.8]]) {
            circle(ctx, x, y, rad);
            ctx.fill();
        }
        // Moyeu + perle (reflet qui tourne)
        rr(ctx, 74, -10, 16, 20, 5);
        ink(ctx, bronze(74, -10, 74, 10), W);
        circle(ctx, 82, 0, 5.6);
        ink(ctx, orb(ctx, 82, 0, 5.6, ['#ffffff', '#ffe1f0', '#c47aa6']), W * 0.6);
        circle(ctx, 82 + Math.cos(t * 2) * 1.8, -1.4 + Math.sin(t * 2) * 1.2, 1.5);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        // Bulles qui remontent des pointes
        const ga = ctx.globalAlpha;
        for (let k = 0; k < 3; k++) {
            const ph = (t * 0.9 + k / 3) % 1;
            const [bx, by] = [[128, 0], [120, -31], [120, 31]][k];
            ctx.globalAlpha = ga * (1 - ph);
            circle(ctx, bx + ph * 12, by + Math.sin(ph * 6 + k) * 3, 2.4 * (1 - ph * 0.3));
            ctx.strokeStyle = '#bff4ff';
            ctx.lineWidth = 1.3;
            ctx.stroke();
        }
        ctx.globalAlpha = ga;
    },

    // Marteau de l'Orage (épique) : bloc d'acier cerclé d'or, runes qui pulsent, éclairs qui
    // crépitent autour de la tête, pique et pommeau à anneau
    hammer(ctx, W, t) {
        const pulse = 0.6 + 0.4 * Math.sin(t * 5);
        shaft(ctx, W, 80, 10, ['#9aa6b8', '#4e566b', '#232838']);
        for (const x of [40, 58]) {
            rr(ctx, x, -6, 4.4, 12, 1.5);
            ink(ctx, lin(ctx, 0, -6, 0, 6, ['#fff1a8', '#ffcc33', '#b07a10']), W * 0.6);
        }
        grip(ctx, W, ['#8a5a32', '#5a3419', '#2e1a0c'], 'rgba(255, 214, 170, 0.35)');
        // Pommeau à anneau
        circle(ctx, -8, 0, 6.5);
        ctx.strokeStyle = OUTLINE;
        ctx.lineWidth = 5.6;
        ctx.stroke();
        ctx.strokeStyle = '#ffcc33';
        ctx.lineWidth = 2.6;
        ctx.stroke();
        rr(ctx, -4, -5, 6, 10, 2);
        ink(ctx, lin(ctx, 0, -5, 0, 5, ['#cbd5e1', '#7c879b', '#3a4252']), W);
        // Lueur électrique autour de la tête
        rr(ctx, 70, -38, 38, 76, 10);
        ctx.save();
        ctx.globalAlpha = 0.18 + 0.2 * pulse;
        ctx.strokeStyle = '#7fe8ff';
        ctx.lineWidth = W * 4;
        ctx.stroke();
        ctx.restore();
        // Pique sur le dessus
        ctx.beginPath();
        ctx.moveTo(104, -9);
        ctx.lineTo(122, 0);
        ctx.lineTo(104, 9);
        ctx.closePath();
        ink(ctx, lin(ctx, 104, -9, 104, 9, ['#f1f5f9', '#9aa6b8', '#4e566b']), W);
        // Bloc d'acier + 2 embouts dorés
        rr(ctx, 70, -34, 38, 68, 8);
        ink(ctx, lin(ctx, 70, 0, 108, 0, ['#5b6680', '#c9d2dd', '#f1f5f9', '#8d97a8']), W);
        for (const s of [-1, 1]) {
            rr(ctx, 66, s > 0 ? 26 : -40, 46, 14, 5);
            ink(ctx, lin(ctx, 0, s > 0 ? 26 : -40, 0, s > 0 ? 40 : -26, ['#fff1a8', '#ffcc33', '#9c6a0c']), W);
            ctx.fillStyle = '#4fe8ff';
            for (const x of [76, 89, 102]) {
                circle(ctx, x, s * 33, 1.8);
                ctx.fill();
            }
        }
        gloss(ctx, 76, -22, 76, 20, 2.2, 0.55);
        // Runes lumineuses
        ctx.save();
        ctx.globalAlpha = 0.55 + 0.45 * pulse;
        ctx.shadowColor = '#4fe8ff';
        ctx.shadowBlur = 8 * pulse;
        ctx.beginPath();
        ctx.moveTo(93, -18);
        ctx.lineTo(84, -2);
        ctx.lineTo(94, -2);
        ctx.lineTo(85, 17);
        ctx.moveTo(78, -16);
        ctx.lineTo(78, -8);
        ctx.moveTo(75, -12);
        ctx.lineTo(81, -12);
        ctx.moveTo(101, 6);
        ctx.lineTo(97, 14);
        ctx.lineTo(102, 14);
        ctx.strokeStyle = '#4fe8ff';
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.restore();
        // Éclairs : nouveau tracé 12 fois par seconde, du bord de la tête vers l'extérieur
        const tick = Math.floor(t * 12);
        for (let k = 0; k < 2; k++) {
            const rnd = (i) => {
                const v = Math.sin((tick + k * 7.3) * 12.9898 + i * 78.233) * 43758.5453;
                return v - Math.floor(v);
            };
            const a = rnd(0) * TAU;
            const sx = 89 + Math.cos(a) * 22;
            const sy = Math.sin(a) * 36;
            const ex = 89 + Math.cos(a) * 44;
            const ey = Math.sin(a) * 58;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            for (let i = 1; i <= 4; i++) {
                const u = i / 4;
                ctx.lineTo(sx + (ex - sx) * u + (rnd(i) - 0.5) * 12, sy + (ey - sy) * u + (rnd(i + 5) - 0.5) * 12);
            }
            ctx.strokeStyle = 'rgba(79, 232, 255, 0.7)';
            ctx.lineWidth = 3.2;
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2;
            ctx.stroke();
        }
    },

    // Serre du Phénix (légendaire) : manche doré gravé de flammes, 3 plumes-lames de feu de chaque
    // côté, flammes au bout des plumes, soleil central qui tourne, braises en orbite
    phoenix(ctx, W, t) {
        const flick = 0.75 + 0.25 * Math.sin(t * 9) * Math.sin(t * 5.3);
        shaft(ctx, W, 94, 9, ['#fff1a8', '#e0a52a', '#8f5f08']);
        ctx.beginPath();
        ctx.moveTo(32, 0);
        for (let x = 32; x <= 84; x += 4) ctx.lineTo(x, Math.sin(x * 0.45) * 2.4);
        ctx.strokeStyle = 'rgba(200, 30, 40, 0.65)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        grip(ctx, W, ['#d6333d', '#7a1a20', '#3d0a0e'], 'rgba(255, 210, 74, 0.6)');
        // Pommeau : plume de queue
        ctx.beginPath();
        ctx.moveTo(0, -3.5);
        ctx.quadraticCurveTo(-11, -11, -24, 0);
        ctx.quadraticCurveTo(-11, 11, 0, 3.5);
        ctx.closePath();
        ink(ctx, lin(ctx, -24, 0, 0, 0, ['#ffe03d', '#ff6a1f', '#b3262e']), W);
        ctx.beginPath();
        ctx.moveTo(-2, 0);
        ctx.lineTo(-20, 0);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // Halo de chaleur
        circle(ctx, 90, 0, 30);
        ctx.save();
        ctx.globalAlpha = 0.18 * flick;
        ctx.fillStyle = '#ffb21f';
        ctx.fill();
        ctx.restore();
        // Plumes-lames (de la plus en arrière à la plus en avant)
        for (const s of [-1, 1]) {
            for (let k = 2; k >= 0; k--) {
                const ang = s * (Math.PI / 2 - 0.75 + k * 0.32);
                const len = 54 - k * 7;
                const w = 17 - k * 2.5;
                const b = -s;
                ctx.save();
                ctx.translate(90, 0);
                ctx.rotate(ang);
                const tipY = b * len * 0.22;
                // Flamme au bout (vacille)
                const fl = 10 * flick + k * 2;
                ctx.beginPath();
                ctx.moveTo(len - 4, tipY - 4);
                ctx.quadraticCurveTo(len + fl * 0.6, tipY - 6, len + fl, tipY + b * 2);
                ctx.quadraticCurveTo(len + fl * 0.5, tipY + 5, len - 4, tipY + 4);
                ctx.closePath();
                ctx.fillStyle = 'rgba(255, 224, 61, 0.85)';
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(0, -w * 0.5);
                ctx.quadraticCurveTo(len * 0.55, -w * 0.95 + b * len * 0.12, len, tipY);
                ctx.quadraticCurveTo(len * 0.6, w * 0.95 + b * len * 0.08, 0, w * 0.5);
                ctx.closePath();
                ink(ctx, lin(ctx, 0, 0, len, 0, k === 0 ? ['#7a1a20', '#e8323c', '#ff8a1f', '#ffe03d'] : ['#8f1420', '#ff6a1f', '#ffb21f']), W);
                // Barbes de la plume
                ctx.beginPath();
                for (let i = 1; i <= 4; i++) {
                    const x = (len * i) / 5;
                    const yMid = b * len * 0.22 * (x / len) ** 2;
                    ctx.moveTo(x, yMid);
                    ctx.lineTo(x + 5, yMid - w * 0.4);
                    ctx.moveTo(x, yMid);
                    ctx.lineTo(x + 5, yMid + w * 0.4);
                }
                ctx.strokeStyle = 'rgba(80, 10, 10, 0.4)';
                ctx.lineWidth = 1.1;
                ctx.stroke();
                // Tranchant brillant
                ctx.beginPath();
                ctx.moveTo(len * 0.15, -w * 0.4);
                ctx.quadraticCurveTo(len * 0.55, -w * 0.75 + b * len * 0.12, len * 0.92, tipY * 0.95);
                ctx.strokeStyle = 'rgba(255, 246, 200, 0.75)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.restore();
            }
        }
        // Soleil : couronne de rayons qui tourne + gemme
        ctx.save();
        ctx.translate(90, 0);
        ctx.rotate(t * 1.5);
        ctx.beginPath();
        for (let i = 0; i < 24; i++) {
            const a = (i / 24) * TAU;
            const rad = i % 2 ? 11 : 17;
            if (i) ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
            else ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        ctx.closePath();
        ink(ctx, lin(ctx, -17, -17, 17, 17, ['#fff6c8', '#ffcc33', '#c27a0c']), W * 0.8);
        ctx.restore();
        circle(ctx, 90, 0, 9.5);
        ink(ctx, orb(ctx, 90, 0, 9.5, ['#ffffff', '#ffe03d', '#ff6a1f', '#b3262e']), W);
        circle(ctx, 87, -3, 2.4);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        // Braises en orbite
        const ga = ctx.globalAlpha;
        for (let k = 0; k < 4; k++) {
            const a = t * 2.4 + (k / 4) * TAU;
            ctx.globalAlpha = ga * (0.5 + 0.5 * Math.sin(t * 7 + k * 2));
            circle(ctx, 90 + Math.cos(a) * 26, Math.sin(a) * 18, 2);
            ctx.fillStyle = '#ffe03d';
            ctx.fill();
        }
        ctx.globalAlpha = ga;
    }
};

/*
   Dessine la pioche dans le repère courant : poignée en x = 0, tête vers +x.
   L  = longueur voulue du manche (unités du repère courant),
   lw = épaisseur du contour (unités du repère courant).
*/
// t = temps en secondes (animations des pioches rares : éclairs, flammes, bulles).
// Par défaut l'horloge de la page, pour la pioche en main ; les icônes passent t = 0.
export function drawPickaxeArt(ctx, skin, L = 100, lw = 2.5, t = clock()) {
    const k = L / 100;
    ctx.save();
    ctx.scale(k, k);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    DRAW[pickaxeMotif(skin)](ctx, lw / k, t);
    ctx.restore();
}

function clock() {
    return typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
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
    drawPickaxeArt(t, motif, 100, 4.6, 0);

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
