/* ==================================
   ISOLA - DÉCOR 3D (végétation, rochers, accessoires, bâtiments)
   Construit une fois à partir de world.objects et world.buildings.
   - Végétation et rochers : InstancedMesh (une seule passe de dessin par forme),
     couleur par instance = couleur de l'objet dans la carte 2D.
   - Bâtiments : murs (avec les vraies ouvertures de portes) + toit qui s'efface
     quand le joueur entre, comme dans le jeu 2D.
   Repère : x monde -> X, y monde -> Z, la hauteur est Y.
   ================================== */

import * as THREE from '../vendor/three/three.module.js';
import { flat, mergeGeometries, mixHex } from './models.js';

export const WALL_H = 112;      // hauteur des murs
const ROOF_OVER = 12;           // débord du toit
const PALM_TILT = 0.12;         // inclinaison du tronc des palmiers (radians)
const TAU = Math.PI * 2;

// Pseudo-aléatoire stable par objet (même rendu à chaque chargement)
function hash(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
}

/* ----- Formes unitaires (rayon 1, posées sur y = 0) ----- */

function trunkGeo(top = 0.12, bottom = 0.18, h = 1) {
    const g = new THREE.CylinderGeometry(top, bottom, h, 6);
    g.translate(0, h / 2, 0);
    return g;
}

const SHAPES = {
    canopy: () => new THREE.IcosahedronGeometry(1, 0),
    bush: () => {
        const g = new THREE.IcosahedronGeometry(1, 1);
        g.scale(1, 0.62, 1);
        g.translate(0, 0.42, 0);
        return g;
    },
    pine: () => mergeGeometries([
        new THREE.ConeGeometry(1, 1.0, 7).translate(0, 0.75, 0),
        new THREE.ConeGeometry(0.8, 0.85, 7).translate(0, 1.3, 0),
        new THREE.ConeGeometry(0.55, 0.7, 7).translate(0, 1.8, 0)
    ]),
    palmLeaves: () => {
        const leaves = [];
        for (let i = 0; i < 7; i++) {
            const a = (i / 7) * TAU;
            const leaf = new THREE.BoxGeometry(1.15, 0.05, 0.3);
            leaf.translate(0.55, 0, 0);
            leaf.rotateZ(-0.38);                       // les palmes retombent
            leaf.rotateY(a);
            leaves.push(leaf);
        }
        const g = mergeGeometries(leaves);
        g.translate(0, 0, 0);
        return g;
    },
    rock: () => {
        const g = new THREE.DodecahedronGeometry(1, 0);
        g.scale(1, 0.6, 0.9);
        g.translate(0, 0.22, 0);
        return g;
    },
    cactus: () => mergeGeometries([
        new THREE.CylinderGeometry(0.34, 0.38, 1.9, 7).translate(0, 0.95, 0),
        new THREE.CylinderGeometry(0.2, 0.2, 0.7, 6).translate(0.55, 1.15, 0),
        new THREE.CylinderGeometry(0.2, 0.2, 0.45, 6).rotateZ(Math.PI / 2).translate(0.38, 0.82, 0),
        new THREE.CylinderGeometry(0.18, 0.18, 0.55, 6).translate(-0.5, 1.3, 0),
        new THREE.CylinderGeometry(0.18, 0.18, 0.4, 6).rotateZ(Math.PI / 2).translate(-0.34, 1.05, 0)
    ]),
    stump: () => {
        const g = new THREE.CylinderGeometry(0.9, 1, 0.55, 8);
        g.translate(0, 0.27, 0);
        return g;
    },
    deadbush: () => {
        const twigs = [];
        for (let i = 0; i < 6; i++) {
            const t = new THREE.CylinderGeometry(0.05, 0.08, 1.1, 4);
            t.translate(0, 0.55, 0);
            t.rotateZ(0.55 + (i % 2) * 0.25);
            t.rotateY((i / 6) * TAU);
            twigs.push(t);
        }
        return mergeGeometries(twigs);
    },
    hay: () => {
        const g = new THREE.CylinderGeometry(0.85, 0.85, 1.2, 10);
        g.rotateZ(Math.PI / 2);
        g.translate(0, 0.85, 0);
        return g;
    },
    leaves: () => {
        const g = new THREE.CircleGeometry(1, 9);
        g.rotateX(-Math.PI / 2);
        g.translate(0, 1.2, 0);
        return g;
    },
    box: () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
};

/*
   Pour chaque type d'objet : les pièces à instancier.
   part(o, k) -> { s: [sx, sy, sz], y, rot, color } (k = valeur aléatoire stable)
*/
const BROWN = '#8a5a34';
const LAYOUT = {
    tree: [
        { shape: 'trunk', part: (o) => ({ s: [o.r, o.r * 0.95, o.r], color: BROWN }) },
        {
            shape: 'canopy',
            part: (o, k) => ({ s: [o.r * 0.92, o.r * 0.82, o.r * 0.92], y: o.r * 1.42, rot: k * TAU, color: o.base })
        }
    ],
    pine: [
        { shape: 'trunk', part: (o) => ({ s: [o.r * 0.9, o.r * 0.6, o.r * 0.9], color: '#6e4a2c' }) },
        { shape: 'pine', part: (o, k) => ({ s: [o.r * 0.95, o.r * 1.15, o.r * 0.95], rot: k * TAU, color: o.snowy ? mixHex(o.base, '#ffffff', 0.45) : o.base }) }
    ],
    palm: [
        { shape: 'palmTrunk', part: (o, k) => ({ s: [o.r, o.r * 2.1, o.r], rot: k * TAU, color: '#b58a52' }) },
        {
            shape: 'palmLeaves',
            // Les palmes se posent au sommet du tronc penché (même rotation que le tronc)
            part: (o, k) => {
                const rot = k * TAU;
                const h = o.r * 2.1;
                const s = Math.sin(PALM_TILT) * h;
                return { s: [o.r * 1.15, o.r, o.r * 1.15], y: Math.cos(PALM_TILT) * h, dx: -s * Math.cos(rot), dz: s * Math.sin(rot), rot, color: o.base };
            }
        }
    ],
    bush: [{ shape: 'bush', part: (o, k) => ({ s: [o.r, o.r, o.r], rot: k * TAU, color: o.base }) }],
    rock: [{
        shape: 'rock',
        part: (o, k) => ({ s: [o.r, o.r * (0.8 + k * 0.5), o.r], rot: k * TAU, color: o.snowy ? mixHex(o.base, '#ffffff', 0.4) : o.base })
    }],
    cactus: [{ shape: 'cactus', part: (o, k) => ({ s: [o.r, o.r * 1.15, o.r], rot: k * TAU, color: o.base }) }],
    stump: [{ shape: 'stump', part: (o) => ({ s: [o.r, o.r, o.r], color: o.base }) }],
    deadbush: [{ shape: 'deadbush', part: (o, k) => ({ s: [o.r, o.r, o.r], rot: k * TAU, color: o.base }) }],
    hay: [{ shape: 'hay', part: (o, k) => ({ s: [o.r, o.r, o.r], rot: k * TAU, color: o.base }) }],
    leaves: [{ shape: 'leaves', part: (o) => ({ s: [o.r, 1, o.r], color: o.base }) }]
};

function shapeGeo(name) {
    if (name === 'trunk') return trunkGeo();
    if (name === 'palmTrunk') {
        // Tronc légèrement penché
        const g = trunkGeo(0.1, 0.16, 1);
        g.rotateZ(PALM_TILT);
        return g;
    }
    return SHAPES[name]();
}

/* ----- Végétation, rochers et petits accessoires ----- */

function buildInstances(scene, world) {
    // Regroupe les pièces par forme
    const groups = new Map();
    for (const o of world.objects) {
        const layout = LAYOUT[o.type];
        if (!layout) continue;
        const k = hash(o.id + 1);
        for (const p of layout) {
            let list = groups.get(p.shape);
            if (!list) groups.set(p.shape, (list = []));
            list.push({ o, k, p: p.part(o, k) });
        }
    }

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (const [shape, list] of groups) {
        const geo = shapeGeo(shape);
        const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
        const mesh = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach(({ o, p }, i) => {
            dummy.position.set(o.x + (p.dx || 0), p.y || 0, o.y + (p.dz || 0));
            dummy.rotation.set(0, p.rot || 0, 0);
            dummy.scale.set(p.s[0], p.s[1], p.s[2]);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
            mesh.setColorAt(i, color.set(p.color || '#888888'));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = shape !== 'leaves';
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        scene.add(mesh);
    }
}

// Fontaine (Cité-Centrale) et puits (désert)
function buildLandmarks(scene, world) {
    for (const o of world.objects) {
        if (o.type === 'fountain') {
            const g = new THREE.Group();
            const basin = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r * 1.04, 22, 16), flat('#bdb8ab'));
            basin.position.y = 11;
            const water = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.86, o.r * 0.86, 2, 16), flat('#5fc4ff'));
            water.position.y = 20;
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(10, 14, 54, 8), flat('#a7a298'));
            pillar.position.y = 40;
            const bowl = new THREE.Mesh(new THREE.CylinderGeometry(26, 12, 12, 10), flat('#cfcabd'));
            bowl.position.y = 68;
            const top = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 3, 10), flat('#7fd6ff'));
            top.position.y = 74;
            for (const m of [basin, pillar, bowl]) { m.castShadow = true; m.receiveShadow = true; }
            g.add(basin, water, pillar, bowl, top);
            g.position.set(o.x, 0, o.y);
            scene.add(g);
        } else if (o.type === 'well') {
            const g = new THREE.Group();
            const ring = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 30, 12), flat(o.base || '#9a958a'));
            ring.position.y = 15;
            const water = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.75, o.r * 0.75, 2, 12), flat('#3f8fd8'));
            water.position.y = 26;
            g.add(ring, water);
            for (const side of [-1, 1]) {
                const post = new THREE.Mesh(new THREE.BoxGeometry(7, 70, 7), flat('#7a5532'));
                post.position.set(side * o.r * 0.8, 50, 0);
                post.castShadow = true;
                g.add(post);
            }
            const roof = new THREE.Mesh(new THREE.ConeGeometry(o.r * 1.15, 30, 4), flat('#b8643a'));
            roof.position.y = 96;
            roof.rotation.y = Math.PI / 4;
            roof.castShadow = true;
            ring.castShadow = true;
            g.add(roof);
            g.position.set(o.x, 0, o.y);
            scene.add(g);
        } else if (o.cover && o.w) {
            // Couvertures (carte Gun Game) : conteneurs, caisses, barrières
            const h = o.type === 'container' ? 110 : o.type === 'crate' ? 58 : 46;
            const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, h, o.h), flat(o.base || '#999999'));
            m.position.set(o.x, h / 2, o.y);
            m.castShadow = true;
            m.receiveShadow = true;
            scene.add(m);
        }
    }
}

/* ----- Bâtiments ----- */

function wallColor(b) {
    if (b.roofType === 'flat') return '#e8cf9f';            // maisons du désert : enduit sable
    if (b.roofType === 'barn') return '#c4483a';            // grange rouge
    return mixHex(b.wall, '#f3efe6', 0.78);                 // enduit clair, teinté par la ville
}

// Toit à deux pans (faîte dans la longueur), débord compris
function gableGeometry(b, rise) {
    const o = ROOF_OVER;
    const x0 = b.x - o, x1 = b.x + b.w + o;
    const z0 = b.y - o, z1 = b.y + b.h + o;
    const H = WALL_H;
    const alongX = b.w >= b.h;
    const v = [];
    const tri = (a, c, d) => v.push(...a, ...c, ...d);
    const quad = (a, c, d, e) => { tri(a, c, d); tri(a, d, e); };
    if (alongX) {
        const zc = (z0 + z1) / 2;
        const A = [x0, H, z0], B = [x1, H, z0], C = [x1, H, z1], D = [x0, H, z1];
        const R0 = [x0, H + rise, zc], R1 = [x1, H + rise, zc];
        quad(A, R0, R1, B);       // pan nord
        quad(D, C, R1, R0);       // pan sud
        tri(A, D, R0);            // pignons
        tri(B, R1, C);
        quad(A, B, C, D);         // dessous
    } else {
        const xc = (x0 + x1) / 2;
        const A = [x0, H, z0], B = [x1, H, z0], C = [x1, H, z1], D = [x0, H, z1];
        const R0 = [xc, H + rise, z0], R1 = [xc, H + rise, z1];
        quad(A, D, R1, R0);       // pan ouest
        quad(B, R0, R1, C);       // pan est
        tri(A, R0, B);
        tri(D, C, R1);
        quad(A, B, C, D);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
}

function buildBuildings(scene, world) {
    const out = [];
    for (const b of world.buildings) {
        // Murs : vraies ouvertures de portes (mêmes rectangles que les collisions)
        const pieces = b.walls.map(w => new THREE.BoxGeometry(w.w, WALL_H, w.h)
            .translate(w.x + w.w / 2, WALL_H / 2, w.y + w.h / 2));
        // Linteau au-dessus des portes : le mur reste continu en haut
        for (const d of b.doors || []) {
            const T = 16;
            const lintelH = 26;
            let x, z, w, h;
            if (d.side === 'top' || d.side === 'bottom') {
                w = d.w; h = T; x = b.x + b.w / 2; z = d.side === 'top' ? b.y + T / 2 : b.y + b.h - T / 2;
            } else {
                w = T; h = d.w; z = b.y + b.h / 2; x = d.side === 'left' ? b.x + T / 2 : b.x + b.w - T / 2;
            }
            pieces.push(new THREE.BoxGeometry(w, lintelH, h).translate(x, WALL_H - lintelH / 2, z));
        }
        const walls = new THREE.Mesh(mergeGeometries(pieces), flat(wallColor(b)));
        walls.castShadow = true;
        walls.receiveShadow = true;
        scene.add(walls);

        // Bandeau sombre en haut des murs (lisible de loin, style « jouet »)
        const trim = new THREE.Mesh(
            mergeGeometries(b.walls.map(w => new THREE.BoxGeometry(w.w + 2, 6, w.h + 2)
                .translate(w.x + w.w / 2, WALL_H - 3, w.y + w.h / 2))),
            flat(mixHex(wallColor(b), '#1a2030', 0.35))
        );
        scene.add(trim);

        // Toit
        let roofColor = b.roofType === 'barn' ? '#b8322b' : b.roof;
        if (b.snow) roofColor = mixHex(roofColor, '#f4f8fc', 0.6);
        const roofMat = new THREE.MeshLambertMaterial({
            color: new THREE.Color(roofColor), flatShading: true, transparent: false, side: THREE.DoubleSide
        });
        let roofGeo;
        if (b.roofType === 'flat') {
            roofGeo = new THREE.BoxGeometry(b.w + 16, 14, b.h + 16).translate(b.x + b.w / 2, WALL_H + 7, b.y + b.h / 2);
        } else {
            const rise = Math.min(b.w, b.h) * (b.roofType === 'barn' ? 0.5 : 0.36);
            roofGeo = gableGeometry(b, rise);
        }
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.castShadow = true;
        scene.add(roof);
        out.push({ b, roof, mat: roofMat, alpha: 1 });
    }
    return out;
}

export class Props {
    constructor(scene, world) {
        buildInstances(scene, world);
        buildLandmarks(scene, world);
        this.buildings = buildBuildings(scene, world);
    }

    // Le toit du bâtiment où se trouve le joueur s'efface (les autres réapparaissent)
    update(dt, px, py) {
        const k = Math.min(1, dt * 9);
        for (const h of this.buildings) {
            const b = h.b;
            const inside = px > b.x && px < b.x + b.w && py > b.y && py < b.y + b.h;
            const target = inside ? 0 : 1;
            h.alpha += (target - h.alpha) * k;
            if (Math.abs(target - h.alpha) < 0.01) h.alpha = target;
            // Toit plein = matériau opaque (la silhouette du joueur se voit à travers),
            // translucide seulement pendant le fondu
            const fading = h.alpha < 0.999;
            if (h.mat.transparent !== fading) {
                h.mat.transparent = fading;
                h.mat.needsUpdate = true;
            }
            h.mat.opacity = h.alpha;
            h.roof.visible = h.alpha > 0.03;
            h.roof.castShadow = h.alpha > 0.5;
        }
    }
}
