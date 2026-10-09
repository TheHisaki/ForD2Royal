/* ==================================
   DESSIN DES PLANEURS « À FORME » - FOR2D ROYAL
   Un seul dessin (canvas 2D) par style, utilisé :
   - en jeu, au-dessus du joueur qui plane (js/game/drop.js),
   - dans le casier / la boutique (js/item-art.js, converti en image).
   Les planeurs classiques (aile en chevron) restent dessinés par drop.js.
   Styles : saucer, dragon, leaf, blimp, beetle, grimoire, origami, balloon,
   kite, pizza, manta, carpet, phoenix.

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

/* ----- Planeurs « prestige » : plus de détails ----- */

// Étoile à 5 branches tracée d'un seul trait (rune du grimoire)
function runeStar(ctx, x, y, rad, rot = -Math.PI / 2) {
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
        const a = rot + (i * 2 * TAU) / 5;
        const px = x + Math.cos(a) * rad;
        const py = y + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
}

Object.assign(GLIDER_ART, {
    // Grimoire Maudit : livre ouvert à plat, rune lumineuse, cristaux, ailes en lames recourbées
    grimoire: {
        anchors: [[0.45, 0.85], [-0.55, 0.9]],
        tip: [-0.75, 2.45],
        shadow: [0.0, 1.3, 2.35],
        draw(ctx, r, [magic, cover], t, W) {
            const pulse = 0.75 + 0.25 * Math.sin(t * 3);
            for (const s of [1, -1]) {
                // Lame : bord extérieur lisse, bord intérieur dentelé
                ctx.beginPath();
                ctx.moveTo(r * 0.6, r * 0.72 * s);
                ctx.quadraticCurveTo(r * 1.05, r * 1.95 * s, -r * 0.75, r * 2.45 * s);
                const teeth = 5;
                for (let i = 1; i <= teeth * 2; i++) {
                    const u = i / (teeth * 2);
                    const x = -r * 0.75 + (r * 0.55) * u + Math.sin(u * Math.PI) * r * 0.35;
                    const y = (r * 2.45 - (r * 1.65) * u) * s;
                    const inset = i % 2 ? r * 0.2 : 0;
                    ctx.lineTo(x - inset * 0.6, y - inset * s);
                }
                ctx.lineTo(-r * 0.15, r * 0.72 * s);
                ctx.closePath();
                ink(ctx, lin(ctx, 0, r * 0.7 * s, 0, r * 2.45 * s, ['#f2f6fb', '#a3aec0', '#4e566b']), W);
                // Tranchant brillant
                ctx.beginPath();
                ctx.moveTo(r * 0.55, r * 0.85 * s);
                ctx.quadraticCurveTo(r * 0.9, r * 1.9 * s, -r * 0.6, r * 2.35 * s);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.lineWidth = 1.8;
                ctx.stroke();
                // Runes violettes gravées dans la lame
                ctx.save();
                ctx.globalAlpha *= pulse;
                ctx.fillStyle = magic;
                for (let i = 0; i < 4; i++) {
                    const u = 0.2 + i * 0.18;
                    const x = r * (0.45 - u * 1.05);
                    const y = r * (1.0 + u * 1.25) * s;
                    ctx.beginPath();
                    ctx.moveTo(x, y - r * 0.09);
                    ctx.lineTo(x + r * 0.07, y);
                    ctx.lineTo(x, y + r * 0.09);
                    ctx.lineTo(x - r * 0.07, y);
                    ctx.closePath();
                    ctx.fill();
                }
                ctx.restore();
                // Cristal violet à la base de la lame + rubis
                ctx.beginPath();
                ctx.moveTo(r * 0.35, r * 0.62 * s);
                ctx.lineTo(r * 0.7, r * 0.95 * s);
                ctx.lineTo(r * 0.3, r * 1.35 * s);
                ctx.lineTo(-r * 0.05, r * 0.95 * s);
                ctx.closePath();
                ink(ctx, lin(ctx, 0, r * 0.62 * s, 0, r * 1.35 * s, ['#f5d6ff', magic, shade(magic, -0.5)]), W);
                ctx.beginPath();
                ctx.moveTo(r * 0.35, r * 0.7 * s);
                ctx.lineTo(r * 0.3, r * 1.25 * s);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
                ctx.lineWidth = 1.3;
                ctx.stroke();
                circle(ctx, r * 0.8, r * 0.72 * s, r * 0.14);
                ink(ctx, orb(ctx, r * 0.8, r * 0.72 * s, r * 0.14, ['#ffd0c8', '#ff4f3a', '#8a1406']), W * 0.6);
            }
            // Tranche des pages : lueur dorée à l'arrière
            ctx.save();
            ctx.globalAlpha *= 0.35 + 0.3 * pulse;
            ctx.beginPath();
            ctx.roundRect(-r * 1.05, -r * 0.95, r * 0.5, r * 1.9, r * 0.12);
            ctx.fillStyle = '#ffe9a0';
            ctx.fill();
            ctx.restore();
            ctx.beginPath();
            ctx.roundRect(-r * 0.92, -r * 0.88, r * 0.3, r * 1.76, r * 0.06);
            ink(ctx, lin(ctx, -r * 0.92, 0, -r * 0.62, 0, ['#fff6d8', '#e9c46a']), W * 0.7);
            // Couverture + coins en métal
            ctx.beginPath();
            ctx.roundRect(-r * 0.75, -r * 0.98, r * 1.65, r * 1.96, r * 0.16);
            ink(ctx, lin(ctx, 0, -r, 0, r, [shade(cover, 0.3), cover, shade(cover, -0.4)]), W);
            for (const [cx2, cy2] of [[0.72, -0.8], [0.72, 0.8], [-0.57, -0.8], [-0.57, 0.8]]) {
                ctx.beginPath();
                ctx.roundRect(r * (cx2 - 0.16), r * (cy2 - 0.16), r * 0.32, r * 0.32, r * 0.06);
                ink(ctx, lin(ctx, 0, r * (cy2 - 0.16), 0, r * (cy2 + 0.16), ['#e4ebf3', '#8794a8']), W * 0.6);
            }
            // Panneau de la rune
            ctx.beginPath();
            ctx.roundRect(-r * 0.45, -r * 0.62, r * 1.05, r * 1.24, r * 0.1);
            ink(ctx, shade(cover, -0.45), W * 0.7);
            const rx = r * 0.07;
            ctx.save();
            ctx.shadowColor = magic;
            ctx.shadowBlur = 10 * pulse;
            circle(ctx, rx, 0, r * 0.48);
            ctx.strokeStyle = magic;
            ctx.lineWidth = 2.2;
            ctx.stroke();
            runeStar(ctx, rx, 0, r * 0.44, 0);
            ctx.stroke();
            ctx.restore();
        }
    },

    // Grue en Origami : papier plié en facettes claires / sombres, pointes colorées
    origami: {
        anchors: [[0.3, 0.9], [-0.35, 0.9]],
        tip: [-0.2, 2.4],
        shadow: [0.0, 1.9, 2.25],
        draw(ctx, r, [paper, accent], t, W) {
            const flap = 1 + Math.sin(t * 2.6) * 0.05;
            const light = shade(paper, 0.35);
            const mid = paper;
            const dark = shade(paper, -0.35);
            const facet = (pts, fill) => {
                ctx.beginPath();
                ctx.moveTo(pts[0] * r, pts[1] * r);
                for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * r, pts[i + 1] * r);
                ctx.closePath();
                ink(ctx, fill, W * 0.8);
            };
            // Queue (pointe large en 2 facettes) et cou terminé par la tête colorée
            facet([-0.55, 0.28, -2.05, 0.05, -0.75, 0], mid);
            facet([-0.55, -0.28, -0.75, 0, -2.05, 0.05], dark);
            facet([0.6, 0.22, 1.7, 0.02, 0.75, 0], light);
            facet([0.6, -0.22, 0.75, 0, 1.7, 0.02], mid);
            facet([1.55, -0.1, 1.7, 0.02, 2.1, 0.32], accent);
            for (const s of [1, -1]) {
                const tipY = 2.4 * flap * s;
                // Aile large en 3 facettes (pli avant, pli arrière) + pointe colorée
                facet([0.75, 0.25 * s, 1.0, 1.25 * flap * s, -0.05, tipY], s > 0 ? light : mid);
                facet([0.75, 0.25 * s, -0.05, tipY, -0.15, 0.3 * s], s > 0 ? mid : dark);
                facet([-0.15, 0.3 * s, -0.05, tipY, -0.85, 1.25 * flap * s, -0.75, 0.28 * s], s > 0 ? dark : shade(paper, -0.5));
                facet([0.3, 1.85 * flap * s, 0.48, 1.85 * flap * s, -0.05, tipY], accent);
                facet([-0.5, 1.75 * flap * s, -0.32, 1.85 * flap * s, -0.05, tipY], accent);
            }
            // Corps en losange (2 facettes)
            facet([0.9, 0, 0, 0.42, -0.85, 0], light);
            facet([0.9, 0, -0.85, 0, 0, -0.42], dark);
            // Reflet sur le pli central
            ctx.beginPath();
            ctx.moveTo(r * 0.8, 0);
            ctx.lineTo(-r * 0.75, 0);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1.4;
            ctx.stroke();
        }
    },

    // Montgolfière Festive : ballon rond à fuseaux de 2 couleurs, couronne étoilée, pompons
    balloon: {
        anchors: [[0.75, 1.3], [-0.95, 1.3]],
        tip: [0.1, 2.05],
        shadow: [0.1, 2.1, 2.1],
        draw(ctx, r, [c1, c2], t, W) {
            const cx = r * 0.1;
            const R = r * 2.0;
            const spin = t * 0.25;
            const N = 12;
            // Pompons qui dépassent du bord (sous le ballon)
            for (let i = 0; i < N; i++) {
                const a = spin + ((i + 0.5) / N) * TAU;
                circle(ctx, cx + Math.cos(a) * (R + r * 0.12), Math.sin(a) * (R + r * 0.12), r * 0.14);
                ink(ctx, i % 2 ? c1 : c2, W * 0.6);
            }
            // Fuseaux
            for (let i = 0; i < N; i++) {
                const a0 = spin + (i / N) * TAU;
                const a1 = spin + ((i + 1) / N) * TAU;
                ctx.beginPath();
                ctx.moveTo(cx, 0);
                ctx.arc(cx, 0, R, a0, a1);
                ctx.closePath();
                ctx.fillStyle = i % 2 ? c2 : c1;
                ctx.fill();
            }
            // Volume : clair au centre, sombre au bord
            circle(ctx, cx, 0, R);
            const g = ctx.createRadialGradient(cx - R * 0.3, -R * 0.3, R * 0.05, cx, 0, R);
            g.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
            g.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
            g.addColorStop(1, 'rgba(10, 16, 48, 0.4)');
            ctx.fillStyle = g;
            ctx.fill();
            // Coutures
            ctx.beginPath();
            for (let i = 0; i < N; i++) {
                const a = spin + (i / N) * TAU;
                ctx.moveTo(cx + Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45);
                ctx.lineTo(cx + Math.cos(a) * R, Math.sin(a) * R);
            }
            ctx.strokeStyle = 'rgba(10, 16, 48, 0.35)';
            ctx.lineWidth = 1.4;
            ctx.stroke();
            // Galon doré + contour
            circle(ctx, cx, 0, R * 0.82);
            ctx.strokeStyle = 'rgba(255, 224, 61, 0.75)';
            ctx.lineWidth = 2.4;
            ctx.setLineDash([5, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            circle(ctx, cx, 0, R);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = W;
            ctx.stroke();
            // Couronne du sommet avec étoile
            circle(ctx, cx, 0, r * 0.48);
            ink(ctx, orb(ctx, cx, 0, r * 0.48, ['#fff6c8', '#ffd24a', '#c98a12']), W);
            runeStar(ctx, cx, 0, r * 0.3, spin - Math.PI / 2);
            ctx.closePath();
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }
    }
});

/* ----- Nouveaux planeurs : un par rareté, de plus en plus travaillés ----- */

// Couleur #rrggbb -> rgba avec opacité (pour les dégradés qui s'effacent)
function rgba(hex, a) {
    const n = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0xffffff;
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// Étincelle à 4 branches (sous-chemin courant remplacé)
function sparkle(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x, y, x + s, y);
    ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y);
    ctx.quadraticCurveTo(x, y, x, y - s);
    ctx.closePath();
}

// Plume pointue partant de (bx, by) dans la direction ang, dégradé de la base à la pointe
function feather(ctx, bx, by, ang, len, wid, colors, W) {
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.45, -wid, len, 0);
    ctx.quadraticCurveTo(len * 0.45, wid, 0, 0);
    ctx.closePath();
    ink(ctx, lin(ctx, 0, 0, len, 0, colors), W);
    ctx.beginPath();
    ctx.moveTo(len * 0.1, 0);
    ctx.lineTo(len * 0.85, 0);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
}

Object.assign(GLIDER_ART, {
    // Cerf-Volant (commun) : losange en 4 triangles, baguettes en croix, queue à nœuds qui ondule
    kite: {
        anchors: [[0.35, 0.95], [-0.55, 0.65]],
        tip: [0.3, 1.5],
        shadow: [0.1, 1.9, 1.5],
        draw(ctx, r, [c1, c2], t, W) {
            const tail = (u) => [-r * (1.3 + u * 2.1), Math.sin(u * 7 - t * 6) * r * 0.3 * u];
            ctx.beginPath();
            for (let i = 0; i <= 24; i++) {
                const [x, y] = tail(i / 24);
                if (i) ctx.lineTo(x, y);
                else ctx.moveTo(x, y);
            }
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = 3.4;
            ctx.stroke();
            ctx.strokeStyle = '#f4f6fb';
            ctx.lineWidth = 1.4;
            ctx.stroke();
            for (let k = 1; k <= 4; k++) {
                const [x, y] = tail(k / 4.4);
                const b = r * 0.22;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x - b * 0.5, y - b);
                ctx.lineTo(x + b * 0.5, y - b);
                ctx.closePath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + b * 0.5, y + b);
                ctx.lineTo(x - b * 0.5, y + b);
                ctx.closePath();
                ink(ctx, k % 2 ? c1 : c2, W * 0.6);
            }
            const N = [r * 1.6, 0];
            const L = [r * 0.3, -r * 1.5];
            const R = [r * 0.3, r * 1.5];
            const B = [-r * 1.3, 0];
            const C = [r * 0.3, 0];
            const tri = (a, b, fill) => {
                ctx.beginPath();
                ctx.moveTo(C[0], C[1]);
                ctx.lineTo(a[0], a[1]);
                ctx.lineTo(b[0], b[1]);
                ctx.closePath();
                ctx.fillStyle = fill;
                ctx.fill();
            };
            tri(N, R, c1);
            tri(R, B, c2);
            tri(B, L, c1);
            tri(L, N, c2);
            // La toile se gonfle : reflet sur un quart
            ctx.beginPath();
            ctx.moveTo(C[0], C[1]);
            ctx.lineTo(N[0], N[1]);
            ctx.lineTo(L[0], L[1]);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(N[0], N[1]);
            ctx.lineTo(R[0], R[1]);
            ctx.lineTo(B[0], B[1]);
            ctx.lineTo(L[0], L[1]);
            ctx.closePath();
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = W;
            ctx.stroke();
            bone(ctx, [N[0] - r * 0.1, 0, B[0] + r * 0.12, 0], 1.8, '#c08a4a');
            bone(ctx, [C[0], L[1] + r * 0.14, C[0], R[1] - r * 0.14], 1.8, '#c08a4a');
            circle(ctx, C[0], 0, r * 0.12);
            ink(ctx, '#ffffff', W * 0.5);
        }
    },

    // Part Volante (peu commun) : sauce, fromage qui coule, pepperoni, basilic, croûte dorée, vapeur
    pizza: {
        anchors: [[0.55, 0.55], [-0.7, 1.15]],
        tip: [-1.25, 1.75],
        shadow: [0.2, 1.8, 1.75],
        draw(ctx, r, [cheese, pep], t, W) {
            const TX = r * 1.9;
            const R = r * 3.3;
            const A = 0.55;
            const crust = '#d9a05b';
            ctx.save();
            ctx.lineCap = 'round';
            // Gouttes de fromage qui pendent des côtés (sous la part)
            for (const s of [1, -1]) {
                const nx = Math.sin(A);
                const ny = s * Math.cos(A);
                for (const u of [0.38, 0.64, 0.86]) {
                    const px = TX - Math.cos(A) * R * u;
                    const py = s * Math.sin(A) * R * u;
                    const len = r * (0.22 + 0.13 * Math.sin(t * 2 + u * 9));
                    bone(ctx, [px - nx * r * 0.1, py - ny * r * 0.1, px + nx * len, py + ny * len], r * 0.16, cheese);
                    circle(ctx, px + nx * len, py + ny * len, r * 0.11);
                    ink(ctx, cheese, W * 0.5);
                }
            }
            // Sauce (part entière)
            ctx.beginPath();
            ctx.moveTo(TX, 0);
            ctx.arc(TX, 0, R, Math.PI - A, Math.PI + A);
            ctx.closePath();
            ink(ctx, '#c4302b', W);
            // Fromage : un peu plus petit, bord ondulé côté croûte
            ctx.beginPath();
            ctx.moveTo(TX - r * 0.14, 0);
            for (let i = 0; i <= 18; i++) {
                const a = Math.PI - A * 0.92 + (2 * A * 0.92 * i) / 18;
                const rad = R * 0.86 + Math.sin(i * 1.7) * r * 0.08;
                ctx.lineTo(TX + Math.cos(a) * rad, Math.sin(a) * rad);
            }
            ctx.closePath();
            ctx.fillStyle = lin(ctx, TX, 0, TX - R, 0, [shade(cheese, 0.4), cheese, shade(cheese, -0.08)]);
            ctx.fill();
            // Pepperoni
            for (const [u, v] of [[0.3, 0], [0.55, 0.42], [0.55, -0.42], [0.78, 0.05], [0.8, 0.62], [0.82, -0.6]]) {
                const dist = R * 0.85 * u;
                const x = TX - dist;
                const y = v * dist * Math.tan(A) * 0.8;
                const pr = r * (0.2 + 0.08 * u);
                circle(ctx, x, y, pr);
                ink(ctx, orb(ctx, x, y, pr, [shade(pep, 0.35), pep, shade(pep, -0.35)]), W * 0.6);
                ctx.fillStyle = shade(pep, -0.45);
                for (const [dx, dy] of [[0.3, -0.2], [-0.25, 0.3], [-0.1, -0.4]]) {
                    circle(ctx, x + dx * pr, y + dy * pr, pr * 0.12);
                    ctx.fill();
                }
            }
            // Basilic
            for (const [x, y, a] of [[-0.25, 0.75, 0.7], [0.75, -0.2, -0.5]]) {
                ellipse(ctx, r * x, r * y, r * 0.24, r * 0.12, a);
                ink(ctx, '#3fbf4a', W * 0.5);
                ctx.beginPath();
                ctx.moveTo(r * x - Math.cos(a) * r * 0.18, r * y - Math.sin(a) * r * 0.18);
                ctx.lineTo(r * x + Math.cos(a) * r * 0.18, r * y + Math.sin(a) * r * 0.18);
                ctx.strokeStyle = '#1f8f3a';
                ctx.lineWidth = 1.2;
                ctx.stroke();
            }
            // Croûte dorée (recouvre le bord arrière) + brûlures
            ctx.beginPath();
            ctx.arc(TX, 0, R - r * 0.12, Math.PI - A, Math.PI + A);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = r * 0.5 + W * 2;
            ctx.stroke();
            ctx.strokeStyle = lin(ctx, TX - R - r * 0.3, 0, TX - R + r * 0.3, 0, [shade(crust, -0.25), crust, shade(crust, 0.25)]);
            ctx.lineWidth = r * 0.5;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(TX, 0, R - r * 0.04, Math.PI - A * 0.94, Math.PI + A * 0.94);
            ctx.strokeStyle = 'rgba(255, 240, 200, 0.55)';
            ctx.lineWidth = r * 0.08;
            ctx.stroke();
            ctx.fillStyle = shade(crust, -0.4);
            for (let i = 0; i < 6; i++) {
                const a = Math.PI - A * 0.8 + (A * 1.6 * i) / 5;
                ellipse(ctx, TX + Math.cos(a) * (R - r * 0.18), Math.sin(a) * (R - r * 0.18), r * 0.07, r * 0.04, a);
                ctx.fill();
            }
            // Vapeur qui monte
            const ga = ctx.globalAlpha;
            for (let k = 0; k < 2; k++) {
                const ph = (t * 0.6 + k * 0.5) % 1;
                ctx.globalAlpha = ga * 0.35 * (1 - ph);
                circle(ctx, TX - R * (0.35 + k * 0.25), (k ? -1 : 1) * r * 0.35, r * (0.15 + 0.35 * ph));
                ctx.fillStyle = '#ffffff';
                ctx.fill();
            }
            ctx.restore();
        }
    },

    // Raie des Abysses (rare) : ailes qui ondulent, taches lumineuses qui s'allument en vague,
    // bord d'attaque phosphorescent, queue fouet, bulles
    manta: {
        anchors: [[0.55, 0.95], [-0.45, 1.15]],
        tip: [-0.15, 2.5],
        shadow: [0.0, 1.7, 2.5],
        draw(ctx, r, [body, glow], t, W) {
            const wave = Math.sin(t * 2.2);
            const tipX = -r * (0.15 - 0.2 * wave);
            const tipY = r * (2.45 + 0.07 * wave);
            const ga = ctx.globalAlpha;
            // Halo
            ctx.globalAlpha = ga * (0.14 + 0.06 * Math.sin(t * 3));
            ellipse(ctx, 0, 0, r * 1.9, r * 2.75);
            ctx.fillStyle = glow;
            ctx.fill();
            ctx.globalAlpha = ga;
            // Queue fouet
            const tw = Math.sin(t * 3) * r * 0.3;
            bone(ctx, [-r * 0.8, 0, -r * 1.6, tw * 0.4, -r * 2.4, tw, -r * 2.9, tw * 0.6], 1.8, shade(body, -0.2));
            // Bulles qui s'éloignent
            for (let k = 0; k < 4; k++) {
                const ph = (t * 0.8 + k / 4) % 1;
                ctx.globalAlpha = ga * (1 - ph) * 0.8;
                circle(ctx, -r * (1.0 + ph * 1.8), Math.sin(k * 2.1) * r * 1.2, r * 0.09 * (1 - ph * 0.4));
                ctx.strokeStyle = '#d6fbff';
                ctx.lineWidth = 1.3;
                ctx.stroke();
            }
            ctx.globalAlpha = ga;
            const shape = () => {
                ctx.beginPath();
                ctx.moveTo(r * 1.05, 0);
                ctx.quadraticCurveTo(r * 1.35, r * 0.05, r * 1.55, r * 0.3);
                ctx.quadraticCurveTo(r * 1.45, r * 0.5, r * 1.0, r * 0.45);
                ctx.quadraticCurveTo(r * 0.75, r * (1.7 + 0.1 * wave), tipX, tipY);
                ctx.quadraticCurveTo(-r * 0.35, r * 1.25, -r * 0.85, r * 0.32);
                ctx.lineTo(-r * 0.95, 0);
                ctx.lineTo(-r * 0.85, -r * 0.32);
                ctx.quadraticCurveTo(-r * 0.35, -r * 1.25, tipX, -tipY);
                ctx.quadraticCurveTo(r * 0.75, -r * (1.7 + 0.1 * wave), r * 1.0, -r * 0.45);
                ctx.quadraticCurveTo(r * 1.45, -r * 0.5, r * 1.55, -r * 0.3);
                ctx.quadraticCurveTo(r * 1.35, -r * 0.05, r * 1.05, 0);
                ctx.closePath();
            };
            shape();
            const g = ctx.createRadialGradient(r * 0.2, 0, r * 0.3, r * 0.2, 0, r * 2.6);
            g.addColorStop(0, shade(body, -0.3));
            g.addColorStop(0.55, body);
            g.addColorStop(1, shade(body, 0.35));
            ctx.fillStyle = g;
            ctx.fill();
            ctx.save();
            ctx.clip();
            // Dos plus sombre, marques claires des épaules
            ellipse(ctx, 0, 0, r * 1.05, r * 0.5);
            ctx.fillStyle = 'rgba(5, 10, 30, 0.3)';
            ctx.fill();
            for (const s of [1, -1]) {
                ellipse(ctx, r * 0.2, r * 0.95 * s, r * 0.55, r * 0.24, s * 0.55);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
                ctx.fill();
            }
            // Taches bioluminescentes : la lumière parcourt l'aile en vague
            for (const s of [1, -1]) {
                for (let j = 0; j < 3; j++) {
                    for (let k = 0; k < 5 - j; k++) {
                        const u = 0.3 + k * 0.14;
                        const x = r * 0.35 + (tipX - r * 0.35) * u - j * r * 0.28;
                        const y = s * (tipY * u * 0.92 - j * r * 0.06);
                        const on = 0.35 + 0.65 * Math.max(0, Math.sin(t * 3 - u * 6 - j));
                        const sr = r * (0.1 - u * 0.03);
                        ctx.globalAlpha = ga * on * 0.35;
                        circle(ctx, x, y, sr * 2.2);
                        ctx.fillStyle = glow;
                        ctx.fill();
                        ctx.globalAlpha = ga * (0.5 + 0.5 * on);
                        circle(ctx, x, y, sr);
                        ctx.fillStyle = on > 0.8 ? '#ffffff' : glow;
                        ctx.fill();
                    }
                }
            }
            ctx.globalAlpha = ga;
            ctx.restore();
            shape();
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = W;
            ctx.stroke();
            // Bord d'attaque phosphorescent + arête du dos
            ctx.beginPath();
            for (const s of [1, -1]) {
                ctx.moveTo(r * 0.95, r * 0.5 * s);
                ctx.quadraticCurveTo(r * 0.68, r * (1.62 + 0.1 * wave) * s, tipX - r * 0.04, (tipY - r * 0.1) * s);
            }
            ctx.strokeStyle = glow;
            ctx.globalAlpha = ga * (0.6 + 0.3 * Math.sin(t * 3));
            ctx.lineWidth = 1.8;
            ctx.stroke();
            ctx.globalAlpha = ga;
            ctx.beginPath();
            ctx.moveTo(r * 0.9, 0);
            ctx.lineTo(-r * 0.85, 0);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            for (const s of [1, -1]) {
                circle(ctx, r * 1.02, r * 0.38 * s, r * 0.07);
                ctx.fillStyle = glow;
                ctx.fill();
            }
        }
    },

    // Tapis des Mille Nuits (épique) : tapis qui ondule, bordures dorées, médaillon, franges
    // qui se balancent et poussière d'étoiles dans son sillage
    carpet: {
        anchors: [[0.95, 1.55], [-0.95, 1.55]],
        tip: [0.0, 2.15],
        shadow: [0.0, 1.45, 2.2],
        draw(ctx, r, [main, trim], t, W) {
            const X = r * 1.25;
            const Y = r * 2.1;
            const ga = ctx.globalAlpha;
            const wy = (x) => Math.sin((x / r) * 2.4 - t * 4) * r * 0.08;
            // Poussière d'étoiles derrière
            for (let k = 0; k < 7; k++) {
                const ph = (t * 0.7 + k / 7) % 1;
                ctx.globalAlpha = ga * (1 - ph);
                sparkle(ctx, -X - r * 0.4 - ph * r * 1.5, Math.sin(k * 2.7) * Y * 0.8 + Math.sin(t * 2 + k) * r * 0.15, r * 0.2 * (1 - ph * 0.6));
                ctx.fillStyle = k % 3 ? trim : '#ffffff';
                ctx.fill();
            }
            ctx.globalAlpha = ga;
            // Franges (devant et derrière)
            for (const sx of [1, -1]) {
                for (let i = 0; i <= 9; i++) {
                    const y = -Y + r * 0.1 + ((2 * Y - r * 0.2) * i) / 9;
                    const sway = Math.sin(t * 5 + i * 0.8 + sx) * r * 0.07;
                    const yy = y + wy(sx * X);
                    bone(ctx, [sx * X, yy, sx * (X + r * 0.3), yy + sway], 1.3, trim);
                    circle(ctx, sx * (X + r * 0.36), yy + sway, r * 0.075);
                    ink(ctx, shade(trim, -0.15), W * 0.4);
                }
            }
            const path = (ins) => {
                ctx.beginPath();
                const N = 16;
                for (let i = 0; i <= N; i++) {
                    const x = X - ins - (2 * (X - ins) * i) / N;
                    const y = Y - ins + wy(x);
                    if (i) ctx.lineTo(x, y);
                    else ctx.moveTo(x, y);
                }
                for (let i = 0; i <= N; i++) {
                    const x = -X + ins + (2 * (X - ins) * i) / N;
                    ctx.lineTo(x, -(Y - ins) + wy(x));
                }
                ctx.closePath();
            };
            path(0);
            ink(ctx, main, W);
            ctx.save();
            path(0);
            ctx.clip();
            // Bordures : or puis sombre, frise de losanges
            path(r * 0.18);
            ctx.strokeStyle = trim;
            ctx.lineWidth = r * 0.16;
            ctx.stroke();
            path(r * 0.4);
            ctx.strokeStyle = shade(main, -0.45);
            ctx.lineWidth = r * 0.16;
            ctx.stroke();
            ctx.fillStyle = trim;
            for (const sx of [1, -1]) {
                for (let i = 0; i < 9; i++) {
                    const x = sx * (X - r * 0.4);
                    const y = -Y + r * 0.6 + ((2 * Y - r * 1.2) * i) / 8 + wy(x);
                    ctx.beginPath();
                    ctx.moveTo(x, y - r * 0.08);
                    ctx.lineTo(x + r * 0.06, y);
                    ctx.lineTo(x, y + r * 0.08);
                    ctx.lineTo(x - r * 0.06, y);
                    ctx.closePath();
                    ctx.fill();
                }
            }
            // Médaillon central (losange à 3 niveaux) + fleur
            const diamond = (k, fill, lw) => {
                ctx.beginPath();
                ctx.moveTo(r * 0.8 * k, wy(r * 0.8 * k));
                ctx.lineTo(0, r * 1.35 * k + wy(0));
                ctx.lineTo(-r * 0.8 * k, wy(-r * 0.8 * k));
                ctx.lineTo(0, -r * 1.35 * k + wy(0));
                ctx.closePath();
                ink(ctx, fill, lw);
            };
            diamond(1, shade(main, -0.3), W * 0.6);
            diamond(0.68, trim, W * 0.5);
            diamond(0.4, shade(main, 0.15), W * 0.5);
            for (let i = 0; i < 6; i++) {
                const a = (i / 6) * TAU + t * 0.5;
                ellipse(ctx, Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.16 + wy(0), r * 0.1, r * 0.05, a);
                ctx.fillStyle = trim;
                ctx.fill();
            }
            circle(ctx, 0, wy(0), r * 0.08);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            // Petits motifs dans les coins
            for (const [cx, cy] of [[0.72, 1.55], [0.72, -1.55], [-0.72, 1.55], [-0.72, -1.55]]) {
                const x = r * cx;
                const y = r * cy + wy(x);
                ctx.beginPath();
                ctx.moveTo(x, y - r * 0.17);
                ctx.lineTo(x + r * 0.13, y);
                ctx.lineTo(x, y + r * 0.17);
                ctx.lineTo(x - r * 0.13, y);
                ctx.closePath();
                ink(ctx, trim, W * 0.4);
            }
            // Ondulation : bandes claires / sombres qui avancent vers l'arrière
            for (let i = 0; i < 12; i++) {
                const x0 = -X + (2 * X * i) / 12;
                const k = Math.sin(((x0 + X / 12) / r) * 2.4 - t * 4 + 1.2);
                ctx.globalAlpha = ga * Math.abs(k) * (k > 0 ? 0.16 : 0.22);
                ctx.fillStyle = k > 0 ? '#ffffff' : OUTLINE;
                ctx.fillRect(x0, -Y - r, (2 * X) / 12 + 0.5, 2 * Y + 2 * r);
            }
            ctx.globalAlpha = ga;
            ctx.restore();
            path(0);
            ctx.strokeStyle = OUTLINE;
            ctx.lineWidth = W;
            ctx.stroke();
        }
    },

    // Phénix Solaire (légendaire) : halo solaire, 3 couches de plumes par aile qui battent,
    // longues plumes de queue à ocelle, flammèches qui s'envolent, crête, braises en orbite
    phoenix: {
        anchors: [[0.5, 0.95], [-0.4, 1.1]],
        tip: [0.4, 2.6],
        shadow: [-0.3, 2.1, 2.7],
        draw(ctx, r, [flame, gold], t, W) {
            const ga = ctx.globalAlpha;
            const flap = Math.sin(t * 2.6) * 0.09;
            const deep = shade(flame, -0.4);
            const pale = shade(gold, 0.6);
            // Halo solaire
            const halo = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 3.0);
            halo.addColorStop(0, rgba(gold, 0.55));
            halo.addColorStop(0.5, rgba(flame, 0.22));
            halo.addColorStop(1, rgba(flame, 0));
            ctx.globalAlpha = ga * (0.85 + 0.15 * Math.sin(t * 4));
            circle(ctx, 0, 0, r * 3.0);
            ctx.fillStyle = halo;
            ctx.fill();
            ctx.globalAlpha = ga;
            // Plumes de queue (ocelle dorée au bout)
            for (const [k, a0] of [[1, 0.24], [-1, -0.24], [0, 0]]) {
                const ang = Math.PI + a0 + Math.sin(t * 2 + k * 1.3) * 0.08;
                const len = r * (k === 0 ? 3.0 : 2.55);
                feather(ctx, -r * 0.55, 0, ang, len, r * 0.5, [deep, flame, gold], W);
                const ex = -r * 0.55 + Math.cos(ang) * len * 0.8;
                const ey = Math.sin(ang) * len * 0.8;
                ellipse(ctx, ex, ey, r * 0.22, r * 0.14, ang);
                ink(ctx, gold, W * 0.5);
                ellipse(ctx, ex, ey, r * 0.1, r * 0.07, ang);
                ctx.fillStyle = deep;
                ctx.fill();
            }
            // Ailes
            const tips = [];
            for (const s of [1, -1]) {
                const S = [r * 0.35, r * 0.35 * s];
                const Wr = [r * 0.15, r * 1.55 * (1 + flap * 0.5) * s];
                const at = (u) => [S[0] + (Wr[0] - S[0]) * u, S[1] + (Wr[1] - S[1]) * u];
                // Rémiges primaires (les plus longues, en éventail au bout de l'aile)
                for (let k = 6; k >= 0; k--) {
                    const [bx, by] = at(0.55 + k * 0.075);
                    const ang = s * (Math.PI / 2 - 0.5 + k * 0.22 + flap);
                    const len = r * (1.6 - k * 0.06);
                    feather(ctx, bx, by, ang, len, r * 0.6, [deep, flame, gold, pale], W * 0.7);
                    tips.push([bx + Math.cos(ang) * len, by + Math.sin(ang) * len, s]);
                }
                // Rémiges secondaires (vers l'arrière)
                for (let k = 5; k >= 0; k--) {
                    const [bx, by] = at(0.05 + k * 0.13);
                    const ang = s * (Math.PI * 0.68 + k * 0.05 + flap * 0.5);
                    feather(ctx, bx, by, ang, r * (1.15 - k * 0.04), r * 0.55, [flame, gold, pale], W * 0.6);
                }
                // Couvertures : bras doré + petites plumes
                for (let k = 4; k >= 0; k--) {
                    const [bx, by] = at(0.08 + k * 0.2);
                    feather(ctx, bx, by, s * (Math.PI * 0.62 + k * 0.06 + flap * 0.3), r * 0.6, r * 0.38, [gold, pale], W * 0.7);
                }
                bone(ctx, [S[0], S[1], Wr[0], Wr[1]], r * 0.2, gold);
            }
            // Flammèches qui s'échappent du bout des plumes
            for (let i = 0; i < tips.length; i++) {
                const [x, y, s] = tips[i];
                const ph = (t * 1.5 + i * 0.37) % 1;
                ctx.globalAlpha = ga * (1 - ph);
                const fx = x - ph * r * 0.75;
                const fy = y + s * ph * r * 0.15;
                const fr = r * 0.15 * (1 - ph * 0.6);
                circle(ctx, fx, fy, fr);
                ctx.fillStyle = gold;
                ctx.fill();
                circle(ctx, fx, fy, fr * 0.5);
                ctx.fillStyle = '#fff6c8';
                ctx.fill();
            }
            ctx.globalAlpha = ga;
            // Crête (derrière la tête)
            for (const k of [-1, 0, 1]) {
                feather(ctx, r * 1.15, 0, Math.PI + k * 0.38, r * (k ? 0.6 : 0.75), r * 0.13, [gold, flame, deep], W * 0.7);
            }
            // Corps
            ellipse(ctx, r * 0.2, 0, r * 1.0, r * 0.38);
            ink(ctx, lin(ctx, 0, -r * 0.38, 0, r * 0.38, [pale, gold, flame, deep]), W);
            ellipse(ctx, r * 0.3, -r * 0.12, r * 0.6, r * 0.08);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fill();
            // Tête, bec, yeux
            ctx.beginPath();
            ctx.moveTo(r * 1.52, -r * 0.11);
            ctx.lineTo(r * 1.88, 0);
            ctx.lineTo(r * 1.52, r * 0.11);
            ctx.closePath();
            ink(ctx, pale, W * 0.6);
            circle(ctx, r * 1.25, 0, r * 0.33);
            ink(ctx, orb(ctx, r * 1.25, 0, r * 0.33, [pale, gold, flame]), W);
            for (const s of [1, -1]) {
                circle(ctx, r * 1.36, r * 0.15 * s, r * 0.07);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                circle(ctx, r * 1.38, r * 0.15 * s, r * 0.035);
                ctx.fillStyle = deep;
                ctx.fill();
            }
            // Braises en orbite qui scintillent
            for (let k = 0; k < 6; k++) {
                const a = t * 0.6 + (k / 6) * TAU;
                const tw = 0.5 + 0.5 * Math.sin(t * 6 + k * 1.7);
                ctx.globalAlpha = ga * (0.4 + 0.6 * tw);
                sparkle(ctx, Math.cos(a) * r * 2.3, Math.sin(a) * r * 2.6, r * (0.1 + 0.1 * tw));
                ctx.fillStyle = pale;
                ctx.fill();
            }
            ctx.globalAlpha = ga;
        }
    }
});

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
