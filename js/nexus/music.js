/* ==================================
   NEXUS - MUSIQUE DE SÉLECTION DES HÉROS
   « Apex Vanguard » (fichier à la racine du projet) :
   - démarre en fondu à l'ouverture de la sélection,
   - se coupe progressivement quand les choix sont terminés.
   Les navigateurs bloquent parfois le son tant que la page n'a pas reçu de clic :
   dans ce cas, la musique démarre au premier clic ou à la première touche.
   Le bouton « son coupé » du jeu (js/sfx.js) est respecté.
   ================================== */

const SRC = encodeURI('Apex Vanguard.mp3');
const VOLUME = 0.45;

let audio = null;
let fadeTimer = 0;
let wanted = false;     // la musique doit jouer (sélection en cours)
let waitingGesture = false;

function muted() {
    try { return Boolean(window.SFX?.isMuted?.()); } catch { return false; }
}

function ensure() {
    if (audio) return audio;
    audio = new Audio(SRC);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    return audio;
}

// Fondu du volume actuel vers `to` en `ms` millisecondes, puis callback
function fade(to, ms, done) {
    clearInterval(fadeTimer);
    const a = ensure();
    const from = a.volume;
    const start = performance.now();
    fadeTimer = setInterval(() => {
        const k = Math.min(1, (performance.now() - start) / ms);
        // Courbe douce (le fondu de sortie ne « tombe » pas d'un coup)
        const e = k * k * (3 - 2 * k);
        a.volume = Math.max(0, Math.min(1, from + (to - from) * e));
        if (k >= 1) {
            clearInterval(fadeTimer);
            done?.();
        }
    }, 30);
}

function tryPlay() {
    const a = ensure();
    if (!wanted || muted()) return;
    const p = a.play();
    if (p?.catch) {
        // Si la sélection s'est terminée pendant le démarrage, on ne remonte pas le volume
        p.then(() => { if (wanted) fade(VOLUME, 1200); else a.pause(); }).catch(() => waitForGesture());
    } else {
        fade(VOLUME, 1200);
    }
}

// Lecture refusée (autoplay) : on réessaie au premier geste de l'utilisateur
function waitForGesture() {
    if (waitingGesture) return;
    waitingGesture = true;
    const retry = () => {
        removeEventListener('pointerdown', retry, true);
        removeEventListener('keydown', retry, true);
        waitingGesture = false;
        tryPlay();
    };
    addEventListener('pointerdown', retry, true);
    addEventListener('keydown', retry, true);
}

export const SelectMusic = {
    /** Démarre la musique depuis le début (fondu d'entrée). */
    start() {
        wanted = true;
        const a = ensure();
        clearInterval(fadeTimer);
        try { a.currentTime = 0; } catch { /* pas encore chargée */ }
        a.volume = 0;
        tryPlay();
    },

    /** Coupe la musique progressivement (durée en secondes). */
    fadeOut(seconds = 2.5) {
        // Déjà en train de s'éteindre : on ne relance pas le fondu
        if (!wanted) return;
        wanted = false;
        if (!audio || audio.paused) return;
        fade(0, seconds * 1000, () => audio.pause());
    },

    /** Suit le bouton « son coupé » pendant la sélection. */
    syncMute() {
        if (!audio || !wanted) return;
        if (muted() && !audio.paused) { clearInterval(fadeTimer); audio.pause(); }
        else if (!muted() && audio.paused) tryPlay();
    }
};
