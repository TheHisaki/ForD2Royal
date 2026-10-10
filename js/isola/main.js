/* ==================================
   ISOLA - POINT D'ENTRÉE (prototype)
   Nouveau mode : la même île que FOR2D ROYAL, mais en 3D vue de dessus inclinée
   (style Battlelands Royale) avec un personnage low-poly.

   Étape 1 (ce fichier) : la carte en 3D et le gameplay du joueur :
   - largage depuis un dirigeable (Espace pour sauter, sinon saut automatique),
   - descente en voile dirigée (ZQSD / WASD, Maj pour piquer plus vite),
   - au sol : déplacements avec collisions (mêmes règles que le jeu 2D),
     visée à la souris (le personnage regarde le curseur), molette pour zoomer,
   - toits qui s'effacent en entrant, buissons qui cachent, silhouette visible
     derrière les arbres et les murs.
   Bots, armes, butin et zone viendront ensuite.
   ================================== */

import * as THREE from '../vendor/three/three.module.js';
import { generateWorld, townAt } from '../game/world.js?v=12';
import { BIOME_NAMES } from '../game/config.js?v=12';
import { Player } from '../game/player.js?v=17';
import { Input } from '../game/input.js?v=13';
import { buildMapImage } from '../game/hud.js?v=19';
import { Cosmetics } from '../cosmetics.js?v=10';
import { Ground } from './ground.js?v=1';
import { Props } from './props.js?v=1';
import { buildAvatar, buildGlider, buildAirship } from './models.js?v=1';

const TAU = Math.PI * 2;
const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

// Caméra : vue plongeante inclinée (comme Battlelands), qui recule pendant le vol
const CAM = {
    fov: 32,
    pitch: (57 * Math.PI) / 180,
    ground: 980,       // distance caméra -> joueur au sol
    air: 2050,         // pendant la descente
    ship: 2700,        // dans le dirigeable
    zoomMin: 0.75,
    zoomMax: 1.5,
    lookAhead: 0.2,    // la caméra glisse un peu vers le curseur
    lookMax: 170
};

const SHIP_ALT = 820;      // altitude du dirigeable
const SHIP_SPEED = 640;    // unités / s
const JUMP_ALT = 620;      // altitude au moment du saut
const FALL_SPEED = 105;    // descente normale (unités / s)
const DIVE_MUL = 2.1;      // Maj : on pique
const GLIDE_SPEED = 560;   // vitesse horizontale sous la voile
const AUTO_JUMP_AT = 0.8;  // saut forcé aux 80 % du trajet
const AIM_HEIGHT = 40;     // hauteur du plan de visée (le canon)
const AVATAR_SCALE = 1.22; // personnage un peu plus grand que son cercle de collision (style chibi)

// Lumière du soleil (direction vers le soleil) : ombres vers la droite et le bas de l'écran
const SUN_DIR = new THREE.Vector3(-0.5, 1, -0.38).normalize();

function setLoading(text) {
    const el = $('isoLoadingText');
    if (el) el.textContent = text;
}

// Couleurs du skin équipé dans le casier du lobby
function equippedLook() {
    const colors = { skin: '#f2c29b', hair: '#3b2415', outfit: '#ff4d5a', pack: '#ffc93c' };
    let glider = null;
    try {
        const eq = Cosmetics.equipped;
        if (eq?.game) Object.assign(colors, eq.game);
        const pack = Cosmetics.equippedOf('backpack');
        if (pack?.color && !pack.none) colors.pack = pack.color;
        const g = Cosmetics.equippedOf('glider');
        if (Array.isArray(g?.colors)) glider = g.colors;
    } catch { /* profil illisible : couleurs par défaut */ }
    return { colors, glider };
}

// Trajet du dirigeable : traverse l'île en passant près du centre, direction au hasard
function shipRoute(world) {
    const W = world.width;
    const H = world.height;
    const a = Math.random() * TAU;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const cx = W / 2 + (Math.random() - 0.5) * W * 0.3;
    const cy = H / 2 + (Math.random() - 0.5) * H * 0.3;
    const half = Math.max(W, H) * 0.62;
    return {
        ax: cx - dx * half, ay: cy - dy * half,
        bx: cx + dx * half, by: cy + dy * half,
        dx, dy, len: half * 2
    };
}

async function start() {
    setLoading('Génération de l’île…');
    await nextFrame();
    const world = generateWorld({ mapId: 'default' });

    /* ----- Rendu ----- */
    const canvas = $('isolaCanvas');
    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch {
        setLoading('Ton navigateur ne gère pas la 3D (WebGL). Essaie Chrome, Edge ou Firefox à jour.');
        return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(innerWidth, innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#2f7fd0');
    scene.fog = new THREE.Fog('#4f9be0', 3400, 9000);

    const camera = new THREE.PerspectiveCamera(CAM.fov, innerWidth / innerHeight, 20, 16000);

    const hemi = new THREE.HemisphereLight('#eef8ff', '#6f8f4a', 1.3);
    const sun = new THREE.DirectionalLight('#fff3df', 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -1300, right: 1300, top: 1300, bottom: -1300, near: 100, far: 6000 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 1.5;
    scene.add(hemi, sun, sun.target);

    setLoading('Peinture du terrain…');
    await nextFrame();
    const ground = new Ground(scene, world, renderer);
    setLoading('Plantation des arbres…');
    await nextFrame();
    const props = new Props(scene, world);

    /* ----- Joueur ----- */
    const { colors, glider: gliderColors } = equippedLook();
    const route = shipRoute(world);
    const player = new Player(route.ax, route.ay, world);
    player.colors = { ...player.colors, ...colors };
    player.phase = 'ship';
    let altitude = SHIP_ALT;
    let airVx = 0;
    let airVy = 0;
    let shipT = 0;

    const avatar = buildAvatar(colors);
    scene.add(avatar.root);
    /*
       Silhouette visible à travers les arbres, murs et toits.
       Ordre de dessin (passe opaque) : le décor, puis la silhouette (seulement là où
       quelque chose est DEVANT le joueur : test de profondeur « plus loin que »), puis
       le vrai personnage par-dessus. Le personnage ne se cache donc pas lui-même.
    */
    const xrayMat = new THREE.MeshBasicMaterial({ color: '#9fdcff', depthWrite: false, depthFunc: THREE.GreaterDepth });
    const xray = buildAvatar(colors, xrayMat);
    xray.root.traverse(o => { o.renderOrder = 1; });
    avatar.root.traverse(o => { o.renderOrder = 2; });
    scene.add(xray.root);
    for (const a of [avatar, xray]) a.root.scale.setScalar(AVATAR_SCALE);

    const glider = buildGlider(gliderColors || undefined);
    glider.visible = false;
    avatar.root.add(glider);

    // Anneau bleu sous les pieds (repère du joueur, comme dans Battlelands)
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(31, 38, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#2f7dff', transparent: true, opacity: 0.95, depthWrite: false })
    );
    ring.renderOrder = 5;
    scene.add(ring);

    // Pointillés de visée + cercle sous le curseur
    const DOTS = 16;
    const dots = new THREE.InstancedMesh(
        new THREE.SphereGeometry(3.2, 6, 4),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }),
        DOTS
    );
    dots.renderOrder = 6;
    dots.frustumCulled = false;
    scene.add(dots);
    const reticle = new THREE.Mesh(
        new THREE.RingGeometry(14, 19, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false })
    );
    reticle.renderOrder = 6;
    scene.add(reticle);

    const ship = buildAirship();
    scene.add(ship);

    /* ----- Contrôles ----- */
    let zoom = 1;
    const jump = () => {
        if (player.phase !== 'ship') return;
        player.phase = 'air';
        altitude = JUMP_ALT;
        airVx = route.dx * 220;
        airVy = route.dy * 220;
        glider.visible = true;
    };
    const input = new Input(canvas, {
        onJump: jump,
        onZoom: (f) => { zoom = THREE.MathUtils.clamp(zoom / f, CAM.zoomMin, CAM.zoomMax); }
    });

    /* ----- HUD ----- */
    const mapImage = buildMapImage(world, 1024);
    const mini = $('isoMinimap');
    const miniCtx = mini?.getContext('2d');
    const locName = document.querySelector('#isoLocation .iso-loc-name');
    const locSub = document.querySelector('#isoLocation .iso-loc-sub');
    const prompt = $('isoPrompt');
    const bushTag = $('isoBush');
    let lastLoc = '';
    let lastPrompt = '';
    let groundTime = 0;

    function setPrompt(html) {
        if (!prompt || html === lastPrompt) return;
        lastPrompt = html;
        prompt.hidden = !html;
        prompt.innerHTML = html;
    }

    function updateLocation(x, y) {
        const town = townAt(world, x, y);
        const name = town ? town.name : (BIOME_NAMES[world.sampleGround(x, y).biome] || '');
        const sub = town ? (BIOME_NAMES[town.biome] || '') : 'Île de FOR2D';
        if (name === lastLoc) return;
        lastLoc = name;
        if (locName) locName.textContent = name;
        if (locSub) locSub.textContent = sub;
        const box = $('isoLocation');
        box?.classList.remove('pop');
        void box?.offsetWidth;
        box?.classList.add('pop');
    }

    function drawMinimap(x, y, angle, phase) {
        if (!miniCtx) return;
        const S = mini.width;
        const VIEWU = phase === 'ground' ? 1800 : 4200;
        const k = mapImage.width / world.width;
        const half = VIEWU / 2;
        miniCtx.save();
        miniCtx.clearRect(0, 0, S, S);
        miniCtx.fillStyle = '#1d5fae';
        miniCtx.fillRect(0, 0, S, S);
        miniCtx.drawImage(mapImage, (x - half) * k, (y - half) * k, VIEWU * k, VIEWU * k, 0, 0, S, S);
        const toMini = (wx, wy) => [((wx - (x - half)) / VIEWU) * S, ((wy - (y - half)) / VIEWU) * S];
        if (phase === 'ship') {
            const [a1, b1] = toMini(route.ax, route.ay);
            const [a2, b2] = toMini(route.bx, route.by);
            miniCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            miniCtx.setLineDash([6, 6]);
            miniCtx.lineWidth = 2;
            miniCtx.beginPath();
            miniCtx.moveTo(a1, b1);
            miniCtx.lineTo(a2, b2);
            miniCtx.stroke();
            miniCtx.setLineDash([]);
        }
        // Joueur : flèche jaune dans le sens de la visée
        miniCtx.translate(S / 2, S / 2);
        miniCtx.rotate(angle);
        miniCtx.beginPath();
        miniCtx.moveTo(9, 0);
        miniCtx.lineTo(-6, -6);
        miniCtx.lineTo(-3, 0);
        miniCtx.lineTo(-6, 6);
        miniCtx.closePath();
        miniCtx.fillStyle = '#ffe03d';
        miniCtx.strokeStyle = '#0b1d4a';
        miniCtx.lineWidth = 2;
        miniCtx.fill();
        miniCtx.stroke();
        miniCtx.restore();
    }

    /* ----- Caméra ----- */
    const camTarget = new THREE.Vector3(route.ax, SHIP_ALT, route.ay);
    let camDist = CAM.ship;
    const offset = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -AIM_HEIGHT);
    const aimHit = new THREE.Vector3();
    const aim = { x: route.ax + 100, y: route.ay };

    function placeCamera(dt, snap = false) {
        let tx = player.x;
        let ty = player.phase === 'ship' ? SHIP_ALT : player.phase === 'air' ? altitude * 0.85 : 0;
        let tz = player.y;
        if (player.phase === 'ground') {
            let lx = (aim.x - player.x) * CAM.lookAhead;
            let lz = (aim.y - player.y) * CAM.lookAhead;
            const l = Math.hypot(lx, lz);
            if (l > CAM.lookMax) { lx *= CAM.lookMax / l; lz *= CAM.lookMax / l; }
            tx += lx;
            tz += lz;
        }
        const wantDist = (player.phase === 'ship' ? CAM.ship : player.phase === 'air' ? CAM.air : CAM.ground) *
            (player.phase === 'ground' ? zoom : 1);
        const k = snap ? 1 : 1 - Math.exp(-dt * 7);
        camTarget.x += (tx - camTarget.x) * k;
        camTarget.y += (ty - camTarget.y) * (snap ? 1 : 1 - Math.exp(-dt * 4));
        camTarget.z += (tz - camTarget.z) * k;
        camDist += (wantDist - camDist) * (snap ? 1 : 1 - Math.exp(-dt * 2.5));
        offset.set(0, Math.sin(CAM.pitch), Math.cos(CAM.pitch)).multiplyScalar(camDist);
        camera.position.copy(camTarget).add(offset);
        camera.lookAt(camTarget);
        // Ombres : la zone d'ombre suit la caméra (au sol)
        const gx = camTarget.x;
        const gz = camTarget.z;
        sun.target.position.set(gx, 0, gz);
        sun.position.set(gx + SUN_DIR.x * 2600, SUN_DIR.y * 2600, gz + SUN_DIR.z * 2600);
    }

    function updateAim() {
        ndc.set((input.mouse.x / innerWidth) * 2 - 1, -(input.mouse.y / innerHeight) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        if (raycaster.ray.intersectPlane(aimPlane, aimHit)) {
            aim.x = aimHit.x;
            aim.y = aimHit.z;
        }
    }

    // Caché dans un buisson ?
    const nearTmp = [];
    function inBush(x, y) {
        const list = world.render.query(x - 60, y - 60, x + 60, y + 60, nearTmp);
        for (const o of list) {
            if (o.type === 'bush' && Math.hypot(o.x - x, o.y - y) < o.r * 0.85) return true;
        }
        return false;
    }

    /* ----- Boucle ----- */
    const dummy = new THREE.Object3D();
    function updateDots() {
        const show = player.phase === 'ground';
        dots.visible = show;
        reticle.visible = show;
        if (!show) return;
        const dx = aim.x - player.x;
        const dy = aim.y - player.y;
        const d = Math.hypot(dx, dy) || 1;
        const len = Math.min(d, 560);
        const ux = dx / d;
        const uy = dy / d;
        for (let i = 0; i < DOTS; i++) {
            const t = 46 + (i / (DOTS - 1)) * Math.max(0, len - 46);
            dummy.position.set(player.x + ux * t, 5, player.y + uy * t);
            dummy.scale.setScalar(len < 60 ? 0.001 : 1 - (i / DOTS) * 0.5);
            dummy.updateMatrix();
            dots.setMatrixAt(i, dummy.matrix);
        }
        dots.instanceMatrix.needsUpdate = true;
        reticle.position.set(aim.x, 3, aim.y);
    }

    function step(dt, time) {
        updateAim();

        if (player.phase === 'ship') {
            shipT = Math.min(route.len, shipT + SHIP_SPEED * dt);
            player.x = route.ax + route.dx * shipT;
            player.y = route.ay + route.dy * shipT;
            altitude = SHIP_ALT;
            player.angle = Math.atan2(route.dy, route.dx);
            if (shipT / route.len >= AUTO_JUMP_AT) jump();
            setPrompt('<kbd>ESPACE</kbd> Sauter du dirigeable');
        } else if (player.phase === 'air') {
            const a = input.axis();
            const l = Math.hypot(a.x, a.y);
            const ix = l ? a.x / l : 0;
            const iy = l ? a.y / l : 0;
            const kk = Math.min(1, dt * 2.6);
            airVx += (ix * GLIDE_SPEED - airVx) * kk;
            airVy += (iy * GLIDE_SPEED - airVy) * kk;
            player.x = THREE.MathUtils.clamp(player.x + airVx * dt, 40, world.width - 40);
            player.y = THREE.MathUtils.clamp(player.y + airVy * dt, 40, world.height - 40);
            const dive = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
            altitude -= FALL_SPEED * (dive ? DIVE_MUL : 1) * dt;
            if (Math.hypot(airVx, airVy) > 40) player.angle = Math.atan2(airVy, airVx);
            setPrompt('<kbd>ZQSD</kbd> Diriger la voile · <kbd>MAJ</kbd> Piquer');
            if (altitude <= 0) {
                altitude = 0;
                player.phase = 'ground';
                glider.visible = false;
                player.vx = airVx * 0.3;
                player.vy = airVy * 0.3;
                for (let i = 0; i < 4; i++) player.resolveCollisions(world);
                groundTime = 0;
            }
        } else {
            player.update(dt, input, world, aim.x, aim.y);
            groundTime += dt;
            setPrompt(groundTime < 6 ? '<kbd>ZQSD</kbd> Se déplacer · <kbd>SOURIS</kbd> Viser · <kbd>MOLETTE</kbd> Zoom' : '');
        }
        // Les clics ne servent pas encore (armes à venir) : on vide l'état du clic
        input.consumePress();
        input.consumeRelease();

        // Personnage
        const onGround = player.phase === 'ground';
        const hidden = onGround && inBush(player.x, player.y);
        avatar.setGhost(hidden);
        if (bushTag) bushTag.hidden = !hidden;
        const showBody = player.phase !== 'ship';
        avatar.root.visible = showBody;
        xray.root.visible = showBody && !hidden;
        ring.visible = onGround;
        for (const a of [avatar, xray]) {
            a.root.position.set(player.x, altitude, player.y);
            a.root.rotation.y = Math.PI / 2 - player.angle;
            a.pose(player.walkTime * 11, onGround && player.moving, player.phase === 'air');
        }
        ring.position.set(player.x, 1.5, player.y);
        updateDots();

        // Dirigeable : avance jusqu'au bout de son trajet puis disparaît
        const shipAlive = shipT < route.len;
        ship.visible = shipAlive;
        if (player.phase !== 'ship' && shipAlive) shipT = Math.min(route.len, shipT + SHIP_SPEED * dt);
        ship.position.set(route.ax + route.dx * shipT, SHIP_ALT + 60, route.ay + route.dy * shipT);
        ship.rotation.y = Math.PI / 2 - Math.atan2(route.dy, route.dx);
        ship.userData.prop.rotation.z = time * 18;

        // Toits : seulement au sol (vu d'en haut, toutes les maisons restent fermées)
        props.update(dt, onGround ? player.x : -1e9, onGround ? player.y : -1e9);

        placeCamera(dt);
        ground.update(camTarget.x, camTarget.z);
        updateLocation(player.x, player.y);
        drawMinimap(player.x, player.y, player.angle, player.phase);
    }

    function resize() {
        renderer.setSize(innerWidth, innerHeight, false);
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
    }
    addEventListener('resize', resize);

    // Test rapide : isola.html?spawn=cite (ou pic, bois, dune, ferme) pose directement au sol
    const spawnId = new URLSearchParams(location.search).get('spawn');
    const spawnTown = spawnId ? world.towns.find(t => t.id === spawnId) : null;
    if (spawnTown) {
        player.x = spawnTown.x + spawnTown.plazaR + 60;
        player.y = spawnTown.y + 40;
        player.phase = 'ground';
        altitude = 0;
        shipT = route.len;
        for (let i = 0; i < 4; i++) player.resolveCollisions(world);
    }

    // Premières tuiles autour du départ avant d'afficher quoi que ce soit
    placeCamera(0, true);
    ground.update(camTarget.x, camTarget.z, true);

    let last = performance.now();
    let time = 0;
    function frame(now) {
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        time += dt;
        step(dt, time);
        renderer.render(scene, camera);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame((t) => {
        last = t;
        frame(t);
        $('isoLoading')?.classList.add('done');
    });

    // Debug / tests : accès depuis la console
    window.ISOLA = { world, player, scene, camera, jump, get altitude() { return altitude; } };
}

start().catch((err) => {
    console.error('[ISOLA]', err);
    setLoading('Impossible de lancer ISOLA. Recharge la page.');
});
