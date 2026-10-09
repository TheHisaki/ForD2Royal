/* ==================================
   GUN GAME - FOR2D ROYAL
   Progression commune à tous les clients : 20 paliers, 15 combattants maximum.
   Une arme peut revenir avec une autre rareté ; une combinaison arme + rareté ne revient jamais.
   ================================== */

import { LOOT_WEAPONS, WEAPONS } from './weapons.js';

export const GUNGAME_MODE = 'gungame';
export const GUNGAME_MAP_ID = 'gun-game-arena';
export const GUNGAME_MAX_PLAYERS = 15;
export const GUNGAME_STAGE_COUNT = 20;

const stage = (weaponId, rarity) => ({
    weaponId,
    rarity,
    key: `${weaponId}:${rarity}`
});

// Petit RNG isolé : la liste ne dépend pas des autres appels aléatoires du jeu.
function seededRandom(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

// Plus le palier monte, plus la rareté est basse. Chaque groupe mélange ses armes
// avec la seed de la partie : une partie ne reprend donc pas le même ordre.
const RARITY_SCHEDULE = [
    4,
    3, 3, 3, 3,
    2, 2, 2, 2, 2,
    1, 1, 1, 1, 1,
    0, 0, 0, 0, 0
];

export function buildGunGameStages(matchSeed = 1) {
    const rng = seededRandom((Number(matchSeed) ^ 0x47554e47) >>> 0);
    const byRarity = new Map();
    const stages = [];
    for (const rarity of RARITY_SCHEDULE) {
        let pool = byRarity.get(rarity);
        if (!pool || pool.length === 0) {
            pool = shuffle(LOOT_WEAPONS.filter(id => {
                const allowed = WEAPONS[id]?.allowedRarities;
                return !Array.isArray(allowed) || allowed.includes(rarity);
            }), rng);
            byRarity.set(rarity, pool);
        }
        const weaponId = pool.pop();
        stages.push(stage(weaponId, rarity));
    }
    return Object.freeze(stages);
}

// Fallback déterministe avant que main.js installe la seed de la partie.
export const GUNGAME_STAGES = buildGunGameStages(0x2D524F59);

export function isGunGameMode(mode) {
    const m = String(mode || '').toLowerCase().replace(/[ _-]/g, '');
    return m === 'gungame' || m === 'gun-game';
}

let activeStages = GUNGAME_STAGES;

export function setGunGameSeed(matchSeed) {
    activeStages = buildGunGameStages(matchSeed);
    return activeStages;
}

export function gunGameStage(stageIndex) {
    const index = Math.max(0, Math.min(GUNGAME_STAGE_COUNT - 1, Number(stageIndex) | 0));
    return activeStages[index];
}

export function gunGameWeapon(stageIndex) {
    const item = gunGameStage(stageIndex);
    return WEAPONS[item.weaponId] ? item : GUNGAME_STAGES[0];
}

export function gunGameProgressText(stageIndex) {
    return `${Math.max(0, Math.min(GUNGAME_STAGE_COUNT, Number(stageIndex) | 0))}/${GUNGAME_STAGE_COUNT}`;
}
