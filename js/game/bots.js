/* ==================================
   BOTS - FOR2D ROYAL
   Adversaires contrôlés par l'ordinateur :
   saut du vaisseau, chute en planeur, puis IA simple au sol
   (butin, combat, soins, fuite de la corruption). Le "cerveau" ne
   réfléchit que ~4 fois par seconde pour que 24 bots coûtent peu.
   ================================== */

import { B, PLAYER, isWater } from './config.js?v=11';
import { Player } from './player.js';
import { clamp, pick, airProject } from './utils.js';
import { drawFalling, fallHeight, tryRoofLanding, updateRoofSlide } from './drop.js?v=14';
import { WEAPONS, HEALS } from './weapons.js';
import { SKINS as SKIN_CATALOG, ITEMS } from '../cosmetics.js';
import { hasBackpackArt } from './backpack-art.js';

// Planeurs que les bots peuvent avoir (classiques et à forme)
const BOT_GLIDERS = ITEMS.filter(it => it.type === 'glider' && Array.isArray(it.colors));
// Sacs à forme que les bots peuvent porter
const BOT_PACK_CHANCE = 0.35;
const BOT_PACKS = ITEMS.filter(it => it.type === 'backpack' && !it.none && it.color && hasBackpackArt(it.motif));

export const BOT_NAMES = [
    'xX_Snip3r_Xx', 'NoobMaster', 'PiouPiou', 'BaguetteTurbo', 'Kevin_du_93',
    'LeCampeur', 'MisterPatate', 'FromageFou', 'Toast3r', 'PandaRoux',
    'LamaFâché', 'CapitaineFrite', 'DarkSasuke42', 'SkillIssue', 'Raclette2000',
    'MamieGamer', 'LootGoblin', 'BushCamper', 'TurboEscargot', 'QuicheLorraine',
    'Ch3vreDeGuerre', 'Moustachu', 'PixelPirate', 'GrosBidou', 'Tartiflette',
    'ZigZagZoé', 'BananeFlash', 'Poulet_Sniper', 'TryHardTom', 'LaPiocheDOr',
    'Croissant360', 'NinjaDuDimanche'
];

// ----- Réglages -----
const AIR_SPEED = 520;        // pilotage en l'air
const FALL_TIME = 12;         // secondes de chute (3x plus longtemps qu'avant)
const THINK_MIN = 0.22;       // le cerveau réfléchit toutes les 0,22 à 0,30 s
const THINK_RAND = 0.08;
const SIGHT = 800;            // distance de détection d'une cible
const LOOT_SEARCH = 1500;     // recherche de butin quand on n'a rien
const LOOT_BONUS = 600;       // butin "en passant" quand on est déjà armé
const LOS_STEP = 25;          // pas de test de la ligne de vue
const AIM_ERROR = 0.12;       // imprécision de visée (radians)
const TURN_SPEED = 9;         // vitesse de rotation de la visée (rad/s)
const STUCK_TIME = 1.5;
const STUCK_DIST = 35;
const FEELER = 90;            // "antenne" pour éviter murs et eau
const LAND_MARGIN = 550;      // on reste loin du bord de la carte
const AIR_DRAW_MARGIN = 250;  // marge de dessin des bots en chute (agrandis en altitude)
const LABEL_MARGIN = 120;     // marge de dessin des pseudos (texte large)
const OUTLINE = '#0a1030';

// ----- Corruption (zone qui rétrécit) -----
const ZONE_MARGIN = 120;       // marge sous le bord de la zone de référence ("bord intérieur")
const ZONE_CENTER_OK = 160;    // zone finale minuscule : à moins de 160 du centre, on se bat normalement
const ZONE_HYST = 60;          // hystérésis : évite d'alterner "rejoindre / rester" au bord
const ZONE_FIGHT_DIST = 260;   // dans la corruption, on ne se bat que si l'ennemi est plus proche
const ZONE_DEEP = 250;         // plus loin que ça dans la corruption : on court, même au contact
const ZONE_PULL = 0.9;         // attraction vers la zone pendant un combat forcé
const ZONE_PANIC_TIME = 1.5;   // pendant le rétrécissement : on part si le bord arrive dans 1,5 s
const ZONE_HEAL_HP = 30;       // se soigner dans la corruption seulement sous 30 PV...
const ZONE_HEAL_DEPTH = 150;   // ... et à moins de 150 unités de la sortie
const ZONE_ROAM_MARGIN = 200;  // errance : points bien à l'intérieur de la zone
const ZONE_LOOT_MARGIN = 200;  // butin ignoré trop près du bord quand la corruption va avancer
const ZONE_SPEED = PLAYER.speed * 0.85; // vitesse estimée (détours autour des obstacles)

// Décalages essayés (radians) quand la route est bloquée
const STEER_OFFSETS = [0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7, 2.5, -2.5];

// Palettes vives pour les tenues
const SKINS = ['#f2c29b', '#e0a878', '#c68642', '#8d5524', '#ffdbb4', '#f5c6a5'];
const HAIRS = ['#5a3419', '#1c1c1c', '#e8c34a', '#d9480f', '#ff4fb8', '#3a8dff', '#ffffff', '#7a3cff'];
const OUTFITS = ['#ff7a1a', '#3dd66b', '#ff4757', '#a55eea', '#1ec8ff', '#ffd32a', '#ff5fa2', '#2ed1b2', '#ff9f1a', '#6c5ce7'];
const PACKS = ['#3a8dff', '#ffe03d', '#ff5470', '#3dff8b', '#9b59ff', '#ff9d00', '#00d2d3', '#ffffff'];

// Skins de la boutique portés par certains bots (hors skins de départ : on les reconnaît mieux)
const BOT_SKIN_CHANCE = 0.25;
const BOT_SKINS = SKIN_CATALOG.filter(s => !s.starter && s.game);

/* ===================== OUTILS ===================== */

const rand = (a, b) => a + Math.random() * (b - a);
const rpick = list => pick(Math.random, list);

function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

// Écart d'angle ramené entre -PI et PI
function angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
}

function turnToward(a, b, maxStep) {
    const d = angleDiff(a, b);
    return Math.abs(d) <= maxStep ? b : a + Math.sign(d) * maxStep;
}

function isDeep(world, x, y) {
    const b = world.sampleGround(x, y).biome;
    return b === B.OCEAN || b === B.LAC;
}

function isLand(world, x, y) {
    return !isWater(world.sampleGround(x, y).biome);
}

/*
   Le segment [a, b] est-il libre ?
   - arbres / rochers (cercles) : test exact de distance au segment
   - murs (rectangles) : points testés tous les ~25 unités, murs "gonflés"
     d'un demi-pas pour ne jamais rater un mur fin
   pad > 0 : on épaissit les obstacles (utile pour les "antennes" de déplacement)
*/
const _near = [];
const _rects = [];
const _lootList = [];   // tableau temporaire pour la recherche de butin
const _labels = [];     // bots dont on dessine le pseudo (réutilisé à chaque image)
const _airPt = {};      // point projeté en perspective (bots en chute)

// Distance au carré entre un point et un segment (évite Math.hypot dans les boucles)
function segDist2(px, py, ax, ay, dx, dy, l2) {
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - (ax + t * dx);
    const ey = py - (ay + t * dy);
    return ex * ex + ey * ey;
}

function segmentClear(world, ax, ay, bx, by, pad = 0) {
    const inflate = Math.max(pad, LOS_STEP / 2);
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minY = Math.min(ay, by);
    const maxY = Math.max(ay, by);
    const list = world.collide.query(minX - inflate, minY - inflate, maxX + inflate, maxY + inflate, _near);
    if (!list.length) return true;

    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    _rects.length = 0;
    for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.kind === 'circle') {
            const rr = c.r + pad;
            // Pré-filtre : cercle hors du rectangle englobant du segment => ne peut pas le toucher
            if (c.x + rr < minX || c.x - rr > maxX || c.y + rr < minY || c.y - rr > maxY) continue;
            if (segDist2(c.x, c.y, ax, ay, dx, dy, l2) < rr * rr) return false;
        } else if (c.x - inflate < maxX && c.x + c.w + inflate > minX &&
                   c.y - inflate < maxY && c.y + c.h + inflate > minY) {
            _rects.push(c);
        }
    }
    if (!_rects.length) return true;

    const steps = Math.max(1, Math.ceil(Math.sqrt(l2) / LOS_STEP));
    for (let i = 1; i <= steps; i++) {
        const px = ax + (dx * i) / steps;
        const py = ay + (dy * i) / steps;
        for (let k = 0; k < _rects.length; k++) {
            const c = _rects[k];
            if (px > c.x - inflate && px < c.x + c.w + inflate &&
                py > c.y - inflate && py < c.y + c.h + inflate) return false;
        }
    }
    return true;
}

/* ----- Armes et soins ----- */

function weaponAt(f, i) {
    const it = f.inventory[i];
    if (!it || it.kind !== 'weapon') return null;
    return WEAPONS[it.weaponId] || null;
}

function hasAmmo(f, it, w) {
    return (it.mag || 0) > 0 || (f.ammo[w.ammo] || 0) > 0;
}

// Rôle d'une arme : 'close' (pompe), 'far' (sniper) ou 'mid'
// (calculé une fois par arme puis mis en cache : plus d'expression régulière à chaque tir)
const ROLES = new Map();
function weaponRole(w) {
    let role = ROLES.get(w);
    if (role) return role;
    const id = String(w.id || '');
    if (w.ammo === 'shells' || /shotgun|pompe/i.test(id)) role = 'close';
    else if (/sniper/i.test(id) || (w.range || 0) >= 1100) role = 'far';
    else role = 'mid';
    ROLES.set(w, role);
    return role;
}

// Meilleure case d'arme à feu avec des munitions (0 = pioche si aucune)
function bestGunSlot(f, targetDist) {
    let best = 0;
    let bestScore = 0;
    for (let i = 1; i < f.inventory.length; i++) {
        const w = weaponAt(f, i);
        if (!w || w.type !== 'gun') continue;
        const it = f.inventory[i];
        if (!hasAmmo(f, it, w)) continue;

        let s = (w.damage || 10) * (w.auto ? 2.5 : 1) * (1 + 0.15 * (it.rarity || 0));
        if ((it.mag || 0) > 0) s *= 1.5; // pas besoin de recharger tout de suite
        if (targetDist !== null) {
            const role = weaponRole(w);
            if (role === 'close') s *= targetDist < 300 ? 1.8 : targetDist > 450 ? 0.4 : 1;
            if (role === 'far') s *= targetDist > 500 ? 1.6 : 0.6;
        }
        if (s > bestScore) {
            bestScore = s;
            best = i;
        }
    }
    return best;
}

// Distance de combat idéale selon l'arme
function prefDistFor(w, mul) {
    const role = weaponRole(w);
    const base = role === 'close' ? 150 : role === 'far' ? 650 : 380;
    return Math.min(base * mul, (w.range || SIGHT) * 0.8);
}

function meleeReach(bot, t, w) {
    return Math.max(bot.r + t.r + 18, (w.range || 60) + t.r * 0.5);
}

// Entrée factice passée à Player.update : axis() renvoie la direction voulue
class BotInput {
    constructor() {
        this.x = 0;
        this.y = 0;
    }

    axis() {
        return this;
    }
}

/*
   Opacité du toit au-dessus de (x, y) : 0 hors des maisons ou toit ouvert
   (celui qu'on regarde est dans la même maison), jusqu'à 1 toit fermé.
   b.alpha est mis à jour par le Renderer à chaque image.
*/
export function roofAlphaAt(world, x, y) {
    for (const b of world.buildings) {
        if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return clamp(b.alpha ?? 1, 0, 1);
    }
    return 0;
}

/* ===================== GESTIONNAIRE DE BOTS ===================== */

export class BotManager {
    /*
       teamFill (optionnel) : bots coéquipiers à ajouter aux équipes de vrais joueurs,
         [{ team, count, firstSlot }] (même liste sur toutes les machines en multijoueur).
       enemyCount (optionnel) : nombre de bots adverses (en escouades de teamSize).
       firstEnemyTeam (optionnel) : numéro de la première escouade de bots.
       Sans ces options : ancien comportement (coéquipiers du joueur + count bots au total).
    */
    constructor({ world, drop, loot, combat, fighters, count = 24, corruption, teamSize = 1, player = null, isGuest = false,
        allowBotTeammates = true, teamFill = null, enemyCount = null, firstEnemyTeam = null }) {
        this.world = world;
        this.mapScale = Math.min(world.width, world.height) / 6000;
        this.landMargin = Math.min(LAND_MARGIN, Math.min(world.width, world.height) * LAND_MARGIN / 6000);
        this.drop = drop;
        this.loot = loot;
        this.combat = combat;
        this.fighters = fighters;
        this.corruption = corruption || null; // peut être absent : tout marche sans zone
        this.player = player || fighters[0];
        this.teamSize = teamSize;
        this.isGuest = Boolean(isGuest);
        this.allowBotTeammates = allowBotTeammates !== false;
        this.bots = [];
        this.playerTeammates = [];

        // Zone de référence de l'image en cours (recalculée dans update)
        this._ref = null;
        this._lootMargin = ZONE_MARGIN;

        const enter = drop.enterAt ?? 0;
        const exit = drop.exitAt ?? drop.length ?? 0;
        let nextId = 1;
        for (const f of fighters) if (f.id >= nextId) nextId = f.id + 1;
        const names = shuffle([...BOT_NAMES]);

        const myTeam = player ? (player.team || 1) : 1;
        // Coéquipiers bots, équipe par équipe (ordre fixe)
        let fill;
        if (Array.isArray(teamFill)) {
            fill = teamFill.filter(t => t && t.count > 0).map(t => ({ team: t.team, count: t.count, firstSlot: t.firstSlot || 2 }))
                .sort((a, b) => a.team - b.team);
        } else {
            const existingTeammates = fighters.filter(f => f.team === myTeam).length;
            const n = this.allowBotTeammates ? Math.max(0, teamSize - existingTeammates) : 0;
            fill = n > 0 ? [{ team: myTeam, count: n, firstSlot: existingTeammates + 1 }] : [];
        }
        const mates = [];
        for (const t of fill) for (let k = 0; k < t.count; k++) mates.push({ team: t.team, slot: t.firstSlot + k, idx: k });
        const teammateCount = mates.length;
        count = teammateCount + (Number.isInteger(enemyCount) ? Math.max(0, enemyCount) : Math.max(0, count - teammateCount));
        const maxHumanTeam = Math.max(1, ...fighters.map(f => f.team || 1), ...fill.map(t => t.team));
        let enemySquadId = Number.isInteger(firstEnemyTeam) ? firstEnemyTeam : maxHumanTeam + 1;
        let enemySquadFill = 0;
        let currentSquadLand = null;

        this.squadLeaders = {};
        const TEAMMATE_NAMES = ['Agent Banane', 'Robo-Gamer', 'PiouPiou'];
        const TEAMMATE_LOOKS = [
            { colors: { skin: '#ffdbb4', hair: '#1c1c1c', outfit: '#ffd21e', pack: '#2ed1b2' }, skinStyle: 'default' }, // Agent Banane
            { colors: { skin: '#e0a878', hair: '#3a8dff', outfit: '#2ed1b2', pack: '#ff4757' }, skinStyle: 'default' }, // Robo-Gamer
            { colors: { skin: '#f5c6a5', hair: '#d9480f', outfit: '#a55eea', pack: '#ffd32a' }, skinStyle: 'default' }  // PiouPiou
        ];

        for (let i = 0; i < count; i++) {
            const bot = new Player(drop.ship.x, drop.ship.y, this.world);
            bot.isBot = true;
            bot.id = nextId++;
            const mate = i < teammateCount ? mates[i] : null;
            if (mate) {
                bot.name = TEAMMATE_NAMES[mate.idx] || `Agent ${mate.idx + 1}`;
                bot.squadSlot = mate.slot; // place libre de l'équipe (après les vrais joueurs)
                const look = TEAMMATE_LOOKS[mate.idx % TEAMMATE_LOOKS.length];
                bot.colors = { ...look.colors };
                bot.skinStyle = look.skinStyle;
            } else {
                bot.name = i < names.length
                    ? names[i]
                    : `${names[i % names.length]}${1 + Math.floor(i / names.length)}`;
                if (BOT_SKINS.length && Math.random() < BOT_SKIN_CHANCE) {
                    // ~1 bot sur 4 porte un skin du catalogue
                    const s = rpick(BOT_SKINS);
                    bot.colors = { ...s.game };
                    bot.skinStyle = s.style || 'default';
                } else {
                    bot.colors = { skin: rpick(SKINS), hair: rpick(HAIRS), outfit: rpick(OUTFITS), pack: rpick(PACKS) };
                    bot.skinStyle = 'default';
                }
            }
            bot.pickaxeSkin = rpick(['pioche-defaut', 'pioche-laser', 'pioche-royale', 'pioche-cosmique', 'pioche-maudite', 'pioche-bonbon']);
            if (bot.inventory?.[0]) bot.inventory[0].pickaxeSkin = bot.pickaxeSkin;
            // ~1 bot sur 3 porte un sac à forme du catalogue (ailes, cape, queue...)
            if (Math.random() < BOT_PACK_CHANCE) {
                const bp = rpick(BOT_PACKS);
                bot.colors = { ...bot.colors, pack: bp.color };
                bot.packMotif = bp.motif;
                bot.packAccent = bp.accent;
            }
            // Planeur du catalogue au hasard (même tirage sur toutes les machines : graine partagée)
            const gl = rpick(BOT_GLIDERS);
            bot.gliderColors = gl.colors;
            bot.gliderStyle = gl.style || null;
            bot.phase = 'ship';
            bot.altitude = 1;
            bot.angle = drop.angle;
            // Propriétés d'interpolation pour le réseau
            bot._targetX = bot.x;
            bot._targetY = bot.y;
            bot._targetAngle = bot.angle;
            bot._targetAlt = bot.altitude;

            // Attribution des équipes
            if (mate) {
                bot.team = mate.team; // Coéquipier d'une équipe de vrais joueurs
                bot.humanSquad = true;
                if (mate.team === myTeam) this.playerTeammates.push(bot);
            } else if (teamSize > 1) {
                bot.team = enemySquadId;
                if (!this.squadLeaders[enemySquadId]) this.squadLeaders[enemySquadId] = bot;
                enemySquadFill++;
                if (enemySquadFill >= teamSize) {
                    enemySquadId++;
                    enemySquadFill = 0;
                    currentSquadLand = null; // Nouvelle escouade ennemie
                }
            } else {
                bot.team = enemySquadId++; // Solo : chaque bot a son équipe (après celles des joueurs)
            }

            // Atterrissage groupé en escouade
            let land;
            if (bot.humanSquad) {
                land = this.chooseLanding(enter, exit); // il suivra ses joueurs pendant la chute
            } else if (bot.team === myTeam) {
                land = this.chooseLanding(enter, exit);
            } else if (teamSize > 1) {
                if (!currentSquadLand) currentSquadLand = this.chooseLanding(enter, exit);
                land = {
                    x: clamp(currentSquadLand.x + rand(-100, 100), this.landMargin, this.world.width - this.landMargin),
                    y: clamp(currentSquadLand.y + rand(-100, 100), this.landMargin, this.world.height - this.landMargin)
                };
            } else {
                land = this.chooseLanding(enter, exit);
            }

            bot.brain = this.makeBrain(bot, land, this.chooseJump(land, enter, exit));
            fighters.push(bot);
            this.bots.push(bot);
        }
    }

    makeBrain(bot, land, jumpAt) {
        return {
            land, jumpAt,
            input: new BotInput(),
            think: Math.random() * THINK_MIN, // décalé pour ne pas tous réfléchir en même temps
            state: 'roam',
            goal: null,
            roamGoal: { x: land.x, y: land.y },
            // cible
            target: null,
            targetDist: Infinity,
            react: 0,           // temps de réaction avant de tirer sur une nouvelle cible
            lostT: 0,           // on va voir où la cible a disparu
            chase: { x: 0, y: 0 },
            // butin
            lootTarget: null,
            lootTries: 0,
            lootStuck: 0,
            lootTime: 0,
            lootSearch: 0,
            ignored: new WeakSet(),
            // déplacement / visée
            mx: 0, my: 0,
            wantAim: null,
            steer: 0,
            steerSide: Math.random() < 0.5 ? -1 : 1,
            strafe: 1,
            strafeT: 0,
            distMul: rand(0.85, 1.15),
            prefDist: 380,
            aim: bot.angle,
            aimErr: 0,
            trigger: 0,
            burst: rand(0.5, 1.1),
            // blocage
            stuckT: 0, moveT: 0, sx: bot.x, sy: bot.y,
            unstuck: 0, ux: 0, uy: 0,
            // corruption : chaque bot a sa propre prudence (petit = part tôt)
            prudence: rand(0.3, 0.95),
            zoneFrac: rand(0.7, 0.85),   // point visé à 70-85 % du rayon depuis le centre
            zoneAng: rand(-0.4, 0.4),    // décalage angulaire : ils ne s'empilent pas tous au même endroit
            zoneRush: false,
            zoneGoal: null,
            zx: 0, zy: 0, zr: 0,         // zone pour laquelle zoneGoal a été calculé
            inStorm: false,
            stormDepth: 0
        };
    }

    /* ----- Choix du point d'atterrissage et du moment du saut ----- */

    chooseLanding(enter, exit) {
        const drop = this.drop;
        const A = drop.pointAt(0);
        const dirX = Math.cos(drop.angle);
        const dirY = Math.sin(drop.angle);

        // Villes atteignables depuis le trajet (4 s de chute à 520 ≈ 2000 unités)
        const towns = (this.world.towns || []).filter(t => {
            const d = clamp((t.x - A.x) * dirX + (t.y - A.y) * dirY, enter, exit);
            const p = drop.pointAt(d);
            return Math.hypot(t.x - p.x, t.y - p.y) < 1900;
        });

        if (towns.length && Math.random() < 0.7) {
            const t = rpick(towns);
            for (let k = 0; k < 10; k++) {
                const a = Math.random() * Math.PI * 2;
                const rr = Math.sqrt(Math.random()) * t.radius * 0.85;
                const x = t.x + Math.cos(a) * rr;
                const y = t.y + Math.sin(a) * rr;
                if (isLand(this.world, x, y)) return { x, y };
            }
            return { x: t.x, y: t.y };
        }

        // Sinon : un point au hasard sur la terre ferme, pas trop loin du trajet
        for (let k = 0; k < 30; k++) {
            const p = drop.pointAt(rand(enter, exit));
            const off = rand(-1600 * this.mapScale, 1600 * this.mapScale);
            const x = clamp(p.x - dirY * off, this.landMargin, this.world.width - this.landMargin);
            const y = clamp(p.y + dirX * off, this.landMargin, this.world.height - this.landMargin);
            if (isLand(this.world, x, y)) return { x, y };
        }
        return { x: this.world.width / 2, y: this.world.height / 2 };
    }

    // Distance de saut au hasard, autour de l'aplomb de la zone visée
    chooseJump(land, enter, exit) {
        const drop = this.drop;
        const A = drop.pointAt(0);
        const along = (land.x - A.x) * Math.cos(drop.angle) + (land.y - A.y) * Math.sin(drop.angle);
        return clamp(along + rand(-700, 250), enter, exit);
    }

    // Vrai joueur de l'équipe du bot le plus proche (vivant), ou null
    squadLead(bot, allowShip) {
        let best = null;
        let bd = Infinity;
        for (const f of this.fighters) {
            if (f.isBot || !f.alive || f.team !== bot.team) continue;
            if (!allowShip && f.phase !== 'ground') continue;
            const d = (f.x - bot.x) ** 2 + (f.y - bot.y) ** 2;
            if (d < bd) { bd = d; best = f; }
        }
        return best;
    }

    removePlayerTeammates() {
        const myTeam = this.player ? (this.player.team || 1) : 1;
        const toRemove = this.bots.filter(b => b.team === myTeam);
        for (const b of toRemove) {
            b.alive = false;
            b.health = 0;
            const idxB = this.bots.indexOf(b);
            if (idxB >= 0) this.bots.splice(idxB, 1);
            const idxPT = this.playerTeammates.indexOf(b);
            if (idxPT >= 0) this.playerTeammates.splice(idxPT, 1);
            const idxF = this.fighters.indexOf(b);
            if (idxF >= 0) this.fighters.splice(idxF, 1);
        }
    }

    /* ===================== MISE À JOUR ===================== */

    update(dt, time) {
        if (this.isGuest) {
            this.updateGuest(dt, time);
            return;
        }

        // Zone de référence commune à tous les bots pour cette image
        this._ref = this.zoneRef();
        const st = this.corruption ? this.corruption.state : 'idle';
        this._lootMargin = st === 'wait' || st === 'shrink' ? ZONE_LOOT_MARGIN : ZONE_MARGIN;

        for (const bot of this.bots) {
            if (!bot.alive) continue;
            if (bot.phase === 'ship') this.updateShip(bot);
            else if (bot.phase === 'air') this.updateAir(bot, dt);
            else this.updateGround(bot, dt, time);
        }
    }

    updateGuest(dt, time) {
        const lerpSpeed = Math.min(1, dt * 15);
        for (const bot of this.bots) {
            if (!bot.alive && !bot.dbno) continue;

            if (bot.phase === 'ship') {
                bot.x = clamp(this.drop.ship.x, 0, this.world.width);
                bot.y = clamp(this.drop.ship.y, 0, this.world.height);
                bot.angle = this.drop.angle;
                continue;
            }

            if (typeof bot._targetX === 'number' && typeof bot._targetY === 'number') {
                const dx = bot._targetX - bot.x;
                const dy = bot._targetY - bot.y;
                const distSq = dx * dx + dy * dy;

                if (distSq > 500 * 500) {
                    bot.x = bot._targetX;
                    bot.y = bot._targetY;
                    bot.vx = 0;
                    bot.vy = 0;
                } else {
                    bot.x += dx * lerpSpeed;
                    bot.y += dy * lerpSpeed;
                    bot.vx = dt > 0 ? (dx * lerpSpeed) / dt : 0;
                    bot.vy = dt > 0 ? (dy * lerpSpeed) / dt : 0;
                }

                bot.moving = distSq > 4;
                if (bot.moving) {
                    const speed = bot.dbno ? 40 : 120;
                    bot.walkTime = (bot.walkTime || 0) + dt * (speed / 100);
                }
            }

            if (typeof bot._targetAngle === 'number') {
                let da = bot._targetAngle - bot.angle;
                if (da > Math.PI) da -= Math.PI * 2;
                if (da < -Math.PI) da += Math.PI * 2;
                bot.angle += da * lerpSpeed;
            }

            if (typeof bot._targetAlt === 'number') {
                bot.altitude += (bot._targetAlt - (bot.altitude || 0)) * lerpSpeed;
            }

            if (bot.fireCooldown > 0) bot.fireCooldown -= dt;
            if (bot.reloadTimer > 0) bot.reloadTimer -= dt;
            if (bot.swingT > 0) bot.swingT -= dt;
        }
    }

    updateShip(bot) {
        const drop = this.drop;
        bot.x = clamp(drop.ship.x, 0, this.world.width);
        bot.y = clamp(drop.ship.y, 0, this.world.height);
        bot.angle = drop.angle;

        // Saut synchronisé pour les escouades
        let squadJump = false;
        if (bot.humanSquad) {
            // Coéquipier de vrais joueurs : saute quand n'importe quel joueur humain de son équipe a sauté
            const leadPlayer = this.fighters.find(f => !f.isBot && f.team === bot.team && f.phase !== 'ship');
            if (leadPlayer && leadPlayer.phase !== 'ship') {
                squadJump = true;
                const slotIdx = (bot.squadSlot || 2) - 1;
                const side = slotIdx % 2 === 1 ? 1 : -1;
                const offsetAng = (drop.angle || 0) + side * 1.5;
                bot.brain.land = {
                    x: clamp(leadPlayer.x + Math.cos(offsetAng) * 60, this.landMargin, this.world.width - this.landMargin),
                    y: clamp(leadPlayer.y + Math.sin(offsetAng) * 60, this.landMargin, this.world.height - this.landMargin)
                };
            }
        } else if (this.squadLeaders[bot.team]) {
            // Escouade ennemie : saute avec son chef d'escouade
            const leader = this.squadLeaders[bot.team];
            if (leader && leader !== bot && leader.phase !== 'ship') {
                squadJump = true;
                if (leader.brain?.land) {
                    bot.brain.land = {
                        x: clamp(leader.brain.land.x + rand(-90, 90), this.landMargin, this.world.width - this.landMargin),
                        y: clamp(leader.brain.land.y + rand(-90, 90), this.landMargin, this.world.height - this.landMargin)
                    };
                }
            }
        }

        // Le coéquipier allié ne saute JAMAIS tout seul prématurément !
        // (au pire : saut automatique avec la fin de l'île, comme les joueurs)
        const shouldJump = bot.humanSquad
            ? (squadJump || !drop.ship.active || drop.dist >= (drop.exitAt ?? Infinity) - 300)
            : (squadJump || drop.dist >= bot.brain.jumpAt || !drop.ship.active);

        if (shouldJump) {
            bot.phase = 'air';
            bot.altitude = 1;
            bot.vx = Math.cos(drop.angle) * 200; // garde un peu l'élan du vaisseau
            bot.vy = Math.sin(drop.angle) * 200;
        }
    }

    updateAir(bot, dt) {
        const br = bot.brain;

        // Tombé sur un toit : glisse jusqu'au bord puis atterrit à côté de la maison
        if (bot.roofSlide) {
            if (updateRoofSlide(bot, dt)) this.landBot(bot);
            return;
        }

        // Si le bot est coéquipier du joueur : plane EN FORMATION à côté du joueur humain le plus proche
        if (bot.humanSquad) {
            const squadTarget = this.squadLead(bot, true);
            if (squadTarget) {
                const slotIdx = (bot.squadSlot || 2) - 1;
                const side = (slotIdx % 2 === 1 ? 1 : -1);
                const distSide = 55 + slotIdx * 15;
                const pAngle = squadTarget.angle || this.drop.angle || 0;
                const sideAng = pAngle + side * 1.57;
                const targetX = squadTarget.x + Math.cos(sideAng) * distSide;
                const targetY = squadTarget.y + Math.sin(sideAng) * distSide;
                br.land = { x: targetX, y: targetY };

                // Synchronise l'altitude avec le joueur
                if (squadTarget.phase === 'air') {
                    bot.altitude = Math.max(0.02, squadTarget.altitude);
                } else if (squadTarget.phase === 'ground') {
                    bot.altitude = Math.max(0, bot.altitude - dt * 3.5); // touche terre immédiatement
                }
            }
        }

        const dx = br.land.x - bot.x;
        const dy = br.land.y - bot.y;
        const d = Math.hypot(dx, dy);
        const speed = AIR_SPEED * Math.min(1, Math.max(0.4, d / 120));
        const ux = d > 1 ? dx / d : 0;
        const uy = d > 1 ? dy / d : 0;
        const k = Math.min(1, dt * 6);
        bot.vx += (ux * speed - bot.vx) * k;
        bot.vy += (uy * speed - bot.vy) * k;
        bot.x = clamp(bot.x + bot.vx * dt, bot.r, this.world.width - bot.r);
        bot.y = clamp(bot.y + bot.vy * dt, bot.r, this.world.height - bot.r);
        if (bot.vx * bot.vx + bot.vy * bot.vy > 900) bot.angle = Math.atan2(bot.vy, bot.vx);
        bot.moving = false;
        bot.altitude -= dt / FALL_TIME;

        if (tryRoofLanding(bot, this.world)) return;
        if (bot.altitude <= 0) {
            bot.altitude = 0;
            bot.phase = 'ground';
            bot.vx *= 0.3;
            bot.vy *= 0.3;
            this.landBot(bot);
        }
    }

    // Arrivée au sol (après la chute ou la glissade sur un toit) : le cerveau repart d'ici
    landBot(bot) {
        const br = bot.brain;
        br.aim = bot.angle;
        br.sx = bot.x;
        br.sy = bot.y;
        br.think = Math.random() * 0.2;
    }

    updateGround(bot, dt) {
        const br = bot.brain;

        // ----- Bot K.O. : rampe lentement sans tirer -----
        if (bot.dbno) {
            const ally = this.fighters.find(f => f.alive && !f.dbno && f.team === bot.team);
            let gx = bot.x, gy = bot.y;
            if (ally) {
                gx = ally.x; gy = ally.y;
            } else if (br.zoneGoal) {
                gx = br.zoneGoal.x; gy = br.zoneGoal.y;
            }
            const dx = gx - bot.x;
            const dy = gy - bot.y;
            const d = Math.hypot(dx, dy);
            br.input.x = d > 10 ? dx / d : 0;
            br.input.y = d > 10 ? dy / d : 0;
            if (d > 10) bot.angle = Math.atan2(dy, dx);
            bot.update(dt, br.input, this.world, bot.x + Math.cos(bot.angle) * 50, bot.y + Math.sin(bot.angle) * 50);
            return;
        }

        // ----- Réanimation d'un allié en cours -----
        if (br.state === 'revive' && br.reviveTarget) {
            const tgt = br.reviveTarget;
            if (!tgt.alive || !tgt.dbno) {
                br.state = 'roam';
                br.reviveTarget = null;
            } else {
                const distToTgt = Math.hypot(tgt.x - bot.x, tgt.y - bot.y);
                if (distToTgt <= 90) {
                    br.input.x = 0;
                    br.input.y = 0;
                    br.aim = Math.atan2(tgt.y - bot.y, tgt.x - bot.x);
                    bot.update(dt, br.input, this.world, tgt.x, tgt.y);
                    const done = this.combat.revive(bot, tgt, dt);
                    if (done) {
                        br.state = 'roam';
                        br.reviveTarget = null;
                    }
                    return;
                } else {
                    // Courir activement vers le coéquipier K.O.
                    br.goal = { x: tgt.x, y: tgt.y };
                }
            }
        }

        // ----- Réflexion espacée -----
        br.think -= dt;
        if (br.think <= 0) {
            const step = THINK_MIN + Math.random() * THINK_RAND;
            br.think += step;
            this.think(bot, step);
        }
        br.react -= dt;
        br.trigger -= dt;
        br.unstuck -= dt;

        // ----- Direction voulue (recalculée à chaque image, la cible bouge) -----
        this.baseDirection(bot);
        let mx = br.mx;
        let my = br.my;
        if (br.unstuck > 0) {
            mx = br.ux;
            my = br.uy;
        } else if (br.steer && (mx || my)) {
            const c = Math.cos(br.steer);
            const s = Math.sin(br.steer);
            const nx = mx * c - my * s;
            my = mx * s + my * c;
            mx = nx;
        }
        const len = Math.hypot(mx, my);
        br.input.x = len > 0.01 ? mx / len : 0;
        br.input.y = len > 0.01 ? my / len : 0;

        // ----- Visée (tourne progressivement) -----
        let want = br.wantAim;
        if (want === null) want = len > 0.01 ? Math.atan2(my, mx) : br.aim;
        br.aim = turnToward(br.aim, want, TURN_SPEED * dt);

        bot.update(dt, br.input, this.world, bot.x + Math.cos(br.aim) * 100, bot.y + Math.sin(br.aim) * 100);

        this.shoot(bot, dt, want);

        // ----- Bloqué ? (a très peu bougé en 1,5 s alors qu'il voulait avancer) -----
        br.stuckT += dt;
        if (len > 0.01) br.moveT += dt;
        if (br.stuckT >= STUCK_TIME) {
            const moved = Math.hypot(bot.x - br.sx, bot.y - br.sy);
            if (moved < STUCK_DIST && br.moveT > STUCK_TIME * 0.7) this.unstick(bot);
            br.stuckT = 0;
            br.moveT = 0;
            br.sx = bot.x;
            br.sy = bot.y;
        }
    }

    /* ----- Le "cerveau" : ~4 fois par seconde ----- */

    think(bot, step) {
        if (bot.dbno) return; // Un bot K.O. ne réfléchit pas aux actions de combat
        const br = bot.brain;
        br.lostT -= step;
        br.aimErr = (Math.random() * 2 - 1) * AIM_ERROR;
        br.strafeT -= step;
        if (br.strafeT <= 0) {
            br.strafe = Math.random() < 0.5 ? -1 : 1;
            br.strafeT = rand(0.7, 1.8);
        }

        // 1) Cible visible la plus proche
        this.findTarget(bot);
        const t = br.target;
        const dist = br.targetDist;

        // 0) Allié à terre à réanimer ? (priorité maximale pour sauver le joueur ou l'escouade)
        const downedTeammate = this.fighters.find(f =>
            f !== bot && f.alive && f.dbno && f.team === bot.team
        );
        if (downedTeammate && (!downedTeammate.isBot || !t || dist > 180)) {
            br.state = 'revive';
            br.reviveTarget = downedTeammate;
            br.goal = { x: downedTeammate.x, y: downedTeammate.y };
            this.baseDirection(bot);
            this.computeSteer(bot);
            return;
        } else if (br.state === 'revive' && (!br.reviveTarget || !br.reviveTarget.alive || !br.reviveTarget.dbno)) {
            br.state = 'roam';
            br.reviveTarget = null;
        }

        // 2) Meilleure arme (sans interrompre un soin ou un rechargement)
        const gunSlot = bestGunSlot(bot, t ? dist : null);
        const hasGun = gunSlot > 0;
        if (!bot.usingItem && !(bot.reloadTimer > 0) && bot.slot !== gunSlot) bot.slot = gunSlot;

        // 3) Rechargement : chargeur vide, ou à moitié vide quand c'est calme
        const cur = bot.inventory[bot.slot];
        const w = weaponAt(bot, bot.slot);
        if (w && w.type === 'gun' && !bot.usingItem && !(bot.reloadTimer > 0)) {
            const reserve = bot.ammo[w.ammo] || 0;
            if (reserve > 0 && ((cur.mag || 0) <= 0 || (!t && (cur.mag || 0) < (w.magSize || 1) * 0.6))) {
                this.combat.startReload(bot);
            }
        }

        // 4) Corruption : faut-il rejoindre la zone ? (met à jour br.zoneRush / zoneGoal)
        const rush = this.zoneThink(bot);
        // Ennemi très proche : on se bat (en se rapprochant de la zone), sauf loin dans la corruption
        const close = t && dist < ZONE_FIGHT_DIST && br.stormDepth < ZONE_DEEP;
        if (bot.usingItem && rush && br.inStorm && !this.stormHealOk(bot)) {
            // Soin interrompu (changer de case l'annule aussi dans combat.js) : il faut courir
            bot.usingItem = null;
            bot.slot = gunSlot;
        }

        // 5) Décision
        if (bot.usingItem) {
            br.state = 'heal';
        } else if (rush && !close) {
            // Rejoindre la zone passe avant le pillage et les combats lointains
            // (on tire quand même en courant si une cible est en vue)
            br.state = 'zone';
            br.goal = br.zoneGoal;
            if (!t && this.stormHealOk(bot)) {
                const healSlot = this.pickHeal(bot, br.inStorm);
                if (healSlot > 0) {
                    const prev = bot.slot;
                    bot.slot = healSlot;
                    if (this.combat.startUse(bot)) br.state = 'heal'; // se soigne en marchant vers la zone
                    else bot.slot = prev;
                }
            }
        } else if (t && hasGun) {
            br.state = 'fight';
            br.prefDist = prefDistFor(WEAPONS[bot.inventory[gunSlot].weaponId], br.distMul);
        } else {
            const healSlot = t ? -1 : this.pickHeal(bot);
            if (healSlot > 0) {
                bot.slot = healSlot;
                this.combat.startUse(bot);
                br.state = 'heal';
            } else {
                // Coéquipier de vrais joueurs : reste près du joueur de son équipe le plus proche
                const lead = bot.humanSquad ? this.squadLead(bot, false) : null;
                const pDist = lead ? Math.hypot(lead.x - bot.x, lead.y - bot.y) : 0;
                const lootRadius = bot.humanSquad ? (pDist > 220 ? 280 : LOOT_SEARCH) : (hasGun ? LOOT_BONUS : LOOT_SEARCH);
                const lt = this.updateLootTarget(bot, lootRadius, step);
                const ltDist = lt ? Math.hypot(lt.x - bot.x, lt.y - bot.y) : Infinity;
                if (t && dist < 280 && (dist < 160 || ltDist > dist)) {
                    br.state = 'melee'; // seulement la pioche et la cible est proche : on fonce
                    if (lt && ltDist < 110) this.tryInteract(bot, lt); // ramasse une arme en plein combat
                } else if (lt) {
                    br.state = 'loot';
                    br.goal = lt;
                    this.tryInteract(bot, lt);
                } else if (t) {
                    br.state = 'flee';
                } else {
                    br.state = 'roam';
                    // Cohésion d'escouade : les coéquipiers du joueur restent proches du joueur
                    if (lead && !lead.dbno) {
                        if (pDist > 240) {
                            br.roamGoal = { x: lead.x + rand(-70, 70), y: lead.y + rand(-70, 70) };
                            br.goal = br.roamGoal;
                        } else if (pDist > 140) {
                            if (!br.roamGoal || Math.hypot(br.roamGoal.x - bot.x, br.roamGoal.y - bot.y) < 60) {
                                br.roamGoal = { x: lead.x + rand(-120, 120), y: lead.y + rand(-120, 120) };
                            }
                            br.goal = br.roamGoal;
                        } else {
                            const g = br.roamGoal;
                            if (!g || Math.hypot(g.x - bot.x, g.y - bot.y) < 50 ||
                                !this.inZone(g.x, g.y, ZONE_MARGIN)) br.roamGoal = { x: lead.x + rand(-100, 100), y: lead.y + rand(-100, 100) };
                            br.goal = br.roamGoal;
                        }
                    } else if (this.squadLeaders[bot.team]) {
                        const leader = this.squadLeaders[bot.team];
                        if (leader && leader !== bot && leader.alive && !leader.dbno) {
                            const lDist = Math.hypot(leader.x - bot.x, leader.y - bot.y);
                            if (lDist > 240) {
                                br.roamGoal = { x: leader.x + rand(-70, 70), y: leader.y + rand(-70, 70) };
                                br.goal = br.roamGoal;
                            } else if (lDist > 130) {
                                if (!br.roamGoal || Math.hypot(br.roamGoal.x - bot.x, br.roamGoal.y - bot.y) < 60) {
                                    br.roamGoal = { x: leader.x + rand(-110, 110), y: leader.y + rand(-110, 110) };
                                }
                                br.goal = br.roamGoal;
                            } else {
                                const g = br.roamGoal;
                                if (!g || Math.hypot(g.x - bot.x, g.y - bot.y) < 50 ||
                                    !this.inZone(g.x, g.y, ZONE_MARGIN)) br.roamGoal = { x: leader.x + rand(-100, 100), y: leader.y + rand(-100, 100) };
                                br.goal = br.roamGoal;
                            }
                        } else {
                            if (hasGun && br.lostT > 0 && this.inZone(br.chase.x, br.chase.y, ZONE_MARGIN)) {
                                br.goal = br.chase;
                            } else {
                                const g = br.roamGoal;
                                if (!g || Math.hypot(g.x - bot.x, g.y - bot.y) < 90 ||
                                    !this.inZone(g.x, g.y, ZONE_MARGIN)) br.roamGoal = this.randomPoint(bot, hasGun);
                                br.goal = br.roamGoal;
                            }
                        }
                    } else {
                        if (hasGun && br.lostT > 0 && this.inZone(br.chase.x, br.chase.y, ZONE_MARGIN)) {
                            br.goal = br.chase;
                        } else {
                            const g = br.roamGoal;
                            if (!g || Math.hypot(g.x - bot.x, g.y - bot.y) < 90 ||
                                !this.inZone(g.x, g.y, ZONE_MARGIN)) br.roamGoal = this.randomPoint(bot, hasGun);
                            br.goal = br.roamGoal;
                        }
                    }
                }
            }
        }

        // 6) Évitement des murs et de l'eau profonde ("antennes")
        this.baseDirection(bot);
        this.computeSteer(bot);
    }

    findTarget(bot) {
        const br = bot.brain;
        let c1 = null;
        let d1 = SIGHT * SIGHT;
        let c2 = null;
        let d2 = SIGHT * SIGHT;
        for (const f of this.fighters) {
            if (f === bot || !f.alive || f.phase !== 'ground') continue;
            // Ne JAMAIS cibler les coéquipiers !
            if (bot.team && f.team && bot.team === f.team) continue;
            // Ne pas cibler les joueurs déjà à terre tant qu'il y a des menaces debout
            if (f.dbno) continue;
            const dx = f.x - bot.x;
            const dy = f.y - bot.y;
            const dd = dx * dx + dy * dy;
            if (dd < d1) {
                c2 = c1; d2 = d1;
                c1 = f; d1 = dd;
            } else if (dd < d2) {
                c2 = f; d2 = dd;
            }
        }

        // Au plus 2 lignes de vue testées
        let found = null;
        let fd = 0;
        if (c1 && this.canSee(bot, c1)) { found = c1; fd = d1; }
        else if (c2 && this.canSee(bot, c2)) { found = c2; fd = d2; }

        if (found !== br.target) {
            if (found) {
                br.react = rand(0.3, 0.65);
            } else if (br.target && br.target.alive) {
                br.chase.x = br.target.x;
                br.chase.y = br.target.y;
                br.lostT = 3;
            }
        }
        br.target = found;
        br.targetDist = found ? Math.sqrt(fd) : Infinity;
    }

    canSee(bot, f) {
        return segmentClear(this.world, bot.x, bot.y, f.x, f.y, 0);
    }

    /* ----- Soins ----- */

    // Case du soin le plus utile, ou -1
    // healthOnly : seulement la vie (dans la corruption, le bouclier ne protège pas)
    pickHeal(bot, healthOnly = false) {
        if (bot.health >= 60 && (healthOnly || bot.shield >= 50)) return -1;
        let best = -1;
        let bestGain = 0;
        for (let i = 1; i < bot.inventory.length; i++) {
            const it = bot.inventory[i];
            if (!it || it.kind !== 'heal' || !(it.count > 0)) continue;
            const h = HEALS[it.itemId];
            if (!h) continue;
            let gain = 0;
            if (h.heal && bot.health < 60) gain += Math.max(0, Math.min(h.heal, (h.healCap ?? 100) - bot.health));
            if (!healthOnly && h.shield && bot.shield < 50) {
                gain += Math.max(0, Math.min(h.shield, (h.shieldCap ?? 100) - bot.shield));
            }
            if (gain > bestGain) {
                bestGain = gain;
                best = i;
            }
        }
        return best;
    }

    /* ----- Corruption ----- */

    // Zone de référence : la prochaine zone si elle est annoncée, sinon l'actuelle (null sans corruption)
    zoneRef() {
        const z = this.corruption;
        if (!z || !z.cur) return null;
        if (z.next && (z.state === 'wait' || z.state === 'shrink')) return z.next;
        return z.cur;
    }

    // Rayon "bord intérieur" de la zone (avec marge, jamais sous ZONE_CENTER_OK)
    zoneInner(ref) {
        return Math.max(ref.r - Math.min(ZONE_MARGIN, ref.r * 0.3), ZONE_CENTER_OK);
    }

    // Le point est-il dans la zone de référence réduite de "margin" ? (toujours vrai sans corruption)
    inZone(x, y, margin) {
        const ref = this._ref;
        if (!ref) return true;
        const r = Math.max(ref.r - margin, ZONE_CENTER_OK);
        const dx = x - ref.x;
        const dy = y - ref.y;
        return dx * dx + dy * dy <= r * r;
    }

    // Se soigner pendant qu'on rejoint la zone ? Dans la corruption : seulement vie très basse
    // et presque sorti. Hors corruption : oui, sauf pendant l'avancée (sauf vie basse).
    stormHealOk(bot) {
        const br = bot.brain;
        if (br.inStorm) return bot.health < ZONE_HEAL_HP && br.stormDepth < ZONE_HEAL_DEPTH;
        return this.corruption.state !== 'shrink' || bot.health < ZONE_HEAL_HP;
    }

    /*
       Décision "dois-je rejoindre la zone ?" (appelée par le cerveau, pas à chaque image).
       - déjà sous le bord intérieur de la zone de référence : non
       - dans la corruption : oui, tout de suite
       - sinon (zone annoncée ou en marche) : oui quand le temps de trajet dépasse
         timeLeft × prudence du bot, ou si le bord qui avance arrive sur lui
       Une fois parti, il continue jusqu'à être à l'intérieur (hystérésis).
    */
    zoneThink(bot) {
        const br = bot.brain;
        const z = this.corruption;
        const ref = this._ref;
        br.inStorm = false;
        br.stormDepth = 0;
        if (!ref) {
            br.zoneRush = false;
            return false;
        }
        if (!z.isSafe(bot.x, bot.y)) {
            br.inStorm = true;
            br.stormDepth = z.depth(bot.x, bot.y);
        }

        const dx = bot.x - ref.x;
        const dy = bot.y - ref.y;
        const d2 = dx * dx + dy * dy;
        const inner = this.zoneInner(ref);
        if (d2 <= inner * inner) {
            br.zoneRush = false;
            return false;
        }

        if (!br.zoneRush) {
            let go = br.inStorm;
            if (!go && (z.state === 'wait' || z.state === 'shrink')) {
                const travel = Math.sqrt(d2) - inner;
                if (travel > ZONE_HYST && travel / ZONE_SPEED > (z.timeLeft || 0) * br.prudence) go = true;
                // Le bord de la corruption avance vers lui : il part avant d'être rattrapé
                if (!go && z.state === 'shrink' && z.cur) {
                    const cx = bot.x - z.cur.x;
                    const cy = bot.y - z.cur.y;
                    const edge = z.cur.r - ZONE_SPEED * ZONE_PANIC_TIME;
                    if (edge <= 0 || cx * cx + cy * cy > edge * edge) go = true;
                }
            }
            if (!go) return false;
            br.zoneRush = true;
            br.zoneGoal = null; // nouveau départ : on recalcule le point visé
        }
        this.updateZoneGoal(bot, ref, inner);
        return true;
    }

    // Point visé : sur le segment bot → centre, à ~70-85 % du rayon depuis le centre,
    // tourné d'un petit angle propre au bot. Recalculé seulement si la zone change.
    updateZoneGoal(bot, ref, inner) {
        const br = bot.brain;
        if (br.zoneGoal && Math.abs(br.zr - ref.r) < 40 &&
            Math.abs(br.zx - ref.x) < 40 && Math.abs(br.zy - ref.y) < 40) return;
        br.zx = ref.x;
        br.zy = ref.y;
        br.zr = ref.r;

        // Toujours bien sous le bord intérieur (sinon il atteindrait le point sans être "dedans")
        const rr = Math.max(0, Math.min(ref.r * br.zoneFrac, inner - 40));
        const a = Math.atan2(bot.y - ref.y, bot.x - ref.x) + br.zoneAng;
        const c = Math.cos(a);
        const s = Math.sin(a);
        let goal = null;
        for (const k of [1, 0.6, 0.3]) {
            const x = clamp(ref.x + c * rr * k, this.landMargin, this.world.width - this.landMargin);
            const y = clamp(ref.y + s * rr * k, this.landMargin, this.world.height - this.landMargin);
            if (isLand(this.world, x, y)) {
                goal = { x, y };
                break;
            }
        }
        br.zoneGoal = goal || { x: ref.x, y: ref.y };
    }

    // Point au hasard dans la zone de référence (sur la terre ferme si possible)
    zoneRandomPoint(bot) {
        const ref = this._ref;
        const r = Math.max(0, Math.max(ref.r - ZONE_ROAM_MARGIN, ZONE_CENTER_OK) - 40);
        for (let k = 0; k < 8; k++) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.sqrt(Math.random()) * r;
            const x = clamp(ref.x + Math.cos(a) * d, this.landMargin, this.world.width - this.landMargin);
            const y = clamp(ref.y + Math.sin(a) * d, this.landMargin, this.world.height - this.landMargin);
            if (isLand(this.world, x, y) && this.inZone(x, y, ZONE_ROAM_MARGIN)) return { x, y };
        }
        return { x: ref.x, y: ref.y };
    }

    /* ----- Butin ----- */

    wantsItem(bot, item) {
        const inv = bot.inventory;
        if (item.kind === 'weapon') {
            if (!WEAPONS[item.weaponId]) return false;
            let empty = false;
            let hasGun = false;
            let worst = Infinity;
            for (let i = 1; i < inv.length; i++) {
                const it = inv[i];
                if (!it) { empty = true; continue; }
                if (it.kind !== 'weapon') continue;
                hasGun = true;
                if (it.weaponId === item.weaponId && (it.rarity || 0) >= (item.rarity || 0)) return false;
                worst = Math.min(worst, it.rarity || 0);
            }
            return empty || !hasGun || (item.rarity || 0) > worst;
        }
        if (item.kind === 'ammo') {
            let uses = false;
            for (let i = 1; i < inv.length; i++) {
                const w = weaponAt(bot, i);
                if (w && w.ammo === item.ammoType) uses = true;
            }
            return (bot.ammo[item.ammoType] || 0) < (uses ? 120 : 30);
        }
        if (item.kind === 'heal') {
            // Seulement s'il reste de la place (case vide ou pile pas pleine) :
            // un bot n'échange jamais une arme ou un soin contre un soin
            const stack = HEALS[item.itemId]?.stack || 1;
            for (let i = 1; i < inv.length; i++) {
                const it = inv[i];
                if (!it) return true;
                if (it.kind === 'heal' && it.itemId === item.itemId && it.count < stack) return true;
            }
        }
        return false;
    }

    // Coffre encore fermé / objet encore au sol (drapeaux, au lieu de chercher dans les tableaux)
    lootValid(bot, t) {
        if (bot.brain.ignored.has(t)) return false;
        if (!this.inZone(t.x, t.y, this._lootMargin)) return false; // la corruption l'a rattrapé
        if ('opened' in t) return !t.opened;
        return !t.gone && this.wantsItem(bot, t);
    }

    // Butin le plus proche : seulement les cases de la grille du butin autour du bot
    // (hors de la zone de référence, ou trop près de son bord : ignoré)
    findLoot(bot, range) {
        const ignored = bot.brain.ignored;
        const lm = this._lootMargin;
        const x0 = bot.x - range;
        const y0 = bot.y - range;
        const x1 = bot.x + range;
        const y1 = bot.y + range;
        let best = null;
        let bd = range * range;

        const chests = this.loot.queryChests(x0, y0, x1, y1, _lootList);
        for (let i = 0; i < chests.length; i++) {
            const c = chests[i];
            if (c.opened || ignored.has(c)) continue;
            const dx = c.x - bot.x;
            const dy = c.y - bot.y;
            const dd = dx * dx + dy * dy;
            if (dd < bd && this.inZone(c.x, c.y, lm)) { bd = dd; best = c; }
        }
        const items = this.loot.queryItems(x0, y0, x1, y1, _lootList);
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (ignored.has(it)) continue;
            const dx = it.x - bot.x;
            const dy = it.y - bot.y;
            const dd = dx * dx + dy * dy;
            if (dd < bd && this.inZone(it.x, it.y, lm) && this.wantsItem(bot, it)) { bd = dd; best = it; }
        }
        _lootList.length = 0;
        return best;
    }

    // Garde la même cible de butin, re-cherche environ une fois par seconde
    updateLootTarget(bot, range, step) {
        const br = bot.brain;
        let t = br.lootTarget;
        if (t && !this.lootValid(bot, t)) t = null;
        br.lootSearch -= step;
        if (!t || br.lootSearch <= 0) {
            t = this.findLoot(bot, range);
            br.lootSearch = 1;
        }
        if (t !== br.lootTarget) {
            br.lootTarget = t;
            br.lootTries = 0;
            br.lootStuck = 0;
            br.lootTime = 0;
        }
        if (t) {
            br.lootTime += step;
            if (br.lootTime > 10) { // trop long : on abandonne
                br.ignored.add(t);
                br.lootTarget = null;
                return null;
            }
        }
        return t;
    }

    tryInteract(bot, lt) {
        const br = bot.brain;
        const d = Math.hypot(lt.x - bot.x, lt.y - bot.y);
        if (d > 110) return;
        const n = this.loot.nearestInteractable(bot);
        if (n && n.target === lt) {
            this.loot.interact(bot);
            br.lootTries++;
        } else if (d < 70) {
            br.lootTries++;
        }
        // Toujours là après plusieurs essais (inventaire plein...) : on l'oublie
        if (br.lootTries >= 4) {
            br.ignored.add(lt);
            br.lootTarget = null;
        }
    }

    /* ----- Déplacement ----- */

    // Direction "brute" selon l'état (avant évitement) + angle de visée voulu
    baseDirection(bot) {
        const br = bot.brain;
        const t = br.target;
        br.mx = 0;
        br.my = 0;
        br.wantAim = null;

        const st = br.state;
        if ((st === 'fight' || st === 'melee' || st === 'flee') && t && t.alive) {
            const dx = t.x - bot.x;
            const dy = t.y - bot.y;
            const d = Math.hypot(dx, dy) || 1;
            const ux = dx / d;
            const uy = dy / d;
            const side = br.strafe;
            if (st === 'fight') {
                // Se met à bonne distance + pas chassés sur le côté
                const radial = clamp((d - br.prefDist) / 150, -1, 1);
                br.mx = ux * radial - uy * side * 0.85;
                br.my = uy * radial + ux * side * 0.85;
            } else if (st === 'melee') {
                if (d > bot.r + t.r + 8) { br.mx = ux; br.my = uy; }
            } else {
                br.mx = -ux - uy * side * 0.5;
                br.my = -uy + ux * side * 0.5;
            }
            if (st !== 'flee') br.wantAim = Math.atan2(dy, dx) + br.aimErr;

            // Combat forcé alors qu'il faudrait rejoindre la zone : on se bat en s'y dirigeant
            if (br.zoneRush && br.zoneGoal) {
                const gx = br.zoneGoal.x - bot.x;
                const gy = br.zoneGoal.y - bot.y;
                const gd = Math.hypot(gx, gy);
                if (gd > 12) {
                    br.mx += (gx / gd) * ZONE_PULL;
                    br.my += (gy / gd) * ZONE_PULL;
                }
            }
        } else if ((st === 'loot' || st === 'roam' || st === 'zone' || st === 'revive') && br.goal) {
            const dx = br.goal.x - bot.x;
            const dy = br.goal.y - bot.y;
            const d = Math.hypot(dx, dy);
            if (d > 12) { br.mx = dx / d; br.my = dy / d; }

            if (st === 'revive') {
                br.wantAim = Math.atan2(dy, dx);
            }

            // Vers la zone avec une arme à feu : tire en courant sur la cible en vue
            if (st === 'zone' && t && t.alive) {
                const w = weaponAt(bot, bot.slot);
                if (w && w.type === 'gun') br.wantAim = Math.atan2(t.y - bot.y, t.x - bot.x) + br.aimErr;
            }
        } else if (st === 'heal' && br.zoneRush && br.zoneGoal) {
            // Soin en marchant (vitesse réduite) vers la zone
            const dx = br.zoneGoal.x - bot.x;
            const dy = br.zoneGoal.y - bot.y;
            const d = Math.hypot(dx, dy);
            if (d > 12) { br.mx = dx / d; br.my = dy / d; }
        }
    }

    computeSteer(bot) {
        const br = bot.brain;
        br.steer = 0;
        if (!br.mx && !br.my) return;
        const a0 = Math.atan2(br.my, br.mx);
        const inDeep = isDeep(this.world, bot.x, bot.y);
        for (const off of STEER_OFFSETS) {
            const a = a0 + off * br.steerSide;
            const ex = bot.x + Math.cos(a) * FEELER;
            const ey = bot.y + Math.sin(a) * FEELER;
            if (!inDeep && isDeep(this.world, ex, ey)) continue;
            if (!segmentClear(this.world, bot.x, bot.y, ex, ey, bot.r * 0.6)) continue;
            br.steer = off * br.steerSide;
            return;
        }
    }

    unstick(bot) {
        const br = bot.brain;
        br.strafe = -br.strafe;
        br.steerSide = -br.steerSide;
        const a = Math.random() * Math.PI * 2;
        br.ux = Math.cos(a);
        br.uy = Math.sin(a);
        br.unstuck = rand(0.5, 0.9);
        if (br.state === 'loot' && br.lootTarget) {
            br.lootStuck++;
            if (br.lootStuck >= 3) {
                br.ignored.add(br.lootTarget);
                br.lootTarget = null;
            }
        } else if (br.state === 'roam') {
            br.roamGoal = this.randomPoint(bot, false);
            br.lostT = 0;
        } else if (br.state === 'zone') {
            // Bloqué en rejoignant la zone : autre angle d'approche
            br.zoneAng = rand(-0.9, 0.9);
            br.zoneGoal = null; // recalculé à la prochaine réflexion
        }
    }

    // Point de promenade dans la zone saine (sinon un point au hasard dans la zone)
    randomPoint(bot, hunt) {
        for (let k = 0; k < 2; k++) {
            const p = this.freePoint(bot, hunt);
            if (this.inZone(p.x, p.y, ZONE_ROAM_MARGIN)) return p;
        }
        return this.zoneRandomPoint(bot);
    }

    // Point de promenade : proche, parfois une ville, parfois vers un ennemi (si armé)
    freePoint(bot, hunt) {
        if (hunt && Math.random() < 0.3) {
            let best = null;
            let bd = 2500 * 2500;
            for (const f of this.fighters) {
                if (f === bot || !f.alive || f.phase !== 'ground') continue;
                const dd = (f.x - bot.x) ** 2 + (f.y - bot.y) ** 2;
                if (dd < bd) { bd = dd; best = f; }
            }
            if (best) {
                const x = best.x + rand(-300, 300);
                const y = best.y + rand(-300, 300);
                if (isLand(this.world, x, y)) return { x, y };
            }
        }
        const towns = this.world.towns || [];
        if (towns.length && Math.random() < 0.25) {
            const t = rpick(towns);
            const x = t.x + rand(-0.6, 0.6) * t.radius;
            const y = t.y + rand(-0.6, 0.6) * t.radius;
            if (isLand(this.world, x, y)) return { x, y };
        }
        for (let k = 0; k < 12; k++) {
            const a = Math.random() * Math.PI * 2;
            const d = rand(300, 1300);
            const x = clamp(bot.x + Math.cos(a) * d, this.landMargin, this.world.width - this.landMargin);
            const y = clamp(bot.y + Math.sin(a) * d, this.landMargin, this.world.height - this.landMargin);
            if (isLand(this.world, x, y)) return { x, y };
        }
        return { x: this.world.width / 2, y: this.world.height / 2 };
    }

    /* ----- Tir ----- */

    shoot(bot, dt, wantAim) {
        if (this.isGuest) return; // Seul l'hôte gère les tirs des bots en multijoueur
        const br = bot.brain;
        const t = br.target;
        if (!t || !t.alive || br.react > 0 || br.state === 'flee') return;
        if (bot.usingItem || bot.reloadTimer > 0) return;
        const it = bot.inventory[bot.slot];
        const w = weaponAt(bot, bot.slot);
        if (!w) return;
        if (Math.abs(angleDiff(br.aim, wantAim)) > 0.25) return; // pas encore bien orienté

        const d = Math.hypot(t.x - bot.x, t.y - bot.y);
        if (w.type === 'melee') {
            if (d <= meleeReach(bot, t, w) && br.trigger <= 0) {
                this.combat.tryFire(bot, true);
                br.trigger = rand(0.35, 0.55);
            }
            return;
        }

        if ((it.mag || 0) <= 0 || d > (w.range || SIGHT) * 1.05) return;
        if (w.auto) {
            // Rafales avec de courtes pauses (trigger = pause en cours)
            if (br.trigger > 0) return;
            this.combat.tryFire(bot, true);
            br.burst -= dt;
            if (br.burst <= 0) {
                br.burst = rand(0.5, 1.1);
                br.trigger = rand(0.2, 0.45);
            }
        } else if (br.trigger <= 0) {
            this.combat.tryFire(bot, true);
            br.trigger = weaponRole(w) === 'far' ? rand(0.9, 1.4) : rand(0.32, 0.6);
        }
    }

    /* ===================== DESSIN (coordonnées monde) ===================== */

    // v (optionnel) = bornes de la vue {minX, minY, maxX, maxY} : on ne dessine
    // que les bots en chute visibles (grande marge : le personnage est agrandi en altitude)
    drawAir(ctx, time, v) {
        const m = AIR_DRAW_MARGIN;
        const SQUAD_COLORS = { 1: '#00e5ff', 2: '#ffd21e', 3: '#ff4fd8', 4: '#00ff88' };
        const pr = _airPt;
        for (const bot of this.bots) {
            if (!bot.alive || bot.phase !== 'air') continue;
            // Position en perspective (un bot haut dans le ciel est écarté du centre)
            // drawFalling fait son propre culling (personnage OU ombre au sol visible)
            drawFalling(ctx, bot, time);

            // Coéquipier allié en vol : flèche et nom bien visibles dès le saut
            if (bot.team !== (this.player?.team ?? 1)) continue;
            // Même perspective que le personnage : position décalée et taille x k
            airProject(bot.x, bot.y, fallHeight(bot.altitude), pr);
            if (pr.alpha <= 0) continue;
            if (v && (pr.x < v.minX - m * pr.k || pr.x > v.maxX + m * pr.k ||
                      pr.y < v.minY - m * pr.k || pr.y > v.maxY + m * pr.k)) continue;
            {
                const teamCol = SQUAD_COLORS[bot.squadSlot || 2] || '#ffd21e';
                const bob = Math.sin((time || 0) * 6) * 4;
                const arrowY = -75 + bob;

                ctx.save();
                ctx.globalAlpha *= pr.alpha;
                ctx.translate(pr.x, pr.y);
                ctx.scale(pr.k, pr.k);
                ctx.beginPath();
                ctx.moveTo(-9, arrowY - 10);
                ctx.lineTo(9, arrowY - 10);
                ctx.lineTo(0, arrowY);
                ctx.closePath();
                ctx.fillStyle = teamCol;
                ctx.fill();
                ctx.strokeStyle = OUTLINE;
                ctx.lineWidth = 3;
                ctx.stroke();

                ctx.font = 'bold 14px Rubik, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.lineJoin = 'round';
                ctx.lineWidth = 4;
                ctx.strokeStyle = OUTLINE;
                ctx.strokeText(bot.name, 0, arrowY - 12);
                ctx.fillStyle = teamCol;
                ctx.fillText(bot.name, 0, arrowY - 12);
                ctx.restore();
            }
        }
    }

    // Pseudo + barres bouclier / vie au-dessus de chaque bot au sol
    // v (optionnel) = bornes de la vue : les bots hors écran sont ignorés
    drawLabels(ctx, v, time = 0) {
        const W = 52;
        const H = 5;
        const m = LABEL_MARGIN;
        const SQUAD_COLORS = { 1: '#00e5ff', 2: '#ffd21e', 3: '#ff4fd8', 4: '#00ff88' };
        const list = _labels;
        list.length = 0;
        for (const bot of this.bots) {
            if (!bot.alive || bot.phase !== 'ground') continue;
            if (v && (bot.x < v.minX - m || bot.x > v.maxX + m ||
                      bot.y < v.minY - m || bot.y > v.maxY + m)) continue;
            // Dans une maison dont le toit est fermé pour celui qui regarde : caché
            bot._labelA = 1 - roofAlphaAt(this.world, bot.x, bot.y);
            if (bot._labelA < 0.05) continue;
            list.push(bot);
        }
        if (!list.length) return;

        ctx.save();
        ctx.font = 'bold 15px Rubik, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 4;
        ctx.strokeStyle = OUTLINE;
        for (let i = 0; i < list.length; i++) {
            const bot = list[i];
            const x = bot.x;
            const healthY = bot.y - bot.r - 17;
            const shieldY = healthY - H - 1;
            const bx = x - W / 2;
            ctx.globalAlpha = bot._labelA; // s'efface en même temps que le toit se referme

            const isTeammate = bot.team === (this.player?.team ?? 1);
            const teamCol = SQUAD_COLORS[bot.squadSlot || 2] || '#ffd21e';

            if (isTeammate) {
                // Flèche ▼ animée et très voyante au-dessus du coéquipier
                const bob = Math.sin((time || 0) * 6) * 4;
                const arrowTipY = shieldY - 24 + bob;
                ctx.beginPath();
                ctx.moveTo(x - 9, arrowTipY - 11);
                ctx.lineTo(x + 9, arrowTipY - 11);
                ctx.lineTo(x, arrowTipY);
                ctx.closePath();
                ctx.fillStyle = bot.dbno ? '#ff334b' : teamCol;
                ctx.fill();
                ctx.strokeStyle = OUTLINE;
                ctx.lineWidth = 3.5;
                ctx.stroke();
            }

            if (bot.dbno) {
                // Barre K.O. rouge clignotante avec compte à rebours
                ctx.fillStyle = 'rgba(20, 0, 10, 0.85)';
                ctx.fillRect(bx - 3, shieldY - 2, W + 6, H * 2 + 5);
                ctx.fillStyle = '#ff334b';
                ctx.fillRect(bx, healthY, W * clamp(bot.health / 100, 0, 1), H);

                // Texte au-dessus
                const sec = Math.ceil(bot.dbnoTimer || 0);
                const txt = (bot.reviveProgress || 0) > 0
                    ? `✚ SOIN ${Math.round(bot.reviveProgress / 5 * 100)}%`
                    : `⚠ K.O. (${sec}s)`;
                ctx.strokeText(txt, x, shieldY - 5);
                ctx.fillStyle = (bot.reviveProgress || 0) > 0 ? '#4fd8ff' : '#ffcc00';
                ctx.fillText(txt, x, shieldY - 5);
            } else {
                ctx.fillStyle = 'rgba(10, 16, 48, 0.75)';
                ctx.fillRect(bx - 2, shieldY - 2, W + 4, H * 2 + 5);
                ctx.fillStyle = '#3a8dff';
                ctx.fillRect(bx, shieldY, W * clamp(bot.shield / 100, 0, 1), H);
                ctx.fillStyle = '#3dd66b';
                ctx.fillRect(bx, healthY, W * clamp(bot.health / 100, 0, 1), H);

                const labelText = isTeammate ? `${bot.name}` : bot.name;
                ctx.strokeText(labelText, x, shieldY - 5);
                ctx.fillStyle = isTeammate ? teamCol : '#ffffff';
                ctx.fillText(labelText, x, shieldY - 5);
            }
        }
        ctx.restore();
        list.length = 0;
    }
}
