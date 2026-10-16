/* ==================================
   NEXUS - RENDU DE LA PARTIE
   Carte (calques statiques), point de contrôle avec son état, héros,
   boucliers, rayons, auras, projectiles, objets (mines, pièges, pneu, méca),
   effets (traînées, explosions, chiffres de dégâts) et barres de vie.
   ================================== */

import { drawHero, TEAM_COLORS } from './sprites.js?v=2';
import { drawAnimatedDecor } from './map.js?v=2';

const TAU = Math.PI * 2;
const INK = '#0b1430';

function teamColor(team, viewer) {
    // Comme Overwatch : ton équipe en bleu, l'adversaire en rouge
    return team === viewer ? TEAM_COLORS.blue : TEAM_COLORS.red;
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
    ctx.setLineDash([26, 16]);
    ctx.lineDashOffset = -t * 30;
    ctx.lineWidth = 8;
    ctx.strokeStyle = locked ? 'rgba(255,255,255,0.5)' : g.contested ? '#ffd21e' : ownerCol;
    ctx.stroke();
    ctx.setLineDash([]);
    // Progression de capture : arc autour du point
    if (g.progress.value > 0 && g.progress.team) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 14, -Math.PI / 2, -Math.PI / 2 + (g.progress.value / 100) * TAU);
        ctx.lineWidth = 14;
        ctx.strokeStyle = teamColor(g.progress.team, viewer);
        ctx.stroke();
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

function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* ----- Pouvoirs visibles sur les héros ----- */

function drawBarrier(ctx, f, col) {
    const b = f.barrier;
    if (!b?.up) return;
    const k = b.hp / b.max;
    ctx.save();
    ctx.beginPath();
    ctx.arc(f.x, f.y, b.radius, b.angle - b.half, b.angle + b.half);
    ctx.lineWidth = 16;
    ctx.strokeStyle = hexA(col, 0.25 + 0.35 * k);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = hexA('#ffffff', 0.5 + 0.4 * k);
    ctx.stroke();
    // Motif hexagonal
    for (let i = -3; i <= 3; i++) {
        const a = b.angle + (i / 3.5) * b.half;
        ctx.beginPath();
        ctx.arc(f.x + Math.cos(a) * b.radius, f.y + Math.sin(a) * b.radius, 6, 0, TAU);
        ctx.fillStyle = hexA('#ffffff', 0.35);
        ctx.fill();
    }
    ctx.restore();
}

function drawMatrix(ctx, f) {
    if (!f.matrix?.on) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.arc(f.x, f.y, 270, f.angle - 0.62, f.angle + 0.62);
    ctx.closePath();
    const g = ctx.createRadialGradient(f.x, f.y, 30, f.x, f.y, 270);
    g.addColorStop(0, 'rgba(255, 111, 181, 0.05)');
    g.addColorStop(1, 'rgba(255, 111, 181, 0.35)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 180, 220, 0.8)';
    ctx.stroke();
    ctx.restore();
}

function drawBeam(ctx, f, t) {
    if (!f.beam) return;
    const col = f.beam.mode === 'heal' ? '#ffe27a' : '#7fc8ff';
    const s = { x: f.x + Math.cos(f.angle) * 38, y: f.y + Math.sin(f.angle) * 38 };
    for (const target of f.beam.chain || [f.beam.target]) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.beginPath();
        const mx = (s.x + target.x) / 2 + Math.sin(t * 8) * 10, my = (s.y + target.y) / 2 + Math.cos(t * 8) * 10;
        ctx.moveTo(s.x, s.y);
        ctx.quadraticCurveTo(mx, my, target.x, target.y);
        ctx.lineWidth = 12;
        ctx.strokeStyle = hexA(col, 0.3);
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.strokeStyle = col;
        ctx.stroke();
        ctx.restore();
    }
}

function drawAura(ctx, f, t) {
    if (f.heroId !== 'tempo') return;
    const col = f.track === 'heal' ? '#7ee34f' : '#ffd21e';
    ctx.save();
    ctx.beginPath(); ctx.arc(f.x, f.y, 280, 0, TAU);
    ctx.fillStyle = hexA(col, f.boostT > 0 ? 0.12 : 0.05);
    ctx.fill();
    ctx.setLineDash([10, 14]);
    ctx.lineDashOffset = -t * 40;
    ctx.lineWidth = f.boostT > 0 ? 5 : 3;
    ctx.strokeStyle = hexA(col, f.boostT > 0 ? 0.8 : 0.45);
    ctx.stroke();
    ctx.restore();
}

function drawStatus(ctx, f, t) {
    // Étourdi : étoiles qui tournent ; immobilisé : anneau métallique ; amplifié : halo bleu
    if (f.stun > 0) {
        for (let i = 0; i < 3; i++) {
            const a = t * 5 + (i / 3) * TAU;
            ctx.beginPath();
            ctx.arc(f.x + Math.cos(a) * (f.r + 6), f.y - f.r - 10 + Math.sin(a) * 6, 4, 0, TAU);
            ctx.fillStyle = '#ffd21e'; ctx.fill();
        }
    }
    if (f.root > 0) {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 6, 0, TAU);
        ctx.lineWidth = 6; ctx.strokeStyle = '#9aa3b2'; ctx.stroke();
    }
    if (f.amp > 0) {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 14, 0, TAU);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(127, 200, 255, 0.85)'; ctx.stroke();
    }
    if (f.over > 0) {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 18, 0, TAU);
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(216, 255, 122, 0.8)'; ctx.stroke();
    }
    if (f.ultActive) {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 22 + Math.sin(t * 6) * 3, 0, TAU);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255, 226, 122, 0.9)'; ctx.stroke();
    }
    if (f.casting) {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r + 16, -Math.PI / 2, -Math.PI / 2 + (1 - f.casting.t) * TAU);
        ctx.lineWidth = 5; ctx.strokeStyle = '#ffe27a'; ctx.stroke();
    }
    if (f.recall) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(f.recall.x, f.recall.y, f.r + 4, 0, TAU);
        ctx.lineWidth = 3; ctx.strokeStyle = '#5ff3ff'; ctx.stroke();
        ctx.restore();
    }
}

/* ----- Projectiles et objets ----- */

function drawProjectile(ctx, p, t) {
    const col = p.color || '#fff';
    ctx.save();
    if (p.kind === 'firestrike') {
        const a = Math.atan2(p.vy, p.vx);
        ctx.translate(p.x, p.y); ctx.rotate(a);
        const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 40);
        g.addColorStop(0, '#fff2a0'); g.addColorStop(0.5, '#ff7a1f'); g.addColorStop(1, 'rgba(255,60,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(-6, 0, 40, 30, 0, 0, TAU); ctx.fill();
    } else if (p.kind === 'pulse') {
        const pulse = p.fuse !== undefined ? 1 + Math.sin(t * 30) * 0.3 : 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 22 * pulse, 0, TAU);
        ctx.fillStyle = 'rgba(95, 243, 255, 0.35)'; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU);
        ctx.fillStyle = '#e8feff'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#1a6c7a'; ctx.stroke();
        if (p.fuse !== undefined) {
            ctx.beginPath(); ctx.arc(p.x, p.y, 170, 0, TAU);
            ctx.setLineDash([12, 10]);
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(95, 243, 255, 0.6)'; ctx.stroke();
        }
    } else if (p.kind === 'grenade') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fillStyle = '#59703c'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        ctx.beginPath(); ctx.arc(p.x - 3, p.y - 4, 2.5 + Math.abs(Math.sin(t * 20)), 0, TAU);
        ctx.fillStyle = '#ffb03a'; ctx.fill();
    } else if (p.kind === 'missile') {
        const a = Math.atan2(p.vy, p.vx);
        ctx.translate(p.x, p.y); ctx.rotate(a);
        ctx.fillStyle = 'rgba(255,176,58,0.5)';
        ctx.fillRect(-18, -2, 14, 4);
        ctx.fillStyle = '#f4f4f8';
        ctx.fillRect(-5, -3, 10, 6);
    } else if (p.kind === 'sonic') {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 3, 0, TAU);
        ctx.fillStyle = 'rgba(126, 227, 79, 0.35)'; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 1, 0, TAU);
        ctx.fillStyle = '#d8ff9a'; ctx.fill();
    } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fillStyle = col; ctx.fill();
    }
    ctx.restore();
}

function drawObject(ctx, o, g, viewer) {
    const col = teamColor(o.team, viewer);
    ctx.save();
    if (o.kind === 'soul') {
        // Héros tombé : icône fantôme (cible de résurrection)
        ctx.globalAlpha = 0.7;
        ctx.beginPath(); ctx.arc(o.x, o.y, 20, 0, TAU);
        ctx.fillStyle = hexA(col, 0.35); ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
        ctx.font = '700 22px Rubik, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText('✝', o.x, o.y + 1);
    } else if (o.kind === 'mine') {
        ctx.beginPath(); ctx.arc(o.x, o.y, o.r + 2, 0, TAU);
        ctx.fillStyle = '#f2c14e'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        ctx.beginPath(); ctx.arc(o.x, o.y, 4, 0, TAU);
        ctx.fillStyle = Math.sin(g.time * 10) > 0 ? '#ff3b3b' : '#5a0000'; ctx.fill();
    } else if (o.kind === 'trap') {
        ctx.translate(o.x, o.y);
        ctx.beginPath(); ctx.arc(0, 0, 18, 0, TAU);
        ctx.fillStyle = o.arm > 0 ? 'rgba(154,163,178,0.5)' : '#9aa3b2'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * TAU;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
            ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
            ctx.lineWidth = 3; ctx.strokeStyle = '#e8edf5'; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU);
        ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
    } else if (o.kind === 'tire') {
        ctx.translate(o.x, o.y);
        ctx.rotate(o.angle);
        ctx.beginPath(); ctx.ellipse(0, 0, 18, 22, 0, 0, TAU);
        ctx.fillStyle = '#26262b'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        ctx.fillStyle = '#5a5a60';
        for (let i = -2; i <= 2; i++) ctx.fillRect(-16, i * 8 - 1.5, 32, 3);
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU);
        ctx.fillStyle = Math.sin(g.time * 18) > 0 ? '#ff3b3b' : '#ffb03a'; ctx.fill();
        ctx.rotate(-o.angle);
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU);
        ctx.lineWidth = 3; ctx.strokeStyle = col; ctx.stroke();
    } else if (o.kind === 'mechBomb') {
        const k = Math.max(0, o.fuse / 3);
        ctx.beginPath(); ctx.arc(o.x, o.y, 430, 0, TAU);
        ctx.fillStyle = `rgba(255, 111, 181, ${0.08 + 0.12 * (1 - k)})`; ctx.fill();
        ctx.setLineDash([18, 12]);
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255, 111, 181, 0.85)'; ctx.stroke();
        ctx.setLineDash([]);
        drawHero(ctx, 'volta', { x: o.x, y: o.y, angle: o.angle, t: g.time, ring: false });
        ctx.beginPath(); ctx.arc(o.x, o.y, 40, 0, TAU);
        ctx.fillStyle = Math.sin(g.time * (10 + (1 - k) * 30)) > 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,111,181,0.4)';
        ctx.fill();
        ctx.font = '700 40px "Bebas Neue", Impact, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#fff';
        ctx.fillText(o.fuse.toFixed(1), o.x, o.y - 60);
    }
    ctx.restore();
}

/* ----- Effets ----- */

function drawEffect(ctx, e, viewer) {
    const k = e.age / e.life;
    ctx.save();
    switch (e.type) {
        case 'tracer':
            ctx.globalAlpha = 1 - k;
            ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2);
            ctx.lineWidth = e.width; ctx.strokeStyle = e.color; ctx.lineCap = 'round'; ctx.stroke();
            break;
        case 'spark':
            ctx.globalAlpha = 1 - k;
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * TAU + e.x;
                ctx.beginPath();
                ctx.moveTo(e.x, e.y);
                ctx.lineTo(e.x + Math.cos(a) * 14 * (0.5 + k), e.y + Math.sin(a) * 14 * (0.5 + k));
                ctx.lineWidth = 2; ctx.strokeStyle = e.color; ctx.stroke();
            }
            break;
        case 'explosion': {
            const r = e.r * (0.4 + 0.6 * Math.min(1, k * 2));
            const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
            g.addColorStop(0, `rgba(255,255,220,${0.9 * (1 - k)})`);
            g.addColorStop(0.4, hexA(e.color, 0.7 * (1 - k)));
            g.addColorStop(1, hexA(e.color, 0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.3 + k * 0.8), 0, TAU);
            ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k)})`; ctx.stroke();
            break;
        }
        case 'ring':
            ctx.globalAlpha = 1 - k;
            ctx.beginPath(); ctx.arc(e.x, e.y, e.r0 + (e.r1 - e.r0) * k, 0, TAU);
            ctx.lineWidth = 6; ctx.strokeStyle = e.color; ctx.stroke();
            break;
        case 'burst':
            ctx.globalAlpha = 1 - k;
            for (let i = 0; i < 10; i++) {
                const a = (i / 10) * TAU;
                ctx.beginPath(); ctx.arc(e.x + Math.cos(a) * 60 * k, e.y + Math.sin(a) * 60 * k, 6 * (1 - k) + 2, 0, TAU);
                ctx.fillStyle = e.color; ctx.fill();
            }
            break;
        case 'blink':
            ctx.globalAlpha = 0.8 * (1 - k);
            ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2);
            ctx.lineWidth = 10; ctx.strokeStyle = e.color; ctx.lineCap = 'round'; ctx.stroke();
            ctx.beginPath(); ctx.arc(e.x, e.y, 18, 0, TAU);
            ctx.lineWidth = 3; ctx.stroke();
            break;
        case 'shatter':
        case 'wave': {
            ctx.globalAlpha = 0.7 * (1 - k);
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.arc(e.x, e.y, e.range * Math.min(1, k * 2.5), e.angle - e.half, e.angle + e.half);
            ctx.closePath();
            ctx.fillStyle = e.type === 'shatter' ? 'rgba(255, 196, 90, 0.55)' : hexA(e.color, 0.4);
            ctx.fill();
            ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
            break;
        }
        case 'number': {
            ctx.globalAlpha = 1 - k * k;
            ctx.font = `800 ${e.big ? 26 : 20}px Rubik, sans-serif`;
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
    ctx.fillStyle = f.team === viewer ? '#f4f7ff' : '#ff6b7f';
    ctx.fillRect(x, y, w * Math.max(0, f.hp / f.maxHp), 6);
    if (f.over > 0) {
        ctx.fillStyle = '#d8ff7a';
        ctx.fillRect(x, y - 5, w * Math.min(1, f.over / f.maxHp), 4);
    }
    // Graduations tous les 50 PV, comme en Overwatch
    ctx.fillStyle = 'rgba(11,20,48,0.6)';
    for (let v = 50; v < f.maxHp; v += 50) ctx.fillRect(x + (v / f.maxHp) * w, y, 1, 6);
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

export function renderGame(ctx, g, layers, cam, viewer, me, dpr) {
    const { x, y, scale } = cam;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d1430';
    ctx.fillRect(0, 0, W, H);
    ctx.setTransform(scale, 0, 0, scale, W / 2 - x * scale, H / 2 - y * scale);
    ctx.drawImage(layers.ground, 0, 0);
    drawPoint(ctx, g, viewer);
    drawAnimatedDecor(ctx, g.map, g.time);

    for (const o of g.objects) if (o.kind === 'soul' || o.kind === 'trap' || o.kind === 'mine') drawObject(ctx, o, g, viewer);
    for (const f of g.fighters) if (f.alive) drawAura(ctx, f, g.time);

    const alive = g.fighters.filter(f => f.alive).sort((a, b) => a.y - b.y);
    for (const f of alive) drawMatrix(ctx, f);
    for (const f of alive) drawBeam(ctx, f, g.time);
    for (const f of alive) {
        const team = f.team === viewer ? 'blue' : 'red';
        ctx.save();
        if (f.invuln > 0 && !f.recall) ctx.globalAlpha = 0.6;
        if (f.recall) ctx.globalAlpha = 0.35;
        // Volta éjectée : la pilote est dessinée en petit (son méca a explosé)
        if (f.heroId === 'volta' && !f.mech) drawPilot(ctx, f, team);
        else drawHero(ctx, f.heroId, { x: f.x, y: f.y, angle: f.angle, team, t: f.t, moving: f.moving || Boolean(f.dash) });
        ctx.restore();
        // Coup de marteau
        if (f.swing) {
            const k = f.swing.t / 0.35;
            ctx.save();
            ctx.globalAlpha = 0.6 * (1 - k);
            ctx.beginPath();
            const a0 = f.angle - 1.05 * f.swing.dir, a1 = a0 + 2.1 * f.swing.dir * Math.min(1, k * 2);
            ctx.arc(f.x, f.y, 120, Math.min(a0, a1), Math.max(a0, a1));
            ctx.lineWidth = 18; ctx.strokeStyle = '#ffd38a'; ctx.stroke();
            ctx.restore();
        }
        drawBarrier(ctx, f, teamColor(f.team, viewer));
        drawStatus(ctx, f, g.time);
    }
    for (const o of g.objects) if (o.kind === 'tire' || o.kind === 'mechBomb') drawObject(ctx, o, g, viewer);
    for (const p of g.projectiles) drawProjectile(ctx, p, g.time);
    for (const e of g.effects) drawEffect(ctx, e, viewer);

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
