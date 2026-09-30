/* ==================================
   ALÉATOIRE ET BRUIT - FOR2D ROYAL
   Tout est "déterministe" : même graine = même résultat.
   ================================== */

// Générateur pseudo-aléatoire rapide (retourne une fonction qui donne un nombre entre 0 et 1)
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Valeur pseudo-aléatoire fixe pour une case (ix, iy)
function hash2(ix, iy, seed) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 144269504)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// Bruit de valeur lissé (0..1) : des "collines" douces
export function valueNoise(x, y, seed) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, seed);
    const b = hash2(ix + 1, iy, seed);
    const c = hash2(ix, iy + 1, seed);
    const d = hash2(ix + 1, iy + 1, seed);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

// Plusieurs couches de bruit superposées (plus naturel)
export function fbm(x, y, seed, octaves = 4) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
        sum += amp * valueNoise(x * freq, y * freq, seed + i * 101);
        norm += amp;
        amp *= 0.5;
        freq *= 2;
    }
    return sum / norm;
}
