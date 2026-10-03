/* ==================================
   DESSIN DES PLANEURS « À FORME » - FOR2D ROYAL
   Un seul dessin (canvas 2D) par style, utilisé :
   - en jeu, au-dessus du joueur qui plane (js/game/drop.js),
   - dans le casier / la boutique (js/item-art.js, converti en image).
   Les planeurs classiques (aile en chevron) restent dessinés par drop.js.

   Repère : vue de dessus, +x = avant (le nez), y = envergure.
   Toutes les tailles sont en « rayons » du personnage (r ≈ 26 unités).
   Chaque style donne aussi :
   - anchors : points d'attache des câbles (côté droit, y > 0), en rayons,
   - tip     : bout d'aile (traînées blanches), en rayons,
   - shadow  : ombre au sol [centre x, demi-longueur, demi-largeur], en rayons.
   ================================== */

const OUTLINE = '#0a1030';
const TAU = Math.PI * 2;

/* ===================== OUTILS ===================== */

// Éclaircit (k > 0) ou assombrit (k < 0) une couleur #rrggbb
function shade(hex, k) {
    const n = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0x888888;
    const ch = [n >> 16, (n >> 8) & 255, n & 255].map(c => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k));
    return `#${ch.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

function circle(ctx, x, y, rad) {
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, TAU);
}

function ellipse(ctx, x, y, rx, ry, rot = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}

// Remplit le chemin courant puis trace le contour sombre
function ink(ctx, fill, W) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = W;
    ctx.stroke();
}

function lin(ctx, x0, y0, x1, y1, colors) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
    return g;
}

// Sphère éclairée en haut à gauche
function orb(ctx, x, y, rad, colors) {
    const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.35, rad * 0.1, x, y, rad);
    colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
    return g;
}

// Trait épais avec contour sombre (os, tiges, antennes)
function bone(ctx, pts, w, color) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = w + 2.6;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke();
}

/* ===================== LES STYLES ===================== */

export const GLIDER_ART = {
    // Soucoupe Néon : disque métallique, anneau de néons qui clignotent, dôme en verre
    saucer: {
        anchors: [[0.55, 1.25], [-0.85, 1.05]],
        tip: [0.25, 1.95],
        shadow: [0.25, 2.0, 2.0],
        draw(ctx, r, [neon, metal], t, W) {
            const cx = r * 0.25;
            const R = r * 1.95;
            // Halo néon
            ctx.save();
            ctx.globalAlpha *= 0.3;
            circle(ctx, cx, 0, R + r * 0.22);
            ctx.fillStyle = neon;
            ctx.fill();
            ctx.restore();
            // Disque
            circle(ctx, cx, 0, R);
            const g = ctx.createRadialGradient(cx - R * 0.3, -R * 0.3, R * 0.1, cx, 0, R);
            g.addColorStop(0, shade(metal, 0.55));
            g.addColorStop(0.55, metal);
            g.addColorStop(1, shade(metal, -0.45));
            ink(ctx, g, W);
            // Plaques : anneau intérieur + rayons
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * TAU + 0.2;
                ctx.moveTo(cx + Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5);
                ctx.lineTo(cx + Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78);
            }
            ctx.strokeStyle = 'rgba(10, 16, 48, 0.45)';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            circle(ctx, cx, 0, R * 0.78);
            ctx.stroke();
            // Anneau de néon
            circle(ctx, cx, 0, R * 0.9);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 6;
            ctx.stroke();
            ctx.strokeStyle = neon;
            ctx.lineWidth = 3.4;
            ctx.stroke();
            // Lumières qui tournent et clignotent
            const blink = Math.floor(t * 5);
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * TAU + t * 0.9;
                const on = (i + blink) % 3 === 0;
                circle(ctx, cx + Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9, r * (on ? 0.16 : 0.11));
                ctx.fillStyle = on ? '#ffffff' : (i % 2 ? '#4fd8ff' : neon);
                ctx.fill();
            }
            // Dôme en verre
            circle(ctx, cx, 0, r * 0.88);
            ink(ctx, orb(ctx, cx, 0, r * 0.88, ['#f2feff', '#7fe8ff', '#1b6fa8']), W);
            ellipse(ctx, cx - r * 0.3, -r * 0.32, r * 0.3, r * 0.14, -0.6);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.fill();
            // Antenne
            bone(ctx, [cx + r * 0.2, 0, cx + r * 0.75, 0], 1.6, '#c9d2dd');
            circle(ctx, cx + r * 0.8, 0, r * 0.12);
            ctx.fillStyle = neon;
            ctx.fill();
        }
    },

    // Aile de Dragon : ailes de chauve-souris (os + membrane festonnée), corps, cornes, queue
    dragon: {
        anchors: [[0.6, 1.0], [-0.3, 1.25]],
        tip: [0.15, 2.35],
        shadow: [0.0, 1.8, 2.2],
        draw(ctx, r, [mem, boneCol], t, W) {
            const flap = Math.sin(t * 3.2) * 0.07;
            for (const s of [1, -1]) {
                const sh = [r * 0.35, r * 0.32 * s];
                const wr = [r * 0.65, r * 1.0 * s];
                const tips = [
                    [r * 1.2, r * (1.8 + flap) * s],
                    [r * 0.15, r * (2.35 + flap) * s],
                    [r * -0.8, r * (1.95 + flap) * s]
                ];
                const back = [r * -0.55, r * 0.34 * s];
                // Membrane : festons entre les doigts (creux tirés vers le corps)
                const scallop = (a, b) => {
                    const mx = (a[0] + b[0]) / 2;
                    const my = (a[1] + b[1]) / 2;
                    ctx.quadraticCurveTo(mx * 0.78 + wr[0] * 0.22, my * 0.78 + wr[1] * 0.22, b[0], b[1]);
                };
                ctx.beginPath();
                ctx.moveTo(sh[0], sh[1]);
                ctx.lineTo(wr[0], wr[1]);
                ctx.lineTo(tips[0][0], tips[0][1]);
                scallop(tips[0], tips[1]);
                scallop(tips[1], tips[2]);
                scallop(tips[2], back);
                ctx.closePath();
                ink(ctx, lin(ctx, 0, 0, 0, r * 2.3 * s, [shade(mem, -0.35), mem, shade(mem, 0.2)]), W);
                // Os du bras et des doigts
                bone(ctx, [sh[0], sh[1], wr[0], wr[1]], 4, boneCol);
                for (const tp of tips) bone(ctx, [wr[0], wr[1], tp[0], tp[1]], 2.4, boneCol);
                // Griffe du pouce
                ctx.beginPath();
                ctx.moveTo(wr[0] + r * 0.05, wr[1]);
                ctx.lineTo(wr[0] + r * 0.4, wr[1] - r * 0.12 * s);
                ctx.lineTo(wr[0] + r * 0.1, wr[1] - r * 0.18 * s);
                ctx.closePath();
                ink(ctx, '#fff3d6', W * 0.6);
            }
            // Queue qui ondule + pointe en pique
            const wag = Math.sin(t * 2.4) * r * 0.25;
            bone(ctx, [-r * 0.6, 0, -r * 1.3, wag * 0.5, -r * 1.9, wag], 5, shade(mem, -0.3));
            ctx.beginPath();
            ctx.moveTo(-r * 1.85, wag);
            ctx.lineTo(-r * 2.15, wag - r * 0.28);
            ctx.lineTo(-r * 2.45, wag);
            ctx.lineTo(-r * 2.15, wag + r * 0.28);
            ctx.closePath();
            ink(ctx, boneCol, W * 0.8);
            // Corps + piques du dos
            ellipse(ctx, r * 0.15, 0, r * 0.95, r * 0.42);
            ink(ctx, lin(ctx, 0, -r * 0.42, 0, r * 0.42, [shade(mem, 0.1), shade(mem, -0.3), shade(mem, -0.5)]), W);
            for (let i = 0; i < 4; i++) {
                const x = r * (-0.55 + i * 0.38);
                ctx.beginPath();
                ctx.moveTo(x - r * 0.13, 0);
                ctx.lineTo(x + r * 0.1, -r * 0.14);
                ctx.lineTo(x + r * 0.13, 0);
                ctx.closePath();
                ink(ctx, boneCol, W * 0.5);
            }
            // Tête + cornes + yeux
            for (const s of [1, -1]) bone(ctx, [r * 1.2, r * 0.18 * s, r * 0.85, r * 0.5 * s], 2.6, '#fff3d6');
            ellipse(ctx, r * 1.25, 0, r * 0.48, r * 0.32);
            ink(ctx, shade(mem, -0.2), W);
            for (const s of [1, -1]) {
                circle(ctx, r * 1.38, r * 0.15 * s, r * 0.08);
                ctx.fillStyle = '#ffe03d';
                ctx.fill();
            }
        }
    },

    // Grande Feuille : feuille de ginkgo en éventail, nervures en rayons, petite tige
    leaf: {
        anchors: [[0.4, 1.2], [-0.35, 0.75]],
        tip: [0.57, 2.2],
        shadow: [0.5, 1.45, 2.15],
        draw(ctx, r, [light, dark], t, W) {
            ctx.save();
            ctx.rotate(Math.sin(t * 1.6) * 0.04); // la feuille ondule doucement
            const ox = -r * 0.7;
            const R = r * 2.55;
            const A = 1.05;
            const edge = (a) => {
                const notch = Math.abs(a) < 0.13 ? R * 0.22 * (1 - Math.abs(a) / 0.13) : 0;
                return R * (0.93 + 0.07 * Math.cos(a * 15)) - notch;
            };
            ctx.beginPath();
            ctx.moveTo(ox, 0);
            const N = 48;
            for (let i = 0; i <= N; i++) {
                const a = -A + (2 * A * i) / N;
                const rr = edge(a);
                ctx.lineTo(ox + Math.cos(a) * rr, Math.sin(a) * rr);
            }
            ctx.closePath();
            const g = ctx.createRadialGradient(ox, 0, r * 0.2, ox, 0, R);
            g.addColorStop(0, dark);
            g.addColorStop(0.6, light);
            g.addColorStop(1, shade(light, 0.25));
            ink(ctx, g, W);
            // Bord doré (feuille d'automne qui commence)
            ctx.save();
            ctx.clip();
            ctx.beginPath();
            for (let i = 0; i <= N; i++) {
                const a = -A + (2 * A * i) / N;
                const rr = edge(a) - r * 0.18;
                if (i === 0) ctx.moveTo(ox + Math.cos(a) * rr, Math.sin(a) * rr);
                else ctx.lineTo(ox + Math.cos(a) * rr, Math.sin(a) * rr);
            }
            ctx.strokeStyle = 'rgba(255, 210, 70, 0.55)';
            ctx.lineWidth = r * 0.3;
            ctx.stroke();
            ctx.restore();
            // Nervures en éventail
            ctx.beginPath();
            for (let k = -7; k <= 7; k++) {
                const a = (k / 7) * A * 0.94;
                ctx.moveTo(ox + Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35);
                ctx.lineTo(ox + Math.cos(a) * edge(a) * 0.9, Math.sin(a) * edge(a) * 0.9);
            }
            ctx.strokeStyle = 'rgba(255, 255, 220, 0.5)';
            ctx.lineWidth = 1.4;
            ctx.stroke();
            // Tige recourbée vers l'arrière
            ctx.beginPath();
            ctx.moveTo(ox + r * 0.1, 0);
            ctx.quadraticCurveTo(ox - r * 0.55, r * 0.1, ox - r * 0.85, -r * 0.3);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 6;
            ctx.stroke();
            ctx.strokeStyle = shade(dark, -0.15);
            ctx.lineWidth = 3.2;
            ctx.stroke();
            ctx.restore();
        }
    },

    // Gros Dirigeable : ballon allongé à fuseaux, bandes et ailerons colorés, hélice
    blimp: {
        anchors: [[0.85, 0.95], [-0.8, 0.95]],
        tip: [-1.95, 1.2],
        shadow: [0.0, 2.2, 1.3],
        draw(ctx, r, [body, fin], t, W) {
            // Ailerons arrière
            for (const s of [1, -1]) {
                ctx.beginPath();
                ctx.moveTo(-r * 1.25, r * 0.55 * s);
                ctx.lineTo(-r * 2.0, r * 1.3 * s);
                ctx.lineTo(-r * 2.2, r * 1.15 * s);
                ctx.lineTo(-r * 2.1, r * 0.3 * s);
                ctx.closePath();
                ink(ctx, lin(ctx, 0, 0, 0, r * 1.3 * s, [shade(fin, -0.3), fin, shade(fin, 0.25)]), W);
            }
            // Hélice qui tourne derrière
            ctx.save();
            ctx.translate(-r * 2.25, 0);
            ctx.rotate(t * 14);
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 0.12, r * 0.55, 0, 0, TAU);
            ctx.fillStyle = 'rgba(30, 40, 70, 0.75)';
            ctx.fill();
            ctx.restore();
            circle(ctx, -r * 2.25, 0, r * 0.1);
            ctx.fillStyle = '#ffe03d';
            ctx.fill();
            // Ballon
            const cx = r * 0.1;
            const rx = r * 2.05;
            const ry = r * 1.12;
            ellipse(ctx, cx, 0, rx, ry);
            ink(ctx, lin(ctx, 0, -ry, 0, ry, [shade(body, 0.45), body, shade(body, -0.35)]), W);
            ctx.save();
            ellipse(ctx, cx, 0, rx, ry);
            ctx.clip();
            // Bandes colorées
            ctx.fillStyle = fin;
            ctx.fillRect(cx + r * 0.55, -ry, r * 0.32, ry * 2);
            ctx.fillRect(cx - r * 1.05, -ry, r * 0.32, ry * 2);
            // Fuseaux (coutures en long)
            ctx.beginPath();
            for (const k of [-0.62, -0.25, 0.25, 0.62]) {
                for (let i = 0; i <= 20; i++) {
                    const x = cx - rx + (2 * rx * i) / 20;
                    const u = (x - cx) / rx;
                    const y = k * ry * Math.sqrt(Math.max(0, 1 - u * u));
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
            }
            ctx.strokeStyle = 'rgba(10, 16, 48, 0.22)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
            // Reflet
            ellipse(ctx, cx + r * 0.3, -ry * 0.5, r * 1.15, r * 0.16, -0.05);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.fill();
            // Nez
            circle(ctx, cx + rx - r * 0.08, 0, r * 0.2);
            ink(ctx, shade(fin, -0.2), W * 0.7);
            // Contour par-dessus les bandes
            ellipse(ctx, cx, 0, rx, ry);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = W;
            ctx.stroke();
        }
    },

    // Scarabée Bionique : carapace ouverte, ailes transparentes qui vibrent, petits réacteurs
    beetle: {
        anchors: [[0.35, 0.9], [-0.6, 0.85]],
        tip: [-0.75, 2.05],
        shadow: [-0.1, 1.8, 2.1],
        draw(ctx, r, [shell, wing], t, W) {
            const buzz = 0.9 + 0.1 * Math.sin(t * 40);
            // Réacteurs + flammes
            for (const s of [1, -1]) {
                const fl = 0.75 + 0.25 * Math.sin(t * 30 + s);
                ctx.beginPath();
                ctx.moveTo(-r * 1.3, r * 0.3 * s - r * 0.1);
                ctx.quadraticCurveTo(-r * (1.55 + 0.4 * fl), r * 0.3 * s, -r * 1.3, r * 0.3 * s + r * 0.1);
                ctx.fillStyle = '#ffb703';
                ctx.fill();
                ctx.beginPath();
                ctx.roundRect(-r * 1.35, r * 0.3 * s - r * 0.14, r * 0.5, r * 0.28, r * 0.08);
                ink(ctx, '#7c879b', W * 0.7);
            }
            // Ailes membraneuses (sous la carapace)
            for (const s of [1, -1]) {
                ellipse(ctx, -r * 0.5, r * 1.4 * s * buzz, r * 1.35, r * 0.52, s * 0.4);
                ctx.save();
                ctx.globalAlpha *= 0.7;
                ctx.fillStyle = wing;
                ctx.fill();
                ctx.restore();
                ctx.strokeStyle = OUTLINE;
                ctx.lineWidth = W * 0.7;
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(r * 0.2, r * 0.6 * s);
                ctx.lineTo(-r * 1.4, r * 1.9 * s * buzz);
                ctx.moveTo(-r * 0.4, r * 1.0 * s);
                ctx.lineTo(-r * 0.9, r * 1.95 * s * buzz);
                ctx.strokeStyle = 'rgba(10, 16, 48, 0.4)';
                ctx.lineWidth = 1.3;
                ctx.stroke();
            }
            // Pattes
            for (const s of [1, -1]) {
                for (const x of [0.5, 0.05, -0.4]) {
                    bone(ctx, [r * x, r * 0.35 * s, r * (x + 0.1), r * 0.75 * s, r * (x - 0.05), r * 0.95 * s], 1.6, shade(shell, -0.5));
                }
            }
            // Abdomen
            ellipse(ctx, -r * 0.4, 0, r * 0.95, r * 0.55);
            ink(ctx, shade(shell, -0.35), W);
            // Élytres ouverts (les deux moitiés de carapace)
            for (const s of [1, -1]) {
                ellipse(ctx, r * 0.0, r * 0.8 * s, r * 1.05, r * 0.5, s * 0.42);
                ink(ctx, lin(ctx, 0, r * 0.35 * s, 0, r * 1.3 * s, [shade(shell, 0.45), shell, shade(shell, -0.4)]), W);
                circle(ctx, r * 0.25, r * 0.85 * s, r * 0.18);
                ink(ctx, wing, W * 0.5);
                circle(ctx, -r * 0.45, r * 0.6 * s, r * 0.13);
                ink(ctx, wing, W * 0.5);
                ellipse(ctx, r * 0.15, r * 0.62 * s, r * 0.45, r * 0.09, s * 0.42);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
                ctx.fill();
            }
            // Thorax + tête + mandibules + antennes
            ellipse(ctx, r * 0.75, 0, r * 0.45, r * 0.5);
            ink(ctx, lin(ctx, 0, -r * 0.5, 0, r * 0.5, [shade(shell, 0.2), shade(shell, -0.15), shade(shell, -0.45)]), W);
            for (const s of [1, -1]) {
                bone(ctx, [r * 1.3, r * 0.12 * s, r * 1.65, r * 0.3 * s, r * 1.9, r * 0.55 * s], 1.6, '#3a4252');
                circle(ctx, r * 1.92, r * 0.58 * s, r * 0.1);
                ctx.fillStyle = '#ff4f5e';
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(r * 1.35, r * 0.1 * s);
                ctx.quadraticCurveTo(r * 1.7, r * 0.12 * s, r * 1.6, r * 0.02 * s);
                ctx.strokeStyle = OUTLINE;
                ctx.lineWidth = 2.6;
                ctx.stroke();
            }
            circle(ctx, r * 1.2, 0, r * 0.3);
            ink(ctx, '#2b3245', W);
            for (const s of [1, -1]) {
                circle(ctx, r * 1.3, r * 0.14 * s, r * 0.08);
                ctx.fillStyle = '#ff4f5e';
                ctx.fill();
            }
        }
    }
};

/* ===================== ICÔNE DU CASIER ===================== */

const urlCache = new Map();

/*
   Image (data URL PNG) du planeur vu de dessus, nez vers le haut, cadrée au plus juste :
   dessin en grand sur une toile temporaire, puis recadrage sur ses pixels.
*/
export function gliderUrl(style, colors, size = 240, pad = 0.9) {
    const art = GLIDER_ART[style];
    if (!art || typeof document === 'undefined') return '';
    const key = `${style}|${colors.join(',')}|${size}|${pad}`;
    const cached = urlCache.get(key);
    if (cached) return cached;

    const S = 360;
    const tmp = document.createElement('canvas');
    tmp.width = S;
    tmp.height = S;
    const t = tmp.getContext('2d');
    t.lineJoin = 'round';
    t.lineCap = 'round';
    t.translate(S / 2, S / 2);
    t.rotate(-Math.PI / 2);
    art.draw(t, 52, colors, 0, 5);

    // Cadre réel du dessin
    const data = t.getImageData(0, 0, S, S).data;
    let x0 = S; let y0 = S; let x1 = -1; let y1 = -1;
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            if (data[(y * S + x) * 4 + 3] > 10) {
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
        c.imageSmoothingQuality = 'high';
        c.drawImage(tmp, x0, y0, bw, bh, (size - bw * k) / 2, (size - bh * k) / 2, bw * k, bh * k);
    }
    const url = cv.toDataURL('image/png');
    urlCache.set(key, url);
    return url;
}
