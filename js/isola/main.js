/* ==================================
   ISOLA - POINT D'ENTRÉE (prototype)
   Nouveau mode : la même île que FOR2D ROYAL, mais en 3D vue de dessus inclinée
   (style Battlelands Royale) avec un personnage low-poly.

   Étape 1 : la carte en 3D et le gameplay du joueur :
   - largage depuis un dirigeable (Espace pour sauter, sinon saut automatique),
   - descente en voile dirigée (ZQSD / WASD, Maj pour piquer plus vite),
   - au sol : déplacements avec collisions (mêmes règles que le jeu 2D),
     visée à la souris (le personnage regarde le curseur), molette pour zoomer,
   - toits qui s'effacent en entrant, buissons qui cachent, silhouette visible
     derrière les arbres et les murs.
   Étape 2 : les armes de base (fusil d'assaut, mitraillette, pistolet, pompe)
   et les soins (bandage, potion de bouclier, kit de soin), avec les mécaniques
   de Battlelands : butin au sol ramassé en restant dessus, 2 emplacements
   d'arme, portée visible au sol, arme jetée quand elle n'a plus de munitions.
   Des mannequins d'entraînement servent de cibles en attendant les bots.
   ================================== */

import * as THREE from '../vendor/three/three.module.js';
import { generateWorld, townAt } from '../game/world.js?v=12';
import { BIOME_NAMES } from '../game/config.js?v=12';
import { Player } from '../game/player.js?v=17';
import { Input } from '../game/input.js?v=13';
import { buildMapImage } from '../game/hud.js?v=19';
import { makeIcon, makeHealIcon } from '../game/icons.js';
import { SFX } from '../sfx.js?v=17';
import { Cosmetics } from '../cosmetics.js?v=10';
import { Ground } from './ground.js?v=2';
import { Props } from './props.js?v=4';
import { buildAirship } from './models.js?v=2';
import { buildAvatar, buildGliderFor, loadoutFrom } from './skins.js?v=1';
import { Water, WATER_Y } from './water.js?v=1';
import { Foliage } from './foliage.js?v=1';
import { buildGun, buildDummy } from './items.js?v=1';
import {
    Arsenal, equipFighter, ISO_WEAPONS, ISO_HEALS, ISO_HEAL_IDS, AMMO_NAMES,
    MAX_HEALTH, MAX_SHIELD, rarityColor, rarityName
} from './arsenal.js?v=1';
import { IsoLoot, PICK_TIME, itemLabel, itemColor, itemSub } from './loot.js?v=1';
import { LootView, CombatFx } from './fx.js?v=1';

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

const DUMMY_HEALTH = 100;
const DUMMY_SHIELD = 50;
const DUMMY_RESPAWN = 4;   // secondes avant qu'un mannequin détruit se relève
const DUMMY_REGEN = 5;     // secondes sans dégâts avant de revenir à fond
const FIRE_SHAKE = { pistol: 2.5, smg: 1.6, ar: 2.6, shotgun: 7 };

// Lumière du soleil (direction vers le soleil) : ombres vers la droite et le bas de l'écran
const SUN_DIR = new THREE.Vector3(-0.5, 1, -0.38).normalize();
const SHADOW_PX = 2048;      // résolution de la carte d'ombres
const SHADOW_MARGIN = 260;   // les objets juste hors de l'écran projettent aussi leur ombre dedans

function setLoading(text) {
    const el = $('isoLoadingText');
    if (el) el.textContent = text;
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

// Icônes du HUD (mêmes dessins que la hotbar du jeu 2D), mises en cache
const iconCache = new Map();
function weaponIcon(id, rarity) {
    const k = `w${id}|${rarity}`;
    if (!iconCache.has(k)) iconCache.set(k, makeIcon(id, rarity, 96));
    return iconCache.get(k);
}
function healIcon(id) {
    const k = `h${id}`;
    if (!iconCache.has(k)) iconCache.set(k, makeHealIcon(id, 96));
    return iconCache.get(k);
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
    scene.background = new THREE.Color('#1f73cf');
    scene.fog = new THREE.Fog('#3d8fe0', 3600, 9500);

    const camera = new THREE.PerspectiveCamera(CAM.fov, innerWidth / innerHeight, 20, 16000);

    // Lumière vive de plein jour : ciel bleuté pour les ombres, soleil chaud
    const hemi = new THREE.HemisphereLight('#dcefff', '#7f9c55', 1.45);
    const sun = new THREE.DirectionalLight('#fff0d4', 2.55);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_PX, SHADOW_PX);
    Object.assign(sun.shadow.camera, { left: -900, right: 900, top: 900, bottom: -900, near: 50, far: 7000 });
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 2.2;
    sun.shadow.radius = 2.2;      // bords d'ombre adoucis (filtrage PCF)
    sun.shadow.intensity = 0.82;  // ombres colorées par le ciel, jamais noires
    scene.add(hemi, sun, sun.target);

    setLoading('Peinture du terrain…');
    await nextFrame();
    const ground = new Ground(scene, world, renderer);
    setLoading('Plantation des arbres…');
    await nextFrame();
    const props = new Props(scene, world);
    setLoading('Remplissage de l’océan…');
    await nextFrame();
    const water = new Water(scene, world);
    setLoading('Pousse des herbes…');
    await nextFrame();
    const foliage = new Foliage(scene, world);

    /* ----- Butin au sol ----- */
    setLoading('Dépôt des armes…');
    await nextFrame();
    const loot = new IsoLoot(world);
    const lootView = new LootView(scene);
    for (const it of loot.items) lootView.add(it);
    loot.onSpawn = (it) => lootView.add(it);
    loot.onRemove = (it) => lootView.remove(it);

    /* ----- Joueur ----- */
    // Chargement du casier : tenue, sac à dos, planeur, pioche
    // (test : isola.html?skin=chevalier&sac=sac-oeuf&planeur=phenix-solaire, sans rien enregistrer)
    const qp = new URLSearchParams(location.search);
    const QP_KEYS = { outfit: 'skin', backpack: 'sac', glider: 'planeur', pickaxe: 'pioche' };
    const testSource = ['skin', 'sac', 'planeur', 'pioche'].some(k => qp.has(k)) ? {
        get equipped() { return this.equippedOf('outfit'); },
        equippedOf(type) {
            const it = qp.get(QP_KEYS[type]) ? Cosmetics.getItem(qp.get(QP_KEYS[type])) : null;
            return it && it.type === type ? it : Cosmetics.equippedOf(type);
        }
    } : Cosmetics;
    const loadout = loadoutFrom(testSource);
    const route = shipRoute(world);
    const player = new Player(route.ax, route.ay, world);
    player.colors = { ...player.colors, ...loadout.game };
    player.phase = 'ship';
    equipFighter(player);
    const fighters = [player];
    let altitude = SHIP_ALT;
    let airVx = 0;
    let airVy = 0;
    let shipT = 0;

    const avatar = buildAvatar(loadout);
    scene.add(avatar.root);
    /*
       Silhouette visible à travers les arbres, murs et toits.
       Ordre de dessin (passe opaque) : le décor, puis la silhouette (seulement là où
       quelque chose est DEVANT le joueur : test de profondeur « plus loin que »), puis
       le vrai personnage par-dessus. Le personnage ne se cache donc pas lui-même.
    */
    const xrayMat = new THREE.MeshBasicMaterial({ color: '#9fdcff', depthWrite: false, depthFunc: THREE.GreaterDepth });
    const xray = buildAvatar(loadout, xrayMat);
    xray.root.traverse(o => { o.renderOrder = 1; });
    avatar.root.traverse(o => { o.renderOrder = 2; });
    scene.add(xray.root);
    for (const a of [avatar, xray]) a.root.scale.setScalar(AVATAR_SCALE);

    // Planeur du casier (dessin animé des planeurs à forme, voile 3D sinon)
    const gliderKit = buildGliderFor(loadout);
    const glider = gliderKit.obj;
    glider.visible = false;
    avatar.root.add(glider);

    // Anneau bleu sous les pieds (repère du joueur, comme dans Battlelands)
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(31, 38, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#2f7dff', transparent: true, opacity: 0.95, depthWrite: false })
    );
    ring.renderOrder = 5;
    scene.add(ring);

    // Ligne de visée : points au sol sur toute la portée de l'arme, coupée au premier obstacle
    const DOTS = 24;
    const dotMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false });
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(3.2, 6, 4), dotMat, DOTS);
    dots.renderOrder = 6;
    dots.frustumCulled = false;
    scene.add(dots);
    const reticle = new THREE.Mesh(
        new THREE.RingGeometry(14, 19, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false })
    );
    reticle.renderOrder = 6;
    scene.add(reticle);
    // Croix rouge là où la balle sera arrêtée par un obstacle
    const blockMark = new THREE.Mesh(
        new THREE.RingGeometry(7, 12, 20).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#ff4d5a', transparent: true, opacity: 0.95, depthWrite: false })
    );
    blockMark.renderOrder = 6;
    scene.add(blockMark);
    // Cône de dispersion (pompe, mitraillette)
    const wedgeMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, depthWrite: false });
    const wedgeGeos = new Map();
    const wedge = new THREE.Mesh(new THREE.BufferGeometry(), wedgeMat);
    wedge.renderOrder = 5;
    wedge.visible = false;
    scene.add(wedge);

    const ship = buildAirship();
    scene.add(ship);

    /* ----- Effets, armes, mannequins ----- */
    const fx = new CombatFx(scene, camera, $('isoFloat'));
    fx.bar(player, { self: true, height: 124 });
    let shake = 0;
    let gameTime = 0;

    const dummies = [];
    function addDummy(x, y, faceX, faceY) {
        const view = buildDummy();
        view.root.position.set(x, 0, y);
        view.root.rotation.y = Math.PI / 2 - Math.atan2(faceY - y, faceX - x);
        scene.add(view.root);
        const d = {
            x, y, r: 24, angle: 0, name: 'Mannequin', isDummy: true, phase: 'ground', alive: true,
            health: DUMMY_HEALTH, shield: DUMMY_SHIELD, view, wobble: 0, fall: 0, respawn: 0, lastHit: -99
        };
        fx.bar(d, { height: 112 });
        dummies.push(d);
        fighters.push(d);
    }
    // 2 mannequins au bord de la place de chaque ville, tournés vers le centre
    for (const t of world.towns) {
        let made = 0;
        for (let k = 0; k < 40 && made < 2; k++) {
            const a = Math.random() * TAU;
            const dist = (t.plazaR || 120) + 70 + Math.random() * 90;
            const x = t.x + Math.cos(a) * dist;
            const y = t.y + Math.sin(a) * dist;
            if (!loot.isFree(x, y, true)) continue;
            if (dummies.some(o => Math.hypot(o.x - x, o.y - y) < 140)) continue;
            addDummy(x, y, t.x, t.y);
            made++;
        }
    }

    const toastEl = $('isoToast');
    let toastT = 0;
    function toast(text, color = '#ffffff') {
        if (!toastEl) return;
        toastEl.textContent = text;
        toastEl.style.setProperty('--toast', color);
        toastEl.hidden = false;
        toastEl.classList.remove('pop');
        void toastEl.offsetWidth;
        toastEl.classList.add('pop');
        toastT = 1.8;
    }

    const arsenal = new Arsenal(world, fighters, {
        onFire(f, w) {
            const muzzle = f.r + 30;
            fx.muzzle(f.x + Math.cos(f.angle) * muzzle, f.y + Math.sin(f.angle) * muzzle, f.angle, w.id === 'shotgun');
            SFX.play('shot', { x: f.x, y: f.y, weapon: w.id });
            if (f === player) shake = Math.max(shake, FIRE_SHAKE[w.id] || 2);
        },
        onDryFire(f) {
            SFX.play('dryFire', { x: f.x, y: f.y });
        },
        onReload(f, w) {
            SFX.play('reload', { x: f.x, y: f.y, weapon: w.id });
        },
        onReloaded(f, w) {
            SFX.play('reloadDone', { x: f.x, y: f.y, weapon: w.id });
        },
        onWeaponGone(f, it, w) {
            if (f === player) toast(`${w.name} : plus de munitions, arme jetée`, '#ff8a65');
        },
        onHealStart(f, h) {
            SFX.play('healStart', { x: f.x, y: f.y, item: h.id });
        },
        onHealCancel(f, h) {
            if (f === player && h) toast(`${h.short} interrompu`, '#ffbd4a');
        },
        onHealed(f, h) {
            SFX.play('healDone', { x: f.x, y: f.y, shield: h.shield > 0 });
            fx.burst(f.x, f.y, h.shield > 0 ? '#4aa8ff' : '#6fdc70', 12);
        },
        onImpact(x, y, angle, kind) {
            fx.impact(x, y, angle, kind);
            SFX.play('impact', { x, y, kind });
        },
        onExpire(b) {
            fx.dust(b.x, b.y);
        },
        onDamage(victim, amount, attacker, info) {
            if (info.shieldPart > 0) fx.damageNumber(victim.x, victim.y, info.shieldPart, { shield: true, crit: info.crit });
            if (info.healthPart > 0) fx.damageNumber(victim.x, victim.y, info.healthPart, { crit: info.crit });
            if (attacker === player) SFX.play('hitmarker', { shield: info.shieldPart > 0 && info.healthPart <= 0 });
            if (victim.isDummy) {
                victim.wobble = 1;
                victim.lastHit = gameTime;
            }
        },
        onKill(killer, victim) {
            if (victim.isDummy) {
                victim.respawn = DUMMY_RESPAWN;
                fx.burst(victim.x, victim.y, '#d9c27a', 14);
                if (killer === player) {
                    SFX.play('eliminate');
                    toast('Mannequin détruit !', '#ffe03d');
                }
            }
        }
    });

    function updateDummies(dt) {
        for (const d of dummies) {
            if (!d.alive) {
                d.respawn -= dt;
                d.fall = Math.min(1, d.fall + dt * 4);
                if (d.respawn <= 0) {
                    d.alive = true;
                    d.health = DUMMY_HEALTH;
                    d.shield = DUMMY_SHIELD;
                }
            } else {
                d.fall = Math.max(0, d.fall - dt * 3);
                // Retour à fond après quelques secondes sans dégâts
                if (gameTime - d.lastHit > DUMMY_REGEN && (d.health < DUMMY_HEALTH || d.shield < DUMMY_SHIELD)) {
                    d.health = DUMMY_HEALTH;
                    d.shield = DUMMY_SHIELD;
                }
            }
            d.wobble = Math.max(0, d.wobble - dt * 2.6);
            d.view.body.rotation.x = -d.fall * 1.45;
            d.view.body.rotation.z = Math.sin(gameTime * 26) * 0.12 * d.wobble;
        }
    }

    // Les mannequins debout bloquent le passage (cercle)
    function pushOutOfDummies() {
        for (const d of dummies) {
            if (!d.alive) continue;
            const dx = player.x - d.x;
            const dy = player.y - d.y;
            const min = player.r + 18;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min || d2 < 1e-4) continue;
            const dd = Math.sqrt(d2);
            player.x = d.x + (dx / dd) * min;
            player.y = d.y + (dy / dd) * min;
        }
    }

    // Arme dans les mains (modèle + silhouette), reconstruite quand l'arme change
    let heldKey = '';
    function updateHeldGun() {
        const it = player.phase === 'ground' ? arsenal.held(player) : null;
        const key = it ? `${it.weaponId}|${it.rarity}` : '';
        if (key === heldKey) return;
        heldKey = key;
        avatar.mount.clear();
        xray.mount.clear();
        if (!it) return;
        const gun = buildGun(it.weaponId, it.rarity);
        gun.traverse(o => { o.renderOrder = 2; });
        avatar.mount.add(gun);
        const ghost = buildGun(it.weaponId, it.rarity, xrayMat);
        ghost.traverse(o => { o.renderOrder = 1; });
        xray.mount.add(ghost);
    }

    /* ----- Ramassage (rester sur l'objet) ----- */
    const pick = { item: null, t: 0, mode: null };
    function takeItem(it) {
        const res = loot.take(player, it);
        if (!res) return;
        fx.burst(it.x, it.y, res.color, 10);
        SFX.play('pickup', { x: it.x, y: it.y, kind: res.kind === 'weapon' ? 'weapon' : res.kind === 'heal' ? 'heal' : 'ammo' });
        toast(res.text, res.color);
    }
    function swapItem(it) {
        const res = loot.swap(player, it);
        if (!res) return;
        fx.burst(it.x, it.y, res.color, 10);
        SFX.play('pickup', { x: it.x, y: it.y, kind: 'weapon' });
        toast(res.text, res.color);
    }
    function updatePickup(dt) {
        const it = player.phase === 'ground' && player.alive ? loot.nearest(player) : null;
        if (it !== pick.item) {
            pick.item = it;
            pick.t = 0;
        }
        pick.mode = it ? loot.mode(player, it) : null;
        if (it && pick.mode === 'take') {
            pick.t += dt;
            if (pick.t >= (PICK_TIME[it.kind] || 0.4)) {
                takeItem(it);
                pick.item = null;
                pick.t = 0;
                pick.mode = null;
            }
        } else {
            pick.t = 0;
        }
    }
    function interact() {
        const it = pick.item;
        if (!it || it.gone) return;
        if (pick.mode === 'swap') swapItem(it);
        else if (pick.mode === 'take') takeItem(it);
    }

    function tryHeal(id) {
        if (player.phase !== 'ground') return;
        const msg = arsenal.startHeal(player, id);
        if (msg) toast(msg, '#ffbd4a');
    }
    function selectWeapon(i) {
        if (player.phase !== 'ground') return;
        if (arsenal.select(player, i)) SFX.play('click');
    }

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
        onZoom: (f) => { zoom = THREE.MathUtils.clamp(zoom / f, CAM.zoomMin, CAM.zoomMax); },
        onSlot: (i) => {
            if (i <= 1) selectWeapon(i);
            else if (ISO_HEAL_IDS[i - 2]) tryHeal(ISO_HEAL_IDS[i - 2]);
        },
        onReload: () => { if (player.phase === 'ground') arsenal.reload(player); },
        onInteract: interact
    });

    /* ----- HUD ----- */
    const mapImage = buildMapImage(world, 1024);
    const mini = $('isoMinimap');
    const miniCtx = mini?.getContext('2d');
    const locName = document.querySelector('#isoLocation .iso-loc-name');
    const locSub = document.querySelector('#isoLocation .iso-loc-sub');
    const prompt = $('isoPrompt');
    const bushTag = $('isoBush');
    const bottom = $('isoBottom');
    const cast = $('isoCast');
    const castLabel = $('isoCastLabel');
    const castFill = $('isoCastFill');
    const shieldFill = $('isoShieldFill');
    const shieldText = $('isoShieldText');
    const healthFill = $('isoHealthFill');
    const healthText = $('isoHealthText');
    const wcards = [...document.querySelectorAll('.iso-wcard')];
    const healBtns = [...document.querySelectorAll('.iso-heal')];
    let lastLoc = '';
    let lastPrompt = '';
    let groundTime = 0;
    const hudCache = { vitals: '', cards: ['', ''], heals: '', cast: '' };

    // Boutons cliquables (sans voler le focus : Espace / chiffres restent pour le jeu)
    for (const el of [...wcards, ...healBtns]) el.addEventListener('mousedown', (e) => e.preventDefault());
    wcards.forEach((el) => el.addEventListener('click', () => selectWeapon(Number(el.dataset.slot))));
    healBtns.forEach((el) => {
        const id = el.dataset.heal;
        const img = el.querySelector('img');
        if (img) img.src = healIcon(id);
        el.addEventListener('click', () => tryHeal(id));
    });

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

    function updateHud() {
        const onGround = player.phase === 'ground';
        if (bottom) bottom.hidden = !onGround;
        if (!onGround) return;

        const hp = Math.ceil(player.health);
        const sh = Math.ceil(player.shield);
        const vk = `${hp}|${sh}`;
        if (vk !== hudCache.vitals) {
            hudCache.vitals = vk;
            healthFill.style.width = `${(hp / MAX_HEALTH) * 100}%`;
            shieldFill.style.width = `${(sh / MAX_SHIELD) * 100}%`;
            healthText.textContent = String(hp);
            shieldText.textContent = String(sh);
            healthFill.parentElement.classList.toggle('low', hp <= 30);
        }

        for (let i = 0; i < wcards.length; i++) {
            const it = player.weapons[i];
            const w = arsenal.stats(it);
            const active = i === player.wslot;
            const reserve = w ? player.ammo[w.ammo] || 0 : 0;
            const key = it ? `${it.weaponId}|${it.rarity}|${it.mag}|${reserve}|${active}` : `-|${active}`;
            if (key === hudCache.cards[i]) continue;
            hudCache.cards[i] = key;
            const el = wcards[i];
            el.classList.toggle('active', active);
            el.classList.toggle('empty', !it);
            el.style.setProperty('--rarity', it ? rarityColor(it.rarity) : 'rgba(255,255,255,0.25)');
            const img = el.querySelector('img');
            const name = el.querySelector('.iso-wname');
            const ammo = el.querySelector('.iso-wammo');
            if (it) {
                img.src = weaponIcon(it.weaponId, it.rarity);
                img.hidden = false;
                name.textContent = w.short;
                ammo.innerHTML = `<b>${it.mag}</b> / ${reserve}`;
                ammo.classList.toggle('out', it.mag <= 0);
                el.setAttribute('aria-label', `${w.name} ${rarityName(it.rarity)}, ${it.mag} balles, ${reserve} en réserve (touche ${i + 1})`);
            } else {
                img.hidden = true;
                name.textContent = 'Vide';
                ammo.textContent = '';
                el.setAttribute('aria-label', `Emplacement ${i + 1} vide`);
            }
        }

        const hk = ISO_HEAL_IDS.map(id => `${player.pouch[id]}${player.heal?.id === id ? '*' : ''}`).join('|');
        if (hk !== hudCache.heals) {
            hudCache.heals = hk;
            for (const el of healBtns) {
                const id = el.dataset.heal;
                const n = player.pouch[id] || 0;
                el.querySelector('.iso-heal-count').textContent = String(n);
                el.classList.toggle('empty', n <= 0);
                el.classList.toggle('using', player.heal?.id === id);
                el.setAttribute('aria-label', `${ISO_HEALS[id].name} : ${n} (touche ${ISO_HEAL_IDS.indexOf(id) + 3})`);
            }
        }

        // Barre d'action : soin ou rechargement en cours
        let label = '';
        let k = 0;
        if (player.heal) {
            label = ISO_HEALS[player.heal.id].short;
            k = player.heal.t / player.heal.total;
        } else if (player.reloadTimer > 0) {
            label = 'Rechargement';
            k = 1 - player.reloadTimer / (player.reloadTotal || 1);
        }
        if (cast) {
            if (label !== hudCache.cast) {
                hudCache.cast = label;
                cast.hidden = !label;
                castLabel.textContent = label;
            }
            if (label) castFill.style.width = `${Math.min(100, k * 100).toFixed(1)}%`;
        }
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
        // Petite secousse au tir
        if (shake > 0.05) {
            camera.position.x += (Math.random() - 0.5) * shake;
            camera.position.z += (Math.random() - 0.5) * shake;
            shake *= Math.exp(-dt * 22);
        } else {
            shake = 0;
        }
        fitShadow();
    }

    /*
       Ombres nettes et stables :
       - la zone d'ombre est ajustée à ce que la caméra voit au sol (les 4 coins de
         l'écran projetés sur le sol), plus une marge : toujours la bonne résolution,
         et plus de bord d'ombre coupé en carré pendant le vol ;
       - sa taille change par paliers et sa position est calée sur la grille des
         texels de la carte d'ombres : les bords ne « grouillent » plus quand on bouge.
    */
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const lightX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
    const lightY = new THREE.Vector3().crossVectors(SUN_DIR, lightX).normalize();
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const cornerNdc = new THREE.Vector2();
    const shadowRay = new THREE.Raycaster();
    const hit = new THREE.Vector3();
    const center = new THREE.Vector3();
    const cornerPts = new Float32Array(8);
    let shadowR = 0;
    function fitShadow() {
        camera.updateMatrixWorld();
        let cx = 0;
        let cz = 0;
        corners.forEach(([x, y], i) => {
            cornerNdc.set(x, y);
            shadowRay.setFromCamera(cornerNdc, camera);
            if (!shadowRay.ray.intersectPlane(groundPlane, hit)) {
                hit.copy(shadowRay.ray.direction).multiplyScalar(6000).add(shadowRay.ray.origin);
            }
            cornerPts[i * 2] = hit.x;
            cornerPts[i * 2 + 1] = hit.z;
            cx += hit.x / 4;
            cz += hit.z / 4;
        });
        let R = 0;
        for (let i = 0; i < 4; i++) R = Math.max(R, Math.hypot(cornerPts[i * 2] - cx, cornerPts[i * 2 + 1] - cz));
        R = Math.min(3400, Math.ceil((R + SHADOW_MARGIN) / 100) * 100);
        if (R !== shadowR) {
            shadowR = R;
            Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R });
            sun.shadow.camera.updateProjectionMatrix();
        }
        const texel = (2 * R) / SHADOW_PX;
        center.set(cx, 0, cz);
        const u = Math.round(center.dot(lightX) / texel) * texel;
        const v = Math.round(center.dot(lightY) / texel) * texel;
        const w = center.dot(SUN_DIR);
        center.copy(lightX).multiplyScalar(u).addScaledVector(lightY, v).addScaledVector(SUN_DIR, w);
        sun.target.position.copy(center);
        sun.position.copy(center).addScaledVector(SUN_DIR, 3200);
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

    /* ----- Ligne de visée ----- */
    const dummy = new THREE.Object3D();
    function updateDots() {
        const show = player.phase === 'ground' && player.alive;
        dots.visible = show;
        reticle.visible = show;
        if (!show) {
            blockMark.visible = false;
            wedge.visible = false;
            return;
        }
        const w = arsenal.heldStats(player);
        const range = w ? w.range : 220;
        const ux = Math.cos(player.angle);
        const uy = Math.sin(player.angle);
        const startD = 46;
        const block = w ? arsenal.obstacleDistance(player.x, player.y, ux, uy, range) : range;
        dotMat.opacity = w ? 0.85 : 0.3;
        for (let i = 0; i < DOTS; i++) {
            const t = startD + (i / (DOTS - 1)) * (range - startD);
            dummy.position.set(player.x + ux * t, WATER_Y + 3, player.y + uy * t);
            dummy.scale.setScalar(t > block ? 0.001 : 1 - (i / DOTS) * 0.45);
            dummy.updateMatrix();
            dots.setMatrixAt(i, dummy.matrix);
        }
        dots.instanceMatrix.needsUpdate = true;
        reticle.position.set(aim.x, WATER_Y + 2, aim.y);
        blockMark.visible = Boolean(w) && block < range;
        if (blockMark.visible) blockMark.position.set(player.x + ux * block, WATER_Y + 2.5, player.y + uy * block);

        const spread = w?.spread || 0;
        wedge.visible = spread > 0.06;
        if (wedge.visible) {
            let g = wedgeGeos.get(w.id);
            if (!g) wedgeGeos.set(w.id, (g = new THREE.CircleGeometry(1, 18, -spread, spread * 2).rotateX(-Math.PI / 2)));
            wedge.geometry = g;
            wedge.position.set(player.x, WATER_Y + 1, player.y);
            wedge.rotation.y = -player.angle;
            wedge.scale.set(Math.min(range, block), 1, Math.min(range, block));
        }
    }

    function groundPrompt() {
        const it = pick.item;
        if (it && !it.gone) {
            const color = itemColor(it);
            const label = `<b style="color:${color}">${itemLabel(it)}</b> · ${itemSub(it)}`;
            if (pick.mode === 'swap') {
                const held = arsenal.held(player);
                const old = held ? ISO_WEAPONS[held.weaponId]?.short : '';
                return `<kbd>E</kbd> Échanger${old ? ` ${old} contre` : ''} ${label}`;
            }
            if (pick.mode === 'full') {
                return it.kind === 'ammo' || it.kind === 'weapon'
                    ? `Réserve pleine · ${it.kind === 'weapon' ? AMMO_NAMES[ISO_WEAPONS[it.weaponId].ammo] : itemLabel(it)}`
                    : `Pochette pleine · ${label}`;
            }
            return `Ramassage… ${label}`;
        }
        if (!player.weapons.some(Boolean) && groundTime < 14) return 'Marche sur une arme pour la ramasser';
        if (groundTime < 6) return '<kbd>ZQSD</kbd> Se déplacer · <kbd>CLIC</kbd> Tirer · <kbd>1</kbd><kbd>2</kbd> Armes · <kbd>3</kbd><kbd>4</kbd><kbd>5</kbd> Soins';
        return '';
    }

    /* ----- Boucle ----- */
    let healFxT = 0;
    function step(dt, time) {
        gameTime = time;
        updateAim();
        const pressed = input.consumePress();
        input.consumeRelease();

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
                SFX.play('land', { x: player.x, y: player.y });
            }
        } else {
            player.update(dt, input, world, aim.x, aim.y);
            pushOutOfDummies();
            groundTime += dt;
            // Tir : maintenu pour les armes automatiques, un clic par balle sinon
            if (input.mouse.down || pressed) arsenal.tryFire(player, pressed);
            updatePickup(dt);
            setPrompt(groundPrompt());
        }

        arsenal.update(dt);
        updateDummies(dt);
        if (player.heal) {
            healFxT -= dt;
            if (healFxT <= 0) {
                healFxT = 0.22;
                fx.healTick(player.x, player.y, ISO_HEALS[player.heal.id].shield > 0);
            }
        }
        if (toastT > 0) {
            toastT -= dt;
            if (toastT <= 0 && toastEl) toastEl.hidden = true;
        }

        // Personnage
        const onGround = player.phase === 'ground';
        const hidden = onGround && inBush(player.x, player.y);
        avatar.setGhost(hidden);
        if (bushTag) bushTag.hidden = !hidden;
        const showBody = player.phase !== 'ship';
        avatar.root.visible = showBody;
        xray.root.visible = showBody && !hidden;
        ring.visible = onGround;
        updateHeldGun();
        const aiming = onGround && Boolean(arsenal.held(player)) && !player.heal;
        for (const a of [avatar, xray]) {
            a.root.position.set(player.x, altitude, player.y);
            a.root.rotation.y = Math.PI / 2 - player.angle;
            a.pose(player.walkTime * 11, onGround && player.moving, player.phase === 'air', aiming);
            a.animate(time);
            a.mount.visible = aiming;
            a.mount.position.z = 17 - player.kick * 5;
        }
        for (const s of showcase) s.animate(time);
        ring.position.set(player.x, player.inWater ? WATER_Y + 1.5 : 1.5, player.y);
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
        water.update(time);
        foliage.update(time);
        if (glider.visible) gliderKit.update(time);
        lootView.update(time, camTarget.x, camTarget.z, pick.mode === 'take' ? pick.item : null,
            pick.item ? pick.t / (PICK_TIME[pick.item.kind] || 0.4) : 0);
        fx.update(dt, arsenal.bullets);
        fx.updateBars();
        SFX.setListener?.(player.x, player.y);
        updateLocation(player.x, player.y);
        updateHud();
        drawMinimap(player.x, player.y, player.angle, player.phase);
    }

    function resize() {
        renderer.setSize(innerWidth, innerHeight, false);
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
    }
    addEventListener('resize', resize);

    // Test rapide : isola.html?spawn=cite (ou pic, bois, dune, ferme) pose directement au sol
    const params = new URLSearchParams(location.search);
    const spawnId = params.get('spawn');
    const spawnTown = spawnId ? world.towns.find(t => t.id === spawnId) : null;
    if (spawnTown) {
        player.x = spawnTown.x + spawnTown.plazaR + 60;
        player.y = spawnTown.y + 40;
        player.phase = 'ground';
        altitude = 0;
        shipT = route.len;
        for (let i = 0; i < 4; i++) player.resolveCollisions(world);
    }
    // Test des armes : isola.html?spawn=cite&armes=1 (fusil d'assaut + pompe, soins, munitions)
    if (params.get('armes') === '1') {
        player.weapons[0] = { weaponId: 'ar', rarity: 2, mag: ISO_WEAPONS.ar.magSize };
        player.weapons[1] = { weaponId: 'shotgun', rarity: 3, mag: ISO_WEAPONS.shotgun.magSize };
        player.ammo.medium = 90;
        player.ammo.shells = 20;
        player.pouch = { bandage: 5, shieldPotion: 2, medkit: 1 };
        player.health = 64;
        player.shield = 25;
    }

    // Vitrine (test) : isola.html?spawn=cite&vitrine=1 pose toutes les tenues avec un sac différent
    const showcase = [];
    if (params.get('vitrine') === '1' && player.phase === 'ground') {
        const packs = Cosmetics.ITEMS.filter(it => it.type === 'backpack');
        const gliders = Cosmetics.ITEMS.filter(it => it.type === 'glider');
        Cosmetics.SKINS.forEach((skin, i) => {
            const pack = packs[i % packs.length];
            const lo = loadoutFrom({
                equipped: skin,
                equippedOf: (t) => (t === 'backpack' ? pack : t === 'glider' ? gliders[i % gliders.length] : Cosmetics.equippedOf(t))
            });
            const a = buildAvatar(lo);
            a.root.scale.setScalar(AVATAR_SCALE);
            const col = i % 6;
            const row = Math.floor(i / 6);
            a.root.position.set(player.x - 330 + col * 130, 0, player.y - 220 + row * 150);
            a.root.rotation.y = i % 2 ? Math.PI * 0.85 : Math.PI * 0.15;  // dos et face en alternance
            scene.add(a.root);
            showcase.push(a);
        });
    }

    // Premières tuiles autour du départ avant d'afficher quoi que ce soit
    placeCamera(0, true);
    ground.update(camTarget.x, camTarget.z, true);

    // Shaders compilés à l'avance (en parallèle si le navigateur le permet) :
    // pas de gel de la première image de jeu
    setLoading('Préparation du rendu…');
    await nextFrame();
    try {
        glider.visible = true;           // le planeur aussi, pour qu'il ne fige pas le saut
        // Au plus 4 s : sinon on lance quand même (les derniers shaders se compileront au vol)
        await Promise.race([
            renderer.compileAsync(scene, camera),
            new Promise(r => setTimeout(r, 4000))
        ]);
    } catch { /* compilation au premier rendu */ }
    glider.visible = player.phase === 'air';

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
    window.ISOLA = {
        world, player, scene, camera, jump, loot, arsenal, dummies, fighters, loadout, renderer,
        get altitude() { return altitude; },
        aimAt(x, y) { aim.x = x; aim.y = y; player.angle = Math.atan2(y - player.y, x - player.x); }
    };
}

start().catch((err) => {
    console.error('[ISOLA]', err);
    setLoading('Impossible de lancer ISOLA. Recharge la page.');
});
