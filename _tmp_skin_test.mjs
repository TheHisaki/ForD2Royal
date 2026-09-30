// Test temporaire : dessin des skins avec un faux contexte qui refuse les valeurs invalides
import { writeFileSync } from 'node:fs';

const out = [];
const log = (s) => out.push(String(s));
let errors = 0;

function makeCtx() {
    let depth = 0;
    const state = {};
    const check = (name, v) => {
        if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v)) ||
            (typeof v === 'string' && (v.includes('NaN') || v.includes('undefined') || v === ''))) {
            throw new Error(`valeur invalide pour ${name}: ${v}`);
        }
    };
    const target = {
        save() { depth++; },
        restore() { depth--; if (depth < 0) throw new Error('restore sans save'); },
        get depth() { return depth; }
    };
    return new Proxy(target, {
        get(t, k) {
            if (k in t) return t[k];
            if (k === 'globalAlpha' || k === 'lineWidth') return state[k] ?? 1;
            if (typeof k === 'string' && /^[a-z]/.test(k) && !['fillStyle', 'strokeStyle', 'lineCap', 'lineJoin', 'font', 'textAlign'].includes(k)) {
                return (...args) => {
                    args.forEach((a, i) => { if (typeof a === 'number') check(`${k}[${i}]`, a); });
                };
            }
            return state[k];
        },
        set(t, k, v) {
            check(k, v);
            state[k] = v;
            return true;
        }
    });
}

globalThis.document = globalThis.document || {
    createElement() {
        return { width: 0, height: 0, getContext: () => makeCtx() };
    }
};

try {
    const { drawPlayer, drawDying } = await import('./js/game/draw.js');
    const { drawFalling } = await import('./js/game/drop.js');
    const styles = [undefined, 'default', 'knight', 'skeleton', 'ninja', 'astro', 'inconnu'];
    const colors = {
        default: { skin: '#f2c29b', hair: '#3b2415', outfit: '#ff4d5a', pack: '#ffc93c' },
        knight: { skin: '#c8d2de', hair: '#e8323c', outfit: '#9fb0c4', pack: '#b3262e' },
        skeleton: { skin: '#ece6d3', hair: '#ece6d3', outfit: '#1b1426', pack: '#b04cff' },
        ninja: { skin: '#e8b48a', hair: '#12121c', outfit: '#1c1a2e', pack: '#ff2fd0' },
        astro: { skin: '#f4f6fb', hair: '#6fd0ff', outfit: '#f4f6fb', pack: '#ff8a1f' }
    };
    let n = 0;
    for (const st of styles) {
        for (const colSet of [colors[st] || colors.default, undefined, { skin: 'red' }]) {
            for (const flash of [0, 0.3, 1]) {
                for (const time of [0, 1.234, 57.9]) {
                    const ctx = makeCtx();
                    const p = {
                        id: 3, x: 100, y: 200, r: 26, angle: 0.7, colors: colSet, skinStyle: st,
                        hitFlash: flash, moving: flash > 0.5, walkTime: time, phase: 'ground',
                        inventory: [{ kind: 'weapon', weaponId: 'pickaxe', rarity: 0 }], slot: 0
                    };
                    drawPlayer(ctx, p, time);
                    for (const t of [0, 0.2, 0.5, 0.8, 0.99]) {
                        drawDying(ctx, { x: 10, y: 20, r: 26, angle: 1, colors: colSet, skinStyle: st, inventory: p.inventory, slot: 0, t }, time);
                    }
                    for (const alt of [1, 0.8, 0.46, 0.44, 0.4, 0.2, 0.03, 0]) {
                        drawFalling(ctx, { ...p, phase: 'air', altitude: alt, vx: 120, vy: -40 }, time);
                    }
                    if (ctx.depth !== 0) throw new Error(`save/restore déséquilibrés (${ctx.depth}) style=${st}`);
                    n++;
                }
            }
        }
    }
    log(`OK : ${n} combinaisons dessinées sans erreur`);
} catch (e) {
    errors++;
    log('ERREUR : ' + (e.stack || e));
}
writeFileSync(new URL('./_tmp_skin_result.txt', import.meta.url), out.join('\n') + '\n');
process.exit(errors ? 1 : 0);
