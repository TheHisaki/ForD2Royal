/* ==================================
   POINT D'ENTRÉE DU JEU - FOR2D ROYAL
   Carte, vaisseau, joueur, bots, coffres, armes, effets et HUD.
   ================================== */

// ?v=10 : force le navigateur à recharger les modules changés (synchro multijoueur, emotes)
import { generateWorld, surfaceAt } from './world.js?v=9';
import { Player } from './player.js?v=9';
import { Renderer } from './renderer.js?v=11';
import { Hud } from './hud.js?v=10';
import { Input } from './input.js?v=10';
import {
    Drop, drawFalling, drawSkyHaze, flightViewAt, fallHeight, fallCameraGap, SHIP_HEIGHT
} from './drop.js?v=13';
import { Combat } from './combat.js?v=9';
import { Loot } from './loot.js?v=9';
import { BotManager, roofAlphaAt } from './bots.js?v=13';
import { Corruption } from './corruption.js?v=9';
import { CombatHud } from './combat-hud.js?v=11';
import { Effects } from './effects.js?v=13';
import { HEALS, WEAPONS } from './weapons.js?v=9';
import { drawPlayer, drawDying } from './draw.js?v=9';
import { SFX } from '../sfx.js?v=14';
import { Settings } from '../settings.js?v=9';
import { Cosmetics, getSkin, getItem } from '../cosmetics.js?v=9';
import { itemArt } from '../item-art.js?v=10';
import { InventoryUI } from './inventory-ui.js?v=9';
import { EndScreen, Spectator } from './end-screen.js?v=9';
import { mountHudIcons, setHudIcon } from './hud-icons.js?v=9';

const MAX_FIGHTERS = 24; // combattants sur la carte quand la partie est remplie avec des bots
const DEATH_TIME = 0.7;  // durée de l'animation de mort (s)
const SPECTATE_DELAY = 1200; // ms après la mort : la caméra passe sur le tueur
const DEFEAT_DELAY = 1400;   // ms après la mort : écran de fin
const VICTORY_DELAY = 900;
const STEP_TIME = 0.3;   // un nuage de poussière tous les 0,3 s en marchant

// Sons
const GLIDER_ALT = 2 / 3;      // ouverture après 1/3 de la chute (voir drop.js)
const SHIP_HEAR_DIST = 1000;   // moteur du vaisseau audible seulement à proximité
const HEARTBEAT_TIME = 0.95;   // un battement de cœur toutes les 0,95 s quand la vie est basse
const LOW_HEALTH = 30;
const CHEST_HUM_TIME = 1.2;    // bourdonnement du coffre le plus proche
const CHEST_HUM_RANGE = 360;    // portée cohérente avec le son d'ouverture
const BOT_VOL = 0.7;            // sons d'action des bots un peu moins forts

// Secousse de caméra quand le joueur tire, selon l'arme
const FIRE_SHAKE = { pistol: 1.5, smg: 1.2, ar: 2, shotgun: 6, sniper: 8 };

function start() {
    let gameConfig = { mode: 'solo', modeName: 'SOLO', teamSize: 1, bots: true };
    try {
        const stored = sessionStorage.getItem('for2d-game-mode') || localStorage.getItem('for2d-game-mode');
        if (stored) gameConfig = { ...gameConfig, ...JSON.parse(stored) };
    } catch { /* config par défaut */ }

    // Paramètres d'URL prioritaires (garantit que chaque onglet/joueur a ses propres identifiants en multi)
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    const slotParam = urlParams.get('slot');
    const pidParam = urlParams.get('pid');
    const seedParam = urlParams.get('seed');
    const modeParam = urlParams.get('mode');
    // Config enregistrée pour une AUTRE partie (autre onglet, ancienne partie) : on n'en
    // garde rien de ce qui concerne la salle (liste des joueurs, hôte...)
    if (roomParam && (gameConfig.roomCode !== roomParam || (seedParam && String(gameConfig.seed) !== seedParam))) {
        gameConfig.roomPlayers = null;
        gameConfig.teams = null;
        gameConfig.authorityId = null;
        gameConfig.isHost = false;
        gameConfig.myTeam = 1;
    }
    if (roomParam) {
        gameConfig.isMultiplayer = true;
        gameConfig.roomCode = roomParam;
    }
    if (slotParam) {
        gameConfig.mySlot = parseInt(slotParam, 10);
    }
    if (pidParam) {
        gameConfig.myPlayerId = pidParam;
    }
    if (seedParam) {
        gameConfig.seed = parseInt(seedParam, 10);
    }
    if (modeParam) {
        gameConfig.mode = modeParam;
        gameConfig.modeName = modeParam.toUpperCase();
    }
    const authParam = urlParams.get('auth');
    if (authParam) gameConfig.authorityId = authParam;

    // Récupérer la liste des joueurs de la salle depuis sessionStorage / localStorage si manquante
    if (gameConfig.roomPlayers !== null && (!Array.isArray(gameConfig.roomPlayers) || gameConfig.roomPlayers.length === 0)) {
        try {
            const rawRP = sessionStorage.getItem('for2d-room-players') || localStorage.getItem('for2d-room-players');
            if (rawRP) gameConfig.roomPlayers = JSON.parse(rawRP);
        } catch { /* ignore */ }
    }

    // Règle de cohérence stricte : déduire teamSize si mode est duo/trio/section
    const m = (gameConfig.mode || gameConfig.modeName || '').toLowerCase();
    if (m.includes('duo')) gameConfig.teamSize = 2;
    else if (m.includes('trio')) gameConfig.teamSize = 3;
    else if (m.includes('section') || m.includes('escouade')) gameConfig.teamSize = 4;
    else if (!gameConfig.teamSize) gameConfig.teamSize = 1;

    const teamSize = gameConfig.teamSize;
    const teamMode = teamSize > 1;

    /* ----- Aléatoire synchronisé en multijoueur -----
       En mode multijoueur, la graine (seed) envoyée par le serveur est partagée
       par tous les joueurs de la salle. On remplace temporairement Math.random
       par un générateur déterministe pendant l'initialisation du monde, du butin
       et des bots : même graine = mêmes coffres, mêmes bots, mêmes noms,
       mêmes équipes, mêmes points d'atterrissage sur TOUS les clients.
       Après l'initialisation, Math.random redevient normal (effets visuels, IA runtime). */
    const _realRandom = Math.random;
    const gameSeed = gameConfig.seed || Date.now();
    {
        // Générateur Mulberry32 (rapide, bon cycle, identique à noise.js)
        let _a = (gameSeed >>> 0) || 1;
        Math.random = function seededRandom() {
            _a = (_a + 0x6D2B79F5) | 0;
            let t = Math.imul(_a ^ (_a >>> 15), 1 | _a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const world = generateWorld();
    const loot = new Loot(world, gameSeed); // coffres (ajoutés aux obstacles) + butin au sol
    const effects = new Effects();

    // Départ dans le vaisseau (trajet synchronisé par la graine en multijoueur)
    const drop = new Drop(gameSeed);
    drop.world = world; // toits : glissade jusqu'au sol à côté de la maison
    const player = new Player(drop.ship.x, drop.ship.y);
    player.phase = 'ship';
    player.team = 1;
    player.squadSlot = gameConfig.mySlot || 1; // Joueur principal (slot assigné dans le salon)
    // Skin équipé dans le casier du lobby (sinon on garde les couleurs par défaut)
    try {
        const eq = Cosmetics.equipped;
        if (eq && eq.game) {
            player.colors = { ...player.colors, ...eq.game };
            player.skinStyle = eq.style || 'default';
        }
        // Sac à dos, pioche et planeur du chargement
        const pack = Cosmetics.equippedOf('backpack');
        if (pack && pack.color && !pack.none) {
            player.colors.pack = pack.color;
            // Forme du sac en jeu (ailes, cape, queue...) ; motif classique = petit sac coloré
            player.packMotif = pack.motif || null;
            player.packAccent = pack.accent || null;
        }
        const glider = Cosmetics.equippedOf('glider');
        if (glider && Array.isArray(glider.colors)) player.gliderColors = glider.colors;
        if (glider?.style) player.gliderStyle = glider.style; // forme spéciale (js/glider-art.js)
        const pick = Cosmetics.equippedOf('pickaxe');
        if (pick) {
            player.pickaxeSkin = pick.id;
            if (player.inventory?.[0]) player.inventory[0].pickaxeSkin = pick.id;
        }
    } catch {
        /* profil illisible : apparence par défaut */
    }

    const fighters = [player];

    // Multijoueur WebSocket : détection et initialisation des coéquipiers réels
    const isMultiplayer = Boolean(gameConfig.isMultiplayer && gameConfig.roomCode && gameConfig.myPlayerId);
    /*
       Hôte (« autorité ») : UN seul joueur de la partie simule les bots, la corruption
       et le vaisseau. C'est le serveur qui le désigne (authorityId) ; l'ancienne
       règle (slot 1 / chef du groupe) ne sert que si l'information manque.
       Peut changer en cours de partie si l'hôte se déconnecte (message 'authority').
    */
    let isHost = !isMultiplayer || (gameConfig.authorityId
        ? gameConfig.authorityId === gameConfig.myPlayerId
        : Boolean(gameConfig.isHost));
    const remotePlayersMap = new Map();
    const myTeam = gameConfig.myTeam || 1;
    player.team = myTeam;
    globalThis.FOR2D_LOCAL_TEAM = myTeam; // cercle d'escouade sous nos coéquipiers (draw.js)
    globalThis.FOR2D_TEAM_MODE = teamMode; // en solo : pas de cercle d'escouade
    // En multijoueur, le joueur porte son identifiant de salle (le même sur toutes les machines)
    if (isMultiplayer) player.id = gameConfig.myPlayerId;
    const meInRoom = isMultiplayer && Array.isArray(gameConfig.roomPlayers)
        ? gameConfig.roomPlayers.find(rp => rp && rp.id === gameConfig.myPlayerId) : null;
    if (meInRoom?.name) player.name = String(meInRoom.name).slice(0, 16);
    if (meInRoom?.slot) player.squadSlot = meInRoom.slot;

    if (isMultiplayer && Array.isArray(gameConfig.roomPlayers)) {
        for (const rp of gameConfig.roomPlayers) {
            // Même ordre (celui du serveur) sur toutes les machines
            if (rp && rp.id && rp.id !== gameConfig.myPlayerId && !remotePlayersMap.has(rp.id)) makeRemote(rp);
        }
    }
    const corpses = [];                        // personnages en train de disparaître
    const hitmarker = { t: 0, kill: false };   // croix sur le viseur quand on touche
    const pendingDamage = new Map();           // dégâts infligés par le joueur pendant l'image
    let renderer;
    let combatHud;
    let gameOver = false;
    let playerDeathShown = false;

    // Statistiques de la partie du joueur (écran de fin + XP enregistrée dans le profil)
    const stats = {
        damage: 0,          // dégâts infligés aux autres (hors corruption)
        chests: 0,          // coffres ouverts par le joueur
        startT: null,       // atterrissage (temps de jeu)
        endT: null,         // mort ou victoire
        place: 0,
        killer: null,       // combattant qui a éliminé le joueur (pour le spectateur)
        killerName: '',
        byCorruption: false,
        weaponId: '',
        weaponRarity: 0
    };
    const killerOf = new WeakMap(); // victime -> tueur (le spectateur passe au tueur de sa cible)

    let gameWs = null;
    let lastNetSync = 0;
    let lastBotSync = 0;
    let lastWorldSync = 0;

    /* ----- Réseau : envoi + propriété des combattants -----
       Chaque combattant a un seul propriétaire : le joueur pour lui-même, l'hôte pour
       les bots. Seul le propriétaire applique les dégâts, le K.O. et la mort ;
       les autres machines lui signalent les coups (p_hit) puis reçoivent le résultat. */
    const netOpen = () => isMultiplayer && gameWs && gameWs.readyState === WebSocket.OPEN;
    const netSend = (msg) => {
        if (!netOpen()) return;
        try { gameWs.send(JSON.stringify(msg)); } catch { /* socket fermée : la reconnexion gère */ }
    };
    const owns = (f) => !isMultiplayer || f === player || (f?.isBot === true && isHost);
    const fighterById = (id) => {
        if (id === null || id === undefined) return null;
        if (id === player.id) return player;
        return remotePlayersMap.get(id) || fighters.find(f => f.id === id) || null;
    };
    const netItem = (s) => (s ? {
        kind: s.kind, weaponId: s.weaponId || '', itemId: s.itemId || '',
        rarity: s.rarity || 0, count: s.count || 0, pickaxeSkin: s.pickaxeSkin || ''
    } : null);
    // Butin créé ici pendant l'image : envoyé en un seul message (voir flushLootSpawns)
    const pendingSpawns = [];

    // Volume des sons d'action : plein pour le joueur, un peu moins pour les bots
    const actionVol = (f) => (f === player ? 1 : BOT_VOL);

    const combat = new Combat(world, fighters, {
        onFire(f, w, mx, my) {
            // Combattant caché dans une maison (toit fermé pour nous) : pas d'effet visible
            // par-dessus le toit (le son reste, on peut l'entendre)
            const hidden = roofAlphaAt(world, f.x, f.y) > 0.5;
            if (w.type === 'melee') {
                if (!hidden) effects.swing(f.x, f.y, f.angle, f.r);
                SFX.play('swing', { x: f.x, y: f.y });
            } else {
                if (!hidden) effects.muzzle(mx, my, f.angle, w.id);
                SFX.play('shot', { x: f.x, y: f.y, weapon: w.id });
            }
            if (f === player) renderer?.shake(FIRE_SHAKE[w.id] || 1);
            // Les autres machines rejouent le tir (balles visuelles, sans dégâts)
            if (isMultiplayer && owns(f)) {
                netSend({
                    type: 'p_fire', s: f.id, w: w.id,
                    a: Math.round(f.angle * 1000) / 1000,
                    x: Math.round(f.x), y: Math.round(f.y)
                });
            }
        },
        onImpact(x, y, angle, kind, target) {
            effects.impact(x, y, angle, kind);
            SFX.play('impact', { x, y, kind });
            if (target) {
                // Petit recul de la cible dans le sens de la balle
                target.x += Math.cos(angle) * 4;
                target.y += Math.sin(angle) * 4;
            }
        },
        onDamage(victim, amount, attacker, hitShield, weaponId) {
            // Tick de la corruption : effet plus discret qu'un tir
            if (weaponId === 'corruption') {
                victim.hitFlash = 0.6;
                if (victim === player) {
                    SFX.play('corruptHit');
                    combatHud?.hurt(amount * 0.6);
                    renderer?.shake(1);
                }
                return;
            }
            victim.hitFlash = 1;
            if (weaponId === 'pickaxe') SFX.play('pickHit', { x: victim.x, y: victim.y });
            if (attacker === player && victim !== player) {
                // Dégâts réellement infligés (sans ce qui dépasse la vie restante)
                stats.damage += amount + Math.min(0, victim.health);
                SFX.play('hitmarker', { shield: hitShield });
                // Cumulé sur l'image : les 8 plombs du pompe donnent UN seul chiffre
                const d = pendingDamage.get(victim) || { amount: 0, shield: false };
                d.amount += amount;
                d.shield = d.shield || hitShield;
                pendingDamage.set(victim, d);
                hitmarker.t = 1;
                hitmarker.kill = false;
            }
            if (victim === player) {
                SFX.play('hurt');
                combatHud?.hurt(amount);
                renderer?.shake(3 + amount / 8);
            }
        },
        // Coup sur un combattant géré par une autre machine : on le lui signale
        onRemoteHit(victim, amount, attacker, weaponId) {
            // Seul celui qui a vraiment tiré envoie le coup (jamais une balle « visuelle »)
            if (!attacker || !owns(attacker)) return;
            victim.hitFlash = 1;
            if (attacker === player) {
                // Retour immédiat pour le tireur (le résultat exact arrive ensuite)
                stats.damage += Math.min(amount, Math.max(0, victim.health) + Math.max(0, victim.shield));
                SFX.play('hitmarker', { shield: victim.shield > 0 });
                const d = pendingDamage.get(victim) || { amount: 0, shield: false };
                d.amount += amount;
                d.shield = d.shield || victim.shield > 0;
                pendingDamage.set(victim, d);
                hitmarker.t = 1;
                hitmarker.kill = false;
            }
            netSend({ type: 'p_hit', t: victim.id, s: attacker.id, d: Math.round(amount * 10) / 10, w: weaponId || '' });
        },
        onKill(killer, victim, weaponId) {
            // Appelé seulement chez le propriétaire de la victime (voir Combat.owns)
            showDeath(killer, victim, weaponId);
            loot.dropAll(victim); // les objets créés sont diffusés (loot.onSpawn)
            if (isMultiplayer) netSend({ type: 'kill', v: victim.id, k: killer ? killer.id : null, w: weaponId || '' });
        },
        onDBNO(victim, attacker, weaponId) {
            showDbno(victim, attacker);
            if (isMultiplayer) netSend({ type: 'dbno', v: victim.id, k: attacker ? attacker.id : null, w: weaponId || '' });
        },
        onRevive(reviver, target) {
            effects.healDone(target.x, target.y, false);
            SFX.play('healDone', { x: target.x, y: target.y });
            if (target === player) {
                combatHud?.killBanner(`RÉANIMÉ PAR ${reviver.name.toUpperCase()} !`);
                renderer?.shake(3);
            } else if (reviver === player) {
                combatHud?.killBanner(`VOUS AVEZ RÉANIMÉ ${target.name.toUpperCase()} !`);
            }
        },
        onHealed(f, h) {
            if (roofAlphaAt(world, f.x, f.y) <= 0.5) effects.healDone(f.x, f.y, h.shield > 0);
            SFX.play('healDone', { x: f.x, y: f.y, shield: h.shield > 0 });
        },
        onReload(f, w) {
            SFX.play('reload', { x: f.x, y: f.y, weapon: w.id, vol: actionVol(f) });
        },
        onReloaded(f, w) {
            SFX.play('reloadDone', { x: f.x, y: f.y, weapon: w.id, vol: actionVol(f) });
        },
        onDryFire(f) {
            SFX.play('dryFire', { x: f.x, y: f.y, vol: actionVol(f) });
        },
        onUseStart(f, h) {
            SFX.play('healStart', { x: f.x, y: f.y, item: h.id, vol: actionVol(f) });
        }
    });
    combat.teamMode = teamMode;
    combat.owns = owns;

    // Mort d'un combattant (ici ou sur une autre machine) : animation, fil des éliminations, stats
    function showDeath(killer, victim, weaponId) {
        // Photo du personnage pour l'animation de mort (avant que son inventaire tombe)
        corpses.push({
            x: victim.x, y: victim.y, r: victim.r, angle: victim.angle,
            colors: victim.colors, skinStyle: victim.skinStyle,
            packMotif: victim.packMotif, packAccent: victim.packAccent,
            inventory: victim.inventory.slice(), slot: victim.slot, t: 0
        });
        effects.death(victim.x, victim.y, victim.colors);
        SFX.play('eliminate', { x: victim.x, y: victim.y });
        if (killer && killer !== victim && weaponId !== 'corruption') killerOf.set(victim, killer);
        if (victim === player) {
            // Arme du tueur et sa rareté, lues AVANT que quoi que ce soit ne change
            stats.endT = time;
            stats.byCorruption = weaponId === 'corruption';
            if (!stats.byCorruption && killer && killer !== player) {
                const held = killer.inventory?.[killer.slot];
                const it = held?.weaponId === weaponId ? held : killer.inventory?.find((s) => s?.weaponId === weaponId);
                stats.killer = killer;
                stats.killerName = killer.name;
                stats.weaponId = weaponId || '';
                stats.weaponRarity = it?.rarity || 0;
                stats.weaponSkin = it?.pickaxeSkin || killer.pickaxeSkin || '';
            }
        }
        combatHud?.addKill(killer, victim, weaponId);

        if (killer === player && victim !== player) {
            SFX.play('killConfirm');
            combatHud?.killBanner(victim.name);
            hitmarker.t = 1;
            hitmarker.kill = true;
            renderer?.shake(6);
        }
        if (victim === player) {
            SFX.play('playerDown');
            renderer?.shake(14);
        }
    }

    // K.O. d'un combattant (ici ou sur une autre machine)
    function showDbno(victim, attacker) {
        effects.death(victim.x, victim.y, victim.colors);
        SFX.play('playerDown', { x: victim.x, y: victim.y });
        combatHud?.addKill(attacker, victim, 'knockout');
        if (victim === player) {
            SFX.play('playerDown');
            renderer?.shake(12);
        }
        if (attacker === player) {
            SFX.play('killConfirm');
            combatHud?.killBanner(`K.O. - ${victim.name}`);
            renderer?.shake(5);
        }
    }

    /* ----- Butin : chaque changement fait ici est diffusé aux autres joueurs ----- */
    // Rectangle de maison contenant un point. Les coffres sauvages renvoient null.
    function buildingAt(x, y) {
        for (const b of world.buildings) {
            if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return b;
        }
        return null;
    }

    // Un coffre intérieur entendu depuis l'extérieur (ou une autre maison) est étouffé.
    // Le filtrage est appliqué dans SFX.play pour conserver les graves mais couper les aigus.
    let audioView = player;
    function chestMuffle(chest) {
        const sourceBuilding = buildingAt(chest.x, chest.y);
        if (!sourceBuilding) return 0;
        const listenerBuilding = buildingAt(audioView.x, audioView.y);
        return listenerBuilding === sourceBuilding ? 0 : 0.72;
    }

    if (isMultiplayer) {
        // Préfixe unique par joueur : les objets créés en partie ne se mélangent jamais
        loot.idPrefix = `${String(gameConfig.myPlayerId).slice(-6)}:`;
        loot.onSpawn = (it) => pendingSpawns.push(loot.serialize(it));
        loot.onTake = (f, item) => {
            if (!owns(f)) return;
            const left = item.gone ? 0 : (item.kind === 'ammo' ? item.amount : item.count);
            netSend({ type: 'loot_take', i: item.id, l: left, s: f.id });
        };
    }
    function flushLootSpawns() {
        if (!pendingSpawns.length) return;
        netSend({ type: 'loot_spawn', items: pendingSpawns.splice(0) });
    }

    loot.onChestOpen = (c, f, local = true) => {
        effects.chestOpen(c.x, c.y);
        SFX.play('chest', { x: c.x, y: c.y, muffle: chestMuffle(c) });
        if (f === player) stats.chests++;
        // Ouvert ici par un combattant qu'on gère : les autres l'ouvrent aussi (sans butin)
        if (local && isMultiplayer && owns(f)) netSend({ type: 'chest_open', c: c.id, s: f?.id ?? null });
    };
    loot.onPickup = (f, item, color) => {
        effects.pickup(item.x, item.y, color);
        SFX.play('pickup', { x: item.x, y: item.y, kind: item.kind });
    };

    // La corruption (zone qui rétrécit) : démarre quand le vaisseau a fini ou que le joueur a atterri
    const corruption = new Corruption(world, gameSeed);
    corruption.onEvent = (type) => {
        if (type === 'warn') SFX.play('zoneWarn');
        else if (type === 'shrink') SFX.play('zoneShrink');
    };

    /*
       Bots de la partie (même calcul sur toutes les machines) :
       - « Remplir l'équipe » : les places libres des équipes de vrais joueurs qui l'ont
         activé reçoivent des bots coéquipiers (sinon l'équipe joue en sous-nombre) ;
       - « Remplir la partie » : des escouades de bots complètent la carte jusqu'à
         MAX_FIGHTERS combattants (sinon : seulement les équipes de vrais joueurs).
       En multijoueur, le serveur donne la liste des équipes (gameConfig.teams).
    */
    // Hors ligne, il n'y a pas d'autres vrais joueurs : la partie est toujours remplie de bots
    const fillMatch = !isMultiplayer || (gameConfig.fillMatch ?? (gameConfig.bots !== false));
    let teams = isMultiplayer && Array.isArray(gameConfig.teams) && gameConfig.teams.length ? gameConfig.teams : null;
    if (!teams) {
        const humans = 1 + [...remotePlayersMap.values()].filter(m => m.team === myTeam).length;
        teams = [{ team: myTeam, humans, fillTeam: gameConfig.fillTeam !== false }];
    }
    const teamFill = teamMode
        ? teams.filter(t => t.fillTeam).map(t => ({
            team: t.team,
            count: Math.max(0, teamSize - (t.humans || 1)),
            firstSlot: (t.humans || 1) + 1
        }))
        : [];
    const humanSlots = teams.length * teamSize;
    const enemyCount = fillMatch
        ? Math.max(0, Math.floor((MAX_FIGHTERS - humanSlots) / teamSize) * teamSize)
        : 0;
    const bots = new BotManager({
        world, drop, loot, combat, fighters,
        corruption, teamSize, player,
        isGuest: isMultiplayer && !isHost,
        teamFill,
        enemyCount,
        firstEnemyTeam: Math.max(...teams.map(t => t.team || 1)) + 1
    });

    // ----- Fin de l'initialisation déterministe -----
    // Restaurer Math.random pour que l'IA, les effets visuels et les sons
    // restent naturels (non prédictibles) pendant la partie.
    Math.random = _realRandom;

    const canvas = document.getElementById('gameCanvas');
    renderer = new Renderer(canvas, world);
    renderer.setFlightView(flightViewAt(1), 1, true); // caméra à la hauteur du vaisseau
    renderer.follow(drop.ship, 0, true);
    renderer.warmup();

    const hud = new Hud(world, player, fighters);
    hud.setFlight(drop);
    combatHud = new CombatHud(player, fighters, loot);
    hud.setZone?.(corruption);
    renderer.setZone(corruption); // la carte elle-même devient violet / noir dans la corruption
    combatHud.setZone?.(corruption);

    // Écran de fin (XP enregistrée) et spectateur après une défaite
    const endScreen = new EndScreen({
        sfx: SFX,
        onOpen: () => {
            hud.toggleMap(false);
            inventoryUI?.toggle(false);
            spectator.setBarVisible(false);
        },
        onWatch: () => {
            spectator.setBarVisible(true);
            document.getElementById('specResults')?.focus();
        }
    });
    const spectator = new Spectator({
        player,
        fighters,
        killerOf,
        sfx: SFX,
        isBlocked: () => settingsOpen || endScreen.isOpen,
        onResults: () => endScreen.open(document.getElementById('esWatchBtn'))
    });

    const selectSlot = (i) => {
        if (!player.alive || player.dbno) return;
        if (i !== player.slot) SFX.play('slot'); // seulement si la case change vraiment
        player.slot = i;
        hud.selectSlot(i);
    };
    document.querySelectorAll('#hotbar .slot').forEach((btn, i) => btn.addEventListener('click', () => {
        if (!player.dbno) selectSlot(i);
    }));

    // Ouvre un coffre / ramasse un objet ; une arme ramassée pioche en main est équipée tout de suite
    const interact = () => {
        if (!player.alive || player.dbno || player.phase !== 'ground') return;
        const before = player.inventory.slice();
        if (!loot.interact(player)) return;
        if (player.slot === 0) {
            const i = player.inventory.findIndex((s, k) => k > 0 && s && s.kind === 'weapon' && s !== before[k]);
            if (i > 0) selectSlot(i);
        }
    };

    // ================= ROUE D'EMOTES (clic droit maintenu, au centre de l'écran) =================
    // Anti-spam : une emote toutes les EMOTE_COOLDOWN secondes. Les emotes reçues des autres
    // joueurs sont aussi ignorées si elles arrivent plus vite (et le serveur les filtre aussi).
    const EMOTE_COOLDOWN = 3;
    const EMOTE_TIME = 2.8;          // durée d'affichage de la bulle
    const emoteWheel = document.getElementById('emoteWheel');
    const emoteOptions = emoteWheel ? [...emoteWheel.querySelectorAll('.emote-option')] : [];
    const emoteHint = emoteWheel?.querySelector('.emote-wheel-hint');
    let emoteWheelOpen = false;
    let emoteSelected = -1;
    let emoteWheelCenter = { x: 0, y: 0 };
    let lastEmoteAt = -Infinity;     // performance.now() de la dernière emote jouée
    let emoteCdShown = '';
    const emoteBubbles = new Map();

    // Secondes avant de pouvoir rejouer une emote (0 = prêt)
    const emoteCooldownLeft = () => Math.max(0, EMOTE_COOLDOWN - (performance.now() - lastEmoteAt) / 1000);

    // Affiche le temps d'attente au centre de la roue et grise les emotes pendant l'attente
    function updateEmoteCooldownUi() {
        const left = emoteCooldownLeft();
        const txt = left > 0 ? `${Math.ceil(left)} s` : 'RELÂCHER';
        if (txt === emoteCdShown) return;
        emoteCdShown = txt;
        if (emoteHint) emoteHint.textContent = txt;
        emoteWheel?.classList.toggle('is-cooldown', left > 0);
    }

    function equippedEmotes() {
        return Array.from({ length: Cosmetics.EMOTE_SLOTS || 4 }, (_, i) => Cosmetics.equippedOf('emote', i));
    }

    function prepareEmoteWheel() {
        const emotes = equippedEmotes();
        emoteOptions.forEach((option, i) => {
            const art = option.querySelector('.emote-option-art');
            const name = option.querySelector('.emote-option-name');
            const item = emotes[i];
            option.classList.toggle('is-empty', !item);
            option.classList.remove('is-selected');
            if (art) art.innerHTML = item ? itemArt(item) : '<span aria-hidden="true">—</span>';
            if (name) name.textContent = item?.name || 'Emote vide';
        });
    }

    function updateEmoteSelection() {
        if (!emoteWheelOpen) return;
        const dx = input.mouse.x - emoteWheelCenter.x;
        const dy = input.mouse.y - emoteWheelCenter.y;
        const distance = Math.hypot(dx, dy);
        let selected = -1;
        if (distance > 48) {
            // 0 = haut, puis droite, bas, gauche, comme la roue de référence.
            const angle = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
            selected = Math.floor((angle + Math.PI / 4) / (Math.PI / 2)) % 4;
            if (!equippedEmotes()[selected]) selected = -1;
        }
        if (selected === emoteSelected) return;
        emoteSelected = selected;
        const centerArt = emoteWheel.querySelector('.emote-wheel-center-art');
        if (centerArt) {
            const item = selected >= 0 ? equippedEmotes()[selected] : null;
            centerArt.innerHTML = item ? itemArt(item) : '<span class="emote-wheel-figure" aria-hidden="true">●</span>';
        }
        emoteOptions.forEach((option, i) => option.classList.toggle('is-selected', i === selected));
    }

    function openEmoteWheel() {
        if (!emoteWheel || emoteWheelOpen || !player.alive || player.dbno || player.phase !== 'ground' ||
            hud.mapOpen || settingsOpen || inventoryUI.open || endScreen.isOpen) return false;
        if (!equippedEmotes().some(Boolean)) return false;
        prepareEmoteWheel();
        // Toujours au milieu de l'écran (la sélection se fait selon la direction de la souris)
        emoteWheelCenter = { x: innerWidth / 2, y: innerHeight / 2 };
        emoteWheel.style.left = '50%';
        emoteWheel.style.top = '50%';
        emoteWheel.hidden = false;
        emoteWheelOpen = true;
        emoteSelected = -2;
        emoteCdShown = '';
        updateEmoteCooldownUi();
        updateEmoteSelection();
        return true;
    }

    function closeEmoteWheel(play = true) {
        if (!emoteWheelOpen) return;
        const chosen = emoteSelected;
        const item = chosen >= 0 ? equippedEmotes()[chosen] : null;
        emoteWheelOpen = false;
        emoteSelected = -1;
        emoteWheel.hidden = true;
        if (!play || !item) return;
        // Anti-spam : emote refusée tant que l'attente n'est pas finie
        if (emoteCooldownLeft() > 0) {
            SFX.play('dryFire');
            return;
        }
        lastEmoteAt = performance.now();
        player.emote = { id: item.id, t: EMOTE_TIME };
        SFX.play('click');
        if (isMultiplayer) netSend({ type: 'emote', e: item.id });
    }

    function updateEmoteBubbles(dt) {
        for (const fighter of fighters) {
            if (fighter.emote) {
                fighter.emote.t -= dt;
                if (fighter.emote.t <= 0) fighter.emote = null;
            }
            const emote = fighter.emote;
            let bubble = emoteBubbles.get(fighter.id);
            if (!emote) {
                bubble?.remove();
                emoteBubbles.delete(fighter.id);
                continue;
            }
            if (!bubble) {
                bubble = document.createElement('div');
                bubble.className = 'emote-bubble';
                document.body.appendChild(bubble);
                emoteBubbles.set(fighter.id, bubble);
            }
            const item = getItem(emote.id);
            bubble.innerHTML = item ? itemArt(item) : '';
            const pos = renderer.worldToScreen(fighter.x, fighter.y - (fighter.r || 26) * 2.2);
            bubble.style.left = `${Math.round(pos.x)}px`;
            bubble.style.top = `${Math.round(pos.y)}px`;
            bubble.style.setProperty('--emote-life', `${Math.min(1, emote.t / 0.35)}`);
            bubble.classList.toggle('is-local', fighter === player);
        }
    }

    // Clic droit maintenu : la roue est ouverte ; relâché : l'emote visée est jouée.
    // Renvoie true tant que la roue est ouverte (pas de tir pendant ce temps).
    function updateEmoteInput() {
        if (emoteWheelOpen) {
            if (!input.mouse.rdown) {
                closeEmoteWheel(true);
                return true;
            }
            updateEmoteSelection();
            updateEmoteCooldownUi();
            return true;
        }
        if (input.mouse.rdown) return openEmoteWheel();
        return false;
    }

    const input = new Input(canvas, {
        // Pas de carte par-dessus l'écran de fin (Tab y sert à déplacer le focus)
        onMap: () => { if (!endScreen.isOpen) hud.toggleMap(); },
        onMapHold: (down) => { if (!down || !endScreen.isOpen) hud.toggleMap(down); },
        onEscape: () => {
            closeEmoteWheel(false);
            if (!settingsOpen && !hud.mapOpen) {
                if (endScreen.isOpen && endScreen.canWatch) {
                    endScreen.watch();
                    return;
                }
                if (spectator.barVisible) {
                    endScreen.open(document.getElementById('esWatchBtn'));
                    return;
                }
            }
            hud.toggleMap(false);
            toggleSettings(false);
            inventoryUI.toggle(false);
        },
        onSlot: (i) => { if (!player.dbno) selectSlot(i); },
        onZoom: (f) => renderer.zoomBy(f),
        // Le saut est transmis par p_state (changement de phase)
        onJump: () => { if (!player.dbno) drop.jump(player); },
        onInteract: interact,
        onReload: () => { if (!player.dbno) combat.startReload(player); },
        onInventory: () => {
            if (settingsOpen || player.dbno) return;
            hud.toggleMap(false);
            inventoryUI.toggle();
        }
    });

    // Inventaire détaillé (clic molette / I) : déplacer, jeter, statistiques
    const inventoryUI = new InventoryUI({ player, loot, onSelect: selectSlot, sfx: SFX });
    canvas.addEventListener('click', () => {
        if (!player.dbno) drop.jump(player);
    });

    addEventListener('resize', () => {
        renderer.resize();
        hud.resize();
    });

    /* ----- Bouton son (et touche N) ----- */
    const soundBtn = document.getElementById('soundBtn');
    const updateSoundBtn = () => {
        if (!soundBtn) return;
        const muted = SFX.isMuted();
        const label = muted ? 'Activer le son' : 'Couper le son';
        const icon = soundBtn.querySelector('[data-icon]');
        if (icon) setHudIcon(icon, muted ? 'sound-off' : 'sound-on');
        soundBtn.setAttribute('aria-label', label);
        soundBtn.title = `${label} (N)`;
        soundBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        soundBtn.classList.toggle('is-muted', muted);
    };
    const toggleSound = () => {
        const muted = SFX.toggleMute();
        updateSoundBtn();
        if (!muted) SFX.play('click'); // petit retour sonore quand le son revient
    };
    soundBtn?.addEventListener('click', toggleSound);
    addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (e.code === 'KeyN') toggleSound();
        if (e.code === 'KeyP') toggleSettings();
    });
    updateSoundBtn();

    /* ----- Panneau des paramètres (bouton ⚙ ou touche P) ----- */
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    let settingsOpen = false;
    function toggleSettings(force) {
        if (!settingsPanel) return;
        const open = typeof force === 'boolean' ? force : !settingsOpen;
        if (open === settingsOpen) return;
        settingsOpen = open;
        settingsPanel.hidden = !open;
        SFX.play('map', { open });
        if (open) {
            hud.toggleMap(false);
            inventoryUI.toggle(false);
            settingsPanel.querySelector('[data-setting]')?.focus();
        } else if (settingsPanel.contains(document.activeElement)) {
            settingsBtn?.focus(); // on rend le focus au bouton qui a ouvert le panneau
        }
    }
    settingsBtn?.addEventListener('click', () => toggleSettings());
    settingsPanel?.addEventListener('click', (e) => {
        // Clic sur le fond sombre ou sur la croix : fermeture
        if (e.target === settingsPanel || e.target.closest('[data-settings-close]')) toggleSettings(false);
    });

    document.getElementById('loading')?.classList.add('done');

    /* ===================== MULTIJOUEUR EN PARTIE =====================
       Messages (relayés par le serveur à tous les joueurs de la partie, avec id = émetteur) :
       - p_state    (20/s)  position, visée, vie, inventaire, K.O. de chaque joueur
       - p_fire             un tir (joueur ou bot de l'hôte) rejoué en balles visuelles
       - p_hit              « j'ai touché ton combattant » -> appliqué par son propriétaire
       - kill / dbno        mort / K.O. décidés par le propriétaire de la victime
       - revive             réanimation terminée (appliquée par le joueur réanimé)
       - b_sync     (10/s)  état des bots (hôte seulement)
       - world_sync (1/s)   vaisseau + corruption (hôte seulement)
       - chest_open / loot_spawn / loot_take : coffres et objets au sol
       - authority          (serveur) nouvel hôte si l'ancien est parti
       - player_gone        (serveur) un joueur a quitté la partie pour de bon
    */
    let reconnectDelay = 1000;
    let reviveSeenAt = 0;            // dernière fois qu'un coéquipier nous réanimait (p_state.rv)
    let lastBotSeen = new Map();     // bot -> nombre de b_sync consécutifs sans lui

    function makeRemote(rp) {
        const mate = new Player(drop.ship.x, drop.ship.y);
        mate.id = rp.id;
        mate.name = String(rp.name || 'Joueur').slice(0, 16);
        mate.team = rp.team || myTeam;
        mate.squadSlot = rp.slot || 2;
        mate.isRemote = true;
        mate.phase = 'ship';
        const skinId = (typeof rp.skin === 'string' ? rp.skin : rp.skin?.id) || 'recrue';
        const s = getSkin?.(skinId);
        if (s?.game) {
            mate.colors = { ...mate.colors, ...s.game };
            mate.skinStyle = s.style || 'default';
        }
        if (rp.colors) mate.colors = { ...mate.colors, ...rp.colors };
        if (rp.backpack) {
            const bp = getItem?.(rp.backpack);
            if (bp?.color && !bp.none) {
                mate.colors.pack = bp.color;
                mate.packMotif = bp.motif || null;
                mate.packAccent = bp.accent || null;
            }
        }
        if (rp.pickaxeSkin) mate.pickaxeSkin = rp.pickaxeSkin;
        // Planeur équipé par l'autre joueur (couleurs + forme)
        const gl = rp.glider ? getItem?.(rp.glider) : null;
        if (gl?.type === 'glider') {
            mate.gliderColors = gl.colors;
            mate.gliderStyle = gl.style || null;
        }
        mate._targetX = mate.x;
        mate._targetY = mate.y;
        mate._targetAngle = mate.angle;
        mate._targetAlt = 1;
        remotePlayersMap.set(rp.id, mate);
        fighters.push(mate);
        return mate;
    }

    function syncRoomPlayers(list) {
        if (!Array.isArray(list)) return;
        let changed = false;
        for (const rp of list) {
            if (!rp || !rp.id || rp.id === player.id) continue;
            const mate = remotePlayersMap.get(rp.id);
            if (!mate) {
                makeRemote(rp);
                changed = true;
                console.log(`[Multijoueur] ${rp.name || rp.id} est dans la partie`);
            } else {
                if (rp.name && mate.name !== rp.name) { mate.name = String(rp.name).slice(0, 16); changed = true; }
                if (rp.slot && mate.squadSlot !== rp.slot) { mate.squadSlot = rp.slot; changed = true; }
                if (rp.team && mate.team !== rp.team) { mate.team = rp.team; changed = true; }
            }
        }
        if (changed) updateSquadHud();
    }

    // Changement d'hôte : celui qui le devient reprend la simulation des bots là où elle en est
    function setAuthority(id) {
        if (!isMultiplayer || !id) return;
        const was = isHost;
        isHost = id === player.id;
        bots.isGuest = !isHost;
        if (isHost === was) return;
        for (const b of bots.bots) {
            if (isHost) {
                if (Number.isFinite(b._targetX)) { b.x = b._targetX; b.y = b._targetY; }
                if (Number.isFinite(b._targetAngle)) b.angle = b._targetAngle;
                if (Number.isFinite(b._targetAlt)) b.altitude = b._targetAlt;
            } else {
                b._targetX = b.x;
                b._targetY = b.y;
                b._targetAngle = b.angle;
                b._targetAlt = b.altitude;
            }
        }
        console.log(isHost ? '[Multijoueur] Tu es maintenant l\'hôte de la partie' : '[Multijoueur] Nouvel hôte de la partie');
        if (isHost) {
            lastBotSync = 0;
            lastWorldSync = 0;
        }
    }

    // Effets d'un tir rejoué (même rendu que onFire)
    function remoteFireFx(f, w) {
        const hidden = roofAlphaAt(world, f.x, f.y) > 0.5;
        if (w.type === 'melee') {
            if (!hidden) effects.swing(f.x, f.y, f.angle, f.r);
            SFX.play('swing', { x: f.x, y: f.y });
        } else {
            const muzzle = f.r + w.length * 0.8;
            if (!hidden) effects.muzzle(f.x + Math.cos(f.angle) * muzzle, f.y + Math.sin(f.angle) * muzzle, f.angle, w.id);
            SFX.play('shot', { x: f.x, y: f.y, weapon: w.id, vol: actionVol(f) });
        }
    }

    // Arme visible dans les mains d'une copie (si l'état n'est pas encore arrivé)
    function showHeld(f, weaponId, rarity) {
        if (!f.inventory) f.inventory = [null, null, null, null, null];
        const slot = Number.isInteger(f.slot) ? f.slot : 0;
        const held = f.inventory[slot];
        if (held?.kind === 'weapon' && held.weaponId === weaponId) return;
        f.inventory[slot] = {
            kind: 'weapon', weaponId, rarity: rarity ?? held?.rarity ?? 0,
            mag: 0, pickaxeSkin: f.pickaxeSkin
        };
    }

    // Mort silencieuse (état reçu sans le message de mort, ou joueur parti)
    function quietDeath(f) {
        if (!f.alive) return;
        corpses.push({
            x: f.x, y: f.y, r: f.r, angle: f.angle, colors: f.colors, skinStyle: f.skinStyle,
            packMotif: f.packMotif, packAccent: f.packAccent,
            inventory: (f.inventory || []).slice(), slot: f.slot, t: 0
        });
        f.alive = false;
        f.dbno = false;
        f.health = 0;
    }

    function applyRemoteState(mate, m) {
        if (Number.isFinite(m.x)) mate._targetX = m.x;
        if (Number.isFinite(m.y)) mate._targetY = m.y;
        if (Number.isFinite(m.a)) mate._targetAngle = m.a;
        if (Number.isFinite(m.alt)) mate._targetAlt = m.alt;
        mate.vx = m.vx || 0;
        mate.vy = m.vy || 0;
        mate.moving = Math.hypot(mate.vx, mate.vy) > 20;
        if (typeof m.ph === 'string' && m.ph !== mate.phase) {
            // Saut / atterrissage : on recale tout de suite (pas de glissade depuis le vaisseau)
            mate.phase = m.ph;
            mate.x = mate._targetX;
            mate.y = mate._targetY;
            if (m.ph === 'air') SFX.play('jump', { x: mate.x, y: mate.y });
        }
        if (Array.isArray(m.inv)) {
            mate.inventory = m.inv.map(s => (s && s.kind ? { ...s, mag: 0 } : null));
        }
        if (Number.isInteger(m.sl)) mate.slot = m.sl;
        if (Number.isFinite(m.hp)) mate.health = m.hp;
        if (Number.isFinite(m.sh)) mate.shield = m.sh;
        if (typeof m.db === 'boolean') {
            if (mate.dbno && !m.db && mate.alive) {
                mate.dbno = false;
                mate.speedMul = 1;
            } else if (!mate.dbno && m.db && mate.alive) {
                mate.dbno = true; // l'effet a été joué par le message 'dbno'
            }
        }
        if (Number.isFinite(m.dt)) mate.dbnoTimer = m.dt;
        // Soin en cours (affichage seulement : total infini, la copie ne se soigne jamais elle-même)
        if (m.use && !mate.usingItem) mate.usingItem = { slot: mate.slot, t: 0, total: Infinity };
        else if (!m.use) mate.usingItem = null;
        // Un coéquipier nous réanime
        if (Array.isArray(m.rv) && m.rv[0] === player.id && player.dbno) {
            player.reviveProgress = Math.max(0, Math.min(5, Number(m.rv[1]) || 0));
            reviveSeenAt = performance.now();
        }
        if (m.al === false && mate.alive) quietDeath(mate);
    }

    function applyBotSync(list) {
        const seen = new Set();
        for (const e of list) {
            if (!Array.isArray(e)) continue;
            const [id, x, y, a, hp, sh, ph, db, alt, wId, wR] = e;
            const b = fighterById(id);
            if (!b || !b.isBot) continue;
            seen.add(b);
            if (!b.alive) continue; // mort ici : on ne la ressuscite pas
            if (ph && b.phase !== ph) {
                b.phase = ph;
                b.x = x;
                b.y = y;
            }
            b._targetX = x;
            b._targetY = y;
            b._targetAngle = a;
            if (Number.isFinite(alt)) b._targetAlt = alt;
            b.health = hp;
            b.shield = sh;
            if (db && !b.dbno) { b.dbno = true; b.dbnoTimer = 35; }
            else if (!db && b.dbno) b.dbno = false;
            if (wId) {
                b.slot = 0;
                showHeld(b, wId, wR || 0);
            } else if (b.inventory) {
                b.inventory[0] = null;
            }
        }
        // Un bot vivant ici mais absent deux fois de suite chez l'hôte est mort là-bas
        for (const b of bots.bots) {
            if (!b.alive || seen.has(b)) {
                lastBotSeen.delete(b);
                continue;
            }
            const n = (lastBotSeen.get(b) || 0) + 1;
            lastBotSeen.set(b, n);
            if (n >= 2) {
                quietDeath(b);
                lastBotSeen.delete(b);
            }
        }
    }

    function handleNet(msg) {
        if (!msg || typeof msg.type !== 'string') return;
        // L'émetteur (msg.id) est ajouté par le serveur ; on ignore nos propres messages
        if (msg.id && msg.id === player.id && msg.type !== 'room_joined') return;
        switch (msg.type) {
            case 'room_joined':
                if (Array.isArray(msg.players)) syncRoomPlayers(msg.players);
                if (msg.authorityId) setAuthority(msg.authorityId);
                // Heure commune de la partie (départ du vaisseau)
                if (Number.isFinite(msg.clock)) setGameClock(msg.clock);
                break;
            case 'player_joined':
            case 'player_reconnected':
                if (msg.player) syncRoomPlayers([msg.player]);
                break;
            case 'authority':
                setAuthority(msg.authorityId);
                break;
            case 'emote': {
                const fighter = fighterById(msg.id);
                const item = getItem(msg.e);
                if (!fighter || !item || item.type !== 'emote' || !fighter.alive) break;
                // Anti-spam à la réception (au cas où un client ne respecte pas l'attente)
                const now = performance.now();
                if (now - (fighter._lastEmoteAt || -Infinity) < (EMOTE_COOLDOWN - 0.5) * 1000) break;
                fighter._lastEmoteAt = now;
                fighter.emote = { id: item.id, t: EMOTE_TIME };
                SFX.play('click', { x: fighter.x, y: fighter.y, vol: 0.45 });
                break;
            }
            case 'player_gone': {
                // Joueur parti pour de bon (retour au lobby, onglet fermé) : éliminé sur TOUTES
                // les machines (pas seulement chez l'hôte, qui est peut-être celui qui part).
                // S'il restait la dernière équipe adverse, checkEnd donne la victoire.
                const mate = remotePlayersMap.get(msg.playerId);
                if (!mate || !mate.alive) break;
                showDeath(null, mate, '');
                mate.alive = false;
                mate.dbno = false;
                mate.health = 0;
                // Son butin tombe une seule fois : c'est l'hôte de la partie qui s'en charge
                if (isHost) {
                    loot.dropAll(mate);
                    netSend({ type: 'kill', v: mate.id, k: null, w: '' });
                }
                break;
            }
            case 'p_state': {
                if (!msg.id) break;
                let mate = remotePlayersMap.get(msg.id);
                if (!mate) mate = makeRemote({ id: msg.id, name: msg.n, slot: msg.ss, team: msg.tm });
                if (msg.n && mate.name !== msg.n) mate.name = String(msg.n).slice(0, 16);
                applyRemoteState(mate, msg);
                break;
            }
            case 'p_fire': {
                const f = fighterById(msg.s);
                const w = WEAPONS[msg.w];
                if (!f || !w || owns(f) || !f.alive) break;
                showHeld(f, msg.w);
                f.angle = Number.isFinite(msg.a) ? msg.a : f.angle;
                combat.ghostFire(f, msg.w, msg.a);
                remoteFireFx(f, w);
                break;
            }
            case 'p_hit': {
                const victim = fighterById(msg.t);
                if (!victim || !owns(victim) || !victim.alive) break;
                const attacker = fighterById(msg.s);
                const amount = Math.max(0, Math.min(250, Number(msg.d) || 0));
                if (amount > 0) combat.damage(victim, amount, attacker, msg.w || 'ar');
                break;
            }
            case 'kill': {
                const victim = fighterById(msg.v);
                if (!victim || owns(victim) || !victim.alive) break;
                const killer = fighterById(msg.k);
                victim.alive = false;
                victim.dbno = false;
                victim.health = 0;
                victim.usingItem = null;
                if (killer && killer !== victim) killer.kills = (killer.kills || 0) + 1;
                showDeath(killer, victim, msg.w || '');
                break;
            }
            case 'dbno': {
                const victim = fighterById(msg.v);
                if (!victim || owns(victim) || !victim.alive || victim.dbno) break;
                const attacker = fighterById(msg.k);
                victim.dbno = true;
                victim.dbnoTimer = 35;
                victim.health = 100;
                victim.shield = 0;
                victim.speedMul = 0.35;
                victim.usingItem = null;
                victim.dbnoAttacker = attacker;
                showDbno(victim, attacker);
                break;
            }
            case 'revive': {
                const target = fighterById(msg.t);
                const reviver = fighterById(msg.id) || player;
                if (!target || !target.alive || !target.dbno) break;
                target.dbno = false;
                target.health = 30;
                target.speedMul = 1;
                target.reviveProgress = 0;
                target.dbnoAttacker = null;
                target.dbnoWeapon = null;
                combat.events.onRevive?.(reviver, target);
                break;
            }
            case 'b_sync':
                if (!isHost && Array.isArray(msg.bots)) applyBotSync(msg.bots);
                break;
            case 'world_sync':
                if (isHost) break;
                // ~50 ms de trajet réseau compensés
                if (Number.isFinite(msg.c) && msg.c >= 0) corruption.syncTo(msg.c + 0.05);
                if (Number.isFinite(msg.d)) drop.syncTo(msg.d);
                break;
            case 'chest_open': {
                const c = loot.chests[msg.c];
                if (c && !c.opened) loot.openChest(c, fighterById(msg.s), false);
                break;
            }
            case 'loot_spawn':
                if (Array.isArray(msg.items)) for (const d of msg.items) loot.addRemote(d);
                break;
            case 'loot_take': {
                const it = loot.takeRemote(msg.i, Number(msg.l) || 0);
                if (it?.gone) effects.pickup(it.x, it.y, loot._itemColor(it));
                break;
            }
        }
    }

    function connectGame() {
        const loc = window.location;
        const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = (loc.port === '8080' || loc.port === '5500') ? `${loc.hostname}:3000` : loc.host;
        let ws;
        try {
            ws = new WebSocket(`${proto}//${wsHost}`);
        } catch (err) {
            console.warn('[Multijoueur] Connexion impossible', err);
            setTimeout(connectGame, reconnectDelay);
            return;
        }
        gameWs = ws;
        ws.addEventListener('open', () => {
            reconnectDelay = 1000;
            ws.send(JSON.stringify({
                type: 'join_room',
                code: gameConfig.roomCode,
                player: { id: player.id, name: player.name, slot: player.squadSlot, inGame: true }
            }));
        });
        ws.addEventListener('message', (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }
            try {
                handleNet(msg);
            } catch (err) {
                console.warn('[Multijoueur] Message ignoré', msg?.type, err);
            }
        });
        ws.addEventListener('close', () => {
            if (gameWs === ws) gameWs = null;
            // Coupure (wifi, serveur relancé...) : on se reconnecte à la même partie
            setTimeout(connectGame, reconnectDelay);
            reconnectDelay = Math.min(5000, reconnectDelay * 1.5);
        });
    }

    if (isMultiplayer) connectGame();

    /* ----- Actions du joueur (tir, soin) ----- */
    function playerActions() {
        const pressed = input.consumePress();
        // Clic droit maintenu : roue d'emotes ; le relâchement joue l'emote visée
        if (updateEmoteInput()) return;
        // Pas de tir tant qu'un panneau est ouvert (carte, paramètres, inventaire) OU si le joueur est K.O.
        if (!player.alive || player.dbno || player.phase !== 'ground' || hud.mapOpen || settingsOpen || inventoryUI.open) return;
        const held = player.inventory[player.slot];
        if (!held) return;
        if (held.kind === 'heal') {
            if (pressed) combat.startUse(player);
        } else if ((input.mouse.down || pressed) && !emoteWheelOpen) {
            // "pressed" aussi : un clic très court (relâché avant l'image) doit quand même tirer
            combat.tryFire(player, pressed);
        }
    }

    /* ----- Réanimation de coéquipier ----- */
    const revivePrompt = document.getElementById('revivePrompt');
    const reviveLabel = document.getElementById('reviveLabel');
    const reviveFill = document.getElementById('reviveFill');
    const interactPrompt = document.getElementById('interactPrompt');
    let reviving = null; // coéquipier qu'on est en train de réanimer

    function updateRevive(dt) {
        if (!player.alive || player.phase !== 'ground') {
            reviving = null;
            if (revivePrompt) revivePrompt.hidden = true;
            return;
        }

        // Si le joueur est lui-même K.O. :
        if (player.dbno) {
            reviving = null;
            // Multijoueur : la progression vient du coéquipier ; plus de nouvelles = il a lâché E
            if (isMultiplayer && performance.now() - reviveSeenAt > 400) player.reviveProgress = 0;
            if ((player.reviveProgress || 0) > 0) {
                if (revivePrompt) revivePrompt.hidden = false;
                if (reviveLabel) reviveLabel.textContent = 'UN COÉQUIPIER VOUS RÉANIME...';
                if (reviveFill) reviveFill.style.width = `${Math.min(100, Math.round(player.reviveProgress / 5 * 100))}%`;
            } else {
                if (revivePrompt) revivePrompt.hidden = true;
            }
            return;
        }

        // Le joueur est debout : chercher un allié K.O. à portée (<= 120 unités)
        const downed = fighters.find(f => f !== player && f.alive && f.dbno && f.team === player.team && Math.hypot(f.x - player.x, f.y - player.y) <= 120);

        if (downed) {
            const holdingE = input.keys?.has?.('KeyE') || input.keys?.has?.('KeyF');
            if (holdingE) {
                // Réanimation en cours : cacher complètement le prompt "Maintenir pour réanimer"
                if (interactPrompt) interactPrompt.hidden = true;
                if (revivePrompt) revivePrompt.hidden = false;
                if (reviveLabel) reviveLabel.textContent = `RÉANIMATION DE ${downed.name.toUpperCase()}...`;
                const done = combat.revive(player, downed, dt);
                reviving = done ? null : downed; // progression envoyée dans p_state (rv)
                if (reviveFill) reviveFill.style.width = `${Math.min(100, Math.round((downed.reviveProgress || 0) / 5 * 100))}%`;
                if (done) {
                    if (revivePrompt) revivePrompt.hidden = true;
                    if (interactPrompt) interactPrompt.hidden = true;
                    // Le joueur réanimé applique la réanimation chez lui (il en est le propriétaire)
                    if (isMultiplayer) netSend({ type: 'revive', t: downed.id });
                }
            } else {
                // Pas en train de maintenir E : afficher consigne
                reviving = null;
                if (downed.reviveProgress > 0) downed.reviveProgress = 0;
                if (revivePrompt) revivePrompt.hidden = true;
                if (interactPrompt) {
                    interactPrompt.hidden = false;
                    const keyEl = interactPrompt.querySelector('.drop-key');
                    const textEl = interactPrompt.querySelector('.interact-text');
                    if (keyEl) keyEl.textContent = 'E';
                    if (textEl) textEl.textContent = `Maintenir pour réanimer ${downed.name}`;
                }
            }
        } else {
            reviving = null;
            if (revivePrompt && !player.dbno) revivePrompt.hidden = true;
            if (interactPrompt && interactPrompt.querySelector('.interact-text')?.textContent?.includes('réanimer')) {
                interactPrompt.hidden = true;
            }
        }
    }

    /* ----- HUD d'Escouade (Duo / Trio / Section) ----- */
    const hudSquadEl = document.getElementById('hudSquad');
    const squadMembersEl = document.getElementById('squadMembers');
    const squadTitleEl = document.getElementById('squadTitle');
    const dbnoBannerEl = document.getElementById('dbnoBanner');
    const dbnoTimerEl = document.getElementById('dbnoTimer');
    const hotbarEl = document.getElementById('hotbar');
    const weaponInfoEl = document.getElementById('weaponInfo');

    if (teamMode && hudSquadEl) {
        hudSquadEl.hidden = false;
        if (squadTitleEl) {
            const modeNames = { 2: 'DUO', 3: 'TRIO', 4: 'SECTION' };
            squadTitleEl.textContent = modeNames[teamSize] || 'ESCOUADE';
        }
    }

    function updateSquadHud() {
        if (!teamMode || !squadMembersEl) return;

        // Bannière si le joueur est K.O. + désactivation visuelle de la hotbar / armes
        const isDbno = player.alive && !!player.dbno;
        if (isDbno) {
            if (dbnoBannerEl) {
                dbnoBannerEl.hidden = false;
                if (dbnoTimerEl) dbnoTimerEl.textContent = Math.ceil(player.dbnoTimer || 0);
            }
        } else {
            if (dbnoBannerEl) dbnoBannerEl.hidden = true;
        }
        if (hotbarEl) hotbarEl.classList.toggle('is-disabled', isDbno);
        if (weaponInfoEl) weaponInfoEl.classList.toggle('is-disabled', isDbno);

        // Membres de l'équipe (joueur + bots alliés)
        const squad = fighters.filter(f => f.team === player.team);
        const SQUAD_SLOT_COLORS = { 1: '#00e5ff', 2: '#ffd21e', 3: '#ff4fd8', 4: '#00ff88' };
        let html = '';
        for (const m of squad) {
            const isMe = m === player;
            const name = isMe ? `${m.name} (Vous)` : m.name;
            const isDbno = m.alive && m.dbno;
            const isDead = !m.alive;
            const statusClass = isDead ? 'is-dead' : isDbno ? 'is-dbno' : '';
            const statusText = isDead ? 'ÉLIMINÉ' : isDbno ? `K.O. ${Math.ceil(m.dbnoTimer || 0)}s` : 'OK';
            const statusBadgeClass = isDead ? 'squad-status-dead' : isDbno ? 'squad-status-dbno' : 'squad-status-ok';
            const memberCol = SQUAD_SLOT_COLORS[m.squadSlot || (isMe ? 1 : 2)] || '#00e5ff';

            const hpPct = Math.max(0, Math.min(100, Math.round(m.health)));
            const shPct = Math.max(0, Math.min(100, Math.round(m.shield)));

            html += `
                <div class="squad-member ${statusClass}">
                    <div class="squad-member-head">
                        <span style="display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;">
                            <span class="squad-dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${memberCol};box-shadow:0 0 6px ${memberCol};flex-shrink:0;"></span>
                            <span class="squad-member-name" title="${name}">${name}</span>
                        </span>
                        <span class="squad-member-status ${statusBadgeClass}">${statusText}</span>
                    </div>
                    <div class="squad-bars">
                        ${!isDead && shPct > 0 ? `<div class="squad-bar"><div class="squad-bar-fill shield" style="width: ${shPct}%"></div></div>` : ''}
                        ${!isDead ? `<div class="squad-bar"><div class="squad-bar-fill health" style="width: ${hpPct}%"></div></div>` : ''}
                    </div>
                </div>
            `;
        }
        squadMembersEl.innerHTML = html;
    }

    /* ----- Petits effets liés aux personnages (atterrissage, pas, soins) ----- */
    function fighterEffects(dt) {
        for (const f of fighters) {
            if (f.hitFlash > 0) f.hitFlash = Math.max(0, f.hitFlash - dt * 5);
            if (!f.alive) continue;

            // Saut du vaisseau (joueur)
            if (f === player && f._prevPhase === 'ship' && f.phase === 'air') SFX.play('jump', { x: f.x, y: f.y });

            // Ouverture du planeur : l'altitude passe sous le seuil
            if (f.phase === 'air') {
                const alt = f.altitude ?? 1;
                if ((f._prevAlt ?? 1) >= GLIDER_ALT && alt < GLIDER_ALT) SFX.play('glider', { x: f.x, y: f.y });
                f._prevAlt = alt;
            }

            // Glissade sur un toit : tuiles qui sautent + bruit de pas sur les tuiles
            const slide = f.roofSlide;
            if (slide) {
                f._slideT = (f._slideT || 0) + dt;
                if (slide.stage === 0 && f._slideT > 0.05) {
                    f._slideT = 0;
                    effects.roofDebris(f.x - Math.cos(slide.dir) * f.r * 0.6, f.y - Math.sin(slide.dir) * f.r * 0.6,
                        slide.color, slide.dir, 2);
                    if ((f._slideSteps = (f._slideSteps || 0) + 1) % 2 === 0) {
                        SFX.play('step', { x: f.x, y: f.y, surface: 'tile', vol: f === player ? 0.9 : 0.5 });
                    }
                }
                if (slide.stage === 1 && !f._slideJumped) {
                    f._slideJumped = true; // départ du bord : gerbe de tuiles
                    effects.roofDebris(f.x, f.y, slide.color, slide.dir, 7);
                }
            } else if (f._slideJumped) {
                f._slideJumped = false;
            }

            // Atterrissage : nuage de poussière (et petite secousse pour le joueur)
            if (f._prevPhase === 'air' && f.phase === 'ground') {
                effects.landing(f.x, f.y);
                SFX.play('land', { x: f.x, y: f.y });
                if (f === player) renderer.shake(6);
            }
            f._prevPhase = f.phase;
            if (f.phase !== 'ground') continue;

            // Pas : poussière sur la terre, ondulations dans l'eau
            if (f.moving) {
                f._stepT = (f._stepT || 0) + dt;
                if (f._stepT > STEP_TIME) {
                    f._stepT = 0;
                    effects.footstep(f.x - Math.cos(f.angle) * 10, f.y - Math.sin(f.angle) * 10, f.inWater);
                    // Le son dépend du sol : bois, carrelage, pierre, terre, sable, neige, herbe...
                    const surface = f.inWater ? 'water' : surfaceAt(world, f.x, f.y);
                    SFX.play('step', { x: f.x, y: f.y, water: f.inWater, surface, vol: f === player ? 0.8 : 0.55 });
                }
            }

            // Soin en cours : petits "+" qui montent
            if (f.usingItem) {
                f._healT = (f._healT || 0) + dt;
                if (f._healT > 0.28) {
                    f._healT = 0;
                    const it = f.inventory[f.usingItem.slot];
                    const shield = (HEALS[it?.itemId]?.shield || 0) > 0;
                    if (roofAlphaAt(world, f.x, f.y) <= 0.5) effects.healTick(f.x, f.y, shield);
                    SFX.play('healTick', { x: f.x, y: f.y, shield });
                }
            }
        }

        // Chiffres de dégâts (un par cible et par image), jaunes et plus gros si ça fait mal
        for (const [victim, d] of pendingDamage) {
            effects.damageNumber(victim.x, victim.y - victim.r - 14, d.amount, d.shield, d.amount >= 50);
        }
        pendingDamage.clear();

        for (const c of corpses) c.t += dt / DEATH_TIME;
        while (corpses.length && corpses[0].t >= 1) corpses.shift();
        if (hitmarker.t > 0) hitmarker.t = Math.max(0, hitmarker.t - dt * 4);
    }

    /* ----- Fin de partie ----- */
    function checkEnd() {
        if (gameOver) return;

        if (teamMode) {
            const teamAlive = fighters.filter(f => f.alive && f.team === player.team);
            const allStandingInTeam = teamAlive.filter(f => !f.dbno);
            const otherTeamsAlive = fighters.filter(f => f.alive && f.team !== player.team);

            // Dès que le joueur meurt (éliminé), afficher l'écran de mort avec la possibilité
            // de cliquer sur "Regarder la partie" (ou Échap) pour suivre son coéquipier
            if (!player.alive && !playerDeathShown) {
                playerDeathShown = true;
                const remainingFighters = fighters.filter(f => f.alive).length;
                stats.place = remainingFighters + 1;
                if (stats.endT === null) stats.endT = time;
                const target = allStandingInTeam[0] || teamAlive[0] || stats.killer;
                if (target) {
                    setTimeout(() => {
                        if (!spectator.active) spectator.start(target);
                        if (target.alive) spectator.target = target;
                    }, SPECTATE_DELAY);
                }
                setTimeout(() => {
                    SFX.play('defeat');
                    endScreen.show(endResult(false));
                }, DEFEAT_DELAY);
            }

            // Si le joueur est mort mais que l'escouade est toujours en jeu : spectateur sur un coéquipier
            if (!player.alive && allStandingInTeam.length > 0) {
                if (!spectator.active) {
                    spectator.start(allStandingInTeam[0]);
                }
                if (!spectator.target || !spectator.target.alive) {
                    spectator.target = allStandingInTeam[0];
                }
            }

            // Escouade du joueur complètement éliminée
            if (teamAlive.length === 0) {
                gameOver = true;
                const remainingFighters = fighters.filter(f => f.alive).length;
                stats.place = remainingFighters + 1;
                if (stats.endT === null) stats.endT = time;
                if (!playerDeathShown) {
                    playerDeathShown = true;
                    setTimeout(() => spectator.start(stats.killer), SPECTATE_DELAY);
                    setTimeout(() => {
                        SFX.play('defeat');
                        endScreen.show(endResult(false));
                    }, DEFEAT_DELAY);
                }
                return;
            }

            // Victoire Royale ! Tous les ennemis sont éliminés
            if (otherTeamsAlive.length === 0) {
                gameOver = true;
                stats.place = 1;
                stats.endT = time;
                setTimeout(() => {
                    SFX.play('victory');
                    if (endScreen.shown) {
                        endScreen.result.win = true;
                        endScreen.result.place = 1;
                        if (endScreen.el.kicker) endScreen.el.kicker.textContent = `Dernier debout sur ${fighters.length}`;
                        if (endScreen.el.title) endScreen.el.title.textContent = 'Victoire Royale';
                        if (endScreen.el.placeNum) endScreen.el.placeNum.textContent = '#1';
                        endScreen.root.classList.add('is-win');
                        endScreen.root.classList.remove('is-lost');
                        endScreen.open();
                    } else {
                        endScreen.show(endResult(true));
                    }
                }, VICTORY_DELAY);
                return;
            }
        } else {
            const alive = fighters.filter(f => f.alive).length;
            if (!player.alive) {
                gameOver = true;
                stats.place = alive + 1;
                if (stats.endT === null) stats.endT = time;
                // La caméra passe sur le tueur, puis l'écran de fin s'affiche par-dessus
                setTimeout(() => spectator.start(stats.killer), SPECTATE_DELAY);
                setTimeout(() => {
                    SFX.play('defeat');
                    endScreen.show(endResult(false));
                }, DEFEAT_DELAY);
            } else if (alive === 1) {
                gameOver = true;
                stats.place = 1;
                stats.endT = time;
                setTimeout(() => {
                    SFX.play('victory');
                    endScreen.show(endResult(true));
                }, VICTORY_DELAY);
            }
        }
    }

    // Données affichées par l'écran de fin
    function endResult(win) {
        return {
            win,
            place: stats.place,
            total: fighters.length,
            kills: player.kills,
            damage: Math.round(stats.damage),
            chests: stats.chests,
            // Depuis l'atterrissage (ou depuis le début si on n'a jamais atterri)
            survival: Math.max(0, (stats.endT ?? time) - (stats.startT ?? 0)),
            killerName: stats.killerName,
            byCorruption: stats.byCorruption,
            weaponId: stats.weaponId,
            weaponRarity: stats.weaponRarity,
            weaponSkin: stats.weaponSkin || ''
        };
    }

    /* ----- Sons d'ambiance (vaisseau, vent, compte à rebours, cœur, coffres, oiseaux) ----- */
    let prevCanJump = false;
    let lastTick = -1;
    let heartT = 0;
    let humT = 0;
    let birdT = 5 + Math.random() * 7;

    // view : celui que suit la caméra (le joueur, ou la cible du spectateur)
    function updateAudio(dt, view = player) {
        audioView = view;
        SFX.setListener(view.x, view.y);

        // Moteur du vaisseau : plein dedans, puis de plus en plus loin
        let ship = 0;
        if (player.phase === 'ship') ship = 1;
        else if (drop.ship.active) {
            const d = Math.hypot(player.x - drop.ship.x, player.y - drop.ship.y);
            ship = Math.max(0, 1 - d / SHIP_HEAR_DIST) * 0.8;
        }
        SFX.setLoop('ship', ship);

        // Vent : fort en chute libre, plus doux sous le planeur
        const wind = player.alive && player.phase === 'air' ? (player.altitude > GLIDER_ALT ? 1 : 0.45) : 0;
        SFX.setLoop('wind', wind);

        // Grondement de la corruption : plus fort quand on s'y enfonce
        let corrupt = 0;
        if (player.alive && player.phase !== 'ship' && !corruption.isSafe(player.x, player.y)) {
            corrupt = 0.6 + 0.4 * Math.min(1, corruption.depth(player.x, player.y) / 600);
        }
        SFX.setLoop('corruption', corrupt);

        // Compte à rebours avant le saut automatique
        const canJump = drop.canJump;
        if (player.phase === 'ship' && canJump) {
            if (!prevCanJump) SFX.play('jumpReady');
            const s = Math.ceil(drop.timeLeft);
            if (s <= 5 && s !== lastTick) SFX.play('tick', { final: s <= 1 });
            lastTick = s;
        }
        prevCanJump = canJump;

        const onGround = player.alive && player.phase === 'ground';

        // Battement de cœur quand la vie est basse
        if (onGround && player.health < LOW_HEALTH) {
            heartT -= dt;
            if (heartT <= 0) {
                heartT = HEARTBEAT_TIME;
                SFX.play('heartbeat');
            }
        } else {
            heartT = 0; // le premier battement part tout de suite
        }

        if (!onGround) return;

        // Bourdonnement du coffre fermé le plus proche
        humT -= dt;
        if (humT <= 0) {
            humT = CHEST_HUM_TIME;
            let best = null;
            let bestD = CHEST_HUM_RANGE;
            for (const c of loot.chests) {
                if (c.opened) continue;
                const d = Math.hypot(c.x - view.x, c.y - view.y);
                if (d < bestD) {
                    bestD = d;
                    best = c;
                }
            }
            if (best) SFX.play('chestHum', { x: best.x, y: best.y, muffle: chestMuffle(best) });
        }

        // Oiseaux de temps en temps
        birdT -= dt;
        if (birdT <= 0) {
            birdT = 5 + Math.random() * 7;
            SFX.play('bird', { vol: 0.6 });
        }
    }

    // Croix blanche (rouge si élimination) autour du viseur quand on touche
    function drawHitmarker(ctx) {
        if (hitmarker.t <= 0 || !player.alive) return;
        const aim = renderer.screenToWorld(input.mouse.x, input.mouse.y);
        const k = hitmarker.t;
        const z = 1 / renderer.zoom;           // taille constante à l'écran
        const gap = (6 + (1 - k) * 6) * z;
        const len = (8 + k * 4) * z;
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            ctx.moveTo(aim.x + dx * gap, aim.y + dy * gap);
            ctx.lineTo(aim.x + dx * (gap + len), aim.y + dy * (gap + len));
        }
        ctx.strokeStyle = 'rgba(10, 16, 48, 0.8)';
        ctx.lineWidth = 6 * z;
        ctx.stroke();
        ctx.strokeStyle = hitmarker.kill ? '#ff5470' : '#ffffff';
        ctx.lineWidth = 3 * z;
        ctx.stroke();
        ctx.restore();
    }

    /* ----- Indicateurs de coéquipiers hors écran ----- */
    function drawTeammateOffscreen(ctx) {
        if (!teamMode || !player.alive) return;
        const teammates = fighters.filter(f => f !== player && f.alive && f.team === player.team);
        if (!teammates.length) return;

        const sw = renderer.cssW;
        const sh = renderer.cssH;
        const margin = 55;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Repère écran en pixels réels

        for (const mate of teammates) {
            const sPos = renderer.worldToScreen(mate.x, mate.y);
            const onScreen = sPos.x >= margin && sPos.x <= sw - margin &&
                             sPos.y >= margin && sPos.y <= sh - margin;
            if (onScreen) continue; // Déjà visible à l'écran

            const cx = sw / 2;
            const cy = sh / 2;
            const angle = Math.atan2(sPos.y - cy, sPos.x - cx);
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);

            const halfW = sw / 2 - margin;
            const halfH = sh / 2 - margin;
            const scaleX = halfW / Math.max(0.0001, Math.abs(dx));
            const scaleY = halfH / Math.max(0.0001, Math.abs(dy));
            const scale = Math.min(scaleX, scaleY);
            const px = cx + dx * scale;
            const py = cy + dy * scale;

            const distM = Math.round(Math.hypot(mate.x - player.x, mate.y - player.y) / 40);
            const isDbno = mate.dbno;
            const SQUAD_SLOT_COLORS = { 1: '#00e5ff', 2: '#ffd21e', 3: '#ff4fd8', 4: '#00ff88' };
            const teamCol = SQUAD_SLOT_COLORS[mate.squadSlot || 2] || '#ffd21e';
            const col = isDbno ? '#ff334b' : teamCol;

            ctx.save();
            ctx.translate(px, py);

            // Flèche pointant vers le coéquipier
            ctx.save();
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(14, 0);
            ctx.lineTo(-8, -8);
            ctx.lineTo(-4, 0);
            ctx.lineTo(-8, 8);
            ctx.closePath();
            ctx.fillStyle = col;
            ctx.fill();
            ctx.strokeStyle = '#0a1030';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();

            // Badge d'information
            const badgeText = isDbno ? `⚠ ${mate.name} (${Math.ceil(mate.dbnoTimer)}s)` : `${mate.name} ${distM}m`;
            ctx.font = 'bold 12px Rubik, sans-serif';
            const txtWidth = ctx.measureText(badgeText).width;
            const bw = txtWidth + 16;
            const bh = 22;

            const badgeX = -dx * 32 - bw / 2;
            const badgeY = -dy * 32 - bh / 2;

            ctx.fillStyle = 'rgba(10, 16, 40, 0.88)';
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, bw, bh, 6);
            ctx.fill();
            ctx.strokeStyle = col;
            ctx.lineWidth = 1.8;
            ctx.stroke();

            ctx.fillStyle = col;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(badgeText, badgeX + bw / 2, badgeY + bh / 2);

            ctx.restore();
        }
        ctx.restore();
    }

    /* ----- Indicateurs et noms des coéquipiers réels au-dessus de leur tête ----- */
    function drawRemoteTeammateLabels(ctx, v, time = 0) {
        if (!teamMode) return;
        const SQUAD_COLORS = { 1: '#00e5ff', 2: '#ffd21e', 3: '#ff4fd8', 4: '#00ff88' };
        const m = 50;
        for (const mate of remotePlayersMap.values()) {
            if (!mate.alive || mate.phase !== 'ground') continue;
            if (v && (mate.x < v.minX - m || mate.x > v.maxX + m || mate.y < v.minY - m || mate.y > v.maxY + m)) continue;
            const roofA = roofAlphaAt(world, mate.x, mate.y);
            if (roofA > 0.9) continue;

            ctx.save();
            ctx.globalAlpha = 1 - roofA;
            const col = SQUAD_COLORS[mate.squadSlot || 2] || '#ffd21e';
            const healthY = mate.y - mate.r - 17;
            const shieldY = healthY - 6;

            // Flèche ▼ animée
            const bob = Math.sin((time || 0) * 6) * 4;
            const arrowTipY = shieldY - 24 + bob;
            ctx.beginPath();
            ctx.moveTo(mate.x, arrowTipY);
            ctx.lineTo(mate.x - 9, arrowTipY - 14);
            ctx.lineTo(mate.x + 9, arrowTipY - 14);
            ctx.closePath();
            ctx.fillStyle = mate.dbno ? '#ff334b' : col;
            ctx.fill();
            ctx.strokeStyle = '#0a1030';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Nom du coéquipier
            ctx.font = 'bold 14px Rubik, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.strokeStyle = '#0a1030';
            ctx.lineWidth = 4;
            ctx.strokeText(mate.name, mate.x, arrowTipY - 6);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(mate.name, mate.x, arrowTipY - 6);

            // Barre de vie / bouclier
            const W = 46;
            const H = 4;
            const bx = mate.x - W / 2;
            ctx.fillStyle = '#0a1030';
            ctx.fillRect(bx - 1, healthY - 1, W + 2, H + 2);
            ctx.fillStyle = mate.dbno ? '#ff334b' : '#00e5ff';
            ctx.fillRect(bx, healthY, Math.max(0, (mate.health / 100) * W), H);

            if (mate.shield > 0) {
                ctx.fillStyle = '#0a1030';
                ctx.fillRect(bx - 1, shieldY - 1, W + 2, H + 2);
                ctx.fillStyle = '#3a8dff';
                ctx.fillRect(bx, shieldY, Math.max(0, (mate.shield / 100) * W), H);
            }

            ctx.restore();
        }
    }

    /* ----- Dessins en plus de la carte ----- */
    const hooks = {
        under: (ctx, v) => {
            loot.draw(ctx, time, v);
            effects.drawGround(ctx, v);
        },
        entities: (ctx, v) => {
            for (const c of corpses) drawDying(ctx, c, time);
            for (const f of fighters) {
                if (!f.alive || f.phase !== 'ground') continue;
                if (f.x < v.minX - 80 || f.x > v.maxX + 80 || f.y < v.minY - 80 || f.y > v.maxY + 80) continue;
                drawPlayer(ctx, f, time);
            }
            combat.draw(ctx);
        },
        overlay: (ctx, v) => {
            corruption.drawWorld(ctx, v, time); // au-dessus du sol et des toits, sous le vaisseau et les chutes
            drawSkyHaze(ctx, v);          // voile d'altitude : le sol paraît lointain depuis le ciel
            bots.drawAir(ctx, time, v);   // culling fait dans drawFalling (position en perspective)
            if (isMultiplayer) {
                for (const mate of remotePlayersMap.values()) {
                    if (mate.alive && mate.phase === 'air') drawFalling(ctx, mate, time);
                }
            }
            drop.draw(ctx, player, time);
            effects.drawTop(ctx, v);
            bots.drawLabels(ctx, v, time);
            if (isMultiplayer) drawRemoteTeammateLabels(ctx, v, time);
            drawTeammateOffscreen(ctx);
            drawHitmarker(ctx);
        }
    };

    // Altimètre : reste juste sous le planeur quel que soit le zoom
    const altMeterEl = document.getElementById('altMeter');
    let lastAltOffset = -1;
    let camGap = 1; // distance caméra -> ce qu'elle suit (1 = normal, plus proche en chute)

    let last = performance.now();
    let time = 0;

    const STEP = 0.05;          // pas de simulation maximal (s)
    /*
       Horloge commune (multijoueur) : le serveur donne à chaque page l'heure de départ du
       vaisseau (room_joined.clock = ms écoulées depuis le départ, négatif avant). Chaque
       machine simule exactement jusqu'à cette heure : une page restée en arrière-plan ou
       arrivée en retard RATTRAPE le temps perdu (au lieu de repartir de son ancien état et
       de faire reculer les autres). En solo, un gel met simplement le jeu en pause.
    */
    const MAX_CATCHUP = 180;    // au plus 3 min rattrapées d'un coup (au-delà : on saute)
    let clockBase = null;       // performance.now() au départ du vaisseau (null = pas encore connu)
    let simClock = 0;           // secondes simulées depuis le départ
    function setGameClock(msSinceFlight) {
        if (!Number.isFinite(msSinceFlight)) return;
        const base = performance.now() - msSinceFlight;
        if (clockBase === null || Math.abs(base - clockBase) > 400) clockBase = base;
    }
    // Serveur muet (ancien serveur, coupure) : on ne bloque pas la partie
    if (isMultiplayer) setTimeout(() => { if (clockBase === null) clockBase = performance.now(); }, 10000);

    // Petit compte à rebours avant le départ du vaisseau (le temps que tout le monde charge)
    let waitEl = null;
    function showFlightWait(sec) {
        if (sec === null) {
            waitEl?.remove();
            waitEl = null;
            return;
        }
        if (!waitEl) {
            waitEl = document.createElement('div');
            waitEl.setAttribute('role', 'status');
            waitEl.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:30;' +
                'padding:10px 22px;border-radius:8px;background:rgba(4,10,32,.8);border:2px solid #ffe03d;' +
                'color:#fff;font:400 26px "Bebas Neue",Impact,sans-serif;letter-spacing:2px;pointer-events:none';
            document.body.appendChild(waitEl);
        }
        const txt = sec > 0 ? `Départ du vaisseau dans ${sec}…` : 'En attente des autres joueurs…';
        if (waitEl.textContent !== txt) waitEl.textContent = txt;
    }

    /* ----- Envois réseau périodiques ----- */
    function netTick(now) {
        // Rien à envoyer tant que l'heure de la partie n'est pas connue (état pas encore à jour)
        if (!netOpen() || clockBase === null) return;

        // Notre joueur (20 / s)
        if (now - lastNetSync > 50) {
            lastNetSync = now;
            netSend({
                type: 'p_state',
                n: player.name, ss: player.squadSlot, tm: player.team,
                x: Math.round(player.x * 10) / 10,
                y: Math.round(player.y * 10) / 10,
                vx: Math.round(player.vx || 0),
                vy: Math.round(player.vy || 0),
                a: Math.round(player.angle * 1000) / 1000,
                ph: player.phase,
                alt: Math.round((player.altitude || 0) * 100) / 100,
                hp: Math.round(player.health * 10) / 10,
                sh: Math.round(player.shield * 10) / 10,
                sl: player.slot,
                inv: player.inventory.map(netItem),
                db: !!player.dbno,
                dt: Math.round((player.dbnoTimer || 0) * 10) / 10,
                al: player.alive,
                use: !!player.usingItem,
                rv: reviving ? [reviving.id, Math.round((reviving.reviveProgress || 0) * 100) / 100] : null
            });
        }
        if (!isHost) return;

        // Bots (10 / s) : tous les vivants (un bot absent = mort chez l'hôte)
        if (now - lastBotSync > 100) {
            lastBotSync = now;
            const list = [];
            for (const b of bots.bots) {
                if (!b.alive) continue;
                const held = b.inventory?.[b.slot || 0];
                list.push([
                    b.id, Math.round(b.x), Math.round(b.y), Math.round(b.angle * 100) / 100,
                    Math.round(b.health), Math.round(b.shield), b.phase, b.dbno ? 1 : 0,
                    Math.round((b.altitude || 0) * 100) / 100,
                    held?.kind === 'weapon' ? held.weaponId : '', held?.rarity || 0
                ]);
            }
            netSend({ type: 'b_sync', bots: list });
        }

        // Vaisseau + corruption (1 / s) : les autres s'y recalent
        if (now - lastWorldSync > 1000) {
            lastWorldSync = now;
            netSend({
                type: 'world_sync',
                c: corruption.state === 'idle' ? -1 : Math.round(corruption.elapsed * 1000) / 1000,
                d: Math.round(drop.dist)
            });
        }
    }

    /* ----- Une étape de simulation (dt <= STEP) ----- */
    // Avant le départ du vaisseau : tout le monde attend à bord (rien ne bouge)
    function waitOnBoard(dt) {
        time += dt;
        fighterEffects(dt);
        effects.update(dt);
    }

    function simulate(dt, withInput) {
        time += dt;
        const aim = renderer.screenToWorld(input.mouse.x, input.mouse.y);
        drop.update(dt, player, input, aim.x, aim.y);

        // Éjection automatique (forcée) après l'affichage de 0 s, ou si le vaisseau a disparu
        if (player.phase === 'ship' && (drop.dist >= drop.autoJumpAt || !drop.ship.active)) drop.jump(player, true);

        // Corruption : démarrée par l'hôte (les autres se calent sur world_sync)
        if (corruption.state === 'idle' && isHost && (!drop.ship.active || player.phase === 'ground' ||
            (isMultiplayer && bots.bots.every(b => b.phase !== 'ship')))) {
            corruption.start();
            lastWorldSync = 0; // annonce tout de suite
        }

        // Joueurs distants : on glisse vers la dernière position reçue
        if (isMultiplayer) {
            const k = Math.min(1, dt * 15);
            for (const mate of remotePlayersMap.values()) {
                if (!mate.alive) continue;
                if (mate.phase === 'ship') {
                    mate.x = drop.ship.x;
                    mate.y = drop.ship.y;
                    mate.angle = drop.angle;
                    continue;
                }
                if (Number.isFinite(mate._targetX)) {
                    const dx = mate._targetX - mate.x;
                    const dy = mate._targetY - mate.y;
                    if (dx * dx + dy * dy > 400 * 400) {
                        mate.x = mate._targetX;
                        mate.y = mate._targetY;
                    } else {
                        // Petite avance avec la vitesse reçue : moins de retard à l'écran
                        mate.x += dx * k + (mate.vx || 0) * dt * 0.5;
                        mate.y += dy * k + (mate.vy || 0) * dt * 0.5;
                    }
                }
                if (Number.isFinite(mate._targetAngle)) {
                    let da = mate._targetAngle - mate.angle;
                    if (da > Math.PI) da -= Math.PI * 2;
                    if (da < -Math.PI) da += Math.PI * 2;
                    mate.angle += da * k;
                }
                if (Number.isFinite(mate._targetAlt)) mate.altitude += (mate._targetAlt - (mate.altitude || 0)) * k;
                if (mate.moving) mate.walkTime = (mate.walkTime || 0) + dt;
            }
        }

        if (player.phase === 'ground' && player.alive) {
            player.update(dt, input, world, aim.x, aim.y);
            // Munitions ramassées en passant dessus (désactivable dans les paramètres)
            if (Settings.get('autoAmmo')) loot.autoPickupAmmo(player);
            if (withInput) playerActions();
        }
        bots.update(dt, time);
        combat.update(dt);
        corruption.update(dt, fighters, combat);
        loot.update(dt);
        fighterEffects(dt);
        effects.update(dt);
        if (stats.startT === null && player.phase === 'ground') stats.startT = time; // atterrissage
        updateRevive(dt);
        checkEnd();
    }

    // Avance le jeu jusqu'à "now" ; render = false quand l'onglet est caché
    // Simule "total" secondes en petits pas ; renvoie la durée du dernier pas
    function advance(total, render) {
        // Gros retard (onglet en arrière-plan) : pas un peu plus grands pour rattraper vite
        const step = total > 3 ? 0.1 : STEP;
        // Rattrapage de plus d'1 s : sans les sons (sinon des dizaines de tirs d'un coup)
        const quiet = total > 1;
        const play = SFX.play;
        if (quiet) SFX.play = () => {};
        let dt = 0;
        let first = true;
        try {
            while (total > 1e-6) {
                dt = Math.min(step, total);
                simulate(dt, first && render);
                first = false;
                total -= dt;
            }
        } finally {
            if (quiet) SFX.play = play;
        }
        return dt;
    }

    function tick(now, render) {
        const real = Math.max(0, (now - last) / 1000);
        last = now;
        let dt = Math.min(STEP, real);
        if (!isMultiplayer) {
            // Solo : un gel (onglet caché) met le jeu en pause
            advance(dt, render);
        } else if (clockBase === null || now < clockBase) {
            // Le vaisseau n'est pas encore parti (ou l'heure n'est pas encore connue)
            waitOnBoard(dt);
            showFlightWait(clockBase === null ? 0 : Math.ceil((clockBase - now) / 1000));
        } else {
            if (waitEl) showFlightWait(null);
            let behind = (now - clockBase) / 1000 - simClock;
            if (behind > MAX_CATCHUP) {
                // Trop loin derrière : le vaisseau et la corruption se recaleront sur l'hôte
                simClock += behind - MAX_CATCHUP;
                behind = MAX_CATCHUP;
            }
            if (behind > 0) {
                dt = advance(behind, render);
                simClock += behind;
            } else {
                dt = 0; // en avance (heure corrigée) : on attend que l'horloge nous rattrape
            }
        }
        flushLootSpawns();
        netTick(now);
        if (!render) return;

        updateSquadHud();
        // Spectateur : la caméra, le son et les feuillages / toits suivent la cible
        const watched = spectator.update() || player;
        updateAudio(dt, watched);

        // Caméra en perspective : elle reste à distance normale au-dessus de ce qu'elle suit
        // (vaisseau puis joueur). Plus on est haut, plus le sol est loin et la carte petite ;
        // le vaisseau et le joueur, eux, gardent leur taille. En descendant, la carte
        // grossit de plus en plus vite (comme une vraie approche du sol).
        // Au saut, la caméra plonge vers le joueur (distance 1 -> 0,7) en ~1 s.
        if (player.phase === 'ship') camGap = 1;
        else camGap += (fallCameraGap(player.phase === 'air' ? player.altitude : 0) - camGap) * Math.min(1, dt * 3);
        const followH = player.phase === 'ship' ? SHIP_HEIGHT : player.phase === 'air' ? fallHeight(player.altitude) : 0;
        renderer.setFlightView(1 / (followH + camGap), dt, true);
        renderer.follow(player.phase === 'ship' ? drop.ship : watched, dt);
        renderer.render(watched, dt, time, hooks);
        updateEmoteBubbles(dt);
        if (player.phase === 'air' && altMeterEl) {
            // Écart en pixels d'écran, ramené à l'échelle du HUD agrandi (--hud-zoom)
            const hz = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-zoom')) || 1;
            // Taille réelle du joueur à l'écran = échelle du sol x agrandissement de perspective
            const camH = 1 / (renderer.flightMul ?? 1);
            const k = camH / Math.max(0.3, camH - fallHeight(player.altitude));
            const off = Math.round((renderer.zoom * k * 120 + 12) / hz);
            if (off !== lastAltOffset) {
                lastAltOffset = off;
                altMeterEl.style.setProperty('--alt-offset', `${off}px`);
            }
        }
        hud.update(dt, time);
        inventoryUI.update();
        combatHud.update(dt);
    }

    // Une erreur dans une image ne doit jamais arrêter le jeu (sinon tout se fige)
    let lastErrorAt = 0;
    function safeTick(now, render) {
        try {
            tick(now, render);
        } catch (err) {
            if (performance.now() - lastErrorAt > 2000) {
                lastErrorAt = performance.now();
                console.error('[Jeu] Erreur pendant une image (le jeu continue)', err);
            }
        }
    }

    function frame(now) {
        safeTick(now, true);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    /*
       Onglet caché en multijoueur : le navigateur coupe requestAnimationFrame et ralentit
       fortement les minuteurs de la page, mais pas ceux d'un « worker ». Un petit worker
       nous réveille 10 fois par seconde : la partie continue (et l'hôte fait toujours vivre
       les bots pour les autres). En cas d'échec, simple minuteur.
    */
    if (isMultiplayer) {
        const hiddenTick = () => { if (document.hidden) safeTick(performance.now(), false); };
        try {
            const src = 'setInterval(function () { postMessage(0); }, 100);';
            const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
            worker.onmessage = hiddenTick;
        } catch {
            setInterval(hiddenTick, 250);
        }
    }

    // Accès depuis la console du navigateur pour tester (ex : FOR2D_GAME.player.x = 1500)
    window.FOR2D_GAME = {
        world, player, renderer, hud, drop, loot, combat, bots, fighters, effects, corruption, SFX,
        endScreen, spectator, stats
    };
}

// Icônes SVG du HUD (emplacements data-icon de game.html), posées tout de suite
mountHudIcons();

// On laisse l'écran de chargement s'afficher avant la génération (qui bloque un court instant).
// Onglet en arrière-plan : requestAnimationFrame ne se déclenche pas, on démarre quand même
// (sinon le joueur rejoindrait la partie seulement en revenant sur la page).
if (document.hidden) setTimeout(start, 0);
else requestAnimationFrame(() => setTimeout(start, 50));
