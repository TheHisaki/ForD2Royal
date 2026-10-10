/* ==================================
   ISOLA - MODÈLES 3D LOW-POLY
   Voile de descente, dirigeable de largage et petits outils de géométrie partagés
   (le personnage et ses cosmétiques sont dans skins.js).
   Tout est construit en code (aucun fichier 3D à charger), facettes plates.
   ================================== */

import * as THREE from '../vendor/three/three.module.js';

const TAU = Math.PI * 2;

/* ===================== OUTILS ===================== */

const matCache = new Map();
// Matériau mat à facettes (partagé par couleur)
export function flat(color, opts = {}) {
    const key = `${color}|${opts.transparent ? 1 : 0}|${opts.side || 0}`;
    if (!opts.unique && matCache.has(key)) return matCache.get(key);
    const m = new THREE.MeshLambertMaterial({
        color: new THREE.Color(color),
        flatShading: true,
        transparent: !!opts.transparent,
        side: opts.side ?? THREE.FrontSide
    });
    if (!opts.unique) matCache.set(key, m);
    return m;
}

// Fusionne plusieurs géométries (positions + normales) en une seule, non indexée
export function mergeGeometries(list) {
    const parts = list.map(g => (g.index ? g.toNonIndexed() : g));
    let count = 0;
    for (const g of parts) count += g.attributes.position.count;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    let o = 0;
    for (const g of parts) {
        if (!g.attributes.normal) g.computeVertexNormals();
        pos.set(g.attributes.position.array, o * 3);
        nor.set(g.attributes.normal.array, o * 3);
        o += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.computeBoundingSphere();
    return out;
}

// Mélange deux couleurs "#rrggbb" (t = 0 : a, t = 1 : b)
export function mixHex(a, b, t) {
    return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

/* ===================== VOILE DE DESCENTE ===================== */

// Parapente arrondi aux couleurs du planeur équipé, avec ses suspentes
export function buildGlider(colors = ['#ff8a1f', '#ffe03d']) {
    const g = new THREE.Group();
    const a = colors[0] || '#ff8a1f';
    const b = colors[1] || '#ffe03d';
    // Voile : demi-cylindre ouvert, découpé en caissons de 2 couleurs
    // (axe du cylindre le long de Z = profondeur de la voile, arc vers le haut le long de X)
    const R = 70;
    const SQUASH = 0.42;
    const BASE = 96;
    const cells = 6;
    for (let i = 0; i < cells; i++) {
        const geo = new THREE.CylinderGeometry(R, R, 46, 3, 1, true,
            Math.PI / 2 + (i / cells) * Math.PI, Math.PI / cells);
        geo.rotateX(Math.PI / 2);
        const me = new THREE.Mesh(geo, flat(i % 2 ? b : a, { side: THREE.DoubleSide }));
        me.castShadow = true;
        g.add(me);
    }
    g.scale.set(1, SQUASH, 1);
    g.position.y = BASE;
    // Suspentes : du bord de la voile jusqu'aux épaules
    const pts = [];
    for (const x of [-62, -24, 24, 62]) {
        const y = BASE + SQUASH * Math.sqrt(R * R - x * x);
        pts.push(new THREE.Vector3(x, y, 0), new THREE.Vector3(x * 0.25, 50, 0));
    }
    const lines = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x1b2440, transparent: true, opacity: 0.65 })
    );
    const wrap = new THREE.Group();
    wrap.add(g, lines);
    return wrap;
}

/* ===================== DIRIGEABLE DE LARGAGE ===================== */

export function buildAirship() {
    const ship = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), flat('#ff6a3d'));
    hull.scale.set(240, 74, 74);
    hull.rotation.y = Math.PI / 2;           // nez vers +Z
    hull.castShadow = true;
    ship.add(hull);
    // Bandes claires
    for (const z of [-90, 0, 90]) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 14, 1, true), flat('#fff1d6', { side: THREE.DoubleSide }));
        const r = 74 * Math.sqrt(Math.max(0.05, 1 - (z / 240) ** 2)) + 0.8;
        band.scale.set(r, 14, r);
        band.rotation.x = Math.PI / 2;
        band.position.z = z;
        ship.add(band);
    }
    // Ailerons
    for (const [w, h, rz] of [[6, 70, 0], [6, 70, Math.PI / 2]]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(w, h, 60), flat('#2f3d66'));
        fin.position.z = -205;
        fin.rotation.z = rz;
        fin.castShadow = true;
        ship.add(fin);
    }
    // Nacelle
    const gondola = new THREE.Mesh(new THREE.BoxGeometry(56, 34, 120), flat('#2f3d66'));
    gondola.position.set(0, -86, 10);
    gondola.castShadow = true;
    ship.add(gondola);
    const windows = new THREE.Mesh(new THREE.BoxGeometry(58, 10, 96), flat('#8fe3ff'));
    windows.position.set(0, -84, 10);
    ship.add(windows);
    // Hélice arrière
    const prop = new THREE.Mesh(new THREE.BoxGeometry(80, 8, 4), flat('#ffe03d'));
    prop.position.set(0, 0, -250);
    ship.add(prop);
    ship.userData.prop = prop;
    return ship;
}
