/* ==================================
   CAPSULES DE DÉPART (GUN GAME) - FOR2D ROYAL
   Vue de dessus : socle métallique au sol (sous le personnage), puis dôme de verre,
   anneau en 4 segments et voyants du compte à rebours (au-dessus du personnage).
   À l'ouverture, les segments s'écartent, le verre se dissipe et une onde part du centre.
   ================================== */

const TAU = Math.PI * 2;
export const CAPSULE_RADIUS = 62;

const LIGHTS = 5;            // un voyant par seconde du compte à rebours
const RIM = '#c7d1dc';
const RIM_DARK = '#18212d';
const RIM_LIGHT = '#f2f6fa';

function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
}

function polygon(ctx, x, y, r, sides, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * TAU;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.closePath();
}

const ease = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

/*
   Socle : dessiné AVANT le personnage.
   open : 0 = fermé, 1 = complètement ouvert (le socle s'efface pendant l'ouverture).
*/
export function drawCapsuleBase(ctx, x, y, open, accent) {
    const R = CAPSULE_RADIUS;
    const fade = 1 - ease(open);
    if (fade <= 0.01) return;
    ctx.save();
    ctx.globalAlpha *= fade;

    // Ombre portée
    ctx.fillStyle = 'rgba(8, 16, 30, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 9, y + 12, R + 10, R + 7, 0, 0, TAU);
    ctx.fill();

    // Plateau octogonal
    polygon(ctx, x, y, R + 14, 8, Math.PI / 8);
    ctx.fillStyle = '#2c3746';
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = RIM_DARK;
    ctx.lineWidth = 4;
    ctx.stroke();

    // Bande de signalisation jaune / noire
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#f2c230';
    ctx.lineWidth = 7;
    circle(ctx, x, y, R + 6);
    ctx.stroke();
    ctx.strokeStyle = '#1d232c';
    ctx.setLineDash([9, 9]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Sol intérieur
    const floor = ctx.createRadialGradient(x - R * 0.25, y - R * 0.3, R * 0.1, x, y, R);
    floor.addColorStop(0, '#4a5b70');
    floor.addColorStop(1, '#1f2a37');
    circle(ctx, x, y, R - 2);
    ctx.fillStyle = floor;
    ctx.fill();

    // Anneau lumineux sous les pieds
    ctx.strokeStyle = accent;
    ctx.globalAlpha *= 0.6;
    ctx.lineWidth = 4;
    circle(ctx, x, y, R * 0.62);
    ctx.stroke();
    ctx.restore();
}

/*
   Dôme : dessiné APRÈS le personnage.
   seconds : secondes restantes avant l'ouverture (pilote les voyants).
*/
export function drawCapsuleDome(ctx, x, y, open, accent, seconds, time) {
    const R = CAPSULE_RADIUS;
    const k = ease(open);
    const fade = 1 - k;
    ctx.save();
    ctx.lineCap = 'round';

    // Onde d'ouverture
    if (open > 0) {
        ctx.save();
        ctx.globalAlpha *= fade * 0.85;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 7;
        circle(ctx, x, y, R * (1 + k * 1.1));
        ctx.stroke();
        ctx.restore();
    }

    // Verre : léger reflet bleuté, il se dissipe en grossissant
    if (fade > 0.01) {
        ctx.save();
        ctx.globalAlpha *= fade;
        const gr = R - 5 + k * 18;
        const glass = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.1, x, y, gr);
        glass.addColorStop(0, 'rgba(210, 245, 255, 0.10)');
        glass.addColorStop(0.7, 'rgba(140, 215, 255, 0.20)');
        glass.addColorStop(1, 'rgba(110, 195, 255, 0.42)');
        circle(ctx, x, y, gr);
        ctx.fillStyle = glass;
        ctx.fill();
        // Reflets
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(x, y, gr * 0.74, Math.PI * 1.08, Math.PI * 1.42);
        ctx.stroke();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.beginPath();
        ctx.arc(x, y, gr * 0.74, Math.PI * 1.5, Math.PI * 1.6);
        ctx.stroke();
        circle(ctx, x + gr * 0.36, y + gr * 0.4, 3.2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.fill();
        // Balayage lumineux pendant l'attente
        const sweep = (time * 1.6) % TAU;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(x, y, gr * 0.5, sweep, sweep + 0.5);
        ctx.stroke();
        ctx.restore();
    }

    // Anneau en 4 segments qui s'écartent à l'ouverture
    if (fade > 0.01) {
        ctx.save();
        ctx.globalAlpha *= fade;
        const push = k * R * 0.7;
        for (let i = 0; i < 4; i++) {
            const mid = Math.PI / 4 + (i / 4) * TAU;
            const a0 = mid - TAU / 8 + 0.09;
            const a1 = mid + TAU / 8 - 0.09;
            const ox = x + Math.cos(mid) * push;
            const oy = y + Math.sin(mid) * push;
            ctx.strokeStyle = RIM_DARK;
            ctx.lineWidth = 17;
            ctx.beginPath();
            ctx.arc(ox, oy, R, a0, a1);
            ctx.stroke();
            ctx.strokeStyle = RIM;
            ctx.lineWidth = 11;
            ctx.stroke();
            ctx.strokeStyle = RIM_LIGHT;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(ox, oy, R - 2.5, a0 + 0.06, a1 - 0.06);
            ctx.stroke();
            // Liseré de couleur au milieu de chaque segment
            ctx.strokeStyle = accent;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(ox, oy, R + 1, mid - 0.18, mid + 0.18);
            ctx.stroke();
        }
        // Verrous aux jonctions (ils disparaissent dès l'ouverture)
        if (open <= 0) {
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * TAU;
                const bx = x + Math.cos(a) * R;
                const by = y + Math.sin(a) * R;
                circle(ctx, bx, by, 7);
                ctx.fillStyle = '#7d8a99';
                ctx.fill();
                ctx.strokeStyle = RIM_DARK;
                ctx.lineWidth = 3;
                ctx.stroke();
                circle(ctx, bx - 1.5, by - 1.5, 2.2);
                ctx.fillStyle = '#dfe6ee';
                ctx.fill();
            }
        }

        // Voyants du compte à rebours, en arc au-dessus du dôme
        const lit = open > 0 ? LIGHTS : Math.max(0, Math.min(LIGHTS, Math.ceil(seconds)));
        const spread = 0.17;
        for (let i = 0; i < LIGHTS; i++) {
            const a = -Math.PI / 2 + (i - (LIGHTS - 1) / 2) * spread;
            const lx = x + Math.cos(a) * (R + 14);
            const ly = y + Math.sin(a) * (R + 14);
            const on = open > 0 || i < lit;
            const color = open > 0 ? '#4cdc5a' : seconds <= 3 ? '#ff5470' : '#ffd21e';
            if (on) {
                ctx.save();
                ctx.globalAlpha *= 0.35 + 0.25 * Math.sin(time * 8 + i);
                circle(ctx, lx, ly, 8);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.restore();
            }
            circle(ctx, lx, ly, 4.6);
            ctx.fillStyle = on ? color : '#3a4553';
            ctx.fill();
            ctx.strokeStyle = RIM_DARK;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.restore();
}
