/* ==================================
   ISOLA - HERBES HAUTES ET FLEURS (décor, sans collision)
   Des milliers de touffes d'herbe et de petites fleurs posées sur les prairies
   et les forêts, qui ondulent au vent (shader) : le sol de l'île paraît vivant,
   comme dans Battlelands Royale. Une passe de dessin par type (InstancedMesh).
   Pas sur les routes, les places, les champs, l'eau ni dans les maisons.
   ================================== */

import * as THREE from '../vendor/three/three.module.js';
import { B, isWater } from '../game/config.js?v=12';
import { distToRoads } from '../game/world.js?v=12';
import { groundRGB } from '../game/draw.js?v=13';
import { mergeGeometries } from './models.js?v=2';

const TUFTS = 9000;
const FLOWERS = 2400;
const FLOWER_COLORS = ['#ffffff', '#ffe03d', '#ff8fb8', '#b98cff', '#ff6a5a', '#8fd0ff'];

// Couleur par sommet : sombre en bas, claire en haut (ombrage simple)
function heightShade(geo, lo, hi) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const h = Math.max(1e-6, bb.max.y - bb.min.y);
    for (let i = 0; i < pos.count; i++) {
        const t = (pos.getY(i) - bb.min.y) / h;
        const k = lo + (hi - lo) * t;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
}

// Touffe : 5 brins en triangle, inclinés vers l'extérieur (hauteur 1)
function tuftGeometry() {
    const blades = [];
    for (let i = 0; i < 5; i++) {
        const g = new THREE.BufferGeometry();
        const w = 0.16 + (i % 2) * 0.05;
        const h = 0.75 + ((i * 37) % 10) / 40;
        g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0.05, h, 0], 3));
        g.computeVertexNormals();
        g.rotateX(-0.25 - (i % 3) * 0.1);
        g.rotateY((i / 5) * Math.PI * 2 + i * 0.4);
        g.translate(Math.cos(i * 2.4) * 0.12, 0, Math.sin(i * 2.4) * 0.12);
        blades.push(g);
    }
    return heightShade(mergeGeometries(blades), 0.55, 1.12);
}

function flowerGeometry() {
    const petals = new THREE.CircleGeometry(1, 5).rotateX(-Math.PI / 2).translate(0, 1, 0);
    const stem = new THREE.BufferGeometry();
    stem.setAttribute('position', new THREE.Float32BufferAttribute([-0.08, 0, 0, 0.08, 0, 0, 0, 1, 0], 3));
    stem.computeVertexNormals();
    return mergeGeometries([petals, stem]);
}

// Ondulation au vent : le haut des brins bouge, le pied reste fixe
function addWind(mat, uniforms) {
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uniforms.uTime;
        shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            #ifdef USE_INSTANCING
                vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            #else
                vec3 ip = vec3(0.0);
            #endif
            float sway = sin(uTime * 2.1 + ip.x * 0.013 + ip.z * 0.017) * 0.22 + sin(uTime * 3.7 + ip.x * 0.05) * 0.07;
            transformed.x += sway * position.y;
            transformed.z += sway * 0.55 * position.y;`
        );
    };
    mat.customProgramCacheKey = () => 'isoWind';
}

export class Foliage {
    constructor(scene, world) {
        this.uniforms = { uTime: { value: 0 } };
        const colors = world.theme?.colors || undefined;
        const tmp = new Uint8ClampedArray(4);
        const near = [];

        const blocked = (x, y, biome) => {
            if (isWater(biome)) return true;
            if (biome !== B.PLAINE && biome !== B.FORET && biome !== B.BEACH) return true;
            for (const t of world.towns) {
                const R = (t.plazaR || 0) + 30;
                if ((x - t.x) ** 2 + (y - t.y) ** 2 < R * R) return true;
            }
            for (const b of world.buildings) {
                if (x > b.x - 14 && x < b.x + b.w + 14 && y > b.y - 14 && y < b.y + b.h + 14) return true;
            }
            for (const f of world.fields) {
                if (x > f.x - 8 && x < f.x + f.w + 8 && y > f.y - 8 && y < f.y + f.h + 8) return true;
            }
            if (distToRoads(world, x, y, 120) < 72) return true;
            const list = world.collide.query(x - 10, y - 10, x + 10, y + 10, near);
            for (const c of list) {
                if (c.kind === 'circle' && (c.x - x) ** 2 + (c.y - y) ** 2 < (c.r + 6) ** 2) return true;
            }
            return false;
        };

        const dummy = new THREE.Object3D();
        const color = new THREE.Color();

        /* ----- Touffes d'herbe ----- */
        const tuftMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
        addWind(tuftMat, this.uniforms);
        const tufts = new THREE.InstancedMesh(tuftGeometry(), tuftMat, TUFTS);
        let n = 0;
        for (let k = 0; k < TUFTS * 6 && n < TUFTS; k++) {
            const x = 60 + Math.random() * (world.width - 120);
            const y = 60 + Math.random() * (world.height - 120);
            const g = world.sampleGround(x, y);
            if (blocked(x, y, g.biome)) continue;
            // Moins d'herbe sur la plage, plus dans les forêts
            if (g.biome === B.BEACH && Math.random() < 0.8) continue;
            groundRGB(tmp, 0, g, colors);
            const h = g.biome === B.FORET ? 18 + Math.random() * 10 : 12 + Math.random() * 9;
            dummy.position.set(x, 0, y);
            dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
            dummy.scale.set(h * (0.9 + Math.random() * 0.4), h, h * (0.9 + Math.random() * 0.4));
            dummy.updateMatrix();
            tufts.setMatrixAt(n, dummy.matrix);
            color.setRGB(tmp[0] / 255, tmp[1] / 255, tmp[2] / 255, THREE.SRGBColorSpace).multiplyScalar(1.12 + Math.random() * 0.1);
            tufts.setColorAt(n, color);
            n++;
        }
        tufts.count = n;
        tufts.instanceMatrix.needsUpdate = true;
        if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
        tufts.receiveShadow = true;
        tufts.frustumCulled = false;
        scene.add(tufts);

        /* ----- Fleurs ----- */
        const flowerMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
        addWind(flowerMat, this.uniforms);
        const flowers = new THREE.InstancedMesh(flowerGeometry(), flowerMat, FLOWERS);
        let m = 0;
        for (let k = 0; k < FLOWERS * 8 && m < FLOWERS; k++) {
            const x = 60 + Math.random() * (world.width - 120);
            const y = 60 + Math.random() * (world.height - 120);
            const g = world.sampleGround(x, y);
            if (g.biome !== B.PLAINE || blocked(x, y, g.biome)) continue;
            // Par petits groupes : on en pose 1 à 4 autour du point trouvé
            const group = 1 + Math.floor(Math.random() * 4);
            const pick = FLOWER_COLORS[Math.floor(Math.random() * FLOWER_COLORS.length)];
            for (let i = 0; i < group && m < FLOWERS; i++) {
                const fx = x + (Math.random() - 0.5) * 40;
                const fy = y + (Math.random() - 0.5) * 40;
                dummy.position.set(fx, 0, fy);
                dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
                const s = 3.2 + Math.random() * 1.6;
                dummy.scale.set(s, 7 + Math.random() * 5, s);
                dummy.updateMatrix();
                flowers.setMatrixAt(m, dummy.matrix);
                flowers.setColorAt(m, color.set(pick));
                m++;
            }
        }
        flowers.count = m;
        flowers.instanceMatrix.needsUpdate = true;
        if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
        flowers.frustumCulled = false;
        scene.add(flowers);

        this.counts = { tufts: n, flowers: m };
    }

    update(time) {
        this.uniforms.uTime.value = time;
    }
}
