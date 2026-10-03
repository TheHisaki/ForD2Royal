/* ==================================
   OUTILS - FOR2D ROYAL
   ================================== */

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export const pick = (rng, list) => list[Math.floor(rng() * list.length)];

// Éclaircit (amt > 0) ou assombrit (amt < 0) une couleur "#rrggbb"
export function shadeHex(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16;
    let g = (n >> 8) & 255;
    let b = n & 255;
    if (amt < 0) {
        r *= 1 + amt; g *= 1 + amt; b *= 1 + amt;
    } else {
        r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
    }
    return `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
}

/*
   Zone du monde visible pendant l'image en cours (mise à jour par le Renderer
   au début de chaque render). Sert à ne pas dessiner ce qui est hors écran
   quand l'appelant ne transmet pas les bornes de vue.
   Par défaut : tout est "visible" (aucun culling tant que le Renderer n'a pas tourné).
*/
export const frameView = {
    minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity,
    // Caméra vue de dessus : position au sol et hauteur au-dessus du sol.
    // Unité de hauteur = distance normale caméra / personnage au sol (camH = 1 au sol).
    camX: 0, camY: 0, camH: 1
};

/*
   Perspective verticale : un objet à la hauteur h (même unité que camH) est plus
   proche de la caméra que le sol, donc dessiné plus grand ET écarté du centre
   (parallaxe). Dans le repère monde (déjà à l'échelle du sol), il faut :
   position = cam + (pos - cam) * k et taille × k, avec k = camH / (camH - h).
   Un objet que la caméra suit à distance normale (gap = 1) garde donc sa taille
   habituelle à l'écran, quelle que soit la hauteur : la carte, elle, rapetisse.
*/
const AIR_MIN_GAP = 0.3;   // objet presque à hauteur de caméra : on borne l'agrandissement
const AIR_FADE_GAP = 0.6;  // en dessous de cet écart, il s'efface (il passe "au-dessus" de nous)

export function airProject(x, y, h, out = {}) {
    const v = frameView;
    const gap = v.camH - h;
    const k = v.camH / Math.max(AIR_MIN_GAP, gap);
    out.x = v.camX + (x - v.camX) * k;
    out.y = v.camY + (y - v.camY) * k;
    out.k = k;
    out.alpha = gap >= AIR_FADE_GAP ? 1 : clamp((gap - AIR_MIN_GAP) / (AIR_FADE_GAP - AIR_MIN_GAP), 0, 1);
    return out;
}

// Le point (x, y) élargi de "margin" touche-t-il la vue de l'image en cours ?
export function inFrameView(x, y, margin = 0) {
    const v = frameView;
    return x + margin >= v.minX && x - margin <= v.maxX &&
           y + margin >= v.minY && y - margin <= v.maxY;
}

/*
   Nombre propre à chaque combattant pour décaler ses petites animations
   (respiration, battement des membres...). Les bots ont un id numérique, les
   joueurs en multijoueur un id texte ("usr_...") : on le transforme en nombre,
   sinon les calculs donnent NaN et le personnage n'est plus dessiné.
*/
export function fighterSeed(p) {
    if (!p) return 0;
    const id = p.id;
    if (typeof id === 'number' && Number.isFinite(id)) return id;
    if (p._seedFor === id && p._seedFor !== undefined) return p._seed;
    let h = 0;
    const s = String(id ?? '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    p._seedFor = id;
    p._seed = h;
    return h;
}

export function rectsOverlap(a, b, margin = 0) {
    return a.x - margin < b.x + b.w && a.x + a.w + margin > b.x &&
           a.y - margin < b.y + b.h && a.y + a.h + margin > b.y;
}

// Distance entre un rectangle et un point (0 si le point est dedans)
export function rectPointDist(r, x, y) {
    const px = clamp(x, r.x, r.x + r.w);
    const py = clamp(y, r.y, r.y + r.h);
    return Math.hypot(x - px, y - py);
}

// Distance entre un point et un segment [a, b]
export function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/*
   Grille spatiale : range les objets par cases pour retrouver
   très vite ceux qui sont proches (collisions, affichage).
*/
let gridCount = 0;

export class SpatialGrid {
    constructor(cellSize) {
        this.cell = cellSize;
        this.cells = new Map();
        this.stamp = 0;
        this.mark = `_seen${gridCount++}`; // propre à chaque grille
    }

    insert(item, minX, minY, maxX, maxY) {
        const c = this.cell;
        for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
            for (let cy = Math.floor(minY / c); cy <= Math.floor(maxY / c); cy++) {
                const key = cx * 65536 + cy;
                let list = this.cells.get(key);
                if (!list) {
                    list = [];
                    this.cells.set(key, list);
                }
                list.push(item);
            }
        }
    }

    // Remplit "out" avec les objets des cases touchées (sans doublons)
    query(minX, minY, maxX, maxY, out = []) {
        out.length = 0;
        const c = this.cell;
        const stamp = ++this.stamp;
        const mark = this.mark;
        for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
            for (let cy = Math.floor(minY / c); cy <= Math.floor(maxY / c); cy++) {
                const list = this.cells.get(cx * 65536 + cy);
                if (!list) continue;
                for (const item of list) {
                    if (item[mark] !== stamp) {
                        item[mark] = stamp;
                        out.push(item);
                    }
                }
            }
        }
        return out;
    }
}
