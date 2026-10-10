/* ==================================
   ISOLA - DÉCOR 3D (végétation, rochers, accessoires, bâtiments)
   Construit une fois à partir de world.objects et world.buildings.
   - Végétation et rochers : InstancedMesh (une seule passe de dessin par forme),
     couleur par instance = couleur de l'objet dans la carte 2D, ombrage doux du
     pied vers le sommet (couleurs par sommet), feuillages en « boules » arrondies.
   - Ombres de contact douces sous les arbres, buissons et rochers.
   - Bâtiments : murs (vraies ouvertures de portes), fenêtres, encadrements de
     portes, toits avec faîtage et cheminée qui s'effacent quand le joueur entre.
   - Accessoires de ville (lampadaires, caisses, tonneaux) : de vrais obstacles
     ajoutés aux collisions (ils arrêtent les balles, on peut s'abriter derrière).
   Repère : x monde -> X, y monde -> Z, la hauteur est Y.
   ================================== */

import * as THREE from '../vendor/three/three.module.js';
import { flat, mergeGeometries, mixHex } from './models.js?v=2';
import { distToRoads } from '../game/world.js?v=12';
import { isWater } from '../game/config.js?v=12';

export const WALL_H = 112;      // hauteur des murs
const ROOF_OVER = 12;           // débord du toit
const PALM_TILT = 0.12;         // inclinaison du tronc des palmiers (radians)
const TAU = Math.PI * 2;
const WALL_T = 16;

// Pseudo-aléatoire stable par objet (même rendu à chaque chargement)
function hash(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
}

/* ----- Ombrage par sommet ----- */

// Couleur par sommet selon la hauteur (pied sombre -> sommet clair) : faux « occlusion ambiante »
function heightShade(geo, lo = 0.62, hi = 1.06) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const h = Math.max(1e-6, bb.max.y - bb.min.y);
    for (let i = 0; i < pos.count; i++) {
        const t = (pos.getY(i) - bb.min.y) / h;
        const k = lo + (hi - lo) * Math.pow(t, 0.8);
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
}

// Bosses irrégulières (même décalage pour les sommets confondus : pas de trous)
function jitter(geo, amount, seed = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const k = Math.round(x * 1000) * 73856093 ^ Math.round(y * 1000) * 19349663 ^ Math.round(z * 1000) * 83492791;
        const r = hash(k * 0.001 + seed);
        const s = 1 + (r - 0.5) * 2 * amount;
        pos.setXYZ(i, x * s, y * s, z * s);
    }
    g.computeVertexNormals();
    return g;
}

/* ----- Formes unitaires (rayon 1, posées sur y = 0) ----- */

function trunkGeo(top = 0.12, bottom = 0.18, h = 1) {
    const g = new THREE.CylinderGeometry(top, bottom, h, 6);
    g.translate(0, h / 2, 0);
    return g;
}

const SHAPES = {
    // Feuillage en 4 boules (silhouette « nuage » comme dans Battlelands)
    canopy: () => mergeGeometries([
        jitter(new THREE.IcosahedronGeometry(1, 1), 0.08, 1),
        jitter(new THREE.IcosahedronGeometry(0.66, 1), 0.08, 2).translate(0.58, 0.22, 0.2),
        jitter(new THREE.IcosahedronGeometry(0.62, 1), 0.08, 3).translate(-0.52, 0.16, -0.3),
        jitter(new THREE.IcosahedronGeometry(0.56, 1), 0.08, 4).translate(0.08, 0.5, -0.46)
    ]).scale(0.88, 0.88, 0.88),
    bush: () => mergeGeometries([
        jitter(new THREE.IcosahedronGeometry(0.78, 1), 0.07, 5).translate(0, 0.45, 0),
        jitter(new THREE.IcosahedronGeometry(0.58, 1), 0.07, 6).translate(0.5, 0.36, 0.22),
        jitter(new THREE.IcosahedronGeometry(0.55, 1), 0.07, 7).translate(-0.48, 0.34, -0.2),
        jitter(new THREE.IcosahedronGeometry(0.5, 1), 0.07, 8).translate(0.1, 0.38, -0.52)
    ]).scale(1, 0.8, 1),
    pine: () => mergeGeometries([
        new THREE.ConeGeometry(1, 1.0, 8).translate(0, 0.75, 0),
        new THREE.ConeGeometry(0.8, 0.85, 8).translate(0, 1.3, 0),
        new THREE.ConeGeometry(0.55, 0.7, 8).translate(0, 1.8, 0)
    ]),
    palmLeaves: () => {
        const leaves = [];
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            const leaf = new THREE.BoxGeometry(1.15, 0.05, 0.32);
            leaf.translate(0.55, 0, 0);
            leaf.rotateZ(-0.38 - (i % 2) * 0.12);       // les palmes retombent
            leaf.rotateY(a);
            leaves.push(leaf);
        }
        leaves.push(new THREE.IcosahedronGeometry(0.16, 0).translate(0, -0.08, 0));   // noix de coco
        return mergeGeometries(leaves);
    },
    rock: () => {
        const g = jitter(new THREE.DodecahedronGeometry(1, 0), 0.16, 9);
        g.scale(1, 0.6, 0.9);
        g.translate(0, 0.22, 0);
        return g;
    },
    cactus: () => mergeGeometries([
        new THREE.CylinderGeometry(0.34, 0.38, 1.9, 8).translate(0, 0.95, 0),
        new THREE.SphereGeometry(0.34, 8, 4, 0, TAU, 0, Math.PI / 2).translate(0, 1.9, 0),
        new THREE.CylinderGeometry(0.2, 0.2, 0.7, 6).translate(0.55, 1.15, 0),
        new THREE.CylinderGeometry(0.2, 0.2, 0.45, 6).rotateZ(Math.PI / 2).translate(0.38, 0.82, 0),
        new THREE.CylinderGeometry(0.18, 0.18, 0.55, 6).translate(-0.5, 1.3, 0),
        new THREE.CylinderGeometry(0.18, 0.18, 0.4, 6).rotateZ(Math.PI / 2).translate(-0.34, 1.05, 0)
    ]),
    stump: () => {
        const g = new THREE.CylinderGeometry(0.9, 1, 0.55, 9);
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
        const g = new THREE.CylinderGeometry(0.85, 0.85, 1.2, 12);
        g.rotateZ(Math.PI / 2);
        g.translate(0, 0.85, 0);
        return g;
    },
    leaves: () => {
        const g = new THREE.CircleGeometry(1, 9);
        g.rotateX(-Math.PI / 2);
        g.translate(0, 1.2, 0);
        return g;
    }
};

/*
   Pour chaque type d'objet : les pièces à instancier.
   part(o, k) -> { s: [sx, sy, sz], y, rot, color } (k = valeur aléatoire stable)
*/
const BROWN = '#8a5a34';
// Légère variation de teinte par arbre (une forêt n'est jamais d'un seul vert)
const vary = (c, k) => mixHex(c, k > 0.5 ? '#fff6c0' : '#0d3a1a', Math.abs(k - 0.5) * 0.22);
const LAYOUT = {
    tree: [
        { shape: 'trunk', part: (o) => ({ s: [o.r, o.r * 0.95, o.r], color: BROWN }) },
        {
            shape: 'canopy',
            part: (o, k) => ({ s: [o.r * 0.95, o.r * 0.85, o.r * 0.95], y: o.r * 1.42, rot: k * TAU, color: vary(o.base, k) })
        }
    ],
    pine: [
        { shape: 'trunk', part: (o) => ({ s: [o.r * 0.9, o.r * 0.6, o.r * 0.9], color: '#6e4a2c' }) },
        { shape: 'pine', part: (o, k) => ({ s: [o.r * 0.95, o.r * 1.15, o.r * 0.95], rot: k * TAU, color: o.snowy ? mixHex(o.base, '#ffffff', 0.45) : vary(o.base, k) }) }
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
    bush: [{ shape: 'bush', part: (o, k) => ({ s: [o.r, o.r, o.r], rot: k * TAU, color: vary(o.base, k) }) }],
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

// Ombrage du pied au sommet par forme (bas, haut)
const SHADE = {
    canopy: [0.62, 1.1], bush: [0.6, 1.08], pine: [0.66, 1.08], palmLeaves: [0.8, 1.06],
    rock: [0.7, 1.06], cactus: [0.72, 1.05], trunk: [0.62, 1], palmTrunk: [0.7, 1.02],
    stump: [0.75, 1], deadbush: [0.8, 1], hay: [0.8, 1.05], leaves: [1, 1]
};

function shapeGeo(name) {
    let g;
    if (name === 'trunk') g = trunkGeo();
    else if (name === 'palmTrunk') {
        // Tronc légèrement penché
        g = trunkGeo(0.1, 0.16, 1);
        g.rotateZ(PALM_TILT);
    } else g = SHAPES[name]();
    const [lo, hi] = SHADE[name] || [0.7, 1.05];
    return heightShade(g, lo, hi);
}

/* ----- Ombres de contact (taches douces au pied des objets) ----- */

function blobTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}

const BLOB = { tree: 1.15, pine: 0.95, palm: 0.7, bush: 1.05, rock: 1.15, cactus: 0.6, stump: 1.2, hay: 1.1, fountain: 1.05, well: 1.1 };

function buildBlobs(scene, world, extra) {
    const list = [];
    for (const o of world.objects) {
        const k = BLOB[o.type];
        if (k) list.push([o.x, o.y, o.r * k]);
    }
    for (const e of extra) list.push(e);
    const mat = new THREE.MeshBasicMaterial({ map: blobTexture(), color: '#06210c', transparent: true, opacity: 0.32, depthWrite: false });
    const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), mat, list.length);
    const d = new THREE.Object3D();
    list.forEach(([x, y, r], i) => {
        d.position.set(x, 0.7, y);
        d.scale.set(r, 1, r);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 1;
    mesh.computeBoundingSphere();
    scene.add(mesh);
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
        const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, vertexColors: true });
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
            const basin = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r * 1.04, 22, 20), flat('#bdb8ab'));
            basin.position.y = 11;
            const rim = new THREE.Mesh(new THREE.TorusGeometry(o.r * 0.96, 4, 6, 28), flat('#d8d3c6'));
            rim.rotation.x = Math.PI / 2;
            rim.position.y = 22;
            const water = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.86, o.r * 0.86, 2, 20), flat('#5fd2ff'));
            water.position.y = 20;
            const pillar = new THREE.Mesh(new THREE.CylinderGeometry(10, 14, 54, 8), flat('#a7a298'));
            pillar.position.y = 40;
            const bowl = new THREE.Mesh(new THREE.CylinderGeometry(26, 12, 12, 12), flat('#cfcabd'));
            bowl.position.y = 68;
            const top = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 3, 12), flat('#7fe0ff'));
            top.position.y = 74;
            const jet = new THREE.Mesh(new THREE.ConeGeometry(4, 22, 8), new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.75 }));
            jet.position.y = 86;
            for (const m of [basin, rim, pillar, bowl]) { m.castShadow = true; m.receiveShadow = true; }
            g.add(basin, rim, water, pillar, bowl, top, jet);
            g.position.set(o.x, 0, o.y);
            scene.add(g);
        } else if (o.type === 'well') {
            const g = new THREE.Group();
            const ring = new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r, 30, 14), flat(o.base || '#9a958a'));
            ring.position.y = 15;
            const water = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.75, o.r * 0.75, 2, 14), flat('#3f8fd8'));
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

/* ----- Accessoires de ville (avec collisions) ----- */

function freeSpot(world, x, y, r, tmp) {
    if (x < r || y < r || x > world.width - r || y > world.height - r) return false;
    if (isWater(world.sampleGround(x, y).biome)) return false;
    if (distToRoads(world, x, y, 120) < 62 + r) return false;
    const list = world.collide.query(x - r - 10, y - r - 10, x + r + 10, y + r + 10, tmp);
    for (const o of list) {
        if (o.kind === 'circle') {
            if (Math.hypot(o.x - x, o.y - y) < o.r + r + 8) return false;
        } else {
            const px = Math.max(o.x, Math.min(x, o.x + o.w));
            const py = Math.max(o.y, Math.min(y, o.y + o.h));
            if (Math.hypot(x - px, y - py) < r + 6) return false;
        }
    }
    return true;
}

function addCollider(world, x, y, r) {
    world.collide.insert({ kind: 'circle', x, y, r }, x - r, y - r, x + r, y + r);
}

function buildDecor(scene, world) {
    const tmp = [];
    const lamps = [];
    const crates = [];
    const barrels = [];
    const blobs = [];
    let seed = 1;
    const rnd = () => hash(seed++ * 1.7);

    // Lampadaires autour des places
    for (const t of world.towns) {
        if (!t.plazaR) continue;
        const n = 8;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU + Math.PI / 8;
            const x = t.x + Math.cos(a) * (t.plazaR + 22);
            const y = t.y + Math.sin(a) * (t.plazaR + 22);
            if (!freeSpot(world, x, y, 7, tmp)) continue;
            addCollider(world, x, y, 6);
            lamps.push([x, y]);
        }
    }
    // Caisses et tonneaux contre les murs sans porte
    for (const b of world.buildings) {
        if (rnd() < 0.3) continue;
        const doorSides = new Set((b.doors || []).map(d => d.side));
        const sides = ['top', 'bottom', 'left', 'right'].filter(s => !doorSides.has(s));
        if (!sides.length) continue;
        const side = sides[Math.floor(rnd() * sides.length)];
        const count = 1 + Math.floor(rnd() * 3);
        const horiz = side === 'top' || side === 'bottom';
        const len = horiz ? b.w : b.h;
        let u = 30 + rnd() * Math.max(0, len - 60 - count * 34);
        for (let i = 0; i < count; i++, u += 34) {
            const off = 22;
            const x = horiz ? b.x + u : (side === 'left' ? b.x - off : b.x + b.w + off);
            const y = horiz ? (side === 'top' ? b.y - off : b.y + b.h + off) : b.y + u;
            const barrel = rnd() < 0.45;
            const r = barrel ? 12 : 15;
            if (!freeSpot(world, x, y, r, tmp)) continue;
            addCollider(world, x, y, r);
            (barrel ? barrels : crates).push([x, y, rnd()]);
            blobs.push([x, y, r * 1.4]);
        }
    }

    // Géométries fusionnées (une passe de dessin par type)
    const lampPost = [];
    const lampHead = [];
    for (const [x, y] of lamps) {
        lampPost.push(new THREE.CylinderGeometry(3, 4, 92, 6).translate(x, 46, y));
        lampPost.push(new THREE.CylinderGeometry(7, 8, 6, 8).translate(x, 3, y));
        lampHead.push(new THREE.CylinderGeometry(9, 5, 12, 6).translate(x, 98, y));
        blobs.push([x, y, 16]);
    }
    const addMerged = (parts, material, cast = true) => {
        if (!parts.length) return;
        const m = new THREE.Mesh(heightShade(mergeGeometries(parts), 0.75, 1.05), material);
        m.castShadow = cast;
        m.receiveShadow = true;
        scene.add(m);
    };
    addMerged(lampPost, new THREE.MeshLambertMaterial({ color: '#3a4256', flatShading: true, vertexColors: true }));
    addMerged(lampHead, new THREE.MeshBasicMaterial({ color: '#ffe9a8' }), true);

    const crateBody = [];
    const crateTrim = [];
    for (const [x, y, k] of crates) {
        const s = 26 + k * 6;
        const rot = k * 0.8;
        const g = new THREE.BoxGeometry(s, s, s).rotateY(rot).translate(x, s / 2, y);
        crateBody.push(g);
        // Planches en croix sur le dessus et cerclage
        crateTrim.push(new THREE.BoxGeometry(s + 1, 3, s + 1).rotateY(rot).translate(x, s - 1.5, y));
        crateTrim.push(new THREE.BoxGeometry(s + 1, 3, s + 1).rotateY(rot).translate(x, 1.5, y));
        crateTrim.push(new THREE.BoxGeometry(4, s + 1, s + 1.2).rotateY(rot).translate(x, s / 2, y));
    }
    addMerged(crateBody, new THREE.MeshLambertMaterial({ color: '#c08a4e', flatShading: true, vertexColors: true }));
    addMerged(crateTrim, new THREE.MeshLambertMaterial({ color: '#8a5a30', flatShading: true, vertexColors: true }));

    const barrelBody = [];
    const barrelHoop = [];
    for (const [x, y] of barrels) {
        barrelBody.push(new THREE.CylinderGeometry(11, 11, 34, 10).translate(x, 17, y));
        for (const h of [6, 28]) barrelHoop.push(new THREE.CylinderGeometry(11.8, 11.8, 3, 10).translate(x, h, y));
    }
    addMerged(barrelBody, new THREE.MeshLambertMaterial({ color: '#4f7fb8', flatShading: true, vertexColors: true }));
    addMerged(barrelHoop, new THREE.MeshLambertMaterial({ color: '#3a4256', flatShading: true, vertexColors: true }));
    return blobs;
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

// Côté d'un morceau de mur (rectangle) par rapport à son bâtiment, ou null (coin, cloison)
function wallSide(b, w) {
    if (w.h <= WALL_T + 1 && w.y <= b.y + 1) return 'top';
    if (w.h <= WALL_T + 1 && w.y + w.h >= b.y + b.h - 1) return 'bottom';
    if (w.w <= WALL_T + 1 && w.x <= b.x + 1) return 'left';
    if (w.w <= WALL_T + 1 && w.x + w.w >= b.x + b.w - 1) return 'right';
    return null;
}

// Fenêtres (cadre clair + vitre) sur la face extérieure des murs
function windowParts(b, frames, glass) {
    for (const w of b.walls) {
        const side = wallSide(b, w);
        if (!side) continue;
        const horiz = side === 'top' || side === 'bottom';
        const L = horiz ? w.w : w.h;
        const n = Math.floor((L - 40) / 95);
        if (n < 1) continue;
        for (let i = 0; i < n; i++) {
            const u = (horiz ? w.x : w.y) + (L * (i + 1)) / (n + 1);
            const out = side === 'top' ? w.y : side === 'bottom' ? w.y + w.h : side === 'left' ? w.x : w.x + w.w;
            const dir = side === 'top' || side === 'left' ? -1 : 1;
            const y = 66;
            const place = (gw, gh, depth, push, list) => {
                const g = horiz ? new THREE.BoxGeometry(gw, gh, depth) : new THREE.BoxGeometry(depth, gh, gw);
                if (horiz) g.translate(u, y, out + dir * push);
                else g.translate(out + dir * push, y, u);
                list.push(g);
            };
            place(36, 38, 2.4, 1.2, frames);       // cadre
            place(40, 3.2, 6, 2.6, frames);        // appui
            frames[frames.length - 1].translate(0, -20, 0);
            place(27, 29, 2.6, 1.8, glass);        // vitre
            place(2.4, 29, 2.8, 2.0, frames);      // meneau
        }
    }
}

// Encadrements de porte (bois sombre) aux ouvertures
function doorParts(b, wood) {
    for (const d of b.doors || []) {
        const horiz = d.side === 'top' || d.side === 'bottom';
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const out = d.side === 'top' ? b.y : d.side === 'bottom' ? b.y + b.h : d.side === 'left' ? b.x : b.x + b.w;
        const h = WALL_H - 26;
        for (const s of [-1, 1]) {
            if (horiz) wood.push(new THREE.BoxGeometry(6, h, WALL_T + 4).translate(cx + s * (d.w / 2 + 1), h / 2, out + (d.side === 'top' ? WALL_T / 2 : -WALL_T / 2)));
            else wood.push(new THREE.BoxGeometry(WALL_T + 4, h, 6).translate(out + (d.side === 'left' ? WALL_T / 2 : -WALL_T / 2), h / 2, cy + s * (d.w / 2 + 1)));
        }
        if (horiz) wood.push(new THREE.BoxGeometry(d.w + 12, 6, WALL_T + 4).translate(cx, h + 3, out + (d.side === 'top' ? WALL_T / 2 : -WALL_T / 2)));
        else wood.push(new THREE.BoxGeometry(WALL_T + 4, 6, d.w + 12).translate(out + (d.side === 'left' ? WALL_T / 2 : -WALL_T / 2), h + 3, cy));
    }
}

function roofMaterial(color, opts = {}) {
    const m = new THREE.MeshLambertMaterial({
        color: new THREE.Color(color), flatShading: true, transparent: false, side: opts.double ? THREE.DoubleSide : THREE.FrontSide
    });
    if (opts.tiles) {
        // Rangées de tuiles : bandes selon la hauteur (parallèles au faîtage sur chaque pan)
        // + joints décalés d'une rangée à l'autre, calculés dans le shader (pas de texture)
        m.onBeforeCompile = (shader) => {
            shader.vertexShader = 'varying vec3 vRoofW;\n' + shader.vertexShader.replace(
                '#include <project_vertex>',
                '#include <project_vertex>\n vRoofW = (modelMatrix * vec4(transformed, 1.0)).xyz;'
            );
            shader.fragmentShader = 'varying vec3 vRoofW;\n' + shader.fragmentShader.replace(
                '#include <map_fragment>',
                `#include <map_fragment>
                {
                    float row = vRoofW.y / 7.0;
                    float fr = fract(row);
                    float along = (vRoofW.x + vRoofW.z) / 14.0 + floor(row) * 0.5;
                    float joint = smoothstep(0.0, 0.08, fract(along)) * smoothstep(1.0, 0.92, fract(along));
                    float edge = smoothstep(0.0, 0.22, fr);
                    diffuseColor.rgb *= mix(0.72, 1.0, edge) * mix(0.86, 1.0, joint);
                    diffuseColor.rgb *= 0.94 + 0.12 * fract(sin(floor(row) * 12.9898 + floor(along) * 78.233) * 43758.5453);
                }`
            );
        };
        m.customProgramCacheKey = () => 'isoRoofTiles';
    }
    return m;
}

function buildBuildings(scene, world) {
    const out = [];
    const frames = [];
    const glass = [];
    const wood = [];
    for (const b of world.buildings) {
        // Murs : vraies ouvertures de portes (mêmes rectangles que les collisions)
        const pieces = b.walls.map(w => new THREE.BoxGeometry(w.w, WALL_H, w.h)
            .translate(w.x + w.w / 2, WALL_H / 2, w.y + w.h / 2));
        // Linteau au-dessus des portes : le mur reste continu en haut
        for (const d of b.doors || []) {
            const T = WALL_T;
            const lintelH = 26;
            let x, z, w, h;
            if (d.side === 'top' || d.side === 'bottom') {
                w = d.w; h = T; x = b.x + b.w / 2; z = d.side === 'top' ? b.y + T / 2 : b.y + b.h - T / 2;
            } else {
                w = T; h = d.w; z = b.y + b.h / 2; x = d.side === 'left' ? b.x + T / 2 : b.x + b.w - T / 2;
            }
            pieces.push(new THREE.BoxGeometry(w, lintelH, h).translate(x, WALL_H - lintelH / 2, z));
        }
        const walls = new THREE.Mesh(heightShade(mergeGeometries(pieces), 0.8, 1.04), new THREE.MeshLambertMaterial({ color: new THREE.Color(wallColor(b)), flatShading: true, vertexColors: true }));
        walls.castShadow = true;
        walls.receiveShadow = true;
        scene.add(walls);

        // Soubassement plus sombre (bas des murs) + bandeau en haut
        const trim = new THREE.Mesh(
            mergeGeometries([
                ...b.walls.map(w => new THREE.BoxGeometry(w.w + 2, 6, w.h + 2).translate(w.x + w.w / 2, WALL_H - 3, w.y + w.h / 2)),
                ...b.walls.map(w => new THREE.BoxGeometry(w.w + 2.4, 14, w.h + 2.4).translate(w.x + w.w / 2, 7, w.y + w.h / 2))
            ]),
            flat(mixHex(wallColor(b), '#1a2030', 0.35))
        );
        trim.receiveShadow = true;
        scene.add(trim);

        windowParts(b, frames, glass);
        doorParts(b, wood);

        // Toit (+ faîtage, cheminée ou rebord) : tout s'efface ensemble quand on entre
        let roofColor = b.roofType === 'barn' ? '#b8322b' : b.roof;
        if (b.snow) roofColor = mixHex(roofColor, '#f4f8fc', 0.6);
        const roof = new THREE.Group();
        const mats = [];
        const part = (geo, color, double = false, tiles = false) => {
            const m = roofMaterial(color, { double, tiles });
            mats.push(m);
            const me = new THREE.Mesh(geo, m);
            me.castShadow = true;
            me.receiveShadow = true;
            roof.add(me);
            return me;
        };
        const k = hash(b.id + 7);
        if (b.roofType === 'flat') {
            part(new THREE.BoxGeometry(b.w + 16, 14, b.h + 16).translate(b.x + b.w / 2, WALL_H + 7, b.y + b.h / 2), roofColor);
            // Rebord + petit bloc technique sur le toit
            const edge = mixHex(wallColor(b), '#000000', 0.12);
            const X0 = b.x - 8, X1 = b.x + b.w + 8, Z0 = b.y - 8, Z1 = b.y + b.h + 8;
            part(mergeGeometries([
                new THREE.BoxGeometry(X1 - X0, 10, 6).translate((X0 + X1) / 2, WALL_H + 19, Z0 + 3),
                new THREE.BoxGeometry(X1 - X0, 10, 6).translate((X0 + X1) / 2, WALL_H + 19, Z1 - 3),
                new THREE.BoxGeometry(6, 10, Z1 - Z0).translate(X0 + 3, WALL_H + 19, (Z0 + Z1) / 2),
                new THREE.BoxGeometry(6, 10, Z1 - Z0).translate(X1 - 3, WALL_H + 19, (Z0 + Z1) / 2)
            ]), edge);
            part(new THREE.BoxGeometry(28, 16, 22).translate(b.x + b.w * (0.25 + k * 0.5), WALL_H + 22, b.y + b.h * 0.35), '#c9ced6');
        } else {
            const rise = Math.min(b.w, b.h) * (b.roofType === 'barn' ? 0.5 : 0.36);
            part(gableGeometry(b, rise), roofColor, true, true);
            // Faîtage plus sombre le long de l'arête
            const alongX = b.w >= b.h;
            const o = ROOF_OVER;
            const ridgeLen = (alongX ? b.w : b.h) + o * 2 + 4;
            const rx = b.x + b.w / 2;
            const rz = b.y + b.h / 2;
            const ridge = alongX ? new THREE.BoxGeometry(ridgeLen, 7, 9) : new THREE.BoxGeometry(9, 7, ridgeLen);
            part(ridge.translate(rx, WALL_H + rise + 1, rz), mixHex(roofColor, '#000000', 0.28));
            // Cheminée en brique sur un pan (pas sur les granges)
            if (b.roofType !== 'barn' && k > 0.35) {
                const half = (alongX ? b.h : b.w) / 2 + o;
                const off = half * 0.45;
                const along = (alongX ? b.w : b.h) * (k > 0.65 ? 0.28 : -0.28);
                const hRoof = WALL_H + rise * (1 - off / half);
                const cx = alongX ? rx + along : rx + off;
                const cz = alongX ? rz + off : rz + along;
                part(new THREE.BoxGeometry(16, 40, 16).translate(cx, hRoof + 12, cz), '#a8553a');
                part(new THREE.BoxGeometry(20, 5, 20).translate(cx, hRoof + 33, cz), '#7e3f2c');
            }
        }
        scene.add(roof);
        out.push({ b, roof, mats, alpha: 1 });
    }

    const addMerged = (parts, material, cast) => {
        if (!parts.length) return;
        const m = new THREE.Mesh(mergeGeometries(parts), material);
        m.castShadow = cast;
        m.receiveShadow = true;
        scene.add(m);
    };
    addMerged(frames, flat('#f4efe6'), false);
    addMerged(glass, new THREE.MeshLambertMaterial({ color: '#3d74b8', emissive: new THREE.Color('#0d2a52') }), false);
    addMerged(wood, flat('#6b4a2e'), true);
    return out;
}

export class Props {
    constructor(scene, world) {
        buildInstances(scene, world);
        buildLandmarks(scene, world);
        const decorBlobs = buildDecor(scene, world);
        buildBlobs(scene, world, decorBlobs);
        this.buildings = buildBuildings(scene, world);
    }

    // Le toit du bâtiment où se trouve le joueur s'efface (les autres réapparaissent)
    update(dt, px, py) {
        const k = Math.min(1, dt * 9);
        for (const h of this.buildings) {
            const b = h.b;
            const inside = px > b.x && px < b.x + b.w && py > b.y && py < b.y + b.h;
            const target = inside ? 0 : 1;
            if (h.alpha === target) continue;
            h.alpha += (target - h.alpha) * k;
            if (Math.abs(target - h.alpha) < 0.01) h.alpha = target;
            // Toit plein = matériau opaque (la silhouette du joueur se voit à travers),
            // translucide seulement pendant le fondu
            const fading = h.alpha < 0.999;
            for (const m of h.mats) {
                if (m.transparent !== fading) {
                    m.transparent = fading;
                    m.needsUpdate = true;
                }
                m.opacity = h.alpha;
            }
            h.roof.visible = h.alpha > 0.03;
            h.roof.traverse(o => { if (o.isMesh) o.castShadow = h.alpha > 0.5; });
        }
    }
}
