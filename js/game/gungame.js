/* ==================================
   GUN GAME - FOR2D ROYAL
   Progression commune à tous les clients : 20 paliers, 15 combattants maximum.
   Une arme peut revenir avec une autre rareté ; une combinaison arme + rareté ne revient jamais.
   ================================== */

import { WEAPONS } from './weapons.js';

export const GUNGAME_MODE = 'gungame';
export const GUNGAME_MAP_ID = 'gun-game-arena';
export const GUNGAME_MAX_PLAYERS = 15;
export const GUNGAME_STAGE_COUNT = 20;

const stage = (weaponId, rarity) => ({
    weaponId,
    rarity,
    key: `${weaponId}:${rarity}`
});

// 20 combinaisons uniques, classées de la plus forte à la plus faible :
// les premiers paliers donnent les armes rares/puissantes, le dernier reste exigeant.
export const GUNGAME_STAGES = Object.freeze([
    stage('sniper', 3),
    stage('crossbow', 2),
    stage('ar', 2),
    stage('shotgun', 2),
    stage('smg', 2),
    stage('pistol', 2),
    stage('sniper', 1),
    stage('ricochet', 1),
    stage('crossbow', 1),
    stage('ar', 1),
    stage('shotgun', 1),
    stage('smg', 1),
    stage('pistol', 1),
    stage('sniper', 0),
    stage('ricochet', 0),
    stage('crossbow', 0),
    stage('ar', 0),
    stage('shotgun', 0),
    stage('smg', 0),
    stage('pistol', 0)
]);

export function isGunGameMode(mode) {
    const m = String(mode || '').toLowerCase().replace(/[ _-]/g, '');
    return m === 'gungame' || m === 'gun-game';
}

export function gunGameStage(stageIndex) {
    const index = Math.max(0, Math.min(GUNGAME_STAGE_COUNT - 1, Number(stageIndex) | 0));
    return GUNGAME_STAGES[index];
}

export function gunGameWeapon(stageIndex) {
    const item = gunGameStage(stageIndex);
    return WEAPONS[item.weaponId] ? item : GUNGAME_STAGES[0];
}

export function gunGameProgressText(stageIndex) {
    return `${Math.max(0, Math.min(GUNGAME_STAGE_COUNT, Number(stageIndex) | 0))}/${GUNGAME_STAGE_COUNT}`;
}
