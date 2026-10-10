/* ==================================
   ISOLA - SOL DE L'ÎLE (Three.js)
   Même carte que le jeu 2D (world.sampleGround + routes, places, champs, sols des
   bâtiments), peinte dans des textures et posée à plat sur le plan y = 0.

   - Aperçu : toute l'île dans une seule texture basse résolution (fond et lointain).
   - Tuiles : des carrés de 500 unités en haute résolution autour de la caméra,
     construits au fil de l'eau (budget de temps par image) et libérés quand on s'éloigne.
   - Océan : un très grand plan bleu sous l'île.
   ================================== */

import * as THREE from '../vendor/three/three.module.js';
import { groundRGB, drawRoads, drawPlaza, drawField } from '../game/draw.js?v=13';
import { OCEAN_DEEP } from '../game/config.js?v=12';

const TILE = 500;            // taille d'une tuile (unités monde)
const TILE_PX = 512;         // résolution d'une tuile (≈ 1 pixel par unité)
const SAMPLE = 4;            // le sol est échantillonné tous les 4 unités puis lissé
const OVERVIEW_PX = 1024;    // aperçu de l'île entière
const KEEP_RADIUS = 2;       // tuiles gardées autour de la caméra (5 x 5)
const BUILD_MS = 6;          // temps max par image pour construire des tuiles

function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
}

// Morceaux de routes proches d'une zone (copie de renderer.js : inutile de tracer toute l'île)
function roadPieces(roads, x0, y0, x1, y1) {
    const out = [];
    for (const r of roads) {
        const bb = r.bbox;
        if (bb.maxX < x0 || bb.minX > x1 || bb.maxY < y0 || bb.minY > y1) continue;
        const m = r.width + 20;
        const p = r.points;
        const n = p.length / 2;
        let start = -1;
        for (let i = 0; i <= n; i++) {
            const inside = i < n &&
                p[i * 2] >= x0 - m && p[i * 2] <= x1 + m && p[i * 2 + 1] >= y0 - m && p[i * 2 + 1] <= y1 + m;
            if (inside) {
                if (start < 0) start = i;
            } else if (start >= 0) {
                const a = Math.max(0, start - 1);
                const b = Math.min(n - 1, i);
                out.push({ points: p.slice(a * 2, b * 2 + 2), width: r.width, edge: r.edge, fill: r.fill, cobble: r.cobble });
                start = -1;
            }
        }
    }
    return out;
}

// Sol des bâtiments : plancher clair à lattes (les murs et le toit sont en 3D)
function drawFloor(ctx, b) {
    ctx.fillStyle = b.floor;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (b.w >= b.h) {
        for (let y = b.y + 28; y < b.y + b.h; y += 28) { ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y); }
    } else {
        for (let x = b.x + 28; x < b.x + b.w; x += 28) { ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h); }
    }
    ctx.stroke();
}

// Détails communs (aperçu et tuiles), en coordonnées monde
function drawDetails(ctx, world, x0, y0, x1, y1) {
    const area = (r, m) => r.x - m < x1 && r.x + r.w + m > x0 && r.y - m < y1 && r.y + r.h + m > y0;
    for (const f of world.fields) if (area(f, 10)) drawField(ctx, f);
    drawRoads(ctx, roadPieces(world.roads, x0, y0, x1, y1));
    for (const t of world.towns) {
        const R = (t.plazaR || 0) + 10;
        if (t.x + R >= x0 && t.x - R <= x1 && t.y + R >= y0 && t.y - R <= y1) drawPlaza(ctx, t);
    }
    for (const b of world.buildings) if (area(b, 4)) drawFloor(ctx, b);
}

// Peint la zone [x0, x0 + size] dans un canvas de "px" pixels
function paintArea(world, colors, x0, y0, size, px, step) {
    const n = Math.ceil(size / step) + 2;        // + marge pour l'interpolation des bords
    const small = makeCanvas(n, n);
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(n, n);
    const data = img.data;
    for (let j = 0; j < n; j++) {
        const wy = y0 + (j - 0.5) * step;
        for (let i = 0; i < n; i++) {
            groundRGB(data, (j * n + i) * 4, world.sampleGround(x0 + (i - 0.5) * step, wy), colors);
        }
    }
    sctx.putImageData(img, 0, 0);

    const canvas = makeCanvas(px, px);
    const ctx = canvas.getContext('2d');
    const k = px / size;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, -step * k, -step * k, n * step * k, n * step * k);
    ctx.save();
    ctx.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    drawDetails(ctx, world, x0, y0, x0 + size, y0 + size);
    ctx.restore();
    return canvas;
}

/*
   Texture de détail qui se répète (256 px pour DETAIL_UNITS unités) :
   R = marbrures douces, G = brins sombres, B = brins clairs. Le shader du sol
   l'applique surtout sur l'herbe (selon la couleur du sol) : la prairie a du relief
   de près, sans changer les couleurs de la carte vue de loin.
*/
const DETAIL_PX = 256;
const DETAIL_UNITS = 150;
function detailTexture(renderer) {
    const N = DETAIL_PX;
    // Bruit de valeur périodique (se raccorde aux bords)
    const grid = (cells, seed) => {
        const g = new Float32Array(cells * cells);
        let s = seed;
        for (let i = 0; i < g.length; i++) {
            s = (s * 1664525 + 1013904223) >>> 0;
            g[i] = s / 4294967296;
        }
        return (x, y) => {
            const fx = (x / N) * cells;
            const fy = (y / N) * cells;
            const x0 = Math.floor(fx), y0 = Math.floor(fy);
            const tx = fx - x0, ty = fy - y0;
            const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
            const at = (i, j) => g[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
            const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
            const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
            return a + (b - a) * sy;
        };
    };
    const n1 = grid(8, 11);
    const n2 = grid(23, 57);
    const data = new Uint8Array(N * N * 4);
    const dark = new Float32Array(N * N);
    const light = new Float32Array(N * N);
    // Brins : petits traits courbés, raccordés sur les bords
    let s = 99;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const stroke = (arr, x, y, len, ang, k) => {
        for (let t = 0; t < len; t++) {
            const px = Math.round(x + Math.cos(ang) * t) & (N - 1);
            const py = Math.round(y - Math.sin(ang) * t) & (N - 1);
            arr[py * N + px] = Math.max(arr[py * N + px], k * (1 - t / len * 0.5));
        }
    };
    for (let i = 0; i < 1500; i++) stroke(dark, rnd() * N, rnd() * N, 4 + rnd() * 6, 1.1 + rnd() * 0.9, 0.6 + rnd() * 0.4);
    for (let i = 0; i < 900; i++) stroke(light, rnd() * N, rnd() * N, 3 + rnd() * 5, 1.1 + rnd() * 0.9, 0.5 + rnd() * 0.5);
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
            const k = y * N + x;
            const m = n1(x, y) * 0.65 + n2(x, y) * 0.35;
            data[k * 4] = Math.round(m * 255);
            data[k * 4 + 1] = Math.round(dark[k] * 255);
            data[k * 4 + 2] = Math.round(light[k] * 255);
            data[k * 4 + 3] = 255;
        }
    }
    const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
    return tex;
}

// Ajoute le détail + un peu plus de saturation (couleurs vives façon Battlelands)
function groundShader(mat, detail) {
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uDetail = { value: detail };
        shader.vertexShader = 'varying vec2 vGWorld;\n' + shader.vertexShader.replace(
            '#include <project_vertex>',
            '#include <project_vertex>\n vGWorld = (modelMatrix * vec4(transformed, 1.0)).xz;'
        );
        shader.fragmentShader = 'uniform sampler2D uDetail;\nvarying vec2 vGWorld;\n' + shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            {
                vec3 base = diffuseColor.rgb;
                float grass = clamp((base.g - max(base.r, base.b)) * 6.0, 0.0, 1.0);
                vec3 det = texture2D(uDetail, vGWorld / ${DETAIL_UNITS.toFixed(1)}).rgb;
                vec3 det2 = texture2D(uDetail, vGWorld / ${(DETAIL_UNITS * 4.3).toFixed(1)} + 0.37).rgb;
                diffuseColor.rgb *= mix(0.9, 1.1, det.r * 0.6 + det2.r * 0.4);
                diffuseColor.rgb *= 1.0 - det.g * 0.2 * grass;
                diffuseColor.rgb += det.b * 0.06 * grass;
                float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
                diffuseColor.rgb = max(mix(vec3(l), diffuseColor.rgb, 1.16), 0.0);
            }`
        );
    };
    mat.customProgramCacheKey = () => 'isoGround';
    return mat;
}

function textureFrom(canvas, renderer) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
}

export class Ground {
    constructor(scene, world, renderer) {
        this.scene = scene;
        this.world = world;
        this.renderer = renderer;
        this.colors = world.theme?.colors || undefined;
        this.nx = Math.ceil(world.width / TILE);
        this.ny = Math.ceil(world.height / TILE);
        this.tiles = new Map();   // clé -> { mesh, tex }
        this.wanted = [];
        this.tileGeo = new THREE.PlaneGeometry(TILE, TILE);
        this.tileGeo.rotateX(-Math.PI / 2);

        // Océan sous toute l'île
        const ocean = new THREE.Mesh(
            new THREE.PlaneGeometry(world.width * 8, world.height * 8).rotateX(-Math.PI / 2),
            new THREE.MeshLambertMaterial({ color: new THREE.Color(world.theme?.oceanDeep || OCEAN_DEEP) })
        );
        ocean.position.set(world.width / 2, -8, world.height / 2);
        ocean.receiveShadow = true;
        scene.add(ocean);

        // Aperçu de toute l'île (sol lointain + en attendant les tuiles)
        this.detail = detailTexture(renderer);
        const overview = paintArea(world, this.colors, 0, 0, world.width, OVERVIEW_PX, world.width / 512);
        this.overviewCanvas = overview;
        const ovMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(world.width, world.height).rotateX(-Math.PI / 2),
            groundShader(new THREE.MeshLambertMaterial({ map: textureFrom(overview, renderer) }), this.detail)
        );
        ovMesh.position.set(world.width / 2, -3, world.height / 2);
        ovMesh.receiveShadow = true;
        scene.add(ovMesh);
    }

    _build(key) {
        const cx = key % this.nx;
        const cy = Math.floor(key / this.nx);
        const canvas = paintArea(this.world, this.colors, cx * TILE, cy * TILE, TILE, TILE_PX, SAMPLE);
        const tex = textureFrom(canvas, this.renderer);
        const mat = groundShader(new THREE.MeshLambertMaterial({ map: tex }), this.detail);
        const mesh = new THREE.Mesh(this.tileGeo, mat);
        mesh.position.set(cx * TILE + TILE / 2, 0, cy * TILE + TILE / 2);
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.tiles.set(key, { mesh, tex, mat });
    }

    _free(key) {
        const t = this.tiles.get(key);
        if (!t) return;
        this.scene.remove(t.mesh);
        t.tex.dispose();
        t.mat.dispose();
        this.tiles.delete(key);
    }

    // Construit les tuiles autour de (x, y) (les plus proches d'abord), libère les lointaines
    update(x, y, force = false) {
        const tx = Math.floor(x / TILE);
        const ty = Math.floor(y / TILE);
        const keep = new Set();
        const list = [];
        for (let j = ty - KEEP_RADIUS; j <= ty + KEEP_RADIUS; j++) {
            for (let i = tx - KEEP_RADIUS; i <= tx + KEEP_RADIUS; i++) {
                if (i < 0 || j < 0 || i >= this.nx || j >= this.ny) continue;
                const key = j * this.nx + i;
                keep.add(key);
                if (!this.tiles.has(key)) {
                    const cxw = i * TILE + TILE / 2;
                    const cyw = j * TILE + TILE / 2;
                    list.push({ key, d: (cxw - x) ** 2 + (cyw - y) ** 2 });
                }
            }
        }
        for (const key of [...this.tiles.keys()]) if (!keep.has(key)) this._free(key);
        list.sort((a, b) => a.d - b.d);
        const start = performance.now();
        for (const t of list) {
            this._build(t.key);
            if (!force && performance.now() - start > BUILD_MS) break;
        }
    }
}
