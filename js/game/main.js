/* ==================================
   POINT D'ENTRÉE DU JEU - FOR2D ROYAL
   Carte, vaisseau, joueur, bots, coffres, armes, effets et HUD.
   ================================== */

import { generateWorld } from './world.js?v=6';
import { Player } from './player.js?v=6';
import { Renderer } from './renderer.js?v=6';
import { Hud } from './hud.js?v=6';
import { Input } from './input.js?v=6';
import { Drop, drawFalling } from './drop.js?v=6';
import { Combat } from './combat.js?v=6';
import { Loot } from './loot.js?v=6';
import { BotManager, roofAlphaAt } from './bots.js?v=6';
import { Corruption } from './corruption.js?v=7';
import { CombatHud } from './combat-hud.js?v=7';
import { Effects } from './effects.js?v=7';
import { HEALS } from './weapons.js?v=7';
import { drawPlayer, drawDying } from './draw.js?v=7';
import { SFX } from '../sfx.js?v=7';
import { Settings } from '../settings.js?v=7';
import { Cosmetics } from '../cosmetics.js?v=7';
import { InventoryUI } from './inventory-ui.js?v=7';
import { EndScreen, Spectator } from './end-screen.js?v=7';
import { mountHudIcons, setHudIcon } from './hud-icons.js?v=7';

const BOT_COUNT = 24;
const DEATH_TIME = 0.7;  // durée de l'animation de mort (s)
const SPECTATE_DELAY = 1200; // ms après la mort : la caméra passe sur le tueur
const DEFEAT_DELAY = 1400;   // ms après la mort : écran de fin
const VICTORY_DELAY = 900;
const STEP_TIME = 0.3;   // un nuage de poussière tous les 0,3 s en marchant

// Sons
const GLIDER_ALT = 0.45;       // le planeur s'ouvre sous cette altitude (voir drop.js)
const SHIP_HEAR_DIST = 2500;   // on entend le vaisseau jusqu'à cette distance
const HEARTBEAT_TIME = 0.95;   // un battement de cœur toutes les 0,95 s quand la vie est basse
const LOW_HEALTH = 30;
const CHEST_HUM_TIME = 1.2;    // bourdonnement du coffre le plus proche
const CHEST_HUM_RANGE = 700;
const BOT_VOL = 0.7;           // sons d'action des bots un peu moins forts

// Secousse de caméra quand le joueur tire, selon l'arme
const FIRE_SHAKE = { pistol: 1.5, smg: 1.2, ar: 2, shotgun: 6, sniper: 8 };

function start() {
    let gameConfig = { mode: 'solo', modeName: 'SOLO', teamSize: 1, bots: true };
    try {
        const stored = localStorage.getItem('for2d-game-mode');
        if (stored) gameConfig = { ...gameConfig, ...JSON.parse(stored) };
    } catch { /* config par défaut */ }

    // Règle de cohérence stricte : déduire teamSize si mode est duo/trio/section
    const m = (gameConfig.mode || gameConfig.modeName || '').toLowerCase();
    if (m.includes('duo')) gameConfig.teamSize = 2;
    else if (m.includes('trio')) gameConfig.teamSize = 3;
    else if (m.includes('section') || m.includes('escouade')) gameConfig.teamSize = 4;
    else if (!gameConfig.teamSize) gameConfig.teamSize = 1;

    const teamSize = gameConfig.teamSize;
    const teamMode = teamSize > 1;

    const world = generateWorld();
    const loot = new Loot(world); // coffres (ajoutés aux obstacles) + butin au sol
    const effects = new Effects();

    // Départ dans le vaisseau (trajet synchronisé par la graine en multijoueur)
    const drop = new Drop(gameConfig.seed);
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
        if (pack && pack.color && !pack.none) player.colors.pack = pack.color;
        const glider = Cosmetics.equippedOf('glider');
        if (glider && Array.isArray(glider.colors)) player.gliderColors = glider.colors;
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
    const isMultiplayer = Boolean(gameConfig.isMultiplayer && gameConfig.roomCode);
    const remotePlayersMap = new Map();
    if (isMultiplayer && Array.isArray(gameConfig.roomPlayers)) {
        for (const rp of gameConfig.roomPlayers) {
            if (rp.id && rp.id !== gameConfig.myPlayerId) {
                const mate = new Player(drop.ship.x, drop.ship.y);
                mate.id = rp.id;
                mate.name = rp.name || 'Coéquipier';
                mate.team = 1;
                mate.squadSlot = rp.slot || 2;
                mate.isRemote = true;
                mate.phase = 'ship';
                if (rp.skin && rp.skin.game) {
                    mate.colors = { ...mate.colors, ...rp.skin.game };
                    mate.skinStyle = rp.skin.style || 'default';
                }
                remotePlayersMap.set(rp.id, mate);
                fighters.push(mate);
            }
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
            if (f === player) {
                renderer?.shake(FIRE_SHAKE[w.id] || 1);
                if (isMultiplayer && gameWs && gameWs.readyState === WebSocket.OPEN) {
                    gameWs.send(JSON.stringify({
                        type: 'p_action',
                        action: 'fire',
                        weaponId: w.id,
                        mx, my
                    }));
                }
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
        onKill(killer, victim, weaponId) {
            // Photo du personnage pour l'animation de mort (avant que son inventaire tombe)
            corpses.push({
                x: victim.x, y: victim.y, r: victim.r, angle: victim.angle,
                colors: victim.colors, skinStyle: victim.skinStyle,
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
                }
            }
            loot.dropAll(victim);
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
        },
        onDBNO(victim, attacker, weaponId) {
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

    loot.onChestOpen = (c, f) => {
        effects.chestOpen(c.x, c.y);
        SFX.play('chest', { x: c.x, y: c.y });
        if (f === player) stats.chests++;
    };
    loot.onPickup = (f, item, color) => {
        effects.pickup(item.x, item.y, color);
        SFX.play('pickup', { x: item.x, y: item.y, kind: item.kind });
    };

    // La corruption (zone qui rétrécit) : démarre quand le vaisseau a fini ou que le joueur a atterri
    const corruption = new Corruption(world);
    corruption.onEvent = (type) => {
        if (type === 'warn') SFX.play('zoneWarn');
        else if (type === 'shrink') SFX.play('zoneShrink');
    };

    const bots = new BotManager({
        world, drop, loot, combat, fighters,
        count: teamMode ? 23 : BOT_COUNT,
        corruption, teamSize, player
    });

    const canvas = document.getElementById('gameCanvas');
    renderer = new Renderer(canvas, world);
    renderer.setFlightView(0.65, 1);
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

    const input = new Input(canvas, {
        // Pas de carte par-dessus l'écran de fin (Tab y sert à déplacer le focus)
        onMap: () => { if (!endScreen.isOpen) hud.toggleMap(); },
        onMapHold: (down) => { if (!down || !endScreen.isOpen) hud.toggleMap(down); },
        onEscape: () => {
            // Écran de fin : Échap = regarder la partie ; en spectateur : revoir les résultats
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
        onJump: () => {
            if (!player.dbno) {
                if (drop.jump(player) && isMultiplayer && gameWs?.readyState === WebSocket.OPEN) {
                    gameWs.send(JSON.stringify({ type: 'p_action', action: 'jump' }));
                }
            }
        },
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
        if (!player.dbno) {
            if (drop.jump(player) && isMultiplayer && gameWs?.readyState === WebSocket.OPEN) {
                gameWs.send(JSON.stringify({ type: 'p_action', action: 'jump' }));
            }
        }
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

    /* ----- Connexion WebSocket Multijoueur en jeu ----- */
    if (isMultiplayer) {
        try {
            const loc = window.location;
            const proto = (loc.protocol === 'https:') ? 'wss:' : 'ws:';
            const wsHost = (loc.port === '8080' || loc.port === '5500') ? `${loc.hostname}:3000` : loc.host;
            const wsUrl = `${proto}//${wsHost}`;
            gameWs = new WebSocket(wsUrl);

            gameWs.addEventListener('open', () => {
                gameWs.send(JSON.stringify({
                    type: 'join_room',
                    code: gameConfig.roomCode,
                    player: {
                        id: gameConfig.myPlayerId,
                        name: player.name,
                        slot: player.squadSlot
                    }
                }));
            });

            gameWs.addEventListener('message', (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'p_state' && msg.id && msg.id !== gameConfig.myPlayerId) {
                        let mate = remotePlayersMap.get(msg.id);
                        if (!mate) {
                            mate = new Player(msg.x || drop.ship.x, msg.y || drop.ship.y);
                            mate.id = msg.id;
                            mate.name = msg.name || 'Coéquipier';
                            mate.team = 1;
                            mate.squadSlot = msg.slot || 2;
                            mate.isRemote = true;
                            remotePlayersMap.set(msg.id, mate);
                            fighters.push(mate);
                        }
                        if (typeof msg.x === 'number') mate.x = msg.x;
                        if (typeof msg.y === 'number') mate.y = msg.y;
                        if (typeof msg.vx === 'number') mate.vx = msg.vx;
                        if (typeof msg.vy === 'number') mate.vy = msg.vy;
                        if (typeof msg.angle === 'number') mate.angle = msg.angle;
                        if (msg.phase) mate.phase = msg.phase;
                        if (typeof msg.altitude === 'number') mate.altitude = msg.altitude;
                        if (typeof msg.health === 'number') mate.health = msg.health;
                        if (typeof msg.shield === 'number') mate.shield = msg.shield;
                        if (typeof msg.slot === 'number') mate.slot = msg.slot;
                        if (typeof msg.dbno === 'boolean') {
                            if (!mate.dbno && msg.dbno) {
                                mate.dbno = true;
                                effects.death(mate.x, mate.y, mate.colors);
                                SFX.play('playerDown', { x: mate.x, y: mate.y });
                                combatHud?.addKill(null, mate, 'knockout');
                            } else if (mate.dbno && !msg.dbno) {
                                mate.dbno = false;
                                effects.healDone(mate.x, mate.y, false);
                                SFX.play('healDone', { x: mate.x, y: mate.y });
                            }
                        }
                        if (typeof msg.dbnoTimer === 'number') mate.dbnoTimer = msg.dbnoTimer;
                        if (mate.health <= 0 && !mate.dbno) mate.alive = false;
                    } else if (msg.type === 'p_action' && msg.id && msg.id !== gameConfig.myPlayerId) {
                        const mate = remotePlayersMap.get(msg.id);
                        if (msg.action === 'jump' && mate) {
                            drop.jump(mate);
                            SFX.play('jump', { x: mate.x, y: mate.y });
                        } else if (msg.action === 'fire' && mate) {
                            const hidden = roofAlphaAt(world, mate.x, mate.y) > 0.5;
                            if (msg.weaponId === 'melee' || msg.weaponId === 'pickaxe') {
                                if (!hidden) effects.swing(mate.x, mate.y, mate.angle, mate.r);
                                SFX.play('swing', { x: mate.x, y: mate.y });
                            } else {
                                if (!hidden) effects.muzzle(mate.x + Math.cos(mate.angle) * 20, mate.y + Math.sin(mate.angle) * 20, mate.angle, msg.weaponId || 'ar');
                                SFX.play('shot', { x: mate.x, y: mate.y, weapon: msg.weaponId || 'ar' });
                            }
                        } else if (msg.action === 'revive_done' && msg.targetId) {
                            const target = (msg.targetId === gameConfig.myPlayerId) ? player : fighters.find(f => f.id === msg.targetId);
                            if (target && target.dbno) {
                                target.dbno = false;
                                target.health = 30;
                                target.reviveProgress = 0;
                                combat.onRevive?.(mate || player, target);
                            }
                        }
                    }
                } catch (err) {
                    console.warn('[WS Msg error]', err);
                }
            });
        } catch (err) {
            console.warn('[WS Connect error]', err);
        }
    }

    /* ----- Actions du joueur (tir, soin) ----- */
    function playerActions() {
        const pressed = input.consumePress();
        // Pas de tir tant qu'un panneau est ouvert (carte, paramètres, inventaire) OU si le joueur est K.O.
        if (!player.alive || player.dbno || player.phase !== 'ground' || hud.mapOpen || settingsOpen || inventoryUI.open) return;
        const held = player.inventory[player.slot];
        if (!held) return;
        if (held.kind === 'heal') {
            if (pressed) combat.startUse(player);
        } else if (input.mouse.down || pressed) {
            // "pressed" aussi : un clic très court (relâché avant l'image) doit quand même tirer
            combat.tryFire(player, pressed);
        }
    }

    /* ----- Réanimation de coéquipier ----- */
    const revivePrompt = document.getElementById('revivePrompt');
    const reviveLabel = document.getElementById('reviveLabel');
    const reviveFill = document.getElementById('reviveFill');
    const interactPrompt = document.getElementById('interactPrompt');

    function updateRevive(dt) {
        if (!player.alive || player.phase !== 'ground') {
            if (revivePrompt) revivePrompt.hidden = true;
            return;
        }

        // Si le joueur est lui-même K.O. :
        if (player.dbno) {
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
                if (reviveFill) reviveFill.style.width = `${Math.min(100, Math.round((downed.reviveProgress || 0) / 5 * 100))}%`;
                if (done) {
                    if (revivePrompt) revivePrompt.hidden = true;
                    if (interactPrompt) interactPrompt.hidden = true;
                    if (isMultiplayer && gameWs?.readyState === WebSocket.OPEN) {
                        gameWs.send(JSON.stringify({
                            type: 'p_action',
                            action: 'revive_done',
                            targetId: downed.id
                        }));
                    }
                }
            } else {
                // Pas en train de maintenir E : afficher consigne
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
        const squad = fighters.filter(f => f.team === 1);
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
                    SFX.play('step', { x: f.x, y: f.y, water: f.inWater, vol: f === player ? 0.8 : 0.55 });
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
            const teamAlive = fighters.filter(f => f.alive && f.team === 1);
            const allStandingInTeam = teamAlive.filter(f => !f.dbno);
            const otherTeamsAlive = fighters.filter(f => f.alive && f.team !== 1);

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
            weaponRarity: stats.weaponRarity
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
                const d = Math.hypot(c.x - player.x, c.y - player.y);
                if (d < bestD) {
                    bestD = d;
                    best = c;
                }
            }
            if (best) SFX.play('chestHum', { x: best.x, y: best.y });
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
        const teammates = fighters.filter(f => f !== player && f.alive && f.team === 1);
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
            bots.drawAir(ctx, time, v);   // v : on ne dessine que les bots proches de l'écran
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

    let last = performance.now();
    let time = 0;

    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000); // évite les grands sauts après un onglet en pause
        last = now;
        time += dt;

        // Synchronisation réseau (20 Hz)
        if (isMultiplayer && gameWs && gameWs.readyState === WebSocket.OPEN && (now - lastNetSync > 50)) {
            lastNetSync = now;
            gameWs.send(JSON.stringify({
                type: 'p_state',
                x: Math.round(player.x * 10) / 10,
                y: Math.round(player.y * 10) / 10,
                vx: Math.round(player.vx),
                vy: Math.round(player.vy),
                angle: Math.round(player.angle * 100) / 100,
                phase: player.phase,
                altitude: Math.round((player.altitude || 0) * 100) / 100,
                health: Math.round(player.health),
                shield: Math.round(player.shield),
                slot: player.slot,
                dbno: !!player.dbno,
                dbnoTimer: player.dbnoTimer || 0
            }));
        }

        const aim = renderer.screenToWorld(input.mouse.x, input.mouse.y);
        drop.update(dt, player, input, aim.x, aim.y);
        // Premier cycle de corruption : vaisseau arrivé au bout OU joueur au sol (le premier des deux)
        if (corruption.state === 'idle' && (!drop.ship.active || player.phase === 'ground')) corruption.start();
        if (player.phase === 'ground' && player.alive) {
            player.update(dt, input, world, aim.x, aim.y);
            // Munitions ramassées en passant dessus (désactivable dans les paramètres)
            if (Settings.get('autoAmmo')) loot.autoPickupAmmo(player);
            playerActions();
        }
        updateSquadHud();
        bots.update(dt, time);
        combat.update(dt);
        corruption.update(dt, fighters, combat);
        loot.update(dt);
        fighterEffects(dt);
        effects.update(dt);
        if (stats.startT === null && player.phase === 'ground') stats.startT = time; // atterrissage
        checkEnd();

        // Spectateur : la caméra, le son et les feuillages / toits suivent la cible
        const watched = spectator.update() || player;
        updateAudio(dt, watched);

        // Vue large dans le vaisseau, qui se resserre pendant la chute
        const view = player.phase === 'ship' ? 0.65 : player.phase === 'air' ? 0.65 + (1 - player.altitude) * 0.35 : 1;
        renderer.setFlightView(view, dt);
        renderer.follow(player.phase === 'ship' ? drop.ship : watched, dt);
        renderer.render(watched, dt, time, hooks);
        if (player.phase === 'air' && altMeterEl) {
            // Écart en pixels d'écran, ramené à l'échelle du HUD agrandi (--hud-zoom)
            const hz = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-zoom')) || 1;
            const off = Math.round((renderer.zoom * 135 + 12) / hz);
            if (off !== lastAltOffset) {
                lastAltOffset = off;
                altMeterEl.style.setProperty('--alt-offset', `${off}px`);
            }
        }
        hud.update(dt, time);
        inventoryUI.update();
        combatHud.update(dt);
        updateRevive(dt);

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // Accès depuis la console du navigateur pour tester (ex : FOR2D_GAME.player.x = 1500)
    window.FOR2D_GAME = {
        world, player, renderer, hud, drop, loot, combat, bots, fighters, effects, corruption, SFX,
        endScreen, spectator, stats
    };
}

// Icônes SVG du HUD (emplacements data-icon de game.html), posées tout de suite
mountHudIcons();

// On laisse l'écran de chargement s'afficher avant la génération (qui bloque un court instant)
requestAnimationFrame(() => setTimeout(start, 50));
