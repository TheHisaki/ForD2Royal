/* ==================================
   ISOLA - MODÈLES 3D DES ARMES ET OBJETS
   Armes de base (fusil d'assaut, mitraillette, pistolet, pompe), soins
   (bandage, potion de bouclier, kit de soin), boîtes de munitions et
   mannequin d'entraînement. Low-poly en code, mêmes couleurs que le jeu 2D
   (bande de rareté sur le corps de l'arme).
   Repère : poignée à l'origine, canon vers +Z, axe du canon en y = 0.
   ================================== */

import * as THREE from '../vendor/three/three.module.js';
import { flat } from './models.js?v=2';
import { RARITIES } from './arsenal.js?v=1';

const METAL = '#3b4150';
const METAL_DARK = '#272c37';
const METAL_LIGHT = '#59616f';
const WOOD = '#8a5a34';

const geoCache = new Map();
function boxGeo(w, h, d) {
    const k = `b${w}|${h}|${d}`;
    let g = geoCache.get(k);
    if (!g) geoCache.set(k, (g = new THREE.BoxGeometry(w, h, d)));
    return g;
}
function cylGeo(r, len, seg = 8) {
    const k = `c${r}|${len}|${seg}`;
    let g = geoCache.get(k);
    if (!g) {
        g = new THREE.CylinderGeometry(r, r, len, seg);
        g.rotateX(Math.PI / 2); // axe le long de Z
        geoCache.set(k, g);
    }
    return g;
}

// Petit constructeur : ajoute des pièces à un groupe (matériau imposé possible : silhouette)
function builder(group, override, shadow = true) {
    const add = (geo, color, x, y, z, rx = 0) => {
        const m = new THREE.Mesh(geo, override || flat(color));
        m.position.set(x, y, z);
        if (rx) m.rotation.x = rx;
        m.castShadow = shadow && !override;
        group.add(m);
        return m;
    };
    return {
        mesh: add,
        box: (w, h, d, color, x = 0, y = 0, z = 0, rx = 0) => add(boxGeo(w, h, d), color, x, y, z, rx),
        cyl: (r, len, color, x = 0, y = 0, z = 0, seg = 8) => add(cylGeo(r, len, seg), color, x, y, z)
    };
}

/* ===================== ARMES ===================== */

const GUNS = {
    ar(p, band) {
        p.box(6, 9, 15, METAL_DARK, 0, -1, -15);          // crosse
        p.box(4.5, 9, 5, METAL_DARK, 0, -7, -5, 0.3);      // poignée
        p.box(7, 9, 26, METAL, 0, 0, 3);                    // corps
        p.box(7.4, 9.4, 3.5, band, 0, 0, 9);                // bande de rareté
        p.box(4.5, 12, 6, METAL_DARK, 0, -9, 5, -0.2);      // chargeur
        p.box(6, 6.5, 12, METAL_DARK, 0, -0.5, 20);         // garde-main
        p.cyl(1.7, 16, METAL_LIGHT, 0, 0.5, 33);            // canon
        p.box(3, 3, 9, METAL_LIGHT, 0, 6, 4);               // viseur
    },
    smg(p, band) {
        p.box(2.5, 5, 11, METAL_DARK, 0, 0, -12);           // crosse fine
        p.box(4.5, 9, 5, METAL_DARK, 0, -7, -3, 0.3);       // poignée
        p.box(7, 9, 20, METAL, 0, 0, 3);
        p.box(7.4, 9.4, 3.5, band, 0, 0, 7);
        p.box(4, 14, 5, METAL_DARK, 0, -10, 8);             // long chargeur
        p.cyl(1.6, 9, METAL_LIGHT, 0, 0.5, 17);
    },
    pistol(p, band) {
        p.box(4.5, 11, 5.5, METAL_DARK, 0, -6, -1, 0.25);   // crosse
        p.box(5, 4.5, 15, METAL, 0, -0.5, 4);               // carcasse
        p.box(5.4, 4.9, 3, band, 0, -0.5, 6);
        p.box(5, 4, 17, METAL_LIGHT, 0, 3.5, 5);            // culasse
    },
    shotgun(p, band) {
        p.box(6, 9, 17, WOOD, 0, -1.5, -16);                // crosse en bois
        p.box(4.5, 8, 5, WOOD, 0, -7, -6, 0.3);
        p.box(7, 9, 14, METAL, 0, 0, 0);
        p.box(7.4, 9.4, 3.5, band, 0, 0, 3);
        p.cyl(2.2, 28, METAL_LIGHT, 0, 1.5, 20);            // canon
        p.cyl(1.9, 22, METAL_DARK, 0, -2.8, 17);            // tube magasin
        p.box(6.5, 6.5, 10, WOOD, 0, -3, 18);               // pompe
    }
};

export function buildGun(weaponId, rarity = 0, override = null) {
    const g = new THREE.Group();
    const band = (RARITIES[rarity] || RARITIES[0]).color;
    (GUNS[weaponId] || GUNS.pistol)(builder(g, override), band);
    return g;
}

/* ===================== SOINS ET MUNITIONS ===================== */

const HEAL_MODELS = {
    bandage(p) {
        p.cyl(7, 9, '#f4efe6', 0, 0, 0, 12);
        p.cyl(7.3, 3, '#ff8fb0', 0, 0, 0, 12);
        p.box(3, 1.2, 10, '#f4efe6', 0, -6.5, 7);           // bout déroulé
    },
    medkit(p) {
        p.box(20, 12, 15, '#ff4d5a', 0, 0, 0);
        p.box(10, 1.4, 3.2, '#ffffff', 0, 6.4, 0);
        p.box(3.2, 1.4, 10, '#ffffff', 0, 6.4, 0);
        p.box(8, 3, 2, '#262c44', 0, 7, -8);                // poignée
    },
    shieldPotion(p) {
        p.mesh(new THREE.SphereGeometry(8, 10, 8), '#4aa8ff', 0, 0, 0);
        p.box(4.5, 7, 4.5, '#bfe9ff', 0, 9, 0);             // goulot
        p.box(5.5, 3, 5.5, WOOD, 0, 13.5, 0);               // bouchon
        p.box(5, 2, 1, '#ffffff', -2.5, 3, 7.4);            // reflet
    }
};

export function buildHeal(itemId) {
    const g = new THREE.Group();
    (HEAL_MODELS[itemId] || HEAL_MODELS.bandage)(builder(g, null));
    return g;
}

export function buildAmmo(color) {
    const g = new THREE.Group();
    const p = builder(g, null);
    p.box(16, 9, 11, '#3d4a35', 0, 0, 0);
    p.box(16.4, 3, 11.4, color, 0, 2, 0);
    for (const x of [-4, 0, 4]) {
        const m = p.box(2.4, 5, 2.4, '#e5b53b', x, 6.5, 0);
        m.castShadow = false;
    }
    return g;
}

/* ===================== MANNEQUIN D'ENTRAÎNEMENT ===================== */

// Mannequin en paille sur un poteau, cible rouge sur le torse (tourné vers +Z)
export function buildDummy() {
    const root = new THREE.Group();
    const body = new THREE.Group();     // pivote au pied (chute, vacillement)
    root.add(body);
    const p = builder(body, null);
    p.box(30, 4, 30, WOOD, 0, 2, 0);                         // socle
    const post = p.box(5, 34, 5, WOOD, 0, 20, 0);
    post.castShadow = true;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(13, 15, 30, 9), flat('#d9c27a'));
    torso.position.y = 48;
    torso.castShadow = true;
    body.add(torso);
    p.box(42, 5, 5, WOOD, 0, 56, 0);                         // bras en croix
    const head = new THREE.Mesh(new THREE.SphereGeometry(11, 9, 7), flat('#e6d29a'));
    head.position.y = 73;
    head.castShadow = true;
    body.add(head);
    // Cible
    for (const [r, c, z] of [[10, '#ffffff', 13.2], [7.5, '#ff4d5a', 13.8], [4.5, '#ffffff', 14.4], [2, '#ff4d5a', 15]]) {
        const disk = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.8, 16).rotateX(Math.PI / 2), flat(c));
        disk.position.set(0, 48, z);
        body.add(disk);
    }
    return { root, body };
}
