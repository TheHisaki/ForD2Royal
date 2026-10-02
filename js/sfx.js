/* ==========================================
   EFFETS SONORES (WEB AUDIO) - FOR2D ROYAL
   ==========================================
   Tous les sons sont SYNTHÉTISÉS en direct avec la Web Audio API :
   aucun fichier audio, aucune requête réseau.

   API :
   - SFX.play(name, opts)     : son ponctuel (opts.x / opts.y = spatialisation,
                                opts.vol = multiplicateur, + paramètres du son)
   - SFX.setListener(x, y)    : position de l'auditeur (le joueur)
   - SFX.setLoop(name, level) : boucles 'ship' | 'wind' | 'corruption', level 0..1
   - SFX.toggleMute() / SFX.isMuted() / SFX.setMuted(bool)
   - SFX.unlock()             : crée / reprend l'AudioContext
   ========================================== */

const AC = typeof window !== 'undefined'
    ? (window.AudioContext || window.webkitAudioContext || null)
    : null;

const STORAGE_KEY = 'for2d-sfx-muted';
const MASTER_VOL = 0.8;
const MAX_SOURCES = 48;
const DEFAULT_RANGE = 1500;
// En dessous de ce volume (son lointain), les sons fréquents (pas, tirs) utilisent
// une version allégée : moins de nœuds audio, différence inaudible à cette distance
const LITE_GAIN = 0.15;

// Portée d'audition spécifique à certains sons
const RANGES = { step: 650, chestHum: 700, healTick: 700 };

// Délai minimal (ms) entre deux lectures du même son (anti-spam)
const MIN_GAP = {
    impact: 25, hitmarker: 35, hurt: 70, step: 40, pickHit: 40,
    healTick: 150, eliminate: 60, click: 30, hover: 40,
    dryFire: 150, reload: 60, pickup: 40, chestHum: 400,
    // Corruption : un seul son même si l'alerte / le tick est signalé deux fois
    zoneWarn: 1500, zoneShrink: 1500, corruptHit: 300,
    // Écran de fin (XP) : le compteur ne peut pas "mitrailler"
    xpTick: 40, xpLine: 80, levelUp: 600
};

// Sons musicaux : pas de variation de hauteur
const NO_JITTER = new Set([
    'killConfirm', 'victory', 'defeat', 'jumpReady', 'tick', 'ready', 'unready', 'healDone',
    'zoneWarn', 'zoneShrink', 'xpLine', 'levelUp'
]);

// Amplitude du jitter de hauteur par son (défaut 0.05 = ±5 %)
const JITTER = {
    shot: 0.04, step: 0.08, swing: 0.07, impact: 0.07, pickHit: 0.07,
    bird: 0.06, hurt: 0.06, click: 0.04, hover: 0.04
};

/* ---------- État interne ---------- */
let ctx = null;
let master = null;
let sfxBus = null;
let loopBus = null;
let noiseBuf = null;
let loops = null;
let muted = readMuted();
let listenerX = 0;
let listenerY = 0;
let activeSources = 0;

const lastPlay = Object.create(null);
const loopTargets = { ship: 0, wind: 0, corruption: 0 };
const loopApplied = { ship: -1, wind: -1, corruption: -1 };

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
const rand = (a, b) => a + Math.random() * (b - a);
const opt = (v, d) => (v === undefined || v === null ? d : v);
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function readMuted() {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
        return false;
    }
}

function saveMuted() {
    try {
        localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch (e) {
        /* stockage indisponible : on ignore */
    }
}

// Borne une fréquence dans l'intervalle audible du contexte
function fq(f) {
    const nyq = ctx ? ctx.sampleRate * 0.48 : 20000;
    return clamp(Number.isFinite(f) ? f : 440, 10, nyq);
}

/* ==========================================
   CONTEXTE & CHAÎNE DE MIXAGE
   ========================================== */
function buildContext() {
    try {
        ctx = new AC({ latencyHint: 'interactive' });
    } catch (e) {
        ctx = new AC();
    }

    // Compresseur final (anti-saturation)
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOL;
    master.connect(comp);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1;
    sfxBus.connect(master);

    loopBus = ctx.createGain();
    loopBus.gain.value = 1;
    loopBus.connect(master);

    // Buffer de bruit blanc unique (~2 s), partagé par tous les sons
    const len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    ctx.onstatechange = onStateChange;
}

function onStateChange() {
    if (ctx && ctx.state === 'running') ensureLoops();
}

function unlock() {
    try {
        if (!AC) return;
        if (!ctx) buildContext();
        if (!ctx || ctx.state === 'closed') return;
        if (ctx.state === 'running') {
            ensureLoops();
            return;
        }
        const p = ctx.resume();
        if (p && typeof p.then === 'function') p.then(onStateChange, () => {});
    } catch (e) {
        /* audio indisponible : silence */
    }
}

/* ==========================================
   GRAPHE D'UN SON PONCTUEL
   ========================================== */

// Enregistre une source : libère ses nœuds à la fin, puis l'entrée du son
function track(c, src, nodes) {
    c.pending++;
    activeSources++;
    src.onended = () => {
        activeSources = Math.max(0, activeSources - 1);
        c.pending--;
        for (const n of nodes) {
            try { n.disconnect(); } catch (e) { /* déjà déconnecté */ }
        }
        if (c.pending <= 0) dispose(c);
    };
}

function dispose(c) {
    if (c.disposed) return;
    c.disposed = true;
    for (const n of c.chain) {
        try { n.disconnect(); } catch (e) { /* déjà déconnecté */ }
    }
}

// Enveloppe : attaque linéaire puis déclin exponentiel vers 0.0001
function envelope(param, t0, att, dur, vol) {
    param.value = 0;
    param.setValueAtTime(0, t0);
    param.linearRampToValueAtTime(vol, t0 + att);
    param.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

// Filtre biquad avec balayage exponentiel optionnel (f -> f1)
function makeFilter(p, t0, dur, pitch) {
    const f = ctx.createBiquadFilter();
    f.type = p.type || 'lowpass';
    f.frequency.setValueAtTime(fq(opt(p.f, 1000) * pitch), t0);
    if (p.f1 !== undefined && p.f1 !== p.f) {
        f.frequency.exponentialRampToValueAtTime(fq(p.f1 * pitch), t0 + dur);
    }
    f.Q.value = opt(p.q, f.type === 'bandpass' ? 1 : 0.7);
    return f;
}

// Oscillateur + rampe de fréquence + enveloppe
function tone(c, p) {
    const dur = Math.max(0.01, opt(p.dur, 0.1));
    const vol = Math.max(0.0002, opt(p.vol, 0.2));
    const att = Math.min(Math.max(0.001, opt(p.attack, 0.004)), dur * 0.8);
    const t0 = c.t + opt(p.delay, 0);
    const f0 = opt(p.f0, 440);

    const osc = ctx.createOscillator();
    osc.type = p.type || 'sine';
    osc.frequency.setValueAtTime(fq(f0 * c.pitch), t0);
    if (p.f1 !== undefined && p.f1 !== f0) {
        osc.frequency.exponentialRampToValueAtTime(fq(p.f1 * c.pitch), t0 + dur);
    }

    const env = ctx.createGain();
    envelope(env.gain, t0, att, dur, vol);

    const nodes = [osc, env];
    let head = osc;
    if (p.filter) {
        const filt = makeFilter(p.filter, t0, dur, c.pitch);
        osc.connect(filt);
        head = filt;
        nodes.push(filt);
    }
    head.connect(env);
    env.connect(c.out);

    track(c, osc, nodes);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
}

// Bruit blanc filtré + enveloppe
function noise(c, p) {
    const dur = Math.max(0.01, opt(p.dur, 0.1));
    const vol = Math.max(0.0002, opt(p.vol, 0.2));
    const att = Math.min(Math.max(0.001, opt(p.attack, 0.002)), dur * 0.8);
    const t0 = c.t + opt(p.delay, 0);
    const type = p.type || 'bandpass';

    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    const filt = makeFilter({
        type,
        f: opt(p.f0, 1000),
        f1: p.f1,
        q: opt(p.q, type === 'bandpass' ? 1 : 0.7)
    }, t0, dur, c.pitch);

    const env = ctx.createGain();
    envelope(env.gain, t0, att, dur, vol);

    src.connect(filt);
    filt.connect(env);
    env.connect(c.out);

    track(c, src, [src, filt, env]);
    src.start(t0, Math.random() * (noiseBuf.duration - 0.05));
    src.stop(t0 + dur + 0.03);
}

/* ---------- Petits instruments réutilisables ---------- */

// Cloche douce : sinus + harmonique triangle
function bell(c, f, delay, dur, vol) {
    tone(c, { type: 'sine', f0: f, dur, vol, attack: 0.004, delay });
    tone(c, { type: 'triangle', f0: f * 2, dur: dur * 0.6, vol: vol * 0.22, attack: 0.004, delay });
}

// Cuivre synthétique : carrée filtrée + triangle
function brass(c, f, delay, dur, amp = 1, attack = 0.01) {
    tone(c, {
        type: 'square', f0: f, dur, vol: 0.035 * amp, attack, delay,
        filter: { type: 'lowpass', f: f * 4, q: 0.7 }
    });
    tone(c, { type: 'triangle', f0: f, dur, vol: 0.1 * amp, attack, delay });
}

// Petit clic métallique
function metalClick(c, delay, vol, f = 1400) {
    noise(c, { type: 'highpass', f0: 3000, dur: 0.025, vol, delay });
    tone(c, { type: 'square', f0: f, f1: f * 0.75, dur: 0.02, vol: vol * 0.25, delay,
        filter: { type: 'lowpass', f: 4000 } });
}

/* ==========================================
   BANQUE DE SONS
   ========================================== */

// Tirs : corps de bruit filtré + thump grave descendant
const SHOTS = {
    // c.lite = son lointain : on saute les couches les plus discrètes
    pistol(c) {
        noise(c, { type: 'bandpass', f0: 2500, f1: 800, q: 0.8, dur: 0.12, vol: 0.5 });
        noise(c, { type: 'lowpass', f0: 1200, dur: 0.08, vol: 0.3 });
        tone(c, { type: 'triangle', f0: 180, f1: 60, dur: 0.1, vol: 0.45 });
        // Claquement très aigu : coupé de toute façon par le filtre de distance
        if (!c.lite) noise(c, { type: 'highpass', f0: 5000, dur: 0.02, vol: 0.18 });
    },
    smg(c) {
        noise(c, { type: 'bandpass', f0: 3500, f1: 1500, q: 1, dur: 0.07, vol: 0.34 });
        if (!c.lite) {
            tone(c, { type: 'square', f0: 260, f1: 110, dur: 0.05, vol: 0.12,
                filter: { type: 'lowpass', f: 1500 } });
        }
        tone(c, { type: 'sine', f0: 140, f1: 60, dur: 0.06, vol: 0.25 });
    },
    ar(c) {
        noise(c, { type: 'bandpass', f0: 1800, f1: 500, q: 0.8, dur: 0.16, vol: 0.5 });
        noise(c, { type: 'lowpass', f0: 900, dur: 0.12, vol: 0.38 });
        tone(c, { type: 'sine', f0: 120, f1: 45, dur: 0.14, vol: 0.55 });
        if (!c.lite) {
            tone(c, { type: 'square', f0: 200, f1: 70, dur: 0.06, vol: 0.1,
                filter: { type: 'lowpass', f: 1000 } });
        }
    },
    shotgun(c) {
        noise(c, { type: 'lowpass', f0: 2500, f1: 300, dur: 0.35, vol: 0.65 });
        noise(c, { type: 'bandpass', f0: 1200, f1: 300, q: 0.8, dur: 0.25, vol: 0.4 });
        tone(c, { type: 'sine', f0: 90, f1: 35, dur: 0.35, vol: 0.7 });
        tone(c, { type: 'square', f0: 150, f1: 50, dur: 0.12, vol: 0.12,
            filter: { type: 'lowpass', f: 900 } });
        // Pompe "chk-chk"
        noise(c, { type: 'highpass', f0: 2500, dur: 0.04, vol: 0.18, delay: 0.35 });
        tone(c, { type: 'square', f0: 900, f1: 500, dur: 0.03, vol: 0.04, delay: 0.35,
            filter: { type: 'lowpass', f: 3000 } });
        noise(c, { type: 'bandpass', f0: 3000, q: 1.2, dur: 0.05, vol: 0.2, delay: 0.47 });
        tone(c, { type: 'triangle', f0: 600, f1: 350, dur: 0.04, vol: 0.08, delay: 0.47 });
    },
    sniper(c) {
        // Crack aigu
        noise(c, { type: 'highpass', f0: 3000, dur: 0.05, vol: 0.45 });
        // Détonation
        noise(c, { type: 'bandpass', f0: 2000, f1: 400, q: 0.7, dur: 0.25, vol: 0.6 });
        tone(c, { type: 'sine', f0: 80, f1: 30, dur: 0.5, vol: 0.8 });
        tone(c, { type: 'square', f0: 180, f1: 50, dur: 0.15, vol: 0.15,
            filter: { type: 'lowpass', f: 900 } });
        // Queue grave + écho
        noise(c, { type: 'lowpass', f0: 1500, f1: 150, dur: 0.6, vol: 0.45 });
        noise(c, { type: 'lowpass', f0: 600, f1: 200, dur: 0.3, vol: 0.14, attack: 0.02, delay: 0.18 });
        // Clic de culasse
        metalClick(c, 0.55, 0.14, 1200);
        noise(c, { type: 'bandpass', f0: 2500, q: 1.5, dur: 0.05, vol: 0.14, delay: 0.65 });
    }
};

/* ---------- Bruits de pas selon le sol ----------
   Chaque pas = un impact (talon) + une texture propre au sol.
   La hauteur varie déjà de ±8 % à chaque pas (JITTER.step) : pas deux pas identiques. */

// Petits grains (gravier, neige, brindilles) éparpillés dans le pas
function grains(c, n, f0, f1, spread, vol, q = 1.5) {
    for (let i = 0; i < n; i++) {
        noise(c, {
            type: 'bandpass', f0: rand(f0, f1), q,
            dur: rand(0.008, 0.016), vol: vol * rand(0.6, 1), attack: 0.001,
            delay: 0.004 + Math.random() * spread
        });
    }
}

const STEPS = {
    // Herbe : frottement doux et feutré
    grass(c) {
        noise(c, { type: 'bandpass', f0: 1900, f1: 1100, q: 0.7, dur: 0.08, vol: 0.075, attack: 0.008 });
        if (c.lite) return;
        tone(c, { type: 'sine', f0: 85, f1: 55, dur: 0.05, vol: 0.07 });
        noise(c, { type: 'highpass', f0: 3800, dur: 0.05, vol: 0.022, attack: 0.01, delay: 0.02 });
    },

    // Forêt : feuilles mortes qui craquent + parfois une brindille
    forest(c) {
        noise(c, { type: 'bandpass', f0: 1500, f1: 2600, q: 0.9, dur: 0.1, vol: 0.075, attack: 0.01 });
        if (c.lite) return;
        tone(c, { type: 'sine', f0: 80, f1: 50, dur: 0.05, vol: 0.07 });
        grains(c, 3, 2200, 4200, 0.06, 0.035, 2);
        if (Math.random() < 0.25) {
            noise(c, { type: 'bandpass', f0: rand(2600, 3400), q: 5, dur: 0.012, vol: 0.09, delay: rand(0.01, 0.05) });
        }
    },

    // Sable (plage, désert) : glissement sourd et granuleux
    sand(c) {
        noise(c, { type: 'bandpass', f0: 1100, f1: 650, q: 0.6, dur: 0.12, vol: 0.085, attack: 0.02 });
        if (c.lite) return;
        noise(c, { type: 'lowpass', f0: 420, dur: 0.07, vol: 0.06, attack: 0.006 });
        noise(c, { type: 'highpass', f0: 4500, dur: 0.07, vol: 0.018, attack: 0.02, delay: 0.03 });
    },

    // Neige : crissement compact (plein de petits grains) + écrasement grave
    snow(c) {
        noise(c, { type: 'lowpass', f0: 650, f1: 300, dur: 0.09, vol: 0.075, attack: 0.008 });
        if (c.lite) return;
        grains(c, 5, 1600, 3200, 0.07, 0.05, 1.2);
        noise(c, { type: 'bandpass', f0: 2400, q: 0.8, dur: 0.06, vol: 0.025, attack: 0.02, delay: 0.02 });
    },

    // Roche (montagne) : semelle dure qui claque + quelques cailloux
    rock(c) {
        noise(c, { type: 'bandpass', f0: 950, q: 1.2, dur: 0.04, vol: 0.075 });
        if (c.lite) return;
        tone(c, { type: 'triangle', f0: 210, f1: 150, dur: 0.035, vol: 0.05 });
        noise(c, { type: 'highpass', f0: 2600, dur: 0.018, vol: 0.05 });
        grains(c, 2, 2500, 4500, 0.05, 0.03);
    },

    // Place pavée : pas net et sec sur la pierre
    stone(c) {
        noise(c, { type: 'bandpass', f0: 1300, q: 1.4, dur: 0.035, vol: 0.08 });
        if (c.lite) return;
        tone(c, { type: 'triangle', f0: 260, f1: 190, dur: 0.03, vol: 0.045 });
        noise(c, { type: 'highpass', f0: 3200, dur: 0.015, vol: 0.05 });
        tone(c, { type: 'sine', f0: 120, f1: 80, dur: 0.035, vol: 0.05 });
    },

    // Chemin de terre : terre tassée + petits graviers qui roulent
    dirt(c) {
        noise(c, { type: 'bandpass', f0: 800, f1: 500, q: 0.8, dur: 0.07, vol: 0.08, attack: 0.004 });
        if (c.lite) return;
        tone(c, { type: 'sine', f0: 95, f1: 60, dur: 0.045, vol: 0.075 });
        grains(c, 4, 2000, 3800, 0.06, 0.035);
    },

    // Plancher en bois : coup creux qui résonne, et de temps en temps une latte qui grince
    wood(c) {
        tone(c, { type: 'sine', f0: 175, f1: 115, dur: 0.08, vol: 0.12 });
        if (c.lite) return;
        tone(c, { type: 'triangle', f0: 340, f1: 250, dur: 0.045, vol: 0.05 });
        noise(c, { type: 'bandpass', f0: 1100, q: 2, dur: 0.03, vol: 0.06 });
        if (Math.random() < 0.12) {
            tone(c, { type: 'sawtooth', f0: rand(380, 520), f1: rand(330, 450), dur: 0.16, vol: 0.012,
                attack: 0.04, delay: 0.03, filter: { type: 'bandpass', f: 900, q: 3 } });
        }
    },

    // Carrelage (maisons du désert) : petit claquement dur et clair
    tile(c) {
        noise(c, { type: 'highpass', f0: 3000, dur: 0.014, vol: 0.06 });
        if (c.lite) return;
        tone(c, { type: 'triangle', f0: 880, f1: 680, dur: 0.022, vol: 0.03 });
        tone(c, { type: 'sine', f0: 150, f1: 100, dur: 0.035, vol: 0.06 });
        noise(c, { type: 'bandpass', f0: 1600, q: 1.5, dur: 0.03, vol: 0.04 });
    },

    // Champs (blé, cultures) : tiges sèches qui froissent
    crops(c) {
        noise(c, { type: 'bandpass', f0: 3000, f1: 2000, q: 0.6, dur: 0.13, vol: 0.07, attack: 0.015 });
        if (c.lite) return;
        tone(c, { type: 'sine', f0: 85, f1: 55, dur: 0.045, vol: 0.06 });
        noise(c, { type: 'highpass', f0: 5000, dur: 0.09, vol: 0.025, attack: 0.02, delay: 0.02 });
        grains(c, 2, 3500, 5500, 0.08, 0.025, 2);
    },

    // Eau : éclaboussure + petit « bloup » + gouttelettes
    water(c) {
        noise(c, { type: 'bandpass', f0: 800, f1: 2000, q: 0.8, dur: 0.13, vol: 0.09, attack: 0.012 });
        if (c.lite) return;
        tone(c, { type: 'sine', f0: 260, f1: 620, dur: 0.05, vol: 0.05, attack: 0.005 });
        noise(c, { type: 'highpass', f0: 4000, dur: 0.05, vol: 0.03, attack: 0.005, delay: 0.06 });
        grains(c, 2, 3000, 5000, 0.1, 0.025, 3);
    }
};

const IMPACTS = {
    wall(c) {
        noise(c, { type: 'bandpass', f0: 2200, f1: 1000, q: 1.2, dur: 0.05, vol: 0.25 });
        tone(c, { type: 'triangle', f0: 400, f1: 200, dur: 0.04, vol: 0.1 });
        if (Math.random() < 0.25) {
            // Ricochet "piouu"
            tone(c, { type: 'sine', f0: 2600, f1: 900, dur: 0.22, vol: 0.06, attack: 0.01, delay: 0.01 });
        }
    },
    shield(c) {
        tone(c, { type: 'sine', f0: 1900, f1: 1700, dur: 0.25, vol: 0.14 });
        tone(c, { type: 'sine', f0: 2850, dur: 0.18, vol: 0.06 });
        noise(c, { type: 'highpass', f0: 4000, dur: 0.04, vol: 0.07 });
    },
    health(c) {
        noise(c, { type: 'lowpass', f0: 700, dur: 0.07, vol: 0.35 });
        tone(c, { type: 'sine', f0: 150, f1: 80, dur: 0.08, vol: 0.3 });
    }
};

const RELOADS = {
    default(c) {
        // Clic d'éjection + glissement de chargeur + mise en place
        metalClick(c, 0, 0.2, 1100);
        noise(c, { type: 'bandpass', f0: 1200, f1: 2400, q: 2, dur: 0.18, vol: 0.12, attack: 0.06, delay: 0.08 });
        noise(c, { type: 'bandpass', f0: 800, q: 1, dur: 0.04, vol: 0.14, delay: 0.28 });
    },
    shotgun(c) {
        // Cartouche insérée
        noise(c, { type: 'bandpass', f0: 1800, f1: 1000, q: 2, dur: 0.06, vol: 0.18 });
        tone(c, { type: 'triangle', f0: 700, f1: 500, dur: 0.04, vol: 0.08, delay: 0.04 });
        noise(c, { type: 'bandpass', f0: 900, q: 1, dur: 0.04, vol: 0.12, delay: 0.1 });
    },
    sniper(c) {
        // Culasse levée puis tirée
        noise(c, { type: 'bandpass', f0: 2500, q: 3, dur: 0.04, vol: 0.18 });
        noise(c, { type: 'bandpass', f0: 1500, f1: 900, q: 2, dur: 0.12, vol: 0.12, attack: 0.03, delay: 0.06 });
        tone(c, { type: 'square', f0: 600, f1: 400, dur: 0.02, vol: 0.04, delay: 0.2,
            filter: { type: 'lowpass', f: 3000 } });
    }
};

const RELOADS_DONE = {
    default(c) {
        metalClick(c, 0, 0.22, 1400);
        noise(c, { type: 'bandpass', f0: 1800, q: 1.5, dur: 0.04, vol: 0.24, delay: 0.1 });
        tone(c, { type: 'triangle', f0: 500, f1: 350, dur: 0.04, vol: 0.12, delay: 0.1 });
    },
    shotgun(c) {
        // Pompe plus grave, plus espacée
        noise(c, { type: 'bandpass', f0: 1400, q: 1.2, dur: 0.05, vol: 0.24 });
        tone(c, { type: 'triangle', f0: 420, f1: 300, dur: 0.05, vol: 0.1 });
        noise(c, { type: 'bandpass', f0: 2200, q: 1.2, dur: 0.05, vol: 0.24, delay: 0.13 });
        tone(c, { type: 'triangle', f0: 520, f1: 360, dur: 0.05, vol: 0.1, delay: 0.13 });
    },
    sniper(c) {
        // Culasse poussée puis verrouillée
        noise(c, { type: 'bandpass', f0: 1500, f1: 2500, q: 2, dur: 0.08, vol: 0.14, attack: 0.02 });
        metalClick(c, 0.1, 0.22, 1300);
    }
};

const HEAL_STARTS = {
    bandage(c) {
        // Froissement de tissu
        for (let i = 0; i < 6; i++) {
            noise(c, {
                type: 'bandpass', f0: rand(2500, 5000), q: 0.8,
                dur: rand(0.05, 0.1), vol: rand(0.05, 0.09),
                attack: 0.01, delay: i * 0.06 + Math.random() * 0.03
            });
        }
    },
    medkit(c) {
        // Fermeture éclair : série de petits bruits rapides qui montent
        for (let i = 0; i < 14; i++) {
            noise(c, {
                type: 'bandpass', f0: 2500 + i * 110, q: 2,
                dur: 0.012, vol: 0.08, attack: 0.001, delay: i * 0.022
            });
        }
    },
    shieldPotion(c) {
        // Bouchon qui saute + pétillement
        tone(c, { type: 'sine', f0: 700, f1: 250, dur: 0.06, vol: 0.28 });
        noise(c, { type: 'bandpass', f0: 1500, q: 1, dur: 0.03, vol: 0.14 });
        noise(c, { type: 'highpass', f0: 5000, dur: 0.3, vol: 0.03, attack: 0.05, delay: 0.05 });
    }
};

const PICKUPS = {
    weapon(c) {
        noise(c, { type: 'bandpass', f0: 2000, q: 1.5, dur: 0.05, vol: 0.2 });
        tone(c, { type: 'square', f0: 700, f1: 500, dur: 0.04, vol: 0.05,
            filter: { type: 'lowpass', f: 3000 } });
        noise(c, { type: 'highpass', f0: 3000, dur: 0.03, vol: 0.14, delay: 0.07 });
        tone(c, { type: 'triangle', f0: 1200, dur: 0.05, vol: 0.05, delay: 0.07 });
    },
    ammo(c) {
        // Cliquetis de balles
        for (let i = 0; i < 4; i++) {
            const d = i * 0.04 + Math.random() * 0.015;
            tone(c, { type: 'triangle', f0: rand(2800, 4200), dur: 0.04, vol: 0.05, delay: d });
            noise(c, { type: 'highpass', f0: 5000, dur: 0.015, vol: 0.04, delay: d });
        }
    },
    heal(c) {
        tone(c, { type: 'sine', f0: 400, f1: 800, dur: 0.1, vol: 0.15 });
        tone(c, { type: 'sine', f0: 1200, dur: 0.12, vol: 0.04, delay: 0.05 });
    }
};

// Froissement de papier (carte)
function paperRustle(c, count, span) {
    for (let i = 0; i < count; i++) {
        noise(c, {
            type: 'bandpass', f0: rand(1500, 4000), q: 0.7,
            dur: rand(0.04, 0.09), vol: rand(0.05, 0.09),
            attack: 0.008, delay: (i / count) * span + Math.random() * 0.02
        });
    }
}

const SOUNDS = {
    /* ---------- Jeu ---------- */
    shot(c, o) {
        const w = hasOwn(SHOTS, o.weapon) ? o.weapon : 'pistol';
        SHOTS[w](c);
    },

    swing(c) {
        noise(c, { type: 'bandpass', f0: 400, f1: 1800, q: 1.5, dur: 0.18, vol: 0.3, attack: 0.06 });
    },

    pickHit(c) {
        tone(c, { type: 'triangle', f0: 180, f1: 70, dur: 0.12, vol: 0.45 });
        noise(c, { type: 'bandpass', f0: 900, q: 1, dur: 0.06, vol: 0.3 });
    },

    impact(c, o) {
        const k = hasOwn(IMPACTS, o.kind) ? o.kind : 'wall';
        IMPACTS[k](c);
    },

    hitmarker(c, o) {
        if (o.shield) {
            tone(c, { type: 'square', f0: 2200, dur: 0.04, vol: 0.05,
                filter: { type: 'lowpass', f: 5000 } });
            tone(c, { type: 'sine', f0: 3300, dur: 0.05, vol: 0.06 });
        } else {
            tone(c, { type: 'triangle', f0: 1500, f1: 1300, dur: 0.045, vol: 0.12 });
            noise(c, { type: 'highpass', f0: 3000, dur: 0.015, vol: 0.05 });
        }
    },

    killConfirm(c) {
        // "Ding" 2 notes montantes (Mi6 -> Si6)
        bell(c, 1318.5, 0, 0.25, 0.16);
        bell(c, 1975.5, 0.09, 0.45, 0.16);
    },

    hurt(c) {
        tone(c, { type: 'sine', f0: 110, f1: 50, dur: 0.18, vol: 0.45 });
        noise(c, { type: 'lowpass', f0: 900, f1: 300, dur: 0.2, vol: 0.28, attack: 0.01 });
        tone(c, { type: 'square', f0: 90, f1: 55, dur: 0.08, vol: 0.06,
            filter: { type: 'lowpass', f: 600 } });
    },

    dryFire(c) {
        noise(c, { type: 'highpass', f0: 3000, dur: 0.02, vol: 0.2 });
        tone(c, { type: 'square', f0: 1800, f1: 1500, dur: 0.015, vol: 0.04,
            filter: { type: 'lowpass', f: 5000 } });
        noise(c, { type: 'bandpass', f0: 1500, q: 3, dur: 0.03, vol: 0.1, delay: 0.02 });
    },

    reload(c, o) {
        const w = (o.weapon === 'shotgun' || o.weapon === 'sniper') ? o.weapon : 'default';
        RELOADS[w](c);
    },

    reloadDone(c, o) {
        const w = (o.weapon === 'shotgun' || o.weapon === 'sniper') ? o.weapon : 'default';
        RELOADS_DONE[w](c);
    },

    healStart(c, o) {
        const it = hasOwn(HEAL_STARTS, o.item) ? o.item : 'bandage';
        HEAL_STARTS[it](c);
    },

    healTick(c, o) {
        if (o.shield) {
            // Petite bulle
            tone(c, { type: 'sine', f0: rand(450, 600), f1: rand(1000, 1200), dur: 0.08, vol: 0.06, attack: 0.01 });
        } else {
            // Petit carillon doux
            tone(c, { type: 'sine', f0: 1760, dur: 0.3, vol: 0.04 });
            tone(c, { type: 'sine', f0: 2640, dur: 0.2, vol: 0.015 });
        }
    },

    healDone(c, o) {
        if (o.shield) {
            [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(c, f, i * 0.07, 0.35, 0.09));
        } else {
            [523.25, 659.25, 784, 1046.5].forEach((f, i) => {
                tone(c, { type: 'triangle', f0: f, dur: 0.3, vol: 0.12, delay: i * 0.07 });
            });
        }
    },

    chest(c) {
        // Grincement court
        tone(c, { type: 'sawtooth', f0: 180, f1: 260, dur: 0.25, vol: 0.05, attack: 0.03,
            filter: { type: 'bandpass', f: 800, q: 3 } });
        noise(c, { type: 'bandpass', f0: 600, q: 4, dur: 0.2, vol: 0.06, attack: 0.03 });
        // Pluie d'arpèges scintillants (pentatonique)
        const penta = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349.3, 2637, 3136];
        for (let i = 0; i < 10; i++) {
            const f = penta[Math.floor(Math.random() * penta.length)];
            tone(c, { type: 'sine', f0: f, dur: 0.25, vol: 0.05, delay: 0.18 + i * 0.045 });
        }
        noise(c, { type: 'highpass', f0: 6000, dur: 0.6, vol: 0.02, attack: 0.2, delay: 0.18 });
        // Accord final (Do majeur)
        [523.25, 659.25, 784, 1046.5].forEach((f) => {
            tone(c, { type: 'triangle', f0: f, dur: 0.9, vol: 0.06, attack: 0.02, delay: 0.66 });
        });
    },

    chestHum(c) {
        const notes = [2093, 2637, 3136, 3520];
        for (let i = 0; i < 3; i++) {
            const f = notes[Math.floor(Math.random() * notes.length)];
            tone(c, { type: 'sine', f0: f, dur: 0.8, vol: 0.02, attack: 0.01, delay: i * 0.12 });
        }
    },

    pickup(c, o) {
        const k = hasOwn(PICKUPS, o.kind) ? o.kind : 'weapon';
        PICKUPS[k](c);
    },

    slot(c) {
        noise(c, { type: 'highpass', f0: 2500, dur: 0.02, vol: 0.12 });
        tone(c, { type: 'triangle', f0: 1600, f1: 1200, dur: 0.03, vol: 0.05 });
    },

    jump(c) {
        noise(c, { type: 'bandpass', f0: 300, f1: 1500, q: 0.8, dur: 0.5, vol: 0.35, attack: 0.15 });
        noise(c, { type: 'lowpass', f0: 800, dur: 0.45, vol: 0.15, attack: 0.1 });
        tone(c, { type: 'sine', f0: 200, f1: 80, dur: 0.3, vol: 0.12, attack: 0.02 });
    },

    glider(c) {
        // Fwoop de toile
        noise(c, { type: 'bandpass', f0: 1500, f1: 400, q: 1, dur: 0.3, vol: 0.3, attack: 0.02 });
        // Flap
        noise(c, { type: 'lowpass', f0: 1000, f1: 300, dur: 0.08, vol: 0.3, delay: 0.25 });
        tone(c, { type: 'sine', f0: 140, f1: 70, dur: 0.12, vol: 0.2, delay: 0.25 });
        noise(c, { type: 'lowpass', f0: 900, dur: 0.06, vol: 0.15, delay: 0.38 });
    },

    land(c) {
        tone(c, { type: 'sine', f0: 120, f1: 45, dur: 0.22, vol: 0.5 });
        noise(c, { type: 'lowpass', f0: 900, f1: 200, dur: 0.3, vol: 0.3 });
        noise(c, { type: 'bandpass', f0: 2500, q: 0.7, dur: 0.25, vol: 0.06, attack: 0.03, delay: 0.03 });
    },

    // Pas : un son différent selon le sol (o.surface, voir surfaceAt dans js/game/world.js).
    // Pas lointains (c.lite) : seulement la couche principale (moins de nœuds audio)
    step(c, o) {
        const surf = o.water ? 'water' : (hasOwn(STEPS, o.surface) ? o.surface : 'grass');
        STEPS[surf](c);
    },

    eliminate(c) {
        tone(c, { type: 'sine', f0: 900, f1: 300, dur: 0.08, vol: 0.18 });
        noise(c, { type: 'bandpass', f0: 1500, q: 1, dur: 0.04, vol: 0.12 });
        tone(c, { type: 'triangle', f0: 700, f1: 250, dur: 0.35, vol: 0.1, delay: 0.05 });
    },

    playerDown(c) {
        tone(c, { type: 'sawtooth', f0: 220, f1: 55, dur: 1.2, vol: 0.14, attack: 0.01,
            filter: { type: 'lowpass', f: 1200, f1: 200 } });
        tone(c, { type: 'sine', f0: 110, f1: 30, dur: 1.0, vol: 0.4 });
        noise(c, { type: 'lowpass', f0: 400, f1: 80, dur: 1.0, vol: 0.25, attack: 0.02 });
        tone(c, { type: 'square', f0: 330, f1: 165, dur: 0.9, vol: 0.05, delay: 0.05,
            filter: { type: 'lowpass', f: 900 } });
    },

    victory(c) {
        // Montée Sol4 Do5 Mi5 Sol5, relance, puis accord tenu
        [392, 523.25, 659.25, 784].forEach((f, i) => brass(c, f, i * 0.13, 0.16, 1));
        brass(c, 659.25, 0.55, 0.1, 0.9);
        brass(c, 784, 0.66, 0.1, 0.9);
        [523.25, 659.25, 784, 1046.5].forEach((f) => brass(c, f, 0.78, 1.25, 0.8, 0.03));
        tone(c, { type: 'triangle', f0: 130.81, dur: 1.25, vol: 0.18, attack: 0.02, delay: 0.78 });
        noise(c, { type: 'highpass', f0: 6000, dur: 0.8, vol: 0.02, attack: 0.2, delay: 0.78 });
    },

    defeat(c) {
        // Descente mineure Sol4 Mib4 Ré4 -> accord de Do mineur qui retombe
        [392, 311.13, 293.66].forEach((f, i) => brass(c, f, i * 0.26, 0.3, 0.8));
        [261.63, 311.13, 196].forEach((f) => {
            tone(c, { type: 'triangle', f0: f, f1: f * 0.95, dur: 0.75, vol: 0.09, attack: 0.02, delay: 0.78 });
        });
        tone(c, { type: 'square', f0: 261.63, f1: 248.5, dur: 0.75, vol: 0.025, attack: 0.02, delay: 0.78,
            filter: { type: 'lowpass', f: 900 } });
        tone(c, { type: 'sine', f0: 65.41, dur: 0.8, vol: 0.2, attack: 0.02, delay: 0.78 });
    },

    /* ---------- Écran de fin : XP ---------- */

    // Petit tic de compteur. o.rise (0..1) : la note monte au fil du comptage
    xpTick(c, o) {
        const rise = clamp(Number.isFinite(o.rise) ? o.rise : 0, 0, 1);
        const f = 1500 * (1 + rise * 0.6);
        tone(c, { type: 'triangle', f0: f, f1: f * 0.92, dur: 0.03, vol: 0.06 });
        noise(c, { type: 'highpass', f0: 5000, dur: 0.01, vol: 0.02 });
    },

    // Apparition d'une ligne d'XP : petit souffle + note claire
    xpLine(c) {
        noise(c, { type: 'bandpass', f0: 900, f1: 3200, q: 1, dur: 0.14, vol: 0.07, attack: 0.05 });
        bell(c, 1046.5, 0.05, 0.22, 0.08);
        bell(c, 1568, 0.1, 0.25, 0.06);
    },

    // Passage de niveau : arpège montant (Do majeur) puis accord tenu scintillant (~1 s)
    levelUp(c) {
        [523.25, 659.25, 784, 1046.5, 1318.5].forEach((f, i) => {
            brass(c, f, i * 0.07, 0.14, 0.75);
            bell(c, f * 2, i * 0.07, 0.2, 0.05);
        });
        [784, 1046.5, 1318.5, 1568].forEach((f) => brass(c, f, 0.4, 0.62, 0.6, 0.02));
        tone(c, { type: 'triangle', f0: 261.63, dur: 0.62, vol: 0.14, attack: 0.02, delay: 0.4 });
        [2093, 2637, 3136].forEach((f, i) => bell(c, f, 0.45 + i * 0.08, 0.4, 0.04));
        noise(c, { type: 'highpass', f0: 6000, dur: 0.55, vol: 0.02, attack: 0.15, delay: 0.4 });
    },

    /* ---------- Corruption ---------- */

    // Alerte "la corruption se propage" : 3 notes graves (triton inquiétant) + souffle (~1 s)
    zoneWarn(c) {
        const notes = [[146.83, 0, 0.34], [103.83, 0.26, 0.34], [138.59, 0.52, 0.55]];
        for (const [f, d, dur] of notes) {
            tone(c, { type: 'sawtooth', f0: f, f1: f * 0.97, dur, vol: 0.09, attack: 0.02, delay: d,
                filter: { type: 'lowpass', f: 900, f1: 260, q: 2 } });
            tone(c, { type: 'sine', f0: f / 2, dur: dur + 0.1, vol: 0.24, attack: 0.02, delay: d });
        }
        // Harmonique aiguë dissonante, très discrète
        tone(c, { type: 'sine', f0: 587.3, f1: 554.4, dur: 0.6, vol: 0.025, attack: 0.1, delay: 0.5 });
        // Souffle qui enfle
        noise(c, { type: 'bandpass', f0: 250, f1: 1400, q: 0.8, dur: 1.05, vol: 0.14, attack: 0.55 });
    },

    // "La corruption avance" : grondement grave qui monte (~1,5 s)
    zoneShrink(c) {
        tone(c, { type: 'sawtooth', f0: 38, f1: 76, dur: 1.5, vol: 0.16, attack: 0.7,
            filter: { type: 'lowpass', f: 160, f1: 520, q: 1.4 } });
        tone(c, { type: 'sawtooth', f0: 39.2, f1: 78.4, dur: 1.5, vol: 0.12, attack: 0.7,
            filter: { type: 'lowpass', f: 160, f1: 520, q: 1.4 } });
        tone(c, { type: 'sine', f0: 44, f1: 72, dur: 1.5, vol: 0.4, attack: 0.6 });
        noise(c, { type: 'lowpass', f0: 180, f1: 900, dur: 1.5, vol: 0.32, attack: 0.9 });
        // Craquements pendant la montée
        for (let i = 0; i < 4; i++) {
            noise(c, { type: 'bandpass', f0: rand(600, 1400), q: 3, dur: 0.05, vol: 0.05,
                delay: 0.5 + i * 0.22 + Math.random() * 0.08 });
        }
    },

    // Tick de dégâts de corruption : grésillement distordu, court (distinct de 'hurt')
    corruptHit(c) {
        tone(c, { type: 'square', f0: 220, f1: 70, dur: 0.22, vol: 0.07,
            filter: { type: 'bandpass', f: 900, f1: 300, q: 2 } });
        tone(c, { type: 'sawtooth', f0: 233, f1: 74, dur: 0.22, vol: 0.05,
            filter: { type: 'lowpass', f: 1500 } });
        tone(c, { type: 'sine', f0: 90, f1: 45, dur: 0.18, vol: 0.22 });
        // Crépitement : rafale de petits clics de bruit
        for (let i = 0; i < 5; i++) {
            noise(c, { type: 'bandpass', f0: rand(1500, 5000), q: 3, dur: rand(0.015, 0.035),
                vol: rand(0.06, 0.12), delay: i * 0.035 + Math.random() * 0.02 });
        }
    },

    heartbeat(c) {
        tone(c, { type: 'sine', f0: 70, f1: 45, dur: 0.12, vol: 0.45, attack: 0.006 });
        noise(c, { type: 'lowpass', f0: 200, dur: 0.08, vol: 0.05 });
        tone(c, { type: 'sine', f0: 60, f1: 40, dur: 0.14, vol: 0.35, attack: 0.006, delay: 0.18 });
        noise(c, { type: 'lowpass', f0: 180, dur: 0.08, vol: 0.04, delay: 0.18 });
    },

    jumpReady(c) {
        bell(c, 880, 0, 0.5, 0.14);
        bell(c, 1318.5, 0.12, 0.5, 0.14);
    },

    tick(c, o) {
        if (o.final) {
            tone(c, { type: 'sine', f0: 1760, dur: 0.35, vol: 0.14 });
            tone(c, { type: 'triangle', f0: 1760, dur: 0.25, vol: 0.04 });
        } else {
            tone(c, { type: 'sine', f0: 1046.5, dur: 0.09, vol: 0.1 });
        }
    },

    map(c, o) {
        if (o.open) {
            paperRustle(c, 8, 0.35);
            noise(c, { type: 'lowpass', f0: 1000, dur: 0.1, vol: 0.08, delay: 0.3 });
        } else {
            paperRustle(c, 4, 0.15);
        }
    },

    bird(c) {
        const n = 2 + Math.floor(Math.random() * 4);
        let d = 0;
        for (let i = 0; i < n; i++) {
            const dur = rand(0.05, 0.09);
            tone(c, { type: 'sine', f0: rand(2500, 5000), f1: rand(2500, 5000), dur, vol: 0.025, attack: 0.008, delay: d });
            d += rand(0.07, 0.12);
        }
    },

    /* ---------- Interface (lobby) ---------- */
    click(c) {
        tone(c, { type: 'triangle', f0: 1500, f1: 900, dur: 0.04, vol: 0.1 });
        noise(c, { type: 'highpass', f0: 4000, dur: 0.01, vol: 0.04 });
    },

    hover(c) {
        tone(c, { type: 'sine', f0: 2000, dur: 0.03, vol: 0.025 });
    },

    ready(c) {
        const notes = [523.25, 659.25, 784, 1046.5, 1318.5];
        notes.forEach((f, i) => {
            const last = i === notes.length - 1;
            const dur = last ? 0.35 : 0.15;
            tone(c, { type: 'square', f0: f, dur, vol: 0.04, delay: i * 0.05,
                filter: { type: 'lowpass', f: 3000 } });
            tone(c, { type: 'triangle', f0: f, dur, vol: 0.08, delay: i * 0.05 });
        });
    },

    unready(c) {
        tone(c, { type: 'triangle', f0: 784, dur: 0.18, vol: 0.1 });
        tone(c, { type: 'triangle', f0: 523.25, dur: 0.22, vol: 0.1, delay: 0.1 });
    },

    toast(c) {
        tone(c, { type: 'sine', f0: 1318.5, dur: 0.2, vol: 0.08 });
        tone(c, { type: 'sine', f0: 1760, dur: 0.25, vol: 0.08, delay: 0.08 });
    },

    chat(c) {
        tone(c, { type: 'sine', f0: 600, f1: 1300, dur: 0.07, vol: 0.12, attack: 0.005 });
        noise(c, { type: 'bandpass', f0: 2000, q: 1, dur: 0.02, vol: 0.03 });
    },

    mode(c) {
        noise(c, { type: 'bandpass', f0: 800, f1: 3000, q: 1.2, dur: 0.2, vol: 0.08, attack: 0.08 });
        tone(c, { type: 'triangle', f0: 1046.5, dur: 0.25, vol: 0.08, delay: 0.12 });
    },

    launch(c) {
        // Montée
        noise(c, { type: 'bandpass', f0: 300, f1: 3000, q: 1, dur: 1.2, vol: 0.2, attack: 0.9 });
        tone(c, { type: 'sawtooth', f0: 110, f1: 440, dur: 1.1, vol: 0.05, attack: 0.8,
            filter: { type: 'lowpass', f: 400, f1: 3000 } });
        tone(c, { type: 'sine', f0: 220, f1: 880, dur: 1.1, vol: 0.06, attack: 0.8 });
        // Impact final
        tone(c, { type: 'sine', f0: 120, f1: 40, dur: 0.4, vol: 0.3, delay: 1.05 });
        noise(c, { type: 'lowpass', f0: 1500, f1: 200, dur: 0.4, vol: 0.2, delay: 1.05 });
    }
};

/* ==========================================
   LECTURE D'UN SON
   ========================================== */
function play(name, opts = {}) {
    try {
        if (!ctx || ctx.state !== 'running' || muted) return;
        if (typeof name !== 'string' || !hasOwn(SOUNDS, name)) return;
        const o = opts && typeof opts === 'object' ? opts : {};

        // Anti-spam
        const t = nowMs();
        const gap = MIN_GAP[name];
        if (gap && lastPlay[name] !== undefined && t - lastPlay[name] < gap) return;

        let gain = Number.isFinite(o.vol) ? Math.max(0, o.vol) : 1;
        let pan = 0;
        let cutoff = 0;
        let spatial = false;

        // Spatialisation (toutes les sorties anticipées AVANT de créer le moindre nœud)
        if (Number.isFinite(o.x) && Number.isFinite(o.y)) {
            if (activeSources >= MAX_SOURCES) return;
            const dx = o.x - listenerX;
            const dy = o.y - listenerY;
            const d2 = dx * dx + dy * dy;
            const range = RANGES[name] || DEFAULT_RANGE;
            if (d2 >= range * range) return;
            const d = Math.sqrt(d2);
            const k = 1 - d / range;
            gain *= k * k;
            pan = clamp(dx / 800, -1, 1) * 0.8;
            if (pan > -0.03 && pan < 0.03) pan = 0; // inaudible : pas de nœud de panoramique
            // Son lointain : plus étouffé (les pas aussi, ils ont maintenant des aigus selon le sol)
            if (d > 250) cutoff = 800 + 17000 * k * k;
            spatial = true;
        }
        if (gain < 0.01) return;
        lastPlay[name] = t;

        // Graphe d'entrée : gain -> (lowpass) -> (panoramique) -> bus sfx
        const entry = ctx.createGain();
        entry.gain.value = gain;
        const chain = [entry];
        let tail = entry;
        if (cutoff > 0) {
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = fq(cutoff);
            lp.Q.value = 0.7;
            tail.connect(lp);
            tail = lp;
            chain.push(lp);
        }
        if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
            const p = ctx.createStereoPanner();
            p.pan.value = pan;
            tail.connect(p);
            tail = p;
            chain.push(p);
        }
        tail.connect(sfxBus);

        const amp = NO_JITTER.has(name) ? 0 : (JITTER[name] || 0.05);
        const c = {
            t: ctx.currentTime + 0.005,
            out: entry,
            pitch: 1 + (Math.random() * 2 - 1) * amp,
            pending: 0,
            chain,
            disposed: false,
            lite: spatial && gain < LITE_GAIN // son lointain : version allégée
        };
        try {
            SOUNDS[name](c, o);
        } finally {
            if (c.pending <= 0) dispose(c);
        }
    } catch (e) {
        /* un son raté ne doit jamais casser le jeu */
    }
}

function setListener(x, y) {
    if (Number.isFinite(x)) listenerX = x;
    if (Number.isFinite(y)) listenerY = y;
}

/* ==========================================
   BOUCLES CONTINUES (vaisseau, vent, corruption)
   ========================================== */
function loopNoise() {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
}

function lfo(freq, depth, target) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(target);
    o.start();
}

function ensureLoops() {
    if (loops || !ctx || ctx.state !== 'running') return;
    try {
        /* --- Vaisseau : 2 dents de scie désaccordées + bruit grave --- */
        const shipLevel = ctx.createGain();
        shipLevel.gain.value = 0;
        shipLevel.connect(loopBus);
        const shipMod = ctx.createGain();
        shipMod.gain.value = 1;
        shipMod.connect(shipLevel);

        const shipLp = ctx.createBiquadFilter();
        shipLp.type = 'lowpass';
        shipLp.frequency.value = 320;
        shipLp.Q.value = 0.9;
        const oscGain = ctx.createGain();
        oscGain.gain.value = 0.35;
        oscGain.connect(shipLp);
        shipLp.connect(shipMod);
        [55, 55.7].forEach((f) => {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f;
            o.connect(oscGain);
            o.start();
        });

        const shipNoise = loopNoise();
        const shipNLp = ctx.createBiquadFilter();
        shipNLp.type = 'lowpass';
        shipNLp.frequency.value = 500;
        const shipNGain = ctx.createGain();
        shipNGain.gain.value = 0.3;
        shipNoise.connect(shipNLp);
        shipNLp.connect(shipNGain);
        shipNGain.connect(shipMod);
        shipNoise.start(0, Math.random() * 1.9);

        lfo(0.9, 0.12, shipMod.gain);
        lfo(0.23, 60, shipLp.frequency);

        /* --- Vent : bruit bandpass modulé --- */
        const windLevel = ctx.createGain();
        windLevel.gain.value = 0;
        windLevel.connect(loopBus);
        const windMod = ctx.createGain();
        windMod.gain.value = 1;
        windMod.connect(windLevel);

        const windBp = ctx.createBiquadFilter();
        windBp.type = 'bandpass';
        windBp.frequency.value = 500;
        windBp.Q.value = 0.9;
        windBp.connect(windMod);

        const windNoise = loopNoise();
        windNoise.connect(windBp);
        windNoise.start(0, Math.random() * 1.9);

        lfo(0.35, 0.25, windMod.gain);
        lfo(0.17, 90, windBp.frequency);

        /* --- Corruption : 2 dents de scie graves désaccordées + bruit filtré, trémolo --- */
        const corLevel = ctx.createGain();
        corLevel.gain.value = 0;
        corLevel.connect(loopBus);
        const corMod = ctx.createGain();
        corMod.gain.value = 1;
        corMod.connect(corLevel);

        const corLp = ctx.createBiquadFilter();
        corLp.type = 'lowpass';
        corLp.frequency.value = 200;
        corLp.Q.value = 4;
        corLp.connect(corMod);
        const corOscGain = ctx.createGain();
        corOscGain.gain.value = 0.3;
        corOscGain.connect(corLp);
        // Presque un demi-ton d'écart : battement lent et malsain
        [41.2, 43.4].forEach((f) => {
            const o = ctx.createOscillator();
            o.type = 'sawtooth';
            o.frequency.value = f;
            o.connect(corOscGain);
            o.start();
        });

        const corNoise = loopNoise();
        const corBp = ctx.createBiquadFilter();
        corBp.type = 'bandpass';
        corBp.frequency.value = 180;
        corBp.Q.value = 1.2;
        const corNGain = ctx.createGain();
        corNGain.gain.value = 0.35;
        corNoise.connect(corBp);
        corBp.connect(corNGain);
        corNGain.connect(corMod);
        corNoise.start(0, Math.random() * 1.9);

        lfo(2.6, 0.35, corMod.gain);     // trémolo
        lfo(0.13, 70, corLp.frequency);  // le filtre "respire" lentement

        loops = {
            ship: { level: shipLevel },
            wind: { level: windLevel, filter: windBp },
            corruption: { level: corLevel, filter: corLp }
        };
        loopApplied.ship = -1;
        loopApplied.wind = -1;
        loopApplied.corruption = -1;
        applyLoop('ship');
        applyLoop('wind');
        applyLoop('corruption');
    } catch (e) {
        loops = null;
    }
}

// Applique le niveau cible (seulement s'il a changé : appelé chaque image)
function applyLoop(name) {
    const lvl = loopTargets[name];
    if (Math.abs(lvl - loopApplied[name]) < 0.004) return;
    loopApplied[name] = lvl;
    const t = ctx.currentTime;
    if (name === 'ship') {
        loops.ship.level.gain.setTargetAtTime(lvl * 0.45, t, 0.15);
    } else if (name === 'corruption') {
        const co = loops.corruption;
        // Entrée / sortie plus lente que les autres boucles (fondu ~0,4 s), plus ouvert en profondeur
        co.level.gain.setTargetAtTime(0.5 * Math.pow(lvl, 1.2), t, 0.25);
        co.filter.frequency.setTargetAtTime(160 + 280 * lvl, t, 0.25);
    } else {
        const w = loops.wind;
        // Plus fort et plus aigu quand level -> 1
        w.level.gain.setTargetAtTime(0.4 * Math.pow(lvl, 1.4), t, 0.15);
        w.filter.frequency.setTargetAtTime(300 + 800 * lvl, t, 0.15);
    }
}

function setLoop(name, level) {
    try {
        if (!hasOwn(loopTargets, name)) return; // 'ship' | 'wind' | 'corruption'
        let lvl = +level;
        if (!Number.isFinite(lvl)) lvl = 0;
        loopTargets[name] = clamp(lvl, 0, 1);
        if (!ctx || ctx.state !== 'running') return;
        if (!loops) {
            ensureLoops();
            return;
        }
        applyLoop(name);
    } catch (e) {
        /* ignore */
    }
}

/* ==========================================
   COUPURE DU SON
   ========================================== */
function setMuted(value) {
    muted = !!value;
    saveMuted();
    try {
        if (ctx && master) {
            const t = ctx.currentTime;
            // Fige la valeur courante avant la transition (évite un saut)
            master.gain.cancelScheduledValues(t);
            master.gain.setValueAtTime(master.gain.value, t);
            master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, t, 0.05);
        }
    } catch (e) {
        /* ignore */
    }
    return muted;
}

function toggleMute() {
    return setMuted(!muted);
}

function isMuted() {
    return muted;
}

/* ==========================================
   EXPORT
   ========================================== */
export const SFX = {
    play,
    setListener,
    setLoop,
    toggleMute,
    isMuted,
    setMuted,
    unlock
};

if (typeof window !== 'undefined') {
    window.SFX = SFX;
    // Déverrouillage audio au premier geste utilisateur (et après une interruption)
    const listenOpts = { capture: true, passive: true };
    window.addEventListener('pointerdown', unlock, listenOpts);
    window.addEventListener('keydown', unlock, listenOpts);
    window.addEventListener('touchstart', unlock, listenOpts);
}

export default SFX;
