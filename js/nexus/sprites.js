/* ==================================
   NEXUS - STYLE DES HÉROS (vue de dessus)
   Chaque héros est dessiné au canvas, tourné vers +x (angle 0 = droite),
   avec un contour sombre épais comme le reste du jeu.
   La même fonction sert aux portraits, à la vitrine et à la carte.
   ================================== */

const INK = '#0b1430';
const TAU = Math.PI * 2;

export const TEAM_COLORS = { blue: '#38bdf8', red: '#f43f5e' };

// Rayon de collision / taille visuelle de chaque héros (unités du monde)
export const HERO_RADIUS = { gorvald: 30, volta: 30, zephyr: 17, kraz: 19, seraphine: 18, tempo: 18 };

function circle(ctx, x, y, r, fill, stroke = INK, lw = 3) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function ellipse(ctx, x, y, rx, ry, fill, stroke = INK, lw = 3, rot = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function rrect(ctx, x, y, w, h, r, fill, stroke = INK, lw = 3) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); }
}

function line(ctx, ax, ay, bx, by, color, lw) {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineCap = 'round';
    ctx.lineWidth = lw;
    ctx.strokeStyle = color;
    ctx.stroke();
}

function glow(ctx, x, y, r, color, alpha = 0.6) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
}

// Cheveux en pointes autour d'une tête (étoile irrégulière)
function spikyHair(ctx, x, y, r, spikes, color, tip = null, back = 0.6) {
    ctx.beginPath();
    for (let i = 0; i <= spikes * 2; i++) {
        const a = (i / (spikes * 2)) * TAU;
        // Les pointes sont plus longues vers l'arrière de la tête
        const rear = 0.5 + 0.5 * Math.max(0, -Math.cos(a));
        const rr = i % 2 === 0 ? r * (1.25 + back * rear) : r * 0.92;
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    if (tip) {
        for (let i = 0; i < spikes; i++) {
            const a = ((i * 2) / (spikes * 2)) * TAU;
            const rear = 0.5 + 0.5 * Math.max(0, -Math.cos(a));
            const rr = r * (1.25 + back * rear);
            circle(ctx, x + Math.cos(a) * rr * 0.9, y + Math.sin(a) * rr * 0.9, r * 0.16, tip, null);
        }
    }
}

/* ----- Héros ----- */

// GORVALD (inspiré de Reinhardt) : chevalier massif, cape rouge, marteau-fusée
function drawGorvald(ctx, s) {
    // Cape
    ctx.beginPath();
    ctx.moveTo(-6, -22);
    ctx.quadraticCurveTo(-36, -30, -42, -4);
    ctx.quadraticCurveTo(-46, 0, -42, 4);
    ctx.quadraticCurveTo(-36, 30, -6, 22);
    ctx.closePath();
    ctx.fillStyle = '#b3262f';
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    line(ctx, -14, -16, -36, -12, 'rgba(0,0,0,0.25)', 3);
    line(ctx, -14, 16, -36, 12, 'rgba(0,0,0,0.25)', 3);

    // Manche du marteau (main droite) puis tête
    line(ctx, -6, 27, 46, 27, INK, 9);
    line(ctx, -6, 27, 46, 27, '#6b4a2b', 5);
    rrect(ctx, 40, 10, 22, 34, 4, '#7b8696');
    rrect(ctx, 47, 10, 6, 34, 1, '#c9a227', INK, 2);
    // Réacteur du marteau, qui s'allume en charge
    rrect(ctx, 44, 44, 14, 8, 2, '#3a404c', INK, 2);
    if (s.moving) glow(ctx, 51, 54, 12, '#ff9a3c', 0.7);

    // Corps en armure
    ellipse(ctx, 0, 0, 21, 25, '#8c97a8');
    line(ctx, -14, 0, 16, 0, 'rgba(255,255,255,0.18)', 4);
    // Épaulières
    for (const side of [-1, 1]) {
        circle(ctx, 2, side * 24, 13, '#a9b4c2');
        circle(ctx, 2, side * 24, 7, '#c9a227', INK, 2);
    }
    // Gantelet gauche
    circle(ctx, 18, -22, 7, '#a9b4c2');
    // Casque, visière, cimier
    circle(ctx, 5, 0, 14, '#c3ccd8');
    rrect(ctx, 12, -8, 6, 16, 2, '#1d2433', null);
    line(ctx, -10, 0, 7, 0, INK, 8);
    line(ctx, -10, 0, 7, 0, '#d6333d', 4.5);
}

// VOLTA (inspirée de D.Va) : méca rose, deux canons, pilote dans le cockpit
function drawVolta(ctx, s) {
    // Propulseurs
    for (const side of [-1, 1]) {
        if (s.moving) glow(ctx, -36, side * 11, 16, '#ffb03a', 0.8);
        rrect(ctx, -34, side * 11 - 6, 10, 12, 3, '#4a4e5c', INK, 2);
    }
    // Pieds
    for (const side of [-1, 1]) rrect(ctx, -30, side * 19 - 8, 20, 16, 6, '#e8e8f0');
    // Bras-canons
    for (const side of [-1, 1]) {
        const y = side * 30 - 7;
        rrect(ctx, 2, y, 38, 14, 5, '#5c6070');
        rrect(ctx, 32, y - 1, 10, 16, 3, '#ff6fb5', INK, 2);
        circle(ctx, 44, side * 30, 4.5, '#7ff6ff', INK, 2);
        glow(ctx, 46, side * 30, 10, '#7ff6ff', 0.55);
    }
    // Châssis
    rrect(ctx, -24, -27, 48, 54, 18, '#ff6fb5');
    rrect(ctx, -18, -17, 30, 34, 10, '#fff4fa', INK, 2.5);
    // Logo lapin
    ellipse(ctx, -11, -4, 5, 2.2, '#ff6fb5', null, 0, -0.3);
    ellipse(ctx, -11, 4, 5, 2.2, '#ff6fb5', null, 0, 0.3);
    circle(ctx, -5, 0, 5, '#ff6fb5', null);
    // Bandes vertes du méca
    line(ctx, 18, -20, 18, 20, '#57e3a1', 3);
    // Cockpit et pilote
    circle(ctx, 12, 0, 10, '#7fd8ff');
    circle(ctx, 12, 0, 6.5, '#5a3a22', INK, 2);
    line(ctx, 12, -6.5, 12, 6.5, '#ff6fb5', 2.5);
    circle(ctx, 15, -3, 2, 'rgba(255,255,255,0.7)', null);
}

// ZÉPHYR (inspirée de Tracer) : petite, rapide, accélérateur chronal bleu
function drawZephyr(ctx, s) {
    // Traînée temporelle quand elle bouge
    if (s.moving) {
        ctx.save();
        for (let i = 0; i < 3; i++) {
            ctx.globalAlpha = 0.35 - i * 0.1;
            line(ctx, -12 - i * 6, -8 + i * 3, -34 - i * 8, -9 + i * 3, '#5ff3ff', 4 - i);
            line(ctx, -12 - i * 6, 8 - i * 3, -34 - i * 8, 9 - i * 3, '#5ff3ff', 4 - i);
        }
        ctx.restore();
    }
    // Jambes (leggings orange)
    for (const side of [-1, 1]) ellipse(ctx, -8, side * 7, 6, 4.5, '#ff9a1f', INK, 2.5);
    // Bras + pistolets
    for (const side of [-1, 1]) {
        line(ctx, 2, side * 11, 17, side * 9, INK, 7);
        line(ctx, 2, side * 11, 17, side * 9, '#f1c7a3', 4);
        rrect(ctx, 15, side * 9 - 3.5, 13, 7, 2, '#2b2f3a', INK, 2);
        circle(ctx, 28, side * 9, 2.2, '#5ff3ff', null);
    }
    // Blouson d'aviatrice
    ellipse(ctx, 0, 0, 12, 14, '#8a5a33');
    line(ctx, -4, -12, -4, 12, 'rgba(255,255,255,0.18)', 3);
    // Accélérateur chronal (harnais lumineux)
    glow(ctx, 6, 0, 18, '#5ff3ff', 0.55 + 0.2 * Math.sin(s.t * 6));
    circle(ctx, 6, 0, 7.5, '#0e2a44', INK, 2.5);
    circle(ctx, 6, 0, 4.5, '#5ff3ff', null);
    // Tête : cheveux en pointes + lunettes orange
    spikyHair(ctx, -3, 0, 7.5, 7, '#3b2416');
    rrect(ctx, 2, -6, 4, 12, 2, '#ff9a1f', INK, 2);
}

// KRAZ (inspiré de Chacal / Junkrat) : ferrailleur, pneu dans le dos, lance-grenades
function drawKraz(ctx, s) {
    // Pneu dans le dos
    circle(ctx, -15, 0, 13, null, INK, 9);
    circle(ctx, -15, 0, 13, null, '#2a2a2e', 5.5);
    circle(ctx, -15, 0, 5, '#6d6d72', INK, 2);
    // Lance-grenades (tambour + canon) tenu devant
    line(ctx, 4, 12, 18, 8, INK, 7);
    line(ctx, 4, 12, 18, 8, '#d99a6c', 4);
    rrect(ctx, 20, 1, 24, 9, 2, '#4b4b4b', INK, 2.5);
    circle(ctx, 18, 7, 9, '#7a5a2b');
    circle(ctx, 18, 7, 3, '#f2c14e', INK, 1.5);
    // Bras gauche
    line(ctx, 2, -12, 16, -6, INK, 7);
    line(ctx, 2, -12, 16, -6, '#d99a6c', 4);
    // Corps torse nu + bandoulière de grenades
    ellipse(ctx, 0, 0, 12, 15, '#d99a6c');
    line(ctx, -8, -11, 8, 11, '#5b3b1f', 4);
    for (let i = -1; i <= 1; i++) circle(ctx, i * 5, i * 7, 2.8, '#59703c', INK, 1.5);
    // Bombe allumée à la ceinture
    circle(ctx, -6, 13, 3.6, '#2f2f35', INK, 1.5);
    circle(ctx, -8, 16, 1.6 + Math.abs(Math.sin(s.t * 9)), '#ffb03a', null);
    // Tête : cheveux en bataille, pointes brûlées
    spikyHair(ctx, 2, 0, 7.5, 8, '#f2c14e', '#ff6b2c', 0.45);
    circle(ctx, 7, -3, 1.8, INK, null);
}

// SÉRAPHINE (inspirée d'Ange / Mercy) : grandes ailes dorées, bâton de soin
function drawSeraphine(ctx, s) {
    const flap = 0.08 * Math.sin(s.t * 2.6);
    // Ailes : plumes en éventail, de chaque côté vers l'arrière
    for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
            // Angle de la plume : de côté (π/2) vers l'arrière (≈ 0.8π)
            const a = side * (1.55 + i * 0.32 + flap);
            const len = 34 - i * 3;
            ctx.save();
            ctx.translate(-4, side * 9);
            ctx.rotate(a);
            ellipse(ctx, len / 2, 0, len / 2, 5.5, i === 0 ? '#fff6cf' : '#ffd34d', INK, 2.5);
            ctx.restore();
        }
    }
    glow(ctx, -6, 0, 46, '#fff2a8', 0.25);
    // Bâton caducée
    line(ctx, -2, 12, 36, 12, INK, 6);
    line(ctx, -2, 12, 36, 12, '#f4f1ea', 3);
    glow(ctx, 38, 12, 16, '#ffe27a', 0.8);
    circle(ctx, 38, 12, 5, '#ffe27a', INK, 2);
    line(ctx, 34, 6, 34, 18, '#c9a227', 2.5);
    // Robe blanche à liseré or
    ellipse(ctx, 0, 0, 12, 13.5, '#f4f1ea');
    line(ctx, 6, -10, 6, 10, '#c9a227', 2.5);
    // Tête : cheveux blonds, queue de cheval, auréole
    ellipse(ctx, -12, 0, 6, 4, '#ffe08a', INK, 2);
    circle(ctx, 0, 0, 8, '#ffe08a');
    circle(ctx, 0, 0, 11.5, null, 'rgba(255, 226, 122, 0.75)', 2);
}

// TEMPO (inspiré de Lúcio) : patins, dreadlocks, ampli sonique, aura musicale
function drawTempo(ctx, s) {
    // Aura (soin vert) qui pulse au rythme
    const pulse = (s.t * 1.6) % 1;
    ctx.save();
    ctx.globalAlpha = 0.45 * (1 - pulse);
    circle(ctx, 0, 0, 22 + pulse * 30, null, '#7ee34f', 3);
    ctx.restore();
    // Patins (roues lumineuses)
    for (const side of [-1, 1]) {
        rrect(ctx, -16, side * 8 - 4, 18, 8, 3, '#2f2f36', INK, 2);
        circle(ctx, -14, side * 8, 2.2, '#7ee34f', null);
        circle(ctx, -2, side * 8, 2.2, '#7ee34f', null);
    }
    // Ampli sonique (main gauche)
    line(ctx, 2, -11, 16, -10, INK, 7);
    line(ctx, 2, -11, 16, -10, '#7a4a2a', 4);
    rrect(ctx, 14, -18, 20, 16, 5, '#2f2f36');
    circle(ctx, 30, -10, 5.5, '#7ee34f', INK, 2);
    circle(ctx, 30, -10, 2, '#f8ff9a', null);
    // Main droite
    circle(ctx, 14, 10, 4, '#7a4a2a', INK, 2);
    // Corps vert à bandes jaunes
    ellipse(ctx, 0, 0, 12, 13.5, '#3fbf4a');
    line(ctx, -2, -12, -2, 12, '#ffd21e', 3);
    // Dreadlocks en étoile, pointes vertes
    for (let i = 0; i < 9; i++) {
        // Éventail centré sur l'arrière de la tête (angle π)
        const a = Math.PI * 0.45 + (i / 8) * Math.PI * 1.1;
        const ex = Math.cos(a) * 15 - 2;
        const ey = Math.sin(a) * 15;
        line(ctx, -2, 0, ex, ey, INK, 6);
        line(ctx, -2, 0, ex, ey, '#3a2418', 3.5);
        circle(ctx, ex, ey, 2.2, '#7ee34f', null);
    }
    // Tête + casque audio
    circle(ctx, 1, 0, 7.5, '#7a4a2a');
    for (const side of [-1, 1]) circle(ctx, 1, side * 8, 3.6, '#7ee34f', INK, 2);
}

const DRAWERS = {
    gorvald: drawGorvald,
    volta: drawVolta,
    zephyr: drawZephyr,
    kraz: drawKraz,
    seraphine: drawSeraphine,
    tempo: drawTempo
};

/**
 * Dessine un héros.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} heroId
 * @param {{x:number,y:number,angle?:number,scale?:number,team?:string,t?:number,moving?:boolean,ring?:boolean,bob?:number}} o
 */
export function drawHero(ctx, heroId, o) {
    const draw = DRAWERS[heroId];
    if (!draw) return;
    const s = { t: o.t || 0, moving: Boolean(o.moving) };
    const r = HERO_RADIUS[heroId] || 20;
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.scale(o.scale || 1, o.scale || 1);

    // Ombre au sol + anneau d'équipe
    ellipse(ctx, 4, 6, r + 8, r + 6, 'rgba(0,0,0,0.28)', null);
    if (o.ring !== false && o.team) {
        circle(ctx, 0, 0, r + 9, null, INK, 6);
        circle(ctx, 0, 0, r + 9, null, TEAM_COLORS[o.team] || '#fff', 3.5);
    }

    ctx.rotate(o.angle || 0);
    // Petit balancement quand le héros marche
    const sway = s.moving ? Math.sin(s.t * 14) * 0.06 : Math.sin(s.t * 2) * 0.015;
    ctx.rotate(sway);
    ctx.lineJoin = 'round';
    draw(ctx, s);
    ctx.restore();
}

/**
 * Portrait carré : héros centré, tourné vers le haut, sur un fond de la couleur du rôle.
 */
export function drawPortrait(canvas, heroId, { roleColor = '#334', t = 0, angle = -Math.PI / 2, zoom = 1 } = {}) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, roleColor);
    g.addColorStop(1, '#0b1430');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const r = HERO_RADIUS[heroId] || 20;
    // Les tanks ont l'air plus imposants, mais doivent rentrer dans le cadre
    const scale = (Math.min(w, h) / (r * 2 + 64)) * zoom;
    drawHero(ctx, heroId, { x: w / 2, y: h / 2 + 4 * scale, angle, scale, t, ring: false });
}
