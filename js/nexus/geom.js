/* ==================================
   NEXUS - GÉOMÉTRIE
   Rayons (tirs instantanés, projectiles, ligne de vue) et navigation des bots.
   - Les tirs passent au-dessus de l'eau, mais pas à travers les murs, caisses, piliers...
   - La navigation est une grille (cases de 40) : recherche de chemin en largeur,
     puis lissage (on vise le point du chemin le plus loin encore visible).
   ================================== */

import { collide } from './map.js?v=2';

const EPS = 1e-6;

/* ----- Obstacles ----- */

export function shotBlockers(map) {
    if (!map._shot) {
        map._shot = {
            rects: map.rects.filter(r => r.kind !== 'water'),
            circles: map.circles.map(c => ({ x: c.x, y: c.y, r: c.kind === 'tree' ? c.r * 0.38 : c.r }))
        };
    }
    return map._shot;
}

// Rayon (o + d*t) contre un rectangle : t d'entrée et normale, ou null
function rayRect(ox, oy, dx, dy, r) {
    let tmin = -Infinity, tmax = Infinity, nx = 0, ny = 0;
    if (Math.abs(dx) < EPS) {
        if (ox < r.x || ox > r.x + r.w) return null;
    } else {
        let t1 = (r.x - ox) / dx, t2 = (r.x + r.w - ox) / dx, n = -1;
        if (t1 > t2) { [t1, t2] = [t2, t1]; n = 1; }
        if (t1 > tmin) { tmin = t1; nx = n; ny = 0; }
        tmax = Math.min(tmax, t2);
    }
    if (Math.abs(dy) < EPS) {
        if (oy < r.y || oy > r.y + r.h) return null;
    } else {
        let t1 = (r.y - oy) / dy, t2 = (r.y + r.h - oy) / dy, n = -1;
        if (t1 > t2) { [t1, t2] = [t2, t1]; n = 1; }
        if (t1 > tmin) { tmin = t1; nx = 0; ny = n; }
        tmax = Math.min(tmax, t2);
    }
    if (tmax < Math.max(0, tmin)) return null;
    if (tmin < 0) return { t: 0, nx: -dx, ny: -dy }; // départ à l'intérieur
    return { t: tmin, nx, ny };
}

export function rayCircle(ox, oy, dx, dy, cx, cy, cr) {
    const fx = ox - cx, fy = oy - cy;
    const b = fx * dx + fy * dy;
    const c = fx * fx + fy * fy - cr * cr;
    if (c <= 0) return 0;
    const disc = b * b - c;
    if (disc < 0) return Infinity;
    const t = -b - Math.sqrt(disc);
    return t >= 0 ? t : Infinity;
}

/**
 * Distance jusqu'au premier obstacle de tir le long d'un rayon (d normalisé).
 * Renvoie { t, nx, ny } (t = max si rien).
 */
export function castWall(map, ox, oy, dx, dy, max) {
    const { rects, circles } = shotBlockers(map);
    let best = { t: max, nx: 0, ny: 0 };
    for (const r of rects) {
        // Rejet rapide par boîte englobante du segment
        const ex = ox + dx * best.t, ey = oy + dy * best.t;
        if (Math.max(ox, ex) < r.x || Math.min(ox, ex) > r.x + r.w || Math.max(oy, ey) < r.y || Math.min(oy, ey) > r.y + r.h) continue;
        const h = rayRect(ox, oy, dx, dy, r);
        if (h && h.t < best.t) best = h;
    }
    for (const c of circles) {
        const t = rayCircle(ox, oy, dx, dy, c.x, c.y, c.r);
        if (t < best.t) {
            const hx = ox + dx * t, hy = oy + dy * t;
            const l = Math.hypot(hx - c.x, hy - c.y) || 1;
            best = { t, nx: (hx - c.x) / l, ny: (hy - c.y) / l };
        }
    }
    return best;
}

/** Vrai si rien ne bloque les tirs entre deux points. */
export function lineOfSight(map, ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay);
    if (d < 1) return true;
    return castWall(map, ax, ay, (bx - ax) / d, (by - ay) / d, d).t >= d - 0.5;
}

/** Intersection de deux segments [a,b] et [c,d] : paramètre t sur [a,b] ou null. */
export function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < EPS) return null;
    const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
    const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

/* ----- Navigation ----- */

const CELL = 40;

export class NavGrid {
    constructor(map, forbidden = []) {
        this.map = map;
        this.forbidden = forbidden; // rectangles interdits (base adverse)
        this.cols = Math.ceil(map.width / CELL);
        this.rows = Math.ceil(map.height / CELL);
        this.free = new Uint8Array(this.cols * this.rows);
        for (let gy = 0; gy < this.rows; gy++) {
            for (let gx = 0; gx < this.cols; gx++) {
                const x = gx * CELL + CELL / 2, y = gy * CELL + CELL / 2;
                const c = collide(map, x, y, 22);
                const ok = Math.hypot(c.x - x, c.y - y) < 1 && !forbidden.some(f => x > f.x - 24 && x < f.x + f.w + 24 && y > f.y - 24 && y < f.y + f.h + 24);
                this.free[gy * this.cols + gx] = ok ? 1 : 0;
            }
        }
        this.prev = new Int32Array(this.cols * this.rows);
        this.mark = new Uint32Array(this.cols * this.rows);
        this.stamp = 0;
        this.queue = new Int32Array(this.cols * this.rows);
    }

    cellOf(x, y) {
        const gx = Math.max(0, Math.min(this.cols - 1, Math.floor(x / CELL)));
        const gy = Math.max(0, Math.min(this.rows - 1, Math.floor(y / CELL)));
        return gy * this.cols + gx;
    }

    // Case libre la plus proche (si on est collé à un mur)
    nearestFree(i) {
        if (this.free[i]) return i;
        const gx0 = i % this.cols, gy0 = Math.floor(i / this.cols);
        for (let r = 1; r < 6; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const gx = gx0 + dx, gy = gy0 + dy;
                    if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) continue;
                    const j = gy * this.cols + gx;
                    if (this.free[j]) return j;
                }
            }
        }
        return i;
    }

    center(i) {
        return { x: (i % this.cols) * CELL + CELL / 2, y: Math.floor(i / this.cols) * CELL + CELL / 2 };
    }

    // Passage libre pour un cercle de rayon r (3 rayons parallèles, eau comprise)
    walkClear(ax, ay, bx, by, r) {
        const d = Math.hypot(bx - ax, by - ay);
        if (d < 1) return true;
        const ux = (bx - ax) / d, uy = (by - ay) / d;
        const px = -uy * r, py = ux * r;
        for (const [ox, oy] of [[0, 0], [px, py], [-px, -py]]) {
            const sx = ax + ox, sy = ay + oy;
            for (const rc of this.map.rects) {
                const h = rayRect(sx, sy, ux, uy, rc);
                if (h && h.t < d) return false;
            }
            for (const f of this.forbidden) {
                const h = rayRect(sx, sy, ux, uy, f);
                if (h && h.t < d) return false;
            }
        }
        for (const c of this.map.circles) {
            const cr = (c.kind === 'tree' ? c.r * 0.38 : c.r) + r;
            if (rayCircle(ax, ay, ux, uy, c.x, c.y, cr) < d) return false;
        }
        return true;
    }

    /** Prochain point à viser pour aller de (fx, fy) à (tx, ty). */
    next(fx, fy, tx, ty, r = 24) {
        if (this.walkClear(fx, fy, tx, ty, r)) return { x: tx, y: ty, direct: true };
        const start = this.nearestFree(this.cellOf(fx, fy));
        const goal = this.nearestFree(this.cellOf(tx, ty));
        if (start === goal) return { x: tx, y: ty, direct: true };
        const stamp = ++this.stamp;
        const { cols, free, prev, mark, queue } = this;
        let head = 0, tail = 0;
        queue[tail++] = start;
        mark[start] = stamp;
        prev[start] = -1;
        let found = false;
        while (head < tail) {
            const i = queue[head++];
            if (i === goal) { found = true; break; }
            const gx = i % cols;
            const n = [i - cols, i + cols, gx > 0 ? i - 1 : -1, gx < cols - 1 ? i + 1 : -1];
            for (const j of n) {
                if (j < 0 || j >= free.length || !free[j] || mark[j] === stamp) continue;
                mark[j] = stamp;
                prev[j] = i;
                queue[tail++] = j;
            }
        }
        if (!found) return { x: tx, y: ty, direct: false };
        const path = [];
        for (let i = goal; i !== -1; i = prev[i]) path.push(i);
        path.reverse();
        // Lissage : point le plus lointain du chemin encore atteignable en ligne droite
        let pick = Math.min(1, path.length - 1);
        for (let k = Math.min(path.length - 1, 14); k >= 1; k--) {
            const c = this.center(path[k]);
            if (this.walkClear(fx, fy, c.x, c.y, r)) { pick = k; break; }
        }
        const c = this.center(path[pick]);
        return { x: c.x, y: c.y, direct: false };
    }
}
