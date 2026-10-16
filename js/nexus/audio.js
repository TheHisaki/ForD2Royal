/* ==================================
   NEXUS - SONS
   Synthèse Web Audio (aucun fichier à charger), spatialisée :
   le volume et la stéréo dépendent de la position par rapport au joueur.
   Chaque arme et chaque pouvoir a sa propre signature sonore,
   plus des boucles continues (rayons, matrice, capture, pneu, propulseurs…).
   Le bouton « son coupé » du jeu (js/sfx.js) est respecté.
   ================================== */

import { SFX } from '../sfx.js?v=17';

const MASTER = 0.55;
const HEAR = 1700;          // au-delà, on n'entend plus rien
const PAN_W = 900;          // distance horizontale pour une stéréo complète
const MAX_VOICES = 64;

let ctx = null, master = null, comp = null, noiseBuf = null;
let listener = { x: 0, y: 0 };
let voices = 0;
const lastPlay = new Map();
const loops = new Map();

function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(comp).connect(ctx.destination);
    // Bruit blanc partagé (2 s)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
}

function unlock() {
    if (!ensure()) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
}
if (typeof window !== 'undefined') {
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, unlock, { capture: true, passive: true });
}

function muted() {
    try { return SFX.isMuted?.(); } catch { return false; }
}

/* ----- Primitives ----- */

function env(g, t, vol, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.01, dur));
}

function tone(c, { type = 'sine', f0, f1 = f0, dur = 0.1, vol = 0.2, attack = 0.004, delay = 0 }) {
    const t = c.t + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, vol, attack, dur);
    o.connect(g).connect(c.out);
    o.start(t);
    o.stop(t + dur + 0.05);
    track(o, dur + delay);
}

function noise(c, { type = 'bandpass', f0 = 1000, f1 = f0, q = 1, dur = 0.1, vol = 0.2, attack = 0.003, delay = 0 }) {
    const t = c.t + delay;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(Math.max(30, f0), t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    env(g, t, vol, attack, dur);
    s.connect(f).connect(g).connect(c.out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    track(s, dur + delay);
}

function track(node, dur) {
    voices++;
    node.onended = () => { voices = Math.max(0, voices - 1); };
    // Sécurité si onended ne se déclenche pas
    setTimeout(() => {}, (dur + 0.2) * 1000);
}

// Petit carillon (cloche douce) pour les soins et les annonces
function bell(c, f, delay, dur, vol) {
    tone(c, { type: 'sine', f0: f, dur, vol, attack: 0.005, delay });
    tone(c, { type: 'sine', f0: f * 2.01, dur: dur * 0.6, vol: vol * 0.35, attack: 0.005, delay });
}

/* ----- Bibliothèque de sons ----- */

const LIB = {
    /* --- Gorvald --- */
    hammerSwing(c) {
        noise(c, { type: 'bandpass', f0: 500, f1: 2400, q: 0.8, dur: 0.22, vol: 0.32, attack: 0.06 });
        tone(c, { type: 'sine', f0: 140, f1: 60, dur: 0.18, vol: 0.18, delay: 0.12 });
    },
    hammerHit(c) {
        tone(c, { type: 'triangle', f0: 180, f1: 50, dur: 0.22, vol: 0.55 });
        noise(c, { type: 'lowpass', f0: 1800, f1: 300, dur: 0.18, vol: 0.45 });
        tone(c, { type: 'square', f0: 900, f1: 500, dur: 0.05, vol: 0.06 });
    },
    shieldUp(c) {
        tone(c, { type: 'sawtooth', f0: 120, f1: 320, dur: 0.25, vol: 0.12, attack: 0.03 });
        tone(c, { type: 'sine', f0: 640, f1: 960, dur: 0.25, vol: 0.08, attack: 0.05 });
        noise(c, { type: 'highpass', f0: 3000, dur: 0.15, vol: 0.06 });
    },
    shieldDown(c) {
        tone(c, { type: 'sawtooth', f0: 300, f1: 110, dur: 0.2, vol: 0.09 });
    },
    shieldHit(c) {
        tone(c, { type: 'sine', f0: 1500 + Math.random() * 300, f1: 900, dur: 0.09, vol: 0.12 });
        noise(c, { type: 'highpass', f0: 4500, dur: 0.04, vol: 0.06 });
    },
    shieldBreak(c) {
        noise(c, { type: 'highpass', f0: 2500, f1: 800, dur: 0.6, vol: 0.4 });
        for (let i = 0; i < 6; i++) tone(c, { type: 'triangle', f0: 1800 + Math.random() * 2000, f1: 400, dur: 0.25, vol: 0.06, delay: i * 0.04 });
        tone(c, { type: 'sine', f0: 200, f1: 50, dur: 0.4, vol: 0.35 });
    },
    chargeStart(c) {
        tone(c, { type: 'sawtooth', f0: 70, f1: 140, dur: 0.6, vol: 0.2, attack: 0.08 });
        noise(c, { type: 'lowpass', f0: 400, f1: 1500, dur: 0.6, vol: 0.4, attack: 0.1 });
        // Cri de guerre stylisé
        tone(c, { type: 'square', f0: 220, f1: 180, dur: 0.35, vol: 0.05, delay: 0.05 });
    },
    pin(c) {
        tone(c, { type: 'sine', f0: 120, f1: 60, dur: 0.15, vol: 0.4 });
        noise(c, { type: 'lowpass', f0: 900, dur: 0.12, vol: 0.3 });
    },
    slam(c) {
        tone(c, { type: 'sine', f0: 90, f1: 30, dur: 0.6, vol: 0.85 });
        noise(c, { type: 'lowpass', f0: 2500, f1: 200, dur: 0.5, vol: 0.7 });
        noise(c, { type: 'bandpass', f0: 3200, q: 2, dur: 0.15, vol: 0.2 });
    },
    firestrike(c) {
        noise(c, { type: 'bandpass', f0: 700, f1: 2600, q: 0.6, dur: 0.45, vol: 0.45, attack: 0.02 });
        tone(c, { type: 'sawtooth', f0: 90, f1: 220, dur: 0.35, vol: 0.12 });
        noise(c, { type: 'lowpass', f0: 500, dur: 0.5, vol: 0.25, delay: 0.05 });
    },
    earthshatter(c) {
        tone(c, { type: 'sine', f0: 70, f1: 25, dur: 1.2, vol: 1 });
        noise(c, { type: 'lowpass', f0: 3000, f1: 150, dur: 1.2, vol: 0.8 });
        for (let i = 0; i < 8; i++) noise(c, { type: 'bandpass', f0: 600 + Math.random() * 2000, q: 3, dur: 0.08, vol: 0.18, delay: 0.1 + i * 0.07 });
    },

    /* --- Volta --- */
    fusion(c) {
        noise(c, { type: 'bandpass', f0: 2200, f1: 700, q: 0.9, dur: 0.07, vol: 0.28 });
        tone(c, { type: 'square', f0: 260, f1: 90, dur: 0.06, vol: 0.12 });
    },
    boostStart(c) {
        noise(c, { type: 'bandpass', f0: 300, f1: 2000, q: 0.7, dur: 0.5, vol: 0.5, attack: 0.05 });
        tone(c, { type: 'sawtooth', f0: 80, f1: 300, dur: 0.5, vol: 0.12 });
    },
    missile(c) {
        noise(c, { type: 'bandpass', f0: 1500, f1: 3500, q: 1.5, dur: 0.12, vol: 0.15 });
        tone(c, { type: 'sine', f0: 900, f1: 1600, dur: 0.1, vol: 0.04 });
    },
    smallBoom(c) {
        noise(c, { type: 'lowpass', f0: 1800, f1: 300, dur: 0.18, vol: 0.28 });
        tone(c, { type: 'sine', f0: 130, f1: 50, dur: 0.14, vol: 0.25 });
    },
    selfDestruct(c) {
        // Alarme qui monte pendant 3 s
        for (let i = 0; i < 12; i++) {
            tone(c, { type: 'square', f0: 700 + i * 60, dur: 0.1, vol: 0.09, delay: i * 0.25 - i * i * 0.006 });
        }
        tone(c, { type: 'sawtooth', f0: 100, f1: 600, dur: 2.9, vol: 0.1, attack: 2.5 });
    },
    eject(c) {
        tone(c, { type: 'square', f0: 400, f1: 1200, dur: 0.15, vol: 0.12 });
        noise(c, { type: 'highpass', f0: 1500, dur: 0.25, vol: 0.2 });
    },
    mechDown(c) {
        noise(c, { type: 'lowpass', f0: 2000, f1: 200, dur: 0.6, vol: 0.6 });
        tone(c, { type: 'sawtooth', f0: 400, f1: 60, dur: 0.6, vol: 0.18 });
        tone(c, { type: 'sine', f0: 100, f1: 30, dur: 0.5, vol: 0.5 });
    },
    callMech(c) {
        tone(c, { type: 'sine', f0: 200, f1: 900, dur: 0.6, vol: 0.18 });
        noise(c, { type: 'lowpass', f0: 600, dur: 0.3, vol: 0.5, delay: 0.55 });
        tone(c, { type: 'sine', f0: 90, f1: 40, dur: 0.4, vol: 0.6, delay: 0.55 });
        [880, 1108, 1318].forEach((f, i) => bell(c, f, 0.7 + i * 0.07, 0.3, 0.06));
    },
    pilotShot(c) {
        noise(c, { type: 'bandpass', f0: 3200, f1: 1500, q: 1, dur: 0.05, vol: 0.18 });
        tone(c, { type: 'square', f0: 1200, f1: 400, dur: 0.04, vol: 0.05 });
    },

    /* --- Zéphyr --- */
    pulse(c) {
        tone(c, { type: 'square', f0: 1800, f1: 600, dur: 0.035, vol: 0.06 });
        noise(c, { type: 'bandpass', f0: 4000, q: 1.5, dur: 0.03, vol: 0.12 });
    },
    blink(c) {
        noise(c, { type: 'bandpass', f0: 6000, f1: 1200, q: 1.2, dur: 0.16, vol: 0.28 });
        tone(c, { type: 'sine', f0: 2200, f1: 500, dur: 0.14, vol: 0.12 });
    },
    recall(c) {
        // Son « rembobiné » : glissando qui descend avec des clics
        tone(c, { type: 'sawtooth', f0: 1600, f1: 200, dur: 0.6, vol: 0.09 });
        noise(c, { type: 'bandpass', f0: 3000, f1: 400, q: 2, dur: 0.6, vol: 0.2 });
        for (let i = 0; i < 6; i++) tone(c, { type: 'square', f0: 2400 - i * 300, dur: 0.02, vol: 0.05, delay: i * 0.09 });
    },
    stick(c) {
        tone(c, { type: 'sine', f0: 600, f1: 1400, dur: 0.08, vol: 0.2 });
        for (let i = 0; i < 6; i++) tone(c, { type: 'square', f0: 2200, dur: 0.03, vol: 0.06, delay: 0.12 + i * 0.14 - i * i * 0.006 });
    },
    reload(c) {
        noise(c, { type: 'bandpass', f0: 1800, q: 3, dur: 0.04, vol: 0.18 });
        noise(c, { type: 'bandpass', f0: 900, q: 1.5, dur: 0.08, vol: 0.12, delay: 0.12 });
    },
    reloadDone(c) {
        noise(c, { type: 'bandpass', f0: 2200, q: 3, dur: 0.04, vol: 0.22 });
        tone(c, { type: 'triangle', f0: 600, f1: 380, dur: 0.05, vol: 0.1, delay: 0.03 });
    },

    /* --- Kraz --- */
    grenadeLaunch(c) {
        tone(c, { type: 'sine', f0: 260, f1: 120, dur: 0.12, vol: 0.4 });
        noise(c, { type: 'lowpass', f0: 1200, f1: 400, dur: 0.12, vol: 0.3 });
        tone(c, { type: 'triangle', f0: 1400, dur: 0.03, vol: 0.05, delay: 0.02 });
    },
    bounce(c) {
        tone(c, { type: 'triangle', f0: 700 + Math.random() * 200, f1: 350, dur: 0.06, vol: 0.15 });
    },
    mineThrow(c) {
        noise(c, { type: 'bandpass', f0: 1500, f1: 3000, q: 1, dur: 0.15, vol: 0.12 });
        tone(c, { type: 'square', f0: 1800, dur: 0.04, vol: 0.05, delay: 0.1 });
        tone(c, { type: 'square', f0: 1800, dur: 0.04, vol: 0.05, delay: 0.2 });
    },
    mineBoom(c) {
        tone(c, { type: 'sine', f0: 220, f1: 40, dur: 0.35, vol: 0.7 });
        noise(c, { type: 'bandpass', f0: 900, f1: 200, q: 0.8, dur: 0.35, vol: 0.55 });
        noise(c, { type: 'highpass', f0: 3000, dur: 0.06, vol: 0.3 });
    },
    trapSet(c) {
        for (let i = 0; i < 3; i++) noise(c, { type: 'bandpass', f0: 2500 + i * 500, q: 4, dur: 0.03, vol: 0.18, delay: i * 0.06 });
        tone(c, { type: 'triangle', f0: 300, f1: 200, dur: 0.1, vol: 0.12 });
    },
    trapSnap(c) {
        noise(c, { type: 'highpass', f0: 2500, dur: 0.06, vol: 0.6 });
        tone(c, { type: 'square', f0: 900, f1: 300, dur: 0.1, vol: 0.18 });
        for (let i = 0; i < 5; i++) tone(c, { type: 'triangle', f0: 2000 + i * 400, dur: 0.12, vol: 0.04, delay: 0.03 + i * 0.03 });
    },
    tireStart(c) {
        tone(c, { type: 'sawtooth', f0: 60, f1: 180, dur: 0.7, vol: 0.18, attack: 0.1 });
        noise(c, { type: 'bandpass', f0: 400, f1: 1200, q: 1, dur: 0.6, vol: 0.3 });
    },

    /* --- Séraphine --- */
    fly(c) {
        noise(c, { type: 'bandpass', f0: 800, f1: 3500, q: 0.7, dur: 0.35, vol: 0.25, attack: 0.05 });
        [1318, 1568].forEach((f, i) => bell(c, f, 0.05 + i * 0.06, 0.25, 0.05));
    },
    resurrectCast(c) {
        tone(c, { type: 'sine', f0: 440, f1: 880, dur: 1, vol: 0.12, attack: 0.3 });
        noise(c, { type: 'highpass', f0: 5000, dur: 1, vol: 0.04, attack: 0.4 });
    },
    resurrect(c) {
        [523.25, 659.25, 784, 1046.5, 1318.5].forEach((f, i) => bell(c, f, i * 0.07, 0.6, 0.1));
        tone(c, { type: 'sine', f0: 262, dur: 0.9, vol: 0.12, attack: 0.05 });
    },
    valkyrie(c) {
        [392, 523.25, 659.25, 784, 1046.5].forEach((f, i) => bell(c, f, i * 0.09, 1.1, 0.12));
        noise(c, { type: 'bandpass', f0: 600, f1: 4000, q: 0.7, dur: 1, vol: 0.25, attack: 0.2 });
        tone(c, { type: 'sawtooth', f0: 131, dur: 1.4, vol: 0.06, attack: 0.3 });
    },

    /* --- Tempo --- */
    sonic(c) {
        tone(c, { type: 'square', f0: 520 + Math.random() * 60, f1: 260, dur: 0.07, vol: 0.09 });
        tone(c, { type: 'sine', f0: 1040, f1: 600, dur: 0.06, vol: 0.06 });
    },
    soundwave(c) {
        tone(c, { type: 'sine', f0: 90, f1: 40, dur: 0.35, vol: 0.7 });
        noise(c, { type: 'lowpass', f0: 1200, f1: 200, dur: 0.35, vol: 0.45 });
        tone(c, { type: 'square', f0: 180, f1: 70, dur: 0.25, vol: 0.12 });
    },
    trackHeal(c) {
        [659.25, 784, 987.77].forEach((f, i) => bell(c, f, i * 0.05, 0.25, 0.07));
    },
    trackSpeed(c) {
        [987.77, 1318.5, 1760].forEach((f, i) => tone(c, { type: 'square', f0: f, dur: 0.06, vol: 0.05, delay: i * 0.04 }));
    },
    ampItUp(c) {
        tone(c, { type: 'sawtooth', f0: 110, f1: 440, dur: 0.5, vol: 0.12, attack: 0.05 });
        tone(c, { type: 'square', f0: 220, f1: 880, dur: 0.5, vol: 0.05, attack: 0.05 });
        noise(c, { type: 'bandpass', f0: 600, f1: 5000, q: 0.8, dur: 0.5, vol: 0.2 });
    },
    soundBarrier(c) {
        // Grosse « drop » : montée puis basse lourde + accord
        noise(c, { type: 'bandpass', f0: 300, f1: 6000, q: 0.6, dur: 0.7, vol: 0.3, attack: 0.6 });
        tone(c, { type: 'sine', f0: 55, f1: 40, dur: 1.4, vol: 0.9, delay: 0.7 });
        [261.6, 329.6, 392, 523.25].forEach((f) => tone(c, { type: 'sawtooth', f0: f, dur: 1.2, vol: 0.05, attack: 0.05, delay: 0.7 }));
    },

    /* --- Commun --- */
    explosion(c) {
        noise(c, { type: 'highpass', f0: 1800, dur: 0.06, vol: 0.45 });
        tone(c, { type: 'sine', f0: 120, f1: 35, dur: 0.6, vol: 0.85 });
        noise(c, { type: 'lowpass', f0: 2200, f1: 180, dur: 0.6, vol: 0.65 });
        if (!c.lite) for (let i = 0; i < 6; i++) noise(c, { type: 'bandpass', f0: 1500 + Math.random() * 3000, q: 3, dur: 0.04, vol: 0.08, delay: 0.08 + Math.random() * 0.4 });
    },
    bigExplosion(c) {
        noise(c, { type: 'highpass', f0: 1500, dur: 0.1, vol: 0.6 });
        tone(c, { type: 'sine', f0: 80, f1: 22, dur: 1.6, vol: 1 });
        noise(c, { type: 'lowpass', f0: 3000, f1: 120, dur: 1.6, vol: 0.9 });
        noise(c, { type: 'bandpass', f0: 500, f1: 150, q: 0.5, dur: 2.2, vol: 0.4, delay: 0.2 });
        for (let i = 0; i < 10; i++) noise(c, { type: 'bandpass', f0: 1000 + Math.random() * 3000, q: 3, dur: 0.05, vol: 0.1, delay: 0.1 + Math.random() * 0.9 });
    },
    impactWall(c) {
        noise(c, { type: 'bandpass', f0: 2600, f1: 1200, q: 1.4, dur: 0.04, vol: 0.12 });
    },
    hitmarker(c) {
        tone(c, { type: 'square', f0: 1700, dur: 0.035, vol: 0.05 });
        tone(c, { type: 'sine', f0: 2600, dur: 0.05, vol: 0.06, delay: 0.005 });
    },
    critHit(c) {
        tone(c, { type: 'square', f0: 2200, dur: 0.05, vol: 0.07 });
        tone(c, { type: 'sine', f0: 3300, f1: 2800, dur: 0.1, vol: 0.08 });
    },
    hurt(c) {
        tone(c, { type: 'sine', f0: 220, f1: 110, dur: 0.12, vol: 0.18 });
        noise(c, { type: 'lowpass', f0: 600, dur: 0.08, vol: 0.2 });
    },
    kill(c) {
        // « Élimination » : petit son satisfaisant en 2 notes
        tone(c, { type: 'square', f0: 880, dur: 0.06, vol: 0.08 });
        tone(c, { type: 'square', f0: 1318.5, dur: 0.12, vol: 0.08, delay: 0.07 });
        noise(c, { type: 'highpass', f0: 5000, dur: 0.05, vol: 0.06 });
    },
    death(c) {
        tone(c, { type: 'sawtooth', f0: 330, f1: 80, dur: 0.6, vol: 0.12 });
        tone(c, { type: 'sine', f0: 165, f1: 55, dur: 0.7, vol: 0.3 });
    },
    allyDeath(c) {
        tone(c, { type: 'triangle', f0: 440, f1: 220, dur: 0.25, vol: 0.1 });
    },
    respawn(c) {
        [392, 523.25, 784].forEach((f, i) => bell(c, f, i * 0.06, 0.35, 0.07));
    },
    healTick(c) {
        bell(c, 1568 + Math.random() * 200, 0, 0.15, 0.025);
    },
    ultReady(c) {
        [523.25, 659.25, 784, 1046.5].forEach((f, i) => tone(c, { type: 'triangle', f0: f, dur: 0.18, vol: 0.09, delay: i * 0.06 }));
        tone(c, { type: 'sine', f0: 2093, dur: 0.4, vol: 0.05, delay: 0.24 });
    },
    ultAlly(c) {
        tone(c, { type: 'sawtooth', f0: 220, f1: 440, dur: 0.35, vol: 0.08 });
        [440, 554, 659].forEach((f, i) => tone(c, { type: 'triangle', f0: f, dur: 0.3, vol: 0.06, delay: 0.1 + i * 0.05 }));
    },
    ultEnemy(c) {
        tone(c, { type: 'sawtooth', f0: 330, f1: 165, dur: 0.45, vol: 0.12 });
        tone(c, { type: 'square', f0: 311, f1: 155, dur: 0.45, vol: 0.05 });
    },
    pointUnlock(c) {
        noise(c, { type: 'bandpass', f0: 400, f1: 2000, q: 1, dur: 0.4, vol: 0.2 });
        [392, 587.3, 784].forEach((f, i) => tone(c, { type: 'sawtooth', f0: f, dur: 0.5, vol: 0.07, delay: 0.1 + i * 0.12 }));
        tone(c, { type: 'sine', f0: 98, dur: 0.8, vol: 0.3, delay: 0.1 });
    },
    captureAlly(c) {
        [523.25, 659.25, 784, 1046.5].forEach((f, i) => tone(c, { type: 'triangle', f0: f, dur: 0.35, vol: 0.12, delay: i * 0.09 }));
        tone(c, { type: 'sine', f0: 130.8, dur: 0.9, vol: 0.25, delay: 0.27 });
    },
    captureEnemy(c) {
        [523.25, 466.16, 392, 311.13].forEach((f, i) => tone(c, { type: 'sawtooth', f0: f, dur: 0.3, vol: 0.07, delay: i * 0.1 }));
        tone(c, { type: 'sine', f0: 77.8, dur: 0.9, vol: 0.3, delay: 0.3 });
    },
    overtime(c) {
        for (let i = 0; i < 4; i++) tone(c, { type: 'square', f0: i % 2 ? 660 : 880, dur: 0.12, vol: 0.08, delay: i * 0.15 });
    },
    countdown(c, o) {
        tone(c, { type: 'sine', f0: o.final ? 1760 : 880, dur: o.final ? 0.4 : 0.12, vol: 0.1 });
    },
    roundWin(c) {
        [392, 523.25, 659.25, 784, 1046.5].forEach((f, i) => tone(c, { type: 'sawtooth', f0: f, dur: 0.5, vol: 0.06, delay: i * 0.1 }));
        tone(c, { type: 'sine', f0: 130.8, dur: 1.2, vol: 0.3, delay: 0.4 });
    },
    roundLose(c) {
        [392, 311.13, 293.66, 261.6].forEach((f, i) => tone(c, { type: 'sawtooth', f0: f, dur: 0.5, vol: 0.06, delay: i * 0.18 }));
        tone(c, { type: 'sine', f0: 65.4, dur: 1.2, vol: 0.3, delay: 0.5 });
    },
    whoosh(c) {
        noise(c, { type: 'bandpass', f0: 400, f1: 2500, q: 0.8, dur: 0.25, vol: 0.2, attack: 0.05 });
    }
};

// Délai minimal entre deux sons identiques venant d'une même source (évite les mitraillages)
const MIN_GAP = { pulse: 0.045, fusion: 0.07, healTick: 0.25, bounce: 0.05, impactWall: 0.05, hitmarker: 0.05, smallBoom: 0.04, shieldHit: 0.06, missile: 0.05, sonic: 0.03 };

/* ----- API ----- */

export const NexusAudio = {
    setListener(x, y) { listener.x = x; listener.y = y; },

    /** Joue un son. opts : { x, y } (position monde), vol (multiplicateur), ui (pas de spatialisation), src (source pour le délai mini) */
    play(name, opts = {}) {
        const fn = LIB[name];
        if (!fn || muted() || !ensure() || ctx.state !== 'running') return;
        if (voices > MAX_VOICES) return;
        let vol = opts.vol ?? 1;
        let pan = 0;
        if (!opts.ui && Number.isFinite(opts.x)) {
            const dx = opts.x - listener.x, dy = opts.y - listener.y;
            const d = Math.hypot(dx, dy);
            if (d > HEAR) return;
            vol *= Math.pow(1 - d / HEAR, 1.6);
            pan = Math.max(-1, Math.min(1, dx / PAN_W)) * 0.8;
            if (vol < 0.02) return;
        }
        const gap = MIN_GAP[name];
        if (gap) {
            const key = `${name}|${opts.src ?? ''}`;
            const now = ctx.currentTime;
            if (now - (lastPlay.get(key) || 0) < gap) return;
            lastPlay.set(key, now);
        }
        const g = ctx.createGain();
        g.gain.value = vol;
        let out = g;
        if (ctx.createStereoPanner) {
            const p = ctx.createStereoPanner();
            p.pan.value = pan;
            g.connect(p);
            p.connect(master);
        } else {
            g.connect(master);
        }
        try {
            fn({ t: ctx.currentTime + 0.005, out, lite: vol < 0.25 }, opts);
        } catch { /* son facultatif */ }
        setTimeout(() => { try { g.disconnect(); } catch { /* déjà libéré */ } }, 4000);
    },

    /**
     * Boucles continues : à appeler à chaque image avec la liste des boucles actives.
     * Chaque boucle : { id, kind, x, y, vol }. Les boucles absentes s'éteignent en fondu.
     */
    updateLoops(list) {
        if (!ctx || ctx.state !== 'running') return;
        const seen = new Set();
        const silent = muted();
        for (const l of list) {
            seen.add(l.id);
            let lp = loops.get(l.id);
            if (!lp) {
                lp = makeLoop(l.kind);
                if (!lp) continue;
                loops.set(l.id, lp);
            }
            const dx = l.x - listener.x, dy = l.y - listener.y;
            const d = Math.hypot(dx, dy);
            const v = silent ? 0 : (l.vol ?? 1) * Math.max(0, Math.pow(1 - Math.min(1, d / HEAR), 1.6));
            const now = ctx.currentTime;
            lp.gain.gain.setTargetAtTime(v * lp.base, now, 0.06);
            lp.pan?.pan.setTargetAtTime(Math.max(-1, Math.min(1, dx / PAN_W)) * 0.8, now, 0.06);
            lp.update?.(l, now);
        }
        for (const [id, lp] of loops) {
            if (seen.has(id)) continue;
            const now = ctx.currentTime;
            lp.gain.gain.setTargetAtTime(0, now, 0.08);
            loops.delete(id);
            setTimeout(() => { for (const n of lp.nodes) { try { n.stop?.(); n.disconnect(); } catch { /* ok */ } } }, 600);
        }
    },

    stopAll() { this.updateLoops([]); }
};

function makeLoop(kind) {
    const nodes = [];
    const gain = ctx.createGain();
    gain.gain.value = 0;
    let pan = null;
    if (ctx.createStereoPanner) {
        pan = ctx.createStereoPanner();
        gain.connect(pan).connect(master);
    } else gain.connect(master);
    const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); nodes.push(o); return o; };
    const noiseSrc = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(0, Math.random()); nodes.push(s); return s; };
    const filt = (type, f, q = 1) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; nodes.push(b); return b; };
    let base = 0.1;
    let update = null;
    switch (kind) {
        case 'healBeam': case 'ampBeam': {
            // Bourdonnement doux + vibrato
            const f = kind === 'healBeam' ? 660 : 523;
            const a = osc('sine', f), b = osc('sine', f * 1.5);
            const lfo = osc('sine', 6), lg = ctx.createGain(); lg.gain.value = 8; nodes.push(lg);
            lfo.connect(lg); lg.connect(a.frequency); lg.connect(b.frequency);
            const bg = ctx.createGain(); bg.gain.value = 0.4; nodes.push(bg);
            a.connect(gain); b.connect(bg).connect(gain);
            base = 0.045;
            break;
        }
        case 'matrix': {
            const n = noiseSrc(), f = filt('bandpass', 2400, 3);
            const o = osc('sawtooth', 110);
            const og = ctx.createGain(); og.gain.value = 0.25; nodes.push(og);
            n.connect(f).connect(gain); o.connect(og).connect(gain);
            base = 0.12;
            break;
        }
        case 'boost': case 'charge': {
            const n = noiseSrc(), f = filt('lowpass', kind === 'boost' ? 900 : 500, 0.8);
            const o = osc('sawtooth', kind === 'boost' ? 75 : 55);
            const og = ctx.createGain(); og.gain.value = 0.3; nodes.push(og);
            n.connect(f).connect(gain); o.connect(og).connect(gain);
            base = kind === 'boost' ? 0.28 : 0.32;
            break;
        }
        case 'tire': {
            // Moteur qui tourne vite (régime modulé)
            const o = osc('sawtooth', 70), f = filt('lowpass', 900, 2);
            const lfo = osc('square', 18), lg = ctx.createGain(); lg.gain.value = 20; nodes.push(lg);
            lfo.connect(lg).connect(o.frequency);
            o.connect(f).connect(gain);
            base = 0.18;
            break;
        }
        case 'capture': {
            // Tic de capture : son pulsé qui monte avec la progression
            const o = osc('triangle', 440);
            const am = ctx.createGain(); am.gain.value = 0; nodes.push(am);
            const lfo = osc('square', 8), lg = ctx.createGain(); lg.gain.value = 0.5; nodes.push(lg);
            lfo.connect(lg).connect(am.gain);
            o.connect(am).connect(gain);
            base = 0.05;
            update = (l, now) => o.frequency.setTargetAtTime(330 + (l.progress || 0) * 6, now, 0.1);
            break;
        }
        case 'contested': {
            const o = osc('square', 220), o2 = osc('square', 233);
            const f = filt('lowpass', 900);
            o.connect(f); o2.connect(f); f.connect(gain);
            base = 0.025;
            break;
        }
        case 'aura': {
            const o = osc('sine', 98), o2 = osc('sine', 147);
            const lfo = osc('sine', 2), lg = ctx.createGain(); lg.gain.value = 0.5; nodes.push(lg);
            const am = ctx.createGain(); am.gain.value = 0.5; nodes.push(am);
            lfo.connect(lg).connect(am.gain);
            o.connect(am); o2.connect(am); am.connect(gain);
            base = 0.05;
            update = (l, now) => { o.frequency.setTargetAtTime(l.speed ? 131 : 98, now, 0.1); o2.frequency.setTargetAtTime(l.speed ? 196 : 147, now, 0.1); lfo.frequency.setTargetAtTime(l.boost ? 6 : 2, now, 0.1); };
            break;
        }
        case 'mechBomb': {
            const o = osc('square', 600);
            const am = ctx.createGain(); am.gain.value = 0; nodes.push(am);
            const lfo = osc('square', 4), lg = ctx.createGain(); lg.gain.value = 0.5; nodes.push(lg);
            lfo.connect(lg).connect(am.gain);
            o.connect(am).connect(gain);
            base = 0.08;
            update = (l, now) => { lfo.frequency.setTargetAtTime(4 + (1 - l.fuse / 3) * 14, now, 0.05); o.frequency.setTargetAtTime(600 + (1 - l.fuse / 3) * 600, now, 0.05); };
            break;
        }
        default:
            return null;
    }
    return { gain, pan, nodes, base, update };
}
