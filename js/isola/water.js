/* ==================================
   ISOLA - EAU ANIMÉE (style Battlelands Royale)
   Un seul grand plan d'eau au-dessus du sol, avec un shader :
   - turquoise clair près des côtes, bleu profond au large (dégradé selon la
     distance au rivage, calculée une fois à partir de la carte) ;
   - liseré d'écume blanche le long des plages + vagues d'écume qui partent du bord ;
   - ondulations, reflets qui scintillent ; brouillard de la scène respecté.
   Sur la terre ferme le plan est transparent (pixels écartés) : le sol reste visible.
   Lacs compris.
   ================================== */

import * as THREE from '../vendor/three/three.module.js';
import { isWater } from '../game/config.js?v=12';

const MASK_PX = 768;        // résolution du masque d'eau (île entière)
const SHORE_UNITS = 320;    // distance au rivage où l'eau devient profonde
export const WATER_Y = 4;   // niveau de l'eau (les pieds trempent un peu)

// Masque : R = distance au rivage (0 au bord -> 1 au large), G = eau (1) / terre (0)
function buildMask(world) {
    const N = MASK_PX;
    const step = world.width / N;
    const water = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) {
        const y = (j + 0.5) * step;
        for (let i = 0; i < N; i++) {
            water[j * N + i] = isWater(world.sampleGround((i + 0.5) * step, y).biome) ? 1 : 0;
        }
    }
    // Distance au rivage (chanfrein 3-4, deux passes), en pixels × 3
    const INF = 1e6;
    const d = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) d[k] = water[k] ? INF : 0;
    for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
            const k = j * N + i;
            if (!water[k]) continue;
            let v = d[k];
            if (i > 0) v = Math.min(v, d[k - 1] + 3);
            if (j > 0) {
                v = Math.min(v, d[k - N] + 3);
                if (i > 0) v = Math.min(v, d[k - N - 1] + 4);
                if (i < N - 1) v = Math.min(v, d[k - N + 1] + 4);
            }
            d[k] = v;
        }
    }
    for (let j = N - 1; j >= 0; j--) {
        for (let i = N - 1; i >= 0; i--) {
            const k = j * N + i;
            if (!water[k]) continue;
            let v = d[k];
            if (i < N - 1) v = Math.min(v, d[k + 1] + 3);
            if (j < N - 1) {
                v = Math.min(v, d[k + N] + 3);
                if (i < N - 1) v = Math.min(v, d[k + N + 1] + 4);
                if (i > 0) v = Math.min(v, d[k + N - 1] + 4);
            }
            d[k] = v;
        }
    }
    const data = new Uint8Array(N * N * 4);
    const maxPx = SHORE_UNITS / step;
    for (let k = 0; k < N * N; k++) {
        const dist = water[k] ? Math.min(1, (d[k] / 3) / maxPx) : 0;
        data[k * 4] = Math.round(dist * 255);
        data[k * 4 + 1] = water[k] ? 255 : 0;
        data[k * 4 + 2] = 0;
        data[k * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
}

const VERT = /* glsl */`
    #include <common>
    #include <fog_pars_vertex>
    varying vec3 vWorld;
    void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
    }
`;

const FRAG = /* glsl */`
    #include <common>
    #include <fog_pars_fragment>
    uniform sampler2D uMask;
    uniform vec2 uSize;
    uniform float uTime;
    uniform vec3 uShallow;
    uniform vec3 uDeep;
    uniform vec3 uFoam;
    varying vec3 vWorld;

    float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
    }
    float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
                   mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
    }

    void main() {
        vec2 uv = vWorld.xz / uSize;
        vec4 m = texture2D(uMask, uv);
        // Bords de l'île un peu irréguliers (le masque est en basse résolution)
        float wobble = (vnoise(vWorld.xz * 0.045) - 0.5) * 0.18;
        float wet = m.g + wobble;
        if (wet < 0.5) discard;
        float d = m.r;
        float shore = smoothstep(0.5, 0.62, wet);   // 0 juste au bord -> 1

        // Dégradé turquoise -> bleu profond, avec de grandes taches plus sombres au large
        float big = vnoise(vWorld.xz * 0.0025 + vec2(uTime * 0.01, 0.0));
        vec3 col = mix(uShallow, uDeep, smoothstep(0.02, 0.9, d) * (0.85 + 0.25 * big));

        // Ondulations (deux trains de vagues croisés)
        float w1 = sin(vWorld.x * 0.021 + vWorld.z * 0.013 + uTime * 1.3);
        float w2 = sin(vWorld.z * 0.027 - vWorld.x * 0.009 - uTime * 1.05);
        float ripple = w1 * w2;
        col += ripple * 0.035 * (1.0 - 0.5 * d);

        // Reflets qui scintillent
        float n = vnoise(vWorld.xz * 0.06 + vec2(uTime * 0.6, -uTime * 0.4));
        float n2 = vnoise(vWorld.xz * 0.11 - vec2(uTime * 0.5, uTime * 0.3));
        float spark = smoothstep(0.86, 0.95, n * n2 * 1.9);
        col += spark * 0.35;

        // Écume : liseré permanent au bord + vagues qui partent du rivage
        float edgeFoam = 1.0 - smoothstep(0.0, 0.05 + 0.02 * sin(uTime * 2.0 + vWorld.x * 0.04), d);
        float ph = fract(uTime * 0.22 + vnoise(vWorld.xz * 0.004) * 0.6);
        float waveFoam = (1.0 - smoothstep(0.0, 0.018, abs(d - ph * 0.16))) * (1.0 - ph) * step(d, 0.2);
        float broken = smoothstep(0.35, 0.65, vnoise(vWorld.xz * 0.08 + uTime * 0.2));
        float foam = max(edgeFoam * (0.75 + 0.25 * broken), waveFoam * broken * 0.8);
        foam *= 0.6 + 0.4 * shore;
        col = mix(col, uFoam, clamp(foam, 0.0, 1.0));

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
    }
`;

export class Water {
    constructor(scene, world) {
        const mask = buildMask(world);
        this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
            uMask: { value: null },
            uSize: { value: new THREE.Vector2(world.width, world.height) },
            uTime: { value: 0 },
            uShallow: { value: new THREE.Color('#3fd9d2') },
            uDeep: { value: new THREE.Color('#1c6fd6') },
            uFoam: { value: new THREE.Color('#f4fbff') }
        }]);
        this.uniforms.uMask.value = mask;
        const mat = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: VERT,
            fragmentShader: FRAG,
            fog: true
        });
        const geo = new THREE.PlaneGeometry(world.width * 5, world.height * 5).rotateX(-Math.PI / 2);
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(world.width / 2, WATER_Y, world.height / 2);
        this.mesh.renderOrder = -1;
        this.mesh.frustumCulled = false;
        scene.add(this.mesh);
    }

    update(time) {
        this.uniforms.uTime.value = time;
    }
}
