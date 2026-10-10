/* ==================================
   ISOLA - MODÈLES 3D LOW-POLY
   Personnage « chibi » (grosse tête, petit corps), voile de descente,
   dirigeable de largage, et petits outils de géométrie partagés.
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

/* ===================== PERSONNAGE ===================== */

/*
   Personnage d'environ 80 unités de haut (rayon de collision 26), tourné vers +Z.
   colors : { skin, hair, outfit, pack, pants? }.
   Renvoie { root, pose(walk, moving, air) } : le même objet sert au rendu normal
   et à la silhouette « rayons X » (matériau imposé).
*/
export function buildAvatar(colors, override = null) {
    const c = {
        skin: colors.skin || '#f2c29b',
        hair: colors.hair || '#3b2415',
        outfit: colors.outfit || '#ff4d5a',
        pack: colors.pack || '#ffc93c',
        pants: colors.pants || '#2b3048',
        shoes: '#1a1f33'
    };
    // Matériaux propres au personnage (on peut le rendre translucide dans un buisson)
    const mats = [];
    const m = (col) => {
        if (override) return override;
        const mm = flat(col, { unique: true });
        mats.push(mm);
        return mm;
    };
    const root = new THREE.Group();
    const body = new THREE.Group();   // tout sauf l'ombre : on peut le faire « respirer »
    root.add(body);

    const mesh = (geo, col, x = 0, y = 0, z = 0, parent = body) => {
        const me = new THREE.Mesh(geo, m(col));
        me.position.set(x, y, z);
        me.castShadow = !override;
        parent.add(me);
        return me;
    };

    // Jambes (pivot à la hanche)
    const legs = [];
    for (const side of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(side * 6.5, 24, 0);
        body.add(hip);
        mesh(new THREE.BoxGeometry(10, 20, 11), c.pants, 0, -10, 0, hip);
        mesh(new THREE.BoxGeometry(11, 6, 15), c.shoes, 0, -21, 2, hip);
        legs.push(hip);
    }

    // Tronc, ceinture, sac à dos
    mesh(new THREE.BoxGeometry(27, 24, 19), c.outfit, 0, 35, 0);
    mesh(new THREE.BoxGeometry(28, 4, 20), '#262c44', 0, 25, 0);
    mesh(new THREE.BoxGeometry(21, 22, 11), c.pack, 0, 37, -14);
    mesh(new THREE.BoxGeometry(17, 6, 4), mixHex(c.pack, '#000000', 0.25), 0, 31, -20);

    // Bras (pivot à l'épaule)
    const arms = [];
    for (const side of [-1, 1]) {
        const sh = new THREE.Group();
        sh.position.set(side * 17.5, 45, 0);
        body.add(sh);
        mesh(new THREE.BoxGeometry(8, 19, 9), c.outfit, 0, -8, 0, sh);
        mesh(new THREE.BoxGeometry(8, 7, 8), c.skin, 0, -20, 0, sh);
        arms.push(sh);
    }

    // Grosse tête + cheveux + yeux
    const head = new THREE.Group();
    head.position.set(0, 62, 0);
    body.add(head);
    mesh(new THREE.SphereGeometry(16, 10, 8), c.skin, 0, 0, 0, head);
    const hair = mesh(new THREE.SphereGeometry(17.2, 10, 6, 0, TAU, 0, Math.PI * 0.52), c.hair, 0, 1, -1.5, head);
    hair.rotation.x = -0.28;
    for (const side of [-1, 1]) mesh(new THREE.BoxGeometry(3.4, 5, 2), '#141826', side * 5.5, 0, 15.2, head);
    mesh(new THREE.BoxGeometry(7, 2, 2), mixHex(c.skin, '#7a2a2a', 0.45), 0, -7, 15, head);

    // Support de l'arme tenue à deux mains devant le torse (canon vers +Z)
    const mount = new THREE.Group();
    mount.position.set(0, 42, 17);
    body.add(mount);

    // aim : true = arme en main (bras tendus vers l'avant, mains sur l'arme)
    function pose(walk, moving, air = false, aim = false) {
        const s = moving ? Math.sin(walk) : 0;
        legs[0].rotation.x = s * 0.7;
        legs[1].rotation.x = -s * 0.7;
        if (air) {
            // En descente : bras levés vers la voile
            arms[0].rotation.set(Math.PI * 0.85, 0, 0.25);
            arms[1].rotation.set(Math.PI * 0.85, 0, -0.25);
            legs[0].rotation.x = 0.35;
            legs[1].rotation.x = 0.15;
        } else if (aim) {
            // Bras vers l'avant, un peu refermés vers l'arme (léger balancement en marchant)
            const sway = s * 0.05;
            arms[0].rotation.set(-Math.PI / 2 + 0.12 + sway, 0, 0.42);
            arms[1].rotation.set(-Math.PI / 2 + 0.06 - sway, 0, -0.38);
        } else {
            arms[0].rotation.set(-s * 0.6, 0, 0.08);
            arms[1].rotation.set(s * 0.6, 0, -0.08);
        }
        body.position.y = moving ? Math.abs(Math.cos(walk)) * 2.2 : 0;
        head.rotation.z = moving ? Math.sin(walk) * 0.04 : 0;
    }
    // Translucide (caché dans un buisson) ou opaque
    let ghost = false;
    function setGhost(on) {
        if (on === ghost) return;
        ghost = on;
        for (const mm of mats) {
            mm.transparent = on;
            mm.opacity = on ? 0.45 : 1;
            mm.needsUpdate = true;
        }
    }

    pose(0, false);
    return { root, pose, setGhost, mount };
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
