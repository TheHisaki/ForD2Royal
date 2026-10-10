/* ==================================
   ISOLA - COSMÉTIQUES EN 3D
   Le personnage d'ISOLA porte exactement le chargement du casier du lobby :
   - tenue : les 12 styles du jeu 2D (défaut avec ses 4 coiffures et ses lunettes,
     chevalier, squelette, ninja, astronaute, chef, pirate, mécha, mage, viking,
     roi citrouille, dragon), avec les couleurs du lobby (look : veste, manches,
     pantalon, chaussures, accent) et celles du jeu (game : casque, panache...) ;
   - sac à dos : les 12 motifs (carapace, ailes, cape, queue de poisson, pack
     techno, cœur pixel, écu, sac de rando, planche de surf, tonneau, citrouille,
     œuf de dragon), sinon l'objet de dos du style (bouclier, réacteur, baguette...) ;
   - planeur : les 13 planeurs à forme reprennent le dessin du casier (animé),
     les planeurs classiques gardent la voile en 3D à leurs couleurs ;
   - pioche : accrochée dans le dos (dessin du casier).
   Petits effets animés comme en 2D : ailes qui battent, flammes, orbes, lucioles,
   visière qui clignote, cercle de runes...
   Repère du personnage : environ 80 de haut, regard vers +Z, droite = -X.
   ================================== */

import * as THREE from '../vendor/three/three.module.js';
import { mixHex, buildGlider } from './models.js?v=2';
import { GLIDER_ART } from '../glider-art.js';
import { pickaxeCanvas } from '../pickaxe-art.js';

const TAU = Math.PI * 2;
const STYLES = new Set(['knight', 'skeleton', 'ninja', 'astro', 'chef', 'pirate', 'mecha', 'mage', 'viking', 'pumpkin', 'dragon']);

// Couleurs fixes du jeu 2D (js/game/draw.js)
const C = {
    boneDark: '#1a1026', visorSlit: '#141a2e', nozzle: '#5b6680', nozzleIn: '#262c40',
    antenna: '#c9d2e0', scabbard: '#3d3560', wrap: '#e8e2d0', tsuba: '#ffd24a',
    bread: '#d9a05b', breadCut: '#a8692e', toque: '#fbfcff', hat: '#1c1f33',
    parrot: '#2ec27e', parrotD: '#1f8f5a', hoodHole: '#0d0a24', mechaJoint: '#2b3245',
    helm: '#c9d2dd', helmD: '#8d97a8', horn: '#f4ead2', shieldWood: '#b97a3c',
    fur: '#9a7a56', burlap: '#c89a5a', candy: ['#ff5d8f', '#4fe8ff', '#ffe03d'],
    fire: '#ffb21f', fireIn: '#ffe03d', belt: '#262c44', lens: '#56d6ff'
};

const HEX6 = /^#[0-9a-f]{6}$/i;
const shade = (hex, k) => (HEX6.test(hex) ? mixHex(hex, k < 0 ? '#000000' : '#ffffff', Math.abs(k)) : hex);

/* ===================== CHARGEMENT DU CASIER ===================== */

// Chargement complet à partir du module Cosmetics (casier du lobby)
export function loadoutFrom(Cosmetics) {
    const lo = {
        style: 'default', hair: 'spiky', goggles: true,
        look: { skin: '#f2c29b', hair: '#3b2415', outfit: '#ff4d5a', outfitDark: '#c42847', pants: '#232845', shoes: '#1a1f33', pack: '#ffc93c', accent: '#2ee6c8' },
        game: { skin: '#f2c29b', hair: '#3b2415', outfit: '#ff4d5a', pack: '#ffc93c' },
        pack: null, glider: { style: null, colors: ['#ffe03d', '#3a8dff'] }, pickaxe: 'pioche-defaut'
    };
    try {
        const s = Cosmetics.equipped;
        if (s) {
            lo.style = STYLES.has(s.style) ? s.style : 'default';
            lo.hair = s.hair || 'spiky';
            lo.goggles = s.goggles !== false;
            Object.assign(lo.look, s.look || {});
            Object.assign(lo.game, s.game || {});
        }
        const pack = Cosmetics.equippedOf('backpack');
        if (pack && !pack.none && pack.color) {
            lo.pack = { motif: pack.motif || null, color: pack.color, accent: pack.accent || '#ffffff' };
            // Comme en 2D : le sac équipé remplace la couleur « pack » de la tenue
            lo.game.pack = pack.color;
            lo.look.pack = pack.color;
        }
        const g = Cosmetics.equippedOf('glider');
        if (g) lo.glider = { style: g.style || null, colors: Array.isArray(g.colors) ? g.colors : lo.glider.colors };
        const p = Cosmetics.equippedOf('pickaxe');
        if (p?.id) lo.pickaxe = p.id;
    } catch { /* profil illisible : chargement par défaut */ }
    return lo;
}

/* ===================== PERSONNAGE ===================== */

/*
   lo : chargement (voir loadoutFrom). override : matériau imposé (silhouette « rayons X »).
   Renvoie { root, pose(walk, moving, air, aim), animate(time), setGhost(on), mount }.
*/
export function buildAvatar(lo, override = null) {
    const L = lo.look;
    const G = lo.game;
    const style = STYLES.has(lo.style) ? lo.style : 'default';

    const mats = [];
    const cache = new Map();
    const mat = (col) => {
        if (override) return override;
        let m = cache.get(col);
        if (!m) {
            m = new THREE.MeshLambertMaterial({ color: new THREE.Color(col), flatShading: true });
            m.userData.base = 1;
            cache.set(col, m);
            mats.push(m);
        }
        return m;
    };
    // Lumineux (néon, yeux, flammes) : non éclairé, couleur pleine
    const glow = (col, opacity = 1) => {
        if (override) return override;
        const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col), transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
        m.userData.base = opacity;
        mats.push(m);
        return m;
    };

    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const anim = [];

    const put = (geo, material, x = 0, y = 0, z = 0, parent = body) => {
        const me = new THREE.Mesh(geo, material);
        me.position.set(x, y, z);
        me.castShadow = !override;
        parent.add(me);
        return me;
    };
    const box = (w, h, d, col, x, y, z, parent = body, m = null) => put(new THREE.BoxGeometry(w, h, d), m || mat(col), x, y, z, parent);
    const ball = (r, col, x, y, z, parent = body, s = null, m = null, seg = 10) => {
        const me = put(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), m || mat(col), x, y, z, parent);
        if (s) me.scale.set(s[0], s[1], s[2]);
        return me;
    };
    const cyl = (rt, rb, h, col, x, y, z, parent = body, seg = 10, m = null) =>
        put(new THREE.CylinderGeometry(rt, rb, h, seg), m || mat(col), x, y, z, parent);
    const cone = (r, h, col, x, y, z, parent = body, seg = 6, m = null) =>
        put(new THREE.ConeGeometry(r, h, seg), m || mat(col), x, y, z, parent);
    // Oriente l'axe +Y d'un objet vers la direction (dx, dy, dz)
    const aimY = (o, dx, dy, dz) => {
        o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize());
        return o;
    };

    /* ----- Corps commun ----- */
    const handCol = style === 'knight' ? G.skin : style === 'astro' ? L.outfit : L.skin;
    const legs = [];
    for (const side of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(side * 6.5, 24, 0);
        body.add(hip);
        box(10, 20, 11, L.pants, 0, -10, 0, hip);
        box(11, 6, 15, L.shoes, 0, -21, 2, hip);
        legs.push(hip);
    }
    box(27, 24, 19, L.outfit, 0, 35, 0);
    box(28, 4, 20, C.belt, 0, 25, 0);
    box(6, 4.4, 1.5, L.accent, 0, 25, 10.2);
    if (style === 'default') box(10, 4, 3, L.accent, -5, 45.5, 9.2);   // écharpe

    const arms = [];
    for (const side of [-1, 1]) {
        const sh = new THREE.Group();
        sh.position.set(side * 17.5, 45, 0);
        body.add(sh);
        box(8, 19, 9, L.outfitDark || shade(L.outfit, -0.2), 0, -8, 0, sh);
        box(8, 7, 8, handCol, 0, -20, 0, sh);
        arms.push(sh);
    }

    // Arme tenue à deux mains devant le torse (canon vers +Z)
    const mount = new THREE.Group();
    mount.position.set(0, 42, 17);
    body.add(mount);

    /* ----- Tête ----- */
    const head = new THREE.Group();
    head.position.set(0, style === 'astro' ? 63 : 62, 0);
    body.add(head);
    const eyes = (col = '#141826', y = 0, z = 15.2) => {
        for (const s of [-1, 1]) box(3.4, 5, 2, col, s * 5.5, y, z, head);
    };
    const face = () => {
        ball(16, L.skin, 0, 0, 0, head);
        eyes();
        box(7, 2, 2, mixHex(L.skin, '#7a2a2a', 0.45), 0, -7, 15, head);
    };
    const hairCap = (col, r = 17.2) => {
        const hc = put(new THREE.SphereGeometry(r, 12, 6, 0, TAU, 0, Math.PI * 0.52), mat(col), 0, 1, -1.5, head);
        hc.rotation.x = -0.28;
        return hc;
    };

    if (style === 'default') {
        face();
        for (const s of [-1, 1]) box(4, 2, 1, '#ff8fa3', s * 9, -4, 12.8, head);   // joues
        const H = L.hair;
        hairCap(H);
        if (lo.hair === 'bun') {
            ball(7, H, 0, 15, -9, head);
        } else if (lo.hair === 'swoop') {
            const f = ball(9, H, -4, 11, 9, head, [1.5, 0.6, 1]);
            f.rotation.z = 0.35;
        } else if (lo.hair === 'mohawk') {
            for (let i = 0; i < 5; i++) {
                const e = 0.85 + i * 0.36;
                const c = cone(3.2, 12, H, 0, Math.sin(e) * 17, Math.cos(e) * 17 - 1, head, 5);
                aimY(c, 0, Math.sin(e), Math.cos(e));
            }
        } else {
            for (const [x, y, z] of [[0, 17, -2], [-7, 14, -5], [7, 14, -5], [-4, 15, 4], [4, 15, 4], [0, 12, -11]]) {
                const c = cone(4.2, 11, H, x, y, z, head, 5);
                aimY(c, x, y, z);
            }
        }
        if (lo.goggles) {
            const strap = put(new THREE.TorusGeometry(16.6, 1.4, 6, 28), mat(L.accent), 0, 6, 0, head);
            strap.rotation.x = Math.PI / 2;
            for (const s of [-1, 1]) {
                const lens = box(7.5, 5.5, 3, C.lens, s * 4.6, 8, 14.4, head);
                lens.rotation.x = -0.35;
            }
        }
    } else if (style === 'knight') {
        ball(17, G.skin, 0, 0, 0, head);
        // Bande sombre d'une oreille à l'autre, par-dessus le heaume
        put(new THREE.TorusGeometry(17.3, 1.6, 6, 16, Math.PI), mat(shade(G.skin, -0.35)), 0, 0, 3, head);
        box(20, 3.5, 4, C.visorSlit, 0, 0, 15.6, head);
        ball(4, G.pack, 0, 18, -6, head, [0.9, 1.25, 3.6]);
        box(1.4, 1.6, 26, G.hair, 0, 23, -6, head);
    } else if (style === 'skeleton') {
        ball(16, G.skin, 0, 0, 0, head);
        box(14, 6, 10, G.skin, 0, -10, 6, head);
        for (const s of [-1, 1]) {
            ball(4.6, C.boneDark, s * 5.5, 2, 13.2, head);
            ball(2, G.pack, s * 5.5, 2, 16, head, null, glow(G.pack));
        }
        box(10, 2.5, 1.5, '#ffffff', 0, -9, 11.4, head);
        box(1.2, 9, 1.2, shade(G.skin, -0.35), -8, 8, 12, head).rotation.z = 0.5;
    } else if (style === 'ninja') {
        ball(16.8, G.hair, 0, 0, 0, head);
        box(22, 7, 6, G.skin, 0, 2, 13.5, head);
        for (const s of [-1, 1]) box(3, 3, 1, '#0a1030', s * 4.5, 2, 16.6, head);
        const band = put(new THREE.TorusGeometry(17, 2, 6, 28), glow(G.pack), 0, 7, 0, head);
        band.rotation.x = Math.PI / 2;
        ball(3.2, G.pack, 0, 7, -17.5, head, null, glow(G.pack));
        const tails = [];
        for (const s of [-1, 1]) {
            const t = new THREE.Group();
            t.position.set(s * 2, 7, -18);
            head.add(t);
            box(2.5, 2, 18, G.pack, 0, 0, -9, t, glow(G.pack));
            tails.push(t);
        }
        anim.push((time) => {
            tails[0].rotation.set(-0.5 + Math.sin(time * 9) * 0.12, -0.35 + Math.sin(time * 9) * 0.15, 0);
            tails[1].rotation.set(-0.35 + Math.sin(time * 9 + 1.4) * 0.12, 0.35 + Math.sin(time * 9 + 1.4) * 0.15, 0);
        });
    } else if (style === 'chef') {
        face();
        for (const s of [-1, 1]) {
            const m = ball(5, G.hair, s * 4.6, -4, 15, head, [1.3, 0.6, 0.8]);
            m.rotation.z = s * 0.4;
        }
        ball(3, L.skin, 0, -1, 16.5, head);
        cyl(12.5, 12.5, 10, C.toque, 0, 15, -1, head, 14);
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * TAU;
            ball(7.5, C.toque, Math.cos(a) * 6.5, 24, Math.sin(a) * 6.5 - 1, head);
        }
        ball(8, C.toque, 0, 27, -1, head);
    } else if (style === 'pirate') {
        face();
        ball(15, G.hair, 0, -8, 5, head, [1, 0.6, 0.75]);
        box(7, 6, 1.5, '#0a1030', -5.5, 2, 15.6, head);
        box(30, 1.2, 1.2, '#0a1030', 0, 5, 9, head).rotation.z = 0.35;
        const brim = cyl(21, 21, 3, C.hat, 0, 13, 0, head, 3);
        brim.rotation.y = 0;
        cyl(22.5, 22.5, 1.2, G.pack, 0, 11.6, 0, head, 3);
        cyl(10.5, 12, 9, C.hat, 0, 19, -1, head, 10);
        ball(2.6, '#ffffff', 0, 18, 11, head);
        const feather = box(2.5, 1.5, 18, '#ff5470', 7, 21, -8, head);
        feather.rotation.set(0.5, 0.35, 0);
    } else if (style === 'mecha') {
        for (const s of [-1, 1]) box(5, 10, 10, G.outfit, s * 16.5, 0, -1, head);
        box(30, 29, 30, G.skin, 0, 1, 0, head);
        box(31, 4, 15, shade(G.skin, -0.35), 0, -1, -7.5, head);
        for (const s of [-1, 1]) {
            const v = box(12, 3.5, 2, G.hair, s * 5.5, 0, 15.3, head, glow(G.hair));
            v.rotation.z = s * 0.45;
        }
        const crest = box(2.5, 9, 18, G.pack, 0, 18, 3, head);
        crest.rotation.x = -0.25;
    } else if (style === 'mage') {
        ball(16.8, G.outfit, 0, 0, 0, head);
        const tip = cone(12, 26, G.outfit, 0, 18, -9, head, 8);
        tip.rotation.x = -0.9;
        const tip2 = cone(5, 12, G.outfit, 0, 26, -26, head, 6);
        tip2.rotation.x = -1.5;
        ball(6, C.hoodHole, 0, -1, 13.6, head, [1.8, 2.1, 0.7]);
        const eyeMats = [];
        for (const s of [-1, 1]) {
            const gm = glow(G.hair);
            eyeMats.push(gm);
            ball(1.9, G.hair, s * 4, 1, 16.2, head, null, gm);
        }
        const moon = put(new THREE.TorusGeometry(3.6, 1.1, 6, 12, Math.PI * 1.3), glow(G.pack), 0, 25, -32, head);
        moon.rotation.y = Math.PI / 2;
        if (!override) anim.push((time) => { const k = 0.65 + 0.35 * Math.sin(time * 3); for (const m of eyeMats) m.opacity = k * (m.userData.ghost ? 0.45 : 1); });
        for (const m of eyeMats) m.transparent = true;
    } else if (style === 'viking') {
        face();
        ball(15, G.hair, 0, -9, 6, head, [1, 0.75, 0.7]);
        box(4, 10, 4, G.hair, 0, -18, 12, head);
        put(new THREE.SphereGeometry(17.4, 12, 6, 0, TAU, 0, Math.PI * 0.5), mat(C.helm), 0, 2, -0.5, head);
        const b1 = put(new THREE.TorusGeometry(17.5, 1.4, 6, 16, Math.PI), mat(C.helmD), 0, 2, -0.5, head);
        b1.rotation.y = Math.PI / 2;
        const b2 = put(new THREE.TorusGeometry(17.5, 1.4, 6, 16, Math.PI), mat(C.helmD), 0, 2, -0.5, head);
        b2.rotation.z = 0;
        box(3, 10, 2, C.helm, 0, -1, 16.6, head);
        for (const s of [-1, 1]) {
            const h1 = cone(4, 14, C.horn, s * 17, 12, 0, head, 7);
            h1.rotation.z = -s * 0.95;
            const h2 = cone(2.2, 8, C.horn, s * 24, 20, 0, head, 6);
            h2.rotation.z = -s * 0.25;
        }
    } else if (style === 'pumpkin') {
        const P = new THREE.Group();
        P.position.y = 1;
        head.add(P);
        ball(12, G.skin, 0, 0, 0, P);
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            ball(8.5, i % 2 ? G.skin : shade(G.skin, -0.12), Math.cos(a) * 9.5, 0, Math.sin(a) * 9.5, P, [1, 1.15, 1]);
        }
        const faceMat = glow(G.hair);
        for (const s of [-1, 1]) {
            const e = cyl(3.4, 3.4, 1.5, G.hair, s * 6, 3, 18, P, 3, faceMat);
            e.rotation.x = Math.PI / 2;
        }
        box(12, 3.5, 1.5, G.hair, 0, -5, 18.2, P, faceMat);
        cyl(2, 3, 7, G.pack, 0, 20, 0, P, 6);
        ball(3, G.pack, 5, 19, -3, P, [1.6, 0.5, 1]);
        if (!override) anim.push((time) => {
            const k = 0.72 + 0.28 * Math.sin(time * 7) * Math.sin(time * 3.1);
            faceMat.color.set(G.hair).multiplyScalar(0.55 + 0.45 * k);
        });
    } else if (style === 'dragon') {
        ball(15.5, G.skin, 0, 0, 0, head);
        ball(9, G.skin, 0, -4, 13, head, [1, 0.8, 1.05]);
        for (const s of [-1, 1]) {
            box(1.6, 1.4, 1, '#0a1030', s * 2.6, -2, 22, head);
            ball(3.4, G.pack, s * 6.5, 5, 11.6, head);
            box(0.9, 4, 1, '#0a1030', s * 6.5, 5, 14.9, head);
            const h = cone(3.2, 17, G.hair, s * 7, 13, -7, head, 5);
            aimY(h, s * 0.35, 0.55, -1);
        }
        for (const [y, z] of [[15, -2], [11, -12]]) {
            const sp = cone(2.5, 7, G.hair, 0, y, z, head, 4);
            aimY(sp, 0, 0.7, -0.7);
        }
        // Souffle de braise de temps en temps
        if (!override) {
            const fire = new THREE.Group();
            fire.position.set(0, -4, 23);
            head.add(fire);
            const f1 = cone(5, 1, C.fire, 0, 0, 0, fire, 7, glow(C.fire, 0.9));
            f1.rotation.x = Math.PI / 2;
            f1.castShadow = false;
            const f2 = cone(3, 1, C.fireIn, 0, 0, -0.5, fire, 7, glow(C.fireIn, 0.95));
            f2.rotation.x = Math.PI / 2;
            f2.castShadow = false;
            anim.push((time) => {
                const puff = Math.max(0, Math.min(1, (Math.sin(time * 1.4) - 0.55) / 0.45));
                fire.visible = puff > 0.02;
                const L1 = 4 + 26 * puff;
                f1.scale.set(1, L1, 1);
                f1.position.z = L1 / 2;
                f2.scale.set(1, L1 * 0.6, 1);
                f2.position.z = L1 * 0.3;
            });
        }
    } else if (style === 'astro') {
        ball(19.5, G.skin, 0, 2, 0, head, null, null, 14);
        ball(10, shade(G.hair, -0.6), 0, 1, 13.5, head, [1.4, 1.2, 0.75], null, 12);
        box(5, 2, 1, '#ffffff', 5, 7, 20.2, head, glow('#ffffff', 0.75)).rotation.z = -0.6;
        const ant = cyl(0.8, 0.8, 12, C.antenna, 8, 24, -6, head, 5);
        ant.rotation.z = -0.4;
        const lightMat = glow(G.pack);
        ball(2.4, G.pack, 10.5, 30, -6, head, null, lightMat);
        if (!override) anim.push((time) => lightMat.color.set(Math.sin(time * 4) > 0 ? G.pack : '#fff1c9'));
    }

    /* ----- Épaules ----- */
    if (style === 'knight') {
        for (const s of [-1, 1]) ball(7, G.skin, s * 17.5, 48, 0, body, [1.3, 0.8, 1.25]);
    } else if (style === 'skeleton') {
        for (const s of [-1, 1]) ball(3.6, G.skin, s * 17, 49, 0);
    } else if (style === 'chef') {
        ball(3.4, G.pack, -5, 47, 10);
        box(16, 3, 2, G.pack, 0, 46.5, 9.4);
    } else if (style === 'pirate') {
        box(10, 3, 11, G.pack, -17.5, 49, 0);
        const parrot = new THREE.Group();
        parrot.position.set(17, 51, -1);
        body.add(parrot);
        ball(4.5, C.parrot, 0, 0, 0, parrot, [1, 1.3, 1]);
        ball(3.4, C.parrotD, 2.5, 0, -1, parrot, [0.5, 1.1, 1]);
        ball(3.2, C.parrot, 0, 6, 1.5, parrot);
        const beak = cone(1.4, 3, C.tsuba, 0, 6, 4.8, parrot, 4);
        beak.rotation.x = Math.PI / 2;
        const tail = box(2.4, 1, 9, '#ff5470', 0, -4, -5, parrot);
        tail.rotation.x = 0.6;
        anim.push((time) => { parrot.position.y = 51 + Math.sin(time * 4) * 1.2; parrot.rotation.y = Math.sin(time * 2.3) * 0.3; });
    } else if (style === 'mecha') {
        for (const s of [-1, 1]) {
            box(11, 7, 13, G.outfit, s * 18.5, 49, 0);
            box(11.4, 1.8, 13.4, G.pack, s * 18.5, 47.6, 0);
        }
    } else if (style === 'mage') {
        const collar = put(new THREE.TorusGeometry(12, 1.6, 6, 16, Math.PI), mat(G.pack), 0, 47.5, 0);
        collar.rotation.x = Math.PI / 2;
    } else if (style === 'viking') {
        for (let k = 0; k < 7; k++) {
            const a = Math.PI * (0.05 + (k / 6) * 0.9);
            ball(4.6, C.fur, Math.cos(a) * 13, 47.5, -Math.sin(a) * 8 - 1);
        }
    } else if (style === 'pumpkin') {
        for (const s of [-1, 1]) ball(4, G.pack, s * 16, 48.5, 0, body, [1.6, 0.5, 1.1]).rotation.z = s * 0.4;
    } else if (style === 'dragon') {
        for (const [y, z] of [[44, -10.5], [36, -10.5]]) {
            const sp = cone(2.6, 7, G.hair, 0, y, z, body, 4);
            aimY(sp, 0, 0.4, -1);
        }
    }

    /* ----- Dos : sac à motif, sinon l'objet du style ----- */
    const back = new THREE.Group();
    back.position.set(0, 37, -10);
    body.add(back);
    const packBox = (col) => {
        box(21, 22, 11, col, 0, 0, -4, back);
        box(17, 6, 4, shade(col, -0.25), 0, -6, -10, back);
    };
    const motif = lo.pack?.motif && BACKPACKS[lo.pack.motif];
    if (motif) {
        motif({ back, box, ball, cyl, cone, put, mat, glow, anim, override, mats }, lo.pack.color, lo.pack.accent);
    } else if (style === 'knight') {
        const sh = cyl(12, 12, 3, G.skin, 0, 0, -3, back, 18);
        sh.rotation.x = Math.PI / 2;
        const ring = put(new THREE.TorusGeometry(9, 1, 6, 20), mat(shade(G.skin, -0.35)), 0, 0, -4.7, back);
        ring.rotation.y = Math.PI;
        box(9, 3, 1.5, G.pack, 0, 0, -5, back);
    } else if (style === 'astro') {
        box(18, 20, 10, G.pack, 0, 2, -4, back);
        box(3, 15, 1, '#ffffff', -5.5, 2, -9.2, back);
        for (const s of [-1, 1]) {
            cyl(3.2, 4, 6, C.nozzle, s * 5, -11, -5, back, 10);
            cyl(2.2, 2.2, 0.6, C.nozzleIn, s * 5, -14.2, -5, back, 10);
        }
    } else if (style === 'chef') {
        // Baguette en travers du dos, avec ses entailles dorées
        const A = 0.85;
        const bg = cyl(4, 4, 40, C.bread, 0, 0, -3, back, 8);
        bg.rotation.z = A;
        for (let k = 0; k < 4; k++) {
            const u = -13 + k * 8.5;                       // position le long de la baguette
            const cut = box(5, 1, 1.4, C.breadCut, -Math.sin(A) * u, Math.cos(A) * u, -6.8, back);
            cut.rotation.z = A + 0.6;
        }
    } else if (style === 'mecha') {
        for (const s of [-1, 1]) {
            box(9, 12, 9, C.mechaJoint, s * 6, 0, -4, back);
            box(2, 8, 9.4, G.pack, s * 6, 0, -4, back);
        }
        if (!override) {
            const flames = [];
            for (const s of [-1, 1]) {
                const f = cone(3.4, 12, G.hair, s * 6, -12, -4, back, 8, glow(G.hair, 0.9));
                f.rotation.x = Math.PI;
                f.castShadow = false;
                flames.push(f);
            }
            anim.push((time) => {
                const fl = 0.75 + 0.25 * Math.sin(time * 26);
                for (const f of flames) { f.scale.y = fl; f.position.y = -6 - 6 * fl; }
            });
        }
    } else if (style === 'mage') {
        const robe = box(24, 30, 3, shade(G.outfit, 0.12), 0, -8, -2, back);
        robe.rotation.x = 0.25;
        box(24.4, 2.4, 3.4, G.pack, 0, -22, 1.5, back).rotation.x = 0.25;
        for (const [x, y] of [[-6, -4], [5, -12], [-2, -16], [7, -2]]) box(1.4, 1.4, 1, '#ffffff', x, y, -4.2, back, glow('#ffffff'));
        // Cercle de runes au sol qui tourne
        if (!override) {
            const runes = new THREE.Group();
            runes.position.y = 1.2;
            root.add(runes);
            const rm = glow(G.hair, 0.55);
            const ring = put(new THREE.RingGeometry(36, 38.5, 40).rotateX(-Math.PI / 2), rm, 0, 0, 0, runes);
            ring.castShadow = false;
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * TAU;
                const b = ((i + 3) / 8) * TAU;
                const ax = Math.cos(a) * 37, az = Math.sin(a) * 37;
                const bx = Math.cos(b) * 37, bz = Math.sin(b) * 37;
                const len = Math.hypot(bx - ax, bz - az);
                const seg = put(new THREE.BoxGeometry(len, 0.4, 1).translate(0, 0, 0), rm, (ax + bx) / 2, 0, (az + bz) / 2, runes);
                seg.rotation.y = -Math.atan2(bz - az, bx - ax);
                seg.castShadow = false;
            }
            anim.push((time) => { runes.rotation.y = time * 0.8; });
        }
    } else if (style === 'viking') {
        const sh = cyl(15, 15, 3, C.shieldWood, 0, 0, -3, back, 20);
        sh.rotation.x = Math.PI / 2;
        for (const start of [0, Math.PI]) {
            const q = put(new THREE.CircleGeometry(13, 8, start, Math.PI / 2), mat(G.pack), 0, 0, -4.6, back);
            q.rotation.y = Math.PI;
        }
        const rim = put(new THREE.TorusGeometry(14, 1.2, 6, 24), mat(C.helmD), 0, 0, -4.6, back);
        rim.rotation.y = Math.PI;
        ball(3.6, C.helm, 0, 0, -5, back);
    } else if (style === 'pumpkin') {
        ball(11, C.burlap, 0, -1, -5, back, [1, 1.15, 0.9]);
        ball(5.5, '#5a3a1a', 0, 10, -5, back, [1, 0.4, 0.8]);
        for (let k = 0; k < 3; k++) ball(2.6, C.candy[k], (k - 1) * 3.6, 12, -5 + (k % 2), back);
        const rope = put(new THREE.TorusGeometry(6.5, 1.1, 6, 16), mat(G.pack), 0, 8, -5, back);
        rope.rotation.x = Math.PI / 2;
    } else if (style === 'dragon') {
        const wings = [];
        for (const s of [-1, 1]) {
            const w = new THREE.Group();
            w.position.set(s * 4, 6, -3);
            back.add(w);
            const shape = new THREE.Shape();
            shape.moveTo(0, 0);
            shape.lineTo(36, 18);
            shape.quadraticCurveTo(30, 6, 34, -2);
            shape.quadraticCurveTo(24, -6, 24, -14);
            shape.quadraticCurveTo(14, -10, 8, -18);
            shape.lineTo(0, -6);
            const geo = new THREE.ShapeGeometry(shape);
            if (s < 0) geo.scale(-1, 1, 1);
            const mem = put(geo, override || new THREE.MeshLambertMaterial({ color: new THREE.Color(G.pack), side: THREE.DoubleSide, flatShading: true }), 0, 0, 0, w);
            if (!override) mats.push(mem.material);
            for (const [x, y] of [[36, 18], [34, -2], [24, -14]]) {
                const len = Math.hypot(x, y);
                const bone = box(len, 1.4, 1.4, shade(G.skin, -0.35), (s * x) / 2, y / 2, 0.6, w);
                bone.rotation.z = Math.atan2(y, s * x);
            }
            wings.push(w);
        }
        // Queue qui fouette
        const tail = new THREE.Group();
        tail.position.set(0, -14, -4);
        back.add(tail);
        const segs = [];
        let parent = tail;
        for (let i = 0; i < 4; i++) {
            const sg = new THREE.Group();
            sg.position.set(0, i === 0 ? 0 : -1, i === 0 ? 0 : -8);
            parent.add(sg);
            ball(5 - i, G.skin, 0, 0, -4, sg, [1, 1, 1.6]);
            segs.push(sg);
            parent = sg;
        }
        const tip = put(new THREE.OctahedronGeometry(4, 0), mat(G.pack), 0, 0, -11, parent);
        tip.scale.set(0.5, 1, 1.4);
        anim.push((time) => {
            const flap = Math.sin(time * 3.2) * 0.35;
            wings[0].rotation.y = 0.5 + flap;
            wings[1].rotation.y = -0.5 - flap;
            for (let i = 0; i < segs.length; i++) segs[i].rotation.y = Math.sin(time * 2.4 - i * 0.6) * 0.35;
        });
    } else if (style === 'ninja') {
        packBox(shade(G.outfit, 0.12));
        const kat = new THREE.Group();
        kat.position.set(0, 4, -11);
        kat.rotation.z = -0.6;
        back.add(kat);
        cyl(1.8, 1.8, 34, C.scabbard, 0, -4, 0, kat, 8);
        cyl(1.5, 1.5, 11, C.wrap, 0, 18, 0, kat, 8);
        box(7, 1.2, 7, C.tsuba, 0, 13, 0, kat);
    } else if (style === 'skeleton') {
        packBox(shade(G.pack, -0.6));
        ball(4, G.pack, 0, 0, -10.5, back, null, glow(G.pack));
    } else {
        packBox(style === 'default' ? L.pack : shade(G.pack, -0.6));
    }

    /* ----- Pioche accrochée dans le dos (dessin du casier) ----- */
    if (lo.pickaxe && !override) {
        const tex = pickaxeTexture(lo.pickaxe);
        if (tex) {
            // Petite, en travers du haut du dos (elle ne doit pas cacher le personnage)
            const card = new THREE.Mesh(new THREE.PlaneGeometry(24, 24),
                new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
            card.position.set(-6, 8, -17);
            card.rotation.set(0.35, 0, 0.6);
            card.castShadow = true;
            mats.push(card.material);
            back.add(card);
        }
    }

    /* ----- Particules (âmes, orbes, lucioles) ----- */
    if (!override && (style === 'skeleton' || style === 'mage' || style === 'pumpkin')) {
        const col = style === 'skeleton' ? G.pack : G.hair;
        const sparks = [];
        for (let k = 0; k < 3; k++) {
            const m = ball(style === 'mage' ? 3.2 : 1.8, col, 0, 0, 0, root, null, glow(col, 0.85), 6);
            m.castShadow = false;
            sparks.push(m);
        }
        anim.push((time) => {
            sparks.forEach((m, k) => {
                const a = time * (style === 'mage' ? 1.6 : 1.1) + k * 2.094;
                if (style === 'mage') {
                    m.position.set(Math.cos(a) * 40, 52 + Math.sin(time * 2 + k) * 4, Math.sin(a) * 40);
                } else {
                    const u = (time * 0.45 + k / 3) % 1;
                    m.position.set(Math.cos(a) * 26, 30 + u * 60, Math.sin(a) * 26);
                    m.scale.setScalar(1 - u * 0.7);
                }
            });
        });
    }

    /* ----- Animation des membres ----- */
    function pose(walk, moving, air = false, aim = false) {
        const s = moving ? Math.sin(walk) : 0;
        legs[0].rotation.x = s * 0.7;
        legs[1].rotation.x = -s * 0.7;
        if (air) {
            arms[0].rotation.set(Math.PI * 0.85, 0, 0.25);
            arms[1].rotation.set(Math.PI * 0.85, 0, -0.25);
            legs[0].rotation.x = 0.35;
            legs[1].rotation.x = 0.15;
        } else if (aim) {
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

    function animate(time) {
        for (const f of anim) f(time);
    }

    let ghost = false;
    function setGhost(on) {
        if (on === ghost || override) return;
        ghost = on;
        for (const m of mats) {
            const base = m.userData.base ?? 1;
            m.userData.ghost = on;
            m.transparent = on || base < 1;
            m.opacity = on ? base * 0.45 : base;
            m.needsUpdate = true;
        }
    }

    pose(0, false);
    animate(0);
    return { root, pose, animate, setGhost, mount };
}

/* ===================== SACS À DOS (12 motifs du casier) ===================== */

// k : outils de construction du personnage ; c = couleur, a = accent ; dos vers -Z
const BACKPACKS = {
    shell(k, c, a) {
        const { back, ball, box, cyl } = k;
        for (const s of [-1, 1]) {
            const leg = cyl(1.4, 1.4, 12, c, s * 11, -8, -6, back, 6);
            leg.rotation.set(0.4, 0, s * 0.9);
        }
        ball(12, c, 0, 0, -5, back, [1.15, 1.2, 0.6], null, 12);
        ball(9, shade(c, 0.18), 0, 2, -8, back, [1, 1, 0.45], null, 12);
        box(1.2, 22, 1, a, 0, 0, -12, back);
        box(24, 1.2, 1, a, 0, 0, -11.2, back);
        ball(2.6, a, 0, 0, -12.4, back);
    },
    wings(k, c, a) {
        const { back, put, override, anim, box } = k;
        const wingMat = override || new THREE.MeshLambertMaterial({ color: new THREE.Color(c), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
        if (!override) { wingMat.userData.base = 0.85; k.mats.push(wingMat); }
        const groups = [];
        for (const s of [-1, 1]) {
            const w = new THREE.Group();
            w.position.set(s * 2, 4, -6);
            back.add(w);
            for (const [x, y, rx, ry, rot] of [[14, 10, 12, 20, 0.5], [12, -9, 8, 13, -0.5]]) {
                const e = put(new THREE.CircleGeometry(1, 16), wingMat, s * x, y, 0, w);
                e.scale.set(rx, ry, 1);
                e.rotation.z = s * rot;
                e.castShadow = !override;
            }
            const vein = box(26, 0.8, 0.8, a, s * 13, 10, 0.3, w);
            vein.rotation.z = s * 0.7;
            groups.push(w);
        }
        box(6, 12, 6, shade(c, -0.35), 0, 4, -6, back);
        anim.push((time) => {
            const f = 0.45 + Math.sin(time * 6) * 0.3;
            groups[0].rotation.y = f;
            groups[1].rotation.y = -f;
        });
    },
    cape(k, c, a) {
        const { back, put, override, anim, box } = k;
        const piv = new THREE.Group();
        piv.position.set(0, 9, -1);
        back.add(piv);
        const shape = new THREE.Shape();
        shape.moveTo(-15, 0);
        shape.lineTo(15, 0);
        shape.lineTo(17, -30);
        const N = 6;
        for (let i = 0; i < N; i++) {
            const x0 = 17 - (34 * i) / N;
            const x1 = 17 - (34 * (i + 1)) / N;
            shape.quadraticCurveTo((x0 + x1) / 2, -40, x1, -30);
        }
        shape.lineTo(-15, 0);
        const m = override || new THREE.MeshLambertMaterial({ color: new THREE.Color(c), side: THREE.DoubleSide, flatShading: true });
        if (!override) k.mats.push(m);
        const cape = put(new THREE.ShapeGeometry(shape), m, 0, 0, 0, piv);
        cape.rotation.y = Math.PI;
        for (let i = 0; i < 4; i++) box(1.6, 22, 0.6, a, -10 + i * 6.6, -16, -0.5, piv);
        anim.push((time) => { piv.rotation.x = 0.35 + Math.sin(time * 3) * 0.08; });
    },
    fishtail(k, c, a) {
        const { back, cone, box, anim } = k;
        const piv = new THREE.Group();
        piv.position.set(0, -2, -6);
        back.add(piv);
        const b = cone(7, 24, c, 0, -8, -6, piv, 8);
        b.rotation.x = -2.5;
        for (const s of [-1, 1]) {
            const fin = box(2, 13, 9, a, s * 5, -18, -15, piv);
            fin.rotation.set(0.6, 0, s * 0.7);
        }
        anim.push((time) => { piv.rotation.y = Math.sin(time * 4) * 0.25; });
    },
    tech(k, c, a) {
        const { back, box, cyl, ball, glow, anim, override } = k;
        box(22, 24, 12, shade(c, -0.3), 0, 0, -5, back);
        box(18, 20, 1, c, 0, 0, -11.4, back);
        box(9, 11, 1, '#08264d', 0, 0, -12.2, back);
        box(1.2, 6, 0.6, a, 0, 0, -12.8, back, glow(a));
        box(6, 1.2, 0.6, a, 0, 0, -12.8, back, glow(a));
        for (const s of [-1, 1]) box(5, 8, 7, a, s * 12.5, 6, -4, back);
        const ant = cyl(0.8, 0.8, 10, a, 8, 15, -6, back, 5);
        ant.rotation.z = -0.25;
        const led = glow(a);
        ball(1.8, a, 9.3, 20, -6, back, null, led);
        if (!override) anim.push((time) => led.color.set(Math.sin(time * 5) > 0 ? a : '#ffffff'));
    },
    pixel(k, c, a) {
        const { back, box } = k;
        box(22, 24, 10, c, 0, 0, -4, back);
        const px = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3], [2, 4]];
        for (const [x, y] of px) box(2.8, 2.8, 1.6, a, (x - 2) * 3, (2 - y) * 3 + 1, -9.6, back);
        box(1.4, 1.4, 1, '#ffffff', -3, 4.8, -10.5, back);
    },
    shield(k, c, a) {
        const { back, put, mat, box, override } = k;
        const crest = (w, top, mid, bot) => {
            const s = new THREE.Shape();
            s.moveTo(-w, top);
            s.lineTo(w, top);
            s.lineTo(w, mid);
            s.quadraticCurveTo(w * 0.9, bot * 0.6, 0, bot);
            s.quadraticCurveTo(-w * 0.9, bot * 0.6, -w, mid);
            s.lineTo(-w, top);
            return s;
        };
        const outer = put(new THREE.ExtrudeGeometry(crest(12, 12, -2, -17), { depth: 3, bevelEnabled: false }), override || mat(a), 0, 0, -4, back);
        outer.rotation.y = Math.PI;
        const inner = put(new THREE.ExtrudeGeometry(crest(9.5, 9.5, -2, -13.5), { depth: 1, bevelEnabled: false }), override || mat(c), 0, 0, -7, back);
        inner.rotation.y = Math.PI;
        box(2.6, 16, 1, '#ffffff', 0, -1, -8.3, back);
        box(13, 2.6, 1, '#ffffff', 0, 2, -8.3, back);
    },
    bedroll(k, c, a) {
        const { back, box, cyl } = k;
        box(21, 22, 10, c, 0, 0, -4, back);
        box(12, 10, 2, shade(c, -0.25), 0, -3, -10, back);
        const roll = cyl(5, 5, 26, a, 0, 15, -5, back, 10);
        roll.rotation.z = Math.PI / 2;
        for (const x of [-6, 6]) box(2, 13, 11, shade(c, -0.45), x, 13, -5, back);
    },
    surfboard(k, c, a) {
        const { back, ball, box } = k;
        ball(9, c, 0, 2, -7, back, [1, 3.4, 0.3], null, 14);
        box(17, 3, 1, a, 0, -10, -10, back);
        box(16, 1.5, 1, a, 0, -14, -9.6, back);
        box(1, 52, 0.6, shade(c, -0.35), 0, 2, -10, back);
        box(1.5, 6, 4, '#ffffff', 0, -22, -11, back);
    },
    barrel(k, c, a) {
        const { back, cyl, ball } = k;
        const b = cyl(10, 10, 24, c, 0, 0, -6, back, 12);
        b.rotation.z = Math.PI / 2;
        for (const x of [-6.5, 6.5]) {
            const h = cyl(10.6, 10.6, 2.4, a, x, 0, -6, back, 12);
            h.rotation.z = Math.PI / 2;
        }
        for (const x of [-12.1, 12.1]) {
            const cap = cyl(9, 9, 0.6, shade(c, 0.2), x, 0, -6, back, 12);
            cap.rotation.z = Math.PI / 2;
        }
        ball(1.8, '#5a3a1a', 0, 0, -16, back);
    },
    jack(k, c, a) {
        const { back, ball, box, cyl, glow, anim, override } = k;
        const P = new THREE.Group();
        P.position.set(0, 0, -9);
        back.add(P);
        ball(9, c, 0, 0, 0, P);
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * TAU;
            ball(6, i % 2 ? c : shade(c, -0.15), Math.cos(ang) * 7, 0, Math.sin(ang) * 7, P, [1, 1.15, 1]);
        }
        const fm = glow(a);
        for (const s of [-1, 1]) {
            const e = cyl(2.6, 2.6, 1.4, a, s * 4.5, 2.5, -12.8, P, 3, fm);
            e.rotation.x = Math.PI / 2;
        }
        box(9, 2.6, 1.4, a, 0, -3.5, -13, P, fm);
        cyl(1.5, 2, 5, '#3fbf4a', 0, 14, 0, P, 6);
        if (!override) anim.push((time) => fm.color.set(a).multiplyScalar(0.6 + 0.4 * (0.72 + 0.28 * Math.sin(time * 7) * Math.sin(time * 3.1))));
    },
    egg(k, c, a) {
        const { back, ball, box, glow, anim, override } = k;
        ball(11, c, 0, 2, -7, back, [1, 1.3, 0.95], null, 12);
        const cm = glow(a);
        for (const [x, y, r] of [[-3, 6, 0.6], [2, -2, -0.5], [4, 9, 0.9], [-4, -5, 0.3]]) box(6, 1.2, 1, a, x, y, -17.4, back, cm).rotation.z = r;
        box(3, 26, 3, '#6b4a2e', 0, 2, -5, back).rotation.z = 0.15;
        const sparks = [];
        for (let i = 0; i < 3; i++) {
            const m = ball(1.4, a, 0, 0, 0, back, null, glow(a), 6);
            m.castShadow = false;
            sparks.push(m);
        }
        if (!override) anim.push((time) => {
            const pulse = 0.6 + 0.4 * Math.sin(time * 4);
            cm.color.set(a).multiplyScalar(0.5 + 0.5 * pulse);
            sparks.forEach((m, i) => {
                const ang = time * 1.8 + i * 2.094;
                m.position.set(Math.cos(ang) * 16, 2 + Math.sin(ang * 1.3) * 6, -7 + Math.sin(ang) * 14);
            });
        });
    }
};

/* ===================== PIOCHE (texture du casier) ===================== */

const pickTexCache = new Map();
function pickaxeTexture(id) {
    if (typeof document === 'undefined') return null;
    if (pickTexCache.has(id)) return pickTexCache.get(id);
    let tex = null;
    try {
        const cv = pickaxeCanvas(id, 128, 0.92);
        if (cv) {
            tex = new THREE.CanvasTexture(cv);
            tex.colorSpace = THREE.SRGBColorSpace;
        }
    } catch { tex = null; }
    pickTexCache.set(id, tex);
    return tex;
}

/* ===================== PLANEUR ===================== */

/*
   Planeur du casier. Les planeurs « à forme » (feuille, soucoupe, dragon, phénix...)
   reprennent le dessin animé du casier sur une grande toile horizontale au-dessus du
   joueur (vue de dessus : on voit exactement le même planeur). Les planeurs
   classiques gardent la voile 3D à leurs 2 couleurs.
   Renvoie { obj, update(time) } ; obj est attaché au personnage (repère local).
*/
export function buildGliderFor(lo) {
    const g = lo.glider || {};
    const colors = Array.isArray(g.colors) && g.colors.length >= 2 ? g.colors : ['#ffe03d', '#3a8dff'];
    const art = g.style && GLIDER_ART[g.style];
    if (!art || typeof document === 'undefined') return { obj: buildGlider(colors), update() {} };

    const S = 512;
    const R = 44;              // rayon du personnage dans le dessin (px)
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const size = (S / R) * 26;   // même proportion que le jeu 2D (rayon 26)
    const geo = new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide });
    const sail = new THREE.Mesh(geo, mat);
    sail.position.y = 104;
    sail.castShadow = true;

    const group = new THREE.Group();
    group.add(sail);
    // Câbles : des points d'attache du dessin jusqu'aux épaules
    const pts = [];
    for (const [ax, ay] of art.anchors || [[0.5, 1.2]]) {
        for (const s of [-1, 1]) {
            pts.push(new THREE.Vector3(-s * ay * 26, 104, ax * 26), new THREE.Vector3(-s * 6, 50, 0));
        }
    }
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x1b2440, transparent: true, opacity: 0.6 })));

    let last = -1;
    const draw = (t) => {
        ctx.clearRect(0, 0, S, S);
        ctx.save();
        ctx.translate(S / 2, S / 2);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        try { art.draw(ctx, R, colors, t, 4); } catch { /* dessin indisponible */ }
        ctx.restore();
        tex.needsUpdate = true;
    };
    draw(0);
    return {
        obj: group,
        update(time) {
            if (time - last < 0.05) return;   // 20 images/s suffisent pour l'animation du dessin
            last = time;
            draw(time);
        }
    };
}
