/* ==================================
   NEXUS - RENDU DE LA PARTIE
   Carte, point de contrôle, héros, pouvoirs, projectiles, objets et effets.
   Les lumières (tirs, explosions, rayons, traînées) sont dessinées en mode
   additif (« lighter ») pour un rendu lumineux, façon jeu d'action.
   ================================== */

import { drawHero, TEAM_COLORS } from './sprites.js?v=3';
import { drawAnimatedDecor } from './map.js?v=2';
import { drawDocksDecor, pathAt } from './docks.js?v=1';

const TAU = Math.PI * 2;
const INK = '#0b1430';

function teamColor(team, viewer) {
    // Comme Overwatch : ton équipe en bleu, l'adversaire en rouge
    return team === viewer ? TEAM_COLORS.blue : TEAM_COLORS.red;
}

function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

// Pseudo-aléatoire stable (mêmes éclats d'une image à l'autre pour un même effet)
function rnd(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
}

// Point du sprite (x vers l'avant, y vers la droite) en coordonnées du monde
function local(f, fx, fy) {
    const c = Math.cos(f.angle), s = Math.sin(f.angle);
    return { x: f.x + c * fx - s * fy, y: f.y + s * fx + c * fy };
}

// Halo lumineux radial
function glow(ctx, x, y, r, color, a = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(color, a));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

/* ----- Convoi (Escorte) ----- */

// Partie déjà parcourue de la route, aux couleurs de l'équipe qui attaque
function drawEscortRoute(ctx, g, viewer) {
    const e = g.escort;
    const col = teamColor(e.attack, viewer);
    const pts = g.map.path;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (acc + len >= e.s) { ctx.lineTo(e.pos.x, e.pos.y); break; }
        ctx.lineTo(b.x, b.y);
        acc += len;
    }
    ctx.lineWidth = 34;
    ctx.strokeStyle = hexA(col, 0.32);
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.strokeStyle = hexA(col, 0.85);
    ctx.stroke();
    // Manche 2 : distance à battre
    const t = e.target;
    if (t && !t.complete) {
        const p = pathAt(g.map, t.s);
        const nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
        ctx.setLineDash([16, 10]);
        ctx.lineWidth = 8;
        ctx.strokeStyle = hexA(teamColor(t.team, viewer), 0.9);
        ctx.beginPath(); ctx.moveTo(p.x - nx * 130, p.y - ny * 130); ctx.lineTo(p.x + nx * 130, p.y + ny * 130); ctx.stroke();
        ctx.setLineDash([]);
    }
    ctx.restore();
}

// Zone d'effet du convoi (sous les héros)
function drawPayloadRange(ctx, g, viewer) {
    const e = g.escort;
    const { x, y } = e.pos;
    const r = 150;
    const t = g.time;
    const atk = teamColor(e.attack, viewer), def = teamColor(e.defend, viewer);
    const state = g.phase === 'live' ? e.state : 'idle';
    const col = state === 'push' ? atk : state === 'contested' ? '#ffd21e' : state === 'back' || state === 'blocked' ? def : '#ffffff';
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = hexA(col === '#ffffff' ? '#ffffff' : col, state === 'idle' ? 0.08 : 0.16);
    ctx.fill();
    ctx.setLineDash([22, 14]);
    ctx.lineDashOffset = -t * (state === 'push' ? 60 : state === 'back' ? -30 : 12);
    ctx.lineWidth = 6;
    ctx.strokeStyle = hexA(col, state === 'idle' ? 0.55 : 0.95);
    ctx.stroke();
    ctx.setLineDash([]);
    if (state === 'push' || state === 'contested') {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, x, y, r * 1.15, col, 0.14 + 0.05 * Math.sin(t * 5));
    }
    ctx.restore();
}

// Le véhicule : un camion blindé de livraison, phare et gyrophare
function drawPayload(ctx, g, viewer) {
    const e = g.escort;
    const { x, y, angle } = e.pos;
    const t = g.time;
    const atk = teamColor(e.attack, viewer);
    const moving = g.phase === 'live' && (e.state === 'push' || e.state === 'back');
    ctx.save();
    ctx.translate(x, y);
    // Ombre
    ctx.fillStyle = 'rgba(5, 10, 30, 0.35)';
    ctx.beginPath(); ctx.ellipse(8, 12, 70, 44, angle, 0, TAU); ctx.fill();
    ctx.rotate(angle);
    const bob = moving ? Math.sin(t * 18) * 1.2 : 0;
    ctx.translate(0, bob);
    ctx.lineJoin = 'round';
    // Chenilles / roues
    ctx.fillStyle = '#1d212b';
    for (const sy of [-36, 26]) {
        ctx.fillRect(-58, sy, 116, 10);
        ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(-58, sy, 116, 10);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
        const off = moving ? (t * 60) % 14 : 0;
        for (let k = -56 + off; k < 56; k += 14) { ctx.beginPath(); ctx.moveTo(k, sy + 1); ctx.lineTo(k, sy + 9); ctx.stroke(); }
    }
    // Caisse
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-60, -30, 112, 60, 10) : ctx.rect(-60, -30, 112, 60);
    ctx.fillStyle = '#e8edf5'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
    // Bande aux couleurs de l'attaque
    ctx.fillStyle = atk;
    ctx.fillRect(-52, -8, 72, 16);
    // Cabine (à l'avant)
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(28, -24, 36, 48, 8) : ctx.rect(28, -24, 36, 48);
    ctx.fillStyle = '#ff8a3c'; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = 'rgba(160, 220, 255, 0.85)';
    ctx.fillRect(48, -18, 10, 36);
    ctx.lineWidth = 3; ctx.strokeRect(48, -18, 10, 36);
    // Cargaison : noyau d'énergie qui pulse
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.beginPath(); ctx.arc(-18, 0, 15, 0, TAU);
    ctx.fillStyle = '#0b1430'; ctx.fill();
    ctx.beginPath(); ctx.arc(-18, 0, 10, 0, TAU);
    ctx.fillStyle = `rgba(255, 210, 30, ${0.6 + 0.4 * pulse})`; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    // Phares
    if (moving) {
        ctx.globalCompositeOperation = 'lighter';
        for (const sy of [-15, 15]) {
            const gr = ctx.createRadialGradient(70, sy, 0, 70, sy, 70);
            gr.addColorStop(0, 'rgba(255, 240, 190, 0.5)');
            gr.addColorStop(1, 'rgba(255, 240, 190, 0)');
            ctx.fillStyle = gr;
            ctx.beginPath(); ctx.arc(70, sy, 70, -0.5, 0.5); ctx.lineTo(70, sy); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
    }
    // Gyrophare (orange quand il avance, rouge quand il recule)
    const on = Math.sin(t * 10) > 0;
    ctx.beginPath(); ctx.arc(40, 0, 7, 0, TAU);
    ctx.fillStyle = !moving ? '#7a808c' : e.state === 'back' ? (on ? '#ff3b4f' : '#7a1d28') : on ? '#ffb02e' : '#8a5a12';
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
    // Progression (anneau au-dessus du véhicule)
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y - 78, 20, 0, TAU);
    ctx.fillStyle = INK; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y - 78, 20, -Math.PI / 2, -Math.PI / 2 + e.progress * TAU);
    ctx.lineWidth = 6; ctx.strokeStyle = atk; ctx.stroke();
    ctx.font = '700 20px "Bebas Neue", Impact, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    const c = e.count || { blue: 0, red: 0 };
    ctx.fillText(g.contested ? '!' : g.phase === 'live' && c[e.attack] > 0 ? `${Math.min(3, c[e.attack])}` : '•', x, y - 77);
    ctx.restore();
}

/* ----- Point de contrôle ----- */

function drawPoint(ctx, g, viewer) {
    const p = g.map.point;
    const t = g.time;
    const locked = g.phase === 'setup';
    const ownerCol = g.owner ? teamColor(g.owner, viewer) : '#ffffff';
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fillStyle = locked ? 'rgba(255,255,255,0.08)' : g.owner ? hexA(ownerCol, 0.2) : 'rgba(255,255,255,0.14)';
    ctx.fill();
    // Lueur de l'équipe qui contrôle
    if (g.owner && !locked) {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, p.x, p.y, p.r * 1.2, ownerCol, 0.18 + 0.06 * Math.sin(t * 3));
        ctx.globalCompositeOperation = 'source-over';
    }
    ctx.setLineDash([26, 16]);
    ctx.lineDashOffset = -t * 30;
    ctx.lineWidth = 8;
    ctx.strokeStyle = locked ? 'rgba(255,255,255,0.5)' : g.contested ? '#ffd21e' : ownerCol;
    ctx.stroke();
    ctx.setLineDash([]);
    // Progression de capture : arc lumineux autour du point
    if (g.progress.value > 0 && g.progress.team) {
        const col = teamColor(g.progress.team, viewer);
        const a1 = -Math.PI / 2 + (g.progress.value / 100) * TAU;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 14, -Math.PI / 2, a1);
        ctx.lineWidth = 14;
        ctx.strokeStyle = col;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, p.x + Math.cos(a1) * (p.r + 14), p.y + Math.sin(a1) * (p.r + 14), 36, col, 0.8);
        ctx.globalCompositeOperation = 'source-over';
        // Particules qui montent pendant la capture
        for (let i = 0; i < 10; i++) {
            const a = rnd(i) * TAU, k = (t * 0.8 + rnd(i + 5)) % 1;
            const r = p.r * (0.2 + rnd(i + 9) * 0.75);
            ctx.globalAlpha = 0.7 * (1 - k);
            ctx.fillStyle = col;
            ctx.fillRect(p.x + Math.cos(a) * r - 3, p.y + Math.sin(a) * r - k * 60 - 3, 6, 6);
        }
        ctx.globalAlpha = 1;
    }
    const k = (t * 0.5) % 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * k, 0, TAU);
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(255,255,255,${0.3 * (1 - k)})`;
    ctx.stroke();
    // Emblème
    ctx.beginPath(); ctx.arc(p.x, p.y, 46, 0, TAU);
    ctx.fillStyle = g.owner ? ownerCol : INK; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.fillStyle = '#ffffff';
    if (locked) {
        ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(p.x, p.y - 8, 12, Math.PI, 0); ctx.stroke();
        ctx.fillRect(p.x - 17, p.y - 8, 34, 26);
    } else {
        ctx.font = '700 54px "Bebas Neue", Impact, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = g.owner ? INK : '#ffffff';
        ctx.fillText('A', p.x, p.y + 3);
    }
    ctx.restore();
}

/* ----- Pouvoirs visibles sur les héros ----- */

function drawBarrier(ctx, f, col, t) {
    const b = f.barrier;
    if (!b?.up) return;
    const k = b.hp / b.max;
    const flash = b.flash || 0;
    ctx.save();
    // Remplissage translucide en éventail
    ctx.beginPath();
    ctx.arc(f.x, f.y, b.radius + 8, b.angle - b.half, b.angle + b.half);
    ctx.arc(f.x, f.y, b.radius - 8, b.angle + b.half, b.angle - b.half, true);
    ctx.closePath();
    ctx.fillStyle = hexA(col, 0.18 + 0.25 * k + flash * 0.3);
    ctx.fill();
    // Hexagones du bouclier
    ctx.globalCompositeOperation = 'lighter';
    const n = 9;
    for (let i = 0; i < n; i++) {
        const a = b.angle - b.half + ((i + 0.5) / n) * b.half * 2;
        const hx = f.x + Math.cos(a) * b.radius, hy = f.y + Math.sin(a) * b.radius;
        ctx.beginPath();
        for (let j = 0; j < 6; j++) {
            const ha = a + (j / 6) * TAU;
            const px = hx + Math.cos(ha) * 9, py = hy + Math.sin(ha) * 9;
            if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        const pulse = 0.35 + 0.25 * Math.sin(t * 4 + i);
        ctx.strokeStyle = hexA('#ffffff', (pulse + flash) * (0.4 + 0.6 * k));
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    // Bord extérieur lumineux
    ctx.beginPath();
    ctx.arc(f.x, f.y, b.radius + 8, b.angle - b.half, b.angle + b.half);
    ctx.lineWidth = 3;
    ctx.strokeStyle = hexA('#ffffff', 0.6 + flash * 0.4);
    ctx.stroke();
    ctx.restore();
}

function drawMatrix(ctx, f, t) {
    if (!f.matrix?.on) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.arc(f.x, f.y, 270, f.angle - 0.62, f.angle + 0.62);
    ctx.closePath();
    const g = ctx.createRadialGradient(f.x, f.y, 30, f.x, f.y, 270);
    g.addColorStop(0, 'rgba(255, 111, 181, 0.0)');
    g.addColorStop(0.7, 'rgba(255, 111, 181, 0.18)');
    g.addColorStop(1, 'rgba(255, 150, 210, 0.45)');
    ctx.fillStyle = g;
    ctx.fill();
    // Grille qui défile
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 190, 230, 0.35)';
    ctx.lineWidth = 2;
    for (let r = ((t * 120) % 30); r < 270; r += 30) {
        ctx.beginPath(); ctx.arc(f.x, f.y, r, f.angle - 0.62, f.angle + 0.62); ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(f.x, f.y, 270, f.angle - 0.62, f.angle + 0.62);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 200, 235, 0.9)';
    ctx.stroke();
    ctx.restore();
}

function drawBeam(ctx, f, t) {
    if (!f.beam) return;
    const col = f.beam.mode === 'heal' ? '#ffe27a' : '#7fc8ff';
    const s = local(f, 38, 12);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const target of f.beam.chain || [f.beam.target]) {
        const mx = (s.x + target.x) / 2 + Math.sin(t * 8) * 12, my = (s.y + target.y) / 2 + Math.cos(t * 7) * 12;
        const path = () => { ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(mx, my, target.x, target.y); };
        path(); ctx.lineWidth = 22; ctx.strokeStyle = hexA(col, 0.12); ctx.stroke();
        path(); ctx.lineWidth = 9; ctx.strokeStyle = hexA(col, 0.4); ctx.stroke();
        path(); ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        // Particules qui voyagent le long du rayon
        for (let i = 0; i < 5; i++) {
            const k = (t * 1.6 + i / 5) % 1;
            const u = 1 - k;
            const px = u * u * s.x + 2 * u * k * mx + k * k * target.x;
            const py = u * u * s.y + 2 * u * k * my + k * k * target.y;
            glow(ctx, px, py, 10, col, 0.9);
        }
        glow(ctx, target.x, target.y, target.r + 22, col, 0.35);
    }
    glow(ctx, s.x, s.y, 18, col, 0.9);
    ctx.restore();
}

function drawAura(ctx, f, t) {
    if (f.heroId !== 'tempo') return;
    const col = f.track === 'heal' ? '#7ee34f' : '#ffd21e';
    const boost = f.boostT > 0;
    ctx.save();
    ctx.beginPath(); ctx.arc(f.x, f.y, 280, 0, TAU);
    ctx.fillStyle = hexA(col, boost ? 0.12 : 0.05);
    ctx.fill();
    // Ondes musicales qui partent de Tempo
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
        const k = (t * (boost ? 1.4 : 0.7) + i / 3) % 1;
        ctx.beginPath(); ctx.arc(f.x, f.y, 30 + k * 250, 0, TAU);
        ctx.lineWidth = boost ? 5 : 3;
        ctx.strokeStyle = hexA(col, (boost ? 0.55 : 0.3) * (1 - k));
        ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.setLineDash([10, 14]);
    ctx.lineDashOffset = -t * 40;
    ctx.beginPath(); ctx.arc(f.x, f.y, 280, 0, TAU);
    ctx.lineWidth = boost ? 5 : 3;
    ctx.strokeStyle = hexA(col, boost ? 0.85 : 0.45);
    ctx.stroke();
    // Notes de musique autour de lui
    ctx.setLineDash([]);
    ctx.font = '700 22px Rubik, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
        const a = t * 1.2 + (i / 3) * TAU;
        const k = (t * 0.9 + i / 3) % 1;
        ctx.globalAlpha = 0.8 * (1 - k);
        ctx.fillStyle = col;
        ctx.fillText(i % 2 ? '♪' : '♫', f.x + Math.cos(a) * 46, f.y + Math.sin(a) * 46 - k * 30);
    }
    ctx.restore();
}

function drawStatus(ctx, f, t) {
    // Étourdi : étoiles qui tournent ; immobilisé : mâchoire ; amplifié : halo bleu ; bouclier temporaire : halo vert
    if (f.stun > 0) {
        for (let i = 0; i < 3; i++) {
            const a = t * 5 + (i / 3) * TAU;
            const x = f.x + Math.cos(a) * (f.r + 6), y = f.y - f.r - 10 + Math.sin(a) * 6;
            ctx.fillStyle = '#ffd21e';
            ctx.beginPath();
            for (let j = 0; j < 10; j++) {
                const r = j % 2 ? 2.5 : 6, aa = (j / 10) * TAU - Math.PI / 2;
                ctx.lineTo(x + Math.cos(aa) * r, y + Math.sin(aa) * r);
            }
            ctx.closePath(); ctx.fill();
        }
    }
    if (f.root > 0) {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 6, 0, TAU);
        ctx.lineWidth = 7; ctx.strokeStyle = '#9aa3b2'; ctx.stroke();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            ctx.beginPath();
            ctx.moveTo(f.x + Math.cos(a) * (f.r + 3), f.y + Math.sin(a) * (f.r + 3));
            ctx.lineTo(f.x + Math.cos(a) * (f.r - 4), f.y + Math.sin(a) * (f.r - 4));
            ctx.lineWidth = 3; ctx.strokeStyle = '#e8edf5'; ctx.stroke();
        }
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (f.amp > 0) glow(ctx, f.x, f.y, f.r + 26, '#7fc8ff', 0.45);
    if (f.over > 0) {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 18, 0, TAU);
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(216, 255, 122, 0.85)'; ctx.stroke();
        glow(ctx, f.x, f.y, f.r + 30, '#d8ff7a', 0.25);
    }
    if (f.ultActive) {
        glow(ctx, f.x, f.y, f.r + 40, '#ffe27a', 0.35 + 0.15 * Math.sin(t * 6));
    }
    if (f.hurtT > 0) glow(ctx, f.x, f.y, f.r + 12, '#ff3b4f', f.hurtT * 4);
    if (f.nano > 0) {
        glow(ctx, f.x, f.y, f.r + 34, '#5ff3ff', 0.4 + 0.15 * Math.sin(t * 8));
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 20, t * 3, t * 3 + 4.2);
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(160, 250, 255, 0.9)'; ctx.stroke();
    }
    if (f.healBoost > 0) glow(ctx, f.x, f.y, f.r + 20, '#c98bff', 0.3);
    if (f.breatheT > 0) glow(ctx, f.x, f.y, f.r + 24, '#ffb03a', 0.35);
    ctx.restore();
    // Endormi : « Zzz » qui montent
    if (f.sleep > 0) {
        ctx.font = '800 18px Rubik, sans-serif';
        ctx.textAlign = 'center';
        for (let i = 0; i < 3; i++) {
            const k = (t * 0.7 + i / 3) % 1;
            ctx.globalAlpha = 1 - k;
            ctx.lineWidth = 3; ctx.strokeStyle = INK;
            ctx.strokeText('z', f.x + 10 + k * 16, f.y - f.r - 14 - k * 30);
            ctx.fillStyle = '#b6ff8a';
            ctx.fillText('z', f.x + 10 + k * 16, f.y - f.r - 14 - k * 30);
        }
        ctx.globalAlpha = 1;
    }
    // Soins bloqués (grenade biotique) : croix barrée violette
    if (f.antiHeal > 0) {
        ctx.save();
        ctx.translate(f.x - f.r - 12, f.y - f.r - 8);
        ctx.fillStyle = '#c98bff';
        ctx.fillRect(-2, -7, 4, 14);
        ctx.fillRect(-7, -2, 14, 4);
        ctx.strokeStyle = '#ff3b4f'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.stroke();
        ctx.restore();
    }
    if (f.casting) {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 16, -Math.PI / 2, -Math.PI / 2 + (1 - f.casting.t) * TAU);
        ctx.lineWidth = 5; ctx.strokeStyle = '#ffe27a'; ctx.stroke();
    }
    if (f.recall) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(f.recall.x, f.recall.y, f.r + 6, 0, TAU);
        ctx.lineWidth = 3; ctx.strokeStyle = '#5ff3ff'; ctx.stroke();
        ctx.restore();
    }
    // Propulseurs / charge : flammes derrière
    if (f.boosting || f.charging) {
        const a = Math.atan2(f.dash?.vy || 0, f.dash?.vx || 1) + Math.PI;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) {
            const d = f.r + 6 + i * 9 + rnd(t * 30 + i) * 6;
            glow(ctx, f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 16 - i * 2, f.charging ? '#ff9a3c' : '#ffb03a', 0.7 - i * 0.1);
        }
        ctx.restore();
    }
}

/* ----- Projectiles ----- */

function drawTrail(ctx, p, color, width, alpha = 0.8) {
    const tr = p.trail;
    if (!tr || tr.length < 4) return;
    ctx.lineCap = 'round';
    for (let i = 2; i < tr.length; i += 2) {
        const k = i / tr.length;
        ctx.beginPath();
        ctx.moveTo(tr[i - 2], tr[i - 1]);
        ctx.lineTo(tr[i], tr[i + 1]);
        ctx.lineWidth = width * k;
        ctx.strokeStyle = hexA(color, alpha * k);
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(tr[tr.length - 2], tr[tr.length - 1]);
    ctx.lineTo(p.x, p.y);
    ctx.lineWidth = width;
    ctx.strokeStyle = hexA(color, alpha);
    ctx.stroke();
}

function drawProjectile(ctx, p, t) {
    const col = p.color || '#fff';
    ctx.save();
    if (p.kind === 'firestrike') {
        const a = Math.atan2(p.vy, p.vx);
        ctx.globalCompositeOperation = 'lighter';
        drawTrail(ctx, p, '#ff5a1f', 44, 0.35);
        ctx.translate(p.x, p.y); ctx.rotate(a);
        for (let i = 0; i < 6; i++) {
            const ox = -i * 9 + rnd(t * 40 + i) * 6, oy = (rnd(t * 33 + i * 3) - 0.5) * 30;
            glow(ctx, ox, oy, 26 - i * 2, i < 2 ? '#fff2a0' : '#ff7a1f', 0.75);
        }
        // Croissant de flammes
        ctx.beginPath();
        ctx.arc(-14, 0, 34, -1.2, 1.2);
        ctx.lineWidth = 10;
        ctx.strokeStyle = 'rgba(255, 230, 150, 0.9)';
        ctx.stroke();
    } else if (p.kind === 'pulse') {
        ctx.globalCompositeOperation = 'lighter';
        if (!p.stuck && !p.stuckTo) drawTrail(ctx, p, '#5ff3ff', 8, 0.7);
        const fusing = p.fuse !== undefined;
        const blink = fusing ? (Math.sin(t * (20 + (1 - p.fuse) * 40)) > 0 ? 1 : 0.4) : 1;
        glow(ctx, p.x, p.y, 34, '#5ff3ff', 0.6 * blink);
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU);
        ctx.fillStyle = '#e8feff'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#1a6c7a'; ctx.stroke();
        if (fusing) {
            ctx.beginPath(); ctx.arc(p.x, p.y, 170, 0, TAU);
            ctx.setLineDash([12, 10]);
            ctx.lineDashOffset = -t * 60;
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(95, 243, 255, 0.7)'; ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(p.x, p.y, 170 * (1 - p.fuse), 0, TAU);
            ctx.fillStyle = 'rgba(95, 243, 255, 0.1)'; ctx.fill();
        }
    } else if (p.kind === 'grenade') {
        // Fumée grise derrière, mèche qui crépite
        drawTrail(ctx, p, '#c9c2b5', 10, 0.35);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fillStyle = '#59703c'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x - 2, p.y - 3, 3, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, p.x + 4, p.y - 6, 10 + Math.abs(Math.sin(t * 25)) * 6, '#ffb03a', 0.9);
    } else if (p.kind === 'missile') {
        const a = Math.atan2(p.vy, p.vx);
        ctx.globalCompositeOperation = 'lighter';
        drawTrail(ctx, p, '#ffb03a', 6, 0.6);
        glow(ctx, p.x - Math.cos(a) * 6, p.y - Math.sin(a) * 6, 12, '#ffd38a', 0.9);
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(p.x, p.y); ctx.rotate(a);
        ctx.fillStyle = '#f4f4f8';
        ctx.fillRect(-6, -3, 12, 6);
        ctx.fillStyle = '#ff6fb5';
        ctx.fillRect(4, -3, 3, 6);
    } else if (p.kind === 'sonic') {
        // Anneaux sonores
        const a = Math.atan2(p.vy, p.vx);
        ctx.globalCompositeOperation = 'lighter';
        drawTrail(ctx, p, '#7ee34f', 8, 0.35);
        glow(ctx, p.x, p.y, 18, '#9dff6a', 0.7);
        ctx.translate(p.x, p.y); ctx.rotate(a);
        for (let i = 0; i < 2; i++) {
            ctx.beginPath();
            ctx.arc(-i * 8, 0, 9 + i * 3, -1, 1);
            ctx.lineWidth = 3;
            ctx.strokeStyle = `rgba(216, 255, 154, ${0.9 - i * 0.35})`;
            ctx.stroke();
        }
    } else if (p.kind === 'hook') {
        // Chaîne tendue depuis Ragnok
        const o = p.owner;
        if (o?.alive) {
            const n = Math.max(2, Math.floor(Math.hypot(p.x - o.x, p.y - o.y) / 12));
            for (let i = 0; i <= n; i++) {
                const k = i / n;
                ctx.beginPath(); ctx.arc(o.x + (p.x - o.x) * k, o.y + (p.y - o.y) * k, 3.5, 0, TAU);
                ctx.fillStyle = i % 2 ? '#9aa3b2' : '#c3ccd8'; ctx.fill();
                ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
            }
        }
        const a = Math.atan2(p.vy, p.vx);
        ctx.translate(p.x, p.y); ctx.rotate(a);
        ctx.beginPath(); ctx.arc(0, 0, 11, -2.3, 2.3);
        ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke();
        ctx.lineWidth = 5; ctx.strokeStyle = '#d7dde8'; ctx.stroke();
    } else if (p.kind === 'helix') {
        // Roquettes qui tournent en hélice
        const a = Math.atan2(p.vy, p.vx);
        const off = Math.sin(p.age * 40 + p.phase) * 7;
        const x = p.x - Math.sin(a) * off, y = p.y + Math.cos(a) * off;
        ctx.globalCompositeOperation = 'lighter';
        drawTrail(ctx, p, '#7fd8ff', 7, 0.5);
        glow(ctx, x, y, 16, '#bfeaff', 0.9);
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU);
        ctx.fillStyle = '#ffffff'; ctx.fill();
    } else if (p.kind === 'dart') {
        const a = Math.atan2(p.vy, p.vx);
        ctx.globalCompositeOperation = 'lighter';
        drawTrail(ctx, p, '#b6ff8a', 4, 0.6);
        ctx.translate(p.x, p.y); ctx.rotate(a);
        ctx.fillStyle = '#e8ffd8';
        ctx.fillRect(-10, -1.5, 16, 3);
        ctx.fillStyle = '#7ee34f';
        ctx.fillRect(-12, -3, 4, 6);
    } else if (p.kind === 'orb') {
        // Orbe biotique : sphère dorée et halo de soin
        ctx.globalCompositeOperation = 'lighter';
        drawTrail(ctx, p, '#ffd84a', 14, 0.3);
        glow(ctx, p.x, p.y, 150, '#ffd84a', 0.12);
        glow(ctx, p.x, p.y, 34, '#ffe98a', 0.8);
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, TAU);
        ctx.fillStyle = '#fff6c8'; ctx.fill();
        for (let i = 0; i < 3; i++) {
            const a = t * 4 + (i / 3) * TAU;
            ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 18, p.y + Math.sin(a) * 18, 3, 0, TAU);
            ctx.fillStyle = '#ffd84a'; ctx.fill();
        }
    } else if (p.kind === 'bionade') {
        ctx.globalCompositeOperation = 'lighter';
        drawTrail(ctx, p, '#c98bff', 8, 0.5);
        glow(ctx, p.x, p.y, 18, '#c98bff', 0.9);
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, TAU);
        ctx.fillStyle = '#efe0ff'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    } else {
        ctx.globalCompositeOperation = 'lighter';
        drawTrail(ctx, p, col, 6, 0.5);
        glow(ctx, p.x, p.y, 14, col, 0.8);
    }
    ctx.restore();
}

/* ----- Rayons et cônes des nouveaux héros ----- */

// Arc électrique en zigzag entre deux points
function lightning(ctx, ax, ay, bx, by, t, seed) {
    const n = 7;
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    for (let i = 1; i < n; i++) {
        const k = i / n;
        const off = (rnd(Math.floor(t * 30) + seed * 7 + i) - 0.5) * 34;
        ctx.lineTo(ax + dx * k + nx * off, ay + dy * k + ny * off);
    }
    ctx.lineTo(bx, by);
}

function drawHeroBeams(ctx, f, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Canon Tesla (Kodo)
    if (f.teslaFiring) {
        const { x: sx, y: sy } = local(f, 46, 0);
        glow(ctx, sx, sy, 26, '#5ff3ff', 0.8);
        const targets = f.tesla?.length ? f.tesla : [{ x: f.x + Math.cos(f.angle) * 200, y: f.y + Math.sin(f.angle) * 200 }];
        targets.forEach((tg, i) => {
            lightning(ctx, sx, sy, tg.x, tg.y, t, i + 1);
            ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(95, 243, 255, 0.25)'; ctx.stroke();
            ctx.lineWidth = 2.5; ctx.strokeStyle = '#e8feff'; ctx.stroke();
            if (f.tesla?.length) glow(ctx, tg.x, tg.y, 26, '#5ff3ff', 0.6);
        });
    }
    // Étreinte : soin en cône (Vespera)
    if (f.spray) {
        const h = local(f, 20, -12);
        glow(ctx, h.x, h.y, 22, '#ffd84a', 0.9);
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.arc(f.x, f.y, 230, f.angle - 0.5, f.angle + 0.5);
        ctx.closePath();
        const g = ctx.createRadialGradient(h.x, h.y, 10, f.x, f.y, 230);
        g.addColorStop(0, 'rgba(255, 216, 74, 0.45)');
        g.addColorStop(1, 'rgba(255, 216, 74, 0)');
        ctx.fillStyle = g;
        ctx.fill();
        for (let i = 0; i < 10; i++) {
            const k = (t * 1.8 + i / 10) % 1;
            const a = f.angle + (rnd(i * 3.1) - 0.5) * 0.9;
            glow(ctx, f.x + Math.cos(a) * 230 * k, f.y + Math.sin(a) * 230 * k, 10 + k * 10, '#ffe98a', 0.6 * (1 - k));
        }
    }
    // Étreinte : drain (Vespera)
    if (f.drain) {
        const { x: sx, y: sy } = local(f, 20, 12);
        const d = f.drain;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo((sx + d.x) / 2 + Math.sin(t * 9) * 16, (sy + d.y) / 2 + Math.cos(t * 9) * 16, d.x, d.y);
        ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(179, 92, 255, 0.25)'; ctx.stroke();
        ctx.lineWidth = 4; ctx.strokeStyle = '#e2c4ff'; ctx.stroke();
        // La vie remonte vers Vespera
        for (let i = 0; i < 4; i++) {
            const k = 1 - ((t * 1.5 + i / 4) % 1);
            glow(ctx, sx + (d.x - sx) * k, sy + (d.y - sy) * k, 9, '#b35cff', 0.9);
        }
    }
    // Coalescence (Vespera)
    if (f.coal) {
        const h = local(f, 22, 0);
        const ex = f.x + Math.cos(f.angle) * f.coal.len, ey = f.y + Math.sin(f.angle) * f.coal.len;
        const w = 40 + Math.sin(t * 14) * 6;
        const grad = ctx.createLinearGradient(f.x, f.y, ex, ey);
        grad.addColorStop(0, 'rgba(255, 216, 74, 0.8)');
        grad.addColorStop(0.5, 'rgba(255, 160, 220, 0.7)');
        grad.addColorStop(1, 'rgba(179, 92, 255, 0.8)');
        ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(ex, ey);
        ctx.lineWidth = w * 2; ctx.strokeStyle = 'rgba(200, 130, 255, 0.15)'; ctx.stroke();
        ctx.lineWidth = w; ctx.strokeStyle = grad; ctx.stroke();
        ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        glow(ctx, ex, ey, 50, '#d6a6ff', 0.8);
    }
    // Visière tactique (Kade) : réticule sur la cible verrouillée
    if (f.lockOn?.alive) {
        const l = f.lockOn;
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = '#ff3b4f';
        ctx.lineWidth = 3;
        const r = l.r + 14 + Math.sin(t * 10) * 3;
        ctx.beginPath(); ctx.arc(l.x, l.y, r, 0, TAU); ctx.stroke();
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU + t * 2;
            ctx.beginPath();
            ctx.moveTo(l.x + Math.cos(a) * (r - 6), l.y + Math.sin(a) * (r - 6));
            ctx.lineTo(l.x + Math.cos(a) * (r + 8), l.y + Math.sin(a) * (r + 8));
            ctx.stroke();
        }
    }
    // Fleur de mort (Nox) : tourbillon rouge
    if (f.heroId === 'nox' && f.ultActive) {
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.arc(f.x, f.y, 60 + i * 55, t * 9 + i, t * 9 + i + 2.2);
            ctx.lineWidth = 10 - i * 2; ctx.strokeStyle = `rgba(255, 59, 79, ${0.5 - i * 0.12})`; ctx.stroke();
        }
        glow(ctx, f.x, f.y, 230, '#ff3b4f', 0.15);
    }
    ctx.restore();
}

/* ----- Objets ----- */

function drawObject(ctx, o, g, viewer) {
    const col = teamColor(o.team, viewer);
    ctx.save();
    if (o.kind === 'soul') {
        // Héros tombé : orbe fantôme (cible de résurrection)
        const bob = Math.sin(g.time * 3 + o.x) * 4;
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, o.x, o.y + bob, 34, col, 0.45);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(o.x, o.y + bob, 18, 0, TAU);
        ctx.fillStyle = hexA(col, 0.35); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
        ctx.font = '700 20px Rubik, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText('✝', o.x, o.y + bob + 1);
        // Temps restant avant la réapparition
        ctx.beginPath(); ctx.arc(o.x, o.y + bob, 23, -Math.PI / 2, -Math.PI / 2 + (o.life / 10) * TAU);
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
    } else if (o.kind === 'mine') {
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, o.x, o.y, 26, '#ff3b3b', Math.sin(g.time * 10) > 0 ? 0.6 : 0.15);
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 3, 0, TAU);
        ctx.fillStyle = '#f2c14e'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r - 3, 0, TAU);
        ctx.lineWidth = 2; ctx.strokeStyle = '#7a5a2b'; ctx.stroke();
        ctx.beginPath(); ctx.arc(o.x, o.y, 4, 0, TAU);
        ctx.fillStyle = Math.sin(g.time * 10) > 0 ? '#ff3b3b' : '#5a0000'; ctx.fill();
    } else if (o.kind === 'trap') {
        ctx.translate(o.x, o.y);
        ctx.globalAlpha = o.arm > 0 ? 0.55 : 1;
        ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU);
        ctx.fillStyle = '#6d7482'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, 13, 0, TAU);
        ctx.fillStyle = '#3d424d'; ctx.fill();
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * TAU;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 19, Math.sin(a) * 19);
            ctx.lineTo(Math.cos(a + 0.13) * 11, Math.sin(a + 0.13) * 11);
            ctx.lineTo(Math.cos(a + 0.26) * 19, Math.sin(a + 0.26) * 19);
            ctx.fillStyle = '#e8edf5'; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(0, 0, 25, 0, TAU);
        ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
    } else if (o.kind === 'tire') {
        // Traînée de fumée + étincelles
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
            const d = 24 + i * 10;
            glow(ctx, o.x - Math.cos(o.angle) * d, o.y - Math.sin(o.angle) * d, 14 - i * 2, '#ffb03a', 0.4);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.translate(o.x, o.y);
        ctx.rotate(o.angle);
        ctx.beginPath(); ctx.ellipse(0, 0, 18, 24, 0, 0, TAU);
        ctx.fillStyle = '#26262b'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        // Crampons qui défilent (rotation)
        ctx.fillStyle = '#5a5a60';
        const off = (g.time * 120) % 8;
        for (let i = -3; i <= 3; i++) ctx.fillRect(-17, i * 8 - 1.5 + off - 4, 34, 3);
        // Dynamite sur le pneu
        ctx.fillStyle = '#c0392b';
        ctx.fillRect(-6, -12, 12, 24);
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU);
        ctx.fillStyle = Math.sin(g.time * 18) > 0 ? '#ff3b3b' : '#ffb03a'; ctx.fill();
        ctx.rotate(-o.angle);
        ctx.beginPath(); ctx.arc(0, 0, 32, 0, TAU);
        ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
        // Barre de vie du pneu
        ctx.fillStyle = 'rgba(11,20,48,0.85)'; ctx.fillRect(-24, -44, 48, 7);
        ctx.fillStyle = '#ff6b7f'; ctx.fillRect(-23, -43, 46 * Math.max(0, o.hp / o.maxHp), 5);
    } else if (o.kind === 'dome') {
        // Dôme de Kodo : bulle hexagonale translucide
        const k = o.hp / o.max;
        const pop = Math.min(1, o.age * 5);
        const r = o.radius * pop;
        ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, TAU);
        ctx.fillStyle = hexA(col, 0.12 + 0.08 * k + o.flash * 0.2);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineWidth = 4;
        ctx.strokeStyle = hexA('#ffffff', 0.55 + o.flash * 0.4);
        ctx.stroke();
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = hexA(col, 0.25 + o.flash * 0.3);
        ctx.lineWidth = 1.5;
        for (let gy = -r; gy < r; gy += 26) {
            for (let gx = -r + ((gy / 26) % 2 ? 13 : 0); gx < r; gx += 26) {
                ctx.beginPath();
                for (let j = 0; j < 6; j++) ctx.lineTo(o.x + gx + Math.cos((j / 6) * TAU) * 12, o.y + gy + Math.sin((j / 6) * TAU) * 12);
                ctx.closePath();
                ctx.stroke();
            }
        }
        ctx.restore();
        // Fin proche : clignote
        if (o.life < 1.5 && Math.sin(g.time * 20) > 0) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, TAU); ctx.stroke(); }
    } else if (o.kind === 'field') {
        // Champ biotique de Kade : zone de soin pulsante
        const pulse = 0.5 + 0.5 * Math.sin(g.time * 4);
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU);
        ctx.fillStyle = hexA('#7fd8ff', 0.1 + 0.05 * pulse); ctx.fill();
        ctx.setLineDash([12, 8]);
        ctx.lineDashOffset = -g.time * 30;
        ctx.lineWidth = 3; ctx.strokeStyle = hexA('#7fd8ff', 0.8); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, o.x, o.y, 40, '#7fd8ff', 0.6);
        ctx.fillStyle = '#e8f8ff';
        ctx.fillRect(o.x - 3, o.y - 12, 6, 24);
        ctx.fillRect(o.x - 12, o.y - 3, 24, 6);
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU + g.time;
            const k = (g.time * 0.8 + i / 6) % 1;
            ctx.fillStyle = hexA('#bff0ff', 1 - k);
            ctx.fillRect(o.x + Math.cos(a) * o.r * 0.6 - 2, o.y + Math.sin(a) * o.r * 0.6 - k * 40 - 2, 4, 4);
        }
    } else if (o.kind === 'mechBomb') {
        const k = Math.max(0, o.fuse / 3);
        ctx.beginPath(); ctx.arc(o.x, o.y, 430, 0, TAU);
        ctx.fillStyle = `rgba(255, 111, 181, ${0.06 + 0.14 * (1 - k)})`; ctx.fill();
        ctx.setLineDash([18, 12]);
        ctx.lineDashOffset = -g.time * 80;
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255, 111, 181, 0.9)'; ctx.stroke();
        ctx.setLineDash([]);
        // Onde qui se resserre vers le méca
        const w = (g.time * 2) % 1;
        ctx.beginPath(); ctx.arc(o.x, o.y, 430 * (1 - w), 0, TAU);
        ctx.lineWidth = 3; ctx.strokeStyle = `rgba(255, 200, 230, ${0.5 * w})`; ctx.stroke();
        drawHero(ctx, 'volta', { x: o.x, y: o.y, angle: o.angle, t: g.time, ring: false, moving: true });
        ctx.globalCompositeOperation = 'lighter';
        const blink = Math.sin(g.time * (10 + (1 - k) * 30)) > 0;
        glow(ctx, o.x, o.y, 70, blink ? '#ffffff' : '#ff6fb5', blink ? 0.65 : 0.35);
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = '700 46px "Bebas Neue", Impact, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 6; ctx.strokeStyle = INK;
        ctx.strokeText(o.fuse.toFixed(1), o.x, o.y - 66);
        ctx.fillStyle = '#ff9bd0';
        ctx.fillText(o.fuse.toFixed(1), o.x, o.y - 66);
    }
    ctx.restore();
}

/* ----- Effets ----- */

function drawEffect(ctx, e) {
    const k = Math.min(1, e.age / e.life);
    const fade = 1 - k;
    ctx.save();
    switch (e.type) {
        case 'tracer': {
            // Trait lumineux : halo large + cœur blanc, qui raccourcit vers l'impact
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineCap = 'round';
            const sx = e.x + (e.x2 - e.x) * k * 0.7, sy = e.y + (e.y2 - e.y) * k * 0.7;
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(e.x2, e.y2);
            ctx.lineWidth = e.width * 4; ctx.strokeStyle = hexA(e.color, 0.25 * fade); ctx.stroke();
            ctx.lineWidth = e.width * 1.6; ctx.strokeStyle = hexA(e.color, 0.8 * fade); ctx.stroke();
            ctx.lineWidth = Math.max(1, e.width * 0.6); ctx.strokeStyle = `rgba(255,255,255,${fade})`; ctx.stroke();
            break;
        }
        case 'muzzle': {
            // Éclair à la bouche du canon
            ctx.globalCompositeOperation = 'lighter';
            const s = e.size || 1;
            glow(ctx, e.x, e.y, 22 * s, e.color, 0.9 * fade);
            ctx.translate(e.x, e.y); ctx.rotate(e.angle);
            ctx.beginPath();
            ctx.moveTo(-2, -6 * s); ctx.lineTo(24 * s * (0.7 + 0.3 * fade), 0); ctx.lineTo(-2, 6 * s);
            ctx.closePath();
            ctx.fillStyle = `rgba(255,255,230,${fade})`; ctx.fill();
            if (e.smoke) {
                ctx.globalCompositeOperation = 'source-over';
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath(); ctx.arc(10 + i * 8 + k * 20, (i - 1) * 6, 6 + k * 10, 0, TAU);
                    ctx.fillStyle = `rgba(200,195,185,${0.35 * fade})`; ctx.fill();
                }
            }
            break;
        }
        case 'spark': {
            // Étincelles qui rebondissent sur le mur (selon la normale)
            ctx.globalCompositeOperation = 'lighter';
            const base = e.nx || e.ny ? Math.atan2(e.ny, e.nx) : rnd(e.x) * TAU;
            glow(ctx, e.x, e.y, 14 * fade + 4, e.color, 0.8 * fade);
            ctx.lineCap = 'round';
            for (let i = 0; i < 6; i++) {
                const a = base + (rnd(e.x + i * 7.1) - 0.5) * 2.2;
                const d = (8 + rnd(e.y + i) * 22) * (0.3 + k);
                ctx.beginPath();
                ctx.moveTo(e.x + Math.cos(a) * d * 0.4, e.y + Math.sin(a) * d * 0.4);
                ctx.lineTo(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d);
                ctx.lineWidth = 2.5; ctx.strokeStyle = hexA('#fff6d0', fade); ctx.stroke();
            }
            break;
        }
        case 'hit': {
            // Impact sur un héros : éclat dans le sens du tir
            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, e.x, e.y, 20 * fade + 6, e.color, 0.9 * fade);
            for (let i = 0; i < 5; i++) {
                const a = e.angle + (rnd(e.x * 3 + i) - 0.5) * 1.6;
                const d = 10 + k * 30 * (0.6 + rnd(i + e.y));
                ctx.fillStyle = hexA('#ffffff', fade);
                ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 2.5 * fade + 1, 0, TAU); ctx.fill();
            }
            break;
        }
        case 'explosion': {
            const big = e.big;
            const r = e.r;
            // 1. Flash blanc très court
            ctx.globalCompositeOperation = 'lighter';
            if (k < 0.25) glow(ctx, e.x, e.y, r * (0.6 + k * 2), '#ffffff', 1 - k * 4);
            // 2. Boule de feu
            const fr = r * (0.35 + 0.65 * Math.min(1, k * 3));
            const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, fr);
            g.addColorStop(0, `rgba(255,250,220,${0.95 * fade})`);
            g.addColorStop(0.35, hexA(e.color, 0.85 * fade));
            g.addColorStop(1, hexA(e.color, 0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(e.x, e.y, fr, 0, TAU); ctx.fill();
            // 3. Onde de choc
            ctx.beginPath(); ctx.arc(e.x, e.y, r * (0.2 + k * 1.15), 0, TAU);
            ctx.lineWidth = (big ? 12 : 6) * fade + 1;
            ctx.strokeStyle = `rgba(255,255,255,${0.7 * fade})`;
            ctx.stroke();
            // 4. Éclats
            const n = big ? 22 : 10;
            for (let i = 0; i < n; i++) {
                const a = rnd(e.x + i * 1.7) * TAU;
                const d = r * (0.2 + k * (0.7 + rnd(e.y + i) * 0.6));
                ctx.fillStyle = hexA(i % 3 ? e.color : '#fff3c0', fade);
                ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, (big ? 5 : 3) * fade + 1, 0, TAU); ctx.fill();
            }
            // 5. Fumée qui reste
            ctx.globalCompositeOperation = 'source-over';
            for (let i = 0; i < (big ? 8 : 4); i++) {
                const a = rnd(e.x + i * 3.3) * TAU;
                const d = r * 0.4 * (rnd(i + e.y) + k);
                const sr = r * (0.18 + k * 0.25);
                ctx.fillStyle = `rgba(60,55,60,${0.35 * fade * Math.min(1, k * 4)})`;
                ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d - k * 20, sr, 0, TAU); ctx.fill();
            }
            // Brûlure au sol
            ctx.fillStyle = `rgba(20,15,10,${0.25 * fade})`;
            ctx.beginPath(); ctx.arc(e.x, e.y, r * 0.45, 0, TAU); ctx.fill();
            break;
        }
        case 'ring':
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath(); ctx.arc(e.x, e.y, e.r0 + (e.r1 - e.r0) * k, 0, TAU);
            ctx.lineWidth = 10 * fade + 2; ctx.strokeStyle = hexA(e.color, 0.35 * fade); ctx.stroke();
            ctx.lineWidth = 3; ctx.strokeStyle = hexA(e.color, fade); ctx.stroke();
            break;
        case 'death': {
            // Éclatement aux couleurs du héros + croix qui s'efface
            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, e.x, e.y, 70 * fade + 20, e.color, 0.7 * fade);
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * TAU + rnd(e.x + i);
                const d = 15 + k * 80 * (0.6 + rnd(i + e.y) * 0.6);
                ctx.fillStyle = hexA(i % 2 ? e.color : e.heroColor || '#fff', fade);
                ctx.fillRect(e.x + Math.cos(a) * d - 3, e.y + Math.sin(a) * d - 3, 6, 6);
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.lineWidth = 6; ctx.lineCap = 'round';
            ctx.strokeStyle = hexA(e.color, fade);
            const s = 16 + k * 10;
            ctx.beginPath();
            ctx.moveTo(e.x - s, e.y - s); ctx.lineTo(e.x + s, e.y + s);
            ctx.moveTo(e.x + s, e.y - s); ctx.lineTo(e.x - s, e.y + s);
            ctx.stroke();
            break;
        }
        case 'heal': {
            // Croix de soin qui montent
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 3; i++) {
                const ox = (rnd(e.x + i * 4.4 + e.life) - 0.5) * 36;
                const y = e.y - 10 - k * 46 - i * 8;
                const s = 5 * fade + 2;
                ctx.fillStyle = hexA(e.color, fade);
                ctx.fillRect(e.x + ox - s, y - s / 3, s * 2, s * 0.66);
                ctx.fillRect(e.x + ox - s / 3, y - s, s * 0.66, s * 2);
            }
            break;
        }
        case 'revive': {
            // Colonne de lumière dorée
            ctx.globalCompositeOperation = 'lighter';
            const w = 60 * (1 - Math.abs(k - 0.3));
            const g = ctx.createLinearGradient(e.x - w, 0, e.x + w, 0);
            g.addColorStop(0, hexA(e.color, 0));
            g.addColorStop(0.5, hexA(e.color, 0.6 * fade));
            g.addColorStop(1, hexA(e.color, 0));
            ctx.fillStyle = g;
            ctx.fillRect(e.x - w, e.y - 260, w * 2, 290);
            glow(ctx, e.x, e.y, 90 * (0.5 + k), e.color, 0.6 * fade);
            for (let i = 0; i < 12; i++) {
                const a = rnd(i + e.x) * TAU;
                const d = 30 + rnd(i * 2 + e.y) * 50;
                ctx.fillStyle = hexA('#fff8d0', fade);
                ctx.fillRect(e.x + Math.cos(a) * d - 2, e.y + Math.sin(a) * d * 0.5 - k * 120 - 2, 4, 4);
            }
            break;
        }
        case 'blink': {
            // Traînée fantôme entre départ et arrivée
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2);
            ctx.lineWidth = 26 * fade; ctx.strokeStyle = hexA(e.color, 0.25 * fade); ctx.stroke();
            ctx.lineWidth = 6 * fade; ctx.strokeStyle = hexA('#ffffff', 0.8 * fade); ctx.stroke();
            glow(ctx, e.x, e.y, 40 * fade + 10, e.color, 0.6 * fade);
            glow(ctx, e.x2, e.y2, 30, e.color, 0.7 * fade);
            if (e.hero) {
                ctx.globalCompositeOperation = 'source-over';
                ctx.globalAlpha = 0.35 * fade;
                drawHero(ctx, e.hero, { x: e.x, y: e.y, angle: e.angle, ring: false });
            }
            if (e.feathers) {
                for (let i = 0; i < 8; i++) {
                    const u = rnd(i + e.x);
                    const px = e.x + (e.x2 - e.x) * u, py = e.y + (e.y2 - e.y) * u;
                    ctx.fillStyle = hexA('#fff2a8', fade);
                    ctx.beginPath(); ctx.ellipse(px + (rnd(i) - 0.5) * 30, py + (rnd(i + 3) - 0.5) * 30 + k * 20, 7, 3, rnd(i + 9) * TAU, 0, TAU); ctx.fill();
                }
            }
            break;
        }
        case 'recall': {
            // Chemin remonté dans le temps
            ctx.globalCompositeOperation = 'lighter';
            const pts = e.points;
            if (pts?.length > 1) {
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
                ctx.lineWidth = 18 * fade; ctx.strokeStyle = hexA(e.color, 0.3 * fade); ctx.stroke();
                ctx.lineWidth = 4; ctx.strokeStyle = hexA('#ffffff', 0.8 * fade); ctx.stroke();
                const [hx, hy] = pts[0];
                glow(ctx, hx, hy, 50, e.color, 0.7 * fade);
            }
            break;
        }
        case 'shatter': {
            // Fissures qui se propagent dans le sol + vague de pierre
            const reach = e.range * Math.min(1, k * 2.2);
            ctx.globalAlpha = Math.min(1, fade * 1.5);
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.arc(e.x, e.y, reach, e.angle - e.half, e.angle + e.half);
            ctx.closePath();
            ctx.fillStyle = 'rgba(255, 170, 70, 0.22)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(40, 25, 15, 0.85)';
            ctx.lineWidth = 5;
            ctx.lineCap = 'round';
            for (let i = 0; i < 9; i++) {
                let a = e.angle + (i / 8 - 0.5) * e.half * 2;
                let x = e.x, y = e.y;
                ctx.beginPath(); ctx.moveTo(x, y);
                for (let s = 0; s < 8; s++) {
                    a += (rnd(e.seed + i * 13 + s) - 0.5) * 0.5;
                    const step = reach / 8;
                    x += Math.cos(a) * step; y += Math.sin(a) * step;
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath();
            ctx.arc(e.x, e.y, reach, e.angle - e.half, e.angle + e.half);
            ctx.lineWidth = 16 * fade; ctx.strokeStyle = hexA('#ffc45a', 0.8 * fade); ctx.stroke();
            for (let i = 0; i < 14; i++) {
                const a = e.angle + (rnd(e.seed + i) - 0.5) * e.half * 2;
                const d = reach * (0.3 + rnd(e.seed + i * 2) * 0.7);
                glow(ctx, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 16, '#ffb347', 0.6 * fade);
            }
            break;
        }
        case 'wave': {
            // Onde sonore : arcs concentriques
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 3; i++) {
                const r = e.range * Math.min(1, k * 1.6 + i * 0.12);
                ctx.beginPath(); ctx.arc(e.x, e.y, r, e.angle - e.half, e.angle + e.half);
                ctx.lineWidth = (12 - i * 3) * fade + 1;
                ctx.strokeStyle = hexA(e.color, (0.8 - i * 0.2) * fade);
                ctx.stroke();
            }
            break;
        }
        case 'slam': {
            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, e.x, e.y, 110 * (0.5 + k), '#ffffff', 0.7 * fade);
            for (let i = 0; i < 10; i++) {
                const a = e.angle + Math.PI + (rnd(e.x + i) - 0.5) * 2.6;
                const d = 20 + k * 90;
                ctx.strokeStyle = hexA('#ffe7b0', fade);
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(e.x + Math.cos(a) * d * 0.5, e.y + Math.sin(a) * d * 0.5);
                ctx.lineTo(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d);
                ctx.stroke();
            }
            break;
        }
        case 'shieldBreak': {
            // Éclats d'hexagones qui s'envolent
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 16; i++) {
                const a = e.angle + (rnd(i + e.x) - 0.5) * e.half * 2;
                const d = e.radius + k * 120 * (0.4 + rnd(i * 3 + e.y));
                const x = e.x + Math.cos(a) * d, y = e.y + Math.sin(a) * d;
                ctx.save();
                ctx.translate(x, y); ctx.rotate(k * 6 + i);
                ctx.beginPath();
                for (let j = 0; j < 6; j++) ctx.lineTo(Math.cos((j / 6) * TAU) * 8, Math.sin((j / 6) * TAU) * 8);
                ctx.closePath();
                ctx.strokeStyle = hexA(e.color, fade); ctx.lineWidth = 2; ctx.stroke();
                ctx.fillStyle = hexA(e.color, 0.3 * fade); ctx.fill();
                ctx.restore();
            }
            break;
        }
        case 'absorb': {
            // Projectile aspiré par la matrice
            ctx.globalCompositeOperation = 'lighter';
            const x = e.x + (e.tx - e.x) * k * 0.4, y = e.y + (e.ty - e.y) * k * 0.4;
            glow(ctx, x, y, 16 * fade + 4, e.color, fade);
            break;
        }
        case 'debris': {
            ctx.globalCompositeOperation = 'source-over';
            for (let i = 0; i < 14; i++) {
                const a = rnd(e.seed + i) * TAU;
                const d = k * (80 + rnd(e.seed + i * 2) * 120);
                ctx.save();
                ctx.translate(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d - Math.sin(k * Math.PI) * 30);
                ctx.rotate(k * 8 * (rnd(i) - 0.5));
                ctx.fillStyle = hexA(i % 2 ? e.color : '#4a4e5c', fade);
                ctx.fillRect(-6, -4, 12, 8);
                ctx.restore();
            }
            break;
        }
        case 'snap': {
            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, e.x, e.y, 50 * fade + 10, '#ffffff', 0.8 * fade);
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = hexA('#e8edf5', fade);
            ctx.lineWidth = 6;
            ctx.beginPath(); ctx.arc(e.x, e.y, 26 - k * 8, 0, TAU); ctx.stroke();
            break;
        }
        case 'callMech': {
            // Méca qui tombe du ciel : cercle de visée qui se resserre puis impact
            ctx.globalCompositeOperation = 'lighter';
            ctx.beginPath(); ctx.arc(e.x, e.y, 120 * fade + 20, 0, TAU);
            ctx.lineWidth = 4; ctx.strokeStyle = hexA(e.color, fade); ctx.stroke();
            glow(ctx, e.x, e.y, 80, e.color, 0.6 * Math.sin(k * Math.PI));
            break;
        }
        case 'barrierDrop': {
            // Mur du son : dôme vert qui pulse
            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, e.x, e.y, 320 * Math.min(1, k * 3), e.color, 0.35 * fade);
            for (let i = 0; i < 3; i++) {
                ctx.beginPath(); ctx.arc(e.x, e.y, 320 * Math.min(1, k * 2 + i * 0.15), 0, TAU);
                ctx.lineWidth = 6 * fade; ctx.strokeStyle = hexA('#ffffff', 0.5 * fade); ctx.stroke();
            }
            break;
        }
        case 'capture': {
            // Le point change de main : grande onde à la couleur de l'équipe
            ctx.globalCompositeOperation = 'lighter';
            const col = e.color || '#ffffff';
            for (let i = 0; i < 3; i++) {
                ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.3 + k * 1.6 + i * 0.12), 0, TAU);
                ctx.lineWidth = 14 * fade; ctx.strokeStyle = hexA(col, 0.7 * fade); ctx.stroke();
            }
            glow(ctx, e.x, e.y, e.r * 1.3, col, 0.5 * fade);
            break;
        }
        case 'puff': {
            // Volute de fumée (ombre de Nox, masque de Ragnok, évanescence)
            const r = (e.big ? 50 : 18) * (0.5 + k);
            if (e.dark) {
                ctx.fillStyle = `rgba(20, 18, 26, ${0.55 * fade})`;
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath();
                    ctx.arc(e.x + (rnd(e.x + i) - 0.5) * r, e.y + (rnd(e.y + i) - 0.5) * r - k * 20, r * 0.6, 0, TAU);
                    ctx.fill();
                }
            } else {
                ctx.globalCompositeOperation = 'lighter';
                glow(ctx, e.x, e.y - k * 20, r, e.color, 0.5 * fade);
            }
            break;
        }
        case 'chain': {
            ctx.strokeStyle = hexA('#c3ccd8', fade);
            ctx.lineWidth = 5;
            ctx.setLineDash([8, 5]);
            ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2); ctx.stroke();
            break;
        }
        case 'bionade': {
            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, e.x, e.y, e.r * (0.5 + k * 0.7), '#c98bff', 0.6 * fade);
            ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.3 + k * 0.8), 0, TAU);
            ctx.lineWidth = 6 * fade + 1; ctx.strokeStyle = hexA('#efe0ff', fade); ctx.stroke();
            for (let i = 0; i < 10; i++) {
                const a = rnd(e.x + i) * TAU;
                const d = e.r * k * (0.5 + rnd(i + e.y) * 0.6);
                ctx.fillStyle = hexA(i % 2 ? '#c98bff' : '#b6ff8a', fade);
                ctx.fillRect(e.x + Math.cos(a) * d - 3, e.y + Math.sin(a) * d - 3, 6, 6);
            }
            break;
        }
        case 'number': {
            ctx.globalAlpha = 1 - k * k;
            const pop = k < 0.15 ? 1 + (0.15 - k) * 4 : 1;
            ctx.font = `800 ${Math.round((e.big ? 26 : 20) * pop)}px Rubik, sans-serif`;
            ctx.textAlign = 'center';
            ctx.lineWidth = 4; ctx.strokeStyle = INK;
            const y = e.y - 30 - k * 40;
            ctx.strokeText(e.text, e.x, y);
            ctx.fillStyle = e.color;
            ctx.fillText(e.text, e.x, y);
            break;
        }
    }
    ctx.restore();
}

/* ----- Barres de vie ----- */

function drawBars(ctx, f, viewer, isMe, inv) {
    const col = isMe ? '#ffe03d' : teamColor(f.team, viewer);
    const w = Math.max(56, f.r * 2.6);
    const x = f.x - w / 2, y = f.y - f.r - 26;
    ctx.fillStyle = 'rgba(11,20,48,0.85)';
    ctx.fillRect(x - 2, y - 2, w + 4, 10);
    // Vie perdue récemment (barre blanche qui descend en retard)
    f._hpShown = f._hpShown === undefined ? f.hp : Math.max(f.hp, f._hpShown - f.maxHp * 0.012);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x, y, w * Math.max(0, f._hpShown / f.maxHp), 6);
    ctx.fillStyle = f.team === viewer ? '#f4f7ff' : '#ff6b7f';
    ctx.fillRect(x, y, w * Math.max(0, f.hp / f.maxHp), 6);
    if (f.over > 0) {
        ctx.fillStyle = '#d8ff7a';
        ctx.fillRect(x, y - 5, w * Math.min(1, f.over / f.maxHp), 4);
    }
    // Graduations tous les 50 PV, comme en Overwatch
    ctx.fillStyle = 'rgba(11,20,48,0.6)';
    for (let v = 50; v < f.maxHp; v += 50) ctx.fillRect(x + (v / f.maxHp) * w, y, 1, 6);
    // Ultime prête (alliés) : petit losange orange
    if (f.ult >= 100 && f.team === viewer) {
        ctx.fillStyle = '#ff9a1f';
        ctx.beginPath();
        ctx.moveTo(x + w + 8, y - 4); ctx.lineTo(x + w + 13, y + 3); ctx.lineTo(x + w + 8, y + 10); ctx.lineTo(x + w + 3, y + 3);
        ctx.closePath(); ctx.fill();
    }
    ctx.font = `700 ${Math.round(14 * inv)}px Rubik, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 4 * inv;
    ctx.strokeStyle = INK;
    const label = isMe ? f.hero.name : f.name;
    ctx.strokeText(label, f.x, y - 4);
    ctx.fillStyle = col;
    ctx.fillText(label, f.x, y - 4);
}

/* ----- Rendu complet ----- */

export function renderGame(ctx, g, layers, cam, viewer, me, dpr, shake = { x: 0, y: 0 }) {
    const { x, y, scale } = cam;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d1430';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(scale, 0, 0, scale, W / 2 - (x + shake.x) * scale, H / 2 - (y + shake.y) * scale);
    ctx.drawImage(layers.ground, 0, 0);
    if (g.escort) {
        drawEscortRoute(ctx, g, viewer);
        drawDocksDecor(ctx, g, viewer, teamColor);
        drawPayloadRange(ctx, g, viewer);
        drawPayload(ctx, g, viewer);
    } else {
        drawPoint(ctx, g, viewer);
        drawAnimatedDecor(ctx, g.map, g.time);
    }

    // Les couleurs d'effets d'équipe (capture) dépendent du point de vue
    for (const e of g.effects) if (e.type === 'capture' && e.team) e.color = teamColor(e.team, viewer);

    for (const o of g.objects) if (o.kind === 'soul' || o.kind === 'trap' || o.kind === 'mine' || o.kind === 'field') drawObject(ctx, o, g, viewer);
    for (const f of g.fighters) if (f.alive) drawAura(ctx, f, g.time);

    const alive = g.fighters.filter(f => f.alive).sort((a, b) => a.y - b.y);
    for (const f of alive) drawMatrix(ctx, f, g.time);
    for (const f of alive) drawBeam(ctx, f, g.time);
    for (const f of alive) {
        const team = f.team === viewer ? 'blue' : 'red';
        ctx.save();
        if (f.invuln > 0 && !f.recall) ctx.globalAlpha = 0.6;
        if (f.recall) ctx.globalAlpha = 0.35;
        if (f.wraith > 0) ctx.globalAlpha = 0.35;   // Forme spectrale
        if (f.fade > 0) ctx.globalAlpha = 0.12;     // Évanescence
        // Volta éjectée : la pilote est dessinée en petit (son méca a explosé)
        if (f.heroId === 'volta' && !f.mech) drawPilot(ctx, f, team);
        else {
            const kick = (f.recoil || 0) * (f.role === 'tank' ? 3 : 4.5);
            drawHero(ctx, f.heroId, { x: f.x - Math.cos(f.angle) * kick, y: f.y - Math.sin(f.angle) * kick, angle: f.angle, team, t: f.t, moving: f.moving || Boolean(f.dash) });
        }
        ctx.restore();
        // Coup de marteau : arc lumineux
        if (f.swing) {
            const k = f.swing.t / 0.35;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const a0 = f.angle - 1.05 * f.swing.dir, a1 = a0 + 2.1 * f.swing.dir * Math.min(1, k * 2);
            ctx.beginPath();
            ctx.arc(f.x, f.y, 120, Math.min(a0, a1), Math.max(a0, a1));
            ctx.lineWidth = 26; ctx.strokeStyle = `rgba(255, 190, 110, ${0.3 * (1 - k)})`; ctx.stroke();
            ctx.lineWidth = 8; ctx.strokeStyle = `rgba(255, 240, 200, ${0.9 * (1 - k)})`; ctx.stroke();
            ctx.restore();
        }
        drawBarrier(ctx, f, teamColor(f.team, viewer), g.time);
        drawHeroBeams(ctx, f, g.time);
        drawStatus(ctx, f, g.time);
    }
    for (const o of g.objects) if (o.kind === 'tire' || o.kind === 'mechBomb' || o.kind === 'dome') drawObject(ctx, o, g, viewer);
    for (const p of g.projectiles) drawProjectile(ctx, p, g.time);
    for (const e of g.effects) drawEffect(ctx, e);

    ctx.globalAlpha = 0.82;
    ctx.drawImage(layers.canopy, 0, 0);
    ctx.globalAlpha = 1;

    const inv = dpr / scale;
    for (const f of alive) drawBars(ctx, f, viewer, f === me, inv);
}

function drawPilot(ctx, f, team) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.beginPath(); ctx.arc(0, 0, f.r + 7, 0, TAU);
    ctx.lineWidth = 3.5; ctx.strokeStyle = TEAM_COLORS[team]; ctx.stroke();
    ctx.rotate(f.angle);
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 13, 0, 0, TAU);
    ctx.fillStyle = '#4f7dd8'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    ctx.fillStyle = '#ff6fb5';
    ctx.fillRect(-2, -12, 4, 24);
    ctx.fillStyle = '#2b2f3a';
    ctx.fillRect(10, 4, 14, 6);
    ctx.beginPath(); ctx.arc(1, 0, 7, 0, TAU);
    ctx.fillStyle = '#5a3a22'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
}
